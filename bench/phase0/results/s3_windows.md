# S3 trên Windows: `asr-worker` Vulkan và CPU, `--probe`, thư viện nạp, WER/CER, VAD, dung lượng

Ngày 2026-10-06. Kế hoạch: `docs/superpowers/plans/2026-09-29-phase-0-03-s3-nhan-dang.md`, Task 14–16 (Task 16: chủ dự án báo đạt ngày 2026-10-07).

## Máy và công cụ

- Lenovo 21HE: Intel Core i5-1345U (2 nhân P + 8 nhân E, 12 luồng), RAM 31,7 GB, Windows 11 Pro 10.0.26300.
- GPU: Intel Iris Xe Graphics (tích hợp, bộ nhớ dùng chung), driver 32.0.101.7088. Vulkan báo `uma: 1 | fp16: 1 | bf16: 0 | warp size: 32 | int dot: 1 | matrix cores: none`.
- Visual Studio BuildTools 2026 18.10.2 (MSVC 14.51.36231, Windows SDK 26100), Rust 1.98.1, CMake 4.4.4, LLVM 23.1.2 (libclang), Vulkan SDK 1.4.363.0, protoc 36.0, uv 0.12.23.
- whisper.cpp 1.8.3 (có vá, chế độ B), llama.cpp b11146 (bản tải sẵn). Model và bộ clip A4 dựng bằng `fetch.py` và `build_clips.py` (548 clip, khớp bộ trên Mac).

## Hai phát hiện về build

### 1. Cờ tối ưu bị mất trên MSVC (đã sửa bằng bản vá 0003)

Lần đầu `asr-worker-cpu` chép lời cực chậm: `small` mất khoảng 26 giây cho một clip 11,5 giây (nhận diện ngôn ngữ 67 ms), `turbo` khoảng 116 giây mỗi clip. Số luồng không đổi được kết quả (2 luồng 33 s, 4 luồng 26 s, 8 luồng 21 s, 12 luồng 22 s) và chế độ A (`ASR_MODE=split`) chậm y hệt, nên không phải lỗi giải mã dùng chung. Nguyên nhân: crate `cmake` 0.1.58 bỏ mọi cờ `/O*` rồi đặt `CMAKE_C_FLAGS_RELEASE` bằng phần còn lại, ghi đè mặc định `/O2 /Ob2 /DNDEBUG` của CMake. `CMakeCache.txt` của bản build cũ có `CMAKE_C_FLAGS_RELEASE = -nologo -MD -Brepro -W0`, tức ggml-cpu không được tối ưu.

Sửa: `third_party/whisper-rs-sys/build.rs` thêm `/O2 /Ob2 /DNDEBUG` qua `cflag`/`cxxflag` khi target là MSVC (bản vá `third_party/patches/0003-whisper-rs-sys-msvc-optimization-flags.patch`). Sau khi sửa, `CMakeCache.txt` có `/O2 /Ob2 /DNDEBUG -nologo -MD -Brepro -W0`, và `small` trên CPU 4 luồng còn 1,84 giây mỗi clip (nhanh hơn 14 lần), nhận diện ngôn ngữ còn 7 ms.

**Ảnh hưởng đến bản phát hành:** `scripts/release/build-sidecars-windows.mjs` build `asr-worker` bằng cùng cơ chế (`cargo build --release -p asr-worker`), nên mọi bản `asr-worker` Windows build trước bản vá này đều không tối ưu. Bản Vulkan cũng bị, vì tính mel, nhận diện ngôn ngữ và các phần chạy trên CPU vẫn dùng ggml-cpu. Mọi số đo dưới đây là của bản đã sửa.

### 2. Đường dẫn quá dài làm hỏng build CMake

