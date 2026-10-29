"""Dựng hội thoại KIỂU CUỘC GỌI (Meet/Teams) từ giọng thật có nhãn của Common Voice tiếng Việt, cho phép đo hiệu chỉnh nhận giọng
(results/08-hieu-chinh-nguoi-noi.md). Khác `build_cv_vi.py`: 2 hoặc 3 người, có nói chồng thật (cộng hai clip, 0,3–1 s) và
lượt ngắn dưới 1 s (cắt từ giữa một câu), rồi nén kiểu cuộc gọi và mô phỏng vọng loa vào micro.

Mỗi hội thoại cơ sở (`<tên>`: 2p hay 3p, ~240 s) ra các biến thể, cùng RTTM đúng:
  <tên>-clean        bản thường 16 kHz
  <tên>-opus16/24/32 qua Opus (libopus, -application voip) 16/24/32 kbps rồi giải mã 16 kHz
  <tên>-nb8k         băng hẹp 8 kHz (hạ mẫu 8 kHz rồi nâng 16 kHz)
  <tên>-nb8k-opus12  8 kHz qua Opus 12 kbps
  <tên>-echo12/18    kênh micro của người dùng (S1): giọng S1 cộng vọng của người kia (giảm 12 hoặc 18 dB, trễ 80–200 ms,
                     tạo bằng cách trộn bản trễ vào kênh), rồi qua Opus 24 kbps. RTTM: lượt thật của S1 và lượt của người
                     kia dịch đúng độ trễ (vọng vẫn là giọng người kia).

python build_callsim.py <thư mục Common Voice (validated.tsv, clips/)> <thư mục ra> [--n2 4] [--n3 4] [--seed 100] [--seconds 240] [--tag B]
(không dùng `-I`: script nạp `build_cv_vi` cùng thư mục.)
"""
import argparse
import os
import random
import subprocess
import tempfile

import numpy as np
import soundfile as sf

import build_cv_vi as cv

SR = cv.SR
P_SAME = 0.15       # lượt này là người vừa nói nói tiếp
P_OVERLAP = 0.22    # lượt vào chồng lên cuối lượt trước (khi đổi người), 0,3–1,0 s
P_SHORT = 0.25      # lượt ngắn (0,4–0.95 s): "vâng", "ừ"
GAP = (0.10, 0.80)
OVERLAP = (0.3, 1.0)
SHORT = (0.40, 0.95)


def short_slice(rng, clip):
    """Cắt một đoạn ngắn 0,4–0,95 s từ phần có tiếng của câu, đưa RMS về mức chuẩn."""
    n = int(rng.uniform(*SHORT) * SR)
    if len(clip) <= n + 2 * cv.PAD:
        return clip[:n]
    a = rng.randint(cv.PAD, len(clip) - n - cv.PAD)
    return cv.trim_normalize(clip[a:a + n])


def build_conv(rng, pool, cv_speakers, n_people, seconds, loader=cv.load_clip):
    """Trả (mix, turns[(start, dur, nhãn S1..)], audio theo lượt [(start, audio, nhãn)])."""
    chosen = rng.sample(pool, n_people)
    queues = {s: rng.sample(cv_speakers[s], len(cv_speakers[s])) for s in chosen}
    label = {s: f"S{i + 1}" for i, s in enumerate(chosen)}
    pieces, t, prev = [], 0.0, None
    while t < seconds:
        cand = [s for s in chosen if s != prev]
        spk = prev if prev is not None and rng.random() < P_SAME else rng.choice(cand)
        if not queues[spk]:
            queues[spk] = rng.sample(cv_speakers[spk], len(cv_speakers[spk]))
        clip = loader(queues[spk].pop())
        if rng.random() < P_SHORT:
            clip = short_slice(rng, clip)
        if pieces and spk != prev and rng.random() < P_OVERLAP:
            start = max(0.0, t - rng.uniform(*OVERLAP))
        else:
            start = t + rng.uniform(*GAP)
        pieces.append((start, clip, label[spk]))
        t = max(t, start + len(clip) / SR)  # lượt ngắn chồng không kéo lùi mốc
        prev = spk
    n = int((t + 1.0) * SR) + 1
    mix = np.zeros(n, dtype=np.float32)
    for start, audio, _ in pieces:
        a = int(round(start * SR))
        mix[a:a + len(audio)] += audio
    peak = np.max(np.abs(mix))
    if peak > 0.99:
        mix *= 0.99 / peak
    turns = [(s, len(a) / SR, l) for s, a, l in pieces]
    return mix, turns, pieces


