"""Spike S-T (spec gói Nhanh §6.1, §8.3): tỉ lệ câu có đủ thuật ngữ đích cho Hy-MT2 (mẫu terminology của app) và LMT
(mẫu ghép, và mẫu thường để so). Chấm COMET riêng bằng comet_score.py.

Dùng: python -I term_eval.py <llama-server> <gguf> <hymt|lmt|lmt-plain> <terms.jsonl> <out.jsonl>
"""
import json
import subprocess
import sys
import time
import unicodedata
import urllib.request

srv, gguf, style, terms_path, outp = sys.argv[1:6]
PORT = 18432
EN = {"en": "English", "vi": "Vietnamese", "zh": "Chinese", "ja": "Japanese", "ko": "Korean"}
ZH = {"en": "英语", "vi": "越南语", "zh": "中文", "ja": "日语", "ko": "韩语"}


def hymt(r):
    """Nguyên văn `prompt.rs::terminology_prompt`."""
    s, t = r["src_lang"], r["tgt_lang"]
    if "zh" in (s, t):
        p = "参考下面的翻译：\n" + "".join(f"{x['source']} 翻译成 {x['target']}\n" for x in r["terms"])
        return p + f"将以下文本翻译为{ZH[t]}，注意只需要输出翻译后的结果，不要额外解释：\n\n{r['src']}"
    p = "Reference the following translations:\n" + "".join(f"{x['source']} translates to {x['target']}\n" for x in r["terms"])
    return p + (f"\nTranslate the following text into {EN[t]}. Note that you must ONLY output the translated result without "
                f"any additional explanation:\n\n{r['src']}")


def lmt_plain(r):
    s, t = EN[r["src_lang"]], EN[r["tgt_lang"]]
    return f"Translate the following text from {s} into {t}:\n{s}: {r['src']}\n{t}:"


def lmt(r):
    p = "Reference the following translations:\n" + "".join(f"{x['source']} translates to {x['target']}\n" for x in r["terms"])
    return p + "\n" + lmt_plain(r)


PROMPT = {"hymt": hymt, "lmt": lmt, "lmt-plain": lmt_plain}[style]


def norm(s):
    return unicodedata.normalize("NFC", s).casefold()


p = subprocess.Popen([srv, "-m", gguf, "--port", str(PORT), "--host", "127.0.0.1", "-c", "2048", "-np", "1", "-ngl", "99"],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(240):
        try:
            if json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1)).get("status") == "ok":
                break
        except Exception:
            pass
        time.sleep(0.5)
    rows = [json.loads(line) for line in open(terms_path)]
    hit = terms_hit = terms_all = 0
    with open(outp, "w") as f:
        for r in rows:
            body = json.dumps({"messages": [{"role": "user", "content": PROMPT(r)}], "temperature": 0,
                               "repeat_penalty": 1.05, "max_tokens": 512}).encode()
            req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", body,
                                         {"Content-Type": "application/json"})
            hyp = json.load(urllib.request.urlopen(req, timeout=120))["choices"][0]["message"]["content"].strip()
            found = [norm(x["target"]) in norm(hyp) for x in r["terms"]]
            hit += all(found)
            terms_hit += sum(found)
            terms_all += len(found)
            f.write(json.dumps({"id": r["id"], "hyp": hyp, "all_terms": all(found)}, ensure_ascii=False) + "\n")
    print(f"{style}: câu đủ thuật ngữ {hit}/{len(rows)} = {100 * hit / len(rows):.1f}%; "
          f"thuật ngữ {terms_hit}/{terms_all} = {100 * terms_hit / terms_all:.1f}%")
finally:
    p.terminate()
    p.wait()
