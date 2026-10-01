"""S7: dịch bộ test qua đúng llama-server và prompt của app (spec A3, §6.5).

Dùng:
  python3 bench/phase0/mt/translate.py --model models/Hy-MT2-1.8B-Q8_0.gguf [--variant plain|context] [--limit N]
Kết quả: bench/phase0/data/mt/outputs/<model>-<variant>.jsonl, chạy lại thì tiếp tục từ câu chưa dịch.
Thêm `--label <nhãn>` thì ghi vào outputs-<nhãn>/, không đụng tới kết quả mốc trong outputs/.
Từ Giai đoạn 1, A3 dịch bằng `latency-bench mt-eval` (code dịch của app); công cụ này giữ để so sánh.
"""
import argparse
import json
import os

from common import ROOT, LlamaServer, context_prompt, translation_prompt

DATA = os.path.join(ROOT, "bench", "phase0", "data", "mt")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--variant", choices=["plain", "context"], default="plain")
    ap.add_argument("--limit", type=int, default=0, help="chỉ dịch N câu đầu của mỗi chiều (chạy thử)")
    ap.add_argument("--label", default="", help="ghi vào outputs-<nhãn>/ thay vì outputs/ (mốc)")
    args = ap.parse_args()

    items = [json.loads(line) for line in open(os.path.join(DATA, "testset_phase0.jsonl"), encoding="utf-8")]
    if args.limit:
        counts, kept = {}, []
        for it in items:
            if counts.get(it["dir"], 0) < args.limit:
                kept.append(it)
                counts[it["dir"]] = counts.get(it["dir"], 0) + 1
        items = kept
    if args.variant == "context":
        items = [it for it in items if it["context"]]

    stem = os.path.basename(args.model).removesuffix(".gguf")
    out_dir = os.path.join(DATA, f"outputs-{args.label}" if args.label else "outputs")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{stem}-{args.variant}.jsonl")
    done = set()
    if os.path.exists(out_path):
        with open(out_path, "rb+") as f:  # lần trước bị ngắt giữa lúc ghi: bỏ dòng cuối viết dở
            data = f.read()
            f.truncate(data.rfind(b"\n") + 1)
        done = {json.loads(line)["id"] for line in open(out_path, encoding="utf-8")}

    with LlamaServer(args.model, log_path=os.path.join(out_dir, f"{stem}.llama.log")) as server, \
            open(out_path, "a", encoding="utf-8") as out:
        server.chat(translation_prompt("Hello.", "en", "vi"), max_tokens=16)  # làm nóng
        todo = [it for it in items if it["id"] not in done]
        for n, it in enumerate(todo, 1):
            src, tgt = it["src_lang"], it["tgt_lang"]
            prompt = (context_prompt(it["src"], it["context"], src, tgt) if args.variant == "context"
                      else translation_prompt(it["src"], src, tgt))
            hyp, info = server.chat(prompt)
            row = {"id": it["id"], "dir": it["dir"], "hyp": hyp, "src_tokens": server.count_tokens(it["src"]), **info}
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
            out.flush()
            if n % 25 == 0 or n == len(todo):
                print(f"{stem}-{args.variant}: {n}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
