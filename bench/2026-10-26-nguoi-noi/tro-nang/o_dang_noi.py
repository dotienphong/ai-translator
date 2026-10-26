"""Chỉ báo "đang nói" theo từng ô video, đọc từ bản ghi `axtrace watch`, so với sự thật (spec §6.4; kế hoạch 01, Task 12).

Teams (ô video, bảng People đóng hay mở): ô là AXMenuItem có mô tả bắt đầu bằng tên khách ("Lan (Guest), …"); chỉ báo là có
một con (cùng ô) mang lớp CSS `vdi-frame-occlusion`. Nhãn mic so cùng lúc: mô tả có ", muted," hay không.
Meet: mỗi ô là [nhóm lớp "DYfzY cYKTje <mức>"] (thanh âm lượng) + [nhóm lớp "qg7mD …"] rồi chữ tên; chỉ báo (a) lớp "BlxGDf" có
mặt ở nhóm qg7mD, (b) lớp thanh âm lượng đổi ≥ 2 lần trong 1 s gần nhất (cách của truoc-spec/doc-ten/blind.py).
Chấm trên lưới 0,25 s (giữ ảnh chụp gần nhất trước đó vì `axtrace watch` chỉ ghi khi cây đổi), sự thật dời --shift giây.
Không in tên người.

python -I o_dang_noi.py teams <watch.jsonl> <truth.json> [--shift 0.6]
python -I o_dang_noi.py meet  <watch.jsonl> <truth.json> [--shift 0.6]   (truth: chỉ chấm trong khoảng của bản ghi watch)
"""
import argparse
import json
from collections import deque

import numpy as np


def on_fn(steps):
    ev = sorted(steps, key=lambda s: s["t"])

    def on(g, t):
        st = False
        for s in ev:
            if s["t"] > t:
                break
            if s["g"] == g:
                st = s["on"]
        return st
    return on


def teams(snaps, truth, shift):
    guests = sorted({s["g"] for s in truth["steps"]})

    def parse(texts):
        frame, label = {}, {}
        for i, x in enumerate(texts):
            f = x.split("|")
            d = int(f[0])
            for g in guests:
                if f[1] == "AXMenuItem" and f[3].lower().startswith(g + " (guest),"):
                    label[g] = ", muted," not in f[3].lower()
                    has = False
                    for y in texts[i + 1:]:
                        fy = y.split("|")
                        if int(fy[0]) <= d:
                            break
                        if "vdi-frame-occlusion" in fy[9]:
                            has = True
                    frame[g] = has
        return frame, label
    parsed = [(r["t"], *parse(r["texts"])) for r in snaps]
    on = on_fn(truth["steps"])
    a, b = snaps[0]["t"] + 1.0, min(snaps[-1]["t"], truth.get("end", snaps[-1]["t"]))
    grid = np.arange(a, b, 0.25)
    idx = np.searchsorted([p[0] for p in parsed], grid, side="right") - 1
    for g in guests:
        y = np.array([on(g, t - shift) for t in grid], float)
        fr = np.array([float(parsed[i][1].get(g, False)) for i in idx])
        lb = np.array([float(parsed[i][2].get(g, False)) for i in idx])
        print(f"{g}: khung r={np.corrcoef(fr, y)[0, 1]:+.2f} khớp {np.mean(fr == y):.0%} | nhãn mic r={np.corrcoef(lb, y)[0, 1]:+.2f} "
              f"khớp {np.mean(lb == y):.0%} ({len(grid)} điểm lưới, dời {shift} s)")
        for what, k in (("khung", 1), ("nhãn mic", 2)):
            up, down = [], []
            for s in truth["steps"]:
                if s["g"] != g or not (a <= s["t"] <= b):
                    continue
                hit = next((t for t, *v in parsed if t >= s["t"] - 0.05 and v[k - 1].get(g) == s["on"]), None)
                if hit is not None:
                    (up if s["on"] else down).append(hit - s["t"])
            if up:
                print(f"  {what}: đổi sau lúc bật mic trung vị {np.median(up):.2f} s ({len(up)} lần); sau lúc tắt mic trung vị "
                      f"{np.median(down):.2f} s ({len(down)} lần)")


def meet(snaps, truth, shift):
    ons = [(truth["steps"][k]["t"], truth["steps"][k + 1]["t"]) for k in range(0, len(truth["steps"]) - 1, 2)]

    def tiles(texts):
        out, lvl, blx = [], None, None
        for x in texts:
            f = x.split("|")
            c = f[9]
            if c.startswith("DYfzY "):
                lvl = c
            elif c.startswith("qg7mD "):
                blx = "BlxGDf" in c.split()
            elif f[1] == "AXStaticText" and f[5] and lvl is not None:
                out.append((lvl, blx))
                lvl, blx = None, None
        return out
    parsed = [(r["t"], tiles(r["texts"])) for r in snaps]
    nt = max(len(p[1]) for p in parsed)
    a, b = snaps[0]["t"] + 1.0, snaps[-1]["t"]
    grid = np.arange(a, b, 0.25)
    idx = np.searchsorted([p[0] for p in parsed], grid, side="right") - 1
    y = np.array([any(s + shift <= t < e + shift for s, e in ons) for t in grid], float)
    print(f"{len(grid)} điểm lưới, có tiếng {y.mean():.0%} thời gian, {nt} ô")
    for k in range(nt):
        blx = np.array([float(bool(parsed[i][1][k][1])) if k < len(parsed[i][1]) else 0.0 for i in idx])
        act, hist, prev, si = [], deque(), None, 0
        for t in grid:
            while si < len(parsed) and parsed[si][0] <= t:
                cur = parsed[si][1][k][0] if k < len(parsed[si][1]) else None
                if prev is not None and cur != prev:
                    hist.append(parsed[si][0])
                prev = cur
                si += 1
            while hist and hist[0] < t - 1.0:
                hist.popleft()
            act.append(len(hist) >= 2)
        act = np.array(act, float)

        def r(v):
            return f"{np.corrcoef(v, y)[0, 1]:+.2f}" if v.std() > 0 else "  — "
        print(f"ô {k}: BlxGDf r={r(blx)} khớp {np.mean(blx == y):.0%} | thanh âm lượng đổi ≥2 lần/1 s r={r(act)} "
              f"khớp {np.mean(act == y):.0%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("app", choices=["teams", "meet"])
    ap.add_argument("watch")
    ap.add_argument("truth")
    ap.add_argument("--shift", type=float, default=0.6)
    a = ap.parse_args()
    snaps = [json.loads(line) for line in open(a.watch)]
    truth = json.load(open(a.truth))
    (teams if a.app == "teams" else meet)(snaps, truth, a.shift)


if __name__ == "__main__":
    main()
