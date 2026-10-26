#!/bin/sh
# guest_chrome.sh <tên> <url>: mở Chrome thường (không tự động) với hồ sơ tạm và micro giả là audio/<tên>.wav; in pid
D=$(cd "$(dirname "$0")" && pwd)
open -na "Google Chrome" --args --user-data-dir="$D/prof-$1" --no-first-run --no-default-browser-check \
  --use-fake-ui-for-media-stream --use-fake-device-for-media-stream \
  --use-file-for-fake-audio-capture="$D/audio/$1.wav" --lang=en-US --force-renderer-accessibility --window-size=900,700 "$2"
sleep 4
pgrep -f "user-data-dir=$D/prof-$1" | while read p; do ps -o pid=,command= -p $p | grep -v -- "--type=" | awk '{print $1}'; done
