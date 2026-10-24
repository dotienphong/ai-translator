"""Dựng track `ao-tron` đo chữ ảo ở chế độ Âm thanh máy + Micro (kế hoạch 04 nguồn micro, sau A7 ngày 2026-10-25).

Lượt A7 (`bench/phase1/results/acceptance/a7-mac-micro.md`) thấy vài câu "Thank you." không có trong câu mẫu, nghi là chữ ảo
trong khoảng lặng giữa các lần phát qua loa. Track chỉ có giọng online (phát qua loa nên micro nghe tiếng vọng), track trong
phòng để lặng:
- phần 1: câu mẫu `public/listen-test-en.wav` lặp lại, cách nhau 1 giây, như lượt A7;
- phần 2: mọi clip của track `s1-luot` (năm tiếng), cách nhau lần lượt 1, 2, 4, 8 giây.

Dùng:
  uv run --no-project --python 3.12 --with "numpy==2.5.4" python bench/2026-10-24-nguon-micro/build_ao_tron.py \
    --listen public/listen-test-en.wav --s1 bench/2026-10-24-nguon-micro/data/tracks/s1-luot \
    --out bench/2026-10-24-nguon-micro/data/tracks/ao-tron
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_scene import LEAD_MS, RATE, Track, read_wav  # noqa: E402

LISTEN_REF = "The result of plotting analysis will be posted to a public website."
REPEATS = 48
GAPS_MS = [1_000, 2_000, 4_000, 8_000]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--listen", required=True)
    ap.add_argument("--s1", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    track = Track()
    t = LEAD_MS
    listen = read_wav(a.listen)
    for i in range(REPEATS):
        end = track.place("online", listen, t, {"id": f"listen-{i}", "lang": "en", "ref": LISTEN_REF, "short": False})
        t = end + 1_000
    s1 = json.load(open(os.path.join(a.s1, "schedule.json"), encoding="utf-8"))
    audio = {src: read_wav(os.path.join(a.s1, f"{src}.wav")) for src in ("online", "room")}
    for n, it in enumerate(s1["items"]):
        clip = audio[it["source"]][it["start_ms"] * RATE // 1000 : it["end_ms"] * RATE // 1000]
        meta = {k: it[k] for k in ("id", "lang", "ref", "short")}
        end = track.place("online", clip, t, meta)
        t = end + GAPS_MS[n % len(GAPS_MS)]
    track.write(a.out)


if __name__ == "__main__":
    main()