Build vào `target\vulkan` thất bại với `FTK1011: could not create the new file tracking log file`: đường dẫn `...\target\vulkan\release\build\whisper-rs-sys-<hash>\out\build\ggml\src\...` vượt 260 ký tự. `LongPathsEnabled` đã bằng 1 nhưng FileTracker của MSBuild vẫn không dùng được. Cách xử lý ở đây: `--target-dir D:\t\v` (Vulkan), `D:\t\c` (CPU), `D:\t\r` (còn lại). Kế hoạch ghi `target\vulkan` và `target\cpu`, nên **trên máy có thư mục repo sâu thì phải đặt thư mục target ngắn**. Cần kiểm lại đường dẫn của runner CI Windows.

## Task 14: hai bản `asr-worker` và `--probe`

- `crates/asr-worker/src/probe.rs` chưa có trong repo (chỉ `main.rs` và `Cargo.toml` đã trỏ tới), nên đã tạo theo kế hoạch và thêm `pub mod probe` (có `cfg(feature = "vulkan")`) vào `lib.rs`. `cargo clippy -p asr-worker --features vulkan,shared-encode --all-targets -- -D warnings`: sạch.
- Kích thước (sau khi sửa cờ): `asr-worker-vulkan.exe` 54,3 MB, `asr-worker-cpu.exe` 1,4 MB.

`asr-worker-vulkan.exe --probe`:

```json
[{"name":"Intel(R) Iris(R) Xe Graphics","device_type":"integrated","device_local_bytes":16999974912,"vendor_id":32902}]
```

`device_local_bytes` là 17 GB vì GPU tích hợp dùng chung RAM, nên **không dùng con số này để đề xuất gói theo VRAM** trên GPU tích hợp (§6.7); phải dùng `device_type`. `asr-worker-cpu.exe --probe` in `[]`.

Mã thoát khi stdin đóng: `cmd /c "exit 3"` cho `exit=3` (cách đọc mã thoát dùng được); `asr-worker-cpu.exe < NUL` và `asr-worker-vulkan.exe < NUL` đều thoát với mã 0.

### Thư viện nạp lúc chạy (`dumpbin /dependents`)

| Binary | DLL đặc biệt | Ghi chú |
|---|---|---|
| `asr-worker-vulkan.exe` | `vulkan-1.dll` | Không có `ggml*.dll` hay `whisper*.dll`: whisper.cpp link tĩnh (§6.12) |
| `asr-worker-cpu.exe` | không | Không có `vulkan-1.dll` |
| `llama-server.exe` (win-vulkan-x64) | `llama-server-impl.dll` | Các backend `ggml-*.dll` nạp động |

Cả hai `asr-worker` đều nhập `MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll` (build thường, CRT động). Bản phát hành đã chọn link tĩnh CRT (`-C target-feature=+crt-static` trong `build-sidecars-windows.mjs`), nên dòng này chỉ ảnh hưởng bản build thường; chưa kiểm lại `dumpbin` trên bản `crt-static` của CI.

## Task 15: chép lời trên Vulkan và CPU

Bộ clip A4 đầy đủ (548 clip), chế độ B, 4 luồng, `audio_ctx` có sàn 512 (cấu hình chốt). So với mốc `a4_m4pro-*-final` trên Mac:

| Lượt | en | vi | zh | ja | ko |
|---|---|---|---|---|---|
| Mac M4 Pro, turbo (Metal) | 0,064 | 0,085 | 0,061 | 0,046 | 0,041 |
| **Windows, turbo, Vulkan (Iris Xe)** | 0,068 | 0,084 | 0,062 | 0,047 | 0,041 |
| Mac M4 Pro, small (Metal) | 0,082 | 0,226 | 0,104 | 0,142 | 0,083 |
| **Windows, small, CPU** | 0,079 | 0,224 | 0,104 | 0,140 | 0,084 |

(WER cho en và vi, CER cho zh, ja, ko; nhóm tất cả clip.) Chênh lệch nhỏ và không có hướng cố định, trừ en turbo (+6% tương đối); chế độ giải mã tất định nên khác biệt đến từ sai khác số học giữa backend.

