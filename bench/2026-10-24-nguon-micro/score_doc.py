"""Chấm bản đọc thật của chủ dự án (đo thêm sau Task 19, 2026-10-24): một người đọc to một bài (10 câu FLEURS xen 5 câu
trả lời ngắn) ở 1 m, theo nhịp của mình, nên không căn thời gian: ghép mọi đoạn được giữ theo thứ tự rồi so với cả bài.

Dùng:
  uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" \
    python bench/2026-10-24-nguon-micro/score_doc.py --results <thư mục kết quả mix-eval> --doc <bai-doc.json> --lang vi

- Lỗi: WER của chữ ghép so với cả bài (chuẩn hóa như `score_asr.py`).
- Câu ngắn nhận được: câu ngắn mà có một đoạn được giữ, sau chuẩn hóa, trùng đúng câu đó.
"""
import argparse
import json
import os
import sys

import jiwer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phase0", "asr"))
from score_asr import normalize  # noqa: E402

from score_mix import kept, load_rows  # noqa: E402


def score(rows, lines, lang):
    segs = sorted(kept(rows, None), key=lambda r: r["start_ms"])
    ref = normalize(" ".join(lines), lang)
    hyp = normalize(" ".join(r["text"] for r in segs), lang)
    o = jiwer.process_words(ref, hyp) if hyp else None
    n = len(ref.split())
    err = n if o is None else o.substitutions + o.deletions + o.insertions
    shorts = [normalize(s, lang) for s in lines if len(s.split()) <= 2]
    got = {normalize(r["text"], lang) for r in segs}
    return err / n, sum(1 for s in shorts if s in got), len(shorts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--doc", required=True)
    ap.add_argument("--lang", required=True)
    args = ap.parse_args()
    lines = json.load(open(args.doc, encoding="utf-8"))[args.lang]
    print("| Phương án | Lỗi (WER) | Câu ngắn nhận được |\n|---|---|---|")
    for name in sorted(os.listdir(args.results)):
        if name.endswith(".jsonl"):
            e, s, n = score(load_rows(os.path.join(args.results, name)), lines, args.lang)
            print(f"| {name[:-6]} | {e * 100:.1f}% | {s}/{n} |")


if __name__ == "__main__":
    main()
