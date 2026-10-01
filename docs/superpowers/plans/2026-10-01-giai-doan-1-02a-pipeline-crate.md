# Giai đoạn 1 · 02a: Pipeline trong app — giao thức, luật, client và giám sát

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần đầu của kế hoạch 02 (mục 2.2 của kế hoạch 00): giao thức của `asr-worker`, luật của pipeline, hai client tiến trình phụ, dịch một câu, và giám sát tiến trình phụ. Cụ thể:
- giao thức `asr-worker` bản 2 theo "Việc cho MVP" của §6.4: `protocol_version`, `prev_lang`, enum `backend`/`decode_mode`, `Error.kind`, stdout chỉ cho giao thức, bản vá `set_audio_ctx` trả lỗi;
- luật cắt câu, ghép câu, bỏ đoạn, lọc câu ảo giác quen thuộc, đổi phồn thể sang giản thể nằm trong `pipeline`, và `latency-bench` gọi lại đúng code đó (Đ3), nên S6 không đổi;
- mọi ngưỡng gom trong `pipeline::config::PipelineConfig`, mặc định là số đã chốt; kế hoạch 04 nạp từ manifest đã ký;
- client `asr-worker` và `llama-server` bản 2: `LLAMA_API_KEY` qua biến môi trường, log xoay vòng, process group và Job Object;
- dịch theo §6.5: hậu xử lý trong lúc stream, ngưỡng tỉ lệ token, thử lại một lần; tiến trình phụ giả cho test;
- vòng đời và giám sát hai tiến trình phụ (Đ2): thứ tự chạy, kiểm sức khỏe, khởi động lại và gửi lại đoạn, chuyển sang CPU, tắt sau 10 phút rảnh.

**Kiến trúc:**
- Không có code Tauri trong 02a và 02b. `pipeline` chạy và test được không cần app: app nối vào qua hai trait `FrameSource` (âm thanh vào) và `EventSink` (phụ đề ra), và qua `SidecarManager`.
- Luồng xử lý (§7) là các luồng hệ điều hành với client đồng bộ, không dùng runtime tokio (QĐ1).
- Mọi thời gian chờ của phần giám sát đi qua trait `Clock`, nên test vòng đời chạy với đồng hồ giả, không chờ thật. Tiến trình phụ giả là hai binary nhỏ trong chính `pipeline`.

**Công nghệ:** Giữ nguyên Rust 1.98.1, whisper-rs 0.16 với whisper.cpp 1.8.3 đã vá, llama.cpp b11146, candle-onnx 0.11, `windows` 0.62.2. Thêm `ferrous-opencc`, `log`, `libc` (bảng "Phiên bản đã chốt").

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.2, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`.

Kế hoạch 02 có khoảng 18 000 dòng nên chia ba file, làm theo thứ tự:
1. **02a** (file này): giao thức, luật, client, dịch, giám sát.
2. **02b** `docs/superpowers/plans/2026-10-01-giai-doan-1-02b-pipeline-engine.md`: phụ đề và hàng đợi, engine của một phiên, test từ file WAV, `latency-bench mt-eval`, `audio-capture` cho app, đo và chạy lại A3, A4, S6.
3. **02c** `docs/superpowers/plans/2026-10-01-giai-doan-1-02c-pipeline-app.md`: nối vào app (phiên dịch, tiến trình phụ, nguồn âm thanh, giao diện), thử tay, đợt Windows, cập nhật kế hoạch 00.

Cả ba làm sau khi 01 xong hẳn, vì cùng sửa `Cargo.lock`. Bảng phiên bản, bảng dòng của bảng đối chiếu, quyết định (QĐ) và điểm cần chủ dự án quyết nằm ở file này, dùng chung cho cả ba.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-01, theo §6.12)

Kiểm bằng `cargo search`, `cargo info <crate>` và API của crates.io (ngày phát hành, MSRV, giấy phép, có bị yanked không). Bảng này chung cho 02a, 02b và 02c.

| Thành phần | Phiên bản | Dùng ở | Ghi chú tương thích |
|---|---|---|---|
| ferrous-opencc | 0.4.0 (`default-features = false`, feature `t2s-conversion`) | `pipeline` | Bản mới nhất (2026-04-18), không bị yanked; Apache-2.0; thuần Rust, chỉ kéo bảng đổi phồn thể sang giản thể (`fst`, `rkyv`), không thư viện C. Không ghi MSRV; build được với 1.98.1 |
| log | 0.4.34 | `pipeline` | Cùng bản app dùng từ 01 |
| thiserror | 2.0.21 (workspace) | `pipeline` | Đã có trong workspace |
| libc | 0.2.189 | `asr-worker`, `pipeline` (Unix) | Bản ổn định mới nhất của dòng 0.2 (2026-07-21); 1.0.0-alpha.4 là alpha nên không dùng; MSRV 1.65 |
| whisper-rs-sys | 0.15.0 (bản đã vá ở `third_party/`, qua `[patch.crates-io]`) | `asr-worker` (phụ thuộc trực tiếp) | Chỉ để đọc bảng thiết bị ggml (`backend.rs`); `deny.toml` cho thêm `asr-worker` làm wrapper. Vẫn chỉ có một bản ggml trong `asr-worker`, không có trong tiến trình chính |
| windows | 0.62.2 | `pipeline` (Windows: `Win32_Foundation`, `Win32_Security`, `Win32_System_JobObjects`, `Win32_System_Threading`); `audio-capture` thêm `Win32_Devices_FunctionDiscovery`, `Win32_UI_Shell_PropertiesSystem`; app thêm `Win32_System_LibraryLoader` (02c) | Cùng bản Tauri, 01 và `audio-capture` đang dùng |
| sha2 | 0.11.0 | app (build-dependency và dependency, 02c) | Bản ổn định mới nhất (2026-03-25), MSRV 1.85, MIT OR Apache-2.0. `Cargo.lock` còn sha2 0.10.9 do `tauri-codegen` và `wry` kéo vào từ trước; hai bản Rust thuần không xung đột |
| rtrb | 0.4.0 (workspace) | app (02c) | Đã có trong `audio-capture`; app cần kiểu `Producer`/`Consumer` để mở nguồn |
| hound | 3.5.1 (workspace) | `pipeline` (dev-dependency) | Đã có; test đọc file WAV |

Ghi chú:
- Không thêm gói npm nào ở kế hoạch 02.
- Không crate mới nào kéo ggml hay thư viện C vào tiến trình chính. Riêng `candle-core` 0.11 (có từ Giai đoạn 0) luôn kéo `tokenizers` với feature `onig`, tức thư viện C oniguruma nằm trong tiến trình chính. Điều này có từ trước kế hoạch này, nhưng lần đầu lộ ra khi kiểm code Windows trên Mac (QĐ15); ghi ở điểm cần chủ dự án quyết.
- `cargo deny check` sạch sau mỗi task thêm crate; `cargo audit` còn 3 cảnh báo cũ đã được cho phép (`paste`, `proc-macro-error`, `glib`).

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, sau khi 01 đã xong hẳn (Task 26 của 01 đã commit). Trước mỗi task, `git status` phải sạch.
- **Khối code.**
  - "Tạo `<file>`": chép nguyên khối vào file mới.
  - "Thay toàn bộ `<file>` bằng": ghi đè cả file.
  - "Sửa `<file>` (áp bằng `git apply`)": khối `diff` là bản vá chuẩn; lưu khối vào một file tạm rồi chạy `git apply <file tạm>` từ gốc repo. `git apply --check` báo lỗi nghĩa là cây file đã lệch so với kế hoạch: dừng lại, đừng sửa tay cho khớp.
  - "Tạo `<file>`, lúc này mới có phần test": file chỉ có các dòng `//!` đầu và khối `#[cfg(test)] mod tests`; bước sau thêm phần code vào giữa hai phần đó.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task trên một worktree sạch, với target riêng còn trống (2026-10-01). Đường dẫn đã đổi về gốc repo. Thời gian chạy (`finished in …`) và id luồng sẽ khác; số test và tên lỗi phải giống.
- **Đường dẫn trong lệnh.** Model và `llama-server` của Giai đoạn 0 nằm ở `models/` và `tools/` (có sẵn trên máy dev, bị `.gitignore` bỏ qua; xem `bench/phase0/fetch.py`). Lệnh `cargo test` chạy test với thư mục làm việc là thư mục của crate, nên biến môi trường trỏ tới model dùng đường dẫn tuyệt đối (`$PWD/models/…`, chạy từ gốc repo).
- **Không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00): không task nào trong file này chạy tap thu âm thật hay mở System Settings. Test `#[ignore]` của `audio-capture` chỉ đọc thuộc tính của Core Audio HAL, không cần quyền.
- **Task cần máy rảnh** (mục 6.9): Task 7–9 của 02b chạy lại A3, A4, S6, lâu và nặng, S6 đo thời gian. Agent dừng ở đó, nhờ người đóng app nặng và cắm sạc, chờ xác nhận rồi mới chạy.
- **Task cần người hoặc Windows:** ghi ở đầu task.

## Dòng của bảng đối chiếu giao cho kế hoạch 02

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00 (140 dòng có `02`). Cột "Task" ghi task theo file: `a<số>` là 02a, `b<số>` là 02b, `c<số>` là 02c; dòng nào còn phần chờ thì ghi mã chờ.

| # | Yêu cầu (rút gọn) | Phần của 02 | Task |
|---|---|---|---|
| 1 | D1: phụ đề dịch cho mọi âm thanh máy đang phát; không cần bot, plugin hay tài khoản trên nền… | thu toàn hệ thống trên cả hai hệ điều hành, nối vào phiên | b5, c2, c3; A1 ở 08 |
| 4 | D4: Tauri 2, React 19, TypeScript, Vite, Zustand; mỗi engine chạy trong một tiến trình phụ… | mỗi engine một tiến trình phụ, có giám sát | a4, a6 |
| 6 | D6: Whisper chạy qua whisper.cpp | `asr-worker` giao thức bản 2 | a1 |
| 7 | D7: xử lý 100% trên máy, âm thanh không rời máy | tiến trình phụ chỉ nghe `127.0.0.1` hoặc stdin/stdout; âm thanh chỉ trong RAM | a4, c2 |
| 9 | D9: MVP chỉ dịch một chiều, âm thanh máy đang phát sang phụ đề ngôn ngữ của người dùng | chỉ có đường âm thanh vào; không phát tiếng ra | b2 |
| 12 | D12: độ trễ p50 ≤ 2,0 giây trên máy khuyến nghị | chạy lại S6 sau thay đổi (đo ở máy tham chiếu là của 08) | b9 |
| 15 | F1: phụ đề dịch trực tiếp từ âm thanh hệ thống | luồng xử lý từ âm thanh tới phụ đề | b2, c3 |
| 16 | F2: chọn ngôn ngữ đích trong năm ngôn ngữ; ngôn ngữ nguồn tự nhận diện trong tập người dùng… | tập ngôn ngữ, khóa ngôn ngữ, `same_lang` | b2, c3 |
| 25 | A1: chạy với Teams, Zoom, Google Meet (Chrome, Edge; thêm Safari trên Mac), Zalo PC trên cả… | chạy thử với âm thanh thật trên Mac; Windows ở đợt Windows | c8 (người), c9 (Win); chờ C1, C2, C5 |
| 26 | A2: máy khuyến nghị p50 ≤ 2,0 giây, p90 ≤ 3,0 giây, chữ dịch đầu tiên ≤ 1,0 giây (p50); máy… | S6 chạy lại không thụt lùi | b9; máy quyết định chờ C6 |
| 27 | A3, mốc và mức sàn: COMET chấm trên văn bản qua đúng `llama-server` và prompt của app; sàn… | `mt-eval` dịch bằng code của app; chạy lại A3 | b4, b7 |
| 32 | A5: một phiên dịch liên tục 2 giờ không crash; RAM sau giờ đầu không tăng quá 10% | phiên dài thử tay trên Mac (tùy chọn), số đo RAM | c8 (người); 08 |
| 38 | Bước 4: trên macOS hướng dẫn bật quyền "Ghi âm thanh hệ thống", kèm nút mở System Settings… | bước quyền ở lần đầu mở app, nút mở System Settings; lỗi thiếu quyền | c4, c6, c8 (người) |
| 40 | Bước 6: nghe thử, app phát một câu tiếng Anh mẫu; trên macOS tap tạm thời thu cả âm thanh của… | tap tạm thời thu cả âm thanh của app (Đ16) | b5, c3; bước nghe thử ở 03 |
| 43 | Bắt đầu qua nút, phím tắt hoặc menu khay; thanh phụ đề hiện kèm chỉ báo đang nghe (mức âm… | Bắt đầu chạy phiên thật; mức âm lượng, trễ, "Đang nạp model…" qua sự kiện | c3, c5 |
| 45 | Bấm Dừng để kết thúc phiên, sau đó mở được bản chép lời của phiên | Dừng: chốt đoạn dở, xử lý nốt, thanh phụ đề giữ nguyên | b2, c3 |
| 46 | Màn hình chính: trạng thái (Sẵn sàng, Đang dịch, Lỗi); nút Bắt đầu/Dừng; ngôn ngữ đích và tập… | màn hình chính: trạng thái, lỗi, nguồn âm thanh, mức âm lượng | c6; số phút ở 06 |
| 52 | Cài đặt, nhóm Âm thanh: nguồn âm thanh, độ nhạy ngắt câu | Cài đặt › Âm thanh: nguồn âm thanh, độ nhạy ngắt câu | c6 |
| 61 | Thoát ở menu khay: dừng phiên như khi bấm Dừng, tắt hai tiến trình phụ, rồi mới thoát | Thoát: dừng phiên, tắt hai tiến trình phụ | c3 |
| 66 | Bản dịch hiện dần từng chữ trong lúc model đang dịch | `subtitle://delta` trong lúc dịch | b2, c3, c5 |
| 67 | Phụ đề tạm: câu chưa chốt màu nhạt hơn; người nói nói tiếp thì thay bằng bản dịch của cả câu… | phụ đề tạm và thay bằng bản dịch câu đã ghép | a2, b2 |
| 73 | Chỉ báo nhỏ: đang nghe, không có âm thanh, đang trễ | chỉ báo không có âm thanh, đang trễ, dịch không dùng được | b2, c3 |
| 78 | Engine hoặc driver GPU crash thì app vẫn chạy và tự khởi động lại engine | engine crash thì tự khởi động lại, app vẫn chạy | a6 |
| 79 | Tiến trình phụ chạy khi người dùng mở cửa sổ chính hoặc bấm Bắt đầu; tắt sau 10 phút không dịch | chạy tiến trình phụ khi mở cửa sổ chính hay bắt đầu; tắt sau 10 phút rảnh | a6, c3 |
| 80 | `asr-worker` chạy trước; `llama-server` chạy sau khi `asr-worker` nạp xong model | `asr-worker` trước, `llama-server` sau | a6 |
| 81 | Lần đầu phải chờ nạp model: thanh phụ đề hiện "Đang nạp model…"; thời gian này không tính vào… | trạng thái nạp model | a6, c3 |
| 82 | Việc cho MVP §5: Job Object (`KILL_ON_JOB_CLOSE`) trên Windows và process group trên macOS, để… | process group và hook panic (macOS), Job Object (Windows) | a4, c3; c9 (Win) |
| 84 | Interface chung `AudioSource` (`start`, `stop`, `format`) | `AudioSource` thêm `failed()` | b5 |
| 85 | Windows, chế độ tự động: loopback của thiết bị Console và thiết bị Communications (nếu khác)… | chế độ tự động Console và Communications trong app | b5, c2; c9 (Win), chờ C2 |
| 86 | Windows: luồng thu đọc theo timer, tự chèn im lặng theo vị trí QPC khi loopback không trả gói… | chèn im lặng (có từ GĐ0); app chèn thêm theo đồng hồ thật khi nguồn chưa chạy | b5, c2; c9 (Win), chờ C2 |
| 87 | Windows: người dùng chọn thủ công được một thiết bị | chọn tay một thiết bị: liệt kê thiết bị, mở theo id | b5, c4, c6; c9 (Win) |
| 88 | Windows: lắng nghe `IMMNotificationClient` để tự khởi tạo lại khi thiết bị thay đổi | khởi tạo lại khi thiết bị đổi (hỏi định kỳ, QĐ16) | b5, c2; c9 (Win) |
| 89 | Windows: không dùng process loopback trong MVP; hệ quả là app thu mọi âm thanh của máy | không dùng process loopback | b5 |
| 90 | macOS: Core Audio process tap đọc qua aggregate device; mặc định tap toàn hệ thống, trừ chính… | tap toàn hệ thống trừ chính app, trong app | c2; chờ C1 |
| 91 | macOS, tùy chọn: chỉ tap một app họp, chọn từ danh sách app đang phát âm thanh | danh sách app đang phát tiếng, tap một app | b5, c2, c4, c6 |
| 92 | macOS: khai báo `NSAudioCaptureUsageDescription` trong Info.plist của app | `NSAudioCaptureUsageDescription` | c4; câu tiếng Anh ở 07 |
| 93 | macOS: gọi API qua objc2 | objc2 (có từ GĐ0) | b5 |
| 94 | Callback thu âm không cấp phát bộ nhớ, không lock, chỉ ghi vào ring buffer lock-free (`rtrb`)… | ring buffer 30 giây trong app | b5, c2 |
| 95 | Gộp về mono, resample bằng `rubato` từ tần số thiết bị xuống 16 kHz, chia khung 512 mẫu (32… | mono, resample, khung 512 mẫu (có từ GĐ0) trong luồng tiền xử lý | b5, b2 |
| 96 | Silero VAD: ngưỡng 0,5; tiếng nói ngắn nhất 250 ms; im lặng 300 ms thì chốt đoạn, chỉnh được… | ngưỡng của segmenter vào `PipelineConfig`; độ nhạy ngắt câu từ cài đặt | a2, c3 |
| 97 | Ghép câu và phụ đề tạm: không có dấu câu kết thúc thì phụ đề là tạm; cửa sổ ghép max(700 ms… | ghép câu và phụ đề tạm chuyển vào `pipeline` | a2 |
| 98 | Đầu ra `Segment { id, start_ms, end_ms, samples }`, thời gian tính từ lúc bắt đầu phiên theo… | thời gian từ đầu phiên theo đồng hồ thật | b2, c2 |
| 99 | Silero VAD v6.2.3 chạy bằng `candle-onnx` trong tiến trình chính; không dùng `ort`; state LSTM… | VAD trên luồng riêng stack 8 MiB, vẫn chạy khi `asr-worker` khởi động lại | b2 |
| 100 | Việc cho MVP §6.3: chọn luật ghép câu tốt hơn cho zh và ja (ví dụ khoảng nghỉ đủ dài là hết… | luật ghép câu zh/ja từ dữ liệu hội thoại thật | chờ Q6; giữ luật hiện tại |
| 101 | Engine whisper.cpp qua `whisper-rs` trong tiến trình phụ `asr-worker` link tĩnh; Metal trên… | Metal trên macOS; lỗi GPU thì CPU | a1, a6; Vulkan ở c9 (Win), chờ C3 |
| 102 | Giao thức stdin/stdout: khung 4 byte độ dài (`u32` LE) cộng postcard, tối đa 16 MiB; mỗi yêu… | giao thức có thêm trường mới, giữ các luật khung | a1 |
| 103 | Mở rộng giao thức: chỉ thêm biến thể ở cuối; app và `asr-worker` luôn build cùng nhau | `protocol_version`, chỉ số enum mới cũng bị khóa | a1 |
| 104 | Log của thông điệp không bao giờ chứa âm thanh hay nội dung chép lời | `Debug` của trường mới không lộ nội dung | a1 |
| 105 | Hai bản trên Windows, `asr-worker-vulkan` và `asr-worker-cpu`; mỗi lần app khởi động chạy nền… | chạy `--probe`, chọn bản theo kết quả | c3; c9 (Win), chờ C3 |
| 106 | Tiến trình phụ lỗi: khởi động lại, chờ 1, 2, 5 giây; lần đầu chạy binary mới chờ `Ready` theo… | luật khởi động lại, gửi lại đoạn, chuyển CPU, bỏ cuộc | a6 |
| 108 | Chế độ giải mã B (`shared`, cần feature `shared-encode` và bản vá ở `third_party/`) là mặc… | app từ chối worker không ở chế độ B | a6 |
| 109 | Chọn ngôn ngữ: chuẩn hóa xác suất trong tập cho phép; đoạn từ 1,5 giây dưới 0,5 thì giữ ngôn… | giữ ngôn ngữ trước theo `prev_lang` trong yêu cầu | a1 |
| 110 | Giải mã greedy, không temperature fallback, chặn token không phải tiếng nói; prompt là tối đa… | prompt theo ngôn ngữ, giữ ở tiến trình chính | a4 |
| 111 | `audio_ctx = min(1500, max(512, 50 × số giây + 64))`, làm tròn lên (`MIN_AUDIO_CTX`… | không đổi (có từ GĐ0) | — |
| 112 | Flash attention tắt; `ASR_FLASH_ATTN=1` chỉ để thử | không đổi (có từ GĐ0) | — |
| 113 | Làm nóng: sau `Load`, app gửi `Warmup` | app gửi `Warmup` sau `Load` | a6 |
| 114 | Lọc ảo giác: bỏ đoạn khi `no_speech_prob > 0,6` và `avg_logprob < −1`, và đoạn có chữ rỗng… | luật bỏ đoạn chuyển vào `pipeline` | a2 |
| 115 | Việc cho MVP §6.4: thử `no_speech_prob` trên im lặng, nhiễu và nhạc, nhất là với turbo | công cụ đo, chạy đo im lặng và nhiễu | b3, b6; nhạc chờ người (Đ12) |
| 116 | Việc cho MVP §6.4: luật lặp khi prompt dài (trần còn khoảng 119 token, câu chép đôi dài từ… | prompt không làm hạ trần token (QĐ3) | a4 |
| 117 | Việc cho MVP §6.4: chọn ngưỡng giữ ngôn ngữ trước theo số ngôn ngữ trong tập, dựa trên đoạn… | ngưỡng giữ ngôn ngữ theo số ngôn ngữ | chờ Q6 |
| 118 | Việc cho MVP §6.4: bộ lọc câu ảo giác quen thuộc ("Thank you for watching", "Hãy subscribe cho… | lọc câu ảo giác quen thuộc | a3 |
| 119 | Việc cho MVP §6.4: bật `shared-encode` mặc định cho bản phát hành; app từ chối worker có… | app từ chối `decode_mode` khác `shared` | a6, c3; bản phát hành ở 07 |
| 120 | Việc cho MVP §6.4: với zh, chuyển phồn thể sang giản thể ở tầng app | phồn thể sang giản thể | a3 |
| 121 | Việc cho MVP §6.4: xem lại flash attention khi upstream có mask cho phần đệm… | kiểm upstream: #3941 vẫn mở, giữ tắt | điểm cần quyết 9; 08 |
| 122 | Việc cho MVP §6.4: trước khi gửi bản vá `set_audio_ctx` lên upstream, hàm C trả −1 khi giá trị… | bản vá trả −1 và `Result` | a1 |
| 123 | Việc cho MVP §6.4: đưa `prev_lang` vào `TranscribeRequest`, worker không giữ trạng thái nhận… | `prev_lang` trong `TranscribeRequest` | a1 |
| 124 | Việc cho MVP §6.4: trong `asr-protocol`, `backend` và `decode_mode` thành enum | enum `Backend`, `DecodeMode` | a1 |
| 125 | Việc cho MVP §6.4: `Error` có thêm `kind` (`NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`… | `Error.kind` | a1 |
| 126 | Việc cho MVP §6.4: `Ready` có thêm `protocol_version`, app từ chối worker lệch phiên bản | `Ready.protocol_version`, app từ chối lệch phiên bản | a1, a4 |
| 127 | Việc cho MVP §6.4: `asr-worker` giữ riêng stdout cho giao thức, chuyển fd 1 sang stderr | stdout chỉ cho giao thức | a1 |
| 128 | Việc cho MVP §6.4: log của `asr-worker` (mở chế độ append) có xoay vòng hoặc giới hạn kích… | log của tiến trình phụ append và xoay vòng | a4 |
| 129 | MVP cần `Ready.backend` trả thiết bị thật, không phải backend được yêu cầu, để áp quy tắc… | `Ready.backend` là thiết bị thật | a1 |
| 130 | Chạy lại lượt fullctx với bản build chốt, để có số so sánh cùng cấu hình cho giả định 8 | chạy lại lượt fullctx | b8 |
| 131 | `llama-server` khóa một phiên bản llama.cpp; macOS dùng Metal; Windows dùng Vulkan và CPU, nạp… | dùng b11146 cho bản dev; Windows và bản tự build ở đợt Windows và 07 | a4; c9 (Win), 07 |
| 132 | Lệnh chạy `--host 127.0.0.1 --port <cổng trống ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-ui`… | lệnh chạy, `/health` | a4 |
| 133 | API key truyền qua biến môi trường `LLAMA_API_KEY`, chỉ đặt cho tiến trình `llama-server`… | `LLAMA_API_KEY` qua biến môi trường, không `--api-key` | a4 |
| 134 | Không truyền `-ngl 99`; chạy `llama-server` sau khi `asr-worker` nạp model, để `--fit` tính cả… | không `-ngl 99`; chạy sau `asr-worker` | a4, a6 |
| 135 | Server lỗi: tự khởi động lại, chờ 1, 2, 5 giây; quá 5 lần trong 10 phút thì báo lỗi, phụ đề… | luật khởi động lại `llama-server` | a6 |
| 136 | Lần đầu chạy binary mới (sau khi cài hoặc cập nhật): chờ `/health` từ 30 giây trở lên, lần chờ… | chờ lâu hơn ở lần đầu, không tính lỗi; trạng thái "Đang chuẩn bị lần đầu" | a6, c1, c3; số thật chờ T1 |
| 137 | API `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF; kết luận S4 chỉ áp… | stream, chat template từ GGUF (có từ GĐ0) | a4; S4 Windows ở c9, chờ C4 |
| 138 | Phương án dự phòng: render template bằng `minijinja` rồi gọi `/completion`, truyền mảng token… | phương án dự phòng `/completion` | không làm: chỉ khi S4 Windows không đạt (C4) |
| 139 | Mẫu prompt theo model card Hy-MT2: mẫu tiếng Trung khi câu liên quan tới tiếng Trung, còn lại… | không đổi (có từ GĐ0) | — |
| 141 | Đưa câu trước vào làm ngữ cảnh: cờ thử nghiệm `experimental.translationContext`, mặc định tắt | cờ ngữ cảnh câu trước | b2, c3 |
| 142 | Tham số sinh: temperature 0, repeat penalty 1,05, số token tối đa min(4 × số token câu gốc +… | không đổi (có từ GĐ0) | — |
| 143 | Bật `cache_prompt`; gửi một request làm nóng khi bắt đầu phiên | `cache_prompt`; request làm nóng khi bắt đầu phiên | a4, b2 |
| 144 | Hậu xử lý trong lúc stream: cắt khoảng trắng thừa; giữ vài token đầu tới khi chắc không phải… | hậu xử lý trong lúc stream | a5 |
| 145 | Bản dịch quá dài, đo bằng token theo từng cặp: Anh→Việt 4,4; Trung→Việt 6,6; Nhật→Việt 3,5… | ngưỡng tỉ lệ token theo cặp | a5 |
| 146 | Thử lại một lần với repeat penalty 1,15; vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được" | thử lại với repeat penalty 1,15, rồi `failed` | a5 |
| 147 | Bỏ bước dịch khi ngôn ngữ câu gốc trùng ngôn ngữ đích | bỏ bước dịch khi trùng ngôn ngữ đích | b2 |
| 148 | Việc cho MVP §6.5: chọn cách xử lý câu gốc ngắn trong ngưỡng tỉ lệ token (cách 1 dùng hằng số… | cách 2 (QĐ12) | a5; chờ Q4 |
| 149 | Việc cho MVP §6.5: đo ngưỡng cho các cặp không có tiếng Việt, và cho câu gốc dưới 3 token | công cụ đo; chạy đo | b4, b6; duyệt ngưỡng: điểm cần quyết 8 |
| 151 | Cấu trúc `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status }` và cờ… | `Subtitle`, thêm `replaces` (QĐ9) | b1 |
| 152 | Sự kiện Tauri `subtitle://upsert` (cả đối tượng) và `subtitle://delta` (từng token lúc đang… | `subtitle://upsert` và `subtitle://delta` | b1, b2, c3, c5 |
| 186 | Quota Free tính "phút dịch" bằng tổng độ dài các đoạn có tiếng nói, không tính im lặng; lưu… | thời lượng các đoạn có tiếng nói đã dịch (`SessionMetrics::translated_speech_ms`) | b1, b2; quota ở 06 |
| 205 | Tiến trình phụ đặt ở `src-tauri/binaries/`, tên kèm target triple: `asr-worker` (macOS)… | script chép tiến trình phụ vào `src-tauri/binaries/` | c1; bộ cài ở 07 |
| 217 | Các luồng: callback thu âm (realtime); luồng tiền xử lý và VAD; runtime tokio (gửi đoạn sang… | các luồng theo §7 (QĐ1) | b2 |
| 218 | Hàng đợi từ VAD sang nhận dạng chứa tối đa 3 đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng… | hàng đợi nhận dạng | b1, b2 |
| 219 | Độ trễ bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý; vượt 6 giây thì hiện chỉ báo… | độ trễ và chỉ báo "Đang trễ" | b1, b2 |
| 220 | Hàng đợi dịch chứa tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ vào một request… | hàng đợi dịch, gộp câu | b1, b2 |
| 221 | Câu chờ dịch quá 20 giây thì bỏ bước dịch, chỉ hiện câu gốc (`skipped`) | `skipped` sau 20 giây chờ | b1, b2 |
| 222 | Số đo từng phiên (thời gian cắt đoạn, nhận dạng, dịch, tổng thể) lưu trên máy, không gửi đi… | số đo của phiên vào log | b1, b2, c3; bảng debug ở 03 |
| 225 | Ngân sách độ trễ theo bước và mục tiêu p50, p90 trên máy khuyến nghị và máy tối thiểu | chạy lại S6 | b9 |
| 227 | RAM: thiếu RAM khi chạy `llama-server` bằng CPU thì thử `--no-repack` | tham số thêm cho `llama-server` (`extra_args`) | a4, a6 |
| 230 | macOS chưa cấp quyền ghi âm thanh hệ thống (tạo tap lỗi, hoặc buffer toàn im lặng kèm trạng… | lỗi tạo tap thành mã `audioPermission`, nút mở System Settings | c2, c6, c8 (người); chờ C1 |
| 231 | Đang dịch mà hơn 60 giây không có âm thanh vào (theo RMS, kể cả phần im lặng được chèn): thanh… | "Không nghe thấy âm thanh" sau 60 giây | b2 |
| 232 | Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth): tự khởi tạo lại việc thu âm trong ≤… | mở lại nguồn khi thiết bị đổi | b5, c2; c8 (người), c9 (Win) |
| 233 | Model thiếu hoặc hỏng: lúc khởi động chỉ kiểm có file và đúng kích thước; SHA-256 đầy đủ kiểm… | kiểm có file model trước khi chạy | c3; kích thước và SHA-256 ở 04 |
| 234 | `asr-worker` không chạy hoặc bị crash (mã thoát, hoặc hết thời gian chờ): tự khởi động lại… | khởi động lại `asr-worker` | a6 |
| 235 | `llama-server` không chạy hoặc bị crash (mã thoát, hoặc `/health` báo lỗi): tự khởi động lại… | khởi động lại `llama-server`, quá giới hạn thì chỉ câu gốc | a6, b2 |
| 236 | GPU khởi tạo lỗi, hoặc máy Windows không có Vulkan: chạy `asr-worker-cpu`, `llama-server` chạy… | chuyển CPU, báo "Đang chạy bằng CPU" | a6, c3; c9 (Win), chờ C3 |
| 237 | Thiếu RAM hoặc VRAM (RAM trống thấp, hoặc tiến trình phụ báo hết bộ nhớ, kể cả bộ nhớ GPU): đề… | `OutOfMemory` thành đề xuất gói Nhẹ | a1, a6, c3; đổi gói ở 04 |
| 238 | Trễ dồn lại (độ trễ > 6 giây): hiện chỉ báo và áp chính sách ở §7 | trễ dồn lại | b1, b2 |
| 247 | Bản dịch lỗi (quá dài, có kèm lời giải thích): cắt stream, thử lại một lần với repeat penalty… | cắt stream, thử lại, rồi câu gốc | a5 |
| 248 | Âm thanh chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng | âm thanh không ghi xuống đĩa trong app | c2 |
| 250 | `llama-server` chỉ nghe `127.0.0.1`, API key ngẫu nhiên tạo mỗi lần chạy, truyền qua biến môi… | `127.0.0.1`, khóa ngẫu nhiên qua biến môi trường; `asr-worker` không mở cổng | a4 |
| 269 | Bị clone, đổi thương hiệu: đăng ký nhãn hiệu, EULA (pháp lý); logic quan trọng nằm trong Rust… | logic của pipeline nằm trong Rust | a1–a6, c1–c4 |
| 272 | Thay tiến trình phụ, chèn thư viện giả: kiểm SHA-256 của file thực thi và thư viện ggml theo… | SHA-256 tiến trình phụ và thư viện đi kèm; `SetDefaultDllDirectories` ở app và `asr-worker` | a1, c1, c3; hardened runtime ở 07 |
| 273 | Lộ nội dung cuộc họp: lịch sử mã hóa bằng SQLCipher, khóa ngẫu nhiên trong kho khóa; log không… | log không có chữ chép lời | a1, b2 |
| 277 | Unit: resample và gộp kênh; trộn hai thiết bị Windows có lệch đồng hồ | không đổi (có từ GĐ0) | — |
| 278 | Unit: chèn im lặng khi luồng loopback không trả gói dữ liệu | test chèn im lặng theo đồng hồ thật (`ClockFiller`) | b5; test `windows.rs` cần Windows (c9) |
| 279 | Unit: cắt câu với tín hiệu tổng hợp (im lặng, tiếng nói, nhạc, đoạn bị cắt ở 8 giây) | ca nhạc | chờ clip nhạc có quyền dùng (Đ12) |
| 280 | Unit: VAD chạy dài không tăng bộ nhớ (`vad_reference` bỏ qua mặc định; `debug_assert!` trong… | không đổi (có từ GĐ0) | — |
| 281 | Unit: ghép câu tạm (cửa sổ ghép theo `vadEndSilenceMs`, trần 15 giây hoặc 3 đoạn, đoạn khác… | test ghép câu chuyển vào `pipeline` | a2 |
| 282 | Unit: chọn ngôn ngữ trong tập cho phép, giữ ngôn ngữ đoạn trước, ngưỡng 0,9 cho đoạn ngắn hơn… | test chọn ngôn ngữ với `prev_lang` | a1 |
| 283 | Unit: giao thức stdin/stdout (đóng gói, giải mã, thông điệp hỏng hoặc bị cắt, khung thừa byte… | test cho trường mới | a1 |
| 284 | Unit: giải mã của `asr-worker` (công thức `audio_ctx` có sàn 512, luật lặp theo độ dài mẫu… | không đổi (có từ GĐ0) | — |
| 285 | Unit: luật bỏ đoạn ở tiến trình chính theo `no_speech_prob` và `avg_logprob` | test luật bỏ đoạn | a2, a3 |
| 286 | Unit: tạo prompt (nhánh tiếng Trung và không tiếng Trung, tên ngôn ngữ của từng mẫu); khớp… | prompt có từ GĐ0; thuật ngữ ở 03 | — |
| 287 | Unit: hậu xử lý bản dịch khi đang stream (lọc nhãn và ngoặc kép, ngưỡng tỉ lệ token theo cặp… | test hậu xử lý | a5 |
| 288 | Unit: các trạng thái của phụ đề, kể cả `same_lang`, `skipped`, `dropped` | test trạng thái phụ đề | b1, b2 |
| 295 | Tích hợp: chạy pipeline từ file WAV, kiểm phụ đề có xuất hiện, đúng thứ tự, đúng thời gian | test từ file WAV (clip FLEURS) với tiến trình phụ giả; bản model thật bị bỏ qua mặc định | b2, b3 |
| 296 | Tích hợp: vòng đời hai tiến trình phụ (đúng thứ tự, giả lập crash, tự khởi động lại, gửi lại… | test vòng đời với tiến trình phụ giả và đồng hồ giả | a6 |
| 302 | Thủ công: máy Windows không có Vulkan (ví dụ máy ảo) vẫn mở được app, dùng `asr-worker-cpu`… | máy Windows không có Vulkan | c9 (Win); 08 |
| 304 | Thủ công: khoảng lặng dài trên Windows (tạm dừng video, không ai nói), câu cuối vẫn được chốt… | khoảng lặng dài trên Windows | c9 (Win); 08 |
| 305 | Thủ công, khay: bấm X thì cửa sổ ẩn, phiên không dừng; Thoát ở khay thì không còn tiến trình… | Thoát ở khay không còn tiến trình phụ | c3, c8 (người) |
| 313 | Bảo mật: thay `asr-worker` hoặc `llama-server` bằng file khác thì app từ chối chạy | test thay tiến trình phụ thì bị từ chối | c1 |
| 315 | Bảo mật: log của một phiên dịch không chứa nội dung chép lời | test log của phiên không có chữ chép lời | b2 |
| 318 | Cây thư mục theo §12: `src/windows/{main,overlay}`, `components/`, `store/`, `lib/ipc.ts`… | `session.rs`, `sidecar/`, `capture.rs` | c1–c3 |
| 319 | `asr-protocol`, `asr-worker`, `audio-capture`, `pipeline` có từ Giai đoạn 0, phần lớn code… | dùng lại các crate | a1–a6, c1–c4 |
| 320 | Việc cho MVP §12: giữ `audio-capture` và `pipeline` là crate riêng; `src-tauri` chỉ còn phần… | đã xong ngày 2026-10-01 | — |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ23, dùng chung cho 02a, 02b và 02c.

- **QĐ1. Luồng riêng và client đồng bộ, không dùng runtime tokio.** Mục 2.2 của kế hoạch 00 giao 02 quyết điểm này; §7 của spec ghi runtime tokio cho phần gửi đoạn, dịch và sự kiện.
  - Các luồng: callback thu âm (ở `audio-capture`); luồng VAD, stack 8 MiB vì Silero chạy bằng candle cần hơn 1 MiB ở bản debug; luồng nhận dạng; luồng phụ đề, nơi duy nhất phát sự kiện phụ đề nên thứ tự upsert và delta luôn đúng; luồng dịch.
  - Lý do:
    - hai client đồng bộ của Giai đoạn 0 (`asr_client`, `llama`) đã chạy qua S6 và giữ nguyên cách gọi;
    - mỗi tiến trình phụ chỉ làm một việc một lúc (`llama-server -np 1`, `asr-worker` đọc tuần tự), nên async không thêm thông lượng;
    - `pipeline` không cần runtime nào, test chạy không cần Tauri.
  - App chỉ dùng runtime của Tauri để đưa việc chặn ra khỏi luồng chính (`spawn_blocking` trong lệnh `toggle_session`, 02c).
  - Lệch chữ §7 của spec: ghi ở điểm cần chủ dự án quyết.
- **QĐ2. Giao thức `asr-worker` bản 2** (`PROTOCOL_VERSION = 2`, "Việc cho MVP" của §6.4).
  - `Ready.protocol_version` là trường đầu, để app đọc được số này cả khi worker cũ hơn; app từ chối worker lệch phiên bản.
  - `TranscribeRequest.prev_lang` là trường cuối. Worker không còn giữ ngôn ngữ của đoạn trước: kết quả không phụ thuộc thứ tự yêu cầu, và app không mất ngôn ngữ trước khi worker khởi động lại.
  - Worker chỉ dùng prompt của app khi ngôn ngữ chọn cho đoạn này đúng bằng `prev_lang` (prompt là token của ngôn ngữ đó).
  - `backend` và `decode_mode` thành enum; `Ready.backend` là thiết bị thật (đọc bảng thiết bị ggml theo đúng luật chọn GPU của whisper.cpp 1.8.3).
  - `Error.kind`: `NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`, `InvalidRequest`, `Internal`. Worker phân loại theo nội dung thông báo của whisper.cpp và ggml, vì whisper-rs không phân biệt.
  - `latency-bench` (`latency`, `asr-eval`) truyền `prev_lang` bằng ngôn ngữ của đoạn chép lời ngay trước, kể cả đoạn bị bỏ: đúng trạng thái mà worker của Giai đoạn 0 tự giữ, nên số đo S6 và A4 không đổi.
- **QĐ3. Prompt không làm hạ trần token** (dòng 116, "Luật lặp khi prompt dài"). App chỉ gửi `min(100, 219 − (16 + 20 × số giây))` token prompt, nên trần token mới của worker luôn là `16 + 20 × số giây`. Đoạn 3 giây vẫn có đủ 100 token prompt; đoạn 8,4 giây còn 35; đoạn gộp 12 giây (§7) không có prompt.
- **QĐ4. Lọc câu ảo giác quen thuộc** (dòng 118). Danh sách câu nằm trong `FilterConfig::hallucination_phrases` (04 đổi được qua manifest). So khớp sau khi chuẩn hóa (chữ thường, chỉ giữ chữ và số); đoạn chỉ gồm các câu này, lặp lại, hoặc chỉ có dấu câu và ký hiệu thì bỏ. "Thank you." hay "Cảm ơn." đứng riêng không bị bỏ, vì là câu thật trong cuộc họp. Trên dữ liệu S6, luật mới không bỏ đoạn nào.
- **QĐ5. Phồn thể sang giản thể** (dòng 120) bằng `ferrous-opencc` (bảng OpenCC `t2s`), áp lên chữ của đoạn tiếng Trung trước khi hiện, ghép câu và dịch (`text::display_text`). Trên dữ liệu S6, 44 đoạn tiếng Trung đổi chữ. Test chạy lại quyết định của S6 áp cùng hàm cho cả hai phía.
- **QĐ6. Bản vá `set_audio_ctx` trả lỗi** (dòng 122): hàm C trả −1 khi giá trị ngoài `[0, n_audio_ctx]`, bản Rust trả `Result`. Dựng lại `third_party/` từ tarball crates.io cộng hai bản vá cho ra đúng từng byte bản commit.
- **QĐ7. Luật giám sát** (Đ2, §6.4, §6.5, §9; số mặc định trong `SupervisorConfig`):
  - chờ 1, 2, 5 giây giữa các lần khởi động lại; quá 5 lần lỗi trong 10 phút thì bỏ cuộc (`asr-worker`: dừng phiên, báo lỗi; `llama-server`: phụ đề chỉ hiện câu gốc);
  - đoạn đang xử lý gửi lại một lần, lỗi nữa thì `dropped`; worker trả `Error` cho một đoạn mà vẫn sống thì không khởi động lại;
  - chuyển sang CPU khi: crash 2 lần liên tiếp lúc dùng GPU; bản GPU không khởi động được hay nạp model lỗi (với `asr-worker`, chuyển ngay); hoặc `Ready.backend` báo CPU. Đã chuyển thì giữ CPU tới khi app tắt. `llama-server` chạy CPU bằng `-ngl 0`;
  - `ModelLoad` khi đã chạy CPU thì bỏ cuộc luôn (model hỏng, thử lại vô ích);
  - lần đầu chạy binary mới: chờ `Ready` hay `/health` lâu hơn (`first_run_ready_timeout_ms` 180 giây, spec ghi "từ 30 giây"), lần chờ này không tính là lỗi;
  - `begin_session` xóa trạng thái bỏ cuộc: người dùng bấm Bắt đầu lại thì thử lại từ đầu;
  - không có phiên nào trong 10 phút thì tắt cả hai (`tick`, app gọi 30 giây một lần).
- **QĐ8. Tiến trình phụ không bị bỏ lại khi app chết** (dòng 82). macOS: mỗi tiến trình phụ là trưởng một process group; hook panic gửi `SIGKILL` cho mọi group còn sống trước khi abort. Windows: một Job Object `KILL_ON_JOB_CLOSE`, tiến trình phụ chạy với `CREATE_NO_WINDOW`. Không dùng pidfile. Giới hạn còn lại: app bị `SIGKILL` (Force Quit) trên macOS thì `llama-server` còn chạy tới khi người dùng tắt; `asr-worker` tự thoát khi stdin đóng. Ghi ở điểm cần chủ dự án quyết.
- **QĐ9. Hàng đợi §7 và trường `replaces`.**
  - Hàng đợi nhận dạng tối đa 3 đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ bỏ đoạn khi độ trễ vượt 20 giây.
  - Hàng đợi dịch tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ vào một request. Phụ đề gộp mang id của câu đầu và trường mới `replaces` (id các phụ đề đã gộp vào nó), để giao diện xóa chúng. §6.6 không có trường này; ghi ở điểm cần chủ dự án quyết.
  - Câu chờ dịch quá 20 giây thì `skipped`. Độ trễ vượt 6 giây thì chỉ báo "Đang trễ".
  - Id phụ đề cộng `EngineConfig::id_base`, để không trùng giữa các phiên của một lần chạy app.
- **QĐ10. Dừng phiên.** `Engine::stop` chốt đoạn đang nói dở, xử lý nốt hàng đợi nhận dạng; câu còn chờ dịch thành `skipped`; câu đang dịch được chờ thêm tối đa 2 giây rồi hủy.
- **QĐ11. Hậu xử lý bản dịch** (§6.5):
  - giữ phần đầu tới khi chắc không phải nhãn ("Translation:", "译文："…), nhãn thì bỏ;
  - ngoặc kép mở ở đầu (khi câu gốc không có) không hiện trong lúc stream; lúc kết thúc, ngoặc bao cả câu thì bỏ cả cặp, còn không thì trả lại;
  - ngưỡng tỉ lệ token đếm theo gói SSE: mỗi gói là một token (đã kiểm: 24 gói khớp `predicted_n` 24);
  - xuống dòng rồi viết tiếp khi câu gốc không có xuống dòng là dấu hiệu lời giải thích: cắt và thử lại. Trên 1240 bản dịch của S7 không có bản dịch đúng nào bị luật này bắt;
  - thử lại một lần với repeat penalty 1,15; vẫn lỗi thì `failed`, hiện câu gốc.
- **QĐ12. Câu gốc ngắn trong ngưỡng tỉ lệ token: theo cách 2 của Q4** (đề xuất của kế hoạch 00): chỉ áp tỉ lệ khi câu gốc từ 10 token; câu ngắn hơn chỉ chịu hạn mức sinh `min(4 × số token + 32, 512)`. Cặp chưa có ngưỡng (không có tiếng Việt) không bị kiểm tỉ lệ cho tới khi 02b Task 6 đo xong. Ngưỡng nằm trong `MtConfig::ratio_thresholds` (cùng `ratio_min_source_tokens`), đổi được qua manifest. Chủ dự án chưa quyết Q4: ghi ở điểm cần quyết.
- **QĐ13. `repeat_penalty` là `f64`**, để JSON gửi đi là `1.05`, không phải `1.0499999523162842`.
- **QĐ14. Tiến trình phụ giả là binary trong `pipeline`** (`fake_asr_worker`, `fake_llama_server`), test lấy đường dẫn qua `CARGO_BIN_EXE_*`. Kịch bản lỗi đọc từ file và biến môi trường; mỗi lần tiến trình chạy lấy một dòng, nên test được chuỗi "crash rồi chạy lại". `FakeClock` cộng thẳng thời gian chờ, nên test vòng đời không ngủ thật.
- **QĐ15. Kiểm code Windows trên Mac.** Ngoài `fake-llvm-rc` của 01, thêm `scripts/fake-pkg-config`: `candle-core` 0.11 luôn kéo `tokenizers` với `onig`, nên `onig_sys` muốn biên dịch thư viện C oniguruma cho Windows. Với `RUSTONIG_DYNAMIC_LIBONIG=1` và pkg-config giả, `cargo clippy` không phải biên dịch gì; `cargo check` và `clippy` không link nên thư viện giả không bao giờ được dùng.
- **QĐ16. Đổi thiết bị phát: hỏi định kỳ 500 ms** (`audio_capture::default_output_signature`) thay cho listener của Core Audio và `IMMNotificationClient` (§6.1, §9). Cùng kết quả (khởi tạo lại trong ≤ 2 giây), không có callback chạy trên luồng của hệ thống. Luồng thu chết (thiết bị bị rút) cũng làm mở lại nguồn (`AudioSource::failed`). Lệch chữ §6.1: ghi ở điểm cần quyết.
- **QĐ17. Kiểm SHA-256 tiến trình phụ** (Đ15) theo bảng sinh lúc build từ mọi file trong `src-tauri/binaries/` (file thực thi và thư viện đi kèm); kiểm mỗi lần chạy lại tiến trình phụ, không chỉ lúc mở app. File lạ, thiếu, hay khác bảng thì không chạy (02c).
- **QĐ18. "Lần đầu chạy binary mới"** nhận biết bằng `sidecars-seen.json` trong `app_local_data_dir`, giữ SHA-256 của 8 binary gần nhất đã chạy được tới `Ready` (02c).
- **QĐ19. Bắt đầu phiên không chạy trên luồng chính** (02c): `toggle_session` là lệnh `async` gọi `spawn_blocking`; phím tắt, khay và Thoát chạy trên luồng riêng. Thanh phụ đề hiện qua `run_on_main_thread` (NSPanel chỉ đổi được từ luồng chính).
- **QĐ20. Tap tạm thời thu cả âm thanh của app** (Đ16): `TapTarget::System` ở `audio-capture` và `session::StartOptions { include_self }` ở app, cho bước "Nghe thử" của 03. Windows không cần, vì loopback vốn thu mọi âm thanh.
- **QĐ21. Ngưỡng gom vào `PipelineConfig`** (segmenter, ghép câu, lọc, ASR, MT, hàng đợi, giám sát, âm thanh), mặc định là số đã chốt ở Giai đoạn 0 và spec. Mọi struct `#[serde(default)]`: manifest của 04 chỉ cần ghi khóa muốn đổi, khóa lạ bị bỏ qua. `validate()` từ chối giá trị vô lý (04 giữ mặc định khi lỗi). `vadEndSilenceMs` của người dùng không nằm ở đây; app ghi đè `segmenter.end_silence_ms`.
- **QĐ22. Hai công cụ đo cho Đ12:** test bỏ qua `no_speech.rs` (tín hiệu tổng hợp và file WAV tùy chọn qua `asr-worker` thật, in `no_speech_prob`, `avg_logprob`, kết luận của luật lọc), và `build_ratio_set.py` cùng `ratio_stats.py` (12 chiều không có tiếng Việt và câu gốc rất ngắn, dịch bằng `mt-eval`, tính ngưỡng theo cách của S7). Ngưỡng mới chỉ vào `MtConfig` sau khi chủ dự án duyệt.
- **QĐ23. Lấy Expected từ target riêng.** Lúc lập kế hoạch, target dùng chung giữa nhiều worktree đã trộn artifact của crate cùng tên (crate path có đường dẫn tương đối giống nhau nên trùng hash), làm vài lần build dùng nhầm code cũ. Mọi Expected trong kế hoạch lấy từ một lần chạy lại các task trên worktree sạch với target riêng còn trống. Khi thực thi trên `main` thì không có vấn đề này.

## Điểm cần chủ dự án quyết

Kế hoạch đã làm theo phương án ghi trong ngoặc; chủ dự án đổi thì sửa kế hoạch trước khi thực thi.

1. **Q4, câu gốc ngắn trong ngưỡng tỉ lệ token** (dòng 148). Kế hoạch dùng cách 2 (QĐ12). Đổi sang cách 1 thì chỉ đổi `MtConfig` và test của `postprocess`.
2. **Lệch chữ spec, cần duyệt hoặc sửa spec:**
   - §7 ghi runtime tokio; kế hoạch dùng luồng riêng và client đồng bộ (QĐ1).
   - §6.1 và §9 ghi listener của Core Audio và `IMMNotificationClient`; kế hoạch hỏi định kỳ 500 ms (QĐ16).
   - §6.6 không có trường `replaces`; kế hoạch thêm vào `Subtitle` để gộp phụ đề khi hàng đợi dịch đầy (QĐ9).
   - §6.5 ghi "chờ `/health` từ 30 giây trở lên" ở lần đầu; kế hoạch chờ tới 180 giây (`first_run_ready_timeout_ms`), lần thường 60 giây. Số thật chờ T1 (bản đã notarize).
3. **Thư viện C oniguruma trong tiến trình chính** (qua `candle-core` 0.11 → `tokenizers` feature `onig`, có từ Giai đoạn 0). §6.12 cấm hai bản của cùng một thư viện C; đây chỉ có một bản, nhưng là thư viện C không ai chủ động chọn. Phương án: giữ (kế hoạch này); hoặc 07 thử bỏ feature `onig` khi nâng candle.
4. **App bị Force Quit trên macOS để lại `llama-server`** (QĐ8). Phương án: chấp nhận (kế hoạch này); hoặc thêm pidfile và kill ở lần chạy sau.
5. **Tên app trong danh sách "chỉ thu một app" trên macOS** là bundle ID (`us.zoom.xos`), vì Core Audio không cho tên. Phương án: giữ (kế hoạch này); hoặc lấy tên hiển thị qua `NSRunningApplication` (thêm `objc2-app-kit` vào tiến trình chính), giao 03.
6. **Trang System Settings cho quyền ghi âm thanh hệ thống**: kế hoạch mở `x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture` (phần "System Audio Recording Only" của trang "Screen & System Audio Recording"; cùng neo mà một app dùng Core Audio tap đang dùng, getopenscreen/openscreen#740). Apple không công bố danh sách neo này và chưa ai bấm thử; 02c Task 8 nhờ người kiểm, sai thì đổi `system::AUDIO_PERMISSION_URL` (phương án dự phòng: `Privacy_ScreenCapture`).
7. **Câu xin quyền trong `Info.plist`** (`NSAudioCaptureUsageDescription`) chỉ có tiếng Việt, giống S1. Bản tiếng Anh cần `InfoPlist.strings` trong bộ cài: giao 07, hay chấp nhận một ngôn ngữ cho MVP.
8. **Ngưỡng tỉ lệ token cho cặp không có tiếng Việt và câu gốc dưới 3 token** (dòng 149): 02b Task 6 đo và đề xuất; chủ dự án duyệt thì thêm vào `DEFAULT_RATIO_THRESHOLDS` (hoặc manifest của 04).
9. **Flash attention** (dòng 121): ngày 2026-10-01, ggml-org/whisper.cpp#3941 (che phần đệm khi bật flash attention) vẫn mở, hoạt động cuối ngày 2026-07-16. Kế hoạch giữ tắt; 08 kiểm lại trước khi phát hành.
10. **`no_speech_prob` với turbo** (dòng 115): lúc lập kế hoạch (02b Task 3), turbo cho `no_speech_prob` cỡ 1e-10 với mọi tín hiệu, nên luật `no_speech_prob` của §6.4 không bao giờ bỏ đoạn nào; nếu tín hiệu lọt qua VAD, turbo bịa "you", "so", "Thank you.". Silero VAD của app không cắt ra đoạn nào từ cả 14 tín hiệu tổng hợp, nên chỗ còn hở là nhạc. Chờ kết quả với nhạc (02b Task 6) rồi quyết có thêm luật riêng cho turbo hay không.

---

## Task 1: Giao thức `asr-worker` bản 2

Các việc "Việc cho MVP" của §6.4 về giao thức và worker (dòng 102–104, 109, 122–127, 129; QĐ2, QĐ6):
- `asr-protocol`: `PROTOCOL_VERSION`, enum `Backend`, `DecodeMode`, `ErrorKind`; `Ready.protocol_version` đứng đầu; `Error.kind`; `TranscribeRequest.prev_lang` đứng cuối.
- `asr-worker`:
  - không giữ ngôn ngữ của đoạn trước (`prev_lang` trong yêu cầu); kiểm `prev_lang` thuộc tập cho phép;
  - chỉ dùng prompt của app khi ngôn ngữ không đổi (`prompt_for`);
  - phân loại lỗi (`classify`) và trả `InvalidRequest` cho đầu vào sai thay vì panic;
  - báo thiết bị thật (`backend.rs`);
  - giữ riêng stdout cho giao thức (`platform::protocol_stdout`); trên Windows chỉ nạp DLL từ thư mục của mình và System32 (`harden_dll_search`).
- `third_party/`: bản vá `set_audio_ctx` trả −1 (C) và `Result` (Rust) khi giá trị ngoài khoảng.
- Chỗ dùng giao thức: `pipeline::asr_client` từ chối worker lệch phiên bản; `latency-bench` truyền `prev_lang` như worker cũ tự giữ, nên S6 và A4 không đổi.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/asr-protocol/src/lib.rs`
- Sửa: `crates/asr-worker/Cargo.toml`
- Tạo: `crates/asr-worker/src/backend.rs`
- Sửa: `crates/asr-worker/src/engine.rs`
- Sửa: `crates/asr-worker/src/lib.rs`
- Sửa: `crates/asr-worker/src/main.rs`
- Tạo: `crates/asr-worker/src/platform.rs`
- Sửa: `crates/asr-worker/src/shared.rs`
- Test (tạo): `crates/asr-worker/tests/audio_ctx_patch.rs`
- Test (tạo): `crates/asr-worker/tests/protocol.rs`
- Test (tạo): `crates/asr-worker/tests/stdout_isolation.rs`
- Sửa: `crates/latency-bench/src/asr_eval.rs`
- Sửa: `crates/latency-bench/src/latency.rs`
- Sửa: `crates/pipeline/src/asr_client.rs`
- Sửa: `deny.toml`
- Sửa: `third_party/patches/0001-whisper-cpp-set-audio-ctx.patch`
- Sửa: `third_party/patches/0002-whisper-rs-set-audio-ctx.patch`
- Sinh lại: `third_party/whisper-rs-sys/`, `third_party/whisper-rs/` (theo `third_party/README.md`)

- [ ] **Step 1: Khai báo phụ thuộc và test mới của `asr-worker`**

`whisper-rs-sys` là bản đã vá ở `third_party/` (qua `[patch.crates-io]` có sẵn), chỉ để đọc bảng thiết bị ggml. `deny.toml` cho phép thêm `asr-worker` làm wrapper của nó (Step 5).

Sửa `crates/asr-worker/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/Cargo.toml
+++ b/crates/asr-worker/Cargo.toml
@@ -16,6 +16,13 @@
 anyhow.workspace = true
 asr-protocol = { path = "../asr-protocol" }
 ash = { version = "0.38.0", optional = true, default-features = false, features = ["loaded", "std"] }
+libc = "0.2.189"
 serde.workspace = true
 serde_json.workspace = true
 whisper-rs = "0.16.0"
+# Chỉ để đọc bảng thiết bị ggml (`backend.rs`); cùng bản đã vá mà whisper-rs dùng (`[patch.crates-io]`).
+whisper-rs-sys = "0.15.0"
+
+[[test]]
+name = "stdout_isolation"
+harness = false
```

- [ ] **Step 2: Viết test**

Sửa `crates/asr-protocol/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-protocol/src/lib.rs
+++ b/crates/asr-protocol/src/lib.rs
@@ -230,6 +230,7 @@
             languages: vec!["en".into(), "vi".into()],
             prompt_tokens: vec![50364, 123],
             audio_ctx: 214,
+            prev_lang: Some("vi".into()),
         })
     }
 
@@ -238,8 +239,9 @@
         let mut buf = Vec::new();
         write_frame(&mut buf, &sample_request()).unwrap();
         let ready = Response::Ready {
-            backend: "metal".into(),
-            decode_mode: "shared".into(),
+            protocol_version: PROTOCOL_VERSION,
+            backend: Backend::Metal,
+            decode_mode: DecodeMode::Shared,
             whisper_version: "1.8.3".into(),
             system_info: "NEON = 1".into(),
         };
@@ -350,11 +352,13 @@
         assert!(read_frame::<_, Request>(&mut r).unwrap().is_none());
     }
 
-    /// Message có kích thước mã hóa đúng bằng `MAX_FRAME_BYTES` (1 byte biến thể + 1 byte Option + 4 byte độ dài chuỗi).
+    /// Message có kích thước mã hóa đúng bằng `MAX_FRAME_BYTES` (1 byte biến thể + 1 byte Option + 1 byte `kind` + 4 byte
+    /// độ dài chuỗi).
     fn message_of_exactly_max() -> Response {
         let msg = Response::Error {
             segment_id: None,
-            message: "a".repeat(MAX_FRAME_BYTES as usize - 6),
+            kind: ErrorKind::Internal,
+            message: "a".repeat(MAX_FRAME_BYTES as usize - 7),
         };
         assert_eq!(postcard::to_stdvec(&msg).unwrap().len(), MAX_FRAME_BYTES as usize);
         msg
@@ -373,6 +377,7 @@
     fn write_rejects_oversized_message_and_writes_nothing() {
         let Response::Error {
             segment_id,
+            kind,
             mut message,
         } = message_of_exactly_max()
         else {
@@ -380,7 +385,14 @@
         };
         message.push('a'); // MAX + 1
         let mut out = Vec::new();
-        let res = write_frame(&mut out, &Response::Error { segment_id, message });
+        let res = write_frame(
+            &mut out,
+            &Response::Error {
+                segment_id,
+                kind,
+                message,
+            },
+        );
         assert!(matches!(res, Err(FrameError::TooLarge(n)) if n == MAX_FRAME_BYTES as u64 + 1));
         assert!(out.is_empty());
     }
@@ -413,8 +425,9 @@
         assert_eq!(requests, [0, 1, 2, 3]);
 
         let ready = Response::Ready {
-            backend: String::new(),
-            decode_mode: String::new(),
+            protocol_version: 0,
+            backend: Backend::Cpu,
+            decode_mode: DecodeMode::Shared,
             whisper_version: String::new(),
             system_info: String::new(),
         };
@@ -431,6 +444,7 @@
         });
         let error = Response::Error {
             segment_id: None,
+            kind: ErrorKind::Internal,
             message: String::new(),
         };
         let warmup_done = Response::WarmupDone { millis: 0.0 };
@@ -456,6 +470,7 @@
             languages: vec!["vi".into()],
             prompt_tokens: vec![777; 3],
             audio_ctx: 100,
+            prev_lang: None,
         });
         let s = format!("{req:?}");
         assert!(
@@ -505,4 +520,100 @@
         assert_eq!(audio_ctx_for_samples(1 << 40), 1500);
         assert_eq!(audio_ctx_for_samples(usize::MAX), 1500);
     }
-}
+    /// Chỉ số của ba enum mới cũng bị khóa như `Request` và `Response`: đổi thứ tự là đổi định dạng trên dây.
+    #[test]
+    fn enum_indices_are_pinned() {
+        fn index<T: Serialize>(v: &T) -> u8 {
+            postcard::to_stdvec(v).unwrap()[0]
+        }
+        assert_eq!(
+            [Backend::Cpu, Backend::Metal, Backend::Vulkan].map(|b| index(&b)),
+            [0, 1, 2]
+        );
+        assert_eq!([DecodeMode::Shared, DecodeMode::Split].map(|m| index(&m)), [0, 1]);
+        let kinds = [
+            ErrorKind::NotLoaded,
+            ErrorKind::ModelLoad,
+            ErrorKind::OutOfMemory,
+            ErrorKind::GpuInit,
+            ErrorKind::InvalidRequest,
+            ErrorKind::Internal,
+        ];
+        assert_eq!(kinds.map(|k| index(&k)), [0, 1, 2, 3, 4, 5]);
+    }
+
+    /// `protocol_version` là trường đầu của `Ready`: ngay sau byte biến thể (0) là varint của số phiên bản.
+    #[test]
+    fn protocol_version_comes_first_in_ready() {
+        let ready = Response::Ready {
+            protocol_version: PROTOCOL_VERSION,
+            backend: Backend::Vulkan,
+            decode_mode: DecodeMode::Split,
+            whisper_version: "1.8.3".into(),
+            system_info: String::new(),
+        };
+        let bytes = postcard::to_stdvec(&ready).unwrap();
+        assert_eq!(bytes[..2], [0, PROTOCOL_VERSION as u8]);
+        assert_eq!(PROTOCOL_VERSION, 2);
+    }
+
+    /// Worker của Giai đoạn 0 gửi `Ready` với `backend` là chuỗi: app mới đọc thấy phiên bản sai (độ dài chuỗi) hoặc
+    /// không giải mã được khung, chứ không nhận nhầm là hợp lệ.
+    #[test]
+    fn a_phase0_ready_is_not_accepted_as_version_2() {
+        #[derive(Serialize)]
+        enum OldResponse {
+            Ready {
+                backend: String,
+                decode_mode: String,
+                whisper_version: String,
+                system_info: String,
+            },
+        }
+        let old = OldResponse::Ready {
+            backend: "metal".into(),
+            decode_mode: "shared".into(),
+            whisper_version: "1.8.3".into(),
+            system_info: "NEON = 1".into(),
+        };
+        let mut buf = Vec::new();
+        write_frame(&mut buf, &old).unwrap();
+        match read_frame::<_, Response>(&mut Cursor::new(buf)) {
+            Ok(Some(Response::Ready { protocol_version, .. })) => assert_ne!(protocol_version, PROTOCOL_VERSION),
+            Ok(other) => panic!("không mong đợi {other:?}"),
+            Err(_) => {} // cũng chấp nhận: khung không giải mã được
+        }
+    }
+
+    #[test]
+    fn prev_lang_roundtrips_and_is_the_last_field() {
+        let mut req = match sample_request() {
+            Request::Transcribe(r) => r,
+            _ => unreachable!(),
+        };
+        let with = postcard::to_stdvec(&req).unwrap();
+        req.prev_lang = None;
+        let without = postcard::to_stdvec(&req).unwrap();
+        // `Some("vi")` = 1 byte Some + 1 byte độ dài + 2 byte; `None` = 1 byte. Hai bản chỉ khác ở đuôi.
+        assert_eq!(with.len(), without.len() + 3);
+        assert_eq!(with[..without.len() - 1], without[..without.len() - 1]);
+        assert_eq!(with[with.len() - 4..], [1, 2, b'v', b'i']);
+        assert_eq!(
+            postcard::from_bytes::<TranscribeRequest>(&with)
+                .unwrap()
+                .prev_lang
+                .as_deref(),
+            Some("vi")
+        );
+    }
+
+    #[test]
+    fn backend_names_and_gpu_flag() {
+        assert_eq!(Backend::Metal.as_str(), "metal");
+        assert_eq!(Backend::Vulkan.as_str(), "vulkan");
+        assert_eq!(Backend::Cpu.as_str(), "cpu");
+        assert!(Backend::Metal.is_gpu() && Backend::Vulkan.is_gpu() && !Backend::Cpu.is_gpu());
+        assert_eq!(DecodeMode::Shared.as_str(), "shared");
+        assert_eq!(DecodeMode::Split.as_str(), "split");
+    }
+}
```

Tạo `crates/asr-worker/src/backend.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Thiết bị thật mà whisper.cpp dùng để chạy model (spec §6.4, thông điệp `Load`), để app áp quy tắc chuyển sang CPU.
//!
//! whisper.cpp 1.8.3 (`whisper_backend_init_gpu`) chọn thiết bị ggml đầu tiên có loại GPU hoặc GPU tích hợp khi
//! `use_gpu` bật; không có thiết bị nào như vậy thì lặng lẽ chạy bằng CPU. Hàm ở đây dò đúng theo luật đó. Ca còn sót:
//! thiết bị có nhưng khởi tạo lỗi (whisper.cpp cũng chạy bằng CPU) vẫn bị báo là GPU; log của worker có dòng
//! `failed to initialize` cho ca này.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_names_map_to_backends() {
        assert_eq!(backend_from_name("Metal"), Backend::Metal);
        assert_eq!(backend_from_name("MTL0"), Backend::Metal);
        assert_eq!(backend_from_name("Vulkan0"), Backend::Vulkan);
        assert_eq!(backend_from_name("vulkan1"), Backend::Vulkan);
    }

    #[test]
    fn cpu_is_requested_explicitly() {
        assert_eq!(real_backend(false), Backend::Cpu);
    }

    /// Không bật Metal hay Vulkan thì ggml không có thiết bị GPU nào: xin GPU vẫn ra CPU.
    #[cfg(not(any(feature = "metal", feature = "vulkan")))]
    #[test]
    fn without_a_gpu_backend_the_real_device_is_cpu() {
        assert_eq!(real_backend(true), Backend::Cpu);
    }

    /// Build có Metal trên Mac Apple Silicon: thiết bị GPU là Metal.
    #[cfg(all(feature = "metal", target_os = "macos"))]
    #[test]
    fn metal_build_reports_metal() {
        assert_eq!(real_backend(true), Backend::Metal);
    }
}
```

Sửa `crates/asr-worker/src/engine.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/engine.rs
+++ b/crates/asr-worker/src/engine.rs
@@ -459,6 +459,75 @@
         assert_eq!(mean_logprob(&[-0.25]), -0.25);
     }
 
+    fn request() -> TranscribeRequest {
+        TranscribeRequest {
+            segment_id: 1,
+            pcm: vec![0; 16_000],
+            languages: vec!["en".into(), "vi".into()],
+            prompt_tokens: vec![1, 2],
+            audio_ctx: 512,
+            prev_lang: Some("vi".into()),
+        }
+    }
+
+    const EOT: i32 = 50_257;
+
+    #[test]
+    fn prev_lang_comes_from_the_request() {
+        // lang id của Whisper: en = 0, vi = 19.
+        let (allowed, prev) = validate(&request(), EOT).unwrap();
+        assert_eq!((allowed, prev), (vec![0, 19], Some(19)));
+        let none = TranscribeRequest {
+            prev_lang: None,
+            ..request()
+        };
+        assert_eq!(validate(&none, EOT).unwrap().1, None);
+        // prev_lang ngoài tập cho phép vẫn hợp lệ: `pick_language` chỉ bỏ qua nó.
+        let outside = TranscribeRequest {
+            prev_lang: Some("ja".into()),
+            ..request()
+        };
+        assert_eq!(validate(&outside, EOT).unwrap().1, Some(7));
+    }
+
+    #[test]
+    fn bad_prev_lang_is_an_invalid_request() {
+        for bad in ["xx", "v\0i"] {
+            let req = TranscribeRequest {
+                prev_lang: Some(bad.into()),
+                ..request()
+            };
+            assert!(validate(&req, EOT).is_err(), "{bad:?}");
+        }
+    }
+
+    #[test]
+    fn app_prompt_is_used_only_when_the_language_stays_the_same() {
+        assert_eq!(prompt_for(19, Some(19), &[5, 6]), [5, 6]);
+        assert!(
+            prompt_for(0, Some(19), &[5, 6]).is_empty(),
+            "đổi ngôn ngữ thì bỏ prompt của ngôn ngữ cũ"
+        );
+        assert!(
+            prompt_for(19, None, &[5, 6]).is_empty(),
+            "chưa có đoạn trước thì không có ngữ cảnh"
+        );
+    }
+
+    #[test]
+    fn failures_are_classified_by_message() {
+        let e = |m: &str| anyhow::anyhow!(m.to_string());
+        let kind = |m: &str| classify(ErrorKind::Internal, &e(m));
+        assert_eq!(kind("ggml_metal: failed to allocate buffer"), ErrorKind::OutOfMemory);
+        assert_eq!(kind("VkResult ErrorOutOfDeviceMemory"), ErrorKind::OutOfMemory);
+        assert_eq!(kind("ggml_vulkan: failed to init device"), ErrorKind::GpuInit);
+        assert_eq!(kind("chép lời"), ErrorKind::Internal);
+        assert_eq!(
+            classify(ErrorKind::ModelLoad, &e("không nạp được model /x")),
+            ErrorKind::ModelLoad
+        );
+    }
+
     #[test]
     fn lid_window_of_mode_a_stays_the_three_second_formula() {
         // Không qua sàn MIN_AUDIO_CTX: nhận diện ngôn ngữ ở chế độ A vẫn mã hóa cửa sổ 3 giây (150 khung + 64), còn
```

Sửa `crates/asr-worker/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/lib.rs
+++ b/crates/asr-worker/src/lib.rs
@@ -1,3 +1,4 @@
+pub mod backend;
 pub mod engine;
 pub mod lid;
 #[cfg(feature = "shared-encode")]
```

Tạo `crates/asr-worker/tests/audio_ctx_patch.rs`:

```rust
//! Bản vá `set_audio_ctx` ở `third_party/` (spec §6.4, "Việc cho MVP"): hàm C trả −1 và bản Rust trả `Err` khi giá trị
//! ngoài `[0, n_audio_ctx]` của model, thay vì lặng lẽ đặt giá trị sai.
//!
//! Cần model thật nên bị bỏ qua mặc định. Chạy:
//! `WHISPER_TEST_MODEL=<gguf/bin whisper> cargo test -p asr-worker --test audio_ctx_patch -- --include-ignored`

use whisper_rs::{WhisperContext, WhisperContextParameters};

#[test]
#[ignore = "cần WHISPER_TEST_MODEL"]
fn out_of_range_audio_ctx_is_rejected() {
    let model = std::env::var("WHISPER_TEST_MODEL").expect("đặt WHISPER_TEST_MODEL");
    let params = WhisperContextParameters {
        use_gpu: false,
        ..Default::default()
    };
    let ctx = WhisperContext::new_with_params(&model, params).expect("nạp được model");
    let mut state = ctx.create_state().expect("tạo được state");
    for ok in [0, 1, 512, 1500] {
        assert!(state.set_audio_ctx(ok).is_ok(), "{ok} phải hợp lệ");
    }
    for bad in [-1, 1501, i32::MAX] {
        assert!(state.set_audio_ctx(bad).is_err(), "{bad} phải bị từ chối");
    }
}
```

Tạo `crates/asr-worker/tests/protocol.rs`:

```rust
//! Binary `asr-worker` nói đúng giao thức v2 (spec §6.4) khi chưa có model: không cần file model hay GPU.

use asr_protocol::{ErrorKind, Request, Response, TranscribeRequest, read_frame, write_frame};
use std::io::{BufReader, BufWriter};
use std::process::{Command, Stdio};

fn transcribe(segment_id: u64) -> Request {
    Request::Transcribe(TranscribeRequest {
        segment_id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into()],
        prompt_tokens: Vec::new(),
        audio_ctx: 512,
        prev_lang: None,
    })
}

#[test]
fn errors_carry_a_kind_and_the_worker_exits_when_stdin_closes() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut input = BufWriter::new(child.stdin.take().unwrap());
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut call = |req: &Request| {
        write_frame(&mut input, req).unwrap();
        read_frame::<_, Response>(&mut output).unwrap().unwrap()
    };

    let not_loaded = |resp: Response, id: Option<u64>| match resp {
        Response::Error { segment_id, kind, .. } => assert_eq!((segment_id, kind), (id, ErrorKind::NotLoaded)),
        other => panic!("cần Error NotLoaded, nhận {other:?}"),
    };
    not_loaded(call(&Request::Warmup), None);
    not_loaded(call(&transcribe(7)), Some(7));
    let load = Request::Load {
        model_path: "/khong/co/model.bin".into(),
        use_gpu: false,
        n_threads: 1,
    };
    match call(&load) {
        Response::Error { segment_id, kind, .. } => assert_eq!((segment_id, kind), (None, ErrorKind::ModelLoad)),
        other => panic!("cần Error ModelLoad, nhận {other:?}"),
    }
    drop(input); // app chết: stdin đóng thì worker tự thoát
    assert!(child.wait().unwrap().success());
}
```

Tạo `crates/asr-worker/tests/stdout_isolation.rs`:

```rust
//! `platform::protocol_stdout` (spec §6.4, "Việc cho MVP"): sau khi gọi, mọi thứ in ra stdout đi sang stderr, chỉ khung
//! giao thức còn đi ra stdout gốc.
//!
//! Chạy không qua harness của libtest (`harness = false` trong Cargo.toml), vì test phải đổi fd 1 của chính tiến trình.
//! Tiến trình cha chạy lại chính binary này làm tiến trình con (biến `STDOUT_ISOLATION_CHILD`), rồi kiểm hai luồng ra.

use std::io::Write;
use std::process::Command;

const NOISE: &str = "tiếng ồn của thư viện C";

fn main() {
    if std::env::var_os("STDOUT_ISOLATION_CHILD").is_some() {
        let mut protocol = asr_worker::platform::protocol_stdout().expect("tách được stdout");
        println!("{NOISE}");
        protocol.write_all(b"KHUNG").unwrap();
        protocol.flush().unwrap();
        return;
    }
    let out = Command::new(std::env::current_exe().unwrap())
        .env("STDOUT_ISOLATION_CHILD", "1")
        .output()
        .unwrap();
    assert!(out.status.success(), "tiến trình con lỗi: {out:?}");
    assert_eq!(out.stdout, b"KHUNG", "stdout chỉ còn khung giao thức");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains(NOISE), "println! phải sang stderr: {stderr:?}");
    println!("test stdout_isolation ... ok");
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p asr-protocol`
Expected: biên dịch lỗi, vì chưa có các kiểu và trường mới:

```text
error[E0425]: cannot find value `PROTOCOL_VERSION` in this scope
error[E0433]: cannot find type `ErrorKind` in this scope
error[E0560]: struct `TranscribeRequest` has no field named `prev_lang`
error[E0559]: variant `Response::Ready` has no field named `protocol_version`
error[E0433]: cannot find type `Backend` in this scope
error[E0433]: cannot find type `DecodeMode` in this scope
```

Run: `cargo test -p asr-worker --features shared-encode --lib`
Expected: biên dịch lỗi:

```text
error[E0433]: cannot find type `ErrorKind` in this scope
error[E0425]: cannot find function `backend_from_name` in this scope
error[E0433]: cannot find type `Backend` in this scope
error[E0425]: cannot find function `real_backend` in this scope
error[E0560]: struct `asr_protocol::TranscribeRequest` has no field named `prev_lang`
error[E0425]: cannot find function `validate` in this scope
```

- [ ] **Step 4: Sửa bản vá `set_audio_ctx` và dựng lại `third_party/`**

Thay toàn bộ `third_party/patches/0001-whisper-cpp-set-audio-ctx.patch` bằng:

```diff
diff --git a/whisper-rs-sys/src/bindings.rs b/whisper-rs-sys/src/bindings.rs
index ecaf862..8d04c0b 100644
--- a/whisper-rs-sys/src/bindings.rs
+++ b/whisper-rs-sys/src/bindings.rs
@@ -5243,6 +5243,13 @@ unsafe extern "C" {
         lang_probs: *mut f32,
     ) -> ::std::os::raw::c_int;
 }
+unsafe extern "C" {
+    pub fn whisper_set_audio_ctx_with_state(
+        ctx: *mut whisper_context,
+        state: *mut whisper_state,
+        audio_ctx: ::std::os::raw::c_int,
+    ) -> ::std::os::raw::c_int;
+}
 unsafe extern "C" {
     pub fn whisper_lang_auto_detect_with_state(
         ctx: *mut whisper_context,
diff --git a/whisper-rs-sys/whisper.cpp/include/whisper.h b/whisper-rs-sys/whisper.cpp/include/whisper.h
index f4cc6bf..bb4d850 100644
--- a/whisper-rs-sys/whisper.cpp/include/whisper.h
+++ b/whisper-rs-sys/whisper.cpp/include/whisper.h
@@ -381,6 +381,15 @@ extern "C" {
                                int   n_threads,
                              float * lang_probs);
 
+    // meeting-translator patch: set the audio context used by subsequent
+    // whisper_encode_with_state / whisper_lang_auto_detect_with_state calls on this state
+    // (0 = model default). Upstream only sets it inside whisper_full_with_state.
+    // Returns 0 on success, -1 if audio_ctx is outside [0, n_audio_ctx] of the model.
+    WHISPER_API int whisper_set_audio_ctx_with_state(
+            struct whisper_context * ctx,
+              struct whisper_state * state,
+                                 int   audio_ctx);
+
     WHISPER_API int whisper_lang_auto_detect_with_state(
             struct whisper_context * ctx,
               struct whisper_state * state,
diff --git a/whisper-rs-sys/whisper.cpp/src/whisper.cpp b/whisper-rs-sys/whisper.cpp/src/whisper.cpp
index 5b6e4b4..cee1adc 100644
--- a/whisper-rs-sys/whisper.cpp/src/whisper.cpp
+++ b/whisper-rs-sys/whisper.cpp/src/whisper.cpp
@@ -4018,6 +4018,15 @@ const char * whisper_lang_str_full(int id) {
     return nullptr;
 }
 
+int whisper_set_audio_ctx_with_state(struct whisper_context * ctx, struct whisper_state * state, int audio_ctx) {
+    if (audio_ctx < 0 || audio_ctx > ctx->model.hparams.n_audio_ctx) {
+        WHISPER_LOG_ERROR("%s: audio_ctx %d is outside [0, %d]\n", __func__, audio_ctx, ctx->model.hparams.n_audio_ctx);
+        return -1;
+    }
+    state->exp_n_audio_ctx = audio_ctx;
+    return 0;
+}
+
 int whisper_lang_auto_detect_with_state(
         struct whisper_context * ctx,
           struct whisper_state * state,
```

Thay toàn bộ `third_party/patches/0002-whisper-rs-set-audio-ctx.patch` bằng:

```diff
--- a/whisper-rs/src/whisper_state/mod.rs
+++ b/whisper-rs/src/whisper_state/mod.rs
@@ -143,6 +143,22 @@
         } else {
             Err(WhisperError::GenericError(ret))
         }
+    }
+
+    /// meeting-translator patch: set `audio_ctx` for subsequent [WhisperState::encode] and
+    /// [WhisperState::lang_detect] calls (0 = model default).
+    ///
+    /// # Errors
+    /// [WhisperError::GenericError] with code -1 if `audio_ctx` is outside `[0, n_audio_ctx]` of the model.
+    pub fn set_audio_ctx(&mut self, audio_ctx: c_int) -> Result<(), WhisperError> {
+        let ret = unsafe {
+            whisper_rs_sys::whisper_set_audio_ctx_with_state(self.ctx.ctx, self.ptr, audio_ctx)
+        };
+        if ret == 0 {
+            Ok(())
+        } else {
+            Err(WhisperError::GenericError(ret))
+        }
     }
 
     /// Run the Whisper decoder to obtain the logits and probabilities for the next token.
```

Dựng lại hai crate theo `third_party/README.md`, mục "Dựng lại từ đầu" (cần mạng để tải hai tarball từ crates.io):

```bash
rm -rf third_party/whisper-rs-sys third_party/whisper-rs
curl -sSfL -o third_party/whisper-rs-sys-0.15.0.crate https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate
curl -sSfL -o third_party/whisper-rs-0.16.0.crate https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate
shasum -a 256 -c - <<'EOF'
6986c0fe081241d391f09b9a071fbcbb59720c3563628c3c829057cf69f2a56f  third_party/whisper-rs-sys-0.15.0.crate
2088172d00f936c348d6a72f488dc2660ab3f507263a195df308a3c2383229f6  third_party/whisper-rs-0.16.0.crate
EOF
tar xzf third_party/whisper-rs-sys-0.15.0.crate -C third_party
tar xzf third_party/whisper-rs-0.16.0.crate -C third_party
rm third_party/whisper-rs-sys-0.15.0.crate third_party/whisper-rs-0.16.0.crate
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
git status --short third_party
```

Expected: hai tarball `OK`, và đúng sáu file đổi (hai bản vá cùng bốn file bản vá chạm tới):

```text
third_party/whisper-rs-sys-0.15.0.crate: OK
third_party/whisper-rs-0.16.0.crate: OK
 M third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
 M third_party/patches/0002-whisper-rs-set-audio-ctx.patch
 M third_party/whisper-rs-sys/src/bindings.rs
 M third_party/whisper-rs-sys/whisper.cpp/include/whisper.h
 M third_party/whisper-rs-sys/whisper.cpp/src/whisper.cpp
 M third_party/whisper-rs/src/whisper_state/mod.rs
```

Build của whisper-rs-sys chỉ chép whisper.cpp vào OUT_DIR khi chưa có, nên phải xóa bản build cũ ở cả hai profile:

Run: `cargo clean -p whisper-rs-sys && cargo clean -p whisper-rs-sys --release`
Expected: hai dòng `Removed …` (số file tùy máy).

- [ ] **Step 5: Viết code**

Sửa `crates/asr-protocol/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-protocol/src/lib.rs
+++ b/crates/asr-protocol/src/lib.rs
@@ -36,6 +36,68 @@
 
 /// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
 pub const MAX_FRAME_BYTES: u32 = 16 * 1024 * 1024;
+
+/// Phiên bản giao thức, gửi trong `Response::Ready`. App từ chối worker có phiên bản khác (spec §6.4, "Việc cho MVP").
+/// Tăng số này mỗi khi đổi bất kỳ kiểu nào trong file này. Giai đoạn 0 không có trường này (coi là 1).
+pub const PROTOCOL_VERSION: u32 = 2;
+
+/// Thiết bị `asr-worker` thật sự dùng để chạy model, không phải thiết bị được yêu cầu (spec §6.4, thông điệp `Load`).
+/// App dựa vào giá trị này để áp quy tắc chuyển sang CPU.
+#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
+pub enum Backend {
+    Cpu,
+    Metal,
+    Vulkan,
+}
+
+impl Backend {
+    pub fn as_str(self) -> &'static str {
+        match self {
+            Self::Cpu => "cpu",
+            Self::Metal => "metal",
+            Self::Vulkan => "vulkan",
+        }
+    }
+
+    pub fn is_gpu(self) -> bool {
+        self != Self::Cpu
+    }
+}
+
+/// Chế độ giải mã (spec §6.4, "Chế độ giải mã"). Bản phát hành chỉ nhận `Shared`.
+#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
+pub enum DecodeMode {
+    /// Chế độ B: nhận diện ngôn ngữ và chép lời dùng chung một lượt encode.
+    Shared,
+    /// Chế độ A: nhận diện ngôn ngữ riêng rồi `whisper_full`.
+    Split,
+}
+
+impl DecodeMode {
+    pub fn as_str(self) -> &'static str {
+        match self {
+            Self::Shared => "shared",
+            Self::Split => "split",
+        }
+    }
+}
+
+/// Loại lỗi, để app xử lý theo bảng lỗi ở spec §9.
+#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
+pub enum ErrorKind {
+    /// Gửi `Warmup` hay `Transcribe` khi chưa `Load` thành công.
+    NotLoaded,
+    /// Không nạp được model (file thiếu hay hỏng).
+    ModelLoad,
+    /// Hết RAM hoặc bộ nhớ GPU: app đề xuất chuyển sang gói Nhẹ (§9).
+    OutOfMemory,
+    /// Không khởi tạo được GPU: app chuyển sang CPU (§9).
+    GpuInit,
+    /// Yêu cầu sai (ngoài khoảng, sai định dạng): lỗi của app, không phải của worker.
+    InvalidRequest,
+    /// Lỗi khác của whisper.cpp khi chạy.
+    Internal,
+}
 
 /// Yêu cầu từ app gửi cho `asr-worker`. Mỗi yêu cầu có đúng một phản hồi, trừ `Shutdown` (worker thoát, không phản hồi):
 /// `Load` → `Ready` hoặc `Error`; `Warmup` → `WarmupDone` hoặc `Error`; `Transcribe` → `Result` hoặc `Error`.
@@ -63,22 +125,29 @@
     pub pcm: Vec<i16>,
     /// Mã ngôn ngữ Whisper được phép, ví dụ `["en", "vi"]`. Một phần tử nghĩa là khóa ngôn ngữ.
     pub languages: Vec<String>,
-    /// Tối đa [`MAX_PROMPT_TOKENS`] token của đoạn trước cùng ngôn ngữ, dùng làm prompt khởi đầu; nhiều hơn thì worker
-    /// trả `Error`.
+    /// Tối đa [`MAX_PROMPT_TOKENS`] token của các đoạn trước có ngôn ngữ `prev_lang`, dùng làm prompt khởi đầu; nhiều
+    /// hơn thì worker trả `Error`. Worker chỉ dùng prompt khi ngôn ngữ chọn cho đoạn này đúng bằng `prev_lang`: đổi ngôn
+    /// ngữ thì prompt của ngôn ngữ cũ không còn là ngữ cảnh.
     pub prompt_tokens: Vec<i32>,
     /// Cửa sổ mã hóa, mỗi vị trí 20 ms, trong khoảng 0 đến 1500. 0 nghĩa là cửa sổ 30 giây; giá trị khác phải phủ hết
     /// `pcm` (`audio_ctx · 320 ≥ pcm.len()`), nếu không worker trả `Error` vì whisper.cpp sẽ lặng lẽ bỏ phần đuôi.
     /// Công thức thường dùng: [`audio_ctx_for_samples`].
     pub audio_ctx: i32,
+    /// Ngôn ngữ của đoạn trước, do app giữ (spec §6.4, "Việc cho MVP"): worker không giữ trạng thái nhận diện ngôn ngữ,
+    /// nên kết quả không phụ thuộc thứ tự các yêu cầu, và app không mất ngôn ngữ trước khi worker khởi động lại. Đoạn bị
+    /// app bỏ (không có tiếng nói) không làm đổi giá trị này. Phải thuộc `languages` mới được dùng để giữ ngôn ngữ.
+    pub prev_lang: Option<String>,
 }
 
 /// Phản hồi của `asr-worker`. Cùng quy tắc chỉ-thêm-ở-cuối như [`Request`].
 #[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
 pub enum Response {
     Ready {
-        backend: String,
-        /// `shared` (chế độ B: nhận diện ngôn ngữ và chép lời dùng chung một lượt encode) hoặc `split` (chế độ A).
-        decode_mode: String,
+        /// Trường đầu tiên, để app đọc được số này trước mọi trường khác: worker build từ bản cũ hơn thì thường lệch ngay
+        /// ở đây (hoặc khung không giải mã được), và app báo lệch phiên bản.
+        protocol_version: u32,
+        backend: Backend,
+        decode_mode: DecodeMode,
         whisper_version: String,
         system_info: String,
     },
@@ -88,6 +157,7 @@
     Result(TranscribeResult),
     Error {
         segment_id: Option<u64>,
+        kind: ErrorKind,
         message: String,
     },
 }
@@ -129,6 +199,7 @@
             .field("languages", &self.languages)
             .field("prompt_tokens", &format_args!("<{} token>", self.prompt_tokens.len()))
             .field("audio_ctx", &self.audio_ctx)
+            .field("prev_lang", &self.prev_lang)
             .finish()
     }
 }
```

Thêm vào `crates/asr-worker/src/backend.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use asr_protocol::Backend;
use std::ffi::CStr;
use whisper_rs_sys::{
    ggml_backend_dev_count, ggml_backend_dev_get, ggml_backend_dev_name, ggml_backend_dev_type,
    ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_GPU as DEVICE_GPU,
    ggml_backend_dev_type_GGML_BACKEND_DEVICE_TYPE_IGPU as DEVICE_IGPU,
};

/// Thiết bị whisper.cpp sẽ dùng với `use_gpu`. Gọi sau khi nạp model (lúc đó ggml đã đăng ký các backend).
pub fn real_backend(use_gpu: bool) -> Backend {
    if !use_gpu {
        return Backend::Cpu;
    }
    match first_gpu_name() {
        Some(name) => backend_from_name(&name),
        None => Backend::Cpu,
    }
}

/// Tên thiết bị ggml ("Metal", "MTL0", "Vulkan0"…) sang `Backend`. Tên lạ thì theo feature lúc build.
pub fn backend_from_name(name: &str) -> Backend {
    let lower = name.to_ascii_lowercase();
    if lower.starts_with("metal") || lower.starts_with("mtl") {
        Backend::Metal
    } else if lower.starts_with("vulkan") {
        Backend::Vulkan
    } else if cfg!(feature = "metal") {
        Backend::Metal
    } else {
        Backend::Vulkan
    }
}

fn first_gpu_name() -> Option<String> {
    // SAFETY: các hàm đăng ký thiết bị của ggml chỉ đọc bảng thiết bị tĩnh; `dev` do ggml sở hữu, sống tới hết tiến
    // trình, và tên là chuỗi C kết thúc bằng NUL.
    unsafe {
        for i in 0..ggml_backend_dev_count() {
            let dev = ggml_backend_dev_get(i);
            let kind = ggml_backend_dev_type(dev);
            if kind == DEVICE_GPU || kind == DEVICE_IGPU {
                let name = ggml_backend_dev_name(dev);
                return Some(if name.is_null() {
                    String::new()
                } else {
                    CStr::from_ptr(name).to_string_lossy().into_owned()
                });
            }
        }
    }
    None
}
```

Sửa `crates/asr-worker/src/engine.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/engine.rs
+++ b/crates/asr-worker/src/engine.rs
@@ -15,8 +15,8 @@
 use crate::lid::{min_prob_for, pick_language};
 use anyhow::{Context, Result, bail};
 use asr_protocol::{
-    MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, SAMPLE_RATE, TranscribeRequest, TranscribeResult,
-    audio_ctx_for_samples,
+    DecodeMode, ErrorKind, MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, SAMPLE_RATE, TranscribeRequest,
+    TranscribeResult, audio_ctx_for_samples,
 };
 use std::time::Instant;
 use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};
@@ -129,7 +129,6 @@
     lid_state: Option<WhisperState>,
     n_threads: usize,
     flash_attn: bool,
-    prev_lang: Option<i32>,
     primers: Primers,
     /// Có giá trị khi chạy chế độ B.
     #[cfg(feature = "shared-encode")]
@@ -170,20 +169,19 @@
             lid_state,
             n_threads,
             flash_attn,
-            prev_lang: None,
             primers,
             #[cfg(feature = "shared-encode")]
             shared,
         })
     }
 
-    /// `shared` (chế độ B) hoặc `split` (chế độ A).
-    pub fn decode_mode(&self) -> &'static str {
+    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`).
+    pub fn decode_mode(&self) -> DecodeMode {
         #[cfg(feature = "shared-encode")]
         if self.shared.is_some() {
-            return "shared";
-        }
-        "split"
+            return DecodeMode::Shared;
+        }
+        DecodeMode::Split
     }
 
     /// Flash attention có đang bật không. Mặc định tắt, xem `load`.
@@ -208,55 +206,17 @@
         Ok(started.elapsed().as_secs_f32() * 1000.0)
     }
 
-    pub fn transcribe(&mut self, req: &TranscribeRequest) -> Result<TranscribeResult> {
-        // Kiểm đầu vào trước mọi lệnh gọi whisper, cho cả hai chế độ: đầu vào sai trả `Error` qua giao thức chứ không
-        // làm worker chết (whisper-rs panic khi mã ngôn ngữ chứa NUL, mà bản release đặt panic = abort).
-        if req.languages.is_empty() {
-            bail!("danh sách ngôn ngữ rỗng");
-        }
-        if let Some(l) = req.languages.iter().find(|l| l.contains('\0')) {
-            bail!("mã ngôn ngữ chứa ký tự NUL: {l:?}");
-        }
-        if req.pcm.len() < MIN_PCM_SAMPLES {
-            bail!("đoạn quá ngắn: {} mẫu (tối thiểu {MIN_PCM_SAMPLES})", req.pcm.len());
-        }
-        if req.pcm.len() > MAX_PCM_SAMPLES {
-            bail!("đoạn quá dài: {} mẫu (tối đa {MAX_PCM_SAMPLES})", req.pcm.len());
-        }
-        if req.prompt_tokens.len() > MAX_PROMPT_TOKENS {
-            bail!(
-                "prompt quá dài: {} token (tối đa {MAX_PROMPT_TOKENS})",
-                req.prompt_tokens.len()
-            );
-        }
+    /// Chép lời một đoạn. Lỗi trả kèm loại (`ErrorKind`) để app xử lý theo §9: đầu vào sai là `InvalidRequest` và không
+    /// làm worker chết (whisper-rs panic khi mã ngôn ngữ chứa NUL, mà bản release đặt panic = abort).
+    pub fn transcribe(&mut self, req: &TranscribeRequest) -> Result<TranscribeResult, (ErrorKind, anyhow::Error)> {
         let eot = self.ctx.token_eot();
-        if let Some(t) = req.prompt_tokens.iter().find(|&&t| !(0..eot).contains(&t)) {
-            bail!("prompt_tokens có token {t} ngoài khoảng [0, {eot})");
-        }
-        if !(0..=MAX_AUDIO_CTX).contains(&req.audio_ctx) {
-            bail!("audio_ctx {} ngoài khoảng [0, {MAX_AUDIO_CTX}]", req.audio_ctx);
-        }
-        // 0 là cửa sổ đầy đủ 30 giây. Cửa sổ nào ngắn hơn đoạn thì whisper.cpp lặng lẽ bỏ phần đuôi (chế độ B chỉ ra
-        // phần đầu), nên `audio_ctx` phải phủ hết đoạn. Đoạn dài hơn 30 giây đã bị từ chối ở trên, kể cả khi
-        // `audio_ctx` là 0.
-        let window = if req.audio_ctx == 0 {
-            MAX_AUDIO_CTX
-        } else {
-            req.audio_ctx
-        };
-        if window as usize * SAMPLES_PER_CTX < req.pcm.len() {
-            bail!(
-                "audio_ctx {} chỉ phủ {} mẫu, ngắn hơn đoạn ({} mẫu)",
-                req.audio_ctx,
-                window as usize * SAMPLES_PER_CTX,
-                req.pcm.len()
-            );
-        }
-        let allowed = req
-            .languages
-            .iter()
-            .map(|l| whisper_rs::get_lang_id(l).with_context(|| format!("mã ngôn ngữ không hợp lệ: {l}")))
-            .collect::<Result<Vec<i32>>>()?;
+        let (allowed, prev) = validate(req, eot).map_err(|e| (ErrorKind::InvalidRequest, e))?;
+        self.run(req, &allowed, prev)
+            .map_err(|e| (classify(ErrorKind::Internal, &e), e))
+    }
+
+    fn run(&mut self, req: &TranscribeRequest, allowed: &[i32], prev_lang: Option<i32>) -> Result<TranscribeResult> {
+        let eot = self.ctx.token_eot();
         let pcm: Vec<f32> = req.pcm.iter().map(|&s| s as f32 / 32768.0).collect();
 
         #[cfg(feature = "shared-encode")]
@@ -267,14 +227,13 @@
                 &mut self.asr_state,
                 &pcm,
                 req.audio_ctx,
-                &allowed,
-                self.prev_lang,
+                allowed,
+                prev_lang,
                 &req.prompt_tokens,
                 &self.primers,
                 self.n_threads,
             )?;
             let total_ms = started.elapsed().as_secs_f32() * 1000.0;
-            self.prev_lang = Some(d.lang_id);
             return Ok(TranscribeResult {
                 segment_id: req.segment_id,
                 lang: whisper_rs::get_lang_str(d.lang_id)
@@ -300,7 +259,7 @@
                 .pcm_to_mel(head, self.n_threads)
                 .context("tính mel cho nhận diện ngôn ngữ")?;
             let (_, probs) = lid_state.lang_detect(0, self.n_threads).context("nhận diện ngôn ngữ")?;
-            pick_language(&probs, &allowed, self.prev_lang, min_prob_for(pcm.len()))
+            pick_language(&probs, allowed, prev_lang, min_prob_for(pcm.len()))
         };
         let lid_ms = if allowed.len() == 1 {
             0.0
@@ -311,7 +270,9 @@
 
         let asr_started = Instant::now();
         let mut params = full_params(self.n_threads, lang, req.audio_ctx);
-        let context = self.primers.context_for(lang, &req.prompt_tokens);
+        let context = self
+            .primers
+            .context_for(lang, prompt_for(lang_id, prev_lang, &req.prompt_tokens));
         if !context.is_empty() {
             params.set_tokens(context);
         }
@@ -336,7 +297,6 @@
                 }
             }
         }
-        self.prev_lang = Some(lang_id);
         Ok(TranscribeResult {
             segment_id: req.segment_id,
             lang: lang.to_string(),
@@ -348,6 +308,82 @@
             asr_ms,
             avg_logprob: mean_logprob(&logprobs),
         })
+    }
+}
+
+/// Kiểm đầu vào trước mọi lệnh gọi whisper, cho cả hai chế độ. Trả tập ngôn ngữ cho phép (lang id) và ngôn ngữ của đoạn
+/// trước (`prev_lang`), đã đổi sang lang id.
+pub fn validate(req: &TranscribeRequest, eot: i32) -> Result<(Vec<i32>, Option<i32>)> {
+    if req.languages.is_empty() {
+        bail!("danh sách ngôn ngữ rỗng");
+    }
+    if let Some(l) = req.languages.iter().chain(&req.prev_lang).find(|l| l.contains('\0')) {
+        bail!("mã ngôn ngữ chứa ký tự NUL: {l:?}");
+    }
+    if req.pcm.len() < MIN_PCM_SAMPLES {
+        bail!("đoạn quá ngắn: {} mẫu (tối thiểu {MIN_PCM_SAMPLES})", req.pcm.len());
+    }
+    if req.pcm.len() > MAX_PCM_SAMPLES {
+        bail!("đoạn quá dài: {} mẫu (tối đa {MAX_PCM_SAMPLES})", req.pcm.len());
+    }
+    if req.prompt_tokens.len() > MAX_PROMPT_TOKENS {
+        bail!(
+            "prompt quá dài: {} token (tối đa {MAX_PROMPT_TOKENS})",
+            req.prompt_tokens.len()
+        );
+    }
+    if let Some(t) = req.prompt_tokens.iter().find(|&&t| !(0..eot).contains(&t)) {
+        bail!("prompt_tokens có token {t} ngoài khoảng [0, {eot})");
+    }
+    if !(0..=MAX_AUDIO_CTX).contains(&req.audio_ctx) {
+        bail!("audio_ctx {} ngoài khoảng [0, {MAX_AUDIO_CTX}]", req.audio_ctx);
+    }
+    // 0 là cửa sổ đầy đủ 30 giây. Cửa sổ nào ngắn hơn đoạn thì whisper.cpp lặng lẽ bỏ phần đuôi (chế độ B chỉ ra
+    // phần đầu), nên `audio_ctx` phải phủ hết đoạn. Đoạn dài hơn 30 giây đã bị từ chối ở trên, kể cả khi
+    // `audio_ctx` là 0.
+    let window = if req.audio_ctx == 0 {
+        MAX_AUDIO_CTX
+    } else {
+        req.audio_ctx
+    };
+    if window as usize * SAMPLES_PER_CTX < req.pcm.len() {
+        bail!(
+            "audio_ctx {} chỉ phủ {} mẫu, ngắn hơn đoạn ({} mẫu)",
+            req.audio_ctx,
+            window as usize * SAMPLES_PER_CTX,
+            req.pcm.len()
+        );
+    }
+    let lang_id = |l: &String| whisper_rs::get_lang_id(l).with_context(|| format!("mã ngôn ngữ không hợp lệ: {l}"));
+    let allowed = req.languages.iter().map(lang_id).collect::<Result<Vec<i32>>>()?;
+    let prev = req.prev_lang.as_ref().map(lang_id).transpose()?;
+    Ok((allowed, prev))
+}
+
+/// Prompt của app chỉ dùng khi đoạn này cùng ngôn ngữ với đoạn trước: `prompt_tokens` là token của các đoạn trước có
+/// ngôn ngữ `prev_lang` (xem `TranscribeRequest::prompt_tokens`).
+pub fn prompt_for(lang_id: i32, prev_lang: Option<i32>, prompt_tokens: &[i32]) -> &[i32] {
+    if prev_lang == Some(lang_id) { prompt_tokens } else { &[] }
+}
+
+/// Loại lỗi theo nội dung thông báo của whisper.cpp và ggml, vì whisper-rs không phân biệt: hết bộ nhớ (kể cả bộ nhớ GPU)
+/// là `OutOfMemory`, lỗi khởi tạo GPU là `GpuInit`, còn lại là `default`.
+pub fn classify(default: ErrorKind, err: &anyhow::Error) -> ErrorKind {
+    let text = format!("{err:#}").to_lowercase();
+    const OOM: [&str; 5] = [
+        "out of memory",
+        "failed to allocate",
+        "cannot allocate",
+        "outofdevicememory",
+        "insufficient memory",
+    ];
+    if OOM.iter().any(|m| text.contains(m)) {
+        ErrorKind::OutOfMemory
+    } else if (text.contains("metal") || text.contains("vulkan")) && (text.contains("init") || text.contains("device"))
+    {
+        ErrorKind::GpuInit
+    } else {
+        default
     }
 }
 
```

Sửa `crates/asr-worker/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/lib.rs
+++ b/crates/asr-worker/src/lib.rs
@@ -1,5 +1,6 @@
 pub mod backend;
 pub mod engine;
 pub mod lid;
+pub mod platform;
 #[cfg(feature = "shared-encode")]
 pub mod shared;
```

Sửa `crates/asr-worker/src/main.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/main.rs
+++ b/crates/asr-worker/src/main.rs
@@ -1,20 +1,26 @@
 //! Tiến trình phụ `asr-worker`: đọc `Request` từ stdin, ghi `Response` ra stdout (spec §6.4).
-//! stdout chỉ dùng cho khung giao thức; mọi log đều ra stderr. whisper.cpp và ggml tự ghi log ra stderr, nên không
-//! gọi `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).
+//! stdout chỉ dùng cho khung giao thức: ngay khi chạy, worker giữ riêng stdout cho giao thức và trỏ fd 1 sang stderr
+//! (`platform::protocol_stdout`), nên log lạ của thư viện C không lọt vào kênh giao thức. whisper.cpp và ggml tự ghi log ra
+//! stderr, nên không gọi `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log
+//! (kể cả lỗi GPU).
 
 use anyhow::Result;
-use asr_protocol::{Request, Response, read_frame, write_frame};
-use asr_worker::engine::Engine;
+use asr_protocol::{ErrorKind, PROTOCOL_VERSION, Request, Response, read_frame, write_frame};
+use asr_worker::backend::real_backend;
+use asr_worker::engine::{Engine, classify};
 use std::io::{BufReader, BufWriter};
 
 /// Vòng lặp giao thức. Mọi lỗi đọc khung (I/O, khung quá lớn, `Codec`, `TrailingBytes`) đều làm worker thoát ngay với
 /// mã 1, kể cả khi luồng vẫn còn đồng bộ (`Codec`, `TrailingBytes`). App tự khởi động lại worker, nên không cố đọc tiếp.
 fn main() -> Result<()> {
+    #[cfg(windows)]
+    asr_worker::platform::harden_dll_search()?;
     if std::env::args().any(|a| a == "--probe") {
         return probe();
     }
+    let protocol = asr_worker::platform::protocol_stdout()?;
     let mut input = BufReader::new(std::io::stdin().lock());
-    let mut output = BufWriter::new(std::io::stdout().lock());
+    let mut output = BufWriter::new(protocol);
     let mut engine: Option<Engine> = None;
 
     while let Some(request) = read_frame::<_, Request>(&mut input)? {
@@ -25,17 +31,19 @@
                 n_threads,
             } => match Engine::load(&model_path, use_gpu, n_threads) {
                 Ok(e) => {
-                    let backend = backend_name(use_gpu);
+                    let backend = real_backend(use_gpu);
                     eprintln!(
-                        "asr-worker: backend={backend} flash_attn={} decode_mode={}",
+                        "asr-worker: backend={} flash_attn={} decode_mode={}",
+                        backend.as_str(),
                         if e.flash_attn() { "on" } else { "off" },
-                        e.decode_mode()
+                        e.decode_mode().as_str()
                     );
                     // Dòng riêng, để dòng trên giữ nguyên định dạng cũ (các phép kiểm log tìm đúng dòng đó).
                     eprintln!("asr-worker: primer={}", if e.primer_enabled() { "on" } else { "off" });
                     let ready = Response::Ready {
-                        backend: backend.to_string(),
-                        decode_mode: e.decode_mode().to_string(),
+                        protocol_version: PROTOCOL_VERSION,
+                        backend,
+                        decode_mode: e.decode_mode(),
                         whisper_version: whisper_rs::WHISPER_CPP_VERSION.to_string(),
                         system_info: whisper_rs::print_system_info().to_string(),
                     };
@@ -44,6 +52,7 @@
                 }
                 Err(e) => Response::Error {
                     segment_id: None,
+                    kind: classify(ErrorKind::ModelLoad, &e),
                     message: format!("{e:#}"),
                 },
             },
@@ -52,6 +61,7 @@
                     Ok(millis) => Response::WarmupDone { millis },
                     Err(err) => Response::Error {
                         segment_id: None,
+                        kind: classify(ErrorKind::Internal, &err),
                         message: format!("{err:#}"),
                     },
                 },
@@ -60,8 +70,9 @@
             Request::Transcribe(req) => match engine.as_mut() {
                 Some(e) => match e.transcribe(&req) {
                     Ok(result) => Response::Result(result),
-                    Err(err) => Response::Error {
+                    Err((kind, err)) => Response::Error {
                         segment_id: Some(req.segment_id),
+                        kind,
                         message: format!("{err:#}"),
                     },
                 },
@@ -77,15 +88,8 @@
 fn not_loaded(segment_id: Option<u64>) -> Response {
     Response::Error {
         segment_id,
+        kind: ErrorKind::NotLoaded,
         message: "chưa nạp model".into(),
-    }
-}
-
-fn backend_name(use_gpu: bool) -> &'static str {
-    match (use_gpu, cfg!(feature = "metal"), cfg!(feature = "vulkan")) {
-        (true, true, _) => "metal",
-        (true, _, true) => "vulkan",
-        _ => "cpu",
     }
 }
 
```

Tạo `crates/asr-worker/src/platform.rs`:

```rust
//! Phần phụ thuộc hệ điều hành của `asr-worker`.
//!
//! - `protocol_stdout`: stdout chỉ dành cho khung giao thức (spec §6.4, "Việc cho MVP"). whisper.cpp, ggml hay driver GPU
//!   có thể in ra fd 1 và làm hỏng kênh giao thức, nên worker giữ một bản sao của stdout cho giao thức rồi trỏ fd 1 sang
//!   stderr (log).
//! - `harden_dll_search` (Windows): chỉ nạp DLL từ thư mục của chính worker và System32 (spec §10.2, "Thay tiến trình phụ,
//!   hoặc chèn thư viện giả").

use std::fs::File;
use std::io;

/// Trả `File` ghi vào stdout gốc (pipe giao thức với app), và từ đây mọi thứ in ra stdout, kể cả `println!`, đi sang
/// stderr. Gọi một lần, trước khi nạp model.
#[cfg(unix)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::fd::FromRawFd;
    // SAFETY: `dup` và `dup2` chỉ thao tác trên bảng fd của tiến trình. `fd` mới thuộc quyền `File` trả về, không nơi
    // nào khác đóng nó.
    unsafe {
        let fd = libc::dup(libc::STDOUT_FILENO);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(libc::STDERR_FILENO, libc::STDOUT_FILENO) < 0 {
            let err = io::Error::last_os_error();
            libc::close(fd);
            return Err(err);
        }
        Ok(File::from_raw_fd(fd))
    }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Handle = *mut c_void;
    pub const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    pub const STD_ERROR_HANDLE: u32 = -12i32 as u32;
    pub const DUPLICATE_SAME_ACCESS: u32 = 0x0000_0002;
    pub const LOAD_LIBRARY_SEARCH_APPLICATION_DIR: u32 = 0x0000_0200;
    pub const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn GetStdHandle(which: u32) -> Handle;
        pub fn SetStdHandle(which: u32, handle: Handle) -> i32;
        pub fn GetCurrentProcess() -> Handle;
        pub fn DuplicateHandle(
            source_process: Handle,
            source: Handle,
            target_process: Handle,
            target: *mut Handle,
            access: u32,
            inherit: i32,
            options: u32,
        ) -> i32;
        pub fn SetDefaultDllDirectories(flags: u32) -> i32;
    }
}

/// Bản Windows: sao handle của pipe stdout cho giao thức; CRT fd 1 (nơi `printf` của whisper.cpp ghi) và handle chuẩn
/// của Win32 (nơi `println!` ghi) đều trỏ sang stderr.
#[cfg(windows)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::windows::io::FromRawHandle;
    // SAFETY: các hàm Win32 và CRT ở đây chỉ đọc hay đổi bảng handle của chính tiến trình. `copy` là handle mới, thuộc
    // quyền `File` trả về; handle gốc vẫn do CRT giữ và đóng khi `dup2` trỏ fd 1 sang stderr.
    unsafe {
        let original = win::GetStdHandle(win::STD_OUTPUT_HANDLE);
        let process = win::GetCurrentProcess();
        let mut copy: win::Handle = std::ptr::null_mut();
        if win::DuplicateHandle(process, original, process, &mut copy, 0, 0, win::DUPLICATE_SAME_ACCESS) == 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(2, 1) < 0 {
            return Err(io::Error::last_os_error());
        }
        if win::SetStdHandle(win::STD_OUTPUT_HANDLE, win::GetStdHandle(win::STD_ERROR_HANDLE)) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(File::from_raw_handle(copy))
    }
}

/// Windows: bỏ thư mục hiện tại và `PATH` khỏi đường tìm DLL (spec §10.2). Gọi đầu tiên trong `main`.
#[cfg(windows)]
pub fn harden_dll_search() -> io::Result<()> {
    // SAFETY: chỉ đổi cờ tìm DLL của tiến trình.
    let ok = unsafe {
        win::SetDefaultDllDirectories(win::LOAD_LIBRARY_SEARCH_APPLICATION_DIR | win::LOAD_LIBRARY_SEARCH_SYSTEM32)
    };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}
```

Sửa `crates/asr-worker/src/shared.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/shared.rs
+++ b/crates/asr-worker/src/shared.rs
@@ -3,7 +3,7 @@
 //! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
 //! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.
 
-use crate::engine::{Primers, mean_logprob};
+use crate::engine::{Primers, mean_logprob, prompt_for};
 use crate::lid::{min_prob_for, pick_language};
 use anyhow::{Context, Result};
 use asr_protocol::{MAX_PROMPT_TOKENS, SAMPLE_RATE};
@@ -131,7 +131,7 @@
         n_threads: usize,
     ) -> Result<Decoded> {
         state.pcm_to_mel(pcm, n_threads)?;
-        state.set_audio_ctx(audio_ctx);
+        state.set_audio_ctx(audio_ctx).context("đặt audio_ctx")?;
         state.encode(0, n_threads)?;
 
         // Một bước decoder sau [SOT] cho cả xác suất ngôn ngữ lẫn xác suất "không có tiếng nói".
@@ -160,9 +160,10 @@
             lid_started.elapsed().as_secs_f32() * 1000.0
         };
 
-        // Prompt của client nếu có, không thì câu mồi của ngôn ngữ vừa chọn (zh, ja): xem `Primers`.
+        // Prompt của client nếu đoạn này cùng ngôn ngữ với đoạn trước, không thì câu mồi của ngôn ngữ vừa chọn (zh, ja):
+        // xem `Primers` và `engine::prompt_for`.
         let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;
-        let context = primers.context_for(lang, prompt_tokens);
+        let context = primers.context_for(lang, prompt_for(lang_id, prev_lang, prompt_tokens));
         let mut prompt = Vec::with_capacity(context.len().min(MAX_PROMPT_TOKENS) + 5);
         if !context.is_empty() {
             prompt.push(ctx.token_prev());
```

Sửa `crates/latency-bench/src/asr_eval.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/asr_eval.rs
+++ b/crates/latency-bench/src/asr_eval.rs
@@ -99,12 +99,18 @@
     worker.warmup()?;
     println!(
         "asr: {} ({}), chế độ giải mã {}\n{}",
-        ready.backend, ready.whisper_version, ready.decode_mode, ready.system_info
+        ready.backend.as_str(),
+        ready.whisper_version,
+        ready.decode_mode.as_str(),
+        ready.system_info
     );
     let manifest = std::fs::File::open(&args.manifest)
         .with_context(|| format!("không mở được manifest {}", args.manifest.display()))?;
     let mut out =
         BufWriter::new(std::fs::File::create(&part).with_context(|| format!("không tạo được {}", part.display()))?);
+    // Ngôn ngữ của clip trước: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ, để mốc A4 so được với lượt mới
+    // (chỉ có tác dụng ở clip có xác suất ngôn ngữ dưới 0,5, cột `lid_fallback` của score_asr.py).
+    let mut prev_lang: Option<String> = None;
     for (i, line) in BufReader::new(manifest).lines().enumerate() {
         let n = i + 1; // số dòng trong manifest
         let line = line.with_context(|| format!("manifest dòng {n}"))?;
@@ -151,8 +157,10 @@
                 languages,
                 prompt_tokens: Vec::new(),
                 audio_ctx,
+                prev_lang: prev_lang.clone(),
             })
             .with_context(|| format!("clip {} (dòng {n})", clip.id))?;
+        prev_lang = Some(r.lang.clone());
         let ipc_ms = started.elapsed().as_secs_f32() * 1000.0 - r.lid_ms - r.asr_ms;
         let row = Output {
             id: clip.id,
@@ -168,7 +176,7 @@
             audio_ms,
             audio_ctx,
             n_tokens: r.tokens.len(),
-            decode_mode: ready.decode_mode.clone(),
+            decode_mode: ready.decode_mode.as_str().to_string(),
         };
         writeln!(out, "{}", serde_json::to_string(&row)?)?;
         if n % 20 == 0 {
```

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -242,7 +242,9 @@
     llama.translate(&translation_prompt("Hello.", Lang::En, target), 32)?; // làm nóng
     println!(
         "asr: {} ({}), chế độ giải mã {}, làm nóng {asr_warmup_ms:.0} ms",
-        ready.backend, ready.whisper_version, ready.decode_mode
+        ready.backend.as_str(),
+        ready.whisper_version,
+        ready.decode_mode.as_str()
     );
 
     kill_children_on_panic(vec![asr.pid(), llama.pid()]);
@@ -266,6 +268,9 @@
     let merge_window = merge_window_ms(args.end_silence_ms);
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
+        // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
+        // để số đo S6 không đổi khi `prev_lang` chuyển sang `TranscribeRequest`.
+        let mut prev_lang: Option<String> = None;
         for (segment, closed_at_ms) in seg_rx {
             let mut rec = SegmentRecord {
                 id: segment.id,
@@ -299,8 +304,10 @@
                 pcm,
                 languages: languages.clone(),
                 prompt_tokens,
+                prev_lang: prev_lang.clone(),
             })?;
             rec.asr_done_at_ms = now_ms();
+            prev_lang = Some(result.lang.clone());
             let tokens = prompts.entry(result.lang.clone()).or_default();
             tokens.extend(&result.tokens);
             let excess = tokens.len().saturating_sub(MAX_PROMPT_TOKENS);
@@ -410,8 +417,8 @@
         label: args.label.clone(),
         machine: machine_info(),
         config: HashMap::from([
-            ("asr_backend".to_string(), ready.backend),
-            ("asr_decode_mode".to_string(), ready.decode_mode),
+            ("asr_backend".to_string(), ready.backend.as_str().to_string()),
+            ("asr_decode_mode".to_string(), ready.decode_mode.as_str().to_string()),
             ("whisper_version".to_string(), ready.whisper_version),
             ("asr_system_info".to_string(), ready.system_info),
             ("asr_model".to_string(), public_path(&args.asr_model)),
```

Sửa `crates/pipeline/src/asr_client.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/asr_client.rs
+++ b/crates/pipeline/src/asr_client.rs
@@ -1,7 +1,10 @@
 //! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).
 
 use anyhow::{Context, Result, bail};
-use asr_protocol::{Request, Response, TranscribeRequest, TranscribeResult, read_frame, write_frame};
+use asr_protocol::{
+    Backend, DecodeMode, PROTOCOL_VERSION, Request, Response, TranscribeRequest, TranscribeResult, read_frame,
+    write_frame,
+};
 use std::fs::OpenOptions;
 use std::io::{BufReader, BufWriter};
 use std::path::{Path, PathBuf};
@@ -12,9 +15,10 @@
 const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
 
 pub struct ReadyInfo {
-    pub backend: String,
-    /// `shared` (chế độ B) hoặc `split` (chế độ A), spec §6.4.
-    pub decode_mode: String,
+    /// Thiết bị worker thật sự dùng (spec §6.4), không phải thiết bị được yêu cầu.
+    pub backend: Backend,
+    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`), spec §6.4.
+    pub decode_mode: DecodeMode,
     pub whisper_version: String,
     pub system_info: String,
 }
@@ -61,12 +65,19 @@
             use_gpu,
             n_threads,
         };
-        match worker.call(&load)? {
+        match worker
+            .call(&load)
+            .context("asr-worker không trả lời `Load` (có thể lệch phiên bản giao thức)")?
+        {
+            Response::Ready { protocol_version, .. } if protocol_version != PROTOCOL_VERSION => bail!(
+                "asr-worker dùng giao thức phiên bản {protocol_version}, app cần {PROTOCOL_VERSION}: build lại cả hai cùng lúc"
+            ),
             Response::Ready {
                 backend,
                 decode_mode,
                 whisper_version,
                 system_info,
+                ..
             } => Ok((
                 worker,
                 ReadyInfo {
```

Sửa `deny.toml` (áp bằng `git apply`):

```diff
--- a/deny.toml
+++ b/deny.toml
@@ -43,7 +43,7 @@
 wildcards = "allow"
 # Bất biến kiến trúc (spec §5, §6.12): chỉ asr-worker được link whisper.cpp (ggml); tiến trình chính thì không.
 deny = [
-    { crate = "whisper-rs-sys", wrappers = ["whisper-rs"], reason = "ggml chỉ được vào qua whisper-rs" },
+    { crate = "whisper-rs-sys", wrappers = ["whisper-rs", "asr-worker"], reason = "ggml chỉ được vào qua whisper-rs, hoặc asr-worker đọc bảng thiết bị ggml" },
     { crate = "whisper-rs", wrappers = ["asr-worker"], reason = "chỉ asr-worker được link whisper.cpp" },
 ]
 
```

- [ ] **Step 6: Chạy test, thấy xanh**

Run: `cargo test -p asr-protocol`
Expected:

```text
test result: ok. 21 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Run: `cargo test -p asr-worker`, rồi `cargo test -p asr-worker --features shared-encode`
Expected (lần lượt: unit test, `protocol.rs`, `audio_ctx_patch.rs` bị bỏ qua vì cần model, `stdout_isolation.rs` chạy không qua harness):

```text
test result: ok. 21 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.71s
test stdout_isolation ... ok
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/asr_worker-331f109be0cbec28)
     Running unittests src/main.rs (target/debug/deps/asr_worker-5637d463bfeb42a1)
     Running tests/audio_ctx_patch.rs (target/debug/deps/audio_ctx_patch-3aa55e37b3478ba4)
     Running tests/protocol.rs (target/debug/deps/protocol-6512997053a1cda3)
     Running tests/stdout_isolation.rs (target/debug/deps/stdout_isolation-a362b99fd8f50f55)
```

```text
test result: ok. 35 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s
test stdout_isolation ... ok
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Run: `cargo test -p pipeline -p latency-bench`
Expected: mọi test cũ vẫn qua:

```text
test result: ok. 40 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test result: ok. 37 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

- [ ] **Step 7: Build bản release và chạy test bản vá với model thật**

Run: `cargo build --release -p asr-worker --features metal,shared-encode`
Expected: dòng cuối `Finished \`release\` profile [optimized] target(s) in …`.

Run: `WHISPER_TEST_MODEL=$PWD/models/ggml-small-q5_1.bin cargo test -p asr-worker --test audio_ctx_patch -- --include-ignored`
Expected:

```text
test out_of_range_audio_ctx_is_rejected ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.07s
```

- [ ] **Step 8: Clippy, định dạng, cargo deny**

Run:
```bash
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo fmt --all -- --check
cargo deny check bans licenses
```
Expected: không có cảnh báo của clippy (chỉ còn cảnh báo `unused_mut` có sẵn trong build script của `third_party/whisper-rs-sys`), `cargo fmt` không in gì, và:

```text
bans ok, licenses ok
```

- [ ] **Step 9: Commit**

`third_party/` cần `git add -f`, vì `.gitignore` của whisper-rs chặn `Cargo.lock` của nó (`third_party/README.md`).

```bash
git add -f third_party
git add Cargo.lock deny.toml crates/asr-protocol crates/asr-worker crates/latency-bench/src/asr_eval.rs \
  crates/latency-bench/src/latency.rs crates/pipeline/src/asr_client.rs
git commit -m "feat(asr): giao thức asr-worker bản 2 (§6.4, Việc cho MVP)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Luật cắt câu, ghép câu và bỏ đoạn vào `pipeline`

Chuyển nguyên luật của `latency-bench` sang `pipeline` (Đ3), để app và công cụ đo S6 dùng đúng một bản (dòng 96, 97, 114, 281, 285):
- `config.rs`: mọi ngưỡng của pipeline trong `PipelineConfig` (QĐ21). Task này dùng phần segmenter, ghép câu và lọc; các phần khác dùng ở task sau.
- `sentence.rs`: ghép câu và phụ đề tạm (§6.3): dấu câu kết thúc, cửa sổ ghép `max(700, vadEndSilenceMs + 400)` ms, chỉ ghép cùng ngôn ngữ, zh và ja nối không dấu cách, trần 15 giây hoặc 3 đoạn.
- `filter.rs`: luật bỏ đoạn theo `no_speech_prob` và `avg_logprob`, độ dài đoạn gửi cho worker.
- `segmenter.rs`: thêm `Serialize`/`Deserialize` cho `SegmenterConfig`, để nằm trong `PipelineConfig`.
- `latency-bench` gọi các hàm trên thay cho bản chép của nó. Test `phase0_s6_decisions_replay_identically` đọc lại 12 lượt S6 đã commit (`bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json`) và kiểm luật mới cho đúng từng quyết định cũ: bỏ đoạn nào, ghép bao nhiêu đoạn, dịch câu nào.

**Files:**
- Sửa: `crates/latency-bench/src/latency.rs`
- Tạo: `crates/pipeline/src/config.rs`
- Tạo: `crates/pipeline/src/filter.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/segmenter.rs`
- Tạo: `crates/pipeline/src/sentence.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -1,6 +1,9 @@
 pub mod asr_client;
+pub mod config;
+pub mod filter;
 pub mod llama;
 pub mod prompt;
 pub mod segmenter;
+pub mod sentence;
 pub mod sse;
 pub mod vad;
```

- [ ] **Step 2: Viết test**

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -1041,46 +1041,23 @@
     }
 
     #[test]
-    fn segments_outside_the_worker_range_are_not_sent() {
-        assert_eq!(pcm_skip_reason(0), Some("too_short"));
-        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES - 1), Some("too_short"));
-        assert_eq!(pcm_skip_reason(MIN_PCM_SAMPLES), None);
-        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES), None);
-        assert_eq!(pcm_skip_reason(MAX_PCM_SAMPLES + 1), Some("too_long"));
+    fn pcm_skip_reasons_keep_their_phase0_names() {
+        assert_eq!(skip_name(PcmSkip::TooShort), "too_short");
+        assert_eq!(skip_name(PcmSkip::TooLong), "too_long");
     }
 
     #[test]
     fn route_follows_the_app_rules() {
-        assert_eq!(route(&rec("en", "Hello", 0.0, -0.3), Lang::Vi), Ok(Lang::En));
-        assert_eq!(route(&rec("en", "", 0.0, 0.0), Lang::Vi), Err("no_speech".into()));
-        assert_eq!(route(&rec("en", " \n", 0.0, -0.3), Lang::Vi), Err("no_speech".into()));
-        assert_eq!(
-            route(&rec("vi", "Xin chào", 0.0, -0.3), Lang::Vi),
-            Err("same_lang".into())
-        );
-        assert_eq!(
-            route(&rec("fr", "Bonjour", 0.0, -0.3), Lang::Vi),
-            Err("lang_ngoai_tap:fr".into())
-        );
-    }
-
-    #[test]
-    fn no_speech_needs_both_a_high_no_speech_prob_and_a_low_avg_logprob() {
-        let drops = |no_speech: f32, logprob: f32| route(&rec("ko", "안녕", no_speech, logprob), Lang::Vi).is_err();
-        // Luật của OpenAI Whisper: bỏ khi cả hai điều kiện cùng đúng.
-        assert!(drops(0.9, -1.5));
-        // `no_speech` cao mà chữ chắc chắn (câu tiếng Hàn đúng có no_speech 0,62 và avg_logprob −0,25): giữ.
-        assert!(!drops(0.62, -0.25));
-        assert!(!drops(1.0, -0.5));
-        // `no_speech` thấp mà chữ kém chắc chắn: giữ (turbo có no_speech khoảng 1e-11 nên không bao giờ bị bỏ).
-        assert!(!drops(0.0, -3.0));
-        assert!(!drops(1e-11, -3.0));
-        // Biên: đúng 0,6 chưa quá ngưỡng, đúng −1,0 chưa dưới ngưỡng.
-        assert!(!drops(0.6, -1.5));
-        assert!(!drops(0.9, -1.0));
-        assert!(drops(0.61, -1.01));
-        // Lý do bỏ vẫn tên `no_speech`.
-        assert_eq!(route(&rec("ko", "안녕", 0.9, -1.5), Lang::Vi), Err("no_speech".into()));
+        let cfg = FilterConfig::default();
+        let route = |r: &SegmentRecord| route(r, Lang::Vi, &cfg);
+        assert_eq!(route(&rec("en", "Hello", 0.0, -0.3)), Ok(Lang::En));
+        assert_eq!(route(&rec("en", "", 0.0, 0.0)), Err("no_speech".into()));
+        assert_eq!(route(&rec("en", " \n", 0.0, -0.3)), Err("no_speech".into()));
+        // Luật `no_speech` của pipeline (cần cả hai điều kiện), đặt tên lý do như Giai đoạn 0.
+        assert_eq!(route(&rec("ko", "안녕", 0.9, -1.5)), Err("no_speech".into()));
+        assert_eq!(route(&rec("ko", "안녕", 0.62, -0.25)), Ok(Lang::Ko));
+        assert_eq!(route(&rec("vi", "Xin chào", 0.0, -0.3)), Err("same_lang".into()));
+        assert_eq!(route(&rec("fr", "Bonjour", 0.0, -0.3)), Err("lang_ngoai_tap:fr".into()));
     }
 
     #[test]
@@ -1236,157 +1213,13 @@
     }
 
     #[test]
-    fn merge_window_is_measured_from_speech_end_to_next_speech_start() {
-        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), Lang::En);
-        // Hết tiếng ở 4 000 ms: bắt đầu nói lại ở 4 700 là đúng cửa sổ 700 ms, ở 4 701 là quá 1 ms.
-        assert!(open.accepts(&piece(4_700, 6_000, "the market"), 700));
-        assert!(!open.accepts(&piece(4_701, 6_000, "the market"), 700));
-    }
-
-    #[test]
     fn padding_does_not_widen_the_window() {
         // `audio_ms` gồm đệm 2 × 224 ms; cửa sổ chỉ tính theo mốc tiếng nói `start_ms` và `end_ms`.
-        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), Lang::En);
+        let cfg = PipelineConfig::default().merge;
+        let open = OpenSentence::new(&piece_of(&piece(1_000, 4_000, "so we went to")), &cfg);
         let next = piece(4_701, 6_000, "the market");
         assert!(next.audio_ms > next.end_ms - next.start_ms);
-        assert!(!open.accepts(&next, 700));
-    }
-
-    #[test]
-    fn forced_cut_pieces_touch_and_merge() {
-        // Cắt cưỡng bức ở 8 giây: đoạn sau bắt đầu đúng chỗ đoạn trước kết thúc, khoảng cách bằng 0.
-        let open = OpenSentence::new(&piece(0, 8_000, "a long sentence that"), Lang::En);
-        assert!(open.accepts(&piece(8_000, 12_000, "keeps going"), 700));
-    }
-
-    #[test]
-    fn merge_window_follows_end_silence() {
-        assert_eq!(merge_window_ms(200), 700);
-        assert_eq!(merge_window_ms(300), 700);
-        assert_eq!(merge_window_ms(301), 701);
-        assert_eq!(merge_window_ms(800), 1_200);
-    }
-
-    #[test]
-    fn sentence_is_capped_at_three_segments() {
-        let mut open = OpenSentence::new(&piece(0, 2_000, "one"), Lang::En);
-        let two = piece(2_100, 4_000, "two");
-        let three = piece(4_100, 6_000, "three");
-        assert!(open.accepts(&two, 700));
-        open.push(&two);
-        assert!(open.accepts(&three, 700)); // mới 2 đoạn: còn chỗ
-        open.push(&three);
-        assert_eq!(open.segments, 3);
-        assert!(!open.accepts(&piece(6_100, 7_000, "four"), 700)); // đủ 3 đoạn: đoạn sau mở câu mới
-    }
-
-    #[test]
-    fn sentence_is_capped_at_15_seconds_of_speech() {
-        let open = OpenSentence::new(&piece(0, 8_000, "x"), Lang::En); // 8 giây tiếng nói
-        assert!(open.accepts(&piece(8_100, 15_000, "y"), 700)); // tổng 14,9 giây
-        assert!(open.accepts(&piece(8_100, 15_100, "y"), 700)); // đúng 15 giây: còn được
-        assert!(!open.accepts(&piece(8_100, 15_101, "y"), 700)); // 15,001 giây: quá trần
-    }
-
-    #[test]
-    fn speech_duration_counts_only_speech_not_the_pauses_between_pieces() {
-        let mut open = OpenSentence::new(&piece(0, 5_000, "x"), Lang::En);
-        open.push(&piece(5_600, 10_600, "y")); // hai khoảng nói 5 giây, nghỉ 0,6 giây: tiếng nói 10 giây
-        assert!(open.accepts(&piece(11_200, 16_200, "z"), 700)); // 10 + 5 = 15 giây tiếng nói, dù cả câu trải 16,2 giây
-    }
-
-    #[test]
-    fn terminal_punctuation_closes_the_sentence() {
-        for end in [".", "?", "!", "。", "？", "！", ". ", "?\n"] {
-            let open = OpenSentence::new(&piece(0, 2_000, &format!("đã xong{end}")), Lang::En);
-            assert!(!open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
-        }
-        for end in ["", ",", ";", ":", "，", "、", " và"] {
-            let open = OpenSentence::new(&piece(0, 2_000, &format!("còn tiếp{end}")), Lang::En);
-            assert!(open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
-        }
-    }
-
-    #[test]
-    fn only_the_last_piece_decides_whether_the_sentence_is_closed() {
-        let mut open = OpenSentence::new(&piece(0, 2_000, "Xong rồi."), Lang::En);
-        assert!(!open.accepts(&piece(2_100, 3_000, "tiếp"), 700));
-        // Câu mở mà đoạn đầu có dấu chấm giữa chừng (ví dụ "Mr. Smith") vẫn ghép tiếp nếu đoạn cuối không có.
-        open = OpenSentence::new(&piece(0, 2_000, "Mr. Smith said"), Lang::En);
-        open.push(&piece(2_100, 3_000, "that it was done."));
-        assert!(!open.accepts(&piece(3_100, 4_000, "next"), 700));
-    }
-
-    #[test]
-    fn different_language_does_not_merge() {
-        let open = OpenSentence::new(&piece(0, 2_000, "hello"), Lang::En);
-        let mut next = piece(2_100, 3_000, "xin chào");
-        next.lang = "vi".into();
-        assert!(!open.accepts(&next, 700));
-    }
-
-    #[test]
-    fn merged_source_is_the_whole_sentence() {
-        let mut open = None;
-        let a = piece(0, 3_000, "We walked to the");
-        let b = piece(3_400, 6_000, "market yesterday.");
-        let c = piece(6_200, 8_000, "Then we ate.");
-        assert_eq!(
-            plan_merge(&mut open, &a, Lang::En, 700),
-            (1, "We walked to the".to_string())
-        );
-        assert_eq!(
-            plan_merge(&mut open, &b, Lang::En, 700),
-            (2, "We walked to the market yesterday.".to_string())
-        );
-        // `b` kết thúc bằng dấu chấm: câu đã chốt, `c` mở câu mới.
-        assert_eq!(
-            plan_merge(&mut open, &c, Lang::En, 700),
-            (1, "Then we ate.".to_string())
-        );
-    }
-
-    #[test]
-    fn a_piece_outside_the_window_starts_a_new_sentence() {
-        let mut open = None;
-        plan_merge(&mut open, &piece(0, 3_000, "first part"), Lang::En, 700);
-        let late = piece(3_701, 5_000, "second part");
-        assert_eq!(
-            plan_merge(&mut open, &late, Lang::En, 700),
-            (1, "second part".to_string())
-        );
-    }
-
-    #[test]
-    fn chinese_and_japanese_join_without_a_space() {
-        for (lang, code) in [(Lang::Zh, "zh"), (Lang::Ja, "ja")] {
-            let mut open = None;
-            let mut a = piece(0, 3_000, "我们走到 ");
-            let mut b = piece(3_200, 5_000, " 市场");
-            (a.lang, b.lang) = (code.into(), code.into());
-            plan_merge(&mut open, &a, lang, 700);
-            assert_eq!(
-                plan_merge(&mut open, &b, lang, 700),
-                (2, "我们走到市场".to_string()),
-                "{code}"
-            );
-        }
-    }
-
-    #[test]
-    fn other_languages_join_with_one_space() {
-        for (lang, code) in [(Lang::En, "en"), (Lang::Ko, "ko"), (Lang::Vi, "vi")] {
-            let mut open = None;
-            let mut a = piece(0, 3_000, "một hai ");
-            let mut b = piece(3_200, 5_000, " ba bốn");
-            (a.lang, b.lang) = (code.into(), code.into());
-            plan_merge(&mut open, &a, lang, 700);
-            assert_eq!(
-                plan_merge(&mut open, &b, lang, 700),
-                (2, "một hai ba bốn".to_string()),
-                "{code}"
-            );
-        }
+        assert!(!open.accepts(&piece_of(&next), 700));
     }
 
     #[test]
@@ -1545,4 +1378,68 @@
         let utterances = utterance_latencies(&[utt("a", 1_000), utt("b", 2_000)], &segments, Lang::Vi);
         assert_eq!(build_summary(&utterances, &segments)["skipped_lang_ngoai_tap"], 2.0);
     }
-}
+
+    /// Luật bỏ đoạn và ghép câu đã chuyển sang `pipeline` (Đ3 của kế hoạch 00) cho đúng các quyết định của 12 lượt S6 cấu
+    /// hình chốt, `bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json`: cùng lý do bỏ đoạn, cùng số đoạn ghép và
+    /// cùng chữ nguồn đã gửi dịch, đoạn nào cũng vậy. Nhờ đó số đo S6 của lượt chốt vẫn là số đo của luật hiện tại.
+    #[test]
+    fn phase0_s6_decisions_replay_identically() {
+        #[derive(Deserialize)]
+        struct Saved {
+            config: HashMap<String, String>,
+            segments: Vec<SegmentRecord>,
+        }
+        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bench/phase0/results/latency");
+        let cfg = PipelineConfig::default();
+        let (mut files, mut checked, mut merged_pieces) = (0, 0, 0);
+        for entry in std::fs::read_dir(&dir).unwrap() {
+            let path = entry.unwrap().path();
+            let name = path.file_name().unwrap().to_string_lossy().into_owned();
+            if !name.starts_with("m4pro-chot-khuyennghi-") {
+                continue;
+            }
+            let saved: Saved = serde_json::from_reader(std::fs::File::open(&path).unwrap()).unwrap();
+            let target = Lang::from_code(&saved.config["target"]).unwrap();
+            let end_silence: u64 = saved.config["end_silence_ms"].parse().unwrap();
+            let window = merge_window_ms(end_silence, &cfg.merge);
+            assert_eq!(window.to_string(), saved.config["merge_window_ms"], "{name}");
+            let mut segments = saved.segments;
+            segments.sort_by_key(|s| s.id);
+            let mut open = None;
+            for rec in &segments {
+                if matches!(rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG)) {
+                    continue; // không qua asr-worker, luồng MT không xét
+                }
+                let at = format!("{name}, đoạn {}", rec.id);
+                match route(rec, target, &cfg.filter) {
+                    Err(reason) => {
+                        if !is_dropped(&reason) {
+                            open = None;
+                        }
+                        assert_eq!(rec.skipped.as_deref(), Some(reason.as_str()), "{at}");
+                    }
+                    Ok(_) => {
+                        let (merged, source) = plan_merge(&mut open, &piece_of(rec), window, &cfg.merge);
+                        // `empty_translation` được ghi sau khi dịch: đoạn đó vẫn đi qua bước ghép câu.
+                        assert!(
+                            matches!(rec.skipped.as_deref(), None | Some(SKIP_EMPTY_TRANSLATION)),
+                            "{at}: {:?}",
+                            rec.skipped
+                        );
+                        assert_eq!(rec.merged_segments, Some(merged), "{at}");
+                        assert_eq!(rec.translated_source.as_deref(), Some(source.as_str()), "{at}");
+                        merged_pieces += usize::from(merged > 1);
+                    }
+                }
+                checked += 1;
+            }
+            files += 1;
+        }
+        assert_eq!(files, 12, "đủ 12 lượt: 2 gói × 6 session");
+        println!("{files} lượt, {checked} đoạn, {merged_pieces} lần ghép");
+        assert!(
+            checked > 400 && merged_pieces > 50,
+            "{checked} đoạn, {merged_pieces} lần ghép"
+        );
+    }
+}
```

Tạo `crates/pipeline/src/config.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Ngưỡng của pipeline, gom vào một chỗ (spec §6.3–§6.5, §7, §9). Giá trị mặc định là số đã chốt ở Giai đoạn 0.
//!
//! Kế hoạch 04 nạp các ngưỡng này từ manifest đã ký: mọi struct đều `#[serde(default)]`, nên manifest chỉ cần ghi khóa
//! muốn đổi, khóa lạ bị bỏ qua (manifest mới hơn app). Sau khi nạp, gọi [`PipelineConfig::validate`]; lỗi thì giữ mặc
//! định. `vadEndSilenceMs` của người dùng (200–800 ms) không nằm ở đây: session ghi đè `segmenter.end_silence_ms`.

#[cfg(test)]
mod tests {
    use super::*;

    /// Ghim số đã chốt ở spec: đổi mặc định mà không sửa spec thì test đỏ.
    #[test]
    fn defaults_are_the_numbers_of_the_spec() {
        let c = PipelineConfig::default();
        let s = &c.segmenter;
        assert_eq!(
            (
                s.threshold,
                s.min_speech_ms,
                s.end_silence_ms,
                s.max_segment_ms,
                s.force_cut_window_ms,
                s.pad_ms
            ),
            (0.5, 250, 300, 8_000, 1_500, 200)
        );
        let m = &c.merge;
        assert_eq!(
            (m.window_min_ms, m.window_extra_ms, m.max_speech_ms, m.max_segments),
            (700, 400, 15_000, 3)
        );
        assert_eq!((c.filter.no_speech_prob_max, c.filter.avg_logprob_min), (0.6, -1.0));
        assert!(c.filter.simplify_chinese);
        assert_eq!((c.asr.max_prompt_tokens, c.asr.timeout_ms), (100, 30_000));
        let t = &c.mt;
        assert_eq!((t.repeat_penalty, t.retry_repeat_penalty), (1.05, 1.15));
        assert_eq!(
            (t.max_tokens_for(0), t.max_tokens_for(10), t.max_tokens_for(120)),
            (32, 72, 512)
        );
        assert_eq!(t.ratio_min_source_tokens, 10);
        assert_eq!(t.ratio_for("en", "vi"), Some(4.4));
        assert_eq!(t.ratio_for("zh", "vi"), Some(6.6));
        assert_eq!(t.ratio_for("vi", "zh"), Some(1.2));
        assert_eq!(t.ratio_for("en", "zh"), None, "cặp chưa đo thì không có ngưỡng");
        let q = &c.queue;
        assert_eq!(
            (
                q.asr_max_waiting,
                q.asr_merge_max_ms,
                q.asr_drop_after_ms,
                q.lag_warn_ms
            ),
            (3, 12_000, 20_000, 6_000)
        );
        assert_eq!((q.mt_max_waiting, q.mt_skip_after_ms), (3, 20_000));
        let v = &c.supervisor;
        assert_eq!(v.backoff_ms, [1_000, 2_000, 5_000]);
        assert_eq!(
            (v.max_failures, v.failure_window_ms, v.gpu_failures_to_cpu),
            (5, 600_000, 2)
        );
        assert_eq!(v.idle_shutdown_ms, 600_000);
        assert!(v.first_run_ready_timeout_ms >= 30_000);
        assert_eq!(c.audio.no_audio_after_ms, 60_000);
        assert_eq!(c.validate(), Ok(()));
    }

    /// Manifest chỉ ghi khóa muốn đổi: khóa thiếu lấy mặc định, khóa lạ bị bỏ qua.
    #[test]
    fn a_partial_manifest_keeps_the_other_defaults() {
        let json = r#"{
            "queue": { "lag_warn_ms": 8000 },
            "mt": { "ratio_thresholds": [{ "src": "en", "tgt": "zh", "ratio": 1.9 }] },
            "future_section": { "x": 1 }
        }"#;
        let c: PipelineConfig = serde_json::from_str(json).unwrap();
        assert_eq!(c.queue.lag_warn_ms, 8_000);
        assert_eq!(c.queue.mt_max_waiting, 3);
        assert_eq!(c.mt.ratio_for("en", "zh"), Some(1.9));
        assert_eq!(
            c.mt.ratio_for("en", "vi"),
            None,
            "danh sách trong manifest thay cả danh sách mặc định"
        );
        assert_eq!(c.segmenter, SegmenterConfig::default());
        assert_eq!(c.validate(), Ok(()));
    }

    #[test]
    fn out_of_range_values_name_the_key() {
        let mut c = PipelineConfig::default();
        c.supervisor.first_run_ready_timeout_ms = 20_000;
        assert_eq!(c.validate(), Err("supervisor.first_run_ready_timeout_ms".into()));
        let mut c = PipelineConfig::default();
        c.filter.no_speech_prob_max = 1.5;
        assert_eq!(c.validate(), Err("filter.no_speech_prob_max".into()));
        let mut c = PipelineConfig::default();
        c.supervisor.backoff_ms.clear();
        assert_eq!(c.validate(), Err("supervisor.backoff_ms".into()));
    }
}
```

Tạo `crates/pipeline/src/filter.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Luật bỏ đoạn ở tiến trình chính (spec §6.4, "Lọc lỗi ảo giác"), và giới hạn độ dài của đoạn gửi cho `asr-worker`.
//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật.
//!
//! Đoạn bị bỏ không có phụ đề, không vào prompt của đoạn sau, và không làm đổi ngôn ngữ của đoạn trước (§6.4).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_outside_the_worker_range_are_not_sent() {
        assert_eq!(pcm_skip(0), Some(PcmSkip::TooShort));
        assert_eq!(pcm_skip(MIN_PCM_SAMPLES - 1), Some(PcmSkip::TooShort));
        assert_eq!(pcm_skip(MIN_PCM_SAMPLES), None);
        assert_eq!(pcm_skip(MAX_PCM_SAMPLES), None);
        assert_eq!(pcm_skip(MAX_PCM_SAMPLES + 1), Some(PcmSkip::TooLong));
    }

    #[test]
    fn no_speech_needs_both_a_high_no_speech_prob_and_a_low_avg_logprob() {
        let cfg = FilterConfig::default();
        let drops = |no_speech: f32, logprob: f32| is_no_speech(no_speech, logprob, "안녕", &cfg);
        // Luật của OpenAI Whisper: bỏ khi cả hai điều kiện cùng đúng.
        assert!(drops(0.9, -1.5));
        // `no_speech` cao mà chữ chắc chắn (câu tiếng Hàn đúng có no_speech 0,62 và avg_logprob −0,25): giữ.
        assert!(!drops(0.62, -0.25));
        assert!(!drops(1.0, -0.5));
        // `no_speech` thấp mà chữ kém chắc chắn: giữ (turbo có no_speech khoảng 1e-11 nên không bao giờ bị bỏ).
        assert!(!drops(0.0, -3.0));
        assert!(!drops(1e-11, -3.0));
        // Biên: đúng 0,6 chưa quá ngưỡng, đúng −1,0 chưa dưới ngưỡng.
        assert!(!drops(0.6, -1.5));
        assert!(!drops(0.9, -1.0));
        assert!(drops(0.61, -1.01));
    }

    #[test]
    fn empty_text_is_no_speech() {
        let cfg = FilterConfig::default();
        assert!(is_no_speech(0.0, 0.0, "", &cfg));
        assert!(is_no_speech(0.0, -0.3, " \n", &cfg));
        assert!(!is_no_speech(0.0, -0.3, "Hello", &cfg));
    }

    #[test]
    fn thresholds_come_from_the_config() {
        let loose = FilterConfig {
            no_speech_prob_max: 0.3,
            avg_logprob_min: -0.5,
            ..FilterConfig::default()
        };
        assert!(is_no_speech(0.4, -0.6, "x", &loose));
        assert!(!is_no_speech(0.4, -0.6, "x", &FilterConfig::default()));
    }
}
```

Tạo `crates/pipeline/src/sentence.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Ghép câu và phụ đề tạm (spec §6.3, "Ghép câu và phụ đề tạm"). Chuyển nguyên từ mô phỏng của `latency-bench` (Đ3 của
//! kế hoạch 00), để app và công cụ đo S6 dùng đúng một bản luật.
//!
//! Mọi mốc thời gian là mốc tiếng nói (`Segment::start_ms` và `end_ms`, không gồm đệm), nên cửa sổ ghép tính từ lúc hết
//! tiếng nói của đoạn trước tới lúc có tiếng nói của đoạn sau.

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> MergeConfig {
        MergeConfig::default()
    }

    /// Một đoạn tiếng Anh, chỉ có mốc tiếng nói (không gồm đệm) và chữ, để thử ghép câu.
    fn piece(start_ms: u64, end_ms: u64, text: &str) -> Piece<'_> {
        Piece {
            start_ms,
            end_ms,
            lang: "en",
            text,
        }
    }

    #[test]
    fn merge_window_is_measured_from_speech_end_to_next_speech_start() {
        let open = OpenSentence::new(&piece(1_000, 4_000, "so we went to"), &cfg());
        // Hết tiếng ở 4 000 ms: bắt đầu nói lại ở 4 700 là đúng cửa sổ 700 ms, ở 4 701 là quá 1 ms.
        assert!(open.accepts(&piece(4_700, 6_000, "the market"), 700));
        assert!(!open.accepts(&piece(4_701, 6_000, "the market"), 700));
    }

    #[test]
    fn forced_cut_pieces_touch_and_merge() {
        // Cắt cưỡng bức ở 8 giây: đoạn sau bắt đầu đúng chỗ đoạn trước kết thúc, khoảng cách bằng 0.
        let open = OpenSentence::new(&piece(0, 8_000, "a long sentence that"), &cfg());
        assert!(open.accepts(&piece(8_000, 12_000, "keeps going"), 700));
    }

    #[test]
    fn merge_window_follows_end_silence() {
        assert_eq!(merge_window_ms(200, &cfg()), 700);
        assert_eq!(merge_window_ms(300, &cfg()), 700);
        assert_eq!(merge_window_ms(301, &cfg()), 701);
        assert_eq!(merge_window_ms(800, &cfg()), 1_200);
    }

    #[test]
    fn sentence_is_capped_at_three_segments() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "one"), &cfg());
        let two = piece(2_100, 4_000, "two");
        let three = piece(4_100, 6_000, "three");
        assert!(open.accepts(&two, 700));
        open.push(&two);
        assert!(open.accepts(&three, 700)); // mới 2 đoạn: còn chỗ
        open.push(&three);
        assert_eq!(open.segments(), 3);
        assert!(!open.accepts(&piece(6_100, 7_000, "four"), 700)); // đủ 3 đoạn: đoạn sau mở câu mới
    }

    #[test]
    fn sentence_is_capped_at_15_seconds_of_speech() {
        let open = OpenSentence::new(&piece(0, 8_000, "x"), &cfg()); // 8 giây tiếng nói
        assert!(open.accepts(&piece(8_100, 15_000, "y"), 700)); // tổng 14,9 giây
        assert!(open.accepts(&piece(8_100, 15_100, "y"), 700)); // đúng 15 giây: còn được
        assert!(!open.accepts(&piece(8_100, 15_101, "y"), 700)); // 15,001 giây: quá trần
    }

    #[test]
    fn speech_duration_counts_only_speech_not_the_pauses_between_pieces() {
        let mut open = OpenSentence::new(&piece(0, 5_000, "x"), &cfg());
        open.push(&piece(5_600, 10_600, "y")); // hai khoảng nói 5 giây, nghỉ 0,6 giây: tiếng nói 10 giây
        assert!(open.accepts(&piece(11_200, 16_200, "z"), 700)); // 10 + 5 = 15 giây tiếng nói, dù cả câu trải 16,2 giây
    }

    #[test]
    fn caps_come_from_the_config() {
        let tight = MergeConfig {
            max_segments: 2,
            max_speech_ms: 5_000,
            ..cfg()
        };
        let mut open = OpenSentence::new(&piece(0, 2_000, "a"), &tight);
        assert!(
            !open.accepts(&piece(2_100, 5_200, "b"), 700),
            "2 + 3,1 giây quá trần 5 giây"
        );
        open.push(&piece(2_100, 4_000, "b"));
        assert!(!open.accepts(&piece(4_100, 4_500, "c"), 700), "đủ 2 đoạn");
    }

    #[test]
    fn terminal_punctuation_closes_the_sentence() {
        for end in [".", "?", "!", "。", "？", "！", ". ", "?\n"] {
            let text = format!("đã xong{end}");
            let open = OpenSentence::new(&piece(0, 2_000, &text), &cfg());
            assert!(open.is_closed());
            assert!(!open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
        for end in ["", ",", ";", ":", "，", "、", " và"] {
            let text = format!("còn tiếp{end}");
            let open = OpenSentence::new(&piece(0, 2_000, &text), &cfg());
            assert!(open.accepts(&piece(2_100, 3_000, "câu sau"), 700), "{end:?}");
        }
    }

    #[test]
    fn only_the_last_piece_decides_whether_the_sentence_is_closed() {
        let mut open = OpenSentence::new(&piece(0, 2_000, "Xong rồi."), &cfg());
        assert!(!open.accepts(&piece(2_100, 3_000, "tiếp"), 700));
        // Câu mở mà đoạn đầu có dấu chấm giữa chừng (ví dụ "Mr. Smith") vẫn ghép tiếp nếu đoạn cuối không có.
        open = OpenSentence::new(&piece(0, 2_000, "Mr. Smith said"), &cfg());
        open.push(&piece(2_100, 3_000, "that it was done."));
        assert!(!open.accepts(&piece(3_100, 4_000, "next"), 700));
    }

    #[test]
    fn different_language_does_not_merge() {
        let open = OpenSentence::new(&piece(0, 2_000, "hello"), &cfg());
        let next = Piece {
            lang: "vi",
            ..piece(2_100, 3_000, "xin chào")
        };
        assert!(!open.accepts(&next, 700));
    }

    #[test]
    fn merged_source_is_the_whole_sentence() {
        let mut open = None;
        let a = piece(0, 3_000, "We walked to the");
        let b = piece(3_400, 6_000, "market yesterday.");
        let c = piece(6_200, 8_000, "Then we ate.");
        assert_eq!(
            plan_merge(&mut open, &a, 700, &cfg()),
            (1, "We walked to the".to_string())
        );
        assert_eq!(
            plan_merge(&mut open, &b, 700, &cfg()),
            (2, "We walked to the market yesterday.".to_string())
        );
        assert_eq!(open.as_ref().map(|o| (o.start_ms(), o.last_end_ms())), Some((0, 6_000)));
        // `b` kết thúc bằng dấu chấm: câu đã chốt, `c` mở câu mới.
        assert_eq!(plan_merge(&mut open, &c, 700, &cfg()), (1, "Then we ate.".to_string()));
    }

    #[test]
    fn a_piece_outside_the_window_starts_a_new_sentence() {
        let mut open = None;
        plan_merge(&mut open, &piece(0, 3_000, "first part"), 700, &cfg());
        let late = piece(3_701, 5_000, "second part");
        assert_eq!(
            plan_merge(&mut open, &late, 700, &cfg()),
            (1, "second part".to_string())
        );
    }

    #[test]
    fn chinese_and_japanese_join_without_a_space() {
        for lang in ["zh", "ja"] {
            let mut open = None;
            let a = Piece {
                lang,
                ..piece(0, 3_000, "我们走到 ")
            };
            let b = Piece {
                lang,
                ..piece(3_200, 5_000, " 市场")
            };
            plan_merge(&mut open, &a, 700, &cfg());
            assert_eq!(
                plan_merge(&mut open, &b, 700, &cfg()),
                (2, "我们走到市场".to_string()),
                "{lang}"
            );
        }
    }

    #[test]
    fn other_languages_join_with_one_space() {
        for lang in ["en", "ko", "vi"] {
            let mut open = None;
            let a = Piece {
                lang,
                ..piece(0, 3_000, "một hai ")
            };
            let b = Piece {
                lang,
                ..piece(3_200, 5_000, " ba bốn")
            };
            plan_merge(&mut open, &a, 700, &cfg());
            assert_eq!(
                plan_merge(&mut open, &b, 700, &cfg()),
                (2, "một hai ba bốn".to_string()),
                "{lang}"
            );
        }
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi:

```text
error[E0425]: cannot find type `PipelineConfig` in this scope
error[E0433]: cannot find type `SegmenterConfig` in this scope
error[E0425]: cannot find value `MIN_PCM_SAMPLES` in this scope
error[E0425]: cannot find value `MAX_PCM_SAMPLES` in this scope
error[E0422]: cannot find struct, variant or union type `FilterConfig` in this scope
error[E0425]: cannot find type `MergeConfig` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -5,15 +5,16 @@
 
 use crate::stats::{Utterance, match_segments, percentile};
 use anyhow::{Context, Result, bail};
-use asr_protocol::{
-    MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_AUDIO_CTX, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples,
-};
+use asr_protocol::{MAX_PROMPT_TOKENS, MIN_AUDIO_CTX, TranscribeRequest, audio_ctx_for_samples};
 use pipeline::asr_client::AsrWorker;
+use pipeline::config::{FilterConfig, PipelineConfig};
+use pipeline::filter::{PcmSkip, is_no_speech, pcm_skip};
 use pipeline::llama::{LlamaServer, max_tokens_for};
 use pipeline::prompt::{Lang, translation_prompt};
 use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
+use pipeline::sentence::{OpenSentence, Piece, merge_window_ms, plan_merge};
 use pipeline::vad::SileroVad;
-use serde::Serialize;
+use serde::{Deserialize, Serialize};
 use std::collections::HashMap;
 use std::path::{Path, PathBuf};
 use std::sync::Arc;
@@ -22,34 +23,16 @@
 use std::time::{Duration, Instant};
 use sysinfo::{Pid, ProcessesToUpdate, System};
 
-/// Luật bỏ đoạn "không có tiếng nói" theo OpenAI Whisper (spec §6.4, "Lọc lỗi ảo giác"): bỏ khi `no_speech_prob` lớn hơn
-/// ngưỡng này **và** `avg_logprob` nhỏ hơn `AVG_LOGPROB_MIN`.
-/// `avg_logprob` của worker không tính EOT, cố ý khác OpenAI: âm hơn một chút, nên chặt hơn một chút ở đoạn ngắn. Chế độ A
-/// không có `cut_loop` nên `avg_logprob` của nó gồm cả token lặp.
-///
-/// Chỉ dùng `no_speech_prob` thì bỏ nhầm câu đúng: một câu tiếng Hàn có `no_speech_prob` 0,62 mà `avg_logprob` −0,25.
-/// Trên A4 (`out-m4pro-small-final.jsonl`, 548 clip) luật bỏ đúng 1 clip, `en-9810650684898829002_nb`, có bản chép là ảo
-/// giác; `avg_logprob` ở phân vị 1 (nội suy tuyến tính) là −0,695 với small và −0,269 với turbo. Với turbo,
-/// `no_speech_prob` luôn cỡ 1e-11 nên luật không bao giờ bỏ đoạn nào. Chỉ dùng `avg_logprob < −1` thì bỏ nhầm 1 clip ja
-/// thật (`ja-887319630625143301_nb`, −1,318).
-const NO_SPEECH_MAX: f32 = 0.6;
-/// Ngưỡng `avg_logprob` của cùng luật trên (`logprob_threshold` mặc định của OpenAI Whisper).
-const AVG_LOGPROB_MIN: f32 = -1.0;
 /// Cửa sổ (ms) ghép đoạn với mốc dừng câu thật, xem `match_segments`.
 const MATCH_WINDOW_MS: u64 = 1_000;
 /// Khung âm thanh tới trễ hơn thời gian thực quá ngưỡng này (ms) thì kết quả lệch cùng cỡ: báo cho người chạy.
 const FEED_LAG_WARN_MS: f64 = 100.0;
 /// Đoạn có mốc dừng sớm hơn mốc VAD của câu quá ngưỡng này (ms) thì câu bị gắn cờ `early_stop`.
 const EARLY_STOP_MS: i64 = 200;
-/// Dấu câu kết thúc của §6.3. Đúng chữ của spec: đuôi như `."` hay `」` chưa được xử lý riêng.
-const SENTENCE_END: [char; 6] = ['.', '?', '!', '。', '？', '！'];
-/// Trần của một câu ghép (§6.3): 15 giây âm thanh hoặc 3 đoạn.
-const MERGE_MAX_SPEECH_MS: u64 = 15_000;
-const MERGE_MAX_SEGMENTS: usize = 3;
 
 // Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
-/// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (xem `NO_SPEECH_MAX`), hoặc chữ rỗng: app bỏ đoạn
-/// này (spec §6.4, "Lọc lỗi ảo giác").
+/// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (`pipeline::filter::is_no_speech`), hoặc chữ rỗng:
+/// app bỏ đoạn này (spec §6.4, "Lọc lỗi ảo giác").
 const SKIP_NO_SPEECH: &str = "no_speech";
 /// Đoạn ngắn hơn `MIN_PCM_SAMPLES`: không gửi cho `asr-worker`.
 const SKIP_TOO_SHORT: &str = "too_short";
@@ -119,7 +102,8 @@
     llama_args: String,
 }
 
-#[derive(Serialize, Clone, Debug, Default)]
+#[derive(Serialize, Deserialize, Clone, Debug, Default)]
+#[serde(default)]
 struct SegmentRecord {
     id: u64,
     start_ms: u64,
@@ -219,9 +203,11 @@
     // Nạp VAD trước khi chạy tiến trình phụ: đường dẫn sai thì báo lỗi ngay mà không để lại server chạy dở,
     // và việc nạp không chiếm giờ của lượt phát lại.
     let mut vad = SileroVad::load(&args.vad_model)?;
+    // Ngưỡng mặc định của app (`pipeline::config`): công cụ đo dùng đúng luật app chạy.
+    let config = PipelineConfig::default();
     let mut segmenter = Segmenter::new(SegmenterConfig {
         end_silence_ms: args.end_silence_ms,
-        ..Default::default()
+        ..config.segmenter.clone()
     });
 
     let (mut asr, ready) = AsrWorker::spawn(
@@ -265,7 +251,9 @@
     let languages = args.languages.clone();
     let min_ctx = args.min_ctx;
     let merge = args.merge;
-    let merge_window = merge_window_ms(args.end_silence_ms);
+    let merge_window = merge_window_ms(args.end_silence_ms, &config.merge);
+    let merge_config = config.merge.clone();
+    let filter_config = config.filter.clone();
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
         // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
@@ -282,8 +270,8 @@
                 ..Default::default()
             };
             // Worker từ chối đoạn ngoài khoảng, và một lỗi làm dừng cả lượt đo: không gửi, chỉ ghi lại.
-            if let Some(reason) = pcm_skip_reason(segment.samples.len()) {
-                rec.skipped = Some(reason.into());
+            if let Some(reason) = pcm_skip(segment.samples.len()) {
+                rec.skipped = Some(skip_name(reason).into());
                 rec.asr_done_at_ms = now_ms();
                 asr_tx.send(rec)?;
                 continue;
@@ -329,7 +317,7 @@
         for mut rec in asr_rx {
             let mt_started = now_ms();
             if rec.skipped.is_none() {
-                match route(&rec, target) {
+                match route(&rec, target, &filter_config) {
                     Err(reason) => {
                         // Đoạn hiện luôn chữ gốc (cùng ngôn ngữ đích, hoặc ngoài tập) cắt chuỗi ghép; đoạn bị bỏ thì không.
                         if !is_dropped(&reason) {
@@ -341,7 +329,7 @@
                         rec.mt_started_at_ms = Some(mt_started);
                         // Ghép câu (§6.3): đoạn bắt đầu nói trong cửa sổ ghép thì dịch lại cả câu, không chỉ đoạn này.
                         let (merged, source) = if merge {
-                            plan_merge(&mut open, &rec, src, merge_window)
+                            plan_merge(&mut open, &piece_of(&rec), merge_window, &merge_config)
                         } else {
                             (1, rec.text.trim().to_string())
                         };
@@ -500,92 +488,27 @@
         .output();
 }
 
-/// Lý do không gửi đoạn cho `asr-worker`: số mẫu ngoài khoảng worker nhận.
-fn pcm_skip_reason(n_samples: usize) -> Option<&'static str> {
-    if n_samples < MIN_PCM_SAMPLES {
-        Some(SKIP_TOO_SHORT)
-    } else if n_samples > MAX_PCM_SAMPLES {
-        Some(SKIP_TOO_LONG)
-    } else {
-        None
-    }
-}
-
-/// Cửa sổ ghép của §6.3: max(700 ms, `vadEndSilenceMs` + 400 ms).
-fn merge_window_ms(end_silence_ms: u64) -> u64 {
-    (end_silence_ms + 400).max(700)
-}
-
-/// Đoạn kết thúc bằng dấu câu kết thúc thì câu đã chốt: không còn là phụ đề tạm.
-fn ends_sentence(text: &str) -> bool {
-    text.trim_end().ends_with(SENTENCE_END)
-}
-
-/// Câu đang mở theo §6.3: các đoạn liên tiếp đã ghép và chưa chốt. Mọi mốc thời gian là mốc tiếng nói
-/// (`Segment::start_ms` và `end_ms`, không gồm đệm), nên cửa sổ tính từ lúc hết tiếng nói của đoạn trước tới lúc có
-/// tiếng nói của đoạn sau.
-struct OpenSentence {
-    /// Ngôn ngữ nhận diện của các đoạn. Đoạn sau khác ngôn ngữ thì không ghép (spec §6.3, "Ghép câu và phụ đề tạm").
-    lang: String,
-    /// Chỗ nối chữ: tiếng Trung và tiếng Nhật không có dấu cách giữa các từ.
-    joiner: &'static str,
-    text: String,
-    segments: usize,
-    /// Tổng thời lượng tiếng nói, không tính đệm và không tính khoảng nghỉ giữa các đoạn.
-    speech_ms: u64,
-    /// Lúc hết tiếng nói của đoạn cuối.
-    last_end_ms: u64,
-    /// Đoạn cuối kết thúc bằng dấu câu kết thúc: câu đã chốt.
-    closed: bool,
-}
-
-impl OpenSentence {
-    fn new(first: &SegmentRecord, lang: Lang) -> Self {
-        Self {
-            lang: first.lang.clone(),
-            joiner: if matches!(lang, Lang::Zh | Lang::Ja) { "" } else { " " },
-            text: first.text.trim().to_string(),
-            segments: 1,
-            speech_ms: first.end_ms.saturating_sub(first.start_ms),
-            last_end_ms: first.end_ms,
-            closed: ends_sentence(&first.text),
-        }
-    }
-
-    /// `next` ghép được vào câu này không. Đoạn cắt cưỡng bức (8 giây) bắt đầu đúng chỗ đoạn trước kết thúc, nên
-    /// khoảng cách bằng 0. Đạt trần thì chốt câu, đoạn sau mở câu mới.
-    fn accepts(&self, next: &SegmentRecord, window_ms: u64) -> bool {
-        !self.closed
-            && next.lang == self.lang
-            && next.start_ms.saturating_sub(self.last_end_ms) <= window_ms
-            && self.segments < MERGE_MAX_SEGMENTS
-            && self.speech_ms + next.end_ms.saturating_sub(next.start_ms) <= MERGE_MAX_SPEECH_MS
-    }
-
-    fn push(&mut self, next: &SegmentRecord) {
-        self.text = format!("{}{}{}", self.text.trim_end(), self.joiner, next.text.trim());
-        self.segments += 1;
-        self.speech_ms += next.end_ms.saturating_sub(next.start_ms);
-        self.last_end_ms = next.end_ms;
-        self.closed = ends_sentence(&next.text);
-    }
-}
-
-/// Đoạn vừa chép lời xong và cần dịch: ghép vào câu đang mở nếu được, không thì mở câu mới.
-/// Trả (số đoạn trong câu, chữ nguồn của cả câu để dịch).
-fn plan_merge(open: &mut Option<OpenSentence>, rec: &SegmentRecord, src: Lang, window_ms: u64) -> (usize, String) {
-    match open.as_mut().filter(|o| o.accepts(rec, window_ms)) {
-        Some(o) => o.push(rec),
-        None => *open = Some(OpenSentence::new(rec, src)),
-    }
-    let o = open.as_ref().expect("vừa ghép hoặc vừa mở câu");
-    (o.segments, o.text.clone())
+/// Tên lý do trong file kết quả, giữ như Giai đoạn 0.
+fn skip_name(reason: PcmSkip) -> &'static str {
+    match reason {
+        PcmSkip::TooShort => SKIP_TOO_SHORT,
+        PcmSkip::TooLong => SKIP_TOO_LONG,
+    }
+}
+
+/// Đoạn đã chép lời, ở dạng luật ghép câu cần (`pipeline::sentence`). Chỉ mốc tiếng nói, không có `audio_ms` (gồm đệm).
+fn piece_of(rec: &SegmentRecord) -> Piece<'_> {
+    Piece {
+        start_ms: rec.start_ms,
+        end_ms: rec.end_ms,
+        lang: &rec.lang,
+        text: &rec.text,
+    }
 }
 
 /// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
-fn route(rec: &SegmentRecord, target: Lang) -> Result<Lang, String> {
-    let no_speech = rec.no_speech_prob > NO_SPEECH_MAX && rec.avg_logprob < AVG_LOGPROB_MIN;
-    if no_speech || rec.text.trim().is_empty() {
+fn route(rec: &SegmentRecord, target: Lang, cfg: &FilterConfig) -> Result<Lang, String> {
+    if is_no_speech(rec.no_speech_prob, rec.avg_logprob, &rec.text, cfg) {
         return Err(SKIP_NO_SPEECH.into());
     }
     match Lang::from_code(&rec.lang) {
```

Thêm vào `crates/pipeline/src/config.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::segmenter::SegmenterConfig;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PipelineConfig {
    pub segmenter: SegmenterConfig,
    pub merge: MergeConfig,
    pub filter: FilterConfig,
    pub asr: AsrConfig,
    pub mt: MtConfig,
    pub queue: QueueConfig,
    pub supervisor: SupervisorConfig,
    pub audio: AudioConfig,
}

/// Ghép câu và phụ đề tạm (§6.3).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MergeConfig {
    /// Cửa sổ ghép = max(`window_min_ms`, `vadEndSilenceMs` + `window_extra_ms`).
    pub window_min_ms: u64,
    pub window_extra_ms: u64,
    /// Trần của một câu ghép: tổng tiếng nói (không tính đệm và khoảng nghỉ) hoặc số đoạn.
    pub max_speech_ms: u64,
    pub max_segments: usize,
}

impl Default for MergeConfig {
    fn default() -> Self {
        Self {
            window_min_ms: 700,
            window_extra_ms: 400,
            max_speech_ms: 15_000,
            max_segments: 3,
        }
    }
}

/// Lọc lỗi ảo giác ở tiến trình chính (§6.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct FilterConfig {
    /// Bỏ đoạn khi `no_speech_prob > no_speech_prob_max` **và** `avg_logprob < avg_logprob_min` (luật của OpenAI Whisper).
    pub no_speech_prob_max: f32,
    pub avg_logprob_min: f32,
    /// Câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng. Đoạn chỉ gồm các câu này (sau khi chuẩn hóa) thì bị bỏ.
    pub hallucination_phrases: Vec<String>,
    /// Đổi chữ phồn thể sang giản thể cho đoạn tiếng Trung (§6.4, "Việc cho MVP"; `small` hay ra phồn thể).
    pub simplify_chinese: bool,
}

/// Danh sách mặc định: câu trong spec §6.4 cộng các biến thể hay gặp của cùng loại (cảm ơn đã xem, mời đăng ký kênh,
/// phụ đề do ai làm, nhãn nhạc). Không có "Thank you." hay "Cảm ơn." đứng riêng: đó là câu thật trong cuộc họp.
pub const DEFAULT_HALLUCINATION_PHRASES: &[&str] = &[
    "thank you for watching",
    "thanks for watching",
    "thank you so much for watching",
    "please subscribe",
    "please like and subscribe",
    "subscribe to my channel",
    "hãy subscribe cho kênh",
    "hãy đăng ký kênh",
    "cảm ơn các bạn đã theo dõi",
    "[music]",
    "(music)",
    "[âm nhạc]",
    "♪",
    "ご視聴ありがとうございました",
    "チャンネル登録お願いします",
    "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
    "字幕由amara.org社区提供",
    "谢谢观看",
    "시청해 주셔서 감사합니다",
    "구독과 좋아요 부탁드립니다",
];

impl Default for FilterConfig {
    fn default() -> Self {
        Self {
            no_speech_prob_max: 0.6,
            avg_logprob_min: -1.0,
            hallucination_phrases: DEFAULT_HALLUCINATION_PHRASES.iter().map(|s| s.to_string()).collect(),
            simplify_chinese: true,
        }
    }
}

/// Gọi `asr-worker` (§6.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AsrConfig {
    /// Số token prompt tối đa (`asr_protocol::MAX_PROMPT_TOKENS`); app còn cắt bớt để prompt không làm giảm trần token mới
    /// (xem `prompt_history`).
    pub max_prompt_tokens: usize,
    pub n_threads: u32,
    /// Một đoạn không có kết quả sau chừng này thì coi như worker treo: kill và khởi động lại (§9).
    pub timeout_ms: u64,
}

impl Default for AsrConfig {
    fn default() -> Self {
        Self {
            max_prompt_tokens: asr_protocol::MAX_PROMPT_TOKENS,
            n_threads: 4,
            timeout_ms: 30_000,
        }
    }
}

/// Ngưỡng tỉ lệ token (token bản dịch chia token câu gốc) của một cặp ngôn ngữ (§6.5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PairRatio {
    pub src: String,
    pub tgt: String,
    pub ratio: f32,
}

/// Dịch (§6.5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct MtConfig {
    pub repeat_penalty: f32,
    /// Lần thử lại duy nhất dùng repeat penalty cao hơn: với temperature 0, giữ nguyên tham số thì ra y hệt lần trước.
    pub retry_repeat_penalty: f32,
    /// Số token tối đa = min(`max_tokens_per_source_token` × số token câu gốc + `max_tokens_extra`, `max_tokens_cap`).
    pub max_tokens_per_source_token: u32,
    pub max_tokens_extra: u32,
    pub max_tokens_cap: u32,
    /// Ngưỡng theo cặp, lấy ở S7. Cặp không có trong danh sách thì không kiểm tỉ lệ, chỉ chịu hạn mức sinh.
    pub ratio_thresholds: Vec<PairRatio>,
    /// Chỉ kiểm tỉ lệ khi câu gốc có từ chừng này token (cách 2 của Q4, đề xuất của kế hoạch 00).
    pub ratio_min_source_tokens: usize,
    /// Timeout của một request dịch (kể cả stream).
    pub request_timeout_ms: u64,
}

/// Ngưỡng tỉ lệ token của S7 (`s7_mt_decisions.md`): tỉ lệ lớn nhất đo được cộng biên 25%, làm tròn lên 0,1.
pub const DEFAULT_RATIO_THRESHOLDS: &[(&str, &str, f32)] = &[
    ("en", "vi", 4.4),
    ("zh", "vi", 6.6),
    ("ja", "vi", 3.5),
    ("ko", "vi", 3.5),
    ("vi", "en", 1.6),
    ("vi", "zh", 1.2),
    ("vi", "ja", 2.2),
    ("vi", "ko", 2.2),
];

impl Default for MtConfig {
    fn default() -> Self {
        Self {
            repeat_penalty: 1.05,
            retry_repeat_penalty: 1.15,
            max_tokens_per_source_token: 4,
            max_tokens_extra: 32,
            max_tokens_cap: 512,
            ratio_thresholds: DEFAULT_RATIO_THRESHOLDS
                .iter()
                .map(|&(src, tgt, ratio)| PairRatio {
                    src: src.into(),
                    tgt: tgt.into(),
                    ratio,
                })
                .collect(),
            ratio_min_source_tokens: 10,
            request_timeout_ms: 120_000,
        }
    }
}

impl MtConfig {
    /// min(4 × số token câu gốc + 32, 512) với mặc định (§6.5).
    pub fn max_tokens_for(&self, source_tokens: usize) -> u32 {
        let per = self.max_tokens_per_source_token as usize;
        source_tokens
            .saturating_mul(per)
            .saturating_add(self.max_tokens_extra as usize)
            .min(self.max_tokens_cap as usize) as u32
    }

    pub fn ratio_for(&self, src: &str, tgt: &str) -> Option<f32> {
        self.ratio_thresholds
            .iter()
            .find(|p| p.src == src && p.tgt == tgt)
            .map(|p| p.ratio)
    }
}

/// Hàng đợi và chống nghẽn (§7).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct QueueConfig {
    /// Hàng đợi VAD → nhận dạng chứa tối đa chừng này đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá
    /// `asr_merge_max_ms`.
    pub asr_max_waiting: usize,
    pub asr_merge_max_ms: u64,
    /// Chỉ bỏ đoạn (`dropped`) khi độ trễ vượt mức này.
    pub asr_drop_after_ms: u64,
    /// Độ trễ vượt mức này thì hiện chỉ báo "Đang trễ".
    pub lag_warn_ms: u64,
    /// Hàng đợi dịch chứa tối đa chừng này câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ.
    pub mt_max_waiting: usize,
    /// Câu chờ dịch quá mức này thì bỏ bước dịch, chỉ hiện câu gốc (`skipped`).
    pub mt_skip_after_ms: u64,
}

impl Default for QueueConfig {
    fn default() -> Self {
        Self {
            asr_max_waiting: 3,
            asr_merge_max_ms: 12_000,
            asr_drop_after_ms: 20_000,
            lag_warn_ms: 6_000,
            mt_max_waiting: 3,
            mt_skip_after_ms: 20_000,
        }
    }
}

/// Vòng đời và giám sát hai tiến trình phụ (§5, §6.4, §6.5, §9).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SupervisorConfig {
    /// Chờ trước lần khởi động lại thứ 1, 2, 3 trở đi.
    pub backoff_ms: Vec<u64>,
    /// Quá chừng này lần lỗi trong `failure_window_ms` thì bỏ cuộc và báo lỗi.
    pub max_failures: usize,
    pub failure_window_ms: u64,
    /// Crash chừng này lần liên tiếp khi đang dùng GPU thì chuyển sang CPU.
    pub gpu_failures_to_cpu: u32,
    /// Chờ `Ready` hoặc `/health` khi khởi động.
    pub ready_timeout_ms: u64,
    /// Lần đầu chạy một binary mới (sau khi cài hoặc cập nhật), macOS kiểm tra khoảng 15 giây: chờ lâu hơn, và lần chờ này
    /// không tính là lỗi (§6.5). Phải từ 30 giây trở lên.
    pub first_run_ready_timeout_ms: u64,
    /// Không dịch chừng này thì tắt hai tiến trình phụ (§5).
    pub idle_shutdown_ms: u64,
    /// Chờ tiến trình phụ tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace_ms: u64,
}

impl Default for SupervisorConfig {
    fn default() -> Self {
        Self {
            backoff_ms: vec![1_000, 2_000, 5_000],
            max_failures: 5,
            failure_window_ms: 600_000,
            gpu_failures_to_cpu: 2,
            ready_timeout_ms: 60_000,
            first_run_ready_timeout_ms: 180_000,
            idle_shutdown_ms: 600_000,
            shutdown_grace_ms: 5_000,
        }
    }
}

/// Luồng âm thanh vào (§6.1, §9).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AudioConfig {
    /// Đang dịch mà RMS dưới `silent_rms` liên tục chừng này thì báo "Không nghe thấy âm thanh".
    pub no_audio_after_ms: u64,
    pub silent_rms: f32,
    /// Chu kỳ gửi mức âm lượng cho giao diện.
    pub level_interval_ms: u64,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            no_audio_after_ms: 60_000,
            silent_rms: 0.000_5,
            level_interval_ms: 100,
        }
    }
}

impl PipelineConfig {
    /// Kiểm phạm vi, trả tên khóa đầu tiên sai. Dùng khi nạp từ manifest (kế hoạch 04).
    pub fn validate(&self) -> Result<(), String> {
        let s = &self.segmenter;
        let checks: [(&str, bool); 22] = [
            (
                "segmenter.threshold",
                (0.0..1.0).contains(&s.threshold) && s.threshold > 0.0,
            ),
            ("segmenter.end_silence_ms", (100..=2_000).contains(&s.end_silence_ms)),
            ("segmenter.max_segment_ms", (2_000..=28_000).contains(&s.max_segment_ms)),
            (
                "segmenter.force_cut_window_ms",
                s.force_cut_window_ms > 0 && s.force_cut_window_ms < s.max_segment_ms,
            ),
            ("segmenter.pad_ms", s.pad_ms <= 1_000),
            ("merge.max_segments", self.merge.max_segments >= 1),
            ("merge.max_speech_ms", self.merge.max_speech_ms > 0),
            (
                "filter.no_speech_prob_max",
                (0.0..=1.0).contains(&self.filter.no_speech_prob_max),
            ),
            ("filter.avg_logprob_min", self.filter.avg_logprob_min <= 0.0),
            (
                "asr.max_prompt_tokens",
                self.asr.max_prompt_tokens <= asr_protocol::MAX_PROMPT_TOKENS,
            ),
            ("asr.timeout_ms", self.asr.timeout_ms >= 1_000),
            ("mt.repeat_penalty", self.mt.repeat_penalty >= 1.0),
            (
                "mt.retry_repeat_penalty",
                self.mt.retry_repeat_penalty >= self.mt.repeat_penalty,
            ),
            ("mt.max_tokens_cap", self.mt.max_tokens_cap >= 16),
            (
                "mt.ratio_thresholds",
                self.mt.ratio_thresholds.iter().all(|p| p.ratio > 0.0),
            ),
            ("queue.asr_max_waiting", self.queue.asr_max_waiting >= 1),
            ("queue.mt_max_waiting", self.queue.mt_max_waiting >= 1),
            ("supervisor.backoff_ms", !self.supervisor.backoff_ms.is_empty()),
            ("supervisor.max_failures", self.supervisor.max_failures >= 1),
            (
                "supervisor.gpu_failures_to_cpu",
                self.supervisor.gpu_failures_to_cpu >= 1,
            ),
            (
                "supervisor.first_run_ready_timeout_ms",
                self.supervisor.first_run_ready_timeout_ms >= 30_000
                    && self.supervisor.first_run_ready_timeout_ms >= self.supervisor.ready_timeout_ms,
            ),
            ("audio.level_interval_ms", self.audio.level_interval_ms >= 20),
        ];
        match checks.iter().find(|(_, ok)| !ok) {
            Some((key, _)) => Err(key.to_string()),
            None => Ok(()),
        }
    }
}
```

Thêm vào `crates/pipeline/src/filter.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::FilterConfig;
use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES};

/// Lý do không gửi một đoạn cho `asr-worker`: số mẫu ngoài khoảng worker nhận (0,1 đến 30 giây).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PcmSkip {
    TooShort,
    TooLong,
}

pub fn pcm_skip(n_samples: usize) -> Option<PcmSkip> {
    if n_samples < MIN_PCM_SAMPLES {
        Some(PcmSkip::TooShort)
    } else if n_samples > MAX_PCM_SAMPLES {
        Some(PcmSkip::TooLong)
    } else {
        None
    }
}

/// Đoạn không có tiếng nói theo luật của OpenAI Whisper: `no_speech_prob > 0,6` **và** `avg_logprob < −1` (mặc định),
/// hoặc chữ rỗng.
///
/// `avg_logprob` của worker không tính EOT, cố ý khác OpenAI: âm hơn một chút, nên chặt hơn một chút ở đoạn ngắn. Cần cả
/// hai điều kiện: chỉ dùng `no_speech_prob` thì bỏ nhầm một câu tiếng Hàn đúng (0,62 và −0,25); chỉ dùng `avg_logprob`
/// thì bỏ nhầm một clip tiếng Nhật thật trên A4 (−1,318). Với turbo, `no_speech_prob` luôn cỡ 1e-11 nên luật gần như
/// không bao giờ bỏ đoạn nào.
pub fn is_no_speech(no_speech_prob: f32, avg_logprob: f32, text: &str, cfg: &FilterConfig) -> bool {
    let silent = no_speech_prob > cfg.no_speech_prob_max && avg_logprob < cfg.avg_logprob_min;
    silent || text.trim().is_empty()
}
```

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -4,12 +4,15 @@
 //! Thời gian tính theo số khung, nên luồng vào phải liền mạch theo đồng hồ thật
 //! (trên Windows, luồng thu đã được chèn im lặng vào khoảng trống, spec §6.1).
 
+use serde::{Deserialize, Serialize};
 use std::collections::VecDeque;
 
 pub const FRAME_SAMPLES: usize = 512;
 pub const FRAME_MS: u64 = 32;
 
-#[derive(Clone, Debug)]
+/// Tham số VAD và cắt đoạn (§6.3). Là một phần của `config::PipelineConfig`, nên nạp được từ manifest.
+#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
+#[serde(default)]
 pub struct SegmenterConfig {
     pub threshold: f32,
     pub min_speech_ms: u64,
```

Thêm vào `crates/pipeline/src/sentence.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::MergeConfig;

/// Dấu câu kết thúc của §6.3. Đúng chữ của spec: đuôi như `."` hay `」` chưa được xử lý riêng.
pub const SENTENCE_END: [char; 6] = ['.', '?', '!', '。', '？', '！'];

/// Một đoạn đã chép lời, đủ để quyết định ghép.
#[derive(Clone, Copy, Debug)]
pub struct Piece<'a> {
    pub start_ms: u64,
    pub end_ms: u64,
    /// Ngôn ngữ do `asr-worker` chọn (§6.4).
    pub lang: &'a str,
    pub text: &'a str,
}

/// Cửa sổ ghép: max(700 ms, `vadEndSilenceMs` + 400 ms) với mặc định.
pub fn merge_window_ms(end_silence_ms: u64, cfg: &MergeConfig) -> u64 {
    (end_silence_ms + cfg.window_extra_ms).max(cfg.window_min_ms)
}

/// Đoạn kết thúc bằng dấu câu kết thúc thì câu đã chốt: không còn là phụ đề tạm.
pub fn ends_sentence(text: &str) -> bool {
    text.trim_end().ends_with(SENTENCE_END)
}

/// Chỗ nối chữ: tiếng Trung và tiếng Nhật không có dấu cách giữa các từ.
pub fn joiner(lang: &str) -> &'static str {
    if matches!(lang, "zh" | "ja") { "" } else { " " }
}

/// Câu đang mở: các đoạn liên tiếp đã ghép và chưa chốt.
#[derive(Clone, Debug, PartialEq)]
pub struct OpenSentence {
    /// Ngôn ngữ của các đoạn. Đoạn sau khác ngôn ngữ thì không ghép.
    lang: String,
    text: String,
    segments: usize,
    /// Tổng thời lượng tiếng nói, không tính đệm và không tính khoảng nghỉ giữa các đoạn.
    speech_ms: u64,
    start_ms: u64,
    /// Lúc hết tiếng nói của đoạn cuối.
    last_end_ms: u64,
    /// Đoạn cuối kết thúc bằng dấu câu kết thúc: câu đã chốt.
    closed: bool,
    max_speech_ms: u64,
    max_segments: usize,
}

impl OpenSentence {
    pub fn new(first: &Piece, cfg: &MergeConfig) -> Self {
        Self {
            lang: first.lang.to_string(),
            text: first.text.trim().to_string(),
            segments: 1,
            speech_ms: first.end_ms.saturating_sub(first.start_ms),
            start_ms: first.start_ms,
            last_end_ms: first.end_ms,
            closed: ends_sentence(first.text),
            max_speech_ms: cfg.max_speech_ms,
            max_segments: cfg.max_segments,
        }
    }

    /// `next` ghép được vào câu này không. Đoạn cắt cưỡng bức (8 giây) bắt đầu đúng chỗ đoạn trước kết thúc, nên
    /// khoảng cách bằng 0. Đạt trần thì chốt câu, đoạn sau mở câu mới.
    pub fn accepts(&self, next: &Piece, window_ms: u64) -> bool {
        !self.closed
            && next.lang == self.lang
            && next.start_ms.saturating_sub(self.last_end_ms) <= window_ms
            && self.segments < self.max_segments
            && self.speech_ms + next.end_ms.saturating_sub(next.start_ms) <= self.max_speech_ms
    }

    pub fn push(&mut self, next: &Piece) {
        self.text = format!("{}{}{}", self.text.trim_end(), joiner(&self.lang), next.text.trim());
        self.segments += 1;
        self.speech_ms += next.end_ms.saturating_sub(next.start_ms);
        self.last_end_ms = next.end_ms;
        self.closed = ends_sentence(next.text);
    }

    pub fn lang(&self) -> &str {
        &self.lang
    }

    /// Chữ của cả câu, để dịch lại (§6.3).
    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn segments(&self) -> usize {
        self.segments
    }

    pub fn start_ms(&self) -> u64 {
        self.start_ms
    }

    pub fn last_end_ms(&self) -> u64 {
        self.last_end_ms
    }

    /// Có dấu câu kết thúc ở đoạn cuối.
    pub fn is_closed(&self) -> bool {
        self.closed
    }
}

/// Đoạn vừa chép lời xong và cần dịch: ghép vào câu đang mở nếu được, không thì mở câu mới.
/// Trả (số đoạn trong câu, chữ nguồn của cả câu để dịch).
pub fn plan_merge(
    open: &mut Option<OpenSentence>,
    piece: &Piece,
    window_ms: u64,
    cfg: &MergeConfig,
) -> (usize, String) {
    match open.as_mut().filter(|o| o.accepts(piece, window_ms)) {
        Some(o) => o.push(piece),
        None => *open = Some(OpenSentence::new(piece, cfg)),
    }
    let o = open.as_ref().expect("vừa ghép hoặc vừa mở câu");
    (o.segments, o.text.clone())
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline --lib`
Expected:

```text
test result: ok. 58 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
```

Run: `cargo test -p latency-bench`
Expected:

```text
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.33s
```

Run: `cargo test -p latency-bench phase0_s6 -- --nocapture`
Expected: luật trong `pipeline` cho lại đúng mọi quyết định của 12 lượt S6:

```text
12 lượt, 528 đoạn, 174 lần ghép
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 26 filtered out; finished in 0.23s
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/latency-bench/src/latency.rs \
  crates/pipeline/src/config.rs \
  crates/pipeline/src/filter.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/segmenter.rs \
  crates/pipeline/src/sentence.rs
git commit -m "refactor(pipeline): luật cắt câu, ghép câu và bỏ đoạn chuyển vào pipeline (Đ3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Lọc câu ảo giác quen thuộc, đổi phồn thể sang giản thể

Hai việc "Việc cho MVP" của §6.4 (dòng 118, 120; QĐ4, QĐ5):
- `filter.rs`: `is_hallucination` và `verdict` (gộp luật `no_speech_prob` với bộ lọc câu ảo giác). Danh sách câu mặc định ở `config.rs` (`DEFAULT_HALLUCINATION_PHRASES`, có từ Task 2).
- `text.rs`: `display_text` đổi chữ của đoạn tiếng Trung sang giản thể bằng `ferrous-opencc` (bảng `t2s`, nạp một lần).
- `latency-bench` áp cả hai như app, và ghi lý do mới `hallucination` cho đoạn bị bỏ vì câu ảo giác. Test chạy lại S6 áp `display_text` cho cả hai phía, nên vẫn khớp từng quyết định cũ.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/latency-bench/src/latency.rs`
- Sửa: `crates/pipeline/Cargo.toml`
- Sửa: `crates/pipeline/src/filter.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Tạo: `crates/pipeline/src/text.rs`

- [ ] **Step 1: Thêm phụ thuộc và khai báo module**

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -10,6 +10,8 @@
 asr-protocol = { path = "../asr-protocol" }
 candle-core = "0.11.0"
 candle-onnx = "0.11.0"
+ferrous-opencc = { version = "0.4.0", default-features = false, features = ["t2s-conversion"] }
+log = "0.4.34"
 reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "json"] }
 serde.workspace = true
 serde_json.workspace = true
```

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -6,4 +6,5 @@
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
+pub mod text;
 pub mod vad;
```

Run: `cargo check -p pipeline`
Expected: cargo tải `ferrous-opencc` 0.4.0 cùng `ferrous-opencc-compiler`, `fst`, `rkyv` và các crate của chúng vào `Cargo.lock`, rồi `Finished`.

- [ ] **Step 2: Viết test**

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -979,13 +979,23 @@
         // Luật `no_speech` của pipeline (cần cả hai điều kiện), đặt tên lý do như Giai đoạn 0.
         assert_eq!(route(&rec("ko", "안녕", 0.9, -1.5)), Err("no_speech".into()));
         assert_eq!(route(&rec("ko", "안녕", 0.62, -0.25)), Ok(Lang::Ko));
+        assert_eq!(
+            route(&rec("en", "Thank you for watching!", 0.0, -0.2)),
+            Err("hallucination".into())
+        );
         assert_eq!(route(&rec("vi", "Xin chào", 0.0, -0.3)), Err("same_lang".into()));
         assert_eq!(route(&rec("fr", "Bonjour", 0.0, -0.3)), Err("lang_ngoai_tap:fr".into()));
     }
 
     #[test]
     fn dropped_segments_have_no_shown_time() {
-        for reason in ["no_speech", "too_short", "too_long", "empty_translation"] {
+        for reason in [
+            "no_speech",
+            "hallucination",
+            "too_short",
+            "too_long",
+            "empty_translation",
+        ] {
             let s = skipped(5_000, 5_400.0, reason);
             assert_eq!((s.shown_at_ms, s.first_shown_at_ms), (None, None), "{reason}");
         }
@@ -1120,6 +1130,7 @@
         assert_eq!(get("skipped_too_short"), 1.0);
         assert_eq!(get("skipped_same_lang"), 2.0);
         for zero in [
+            "skipped_hallucination",
             "skipped_too_long",
             "skipped_empty_translation",
             "skipped_lang_ngoai_tap",
@@ -1305,6 +1316,9 @@
     /// Luật bỏ đoạn và ghép câu đã chuyển sang `pipeline` (Đ3 của kế hoạch 00) cho đúng các quyết định của 12 lượt S6 cấu
     /// hình chốt, `bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json`: cùng lý do bỏ đoạn, cùng số đoạn ghép và
     /// cùng chữ nguồn đã gửi dịch, đoạn nào cũng vậy. Nhờ đó số đo S6 của lượt chốt vẫn là số đo của luật hiện tại.
+    ///
+    /// Hai luật mới của Giai đoạn 1 được áp như app: bộ lọc câu ảo giác không bỏ đoạn nào của 12 lượt này; chữ tiếng Trung
+    /// được đổi sang giản thể, nên chữ nguồn mong đợi là bản ghi cũ sau khi đổi.
     #[test]
     fn phase0_s6_decisions_replay_identically() {
         #[derive(Deserialize)]
@@ -1329,10 +1343,14 @@
             let mut segments = saved.segments;
             segments.sort_by_key(|s| s.id);
             let mut open = None;
-            for rec in &segments {
-                if matches!(rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG)) {
+            for saved_rec in &segments {
+                if matches!(saved_rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG)) {
                     continue; // không qua asr-worker, luồng MT không xét
                 }
+                let rec = &SegmentRecord {
+                    text: display_text(&saved_rec.lang, &saved_rec.text, &cfg.filter),
+                    ..saved_rec.clone()
+                };
                 let at = format!("{name}, đoạn {}", rec.id);
                 match route(rec, target, &cfg.filter) {
                     Err(reason) => {
@@ -1350,7 +1368,11 @@
                             rec.skipped
                         );
                         assert_eq!(rec.merged_segments, Some(merged), "{at}");
-                        assert_eq!(rec.translated_source.as_deref(), Some(source.as_str()), "{at}");
+                        let expected = rec
+                            .translated_source
+                            .as_deref()
+                            .map(|t| display_text(&rec.lang, t, &cfg.filter));
+                        assert_eq!(expected.as_deref(), Some(source.as_str()), "{at}");
                         merged_pieces += usize::from(merged > 1);
                     }
                 }
```

Sửa `crates/pipeline/src/filter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/filter.rs
+++ b/crates/pipeline/src/filter.rs
@@ -84,4 +84,59 @@
         assert!(is_no_speech(0.4, -0.6, "x", &loose));
         assert!(!is_no_speech(0.4, -0.6, "x", &FilterConfig::default()));
     }
+
+    #[test]
+    fn known_hallucinations_are_recognised() {
+        let cfg = FilterConfig::default();
+        for text in [
+            "Thank you for watching!",
+            "Thanks for watching. Thanks for watching.",
+            "Hãy subscribe cho kênh",
+            "[Music]",
+            "♪♪",
+            "...",
+            "ご視聴ありがとうございました",
+            "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
+            "시청해 주셔서 감사합니다.",
+        ] {
+            assert!(is_hallucination(text, &cfg), "{text:?}");
+        }
+    }
+
+    #[test]
+    fn real_sentences_are_kept() {
+        let cfg = FilterConfig::default();
+        for text in [
+            "Thank you.",
+            "Cảm ơn.",
+            "Thank you for watching the demo",
+            "Let's review the music budget",
+            "",
+            "   ",
+        ] {
+            assert!(!is_hallucination(text, &cfg), "{text:?}");
+        }
+    }
+
+    #[test]
+    fn the_phrase_list_comes_from_the_config() {
+        let cfg = FilterConfig {
+            hallucination_phrases: vec!["xin chào các bạn".into()],
+            ..FilterConfig::default()
+        };
+        assert!(is_hallucination("Xin chào các bạn!", &cfg));
+        assert!(!is_hallucination("Thank you for watching", &cfg));
+    }
+
+    #[test]
+    fn verdict_applies_the_no_speech_rule_first() {
+        let cfg = FilterConfig::default();
+        assert_eq!(verdict(0.9, -1.5, "Thank you for watching", &cfg), Verdict::NoSpeech);
+        assert_eq!(
+            verdict(0.0, -0.2, "Thank you for watching", &cfg),
+            Verdict::Hallucination
+        );
+        assert_eq!(verdict(0.0, -0.2, "Thank you.", &cfg), Verdict::Speech);
+        assert_eq!(verdict(0.0, -0.2, "", &cfg), Verdict::NoSpeech);
+    }
 }
```

Tạo `crates/pipeline/src/text.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Chữ chép lời trước khi hiện, ghép câu và dịch (spec §6.4, "Việc cho MVP"): `small` hay ra chữ phồn thể, app đổi sang
//! giản thể cho đoạn tiếng Trung.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traditional_chinese_becomes_simplified() {
        let cfg = FilterConfig::default();
        assert_eq!(
            display_text("zh", " 我們下週需要完成測試。 ", &cfg),
            "我们下周需要完成测试。"
        );
        assert_eq!(display_text("zh", "这个问题很复杂", &cfg), "这个问题很复杂");
    }

    #[test]
    fn only_chinese_is_converted_and_it_can_be_turned_off() {
        let cfg = FilterConfig::default();
        // Tiếng Nhật dùng kanji giống phồn thể: không được đổi.
        assert_eq!(display_text("ja", "會議を始めます", &cfg), "會議を始めます");
        let off = FilterConfig {
            simplify_chinese: false,
            ..FilterConfig::default()
        };
        assert_eq!(display_text("zh", "我們", &off), "我們");
    }
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi:

```text
error[E0433]: cannot find type `FilterConfig` in this scope
error[E0422]: cannot find struct, variant or union type `FilterConfig` in this scope
error[E0425]: cannot find function `is_hallucination` in this scope
error[E0425]: cannot find function `verdict` in this scope
error[E0433]: cannot find type `Verdict` in this scope
error[E0425]: cannot find function `display_text` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -8,11 +8,12 @@
 use asr_protocol::{MAX_PROMPT_TOKENS, MIN_AUDIO_CTX, TranscribeRequest, audio_ctx_for_samples};
 use pipeline::asr_client::AsrWorker;
 use pipeline::config::{FilterConfig, PipelineConfig};
-use pipeline::filter::{PcmSkip, is_no_speech, pcm_skip};
+use pipeline::filter::{PcmSkip, Verdict, pcm_skip, verdict};
 use pipeline::llama::{LlamaServer, max_tokens_for};
 use pipeline::prompt::{Lang, translation_prompt};
 use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
 use pipeline::sentence::{OpenSentence, Piece, merge_window_ms, plan_merge};
+use pipeline::text::display_text;
 use pipeline::vad::SileroVad;
 use serde::{Deserialize, Serialize};
 use std::collections::HashMap;
@@ -34,6 +35,8 @@
 /// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (`pipeline::filter::is_no_speech`), hoặc chữ rỗng:
 /// app bỏ đoạn này (spec §6.4, "Lọc lỗi ảo giác").
 const SKIP_NO_SPEECH: &str = "no_speech";
+/// Đoạn chỉ gồm câu ảo giác quen thuộc ("Thank you for watching"…) hoặc chỉ có ký hiệu: app bỏ (`pipeline::filter`).
+const SKIP_HALLUCINATION: &str = "hallucination";
 /// Đoạn ngắn hơn `MIN_PCM_SAMPLES`: không gửi cho `asr-worker`.
 const SKIP_TOO_SHORT: &str = "too_short";
 /// Đoạn dài hơn `MAX_PCM_SAMPLES`: không gửi cho `asr-worker`.
@@ -44,8 +47,9 @@
 const SKIP_SAME_LANG: &str = "same_lang";
 /// Ngôn ngữ ngoài tập của công cụ; ghi thành `lang_ngoai_tap:<mã>`.
 const SKIP_OTHER_LANG: &str = "lang_ngoai_tap";
-const SKIP_KINDS: [&str; 6] = [
+const SKIP_KINDS: [&str; 7] = [
     SKIP_NO_SPEECH,
+    SKIP_HALLUCINATION,
     SKIP_TOO_SHORT,
     SKIP_TOO_LONG,
     SKIP_EMPTY_TRANSLATION,
@@ -254,6 +258,7 @@
     let merge_window = merge_window_ms(args.end_silence_ms, &config.merge);
     let merge_config = config.merge.clone();
     let filter_config = config.filter.clone();
+    let asr_filter_config = config.filter.clone();
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
         // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
@@ -302,9 +307,10 @@
             tokens.drain(..excess);
             rec.lid_ms = result.lid_ms;
             rec.asr_ms = result.asr_ms;
+            // Chữ như app hiện và dịch: tiếng Trung đổi sang giản thể (`pipeline::text`).
+            rec.text = display_text(&result.lang, &result.text, &asr_filter_config);
             rec.lang = result.lang;
             rec.lang_prob = result.lang_prob;
-            rec.text = result.text;
             rec.no_speech_prob = result.no_speech_prob;
             rec.avg_logprob = result.avg_logprob;
             asr_tx.send(rec)?;
@@ -508,8 +514,10 @@
 
 /// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
 fn route(rec: &SegmentRecord, target: Lang, cfg: &FilterConfig) -> Result<Lang, String> {
-    if is_no_speech(rec.no_speech_prob, rec.avg_logprob, &rec.text, cfg) {
-        return Err(SKIP_NO_SPEECH.into());
+    match verdict(rec.no_speech_prob, rec.avg_logprob, &rec.text, cfg) {
+        Verdict::NoSpeech => return Err(SKIP_NO_SPEECH.into()),
+        Verdict::Hallucination => return Err(SKIP_HALLUCINATION.into()),
+        Verdict::Speech => {}
     }
     match Lang::from_code(&rec.lang) {
         Some(src) if src == target => Err(SKIP_SAME_LANG.into()),
@@ -523,7 +531,7 @@
 fn is_dropped(reason: &str) -> bool {
     matches!(
         reason,
-        SKIP_NO_SPEECH | SKIP_TOO_SHORT | SKIP_TOO_LONG | SKIP_EMPTY_TRANSLATION
+        SKIP_NO_SPEECH | SKIP_HALLUCINATION | SKIP_TOO_SHORT | SKIP_TOO_LONG | SKIP_EMPTY_TRANSLATION
     )
 }
 
```

Sửa `crates/pipeline/src/filter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/filter.rs
+++ b/crates/pipeline/src/filter.rs
@@ -1,5 +1,6 @@
 //! Luật bỏ đoạn ở tiến trình chính (spec §6.4, "Lọc lỗi ảo giác"), và giới hạn độ dài của đoạn gửi cho `asr-worker`.
-//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật.
+//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật. Bộ lọc câu ảo giác quen
+//! thuộc là luật mới của Giai đoạn 1 ("Việc cho MVP" của §6.4).
 //!
 //! Đoạn bị bỏ không có phụ đề, không vào prompt của đoạn sau, và không làm đổi ngôn ngữ của đoạn trước (§6.4).
 
@@ -33,6 +34,56 @@
 pub fn is_no_speech(no_speech_prob: f32, avg_logprob: f32, text: &str, cfg: &FilterConfig) -> bool {
     let silent = no_speech_prob > cfg.no_speech_prob_max && avg_logprob < cfg.avg_logprob_min;
     silent || text.trim().is_empty()
+}
+
+/// Kết quả của luật bỏ đoạn cho một đoạn đã chép lời.
+#[derive(Clone, Copy, Debug, PartialEq, Eq)]
+pub enum Verdict {
+    Speech,
+    /// Luật `no_speech_prob` và `avg_logprob`, hoặc chữ rỗng.
+    NoSpeech,
+    /// Chỉ gồm câu ảo giác quen thuộc, hoặc chỉ có dấu câu và ký hiệu.
+    Hallucination,
+}
+
+/// Áp cả hai luật. `text` là chữ đã qua `text::display_text`.
+pub fn verdict(no_speech_prob: f32, avg_logprob: f32, text: &str, cfg: &FilterConfig) -> Verdict {
+    if is_no_speech(no_speech_prob, avg_logprob, text, cfg) {
+        Verdict::NoSpeech
+    } else if is_hallucination(text, cfg) {
+        Verdict::Hallucination
+    } else {
+        Verdict::Speech
+    }
+}
+
+/// Dạng so khớp: chữ thường, chỉ giữ chữ và số (bỏ dấu câu, ký hiệu, khoảng trắng).
+fn normalize(text: &str) -> String {
+    text.chars()
+        .flat_map(char::to_lowercase)
+        .filter(|c| c.is_alphanumeric())
+        .collect()
+}
+
+/// Đoạn chỉ gồm câu ảo giác quen thuộc (`FilterConfig::hallucination_phrases`), có thể lặp nhiều lần, hoặc chỉ gồm dấu câu
+/// và ký hiệu (như "♪♪", "..."). Đoạn có thêm chữ khác thì giữ: "Thank you for watching the demo" là câu thật.
+pub fn is_hallucination(text: &str, cfg: &FilterConfig) -> bool {
+    let mut rest = normalize(text);
+    if rest.is_empty() {
+        return !text.trim().is_empty();
+    }
+    let mut phrases: Vec<String> = cfg
+        .hallucination_phrases
+        .iter()
+        .map(|p| normalize(p))
+        .filter(|p| !p.is_empty())
+        .collect();
+    // Cụm dài trước, để "thank you so much for watching" không bị cụm ngắn hơn cắt dở.
+    phrases.sort_by_key(|p| std::cmp::Reverse(p.len()));
+    for phrase in &phrases {
+        rest = rest.replace(phrase.as_str(), "");
+    }
+    rest.is_empty()
 }
 
 #[cfg(test)]
```

Thêm vào `crates/pipeline/src/text.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::FilterConfig;
use ferrous_opencc::OpenCC;
use ferrous_opencc::config::BuiltinConfig;
use std::sync::OnceLock;

/// Bộ đổi phồn thể sang giản thể của OpenCC (bảng Apache-2.0, crate `ferrous-opencc`), dựng một lần.
fn t2s() -> Option<&'static OpenCC> {
    static T2S: OnceLock<Option<OpenCC>> = OnceLock::new();
    T2S.get_or_init(|| match OpenCC::from_config(BuiltinConfig::T2s) {
        Ok(cc) => Some(cc),
        Err(e) => {
            log::error!("không dựng được bộ đổi phồn thể sang giản thể: {e}");
            None
        }
    })
    .as_ref()
}

/// Chữ để hiện, để dịch và để ghép câu. Tiếng Trung được đổi sang giản thể nếu bật `simplify_chinese`; ngôn ngữ khác giữ
/// nguyên. Khoảng trắng ở hai đầu bị cắt.
pub fn display_text(lang: &str, text: &str, cfg: &FilterConfig) -> String {
    let text = text.trim();
    if lang == "zh"
        && cfg.simplify_chinese
        && let Some(cc) = t2s()
    {
        return cc.convert(text);
    }
    text.to_string()
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline --lib && cargo test -p latency-bench`
Expected:

```text
test result: ok. 64 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
```

```text
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.27s
```

Run: `cargo test -p latency-bench phase0_s6 -- --nocapture`
Expected: vẫn khớp đủ 12 lượt:

```text
12 lượt, 528 đoạn, 174 lần ghép
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 26 filtered out; finished in 0.26s
```

- [ ] **Step 6: Clippy, định dạng, cargo deny**

Run: `cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check && cargo deny check`
Expected:

```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  crates/latency-bench/src/latency.rs \
  crates/pipeline/Cargo.toml \
  crates/pipeline/src/filter.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/text.rs
git commit -m "feat(pipeline): lọc câu ảo giác quen thuộc, đổi phồn thể sang giản thể (§6.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Client tiến trình phụ bản 2

Chuẩn bị mọi thứ mà phần giám sát (Task 6) cần từ hai client (dòng 82, 110, 116, 126, 128, 132–134, 143, 250; QĐ3, QĐ8):
- `prompt_history.rs`: prompt theo ngôn ngữ, tối đa 100 token, và cắt bớt để không hạ trần token của worker (QĐ3).
- `logfile.rs`: log của tiến trình phụ mở chế độ append, xoay vòng khi quá 1 MB, giữ 3 bản cũ.
- `process.rs`: process group và hook panic trên macOS, Job Object trên Windows (QĐ8); hàm `configure` áp cho mọi lệnh chạy tiến trình phụ.
- `llama.rs` bản 2:
  - `LlamaLaunch` gom mọi tham số chạy;
  - `command()` dựng đúng lệnh của §6.5, khóa API qua `LLAMA_API_KEY`, không bao giờ có `--api-key`;
  - `-ngl 0` khi chạy bằng CPU, thêm `extra_args`;
  - `ChatRequest` (`repeat_penalty` là `f64`, QĐ13);
  - `stream` gửi từng phần chữ qua callback, dừng được giữa chừng (`ControlFlow`), trả `StreamEnd`.
- `asr_client.rs` bản 2: `AsrLaunch`, lỗi có loại (`AsrError::Worker` mang `ErrorKind`, `AsrError::Crashed`), hết thời gian chờ thì kill worker.
- `sse.rs` đọc thêm `timings.predicted_n`. `config.rs` thêm thời gian chờ cho request dịch.
- `latency-bench` dùng API mới, không đổi hành vi; công cụ đo đặt thời gian chờ dài cho mỗi request (`TOOL_REQUEST_TIMEOUT`, 600 giây), vì không có phần giám sát.

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/latency-bench/src/asr_eval.rs`
- Sửa: `crates/latency-bench/src/latency.rs`
- Sửa: `crates/pipeline/Cargo.toml`
- Sửa: `crates/pipeline/src/asr_client.rs`
- Sửa: `crates/pipeline/src/config.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/llama.rs`
- Tạo: `crates/pipeline/src/logfile.rs`
- Tạo: `crates/pipeline/src/process.rs`
- Tạo: `crates/pipeline/src/prompt_history.rs`
- Sửa: `crates/pipeline/src/sse.rs`

- [ ] **Step 1: Thêm phụ thuộc và khai báo module**

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -10,11 +10,20 @@
 asr-protocol = { path = "../asr-protocol" }
 candle-core = "0.11.0"
 candle-onnx = "0.11.0"
+# Đổi phồn thể sang giản thể (spec §6.4, "Việc cho MVP"): bảng của OpenCC (Apache-2.0), thuần Rust.
 ferrous-opencc = { version = "0.4.0", default-features = false, features = ["t2s-conversion"] }
 log = "0.4.34"
 reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "json"] }
 serde.workspace = true
 serde_json.workspace = true
+thiserror.workspace = true
+
+[target.'cfg(unix)'.dependencies]
+libc = "0.2.189"
+
+[target.'cfg(windows)'.dependencies]
+# Job Object để tiến trình phụ không bị bỏ lại khi app chết (spec §5). Cùng bản với `audio-capture`.
+windows = { version = "0.62.2", features = ["Win32_Foundation", "Win32_Security", "Win32_System_JobObjects"] }
 
 [dev-dependencies]
 hound.workspace = true
```

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -2,7 +2,10 @@
 pub mod config;
 pub mod filter;
 pub mod llama;
+pub mod logfile;
+pub mod process;
 pub mod prompt;
+pub mod prompt_history;
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
```

- [ ] **Step 2: Viết test**

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -404,6 +404,18 @@
         assert_eq!(c.validate(), Ok(()));
     }
 
+    #[test]
+    fn max_tokens_follow_spec_formula() {
+        // §6.5: min(4 × số token câu gốc + 32, 512).
+        let mt = MtConfig::default();
+        assert_eq!(mt.max_tokens_for(0), 32);
+        assert_eq!(mt.max_tokens_for(10), 72);
+        assert_eq!(mt.max_tokens_for(119), 508);
+        assert_eq!(mt.max_tokens_for(120), 512);
+        assert_eq!(mt.max_tokens_for(121), 512);
+        assert_eq!(mt.max_tokens_for(usize::MAX), 512);
+    }
+
     /// Manifest chỉ ghi khóa muốn đổi: khóa thiếu lấy mặc định, khóa lạ bị bỏ qua.
     #[test]
     fn a_partial_manifest_keeps_the_other_defaults() {
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -238,30 +238,55 @@
 
     const ROLE: &str = "data: {\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":null}}]}\n\n";
 
+    fn read_all(body: impl BufRead) -> Result<StreamEnd> {
+        read_stream(body, Instant::now(), &mut |_| ControlFlow::Continue(()))
+    }
+
     #[test]
     fn stream_without_done_is_an_error() {
         let body = format!("{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n");
-        let err = read_stream(body.as_bytes(), Instant::now()).unwrap_err();
+        let err = read_all(body.as_bytes()).unwrap_err();
         assert!(err.to_string().contains("[DONE]"), "{err}");
     }
 
     #[test]
-    fn stream_keeps_text_and_finish_reason() {
+    fn stream_keeps_text_finish_reason_and_token_count() {
         let body = format!(
             "{ROLE}data: {{\"choices\":[{{\"delta\":{{\"content\":\"Xin\"}}}}]}}\n\n: keep-alive\n\n\
              data:{{\"choices\":[{{\"delta\":{{\"content\":\" chào \"}}}}]}}\r\n\r\n\
-             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}]}}\n\ndata: [DONE]\n\n"
-        );
-        let t = read_stream(body.as_bytes(), Instant::now()).unwrap();
-        assert_eq!(t.text, "Xin chào");
-        assert_eq!(t.finish_reason.as_deref(), Some("length"));
-        assert!(t.first_token_ms <= t.total_ms);
+             data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"length\"}}],\"timings\":{{\"predicted_n\":2}}}}\n\n\
+             data: [DONE]\n\n"
+        );
+        let end = read_all(body.as_bytes()).unwrap();
+        assert_eq!(end.text, "Xin chào ", "chữ nguyên văn, hậu xử lý làm sau");
+        assert_eq!(end.finish_reason.as_deref(), Some("length"));
+        assert_eq!((end.completion_tokens, end.chunks, end.cancelled), (Some(2), 2, false));
+        assert!(end.first_token_ms <= end.total_ms);
+    }
+
+    #[test]
+    fn breaking_from_the_callback_cancels_the_stream() {
+        let chunk = |c: &str| format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{c}\"}}}}]}}\n\n");
+        let body = format!("{}{}{}", chunk("a"), chunk("b"), chunk("c"));
+        let mut seen = Vec::new();
+        let end = read_stream(body.as_bytes(), Instant::now(), &mut |c| {
+            seen.push(c.to_string());
+            if seen.len() == 2 {
+                ControlFlow::Break(())
+            } else {
+                ControlFlow::Continue(())
+            }
+        })
+        .unwrap();
+        assert_eq!(seen, ["a", "b"]);
+        assert!(end.cancelled && end.finish_reason.is_none());
+        assert_eq!(end.text, "ab");
     }
 
     #[test]
     fn error_chunk_mid_stream_is_an_error() {
         let body = format!("{ROLE}data: {{\"error\":{{\"code\":500,\"message\":\"boom\"}}}}\n\n");
-        assert!(read_stream(body.as_bytes(), Instant::now()).is_err());
+        assert!(read_all(body.as_bytes()).is_err());
     }
 
     /// Đọc từng đoạn byte, mỗi đoạn tới sau một khoảng chờ: giả lập stream chậm mà không cần server.
@@ -294,38 +319,13 @@
             (wait, content_event("Xin")),
             (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
         ]);
-        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
-        assert_eq!(t.text, "Xin");
+        let end = read_all(BufReader::new(Paced(events))).unwrap();
+        assert_eq!(end.text.trim(), "Xin");
         assert!(
-            t.first_token_ms >= 80.0,
+            end.first_token_ms >= 80.0,
             "chữ đầu tới sau 80 ms, nhưng first_token_ms = {}",
-            t.first_token_ms
-        );
-    }
-
-    #[test]
-    fn token_count_is_length_of_tokens_array() {
-        assert_eq!(parse_token_count(r#"{"tokens":[1,22,333]}"#).unwrap(), 3);
-        assert_eq!(parse_token_count(r#"{"tokens":[]}"#).unwrap(), 0);
-    }
-
-    #[test]
-    fn token_count_rejects_bodies_without_tokens() {
-        assert!(parse_token_count("").is_err());
-        assert!(parse_token_count("<html>502 Bad Gateway</html>").is_err());
-        assert!(parse_token_count(r#"{"error":{"code":401,"message":"Invalid API Key"}}"#).is_err());
-        assert!(parse_token_count(r#"{"tokens":"abc"}"#).is_err());
-    }
-
-    #[test]
-    fn max_tokens_follow_spec_formula() {
-        // §6.5: min(4 × số token câu gốc + 32, 512).
-        assert_eq!(max_tokens_for(0), 32);
-        assert_eq!(max_tokens_for(10), 72);
-        assert_eq!(max_tokens_for(119), 508);
-        assert_eq!(max_tokens_for(120), 512);
-        assert_eq!(max_tokens_for(121), 512);
-        assert_eq!(max_tokens_for(usize::MAX), 512);
+            end.first_token_ms
+        );
     }
 
     #[test]
@@ -335,10 +335,98 @@
             (Duration::from_millis(20), content_event(" ")),
             (Duration::ZERO, b"data: [DONE]\n\n".to_vec()),
         ]);
-        let t = read_stream(BufReader::new(Paced(events)), Instant::now()).unwrap();
-        assert_eq!(t.text, "");
-        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc chunk trắng đầu tiên tới.
-        assert_eq!(t.first_token_ms, t.total_ms);
-        assert!(t.total_ms >= 20.0);
-    }
-}
+        let end = read_all(BufReader::new(Paced(events))).unwrap();
+        assert_eq!(end.text.trim(), "");
+        // Không có chữ nào: mốc "chữ đầu" rơi về lúc kết thúc, không phải lúc gói trắng đầu tiên tới.
+        assert_eq!(end.first_token_ms, end.total_ms);
+        assert!(end.total_ms >= 20.0);
+    }
+
+    #[test]
+    fn token_count_is_length_of_tokens_array() {
+        assert_eq!(parse_token_count(r#"{"tokens":[1,22,333]}"#).unwrap(), 3);
+        assert_eq!(parse_token_count(r#"{"tokens":[]}"#).unwrap(), 0);
+    }
+
+    #[test]
+    fn token_count_rejects_bodies_without_tokens() {
+        assert!(parse_token_count("").is_err());
+        assert!(parse_token_count("<html>502 Bad Gateway</html>").is_err());
+        assert!(parse_token_count(r#"{"error":{"code":401,"message":"Invalid API Key"}}"#).is_err());
+        assert!(parse_token_count(r#"{"tokens":"abc"}"#).is_err());
+    }
+
+    fn launch() -> LlamaLaunch {
+        LlamaLaunch::new(
+            Path::new("/app/llama-server"),
+            Path::new("/models/mt.gguf"),
+            Path::new("/logs/llama.log"),
+        )
+    }
+
+    fn args(cmd: &Command) -> Vec<String> {
+        cmd.get_args().map(|a| a.to_string_lossy().into_owned()).collect()
+    }
+
+    #[test]
+    fn api_key_goes_through_the_environment_not_the_command_line() {
+        let key = "0123456789abcdef0123456789abcdef";
+        let cmd = command(&launch(), 18_000, key);
+        let args = args(&cmd);
+        assert!(
+            args.iter().all(|a| !a.contains(key)),
+            "key không được nằm trong tham số: {args:?}"
+        );
+        assert!(!args.iter().any(|a| a == "--api-key"));
+        let env: Vec<_> = cmd.get_envs().collect();
+        assert_eq!(
+            env,
+            [(std::ffi::OsStr::new(API_KEY_ENV), Some(std::ffi::OsStr::new(key)))]
+        );
+    }
+
+    #[test]
+    fn command_follows_the_spec() {
+        let cmd = command(&launch(), 18_000, "k");
+        assert_eq!(
+            args(&cmd),
+            [
+                "-m",
+                "/models/mt.gguf",
+                "--host",
+                "127.0.0.1",
+                "--port",
+                "18000",
+                "-c",
+                "2048",
+                "-np",
+                "1",
+                "-ngl",
+                "auto",
+                "--no-ui"
+            ]
+        );
+    }
+
+    #[test]
+    fn cpu_mode_and_extra_args() {
+        let cpu = LlamaLaunch {
+            use_gpu: false,
+            extra_args: vec!["--no-repack".into()],
+            ..launch()
+        };
+        let args = args(&command(&cpu, 18_000, "k"));
+        let ngl = args.iter().position(|a| a == "-ngl").unwrap();
+        assert_eq!(args[ngl + 1], "0");
+        assert_eq!(args.last().map(String::as_str), Some("--no-repack"));
+        assert!(!args.iter().any(|a| a == "99"), "không bao giờ -ngl 99 (§6.5)");
+    }
+
+    #[test]
+    fn random_keys_are_128_bit_hex_and_differ() {
+        let (a, b) = (random_key(), random_key());
+        assert_eq!(a.len(), 32);
+        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
+        assert_ne!(a, b);
+    }
+}
```

Tạo `crates/pipeline/src/logfile.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! File log của tiến trình phụ (spec §6.4, "Việc cho MVP"): mở ở chế độ append để giữ log của lần chạy trước khi tiến
//! trình phụ khởi động lại (log crash), và xoay vòng để file không lớn mãi.
//!
//! Log của tiến trình phụ là stderr của `asr-worker` và `llama-server`: whisper.cpp, llama.cpp và ggml ghi thông số model,
//! thiết bị và lỗi, không ghi âm thanh hay nội dung chép lời. App chỉ ghi vào đây qua tiến trình phụ.

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    struct TempDir(PathBuf);
    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn temp(name: &str) -> TempDir {
        let dir = std::env::temp_dir().join(format!("pipeline-logfile-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        TempDir(dir)
    }

    fn write(path: &Path, bytes: usize) {
        let mut f = open_rotated(path, 100, 2).unwrap();
        f.write_all(&vec![b'x'; bytes]).unwrap();
    }

    #[test]
    fn appends_until_the_limit_then_rotates_on_open() {
        let dir = temp("rotate");
        let log = dir.0.join("logs/asr-worker.log");
        write(&log, 60);
        write(&log, 60); // 120 byte: lần mở sau mới xoay
        assert_eq!(std::fs::metadata(&log).unwrap().len(), 120);
        write(&log, 10);
        assert_eq!(std::fs::metadata(&log).unwrap().len(), 10);
        assert_eq!(std::fs::metadata(rotated(&log, 1)).unwrap().len(), 120);
    }

    #[test]
    fn keeps_only_the_newest_old_files() {
        let dir = temp("keep");
        let log = dir.0.join("llama-server.log");
        for round in 1..=4u8 {
            let mut f = open_rotated(&log, 5, 2).unwrap();
            f.write_all(&[b'0' + round; 10]).unwrap();
        }
        assert_eq!(std::fs::read(&log).unwrap(), [b'4'; 10]);
        assert_eq!(std::fs::read(rotated(&log, 1)).unwrap(), [b'3'; 10]);
        assert_eq!(std::fs::read(rotated(&log, 2)).unwrap(), [b'2'; 10]);
        assert!(!rotated(&log, 3).exists(), "chỉ giữ 2 file cũ");
    }
}
```

Tạo `crates/pipeline/src/process.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Chạy tiến trình phụ sao cho chúng không bị bỏ lại khi app chết (spec §5, "Việc cho MVP").
//!
//! App chính build với `panic = "abort"`, nên `Drop` không chạy khi app panic.
//! - macOS (Unix): mỗi tiến trình phụ là trưởng một process group riêng. [`install_panic_hook`] thêm một hook chạy trước khi
//!   abort, gửi `SIGKILL` cho mọi group còn sống. `asr-worker` còn tự thoát khi stdin đóng, kể cả khi app bị kill hẳn.
//! - Windows: mọi tiến trình phụ vào một Job Object có `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`. App chết bằng bất kỳ cách nào
//!   thì handle của job đóng, và Windows kill cả job. Tiến trình phụ chạy với `CREATE_NO_WINDOW`, vì app là ứng dụng GUI
//!   nên tiến trình console con sẽ bật cửa sổ console.
//!
//! Giới hạn trên macOS: app bị `SIGKILL` (Force Quit) hay crash vì tín hiệu thì hook không chạy, và `llama-server` còn lại
//! tới khi người dùng tắt nó. Lần chạy sau dùng cổng ngẫu nhiên khác nên không đụng nhau.

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[cfg(unix)]
    #[test]
    fn a_child_leads_its_own_process_group_and_is_killed_with_it() {
        let mut cmd = Command::new("sleep");
        cmd.arg("30");
        configure(&mut cmd);
        let mut child = cmd.spawn().unwrap();
        adopt(&child);
        let pid = child.id();
        assert!(live().contains(&pid));
        // SAFETY: chỉ đọc pgid của tiến trình con.
        let pgid = unsafe { libc::getpgid(pid as libc::pid_t) };
        assert_eq!(pgid, pid as libc::pid_t, "tiến trình phụ là trưởng group của nó");
        // Chỉ kill đúng tiến trình này: test khác chạy song song cũng có tiến trình phụ đang được ghi nhận.
        kill_group(pid);
        let deadline = Instant::now() + Duration::from_secs(5);
        let status = loop {
            if let Some(status) = child.try_wait().unwrap() {
                break status;
            }
            assert!(Instant::now() < deadline, "kill_group phải giết được tiến trình phụ");
            std::thread::sleep(Duration::from_millis(10));
        };
        use std::os::unix::process::ExitStatusExt;
        assert_eq!(status.signal(), Some(libc::SIGKILL));
        release(pid);
        assert!(!live().contains(&pid));
    }
}
```

Tạo `crates/pipeline/src/prompt_history.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Prompt khởi đầu cho `asr-worker` (spec §6.4, "Giải mã"): tối đa 100 token cuối của các đoạn trước cùng ngôn ngữ, giữ ở
//! tiến trình chính. Đoạn bị luật bỏ đoạn loại ra thì không vào đây (§6.4, "Lọc lỗi ảo giác").
//!
//! Việc cho MVP ở §6.4 ("Luật lặp khi prompt dài"): worker cho mỗi đoạn tối đa min(224 − độ dài prompt, 16 + 20 × số giây)
//! token mới. Prompt đủ 100 token (105 kể cả token đặc biệt) hạ trần còn 119, nên câu chép đôi dài từ 60 token không bị
//! luật lặp 2 bản bắt. Vì vậy app chỉ gửi phần prompt không làm trần theo độ dài bị hạ: trần của worker luôn là
//! `16 + 20 × số giây`, có prompt hay không. Đoạn 3 giây vẫn có đủ 100 token, đoạn 8,4 giây (8 giây cộng đệm) còn 35 token,
//! đoạn gộp 12 giây của hàng đợi (§7) không có prompt.

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLE_RATE as usize;

    #[test]
    fn budget_keeps_the_audio_cap_of_the_worker() {
        assert_eq!(prompt_budget(3 * SECOND, 100), 100); // trần 76: còn chỗ cho đủ 100
        assert_eq!(prompt_budget(134_400, 100), 35); // 8,4 giây: trần 184, 219 − 184 = 35
        assert_eq!(prompt_budget(12 * SECOND, 100), 0); // đoạn gộp 12 giây: trần 256 > 219
        for n in [SECOND, 5 * SECOND, 134_400, 10 * SECOND] {
            let k = prompt_budget(n, 100);
            // Công thức trần của worker với prompt k token: min(224 − (k + 5), 16 + 20 × giây).
            let cap_with_prompt = (TEXT_CTX_HALF - (k + 5)).min(audio_token_cap(n));
            assert_eq!(cap_with_prompt, audio_token_cap(n), "{n} mẫu");
        }
    }

    #[test]
    fn history_is_per_language_and_keeps_the_last_tokens() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..80).collect::<Vec<i32>>());
        h.push("en", &(80..130).collect::<Vec<i32>>());
        h.push("vi", &[7, 8]);
        let en = h.prompt_for(Some("en"), 3 * SECOND);
        assert_eq!(en.len(), 100);
        assert_eq!((en[0], en[99]), (30, 129));
        assert_eq!(h.prompt_for(Some("vi"), 3 * SECOND), [7, 8]);
        assert!(h.prompt_for(Some("ja"), 3 * SECOND).is_empty());
        assert!(h.prompt_for(None, 3 * SECOND).is_empty());
    }

    #[test]
    fn long_segments_get_the_tail_of_the_history() {
        let mut h = PromptHistory::new(100);
        h.push("en", &(0..100).collect::<Vec<i32>>());
        let p = h.prompt_for(Some("en"), 134_400);
        assert_eq!(p, (65..100).collect::<Vec<i32>>());
        assert!(h.prompt_for(Some("en"), 12 * SECOND).is_empty());
    }
}
```

Sửa `crates/pipeline/src/sse.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/sse.rs
+++ b/crates/pipeline/src/sse.rs
@@ -44,16 +44,19 @@
         let want = SseEvent::Delta {
             content: "Xin".into(),
             finish_reason: None,
+            completion_tokens: None,
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
     }
 
     #[test]
-    fn finish_chunk_has_empty_delta_and_reason() {
-        let line = r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
+    fn finish_chunk_has_empty_delta_reason_and_token_count() {
+        // Gói cuối thật của llama-server b11146 (rút gọn): `timings.predicted_n` là số token đã sinh.
+        let line = r#"data: {"choices":[{"finish_reason":"stop","index":0,"delta":{}}],"timings":{"prompt_n":32,"predicted_n":24}}"#;
         let want = SseEvent::Delta {
             content: String::new(),
             finish_reason: Some("stop".into()),
+            completion_tokens: Some(24),
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
     }
@@ -64,6 +67,7 @@
         let want = SseEvent::Delta {
             content: String::new(),
             finish_reason: None,
+            completion_tokens: None,
         };
         assert_eq!(parse_sse_line(line).unwrap(), want);
         assert_eq!(parse_sse_line("data:[DONE]\r").unwrap(), SseEvent::Done);
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi:

```text
error[E0425]: cannot find type `StreamEnd` in this scope
error[E0433]: cannot find type `ControlFlow` in this scope
error[E0425]: cannot find type `LlamaLaunch` in this scope
error[E0425]: cannot find value `API_KEY_ENV` in this scope
error[E0422]: cannot find struct, variant or union type `LlamaLaunch` in this scope
error[E0425]: cannot find type `PathBuf` in this scope
```

- [ ] **Step 4: Viết code**

Sửa `crates/latency-bench/src/asr_eval.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/asr_eval.rs
+++ b/crates/latency-bench/src/asr_eval.rs
@@ -2,7 +2,7 @@
 
 use anyhow::{Context, Result, bail};
 use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
-use pipeline::asr_client::AsrWorker;
+use pipeline::asr_client::{AsrLaunch, AsrWorker};
 use serde::{Deserialize, Serialize};
 use std::io::{BufRead, BufReader, BufWriter, Write};
 use std::path::PathBuf;
@@ -95,7 +95,13 @@
     let part = PathBuf::from(part);
     // Log theo lượt: bắt đầu lượt mới thì xóa log cũ cùng tên. Client vẫn mở append để giữ log khi worker khởi động lại.
     std::fs::File::create(&log).with_context(|| format!("không tạo được log {}", log.display()))?;
-    let (mut worker, ready) = AsrWorker::spawn(&args.asr_worker, &args.asr_model, args.use_gpu, args.threads, &log)?;
+    let launch = AsrLaunch {
+        use_gpu: args.use_gpu,
+        n_threads: args.threads,
+        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
+        ..AsrLaunch::new(&args.asr_worker, &args.asr_model, &log)
+    };
+    let (mut worker, ready) = AsrWorker::spawn(&launch)?;
     worker.warmup()?;
     println!(
         "asr: {} ({}), chế độ giải mã {}\n{}",
```

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -6,10 +6,10 @@
 use crate::stats::{Utterance, match_segments, percentile};
 use anyhow::{Context, Result, bail};
 use asr_protocol::{MAX_PROMPT_TOKENS, MIN_AUDIO_CTX, TranscribeRequest, audio_ctx_for_samples};
-use pipeline::asr_client::AsrWorker;
+use pipeline::asr_client::{AsrLaunch, AsrWorker};
 use pipeline::config::{FilterConfig, PipelineConfig};
 use pipeline::filter::{PcmSkip, Verdict, pcm_skip, verdict};
-use pipeline::llama::{LlamaServer, max_tokens_for};
+use pipeline::llama::{LlamaLaunch, LlamaServer};
 use pipeline::prompt::{Lang, translation_prompt};
 use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
 use pipeline::sentence::{OpenSentence, Piece, merge_window_ms, plan_merge};
@@ -30,6 +30,8 @@
 const FEED_LAG_WARN_MS: f64 = 100.0;
 /// Đoạn có mốc dừng sớm hơn mốc VAD của câu quá ngưỡng này (ms) thì câu bị gắn cờ `early_stop`.
 const EARLY_STOP_MS: i64 = 200;
+/// Timeout của một yêu cầu tới tiến trình phụ trong công cụ đo: rất rộng, vì đây không phải chỗ phát hiện worker treo.
+pub const TOOL_REQUEST_TIMEOUT: Duration = Duration::from_secs(600);
 
 // Lý do một đoạn không được dịch, ghi ở `SegmentRecord::skipped`.
 /// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (`pipeline::filter::is_no_speech`), hoặc chữ rỗng:
@@ -214,21 +216,29 @@
         ..config.segmenter.clone()
     });
 
-    let (mut asr, ready) = AsrWorker::spawn(
-        &args.asr_worker,
-        &args.asr_model,
-        args.use_gpu,
-        args.asr_threads,
-        &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
-    )?;
+    let asr_launch = AsrLaunch {
+        use_gpu: args.use_gpu,
+        n_threads: args.asr_threads,
+        // Công cụ đo không kill worker vì chậm: máy tham chiếu chạy bằng CPU có thể mất lâu với đoạn dài.
+        request_timeout: TOOL_REQUEST_TIMEOUT,
+        ..AsrLaunch::new(
+            &args.asr_worker,
+            &args.asr_model,
+            &args.log_dir.join(format!("asr-worker-{}.log", args.label)),
+        )
+    };
+    let (mut asr, ready) = AsrWorker::spawn(&asr_launch)?;
     let asr_warmup_ms = asr.warmup()?;
-    let llama_args: Vec<String> = args.llama_args.split_whitespace().map(String::from).collect();
-    let llama = LlamaServer::spawn(
-        &args.llama_server,
-        &args.mt_model,
-        &llama_args,
-        &args.log_dir.join(format!("llama-server-{}.log", args.label)),
-    )?;
+    let llama_launch = LlamaLaunch {
+        extra_args: args.llama_args.split_whitespace().map(String::from).collect(),
+        request_timeout: TOOL_REQUEST_TIMEOUT,
+        ..LlamaLaunch::new(
+            &args.llama_server,
+            &args.mt_model,
+            &args.log_dir.join(format!("llama-server-{}.log", args.label)),
+        )
+    };
+    let llama = LlamaServer::spawn(&llama_launch)?;
     llama.translate(&translation_prompt("Hello.", Lang::En, target), 32)?; // làm nóng
     println!(
         "asr: {} ({}), chế độ giải mã {}, làm nóng {asr_warmup_ms:.0} ms",
@@ -259,6 +269,7 @@
     let merge_config = config.merge.clone();
     let filter_config = config.filter.clone();
     let asr_filter_config = config.filter.clone();
+    let mt_config = config.mt.clone();
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
         // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
@@ -341,7 +352,7 @@
                         };
                         // Tính `max_tokens` theo §6.5, trên cả câu. Lần gọi /tokenize nằm trong thời gian của bước dịch.
                         let src_tokens = llama.count_tokens(&source)?;
-                        let max_tokens = max_tokens_for(src_tokens);
+                        let max_tokens = mt_config.max_tokens_for(src_tokens);
                         let t = llama.translate(&translation_prompt(&source, src, target), max_tokens)?;
                         let done = now_ms();
                         rec.merged_segments = Some(merged);
```

Thay toàn bộ `crates/pipeline/src/asr_client.rs` bằng:

```rust
//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).
//!
//! Lỗi chia hai loại, để bên giám sát (`supervisor`) biết khi nào phải khởi động lại worker:
//! - `AsrError::Worker`: worker trả `Error` cho yêu cầu (vẫn sống), kèm `ErrorKind`;
//! - `AsrError::Crashed`: worker chết, pipe hỏng, khung sai, lệch phiên bản giao thức, hoặc quá thời gian chờ (worker
//!   bị kill). Luồng giao thức không còn dùng được.

use crate::logfile;
use crate::process;
use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeRequest, TranscribeResult,
    read_frame, write_frame,
};
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum AsrError {
    #[error("asr-worker báo lỗi {kind:?}: {message}")]
    Worker { kind: ErrorKind, message: String },
    #[error("asr-worker không dùng được nữa: {0}")]
    Crashed(String),
}

impl AsrError {
    pub fn is_crash(&self) -> bool {
        matches!(self, Self::Crashed(_))
    }

    pub fn kind(&self) -> Option<ErrorKind> {
        match self {
            Self::Worker { kind, .. } => Some(*kind),
            Self::Crashed(_) => None,
        }
    }
}

/// Cách chạy một `asr-worker`.
#[derive(Clone, Debug)]
pub struct AsrLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// stderr của worker (log của whisper.cpp); mở nối tiếp và xoay vòng (`logfile`).
    pub log: PathBuf,
    pub use_gpu: bool,
    pub n_threads: u32,
    /// Chờ `Ready` sau `Load` (§6.5: lần đầu chạy binary mới thì chờ lâu hơn).
    pub ready_timeout: Duration,
    /// Chờ kết quả của một `Transcribe` hay `Warmup`; quá thì kill worker (§9).
    pub request_timeout: Duration,
    /// Chờ worker tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace: Duration,
    /// Biến môi trường thêm cho worker (test dùng để điều khiển worker giả).
    pub env: Vec<(String, String)>,
}

impl AsrLaunch {
    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
        Self {
            exe: exe.to_path_buf(),
            model: model.to_path_buf(),
            log: log.to_path_buf(),
            use_gpu: true,
            n_threads: 4,
            ready_timeout: Duration::from_secs(180),
            request_timeout: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(5),
            env: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct ReadyInfo {
    /// Thiết bị worker thật sự dùng (spec §6.4), không phải thiết bị được yêu cầu.
    pub backend: Backend,
    /// Chế độ B (`Shared`) hoặc chế độ A (`Split`), spec §6.4.
    pub decode_mode: DecodeMode,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Arc<Mutex<Child>>,
    pid: u32,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    /// Đường dẫn file log của worker, để thông báo lỗi chỉ chỗ xem log.
    log: PathBuf,
    request_timeout: Duration,
    shutdown_grace: Duration,
}

impl AsrWorker {
    /// Chạy worker, gửi `Load`, chờ `Ready` và kiểm phiên bản giao thức.
    pub fn spawn(launch: &AsrLaunch) -> Result<(Self, ReadyInfo), AsrError> {
        let crashed = |e: String| AsrError::Crashed(e);
        let log = logfile::open_rotated(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|e| crashed(format!("không mở được log {}: {e}", launch.log.display())))?;
        let mut cmd = Command::new(&launch.exe);
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log))
            .envs(launch.env.iter().map(|(k, v)| (k, v)));
        process::configure(&mut cmd);
        let mut child = cmd
            .spawn()
            .map_err(|e| crashed(format!("không chạy được {}: {e}", launch.exe.display())))?;
        process::adopt(&child);
        let pid = child.id();
        let stdin = BufWriter::new(child.stdin.take().expect("stdin là pipe"));
        let stdout = BufReader::new(child.stdout.take().expect("stdout là pipe"));
        let mut worker = Self {
            child: Arc::new(Mutex::new(child)),
            pid,
            stdin,
            stdout,
            log: launch.log.clone(),
            request_timeout: launch.request_timeout,
            shutdown_grace: launch.shutdown_grace,
        };
        let load = Request::Load {
            model_path: launch.model.display().to_string(),
            use_gpu: launch.use_gpu,
            n_threads: launch.n_threads,
        };
        match worker.call(&load, launch.ready_timeout)? {
            Response::Ready { protocol_version, .. } if protocol_version != PROTOCOL_VERSION => Err(crashed(format!(
                "asr-worker dùng giao thức phiên bản {protocol_version}, app cần {PROTOCOL_VERSION}: build lại cả hai cùng lúc"
            ))),
            Response::Ready {
                backend,
                decode_mode,
                whisper_version,
                system_info,
                ..
            } => Ok((
                worker,
                ReadyInfo {
                    backend,
                    decode_mode,
                    whisper_version,
                    system_info,
                },
            )),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(crashed(format!("phản hồi không mong đợi cho `Load`: {other:?}"))),
        }
    }

    pub fn pid(&self) -> u32 {
        self.pid
    }

    pub fn warmup(&mut self) -> Result<f32, AsrError> {
        match self.call(&Request::Warmup, self.request_timeout)? {
            Response::WarmupDone { millis } => Ok(millis),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!(
                "phản hồi không mong đợi cho `Warmup`: {other:?}"
            ))),
        }
    }

    pub fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrError> {
        let id = req.segment_id;
        match self.call(&Request::Transcribe(req), self.request_timeout)? {
            Response::Result(r) if r.segment_id == id => Ok(r),
            Response::Result(r) => Err(AsrError::Crashed(format!(
                "asr-worker trả kết quả đoạn {} khi đang chờ đoạn {id}",
                r.segment_id
            ))),
            Response::Error { kind, message, .. } => Err(AsrError::Worker { kind, message }),
            other => Err(AsrError::Crashed(format!("phản hồi không mong đợi: {other:?}"))),
        }
    }

    /// Gửi một yêu cầu và chờ phản hồi, tối đa `timeout`. Quá thời gian thì kill worker: lệnh đọc đang chặn nhận EOF
    /// ngay, và lỗi trả về là `Crashed`.
    fn call(&mut self, req: &Request, timeout: Duration) -> Result<Response, AsrError> {
        let (done_tx, done_rx) = mpsc::channel::<()>();
        let timed_out = Arc::new(AtomicBool::new(false));
        let watchdog = {
            let child = self.child.clone();
            let timed_out = timed_out.clone();
            std::thread::spawn(move || {
                if let Err(RecvTimeoutError::Timeout) = done_rx.recv_timeout(timeout) {
                    timed_out.store(true, Ordering::SeqCst);
                    let _ = child.lock().unwrap_or_else(|e| e.into_inner()).kill();
                }
            })
        };
        let res = write_frame(&mut self.stdin, req)
            .map_err(|e| format!("gửi yêu cầu cho asr-worker: {e}"))
            .and_then(|()| read_frame(&mut self.stdout).map_err(|e| format!("đọc phản hồi của asr-worker: {e}")))
            .and_then(|r| r.ok_or_else(|| "asr-worker đóng stdout".to_string()));
        let _ = done_tx.send(());
        let _ = watchdog.join();
        res.map_err(|e| {
            if timed_out.load(Ordering::SeqCst) {
                return AsrError::Crashed(format!("asr-worker không trả lời sau {timeout:?}, đã kill"));
            }
            // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
            let deadline = Instant::now() + Duration::from_millis(200);
            while Instant::now() < deadline {
                if let Ok(Some(status)) = self.child.lock().unwrap_or_else(|e| e.into_inner()).try_wait() {
                    return AsrError::Crashed(format!(
                        "{e}; asr-worker đã thoát ({status}), xem {}",
                        self.log.display()
                    ));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
            AsrError::Crashed(e)
        })
    }
}

impl Drop for AsrWorker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.stdin, &Request::Shutdown);
        let mut child = self.child.lock().unwrap_or_else(|e| e.into_inner());
        // Worker treo (ví dụ driver GPU lỗi) thì không chờ mãi: sau `shutdown_grace` thì kill.
        let deadline = Instant::now() + self.shutdown_grace;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                process::release(self.pid);
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = child.kill();
        let _ = child.wait();
        process::release(self.pid);
    }
}
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -1,15 +1,110 @@
 //! Chạy `llama-server` và gọi `/v1/chat/completions` ở chế độ stream (spec §6.5).
-
+//!
+//! - Lệnh chạy theo §6.5: `LLAMA_API_KEY=<ngẫu nhiên> llama-server -m <gguf> --host 127.0.0.1 --port <cổng trống> -c 2048
+//!   -np 1 -ngl auto --no-ui`. API key đi qua biến môi trường, chỉ đặt cho tiến trình `llama-server`, không qua tham số
+//!   dòng lệnh (hiện ra trong `ps`). Key tạo mới mỗi lần chạy và chỉ nằm trong RAM; không bao giờ vào log hay `Debug`.
+//! - Chạy bằng CPU (§9, chuyển sang CPU): `-ngl 0` thay cho `-ngl auto`. Không bao giờ truyền `-ngl 99`.
+//! - Mỗi gói SSE của `llama-server` b11146 chứa đúng một token (đã kiểm lúc lập kế hoạch 02: 24 gói chữ, `predicted_n`
+//!   24), nên hậu xử lý đếm gói để đo độ dài bản dịch trong lúc stream.
+
+use crate::logfile;
+use crate::process;
 use crate::sse::{SseEvent, parse_sse_line};
 use anyhow::{Context, Result, bail};
 use std::collections::hash_map::RandomState;
-use std::fs::File;
 use std::hash::{BuildHasher, Hasher};
 use std::io::{BufRead, BufReader};
 use std::net::TcpListener;
+use std::ops::ControlFlow;
 use std::path::{Path, PathBuf};
-use std::process::{Child, Command, Stdio};
+use std::process::{Child, Command, ExitStatus, Stdio};
 use std::time::{Duration, Instant};
+
+/// Tên biến môi trường mang API key (b11146 nhận cả `--api-key` lẫn biến này).
+pub const API_KEY_ENV: &str = "LLAMA_API_KEY";
+
+/// Cách chạy một `llama-server`.
+#[derive(Clone, Debug)]
+pub struct LlamaLaunch {
+    pub exe: PathBuf,
+    pub model: PathBuf,
+    /// stderr của server; mở nối tiếp và xoay vòng (`logfile`).
+    pub log: PathBuf,
+    /// `false`: chạy bằng CPU (`-ngl 0`).
+    pub use_gpu: bool,
+    /// Tham số thêm, ví dụ `--no-repack` khi thiếu RAM lúc chạy bằng CPU (§8).
+    pub extra_args: Vec<String>,
+    /// Chờ `/health` báo sẵn sàng.
+    pub ready_timeout: Duration,
+    /// Timeout của một request (cả stream).
+    pub request_timeout: Duration,
+}
+
+impl LlamaLaunch {
+    pub fn new(exe: &Path, model: &Path, log: &Path) -> Self {
+        Self {
+            exe: exe.to_path_buf(),
+            model: model.to_path_buf(),
+            log: log.to_path_buf(),
+            use_gpu: true,
+            extra_args: Vec::new(),
+            ready_timeout: Duration::from_secs(180),
+            request_timeout: Duration::from_secs(120),
+        }
+    }
+}
+
+/// Lệnh chạy theo §6.5. Tách riêng để test kiểm được tham số và biến môi trường mà không cần chạy server.
+pub fn command(launch: &LlamaLaunch, port: u16, api_key: &str) -> Command {
+    let mut cmd = Command::new(&launch.exe);
+    cmd.arg("-m")
+        .arg(&launch.model)
+        .args(["--host", "127.0.0.1", "--port", &port.to_string()])
+        .args(["-c", "2048", "-np", "1"])
+        .args(["-ngl", if launch.use_gpu { "auto" } else { "0" }])
+        .arg("--no-ui")
+        .args(&launch.extra_args)
+        .env(API_KEY_ENV, api_key)
+        .stdin(Stdio::null())
+        .stdout(Stdio::null());
+    process::configure(&mut cmd);
+    cmd
+}
+
+/// Một request dịch.
+#[derive(Clone, Copy, Debug)]
+pub struct ChatRequest<'a> {
+    pub prompt: &'a str,
+    pub max_tokens: u32,
+    pub repeat_penalty: f32,
+}
+
+/// Kết thúc một stream.
+#[derive(Clone, Debug, Default, PartialEq)]
+pub struct StreamEnd {
+    /// Chữ đã nhận, nguyên văn (chưa hậu xử lý).
+    pub text: String,
+    /// Từ lúc gửi request tới gói đầu có ký tự không phải khoảng trắng; không có chữ nào thì bằng `total_ms`.
+    pub first_token_ms: f32,
+    pub total_ms: f32,
+    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt). `None` nếu bị hủy giữa chừng.
+    pub finish_reason: Option<String>,
+    /// `timings.predicted_n` của gói cuối, nếu server gửi.
+    pub completion_tokens: Option<usize>,
+    /// Số gói có chữ (khác rỗng) đã nhận.
+    pub chunks: usize,
+    /// Bên gọi dừng stream giữa chừng (`on_delta` trả `Break`).
+    pub cancelled: bool,
+}
+
+/// Bản dịch đã xong, dạng cũ của Giai đoạn 0 (`latency-bench`).
+#[derive(Debug, Clone)]
+pub struct Translation {
+    pub text: String,
+    pub first_token_ms: f32,
+    pub total_ms: f32,
+    pub finish_reason: Option<String>,
+}
 
 pub struct LlamaServer {
     child: Child,
@@ -17,67 +112,66 @@
     api_key: String,
     http: reqwest::blocking::Client,
     log_path: PathBuf,
-}
-
-#[derive(Debug, Clone)]
-pub struct Translation {
-    pub text: String,
-    /// Từ lúc gửi request tới khi nhận chunk đầu tiên có ký tự không phải khoảng trắng. Bản dịch không có chữ nào
-    /// thì bằng `total_ms`.
-    pub first_token_ms: f32,
-    pub total_ms: f32,
-    /// "stop", hoặc "length" khi chạm `max_tokens` (bản dịch bị cụt).
-    pub finish_reason: Option<String>,
+    request_timeout: Duration,
+}
+
+// Debug viết tay: không in API key.
+impl std::fmt::Debug for LlamaServer {
+    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
+        f.debug_struct("LlamaServer")
+            .field("pid", &self.child.id())
+            .field("base_url", &self.base_url)
+            .field("api_key", &"<ẩn>")
+            .finish()
+    }
 }
 
 impl LlamaServer {
-    /// Lệnh chạy theo §6.5. `extra_args` dùng để thử tham số khác trong spike.
-    pub fn spawn(exe: &Path, model: &Path, extra_args: &[String], stderr_log: &Path) -> Result<Self> {
+    pub fn spawn(launch: &LlamaLaunch) -> Result<Self> {
         // Chỉ gọi 127.0.0.1: reqwest vẫn đọc HTTP_PROXY/ALL_PROXY kể cả khi tắt feature `system-proxy`,
         // nên phải tắt proxy tường minh, giống `ProxyHandler({})` trong common.py.
         // Dựng client trước khi chạy tiến trình, để lỗi ở đây không bỏ lại server mồ côi.
         let http = reqwest::blocking::Client::builder()
             .no_proxy()
-            .timeout(Duration::from_secs(120))
+            .timeout(launch.request_timeout)
             .build()?;
         let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
         let api_key = random_key();
-        // Ghi nối tiếp như common.py: chạy lại cùng nhãn không xóa log của lần server vừa chết.
-        let log = File::options()
-            .create(true)
-            .append(true)
-            .open(stderr_log)
-            .with_context(|| format!("không mở được {}", stderr_log.display()))?;
-        let child = Command::new(exe)
-            .arg("-m")
-            .arg(model)
-            .args([
-                "--host",
-                "127.0.0.1",
-                "--port",
-                &port.to_string(),
-                "--api-key",
-                &api_key,
-            ])
-            .args(["-c", "2048", "-np", "1", "-ngl", "auto", "--no-ui"])
-            .args(extra_args)
-            .stdout(Stdio::null())
+        let log = logfile::open_rotated(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
+            .with_context(|| format!("không mở được {}", launch.log.display()))?;
+        let child = command(launch, port, &api_key)
             .stderr(Stdio::from(log))
             .spawn()
-            .with_context(|| format!("không chạy được {}", exe.display()))?;
+            .with_context(|| format!("không chạy được {}", launch.exe.display()))?;
+        process::adopt(&child);
         let mut server = Self {
             child,
             base_url: format!("http://127.0.0.1:{port}"),
             api_key,
             http,
-            log_path: stderr_log.to_path_buf(),
+            log_path: launch.log.clone(),
+            request_timeout: launch.request_timeout,
         };
-        server.wait_healthy(Duration::from_secs(180))?;
+        server.wait_healthy(launch.ready_timeout)?;
         Ok(server)
     }
 
     pub fn pid(&self) -> u32 {
         self.child.id()
+    }
+
+    /// Mã thoát nếu server đã chết.
+    pub fn exited(&mut self) -> Option<ExitStatus> {
+        self.child.try_wait().ok().flatten()
+    }
+
+    /// `/health` trả 200 (không cần API key). 503 khi đang nạp model.
+    pub fn healthy(&self) -> bool {
+        self.http
+            .get(format!("{}/health", self.base_url))
+            .timeout(Duration::from_secs(2))
+            .send()
+            .is_ok_and(|r| r.status().is_success())
     }
 
     fn wait_healthy(&mut self, timeout: Duration) -> Result<()> {
@@ -87,13 +181,7 @@
                 bail!("llama-server thoát sớm ({status}), xem log {}", self.log_path.display());
             }
             // Mỗi lần hỏi chỉ chờ 2 giây, để tổng thời gian chờ không vượt `timeout` quá nhiều.
-            if let Ok(resp) = self
-                .http
-                .get(format!("{}/health", self.base_url))
-                .timeout(Duration::from_secs(2))
-                .send()
-                && resp.status().is_success()
-            {
+            if self.healthy() {
                 return Ok(());
             }
             std::thread::sleep(Duration::from_millis(200));
@@ -104,19 +192,20 @@
         )
     }
 
-    /// Dịch một prompt đã dựng sẵn (xem `prompt.rs`). Tham số sinh theo §6.5.
-    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
+    /// Dịch một prompt với tham số sinh của §6.5, stream tới hết. `on_delta` nhận từng gói chữ; trả `Break` để dừng
+    /// (đóng kết nối, server thôi sinh token).
+    pub fn stream(&self, req: &ChatRequest, on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd> {
         let body = serde_json::json!({
-            "messages": [{ "role": "user", "content": prompt }],
+            "messages": [{ "role": "user", "content": req.prompt }],
             "stream": true,
             "temperature": 0.0,
-            "repeat_penalty": 1.05,
-            "max_tokens": max_tokens,
+            "repeat_penalty": req.repeat_penalty,
+            "max_tokens": req.max_tokens,
             "cache_prompt": true,
         });
         let started = Instant::now();
         let resp = self.post("/v1/chat/completions", &body)?;
-        read_stream(BufReader::new(resp), started).with_context(|| {
+        read_stream(BufReader::new(resp), started, on_delta).with_context(|| {
             format!(
                 "đọc bản dịch từ llama-server thất bại, xem log {}",
                 self.log_path.display()
@@ -124,8 +213,24 @@
         })
     }
 
+    /// Dạng của Giai đoạn 0: repeat penalty 1,05, đọc tới hết, cắt khoảng trắng hai đầu.
+    pub fn translate(&self, prompt: &str, max_tokens: u32) -> Result<Translation> {
+        let req = ChatRequest {
+            prompt,
+            max_tokens,
+            repeat_penalty: 1.05,
+        };
+        let end = self.stream(&req, &mut |_| ControlFlow::Continue(()))?;
+        Ok(Translation {
+            text: end.text.trim().to_string(),
+            first_token_ms: end.first_token_ms,
+            total_ms: end.total_ms,
+            finish_reason: end.finish_reason,
+        })
+    }
+
     /// Số token của `text` theo tokenizer của model (`POST /tokenize`, giống `count_tokens` trong `common.py`),
-    /// để tính `max_tokens` theo [`max_tokens_for`].
+    /// để tính `max_tokens` (§6.5).
     pub fn count_tokens(&self, text: &str) -> Result<usize> {
         let resp = self.post("/tokenize", &serde_json::json!({ "content": text }))?;
         parse_token_count(&resp.text()?)
@@ -137,6 +242,7 @@
             .http
             .post(format!("{}{path}", self.base_url))
             .bearer_auth(&self.api_key)
+            .timeout(self.request_timeout)
             .json(body)
             .send()
             .with_context(|| {
@@ -154,12 +260,6 @@
     }
 }
 
-/// Số token tối đa của bản dịch theo §6.5: min(4 × số token câu gốc + 32, 512).
-pub fn max_tokens_for(source_tokens: usize) -> u32 {
-    const CAP: usize = 512;
-    source_tokens.saturating_mul(4).saturating_add(32).min(CAP) as u32
-}
-
 /// Đếm phần tử của `tokens` trong phản hồi của `/tokenize`. Tách khỏi `count_tokens` để test được không cần server.
 fn parse_token_count(body: &str) -> Result<usize> {
     let value: serde_json::Value =
@@ -170,25 +270,39 @@
     Ok(tokens.len())
 }
 
-/// Đọc stream tới `[DONE]`. Tách khỏi `translate` để test được bằng dữ liệu mẫu, không cần server.
-fn read_stream(reader: impl BufRead, started: Instant) -> Result<Translation> {
-    let mut text = String::new();
+/// Đọc stream tới `[DONE]`, hoặc tới khi `on_delta` trả `Break`. Tách khỏi `stream` để test được bằng dữ liệu mẫu, không
+/// cần server.
+fn read_stream(
+    reader: impl BufRead,
+    started: Instant,
+    on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
+) -> Result<StreamEnd> {
+    let mut end = StreamEnd::default();
     let mut first_token_ms = None;
-    let mut finish_reason = None;
     let mut done = false;
     for line in reader.lines() {
         match parse_sse_line(&line?)? {
             SseEvent::Delta {
                 content,
-                finish_reason: reason,
+                finish_reason,
+                completion_tokens,
             } => {
-                // Chunk chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
+                // Gói chỉ có khoảng trắng hay xuống dòng (model hay mở đầu bằng "\n") chưa phải chữ dịch:
                 // hậu xử lý (§6.5) sẽ cắt chúng, nên người xem chưa thấy gì.
                 if first_token_ms.is_none() && !content.trim().is_empty() {
                     first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                 }
-                text.push_str(&content);
-                finish_reason = reason.or(finish_reason);
+                end.finish_reason = finish_reason.or(end.finish_reason);
+                end.completion_tokens = completion_tokens.or(end.completion_tokens);
+                if !content.is_empty() {
+                    end.chunks += 1;
+                    end.text.push_str(&content);
+                    if on_delta(&content).is_break() {
+                        end.cancelled = true;
+                        done = true;
+                        break;
+                    }
+                }
             }
             SseEvent::Done => {
                 done = true;
@@ -200,26 +314,23 @@
     if !done {
         bail!(
             "stream kết thúc mà không có [DONE] (đã nhận {} ký tự): bản dịch có thể bị cụt",
-            text.chars().count()
+            end.text.chars().count()
         );
     }
-    let total_ms = started.elapsed().as_secs_f32() * 1000.0;
-    Ok(Translation {
-        text: text.trim().to_string(),
-        first_token_ms: first_token_ms.unwrap_or(total_ms),
-        total_ms,
-        finish_reason,
-    })
+    end.total_ms = started.elapsed().as_secs_f32() * 1000.0;
+    end.first_token_ms = first_token_ms.unwrap_or(end.total_ms);
+    Ok(end)
 }
 
 impl Drop for LlamaServer {
     fn drop(&mut self) {
         let _ = self.child.kill();
         let _ = self.child.wait();
-    }
-}
-
-/// Khóa ngẫu nhiên cho `--api-key`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
+        process::release(self.child.id());
+    }
+}
+
+/// Khóa ngẫu nhiên 128 bit cho `LLAMA_API_KEY`. `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
 fn random_key() -> String {
     (0..2)
         .map(|i| {
```

Thêm vào `crates/pipeline/src/logfile.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::fs::{File, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

/// Mỗi file tối đa 1 MB, giữ 3 file cũ (`.1` mới nhất tới `.3` cũ nhất), giống cách xoay log của app (kế hoạch 01, QĐ14).
pub const MAX_BYTES: u64 = 1_000_000;
pub const KEEP: usize = 3;

fn rotated(path: &Path, n: usize) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(format!(".{n}"));
    PathBuf::from(name)
}

/// Mở `path` để ghi nối tiếp. Nếu file đã lớn hơn `max_bytes` thì trước đó đổi tên thành `path.1` (các file cũ lùi một số,
/// file thứ `keep + 1` bị xóa). Xoay lúc mở, không xoay giữa chừng, vì tiến trình phụ giữ handle suốt đời chạy.
pub fn open_rotated(path: &Path, max_bytes: u64, keep: usize) -> io::Result<File> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if size > max_bytes && keep > 0 {
        let _ = std::fs::remove_file(rotated(path, keep));
        for n in (1..keep).rev() {
            let from = rotated(path, n);
            if from.exists() {
                std::fs::rename(&from, rotated(path, n + 1))?;
            }
        }
        std::fs::rename(path, rotated(path, 1))?;
    }
    OpenOptions::new().create(true).append(true).open(path)
}
```

Thêm vào `crates/pipeline/src/process.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::collections::HashSet;
use std::process::{Child, Command};
use std::sync::{Mutex, Once};

static LIVE: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

/// Đặt cờ cho lệnh chạy tiến trình phụ, trước `spawn`.
pub fn configure(cmd: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
}

/// Ghi nhận tiến trình phụ vừa chạy: vào Job Object (Windows) và danh sách để hook panic dọn (Unix).
pub fn adopt(child: &Child) {
    #[cfg(windows)]
    if let Err(e) = job::assign(child) {
        log::warn!("không đưa được tiến trình phụ {} vào Job Object: {e}", child.id());
    }
    LIVE.lock()
        .unwrap_or_else(|e| e.into_inner())
        .get_or_insert_with(HashSet::new)
        .insert(child.id());
}

/// Bỏ ghi nhận sau khi tiến trình phụ đã thoát và được `wait`: pid có thể được cấp lại cho tiến trình khác.
pub fn release(pid: u32) {
    if let Some(live) = LIVE.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
        live.remove(&pid);
    }
}

/// Các tiến trình phụ đang được ghi nhận (để test và để log lúc thoát).
pub fn live() -> Vec<u32> {
    let mut pids: Vec<u32> = LIVE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .flatten()
        .copied()
        .collect();
    pids.sort_unstable();
    pids
}

/// Gọi một lần lúc app khởi động: khi panic, kill mọi tiến trình phụ còn sống trước khi abort.
pub fn install_panic_hook() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            kill_all();
            previous(info);
        }));
    });
}

/// Kill mọi tiến trình phụ đang được ghi nhận. Trên Windows không cần: Job Object kill cả job khi app thoát.
pub fn kill_all() {
    for pid in live() {
        kill_group(pid);
    }
}

/// Unix: gửi `SIGKILL` cho cả group của tiến trình phụ `pid` (group có id bằng pid vì `process_group(0)`).
pub fn kill_group(pid: u32) {
    #[cfg(unix)]
    // SAFETY: `killpg` chỉ gửi tín hiệu.
    unsafe {
        libc::killpg(pid as libc::pid_t, libc::SIGKILL);
    }
    #[cfg(windows)]
    let _ = pid;
}

#[cfg(windows)]
mod job {
    use std::os::windows::io::AsRawHandle;
    use std::process::Child;
    use std::sync::OnceLock;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation, SetInformationJobObject,
    };
    use windows::core::PCWSTR;

    /// Handle của job, giữ tới hết đời tiến trình (không bao giờ đóng: đóng là kill hết tiến trình phụ).
    struct Job(HANDLE);
    // SAFETY: handle của kernel object dùng được từ mọi luồng.
    unsafe impl Send for Job {}
    unsafe impl Sync for Job {}

    fn job() -> windows::core::Result<&'static Job> {
        static JOB: OnceLock<Result<Job, windows::core::Error>> = OnceLock::new();
        JOB.get_or_init(|| {
            // SAFETY: tạo job không tên; `info` sống tới hết lệnh gọi.
            unsafe {
                let handle = CreateJobObjectW(None, PCWSTR::null())?;
                let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const std::ffi::c_void,
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )?;
                Ok(Job(handle))
            }
        })
        .as_ref()
        .map_err(Clone::clone)
    }

    pub fn assign(child: &Child) -> windows::core::Result<()> {
        let job = job()?;
        // SAFETY: handle của `child` còn hiệu lực trong lúc `child` còn sống.
        unsafe { AssignProcessToJobObject(job.0, HANDLE(child.as_raw_handle())) }
    }
}
```

Thêm vào `crates/pipeline/src/prompt_history.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use asr_protocol::SAMPLE_RATE;
use std::collections::{HashMap, VecDeque};

/// Nửa ngữ cảnh văn bản của Whisper (`n_text_ctx / 2`, mọi model Whisper đều là 448 / 2).
pub const TEXT_CTX_HALF: usize = 224;
/// `<|startofprev|>` cộng 4 token SOT, ngôn ngữ, task, notimestamps (xem `asr-worker/src/shared.rs`).
const PROMPT_OVERHEAD: usize = 5;

/// Trần token mới theo độ dài đoạn, đúng công thức của `asr-worker` (`max_new_tokens` trong `shared.rs`).
fn audio_token_cap(n_samples: usize) -> usize {
    16 + n_samples * 20 / SAMPLE_RATE as usize
}

/// Số token prompt tối đa cho một đoạn `n_samples` mẫu, để `224 − (prompt + 5) ≥ 16 + 20 × số giây`.
pub fn prompt_budget(n_samples: usize, max_tokens: usize) -> usize {
    (TEXT_CTX_HALF - PROMPT_OVERHEAD)
        .saturating_sub(audio_token_cap(n_samples))
        .min(max_tokens)
}

#[derive(Debug, Default)]
pub struct PromptHistory {
    per_lang: HashMap<String, VecDeque<i32>>,
    max_tokens: usize,
}

impl PromptHistory {
    pub fn new(max_tokens: usize) -> Self {
        Self {
            per_lang: HashMap::new(),
            max_tokens,
        }
    }

    /// Thêm token của một đoạn đã được giữ lại.
    pub fn push(&mut self, lang: &str, tokens: &[i32]) {
        let history = self.per_lang.entry(lang.to_string()).or_default();
        history.extend(tokens);
        let excess = history.len().saturating_sub(self.max_tokens);
        history.drain(..excess);
    }

    /// Prompt cho đoạn kế tiếp: token cuối của ngôn ngữ `prev_lang` (ngôn ngữ của đoạn trước), cắt theo `prompt_budget`.
    /// Worker chỉ dùng prompt này nếu đoạn mới vẫn là `prev_lang`.
    pub fn prompt_for(&self, prev_lang: Option<&str>, n_samples: usize) -> Vec<i32> {
        let Some(history) = prev_lang.and_then(|l| self.per_lang.get(l)) else {
            return Vec::new();
        };
        let take = prompt_budget(n_samples, self.max_tokens).min(history.len());
        history.iter().skip(history.len() - take).copied().collect()
    }
}
```

Sửa `crates/pipeline/src/sse.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/sse.rs
+++ b/crates/pipeline/src/sse.rs
@@ -4,10 +4,12 @@
 
 #[derive(Debug, PartialEq, Eq)]
 pub enum SseEvent {
-    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối.
+    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối. Gói cuối của `llama-server` còn có
+    /// `timings.predicted_n`: số token đã sinh.
     Delta {
         content: String,
         finish_reason: Option<String>,
+        completion_tokens: Option<usize>,
     },
     Done,
     /// Dòng trống, comment hoặc trường khác `data`.
@@ -31,6 +33,7 @@
     Ok(SseEvent::Delta {
         content: choice["delta"]["content"].as_str().unwrap_or_default().to_string(),
         finish_reason: choice["finish_reason"].as_str().map(String::from),
+        completion_tokens: value["timings"]["predicted_n"].as_u64().map(|n| n as usize),
     })
 }
 
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline && cargo test -p latency-bench`
Expected:

```text
test result: ok. 75 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

```text
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.26s
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  crates/latency-bench/src/asr_eval.rs \
  crates/latency-bench/src/latency.rs \
  crates/pipeline/Cargo.toml \
  crates/pipeline/src/asr_client.rs \
  crates/pipeline/src/config.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/llama.rs \
  crates/pipeline/src/logfile.rs \
  crates/pipeline/src/process.rs \
  crates/pipeline/src/prompt_history.rs \
  crates/pipeline/src/sse.rs
git commit -m "feat(pipeline): client asr-worker và llama-server bản 2, log xoay vòng, dọn tiến trình phụ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Tiến trình phụ giả, hậu xử lý bản dịch, dịch một câu

Dịch một câu đúng §6.5 (dòng 144–148, 247; QĐ11, QĐ12, QĐ14):
- `bin/fake_asr_worker.rs`, `bin/fake_llama_server.rs`: hai tiến trình phụ giả nói đúng giao thức thật, điều khiển bằng file kịch bản và biến môi trường (đầu mỗi file ghi các lệnh). Test lấy đường dẫn qua `env!("CARGO_BIN_EXE_…")`.
- `tests/clients.rs`: hai client của Task 4 chạy với tiến trình phụ giả: báo thiết bị thật, lệch phiên bản, lỗi nạp model có loại, crash và thiếu DLL, worker treo bị kill, stream với khóa lấy từ biến môi trường, chế độ CPU (`-ngl 0`, `extra_args`), server chết lúc khởi động.
- `postprocess.rs`: hậu xử lý trong lúc stream (nhãn, ngoặc kép, khoảng trắng, tỉ lệ token đếm theo gói SSE, xuống dòng kiểu lời giải thích, rỗng, bị cắt ở `max_tokens`).
- `translate.rs`: trait `Mt` (bản thật là `LlamaServer`, giám sát ở Task 6 bọc lại), `translate()` dựng prompt, tính `max_tokens`, stream qua hậu xử lý, thử lại một lần với repeat penalty 1,15.
- `config.rs`, `llama.rs`: chỉnh nhỏ cho hai phần trên.

**Files:**
- Tạo: `crates/pipeline/src/bin/fake_asr_worker.rs`
- Tạo: `crates/pipeline/src/bin/fake_llama_server.rs`
- Sửa: `crates/pipeline/src/config.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/llama.rs`
- Tạo: `crates/pipeline/src/postprocess.rs`
- Tạo: `crates/pipeline/src/translate.rs`
- Test (tạo): `crates/pipeline/tests/clients.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -3,6 +3,7 @@
 pub mod filter;
 pub mod llama;
 pub mod logfile;
+pub mod postprocess;
 pub mod process;
 pub mod prompt;
 pub mod prompt_history;
@@ -10,4 +11,5 @@
 pub mod sentence;
 pub mod sse;
 pub mod text;
+pub mod translate;
 pub mod vad;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/postprocess.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Hậu xử lý bản dịch ngay trong lúc stream (spec §6.5, "Hậu xử lý"), để phụ đề hiện dần từng chữ mà không lộ nhãn hay
//! lời giải thích.
//!
//! - Cắt khoảng trắng ở hai đầu; chuỗi khoảng trắng ở giữa gộp thành một dấu cách.
//! - Giữ lại phần đầu cho tới khi chắc không phải nhãn ("Translation:", "译文："…); nhãn thì bỏ.
//! - Ngoặc kép mở ở đầu (khi câu gốc không mở bằng ngoặc kép) không được hiện trong lúc stream; lúc kết thúc, nếu ngoặc
//!   kép đó bao quanh cả bản dịch thì bỏ cả cặp, còn không (ngoặc đóng nằm giữa câu) thì trả nó lại vào bản cuối. Trên S7,
//!   5/1240 bản dịch mở bằng ngoặc kép, không bản nào là ngoặc bao quanh: cả 5 được giữ nguyên.
//! - Vi phạm thì dừng stream ngay: quá ngưỡng tỉ lệ token (đếm gói SSE, mỗi gói một token), xuống dòng rồi viết tiếp khi
//!   câu gốc không có xuống dòng (dấu hiệu lời giải thích; S7 không có bản dịch đúng nào như vậy), bị cắt ở `max_tokens`,
//!   hoặc rỗng.

#[cfg(test)]
mod tests {
    use super::*;

    /// Đưa các gói vào, trả (các phần đã hiện, kết quả cuối).
    fn run(source: &str, chunks: &[&str], max: Option<usize>) -> (Vec<String>, Result<String, Violation>) {
        let mut pp = PostProcessor::new(source, max);
        let mut shown = Vec::new();
        for c in chunks {
            match pp.push(c) {
                Step::Emit(d) => shown.push(d),
                Step::Hold => {}
                Step::Stop(v) => return (shown, Err(v)),
            }
        }
        let end = pp.finish(Some("stop"));
        (shown, end)
    }

    #[test]
    fn plain_translation_streams_word_by_word() {
        let (shown, end) = run("Good morning", &["\n", "Chào", " buổi", "  sáng", " "], None);
        assert_eq!(shown, ["Chào", " buổi", " sáng"]);
        assert_eq!(end.unwrap(), "Chào buổi sáng");
    }

    #[test]
    fn labels_are_held_back_and_removed() {
        let (shown, end) = run("Hello", &["Trans", "lation", ":", " Xin", " chào"], None);
        assert_eq!(shown, ["Xin", " chào"]);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("你好", &["译文：", "Xin chào"], None);
        assert_eq!(end.unwrap(), "Xin chào");
        let (_, end) = run("Hi", &["BẢN DỊCH:", " Chào"], None);
        assert_eq!(end.unwrap(), "Chào");
    }

    #[test]
    fn a_word_that_only_looks_like_a_label_is_released() {
        let (shown, end) = run("La traduction est difficile", &["Translation", " is", " hard"], None);
        assert_eq!(shown, ["Translation is", " hard"]);
        assert_eq!(end.unwrap(), "Translation is hard");
    }

    #[test]
    fn surrounding_quotes_are_removed_when_the_source_has_none() {
        let (shown, end) = run("Let's go", &["“", "Đi", " thôi", "”"], None);
        assert_eq!(
            shown,
            ["Đi", " thôi"],
            "ngoặc mở không hiện, ngoặc đóng cuối được giữ lại"
        );
        assert_eq!(end.unwrap(), "Đi thôi");
        let (_, end) = run("Go", &["\"Đi.\""], None);
        assert_eq!(end.unwrap(), "Đi.");
    }

    #[test]
    fn quotes_that_do_not_surround_the_whole_text_are_kept() {
        // Như ja-vi-892 ở S7: ngoặc đóng nằm giữa câu.
        let chunks = ["“Cốc", " cốc.", " Có", " ai", " không?”", " Cô", " thì", " thầm."];
        let (shown, end) = run("コンコン。「誰かいますか？」彼女はささやいた。", &chunks, None);
        assert_eq!(shown.concat(), "Cốc cốc. Có ai không?” Cô thì thầm.");
        assert_eq!(
            end.unwrap(),
            "“Cốc cốc. Có ai không?” Cô thì thầm.",
            "bản cuối trả lại ngoặc mở"
        );
    }

    #[test]
    fn quotes_of_the_source_are_kept() {
        let (_, end) = run("\"Hello\"", &["\"", "Xin chào", "\""], None);
        assert_eq!(end.unwrap(), "\"Xin chào\"");
    }

    #[test]
    fn too_many_tokens_stop_the_stream() {
        let (shown, end) = run("Hi", &["a", " b", " c", " d"], Some(3));
        assert_eq!(shown, ["a", " b", " c"]);
        assert_eq!(end, Err(Violation::TooLong));
    }

    #[test]
    fn a_new_line_followed_by_more_text_is_an_explanation() {
        let (shown, end) = run("Hi", &["Chào", "\n", "\n", "(Giải", " thích)"], None);
        assert_eq!(shown, ["Chào"]);
        assert_eq!(end, Err(Violation::Explanation));
        // Xuống dòng ở cuối rồi hết: không phải lời giải thích.
        let (_, end) = run("Hi", &["Chào", "\n"], None);
        assert_eq!(end.unwrap(), "Chào");
        // Câu gốc có xuống dòng thì bản dịch được xuống dòng (gộp thành dấu cách khi hiện).
        let (_, end) = run("a\nb", &["x", "\n", "y"], None);
        assert_eq!(end.unwrap(), "x y");
    }

    #[test]
    fn truncated_or_empty_results_are_violations() {
        let mut pp = PostProcessor::new("Hi", None);
        assert_eq!(pp.push("Chào"), Step::Emit("Chào".into()));
        assert_eq!(pp.finish(Some("length")), Err(Violation::Truncated));
        let (_, end) = run("Hi", &["\n", " "], None);
        assert_eq!(end, Err(Violation::Empty));
        let (_, end) = run("Hi", &["Translation:"], None);
        assert_eq!(end, Err(Violation::Empty));
        // Stream kết thúc giữa một tiền tố của nhãn: vẫn là chữ.
        let (_, end) = run("Hi", &["Trans"], None);
        assert_eq!(end.unwrap(), "Trans");
    }
}
```

Tạo `crates/pipeline/src/translate.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này.

#[cfg(test)]
mod tests {
    use super::*;

    /// Server giả: mỗi request trả một danh sách gói định sẵn, và ghi lại tham số đã nhận.
    struct Scripted {
        replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>,
        requests: Vec<(String, u32, f64)>,
    }

    impl Mt for Scripted {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests
                .push((req.prompt.to_string(), req.max_tokens, req.repeat_penalty));
            let (chunks, finish) = self.replies.remove(0)?;
            let mut end = StreamEnd::default();
            for c in chunks {
                end.chunks += 1;
                end.text.push_str(c);
                if on_delta(c).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some(finish.into());
            Ok(end)
        }
    }

    fn job(text: &str) -> Job<'_> {
        Job {
            text,
            src: Lang::En,
            tgt: Lang::Vi,
            context: None,
        }
    }

    fn run(mt: &mut Scripted, job: &Job) -> (Vec<String>, Outcome) {
        let mut events = Vec::new();
        let outcome = translate(mt, job, &MtConfig::default(), &mut |e| {
            events.push(match e {
                Event::Delta(d) => d.to_string(),
                Event::Retry => "<retry>".into(),
            });
            ControlFlow::Continue(())
        });
        (events, outcome)
    }

    #[test]
    fn a_good_translation_is_streamed_and_done() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job("Good morning"));
        assert_eq!(events, ["Chào", " buổi", " sáng"]);
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts, t.source_tokens), ("Chào buổi sáng", 1, 2));
        // Prompt của app và tham số sinh của §6.5: 2 token nguồn → max_tokens 40, repeat penalty 1,05.
        assert_eq!(
            mt.requests,
            [(translation_prompt("Good morning", Lang::En, Lang::Vi), 40, 1.05)]
        );
    }

    #[test]
    fn a_rambling_translation_is_cut_and_retried_with_a_higher_penalty() {
        // 10 token nguồn, Anh→Việt 4,4: tối đa 44 gói.
        let source = "one two three four five six seven eight nine ten";
        let long: Vec<&str> = std::iter::repeat_n(" x", 60).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop")), Ok((vec!["một", " hai"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job(source));
        assert_eq!(events.iter().filter(|e| *e == "<retry>").count(), 1);
        assert_eq!(events.last().map(String::as_str), Some(" hai"));
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts), ("một hai", 2));
        let penalties: Vec<f64> = mt.requests.iter().map(|r| r.2).collect();
        assert_eq!(penalties, [1.05, 1.15]);
    }

    #[test]
    fn short_sources_are_not_held_to_the_ratio() {
        // 2 token nguồn (< 10): 60 gói vẫn được, chỉ chịu hạn mức sinh 40 token của server.
        let long: Vec<&str> = std::iter::repeat_n(" x", 30).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hi there"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 1),
            "{outcome:?}"
        );
    }

    #[test]
    fn two_failures_give_failed_and_the_source_is_shown() {
        let mut mt = Scripted {
            replies: vec![
                Ok((vec!["Chào", "\n", "Giải thích"], "stop")),
                Ok((vec!["Chào", " bạn"], "length")),
            ],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        match outcome {
            Outcome::Failed { reason, attempts, .. } => {
                assert_eq!(attempts, 2);
                assert_eq!(reason, "bị cắt ở max_tokens");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_request_error_is_retried_once_and_unavailable_stops_at_once() {
        let mut mt = Scripted {
            replies: vec![Err(MtError::Failed("mất kết nối".into())), Ok((vec!["Chào"], "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 2),
            "{outcome:?}"
        );
        let mut mt = Scripted {
            replies: vec![Err(MtError::Unavailable("quá 5 lần".into()))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert_eq!(outcome, Outcome::Unavailable("quá 5 lần".into()));
    }

    #[test]
    fn the_caller_can_cancel() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let outcome = translate(&mut mt, &job("Good morning"), &MtConfig::default(), &mut |_| {
            ControlFlow::Break(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
    }

    #[test]
    fn context_uses_the_background_template() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["B"], "stop"))],
            requests: vec![],
        };
        let with_context = Job {
            context: Some("câu trước"),
            ..job("next")
        };
        run(&mut mt, &with_context);
        assert!(mt.requests[0].0.starts_with("[Background Information]\ncâu trước"));
    }
}
```

Tạo `crates/pipeline/tests/clients.rs`:

```rust
//! Client của hai tiến trình phụ (spec §6.4, §6.5), chạy với tiến trình phụ giả (`src/bin/fake_*.rs`): không cần model.

use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest};
use pipeline::asr_client::{AsrError, AsrLaunch, AsrWorker};
use pipeline::llama::{ChatRequest, LlamaLaunch, LlamaServer};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::time::Duration;

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

/// Thư mục tạm riêng của một test, xóa khi xong.
struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-clients-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn plan(&self, name: &str, lines: &[&str]) -> PathBuf {
        let path = self.path(name);
        std::fs::write(&path, lines.join("\n")).unwrap();
        path
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn asr_launch(t: &Temp, plan: &[&str]) -> AsrLaunch {
    AsrLaunch {
        env: vec![
            ("FAKE_ASR_PLAN".into(), t.plan("asr-plan", plan).display().to_string()),
            ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
        ],
        request_timeout: Duration::from_millis(500),
        ..AsrLaunch::new(
            Path::new(FAKE_ASR),
            Path::new("/model.bin"),
            &t.path("logs/asr-worker.log"),
        )
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into(), "vi".into()],
        prompt_tokens: vec![1, 2, 3],
        audio_ctx: 512,
        prev_lang: Some("vi".into()),
    }
}

#[test]
fn asr_worker_transcribes_and_reports_the_real_backend() {
    let t = Temp::new("asr-ok");
    let (mut worker, ready) = AsrWorker::spawn(&asr_launch(&t, &["backend:cpu"])).unwrap();
    assert_eq!((ready.backend, ready.decode_mode), (Backend::Cpu, DecodeMode::Shared));
    assert_eq!(worker.warmup().unwrap(), 1.0);
    let r = worker.transcribe(request(7)).unwrap();
    assert_eq!((r.segment_id, r.lang.as_str(), r.text.as_str()), (7, "en", "đoạn 7"));
    drop(worker);
    let events = std::fs::read_to_string(t.path("asr-events")).unwrap();
    assert_eq!(events, "start use_gpu=true\nwarmup\ntranscribe 7 prev=vi prompt=3\n");
}

#[test]
fn a_worker_of_another_protocol_version_is_refused() {
    let t = Temp::new("asr-version");
    let err = AsrWorker::spawn(&asr_launch(&t, &["version:1"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash() && err.to_string().contains("phiên bản 1"), "{err}");
}

#[test]
fn load_errors_keep_their_kind() {
    let t = Temp::new("asr-oom");
    let err = AsrWorker::spawn(&asr_launch(&t, &["load_error:OutOfMemory"]))
        .map(|_| ())
        .unwrap_err();
    assert_eq!(err.kind(), Some(ErrorKind::OutOfMemory));
}

#[test]
fn a_crash_or_a_missing_dll_is_a_crash_with_the_exit_status() {
    let t = Temp::new("asr-crash");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["crash_on:1"])).unwrap();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(err.is_crash(), "{err}");
    assert!(err.to_string().contains("exit status: 3"), "{err}");
    // Windows thiếu vulkan-1.dll: tiến trình thoát trước khi nói gì (STATUS_DLL_NOT_FOUND). Mã giả ở đây là 135.
    let err = AsrWorker::spawn(&asr_launch(&t, &["exit_at_start:135"]))
        .map(|_| ())
        .unwrap_err();
    assert!(err.is_crash(), "{err}");
}

#[test]
fn a_hung_worker_is_killed_after_the_timeout() {
    let t = Temp::new("asr-hang");
    let (mut worker, _) = AsrWorker::spawn(&asr_launch(&t, &["hang_on:1"])).unwrap();
    let started = std::time::Instant::now();
    let err = worker.transcribe(request(1)).unwrap_err();
    assert!(
        matches!(&err, AsrError::Crashed(m) if m.contains("không trả lời")),
        "{err}"
    );
    assert!(started.elapsed() < Duration::from_secs(5));
}

fn llama_launch(t: &Temp, plan: &[&str]) -> LlamaLaunch {
    LlamaLaunch {
        env: vec![
            (
                "FAKE_LLAMA_PLAN".into(),
                t.plan("llama-plan", plan).display().to_string(),
            ),
            ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
        ],
        ready_timeout: Duration::from_secs(10),
        ..LlamaLaunch::new(
            Path::new(FAKE_LLAMA),
            Path::new("/mt.gguf"),
            &t.path("logs/llama-server.log"),
        )
    }
}

#[test]
fn llama_server_streams_deltas_with_the_key_from_the_environment() {
    let t = Temp::new("llama-ok");
    let server = LlamaServer::spawn(&llama_launch(&t, &["ok"])).unwrap();
    assert!(server.healthy());
    assert_eq!(server.count_tokens("xin chào các bạn").unwrap(), 4);
    let mut deltas = Vec::new();
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
    };
    let end = server
        .stream(&req, &mut |d| {
            deltas.push(d.to_string());
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(deltas, ["VI:", " Good", " morning", " everyone"]);
    assert_eq!(end.text, "VI: Good morning everyone");
    assert_eq!(
        (end.finish_reason.as_deref(), end.completion_tokens, end.chunks),
        (Some("stop"), Some(4), 4)
    );
    // Key không lộ ra `Debug`, log của server hay log sự kiện.
    let debug = format!("{server:?}");
    assert!(debug.contains("<ẩn>"), "{debug}");
    drop(server);
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events, "start ngl=auto extra=\nchat 1 repeat=1.05 max=64\n");
}

#[test]
fn cpu_mode_passes_ngl_0_and_extra_args() {
    let t = Temp::new("llama-cpu");
    let launch = LlamaLaunch {
        use_gpu: false,
        extra_args: vec!["--no-repack".into()],
        ..llama_launch(&t, &["ok"])
    };
    drop(LlamaServer::spawn(&launch).unwrap());
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events.lines().next(), Some("start ngl=0 extra=--no-repack"));
}

#[test]
fn a_server_that_dies_at_start_is_reported() {
    let t = Temp::new("llama-dead");
    let err = LlamaServer::spawn(&llama_launch(&t, &["exit_at_start:1"])).unwrap_err();
    assert!(err.to_string().contains("thoát sớm"), "{err}");
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --lib`
Expected: biên dịch lỗi:

```text
error[E0425]: cannot find type `Violation` in this scope
error[E0425]: cannot find type `MtError` in this scope
error[E0405]: cannot find trait `Mt` in this scope
error[E0425]: cannot find type `ChatRequest` in this scope
error[E0425]: cannot find type `ControlFlow` in this scope
error[E0425]: cannot find type `StreamEnd` in this scope
```

Run: `cargo test -p pipeline --test clients`
Expected: biên dịch lỗi, vì chưa có hai binary giả:

```text
error: environment variable `CARGO_BIN_EXE_fake_asr_worker` not defined at compile time
error: environment variable `CARGO_BIN_EXE_fake_llama_server` not defined at compile time
error[E0560]: struct `LlamaLaunch` has no field named `env`
```

- [ ] **Step 4: Viết code**

Tạo `crates/pipeline/src/bin/fake_asr_worker.rs`:

```rust
//! `asr-worker` giả, chỉ dùng trong test của `pipeline` (kế hoạch 00, mục 6.3: tiến trình phụ giả). Nói đúng giao thức của
//! `asr-protocol`, không cần model hay GPU.
//!
//! Điều khiển bằng biến môi trường:
//! - `FAKE_ASR_PLAN`: file kịch bản. Mỗi lần tiến trình chạy lấy dòng đầu (rồi bỏ dòng đó khỏi file); hết dòng thì là `ok`.
//!   Một dòng gồm các lệnh cách nhau bằng dấu cách:
//!   - `ok`: chạy bình thường;
//!   - `exit_at_start:<mã>`: thoát ngay với mã này (như thiếu `vulkan-1.dll`);
//!   - `load_error:<ModelLoad|OutOfMemory|GpuInit>`: trả `Error` cho `Load`;
//!   - `version:<n>`: `Ready` báo phiên bản giao thức `n`;
//!   - `backend:<cpu|metal|vulkan>`: thiết bị báo trong `Ready` (mặc định metal nếu xin GPU, cpu nếu không);
//!   - `mode:split`: báo chế độ A;
//!   - `crash_on:<n>`: thoát với mã 3, không trả lời, khi nhận `Transcribe` thứ `n` của lần chạy này;
//!   - `hang_on:<n>`: treo khi nhận `Transcribe` thứ `n`.
//! - `FAKE_ASR_LOG`: file ghi nối tiếp các sự kiện (`start use_gpu=…`, `transcribe <id> prev=<ngôn ngữ> prompt=<số token>`).
//! - `FAKE_ASR_TEXTS`: file, mỗi dòng `<ngôn ngữ>\t<chữ>`; đoạn có id `i` trả dòng `i % số dòng`. Thêm `\t!nospeech` ở cuối
//!   dòng thì trả `no_speech_prob` 0,9 và `avg_logprob` −1,5. Không đặt thì trả `đoạn <id>` bằng ngôn ngữ đầu tiên được phép.

use asr_protocol::{
    Backend, DecodeMode, ErrorKind, PROTOCOL_VERSION, Request, Response, TranscribeResult, read_frame, write_frame,
};
use std::io::{BufReader, BufWriter, Write};

struct Plan {
    exit_at_start: Option<i32>,
    load_error: Option<ErrorKind>,
    version: u32,
    backend: Option<Backend>,
    mode: DecodeMode,
    crash_on: Option<u32>,
    hang_on: Option<u32>,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_ASR_PLAN") else {
        return "ok".into();
    };
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("ok").to_string();
    let rest: Vec<&str> = lines.collect();
    std::fs::write(&path, rest.join("\n")).expect("ghi lại kịch bản");
    first
}

fn parse(line: &str) -> Plan {
    let mut plan = Plan {
        exit_at_start: None,
        load_error: None,
        version: PROTOCOL_VERSION,
        backend: None,
        mode: DecodeMode::Shared,
        crash_on: None,
        hang_on: None,
    };
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => plan.exit_at_start = value.parse().ok(),
            "load_error" => {
                plan.load_error = Some(match value {
                    "OutOfMemory" => ErrorKind::OutOfMemory,
                    "GpuInit" => ErrorKind::GpuInit,
                    _ => ErrorKind::ModelLoad,
                })
            }
            "version" => plan.version = value.parse().expect("số phiên bản"),
            "backend" => {
                plan.backend = Some(match value {
                    "cpu" => Backend::Cpu,
                    "vulkan" => Backend::Vulkan,
                    _ => Backend::Metal,
                })
            }
            "mode" if value == "split" => plan.mode = DecodeMode::Split,
            "crash_on" => plan.crash_on = value.parse().ok(),
            "hang_on" => plan.hang_on = value.parse().ok(),
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    plan
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_ASR_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log giả");
        writeln!(f, "{line}").unwrap();
    }
}

fn texts() -> Vec<(String, String, bool)> {
    let Some(path) = std::env::var_os("FAKE_ASR_TEXTS") else {
        return Vec::new();
    };
    std::fs::read_to_string(path)
        .expect("đọc FAKE_ASR_TEXTS")
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| {
            let mut parts = l.split('\t');
            let lang = parts.next().unwrap_or("en").to_string();
            let text = parts.next().unwrap_or("").to_string();
            (lang, text, parts.next() == Some("!nospeech"))
        })
        .collect()
}

fn main() {
    let plan = parse(&next_plan_line());
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    let texts = texts();
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let mut loaded = false;
    let mut transcribes = 0u32;
    while let Ok(Some(request)) = read_frame::<_, Request>(&mut input) {
        let response = match request {
            Request::Load { use_gpu, .. } => {
                log(&format!("start use_gpu={use_gpu}"));
                match plan.load_error {
                    Some(kind) => Response::Error {
                        segment_id: None,
                        kind,
                        message: format!("lỗi giả {kind:?}"),
                    },
                    None => {
                        loaded = true;
                        Response::Ready {
                            protocol_version: plan.version,
                            backend: plan
                                .backend
                                .unwrap_or(if use_gpu { Backend::Metal } else { Backend::Cpu }),
                            decode_mode: plan.mode,
                            whisper_version: "giả".into(),
                            system_info: String::new(),
                        }
                    }
                }
            }
            Request::Warmup => {
                log("warmup");
                Response::WarmupDone { millis: 1.0 }
            }
            Request::Transcribe(req) => {
                transcribes += 1;
                log(&format!(
                    "transcribe {} prev={} prompt={}",
                    req.segment_id,
                    req.prev_lang.as_deref().unwrap_or("-"),
                    req.prompt_tokens.len()
                ));
                if plan.crash_on == Some(transcribes) {
                    std::process::exit(3);
                }
                if plan.hang_on == Some(transcribes) {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));
                    }
                }
                if !loaded {
                    Response::Error {
                        segment_id: Some(req.segment_id),
                        kind: ErrorKind::NotLoaded,
                        message: "chưa nạp model".into(),
                    }
                } else {
                    let (lang, text, nospeech) = if texts.is_empty() {
                        (req.languages[0].clone(), format!("đoạn {}", req.segment_id), false)
                    } else {
                        texts[req.segment_id as usize % texts.len()].clone()
                    };
                    let tokens: Vec<i32> = (1..=text.split_whitespace().count() as i32).collect();
                    Response::Result(TranscribeResult {
                        segment_id: req.segment_id,
                        lang,
                        lang_prob: 1.0,
                        text,
                        tokens,
                        no_speech_prob: if nospeech { 0.9 } else { 0.0 },
                        lid_ms: 1.0,
                        asr_ms: 1.0,
                        avg_logprob: if nospeech { -1.5 } else { -0.2 },
                    })
                }
            }
            Request::Shutdown => break,
        };
        if write_frame(&mut output, &response).is_err() {
            break;
        }
    }
}
```

Tạo `crates/pipeline/src/bin/fake_llama_server.rs`:

```rust
//! `llama-server` giả, chỉ dùng trong test của `pipeline`. Nhận đúng tham số dòng lệnh và API của `llama-server` mà app
//! dùng (§6.5): `/health`, `/tokenize`, `/v1/chat/completions` với `stream: true`, API key trong `LLAMA_API_KEY`.
//!
//! Bản dịch giả: `VI: ` rồi chữ nguồn (phần sau dòng trống cuối cùng của prompt), mỗi từ một gói SSE. Điều khiển bằng biến
//! môi trường:
//! - `FAKE_LLAMA_PLAN`: file kịch bản, mỗi lần chạy lấy dòng đầu như `fake_asr_worker`. Lệnh:
//!   - `ok`; `exit_at_start:<mã>`;
//!   - `crash_on:<n>`: thoát với mã 3 khi nhận request dịch thứ `n` của lần chạy này, không trả lời;
//!   - `ramble`: bản dịch dài gấp 20 lần chữ nguồn (để thử ngưỡng tỉ lệ token);
//!   - `ramble_once`: như `ramble` nhưng chỉ ở request dịch đầu tiên;
//!   - `label`: thêm `Translation: ` vào đầu bản dịch; `quote`: bọc bản dịch trong ngoặc kép.
//! - `FAKE_LLAMA_LOG`: file ghi nối tiếp các sự kiện (`start ngl=…`, `chat <n> repeat=<p> max=<m>`). Không ghi API key.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};

#[derive(Default)]
struct Plan {
    exit_at_start: Option<i32>,
    crash_on: Option<u32>,
    ramble: bool,
    ramble_once: bool,
    label: bool,
    quote: bool,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_LLAMA_PLAN") else {
        return "ok".into();
    };
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("ok").to_string();
    let rest: Vec<&str> = lines.collect();
    std::fs::write(&path, rest.join("\n")).expect("ghi lại kịch bản");
    first
}

fn parse(line: &str) -> Plan {
    let mut plan = Plan::default();
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => plan.exit_at_start = value.parse().ok(),
            "crash_on" => plan.crash_on = value.parse().ok(),
            "ramble" => plan.ramble = true,
            "ramble_once" => plan.ramble_once = true,
            "label" => plan.label = true,
            "quote" => plan.quote = true,
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    plan
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_LLAMA_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log giả");
        writeln!(f, "{line}").unwrap();
    }
}

struct HttpRequest {
    method: String,
    path: String,
    authorization: Option<String>,
    body: String,
}

fn read_request(stream: &TcpStream) -> Option<HttpRequest> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    let mut parts = line.split_whitespace();
    let (method, path) = (parts.next()?.to_string(), parts.next()?.to_string());
    let (mut length, mut authorization) = (0usize, None);
    loop {
        let mut header = String::new();
        reader.read_line(&mut header).ok()?;
        let header = header.trim_end();
        if header.is_empty() {
            break;
        }
        let (name, value) = header.split_once(':')?;
        match name.to_ascii_lowercase().as_str() {
            "content-length" => length = value.trim().parse().ok()?,
            "authorization" => authorization = Some(value.trim().to_string()),
            _ => {}
        }
    }
    let mut body = vec![0; length];
    reader.read_exact(&mut body).ok()?;
    Some(HttpRequest {
        method,
        path,
        authorization,
        body: String::from_utf8_lossy(&body).into_owned(),
    })
}

fn respond(mut stream: &TcpStream, status: &str, content_type: &str, body: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let plan = parse(&next_plan_line());
    log(&format!(
        "start ngl={} extra={}",
        arg("-ngl").unwrap_or_default(),
        args.iter()
            .skip_while(|a| *a != "--no-ui")
            .skip(1)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    ));
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    let key = std::env::var("LLAMA_API_KEY").unwrap_or_default();
    if key.is_empty() {
        eprintln!("thiếu LLAMA_API_KEY");
        std::process::exit(2);
    }
    let host = arg("--host").expect("--host");
    let port = arg("--port").expect("--port");
    let listener = TcpListener::bind(format!("{host}:{port}")).expect("mở cổng");
    let mut chats = 0u32;
    for stream in listener.incoming() {
        let Ok(stream) = stream else { continue };
        let Some(req) = read_request(&stream) else { continue };
        if req.method == "GET" && req.path == "/health" {
            respond(&stream, "200 OK", "application/json", r#"{"status":"ok"}"#);
            continue;
        }
        if req.authorization.as_deref() != Some(&format!("Bearer {key}")) {
            respond(
                &stream,
                "401 Unauthorized",
                "application/json",
                r#"{"error":"Invalid API Key"}"#,
            );
            continue;
        }
        let body: serde_json::Value = serde_json::from_str(&req.body).unwrap_or_default();
        match req.path.as_str() {
            "/tokenize" => {
                let n = body["content"].as_str().unwrap_or("").split_whitespace().count();
                let tokens: Vec<usize> = (1..=n).collect();
                respond(
                    &stream,
                    "200 OK",
                    "application/json",
                    &serde_json::json!({ "tokens": tokens }).to_string(),
                );
            }
            "/v1/chat/completions" => {
                chats += 1;
                log(&format!(
                    "chat {chats} repeat={} max={}",
                    body["repeat_penalty"], body["max_tokens"]
                ));
                if plan.crash_on == Some(chats) {
                    std::process::exit(3);
                }
                let prompt = body["messages"][0]["content"].as_str().unwrap_or("");
                let source = prompt.rsplit("\n\n").next().unwrap_or("");
                let mut words: Vec<String> = vec!["VI:".into()];
                words.extend(source.split_whitespace().map(String::from));
                if plan.ramble || (plan.ramble_once && chats == 1) {
                    let copy = words.clone();
                    for _ in 0..19 {
                        words.extend(copy.iter().cloned());
                    }
                }
                if plan.quote {
                    words[0] = format!("\"{}", words[0]);
                    let last = words.len() - 1;
                    words[last] = format!("{}\"", words[last]);
                }
                if plan.label {
                    words.insert(0, "Translation:".into());
                }
                let max = body["max_tokens"].as_u64().unwrap_or(512) as usize;
                let finish = if words.len() > max { "length" } else { "stop" };
                words.truncate(max);
                let mut sse = String::new();
                for (i, w) in words.iter().enumerate() {
                    let piece = if i == 0 { w.clone() } else { format!(" {w}") };
                    let chunk = serde_json::json!({ "choices": [{ "index": 0, "delta": { "content": piece } }] });
                    sse.push_str(&format!("data: {chunk}\n\n"));
                }
                let last = serde_json::json!({
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": finish }],
                    "timings": { "predicted_n": words.len() },
                });
                sse.push_str(&format!("data: {last}\n\ndata: [DONE]\n\n"));
                respond(&stream, "200 OK", "text/event-stream", &sse);
            }
            _ => respond(&stream, "404 Not Found", "text/plain", "không có"),
        }
    }
}
```

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -126,9 +126,9 @@
 #[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
 #[serde(default)]
 pub struct MtConfig {
-    pub repeat_penalty: f32,
+    pub repeat_penalty: f64,
     /// Lần thử lại duy nhất dùng repeat penalty cao hơn: với temperature 0, giữ nguyên tham số thì ra y hệt lần trước.
-    pub retry_repeat_penalty: f32,
+    pub retry_repeat_penalty: f64,
     /// Số token tối đa = min(`max_tokens_per_source_token` × số token câu gốc + `max_tokens_extra`, `max_tokens_cap`).
     pub max_tokens_per_source_token: u32,
     pub max_tokens_extra: u32,
```

Sửa `crates/pipeline/src/llama.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/llama.rs
+++ b/crates/pipeline/src/llama.rs
@@ -38,6 +38,8 @@
     pub ready_timeout: Duration,
     /// Timeout của một request (cả stream).
     pub request_timeout: Duration,
+    /// Biến môi trường thêm cho server (test dùng để điều khiển server giả).
+    pub env: Vec<(String, String)>,
 }
 
 impl LlamaLaunch {
@@ -50,6 +52,7 @@
             extra_args: Vec::new(),
             ready_timeout: Duration::from_secs(180),
             request_timeout: Duration::from_secs(120),
+            env: Vec::new(),
         }
     }
 }
@@ -64,6 +67,7 @@
         .args(["-ngl", if launch.use_gpu { "auto" } else { "0" }])
         .arg("--no-ui")
         .args(&launch.extra_args)
+        .envs(launch.env.iter().map(|(k, v)| (k, v)))
         .env(API_KEY_ENV, api_key)
         .stdin(Stdio::null())
         .stdout(Stdio::null());
@@ -76,7 +80,7 @@
 pub struct ChatRequest<'a> {
     pub prompt: &'a str,
     pub max_tokens: u32,
-    pub repeat_penalty: f32,
+    pub repeat_penalty: f64,
 }
 
 /// Kết thúc một stream.
```

Thêm vào `crates/pipeline/src/postprocess.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
/// Nhãn đầu câu hay gặp, viết thường. So khớp không phân biệt hoa thường.
const LABELS: &[&str] = &[
    "translation:",
    "translated text:",
    "translated:",
    "bản dịch:",
    "dịch:",
    "译文：",
    "译文:",
    "翻译：",
    "翻译:",
    "翻訳：",
    "訳文：",
    "번역:",
    "번역：",
];

/// Cặp ngoặc kép mở và đóng.
const QUOTES: &[(char, char)] = &[
    ('"', '"'),
    ('“', '”'),
    ('«', '»'),
    ('「', '」'),
    ('『', '』'),
    ('‘', '’'),
    ('\'', '\''),
];

fn opening_quote(c: char) -> Option<(char, char)> {
    QUOTES.iter().copied().find(|&(open, _)| open == c)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Violation {
    /// Quá ngưỡng tỉ lệ token của cặp ngôn ngữ.
    TooLong,
    /// Xuống dòng rồi viết tiếp, khi câu gốc không có xuống dòng.
    Explanation,
    /// Chạm `max_tokens` (`finish_reason` là "length").
    Truncated,
    /// Không có chữ nào.
    Empty,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    /// Phần chữ mới được hiện (không rỗng).
    Emit(String),
    /// Chưa có gì để hiện.
    Hold,
    /// Dừng stream.
    Stop(Violation),
}

#[derive(Debug)]
pub struct PostProcessor {
    source_opens_with_quote: bool,
    source_has_newline: bool,
    raw: String,
    /// Đã qua phần đầu (nhãn, ngoặc mở): `body_start` là byte đầu của phần thân trong `raw`.
    body_start: Option<usize>,
    quote: Option<(char, char)>,
    emitted: String,
    chunks: usize,
    max_chunks: Option<usize>,
}

impl PostProcessor {
    /// `max_chunks`: số gói (token) tối đa trước khi coi là quá dài; `None` là không kiểm tỉ lệ.
    pub fn new(source: &str, max_chunks: Option<usize>) -> Self {
        let source = source.trim();
        Self {
            source_opens_with_quote: source.chars().next().and_then(opening_quote).is_some(),
            source_has_newline: source.contains('\n'),
            raw: String::new(),
            body_start: None,
            quote: None,
            emitted: String::new(),
            chunks: 0,
            max_chunks,
        }
    }

    /// Nhận một gói chữ của stream.
    pub fn push(&mut self, chunk: &str) -> Step {
        self.chunks += 1;
        if self.max_chunks.is_some_and(|max| self.chunks > max) {
            return Step::Stop(Violation::TooLong);
        }
        self.raw.push_str(chunk);
        if self.body_start.is_none() && !self.decide_head() {
            return Step::Hold;
        }
        match self.visible() {
            Err(v) => Step::Stop(v),
            // Phần hiện luôn nối dài phần đã hiện (chỉ phần đuôi được giữ lại); phòng hờ thì không hiện gì thêm.
            Ok(visible) if !visible.starts_with(&self.emitted) => Step::Hold,
            Ok(visible) => {
                let delta = visible[self.emitted.len()..].to_string();
                if delta.is_empty() {
                    Step::Hold
                } else {
                    self.emitted.push_str(&delta);
                    Step::Emit(delta)
                }
            }
        }
    }

    /// Kết thúc stream. Trả bản dịch cuối, có thể khác phần đã hiện ở chỗ ngoặc kép (xem đầu file).
    pub fn finish(&self, finish_reason: Option<&str>) -> Result<String, Violation> {
        if finish_reason == Some("length") {
            return Err(Violation::Truncated);
        }
        let Some(start) = self.body_start else {
            // Stream kết thúc khi còn đang giữ phần đầu: chỉ có khoảng trắng, nhãn, hay tiền tố của nhãn.
            let head = self.raw.trim();
            let lower = head.to_lowercase();
            return if head.is_empty() || LABELS.iter().any(|l| lower == *l) {
                Err(Violation::Empty)
            } else {
                Ok(collapse(head))
            };
        };
        let body = collapse(self.raw[start..].trim());
        let text = match self.quote {
            Some((open, close)) => match body.strip_suffix(close) {
                // Ngoặc bao quanh cả câu: bên trong không còn ngoặc đóng cùng loại.
                Some(inner) if !inner.contains(close) => inner.trim_end().to_string(),
                _ => format!("{open}{body}"),
            },
            None => body,
        };
        if text.is_empty() {
            Err(Violation::Empty)
        } else {
            Ok(text)
        }
    }

    /// Bỏ khoảng trắng đầu, nhãn và ngoặc mở. Trả `false` nếu còn phải chờ thêm chữ mới biết.
    fn decide_head(&mut self) -> bool {
        let lead = self.raw.len() - self.raw.trim_start().len();
        let mut start = lead;
        let head = &self.raw[start..];
        if head.is_empty() {
            return false;
        }
        let lower = head.to_lowercase();
        if let Some(label) = LABELS.iter().find(|l| lower.starts_with(**l)) {
            // `to_lowercase` có thể đổi độ dài byte với vài chữ; nhãn ở đây giữ nguyên độ dài khi viết thường.
            start += label.len();
            start += self.raw[start..].len() - self.raw[start..].trim_start().len();
        } else if LABELS.iter().any(|l| l.starts_with(&lower)) {
            return false;
        }
        let rest = &self.raw[start..];
        let Some(first) = rest.chars().next() else {
            return false;
        };
        if !self.source_opens_with_quote
            && let Some(pair) = opening_quote(first)
        {
            self.quote = Some(pair);
            start += first.len_utf8();
        }
        self.body_start = Some(start);
        true
    }

    /// Phần thân được phép hiện: khoảng trắng gộp, khoảng trắng cuối và ngoặc đóng cuối (khi đã giấu ngoặc mở) còn giữ lại.
    fn visible(&self) -> Result<String, Violation> {
        let body = &self.raw[self.body_start.expect("đã qua phần đầu")..];
        let body = body.trim_start();
        let trimmed = body.trim_end();
        if !self.source_has_newline && trimmed.contains('\n') {
            return Err(Violation::Explanation);
        }
        let mut text = collapse(trimmed);
        if let Some((_, close)) = self.quote
            && text.ends_with(close)
        {
            text.pop();
        }
        Ok(text)
    }
}

/// Gộp mọi chuỗi khoảng trắng thành một dấu cách.
fn collapse(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
```

Thêm vào `crates/pipeline/src/translate.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::config::MtConfig;
use crate::llama::{ChatRequest, LlamaServer, StreamEnd};
use crate::postprocess::{PostProcessor, Step, Violation};
use crate::prompt::{Lang, context_prompt, translation_prompt};
use std::ops::ControlFlow;
use std::time::Instant;

/// Lỗi phía server dịch.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MtError {
    /// Server không dùng được nữa (đã khởi động lại quá giới hạn, §6.5): phụ đề chỉ hiện câu gốc.
    #[error("llama-server không dùng được: {0}")]
    Unavailable(String),
    /// Request này lỗi (mất kết nối, stream cụt…); bên giám sát đã lo khởi động lại nếu cần.
    #[error("request dịch lỗi: {0}")]
    Failed(String),
}

/// Server dịch. `LlamaServer` là bản thật; `supervisor` bọc nó để tự khởi động lại; test dùng bản giả.
pub trait Mt: Send {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError>;
    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError>;
}

impl Mt for LlamaServer {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        LlamaServer::count_tokens(self, text).map_err(|e| MtError::Failed(format!("{e:#}")))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        LlamaServer::stream(self, req, on_delta).map_err(|e| MtError::Failed(format!("{e:#}")))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Job<'a> {
    pub text: &'a str,
    pub src: Lang,
    pub tgt: Lang,
    /// Câu trước, khi bật cờ thử nghiệm `experimental.translationContext` (§6.5).
    pub context: Option<&'a str>,
}

/// Sự kiện trong lúc dịch, cho luồng phụ đề.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event<'a> {
    /// Phần chữ mới đã qua hậu xử lý.
    Delta(&'a str),
    /// Lần đầu lỗi, sắp thử lại: phần chữ đã hiện không còn đúng.
    Retry,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Translated {
    pub text: String,
    /// 1, hoặc 2 nếu phải thử lại.
    pub attempts: u8,
    pub source_tokens: usize,
    pub completion_tokens: Option<usize>,
    /// Từ lúc bắt đầu tới chữ đầu tiên được hiện, và tới lúc xong (cả hai lần thử nếu có).
    pub first_delta_ms: Option<f32>,
    pub total_ms: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Done(Translated),
    /// Cả hai lần đều lỗi: hiện câu gốc, đánh dấu "chưa dịch được".
    Failed {
        reason: String,
        attempts: u8,
        source_tokens: usize,
        completion_tokens: Option<usize>,
    },
    /// Bên gọi dừng giữa chừng (câu đã được ghép thêm, sẽ dịch lại).
    Cancelled,
    Unavailable(String),
}

fn describe(v: Violation) -> &'static str {
    match v {
        Violation::TooLong => "quá ngưỡng tỉ lệ token",
        Violation::Explanation => "có lời giải thích",
        Violation::Truncated => "bị cắt ở max_tokens",
        Violation::Empty => "rỗng",
    }
}

pub fn translate(
    mt: &mut dyn Mt,
    job: &Job,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let prompt = match job.context {
        Some(context) => context_prompt(job.text, context, job.src, job.tgt),
        None => translation_prompt(job.text, job.src, job.tgt),
    };
    let source_tokens = match mt.count_tokens(job.text) {
        Ok(n) => n,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 0,
                source_tokens: 0,
                completion_tokens: None,
            };
        }
    };
    let max_tokens = cfg.max_tokens_for(source_tokens);
    // Cách 2 của Q4: chỉ áp tỉ lệ khi câu gốc đủ dài; câu ngắn hơn chỉ chịu hạn mức sinh.
    let max_chunks = cfg
        .ratio_for(job.src.code(), job.tgt.code())
        .filter(|_| source_tokens >= cfg.ratio_min_source_tokens)
        .map(|ratio| (ratio as f64 * source_tokens as f64).floor() as usize);
    let mut reason = String::new();
    let mut completion_tokens = None;
    let mut first_delta_ms = None;
    for (attempt, repeat_penalty) in [(1u8, cfg.repeat_penalty), (2, cfg.retry_repeat_penalty)] {
        if attempt == 2 {
            if on_event(Event::Retry).is_break() {
                return Outcome::Cancelled;
            }
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
        let mut violation = None;
        let mut cancelled = false;
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
        };
        let result = mt.stream(&req, &mut |chunk| match pp.push(chunk) {
            Step::Emit(delta) => {
                first_delta_ms.get_or_insert_with(|| started.elapsed().as_secs_f32() * 1000.0);
                if on_event(Event::Delta(&delta)).is_break() {
                    cancelled = true;
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            }
            Step::Hold => ControlFlow::Continue(()),
            Step::Stop(v) => {
                violation = Some(v);
                ControlFlow::Break(())
            }
        });
        let end = match result {
            Ok(end) => end,
            Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
            Err(MtError::Failed(e)) => {
                reason = e;
                continue;
            }
        };
        if cancelled {
            return Outcome::Cancelled;
        }
        completion_tokens = end.completion_tokens.or(Some(end.chunks));
        let finished = match violation {
            Some(v) => Err(v),
            None => pp.finish(end.finish_reason.as_deref()),
        };
        match finished {
            Ok(text) => {
                return Outcome::Done(Translated {
                    text,
                    attempts: attempt,
                    source_tokens,
                    completion_tokens,
                    first_delta_ms,
                    total_ms: started.elapsed().as_secs_f32() * 1000.0,
                });
            }
            Err(v) => reason = describe(v).to_string(),
        }
    }
    Outcome::Failed {
        reason,
        attempts: 2,
        source_tokens,
        completion_tokens,
    }
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 91 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.66s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-fc16c618e4b8f5a0)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-9dfc4bfd3d3f8afa)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-c38f44afa7fc4703)
     Running tests/clients.rs (target/debug/deps/clients-429936f3fc6661e8)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-f0916b9001a6d4ad)
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/bin/fake_asr_worker.rs \
  crates/pipeline/src/bin/fake_llama_server.rs \
  crates/pipeline/src/config.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/llama.rs \
  crates/pipeline/src/postprocess.rs \
  crates/pipeline/src/translate.rs \
  crates/pipeline/tests/clients.rs
git commit -m "feat(pipeline): dịch một câu theo §6.5, hậu xử lý khi stream, tiến trình phụ giả" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Giám sát hai tiến trình phụ

`supervisor.rs` (Đ2; dòng 78–81, 101, 106, 108, 113, 119, 134–136, 227, 234–237; QĐ7):
- `RestartTracker`: luật thuần cho một tiến trình phụ (chờ 1, 2, 5 giây; bỏ cuộc khi quá 5 lần trong 10 phút; chuyển CPU sau 2 lần lỗi liên tiếp khi dùng GPU).
- `SidecarManager`: chạy `asr-worker` (`Load` rồi `Warmup`) rồi mới chạy `llama-server`; đọc `Ready.backend` và `decode_mode` (bản phát hành chỉ nhận chế độ B, `require_shared`); khởi động lại và gửi lại đoạn; phát `SidecarEvent` để app hiện trạng thái; tắt khi rảnh 10 phút (`tick`).
- `SupervisedAsr` và `SupervisedMt`: bọc hai client thành trait `Asr` và `Mt` cho engine (02b, Task 2).
- `Clock`: `SystemClock` cho app, `FakeClock` cho test.
- `tests/lifecycle.rs` (dòng 296): đúng thứ tự, crash và khởi động lại, gửi lại đoạn, chuyển CPU, bỏ cuộc, lần đầu chạy, tắt sau 10 phút, với tiến trình phụ giả và đồng hồ giả.

**Files:**
- Sửa: `crates/pipeline/src/lib.rs`
- Tạo: `crates/pipeline/src/supervisor.rs`
- Test (tạo): `crates/pipeline/tests/lifecycle.rs`

- [ ] **Step 1: Khai báo module**

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -10,6 +10,7 @@
 pub mod segmenter;
 pub mod sentence;
 pub mod sse;
+pub mod supervisor;
 pub mod text;
 pub mod translate;
 pub mod vad;
```

- [ ] **Step 2: Viết test**

Tạo `crates/pipeline/src/supervisor.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Vòng đời và giám sát hai tiến trình phụ (spec §5, §6.4, §6.5, §9; Đ2 của kế hoạch 00).
//!
//! - Thứ tự: `asr-worker` chạy trước (`Load` rồi `Warmup`); `llama-server` chạy sau khi `asr-worker` đã nạp model, để
//!   `--fit` thấy đúng VRAM còn trống.
//! - Lỗi (crash, treo quá thời gian, không khởi động được): khởi động lại, chờ 1, 2, 5 giây giữa các lần. Quá 5 lần trong
//!   10 phút thì bỏ cuộc: `asr-worker` thì dừng dịch và báo lỗi; `llama-server` thì phụ đề chỉ hiện câu gốc.
//! - `asr-worker`: đoạn đang xử lý được gửi lại một lần; lỗi nữa thì đoạn đó bị bỏ (`dropped`). Worker trả `Error` cho
//!   một đoạn mà vẫn sống thì không khởi động lại, đoạn đó bị bỏ.
//! - Chuyển sang CPU: crash 2 lần liên tiếp khi đang dùng GPU; hoặc bản GPU không khởi động được, hay lỗi lúc nạp model
//!   (Windows: `asr-worker-vulkan` thiếu `vulkan-1.dll`); hoặc worker báo thiết bị thật là CPU (`Ready.backend`). Đã
//!   chuyển thì giữ CPU tới khi app tắt.
//! - Lần đầu chạy một binary mới: chờ `Ready` hay `/health` lâu hơn (`first_run_ready_timeout_ms`, từ 30 giây), và việc
//!   chờ lâu đó không bị tính là lỗi.
//! - Không có phiên dịch nào trong 10 phút thì tắt cả hai (`tick`).
//!
//! Mọi thời gian chờ đi qua `Clock`, nên test chạy với đồng hồ giả, không chờ thật.

#[cfg(test)]
mod tests {
    use super::*;

    fn tracker() -> RestartTracker {
        RestartTracker::new(SupervisorConfig::default())
    }

    fn restart(after_ms: u64, use_gpu: bool) -> Decision {
        Decision::Restart { after_ms, use_gpu }
    }

    #[test]
    fn backoff_is_1_2_5_seconds_then_5() {
        let mut t = tracker();
        let got: Vec<Decision> = (0..5).map(|i| t.on_failure(i * 10_000, false, false)).collect();
        assert_eq!(
            got,
            [
                restart(1_000, false),
                restart(2_000, false),
                restart(5_000, false),
                restart(5_000, false),
                restart(5_000, false)
            ]
        );
    }

    #[test]
    fn more_than_5_failures_in_10_minutes_gives_up() {
        let mut t = tracker();
        for i in 0..5 {
            assert_ne!(t.on_failure(i * 60_000, false, false), Decision::GiveUp);
        }
        assert_eq!(t.on_failure(5 * 60_000, false, false), Decision::GiveUp);
    }

    #[test]
    fn failures_older_than_the_window_do_not_count() {
        let mut t = tracker();
        for i in 0..5 {
            t.on_failure(i * 1_000, false, false);
        }
        // Lỗi thứ 6 tới 10 phút sau lỗi đầu: lỗi đầu đã ra khỏi cửa sổ, còn 5 lần.
        assert_eq!(t.on_failure(600_000, false, false), restart(5_000, false));
    }

    #[test]
    fn two_gpu_crashes_in_a_row_switch_to_cpu() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, false), restart(1_000, true));
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, false));
        // Có một yêu cầu thành công ở giữa thì không còn "liên tiếp".
        let mut t = tracker();
        t.on_failure(0, true, false);
        t.on_success();
        assert_eq!(t.on_failure(10_000, true, false), restart(2_000, true));
    }

    #[test]
    fn a_gpu_failure_while_starting_switches_to_cpu_at_once() {
        let mut t = tracker();
        assert_eq!(t.on_failure(0, true, true), restart(1_000, false));
    }

    #[test]
    fn fake_clock_sleeps_without_waiting() {
        let clock = FakeClock::default();
        let started = Instant::now();
        clock.sleep(Duration::from_secs(600));
        assert_eq!((clock.now_ms(), clock.sleeps()), (600_000, vec![600_000]));
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}
```

Tạo `crates/pipeline/tests/lifecycle.rs`:

```rust
//! Vòng đời hai tiến trình phụ (spec §11, "Test tích hợp"): khởi động đúng thứ tự, crash, tự khởi động lại, gửi lại đoạn
//! đang xử lý, chuyển sang CPU sau 2 lần crash khi dùng GPU, bỏ cuộc sau hơn 5 lần lỗi trong 10 phút, tắt sau 10 phút
//! không dịch. Tiến trình phụ là bản giả (`src/bin/fake_*.rs`); mọi thời gian chờ đi qua `FakeClock`, không chờ thật.

use asr_protocol::TranscribeRequest;
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
use pipeline::prompt::Lang;
use pipeline::supervisor::{
    AsrFailure, AsrSpec, FakeClock, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager, SidecarSpec, Which,
};
use pipeline::translate::{Job, Outcome, translate};
use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-lifecycle-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }

    fn read(&self, name: &str) -> String {
        std::fs::read_to_string(self.path(name)).unwrap_or_default()
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[derive(Default)]
struct Recorder(Mutex<Vec<SidecarEvent>>);

impl SidecarEvents for Recorder {
    fn on_event(&self, e: &SidecarEvent) {
        self.0.lock().unwrap().push(e.clone());
    }
}

impl Recorder {
    fn events(&self) -> Vec<SidecarEvent> {
        self.0.lock().unwrap().clone()
    }

    /// Tên ngắn của từng sự kiện, theo thứ tự.
    fn names(&self) -> Vec<String> {
        self.events()
            .iter()
            .map(|e| match e {
                SidecarEvent::Starting { which, .. } => format!("start {which:?}"),
                SidecarEvent::Ready { which, use_gpu, .. } => format!("ready {which:?} gpu={use_gpu}"),
                SidecarEvent::Restarting { which, after_ms, .. } => format!("restart {which:?} {after_ms}"),
                SidecarEvent::CpuFallback { which } => format!("cpu {which:?}"),
                SidecarEvent::OutOfMemory { which } => format!("oom {which:?}"),
                SidecarEvent::GaveUp { which, .. } => format!("gave-up {which:?}"),
                SidecarEvent::Stopped { which, idle } => format!("stopped {which:?} idle={idle}"),
            })
            .collect()
    }
}

struct Setup {
    t: Temp,
    clock: Arc<FakeClock>,
    events: Arc<Recorder>,
    manager: Arc<SidecarManager>,
}

/// `gpu`: có bản GPU (như macOS, hoặc Windows khi `--probe` thấy GPU dùng được).
fn setup(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str]) -> Setup {
    setup_with(name, gpu, asr_plan, llama_plan, false)
}

/// `first_run`: lần đầu chạy hai binary này (sau khi cài hoặc cập nhật).
fn setup_with(name: &str, gpu: bool, asr_plan: &[&str], llama_plan: &[&str], first_run: bool) -> Setup {
    let t = Temp::new(name);
    std::fs::write(t.path("asr-plan"), asr_plan.join("\n")).unwrap();
    std::fs::write(t.path("llama-plan"), llama_plan.join("\n")).unwrap();
    let asr_env = vec![
        ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
        ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
    ];
    let llama_env = vec![
        ("FAKE_LLAMA_PLAN".into(), t.path("llama-plan").display().to_string()),
        ("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string()),
    ];
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: gpu.then(|| PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run,
            require_shared: true,
            env: asr_env,
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run,
            env: llama_env,
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            first_run_ready_timeout_ms: 30_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig {
            timeout_ms: 1_000,
            ..AsrConfig::default()
        },
        mt_config: MtConfig::default(),
    };
    let clock = Arc::new(FakeClock::default());
    let events = Arc::new(Recorder::default());
    let manager = SidecarManager::new(spec, clock.clone(), events.clone());
    Setup {
        t,
        clock,
        events,
        manager,
    }
}

fn request(id: u64) -> TranscribeRequest {
    TranscribeRequest {
        segment_id: id,
        pcm: vec![0; 16_000],
        languages: vec!["en".into()],
        prompt_tokens: Vec::new(),
        audio_ctx: 512,
        prev_lang: Some("en".into()),
    }
}

#[test]
fn asr_worker_starts_first_and_llama_server_after_it_is_ready() {
    let s = setup("order", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    assert_eq!(
        s.events.names(),
        ["start Asr", "ready Asr gpu=true", "start Llama", "ready Llama gpu=true"]
    );
    // Worker đã nạp model và làm nóng trước khi server dịch chạy.
    assert_eq!(s.t.read("asr-events"), "start use_gpu=true\nwarmup\n");
    assert_eq!(s.t.read("llama-events"), "start ngl=auto extra=\n");
    assert!(s.clock.sleeps().is_empty());
}

#[test]
fn the_first_run_of_new_binaries_is_reported_once() {
    let s = setup_with("first-run", true, &["crash_on:1", "ok"], &[], true);
    s.manager.ensure_started().unwrap();
    let firsts: Vec<(String, bool)> = s
        .events
        .events()
        .iter()
        .filter_map(|e| match e {
            SidecarEvent::Starting { which, first_run } => Some((format!("start {which:?}"), *first_run)),
            SidecarEvent::Ready { which, first_run, .. } => Some((format!("ready {which:?}"), *first_run)),
            _ => None,
        })
        .collect();
    let expect = |n: &str, f: bool| (n.to_string(), f);
    assert_eq!(
        firsts,
        [
            expect("start Asr", true),
            expect("ready Asr", true),
            expect("start Llama", true),
            expect("ready Llama", true)
        ]
    );
    // Khởi động lại sau đó không còn là lần đầu: chờ `Ready` theo thời gian thường.
    s.manager.transcribe(request(1)).unwrap();
    assert!(s.events.events().iter().any(|e| matches!(
        e,
        SidecarEvent::Starting {
            which: Which::Asr,
            first_run: false
        }
    )));
}

#[test]
fn a_crash_restarts_the_worker_after_1_second_and_resends_the_segment() {
    let s = setup("resend", true, &["crash_on:1", "ok"], &[]);
    let r = s.manager.transcribe(request(5)).unwrap();
    assert_eq!(r.segment_id, 5);
    assert_eq!(s.clock.sleeps(), [1_000]);
    let transcribes = s.t.read("asr-events").matches("transcribe 5 ").count();
    assert_eq!(transcribes, 2, "đoạn đang xử lý được gửi lại đúng một lần");
    assert!(s.events.names().contains(&"restart Asr 1000".to_string()));
}

#[test]
fn a_segment_that_fails_again_is_dropped_and_the_next_one_works() {
    let s = setup("drop", false, &["crash_on:1", "crash_on:1", "ok"], &[]);
    let err = s.manager.transcribe(request(1)).unwrap_err();
    assert!(matches!(err, AsrFailure::Dropped(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000]);
    assert_eq!(s.manager.transcribe(request(2)).unwrap().segment_id, 2);
}

#[test]
fn two_crashes_in_a_row_on_the_gpu_switch_to_the_cpu() {
    let s = setup("cpu", true, &["crash_on:1", "crash_on:1", "ok"], &[]);
    assert!(s.manager.transcribe(request(1)).is_err());
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    s.manager.transcribe(request(2)).unwrap();
    let starts: Vec<&str> =
        s.t.read("asr-events")
            .leak()
            .lines()
            .filter(|l| l.starts_with("start"))
            .collect();
    assert_eq!(
        starts,
        ["start use_gpu=true", "start use_gpu=true", "start use_gpu=false"]
    );
}

#[test]
fn a_gpu_worker_that_cannot_start_falls_back_to_the_cpu_at_once() {
    // Windows: asr-worker-vulkan thoát ngay vì thiếu vulkan-1.dll (mã giả 135).
    let s = setup("no-vulkan", true, &["exit_at_start:135", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[..4], ["start Asr", "cpu Asr", "restart Asr 1000", "start Asr"]);
    assert_eq!(names[4], "ready Asr gpu=false");
    assert_eq!(s.t.read("asr-events").lines().next(), Some("start use_gpu=false"));
}

#[test]
fn a_worker_whose_real_device_is_the_cpu_switches_to_cpu_mode() {
    let s = setup("real-cpu", true, &["backend:cpu"], &[]);
    s.manager.ensure_started().unwrap();
    assert!(s.events.names().contains(&"cpu Asr".to_string()));
    assert_eq!(s.manager.asr_backend(), Some(asr_protocol::Backend::Cpu));
}

#[test]
fn out_of_memory_is_reported_and_the_gpu_is_dropped() {
    let s = setup("oom", true, &["load_error:OutOfMemory", "ok"], &[]);
    s.manager.ensure_started().unwrap();
    let names = s.events.names();
    assert_eq!(names[1..3], ["oom Asr", "cpu Asr"]);
}

#[test]
fn a_worker_without_mode_b_is_refused() {
    let s = setup("split", false, &["mode:split"], &[]);
    let err = s.manager.ensure_started().unwrap_err();
    assert_eq!(err.which, Which::Asr);
    assert!(s.events.names().contains(&"gave-up Asr".to_string()));
}

#[test]
fn more_than_5_failures_in_10_minutes_stop_the_translation() {
    let plan = ["crash_on:1"; 7];
    let s = setup("give-up", false, &plan, &[]);
    assert!(matches!(s.manager.transcribe(request(1)), Err(AsrFailure::Dropped(_))));
    assert!(matches!(s.manager.transcribe(request(2)), Err(AsrFailure::Dropped(_))));
    let err = s.manager.transcribe(request(3)).unwrap_err();
    assert!(matches!(err, AsrFailure::Unavailable(_)), "{err:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    // Đã bỏ cuộc thì không chạy lại nữa, cho tới khi người dùng bắt đầu phiên mới.
    assert!(matches!(
        s.manager.transcribe(request(4)),
        Err(AsrFailure::Unavailable(_))
    ));
    s.manager.begin_session();
    std::fs::write(s.t.path("asr-plan"), "ok").unwrap();
    assert!(s.manager.transcribe(request(5)).is_ok());
}

#[test]
fn both_sidecars_stop_after_10_minutes_without_translating() {
    let s = setup("idle", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.clock.advance(Duration::from_secs(9 * 60 + 59));
    assert!(!s.manager.tick());
    assert!(s.manager.running());
    s.clock.advance(Duration::from_secs(1));
    assert!(s.manager.tick());
    assert!(!s.manager.running());
    let names = s.events.names();
    assert_eq!(
        names[names.len() - 2..],
        ["stopped Llama idle=true", "stopped Asr idle=true"]
    );
}

#[test]
fn a_running_session_keeps_the_sidecars() {
    let s = setup("session", true, &[], &[]);
    s.manager.ensure_started().unwrap();
    s.manager.begin_session();
    s.clock.advance(Duration::from_secs(30 * 60));
    assert!(!s.manager.tick(), "đang dịch thì không tắt");
    s.manager.end_session();
    s.clock.advance(Duration::from_secs(10 * 60));
    assert!(s.manager.tick(), "10 phút sau khi dừng phiên thì tắt");
}

fn translate_hello(s: &Setup) -> Outcome {
    let job = Job {
        text: "Hello there",
        src: Lang::En,
        tgt: Lang::Vi,
        context: None,
    };
    let mut mt = s.manager.mt();
    translate(&mut mt, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(()))
}

#[test]
fn a_llama_server_crash_restarts_it_and_the_translation_is_retried() {
    let s = setup("llama-crash", true, &[], &["crash_on:1", "ok"]);
    s.manager.ensure_started().unwrap();
    match translate_hello(&s) {
        Outcome::Done(t) => assert_eq!((t.text.as_str(), t.attempts), ("VI: Hello there", 2)),
        other => panic!("{other:?}"),
    }
    assert_eq!(s.clock.sleeps(), [1_000]);
}

#[test]
fn after_more_than_5_server_failures_only_the_source_is_shown() {
    // Lần 1: server chết giữa request dịch. Năm lần sau: server thoát ngay khi chạy. Lỗi thứ 6 trong 10 phút: bỏ cuộc.
    let mut plan = vec!["crash_on:1"];
    plan.extend(["exit_at_start:1"; 5]);
    let s = setup("llama-give-up", true, &[], &plan);
    let outcome = translate_hello(&s);
    assert!(matches!(outcome, Outcome::Unavailable(_)), "{outcome:?}");
    assert_eq!(s.clock.sleeps(), [1_000, 2_000, 5_000, 5_000, 5_000]);
    assert!(s.events.names().contains(&"gave-up Llama".to_string()));
}
```

- [ ] **Step 3: Chạy test, thấy đỏ**

Run: `cargo test -p pipeline --test lifecycle`
Expected: biên dịch lỗi:

```text
error[E0432]: unresolved imports `pipeline::supervisor::AsrFailure`, `pipeline::supervisor::AsrSpec`, `pipeline::supervisor::FakeClock`, `pipeline::supervisor::LlamaSpec`, `pipeline::supervisor::SidecarEvent`, `pipeline::supervisor::SidecarEvents`, `pipeline::supervisor::SidecarManager`, `pipeline::supervisor::SidecarSpec`, `pipeline::supervisor::Which`
```

- [ ] **Step 4: Viết code**

Thêm vào `crates/pipeline/src/supervisor.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use crate::asr_client::{AsrError, AsrLaunch, AsrWorker};
use crate::config::{AsrConfig, MtConfig, SupervisorConfig};
use crate::llama::{ChatRequest, LlamaLaunch, LlamaServer, StreamEnd};
use crate::translate::{Mt, MtError};
use asr_protocol::{Backend, DecodeMode, ErrorKind, TranscribeRequest, TranscribeResult};
use std::collections::VecDeque;
use std::ops::ControlFlow;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Đồng hồ cho mọi thời gian chờ của phần giám sát.
pub trait Clock: Send + Sync {
    fn now_ms(&self) -> u64;
    fn sleep(&self, d: Duration);
}

pub struct SystemClock {
    origin: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self { origin: Instant::now() }
    }
}

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        self.origin.elapsed().as_millis() as u64
    }

    fn sleep(&self, d: Duration) {
        std::thread::sleep(d);
    }
}

/// Đồng hồ giả cho test: `sleep` cộng thẳng vào giờ hiện tại và ghi lại, không chờ thật.
#[derive(Default)]
pub struct FakeClock {
    now: AtomicU64,
    sleeps: Mutex<Vec<u64>>,
}

impl FakeClock {
    pub fn advance(&self, d: Duration) {
        self.now.fetch_add(d.as_millis() as u64, Ordering::SeqCst);
    }

    /// Các lần `sleep` đã gọi, tính bằng ms.
    pub fn sleeps(&self) -> Vec<u64> {
        self.sleeps.lock().unwrap().clone()
    }
}

impl Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        self.now.load(Ordering::SeqCst)
    }

    fn sleep(&self, d: Duration) {
        self.sleeps.lock().unwrap().push(d.as_millis() as u64);
        self.advance(d);
    }
}

/// Quyết định sau một lần lỗi.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Restart { after_ms: u64, use_gpu: bool },
    GiveUp,
}

/// Luật khởi động lại, không đụng tới tiến trình nào (test riêng được).
#[derive(Debug)]
pub struct RestartTracker {
    cfg: SupervisorConfig,
    failures: VecDeque<u64>,
    gpu_failures_in_a_row: u32,
}

impl RestartTracker {
    pub fn new(cfg: SupervisorConfig) -> Self {
        Self {
            cfg,
            failures: VecDeque::new(),
            gpu_failures_in_a_row: 0,
        }
    }

    /// Một lần lỗi lúc `now_ms`. `on_gpu`: đang chạy bằng GPU. `during_start`: lỗi xảy ra khi khởi động hay nạp model,
    /// lúc đó chuyển sang CPU ngay (§6.4).
    pub fn on_failure(&mut self, now_ms: u64, on_gpu: bool, during_start: bool) -> Decision {
        while self
            .failures
            .front()
            .is_some_and(|&t| now_ms.saturating_sub(t) >= self.cfg.failure_window_ms)
        {
            self.failures.pop_front();
        }
        self.failures.push_back(now_ms);
        if self.failures.len() > self.cfg.max_failures {
            return Decision::GiveUp;
        }
        let mut use_gpu = on_gpu;
        if on_gpu {
            self.gpu_failures_in_a_row += 1;
            if during_start || self.gpu_failures_in_a_row >= self.cfg.gpu_failures_to_cpu {
                use_gpu = false;
            }
        }
        let backoff = &self.cfg.backoff_ms;
        let after_ms = backoff[(self.failures.len() - 1).min(backoff.len() - 1)];
        Decision::Restart { after_ms, use_gpu }
    }

    /// Một yêu cầu thành công: số lần crash liên tiếp trên GPU về 0.
    pub fn on_success(&mut self) {
        self.gpu_failures_in_a_row = 0;
    }

    /// Người dùng thử lại (bấm Bắt đầu): quên các lần lỗi cũ.
    pub fn reset(&mut self) {
        self.failures.clear();
        self.gpu_failures_in_a_row = 0;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Which {
    Asr,
    Llama,
}

/// Sự kiện để app hiện trạng thái (§4.2, §9). Không chứa API key hay nội dung chép lời.
#[derive(Clone, Debug, PartialEq)]
pub enum SidecarEvent {
    Starting {
        which: Which,
        /// Lần đầu chạy binary này: giao diện báo "Đang chuẩn bị lần đầu" (§6.5).
        first_run: bool,
    },
    Ready {
        which: Which,
        use_gpu: bool,
        /// Thiết bị thật của `asr-worker`; `None` với `llama-server`.
        backend: Option<Backend>,
        first_run: bool,
    },
    Restarting {
        which: Which,
        failures: usize,
        after_ms: u64,
        reason: String,
    },
    /// "Đang chạy bằng CPU (chậm hơn)" (§9).
    CpuFallback {
        which: Which,
    },
    /// Tiến trình phụ báo hết bộ nhớ: app đề xuất gói Nhẹ (§9).
    OutOfMemory {
        which: Which,
    },
    GaveUp {
        which: Which,
        reason: String,
    },
    Stopped {
        which: Which,
        idle: bool,
    },
}

pub trait SidecarEvents: Send + Sync {
    fn on_event(&self, event: &SidecarEvent);
}

/// Bỏ qua mọi sự kiện.
pub struct NoEvents;

impl SidecarEvents for NoEvents {
    fn on_event(&self, _: &SidecarEvent) {}
}

#[derive(Clone, Debug)]
pub struct AsrSpec {
    /// Bản chạy GPU. macOS chỉ có một bản (Metal và CPU): đặt `exe_gpu` và `exe_cpu` cùng một file. Windows:
    /// `asr-worker-vulkan` và `asr-worker-cpu`; không dò thấy GPU dùng được (`--probe`) thì `exe_gpu` là `None`.
    pub exe_gpu: Option<PathBuf>,
    pub exe_cpu: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub first_run: bool,
    /// Bản phát hành chỉ nhận chế độ B (§6.4, "Việc cho MVP").
    pub require_shared: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct LlamaSpec {
    pub exe: PathBuf,
    pub model: PathBuf,
    pub log: PathBuf,
    pub extra_args: Vec<String>,
    pub first_run: bool,
    pub env: Vec<(String, String)>,
}

#[derive(Clone, Debug)]
pub struct SidecarSpec {
    pub asr: AsrSpec,
    pub llama: LlamaSpec,
    pub supervisor: SupervisorConfig,
    pub asr_config: AsrConfig,
    pub mt_config: MtConfig,
}

/// Lỗi của một đoạn khi chép lời.
#[derive(Clone, Debug, PartialEq, thiserror::Error)]
pub enum AsrFailure {
    /// Đoạn này bị bỏ (`dropped`): lỗi cả sau khi gửi lại, hoặc worker trả `Error` cho đoạn.
    #[error("bỏ đoạn: {0}")]
    Dropped(String),
    /// `asr-worker` không dùng được nữa: dừng dịch, báo lỗi (§9).
    #[error("asr-worker không dùng được: {0}")]
    Unavailable(String),
}

/// Nhận dạng giọng nói, như luồng nhận dạng của `engine` cần. Bản thật là [`SupervisedAsr`].
pub trait Asr: Send {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure>;
}

#[derive(Clone, Debug, PartialEq, thiserror::Error)]
#[error("{which:?} không khởi động được: {reason}")]
pub struct StartError {
    pub which: Which,
    pub reason: String,
}

struct AsrSlot {
    worker: Option<AsrWorker>,
    tracker: RestartTracker,
    use_gpu: bool,
    first_run: bool,
    gave_up: Option<String>,
    backend: Option<Backend>,
}

struct LlamaSlot {
    server: Option<LlamaServer>,
    tracker: RestartTracker,
    use_gpu: bool,
    first_run: bool,
    gave_up: Option<String>,
}

struct Activity {
    sessions: usize,
    last_active_ms: u64,
}

pub struct SidecarManager {
    spec: SidecarSpec,
    clock: Arc<dyn Clock>,
    events: Arc<dyn SidecarEvents>,
    asr: Mutex<AsrSlot>,
    llama: Mutex<LlamaSlot>,
    activity: Mutex<Activity>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl SidecarManager {
    pub fn new(spec: SidecarSpec, clock: Arc<dyn Clock>, events: Arc<dyn SidecarEvents>) -> Arc<Self> {
        let asr = AsrSlot {
            worker: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: spec.asr.exe_gpu.is_some(),
            first_run: spec.asr.first_run,
            gave_up: None,
            backend: None,
        };
        let llama = LlamaSlot {
            server: None,
            tracker: RestartTracker::new(spec.supervisor.clone()),
            use_gpu: true,
            first_run: spec.llama.first_run,
            gave_up: None,
        };
        let now = clock.now_ms();
        Arc::new(Self {
            spec,
            clock,
            events,
            asr: Mutex::new(asr),
            llama: Mutex::new(llama),
            activity: Mutex::new(Activity {
                sessions: 0,
                last_active_ms: now,
            }),
        })
    }

    fn emit(&self, event: SidecarEvent) {
        log::info!("tiến trình phụ: {event:?}");
        self.events.on_event(&event);
    }

    /// Chạy cả hai theo đúng thứ tự, nếu chưa chạy. Chặn tới khi cả hai sẵn sàng; gọi từ luồng nền.
    pub fn ensure_started(&self) -> Result<(), StartError> {
        self.touch();
        {
            let mut asr = lock(&self.asr);
            self.start_asr(&mut asr)?;
        }
        let mut llama = lock(&self.llama);
        self.start_llama(&mut llama)
    }

    /// Có hoạt động (mở cửa sổ chính, dịch): lùi mốc tắt khi rảnh.
    pub fn touch(&self) {
        lock(&self.activity).last_active_ms = self.clock.now_ms();
    }

    /// Bắt đầu một phiên dịch. Người dùng bấm Bắt đầu là thử lại từ đầu: quên việc bỏ cuộc của lần trước.
    pub fn begin_session(&self) {
        {
            let mut a = lock(&self.activity);
            a.sessions += 1;
            a.last_active_ms = self.clock.now_ms();
        }
        {
            let mut asr = lock(&self.asr);
            if asr.gave_up.take().is_some() {
                asr.tracker.reset();
            }
        }
        let mut llama = lock(&self.llama);
        if llama.gave_up.take().is_some() {
            llama.tracker.reset();
        }
    }

    pub fn end_session(&self) {
        let mut a = lock(&self.activity);
        a.sessions = a.sessions.saturating_sub(1);
        a.last_active_ms = self.clock.now_ms();
    }

    /// Gọi định kỳ. Không có phiên nào và rảnh quá `idle_shutdown_ms` thì tắt cả hai; trả `true` nếu vừa tắt.
    pub fn tick(&self) -> bool {
        let idle = {
            let a = lock(&self.activity);
            a.sessions == 0
                && self.clock.now_ms().saturating_sub(a.last_active_ms) >= self.spec.supervisor.idle_shutdown_ms
        };
        if !idle || !self.running() {
            return false;
        }
        self.stop(true);
        true
    }

    /// Có tiến trình phụ nào đang chạy không.
    pub fn running(&self) -> bool {
        let asr = lock(&self.asr).worker.is_some();
        asr || lock(&self.llama).server.is_some()
    }

    /// Tắt cả hai (Thoát ở menu khay, hoặc rảnh quá lâu).
    pub fn stop(&self, idle: bool) {
        if lock(&self.llama).server.take().is_some() {
            self.emit(SidecarEvent::Stopped {
                which: Which::Llama,
                idle,
            });
        }
        if lock(&self.asr).worker.take().is_some() {
            self.emit(SidecarEvent::Stopped {
                which: Which::Asr,
                idle,
            });
        }
    }

    /// Thiết bị thật của `asr-worker` lần chạy gần nhất.
    pub fn asr_backend(&self) -> Option<Backend> {
        lock(&self.asr).backend
    }

    fn asr_launch(&self, slot: &AsrSlot) -> AsrLaunch {
        let spec = &self.spec.asr;
        let exe = match (&spec.exe_gpu, slot.use_gpu) {
            (Some(gpu), true) => gpu.clone(),
            _ => spec.exe_cpu.clone(),
        };
        let ready_ms = if slot.first_run {
            self.spec.supervisor.first_run_ready_timeout_ms
        } else {
            self.spec.supervisor.ready_timeout_ms
        };
        AsrLaunch {
            use_gpu: slot.use_gpu,
            n_threads: self.spec.asr_config.n_threads,
            ready_timeout: Duration::from_millis(ready_ms),
            request_timeout: Duration::from_millis(self.spec.asr_config.timeout_ms),
            shutdown_grace: Duration::from_millis(self.spec.supervisor.shutdown_grace_ms),
            env: spec.env.clone(),
            ..AsrLaunch::new(&exe, &spec.model, &spec.log)
        }
    }

    /// Chạy `asr-worker` nếu chưa chạy, khởi động lại theo luật khi lỗi.
    fn start_asr(&self, slot: &mut AsrSlot) -> Result<(), StartError> {
        let give_up = |reason: String| StartError {
            which: Which::Asr,
            reason,
        };
        while slot.worker.is_none() {
            if let Some(reason) = &slot.gave_up {
                return Err(give_up(reason.clone()));
            }
            self.emit(SidecarEvent::Starting {
                which: Which::Asr,
                first_run: slot.first_run,
            });
            let failure = match AsrWorker::spawn(&self.asr_launch(slot)) {
                Ok((mut worker, ready)) => {
                    if self.spec.asr.require_shared && ready.decode_mode != DecodeMode::Shared {
                        let reason = "asr-worker không có chế độ giải mã B (build thiếu feature shared-encode)";
                        slot.gave_up = Some(reason.into());
                        self.emit(SidecarEvent::GaveUp {
                            which: Which::Asr,
                            reason: reason.into(),
                        });
                        return Err(give_up(reason.into()));
                    }
                    match worker.warmup() {
                        Ok(_) => {
                            let first_run = std::mem::take(&mut slot.first_run);
                            if slot.use_gpu && !ready.backend.is_gpu() {
                                // Xin GPU mà worker chạy bằng CPU: không có GPU dùng được.
                                slot.use_gpu = false;
                                self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                            }
                            slot.backend = Some(ready.backend);
                            slot.worker = Some(worker);
                            self.emit(SidecarEvent::Ready {
                                which: Which::Asr,
                                use_gpu: slot.use_gpu,
                                backend: Some(ready.backend),
                                first_run,
                            });
                            return Ok(());
                        }
                        Err(e) => e,
                    }
                }
                Err(e) => e,
            };
            if failure.kind() == Some(ErrorKind::OutOfMemory) {
                self.emit(SidecarEvent::OutOfMemory { which: Which::Asr });
            }
            if failure.kind() == Some(ErrorKind::ModelLoad) && !slot.use_gpu {
                // Model hỏng: khởi động lại không giúp gì (§9: đề nghị tải lại, kế hoạch 04).
                let reason = failure.to_string();
                slot.gave_up = Some(reason.clone());
                self.emit(SidecarEvent::GaveUp {
                    which: Which::Asr,
                    reason: reason.clone(),
                });
                return Err(give_up(reason));
            }
            self.after_asr_failure(slot, &failure, true)?;
        }
        Ok(())
    }

    /// Ghi một lần lỗi của `asr-worker`, chờ theo luật (hoặc bỏ cuộc).
    fn after_asr_failure(&self, slot: &mut AsrSlot, failure: &AsrError, during_start: bool) -> Result<(), StartError> {
        slot.worker = None;
        let was_gpu = slot.use_gpu;
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, during_start) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {failure}",
                    self.spec.supervisor.max_failures
                );
                slot.gave_up = Some(reason.clone());
                self.emit(SidecarEvent::GaveUp {
                    which: Which::Asr,
                    reason: reason.clone(),
                });
                Err(StartError {
                    which: Which::Asr,
                    reason,
                })
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    self.emit(SidecarEvent::CpuFallback { which: Which::Asr });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Asr,
                    failures: slot.tracker.failures.len(),
                    after_ms,
                    reason: failure.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms));
                Ok(())
            }
        }
    }

    /// Chép lời một đoạn: khởi động worker nếu cần; worker chết thì khởi động lại và gửi lại đoạn một lần.
    pub fn transcribe(&self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        self.touch();
        let mut slot = lock(&self.asr);
        let mut last = String::new();
        for _attempt in 0..2 {
            self.start_asr(&mut slot)
                .map_err(|e| AsrFailure::Unavailable(e.reason))?;
            let worker = slot.worker.as_mut().expect("vừa khởi động");
            match worker.transcribe(req.clone()) {
                Ok(result) => {
                    slot.tracker.on_success();
                    return Ok(result);
                }
                Err(e) if !e.is_crash() => return Err(AsrFailure::Dropped(e.to_string())),
                Err(e) => {
                    last = e.to_string();
                    self.after_asr_failure(&mut slot, &e, false)
                        .map_err(|e| AsrFailure::Unavailable(e.reason))?;
                }
            }
        }
        Err(AsrFailure::Dropped(format!("lỗi cả sau khi gửi lại: {last}")))
    }

    fn start_llama(&self, slot: &mut LlamaSlot) -> Result<(), StartError> {
        while slot.server.is_none() {
            if let Some(reason) = &slot.gave_up {
                return Err(StartError {
                    which: Which::Llama,
                    reason: reason.clone(),
                });
            }
            self.emit(SidecarEvent::Starting {
                which: Which::Llama,
                first_run: slot.first_run,
            });
            let spec = &self.spec.llama;
            let ready_ms = if slot.first_run {
                self.spec.supervisor.first_run_ready_timeout_ms
            } else {
                self.spec.supervisor.ready_timeout_ms
            };
            let launch = LlamaLaunch {
                use_gpu: slot.use_gpu,
                extra_args: spec.extra_args.clone(),
                ready_timeout: Duration::from_millis(ready_ms),
                request_timeout: Duration::from_millis(self.spec.mt_config.request_timeout_ms),
                env: spec.env.clone(),
                ..LlamaLaunch::new(&spec.exe, &spec.model, &spec.log)
            };
            match LlamaServer::spawn(&launch) {
                Ok(server) => {
                    let first_run = std::mem::take(&mut slot.first_run);
                    slot.server = Some(server);
                    self.emit(SidecarEvent::Ready {
                        which: Which::Llama,
                        use_gpu: slot.use_gpu,
                        backend: None,
                        first_run,
                    });
                }
                Err(e) => self.after_llama_failure(slot, &format!("{e:#}"))?,
            }
        }
        Ok(())
    }

    /// Ghi một lần lỗi của `llama-server`. Khác `asr-worker`: lỗi lúc khởi động không chuyển CPU ngay (llama.cpp tự dùng
    /// CPU khi không có GPU); chỉ 2 lần lỗi liên tiếp trên GPU mới chạy lại với `-ngl 0`.
    fn after_llama_failure(&self, slot: &mut LlamaSlot, reason: &str) -> Result<(), StartError> {
        slot.server = None;
        let was_gpu = slot.use_gpu;
        match slot.tracker.on_failure(self.clock.now_ms(), was_gpu, false) {
            Decision::GiveUp => {
                let reason = format!(
                    "quá {} lần lỗi trong 10 phút: {reason}",
                    self.spec.supervisor.max_failures
                );
                slot.gave_up = Some(reason.clone());
                self.emit(SidecarEvent::GaveUp {
                    which: Which::Llama,
                    reason: reason.clone(),
                });
                Err(StartError {
                    which: Which::Llama,
                    reason,
                })
            }
            Decision::Restart { after_ms, use_gpu } => {
                if was_gpu && !use_gpu {
                    slot.use_gpu = false;
                    self.emit(SidecarEvent::CpuFallback { which: Which::Llama });
                }
                self.emit(SidecarEvent::Restarting {
                    which: Which::Llama,
                    failures: slot.tracker.failures.len(),
                    after_ms,
                    reason: reason.to_string(),
                });
                self.clock.sleep(Duration::from_millis(after_ms));
                Ok(())
            }
        }
    }

    /// Chạy một request tới `llama-server`. Server chết hoặc không còn trả lời `/health` thì tính là một lần lỗi và chờ theo
    /// luật; request này báo `Failed` (bên dịch thử lại một lần, lúc đó server đã được chạy lại).
    fn with_llama<T>(&self, f: impl FnOnce(&mut LlamaServer) -> anyhow::Result<T>) -> Result<T, MtError> {
        self.touch();
        let mut slot = lock(&self.llama);
        self.start_llama(&mut slot)
            .map_err(|e| MtError::Unavailable(e.reason))?;
        let server = slot.server.as_mut().expect("vừa khởi động");
        match f(server) {
            Ok(v) => {
                slot.tracker.on_success();
                Ok(v)
            }
            Err(e) => {
                let reason = format!("{e:#}");
                let dead = server.exited().is_some() || !server.healthy();
                if dead {
                    self.after_llama_failure(&mut slot, &reason)
                        .map_err(|e| MtError::Unavailable(e.reason))?;
                }
                Err(MtError::Failed(reason))
            }
        }
    }

    /// Bản giám sát của `asr-worker` cho `engine`.
    pub fn asr(self: &Arc<Self>) -> SupervisedAsr {
        SupervisedAsr(self.clone())
    }

    /// Bản giám sát của `llama-server` cho `engine` và `translate`.
    pub fn mt(self: &Arc<Self>) -> SupervisedMt {
        SupervisedMt(self.clone())
    }
}

impl Drop for SidecarManager {
    fn drop(&mut self) {
        self.stop(false);
    }
}

pub struct SupervisedAsr(Arc<SidecarManager>);

impl Asr for SupervisedAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        self.0.transcribe(req)
    }
}

pub struct SupervisedMt(Arc<SidecarManager>);

impl Mt for SupervisedMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        // Gọi hàm của chính `LlamaServer`, không phải `Mt::count_tokens` (cùng tên, trả `MtError`).
        self.0.with_llama(|s| LlamaServer::count_tokens(s, text))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        self.0.with_llama(|s| LlamaServer::stream(s, req, on_delta))
    }
}
```

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `cargo test -p pipeline`
Expected:

```text
test result: ok. 97 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.53s
test result: ok. 14 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.27s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/pipeline-fc16c618e4b8f5a0)
     Running unittests src/bin/fake_asr_worker.rs (target/debug/deps/fake_asr_worker-9dfc4bfd3d3f8afa)
     Running unittests src/bin/fake_llama_server.rs (target/debug/deps/fake_llama_server-c38f44afa7fc4703)
     Running tests/clients.rs (target/debug/deps/clients-429936f3fc6661e8)
     Running tests/lifecycle.rs (target/debug/deps/lifecycle-72cb79e575bb1e0c)
     Running tests/vad_reference.rs (target/debug/deps/vad_reference-f0916b9001a6d4ad)
```

- [ ] **Step 6: Clippy và định dạng**

Run: `cargo clippy -p pipeline --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không có cảnh báo, `cargo fmt` không in gì.

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline/src/lib.rs \
  crates/pipeline/src/supervisor.rs \
  crates/pipeline/tests/lifecycle.rs
git commit -m "feat(pipeline): giám sát hai tiến trình phụ: khởi động lại, chuyển CPU, tắt khi rảnh (Đ2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
