"""Quét tham số nhận giọng trên cache nhúng (`<tên>.emb.json`), bản Python của `OnlineClusterer` (kiểm khớp với
`latency-bench speaker-eval --embeddings-in` bằng lệnh `check`), chấm theo score_spk (cùng công thức), thêm phân tích lỗi theo
loại đoạn và vài thuật toán THỬ (không cài vào app). Kết quả ra JSON/stdout để ghi báo cáo.

Dùng (không `-I`, vì import score_spk cùng thư mục):
  python callsim_sweep.py check  <latency-bench> <thư mục> <tên>...            # Python so với binary ở cấu hình mặc định và một cấu hình khác
  python callsim_sweep.py sweep  <DATA> [--cache emb|emb4] --out kq.json       # lưới tham số trên ba bộ: call (kiểu cuộc gọi), ami, cv
  python callsim_sweep.py errors <DATA> [--cache emb|emb4]                      # nhầm theo loại đoạn ở cấu hình mặc định
  python callsim_sweep.py algos  <DATA> [--cache emb|emb4]                      # các thuật toán thử
  python callsim_sweep.py dense  <DATA> [--cache emb|emb4] --out kq.json        # lưới dày quanh vùng tốt, in các cấu hình không tăng giọng thừa
  python callsim_sweep.py good|center <DATA> [--cache ...]                       # lỗi khi số giọng đúng; thử trừ trung bình chạy
  python callsim_sweep.py variants <DATA> [--cache emb|emb4] [--theta t --min-new-ms n]  # bảng theo biến thể nén / số người
"""
import argparse
import glob
import itertools
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from scipy.optimize import linear_sum_assignment

from score_spk import read_jsonl, read_rttm

DEFAULT = dict(theta=0.35, min_embed_ms=500, min_new_ms=1500, min_update_ms=1000, max_voices=8, merge_theta=1.10,
               merge_min_ms=10000)


CAND = {**DEFAULT, "theta": 0.3625, "min_update_ms": 0, "merge_theta": 0.80}  # ứng viên duy nhất đạt luật khuyến nghị (xem báo cáo)


# ---------------------------------------------------------------- phân cụm (bản sao của cluster.rs)

def _norm(e):
    n = np.linalg.norm(e)
    return e / n if np.isfinite(n) and n > 0 else None


def cluster(segs, cfg):
    """segs: [(start_ms, end_ms, embedding|None)] → nhãn mỗi đoạn (None nếu chưa có giọng)."""
    voices = []  # [id, sum, speech_ms]
    nid, prev, out = 1, None, []
    for s, e, emb in segs:
        ms = min(e - s, 60000)
        x = _norm(np.asarray(emb, dtype=np.float64)) if (emb is not None and ms >= cfg["min_embed_ms"]) else None
        if x is None:
            out.append(prev)
            continue
        best = None
        for i, v in enumerate(voices):
            c = float(np.dot(v[1], x) / (np.linalg.norm(v[1]) * 1.0))
            if best is None or c > best[1]:
                best = (i, c)
        if best and best[1] >= cfg["theta"]:
            if ms >= cfg["min_update_ms"]:
                voices[best[0]][1] = voices[best[0]][1] + x * ms
                voices[best[0]][2] += ms
            vid = voices[best[0]][0]
        elif ms >= cfg["min_new_ms"] and len(voices) < cfg["max_voices"]:
            voices.append([nid, x * ms, ms])
            vid, nid = nid, nid + 1
        elif best and ms >= cfg["min_new_ms"]:
            vid = voices[best[0]][0]
        else:
            vid = prev
        # gộp
        while True:
            pick = None
            for i in range(len(voices)):
                for j in range(i + 1, len(voices)):
                    a, b = voices[i], voices[j]
                    if a[2] < cfg["merge_min_ms"] or b[2] < cfg["merge_min_ms"]:
                        continue
                    c = float(np.dot(a[1], b[1]) / (np.linalg.norm(a[1]) * np.linalg.norm(b[1])))
                    if c >= cfg["merge_theta"] and (pick is None or c > pick[2]):
                        pick = (i, j, c)
            if not pick:
                break
            i, j, _ = pick
            keep, drop = (i, j) if voices[i][2] >= voices[j][2] else (j, i)
            d = voices.pop(drop)
            keep -= drop < keep
            voices[keep][1] = voices[keep][1] + d[1]
            voices[keep][2] += d[2]
            if vid == d[0]:
                vid = voices[keep][0]
            out = [voices[keep][0] if v == d[0] else v for v in out]  # như giao diện: đổi nhãn các đoạn trước
        prev = vid
        out.append(vid)
    return out


