#!/usr/bin/env bash
# Thu một cảnh của spike nguồn micro trên macOS (spec 2026-10-24-nguon-micro §6.1, §6.2) bằng target/Capture.app.
# - Có --tracks: phát online.wav và room.wav bằng hai tiến trình afplay; tap CHỈ thu tiến trình phát online (--pid), nên
#   tiếng room chỉ vào micro qua loa. --room-from-phone: không phát room.wav (chủ dự án phát từ điện thoại).
# - --mic-only: không thu âm thanh máy (cảnh 4, 6, 7); khi đó online.wav không được phát.
# - Thời lượng: theo schedule.json (+6 giây), hay theo --seconds.
# Sau khi thu: chép schedule.json, online.wav, room.wav vào thư mục cảnh để score_mix.py căn và chấm.
# Dùng: bench/2026-10-24-nguon-micro/run_scene_macos.sh <thư mục cảnh ra> [--tracks DIR] [--cues FILE] [--mic ID]
#         [--room-from-phone] [--mic-only] [--seconds N]
set -euo pipefail
cd "$(dirname "$0")/../.."
out=$1; shift
tracks=""; cues=""; mic=""; room_phone=0; mic_only=0; seconds=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tracks) tracks=$2; shift 2 ;;
    --cues) cues=$2; shift 2 ;;
    --mic) mic=$2; shift 2 ;;
    --room-from-phone) room_phone=1; shift ;;
    --mic-only) mic_only=1; shift ;;
    --seconds) seconds=$2; shift 2 ;;
    *) echo "tham số lạ: $1"; exit 1 ;;
  esac
done
app=target/Capture.app
[ -d "$app" ] || { echo "chưa có $app: chạy crates/audio-capture/macos/make-app.sh capture"; exit 1; }
if [ -z "$seconds" ]; then
  [ -n "$tracks" ] || { echo "cần --tracks hay --seconds"; exit 1; }
  seconds=$(python3 -c "import json,sys; print(int(json.load(open(sys.argv[1]))['track_ms']/1000)+6)" "$tracks/schedule.json")
fi
mkdir -p "$out"
args=(--seconds "$seconds" --out "$PWD/$out" --mic "$mic")
pids=()
if [ -n "$tracks" ] && [ "$mic_only" = 0 ]; then
  afplay "$tracks/online.wav" & online=$!; pids+=("$online")
  args+=(--pid "$online")
fi
if [ "$mic_only" = 1 ]; then args+=(--mic-only); fi
if [ -n "$tracks" ] && [ "$room_phone" = 0 ]; then
  afplay "$tracks/room.wav" & pids+=("$!")
fi
[ -n "$cues" ] && args+=(--cues "$PWD/$cues")
# afplay phải đã mở đường ra âm thanh thì Core Audio mới có process object để tap theo pid.
sleep 0.5
echo "đang thu $seconds giây vào $out (Ctrl+C để hủy)"
open -W --stdout "$PWD/$out/capture.log" --stderr "$PWD/$out/capture.err" "$app" --args "${args[@]}"
for p in "${pids[@]+"${pids[@]}"}"; do wait "$p" || true; done
if [ -n "$tracks" ]; then cp "$tracks/schedule.json" "$tracks/online.wav" "$tracks/room.wav" "$out/"; fi
tail -3 "$out/capture.log"
