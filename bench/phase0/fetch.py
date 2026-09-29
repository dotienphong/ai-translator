"""Tải model và llama.cpp cho Giai đoạn 0 vào models/ và tools/, kiểm kích thước và SHA-256, ghi models/MANIFEST.json.

Dùng:  python3 bench/phase0/fetch.py [--only whisper,mt,vad,llama]
- Cần Python 3.12 trở lên, vì giải nén an toàn bằng `tarfile` với `filter="data"`. python3 có sẵn của macOS là 3.9,
  nên trên máy chưa có Python mới thì chạy: uv run --no-project --python 3.12 python bench/phase0/fetch.py
- Mọi file đều ghim phiên bản, kèm kích thước và SHA-256:
  - file vừa tải được kiểm trước khi đổi tên từ `.part`;
  - file đã có được kiểm lại ở mỗi lần chạy.
- Rớt mạng thì chạy lại lệnh, script tải tiếp bằng HTTP Range.
- Chỉ dùng thư viện chuẩn của Python.
"""
import argparse
import hashlib
import http.client
import json
import os
import platform
import shutil
import sys
import tarfile
import time
import urllib.error
import urllib.request
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
TOOLS = os.path.join(ROOT, "tools")
HF = "https://huggingface.co"
WHISPER_REV = "5359861c739e955e79d9a303bcbc70fb988958b1"  # commit của repo ggerganov/whisper.cpp trên Hugging Face
HYMT2_REV = "a0c709d9fac510f2c807aa3af52872340dc37a4a"  # commit của repo tencent/Hy-MT2-1.8B-GGUF
# llama.cpp v0.5.0 là bản ổn định mới nhất (spec §6.12): build b11146 = commit 7fe450e19 = tag v0.5.0.
# `llama-server --version` in "0.5.0-dev (build 11146, commit 7fe450e19)".
LLAMA_TAG = "b11146"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"
TIMEOUT = 30  # giây, cho mỗi lần kết nối và mỗi lần chờ dữ liệu
RETRIES = 4
USER_AGENT = "meeting-translator-phase0"

# Mỗi mục: (tên file, URL, số byte, SHA-256).
FILES = {
    "whisper": [
        ("ggml-large-v3-turbo-q5_0.bin", f"{HF}/ggerganov/whisper.cpp/resolve/{WHISPER_REV}/ggml-large-v3-turbo-q5_0.bin",
         574041195, "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2"),
        ("ggml-small-q5_1.bin", f"{HF}/ggerganov/whisper.cpp/resolve/{WHISPER_REV}/ggml-small-q5_1.bin",
         190085487, "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb"),
    ],
    "mt": [
        ("Hy-MT2-1.8B-Q8_0.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/Hy-MT2-1.8B-Q8_0.gguf",
         1908528192, "5c3fe0b1408a5ceb0143184ef247b11b579c525f4b02b060e6c851bb76fef1a4"),
        ("Hy-MT2-1.8B-Q4_K_M.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/Hy-MT2-1.8B-Q4_K_M.gguf",
         1133080448, "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"),
        ("Hy-MT2-LICENSE.txt", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/{HYMT2_REV}/LICENSE.txt",
         11639, "a1d52d448f81c584a47c583e19dfab2d3851c7c84431b07baee093c1113ed114"),
    ],
    "vad": [
        ("silero_vad_v6.2.3.onnx",
         "https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/src/silero_vad/data/silero_vad.onnx",
         2327524, "1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"),
    ],
}
# Gói llama.cpp theo nền tảng: (tên file, số byte, SHA-256), lấy từ trang release b11146.
LLAMA = {
    "macos-arm64": [
        (f"llama-{LLAMA_TAG}-bin-macos-arm64.tar.gz",
         11189714, "1ad3f9eff80edb9dbef4259ad564d1720612ef7eea48fa4afed0e54f5f3d5711"),
    ],
    "windows-x64": [
        (f"llama-{LLAMA_TAG}-bin-win-vulkan-x64.zip",
         32127004, "55a378aa095b466979d85075234f66d7655c7a7483222af0c006c0e55b4d7bd6"),
        (f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip",
         18560055, "14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1"),
    ],
}


def llama_archives():
    system, machine = platform.system(), platform.machine().lower()
    if system == "Darwin" and machine == "arm64":
        return LLAMA["macos-arm64"]
    if system == "Windows" and machine in ("amd64", "x86_64"):
        return LLAMA["windows-x64"]
    raise SystemExit(f"Giai đoạn 0 chỉ hỗ trợ macOS arm64 và Windows x64, máy này là {system} {machine}")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 22):
            h.update(chunk)
    return h.hexdigest()


