# Giai đoạn 1 · 00: Tổng quan MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm MVP theo spec §13 (Giai đoạn 1): đủ F1–F10, có license server nhận thanh toán PayOS với bốn gói và hạn mức (§2, §6.8), và đạt A1–A7. Công việc chia thành tám kế hoạch con 01–08; mỗi kế hoạch cho ra một phần chạy và test được. File này giữ bảng đối chiếu từ spec sang kế hoạch con để không sót yêu cầu nào, cùng các quy ước chung, việc còn chờ, rủi ro và các điểm cần chủ dự án quyết.

**Kiến trúc:** Giữ kiến trúc §5.
- Tiến trình chính Tauri không chứa ggml. Nhận dạng và dịch chạy trong hai tiến trình phụ, `asr-worker` và `llama-server`.
- Logic nằm trong các crate có test chạy không cần Tauri: `audio-capture`, `pipeline`, `asr-protocol`, `asr-worker`. `src-tauri` nối các crate vào app, và giữ phần gắn liền với app: cửa sổ, khay, phím tắt, cài đặt, kho khóa, model, bản quyền (§12).
- Giao diện React có hai cửa sổ `main` và `overlay`, mỗi cửa sổ có quyền riêng.
- License server là dự án riêng ở `server/` (Hono trên Cloudflare Workers + D1). App chỉ gọi server khi mua, kích hoạt và kiểm tra bản quyền.
- Model tải từ R2 theo manifest ký Ed25519.

**Công nghệ:**
- Giữ từ Giai đoạn 0; chỉ nâng khi chủ động quyết (§6.12):
  - Rust 1.98.1 (edition 2024);
  - Tauri 2.12, tauri-plugin-global-shortcut 2.4, tauri-nspanel 2.1;
  - React 19.3, Vite 8.3, TypeScript 7.0, Node 24.21 LTS, pnpm 12.6;
  - whisper-rs 0.16 (whisper.cpp 1.8.3, có vá), llama.cpp v0.5.0 (b11146);
  - candle-onnx 0.11 với Silero VAD v6.2.3;
  - objc2-core-audio 0.3.2, windows 0.62.2;
  - rubato 5, rtrb 0.4, postcard 1.1, reqwest 0.13.
- Thêm ở Giai đoạn 1. Mỗi kế hoạch con chốt phiên bản lúc viết, theo §6.12:
  - phía app: Zustand, Vitest, các plugin Tauri 2 chính thức (store, autostart, single-instance, opener, updater), rusqlite với SQLCipher, kho khóa của hệ điều hành (Keychain, Credential Manager), Ed25519 và SHA-256 phía Rust;
  - phía server: TypeScript, Hono, Wrangler, D1, Cloudflare Access, Cron Triggers, Resend;
  - CI và cargo-about ở kế hoạch 07.

Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Đọc toàn bộ spec trước khi làm bất kỳ kế hoạch con nào.

Cách gọi tên trong file này:
- "Kế hoạch 0-0N" là kế hoạch Giai đoạn 0, `docs/superpowers/plans/2026-09-29-giai-doan-0-0N-*.md`. Khi spec viết "kế hoạch 0N", ý là các kế hoạch này.
- "01" tới "08" là kế hoạch con của Giai đoạn 1.
- Mã `C…` và `T…` ở mục 5; `Q…` ở mục 8; `Đ…` ở mục 9; `R…` ở mục 7.

---

## 1. Mục tiêu và phạm vi

### 1.1 Làm trong Giai đoạn 1

- F1–F10 (§3.1), với trải nghiệm ở §4 và thiết kế ở §5–§12.
- License server và tích hợp PayOS (§6.8), triển khai thật trên tài khoản Cloudflare riêng của sản phẩm.
- Đạt A1–A7 (§3.3), kể cả hai điều kiện A4 còn thiếu.
- Các việc kỹ thuật rút ra từ Giai đoạn 0 (§13):
  - mục "Việc cho MVP" của §5, §6.3, §6.4, §6.5, §12;
  - các phương án MVP phải chọn ở §6.12.
- Những việc còn dở của Giai đoạn 0 mà MVP cần (mục 5). Làm xen kẽ, theo đợt có máy Windows và máy tham chiếu.

### 1.2 Không làm

Theo §3.2:
- Dịch giọng của người dùng rồi phát vào cuộc họp (micro ảo); thu âm từ micro.
- Bot tham gia cuộc họp, xử lý trên cloud.
- Tóm tắt hoặc biên bản cuộc họp; phân biệt ai đang nói; ghi âm cuộc họp.
- Linux, Mac chip Intel, Windows ARM64.
- Phát hành qua kho ứng dụng.
- App mobile; dịch chữ trên màn hình (OCR).

Cũng không làm trong Giai đoạn 1:
- Các việc của Giai đoạn 2 (§13):
  - cổng thanh toán quốc tế và thuê bao tự gia hạn. MVP chỉ giữ interface `PaymentProvider` và hai trường `provider`, `currency` (§6.8);
  - thu âm theo từng app trên Windows;
  - gói doanh nghiệp;
  - thêm ngôn ngữ giao diện.
- Các biện pháp chống crack để Giai đoạn 2 (§10.2): chống debug, làm rối code sâu hơn, kiểm tra toàn vẹn nhiều lớp, phát hiện gian lận bằng phân tích hành vi.
- Website: trang tải, trang giá, chính sách quyền riêng tư, điều khoản. Phần này có spec riêng (§15); kế hoạch con chỉ chừa chỗ cho link tới website.
- Việc pháp lý và kế toán (§15): nhãn hiệu, hồ sơ chuyển dữ liệu ra nước ngoài, thông báo website bán hàng, hóa đơn điện tử. Chủ dự án lo; phần nào làm đổi yêu cầu kỹ thuật thì ghi ở mục 8.

### 1.3 Hiện trạng code khi bắt đầu (2026-10-01, commit `3f085a9`)

Trên Mac, ba lệnh `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings` và `cargo test --workspace` chạy xanh (144 test qua; 1 test bỏ qua là `vad_reference`). Các lệnh còn lại của kiểm tra chuẩn (mục 6.2) chưa chạy lại lúc viết kế hoạch này.

Có sẵn, dùng lại được:
- `asr-protocol`: khung `u32` little-endian cộng postcard, tối đa 16 MiB; `MIN_AUDIO_CTX` và `audio_ctx_for_samples`; test chỉ số biến thể.
  - Chưa có: `prev_lang`, enum cho `backend` và `decode_mode`, `Error.kind`, `protocol_version`.
- `asr-worker`: chế độ A và B (`shared-encode`); chọn ngôn ngữ (`lid.rs`, worker tự giữ ngôn ngữ của đoạn trước); luật lặp 4/3/2 bản; trần token; mồi zh/ja tắt; flash attention tắt.
  - Chưa có: `probe.rs`. `main.rs` đã gọi `asr_worker::probe` khi bật feature `vulkan`, nên hiện build `--features vulkan` bị lỗi; code của `probe.rs` nằm ở kế hoạch 0-03, Task 14.
  - Chưa có: chuyển fd 1 sang stderr, xoay log, `backend` là thiết bị thật.
- `audio-capture`: `AudioSource`, `GapFiller`, `Mixer2`, `MonoResampler`, `MacTapSource` (`TapTarget::SystemExceptSelf` và `TapTarget::Process(pid)`), công cụ `capture` và `Capture.app`.
  - Chưa có: `windows.rs` (code nằm ở kế hoạch 0-04, Task 7), listener đổi thiết bị trên macOS, danh sách app đang phát âm thanh.
- `pipeline`: `segmenter`, `vad` (candle), `asr_client` (đồng bộ, dùng `std::process`), `llama` (chạy `llama-server`, đọc stream SSE, vẫn truyền `--api-key`), `prompt`, `sse`.
  - Chưa có: ghép câu và luật bỏ đoạn (hai phần này đang nằm trong `crates/latency-bench/src/latency.rs`), hậu xử lý bản dịch, hàng đợi §7, giám sát tiến trình phụ, thuật ngữ.
- `latency-bench` (lệnh `latency` cho S6, `asr-eval` cho A4) và `bench/phase0/` (công cụ Python cho A3, A4, S6, dung lượng bộ cài).
- `src-tauri`: spike S5.
  - Thanh phụ đề là NSPanel non-activating trên macOS, và cửa sổ topmost `focusable(false)` trên Windows.
  - Có khóa click xuyên, ẩn/hiện, ba phím tắt cố định, lệnh `set_accessory`.
  - Có capabilities cho `main` và `overlay`, CSP chặt.
  - Identifier vẫn là `dev.meetingtranslator.spike`; `bundle.active = false`.
- `src/`: hai entry React của spike (`main.tsx`, `overlay.tsx`). Chưa có Zustand, i18n, vitest.
- `deny.toml`; `.cargo/config.toml` (mức CPU cố định); profile release (`strip`, `lto`, `codegen-units = 1`, `panic = "abort"`); `third_party/` (bản vá whisper.cpp và whisper-rs).

Chưa có:
- `server/`, CI, remote git.
- `bench/phase0/REPORT.md`.
- Các file kết quả `s1_capture.md`, `s2_capture.md`, `s3_windows.md`, `s3_lid.md`, `s5_overlay.md`, `s6_latency.md` (mục 5).

## 2. Các kế hoạch con

| File | Kế hoạch | Viết | Cần xong trước |
|---|---|---|---|
| `2026-10-01-giai-doan-1-01-nen-app.md` | 01 Nền app | đã viết, đã duyệt; đã làm trên Mac Task 1–23 (`69f30ba` … `5281e27`, sửa sau review đợt R và U, nâng `475cf0b`, `34777f0`); còn Task 24 (thử tay trên Mac, người), Task 25 (Windows) | — |
| `2026-10-01-giai-doan-1-02a-pipeline-crate.md`, `…-02d-pipeline-clients.md`, `…-02b-pipeline-engine.md`, `…-02c-pipeline-app.md` (làm theo thứ tự này) | 02 Pipeline trong app | đã viết, đã duyệt; đã làm trên Mac tới 02c Task 7 (`f2edbd6`); còn 02b Task 7–9 (máy rảnh), 02c Task 8 (người), 02c Task 9 (Windows) | phần crate: —; phần nối vào app: 01 |
| `2026-10-02-giai-doan-1-03a-phu-de-du-lieu.md`, `2026-10-02-giai-doan-1-03b-phu-de-giao-dien.md` (làm theo thứ tự này, trước 04) | 03 Phụ đề, bản chép lời, lịch sử, từ điển thuật ngữ | đã viết, sửa theo review, đã thực thi trên Mac: 03a Task 1–13 và 03b Task 1–7 (code và kiểm tra chuẩn); còn 03b Task 8 (thử tay Mac, người) và Task 9 (Windows) | 01, 02 |
| `2026-10-02-giai-doan-1-04a-quan-ly-model-loi.md`, `2026-10-02-giai-doan-1-04b-quan-ly-model-app.md` (làm theo thứ tự này) | 04 Quản lý model | đã viết; đã sửa theo review lần 1, lần 2 và quyết định của chủ dự án ngày 2026-10-02, dựng trên cây cuối của 03; chờ duyệt; làm sau 03 | 01, 02, 03 |
| `2026-10-01-giai-doan-1-05-license-server.md` | 05 License server | đã viết, đã duyệt; đã làm Task 1–18 (`35d758d` … `5664b1b`, sửa sau review đợt A–D, review cuối Approved ở `4dbd229`); còn Task 19–21 (người: triển khai staging, giao dịch thử, lên production) | — |
| `2026-10-03-giai-doan-1-06a-ban-quyen-loi.md` (06a: token, hạn mức, client, trạng thái bản quyền, mua gói, tự kiểm chữ ký); `2026-10-03-giai-doan-1-06b-ban-quyen-giao-dien.md` (06b: giao diện, thử tay, Windows) | 06 Bản quyền trong app | đã viết, sửa theo ba lần review, đã thực thi trên Mac: 06a Task 1–10 và 06b Task 1–4 (code, kiểm tra chuẩn ở 06a Task 11 và 06b Task 5); còn 06b Task 6 (staging, người), Task 7 (Windows) | 01, 02, 03, 05 |
| `2026-10-02-giai-doan-1-07a-ci-dong-goi.md` (07a: CI, build tiến trình phụ từ mã nguồn đã khóa, đóng gói, THIRD_PARTY_NOTICES, các bước ký chạy khi có secret); `…-07b-…` (cập nhật, kênh stable/beta, ký thật, phát hành) | 07 Đóng gói, ký số, cập nhật, CI | 07a đã sửa theo review lần 1 và dựng lại trên cây sau 06 (`d266be5`), chờ duyệt lại. 07b đang viết | 07a: 01 (dựng trên cây sau 06); 07b: 01–06 |
| `2026-10-01-giai-doan-1-08-nghiem-thu.md` | 08 Nghiệm thu | sau khi 07 có bộ cài chạy được | 07 |

Mỗi mục dưới đây mô tả phạm vi để viết kế hoạch con, chưa phải task. Danh sách dòng của bảng đối chiếu (mục 4) mà một kế hoạch nhận thì lọc bằng lệnh ở Task 2, Step 1.

### 2.1 Kế hoạch 01: Nền app

- **Mục tiêu:** biến app spike S5 thành khung app thật, để các kế hoạch sau chỉ việc lắp chức năng vào. Gồm:
  - cài đặt có schema và migrate (§6.9);
  - i18n vi/en (§4.5);
  - khay hệ thống; phím tắt đổi được (F10);
  - hai cửa sổ `main` và `overlay` với quyền riêng (§10.2);
  - khung các màn hình ở §4.3 và khung các bước lần đầu mở (§4.1).
- **Bàn giao, chạy và test được:**
  - `pnpm tauri dev` mở app có icon khay. Menu khay gồm: Bắt đầu/Dừng (chưa nối pipeline), Ẩn/hiện phụ đề, Khóa/mở khóa, Mở cửa sổ chính, Thoát.
  - Cửa sổ chính điều hướng được tới mọi màn hình ở §4.3. Màn hình chưa có chức năng thì hiện trạng thái trống, có chuỗi i18n.
  - Cài đặt lưu, đọc và migrate được từ schema cũ. Giá trị ngoài phạm vi bị phía Rust từ chối.
  - Identifier của app là `com.aitranslator.desktop`, tên hiển thị `AI Translator` (Q1, spec D13). Repo, crate và binary giữ tên `meeting-translator`.
  - Đổi vi/en có tác dụng ngay, cả trong menu khay.
  - Phím tắt đổi được trong Cài đặt; báo lỗi khi không đăng ký được.
  - Bấm X (`⌘W`, `Alt+F4`) thì cửa sổ ẩn xuống khay. Thoát ở khay thì app thoát hẳn. `⌘Q` và Quit ở Dock không thoát.
  - Thanh phụ đề giữ nguyên hành vi của S5, thêm khóa và ẩn/hiện từ menu khay.
  - Có wrapper cho kho khóa của hệ điều hành, kèm bản giả dùng trong test (Đ5). Log của app ghi ra file trên máy, có xoay vòng (Đ10).
  - `cargo test` và `pnpm test` (vitest) xanh, có test i18n đủ khóa. Có test chứng minh cửa sổ `overlay` không gọi được lệnh ngoài quyền.
- **Spec phụ trách:** F7, F10, D8; §4.1 (khung, bước 1, 5, 7, 8); §4.3 (khung, nhóm Chung, Phím tắt, đóng cửa sổ và thoát); §4.4 (kiểu cửa sổ, khóa, icon ở Dock); §4.5; §6.9; §6.10; §10.2 (WebView); log và kho khóa dùng chung.
- **Phụ thuộc:** không. Xây trên code S5 ở `src-tauri/` và `src/`.
- **Làm trên Mac:** gần như toàn bộ.
- **Cần Windows:**
  - khay và `Alt+F4`;
  - thanh phụ đề topmost, không lấy focus;
  - bước 8 có ảnh hướng dẫn và nút mở `ms-settings:taskbar`;
  - không chặn tắt máy và đăng xuất;
  - lỗi khi phím tắt bị trùng.
- **Cần người thao tác:**
  - thử khay, `⌘Q`, Quit ở Dock, tắt máy, đăng xuất (§11, dòng "Khay");
  - bật "khởi động cùng hệ thống" thật;
  - thử kho khóa thật (Keychain có thể hỏi quyền, mục 6.8);
  - ma trận S5 và phím tắt trùng với app họp (C5).
- **Trạng thái:** đã viết, đã duyệt, đã sửa identifier `com.aitranslator.desktop` và tên `AI Translator` (Q1) trước khi thực thi. Các điểm lệch nhỏ của 01 (overlay chỉ có lệnh đọc `get_overlay_view`, menu app trên Mac chỉ English, `⌘Q` và Quit ở Dock bị hủy kèm lời nhắc, overlay ẩn lúc khởi động, chặn điều hướng và danh sách link ngoài cho phép, kho khóa Windows `persistence = Local`) đã vào spec ngày 2026-10-01.
  - **Đã làm trên Mac** (SHA ở bảng đối chiếu, mục 4): Task 1–22 (`69f30ba`, `4e0dfe9`, `bdfa1b8`, `7d828f0`, `ef7c3d6`, `fe318a5`, `1bf77f3`, `eadeab1`, `fe3c202`, `2c71e0c`, `7d0e517`, `579389b`, `dcdbd83`, `15d753d`, `8a54f76`, `2daa887`, `b89f22e`, `3a275a2`, `59ce681`, `af007e5`, `360b067`, `5281e27`); Task 23 là kiểm tra chuẩn, không có commit. Sửa trong lúc thực thi: `45a17e9` (dùng bản dự phòng của hai plugin vì luật 1 ngày tuổi), `4560558`. Sửa sau review đợt R (`e20f3ce`, `4d95f83`, `9998752`, `e501a61`, `d4a7796`, `a5cbfd4`) và đợt U (`629847b`, `ab88519`, `e96692d`, `d11d343`), xem phụ lục của 01. Nâng `yoke-derive` 0.8.4 (`475cf0b`); nâng Tauri 2.12.1, `tauri-plugin-autostart` 2.7.0, `tauri-plugin-single-instance` 2.5.2 (`34777f0`).
  - **Bàn giao khác mô tả:** overlay có một lệnh chỉ đọc `get_overlay_view` và không gọi lệnh khóa (01 QĐ5); menu app trên Mac chỉ có chữ English (01 QĐ15).
  - **Còn lại:** Task 24 (thử tay trên Mac, người: khay, phím tắt, thoát, tắt máy, khởi động cùng hệ thống, Keychain, ma trận S5 và phím tắt trùng C5); Task 25 (đợt Windows). Sau khi nâng `tauri-plugin-autostart` 2.7.0, Task 25 dòng 18 ghi kết quả theo bản 2.7.0 (`HKLM` trước).

### 2.2 Kế hoạch 02: Pipeline trong app

- **Mục tiêu:** nối `audio-capture` và `pipeline` vào app, để bấm Bắt đầu là có phụ đề dịch thật. Gồm:
  - đủ "Việc cho MVP" của §5, §6.3, §6.4, §6.5;
  - vòng đời và giám sát hai tiến trình phụ;
  - hàng đợi và chống nghẽn (§7);
  - xử lý lỗi phần pipeline (§9).
- **Cách chia luồng:** theo §7. 02 đã chọn luồng riêng và client đồng bộ, không dùng tokio (02a, QĐ1); spec §7 đã sửa theo ngày 2026-10-01.
- **Bàn giao, chạy và test được:**
  - Trên Mac, `pnpm tauri dev`: bấm Bắt đầu (nút, phím tắt hoặc khay) thì phụ đề dịch từ âm thanh hệ thống hiện trên thanh phụ đề. Hiển thị ở mức tối thiểu có từ S5; phần hoàn chỉnh ở 03.
  - Sự kiện `subtitle://upsert` và `subtitle://delta` đúng §6.6, đủ các trạng thái.
  - Test tích hợp chạy pipeline từ file WAV, không thu âm thật, kiểm phụ đề có xuất hiện, đúng thứ tự, đúng thời gian.
  - Test vòng đời với tiến trình phụ giả: crash, khởi động lại, gửi lại đoạn, chuyển sang CPU, tắt sau 10 phút.
  - `latency-bench mt-eval` dịch bộ test A3 bằng code Rust của app (Đ4).
  - A3, A4 và S6 chạy lại không thụt lùi (mục 6.7).
  - Trên Windows (khi có máy): cùng luồng đó với WASAPI loopback và hai bản `asr-worker`.
- **Spec phụ trách:** F1 (luồng), F2 (logic ngôn ngữ), D7, D9, D12; §5; §6.1–§6.5; §6.6 (cấu trúc, trạng thái, sự kiện); §7; §9 (các dòng của pipeline); §10.1 (âm thanh, tiến trình phụ); §10.2 (thay tiến trình phụ, log); §11 (unit test và test tích hợp của pipeline); §12 (`session.rs`, `sidecar/`, các crate, `third_party/`).
- **Phụ thuộc:**
  - Phần crate (`asr-protocol`, `asr-worker`, `pipeline`, `latency-bench`) không cần 01, nên làm trước hoặc song song với 01.
  - Phần nối vào app cần 01 xong cài đặt, cửa sổ, khay và phím tắt.
- **Làm trên Mac:** phần lớn.
- **Cần Windows:**
  - `windows.rs` (C2), `IMMNotificationClient`, chế độ tự động Console và Communications;
  - Job Object, `SetDefaultDllDirectories`;
  - chọn bản `asr-worker` theo `--probe` (C3);
  - chạy lại S4 (C4);
  - khoảng lặng dài.
- **Cần người thao tác:**
  - cấp quyền "Ghi âm thanh hệ thống" cho app, rồi chạy thử với âm thanh thật (C1);
  - dữ liệu hội thoại zh/ja có quyền dùng (Q6);
  - clip nhạc có quyền dùng, để thử `no_speech_prob` (02b Task 6 đã đo với nhạc CC0 và public domain của Wikimedia Commons, `9d6c7fd`; chủ dự án duyệt bộ nhạc ở dòng 351);
  - xác nhận đã đóng app nặng trước mỗi lượt đo S6 (mục 6.9).
- **Phần cho hạn mức (06):** 02 cung cấp số đo `SessionMetrics::translated_speech_ms`, và cho phép dừng phiên với lý do `quota_exhausted`.
  - Cách đếm phải khớp spec §6.8 ("Hạn mức"): chỉ đoạn thật sự được dịch, mỗi đoạn một lần; không tính `same_lang`, `dropped`, đoạn bị lọc, `skipped`, `failed`.
  - **Đã sửa ở 02b** (02a QĐ25, `aaeca34`): `translated_speech_ms` cộng khi phụ đề sang `done`, không còn cộng ngay khi đoạn chép lời xong.
  - **Đã thêm ở 02** (`b0eb41f`, `4383c00`): `Segment.speech_ms` (spec §6.3, dòng 349). `start_ms`, `end_ms` không gồm phần đệm; đoạn gộp ở hàng đợi cộng `speech_ms` của từng đoạn con. Chạm hạn mức thì bỏ hàng đợi, chỉ dịch xong câu đang dịch (dòng 333, 02a QĐ26).
  - Chỗ nối cho 06 (đầu 02c): `EventSink::usage` chạy trên luồng phụ đề của engine, nên bộ đếm của 06 không ghi kho khóa đồng bộ ở đó; "hạn mức còn 0 thì không bắt đầu" là `SessionDeps::check_quota`.
- **Trạng thái:** đã viết thành bốn file, làm theo thứ tự 02a, 02d, 02b, 02c. Các điểm lệch spec mà controller đã chấp nhận (luồng riêng không tokio, hỏi định kỳ 500 ms khi đổi thiết bị, trường `replaces`, chờ lần đầu tới 180 giây, Q4 cách 2, giữ flash attention tắt, `PipelineConfig`, giao thức `asr-worker` bản 2) đã vào spec ngày 2026-10-01.
  - **Đã làm trên Mac** (SHA ở bảng đối chiếu, mục 4): 02a Task 1–3 (`e963cdb`, `b0eb41f`, `4242745`); 02d Task 1–3 (`8159852`, `00e1613`, `4268836`, thêm test `9aace29`); 02b Task 1–6 (`4383c00`, `aaeca34`, `a1143b0`, `1546741`, `c6ee52b`, `9d6c7fd`, đo lại tỉ lệ token ở `7e88b02`); 02c Task 1–7 (`518d222`, `1064c5a`, `45ccd02`, `11cae74`, `73baf99`, `7410e7d`, `f2edbd6`). Ngoài kế hoạch: không dùng lại kết nối tới `llama-server` sau response stream (`e591a1e`); `mt-eval` ghi lý do của câu lỗi (`7279c07`); nâng Tauri 2.12.1 và hai plugin autostart, single-instance (`34777f0`); ngưỡng tỉ lệ token cho 12 chiều không có tiếng Việt (`22fa4fe`).
  - **Còn lại:** 02b Task 7–9 (chạy lại A3, A4 cùng lượt fullctx C12, S6; cần máy rảnh); 02c Task 8 (thử trên Mac với âm thanh thật, cần người; gồm chọn neo trang System Settings, điểm cần quyết 3 của 02a); 02c Task 9 (đợt Windows). Bàn giao "bấm Bắt đầu là có phụ đề từ âm thanh thật" chỉ được xác nhận sau 02c Task 8.
  - **Controller đã quyết ngày 2026-10-02:** ngưỡng tỉ lệ token cho cặp không có tiếng Việt nhận đề xuất theo số đo (điểm cần quyết 4 của 02a, `22fa4fe`); số thứ tự `revision` của `Settings` để kế hoạch 03 làm (điểm 10, mục 2.3); thử lại sau khi bỏ cuộc (`GaveUp`) bắt đầu lại từ quyết định GPU ban đầu theo `--probe` (02a QĐ7); 16–17 mutation còn sống được chấp nhận (02a, mục "Kiểm bằng mutation").
  - **Việc cuối của 02 giao cho kế hoạch khác:** N1 của review cuối 02 (bộ tắt khi rảnh chen vào giữa lần chuẩn bị phiên) do 03 sửa (03a Task 12, `cfa9aed`), không phải 04. Ghi chú 8 (đổi gói lúc đang dịch) sửa ở 04 Task 7 và 9 (`76fcbbf`, `8151435`).
  - **Chủ dự án chưa quyết** các điểm 1, 2, 6, 7, 8 của 02a: dòng 350–354. 02 đã làm theo phương án ghi trong 02a.

### 2.3 Kế hoạch 03: Phụ đề, bản chép lời, lịch sử, từ điển thuật ngữ

- **Mục tiêu:** hoàn thiện phần hiển thị và dữ liệu của phiên. Gồm:
  - thanh phụ đề đủ §4.4 (F3);
  - bản chép lời (F4);
  - lịch sử lưu trong SQLCipher, và từ điển thuật ngữ (F5);
  - bảng debug ẩn (§7);
  - bước "Nghe thử" (§4.1, bước 6).
- **Bàn giao, chạy và test được:**
  - Thanh phụ đề đủ §4.4:
    - 1–3 dòng, câu gốc tùy chọn;
    - bản dịch hiện dần từng chữ; phụ đề tạm màu nhạt;
    - chỉ báo đang nghe, không có âm thanh, đang trễ;
    - nhớ vị trí theo từng màn hình;
    - nhóm Cài đặt "Phụ đề".
  - Cửa sổ chính có bản chép lời: tìm, sao chép, xuất TXT, SRT, Markdown.
  - Lịch sử bật/tắt được; xóa từng phiên hoặc xóa tất cả.
  - Từ điển tối đa 500 cặp, nhập và xuất CSV; thuật ngữ khớp được đưa vào prompt.
  - File DB không mở được bằng `sqlite3` thường. Nút "Xóa toàn bộ dữ liệu" xóa lịch sử và từ điển.
- **Spec phụ trách:** F3 (nội dung), F4, F5; §4.1 bước 6; §4.2 bước 3; §4.3 (bản chép lời, lịch sử, từ điển, Phụ đề, Quyền riêng tư); §4.4; §6.5 (thuật ngữ); §6.6 (hiển thị, lưu, xuất); §7 (bảng debug); §9 (phần hiển thị); §10.2 (SQLCipher); §11 (vitest cho thanh phụ đề và xuất file, test thuật ngữ, test SQLCipher).
- **Phụ thuộc:** 01 (cửa sổ, cài đặt, kho khóa), 02 (sự kiện phụ đề, prompt).
- **Làm trên Mac:** phần lớn.
- **Cần Windows:** DPI 150%, nhiều màn hình, build SQLCipher trên Windows.
- **Cần người thao tác:** xem thanh phụ đề trên app họp đang toàn màn hình; kiểm độ tương phản; bước "Nghe thử" với tiếng thật.
- **Nhận từ 01:**
  - Mặc định của thanh phụ đề theo 01 QĐ3. Ẩn/hiện và khóa thanh phụ đề đi qua `overlay::Surface`; trên Windows là Win32 (01 QĐ23).
  - Kéo cạnh dùng `start_resize_dragging`, không gọi hàm đổi cờ của tao cho overlay trên Windows (01 QĐ23). Quyền `core:window:allow-start-resize-dragging` thêm cho overlay thì sửa danh sách cố định trong `acl_tests.rs` (mục 8, Q12).
  - `blob:` bị chặn, kể cả của chính app, nên xuất file không đi qua `<a download>` tới `blob:` (01 QĐ22).
  - Nếu 01 Task 24 dòng 6–7 cho thấy NSPanel không phát sự kiện di chuyển, 03 phải lưu vị trí thanh phụ đề cách khác (ghi kết quả vào đây).
- **Nhận từ 02:**
  - Ghi chú N8 ở đầu 02c: nguồn `SystemExceptSelf` chỉ loại các pid của chính app. Tiếng do WebView của app phát ra đi qua tiến trình `com.apple.WebKit.GPU` (macOS) nên vẫn bị thu; bước "Nghe thử" không được phát tiếng mẫu qua WebView mà mong nó bị loại.
  - Điểm cần quyết 10 của 02a (controller quyết ngày 2026-10-02): 03 thêm số thứ tự `revision` cho `Settings`; 02 giữ như hiện tại (`AppStatus` có `rev`, `init()` giữ cài đặt đã tới qua sự kiện).
- **Trạng thái:** đã viết thành hai file 03a (Task 1–13), 03b (Task 1–10), base `5925d42`. Đã sửa theo review lần 1 (Q1–Q5, N1–N13) và yêu cầu mới của chủ dự án sau khi thử tay (kéo cạnh hoặc góc trên cả macOS lẫn Windows, nút ✕ ẩn thanh, màu chữ và màu nền; spec §4.3, §4.4). Chủ dự án đã duyệt bốn điểm cần quyết của 03 (2026-10-02). 03 làm luôn ghi chú N1 của review cuối 02 (03a Task 12); 04 chỉ làm N2.
- **Đã thực thi trên Mac** (SHA ở bảng đối chiếu, mục 4):
  - 03a Task 1–12: `3a3d58a`, `4424518`, `3d9c42f`, `4d2980a`, `7c3e57e`, `7ed54a3`, `a067dce`, `91c5edf`, `1b4fb11`, `ef7ef3a`, `7a000ca`, `cfa9aed`; Task 13 là kiểm tra chuẩn, không có commit.
  - 03b Task 1–6: `ccb59c2`, `39ff6f9`, `2e8f3ab`, `1814de9`, `f43e2a5`, `7a2e57e`; Task 7 là kiểm tra chuẩn, không có commit (cây KHỚP bản tham chiếu `f30491f`).
  - Kiểm tra chuẩn trên cây cuối: `cargo test --workspace` 576 qua, 0 lỗi, 12 bỏ qua; `pnpm test` 97 test trong 10 file; `pnpm -C server check` 360 test; clippy, `cargo deny`, `pnpm audit`, `check-windows.sh` đều xanh.
  - **Còn:** 03b Task 8 (thử tay trên Mac: NSPanel nhận `:hover` và đổi con trỏ ở vùng kéo cạnh, nút ✕, sự kiện di chuyển của NSPanel, độ tương phản, "Nghe thử" với tiếng thật, app họp toàn màn hình, nhiều màn hình; cần người) và Task 9 (đợt Windows; cần máy Windows và người). Các dòng bảng đối chiếu phụ thuộc hai task này để `chờ`.

### 2.4 Kế hoạch 04: Quản lý model

- **Mục tiêu:** F6 và §6.7. Gồm:
  - manifest ký Ed25519 trên R2;
  - tải tiếp được khi rớt mạng, kiểm SHA-256;
  - đề xuất gói theo máy, với ngưỡng đọc từ manifest (Đ7);
  - nút xóa model;
  - bước 2–3 của lần đầu mở (§4.1).
- **Bàn giao, chạy và test được:**
  - Bucket R2 cho môi trường staging chứa model kèm LICENSE và NOTICE, cùng `models.json` ký bằng khóa staging (Đ8).
  - Lần đầu mở, app đề xuất gói kèm dung lượng và ghi chú chất lượng (§8). Tải được, tạm dừng rồi tiếp tục được, rớt mạng thì tải tiếp.
  - Sai SHA-256 thì báo lỗi; manifest bị sửa thì bị từ chối.
  - Có nhóm Cài đặt "Model" và nút "Xóa model và dữ liệu".
  - Mỗi ngày kiểm manifest tối đa một lần; có bản mới thì hỏi trước khi tải.
- **Spec phụ trách:** F6, D5, D6; §4.1 bước 2–3; §4.3 (Model, "Xóa model và dữ liệu"); §6.7; §8 (hạng máy, ghi chú chất lượng, gói lai); §9 (model thiếu hoặc hỏng, tải lỗi, đổi sang gói Nhẹ); §10.1 (giấy phép model); §11 (manifest, card 4 GB và 6 GB).
- **Phụ thuộc:**
  - 01, và 02 (đường dẫn model cho tiến trình phụ, kết quả `--probe`).
  - Tài khoản Cloudflare (đã có, T4).
  - Manifest chính thức ký trong CI của 07 (T3, Đ8).
