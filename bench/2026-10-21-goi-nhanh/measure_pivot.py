"""Đo dịch qua trung gian tiếng Anh: vi -> en (quickmt-vi-en) -> X (quickmt-en-X), so với bộ test 2026-09-29."""
import json, sys, time, statistics, os
import ctranslate2, sentencepiece as spm, sacrebleu

models_dir, testset, threads = sys.argv[1], sys.argv[2], int(sys.argv[3])
rows = [json.loads(l) for l in open(testset)]

def load(pair):
    d = os.path.join(models_dir, f"quickmt-{pair}")
    tr = ctranslate2.Translator(d, device="cpu", compute_type="int8", inter_threads=1, intra_threads=threads)
    return tr, spm.SentencePieceProcessor(model_file=os.path.join(d, "src.spm.model")), spm.SentencePieceProcessor(model_file=os.path.join(d, "tgt.spm.model"))

def tr1(m, text):
    tr, s, t = m
    out = tr.translate_batch([s.encode(text, out_type=str)], beam_size=1, max_decoding_length=512)
    return t.decode(out[0].hypotheses[0])

vi_en = load("vi-en")
tr1(vi_en, "Xin chào")
for tgt in ("zh", "ja", "ko"):
    m2 = load(f"en-{tgt}"); tr1(m2, "Hello")
    items = [r for r in rows if r["src_lang"] == "vi" and r["tgt_lang"] == tgt]
    lat, hyps, refs = [], [], []
    for r in items:
        t0 = time.perf_counter()
        en = tr1(vi_en, r["src"]); h = tr1(m2, en)
        lat.append((time.perf_counter() - t0) * 1000); hyps.append(h); refs.append(r["ref"])
    lat.sort()
    if tgt in ("zh", "ja"):
        score = sacrebleu.corpus_chrf(hyps, [refs], word_order=0).score; name = "chrF"
    else:
        score = sacrebleu.corpus_chrf(hyps, [refs], word_order=2).score; name = "chrF++"
    print(f"vi->en->{tgt} n={len(items)} latency ms (2 chặng): mean={statistics.mean(lat):.0f} p50={lat[len(lat)//2]:.0f} p90={lat[int(len(lat)*0.9)]:.0f}  {name}={score:.1f}")
    for r, h in list(zip(items, hyps))[:2]:
        print("  SRC:", r["src"][:120]); print("  QMT:", h[:120]); print("  REF:", r["ref"][:120])