# ---------------------------------------------------------------- chấm điểm (cùng công thức score_spk, tính trước phần trùng)

class Rec:
    """Một bản ghi: đoạn, nhúng, nhãn thật; `overlaps` tính một lần."""

    def __init__(self, path_emb, path_rttm, name):
        self.name = name
        raw = json.load(open(path_emb))
        self.segs = [(s["start_ms"], s["end_ms"], s["embedding"]) for s in raw]
        self.turns = read_rttm(path_rttm)
        self.speakers = sorted({t[2] for t in self.turns})
        self.ov = []
        for s, e, _ in self.segs:
            o = {}
            for ts, te, spk in self.turns:
                x = min(e / 1000, te) - max(s / 1000, ts)
                if x > 0:
                    o[spk] = o.get(spk, 0.0) + x
            self.ov.append(o)

    def score(self, labels, detail=False):
        sp = {s: i for i, s in enumerate(self.speakers)}
        ls = sorted({v for v in labels if v is not None})
        li = {v: i for i, v in enumerate(ls)}
        m = np.zeros((max(len(ls), 1), len(self.speakers)))
        total = 0.0
        for v, o in zip(labels, self.ov):
            if not o:
                continue
            total += sum(o.values())
            if v is not None:
                for spk, x in o.items():
                    m[li[v], sp[spk]] += x
        r, c = linear_sum_assignment(-m)
        mapping = {ls[a]: self.speakers[b] for a, b in zip(r, c) if a < len(ls)}
        n_all = ok_all = n_1s = ok_1s = 0
        hits = []
        for (s, e, _), v, o in zip(self.segs, labels, self.ov):
            if not o:
                hits.append(None)
                continue
            hit = mapping.get(v) == max(o, key=o.get)
            hits.append(hit)
            n_all += 1
            ok_all += hit
            if e - s >= 1000:
                n_1s += 1
                ok_1s += hit
        res = dict(line_all=ok_all / n_all if n_all else 0.0, line_1s=ok_1s / n_1s if n_1s else 0.0, voices=len(ls),
                   speakers=len(self.speakers), time=sum(m[a, b] for a, b in zip(r, c)) / total if total else 0.0)
        return (res, hits, mapping) if detail else res


def load_sets(data, cache):
    """Ba bộ: call (kiểu cuộc gọi), ami (A-spk1), cv (A-spk2 gốc, bản thường và Opus 24 kbps)."""
    sets = {"call": [], "ami": [], "cv": []}
    call_dir = os.path.join(data, "callsim") + ("/emb4" if cache == "emb4" else "")
    for p in sorted(glob.glob(call_dir + "/*.emb.json")):
        n = os.path.basename(p)[:-9]
        sets["call"].append(Rec(p, p[:-9] + ".rttm", n))
    out = os.path.join(data, "out")
    ami_dir = out if cache == "emb" else os.path.join(out, "emb4")
    for p in sorted(glob.glob(ami_dir + "/*.Mix-Headset.emb.json") + glob.glob(ami_dir + "/*.Array1-01.emb.json")):
        n = os.path.basename(p)[:-9]
        sets["ami"].append(Rec(p, os.path.join(out, n + ".rttm"), n))
    cv_dir = os.path.join(out, "vi") if cache == "emb" else os.path.join(out, "vi", "emb4")
    for p in sorted(glob.glob(cv_dir + "/cv-vi-*.emb.json")):
        n = os.path.basename(p)[:-9]
        sets["cv"].append(Rec(p, os.path.join(out, "vi", n + ".rttm"), n))
    return sets


def summarize(recs, cfg):
    rows = [r.score(cluster(r.segs, cfg)) for r in recs]
    return summarize_rows(rows)


