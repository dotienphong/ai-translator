# Benchmark chọn model dịch (2026-09-29)

Đây là mốc dùng để chọn model dịch. Bộ test ở đây cũng dùng cho tiêu chí A3 trong `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`, nhưng điểm mốc của A3 sẽ được chấm lại ở S7 với Q8_0 và Q4_K_M qua `llama-server`. Bảng kết quả đầy đủ ở `REPORT.md`.

## Thiết lập

- **Máy:** MacBook Pro Apple M4 Pro, RAM 24 GB.
- **Dữ liệu:** WMT24++ (`google/wmt24pp`, Apache 2.0), lọc các câu dài 15–250 ký tự.
  - 100 câu Anh→Việt, 100 câu Việt→Anh, 40 câu Việt→Trung, 40 câu Việt→Nhật, 40 câu Việt→Hàn.
  - Thêm 12 câu hội thoại đời thường (Việt→Anh, không có bản dịch chuẩn), để đọc so sánh bằng mắt.
  - Bộ câu cụ thể nằm trong `testset.jsonl`; `prep_data.py` dựng lại được bộ này.
- **Model:**
  - `facebook/nllb-200-distilled-600M` (fp16)
  - `tencent/HY-MT1.5-1.8B` (bf16)
  - `tencent/Hy-MT2-1.8B` (bf16)
  - `google/madlad400-3b-mt` (bf16)
  - Tất cả dịch greedy, batch 1.
- **Chấm điểm:** COMET `Unbabel/wmt22-comet-da` và chrF++ (riêng tiếng Trung và tiếng Nhật dùng chrF). Có kiểm định bootstrap theo cặp.
- **Đo tốc độ:**
  - Trên GPU Mac (MPS), dùng `run_mt.py`.
  - Trên CPU 4 luồng với trọng số 8-bit, dùng `speed_cpu.py`: CTranslate2 int8 cho NLLB và MADLAD, llama.cpp Q8_0 GGUF cho HY-MT.

## Lưu ý về môi trường

- **NLLB và HY-MT** chạy bằng `transformers==5.17.0` và `torch==2.14.0`.
- **MADLAD phải dùng `transformers==4.57.6`**, vì bản 5.x không nối trọng số embedding của decoder, khiến model dịch ra ký tự vô nghĩa.
- **COMET** dùng `unbabel-comet==2.2.7` với `transformers` 4.x. Khi gọi phải truyền `num_workers=1`, vì với torch 2.14 thì `num_workers=0` sẽ báo lỗi `multiprocessing_context`.
- **Đường dẫn trong script đang viết cố định:** `speed_cpu.py` tìm binary `llama-server` ở `../llamacpp/*/`, và các script mặc định có sẵn virtualenv `../venv-mt` và `../venv-comet`. Muốn chạy lại trên máy khác thì phải sửa các đường dẫn này.

## Chạy lại

```bash
python prep_data.py                  # dựng testset.jsonl
python run_mt.py <model>             # model: nllb-600m | hymt1.5-1.8b | hymt2-1.8b | madlad-3b
python speed_cpu.py <model>          # đo tốc độ trên CPU 4 luồng, 8-bit
python score.py                      # chấm điểm, ghi ra results.json (chạy bằng môi trường COMET)
python report.py > REPORT.md
```
