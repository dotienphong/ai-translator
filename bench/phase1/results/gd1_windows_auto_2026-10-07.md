# Giai đoạn 1 trên Windows: phần tự động (2026-10-07)

Agent chạy, người chưa thao tác gì. Chỉ gồm các bước build, test và kiểm file; **mọi dòng cần người dùng app (khay, phím tắt, thanh phụ đề, Teams/Zoom, DPI, nhiều màn hình, hộp thoại file, bộ cài, mua thật) chưa làm**, nên các task Windows của 01 Task 25, 02c Task 9, 03b Task 9, 06b Task 7 và 07a Task 16 vẫn mở.

## Máy và công cụ

| Mục | Giá trị |
|---|---|
| Máy | Intel Core i5-1345U, 32 GB RAM, Intel Iris Xe (không có GPU rời) |
| Hệ điều hành | Windows 11 Pro, build 10.0.26300 |
| Rust | 1.98.1 (`rust-toolchain.toml`), cài mới ngày 2026-10-07 |
| MSVC | Visual Studio Build Tools 2026 (18), MSVC 14.51.36231, Windows SDK 10.0.26100 |
| Khác | CMake 4.4.4, protoc 36.0, Strawberry Perl 5.42.3 (không có `nasm`), LLVM (libclang), Vulkan SDK 1.4.363.0 |
| Node, pnpm | Node 24.13.0, pnpm 12.6.0. **`engines.node` ghi `>=24.21.0`, máy này thấp hơn**; pnpm không chặn (không bật `engine-strict`) |
| Build | `CARGO_TARGET_DIR=C:\ait-target`, `CARGO_INCREMENTAL=0`, debug info tắt (máy ít ổ đĩa); không đổi file nào của repo |

## Kết quả

| Bước (task) | Lệnh | Kết quả |
|---|---|---|
| Frontend (01 T25 S1) | `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test` | Đạt. 19 file, **161 test qua** (kế hoạch ghi 46, số cũ) |
| Clippy app (01 T25 S1) | `cargo clippy -p meeting-translator --all-targets -- -D warnings` | Đạt, không cảnh báo (lần đầu 9 phút 11 giây, gồm build OpenSSL và SQLCipher) |
| Test app (01 T25 S1, 03b T9 S1) | `cargo test -p meeting-translator` | Đạt. Lib: **435 passed, 0 failed, 2 ignored** (kế hoạch ghi 106 passed, 1 ignored; số cũ). 13 test `db::` qua, gồm `the_cipher_provider_matches_the_platform`: SQLCipher với OpenSSL tĩnh build được chỉ với Strawberry Perl, không cần `nasm` |
| Kho khóa Windows (01 T25 dòng 14, 14a) | `cargo test -p meeting-translator --lib os_keystore -- --ignored` (và bản `KEYSTORE_KEEP=1`) | Đạt, `1 passed` mỗi lần. `cmdkey /list` cho mục tạm: `Local machine persistence` (không phải Enterprise). Đã xóa mục tạm bằng `cmdkey /delete`, không còn mục `desktop.test` nào |
| Clippy và test workspace (02c T9 S1) | `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace` | Đạt. **767 passed, 0 failed, 11 ignored** (cần model hay binary thật). Một cảnh báo `unused_mut` của rustc nằm ở `third_party/whisper-rs-sys/build.rs:137` (crate vendored, chỉ Windows báo; không sửa) |
| Thiết bị âm thanh (02c T9 S1) | `cargo test -p audio-capture --lib -- --include-ignored the_default_device_is_listed` | Đạt: WASAPI liệt kê được thiết bị phát mặc định |
| `license::` bản debug (06b T7 S1) | `cargo test -p meeting-translator --lib license:: -- --test-threads=1` | Đạt, **85 passed** |
| `pro::` và `license::` bản release (06b T7 S1) | `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1` | Đạt, **89 passed** (build release 13 phút 13 giây). Có `the_team_requirement_only_takes_a_real_team_id` và `the_dev_gate_exists_only_in_a_debug_build_with_the_switch_on` |
| Không có DLL OpenSSL (03b T9 S2) | `pnpm tauri build --debug --no-bundle`, `dumpbin /dependents` | Đạt. 33 DLL, toàn DLL hệ thống (`kernel32`, `user32`, `crypt32`, `api-ms-win-crt-*`…); **không có `libcrypto*`, `libssl*` và không có `VCRUNTIME140.dll`** |
| `/DEPENDENTLOADFLAG:0x800` (02c T9) | `dumpbin /loadconfig` | Đạt cho `meeting-translator.exe` và bản test của `asr-worker`: `0800 Dependent Load Flag` |
| `device_id_hash` (06b T7 S2) | băm SHA-256 của `MachineGuid` | Tiến trình 64 bit và tiến trình 32 bit (mở tường minh khung 64 bit) cho cùng một giá trị. App đọc đúng khung 64 bit (`RRF_SUBKEY_WOW6464KEY`, `src-tauri/src/license/device.rs`). Chưa đối chiếu với giá trị app thật sự gửi (cần chạy app với log debug) |

