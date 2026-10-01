# Giai đoạn 1 · 02a: Pipeline trong app — giao thức, luật cắt câu và lọc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần đầu của kế hoạch 02 (mục 2.2 của kế hoạch 00): giao thức của `asr-worker` và luật của pipeline. Cụ thể:
- giao thức `asr-worker` bản 2 theo "Việc cho MVP" của §6.4: `protocol_version`, `prev_lang`, enum `backend`/`decode_mode`, `Error.kind`, stdout chỉ cho giao thức, bản vá `set_audio_ctx` trả lỗi;
- luật cắt câu, ghép câu, bỏ đoạn, lọc câu ảo giác quen thuộc, đổi phồn thể sang giản thể nằm trong `pipeline`, và `latency-bench` gọi lại đúng code đó (Đ3), nên S6 không đổi;
- mọi ngưỡng gom trong `pipeline::config::PipelineConfig`, mặc định là số đã chốt; kế hoạch 04 nạp từ manifest đã ký;
- luật câu đệm nghi ảo giác và chuỗi lặp (Q11 của review 02b).

Client tiến trình phụ, dịch một câu và giám sát nằm ở 02d (tách khỏi file này vì quá dài).

Bản này sửa theo ba review của bản `b221f3c` (ghi chú `review-02a.md`, `review-02b.md`, `review-02c.md` của controller), theo hai review lần 2 của bản `4a1c310` (`review-02-r2-ad.md`, `review-02-r2-bc.md`), rồi theo hai review lần 3 của bản `f86b1b7` (`review-02-r3-ad.md`, `review-02-r3-bc.md`), và dựng trên `main` `f86b1b7` (code như `940c169`): 01 đã xong (tên AI Translator, bundle id `com.aitranslator.desktop`, LaunchAgent, trait `LoginItem` và `SettingsFile`, các đợt sửa R và U), cộng `yoke-derive` 0.8.4 và vitest 5.0.3. Mục "Đã sửa theo review" ở cuối phần đầu file liệt kê từng mục và chỗ sửa.

**Kiến trúc:**
- Không có code Tauri trong 02a, 02d và 02b. `pipeline` chạy và test được không cần app: app nối vào qua hai trait `FrameSource` (âm thanh vào) và `EventSink` (phụ đề ra), và qua `SidecarManager`.
- Luồng xử lý (§7) là các luồng hệ điều hành với client đồng bộ, không dùng runtime tokio (QĐ1).
- Mọi thời gian chờ của phần giám sát đi qua trait `Clock`, nên test vòng đời chạy với đồng hồ giả, không chờ thật. Tiến trình phụ giả là hai binary nhỏ trong chính `pipeline`.

**Công nghệ:** Giữ nguyên Rust 1.98.1, whisper-rs 0.16 với whisper.cpp 1.8.3 đã vá, llama.cpp b11146, candle-onnx 0.11, `windows` 0.62.2. Thêm `ferrous-opencc`, `miniz_oxide`, `log`, `libc`, `objc2-app-kit`, `sha2` (bảng "Phiên bản đã chốt").

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.2, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`.

Kế hoạch 02 có khoảng 24 000 dòng nên chia bốn file, làm theo thứ tự:
1. **02a** (file này): giao thức, luật cắt câu, lọc câu ảo giác, phồn thể sang giản thể.
2. **02d** `docs/superpowers/plans/2026-10-01-giai-doan-1-02d-pipeline-clients.md`: client tiến trình phụ, tiến trình phụ giả, dịch một câu, giám sát. Chữ "d" chỉ vì file này tách ra sau; làm ngay sau 02a.
3. **02b** `docs/superpowers/plans/2026-10-01-giai-doan-1-02b-pipeline-engine.md`: phụ đề và hàng đợi, engine của một phiên, test từ file WAV, `latency-bench mt-eval`, `audio-capture` cho app, đo và chạy lại A3, A4, S6.
4. **02c** `docs/superpowers/plans/2026-10-01-giai-doan-1-02c-pipeline-app.md`: nối vào app (phiên dịch, tiến trình phụ, nguồn âm thanh, giao diện), thử tay, đợt Windows, cập nhật kế hoạch 00.

Cả bốn làm sau khi 01 xong hẳn, vì cùng sửa `Cargo.lock`. Bảng phiên bản, bảng dòng của bảng đối chiếu, quyết định (QĐ) và điểm cần chủ dự án quyết nằm ở file này, dùng chung cho cả bốn.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-01, theo §6.12)

Kiểm bằng `cargo info <crate>` và API của crates.io (bản ổn định mới nhất, ngày phát hành, MSRV, giấy phép, có bị yanked không), theo luật "bản ổn định mới nhất đã ra ít nhất 1 ngày" (§6.12). Bảng này chung cho 02a, 02d, 02b và 02c.

| Thành phần | Phiên bản | Dùng ở | Ghi chú tương thích |
|---|---|---|---|
| ferrous-opencc | 0.4.0 (`default-features = false`, feature `t2s-conversion`) | `pipeline` | Bản mới nhất (2026-04-18), không bị yanked; Apache-2.0; thuần Rust, chỉ kéo bảng đổi phồn thể sang giản thể (`fst`, `rkyv`), không thư viện C. Không ghi MSRV; build được với 1.98.1 |
| log | 0.4.34 | `pipeline` | Cùng bản app dùng từ 01 |
| thiserror | 2.0.21 (workspace) | `pipeline` | Đã có trong workspace |
| miniz_oxide | 0.9.1 (`default-features = false`, feature `with-alloc`) | `pipeline` | Tỉ lệ nén zlib của chữ chép lời (luật chuỗi lặp, Q11 của review 02b). Bản mới nhất (2026-03-13), MIT OR Zlib OR Apache-2.0, thuần Rust. `Cargo.lock` còn 0.8.x do crate khác kéo vào; hai bản thuần Rust không xung đột |
| libc | 0.2.189 | `asr-worker`, `pipeline` (Unix), `audio-capture` (macOS) | Bản ổn định mới nhất của dòng 0.2 (2026-07-21); 1.0.0-alpha.4 là alpha nên không dùng; MSRV 1.65. `audio-capture` dùng `proc_pidpath`, `proc_pidinfo` (gộp tiến trình helper) |
| objc2-app-kit | 0.3.2 (`default-features = false`, feature `std`, `libc`, `NSRunningApplication`) | `audio-capture` (macOS) | Tên hiển thị của app đang phát tiếng (`localizedName`, Q8 của review 02c). Bản mới nhất (2025-10-04), MSRV 1.71, cùng bản Tauri và `tauri-nspanel` đang kéo vào `Cargo.lock` |
| whisper-rs-sys | 0.15.0 (bản đã vá ở `third_party/`, qua `[patch.crates-io]`) | `asr-worker` (phụ thuộc trực tiếp) | Chỉ để đọc bảng thiết bị ggml (`backend.rs`); `deny.toml` cho thêm `asr-worker` làm wrapper. Vẫn chỉ có một bản ggml trong `asr-worker`, không có trong tiến trình chính |
| windows | 0.62.2 | `pipeline` (Windows: `Win32_Foundation`, `Win32_Security`, `Win32_System_JobObjects`, `Win32_System_Threading`); `audio-capture` thêm `Win32_Devices_FunctionDiscovery`, `Win32_UI_Shell_PropertiesSystem`; app thêm `Win32_System_LibraryLoader` (02c) | Cùng bản Tauri, 01 và `audio-capture` đang dùng |
| sha2 | 0.11.0 | app (build-dependency và dependency, 02c) | Bản ổn định mới nhất (2026-03-25), MSRV 1.85, MIT OR Apache-2.0. `Cargo.lock` còn sha2 0.10.9 do `tauri-codegen` và `wry` kéo vào từ trước; hai bản Rust thuần không xung đột |
| rtrb | 0.4.0 (workspace) | app (02c) | Đã có trong `audio-capture`; app cần kiểu `Producer`/`Consumer` để mở nguồn |
| hound | 3.5.1 (workspace) | `pipeline` (dev-dependency) | Đã có; test đọc file WAV |

Ghi chú:
- Không thêm gói npm nào ở kế hoạch 02 (`pnpm-lock.yaml` giữ nguyên như sau 01). Script đo trong `$W` (venv faster-whisper, tải nhạc CC0) không vào repo.
- Không crate mới nào kéo ggml hay thư viện C vào tiến trình chính. Riêng `candle-core` 0.11 (có từ Giai đoạn 0) luôn kéo `tokenizers` với feature `onig`, tức thư viện C oniguruma nằm trong tiến trình chính. Điều này có từ trước kế hoạch này, nhưng lần đầu lộ ra khi kiểm code Windows trên Mac (QĐ15); ghi ở điểm cần chủ dự án quyết.
- `cargo deny check` sạch sau mỗi task thêm crate; `cargo audit` còn 3 cảnh báo cũ đã được cho phép (`paste`, `proc-macro-error`, `glib`).

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, sau khi 01 đã xong hẳn (Task 26 của 01 đã commit). Trước mỗi task, `git status` phải sạch.
- **Khối code.**
  - "Tạo `<file>`": chép nguyên khối vào file mới.
  - "Thay toàn bộ `<file>` bằng": ghi đè cả file.
  - "Sửa `<file>` (áp bằng `git apply`)": khối `diff` là bản vá chuẩn; lưu khối vào một file tạm rồi chạy `git apply <file tạm>` từ gốc repo. `git apply --check` báo lỗi nghĩa là cây file đã lệch so với kế hoạch: dừng lại, đừng sửa tay cho khớp.
  - "Tạo `<file>`, lúc này mới có phần test": file chỉ có các dòng `//!` đầu và khối `#[cfg(test)] mod tests`; bước sau thêm phần code vào giữa hai phần đó.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task trên một worktree sạch, với target riêng còn trống (2026-10-01). Đường dẫn đã đổi về gốc repo. Thời gian chạy (`finished in …`) và id luồng sẽ khác; số test và tên lỗi phải giống. Có ba chỗ khối Expected là trích, và câu dẫn ghi rõ: bước đỏ chỉ in 6 dòng lỗi khác nhau đầu tiên (output thật có thể dài hơn; mọi dòng in ra đều có thật), bước có `grep`/`head` trong lệnh, và các bảng đo "lúc lập kế hoạch". `Cargo.lock` sinh lại có thể khác chuỗi commit của kế hoạch ở vài cạnh phụ thuộc (ví dụ `cssparser-macros` → `syn` 2 hay 3, `tempfile` → `getrandom` 0.3 hay 0.4: hai crate khai khoảng phiên bản rộng), nhưng không khác ở tập gói; không cần sửa tay.
- **`node_modules`.** Repo chính có sẵn `node_modules` từ kế hoạch 01. Làm trên một worktree mới thì chạy `pnpm install --frozen-lockfile` một lần trước 02c (lần `pnpm test` đầu tiên là ở 02c Task 2), như 02c Task 7 Step 3 (Nhỏ-8 của review 02 lần 4).
- **Đường dẫn trong lệnh.** Model và `llama-server` của Giai đoạn 0 nằm ở `models/` và `tools/` (có sẵn trên máy dev, bị `.gitignore` bỏ qua; xem `bench/phase0/fetch.py`). Lệnh `cargo test` chạy test với thư mục làm việc là thư mục của crate, nên biến môi trường trỏ tới model dùng đường dẫn tuyệt đối (`$PWD/models/…`, chạy từ gốc repo).
- **Không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00): không task nào trong file này chạy tap thu âm thật hay mở System Settings. Test `#[ignore]` của `audio-capture` chỉ đọc thuộc tính của Core Audio HAL, không cần quyền.
- **Task cần máy rảnh** (mục 6.9): Task 7–9 của 02b chạy lại A3, A4, S6, lâu và nặng, S6 đo thời gian. Agent dừng ở đó, nhờ người đóng app nặng và cắm sạc, chờ xác nhận rồi mới chạy.
- **Task cần người hoặc Windows:** ghi ở đầu task.

## Kiểm bằng mutation lúc lập kế hoạch

Script đặt ngoài repo, chạy trên cây cuối của 02: mỗi mutation sửa một chỗ của code, chạy test phải bắt nó, rồi trả code về như cũ. Danh sách gồm mọi mutation của người review lần 2 (kể cả các mutation còn sống lúc đó: LG1–LG3, W1, W3, R1, PF1, PF3, PF5, O1), các mutation còn sống ở review 02a (H2, H3, S8, S12, P5, K1–K3), các mutation còn sống ở review lần 3 (A3, B1, B6, C3, C6, C7, D3, E1–E5, F4, F5, QA3+QA2, QC4, QG3, QE2, QE5, N6; tên có thêm `r` khi viết lại theo code mới), và một mutation cho mỗi chỗ sửa của review lần 2 và lần 3. Vài chỗ có hai lớp chặn cho cùng một việc; bỏ một lớp thì lớp kia vẫn giữ đúng hành vi, nên mutation của từng lớp sống, còn mutation bỏ cả hai lớp thì bị giết: kiểm `closing` ở `transcribe` (C1) và đầu vòng `start_asr` (C2); ở `with_llama` (C4) và `start_llama` (C3); `-ngl 0` theo `exe_gpu` (N2) và theo `asr_on_cpu` (N3); `grow` cập nhật mục đang chờ (QA1) và `dispatch` bỏ mục cũ (QA2); lần bắt đầu đã hủy mà chuẩn bị lỗi kiểm `current()` (QE3) và `start_failed` kiểm số lần bắt đầu (QE4). Thử lại sau khi bỏ cuộc đặt lại `asr_on_cpu` (GP3) cũng là lớp thừa: `Ready` của `asr-worker` đặt lại cờ đó theo thiết bị thật. Nhãn `(âm nhạc)` trùng `[âm nhạc]` sau khi mọi kiểu ngoặc so như nhau (G1, cố ý giữ cả hai). Riêng `remember` kill tiến trình vừa chạy lúc đang thoát (RM) và kiểm `closing` sau `Ready` (C5) chỉ có tác dụng khi `shutdown` xen vào đúng giữa lúc chạy tiến trình và lúc ghi `Killer`: không dựng được test tất định cho đường chạy đua này, nên RM, C5 và cặp C5+RM vẫn sống. B6 (lỗi chép lời gửi app không kèm log của whisper.cpp) cũng sống: không dựng được một lỗi chép lời thật của whisper.cpp trong test; đường kèm log đã có test ở lỗi `Load`. Phần nối trong vòng lặp `capture_loop` (gửi sự kiện của `failure_event`: QC4l; `break` khi `Watch` báo mở lại: QG3l; đặt `new_process`: OT4r) không có test: nó chỉ chuyển kết quả của các hàm thuần đã có test (`failure_event`, `Watch::tick`, `pids_changed`), và được kiểm bằng tay ở 02c Task 8 Step 4–6. Kết quả (`bị giết`: có test đỏ):

```text
H2 bỏ sắp cụm dài trước: bị giết ['test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.00s']
H3 dư dưới 3 ký tự vẫn bỏ: bị giết ['test result: FAILED. 11 passed; 2 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.00s']
L1 nhãn có ngoặc so như câu thường: bị giết ['test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.00s']
S8 Error của worker vẫn khởi động lại: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 4.26s']
S12 ModelLoad trên CPU không bỏ cuộc: bị giết ['test result: FAILED. 33 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.75s']
P5 nhận kết quả sai id: bị giết ['test result: FAILED. 10 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.56s']
K1 Debug in khóa: bị giết ['test result: FAILED. 10 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.52s']
K2 log {cmd:?}: bị giết ['test result: FAILED. 10 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.53s']
K3 log không che khóa: bị giết ['test result: FAILED. 10 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.53s']
C1 transcribe không kiểm closing: SỐNG 
C2 start_asr không kiểm closing đầu vòng: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.75s']
C3 start_llama không kiểm closing đầu vòng: SỐNG 
C4 with_llama không kiểm closing: SỐNG 
C5 sau Ready không kiểm closing (asr): SỐNG 
C6 C2+C5 cùng lúc: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.78s']
W1 shutdown không ngắt Wake: bị giết ['test result: FAILED. 32 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.80s']
W2 SystemClock bỏ qua Wake: bị giết ['test result: FAILED. 32 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.84s']
W3 backoff dùng Wake mới (không ngắt được): bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.55s']
KL shutdown không kill: bị giết ['test result: FAILED. 33 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 120.59s']
R1 running() khóa slot: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.37s']
N1 llama không theo asr sang CPU: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.77s']
N2 không GPU mà llama vẫn ngl auto: SỐNG 
N3 asr_on_cpu khởi tạo false: SỐNG 
B1 bỏ before_spawn của asr: bị giết ['test result: FAILED. 32 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.78s']
B2 bỏ before_spawn của llama: bị giết ['test result: FAILED. 32 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.86s']
F1 lần đầu quá giờ (asr) bị tính lỗi: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.90s']
F2 lần đầu quá giờ (llama) bị tính lỗi: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.74s']
O1 llama hết bộ nhớ không phát OutOfMemory: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.78s']
O2 asr OutOfMemory không phát: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.00s']
PF1 bỏ kiểm process group: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.04s']
PF2 bỏ kiểm thời điểm bắt đầu: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.03s']
PF3 bỏ kiểm đường dẫn binary: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.02s']
PF4 bỏ kiểm thư mục cho phép: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.02s']
PF5 spawn không ghi pidfile: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.03s']
V1 validate bỏ queue.asr_merge_max_ms: bị giết ['test result: FAILED. 4 passed; 2 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
V2 validate bỏ audio.silent_rms NaN: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
T1 ngưỡng zh->vi 6,6: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
T2 ngưỡng vi->en 1,6: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
LG1 asr-worker không cài log callback: bị giết ['test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s']
LG2 classify bỏ qua log: bị giết ['test result: FAILED. 22 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s']
LG3 callback không ghi stderr: bị giết ['test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s']
Q1 OutOfMemory lúc chép lời bị bỏ như lỗi thường: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.01s']
LC1 dòng dài không bỏ phần đuôi có thể chứa nửa bí mật: bị giết ['test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 149 filtered out; finished in 0.19s']
LC2 dòng dài không cắt: bị giết ['test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 149 filtered out; finished in 0.01s']
V3 validate bỏ chặn dưới mt_skip_after_ms: bị giết ['test result: FAILED. 4 passed; 2 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
V4 validate bỏ chặn dưới window_extra_ms: bị giết ['test result: FAILED. 4 passed; 2 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
L2 bỏ nhãn (音楽): bị giết ['test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.00s']
QA1 ghép thêm lúc đang dịch thì thêm mục thứ hai: SỐNG 
QA2 dispatch gửi cả mục cũ: SỐNG 
QB ZeroWatch không tắt sau khi đã có âm thanh thật: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
QC app đóng sau khi đã thu được vẫn dừng phiên: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
QG1 StallWatch không đếm lại khi có khung mới: bị giết ['test result: FAILED. 9 passed; 2 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.03s']
QG2 tập pid đổi mà không mở lại: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
QE giữ khóa phiên suốt lúc chuẩn bị: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 10.08s']
QT bỏ kiểm hạn mức: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.36s']
N2 đọc stdout của probe không giới hạn: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 151 filtered out; finished in 0.65s']
N5 meta không so llama_server_bytes: bị giết ['test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 29 filtered out; finished in 0.01s']
S1 phụ đề gộp bị bỏ khi id nhỏ hơn dòng đầu: bị giết []
N3 init ghi đè cài đặt mới hơn: bị giết []
N9 WebKit không có tên dễ hiểu: bị giết []
N2+N3 không GPU mà llama vẫn ngl auto, và asr_on_cpu khởi tạo false: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.98s']
QA1+QA2 ghép thêm thì thêm mục thứ hai, và dispatch gửi cả mục cũ: bị giết ['test result: FAILED. 22 passed; 1 failed; 0 ignored; 0 measured; 130 filtered out; finished in 0.37s']
C3+C4 start_llama và with_llama không kiểm closing: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.21s']
RM tiến trình vừa chạy lúc đang thoát vẫn được giữ: SỐNG 
C5+RM sau Ready không kiểm closing, và tiến trình vừa chạy lúc đang thoát vẫn được giữ: SỐNG 
A3 OOM lúc chép lời chuyển CPU ngay lần đầu: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.76s']
B1 worker không xóa log giữ lại trước mỗi yêu cầu: bị giết ['test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s']
B6 lỗi Transcribe gửi app không kèm log: SỐNG 
C3r running() chỉ xét asr: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.75s']
C6r chờ sau lần đầu quá giờ không ngắt được: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.83s']
C7r backoff của llama không ngắt được: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 5.73s']
D3r spawn ghi exe không canonicalize: bị giết ['test result: FAILED. 15 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.04s']
E1r failure_window_ms chặn dưới thành 1 ms: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
E2r no_audio_after_ms chặn dưới thành > 0: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
E3r asr_merge_max_ms bỏ trần 30 s: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
E4r silent_rms cho phép số âm: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
E5r n_threads bỏ trần 64: bị giết ['test result: FAILED. 5 passed; 1 failed; 0 ignored; 0 measured; 147 filtered out; finished in 0.00s']
F4r cắt bớt 10 byte thay vì độ dài bí mật dài nhất: bị giết ['test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 149 filtered out; finished in 0.01s']
F5r dòng bị cắt không che bí mật trọn vẹn: bị giết ['test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measured; 149 filtered out; finished in 0.01s']
G6 ngoặc toàn khổ và 【】 không đổi về ngoặc thường: bị giết ['test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.00s']
QA3+QA2 câu đang chờ ghép thêm thì thêm mục, và dispatch gửi cả mục cũ: bị giết ['test result: FAILED. 22 passed; 1 failed; 0 ignored; 0 measured; 130 filtered out; finished in 0.37s']
QC4r không báo chỉ báo chờ app: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
QG3r tap chết mà không mở lại: bị giết ['test result: FAILED. 9 passed; 2 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
SB StallWatch không giãn khi mở lại liên tiếp: bị giết ['test result: FAILED. 9 passed; 2 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
PS tập pid thu nhỏ cũng mở lại: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
QE2r Hủy không tăng attempt: bị giết ['test result: FAILED. 18 passed; 2 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.35s']
QE5r bỏ cả ba lần kiểm current() trên đường thành công: bị giết ['test result: FAILED. 18 passed; 2 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.36s']
N6r allow_retry không quên lý do bỏ cuộc cũ: bị giết ['test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 152 filtered out; finished in 0.00s']
R1 bấm Bắt đầu không gọi allow_retry: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.35s']
R2 SidecarManager::allow_retry không làm gì: bị giết ['test result: FAILED. 31 passed; 4 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.55s']
R7 lần đã hủy nạp lỗi vẫn để chỉ báo nạp model: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.36s']
R8 lỗi bắt đầu trong trạng thái mà thanh báo lỗi cũ còn: bị giết []
R1b allow_retry gọi sau prepare: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.34s']
R2b prewarm cũng gọi allow_retry: bị giết ['test result: FAILED. 19 passed; 1 failed; 0 ignored; 0 measured; 137 filtered out; finished in 0.36s']
R3 LiveDeps::allow_retry không gọi SidecarManager::allow_retry: bị giết ['test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 152 filtered out; finished in 0.00s']
R5 allow_retry chỉ bật cờ của asr: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.58s']
R6 begin_session cũng cho thử lại: bị giết ['test result: FAILED. 33 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.85s']
R7 thử lại không quên Tampered: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.75s']
R8 start_llama không xem cờ thử lại: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.58s']
GP1 thử lại asr-worker vẫn giữ CPU: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.98s']
GP2 thử lại llama-server vẫn giữ -ngl 0: bị giết ['test result: FAILED. 34 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.96s']
GP3 thử lại không đặt lại asr_on_cpu: SỐNG 
CF1 Ready bằng GPU không bỏ chỉ báo CPU: bị giết ['test result: FAILED. 4 passed; 1 failed; 0 ignored; 0 measured; 152 filtered out; finished in 0.01s']
SB1r Watch không đếm lại bậc chờ khi có khung: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
SB2r Watch mở lại với ngưỡng cố định: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
SB3r Watch không ghi lần mở lại vì tap chết: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
SB6 StallWatch bỏ qua ngưỡng after: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
SB8 có khung trở lại mà vẫn giữ ngưỡng dài: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.02s']
QG3s Watch không xét kết quả StallWatch: bị giết ['test result: FAILED. 10 passed; 1 failed; 0 ignored; 0 measured; 146 filtered out; finished in 0.04s']
QG3l capture_loop không mở lại khi Watch báo: SỐNG 
OT4r capture_loop không đặt new_process: SỐNG 
QC4l capture_loop không gửi sự kiện của failure_event: SỐNG 
G1 bỏ nhãn (âm nhạc) (trùng [âm nhạc]): SỐNG 
G9 is_label bỏ 〔〕: bị giết ['test result: FAILED. 12 passed; 1 failed; 0 ignored; 0 measured; 140 filtered out; finished in 0.01s']
```

## Dòng của bảng đối chiếu giao cho kế hoạch 02

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00 (145 dòng có `02`). Cột "Task" ghi task theo file: `a<số>` là 02a, `d<số>` là 02d, `b<số>` là 02b, `c<số>` là 02c; dòng nào còn phần chờ thì ghi mã chờ.

