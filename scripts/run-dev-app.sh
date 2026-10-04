#!/bin/sh
# Chạy bản dev trong một gói `.app`, mở bằng `open` (Q-D của review 02 lần 2; như `Capture.app` của kế hoạch 0-04).
# macOS tính quyền "Ghi âm thanh hệ thống" cho app được mở bằng `open`; chạy thẳng binary từ Terminal (`pnpm tauri dev`,
# `scripts/run-dev-signed.sh`) thì quyền lại tính cho Terminal, nên các bước thử quyền của 02c Task 8 sai. Gói có
# `Info.plist` của app (câu xin quyền), hai bản `InfoPlist.strings` (en, vi) và bundle id của app; ký bằng cùng chứng thư
# cố định với `run-dev-signed.sh` (R8 của kế hoạch 00), để macOS nhớ quyền đã cấp qua các lần build.
#
#   scripts/run-dev-app.sh   # build, đóng gói vào target/AI Translator Dev.app, chạy Vite, mở app và chờ app thoát
#
# Giữ cửa sổ Terminal mở trong lúc dùng app. Thoát app bằng biểu tượng menu bar › Thoát thì script tự kết thúc; Ctrl+C
# trong Terminal thì script tắt cả Vite lẫn app. Không chạy script lần hai khi app đang chạy (script sẽ từ chối).
#
# Bản dev đọc tiến trình phụ ở `src-tauri/binaries/` (chép bằng `scripts/copy-sidecars.sh`) và giao diện từ Vite.
# App mở bằng `open` không thừa hưởng biến môi trường của shell (Nhỏ-9 của review 02 lần 3): script chuyển các biến
# `MT_*` đang đặt qua `open --env` (có từ macOS 13; app cần macOS 14.2 trở lên nên luôn dùng được). Mức log của app đặt cố
# định trong `logging.rs`, không đọc `RUST_LOG`, nên biến đó không được chuyển.
set -eu
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
target="${CARGO_TARGET_DIR:-$root/target}"
identifier=$(sed -n 's/^  "identifier": "\(.*\)",$/\1/p' "$root/src-tauri/tauri.conf.json")
app="$target/AI Translator Dev.app"

cd "$root"
# Cửa sổ của bản dev chỉ chạy khi Vite (do script này khởi động) còn sống, và `open` không mở lại app đang chạy sẵn. Có
# app hoặc Vite cũ còn đó thì chạy tiếp sẽ ra cửa sổ trắng: dừng và nói rõ cách xử lý trước khi đụng tới gói `.app`.
if pgrep -f "$app/Contents/MacOS/meeting-translator" >/dev/null; then
  echo "AI Translator Dev đang chạy. Thoát bằng biểu tượng trên menu bar › Thoát (⌘Q và Quit ở Dock bị bỏ qua), rồi chạy lại." >&2
  exit 1
fi
if lsof -nP -iTCP:1420 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Cổng 1420 đang có tiến trình khác lắng nghe (Vite cũ?). Tắt nó rồi chạy lại: lsof -nP -iTCP:1420 -sTCP:LISTEN" >&2
  exit 1
fi
cargo build -p meeting-translator
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$target/debug/meeting-translator" "$app/Contents/MacOS/meeting-translator"
cp src-tauri/Info.plist "$app/Contents/Info.plist"
plutil -replace CFBundleIdentifier -string "$identifier" "$app/Contents/Info.plist"
plutil -replace CFBundleExecutable -string meeting-translator "$app/Contents/Info.plist"
plutil -replace CFBundleName -string "AI Translator" "$app/Contents/Info.plist"
plutil -replace CFBundlePackageType -string APPL "$app/Contents/Info.plist"
# Icon của gói (Dock, Cmd+Tab): thiếu `CFBundleIconFile` và `icon.icns` thì macOS hiện icon mẫu trống.
cp src-tauri/icons/icon.icns "$app/Contents/Resources/icon.icns"
plutil -replace CFBundleIconFile -string icon "$app/Contents/Info.plist"
for lang in en vi; do
  mkdir -p "$app/Contents/Resources/$lang.lproj"
  cp "src-tauri/macos/$lang.lproj/InfoPlist.strings" "$app/Contents/Resources/$lang.lproj/"
done
plutil -lint "$app/Contents/Info.plist"
codesign --force --sign "$identity" --identifier "$identifier" "$app"
codesign --verify --verbose=2 "$app"

# Bản dev mở http://localhost:1420 do Vite phục vụ: chạy Vite trước, chờ nó sẵn sàng.
pnpm dev >/dev/null 2>&1 &
vite=$!
# Script dừng (Ctrl+C, đóng Terminal, hoặc app thoát) thì tắt luôn Vite, app và tiến trình phụ của app: app còn sống mà
# không có Vite thì cửa sổ trắng, và `llama-server` mồ côi giữ RAM/VRAM cho tới lần mở app sau.
cleanup() {
  kill "$vite" 2>/dev/null || true
  pkill -f "$app/Contents/MacOS/meeting-translator" 2>/dev/null || true
  pkill -f "$root/src-tauri/binaries/" 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP
until curl -sf http://localhost:1420 >/dev/null; do sleep 0.2; done
set --
for name in $(env | sed -n 's/^\(MT_[A-Za-z0-9_]*\)=.*/\1/p'); do
  set -- "$@" --env "$name=$(printenv "$name")"
done
open -W "$@" "$app"
