"""Lấy mẫu CPU (%, một lõi = 100) và RAM (MB) mỗi giây của các tiến trình có tên chứa chuỗi cho trước, cộng dồn theo chuỗi;
ghi CSV (spec 2026-10-26-phan-biet-nguoi-noi §6.8, §11).

python -I cpu_sample.py <số giây> <ra.csv> <chuỗi tên>...   (ví dụ: MSTeams "Teams WebView" "Google Chrome")
"""
import subprocess
import sys
import time


def main():
    seconds, out, patterns = int(sys.argv[1]), sys.argv[2], [p.lower() for p in sys.argv[3:]]
    end = time.time() + seconds
    with open(out, "w") as f:
        f.write("t,pattern,cpu,rss_mb\n")
        while time.time() < end:
            t = time.time()
            rows = subprocess.run(["ps", "-A", "-o", "%cpu=,rss=,comm="], capture_output=True, text=True).stdout
            parsed = [r.split(None, 2) for r in rows.splitlines()]
            for p in patterns:
                cpu = sum(float(x[0]) for x in parsed if len(x) == 3 and p in x[2].lower())
                rss = sum(float(x[1]) for x in parsed if len(x) == 3 and p in x[2].lower()) / 1024
                f.write(f"{t:.1f},{p},{cpu:.1f},{rss:.0f}\n")
            time.sleep(max(0.0, 1.0 - (time.time() - t)))


if __name__ == "__main__":
    main()
