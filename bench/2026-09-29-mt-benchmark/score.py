"""Score outputs/*.jsonl with COMET (Unbabel/wmt22-comet-da) and chrF++; write results.json."""
import glob
import json
import os
from collections import defaultdict

import sacrebleu
from comet import download_model, load_from_checkpoint

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    items = {it["id"]: it for it in map(json.loads, open(os.path.join(HERE, "testset.jsonl"), encoding="utf-8"))}
    runs = {}
    for path in sorted(glob.glob(os.path.join(HERE, "outputs", "*.jsonl"))):
        name = os.path.basename(path)[:-len(".jsonl")]
        runs[name] = {r["id"]: r for r in map(json.loads, open(path, encoding="utf-8"))}

    comet = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
    results = {}
    for name, outs in runs.items():
        scored = [i for i in outs if items[i]["ref"]]
        data = [{"src": items[i]["src"], "mt": outs[i]["hyp"], "ref": items[i]["ref"]} for i in scored]
        pred = comet.predict(data, batch_size=16, gpus=0, num_workers=1, progress_bar=False)
        seg_comet = dict(zip(scored, pred.scores))

        by_dir = defaultdict(list)
        for i in outs:
            by_dir[items[i]["dir"]].append(i)
        per_dir = {}
        for d, ids in sorted(by_dir.items()):
            row = {"n": len(ids),
                   "avg_sec": sum(outs[i]["sec"] for i in ids) / len(ids),
                   "out_tok_per_sec": sum(outs[i]["n_out"] for i in ids) / sum(outs[i]["sec"] for i in ids),
                   "empty": sum(1 for i in ids if not outs[i]["hyp"])}
            with_ref = [i for i in ids if items[i]["ref"]]
            if with_ref:
                row["comet"] = sum(seg_comet[i] for i in with_ref) / len(with_ref)
                tgt = items[with_ref[0]]["tgt_lang"]
                chrf = sacrebleu.CHRF(word_order=0 if tgt in ("zh", "ja") else 2)
                row["chrf"] = chrf.corpus_score([outs[i]["hyp"] for i in with_ref],
                                                [[items[i]["ref"] for i in with_ref]]).score
            per_dir[d] = row
        results[name] = {"per_dir": per_dir, "seg_comet": seg_comet}
        print(name, {d: {k: round(v, 3) if isinstance(v, float) else v for k, v in r.items()}
                     for d, r in per_dir.items()}, flush=True)

    # 8-bit CPU runs (30-segment subset): does quantization change quality?
    cpu8 = {}
    for path in sorted(glob.glob(os.path.join(HERE, "speed", "*.json"))):
        name = os.path.basename(path)[:-len(".json")]
        rows = json.load(open(path, encoding="utf-8"))["rows"]
        data = [{"src": items[r["id"]]["src"], "mt": r["hyp"], "ref": items[r["id"]]["ref"]} for r in rows]
        scores = comet.predict(data, batch_size=16, gpus=0, num_workers=1, progress_bar=False).scores
        full = results[name]["seg_comet"]
        cpu8[name] = {"n": len(rows), "comet_8bit": sum(scores) / len(scores),
                      "comet_full_same_ids": sum(full[r["id"]] for r in rows) / len(rows)}
        print("8-bit", name, cpu8[name], flush=True)
    results["_cpu8"] = cpu8

    with open(os.path.join(HERE, "results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
