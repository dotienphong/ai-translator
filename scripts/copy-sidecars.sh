#!/bin/sh
# Chép hai tiến trình phụ vào src-tauri/binaries/ cho bản dev trên macOS (kế hoạch 00, dòng 205 của bảng đối chiếu), tên
# kèm target triple theo quy ước `externalBin` của Tauri. Build lại app sau đó: build.rs của src-tauri băm các file này, và
# app từ chối chạy tiến trình phụ có SHA-256 khác (spec §10.2).
#
#   scripts/copy-sidecars.sh              # build asr-worker (metal, shared-encode) rồi chép
#   scripts/copy-sidecars.sh <asr-worker> # chép một bản asr-worker đã build sẵn
#
# llama-server lấy từ bản chính thức b11146 (bench/phase0/fetch.py tải vào tools/), kèm các .dylib nó cần; llama-server
# tìm chúng qua @loader_path. Bản phát hành: CI của kế hoạch 07 build và ký.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
triple=aarch64-apple-darwin
out="$root/src-tauri/binaries"
llama_dir="$root/tools/llama-b11146/macos-arm64/llama-b11146"
if [ "$#" -ge 1 ]; then
  asr="$1"
else
  (cd "$root" && cargo build --release -p asr-worker --features metal,shared-encode)
  asr="${CARGO_TARGET_DIR:-$root/target}/release/asr-worker"
fi
mkdir -p "$out"
rm -f "$out"/*
cp "$asr" "$out/asr-worker-$triple"
cp "$llama_dir/llama-server" "$out/llama-server-$triple"
for lib in libllama-server-impl libllama-common.0 libmtmd.0 libllama.0 libggml.0 libggml-base.0 libggml-cpu.0 \
  libggml-blas.0 libggml-metal.0 libggml-rpc.0; do
  cp -L "$llama_dir/$lib.dylib" "$out/"
done
ls -1 "$out"
