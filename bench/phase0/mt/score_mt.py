"""S7: chấm COMET từng chiều, so sánh theo cặp và lấy ngưỡng tỉ lệ token cho hậu xử lý (spec A3, §6.5).

Dùng (môi trường COMET, xem kế hoạch 02):
  python bench/phase0/mt/score_mt.py            # COMET + tỉ lệ token
  python bench/phase0/mt/score_mt.py --no-comet # chỉ tỉ lệ token, không cần torch
Kết quả: bench/phase0/results/s7_mt.json và s7_mt.md.
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


def summarize(rows, scores, items):
    # Bản dịch bị cắt ở số token tối đa (finish_reason "length") là sinh lan man: đếm riêng, không tính vào ngưỡng.
    capped = sum(r.get("finish_reason") == "length" for r in rows)
    kept = [r for r in rows if r.get("finish_reason") != "length"] or rows  # cả chiều đều bị cắt: vẫn tính, để thấy
    ratios = [r["completion_tokens"] / max(r["src_tokens"], 1) for r in kept]
    out = {"n": len(rows), "length_capped": capped,
           "leaked": sum(looks_leaked(items[r["id"]]["src"], r["hyp"]) for r in rows),
           "token_ratio_max": max(ratios), "token_ratio_p99": percentile(ratios, 99),
           # Ngưỡng đề xuất: tỉ lệ lớn nhất đo được, cộng biên 25%, làm tròn lên 0,1.
           "proposed_threshold": math.ceil(max(ratios) * 1.25 * 10) / 10,
           "total_ms_p50": percentile([r["total_ms"] for r in rows], 50)}
    if scores:
        out["comet"] = mean(scores[r["id"]] for r in rows)
    return out


def compare(runs, scores, a, b):
    """So sánh lượt chạy a với b theo từng chiều, chỉ trên các câu có ở cả hai lượt."""
    by_dir = defaultdict(list)
    for i, r in runs[a].items():
        if i in runs[b]:
            by_dir[r["dir"]].append(i)
    out = {}
    for d, ids in sorted(by_dir.items()):
        ms_a = percentile([runs[a][i]["total_ms"] for i in ids], 50)
        ms_b = percentile([runs[b][i]["total_ms"] for i in ids], 50)
        row = {"n": len(ids), "ms_change": ms_a / ms_b - 1,
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-comet", action="store_true")
    args = ap.parse_args()
    items = {it["id"]: it for it in map(json.loads, open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8"))}
    runs = {}
    for path in sorted(glob.glob(os.path.join(DATA, "outputs", "*.jsonl"))):
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
    with open(os.path.join(RESULTS, "s7_mt.json"), "w", encoding="utf-8") as f:
        json.dump({"runs": report, "comparisons": comparisons, "token_ratio_thresholds": thresholds}, f,
                  ensure_ascii=False, indent=1)

    lines = ["## Mốc theo lượt chạy", "",
             "| Lượt chạy | Chiều | Số câu | COMET | Mức sàn (A3) | Tỉ lệ token lớn nhất | Ngưỡng đề xuất | Bị cắt | Nghi lẫn mẫu "
             "| p50 thời gian (ms) |",
             "|---|---|---|---|---|---|---|---|---|---|"]
    for name, per_dir in report.items():
        for d, r in per_dir.items():
            comet_s = f"{r['comet']:.3f}" if "comet" in r else "—"
            lines.append(f"| {name} | {d} | {r['n']} | {comet_s} | {floor_cell(name, d, per_dir)} | "
                         f"{r['token_ratio_max']:.2f} | {r['proposed_threshold']:.1f} | {r['length_capped']} | "
                         f"{r['leaked']} | {r['total_ms_p50']:.0f} |")
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
    with open(os.path.join(RESULTS, "s7_mt.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
