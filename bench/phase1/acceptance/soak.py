"""Soak test A5 (spec §3.3, §11) và tải máy (§8): lấy mẫu RAM và thời gian CPU của app và hai tiến trình phụ.

- `sample`: mỗi `--every` giây chụp danh sách tiến trình (macOS: `ps`; Windows: PowerShell `Win32_Process`), giữ tiến
  trình có tên chứa một trong `--names` và mọi tiến trình con cháu của app (`--app`), ghi CSV `t_s,pid,name,rss_kib,cpu_s,os,host`
  (giây từ lúc bắt đầu, RSS hay working set, tổng thời gian CPU). Dừng sau `--duration` giây hoặc khi bấm Ctrl+C; mỗi mẫu
  ghi ngay xuống file.
- WebView (spec §8 tính RAM "App và WebView"): trên Windows, `msedgewebview2` là con của app nên được giữ theo cây tiến
  trình; trên macOS, tiến trình XPC của WebKit (`com.apple.WebKit.*`) có cha là `launchd`, nên giữ theo tiến trình chịu
  trách nhiệm (`responsibility_get_pid_responsible_for_pid` của libSystem, gọi bằng `ctypes`, không cần quyền): chỉ WebKit
  của chính app, không lẫn WebKit của Safari hay app khác (N1 của review 08 lần 2).
- Mỗi dòng CSV ghi hệ điều hành và mã máy (`os`, `host`: 12 ký tự đầu SHA-256 của địa chỉ phần cứng, không lộ tên máy) lúc
  lấy mẫu, để kết quả tự khai nơi đo (Q1 của review 08 lần 2).
- `summarize`: A5 đạt khi mọi tên trong `--require` có mặt ở mẫu đầu, chạy đủ `--hours` giờ, không tiến trình nào biến mất
  hay khởi động lại (pid mới của một tên xuất hiện sau mẫu đầu), và RAM tổng sau giờ đầu không vượt quá 110% RAM trung
  bình của phút 55–60. Tải máy: tổng thời gian CPU chia thời gian thực và số lõi logic, mục tiêu ≤ 30% trên máy khuyến
  nghị.
- `pids`: in pid và tên các tiến trình `sample` sẽ tính (app, WebView của app, tiến trình phụ), cho bước kiểm kết nối của
  WebView ở A7 (08b Task 7; N7 của review 08 lần 2).

RSS của `llama-server` tính cả trang file model được mmap (§8), nên số tuyệt đối lớn hơn `phys_footprint`; A5 chỉ so
tương đối nên không ảnh hưởng.
"""
import argparse
import csv
import ctypes
import hashlib
import json
import os
import platform
import subprocess
import sys
import time
import uuid

DEFAULT_NAMES = ("meeting-translator", "asr-worker", "llama-server")
DEFAULT_APP = "meeting-translator"
DEFAULT_REQUIRE = ("meeting-translator", "asr-worker", "llama-server")
RAM_GROWTH_MAX = 0.10
CPU_AVG_MAX = 0.30


def parse_cputime(text):
    """Thời gian CPU của `ps -o time=`: `[[dd-]hh:]mm:ss[.ss]`, ra giây."""
    days = 0
    if "-" in text:
        d, text = text.split("-", 1)
        days = int(d)
    parts = [float(p) for p in text.split(":")]
    seconds = 0.0
    for p in parts:
        seconds = seconds * 60 + p
    return days * 86400 + seconds


def matches(name, names):
    return any(n in name for n in names)


def parse_ps(text):
    """Output của `ps -A -o pid=,ppid=,rss=,time=,comm=` (macOS): (pid, ppid, tên, RSS KiB, CPU giây).
    `comm` có thể là đường dẫn có dấu cách."""
    out = []
    for line in text.splitlines():
        fields = line.split(None, 4)
        if len(fields) < 5:
            continue
        pid, ppid, rss, cputime, comm = fields
        out.append((int(pid), int(ppid), os.path.basename(comm.strip()), int(rss), parse_cputime(cputime)))
    return out


