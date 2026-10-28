#!/bin/sh
# Tải 4 cuộc họp AMI (CC BY 4.0) và nhãn người nói của pyannote AMI-diarization-setup (spec 2026-10-26-phan-biet-nguoi-noi §3).
set -eu
# Mặc định: thư mục `data-nguoi-noi` cạnh worktree (…/meeting-translator-work/), như `setup_env.sh`; đặt DATA để dùng chỗ khác.
here=$(cd "$(dirname "$0")" && pwd)
DATA="${DATA:-$here/../../../data-nguoi-noi}/ami"
M=https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus
R=https://raw.githubusercontent.com/pyannote/AMI-diarization-setup/main/only_words/rttms/test
mkdir -p "$DATA"
for m in ES2004a TS3003a IS1009a EN2002a; do
  [ -f "$DATA/$m.Mix-Headset.wav" ] || curl -sSfL -o "$DATA/$m.Mix-Headset.wav" "$M/$m/audio/$m.Mix-Headset.wav"
  curl -sSfL -o "$DATA/$m.rttm" "$R/$m.rttm"
done
for m in ES2004a IS1009a; do
  [ -f "$DATA/$m.Array1-01.wav" ] || curl -sSfL -o "$DATA/$m.Array1-01.wav" "$M/$m/audio/$m.Array1-01.wav"
done
ls -la "$DATA"
