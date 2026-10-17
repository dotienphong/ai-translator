#!/bin/sh
# Dựng S3Probe.app ở ~/Applications bằng phiên bản $1 (v1, v2…), ký ad-hoc như bản phát hành, cùng đường dẫn và bundle id.
set -eu
HERE=$(cd "$(dirname "$0")" && pwd)
VER=$1
APP="$HOME/Applications/S3Probe.app"
mkdir -p "$APP/Contents/MacOS"
clang -O1 -DPROBE_VERSION="\"$VER\"" -framework ApplicationServices "$HERE/s3probe.c" -o "$APP/Contents/MacOS/s3probe"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>com.aitranslator.s3probe</string>
<key>CFBundleExecutable</key><string>s3probe</string>
<key>CFBundleName</key><string>S3Probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>$VER</string>
<key>CFBundleVersion</key><string>$VER</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
codesign --force --sign - --identifier com.aitranslator.s3probe "$APP" 2>&1 | tail -1
codesign -dvvv "$APP" 2>&1 | grep -E "^Identifier|^CDHash|^Signature|flags" 
