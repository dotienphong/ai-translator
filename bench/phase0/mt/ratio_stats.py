"""Tỉ lệ token của bản dịch (token bản dịch chia token câu gốc) từ kết quả `latency-bench mt-eval`, theo cách của S7
(`s7_mt_decisions.md`): ngưỡng đề xuất là tỉ lệ lớn nhất đo được cộng biên 25%, làm tròn lên 0,1, chỉ tính câu gốc từ
10 token trở lên (cách 2 của Q4). Câu gốc dưới 3 token báo riêng: số token bản dịch lớn nhất, so với hạn mức sinh của §6.5
(`4 × số token câu gốc + 32`).

Dùng: python3 bench/phase0/mt/ratio_stats.py <mt-eval.jsonl>… [--out bench/phase0/results/gd1_mt_ratio.md]
"""
import argparse
import json
import math
import os
from collections import defaultdict

MIN_SRC = 10


def suggest(ratio):
    return math.ceil(ratio * 1.25 * 10 - 1e-9) / 10


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out")
    args = ap.parse_args()
    lines = []
    for path in args.files:
        rows = [json.loads(l) for l in open(path, encoding="utf-8")]
        by_dir = defaultdict(list)
        for r in rows:
            by_dir[r["dir"]].append(r)
        lines += [f"## {os.path.basename(path)}", "",
                  f"| chiều | câu | câu gốc ≥ {MIN_SRC} token | tỉ lệ lớn nhất (≥ {MIN_SRC}) | ngưỡng đề xuất "
                  f"| câu gốc < 3 token | token dịch lớn nhất (< 3) | hạn mức sinh (< 3) | lỗi |",
                  "|---|---|---|---|---|---|---|---|---|"]
        for d in sorted(by_dir):
            rs = [r for r in by_dir[d] if r["status"] == "done" and r["src_tokens"] > 0]
            long = [r["completion_tokens"] / r["src_tokens"] for r in rs if r["src_tokens"] >= MIN_SRC]
            short = [r for r in rs if r["src_tokens"] < 3]
            failed = sum(r["status"] != "done" for r in by_dir[d])
            top = max(long) if long else None
            cap = max((4 * r["src_tokens"] + 32 for r in short), default=None)
            lines.append(
                f"| {d} | {len(by_dir[d])} | {len(long)} | {f'{top:.2f}' if top is not None else '—'} "
                f"| {f'{suggest(top):.1f}' if top is not None else '—'} | {len(short)} "
                f"| {max((r['completion_tokens'] for r in short), default='—')} | {cap if cap is not None else '—'} "
                f"| {failed} |")
        lines.append("")
    text = "\n".join(lines)
    print(text)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write("# Tỉ lệ token cho cặp không có tiếng Việt và câu gốc rất ngắn (Đ12)\n\n"
                    "Sinh bởi `bench/phase0/mt/ratio_stats.py` từ kết quả `latency-bench mt-eval` trên "
                    "`testset_ratio.jsonl` (`build_ratio_set.py`).\n\n" + text)


if __name__ == "__main__":
    main()
