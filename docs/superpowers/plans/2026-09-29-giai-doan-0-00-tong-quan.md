# Giai đoạn 0 (spike S1–S7): kế hoạch tổng quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Kiểm chứng các giả định ở §14 của spec bằng code chạy thật, đo đủ số liệu để quyết định qua cổng Giai đoạn 0 (§13), rồi cập nhật spec trước khi làm MVP.

**Kiến trúc:** Mỗi spike là một phần nhỏ chạy độc lập, và phần lớn code dùng lại được ở MVP: `asr-protocol`, `asr-worker`, `audio-capture`, `pipeline`, cùng một app Tauri tối thiểu. Công cụ đo nằm ở `crates/latency-bench` (Rust) và `bench/phase0/` (Python). Kết quả nhỏ được commit vào `bench/phase0/results/`; dữ liệu lớn nằm ở `bench/phase0/data/`, không commit.

**Công nghệ:** Rust 1.98.1 (edition 2024); whisper-rs 0.16 (whisper.cpp 1.8.3, có vá); llama.cpp v0.5.0 (build b11146); candle-onnx 0.11 với Silero VAD v6.2.3; objc2-core-audio 0.3.2; windows 0.62.2; Tauri 2.12 và tauri-nspanel 2.1; React 19.3, Vite 8.3, TypeScript 7.0; Python 3.12 qua uv.

Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (đọc §6, §8, §13, §14 trước khi bắt đầu).

---

## Các kế hoạch con

| File | Spike | Chạy ở đâu | Cần có trước |
|---|---|---|---|
| `2026-09-29-giai-doan-0-01-nen-tang.md` | Nền tảng: công cụ, workspace, `asr-protocol`, tải model | Mac, sau đó Windows | — |
| `2026-09-29-giai-doan-0-02-s4-s7-dich.md` | S4, S7 phần dịch (A3) | Mac | 01 |
| `2026-09-29-giai-doan-0-03-s3-nhan-dang.md` | S3, S7 phần nhận dạng (A4) | Mac, sau đó Windows | 01 |
| `2026-09-29-giai-doan-0-04-s1-s2-thu-am.md` | S1 (macOS), S2 (Windows) | Mac, Windows | 01 |
| `2026-09-29-giai-doan-0-05-s5-thanh-phu-de.md` | S5 | Mac, Windows | 01 |
| `2026-09-29-giai-doan-0-06-s6-do-tre.md` | S6 | Mac và các máy tham chiếu | 02, 03 |

Thứ tự đề xuất:
1. 01 trên Mac.
2. 02, 03, 04 (S1), 05 trên Mac.
3. 06 trên Mac M4 Pro.
4. Phần Windows của 01, 03, 04 (S2), 05.
5. 06 trên các máy tham chiếu.
6. Phần cuối của file này: báo cáo và cập nhật spec.

## Chuẩn bị máy và tài khoản

- [ ] Máy phát triển: Mac Apple Silicon (hiện là M4 Pro, 24 GB RAM).
- [ ] Máy tham chiếu cho S6 (§13), mượn hoặc thuê đều được:
  - Mac M1 cơ bản, RAM 16 GB.
  - Một Mac chip cơ bản đời mới (M4 hoặc M5), RAM 16 GB.
  - Laptop Windows có card rời 6 GB (ví dụ RTX 4050 Laptop 6 GB).
  - Laptop Windows có card rời 4 GB (ví dụ RTX 3050 Laptop 4 GB hoặc GTX 1650).
  - Máy Windows 8 GB RAM, CPU 4 nhân có AVX2, không có card rời.
  - Một máy ảo Windows không có Vulkan (để thử `asr-worker-cpu`).
- [ ] Thiết bị: một tai nghe Bluetooth có micro (để thử chế độ đàm thoại HFP), một tai nghe có dây.
- [ ] Tài khoản để thử họp: Zoom, Microsoft Teams, Google (Meet trên Chrome, Edge, Safari), Zalo PC (A1); và một thiết bị thứ hai để gọi vào.
- [ ] Tài khoản Apple Developer (99 USD/năm), để ký Developer ID ở S1. Chưa có thì ký ad-hoc trước.

