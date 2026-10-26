"""In dòng thời gian: sự thật (ai đang mở mic) và dấu "đang nói" đọc được, kèm độ trễ mỗi lần đổi người.
python timeline.py <tag> <regex chuỗi tên + dấu đang nói> — mặc định cho Zoom."""
import json, re, sys
tag = sys.argv[1]
T = json.load(open(f"out/{tag}-truth.json")); t0 = T["t0"]
L = [json.loads(l) for l in open(f"out/{tag}-watch.jsonl")]
pat = re.compile(sys.argv[2] if len(sys.argv) > 2 else r"^(Lan|Minh|[^,]+), .*active speaker")
def marked(r):
    out = set()
    for x in r["texts"]:
        f = x.split("|")
        for s in f[3:8]:
            m = pat.search(s)
            if m: out.add(m.group(1))
    return out
# sự thật: tập người đang mở mic theo thời gian
on = set(); ev = []
for s in T["steps"]:
    (on.add if s["on"] else on.discard)(s["g"].capitalize())
    ev.append((s["t"] - t0, frozenset(on)))
prev = None; lat = []
for r in L:
    cur = marked(r)
    if cur != prev:
        t = r["t"] - t0
        truth = next((e[1] for e in reversed(ev) if e[0] <= t), frozenset())
        print(f"{t:6.2f}  dấu: {', '.join(sorted(cur)) or '-':12s} đang mở mic: {', '.join(sorted(truth)) or '-'}")
        prev = cur
# độ trễ: mỗi lần một khách bật mic khi người kia im, thời gian tới khi dấu chỉ đúng khách đó
for i, s in enumerate(T["steps"]):
    if not s["on"]: continue
    g = s["g"].capitalize(); ts = s["t"]
    others_on = [e for e in ev if abs(e[0] - (ts - t0)) < 1e-6][0][1] - {g}
    hit = next((r["t"] for r in L if r["t"] >= ts - 0.01 and marked(r) == {g}), None)
    off = next((x["t"] for x in T["steps"][i + 1:] if x["g"] == s["g"] and not x["on"]), None)
    if hit is not None and (off is None or hit <= off):
        lat.append(hit - ts)
        print(f"  {g} bật mic lúc {ts - t0:5.1f} s{' (người kia đang nói)' if others_on else ''}: dấu sau {hit - ts:.2f} s")
    else:
        print(f"  {g} bật mic lúc {ts - t0:5.1f} s{' (người kia đang nói)' if others_on else ''}: KHÔNG có dấu trong lượt")
if lat:
    lat.sort(); print(f"độ trễ dấu: trung vị {lat[len(lat)//2]:.2f} s, lớn nhất {lat[-1]:.2f} s, {len(lat)} lượt (gồm nhịp đọc 0,25 s)")