- **Làm trên Mac:** phần lớn.
- **Cần Windows:** `--probe` trên GPU thật; đường dẫn `%LOCALAPPDATA%\<bundle-id>\models`.
- **Cần người thao tác:** tạo bucket, gắn tên miền và tạo API token trên dashboard Cloudflare; thử rớt mạng thật.
- **Trạng thái:** đã viết thành hai file 04a (Task 1–6), 04b (Task 7–15); sửa theo review lần 1, lần 2 và quyết định của chủ dự án, dựng lại trên `main` `d63efc6` (03 đã thực thi cộng bốn sửa sau review cuối), không còn bước gộp tay (04a mục "Nối với kế hoạch 03"). Làm sau 03. Ngưỡng thật chờ C6, nhưng không chặn việc viết hay làm.
  - **Đã làm trên Mac tới Task 12** (SHA ở bảng đối chiếu, mục 4): 04a Task 1–6 (`855237e`, `1be9efa`, `713c3be`, `d3ebbc5`, `8a439d3`, `62a0096`); 04b Task 7–11 (`76fcbbf`, `adb1e7b`, `8151435`, `3c7cfd8`, `1797cd1`); Task 12 là kiểm tra chuẩn, không có commit.
  - Kiểm tra chuẩn trên cây cuối: `cargo test --workspace` 659 qua, 13 bỏ qua; riêng app 304 qua, 3 bỏ qua; `pnpm test` 114 test; `node --test scripts/models/manifest.test.mjs` 6 test; `pnpm -C server check` 360 test; clippy, `cargo deny`, `cargo audit`, `pnpm audit`, `check-windows.sh` đều sạch.
  - **Còn:** 04b Task 13 (bucket R2 staging, khóa staging và manifest staging; cần người và tài khoản Cloudflare), Task 14 (đợt Windows: `--probe` trên GPU thật, `%LOCALAPPDATA%\<bundle-id>\models`, card 4 GB và 6 GB; cần máy Windows). Ngưỡng thật chờ C6, C7; giá trị C8 cho dòng 223, 226. Các dòng bảng đối chiếu phụ thuộc những việc này để `chờ`; dòng 226 còn chờ CDA (Q15).
  - **Nhận từ 04 cho 06:** gói đang dùng (`modelTier` là mã gói của manifest, chỉ đổi qua `select_model_pack`); `ModelService::resolve` và lệnh tải, xóa model không đụng kho khóa; nút "Xóa model và dữ liệu" cũng không đụng kho khóa (06 kiểm, Q14).
  - **Chủ dự án quyết ngày 2026-10-02:**
    - giữ ngưỡng đề xuất gói Chuẩn RAM 15 360 MiB, VRAM 5 632 MiB; `min_ram_mib` là 6 144 MiB;
    - đang tải bản cập nhật của gói đang dùng thì chặn bắt đầu phiên;
    - **máy chưa được hỗ trợ thì không cho tải model** (RAM dưới `min_ram_mib`, x86_64 không AVX2, ổ không đủ chỗ), phía Rust từ chối lệnh tải;
    - "Xóa model và dữ liệu" không đưa app về lần đầu mở;
    - Q17 (mục 8.1).
  - N1 của review cuối 02 (bộ tắt khi rảnh) đã do 03 làm (03a Task 12, `cfa9aed`); 04 chỉ làm ghi chú 8 (N2: đổi gói lúc đang dịch, 04b Task 7, 9; `76fcbbf`, `8151435`).
  - **Nhận từ 03:** `data::clear_all_data` cho "Xóa model và dữ liệu"; `dataCleared` của store chính (giao diện bỏ dữ liệu đang hiện); `PrivacySettings.tsx` chứa nút của 04; `session::engine_config` nhận cả `SharedGlossary` lẫn `PipelineConfig`. Nút "Xóa model và dữ liệu" gọi `data::clear_all_data` (chỉ xóa `data.db` và mục `db-key`) rồi xóa model, đặt trong `PrivacySettings.tsx` (03b Task 3, `2e8f3ab`). Danh sách file giao nhau ở 03a, mục "Thứ tự với kế hoạch 04 và file giao nhau"; 03 đã xong nên 04 làm trên cây cuối của 03.

### 2.5 Kế hoạch 05: License server

- **Mục tiêu:** §6.8 phía server. Gồm:
  - TypeScript + Hono trên Cloudflare Workers + D1;
  - `PaymentProvider`, với PayOS là cài đặt đầu tiên;
  - bốn gói (P1): checkout theo gói `pro`, `pro_x2`, `pro_x5`, mỗi đơn 30 ngày; bảng gói và giá trong cấu hình; `GET /v1/plans`; mua thêm cùng gói và đổi gói có quy đổi ngày (spec §6.8, "Mua thêm và đổi gói");
  - token Ed25519 có `kid` có số thứ tự, mang `plan` (mã gói), `cycle_anchor`, `quota_minutes_per_cycle`;
  - hai ô khóa ký là secret `TOKEN_SIGNING_KEY_A`, `TOKEN_SIGNING_KEY_B` của Worker API, biến `TOKEN_SIGNING_SLOT` chọn ô đang ký, không dùng kho mật khẩu; thao tác admin ký thử bằng ô dự phòng qua service binding (spec §10.2);
  - thao tác admin xóa hoặc ẩn danh theo email, chỉ chạy tay; không có cron tự xóa (Q9);
  - `/admin` đặt sau Cloudflare Access;
  - email qua Resend, sau interface `EmailProvider`;
  - giới hạn tần suất (§10.2); đối soát đơn mỗi 5 phút.
- **Bàn giao, chạy và test được:**
  - `server/` có test xanh.
  - Hai môi trường staging và production trên tài khoản Cloudflare của sản phẩm.
  - Trên staging, một giao dịch thật với số tiền nhỏ qua PayOS cấp được key và gửi được email.
  - `/admin` chỉ mở được qua Access.
  - Bộ vector test dùng chung với 06 (Đ9).
- **Spec phụ trách:** D11, P1 (bảng gói và giá theo cấu hình, đổi gói), P2; §5 (license server); §6.8 phía server; §9 (409, webhook chậm hoặc trùng, chuyển thiếu); §10.1 (khóa PayOS, dữ liệu tối thiểu, đồng ý xử lý email); §10.2 (chia sẻ key, dò key, tấn công server, lộ khóa token); §11 (test của server); §12 (`server/`, `.gitignore`); §14 giả định 7.
- **Phụ thuộc:** không. Kế hoạch này chỉ đụng `server/` và `.gitignore`, nên chạy song song được với 01–04.
- **Làm trên Mac:** toàn bộ code và test.
- **Cần Windows:** không.
- **Cần người thao tác:**
  - `wrangler login`; nhập secret của PayOS và Resend (mục 6.5); cấu hình Cloudflare Access;
  - đăng ký webhook với PayOS;
  - xác thực tên miền gửi email (chờ tên miền, Q1);
  - trả tiền cho giao dịch thử.
- **Trạng thái:** đã viết, đã duyệt và đã làm phần code (chi tiết ở cuối mục này). Trước khi thực thi, kế hoạch đã sửa theo mô hình gói mới:
  - checkout nhận `plan` là `pro`, `pro_x2`, `pro_x5` thay cho `pro_1m`, `pro_12m`; `PRICES_JSON` thành bảng gói có cả hạn mức;
  - luật mua thêm và đổi gói, ước tính `license_expires_at` trong response của checkout; `GET /v1/plans`;
  - token: `plan` là mã gói (thay QĐ11 của 05, vốn để `"pro"`), thêm `cycle_anchor`, `quota_minutes_per_cycle`;
  - khóa dự phòng: hai ô `TOKEN_SIGNING_KEY_A`, `_B` và biến `TOKEN_SIGNING_SLOT` thay cho bản trong kho mật khẩu (QĐ29, Task 7, 19, 21, Phụ lục A); đổi khóa bằng cách đổi `TOKEN_SIGNING_SLOT` vì secret không đọc lại được; lệnh admin ký thử bằng ô dự phòng;
  - license đã bị thu hồi mà nhận tiền của đơn gia hạn hay đổi gói: không áp đơn, đơn sang `paid_needs_review`, cảnh báo `order_needs_review`; admin xử lý bằng `POST /admin/orders/{order_code}/resolve` (`grant_new_license` hoặc `refunded`), đơn thành `paid` hay `refunded` (05 QĐ37);
  - "hiện tại" khi áp đơn không sớm hơn `cycle_anchor` đang có của license (05 QĐ32);
  - admin gia hạn tay license đã hết hạn thì đặt lại `cycle_anchor` và mở cửa sổ `quota_fresh`;
  - `503 pricing_not_configured` cho cả `GET /v1/plans`, `activate`, `validate`; không hạ hạn mức của gói đang bán;
  - Đã làm ở commit `82a7718` (kế hoạch 05 theo 4 gói và hạn mức); spec khớp theo ở lượt sửa kế tiếp.
  - Q9: giữ dữ liệu không thời hạn; `POST /admin/erase` chỉ chạy tay; bỏ "Chờ Q9" ở bảng "Nơi lưu dữ liệu cá nhân";
  - Q10: không gửi thông tin hóa đơn (giữ QĐ23).
  - Token thêm `quota_epoch` (số nguyên của activation), `activation_created_at` và `quota_fresh`. `quota_fresh` là `true` cho mọi token cấp trong 15 phút kể từ mốc gần nhất trong ba mốc:
    - lúc tạo activation;
    - lúc cấp token đầu tiên sau khi admin tăng `quota_epoch` (không phải lúc admin bấm);
    - lúc server áp việc đặt lại `cycle_anchor` khi xử lý đơn (không theo giá trị `cycle_anchor`, vốn là `transactionDateTime`).
  - Bảng `activations` thêm cột `quota_epoch`, cờ "đã cấp token đầu tiên sau lần tăng epoch" cùng thời điểm cấp token đó; license (hoặc activation) lưu thời điểm áp việc đặt lại `cycle_anchor`.
  - Gỡ máy, kể cả admin gỡ, không xóa dòng activation; kích hoạt lại cùng `device_id_hash`, kể cả sau khi gỡ, dùng lại đúng activation đó và không mở cửa sổ `fresh` mới.
  - `transactionDateTime` không có múi giờ thì parse theo GMT+7; cấp tay dùng giờ thao tác, kể cả đơn `underpaid` đã chuyển bù.
  - Thao tác admin "reset hạn mức của máy": tăng `quota_epoch` của một activation, ghi nhật ký.
  - "Hiện tại" của gia hạn và đổi gói là `transactionDateTime` của PayOS, kẹp trong thời hạn của link; admin cấp tay không qua đơn dùng lúc thao tác.
  - Mô tả đơn đổi tiền tố từ `MT` sang `AT` (`AT<order_code>`, vẫn tối đa 9 ký tự).
  - Các điểm lệch nhỏ của 05 (`snake_case`, `consent`, `order_token` trong header, lịch đối soát, khóa tạm, chặn IP và CGNAT, cảnh báo, `kid` có số thứ tự, dải số đơn, phân loại lỗi email, Worker admin riêng, webhook `/v1/webhooks/{provider}`) đã vào spec ngày 2026-10-01.
  - **Đã làm** (SHA ở bảng đối chiếu, mục 4): Task 1–18 (`35d758d`, `5b61614`, `b5c7607`, `79e0f81`, `5c33455`, `68ca378`, `6940335`, `5d628e2`, `d68d531`, `ffd9c8d`, `29237cb`, `9f84646`, `b6cb210`, `bb1691c`, `e6b3230`, `45b5305`, `6c94641`, `5664b1b`). Sửa sau review đợt A, A2, B, C, D (Phụ lục C của 05); nâng thư viện của `server/` ở `940c169`; review cuối Approved, tài liệu khớp code ở `4dbd229`. Sau đợt D: `pnpm -C server check` có 360 test Vitest và 6 test `node --test` qua.
  - Spec theo 05 ở `7a7aa2c`, `a641195`; các sửa sau review vào spec ở `97b3be3`, `f321c25`, `42c9782`, `29b2602`.
  - **Còn lại (người):** Task 19 (triển khai staging), Task 20 (giao dịch thử trên staging), Task 21 (lên production). Cần trước: tài khoản Resend (T6), kênh PayOS riêng cho staging (P05-1, T5), hộp thư nhận cảnh báo vận hành (P05-5); production cần thêm tên miền (Q1, T7).

### 2.6 Kế hoạch 06: Bản quyền trong app

- **Mục tiêu:** F8 phía app. Gồm:
  - `LicenseProvider`; token dùng được khi offline; `device_id_hash`; lịch `validate`;
  - hạn mức cho mọi gói (spec §6.8, "Hạn mức"): đếm riêng trên từng máy; Free 10 phút mỗi ngày; chu kỳ 30 ngày tính từ `cycle_anchor` cho gói trả phí; bộ đếm trong kho khóa; dừng phiên với `quota_exhausted`;
  - luật hạn mức sau review spec (spec §6.8, "Hạn mức"; dòng 331–333, 343–348): `n` tính theo `issued_at` của token mới nhất; khóa bộ đếm (`license_id`, mốc đầu chu kỳ, `quota_epoch`); bản ghi đánh dấu và `activation_created_at` để phát hiện mất bản ghi; "đồng hồ thật" của Free; Free cộng cả phút dịch lúc ở gói trả phí; chu kỳ cuối ngắn; không bắt đầu phiên khi hạn mức còn 0;
  - màn hình Nâng cấp hiện 4 gói, mua bằng VietQR ngay trong app, gia hạn và đổi gói;
  - khóa tính năng Pro (mọi gói trả phí);
  - chống chỉnh lùi đồng hồ, và tự kiểm chữ ký của app (§10.2).
- **Bàn giao, chạy và test được:**
  - Trên staging, mua gói bằng VietQR ngay trong app thì app tự kích hoạt.
  - Tắt mạng vẫn giữ gói trả phí tới `refresh_before`.
  - Hạn mức đếm theo tiếng nói được dịch: Free 10 phút mỗi ngày; Professional 30 giờ và X2 100 giờ mỗi chu kỳ; X5 không giới hạn. Nhắc khi còn 5 phút; hết thì dừng phiên (`quota_exhausted`), báo thời điểm reset, có nút nâng gói.
  - Đổi gói trên staging: token mới có `plan`, `cycle_anchor` mới, hạn mức chu kỳ mới đầy đủ.
  - Key đã đủ 2 máy thì gỡ từ xa được một máy.
  - Khi ở Free, tính năng Pro (lịch sử, xuất file, từ điển) bị khóa.
  - Test token dùng vector của 05.
- **Spec phụ trách:** F8, P1, P2; §4.2 bước 2; §4.3 (Bản quyền, Nâng cấp, hạn mức còn lại); §6.8 phía app; §9 (hạn mức, license, mất mạng, 409, `423`, `429`, đơn chậm, offline qua mốc chu kỳ, mất bản ghi bộ đếm); §10.1 (ô đồng ý); §10.2 (crack, ký lại, đồng hồ, kho khóa, hai khóa công khai); §11 (quota, bản quyền, bảo mật).
- **Phụ thuộc:** 01 (kho khóa, màn hình), 02 (thời lượng tiếng nói), 03 (điểm kiểm tra Pro, Đ6), 05 (staging chạy được, vector token).
- **Làm trên Mac:** phần lớn.
- **Cần Windows:** MachineGuid, Credential Manager, `WinVerifyTrust`.
- **Cần người thao tác:** giao dịch thật; hộp thoại của Keychain; thử đổi giờ máy thật.
- **Chờ tài khoản:** kiểm Team ID và tên chủ chứng thư thật (T1, T2). Phần này làm ở 07 (Đ14).
- **Nhận từ 01:** không gửi bí mật qua sự kiện (01 QĐ6); dùng `security::keystore::Keystore`; thêm tên miền trang thanh toán vào `navigation::EXTERNAL_HOSTS` kèm test; mở trang thanh toán qua `SystemOpener` (01 QĐ28); lệnh bản quyền mới không cấp cho overlay (dòng 312).
- **Nhận từ 05:** hợp đồng API ở mục "Hợp đồng API cho kế hoạch 06" của 05; bộ vector token và key mẫu trong `server/` (Đ9).
- **Nhận từ 03:**
  - Điểm kiểm tra Pro là `src-tauri/src/pro.rs` (`ProGate`, `install_gate`, `refresh`, `require`, `is_pro`). 06 thay `DevGate` bằng trạng thái bản quyền thật và gọi `refresh` khi bản quyền đổi; `AppStatus.pro` là trạng thái giao diện dùng.
  - `DevGate` chỉ có trong bản debug (`cfg(debug_assertions)`). 06 cài gate thật đúng một lần, ở chỗ của `pro::install_default_gate` (không gọi `install_gate` lần hai). `refresh` về Free thì luồng dịch thôi dùng thuật ngữ.
  - Danh sách tính năng Pro ở QĐ8 của 03a: xem và xóa lịch sử, lưu lịch sử, xuất file, từ điển. Không phải Pro: bản chép lời của phiên hiện tại, tìm, sao chép, xóa toàn bộ dữ liệu, bảng debug.
  - Hai nút xóa dữ liệu chỉ xóa `data.db` và mục `db-key`, không đụng bản quyền và bộ đếm hạn mức (Q14): 06 kiểm.
  - Phiên "Nghe thử" là phiên thật (`StartOptions::LISTEN_TEST`): 06 quyết có trừ hạn mức không (N13 của review 03).
- **Nhận từ 04:** `modelTier` là mã gói của manifest; `ModelService::resolve` và các lệnh tải, xóa model không đụng kho khóa; "Xóa model và dữ liệu" cũng không (Q14): 06 kiểm hai nút cùng giữ bản quyền và bộ đếm hạn mức.
- **Trạng thái:** đã viết thành hai file 06a (Task 1–11), 06b (Task 1–8), base `5f48558` (cây cuối của 04 cộng các sửa sau review cuối thực thi 04; cây code của `main` `d28fe3b` trùng base; 04 thực thi trước 06, controller quyết ngày 2026-10-03). Đã sửa theo review lần 1 (Q1, Q2, N1–N6) lần 2 (QA, QB, QC, N1–N3; có bảng mô hình đe dọa của luật đồng hồ) và lần 3 (Đạt; N1–N3). Mọi task có code đã chạy lại từ file; mutation 82/82 bị giết. 06 đã thực thi trên Mac: 06a Task 1–10 (`3f570c9`, `06c9dd7`, `48ddb20`, `37e7536`, `6864e50`, `cfa28fe`, `14e4750`, `f73386c`, `61f5ec3`, `3d326e8`); 06b Task 1–4 (`b7b3e86`, `693d422`, `15d8252`, `d266be5`); 06a Task 11 và 06b Task 5 là kiểm tra chuẩn, không có commit.
  - Kiểm tra chuẩn trên cây cuối: `cargo test --workspace` 753 qua, 13 bỏ qua; `pnpm test` 125 test; `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1` 87 test; `cargo deny`, `cargo audit`, `pnpm audit`, `check-windows.sh` sạch; dò bí mật 0.
  - **Còn:** 06b Task 6 (thử tay trên Mac với staging: mua bằng VietQR thật, gia hạn, đổi gói, máy thứ hai, mất mạng, đổi giờ máy, Keychain; cần 05 Task 19 và người), Task 7 (đợt Windows: MachineGuid, Credential Manager, `WinVerifyTrust`). Team ID và tên chủ chứng thư thật chờ 07 (Đ14, T1, T2). Các dòng bảng đối chiếu phụ thuộc những việc này để `chờ`.
  - **Nhận từ 03 đã làm:** gate thật cài đúng một lần ở chỗ `pro::install_default_gate` (`LicenseGate`, `f73386c`); phiên "Nghe thử" trừ hạn mức (QĐ19); hai nút xóa dữ liệu giữ bản quyền và bộ đếm, có test `wiping_user_data_keeps_the_license_and_the_quota_counters` (`6864e50`).
  - **Spec §6.8:** thêm luật "dùng bộ đếm đã có" trước mọi luật bắt đầu từ 0 (điểm cần quyết 1 của 06a; controller đồng ý), commit riêng.

### 2.7 Kế hoạch 07: Đóng gói, ký số, cập nhật, CI

- **Mục tiêu:**
  - F9 và §6.11;
  - CI; build llama.cpp và whisper.cpp trong CI từ tag đã khóa (§10.2);
  - các phương án MVP ở §6.12;
  - gỡ cài đặt (A6); danh sách giấy phép (§10.1).
- **Bàn giao, chạy và test được:**
  - CI build, chạy test, `cargo deny`, `cargo audit`, `pnpm audit` trên macOS và Windows.
  - `.dmg` cho arm64 và `.exe` NSIS cài được và chạy được.
  - Cập nhật được từ bản trước qua `tauri-plugin-updater`, cả kênh stable lẫn beta.
  - `THIRD_PARTY_NOTICES` sinh tự động và hiện ở màn hình Giới thiệu.
  - Bộ gỡ Windows có ô "xóa dữ liệu app".
  - Dung lượng bộ cài ≤ 60 MB.
  - Ký và notarize thật khi có tài khoản. Trước đó, mọi bước đã viết sẵn và chỉ chạy khi CI có secret.
- **Spec phụ trách:** F9, D3, D10; §4.3 (Giới thiệu; không chặn thoát khi app tự khởi động lại để cập nhật); §6.5 (đo lại thời gian chờ lần đầu với bản đã ký); §6.11; §6.12 (phương án MVP, yêu cầu build); §10.1 (giấy phép); §10.2 (chuỗi cung ứng, ký, hardened runtime, JS rút gọn, xoay khóa); §11 (cài đặt và cập nhật, CI); A6.
- **Phụ thuộc:**
  - Phần CI cần 01. Bộ cài đủ tính năng cần 01–06.
  - Chờ tài khoản và quyết định: T1, T2, T3, tên miền (T7), Q17.
  - Chờ kết quả Giai đoạn 0: C9, C10.
- **Làm trên Mac:** bộ cài macOS, cập nhật, giấy phép, CI cho macOS.
- **Cần Windows:** NSIS, bộ gỡ, `dumpbin`, SmartScreen. Runner Windows của CI thay được một phần (Q3).
- **Cần người thao tác:** mua chứng thư, tạo tài khoản, nhập secret của CI; thử Gatekeeper và SmartScreen.
- **Nhận từ 01:** bản đóng gói tên `AI Translator.app`; giá trị trong `Run` không có dấu nháy, nên đường dẫn cài đặt có dấu cách phải xử lý; bộ cài dọn mục khởi động ở `HKLM` khi gỡ (01 QĐ16, QĐ29); thêm tên miền website vào `navigation::EXTERNAL_HOSTS`; `AppHandle::restart` không qua chặn thoát (01 QĐ7).
- **Nhận từ 02** (điểm cần quyết 9 của 02a, QĐ17, QĐ32):
  - `.cargo/config.toml` thêm cờ linker `/DEPENDENTLOADFLAG:0x800` cho mọi binary của workspace trên `x86_64-pc-windows-msvc`: DLL import thẳng, kể cả `VCRUNTIME140.dll`, chỉ được tìm trong System32. Bộ cài Windows phải có VC++ Redistributable, hoặc build với `+crt-static` (dòng 214, C9).
  - Thư mục cài đặt Windows và `Contents/MacOS` không được có thư viện nào ngoài bảng SHA-256 của tiến trình phụ: 07 đưa mọi DLL, dylib đi kèm vào bảng, và CI sinh bảng từ đúng binary phát hành (Đ15). macOS bản phát hành bật hardened runtime và library validation.
  - Bản phát hành bật `shared-encode` cho `asr-worker` (dòng 119); câu xin quyền ghi âm thanh hệ thống có `InfoPlist.strings` en, vi (dòng 92).
- **Nhận từ 03:**
  - `THIRD_PARTY_NOTICES` ghi công SQLCipher (BSD), OpenSSL 3.6.3 (Apache-2.0, chỉ Windows) và câu mẫu FLEURS (CC BY 4.0; `public/listen-test-en.LICENSE.txt`).
  - CI Windows cần Perl để build `openssl-src` (có `nasm` thì bật mã assembly, không thì `no-asm`).
  - `public/listen-test-en.wav` nằm trong `dist/` nên có trong bộ cài.
  - CI phát hành chạy `cargo test --release -p meeting-translator --lib pro::`: bản release không có `DevGate` (Q1 của review 03).
  - Cập nhật app dùng `AppHandle::request_restart` (đi qua `RunEvent::Exit`, nên `session::save_on_exit` lưu lịch sử); nếu gọi `restart` trên luồng chính thì gọi `save_on_exit` trước (Q3 của review 03).
- **Nhận từ 06:**
  - Đặt `AI_TRANSLATOR_TEAM_ID` (macOS) và `AI_TRANSLATOR_SIGNER` (Windows, đúng tên chủ chứng thư OV) lúc build bản phát hành trong CI; thiếu thì bản phát hành không chính hãng và chỉ chạy Free (QĐ26). Thêm một test chạy bản phát hành đã ký (06b Task 6 Step 7, Task 7 Step 4).
  - CI chạy `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1`.
  - `PRODUCTION_URL` trong `src-tauri/src/license/client.rs` và khối `production` của `src-tauri/keys/license-public-keys.json` điền khi 05 Task 21 xong (chép nguyên `server/keys/public-keys.json`; test `the_app_copy_matches_the_server_file_when_it_exists` đỏ nếu quên). Đổi khóa thì ra bản app mới tin cả hai `kid` trước khi server đổi ô ký (§10.2).
  - Ghi công `qrcode`, `ed25519-dalek`, `chrono` vào `THIRD_PARTY_NOTICES` (MIT, Apache-2.0, BSD-3-Clause).
- **Nhận từ 04** (04a QĐ5, QĐ10; Q17):
  - Tạo **một** khóa production ký manifest model và **một** khóa production ký bản cập nhật Tauri, trong CI (hay trên máy không nối mạng rồi nhập thẳng vào secret của CI), kèm một bản sao offline mã hóa bằng passphrase trên USB, passphrase in ra giấy cất riêng (spec §10.2).
  - Ghi khóa công khai production của manifest vào khối `production` của `src-tauri/keys/manifest-public-keys.json`; đặt `PRODUCTION_URL` trong `src-tauri/src/models/source.rs`; ký manifest production trong CI bằng `scripts/models/sign-manifest.mjs --env production` (đổi script để đọc khóa từ secret). Đổi khóa manifest có kế hoạch thì một bản phát hành tin cả `kid` cũ lẫn mới, bản sau bỏ `kid` cũ; lộ khóa thì bản app mới chỉ tin `kid` mới ngay (Q17; 04a QĐ10, N-7 của review 04 lần 2).
  - `tauri-plugin-updater` dùng TLS của hệ điều hành (`native-tls`) như 04, để không kéo thêm `rustls` với `aws-lc`.
  - Bộ gỡ Windows xóa `%LOCALAPPDATA%\com.aitranslator.desktop` (gồm `models`) khi tick "xóa dữ liệu app".
- **Trạng thái:** viết sau khi 01, 02 và 05 xong. Làm xong sau 06.

### 2.8 Kế hoạch 08: Nghiệm thu

- **Mục tiêu:**
  - nghiệm thu A1–A7 và ma trận thủ công ở §11;
  - phiên dịch 2 giờ; kiểm mạng qua proxy;
  - chống thụt lùi A3/A4 lần cuối; hoàn tất hai điều kiện A4 còn thiếu;
  - kiểm bảng đối chiếu đủ 100% (Task 5).
- **Bàn giao:**
  - Báo cáo nghiệm thu, số liệu gốc commit trong `bench/`.
  - Mọi dòng của bảng đối chiếu ở trạng thái `xong`, hoặc `hoãn` có chủ dự án duyệt.
- **Spec phụ trách:** A1–A7; §3.3 (điều kiện A4); §8 (ngân sách độ trễ, CPU ≤ 30%, RAM); §11 (ma trận thủ công, soak test, cài đặt, bảo mật).
- **Phụ thuộc:** 07 có bộ cài chạy được. Phần lớn chưa cần ký thật; riêng A6 cần ký thật (T1, T2).
- **Phần việc:**
  - Chủ yếu do người thao tác: app họp, tai nghe, máy tham chiếu, proxy. Agent chạy script đo và tổng hợp.
  - Hai điều kiện A4 (C13) làm được ngay (Đ11).
- **Nhận từ 06:** nghiệm thu dòng 308–310 với bản phát hành đã ký; mua thật một đơn trên production (P1).
- **Trạng thái:** viết sau khi 07 có bộ cài chạy được.

## 3. Thứ tự thực thi và phụ thuộc

```
01 Nền app ─► 02 Pipeline ─┬─► 03 Phụ đề, bản chép lời ─┐
                           │                            ├─► 06 Bản quyền trong app ─┐
05 License server ─────────┼────────────────────────────┘                           ├─► 07 Đóng gói ─► 08 Nghiệm thu
                           └─► 04 Quản lý model ────────────────────────────────────┘
```

Chạy song song được:
- 05 chạy song song với 01–04, vì chỉ đụng `server/` và `.gitignore`.
- Phần crate của 02 chạy song song với 01.
- 03 và 04 chạy song song với nhau.
- Phần CI của 07 bắt đầu được ngay sau 01, nếu đã có repo từ xa (Q3).

Mọi kế hoạch vẫn làm trên `main`. Chỉ chạy song song hai kế hoạch khi tập file của chúng không giao nhau (Đ18).

Thứ tự đề xuất:
1. 01, cùng lúc với phần crate của 02 và với 05.
2. Phần nối vào app của 02.
3. Viết và làm 03, 04 (song song). Viết phần CI của 07, và làm luôn nếu đã có repo từ xa.
4. Viết và làm 06.
5. Làm nốt 07: bộ cài đủ tính năng, cập nhật, ký thật khi có tài khoản.
6. Viết và làm 08.
7. Task 5 của file này.

**Đợt Windows.** Gom các việc cần Windows vào một đợt khi có máy, theo thứ tự:
1. Kế hoạch 0-01, Task 2: cài công cụ (C14).
2. Kế hoạch 0-03, Task 14–16: hai bản `asr-worker`, `--probe`, máy không có Vulkan (C3, C11; cả C9, C10 nếu CI chưa làm).
3. Kế hoạch 0-04, Task 7–8: WASAPI loopback, ma trận S2 (C2).
4. Kế hoạch 0-05, Task 4: ma trận S5 trên Windows (C5).
5. S4 trên Windows (C4).
6. Phần Windows của các kế hoạch con đã xong trên Mac: 01, 02, rồi 03, 04, 06, 07.

S6 trên các máy tham chiếu (C6, kế hoạch 0-06 Task 8) nên chạy càng sớm càng tốt, với bản build hiện tại. Kết quả quyết định hạng máy và ngưỡng đề xuất gói; 08 đo lại A2 bằng app thật.

**Việc người làm được ngay**, không cần chờ kế hoạch nào:
- Chạy ma trận S1 (kế hoạch 0-04, Task 6) và S5 trên Mac (kế hoạch 0-05, Task 3, kể cả dòng 13 về phím tắt trùng).
- Thu clip thật qua tai nghe Bluetooth và nghe lại 24 clip (C13).
- Chuẩn bị dữ liệu hội thoại zh/ja có quyền dùng (Q6).
- Đăng ký Apple Developer (T1) và mua chứng thư OV ký trên cloud (T2); cả hai mất thời gian xét duyệt.
- Tạo repo từ xa (Q3) và tài khoản Resend (T6).
- Lấy khóa API của PayOS cho staging và production (T5).
- Mượn máy tham chiếu cho S6 và máy Windows (C6, C14).
- Mua tên miền và làm logo (Q1, phần còn mở); chọn kênh PayOS cho staging (P05-1) và hộp thư nhận cảnh báo (P05-5).

## 4. Bảng đối chiếu spec → kế hoạch con

Cách đọc:
- Cột "Kế hoạch":
  - `01`…`08` là kế hoạch con;
  - `(Win)` là phần cần máy Windows;
  - `(người)` là phần cần người thao tác;
  - `QƯ` là quy ước chung ở mục 6, áp cho mọi kế hoạch;
  - `CDA` là việc của chủ dự án, không phải code;
  - `00` là file này.
- "Có từ GĐ0" trong cột Ghi chú: code hoặc số đo đã có từ Giai đoạn 0. Kế hoạch con nối vào app, sửa theo spec, hoặc kiểm lại.
- Cột "Trạng thái" nhận một trong năm giá trị:
  - `chưa làm`;
  - `đang làm`;
  - `chờ`: phần còn lại bị chặn bởi mã ghi trong cột Ghi chú;
  - `xong`: có test hoặc kết quả chứng minh. Khi cập nhật, ghi SHA commit vào Ghi chú;
  - `hoãn`: chủ dự án đã duyệt để sau MVP. Ghi ngày duyệt vào Ghi chú.
- Không đánh số lại. Dòng thêm sau lấy số lớn nhất hiện có cộng 1, đặt ở cuối nhóm tương ứng (Task 2).
- Trong ô không dùng ký tự gạch đứng, để lệnh `awk` ở Task 2–5 tách cột đúng.

