"""Dựng track cho các cảnh thu của spike nguồn micro (spec 2026-10-24-nguon-micro §6.1, §6.2).

Dùng (từ gốc worktree):
  uv run --no-project --python 3.12 --with "numpy==2.5.4" python bench/2026-10-24-nguon-micro/build_scene.py \
    --fleurs /Users/dtphong/Desktop/software_business/ai-translator/bench/phase0/data/asr/manifest.jsonl \
    --out bench/2026-10-24-nguon-micro/data/tracks

Mỗi cảnh một thư mục con:
- `online.wav`: tiếng "người online" (phát bằng một tiến trình mà tap thu), 16 kHz mono 16-bit;
- `room.wav`: tiếng "người trong phòng" (phát ra loa mà tap không thu, hay từ điện thoại), cùng độ dài;
- `schedule.json`: `{lead_ms, track_ms, items: [{source, id, lang, ref, start_ms, end_ms, short}]}`, giờ tính từ đầu track.

Cảnh (mỗi track có 2 giây im lặng ở đầu):
- `s1-luot`: online và room nói lần lượt, nghỉ 1,5–3 giây (cảnh 1, và cảnh 3 với tai nghe).
- `s2-chong`: mỗi câu room bắt đầu khi câu online trước còn một nửa: khoảng 30% thời gian nói chồng (cảnh 2).
- `s1w-online`: chỉ online, cho Windows và để đo độ trễ vọng.
- `s4-phong`: chỉ room (cảnh 4: điện thoại ở 1 m, rồi 3 m).
- `s7-phong-ngan`: room gồm câu FLEURS xen câu trả lời rất ngắn dựng bằng `say` (cảnh 7).
Clip FLEURS: băng rộng, dài 4–12 giây, chọn cố định theo seed. Năm tiếng: en, zh, ja, ko, vi.
"""
import argparse
import json
import os
import random
import subprocess
import tempfile
import wave

import numpy as np

RATE = 16_000
LEAD_MS = 2_000
LANGS = ["en", "zh", "ja", "ko", "vi"]
# Locale của giọng `say` cho từng tiếng.
LOCALES = {"en": "en_US", "vi": "vi_VN", "zh": "zh_CN", "ja": "ja_JP", "ko": "ko_KR"}
# Giọng tự nhiên ưu tiên dùng; giọng đầu tiên theo locale trong `say -v ?` có thể là giọng kiểu đồ chơi (ví dụ "Albert").
PREFERRED = {"en": "Samantha", "vi": "Linh", "zh": "Tingting", "ja": "Kyoko", "ko": "Yuna"}
SHORT = {
    "en": ["OK.", "Yes.", "No.", "Sure.", "Right.", "Got it.", "Agreed.", "Exactly."],
    "vi": ["Vâng.", "Đúng rồi.", "Được.", "Không.", "Ừ.", "Đồng ý.", "Chuẩn.", "Có."],
    "zh": ["好的。", "对。", "是的。", "没问题。", "可以。", "不是。", "明白。", "同意。"],
    "ja": ["はい。", "そうです。", "いいえ。", "了解です。", "大丈夫です。", "なるほど。", "賛成です。", "分かりました。"],
    "ko": ["네.", "맞아요.", "아니요.", "좋아요.", "알겠습니다.", "그래요.", "동의해요.", "괜찮아요."],
}


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(samples.astype(np.int16).tobytes())


