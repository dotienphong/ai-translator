"""Spike: gán nhãn người nói theo từng đoạn VAD (như pipeline của app) bằng nhúng giọng nói + phân cụm trực tuyến.

Bước 1 (extract): cắt đoạn bằng Silero VAD (tham số giống app), tính nhúng cho từng đoạn bằng nhiều model, lưu .npz.
Bước 2 (score): phân cụm trực tuyến theo ngưỡng, chấm so với RTTM của AMI.

python spike.py extract <data_dir> <models_dir> <out_dir> --end-silence 0.05
python spike.py score <out_dir> [--theta 0.5 ...]
"""

import argparse
import glob
import json
import os
import sys
import time

import numpy as np
import sherpa_onnx
import soundfile as sf
from scipy.optimize import linear_sum_assignment

MODELS = {
    "campplus_zh_en": "3dspeaker_speech_campplus_sv_zh_en_16k-common_advanced.onnx",
    "campplus_en_vox": "3dspeaker_speech_campplus_sv_en_voxceleb_16k.onnx",
    "eres2net_en_vox": "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx",
    "eres2netv2_zh": "3dspeaker_speech_eres2netv2_sv_zh-cn_16k-common.onnx",
    "wespeaker_r34_lm": "wespeaker_en_voxceleb_resnet34_LM.onnx",
    "titanet_small": "nemo_en_titanet_small.onnx",
}


def read_rttm(path):
    turns = []
    with open(path) as f:
        for line in f:
            p = line.split()
            if p and p[0] == "SPEAKER":
                s, d = float(p[3]), float(p[4])
                turns.append((s, s + d, p[7]))
    return turns


def vad_segments(samples, vad_model, end_silence, min_speech, max_speech, threshold):
    cfg = sherpa_onnx.VadModelConfig()
    cfg.silero_vad.model = vad_model
    cfg.silero_vad.threshold = threshold
    cfg.silero_vad.min_silence_duration = end_silence
    cfg.silero_vad.min_speech_duration = min_speech
    cfg.silero_vad.max_speech_duration = max_speech
    cfg.silero_vad.window_size = 512
    cfg.sample_rate = 16000
    cfg.num_threads = 1
    vad = sherpa_onnx.VoiceActivityDetector(cfg, buffer_size_in_seconds=60)
    segs = []
    w = 512
    for i in range(0, len(samples) - w + 1, w):
        vad.accept_waveform(samples[i : i + w])
        while not vad.empty():
            s = vad.front.start
            n = len(vad.front.samples)
            segs.append((s / 16000, (s + n) / 16000))
            vad.pop()
    vad.flush()
    while not vad.empty():
        s = vad.front.start
        n = len(vad.front.samples)
        segs.append((s / 16000, (s + n) / 16000))
        vad.pop()
    return segs


def overlap_by_speaker(seg, turns):
    s, e = seg
    out = {}
    for ts, te, spk in turns:
        o = min(e, te) - max(s, ts)
        if o > 0:
            out[spk] = out.get(spk, 0.0) + o
    return out


def extract(args):
    os.makedirs(args.out_dir, exist_ok=True)
    extractors = {}
    for name, f in MODELS.items():
        if args.models and name not in args.models:
            continue
        c = sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=os.path.join(args.models_dir, f), num_threads=1, debug=False, provider="cpu"
        )
        extractors[name] = sherpa_onnx.SpeakerEmbeddingExtractor(c)
    vad_model = os.path.join(args.models_dir, "silero_vad.onnx")
    for wav in sorted(glob.glob(os.path.join(args.data_dir, "*.wav"))):
        base = os.path.basename(wav)[: -len(".wav")]
        meeting = base.split(".")[0]
        samples, sr = sf.read(wav, dtype="float32")
        assert sr == 16000 and samples.ndim == 1
        if args.gain_norm:
            rms = np.sqrt(np.mean(samples**2)) + 1e-9
            samples = samples * (10 ** (-26 / 20) / rms)
        if args.segs_dir:
            a = np.loadtxt(os.path.join(args.segs_dir, f"{base}.es{args.segs_tag}.txt"), ndmin=2)
            segs = [(float(x) / 1000, float(y) / 1000) for x, y in a]
        else:
            segs = vad_segments(samples, vad_model, args.end_silence, args.min_speech, args.max_speech, args.threshold)
        turns = read_rttm(os.path.join(args.data_dir, meeting + ".rttm"))
        rec = {"segs": np.array(segs), "ovl": [overlap_by_speaker(s, turns) for s in segs]}
        for name, ex in extractors.items():
            embs, times = [], []
            for s, e in segs:
                st = ex.create_stream()
                st.accept_waveform(16000, samples[int(s * 16000) : int(e * 16000)])
                st.input_finished()
                t0 = time.perf_counter()
                v = np.array(ex.compute(st), dtype=np.float32)
                times.append(time.perf_counter() - t0)
                embs.append(v)
            rec[name] = np.stack(embs)
            rec[name + "_ms"] = np.array(times) * 1000
            print(f"{base} {name}: {len(segs)} đoạn, nhúng p50 {np.median(times)*1000:.1f} ms, p90 {np.percentile(times, 90)*1000:.1f} ms", flush=True)
        np.savez(
            os.path.join(args.out_dir, base + (f".{args.models[0]}" if args.models and len(args.models) == 1 else "") + ".npz"),
            segs=rec["segs"],
            ovl=np.array([json.dumps(o) for o in rec["ovl"]]),
            **{k: v for k, v in rec.items() if k not in ("segs", "ovl")},
        )


