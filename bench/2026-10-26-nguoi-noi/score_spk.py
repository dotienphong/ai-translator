"""Chấm gán người nói (A-spk1, A-spk2; spec 2026-10-26-phan-biet-nguoi-noi §12): so JSONL của `latency-bench speaker-eval`
với RTTM. Giọng của app được ghép với người thật theo thời lượng trùng (Hungarian), mỗi giọng một người.

Chỉ số:
- time: phần thời lượng tiếng nói (theo RTTM, trong các đoạn) gán đúng người;
- line_1s / line_all: phần đoạn (dài ≥ 1 s / mọi đoạn) có giọng ứng với người nói nhiều nhất trong đoạn;
- voices: số giọng app hiện ra; purity: trần nếu mỗi đoạn gán đúng người nói nhiều nhất.

python -I score_spk.py <ra.jsonl> <nhãn.rttm>
"""
import json
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment


def read_rttm(path):
    turns = []
    with open(path) as f:
        for line in f:
            p = line.split()
            if p and p[0] == "SPEAKER":
                start, dur = float(p[3]), float(p[4])
                turns.append((start, start + dur, p[7]))
    return turns


def read_jsonl(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def overlap(seg, turns):
    s, e = seg["start_ms"] / 1000, seg["end_ms"] / 1000
    out = {}
    for ts, te, spk in turns:
        o = min(e, te) - max(s, ts)
        if o > 0:
            out[spk] = out.get(spk, 0.0) + o
    return out


def score(segs, turns):
    speakers = sorted({t[2] for t in turns})
    index = {s: i for i, s in enumerate(speakers)}
    labels = sorted({s["voice"] for s in segs if s["voice"] is not None})
    lindex = {v: i for i, v in enumerate(labels)}
    m = np.zeros((max(len(labels), 1), len(speakers)))
    total = purity = 0.0
    ovs = [overlap(s, turns) for s in segs]
    for s, o in zip(segs, ovs):
        if not o:
            continue
        total += sum(o.values())
        purity += max(o.values())
        if s["voice"] is not None:
            for spk, v in o.items():
                m[lindex[s["voice"]], index[spk]] += v
    rows, cols = linear_sum_assignment(-m)
    mapping = {labels[r]: speakers[c] for r, c in zip(rows, cols) if r < len(labels)}
    correct = sum(m[r, c] for r, c in zip(rows, cols))
    n_all = ok_all = n_1s = ok_1s = 0
    for s, o in zip(segs, ovs):
        if not o:
            continue
        hit = mapping.get(s["voice"]) == max(o, key=o.get)
        n_all += 1
        ok_all += hit
        if s["end_ms"] - s["start_ms"] >= 1000:
            n_1s += 1
            ok_1s += hit
    return {
        "time": correct / total if total else 0.0,
        "line_1s": ok_1s / n_1s if n_1s else 0.0,
        "line_all": ok_all / n_all if n_all else 0.0,
        "voices": len(labels),
        "speakers": len(speakers),
        "purity": purity / total if total else 0.0,
    }


def main():
    s = score(read_jsonl(sys.argv[1]), read_rttm(sys.argv[2]))
    print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
