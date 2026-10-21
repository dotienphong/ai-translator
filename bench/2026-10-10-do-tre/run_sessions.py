"""Chạy `latency-bench session` trên 6 session S6 với một gói model (spec 2026-10-10 §9, §10.1; H7 của kế hoạch 00).

Dùng (từ gốc worktree, sau Task 0 của kế hoạch 01: `cargo build --release -p latency-bench` và `scripts/copy-sidecars.sh`):
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-moc
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label thu --sessions en,vi -- --streaming
Trên Windows: `python bench/2026-10-10-do-tre/run_sessions.py …`, truyền `--asr-worker` và `--llama-server` (mặc định là
tên sidecar của macOS); xem Task 4 của kế hoạch 04.
Tham số sau `--` được chuyển nguyên cho `latency-bench session` (kế hoạch 02 thêm các cờ của chế độ dịch trong lúc nói).

Gói: `chuan` = whisper turbo q5_0 + Hy-MT2 Q8_0; `nhe` = whisper small q5_1 + Hy-MT2 Q4_K_M; `nhanh` = whisper turbo q5_0 +
LMT-60-0.6B Q8_0 (tự thêm `--prompt lmt`). Tiến trình phụ là bản app dùng
(`src-tauri/binaries/`, do `scripts/copy-sidecars.sh` dựng). Ngôn ngữ và ngôn ngữ đích lấy từ
`bench/phase0/data/latency/sessions.json`, như `bench/phase0/latency/run_matrix.py`: session tiếng Việt dịch sang tiếng Anh,
các session khác sang tiếng Việt.

Mỗi session ghi:
- bản đầy đủ (có `events`) vào `target/do-tre/sessions/<label>-<pack>-<session>.json`, không commit; log của hai tiến
  trình phụ nằm cạnh đó (`<…>.asr-worker.log`, `<…>.llama-server.log`);
- bản rút gọn (bỏ `events`) vào `bench/2026-10-10-do-tre/results/<label>-<pack>-<session>.json`, để commit.

Trước mỗi session, dừng nếu còn `asr-worker` hay `llama-server` chạy từ thư mục này (lượt trước chết mà chưa dọn, vì bản
release đặt `panic = "abort"`). Chỉ xét tiến trình có đường dẫn nằm trong worktree: app AI Translator đã cài có thể đang
chạy tiến trình phụ của nó, không được đụng tới.
"""
import argparse
import json
import ntpath
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "latency")
FULL = os.path.join(ROOT, "target", "do-tre", "sessions")
RESULTS = os.path.join(HERE, "results")
PACKS = {
    "chuan": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
    "nhe": ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
    "nhanh": ("ggml-large-v3-turbo-q5_0.bin", "LMT-60-0.6B-Q8_0.gguf"),
}
# Họ mẫu prompt của model dịch (`--prompt` của latency-bench, spec 2026-10-21-goi-nhanh §5); gói không có ở đây là hy-mt2.
PROMPTS = {"nhanh": "lmt"}
SIDECARS = ("asr-worker", "llama-server")
WINDOWS = os.name == "nt"
# Danh sách tiến trình trên Windows: `pid<TAB>đường dẫn file chạy`, UTF-8 (đường dẫn có thể có dấu cách và chữ có dấu).
WIN_PROCESSES = ("[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
                 "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.ExecutablePath)\" }")


def strays(ps_output, roots):
    """[(pid, lệnh)] của `asr-worker`, `llama-server` chạy từ một thư mục trong `roots`, từ đầu ra của
    `ps -axo pid=,command=`."""
    found = []
    for line in ps_output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        exe = parts[1].split()[0]
        if os.path.basename(exe).startswith(SIDECARS) and any(exe.startswith(r + "/") for r in roots):
            found.append((int(parts[0]), parts[1]))
    return found


def strays_windows(listing, roots):
    """Như `strays`, từ đầu ra của `WIN_PROCESSES`. So đường dẫn không phân biệt hoa thường, như hệ tệp Windows."""
    prefixes = tuple(ntpath.normcase(r).rstrip("\\") + "\\" for r in roots)
    found = []
    for line in listing.splitlines():
        pid, _, exe = line.strip().partition("\t")
        if pid.isdigit() and ntpath.basename(exe).startswith(SIDECARS) and ntpath.normcase(exe).startswith(prefixes):
            found.append((int(pid), exe))
    return found


def running_strays():
    roots = {ROOT, os.path.realpath(ROOT)}
    if WINDOWS:
        listing = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", WIN_PROCESSES],
                                 capture_output=True, text=True, encoding="utf-8", check=True).stdout
        return strays_windows(listing, roots)
    ps = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, check=True).stdout
    return strays(ps, roots)


def slim(report):
    """Bản để commit: bỏ `events` (bản đầy đủ nằm ở `target/do-tre/sessions/`)."""
    return {k: v for k, v in report.items() if k != "events"}


def existing_results(label, pack, names, results_dir):
    """out_name (`<label>-<pack>-<name>`) của những session trong `names` đã có file trong `results_dir`:
    chạy lại với cùng `label`/`pack` sẽ ghi đè các file này.

    `results_dir` là tham số bắt buộc (không mặc định `RESULTS`): giá trị mặc định sẽ bị chốt lúc định nghĩa hàm,
    không đọc lại module global mỗi lần gọi — khác với `running_strays()` đọc `ROOT` tươi mỗi lần."""
    return [f"{label}-{pack}-{name}" for name in names
            if os.path.exists(os.path.join(results_dir, f"{label}-{pack}-{name}.json"))]


