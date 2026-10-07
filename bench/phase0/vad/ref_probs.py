"""S3: xác suất Silero VAD tham chiếu bằng onnxruntime, để so với bản candle-onnx trong crate `pipeline`.

Ghép 64 mẫu cuối của khung trước làm ngữ cảnh, giống OnnxWrapper trong utils_vad.py của silero-vad.

Dùng:  uv run --no-project --python 3.12 --with "onnxruntime==1.30.0" --with "numpy==2.5.3" \
         python bench/phase0/vad/ref_probs.py <model.onnx> <audio.wav> > ref.json

File thử `bench/phase0/data/vad/en.wav` (không commit) tạo bằng lệnh `say` của macOS, theo Task 2 Step 6 của
docs/superpowers/plans/2026-09-29-phase-0-03-s3-nhan-dang.md. Máy Windows chép `en.wav` và `en.ref.json` từ Mac.
"""
import json
import sys
import wave

import numpy as np
import onnxruntime as ort


def main():
    model, wav_path = sys.argv[1], sys.argv[2]
    with wave.open(wav_path) as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit("cần WAV 16 kHz, mono, 16-bit")
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    probs = []
    for i in range(len(x) // 512):
        chunk = x[i * 512:(i + 1) * 512][None, :]
        out, state = sess.run(None, {"input": np.concatenate([context, chunk], axis=1), "state": state, "sr": sr})
        context = chunk[:, -64:]
        probs.append(float(out.reshape(-1)[0]))
    print(json.dumps(probs))


if __name__ == "__main__":
    main()
