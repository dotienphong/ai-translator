#!/usr/bin/env bash
# Đóng gói một công cụ của audio-capture thành app có Info.plist, ký với hardened runtime và đúng entitlement của app
# thật (src-tauri/release/entitlements.plist), để quyền "Ghi âm thanh hệ thống" và quyền Micro tính cho app này.
# S1 (2026-10-04) dùng cho capture; spike nguồn micro (spec 2026-10-24-nguon-micro §6.4) dùng thêm cho mic-probe.
# Dùng: crates/audio-capture/macos/make-app.sh [capture|mic-probe]  (SIGN_IDENTITY="Developer ID Application: …" để ký thật)
set -euo pipefail
cd "$(dirname "$0")/../../.."
tool=${1:-capture}
case "$tool" in
  capture) name=Capture; bundle=dev.meetingtranslator.capture ;;
  mic-probe) name=MicProbe; bundle=dev.meetingtranslator.micprobe ;;
  *) echo "công cụ không hợp lệ: $tool (capture hay mic-probe)"; exit 1 ;;
esac
APP=target/$name.app
cargo build --release -p audio-capture --bin "$tool"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "target/release/$tool" "$APP/Contents/MacOS/$tool"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$bundle</string>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleExecutable</key><string>$tool</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>14.2</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Meeting Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>Spike nguồn micro: thu micro để đo. Âm thanh không rời khỏi máy.</string>
</dict>
</plist>
PLIST
codesign --force --options runtime --entitlements src-tauri/release/entitlements.plist --sign "${SIGN_IDENTITY:--}" "$APP"
codesign --verify --verbose=2 "$APP"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q audio-input && echo "entitlement audio-input: có"
# Mở qua `open` để app tự xin quyền theo Info.plist của nó; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
echo "Chạy thử: open -W --stdout \"$PWD/target/$tool.log\" --stderr \"$PWD/target/$tool.err\" $APP --args <tham số>"
