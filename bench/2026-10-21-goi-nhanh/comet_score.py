"""Chấm COMET wmt22-comet-da cho các file out-*.jsonl theo từng chiều. Dùng: python -I comet_score.py <testset> <out1.jsonl> ..."""
import json, sys
from comet import download_model, load_from_checkpoint
testset = {json.loads(l)["id"]: json.loads(l) for l in open(sys.argv[1])}
model = load_from_checkpoint(download_model("Unbabel/wmt22-comet-da"))
dirs = sorted({r["dir"] for r in testset.values() if r.get("ref")})
for path in sys.argv[2:]:
    rows = [json.loads(l) for l in open(path)]
    data = [{"src": testset[r["id"]]["src"], "mt": r["hyp"], "ref": testset[r["id"]]["ref"]} for r in rows if testset[r["id"]].get("ref")]
    meta = [testset[r["id"]]["dir"] for r in rows if testset[r["id"]].get("ref")]
    scores = model.predict(data, batch_size=32, gpus=0, num_workers=1, progress_bar=False).scores
    per = {d: v for d in dirs if (v := [s for s, m in zip(scores, meta) if m == d])}
    print(path.rsplit("/", 1)[1], " ".join(f"{d}={sum(v)/len(v):.3f}" for d, v in per.items()), f"all={sum(scores)/len(scores):.3f}", flush=True)
