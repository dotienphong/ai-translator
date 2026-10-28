"""Biến thể trực tuyến có "người tạm" + gộp cụm: người mới chỉ được hiện (có nhãn) khi đã gom đủ `confirm_s` giây tiếng nói;
trước đó dòng của họ hiện không nhãn ("?"). Hai cụm có tâm giống nhau hơn θ_merge thì gộp (giao diện đổi nhãn các dòng cũ).
Báo: tỉ lệ dòng đúng (trên các dòng có nhãn), tỉ lệ dòng không nhãn, số người hiện ra."""
import itertools, json, os, sys, glob
from collections import defaultdict
import numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0, os.path.dirname(__file__))
from score2 import DEV, ORDER, norm

def online2(embs, durs, theta, theta_merge, confirm_s, min_new=1.5, min_update=1.0, max_spk=12):
    sums, mass, alias = [], [], []   # alias: hợp nhất cụm (union-find đơn giản)
    raw = []
    def root(i):
        while alias[i] != i: i = alias[i]
        return i
    E = norm(embs)
    for e, d in zip(E, durs):
        live = [i for i in range(len(sums)) if root(i) == i]
        if not live:
            if d >= min_new:
                sums.append(e * d); mass.append(d); alias.append(len(sums) - 1); raw.append(len(sums) - 1)
            else:
                raw.append(-1)
            continue
        C = norm(np.stack([sums[i] for i in live]))
        sims = C @ e
        j = int(np.argmax(sims)); b = live[j]
        if sims[j] >= theta:
            lab = b
            if d >= min_update:
                sums[b] = sums[b] + e * d; mass[b] += d
        elif d >= min_new and len(live) < max_spk:
            sums.append(e * d); mass.append(d); alias.append(len(sums) - 1); lab = len(sums) - 1
        else:
            lab = b
        raw.append(lab)
        # gộp cụm giống nhau
        live = [i for i in range(len(sums)) if root(i) == i]
        if len(live) > 1:
            C = norm(np.stack([sums[i] for i in live])); S = C @ C.T; np.fill_diagonal(S, -1)
            a, c = np.unravel_index(np.argmax(S), S.shape)
            if S[a, c] >= theta_merge:
                x, y = live[a], live[c]
                if mass[y] > mass[x]: x, y = y, x
                sums[x] = sums[x] + sums[y]; mass[x] += mass[y]; alias[y] = x
    # nhãn cuối cùng (sau mọi lần gộp, như giao diện đã đổi nhãn) và cờ "đã xác nhận" tại thời điểm hiện dòng
    labels = np.array([root(l) if l >= 0 else -1 for l in raw])
    return labels, mass, alias

def confirmed_mask(labels, durs, confirm_s):
    """Dòng chỉ có nhãn khi người đó đã gom đủ confirm_s giây tính tới dòng đó (nhân quả)."""
    acc = defaultdict(float); out = []
    for l, d in zip(labels, durs):
        if l >= 0: acc[l] += d
        out.append(l >= 0 and acc[l] >= confirm_s)
    return np.array(out)

def score(ovl, labels, shown, durs):
    spks = sorted({s for o in ovl for s in o}); sidx = {s: i for i, s in enumerate(spks)}
    k = int(labels.max()) + 1 if labels.max() >= 0 else 1
    M = np.zeros((k, len(spks)))
    for o, l, sh in zip(ovl, labels, shown):
        if o and l >= 0 and sh:
            for s, v in o.items(): M[l, sidx[s]] += v
    r, c = linear_sum_assignment(-M); mp = {int(a): int(b) for a, b in zip(r, c)}
    n = ok = unl = 0
    for o, l, sh in zip(ovl, labels, shown):
        if not o: continue
        n += 1
        if not sh: unl += 1; continue
        ok += mp.get(int(l)) == sidx[max(o, key=o.get)]
    shown_spk = len({int(l) for l, sh in zip(labels, shown) if sh})
    return dict(ok=ok / max(n - unl, 1), unl=unl / max(n, 1), k=shown_spk)

def main():
    raw = sys.argv[1]; models = sys.argv[2].split(",")
    data = defaultdict(dict)
    for f in glob.glob(os.path.join(raw, "*.npz")):
        base, m = os.path.basename(f)[:-4].rsplit(".", 1)
        if m not in models: continue
        z = np.load(f); data[base]["segs"] = z["segs"]; data[base]["ovl"] = [json.loads(o) for o in z["ovl"]]; data[base][m] = z[m]
    grid = list(itertools.product([0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6], [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.8, 1.1], [0, 5, 10, 20]))
    for m in models:
        def obj(p):
            v = []
            for b in DEV:
                d = data[b]["segs"][:, 1] - data[b]["segs"][:, 0]
                lab, _, _ = online2(data[b][m], d, p[0], p[1], p[2])
                s = score(data[b]["ovl"], lab, confirmed_mask(lab, d, p[2]), d)
                # mục tiêu: đúng nhiều, ít dòng không nhãn, phạt người thừa (4 người thật)
                v.append(s["ok"] * (1 - s["unl"]) - 0.03 * max(0, s["k"] - 4))
            return np.mean(v)
        best = max(grid, key=obj)
        print(f"\n### {m}: θ={best[0]} θ_gộp={best[1]} xác nhận sau {best[2]} s")
        for b in [x for x in ORDER if x in data] + list(DEV):
            d = data[b]["segs"][:, 1] - data[b]["segs"][:, 0]
            lab, _, _ = online2(data[b][m], d, best[0], best[1], best[2])
            s = score(data[b]["ovl"], lab, confirmed_mask(lab, d, best[2]), d)
            print(f"  {b + (' (dev)' if b in DEV else ''):28s} dòng có nhãn đúng {s['ok']:.1%} | dòng không nhãn {s['unl']:.1%} | {s['k']} người hiện ra")

main()