def norm(x):
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-9)


def online_cluster(embs, durs, theta, min_new, min_update, max_spk):
    """Phân cụm trực tuyến, nhân quả: mỗi đoạn chỉ thấy các đoạn trước."""
    cents, counts, labels = [], [], []
    prev = -1
    for e, d in zip(norm(embs), durs):
        if not cents:
            if d >= min_new:
                cents.append(e * d)
                counts.append(d)
                prev = 0
            labels.append(prev)
            continue
        C = norm(np.stack(cents))
        sims = C @ e
        b = int(np.argmax(sims))
        if sims[b] >= theta:
            lab = b
            if d >= min_update:
                cents[b] = cents[b] + e * d
                counts[b] += d
        elif d >= min_new and len(cents) < max_spk:
            cents.append(e * d)
            counts.append(d)
            lab = len(cents) - 1
        else:
            # Đoạn ngắn không đủ tin để mở người mới: lấy người gần nhất.
            lab = b
        labels.append(lab)
        prev = lab
    return np.array(labels)


def offline_relabel(embs, durs, theta):
    """Gom cụm lại toàn phiên (cho Lịch sử / xuất file sau phiên): agglomerative cosine, liên kết trung bình."""
    from scipy.cluster.hierarchy import fcluster, linkage

    keep = durs >= 1.0
    X = norm(embs[keep])
    Z = linkage(X, method="average", metric="cosine")
    lab_keep = fcluster(Z, t=1 - theta, criterion="distance") - 1
    # Gán đoạn ngắn về cụm có tâm gần nhất.
    k = lab_keep.max() + 1
    cents = norm(np.stack([X[lab_keep == i].mean(0) for i in range(k)]))
    labels = np.argmax(norm(embs) @ cents.T, axis=1)
    labels[keep] = lab_keep
    return labels


def score(ovl, labels, min_dur_count, durs):
    """Ánh xạ cụm → người thật (Hungarian theo thời lượng chồng), trả về các chỉ số."""
    spks = sorted({s for o in ovl for s in o})
    sidx = {s: i for i, s in enumerate(spks)}
    k = max(labels.max() + 1, 1)
    M = np.zeros((k, len(spks)))
    total = 0.0
    purity = 0.0
    for o, l in zip(ovl, labels):
        if not o:
            continue
        total += sum(o.values())
        purity += max(o.values())
        if l >= 0:
            for s, v in o.items():
                M[l, sidx[s]] += v
    r, c = linear_sum_assignment(-M)
    mapping = {int(a): int(b) for a, b in zip(r, c)}
    correct = sum(M[a, b] for a, b in mapping.items())
    # Đếm theo dòng phụ đề: đoạn ≥ min_dur_count, nhãn đúng người nói nhiều nhất trong đoạn.
    n = ok = 0
    for o, l, d in zip(ovl, labels, durs):
        if not o or d < min_dur_count:
            continue
        n += 1
        maj = max(o, key=o.get)
        if mapping.get(int(l)) == sidx[maj]:
            ok += 1
    return {
        "time_acc": correct / total,
        "purity": purity / total,
        "line_acc": ok / max(n, 1),
        "n_clusters": int(k),
        "n_true": len(spks),
    }


DEV = ("ES2004a.Mix-Headset", "TS3003a.Mix-Headset")


def load(f):
    z = np.load(f)
    segs = z["segs"]
    return z, segs[:, 1] - segs[:, 0], [json.loads(o) for o in z["ovl"]]