### 4.1 Quyết định đã chốt (§2)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 1 | D1: phụ đề dịch cho mọi âm thanh máy đang phát; không cần bot, plugin hay tài khoản trên nền tảng họp | 02, 08 | Thu âm toàn hệ thống (§6.1); A1 ở 08; 02: b5 `c6ee52b`, c2 `1064c5a`, c3 `45ccd02`; chờ C1 (02c Task 8, người), C2 (02c Task 9, Win) | chờ |
| 2 | D2: sản phẩm tách hẳn khỏi AI Live Translator; không dùng chung code hay hạ tầng | QƯ, 01, 05 | 05 dùng tài khoản Cloudflare và merchant PayOS riêng; 01 dùng nhận diện thương hiệu mới (§6.10); 01: Task 17 `b89f22e`, Task 21 `360b067` (token màu và icon tạm); 05: `server/` riêng, Task 2 `5b61614`; triển khai trên tài khoản riêng chờ 05 Task 19, 21 (người; T4, T5) | chờ |
| 3 | D3: macOS 14.2+ trên Apple Silicon; Windows 10/11 64-bit (x64) | 07, 08 | 07 đặt phiên bản macOS tối thiểu 14.2, chỉ build arm64 và x64; 08 thử các bản hệ điều hành ở §11 | chưa làm |
| 4 | D4: Tauri 2, React 19, TypeScript, Vite, Zustand; mỗi engine chạy trong một tiến trình phụ riêng | 01, 02 | Có từ GĐ0, trừ Zustand; 02: d1 `8159852`, d3 `4268836`; 01: Task 1 `69f30ba`, Task 18 `3a275a2` (Zustand) | xong |
| 5 | D5: model dịch Hy-MT2-1.8B, định dạng GGUF | 04 | Phân phối qua manifest; 04: T1 `855237e`, T2 `1be9efa` (cấu hình staging); chờ 04b Task 13 (R2, khóa và manifest staging; cần người) | chờ |
| 6 | D6: Whisper chạy qua whisper.cpp | 02, 04 | Có từ GĐ0 (`asr-worker`); 02: a1 `e963cdb`; 04: T1 `855237e`, T2 `1be9efa` | xong |
| 7 | D7: xử lý 100% trên máy, âm thanh không rời máy | 02, 08 | Kiểm ở A7; 02: d1 `8159852`, c2 `1064c5a`; còn A7 ở 08 | đang làm |
| 8 | D8: giao diện tiếng Việt và English, đổi được trong Cài đặt | 01 | 01: Task 14 `15d753d`, Task 21 `360b067` | xong |
| 9 | D9: MVP chỉ dịch một chiều, âm thanh máy đang phát sang phụ đề ngôn ngữ của người dùng | 02 | Không có đường phát tiếng vào cuộc họp; b2 `aaeca34` | xong |
| 10 | D10: tải từ website; Windows dùng bộ cài NSIS `.exe` đã ký, macOS dùng `.dmg` đã ký và notarize; chưa lên kho ứng dụng | 07 | Chờ T1, T2 | chưa làm |
| 11 | D11: MVP thanh toán bằng PayOS, chuyển khoản VietQR, VND | 05, 06 | 05: Task 8 `5d628e2`, Task 12 `9f84646`; 06: a9 `61f5ec3`, b3 `15d8252`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 12 | D12: độ trễ p50 ≤ 2,0 giây trên máy khuyến nghị | 02, 08 | Xem dòng A2; chạy lại S6 chờ 02b Task 9 (cần máy rảnh); 08 đo trên máy tham chiếu | chờ |
| 13 | P1 (chốt 2026-10-01): không quảng cáo; 4 gói `free` (10 phút mỗi ngày), `pro` Professional (30 giờ mỗi chu kỳ 30 ngày, 50.000 đ), `pro_x2` (100 giờ, 150.000 đ), `pro_x5` (không giới hạn, 500.000 đ); hạn mức tính riêng từng máy; gói trả phí chung tính năng Pro, chỉ khác hạn mức; đơn 30 ngày trả trước bằng VND, không tự gia hạn; không có gói 12 tháng hay trọn đời | 05, 06 | 05 đọc bảng gói và giá từ cấu hình; 06 hạn mức và màn hình 4 gói; chi tiết ở dòng 326–335; 05: Task 12 `9f84646`, Task 18 `5664b1b`; bảng gói production chờ 05 Task 21 (người); 06: a1 `3f570c9`, a4 `37e7536`, a7 `14e4750`, a8 `f73386c`, b3 `15d8252` | chờ |
| 14 | P2: key do license server cấp sau khi PayOS xác nhận đã nhận tiền; tối đa 2 máy mỗi key, mỗi máy đủ hạn mức của gói; dùng offline nhờ token ký số, ân hạn 14 ngày; không có tài khoản đăng nhập | 05, 06 | 05: Task 6 `68ca378`, Task 13 `b6cb210`, Task 14 `bb1691c`; 06: a1 `3f570c9`, a7 `14e4750`, a9 `61f5ec3`, b2 `693d422`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 325 | D13: tên sản phẩm AI Translator, bundle identifier `com.aitranslator.desktop`; repo `meeting-translator/`, tên crate, binary và tên Worker giữ nguyên; chỉ `productName` và identifier đổi | 01, 07 | Q1 chốt 2026-10-01; tên miền và logo còn mở; 01: Task 17 `b89f22e` (identifier, `productName`); còn 07 (tên bộ cài) | đang làm |

### 4.2 Tính năng MVP (§3.1)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 15 | F1: phụ đề dịch trực tiếp từ âm thanh hệ thống | 02, 03 | 02 luồng xử lý; 03 hiển thị; 02: b2 `aaeca34`, c3 `45ccd02`; 03: a10 `ef7ef3a`, b2 `39ff6f9`, b4 `1814de9` | xong |
| 16 | F2: chọn ngôn ngữ đích trong năm ngôn ngữ; ngôn ngữ nguồn tự nhận diện trong tập người dùng chọn (mặc định cả năm) hoặc khóa một ngôn ngữ; câu đã là ngôn ngữ đích thì hiện câu gốc | 01, 02 | 01 cài đặt và màn hình chính; 02 chọn ngôn ngữ, `same_lang`; 01: Task 4 `7d828f0`, Task 21 `360b067`; 02: b2 `aaeca34`, c3 `45ccd02` | xong |
| 17 | F3: thanh phụ đề nổi theo §4.4 | 01, 03 | 01 cửa sổ, khóa, ẩn/hiện; 03 nội dung và kiểu hiển thị; 01: Task 17 `b89f22e`; thử tay chờ 01 Task 24 dòng 3–7 (người), 01 Task 25 dòng 4–7 (Win); 03: a10 `ef7ef3a`, a11 `7a000ca`, b2 `39ff6f9`, b3 `2e8f3ab`; thử tay chờ 03b Task 8 (Mac, người), Task 9 (Windows) | chờ |
| 18 | F4: bản chép lời của phiên: xem, tìm, sao chép; xuất TXT, SRT, Markdown và lưu lịch sử là tính năng Pro (chỉ gói trả phí); lưu lịch sử mặc định tắt | 03, 06 | 06 khóa phần Pro; 03: a1 `3a3d58a`, a6 `7ed54a3`, a7 `a067dce`, a8 `91c5edf`, b4 `1814de9`; 06: a8 `f73386c` (`LicenseGate` thay `DevGate`); thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 19 | F5: từ điển thuật ngữ (Pro, chỉ gói trả phí), tối đa 500 cặp; chỉ thuật ngữ có trong câu mới vào prompt | 03, 06 | 03: a4 `4d2980a`, a5 `7c3e57e`, a9 `1b4fb11`, b5 `f43e2a5`; 06: a8 `f73386c` (`LicenseGate` thay `DevGate`); thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 20 | F6: quản lý model: gói Chuẩn và gói Nhẹ, tự đề xuất gói, tải tiếp khi rớt mạng, kiểm SHA-256 | 04 | 04: T3 `713c3be`, T4 `d3ebbc5`, T5 `8a439d3`, T8 `adb1e7b`, T11 `1797cd1` | xong |
| 21 | F7: giao diện tiếng Việt và English | 01 | 01: Task 14 `15d753d`, Task 21 `360b067` | xong |
| 22 | F8: phân quyền theo gói (Free và ba gói trả phí) bằng license key, dùng được khi offline; hạn mức theo gói, đếm riêng từng máy | 05, 06 | 05: Task 6 `68ca378`, Task 14 `bb1691c`; 06: a1–a10 (`3f570c9` … `3d326e8`) | xong |
| 23 | F9: tự cập nhật app | 07 | | chưa làm |
| 24 | F10: phím tắt toàn cục mặc định `Ctrl+Alt+T` / `⌃⌥T` (bắt đầu/dừng), `Ctrl+Alt+H` / `⌃⌥H` (ẩn/hiện), `Ctrl+Alt+L` / `⌃⌥L` (khóa/mở khóa), đổi được trong Cài đặt; biểu tượng ở khay hệ thống (menu bar trên Mac); kiểm trùng với Teams, Zoom, Meet | 01, 01 (người) | Có từ GĐ0 (ba phím cố định); 01: Task 2 `4e0dfe9`, Task 3 `bdfa1b8`, Task 17 `b89f22e`, Task 19 `59ce681`, sửa `e20f3ce`, `629847b`; chờ 01 Task 24 dòng 4, 11, 12, 31 (người), kiểm trùng với app họp ở C5 (01 Task 24 dòng 27), 01 Task 25 dòng 8–9 (Win) | chờ |

### 4.3 Tiêu chí nghiệm thu (§3.3)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 25 | A1: chạy với Teams, Zoom, Google Meet (Chrome, Edge; thêm Safari trên Mac), Zalo PC trên cả hai hệ điều hành; nghe qua loa, tai nghe có dây, tai nghe Bluetooth | 08 (người), 02, 03 | chờ C1 (02c Task 8, người), C2 (02c Task 9, Win), C5; 03: thanh phụ đề xong code (b2); thử tay chờ 03b Task 8 (Mac, người), Task 9 (Windows) | chờ |
| 26 | A2: máy khuyến nghị p50 ≤ 2,0 giây, p90 ≤ 3,0 giây, chữ dịch đầu tiên ≤ 1,0 giây (p50); máy tối thiểu p50 ≤ 3,5 giây; không tính lần nạp model | 08 (người), 02 | M4 Pro đạt ở GĐ0; máy quyết định chờ C6; 02 chạy lại S6 chờ 02b Task 9 (cần máy rảnh) | chờ |
| 27 | A3, mốc và mức sàn: COMET chấm trên văn bản qua đúng `llama-server` và prompt của app; sàn Anh→Việt 0,83 (Chuẩn) và 0,80 (Nhẹ); Trung/Nhật/Hàn→Việt không thấp hơn Anh→Việt quá 0,05 | 08, 02 | Có từ GĐ0 (`s7_mt_decisions.md`); 02 thêm `mt-eval` (Đ4); 02: b4 `1546741`, lý do câu lỗi `7279c07`; chạy lại A3 chờ 02b Task 7 (cần máy rảnh) | chờ |
| 28 | A3, chống thụt lùi: sau mỗi lần đổi model, engine hay prompt, COMET từng chiều không thấp hơn mốc quá 0,01 | QƯ, 08 | Mục 6.7 | chưa làm |
| 29 | A4, chống thụt lùi: sau mỗi lần đổi model hay engine, WER/CER không xấu hơn mốc quá 10% (tương đối) | QƯ, 08 | Mốc hiện hành `a4_m4pro-{turbo,small}-final.json`; mục 6.7 | chưa làm |
| 30 | A4, điều kiện còn thiếu: thu clip thật qua tai nghe Bluetooth | 08 (người) | C13; làm được ngay (Đ11) | chưa làm |
| 31 | A4, điều kiện còn thiếu: người nghe lại 24 clip có chú thích Latin trong bản chép chuẩn (zh 16, ja 3, ko 5) | 08 (người) | C13; sau đó sửa `SPOKEN_GLOSS` của `score_asr.py`, chấm lại, chủ dự án duyệt mốc mới | chưa làm |
| 32 | A5: một phiên dịch liên tục 2 giờ không crash; RAM sau giờ đầu không tăng quá 10% | 08 (người), 02 | phiên dài thử tay chờ 02c Task 8 Step 11 (người, tùy chọn); 08 đo chính thức | chờ |
| 33 | A6: bộ cài ký số hợp lệ; bản macOS đã notarize; gỡ app sạch, người dùng chọn giữ hay xóa model (Windows có ô "xóa dữ liệu app"; macOS có nút "Xóa model và dữ liệu", trang hỗ trợ hướng dẫn bấm trước khi gỡ) | 07, 04, 08 | Chờ T1, T2; trang hỗ trợ thuộc website (Q8); 04: T8 `adb1e7b`, T11 `1797cd1` (nút "Xóa model và dữ liệu"); còn 07 (bộ gỡ Windows) và 08 | chờ |
| 34 | A7: kiểm qua proxy mạng, trong lúc dịch không có request nào trừ việc theo lịch (bản quyền, cập nhật, manifest); không request nào chứa âm thanh hay nội dung chép lời | 08 (người), QƯ | | chưa làm |

### 4.4 Trải nghiệm người dùng (§4)

§4.1, lần đầu mở app:

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 35 | Bước 1: chọn ngôn ngữ giao diện, mặc định theo hệ điều hành (tiếng Việt nếu máy dùng tiếng Việt, còn lại English) | 01 | 01: Task 7 `1bf77f3`, Task 21 `360b067` | xong |
| 36 | Bước 2: kiểm tra cấu hình (RAM, GPU, dung lượng trống), đề xuất gói Chuẩn (khoảng 2,5 GB) hoặc gói Nhẹ (khoảng 1,3 GB), ghi rõ dung lượng sẽ tải | 04 | Khung bước ở 01; ghi chú chất lượng theo §8; 04: T5 `8a439d3`, T8 `adb1e7b`, T11 `1797cd1` | xong |
| 37 | Bước 3: tải model, tạm dừng rồi tải tiếp được; tải xong dùng được ngay | 04 | 04: T3 `713c3be`, T8 `adb1e7b`, T11 `1797cd1` | xong |
| 38 | Bước 4: trên macOS hướng dẫn bật quyền "Ghi âm thanh hệ thống", kèm nút mở System Settings; Windows không có bước này | 02, 01, 02 (người) | 02 lấy trạng thái quyền và phát hiện thiếu quyền; 01 khung bước; 01: Task 21 `360b067`; 02: c4 `11cae74`, c6 `7410e7d`; chờ C1 (02c Task 8, người), kể cả chọn neo trang System Settings (điểm cần quyết 3 của 02a) | chờ |
| 39 | Bước 5: chọn ngôn ngữ đích (mặc định theo ngôn ngữ giao diện) và tập ngôn ngữ nguồn | 01 | 01: Task 21 `360b067` | xong |
| 40 | Bước 6: nghe thử, app phát một câu tiếng Anh mẫu; trên macOS tap tạm thời thu cả âm thanh của app | 03, 02 | Đ16; 02: b5 `c6ee52b`, c3 `45ccd02` (`include_self`); 03: a10 `ef7ef3a`, b6 `7a2e57e`; thử với tiếng thật chờ 03b Task 8 (người; ghi chú N8, mục 2.3) | chờ |
| 41 | Bước 7: thông báo quyền riêng tư (âm thanh không rời máy; người dùng tự thông báo cho người cùng họp nếu cần) | 01 | 01: Task 21 `360b067` | xong |
| 42 | Bước 8: báo app chạy ở khay và bấm X chỉ ẩn cửa sổ; Windows có ảnh hướng dẫn kéo icon ra taskbar và nút mở `ms-settings:taskbar` | 01, 01 (Win) | 01: Task 21 `360b067` (phần macOS xong); ảnh hướng dẫn và nút `ms-settings:taskbar` chờ 01 Task 25 dòng 2 (Win) | chờ |

§4.2, trong cuộc họp:

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 43 | Bắt đầu qua nút, phím tắt hoặc menu khay; thanh phụ đề hiện kèm chỉ báo đang nghe (mức âm lượng) và chỉ báo độ trễ; tiến trình phụ chưa chạy thì hiện "Đang nạp model…" | 01, 02, 03 | 01 điểm bắt đầu; 02 phiên và sự kiện trạng thái; 03 hiển thị; 01: Task 17 `b89f22e`, Task 21 `360b067`; 02: c3 `45ccd02`, c5 `73baf99`; thử tay chờ 02c Task 8 và 01 Task 24 dòng 3–4 (người); 03: a10 `ef7ef3a`, b2 `39ff6f9` | chờ |
| 44 | Gói có hạn mức (Free, Professional, X2): nhắc khi còn 5 phút; hết thì dừng phiên (`quota_exhausted`), thanh phụ đề và cửa sổ chính báo thời điểm reset, có nút nâng gói; không chạy chế độ chỉ chép lời; X5 không giới hạn | 06, 03, 02 | 02 dừng phiên theo lý do; 03 hiển thị; 02: b2 `aaeca34`, c3 `45ccd02`; 03: b2 `39ff6f9`; 06: a7 `14e4750`, a8 `f73386c`, b1 `b7b3e86`, b4 `d266be5`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 45 | Bấm Dừng để kết thúc phiên, sau đó mở được bản chép lời của phiên | 02, 03 | 02: b2 `aaeca34`, c3 `45ccd02`; 03: a6 `7ed54a3`, b4 `1814de9` | xong |

§4.3, các màn hình:

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 46 | Màn hình chính: trạng thái (Sẵn sàng, Đang dịch, Lỗi); nút Bắt đầu/Dừng; ngôn ngữ đích và tập nguồn; nguồn âm thanh (Windows: thiết bị phát; macOS: toàn hệ thống hoặc một app); mức âm lượng vào; hạn mức còn lại (hôm nay với Free, trong chu kỳ với Professional và X2, kèm lúc reset; X5 không giới hạn) | 01, 02, 06 | 01 khung; 02 trạng thái, nguồn âm, mức âm; 06 hạn mức; 01: Task 21 `360b067`; 02: c6 `7410e7d`; 06: a7 `14e4750`, b4 `d266be5`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 47 | Bản chép lời: mỗi câu có giờ, câu gốc, bản dịch; tìm kiếm, sao chép, xuất file (Pro) | 03 | 03: a6 `7ed54a3`, a8 `91c5edf`, b1 `ccb59c2`, b4 `1814de9`; khóa Pro qua `pro.rs`, 06 nối bản quyền thật (dòng 18) | xong |
| 48 | Lịch sử (Pro): danh sách phiên đã lưu, xóa từng phiên hoặc xóa tất cả | 03 | 03: a7 `a067dce`, a8 `91c5edf`, b1 `ccb59c2`, b4 `1814de9`; khóa Pro qua `pro.rs`, 06 nối bản quyền thật (dòng 18) | xong |
| 49 | Từ điển thuật ngữ (Pro): thêm, sửa, xóa; nhập và xuất CSV | 03 | 03: a5 `7c3e57e`, a9 `1b4fb11`, b1 `ccb59c2`, b5 `f43e2a5`; khóa Pro qua `pro.rs`, 06 nối bản quyền thật (dòng 18) | xong |
| 50 | Cài đặt, nhóm Chung: ngôn ngữ giao diện, khởi động cùng hệ thống, giao diện sáng/tối, kênh cập nhật (stable hoặc beta) | 01, 07 | 07 dùng `updateChannel`; 01: Task 4 `7d828f0`, Task 12 `579389b`, Task 17 `b89f22e`, Task 21 `360b067`, autostart 2.7.0 ở `34777f0`; thử tay chờ 01 Task 24 dòng 8–9, 19–21 (người), 01 Task 25 dòng 13, 18 (Win); còn 07 | chờ |
| 51 | Cài đặt, nhóm Phụ đề: cỡ chữ, số dòng, độ mờ nền, có hiện câu gốc hay không | 03 | Khóa cài đặt tạo ở 01; 03: a11 `7a000ca`, b1 `ccb59c2`, b3 `2e8f3ab` | xong |
| 52 | Cài đặt, nhóm Âm thanh: nguồn âm thanh, độ nhạy ngắt câu | 02 | 200–800 ms (§6.3); khóa cài đặt tạo ở 01; c6 `7410e7d` | xong |
| 53 | Cài đặt, nhóm Model: gói đang dùng, dung lượng, tải lại hoặc xóa | 04 | 04: T8 `adb1e7b`, T11 `1797cd1` | xong |
| 54 | Cài đặt, nhóm Phím tắt | 01 | 01: Task 19 `59ce681`, Task 21 `360b067` | xong |
| 55 | Cài đặt, nhóm Bản quyền: nhập key; gói đang dùng, trạng thái và ngày hết hạn; hạn mức còn lại của chu kỳ; gia hạn hoặc đổi gói; gỡ kích hoạt | 06 | 06: a9 `61f5ec3`, b2 `693d422`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 56 | Cài đặt, nhóm Quyền riêng tư: bật/tắt lưu lịch sử; nút xóa toàn bộ dữ liệu (lịch sử và từ điển) | 03 | 03: a9 `1b4fb11`, b3 `2e8f3ab` | xong |
| 57 | Cài đặt, nhóm Quyền riêng tư: nút "Xóa model và dữ liệu" (xóa thêm model, dùng trước khi gỡ app trên macOS); cả hai nút đều giữ trạng thái bản quyền và bộ đếm hạn mức | 04, 03, 06 | 06 kiểm hai nút không đụng kho khóa (Q14); 03: a9 `1b4fb11`, b3 `2e8f3ab` (`data::clear_all_data`, `PrivacySettings.tsx`); 04: T8 `adb1e7b`, T11 `1797cd1` (nút và `ModelService`, không đụng kho khóa); 06: a5 `6864e50` (test `wiping_user_data_keeps_the_license_and_the_quota_counters`) | xong |
| 58 | Màn hình Nâng cấp: hiện 4 gói (tên, hạn mức, giá mỗi 30 ngày từ `GET /v1/plans`), đánh dấu gói đang dùng; nhập email, tick đồng ý; quét VietQR hiện ngay trong app; cùng gói là gia hạn 30 ngày, gói khác là đổi gói kèm số ngày quy đổi và ngày hết hạn mới, ghi không hoàn tiền | 06 | 06: a9 `61f5ec3`, b3 `15d8252`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 59 | Giới thiệu và giấy phép mã nguồn mở | 01, 07 | 01 màn hình, nút mở thư mục log (Đ10), câu miễn trừ nhãn hiệu; 07 danh sách giấy phép; 01: Task 17 `b89f22e`, Task 21 `360b067`; thử tay chờ 01 Task 24 dòng 24 (người); còn 07 | chờ |
| 60 | Đóng cửa sổ chính: X (kể cả `Alt+F4`, `⌘W`) chỉ ẩn xuống khay; app, phím tắt và phiên đang chạy vẫn hoạt động | 01 | 01: Task 17 `b89f22e`; chờ 01 Task 24 dòng 13 (người), 01 Task 25 dòng 3 (Win) | chờ |
| 61 | Thoát ở menu khay: dừng phiên như khi bấm Dừng, tắt hai tiến trình phụ, rồi mới thoát | 01, 02 | 01: Task 17 `b89f22e`; 02: c3 `45ccd02`; thử tay chờ 02c Task 8 Step 9 và 01 Task 24 dòng 16 (người) | chờ |
| 62 | Trên Mac, `⌘Q`, mục Quit trong menu app và mục Quit ở Dock không thoát app: lệnh thoát bị hủy, app hiện cửa sổ chính kèm lời nhắc trong app "chọn Thoát ở biểu tượng trên menu bar"; Force Quit vẫn thoát được | 01, 01 (người) | R9; 01 QĐ7, spec §4.3 sửa ngày 2026-10-01; 01: Task 10 `2c71e0c`, sửa `4560558`, `d4a7796`; chờ 01 Task 24 dòng 14–15 (người) | chờ |
| 63 | Không chặn thoát khi máy tắt, khởi động lại, đăng xuất, và khi app tự khởi động lại để cập nhật | 01, 01 (Win), 01 (người), 07 | R9; 01: Task 10 `2c71e0c`, sửa `4560558`; chờ 01 Task 24 dòng 17 (người), 01 Task 25 dòng 11 (Win); còn 07 (tự khởi động lại để cập nhật) | chờ |

§4.4, thanh phụ đề:

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 64 | Cửa sổ riêng, không viền, nền mờ bán trong suốt, luôn nổi trên cùng; không hiện trên taskbar Windows; không lấy focus của app họp | 01 | Có từ GĐ0 (S5); 01: Task 17 `b89f22e` giữ cách tạo của S5; chờ C5 (01 Task 24 dòng 28, người; 01 Task 25 dòng 4, Win) | chờ |
| 65 | Hiện 1–3 dòng bản dịch gần nhất; tùy chọn hiện câu gốc chữ nhỏ ở phía trên | 03 | 03: b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 66 | Bản dịch hiện dần từng chữ trong lúc model đang dịch | 02, 03 | 02 phát `subtitle://delta`; 02: b2 `aaeca34`, c3 `45ccd02`, c5 `73baf99`; 03: b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 67 | Phụ đề tạm: câu chưa chốt màu nhạt hơn; người nói nói tiếp thì thay bằng bản dịch của cả câu đã ghép | 02, 03 | 02: a2 `b0eb41f`, b2 `aaeca34`, c5 `73baf99`; 03: b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 68 | Kéo để di chuyển, kéo cạnh để đổi kích thước; nhớ vị trí riêng cho từng màn hình | 03, 01 | Kéo có từ GĐ0; lưu ở `overlay.positions` (§6.9); 01: Task 9 `fe3c202`, Task 17 `b89f22e`, sửa `9998752`; thử tay chờ 01 Task 24 dòng 6–7 (người), 01 Task 25 dòng 16 (Win); 03: a10 `ef7ef3a`, b2 `39ff6f9` (kéo cạnh, nút ✕, cỡ tối thiểu); thử tay chờ 03b Task 8 (Mac, người), Task 9 (Windows) | chờ |
| 69 | Chế độ khóa: click xuyên qua thanh phụ đề; mở khóa bằng phím tắt hoặc menu khay | 01 | Có từ GĐ0 qua phím tắt; thêm menu khay; 01: Task 16 `2daa887`, Task 17 `b89f22e`; chờ 01 Task 24 dòng 5 (người), 01 Task 25 dòng 7 (Win) | chờ |
| 70 | macOS: nổi trên app toàn màn hình bằng NSPanel non-activating, window level cao, `canJoinAllSpaces` và `fullScreenAuxiliary` | 01 | Có từ GĐ0; 01: Task 17 `b89f22e`; chờ C5 (01 Task 24 dòng 28, người) | chờ |
| 71 | Windows: cửa sổ ở chế độ topmost | 01 (Win) | Có từ GĐ0; 01: Task 17 `b89f22e`; chờ C5 và 01 Task 25 dòng 4–7, 17 (Win) | chờ |
| 72 | Icon ở Dock: activation policy `accessory` khi chỉ còn icon ở menu bar, `regular` khi mở cửa sổ chính | 01 | Có từ GĐ0 (`set_accessory`); 01: Task 17 `b89f22e` tự đổi theo cửa sổ chính; chờ 01 Task 24 dòng 13 (người) | chờ |
| 73 | Chỉ báo nhỏ: đang nghe, không có âm thanh, đang trễ | 02, 03 | 02 phát tín hiệu; 03 hiển thị; 02: b2 `aaeca34`, c3 `45ccd02`; 03: b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 336 | Thanh phụ đề ẩn lúc mở app, kể cả khi khởi động cùng hệ thống; bắt đầu phiên thì hiện; dừng phiên thì giữ nguyên; ẩn/hiện bằng tay vẫn được; không có nút khóa trên thanh | 01, 02 | 01 QĐ21; spec §4.4 sửa ngày 2026-10-01; 01: Task 17 `b89f22e`; 02: c3 `45ccd02` | xong |

§4.5, ngôn ngữ giao diện:

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 74 | Chuỗi giao diện nằm trong từ điển có kiểu; `en` là nguồn chuẩn của danh sách khóa; kiểu `Record` bắt `vi` có đủ mọi khóa | 01 | 01: Task 14 `15d753d` | xong |
| 75 | Đổi ngôn ngữ ngay, không cần khởi động lại | 01 | 01: Task 14 `15d753d`, Task 16 `2daa887`, Task 21 `360b067` | xong |
| 76 | Chuỗi phía Rust (menu khay, thông báo hệ thống, khoảng 20 chuỗi) nằm trong bảng riêng, đủ vi và en; menu app trên Mac chỉ có chữ English mặc định ở MVP | 01 | Q13; menu app English theo QĐ15 của 01, đã vào spec §4.5; 01: Task 7 `1bf77f3`, Task 16 `2daa887` | xong |

### 4.5 Kiến trúc (§5)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 77 | Tiến trình chính không chứa ggml; mỗi engine chạy trong một tiến trình phụ riêng | QƯ | Có từ GĐ0; `deny.toml` chặn; giữ bằng `cargo deny` ở mọi kế hoạch | xong |
| 78 | Engine hoặc driver GPU crash thì app vẫn chạy và tự khởi động lại engine | 02 | d3 `4268836` | xong |
| 79 | Tiến trình phụ chạy khi người dùng mở cửa sổ chính hoặc bấm Bắt đầu; tắt sau 10 phút không dịch | 02, 01 | Đ19; 01: Task 17 `b89f22e` (`launchedAtLogin`); 02: d3 `4268836`, c3 `45ccd02`; thử tay chờ 02c Task 8 Step 9 và 01 Task 24 dòng 19 (người) | chờ |
| 80 | `asr-worker` chạy trước; `llama-server` chạy sau khi `asr-worker` nạp xong model | 02 | d3 `4268836` | xong |
| 81 | Lần đầu phải chờ nạp model: thanh phụ đề hiện "Đang nạp model…"; thời gian này không tính vào A2 | 02, 03 | 02: d3 `4268836`, c3 `45ccd02`, c5 `73baf99`; 03: b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 82 | Việc cho MVP §5: Job Object (`KILL_ON_JOB_CLOSE`) trên Windows và process group trên macOS, để tiến trình phụ không bị bỏ lại khi app crash (`panic = "abort"`) | 02, 02 (Win) | 02: d1 `8159852`, c3 `45ccd02` (process group, pidfile); Job Object chờ C14 (02c Task 9, Win) | chờ |
| 83 | License server nằm ngoài app; app chỉ gọi khi mua, kích hoạt, kiểm tra bản quyền; âm thanh và nội dung chép lời không bao giờ qua server | 05, 06, 08 | 05: Task 11 `29237cb`, Task 17 `6c94641`; 06: a6 `cfa28fe`; còn 08 (nghiệm thu) | đang làm |

### 4.6 Thu âm thanh (§6.1)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 84 | Interface chung `AudioSource` (`start`, `stop`, `format`) | 02 | Có từ GĐ0; sink là `rtrb::Producer<f32>`; b5 `c6ee52b` | xong |
| 85 | Windows, chế độ tự động: loopback của thiết bị Console và thiết bị Communications (nếu khác), mỗi thiết bị một ring buffer, resample từng luồng về 16 kHz rồi mới trộn, bù lệch đồng hồ bằng bỏ hoặc chèn mẫu | 02 (Win) | Có từ GĐ0: `Mixer2`, `MonoResampler`; `windows.rs` ở kế hoạch 0-04 Task 7; 02: b5 `c6ee52b`, c2 `1064c5a`; chờ C2 (02c Task 9, Win) | chờ |
| 86 | Windows: luồng thu đọc theo timer, tự chèn im lặng theo vị trí QPC khi loopback không trả gói dữ liệu | 02 (Win) | Có từ GĐ0: `GapFiller`; 02: b5 `c6ee52b`, c2 `1064c5a`; chờ C2 (02c Task 9, Win) | chờ |
| 87 | Windows: người dùng chọn thủ công được một thiết bị | 02 (Win), 01 | 01: Task 4 `7d828f0` (khóa `audioSource`); 02: b5 `c6ee52b`, c4 `11cae74`, c6 `7410e7d`; chờ C2 (02c Task 9, Win) | chờ |
| 88 | Đổi thiết bị phát: hỏi định kỳ 500 ms chữ ký thiết bị phát mặc định và mở lại nguồn khi luồng thu chết (`AudioSource::failed`), cả Windows lẫn macOS; không dùng `IMMNotificationClient` hay listener của Core Audio | 02, 02 (Win) | Spec §6.1 sửa ngày 2026-10-01 (02a QĐ16); 02: b5 `c6ee52b`, c2 `1064c5a`; chờ C1 (02c Task 8, người), C2 (02c Task 9, Win) | chờ |
| 89 | Windows: không dùng process loopback trong MVP; hệ quả là app thu mọi âm thanh của máy | 02 | b5 `c6ee52b` | xong |
| 90 | macOS: Core Audio process tap đọc qua aggregate device; mặc định tap toàn hệ thống, trừ chính app | 02 | Có từ GĐ0 (`TapTarget::SystemExceptSelf`); 02: c2 `1064c5a`; chờ C1 (02c Task 8, người) | chờ |
| 91 | macOS, tùy chọn: chỉ tap một app họp, chọn từ danh sách app đang phát âm thanh | 02 | Có từ GĐ0 `TapTarget::Process(pid)`; danh sách app (02a QĐ30): b5 `c6ee52b`, c2 `1064c5a`, c4 `11cae74`, c6 `7410e7d` | xong |
| 92 | macOS: khai báo `NSAudioCaptureUsageDescription` trong Info.plist của app | 02, 07 | 02: c4 `11cae74` (câu tiếng Anh và tiếng Việt, 02a QĐ31; câu tiếng Việt thử ở 02c Task 8); còn bản phát hành ở 07 | đang làm |
| 93 | macOS: gọi API qua `objc2` và `objc2-core-audio`, không dùng `coreaudio-sys` | 02 | Có từ GĐ0; spec §6.1 sửa ngày 2026-10-01; b5 `c6ee52b` | xong |
| 94 | Callback thu âm không cấp phát bộ nhớ, không lock, chỉ ghi vào ring buffer lock-free (`rtrb`) chứa được 30 giây | 02 | Callback có từ GĐ0; 02 đặt dung lượng ring 30 giây trong app; b5 `c6ee52b`, c2 `1064c5a` | xong |

### 4.7 Tiền xử lý (§6.2)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 95 | Gộp về mono, resample bằng `rubato` từ tần số thiết bị xuống 16 kHz, chia khung 512 mẫu (32 ms) cho VAD | 02 | Có từ GĐ0 (`MonoResampler`); b5 `c6ee52b`, b2 `aaeca34` | xong |

