# Phase 0: công cụ đo và kết quả

Kế hoạch: `docs/superpowers/plans/2026-09-29-phase-0-00-tong-quan.md`.

- `fetch.py`: tải model và llama.cpp b11146 vào `models/` và `tools/` (không commit), kiểm kích thước và SHA-256 đã ghim trong script. Chạy `python3 bench/phase0/fetch.py`, cần Python 3.12 trở lên, tải khoảng 3,8 GB.
- `mt/`: S4 (`check_template.py`) và S7 phần dịch (`build_testset.py`, `translate.py`, `score_mt.py`).
- `asr/`: bộ clip A4 (`build_clips.py`) và chấm WER/CER (`score_asr.py`).
- `latency/`: S6 (`build_sessions.py`, `run_matrix.py`, `summarize.py`, `vram-sample.ps1`, `vram_peak.py`).
- `vad/`: xác suất VAD tham chiếu bằng onnxruntime (`ref_probs.py`).
- `size/`: ước lượng dung lượng bộ cài, phần tiến trình phụ (`sidecar_size.py`).
- `results/`: kết quả nhỏ (JSON, Markdown), được commit.
- `data/`: dữ liệu lớn (âm thanh, bản dịch), không commit.

Các công cụ Rust nằm trong workspace: `latency-bench latency` (S6) và `latency-bench asr-eval` (A4).
