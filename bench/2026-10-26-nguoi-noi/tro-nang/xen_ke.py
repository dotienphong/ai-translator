"""Đo phần tốn thêm của Teams hay Chrome khi bật trợ năng và đọc cây, xen kẽ các chế độ trong cùng một cuộc họp (spec
2026-10-26-phan-biet-nguoi-noi §6.8, §11; kế hoạch 01, Task 12). Mỗi đoạn: chờ 5 s cho ổn rồi lấy ảnh chụp `rus` đầu và cuối,
tính theo nhóm tiến trình: %CPU (thời gian), tỉ lệnh/giây, tỉ chu kỳ/giây, mW (năng lượng ước tính của macOS).

Chế độ: A (không đặt gì, không đọc), B0 (đặt AXEnhancedUserInterface, không đọc), B1 (đặt và đọc cửa sổ họp 1 lần/giây bằng
`axtrace watch`), B4 (4 lần/giây), R1, R4 (chạy `ax-record stats` của kế hoạch 04: bộ đọc thật, 1 hay 4 lượt mỗi giây). Sau mỗi đoạn B*: `axtrace noaccess` (đặt lại false) rồi chờ (Chrome gỡ cây; Teams thì không).

python -I xen_ke.py teams  <tag> <giây mỗi đoạn> A,B4,A,B1,A,B4    khách Lan, Minh của guests.py nói luân phiên (6 s nói, 2 s nghỉ)
python -I xen_ke.py chrome <tag> <giây mỗi đoạn> A,B4,B0,B1,A,B4   giọng đọc máy `say` qua loa, cửa sổ Meet thứ hai thu bằng micro
Biến: AXTRACE_PID = pid tiến trình chính của MSTeams hay Google Chrome (bắt buộc), DATA = thư mục dữ liệu (ra $DATA/out/<tag>.json).
Cần dựng trước: `rus`, `axprobe` (thư mục này), `axtrace` (truoc-spec/doc-ten). Bản ghi cây và sự thật ghi vào truoc-spec/doc-ten/out/.
"""
import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DT = os.path.join(HERE, "..", "truoc-spec", "doc-ten")
AX = os.path.join(DT, "axtrace")
AXREC = os.environ.get("AX_RECORD", os.path.join(HERE, "..", "..", "..", "target", "release", "ax-record"))
APPKEY = {"teams": "teams", "chrome": "meet_chrome"}[sys.argv[1]]
# Meet không có trong công thức build sẵn (QĐ 32 của kế hoạch 04): dùng công thức riêng của thư mục fixture.
RECIPE = [] if APPKEY == "teams" else ["--recipe", os.path.join(HERE, "..", "..", "..", "scripts", "speaker-recipes", "fixtures", "meet-macos.recipes.json")]
APP, TAG, SEG, MODES = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4].split(",")
PID = int(os.environ["AXTRACE_PID"])
BUNDLE = {"teams": "com.microsoft.teams2", "chrome": "com.google.Chrome"}[APP]
WIN = {"teams": "^Meeting", "chrome": "^Meet"}[APP]
LINES = ["Hello everyone, this is a short test of the meeting audio, please ignore it.",
         "We are checking whether the speaking indicator is visible to assistive technology.",
         "Short sentence.", "This is the last test sentence, thank you for your patience, goodbye.",
         "The design review should finish before the end of the month.", "Okay."]
MIC_ON = '(() => { const el = document.querySelector("#mic-button[aria-label=\\"Unmute mic\\"]"); if (!el) return "thiếu"; el.click(); return "ok"; })()'
MIC_OFF = '(() => { const el = document.querySelector("#mic-button[aria-label=\\"Mute mic\\"]"); if (!el) return "thiếu"; el.click(); return "ok"; })()'
stop = False
steps = []


def guest(g, js):
    url = "http://127.0.0.1:8765/eval?g=%s&js=%s" % (g, urllib.parse.quote(js))
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read())


def wait(sec):
    end = time.time() + sec
    while not stop and time.time() < end:
        time.sleep(0.1)


