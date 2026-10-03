"""Cổng số liệu của nghiệm thu (spec §3.3): A2 độ trễ, A3 chất lượng dịch, A4 nhận dạng giọng nói.

- `a2`: file JSON của `latency-bench latency` của **một máy** (mỗi file một session, `run_matrix.py`). Dùng lại đúng luật của
  `bench/phase0/latency/summarize.py` (ngưỡng `A2`, lượt đo không đáng tin `problems`, lượt tắt ghép câu không tính). Gói lấy
  từ `config.mt_model`, `config.asr_model`; hạng máy lấy từ nhãn và đối chiếu với `machine` (macOS: RAM ≥ 16 GB là khuyến
  nghị; Windows không ghi GPU nên chỉ kiểm RAM của hạng khuyến nghị), mâu thuẫn là lỗi. Hạng khuyến nghị cần đủ 6 session
  của gói Chuẩn, hạng tối thiểu đủ 6 session của gói Nhẹ (§8); trùng session hay nhiều máy trong một lượt cổng là lỗi.
- `a3`: kết quả `bench/phase0/mt/score_mt.py --label <nhãn>` (`s7_mt-<nhãn>.json`), so mốc `s7_mt.json` bằng chính hàm
  `regression_lines` của `score_mt.py` (thấp hơn mốc quá 0,01 là thụt lùi), cộng mức sàn Anh→Việt; mọi lượt `-plain` của
  mốc (hai gói) phải có mặt, và mỗi chiều chấm đủ số câu của mốc.
- `a4`: kết quả `bench/phase0/asr/score_asr.py` (`a4_<nhãn>.json`), nhận cả hai mốc `a4_m4pro-{turbo,small}-final.json`.
  Kết quả không ghi model, nên gói suy từ chính số đo: mốc nào gần hơn (trung bình |ln(kết quả/mốc)| trên các nhóm). Rồi
  mỗi nhóm không xấu hơn mốc của gói đó quá 10% tương đối.

Mỗi lệnh in bảng Markdown, ghi JSON (`--out`) cho `report.py`, và trả mã thoát 1 nếu không đạt.
"""
import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "phase0", "mt"))
sys.path.insert(0, os.path.join(HERE, "..", "..", "phase0", "latency"))
import summarize  # noqa: E402
from score_mt import regression_lines  # noqa: E402

# A3: mức sàn Anh→Việt theo gói, cho lượt không có ngữ cảnh (cấu hình mặc định, tên lượt kết thúc bằng `-plain`); lượt
# có ngữ cảnh là cờ thử nghiệm, chỉ so mốc.
FLOORS = {"Q8_0": 0.83, "Q4_K_M": 0.80}
# A4: không xấu hơn mốc quá 10% (tương đối).
A4_RELATIVE = 0.10


SESSIONS = ("en", "vi", "zh", "ja", "ko", "mixed")
PACK_OF_TIER = {"khuyennghi": "chuan", "toithieu": "nhe"}


def tier_of(label):
    """Hạng máy trong nhãn, như `summarize.py`."""
    return next((t for t in summarize.A2 if f"-{t}-" in label), None)


def pack_of(config):
    """Gói từ model của lượt đo: Chuẩn (Q8_0, turbo) hay Nhẹ (Q4_K_M, small)."""
    mt, asr = config.get("mt_model", ""), config.get("asr_model", "")
    if "Q8_0" in mt and "turbo" in asr:
        return "chuan"
    if "Q4_K_M" in mt and "small" in asr:
        return "nhe"
    return None


def machine_of(m):
    return f"{m.get('os', '?')} | {m.get('cpu', '?')} | {m.get('ram_gb', '?')} GB | {m.get('logical_cores', '?')} lõi"


def tier_problem(label_tier, m):
    """Mâu thuẫn giữa hạng ghi trong nhãn và máy (§8), hay None."""
    ram = float(m.get("ram_gb") or 0)
    derived = "khuyennghi" if ram >= 16 else "toithieu"
    if "macOS" in m.get("os", ""):
        return None if derived == label_tier else f"nhãn ghi {label_tier} mà máy là {derived} (macOS, {ram:g} GB)"
    if label_tier == "khuyennghi" and derived != "khuyennghi":
        return f"nhãn ghi khuyennghi mà máy chỉ có {ram:g} GB"
    return None