def main(argv):
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    argv = argv[:argv.index("--")] if "--" in argv else argv
    ap = argparse.ArgumentParser(description="Chạy latency-bench session trên các session S6.")
    ap.add_argument("--pack", required=True, choices=list(PACKS))
    ap.add_argument("--label", required=True, help="tên lượt, ví dụ buoc1-moc; file là <label>-<pack>-<session>.json")
    ap.add_argument("--sessions", default="", help="danh sách cách nhau bằng dấu phẩy; mặc định cả 6 session")
    ap.add_argument("--end-silence-ms", type=int, default=50)
    ap.add_argument("--asr-worker", default=os.path.join("src-tauri", "binaries", "asr-worker-aarch64-apple-darwin"))
    ap.add_argument("--llama-server", default=os.path.join("src-tauri", "binaries", "llama-server-aarch64-apple-darwin"))
    args = ap.parse_args(argv)

    with open(os.path.join(DATA, "sessions.json"), encoding="utf-8") as f:
        index = json.load(f)
    names = [n.strip() for n in args.sessions.split(",") if n.strip()] or list(index)
    unknown = [n for n in names if n not in index]
    if unknown:
        ap.error(f"không có session {', '.join(unknown)}; có: {', '.join(index)}")
    bench = os.path.join(ROOT, "target", "release", "latency-bench" + (".exe" if WINDOWS else ""))
    asr_model, mt_model = PACKS[args.pack]
    paths = [bench, os.path.join(ROOT, args.asr_worker), os.path.join(ROOT, args.llama_server),
             os.path.join(ROOT, "models", asr_model), os.path.join(ROOT, "models", mt_model)]
    paths += [os.path.join(DATA, f"{name}.{ext}") for name in names for ext in ("wav", "truth.json")]
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        raise SystemExit(f"thiếu {', '.join(missing)} (binary/model/symlink dữ liệu: xem Task 0 của kế hoạch 01; "
                          "dữ liệu gốc thiếu file: chạy bench/phase0/latency/build_sessions.py ở thư mục chính)")
    for d in (FULL, RESULTS):
        os.makedirs(d, exist_ok=True)
    overwrite = existing_results(args.label, args.pack, names, RESULTS)
    if overwrite:
        print(f"CẢNH BÁO: sẽ ghi đè kết quả cũ: {', '.join(overwrite)}", flush=True)
    for name in names:
        left = running_strays()
        if left:
            listing = ", ".join(f"pid {pid} ({cmd if WINDOWS else cmd.split()[0]})" for pid, cmd in left)
            stop = "Stop-Process -Id <pid>" if WINDOWS else "kill <pid>"
            raise SystemExit(f"dừng trước session {name}: còn tiến trình phụ của lượt trước: {listing}. "
                             f"Tắt đúng các pid này bằng `{stop}` rồi chạy lại.")
        info = index[name]
        out_name = f"{args.label}-{args.pack}-{name}"
        full = os.path.join(FULL, out_name + ".json")
        cmd = [bench, "session",
               "--wav", os.path.join(DATA, f"{name}.wav"),
               "--truth", os.path.join(DATA, f"{name}.truth.json"),
               "--asr-worker", os.path.join(ROOT, args.asr_worker),
               "--asr-model", os.path.join(ROOT, "models", asr_model),
               "--llama-server", os.path.join(ROOT, args.llama_server),
               "--mt-model", os.path.join(ROOT, "models", mt_model),
               "--languages", info["languages"], "--target", info["target"],
               "--end-silence-ms", str(args.end_silence_ms),
               "--out", full, *(["--prompt", PROMPTS[args.pack]] if args.pack in PROMPTS else []), *extra]
        print(f"== {out_name} ({info['seconds']} giây, {info['utterances']} câu)", flush=True)
        timeout_s = info["seconds"] + 1800
        error = None
        try:
            code = subprocess.run(cmd, cwd=ROOT, timeout=timeout_s).returncode
        except subprocess.TimeoutExpired:
            error = (f"{out_name}: quá giờ sau {timeout_s} giây (session dài {info['seconds']} giây + 1800 giây "
                     "dự phòng). Đã kill tiến trình latency-bench (cha); asr-worker thường tự thoát theo vì stdin "
                     "đóng, nhưng llama-server không đọc stdin (stdin null) và không ai dọn nó khi latency-bench "
                     "bị kill, nên có thể còn sống sót.")
        else:
            if code != 0:
                error = f"{out_name}: latency-bench thoát với mã {code}."
        if error:
            left = running_strays()
            more = f" Còn tiến trình phụ: {', '.join(str(pid) for pid, _ in left)}." if left else ""
            raise SystemExit(error + more)
        with open(full, encoding="utf-8") as f:
            report = json.load(f)
        with open(os.path.join(RESULTS, out_name + ".json"), "w", encoding="utf-8") as f:
            json.dump(slim(report), f, ensure_ascii=False, indent=1)
            f.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
