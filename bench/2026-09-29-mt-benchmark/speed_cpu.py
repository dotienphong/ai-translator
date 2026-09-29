"""Phone-like speed test: CPU only, 4 threads, 8-bit weights, batch size 1, greedy.

- NLLB / MADLAD: CTranslate2 int8 (converted from the HF checkpoints)
- HY-MT1.5 / Hy-MT2: llama.cpp llama-server with the official Q8_0 GGUF
Writes speed/<model>.json with per-segment latency and peak RSS.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import threading
import time
import urllib.request

import psutil

HERE = os.path.dirname(os.path.abspath(__file__))
SP = os.path.dirname(HERE)
THREADS = 4
LLAMA_BIN = glob.glob(os.path.join(SP, "llamacpp", "*", "llama-server"))[0]
sys.path.insert(0, HERE)
from run_mt import MODELS, NLLB_CODE, hy_prompt  # noqa: E402

GGUF = {"hymt1.5-1.8b": ("tencent/HY-MT1.5-1.8B-GGUF", "HY-MT1.5-1.8B-Q8_0.gguf"),
        "hymt2-1.8b": ("tencent/Hy-MT2-1.8B-GGUF", "Hy-MT2-1.8B-Q8_0.gguf")}


def subset():
    items = [json.loads(line) for line in open(os.path.join(HERE, "testset.jsonl"), encoding="utf-8")]
    pick = []
    for d, n in (("en->vi", 12), ("vi->en", 12), ("vi->zh", 6)):
        pick += [it for it in items if it["dir"] == d][:n]
    return items[:2], pick  # (warm-up, measured)


class PeakRSS:
    def __init__(self, pid):
        self.proc, self.peak, self._stop = psutil.Process(pid), 0, False
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        while not self._stop:
            try:
                self.peak = max(self.peak, self.proc.memory_info().rss)
            except psutil.Error:
                return
            time.sleep(0.05)

    def stop(self):
        self._stop = True
        return self.peak / 1e9


def run_ct2(name):
    import ctranslate2
    from transformers import AutoTokenizer
    repo = MODELS[name]["repo"]
    ct2_dir = os.path.join(SP, "ct2", f"{name}-int8")
    if not os.path.exists(os.path.join(ct2_dir, "model.bin")):
        subprocess.run([os.path.join(os.path.dirname(sys.executable), "ct2-transformers-converter"),
                        "--model", repo, "--output_dir", ct2_dir, "--quantization", "int8", "--force"],
                       check=True)
    tok = AutoTokenizer.from_pretrained(repo)
    monitor = PeakRSS(os.getpid())
    t0 = time.perf_counter()
    tr = ctranslate2.Translator(ct2_dir, device="cpu", compute_type="int8", intra_threads=THREADS, inter_threads=1)
    load_sec = time.perf_counter() - t0

    def translate(it):
        s, t = it["src_lang"], it["tgt_lang"]
        if name.startswith("nllb"):
            tok.src_lang = NLLB_CODE[s]
            src_tokens = tok.convert_ids_to_tokens(tok.encode(it["src"]))
            prefix = [[NLLB_CODE[t]]]
        else:
            src_tokens = tok.convert_ids_to_tokens(tok.encode(f"<2{t}> {it['src']}"))
            prefix = None
        t0 = time.perf_counter()
        res = tr.translate_batch([src_tokens], target_prefix=prefix, beam_size=1, max_decoding_length=256)
        sec = time.perf_counter() - t0
        out = res[0].hypotheses[0][1:] if prefix else res[0].hypotheses[0]
        return tok.decode(tok.convert_tokens_to_ids(out), skip_special_tokens=True), sec, len(out)

    return translate, load_sec, monitor, lambda: None


def run_llama(name):
    from huggingface_hub import hf_hub_download
    from transformers import AutoTokenizer
    gguf = hf_hub_download(*GGUF[name])
    tok = AutoTokenizer.from_pretrained(MODELS[name]["repo"])
    port = 8089
    t0 = time.perf_counter()
    server = subprocess.Popen([LLAMA_BIN, "-m", gguf, "-t", str(THREADS), "-tb", str(THREADS), "-ngl", "0",
                               "-c", "2048", "--port", str(port), "--no-webui", "-np", "1"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(600):
        try:
            if json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/health"))["status"] == "ok":
                break
        except Exception:
            time.sleep(0.2)
    load_sec = time.perf_counter() - t0
    monitor = PeakRSS(server.pid)

    def translate(it):
        messages = [{"role": "user", "content": hy_prompt(MODELS[name]["kind"], it["src"], it["src_lang"], it["tgt_lang"])}]
        prompt = tok.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
        body = json.dumps({"prompt": prompt, "n_predict": 256, "temperature": 0, "top_k": 1,
                           "repeat_penalty": 1.05, "cache_prompt": False}).encode()
        req = urllib.request.Request(f"http://127.0.0.1:{port}/completion", data=body,
                                     headers={"Content-Type": "application/json"})
        t0 = time.perf_counter()
        resp = json.load(urllib.request.urlopen(req))
        sec = time.perf_counter() - t0
        return resp["content"].strip(), sec, resp["timings"]["predicted_n"]

    return translate, load_sec, monitor, server.terminate


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=list(MODELS))
    name = ap.parse_args().model
    warm, items = subset()
    translate, load_sec, monitor, cleanup = (run_llama if name in GGUF else run_ct2)(name)
    try:
        for it in warm:
            translate(it)
        rows = []
        for it in items:
            hyp, sec, n_out = translate(it)
            rows.append({"id": it["id"], "dir": it["dir"], "sec": round(sec, 4), "n_out": n_out, "hyp": hyp})
    finally:
        peak = monitor.stop()
        cleanup()
    total = sum(r["sec"] for r in rows)
    summary = {"model": name, "runtime": "llama.cpp Q8_0" if name in GGUF else "CTranslate2 int8",
               "threads": THREADS, "n": len(rows), "load_sec": round(load_sec, 2),
               "avg_sec": round(total / len(rows), 3),
               "out_tok_per_sec": round(sum(r["n_out"] for r in rows) / total, 1),
               "peak_rss_gb": round(peak, 2)}
    os.makedirs(os.path.join(HERE, "speed"), exist_ok=True)
    with open(os.path.join(HERE, "speed", f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump({"summary": summary, "rows": rows}, f, ensure_ascii=False, indent=1)
    print(json.dumps(summary), flush=True)


if __name__ == "__main__":
    main()
