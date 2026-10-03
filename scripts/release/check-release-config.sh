#!/bin/sh
# Kiểm hai file cấu hình đóng gói (src-tauri/release/tauri.macos.json, tauri.windows.json) mà không cần build bản phát hành
# (kế hoạch 07a). tauri-build đọc cấu hình gộp qua biến TAURI_CONFIG: khóa sai tên thì báo lỗi (`unknown field`), và nó
# chép `externalBin`, `resources` vào thư mục target như lúc đóng gói, nên đường dẫn và mẫu glob sai cũng lộ ra.
#
#   scripts/release/check-release-config.sh
#
# Chạy trên Mac (phần Windows qua scripts/check-windows.sh, cần `rustup target add x86_64-pc-windows-msvc`). Tiến trình phụ
# nào chưa có trong src-tauri/binaries/ thì tạm đặt file giả cùng tên, xong thì xóa đúng các file giả đó; file thật không bị đụng.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd)
bin="$root/src-tauri/binaries"
target="${CARGO_TARGET_DIR:-$root/target}"
created=""
cleanup() {
  for f in $created; do rm -f "$bin/$f"; done
}
trap cleanup EXIT INT TERM
placeholder() {
  if [ ! -e "$bin/$1" ]; then
    printf 'placeholder' >"$bin/$1"
    created="$created $1"
  fi
}
# tauri-build phải đã chép từng file (tên sau khi đóng gói) vào thư mục target.
copied() {
  dir=$1
  shift
  for f in "$@"; do
    if [ ! -f "$dir/$f" ]; then
      echo "tauri-build không chép $f vào $dir" >&2
      exit 1
    fi
    echo "đã chép $f"
  done
}
mkdir -p "$bin"
if [ ! -f "$root/THIRD_PARTY_NOTICES.txt" ]; then
  echo "thiếu THIRD_PARTY_NOTICES.txt: chạy scripts/release/notices.mjs trước" >&2
  exit 1
fi

echo "== tauri.macos.json"
placeholder asr-worker-aarch64-apple-darwin
placeholder llama-server-aarch64-apple-darwin
(cd "$root" && TAURI_CONFIG="$(cat src-tauri/release/tauri.macos.json)" cargo check -q --locked -p meeting-translator)
copied "$target/debug" asr-worker llama-server THIRD_PARTY_NOTICES.txt

echo "== tauri.windows.json"
for name in asr-worker-vulkan asr-worker-cpu llama-server; do placeholder "$name-x86_64-pc-windows-msvc.exe"; done
placeholder ggml-placeholder.dll
(cd "$root" && TAURI_CONFIG="$(cat src-tauri/release/tauri.windows.json)" ./scripts/check-windows.sh -q --locked)
copied "$target/x86_64-pc-windows-msvc/debug" asr-worker-vulkan.exe asr-worker-cpu.exe llama-server.exe ggml-placeholder.dll \
  THIRD_PARTY_NOTICES.txt
echo "hai cấu hình đóng gói hợp lệ"
