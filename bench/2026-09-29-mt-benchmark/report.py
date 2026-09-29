"""Combine results.json, speed/*.json and outputs into Markdown tables (printed to stdout)."""
import glob
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ORDER = ["nllb-600m", "hymt1.5-1.8b", "hymt2-1.8b", "madlad-3b"]
DIRS = ["en->vi", "vi->en", "vi->zh", "vi->ja", "vi->ko"]


def paired_bootstrap(a, b, n=2000, seed=0):
    """95% CI of mean(a - b) over paired segments."""
    rng = random.Random(seed)
    diffs = [x - y for x, y in zip(a, b)]
    k = len(diffs)
    means = sorted(sum(diffs[rng.randrange(k)] for _ in range(k)) / k for _ in range(n))
    return sum(diffs) / k, means[int(0.025 * n)], means[int(0.975 * n)]


def main():
    items = {it["id"]: it for it in map(json.loads, open(os.path.join(HERE, "testset.jsonl"), encoding="utf-8"))}
    res = json.load(open(os.path.join(HERE, "results.json"), encoding="utf-8"))
    models = [m for m in ORDER if m in res]
    outs = {m: {r["id"]: r for r in map(json.loads, open(os.path.join(HERE, "outputs", f"{m}.jsonl"), encoding="utf-8"))}
            for m in models}

    print("## COMET (wmt22-comet-da, higher is better)\n")
    print("| Model | " + " | ".join(DIRS) + " | All 320 |")
    print("|---|" + "---|" * (len(DIRS) + 1))
    for m in models:
        seg = res[m]["seg_comet"]
        allv = sum(seg.values()) / len(seg)
        print(f"| {m} | " + " | ".join(f"{res[m]['per_dir'][d]['comet']:.3f}" for d in DIRS) + f" | **{allv:.3f}** |")

    print("\n## chrF++ (chrF for zh/ja)\n")
    print("| Model | " + " | ".join(DIRS) + " |")
    print("|---|" + "---|" * len(DIRS))
    for m in models:
        print(f"| {m} | " + " | ".join(f"{res[m]['per_dir'][d]['chrf']:.1f}" for d in DIRS) + " |")

    if "hymt2-1.8b" in models:
        print("\n## Paired bootstrap: Hy-MT2 minus other model (COMET, 95% CI)\n")
        print("| Other model | Scope | Diff | 95% CI |")
        print("|---|---|---|---|")
        base = res["hymt2-1.8b"]["seg_comet"]
        for m in models:
            if m == "hymt2-1.8b":
                continue
            other = res[m]["seg_comet"]
            for scope in ["All 320"] + DIRS:
                ids = sorted(i for i in base if scope == "All 320" or items[i]["dir"] == scope)
                d, lo, hi = paired_bootstrap([base[i] for i in ids], [other[i] for i in ids])
                print(f"| {m} | {scope} | {d:+.3f} | [{lo:+.3f}, {hi:+.3f}] |")

    print("\n## Output sanity (hyp/ref length ratio flags, empty outputs)\n")
    print("| Model | empty | too long (>2x ref) | too short (<0.4x ref) |")
    print("|---|---|---|---|")
    for m in models:
        ids = [i for i in outs[m] if items[i]["ref"]]
        ratio = {i: len(outs[m][i]["hyp"]) / max(1, len(items[i]["ref"])) for i in ids}
        print(f"| {m} | {sum(1 for i in ids if not outs[m][i]['hyp'])} | "
              f"{sum(1 for r in ratio.values() if r > 2)} | {sum(1 for r in ratio.values() if r < 0.4)} |")

    print("\n## Speed\n")
    print("| Model | GPU (MPS) s/segment | GPU tok/s | CPU 4 threads 8-bit s/segment | CPU tok/s | CPU peak RAM GB | Runtime (CPU) |")
    print("|---|---|---|---|---|---|---|")
    for m in models:
        ids = [i for i in outs[m] if items[i]["ref"]]
        gpu_s = sum(outs[m][i]["sec"] for i in ids) / len(ids)
        gpu_tps = sum(outs[m][i]["n_out"] for i in ids) / sum(outs[m][i]["sec"] for i in ids)
        sp = os.path.join(HERE, "speed", f"{m}.json")
        if os.path.exists(sp):
            s = json.load(open(sp, encoding="utf-8"))["summary"]
            cpu = f"{s['avg_sec']:.2f} | {s['out_tok_per_sec']:.1f} | {s['peak_rss_gb']:.2f} | {s['runtime']}"
        else:
            cpu = "- | - | - | -"
        print(f"| {m} | {gpu_s:.2f} | {gpu_tps:.1f} | {cpu} |")

    if "_cpu8" in res:
        print("\n## 8-bit vs full precision (same 30 segments, COMET)\n")
        print("| Model | Full precision (GPU) | 8-bit (CPU) | Diff |")
        print("|---|---|---|---|")
        for m in models:
            c = res["_cpu8"].get(m)
            if c:
                print(f"| {m} | {c['comet_full_same_ids']:.3f} | {c['comet_8bit']:.3f} | "
                      f"{c['comet_8bit'] - c['comet_full_same_ids']:+.3f} |")

    print("\n## Everyday sentences (vi->en)\n")
    for it in [it for it in items.values() if it["dir"] == "vi->en (qual)"]:
        print(f"- **{it['src']}**")
        for m in models:
            print(f"  - {m}: {outs[m][it['id']]['hyp']}")


if __name__ == "__main__":
    main()
