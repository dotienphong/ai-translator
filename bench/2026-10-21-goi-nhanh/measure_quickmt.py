"""Đo độ trễ và chrF++ của quickmt (CTranslate2 int8, CPU) trên bộ test benchmark 2026-09-29.
Dùng: python -I measure_quickmt.py <models_dir> <testset.jsonl> <threads>
"""
import json, sys, time, statistics, os
import ctranslate2, sentencepiece as spm, sacrebleu

models_dir, testset, threads = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = [json.loads(l) for l in open(testset)]

def load(pair):
    d = os.path.join(models_dir, f"quickmt-{pair}")
    tr = ctranslate2.Translator(d, device="cpu", compute_type="int8", inter_threads=1, intra_threads=threads)
    src_sp = spm.SentencePieceProcessor(model_file=os.path.join(d, "src.spm.model"))
    tgt_sp = spm.SentencePieceProcessor(model_file=os.path.join(d, "tgt.spm.model"))
    return tr, src_sp, tgt_sp

def run(pair, src_lang, tgt_lang, beam):
    tr, src_sp, tgt_sp = load(pair)
    items = [r for r in rows if r["src_lang"] == src_lang and r["tgt_lang"] == tgt_lang]
    # warm-up
    tr.translate_batch([src_sp.encode("Hello, how are you?", out_type=str)], beam_size=beam)
    lat, hyps, refs, ntok = [], [], [], 0
    for r in items:
        toks = src_sp.encode(r["src"], out_type=str)
        t0 = time.perf_counter()
        out = tr.translate_batch([toks], beam_size=beam, max_decoding_length=512)
        dt = time.perf_counter() - t0
        lat.append(dt * 1000)
        h = out[0].hypotheses[0]
        ntok += len(h)
        hyps.append(tgt_sp.decode(h)); refs.append(r["ref"])
    tok = "zh" if tgt_lang == "zh" else ("ja" if tgt_lang == "ja" else "13a")
    chrf = sacrebleu.corpus_chrf(hyps, [refs], word_order=0 if tgt_lang in ("zh","ja") else 2)
    lat.sort()
    p50 = lat[len(lat)//2]; p90 = lat[int(len(lat)*0.9)]
    print(f"{pair} beam={beam} n={len(items)}  latency ms: mean={statistics.mean(lat):.0f} p50={p50:.0f} p90={p90:.0f} max={lat[-1]:.0f}  "
          f"tok/s={ntok/ (sum(lat)/1000):.0f}  chrF{'++' if tgt_lang not in ('zh','ja') else ''}={chrf.score:.1f}")
    return list(zip(items, hyps))

for beam in (1, 4):
    ev = run("en-vi", "en", "vi", beam)
    ve = run("vi-en", "vi", "en", beam)
print("\n--- Ví dụ en->vi (beam 4) ---")
for r, h in ev[:6]:
    print("SRC:", r["src"][:160]); print("QMT:", h[:160]); print("REF:", r["ref"][:160]); print()
print("--- Ví dụ vi->en (beam 4) ---")
for r, h in ve[:6]:
    print("SRC:", r["src"][:160]); print("QMT:", h[:160]); print("REF:", r["ref"][:160]); print()
