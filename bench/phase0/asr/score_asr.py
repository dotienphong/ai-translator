"""A4: tính WER (Anh, Việt) và CER (Trung, Nhật, Hàn) từ kết quả `latency-bench asr-eval`.

Dùng:  uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
         bench/phase0/data/asr/out-<nhãn>.jsonl [...]
In bảng Markdown và ghi bench/phase0/results/a4_<nhãn>.json.
"""
import json
import math
import os
import sys
import unicodedata
from collections import defaultdict

import jiwer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
CER_LANGS = {"zh", "ja", "ko"}
NO_SPEECH_MAX = 0.6  # app bỏ đoạn có no_speech_prob lớn hơn (§6.4)


def normalize(text, lang):
    text = unicodedata.normalize("NFC", text).lower()
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    text = " ".join(text.split())
    return text.replace(" ", "") if lang in CER_LANGS else text


def p50(values):
    v = sorted(values)
    k = (len(v) - 1) / 2
    return (v[math.floor(k)] + v[math.ceil(k)]) / 2 if v else float("nan")


def score(path, manifest):
    rows = [json.loads(line) for line in open(path, encoding="utf-8")]
    groups = defaultdict(lambda: {"ref": [], "hyp": [], "lid_ok": 0, "n": 0, "nospeech": 0, "lid_ms": [], "asr_ms": [],
                                  "ipc_ms": []})
    for r in rows:
        clip = manifest[r["id"]]
        # Nhóm theo ngôn ngữ, và tách riêng băng rộng (wb) với băng hẹp (nb).
        for key in (clip["lang"], f"{clip['lang']}-{'nb' if clip['narrowband'] else 'wb'}"):
            g = groups[key]
            g["ref"].append(normalize(clip["ref"], clip["lang"]))
            g["hyp"].append(normalize(r["hyp"], clip["lang"]))
            g["lid_ok"] += r["lang_hyp"] == clip["lang"]
            g["nospeech"] += r["no_speech_prob"] > NO_SPEECH_MAX
            g["n"] += 1
            g["lid_ms"].append(r["lid_ms"])
            g["asr_ms"].append(r["asr_ms"])
            g["ipc_ms"].append(r["ipc_ms"])
    mode = ",".join(sorted({r.get("decode_mode", "?") for r in rows}))
    out = {}
    for key, g in sorted(groups.items()):
        lang = key.split("-")[0]
        metric = "cer" if lang in CER_LANGS else "wer"
        value = (jiwer.cer if metric == "cer" else jiwer.wer)(g["ref"], g["hyp"])
        out[key] = {"n": g["n"], metric: value, "lid_accuracy": g["lid_ok"] / g["n"],
                    "lid_ms_p50": p50(g["lid_ms"]), "asr_ms_p50": p50(g["asr_ms"]),
                    "lid_overhead": p50(g["lid_ms"]) / max(p50(g["asr_ms"]), 1e-6),
                    "ipc_ms_p50": p50(g["ipc_ms"]), "ipc_ms_max": max(g["ipc_ms"]),
                    "nospeech_rate": g["nospeech"] / g["n"], "decode_mode": mode}
    return out


def main():
    manifest = {r["id"]: r for r in map(json.loads, open(os.path.join(DATA, "manifest.jsonl"), encoding="utf-8"))}
    os.makedirs(RESULTS, exist_ok=True)
    print("| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | Nhận đúng ngôn ngữ | LID p50 (ms) | ASR p50 (ms) | LID/ASR "
          "| IPC p50/max (ms) | no_speech > 0,6 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for path in sys.argv[1:]:
        label = os.path.basename(path).removesuffix(".jsonl").removeprefix("out-")
        result = score(path, manifest)
        with open(os.path.join(RESULTS, f"a4_{label}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        for key, r in result.items():
            metric = "cer" if "cer" in r else "wer"
            print(f"| {label} | {r['decode_mode']} | {key} | {r['n']} | {metric.upper()} {r[metric]:.3f} | {r['lid_accuracy']:.0%} | "
                  f"{r['lid_ms_p50']:.0f} | {r['asr_ms_p50']:.0f} | {r['lid_overhead']:.0%} | "
                  f"{r['ipc_ms_p50']:.1f}/{r['ipc_ms_max']:.1f} | {r['nospeech_rate']:.0%} |")


if __name__ == "__main__":
    main()
