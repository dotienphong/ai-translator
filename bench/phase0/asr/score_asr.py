"""A4: tính WER (Anh, Việt) và CER (Trung, Nhật, Hàn) từ kết quả `latency-bench asr-eval`.

Dùng:  uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" \
         python bench/phase0/asr/score_asr.py [--allow-partial] bench/phase0/data/asr/out-<nhãn>.jsonl [...]
In bảng Markdown và ghi bench/phase0/results/a4_<nhãn>.json.

Nhóm trong bảng (mỗi ngôn ngữ có bốn nhóm):
- `<ngôn ngữ>`: gộp cả hai băng. Một phần tư số câu có bản nb nên bị đếm hai lần: không lấy làm mốc.
- `<ngôn ngữ>-wb`: băng rộng, mọi câu. Đây là mốc A4.
- `<ngôn ngữ>-nb`: băng hẹp, chỉ có ở một phần tư số câu.
- `<ngôn ngữ>-wbp`: bản băng rộng của đúng các câu có bản nb. So `-nb` với `-wbp`, không so với `-wb`,
  vì `-nb` và `-wb` gồm các câu khác nhau.

Cột thêm ngoài WER/CER thô:
- `capped`: WER/CER khi lỗi của mỗi clip bị chặn ở độ dài ref, để một clip lặp câu không quyết định cả con số.
- `long_hyp`: số clip có số chèn lớn hơn độ dài ref (lặp câu, hoặc ra sai ngôn ngữ).
- `lid_fallback`: số clip có lang_prob < 0,5, tức nhận diện không chắc. Worker giữ ngôn ngữ của clip trước (nếu có)
  cho các clip này, nên kết quả của chúng phụ thuộc thứ tự clip trong manifest.

Chuẩn hóa: NFC, chữ thường, bỏ dấu câu và ký hiệu; tiếng Trung, Nhật, Hàn bỏ cả khoảng trắng. Riêng tiếng Trung:
- small hay ra chữ phồn thể còn FLEURS cmn_hans_cn là giản thể, nên đổi cả ref và hyp về giản thể bằng OpenCC (t2s);
- bỏ chú thích Latin trong ngoặc, ví dụ `摩尔多瓦 (Moldova)`, ở cả ref và hyp: người đọc FLEURS không đọc phần này.
  Đây là quy tắc máy móc, chưa nghe lại từng clip. Không áp cho tiếng Nhật vì ở đó phần trong ngoặc có khi được đọc.
  Id các clip có ref bị bỏ phần này được in ra stderr.

Kiểm đầu vào: dừng nếu một clip xuất hiện hai lần, hoặc file thiếu clip của một ngôn ngữ có mặt trong file so với
manifest (lượt chạy dở). `--allow-partial` bỏ phép kiểm thiếu clip, để cố ý chấm một tập con.
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict

import jiwer
import opencc

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
CER_LANGS = {"zh", "ja", "ko"}
NO_SPEECH_MAX = 0.6  # app bỏ đoạn có no_speech_prob lớn hơn (§6.4)
MIN_LANG_PROB = 0.5  # dưới mức này worker giữ ngôn ngữ của đoạn trước (asr-worker/src/lid.rs)
# small hay ra chữ phồn thể, FLEURS cmn_hans_cn là giản thể: đổi về giản thể trước khi so.
T2S = opencc.OpenCC("t2s")
# Chú thích Latin trong ngoặc của ref tiếng Trung, ví dụ `摩尔多瓦 (Moldova)`, `(NHK)`, `(Kashiwazaki Kariwa)`.
LATIN_GLOSS = re.compile(r"\s*[(（]\s*[A-Za-z][A-Za-z0-9 .,'&/-]*[)）]")


def strip_latin_gloss(text):
    return LATIN_GLOSS.sub("", text)


def normalize(text, lang):
    text = unicodedata.normalize("NFC", text).lower()
    if lang == "zh":
        text = T2S.convert(strip_latin_gloss(text))
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    text = " ".join(text.split())
    return text.replace(" ", "") if lang in CER_LANGS else text


def p50(values):
    v = sorted(values)
    k = (len(v) - 1) / 2
    return (v[math.floor(k)] + v[math.ceil(k)]) / 2 if v else float("nan")


def score(path, manifest, allow_partial):
    with open(path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f]
    ids = [r["id"] for r in rows]
    seen = set(ids)
    if len(seen) != len(ids):
        sys.exit(f"{path}: có clip bị ghi hai lần")
    unknown = [i for i in ids if i not in manifest]
    if unknown:
        sys.exit(f"{path}: {len(unknown)} id không có trong manifest.jsonl, ví dụ {unknown[:3]}")
    for lang in sorted({manifest[i]["lang"] for i in ids}):
        missing = [k for k, c in manifest.items() if c["lang"] == lang and k not in seen]
        if missing:
            msg = f"{path}: thiếu {len(missing)} clip {lang} so với manifest (lượt chạy dở?), ví dụ {missing[:3]}"
            if not allow_partial:
                sys.exit(msg + "; thêm --allow-partial nếu cố ý chấm một tập con")
            print("CẢNH BÁO: " + msg, file=sys.stderr)
    stripped = [i for i in ids if manifest[i]["lang"] == "zh" and LATIN_GLOSS.search(manifest[i]["ref"])]
    if stripped:
        print(f"{path}: zh: bỏ chú thích Latin trong ngoặc ở ref của {len(stripped)} clip "
              f"(theo quy tắc, chưa nghe lại): {', '.join(stripped)}", file=sys.stderr)
    has_nb = {i.removesuffix("_nb") for i in ids if manifest[i]["narrowband"]}
    groups = defaultdict(lambda: {"ref": [], "hyp": [], "lid_ok": 0, "n": 0, "nospeech": 0, "lid_ms": [], "asr_ms": [],
                                  "ipc_ms": [], "fallback": 0, "long_hyp": 0, "capped_err": 0, "ref_len": 0})
    for r in rows:
        clip = manifest[r["id"]]
        lang = clip["lang"]
        ref, hyp = normalize(clip["ref"], lang), normalize(r["hyp"], lang)
        if not ref:
            sys.exit(f"{path}: ref của clip {r['id']} rỗng sau khi chuẩn hóa")
        o = (jiwer.process_characters if lang in CER_LANGS else jiwer.process_words)(ref, hyp)
        n_ref = o.hits + o.substitutions + o.deletions
        err = o.substitutions + o.deletions + o.insertions
        # Nhóm theo ngôn ngữ, tách băng rộng (wb) với băng hẹp (nb). `wbp`: bản wb của đúng các câu có bản nb.
        # nb chỉ có ở 1/4 số câu, nên so nb với wbp chứ không với wb.
        keys = [lang, f"{lang}-{'nb' if clip['narrowband'] else 'wb'}"]
        if not clip["narrowband"] and r["id"] in has_nb:
            keys.append(f"{lang}-wbp")
        for key in keys:
            g = groups[key]
            g["ref"].append(ref)
            g["hyp"].append(hyp)
            g["fallback"] += r["lang_prob"] < MIN_LANG_PROB
            g["long_hyp"] += o.insertions > n_ref  # lặp câu hoặc ra sai ngôn ngữ
            g["capped_err"] += min(err, n_ref)
            g["ref_len"] += n_ref
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
        out[key] = {"n": g["n"], metric: value, f"{metric}_capped": g["capped_err"] / g["ref_len"],
                    "long_hyp": g["long_hyp"], "lid_accuracy": g["lid_ok"] / g["n"], "lid_fallback": g["fallback"],
                    "lid_ms_p50": p50(g["lid_ms"]), "asr_ms_p50": p50(g["asr_ms"]),
                    "lid_overhead": p50(g["lid_ms"]) / max(p50(g["asr_ms"]), 1e-6),
                    "ipc_ms_p50": p50(g["ipc_ms"]), "ipc_ms_max": max(g["ipc_ms"]),
                    "nospeech_rate": g["nospeech"] / g["n"], "decode_mode": mode}
    return out


def main():
    ap = argparse.ArgumentParser(description="Chấm WER/CER cho A4 từ kết quả của `latency-bench asr-eval`.")
    ap.add_argument("files", nargs="+", help="out-<nhãn>.jsonl")
    ap.add_argument("--allow-partial", action="store_true",
                    help="không đòi file có đủ mọi clip của các ngôn ngữ có mặt (chấm một tập con)")
    args = ap.parse_args()
    with open(os.path.join(DATA, "manifest.jsonl"), encoding="utf-8") as f:
        manifest = {r["id"]: r for r in map(json.loads, f)}
    # Chấm hết mọi file trước, rồi mới ghi JSON và in bảng: một file bị từ chối thì không có kết quả nửa vời.
    scored = []
    for path in args.files:
        label = os.path.basename(path).removesuffix(".jsonl").removeprefix("out-")
        scored.append((label, score(path, manifest, args.allow_partial)))
    os.makedirs(RESULTS, exist_ok=True)
    print("| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | capped | long_hyp | Nhận đúng ngôn ngữ | lid_fallback "
          "| LID p50 (ms) | ASR p50 (ms) | LID/ASR | IPC p50/max (ms) | no_speech > 0,6 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label, result in scored:
        with open(os.path.join(RESULTS, f"a4_{label}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        for key, r in result.items():
            metric = "cer" if "cer" in r else "wer"
            print(f"| {label} | {r['decode_mode']} | {key} | {r['n']} | {metric.upper()} {r[metric]:.3f} | "
                  f"{r[metric + '_capped']:.3f} | {r['long_hyp']} | {r['lid_accuracy']:.0%} | {r['lid_fallback']} | "
                  f"{r['lid_ms_p50']:.0f} | {r['asr_ms_p50']:.0f} | {r['lid_overhead']:.0%} | "
                  f"{r['ipc_ms_p50']:.1f}/{r['ipc_ms_max']:.1f} | {r['nospeech_rate']:.0%} |")


if __name__ == "__main__":
    main()
