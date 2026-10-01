"""Dựng clip cho test tích hợp của pipeline (kế hoạch 00, Đ20): ghép ba câu FLEURS (CC BY 4.0) với khoảng lặng.

Dùng (từ gốc repo, sau khi đã dựng bộ clip A4 bằng bench/phase0/asr/build_clips.py):
  python3 tests/fixtures/audio/build_fixture.py
Kết quả: tests/fixtures/audio/fleurs-en-en-vi.wav (16 kHz, mono, 16-bit) và fleurs-en-en-vi.json (mốc từng câu).
Chạy lại cho ra đúng các byte cũ.
"""
import json
import os
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CLIPS = os.path.join(ROOT, "bench", "phase0", "data", "asr")
RATE = 16_000
# (id của clip trong manifest A4, khoảng lặng trước clip, giây)
PARTS = [
    ("en-14159306883861268418", 1.0),
    ("en-6415341913845555034", 1.5),
    ("vi-12090846728876801190", 1.5),
]
TAIL_SECONDS = 1.5


def main():
    manifest = {r["id"]: r for r in map(json.loads, open(os.path.join(CLIPS, "manifest.jsonl"), encoding="utf-8"))}
    frames, truth = bytearray(), []
    for clip_id, gap in PARTS:
        frames += b"\0\0" * int(gap * RATE)
        row = manifest[clip_id]
        with wave.open(os.path.join(CLIPS, row["path"])) as w:
            assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (RATE, 1, 2), clip_id
            start = len(frames) // 2
            frames += w.readframes(w.getnframes())
        truth.append({"id": clip_id, "lang": row["lang"], "start_ms": start * 1000 // RATE,
                      "end_ms": (len(frames) // 2) * 1000 // RATE, "ref": row["ref"]})
    frames += b"\0\0" * int(TAIL_SECONDS * RATE)
    with wave.open(os.path.join(HERE, "fleurs-en-en-vi.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(bytes(frames))
    with open(os.path.join(HERE, "fleurs-en-en-vi.json"), "w", encoding="utf-8") as f:
        json.dump(truth, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(frames) // 2 / RATE:.2f} giây, {len(truth)} câu")


if __name__ == "__main__":
    main()
