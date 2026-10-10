#!/usr/bin/env python3
"""Thử 1: dịch lại một câu đang lớn dần (chữ nguồn hoàn hảo, không qua ASR).

So hai cách: (a) mỗi bước dịch lại cả câu; (b) chốt phần chung của hai bản dịch liền nhau (LocalAgreement-2) rồi
ép phần đã chốt làm đầu câu trả lời (assistant prefill). Đo thời gian mỗi bước, số từ bị xóa, và bản cuối của (b) có
giữ nghĩa so với (a) không.

    python3 bench/2026-10-10-do-tre/mt_prefix.py [--model models/Hy-MT2-1.8B-Q8_0.gguf] [--out <json>] [-- <cờ llama-server>]
"""
import argparse
import json
import os
import statistics as st
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

CASES = [
    ("en-1", "en", "words",
     "So the main thing we need to decide today is whether we ship the new pricing page before the end of the "
     "quarter or wait until the analytics migration is finished."),
    ("en-2", "en", "words",
     "I think the latency numbers look good on the M4 machines, but we still don't have any data from the older "
     "laptops that most of our customers actually use."),
    ("ja-1", "ja", "chars3",
     "来週の会議では、新しい価格設定について営業チームの意見を聞いてから最終的な判断をしたいと思います。"),
    ("zh-1", "zh", "chars3", "我们这个季度的主要目标是把新版本的延迟降低到一秒以内，同时保证翻译质量不下降。"),
    ("ko-1", "ko", "words", "다음 주 회의에서는 새로운 가격 정책에 대해 영업팀의 의견을 듣고 나서 최종 결정을 내리고 싶습니다."),
    ("vi-1", "vi", "words",
     "Hôm nay chúng ta cần thống nhất xem có nên phát hành bản mới trước cuối tháng hay không, vì khách hàng "
     "đang chờ tính năng này."),
]


def prefixes(text, mode):
    """Mỗi bước thêm 2 từ (en/ko/vi) hay 3 chữ (zh/ja), xấp xỉ 0,6–0,8 s lời nói."""
    if mode == "words":
        w = text.split()
        return [" ".join(w[:i]) for i in list(range(2, len(w), 2)) + [len(w)]]
    return [text[:i] for i in list(range(3, len(text), 3)) + [len(text)]]


def run_case(port, key, case):
    name, src, mode, text = case
    tgt = C.TARGET[src]
    steps = prefixes(text, mode)
    rows, prev = [], None
    for p in steps:  # (a) dịch lại cả câu
        out, ttft, total, tm = C.chat(port, key, C.prompt_for(src, tgt, p))
        erased = len(prev.split()) - C.lcp(prev.split(), out.split()) if prev is not None else 0
        rows.append({"mode": "full", "src": p, "out": out, "ttft_ms": round((ttft or 0) * 1000, 1),
                     "total_ms": round(total * 1000, 1), "erased_words": erased,
                     "predicted_n": tm and tm.get("predicted_n")})
        prev = out
    committed, prev_h = "", None
    for i, p in enumerate(steps):  # (b) LocalAgreement-2 + prefill
        out, ttft, total, tm = C.chat(port, key, C.prompt_for(src, tgt, p), prefill=committed or None)
        if prev_h is not None and i < len(steps) - 1:
            k = C.lcp(prev_h.split(), out.split())
            agree = " ".join(out.split()[:k])
            if len(agree) > len(committed):
                committed = agree  # không để dấu cách cuối: làm lệch token
        rows.append({"mode": "prefill", "src": p, "prefill": committed, "out": out,
                     "ttft_ms": round((ttft or 0) * 1000, 1), "total_ms": round(total * 1000, 1),
                     "predicted_n": tm and tm.get("predicted_n")})
        prev_h = out
    return {"case": name, "src": src, "rows": rows}


def stable_display(full_rows):
    """Chỉ hiện phần chung của hai bản dịch liền nhau: bao nhiêu từ của bản cuối đã hiện đúng ở mỗi bước, bao nhiêu
    từ đã hiện rồi phải rút lại."""
    final = full_rows[-1]["out"].split()
    shown_prev, retracted, frac = [], 0, []
    for i, r in enumerate(full_rows):
        w = r["out"].split()
        shown = final if i == len(full_rows) - 1 else (w[:C.lcp(full_rows[i - 1]["out"].split(), w)] if i else [])
        retracted += len(shown_prev) - C.lcp(shown_prev, shown)
        frac.append(round(C.lcp(shown, final) / len(final), 2))
        shown_prev = shown
    return retracted, frac


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.join(C.MODELS, "Hy-MT2-1.8B-Q8_0.gguf"))
    ap.add_argument("--out", default=os.path.join(C.DATA, "mt_prefix.json"))
    ap.add_argument("server_args", nargs="*", help="cờ thêm cho llama-server, ví dụ --spec-type ngram-mod")
    args = ap.parse_args()
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    proc, port, key = C.start_server(args.model, args.server_args)
    try:
        C.chat(port, key, C.prompt_for("en", "vi", "Hello."))  # làm nóng
        res = [run_case(port, key, c) for c in CASES]
    finally:
        proc.terminate()
        proc.wait(timeout=20)
    json.dump({"model": os.path.basename(args.model), "server_args": args.server_args, "cases": res},
              open(args.out, "w"), ensure_ascii=False, indent=1)
    for c in res:
        full = [r for r in c["rows"] if r["mode"] == "full"]
        pre = [r for r in c["rows"] if r["mode"] == "prefill"]
        retracted, frac = stable_display(full)
        print(f"{c['case']}: {len(full)} bước | dịch lại cả câu: p50 {st.median(r['total_ms'] for r in full):.0f} ms, "
              f"chữ đầu p50 {st.median(r['ttft_ms'] for r in full):.0f} ms, xóa {sum(r['erased_words'] for r in full)} từ "
              f"| prefill: p50 {st.median(r['total_ms'] for r in pre):.0f} ms "
              f"| chỉ hiện phần ổn định: rút lại {retracted} từ, phần bản cuối đã hiện theo bước {frac}")
        print("   bản cuối, dịch lại cả câu:", full[-1]["out"])
        print("   bản cuối, prefill        :", pre[-1]["out"])


if __name__ == "__main__":
    main()
