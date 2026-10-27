"""Sinh fixture cho crates/speaker-worker/testdata (spec §5.1): tín hiệu tất định 1,5 s, fbank tham chiếu của
kaldi-native-fbank (chưa trừ trung bình), và nhúng tham chiếu của onnxruntime (đặc trưng đã trừ trung bình theo thời gian,
như sherpa-onnx làm với model 3D-Speaker). Mọi file là f32 little-endian liền nhau.

python -I make_fixtures.py <model .onnx đã rút gọn> <thư mục testdata>
"""
import os
import sys

import kaldi_native_fbank as knf
import numpy as np
import onnxruntime as ort


def signal():
    rng = np.random.default_rng(0)
    t = np.arange(24_000) / 16_000
    chirp = np.sin(2 * np.pi * (150 + 900 * t) * t)
    tone = 0.5 * np.sin(2 * np.pi * 440 * t) * (t > 0.6)
    noise = 0.05 * rng.standard_normal(t.size)
    return (0.3 * (chirp + tone) + noise).astype(np.float32)


def fbank(x):
    o = knf.FbankOptions()
    o.frame_opts.dither = 0
    o.frame_opts.samp_freq = 16_000
    o.mel_opts.num_bins = 80
    f = knf.OnlineFbank(o)
    f.accept_waveform(16_000, x.tolist())
    f.input_finished()
    return np.stack([f.get_frame(i) for i in range(f.num_frames_ready)]).astype(np.float32)


def main():
    model, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    x = signal()
    feats = fbank(x)
    norm = feats - feats.mean(axis=0, keepdims=True)
    emb = ort.InferenceSession(model, providers=["CPUExecutionProvider"]).run(None, {"x": norm[None]})[0].ravel()
    x.tofile(os.path.join(out, "signal.f32"))
    feats.tofile(os.path.join(out, "fbank_ref.f32"))
    emb.astype(np.float32).tofile(os.path.join(out, "embed_ref.f32"))
    print(f"signal {x.size}, fbank {feats.shape}, embed {emb.shape}")


if __name__ == "__main__":
    main()
