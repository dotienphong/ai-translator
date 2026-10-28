"""Dò "ai đang nói" KHÔNG dùng tên lớp CSS cụ thể.
Teams: neo = phần tử có id DOM bắt đầu bằng 'roster-avatar-img-' (id có nghĩa) + tên khách ở trường help/title;
  "đang nói" = lớp CSS của phần tử neo KHÁC lớp thường gặp nhất của chính nó (không cần biết lớp mới tên gì).
Meet: neo = chữ tên người; "đang nói" = các phần tử có lớp CSS ngay trước chữ tên đổi lớp nhiều lần trong 1 s gần nhất.
Chấm: so với sự thật (ai đang mở mic, trễ 0,6 s)."""
import json, os, sys

# Tên hiển thị của người trong phòng Meet thử (cùng một tài khoản vào hai lần): đặt bằng biến MEET_NAME.
MEET_NAME = os.environ.get("MEET_NAME", "")
from collections import Counter, defaultdict, deque

def truth_fn(T):
    t0 = T["t0"]; on = set(); ev = []
    for s in T["steps"]:
        (on.add if s["on"] else on.discard)(s["g"]); ev.append((s["t"] - t0, frozenset(on)))
    return t0, lambda t: next((e[1] for e in reversed(ev) if e[0] <= t), frozenset())

def teams(tag):
    T = json.load(open(f"out/{tag}-truth.json")); t0, truth = truth_fn(T)
    L = [json.loads(l) for l in open(f"out/{tag}-watch.jsonl")]
    seq = []
    for r in L:
        cur = {}
        for x in r["texts"]:
            f = x.split("|")
            if f[8].startswith("roster-avatar-img-") and f[7]:
                cur[f[7].split(" (")[0].lower()] = f[9]
        seq.append((r["t"] - t0, cur))
    mode = {g: Counter(c[g] for _, c in seq if g in c).most_common(1)[0][0] for g in ("lan", "minh")}
    ok = n = 0
    for t, cur in seq:
        if t < 2: continue
        det = {g for g in ("lan", "minh") if g in cur and cur[g] != mode[g]}
        tr = set(truth(t - 0.6))
        n += 1; ok += det == tr
    print(f"Teams ({tag}): khớp sự thật {ok}/{n} ảnh chụp = {ok/n:.0%} (không dùng tên lớp nào)")

def meet(tag):
    T = json.load(open(f"out/{tag}-truth.json")); t0 = T["t0"]
    ons = [s["t"] - t0 for s in T["steps"]]
    speaking = lambda t: any(ons[i] <= t < ons[i + 1] + 1.5 for i in range(0, len(ons), 2))  # đuôi 1,5 s như đã thấy
    L = [json.loads(l) for l in open(f"out/{tag}-watch.jsonl")]
    hist = defaultdict(deque); prev = {}
    ok = n = 0
    for r in L:
        t = r["t"] - t0
        lines = r["texts"]; tiles = []
        for i, x in enumerate(lines):
            f = x.split("|")
            if f[1] == "AXStaticText" and f[5] == MEET_NAME:
                cls = tuple(lines[j].split("|")[-1] for j in range(max(0, i - 3), i) if lines[j].split("|")[-1])
                tiles.append(cls)
        act = []
        for k, cls in enumerate(tiles):
            if prev.get(k) is not None and prev[k] != cls: hist[k].append(t)
            prev[k] = cls
            while hist[k] and hist[k][0] < t - 1.0: hist[k].popleft()
            act.append(len(hist[k]) >= 2)
        if t < 2 or len(act) < 4: continue
        # ô 1 và 2 (cửa sổ người nói và ô người nói ở cửa sổ chủ phòng) phải "đang nói" khi có tiếng
        n += 1; ok += (act[1] or act[2]) == speaking(t)
    print(f"Meet ({tag}): khớp sự thật {ok}/{n} ảnh chụp = {ok/n:.0%} (không dùng tên lớp nào)")

teams("teams"); meet("meet-2p")
