"""Tải model và llama.cpp cho Giai đoạn 0; ghi kích thước và SHA-256 vào models/MANIFEST.json.

Dùng:  python3 bench/phase0/fetch.py [--only whisper,mt,vad,llama]
Tải tiếp được khi rớt mạng (HTTP Range). Chỉ dùng thư viện chuẩn của Python.
"""
import argparse
import hashlib
import json
import os
import platform
import tarfile
import urllib.request
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "models")
TOOLS = os.path.join(ROOT, "tools")
HF = "https://huggingface.co"
# llama.cpp v0.5.0 là bản ổn định mới nhất, tương ứng build b11146 (spec §6.12).
LLAMA_TAG = "b11146"
LLAMA_URL = f"https://github.com/ggml-org/llama.cpp/releases/download/{LLAMA_TAG}"

FILES = {
    "whisper": [
        ("ggml-large-v3-turbo-q5_0.bin", f"{HF}/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"),
        ("ggml-small-q5_1.bin", f"{HF}/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin"),
    ],
    "mt": [
        ("Hy-MT2-1.8B-Q8_0.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q8_0.gguf"),
        ("Hy-MT2-1.8B-Q4_K_M.gguf", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/Hy-MT2-1.8B-Q4_K_M.gguf"),
        ("Hy-MT2-LICENSE.txt", f"{HF}/tencent/Hy-MT2-1.8B-GGUF/resolve/main/LICENSE.txt"),
    ],
    "vad": [
        ("silero_vad_v6.2.3.onnx",
         "https://raw.githubusercontent.com/snakers4/silero-vad/v6.2.3/src/silero_vad/data/silero_vad.onnx"),
    ],
}


def llama_archives():
    system, machine = platform.system(), platform.machine().lower()
    if system == "Darwin" and machine == "arm64":
        return [f"llama-{LLAMA_TAG}-bin-macos-arm64.tar.gz"]
    if system == "Windows" and machine in ("amd64", "x86_64"):
        return [f"llama-{LLAMA_TAG}-bin-win-vulkan-x64.zip", f"llama-{LLAMA_TAG}-bin-win-cpu-x64.zip"]
    raise SystemExit(f"Giai đoạn 0 chỉ hỗ trợ macOS arm64 và Windows x64, máy này là {system} {machine}")


def download(url, dest):
    if os.path.exists(dest):
        print("đã có", os.path.basename(dest))
        return
    part = dest + ".part"
    have = os.path.getsize(part) if os.path.exists(part) else 0
    req = urllib.request.Request(url, headers={"User-Agent": "meeting-translator-phase0"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    with urllib.request.urlopen(req) as resp, open(part, "ab" if have and resp.status == 206 else "wb") as f:
        total = int(resp.headers.get("Content-Length", 0)) + (have if resp.status == 206 else 0)
        done = have if resp.status == 206 else 0
        while chunk := resp.read(1 << 20):
            f.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r{os.path.basename(dest)}: {done / total:6.1%}", end="", flush=True)
    print()
    os.replace(part, dest)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(1 << 22):
            h.update(chunk)
    return h.hexdigest()


def extract(archive, into):
    os.makedirs(into, exist_ok=True)
    if archive.endswith(".zip"):
        with zipfile.ZipFile(archive) as z:
            z.extractall(into)
    else:
        with tarfile.open(archive) as t:
            t.extractall(into, filter="data")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="whisper,mt,vad,llama")
    groups = ap.parse_args().only.split(",")
    os.makedirs(MODELS, exist_ok=True)
    os.makedirs(TOOLS, exist_ok=True)
    manifest_path = os.path.join(MODELS, "MANIFEST.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for group in groups:
        if group == "llama":
            for name in llama_archives():
                archive = os.path.join(TOOLS, name)
                download(f"{LLAMA_URL}/{name}", archive)
                variant = name.removeprefix(f"llama-{LLAMA_TAG}-bin-").split(".")[0]
                extract(archive, os.path.join(TOOLS, f"llama-{LLAMA_TAG}", variant))
                manifest[name] = {"bytes": os.path.getsize(archive), "sha256": sha256(archive), "url": f"{LLAMA_URL}/{name}"}
            continue
        for name, url in FILES[group]:
            dest = os.path.join(MODELS, name)
            download(url, dest)
            manifest[name] = {"bytes": os.path.getsize(dest), "sha256": sha256(dest), "url": url}
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=1)
    for name, info in sorted(manifest.items()):
        print(f"{info['bytes'] / 1e6:10.1f} MB  {info['sha256'][:16]}…  {name}")


if __name__ == "__main__":
    main()
