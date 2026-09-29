"""Spike S4: llama-server dùng được chat template trong GGUF của Hy-MT2 qua /v1/chat/completions (giả định 3, §14).

Kiểm tra:
1. Prompt do llama-server dựng (/apply-template) giống hệt chat template của tokenizer trên Hugging Face.
2. Bản dịch stream qua /v1/chat/completions giống hệt bản dịch /completion với prompt dựng bằng tokenizer.

Dùng (môi trường có transformers 5.x, model card Hy-MT2 yêu cầu transformers ≥ 5.6):
  uv run --python 3.12 --with "transformers==5.17.0" --with "jinja2==3.1.6" \
    python bench/phase0/mt/check_template.py --model models/Hy-MT2-1.8B-Q8_0.gguf
Kết quả: bench/phase0/results/s4_template_<model>.json; log của llama-server ở bench/phase0/data/.
"""
import argparse
import json
import os

from common import ROOT, LlamaServer, translation_prompt
from transformers import AutoTokenizer

CASES = [
    ("en", "vi", "Could you share the latest version of the report after the meeting?"),
    ("zh", "vi", "我们下周需要完成新产品的测试。"),
    ("ja", "vi", "来月の予算について、もう一度確認させてください。"),
    ("ko", "vi", "회의가 끝나면 보고서 최신 버전을 공유해 주시겠어요?"),
    ("vi", "en", "Chúng ta cần chốt ngân sách trước thứ Sáu tuần này."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()
    tok = AutoTokenizer.from_pretrained("tencent/Hy-MT2-1.8B")
    stem = os.path.basename(args.model).removesuffix(".gguf")
    log_dir = os.path.join(ROOT, "bench", "phase0", "data")
    os.makedirs(log_dir, exist_ok=True)
    rows, ok = [], True
    with LlamaServer(args.model, log_path=os.path.join(log_dir, f"s4_{stem}.llama.log")) as server:
        for src, tgt, text in CASES:
            prompt = translation_prompt(text, src, tgt)
            hf_prompt = tok.apply_chat_template([{"role": "user", "content": prompt}],
                                                add_generation_prompt=True, tokenize=False)
            server_prompt = server.apply_template(prompt)
            streamed, timing = server.chat(prompt, stream=True)
            direct = server.completion(hf_prompt)
            row = {"dir": f"{src}->{tgt}", "template_equal": server_prompt == hf_prompt,
                   "stream_equals_completion": streamed == direct, "translation": streamed, **timing}
            if not row["template_equal"]:
                row["server_prompt"], row["hf_prompt"] = server_prompt, hf_prompt
            ok &= row["template_equal"] and row["stream_equals_completion"]
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False))
    out = os.path.join(ROOT, "bench", "phase0", "results", f"s4_template_{stem}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"model": os.path.basename(args.model), "pass": ok, "cases": rows}, f, ensure_ascii=False, indent=1)
    print("S4", "ĐẠT" if ok else "KHÔNG ĐẠT", "->", out)
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