def parse_powershell(text):
    """JSON của `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,
    KernelModeTime,UserModeTime | ConvertTo-Json` (Windows). Thời gian CPU tính bằng đơn vị 100 ns."""
    data = json.loads(text or "[]")
    if isinstance(data, dict):
        data = [data]
    out = []
    for p in data:
        name = (p.get("Name") or "").removesuffix(".exe")
        cpu = (int(p.get("KernelModeTime") or 0) + int(p.get("UserModeTime") or 0)) / 1e7
        out.append((int(p["ProcessId"]), int(p.get("ParentProcessId") or 0), name,
                    int(p.get("WorkingSetSize") or 0) // 1024, cpu))
    return out


def origin():
    """Nơi đo: hệ điều hành (`mac`, `win`, …) và mã máy không lộ tên máy."""
    system = platform.system()
    name = {"Darwin": "mac", "Windows": "win"}.get(system, system.lower())
    return {"os": name, "host": hashlib.sha256(str(uuid.getnode()).encode()).hexdigest()[:12]}


def mac_responsible():
    """Hàm pid → pid của tiến trình chịu trách nhiệm (macOS), hay None nếu không gọi được."""
    try:
        f = ctypes.CDLL(None).responsibility_get_pid_responsible_for_pid
    except (OSError, AttributeError):
        return None
    f.argtypes, f.restype = [ctypes.c_int], ctypes.c_int
    return lambda pid: f(pid)


def select(procs, names, app, responsible=None):
    """Giữ tiến trình có tên chứa một trong `names`, mọi tiến trình con cháu của tiến trình có tên chứa `app`, và (macOS)
    tiến trình WebKit mà `responsible` gán cho app."""
    parent = {pid: ppid for pid, ppid, _, _, _ in procs}
    roots = {pid for pid, _, name, _, _ in procs if app in name}

    def under_app(pid):
        seen = set()
        while pid in parent and pid not in seen:
            seen.add(pid)
            pid = parent[pid]
            if pid in roots:
                return True
        return False

    def owned(pid, name):
        return responsible is not None and "com.apple.WebKit" in name and responsible(pid) in roots

    return [(pid, name, rss, cpu) for pid, _, name, rss, cpu in procs
            if matches(name, names) or under_app(pid) or owned(pid, name)]


def snapshot(names, app=DEFAULT_APP):
    if sys.platform == "win32":
        cmd = ["powershell", "-NoProfile", "-Command",
               "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,"
               "KernelModeTime,UserModeTime | ConvertTo-Json -Compress"]
        text = subprocess.run(cmd, capture_output=True, text=True, check=True).stdout
        return select(parse_powershell(text), names, app)
    text = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,rss=,time=,comm="], capture_output=True, text=True,
                          check=True).stdout
    return select(parse_ps(text), names, app, mac_responsible() if sys.platform == "darwin" else None)


def sample(names, every, duration, out_path, snap=snapshot, clock=time.monotonic, sleep=time.sleep, app=DEFAULT_APP):
    """Ghi CSV; trả số mẫu đã lấy."""
    start = clock()
    taken = 0
    where = origin()
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["t_s", "pid", "name", "rss_kib", "cpu_s", "os", "host"])
        try:
            while True:
                t = clock() - start
                for pid, name, rss, cpu in snap(names, app):
                    w.writerow([f"{t:.1f}", pid, name, rss, f"{cpu:.2f}", where["os"], where["host"]])
                f.flush()
                taken += 1
                # Dừng theo lịch mẫu, không theo đồng hồ: mẫu thứ k ở giây k × every, mẫu cuối không quá duration.
                if taken * every > duration:
                    break
                sleep(max(0.0, start + taken * every - clock()))
        except KeyboardInterrupt:
            pass
    return taken


def read_csv(path):
    """Trả (các mẫu, các nơi đo khác nhau trong file)."""
    rows, where = [], []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((float(r["t_s"]), int(r["pid"]), r["name"], int(r["rss_kib"]), float(r["cpu_s"])))
            w = {"os": r.get("os"), "host": r.get("host")}
            if w not in where:
                where.append(w)
    return rows, where


def summarize(rows, ncpu, hours=2.0, require=DEFAULT_REQUIRE, where=None):
    """Tổng hợp các mẫu (t, pid, tên, RSS KiB, CPU giây). `where`: các nơi đo trong file (phải đúng một)."""
    one = where[0] if where and len(where) == 1 else {"os": None, "host": None}
    times = sorted({r[0] for r in rows})
    if not times:
        return {"os": None, "host": None, "samples": 0, "absent": list(require), "pass_a5": False, "pass_cpu": False}
    t0, t1 = times[0], times[-1]
    by_time = {}
    for t, pid, name, rss, cpu in rows:
        by_time.setdefault(t, []).append((pid, name, rss, cpu))
    every = (t1 - t0) / (len(times) - 1) if len(times) > 1 else 0.0
    duration = t1 - t0
    # Tên bắt buộc (app, hai tiến trình phụ) phải có ở mẫu đầu. Biến mất: tên có ở mẫu đầu mà vắng ở một mẫu sau đó.
    # Khởi động lại: pid mới của một tên xuất hiện sau mẫu đầu (nhiều pid cùng tên ngay từ đầu, như hai WebContent, thì
    # không tính).
    first_names = {name for _, name, _, _ in by_time[t0]}
    absent = [n for n in require if not any(n in name for name in first_names)]
    missing = sorted({n for t in times for n in first_names - {name for _, name, _, _ in by_time[t]}})
    first_pids = {pid for pid, _, _, _ in by_time[t0]}
    restarts = {}
    for _, pid, name, _, _ in rows:
        if pid not in first_pids:
            restarts.setdefault(name, set()).add(pid)
    restarts = {n: len(p) for n, p in sorted(restarts.items())}
    total_mib = {t: sum(r[2] for r in by_time[t]) / 1024 for t in times}
    hour1 = [total_mib[t] for t in times if 3300 <= t - t0 <= 3600]
    after = [total_mib[t] for t in times if t - t0 > 3600]
    ram_hour1 = sum(hour1) / len(hour1) if hour1 else None
    ram_after = max(after) if after else None
    growth = ram_after / ram_hour1 - 1 if ram_hour1 and ram_after is not None else None
    cpu_by_pid = {}
    for _, pid, _, _, cpu in rows:
        lo, hi = cpu_by_pid.get(pid, (cpu, cpu))
        cpu_by_pid[pid] = (min(lo, cpu), max(hi, cpu))
    cpu_s = sum(hi - lo for lo, hi in cpu_by_pid.values())
    cpu_avg = cpu_s / (duration * ncpu) if duration > 0 else None
    long_enough = duration >= hours * 3600 - 2 * every
    mixed = where is not None and len(where) != 1
    pass_a5 = (not mixed and not absent and long_enough and not missing and not restarts and growth is not None
               and growth <= RAM_GROWTH_MAX)
    return {
        "os": one["os"], "host": one["host"], "samples": len(times), "duration_s": duration, "long_enough": long_enough, "absent": absent, "missing": missing,
        "restarts": restarts, "ram_hour1_mib": ram_hour1, "ram_after_max_mib": ram_after, "ram_growth": growth,
        "ram_peak_mib": max(total_mib.values()), "cpu_avg": cpu_avg, "ncpu": ncpu, "pass_a5": pass_a5,
        "pass_cpu": not mixed and not absent and cpu_avg is not None and cpu_avg <= CPU_AVG_MAX,
    }


