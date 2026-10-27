#!/bin/sh
# Dựng TccProbe.app (bundle id com.aitranslator.tccprobe), ký ad-hoc kèm hardened runtime như bản phát hành của app.
set -eu
cd "$(dirname "$0")"
APP=TccProbe.app
rm -rf "$APP" && mkdir -p "$APP/Contents/MacOS"
swiftc -O -o "$APP/Contents/MacOS/tcc-parent" parent.swift
swiftc -O -o "$APP/Contents/MacOS/tcc-child" child.swift
cat > "$APP/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.aitranslator.tccprobe</string>
  <key>CFBundleName</key><string>TccProbe</string>
  <key>CFBundleExecutable</key><string>tcc-parent</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
EOF
codesign --force --options runtime -s - "$APP/Contents/MacOS/tcc-child"
codesign --force --options runtime -s - "$APP"
codesign -dv "$APP" 2>&1 | grep -E "Identifier|Signature"