def summarize_rows(rows):
    la = np.array([r["line_all"] for r in rows])
    l1 = np.array([r["line_1s"] for r in rows])
    ex = sum(max(0, r["voices"] - r["speakers"]) for r in rows)
    de = sum(max(0, r["speakers"] - r["voices"]) for r in rows)
    k = max(1, len(rows) // 4)
    return dict(all=la.mean() * 100, s1=l1.mean() * 100, worst_all=la.min() * 100, worst_s1=l1.min() * 100,
                q_all=np.sort(la)[:k].mean() * 100, q_s1=np.sort(l1)[:k].mean() * 100, extra=ex, missing=de, n=len(rows))


# ---------------------------------------------------------------- lệnh

def cmd_check(a):
    for name in a.names:
        for extra, cfg in ([], {}), (["--theta", "0.45", "--merge-theta", "0.75", "--min-new-ms", "2500"],
                                     dict(theta=0.45, merge_theta=0.75, min_new_ms=2500)):
            with tempfile.TemporaryDirectory() as t:
                o = os.path.join(t, "x.jsonl")
                subprocess.run([a.binary, "speaker-eval", "--embeddings-in", os.path.join(a.folder, name + ".emb.json"),
                                "--out", o, *extra], check=True, stdout=subprocess.DEVNULL)
                ref = [s["voice"] for s in read_jsonl(o)]
            r = Rec(os.path.join(a.folder, name + ".emb.json"), os.path.join(a.folder, name + ".rttm"), name)
            mine = cluster(r.segs, {**DEFAULT, **cfg})
            print(name, extra, "KHỚP" if mine == ref else f"LỆCH {sum(x != y for x, y in zip(mine, ref))}/{len(ref)}")


def grid_axes():
    return dict(theta=[round(0.25 + 0.025 * i, 3) for i in range(11)])


def cmd_sweep(a):
    sets = load_sets(a.data, a.cache)
    print({k: len(v) for k, v in sets.items()}, file=sys.stderr)
    res = {"base": {k: summarize(v, DEFAULT) for k, v in sets.items()}, "grid": []}
    thetas = grid_axes()["theta"]
    stages = [
        ("theta x min_new", dict(min_new_ms=[1000, 1500, 2000, 3000])),
        ("theta x min_update", dict(min_update_ms=[0, 1000, 2000, 3000])),
        ("theta x min_embed", dict(min_embed_ms=[500, 700, 1000])),
        ("theta x merge", dict(merge_theta=[1.10, 0.85, 0.80, 0.75, 0.70, 0.65])),
        ("theta x max_voices", dict(max_voices=[3, 4, 6, 8])),
    ]
    for label, axis in stages:
        (key, vals), = axis.items()
        for th, v in itertools.product(thetas, vals):
            cfg = {**DEFAULT, "theta": th, key: v}
            res["grid"].append(dict(stage=label, theta=th, key=key, value=v,
                                    **{k: summarize(recs, cfg) for k, recs in sets.items()}))
        print("xong", label, file=sys.stderr)
    # lưới kết hợp nhỏ quanh vùng tốt
    for th, nw, up, em in itertools.product(thetas, [1500, 2000, 3000], [1000, 2000], [500, 800]):
        cfg = {**DEFAULT, "theta": th, "min_new_ms": nw, "min_update_ms": up, "min_embed_ms": em}
        res["grid"].append(dict(stage="combo", theta=th, key="combo", value=[nw, up, em],
                                **{k: summarize(recs, cfg) for k, recs in sets.items()}))
    json.dump(res, open(a.out, "w"), indent=1)
    print("ghi", a.out)


def cat_of(r, i, s, e, o):
    d = (e - s) / 1000
    dur = "<1s" if d < 1 else "1-2s" if d < 2 else "2-4s" if d < 4 else ">=4s"
    tot = sum(o.values())
    ov = len(o) >= 2 and sorted(o.values())[-2] > 0.15 * d
    start = "dau<60s" if s < 60000 else "sau"
    return dur, ("chong" if ov else "mot_nguoi"), start


def cmd_errors(a):
    sets = load_sets(a.data, a.cache)
    for kind in ("call", "cv", "ami"):
        agg = {}
        for r in sets[kind]:
            res, hits, _ = r.score(cluster(r.segs, DEFAULT), detail=True)
            for (s, e, _), h, o in zip(r.segs, hits, r.ov):
                if h is None:
                    continue
                for axis, c in zip(("dur", "overlap", "start"), cat_of(r, 0, s, e, o)):
                    k = (axis, c)
                    n, ok = agg.get(k, (0, 0))
                    agg[k] = (n + 1, ok + h)
        print(f"\n[{kind}] mọi bản ghi, cấu hình mặc định")
        for (axis, c), (n, ok) in sorted(agg.items()):
            print(f"  {axis:8s} {c:10s} n={n:5d} đúng={ok / n * 100:5.1f}%  sai={n - ok:4d}")


def relabel_final(r, cfg):
    """Cận trên của chốt nhãn muộn: chạy nhân quả để có tâm cuối, rồi gán lại MỌI đoạn (có nhúng) vào tâm gần nhất."""
    voices = {}
    labels = cluster(r.segs, cfg)
    for (s, e, emb), v in zip(r.segs, labels):
        x = _norm(np.asarray(emb)) if emb is not None and e - s >= cfg["min_embed_ms"] else None
        if x is not None and v is not None and e - s >= cfg["min_update_ms"]:
            voices[v] = voices.get(v, 0) + x * (e - s)
    out = []
    for (s, e, emb), v in zip(r.segs, labels):
        x = _norm(np.asarray(emb)) if emb is not None and e - s >= cfg["min_embed_ms"] else None
        if x is None or not voices:
            out.append(v)
            continue
        out.append(max(voices, key=lambda k: float(np.dot(voices[k], x) / np.linalg.norm(voices[k]))))
    return out


def cluster_delay(r, cfg, delay_s):
    """Chốt nhãn muộn thật: nhãn của đoạn i là nhãn gán lại bằng tâm tại thời điểm kết thúc đoạn + delay_s (chỉ dùng các đoạn
    đã xong lúc đó), nhưng tâm vẫn do thuật toán nhân quả dựng. Đoạn mở giọng mới giữ nhãn gốc."""
    labels = cluster(r.segs, cfg)
    out = list(labels)
    for i, (s, e, emb) in enumerate(r.segs):
        x = _norm(np.asarray(emb)) if emb is not None and e - s >= cfg["min_embed_ms"] else None
        if x is None:
            continue
        horizon = e + delay_s * 1000
        cent = {}
        for (s2, e2, emb2), v in zip(r.segs, labels):
            if e2 > horizon:
                break
            y = _norm(np.asarray(emb2)) if emb2 is not None and e2 - s2 >= cfg["min_update_ms"] else None
            if y is not None and v is not None:
                cent[v] = cent.get(v, 0) + y * (e2 - s2)
        if cent:
            out[i] = max(cent, key=lambda k: float(np.dot(cent[k], x) / np.linalg.norm(cent[k])))
    return out


def cmd_algos(a):
    sets = load_sets(a.data, a.cache)
    algos = {
        "mặc định": lambda r: cluster(r.segs, DEFAULT),
        "gán lại theo tâm cuối (cận trên, ngoại tuyến)": lambda r: relabel_final(r, DEFAULT),
        "chốt muộn 5 s": lambda r: cluster_delay(r, DEFAULT, 5),
        "chốt muộn 15 s": lambda r: cluster_delay(r, DEFAULT, 15),
        "chốt muộn 30 s": lambda r: cluster_delay(r, DEFAULT, 30),
        "chốt muộn 60 s": lambda r: cluster_delay(r, DEFAULT, 60),
        "ứng viên tham số (θ 0,3625, min_update 0, gộp 0,80)": lambda r: cluster(r.segs, CAND),
        "ứng viên tham số + chốt muộn 30 s": lambda r: cluster_delay(r, CAND, 30),
    }
    for name, fn in algos.items():
        print(f"\n{name}")
        for kind, recs in sets.items():
            s = summarize_rows([r.score(fn(r)) for r in recs])
            print(f"  {kind:5s} mọi dòng {s['all']:.1f}% | ≥1 s {s['s1']:.1f}% | tệ nhất {s['worst_all']:.1f}% | giọng thừa {s['extra']} thiếu {s['missing']}")


def cmd_dense(a):
    sets = load_sets(a.data, a.cache)
    base = {k: summarize(v, DEFAULT) for k, v in sets.items()}
    rows = []
    for th, nw, up, mg, em in itertools.product([round(0.30 + 0.0125 * i, 4) for i in range(11)], [1000, 1250, 1500, 1750, 2000],
                                                [0, 500, 1000, 1500], [1.10, 0.80, 0.70], [500, 600]):
        cfg = {**DEFAULT, "theta": th, "min_new_ms": nw, "min_update_ms": up, "merge_theta": mg, "min_embed_ms": em}
        rows.append(dict(cfg=cfg, **{k: summarize(recs, cfg) for k, recs in sets.items()}))
    json.dump(dict(base=base, rows=rows), open(a.out, "w"), indent=1)
    ok = [r for r in rows if all(r[k]["extra"] <= base[k]["extra"] for k in sets) and r["ami"]["all"] >= base["ami"]["all"] - 0.5
          and r["cv"]["all"] >= base["cv"]["all"] - 0.5]
    print("cấu hình không tăng giọng thừa và không kém quá 0,5 trên bộ gốc:", len(ok), "/", len(rows))
    for r in sorted(ok, key=lambda r: -r["call"]["all"])[:8]:
        c = r["cfg"]
        print(f"  θ={c['theta']} new={c['min_new_ms']} upd={c['min_update_ms']} merge={c['merge_theta']} emb={c['min_embed_ms']} | call "
              f"{r['call']['all']:.1f}/{r['call']['s1']:.1f} ex{r['call']['extra']} mi{r['call']['missing']} | ami {r['ami']['all']:.1f} | cv {r['cv']['all']:.1f}")
    print("kết quả ra", a.out)


def variant_of(name):
    m = re.match(r"call\D*(\d)p-\d+-(.*)", name)
    return m.group(1) + "p", m.group(2)


def cmd_variants(a):
    sets = load_sets(a.data, a.cache)
    cfg = {**DEFAULT, "theta": a.theta, "min_new_ms": a.min_new_ms}
    print(f"θ={a.theta} min_new_ms={a.min_new_ms}")
    groups = {}
    for r in sets["call"]:
        people, var = variant_of(r.name)
        groups.setdefault(("người " + people), []).append(r)
        groups.setdefault(var, []).append(r)
    for k in sets:
        groups.setdefault("bộ " + k, sets[k])
    for g, recs in groups.items():
        s = summarize(recs, cfg)
        print(f"  {g:14s} n={s['n']:3d} mọi dòng {s['all']:.1f} | ≥1 s {s['s1']:.1f} | tệ nhất {s['worst_all']:.1f} | giọng thừa {s['extra']} thiếu {s['missing']}")


def cmd_good(a):
    """Lỗi theo loại đoạn riêng cho bản ghi mà số giọng ra ĐÚNG (lỗi chỉ do gán dòng, không do gộp giọng), và theo thứ tự đoạn."""
    sets = load_sets(a.data, a.cache)
    agg, pos = {}, {}
    n_good = 0
    for r in sets["call"]:
        res, hits, _ = r.score(cluster(r.segs, DEFAULT), detail=True)
        if res["voices"] != res["speakers"]:
            continue
        n_good += 1
        k = 0
        for (s, e, _), h, o in zip(r.segs, hits, r.ov):
            if h is None:
                continue
            for axis, c in zip(("dur", "overlap", "start"), cat_of(r, 0, s, e, o)):
                n, ok = agg.get((axis, c), (0, 0))
                agg[axis, c] = (n + 1, ok + h)
            b = "0-9" if k < 10 else "10-29" if k < 30 else "30+"
            n, ok = pos.get(b, (0, 0))
            pos[b] = (n + 1, ok + h)
            k += 1
    print(f"bản ghi kiểu cuộc gọi có số giọng đúng: {n_good}/{len(sets['call'])}")
    for (axis, c), (n, ok) in sorted(agg.items()):
        print(f"  {axis:8s} {c:10s} n={n:5d} đúng={ok / n * 100:5.1f}%")
    for b, (n, ok) in pos.items():
        print(f"  đoạn thứ {b:6s} n={n:5d} đúng={ok / n * 100:5.1f}%")


def centered(segs):
    """Trừ trung bình chạy (nhân quả, gồm cả nhúng hiện tại) của các nhúng đã chuẩn hóa: thử làm hai giọng giống nhau xa nhau hơn."""
    acc, n, out = None, 0, []
    for s, e, emb in segs:
        x = _norm(np.asarray(emb, dtype=np.float64)) if emb is not None else None
        if x is None:
            out.append((s, e, emb))
            continue
        acc = x.copy() if acc is None else acc + x
        n += 1
        out.append((s, e, (x - acc / n).tolist()))
    return out


def cmd_center(a):
    sets = load_sets(a.data, a.cache)
    for th in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40]:
        cfg = {**DEFAULT, "theta": th}
        row = []
        for k, recs in sets.items():
            s = summarize_rows([r.score(cluster(centered(r.segs), cfg)) for r in recs])
            row.append(f"{k} {s['all']:.1f}/{s['s1']:.1f} thừa{s['extra']} thiếu{s['missing']}")
        print(f"θ={th:.2f} | " + " | ".join(row))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("binary")
    c.add_argument("folder")
    c.add_argument("names", nargs="+")
    for n in ("sweep", "errors", "algos", "dense", "variants", "good", "center"):
        s = sub.add_parser(n)
        s.add_argument("data")
        s.add_argument("--cache", default="emb", choices=["emb", "emb4"])
        if n in ("sweep", "dense"):
            s.add_argument("--out", required=True)
        if n == "variants":
            s.add_argument("--theta", type=float, default=0.35)
            s.add_argument("--min-new-ms", type=int, default=1500)
    a = ap.parse_args()
    {"check": cmd_check, "sweep": cmd_sweep, "errors": cmd_errors, "algos": cmd_algos, "dense": cmd_dense,
     "variants": cmd_variants, "good": cmd_good, "center": cmd_center}[a.cmd](a)


if __name__ == "__main__":
    main()