def fmt(value, spec):
    return "—" if value is None else format(value, spec)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Soak test A5 và tải máy §8.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sample")
    s.add_argument("--names", default=",".join(DEFAULT_NAMES), help="tên tiến trình, cách nhau bằng dấu phẩy")
    s.add_argument("--app", default=DEFAULT_APP, help="tên tiến trình của app: giữ thêm mọi tiến trình con cháu của nó")
    s.add_argument("--every", type=float, default=10.0)
    s.add_argument("--duration", type=float, default=2 * 3600 + 120)
    s.add_argument("--out", required=True)
    q = sub.add_parser("pids", help="in pid và tên các tiến trình đang tính (app, WebView, tiến trình phụ)")
    q.add_argument("--names", default=",".join(DEFAULT_NAMES))
    q.add_argument("--app", default=DEFAULT_APP)
    m = sub.add_parser("summarize")
    m.add_argument("csv")
    m.add_argument("--hours", type=float, default=2.0)
    m.add_argument("--ncpu", type=int, default=os.cpu_count())
    m.add_argument("--require", default=",".join(DEFAULT_REQUIRE),
                   help="tên phải có ở mẫu đầu (thiếu là không đạt), cách nhau bằng dấu phẩy")
    m.add_argument("--out", help="ghi kết quả JSON vào file này")
    args = ap.parse_args(argv)
    if args.cmd == "sample":
        n = sample(tuple(x for x in args.names.split(",") if x), args.every, args.duration, args.out, app=args.app)
        print(f"{n} mẫu, ghi {args.out}")
        return 0
    if args.cmd == "pids":
        for pid, name, _, _ in snapshot(tuple(x for x in args.names.split(",") if x), args.app):
            print(pid, name)
        return 0
    rows, where = read_csv(args.csv)
    out = summarize(rows, args.ncpu, args.hours, tuple(x for x in args.require.split(",") if x), where)
    print(f"Nơi đo: {out.get('os') or 'NHIỀU NƠI/KHÔNG RÕ'}, máy {out.get('host') or '—'}")
    print(f"Số mẫu: {out['samples']}; thời gian: {fmt(out.get('duration_s'), '.0f')} giây "
          f"({'đủ' if out.get('long_enough') else 'chưa đủ'} {args.hours:g} giờ)")
    if out.get("absent"):
        print(f"THIẾU tiến trình bắt buộc ở mẫu đầu: {', '.join(out['absent'])}")
    print(f"Biến mất: {', '.join(out.get('missing', [])) or 'không'}; khởi động lại: "
          f"{', '.join(f'{k} {v} lần' for k, v in out.get('restarts', {}).items()) or 'không'}")
    print(f"RAM: phút 55–60 {fmt(out.get('ram_hour1_mib'), '.0f')} MiB, lớn nhất sau giờ đầu "
          f"{fmt(out.get('ram_after_max_mib'), '.0f')} MiB, tăng {fmt(out.get('ram_growth'), '+.1%')}")
    print(f"CPU trung bình: {fmt(out.get('cpu_avg'), '.1%')} của {out.get('ncpu')} lõi")
    print(f"A5: {'ĐẠT' if out['pass_a5'] else 'KHÔNG ĐẠT'}; tải máy ≤ 30%: {'ĐẠT' if out['pass_cpu'] else 'KHÔNG ĐẠT'}")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
    return 0 if out["pass_a5"] and out["pass_cpu"] else 1


if __name__ == "__main__":
    sys.exit(main())