def speak():
    i = 0
    while not stop:
        if APP == "chrome":
            steps.append({"t": time.time(), "g": "nguoinoi", "on": True})
            subprocess.run(["say", "-v", "Samantha", LINES[i % len(LINES)]])
            steps.append({"t": time.time(), "g": "nguoinoi", "on": False})
            wait(3.5)
        else:
            g = ("lan", "minh")[i % 2]
            t = time.time()
            steps.append({"t": t, "g": g, "on": True, "r": guest(g, MIC_ON)})
            wait(6)
            t = time.time()
            steps.append({"t": t, "g": g, "on": False, "r": guest(g, MIC_OFF)})
            wait(2)
        i += 1


def names():
    out = subprocess.run(["ps", "-A", "-o", "pid=,comm="], capture_output=True, text=True).stdout
    return {int(r.split(None, 1)[0]): r.split(None, 1)[1].lower() for r in out.splitlines() if len(r.split(None, 1)) == 2}


def group(x, n):
    if x["pid"] == PID:
        return "main"
    if n.endswith("/axtrace") or n.endswith("/ax-record"):
        return "axtrace"
    if APP == "teams":
        return "teams_webview" if "teams webview" in n else "chrome_khach" if "google chrome" in n else "khac"
    if "google chrome" in n:
        return "renderer" if x["renderer"] else "helper"
    return "khac"


def snap(nm):
    d = json.loads(subprocess.run([os.path.join(HERE, "rus"), "/"], capture_output=True, text=True).stdout)
    for x in d["p"]:
        x["grp"] = group(x, nm.get(x["pid"], ""))
    return d


def diff(a, b):
    dt = b["t"] - a["t"]
    before = {x["pid"]: x for x in a["p"]}
    acc = {}
    for x in b["p"]:
        y = before.get(x["pid"])
        if y is None:
            continue
        s = acc.setdefault(x["grp"], [0.0, 0.0, 0.0, 0.0])
        for k, key in enumerate(("cpu_s", "instr", "cycles", "energy_nj")):
            s[k] += x[key] - y[key]
    return {g: {"cpu%": round(100 * v[0] / dt, 1), "Ginstr/s": round(v[1] / dt / 1e9, 3),
                "Gcyc/s": round(v[2] / dt / 1e9, 3), "mW": round(v[3] / dt / 1e6, 1)} for g, v in acc.items()}


def main():
    global stop
    th = threading.Thread(target=speak)
    th.start()
    t0 = time.time()
    res = []
    time.sleep(3)
    for k, mode in enumerate(MODES):
        w = None
        if mode in ("B1", "B4"):
            env = dict(os.environ, AXTRACE_EUI="1", AXTRACE_WIN=WIN)
            out = os.path.join(DT, "out", f"{TAG}-{k}{mode}-watch.jsonl")
            w = subprocess.Popen([AX, "watch", BUNDLE, out, "1.0" if mode == "B1" else "0.25"], env=env)
        elif mode == "B0":
            subprocess.run([os.path.join(HERE, "axprobe"), "set", str(PID), "AXEnhancedUserInterface", "1"], capture_output=True)
        elif mode in ("R1", "R4"):
            out = os.path.join(DT, "out", f"{TAG}-{k}{mode}-reader.jsonl")
            marker = os.path.join(os.environ["DATA"], "out", "eui-marker.json")
            w = subprocess.Popen([AXREC, "stats", APPKEY, out, "--rate", mode[1], "--seconds", str(int(SEG)), "--marker", marker] + RECIPE + os.environ.get("AX_RECORD_ARGS", "").split())
        time.sleep(5)
        nm = names()
        s1 = snap(nm)
        time.sleep(SEG - 5)
        nm.update(names())
        s2 = snap(nm)
        if mode != "A":
            if w:
                if mode.startswith("R"):
                    w.wait(timeout=SEG + 15)
                else:
                    w.terminate()
                    w.wait()
            subprocess.run([AX, "noaccess", BUNDLE], env=dict(os.environ), capture_output=True)
            time.sleep(8 if APP == "chrome" else 3)
        r = {"doan": k, "che_do": mode, "do": diff(s1, s2)}
        res.append(r)
        print(json.dumps(r, ensure_ascii=False), flush=True)
    stop = True
    th.join()
    json.dump({"t0": t0, "end": time.time(), "steps": steps}, open(os.path.join(DT, "out", f"{TAG}-truth.json"), "w"), indent=1)
    json.dump(res, open(os.path.join(os.environ["DATA"], "out", f"{TAG}.json"), "w"), indent=1)
    print("xong", TAG)


if __name__ == "__main__":
    main()
