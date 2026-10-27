"""Mốc onnxruntime cho nhúng giọng (kế hoạch 01, Task 9b, Step 3): cùng model ERes2Net, cùng đoạn WAV và cùng cách đo như
`latency-bench embed-probe`, để biết mức RAM, thời gian và CPU mà một runtime giải phóng tensor trung gian có thể đạt. Không
phải đề xuất dùng onnxruntime (xem `results/ram.md`).

Fbank bằng `kaldi_native_fbank` như `make_fixtures.py` (trừ trung bình theo thời gian). Mỗi lần chạy một độ dài trong một tiến
trình riêng, để RSS đỉnh không cộng dồn. RSS đỉnh là `ru_maxrss` (byte trên macOS, KiB trên Linux; đã quy đổi), in ở ba
mốc: sau khi import, sau khi tạo phiên (nạp model), và cuối cùng (sau vòng đo).

python -I rss_ort.py --wav <WAV 16 kHz> --model <onnx> --start-s 120 --seconds 8 --repeat 20 [--threads 2] [--no-arena]
"""
import argparse
import resource
import sys
import time

import kaldi_native_fbank as knf
import numpy as np
import onnxruntime as ort
import soundfile as sf

RATE = 16_000


def maxrss_to_mb(value, platform):
    """`ru_maxrss` tính bằng byte trên macOS nhưng KiB trên Linux (Windows không có `resource`)."""
    return value / 1e6 if platform == "darwin" else value * 1024 / 1e6


def peak_rss_mb():
    return maxrss_to_mb(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss, sys.platform)


def cpu_ms():
    u = resource.getrusage(resource.RUSAGE_SELF)
    return (u.ru_utime + u.ru_stime) * 1000.0


def fbank(x):
    o = knf.FbankOptions()
    o.frame_opts.dither = 0
    o.frame_opts.samp_freq = RATE
    o.mel_opts.num_bins = 80
    f = knf.OnlineFbank(o)
    f.accept_waveform(RATE, x.tolist())
    f.input_finished()
    feats = np.stack([f.get_frame(i) for i in range(f.num_frames_ready)]).astype(np.float32)
    return feats - feats.mean(axis=0, keepdims=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", required=True)
    ap.add_argument("--model", required=True)
    ap.add_argument("--start-s", type=float, required=True)
    ap.add_argument("--seconds", type=float, required=True)
    ap.add_argument("--repeat", type=int, required=True)
    ap.add_argument("--threads", type=int, default=2, help="intra_op_num_threads (mặc định 2, như RAYON_NUM_THREADS=2)")
    ap.add_argument("--no-arena", action="store_true", help="tắt CPU memory arena của onnxruntime (mặc định bật)")
    a = ap.parse_args()
    assert a.repeat >= 1

    rss_import = peak_rss_mb()
    start, frames = round(a.start_s * RATE), round(a.seconds * RATE)
    x, rate = sf.read(a.wav, start=start, frames=frames, dtype="float32", always_2d=True)
    assert rate == RATE, f"cần WAV 16 kHz, nhận {rate}"
    x = x.mean(axis=1)
    assert x.size == frames, f"đoạn vượt cuối file: {x.size} mẫu"

    so = ort.SessionOptions()
    so.intra_op_num_threads = a.threads
    so.inter_op_num_threads = 1
    so.enable_cpu_mem_arena = not a.no_arena
    sess = ort.InferenceSession(a.model, so, providers=["CPUExecutionProvider"])
    # Chạy thử 1 s như `Embedder::load`.
    probe = (0.1 * np.sin(np.arange(RATE) * 0.05)).astype(np.float32)
    sess.run(None, {"x": fbank(probe)[None]})
    rss_session = peak_rss_mb()

    ms = []
    c0 = cpu_ms()
    for _ in range(a.repeat):
        t0 = time.perf_counter()
        sess.run(None, {"x": fbank(x)[None]})
        ms.append((time.perf_counter() - t0) * 1000.0)
    per = (cpu_ms() - c0) / a.repeat
    print(
        f"độ dài {a.seconds:g} s, {a.repeat} lần; p50 {np.percentile(ms, 50):.1f} ms, p90 {np.percentile(ms, 90):.1f} ms; "
        f"CPU {per:.1f} ms mỗi lần ({per / (a.seconds * 10):.1f}% một lõi so với độ dài đoạn); "
        f"RSS đỉnh: sau import {rss_import:.1f} MB, sau nạp model {rss_session:.1f} MB, cuối {peak_rss_mb():.1f} MB "
        f"(onnxruntime {ort.__version__}, {a.threads} luồng, arena {'tắt' if a.no_arena else 'bật'})"
    )


if __name__ == "__main__":
    main()