def run_split(args):
    """Chọn ngưỡng trên DEV (hai cuộc họp), báo kết quả trên các file còn lại với đúng ngưỡng đó."""
    files = sorted(glob.glob(os.path.join(args.out_dir, "*.npz")))
    data = {os.path.basename(f)[:-4]: load(f) for f in files}
    dev = [k for k in data if k in DEV]
    test = [k for k in data if k not in DEV]
    models = [m for m in MODELS if m in data[dev[0]][0].files]
    on_grid = [round(x, 2) for x in np.arange(0.25, 0.86, 0.05)]
    for m in models:
        best = None
        for th in on_grid:
            accs = [score(data[k][2], online_cluster(data[k][0][m], data[k][1], th, args.min_new, args.min_update, args.max_spk), 0.5, data[k][1])["time_acc"] for k in dev]
            if best is None or np.mean(accs) > best[1]:
                best = (th, np.mean(accs))
        bo = None
        for th in on_grid:
            accs = [score(data[k][2], offline_relabel(data[k][0][m], data[k][1], th), 0.5, data[k][1])["time_acc"] for k in dev]
            if bo is None or np.mean(accs) > bo[1]:
                bo = (th, np.mean(accs))
        ms = np.concatenate([data[k][0][m + "_ms"] for k in data])
        print(f"\n## {m}: θ trực tuyến {best[0]} (dev {best[1]:.1%}), θ cả phiên {bo[0]} (dev {bo[1]:.1%}), nhúng p50 {np.median(ms):.1f} ms p90 {np.percentile(ms, 90):.1f} ms")
        for k in test:
            z, durs, ovl = data[k]
            s = score(ovl, online_cluster(z[m], durs, best[0], args.min_new, args.min_update, args.max_spk), 0.5, durs)
            s2 = score(ovl, offline_relabel(z[m], durs, bo[0]), 0.5, durs)
            print(
                f"  {k:22s} trực tuyến: {s['time_acc']:.1%} thời lượng, {s['line_acc']:.1%} dòng, {s['n_clusters']} người"
                f" | cả phiên: {s2['time_acc']:.1%}, {s2['line_acc']:.1%}, {s2['n_clusters']} người | trần {s['purity']:.1%}"
            )


def run_score(args):
    if args.split:
        return run_split(args)
    files = sorted(glob.glob(os.path.join(args.out_dir, "*.npz")))
    for f in files:
        z = np.load(f)
        segs = z["segs"]
        durs = segs[:, 1] - segs[:, 0]
        ovl = [json.loads(o) for o in z["ovl"]]
        name = os.path.basename(f)[:-4]
        short = (durs < 1.0).mean()
        print(f"\n== {name}: {len(segs)} đoạn, trung vị {np.median(durs):.2f} s, < 1 s: {short:.0%}")
        for m in [k for k in MODELS if k in z.files]:
            for th in args.theta:
                lab = online_cluster(z[m], durs, th, args.min_new, args.min_update, args.max_spk)
                s = score(ovl, lab, 0.5, durs)
                lab2 = offline_relabel(z[m], durs, th)
                s2 = score(ovl, lab2, 0.5, durs)
                print(
                    f"  {m:18s} θ={th:.2f} trực tuyến: đúng {s['time_acc']:.1%} thời lượng, {s['line_acc']:.1%} dòng, {s['n_clusters']} người"
                    f" | cả phiên: {s2['time_acc']:.1%}, {s2['line_acc']:.1%}, {s2['n_clusters']} người"
                    f" | trần (độ thuần đoạn) {s['purity']:.1%} | nhúng p50 {np.median(z[m + '_ms']):.1f} ms"
                )


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("data_dir")
    e.add_argument("models_dir")
    e.add_argument("out_dir")
    e.add_argument("--end-silence", type=float, default=0.05)
    e.add_argument("--min-speech", type=float, default=0.25)
    e.add_argument("--max-speech", type=float, default=8.0)
    e.add_argument("--threshold", type=float, default=0.5)
    e.add_argument("--gain-norm", action="store_true")
    e.add_argument("--models", nargs="*")
    e.add_argument("--segs-dir")
    e.add_argument("--segs-tag", default="50")
    s = sub.add_parser("score")
    s.add_argument("out_dir")
    s.add_argument("--theta", type=float, nargs="+", default=[0.4, 0.5, 0.6])
    s.add_argument("--min-new", type=float, default=1.5)
    s.add_argument("--min-update", type=float, default=1.0)
    s.add_argument("--max-spk", type=int, default=8)
    s.add_argument("--split", action="store_true")
    a = ap.parse_args()
    if a.cmd == "extract":
        extract(a)
    else:
        run_score(a)


if __name__ == "__main__":
    sys.exit(main())
