"""S3: ước lượng phần dung lượng bộ cài do các tiến trình phụ chiếm (§6.11, mục tiêu cả bộ cài ≤ 60 MB).

Gom các file sẽ đi kèm bộ cài (asr-worker, llama-server và thư viện của nó) rồi nén thử:
- LZMA (xz -9e): gần với cách NSIS nén bộ cài Windows.
- zlib -9: gần với ảnh .dmg của macOS.
Chưa tính app Tauri và WebView2 bootstrapper.

Dùng:  python3 bench/phase0/size/sidecar_size.py --label <tên> <file hoặc mẫu glob> [...]
Kết quả: bench/phase0/results/s3_size_<tên>.json.
"""
import argparse
import glob
import io
import json
import lzma
import os
import tarfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
MB = 1e6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("paths", nargs="+", help="file hoặc mẫu glob; PowerShell không tự mở rộng glob nên script tự làm")
    args = ap.parse_args()
    files = []
    for pattern in args.paths:
        hits = sorted(glob.glob(pattern)) or [pattern]
        files += [h for h in hits if os.path.isfile(h) and h not in files]
    missing = [p for p in args.paths if not glob.glob(p)]
    if missing:
        raise SystemExit(f"không thấy: {missing}")
    names = [os.path.basename(f) for f in files]
    if len(set(names)) != len(names):
        raise SystemExit("có hai file trùng tên; đổi tên trước (ví dụ asr-worker-vulkan.exe, asr-worker-cpu.exe)")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for f in files:
            tar.add(f, arcname=os.path.basename(f))
    raw = buf.getvalue()
    xz = len(lzma.compress(raw, preset=9 | lzma.PRESET_EXTREME))
    zl = len(zlib.compress(raw, 9))

    sizes = {os.path.basename(f): os.path.getsize(f) for f in files}
    for name, size in sizes.items():
        print(f"{size / MB:8.1f} MB  {name}")
    total = sum(sizes.values())
    print(f"{total / MB:8.1f} MB  tổng, chưa nén")
    print(f"{xz / MB:8.1f} MB  nén LZMA (gần NSIS)")
    print(f"{zl / MB:8.1f} MB  nén zlib (gần .dmg)")
    os.makedirs(RESULTS, exist_ok=True)
    out = os.path.join(RESULTS, f"s3_size_{args.label}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"files": sizes, "total_bytes": total, "lzma_bytes": xz, "zlib_bytes": zl}, f, indent=1)
    print("->", out)


if __name__ == "__main__":
    main()