def echo_channel(rng, pieces, level_db, user="S1"):
    """Kênh micro của `user`: giọng user + vọng của người khác (trễ 80–200 ms, giảm level_db)."""
    end = max(s + len(a) / SR for s, a, _ in pieces) + 1.0
    mic = np.zeros(int(end * SR) + int(0.3 * SR), dtype=np.float32)
    turns = []
    gain = 10 ** (-level_db / 20)
    for s, a, l in pieces:
        if l == user:
            d, g = 0.0, 1.0
        else:
            d, g = rng.uniform(0.08, 0.20), gain
        i = int(round((s + d) * SR))
        mic[i:i + len(a)] += a * g
        turns.append((s + d, len(a) / SR, l))
    peak = np.max(np.abs(mic))
    if peak > 0.99:
        mic *= 0.99 / peak
    return mic, turns


def write(out, name, audio, turns):
    sf.write(os.path.join(out, name + ".wav"), audio, SR, subtype="PCM_16")
    with open(os.path.join(out, name + ".rttm"), "w") as f:
        for start, dur, spk in turns:
            f.write(f"SPEAKER {name} 1 {start:.3f} {dur:.3f} <NA> <NA> {spk} <NA> <NA>\n")


def ffm(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def opus_roundtrip(src, dst, kbps, in_rate=None):
    """src (wav) → Opus kbps (voip) → dst (wav 16 kHz mono s16). in_rate: hạ mẫu trước khi nén (băng hẹp)."""
    with tempfile.TemporaryDirectory() as tmp:
        ogg = os.path.join(tmp, "x.ogg")
        pre = ["-ar", str(in_rate)] if in_rate else []
        ffm("-i", src, *pre, "-c:a", "libopus", "-application", "voip", "-b:a", f"{kbps}k", ogg)
        ffm("-i", ogg, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16", dst)


def narrowband(src, dst):
    with tempfile.TemporaryDirectory() as tmp:
        mid = os.path.join(tmp, "n.wav")
        ffm("-i", src, "-ar", "8000", mid)
        ffm("-i", mid, "-ar", str(SR), "-ac", "1", "-sample_fmt", "s16", dst)


def variants(out, name, rttm_src):
    clean = os.path.join(out, f"{name}-clean.wav")
    for kbps in (16, 24, 32):
        opus_roundtrip(clean, os.path.join(out, f"{name}-opus{kbps}.wav"), kbps)
    narrowband(clean, os.path.join(out, f"{name}-nb8k.wav"))
    opus_roundtrip(clean, os.path.join(out, f"{name}-nb8k-opus12.wav"), 12, in_rate=8000)
    for v in ("opus16", "opus24", "opus32", "nb8k", "nb8k-opus12"):
        with open(rttm_src) as f, open(os.path.join(out, f"{name}-{v}.rttm"), "w") as g:
            g.write(f.read().replace(f"{name}-clean", f"{name}-{v}"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cv_dir")
    ap.add_argument("out")
    ap.add_argument("--n2", type=int, default=4)
    ap.add_argument("--n3", type=int, default=4)
    ap.add_argument("--seed", type=int, default=100)
    ap.add_argument("--seconds", type=float, default=240.0)
    ap.add_argument("--min-clips", type=int, default=15)
    ap.add_argument("--tag", default="", help="chèn vào tên (call<tag>2p-01) để dựng thêm lô mới cùng thư mục")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = random.Random(a.seed)
    cvs = cv.speakers(a.cv_dir, a.min_clips)
    pool = sorted(cvs)
    plan = [(2, k) for k in range(a.n2)] + [(3, k) for k in range(a.n3)]
    for people, k in plan:
        name = f"call{a.tag}{people}p-{k + 1:02d}"
        mix, turns, pieces = build_conv(rng, pool, cvs, people, a.seconds)
        write(a.out, f"{name}-clean", mix, turns)
        variants(a.out, name, os.path.join(a.out, f"{name}-clean.rttm"))
        for db in (12, 18):
            mic, t2 = echo_channel(rng, pieces, db)
            write(a.out, f"{name}-echo{db}-raw", mic, t2)
            opus_roundtrip(os.path.join(a.out, f"{name}-echo{db}-raw.wav"), os.path.join(a.out, f"{name}-echo{db}.wav"), 24)
            os.replace(os.path.join(a.out, f"{name}-echo{db}-raw.rttm"), os.path.join(a.out, f"{name}-echo{db}.rttm"))
            os.remove(os.path.join(a.out, f"{name}-echo{db}-raw.wav"))
            with open(os.path.join(a.out, f"{name}-echo{db}.rttm")) as f:
                body = f.read().replace(f"{name}-echo{db}-raw", f"{name}-echo{db}")
            with open(os.path.join(a.out, f"{name}-echo{db}.rttm"), "w") as f:
                f.write(body)
        short = sum(1 for _, d, _ in turns if d < 1.0)
        print(f"{name}: {len(mix) / SR:.0f} s, {len(turns)} lượt ({short} lượt < 1 s), {len({t[2] for t in turns})} người")


if __name__ == "__main__":
    main()
