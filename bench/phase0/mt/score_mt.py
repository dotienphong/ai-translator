"""S7: chấm COMET từng chiều, so sánh theo cặp và lấy ngưỡng tỉ lệ token cho hậu xử lý (spec A3, §6.5).

Chấm một lượt mới mà không đụng tới mốc (chống thụt lùi A3, kế hoạch Giai đoạn 1 · 00 mục 6.7):
  python bench/phase0/mt/score_mt.py --outputs bench/phase0/data/mt/outputs-<nhãn> --label <nhãn> \
    --baseline bench/phase0/results/s7_mt.json
Kết quả: bench/phase0/results/s7_mt-<nhãn>.json và .md; bảng cuối so từng chiều với mốc (không thấp hơn quá 0,01). Thêm
`--no-comet` để chỉ tính tỉ lệ token (không cần torch); khi đó không so được với mốc.
chrF++ (spec §11) tự có thêm khi môi trường có `sacrebleu` (`--with sacrebleu==2.6.0`); chỉ để theo dõi, không có mốc hay ngưỡng.

Ghi lại chính mốc S7 (bench/phase0/results/s7_mt.json và s7_mt.md, từ bench/phase0/data/mt/outputs/) phải nói rõ:
  python bench/phase0/mt/score_mt.py --write-baseline
Không có `--label` hay `--write-baseline` thì công cụ từ chối chạy, để không lỡ tay ghi đè mốc.
"""
import argparse
import glob
import json
import math
import os
import random
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")
RESULTS = os.path.join(ROOT, "bench", "phase0", "results")
FLOOR = {"Q8_0": 0.83, "Q4_K_M": 0.80}  # mức sàn Anh→Việt (A3)
CJK_GAP = 0.05  # Trung/Nhật/Hàn→Việt thấp hơn Anh→Việt quá mức này thì xem lại D5 (A3)
REGRESSION = 0.01  # chống thụt lùi A3: mỗi chiều không thấp hơn mốc quá mức này
MARKERS = ("[", "【")  # tiêu đề của mẫu prompt có ngữ cảnh: [Background Information], 【背景信息】


