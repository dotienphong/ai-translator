"""Chấm gán nhãn người nói trên đoạn VAD của app (đã nhúng sẵn bởi spike.py extract --segs-dir).

python score2.py <raw_dir>
Chọn tham số trên DEV (ES2004a, TS3003a: tai nghe), báo trên các bản còn lại với đúng tham số đó.
"""

import glob
import itertools
import json
import os
import sys
from collections import defaultdict

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.optimize import linear_sum_assignment

DEV = ("ES2004a.Mix-Headset", "TS3003a.Mix-Headset")
ORDER = ["IS1009a.Mix-Headset", "EN2002a.Mix-Headset", "IS1009a.Array1-01", "ES2004a.Array1-01"]


def norm(x):
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9)


def online(embs, durs, theta, min_new, min_update, short, max_spk=8):
    """Nhân quả. short: đoạn ngắn hơn ngưỡng này lấy nhãn của đoạn trước (không dùng nhúng)."""
    cents, labels, prev = [], [], -1
    E = norm(embs)
    for e, d in zip(E, durs):
        if d < short and prev >= 0:
            labels.append(prev)
            continue
        if not cents:
            if d >= min_new:
                cents.append(e * d)
                prev = 0
            labels.append(prev)
            continue
        sims = norm(np.stack(cents)) @ e
        b = int(np.argmax(sims))
        if sims[b] >= theta:
            lab = b
            if d >= min_update:
                cents[b] = cents[b] + e * d
        elif d >= min_new and len(cents) < max_spk:
            cents.append(e * d)
            lab = len(cents) - 1
        else:
            lab = b
        labels.append(lab)
        prev = lab
    return np.array(labels)


def whole(embs, durs, theta):
    """Gom lại cả phiên (sau phiên: Lịch sử, xuất file)."""
    keep = durs >= 1.0
    X = norm(embs[keep])
    lab_keep = fcluster(linkage(X, method="average", metric="cosine"), t=1 - theta, criterion="distance") - 1
    k = lab_keep.max() + 1
    cents = norm(np.stack([X[lab_keep == i].mean(0) for i in range(k)]))
    labels = np.argmax(norm(embs) @ cents.T, axis=1)
    labels[keep] = lab_keep
    return labels


def score(ovl, labels, durs):
    spks = sorted({s for o in ovl for s in o})
    sidx = {s: i for i, s in enumerate(spks)}
    k = max(int(labels.max()) + 1, 1)
    M = np.zeros((k, len(spks)))
    total = purity = 0.0
    for o, l in zip(ovl, labels):
        if not o:
            continue
        total += sum(o.values())
        purity += max(o.values())
        if l >= 0:
            for s, v in o.items():
                M[l, sidx[s]] += v
    r, c = linear_sum_assignment(-M)
    mp = {int(a): int(b) for a, b in zip(r, c)}
    correct = sum(M[a, b] for a, b in mp.items())
    n = ok = n_all = ok_all = 0
    for o, l, d in zip(ovl, labels, durs):
        if not o:
            continue
        hit = mp.get(int(l)) == sidx[max(o, key=o.get)]
        n_all += 1
        ok_all += hit
        if d >= 1.0:
            n += 1
            ok += hit
    used = len(set(int(x) for x in labels if x >= 0))
    return dict(time=correct / total, purity=purity / total, line=ok / max(n, 1), line_all=ok_all / max(n_all, 1), k=used)


def seg_stats(segs, ovl):
    durs = segs[:, 1] - segs[:, 0]
    multi = np.mean([sum(1 for v in o.values() if v >= 0.3) >= 2 for o in ovl if o])
    pairs = mixed = 0
    for i in range(1, len(segs)):
        if not ovl[i] or not ovl[i - 1]:
            continue
        if segs[i, 0] - segs[i - 1, 1] <= 0.7:
            pairs += 1
            mixed += max(ovl[i], key=ovl[i].get) != max(ovl[i - 1], key=ovl[i - 1].get)
    return dict(n=len(segs), med=float(np.median(durs)), short=float((durs < 1).mean()), multi=float(multi), merge_pairs=pairs, merge_mixed=mixed / max(pairs, 1))


def main():
    raw = sys.argv[1]
    data = defaultdict(dict)
    for f in glob.glob(os.path.join(raw, "*.npz")):
        name = os.path.basename(f)[:-4]
        base, model = name.rsplit(".", 1)
        z = np.load(f)
        data[base]["segs"] = z["segs"]
        data[base]["ovl"] = [json.loads(o) for o in z["ovl"]]
        data[base][model] = z[model]
        data[base][model + "_ms"] = z[model + "_ms"]
    bases = sorted(data)
    print("### Đoạn VAD")
    for b in bases:
        s = seg_stats(data[b]["segs"], data[b]["ovl"])
        print(f"  {b:22s} {s['n']} đoạn, trung vị {s['med']:.2f} s, < 1 s {s['short']:.0%}, đoạn có ≥ 2 người (≥ 0,3 s mỗi người) {s['multi']:.0%},"
              f" cặp đoạn cách ≤ 0,7 s khác người {s['merge_mixed']:.0%} ({s['merge_pairs']} cặp)")
    models = sorted({k for b in bases for k in data[b] if k not in ("segs", "ovl") and not k.endswith("_ms")})
    grid_th = [round(x, 2) for x in np.arange(0.2, 0.86, 0.05)]
    grid = list(itertools.product(grid_th, [1.0, 1.5, 2.0], [0.0, 0.5, 1.0]))
    rows = []
    for m in models:
        def dev_mean(fn):
            return np.mean([score(data[b]["ovl"], fn(b), data[b]["segs"][:, 1] - data[b]["segs"][:, 0])["time"] for b in DEV])

        best = max(grid, key=lambda p: dev_mean(lambda b: online(data[b][m], data[b]["segs"][:, 1] - data[b]["segs"][:, 0], p[0], p[1], 1.0, p[2])))
        best_w = max(grid_th, key=lambda t: dev_mean(lambda b: whole(data[b][m], data[b]["segs"][:, 1] - data[b]["segs"][:, 0], t)))
        ms = np.concatenate([data[b][m + "_ms"] for b in bases])
        print(f"\n### {m}: trực tuyến θ={best[0]} min_new={best[1]} ngắn<{best[2]} s lấy nhãn trước; cả phiên θ={best_w}; nhúng p50 {np.median(ms):.0f} ms, p90 {np.percentile(ms, 90):.0f} ms (6 tiến trình song song)")
        for b in [x for x in ORDER if x in data] + list(DEV):
            durs = data[b]["segs"][:, 1] - data[b]["segs"][:, 0]
            so = score(data[b]["ovl"], online(data[b][m], durs, best[0], best[1], 1.0, best[2]), durs)
            sw = score(data[b]["ovl"], whole(data[b][m], durs, best_w), durs)
            tag = " (dev)" if b in DEV else ""
            print(f"  {b + tag:28s} trực tuyến: {so['time']:.1%} thời lượng | dòng ≥1 s {so['line']:.1%} | mọi dòng {so['line_all']:.1%} | {so['k']} người"
                  f"  ‖ cả phiên: {sw['time']:.1%} | {sw['line']:.1%} | {sw['line_all']:.1%} | {sw['k']} người  ‖ trần {so['purity']:.1%}")
            rows.append((m, b, so, sw))
    json.dump([(m, b, so, sw) for m, b, so, sw in rows], open(os.path.join(raw, "score.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