### 4.8 VAD và cắt câu (§6.3)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 96 | Silero VAD: ngưỡng 0,5; tiếng nói ngắn nhất 250 ms; im lặng 300 ms thì chốt đoạn, chỉnh được 200–800 ms; đoạn dài tối đa 8 giây, cắt cưỡng bức tại khung năng lượng thấp nhất trong 1,5 giây cuối; đệm 200 ms mỗi phía (làm tròn 7 khung) | 02 | Có từ GĐ0 (`segmenter.rs`); 02 nối với `vadEndSilenceMs`; a2 `b0eb41f`, c3 `45ccd02` | xong |
| 97 | Ghép câu và phụ đề tạm: không có dấu câu kết thúc thì phụ đề là tạm; cửa sổ ghép max(700 ms, `vadEndSilenceMs` + 400 ms); chỉ ghép khi cùng ngôn ngữ; zh, ja nối chữ không dấu cách; `same_lang` cắt chuỗi ghép, đoạn bỏ vì không có tiếng nói thì không; chốt khi có dấu câu hoặc hết cửa sổ; trần 15 giây tiếng nói hoặc 3 đoạn | 02 | Có từ GĐ0 dạng mô phỏng trong `latency-bench`; chuyển sang `pipeline` (Đ3), dịch lại cả câu và thay phụ đề tạm thật; a2 `b0eb41f` | xong |
| 98 | Đầu ra `Segment { id, start_ms, end_ms, samples }`, thời gian tính từ lúc bắt đầu phiên theo đồng hồ thật | 02 | Có từ GĐ0; 02 kiểm với luồng thu thật; b2 `aaeca34`, c2 `1064c5a` | xong |
| 99 | Silero VAD v6.2.3 chạy bằng `candle-onnx` trong tiến trình chính; không dùng `ort`; state LSTM `detach()` sau mỗi khung; VAD chạy trên luồng riêng có stack từ 4 MiB; VAD vẫn chạy khi `asr-worker` khởi động lại | 02 | Có từ GĐ0 (`vad.rs`); luồng VAD stack 8 MiB (02a QĐ1): b2 `aaeca34` | xong |
| 100 | Việc cho MVP §6.3: chọn luật ghép câu tốt hơn cho zh và ja (ví dụ khoảng nghỉ đủ dài là hết câu), dựa trên dữ liệu hội thoại thật | 02, 02 (người) | chờ Q6; chưa có dữ liệu thì giữ luật hiện tại, như spec cho phép | chờ |
| 349 | `Segment` có thêm `speech_ms` (độ dài tiếng nói, không gồm đệm); `start_ms`, `end_ms` không gồm phần đệm, `samples` có cả đệm; đoạn gộp ở hàng đợi có `speech_ms` bằng tổng các đoạn con, không tính khoảng nghỉ | 02 | Spec §6.3 sửa sau review; dùng cho hạn mức (dòng 186); a2 `b0eb41f`, b1 `4383c00` | xong |

### 4.9 Nhận dạng giọng nói (§6.4)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 101 | Engine whisper.cpp qua `whisper-rs` trong tiến trình phụ `asr-worker` link tĩnh; Metal trên macOS, Vulkan trên Windows; lỗi GPU thì chuyển sang CPU | 02, 02 (Win) | Có từ GĐ0 với Metal; 02: a1 `e963cdb`, d3 `4268836` (Metal, CPU); Vulkan chờ C3 (02c Task 9, Win) | chờ |
| 102 | Giao thức stdin/stdout: khung 4 byte độ dài (`u32` LE) cộng postcard, tối đa 16 MiB; mỗi yêu cầu một phản hồi trừ `Shutdown`; giới hạn các trường của `TranscribeRequest`; khung hỏng, bị cắt, thừa byte là lỗi, worker thoát mã 1; pipeline không gửi đoạn ngắn hơn 100 ms | 02 | Có từ GĐ0 (`asr-protocol`); luật 100 ms đang ở `latency-bench`; a1 `e963cdb` | xong |
| 103 | Mở rộng giao thức: chỉ thêm biến thể ở cuối; app và `asr-worker` luôn build cùng nhau | QƯ, 02 | Có từ GĐ0 (test `variant_indices_are_pinned`); `protocol_version` ở dòng Việc cho MVP; a1 `e963cdb` | xong |
| 104 | Log của thông điệp không bao giờ chứa âm thanh hay nội dung chép lời | 02 | Có từ GĐ0 (`Debug` viết tay trong `asr-protocol`); a1 `e963cdb` | xong |
| 105 | Hai bản trên Windows, `asr-worker-vulkan` và `asr-worker-cpu`; mỗi lần app khởi động chạy nền `asr-worker-vulkan --probe`; dùng bản Vulkan nếu dò thấy GPU dùng được, bản Vulkan không chạy hoặc crash lúc nạp model thì dùng bản CPU | 02 (Win), 04, 07 | `--probe` và chọn bản worker: c1 `518d222`, c3 `45ccd02`; chờ C3 (02c Task 9, Win); 04: T5 `8a439d3` (đề xuất gói theo VRAM, `--probe` giữ danh sách GPU); còn 07 và 04b Task 14 (Windows, cần máy Windows và người) | chờ |
| 106 | Tiến trình phụ lỗi: khởi động lại, chờ 1, 2, 5 giây; lần đầu chạy binary mới chờ `Ready` theo quy tắc `/health`; gửi lại đoạn đang xử lý một lần, lỗi nữa thì `dropped`; crash 2 lần liên tiếp khi dùng GPU thì chuyển CPU và báo; quá 5 lần trong 10 phút thì dừng dịch, báo lỗi | 02 | Đ2; d3 `4268836`, thêm test `9aace29` | xong |
| 107 | Model: gói Chuẩn `large-v3-turbo` q5_0 (khoảng 550 MB), gói Nhẹ `small` q5_1 (khoảng 190 MB) | 04 | 04: T2 `1be9efa` | xong |
| 108 | Chế độ giải mã B (`shared`, cần feature `shared-encode` và bản vá ở `third_party/`) là mặc định; chế độ A chỉ để so sánh hoặc dự phòng | 02 | Có từ GĐ0; d3 `4268836` | xong |
| 109 | Chọn ngôn ngữ: chuẩn hóa xác suất trong tập cho phép; đoạn từ 1,5 giây dưới 0,5 thì giữ ngôn ngữ trước; đoạn ngắn hơn 1,5 giây chỉ đổi khi từ 0,9; chỉ giữ ngôn ngữ trước khi nó thuộc tập; khóa ngôn ngữ hoặc tập một ngôn ngữ thì bỏ nhận diện | 02 | Có từ GĐ0 (`lid.rs`); giữ nguyên khi làm `prev_lang`; a1 `e963cdb` | xong |
| 110 | Giải mã greedy, không temperature fallback, chặn token không phải tiếng nói; prompt là tối đa 100 token cuối của đoạn trước cùng ngôn ngữ; mồi zh/ja tắt mặc định (`ASR_PRIMER=1` để thử); dừng khi lặp (mẫu 1–8 token cần 4 bản, 9–15 cần 3, 16–112 cần 2); trần token mới min(224 − độ dài prompt, 16 + 20 × số giây) | 02 | Có từ GĐ0 trong `asr-worker`; 02 dựng prompt theo ngôn ngữ ở tiến trình chính, đoạn bị bỏ không vào prompt; d1 `8159852` | xong |
| 111 | `audio_ctx = min(1500, max(512, 50 × số giây + 64))`, làm tròn lên (`MIN_AUDIO_CTX`, `audio_ctx_for_samples`) | 02 | Có từ GĐ0 | xong |
| 112 | Flash attention tắt; `ASR_FLASH_ATTN=1` chỉ để thử | 02 | Có từ GĐ0 | xong |
| 113 | Làm nóng: sau `Load`, app gửi `Warmup` | 02 | Worker có từ GĐ0; app gửi trong vòng đời; d3 `4268836` | xong |
| 114 | Lọc ảo giác: bỏ đoạn khi `no_speech_prob > 0,6` và `avg_logprob < −1`, và đoạn có chữ rỗng; luật chạy ở tiến trình chính; đoạn bị bỏ không vào prompt, không đổi ngôn ngữ của đoạn trước | 02 | Có từ GĐ0 trong `latency-bench`; chuyển sang `pipeline` (Đ3); a2 `b0eb41f` | xong |
| 115 | Việc cho MVP §6.4: thử `no_speech_prob` trên im lặng, nhiễu và nhạc, nhất là với turbo | 02, 02 (người) | Cần clip nhạc có quyền dùng (Đ12); b3 `a1143b0`, b6 `9d6c7fd` (`gd1_no_speech.md`, nhạc CC0 và public domain); bộ nhạc chờ chủ dự án duyệt (dòng 351) | xong |
| 116 | Việc cho MVP §6.4: luật lặp khi prompt dài (trần còn khoảng 119 token, câu chép đôi dài từ khoảng 60 token không bị bắt) | 02 | d1 `8159852` | xong |
| 117 | Việc cho MVP §6.4: chọn ngưỡng giữ ngôn ngữ trước theo số ngôn ngữ trong tập, dựa trên đoạn VAD thật (S6) và dữ liệu hội thoại | 02, 02 (người) | chờ Q6 | chờ |
| 118 | Việc cho MVP §6.4: bộ lọc câu ảo giác quen thuộc ("Thank you for watching", "Hãy subscribe cho kênh", "[Music]", "ご視聴ありがとうございました", "请不吝点赞…") | 02 | a3 `4242745` | xong |
| 119 | Việc cho MVP §6.4: bật `shared-encode` mặc định cho bản phát hành; app từ chối worker có `decode_mode` khác `shared` | 02, 07 | 02: d3 `4268836`, c3 `45ccd02`; còn bản phát hành ở 07 | đang làm |
| 120 | Việc cho MVP §6.4: với zh, chuyển phồn thể sang giản thể ở tầng app | 02 | Thư viện phải qua `deny.toml` (R13); a3 `4242745` | xong |
| 121 | Việc cho MVP §6.4: xem lại flash attention khi upstream có mask cho phần đệm (ggml-org/whisper.cpp#3941), tự vá hoặc chờ; bật lại phải kèm test tất định | 02, 08 | Kiểm trạng thái upstream lúc viết 02 và trước phát hành; C6 nếu máy tham chiếu sát ngưỡng; 02 kiểm ngày 2026-10-01: #3941 còn mở, giữ tắt (điểm cần quyết 5 của 02a); còn 08 kiểm lại | đang làm |
| 122 | Việc cho MVP §6.4: trước khi gửi bản vá `set_audio_ctx` lên upstream, hàm C trả −1 khi giá trị ngoài `[0, n_audio_ctx]`, bản Rust trả `Result` | 02 | Sửa `third_party/patches/`, dựng lại theo `third_party/README.md`; a1 `e963cdb` | xong |
| 123 | Việc cho MVP §6.4: đưa `prev_lang` vào `TranscribeRequest`, worker không giữ trạng thái nhận diện ngôn ngữ | 02 | a1 `e963cdb` | xong |
| 124 | Việc cho MVP §6.4: trong `asr-protocol`, `backend` và `decode_mode` thành enum | 02 | a1 `e963cdb` | xong |
| 125 | Việc cho MVP §6.4: `Error` có thêm `kind` (`NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`, `InvalidRequest`, `Internal`) | 02 | a1 `e963cdb` | xong |
| 126 | Việc cho MVP §6.4: `Ready` có thêm `protocol_version`, app từ chối worker lệch phiên bản | 02 | a1 `e963cdb`, d1 `8159852` | xong |
| 127 | Việc cho MVP §6.4: `asr-worker` giữ riêng stdout cho giao thức, chuyển fd 1 sang stderr | 02 | a1 `e963cdb` | xong |
| 128 | Việc cho MVP §6.4: log của `asr-worker` (mở chế độ append) có xoay vòng hoặc giới hạn kích thước | 02 | d1 `8159852` | xong |
| 129 | MVP cần `Ready.backend` trả thiết bị thật, không phải backend được yêu cầu, để áp quy tắc chuyển sang CPU | 02 | Ghi ở §6.4, mục thông điệp `Load`; a1 `e963cdb` | xong |
| 130 | Chạy lại lượt fullctx với bản build chốt, để có số so sánh cùng cấu hình cho giả định 8 | 02 | C12; chờ 02b Task 8 (cần máy rảnh) | chờ |
| 350 | Luật câu đệm (02a QĐ24) bỏ cả đoạn có tiếng thật mà chữ sai: đoạn 45 của session `vi` gói Chuẩn ở S6 (đuôi câu chép thành "Cảm ơn"). Chọn giữ `filler_logprob_max` −0,7, hay hạ xuống −1,0 | CDA, 02 | Điểm cần quyết 1 của 02a, chủ dự án chưa quyết. 02 đã làm theo −0,7 (`9d6c7fd`, `gd1_no_speech.md`); đổi thì sửa `FilterConfig` (hoặc manifest của 04) và test S6 của luật | chưa làm |
| 351 | Bộ nhạc thử `no_speech_prob`: tám file CC0 và hai file public domain trên Wikimedia Commons (Dvořák "Public domain"; Vivaldi "Public Domain Mark" do chủ sở hữu đặt); chỉ bảng kết quả vào repo | CDA, 02 | Điểm cần quyết 8 của 02a, chủ dự án chưa quyết. 02 đã đo với cả mười file (`9d6c7fd`); chỉ nhận CC0 thì bỏ file Vivaldi và chạy lại 02b Task 6 | chưa làm |

### 4.10 Dịch (§6.5)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 131 | `llama-server` khóa một phiên bản llama.cpp; macOS dùng Metal; Windows dùng Vulkan và CPU, nạp backend lúc chạy, lỗi GPU thì chuyển CPU | 02, 02 (Win), 07 | Bản dev dùng b11146 chính thức: d1 `8159852`; Windows chờ C14 (02c Task 9, Win); bản phát hành build trong CI (§10.2) ở 07 | chờ |
| 132 | Lệnh chạy `--host 127.0.0.1 --port <cổng trống ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-ui`; app gọi `/health` để biết server sẵn sàng | 02 | Có từ GĐ0 (`llama.rs`); d1 `8159852` | xong |
| 133 | API key truyền qua biến môi trường `LLAMA_API_KEY`, chỉ đặt cho tiến trình `llama-server`; không dùng `--api-key` | 02 | Spec ghi "MVP đổi sang"; GĐ0 còn truyền `--api-key`; d1 `8159852` | xong |
| 134 | Không truyền `-ngl 99`; chạy `llama-server` sau khi `asr-worker` nạp model, để `--fit` tính cả VRAM của whisper | 02 | d1 `8159852`, d3 `4268836` | xong |
| 135 | Server lỗi: tự khởi động lại, chờ 1, 2, 5 giây; quá 5 lần trong 10 phút thì báo lỗi, phụ đề chỉ hiện câu gốc | 02 | d3 `4268836` | xong |
| 136 | Lần đầu chạy binary mới (sau khi cài hoặc cập nhật): chờ `/health` hay `Ready` tới 180 giây (lần thường 60 giây), lần chờ này không tính vào bộ đếm lỗi, giao diện báo "Đang chuẩn bị lần đầu"; áp cả cho `asr-worker` | 02, 03 | Spec §6.5 sửa ngày 2026-10-01; T1 cho số đo trên bản đã notarize; 02: d3 `4268836`, c1 `518d222`, c3 `45ccd02`; số thật chờ T1; 03: b2 `39ff6f9` (lời nhắc trên thanh phụ đề) | chờ |
| 137 | API `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF; kết luận S4 chỉ áp cho lệnh chạy hiện tại; đổi cờ hoặc chạy trên Windows thì làm lại S4 | 02, 02 (Win), 07 | 02: d1 `8159852`, sửa dùng lại kết nối `e591a1e`; chờ C4 (02c Task 9, Win); 07 làm lại S4 khi chuyển sang llama.cpp tự build | chờ |
| 138 | Phương án dự phòng: render template bằng `minijinja` rồi gọi `/completion`, truyền mảng token hoặc bỏ BOS để không ra BOS kép | 02 | Chỉ làm nếu S4 trên Windows hoặc bản tự build không đạt; chờ C4 (02c Task 9, Win) | chờ |
| 139 | Mẫu prompt theo model card Hy-MT2: mẫu tiếng Trung khi câu liên quan tới tiếng Trung, còn lại mẫu tiếng Anh; tên ngôn ngữ theo từng mẫu | 02 | Có từ GĐ0 (`prompt.rs`) | xong |
| 140 | Thuật ngữ: mẫu "terminology" của Hy-MT2; chỉ lấy mục có trong câu, tối đa 20 mục; chuẩn hóa NFC, không phân biệt hoa thường; chữ Latin khớp theo ranh giới từ, chữ Trung, Nhật, Hàn khớp theo chuỗi con | 03 | 03: a4 `4d2980a` | xong |
| 141 | Đưa câu trước vào làm ngữ cảnh: cờ thử nghiệm `experimental.translationContext`, mặc định tắt | 02, 01 | Có từ GĐ0 (`context_prompt`); 01: Task 4 `7d828f0`; 02: b2 `aaeca34`, c3 `45ccd02` | xong |
| 142 | Tham số sinh: temperature 0, repeat penalty 1,05, số token tối đa min(4 × số token câu gốc + 32, 512) | 02 | Có từ GĐ0 (`llama.rs`, `max_tokens_for`) | xong |
| 143 | Bật `cache_prompt`; gửi một request làm nóng khi bắt đầu phiên | 02 | `cache_prompt` có từ GĐ0; d1 `8159852`, b2 `aaeca34` | xong |
| 144 | Hậu xử lý trong lúc stream: cắt khoảng trắng thừa; giữ vài token đầu tới khi chắc không phải nhãn ("Translation:", "译文：") hay ngoặc kép mở; bỏ nhãn; bỏ ngoặc kép bao quanh nếu câu gốc không có | 02 | d2 `00e1613` | xong |
| 145 | Bản dịch quá dài, đo bằng token theo từng cặp: Anh→Việt 4,4; Trung→Việt 6,6; Nhật→Việt 3,5; Hàn→Việt 3,5; Việt→Anh 1,6; Việt→Trung 1,2; Việt→Nhật 2,2; Việt→Hàn 2,2; chỉ áp khi câu gốc từ 10 token; vượt thì cắt stream ngay | 02 | Q4 chốt cách 2; d2 `00e1613`; 12 chiều không có tiếng Việt `22fa4fe` | xong |
| 146 | Thử lại một lần với repeat penalty 1,15; vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được" | 02 | d2 `00e1613` | xong |
| 147 | Bỏ bước dịch khi ngôn ngữ câu gốc trùng ngôn ngữ đích | 02 | b2 `aaeca34` | xong |
| 148 | Việc cho MVP §6.5 (đã chọn): cách 2, chỉ áp tỉ lệ khi câu gốc từ 10 token; câu ngắn hơn chỉ chịu hạn mức sinh | 02 | Q4; spec §6.5 sửa ngày 2026-10-01; d2 `00e1613` | xong |
| 149 | Việc cho MVP §6.5: đo ngưỡng cho các cặp không có tiếng Việt, và cho câu gốc dưới 3 token | 02 | Đ12; dựng thêm bộ test từ WMT24++ như S7; b4 `1546741`, b6 `9d6c7fd`, đo lại `7e88b02` sau khi sửa `e591a1e` (`gd1_mt_ratio.md`); điểm cần quyết 4 của 02a đã quyết ngày 2026-10-02 (nhận đề xuất theo số đo), áp ở `22fa4fe` | xong |
| 150 | Việc cho MVP §6.5: đo lại thời gian chờ lần đầu với bản đã ký và notarize | 07 | Chờ T1 | chưa làm |

### 4.11 Phụ đề và bản chép lời (§6.6)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 151 | Cấu trúc `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status, replaces }` và cờ `provisional`; `replaces` là id các phụ đề đã gộp vào khi hàng đợi dịch đầy; `status` là `asr_done`, `translating`, `done`, `failed`, `same_lang`, `skipped` hoặc `dropped` | 02, 03 | `replaces` theo 02a QĐ9; 03 xóa phụ đề theo `replaces`; 02: b1 `4383c00`, c5 `73baf99`; 03: a6 `7ed54a3`, b1 `ccb59c2` | xong |
| 152 | Sự kiện Tauri `subtitle://upsert` (cả đối tượng) và `subtitle://delta` (từng token lúc đang dịch) | 02, 03 | Tên `subtitle://upsert` có từ S5; 02: b1 `4383c00`, b2 `aaeca34`, c3 `45ccd02`, c5 `73baf99`; 03: a6 `7ed54a3`, b1 `ccb59c2` | xong |
| 153 | Thanh phụ đề hiện N dòng gần nhất; cửa sổ chính hiện toàn bộ; đoạn `dropped` hiện "[bỏ qua đoạn]" | 03 | 03: b1 `ccb59c2`, b2 `39ff6f9`, b4 `1814de9` | xong |
| 154 | Bản chép lời nằm trong bộ nhớ theo từng phiên | 03 | 03: a6 `7ed54a3` | xong |
| 155 | File SQLite mã hóa bằng SQLCipher qua `rusqlite`, nằm trong thư mục dữ liệu của app, khóa lưu trong kho khóa; chứa từ điển (Pro) và bản chép lời khi bật "Lưu lịch sử" (Pro) | 03 | Kho khóa làm ở 01 (Đ5); 03: a3 `3d9c42f`, a5 `7c3e57e`, a7 `a067dce` | xong |
| 156 | Xuất TXT (`[giờ] câu gốc` rồi `→ bản dịch`), SRT (chọn xuất câu gốc hoặc bản dịch), Markdown | 03 | Xuất và test phía Rust (`transcript/export.rs`), spec §11 sửa theo Q12; 03: a6 `7ed54a3`, a8 `91c5edf` | xong |

### 4.12 Quản lý model (§6.7)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 157 | Manifest `models.json` trên Cloudflare R2 và tên miền riêng, ký Ed25519, khóa công khai build sẵn; trường `id`, `tier`, `kind`, `version`, `url`, `bytes`, `sha256`, `license_id`, `min_app_version` | 04 | Tên miền chờ T7 (mua sau); bản ký chính thức chờ T3 (Đ8); 04: T1 `855237e`, T2 `1be9efa`, T6 `62a0096`; chờ 04b Task 13 (R2, khóa và manifest staging; cần người) | chờ |
| 158 | Hai gói: Chuẩn (whisper turbo q5_0, Hy-MT2 Q8_0 1,91 GB, silero-vad; khoảng 2,5 GB) và Nhẹ (whisper small q5_1, Hy-MT2 Q4_K_M 1,13 GB, silero-vad; khoảng 1,3 GB) | 04 | 04: T2 `1be9efa` (cấu hình); chờ 04b Task 13 (R2, khóa và manifest staging; cần người) | chờ |
| 159 | Đề xuất gói Chuẩn khi máy Apple Silicon có RAM từ 16 GB, hoặc máy Windows có RAM từ 16 GB và card rời Vulkan VRAM từ 6 GB (`DISCRETE_GPU`, heap `DEVICE_LOCAL` lớn nhất); card rời từ 4 tới dưới 6 GB thì gói Nhẹ; GPU tích hợp chưa tính; máy còn lại gói Nhẹ; người dùng đổi được | 04 | Ngưỡng nằm trong manifest (Đ7); 04: T5 `8a439d3`, T11 `1797cd1`; ngưỡng thật chờ C6, C7 | chờ |
| 160 | Tải bằng HTTP Range; ghi `*.part`, kiểm SHA-256 rồi mới đổi tên; trước khi tải kiểm dung lượng trống ≥ kích thước model + 1 GB | 04 | 04: T3 `713c3be`, T8 `adb1e7b` | xong |
| 161 | Nơi lưu `app_local_data_dir`: macOS `~/Library/Application Support/<bundle-id>/models`; Windows `%LOCALAPPDATA%\<bundle-id>\models`, không đặt trong `%LOCALAPPDATA%\<tên app>` (thư mục cài của NSIS per-user); ô "xóa dữ liệu app" của bộ gỡ chỉ xóa `%APPDATA%\<bundle-id>` và `%LOCALAPPDATA%\<bundle-id>` | 04, 07 | Bundle id `com.aitranslator.desktop` (Q1 chốt 2026-10-01); 04: T8 `adb1e7b` (đường dẫn trên Mac); còn 04b Task 14 (Windows, cần máy Windows và người) | chờ |
| 162 | Tự host model; file LICENSE và NOTICE đặt cạnh file model; không tải từ Hugging Face hay GitHub của người khác | 04 | 04: T2 `1be9efa`; chờ 04b Task 13 (R2, khóa và manifest staging; cần người) | chờ |
| 163 | Cập nhật model: khi có mạng, kiểm manifest lúc khởi động, tối đa một lần mỗi ngày; có bản mới thì hỏi người dùng, không tự tải | 04 | 04: T6 `62a0096`, T8 `adb1e7b`, T11 `1797cd1` | xong |

