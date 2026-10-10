#!/usr/bin/env python3
"""Thử 3: mô phỏng dịch trong lúc người nói chưa dừng, dùng bản chép từng phần thật của `asr_partials.py`.

Mỗi tiền tố (0,5 s một bước) được dịch như app, theo hai chính sách: dịch cả bản chép tạm (`live`), và chỉ dịch phần
nguồn đã chốt bằng LocalAgreement-2 (`stable_src`). Không mô phỏng hàng đợi: mỗi bước coi như được tính ngay tại thời
điểm cắt, nên số đo lạc quan khi thời gian tính lớn hơn nhịp.

    python3 bench/2026-10-10-do-tre/stream_sim.py run [<out-turbo.jsonl>] [--model <gguf>]
    python3 bench/2026-10-10-do-tre/stream_sim.py analyze [<stream.json>]
"""
import argparse
import json
import os
import statistics as st
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

DEFAULT_ASR = os.path.join(C.DATA, "partials", "out-turbo.jsonl")
DEFAULT_OUT = os.path.join(C.DATA, "stream_q8_turbo.json")
POST_MS = 450  # sau chỗ ngừng, ngưỡng 50 ms: im lặng 64 + trễ VAD + ASR + chữ dịch đầu (gói Chuẩn, M4 Pro)


def join(us, lang):
    return ("" if lang in ("zh", "ja") else " ").join(us)


def run(asr_path, model, out_path):
    clips = {}
    for r in map(json.loads, open(asr_path)):
        fid, cut = r["id"].rsplit("@", 1)
        clips.setdefault(fid, []).append((int(cut), r))
    proc, port, key = C.start_server(model)
    results = []
    try:
        C.chat(port, key, C.prompt_for("en", "vi", "Hello."))
        for fid, lst in sorted(clips.items()):
            lst.sort()
            src = lst[0][1]["lang_ref"]
            tgt = C.TARGET[src]
            final_src = lst[-1][1]["hyp"].strip()
            final_tr, _, final_s, _ = C.chat(port, key, C.prompt_for(src, tgt, final_src))
            steps, prev, committed, last_committed = [], None, [], None
            for cut, r in lst[:-1]:
                h = C.units(r["hyp"], src)
                if prev is not None:
                    k = C.lcp(prev, h)
                    if k > len(committed) and C.lcp(committed, h) == len(committed):
                        committed = h[:k]
                prev = h
                step = {"cut_ms": cut, "asr_ms": r["asr_ms"], "src_partial": r["hyp"].strip(),
                        "src_committed": join(committed, src)}
                if h:
                    tr, _, s, _ = C.chat(port, key, C.prompt_for(src, tgt, join(h, src)))
                    step["live"] = {"tr": tr, "ms": round(s * 1000, 1)}
                if committed and join(committed, src) != last_committed:
                    tr, _, s, _ = C.chat(port, key, C.prompt_for(src, tgt, join(committed, src)))
                    step["stable_src"] = {"tr": tr, "ms": round(s * 1000, 1)}
                    last_committed = join(committed, src)
                steps.append(step)
            results.append({"id": fid, "src": src, "tgt": tgt, "total_ms": lst[-1][0], "final_src": final_src,
                            "final_tr": final_tr, "final_tr_ms": round(final_s * 1000, 1), "steps": steps})
            print(fid, src, len(steps), flush=True)
    finally:
        proc.terminate()
        proc.wait(timeout=20)
    json.dump(results, open(out_path, "w"), ensure_ascii=False, indent=1)


def words(text):
    return unicodedata.normalize("NFC", text).split()


def analyze(path):
    agg = {}
    for c in json.load(open(path)):
        lang = c["src"]
        fsrc = C.norm_units(c["final_src"], lang)
        n, total = len(fsrc), c["total_ms"]
        if n == 0:
            continue
        spoken = [(i + 1) / n * total for i in range(n)]
        a = agg.setdefault(lang, {k: [] for k in ("live", "stable", "base", "r_live", "r_la2", "r_stable", "cycle",
                                                     "mt_live", "mt_stable", "final_words")})
        first_live, first_stable = [None] * n, [None] * n
        prev_live, prev_la2, prev_stable, prev_tr = [], [], [], None
        r_live = r_la2 = r_stable = 0
        for s in c["steps"]:
            if "live" in s:
                t = s["cut_ms"] + s["asr_ms"] + s["live"]["ms"]
                for i in range(C.lcp(C.norm_units(s["src_partial"], lang), fsrc)):
                    first_live[i] = first_live[i] if first_live[i] is not None else t
                w = words(s["live"]["tr"])
                r_live += len(prev_live) - C.lcp(prev_live, w)
                la2 = w[:C.lcp(prev_tr, w)] if prev_tr is not None else []
                r_la2 += len(prev_la2) - C.lcp(prev_la2, la2)
                prev_live, prev_la2, prev_tr = w, la2, w
                a["mt_live"].append(s["live"]["ms"])
                a["cycle"].append(s["asr_ms"] + s["live"]["ms"])
            if "stable_src" in s:
                t = s["cut_ms"] + s["asr_ms"] + s["stable_src"]["ms"]
                for i in range(C.lcp(C.norm_units(s["src_committed"], lang), fsrc)):
                    first_stable[i] = first_stable[i] if first_stable[i] is not None else t
                w = words(s["stable_src"]["tr"])
                r_stable += len(prev_stable) - C.lcp(prev_stable, w)
                prev_stable = w
                a["mt_stable"].append(s["stable_src"]["ms"])
        end = total + POST_MS
        for i in range(n):
            a["live"].append((first_live[i] or end) - spoken[i])
            a["stable"].append((first_stable[i] or end) - spoken[i])
            a["base"].append(end - spoken[i])
        a["r_live"].append(r_live)
        a["r_la2"].append(r_la2)
        a["r_stable"].append(r_stable)
        a["final_words"].append(len(words(c["final_tr"])))
    print("Trễ từ lúc từ nguồn được nói tới lúc có bản dịch chứa nó (ms, p50/p90). base: chờ hết clip như hiện nay;")
    print("live: dịch bản chép tạm; stable: chỉ dịch phần nguồn đã chốt. Rút lại: số từ dịch đã hiện rồi bị thay, mỗi câu.")
    for lang, a in sorted(agg.items()):
        f = lambda v: f"{st.median(v):.0f}/{C.pct(v, 0.9):.0f}"  # noqa: E731
        print(f"{lang}: base {f(a['base'])} | live {f(a['live'])} | stable {f(a['stable'])} || rút lại: live "
              f"{st.mean(a['r_live']):.0f}, live chỉ hiện phần chung {st.mean(a['r_la2']):.0f}, stable "
              f"{st.mean(a['r_stable']):.0f} (bản cuối ~{st.mean(a['final_words']):.0f} từ) || ASR+MT mỗi bước p50 "
              f"{st.median(a['cycle']):.0f} ms, MT live {st.median(a['mt_live']):.0f}, MT stable "
              f"{st.median(a['mt_stable']):.0f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "analyze"])
    ap.add_argument("path", nargs="?")
    ap.add_argument("--model", default=os.path.join(C.MODELS, "Hy-MT2-1.8B-Q8_0.gguf"))
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()
    if args.cmd == "run":
        run(args.path or DEFAULT_ASR, args.model, args.out)
    else:
        analyze(args.path or DEFAULT_OUT)


if __name__ == "__main__":
    main()
