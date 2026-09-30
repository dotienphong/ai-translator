"""S6: chạy `latency-bench latency` cho mọi session của một máy với một gói model.

Nhãn kết quả: <máy>-<hạng>-<gói>[-ctx<N>]-<session>, ví dụ `m1-16gb-khuyennghi-chuan-en`. `summarize.py` đọc hạng từ nhãn:
- `khuyennghi`, `toithieu`: so với A2 (§8);
- `thu`: chỉ để tham khảo.
`--min-ctx N` đặt sàn cho audio_ctx (0–1500) và thêm `ctx<N>` vào nhãn, để không ghi đè kết quả không sàn.

Gói:
- `chuan` = whisper turbo + Hy-MT2 Q8_0;
- `nhe` = whisper small + Q4_K_M;
- `lai` = turbo + Q4_K_M: phương án cho máy băng thông thấp ở §8.

Dùng (từ gốc repo, sau khi build latency-bench và asr-worker):
  python3 bench/phase0/latency/run_matrix.py --machine m4pro --tier khuyennghi --package chuan
  python bench\\phase0\\latency\\run_matrix.py --machine rtx4050 --tier khuyennghi --package chuan
Thêm `--use-gpu false` để chạy bằng CPU (khi đó trên Windows dùng `--asr-worker target\\asr-worker-cpu.exe`).

Trước mỗi session, script dừng nếu còn llama-server hoặc asr-worker đang chạy (báo pid): profile release đặt
`panic = "abort"` nên `Drop` không chạy khi panic, một lượt đo chết đột ngột có thể bỏ lại chúng, và chúng làm lệch
RAM, VRAM, CPU của lượt sau.
"""
import argparse
import csv
import glob
import io
import json
import os
import platform
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "latency")
RESULTS = os.path.join(ROOT, "bench", "phase0", "results", "latency")
PACKAGES = {
    "chuan": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
    "nhe": ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
    "lai": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
}
WINDOWS = platform.system() == "Windows"
# Tiến trình con của latency-bench. Trên Windows tên có đuôi .exe, và asr-worker có hậu tố (-vulkan, -cpu).
CHILD_PROCESSES = ("llama-server", "asr-worker")


def parse_pgrep(out):
    """Đầu ra của `pgrep -l`: mỗi dòng `<pid> <tên>`."""
    found = []
    for line in out.splitlines():
        parts = line.split(None, 1)
        if parts and parts[0].isdigit():
            found.append((int(parts[0]), parts[1] if len(parts) > 1 else "?"))
    return found


def parse_tasklist(out):
    """Đầu ra của `tasklist /FO CSV /NH`: mỗi dòng `"<tên>","<pid>",...`."""
    return [(int(r[1]), r[0]) for r in csv.reader(io.StringIO(out))
            if len(r) > 1 and r[1].isdigit() and r[0].lower().startswith(CHILD_PROCESSES)]


def stray_processes():
    """[(pid, tên)] của llama-server và asr-worker còn chạy. Trước mỗi session không được còn cái nào."""
    if WINDOWS:
        out = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, encoding="utf-8",
                             errors="replace", check=True).stdout
        return parse_tasklist(out)
    res = subprocess.run(["pgrep", "-l", "-x", "|".join(CHILD_PROCESSES)], capture_output=True, text=True)
    if res.returncode == 1:  # pgrep trả 1 khi không tiến trình nào khớp
        return []
    if res.returncode != 0:
        raise SystemExit(f"pgrep lỗi (mã {res.returncode}): {res.stderr.strip()}")
    return parse_pgrep(res.stdout)


def find_llama_server(variant):
    exe = "llama-server.exe" if WINDOWS else "llama-server"
    hits = glob.glob(os.path.join(ROOT, "tools", "llama-b11146", variant, "**", exe), recursive=True)
    if not hits:
        raise SystemExit(f"không thấy {exe} trong tools/llama-b11146/{variant}; chạy bench/phase0/fetch.py trước")
    return hits[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--machine", required=True, help="tên ngắn của máy, ví dụ m1-16gb, rtx4050")
    ap.add_argument("--tier", required=True, choices=["khuyennghi", "toithieu", "thu"])
    ap.add_argument("--package", required=True, choices=list(PACKAGES))
    ap.add_argument("--sessions", default="", help="danh sách cách nhau bằng dấu phẩy; mặc định là mọi session")
    ap.add_argument("--use-gpu", default="true", choices=["true", "false"])
    ap.add_argument("--asr-worker", default=os.path.join("target", "asr-worker-vulkan.exe") if WINDOWS
                    else os.path.join("target", "release", "asr-worker"))
    ap.add_argument("--llama-variant", default="win-vulkan-x64" if WINDOWS else "macos-arm64")
    ap.add_argument("--llama-args", default="",
                    help='viết liền bằng dấu =, ví dụ --llama-args=--no-repack khi thiếu RAM lúc chạy CPU (§8); '
                         'argparse không nhận "--llama-args --no-repack"')
    ap.add_argument("--min-ctx", type=int, default=0,
                    help="sàn cho audio_ctx, 0–1500 (mặc định 0: không đặt sàn); nhãn thêm ctx<N>")
    args = ap.parse_args()
    if not 0 <= args.min_ctx <= 1500:
        ap.error("--min-ctx phải từ 0 đến 1500")

    index = json.load(open(os.path.join(DATA, "sessions.json"), encoding="utf-8"))
    names = args.sessions.split(",") if args.sessions else list(index)
    asr_model, mt_model = PACKAGES[args.package]
    bench = os.path.join(ROOT, "target", "release", "latency-bench.exe" if WINDOWS else "latency-bench")
    os.makedirs(RESULTS, exist_ok=True)
    ctx = f"-ctx{args.min_ctx}" if args.min_ctx else ""
    for name in names:
        stray = stray_processes()
        if stray:
            listing = ", ".join(f"{proc} (pid {pid})" for pid, proc in stray)
            raise SystemExit(
                f"dừng trước session {name}: còn tiến trình sót lại: {listing}.\n"
                "Lượt đo trước có thể đã chết mà không dọn được tiến trình con (profile release đặt panic = abort nên "
                "Drop không chạy). Chúng chiếm RAM, VRAM và CPU, làm lệch lượt đo này.\n"
                "Tắt chúng rồi chạy lại: macOS `kill <pid>`, Windows `taskkill /F /PID <pid>`.")
        info = index[name]
        label = f"{args.machine}-{args.tier}-{args.package}{ctx}-{name}"
        cmd = [bench, "latency",
               "--session", os.path.join(DATA, f"{name}.wav"),
               "--truth", os.path.join(DATA, f"{name}.truth.json"),
               "--asr-worker", os.path.join(ROOT, args.asr_worker),
               "--asr-model", os.path.join(ROOT, "models", asr_model),
               "--llama-server", find_llama_server(args.llama_variant),
               "--mt-model", os.path.join(ROOT, "models", mt_model),
               "--vad-model", os.path.join(ROOT, "models", "silero_vad_v6.2.3.onnx"),
               "--languages", info["languages"], "--target", info["target"],
               "--use-gpu", args.use_gpu, "--label", label,
               "--out", os.path.join(RESULTS, f"{label}.json"),
               "--log-dir", os.path.join(DATA, "logs")]
        if args.llama_args:
            cmd.append(f"--llama-args={args.llama_args}")
        if args.min_ctx:
            cmd += ["--min-ctx", str(args.min_ctx)]
        print(f"== {label} ({info['seconds']} giây, {info['utterances']} câu)", flush=True)
        subprocess.run(cmd, check=True)


if __name__ == "__main__":
    main()
