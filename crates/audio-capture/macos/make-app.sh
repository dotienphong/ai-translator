#!/usr/bin/env bash
# S1: đóng gói công cụ capture thành Capture.app có Info.plist (NSAudioCaptureUsageDescription),
# ký với hardened runtime, để kiểm giả định 1 (§14): quyền thu âm thanh hệ thống với app đã ký, không sandbox.
# Dùng: crates/audio-capture/macos/make-app.sh  (SIGN_IDENTITY="Developer ID Application: …" để ký thật)
set -euo pipefail
cd "$(dirname "$0")/../../.."
APP=target/Capture.app
cargo build --release -p audio-capture --bin capture
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp target/release/capture "$APP/Contents/MacOS/capture"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>dev.meetingtranslator.capture</string>
  <key>CFBundleName</key><string>Capture</string>
  <key>CFBundleExecutable</key><string>capture</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>14.2</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Meeting Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</string>
</dict>
</plist>
PLIST
codesign --force --options runtime --sign "${SIGN_IDENTITY:--}" "$APP"
codesign --verify --verbose=2 "$APP"
# Mở qua `open` để app tự xin quyền theo Info.plist của nó; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
echo "Chạy thử: open -W --stdout \"$PWD/target/s1.log\" --stderr \"$PWD/target/s1.err\" $APP --args --seconds 20 --out \"$PWD/target/s1.wav\""
