#!/usr/bin/env python3
"""Thử 4: Qwen3-ASR (Apache-2.0) qua llama-server b11146 của app (mtmd, nhận âm thanh qua `input_audio`).

Tải model (khoảng 1 GB, không commit) vào bench/phase0/data/do-tre/qwen3-asr-0.6b/:
    https://huggingface.co/ggml-org/Qwen3-ASR-0.6B-GGUF  (Qwen3-ASR-0.6B-Q8_0.gguf, mmproj-Qwen3-ASR-0.6B-Q8_0.gguf)

    python3 bench/2026-10-10-do-tre/qwen3_asr.py <manifest.jsonl> <out.jsonl>

Đầu ra theo định dạng của `latency-bench asr-eval` để chấm bằng bench/phase0/asr/score_asr.py (`--allow-partial`)
hay phân tích bằng `asr_partials.py analyze`. Các trường không có ở Qwen3-ASR (no_speech_prob, avg_logprob, lid_ms,
ipc_ms) để 0; `asr_ms` là thời gian cả request HTTP (gồm base64 và đọc WAV), nên hơi bi quan.
"""
import base64
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

MODEL_DIR = os.path.join(C.DATA, "qwen3-asr-0.6b")
LANGS = {"English": "en", "Vietnamese": "vi", "Chinese": "zh", "Japanese": "ja", "Korean": "ko"}


def transcribe(port, key, wav):
    body = {"messages": [{"role": "user", "content": [
        {"type": "input_audio", "input_audio": {"data": base64.b64encode(wav).decode(), "format": "wav"}}]}],
        "temperature": 0.0, "max_tokens": 256, "cache_prompt": False, "stream": False}
    t0 = time.perf_counter()
    c, r = C.post(port, key, body, False)
    raw = r.read()
    ms = (time.perf_counter() - t0) * 1000
    c.close()
    if r.status != 200:
        raise SystemExit(f"llama-server trả {r.status}: {raw[:300]!r}")
    return json.loads(raw)["choices"][0]["message"]["content"], ms


def main():
    manifest, out_path = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(manifest))
    rows = [r for r in map(json.loads, open(manifest)) if not r.get("narrowband")]
    proc, port, key = C.start_server(os.path.join(MODEL_DIR, "Qwen3-ASR-0.6B-Q8_0.gguf"),
                                     ["--mmproj", os.path.join(MODEL_DIR, "mmproj-Qwen3-ASR-0.6B-Q8_0.gguf")])
    try:
        transcribe(port, key, open(os.path.join(base, rows[0]["path"]), "rb").read())  # làm nóng
        with open(out_path, "w") as out:
            for r in rows:
                text, ms = transcribe(port, key, open(os.path.join(base, r["path"]), "rb").read())
                m = re.match(r"language (\w+)<asr_text>(.*)", text or "", re.S)  # dạng ra: "language X<asr_text>…"
                out.write(json.dumps({
                    "id": r["id"], "lang_ref": r["lang"], "lang_hyp": LANGS.get(m.group(1), m.group(1)) if m else "?",
                    "lang_prob": 1.0, "hyp": m.group(2).strip() if m else "", "no_speech_prob": 0.0,
                    "avg_logprob": 0.0, "lid_ms": 0.0, "asr_ms": round(ms, 1), "ipc_ms": 0.0,
                    "audio_ms": int(r["duration_s"] * 1000), "audio_ctx": 0, "n_tokens": 0,
                    "decode_mode": "qwen3asr"}, ensure_ascii=False) + "\n")
    finally:
        proc.terminate()
        proc.wait(timeout=20)


if __name__ == "__main__":
    main()
