#!/bin/sh
# Kiểm kiểu và clippy phần code Windows của app ngay trên Mac (R1 của kế hoạch 00), vì chưa có máy
# Windows. Chỉ kiểm được là code biên dịch được; hành vi thật (khay, Alt+F4, thanh phụ đề topmost,
# Credential Manager) vẫn phải thử trên Windows.
# Cần một lần: rustup target add x86_64-pc-windows-msvc
set -eu
here=$(cd "$(dirname "$0")" && pwd)
RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc" \
  cargo clippy -p meeting-translator --target x86_64-pc-windows-msvc --all-targets -- -D warnings