## Phiên bản đã chốt (kiểm ngày 2026-09-29, theo §6.12)

| Thành phần | Phiên bản | Ghi chú tương thích |
|---|---|---|
| Rust | 1.98.1 (`rust-toolchain.toml`) | edition 2024, resolver 3 (chọn crate theo MSRV) |
| Node.js | 24.21.0 LTS | Vite 8.3 cần Node ^20.19 hoặc ≥ 22.12 |
| pnpm | 12.6.0 | ghi trong `packageManager` |
| tauri / tauri-build / @tauri-apps/cli / @tauri-apps/api | 2.12.0 / 2.7.0 / 2.12.0 / 2.12.0 | cùng dòng 2.x |
| tauri-plugin-global-shortcut | 2.4.0 | cùng dòng với Tauri 2 |
| tauri-nspanel | 2.1.0 | cần tauri ≥ 2.8.5, feature `macos-private-api` |
| React, react-dom, @types/react(-dom) | 19.3.0 | |
| Vite / @vitejs/plugin-react | 8.3.1 / 6.1.1 | plugin chỉ bắt buộc peer `vite ^8`; ba peer còn lại là tùy chọn |
| TypeScript | 7.0.2 | chỉ kiểm tra kiểu thư mục `src/` (file cấu hình Vite cần `@types/node`) |
| whisper-rs / whisper-rs-sys | 0.16.0 / 0.15.0 (whisper.cpp 1.8.3) | có vá, xem `third_party/README.md`; whisper.cpp mới nhất là 1.9.4 nhưng whisper-rs chưa theo kịp |
| llama.cpp | v0.5.0 = build b11146 | các build `bXXXX` hằng ngày chỉ là prerelease |
| Silero VAD | v6.2.3 (`silero_vad.onnx`) | bản `op18_ifless` không chạy được trên candle |
| candle-core / candle-onnx | 0.11.0 | cần `protoc` lúc build; `ort` chỉ có bản 2.0.0-rc.13 nên không dùng |
| objc2 / objc2-core-audio (và các crate objc2-*) / block2 | 0.6.4 / 0.3.2 / 0.6.2 | |
| windows | 0.62.2 | |
| ash | 0.38.0 | chỉ dùng cho `asr-worker-vulkan --probe` |
| rubato / rtrb / hound | 5.0.0 / 0.4.0 / 3.5.1 | |
| serde / serde_json / postcard | 1.0.229 / 1.0.151 / 1.1.3 | |
| reqwest | 0.13.5 | tắt feature mặc định: chỉ gọi `http://127.0.0.1`, không cần TLS |
| sysinfo / clap / anyhow / thiserror | 0.39.6 / 4.6.7 / 1.0.104 / 2.0.21 | |
| protoc | 36.2 | build `candle-onnx` |
| Python (bench) | 3.12 qua uv | numpy 2.5.3, scipy 1.18.1, jiwer 4.0.0, onnxruntime 1.30.0 |
| transformers + jinja2 (S4) | 5.17.0 + 3.1.6 | model card Hy-MT2 yêu cầu transformers ≥ 5.6 |
| unbabel-comet (S7) | 2.2.7 | bản mới nhất nhưng bắt buộc numpy < 2 và transformers < 5, nên dùng môi trường riêng |

Không có hai bản ggml trong cùng một tiến trình: whisper.cpp nằm trong `asr-worker`, llama.cpp nằm trong `llama-server`, tiến trình chính không link ggml.

## Kết quả đã chạy thử lúc lập kế hoạch (Mac M4 Pro, 2026-09-29)

Toàn bộ code trong các kế hoạch con đã được biên dịch và chạy thử. Một phần đã được xác nhận ngay trên máy phát triển. Đây là bằng chứng sơ bộ; kế hoạch con vẫn phải chạy lại và commit kết quả vào `bench/phase0/results/`.

- **Biên dịch:**
  - Mọi crate đều biên dịch được trên macOS và qua hết test.
  - `audio-capture` qua kiểm tra kiểu cho target `x86_64-pc-windows-msvc`.
  - Nhánh code Windows của app Tauri biên dịch được ở mức API.
