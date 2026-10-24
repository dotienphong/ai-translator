"""Sinh file phương án cho `latency-bench mix-eval` (spec 2026-10-24-nguon-micro §6.3).

  python3 bench/2026-10-24-nguon-micro/make_variants.py echo > bench/2026-10-24-nguon-micro/variants/echo.json
  python3 bench/2026-10-24-nguon-micro/make_variants.py noise > bench/2026-10-24-nguon-micro/variants/noise.json
  python3 bench/2026-10-24-nguon-micro/make_variants.py both-vad --gate=-45,-20,300 > bench/2026-10-24-nguon-micro/variants/both-vad.json

- `echo` (cảnh 1, 2, 3): đối chứng chỉ-Playback và chỉ-micro, A (trộn thẳng), B (lưới 3 × 4 × 4), C (micro đã khử vọng).
- `noise` (cảnh 4, 6, 7, chỉ micro): bộ lọc {không, RNNoise, DeepFilterNet} × whisper nghe {bản thường, bản đã lọc} ×
  VAD {0,5; 0,6; 0,7} × {250, 400, 600} ms. Luật ShortUnsure được dò ở `score_mix.py`, không cần chép lời lại.
- `both-vad` (cảnh 1): B với tham số đã chọn × lưới VAD, để kiểm VAD chặt hơn không hại tiếng online.
"""
import argparse
import json

VAD_GRID = [(t, m) for t in (0.5, 0.6, 0.7) for m in (250, 400, 600)]


def vad(t, m):
    return {"threshold": t, "min_speech_ms": m}


def echo():
    out = [
        {"name": "doi-chung-playback", "mode": "playback"},
        {"name": "doi-chung-mic", "mode": "mic"},
        {"name": "A", "mode": "both"},
        {"name": "C", "mode": "both", "mic": "mic-aec.wav"},
    ]
    for t in (-55, -45, -35):
        for d in (-12, -20, -30, None):
            for h in (150, 300, 500, 800):
                dname = "tat" if d is None else str(-d)
                out.append({
                    "name": f"B-t{-t}-d{dname}-h{h}",
                    "mode": "both",
                    "gate": {"threshold_dbfs": t, "duck_db": d, "hold_ms": h},
                })
    return out


def noise():
    out = []
    filters = [("khong", None, False), ("rnn", "mic-rnnoise.wav", False), ("rnn-ca-hai", "mic-rnnoise.wav", True),
               ("dfn", "mic-dfn.wav", False), ("dfn-ca-hai", "mic-dfn.wav", True)]
    for fname, file, both in filters:
        for t, m in VAD_GRID:
            v = {"name": f"N-{fname}-v{int(t * 10)}-m{m}", "mode": "mic", "vad": vad(t, m)}
            if file:
                v["mic_vad"] = file
                v["whisper_hears_vad"] = both
            out.append(v)
    return out


def both_vad(gate):
    t, d, h = gate
    return [{
        "name": f"BV-v{int(vt * 10)}-m{m}",
        "mode": "both",
        "gate": {"threshold_dbfs": t, "duck_db": d, "hold_ms": h},
        "vad": vad(vt, m),
    } for vt, m in VAD_GRID]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["echo", "noise", "both-vad"])
    ap.add_argument("--gate", help="ngưỡng,mức hạ,thời gian giữ của B đã chọn, ví dụ -45,-20,300 (mức hạ 'tat' là tắt hẳn)")
    args = ap.parse_args()
    if args.kind == "echo":
        variants = echo()
    elif args.kind == "noise":
        variants = noise()
    else:
        t, d, h = args.gate.split(",")
        variants = both_vad((float(t), None if d == "tat" else float(d), int(h)))
    print(json.dumps(variants, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
