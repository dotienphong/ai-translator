# Model dịch nhanh cho gói Nhanh: đo so sánh (2026-10-21)

Căn cứ của `docs/superpowers/specs/2026-10-21-goi-nhanh-design.md` §2. Bảng kết quả nằm trong spec đó.

## Điều kiện

- MacBook Pro M4 Pro 24 GB, macOS 26.6. Máy **không** để rảnh, các lượt chạy lúc khác nhau: số tốc độ chỉ để so tương đối.
- `llama-server` b11146 (`target/release/llama-server` của repo), `-c 2048 -np 1`; Metal là `-ngl 99`, CPU là `-ngl 0 -t 4`.
- Gọi `/v1/chat/completions` stream, `temperature` 0, `repeat_penalty` 1,05, `max_tokens` 512, `cache_prompt`. Một request làm nóng trước.
- Bộ test: `bench/2026-09-29-mt-benchmark/testset.jsonl` (332 câu, 320 câu có bản dịch chuẩn).
- Mẫu prompt Hy-MT2 như app (spec chính §6.5). Mẫu LMT ở lượt đo này: `Translate the following text from {S} into {T}.\n{S}: {text}\n{T}:` (dấu chấm; model card dùng dấu hai chấm, spec §5.2 đo lại).
- GGUF của LMT ở lượt đo này lấy từ `mradermacher/LMT-60-0.6B-GGUF` và `mradermacher/LMT-60-1.7B-GGUF` (chỉ để đo; gói phát hành dùng file tự chuyển, spec §7).
- quickmt: CTranslate2 4.8.3 int8, CPU 4 luồng, greedy, `repetition_penalty` 1,1, `no_repeat_ngram_size` 4; vi↔zh/ja/ko đi qua tiếng Anh.
- COMET: `unbabel-comet==2.2.7`, `transformers==4.57.6`, `torch==2.14.1`, Python 3.12, `setuptools<81` (cần `pkg_resources`), model `Unbabel/wmt22-comet-da`, CPU.

## Chạy lại

```bash
python -I measure_llama.py <llama-server> <gguf> <lmt|hymt> <metal|cpu4> <testset.jsonl> outputs/out-<tên>-<chế độ>.jsonl
python -I quickmt_dump.py <thư mục model quickmt> <testset.jsonl> outputs/out-quickmt.jsonl
python -I comet_score.py <testset.jsonl> outputs/out-*.jsonl     # môi trường COMET
```

`measure_quickmt.py` và `measure_pivot.py` là hai lượt đo tốc độ và chrF đầu tiên của quickmt (không lưu bản dịch).

## Kết quả thô

`outputs/out-<model>-<chế độ>.jsonl`: mỗi dòng `id`, `hyp`, và với `measure_llama.py` thêm `first_ms`, `total_ms`.