def load_fleurs(manifest):
    base = os.path.dirname(manifest)
    clips = {lang: [] for lang in LANGS}
    with open(manifest, encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if c["lang"] in clips and not c.get("narrowband") and 4.0 <= c["duration_s"] <= 12.0:
                clips[c["lang"]].append({**c, "path": os.path.join(base, c["path"])})
    return clips


def pick(clips, rng, per_lang):
    out = []
    for lang in LANGS:
        out += rng.sample(clips[lang], per_lang)
    rng.shuffle(out)
    return out


def voice_for(lang):
    listing = subprocess.run(["say", "-v", "?"], capture_output=True, text=True, check=True).stdout
    for line in listing.splitlines():
        if line.split("  ")[0].strip() == PREFERRED[lang] and LOCALES[lang] in line:
            return PREFERRED[lang]
    for line in listing.splitlines():
        if LOCALES[lang] in line:
            return line.split("  ")[0].strip()
    raise SystemExit(f"máy không có giọng `say` cho {LOCALES[lang]}")


def synth(text, lang, tmp):
    aiff = os.path.join(tmp, "s.aiff")
    out = os.path.join(tmp, "s.wav")
    subprocess.run(["say", "-v", voice_for(lang), "-o", aiff, text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, out], check=True)
    return read_wav(out)


class Track:
    """Hai track cùng độ dài và lịch của mọi clip."""

    def __init__(self):
        self.parts = {"online": [], "room": []}
        self.items = []

    def place(self, source, audio, start_ms, meta):
        self.parts[source].append((start_ms, audio))
        end_ms = start_ms + len(audio) * 1000 // RATE
        self.items.append({"source": source, **meta, "start_ms": start_ms, "end_ms": end_ms})
        return end_ms

    def write(self, folder):
        os.makedirs(folder, exist_ok=True)
        track_ms = max(i["end_ms"] for i in self.items) + 2_000
        for source in ("online", "room"):
            buf = np.zeros(track_ms * RATE // 1000, dtype=np.int32)
            for start_ms, audio in self.parts[source]:
                s = start_ms * RATE // 1000
                buf[s : s + len(audio)] += audio
            write_wav(os.path.join(folder, f"{source}.wav"), np.clip(buf, -32768, 32767))
        with open(os.path.join(folder, "schedule.json"), "w", encoding="utf-8") as f:
            json.dump({"lead_ms": LEAD_MS, "track_ms": track_ms, "items": self.items}, f, ensure_ascii=False, indent=1)
        print(f"{folder}: {track_ms / 1000:.0f} giây, {len(self.items)} clip")


def fleurs_meta(c):
    return {"id": c["id"], "lang": c["lang"], "ref": c["ref"], "short": False}


def turn_taking(online, room, rng, overlap):
    t = Track()
    now = LEAD_MS
    for a, b in zip(online, room):
        audio_a = read_wav(a["path"])
        end_a = t.place("online", audio_a, now, fleurs_meta(a))
        len_a = end_a - now
        start_b = end_a - len_a // 2 if overlap else end_a + rng.randint(1_500, 3_000)
        end_b = t.place("room", read_wav(b["path"]), start_b, fleurs_meta(b))
        now = max(end_a, end_b) + rng.randint(1_500, 3_000)
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fleurs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20261024)
    args = ap.parse_args()
    clips = load_fleurs(args.fleurs)
    rng = random.Random(args.seed)

    online, room = pick(clips, rng, 3), pick(clips, rng, 3)
    turn_taking(online, room, rng, overlap=False).write(os.path.join(args.out, "s1-luot"))
    online2, room2 = pick(clips, rng, 3), pick(clips, rng, 3)
    turn_taking(online2, room2, rng, overlap=True).write(os.path.join(args.out, "s2-chong"))

    t = Track()
    now = LEAD_MS
    for c in pick(clips, rng, 5):
        now = t.place("online", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 3_000)
    t.write(os.path.join(args.out, "s1w-online"))

    t = Track()
    now = LEAD_MS
    for c in pick(clips, rng, 5):
        now = t.place("room", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 3_000)
    t.write(os.path.join(args.out, "s4-phong"))

    with tempfile.TemporaryDirectory() as tmp:
        shorts = [(lang, text) for lang in LANGS for text in SHORT[lang]]
        rng.shuffle(shorts)
        long_clips = [c for c in pick(clips, rng, 2) if c["lang"] != "vi"]
        t = Track()
        now = LEAD_MS
        for i, (lang, text) in enumerate(shorts):
            audio = synth(text, lang, tmp)
            now = t.place("room", audio, now, {"id": f"short-{i}", "lang": lang, "ref": text, "short": True})
            now += rng.randint(1_500, 2_500)
            if i % 5 == 4 and long_clips:
                c = long_clips.pop()
                now = t.place("room", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 2_500)
        t.write(os.path.join(args.out, "s7-phong-ngan"))


if __name__ == "__main__":
    main()