def gate_a2(results):
    """`results`: nội dung các file JSON của `latency-bench latency` của một máy."""
    rows, seen = [], {}
    for r in sorted(results, key=lambda r: r["label"]):
        s, m = r.get("summary", {}), r.get("machine", {})
        if r.get("config", {}).get("merge") == "false":
            rows.append({"label": r["label"], "tier": None, "pack": None, "values": {}, "failed": [],
                         "skipped": "lượt tắt ghép câu"})
            continue
        tier, pack = tier_of(r["label"]), pack_of(r.get("config", {}))
        sess = r["label"].rsplit("-", 1)[-1]
        failed, limits = [], {}
        if tier is None:
            failed.append("nhãn không có hạng máy (-khuyennghi- hay -toithieu-)")
        elif tier_problem(tier, m):
            failed.append(tier_problem(tier, m))
        if pack is None:
            failed.append("không nhận ra gói từ config.mt_model, config.asr_model")
        if (pack, sess) in seen:
            failed.append(f"trùng session {pack}-{sess} (lượt cũ hay lượt biến thể lẫn vào?)")
            seen[(pack, sess)]["failed"].append(f"trùng session {pack}-{sess} (lượt cũ hay lượt biến thể lẫn vào?)")
        if not failed:
            limits = summarize.A2[tier]
            bad = [k for k in limits if k in s and not math.isfinite(s[k])]
            failed = ([f"số không hợp lệ: {', '.join(bad)}"] if bad else
                      summarize.problems(s) or [k for k, v in limits.items() if s[k] > v])
        row = {"label": r["label"], "tier": tier, "pack": pack, "session": sess, "machine": machine_of(m),
               "values": {k: s.get(k) for k in limits}, "failed": failed}
        seen.setdefault((pack, sess), row)
        rows.append(row)
    counted = [r for r in rows if "skipped" not in r]
    machines = {r["machine"] for r in counted}
    tiers = {r["tier"] for r in counted if r["tier"]}
    tier = next(iter(tiers)) if len(tiers) == 1 else None
    missing = []
    if tier:
        need = PACK_OF_TIER[tier]
        have = {(r["pack"], r["session"]) for r in counted}
        missing = [f"{need}-{s}" for s in SESSIONS if (need, s) not in have]
    ok = (bool(counted) and len(machines) == 1 and tier is not None and not missing
          and not any(r["failed"] for r in counted))
    return {"criterion": "A2", "pass": ok, "machine": next(iter(machines)) if len(machines) == 1 else None,
            "tier": tier, "classes": sorted(tiers), "missing": missing, "sessions": rows}


def gate_a3(report, baseline):
    """`report`, `baseline`: phần `runs` của `s7_mt-<nhãn>.json` và `s7_mt.json`."""
    lines, regressed, missing = regression_lines(report, {"runs": baseline})
    # `regression_lines` bỏ qua lượt của mốc mà lượt này không chạy; nghiệm thu cần đủ cả hai gói (Q2 của review 08 lần 1).
    missing += [f"thiếu lượt {name}" for name in sorted(baseline) if name.endswith("-plain") and name not in report]
    # Mỗi chiều chấm đủ số câu của mốc: lượt chỉ chấm vài câu không so được (N2 của review 08 lần 2).
    for name in sorted(set(report) & set(baseline)):
        for d, b in sorted(baseline[name].items()):
            n = report[name].get(d, {}).get("n")
            if "n" in b and n is not None and n < b["n"]:
                missing.append(f"{name} {d}: chỉ chấm {n}/{b['n']} câu")
    below_floor = []
    for name, per_dir in report.items():
        floor = next((v for k, v in FLOORS.items() if k in name), None) if name.endswith("-plain") else None
        comet = per_dir.get("en->vi", {}).get("comet")
        if floor is not None and comet is not None and comet < floor:
            below_floor.append(f"{name} en->vi {comet:.3f} < {floor:.2f}")
    ok = not regressed and not missing and not below_floor
    return {"criterion": "A3", "pass": ok, "regressed": regressed, "missing": missing, "below_floor": below_floor,
            "table": lines}


