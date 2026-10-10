#!/usr/bin/env python3
"""Thử 2: chép từng phần khi người nói chưa dừng, bằng bản chép của các tiền tố (1,0 s; 1,5 s; …) của clip FLEURS.

    python3 bench/2026-10-10-do-tre/asr_partials.py make        # cắt tiền tố, 6 clip 6–12 s mỗi ngôn ngữ
    python3 bench/2026-10-10-do-tre/asr_partials.py run turbo   # hay small; cần target/release/latency-bench và sidecar
    python3 bench/2026-10-10-do-tre/asr_partials.py analyze <out-*.jsonl> [...]

`analyze` tính chi phí mỗi lần chép theo độ dài, và độ ổn định khi chốt bằng LocalAgreement-2 (phần chung của hai bản
chép liền nhau). Độ trễ ở đây tính theo âm thanh, chưa cộng thời gian tính, và giả định người nói đều trong clip.
"""
import json
import os
import statistics as st
import subprocess
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

PARTIALS = os.path.join(C.DATA, "partials")
ASR_MODELS = {"turbo": "ggml-large-v3-turbo-q5_0.bin", "small": "ggml-small-q5_1.bin"}


def make():
    base = os.path.dirname(C.ASR_MANIFEST)
    picked = {}
    for r in map(json.loads, open(C.ASR_MANIFEST)):
        if not r.get("narrowband") and 6.0 <= r["duration_s"] <= 12.0 and len(picked.setdefault(r["lang"], [])) < 6:
            picked[r["lang"]].append(r)
    os.makedirs(os.path.join(PARTIALS, "wav"), exist_ok=True)
    n = 0
    with open(os.path.join(PARTIALS, "manifest.jsonl"), "w") as out:
        for lang, lst in sorted(picked.items()):
            for r in lst:
                w = wave.open(os.path.join(base, r["path"]), "rb")
                assert (w.getframerate(), w.getnchannels(), w.getsampwidth()) == (16000, 1, 2), r["path"]
                pcm = w.readframes(w.getnframes())
                w.close()
                total = len(pcm) // 2
                for cut in list(range(16000, total, 8000)) + [total]:
                    pid = f"{r['id']}@{cut * 1000 // 16000}"
                    path = os.path.join("wav", f"{pid}.wav")
                    o = wave.open(os.path.join(PARTIALS, path), "wb")
                    o.setnchannels(1)
                    o.setsampwidth(2)
                    o.setframerate(16000)
                    o.writeframes(pcm[:cut * 2])
                    o.close()
                    out.write(json.dumps({"id": pid, "path": path, "narrowband": False, "lang": lang, "ref": r["ref"],
                                          "duration_s": round(cut / 16000, 3)}, ensure_ascii=False) + "\n")
                    n += 1
    print(n, "tiền tố", {k: len(v) for k, v in picked.items()})


def run(model):
    subprocess.run([os.path.join(C.ROOT, "target", "release", "latency-bench"), "asr-eval",
                    "--manifest", os.path.join(PARTIALS, "manifest.jsonl"),
                    "--asr-worker", os.path.join(C.ROOT, "src-tauri", "binaries", "asr-worker-aarch64-apple-darwin"),
                    "--asr-model", os.path.join(C.MODELS, ASR_MODELS[model]),
                    "--out", os.path.join(PARTIALS, f"out-{model}.jsonl"),
                    "--log-dir", os.path.join(PARTIALS, "logs")], check=True)


def analyze(path):
    rows = [json.loads(line) for line in open(path)]
    clips = {}
    for r in rows:
        fid, cut = r["id"].rsplit("@", 1)
        clips.setdefault(fid, []).append((int(cut), r))
    buckets = {}
    for r in rows:
        buckets.setdefault(min(int(r["audio_ms"] // 2000) * 2, 10), []).append(r["asr_ms"])
    print("==", os.path.basename(path))
    print("  thời gian mỗi lần chép, p50 theo độ dài (s):",
          {f"{k}-{k + 2}": round(st.median(v)) for k, v in sorted(buckets.items())})
    per = {}
    for lst in clips.values():
        lst.sort()
        lang = lst[0][1]["lang_ref"]
        final = C.norm_units(lst[-1][1]["hyp"], lang)
        n, total = len(final), lst[-1][0]
        if n == 0:
            continue
        committed, prev, shown_prev, retracted = [], None, [], 0
        commit_t, show_t = [None] * n, [None] * n
        for cut, r in lst[:-1]:
            h = C.norm_units(r["hyp"], lang)
            for i in range(C.lcp(h, final)):
                show_t[i] = show_t[i] if show_t[i] is not None else cut
            retracted += len(shown_prev) - C.lcp(shown_prev, h)
            shown_prev = h
            if prev is not None:
                k = C.lcp(prev, h)
                if k > len(committed) and C.lcp(committed, h) == len(committed):
                    committed = h[:k]
            for i in range(C.lcp(committed, final)):
                commit_t[i] = commit_t[i] if commit_t[i] is not None else cut
            prev = h
        d = per.setdefault(lang, {"show": [], "commit": [], "wrong": 0, "units": 0, "retr": 0, "steps": 0})
        for i in range(n):
            spoken = (i + 1) / n * total
            d["show"].append((show_t[i] if show_t[i] is not None else total) - spoken)
            d["commit"].append((commit_t[i] if commit_t[i] is not None else total) - spoken)
        d["wrong"] += len(committed) - C.lcp(committed, final)
        d["units"] += n
        d["retr"] += retracted
        d["steps"] += len(lst) - 1
    for lang, d in sorted(per.items()):
        print(f"  {lang}: hiện tạm đúng p50 {st.median(d['show']):.0f} / p90 {C.pct(d['show'], 0.9):.0f} ms | "
              f"chốt p50 {st.median(d['commit']):.0f} / p90 {C.pct(d['commit'], 0.9):.0f} ms | "
              f"chốt sai {d['wrong']}/{d['units']} | rút lại {d['retr']} đơn vị qua {d['steps']} lần chép")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "make":
        make()
    elif cmd == "run":
        run(sys.argv[2])
    elif cmd == "analyze":
        for p in sys.argv[2:]:
            analyze(p)
    else:
        raise SystemExit(__doc__)
