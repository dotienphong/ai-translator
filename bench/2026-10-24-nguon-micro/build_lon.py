"""Dựng track và cảnh nhiều clip để nghiệm thu cổng nhường lời theo tiếng nói (kế hoạch 05, spec mục 17).

Cảnh 78 clip của lượt đo đầu chỉ có 30 clip khác nhau (câu mẫu lặp 48 lần), nên mức đạt "≤ 1,10 × mốc" chặt hơn độ phân giải
của phép đo. Ở đây mọi clip khác nhau (FLEURS, 4–12 giây, không phải băng hẹp).

- `thu`: track để thu thật bằng `run_scene_macos.sh` (online qua loa + tap, trong phòng chỉ qua micro), 104 clip online và
  40 clip trong phòng, thay phiên không chồng nhau. Dùng cho A-trộn và chữ ảo có tiếng vọng.
- `so`: track chỉ có giọng online, 230 clip, cách nhau 1–3 giây. Từ đó `cung` dựng các cảnh số hóa `lon-h<dB>`: âm thanh
  máy là track hạ `<dB>` dB, micro chỉ có tiếng nền phòng thật (`data/scenes/im-lang`, lặp lại). Dùng cho giọng online nhỏ.

Dùng:
  uv run --no-project --python 3.12 --with numpy==2.5.4 python bench/2026-10-24-nguon-micro/build_lon.py \
    --fleurs $M/bench/phase0/data/asr/manifest.jsonl --out bench/2026-10-24-nguon-micro/data
"""
import argparse
import json
import os
import random
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_scene import LEAD_MS, RATE, Track, fleurs_meta, load_fleurs, read_wav, write_wav  # noqa: E402

THU_ONLINE = {"en": 24, "vi": 20, "zh": 24, "ja": 16, "ko": 20}
THU_ROOM = {"en": 8, "vi": 8, "zh": 8, "ja": 8, "ko": 8}
SO_ONLINE = {"en": 60, "vi": 40, "zh": 60, "ja": 25, "ko": 45}
LEVELS_DB = (10, 20, 30, 36)
NOISE_FROM_S, NOISE_TO_S = 5, 85


def take(pool, rng, counts):
    out = []
    for lang, n in counts.items():
        out += rng.sample(pool[lang], n)
    rng.shuffle(out)
    return out


def build_thu(clips, rng, folder):
    online = take(clips, rng, THU_ONLINE)
    used = {c["id"] for c in online}
    pool = {lang: [c for c in clips[lang] if c["id"] not in used] for lang in clips}
    room = take(pool, rng, THU_ROOM)
    t = Track()
    now = LEAD_MS
    done_room = 0
    for i, c in enumerate(online):
        now = t.place("online", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 3_000)
        # Chèn đều các clip trong phòng giữa các clip online.
        while done_room < len(room) and done_room < (i + 1) * len(room) // len(online):
            now = t.place("room", read_wav(room[done_room]["path"]), now, fleurs_meta(room[done_room])) + rng.randint(1_500, 3_000)
            done_room += 1
    t.write(folder)


def build_so(clips, rng, folder):
    t = Track()
    now = LEAD_MS
    for c in take(clips, rng, SO_ONLINE):
        now = t.place("online", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_000, 3_000)
    t.write(folder)


def read16(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def build_scenes(data):
    """Cảnh số hóa `lon-h<dB>` từ track `lon-so` và tiếng nền phòng thật của `im-lang`."""
    track = os.path.join(data, "tracks", "lon-so")
    playback = read16(os.path.join(track, "online.wav"))
    noise = {name: read16(os.path.join(data, "scenes", "im-lang", name))[NOISE_FROM_S * RATE : NOISE_TO_S * RATE]
             for name in ("mic.wav", "mic-rnnoise.wav")}
    for db in LEVELS_DB:
        scene = os.path.join(data, "scenes", f"lon-h{db}")
        os.makedirs(scene, exist_ok=True)
        write_wav(os.path.join(scene, "playback.wav"),
                  np.round(playback.astype(np.float32) * 10 ** (-db / 20)).astype(np.int16))
        for name, x in noise.items():
            write_wav(os.path.join(scene, name), np.resize(x, len(playback)))
        for name in ("online.wav", "schedule.json"):
            dst = os.path.join(scene, name)
            if not os.path.lexists(dst):
                os.symlink(os.path.join("..", "..", "tracks", "lon-so", name), dst)
        with open(os.path.join(scene, "meta.json"), "w", encoding="utf-8") as f:
            json.dump({"note": f"số hóa: online −{db} dB, micro chỉ có tiếng nền phòng", "cues": []}, f)
        print(f"{scene}: {len(playback) / RATE / 60:.1f} phút")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fleurs", required=True)
    ap.add_argument("--out", required=True, help="thư mục data/ của bench")
    ap.add_argument("--seed", type=int, default=20261025)
    ap.add_argument("--only", choices=["tracks", "scenes"], help="chỉ dựng track, hay chỉ dựng cảnh số hóa")
    args = ap.parse_args()
    if args.only != "scenes":
        clips = load_fleurs(args.fleurs)
        rng = random.Random(args.seed)
        build_thu(clips, rng, os.path.join(args.out, "tracks", "lon-thu"))
        build_so(clips, rng, os.path.join(args.out, "tracks", "lon-so"))
    if args.only != "tracks":
        build_scenes(args.out)


if __name__ == "__main__":
    main()