Nhận diện ngôn ngữ đúng 100% ở mọi nhóm, `lid_fallback` bằng 0, chi phí LID/ASR 0–1%.

| Lượt | Thời gian chạy 548 clip | ASR p50 mỗi clip (clip trung bình khoảng 11 giây) | LID p50 |
|---|---|---|---|
| turbo, Vulkan (Iris Xe) | 10 phút 16 giây | 826 – 1250 ms | 7 – 8 ms |
| small, CPU | 22 phút 41 giây | 1907 – 2847 ms | 9 ms |
| turbo, CPU (chỉ 15 clip: 3 clip băng rộng mỗi ngôn ngữ) | 3 phút 19 giây | 10 080 – 14 026 ms | 6 – 7 ms |

- `turbo` chỉ chạy CPU xấp xỉ **bằng thời gian thực** (10–14 giây cho clip khoảng 11 giây, chưa tính dịch), nên không dùng được cho phụ đề trực tiếp trên máy không có GPU. `small` trên CPU nhanh hơn thời gian thực 4–6 lần.
- Dòng `system_info` có `AVX2 = 1`, `FMA = 1`, `F16C = 1`, `BMI2 = 1`, không có `AVX512` (khớp `.cargo/config.toml`). Log của lượt Vulkan có `backend=vulkan flash_attn=off decode_mode=shared`.
- Mốc "WER/CER gần với Mac, chênh không quá vài phần trăm tương đối" của kế hoạch: **đạt** (trừ en turbo, +6%).
- Bộ clip tiếng Trung có 19 clip bị bỏ chú thích Latin trong ngoặc ở bản chuẩn theo quy tắc của `score_asr.py` (chưa nghe lại, như đã ghi ở Mac).

### VAD đúng nhịp 32 ms (`pipeline --example vad_probe --paced`)

Clip `en.wav` 219 khung, ba lượt: trung bình 3,34 / 3,36 / 3,52 ms; p50 3,30 / 3,36 / 3,65 ms; p99 5,82 / 5,72 / 5,94 ms; lớn nhất 6,18 / 6,04 / 6,28 ms mỗi khung. **Đạt** (p99 dưới 8 ms, tức 25% chu kỳ 32 ms), nhưng biên không lớn: máy bận hơn có thể vượt.

### Dung lượng bộ cài (`sidecar_size.py --label windows-x64`)

Hai bản `asr-worker`, `llama-server.exe` và các DLL: **144,6 MB chưa nén; 18,8 MB nén LZMA; 48,0 MB nén zlib.** `ggml-vulkan.dll` chiếm 44,3 MB. (Con số gồm toàn bộ `ggml-cpu-*.dll` của llama.cpp, nên chưa phải bộ cài cuối; kế hoạch dự kiến phần llama-server riêng khoảng 13,7 MB nén.) Cộng app Tauri và WebView2 bootstrapper rồi so với mục tiêu 60 MB: chưa làm. Kết quả: `s3_size_windows-x64.json`.

## Chưa làm

- **Task 16: Windows không có Vulkan (máy ảo).** Chủ dự án báo đạt ngày 2026-10-07 (không kèm log). Ghi chú lúc chưa làm: Kết quả mong đợi: `asr-worker-vulkan.exe` không chạy được vì thiếu `vulkan-1.dll`, mã thoát `-1073741515` (0xC0000135); `asr-worker-cpu.exe` chạy bình thường. `.cargo/config.toml` đặt `/DEPENDENTLOADFLAG:0x800`, nên không thể giả lập bằng cách đặt DLL thiếu trong PATH trên máy này.
- **Task 17: `s3_lid.md`** (kết luận S3). Chưa viết; phần Windows ở trên là mảnh còn thiếu để viết.
- Chưa kiểm trên card rời (NVIDIA, AMD) nên chưa biết `--probe` có đúng với VRAM rời hay không.