### 4.13 Thanh toán và bản quyền (§6.8)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 164 | License server riêng: TypeScript + Hono, Cloudflare Workers, D1, tài khoản Cloudflare riêng; khóa API của PayOS chỉ nằm trên server | 05 | 05: Task 2 `5b61614`, Task 18 `5664b1b`; triển khai trên tài khoản riêng chờ 05 Task 19 (người, T4) | chờ |
| 165 | Interface `PaymentProvider` (`create_checkout`, `verify_webhook`, `get_payment_status`); PayOS là cài đặt đầu tiên; webhook là route chung `/v1/webhooks/{provider}`, server chọn cổng theo cột `provider` của đơn; thêm cổng chỉ cần một cài đặt | 05 | Spec §6.8 sửa theo 05 QĐ28; 05: Task 8 `5d628e2`, Task 13 `b6cb210` | xong |
| 166 | Bảng đơn hàng lưu thêm `provider` và `currency`; mỗi gói trả phí có giá riêng theo từng loại tiền | 05 | Giá chốt (Q2); 05: Task 3 `b5c7607`, Task 12 `9f84646` | xong |
| 167 | License dựa vào gói, `expires_at` và `cycle_anchor`; mỗi đơn trả trước là 30 ngày, theo luật mua thêm và đổi gói (dòng 327, 328) | 05 | Thuê bao quốc tế để Giai đoạn 2; 05: Task 3 `b5c7607`, Task 12 `9f84646`, Task 13 `b6cb210` | xong |
| 168 | `POST /v1/checkout` với `plan` là `pro`, `pro_x2` hoặc `pro_x5`, `email`, `consent: true`, `license_key` khi gia hạn hay đổi gói: tạo đơn có `order_code` duy nhất, gọi PayOS `POST /v2/payment-requests` với `expiredAt` bằng hiện tại + 15 phút; trả `order_code`, `checkout_url`, `qr_code`, `order_token`, `amount`, `currency`, `expires_at`, và ước tính `license_expires_at` khi có key; tên trường `snake_case` | 05 | 05 sửa từ `pro_1m`, `pro_12m`; 05: Task 12 `9f84646` | xong |
| 169 | `POST /v1/webhooks/{provider}` (PayOS: `/v1/webhooks/payos`): kiểm chữ ký bằng checksum key; gọi PayOS `GET /v2/payment-requests/{orderCode}` để xác nhận; chỉ nhận `PAID`, `amountPaid` ≥ `amount` và `amount` khớp đơn; idempotent theo `order_code`; cấp license mới, gia hạn hoặc đổi gói theo dòng 327, 328; gửi email chứa key; đăng ký webhook qua `confirm-webhook` khi triển khai | 05, 05 (người) | 05: Task 13 `b6cb210`, Task 16 `45b5305`; đăng ký webhook chờ 05 Task 19 (người; T5, P05-1) | chờ |
| 170 | `GET /v1/orders/{order_code}` với `order_token` trong header `Authorization: Bearer`, không trong query: app hỏi trạng thái đơn; đơn đã trả tiền thì trả key, gói và hạn mới | 05 | Spec §6.8 sửa theo 05 QĐ25; 05: Task 13 `b6cb210` | xong |
| 171 | `POST /v1/licenses/activate`: tối đa 2 máy; `device_id_hash` đã có activation thì dùng lại, không tốn suất; đủ 2 máy thì trả `409` kèm `activation_id`, `device_label`, thời điểm `validate` gần nhất | 05 | 05: Task 14 `bb1691c` | xong |
| 172 | `POST /v1/licenses/validate`: trả token mới nếu license còn hiệu lực | 05 | 05: Task 14 `bb1691c` | xong |
| 173 | `POST /v1/licenses/deactivate`: gọi từ chính máy đó, hoặc gỡ từ xa từ máy mới khi key đã đủ 2 máy; mỗi lần gỡ tính vào giới hạn ở §10.2 | 05 | 05: Task 14 `bb1691c` | xong |
| 174 | `POST /v1/licenses/recover`: gửi lại mọi key còn hiệu lực vào chính email đó; luôn trả `200`; tra và gửi thư sau khi đã trả lời, để thời gian phản hồi không lộ email nào có key; email không có key thì không gửi gì; có giới hạn tần suất | 05 | 05 QĐ15; 05: Task 14 `bb1691c` | xong |
| 175 | Gửi email qua Resend (API HTTP gọi từ Worker), sau interface `EmailProvider`; khóa API của Resend là secret của Worker; tên miền gửi xác thực SPF, DKIM; văn bản thuần vi/en; lỗi email không chặn cấp key; email mua hàng có idempotency key theo đơn, gửi lại không thành hai thư; chỉ 400 và 422 là lỗi vĩnh viễn, lỗi khác gửi lại giãn dần trong 24 giờ | 05 | 05: Task 9 `d68d531`, Task 13 `b6cb210`, Task 15 `e6b3230`; gửi thật chờ T6 (tài khoản Resend), tên miền (Q1, T7) ở 05 Task 19, 21 (người) | chờ |
| 176 | `/admin/*` ở Worker admin riêng sau Cloudflare Access: tra cứu theo email hoặc `order_code`, gửi lại key; mở khóa key bị khóa tạm; cấp hoặc gia hạn tay (gia hạn license đã hết hạn thì đặt lại `cycle_anchor`, mở cửa sổ `quota_fresh`); xử lý đơn `paid_needs_review` bằng `POST /admin/orders/{order_code}/resolve` (`action` là `grant_new_license` hoặc `refunded`); gỡ activation, thu hồi key; xóa hoặc ẩn danh dữ liệu theo email, chỉ chạy tay; ký thử bằng khóa dự phòng; mọi thao tác ghi nhật ký | 05, 05 (người) | Q9: không có cron tự xóa; R15; 05: Task 16 `45b5305`, sửa ở đợt B–D; Access chờ 05 Task 19, 21 (người) | chờ |
| 177 | Chữ ký khi tạo link thanh toán: HMAC-SHA256 bằng checksum key trên `amount`, `cancelUrl`, `description`, `orderCode`, `returnUrl` xếp theo thứ tự chữ cái | 05 | 05: Task 8 `5d628e2` | xong |
| 178 | Token bản quyền ký Ed25519, khóa công khai build sẵn trong app; trường `kid`, `license_id`, `activation_id`, `device_id_hash`, `activation_created_at`, `quota_epoch`, `plan` (mã gói `pro`, `pro_x2`, `pro_x5`), `expires_at`, `cycle_anchor`, `quota_minutes_per_cycle` (`null` là không giới hạn), `issued_at`, `refresh_before` (= `issued_at` + 14 ngày) | 05, 06 | Vector test chung (Đ9); 05 sửa QĐ11 (`plan` là mã gói); 05: Task 6 `68ca378`, Task 7 `6940335`, Task 14 `bb1691c`; token thật trên staging chờ 05 Task 20 (người); 06: a1 `3f570c9` (30 vector) | chờ |
| 179 | `device_id_hash` là SHA-256 của IOPlatformUUID (macOS) và MachineGuid (Windows) | 06, 06 (Win) | 06: a3 `48ddb20`; còn 06b Task 7 (Windows, cần người) | chờ |
| 180 | Quá `refresh_before` mà chưa làm mới được token thì app về Free | 06 | 06: a7 `14e4750` | xong |
| 181 | Quá `expires_at`: nếu có mạng thì gọi `validate` trước; chỉ về Free và nhắc gia hạn khi server xác nhận chưa gia hạn, hoặc khi không có mạng | 06 | 06: a7 `14e4750` | xong |
| 182 | Mua trong app: chọn gói, nhập email, tick đồng ý; hiện VietQR tự vẽ từ `qr_code`, kèm nút mở trang thanh toán PayOS; hỏi đơn mỗi 3 giây, tối đa 15 phút; đơn đã trả thì tự kích hoạt, đơn gia hạn hay đổi gói thì gọi `validate`; lưu `order_code` và `order_token` để hỏi lại ở lần mở sau; key cũng gửi qua email | 06 | 06: a9 `61f5ec3`, b3 `15d8252`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 183 | Gia hạn: nhắc trước 7 ngày và khi đã hết hạn; nút "Gia hạn" mở màn hình Nâng cấp, tạo đơn mới gắn với key hiện có, cùng gói hoặc đổi gói | 06 | 06: a9 `61f5ec3`, b1 `b7b3e86`, b2 `693d422`, b4 `d266be5`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 184 | Kiểm tra định kỳ: lúc khởi động và sau đó mỗi giờ; lần `validate` thành công gần nhất quá 24 giờ và có mạng thì gọi `validate`, kể cả khi app chạy liên tục nhiều ngày | 06 | 06: a7 `14e4750`, a8 `f73386c` | xong |
| 185 | Máy bị gỡ từ xa về Free ở lần `validate` kế tiếp; nếu máy đó offline thì token cũ dùng được tới `refresh_before` | 06 | 06: a7 `14e4750` | xong |
| 186 | Cách đếm phút cho mọi gói: `speech_ms` của đoạn (không gồm đệm; đoạn gộp cộng từng đoạn con) đã chép lời và khác ngôn ngữ đích, cộng khi phụ đề sang `done`; không tính `same_lang` (chép lời cùng ngôn ngữ là miễn phí, có chủ ý), `dropped`, đoạn bị lọc, `skipped`, `failed`, im lặng; mỗi đoạn tính một lần kể cả khi dịch lại sau ghép hay gộp; bộ đếm trong kho khóa | 06, 02 | Q5 theo đề xuất; 02 thêm `speech_ms` và sửa chỗ cộng `translated_speech_ms` (mục 2.2); 02: a2 `b0eb41f`, b1 `4383c00`, b2 `aaeca34` (02a QĐ25); 06: a8 `f73386c` | xong |
| 187 | Hạn mức Free reset lúc 00:00 theo giờ máy, chỉ khi ngày đã tăng so với lần reset trước và đã qua ít nhất 20 giờ theo đồng hồ thật | 06 | 06: a4 `37e7536` | xong |
| 188 | Mất bản ghi bộ đếm trong khi app đã có dữ liệu từ trước thì coi như đã dùng hết hạn mức của ngày (Free) hoặc của chu kỳ hiện tại (gói trả phí); ngày hay chu kỳ mới chưa có bộ đếm thì bắt đầu từ 0 | 06 | 06: a4 `37e7536`, a7 `14e4750` | xong |
| 189 | Trong app, interface `LicenseProvider` (activate, validate, deactivate) cài bằng client gọi license server | 06 | 06: a6 `cfa28fe` | xong |
| 190 | PayOS chỉ nhận chuyển khoản từ ngân hàng Việt Nam bằng VND, nên MVP chỉ bán cho khách ở Việt Nam | 06, 05 | Ghi rõ ở màn hình Nâng cấp; 05: Task 8 `5d628e2`; 06: b3 `15d8252` | xong |
| 326 | Bảng gói trả phí trong cấu hình của server (mã gói, `quota_minutes_per_cycle`, 30 ngày mỗi đơn, giá theo loại tiền); `GET /v1/plans` trả bảng này; bảng có cả tên hiển thị (`name`); chưa cấu hình `PLANS` thì `GET /v1/plans`, checkout, `activate` và `validate` trả `503 pricing_not_configured`; đổi hạn mức có tác dụng ở lần `validate` sau, nên không được hạ hạn mức của gói đang bán; hạn mức Free là hằng số phía app | 05, 06 | Thay `PRICES_JSON` hai gói của 05; 05: Task 12 `9f84646`, Task 18 `5664b1b`; 06: a9 `61f5ec3`, b3 `15d8252` | xong |
| 327 | Mua thêm cùng gói: `expires_at` cộng 30 ngày từ max(hiện tại, `expires_at`); `cycle_anchor` giữ nguyên, license đã hết hạn thì đặt lại bằng hiện tại; tính lúc xác nhận đã nhận tiền | 05 | 05: Task 12 `9f84646`, Task 13 `b6cb210` | xong |
| 328 | Đổi gói khi license còn hạn: gói mới bắt đầu ngay, `cycle_anchor` = hiện tại; `ngày_quy_đổi` = floor(ngày_còn_lại × giá_cũ / giá_mới), giá theo bảng hiện hành; `expires_at` = hiện tại + 30 ngày + `ngày_quy_đổi`; không hoàn tiền; license đã hết hạn thì tính như license mới giữ key cũ; checkout trả ước tính `license_expires_at` | 05, 06 | 06 hiện số ngày quy đổi trước khi trả tiền; 05: Task 12 `9f84646`, Task 13 `b6cb210`; 06: a9 `61f5ec3`, b3 `15d8252` | xong |
| 329 | `validate` trả token theo gói và hạn hiện tại; máy thứ hai của cùng key nhận gói mới ở lần `validate` kế tiếp | 05, 06 | 05: Task 14 `bb1691c`; 06: a9 `61f5ec3`, b3 `15d8252`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) (máy thứ hai) | chờ |
| 330 | Hạn mức đếm riêng trên từng máy, hai máy không chia chung; server không theo dõi số phút | 06 | 06: a4 `37e7536`, a7 `14e4750` | xong |
| 331 | Chu kỳ hạn mức của gói trả phí: 30 ngày từ `cycle_anchor`; `n` = floor((`issued_at` của token mới nhất − `cycle_anchor`) / 30 ngày), không theo giờ máy; giờ máy qua mốc thì gọi `validate` ngay nếu có mạng; `issued_at` của token mới vẫn trước mốc thì hẹn `validate` lại sau (mốc − `issued_at`) + 1 phút | 06 | Q16; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 332 | Bộ đếm của gói trả phí có khóa (`license_id`, mốc đầu chu kỳ, `quota_epoch`); gỡ máy rồi kích hoạt máy khác không chuyển bộ đếm (máy mới bắt đầu từ 0); kích hoạt lại chính máy cũ thì dùng tiếp bộ đếm cũ; xoay key là rủi ro chấp nhận | 06 | Q16; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 333 | Chạm hạn mức: hạn mức còn 0 thì không cho bắt đầu phiên; đang dịch thì bỏ hàng đợi, chỉ dịch xong câu đang dịch, dừng với `quota_exhausted`; tính năng Pro khác vẫn dùng được khi gói còn hạn | 06, 02 | Q16; 02: b2 `aaeca34`, c3 `45ccd02` (02a QĐ26); hạn dịch câu đang dịch ở dòng 352; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 334 | App xử lý `423 license_locked` (báo key bị khóa tạm, hướng dẫn liên hệ hỗ trợ) và `429` kèm `Retry-After` (báo thử lại sau, không thử lại liên tục) | 06 | Spec §9 thêm hai dòng ngày 2026-10-01; 06: a6 `cfa28fe`, a7 `14e4750`, b2 `693d422` | xong |
| 335 | Admin ký thử một token bằng ô khóa dự phòng (ô không đang ký), rồi kiểm bằng `server/keys/public-keys.json`, kể cả token nằm đúng ô; token ký thử không dùng được làm bản quyền; Worker admin không giữ khóa nào, gọi Worker API qua service binding (`AdminRpc`, `admin-rpc.ts`) | 05, 05 (người) | 05 QĐ31, QĐ34; 05: Task 7 `6940335`, Task 11 `29237cb`, Task 16 `45b5305`; ký thử trên staging chờ 05 Task 19 Step 13 (người) | chờ |
| 340 | Token thêm `quota_epoch` (số nguyên của activation, bắt đầu từ 0), `activation_created_at` (chỉ để hiển thị và hỗ trợ) và `quota_fresh`: `true` cho mọi token cấp trong 15 phút kể từ mốc gần nhất trong ba mốc, server lưu riêng từng mốc: tạo activation; cấp token đầu tiên sau khi admin tăng `quota_epoch` (không phải lúc admin bấm); áp việc đặt lại `cycle_anchor` lúc xử lý đơn (không theo giá trị `cycle_anchor`); gỡ máy (kể cả admin gỡ) không xóa dòng activation; kích hoạt lại cùng `device_id_hash`, kể cả sau khi gỡ, dùng lại đúng activation đó và không mở cửa sổ `fresh` mới; thao tác admin "reset hạn mức của máy" tăng `quota_epoch` và ghi nhật ký, chỉ làm khi khách liên hệ | 05, 05 (người) | Spec §6.8 sửa sau review lần 4; 05: Task 3 `b5c7607`, Task 6 `68ca378`, Task 14 `bb1691c`, Task 16 `45b5305` | xong |
| 341 | "Hiện tại" của gia hạn và đổi gói là thời điểm thanh toán do PayOS báo (`transactionDateTime`), kẹp trong thời hạn của link; admin cấp tay không qua đơn dùng lúc thao tác; "hiện tại" khi áp đơn không sớm hơn `cycle_anchor` đang có của license (đơn áp không theo thứ tự thanh toán), nên `cycle_anchor` không lùi; ước tính của checkout chênh tối đa 15 phút, `ngày_quy_đổi` có thể ít hơn 1 ngày | 05 | 05: Task 8 `5d628e2`, Task 13 `b6cb210`, Task 16 `45b5305`; kẹp ở lúc xử lý `cdee80b` | xong |
| 342 | Mô tả đơn PayOS là `AT<order_code>`, `AT` cộng tối đa 7 chữ số, không quá 9 ký tự | 05 | Thay tiền tố `MT` của 05; 05: Task 12 `9f84646` | xong |
| 343 | Free: "đồng hồ thật" = max(thời gian đơn điệu cộng dồn lúc app chạy; hiệu hai header `Date` của server, chỉ khi có `Date` trước và sau lần reset; hiệu giờ máy, chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút); bộ đếm Free của ngày cộng cả phút dịch lúc ở gói trả phí; hết hạn mức gói trả phí thì Free của ngày cũng hết; rủi ro chấp nhận: chỉnh giờ tới trước khi offline, xóa sạch dữ liệu trên cùng máy, gỡ kích hoạt sau khi hết hạn mức gói trả phí | 06 | Q16; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 344 | Bộ đếm và mất bản ghi. Free: bắt đầu từ 0 ở lần đầu chạy app và mỗi lần reset ngày hợp lệ; mất bộ đếm ngày khi đã có dữ liệu thì coi như hết; không dùng `quota_fresh` hay bản ghi đánh dấu. Gói trả phí: khóa (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`); bản ghi đánh dấu cùng các trường đó; ghi bộ đếm trước, bản ghi đánh dấu sau; chỉ tin `quota_fresh` trong response vừa nhận, token đọc lại từ kho khóa coi là `false`; bắt đầu từ 0 khi token `fresh`, khi epoch của token lớn hơn epoch trong bản ghi đánh dấu, hoặc khi bản ghi đánh dấu có mốc cũ hơn mốc hiện tại; trong cửa sổ `fresh`, luật bắt đầu từ 0 đứng trước luật mất bản ghi; coi là mất khi bản ghi đánh dấu đúng activation, chu kỳ, epoch mà mất bộ đếm, hoặc token không `fresh` mà activation này không có bản ghi đánh dấu lẫn bộ đếm; app báo rõ lý do và hướng dẫn liên hệ hỗ trợ | 06 | Q16, R22; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 345 | Chu kỳ cuối ngắn hơn 30 ngày (`expires_at` trước mốc đầu chu kỳ kế tiếp): hạn mức `ceil(quota_minutes_per_cycle × số_ngày / 30)`, app tự tính từ `expires_at`, gia hạn thì tính lại | 06 | Q16; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 346 | Hiển thị thời điểm reset: Free là max(00:00 hôm sau, lần reset trước + 20 giờ); gói trả phí là mốc đầu chu kỳ kế tiếp, kèm ghi chú cần có mạng; `expires_at` đến trước mốc đó thì báo ngày hết hạn | 06, 03 | Spec §4.2; 03 không làm; 06: a7 `14e4750`, b4 `d266be5` (`quota_reset_at`, `QuotaView`) | xong |
| 347 | Giờ máy qua mốc chu kỳ mới khi offline: dùng tiếp bộ đếm của chu kỳ cũ, báo cần kết nối mạng để mở hạn mức mới; có mạng thì gọi `validate` ngay | 06 | Spec §9; 06: a4 `37e7536`, a7 `14e4750` | xong |
| 348 | Quy ước chung của API: tên trường `snake_case`; lỗi có dạng `{"error": "<mã>", …}`; thời điểm tính bằng giây Unix; `429` kèm `Retry-After`; chỉ nhận HTTPS ngoài môi trường dev; không bật CORS (app gọi từ phía Rust); trạng thái đơn `pending`, `processing`, `paid`, `underpaid`, `cancelled`, `expired`, `failed` (`PAID` mà thiếu tiền là `underpaid`), cộng `paid_needs_review` và `refunded` của server; checkout trả thêm `plan`, `converted_days`; `GET /v1/orders` trả thêm `license_plan`, `grant_kind`; `activate` và `validate` trả token cùng các trường của token | 05, 06 | Spec §6.8 sửa theo 05 QĐ20, QĐ26 và hợp đồng API; 05: Task 11 `29237cb`, Task 12 `9f84646`, Task 13 `b6cb210`; 06: a6 `cfa28fe` | xong |
| 352 | Chạm hạn mức: câu đang dịch chỉ được dịch trong hạn `mt.stop_grace_ms` (3 giây, như khi bấm Dừng), quá hạn thì `skipped`; hay chờ tới hết thời gian chờ của request (120 giây) | CDA, 02 | Điểm cần quyết 6 của 02a, chủ dự án chưa quyết. 02 đã làm theo hạn 3 giây (02a QĐ26, `aaeca34`) | chưa làm |

### 4.14 Cài đặt (§6.9)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 191 | Lưu JSON bằng `tauri-plugin-store`, có số phiên bản schema và bước migrate khi schema đổi | 01 | 01: Task 5 `ef7c3d6`, Task 13 `dcdbd83`, sửa `4d95f83` | xong |
| 192 | Khóa: `uiLanguage`, `targetLanguage`, `sourceLanguages[]`, `sourceLock?`, `audioSource`, `vadEndSilenceMs`, `overlay.{fontSize, lines, opacity, showSource, locked, positions}`, `modelTier`, `hotkeys`, `saveHistory` (mặc định tắt), `launchAtLogin`, `theme`, `updateChannel`, `experimental.translationContext` | 01 | Kế hoạch sau thêm khóa thì kèm bước migrate; 01: Task 4 `7d828f0`, Task 6 `fe318a5`, sửa `4d95f83` | xong |
| 193 | Từ điển thuật ngữ nằm trong SQLite mã hóa, không nằm trong file cài đặt | 03 | 03: a5 `7c3e57e` | xong |

### 4.15 Giao diện (§6.10)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 194 | React 19, TypeScript, Vite, Zustand | 01 | 01: Task 1 `69f30ba`, Task 18 `3a275a2` | xong |
| 195 | Hai cửa sổ `main` và `overlay`, mỗi cửa sổ một entry HTML; giao tiếp với lõi Rust qua `invoke` và sự kiện; store Zustand đăng ký nhận sự kiện | 01 | Hai entry có từ GĐ0; 01: Task 18 `3a275a2`, Task 20 `af007e5`, Task 21 `360b067` | xong |
| 196 | Nhận diện thương hiệu mới, không dùng nhận diện của AI Live Translator | 01, 07 | Tên đã chốt (AI Translator); 01 dùng token màu và icon tạm: Task 17 `b89f22e`, Task 21 `360b067`; logo chờ Q1; còn 07 | chờ |
| 197 | Trợ năng: chữ phóng to được; phụ đề đủ tương phản | 01, 03 | 01: Task 17 `b89f22e` (quyền `set-webview-zoom`), Task 21 `360b067` (cỡ chữ theo rem); thử tay chờ 01 Task 24 dòng 10 (người), 01 Task 25 dòng 10 (Win); 03: b1 `ccb59c2`, b2 `39ff6f9` (bảng màu đủ tương phản 4,5:1, chữ có viền tối); thử tay chờ 03b Task 8 (người) | chờ |

### 4.16 Đóng gói, ký số, cập nhật (§6.11)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 198 | Bộ cài: Windows NSIS `.exe` kèm bootstrapper WebView2; macOS `.dmg` cho arm64 | 07 | | chưa làm |
| 199 | Dung lượng bộ cài ≤ 60 MB (macOS: phần tiến trình phụ 7,7 MB sau nén LZMA) | 07 | Windows chờ C10; R12 | chưa làm |
| 200 | Ký Windows bằng chứng thư OV có khóa trên HSM của dịch vụ ký cloud, để CI ký được; lúc đầu SmartScreen có thể vẫn cảnh báo | 07 | Chờ T2 | chưa làm |
| 201 | Ký macOS bằng Developer ID Application, bật hardened runtime, notarize | 07 | Chờ T1 | chưa làm |
| 202 | macOS không chạy sandbox; bật `macOSPrivateApi` cho cửa sổ trong suốt | 07 | Có từ GĐ0 (`tauri.conf.json`) | xong |
| 203 | Tự cập nhật bằng `tauri-plugin-updater`: manifest cập nhật trên CDN, ký bằng khóa cập nhật; kiểm lúc khởi động và mỗi 24 giờ; cài ở lần thoát kế tiếp; có bản mới và app đang rảnh thì mời khởi động lại | 07 | Q13 về cách mời | chưa làm |
| 204 | Hai kênh cập nhật stable và beta, chọn trong Cài đặt | 07, 01 | 01: Task 4 `7d828f0`, Task 21 `360b067` (khóa `updateChannel` và ô chọn); còn 07 | đang làm |
| 205 | Tiến trình phụ đặt ở `src-tauri/binaries/`, tên kèm target triple: `asr-worker` (macOS); `asr-worker-vulkan`, `asr-worker-cpu` (Windows); `llama-server` kèm thư viện backend ggml (Windows) và `.dylib` (macOS nếu link động) | 02, 07 | 02 có script chép binary cho bản dev; 02: c1 `518d222` (`scripts/copy-sidecars.sh`); còn bộ cài ở 07 | đang làm |

### 4.17 Phiên bản thư viện (§6.12)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 206 | Luôn dùng bản ổn định mới nhất lúc cài; không dùng beta, rc, nightly trừ khi bắt buộc, và khi đó ghi rõ lý do | QƯ | Mục 6.1 | chưa làm |
| 207 | Trước khi chốt phiên bản: đọc release notes và changelog; kiểm peer dependency; thư viện React hỗ trợ React 19; plugin Tauri cùng dòng với Tauri core; crate chạy được với MSRV; Node đúng yêu cầu của Vite | QƯ | Mục 6.1 | chưa làm |
| 208 | Trong một tiến trình không có hai bản của cùng thư viện gốc, không trùng symbol; ggml chỉ nằm ở hai tiến trình phụ; `asr-worker` link tĩnh whisper.cpp, tắt `GGML_BACKEND_DL`; `dumpbin` hai bản Windows không có DLL ggml | QƯ, 07 | Chờ C11; 07 thêm bước kiểm `dumpbin` vào CI | chưa làm |
| 209 | Mức CPU cố định ở `.cargo/config.toml` với `force = true` (x64: AVX, AVX2, BMI2, FMA, F16C, không AVX-512; arm64: `armv8.4-a+fp16`); sửa file này thì xóa bản build cũ của `whisper-rs-sys` ở cả hai profile | 07, 08 | Có từ GĐ0; 07 kiểm `system_info` trong CI; 08 chạy trên máy M1 (C6) | chưa làm |
| 210 | `llama-server` trên Windows build với `GGML_BACKEND_DL` và `GGML_CPU_ALL_VARIANTS` | 07 | R11 | chưa làm |
| 211 | Phương án MVP: `llama-server` trên macOS tự build tĩnh (Metal, `GGML_NATIVE=OFF`) hay kèm các file `.dylib` ký cùng Team ID | 07 | 07 chọn; nghiêng về build tĩnh vì ít file phải ký và kiểm SHA-256 | chưa làm |
| 212 | Engine mới phải chạy đúng model: llama.cpp nạp và chạy đúng GGUF của Hy-MT2; `whisper-rs` có `audio_ctx` và API mức thấp; bản vá ở `third_party/` áp được lên bản mới | QƯ | Mục 6.7 | chưa làm |
| 213 | Yêu cầu build: `protoc`, CMake, bộ dịch C/C++ (Xcode, Visual Studio Build Tools), libclang (LLVM trên Windows), Vulkan SDK | 07 | Có từ GĐ0 (kế hoạch 0-01); 07 cài trên CI | chưa làm |
| 214 | Phương án MVP: thư viện C runtime trên Windows, link tĩnh CRT (`-C target-feature=+crt-static`) hay kèm bộ cài VC++ Redistributable | 07 | Chờ C9; R12; 02a QĐ32: cờ `/DEPENDENTLOADFLAG:0x800` buộc `VCRUNTIME140.dll` nằm trong System32 (mục 2.7) | chưa làm |
| 215 | Sau mỗi lần cài hoặc nâng cấp: build lại toàn bộ, chạy hết test, `cargo audit`, `cargo deny`, `pnpm audit`; nâng `candle-core` hoặc `candle-onnx` thì chạy `vad_reference` với `--include-ignored`; đụng engine hoặc model thì chạy lại benchmark | QƯ | Mục 6.1, 6.2, 6.7 | chưa làm |
| 216 | Khóa phiên bản: commit lockfile; ghi rõ phiên bản llama.cpp và whisper.cpp đang dùng; chỉ nâng khi chủ động quyết | QƯ | | chưa làm |
| 337 | Luật tuổi phát hành: chọn bản ổn định mới nhất đã ra ít nhất 1 ngày, áp cho cả gói npm lẫn crate; không bao giờ commit `minimumReleaseAgeExclude`; crate mới nhất chưa đủ 1 ngày thì khóa bản trước bằng `cargo update --precise` | QƯ | Mục 6.1; spec §6.12 sửa ngày 2026-10-01 | chưa làm |
| 354 | Thư viện C oniguruma trong tiến trình chính (qua `candle-core` 0.11 → `tokenizers` feature `onig`): giữ, hay 07 thử bỏ feature `onig` khi nâng candle | CDA, 07 | Điểm cần quyết 2 của 02a, chủ dự án chưa quyết. 02 giữ như Giai đoạn 0 | chưa làm |

### 4.18 Luồng xử lý, đa luồng, chống nghẽn (§7)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 217 | Các luồng: callback thu âm (realtime); luồng tiền xử lý và VAD; luồng nhận dạng; luồng dịch; luồng phụ đề (nơi duy nhất phát sự kiện phụ đề); hai tiến trình phụ; pipeline dùng luồng riêng và client đồng bộ, không dùng tokio | 02 | Spec §7 sửa ngày 2026-10-01 (02a QĐ1); b2 `aaeca34` | xong |
| 218 | Hàng đợi từ VAD sang nhận dạng chứa tối đa 3 đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ bỏ đoạn khi độ trễ vượt 20 giây (`dropped`) | 02 | b1 `4383c00`, b2 `aaeca34` | xong |
| 219 | Độ trễ bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý; vượt 6 giây thì hiện chỉ báo "Đang trễ" | 02, 03 | 02: b1 `4383c00`, b2 `aaeca34`; 03: b2 `39ff6f9` | xong |
| 220 | Hàng đợi dịch chứa tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ vào một request, và gộp phụ đề tương ứng thành một (lấy `start_ms` của câu đầu, `end_ms` của câu cuối) | 02 | b1 `4383c00`, b2 `aaeca34` | xong |
| 221 | Câu chờ dịch quá 20 giây thì bỏ bước dịch, chỉ hiện câu gốc (`skipped`) | 02 | b1 `4383c00`, b2 `aaeca34` | xong |
| 222 | Số đo từng phiên (thời gian cắt đoạn, nhận dạng, dịch, tổng thể) lưu trên máy, không gửi đi; xem được trong bảng debug ẩn và trong log | 02, 03 | Đ17; 02: b1 `4383c00`, b2 `aaeca34`, c3 `45ccd02`; 03: a9 `1b4fb11`, b6 `7a2e57e` | xong |
| 338 | Mọi ngưỡng của §6.3–§6.5 và §7 gom trong `PipelineConfig`, mặc định là số đã chốt; 04 nạp phần muốn đổi từ manifest đã ký; giá trị vô lý bị từ chối; `vadEndSilenceMs` ghi đè ngưỡng im lặng | 02, 04 | 02a QĐ21; 02: a2 `b0eb41f`, c3 `45ccd02`; 04: T1 `855237e`, T9 `8151435` | xong |
| 353 | Bấm Dừng không chờ luồng nhận dạng và luồng dịch: tiến trình phụ treo giữa request thì phiên mới chờ request cũ hết thời gian chờ (30 giây với `asr-worker`, 120 giây với `llama-server`); hay Dừng kill luôn tiến trình phụ đang treo | CDA, 02 | Điểm cần quyết 7 của 02a, chủ dự án chưa quyết. 02 đã làm theo cách không chờ (02a QĐ10, `aaeca34`) | chưa làm |

### 4.19 Hiệu năng và cấu hình máy (§8)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 223 | Hạng máy: khuyến nghị (Apple Silicon RAM 16 GB; Windows RAM 16 GB và card rời Vulkan VRAM từ 6 GB); tối thiểu (Apple Silicon RAM 8 GB; Windows RAM 8 GB, CPU 4 nhân có AVX2); chưa hỗ trợ (Mac Intel, ARM64, CPU không AVX2, RAM dưới 8 GB) | 04, 07 | Chờ C8; 04 báo máy chưa được hỗ trợ (Đ13); 07 chỉ build arm64 và x64; 04: T5 `8a439d3`, T8 `adb1e7b`, T11 `1797cd1` (báo máy chưa được hỗ trợ, từ chối lệnh tải); còn C8, 07 | chờ |
| 224 | Khi chọn gói, ghi chú chất lượng nhận dạng theo gói, và khuyến nghị gói Chuẩn cho người nghe chủ yếu tiếng Việt, Nhật, Hàn, Trung | 04 | 04: T2 `1be9efa`, T11 `1797cd1` | xong |
| 225 | Ngân sách độ trễ theo bước và mục tiêu p50, p90 trên máy khuyến nghị và máy tối thiểu | 02, 08 | 02 chạy lại S6 sau thay đổi lớn (mục 6.7); 08 đo trên máy tham chiếu; chạy lại S6 chờ 02b Task 9 (cần máy rảnh) | chờ |
| 226 | Nếu S6 xác nhận M1 cơ bản không đạt: nâng hạng máy khuyến nghị, hoặc dùng Q4_K_M cho bước dịch và giữ whisper turbo trên máy băng thông thấp | 04, CDA | Chờ C8, Q15; manifest cho phép thêm tổ hợp gói (Đ7); 04: T5 `8a439d3` (test gói lai, thêm bằng manifest); còn CDA (Q15), C8 | chờ |
| 227 | RAM: thiếu RAM khi chạy `llama-server` bằng CPU thì thử `--no-repack` | 02, 08 | 02 cho phép truyền thêm tham số cho `llama-server`; 08 đo trên máy chỉ có CPU; 02: d1 `8159852`, d3 `4268836` (`extra_args`); còn 08 | đang làm |
| 228 | VRAM trên Windows: gói Chuẩn khoảng 4,2–5 GB, nên ngưỡng đề xuất 6 GB; gói Nhẹ khoảng 2,9 GB, vừa card 4 GB | 04, 08 | Chờ C7; 04: T2 `1be9efa` (ngưỡng trong manifest); chờ C7, 04b Task 14 (Windows, cần máy Windows và người), 08 | chờ |
| 229 | Mục tiêu tải máy: CPU trung bình ≤ 30% trên máy khuyến nghị khi người trong cuộc họp nói liên tục | 08 | Mục 6.9 | chưa làm |

### 4.20 Xử lý lỗi (§9)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 230 | macOS chưa cấp quyền ghi âm thanh hệ thống (tạo tap lỗi, hoặc buffer toàn im lặng kèm trạng thái quyền): hiện màn hình hướng dẫn, có nút mở System Settings | 02, 01, 02 (người) | Kết quả C1, dòng 2; 01: Task 21 `360b067` (khung bước); 02: c2 `1064c5a`, c6 `7410e7d`; chờ C1 (02c Task 8, người) | chờ |
| 231 | Đang dịch mà hơn 60 giây không có âm thanh vào (theo RMS, kể cả phần im lặng được chèn): thanh phụ đề hiện "Không nghe thấy âm thanh" kèm gợi ý | 02, 03 | 02: b2 `aaeca34`; 03: b2 `39ff6f9` | xong |
| 232 | Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth), phát hiện bằng hỏi định kỳ 500 ms và `AudioSource::failed`: tự khởi tạo lại việc thu âm trong ≤ 2 giây | 02, 02 (Win) | Kết quả C1 dòng 9, C2 dòng 9; 02: b5 `c6ee52b`, c2 `1064c5a`; chờ C1 (02c Task 8, người), C2 (02c Task 9, Win) | chờ |
| 233 | Model thiếu hoặc hỏng: lúc khởi động chỉ kiểm có file và đúng kích thước; SHA-256 đầy đủ kiểm sau khi tải xong và khi nạp model lỗi; đề nghị tải lại | 04, 02 | 02: c3 `45ccd02` (kiểm có file); 04: T4 `d3ebbc5`, T8 `adb1e7b`, T9 `8151435` | xong |
| 234 | `asr-worker` không chạy hoặc bị crash (mã thoát, hoặc hết thời gian chờ): tự khởi động lại theo §6.4 | 02 | d3 `4268836` | xong |
| 235 | `llama-server` không chạy hoặc bị crash (mã thoát, hoặc `/health` báo lỗi): tự khởi động lại theo §6.5; quá giới hạn thì báo lỗi, chỉ hiện câu gốc | 02 | d3 `4268836`, b2 `aaeca34` | xong |
| 236 | GPU khởi tạo lỗi, hoặc máy Windows không có Vulkan: chạy `asr-worker-cpu`, `llama-server` chạy bằng CPU, báo "Đang chạy bằng CPU (chậm hơn)" | 02 (Win), 02 | 02: d3 `4268836`, c3 `45ccd02`; chờ C3 (02c Task 9, Win) | chờ |
| 237 | Thiếu RAM hoặc VRAM (RAM trống thấp, hoặc tiến trình phụ báo hết bộ nhớ, kể cả bộ nhớ GPU): đề xuất chuyển sang gói Nhẹ | 02, 04 | Dùng `Error.kind` là `OutOfMemory`; 02: a1 `e963cdb`, d3 `4268836`, c3 `45ccd02`; 04: T9 `8151435`, T11 `1797cd1` | xong |
| 238 | Trễ dồn lại (độ trễ > 6 giây): hiện chỉ báo và áp chính sách ở §7 | 02, 03 | 02: b1 `4383c00`, b2 `aaeca34`; 03: b2 `39ff6f9` | xong |
| 239 | Hết hạn mức (Free 10 phút hôm nay; Professional, X2 hạn mức chu kỳ): dừng phiên với `quota_exhausted`, báo thời điểm reset, kèm nút nâng gói | 06, 03 | 03: b2 `39ff6f9`; 06: a8 `f73386c`, b4 `d266be5` | xong |
| 240 | License không hợp lệ, hết hạn hoặc bị thu hồi: về Free, báo rõ lý do | 06 | 06: a7 `14e4750`, b1 `b7b3e86`, b4 `d266be5` | xong |
| 241 | Mất mạng đúng lúc cần kiểm tra license: giữ gói trả phí trong 14 ngày ân hạn | 06 | 06: a7 `14e4750`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) (mất mạng) | chờ |
| 242 | Key đã kích hoạt đủ 2 máy (`activate` trả `409`): hiện danh sách máy (tên máy, lần dùng gần nhất), cho gỡ một máy rồi kích hoạt máy đang dùng; vượt giới hạn gỡ thì hướng dẫn liên hệ hỗ trợ | 05, 06 | 05: Task 14 `bb1691c`; 06: a9 `61f5ec3`, b2 `693d422`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) | chờ |
| 243 | Khách đã chuyển khoản nhưng webhook đến chậm hoặc bị mất: app hỏi trạng thái đơn mỗi 3 giây; server đối soát bằng `GET /v2/payment-requests/{id}` theo lịch giãn: cron mỗi 5 phút, đơn `pending`, `processing`, `underpaid` trong 24 giờ; giờ đầu hỏi mỗi lần cron (cách nhau ít nhất 4 phút), sau đó mỗi giờ; tối đa 50 đơn mỗi lần | 05, 06 | Cron Trigger; spec §9 sửa theo 05 QĐ9; 05: Task 15 `e6b3230`; 06: a9 `61f5ec3` | xong |
| 244 | Webhook bị gửi trùng: xử lý idempotent, mỗi đơn chỉ cấp hoặc gia hạn license một lần | 05 | 05: Task 13 `b6cb210` | xong |
| 245 | Khách chuyển thiếu tiền, hoặc link thanh toán hết hạn: không cấp license, hiện hướng dẫn liên hệ hỗ trợ; hỗ trợ cấp tay khi khách đã chuyển bù | 05, 06 | 05: Task 13 `b6cb210`, Task 15 `e6b3230`, Task 16 `45b5305`; 06: a9 `61f5ec3`, b1 `b7b3e86`, b3 `15d8252` | xong |
| 246 | Tải model thất bại (lỗi HTTP hoặc sai SHA-256): thử lại 3 lần, cho phép tải tiếp sau | 04 | 04: T3 `713c3be`, T8 `adb1e7b` | xong |
| 247 | Bản dịch lỗi (quá dài, có kèm lời giải thích): cắt stream, thử lại một lần với repeat penalty cao hơn, sau đó hiện câu gốc | 02 | d2 `00e1613` | xong |

### 4.21 Quyền riêng tư và pháp lý (§10.1)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 248 | Âm thanh chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng | 02, 08 | Công cụ `capture` của GĐ0 ghi WAV, không được vào bộ cài (07); 02: c2 `1064c5a`; còn 08 | đang làm |
| 249 | App chỉ kết nối mạng để tải manifest và model, kiểm tra cập nhật, gọi license server; không analytics, không gửi báo cáo crash; log nằm trên máy, người dùng tự gửi khi cần hỗ trợ | QƯ, 01, 08 | 01 nút mở thư mục log (Đ10); 08 kiểm qua proxy; 01: Task 17 `b89f22e`, Task 21 `360b067`; thử tay chờ 01 Task 24 dòng 24 (người); còn 08 | chờ |
| 250 | `llama-server` chỉ nghe `127.0.0.1`, API key ngẫu nhiên tạo mỗi lần chạy, truyền qua biến môi trường; `asr-worker` không mở cổng mạng | 02 | d1 `8159852` | xong |
| 251 | Khóa API của PayOS (client id, api key, checksum key) chỉ nằm trên license server, lưu dạng secret | 05 | 05: Task 2 `5b61614` (`secrets.required`); nhập secret chờ 05 Task 19, 21 (người; T5) | chờ |
| 252 | Lịch sử chép lời mặc định tắt, chỉ lưu trên máy, xóa toàn bộ được bằng một nút | 01, 03 | 01: Task 4 `7d828f0` (`saveHistory` mặc định tắt); 03: a7 `a067dce`, a9 `1b4fb11`, b3 `2e8f3ab` | xong |
| 253 | Không có tài khoản đăng nhập; server chỉ lưu email, thời điểm đồng ý, đơn hàng, license, mã băm ID máy, `device_label`, thời điểm kiểm tra gần nhất; không nhận số tài khoản ngân hàng của khách; không gửi email người mua sang PayOS | 05 | 05: Task 3 `b5c7607` | xong |
| 254 | Khi mua, người dùng tick đồng ý cho xử lý email vào đúng mục đích (`consent: true` của checkout) | 06, 05 | 05 lưu thời điểm đồng ý: Task 12 `9f84646`; 06: a9 `61f5ec3`, b3 `15d8252` | xong |
| 255 | Chính sách quyền riêng tư ghi rõ dữ liệu nào được lưu, được giữ không thời hạn, và cách yêu cầu xóa; dữ liệu cá nhân giữ vĩnh viễn, không có cron tự xóa hay tự ẩn danh; xóa theo yêu cầu bằng thao tác admin chạy tay | CDA, 05 | Q9 chốt 2026-10-01; nội dung thuộc website (Q8); hỏi luật sư về việc giữ không thời hạn (§15); 05: Task 15 `e6b3230`, Task 16 `45b5305`; chính sách chờ Q8 | chờ |
| 256 | Chuyển dữ liệu cá nhân ra nước ngoài (D1, Resend): hồ sơ đánh giá tác động nếu thuộc diện | CDA, 05 | Hỏi luật sư (§15); 05 ghi rõ nơi lưu dữ liệu ở mục "Nơi lưu dữ liệu cá nhân" của 05; hồ sơ chờ CDA | chờ |
| 257 | Giấy phép bên thứ ba liệt kê ở màn hình Giới thiệu và file `THIRD_PARTY_NOTICES`; danh sách sinh tự động từ `Cargo.lock` và `pnpm-lock.yaml` (ví dụ `cargo about`), kiểm ở CI bằng `cargo deny` | 07, 01 | Gồm cả thư viện vẽ mã QR và font chữ; 01: Task 21 `360b067` (chỗ cho danh sách ở màn hình Giới thiệu); còn 07 | đang làm |
| 258 | Giấy phép model: Hy-MT2 Apache 2.0 kèm LICENSE và NOTICE, ghi chú đã sửa đổi nếu tự nén lại; trọng số Whisper MIT; Silero VAD MIT | 04, 07 | 04: T2 `1be9efa` (LICENSE, NOTICE trong manifest); chờ 04b Task 13 (tải lên R2) và 07 (`THIRD_PARTY_NOTICES`) | chờ |
| 259 | Không dùng tài sản nào của RTranslator; nếu chép code thì giữ thông báo Apache 2.0 | QƯ, 07 | 07 rà lại khi sinh danh sách giấy phép | chưa làm |
| 260 | Nhãn hiệu: chỉ nhắc Teams, Zoom, Meet để mô tả khả năng tương thích, kèm câu miễn trừ "không liên kết với các công ty này" | 01 | 01: Task 21 `360b067` | xong |
| 339 | Hóa đơn điện tử chưa làm trong MVP: server không gửi thông tin người mua sang PayOS, app không có ô nhập; làm sau MVP | 05, 06, CDA | Q10 chốt 2026-10-01; 05: Task 8 `5d628e2` (QĐ23); 06: b3 `15d8252` | xong |

### 4.22 Bảo mật và chống sao chép (§10.2)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 261 | App không chứa bí mật nào, chỉ có khóa công khai (token bản quyền, manifest model, bản cập nhật); mọi khóa bí mật nằm trên server hoặc trong hệ thống ký của CI | QƯ | Mục 6.5 | chưa làm |
| 262 | Không đầu tư quá tay vào chống crack | 06 | 06: a8 `f73386c`, a10 `3d326e8` | xong |
| 263 | Crack để dùng Pro: kiểm tra bản quyền ở nhiều chỗ trong Rust, không dồn vào một biến đúng/sai; bản phát hành bật `strip`, `lto`, `codegen-units = 1`, `panic = "abort"`; làm rối các chuỗi liên quan tới bản quyền | 06 | Profile release có từ GĐ0; 06: a8 `f73386c` (kiểm ở nhiều chỗ; làm rối chuỗi chưa làm, QĐ27, ghi rủi ro chấp nhận ở §10.2) | xong |
| 264 | Sửa hoặc ký lại file của app: lúc khởi động tự kiểm chữ ký (macOS `SecStaticCodeCheckValidity` kèm Team ID; Windows `WinVerifyTrust` và tên chủ chứng thư); sai thì chỉ chạy Free, báo "Bản cài không chính hãng" kèm link tải chính thức; bản dev bỏ qua | 06, 07 | Đ14; chờ T1, T2; 06: a10 `3d326e8`, b1 `b7b3e86`; Team ID và tên chủ chứng thư thật chờ 07 (Đ14, T1, T2); 06b Task 7 (Windows, cần người) | chờ |
| 265 | Chỉnh đồng hồ (lùi, tới trước, đổi múi giờ): lưu mốc thời gian lớn nhất từng thấy; giờ hiện tại nhỏ hơn mốc quá 10 phút thì không reset hạn mức, coi token là phải kiểm online lại, nhắc chỉnh giờ; chu kỳ mới của gói trả phí chỉ bắt đầu khi đã có token có `issued_at` qua mốc đầu chu kỳ | 06 | 06: a4 `37e7536`, a7 `14e4750`, a8 `f73386c`, b1 `b7b3e86`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) (đổi giờ thật) | chờ |
| 266 | Sửa hoặc xóa trạng thái bản quyền và bộ đếm hạn mức: lưu trong kho khóa của hệ điều hành, không lưu file thường; Windows lưu với `persistence = Local` | 06, 01 | `persistence = Local` theo 01 QĐ8, đã vào spec §10.2; 01: Task 8 `eadeab1`, sửa `9998752`, `d11d343`; chờ 01 Task 24 dòng 26 (người), 01 Task 25 dòng 14–14a (Win); 06: a5 `6864e50`; còn thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) và 06b Task 7 (Windows, cần người) | chờ |
| 267 | Chia sẻ hoặc bán lại key: tối đa 2 máy, kích hoạt lại cùng máy không tốn suất; khóa tạm: đếm lần gỡ do người dùng trong 30 ngày (từ lần mở khóa gần nhất, trừ lần gỡ chính máy đang kích hoạt), hơn 3 thì `423 license_locked` cho mọi máy không đang kích hoạt, máy đang kích hoạt vẫn dùng được; key sinh ngẫu nhiên ít nhất 128 bit, có ký tự kiểm tra | 05, 06 | 06 kiểm ký tự kiểm tra khi người dùng gõ key, xử lý `423`; 05: Task 5 `5c33455`, Task 14 `bb1691c`; 06: a6 `cfa28fe`, a7 `14e4750` | xong |
| 268 | Dò key hoặc spam: `activate` ≤ 10 lần/giờ/IP, `validate` ≤ 30 lần/giờ/key (key đã chuẩn hóa), `checkout` ≤ 10 lần/giờ/IP, `recover` ≤ 3 lần/giờ/email và ≤ 10 lần/giờ/IP, `deactivate` ≤ 10 lần/giờ/IP, hỏi đơn ≤ 600 lần/giờ cho mỗi cặp IP và đơn; vượt thì trả `429` kèm `Retry-After`; bộ đếm chỉ lưu HMAC có pepper; 60 lần thất bại trong 1 giờ thì chặn IP, khi đó chỉ cho qua `validate` và `deactivate` có key hợp lệ kèm activation đang hoạt động (CGNAT) | 05, 06 | 06 luôn gửi `activation_id`, không coi `429` ở `activate` là key sai; 05: Task 10 `ffd9c8d`, Task 12 `9f84646`, Task 14 `bb1691c`; 06: a6 `cfa28fe`, a7 `14e4750` | xong |
| 269 | Bị clone, đổi thương hiệu: đăng ký nhãn hiệu, EULA (pháp lý); logic quan trọng nằm trong Rust, JavaScript chỉ lo hiển thị và được rút gọn; manifest, bản cập nhật, token ký bằng khóa riêng | CDA, 02, 03, 07 | EULA chờ Q8; 02: logic của pipeline nằm trong Rust (a1–a3, d1–d3, c1–c4); 03: a4 `4d2980a`, a6 `7ed54a3`, a7 `a067dce`; còn 07 | đang làm |
| 270 | Bản giả có mã độc: ký và notarize mọi bản phát hành; chỉ phát hành qua tên miền chính thức; website công bố SHA-256 của từng bộ cài | 07, CDA | 07 sinh SHA-256; trang công bố thuộc website | chưa làm |
| 271 | Tấn công qua WebView: capabilities từng cửa sổ (`overlay` chỉ nhận sự kiện phụ đề, kéo cửa sổ, và gọi đúng một lệnh đọc `get_overlay_view`; không có lệnh khóa); CSP chặt, không `unsafe-eval`, không script ngoài; chặn điều hướng ra ngoài app, chặn `blob:` và cửa sổ mới; link ngoài chỉ mở bằng trình duyệt hệ thống khi là `https` tới tên miền trong danh sách cho phép; tắt devtools ở bản phát hành; mọi dữ liệu từ giao diện được kiểm kiểu và phạm vi | 01, 06, 07, QƯ | Spec §10.2 sửa theo 01 QĐ5, QĐ22; 06 thêm trang thanh toán vào danh sách, 07 thêm website; mỗi lệnh mới phải khai quyền và kiểm input; 01: Task 11 `7d0e517`, Task 17 `b89f22e`, sửa `e501a61`; thử tay chờ 01 Task 24 dòng 25, 30 (người); còn 07; 06: a9 `61f5ec3` (`EXTERNAL_HOSTS`) | chờ |
| 272 | Thay tiến trình phụ, chèn thư viện giả: kiểm SHA-256 của file thực thi và thư viện ggml theo danh sách build sẵn; Windows gọi `SetDefaultDllDirectories` ở tiến trình chính và `asr-worker`; macOS bật hardened runtime có library validation, mọi file thực thi và `.dylib` ký cùng Team ID | 02, 02 (Win), 07 | Đ15; 02: a1 `e963cdb`, c1 `518d222`, c3 `45ccd02`; phần Windows chờ C14 (02c Task 9, Win); hardened runtime ở 07 | chờ |
| 273 | Lộ nội dung cuộc họp: lịch sử mã hóa bằng SQLCipher, khóa ngẫu nhiên trong kho khóa; log không bao giờ chứa nội dung chép lời; file xuất do người dùng tự quản lý | 03, 02 | 02: a1 `e963cdb`, b2 `aaeca34` (log không có chữ chép lời); 03: a3 `3d9c42f`, a7 `a067dce`, a9 `1b4fb11` | xong |
| 274 | Tấn công license server: chỉ HTTPS (kiểm trong Worker); kiểm chữ ký webhook, xử lý idempotent; prepared statement của D1, kiểm mọi input; secret lưu bằng Wrangler secrets; không để dữ liệu nhạy cảm trong URL (`order_token` trong header, tắt invocation log, bỏ query khỏi log); `/admin/*` ở Worker riêng sau Access, tự kiểm danh tính, chống CSRF; nhật ký mọi thay đổi license; cảnh báo người vận hành 4 loại (`many_failures`, `webhook_bad_signature`, `email_failed`, `license_locked`), tối đa một email mỗi giờ mỗi loại | 05 | 05: Task 2–18 (`5b61614` … `5664b1b`), Task 17 `6c94641`; hộp thư nhận cảnh báo chờ P05-5; Access chờ 05 Task 19 (người) | chờ |
| 275 | Lộ khóa ký token: token có `kid` có số thứ tự (`<môi trường>-<năm>-<tháng>-<số thứ tự>`, không dùng lại); hai ô secret `TOKEN_SIGNING_KEY_A`, `TOKEN_SIGNING_KEY_B` của Worker API, biến thường `TOKEN_SIGNING_SLOT` chọn ô đang ký, ô kia là khóa dự phòng; tạo bằng pipe thẳng vào `wrangler secret put`, không lưu trên máy người vận hành, không dùng kho mật khẩu; app build sẵn khóa công khai của cả hai ô (`server/keys/public-keys.json`, ghi theo ô); đổi khóa: đổi `TOKEN_SIGNING_SLOT`, tạo khóa mới ở ô vừa rảnh, bản cập nhật app mang khóa công khai mới | 05, 06, 07 | Q11 và P05-6 chốt 2026-10-01; tên theo ô vì secret không đọc lại được (05 QĐ29); 05: Task 6 `68ca378`, Task 7 `6940335`, Task 11 `29237cb`; tạo khóa thật chờ 05 Task 19, 21 (người); còn 07; 06: a1 `3f570c9` (`keys.rs`, ô `a`, `b`) | chờ |
| 276 | Rủi ro chuỗi cung ứng: không khóa ký nào nằm trên máy dev; bản phát hành build và ký trong CI từ tag đã commit; CI chạy `cargo audit`, `cargo deny`, `pnpm audit`, bật Dependabot; llama.cpp và whisper.cpp build trong CI từ tag đã khóa, có kiểm checksum | 07, QƯ | Chờ T3 | chưa làm |

### 4.23 Kiểm thử (§11)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 277 | Unit: resample và gộp kênh; trộn hai thiết bị Windows có lệch đồng hồ | 02 | Có từ GĐ0 (`audio-capture`) | xong |
| 278 | Unit: chèn im lặng khi luồng loopback không trả gói dữ liệu | 02, 02 (Win) | Có từ GĐ0 (`gapfill.rs`, `tests/edge.rs`); 02 thêm test cho `windows.rs`; 02: b5 `c6ee52b` (`ClockFiller`); test `windows.rs` chờ C2 (02c Task 9, Win) | chờ |
| 279 | Unit: cắt câu với tín hiệu tổng hợp (im lặng, tiếng nói, nhạc, đoạn bị cắt ở 8 giây) | 02 | Có từ GĐ0, trừ ca nhạc; ca nhạc: b6 `9d6c7fd` (`gd1_no_speech.md`); bộ nhạc chờ chủ dự án duyệt (dòng 351) | xong |
| 280 | Unit: VAD chạy dài không tăng bộ nhớ (`vad_reference` bỏ qua mặc định; `debug_assert!` trong `SileroVad::prob`) | 02 | Có từ GĐ0 | xong |
| 281 | Unit: ghép câu tạm (cửa sổ ghép theo `vadEndSilenceMs`, trần 15 giây hoặc 3 đoạn, đoạn khác ngôn ngữ không ghép) | 02 | Chuyển test từ `latency-bench`; a2 `b0eb41f` | xong |
| 282 | Unit: chọn ngôn ngữ trong tập cho phép, giữ ngôn ngữ đoạn trước, ngưỡng 0,9 cho đoạn ngắn hơn 1,5 giây | 02 | Có từ GĐ0 (`lid.rs`); sửa theo `prev_lang`; a1 `e963cdb` | xong |
| 283 | Unit: giao thức stdin/stdout (đóng gói, giải mã, thông điệp hỏng hoặc bị cắt, khung thừa byte, chỉ số biến thể cố định) | 02 | Có từ GĐ0; thêm ca cho trường mới; a1 `e963cdb` | xong |
| 284 | Unit: giải mã của `asr-worker` (công thức `audio_ctx` có sàn 512, luật lặp theo độ dài mẫu, trần số token) | 02 | Có từ GĐ0 | xong |
| 285 | Unit: luật bỏ đoạn ở tiến trình chính theo `no_speech_prob` và `avg_logprob` | 02 | a2 `b0eb41f`, a3 `4242745` | xong |
| 286 | Unit: tạo prompt (nhánh tiếng Trung và không tiếng Trung, tên ngôn ngữ của từng mẫu); khớp thuật ngữ tiếng Việt có dấu và chữ Trung, Nhật, Hàn | 02, 03 | Prompt có từ GĐ0, 02 không đổi; 03: a4 `4d2980a` | xong |
| 287 | Unit: hậu xử lý bản dịch khi đang stream (lọc nhãn và ngoặc kép, ngưỡng tỉ lệ token theo cặp, thử lại với tham số khác) | 02 | d2 `00e1613` | xong |
| 288 | Unit: các trạng thái của phụ đề, kể cả `same_lang`, `skipped`, `dropped` | 02 | b1 `4383c00`, b2 `aaeca34` | xong |
| 289 | Unit: hạn mức theo spec §11 (cách đếm phút theo `speech_ms`; Free reset theo ngày và "đồng hồ thật", header `Date`, Free cộng phút của gói trả phí; `n` theo `issued_at`, hẹn `validate` lại, offline qua mốc; chu kỳ cuối ngắn; khóa bộ đếm có `quota_epoch`; ba trường hợp mất bản ghi và máy kích hoạt mới thật; chạm hạn mức; X5 không giới hạn) | 06 | 06: a4 `37e7536`, a7 `14e4750` | xong |
| 290 | Unit: trạng thái bản quyền (ân hạn, thu hồi, tự làm mới token khi app chạy liên tục quá 24 giờ) | 06 | 06: a7 `14e4750` | xong |
| 291 | Unit: manifest và SHA-256 | 04 | 04: T1 `855237e`, T2 `1be9efa`, T3 `713c3be`, T4 `d3ebbc5` | xong |
| 292 | Test giao diện (vitest): i18n đủ khóa cả vi lẫn en; hiển thị thanh phụ đề. Các hàm xuất file viết và test phía Rust (`transcript/export.rs`) | 01, 03 | Spec §11 sửa theo Q12; 01: Task 14 `15d753d`; 03: a6 `7ed54a3`, b1 `ccb59c2`, b2 `39ff6f9` | xong |
| 293 | License server, unit: HMAC-SHA256 với dữ liệu mẫu của PayOS; webhook idempotent; chỉ cấp khi `PAID`, `amountPaid` ≥ `amount` và `amount` khớp đơn; mua thêm cùng gói; đổi gói (công thức quy đổi, hai ví dụ của spec §6.8); "hiện tại" là `transactionDateTime` kẹp trong thời hạn link; giới hạn 2 máy, kích hoạt lại cùng máy, gỡ từ xa; khóa tạm `423`; chặn IP và CGNAT; `recover` luôn trả `200`; ký và kiểm token Ed25519 có `cycle_anchor`, `quota_minutes_per_cycle`, `quota_epoch`, `activation_created_at`; reset hạn mức của máy; phân loại lỗi email | 05 | 05: Task 6 `68ca378`, Task 8 `5d628e2`, Task 12 `9f84646`, Task 13 `b6cb210`, Task 14 `bb1691c`, Task 16 `45b5305`; 360 test qua sau đợt D | xong |
| 294 | License server, tích hợp: PayOS trên môi trường test nếu có, không có thì giao dịch số tiền nhỏ | 05, 05 (người) | R14; chờ 05 Task 20 (người; T5, P05-1, T6) | chờ |
| 295 | Tích hợp: chạy pipeline từ file WAV, kiểm phụ đề có xuất hiện, đúng thứ tự, đúng thời gian | 02 | Clip ở `tests/fixtures/audio/` (Đ20); b2 `aaeca34`, b3 `a1143b0` | xong |
| 296 | Tích hợp: vòng đời hai tiến trình phụ (đúng thứ tự, giả lập crash, tự khởi động lại, gửi lại đoạn, chuyển CPU sau 2 lần crash khi dùng GPU, tắt sau 10 phút không dịch) | 02 | d3 `4268836`, thêm test `9aace29` | xong |
| 297 | Benchmark: đo COMET, chrF++ và độ trễ từng bước cho mỗi gói; chạy trước mỗi lần đổi model hoặc engine; ngưỡng theo A2–A4 | QƯ, 08 | Mục 6.7 | chưa làm |
| 298 | Thủ công: hệ điều hành macOS 14.2+, 15, 26, 27; Windows 10, 11 | 08 (người) | | chưa làm |
| 299 | Thủ công: app họp Teams, Zoom, Meet (Chrome, Edge, Safari), Zalo PC | 08 (người) | | chưa làm |
| 300 | Thủ công: thiết bị phát là loa, tai nghe có dây, tai nghe Bluetooth | 08 (người) | | chưa làm |
| 301 | Thủ công: app họp ở chế độ toàn màn hình, và máy có nhiều màn hình | 08 (người), 03 | 03: thanh phụ đề xong code (b2); thử tay chờ 03b Task 8 (Mac, người), Task 9 (Windows); 08 nghiệm thu | chờ |
| 302 | Thủ công: máy Windows không có Vulkan (ví dụ máy ảo) vẫn mở được app, dùng `asr-worker-cpu`, `llama-server` chạy bằng CPU | 02 (Win), 08 (người) | chờ C3 (02c Task 9, Win); 08 | chờ |
| 303 | Thủ công: card rời 4 GB và 6 GB được đề xuất đúng gói; chọn gói Chuẩn trên card 4 GB thì `llama-server` tự chuyển bớt lớp sang CPU, không hết bộ nhớ | 04 (Win), 08 (người) | 04: T11 `1797cd1` (đề xuất theo RAM và VRAM); chờ 04b Task 14 (Windows, cần máy Windows và người), 08 | chờ |
| 304 | Thủ công: khoảng lặng dài trên Windows (tạm dừng video, không ai nói), câu cuối vẫn được chốt, thời gian phụ đề không lệch | 02 (Win), 08 (người) | chờ C2 (02c Task 9, Win); 08 | chờ |
| 305 | Thủ công, khay: bấm X thì cửa sổ ẩn, phiên không dừng; Thoát ở khay thì không còn tiến trình phụ nào; `⌘Q` và Quit ở Dock không thoát; tắt máy hoặc đăng xuất không bị chặn; nút ở bước 8 mở đúng trang Taskbar | 01 (người), 02, 08 | 01: Task 10 `2c71e0c`, Task 17 `b89f22e`; 02: c3 `45ccd02`; thử tay chờ 01 Task 24 dòng 13–17 (người), 01 Task 25 dòng 2, 3, 11 (Win), 02c Task 8 Step 9 (người); 08 | chờ |
| 306 | Soak test: phát liên tục 2 giờ âm thanh cuộc họp, theo dõi RAM, CPU, GPU | 08 (người) | A5 | chưa làm |
| 307 | Cài đặt và cập nhật: cài mới, nâng cấp từ bản trước, gỡ app (Windows tick "xóa dữ liệu app" thì model bị xóa; macOS dùng nút "Xóa model và dữ liệu"); kiểm chữ ký qua Gatekeeper và SmartScreen | 07, 08 | Chờ T1, T2 | chưa làm |
| 308 | Bảo mật: sửa một byte trong file thực thi, hoặc ký lại bằng chứng thư khác, thì app chỉ chạy Free và báo "Bản cài không chính hãng" | 06, 07, 08 | Chờ T1, T2; 06: a10 `3d326e8`, b1 `b7b3e86`; chờ T1, T2 (07) | chờ |
| 309 | Bảo mật: token bị từ chối khi sai chữ ký, của máy khác, đã quá `refresh_before` hoặc `expires_at`, có `kid` lạ | 06 | 06: a1 `3f570c9` | xong |
| 310 | Bảo mật: chỉnh lùi đồng hồ máy thì app phát hiện, không reset hạn mức, yêu cầu kiểm tra online; chỉnh tới trước qua mốc chu kỳ thì không mở được chu kỳ mới khi chưa có token mới | 06, 06 (người) | Test tự động dùng đồng hồ giả (mục 6.8); 06: a4 `37e7536`, a7 `14e4750`, a8 `f73386c`, b1 `b7b3e86`; thử tay trên Mac với staging chờ 06b Task 6 (cần người và 05 Task 19) (đổi giờ thật) | chờ |
| 311 | Bảo mật: gỡ rồi kích hoạt lại quá ngưỡng thì key bị khóa tạm | 05 | 05: Task 14 `bb1691c` | xong |
| 312 | Bảo mật: cửa sổ `overlay` gọi một lệnh không được cấp (ví dụ lệnh bản quyền) thì Tauri chặn | 01, 06 | 01: Task 17 `b89f22e` (test ACL của overlay); 06: a9 `61f5ec3` (lệnh bản quyền chỉ ở `capabilities/main.json`, test `acl_tests`) | xong |
| 313 | Bảo mật: thay `asr-worker` hoặc `llama-server` bằng file khác thì app từ chối chạy | 02 | c1 `518d222` | xong |
| 314 | Bảo mật: mở file lịch sử bằng công cụ SQLite bên ngoài thì không đọc được nếu không có khóa | 03 | 03: a3 `3d9c42f` | xong |
| 315 | Bảo mật: log của một phiên dịch không chứa nội dung chép lời | 02, 08 | 02: b2 `aaeca34`; kiểm log thật chờ 02c Task 8 Step 10 (người); 08 | chờ |
| 316 | Bảo mật, license server: vượt giới hạn request thì trả `429`; input độc hại (ví dụ SQL injection) bị từ chối; webhook sai chữ ký bị từ chối | 05 | 05: Task 12 `9f84646`, Task 13 `b6cb210`, Task 14 `bb1691c`, Task 17 `6c94641` | xong |
| 317 | Bảo mật, CI: `cargo audit`, `cargo deny`, `pnpm audit` không còn lỗ hổng mức cao | 07 | | chưa làm |

### 4.24 Cấu trúc repo (§12)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 318 | Cây thư mục theo §12: `src/windows/{main,overlay}`, `components/`, `store/`, `lib/ipc.ts`, `i18n/`; `src-tauri/src/` (`session.rs`, `sidecar/`, `models/`, `license/`, `security/`, `transcript/`, `overlay/`, `db.rs`, `glossary.rs`, `settings.rs`, `tray.rs`, `hotkeys.rs`, `i18n.rs`); `capabilities/`; `binaries/`; `crates/`; `third_party/`; `server/`; `bench/`; `tests/fixtures/audio/` | 01, 02, 03, 04, 05, 06, 07 | Mỗi kế hoạch tạo phần của mình; chỗ lệch ghi ở Q12; 01: Task 17 `b89f22e`, Task 21 `360b067`; 02: `session.rs`, `sidecar/`, `capture.rs` (c1 `518d222`, c2 `1064c5a`, c3 `45ccd02`); 05: `server/` Task 2–16 (chỗ lệch: 05 QĐ22); 03: a3 `3d9c42f`, a5 `7c3e57e`, a6 `7ed54a3`, a7 `a067dce` (`db.rs`, `glossary.rs`, `transcript/`); 04: T1 `855237e`, T2 `1be9efa`, T3 `713c3be`, T4 `d3ebbc5`, T5 `8a439d3`, T6 `62a0096`, T7 `76fcbbf`, T8 `adb1e7b` (`models/`); 06: a1 `3f570c9`, a2 `06c9dd7`, a3 `48ddb20`, a4 `37e7536`, a5 `6864e50`, a6 `cfa28fe`, a7 `14e4750`, a8 `f73386c`, a9 `61f5ec3`, a10 `3d326e8` (`license/`); còn 07 | đang làm |
| 319 | `asr-protocol`, `asr-worker`, `audio-capture`, `pipeline` có từ Giai đoạn 0, phần lớn code dùng lại ở MVP | 02 | a1–a3, d1–d3, c1–c4 | xong |
| 320 | Việc cho MVP §12: giữ `audio-capture` và `pipeline` là crate riêng; `src-tauri` chỉ còn phần nối các crate vào app | 02 | Đã chọn ngày 2026-10-01 | xong |
| 321 | Việc cho MVP §12: trước khi tạo `server/`, thêm vào `.gitignore` các mẫu `.dev.vars*`, `.env*`, `*.pem`, `*.p12`, `*.pfx`, `*.key` | 05 | Task đầu của 05; 05: Task 1 `35d758d` | xong |

### 4.25 Lộ trình, giả định, việc còn mở (§13–§15)

| # | Yêu cầu | Kế hoạch | Ghi chú | Trạng thái |
|---|---|---|---|---|
| 322 | §13, Giai đoạn 1: làm F1–F10, license server và tích hợp PayOS, bốn gói và hạn mức, đạt A1–A7 | 00, 08 | Task 5 | chưa làm |
| 323 | §14 giả định 7 (PayOS): webhook và HMAC-SHA256 đúng tài liệu; PayOS không có sandbox nên test bằng giao dịch nhỏ; mô tả đơn ngắn (một số ngân hàng tối đa 9 ký tự), dùng `AT` cộng số đơn tối đa 7 chữ số; dải số đơn staging 1 tới 999.999, production từ 1.000.001, trần 9.999.999 | 05 | Đăng ký merchant đã xong (T5); tiền tố `AT` ở dòng 342; 05: Task 8 `5d628e2`, Task 12 `9f84646`; giao dịch thử chờ 05 Task 20 (người; P05-1) | chờ |
| 324 | §15, việc còn mở: logo và tên miền; kênh PayOS cho staging (P05-1); hộp thư nhận cảnh báo (P05-5); pháp lý (chuyển dữ liệu ra nước ngoài, giữ dữ liệu cá nhân không thời hạn, thông báo website bán hàng); thanh toán quốc tế; chứng thư ký mã và tài khoản Apple Developer; website; hóa đơn điện tử để sau MVP | CDA, 00 | Tên, bundle id, giá, thời gian lưu dữ liệu, hóa đơn điện tử đã chốt 2026-10-01 (Q1, Q2, Q9, Q10); email đã chọn Resend, tài khoản Cloudflare đã có | chưa làm |

## 5. Việc chờ và cách không bị chặn

### 5.1 Các dòng "Chờ …" trong spec

| Chỗ trong spec | Nội dung chờ | Mã |
|---|---|---|
| §3.3, mốc A4 | "Chưa đủ điều kiện của A4": clip Bluetooth thật, nghe lại 24 clip | C13 |
| §4.4, nổi trên app toàn màn hình | "Chờ kết quả S5 (kế hoạch 05, Task 3–4)" | C5 |
| §6.1, Windows | "Chờ kết quả S2 trên Windows (kế hoạch 04, Task 7–8)" | C2 |
| §6.1, macOS | "Chờ kết quả S1 (kế hoạch 04, Task 6)" | C1 |
| §6.4, hai bản Windows | "Chờ kết quả S3 trên Windows (kế hoạch 03, Task 14–16)" | C3 |
| §6.4, rút ngắn cửa sổ mã hóa | "Chờ chạy lại fullctx với bản build chốt" | C12 |
| §6.4, flash attention | "Máy tham chiếu chưa đo" | C6 |
| §6.5, API | "Đổi cờ, hoặc chạy trên Windows, thì làm lại S4" | C4 |
| §6.5, lần đầu chạy binary mới | "chưa đo trên bản đã notarize" | T1 |
| §6.7, đề xuất gói Chuẩn | "Chờ kết quả S6 trên card rời 6 GB, 4 GB và GPU tích hợp" | C7 |
| §6.11, dung lượng bộ cài | "Windows: chờ số đo ở kế hoạch 03, Task 15, Step 3" | C10 |
| §6.12, ggml | "Trên Windows, chờ kết quả kế hoạch 03, Task 14 và 16" | C11 |
| §6.12, thư viện C runtime | "chờ kết quả `dumpbin /dependents` ở kế hoạch 03, Task 14" | C9 |
| §8, bảng hạng máy | "riêng M1 cơ bản phải xác nhận ở S6" | C8 |
| §8, sau bảng hạng máy | "Chờ kết quả S6 trên các máy tham chiếu … để chốt hạng máy khuyến nghị" | C8 |
| §8, đo được trên M4 Pro | "Chờ kết quả S6 trên các máy tham chiếu (kế hoạch 06, Task 8–9)" | C6 |
| §8, RAM đo được | "Chờ kết quả S6 trên các máy tham chiếu …, nhất là máy chạy bằng CPU" | C6 |
| §8, VRAM | "Chờ kết quả S6 trên Windows để có VRAM đo thật" | C7 |

### 5.2 Việc chờ Giai đoạn 0

| Mã | Việc chờ | Nguồn kết quả | Kế hoạch dùng | Cách không bị chặn | Cần |
|---|---|---|---|---|---|
| C1 | S1: thu âm trên macOS với Zoom, Meet (Chrome, Safari, Edge), Teams, Zalo PC; tap một app; tai nghe có dây và Bluetooth; đổi thiết bị giữa chừng; từ chối quyền | Kế hoạch 0-04 Task 6, `results/s1_capture.md` | 02, 08 | `MacTapSource` đã chạy ở mức code; 02 làm tiếp mà không cần ma trận. 02 cài listener đổi thiết bị ngay từ đầu; kết quả dòng 9 chỉ chỉnh cách khởi tạo lại; kết quả dòng 2 định cách phát hiện thiếu quyền (§9) | người, Mac, tài khoản họp, máy thứ hai |
| C2 | S2: WASAPI loopback với Teams, Zoom, Meet; thiết bị Communications; tai nghe Bluetooth; chèn im lặng; rút tai nghe | Kế hoạch 0-04 Task 7–8, `results/s2_capture.md` | 02 (Win), 08 | Code `windows.rs` đã viết sẵn ở kế hoạch 0-04 Task 7. 02 đưa vào crate và kiểm kiểu trên Mac bằng `cargo check -p audio-capture --target x86_64-pc-windows-msvc` (sau `rustup target add x86_64-pc-windows-msvc`); chạy thật khi có máy | máy Windows, người |
| C3 | S3 trên Windows: build `asr-worker-vulkan` và `asr-worker-cpu`, `--probe`, chép lời bằng Vulkan và CPU, máy không có Vulkan | Kế hoạch 0-03 Task 14–16, `results/s3_windows.md` | 02 (Win), 04, 07 | Logic chọn bản worker và đề xuất gói test bằng kết quả `--probe` giả (JSON) và mã thoát giả (`0xC0000135` khi thiếu `vulkan-1.dll`). Code `probe.rs` có sẵn ở kế hoạch 0-03 Task 14 | máy Windows có card rời, máy ảo không có Vulkan |
| C4 | S4 trên Windows: token prompt do `llama-server` Windows dựng và bản dịch stream khớp Hugging Face | Chạy lại `bench/phase0/mt/check_template.py` (kế hoạch 0-02 Task 2) trên Windows | 02 (Win), 07 | macOS đã xác nhận. Nếu Windows lệch thì dùng phương án `minijinja` (§6.5) | máy Windows |
| C5 | S5: thanh phụ đề trên app họp toàn màn hình, trên macOS và Windows; phím tắt trùng (dòng 13 của mỗi ma trận) | Kế hoạch 0-05 Task 3–4, `results/s5_overlay.md` | 01, 03, 08 | Giữ cách làm của S5. Dòng nào không đạt thì sửa ở 01 (nếu đang chạy) hoặc ở 03. Phím tắt mặc định giữ như F10 cho tới khi có kết quả | người, Mac, Windows, app họp |
| C6 | S6 trên máy tham chiếu: độ trễ, RAM, VRAM trên Mac M1 16 GB, Mac chip cơ bản đời mới, laptop card rời 6 GB và 4 GB, máy 8 GB chỉ có CPU, GPU tích hợp | Kế hoạch 0-06 Task 8–9, `results/s6_latency.md`, `results/latency/vram-*.csv` | 04, 02, 08 | Ngưỡng đề xuất gói và danh sách tổ hợp gói nằm trong manifest (Đ7); có số thật thì sửa manifest, không phát hành lại app. 08 đo lại A2 bằng app thật | máy tham chiếu, người; nhắc đóng app nặng (mục 6.9) |
| C7 | Ngưỡng VRAM 6 GB cho gói Chuẩn; có nới cho card 4 GB hay GPU tích hợp không | Như C6 | 04 | Như C6: chỉ sửa manifest | như C6 |
| C8 | Hạng máy khuyến nghị; nếu M1 cơ bản không đạt thì chọn một trong hai phương án ở §8 | Như C6 | 04, 08 | Như C6. Việc chọn phương án là Q15 | chủ dự án |
| C9 | VCRUNTIME: các `.exe` có phụ thuộc `VCRUNTIME140.dll` không | Kế hoạch 0-03 Task 14 Step 4, `results/s3_windows.md` | 07 | 07 chạy `dumpbin /dependents` trên runner Windows của CI (Q3) hoặc trên máy Windows, rồi quyết định link tĩnh CRT hay kèm VC++ Redistributable | máy Windows hoặc runner CI |
| C10 | Dung lượng bộ cài Windows | Kế hoạch 0-03 Task 15 Step 3, `results/s3_size_windows-x64.json` | 07 | 07 đo trên bộ cài thật | máy Windows hoặc runner CI |
| C11 | `dumpbin` hai bản `asr-worker` không có DLL ggml; `asr-worker-cpu` chạy được trên máy không có Vulkan | Kế hoạch 0-03 Task 14 và 16 | 02 (Win), 07 | Như C3; 07 thêm bước kiểm vào CI | máy Windows, máy ảo |
| C12 | Lượt fullctx với bản build chốt, để so giả định 8 trên cùng cấu hình | Bổ sung cho kế hoạch 0-03 Task 11. 02b Task 8 ghi kết quả vào `bench/phase0/results/gd1_a4.md`; tới ngày 2026-10-02 chưa chạy (cần máy rảnh), file chưa có | Không kế hoạch nào phụ thuộc | 02 chạy trên Mac, cùng đợt chạy lại A4 đầu tiên (Đ12) | Mac, agent |
| C13 | Hai điều kiện A4: clip thật qua tai nghe Bluetooth; người nghe lại 24 clip có chú thích Latin | Chưa có kế hoạch; giao cho 08 (Đ11) | 08; mốc A4 ở mục 6.7 | Cho tới khi xong, mốc A4 tạm là `a4_m4pro-{turbo,small}-final.json`. Có mốc mới thì chủ dự án duyệt rồi mới thay | người, tai nghe Bluetooth |
| C14 | Cài công cụ trên Windows | Kế hoạch 0-01 Task 2 | Mọi phần (Win) | Gom việc Windows thành một đợt (mục 3) | máy Windows |
| C15 | Báo cáo Giai đoạn 0 (`bench/phase0/REPORT.md`, kế hoạch 0-00 Task 1) và kết luận S3 (`results/s3_lid.md`, kế hoạch 0-03 Task 17) | Giai đoạn 0 | Không kế hoạch nào phụ thuộc | Viết khi đã có kết quả Windows và S6 trên máy tham chiếu | agent |

### 5.3 Việc chờ tài khoản

| Mã | Tài khoản | Hiện trạng | Kế hoạch dùng | Cách không bị chặn |
|---|---|---|---|---|
| T1 | Apple Developer ID (99 USD/năm) | Chưa có | 07 (ký, notarize, đo lại thời gian chờ lần đầu ở §6.5), 06 và 07 (Team ID cho tự kiểm chữ ký), 08 (A6, Gatekeeper) | Bản dev ký ad-hoc hoặc ký bằng chứng thư cố định (R8). 07 viết sẵn mọi bước, chạy khi CI có secret. Đăng ký tư cách tổ chức thì cần số D-U-N-S, nên đăng ký sớm |
| T2 | Chứng thư ký mã OV cho Windows, khóa trên HSM của dịch vụ ký cloud | Chưa có | 07, 06 và 07 (tên chủ chứng thư), 08 (SmartScreen) | Bộ cài chưa ký vẫn chạy được để thử nội bộ, SmartScreen sẽ cảnh báo. Việc xác minh doanh nghiệp mất thời gian, và phụ thuộc loại hình đăng ký kinh doanh (§15) |
| T3 | Repo từ xa và CI | Chưa có remote | 07, 04 (ký manifest chính thức), Dependabot | Kiểm tra chuẩn chạy tay trên Mac (mục 6.2); manifest staging (Đ8). Chọn nơi đặt repo là Q3 |
| T4 | Cloudflare riêng cho sản phẩm | Đã có | 04 (R2), 05 (Workers, D1, Access, Cron Triggers) | Người chạy `wrangler login` và tạo API token phạm vi hẹp khi cần |
| T5 | PayOS merchant | Đã có. Staging cần một kênh thanh toán thứ hai, vì mỗi kênh chỉ có một URL webhook (P05-1, chưa quyết); 05 Task 19–20 chờ kênh này | 05 | Người lấy client id, api key, checksum key cho staging và production, rồi nhập bằng `wrangler secret put` |
| T6 | Resend | Chưa ghi nhận là có; cần tạo trước 05 Task 19 | 05 | Test dùng `EmailProvider` giả. Trước khi có tên miền đã xác thực, chỉ gửi thử được ở mức hạn chế |
| T7 | Tên miền | Chưa có; chủ dự án mua sau (Q1) | 04, 05, 07 | Staging dùng `*.workers.dev` và URL công khai tạm của R2; mọi URL đọc từ cấu hình |

## 6. Quy ước chung cho mọi kế hoạch Giai đoạn 1

### 6.1 Phiên bản thư viện (CLAUDE.md, §6.12)

- Khi cài công nghệ hay thư viện bên thứ ba, dùng bản ổn định mới nhất tại thời điểm cài. Không dùng beta, rc, nightly, trừ khi bắt buộc; khi đó ghi lý do trong kế hoạch.
- Trước khi chốt phiên bản, kiểm kỹ tương thích và xung đột:
  - đọc release notes và changelog, tìm thay đổi phá vỡ tương thích;
  - peer dependency; thư viện React phải hỗ trợ React 19;
  - mọi plugin Tauri cùng dòng 2.x với Tauri core (hiện 2.12);
  - crate chạy được với Rust 1.98.1 (MSRV); Node 24.21 đúng yêu cầu của Vite;
  - trong một tiến trình không có hai bản của cùng một thư viện gốc, không trùng symbol; ggml chỉ nằm trong `asr-worker` và `llama-server`.
- **Luật tuổi phát hành** (spec §6.12, chốt 2026-10-01): "mới nhất" là bản ổn định mới nhất đã ra được **ít nhất 1 ngày** lúc cài; bản chưa đủ 1 ngày thì dùng bản ngay trước đó và ghi lại trong kế hoạch. Áp cho cả gói npm lẫn crate.
  - npm: **không bao giờ commit `minimumReleaseAgeExclude`**. pnpm 12 tự ghi mục này vào `pnpm-workspace.yaml` khi gói chưa đủ tuổi; xóa đi và chọn bản cũ hơn.
  - Crate: cargo không tự kiểm. Xem ngày phát hành trên crates.io trước khi cài hay `cargo update`; bản mới nhất chưa đủ 1 ngày thì khóa bản trước bằng `cargo update -p <crate> --precise <bản>`.
  - Lưu ý cho 01: `tauri-plugin-autostart` 2.7.0 và `tauri-plugin-single-instance` 2.5.2 ra lúc 2026-10-01 00:27–00:28 UTC. Thực thi 01 trước 2026-10-02 00:28 UTC thì phải dùng bản ngay trước của hai plugin này.
- Mỗi kế hoạch con có bảng "Phiên bản đã chốt" (thành phần, phiên bản, ghi chú tương thích, ngày kiểm), như kế hoạch 0-00.
- Sau khi cài: build lại toàn bộ và chạy kiểm tra chuẩn (mục 6.2).
  - Nâng `candle-core` hoặc `candle-onnx` thì chạy thêm `cargo test -p pipeline --test vad_reference -- --include-ignored` với các biến `SILERO_VAD_MODEL`, `VAD_TEST_WAV`, `VAD_REF_JSON`.
  - Đụng engine hay model thì chạy lại benchmark (mục 6.7).
- Commit lockfile (`Cargo.lock`, `pnpm-lock.yaml`, và lockfile của `server/`). Chỉ nâng phiên bản khi chủ động quyết.

### 6.2 Kiểm tra chuẩn

Trên Mac, từ gốc repo:

```bash
cargo fmt --all -- --check
pnpm install --frozen-lockfile
pnpm build
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --workspace
cargo test -p asr-worker --features shared-encode
cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1
cargo build --release -p asr-worker --features metal,shared-encode
cargo deny check && cargo audit
node --test scripts/models/manifest.test.mjs
pnpm test
pnpm audit
./scripts/check-windows.sh
pnpm -C server install --frozen-lockfile
pnpm -C server check
pnpm -C server audit
```

Expected:
- Không có lỗi, không có cảnh báo của clippy.
- `cargo deny check` in `advisories ok, bans ok, licenses ok, sources ok`.
- Lúc viết kế hoạch này (commit `3f085a9`), `cargo test --workspace` có 144 test qua và 1 test bỏ qua (`vad_reference`).
- Sau 02c Task 7 (`f2edbd6`): lúc lập 02c, `cargo test --workspace` có 490 test qua và 10 test bỏ qua, `pnpm test` có 64 test trong 5 file. Trên `main` có thêm 3 test ngoài kế hoạch (`9aace29`, `e591a1e`), nên số test qua lớn hơn tương ứng.
- Sau 03 (`7a2e57e`): `cargo test --workspace` có 576 test qua, 0 lỗi, 12 bỏ qua; `cargo test -p asr-worker --features shared-encode` 42 qua, 1 bỏ qua; `cargo test --release … pro::` 3 test qua (bản release không có `DevGate`); `pnpm test` 97 test trong 10 file.
- Sau 04 (`1797cd1`): `cargo test --workspace` có 659 test qua, 13 bỏ qua (app 304 qua, 3 bỏ qua); `pnpm test` 114 test; `node --test scripts/models/manifest.test.mjs` 6 test qua (test các script manifest model: dựng, ký, kiểm phong bì).
- Sau 06 (`d266be5`): `cargo test --workspace` có 753 test qua, 13 bỏ qua; `cargo test --release -p meeting-translator --lib -- pro:: license:: --test-threads=1` 87 test qua (bản release không có `DevGate`); `pnpm test` 125 test.
- Sau 05 đợt D (`4dbd229`): `pnpm -C server check` in `Tests  360 passed (360)` (Vitest), `node --test` 6/6 qua, và 4 lần `--dry-run: exiting now.`; `pnpm -C server audit` in `No known vulnerabilities found`.

Ghi chú:
- `pnpm build` chạy trước `cargo` để `dist/` có sẵn cho `src-tauri`.
- `scripts/check-windows.sh` (cần một lần `rustup target add x86_64-pc-windows-msvc`) chạy clippy cho target Windows ngay trên Mac, cho app, `pipeline` và `audio-capture` (02c Task 7), với `fake-llvm-rc` và `fake-pkg-config` (02a QĐ15). Từ 03a nó đặt thêm biến cho `libsqlite3-sys` (`LIBSQLITE3_SYS_USE_PKG_CONFIG`, `SQLCIPHER_LIB_DIR`) và `openssl-sys` (`OPENSSL_NO_VENDOR`, `OPENSSL_DIR`, `OPENSSL_STATIC`, `CC_x86_64_pc_windows_msvc=clang`), để không build SQLCipher và OpenSSL từ mã nguồn. Chỉ chứng minh code Windows biên dịch được; `asr-worker` không nằm trong phép kiểm này.
- Bản dev cần chạy `scripts/copy-sidecars.sh` trước `pnpm tauri dev`: script build `asr-worker` (Metal, `shared-encode`), chép nó cùng `llama-server` b11146 và các `.dylib` vào `src-tauri/binaries/`. Chép lại thì build lại app, vì `build.rs` băm các file này và app từ chối tiến trình phụ có SHA-256 khác (02a QĐ17). Thử quyền ghi âm thanh hệ thống thì dùng `scripts/run-dev-app.sh` (02c Task 4, Task 8).
- Trên Windows (PowerShell), build hai bản `asr-worker` theo kế hoạch 0-03 Task 14 Step 3.
- Kế hoạch con thêm lệnh của phần mình vào khối này khi tạo ra: `pnpm test` (vitest, từ 01), lệnh kiểm tra của `server/` (từ 05). Khối lệnh đổi thì cập nhật mục này (Task 2).

### 6.3 TDD

- Theo superpowers:test-driven-development: viết test trước, chạy thấy đỏ đúng lý do, viết code tối thiểu, chạy thấy xanh, commit. Mỗi task kết thúc bằng commit.
- Test mặc định không cần mạng, model, thiết bị âm thanh, GPU hay quyền của hệ điều hành. Phần cứng thật và dịch vụ ngoài đi qua lớp giả:
  - `AudioSource` giả;
  - tiến trình phụ giả (binary nhỏ trong workspace);
  - kho khóa trong bộ nhớ, đồng hồ giả, HTTP giả.
- Test cần model hay thiết bị thật làm theo mẫu `vad_reference`: đánh dấu `#[ignore]`, đọc đường dẫn từ biến môi trường, và ghi rõ lệnh chạy trong kế hoạch.
- Code Windows:
  - logic thuần có test chạy trên Mac;
  - phần gọi API Windows có test `#[cfg(windows)]`, đánh dấu "cần Windows" trong task.
- Server: test bằng Vitest; 05 chọn cách chạy test trong môi trường của Workers.
- Giao diện: vitest cho logic và hiển thị.

### 6.4 `cargo deny` và giấy phép

- Chạy `cargo deny check` sau mỗi lần thêm hay nâng crate. `deny.toml` giữ hai bất biến:
  - danh sách giấy phép được phép; app đóng nguồn nên không nhận GPL, LGPL, AGPL;
  - chỉ `asr-worker` được link `whisper-rs`.
- Giấy phép mới thì thêm vào `allow`, ghi lý do trong commit.
- Không thêm mục `[advisories] ignore` mới nếu không ghi lý do và điều kiện gỡ bỏ, như mục `RUSTSEC-2024-0436` hiện có.
- Gói npm: kiểm giấy phép trước khi thêm (`pnpm licenses list`). 07 tự động hóa việc này trong CI và sinh `THIRD_PARTY_NOTICES`.
- Crate chạy trong tiến trình chính không được kéo ggml, hay bản thứ hai của thư viện C đã có (ví dụ hai bản SQLite, hai bản OpenSSL).

### 6.5 Bí mật (§10.2)

- App không chứa bí mật nào. Trong app chỉ có khóa công khai:
  - hai khóa kiểm token (`kid` đang dùng và dự phòng);
  - khóa kiểm manifest model;
  - khóa kiểm bản cập nhật.
- API key của `llama-server` được tạo ngẫu nhiên mỗi lần chạy và chỉ nằm trong RAM, nên không phải bí mật lưu trữ.
- Bí mật của license server là Wrangler secret, theo từng môi trường (staging, production):
  - client id, api key, checksum key của PayOS;
  - khóa API của Resend;
  - khóa riêng ký token: hai ô `TOKEN_SIGNING_KEY_A`, `TOKEN_SIGNING_KEY_B`; ô đang ký chọn bằng biến thường `TOKEN_SIGNING_SLOT` (P05-6, spec §10.2);
  - pepper của bộ đếm giới hạn tần suất; email nhận cảnh báo (`OPERATOR_EMAIL`, không bắt buộc).
  - Tên đã chốt ở 05: Worker API có `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `RESEND_API_KEY`, `TOKEN_SIGNING_KEY_A`, `TOKEN_SIGNING_KEY_B`, `RATE_LIMIT_PEPPER`, `OPERATOR_EMAIL` (không bắt buộc); biến thường `TOKEN_SIGNING_SLOT` và `PLANS`. Worker admin chỉ có bốn secret đầu, cộng service binding `API`.
  - Đã thống nhất: 05 và spec đều dùng hai ô `TOKEN_SIGNING_KEY_A`, `_B` cộng `TOKEN_SIGNING_SLOT`, đặt tên theo ô vì secret không đọc lại được. Chạy cục bộ dùng `server/.dev.vars` với giá trị giả hoặc của staging, không bao giờ dùng giá trị production.
- Bí mật của CI (07, khi có repo từ xa); chỉ job phát hành đọc được:
  - chứng thư Developer ID và mật khẩu; khóa API để notarize;
  - thông tin dịch vụ ký cloud của chứng thư OV;
  - khóa riêng ký bản cập nhật của Tauri và mật khẩu;
  - khóa riêng ký manifest model;
  - API token Cloudflare phạm vi hẹp (R2, deploy Worker).
- **Không dùng kho mật khẩu** (P05-6, chốt 2026-10-01). Khóa dự phòng ký token là ô secret không đang ký (`TOKEN_SIGNING_KEY_A` hoặc `_B`) của Worker, không có bản sao nào trên máy người vận hành. Đánh đổi: tài khoản Cloudflare bị chiếm thì mất cả hai khóa, nhưng khi đó server cũng đã bị chiếm.
- Khóa ký bản cập nhật và khóa ký manifest (Q17, chốt 2026-10-02): mỗi loại một khóa trong secret của CI, kèm một bản sao offline mã hóa bằng passphrase (USB; passphrase in ra giấy, cất riêng). Lộ khóa thì phát hành bản app mới mang khóa công khai mới.
- Không khóa ký nào nằm trên máy dev (§10.2). Khóa production được tạo rồi đưa thẳng vào nơi lưu, không ghi ra đĩa (Q11).
- Khóa staging và dev tách khỏi khóa production. Bản dev của app nhận khóa staging; bản phát hành chỉ nhận khóa production.
- `.gitignore` thêm `.dev.vars*`, `.env*`, `*.pem`, `*.p12`, `*.pfx`, `*.key` trước khi tạo `server/` (task đầu của 05).
- Log của app, của `asr-worker` và của server không chứa âm thanh, nội dung chép lời, license key đầy đủ, token hay khóa API. Email chỉ ghi ở dạng che bớt.
- Agent không in, không commit, không dán bí mật vào kế hoạch hay báo cáo. Nhập secret là bước của người: `wrangler secret put` đọc giá trị từ bàn phím.

### 6.6 Commit và nhánh

- Làm thẳng trên `main`, không tạo nhánh hay worktree. Trước mỗi task, `git status` phải sạch.
- Mỗi task một hoặc vài commit nhỏ. Chỉ `git add` đúng file của task.
- Thông điệp theo kiểu đang dùng (`feat(<phạm vi>): …`, `fix(…)`, `test(bench): …`, `docs(plan): …`), tiếng Việt có dấu. Dòng cuối là `Co-Authored-By`, cách phần trên một dòng trống:

```bash
git commit -m "feat(pipeline): ghép câu và phụ đề tạm theo §6.3" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- Không sửa lịch sử đã commit (không `rebase`, không `amend` commit cũ, không `push --force`).
- Hiện chưa có remote. Khi có (Q3), push theo chỉ dẫn của chủ dự án.

### 6.7 Chống thụt lùi A3/A4

- **Khi nào chạy lại:**
  - A3: sau mỗi lần đổi model GGUF, engine (phiên bản hay cờ build của llama.cpp, cách build `llama-server`, backend), prompt, hậu xử lý bản dịch, tham số sinh.
  - A4: sau mỗi lần đổi model ggml, engine (phiên bản hay cờ build của whisper.cpp, bản vá, backend), tham số giải mã, chọn ngôn ngữ.
  - S6: khi thay đổi có thể làm chậm pipeline. Trước khi đo, làm theo mục 6.9.
- **A3:**
  - Dịch bộ test bằng `latency-bench mt-eval` sau khi 02 thêm lệnh này (Đ4); trước đó dùng `bench/phase0/mt/translate.py`.
  - Chấm bằng `bench/phase0/mt/score_mt.py` trong môi trường COMET của kế hoạch 0-02.
  - Đạt khi COMET từng chiều, cả Q8_0 lẫn Q4_K_M, không thấp hơn mốc ở §3.3 quá 0,01.
  - Cẩn thận:
    - `translate.py` chạy tiếp từ file đầu ra đã có (`bench/phase0/data/mt/outputs/<model>-<variant>.jsonl`). Đổi code mà giữ file cũ thì nó không dịch lại câu nào.
    - `score_mt.py` luôn ghi đè `results/s7_mt.json` và `results/s7_mt.md`.
    - Vì vậy, trước lần chạy lại đầu tiên, 02 thêm nhãn đầu ra cho cả hai, để không ghi đè mốc.
- **A4:**
  - `latency-bench asr-eval` trên `bench/phase0/data/asr/manifest.jsonl` (dựng bằng `build_clips.py`), chấm bằng `score_asr.py`, như kế hoạch 0-03 Task 11.
  - Đạt khi WER/CER nhóm `-wb` của từng ngôn ngữ, ở từng gói, không xấu hơn mốc quá 10% (tương đối).
  - Mốc hiện hành: `bench/phase0/results/a4_m4pro-{turbo,small}-final.json`, cho tới khi C13 xong.
- **S6:** `bench/phase0/latency/run_matrix.py` như kế hoạch 0-06 Task 7; so với `results/latency/m4pro-chot-khuyennghi-*.json` và với A2.
- **Nhãn và lưu kết quả:**
  - Đặt nhãn có `gd1-<việc>`, ví dụ `out-m4pro-turbo-gd1-prevlang.jsonl`. Không ghi đè file mốc.
  - Commit file kết quả nhỏ vào `bench/phase0/results/`; dữ liệu lớn giữ ở `bench/phase0/data/`.
- **Khi thụt lùi quá ngưỡng:** không commit thay đổi gây ra nó; báo chủ dự án kèm số liệu. Chỉ chủ dự án duyệt mốc mới.
- Công cụ `bench/phase0` phải chạy được với code mới. Đổi giao thức hay API của `pipeline` thì sửa `latency-bench` ngay trong cùng task.

### 6.8 Không bật hộp thoại quyền khi agent tự làm

Agent tự làm thì không chạy thứ gì bật hộp thoại xin quyền hay hộp thoại hệ thống.

Trên macOS:
- tap thu âm thật (trong app, `capture`, `Capture.app`); `tccutil reset`;
- đọc hay ghi Keychain bằng binary vừa build lại: chữ ký ad-hoc đổi sau mỗi lần build, nên Keychain hỏi lại;
- xin quyền thông báo; bật "khởi động cùng hệ thống" thật; quyền Accessibility hay Screen Recording;
- mở System Settings; cài chứng chỉ gốc của proxy (A7); đổi giờ hay múi giờ của máy.

Trên Windows:
- UAC (chạy bộ cài, cài driver), SmartScreen, hộp thoại tường lửa.
- `llama-server` chỉ nghe `127.0.0.1`; nếu hộp thoại tường lửa hiện thì đó là lỗi.

Cách làm:
- Test tự động dùng lớp giả (mục 6.3).
- Test cần quyền thật để `#[ignore]`, và ghi vào mục "Cần người thao tác" của task, kèm lệnh chạy và kết quả mong đợi.
- Tới bước cần quyền thì agent dừng, báo người làm, chờ kết quả rồi mới đi tiếp.
- Người thử quyền thật trên bản ký bằng chứng thư cố định (R8), để không phải cấp quyền lại sau mỗi lần build.

### 6.9 Trước khi đo thời gian

Áp cho S6, A2, mục tiêu CPU ≤ 30% (§8), thời gian chờ lần đầu (§6.5), và mọi số đo tốc độ khác. Ở kế hoạch 0-02, máy bận đã làm tốc độ sinh token giảm gần một nửa giữa chừng.
- Agent nhắc người đóng app nặng (Docker Desktop, trình duyệt nhiều tab, IDE đang index, app họp không dùng tới) và cắm sạc, rồi chờ xác nhận mới chạy. Không đo khi đang build.
- Ghi trạng thái máy vào kết quả: trên Mac, `sysctl vm.swapusage` (swap gần trống) và `pmset -g batt` (đang cắm sạc); trên Windows, Task Manager.
- Không dùng số đo lúc máy bận để quyết định. Nếu phải giữ lại thì ghi rõ.

### 6.10 Đặt tên và cấu trúc kế hoạch con

- File: `docs/superpowers/plans/2026-10-01-giai-doan-1-0N-<slug>.md`, với slug như bảng ở mục 2. Giữ tiền tố `2026-10-01` cả với kế hoạch viết sau (Đ1).
- Tiêu đề `# Giai đoạn 1 · 0N: <tên>`, tiếp theo là header chuẩn (khối "For agentic workers", Mục tiêu, Kiến trúc, Công nghệ) và dòng dẫn tới file này.
- Mỗi kế hoạch có:
  - bảng "Phiên bản đã chốt";
  - danh sách dòng của bảng đối chiếu mà kế hoạch nhận (Task 3);
  - task theo skill writing-plans: đường dẫn file chính xác, code đầy đủ, lệnh chạy kèm kết quả mong đợi, commit;
  - ghi rõ ở đầu task nào cần Windows hay cần người thao tác.
- Task cuối của mỗi kế hoạch là Task 2 của file này.

## 7. Rủi ro chính và cách giảm

| Mã | Rủi ro | Nguồn | Cách giảm | Kế hoạch |
|---|---|---|---|---|
| R1 | Chưa có máy Windows, trong khi phần lớn việc chờ nằm ở Windows | Mục 5 | Gom đợt Windows (mục 3). Kiểm kiểu code Windows trên Mac bằng `cargo check --target x86_64-pc-windows-msvc`. Dùng runner Windows của CI để build, chạy `dumpbin`, đo dung lượng (Q3). Hành vi thật (loopback, Vulkan, SmartScreen) vẫn cần máy | 02, 07 |
| R2 | M4 Pro không phải máy quyết định. Theo ngân sách §8, M1 cơ bản vượt p90 với Q8_0; máy chỉ có CPU dư ít | §8, C6 | Đo S6 trên máy tham chiếu sớm. Gói định nghĩa trong manifest (Đ7) để thêm được gói lai. Dự phòng: bản vá mask cho flash attention (nhanh hơn 5–13%, một nguồn), `--no-repack` | 04, 02, 08 |
| R3 | Ghép câu zh/ja nối nhầm câu khác (cấu hình chốt: 6/17 lần ghép ở gói Chuẩn, 5/18 ở gói Nhẹ, theo ước lượng của review); LID đoạn ngắn sai thêm khi người nói đổi ngôn ngữ thật | §6.3, §6.4, `phase0_review_notes.md` | Thu dữ liệu hội thoại sớm (Q6); công cụ mô phỏng trong `latency-bench`; chưa có dữ liệu thì giữ luật hiện tại | 02 |
| R4 | Gói Nhẹ chép kém rõ với vi (WER 0,225), ja, ko, zh | §8 | Ghi chú chất lượng khi chọn gói; cân nhắc gói lai (C8) | 04 |
| R5 | Một số số liệu chỉ có một nguồn: flash attention 5–13%, 15 giây lần đầu chạy, LID 7/60 và 5/60, 6/80 cặp lặp thật | `phase0_review_notes.md` | Không dùng cho quyết định mới trước khi dựng lại phép thử có script | 02, 07 |
| R6 | Công cụ A3 lệch với app: Python chép lại prompt và không có hậu xử lý; `translate.py` chạy tiếp từ file cũ; `score_mt.py` ghi đè `s7_mt.*`. Gói Chuẩn chỉ dư 0,012 so với sàn Anh→Việt | §3.3, `bench/phase0/mt/` | `latency-bench mt-eval` (Đ4); nhãn đầu ra (mục 6.7); chạy A3 sau mỗi lần đổi prompt hay hậu xử lý | 02, 03 |
| R7 | Mốc A4 chưa chính thức (C13); đổi mốc giữa chừng làm lệch so sánh chống thụt lùi | §3.3 | Làm C13 sớm; khi có mốc mới, chấm lại các lượt cũ theo mốc mới | 08 |
| R8 | Hộp thoại quyền và Keychain hỏi lại sau mỗi lần build (chữ ký ad-hoc), nên agent không tự thử đầu cuối được | Mục 6.8 | Lớp giả trong test; phiên thử của người; thử ký bản dev bằng một chứng thư cố định (ví dụ chứng thư Apple Development của một Apple ID) để quyền không mất sau mỗi lần build, làm ở 01 | 01, 02, 03, 06 |
| R9 | `⌘Q`, Quit ở Dock và tắt máy khó phân biệt qua API của Tauri; chặn nhầm thì hệ điều hành báo app cản tắt máy | §4.3 | Làm và thử tay sớm trong 01. Nếu Tauri không đủ thì gọi API native (xử lý yêu cầu thoát và thông báo tắt máy của AppKit trên macOS, `WM_QUERYENDSESSION` trên Windows) | 01 |
| R10 | Chưa có Apple Developer ID và chứng thư OV; xét duyệt mất thời gian | T1, T2 | Đăng ký ngay; 07 viết sẵn mọi bước, chạy khi có secret; bản chưa ký chỉ dùng thử nội bộ | 07 |
| R11 | Tự build llama.cpp trong CI (Metal tĩnh trên macOS; Vulkan và `GGML_CPU_ALL_VARIANTS` trên Windows) tốn công; đổi binary thì phải chạy lại S4, A3, S6 | §6.12, §10.2 | Tách thành task riêng ở 07; so kết quả với bản chính thức b11146 trước khi thay | 07 |
| R12 | Bộ cài Windows vượt 60 MB nếu kèm bộ cài VC++ Redistributable (khoảng 25 MB) | §6.11, C9 | Ưu tiên link tĩnh CRT nếu `dumpbin` cho thấy có phụ thuộc | 07 |
| R13 | Thư viện mới vướng giấy phép hoặc kéo thêm thư viện C. SQLCipher cần thư viện mã hóa; trên Windows, OpenSSL đi kèm làm build cần thêm công cụ. Một số crate đổi phồn thể sang giản thể dùng bảng của MediaWiki (GPL), không qua được `deny.toml`; bảng của OpenCC là Apache 2.0 | §6.4, §6.6, §10.1 | Kiểm giấy phép và cách build trên cả hai nền tảng ở task đầu của 02 và 03, trước khi viết code dùng thư viện | 02, 03 |
| R14 | PayOS có thể không có môi trường test, nên phải thử bằng tiền thật; trường của webhook và độ dài mô tả đơn phải đúng tài liệu | §14 giả định 7 | Unit test với dữ liệu mẫu từ tài liệu PayOS; giao dịch thật số tiền nhỏ trên staging; đối soát mỗi 5 phút | 05 |
| R15 | Cloudflare Access bảo vệ theo tên miền và đường dẫn: `/admin` trên `*.workers.dev`, hay chung tên miền với API, cần cấu hình đúng; Worker vẫn phải tự kiểm JWT của Access | §6.8, §10.2 | 05 chọn giữa Worker admin riêng và đường dẫn trên tên miền riêng; test Worker từ chối request thiếu JWT hợp lệ | 05 |
| R16 | Chưa có tên miền (chủ dự án mua sau): email production, tên miền của R2 và Worker, `returnUrl` của PayOS chưa có đích thật | Q1, T7 | Staging dùng tên miền tạm; mọi URL đọc từ cấu hình | 04, 05, 07 |
| R17 | Đổi bundle identifier sau khi đã có người dùng làm mất thư mục dữ liệu (model) và các mục trong kho khóa | Q1, §6.7 | Đã chốt `com.aitranslator.desktop` ngày 2026-10-01; 01 đổi trước khi 03 và 06 ghi vào kho khóa; identifier đọc từ một chỗ duy nhất | 01, 07 |
| R18 | Mất khóa ký bản cập nhật thì không cập nhật được các bản đã cài; lộ khóa thì kẻ gian phát hành được bản giả | §6.11, §10.2 | Q17 (chốt 2026-10-02): bản sao offline mã hóa của khóa; chỉ job phát hành của CI đọc khóa | 07 |
| R19 | Hai kế hoạch chạy song song trên `main` sửa cùng file | Đ18 | Chỉ song song khi tập file không giao nhau | 00 |
| R20 | Với turbo, luật `no_speech` gần như không bao giờ bỏ đoạn, nên câu ảo giác khi chỉ có nhạc hay im lặng chỉ còn bộ lọc câu quen thuộc chặn | §6.4 | Thử trên im lặng, nhiễu, nhạc (Việc cho MVP); bộ lọc câu | 02 |
| R21 | Việc pháp lý (chuyển dữ liệu ra nước ngoài, giữ dữ liệu cá nhân không thời hạn) có thể lùi ngày bán hoặc buộc đổi cách lưu dữ liệu | §10.1, §15 | Hỏi luật sư sớm; thao tác xóa theo email đã có, nên đổi sang lưu có thời hạn chỉ cần thêm một cron | CDA |
| R22 | Mất bản ghi bộ đếm (kể cả xóa sạch dữ liệu rồi nhập lại key) thì app coi như đã hết hạn mức của cả chu kỳ, theo luật chặt; khách thật bị chặn tới khi liên hệ hỗ trợ | spec §6.8, "Hạn mức" | Không nới luật, vì nới (ví dụ tính theo tỉ lệ) mở ra cách reset hạn mức dễ làm. Đường cứu: người vận hành dùng thao tác "reset hạn mức của máy" (tăng `quota_epoch`); app báo rõ lý do và hướng dẫn liên hệ hỗ trợ (§9) | 05, 06 |

## 8. Điểm cần chủ dự án quyết

Mỗi điểm có đề xuất. Nếu tới lúc làm mà chưa có quyết định, kế hoạch con làm theo đề xuất và ghi rõ, trừ khi điểm đó ghi "phải quyết".

Cập nhật ngày 2026-10-01:
- **Đã chốt:** Q1 (trừ tên miền và logo), Q2, Q9, Q10, P05-6. Spec đã sửa theo ở commit `6804a7c`, rồi chặt hơn sau bốn lượt review ở commit `868dcfa`, `dc4ac49`, `d3dc512` và `7458783`.
- **Theo đề xuất đã áp dụng** (kế hoạch con đã làm theo, spec đã sửa nếu cần): Q4, Q5, Q7, Q11, Q12, Q13, Q14.
- **Còn mở:** Q3, Q6, Q8, Q15, Q16; P05-1, P05-2, P05-4, P05-5 của kế hoạch 05; điểm cần quyết 1, 2, 6, 7, 8 của 02a (dòng 350–354 của bảng đối chiếu, mục 8.3).

### 8.1 Đã chốt

- **Q1. Tên sản phẩm, logo, tên miền, bundle identifier. Chốt ngày 2026-10-01**, trừ logo và tên miền.
  - Tên: **AI Translator** (chủ dự án viết "AI translator"; tên hiển thị dùng "AI Translator").
  - Bundle identifier: **`com.aitranslator.desktop`**, thay cho `dev.meetingtranslator.spike`. 01 đổi trước khi 03 và 06 ghi vào kho khóa (R17).
  - Repo `meeting-translator/`, tên crate, binary và tên Worker giữ nguyên (spec D13).
  - **Còn mở:** tên miền (chủ dự án mua sau) và logo. Cần tên miền trước khi 05 lên production (tên miền gửi email, tên miền Worker, `returnUrl` và `cancelUrl`), trước 04 bản chính thức (tên miền của R2) và trước bản beta đầu tiên của 07. Trong lúc chờ: staging dùng `*.workers.dev` và URL tạm của R2.
- **Q2. Giá và gói. Chốt ngày 2026-10-01:** chỉ có 4 gói (spec §2, P1).

  | Mã gói | Tên hiển thị | Hạn mức dịch | Giá |
  |---|---|---|---|
  | `free` | Free | 10 phút mỗi ngày, mỗi máy | 0 |
  | `pro` | Professional | 30 giờ mỗi chu kỳ 30 ngày, mỗi máy | 50.000 đ / 30 ngày |
  | `pro_x2` | Professional X2 | 100 giờ mỗi chu kỳ, mỗi máy | 150.000 đ / 30 ngày |
  | `pro_x5` | Professional X5 | không giới hạn | 500.000 đ / 30 ngày |

  - Hạn mức tính riêng cho từng máy, không chia chung: một license kích hoạt được 2 máy, và mỗi máy có đủ hạn mức của gói.
  - Controller tự quyết, chủ dự án có thể đổi (đã ghi vào spec §2 và §6.8):
    - ba gói trả phí có chung tính năng Pro (từ điển, lịch sử, xuất file), chỉ khác hạn mức;
    - chỉ bán theo đơn 30 ngày; không có gói 12 tháng hay trọn đời;
    - chu kỳ hạn mức 30 ngày tính từ `cycle_anchor`; token mang `plan`, `expires_at`, `cycle_anchor`, `quota_minutes_per_cycle`;
    - mua thêm cùng gói, đổi gói có quy đổi ngày (`floor(ngày_còn_lại × giá_cũ / giá_mới)`), không hoàn tiền;
    - cách đếm phút (theo Q5), bộ đếm trong kho khóa, hết hạn mức thì dừng phiên với `quota_exhausted`.
  - Phần việc: server (checkout theo gói, đổi gói, token mới, bảng gói trong cấu hình) thuộc 05; hạn mức trong app và màn hình Nâng cấp 4 gói thuộc 06 (dòng 13, 58, 326–335).
- **Q9. Thời gian lưu dữ liệu cá nhân. Chốt ngày 2026-10-01: giữ vĩnh viễn, không bao giờ tự xóa.** Quyết định này thay cho mốc "1 năm" nêu trước đó cùng ngày.
  - Không có cron tự xóa hay tự ẩn danh. Email, `device_label`, đơn hàng và activation được giữ mãi.
  - Vẫn giữ thao tác admin "xóa hoặc ẩn danh dữ liệu theo email" của 05 (QĐ16, `POST /admin/erase`). Thao tác này chỉ chạy khi người vận hành tự gọi, ví dụ khi khách yêu cầu xóa; không bao giờ chạy tự động.
  - Chính sách quyền riêng tư ghi rõ: dữ liệu được giữ không thời hạn, và khách có thể yêu cầu xóa.
  - Ngoài phạm vi: dữ liệu giới hạn tần suất (khoảng 3 giờ) và log của Cloudflare vẫn tự hết hạn.
  - Còn phải hỏi luật sư về việc giữ không thời hạn, theo Nghị định 13/2023/NĐ-CP và Luật Bảo vệ dữ liệu cá nhân (hiệu lực từ 1/1/2026) (spec §15).
- **Q10. Hóa đơn điện tử. Chốt ngày 2026-10-01: chưa làm trong MVP.** 05 giữ QĐ23 (không gửi thông tin người mua sang PayOS); 06 không thêm ô nhập. Để sau MVP (spec §15). Hồ sơ chuyển dữ liệu ra nước ngoài vẫn là việc pháp lý còn mở.
- **P05-6 (kế hoạch 05). Kho mật khẩu cho khóa dự phòng. Chốt ngày 2026-10-01: không dùng kho mật khẩu.**
  - Khóa dự phòng là một secret riêng của Worker, tạo bằng cách pipe thẳng vào `wrangler secret put`, giống khóa chính. Không có bản nào trên máy người vận hành. Tên secret theo ô: `TOKEN_SIGNING_KEY_A`, `TOKEN_SIGNING_KEY_B`; biến `TOKEN_SIGNING_SLOT` chọn ô đang ký.
  - Khóa công khai của nó build sẵn vào app. Kiểm khớp bằng một lệnh admin ký thử bằng `NEXT`, rồi kiểm bằng `keys/public-keys.json`.
  - Đổi khóa: đổi `TOKEN_SIGNING_SLOT` sang ô dự phòng, rồi tạo khóa mới ở ô vừa rảnh. Secret của Worker không đọc lại được, nên không chép giá trị khóa; tên đặt theo ô để không sai vai sau lần đổi đầu (05 QĐ29).
  - Đánh đổi: tài khoản Cloudflare bị chiếm thì mất cả hai khóa; nhưng khi đó server cũng đã bị chiếm.

### 8.2 Theo đề xuất đã áp dụng

- **Q11. Tạo và giữ khóa ký.** Chủ dự án chỉ quyết P05-6 (không dùng kho mật khẩu); phần còn lại làm theo đề xuất:
  - Khóa ký token production: tạo bằng script, không ghi ra đĩa, pipe thẳng vào `wrangler secret put`. Khi đã có CI (Q3), có thể tạo trong một job CI chạy tay.
  - Khóa dự phòng ký token: ô secret không đang ký (`TOKEN_SIGNING_KEY_A` hoặc `_B`) của Worker (P05-6).
  - Khóa ký manifest và khóa ký bản cập nhật: tạo trong CI, mỗi loại một khóa; bản sao offline mã hóa (Q17, chốt 2026-10-02).
  - Staging dùng cặp khóa riêng.

- **Q4. Câu gốc ngắn trong ngưỡng tỉ lệ token.** Áp dụng cách 2 (02a QĐ12): chỉ áp tỉ lệ khi câu gốc từ 10 token; câu ngắn hơn chỉ chịu hạn mức sinh (tối đa 68 token). Spec §6.5 đã sửa.
- **Q5. Định nghĩa "phút dịch".** Áp dụng đề xuất, cho mọi gói (spec §6.8, "Hạn mức"): phút tính bằng `speech_ms` (không gồm đệm; đoạn gộp cộng từng đoạn con) của các đoạn đã chép lời, khác ngôn ngữ đích, và cộng khi phụ đề sang `done`; không tính `same_lang`, `dropped`, đoạn bị lọc, `skipped`, `failed` và lúc im lặng. Chép lời câu cùng ngôn ngữ đích là miễn phí, có chủ ý. 02 cần thêm `speech_ms` vào `Segment` và sửa chỗ cộng `translated_speech_ms` cho khớp (mục 2.2).
- **Q7. Chỉ chạy một bản của app.** Áp dụng: 01 dùng `tauri-plugin-single-instance`; lần mở thứ hai chỉ hiện cửa sổ chính của bản đang chạy.
- **Q12. Các chỗ lệch nhỏ trong spec.** Đã sửa chữ trong spec ngày 2026-10-01:
  - Của file này: §6.1 dùng `objc2-core-audio`, không `coreaudio-sys`; §12 thêm module email, giới hạn tần suất, cảnh báo của `server/src`; §12 ghi logic giám sát tiến trình phụ nằm trong `pipeline` (Đ2); §12 ghi `tests/fixtures/audio/` chỉ chứa vài clip cho test tích hợp (Đ20); §11 ghi hàm xuất file viết và test phía Rust.
  - Của 01: overlay chỉ có lệnh đọc `get_overlay_view`, không có lệnh khóa; menu app trên Mac chỉ có chữ English; `⌘Q` và Quit ở Dock bị hủy, kèm lời nhắc; overlay ẩn lúc khởi động; chặn điều hướng, link ngoài chỉ mở theo danh sách cho phép; kho khóa Windows lưu với `persistence = Local`.
  - Của 02: luồng riêng và client đồng bộ, không tokio (§7); hỏi định kỳ 500 ms khi đổi thiết bị, thay cho listener (§6.1, §9); trường `replaces` khi gộp câu (§6.6); lần đầu chạy chờ tới 180 giây (§6.5); Q4; giữ flash attention tắt; `PipelineConfig` gom mọi ngưỡng (§7); giao thức `asr-worker` bản 2, `prev_lang` trong yêu cầu (§6.4).
  - Của 05: API dùng `snake_case`; checkout có `consent`; `order_token` trong header `Authorization`; lịch đối soát giãn sau giờ đầu (§9); luật khóa tạm; luật chặn IP và CGNAT; cảnh báo cho người vận hành; `kid` có số thứ tự; dải số đơn theo môi trường; phân loại lỗi email; Worker admin riêng; webhook `/v1/webhooks/{provider}`.
  - Giữ như spec: §10.2 build llama.cpp trong CI (R11). 07 làm thành task riêng.
  - Chưa vào spec: 03 sẽ cấp `core:window:allow-start-resize-dragging` cho overlay (kéo cạnh), và sửa danh sách cố định trong `acl_tests.rs`. Khi 03 làm thì sửa thêm câu về quyền của overlay ở spec §10.2.
- **Q13. Mời khởi động lại để cập nhật và "thông báo hệ thống".** Áp dụng: MVP dùng thông báo trong app (cửa sổ chính, menu khay, thanh phụ đề); không xin quyền thông báo hệ thống (01 QĐ12).
- **Q14. Kho khóa sau khi gỡ app.** Áp dụng: giữ trạng thái bản quyền và bộ đếm hạn mức trong kho khóa sau khi gỡ app, để chống lách hạn mức; ghi rõ trong chính sách quyền riêng tư và trang hỗ trợ.

### 8.3 Còn mở

- **Q3. Nơi đặt repo từ xa và CI.** §10.2 nhắc Dependabot, tức là GitHub.
  - Đề xuất: repo GitHub riêng tư, tạo sớm (trước 04), để:
    - ký manifest chính thức trong CI (04);
    - có runner Windows build hai bản `asr-worker`, chạy `dumpbin` và đo dung lượng bộ cài trước khi có laptop Windows (C9, C10, C11).
- **Q6. Dữ liệu hội thoại thật có quyền dùng** (zh, ja, và các ngôn ngữ khác), để chọn luật ghép câu (§6.3) và ngưỡng giữ ngôn ngữ (§6.4).
  - Cần biết: ai thu; thu thế nào (tự thu cuộc họp có sự đồng ý của người nói, hay dùng bộ dữ liệu mở có giấy phép phù hợp).
  - Nếu chưa có khi làm 02: giữ luật hiện tại, như spec cho phép, và làm sẵn công cụ mô phỏng.
- **Q8. EULA, chính sách quyền riêng tư, trang hỗ trợ (§10.1, §10.2, A6).** Spec nhắc cả ba nhưng không nói hiện ở đâu, còn website có spec riêng.
  - Đề xuất: 07 đưa EULA vào bộ cài (trang giấy phép của NSIS và của DMG) và màn hình Giới thiệu; 06 đặt link chính sách quyền riêng tư cạnh ô đồng ý; nút "Xóa model và dữ liệu" có link trang hỗ trợ.
  - Chính sách quyền riêng tư phải ghi dữ liệu được giữ không thời hạn và cách yêu cầu xóa (Q9).
  - Cần nội dung từ chủ dự án hoặc luật sư trước khi 06 lên production và trước 07.
- **Q15. Phương án khi M1 cơ bản không đạt A2 (§8, §13):** nâng hạng máy khuyến nghị, hay dùng gói lai turbo + Q4_K_M trên máy băng thông thấp. Quyết khi có C6. Nhờ Đ7, cả hai phương án đều không cần sửa code app.
- **Q16. Các chi tiết hạn mức do controller tự quyết** khi sửa spec ngày 2026-10-01 và sau review spec (spec §6.8 "Hạn mức", §4.2, §9, §10.2). Chủ dự án xem lại:
  - **Đề xuất: giữ như spec; 06 làm theo nếu chưa có quyết định khác.**
  - Số thứ tự chu kỳ `n` tính theo `issued_at` của token mới nhất (giờ server), nên chỉnh đồng hồ máy tới hay lùi không có tác dụng. Giờ máy qua mốc mà `issued_at` còn trước mốc thì hẹn `validate` lại sau (mốc − `issued_at`) + 1 phút. Offline lúc qua mốc thì dùng tiếp bộ đếm cũ và báo cần có mạng.
  - Khóa của bộ đếm gói trả phí là (`license_id`, mốc đầu chu kỳ, `quota_epoch`). Mốc đầu chu kỳ thay cho số thứ tự, vì đổi gói đặt lại `cycle_anchor`.
  - Tách luật Free: Free bắt đầu từ 0 ở lần đầu chạy app và mỗi lần reset ngày hợp lệ; `quota_fresh` và bản ghi đánh dấu chỉ áp cho gói trả phí.
  - Gói trả phí: khóa bộ đếm và bản ghi đánh dấu là (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`); ghi bộ đếm trước, bản ghi đánh dấu sau. Bộ đếm bắt đầu từ 0 khi response vừa nhận có `quota_fresh: true` (cửa sổ 15 phút từ lúc tạo activation, lúc cấp token đầu tiên sau khi tăng `quota_epoch`, hay lúc server áp việc đặt lại `cycle_anchor`), khi epoch của token lớn hơn epoch trong bản ghi đánh dấu (an toàn vì chỉ admin tăng được epoch), hoặc khi bản ghi đánh dấu có mốc cũ hơn mốc hiện tại. Trong cửa sổ `fresh`, luật bắt đầu từ 0 đứng trước luật mất bản ghi. Token đọc lại từ kho khóa luôn coi là không `fresh`.
  - Luật mất bản ghi thứ hai so theo activation này, không theo license. `activation_id` có trong khóa vì `device_id_hash` của máy có thể đổi (cài lại hệ điều hành), khi đó server tạo activation khác cho cùng máy.
  - Mất bản ghi bộ đếm theo luật chặt: coi như hết hạn mức của ngày (Free) hoặc cả chu kỳ (gói trả phí). Quá cửa sổ 15 phút, xóa sạch dữ liệu rồi nhập lại key trên cùng máy cũng tính là mất. `activation_created_at` không dùng cho luật này. Đường cứu: admin "reset hạn mức của máy" tăng `quota_epoch`; máy còn bản ghi đánh dấu thì bắt đầu từ 0 nhờ luật epoch lớn hơn, máy đã xóa sạch dữ liệu thì nhờ cửa sổ `fresh` tính từ token đầu tiên sau khi tăng (R22). Rủi ro chấp nhận: trong cửa sổ 15 phút, xóa sạch dữ liệu thì bộ đếm về 0 (mất tối đa khoảng 15 phút hạn mức).
  - Gỡ máy không xóa dòng activation; kích hoạt lại cùng máy dùng lại đúng activation đó.
  - "Đồng hồ thật" của Free = max(thời gian đơn điệu lúc app chạy; hiệu hai header `Date` của server, chỉ khi có `Date` trước và sau lần reset; hiệu giờ máy, chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Rủi ro chấp nhận: chỉnh giờ tới trước khi offline; xóa sạch dữ liệu trên cùng máy để reset Free; sửa bản ghi trong kho khóa; gỡ kích hoạt sau khi hết hạn mức gói trả phí thì từ hôm sau có 10 phút Free mỗi ngày.
  - Bộ đếm Free của ngày cộng cả phút dịch lúc ở gói trả phí; hết hạn mức gói trả phí thì Free của ngày cũng hết.
  - Chu kỳ cuối ngắn hơn 30 ngày có hạn mức `ceil(hạn_mức × số_ngày / 30)`.
  - Xoay key sang máy khác cho thêm hạn mức: rủi ro chấp nhận; luật khóa tạm chỉ giới hạn được phần nào.
  - Chạm hạn mức: không bắt đầu phiên khi còn 0; bỏ hàng đợi, chỉ dịch xong câu đang dịch. Bộ đếm cộng khi phụ đề sang `done`; `same_lang`, `skipped`, `failed` không tính.
  - Nhắc khi còn 5 phút áp cho mọi gói có hạn mức. Thời điểm reset hiển thị của Free là max(00:00 hôm sau, lần reset trước + 20 giờ).
  - Đổi gói và gia hạn: "hiện tại" là `transactionDateTime` của PayOS (không có múi giờ thì parse theo GMT+7), kẹp trong thời hạn của link; cấp tay dùng giờ thao tác, kể cả đơn `underpaid` đã chuyển bù; giá quy đổi theo bảng giá hiện hành; checkout trả ước tính `license_expires_at`. Thêm `GET /v1/plans`.
  - Mô tả đơn PayOS là `AT<7 chữ số>`.
  - Khi khách yêu cầu xóa dữ liệu, giữ `device_id_hash` ở dạng đã băm: dữ liệu bí danh, giữ cho mục đích chống lạm dụng (giới hạn 2 máy, khóa tạm) (spec §10.1); cần luật sư xác nhận.
- **Q17. Bản sao của khóa ký bản cập nhật và khóa ký manifest. Chốt ngày 2026-10-02** (chủ dự án): phương án (a).
  - Mỗi loại **một** khóa (khóa ký manifest, khóa ký bản cập nhật), nằm trong secret của CI. Không làm hai ô khóa A/B như khóa token.
  - Kèm một bản sao offline mã hóa bằng passphrase, cất trên USB; passphrase in ra giấy, cất riêng.
  - Lộ khóa thì phát hành bản app mới mang khóa công khai mới. App nhúng một khóa công khai production cho manifest (định dạng vẫn có `kid`).
  - Đổi khóa (controller thống nhất ngày 2026-10-03): đổi có kế hoạch thì một bản phát hành tin cả `kid` cũ lẫn `kid` mới, bản sau bỏ `kid` cũ; lộ khóa thì bản app mới chỉ tin `kid` mới ngay, `kid` đã lộ bị gỡ khỏi app.
  - Việc tạo khóa production và bản sao thuộc 07 (mục 2.7). Spec §10.2, §15 đã ghi.
- **P05-1 (kế hoạch 05). Kênh PayOS riêng cho staging.** Mỗi kênh chỉ có một URL webhook. Cần có trước khi triển khai staging (Task 19 của 05).
- **P05-2. Giá thử trên staging.** Đề xuất: giá nhỏ cho từng gói (ví dụ 2.000 đ, 3.000 đ, 4.000 đ); sửa nếu PayOS có mức tối thiểu cao hơn.
- **P05-4. Giao diện admin.** 05 chỉ làm JSON API, gọi bằng `cloudflared access curl`. Có cần một trang giao diện nhỏ không?
- **P05-5. Email nhận cảnh báo vận hành (`OPERATOR_EMAIL`).** Đề xuất: một hộp thư vận hành riêng của sản phẩm. Cần có trước khi triển khai staging; thiếu thì cảnh báo chỉ nằm trong log.
- P05-3 (chính sách khóa tạm) đã vào spec §10.2 theo đề xuất của 05.
- **Điểm cần quyết của 02a** (mục "Điểm cần chủ dự án quyết" của 02a). 02 đã làm theo phương án ghi trong ngoặc ở đó; chủ dự án đổi thì sửa code theo dòng tương ứng:
  - điểm 1, ngưỡng `filler_logprob_max` của luật câu đệm: dòng 350;
  - điểm 2, thư viện C oniguruma trong tiến trình chính: dòng 354;
  - điểm 6, hạn dịch câu đang dịch khi chạm hạn mức: dòng 352;
  - điểm 7, bấm Dừng không chờ luồng nhận dạng và luồng dịch: dòng 353;
  - điểm 8, bộ nhạc thử: dòng 351.
  - Đã quyết (controller, 2026-10-02): điểm 4 (`22fa4fe`), điểm 10 (03 làm, mục 2.3). Điểm 3 do người kiểm ở 02c Task 8; điểm 5 do 08 kiểm lại (dòng 121); điểm 9 chuyển cho 07 (mục 2.7).

## 9. Quyết định của kế hoạch này

- **Đ1.** Mọi kế hoạch Giai đoạn 1 giữ tiền tố `2026-10-01`, kể cả kế hoạch viết sau; slug cố định như bảng ở mục 2. Lý do: các file nằm cạnh nhau, tham chiếu không đổi.
- **Đ2.** Logic giám sát tiến trình phụ đặt trong crate `pipeline`: thứ tự chạy, chờ 1/2/5 giây, bộ đếm 5 lần trong 10 phút, chuyển sang CPU, chờ lần đầu từ 30 giây, tắt sau 10 phút rảnh, Job Object và process group. `src-tauri/src/sidecar/` chỉ tìm đường dẫn binary, kiểm SHA-256 và phát sự kiện trạng thái. Lý do: test được bằng tiến trình phụ giả mà không cần Tauri, đúng quyết định ngày 2026-10-01 "`src-tauri` chỉ nối".
- **Đ3.** Ghép câu và luật bỏ đoạn chuyển từ `latency-bench` sang `pipeline`; `latency-bench` gọi lại code của `pipeline`. Lý do: một bản logic duy nhất cho cả app và công cụ đo, nên S6 đo đúng thứ app chạy.
- **Đ4.** 02 thêm `latency-bench mt-eval`: dịch bộ test A3 bằng code Rust của app (prompt, hậu xử lý, thử lại), ghi JSONL cùng định dạng với `translate.py` để `score_mt.py` chấm; đồng thời thêm nhãn đầu ra cho `score_mt.py`. Lý do: A3 đòi "qua đúng prompt của app", mà công cụ Python chép lại prompt và không có hậu xử lý, nên sẽ lệch khi 02 và 03 đổi code.
- **Đ5.** Wrapper kho khóa của hệ điều hành (`src-tauri/src/security/keystore.rs`) làm ở 01. Lý do: cả 03 (khóa SQLCipher) và 06 (bản quyền, bộ đếm hạn mức) cần nó, và hai kế hoạch này có thể chạy song song.
- **Đ6.** 03 khóa tính năng Pro qua một điểm kiểm tra duy nhất phía Rust, bản dev tạm trả Pro; 06 thay bằng trạng thái bản quyền thật và thêm kiểm tra ở nhiều chỗ (§10.2). Lý do: 03 viết và chạy trước 06.
- **Đ7.** Ngưỡng đề xuất gói (RAM, VRAM, loại GPU) và danh sách tổ hợp gói nằm trong manifest đã ký, không hard-code trong app. Lý do: C6 chưa có số; đổi ngưỡng hay thêm gói lai không cần phát hành lại app.
- **Đ8.** 04 dùng cặp khóa staging để ký manifest; bản dev của app nhận khóa này. Manifest chính thức ký trong CI của 07. Lý do: §10.2 cấm khóa ký trên máy dev, và hiện chưa có CI.
- **Đ9.** Hợp đồng giữa 05 và 06 là một bộ vector test commit trong `server/`: token đã ký, khóa công khai, kết quả kiểm mong đợi, key mẫu có ký tự kiểm tra. Cả test TypeScript lẫn test Rust dùng bộ này. Lý do: hai ngôn ngữ, hai kế hoạch viết ở hai thời điểm.
- **Đ10.** Log của app (file trên máy, xoay vòng, không chứa nội dung chép lời hay key đầy đủ) làm ở 01; 02 thêm log của pipeline và xoay log của `asr-worker`. Màn hình Giới thiệu có nút "Mở thư mục log", để người dùng tự gửi khi cần hỗ trợ (§10.1).
- **Đ11.** Hai điều kiện A4 còn thiếu giao cho 08, nhưng đây là việc của người và làm được ngay. Khi xong, mốc A4 mới thay `-final.json` sau khi chủ dự án duyệt.
- **Đ12.** 02 nhận ba việc đo chạy được trên Mac: thử `no_speech_prob` trên im lặng, nhiễu, nhạc; đo ngưỡng tỉ lệ token cho cặp không có tiếng Việt và câu gốc dưới 3 token; chạy lại lượt fullctx (C12).
- **Đ13.** Bước kiểm tra cấu hình của 04 phát hiện CPU không có AVX2 (§8 "chưa hỗ trợ"): app báo máy chưa được hỗ trợ, thay vì để `asr-worker` crash vì gặp lệnh CPU không có (§6.12).
- **Đ14.** Tự kiểm chữ ký của chính app (§10.2) chia hai phần: 06 làm logic (bản dev bỏ qua; sai chữ ký thì chỉ chạy Free) và thử với chữ ký ad-hoc; 07 điền Team ID và tên chủ chứng thư thật, thử trên bộ cài đã ký.
- **Đ15.** Kiểm SHA-256 tiến trình phụ trước khi chạy (§10.2) làm ở 02, với danh sách hash sinh lúc build từ `src-tauri/binaries/`. 07 chỉ đảm bảo CI sinh danh sách từ đúng binary phát hành.
- **Đ16.** Bước "Nghe thử" (§4.1, bước 6) giao cho 03, vì cần thanh phụ đề hoàn chỉnh. 02 cung cấp tùy chọn cho tap tạm thời thu cả âm thanh của app.
- **Đ17.** 02 thu số đo từng phiên và ghi log; bảng debug ẩn (§7) làm ở 03.
- **Đ18.** Chỉ chạy song song hai kế hoạch khi tập file không giao nhau: 05 với mọi kế hoạch khác; phần crate của 02 với 01; 03 với 04 sau khi thống nhất file dùng chung (cài đặt, màn hình Quyền riêng tư). Mọi thứ vẫn trên `main`, mỗi task một commit.
- **Đ19.** Người dùng tự mở app thì cửa sổ chính hiện, và tiến trình phụ bắt đầu chạy (§5). App khởi động cùng hệ thống thì chỉ nằm ở khay, chưa chạy tiến trình phụ. Lý do: §5 muốn app nằm ở khay không giữ vài GB RAM.
- **Đ20.** 02 tạo `tests/fixtures/audio/` với vài clip ngắn có quyền dùng (tự thu, hoặc FLEURS CC BY 4.0 kèm ghi công) cho test tích hợp. Bộ clip A4 vẫn ở `bench/phase0/data/`, dựng lại bằng script.

---

## Task 1: Chốt các điểm cần chủ dự án quyết

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 8)

- [ ] **Step 1: Gửi chủ dự án các điểm còn mở ở mục 8.3, sắp theo lúc cần** (Q1, Q2, Q4, Q5, Q7, Q9–Q14 đã xong ngày 2026-10-01)
  - Trước khi triển khai staging của 05: P05-1, P05-5.
  - Trước khi thực thi 02 và 04: Q3, Q6.
  - Trước khi viết 06: Q16.
  - Trước khi viết 07: Q8. Q17 đã chốt ngày 2026-10-02.
  - Trước khi 05 lên production: tên miền (phần còn mở của Q1).
  - Khi có kết quả C6: Q15.
- [ ] **Step 2: Ghi quyết định vào từng mục Q**: ngày và nội dung. Điểm nào đổi yêu cầu của spec thì ghi "cần sửa spec"; chủ dự án sửa spec, hoặc duyệt bản sửa.
- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): ghi quyết định của chủ dự án vào tổng quan Giai đoạn 1" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Sau mỗi kế hoạch con: cập nhật bảng đối chiếu và trạng thái

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`

- [ ] **Step 1: Liệt kê các dòng của kế hoạch vừa xong** (thay `02` bằng số của kế hoạch đó)

```bash
awk -F'|' '/^\| [0-9]+ \|/ && $4 ~ /02/ {print $2 "|" $3 "|" $6}' docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
```
Expected: mỗi dòng in số thứ tự, yêu cầu và trạng thái.

- [ ] **Step 2: Cập nhật trạng thái từng dòng**
  - Có test hoặc kết quả chứng minh: đổi sang `xong`, thêm SHA commit ngắn vào Ghi chú.
  - Còn phần bị chặn: đổi sang `chờ`, ghi mã C, T hoặc Q.
  - Chưa làm tới: giữ `chưa làm`, ghi lý do.
- [ ] **Step 3: Thêm dòng cho việc phát sinh mà bảng chưa có**, đặt ở cuối nhóm tương ứng. Lấy số kế tiếp:

```bash
awk -F'|' '/^\| [0-9]+ \|/ {n = $2 + 0; if (n > m) m = n} END {print m + 1}' docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
```
Expected: in số kế tiếp (lúc cập nhật ngày 2026-10-01 là 350).

- [ ] **Step 4: Cập nhật các mục khác**: mục 2 (trạng thái viết, bàn giao thực tế nếu khác mô tả), mục 5 (việc chờ đã có kết quả), mục 6.2 (lệnh kiểm tra mới).
- [ ] **Step 5: Kiểm định dạng bảng**

```bash
f=docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
awk -F'|' '/^\| [0-9]+ \|/ && NF != 7 {print "sai số cột:", $2}' "$f"
awk -F'|' '/^\| [0-9]+ \|/ && $6 !~ /^ (chưa làm|đang làm|chờ|xong|hoãn) $/ {print "sai trạng thái:", $2}' "$f"
awk -F'|' '/^\| [0-9]+ \|/ {print $2 + 0}' "$f" | sort -n | uniq -d
```
Expected: không in gì.

- [ ] **Step 6: Commit** (thay `0N` bằng số của kế hoạch)

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 0N" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Trước khi viết một kế hoạch "viết sau" (03, 04, 06, 07, 08)

**Files:**
- Create: `docs/superpowers/plans/2026-10-01-giai-doan-1-0N-<slug>.md`
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2)

- [ ] **Step 1: Kiểm điều kiện viết ở mục 2**: các kế hoạch cần có trước đã xong, hoặc đã có đúng phần cần dùng, theo trạng thái trong bảng đối chiếu.
- [ ] **Step 2: Đọc lại** toàn bộ spec, file này, và code thực tế của các kế hoạch trước. Mô tả ở mục 2 được viết khi chưa có code, nên có thể đã lệch.
- [ ] **Step 3: Lấy danh sách dòng giao cho kế hoạch** bằng lệnh ở Task 2, Step 1, rồi dán vào đầu kế hoạch mới làm checklist. Mỗi dòng phải có task nhận.
- [ ] **Step 4: Xem mục 5, 8, 9**: việc chờ nào đã có kết quả, quyết định nào đã có.
- [ ] **Step 5: Tự rà soát theo skill writing-plans**, sửa mục 2 của file này nếu phạm vi đổi, rồi commit

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-0N-<slug>.md docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): kế hoạch Giai đoạn 1 · 0N" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Khi một việc chờ ở mục 5 có kết quả

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`

- [ ] **Step 1: Đọc file kết quả**; ghi kết luận một câu và đường dẫn file vào dòng mã C hoặc T.
- [ ] **Step 2: Nếu kết quả làm đổi yêu cầu của spec** (ví dụ ngưỡng VRAM khác 6 GB, hạng máy khác), soạn đề xuất sửa spec và gửi chủ dự án. Không tự sửa spec.
- [ ] **Step 3: Nếu kết quả là số cấu hình** (ngưỡng đề xuất gói, tổ hợp gói), ghi vào kế hoạch 04 để cập nhật manifest. Không sửa code app.
- [ ] **Step 4: Cập nhật các dòng của bảng đối chiếu có ghi mã này.** Ví dụ với C6:

```bash
grep -nE '(^|[^0-9A-Z])C6([^0-9]|$)' docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
```
Expected: in các dòng có nhắc C6; cập nhật trạng thái và ghi chú của từng dòng thuộc bảng đối chiếu.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): tổng quan Giai đoạn 1 ghi kết quả của việc chờ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Trước khi phát hành: kiểm bảng đối chiếu đủ 100%

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`

- [ ] **Step 1: Tìm dòng chưa xong**

```bash
f=docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
grep -cE '^\| [0-9]+ \|' "$f"
awk -F'|' '/^\| [0-9]+ \|/ && $6 !~ /xong|hoãn/ {print $2 "|" $3 "|" $6}' "$f"
```
Expected:
- Lệnh đầu in tổng số dòng (lúc cập nhật ngày 2026-10-01 là 349, cộng số dòng thêm sau).
- Lệnh thứ hai không in gì.
- Mỗi dòng `hoãn` có ngày chủ dự án duyệt trong cột Ghi chú.

- [ ] **Step 2: Tìm yêu cầu spec mới từ sau khi lập bảng**

```bash
git log --oneline 3f085a9..HEAD -- docs/superpowers/specs/
git diff 3f085a9..HEAD -- docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
```
Expected: mọi yêu cầu thêm hoặc đổi trong diff đã có dòng trong bảng.

- [ ] **Step 3: Đọc lại spec từ đầu đến cuối**, so với bảng. Yêu cầu nào chưa có dòng thì thêm dòng, và làm xong trước khi phát hành, hoặc xin chủ dự án cho `hoãn`.
- [ ] **Step 4: Kiểm mục 5 và mục 8**: mục 5 không còn việc chờ, hoặc chủ dự án đã chấp nhận phần còn lại; mọi điểm ở mục 8 đã được quyết.
- [ ] **Step 5: Chạy kiểm tra chuẩn (mục 6.2)** trên Mac và trên Windows, ở đúng commit sẽ phát hành. Báo cáo nghiệm thu của 08 đã được commit.
- [ ] **Step 6: Gửi chủ dự án xin duyệt phát hành**, rồi commit file này với trạng thái cuối

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): tổng quan Giai đoạn 1 đủ 100% trước khi phát hành" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
