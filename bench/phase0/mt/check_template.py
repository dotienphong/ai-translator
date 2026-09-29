"""Spike S4: llama-server dùng được chat template trong GGUF của Hy-MT2 qua /v1/chat/completions (giả định 3, §14).

Với mỗi ca, cả ba điều sau phải đạt:
1. `tokens_equal`: token mà llama-server đưa vào model cho prompt tự dựng từ template trong GGUF trùng từng token với
   tokenizer Hugging Face (`apply_chat_template`, ghim revision). Kiểm cả `usage.prompt_tokens` của /v1/chat/completions.
2. `stream_equals_completion`: bản dịch stream qua /v1/chat/completions giống hệt bản dịch /completion nạp thẳng token
   của Hugging Face, không qua tokenizer của llama.cpp.
3. `stopped_on_eos`: model dừng ở EOS (`finish_reason` là `stop`), không chạy tới số token tối đa.
`template_equal` (so chuỗi của /apply-template với Hugging Face) chỉ để chẩn đoán: chuỗi có thể lệch ở BOS mà token vẫn đúng.

Template trong GGUF trùng từng byte với `chat_template.jinja` trên Hugging Face, nên S4 kiểm engine template (minja) và
cách server ghép prompt. Cách gọi một lượt `user` với `add_generation_prompt=True` khớp model card.

Dùng (môi trường có transformers 5.x, model card Hy-MT2 yêu cầu transformers ≥ 5.6):
  uv run --no-project --python 3.12 --with "transformers==5.17.0" --with "jinja2==3.1.6" \
    python bench/phase0/mt/check_template.py --model models/Hy-MT2-1.8B-Q8_0.gguf
Mã thoát: 0 đạt, 1 không đạt, 2 lỗi công cụ (ví dụ thiếu `llama-server` hay model).
Cảnh báo `special_eos_id is not in special_eog_ids` khi nạp GGUF là vô hại; `stopped_on_eos` mới là phép kiểm thật.
Kết quả: bench/phase0/results/s4_template_<model>.json; log của llama-server ở bench/phase0/data/.
"""
import argparse
import json
import os
import sys

import jinja2
import transformers
from common import ROOT, LlamaServer, translation_prompt
from transformers import AutoTokenizer

TOKENIZER_REPO = "tencent/Hy-MT2-1.8B"
TOKENIZER_REV = "9a341cd1b679d3efd23b46e847b01745a71ed792"  # main ngày 2026-09-29; template trùng từng byte với GGUF a0c709d9

CASES = [
    ("en", "vi", "Could you share the latest version of the report after the meeting?"),
    ("zh", "vi", "我们下周需要完成新产品的测试。"),
    ("ja", "vi", "来月の予算について、もう一度確認させてください。"),
    ("ko", "vi", "회의가 끝나면 보고서 최신 버전을 공유해 주시겠어요?"),
    ("vi", "en", "Chúng ta cần chốt ngân sách trước thứ Sáu tuần này."),
    ("en", "vi", "  So, um, let's get started.  "),               # Whisper hay trả câu có dấu cách đầu/cuối
    ("zh", "vi", "好的，我们开始吧。\u3000"),                       # dấu cách toàn khổ (U+3000) ở cuối
    ("ja", "vi", "お疲れ様です。\n\n次の議題に進みましょう。"),     # có xuống dòng trong câu
]


def main():
    sys.stdout.reconfigure(encoding="utf-8")  # stdout chuyển hướng trên Windows mặc định là cp1252
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()
    tok = AutoTokenizer.from_pretrained(TOKENIZER_REPO, revision=TOKENIZER_REV)
    stem = os.path.basename(args.model).removesuffix(".gguf")
    log_dir = os.path.join(ROOT, "bench", "phase0", "data")
    os.makedirs(log_dir, exist_ok=True)
    out = os.path.join(ROOT, "bench", "phase0", "results", f"s4_template_{stem}.json")
    if os.path.exists(out):
        os.remove(out)  # chạy lỗi giữa chừng thì không để lại kết quả cũ
    rows, ok = [], True
    with LlamaServer(args.model, log_path=os.path.join(log_dir, f"s4_{stem}.llama.log")) as server:
        build = server.build_info()
        for src, tgt, text in CASES:
            prompt = translation_prompt(text, src, tgt)
            msgs = [{"role": "user", "content": prompt}]
            hf_prompt = tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=False)
            hf_ids = tok.apply_chat_template(msgs, add_generation_prompt=True, tokenize=True, return_dict=True)["input_ids"]
            server_prompt = server.apply_template(prompt)
            # Token mà llama-server sẽ đưa vào model cho prompt do nó dựng (đường /v1/chat/completions), và số token
            # thật mà /v1/chat/completions đánh giá (không phụ thuộc /apply-template).
            server_ids = server.tokenize(server_prompt, add_special=True, parse_special=True)
            _, probe = server.chat(prompt, max_tokens=1)
            streamed, timing = server.chat(prompt, stream=True)
            direct = server.completion(hf_ids)  # tham chiếu: đúng token ID của HF, không qua tokenizer của llama.cpp
            row = {"dir": f"{src}->{tgt}",
                   "tokens_equal": server_ids == hf_ids and probe["prompt_tokens"] == len(hf_ids),
                   "template_equal": server_prompt == hf_prompt,  # chỉ để chẩn đoán, xem ghi chú ở docstring
                   "stream_equals_completion": streamed == direct,
                   "stopped_on_eos": timing["finish_reason"] == "stop",
                   "translation": streamed}
            if not (row["tokens_equal"] and row["template_equal"]):
                row.update(server_prompt=server_prompt, hf_prompt=hf_prompt, server_ids=server_ids, hf_ids=hf_ids)
            if not row["stream_equals_completion"]:
                row["completion"] = direct
            ok &= row["tokens_equal"] and row["stream_equals_completion"] and row["stopped_on_eos"]
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False))
    result = {"model": os.path.basename(args.model), "pass": ok, "llama_server": build,
              "tokenizer": {"repo": TOKENIZER_REPO, "revision": TOKENIZER_REV},
              "transformers": transformers.__version__, "jinja2": jinja2.__version__, "cases": rows}
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("S4", "ĐẠT" if ok else "KHÔNG ĐẠT", "->", out)
    return 0 if ok else 1


if __name__ == "__main__":
    try:
        code = main()
    except Exception as e:  # lỗi công cụ khác với "không đạt": mã 2
        print(f"S4 LỖI CÔNG CỤ: {type(e).__name__}: {e}", file=sys.stderr)
        code = 2
    raise SystemExit(code)