def distance(result, baseline):
    """Trung bình |ln(kết quả/mốc)| trên các nhóm có ở cả hai: nhỏ là gần."""
    logs = []
    for group, b in baseline.items():
        metric = "cer" if "cer" in b else "wer"
        new = result.get(group, {}).get(metric)
        if new and b[metric] and new > 0 and b[metric] > 0:
            logs.append(abs(math.log(new / b[metric])))
    return sum(logs) / len(logs) if logs else math.inf


def gate_a4(result, turbo, small):
    """`result`: nội dung `a4_<nhãn>.json`; `turbo`, `small`: hai mốc. Gói là mốc gần hơn (Q1 của review 08 lần 2)."""
    pack, baseline = min((("turbo", turbo), ("small", small)), key=lambda kv: distance(result, kv[1]))
    rows, missing = [], []
    for group in sorted(baseline):
        metric = "cer" if "cer" in baseline[group] else "wer"
        if group not in result or metric not in result[group]:
            missing.append(group)
            continue
        base, new = baseline[group][metric], result[group][metric]
        ok = new <= base * (1 + A4_RELATIVE) + 1e-12
        rows.append({"group": group, "metric": metric, "baseline": base, "result": new, "pass": ok})
    ok = bool(rows) and not missing and all(r["pass"] for r in rows)
    return {"criterion": "A4", "pack": pack, "pass": ok, "missing": missing, "groups": rows}


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Cổng số liệu A2, A3, A4 của nghiệm thu.")
    sub = ap.add_subparsers(dest="gate", required=True)
    a2 = sub.add_parser("a2")
    a2.add_argument("files", nargs="+", help="JSON của latency-bench latency (hạng máy lấy từ nhãn)")
    a3 = sub.add_parser("a3")
    a3.add_argument("--report", required=True, help="s7_mt-<nhãn>.json")
    a3.add_argument("--baseline", required=True, help="s7_mt.json")
    a4 = sub.add_parser("a4")
    a4.add_argument("--result", required=True, help="a4_<nhãn>.json")
    a4.add_argument("--baseline-turbo", required=True, help="a4_m4pro-turbo-final.json (hay mốc mới đã duyệt)")
    a4.add_argument("--baseline-small", required=True, help="a4_m4pro-small-final.json (hay mốc mới đã duyệt)")
    for p in (a2, a3, a4):
        p.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)

    if args.gate == "a2":
        out = gate_a2([load(f) for f in args.files])
        print(f"Máy: {out['machine'] or 'NHIỀU MÁY'}; hạng: {out['tier'] or '—'}")
        for m in out["missing"]:
            print(f"Thiếu session: {m}")
        print("| Session | Hạng | p50 | p90 | Chữ đầu p50 | Kết luận |")
        print("|---|---|---|---|---|---|")
        for r in out["sessions"]:
            v = r["values"]
            vals = " | ".join("—" if v.get(k) is None else f"{v[k]:.0f}"
                              for k in ("shown_p50_ms", "shown_p90_ms", "first_p50_ms"))
            mark = r.get("skipped") or ("đạt" if not r["failed"] else "KHÔNG ĐẠT: " + "; ".join(r["failed"]))
            print(f"| {r['label']} | {r['tier'] or '—'} | {vals} | {mark} |")
    elif args.gate == "a3":
        out = gate_a3(load(args.report)["runs"], load(args.baseline)["runs"])
        print("\n".join(out["table"]))
        for m in out["missing"]:
            print(f"Không so được: {m}")
        for b in out["below_floor"]:
            print(f"Dưới mức sàn: {b}")
    else:
        out = gate_a4(load(args.result), load(args.baseline_turbo), load(args.baseline_small))
        print(f"Gói (suy từ số đo): {out['pack']}")
        print("| Nhóm | Chỉ số | Mốc | Lượt này | Kết luận |")
        print("|---|---|---|---|---|")
        for r in out["groups"]:
            print(f"| {r['group']} | {r['metric'].upper()} | {r['baseline']:.3f} | {r['result']:.3f} | "
                  f"{'đạt' if r['pass'] else 'XẤU HƠN QUÁ 10%'} |")
        for m in out["missing"]:
            print(f"Thiếu nhóm: {m}")
    print(f"{out['criterion']}: {'ĐẠT' if out['pass'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
