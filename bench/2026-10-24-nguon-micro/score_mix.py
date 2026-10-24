"""Chấm kết quả `latency-bench mix-eval` của một cảnh (spec 2026-10-24-nguon-micro §6.3).

Dùng:
  uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" \
    python bench/2026-10-24-nguon-micro/score_mix.py --scene <thư mục cảnh> --results <thư mục kết quả mix-eval>
  ... score_mix.py --scene <thư mục cảnh> --echo-delay      # chỉ đo độ trễ vọng (playback.wav so với mic.wav)

Thư mục cảnh có `meta.json` (do `capture` ghi), `mic.wav`, có thể có `playback.wav`; nếu cảnh phát track thì có thêm
`schedule.json`, `online.wav`, `room.wav`. In bảng Markdown, ghi `<results>/score.json` và `<results>/score.md`.

Cách chấm:
- Căn track với bản thu bằng tương quan đường bao 10 ms (lệch −15 s tới +30 s): online.wav với playback.wav (không
  có thì với mic.wav), room.wav với mic.wav.
- Đoạn được giữ: `verdict` = Speech; phương án có hậu tố `+su<p>-<s>` bỏ thêm theo luật ShortUnsure: `short` và
  (`mean_prob` < p hoặc `speech_ms` < s).
- Gán mỗi đoạn được giữ cho clip trùng thời gian nhiều nhất (clip nới 300 ms mỗi phía). Không trùng clip nào là câu ảo,
  ghi kèm lời nhắc (`cues` trong meta.json) đang chạy lúc đó. Cảnh có track chỉ xét đoạn trong khung track (`in_track`).
- Lỗi mỗi clip: WER (en, vi) hay CER (zh, ja, ko) trên chữ chuẩn hóa như `score_asr.py`; clip không có đoạn nào thì lỗi
  bằng độ dài ref. Tỉ lệ lỗi một nguồn là trung bình các ngôn ngữ (mỗi ngôn ngữ: tổng lỗi / tổng độ dài ref).
- Câu trong phòng "giữ được": có chữ và lỗi của clip ≤ 50%. Câu ngắn "giữ được": có chữ.
"""
import argparse
import json
import os
import sys
import wave

import jiwer
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phase0", "asr"))
from score_asr import CER_LANGS, normalize  # noqa: E402

PAD_MS = 300
SHORT_GRID = [None] + [(p, s) for p in (0.6, 0.7, 0.8, 0.9) for s in (250, 400, 600)]


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1, path
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        return data, w.getframerate()


def envelope(x, rate, hop_ms=10):
    hop = rate * hop_ms // 1000
    n = len(x) // hop
    return np.abs(x[: n * hop]).reshape(n, hop).mean(axis=1)


