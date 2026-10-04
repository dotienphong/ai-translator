# Kiểm tra của agent ngày 2026-10-04 (dòng 28, 29, 121, 206, 207, 209, 212, 215, 216, 227, 229, 248, 261, 297, 337)

Máy: Mac M4 Pro 24 GB, macOS 26.6.2, `main` ở `1e66356` (cộng thay đổi chưa commit của bench). Chỉ ghi điều đo được.

## A3 (dòng 28) và A4 (dòng 29): chống thụt lùi

- A3: `latency-bench mt-eval` dịch 620 câu mỗi gói bằng code dịch hiện tại của app (`llama-server` b11146, biến thể `plain`),
  chấm COMET bằng `score_mt.py --label gd1-a3` (`results/s7_mt-gd1-a3.{json,md}`), cổng `gates.py a3`
  (`results/acceptance/a3.json`): **ĐẠT**, cả 16 chiều (2 gói × 8) giống mốc đến 3 chữ số thập phân (giải mã tất định). Mức sàn Anh→Việt: Q8_0 0,842 ≥ 0,83,
  Q4_K_M 0,841 ≥ 0,80.
- A4: `latency-bench asr-eval` 548 clip mỗi gói với `asr-worker` sidecar hiện tại (Metal, chế độ B, sàn 512), chấm bằng
  `score_asr.py` (`results/a4_m4pro-{turbo,small}-gd1a4.json`), cổng `gates.py a4` (`results/acceptance/a4-{turbo,small}.json`):
  **ĐẠT**, mọi nhóm bằng mốc `a4_m4pro-*-final.json` đến số thứ ba (giải mã tất định).
- Ý nghĩa: bản build hiện tại tái lập đúng mốc; công cụ 08a chạy được từ đầu đến cuối trên số đo thật.

## Bộ kiểm tra chuẩn (dòng 215)

- `cargo test --workspace`: 790 đạt, 0 lỗi, 13 bỏ qua (30 bộ test). `pnpm test`: 138 đạt. `server`: 360 đạt. `pnpm build`
  (tsc, vite): đạt (chỉ có cảnh báo kích thước chunk).
- `cargo deny check`: advisories, bans, licenses, sources đều ok. `cargo audit`: không lỗ hổng; 3 cảnh báo đã được cho phép trong
  `deny.toml`: `paste` (unmaintained, RUSTSEC-2024-0436; chỉ là macro lúc biên dịch, do `candle` kéo vào), và hai mục chỉ có trên
  Linux (gtk của Tauri): `glib` (unsound, RUSTSEC-2024-0429) và `proc-macro-error` (unmaintained, RUSTSEC-2024-0370). `pnpm audit`
  (app và `server`): không có lỗ hổng.
- `vad_reference` với `--include-ignored` không chạy vì không nâng `candle-core` hay `candle-onnx`.

## Phiên bản (dòng 206, 207, 216)

- Không có gói pre-release trong `Cargo.lock` (`wasi 0.11.1+wasi-snapshot-preview1` là metadata của bản ổn định), cũng không có
  trong `pnpm-lock.yaml` của app và `server`.
- Lockfile đã commit (`Cargo.lock`, `pnpm-lock.yaml`, `server/pnpm-lock.yaml`, hai lockfile trong `third_party/`).
- Phiên bản engine ghi ở: `third_party/README.md` (whisper.cpp 1.8.3 qua `whisper-rs-sys` 0.15.0), `scripts/copy-sidecars.sh`
  (llama.cpp b11146), spec §6.12. Toolchain khóa ở `rust-toolchain.toml` (1.98.1).
- ggml không nằm trong cây phụ thuộc của app (chỉ trong hai tiến trình phụ); không có hai bản `tauri`, `whisper` hay `ggml` cùng
  lúc (`cargo tree -d`). Plugin Tauri đều ở dòng 2.x cùng `tauri` 2.12.1. `pnpm install --frozen-lockfile` không cảnh báo
  peer dependency.
- Bản mới có sẵn nhưng **không nâng** (chỉ nâng khi chủ động quyết): `async-recursion` 1.2.0, `cc` 1.6.0, `libc` 0.2.190, `mio`
  1.2.4, `rubato` 5.0.1 (resampler, nâng thì chạy lại A4), `tokio` 1.53.2, `uuid` 1.27.0.
- Chưa có công cụ ép luật tuổi phát hành 1 ngày (dòng 337): pnpm không đặt `minimumReleaseAge` ở repo (không có
  `pnpm-workspace.yaml`), cargo không có cơ chế tương đương. Luật vẫn áp thủ công lúc cài.

## Mức CPU cố định (dòng 209)

- `.cargo/config.toml` đúng yêu cầu (`force = true`; x64 AVX, AVX2, BMI2, FMA, F16C, không AVX-512; arm64 `armv8.4-a+fp16`).
- Thêm test `crates/asr-worker/tests/cpu_level.rs` (`1e66356`): `system_info` của bản build arm64 này là
  `NEON, ARM_FMA, FP16_VA, DOTPROD, ACCELERATE, REPACK`, không có `MATMUL_INT8`, `SME`, `SVE`. Đã thử đột biến (test đỏ). Nhánh
  x64 chưa chạy thật; chạy lần đầu ở job Windows của CI.
- Chưa chạy được trên máy M1 (không có máy).

## Âm thanh chỉ nằm trong RAM (dòng 248, phần tĩnh)

- Không có đường ghi PCM xuống đĩa trong `crates/pipeline/src`, `crates/audio-capture/src` (lib) hay `src-tauri/src`: `hound` là
  dev-dependency của `pipeline`; công cụ `capture` (ghi WAV) không nằm trong `externalBin` của bộ cài
  (`src-tauri/release/tauri.{macos,windows}.json` chỉ có `asr-worker` và `llama-server`).
- Phần "không gửi qua mạng" là A7 (dòng 34), cần người chạy proxy.

## Bí mật trong app (dòng 261)

- `src-tauri/keys/` chỉ có ba file khóa công khai (token bản quyền, manifest model, bản cập nhật). Không có mẫu khóa riêng,
  token hay API key trong `src`, `src-tauri`, `crates`; không có chuỗi khóa riêng trong binary dev; git không theo dõi file
  `.pem/.p12/.pfx/.key/.env*/.dev.vars*`; `.gitignore` đã chặn các mẫu này. Chưa có bước quét bí mật tự động trong CI.

## Tải máy (dòng 229)

- S6 chốt trên M4 Pro (`results/latency/m4pro-chot-*.json`): CPU cả máy 1,8–3,0%, dưới nhiều lần ngưỡng 30%. Chỉ có máy này.
  Phép đo chính thức của 08 (`soak.py`, 2 giờ) và máy khác chưa chạy.

## Flash attention (dòng 121)

- whisper.cpp #3941 (mask cho K/V đệm) vẫn là PR **mở**, cập nhật lần cuối 2026-07-16, 0 bình luận. Giữ flash attention tắt.

## `llama-server` CPU

- Xem `llama-norepack-ram.md` (dòng 227).