## Test với sidecar và model thật (CPU, bản release)

`asr-worker` build `--release --features shared-encode` (bản CPU, không Vulkan); `llama-server` là bản chính thức b11146 CPU trong `tools\llama-b11146\win-cpu-x64\`; model Whisper `ggml-small-q5_1` và Hy-MT2 1.8B Q4_K_M; VAD `silero_vad_v6.2.3`.

| Test | Kết quả |
|---|---|
| `clients`: `real_llama_server_requires_the_api_key`, `real_llama_server_closes_the_connection_after_a_stream` | Đạt, 2 passed |
| `real_sidecars`: `real_sidecars_translate_the_fixture_in_order` (clip FLEURS 19 giây phát theo thời gian thực) | Đạt. 4 đoạn, 2 câu dịch, 0 lỗi, 0 bỏ bước dịch; cắt đoạn p50 320 ms; nhận dạng p50 1358 ms, p90 1409 ms; dịch p50 757 ms, p90 788 ms. Hai đoạn tiếng Việt báo `SameLang` đúng như fixture. Sau test không còn `llama-server` hay `asr-worker` mồ côi. Số này chưa phải A2 (A2 đo bằng app thật, cộng nhiều thành phần, ở 08) |
| `real_terms`: `real_model_follows_the_glossary_more_often` | Đạt. Đúng thuật ngữ: không từ điển 1/8, có từ điển 7/8 |

Không chạy: `no_speech_signals_through_the_real_worker` (phép đo chọn ngưỡng, đã có số liệu trên Mac), `candle_matches_onnxruntime` (cần `VAD_REF_JSON`), `latency::phase1_rules_drop_no_a4_clip` (cần `bench/phase0/data` đầy đủ), và các test bản Vulkan (chưa build `asr-worker-vulkan`).

## Điểm lệch của kế hoạch

- **06b Task 7 Step 2:** kế hoạch bảo chạy lệnh PowerShell thường trong PowerShell 32 bit và mong cùng giá trị. Thực tế PowerShell 32 bit đọc khung `Wow6432Node` nên `MachineGuid` là `null`. Cách kiểm đúng là mở khung 64 bit tường minh (`RegistryView.Registry64`), như app làm. App không sai; chỉ cần sửa lời kiểm trong kế hoạch.
- Số test trong 01 Task 25 (46 và 106) và nhiều chỗ khác đã cũ; số hiện tại ở bảng trên.

## Chưa làm trong lượt này

- Mọi bước cần người dùng app thật (xem đầu file), A1 với Teams, Zoom, Meet, Zalo, DPI 150%, hai màn hình.
- `pnpm tauri build` (bộ cài NSIS), thử cài và gỡ (07a Task 16): chưa có `makensis`, cần build release có LTO cộng sidecar; còn ghi `HKLM\…\Run` cần quyền admin.
- Đo A2, A3, S6 bằng app thật (cần máy rảnh), soak 2 giờ, kiểm mạng qua proxy.
- Ký thật (T1, T2), production, mua thật.
