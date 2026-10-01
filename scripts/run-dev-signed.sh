#!/bin/sh
# Chạy bản dev đã ký bằng một chứng thư cố định (R8 của kế hoạch 00). Bản `pnpm tauri dev` chỉ có
# chữ ký ad-hoc, đổi sau mỗi lần build, nên Keychain và các quyền của macOS hỏi lại mỗi lần. Ký bằng
# cùng một chứng thư thì yêu cầu định danh (designated requirement) không đổi, hệ thống nhớ quyền đã cấp.
#
# Cần một lần: tạo chứng thư ký mã trong Keychain Access (xem Task 24, dòng 29 của kế hoạch 01), hoặc dùng
# chứng thư "Apple Development" của một Apple ID. Tên chứng thư đặt qua MT_DEV_SIGN_IDENTITY.
set -eu
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
target="${CARGO_TARGET_DIR:-$root/target}"
identifier=$(sed -n 's/^  "identifier": "\(.*\)",$/\1/p' "$root/src-tauri/tauri.conf.json")

cd "$root"
cargo build -p meeting-translator
codesign --force --sign "$identity" --identifier "$identifier" "$target/debug/meeting-translator"
codesign --verify --verbose=2 "$target/debug/meeting-translator"

# Bản dev mở http://localhost:1420 do Vite phục vụ: chạy Vite trước, chờ nó sẵn sàng.
pnpm dev >/dev/null 2>&1 &
vite=$!
trap 'kill "$vite" 2>/dev/null' EXIT INT TERM
until curl -sf http://localhost:1420 >/dev/null; do sleep 0.2; done
"$target/debug/meeting-translator"
