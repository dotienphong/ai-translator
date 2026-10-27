"""Dựng hội thoại tiếng Việt nhiều người từ Common Voice (CC0, có mã người nói `client_id`) cho A-spk2 (spec
2026-10-26-phan-biet-nguoi-noi §12). Mỗi hội thoại ~5 phút, 3–4 người; lượt nói 1–2 câu (cách nhau 0,25 s); 15% lượt là
cùng người nói tiếp; khoảng nghỉ giữa lượt 0,15–1,2 s; 10% lượt chen vào cuối lượt trước 0,3–1,0 s. Mỗi câu cắt im lặng hai
đầu (chừa 0,1 s) và chuẩn hóa về −26 dBFS. Ra: <tên>.wav (16 kHz mono 16 bit), <tên>.rttm, và <tên>-opus.wav (qua Opus 24 kbps
rồi giải mã lại, giả tiếng qua app họp) cùng <tên>-opus.rttm.

Thư mục Common Voice cần `validated.tsv` (cột `client_id`, `path`) và `clips/<path>`. Chỉ những dòng có file trong `clips/` được
dùng (bản tải về có thể chỉ gồm một phần clip của `validated.tsv`). `client_id` là mã băm của phiên trình duyệt, được coi là một
người nói; hiếm khi một mã gồm nhiều người dùng chung máy hay một người có nhiều mã (nhãn nhiễu này làm số đo thận trọng hơn).
Người nói có ít hơn ~20 câu thì câu bị dùng lại trong một hội thoại (in số câu dùng lại ở mỗi hội thoại).

python -I build_cv_vi.py <thư mục CV (validated.tsv, clips/)> <thư mục ra> [--n 6] [--seed 0]
"""
import argparse
import csv
import os
import random
import shutil
import subprocess
import tempfile

import numpy as np
import soundfile as sf

SR = 16_000
PAD = 1600  # 0,1 s chừa lại hai đầu mỗi câu sau khi cắt im lặng
TARGET_DBFS = -26.0
WITHIN_TURN_GAP = 0.25  # giữa hai câu trong cùng một lượt (giây)
P_SAME_SPEAKER = 0.15  # xác suất lượt này là người vừa nói nói tiếp
P_BARGE_IN = 0.10  # xác suất lượt chen vào cuối lượt trước (chỉ khi đổi người)
GAP_RANGE = (0.15, 1.2)  # nghỉ giữa hai lượt (giây)
BARGE_RANGE = (0.3, 1.0)  # chen vào sớm hơn cuối lượt trước (giây)


def trim_normalize(x):
    """Cắt im lặng hai đầu (ngưỡng 2% đỉnh, chừa PAD mẫu) rồi đưa RMS về TARGET_DBFS."""
    x = np.asarray(x, dtype=np.float32)
    peak = np.max(np.abs(x)) if x.size else 0.0
    if peak > 0:
        idx = np.where(np.abs(x) > 0.02 * peak)[0]
        x = x[max(0, idx[0] - PAD): idx[-1] + PAD]
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9 if x.size else 1e-9
    return (x * (10 ** (TARGET_DBFS / 20) / rms)).astype(np.float32)


def load_clip(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return trim_normalize(np.frombuffer(raw, dtype=np.float32))


def speakers(cv_dir, min_clips):
    """{client_id: [đường dẫn clip có thật]} cho người có ≥ min_clips clip."""
    by = {}
    clips = os.path.join(cv_dir, "clips")
    with open(os.path.join(cv_dir, "validated.tsv"), newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
            p = os.path.join(clips, row["path"])
            if os.path.isfile(p):
                by.setdefault(row["client_id"], []).append(p)
    return {k: v for k, v in by.items() if len(v) >= min_clips}


def build(rng, pool, cv_speakers, seconds, loader=load_clip):
    """Dựng một hội thoại. Trả (âm thanh, [(bắt đầu, độ dài, nhãn)], số câu dùng lại)."""
    chosen = rng.sample(pool, rng.choice([3, 4]))
    queues = {s: rng.sample(cv_speakers[s], len(cv_speakers[s])) for s in chosen}
    label = {s: f"S{i + 1}" for i, s in enumerate(chosen)}
    pieces, turns, t, prev = [], [], 0.0, None
    loaded = 0
    used = set()
    while t < seconds:
        spk = prev if prev is not None and rng.random() < P_SAME_SPEAKER else rng.choice([s for s in chosen if s != prev])
        clips = []
        for _ in range(rng.choice([1, 2])):
            if not queues[spk]:
                queues[spk] = rng.sample(cv_speakers[spk], len(cv_speakers[spk]))
            path = queues[spk].pop()
            loaded += 1
            used.add(path)
            clips.append(loader(path))
        gap = np.zeros(int(WITHIN_TURN_GAP * SR), dtype=np.float32)
        audio = np.concatenate([c if i == 0 else np.concatenate([gap, c]) for i, c in enumerate(clips)])
        if turns and spk != prev and rng.random() < P_BARGE_IN:
            start = max(0.0, t - rng.uniform(*BARGE_RANGE))
        else:
            start = t + rng.uniform(*GAP_RANGE)
        pieces.append((start, audio))
        turns.append((start, len(audio) / SR, label[spk]))
        t = start + len(audio) / SR
        prev = spk
    mix = np.zeros(int((t + 1.0) * SR) + 1, dtype=np.float32)
    for start, audio in pieces:
        a = int(round(start * SR))
        mix[a: a + len(audio)] += audio
    peak = np.max(np.abs(mix))
    if peak > 0.99:
        mix *= 0.99 / peak
    return mix, turns, loaded - len(used)


def write(out, name, mix, turns):
    sf.write(os.path.join(out, name + ".wav"), mix, SR, subtype="PCM_16")
    with open(os.path.join(out, name + ".rttm"), "w") as f:
        for start, dur, spk in turns:
            f.write(f"SPEAKER {name} 1 {start:.3f} {dur:.3f} <NA> <NA> {spk} <NA> <NA>\n")


def opus(out, name):
    src = os.path.join(out, name + ".wav")
    with tempfile.TemporaryDirectory() as tmp:
        ogg = os.path.join(tmp, "x.ogg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-c:a", "libopus", "-b:a", "24k", ogg], check=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ogg, "-ac", "1", "-ar", str(SR), "-sample_fmt", "s16",
                        os.path.join(out, name + "-opus.wav")], check=True)
    shutil.copy(os.path.join(out, name + ".rttm"), os.path.join(out, name + "-opus.rttm"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cv_dir")
    ap.add_argument("out")
    ap.add_argument("--n", type=int, default=6)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--seconds", type=float, default=300.0)
    ap.add_argument("--min-clips", type=int, default=15)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    rng = random.Random(a.seed)
    cv_speakers = speakers(a.cv_dir, a.min_clips)
    pool = sorted(cv_speakers)
    print(f"{len(pool)} người có ≥ {a.min_clips} câu")
    if len(pool) < 8:
        raise SystemExit("cần ≥ 8 người đủ câu")
    for k in range(a.n):
        name = f"cv-vi-{k + 1:02d}"
        mix, turns, reused = build(rng, pool, cv_speakers, a.seconds)
        write(a.out, name, mix, turns)
        opus(a.out, name)
        print(f"{name}: {len(mix) / SR:.0f} s, {len(turns)} lượt, {len({t[2] for t in turns})} người, {reused} câu dùng lại")


if __name__ == "__main__":
    main()
