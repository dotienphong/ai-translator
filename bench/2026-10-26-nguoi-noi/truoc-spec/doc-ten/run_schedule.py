"""Chạy kịch bản nói (Lan/Minh) trong lúc ghi cây Accessibility của app chủ phòng.

python run_schedule.py <bundle-id> <tag> <phím bật/tắt mic> [interval]
Ghi out/<tag>-watch.jsonl (axtrace watch) và out/<tag>-truth.json (thời điểm bật/tắt tiếng từng khách).
"""

import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
AX = os.path.join(HERE, "axtrace")
B = "http://127.0.0.1:8765"

# (giây bắt đầu tính từ t0, khách, bật/tắt)
STEPS = []


def seg(t, g, dur):
    STEPS.append((t, g, True))
    STEPS.append((t + dur, g, False))


t = 5.0
seg(t, "lan", 8); t += 8 + 4          # lượt dài
seg(t, "minh", 8); t += 8 + 4
for g in ["lan", "minh", "lan", "minh"]:  # lượt 4 s, nghỉ 2 s
    seg(t, g, 4); t += 4 + 2
for g in ["lan", "minh", "lan"]:      # đổi lượt không nghỉ, 3 s
    seg(t, g, 3); t += 3
t += 3
seg(t, "lan", 7); seg(t + 2, "minh", 8); t += 10 + 4  # nói chồng
seg(t, "minh", 1.5); t += 1.5 + 3     # câu rất ngắn
seg(t, "lan", 1.5); t += 1.5 + 5
END = t


def call(path):
    with urllib.request.urlopen(B + path, timeout=10) as r:
        return json.loads(r.read())


def main():
    bundle, tag = sys.argv[1], sys.argv[2]
    # Cách bật/tắt mic của khách: "key:<phím>" hoặc "sel:<css bật>||<css tắt>". Khách phải đang TẮT mic khi bắt đầu.
    how = sys.argv[3]
    if how.startswith("sel:"):
        a, b = how[4:].split("||")
        ctl = "onsel=" + urllib.parse.quote(a) + "&offsel=" + urllib.parse.quote(b)
    else:
        ctl = "key=" + urllib.parse.quote(how[4:])
    interval = sys.argv[4] if len(sys.argv) > 4 else "0.25"
    watch = subprocess.Popen([AX, "watch", bundle, os.path.join(HERE, "out", f"{tag}-watch.jsonl"), interval])
    time.sleep(1.0)
    t0 = time.time()
    truth = []
    for at, g, on in sorted(STEPS, key=lambda s: s[0]):
        dt = t0 + at - time.time()
        if dt > 0:
            time.sleep(dt)
        tc = time.time()
        if how.startswith("sel:"):
            js = "(() => { const el = document.querySelector(%s); if (!el) return 'thiếu'; el.click(); return 'ok'; })()" % json.dumps(a if on else b)
            r = call(f"/eval?g={g}&js=" + urllib.parse.quote(js))
        else:
            r = call(f"/press?g={g}&key=" + urllib.parse.quote(how[4:]))
        truth.append({"t": tc, "t_done": time.time(), "g": g, "on": on, "r": r})
    time.sleep(max(0, t0 + END - time.time()))
    watch.terminate()
    watch.wait()
    json.dump({"t0": t0, "end": t0 + END, "steps": truth}, open(os.path.join(HERE, "out", f"{tag}-truth.json"), "w"), indent=1)
    print(f"xong {tag}: {END:.0f} s, {len(truth)} lần bật/tắt")


if __name__ == "__main__":
    main()
