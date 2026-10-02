#!/bin/sh
# Kiểm kiểu và clippy phần code Windows của app ngay trên Mac (R1 của kế hoạch 00), vì chưa có máy
# Windows. Chỉ kiểm được là code biên dịch được; hành vi thật (khay, Alt+F4, thanh phụ đề topmost,
# Credential Manager, WASAPI loopback, Job Object) vẫn phải thử trên Windows.
# Cần một lần: rustup target add x86_64-pc-windows-msvc
# Tham số thêm được chuyển cho cargo (ví dụ `--locked`).
set -eu
here=$(cd "$(dirname "$0")" && pwd)
# tauri-build gọi trình biên dịch resource (xem fake-llvm-rc).
export RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc"
# onig_sys (candle-core → tokenizers) muốn biên dịch thư viện C oniguruma cho Windows (xem fake-pkg-config).
export PKG_CONFIG_x86_64_pc_windows_msvc="$here/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1
cargo clippy -p meeting-translator -p pipeline -p audio-capture --target x86_64-pc-windows-msvc --all-targets "$@" \
  -- -D warnings
