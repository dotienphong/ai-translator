"""Translate the test set with one model on the Mac GPU (MPS), greedy, batch size 1.

Writes outputs/<model>.jsonl (one line per segment, resumable) and outputs/<model>.meta.json.
"""
import argparse
import gc
import json
import os
import time

import psutil
import torch
from transformers import AutoModelForCausalLM, AutoModelForSeq2SeqLM, AutoTokenizer

HERE = os.path.dirname(os.path.abspath(__file__))

NLLB_CODE = {"en": "eng_Latn", "vi": "vie_Latn", "zh": "zho_Hans", "ja": "jpn_Jpan", "ko": "kor_Hang"}
EN_NAME = {"en": "English", "vi": "Vietnamese", "zh": "Chinese", "ja": "Japanese", "ko": "Korean"}
CN_NAME = {"en": "英语", "vi": "越南语", "zh": "中文", "ja": "日语", "ko": "韩语"}

MODELS = {
    "nllb-600m": dict(repo="facebook/nllb-200-distilled-600M", kind="nllb", dtype=torch.float16),
    "hymt1.5-1.8b": dict(repo="tencent/HY-MT1.5-1.8B", kind="hymt15", dtype=torch.bfloat16),
    "hymt2-1.8b": dict(repo="tencent/Hy-MT2-1.8B", kind="hymt2", dtype=torch.bfloat16),
    "madlad-3b": dict(repo="google/madlad400-3b-mt", kind="madlad", dtype=torch.bfloat16),
}

MAX_NEW_TOKENS = 256


def hy_prompt(kind, src, s, t):
    # Prompt templates copied from the HY-MT1.5 and Hy-MT2 model cards.
    if "zh" in (s, t):
        return f"将以下文本翻译为{CN_NAME[t]}，注意只需要输出翻译后的结果，不要额外解释：\n\n{src}"
    if kind == "hymt15":
        return f"Translate the following segment into {EN_NAME[t]}, without additional explanation.\n\n{src}"
    return (f"Translate the following text into {EN_NAME[t]}. Note that you should only output "
            f"the translated result without any additional explanation:\n\n{src}")


class Translator:
    def __init__(self, name, device):
        cfg = MODELS[name]
        self.kind, self.device = cfg["kind"], device
        t0 = time.perf_counter()
        self.tok = AutoTokenizer.from_pretrained(cfg["repo"])
        cls = AutoModelForCausalLM if self.kind.startswith("hymt") else AutoModelForSeq2SeqLM
        self.model = cls.from_pretrained(cfg["repo"], dtype=cfg["dtype"]).to(device).eval()
        self.sync()
        self.load_sec = time.perf_counter() - t0
        self.dtype = str(cfg["dtype"]).replace("torch.", "")

    def sync(self):
        if self.device == "mps":
            torch.mps.synchronize()

    @torch.inference_mode()
    def translate(self, src, s, t):
        greedy = dict(do_sample=False, num_beams=1, max_new_tokens=MAX_NEW_TOKENS)
        if self.kind == "nllb":
            self.tok.src_lang = NLLB_CODE[s]
            enc = self.tok(src, return_tensors="pt").to(self.device)
            n_in = enc["input_ids"].shape[1]
            self.sync(); t0 = time.perf_counter()
            out = self.model.generate(**enc, forced_bos_token_id=self.tok.convert_tokens_to_ids(NLLB_CODE[t]), **greedy)
            self.sync(); sec = time.perf_counter() - t0
            gen = out[0]
        elif self.kind == "madlad":
            enc = self.tok(f"<2{t}> {src}", return_tensors="pt").to(self.device)
            n_in = enc["input_ids"].shape[1]
            self.sync(); t0 = time.perf_counter()
            out = self.model.generate(**enc, **greedy)
            self.sync(); sec = time.perf_counter() - t0
            gen = out[0]
        else:
            messages = [{"role": "user", "content": hy_prompt(self.kind, src, s, t)}]
            enc = self.tok.apply_chat_template(messages, add_generation_prompt=True,
                                               return_tensors="pt", return_dict=True).to(self.device)
            n_in = enc["input_ids"].shape[1]
            self.sync(); t0 = time.perf_counter()
            out = self.model.generate(**enc, repetition_penalty=1.05, **greedy)
            self.sync(); sec = time.perf_counter() - t0
            gen = out[0, n_in:]
        special = set(self.tok.all_special_ids)
        n_out = sum(1 for x in gen.tolist() if x not in special)
        hyp = self.tok.decode(gen, skip_special_tokens=True).strip()
        return hyp, sec, n_in, n_out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model", choices=list(MODELS))
    ap.add_argument("--device", default="mps")
    ap.add_argument("--limit", type=int, default=0, help="smoke test: first N items, written to outputs_smoke/")
    args = ap.parse_args()

    items = [json.loads(line) for line in open(os.path.join(HERE, "testset.jsonl"), encoding="utf-8")]
    out_dir = os.path.join(HERE, "outputs_smoke" if args.limit else "outputs")
    if args.limit:
        # one item per direction so every prompt/code path is exercised
        seen, picked = set(), []
        for it in items:
            if it["dir"] not in seen:
                seen.add(it["dir"])
                picked.append(it)
        items = (items[:2] + picked)[:args.limit + 2]
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{args.model}.jsonl")
    done = set()
    if os.path.exists(out_path):
        done = {json.loads(line)["id"] for line in open(out_path, encoding="utf-8")}

    tr = Translator(args.model, args.device)
    rss_gb = psutil.Process().memory_info().rss / 1e9
    print(f"[{args.model}] loaded in {tr.load_sec:.1f}s, dtype={tr.dtype}, rss={rss_gb:.1f}GB", flush=True)

    for it in items[:2]:  # warm-up, not recorded
        tr.translate(it["src"], it["src_lang"], it["tgt_lang"])

    with open(out_path, "a", encoding="utf-8") as f:
        todo = [it for it in items if it["id"] not in done]
        for i, it in enumerate(todo, 1):
            hyp, sec, n_in, n_out = tr.translate(it["src"], it["src_lang"], it["tgt_lang"])
            f.write(json.dumps({"id": it["id"], "hyp": hyp, "sec": round(sec, 4),
                                "n_in": n_in, "n_out": n_out}, ensure_ascii=False) + "\n")
            f.flush()
            if i % 20 == 0 or i == len(todo):
                print(f"[{args.model}] {i}/{len(todo)} last={sec:.2f}s", flush=True)

    meta = {"model": args.model, "repo": MODELS[args.model]["repo"], "device": args.device,
            "dtype": tr.dtype, "load_sec": round(tr.load_sec, 1),
            "rss_gb_after_load": round(rss_gb, 2),
            "mps_driver_gb": round(torch.mps.driver_allocated_memory() / 1e9, 2) if args.device == "mps" else None,
            "torch": torch.__version__}
    with open(os.path.join(out_dir, f"{args.model}.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    del tr
    gc.collect()
    print(f"[{args.model}] DONE", flush=True)


if __name__ == "__main__":
    main()
