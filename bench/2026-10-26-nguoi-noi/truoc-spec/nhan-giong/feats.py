import sys, numpy as np, soundfile as sf, kaldi_native_fbank as knf, onnxruntime as ort, time
wav, start, dur, out_npy, model = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], sys.argv[5]
x, sr = sf.read(wav, dtype="float32", start=int(start*16000), frames=int(dur*16000))
o = knf.FbankOptions(); o.frame_opts.dither = 0; o.frame_opts.samp_freq = 16000; o.mel_opts.num_bins = 80
fb = knf.OnlineFbank(o); fb.accept_waveform(16000, x.tolist()); fb.input_finished()
F = np.stack([fb.get_frame(i) for i in range(fb.num_frames_ready)]).astype(np.float32)
F = F - F.mean(0, keepdims=True)
F = F[None]
np.save(out_npy, F)
s = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
so = ort.SessionOptions()
t = []
for _ in range(5):
    t0 = time.perf_counter(); e = s.run(None, {"x": F})[0]; t.append((time.perf_counter()-t0)*1000)
np.save(out_npy.replace(".npy", "_ort.npy"), e)
print("frames", F.shape, "ort ms", [round(v,1) for v in t])
