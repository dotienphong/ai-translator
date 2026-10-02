"""Dựng câu mẫu của bước "Nghe thử" (spec §4.1 bước 6, kế hoạch 03): cắt câu tiếng Anh thứ hai của
tests/fixtures/audio/fleurs-en-en-vi.wav (FLEURS, CC BY 4.0) ra public/listen-test-en.wav, kèm 0,3 giây lặng ở hai đầu.

Dùng (từ gốc repo): python3 scripts/make_listen_test.py
Chạy lại cho ra đúng các byte cũ.
"""
import json
import os
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "audio")
OUT = os.path.join(ROOT, "public", "listen-test-en.wav")
CLIP = "en-6415341913845555034"
PAD_MS = 300


def main():
    truth = {r["id"]: r for r in json.load(open(os.path.join(FIXTURE, "fleurs-en-en-vi.json"), encoding="utf-8"))}
    row = truth[CLIP]
    with wave.open(os.path.join(FIXTURE, "fleurs-en-en-vi.wav")) as w:
        rate = w.getframerate()
        assert (w.getnchannels(), w.getsampwidth()) == (1, 2)
        start = (row["start_ms"] - PAD_MS) * rate // 1000
        end = (row["end_ms"] + PAD_MS) * rate // 1000
        w.setpos(start)
        frames = w.readframes(end - start)
    with wave.open(OUT, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(frames)
    print(f"{os.path.relpath(OUT, ROOT)}: {(end - start) / rate:.2f} giây, \"{row['ref']}\"")


if __name__ == "__main__":
    main()
