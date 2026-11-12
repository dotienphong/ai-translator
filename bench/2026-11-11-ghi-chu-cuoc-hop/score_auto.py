"""Bảng chỉ số tự động của mọi hệ trong `$DATA/out` và cổng đạt (kế hoạch 01, Task 7).

Chạy: python -I score_auto.py <out_dir> > results/tu-dong.md"""
import json
import os
import sys

GPU_MAX_S, CPU_MAX_S, RSS_MAX_MIB, JSON_MIN = 180, 600, 6144, 0.98


def load(out_dir: str) -> dict[str, list[dict]]:
    systems: dict[str, list[dict]] = {}
    for system in sorted(os.listdir(out_dir)):
        folder = os.path.join(out_dir, system)
        if not os.path.isdir(folder):
            continue
        rows = []
        for fname in sorted(os.listdir(folder)):
            if fname.endswith(".json"):
                with open(os.path.join(folder, fname), encoding="utf-8") as f:
                    rows.append(json.load(f))
        if rows:
            systems[system] = rows
    return systems


def summarize(system: str, rows: list[dict]) -> dict:
    calls = [c for r in rows for c in r["job"]["calls"]]
    valid = sum(1 for c in calls if c["valid"])
    refs_total = refs_invalid = 0
    for r in rows:
        stats = (r["job"]["notes"] or {}).get("_stats") or {}
        refs_total += stats.get("refs_total", 0)
        refs_invalid += stats.get("refs_invalid", 0)
    long_runs = [r for r in rows if r["name"].endswith("-chuan-60")]
    worst_s = max(((r["load_ms"] + r["gen_ms"]) / 1000 for r in long_runs), default=None)
    rss = [r["peak_rss_mib"] for r in rows if r.get("peak_rss_mib") is not None]
    hw = system.rsplit("-", 1)[-1] if system.rsplit("-", 1)[-1] in ("gpu", "cpu") else "cloud"
    s = {"system": system, "hw": hw, "n": len(rows), "calls": len(calls),
         "json": valid / len(calls) if calls else 0.0,
         "first_try": sum(1 for c in calls if c["valid_first"]) / len(calls) if calls else 0.0,
         "reduce_fallback": sum(1 for r in rows if r["job"]["reduce_fallback"]),
         "failed_chunks": sum(r["job"]["failed_chunks"] for r in rows),
         "raw_fallback": sum(1 for r in rows if r["job"]["raw_fallback"] is not None),
         "refs_total": refs_total, "refs_ok": 1 - refs_invalid / refs_total if refs_total else None,
         "lang_ok": sum(1 for r in rows if r["lang_ok"]), "worst_s": worst_s, "n_long": len(long_runs),
         "rss": max(rss) if rss else None}
    reasons = []
    if s["json"] < JSON_MIN:
        reasons.append("JSON")
    if s["lang_ok"] < s["n"]:
        reasons.append("ngôn ngữ")
    if hw != "cloud":
        if worst_s is None:
            reasons.append("chưa có bản 60 phút")
        elif worst_s > (GPU_MAX_S if hw == "gpu" else CPU_MAX_S):
            reasons.append("thời gian")
        if hw == "cpu" and s["rss"] is not None and s["rss"] > RSS_MAX_MIB:
            reasons.append("RAM")
    s["gate"] = "đạt" if not reasons else "rớt: " + ", ".join(reasons)
    return s


def fmt(v, pattern="{:.1f}"):
    return "—" if v is None else pattern.format(v)


def main(out_dir: str) -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    print("| Hệ | Bản chép lời | Lượt gọi | JSON hợp lệ (≤ 1 lần thử lại) | Hợp lệ ngay lần đầu | reduce_fallback | "
          "failed_chunks | raw_fallback | `refs` tồn tại | Đúng ngôn ngữ | 60 phút chậm nhất (s) | RSS đỉnh (MiB) | Cổng |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for system, rows in load(out_dir).items():
        s = summarize(system, rows)
        refs = "—" if s["refs_ok"] is None else f"{s['refs_ok'] * 100:.1f}% ({s['refs_total']})"
        print(f"| {s['system']} | {s['n']} | {s['calls']} | {s['json'] * 100:.1f}% | {s['first_try'] * 100:.1f}% | "
              f"{s['reduce_fallback']} | {s['failed_chunks']} | {s['raw_fallback']} | {refs} | "
              f"{s['lang_ok']}/{s['n']} | {fmt(s['worst_s'])} ({s['n_long']} bản) | {fmt(s['rss'], '{:.0f}')} | {s['gate']} |")
    print(f"\nNgưỡng: JSON ≥ {JSON_MIN * 100:.0f}%; đúng ngôn ngữ ở mọi bản; gpu ≤ {GPU_MAX_S} s; "
          f"cpu ≤ {CPU_MAX_S} s và RSS ≤ {RSS_MAX_MIB} MiB. Thời gian = nạp model + chạy, bản `*-chuan-60` chậm nhất.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
