#!/bin/sh
# Môi trường Python cho các script đo của kế hoạch 01 (ngoài repo, ở $DATA/venv).
set -eu
# Mặc định: thư mục `data-nguoi-noi` cạnh worktree (…/meeting-translator-work/); đặt DATA để dùng chỗ khác.
here=$(cd "$(dirname "$0")" && pwd)
DATA="${DATA:-$here/../../../data-nguoi-noi}"
[ -x "$DATA/venv/bin/python" ] || uv venv -q -p 3.12 "$DATA/venv"
uv pip install -q -p "$DATA/venv/bin/python" \
  kaldi-native-fbank==1.22.4 onnx==1.23.2 onnxsim==0.8.1 onnxruntime==1.31.0 \
  numpy==2.5.4 scipy==1.18.1 soundfile==0.14.0 playwright==1.64.1
"$DATA/venv/bin/python" -c "import kaldi_native_fbank, onnxsim, onnxruntime, scipy; print('ok')"
