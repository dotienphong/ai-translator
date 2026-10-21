"""Đo model GGUF qua llama-server (stream) trên bộ test 2026-09-29: độ trễ chữ đầu, cả câu, chrF.
Dùng: python -I measure_llama.py <llama-server> <gguf> <style:lmt|hymt> <mode:metal|cpu4> <testset> <out.jsonl>"""
import json, sys, time, subprocess, urllib.request, statistics, sacrebleu
srv, gguf, style, mode, testset, outp = sys.argv[1:7]
PORT = 18431
NAMES = {"en": "English", "vi": "Vietnamese", "zh": "Chinese", "ja": "Japanese", "ko": "Korean"}
ZH = {"en": "英语", "vi": "越南语", "zh": "中文", "ja": "日语", "ko": "韩语"}
args = [srv, "-m", gguf, "--port", str(PORT), "--host", "127.0.0.1", "-c", "2048", "-np", "1"]
args += ["-ngl", "99"] if mode == "metal" else ["-ngl", "0", "-t", "4"]
p = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(240):
        try:
            if json.load(urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=1)).get("status") == "ok": break
        except Exception: pass
        time.sleep(0.5)
    def prompt(r):
        s, t, x = r["src_lang"], r["tgt_lang"], r["src"]
        if style == "lmt":
            return f"Translate the following text from {NAMES[s]} into {NAMES[t]}.\n{NAMES[s]}: {x}\n{NAMES[t]}:"
        if "zh" in (s, t):
            return f"将以下文本翻译为{ZH[t]}，注意只需要输出翻译后的结果，不要额外解释：\n\n{x}"
        return f"Translate the following text into {NAMES[t]}. Note that you should only output the translated result without any additional explanation:\n\n{x}"
    def call(text):
        body = json.dumps({"messages": [{"role": "user", "content": text}], "stream": True, "temperature": 0,
                           "repeat_penalty": 1.05, "max_tokens": 512, "cache_prompt": True}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/v1/chat/completions", body, {"Content-Type": "application/json"})
        t0 = time.perf_counter(); first = None; out = []
        with urllib.request.urlopen(req, timeout=120) as resp:
            for line in resp:
                line = line.decode().strip()
                if not line.startswith("data:") or line == "data: [DONE]": continue
                d = json.loads(line[5:])
                c = d["choices"][0]["delta"].get("content")
                if c:
                    if first is None and c.strip(): first = time.perf_counter() - t0
                    out.append(c)
        return "".join(out).strip(), (first or 0) * 1000, (time.perf_counter() - t0) * 1000
    rows = [json.loads(l) for l in open(testset)]
    call(prompt(rows[0]))  # làm nóng
    res = []
    with open(outp, "w") as f:
        for r in rows:
            h, ft, tot = call(prompt(r))
            h = h.replace("<think>", "").replace("</think>", "").strip()
            res.append((r, h, ft, tot)); f.write(json.dumps({"id": r["id"], "hyp": h, "first_ms": ft, "total_ms": tot}, ensure_ascii=False) + "\n")
    for d in ["en->vi", "vi->en", "vi->zh", "vi->ja", "vi->ko"]:
        sub = [x for x in res if x[0]["dir"] == d and x[0].get("ref")]
        if not sub: continue
        tl = d.split("->")[1]
        sc = sacrebleu.corpus_chrf([x[1] for x in sub], [[x[0]["ref"] for x in sub]], word_order=0 if tl in ("zh", "ja") else 2).score
        ft = sorted(x[2] for x in sub); tt = sorted(x[3] for x in sub)
        print(f"{d:7s} n={len(sub):3d} chữ đầu p50={ft[len(ft)//2]:5.0f} ms  cả câu p50={tt[len(tt)//2]:5.0f} p90={tt[int(len(tt)*.9)]:5.0f} ms  chrF={sc:.1f}")
finally:
    p.terminate(); p.wait()