def percentile(values, p):
    v = sorted(values)
    k = (len(v) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def mean(values):
    values = list(values)
    return sum(values) / len(values)


def bootstrap_ci(diffs, n_boot=2000):
    """Khoảng tin cậy 95% của chênh lệch trung bình theo cặp."""
    rng = random.Random(0)
    means = sorted(mean(rng.choices(diffs, k=len(diffs))) for _ in range(n_boot))
    return means[int(0.025 * n_boot)], means[int(0.975 * n_boot) - 1]


def looks_leaked(src, hyp):
    """Bản dịch có dấu hiệu chứa cả phần mẫu prompt hoặc câu ngữ cảnh: xuống dòng hay mở đầu bằng [ 【 mà câu gốc không có."""
    return ("\n" in hyp and "\n" not in src) or (hyp.lstrip().startswith(MARKERS) and not src.lstrip().startswith(MARKERS))


def is_failed(r):
    """Dòng `failed` của `latency-bench mt-eval`: dịch lỗi cả hai lần, `hyp` là câu gốc, không có số đo thời gian."""
    return r.get("finish_reason") == "failed"


def chrf_pp(rows, items):
    """chrF++ toàn chiều (sacrebleu `CHRF(word_order=2)`: n-gram ký tự và từ), thang 0–100 (spec §11).

    `None` khi thiếu `sacrebleu` (thêm `--with sacrebleu==2.6.0` vào lệnh `uv run`) hoặc có dòng không có `ref`. Tính cả
    dòng `failed` (hyp là câu gốc), giống cách tính COMET ở `summarize`.
    """
    try:
        from sacrebleu.metrics import CHRF
    except ImportError:
        return None
    refs = [items[r["id"]].get("ref") for r in rows]
    if not rows or any(ref is None for ref in refs):
        return None
    return CHRF(word_order=2).corpus_score([r["hyp"] for r in rows], [refs]).score


def summarize(rows, scores, items):
    # Bản dịch bị cắt ở số token tối đa (finish_reason "length", chỉ có ở translate.py) là sinh lan man: đếm riêng, không
    # tính vào ngưỡng. Dòng `failed` (mt-eval) cũng đếm riêng: không có tỉ lệ token hay thời gian thật.
    capped = sum(r.get("finish_reason") == "length" for r in rows)
    failed = sum(is_failed(r) for r in rows)
    ok = [r for r in rows if not is_failed(r)]
    kept = [r for r in ok if r.get("finish_reason") != "length"] or ok  # cả chiều đều bị cắt: vẫn tính, để thấy
    ratios = [r["completion_tokens"] / max(r["src_tokens"], 1) for r in kept] or [0.0]
    out = {"n": len(rows), "length_capped": capped, "failed": failed,
           "leaked": sum(looks_leaked(items[r["id"]]["src"], r["hyp"]) for r in rows),
           "token_ratio_max": max(ratios), "token_ratio_p99": percentile(ratios, 99),
           # Ngưỡng đề xuất: tỉ lệ lớn nhất đo được, cộng biên 25%, làm tròn lên 0,1.
           "proposed_threshold": math.ceil(max(ratios) * 1.25 * 10) / 10,
           "total_ms_p50": percentile([r["total_ms"] for r in ok], 50) if ok else None}
    if scores:
        out["comet"] = mean(scores[r["id"]] for r in rows)
    chrf = chrf_pp(rows, items)
    if chrf is not None:
        out["chrf"] = chrf
    return out


def compare(runs, scores, a, b):
    """So sánh lượt chạy a với b theo từng chiều, chỉ trên các câu có ở cả hai lượt."""
    by_dir = defaultdict(list)
    for i, r in runs[a].items():
        if i in runs[b]:
            by_dir[r["dir"]].append(i)
    out = {}
    for d, ids in sorted(by_dir.items()):
        timed = [i for i in ids if not is_failed(runs[a][i]) and not is_failed(runs[b][i])] or ids
        ms_a = percentile([runs[a][i]["total_ms"] for i in timed], 50)
        ms_b = percentile([runs[b][i]["total_ms"] for i in timed], 50)
        row = {"n": len(ids), "ms_change": ms_a / ms_b - 1 if ms_b else 0.0,
               # Bản dịch dài hơn gấp đôi lượt kia: dấu hiệu dịch luôn câu ngữ cảnh hoặc sinh lan man.
               "longer_x2": sum(runs[a][i]["completion_tokens"] > 2 * runs[b][i]["completion_tokens"] for i in ids)}
        if scores:
            diffs = [scores[a][i] - scores[b][i] for i in ids]
            row["comet_diff"] = mean(diffs)
            row["ci95"] = bootstrap_ci(diffs)
        out[d] = row
    return out


def floor_cell(name, d, per_dir):
    """Mức sàn A3, chỉ áp cho lượt chạy không có ngữ cảnh (cấu hình mặc định của app)."""
    quant = next((q for q in FLOOR if q in name), None)
    if not name.endswith("-plain") or quant is None:
        return "—"
    if d == "en->vi":
        floor = FLOOR[quant]
    elif d in ("zh->vi", "ja->vi", "ko->vi") and "comet" in per_dir.get("en->vi", {}):
        floor = per_dir["en->vi"]["comet"] - CJK_GAP
    else:
        return "—"
    if "comet" not in per_dir[d]:
        return f"{floor:.3f} (?)"
    return f"{floor:.3f} ({'đạt' if per_dir[d]['comet'] >= floor else 'KHÔNG ĐẠT'})"


def regression_lines(report, baseline):
    """So COMET từng chiều của các lượt cùng tên với mốc.

    Trả (các dòng Markdown, có chiều nào thụt lùi không, các chỗ không so được). Không so được là lỗi, vì khi đó bảng
    trống mà lệnh vẫn "đạt": lượt này không có lượt nào cùng tên với mốc; một lượt thiếu chiều mà mốc có; hoặc thiếu
    COMET (chấm bằng `--no-comet`) ở chiều mà mốc có. Lượt của mốc mà lượt này không chạy (ví dụ chỉ chạy Q4_K_M-plain)
    thì không tính là thiếu.
    """
    lines = ["", "## So với mốc (chống thụt lùi A3)", "",
             "| Lượt chạy | Chiều | Mốc | Lượt này | Chênh | Kết luận |", "|---|---|---|---|---|---|"]
    regressed, missing = False, []
    matched = [name for name in report if name in baseline["runs"]]
    if not matched:
        missing.append(f"không lượt nào trùng tên với mốc (lượt này: {sorted(report)}, mốc: {sorted(baseline['runs'])})")
    for name in matched:
        per_dir, base = report[name], baseline["runs"][name]
        for d in sorted(base):
            if "comet" not in base[d]:
                continue
            if d not in per_dir:
                missing.append(f"{name}: thiếu chiều {d}")
                continue
            if "comet" not in per_dir[d]:
                missing.append(f"{name} {d}: không có COMET (chấm bằng --no-comet?)")
                continue
            diff = per_dir[d]["comet"] - base[d]["comet"]
            ok = diff >= -REGRESSION
            regressed |= not ok
            lines.append(f"| {name} | {d} | {base[d]['comet']:.3f} | {per_dir[d]['comet']:.3f} | {diff:+.3f} | "
                         f"{'đạt' if ok else 'THỤT LÙI'} |")
    return lines, regressed, missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-comet", action="store_true")
    ap.add_argument("--outputs", default=os.path.join(DATA, "outputs"),
                    help="thư mục JSONL của translate.py hoặc latency-bench mt-eval")
    ap.add_argument("--label", default="",
                    help="nhãn kết quả: ghi s7_mt-<nhãn>.json và .md, không ghi đè mốc s7_mt.json")
    ap.add_argument("--write-baseline", action="store_true",
                    help="ghi lại mốc S7 (s7_mt.json, s7_mt.md) từ bench/phase0/data/mt/outputs/")
    ap.add_argument("--baseline", help="file s7_mt.json làm mốc: thêm bảng so từng chiều")
    args = ap.parse_args()
    if bool(args.label) == args.write_baseline:
        ap.error("cần đúng một trong hai: --label <nhãn> (lượt mới) hoặc --write-baseline (ghi lại mốc S7)")
    if args.write_baseline and os.path.abspath(args.outputs) != os.path.join(DATA, "outputs"):
        ap.error("--write-baseline chỉ chấm bench/phase0/data/mt/outputs/ (kết quả mốc của S7)")
    items = {it["id"]: it for it in map(json.loads, open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8"))}
    runs = {}
    for path in sorted(glob.glob(os.path.join(args.outputs, "*.jsonl"))):
        name = os.path.basename(path).removesuffix(".jsonl")
        runs[name] = {r["id"]: r for r in map(json.loads, open(path, encoding="utf-8"))}
    if not runs:
        raise SystemExit("chưa có kết quả dịch; chạy translate.py trước")

    scores = {}
    if not args.no_comet:
        from comet import download_model, load_from_checkpoint
        model = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
        for name, rows in runs.items():
            ids = list(rows)
            data = [{"src": items[i]["src"], "mt": rows[i]["hyp"], "ref": items[i]["ref"]} for i in ids]
            # num_workers=1: với torch 2.x, num_workers=0 báo lỗi multiprocessing_context (benchmark 2026-09-29).
            pred = model.predict(data, batch_size=16, gpus=0, num_workers=1, progress_bar=False)
            scores[name] = dict(zip(ids, pred.scores))

    report = {}
    for name, rows in runs.items():
        by_dir = defaultdict(list)
        for r in rows.values():
            by_dir[r["dir"]].append(r)
        report[name] = {d: summarize(rs, scores.get(name), items) for d, rs in sorted(by_dir.items())}

    # Giả định 6 (§14): Q4_K_M so với Q8_0. Cờ ngữ cảnh (§6.5): có ngữ cảnh so với không.
    comparisons = {}
    for name in runs:
        if "Q4_K_M" in name and name.replace("Q4_K_M", "Q8_0") in runs:
            comparisons[f"{name} − Q8_0"] = compare(runs, scores, name, name.replace("Q4_K_M", "Q8_0"))
        if name.endswith("-context") and name.removesuffix("-context") + "-plain" in runs:
            comparisons[f"{name} − plain"] = compare(runs, scores, name, name.removesuffix("-context") + "-plain")

    # Ngưỡng lấy từ lượt chạy không có ngữ cảnh (cấu hình mặc định). Có ngữ cảnh, model đôi khi dịch luôn câu
    # ngữ cảnh khi câu gốc ngắn; đó là lỗi mà ngưỡng phải cắt được, nên không đưa vào để tính ngưỡng.
    thresholds = defaultdict(float)
    for name, per_dir in report.items():
        if name.endswith("-plain"):
            for d, r in per_dir.items():
                thresholds[d] = max(thresholds[d], r["proposed_threshold"])

    os.makedirs(RESULTS, exist_ok=True)
    stem = f"s7_mt-{args.label}" if args.label else "s7_mt"
    with open(os.path.join(RESULTS, f"{stem}.json"), "w", encoding="utf-8") as f:
        json.dump({"runs": report, "comparisons": comparisons, "token_ratio_thresholds": thresholds}, f,
                  ensure_ascii=False, indent=1)

    lines = ["## Mốc theo lượt chạy", "",
             "| Lượt chạy | Chiều | Số câu | COMET | chrF++ | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | Bị cắt "
             "| Lỗi | Nghi lẫn mẫu | p50 thời gian (ms) |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for name, per_dir in report.items():
        for d, r in per_dir.items():
            comet_s = f"{r['comet']:.3f}" if "comet" in r else "—"
            chrf_s = f"{r['chrf']:.1f}" if "chrf" in r else "—"
            ms_s = f"{r['total_ms_p50']:.0f}" if r["total_ms_p50"] is not None else "—"
            lines.append(f"| {name} | {d} | {r['n']} | {comet_s} | {chrf_s} | {floor_cell(name, d, per_dir)} | "
                         f"{r['token_ratio_max']:.2f} | {r['proposed_threshold']:.1f} | {r['length_capped']} | "
                         f"{r['failed']} | {r['leaked']} | {ms_s} |")
    lines += ["", "## So sánh theo cặp (cùng tập câu)", "",
              "| So sánh | Chiều | Số câu | Chênh COMET | 95% CI | Chênh p50 thời gian | Số câu dài gấp đôi |",
              "|---|---|---|---|---|---|---|"]
    for label, per_dir in comparisons.items():
        for d, r in per_dir.items():
            diff_s = f"{r['comet_diff']:+.3f}" if "comet_diff" in r else "—"
            ci_s = f"[{r['ci95'][0]:+.3f}, {r['ci95'][1]:+.3f}]" if "ci95" in r else "—"
            lines.append(f"| {label} | {d} | {r['n']} | {diff_s} | {ci_s} | {r['ms_change']:+.0%} | {r['longer_x2']} |")
    lines += ["", "## Ngưỡng tỉ lệ token đề xuất cho §6.5 (từ các lượt chạy không có ngữ cảnh)", "",
              "| Chiều | Ngưỡng |", "|---|---|"]
    lines += [f"| {d} | {v:.1f} |" for d, v in sorted(thresholds.items())]
    regressed, missing = False, []
    if args.baseline:
        extra, regressed, missing = regression_lines(report, json.load(open(args.baseline, encoding="utf-8")))
        lines += extra + [f"- Không so được: {m}" for m in missing]
    with open(os.path.join(RESULTS, f"{stem}.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))
    if missing:
        raise SystemExit("không so được với mốc: " + "; ".join(missing))
    if regressed:
        raise SystemExit("có chiều thấp hơn mốc quá 0,01: không commit thay đổi gây ra nó, báo chủ dự án (mục 6.7)")


if __name__ == "__main__":
    main()