def best_offset_ms(track, recording, rate, max_ms=30_000, min_ms=0):
    """Độ lệch (ms, bội của 10) để track[t] ≈ recording[t + offset], trong [min_ms, max_ms]."""
    a = envelope(track, rate)
    b = envelope(recording, rate)
    a = a - a.mean()
    b = b - b.mean()
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    corr = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    lags = np.arange(n)
    lags[lags > n // 2] -= n
    mask = (lags >= min_ms // 10) & (lags <= max_ms // 10)
    return int(lags[mask][np.argmax(corr[mask])]) * 10


def load_rows(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def kept(rows, short):
    out = []
    for r in rows:
        if r["verdict"] != "Speech":
            continue
        if short and r["short"] and (r["mean_prob"] < short[0] or r["speech_ms"] < short[1]):
            continue
        out.append(r)
    return out


def assign(rows, items):
    """(đoạn của từng clip theo chỉ số, các đoạn ảo)."""
    by_clip = {i: [] for i in range(len(items))}
    phantoms = []
    for r in rows:
        best, best_ov = None, 0
        for i, it in enumerate(items):
            ov = min(r["end_ms"], it["end_ms"] + PAD_MS) - max(r["start_ms"], it["start_ms"] - PAD_MS)
            if ov > best_ov:
                best, best_ov = i, ov
        if best is None:
            phantoms.append(r)
        else:
            by_clip[best].append(r)
    return by_clip, phantoms


def clip_errors(item, segs):
    """(số lỗi, độ dài ref) theo từ hay theo chữ."""
    lang = item["lang"]
    ref = normalize(item["ref"], lang)
    hyp = normalize(" ".join(s["text"] for s in sorted(segs, key=lambda s: s["start_ms"])), lang)
    if lang in CER_LANGS:
        n = len(ref)
        if not hyp:
            return n, n
        o = jiwer.process_characters(ref, hyp)
    else:
        n = len(ref.split())
        if not hyp:
            return n, n
        o = jiwer.process_words(ref, hyp)
    return o.substitutions + o.deletions + o.insertions, n


def cue_at(cues, ms):
    label = None
    for c in cues:
        if c["at_ms"] <= ms:
            label = c["label"]
    return label


def in_track(rows, items):
    """Cảnh có track: chỉ giữ đoạn nằm trong khung track (clip đầu tới clip cuối, nới 2 giây). Ngoài khung là tiếng
    trước khi bấm phát hay sau khi track hết (điện thoại có thể tự phát lại), không phải chữ ảo."""
    if not items:
        return rows
    lo = min(it["start_ms"] for it in items) - 2_000
    hi = max(it["end_ms"] for it in items) + 2_000
    return [r for r in rows if r["end_ms"] > lo and r["start_ms"] < hi]


def score_variant(rows, items, cues, minutes, short):
    by_clip, phantoms = assign(in_track(kept(rows, short), items), items)
    per = {}
    room_total = room_kept = short_total = short_kept = 0
    for i, it in enumerate(items):
        segs = by_clip[i]
        if it["short"]:
            short_total += 1
            short_kept += int(any(s["text"].strip() for s in segs))
            continue
        err, n = clip_errors(it, segs)
        acc = per.setdefault((it["source"], it["lang"]), [0, 0])
        acc[0] += err
        acc[1] += n
        if it["source"] == "room":
            room_total += 1
            room_kept += int(bool(segs) and n > 0 and err / n <= 0.5)

    def rate(source):
        langs = [v for (s, _), v in per.items() if s == source and v[1] > 0]
        return None if not langs else sum(e / n for e, n in langs) / len(langs)

    by_cue = {}
    for p in phantoms:
        k = cue_at(cues, p["start_ms"]) or "-"
        by_cue[k] = by_cue.get(k, 0) + 1
    return {
        "online_err": rate("online"),
        "room_err": rate("room"),
        "per_lang": {f"{s}-{lang}": (v[0] / v[1] if v[1] else None) for (s, lang), v in per.items()},
        "room_kept": room_kept / room_total if room_total else None,
        "short_recall": short_kept / short_total if short_total else None,
        "phantoms": len(phantoms),
        "phantoms_per_10min": len(phantoms) / minutes * 10 if minutes else None,
        "phantoms_by_cue": by_cue,
        "phantom_texts": [p["text"] for p in phantoms][:20],
    }


def scene_items(scene, rate):
    path = os.path.join(scene, "schedule.json")
    if not os.path.exists(path):
        return [], {}
    with open(path, encoding="utf-8") as f:
        sched = json.load(f)
    offsets = {}
    # Ghi đè tay khi tương quan đường bao bị tiếng ồn đánh lừa (cảnh 7): `offsets.json` = {"room": ms}, kiểm bằng số câu
    # ngắn có chữ nhận được trùng khớp câu chuẩn.
    manual_path = os.path.join(scene, "offsets.json")
    manual = json.load(open(manual_path, encoding="utf-8")) if os.path.exists(manual_path) else {}
    for source in ("online", "room"):
        if source in manual:
            offsets[source] = manual[source]
            continue
        if not any(it["source"] == source for it in sched["items"]):
            continue
        rec = "playback.wav" if source == "online" and os.path.exists(os.path.join(scene, "playback.wav")) else "mic.wav"
        track, _ = read_wav(os.path.join(scene, f"{source}.wav"))
        recording, _ = read_wav(os.path.join(scene, rec))
        # Âm: track bắt đầu phát trước khi bản thu bắt đầu (afplay chạy trước khi Capture.app khởi động xong).
        offsets[source] = best_offset_ms(track, recording, rate, min_ms=-15_000)
    items = [{**it, "start_ms": it["start_ms"] + offsets[it["source"]], "end_ms": it["end_ms"] + offsets[it["source"]]}
             for it in sched["items"]]
    # Clip kết thúc sau lúc dừng thu (bấm phát trễ) không có trong bản thu: không chấm.
    mic, _ = read_wav(os.path.join(scene, "mic.wav"))
    recorded_ms = len(mic) * 1000 // rate
    return [it for it in items if it["end_ms"] <= recorded_ms], offsets


def fmt(x, pct=True):
    if x is None:
        return "-"
    return f"{x * 100:.1f}%" if pct else f"{x:.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True)
    ap.add_argument("--results")
    ap.add_argument("--echo-delay", action="store_true")
    args = ap.parse_args()
    mic, rate = read_wav(os.path.join(args.scene, "mic.wav"))
    if args.echo_delay:
        playback, _ = read_wav(os.path.join(args.scene, "playback.wav"))
        print(f"độ trễ vọng (micro so với âm thanh máy): {best_offset_ms(playback, mic, rate, max_ms=1_000, min_ms=-200)} ms")
        return
    with open(os.path.join(args.scene, "meta.json"), encoding="utf-8") as f:
        cues = json.load(f).get("cues", [])
    minutes = len(mic) / rate / 60
    items, offsets = scene_items(args.scene, rate)
    print(f"độ lệch track: {offsets} ms; {len(items)} clip; {minutes:.1f} phút")
    results = {}
    for name in sorted(os.listdir(args.results)):
        if not name.endswith(".jsonl"):
            continue
        rows = load_rows(os.path.join(args.results, name))
        for short in SHORT_GRID:
            key = name[:-6] if short is None else f"{name[:-6]}+su{short[0]}-{short[1]}"
            results[key] = score_variant(rows, items, cues, minutes, short)
    with open(os.path.join(args.results, "score.json"), "w", encoding="utf-8") as f:
        json.dump({"offsets_ms": offsets, "minutes": minutes, "variants": results}, f, ensure_ascii=False, indent=1)
    lines = ["| Phương án | Lỗi online | Lỗi trong phòng | Giữ câu trong phòng | Giữ câu ngắn | Câu ảo | Ảo/10 phút |",
             "|---|---|---|---|---|---|---|"]
    for key, r in results.items():
        lines.append(f"| {key} | {fmt(r['online_err'])} | {fmt(r['room_err'])} | {fmt(r['room_kept'])} | "
                     f"{fmt(r['short_recall'])} | {r['phantoms']} | {fmt(r['phantoms_per_10min'], pct=False)} |")
    table = "\n".join(lines)
    with open(os.path.join(args.results, "score.md"), "w", encoding="utf-8") as f:
        f.write(table + "\n")
    print(table)


if __name__ == "__main__":
    main()
