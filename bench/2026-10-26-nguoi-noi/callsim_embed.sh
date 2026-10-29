#!/bin/sh
# Nhúng mọi bản ghi kiểu cuộc gọi một lần, lưu cache. Biến: W, M, DATA. Cache: $DATA/callsim/<tên>.emb.json (nhúng cả đoạn) và
# $DATA/callsim/emb4/<tên>.emb.json (chỉ 4 s đầu mỗi đoạn, như speaker-worker thật; rttm sao sang cùng thư mục). Lô có --tag
# (callB…) chỉ nhúng cả đoạn, không làm emb4 (đặt EMB4_ALL=1 để làm cả lô đó).
set -e
VAD=$M/models/silero_vad_v6.2.3.onnx; MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx
mkdir -p $DATA/callsim/emb4
cd $W
for w in $DATA/callsim/*.wav; do
  n=$(basename $w .wav)
  [ -f $DATA/callsim/$n.emb.json ] || RAYON_NUM_THREADS=2 nice -n 10 target/release/latency-bench speaker-eval --wav $w \
    --vad-model $VAD --speaker-model $MODEL --embeddings-out $DATA/callsim/$n.emb.json --out $DATA/callsim/$n.jsonl >/dev/null
  case $n in callB*) [ -n "$EMB4_ALL" ] || continue;; esac
  cp $DATA/callsim/$n.rttm $DATA/callsim/emb4/$n.rttm
  [ -f $DATA/callsim/emb4/$n.emb.json ] || RAYON_NUM_THREADS=2 nice -n 10 target/release/latency-bench speaker-eval --wav $w \
    --vad-model $VAD --speaker-model $MODEL --max-embed-s 4 --embeddings-out $DATA/callsim/emb4/$n.emb.json \
    --out $DATA/callsim/emb4/$n.jsonl >/dev/null
done
echo xong
