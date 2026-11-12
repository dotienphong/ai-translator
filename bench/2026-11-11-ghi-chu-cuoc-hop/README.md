# Đo model local cho "Ghi chú cuộc họp"

Bước chặn của spec `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` (mục 10). Kết quả nằm ở `results/`; **đọc `results/tong-hop.md` trước**.

## Máy đo

- Intel Core i5-1345U (10 nhân / 12 luồng), RAM 32 425 MiB, card đồ họa tích hợp Intel Iris Xe (Vulkan, dùng chung RAM). Không có card rời.
- Windows (NT 10.0.26300). `uv` 0.12.23; Python 3.12 do `uv` cấp (Python hệ thống 3.13.12 không có `psutil`).
- `llama-server` b11146 (bản app đang khóa), `tools/llama-b11146/win-vulkan-x64/llama-server.exe`.

## Dữ liệu ngoài repo

`$DATA = D:\Dev\WORKSPACE\ai-translator-data\ghi-chu\` (không commit): `models\` (file GGUF), `src\`, `raw\`, `set\` (20 bản chép lời `.jsonl`), `out\<hệ>\<tên>.json` (đầu ra), `grading\` (phiếu chấm tay và `key.json`), `logs\`.

## Chạy lại

```powershell
cd bench\2026-11-11-ghi-chu-cuoc-hop
# tạo bộ thử (cần nguồn trong $DATA\src và Hy-MT2 chạy được)
uv run --python 3.12 python -I build_set.py
# chạy một cấu hình (gpu = Vulkan, cpu = chỉ CPU)
uv run --python 3.12 --with psutil python -I run_notes.py local --candidate qwen3-5-4b --config c16kx --hw gpu
uv run --python 3.12 --with psutil python -I run_notes.py local --candidate qwen3-5-4b --config c16kb --hw cpu --filter '*-chuan-60'
# chấm tự động
python score_auto.py "$DATA\out" > results\tu-dong.md
# kiểm thử
foreach ($t in "test_notes_lib","test_run_notes","test_grading","test_verify","test_round3") { python -I "$t.py" }
```

Cấu hình (`CONFIGS` trong `run_notes.py`): `c8k`, `c8kb`, `c16k`, `c16kb` (context, độ dài đoạn, trần token map, trần token reduce); `c16kw` (kiểm theo lô), `c16kx` (hệ tốt nhất: `map_v2.txt`, gộp chỉ viết tóm tắt `reduce_summary.txt`, kiểm từng việc `verify.txt`), `c16ky` (`c16kx` + map đọc lời gốc `map_v3.txt` + xoá hạn có số không có trong lời gốc). Ứng viên: `candidates.json`.

## Tệp

- `notes_lib.py`, `run_notes.py`: map-reduce (map từng đoạn, reduce gộp, thử lại JSON một lần).
- `schema.json`, `prompts/`: lược đồ đầu ra và lời nhắc.
- `make_raw.py`, `build_set.py`: dựng bộ thử (`results/bo-thu.md` mô tả và nêu giới hạn).
- `score_auto.py`: chấm tự động; `grading.py`: dựng phiếu và tính điểm chấm tay.
- `results/`: `may-do.md`, `ung-vien.md`, `bo-thu.md`, `tu-dong.md`, `cham-tay.md`, `cham-tay-2.md`, `cham-tay-3.md`, `tong-hop.md`.
