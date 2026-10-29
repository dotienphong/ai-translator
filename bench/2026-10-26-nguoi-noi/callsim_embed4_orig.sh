#!/bin/sh
# Nhúng lại bộ gốc (AMI A-spk1, CV A-spk2) với --max-embed-s 4 (cách speaker-worker thật nhúng), để so cùng điều kiện với
# callsim/emb4. Cache ra $DATA/out/emb4/ (AMI) và $DATA/out/vi/emb4/ (CV). Biến: W, M, DATA.
set -e
VAD=$M/models/silero_vad_v6.2.3.onnx; MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx
mkdir -p $DATA/out/emb4 $DATA/out/vi/emb4
cd $W
for w in $DATA/ami/*.wav; do n=$(basename $w .wav)
  [ -f $DATA/out/emb4/$n.emb.json ] || RAYON_NUM_THREADS=2 nice -n 10 target/release/latency-bench speaker-eval --wav $w --vad-model $VAD \
    --speaker-model $MODEL --max-embed-s 4 --embeddings-out $DATA/out/emb4/$n.emb.json --out $DATA/out/emb4/$n.jsonl >/dev/null
done
for w in $DATA/out/vi/cv-vi-*.wav; do n=$(basename $w .wav)
  [ -f $DATA/out/vi/emb4/$n.emb.json ] || RAYON_NUM_THREADS=2 nice -n 10 target/release/latency-bench speaker-eval --wav $w --vad-model $VAD \
    --speaker-model $MODEL --max-embed-s 4 --embeddings-out $DATA/out/vi/emb4/$n.emb.json --out $DATA/out/vi/emb4/$n.jsonl >/dev/null
done
echo xong