- **S4:** trên cả Q8_0 và Q4_K_M, token prompt do `llama-server` b11146 dựng từ template trong GGUF trùng từng token với tokenizer Hugging Face. Reviewer còn kiểm thêm 452 prompt của bộ test. Bản dịch stream qua `/v1/chat/completions` giống hệt `/completion` nạp token của Hugging Face. Kết luận chỉ áp cho macOS arm64 và cho lệnh chạy hiện tại (không `--jinja`, không `--chat-template`). Nếu đổi cờ, hoặc khi bắt đầu phần Windows, thì chạy lại S4.
- **VAD:**
  - Silero v6.2.3 chạy bằng candle-onnx khớp onnxruntime, sai khác lớn nhất 5,4e-7 (sai số làm tròn f32).
  - Đo đúng nhịp 32 ms, mỗi khung mất trung bình 1,17 ms, p99 1,8 ms (chạy liên tục chỉ 0,23 ms).
  - Review phát hiện state của LSTM phải `detach()`. Nếu không, RSS tăng khoảng 1 GB mỗi phút và tràn stack sau vài phút; đã sửa, và test chạy dài giữ cho lỗi không quay lại.
- **Flash attention trong whisper.cpp:**
  - whisper.cpp 1.8.3 (và cả v1.9.4, master) sai khi bật flash attention cùng `audio_ctx` rút ngắn: phần đệm tới bội 256 không có mask. Kết quả lặp câu và thay đổi theo đoạn chép trước. Review 03-T4 đã tái hiện.
  - Giai đoạn 0 tắt flash attention.
  - Bản vá mask (ggml-org/whisper.cpp#3941, chưa merge) cho kết quả trùng hệt bản tắt flash. Trên M4 Pro, bản vá giúp chép lời nhanh hơn 5–13% và giảm 91–149 MB bộ nhớ đệm mỗi state. Để lại cho MVP.
- **Toàn chuỗi (gói Nhẹ, chế độ B):**
  - 6 câu Anh/Trung/Nhật: p50 705 ms, p90 760 ms, chữ đầu tiên 528 ms.
  - Session tiếng Hàn 50 giây: p50 khoảng 670 ms, p90 khoảng 830 ms, chữ đầu tiên khoảng 490 ms.
- **RAM trên macOS:**
  - RSS của `llama-server` có tính file model được mmap (1,3 GB với Q4_K_M), còn `phys_footprint` thì không (0,36 GB).
  - Với `asr-worker` thì ngược lại: `phys_footprint` lớn hơn RSS vì có bộ nhớ Metal.
  - Kế hoạch 06 ghi cả hai và lấy số lớn hơn.
- **Nhận diện ngôn ngữ trên 68 clip FLEURS tiếng Hàn (whisper small):**
  - Cách chạy `whisper_full` và nhận diện trên 3 giây đầu (chế độ A):
    - chỉ nhận đúng ngôn ngữ 87%, CER 0,578;
    - clip dài trên 20 giây bị lặp chữ;
    - chi phí nhận diện bằng 12% thời gian chép lời.
  - Cách dùng chung một lượt encode (chế độ B): nhận đúng ngôn ngữ 100%, CER 0,141, chi phí nhận diện chỉ 1%.
  - Kế hoạch 03 lấy chế độ B làm mặc định.
- **`no_speech_prob`:** với tham số của app, `whisper_full` trả 0 cho mọi đoạn, nên bộ lọc ở §6.4 không có tác dụng. Chế độ B tính được giá trị thật từ logits sau token SOT.
- **A3 sơ bộ (Q4_K_M, đủ 620 câu, lượt không có ngữ cảnh):**
  - COMET Anh→Việt 0,841, trên mức sàn 0,80 của gói Nhẹ.
  - Trung, Nhật, Hàn→Việt lần lượt 0,831, 0,815, 0,822. Không chiều nào thấp hơn Anh→Việt quá 0,05.
  - Việt→Anh, Trung, Nhật, Hàn lần lượt 0,822, 0,821, 0,845, 0,842.
  - Q8_0 chưa được chấm.
- **Tỉ lệ token:**
  - Bản dịch hợp lệ dài tới 3,3 lần câu gốc tính theo token, ở chiều Trung→Việt và Anh→Việt, vì câu tiếng Việt tốn nhiều token.
  - Việt→Anh chỉ tới 1,25 lần.
  - Vì vậy cần ngưỡng riêng cho từng cặp ngôn ngữ (§6.5). Ngưỡng đề xuất: Anh→Việt 4,2, Trung→Việt 4,2, Việt→Anh 1,6.
- **Cờ ngữ cảnh:** khi câu gốc ngắn, model đôi khi dịch luôn cả câu ngữ cảnh. Ví dụ "tôi cũng thấy vậy" ra một đoạn dài gấp 9,6 lần. Kế hoạch 02 đếm những trường hợp này.
- **COMET:** `unbabel-comet` 2.2.7 cần `setuptools<82`, vì torchmetrics 0.10.3 còn import `pkg_resources`.
- **Truyền qua pipe:** mỗi đoạn tốn thêm 1,2 ms ở trung vị, tối đa 1,8 ms, ngoài phần chạy whisper. Giả định 10 cho phép 10 ms.
- **Dung lượng bộ cài (phần tiến trình phụ):**
  - macOS: 27,5 MB chưa nén, khoảng 11 MB sau khi nén.
  - Windows: riêng `llama-server` và các DLL là 86 MB chưa nén, 13,7 MB sau khi nén LZMA; chưa đo `asr-worker`.
  - Mục tiêu cả bộ cài là 60 MB.
- **`llama-server` chính thức trên macOS link động** (`libllama*.dylib`, `libggml*.dylib` nằm cùng thư mục), khác với điều §6.12 ghi là build tĩnh. Phase 0 vẫn dùng bản chính thức; việc tự build tĩnh để lại cho MVP.
- **CPU baseline:** bản build native trên M4 Pro bật `MATMUL_INT8` và `SME`, nên có thể crash trên M1. `.cargo/config.toml` khóa mức Apple M1, và `system_info` chỉ còn `NEON`, `ARM_FMA`, `FP16_VA`, `DOTPROD`.

## Cổng qua Giai đoạn 0 (§13)

| Điều kiện | Lấy số liệu ở | Kế hoạch |
|---|---|---|
| S1–S5 chạy được | `results/s1_capture.md`, `s2_capture.md`, `s3_lid.md`, `s3_windows.md`, `s4_template_*.json`, `s5_overlay.md` | 03, 04, 05, 02 |
| p50 ≤ 2,0 giây trên máy khuyến nghị (kể cả M1 cơ bản 16 GB) | `results/latency/*.json`, `results/s6_latency.md` | 06 |
| p50 ≤ 3,5 giây trên máy tối thiểu | như trên | 06 |
| COMET Anh→Việt: Q8_0 ≥ 0,83, Q4_K_M ≥ 0,80 | `results/s7_mt.md`, `s7_mt_decisions.md` | 02 |

Nếu M1 cơ bản không đạt thì chọn một trong hai phương án ở §8. Nếu cả máy mạnh hơn cũng không đạt thì quay lại sửa spec.

---

## Task 1: Viết báo cáo Giai đoạn 0

**Files:**
- Create: `bench/phase0/REPORT.md`

- [ ] **Step 1: Tạo báo cáo theo mẫu, điền số liệu từ `bench/phase0/results/`**

```markdown
# Báo cáo Giai đoạn 0 (spike S1–S7)

Ngày: <YYYY-MM-DD>. Spec: docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md

## Kết luận

- Qua cổng Giai đoạn 0: <CÓ / KHÔNG>. Lý do: <một câu>.
- Quyết định cần ghi vào spec: <danh sách ngắn>.

## Giả định ở §14

| # | Giả định | Kết quả | Bằng chứng |
|---|---|---|---|
| 1 | Core Audio tap thu được Zoom, Meet, Teams; quyền hoạt động với app đã ký, không sandbox | <đạt/không> | results/s1_capture.md |
| 2 | Endpoint loopback thu được Teams, kể cả thiết bị Communications | | results/s2_capture.md |
| 3 | Chat template trong GGUF dùng được với /v1/chat/completions | | results/s4_template_*.json |
| 4 | Whisper turbo kịp thời gian thực trên M1 16 GB và card rời 6 GB | | results/s6_latency.md |
| 5 | Độ trễ đạt ngân sách §8 | | results/s6_latency.md |
| 6 | Q4_K_M giảm COMET ≤ 0,02 so với Q8_0 | | results/s7_mt_decisions.md |
| 7 | PayOS (không thuộc spike kỹ thuật) | <chưa kiểm/đã kiểm> | |
| 8 | Rút ngắn audio_ctx làm WER tăng ≤ 10% | | results/s7_asr.md |
| 9 | Chi phí nhận diện ngôn ngữ < 20% thời gian nhận dạng | | results/s3_lid.md |
| 10 | Truyền âm thanh qua stdin/stdout thêm ≤ 10 ms mỗi đoạn | | results/s3_lid.md |

## Độ trễ và tài nguyên (S6)

<dán bảng từ `python3 bench/phase0/latency/summarize.py bench/phase0/results/latency/*.json`>

## Chất lượng (S7)

<tóm tắt results/s7_mt_decisions.md và results/s7_asr.md>

## Việc phát sinh

<lỗi, rủi ro mới, việc cần làm ở Giai đoạn 1>
```

- [ ] **Step 2: Commit**

```bash
git add bench/phase0/REPORT.md
git commit -m "docs(bench): báo cáo Giai đoạn 0"
```

## Task 2: Cập nhật spec theo kết quả

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: Sửa các mục đã biết là phải đổi**

Mỗi mục là một thay đổi riêng trong spec:
- §6.3:
  - Chạy Silero v6.2.3 bằng candle-onnx trong tiến trình chính. `ort` chỉ có bản RC (§6.12).
  - State của LSTM phải `detach()` sau mỗi khung.
  - Bản debug cần khoảng 1 MiB stack cho mỗi lần suy luận, nên VAD chạy trên luồng riêng có stack từ 4 MiB.
- §6.4:
  - Chế độ dùng chung một lượt encode là mặc định; ghi rõ bản vá trong `third_party/`. `no_speech_prob` tính từ logits sau SOT.
  - Viết lại danh sách thông điệp cho khớp `asr-protocol`:
    - `load {model_path, use_gpu, n_threads}` → `ready {backend, decode_mode, whisper_version, system_info}`;
    - `transcribe` → `result {…, lid_ms, asr_ms}`, thay cho `timings`;
    - `warmup` → `warmup_done {millis}`;
    - mọi lỗi → `error {segment_id?, message}`.
  - Quy tắc mở rộng giao thức: chỉ thêm biến thể ở cuối; khung thừa byte là lỗi.
  - Flash attention tắt cho tới khi whisper.cpp có mask cho phần đệm (ggml-org/whisper.cpp#3941).
    - MVP: vá, hoặc chờ upstream.
    - Bật lại thì phải kèm test tất định: cùng một đoạn, chép sau các đoạn khác, phải ra cùng token.
  - Quy tắc "dưới 0,5 thì giữ ngôn ngữ trước" không bao giờ chạy khi chỉ có 2 ngôn ngữ, vì xác suất sau chuẩn hóa của ngôn ngữ cao nhất luôn từ 0,5 trở lên. Chọn ngưỡng theo số ngôn ngữ, dựa trên số đo A4.
  - Worker từ chối đoạn dưới 100 ms; pipeline không gửi các đoạn này.
  - MVP: đưa `prev_lang` vào `TranscribeRequest`, để worker không giữ trạng thái nhận diện ngôn ngữ. Kết quả khi đó không phụ thuộc thứ tự đoạn, và app không mất ngôn ngữ trước khi worker khởi động lại.
  - Công thức `audio_ctx` chốt theo Task 11 của kế hoạch 03. Review thấy turbo lặp câu ở các đoạn dài 1,7–4,4 giây, ngay cả khi tắt flash attention; từ 5,7 giây trở lên thì ổn, khoảng giữa chưa đo.
- §6.5:
  - Ngưỡng tỉ lệ token theo từng cặp ngôn ngữ, lấy từ `results/s7_mt_decisions.md`. Quyết định cờ ngữ cảnh.
  - Truyền API key cho `llama-server` qua biến môi trường `LLAMA_API_KEY` thay vì `--api-key`, vì tham số dòng lệnh hiện ra trong `ps` (b11146 hỗ trợ cả hai).
  - Đổi `--no-webui` thành `--no-ui` trong lệnh chạy: b11146 đánh dấu tên cũ là deprecated.
  - Phương án dự phòng "render bằng `minijinja` rồi gọi `/completion`" phải truyền mảng token, hoặc bỏ BOS ở đầu chuỗi. Nếu GGUF có `add_bos_token=true` thì sẽ ra BOS kép (reviewer S4 đã tái hiện). `/v1/chat/completions` không bị lỗi này.
  - Lần đầu chạy một binary mới (sau khi cài hoặc cập nhật), macOS mất khoảng 15 giây kiểm tra trước khi `llama-server` chạy. Thời gian chờ `/health` lúc khởi động phải từ 30 giây trở lên, không tính vào bộ đếm lỗi "quá 5 lần trong 10 phút", và giao diện báo "đang chuẩn bị lần đầu". Áp dụng cho cả `asr-worker`. Đo lại với bản đã ký và notarize ở MVP.
- §6.11: dung lượng bộ cài đo ở `results/s3_lid.md`.
- §6.12:
  - Khóa llama.cpp v0.5.0 (b11146).
  - Yêu cầu build: `protoc`, libclang (LLVM trên Windows), Vulkan SDK. Mức CPU cố định đặt ở `.cargo/config.toml`.
  - `llama-server` chính thức trên macOS link động: MVP chọn giữa tự build tĩnh và kèm các file `.dylib`.
  - Nếu Task 14 của kế hoạch 03 thấy phụ thuộc `VCRUNTIME140.dll` thì ghi cách xử lý: link tĩnh CRT, hoặc kèm VC++ Redistributable.
  - `cargo deny` dùng `deny.toml` ở gốc repo, kèm danh sách giấy phép được phép.
  - Nâng candle-core hoặc candle-onnx thì chạy `vad_reference` với `--include-ignored`. Test này mặc định bị bỏ qua vì cần model.
- §12: thêm `crates/{asr-protocol,asr-worker,audio-capture,pipeline,latency-bench}`, `third_party/` và `deny.toml`.
- Việc cho MVP, rút ra từ review code Giai đoạn 0:
  - `asr-protocol`: `backend` và `decode_mode` thành enum. `error` có thêm `kind` (NotLoaded, ModelLoad, OutOfMemory, GpuInit, InvalidRequest, Internal) để bảng lỗi §9 phân biệt được. `ready` có `protocol_version`, để app từ chối worker lệch phiên bản.
  - `asr-worker` giữ riêng stdout cho giao thức: chuyển fd 1 sang stderr, để log lạ của thư viện không lọt vào kênh giao thức.
  - App chính build với `panic = "abort"` nên `Drop` không chạy khi crash. Dùng Job Object (`KILL_ON_JOB_CLOSE`) trên Windows và process group trên macOS, để tiến trình phụ không bị bỏ lại.
  - Trước khi tạo `server/`: thêm vào `.gitignore` các mẫu `.dev.vars*`, `.env*`, `*.pem`, `*.p12`, `*.pfx`, `*.key` (§10.2).
- A3, A4: ghi mốc đo được.
- §8, §6.7: hạng máy khuyến nghị và ngưỡng VRAM theo S6.

- [ ] **Step 2: Kiểm tra tham chiếu chéo còn đúng**

Run: `grep -oE '§[0-9]+(\.[0-9]+)?' docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | sort -u`
Expected: mọi mục được nhắc tới đều có trong spec.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git commit -m "docs(spec): cập nhật theo kết quả Giai đoạn 0"
```

## Task 3: Xin duyệt

- [ ] **Step 1: Gửi PHONG báo cáo và các thay đổi spec**, nêu rõ quyết định cần duyệt: có qua cổng không; nếu M1 cơ bản không đạt thì chọn phương án nào ở §8; ngưỡng VRAM.
- [ ] **Step 2: Sau khi được duyệt, lập kế hoạch Giai đoạn 1 (MVP).**