def fetch_into(url, part, have, size, name):
    """Tải phần còn thiếu vào `part`. Server bỏ qua Range (trả 200) thì ghi lại từ đầu."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    if have:
        req.add_header("Range", f"bytes={have}-")
    tty = sys.stdout.isatty()
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        resumed = have > 0 and resp.status == 206
        done, shown = (have if resumed else 0), -1
        with open(part, "ab" if resumed else "wb") as f:
            while chunk := resp.read(1 << 20):
                f.write(chunk)
                done += len(chunk)
                pct = done * 100 // size
                if tty:
                    print(f"\r{name}: {pct:3d}%", end="", flush=True)
                elif pct // 10 > shown:  # không phải terminal (log, CI): in mỗi 10%
                    shown = pct // 10
                    print(f"{name}: {pct}%", flush=True)
    if tty:
        print()


def download(url, dest, size, sha):
    """Tải về `dest.part`, kiểm kích thước và SHA-256, rồi mới đổi tên thành `dest`."""
    name, part = os.path.basename(dest), dest + ".part"
    for attempt in range(1, RETRIES + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if have > size:  # dư byte thì không thể là bản đang ghim: tải lại từ đầu
            os.remove(part)
            have = 0
        if have < size:
            try:
                fetch_into(url, part, have, size, name)
            except urllib.error.HTTPError as e:
                if e.code != 416:
                    raise
                os.remove(part)  # server không nhận Range này
                print(f"{name}: server trả 416, tải lại từ đầu")
                continue
            except (OSError, http.client.HTTPException) as e:
                print(f"{name}: {e} (lần {attempt}/{RETRIES})")
                time.sleep(2 * attempt)
                continue
        got = os.path.getsize(part)
        if got != size:  # kết nối đóng sớm: lần sau tải tiếp phần còn thiếu
            print(f"{name}: mới nhận {got}/{size} byte (lần {attempt}/{RETRIES})")
            continue
        if sha256(part) != sha:
            os.remove(part)
            raise SystemExit(f"{name}: SHA-256 không khớp bản đã ghim; đã xóa file tải dở, chạy lại để tải từ đầu")
        os.replace(part, dest)
        return
    raise SystemExit(f"{name}: chưa tải xong sau {RETRIES} lần; chạy lại để tải tiếp từ file .part")


def ensure(url, dest, size, sha):
    """Tải nếu chưa có. File đã có mà khác bản đã ghim thì dừng, không tự ghi đè."""
    if not os.path.exists(dest):
        download(url, dest, size, sha)
    elif os.path.getsize(dest) != size or sha256(dest) != sha:
        raise SystemExit(f"{os.path.basename(dest)}: khác bản đã ghim (kích thước hoặc SHA-256); xóa file rồi chạy lại")
    else:
        print("đã có", os.path.basename(dest))
    return {"bytes": size, "sha256": sha, "url": url}


def extract(archive, into):
    """Giải nén vào thư mục tạm rồi mới đổi tên, để lần chạy bị ngắt giữa chừng không để lại thư mục thiếu file."""
    if os.path.isdir(into):
        return
    tmp = into + ".tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    if archive.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            z.extractall(tmp)  # zipfile tự bỏ `..` và đường dẫn tuyệt đối
    else:
        with tarfile.open(archive) as t:
            t.extractall(tmp, filter="data")
    os.replace(tmp, into)


def load_manifest(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        print(f"bỏ qua {path} bị hỏng ({e}), ghi lại từ đầu")
        return {}


def save_manifest(path, manifest):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1)
        f.write("\n")
    os.replace(tmp, path)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # console Windows không phải lúc nào cũng UTF-8
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="whisper,mt,vad,llama")
    groups = [g.strip() for g in ap.parse_args().only.split(",") if g.strip()]
    unknown = sorted(set(groups) - set(FILES) - {"llama"})
    if unknown:
        raise SystemExit(f"nhóm không hợp lệ: {unknown}; chọn trong: {', '.join([*FILES, 'llama'])}")
    archives = llama_archives() if "llama" in groups else []  # báo sớm nếu nền tảng không hỗ trợ
    if any(name.endswith(".tar.gz") for name, _, _ in archives) and not hasattr(tarfile, "data_filter"):
        raise SystemExit("cần Python 3.12 trở lên để giải nén an toàn; chạy: "
                         "uv run --no-project --python 3.12 python bench/phase0/fetch.py")
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)
    manifest_path = os.path.join(MODELS, "MANIFEST.json")
    manifest = load_manifest(manifest_path)
    for group in groups:
        if group == "llama":
            for name, size, sha in archives:
                archive = os.path.join(TOOLS, name)
                manifest[name] = ensure(f"{LLAMA_URL}/{name}", archive, size, sha)
                variant = name.removeprefix(f"llama-{LLAMA_TAG}-bin-").split(".")[0]
                extract(archive, os.path.join(TOOLS, f"llama-{LLAMA_TAG}", variant))
            continue
        for name, url, size, sha in FILES[group]:
            manifest[name] = ensure(url, os.path.join(MODELS, name), size, sha)
    save_manifest(manifest_path, manifest)
    for name, info in sorted(manifest.items()):
        print(f"{info['bytes'] / 1e6:10.1f} MB  {info['sha256'][:16]}…  {name}")


if __name__ == "__main__":
    main()
