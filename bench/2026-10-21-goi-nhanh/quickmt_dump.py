import json, sys, os, ctranslate2, sentencepiece as spm
md, ts, out = sys.argv[1:4]
rows = [json.loads(l) for l in open(ts)]
cache = {}
def m(pair):
    if pair not in cache:
        d = os.path.join(md, f"quickmt-{pair}")
        cache[pair] = (ctranslate2.Translator(d, device="cpu", compute_type="int8", intra_threads=4),
                       spm.SentencePieceProcessor(model_file=f"{d}/src.spm.model"), spm.SentencePieceProcessor(model_file=f"{d}/tgt.spm.model"))
    return cache[pair]
def tr(pair, text):
    t, s, g = m(pair)
    o = t.translate_batch([s.encode(text, out_type=str)], beam_size=1, max_decoding_length=256, repetition_penalty=1.1, no_repeat_ngram_size=4)
    return g.decode(o[0].hypotheses[0])
with open(out, "w") as f:
    for r in rows:
        s, t = r["src_lang"], r["tgt_lang"]
        h = tr(f"{s}-{t}", r["src"]) if "en" in (s, t) else tr(f"en-{t}", tr(f"{s}-en", r["src"]))
        f.write(json.dumps({"id": r["id"], "hyp": h}, ensure_ascii=False) + "\n")
