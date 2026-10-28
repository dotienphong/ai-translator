"""Dò phần tử nào trong cây giao diện đổi theo người đang nói (spec §6.4, §6.5): với mỗi dòng của bản ghi `axtrace watch` hay
`uia-probe watch`, tính tương quan giữa việc dòng đó có mặt và việc từng khách đang mở mic (dời 0,6 s), in các dòng tương quan
cao nhất cho mỗi khách. Dòng có tên khách in kèm; dòng không có tên nhưng tương quan cao cũng in (chỉ báo cạnh tên).

python -I find_indicators.py <watch.jsonl> <truth.json> [--top 12] [--shift 0.6]
"""
import argparse
import json
from collections import defaultdict

import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("watch")
    ap.add_argument("truth")
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--shift", type=float, default=0.6)
    a = ap.parse_args()
    truth = json.load(open(a.truth))
    t0 = truth["t0"]
    snaps = [json.loads(line) for line in open(a.watch)]
    lines_key = "texts" if "texts" in snaps[0] else "lines"
    events = sorted(truth["steps"], key=lambda s: s["t"])
    guests = sorted({s["g"] for s in events})

    def on(g, t):
        state = False
        for s in events:
            if s["t"] - t0 > t:
                break
            if s["g"] == g:
                state = s["on"]
        return state

    ts = [s["t"] - t0 for s in snaps]
    target = {g: np.array([on(g, t - a.shift) for t in ts], dtype=float) for g in guests}
    presence = defaultdict(lambda: np.zeros(len(snaps)))
    for k, s in enumerate(snaps):
        for line in set(s[lines_key]):
            presence[line][k] = 1.0
    for g in guests:
        y = target[g]
        if y.std() == 0:
            continue
        scored = []
        for line, v in presence.items():
            if v.std() == 0:
                continue
            scored.append((float(np.corrcoef(v, y)[0, 1]), line))
        scored.sort(reverse=True)
        print(f"\n== {g}: {len(snaps)} ảnh chụp")
        for c, line in scored[: a.top]:
            print(f"  {c:+.2f}  {line[:200]}")


if __name__ == "__main__":
    main()
