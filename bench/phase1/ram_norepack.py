"""RAM và tốc độ của `llama-server` khi chạy bằng CPU, có và không có `--no-repack` (spec §8, "Về RAM của llama-server").

Chạy từ gốc repo:  python3 bench/phase1/ram_norepack.py
Mỗi tổ hợp (model × cờ) khởi động một `llama-server` riêng (`-ngl 0`, `-c 2048`, `-np 1`), chờ /health, dịch ba câu
Anh→Việt với `temperature 0`, rồi in RSS (MiB) sau khi nạp và sau ba câu, cùng số token/giây trung bình (từ `timings`).
Chỉ đo trên máy đang chạy. `-ngl 0` trên bản Metal của macOS không đẩy lớp nào lên GPU; số trên Windows x64 chỉ CPU phải
đo riêng.
"""
import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "src-tauri" / "binaries" / ("llama-server-aarch64-apple-darwin" if sys.platform == "darwin" else "llama-server-x86_64-pc-windows-msvc.exe")
SENTENCES = [
    "Can you share the latest version of the report after the meeting?",
    "We need to finish testing the new product next week.",
    "Please confirm the budget for next month before we start.",
]


def run(model: str, extra: list[str], port: int) -> dict:
    cmd = [str(BIN), "-m", str(ROOT / "models" / model), "--host", "127.0.0.1", "--port", str(port),
           "-c", "2048", "-np", "1", "-ngl", "0", "--no-ui", *extra]
    with tempfile.TemporaryFile() as log:
        p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=log)
        try:
            t0 = time.time()
            while True:
                try:
                    urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1)
                    break
                except Exception:
                    time.sleep(0.5)
                if time.time() - t0 > 120:
                    return {"lỗi": "không sẵn sàng sau 120 giây"}
            load = time.time() - t0

            def rss() -> float:
                return int(subprocess.check_output(["ps", "-o", "rss=", "-p", str(p.pid)]).split()[0]) / 1024

            after_load = rss()
            speeds = []
            for src in SENTENCES:
                body = json.dumps({"messages": [{"role": "user", "content":
                                   f"Translate the following text into Vietnamese, without additional explanation.\n\n{src}"}],
                                   "max_tokens": 96, "temperature": 0}).encode()
                req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/chat/completions", body,
                                             {"Content-Type": "application/json"})
                speeds.append(json.load(urllib.request.urlopen(req, timeout=120))["timings"]["predicted_per_second"])
            return {"nạp_giây": round(load, 1), "rss_sau_nạp_mib": round(after_load), "rss_sau_3_câu_mib": round(rss()),
                    "token_giây": round(sum(speeds) / len(speeds), 1)}
        finally:
            p.terminate()
            p.wait()


if __name__ == "__main__":
    port = 18080
    print("| Model | Cờ | Nạp (s) | RSS sau nạp (MiB) | RSS sau 3 câu (MiB) | token/giây |")
    print("|---|---|---|---|---|---|")
    for model in ("Hy-MT2-1.8B-Q8_0.gguf", "Hy-MT2-1.8B-Q4_K_M.gguf"):
        for extra in ([], ["--no-repack"]):
            r = run(model, extra, port)
            port += 1
            print(f"| {model} | {' '.join(extra) or '(mặc định)'} | " + " | ".join(str(r.get(k, r)) for k in
                  ("nạp_giây", "rss_sau_nạp_mib", "rss_sau_3_câu_mib", "token_giây")) + " |", flush=True)