| # | Yêu cầu (rút gọn) | Phần của 02 | Task |
|---|---|---|---|
| 1 | D1: phụ đề dịch cho mọi âm thanh máy đang phát; không cần bot, plugin hay tài khoản trên nền… | thu toàn hệ thống trên cả hai hệ điều hành, nối vào phiên | b5, c2, c3; A1 ở 08 |
| 4 | D4: Tauri 2, React 19, TypeScript, Vite, Zustand; mỗi engine chạy trong một tiến trình phụ… | mỗi engine một tiến trình phụ, có giám sát | d1, d3 |
| 6 | D6: Whisper chạy qua whisper.cpp | `asr-worker` giao thức bản 2 | a1 |
| 7 | D7: xử lý 100% trên máy, âm thanh không rời máy | tiến trình phụ chỉ nghe `127.0.0.1` hoặc stdin/stdout; âm thanh chỉ trong RAM | d1, c2 |
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
| 44 | Gói có hạn mức (Free, Professional, X2): nhắc khi còn 5 phút; hết thì dừng phiên… | dừng phiên với `quotaExhausted` (`Fatal::QuotaExhausted`, `Engine::exhaust_quota`); hiển thị ở 03, đếm ở 06 | b2, c3 |
| 45 | Bấm Dừng để kết thúc phiên, sau đó mở được bản chép lời của phiên | Dừng: chốt đoạn dở, xử lý nốt, thanh phụ đề giữ nguyên | b2, c3 |
| 46 | Màn hình chính: trạng thái (Sẵn sàng, Đang dịch, Lỗi); nút Bắt đầu/Dừng; ngôn ngữ đích và tập… | màn hình chính: trạng thái, lỗi, nguồn âm thanh, mức âm lượng | c6; số phút ở 06 |
| 52 | Cài đặt, nhóm Âm thanh: nguồn âm thanh, độ nhạy ngắt câu | Cài đặt › Âm thanh: nguồn âm thanh, độ nhạy ngắt câu | c6 |
| 61 | Thoát ở menu khay: dừng phiên như khi bấm Dừng, tắt hai tiến trình phụ, rồi mới thoát | Thoát: dừng phiên, tắt hai tiến trình phụ | c3 |
| 66 | Bản dịch hiện dần từng chữ trong lúc model đang dịch | `subtitle://delta` trong lúc dịch | b2, c3, c5 |
| 67 | Phụ đề tạm: câu chưa chốt màu nhạt hơn; người nói nói tiếp thì thay bằng bản dịch của cả câu… | phụ đề tạm và thay bằng bản dịch câu đã ghép | a2, b2 |
| 73 | Chỉ báo nhỏ: đang nghe, không có âm thanh, đang trễ | chỉ báo không có âm thanh, đang trễ, dịch không dùng được | b2, c3 |
| 336 | Thanh phụ đề ẩn lúc mở app, kể cả khi khởi động cùng hệ thống; bắt đầu phiên thì hiện; dừng… | bắt đầu phiên thì hiện thanh phụ đề, dừng thì giữ nguyên (test của 01 vẫn qua) | c3 |
| 78 | Engine hoặc driver GPU crash thì app vẫn chạy và tự khởi động lại engine | engine crash thì tự khởi động lại, app vẫn chạy | d3 |
| 79 | Tiến trình phụ chạy khi người dùng mở cửa sổ chính hoặc bấm Bắt đầu; tắt sau 10 phút không dịch | chạy tiến trình phụ khi mở cửa sổ chính hay bắt đầu; tắt sau 10 phút rảnh | d3, c3 |
| 80 | `asr-worker` chạy trước; `llama-server` chạy sau khi `asr-worker` nạp xong model | `asr-worker` trước, `llama-server` sau | d3 |
| 81 | Lần đầu phải chờ nạp model: thanh phụ đề hiện "Đang nạp model…"; thời gian này không tính vào… | trạng thái nạp model | d3, c3 |
| 82 | Việc cho MVP §5: Job Object (`KILL_ON_JOB_CLOSE`) trên Windows và process group trên macOS, để… | process group và hook panic (macOS), Job Object (Windows) | d1, c3; c9 (Win) |
| 84 | Interface chung `AudioSource` (`start`, `stop`, `format`) | `AudioSource` thêm `failed()` | b5 |
| 85 | Windows, chế độ tự động: loopback của thiết bị Console và thiết bị Communications (nếu khác)… | chế độ tự động Console và Communications trong app | b5, c2; c9 (Win), chờ C2 |
| 86 | Windows: luồng thu đọc theo timer, tự chèn im lặng theo vị trí QPC khi loopback không trả gói… | chèn im lặng (có từ GĐ0); app chèn thêm theo đồng hồ thật khi nguồn chưa chạy | b5, c2; c9 (Win), chờ C2 |
| 87 | Windows: người dùng chọn thủ công được một thiết bị | chọn tay một thiết bị: liệt kê thiết bị, mở theo id | b5, c4, c6; c9 (Win) |
| 88 | Đổi thiết bị phát: hỏi định kỳ 500 ms chữ ký thiết bị phát mặc định và mở lại nguồn khi luồng… | khởi tạo lại khi thiết bị đổi (hỏi định kỳ, QĐ16) | b5, c2; c9 (Win) |
| 89 | Windows: không dùng process loopback trong MVP; hệ quả là app thu mọi âm thanh của máy | không dùng process loopback | b5 |
| 90 | macOS: Core Audio process tap đọc qua aggregate device; mặc định tap toàn hệ thống, trừ chính… | tap toàn hệ thống trừ chính app, trong app | c2; chờ C1 |
| 91 | macOS, tùy chọn: chỉ tap một app họp, chọn từ danh sách app đang phát âm thanh | danh sách app đang phát tiếng, tap một app | b5, c2, c4, c6 |
| 92 | macOS: khai báo `NSAudioCaptureUsageDescription` trong Info.plist của app | `NSAudioCaptureUsageDescription` | c4; câu tiếng Anh ở 07 |
| 93 | macOS: gọi API qua `objc2` và `objc2-core-audio`, không dùng `coreaudio-sys` | objc2 (có từ GĐ0) | b5 |
| 94 | Callback thu âm không cấp phát bộ nhớ, không lock, chỉ ghi vào ring buffer lock-free (`rtrb`)… | ring buffer 30 giây trong app | b5, c2 |
| 95 | Gộp về mono, resample bằng `rubato` từ tần số thiết bị xuống 16 kHz, chia khung 512 mẫu (32… | mono, resample, khung 512 mẫu (có từ GĐ0) trong luồng tiền xử lý | b5, b2 |
| 96 | Silero VAD: ngưỡng 0,5; tiếng nói ngắn nhất 250 ms; im lặng 300 ms thì chốt đoạn, chỉnh được… | ngưỡng của segmenter vào `PipelineConfig`; độ nhạy ngắt câu từ cài đặt | a2, c3 |
| 97 | Ghép câu và phụ đề tạm: không có dấu câu kết thúc thì phụ đề là tạm; cửa sổ ghép max(700 ms… | ghép câu và phụ đề tạm chuyển vào `pipeline` | a2 |
| 98 | Đầu ra `Segment { id, start_ms, end_ms, samples }`, thời gian tính từ lúc bắt đầu phiên theo… | thời gian từ đầu phiên theo đồng hồ thật | b2, c2 |
| 99 | Silero VAD v6.2.3 chạy bằng `candle-onnx` trong tiến trình chính; không dùng `ort`; state LSTM… | VAD trên luồng riêng stack 8 MiB, vẫn chạy khi `asr-worker` khởi động lại | b2 |
| 100 | Việc cho MVP §6.3: chọn luật ghép câu tốt hơn cho zh và ja (ví dụ khoảng nghỉ đủ dài là hết… | luật ghép câu zh/ja từ dữ liệu hội thoại thật | chờ Q6; giữ luật hiện tại |
| 349 | `Segment` có thêm `speech_ms` (độ dài tiếng nói, không gồm đệm); `start_ms`, `end_ms` không… | `Segment.speech_ms`; `start_ms`, `end_ms` không gồm đệm; đoạn gộp cộng `speech_ms` (QĐ25) | a2, b1 |
| 101 | Engine whisper.cpp qua `whisper-rs` trong tiến trình phụ `asr-worker` link tĩnh; Metal trên… | Metal trên macOS; lỗi GPU thì CPU | a1, d3; Vulkan ở c9 (Win), chờ C3 |
| 102 | Giao thức stdin/stdout: khung 4 byte độ dài (`u32` LE) cộng postcard, tối đa 16 MiB; mỗi yêu… | giao thức có thêm trường mới, giữ các luật khung | a1 |
| 103 | Mở rộng giao thức: chỉ thêm biến thể ở cuối; app và `asr-worker` luôn build cùng nhau | `protocol_version`, chỉ số enum mới cũng bị khóa | a1 |
| 104 | Log của thông điệp không bao giờ chứa âm thanh hay nội dung chép lời | `Debug` của trường mới không lộ nội dung | a1 |
| 105 | Hai bản trên Windows, `asr-worker-vulkan` và `asr-worker-cpu`; mỗi lần app khởi động chạy nền… | chạy `--probe`, chọn bản theo kết quả | c3; c9 (Win), chờ C3 |
| 106 | Tiến trình phụ lỗi: khởi động lại, chờ 1, 2, 5 giây; lần đầu chạy binary mới chờ `Ready` theo… | luật khởi động lại, gửi lại đoạn, chuyển CPU, bỏ cuộc | d3 |
| 108 | Chế độ giải mã B (`shared`, cần feature `shared-encode` và bản vá ở `third_party/`) là mặc… | app từ chối worker không ở chế độ B | d3 |
| 109 | Chọn ngôn ngữ: chuẩn hóa xác suất trong tập cho phép; đoạn từ 1,5 giây dưới 0,5 thì giữ ngôn… | giữ ngôn ngữ trước theo `prev_lang` trong yêu cầu | a1 |
| 110 | Giải mã greedy, không temperature fallback, chặn token không phải tiếng nói; prompt là tối đa… | prompt theo ngôn ngữ, giữ ở tiến trình chính | d1 |
| 111 | `audio_ctx = min(1500, max(512, 50 × số giây + 64))`, làm tròn lên (`MIN_AUDIO_CTX`… | không đổi (có từ GĐ0) | — |
| 112 | Flash attention tắt; `ASR_FLASH_ATTN=1` chỉ để thử | không đổi (có từ GĐ0) | — |
| 113 | Làm nóng: sau `Load`, app gửi `Warmup` | app gửi `Warmup` sau `Load` | d3 |
| 114 | Lọc ảo giác: bỏ đoạn khi `no_speech_prob > 0,6` và `avg_logprob < −1`, và đoạn có chữ rỗng… | luật bỏ đoạn chuyển vào `pipeline` | a2 |
| 115 | Việc cho MVP §6.4: thử `no_speech_prob` trên im lặng, nhiễu và nhạc, nhất là với turbo | công cụ đo, chạy đo im lặng và nhiễu | b3, b6; nhạc chờ người (Đ12) |
| 116 | Việc cho MVP §6.4: luật lặp khi prompt dài (trần còn khoảng 119 token, câu chép đôi dài từ… | prompt không làm hạ trần token (QĐ3) | d1 |
| 117 | Việc cho MVP §6.4: chọn ngưỡng giữ ngôn ngữ trước theo số ngôn ngữ trong tập, dựa trên đoạn… | ngưỡng giữ ngôn ngữ theo số ngôn ngữ | chờ Q6 |
| 118 | Việc cho MVP §6.4: bộ lọc câu ảo giác quen thuộc ("Thank you for watching", "Hãy subscribe cho… | lọc câu ảo giác quen thuộc | a3 |
| 119 | Việc cho MVP §6.4: bật `shared-encode` mặc định cho bản phát hành; app từ chối worker có… | app từ chối `decode_mode` khác `shared` | d3, c3; bản phát hành ở 07 |
| 120 | Việc cho MVP §6.4: với zh, chuyển phồn thể sang giản thể ở tầng app | phồn thể sang giản thể | a3 |
| 121 | Việc cho MVP §6.4: xem lại flash attention khi upstream có mask cho phần đệm… | kiểm upstream: #3941 vẫn mở, giữ tắt | điểm cần quyết 5; 08 |
| 122 | Việc cho MVP §6.4: trước khi gửi bản vá `set_audio_ctx` lên upstream, hàm C trả −1 khi giá trị… | bản vá trả −1 và `Result` | a1 |
| 123 | Việc cho MVP §6.4: đưa `prev_lang` vào `TranscribeRequest`, worker không giữ trạng thái nhận… | `prev_lang` trong `TranscribeRequest` | a1 |
| 124 | Việc cho MVP §6.4: trong `asr-protocol`, `backend` và `decode_mode` thành enum | enum `Backend`, `DecodeMode` | a1 |
| 125 | Việc cho MVP §6.4: `Error` có thêm `kind` (`NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`… | `Error.kind` | a1 |
| 126 | Việc cho MVP §6.4: `Ready` có thêm `protocol_version`, app từ chối worker lệch phiên bản | `Ready.protocol_version`, app từ chối lệch phiên bản | a1, d1 |
| 127 | Việc cho MVP §6.4: `asr-worker` giữ riêng stdout cho giao thức, chuyển fd 1 sang stderr | stdout chỉ cho giao thức | a1 |
| 128 | Việc cho MVP §6.4: log của `asr-worker` (mở chế độ append) có xoay vòng hoặc giới hạn kích… | log của tiến trình phụ append và xoay vòng | d1 |
| 129 | MVP cần `Ready.backend` trả thiết bị thật, không phải backend được yêu cầu, để áp quy tắc… | `Ready.backend` là thiết bị thật | a1 |
| 130 | Chạy lại lượt fullctx với bản build chốt, để có số so sánh cùng cấu hình cho giả định 8 | chạy lại lượt fullctx | b8 |
| 131 | `llama-server` khóa một phiên bản llama.cpp; macOS dùng Metal; Windows dùng Vulkan và CPU, nạp… | dùng b11146 cho bản dev; Windows và bản tự build ở đợt Windows và 07 | d1; c9 (Win), 07 |
| 132 | Lệnh chạy `--host 127.0.0.1 --port <cổng trống ngẫu nhiên> -c 2048 -np 1 -ngl auto --no-ui`… | lệnh chạy, `/health` | d1 |
| 133 | API key truyền qua biến môi trường `LLAMA_API_KEY`, chỉ đặt cho tiến trình `llama-server`… | `LLAMA_API_KEY` qua biến môi trường, không `--api-key` | d1 |
| 134 | Không truyền `-ngl 99`; chạy `llama-server` sau khi `asr-worker` nạp model, để `--fit` tính cả… | không `-ngl 99`; chạy sau `asr-worker` | d1, d3 |
| 135 | Server lỗi: tự khởi động lại, chờ 1, 2, 5 giây; quá 5 lần trong 10 phút thì báo lỗi, phụ đề… | luật khởi động lại `llama-server` | d3 |
| 136 | Lần đầu chạy binary mới (sau khi cài hoặc cập nhật): chờ `/health` hay `Ready` tới 180 giây… | chờ lâu hơn ở lần đầu, không tính lỗi; trạng thái "Đang chuẩn bị lần đầu" | d3, c1, c3; số thật chờ T1 |
| 137 | API `/v1/chat/completions` với `stream: true`, chat template lấy từ GGUF; kết luận S4 chỉ áp… | stream, chat template từ GGUF (có từ GĐ0) | d1; S4 Windows ở c9, chờ C4 |
| 138 | Phương án dự phòng: render template bằng `minijinja` rồi gọi `/completion`, truyền mảng token… | phương án dự phòng `/completion` | không làm: chỉ khi S4 Windows không đạt (C4) |
| 139 | Mẫu prompt theo model card Hy-MT2: mẫu tiếng Trung khi câu liên quan tới tiếng Trung, còn lại… | không đổi (có từ GĐ0) | — |
| 141 | Đưa câu trước vào làm ngữ cảnh: cờ thử nghiệm `experimental.translationContext`, mặc định tắt | cờ ngữ cảnh câu trước | b2, c3 |
| 142 | Tham số sinh: temperature 0, repeat penalty 1,05, số token tối đa min(4 × số token câu gốc +… | không đổi (có từ GĐ0) | — |
| 143 | Bật `cache_prompt`; gửi một request làm nóng khi bắt đầu phiên | `cache_prompt`; request làm nóng khi bắt đầu phiên | d1, b2 |
| 144 | Hậu xử lý trong lúc stream: cắt khoảng trắng thừa; giữ vài token đầu tới khi chắc không phải… | hậu xử lý trong lúc stream | d2 |
| 145 | Bản dịch quá dài, đo bằng token theo từng cặp: Anh→Việt 4,4; Trung→Việt 6,6; Nhật→Việt 3,5… | ngưỡng tỉ lệ token theo cặp | d2 |
| 146 | Thử lại một lần với repeat penalty 1,15; vẫn lỗi thì hiện câu gốc, đánh dấu "chưa dịch được" | thử lại với repeat penalty 1,15, rồi `failed` | d2 |
| 147 | Bỏ bước dịch khi ngôn ngữ câu gốc trùng ngôn ngữ đích | bỏ bước dịch khi trùng ngôn ngữ đích | b2 |
| 148 | Việc cho MVP §6.5 (đã chọn): cách 2, chỉ áp tỉ lệ khi câu gốc từ 10 token; câu ngắn hơn chỉ… | cách 2 (QĐ12) | d2; chờ Q4 |
| 149 | Việc cho MVP §6.5: đo ngưỡng cho các cặp không có tiếng Việt, và cho câu gốc dưới 3 token | công cụ đo; chạy đo | b4, b6; duyệt ngưỡng: điểm cần quyết 4 |
| 151 | Cấu trúc `Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status, replaces }`… | `Subtitle`, thêm `replaces` (QĐ9) | b1 |
| 152 | Sự kiện Tauri `subtitle://upsert` (cả đối tượng) và `subtitle://delta` (từng token lúc đang… | `subtitle://upsert` và `subtitle://delta` | b1, b2, c3, c5 |
| 186 | Cách đếm phút cho mọi gói: `speech_ms` của đoạn (không gồm đệm; đoạn gộp cộng từng đoạn con)… | `speech_ms` cộng khi phụ đề sang `done`, phát qua `EventSink::usage` và `SessionMetrics::translated_speech_ms` (QĐ25) | a2, b1, b2; bộ đếm ở 06 |
| 333 | Chạm hạn mức: hạn mức còn 0 thì không cho bắt đầu phiên; đang dịch thì bỏ hàng đợi, chỉ dịch… | bỏ hàng đợi, dịch xong câu đang dịch (hạn `mt.stop_grace_ms`), dừng với `quota_exhausted` (QĐ26) | b2, c3 |
| 205 | Tiến trình phụ đặt ở `src-tauri/binaries/`, tên kèm target triple: `asr-worker` (macOS)… | script chép tiến trình phụ vào `src-tauri/binaries/` | c1; bộ cài ở 07 |
| 217 | Các luồng: callback thu âm (realtime); luồng tiền xử lý và VAD; luồng nhận dạng; luồng dịch… | các luồng theo §7 (QĐ1) | b2 |
| 218 | Hàng đợi từ VAD sang nhận dạng chứa tối đa 3 đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng… | hàng đợi nhận dạng | b1, b2 |
| 219 | Độ trễ bằng thời điểm hiện tại trừ `end_ms` của đoạn đang xử lý; vượt 6 giây thì hiện chỉ báo… | độ trễ và chỉ báo "Đang trễ" | b1, b2 |
| 220 | Hàng đợi dịch chứa tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ vào một request… | hàng đợi dịch, gộp câu | b1, b2 |
| 221 | Câu chờ dịch quá 20 giây thì bỏ bước dịch, chỉ hiện câu gốc (`skipped`) | `skipped` sau 20 giây chờ | b1, b2 |
| 222 | Số đo từng phiên (thời gian cắt đoạn, nhận dạng, dịch, tổng thể) lưu trên máy, không gửi đi… | số đo của phiên vào log | b1, b2, c3; bảng debug ở 03 |
| 338 | Mọi ngưỡng của §6.3–§6.5 và §7 gom trong `PipelineConfig`, mặc định là số đã chốt; 04 nạp phần… | `PipelineConfig`, `validate()`, `vadEndSilenceMs` ghi đè ngưỡng im lặng (QĐ21) | a2, c3 |
| 225 | Ngân sách độ trễ theo bước và mục tiêu p50, p90 trên máy khuyến nghị và máy tối thiểu | chạy lại S6 | b9 |
| 227 | RAM: thiếu RAM khi chạy `llama-server` bằng CPU thì thử `--no-repack` | tham số thêm cho `llama-server` (`extra_args`) | d1, d3 |
| 230 | macOS chưa cấp quyền ghi âm thanh hệ thống (tạo tap lỗi, hoặc buffer toàn im lặng kèm trạng… | lỗi tạo tap thành mã `audioPermission`, nút mở System Settings | c2, c6, c8 (người); chờ C1 |
| 231 | Đang dịch mà hơn 60 giây không có âm thanh vào (theo RMS, kể cả phần im lặng được chèn): thanh… | "Không nghe thấy âm thanh" sau 60 giây | b2 |
| 232 | Thiết bị phát thay đổi (cắm tai nghe, kết nối Bluetooth), phát hiện bằng hỏi định kỳ 500 ms và… | mở lại nguồn khi thiết bị đổi | b5, c2; c8 (người), c9 (Win) |
| 233 | Model thiếu hoặc hỏng: lúc khởi động chỉ kiểm có file và đúng kích thước; SHA-256 đầy đủ kiểm… | kiểm có file model trước khi chạy | c3; kích thước và SHA-256 ở 04 |
| 234 | `asr-worker` không chạy hoặc bị crash (mã thoát, hoặc hết thời gian chờ): tự khởi động lại… | khởi động lại `asr-worker` | d3 |
| 235 | `llama-server` không chạy hoặc bị crash (mã thoát, hoặc `/health` báo lỗi): tự khởi động lại… | khởi động lại `llama-server`, quá giới hạn thì chỉ câu gốc | d3, b2 |
| 236 | GPU khởi tạo lỗi, hoặc máy Windows không có Vulkan: chạy `asr-worker-cpu`, `llama-server` chạy… | chuyển CPU, báo "Đang chạy bằng CPU" | d3, c3; c9 (Win), chờ C3 |
| 237 | Thiếu RAM hoặc VRAM (RAM trống thấp, hoặc tiến trình phụ báo hết bộ nhớ, kể cả bộ nhớ GPU): đề… | `OutOfMemory` thành đề xuất gói Nhẹ | a1, d3, c3; đổi gói ở 04 |
| 238 | Trễ dồn lại (độ trễ > 6 giây): hiện chỉ báo và áp chính sách ở §7 | trễ dồn lại | b1, b2 |
| 247 | Bản dịch lỗi (quá dài, có kèm lời giải thích): cắt stream, thử lại một lần với repeat penalty… | cắt stream, thử lại, rồi câu gốc | d2 |
| 248 | Âm thanh chỉ nằm trong RAM: không ghi xuống đĩa, không gửi qua mạng | âm thanh không ghi xuống đĩa trong app | c2 |
| 250 | `llama-server` chỉ nghe `127.0.0.1`, API key ngẫu nhiên tạo mỗi lần chạy, truyền qua biến môi… | `127.0.0.1`, khóa ngẫu nhiên qua biến môi trường; `asr-worker` không mở cổng | d1 |
| 269 | Bị clone, đổi thương hiệu: đăng ký nhãn hiệu, EULA (pháp lý); logic quan trọng nằm trong Rust… | logic của pipeline nằm trong Rust | a1–a3, d1–d3, c1–c4 |
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
| 287 | Unit: hậu xử lý bản dịch khi đang stream (lọc nhãn và ngoặc kép, ngưỡng tỉ lệ token theo cặp… | test hậu xử lý | d2 |
| 288 | Unit: các trạng thái của phụ đề, kể cả `same_lang`, `skipped`, `dropped` | test trạng thái phụ đề | b1, b2 |
| 295 | Tích hợp: chạy pipeline từ file WAV, kiểm phụ đề có xuất hiện, đúng thứ tự, đúng thời gian | test từ file WAV (clip FLEURS) với tiến trình phụ giả; bản model thật bị bỏ qua mặc định | b2, b3 |
| 296 | Tích hợp: vòng đời hai tiến trình phụ (đúng thứ tự, giả lập crash, tự khởi động lại, gửi lại… | test vòng đời với tiến trình phụ giả và đồng hồ giả | d3 |
| 302 | Thủ công: máy Windows không có Vulkan (ví dụ máy ảo) vẫn mở được app, dùng `asr-worker-cpu`… | máy Windows không có Vulkan | c9 (Win); 08 |
| 304 | Thủ công: khoảng lặng dài trên Windows (tạm dừng video, không ai nói), câu cuối vẫn được chốt… | khoảng lặng dài trên Windows | c9 (Win); 08 |
| 305 | Thủ công, khay: bấm X thì cửa sổ ẩn, phiên không dừng; Thoát ở khay thì không còn tiến trình… | Thoát ở khay không còn tiến trình phụ | c3, c8 (người) |
| 313 | Bảo mật: thay `asr-worker` hoặc `llama-server` bằng file khác thì app từ chối chạy | test thay tiến trình phụ thì bị từ chối | c1 |
| 315 | Bảo mật: log của một phiên dịch không chứa nội dung chép lời | test log của phiên không có chữ chép lời | b2 |
| 318 | Cây thư mục theo §12: `src/windows/{main,overlay}`, `components/`, `store/`, `lib/ipc.ts`… | `session.rs`, `sidecar/`, `capture.rs` | c1–c3 |
| 319 | `asr-protocol`, `asr-worker`, `audio-capture`, `pipeline` có từ Giai đoạn 0, phần lớn code… | dùng lại các crate | a1–a3, d1–d3, c1–c4 |
| 320 | Việc cho MVP §12: giữ `audio-capture` và `pipeline` là crate riêng; `src-tauri` chỉ còn phần… | đã xong ngày 2026-10-01 | — |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ32, dùng chung cho 02a, 02d, 02b và 02c.

- **QĐ1. Luồng riêng và client đồng bộ, không dùng runtime tokio.** Mục 2.2 của kế hoạch 00 giao 02 quyết điểm này; spec §7 đã ghi lại quyết định này.
  - Các luồng: callback thu âm (ở `audio-capture`); luồng VAD, stack 8 MiB vì Silero chạy bằng candle cần hơn 1 MiB ở bản debug; luồng nhận dạng; luồng phụ đề, nơi duy nhất phát sự kiện phụ đề nên thứ tự upsert và delta luôn đúng; luồng dịch.
  - Lý do:
    - hai client đồng bộ của Giai đoạn 0 (`asr_client`, `llama`) đã chạy qua S6 và giữ nguyên cách gọi;
    - mỗi tiến trình phụ chỉ làm một việc một lúc (`llama-server -np 1`, `asr-worker` đọc tuần tự), nên async không thêm thông lượng;
    - `pipeline` không cần runtime nào, test chạy không cần Tauri.
  - App chỉ dùng runtime của Tauri để đưa việc chặn ra khỏi luồng chính (`spawn_blocking` trong lệnh `toggle_session`, 02c).
- **QĐ2. Giao thức `asr-worker` bản 2** (`PROTOCOL_VERSION = 2`, "Việc cho MVP" của §6.4).
  - `Ready.protocol_version` là trường đầu, để app đọc được số này cả khi worker cũ hơn; app từ chối worker lệch phiên bản.
  - `TranscribeRequest.prev_lang` là trường cuối. Worker không còn giữ ngôn ngữ của đoạn trước: kết quả không phụ thuộc thứ tự yêu cầu, và app không mất ngôn ngữ trước khi worker khởi động lại.
  - Worker chỉ dùng prompt của app khi ngôn ngữ chọn cho đoạn này đúng bằng `prev_lang` (prompt là token của ngôn ngữ đó).
  - `backend` và `decode_mode` thành enum; `Ready.backend` là thiết bị thật (đọc bảng thiết bị ggml theo đúng luật chọn GPU của whisper.cpp 1.8.3).
  - `Error.kind`: `NotLoaded`, `ModelLoad`, `OutOfMemory`, `GpuInit`, `InvalidRequest`, `Internal`. whisper-rs chỉ trả `InitError` hay `GenericError(n)`, còn lý do thật (hết bộ nhớ GPU, Metal hay Vulkan không khởi tạo được) chỉ nằm trong log. Vì vậy worker cài log callback cho whisper.cpp và ggml (`native_log`): mọi dòng vẫn ra stderr, đồng thời giữ 20 dòng cảnh báo và lỗi gần nhất; `classify` xét cả thông báo lỗi lẫn các dòng này (#1 của review 02a).
  - `latency-bench` (`latency`, `asr-eval`) truyền `prev_lang` bằng ngôn ngữ của đoạn chép lời ngay trước, kể cả đoạn bị bỏ: đúng trạng thái mà worker của Giai đoạn 0 tự giữ, nên số đo S6 và A4 không đổi. App thì chỉ cập nhật `prev_lang` và prompt bằng đoạn được giữ lại. Hai bên cố ý khác nhau: S6 đo theo luật của Giai đoạn 0 để so được với mốc cũ (comment ở `latency.rs`); đổi luật ở công cụ đo thì phải đo lại mốc S6.
- **QĐ3. Prompt không làm hạ trần token** (dòng 116, "Luật lặp khi prompt dài"). App chỉ gửi `min(100, 219 − (16 + 20 × số giây))` token prompt, nên trần token mới của worker luôn là `16 + 20 × số giây`. Đoạn 3 giây vẫn có đủ 100 token prompt; đoạn 8,4 giây còn 35; đoạn gộp 12 giây (§7) không có prompt.
- **QĐ4. Lọc câu ảo giác quen thuộc** (dòng 118). Danh sách câu nằm trong `FilterConfig::hallucination_phrases` (04 đổi được qua manifest).
  - Câu thường: so khớp sau khi chuẩn hóa (chữ thường, chỉ giữ chữ và số), bỏ cụm dài trước. Đoạn chỉ gồm các câu này, lặp lại, hoặc chỉ có dấu câu và ký hiệu thì bỏ; còn dư dù một hai ký tự thì giữ.
  - Nhãn có ngoặc (`[music]`, `(âm nhạc)`): so khớp nguyên dạng có ngoặc, trước khi chuẩn hóa, nên câu thật "Music." hay "Âm nhạc" không bị bỏ (Nhỏ của review 02a). Mọi kiểu ngoặc (vuông, tròn, toàn khổ `（）［］`, `【】`, `〔〕`) coi như một, nên `（音楽）`, `【음악】`, `[音乐]` khớp cùng một nhãn (N2 của review 02 lần 3).
  - "Thank you." hay "Cảm ơn." đứng riêng không nằm trong danh sách này, vì là câu thật trong cuộc họp; chúng thuộc luật câu đệm (QĐ24).
- **QĐ5. Phồn thể sang giản thể** (dòng 120) bằng `ferrous-opencc` (bảng OpenCC `t2s`), áp lên chữ của đoạn tiếng Trung trước khi hiện, ghép câu và dịch (`text::display_text`). Trên dữ liệu S6, 44 đoạn tiếng Trung đổi chữ. Test chạy lại quyết định của S6 áp cùng hàm cho cả hai phía.
- **QĐ6. Bản vá `set_audio_ctx` trả lỗi** (dòng 122): hàm C trả −1 khi giá trị ngoài `[0, n_audio_ctx]`, bản Rust trả `Result`. Dựng lại `third_party/` từ tarball crates.io cộng hai bản vá cho ra đúng từng byte bản commit. Dòng `index` của bản vá 0001 khớp file đã vá.
- **QĐ7. Luật giám sát** (Đ2, §6.4, §6.5, §9; số mặc định trong `SupervisorConfig`):
  - chờ 1, 2, 5 giây giữa các lần khởi động lại; quá 5 lần lỗi trong 10 phút thì bỏ cuộc (`asr-worker`: dừng phiên, báo lỗi; `llama-server`: phụ đề chỉ hiện câu gốc). Lý do bỏ cuộc có loại (`GiveUpCause`): app chọn mã lỗi theo đó;
  - đoạn đang xử lý gửi lại một lần, lỗi nữa thì `dropped`; worker trả `Error` cho một đoạn mà vẫn sống thì chỉ bỏ đoạn đó, không khởi động lại. Riêng `OutOfMemory` lúc chép lời (thường là hết bộ nhớ GPU) thì báo `OutOfMemory` cho app và tính như một lần worker chết: khởi động lại, gửi lại đoạn, hai lần liên tiếp trên GPU thì chuyển CPU (Q1 của review 02 lần 2);
  - chuyển sang CPU khi: crash 2 lần liên tiếp lúc dùng GPU; bản GPU không khởi động được hay nạp model lỗi (với `asr-worker`, chuyển ngay); hoặc `Ready.backend` báo CPU. Đã chuyển thì giữ CPU tới khi app tắt;
  - `llama-server` theo `asr-worker`: không dò thấy GPU dùng được (`exe_gpu` là `None`), hoặc `asr-worker` đã chuyển CPU, thì `llama-server` chạy `-ngl 0` từ lần khởi động kế tiếp (#3 của review 02a). Không khởi động lại một `llama-server` đang chạy tốt chỉ vì `asr-worker` chuyển CPU;
  - `ModelLoad` khi đã chạy CPU thì bỏ cuộc luôn (model hỏng, thử lại vô ích; mã lỗi `modelBroken`);
  - `llama-server` chết lúc khởi động mà đuôi log có dấu hiệu hết bộ nhớ thì phát `OutOfMemory` (app đề xuất gói Nhẹ), như `asr-worker`;
  - lần đầu chạy binary mới: chờ `Ready` hay `/health` lâu hơn (`first_run_ready_timeout_ms` 180 giây); quá giờ lần đó thì không tính là một lần lỗi, không chuyển CPU, chạy lại với thời gian chờ thường (Nhỏ của review 02a; §6.5). App báo binary nào là lần đầu qua `SidecarEvents::is_first_run`, hỏi một lần cho mỗi binary, kể cả `asr-worker-cpu` chỉ chạy sau khi chuyển CPU;
  - `allow_retry` đánh dấu cho lần khởi động kế tiếp quên việc bỏ cuộc trước đó (người dùng bấm Bắt đầu thì thử lại từ đầu), không chờ khóa của tiến trình phụ; app gọi nó trước khi chuẩn bị tiến trình phụ cho lần bắt đầu (lần chạy sẵn khi mở cửa sổ chính thì không), còn `begin_session` chỉ đếm phiên để không tắt khi rảnh (R3-1 của review 02 lần 3). Thử lại sau khi bỏ cuộc, với mọi lý do, bắt đầu từ quyết định ban đầu: `use_gpu` của cả hai tiến trình phụ và `asr_on_cpu` theo `--probe`, vì người dùng chủ động thử lại và nguyên nhân có thể không phải GPU (model hỏng đã được tải lại); GPU vẫn lỗi thì luật 2 lần lỗi liên tiếp chuyển CPU lại. Chưa bỏ cuộc thì đã chuyển CPU là giữ CPU. App bỏ chỉ báo `cpuFallback` khi `asr-worker` tới `Ready` bằng GPU (Q4-2 của review 02 lần 4);
  - không có phiên nào trong 10 phút thì tắt cả hai (`tick`, app gọi 30 giây một lần);
  - app thoát (`SidecarManager::shutdown`, #2 của review 02a, N1 của review 02c): bật cờ `closing`, ngắt lần chờ giữa hai lần khởi động (`Wake`, chờ bằng Condvar), kill tiến trình phụ đang chạy hay đang nạp model qua `process::Killer` (lấy được ngay khi tiến trình chạy, `spawn_with`). Không chờ khóa nào; luồng đang dùng tiến trình phụ nhận lỗi rồi tự trả khóa. Sau đó mọi lần khởi động trả lỗi ngay; tiến trình vừa chạy mà app đã bắt đầu thoát thì bị kill ngay, không giữ lại (`remember` kiểm `closing` dưới cùng khóa với `shutdown`). `stop` lấy tiến trình khỏi slot và bỏ `Killer` của nó trong cùng một khóa. `running()` đọc `AtomicBool`, không khóa.
- **QĐ8. Tiến trình phụ không bị bỏ lại khi app chết** (dòng 82). macOS: mỗi tiến trình phụ là trưởng một process group; hook panic gửi `SIGKILL` cho mọi group còn sống trước khi abort; `asr-worker` tự thoát khi stdin đóng (`tests/stdin_eof.rs`). App bị Force Quit (`SIGKILL`) thì hook không chạy, nên mỗi tiến trình phụ còn được ghi vào pidfile `app_local_data_dir/sidecars-live.json` (pid, thời điểm bắt đầu, đường dẫn binary thật; ghi file tạm rồi `rename`). Lần mở app sau, `setup` gọi `process::reap_orphans` trước khi chạy sẵn tiến trình mới: chỉ `SIGKILL` cả group khi khớp cả bốn điều kiện: thời điểm bắt đầu (`proc_pidinfo PROC_PIDTBSDINFO`), `proc_pidpath` bằng binary đã ghi, binary nằm trong thư mục tiến trình phụ của app, và tiến trình vẫn là trưởng group của nó (Q8(a) của review 02c). Đọc pidfile ở `setup` chỉ đúng vì plugin single-instance bảo đảm không có bản app nào khác đang chạy (N-10 của review 02 lần 2). Windows: một Job Object `KILL_ON_JOB_CLOSE`, tiến trình phụ chạy với `CREATE_NO_WINDOW`; không cần pidfile.
- **QĐ9. Hàng đợi §7 và trường `replaces`.**
  - Hàng đợi nhận dạng tối đa 3 đoạn; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ bỏ đoạn khi độ trễ vượt 20 giây. Đoạn gộp có `speech_ms` bằng tổng `speech_ms` của các đoạn con, không tính khoảng nghỉ ở giữa (§6.3), và xác suất VAD trung bình lấy theo `speech_ms`.
  - Hàng đợi dịch tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ vào một request. Phụ đề gộp mang id của câu đầu và trường `replaces` (id các phụ đề đã gộp vào nó, §6.6), để giao diện xóa chúng; tiếng nói cộng lại, ngữ cảnh lấy của câu đầu.
  - Câu chờ dịch quá 20 giây thì `skipped`. Độ trễ vượt 6 giây thì chỉ báo "Đang trễ".
  - Id phụ đề cộng `EngineConfig::id_base`, để không trùng giữa các phiên của một lần chạy app.
- **QĐ10. Dừng phiên** (`Engine::stop`, N3 và Q6 của review 02b). Luồng VAD chốt đoạn đang nói dở; các đoạn và câu còn lại được xử lý tiếp như thường trong một hạn chung `mt.stop_grace_ms` (3 giây, giờ thật) tính từ lúc bấm, nên câu cuối thường vẫn được dịch. Hết hạn thì câu đang dịch và câu chờ dịch thành `skipped`, luồng phụ đề thoát ngay; `Engine::stop` không chờ luồng nhận dạng và luồng dịch (chúng tự kết thúc khi request của chúng xong, kể cả khi `llama-server` treo). Lần làm nóng `llama-server` cũng dừng khi bấm Dừng.
- **QĐ11. Hậu xử lý bản dịch** (§6.5):
  - giữ phần đầu tới khi chắc không phải nhãn ("Translation:", "译文："…), nhãn thì bỏ;
  - ngoặc kép mở ở đầu (khi câu gốc không có) không hiện trong lúc stream; lúc kết thúc, ngoặc bao cả câu thì bỏ cả cặp, còn không thì trả lại;
  - ngưỡng tỉ lệ token đếm theo gói SSE: mỗi gói là một token (đã kiểm: 24 gói khớp `predicted_n` 24);
  - xuống dòng rồi viết tiếp khi câu gốc không có xuống dòng là dấu hiệu lời giải thích: cắt và thử lại. Trên 1240 bản dịch của S7 không có bản dịch đúng nào bị luật này bắt;
  - thử lại một lần với repeat penalty 1,15; vẫn lỗi thì `failed`, hiện câu gốc.
- **QĐ12. Ngưỡng tỉ lệ token theo cách 2 của Q4** (§6.5, đã chốt 2026-10-01): chỉ áp tỉ lệ khi câu gốc từ 10 token; câu ngắn hơn chỉ chịu hạn mức sinh `min(4 × số token + 32, 512)`. Ngưỡng lấy cột "câu gốc ≥ 10 token" của `bench/phase0/results/s7_mt_decisions.md` (tỉ lệ lớn nhất trên các câu gốc từ 10 token, cộng biên 25%, làm tròn lên 0,1). Lúc lập kế hoạch đã tính lại cho cả tám cặp từ `bench/phase0/data/mt/outputs/*-plain.jsonl` (bỏ bản dịch bị cắt ở `max_tokens`) và ra đúng các số của bảng: en→vi 4,4; zh→vi 4,3; ja→vi 3,5; ko→vi 3,5; vi→en 1,4; vi→zh 1,2; vi→ja 2,2; vi→ko 2,2 (Nhỏ của review 02a; bản trước dùng nhầm 6,6 và 1,6 của cột "mọi câu"). Cặp chưa có ngưỡng (không có tiếng Việt) không bị kiểm tỉ lệ cho tới khi 02b Task 6 đo xong. Ngưỡng nằm trong `MtConfig::ratio_thresholds` (cùng `ratio_min_source_tokens`), đổi được qua manifest.
- **QĐ13. `repeat_penalty` là `f64`**, để JSON gửi đi là `1.05`, không phải `1.0499999523162842`.
- **QĐ14. Tiến trình phụ giả là binary trong `pipeline`** (`fake_asr_worker`, `fake_llama_server`), test lấy đường dẫn qua `CARGO_BIN_EXE_*`. Kịch bản lỗi đọc từ file và biến môi trường; mỗi lần tiến trình chạy lấy một dòng, nên test được chuỗi "crash rồi chạy lại". `FakeClock` cộng thẳng thời gian chờ, nên test vòng đời không ngủ thật; vài test về thời gian chờ của chính tiến trình phụ (lần đầu chạy, app thoát lúc đang nạp model) chờ thật dưới 1 giây.
- **QĐ15. Kiểm code Windows trên Mac.** Ngoài `fake-llvm-rc` của 01, thêm `scripts/fake-pkg-config`: `candle-core` 0.11 luôn kéo `tokenizers` với `onig`, nên `onig_sys` muốn biên dịch thư viện C oniguruma cho Windows. Với `RUSTONIG_DYNAMIC_LIBONIG=1` và pkg-config giả, `cargo clippy` không phải biên dịch gì; `cargo check` và `clippy` không link nên thư viện giả không bao giờ được dùng. Clippy cho target Windows chạy ngay ở các task có code Windows (02d Task 1 và Task 3, 02b Task 5, 02c Task 2 và Task 3), không đợi tới cuối (#5 của review 02a). `asr-worker` không nằm trong phép kiểm này (build script của `whisper-rs-sys` không biên dịch chéo được): code Windows của nó biên dịch lần đầu ở 02c Task 9.
- **QĐ16. Đổi thiết bị phát: hỏi định kỳ 500 ms** (`audio_capture::default_output_signature`) thay cho listener của Core Audio và `IMMNotificationClient` (§6.1, §9; spec đã ghi lại cách này).
  - macOS: dấu hiệu gồm id thiết bị và tần số mẫu danh định (`kAudioDevicePropertyNominalSampleRate`), vì tai nghe Bluetooth đổi tần số trên cùng thiết bị khi app họp mở micro (Q10 của review 02b).
  - Áp cho cả nguồn toàn hệ thống lẫn nguồn một app (Q3 của review 02c); thiết bị chọn tay trên Windows thì không theo thiết bị mặc định.
  - Luồng thu chết (`AudioSource::failed`) cũng làm mở lại nguồn: Windows khi thiết bị bị rút; macOS, nguồn một app, khi mọi tiến trình của app đó đã thoát (N11 của review 02b).
  - macOS, tap chết không báo gì (`coreaudiod` khởi động lại, aggregate mất sau khi máy ngủ; Q-G của review 02 lần 2): số khung (`CaptureStats::frames`) đứng yên 3 giây **trong khi** app cần thu vẫn đang phát tiếng (nguồn một app: chính app đó) thì mở lại nguồn. Phải có điều kiện "đang phát", vì aggregate đặt `tapautostart`: không app nào phát thì IO block không được gọi dù tap vẫn sống. Mở lại 3 lần liên tiếp mà vẫn không có khung thì chờ lâu dần (gấp đôi mỗi lần, tối đa 30 giây), không tính vào chính sách báo lỗi (Nhỏ-5 của review 02 lần 3); có khung trở lại thì về bậc đầu ngay trong lần mở đó (`capture::Watch`, Nhỏ-1 của review 02 lần 4). Nguồn một app còn mở lại khi app có tiến trình phát tiếng chưa được tap (helper mới, pid được cấp lại); tập chỉ thu nhỏ thì không (Nhỏ-6); kiểm mỗi 2 giây. Quyết định của mỗi lần kiểm là hàm thuần `capture::on_tick` (Nhỏ-3). Số liệu thu ghi vào log mỗi 60 giây để kiểm tiền đề ở 02c Task 8.
- **QĐ17. Kiểm SHA-256 tiến trình phụ** (Đ15, §10.2) theo bảng sinh lúc build từ mọi file trong `src-tauri/binaries/` (file thực thi và thư viện đi kèm). Kiểm lúc chuẩn bị và trước mọi lần chạy, kể cả mọi lần khởi động lại bên trong giám sát: giám sát gọi `SidecarEvents::before_spawn`, app cài hàm này bằng `integrity::verify`; kiểm lỗi thì bỏ cuộc ngay (`GiveUpCause::Tampered`, mã `sidecarTampered`; #4 của review 02a, N2(a) của review 02c). Ngoài ra (N2(b) của review 02c):
  - thư mục không được có file dạng thư viện lạ (`.dll`, `.dylib`, `.so`, tên bắt đầu `libggml-`, `ggml-`): `llama-server` b11146 tự nạp mọi backend ggml trong thư mục của nó và thư mục làm việc (`ggml_backend_load_all`, đã thử ở review 02c);
  - mọi tiến trình phụ (`asr-worker`, `llama-server`, `--probe`) chạy với thư mục làm việc là thư mục chứa binary;
  - Unix: file trong bảng mà nhóm hay người khác ghi được (`mode & 0o022`) thì từ chối;
  - Windows: file đã kiểm được mở với share mode chỉ cho đọc và giữ handle suốt đời app, nên không ai sửa, đổi tên hay xóa được giữa lúc kiểm và lúc chạy (N2(c), TOCTOU). Chỉ kiểm được là code biên dịch; chạy thử ở 02c Task 9. macOS dựa vào chữ ký và library validation của bản phát hành (07). Tiến trình phụ đang chạy thì bước chuẩn bị của phiên trả về ngay, không kiểm lại: file trong `binaries/` bị sửa trong lúc tiến trình phụ đang chạy chỉ bị phát hiện ở lần chạy lại sau (khởi động lại vì lỗi, tắt khi rảnh rồi chạy lại, hay mở lại app), đúng với thiết kế "kiểm trước mỗi lần chạy" (Nhỏ-6 của review 02 lần 4).
- **QĐ18. "Lần đầu chạy binary mới"** nhận biết bằng `sidecars-seen.json` trong `app_local_data_dir`, giữ SHA-256 của 8 binary gần nhất đã chạy được tới `Ready` (02c).
- **QĐ19. Bắt đầu phiên không chạy trên luồng chính** (02c): `toggle_session` là lệnh `async` gọi `spawn_blocking`; phím tắt, khay và Thoát chạy trên luồng riêng. Thanh phụ đề hiện qua `run_on_main_thread` (NSPanel chỉ đổi được từ luồng chính).
- **QĐ20. Đích của tap macOS** (`audio_capture::macos::TapTarget`): `SystemExceptSelf` (mặc định), `System` (thu cả âm thanh của app, cho bước "Nghe thử" của 03, Đ16; app chọn qua `session::StartOptions { include_self }`), và `Processes(Vec<i32>)` (chỉ một app, gồm mọi tiến trình đang phát tiếng của nó, `initStereoMixdownOfProcesses`). Windows không cần `System`, vì loopback vốn thu mọi âm thanh.
- **QĐ21. Ngưỡng gom vào `PipelineConfig`** (segmenter, ghép câu, lọc, ASR, MT, hàng đợi, giám sát, âm thanh), mặc định là số đã chốt ở Giai đoạn 0 và spec. Mọi struct `#[serde(default)]`: manifest của 04 chỉ cần ghi khóa muốn đổi, khóa lạ bị bỏ qua. `validate()` từ chối giá trị vô lý (04 giữ mặc định khi lỗi), kể cả các khóa review 02a chỉ ra: `queue.asr_merge_max_ms` (tới 30 giây), `supervisor.idle_shutdown_ms`, `ready_timeout_ms`, `mt.request_timeout_ms`, `audio.silent_rms` (NaN), `merge.window_min_ms`, cùng các khóa mới (`mt.stop_grace_ms`, ngưỡng của luật câu đệm và chuỗi lặp), và chặn dưới cho `queue.mt_skip_after_ms`, `queue.asr_drop_after_ms`, `audio.no_audio_after_ms`, `supervisor.failure_window_ms`, `asr.n_threads`, `mt.max_tokens_per_source_token`, `supervisor.shutdown_grace_ms`, `merge.window_extra_ms` (review 02 lần 2). Vài hằng số cố ý để ngoài, vì chúng không đổi hành vi dịch và manifest đổi sai thì khó chẩn đoán: chu kỳ kiểm nguồn âm thanh (`WATCH_EVERY`, 500 ms), nhịp gọi `tick` (`TICK_EVERY`), thời gian chờ `--probe`, kích thước xoay log của tiến trình phụ (comment đầu `config.rs`). `vadEndSilenceMs` của người dùng không nằm ở đây; app ghi đè `segmenter.end_silence_ms`.
- **QĐ22. Công cụ đo cho Đ12:** test bỏ qua `no_speech.rs` (tín hiệu tổng hợp và file WAV tùy chọn qua `asr-worker` thật, in `no_speech_prob`, `avg_logprob`, xác suất VAD, tỉ lệ nén, kết luận của luật lọc), và `build_ratio_set.py` cùng `ratio_stats.py` (12 chiều không có tiếng Việt và câu gốc rất ngắn, dịch bằng `mt-eval`, tính ngưỡng theo cách của S7). Bộ nhạc thử của 02b Task 6 chỉ gồm file CC0 hoặc public domain trên Wikimedia Commons (danh sách, giấy phép và SHA-1 ở task đó); chỉ commit bảng kết quả, không commit audio. Ngưỡng tỉ lệ mới chỉ vào `MtConfig` sau khi chủ dự án duyệt.
- **QĐ23. Lấy Expected từ target riêng.** Mọi Expected trong kế hoạch lấy từ một lần chạy lại các task trên worktree sạch với target riêng còn trống. Khi thực thi trên `main` thì không có vấn đề trộn artifact giữa worktree.
- **QĐ24. Câu đệm nghi ảo giác và chuỗi lặp** (Q11 của review 02b; `FilterConfig`, đổi được qua manifest).
  - Turbo cho `no_speech_prob` cỡ 1e-10 với mọi tín hiệu, nên luật `no_speech_prob` của §6.4 không bao giờ bỏ đoạn nào của turbo. Lúc lập kế hoạch đã kiểm chéo bằng faster-whisper 1.2.1 (CTranslate2, model `large-v3-turbo`, không qua `asr-worker`): im lặng, tiếng ù điện và tiếng gõ phím cũng cho 4e-11 tới 1,5e-10 và chữ bịa "Thank you." hay "you"; `small` qua cùng công cụ cho 0,68–0,92. Vậy đây là tính chất của turbo, không phải lỗi đọc vị trí token của chế độ B.
  - Luật câu đệm: chữ (đã chuẩn hóa) đúng bằng một câu trong danh sách ngắn theo ngôn ngữ (`you`, `i`, `so`, `okay`, `thank you`, `cảm ơn`, `ありがとうございました`, `谢谢`, `감사합니다`…), **và** có ít nhất một dấu hiệu: `avg_logprob` dưới −0,7; xác suất VAD trung bình của đoạn dưới 0,7; hoặc đoạn có từ 2 giây tiếng nói mà chỉ một từ. `Segment` và `PendingSegment` mang thêm `mean_prob` và `speech_ratio` của VAD cho luật này.
  - Chuỗi lặp: tỉ lệ nén zlib (mức 6) của chữ lớn hơn 2,4 thì bỏ, như `compression_ratio_threshold` của OpenAI Whisper.
  - Điều kiện nhận luật mới (đã kiểm lúc lập kế hoạch, ghi vào `gd1_no_speech.md` ở 02b Task 6): trên 548 clip A4 (cả turbo lẫn small), không clip nào bị bỏ thêm; trên 528 đoạn S6, luật câu đệm chỉ bỏ thêm 2 đoạn của gói Chuẩn, cả 2 đều có chữ sai (đoạn 32 ms ngay sau một câu chép thành "Thank you.", và đuôi câu "… ở Las Cañitas." chép thành "Cảm ơn"). Trên 112 đoạn tín hiệu tổng hợp và nhạc CC0, không đoạn nào thành phụ đề với cả hai model.
- **QĐ25. Đếm phút cho hạn mức** (§6.3, §6.8). `Segment` có `speech_ms` (không gồm đệm); đoạn gộp ở hàng đợi cộng `speech_ms` của các đoạn con. Engine cộng phút khi phụ đề sang `done`, cho phần tiếng nói chưa được tính của câu đó (câu được dịch lại sau khi ghép thêm đoạn chỉ tính phần mới), chỉ cho câu không phải `same_lang`; `failed`, `skipped`, `dropped`, đoạn bị lọc không bao giờ được tính. Mỗi lần tính, engine gọi `EventSink::usage(&Usage { sub_id, speech_ms })`, mặc định không làm gì; kế hoạch 06 nối bộ đếm vào đây. `SessionMetrics::translated_speech_ms` theo cùng luật (N1 của review 02b).
- **QĐ26. Dừng khi chạm hạn mức** (§6.8, "Khi chạm hạn mức"). `EventSink::usage` trả `Break`, hoặc app gọi `Engine::exhaust_quota`: engine dừng thu âm, bỏ các đoạn chờ nhận dạng (không hiện gì) và các câu chờ dịch (`skipped`), không hiện đoạn chép lời xong muộn, chỉ dịch xong câu đang dịch (trong cùng hạn `mt.stop_grace_ms`), rồi báo `Fatal::QuotaExhausted`. App ánh xạ thành mã lỗi `quotaExhausted`; kế hoạch 06 thêm thời điểm reset và nút nâng gói.
- **QĐ27. Lỗi của engine** (`Fatal`): `Vad` (không nạp được, lỗi giữa chừng, hay luồng VAD panic), `Audio` (nguồn âm thanh hỏng hẳn), `Asr` (bỏ cuộc, hay luồng nhận dạng panic), `Internal` (luồng phụ đề panic), `QuotaExhausted`. Mỗi luồng có guard (`Drop`) đóng hàng đợi, gửi `AsrDone` hay báo luồng phụ đề, nên một luồng panic không làm engine treo (Q4, Q5 của review 02b). Bản phát hành build với `panic = "abort"`, nên guard chủ yếu có tác dụng ở bản dev và test. `Engine::start` chạy luồng VAD (luồng duy nhất tự đọc âm thanh mãi) sau cùng: không tạo được một luồng thì các luồng đã chạy thấy đầu vào đóng lại và tự kết thúc (N10).
- **QĐ28. Nguồn âm thanh trong phiên** (02c, Q2, Q4, Q5 của review 02c).
  - Lần mở đầu tiên lỗi thì báo ngay; nguồn đã chạy được rồi mà lỗi thì chỉ báo khi lỗi kéo dài từ 10 giây (§9: tự khởi tạo lại). Nguồn một app đã chạy được rồi mà app không phát tiếng nữa (đã đóng) thì không bao giờ dừng phiên: thử lại mỗi 2 giây, đặt `AppStatus::waiting_for_app`, màn hình chính hiện chỉ báo (Q-C của review 02 lần 2).
  - macOS: mẫu thật toàn số 0 tuyệt đối suốt 3 giây trong khi app cần thu đang phát (nguồn một app: chính app đó), và từ đầu phiên chưa có mẫu nào khác 0, thì đặt `AppStatus::permission_suspected` (không dừng phiên); giao diện hiện câu báo kèm nút mở System Settings. Đã có âm thanh thật một lần thì tắt hẳn phép kiểm này: quyền đã có, cuộc họp im lặng không bị báo nhầm (Q-B của review 02 lần 2).
  - `ClockFiller` chỉ chèn im lặng khi nguồn không trả mẫu nào; nguồn đang chạy thì kéo mốc về đồng hồ thật, nên đồng hồ thiết bị lệch vài chục ppm không chèn im lặng vào giữa câu (N2 của review 02b). Mỗi lần chèn tối đa 2 giây; thiếu nhiều hơn (máy ngủ) thì chỉ đồng bộ lại mốc.
  - `LiveCapture` bị hủy thì chờ luồng thu tối đa 500 ms, để tap cũ không chạy song song với phiên mới.
- **QĐ29. Phiên dịch trong app** (`session.rs`, Q1, Q6, N1 của review 02c; Q-E của review 02 lần 2). Mỗi lần bắt đầu có một số (`attempt`); bấm lần nữa lúc đang chuẩn bị là Hủy: tăng số đó, trạng thái về `idle` ngay. Khóa phiên không giữ trong lúc chuẩn bị tiến trình phụ (60–180 giây), chỉ từ lúc mở nguồn âm thanh tới lúc gắn engine, nên Hủy rồi bấm Bắt đầu lại hiện `starting` ngay; lần đã hủy nạp xong thì thấy số đã đổi và thôi. Lần bắt đầu kiểm số của nó lần cuối cùng khóa với trạng thái, sau khi đã dựng engine. Trước khi chuẩn bị, `SessionDeps::check_quota` (mặc định cho bắt đầu; kế hoạch 06 cài) từ chối khi hạn mức còn 0, rồi `SessionDeps::allow_retry` cho tiến trình phụ đã bỏ cuộc thử lại (R3-1 của review 02 lần 3). Lần đã hủy mà chuẩn bị lỗi thì bỏ chỉ báo "Đang nạp model" còn sót (Nhỏ-7). `Engine::start` lỗi là lỗi bên trong app (`unknown`). Thoát app: chặn lần bắt đầu mới, tăng số lần bắt đầu, chặn mọi lần chạy tiến trình phụ mới và kill tiến trình đang chạy (`process::begin_shutdown`, `SidecarManager::shutdown`), chờ khóa phiên tối đa 2 giây để dừng engine, rồi `process::kill_all`. Lỗi của một phiên cũ (tới muộn) không chạm phiên mới. `AppStatus.rev` tăng mỗi lần trạng thái đổi; giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đang có.
- **QĐ30. App trong danh sách "chỉ thu một app" (macOS)** (Q9 của review 02b, Q8(b) của review 02c). `audio_apps()` gộp các tiến trình đang phát tiếng theo gói `.app` ngoài cùng (`proc_pidpath`), nên trình duyệt và app Electron (phát tiếng từ tiến trình helper) là một dòng với mọi pid của nó. Tên hiển thị và bundle ID đọc từ `Info.plist` của gói `.app` ngoài cùng (`NSBundle`: `CFBundleDisplayName`, `CFBundleName`, theo ngôn ngữ của máy), vì `NSRunningApplication` của helper có thể trả về chính helper (`com.google.Chrome.helper`) làm bundle ID đã lưu đổi giữa các lần (Q-F của review 02 lần 2); tiến trình không nằm trong gói nào thì dùng `NSRunningApplication.localizedName` của nó hoặc tối đa 3 tiến trình cha. Hàm chạy trong `autoreleasepool`. Tiến trình của WebKit (`com.apple.WebKit.GPU`, phát tiếng cho Safari và mọi WebView) có tên riêng trên giao diện; không có tên thì giao diện hiện bundle ID. Tiến trình vừa thoát giữa lúc đọc danh sách thì bỏ qua nó, không làm hỏng cả danh sách. Nguồn đã chọn lưu theo bundle ID (cài đặt của 01 không đổi).
- **QĐ31. Câu xin quyền ghi âm thanh hệ thống có hai ngôn ngữ** (Q8(c) của review 02c): câu gốc tiếng Anh trong `src-tauri/Info.plist` (kèm `CFBundleLocalizations` en, vi), bản dịch trong `src-tauri/macos/{en,vi}.lproj/InfoPlist.strings`, chép vào gói `.app` qua `bundle.macOS.files` của `tauri.conf.json`. `tauri dev` chỉ nhúng `Info.plist` gốc, nên câu tiếng Việt chỉ thử được trên `.app` đã đóng gói (02c Task 8).
- **QĐ32. DLL nạp lúc khởi động trên Windows** (Nhỏ của review 02a): `harden_dll_search` (`SetDefaultDllDirectories`) chỉ áp cho DLL nạp sau khi chương trình đã chạy, nên `.cargo/config.toml` thêm cờ linker `/DEPENDENTLOADFLAG:0x800` (`LOAD_LIBRARY_SEARCH_SYSTEM32`) cho mọi binary của workspace trên `x86_64-pc-windows-msvc`: DLL import thẳng (như `vulkan-1.dll`) chỉ được tìm trong System32. Mac không link được cho Windows, nên cờ này chỉ thử được ở 02c Task 9. Hệ quả cho 07: binary Rust MSVC import `VCRUNTIME140.dll`; bộ cài phải bảo đảm bản đó có trong System32 (VC++ Redistributable), hoặc build với `+crt-static`.

## Điểm cần chủ dự án quyết

Kế hoạch đã làm theo phương án ghi trong ngoặc; chủ dự án đổi thì sửa kế hoạch trước khi thực thi. Các điểm của bản trước đã được spec chốt (Q4 cách 2, luồng riêng thay tokio, hỏi định kỳ thiết bị phát, trường `replaces`, chờ `/health` 180 giây) hoặc đã làm theo review (pidfile khi Force Quit, tên app, `InfoPlist.strings`; review lần 2: phát hiện tap macOS chết bằng số khung, trước là điểm 6) nên không còn ở đây.

1. **Luật câu đệm bỏ một đoạn có tiếng thật mà chữ sai** (QĐ24). Trên S6, đoạn 45 của session `vi` gói Chuẩn là đuôi câu "… ở Las Cañitas." mà turbo chép thành "Cảm ơn" (`avg_logprob` −0,84). Luật bỏ đoạn này: mất một phụ đề sai, không mất chữ đúng nào. Đoạn bị bỏ còn lại (32 ms, "Thank you.") là ảo giác. Phương án: nhận luật như hiện tại (kế hoạch này); hoặc hạ ngưỡng `filler_logprob_max` xuống −1,0 (khi đó cả hai đoạn S6 đều không bị bỏ, và luật chỉ còn bắt câu đệm bằng hai dấu hiệu kia).
2. **Thư viện C oniguruma trong tiến trình chính** (qua `candle-core` 0.11 → `tokenizers` feature `onig`, có từ Giai đoạn 0). §6.12 cấm hai bản của cùng một thư viện C; đây chỉ có một bản, nhưng là thư viện C không ai chủ động chọn. Phương án: giữ (kế hoạch này); hoặc 07 thử bỏ feature `onig` khi nâng candle.
3. **Trang System Settings cho quyền ghi âm thanh hệ thống**: kế hoạch mở `x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture`. Apple không công bố danh sách neo này; 02c Task 8 nhờ người kiểm cả neo này lẫn `x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AudioCapture`, rồi chọn neo mở đúng trang (`system::AUDIO_PERMISSION_URL`).
4. **Ngưỡng tỉ lệ token cho cặp không có tiếng Việt và câu gốc dưới 3 token** (dòng 149): 02b Task 6 đo và đề xuất; chủ dự án duyệt thì thêm vào `DEFAULT_RATIO_THRESHOLDS` (hoặc manifest của 04).
5. **Flash attention** (dòng 121): ngày 2026-10-01, ggml-org/whisper.cpp#3941 (che phần đệm khi bật flash attention) vẫn mở, hoạt động cuối ngày 2026-07-16. Kế hoạch giữ tắt; 08 kiểm lại trước khi phát hành.
6. **Hạn dịch câu đang dịch khi chạm hạn mức** (QĐ26). §6.8 ghi "chỉ dịch xong câu đang dịch", không ghi giới hạn thời gian; kế hoạch cho câu đó dịch trong cùng hạn 3 giây như khi bấm Dừng (`mt.stop_grace_ms`), quá hạn thì `skipped`, để phiên không treo khi `llama-server` treo. Phương án: như kế hoạch; hoặc chờ tới hết thời gian chờ của request (120 giây).
7. **Bấm Dừng không chờ luồng nhận dạng và luồng dịch** (QĐ10). Nếu một tiến trình phụ đang treo giữa request, phiên mới bắt đầu ngay sau đó phải chờ request cũ hết thời gian chờ (30 giây với `asr-worker`, 120 giây với `llama-server`) mới dùng được tiến trình phụ đó. Phương án: chấp nhận (kế hoạch này; trường hợp hiếm); hoặc Dừng kill luôn tiến trình phụ đang treo.
8. **Bộ nhạc thử** (02b Task 6): tám file CC0 và hai file public domain (Dvořák: "Public domain"; Vivaldi: "Public Domain Mark" do chủ sở hữu đặt) trên Wikimedia Commons. Chỉ bảng kết quả vào repo. Phương án: nhận (kế hoạch này); hoặc bỏ file Vivaldi nếu chỉ nhận đúng CC0.
9. **Cho 07:** cờ `/DEPENDENTLOADFLAG:0x800` (QĐ32) làm DLL import thẳng, kể cả `VCRUNTIME140.dll`, chỉ được tìm trong System32: bộ cài Windows phải có VC++ Redistributable, hoặc build với `+crt-static`. Thư mục cài đặt Windows và `Contents/MacOS` không được có thư viện nào ngoài bảng SHA-256 (QĐ17), nên 07 phải đưa mọi DLL hay dylib đi kèm vào bảng; macOS bản phát hành bật hardened runtime và library validation.
10. **Số thứ tự cho `Settings`** (mục 1 của review store giao diện của 01). `AppStatus` đã có `rev`; `Settings` thì chưa, vì đó là cấu trúc của file cài đặt của 01. Lúc mở cửa sổ, cài đặt đã tới qua sự kiện được giữ (02c Task 5). Còn một khe: hai lệnh sửa cài đặt chạy chồng nhau thì kết quả của lệnh trước có thể tới sau sự kiện của lệnh sau và đè lên trong store (file trên đĩa vẫn đúng; lần đổi cài đặt kế tiếp sửa lại). Phương án: chấp nhận (kế hoạch này); hoặc 03 thêm `revision` vào `Settings` (không lưu xuống file) khi màn hình Cài đặt có nhiều ô đổi liền nhau.

## Đã sửa theo review

Mã theo ba review của bản `b221f3c`, hai review lần 2 của bản `4a1c310`, hai review lần 3 của bản `f86b1b7`, rồi review lần 4 của bản `3a06780` (các mục cuối). "a·T2" là 02a Task 2, "d·T1" là 02d Task 1, "b·T2" là 02b Task 2, "c·T3" là 02c Task 3.

**Review 02a**
- Chỗ lệch khi chạy lại: (1) a·T3 Step 1 khai `pub mod text;` cùng lúc tạo file, Expected là output thật; (2) feature `Win32_System_Threading` và import thừa của module test chuyển về d·T1, d·T1 và d·T3 có thêm lệnh clippy cho target Windows; (3) mọi Expected là output thật của một lần chạy lại toàn bộ trong target trống (QĐ23), lệnh trong Expected đúng bằng khối Run.
- Mutation còn sống: H2, H3 (a·T3), S8, S12 (d·T3), P5 (d·T2) và ba mutation lộ `LLAMA_API_KEY` (d·T1, d·T2) nay đều bị giết; xem mục "Kiểm bằng mutation lúc lập kế hoạch".
- 1 (`classify`): a·T1 cài log callback của whisper.cpp và ggml (vẫn ghi ra stderr, giữ 20 dòng gần nhất), `classify` xét cả các dòng đó, có test đi qua callback; d·T3 đọc đuôi `llama-server.log` khi khởi động lỗi để nhận hết bộ nhớ (QĐ2, QĐ7).
- 2 (tắt và gửi chạy đua): d·T3 cờ `closing`, backoff ngắt được (`Wake`), `shutdown()` kill qua `Killer` mà không chờ khóa, `running()` đọc `AtomicBool`; test cho `transcribe` tới muộn sau khi dừng và cho worker treo (QĐ7).
- 3 (CPU lan sang `llama-server`): d·T3 `-ngl 0` khi không có bản GPU của ASR hoặc ASR đã chuyển CPU; có test.
- 4 (kiểm SHA-256 mỗi lần chạy): d·T3 `SidecarEvents::before_spawn` trước mọi lần spawn, `Err` thì bỏ cuộc với `GiveUpCause::Tampered`; c·T3 cài bằng `integrity::verify` (QĐ17).
- 5 (code Windows của 02a): như "Chỗ lệch" (2).
- 6 (thiếu test): S8, S12 (d·T3); khóa không lộ qua `Debug`, `llama-server.log` và log sự kiện, cảnh báo không log `{cmd:?}` ở `command()` (d·T1, d·T2); test với b11146 thật (401 khi thiếu khóa, 200 khi có; bỏ qua mặc định, d·T2).
- Nhỏ:
  - P5: d·T2.
  - Lần đầu chạy quá giờ: d·T3, không tính là một lần lỗi, không chuyển CPU.
  - Nhãn có ngoặc: a·T3 so khớp trước khi chuẩn hóa; "Music." không bị bỏ.
  - Ngưỡng tỉ lệ token: a·T2 lấy cột "câu gốc ≥ 10 token" của `s7_mt_decisions.md`, kiểm lại cả tám cặp, ghi nguồn (QĐ12).
  - `validate()`: a·T2 thêm các khóa còn thiếu (QĐ21).
  - Ngưỡng ngoài `PipelineConfig`: `stop_grace_ms` vào `MtConfig`; các hằng còn lại có comment ghi lý do để ngoài (QĐ21).
  - Log xoay cả khi đang chạy: d·T1.
  - Dòng `index` của bản vá 0001: a·T1.
  - `prev_lang` của `latency-bench` và app: QĐ2 ghi rõ S6 đo theo luật của Giai đoạn 0, kèm comment ở `latency.rs`.
  - `/DEPENDENTLOADFLAG:0x800`: a·T1 thêm vào `.cargo/config.toml` cho target Windows (QĐ32; phần cho 07 ở điểm cần quyết 9).
  - Force Quit: như 02c Q8(a).

**Review 02b**
- Q1 (ngữ cảnh câu trước): b·T2 chụp ngữ cảnh lúc mở câu, lưu ở `MtItem.context`, câu gộp lấy ngữ cảnh của câu đầu; có test.
- Q2 (luồng phụ đề §7): b·T2 test đơn vị cho `Composer`, tất định, cho mọi đường review liệt kê.
- Q3: b·T2 test tích hợp đặt các ngưỡng trễ 600 000 ms.
- Q4 (luồng panic): b·T2 guard đóng hàng đợi, gửi `AsrDone`, báo `Fatal::Internal`; có test.
- Q5: b·T2 `Fatal::Vad` cho lỗi giữa chừng, `Fatal::Audio` cho nguồn lỗi (QĐ27).
- Q6 (mốc dừng): b·T2 hết hạn thì `skipped` và bỏ request đang treo, `finish()` không join luồng dịch, làm nóng cũng xem cờ dừng (QĐ10).
- Q7: b·T4 `meta.json`, từ chối chạy tiếp khi khác trừ khi có `--resume-anyway`; Expected của b·T7 có dòng "còn 620 câu phải dịch".
- Q8: b·T4 `regression_lines` báo lượt, chiều hay comet bị thiếu, lỗi khi không có dòng nào để so; `test_score_mt.py`.
- Q9: b·T5 `AudioApp { pids, bundle_id, name }`, gộp theo `.app` ngoài cùng, `TapTarget::Processes`, tiến trình vừa thoát thì bỏ qua (QĐ30).
- Q10: b·T5 thêm tần số mẫu vào chữ ký thiết bị; c·T8 có ca AirPods.
- Q11: b·T3 và b·T6 làm theo đề xuất 1–6: (1) đối chiếu bằng faster-whisper, script nằm ngoài repo; (2), (3), (4) luật câu đệm, `mean_prob`/`speech_ratio`, tỉ lệ nén ở a·T2, a·T3, b·T1 (QĐ24); (5) nhạc CC0 và public domain, chỉ commit bảng kèm nguồn và giấy phép; (6) điều kiện nhận luật đo trên 548 clip A4 và 528 đoạn S6, ghi vào `gd1_no_speech.md`. Phần cần máy rảnh nằm ở b·T7–T9.
- N1: b·T1, b·T2 đếm `speech_ms` không gồm đệm hay khoảng lặng, chỉ câu sang `done`, không tính `same_lang`, `failed`, `skipped`; phát qua `EventSink::usage` (QĐ25, QĐ26).
- N2: b·T5 `ClockFiller` chỉ chèn khi nguồn không trả mẫu, mỗi lần tối đa 2 giây.
- N3: b·T2 câu cuối dịch nốt trong `mt.stop_grace_ms` (3 giây).
- N4: b·T4 `--write-baseline`, `failed` không vào thời gian, cột Lỗi, `is not None`.
- N5: b·T9 `gd1_s6.md` có mục "Máy lúc chạy", nhãn `m4pro-gd1-s6`.
- N6: b·T8 chặn chia cho 0.
- N7: b·T5 nhận `RPC_E_CHANGED_MODE`, khi đó không gọi `CoUninitialize`.
- N8: ghi chú cho 03 ở đầu 02c.
- N9: danh sách Files của mỗi task sinh từ diff của commit; dòng mô tả sai về `lifecycle.rs` không còn (02b không sửa file này).
- N10: b·T2 `Engine::start` chạy luồng VAD sau cùng; không tạo được một luồng thì đặt cờ dừng và đóng hàng đợi, các luồng đã chạy tự kết thúc.
- N11: b·T5 `failed()` khi mọi tiến trình của app đã thoát.
- N12: b·T4 áp `--limit` trước khi lọc variant.
- Ngoài 02b: pidfile và `InfoPlist.strings` như 02c Q8(a), Q8(c).

**Review 02c**
- Thử nghiệm 1: c·T1 `build.rs` tạo `binaries/` trước `rerun-if-changed`.
- N1 (Thoát treo): c·T3 `shutdown` không chờ khóa của `SidecarManager`, `prepare` không giữ `live` khi gọi manager; d·T3 `running()` atomic; test ở Q6.
- N2(a): như 02a mục 4. N2(b): d·T1 `current_dir` là thư mục binaries ở mọi chỗ spawn, c·T1 từ chối thư viện lạ (có test); ghi cho 07 ở điểm cần quyết 9. N2(c): c·T1 Windows giữ handle chỉ cho đọc (share mode đọc) của file đã kiểm (QĐ17).
- Q1 (Hủy): c·T3 về `idle` ngay, kiểm cờ lần nữa dưới khóa trước khi gắn engine.
- Q2: c·T2 `FailurePolicy` (10 giây).
- Q3: c·T2 theo dõi đổi thiết bị cho cả nguồn App, nguồn App mở lại khi mọi tiến trình thoát; lượt sửa sau (Q-G của review lần 2) thêm dấu hiệu số khung đứng yên khi app đang phát.
- Q4: c·T2 `ZeroWatch`, c·T3 `permission_suspected`, c·T6 cảnh báo kèm nút; c·T8 thử "Don't Allow".
- Q5: b·T5 trần 2 giây, test khoảng trống 1 giờ.
- Q6: c·T3 `PrepareGate` và bốn test.
- Q7: c·T1, c·T3 probe chờ 60 giây với binary chưa gặp, quá giờ không nhớ, chạy nền ở `setup`, đọc stdout trên luồng riêng.
- Q8(a): d·T1 pidfile và `reap_orphans`, test `stdin_eof.rs`; c·T3 dọn ở `setup`; c·T8 thử Force Quit (QĐ8). Q8(b): b·T5, c·T4, c·T6 (QĐ30). Q8(c): c·T4 (QĐ31).
- Q9: c·T8 và c·T9 thêm mọi bước review liệt kê.
- Nhỏ: `build.rs` (c·T1); comment "`start()` chờ lâu" bỏ, `Drop` join tối đa 500 ms (c·T2); `rev` (c·T3, c·T5); `JoinError` thành `unknown` (c·T3); `audio://level` chỉ gửi cửa sổ chính (c·T3); `LevelMeter` (c·T6); "áp dụng từ phiên sau" (c·T6); test thay chính `asr-worker`, `llama-server` và hàm thuần `integrity_error_code`, `give_up_code` (c·T1, c·T3); Unix từ chối file người khác ghi được (c·T1).

**Review store giao diện của 01** (commit `3a275a2`, `af007e5` trên `main`, controller chuyển cho 02c)
- 1 (kết quả lệnh cũ đè sự kiện mới): `AppStatus.rev` (c·T3), store bỏ trạng thái có `rev` nhỏ hơn ở cả sự kiện, kết quả lệnh và `init()` (c·T5); `init()` cũng giữ cài đặt đã tới qua sự kiện. `Settings` chưa thêm số thứ tự (điểm cần quyết 10).
- 2 (`upsertLine` gắn phụ đề đã trôi vào cuối): c·T5, có test thay tại chỗ một dòng không nằm cuối.
- 3 (id duy nhất qua các phiên, xóa phụ đề khi phiên mới bắt đầu): `id_base` theo số phiên (c·T3, test `engine_config`), store thanh phụ đề xóa `lines` khi nhận `starting` (c·T5).
- 4 (`overlay://view` cắt `lines`): đã có từ c·T5, có test.

**Review lần 2 (bản `4a1c310`), 02a và 02d**
- Q1 (`OutOfMemory` lúc chép lời bị nuốt): d·T3 báo `OutOfMemory`, tính là một lần lỗi trên GPU (hai lần liên tiếp thì chuyển CPU), khởi động lại rồi gửi lại đoạn; worker giả có `error_on:<n>:OutOfMemory`; test `out_of_memory_while_transcribing_counts_as_a_gpu_failure`.
- Q2 (log callback chưa có test đi qua đường thật): a·T1 thông báo lỗi gửi app kèm các dòng log của whisper.cpp (`native_log::describe`); test `tests/native_log.rs` chạy binary thật (dòng log ra stderr và vào thông báo lỗi) và unit test `classify` đọc đúng dòng callback đã giữ. Giết LG1–LG3.
- Q3 (`Wake`, `running()`): d·T3 test `shutdown_interrupts_the_backoff_before_a_restart` (đồng hồ thật, backoff 60 giây) và `running_does_not_wait_for_a_model_that_is_loading`. Giết W1, W3, R1.
- Q4 (pidfile): d·T1 test tiến trình không còn là trưởng group (PF1), binary khác nằm trong thư mục cho phép (PF3), `spawn`/`release` ghi lại pidfile (PF5).
- Nhỏ: `remember` kill ngay tiến trình vừa chạy nếu app đã bắt đầu thoát (d·T3); `stop` bỏ `killers` dưới khóa của slot (d·T3); test O1 `llama_server_out_of_memory_at_start_is_reported` (d·T3); `validate()` thêm chặn dưới cho tám khóa (a·T2); doc của `process.rs` ghi đủ bốn điều kiện và việc dựa vào plugin single-instance (d·T1); `pump` cắt dòng ở 64 KiB và bỏ thêm phần đuôi để không sót nửa bí mật (d·T1); nhãn `(âm nhạc)`, `(音楽)`, `[音乐]`, `[음악]` (a·T2, test ở a·T3); luật `[bans]` của `deny.toml` cho `whisper-rs-sys` và `whisper-rs` (chỉ `asr-worker`) đã có trên `main` từ trước (commit `2e7790d`), không cần thêm.

**Review lần 2 (bản `4a1c310`), 02b và 02c**
- S1 (`upsertLine` làm mất phụ đề gộp): c·T5 phụ đề gộp vào đúng chỗ dòng đầu tiên bị thay; test theo đúng thứ tự sự kiện của engine.
- Q-A (câu kẹt ở `translating`): b·T2 `grow` cập nhật mục đang chờ trước khi thêm mục mới, `dispatch` bỏ mục cũ; test `a_sentence_that_grows_twice_while_translating_ends_done`.
- Q-B (`ZeroWatch` báo nhầm): c·T2 tắt hẳn sau mẫu khác 0 đầu tiên; nguồn một app chỉ xét chính app đó.
- Q-C (app đóng làm dừng phiên): c·T2 `FailurePolicy` trả `Wait` khi nguồn một app đã chạy được mà app không phát nữa: không dừng phiên, thử lại mỗi 2 giây; c·T3 trạng thái `waitingForApp`, c·T6 chỉ báo trên màn hình chính.
- Q-D (Task 8 chạy binary từ Terminal): c·T4 thêm `scripts/run-dev-app.sh` (gói `.app` có `Info.plist`, `InfoPlist.strings`, bundle id của app, mở bằng `open`); c·T8 dùng gói đó cho mọi bước thử quyền.
- Q-E (Hủy rồi Bắt đầu lại không phản hồi): c·T3 không giữ khóa phiên lúc chuẩn bị tiến trình phụ; mỗi lần bắt đầu có số riêng (`attempt`), Hủy tăng số; test `start_again_after_cancel_responds_at_once`.
- Q-F (tên app của helper): b·T5 tên và bundle ID đọc từ gói `.app` ngoài cùng (`NSBundle`), `NSRunningApplication` chỉ là đường lui; test với gói Calculator có sẵn và test `#[ignore]` in bảng app đang phát cho c·T8.
- Q-G (tap chết không dấu hiệu): c·T2 `StallWatch` (số khung đứng yên 3 giây trong khi app cần thu đang phát thì mở lại), nguồn một app mở lại khi tập tiến trình đang phát đổi, số liệu thu ghi vào log mỗi 60 giây; c·T8 kiểm tiền đề. Điểm cần quyết 6 cũ bỏ (đã làm).
- N-1: c·T3 `Engine::start` lỗi thì mã `unknown`. N-2: c·T1 stdout của `--probe` giữ tối đa 64 KiB, phần sau đọc rồi bỏ. N-3: c·T5 `init` của thanh phụ đề không ghi đè cài đặt mới hơn, cắt `lines` theo số dòng. N-4: b·T3 ghi chú `no_speech.rs` chép lời nguyên tín hiệu; b·T6 ghi nơi để script đối chiếu và khoảng `avg_logprob` của "Thank you." bịa ra. N-5: b·T4 `meta.json` có đường dẫn và kích thước `llama-server`. N-6: c·T3 `prepare` quên lý do bỏ cuộc cũ. N-7: c·T1 test `#[cfg(windows)]` cho handle chỉ đọc. N-8: b·T5 `audio_apps` chạy trong `autoreleasepool`. N-9: c·T6 tên dễ hiểu cho tiến trình WebKit. N-10: d·T1 và c·T3 ghi rõ việc dọn pidfile dựa vào plugin single-instance.
- Ghi chú cho 06: c·T3 thêm `SessionDeps::check_quota` (mặc định cho bắt đầu; test hạn mức còn 0 thì không bắt đầu); ghi chú ở đầu 02c: `EventSink::usage` chạy trên luồng phụ đề, không ghi kho khóa đồng bộ ở đó.
- Rebase lên `main` `940c169`: `Cargo.toml` của app giữ autostart 2.6.0, single-instance 2.5.1; `errors.rs` đặt khối mã lỗi của phiên dịch sau `UNSUPPORTED` dưới tiêu đề riêng, câu "Năm hằng" sửa lại; `system.rs` test hằng trang quyền là URL System Settings cố định, không đi qua `https_only`; giữ phần của đợt U (`disabled={pending}`, test M11, M12, `store/app.ts`, `app.test.ts`, `SettingsScreen.tsx`); mọi Expected lấy lại trên base mới.

**Review lần 3 (bản `f86b1b7`), 02a và 02d**
- Q-1 (OOM phải lỗi 2 lần liên tiếp mới chuyển CPU): d·T3 test kiểm đủ thứ tự sự kiện (lần đầu khởi động lại trên GPU). Giết A3.
- Q-2 (`pump` che bí mật trên dòng bị cắt): d·T1 test thêm bí mật trọn vẹn ở đầu dòng dài, và bí mật dài 21 byte vắt qua chỗ cắt ở vị trí `MAX_LINE_BYTES − 15`. Giết F4, F5.
- Q-3 (`Wake` của `llama-server`): d·T3 test ngắt lần chờ trước khi chạy lại `llama-server`, và lần chờ sau lần đầu chạy quá giờ. Giết C6, C7.
- N1: a·T1 `tests/native_log.rs` gửi `Load` sai hai lần, lần hai chỉ có log của chính nó (giết B1); B6 chấp nhận, ghi ở mục mutation. N2: a·T3 mọi kiểu ngoặc (toàn khổ `（）［］`, `【】`, `〔〕`) coi như một khi so nhãn, có test. N3: a·T2 test `bounds_are_exact` (đúng ở biên được nhận, ngay ngoài biên bị từ chối; giết E1–E5). N4: c·T3 bước xóa `session_stub.rs` là `Run:`. N5: d·T1 test binary chạy qua symlink (giết D3). N6: d·T3 `running()` khi chỉ `llama-server` chạy, và tắt khi rảnh vẫn tắt được (giết C3). N7: a·T1 Step 8 và QĐ15 ghi code Windows của `asr-worker` biên dịch lần đầu ở c·T9. N8: b·T4 Step 5 giải thích `git_dirty`; câu dẫn của bước đỏ ghi "trích 6 dòng lỗi khác nhau đầu tiên"; mục "Cách đọc" ghi các khối trích và việc `Cargo.lock` có thể khác ở cạnh phụ thuộc.

**Review lần 3 (bản `f86b1b7`), 02b và 02c**
- R3-1 (bỏ cuộc rồi Bắt đầu không thử lại): d·T3 `SidecarManager::allow_retry` tách khỏi `begin_session` (chỉ còn đếm phiên); c·T3 `SessionDeps::allow_retry` gọi trong `start_with` trước `prepare`, `prewarm` không gọi; `LiveDeps::allow_retry` quên lý do bỏ cuộc cũ (N-6) rồi gọi manager. Test: d·T3 bỏ cuộc, `begin_session` không đủ, `allow_retry` thì chạy được; c·T3 thứ tự `allow_retry` trước `prepare` khi bấm Bắt đầu và không có khi chạy sẵn; unit test của `LiveDeps` cho N-6. c·T8 Step 8: ca sửa byte làm khi app đã thoát, mở lại gói đã build mà không build lại; thêm Expected khôi phục xong thì bấm Bắt đầu chạy được.
- Nhỏ-1: c·T3 lần đã hủy không mở nguồn âm thanh, chỉ lần mới mở (giết QE2, QE5). Nhỏ-2: b·T2 test câu đang chờ dịch được ghép thêm hai lần (giết QA3+QA2); ghi rõ tối đa hai lần ghép thêm. Nhỏ-3: c·T2 hàm thuần `on_tick` và `failure_event`, có test (giết bản QC4, QG3 đặt trong hàm thuần; phần nối trong vòng lặp xem review lần 4). Nhỏ-4: như R3-1. Nhỏ-5: c·T2 `StallBackoff` (3 lần đầu chờ 3 giây, sau đó gấp đôi, trần 30 giây, cảnh báo một lần, không tính vào `FailurePolicy`). Nhỏ-6: c·T2 chỉ mở lại khi có pid mới. Nhỏ-7: c·T3 lần đã hủy nạp lỗi thì bỏ chỉ báo "Đang nạp model", có test. Nhỏ-8: c·T5 lỗi bắt đầu nằm trong trạng thái thì thanh báo lỗi cũ cũng mất, có test. Nhỏ-9: c·T4 `run-dev-app.sh` chuyển `MT_*` qua `open --env` (`RUST_LOG` bỏ ở lượt sau).
- Bước sửa `src-tauri/Cargo.toml` ở c·T1–T3 ghi: nếu `main` đã nâng plugin Tauri thì giữ bản của `main` (áp bằng `git apply --3way` nếu chỉ lệch ở dòng phiên bản).

**Review lần 4 (bản `3a06780`)**
- Q4-1 (phần thật của R3-1 chưa có test): c·T3 test `LiveDeps` với một `SidecarManager` thật đã bỏ cuộc: `allow_retry` làm nó chạy lại (`before_spawn` được gọi lại; giết R3); d·T3 test `llama-server` bỏ cuộc rồi thử lại được (giết R5, R8) và `Tampered` thì SHA-256 được kiểm lại khi thử lại (giết R7). c·T8 Step 8 thêm ca model rác cùng tên (`modelBroken` do `ModelLoad` trên CPU, tức bỏ cuộc thật bên trong giám sát); trả model thật về rồi bấm Bắt đầu thì phiên chạy, không khởi động lại app.
- Q4-2 (controller quyết): d·T3 `allow_retry` sau khi bỏ cuộc, với mọi lý do, trả `use_gpu` của cả hai tiến trình phụ và `asr_on_cpu` về quyết định ban đầu theo `--probe`; GPU vẫn lỗi thì luật 2 lần lỗi liên tiếp chuyển CPU lại; chưa bỏ cuộc thì giữ CPU như cũ. c·T3 `asr-worker` tới `Ready` bằng GPU thì bỏ chỉ báo `cpuFallback`. Test: d·T3 `a_retry_after_giving_up_starts_again_on_the_gpu` (asr `gpu=true`, llama `ngl=auto`), `llama_server_is_retried_after_giving_up` (llama đã sang `-ngl 0` thì thử lại bằng GPU); c·T3 `a_gpu_ready_clears_the_cpu_fallback_note`. Ghi ở QĐ7.
- Nhỏ-1: c·T2 `Watch` gom `StallBackoff` và `StallWatch`; có khung trở lại thì bậc chờ về đầu ngay trong lần mở đó (`StallWatch::set_threshold`). Nhỏ-2: phần thân của một lần kiểm là `Watch::tick`, có test qua nhiều lần mở (giết SB1–SB3, SB6, SB8, QG3s); phần nối còn lại của vòng lặp (QC4l, QG3l, OT4r) ghi ở mục mutation, kiểm bằng tay ở c·T8. Nhỏ-3: thêm QE4 (và GP3, G1) vào câu về lớp chặn đôi. Nhỏ-4: c·T8 Step 8 do người dùng mở app; lệnh tắt Vite có trong bước. Nhỏ-5: bỏ `RUST_LOG` khỏi `open --env`. Nhỏ-6: QĐ17 ghi file bị sửa trong lúc tiến trình phụ đang chạy chỉ bị phát hiện ở lần chạy lại sau. Nhỏ-7: test có `〔音楽〕` (giết G9); comment ở `DEFAULT_HALLUCINATION_PHRASES` ghi việc giữ cả `[âm nhạc]` và `(âm nhạc)` là cố ý. Nhỏ-8: mục "Cách đọc" ghi chạy `pnpm install --frozen-lockfile` trước 02c trên worktree mới.

---

## Task 1: Giao thức `asr-worker` bản 2

Các việc "Việc cho MVP" của §6.4 về giao thức và worker (dòng 102–104, 109, 122–127, 129; QĐ2, QĐ6):
- `asr-protocol`: `PROTOCOL_VERSION`, enum `Backend`, `DecodeMode`, `ErrorKind`; `Ready.protocol_version` đứng đầu; `Error.kind`; `TranscribeRequest.prev_lang` đứng cuối.
- `asr-worker`:
  - không giữ ngôn ngữ của đoạn trước (`prev_lang` trong yêu cầu); kiểm `prev_lang` thuộc tập cho phép;
  - chỉ dùng prompt của app khi ngôn ngữ không đổi (`prompt_for`);
  - phân loại lỗi (`classify`) theo cả thông báo lỗi lẫn các dòng cảnh báo, lỗi gần nhất của whisper.cpp và ggml (`native_log`: log callback vẫn ghi ra stderr, giữ 20 dòng gần nhất), vì whisper-rs chỉ trả `InitError` hay `GenericError` (#1 của review 02a); thông báo lỗi gửi cho app kèm các dòng đó (`native_log::describe`), và `tests/native_log.rs` chạy binary thật để kiểm dòng log của whisper.cpp vẫn ra stderr và có trong thông báo lỗi (Q2 của review 02 lần 2), và các dòng giữ lại chỉ là của yêu cầu hiện tại (B1 của review 02 lần 3); trả `InvalidRequest` cho đầu vào sai thay vì panic;
  - báo thiết bị thật (`backend.rs`);
  - giữ riêng stdout cho giao thức (`platform::protocol_stdout`); trên Windows chỉ nạp DLL từ thư mục của mình và System32 (`harden_dll_search`).
- `.cargo/config.toml`: cờ linker `/DEPENDENTLOADFLAG:0x800` cho target Windows, để cả DLL nạp lúc khởi động (import thẳng, như `vulkan-1.dll`) cũng chỉ được tìm trong System32 (QĐ32).
- `third_party/`: bản vá `set_audio_ctx` trả −1 (C) và `Result` (Rust) khi giá trị ngoài khoảng.
- Chỗ dùng giao thức: `pipeline::asr_client` từ chối worker lệch phiên bản; `latency-bench` truyền `prev_lang` như worker cũ tự giữ, nên S6 và A4 không đổi.

**Files:**
- Sửa: `.cargo/config.toml`
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/asr-protocol/src/lib.rs`
- Sửa: `crates/asr-worker/Cargo.toml`
- Tạo: `crates/asr-worker/src/backend.rs`
- Sửa: `crates/asr-worker/src/engine.rs`
- Sửa: `crates/asr-worker/src/lib.rs`
- Sửa: `crates/asr-worker/src/main.rs`
- Tạo: `crates/asr-worker/src/native_log.rs`
- Tạo: `crates/asr-worker/src/platform.rs`
- Sửa: `crates/asr-worker/src/shared.rs`
- Test (tạo): `crates/asr-worker/tests/audio_ctx_patch.rs`
- Test (tạo): `crates/asr-worker/tests/native_log.rs`
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
@@ -459,6 +459,99 @@
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
+        let kind = |m: &str| classify_with(ErrorKind::Internal, &e(m), &[]);
+        assert_eq!(kind("ggml_metal: failed to allocate buffer"), ErrorKind::OutOfMemory);
+        assert_eq!(kind("VkResult ErrorOutOfDeviceMemory"), ErrorKind::OutOfMemory);
+        assert_eq!(kind("ggml_vulkan: failed to init device"), ErrorKind::GpuInit);
+        assert_eq!(kind("chép lời"), ErrorKind::Internal);
+        assert_eq!(
+            classify_with(ErrorKind::ModelLoad, &e("không nạp được model /x"), &[]),
+            ErrorKind::ModelLoad
+        );
+    }
+
+    /// whisper-rs chỉ trả `InitError`: lý do nằm trong log của ggml (`native_log`).
+    #[test]
+    fn failures_are_classified_by_the_native_log() {
+        let init = anyhow::anyhow!("nạp model: InitError");
+        let log = |lines: &[&str]| lines.iter().map(|l| l.to_string()).collect::<Vec<_>>();
+        assert_eq!(
+            classify_with(
+                ErrorKind::ModelLoad,
+                &init,
+                &log(&["ggml_metal_buffer_type_alloc_buffer: error: failed to allocate buffer of size 1200 MiB"])
+            ),
+            ErrorKind::OutOfMemory
+        );
+        assert_eq!(
+            classify_with(
+                ErrorKind::ModelLoad,
+                &init,
+                &log(&["whisper_backend_init_gpu: failed to initialize Vulkan backend: no device"])
+            ),
+            ErrorKind::GpuInit
+        );
+        assert_eq!(classify_with(ErrorKind::ModelLoad, &init, &[]), ErrorKind::ModelLoad);
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
@@ -1,4 +1,6 @@
+pub mod backend;
 pub mod engine;
 pub mod lid;
+pub mod native_log;
 #[cfg(feature = "shared-encode")]
 pub mod shared;
```

Tạo `crates/asr-worker/src/native_log.rs`, lúc này mới có phần test (phần code thêm ở bước sau):

```rust
//! Log của whisper.cpp và ggml (spec §6.4, §9). whisper-rs chỉ trả `InitError` hay `GenericError(n)`, còn lý do thật
//! (hết bộ nhớ GPU, khởi tạo Metal hay Vulkan lỗi) chỉ nằm trong log. Worker cài callback cho cả hai thư viện: mọi dòng
//! vẫn ra stderr như trước (file log của tiến trình phụ), và các dòng cảnh báo, lỗi gần nhất được giữ lại để
//! `engine::classify` phân loại lỗi.
//!
//! whisper.cpp và ggml không ghi âm thanh hay chữ chép lời vào log (worker tắt mọi cờ `print_*`).

#[cfg(test)]
mod tests {
    use super::*;
    use asr_protocol::ErrorKind;
    use whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_INFO;

    /// Biến toàn cục: các test của file này chạy lần lượt.
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn the_c_callback_keeps_warnings_and_errors_only() {
        let _g = SERIAL.lock().unwrap();
        clear();
        let line = |level, s: &str| {
            let c = std::ffi::CString::new(s).unwrap();
            // SAFETY: chuỗi C hợp lệ.
            unsafe { callback(level, c.as_ptr(), std::ptr::null_mut()) };
        };
        line(ggml_log_level_GGML_LOG_LEVEL_INFO, "whisper_init: loading model\n");
        line(
            ggml_log_level_GGML_LOG_LEVEL_ERROR,
            "ggml_metal_buffer_type_alloc_buffer: error: failed to allocate",
        );
        line(ggml_log_level_GGML_LOG_LEVEL_CONT, " buffer of size 1200 MiB\n");
        line(
            ggml_log_level_GGML_LOG_LEVEL_INFO,
            "whisper_backend_init_gpu: failed to initialize Vulkan backend\n",
        );
        // SAFETY: con trỏ null bị bỏ qua.
        unsafe {
            callback(
                ggml_log_level_GGML_LOG_LEVEL_ERROR,
                std::ptr::null(),
                std::ptr::null_mut(),
            )
        };
        assert_eq!(
            recent(),
            [
                "ggml_metal_buffer_type_alloc_buffer: error: failed to allocate",
                "buffer of size 1200 MiB",
                "whisper_backend_init_gpu: failed to initialize Vulkan backend",
            ]
        );
        clear();
        assert!(recent().is_empty());
    }

    /// Q2 của review 02 lần 2: `classify` (không phải `classify_with`) đọc đúng các dòng callback đã giữ, và thông báo
    /// lỗi gửi cho app có các dòng đó.
    #[test]
    fn classify_and_describe_read_the_kept_lines() {
        let _g = SERIAL.lock().unwrap();
        clear();
        let err = anyhow::anyhow!("không nạp được model: InitError");
        assert_eq!(
            crate::engine::classify(ErrorKind::ModelLoad, &err),
            ErrorKind::ModelLoad
        );
        assert_eq!(describe(&err), "không nạp được model: InitError");
        let c =
            std::ffi::CString::new("ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer\n").unwrap();
        // SAFETY: chuỗi C hợp lệ.
        unsafe { callback(ggml_log_level_GGML_LOG_LEVEL_ERROR, c.as_ptr(), std::ptr::null_mut()) };
        assert_eq!(
            crate::engine::classify(ErrorKind::ModelLoad, &err),
            ErrorKind::OutOfMemory
        );
        assert_eq!(
            describe(&err),
            "không nạp được model: InitError (log của whisper.cpp: \
             ggml_backend_cpu_buffer_type_alloc_buffer: failed to allocate buffer)"
        );
        clear();
    }

    #[test]
    fn only_the_last_lines_are_kept() {
        let _g = SERIAL.lock().unwrap();
        clear();
        for i in 0..KEEP + 5 {
            record(ggml_log_level_GGML_LOG_LEVEL_WARN, &format!("warn {i}"));
        }
        let kept = recent();
        assert_eq!(kept.len(), KEEP);
        assert_eq!(kept[0], "warn 5");
        clear();
    }
}
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

Tạo `crates/asr-worker/tests/native_log.rs`:

```rust
//! Log của whisper.cpp và ggml đi qua callback của worker (`native_log`, Q2 của review 02 lần 2): chạy binary thật, nạp
//! một model không có. whisper.cpp báo lỗi mở file qua log; dòng đó phải vẫn ra stderr (file log của tiến trình phụ) và
//! có trong thông báo lỗi gửi cho app. Các dòng giữ lại chỉ là của yêu cầu hiện tại: worker xóa chúng trước mỗi yêu cầu
//! (B1 của review 02 lần 3), nên lỗi sau không bị xếp theo log của lỗi trước.

use asr_protocol::{ErrorKind, Request, Response, read_frame, write_frame};
use std::io::{BufReader, BufWriter, Read};
use std::process::{Command, Stdio};

#[test]
fn whisper_log_lines_reach_stderr_and_the_error_message() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut input = BufWriter::new(child.stdin.take().unwrap());
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let load = Request::Load {
        model_path: "/khong/co/model.bin".into(),
        use_gpu: false,
        n_threads: 1,
    };
    let mut load_error = || {
        write_frame(&mut input, &load).unwrap();
        match read_frame::<_, Response>(&mut output).unwrap().unwrap() {
            Response::Error { kind, message, .. } => {
                assert_eq!(kind, ErrorKind::ModelLoad);
                message
            }
            other => panic!("cần Error ModelLoad, nhận {other:?}"),
        }
    };
    let message = load_error();
    let again = load_error();
    assert_eq!(
        again.matches("failed to open").count(),
        1,
        "chỉ log của yêu cầu này: {again}"
    );
    drop(input);
    let mut stderr = String::new();
    child.stderr.take().unwrap().read_to_string(&mut stderr).unwrap();
    assert!(child.wait().unwrap().success());
    assert!(message.contains("failed to open"), "{message}");
    assert!(stderr.contains("failed to open '/khong/co/model.bin'"), "{stderr}");
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
Expected: biên dịch lỗi, vì chưa có các kiểu và trường mới (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0425]: cannot find value `PROTOCOL_VERSION` in this scope
error[E0433]: cannot find type `ErrorKind` in this scope
error[E0560]: struct `TranscribeRequest` has no field named `prev_lang`
error[E0559]: variant `Response::Ready` has no field named `protocol_version`
error[E0433]: cannot find type `Backend` in this scope
error[E0433]: cannot find type `DecodeMode` in this scope
```

Run: `cargo test -p asr-worker --features shared-encode --lib`
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0432]: unresolved import `asr_protocol::ErrorKind`
error[E0433]: cannot find type `ErrorKind` in this scope
error[E0425]: cannot find type `Mutex` in this scope
error[E0433]: cannot find type `Mutex` in this scope
error[E0425]: cannot find value `ggml_log_level_GGML_LOG_LEVEL_ERROR` in this scope
error[E0425]: cannot find value `ggml_log_level_GGML_LOG_LEVEL_CONT` in this scope
```

- [ ] **Step 4: Sửa bản vá `set_audio_ctx` và dựng lại `third_party/`**

Thay toàn bộ `third_party/patches/0001-whisper-cpp-set-audio-ctx.patch` bằng:

```diff
diff --git a/whisper-rs-sys/src/bindings.rs b/whisper-rs-sys/src/bindings.rs
index ecaf862..7ad3944 100644
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
index f4cc6bf..689994b 100644
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
index 5b6e4b4..6ef025f 100644
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

Sửa `.cargo/config.toml` (áp bằng `git apply`):

```diff
--- a/.cargo/config.toml
+++ b/.cargo/config.toml
@@ -13,3 +13,9 @@
 GGML_FMA = { value = "ON", force = true }
 GGML_F16C = { value = "ON", force = true }
 GGML_AVX512 = { value = "OFF", force = true }
+
+# Windows: DLL mà file chạy import thẳng (nạp lúc khởi động, trước cả `SetDefaultDllDirectories`, ví dụ `vulkan-1.dll`)
+# chỉ được tìm trong System32, không tìm ở thư mục hiện hành hay PATH (spec §10.2). 0x800 là
+# `LOAD_LIBRARY_SEARCH_SYSTEM32`. Áp cho mọi binary của workspace (app, `asr-worker`); kiểm trên Windows ở 02c Task 9.
+[target.x86_64-pc-windows-msvc]
+rustflags = ["-C", "link-arg=/DEPENDENTLOADFLAG:0x800"]
```

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
@@ -348,6 +308,88 @@
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
+/// Loại lỗi theo thông báo lỗi và các dòng cảnh báo, lỗi gần nhất trong log của whisper.cpp và ggml (`native_log`), vì
+/// whisper-rs chỉ trả `InitError` hay `GenericError`: hết bộ nhớ (kể cả bộ nhớ GPU) là `OutOfMemory`, lỗi khởi tạo GPU là
+/// `GpuInit`, còn lại là `default`.
+pub fn classify(default: ErrorKind, err: &anyhow::Error) -> ErrorKind {
+    classify_with(default, err, &crate::native_log::recent())
+}
+
+/// Như [`classify`], với các dòng log cho sẵn.
+pub fn classify_with(default: ErrorKind, err: &anyhow::Error, log: &[String]) -> ErrorKind {
+    let text = format!("{err:#}\n{}", log.join("\n")).to_lowercase();
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
@@ -2,5 +2,6 @@
 pub mod engine;
 pub mod lid;
 pub mod native_log;
+pub mod platform;
 #[cfg(feature = "shared-encode")]
 pub mod shared;
```

Sửa `crates/asr-worker/src/main.rs` (áp bằng `git apply`):

```diff
--- a/crates/asr-worker/src/main.rs
+++ b/crates/asr-worker/src/main.rs
@@ -1,23 +1,31 @@
 //! Tiến trình phụ `asr-worker`: đọc `Request` từ stdin, ghi `Response` ra stdout (spec §6.4).
-//! stdout chỉ dùng cho khung giao thức; mọi log đều ra stderr. whisper.cpp và ggml tự ghi log ra stderr, nên không
-//! gọi `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).
+//! stdout chỉ dùng cho khung giao thức: ngay khi chạy, worker giữ riêng stdout cho giao thức và trỏ fd 1 sang stderr
+//! (`platform::protocol_stdout`), nên log lạ của thư viện C không lọt vào kênh giao thức. Log của whisper.cpp và ggml đi
+//! qua `native_log` (vẫn ra stderr, và giữ các dòng lỗi gần nhất để phân loại lỗi). Không gọi
+//! `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).
 
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
+    asr_worker::native_log::install();
     let mut input = BufReader::new(std::io::stdin().lock());
-    let mut output = BufWriter::new(std::io::stdout().lock());
+    let mut output = BufWriter::new(protocol);
     let mut engine: Option<Engine> = None;
 
     while let Some(request) = read_frame::<_, Request>(&mut input)? {
+        asr_worker::native_log::clear();
         let response = match request {
             Request::Load {
                 model_path,
@@ -25,17 +33,19 @@
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
@@ -44,7 +54,8 @@
                 }
                 Err(e) => Response::Error {
                     segment_id: None,
-                    message: format!("{e:#}"),
+                    kind: classify(ErrorKind::ModelLoad, &e),
+                    message: asr_worker::native_log::describe(&e),
                 },
             },
             Request::Warmup => match engine.as_mut() {
@@ -52,7 +63,8 @@
                     Ok(millis) => Response::WarmupDone { millis },
                     Err(err) => Response::Error {
                         segment_id: None,
-                        message: format!("{err:#}"),
+                        kind: classify(ErrorKind::Internal, &err),
+                        message: asr_worker::native_log::describe(&err),
                     },
                 },
                 None => not_loaded(None),
@@ -60,9 +72,10 @@
             Request::Transcribe(req) => match engine.as_mut() {
                 Some(e) => match e.transcribe(&req) {
                     Ok(result) => Response::Result(result),
-                    Err(err) => Response::Error {
+                    Err((kind, err)) => Response::Error {
                         segment_id: Some(req.segment_id),
-                        message: format!("{err:#}"),
+                        kind,
+                        message: asr_worker::native_log::describe(&err),
                     },
                 },
                 None => not_loaded(Some(req.segment_id)),
@@ -77,15 +90,8 @@
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

Thêm vào `crates/asr-worker/src/native_log.rs` phần code sau, ngay dưới các dòng `//!` đầu file và trên `#[cfg(test)]`:

```rust
use std::collections::VecDeque;
use std::ffi::{CStr, c_char, c_void};
use std::io::Write;
use std::sync::Mutex;

use whisper_rs_sys::{
    ggml_log_level, ggml_log_level_GGML_LOG_LEVEL_CONT, ggml_log_level_GGML_LOG_LEVEL_ERROR,
    ggml_log_level_GGML_LOG_LEVEL_WARN,
};

/// Số dòng cảnh báo, lỗi giữ lại.
pub const KEEP: usize = 20;

static RECENT: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());
/// Dòng trước có được giữ không, để dòng nối tiếp (`GGML_LOG_LEVEL_CONT`) theo cùng.
static LAST_KEPT: Mutex<bool> = Mutex::new(false);

/// Cài callback cho whisper.cpp và ggml. Gọi một lần, trước `Load`.
pub fn install() {
    // SAFETY: hai hàm chỉ lưu con trỏ hàm; `callback` sống suốt chương trình và không dùng `user_data`.
    unsafe {
        whisper_rs_sys::whisper_log_set(Some(callback), std::ptr::null_mut());
        whisper_rs_sys::ggml_log_set(Some(callback), std::ptr::null_mut());
    }
}

/// Callback của whisper.cpp và ggml.
///
/// # Safety
/// `text` là null hoặc một chuỗi C kết thúc bằng NUL, như whisper.cpp và ggml truyền.
pub unsafe extern "C" fn callback(level: ggml_log_level, text: *const c_char, _user_data: *mut c_void) {
    if text.is_null() {
        return;
    }
    // SAFETY: theo hợp đồng của hàm.
    let text = unsafe { CStr::from_ptr(text) }.to_string_lossy();
    let _ = std::io::stderr().write_all(text.as_bytes());
    record(level, &text);
}

/// Giữ dòng nếu là cảnh báo, lỗi, hay có chữ "error"/"failed"; dòng nối tiếp theo dòng trước.
pub fn record(level: ggml_log_level, text: &str) {
    let mut last = LAST_KEPT.lock().unwrap_or_else(|e| e.into_inner());
    let lower = text.to_lowercase();
    let keep = if level == ggml_log_level_GGML_LOG_LEVEL_CONT {
        *last
    } else {
        level == ggml_log_level_GGML_LOG_LEVEL_WARN
            || level == ggml_log_level_GGML_LOG_LEVEL_ERROR
            || lower.contains("error")
            || lower.contains("failed")
    };
    *last = keep;
    if !keep || text.trim().is_empty() {
        return;
    }
    let mut recent = RECENT.lock().unwrap_or_else(|e| e.into_inner());
    if recent.len() == KEEP {
        recent.pop_front();
    }
    recent.push_back(text.trim().to_string());
}

/// Các dòng đã giữ, cũ trước.
pub fn recent() -> Vec<String> {
    RECENT
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .cloned()
        .collect()
}

/// Thông báo lỗi gửi cho app (`Response::Error.message`, app ghi vào log của nó): lỗi của worker, kèm các dòng cảnh
/// báo, lỗi của whisper.cpp và ggml trong yêu cầu này, vì lý do thật thường chỉ nằm ở đó.
pub fn describe(err: &anyhow::Error) -> String {
    let log = recent();
    if log.is_empty() {
        format!("{err:#}")
    } else {
        format!("{err:#} (log của whisper.cpp: {})", log.join(" | "))
    }
}

/// Bỏ các dòng đã giữ. Gọi trước mỗi yêu cầu, để lỗi của yêu cầu sau không bị xếp theo log của yêu cầu trước.
pub fn clear() {
    RECENT.lock().unwrap_or_else(|e| e.into_inner()).clear();
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
test result: ok. 25 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.92s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test stdout_isolation ... ok
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
     Running unittests src/lib.rs (target/debug/deps/asr_worker-36b46dcb2b33ce3b)
     Running unittests src/main.rs (target/debug/deps/asr_worker-41e8dcb2896776c8)
     Running tests/audio_ctx_patch.rs (target/debug/deps/audio_ctx_patch-c8458b09af762376)
     Running tests/native_log.rs (target/debug/deps/native_log-816aec5c5c01ead0)
     Running tests/protocol.rs (target/debug/deps/protocol-49e0b4d80e1bffee)
     Running tests/stdout_isolation.rs (target/debug/deps/stdout_isolation-e83792a9407cf843)
```

```text
test result: ok. 39 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 0 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s
test stdout_isolation ... ok
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

Run: `cargo test -p pipeline -p latency-bench`
Expected: mọi test cũ vẫn qua:

```text
test result: ok. 40 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
test result: ok. 37 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
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
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.08s
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

Code Windows của `asr-worker` (`platform::harden_dll_search`, `protocol_stdout` cho Windows) không được biên dịch thử trên Mac: build script của `whisper-rs-sys` không biên dịch chéo được, nên clippy cho target Windows (QĐ15, `scripts/check-windows.sh`) chỉ gồm `meeting-translator`, `pipeline` và `audio-capture`. Lần đầu nó được biên dịch là ở 02c Task 9 trên máy Windows (N7 của review 02 lần 3).

- [ ] **Step 9: Commit**

`third_party/` cần `git add -f`, vì `.gitignore` của whisper-rs chặn `Cargo.lock` của nó (`third_party/README.md`).

```bash
git add -f third_party
git add .cargo/config.toml Cargo.lock deny.toml crates/asr-protocol crates/asr-worker crates/latency-bench/src/asr_eval.rs \
  crates/latency-bench/src/latency.rs crates/pipeline/src/asr_client.rs
git commit -m "feat(asr): giao thức asr-worker bản 2 (§6.4, Việc cho MVP)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Luật cắt câu, ghép câu và bỏ đoạn vào `pipeline`

Chuyển nguyên luật của `latency-bench` sang `pipeline` (Đ3), để app và công cụ đo S6 dùng đúng một bản (dòng 96, 97, 114, 281, 285):
- `config.rs`: mọi ngưỡng của pipeline trong `PipelineConfig` (QĐ21). Task này dùng phần segmenter, ghép câu và lọc; các phần khác dùng ở task sau.
- `sentence.rs`: ghép câu và phụ đề tạm (§6.3): dấu câu kết thúc, cửa sổ ghép `max(700, vadEndSilenceMs + 400)` ms, chỉ ghép cùng ngôn ngữ, zh và ja nối không dấu cách, trần 15 giây hoặc 3 đoạn.
- `filter.rs`: luật bỏ đoạn theo `no_speech_prob` và `avg_logprob`, độ dài đoạn gửi cho worker.
- `segmenter.rs`: thêm `Serialize`/`Deserialize` cho `SegmenterConfig`, để nằm trong `PipelineConfig`; `Segment` mang thêm `speech_ms` (độ dài tiếng nói không gồm đệm, §6.3; hạn mức tính phút bằng số này, §6.8) và hai số của VAD trên các khung tiếng nói, `mean_prob` và `speech_ratio` (luật câu đệm của Task 3 dùng).
- `config.rs` còn có: ngưỡng tỉ lệ token theo cột "câu gốc ≥ 10 token" của `s7_mt_decisions.md` (QĐ12), hạn dịch câu cuối khi Dừng `mt.stop_grace_ms` (3 giây), `validate()` kiểm mọi khóa có giới hạn, kể cả chặn dưới của các thời gian chờ, số luồng và số token (QĐ21), có test đúng ở biên và ngay ngoài biên (N3 của review 02 lần 3), và nhãn có ngoặc của tiếng Việt, Nhật, Trung, Hàn (`(âm nhạc)`, `(音楽)`, `[音乐]`, `[음악]`).
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
//!
//! Vài hằng số cố ý để ngoài, vì chúng không đổi hành vi dịch và manifest đổi chúng sai thì khó chẩn đoán:
//! - chu kỳ kiểm nguồn âm thanh (`WATCH_EVERY`, 500 ms, spec §6.2) và nhịp ghi phút (`TICK_EVERY`) của app;
//! - timeout của lượt thử GPU (`PROBE_TIMEOUT`), gắn với cách đo của `gpu_probe`;
//! - kích thước xoay log của tiến trình phụ, thuộc phần chẩn đoán chứ không thuộc pipeline.
//!
//! Hạn dịch câu cuối khi Dừng thì nằm ở đây (`mt.stop_grace_ms`), vì nó quyết định câu nào thành `skipped`.

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
        assert_eq!((t.ratio_min_source_tokens, t.stop_grace_ms), (10, 3_000));
        assert_eq!(t.ratio_for("en", "vi"), Some(4.4));
        assert_eq!(t.ratio_for("zh", "vi"), Some(4.3));
        assert_eq!(t.ratio_for("vi", "en"), Some(1.4));
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

    /// Biên của các giới hạn (N3 của review 02 lần 3): giá trị ngay ngoài biên bị từ chối, giá trị đúng ở biên thì nhận.
    #[test]
    fn bounds_are_exact() {
        type Set = fn(&mut PipelineConfig, bool);
        let cases: [(&str, Set); 7] = [
            ("supervisor.failure_window_ms", |c, ok| {
                c.supervisor.failure_window_ms = if ok { 60_000 } else { 59_999 }
            }),
            ("audio.no_audio_after_ms", |c, ok| {
                c.audio.no_audio_after_ms = if ok { 5_000 } else { 4_999 }
            }),
            ("queue.asr_merge_max_ms", |c, ok| {
                c.queue.asr_merge_max_ms = if ok { 30_000 } else { 30_001 }
            }),
            ("audio.silent_rms", |c, ok| {
                c.audio.silent_rms = if ok { 0.0 } else { -0.1 }
            }),
            ("asr.n_threads", |c, ok| c.asr.n_threads = if ok { 64 } else { 65 }),
            ("queue.mt_skip_after_ms", |c, ok| {
                c.queue.mt_skip_after_ms = if ok { 1_000 } else { 999 }
            }),
            ("merge.window_extra_ms", |c, ok| {
                c.merge.window_extra_ms = if ok { 5_000 } else { 5_001 }
            }),
        ];
        for (key, set) in cases {
            let mut c = PipelineConfig::default();
            set(&mut c, false);
            assert_eq!(c.validate(), Err(key.to_string()), "{key} ngoài biên");
            let mut c = PipelineConfig::default();
            set(&mut c, true);
            assert_eq!(c.validate(), Ok(()), "{key} đúng ở biên");
        }
    }

    /// Mỗi khóa có giới hạn đều báo đúng tên khi sai, kể cả các khóa thêm sau review.
    #[test]
    fn every_bounded_key_is_checked() {
        type Break = fn(&mut PipelineConfig);
        let cases: [(&str, Break); 16] = [
            ("queue.asr_merge_max_ms", |c| c.queue.asr_merge_max_ms = 0),
            ("supervisor.idle_shutdown_ms", |c| c.supervisor.idle_shutdown_ms = 0),
            ("supervisor.ready_timeout_ms", |c| c.supervisor.ready_timeout_ms = 0),
            ("mt.request_timeout_ms", |c| c.mt.request_timeout_ms = 0),
            ("mt.stop_grace_ms", |c| c.mt.stop_grace_ms = 600_000),
            ("audio.silent_rms", |c| c.audio.silent_rms = f32::NAN),
            ("merge.window_min_ms", |c| c.merge.window_min_ms = 0),
            ("mt.ratio_thresholds", |c| {
                c.mt.ratio_thresholds[0].ratio = f32::INFINITY
            }),
            // Chặn dưới thêm ở review 02 lần 2.
            ("queue.mt_skip_after_ms", |c| c.queue.mt_skip_after_ms = 0),
            ("queue.asr_drop_after_ms", |c| c.queue.asr_drop_after_ms = 0),
            ("audio.no_audio_after_ms", |c| c.audio.no_audio_after_ms = 0),
            ("supervisor.failure_window_ms", |c| c.supervisor.failure_window_ms = 0),
            ("asr.n_threads", |c| c.asr.n_threads = 0),
            ("mt.max_tokens_per_source_token", |c| {
                c.mt.max_tokens_per_source_token = 0
            }),
            ("supervisor.shutdown_grace_ms", |c| c.supervisor.shutdown_grace_ms = 0),
            ("merge.window_extra_ms", |c| c.merge.window_extra_ms = 0),
        ];
        for (key, f) in cases {
            let mut c = PipelineConfig::default();
            f(&mut c);
            assert_eq!(c.validate(), Err(key.to_string()), "{key}");
        }
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

Sửa `crates/pipeline/src/segmenter.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/segmenter.rs
+++ b/crates/pipeline/src/segmenter.rs
@@ -241,6 +241,23 @@
         assert_eq!(s.samples.len(), (7 + 31 + 7) * FRAME_SAMPLES);
     }
 
+    /// `speech_ms` không gồm đệm (§6.3, hạn mức §6.8); `mean_prob` và `speech_ratio` chỉ tính các khung tiếng nói.
+    #[test]
+    fn segments_carry_speech_length_and_vad_statistics() {
+        let mut seg = Segmenter::new(SegmenterConfig::default());
+        // 10 khung chắc chắn (0,9) và 10 khung ở vùng trễ (0,4, vẫn là tiếng nói).
+        let out = run(
+            &mut seg,
+            &[(0.0, 0.0, 10), (0.9, 0.5, 10), (0.4, 0.3, 10), (0.0, 0.0, 20)],
+        );
+        assert_eq!(out.len(), 1);
+        let s = &out[0];
+        assert_eq!(s.speech_ms, 20 * FRAME_MS);
+        assert_eq!(s.speech_ms, s.end_ms - s.start_ms);
+        assert!((s.mean_prob - 0.65).abs() < 1e-5, "{}", s.mean_prob);
+        assert!((s.speech_ratio - 0.5).abs() < 1e-5, "{}", s.speech_ratio);
+    }
+
     #[test]
     fn segment_closes_exactly_after_end_silence() {
         let mut seg = Segmenter::new(SegmenterConfig::default());
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
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

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
@@ -265,11 +251,15 @@
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
         // để số đo S6 không đổi khi `prev_lang` chuyển sang `TranscribeRequest`.
+        // Cố ý khác app: engine của kế hoạch 02b chỉ cập nhật `prev_lang` và prompt bằng đoạn được giữ lại, còn S6 vẫn đo theo
+        // luật của Giai đoạn 0 để so được với mốc cũ. Đổi luật ở đây thì phải đo lại mốc S6.
         let mut prev_lang: Option<String> = None;
         for (segment, closed_at_ms) in seg_rx {
             let mut rec = SegmentRecord {
@@ -282,8 +272,8 @@
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
@@ -329,7 +319,7 @@
         for mut rec in asr_rx {
             let mt_started = now_ms();
             if rec.skipped.is_none() {
-                match route(&rec, target) {
+                match route(&rec, target, &filter_config) {
                     Err(reason) => {
                         // Đoạn hiện luôn chữ gốc (cùng ngôn ngữ đích, hoặc ngoài tập) cắt chuỗi ghép; đoạn bị bỏ thì không.
                         if !is_dropped(&reason) {
@@ -341,7 +331,7 @@
                         rec.mt_started_at_ms = Some(mt_started);
                         // Ghép câu (§6.3): đoạn bắt đầu nói trong cửa sổ ghép thì dịch lại cả câu, không chỉ đoạn này.
                         let (merged, source) = if merge {
-                            plan_merge(&mut open, &rec, src, merge_window)
+                            plan_merge(&mut open, &piece_of(&rec), merge_window, &merge_config)
                         } else {
                             (1, rec.text.trim().to_string())
                         };
@@ -500,92 +490,27 @@
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
    // Mọi kiểu ngoặc so như nhau (`filter::compact`), nên "[âm nhạc]" và "(âm nhạc)" là cùng một nhãn. Giữ cả hai cho
    // dễ đọc, như "[music]" và "(music)": cố ý, không phải sót.
    "[âm nhạc]",
    "(âm nhạc)",
    "(音楽)",
    "[音乐]",
    "[음악]",
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
    /// Khi bấm Dừng, câu cuối được dịch trong hạn chung này; quá hạn thì câu đó thành `skipped` (§7).
    pub stop_grace_ms: u64,
}

/// Ngưỡng tỉ lệ token của S7: cột "câu gốc ≥ 10 token" của bảng ngưỡng trong
/// `bench/phase0/results/s7_mt_decisions.md`, tức tỉ lệ lớn nhất đo được trên các câu gốc từ 10 token cộng biên 25%,
/// làm tròn lên 0,1. Cột này khớp với `ratio_min_source_tokens` = 10 (cách 2 của Q4): câu ngắn hơn không bị kiểm.
/// Tính lại cho cả tám cặp từ `bench/phase0/data/mt/outputs/*-plain.jsonl` ngày 2026-10-01, cùng số với bảng.
pub const DEFAULT_RATIO_THRESHOLDS: &[(&str, &str, f32)] = &[
    ("en", "vi", 4.4),
    ("zh", "vi", 4.3),
    ("ja", "vi", 3.5),
    ("ko", "vi", 3.5),
    ("vi", "en", 1.4),
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
            stop_grace_ms: 3_000,
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
        let q = &self.queue;
        let v = &self.supervisor;
        let checks: Vec<(&str, bool)> = vec![
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
            ("merge.window_min_ms", (100..=5_000).contains(&self.merge.window_min_ms)),
            (
                "merge.window_extra_ms",
                (100..=5_000).contains(&self.merge.window_extra_ms),
            ),
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
            ("asr.n_threads", (1..=64).contains(&self.asr.n_threads)),
            ("asr.timeout_ms", self.asr.timeout_ms >= 1_000),
            ("mt.repeat_penalty", self.mt.repeat_penalty >= 1.0),
            (
                "mt.retry_repeat_penalty",
                self.mt.retry_repeat_penalty >= self.mt.repeat_penalty,
            ),
            (
                "mt.max_tokens_per_source_token",
                self.mt.max_tokens_per_source_token >= 1,
            ),
            ("mt.max_tokens_cap", self.mt.max_tokens_cap >= 16),
            (
                "mt.ratio_thresholds",
                self.mt
                    .ratio_thresholds
                    .iter()
                    .all(|p| p.ratio.is_finite() && p.ratio > 0.0),
            ),
            ("mt.request_timeout_ms", self.mt.request_timeout_ms >= 1_000),
            ("mt.stop_grace_ms", self.mt.stop_grace_ms <= 30_000),
            ("queue.asr_max_waiting", q.asr_max_waiting >= 1),
            ("queue.asr_merge_max_ms", (1..=30_000).contains(&q.asr_merge_max_ms)),
            ("queue.asr_drop_after_ms", q.asr_drop_after_ms >= 1_000),
            ("queue.mt_max_waiting", q.mt_max_waiting >= 1),
            ("queue.mt_skip_after_ms", q.mt_skip_after_ms >= 1_000),
            ("supervisor.backoff_ms", !v.backoff_ms.is_empty()),
            ("supervisor.max_failures", v.max_failures >= 1),
            ("supervisor.failure_window_ms", v.failure_window_ms >= 60_000),
            ("supervisor.gpu_failures_to_cpu", v.gpu_failures_to_cpu >= 1),
            ("supervisor.ready_timeout_ms", v.ready_timeout_ms >= 5_000),
            (
                "supervisor.first_run_ready_timeout_ms",
                v.first_run_ready_timeout_ms >= 30_000 && v.first_run_ready_timeout_ms >= v.ready_timeout_ms,
            ),
            ("supervisor.idle_shutdown_ms", v.idle_shutdown_ms >= 10_000),
            ("supervisor.shutdown_grace_ms", v.shutdown_grace_ms >= 100),
            ("audio.no_audio_after_ms", self.audio.no_audio_after_ms >= 5_000),
            (
                "audio.silent_rms",
                self.audio.silent_rms.is_finite() && self.audio.silent_rms >= 0.0,
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
@@ -40,6 +43,12 @@
     /// Ranh giới tiếng nói, tính từ đầu phiên, không gồm phần đệm.
     pub start_ms: u64,
     pub end_ms: u64,
+    /// Độ dài tiếng nói, không gồm phần đệm: `end_ms − start_ms` (§6.3). Hạn mức tính phút bằng số này (§6.8).
+    pub speech_ms: u64,
+    /// Xác suất VAD trung bình trên các khung tiếng nói, và tỉ lệ khung vượt ngưỡng. Luật lọc câu đệm nghi ảo giác
+    /// (`filter`) dùng hai số này: tiếng nói thật thường cho xác suất cao và đều.
+    pub mean_prob: f32,
+    pub speech_ratio: f32,
     /// Âm thanh 16 kHz mono, đã gồm phần đệm: 200 ms làm tròn lên 7 khung (224 ms) mỗi phía. Đầu phiên,
     /// cuối phiên (`flush`) và phía bị cắt cưỡng bức có ít hơn. Đệm cuối của đoạn trước có thể trùng đệm đầu
     /// của đoạn sau (đều là khung im lặng), nên không được ghép `samples` của hai đoạn liền nhau mà coi như
@@ -52,6 +61,8 @@
     pre_roll: Vec<Vec<f32>>,
     frames: Vec<Vec<f32>>,
     energies: Vec<f32>,
+    /// Xác suất VAD của từng khung trong `frames`.
+    probs: Vec<f32>,
     last_speech_frame: u64,
     silence_run: u64,
     /// Phần dư sau cắt cưỡng bức đang còn tiếng nói: nối tiếp một đoạn dài, không áp `min_speech`.
@@ -98,6 +109,7 @@
                     pre_roll: self.history.drain(..).collect(),
                     frames: vec![frame.to_vec()],
                     energies: vec![energy(frame)],
+                    probs: vec![prob],
                     last_speech_frame: index,
                     silence_run: 0,
                     continuation: false,
@@ -113,6 +125,7 @@
 
         active.frames.push(frame.to_vec());
         active.energies.push(energy(frame));
+        active.probs.push(prob);
         if prob >= self.cfg.threshold {
             active.last_speech_frame = index;
             active.silence_run = 0;
@@ -129,7 +142,13 @@
             let speech_frames = speech_end.saturating_sub(active.start_frame);
             let keep = ((speech_frames as usize) + pad_frames).min(active.frames.len());
             if active.continuation || speech_frames * FRAME_MS >= self.cfg.min_speech_ms {
-                out.push(self.emit(active.start_frame, speech_end, &active.pre_roll, &active.frames[..keep]));
+                out.push(self.emit(
+                    active.start_frame,
+                    speech_end,
+                    &active.pre_roll,
+                    &active.frames[..keep],
+                    &active.probs,
+                ));
             }
             let tail_start = active.frames.len().saturating_sub(pad_frames);
             self.history = active.frames[tail_start..].iter().cloned().collect();
@@ -147,12 +166,20 @@
             let cut_frame = active.start_frame + cut as u64;
             let rest_frames = active.frames.split_off(cut);
             let rest_energies = active.energies.split_off(cut);
-            out.push(self.emit(active.start_frame, cut_frame, &active.pre_roll, &active.frames));
+            let rest_probs = active.probs.split_off(cut);
+            out.push(self.emit(
+                active.start_frame,
+                cut_frame,
+                &active.pre_roll,
+                &active.frames,
+                &active.probs,
+            ));
             self.active = Some(Active {
                 start_frame: cut_frame,
                 pre_roll: Vec::new(),
                 frames: rest_frames,
                 energies: rest_energies,
+                probs: rest_probs,
                 last_speech_frame: active.last_speech_frame,
                 silence_run: active.silence_run,
                 continuation: active.last_speech_frame >= cut_frame,
@@ -168,18 +195,38 @@
         let speech_end = active.last_speech_frame + 1;
         let speech_frames = speech_end.saturating_sub(active.start_frame);
         let keep = (speech_frames as usize + pad_frames).min(active.frames.len());
-        (active.continuation || speech_frames * FRAME_MS >= self.cfg.min_speech_ms)
-            .then(|| self.emit(active.start_frame, speech_end, &active.pre_roll, &active.frames[..keep]))
-    }
-
-    fn emit(&mut self, start_frame: u64, end_frame: u64, pre_roll: &[Vec<f32>], frames: &[Vec<f32>]) -> Segment {
+        (active.continuation || speech_frames * FRAME_MS >= self.cfg.min_speech_ms).then(|| {
+            self.emit(
+                active.start_frame,
+                speech_end,
+                &active.pre_roll,
+                &active.frames[..keep],
+                &active.probs,
+            )
+        })
+    }
+
+    /// `probs` thẳng hàng với khung đầu của đoạn (`start_frame`).
+    fn emit(
+        &mut self,
+        start_frame: u64,
+        end_frame: u64,
+        pre_roll: &[Vec<f32>],
+        frames: &[Vec<f32>],
+        probs: &[f32],
+    ) -> Segment {
         let id = self.next_id;
         self.next_id += 1;
         let samples = pre_roll.iter().chain(frames).flatten().copied().collect();
+        let speech = &probs[..((end_frame - start_frame) as usize).min(probs.len())];
+        let n = speech.len().max(1) as f32;
         Segment {
             id,
             start_ms: start_frame * FRAME_MS,
             end_ms: end_frame * FRAME_MS,
+            speech_ms: (end_frame - start_frame) * FRAME_MS,
+            mean_prob: speech.iter().sum::<f32>() / n,
+            speech_ratio: speech.iter().filter(|&&p| p >= self.cfg.threshold).count() as f32 / n,
             samples,
         }
     }
@@ -192,6 +239,9 @@
             .field("id", &self.id)
             .field("start_ms", &self.start_ms)
             .field("end_ms", &self.end_ms)
+            .field("speech_ms", &self.speech_ms)
+            .field("mean_prob", &self.mean_prob)
+            .field("speech_ratio", &self.speech_ratio)
             .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
             .finish()
     }
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
test result: ok. 61 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
```

Run: `cargo test -p latency-bench`
Expected:

```text
test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.24s
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

Các việc "Việc cho MVP" của §6.4 (dòng 115, 118, 120; QĐ4, QĐ5, QĐ24):
- `filter.rs`: `is_hallucination` (nhãn có ngoặc so khớp nguyên dạng, mọi kiểu ngoặc kể cả toàn khổ và `【】` coi như một; câu thường so khớp sau chuẩn hóa, cụm dài trước), `compression_ratio` (chuỗi lặp, zlib qua `miniz_oxide`), `is_suspect_filler` (câu đệm có thêm dấu hiệu), và `verdict(&Evidence, …)` gộp mọi luật theo thứ tự `NoSpeech`, `Hallucination`, `Repetition`, `Filler`. Danh sách và ngưỡng ở `config.rs` (`DEFAULT_HALLUCINATION_PHRASES`, `DEFAULT_FILLER_PHRASES`).
- `text.rs`: `display_text` đổi chữ của đoạn tiếng Trung sang giản thể bằng `ferrous-opencc` (bảng `t2s`, nạp một lần).
- `latency-bench` áp mọi luật như app, ghi lý do mới `hallucination`, `repetition`, `filler`, và ghi xác suất VAD của đoạn. Test chạy lại S6 áp `display_text` cho cả hai phía và tắt riêng luật câu đệm, nên vẫn khớp từng quyết định cũ. Hai test mới là điều kiện nhận luật (Q11 của review 02b): trên 528 đoạn S6 luật câu đệm chỉ bỏ đúng 2 đoạn có chữ sai, và trên 548 clip A4 không clip nào bị bỏ thêm (test này cần `bench/phase0/data`, bị bỏ qua mặc định).

**Files:**
- Sửa: `Cargo.lock` (cargo tự cập nhật)
- Sửa: `crates/latency-bench/src/latency.rs`
- Sửa: `crates/pipeline/Cargo.toml`
- Sửa: `crates/pipeline/src/config.rs`
- Sửa: `crates/pipeline/src/filter.rs`
- Sửa: `crates/pipeline/src/lib.rs`
- Tạo: `crates/pipeline/src/text.rs`

- [ ] **Step 1: Thêm phụ thuộc**

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -10,6 +10,9 @@
 asr-protocol = { path = "../asr-protocol" }
 candle-core = "0.11.0"
 candle-onnx = "0.11.0"
+ferrous-opencc = { version = "0.4.0", default-features = false, features = ["t2s-conversion"] }
+log = "0.4.34"
+miniz_oxide = { version = "0.9.1", default-features = false, features = ["with-alloc"] }
 reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "json"] }
 serde.workspace = true
 serde_json.workspace = true
```

Run: `cargo check -p pipeline`
Expected: cargo tải `ferrous-opencc` 0.4.0 (cùng `ferrous-opencc-compiler`, `fst`, `rkyv` và các crate của chúng) và `miniz_oxide` 0.9.1 vào `Cargo.lock`, rồi `Finished`. Module `text` chưa được khai báo ở bước này, vì file của nó chưa có.

- [ ] **Step 2: Khai báo module và viết test**

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

Sửa `crates/latency-bench/src/latency.rs` (áp bằng `git apply`):

```diff
--- a/crates/latency-bench/src/latency.rs
+++ b/crates/latency-bench/src/latency.rs
@@ -981,13 +981,42 @@
         // Luật `no_speech` của pipeline (cần cả hai điều kiện), đặt tên lý do như Giai đoạn 0.
         assert_eq!(route(&rec("ko", "안녕", 0.9, -1.5)), Err("no_speech".into()));
         assert_eq!(route(&rec("ko", "안녕", 0.62, -0.25)), Ok(Lang::Ko));
+        assert_eq!(
+            route(&rec("en", "Thank you for watching!", 0.0, -0.2)),
+            Err("hallucination".into())
+        );
+        assert_eq!(route(&rec("en", "Thank you.", 0.0, -0.2)), Ok(Lang::En));
+        assert_eq!(route(&rec("en", "Thank you.", 0.0, -0.9)), Err("filler".into()));
+        let weak_vad = SegmentRecord {
+            vad_mean_prob: Some(0.5),
+            ..rec("en", "You", 0.0, -0.2)
+        };
+        assert_eq!(route(&weak_vad), Err("filler".into()));
+        let long = SegmentRecord {
+            start_ms: 1_000,
+            end_ms: 3_000,
+            ..rec("en", "You", 0.0, -0.2)
+        };
+        assert_eq!(route(&long), Err("filler".into()), "2 giây tiếng nói mà một từ");
+        assert_eq!(
+            route(&rec("en", &"I will go. ".repeat(20), 0.0, -0.2)),
+            Err("repetition".into())
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
+            "repetition",
+            "filler",
+            "too_short",
+            "too_long",
+            "empty_translation",
+        ] {
             let s = skipped(5_000, 5_400.0, reason);
             assert_eq!((s.shown_at_ms, s.first_shown_at_ms), (None, None), "{reason}");
         }
@@ -1122,6 +1151,9 @@
         assert_eq!(get("skipped_too_short"), 1.0);
         assert_eq!(get("skipped_same_lang"), 2.0);
         for zero in [
+            "skipped_hallucination",
+            "skipped_repetition",
+            "skipped_filler",
             "skipped_too_long",
             "skipped_empty_translation",
             "skipped_lang_ngoai_tap",
@@ -1307,23 +1339,16 @@
     /// Luật bỏ đoạn và ghép câu đã chuyển sang `pipeline` (Đ3 của kế hoạch 00) cho đúng các quyết định của 12 lượt S6 cấu
     /// hình chốt, `bench/phase0/results/latency/m4pro-chot-khuyennghi-*.json`: cùng lý do bỏ đoạn, cùng số đoạn ghép và
     /// cùng chữ nguồn đã gửi dịch, đoạn nào cũng vậy. Nhờ đó số đo S6 của lượt chốt vẫn là số đo của luật hiện tại.
+    ///
+    /// Luật mới của Giai đoạn 1 được áp như app: bộ lọc câu ảo giác và luật chuỗi lặp không bỏ đoạn nào của 12 lượt này;
+    /// chữ tiếng Trung được đổi sang giản thể, nên chữ nguồn mong đợi là bản ghi cũ sau khi đổi. Luật câu đệm có bỏ 2 đoạn
+    /// (xem `phase1_filler_rule_drops_only_known_hallucinations_on_s6`), nên lượt chạy lại này tắt luật đó.
     #[test]
     fn phase0_s6_decisions_replay_identically() {
-        #[derive(Deserialize)]
-        struct Saved {
-            config: HashMap<String, String>,
-            segments: Vec<SegmentRecord>,
-        }
-        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bench/phase0/results/latency");
-        let cfg = PipelineConfig::default();
+        let mut cfg = PipelineConfig::default();
+        cfg.filter.filler_phrases.clear();
         let (mut files, mut checked, mut merged_pieces) = (0, 0, 0);
-        for entry in std::fs::read_dir(&dir).unwrap() {
-            let path = entry.unwrap().path();
-            let name = path.file_name().unwrap().to_string_lossy().into_owned();
-            if !name.starts_with("m4pro-chot-khuyennghi-") {
-                continue;
-            }
-            let saved: Saved = serde_json::from_reader(std::fs::File::open(&path).unwrap()).unwrap();
+        for (name, saved) in s6_runs() {
             let target = Lang::from_code(&saved.config["target"]).unwrap();
             let end_silence: u64 = saved.config["end_silence_ms"].parse().unwrap();
             let window = merge_window_ms(end_silence, &cfg.merge);
@@ -1331,10 +1356,14 @@
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
@@ -1352,7 +1381,11 @@
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
@@ -1367,4 +1400,121 @@
             "{checked} đoạn, {merged_pieces} lần ghép"
         );
     }
-}
+
+    #[derive(Deserialize)]
+    struct Saved {
+        config: HashMap<String, String>,
+        segments: Vec<SegmentRecord>,
+    }
+
+    /// 12 lượt S6 của cấu hình chốt, theo tên file.
+    fn s6_runs() -> Vec<(String, Saved)> {
+        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bench/phase0/results/latency");
+        let mut runs: Vec<(String, Saved)> = std::fs::read_dir(&dir)
+            .unwrap()
+            .map(|e| e.unwrap().path())
+            .filter(|p| {
+                p.file_name()
+                    .unwrap()
+                    .to_string_lossy()
+                    .starts_with("m4pro-chot-khuyennghi-")
+            })
+            .map(|p| {
+                let name = p.file_name().unwrap().to_string_lossy().into_owned();
+                (name, serde_json::from_reader(std::fs::File::open(&p).unwrap()).unwrap())
+            })
+            .collect();
+        runs.sort_by(|a, b| a.0.cmp(&b.0));
+        runs
+    }
+
+    /// Q11 của review 02b, điều kiện nhận luật câu đệm: trên 528 đoạn S6, luật chỉ bỏ thêm 2 đoạn của gói Chuẩn (turbo),
+    /// cả 2 đều có chữ sai, và bản chép đúng (`bench/phase0/data/latency/*.truth.json`) ở đó không có "Thank you" hay
+    /// "Cảm ơn" (xem `gd1_no_speech.md`). Cả 2 bị bỏ vì `avg_logprob` dưới −0,7; bản ghi S6 không có số của VAD, nhưng chỉ
+    /// 3 đoạn S6 có chữ là câu đệm nên số đó không đổi kết quả. Đoạn 26 của `en` dài 32 ms, nằm ngay sau một câu, có
+    /// `no_speech_prob` 8e-11: đúng kiểu ảo giác mà luật `no_speech` không bắt được với turbo; với small, đoạn tương ứng đã
+    /// bị luật `no_speech` bỏ từ Giai đoạn 0. Đoạn 45 của `vi` là tiếng thật, đuôi câu "… ở Las Cañitas.", mà turbo chép
+    /// thành "Cảm ơn": bỏ đoạn này mất một phụ đề sai, không mất chữ đúng nào.
+    #[test]
+    fn phase1_filler_rule_drops_only_known_hallucinations_on_s6() {
+        let cfg = PipelineConfig::default();
+        let (mut seen, mut dropped) = (0, Vec::new());
+        for (name, saved) in s6_runs() {
+            let target = Lang::from_code(&saved.config["target"]).unwrap();
+            for rec in &saved.segments {
+                if matches!(rec.skipped.as_deref(), Some(SKIP_TOO_SHORT | SKIP_TOO_LONG)) {
+                    continue;
+                }
+                seen += 1;
+                let rec = SegmentRecord {
+                    text: display_text(&rec.lang, &rec.text, &cfg.filter),
+                    ..rec.clone()
+                };
+                if let Err(reason) = route(&rec, target, &cfg.filter)
+                    && rec.skipped.as_deref() != Some(reason.as_str())
+                {
+                    dropped.push(format!("{name} {} {reason} {:?}", rec.id, rec.text));
+                }
+            }
+        }
+        assert_eq!(seen, 528);
+        assert_eq!(
+            dropped,
+            [
+                r#"m4pro-chot-khuyennghi-chuan-en.json 26 filler "Thank you.""#,
+                r#"m4pro-chot-khuyennghi-chuan-vi.json 45 filler "Cảm ơn""#,
+            ]
+        );
+    }
+
+    /// Q11 của review 02b, điều kiện nhận luật mới trên A4: không bỏ clip nào trong 548 clip FLEURS (bản chép của turbo
+    /// và small, `bench/phase0/data/asr/out-m4pro-*-final.jsonl`). Không clip nào có chữ là câu đệm, nên số của VAD (không
+    /// có trong file) không đổi kết quả; độ dài tiếng nói lấy bằng độ dài clip. Cần dữ liệu của `bench/phase0/fetch.py`.
+    #[test]
+    #[ignore = "cần bench/phase0/data"]
+    fn phase1_rules_drop_no_a4_clip() {
+        #[derive(Deserialize)]
+        struct Clip {
+            id: String,
+            lang_hyp: String,
+            hyp: String,
+            no_speech_prob: f32,
+            avg_logprob: f32,
+            audio_ms: u64,
+        }
+        let cfg = PipelineConfig::default().filter;
+        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../bench/phase0/data/asr");
+        for model in ["turbo", "small"] {
+            let path = dir.join(format!("out-m4pro-{model}-final.jsonl"));
+            let text = std::fs::read_to_string(&path).unwrap();
+            let clips: Vec<Clip> = text.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
+            let mut kinds: HashMap<String, Vec<String>> = HashMap::new();
+            let mut max_ratio = 0.0f32;
+            for c in &clips {
+                let shown = display_text(&c.lang_hyp, &c.hyp, &cfg);
+                max_ratio = max_ratio.max(pipeline::filter::compression_ratio(&shown));
+                let ev = Evidence {
+                    no_speech_prob: c.no_speech_prob,
+                    avg_logprob: c.avg_logprob,
+                    vad_mean_prob: 1.0,
+                    speech_ms: c.audio_ms,
+                };
+                let v = verdict(&ev, &shown, &cfg);
+                if v != Verdict::Speech {
+                    kinds.entry(format!("{v:?}")).or_default().push(c.id.clone());
+                }
+            }
+            println!(
+                "{model}: {} clip, bị bỏ {kinds:?}, tỉ lệ nén lớn nhất {max_ratio:.2}",
+                clips.len()
+            );
+            assert_eq!(clips.len(), 548);
+            // Luật `no_speech` của Giai đoạn 0 bỏ đúng 1 clip của small (chữ bịa); luật mới không bỏ thêm clip nào.
+            let expected: HashMap<String, Vec<String>> = match model {
+                "small" => [("NoSpeech".to_string(), vec!["en-9810650684898829002_nb".to_string()])].into(),
+                _ => HashMap::new(),
+            };
+            assert_eq!(kinds, expected, "{model}");
+        }
+    }
+}
```

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -411,7 +411,18 @@
             (m.window_min_ms, m.window_extra_ms, m.max_speech_ms, m.max_segments),
             (700, 400, 15_000, 3)
         );
-        assert_eq!((c.filter.no_speech_prob_max, c.filter.avg_logprob_min), (0.6, -1.0));
+        let f = &c.filter;
+        assert_eq!((f.no_speech_prob_max, f.avg_logprob_min), (0.6, -1.0));
+        assert_eq!(
+            (
+                f.filler_logprob_max,
+                f.filler_vad_prob_max,
+                f.filler_long_ms,
+                f.filler_long_max_words,
+                f.compression_ratio_max
+            ),
+            (-0.7, 0.7, 2_000, 1, 2.4)
+        );
         assert!(c.filter.simplify_chinese);
         assert_eq!((c.asr.max_prompt_tokens, c.asr.timeout_ms), (100, 30_000));
         let t = &c.mt;
@@ -522,7 +533,12 @@
     #[test]
     fn every_bounded_key_is_checked() {
         type Break = fn(&mut PipelineConfig);
-        let cases: [(&str, Break); 16] = [
+        let cases: [(&str, Break); 19] = [
+            ("filter.filler_logprob_max", |c| c.filter.filler_logprob_max = 0.5),
+            ("filter.filler_vad_prob_max", |c| {
+                c.filter.filler_vad_prob_max = f32::NAN
+            }),
+            ("filter.compression_ratio_max", |c| c.filter.compression_ratio_max = 0.0),
             ("queue.asr_merge_max_ms", |c| c.queue.asr_merge_max_ms = 0),
             ("supervisor.idle_shutdown_ms", |c| c.supervisor.idle_shutdown_ms = 0),
             ("supervisor.ready_timeout_ms", |c| c.supervisor.ready_timeout_ms = 0),
```

Thay toàn bộ `crates/pipeline/src/filter.rs` bằng:

```rust
//! Luật bỏ đoạn ở tiến trình chính (spec §6.4, "Lọc lỗi ảo giác"), và giới hạn độ dài của đoạn gửi cho `asr-worker`.
//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật.
//!
//! Đoạn bị bỏ không có phụ đề, không vào prompt của đoạn sau, và không làm đổi ngôn ngữ của đoạn trước (§6.4).

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

    #[test]
    fn known_hallucinations_are_recognised() {
        let cfg = FilterConfig::default();
        for text in [
            "Thank you for watching!",
            "Thanks for watching. Thanks for watching.",
            "Hãy subscribe cho kênh",
            "[Music]",
            "♪♪",
            "...",
            "ご視聴ありがとうございました",
            "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
            "시청해 주셔서 감사합니다.",
        ] {
            assert!(is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn real_sentences_are_kept() {
        let cfg = FilterConfig::default();
        for text in [
            "Thank you.",
            "Cảm ơn.",
            "Thank you for watching the demo",
            "Let's review the music budget",
            "",
            "   ",
        ] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn the_phrase_list_comes_from_the_config() {
        let cfg = FilterConfig {
            hallucination_phrases: vec!["xin chào các bạn".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("Xin chào các bạn!", &cfg));
        assert!(!is_hallucination("Thank you for watching", &cfg));
    }

    /// Đoạn chắc chắn là tiếng nói: chỉ chữ quyết định.
    const CLEAR: Evidence = Evidence {
        no_speech_prob: 0.0,
        avg_logprob: -0.2,
        vad_mean_prob: 0.95,
        speech_ms: 800,
    };

    #[test]
    fn verdict_applies_the_rules_in_order() {
        let cfg = FilterConfig::default();
        let silent = Evidence {
            no_speech_prob: 0.9,
            avg_logprob: -1.5,
            ..CLEAR
        };
        assert_eq!(verdict(&silent, "Thank you for watching", &cfg), Verdict::NoSpeech);
        assert_eq!(verdict(&CLEAR, "Thank you for watching", &cfg), Verdict::Hallucination);
        assert_eq!(verdict(&CLEAR, "Thank you.", &cfg), Verdict::Speech);
        assert_eq!(verdict(&CLEAR, "", &cfg), Verdict::NoSpeech);
        let unsure = Evidence {
            avg_logprob: -0.9,
            ..CLEAR
        };
        assert_eq!(verdict(&unsure, "Thank you.", &cfg), Verdict::Filler);
        assert_eq!(verdict(&CLEAR, &"no no no ".repeat(20), &cfg), Verdict::Repetition);
    }

    /// Nhãn có ngoặc chỉ khớp khi còn ngoặc: câu thật "Music." không bị bỏ.
    #[test]
    fn bracketed_labels_match_only_with_their_brackets() {
        let cfg = FilterConfig::default();
        for text in [
            "[Music]",
            "[ Âm nhạc ]",
            "(music) ♪",
            "[MUSIC] [Music]",
            "(Âm nhạc)",
            "(音楽)",
            "[音乐]",
            "[음악]",
            "（音楽）",
            "【音楽】",
            "[音楽]",
            "(音乐)",
            "［音乐］",
            "(음악)",
            "【음악】",
            "〔音楽〕",
        ] {
            assert!(is_hallucination(text, &cfg), "{text:?}");
        }
        for text in [
            "Music.",
            "Âm nhạc",
            "Music [music]",
            "[Music] OK",
            "音楽",
            "음악",
            "（音楽）が好き",
        ] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
        // Nhãn trong manifest (04) có thể viết bằng ngoặc toàn khổ: vẫn là nhãn, và khớp mọi kiểu ngoặc.
        let manifest = FilterConfig {
            hallucination_phrases: vec!["〔BGM〕".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("(bgm)", &manifest));
        assert!(!is_hallucination("BGM", &manifest), "nhãn chỉ khớp khi có ngoặc");
    }

    /// Cụm ngắn nằm trong cụm dài: phải bỏ cụm dài trước, dù danh sách ghi cụm ngắn trước.
    #[test]
    fn longer_phrases_are_removed_first() {
        let cfg = FilterConfig {
            hallucination_phrases: vec!["for watching".into(), "thank you for watching everyone".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("Thank you for watching, everyone!", &cfg));
    }

    /// Còn dư dù chỉ một hai ký tự thì vẫn là câu thật.
    #[test]
    fn a_short_remainder_keeps_the_segment() {
        let cfg = FilterConfig::default();
        for text in ["Thank you for watching. Hi", "Thanks for watching, A", "[Music] 好"] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn repeated_strings_have_a_high_compression_ratio() {
        assert_eq!(compression_ratio(""), 0.0);
        let real = "Scientists think that ocelots follow and find animals to eat prey by smell sniffing for where \
                    they've been on the ground.";
        assert!(compression_ratio(real) < 1.6, "{}", compression_ratio(real));
        assert!(compression_ratio("Thank you.") < 1.0);
        let looped = "I'm going to go to the store. ".repeat(12);
        assert!(compression_ratio(&looped) > 2.4, "{}", compression_ratio(&looped));
    }

    /// Câu đệm chỉ bị bỏ khi có thêm ít nhất một dấu hiệu, mỗi dấu hiệu đủ một mình.
    #[test]
    fn a_filler_phrase_needs_one_more_signal() {
        let cfg = FilterConfig::default();
        let suspect = |ev: Evidence, text: &str| is_suspect_filler(&ev, text, &cfg);
        for text in [
            "you",
            "I",
            "Thank you.",
            "Cảm ơn",
            "谢谢",
            "ありがとうございました",
            "감사합니다",
            "Okay!",
        ] {
            assert!(!suspect(CLEAR, text), "không có dấu hiệu: {text:?}");
            let low_logprob = Evidence {
                avg_logprob: -0.71,
                ..CLEAR
            };
            assert!(suspect(low_logprob, text), "avg_logprob: {text:?}");
            let weak_vad = Evidence {
                vad_mean_prob: 0.69,
                ..CLEAR
            };
            assert!(suspect(weak_vad, text), "VAD: {text:?}");
        }
        // Biên: đúng −0,7 và đúng 0,7 chưa là dấu hiệu.
        let edge = Evidence {
            avg_logprob: -0.7,
            vad_mean_prob: 0.7,
            ..CLEAR
        };
        assert!(!suspect(edge, "you"));
        // Dấu hiệu 3: từ 2 giây tiếng nói mà chỉ một từ.
        let long = Evidence {
            speech_ms: 2_000,
            ..CLEAR
        };
        assert!(suspect(long, "You."));
        assert!(!suspect(long, "Thank you."), "hai từ");
        assert!(!suspect(
            Evidence {
                speech_ms: 1_999,
                ..CLEAR
            },
            "You."
        ));
        // Câu khác câu đệm thì không xét, dù dấu hiệu nào cũng bật.
        let worst = Evidence {
            avg_logprob: -2.0,
            vad_mean_prob: 0.1,
            speech_ms: 5_000,
            ..CLEAR
        };
        for text in ["Thank you all", "So what", "Cảm ơn anh", ""] {
            assert!(!suspect(worst, text), "{text:?}");
        }
    }
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
Expected: biên dịch lỗi (trích 6 dòng lỗi khác nhau đầu tiên):

```text
error[E0425]: cannot find type `Evidence` in this scope
error[E0422]: cannot find struct, variant or union type `Evidence` in this scope
error[E0433]: cannot find type `FilterConfig` in this scope
error[E0422]: cannot find struct, variant or union type `FilterConfig` in this scope
error[E0609]: no field `filler_logprob_max` on type `&config::FilterConfig`
error[E0609]: no field `filler_vad_prob_max` on type `&config::FilterConfig`
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
+use pipeline::filter::{Evidence, PcmSkip, Verdict, pcm_skip, verdict};
 use pipeline::llama::{LlamaServer, max_tokens_for};
 use pipeline::prompt::{Lang, translation_prompt};
 use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES, Segment, Segmenter, SegmenterConfig};
 use pipeline::sentence::{OpenSentence, Piece, merge_window_ms, plan_merge};
+use pipeline::text::display_text;
 use pipeline::vad::SileroVad;
 use serde::{Deserialize, Serialize};
 use std::collections::HashMap;
@@ -34,6 +35,12 @@
 /// Đoạn không có tiếng nói theo luật `no_speech_prob` và `avg_logprob` (`pipeline::filter::is_no_speech`), hoặc chữ rỗng:
 /// app bỏ đoạn này (spec §6.4, "Lọc lỗi ảo giác").
 const SKIP_NO_SPEECH: &str = "no_speech";
+/// Đoạn chỉ gồm câu ảo giác quen thuộc ("Thank you for watching"…) hoặc chỉ có ký hiệu: app bỏ (`pipeline::filter`).
+const SKIP_HALLUCINATION: &str = "hallucination";
+/// Chữ là chuỗi lặp (tỉ lệ nén quá ngưỡng): app bỏ (`pipeline::filter`).
+const SKIP_REPETITION: &str = "repetition";
+/// Câu đệm ("you", "Thank you."…) có thêm dấu hiệu không phải tiếng nói thật: app bỏ (`pipeline::filter`).
+const SKIP_FILLER: &str = "filler";
 /// Đoạn ngắn hơn `MIN_PCM_SAMPLES`: không gửi cho `asr-worker`.
 const SKIP_TOO_SHORT: &str = "too_short";
 /// Đoạn dài hơn `MAX_PCM_SAMPLES`: không gửi cho `asr-worker`.
@@ -44,8 +51,11 @@
 const SKIP_SAME_LANG: &str = "same_lang";
 /// Ngôn ngữ ngoài tập của công cụ; ghi thành `lang_ngoai_tap:<mã>`.
 const SKIP_OTHER_LANG: &str = "lang_ngoai_tap";
-const SKIP_KINDS: [&str; 6] = [
+const SKIP_KINDS: [&str; 9] = [
     SKIP_NO_SPEECH,
+    SKIP_HALLUCINATION,
+    SKIP_REPETITION,
+    SKIP_FILLER,
     SKIP_TOO_SHORT,
     SKIP_TOO_LONG,
     SKIP_EMPTY_TRANSLATION,
@@ -121,6 +131,8 @@
     no_speech_prob: f32,
     /// Trung bình log-xác suất của các token văn bản, cùng `no_speech_prob` quyết định bỏ đoạn.
     avg_logprob: f32,
+    /// Xác suất tiếng nói trung bình của VAD (`Segment::mean_prob`). Bản ghi của Giai đoạn 0 không có số này.
+    vad_mean_prob: Option<f32>,
     /// Số đoạn trong câu đã dịch ở bước này (1 nếu không ghép; tối đa 3), và chữ nguồn của cả câu ghép (§6.3).
     merged_segments: Option<usize>,
     translated_source: Option<String>,
@@ -254,6 +266,7 @@
     let merge_window = merge_window_ms(args.end_silence_ms, &config.merge);
     let merge_config = config.merge.clone();
     let filter_config = config.filter.clone();
+    let asr_filter_config = config.filter.clone();
     let asr_thread = std::thread::spawn(move || -> Result<()> {
         let mut prompts: HashMap<String, Vec<i32>> = HashMap::new();
         // Ngôn ngữ của đoạn đã chép lời trước đó, kể cả đoạn bị bỏ: đúng trạng thái mà `asr-worker` của Giai đoạn 0 tự giữ,
@@ -267,6 +280,7 @@
                 start_ms: segment.start_ms,
                 end_ms: segment.end_ms,
                 audio_ms: segment.samples.len() as u64 * 1000 / 16_000,
+                vad_mean_prob: Some(segment.mean_prob),
                 closed_at_ms,
                 asr_started_at_ms: now_ms(),
                 ..Default::default()
@@ -304,9 +318,10 @@
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
@@ -510,13 +525,28 @@
 
 /// Quy tắc của app cho một đoạn đã chép lời: `Ok(ngôn ngữ nguồn)` nếu phải dịch, `Err(lý do)` nếu bỏ bước dịch.
 fn route(rec: &SegmentRecord, target: Lang, cfg: &FilterConfig) -> Result<Lang, String> {
-    if is_no_speech(rec.no_speech_prob, rec.avg_logprob, &rec.text, cfg) {
-        return Err(SKIP_NO_SPEECH.into());
+    match verdict(&evidence(rec), &rec.text, cfg) {
+        Verdict::NoSpeech => return Err(SKIP_NO_SPEECH.into()),
+        Verdict::Hallucination => return Err(SKIP_HALLUCINATION.into()),
+        Verdict::Repetition => return Err(SKIP_REPETITION.into()),
+        Verdict::Filler => return Err(SKIP_FILLER.into()),
+        Verdict::Speech => {}
     }
     match Lang::from_code(&rec.lang) {
         Some(src) if src == target => Err(SKIP_SAME_LANG.into()),
         Some(src) => Ok(src),
         None => Err(format!("{SKIP_OTHER_LANG}:{}", rec.lang)),
+    }
+}
+
+/// Số liệu cho luật bỏ đoạn. `start_ms` và `end_ms` không gồm đệm, nên hiệu của chúng là `Segment::speech_ms`. Bản ghi
+/// không có số của VAD thì dấu hiệu VAD không bật (1,0).
+fn evidence(rec: &SegmentRecord) -> Evidence {
+    Evidence {
+        no_speech_prob: rec.no_speech_prob,
+        avg_logprob: rec.avg_logprob,
+        vad_mean_prob: rec.vad_mean_prob.unwrap_or(1.0),
+        speech_ms: rec.end_ms.saturating_sub(rec.start_ms),
     }
 }
 
@@ -525,7 +555,13 @@
 fn is_dropped(reason: &str) -> bool {
     matches!(
         reason,
-        SKIP_NO_SPEECH | SKIP_TOO_SHORT | SKIP_TOO_LONG | SKIP_EMPTY_TRANSLATION
+        SKIP_NO_SPEECH
+            | SKIP_HALLUCINATION
+            | SKIP_REPETITION
+            | SKIP_FILLER
+            | SKIP_TOO_SHORT
+            | SKIP_TOO_LONG
+            | SKIP_EMPTY_TRANSLATION
     )
 }
 
```

Sửa `crates/pipeline/src/config.rs` (áp bằng `git apply`):

```diff
--- a/crates/pipeline/src/config.rs
+++ b/crates/pipeline/src/config.rs
@@ -57,11 +57,49 @@
     /// Bỏ đoạn khi `no_speech_prob > no_speech_prob_max` **và** `avg_logprob < avg_logprob_min` (luật của OpenAI Whisper).
     pub no_speech_prob_max: f32,
     pub avg_logprob_min: f32,
-    /// Câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng. Đoạn chỉ gồm các câu này (sau khi chuẩn hóa) thì bị bỏ.
+    /// Câu hay bị bịa ra khi chỉ có nhạc hoặc im lặng. Đoạn chỉ gồm các câu này (sau khi chuẩn hóa) thì bị bỏ. Cụm có
+    /// ngoặc (`[music]`, `(music)`) là nhãn: so khớp nguyên dạng có ngoặc, nên câu thật "Music." không bị bỏ.
     pub hallucination_phrases: Vec<String>,
+    /// Câu đệm ngắn mà model hay bịa ra từ tiếng ồn (Q11 của review 02b). Khác `hallucination_phrases`: đây cũng là câu
+    /// thật trong cuộc họp, nên chỉ bị bỏ khi có thêm ít nhất một dấu hiệu dưới đây.
+    pub filler_phrases: Vec<String>,
+    /// Dấu hiệu 1: `avg_logprob` dưới ngưỡng này.
+    pub filler_logprob_max: f32,
+    /// Dấu hiệu 2: xác suất tiếng nói trung bình của VAD trên các khung tiếng nói (`Segment::mean_prob`) dưới ngưỡng này.
+    pub filler_vad_prob_max: f32,
+    /// Dấu hiệu 3: đoạn có tiếng nói từ chừng này ms mà chỉ có tối đa `filler_long_max_words` từ.
+    pub filler_long_ms: u64,
+    pub filler_long_max_words: usize,
+    /// Tỉ lệ nén zlib của chữ (byte UTF-8 chia byte sau nén) lớn hơn ngưỡng này thì coi là chuỗi lặp và bỏ đoạn, như
+    /// `compression_ratio_threshold` của OpenAI Whisper.
+    pub compression_ratio_max: f32,
     /// Đổi chữ phồn thể sang giản thể cho đoạn tiếng Trung (§6.4, "Việc cho MVP"; `small` hay ra phồn thể).
     pub simplify_chinese: bool,
 }
+
+/// Câu đệm mặc định, theo ngôn ngữ: en, vi, ja, zh, ko. "I" đứng một mình là chữ bịa của gói Nhẹ trên nhạc
+/// (`bench/phase0/results/gd1_no_speech.md`).
+pub const DEFAULT_FILLER_PHRASES: &[&str] = &[
+    "you",
+    "i",
+    "so",
+    "okay",
+    "ok",
+    "bye",
+    "bye bye",
+    "thanks",
+    "thank you",
+    "thank you very much",
+    "cảm ơn",
+    "xin cảm ơn",
+    "cảm ơn các bạn",
+    "ありがとうございました",
+    "ありがとうございます",
+    "谢谢",
+    "谢谢大家",
+    "감사합니다",
+    "고맙습니다",
+];
 
 /// Danh sách mặc định: câu trong spec §6.4 cộng các biến thể hay gặp của cùng loại (cảm ơn đã xem, mời đăng ký kênh,
 /// phụ đề do ai làm, nhãn nhạc). Không có "Thank you." hay "Cảm ơn." đứng riêng: đó là câu thật trong cuộc họp.
@@ -100,6 +138,12 @@
             no_speech_prob_max: 0.6,
             avg_logprob_min: -1.0,
             hallucination_phrases: DEFAULT_HALLUCINATION_PHRASES.iter().map(|s| s.to_string()).collect(),
+            filler_phrases: DEFAULT_FILLER_PHRASES.iter().map(|s| s.to_string()).collect(),
+            filler_logprob_max: -0.7,
+            filler_vad_prob_max: 0.7,
+            filler_long_ms: 2_000,
+            filler_long_max_words: 1,
+            compression_ratio_max: 2.4,
             simplify_chinese: true,
         }
     }
@@ -331,6 +375,12 @@
                 (0.0..=1.0).contains(&self.filter.no_speech_prob_max),
             ),
             ("filter.avg_logprob_min", self.filter.avg_logprob_min <= 0.0),
+            ("filter.filler_logprob_max", self.filter.filler_logprob_max <= 0.0),
+            (
+                "filter.filler_vad_prob_max",
+                (0.0..=1.0).contains(&self.filter.filler_vad_prob_max),
+            ),
+            ("filter.compression_ratio_max", self.filter.compression_ratio_max >= 1.0),
             (
                 "asr.max_prompt_tokens",
                 self.asr.max_prompt_tokens <= asr_protocol::MAX_PROMPT_TOKENS,
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
 
@@ -33,6 +34,132 @@
 pub fn is_no_speech(no_speech_prob: f32, avg_logprob: f32, text: &str, cfg: &FilterConfig) -> bool {
     let silent = no_speech_prob > cfg.no_speech_prob_max && avg_logprob < cfg.avg_logprob_min;
     silent || text.trim().is_empty()
+}
+
+/// Số liệu của một đoạn mà luật bỏ đoạn cần, ngoài chữ.
+#[derive(Clone, Copy, Debug, PartialEq)]
+pub struct Evidence {
+    pub no_speech_prob: f32,
+    pub avg_logprob: f32,
+    /// Xác suất tiếng nói trung bình của VAD (`Segment::mean_prob`). Không có số này (bản ghi cũ) thì truyền 1,0: dấu hiệu
+    /// VAD không bao giờ bật.
+    pub vad_mean_prob: f32,
+    /// Độ dài tiếng nói, không gồm đệm (`Segment::speech_ms`).
+    pub speech_ms: u64,
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
+    /// Tỉ lệ nén quá `compression_ratio_max`: chuỗi lặp.
+    Repetition,
+    /// Chỉ là một câu đệm ("you", "thank you", "谢谢"…) và có dấu hiệu đoạn không phải tiếng nói thật.
+    Filler,
+}
+
+/// Áp mọi luật, theo thứ tự: `NoSpeech`, `Hallucination`, `Repetition`, `Filler`. `text` là chữ đã qua
+/// `text::display_text`.
+pub fn verdict(ev: &Evidence, text: &str, cfg: &FilterConfig) -> Verdict {
+    if is_no_speech(ev.no_speech_prob, ev.avg_logprob, text, cfg) {
+        Verdict::NoSpeech
+    } else if is_hallucination(text, cfg) {
+        Verdict::Hallucination
+    } else if compression_ratio(text) > cfg.compression_ratio_max {
+        Verdict::Repetition
+    } else if is_suspect_filler(ev, text, cfg) {
+        Verdict::Filler
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
+/// Nhãn là cụm có ngoặc, như `[music]` hay `(âm nhạc)`: so khớp cả ngoặc, chỉ bỏ khoảng trắng và hoa thường.
+fn is_label(phrase: &str) -> bool {
+    phrase.contains(['[', ']', '(', ')', '（', '）', '［', '］', '【', '】', '〔', '〕'])
+}
+
+/// Dạng so khớp của nhãn: chữ thường, bỏ khoảng trắng, giữ dấu. Mọi kiểu ngoặc (ngoặc vuông, ngoặc toàn khổ `（）［］`,
+/// `【】`, `〔〕` hay gặp trong phụ đề tiếng Nhật và tiếng Trung) đổi về `()`, nên `[音乐]`, `（音楽）` và `【음악】` khớp cùng
+/// một nhãn (N2 của review 02 lần 3).
+fn compact(text: &str) -> String {
+    text.chars()
+        .flat_map(char::to_lowercase)
+        .filter(|c| !c.is_whitespace())
+        .map(|c| match c {
+            '[' | '（' | '［' | '【' | '〔' => '(',
+            ']' | '）' | '］' | '】' | '〕' => ')',
+            c => c,
+        })
+        .collect()
+}
+
+/// Bỏ lần lượt các cụm khỏi `rest`, cụm dài trước, để một cụm ngắn nằm trong cụm dài không cắt cụm dài thành hai mẩu.
+fn strip_all(mut rest: String, mut phrases: Vec<String>) -> String {
+    phrases.retain(|p| !p.is_empty());
+    phrases.sort_by_key(|p| std::cmp::Reverse(p.len()));
+    for phrase in &phrases {
+        rest = rest.replace(phrase.as_str(), "");
+    }
+    rest
+}
+
+/// Đoạn chỉ gồm câu ảo giác quen thuộc (`FilterConfig::hallucination_phrases`), có thể lặp nhiều lần, hoặc chỉ gồm dấu câu
+/// và ký hiệu (như "♪♪", "..."). Đoạn có thêm chữ khác thì giữ: "Thank you for watching the demo" là câu thật.
+///
+/// Nhãn có ngoặc được bỏ trước, trên chữ còn nguyên dấu câu; sau đó mới chuẩn hóa và bỏ các câu còn lại.
+pub fn is_hallucination(text: &str, cfg: &FilterConfig) -> bool {
+    if text.trim().is_empty() {
+        return false;
+    }
+    let (labels, phrases): (Vec<&String>, Vec<&String>) = cfg.hallucination_phrases.iter().partition(|p| is_label(p));
+    let unlabelled = strip_all(compact(text), labels.into_iter().map(|p| compact(p)).collect());
+    let rest = normalize(&unlabelled);
+    if rest.is_empty() {
+        return true;
+    }
+    strip_all(rest, phrases.into_iter().map(|p| normalize(p)).collect()).is_empty()
+}
+
+/// Tỉ lệ nén zlib (mức 6, như `zlib.compress` mà OpenAI Whisper dùng): số byte UTF-8 của chữ chia số byte sau nén. Chữ
+/// thường cỡ 1–1,6; chuỗi lặp dài thì lớn hơn 2,4. Chữ rỗng có tỉ lệ 0.
+pub fn compression_ratio(text: &str) -> f32 {
+    let bytes = text.as_bytes();
+    if bytes.is_empty() {
+        return 0.0;
+    }
+    let packed = miniz_oxide::deflate::compress_to_vec_zlib(bytes, 6);
+    bytes.len() as f32 / packed.len().max(1) as f32
+}
+
+/// Câu đệm đáng ngờ: chữ (đã chuẩn hóa) đúng bằng một câu trong `filler_phrases`, **và** có ít nhất một dấu hiệu:
+/// `avg_logprob` thấp, VAD không chắc là tiếng nói, hoặc đoạn dài mà gần như không có từ nào.
+///
+/// Số từ đếm theo khoảng trắng, nên một câu tiếng Nhật, Trung, Hàn không cách chữ luôn là một từ.
+pub fn is_suspect_filler(ev: &Evidence, text: &str, cfg: &FilterConfig) -> bool {
+    let norm = normalize(text);
+    if norm.is_empty() || !cfg.filler_phrases.iter().any(|p| normalize(p) == norm) {
+        return false;
+    }
+    let words = text
+        .split_whitespace()
+        .filter(|w| w.chars().any(char::is_alphanumeric))
+        .count();
+    ev.avg_logprob < cfg.filler_logprob_max
+        || ev.vad_mean_prob < cfg.filler_vad_prob_max
+        || (ev.speech_ms >= cfg.filler_long_ms && words <= cfg.filler_long_max_words)
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
test result: ok. 72 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.09s
```

```text
test result: ok. 28 passed; 0 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.80s
```

Run: `cargo test -p latency-bench phase0_s6 -- --nocapture`
Expected: vẫn khớp đủ 12 lượt:

```text
12 lượt, 528 đoạn, 174 lần ghép
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 28 filtered out; finished in 0.30s
```

Run: `cargo test -p latency-bench phase1_ -- --include-ignored --nocapture`
Expected: hai test điều kiện nhận luật đều qua; dòng in ra cho biết số clip A4 bị bỏ theo từng luật và tỉ lệ nén lớn nhất của chữ (cần dữ liệu của `bench/phase0/fetch.py`):

```text
turbo: 548 clip, bị bỏ {}, tỉ lệ nén lớn nhất 1.54
small: 548 clip, bị bỏ {"NoSpeech": ["en-9810650684898829002_nb"]}, tỉ lệ nén lớn nhất 1.54
test latency::tests::phase1_rules_drop_no_a4_clip ... ok
test latency::tests::phase1_filler_rule_drops_only_known_hallucinations_on_s6 ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 27 filtered out; finished in 0.32s
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
  crates/pipeline/src/config.rs \
  crates/pipeline/src/filter.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/text.rs
git commit -m "feat(pipeline): lọc câu ảo giác quen thuộc, đổi phồn thể sang giản thể (§6.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Phần đầu của 02 xong ở đây. Đi tiếp `docs/superpowers/plans/2026-10-01-giai-doan-1-02d-pipeline-clients.md` (client, dịch một câu, giám sát), rồi mới tới 02b.
