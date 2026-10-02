# Giai đoạn 1 · 03a: Phụ đề, bản chép lời, lịch sử, từ điển thuật ngữ — dữ liệu và lõi Rust

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần dữ liệu và lõi Rust của kế hoạch 03 (mục 2.3 của kế hoạch 00):
- điểm kiểm tra Pro duy nhất (Đ6), để 06 thay bằng trạng thái bản quyền thật;
- số thứ tự `revision` của cài đặt (điểm cần quyết 10 của 02a);
- SQLite mã hóa bằng SQLCipher, khóa trong kho khóa của hệ điều hành (§6.6, §10.2);
- từ điển thuật ngữ: khớp theo §6.5, mẫu "terminology" của Hy-MT2, lưu trong DB, nhập và xuất CSV (F5);
- bản chép lời trong bộ nhớ, xuất TXT, SRT, Markdown, lịch sử trong DB (F4);
- lệnh của giao diện cho các việc trên, bảng debug ẩn (§7), và phần phía Rust của thanh phụ đề và bước "Nghe thử" (§4.1 bước 6, §4.4): kéo cạnh trên cả macOS lẫn Windows, nút ✕ ẩn thanh, màu chữ và màu nền (§4.3, §4.4 sửa ngày 2026-10-02, commit `5925d42`);
- sửa ghi chú N1 của review cuối 02: tắt tiến trình phụ khi rảnh không chen vào lần Bắt đầu.

Giao diện (thanh phụ đề đủ §4.4, các màn hình, nhóm Cài đặt "Phụ đề" và "Quyền riêng tư", bước "Nghe thử"), thử tay, đợt Windows và cập nhật kế hoạch 00 nằm ở **03b** (`docs/superpowers/plans/2026-10-02-giai-doan-1-03b-phu-de-giao-dien.md`). Làm 03a trước, rồi 03b.

**Kiến trúc:**
- Logic nằm trong Rust (§10.2, "Bị clone"): khớp thuật ngữ và mẫu prompt ở crate `pipeline` (`glossary.rs`, `prompt.rs`); DB, lịch sử, xuất file, từ điển ở `src-tauri` (`db.rs`, `glossary.rs`, `transcript/`). JavaScript chỉ hiển thị.
- Một file `data.db` (SQLCipher 4.14, khóa thô 32 byte ngẫu nhiên trong kho khóa, mục `db-key`), mở lúc cần: người dùng Free không bao giờ chạm tới DB.
- Mọi tính năng Pro hỏi `pro::require` (lệnh) hoặc `pro::is_pro` (việc chạy ngầm). Bản tạm `DevGate` chỉ có trong bản debug và luôn là Pro, trừ khi chạy app với `AI_TRANSLATOR_DEV_FREE=1`; bản release là Free cho tới khi 06 cài trạng thái bản quyền thật.
- Lệnh chạm DB hay hộp thoại file là lệnh `async`, chạy việc trên luồng của `spawn_blocking` (mở DB lần đầu có thể chờ hộp thoại của Keychain).
- Hộp thoại lưu và mở file của hệ điều hành đi qua `tauri-plugin-dialog`, chỉ gọi từ Rust (trait `FilePicker`); không cửa sổ nào được cấp quyền `dialog:*`.

**Công nghệ:** Giữ nguyên Rust 1.98.1, Tauri 2.12.1, React 19.3, Vite 8.3, TypeScript 7.0. Thêm `rusqlite` (SQLCipher kèm theo), `getrandom`, `csv`, `unicode-normalization`, `tauri-plugin-dialog` (bảng "Phiên bản đã chốt"). Không thêm gói npm nào.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.3, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Tên file dùng ngày viết `2026-10-02` (controller quyết, thay Đ1 của kế hoạch 00 cho kế hoạch này).

Kế hoạch 03 có khoảng 12 000 dòng nên chia hai file, làm theo thứ tự:
1. **03a** (file này): Task 1–13.
2. **03b**: Task 1–10.

Bảng phiên bản, thứ tự với kế hoạch 04, dòng của bảng đối chiếu, quyết định (QĐ), điểm cần chủ dự án quyết, kết quả mutation và bảng commit tham chiếu nằm ở file này, dùng chung cho cả hai.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-02, theo §6.12)

Kiểm bằng `cargo info` và API của crates.io: bản ổn định mới nhất, ngày phát hành (luật "đã ra ít nhất 1 ngày", mục 6.1 của kế hoạch 00), MSRV, giấy phép, có bị yanked không. Mọi crate build được với Rust 1.98.1; `cargo deny check` sạch.

| Thành phần | Phiên bản | Dùng ở | Ghi chú tương thích |
|---|---|---|---|
| rusqlite | 0.40.2 (`default-features = false`; macOS `bundled-sqlcipher`, Windows `bundled-sqlcipher-vendored-openssl`) | app | Bản mới nhất (2026-08-08), MIT. Không bật `cache` (không cần `hashlink`). Kéo `libsqlite3-sys` 0.38.2 (MIT), có sẵn SQLCipher 4.14.0 community (SQLite 3.51.3, giấy phép kiểu BSD của Zetetic: phải ghi công, 07 đưa vào `THIRD_PARTY_NOTICES`) |
| SQLCipher trên macOS | CommonCrypto của hệ thống (`SQLCIPHER_CRYPTO_CC`) | app | Không có OpenSSL nào trên macOS. Đã chạy: `PRAGMA cipher_provider` trả `commoncrypto` |
| openssl-src / openssl-sys | 300.6.1+3.6.3 / 0.9.117 | app (chỉ Windows) | OpenSSL 3.6.3 (Apache-2.0) build tĩnh từ mã nguồn, nên không có DLL OpenSSL nào trong thư mục cài đặt. `openssl-sys` 0.9.117 chỉ nhận `openssl-src` dòng 300 (bản 400.0.2+4.0.3 ra 2026-10-01 20:54 UTC, chưa đủ 1 ngày, và cũng không khớp `openssl-sys`). Đã thử cùng đường OpenSSL này trên Mac (`bundled-sqlcipher-vendored-openssl` cho target macOS): `cipher_provider` là `openssl`, `OpenSSL 3.6.3 9 Jun 2026`, mã hóa và đọc lại đúng. Build trên Windows cần Perl (Strawberry Perl, có sẵn trên runner Windows của GitHub); không có `nasm` thì `openssl-src` tự build `no-asm` |
| getrandom | 0.4.3 | app | Khóa DB ngẫu nhiên. Cùng bản `Cargo.lock` đã có; MSRV 1.85 |
| csv | 1.4.0 | app | Nhập, xuất từ điển. Unlicense/MIT (2025-10-17), MSRV 1.73; kéo `csv-core` 0.1.13. Tự bỏ BOM ở đầu file khi đọc |
| unicode-normalization | 0.1.25 | `pipeline` | Chuẩn hóa NFC khi khớp thuật ngữ. MIT/Apache-2.0 (2025-10-30), MSRV 1.36 |
| tauri-plugin-dialog | 2.8.1 | app | Hộp thoại lưu, mở file. Ra 2026-10-01 00:28 UTC (đủ 1 ngày lúc kiểm 01:53 UTC ngày 2026-10-02); dòng 2.x, cần `tauri ^2.12`; MSRV 1.90. Các bản 3.0.0-alpha bỏ qua. Kéo `tauri-plugin-fs` 2.6.0 (2026-09-26, chỉ dùng kiểu `FilePath`, không đăng ký plugin fs) và `rfd` 0.16.0 (MIT) |
| Câu mẫu "Nghe thử" | FLEURS `en-6415341913845555034` (CC BY 4.0) | `public/listen-test-en.wav` | Cắt từ clip test có sẵn `tests/fixtures/audio/fleurs-en-en-vi.wav` bằng script (03b Task 6); ghi công ở `public/listen-test-en.LICENSE.txt` |

Ghi chú:
- **Không có hai bản OpenSSL hay thư viện mật mã C xung đột.** Trước 03, `Cargo.lock` không có `openssl*`, `ring`, `rustls`, `native-tls`, `aws-lc*`. Sau 03: macOS không có OpenSSL; Windows có đúng một OpenSSL, tĩnh, chỉ qua `libsqlite3-sys`. `deny.toml` thêm luật `openssl-sys` chỉ được vào qua `libsqlite3-sys`, `openssl-src` chỉ qua `openssl-sys` (Task 3). Cũng chỉ có một bản SQLite (bản SQLCipher kèm theo) trong tiến trình chính.
- **Không thêm gói npm nào**; `pnpm-lock.yaml` giữ nguyên. Phát âm thanh câu mẫu dùng thẻ `<audio>` của webview; CSP hiện có (`default-src 'self'`) đã cho phép.
- `cargo audit` vẫn 3 cảnh báo cũ đã được cho phép; `pnpm audit`: không có lỗ hổng.
- **Kiểm code Windows trên Mac:** `scripts/check-windows.sh` thêm biến môi trường để `libsqlite3-sys` và `openssl-sys` không biên dịch C cho Windows (Task 3); chỉ chứng minh code biên dịch được. Build thật cho Windows là việc của đợt Windows (03b Task 9) và CI (07).

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, từ commit `5925d42` (01, 02 và 05 đã xong phần code trên Mac; sau `45de838` của lần lập kế hoạch đầu, `main` chỉ đổi `vite.config.ts`, `scripts/run-dev-app.sh`, một dòng `box-sizing` của `src/windows/overlay/overlay.css` kèm test `overlay.css.test.ts`, và tài liệu; `19b7324` và `31ca0fb` sau đó chỉ thêm kết quả thử tay trong `bench/` và sửa spec §6.9, không đụng file nào mà khối code của 03 sửa). Trước mỗi task, `git status` phải sạch. 03a làm hết rồi mới tới 03b.
- **Khối code.**
  - "Tạo `<file>`": chép nguyên khối vào file mới.
  - "Tạo `<file>`, lúc này mới có phần test": file chỉ có các dòng `//!` đầu và khối `#[cfg(test)] mod tests`; bước sau thêm phần code.
  - "Thêm vào `<file>`": chèn khối vào giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`, cách mỗi bên một dòng trống.
  - "Sửa `<file>` (áp bằng `git apply`)": khối `diff` là bản vá chuẩn; lưu khối vào một file tạm rồi chạy `git apply <file tạm>` từ gốc repo. `git apply --check` báo lỗi nghĩa là cây file đã lệch so với kế hoạch: dừng lại, đừng sửa tay cho khớp.
  - Mỗi khối `diff` có dòng `index <blob trước>..<blob sau>` (SHA đầy đủ). Nếu cây đã lệch vì `main` có commit mới (ví dụ đã nâng một crate mà khối `diff` của `Cargo.toml` lấy dòng phiên bản làm ngữ cảnh), `git apply --3way <file tạm>` gộp được, với điều kiện file trước task còn đúng như cây tham chiếu (blob có sẵn trong repo). Khối áp lên file vừa được bước viết test sửa thì blob trước không có sẵn: khi đó thêm tay đúng các dòng `+`, giữ phần của `main`.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task trên một worktree sạch của `5925d42`, với target riêng (2026-10-02). Lệnh đã lọc output (`grep`, `sed`) để Expected không phụ thuộc thời gian chạy; test chạy một luồng (`--test-threads=1`) khi Expected liệt kê tên test, để thứ tự cố định. Bước đỏ chỉ in tối đa 6 dòng lỗi khác nhau (sắp theo chữ cái); output thật có thể dài hơn. Số test là số lúc lập kế hoạch.
- **Môi trường.** Mọi lệnh chạy từ gốc repo, sau `source "$HOME/.cargo/env" && eval "$(fnm env --use-on-cd)"` (Node 24.21.0, pnpm 12.6.0, Rust 1.98.1). Worktree mới thì chạy `pnpm install --frozen-lockfile` một lần trước task đầu, và `pnpm build` (để `dist/` có sẵn cho `src-tauri`).
- **Không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00): test dùng kho khóa trong bộ nhớ (`Keystore::mock`) và hộp thoại file giả (`FakePicker`); không task nào của 03a mở app, đọc Keychain thật hay mở hộp thoại thật.
- **Task cần người hoặc Windows:** ở cuối 03b (Task 8, 9).
- **Tiến trình phụ thật:** Task 4 Step 5 chạy `llama-server` b11146 với Hy-MT2 thật (có sẵn ở `tools/`, `models/` của repo chính trên máy dev, bị `.gitignore` bỏ qua; đặt biến `R` là đường dẫn repo chính). Không có thì bỏ bước đó; mọi test khác không cần model.

## Thứ tự với kế hoạch 04 và file giao nhau

Kế hoạch 04 (quản lý model: `2026-10-02-giai-doan-1-04a-quan-ly-model-loi.md`, `…-04b-quan-ly-model-app.md`) được viết cùng lúc, trên `main` `45de838`. Controller đề xuất **03 thực thi trước 04**: 04 dựng trên cây cuối của 03 (sau 03b Task 10). Khối `diff` của 04 viết trên `45de838` không áp thẳng được lên cây của 03, và `git apply --3way` cũng không cứu được nếu khối thiếu dòng `index`, nên **tác giả 04 phải dựng lại các khối `diff` của 04 trên cây cuối của 03** (nhánh `plan03` của cây tham chiếu, xem bảng cuối file này). Hai chỗ cần để ý khi dựng 04 trên 03: `session::engine_config` của 03 nhận thêm tham số từ điển (`SharedGlossary`), 04 thêm `PipelineConfig`, nên hàm nhận cả hai; `wipe_user_data` của 04 gọi `data::clear_all_data` của 03 (hàm này nay xóa cả các bản `data.db.unreadable-*`). Hai kế hoạch cùng đụng các file dưới đây:

| File | 03 đổi gì | 04 có thể đổi gì |
|---|---|---|
| `src-tauri/Cargo.toml`, `Cargo.lock` | thêm `rusqlite`, `getrandom`, `csv`, `tauri-plugin-dialog` | thêm crate tải file, Ed25519, SHA-256 |
| `src-tauri/src/lib.rs` | `mod` mới (`pro`, `db`, `data`, `debug`, `files`, `glossary`, `transcript`); `setup` cài `DataStore`, `ActiveGlossary`, `TranscriptStore`, `Picker`, `DebugLog`, Pro; đăng ký `tauri_plugin_dialog` | `mod models`, cài trình tải |
| `src-tauri/src/commands.rs`, `build.rs`, `capabilities/main.json`, `capabilities/overlay.json`, `acl_tests.rs` | 16 lệnh mới của `main`, 4 lệnh mới của `overlay` (danh sách cố định ba chỗ phải khớp) | lệnh của màn hình Model |
| `src-tauri/src/errors.rs`, `src/i18n/en.ts`, `src/i18n/vi.ts` | mã lỗi mới, chuỗi giao diện mới | mã lỗi và chuỗi của model |
| `src-tauri/src/state.rs` (`AppStatus`, `OverlayView`) | `AppStatus.pro`, màu trong `OverlayView` | trạng thái tải model |
| `src-tauri/src/settings/mod.rs` | `TextColor`, `BackgroundColor`, hai khóa màu của `overlay` | `modelTier` (nếu đổi) |
| `src-tauri/src/session.rs` | từ điển và bản chép lời nối vào phiên; `StartOptions::LISTEN_TEST`; số đo vào bảng debug; `save_on_exit`; `LiveDeps::prepare` chạm trước khi hỏi `running` (N1 của review cuối 02) | `LiveDeps::prepare` theo gói model (ghi chú N2 của review cuối 02) |
| `crates/pipeline/src/supervisor.rs`, `crates/pipeline/tests/lifecycle.rs` | `stop_if_idle` (N1 của review cuối 02) | (nếu có) |
| `src-tauri/src/test_support.rs` | `FakePro`, `FakePicker`, `DataStore` tạm, `prompts`, `capture_sources` | bản giả của trình tải |
| `src/lib/ipc.ts`, `src/store/app.ts`, `src/store/app.test.ts` | kiểu và lệnh mới; `Settings.revision`, `AppStatus.pro` | kiểu và lệnh của model |
| `src/windows/main/settings/PrivacySettings.tsx` (03b tạo) | lưu lịch sử, "Xóa toàn bộ dữ liệu" | thêm nút "Xóa model và dữ liệu", gọi `data::clear_all_data` của 03 rồi xóa model (dòng 57) |
| `src/windows/main/screens/SettingsScreen.tsx` | nhóm Phụ đề, Quyền riêng tư | nhóm Model |
| `src/windows/main/onboarding/Onboarding.tsx` | bước 6 "Nghe thử" | bước 2–3 (kiểm tra máy, tải model) |
| `src/styles/main.css` | kiểu của các màn hình mới | kiểu của màn hình Model |

Hai ghi chú của review cuối 02 cho 03/04 (`notes-for-plan02-exec.md`, mục 7 N1 và mục 8 N2): **03 làm N1** (Task 12, Q5 của review 03); **04 làm N2** cùng lúc với chỗ chọn gói model (N2 bắt buộc khi 04 cho đổi `modelTier` ở giao diện).


## Sửa sau review lần 1 và yêu cầu mới (2026-10-02)

Review lần 1 (`$S/review-03-r1.md`) chạy lại bản trước từ file, khớp hết; kết luận "Cần sửa". Bản này sửa như sau.

| Mã | Sửa ở đâu | Cách sửa |
|---|---|---|
| Q1 | 03a Task 1 | `DevGate` chỉ có trong bản debug; bản release không cài gate nào (Free). Test `the_dev_gate_exists_only_in_debug_builds` chạy cả ở bản release (03b Task 7 Step 1) |
| Q2 | 03a Task 3 | `wipe` xóa thêm mọi `data.db.unreadable-*` và journal; test kiểm thư mục trống |
| Q3 | 03a Task 7 | `session::save_on_exit` ở `RunEvent::Exit`; test Thoát ở menu khay và `RunEvent::Exit` đều lưu đúng một lần (giết M11) |
| Q4 | 03a Task 3, 9, 10 | test cho M01–M04 (Task 9), M06 (Task 3), M17 (Task 10); M11 ở Q3; thêm test M05, M07, M08 |
| Q5 | 03a Task 12 (mới) | 03 nhận N1 của review cuối 02 (QĐ24); 04 chỉ làm N2 |
| N1 | 03a Task 5 | chặn công thức Excel khi xuất CSV, bỏ dấu chặn khi nhập |
| N2 | 03b Task 1, 4 | `reset` của ba store dữ liệu, `resetWhenDataCleared` |
| N3 | 03b Task 6 | `afterListenTestStart`: rời bước trong lúc chờ thì dừng phiên |
| N4 | 03b Task 1, 4; 03a Task 8 | độ lệch múi giờ tại lúc bắt đầu phiên; Rust từ chối ngoài ±18 giờ |
| N5 | 03b Task 5 | lời giới thiệu của màn hình Từ điển nói thuật ngữ là gợi ý |
| N6 | cả hai file | khối `diff` có dòng `index`; mục "Cách đọc" sửa cách dùng `--3way`; 04 dựng lại diff trên cây cuối của 03 |
| N7 | 03a Task 3 | test `the_cipher_provider_matches_the_platform` |
| N8 | 03a Task 3 | `remove_stale_app_dirs` (state của app giả không được drop, nên `Drop` không dùng được) |
| N9 | 03b Task 7 | lọc dòng `is locked` khỏi output của `cargo audit` |
| N10 | 03a Task 4 Step 5 | dùng `$R/tools`, `$R/models` |
| N11 | 03a Task 5 | `pro::refresh` về Free thì `glossary::forget`; lên Pro không đọc DB (QĐ4) |
| N12 | 03a Task 8 | hộp thoại `set_parent` cửa sổ chính; 03b Task 8 kiểm |
| N13 | QĐ20; 03b Task 10 | ghi cho 06: phiên nghe thử là phiên thật, có dấu `StartOptions::LISTEN_TEST` |

Yêu cầu mới của chủ dự án sau khi thử tay (spec §4.3, §4.4, commit `5925d42`): kéo cạnh hoặc góc trên cả macOS lẫn Windows, cỡ tối thiểu 320 × 80 (03a Task 10, 03b Task 2); nút ✕ ẩn thanh khi chưa khóa (03a Task 10, 03b Task 2); màu chữ và màu nền trong Cài đặt › Phụ đề (03a Task 11, 03b Task 1–3). Spec §6.9 đã có hai khóa màu trong `overlay.{…}` (`31ca0fb`).

Review lần 2 (`$S/review-03-r2.md`) chạy lại bản `24acd83` từ file, khớp từng dòng; kết luận "Cần sửa" nhẹ. Bản này sửa thêm:

| Mã | Sửa ở đâu | Cách sửa |
|---|---|---|
| Q-A | 03a Task 10; 03b Task 8 Step 3 | macOS: kéo cạnh tính độ dời con trỏ bằng điểm logic (`Surface::cursor` trả điểm, chia vị trí của tao cho tỉ lệ màn hình chính), rồi đổi ra pixel theo tỉ lệ của màn hình chứa thanh; test `the_edge_follows_the_cursor_on_screens_of_different_scales` (tỉ lệ 1 và 2); thử tay hai màn hình khác tỉ lệ |
| N-A | 03a Task 7 | `RunEvent::Exit` gọi `on_exit(app, pipeline::process::kill_all)` ở `lib.rs`; test Q3 gọi đúng `on_exit` với hàm kill giả (giết mutation X1) |
| N-B | 03b Task 10 | mục 2.4 của kế hoạch 00: 04 chỉ làm N2 của review cuối 02 |
| N-C | 03b Task 10; mục trên | spec §6.9 đã có hai khóa màu (`31ca0fb`), không thêm lần nữa |
## Dòng của bảng đối chiếu giao cho kế hoạch 03

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00 (45 dòng có `03`). Cột "Task": `a<số>` là 03a, `b<số>` là 03b; dòng nào còn phần của kế hoạch khác hay còn chờ thì ghi rõ.

| # | Yêu cầu (rút gọn) | Phần của 03 | Task |
|---|---|---|---|
| 15 | F1: phụ đề dịch trực tiếp từ âm thanh hệ thống | hiển thị đủ trên thanh phụ đề và cửa sổ chính | a10, b2, b4 |
| 17 | F3: thanh phụ đề nổi theo §4.4 | nội dung, chỉ báo, kéo cạnh, nút ✕ ẩn thanh, màu chữ và màu nền, nhóm Cài đặt "Phụ đề" | a10, a11, b2, b3; b8 (người), b9 (Win) |
| 18 | F4: bản chép lời: xem, tìm, sao chép; xuất TXT, SRT, Markdown và lưu lịch sử là Pro; lịch sử mặc định tắt | bản chép lời trong bộ nhớ, xuất, lịch sử; khóa Pro qua điểm kiểm tra duy nhất | a1, a6, a7, a8, b4; 06 nối bản quyền thật |
| 19 | F5: từ điển thuật ngữ (Pro), tối đa 500 cặp; chỉ thuật ngữ có trong câu vào prompt | khớp, prompt, lưu, CSV, màn hình | a4, a5, a9, b5; 06 nối bản quyền thật |
| 25 | A1: Teams, Zoom, Meet, Zalo PC; loa, tai nghe | thanh phụ đề hiện đúng trên app họp (thử tay) | b8 (người), b9 (Win); nghiệm thu ở 08 |
| 40 | Bước 6: nghe thử, app phát một câu tiếng Anh mẫu; macOS thu cả âm thanh của app | lệnh `start_listen_test`, câu mẫu, bước lần đầu mở | a10, b6; b8 (người) |
| 43 | Bắt đầu: thanh phụ đề hiện kèm chỉ báo đang nghe (mức âm lượng) và độ trễ; "Đang nạp model…" | mức âm lượng tới thanh phụ đề; chỉ báo và lời nhắc | a10, b2 |
| 44 | Gói có hạn mức: nhắc khi còn 5 phút; hết thì dừng, báo thời điểm reset, nút nâng gói | thanh phụ đề báo "Đã hết hạn mức dịch"; cửa sổ chính báo lỗi `quotaExhausted` (có từ 02) | b2; nhắc 5 phút, thời điểm reset, nút nâng gói ở 06 |
| 45 | Bấm Dừng, sau đó mở được bản chép lời của phiên | bản chép lời giữ sau khi dừng; nút "Mở bản chép lời" ở màn hình chính | a6, b4 |
| 47 | Bản chép lời: giờ, câu gốc, bản dịch; tìm, sao chép, xuất file (Pro) | màn hình Bản chép lời | a6, a8, b1, b4 |
| 48 | Lịch sử (Pro): danh sách, xóa từng phiên hoặc tất cả | màn hình Lịch sử | a7, a8, b1, b4 |
| 49 | Từ điển (Pro): thêm, sửa, xóa; nhập và xuất CSV | màn hình Từ điển thuật ngữ | a5, a9, b1, b5 |
| 51 | Cài đặt › Phụ đề: cỡ chữ, số dòng, màu chữ, màu nền, độ mờ nền, câu gốc | nhóm Phụ đề; màu chọn từ bảng màu có sẵn, mặc định chữ trắng trên nền đen | a11, b1, b3 |
| 56 | Cài đặt › Quyền riêng tư: lưu lịch sử; xóa toàn bộ dữ liệu | nhóm Quyền riêng tư, lệnh `clear_all_data` | a9, b3 |
| 57 | Nút "Xóa model và dữ liệu"; cả hai nút giữ bản quyền và bộ đếm | `data::clear_all_data` chỉ xóa `data.db` và mục `db-key`; chỗ đặt nút ở `PrivacySettings.tsx` | a9, b3; nút ở 04; 06 kiểm Q14 |
| 65 | 1–3 dòng bản dịch, câu gốc chữ nhỏ ở trên | | b1, b2 |
| 66 | Bản dịch hiện dần từng chữ | giữ `subtitle://delta` của 02, hiện đúng trạng thái `translating` | b1, b2 |
| 67 | Phụ đề tạm màu nhạt; thay bằng bản dịch của câu đã ghép | | b1, b2 |
| 68 | Kéo để di chuyển, kéo cạnh hoặc góc đổi kích thước (cả macOS lẫn Windows, tối thiểu 320 × 80); nhớ vị trí và kích thước từng màn hình; nút ✕ ẩn thanh khi chưa khóa | vùng kéo cạnh trên cả hai hệ điều hành (Windows: hệ điều hành đổi kích thước; macOS: app đổi theo con trỏ), cỡ tối thiểu, nhớ vị trí cả lúc ẩn, nút ✕ | a10, b2; b8 (người), b9 (Win) |
| 73 | Chỉ báo nhỏ: đang nghe, không có âm thanh, đang trễ | | b1, b2 |
| 81 | Lần đầu nạp model: thanh phụ đề hiện "Đang nạp model…" | | b1, b2 |
| 136 | Lần đầu chạy binary mới: "Đang chuẩn bị lần đầu" | thanh phụ đề hiện lời nhắc này | b2; số đo thật chờ T1 |
| 140 | Thuật ngữ: mẫu "terminology"; tối đa 20 mục; NFC, không phân biệt hoa thường; Latin theo ranh giới từ, Trung, Nhật, Hàn theo chuỗi con | | a4 |
| 151 | Cấu trúc `Subtitle`, `replaces` | bản chép lời và giao diện xóa phụ đề đã gộp | a6, b1 |
| 152 | Sự kiện `subtitle://upsert`, `subtitle://delta` | | a6, b1 |
| 153 | Thanh phụ đề N dòng; cửa sổ chính hiện toàn bộ; `dropped` hiện "[bỏ qua đoạn]" | | b1, b2, b4 |
| 154 | Bản chép lời nằm trong bộ nhớ theo từng phiên | `TranscriptStore` | a6 |
| 155 | SQLite mã hóa bằng SQLCipher qua `rusqlite`, khóa trong kho khóa; chứa từ điển và lịch sử | | a3, a5, a7 |
| 156 | Xuất TXT, SRT (chọn câu gốc hay bản dịch), Markdown | `transcript/export.rs` | a6, a8 |
| 346 | Hiển thị thời điểm reset của hạn mức | 03 không làm | 06 |
| 193 | Từ điển nằm trong SQLite mã hóa, không trong file cài đặt | | a5 |
| 197 | Trợ năng: chữ phóng to được; phụ đề đủ tương phản | chữ phụ đề có viền tối | b2; b8 (người) |
| 219 | Độ trễ > 6 giây: chỉ báo "Đang trễ" | | b2 |
| 222 | Số đo từng phiên: bảng debug ẩn và log | `DebugLog`, lệnh `get_debug_sessions`, bảng ở màn hình Giới thiệu | a9, b6 |
| 231 | Hơn 60 giây không có âm thanh: thanh phụ đề báo kèm gợi ý | | b2 |
| 238 | Trễ dồn lại: chỉ báo | | b2 |
| 239 | Hết hạn mức: dừng, báo thời điểm reset, nút nâng gói | thanh phụ đề báo đã hết hạn mức | b2; còn lại ở 06 |
| 252 | Lịch sử mặc định tắt, chỉ trên máy, xóa bằng một nút | lưu chỉ khi bật và là Pro; nút xóa toàn bộ | a7, a9, b3 |
| 269 | Logic quan trọng trong Rust, JavaScript chỉ hiển thị | khớp thuật ngữ, dựng prompt, xuất file, lưu lịch sử đều ở Rust | a4, a6, a7 |
| 273 | Lịch sử mã hóa SQLCipher, khóa ngẫu nhiên trong kho khóa; log không có chữ chép lời | log và bảng debug không có chữ chép lời | a3, a7, a9 |
| 286 | Unit test: khớp thuật ngữ tiếng Việt có dấu và chữ Trung, Nhật, Hàn | | a4 |
| 292 | Vitest: i18n đủ khóa; hiển thị thanh phụ đề. Xuất file test phía Rust | `subtitleView.test.ts`; `export.rs` | a6, b1, b2 |
| 301 | Thủ công: app họp toàn màn hình, nhiều màn hình | | b8 (người), b9 (Win); 08 |
| 314 | Bảo mật: mở file lịch sử bằng công cụ SQLite bên ngoài thì không đọc được | test chạy `sqlite3` của hệ thống | a3 |
| 318 | Cây thư mục theo §12 | `db.rs`, `glossary.rs`, `transcript/{store,export,history}.rs` | a3, a5, a6, a7 |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ24, dùng chung cho 03a và 03b. Các QĐ sửa hay thêm sau review lần 1 ghi rõ mã của review.

- **QĐ1. SQLCipher qua `rusqlite` + `bundled-sqlcipher`, khác nhau theo hệ điều hành.** macOS dùng CommonCrypto của hệ thống (không có OpenSSL); Windows bật `bundled-sqlcipher-vendored-openssl` (OpenSSL 3.6.3 build tĩnh). Chọn tính năng theo target trong `Cargo.toml` (resolver 3 không gộp tính năng của target khác). Phương án khác đã xét: SQLite3 Multiple Ciphers (không có trong `rusqlite`), OpenSSL dạng DLL kèm bộ cài (thêm file vào bảng SHA-256 của 07, phải cập nhật bảo mật riêng). Cách đã chọn không thêm DLL, và chỉ một bản OpenSSL.
- **QĐ2. Khóa DB là khóa thô 32 byte**, không phải mật khẩu: `PRAGMA key = "x'<64 chữ số hex>'"`, SQLCipher bỏ qua PBKDF2 nên mở nhanh. Khóa ngẫu nhiên từ `getrandom`, lưu dạng hex ở mục `db-key` của kho khóa (service là bundle identifier, `persistence = Local` trên Windows).
- **QĐ3. DB ở `app_local_data_dir`**: macOS là `~/Library/Application Support/com.aitranslator.desktop/` (cùng chỗ `settings.json`), Windows là `%LOCALAPPDATA%\com.aitranslator.desktop\` (không đi theo hồ sơ roaming, cùng máy với khóa).
- **QĐ4. Mở DB lúc cần, không lúc khởi động.** Người dùng Free không đọc kho khóa vì DB. Mất khóa hay khóa sai: đổi tên file thành `data.db.unreadable-<giây>` rồi tạo DB mới (giữ để hỗ trợ xem; mỗi lần mất khóa thêm một file, chấp nhận vì hiếm và "Xóa toàn bộ dữ liệu" dọn hết). Kho khóa lỗi (bị từ chối): báo `dataUnavailable`, không đụng file. File của bản app mới hơn (`user_version` lớn hơn): từ chối, không sửa.
- **QĐ5. `PRAGMA secure_delete = ON`**: dữ liệu bị xóa được ghi đè bằng số 0 (có test, M06 của review 03). Khóa ngoại đã bật sẵn trong bản SQLCipher kèm theo (`SQLITE_DEFAULT_FOREIGN_KEYS=1`), test xóa phiên kiểm cả các câu bị xóa theo.
- **QĐ6. "Xóa toàn bộ dữ liệu" xóa hẳn file, journal, mọi bản `data.db.unreadable-*` và mục khóa** (`DataStore::wipe`; Q2 của review 03), không `DELETE` từng bảng: không còn gì của dữ liệu cũ trên đĩa. Cửa sổ chính cũng bỏ bản chép lời, lịch sử và từ điển đang hiện (N2). Không phải tính năng Pro (người đã về Free vẫn xóa được). Bản chép lời trong bộ nhớ cũng bị xóa. Kế hoạch 04 gọi `data::clear_all_data` cho nút "Xóa model và dữ liệu".
- **QĐ7. Điểm kiểm tra Pro duy nhất** là `pro.rs` (Đ6): trait `ProGate`, `require` cho lệnh, `is_pro` cho việc chạy ngầm, `refresh` đưa trạng thái vào `AppStatus.pro`. Chưa cài `ProGate` thì là Free. Bản tạm `DevGate` của 03 **chỉ có trong bản debug** (`cfg(debug_assertions)`; Q1 của review 03) và luôn Pro, trừ khi `AI_TRANSLATOR_DEV_FREE=1`; bản release không cài gate nào nên là Free. 06 cài trạng thái bản quyền đúng một lần ở chỗ của `install_default_gate` (`app.manage` không thay được state đã có), gọi `refresh` khi bản quyền đổi, và thêm kiểm tra ở nhiều chỗ theo §10.2. `refresh` về Free thì luồng dịch thôi dùng thuật ngữ ngay (N11).
- **QĐ8. Tính năng nào là Pro:** xem và xóa lịch sử, lưu lịch sử, xuất file, từ điển (xem, sửa, nhập, xuất, đưa vào prompt). Không phải Pro: xem bản chép lời của phiên hiện tại, tìm, sao chép, xóa toàn bộ dữ liệu, bảng debug.
- **QĐ9. Thuật ngữ là cặp (chữ nguồn, bản dịch), không gắn ngôn ngữ.** Mục nào khớp câu thì vào prompt, dù ngôn ngữ đích là gì (điểm cần quyết 2).
- **QĐ10. Luật khớp thuật ngữ** (§6.5): cả câu và thuật ngữ chuẩn hóa NFC rồi chữ thường. Ranh giới từ xét riêng ở từng đầu của thuật ngữ: đầu đó là chữ hay số không phải Trung, Nhật, Hàn thì ký tự kề bên trong câu không được là chữ hay số không phải Trung, Nhật, Hàn. Nên "AI" không khớp trong "said" nhưng khớp trong "使用AI模型"; thuật ngữ trộn như "AI模型" vẫn đúng luật; "C++" khớp trong "C++11" (đầu phải là dấu +). Quá 20 mục thì lấy mục dài hơn trước, cùng độ dài theo thứ tự trong từ điển.
- **QĐ11. Mẫu "terminology" lấy nguyên văn model card** (`tencent/Hy-MT2-1.8B`, commit `9a341cd`, cùng commit với tokenizer đang dùng): mẫu tiếng Anh "Reference the following translations:" … "translates to" … dòng trống … "Note that you must ONLY output…"; mẫu tiếng Trung "参考下面的翻译：" … "翻译成" … không có dòng trống. Chọn mẫu tiếng Trung hay tiếng Anh theo cùng luật với mẫu mặc định. Có thuật ngữ thì bỏ ngữ cảnh câu trước (cờ thử nghiệm): model card không có mẫu gộp hai thứ.
- **QĐ12. Từ điển của luồng dịch đọc lại ở mỗi câu** (`SharedGlossary = Arc<RwLock<Glossary>>`): sửa từ điển giữa phiên thì câu sau dùng ngay. App nạp lại lúc bắt đầu phiên và sau mỗi lần sửa; Free thì rỗng. Đọc DB lỗi lúc bắt đầu phiên thì dịch không có thuật ngữ, ghi log.
- **QĐ13. Prompt mặc định không đổi**: câu không có thuật ngữ nào dùng đúng mẫu cũ, và `latency-bench mt-eval` truyền từ điển rỗng. Vì vậy 03 không cần chạy lại A3 (mục 6.7 của kế hoạch 00).
- **QĐ14. Từ điển:** tối đa 500 cặp; mỗi ô cắt khoảng trắng, không rỗng, tối đa 200 ký tự, không có ký tự điều khiển (xuống dòng làm hỏng mẫu "terminology"); không trùng chữ nguồn sau khi chuẩn hóa. CSV hai cột `source,target`, UTF-8 có BOM (Excel mở đúng tiếng Việt); nhập: chữ nguồn đã có thì lấy bản dịch trong file, mới thì thêm tới 500, dòng hỏng bỏ qua và đếm, file không phải UTF-8 thì từ chối, cả lần nhập là một transaction; file tối đa 1 MiB. Ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'` khi xuất để Excel không chạy công thức, bỏ lại khi nhập (N1 của review 03).
- **QĐ15. Lịch sử lưu một lần khi phiên dừng** (bấm Dừng, lỗi, Thoát ở menu khay, và mọi lần app thoát có kiểm soát: máy tắt, khởi động lại, đăng xuất, app tự khởi động lại để cập nhật, qua `session::save_on_exit` ở `RunEvent::Exit`; Q3 của review 03), trong một transaction, chỉ khi bật "Lưu lịch sử" và là Pro; phiên không có câu nào thì không lưu. Chỉ mất phiên khi app bị kill hay mất điện. Lưu đồng bộ ngay lúc dừng (cả khi thoát), không đẩy sang luồng khác, để không mất phiên cuối. 07 dùng `AppHandle::request_restart` để cập nhật (đi qua `RunEvent::Exit`); nếu gọi `restart` trên luồng chính thì phải gọi `save_on_exit` trước, vì Tauri bỏ qua sự kiện khi đó.
- **QĐ16. Xuất file:** TXT và Markdown ghi giờ địa phương lúc câu bắt đầu; SRT ghi mốc tính từ đầu phiên. App không kèm dữ liệu múi giờ: giao diện gửi độ lệch so với UTC tại lúc bắt đầu phiên (`utcOffsetMinutes`; phiên ghi ở mùa giờ khác vẫn đúng giờ, N4 của review 03); phía Rust từ chối độ lệch ngoài ±18 giờ (`outOfRange`). Chữ trong file (tiêu đề, "[bỏ qua đoạn]", "(chưa dịch được)") theo ngôn ngữ giao diện, ở bảng chuỗi phía Rust (`i18n.rs`). SRT bản dịch: câu không có bản dịch thì hiện câu gốc.
- **QĐ17. Hộp thoại file qua `tauri-plugin-dialog`, chỉ gọi từ Rust** (`files.rs`, trait `FilePicker`), gắn vào cửa sổ chính (`set_parent`, N12 của review 03). Không cửa sổ nào được cấp `dialog:*`; `acl_tests` thêm `plugin:dialog|save`, `open`, `message` vào danh sách bị cấm. Plugin chèn một script nhỏ vào webview (thay `window.alert`, `confirm`); vì lệnh của plugin bị chặn, giao diện không dùng `confirm()` mà tự vẽ bước xác nhận.
- **QĐ18. Số thứ tự `Settings.revision`** chỉ có lúc chạy (không ghi file, không sửa được qua `update_settings`), tăng dưới khóa của `AppState` mỗi lần thay cài đặt. Giao diện bỏ bản có số nhỏ hơn; lúc `init`, kết quả của `get_settings` chỉ thay bản đã tới qua sự kiện khi lớn hơn hẳn.
- **QĐ19. Thanh phụ đề kéo cạnh trên cả macOS lẫn Windows** (§4.4 sửa ngày 2026-10-02, yêu cầu của chủ dự án sau khi thử tay). Thanh tự vẽ vùng kéo ở cạnh (6 px) và góc (12 px) khi chưa khóa, rồi gọi lệnh của Rust (`begin_overlay_resize`, `overlay_resize_move`, `end_overlay_resize`). Windows: Rust gọi `start_resize_dragging` của Tauri, hệ điều hành đổi kích thước (QĐ23 của 01: cờ đặt một lần lúc tạo). macOS: tao không có `drag_resize_window`, nên Rust tự đặt khung cửa sổ theo vị trí con trỏ mỗi khung hình (đọc con trỏ ở phía Rust, không nhận tọa độ từ giao diện; độ dời tính bằng điểm rồi nhân tỉ lệ của màn hình chứa thanh, vì tao đổi vị trí con trỏ ra pixel theo tỉ lệ của màn hình chính, Q-A của review 03 lần 2); NSPanel vẫn `resizable(true)` phòng khi mép ngoài cùng của nó cũng kéo được. Overlay không được cấp quyền `core:window:*` mới. Cỡ tối thiểu 320 × 80 điểm (spec), trên mức kiểm của `Settings::validate`, để vị trí luôn lưu được. Vị trí cũng được nhớ lúc ẩn thanh, phòng khi NSPanel không báo sự kiện di chuyển. Nút ✕ (chỉ khi chưa khóa, hiện khi rê chuột) gọi `hide_overlay`: ẩn như phím tắt, phiên vẫn chạy. Rủi ro chưa kiểm được trên máy không có người: NSPanel không làm cửa sổ chính (non-key) có nhận `:hover` và con trỏ đổi hình không; 03b Task 8 kiểm.
- **QĐ20. Bước "Nghe thử"** phát câu mẫu bằng thẻ `<audio>` của webview, trong một phiên `StartOptions::LISTEN_TEST`: thu cả âm thanh của app và thu toàn hệ thống, bỏ qua nguồn đã chọn (câu mẫu phát ra thiết bị mặc định, không phát từ app họp). Tiếng của webview đi qua tiến trình WebKit (macOS) hay WebView2 (Windows), nên chỉ thu được ở chế độ toàn hệ thống (ghi chú N8 của 02c). Phát xong 6 giây thì tự dừng. Rời bước trong lúc `start_listen_test` còn chờ thì phiên vừa bắt đầu được dừng (N3 của review 03). Phiên nghe thử là một phiên thật: 06 quyết có trừ hạn mức không (dấu hiệu là `StartOptions::LISTEN_TEST`), và nó vào lịch sử nếu đã bật lưu (N13).
- **QĐ21. Bảng debug ẩn** ở màn hình Giới thiệu, mở bằng cách bấm 5 lần vào dòng phiên bản; giữ số đo của 10 phiên gần nhất trong bộ nhớ, không có chữ chép lời.
- **QĐ22. `sourceLock` không cần nằm trong `sourceLanguages`** (mục 8 của ghi chú cho 01): khi khóa một ngôn ngữ nguồn, tập nguồn bị bỏ qua (§6.4); `session::engine_config` đã làm vậy từ 02 và có test `the_engine_follows_the_language_and_pause_settings`. Không đổi code.
- **QĐ23. Màu chữ và màu nền của phụ đề** (§4.3 sửa ngày 2026-10-02): hai khóa `overlay.textColor` (`white`, `yellow`, `green`, `lightBlue`, `orange`) và `overlay.background` (`black`, `darkGray`, `navy`, `darkBrown`, `darkPurple`), mặc định trắng trên đen, có `#[serde(default)]` nên file cũ không cần migrate. Mã màu chỉ nằm ở giao diện (`src/lib/subtitleView.ts`), do controller chọn: chữ `#ffffff`, `#ffd60a`, `#4ade80`, `#7dd3fc`, `#fb923c`; nền `#000000`, `#262626`, `#0c1b3a`, `#342112`, `#2e1046`. Test kiểm mọi cặp có tương phản ít nhất 4,5:1 khi nền đặc. Độ mờ nền vẫn là `opacity`; viền chữ tối giữ nguyên.
- **QĐ24. Tắt tiến trình phụ khi rảnh kiểm lại dưới khóa** (N1 của review cuối 02, Q5 của review 03): `SidecarManager::stop_if_idle` kiểm "rảnh" dưới khóa của từng tiến trình phụ ngay trước khi lấy ra; `LiveDeps::prepare` chạm trước rồi mới hỏi `running`. Không gộp `touch` và `tick` vào một khóa dài, vì khóa của tiến trình phụ có thể bị giữ cả phút khi đang nạp model.

## Điểm cần chủ dự án quyết (đã duyệt)

Chủ dự án duyệt cả bốn điểm ngày 2026-10-02, đúng phương án kế hoạch đã làm (ghi trong ngoặc): từ điển chỉ là gợi ý cho model; từ điển không gắn ngôn ngữ đích; xuất bản chép lời qua hộp thoại lưu file; lịch sử lưu khi dừng phiên (nay gồm cả mọi lần app thoát có kiểm soát, Q3 của review 03). Giữ lại dưới đây để biết lý do.

1. **Thuật ngữ với gói Chuẩn (Q8_0) chỉ được theo khoảng một nửa** (bảng "Thuật ngữ với model thật" dưới đây): Q8_0 đúng 4/8 thuật ngữ, Q4_K_M đúng 7/8 (không có từ điển: 0/8 và 1/8). Model 1,8B coi danh sách thuật ngữ là gợi ý. Phương án: nhận như hiện tại và ghi rõ trên màn hình Từ điển rằng đây là gợi ý (kế hoạch này); hoặc 08 đo trên bộ câu lớn hơn rồi xét đổi cách trình bày (ví dụ đặt thuật ngữ trong ngoặc kép) và chạy lại A3.
2. **Thuật ngữ không gắn ngôn ngữ** (QĐ9): người dùng đổi ngôn ngữ đích thì từ điển cũ vẫn được đưa vào prompt. Phương án: giữ (kế hoạch này; đơn giản, đa số người dùng một ngôn ngữ đích); hoặc thêm cột ngôn ngữ đích cho mỗi cặp (đổi schema DB và CSV).
3. **Xuất file chọn chỗ lưu bằng hộp thoại của hệ điều hành** (QĐ17, thêm `tauri-plugin-dialog`). Phương án: như kế hoạch; hoặc ghi thẳng vào thư mục Downloads rồi mở Finder hay Explorer (không thêm plugin, nhưng nhập CSV vẫn cần hộp thoại mở file).
4. **Lịch sử chỉ lưu khi phiên dừng** (QĐ15): app bị tắt đột ngột thì mất phiên đang chạy. Phương án: như kế hoạch; hoặc ghi từng câu đã chốt vào DB trong lúc dịch (phức tạp hơn vì câu còn bị ghép, gộp).

## Kiểm bằng mutation lúc lập kế hoạch

Script đặt ngoài repo, chạy trên cây cuối của 03 (sau lần chạy lại kế hoạch, base `5925d42`): mỗi mutation sửa đúng một chỗ của code, chạy nhóm test liên quan, test phải đỏ, rồi trả code về như cũ. Gồm 55 mutation của lần lập kế hoạch đầu (C1 viết lại theo `glossary::forget`), 20 mutation M01–M20 của review lần 1 (bảy mutation sống ở lần đó nay có test), và các mutation mới cho phần sửa sau review và yêu cầu mới (mã Q, N, K, A, B, U). Bốn mutation sống ở lần chạy đầu đều là lớp chặn thừa, nên code được rút gọn, hoặc thêm test, rồi chạy lại cả bốn (D1, D6, S6, H2 dưới đây là kết quả lần chạy lại):
- bỏ nhánh "không có khóa mà file đã có thì đổi tên file" (nhánh `NotADatabase` đã làm việc đó): bỏ nhánh;
- `parse_key` kiểm `is_ascii_hexdigit`: thêm test chuỗi `+f…` (`from_str_radix` nhận dấu `+`) và chuỗi nhiều byte (cắt giữa ký tự thì panic);
- bỏ BOM khi nhập CSV (`csv` tự bỏ): bỏ dòng đó; mutation mới bỏ BOM khi xuất;
- `PRAGMA foreign_keys = ON` (đã bật sẵn khi build): bỏ dòng đó; mutation mới tắt khóa ngoại.

Kết quả (`bị giết`: có test đỏ):

| Mã | File | Mutation | Kết quả |
|---|---|---|---|
| G1 | `pipeline/glossary.rs` | bỏ kiểm ranh giới ở đầu trái thuật ngữ | bị giết |
| G2 | `pipeline/glossary.rs` | bỏ kiểm ranh giới ở đầu phải | bị giết |
| G3 | `pipeline/glossary.rs` | chữ Trung, Nhật, Hàn cũng tính là chữ của từ (Latin cạnh chữ Hán không khớp) | bị giết |
| G4 | `pipeline/glossary.rs` | `normalize` chỉ đổi chữ thường, không NFC | bị giết |
| G5 | `pipeline/glossary.rs` | lấy 21 mục thay vì 20 | bị giết |
| G6 | `pipeline/glossary.rs` | không xếp mục dài trước | bị giết |
| G7 | `pipeline/glossary.rs` | không bỏ mục trùng khóa | bị giết |
| G8 | `pipeline/glossary.rs` | đầu trái luôn xét ranh giới (dấu chấm của `.NET`) | bị giết |
| P1 | `pipeline/translate.rs` | có thuật ngữ mà vẫn dùng mẫu mặc định | bị giết |
| P2 | `pipeline/prompt.rs` | bỏ dòng trống trước câu lệnh của mẫu tiếng Anh | bị giết |
| P3 | `pipeline/engine.rs` | luồng dịch không tra từ điển | bị giết |
| R1 | `pro.rs` | `DevGate`: chỉ không có biến mới là Pro | bị giết |
| R2 | `pro.rs` | chưa cài `ProGate` thì là Pro | bị giết |
| R3 | `pro.rs` | `refresh` báo lại cả khi không đổi | bị giết |
| R4 | `data.rs` | `list_history` không hỏi Pro | bị giết |
| R5 | `data.rs` | `export_transcript` không hỏi Pro | bị giết |
| R6 | `glossary.rs` | gói Free vẫn nạp từ điển cho luồng dịch | bị giết |
| R7 | `transcript/history.rs` | lưu lịch sử không hỏi Pro | bị giết |
| R8 | `transcript/history.rs` | lưu lịch sử khi "Lưu lịch sử" tắt | bị giết |
| D1 | `db.rs` | khóa không mở được file: không đổi tên file cũ | bị giết |
| D2 | `db.rs` | nhận nhầm mã lỗi khóa sai | bị giết |
| D3 | `db.rs` | không đặt `PRAGMA key` (file không mã hóa) | bị giết |
| D4 | `db.rs` | nhận file của bản app mới hơn một bậc | bị giết |
| D5 | `db.rs` | `wipe` không xóa mục khóa | bị giết |
| D6 | `db.rs` | `parse_key` chỉ kiểm độ dài | bị giết |
| S1 | `glossary.rs` | cho thêm mục thứ 501 | bị giết |
| S2 | `glossary.rs` | sửa một mục mà giữ chữ nguồn của chính nó cũng báo trùng | bị giết |
| S3 | `glossary.rs` | chỉ chặn xuống dòng, không chặn tab | bị giết |
| S4 | `glossary.rs` | nhập CSV luôn bỏ dòng đầu | bị giết |
| S5 | `glossary.rs` | nhập CSV vượt 500 | bị giết |
| S6 | `glossary.rs` | xuất CSV không có BOM | bị giết |
| T1 | `transcript/store.rs` | không xóa phụ đề đã gộp (`replaces`) | bị giết |
| T2 | `transcript/store.rs` | nhận sự kiện của phiên khác | bị giết |
| T3 | `transcript/export.rs` | câu dịch lỗi không có "(chưa dịch được)" | bị giết |
| T4 | `transcript/export.rs` | không thoát dấu `\` trong Markdown | bị giết |
| T5 | `transcript/export.rs` | sai năm ở tháng 1, 2 | bị giết |
| T6 | `transcript/export.rs` | SRT có mục rỗng | bị giết |
| H1 | `transcript/history.rs` | lưu cả phiên không có câu nào | bị giết |
| H2 | `db.rs` | tắt khóa ngoại (xóa phiên không xóa câu) | bị giết |
| V1 | `state.rs` | không tăng `revision` | bị giết |
| V2 | `settings/migrate.rs` | ghi `revision` vào file | bị giết |
| V3 | `settings/migrate.rs` | đọc `revision` từ file | bị giết |
| C1 | `data.rs` | xóa dữ liệu mà luồng dịch còn giữ từ điển (`glossary::forget`) | bị giết |
| C2 | `data.rs` | xóa dữ liệu mà còn bản chép lời trong bộ nhớ | bị giết |
| L1 | `session.rs` | nghe thử vẫn theo nguồn trong cài đặt | bị giết |
| L2 | `session.rs` | thanh phụ đề không nhận mức âm lượng | bị giết |
| M01 | `data.rs` | `update_glossary_entry` không hỏi Pro | bị giết |
| M02 | `data.rs` | `delete_glossary_entry` không hỏi Pro | bị giết |
| M03 | `data.rs` | xóa thuật ngữ mà không nạp lại từ điển của luồng dịch | bị giết |
| M04 | `data.rs` | nhập CSV mà không nạp lại từ điển của luồng dịch | bị giết |
| M05 | `files.rs` | bỏ giới hạn 1 MiB khi nhập | bị giết |
| M06 | `db.rs` | bỏ `PRAGMA secure_delete = ON` | SỐNG |
| M07 | `db.rs` | `set_aside` không xóa journal cũ | bị giết |
| M08 | `db.rs` | `wipe` không xóa journal | bị giết |
| M09 | `glossary.rs` | ô dài đúng 200 ký tự bị từ chối | bị giết |
| M10 | `glossary.rs` | dòng tên cột CSV không cắt khoảng trắng | bị giết |
| M11 | `session.rs` | dừng engine (cả khi Thoát) mà không lưu lịch sử | bị giết |
| M12 | `session.rs` | phiên mới không `begin` bản chép lời | bị giết |
| M13 | `transcript/store.rs` | `delta` không nối chữ dịch vào bản chép lời | bị giết |
| M14 | `data.rs` | gói Free vẫn đọc được lịch sử qua `load` | bị giết |
| M15 | `transcript/history.rs` | câu xem trước lấy cả câu gốc rỗng | bị giết |
| M16 | `session.rs` | nghe thử không thu âm thanh của chính app | bị giết |
| M17 | `actions.rs` | ẩn thanh phụ đề mà không nhớ vị trí | bị giết |
| M18 | `pipeline/glossary.rs` | chữ CJK Extension B không tính là CJK | bị giết |
| M19 | `pipeline/glossary.rs` | Hangul không tính là CJK | bị giết |
| M20 | `glossary.rs` | nhập CSV không đếm `updated` | bị giết |
| Q1 | `pro.rs` | bản release cài một gate luôn Pro (chạy test ở profile release) | bị giết |
| Q2 | `db.rs` | `wipe` không xóa các bản `data.db.unreadable-*` | bị giết |
| Q3 | `session.rs` | `save_on_exit` không lưu gì | bị giết |
| N1a | `glossary.rs` | xuất CSV không chặn công thức | bị giết |
| N1b | `glossary.rs` | nhập CSV không bỏ dấu chặn công thức | bị giết |
| N1c | `glossary.rs` | ô bắt đầu bằng `'` rồi ký tự công thức không được chặn thêm | bị giết |
| N4 | `data.rs` | nhận độ lệch múi giờ ngoài ±18 giờ | bị giết |
| N11 | `pro.rs` | về Free mà luồng dịch còn dùng thuật ngữ | bị giết |
| N8 | `test_support.rs` | dọn cả thư mục tạm mới của app giả | bị giết |
| K1 | `overlay/mod.rs` | thanh đang khóa vẫn kéo cạnh được | bị giết |
| K2 | `overlay/mod.rs` | Windows: app vẫn tự đổi kích thước thay vì để hệ điều hành | bị giết |
| K3 | `overlay/mod.rs` | nhả chuột không nhớ kích thước mới | bị giết |
| K4 | `overlay/mod.rs` | cỡ tối thiểu không nhân tỉ lệ của màn hình | bị giết |
| K5 | `overlay/placement.rs` | kéo cạnh không dừng ở cỡ tối thiểu | bị giết |
| K6 | `overlay/placement.rs` | kéo cạnh trái mà cạnh phải không đứng yên | bị giết |
| K7 | `overlay/mod.rs` | cỡ tối thiểu 240 thay vì 320 điểm | bị giết |
| K8 | `commands.rs` | nút ✕ ẩn thanh mà không cập nhật trạng thái, không nhớ vị trí | bị giết |
| A1 | `state.rs` | thanh phụ đề không nhận màu chữ đã chọn | bị giết |
| A2 | `settings/mod.rs` | màu nền mặc định không phải đen | bị giết (không biên dịch) |
| B1 | `pipeline/supervisor.rs` | không kiểm lại "rảnh" trước khi tắt `llama-server` | bị giết |
| B2 | `pipeline/supervisor.rs` | không kiểm lại "rảnh" trước khi tắt `asr-worker` | SỐNG |
| U1 | `store/overlay.ts` | kéo cạnh gửi mọi lần di chuyển, không gộp theo khung hình | bị giết |
| U2 | `store/overlay.ts` | nhả chuột rồi vẫn gửi lần di chuyển đã hẹn | bị giết |
| U3 | `store/library.ts` | đặt lại store mỗi lần store app đổi, không chỉ lúc vừa xóa xong | bị giết |
| U4 | `store/library.ts` | đặt lại mà từ điển đang hiện không mất | bị giết |
| U5 | `store/transcript.ts` | đặt lại mà bản chép lời đang hiện không mất | bị giết |
| U6 | `store/transcript.ts` | sao chép dùng độ lệch múi giờ không theo lúc bắt đầu phiên | bị giết |
| U7 | `lib/subtitleView.ts` | độ lệch múi giờ của lúc này, không của thời điểm đã cho | bị giết |
| U8 | `lib/subtitleView.ts` | màu cam tối, không đủ tương phản trên nền nâu | bị giết |
| U9 | `lib/subtitleView.ts` | nền bỏ qua độ mờ | bị giết |
| U10 | `lib/listenTest.ts` | rời bước Nghe thử trong lúc chờ mà vẫn phát | bị giết |
| X1 | `lib.rs` | `RunEvent::Exit` (`on_exit`) không gọi `save_on_exit` | bị giết |
| KS1 | `overlay/mod.rs` | kéo cạnh cộng thẳng độ dời con trỏ (điểm) vào khung (pixel), không nhân tỉ lệ màn hình | bị giết |
| KS2 | `overlay/mod.rs` | kéo cạnh dùng tỉ lệ 1 thay vì tỉ lệ của màn hình chứa thanh | bị giết |
| J1 | `store/app.ts` | nhận cài đặt cũ hơn | bị giết |
| J2 | `store/app.ts` | `init` ghi đè bản tới qua sự kiện cùng số thứ tự | bị giết |
| J3 | `store/transcript.ts` | bản đọc tới muộn thêm lại dòng đã gộp | bị giết |
| J4 | `store/transcript.ts` | tìm không chuẩn hóa NFC | bị giết |
| J5 | `store/transcript.ts` | phiên mới không xóa bản của phiên trước | bị giết |
| J6 | `lib/subtitleView.ts` | đang dịch chưa có chữ thì hiện dòng rỗng | bị giết |
| J7 | `lib/subtitleView.ts` | chỉ báo của phiên hiện cả khi không dịch | bị giết |
| J8 | `store/overlay.ts` | mức âm lượng không về 0 khi dừng | bị giết |
| J9 | `store/library.ts` | xóa phiên đang mở mà vẫn mở | bị giết |

Kết quả: 109 mutation, 107 bị giết (gồm X1, KS1, KS2 thêm sau review lần 2: X1 sống ở review lần 2, nay bị giết). C1 và U3 sống ở lần chạy đầu của bản này và đã có test (C1: lớp "về Free thì `forget`" của N11 che mất, nên test xóa thêm một lần khi đang Pro; U3: test đổi store app sau khi xóa). Hai mutation còn sống được chấp nhận:
- **M06** (bỏ `PRAGMA secure_delete = ON`): SQLCipher tự bật `secure_delete` cho mọi DB có khóa (`sqlcipher/sqlite3.c` của `libsqlite3-sys` 0.38.2, quanh dòng 112894, `sqlite3BtreeSecureDelete(pDb->pBt, 1)` lúc gắn khóa). Dòng PRAGMA giữ lại để ý định rõ ràng, còn test `a_new_database_is_encrypted_and_has_the_schema` kiểm giá trị thật là 1, nên nếu SQLCipher đổi mặc định mà ai đó bỏ dòng này thì test đỏ.
- **B2** (bỏ lần kiểm lại "rảnh" trước khi tắt `asr-worker`): chỉ có tác dụng khi một lần Bắt đầu chen vào đúng giữa lúc tắt `llama-server` và lúc tắt `asr-worker`; không dựng được tất định bằng đồng hồ giả. B1 (lần kiểm trước `llama-server`) bị giết.

## Thuật ngữ với model thật (lúc lập kế hoạch)

Test `crates/pipeline/tests/real_terms.rs` (Task 4, `#[ignore]`) dịch 6 câu có 8 thuật ngữ sang tiếng Việt, mỗi câu hai lần: không có và có từ điển. Đếm thuật ngữ có bản dịch đúng như từ điển. `llama-server` b11146, Mac M4 Pro, 2026-10-02:

| Model | Không có từ điển | Có từ điển |
|---|---|---|
| Hy-MT2-1.8B Q8_0 (gói Chuẩn) | 0/8 | 4/8 |
| Hy-MT2-1.8B Q4_K_M (gói Nhẹ) | 1/8 | 7/8 |

Ví dụ (Q4_K_M): "The sprint ends on Friday, so the standup moves to nine." không có từ điển ra "Cuộc thi đua kết thúc vào thứ Sáu, vì vậy buổi họp sẽ diễn ra vào lúc 9 giờ."; có từ điển (sprint → sprint, standup → họp đứng) ra "Sprint kết thúc vào thứ Sáu, vì vậy họp đứng sẽ diễn ra vào lúc 9 giờ." Q8_0 hay giữ cách dịch của chính nó (ví dụ "churn rate" vẫn là "tỷ lệ người dùng rời khỏi dịch vụ"); xem điểm cần quyết 1.

## Bảng task → commit tham chiếu

Chuỗi commit dựng lại theo đúng kế hoạch này (lần chạy lại ở mục "Cách đọc"), giữ ở repo `$S/p03-repo` của controller (`S=/Users/dtphong/Desktop/software_business/meeting-translator-work`), nhánh `plan03`, gốc là `5925d42` (bản trước sửa, gốc `45de838`, ở nhánh `plan03-r0` và `p03-r1-before`). Sau mỗi task, so cây với commit tương ứng: `git diff --stat <commit> -- . ':!Cargo.lock'` phải rỗng.

| Task | Commit | Thông điệp |
|---|---|---|
| 03a Task 1 | `95f2e40` | feat(app): điểm kiểm tra Pro duy nhất; bản tạm luôn Pro chỉ có ở bản debug (Đ6) |
| 03a Task 2 | `78e2afc` | feat(app): số thứ tự revision của cài đặt, giao diện bỏ bản cũ tới muộn (điểm cần quyết 10 của 02a) |
| 03a Task 3 | `96d098b` | feat(app): SQLite mã hóa bằng SQLCipher, khóa ngẫu nhiên trong kho khóa (§6.6, §10.2) |
| 03a Task 4 | `c63fe94` | feat(pipeline): khớp thuật ngữ theo §6.5 và mẫu terminology của Hy-MT2 (F5) |
| 03a Task 5 | `4369a14` | feat(app): từ điển thuật ngữ trong DB mã hóa, nhập và xuất CSV, đưa vào phiên dịch ở gói Pro (F5) |
| 03a Task 6 | `520b9a7` | feat(app): bản chép lời trong bộ nhớ theo phiên, xuất TXT, SRT, Markdown (F4, §6.6) |
| 03a Task 7 | `c2d32ea` | feat(app): lịch sử chép lời trong DB mã hóa, chỉ lưu khi bật và là Pro (F4) |
| 03a Task 8 | `195966a` | feat(app): lệnh bản chép lời, lịch sử và xuất file qua hộp thoại lưu (F4) |
| 03a Task 9 | `d8b489f` | feat(app): lệnh từ điển thuật ngữ, xóa toàn bộ dữ liệu, bảng debug ẩn (F5, §4.3, §7) |
| 03a Task 10 | `96cebb8` | feat(app): thanh phụ đề kéo cạnh trên cả macOS và Windows, nút ẩn, mức âm lượng, lệnh nghe thử (§4.1 bước 6, §4.4) |
| 03a Task 11 | `8ca1bc8` | feat(app): màu chữ và màu nền của phụ đề trong cài đặt, tới thanh phụ đề ngay khi đổi (§4.3) |
| 03a Task 12 | `08defad` | fix(pipeline): tắt tiến trình phụ khi rảnh kiểm lại dưới khóa, không chen vào lần Bắt đầu (N1 của review cuối 02) |
| 03b Task 1 | `f4c0447` | feat(ui): kiểu và store cho bản chép lời, lịch sử, từ điển; cách hiện phụ đề theo trạng thái |
| 03b Task 2 | `1642b2b` | feat(ui): thanh phụ đề đủ §4.4: trạng thái từng dòng, chỉ báo đang nghe, lời nhắc, nút ẩn, kéo cạnh, màu chữ và màu nền |
| 03b Task 3 | `8c13434` | feat(ui): Cài đặt › Phụ đề và Quyền riêng tư: cỡ chữ, số dòng, màu chữ, màu nền, độ mờ, câu gốc; lưu lịch sử, xóa toàn bộ dữ liệu |
| 03b Task 4 | `550d481` | feat(ui): màn hình Bản chép lời và Lịch sử: tìm, sao chép, xuất file, xem lại và xóa phiên đã lưu (F4) |
| 03b Task 5 | `35bd7de` | feat(ui): màn hình Từ điển thuật ngữ: thêm, sửa, xóa, nhập và xuất CSV (F5) |
| 03b Task 6 | `f30491f` | feat(ui): bước Nghe thử phát câu mẫu và hiện phụ đề; bảng debug ẩn ở màn hình Giới thiệu (§4.1 bước 6, §7) |

03a Task 13 và 03b Task 7 là kiểm tra, không có commit; 03b Task 8–10 là việc của người, Windows và cập nhật kế hoạch 00.


---

## Task 1: Điểm kiểm tra Pro duy nhất (`pro.rs`)

Đ6 của kế hoạch 00: 03 khóa tính năng Pro qua **một điểm kiểm tra duy nhất** phía Rust, bản dev tạm trả Pro; 06 thay bằng trạng thái bản quyền thật. Dòng 18, 19 (phần khóa Pro).

- `ProGate` (trait), quản lý bằng `Entitlement`; `pro::require` cho lệnh (lỗi `proRequired`), `pro::is_pro` cho việc chạy ngầm; `pro::refresh` đưa kết quả vào `AppStatus.pro` (giao diện mở hay khóa màn hình Pro) và chỉ báo khi có đổi.
- Chưa cài `ProGate` thì là Free. Bản tạm `DevGate` (QĐ7) **chỉ có trong bản debug** (`cfg(debug_assertions)`), cài ở `setup` qua `install_default_gate`; bản release không cài gate nào, tức Free cho tới khi 06 cài trạng thái bản quyền thật (Q1 của review 03). Test `the_dev_gate_exists_only_in_debug_builds` chạy cả ở bản release (03b Task 7).
- Test dùng `FakePro` trong `test_support.rs` (app giả mặc định là Pro) và `set_pro`.

**Files:**
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/pro.rs`
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/test_support.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/lib/ipc.ts`
- Modify: `src/store/app.test.ts`
- Modify: `src/store/overlay.test.ts`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 0a7b1e3a8f43867d04958efa9840faab1a4ace94..fca92350c60a565a67c030f9aa053319efcb65c7 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -157,6 +157,7 @@
                 APP_NOT_PLAYING,
                 VAD_FAILED,
                 QUOTA_EXHAUSTED,
+                PRO_REQUIRED,
                 UNKNOWN,
             ]
             .map(String::from),
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 3c8a2feac009b10d65ddc8ef38dbc2407f2e4de0..2cdb8508282e1e5553802da9318e48df0a508c61 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -18,6 +18,7 @@
 pub mod login_item;
 pub mod navigation;
 pub mod overlay;
+pub mod pro;
 pub mod quit_guard;
 pub mod security;
 pub mod session;
```

Tạo `src-tauri/src/pro.rs`, lúc này mới có phần test:

```rust
//! Điểm kiểm tra Pro duy nhất (Đ6 của kế hoạch 00; spec §2 "Pro", F4, F5). Mọi tính năng Pro (xem và lưu lịch sử, xuất
//! bản chép lời ra file, từ điển thuật ngữ) chỉ hỏi qua module này:
//! - [`require`] cho lệnh của giao diện: không phải Pro thì trả lỗi `proRequired`;
//! - [`is_pro`] cho việc chạy ngầm: lưu lịch sử khi phiên dừng, đưa thuật ngữ vào prompt.
//!
//! Kế hoạch 03 chỉ có bản tạm `DevGate`, **chỉ có trong bản debug** (`cfg(debug_assertions)`): luôn là Pro, trừ khi chạy
//! app với biến môi trường `AI_TRANSLATOR_DEV_FREE=1` (để thử bằng tay giao diện khi bị khóa Pro). Bản release không cài
//! gate nào, tức là Free, cho tới khi kế hoạch 06 cài trạng thái bản quyền thật bằng [`install_gate`] (một lần, ở đúng chỗ
//! của [`install_default_gate`]: `app.manage` không thay được state đã có), gọi [`refresh`] mỗi khi trạng thái bản quyền
//! đổi, và thêm kiểm tra ở nhiều chỗ theo §10.2.
//!
//! Chưa cài `ProGate` nào thì coi là Free: quên cài thì khóa tính năng, không mở cho không.
//! Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư) không đi qua đây: người đã về Free vẫn xóa được lịch sử và từ điển cũ.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{mock_app, set_pro};

    /// Q1 của review 03 lần 1: bản release không có `DevGate`, nên mặc định là Free. Chạy cả với `--release` ở 03b
    /// Task 7.
    #[test]
    fn the_dev_gate_exists_only_in_debug_builds() {
        assert_eq!(default_gate().is_some(), cfg!(debug_assertions));
        let app = tauri::test::mock_app();
        app.manage(AppState::new(
            crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi),
            crate::settings::migrate::FileMeta::current(),
            false,
        ));
        install_default_gate(app.handle());
        assert_eq!(is_pro(app.handle()), cfg!(debug_assertions));
        assert_eq!(app.state::<AppState>().status().pro, cfg!(debug_assertions));
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_dev_gate_is_pro_unless_asked_to_be_free() {
        assert!(DevGate::from_value(None).is_pro());
        assert!(DevGate::from_value(Some("0")).is_pro());
        assert!(DevGate::from_value(Some("")).is_pro());
        assert!(!DevGate::from_value(Some("1")).is_pro());
    }

    #[test]
    fn without_a_gate_the_app_is_free() {
        let app = tauri::test::mock_app();
        assert!(!is_pro(app.handle()));
        let e = require(app.handle()).unwrap_err();
        assert_eq!(e.code, errors::PRO_REQUIRED);
    }

    #[test]
    fn require_follows_the_gate_and_the_status_follows_refresh() {
        let app = mock_app();
        let state = app.state::<AppState>();
        assert!(require(app.handle()).is_ok());
        assert!(state.status().pro, "app giả mặc định là Pro");
        let rev = state.status().rev;
        set_pro(&app, false);
        assert_eq!(require(app.handle()).unwrap_err().code, errors::PRO_REQUIRED);
        assert!(!state.status().pro);
        assert!(state.status().rev > rev, "đổi gói thì giao diện nhận trạng thái mới");
        let rev = state.status().rev;
        refresh(app.handle());
        assert_eq!(state.status().rev, rev, "không đổi thì không báo lại");
    }
}
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 401fb229a002d893f6cbb6a90f4852a4de64ca04..9055e19a4f7e0dfc40c7ed1610169209446248e1 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -3,6 +3,7 @@
 //! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.
 
 use std::ops::ControlFlow;
+use std::sync::atomic::{AtomicBool, Ordering};
 use std::sync::{Arc, Condvar, Mutex};
 use std::time::Duration;
 
@@ -22,6 +23,7 @@
 use crate::errors::{self, CommandError};
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
 use crate::overlay::{OverlaySurface, Surface};
+use crate::pro::{Entitlement, ProGate};
 use crate::session::{Session, SessionDeps};
 use crate::settings::migrate::FileMeta;
 use crate::settings::persist::{SettingsFile, Writer};
@@ -109,6 +111,16 @@
     }
     fn system_status(&self) -> Option<AgentStatus> {
         self.0.lock().unwrap().status
+    }
+}
+
+/// Bản giả của `ProGate`: test bật tắt Pro bằng [`set_pro`]. App giả mặc định là Pro.
+#[derive(Clone)]
+pub struct FakePro(Arc<AtomicBool>);
+
+impl ProGate for FakePro {
+    fn is_pro(&self) -> bool {
+        self.0.load(Ordering::SeqCst)
     }
 }
 
@@ -358,7 +370,8 @@
     let system = FakeSystem::default();
     let login = FakeLoginItem::default();
     let file = FakeSettingsFile::default();
-    builder
+    let pro = FakePro(Arc::new(AtomicBool::new(true)));
+    let app = builder
         .manage(AppState::new(
             Settings::defaults(UiLanguage::Vi),
             FileMeta::current(),
@@ -372,10 +385,20 @@
         .manage(login)
         .manage(Writer(Box::new(file.clone())))
         .manage(file)
+        .manage(Entitlement(Box::new(pro.clone())))
+        .manage(pro)
         .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
         .build(tauri::generate_context!(test = true))
-        .expect("dựng được app giả")
+        .expect("dựng được app giả");
+    crate::pro::refresh(app.handle());
+    app
+}
+
+/// Đổi gói của app giả: `true` là Pro, `false` là Free.
+pub fn set_pro(app: &tauri::App<MockRuntime>, pro: bool) {
+    app.state::<FakePro>().0.store(pro, Ordering::SeqCst);
+    crate::pro::refresh(app.handle());
 }
 
 /// Giá trị của `key` ở lần ghi file cài đặt gần nhất có khóa đó.
```

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.test.ts b/src/store/app.test.ts
index 2f08368e41c8400a3f472c3784d47f6a8e5aace7..3bf174d9c3b640d78b47c1a2f82b9f4e29e9941e 100644
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -31,6 +31,7 @@
   indicators: { lagging: false, noAudio: false, translationUnavailable: false },
   permissionSuspected: false,
   waitingForApp: false,
+  pro: true,
   rev: 1,
 };
 const info: AppInfo = {
```

Sửa `src/store/overlay.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/overlay.test.ts b/src/store/overlay.test.ts
index 827f42d06308e4c54bf00d8ffd3017944815c4f0..a085ead39fb35fc446d2870a5d13a65b9daadcd3 100644
--- a/src/store/overlay.test.ts
+++ b/src/store/overlay.test.ts
@@ -98,6 +98,7 @@
   indicators: { lagging: false, noAudio: false, translationUnavailable: false },
   permissionSuspected: false,
   waitingForApp: false,
+  pro: true,
   rev,
 });
 
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib pro:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có `pro.rs` phần code, `AppStatus.pro`, `errors::PRO_REQUIRED`):
```text
error: could not compile `meeting-translator` (lib test) due to 21 previous errors; 1 warning emitted
error[E0425]: cannot find function `default_gate` in this scope
error[E0425]: cannot find function `install_default_gate` in this scope
error[E0425]: cannot find function `is_pro` in this scope
error[E0425]: cannot find function `refresh` in module `crate::pro`
error[E0425]: cannot find function `refresh` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index fca92350c60a565a67c030f9aa053319efcb65c7..eefd817d4c54b7f3820fd39cebe0f1f83d26cfc6 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -51,6 +51,9 @@
 pub const VAD_FAILED: &str = "vadFailed";
 /// Chạm hạn mức (§6.8): phiên dừng với lý do `quota_exhausted`. Kế hoạch 06 thêm thời điểm reset và nút nâng gói.
 pub const QUOTA_EXHAUSTED: &str = "quotaExhausted";
+// Mã lỗi của kế hoạch 03.
+/// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
+pub const PRO_REQUIRED: &str = "proRequired";
 /// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
 pub const UNKNOWN: &str = "unknown";
 
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 2cdb8508282e1e5553802da9318e48df0a508c61..a76dcd687a73f5e819088e4c374ffc8ec215eaf3 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -115,6 +115,8 @@
         persist::save(&handle, &settings, &loaded.meta)?;
     }
     app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
+    // Điểm kiểm tra Pro duy nhất (Đ6): bản debug luôn Pro, bản release là Free; kế hoạch 06 cài trạng thái bản quyền.
+    pro::install_default_gate(&handle);
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Thêm vào `src-tauri/src/pro.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::state::AppState;

/// Biến môi trường của bản tạm: `1` thì app chạy như gói Free. Chỉ bản debug đọc biến này.
#[cfg(debug_assertions)]
pub const DEV_FREE_ENV: &str = "AI_TRANSLATOR_DEV_FREE";

/// Nguồn sự thật "đang có gói trả phí còn hạn" (spec §2). Kế hoạch 06 cài bằng trạng thái bản quyền.
pub trait ProGate: Send + Sync + 'static {
    fn is_pro(&self) -> bool;
}

/// `ProGate` đang dùng, quản lý bằng `app.manage`.
pub struct Entitlement(pub Box<dyn ProGate>);

/// Bản tạm của kế hoạch 03, chỉ có trong bản debug: Pro, trừ khi `AI_TRANSLATOR_DEV_FREE=1`.
#[cfg(debug_assertions)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DevGate {
    pro: bool,
}

#[cfg(debug_assertions)]
impl DevGate {
    /// Theo giá trị của biến `AI_TRANSLATOR_DEV_FREE` (không có thì `None`).
    pub fn from_value(value: Option<&str>) -> Self {
        Self {
            pro: value != Some("1"),
        }
    }

    pub fn from_env() -> Self {
        Self::from_value(std::env::var(DEV_FREE_ENV).ok().as_deref())
    }
}

#[cfg(debug_assertions)]
impl ProGate for DevGate {
    fn is_pro(&self) -> bool {
        self.pro
    }
}

/// Gate lúc khởi động: bản debug là `DevGate`; bản release không có gate nào (Free) cho tới khi kế hoạch 06 cài trạng thái
/// bản quyền thật.
pub fn default_gate() -> Option<Box<dyn ProGate>> {
    #[cfg(debug_assertions)]
    {
        Some(Box::new(DevGate::from_env()))
    }
    #[cfg(not(debug_assertions))]
    {
        None
    }
}

/// Cài [`default_gate`] (nếu có). Gọi một lần ở `setup`, sau khi đã có `AppState`.
pub fn install_default_gate<R: Runtime>(app: &AppHandle<R>) {
    if let Some(gate) = default_gate() {
        install_gate(app, gate);
    }
}

/// Cài `gate` rồi báo trạng thái mới cho giao diện. Gọi ở `setup`, sau khi đã có `AppState`.
pub fn install_gate<R: Runtime>(app: &AppHandle<R>, gate: Box<dyn ProGate>) {
    app.manage(Entitlement(gate));
    refresh(app);
}

/// Đang là Pro không. Chưa cài `ProGate` thì `false`.
pub fn is_pro<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<Entitlement>().is_some_and(|e| e.0.is_pro())
}

/// Cho lệnh Pro đi tiếp, hoặc trả lỗi `proRequired` để giao diện mời nâng cấp.
pub fn require<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if is_pro(app) {
        Ok(())
    } else {
        Err(CommandError::new(
            errors::PRO_REQUIRED,
            None,
            "tính năng chỉ có ở gói trả phí",
        ))
    }
}

/// Đọc lại `ProGate` vào `AppStatus.pro` và báo giao diện nếu đổi. Kế hoạch 06 gọi sau mỗi lần trạng thái bản quyền đổi.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let pro = is_pro(app);
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if state.status().pro == pro {
        return;
    }
    state.update_status(|s| s.pro = pro);
    actions::status_changed(app);
}
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/state.rs b/src-tauri/src/state.rs
index 93d8f8253b0baf5a0060b786d1d6e3bf5a121a13..7c80fd01f0dc5f8a46091e50419f6957ec47662d 100644
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -55,6 +55,8 @@
     /// macOS, nguồn một app: app đã chọn không phát tiếng nữa (đã đóng); phiên vẫn chạy và thử thu lại mỗi 2 giây
     /// (Q-C của review 02 lần 2). Giao diện hiện chỉ báo.
     pub waiting_for_app: bool,
+    /// Đang có gói trả phí còn hạn (spec §2 "Pro"): giao diện mở hay khóa tính năng Pro. Đặt bởi `pro::refresh`.
+    pub pro: bool,
     /// Tăng mỗi lần trạng thái đổi. Giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đã có (kết quả của một lệnh có thể
     /// tới sau sự kiện `app://status` mới hơn).
     pub rev: u64,
@@ -124,6 +126,7 @@
                 indicators: Indicators::default(),
                 permission_suspected: false,
                 waiting_for_app: false,
+                pro: false,
                 rev: 0,
             }),
             launched_at_login,
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 4443ac2edbb1943782834810b547e6ff02b0cc8a..583c8cec6799344eba85b0329c4940f2f6f6ec6e 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -166,6 +166,7 @@
   "error.vadFailed": "Could not load the speech detector. Please reinstall AI Translator.",
   "error.modelBroken": "The model is damaged. Please download it again.",
   "error.quotaExhausted": "The translation quota has been used up.",
+  "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 0fdb07891afb03f5dff0a9b7fb27362f66e8542a..492d7f866eff6e1f92edf84e51f58cc3a7632e3a 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -166,5 +166,6 @@
   "error.vadFailed": "Không nạp được bộ nhận biết tiếng nói. Hãy cài lại AI Translator.",
   "error.modelBroken": "Model bị hỏng. Hãy tải lại model.",
   "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
+  "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index 874fc31801c8d536224c4cf58680d2920bc84742..a8639279b01713de147cb0cd725e0bf3da473812 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -84,6 +84,8 @@
   permissionSuspected: boolean;
   // macOS, nguồn một app: app đã chọn không phát tiếng nữa; phiên vẫn chạy, đang chờ app phát lại.
   waitingForApp: boolean;
+  // Đang có gói trả phí còn hạn: tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) mở; không thì khóa.
+  pro: boolean;
   // Tăng mỗi lần trạng thái đổi: trạng thái có `rev` nhỏ hơn trạng thái đang có là cũ, bỏ qua.
   rev: number;
 }
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib pro:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test pro::tests::require_follows_the_gate_and_the_status_follows_refresh ... ok
test pro::tests::the_dev_gate_exists_only_in_debug_builds ... ok
test pro::tests::the_dev_gate_is_pro_unless_asked_to_be_free ... ok
test pro::tests::without_a_gate_the_app_is_free ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 160 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 162 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  6 passed (6)
      Tests  65 passed (65)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/errors.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/pro.rs \
  src-tauri/src/state.rs \
  src-tauri/src/test_support.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts \
  src/lib/ipc.ts \
  src/store/app.test.ts \
  src/store/overlay.test.ts
git commit -m "feat(app): điểm kiểm tra Pro duy nhất; bản tạm luôn Pro chỉ có ở bản debug (Đ6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 2: Số thứ tự `revision` của cài đặt

Điểm cần quyết 10 của 02a (controller đã quyết ngày 2026-10-02): 03 thêm số thứ tự cho `Settings`, để kết quả cũ của một lệnh tới sau sự kiện `settings://changed` mới hơn không ghi đè cài đặt trên giao diện (mục 1 của review store giao diện của 01; QĐ18).

- `Settings.revision` (`#[serde(default)]`): chỉ có lúc chạy. `migrate::RUNTIME_KEYS` bỏ khóa này khi đọc và khi ghi file; `patch::READ_ONLY` chặn sửa qua `update_settings`.
- `AppState::replace_settings(&mut next)` đặt `next.revision` = số cũ + 1 dưới cùng khóa, nên số tăng đúng theo thứ tự các lần thay. Hai chỗ gọi (`actions::commit_settings`, `overlay::remember_position`) truyền `&mut`.
- Store của cửa sổ chính (`setSettings`) bỏ bản có số nhỏ hơn; lúc `init`, kết quả của `get_settings` chỉ thay bản đã tới qua sự kiện khi lớn hơn hẳn.

**Files:**
- Modify: `src-tauri/src/actions.rs`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/overlay/mod.rs`
- Modify: `src-tauri/src/settings/migrate.rs`
- Modify: `src-tauri/src/settings/mod.rs`
- Modify: `src-tauri/src/settings/patch.rs`
- Modify: `src-tauri/src/state.rs`
- Modify: `src/lib/ipc.ts`
- Modify: `src/store/app.test.ts`
- Modify: `src/store/app.ts`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 43107033472f8de5bb1a95f9f808e1e5d475de4c..7570c49c0aade08a1b65ac15b699d8d84c6cdbab 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -533,6 +533,34 @@
     assert!(before < running && running < idle, "{before} {running} {idle}");
 }
 
+/// Cài đặt có số thứ tự tăng dần (điểm cần quyết 10 của 02a), để giao diện bỏ bản cũ tới muộn. Số trong kết quả của
+/// lệnh, trong sự kiện `settings://changed` và trong `get_settings` là một.
+#[test]
+fn the_settings_revision_grows_with_every_change() {
+    let app = mock_app();
+    let main = window(&app, "main");
+    let changed = record(&app, crate::events::SETTINGS_CHANGED);
+    let before = invoke(&main, "get_settings", json!({})).unwrap()["revision"]
+        .as_u64()
+        .unwrap();
+    let first = invoke(&main, "update_settings", json!({ "patch": { "theme": "dark" } })).unwrap();
+    let second = invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
+    let (first, second) = (
+        first["revision"].as_u64().unwrap(),
+        second["revision"].as_u64().unwrap(),
+    );
+    assert!(before < first && first < second, "{before} {first} {second}");
+    let events: Vec<u64> = changed
+        .lock()
+        .unwrap()
+        .iter()
+        .map(|s| s["revision"].as_u64().unwrap())
+        .collect();
+    assert_eq!(events, [first, second]);
+    assert_eq!(invoke(&main, "get_settings", json!({})).unwrap()["revision"], second);
+    assert!(last_saved(&app, "revision").is_none(), "số thứ tự không vào file");
+}
+
 /// Q8(c) của review 02c: câu hỏi quyền ghi âm thanh hệ thống có bản tiếng Anh (gốc, trong `Info.plist`) và tiếng Việt
 /// (`vi.lproj`), đều nói tên AI Translator, và `tauri.conf.json` chép hai file `InfoPlist.strings` vào gói `.app`.
 #[test]
```

Sửa `src-tauri/src/settings/migrate.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/migrate.rs b/src-tauri/src/settings/migrate.rs
index 2bb597ca2fd303670eb0c0dc84679723160f110a..92a220e1d213a5a1c3333d0e2fb86352ea6d7592 100644
--- a/src-tauri/src/settings/migrate.rs
+++ b/src-tauri/src/settings/migrate.rs
@@ -292,6 +292,19 @@
     }
 
     #[test]
+    fn the_runtime_revision_is_neither_saved_nor_loaded() {
+        let mut settings = Settings::defaults(UiLanguage::Vi);
+        settings.revision = 7;
+        let raw: Map<String, Value> = to_entries(&settings, &FileMeta::current()).into_iter().collect();
+        assert!(!raw.contains_key("revision"), "số thứ tự không vào file");
+        let mut raw = raw;
+        raw.insert("revision".into(), json!(9));
+        let loaded = load(raw, defaults());
+        assert_eq!(loaded.settings.revision, 0, "số thứ tự trong file (sửa tay) bị bỏ qua");
+        assert!(loaded.rejected.is_empty());
+    }
+
+    #[test]
     fn unversioned_file_is_migrated_to_current_version() {
         let raw = object(json!({ "uiLanguage": "vi", "theme": "light" }));
         let loaded = load(raw, defaults());
```

Sửa `src-tauri/src/settings/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/mod.rs b/src-tauri/src/settings/mod.rs
index 4d7a0cdc3862bc6effa3e64607f54bd231929a4c..647176402102fcd009511198eb73b9d4360dd0dd 100644
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -368,6 +368,7 @@
             "updateChannel",
             "experimental",
             "onboardingDone",
+            "revision",
         ] {
             assert!(keys.contains(&key.to_string()), "thiếu khóa {key}");
         }
```

Sửa `src-tauri/src/settings/patch.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/patch.rs b/src-tauri/src/settings/patch.rs
index 9f120cdd5536fe411385c898a8ba2354671488c2..ddb3224383830541cb8d6e5a042f75ce2b59e65a 100644
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -205,6 +205,10 @@
             apply(&current(), &json!({ "experimental": { "newFlag": true } })),
             Err(Invalid::new("experimental.newFlag", Reason::UnknownKey))
         );
+        assert_eq!(
+            apply(&current(), &json!({ "revision": 99 })),
+            Err(Invalid::new("revision", Reason::ReadOnly))
+        );
     }
 
     #[test]
```

Sửa `src/store/app.test.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.test.ts b/src/store/app.test.ts
index 3bf174d9c3b640d78b47c1a2f82b9f4e29e9941e..f5cfa904363b1ba175d2073d891462e2726f8384 100644
--- a/src/store/app.test.ts
+++ b/src/store/app.test.ts
@@ -19,6 +19,7 @@
   updateChannel: "stable",
   experimental: { translationContext: false },
   onboardingDone: false,
+  revision: 1,
 };
 const status: AppStatus = {
   session: "idle",
@@ -222,6 +223,34 @@
     expect(store.getState().status?.session).toBe("starting");
   });
 
+  it("cài đặt cũ hơn bản đang có (revision nhỏ hơn) bị bỏ, dù tới từ kết quả lệnh hay từ sự kiện", async () => {
+    const { fake, store } = setup();
+    await store.getState().init();
+    // Sự kiện của lần đổi sau (revision 5) tới trước kết quả của lệnh đổi trước (bản giả trả revision 1).
+    fake.emit("settings://changed", { ...settings, theme: "light", revision: 5 });
+    expect(await store.getState().updateSettings({ theme: "dark" })).toBe(true);
+    expect(store.getState().settings?.theme).toBe("light");
+    fake.emit("settings://changed", { ...settings, theme: "dark", revision: 4 });
+    expect(store.getState().settings?.theme).toBe("light");
+    fake.emit("settings://changed", { ...settings, theme: "dark", revision: 6 });
+    expect(store.getState().settings?.theme).toBe("dark");
+  });
+
+  it("init lấy kết quả của get_settings khi nó mới hơn bản đã tới qua sự kiện", async () => {
+    let fake: ReturnType<typeof fakeIpc> | null = null;
+    fake = fakeIpc({
+      get_settings: () => {
+        fake?.emit("settings://changed", { ...settings, uiLanguage: "en", revision: 0 });
+        return settings;
+      },
+      get_app_status: () => status,
+      get_app_info: () => info,
+    });
+    const store = createAppStore(fake.ipc);
+    await store.getState().init();
+    expect(store.getState().settings).toEqual(settings);
+  });
+
   it("đọc danh sách nguồn âm thanh và mở trang quyền ghi âm thanh", async () => {
     const { fake, store } = setup();
     await store.getState().init();
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib revision 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; `Settings` chưa có trường `revision`):
```text
error: could not compile `meeting-translator` (lib test) due to 2 previous errors
error[E0609]: no field `revision` on type `settings::Settings`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/actions.rs b/src-tauri/src/actions.rs
index 2714150d8382c1f31c65fe5ddc676a89dd57862b..6ce90d0396275c85a16a1ab20d8bfd2c30ba7ab2 100644
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -13,9 +13,9 @@
 use crate::{events, hotkey_registry, login_item, overlay, session, system, tray, window};
 
 /// Lưu cài đặt mới rồi báo mọi nơi cần biết.
-fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
+fn commit_settings<R: Runtime>(app: &AppHandle<R>, mut next: Settings) -> Settings {
     let state = app.state::<AppState>();
-    let previous = state.replace_settings(next.clone());
+    let previous = state.replace_settings(&mut next);
     if let Err(e) = persist::save(app, &next, state.file_meta()) {
         log::error!("không lưu được cài đặt: {e}");
     }
```

Sửa `src-tauri/src/overlay/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/mod.rs b/src-tauri/src/overlay/mod.rs
index f302afe73b77d1f6f6eec9d6ab3e258ef2710bd8..5fff622dc1d9bd379477bebe2d8d7b74d2bc08e4 100644
--- a/src-tauri/src/overlay/mod.rs
+++ b/src-tauri/src/overlay/mod.rs
@@ -154,7 +154,7 @@
         // Cửa sổ bị thu quá nhỏ hay nằm ngoài phạm vi: không lưu.
         return;
     }
-    state.replace_settings(next.clone());
+    state.replace_settings(&mut next);
     if let Err(e) = persist::save_overlay(app, &next, state.file_meta()) {
         log::warn!("không lưu được vị trí thanh phụ đề: {e}");
     }
```

Sửa `src-tauri/src/settings/migrate.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/migrate.rs b/src-tauri/src/settings/migrate.rs
index 92a220e1d213a5a1c3333d0e2fb86352ea6d7592..e14e91e20327646f26960183ab2bdb424bcdfad1 100644
--- a/src-tauri/src/settings/migrate.rs
+++ b/src-tauri/src/settings/migrate.rs
@@ -41,6 +41,9 @@
 /// (chưa có `schemaVersion`) đi qua cùng một đường với mọi bản sau.
 fn v0_to_v1(_raw: &mut Map<String, Value>) {}
 
+/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
+pub const RUNTIME_KEYS: &[&str] = &["revision"];
+
 /// Khóa là object con: ghép theo từng khóa con, để một khóa con hỏng không kéo cả nhóm về mặc định.
 const NESTED: &[&str] = &["overlay", "hotkeys", "experimental"];
 
@@ -116,6 +119,9 @@
     let mut rejected = Vec::new();
     let mut unknown = BTreeMap::new();
     for (key, value) in &raw {
+        if RUNTIME_KEYS.contains(&key.as_str()) {
+            continue;
+        }
         let Some(current) = merged.get(key).cloned() else {
             continue;
         };
@@ -230,6 +236,7 @@
 /// chưa đổi thì ghi lại giá trị thô của file; khóa con lạ trong `meta.unknown` được ghép lại vào nhóm.
 pub fn to_entries(settings: &Settings, meta: &FileMeta) -> Vec<(String, Value)> {
     let mut object = to_object(settings);
+    object.retain(|key, _| !RUNTIME_KEYS.contains(&key.as_str()));
     for (key, extra) in &meta.unknown {
         if let Some(Value::Object(group)) = object.get_mut(key) {
             for (sub_key, value) in extra {
```

Sửa `src-tauri/src/settings/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/mod.rs b/src-tauri/src/settings/mod.rs
index 647176402102fcd009511198eb73b9d4360dd0dd..1996abbe66365022d7cbfb5e2f8a90f66c27d422 100644
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -167,6 +167,12 @@
     pub experimental: Experimental,
     /// Đã đi hết các bước lần đầu mở app (§4.1).
     pub onboarding_done: bool,
+    /// Số thứ tự của bản cài đặt trong lần chạy này của app (điểm cần quyết 10 của kế hoạch 02a): tăng mỗi lần cài đặt
+    /// đổi (`AppState::replace_settings`). Giao diện bỏ bản có số nhỏ hơn bản đang có, vì kết quả của một lệnh có thể tới
+    /// sau sự kiện `settings://changed` mới hơn. Không ghi vào file (`migrate::RUNTIME_KEYS`), không sửa được qua
+    /// `update_settings`.
+    #[serde(default)]
+    pub revision: u64,
 }
 
 pub const VAD_END_SILENCE_MS: std::ops::RangeInclusive<u32> = 200..=800;
@@ -216,6 +222,7 @@
                 translation_context: false,
             },
             onboarding_done: false,
+            revision: 0,
         }
     }
 
```

Sửa `src-tauri/src/settings/patch.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/patch.rs b/src-tauri/src/settings/patch.rs
index ddb3224383830541cb8d6e5a042f75ce2b59e65a..75cd9700733c212b6d7bfbc193b4166ebf40ddcf 100644
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -11,8 +11,15 @@
 /// Khóa không đổi được qua `update_settings`, kèm lý do:
 /// - `hotkeys`: phải đăng ký lại với hệ điều hành (lệnh `set_hotkey`);
 /// - `overlay.locked`: phải đổi cửa sổ sang click xuyên qua (lệnh `set_overlay_locked`);
-/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển.
-const READ_ONLY: &[&str] = &["hotkeys", "overlay.locked", "overlay.positions", "overlay.lastMonitor"];
+/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển;
+/// - `revision`: số thứ tự do `AppState` đặt.
+const READ_ONLY: &[&str] = &[
+    "hotkeys",
+    "overlay.locked",
+    "overlay.positions",
+    "overlay.lastMonitor",
+    "revision",
+];
 
 /// Khóa là object con: bản sửa gửi object con thì ghép theo từng khóa con.
 const NESTED: &[&str] = &["overlay", "experimental"];
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/state.rs b/src-tauri/src/state.rs
index 7c80fd01f0dc5f8a46091e50419f6957ec47662d..9cca06d63496f823db073ab0207985b6d78402d6 100644
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -137,9 +137,12 @@
         self.settings.lock().unwrap().clone()
     }
 
-    /// Thay cài đặt, trả về bản cũ.
-    pub fn replace_settings(&self, next: Settings) -> Settings {
-        std::mem::replace(&mut *self.settings.lock().unwrap(), next)
+    /// Thay cài đặt, trả về bản cũ. `next.revision` được đặt bằng số của bản cũ cộng 1, dưới cùng khóa, nên số thứ tự
+    /// tăng đúng theo thứ tự các lần thay.
+    pub fn replace_settings(&self, next: &mut Settings) -> Settings {
+        let mut current = self.settings.lock().unwrap();
+        next.revision = current.revision + 1;
+        std::mem::replace(&mut *current, next.clone())
     }
 
     pub fn file_meta(&self) -> &FileMeta {
```

Sửa `src/lib/ipc.ts` (áp bằng `git apply`):

```diff
diff --git a/src/lib/ipc.ts b/src/lib/ipc.ts
index a8639279b01713de147cb0cd725e0bf3da473812..d55160be2341cdefc8b2fab197104fbfe8f97aef 100644
--- a/src/lib/ipc.ts
+++ b/src/lib/ipc.ts
@@ -49,11 +49,13 @@
   updateChannel: UpdateChannel;
   experimental: { translationContext: boolean };
   onboardingDone: boolean;
+  // Số thứ tự của bản cài đặt trong lần chạy này của app: bản có số nhỏ hơn bản đang có là cũ, bỏ qua.
+  revision: number;
 }
 
 // Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
-// (dùng `set_overlay_locked`), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi).
-export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental">> & {
+// (dùng `set_overlay_locked`), `overlay.positions`, `overlay.lastMonitor` và `revision` (chỉ phía Rust ghi).
+export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental" | "revision">> & {
   overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
   experimental?: Partial<Settings["experimental"]>;
 };
```

Sửa `src/store/app.ts` (áp bằng `git apply`):

```diff
diff --git a/src/store/app.ts b/src/store/app.ts
index 1dced1c540f30184bd797560a2dfbccc85b7777f..62fec1a05a0e7d4e631039f7abf3ed2e3e381e40 100644
--- a/src/store/app.ts
+++ b/src/store/app.ts
@@ -104,6 +104,14 @@
       set(status.session === "running" ? { status } : { status, level: 0 });
     }
 
+    // Nhận một bản cài đặt mới, từ sự kiện `settings://changed` hay kết quả của một lệnh. Kết quả của lệnh có thể tới sau
+    // một sự kiện mới hơn: bản có `revision` nhỏ hơn bản đang có thì bỏ (bằng nhau thì nhận, vì là cùng một bản).
+    function setSettings(settings: Settings) {
+      const current = get().settings;
+      if (current && settings.revision < current.revision) return;
+      set({ settings });
+    }
+
     return {
       settings: null,
       status: null,
@@ -120,7 +128,7 @@
       // Lỗi ở bất kỳ bước nào thì gỡ các listener đã đăng ký rồi ném lỗi tiếp cho bên gọi (`main.tsx` hiện câu báo).
       async init() {
         const listening = await Promise.allSettled([
-          ipc.listen("settings://changed", (settings) => set({ settings })),
+          ipc.listen("settings://changed", (settings) => setSettings(settings)),
           ipc.listen("app://status", (status) => setStatus(status)),
           ipc.listen("audio://level", (level) => set({ level })),
           ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),
@@ -136,8 +144,11 @@
             ipc.invoke("get_app_status"),
             ipc.invoke("get_app_info"),
           ]);
-          // Cài đặt đã tới qua sự kiện trong lúc chờ `get_settings` thì mới hơn (hoặc bằng) kết quả của lệnh: giữ bản đó.
-          set({ settings: get().settings ?? settings, info });
+          // Cài đặt đã tới qua sự kiện trong lúc chờ `get_settings` thì chỉ thay khi kết quả của lệnh mới hơn hẳn: cùng số
+          // thứ tự là cùng một bản, giữ bản của sự kiện.
+          const current = get().settings;
+          if (!current || settings.revision > current.revision) set({ settings });
+          set({ info });
           setStatus(status);
         } catch (e) {
           off();
@@ -157,7 +168,7 @@
       updateSettings(patch) {
         return run(
           () => ipc.invoke("update_settings", { patch }),
-          (settings) => set({ settings }),
+          (settings) => setSettings(settings),
         );
       },
 
@@ -173,7 +184,7 @@
 
       async setHotkey(action, accelerator) {
         try {
-          set({ settings: await ipc.invoke("set_hotkey", { action, accelerator }) });
+          setSettings(await ipc.invoke("set_hotkey", { action, accelerator }));
           return null;
         } catch (e) {
           return toUiError(e);
@@ -210,7 +221,7 @@
       async setOverlayLocked(locked) {
         await run(
           () => ipc.invoke("set_overlay_locked", { locked }),
-          (settings) => set({ settings }),
+          (settings) => setSettings(settings),
         );
       },
 
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib revision -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_settings_revision_grows_with_every_change ... ok
test app_tests::the_status_revision_grows_with_every_change ... ok
test settings::migrate::tests::the_runtime_revision_is_neither_saved_nor_loaded ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 163 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib read_only -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test settings::patch::tests::rejects_unknown_and_read_only_keys ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 165 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 164 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  6 passed (6)
      Tests  67 passed (67)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/actions.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/overlay/mod.rs \
  src-tauri/src/settings/migrate.rs \
  src-tauri/src/settings/mod.rs \
  src-tauri/src/settings/patch.rs \
  src-tauri/src/state.rs \
  src/lib/ipc.ts \
  src/store/app.test.ts \
  src/store/app.ts
git commit -m "feat(app): số thứ tự revision của cài đặt, giao diện bỏ bản cũ tới muộn (điểm cần quyết 10 của 02a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 3: SQLCipher: DB mã hóa, khóa trong kho khóa

Dòng 155, 273, 314, 318 (`db.rs`); QĐ1–QĐ6. `data.db` mã hóa bằng SQLCipher 4.14, khóa thô 32 byte ngẫu nhiên lưu trong kho khóa (`security::keystore`, mục `db-key`). Schema bản 1: bảng `glossary`, `sessions`, `lines`.

- `DataStore` (quản lý bằng `app.manage`): mở lúc cần ở lần dùng đầu; `with` chạy một việc với kết nối; `wipe` đóng kết nối, xóa file, journal, mọi bản `data.db.unreadable-*` (Q2 của review 03) và mục khóa.
- Mất khóa hay khóa sai: đổi tên file cũ thành `data.db.unreadable-<giây>`, tạo DB mới. Kho khóa lỗi: lỗi `dataUnavailable`, không đụng file. `user_version` lớn hơn bản này: từ chối.
- `test_support` cài `DataStore` trong thư mục tạm riêng của mỗi app giả, với `Keystore::mock`. State của app giả không bao giờ được drop, nên lần đầu dựng app giả trong một tiến trình test thì xóa thư mục `mt-app-data-*` cũ hơn một giờ (`remove_stale_app_dirs`, N8 của review 03).
- Test thêm theo review 03: `PRAGMA secure_delete` là 1 (M06), `set_aside` xóa journal cũ và không ghi đè bản cũ hơn (M07), `cipher_provider` đúng thư viện mật mã của từng hệ điều hành (N7: macOS `commoncrypto`, Windows `openssl` 3.6.3).
- Test `the_sqlite3_tool_cannot_read_the_file` chạy `sqlite3` của hệ thống (macOS có sẵn): "file is not a database" (spec §11, "Bảo mật"). Máy không có `sqlite3` thì test tự bỏ qua.
- `deny.toml`: OpenSSL chỉ được vào qua `libsqlite3-sys`. `scripts/check-windows.sh`: kiểm kiểu cho Windows mà không biên dịch SQLCipher và OpenSSL (ghi chú ở bảng phiên bản).

**Files:**
- Modify: `deny.toml`
- Modify: `scripts/check-windows.sh`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/app_tests.rs`
- Create: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/test_support.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 7570c49c0aade08a1b65ac15b699d8d84c6cdbab..671a04a114b5995d6b62729a606bb0506065cc93 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -561,6 +561,27 @@
     assert!(last_saved(&app, "revision").is_none(), "số thứ tự không vào file");
 }
 
+/// N8 của review 03: thư mục tạm của app giả từ những lần chạy trước (cũ hơn một giờ) được dọn; thư mục mới và thư mục
+/// khác thì giữ.
+#[test]
+fn old_temporary_folders_of_mock_apps_are_removed() {
+    let parent = std::env::temp_dir().join(format!("mt-stale-test-{}", std::process::id()));
+    let _ = std::fs::remove_dir_all(&parent);
+    std::fs::create_dir_all(parent.join("mt-app-data-1-0").join("x")).unwrap();
+    std::fs::create_dir_all(parent.join("mt-app-data-1-1")).unwrap();
+    std::fs::create_dir_all(parent.join("mt-settings-x")).unwrap();
+    let now = std::time::SystemTime::now();
+    assert_eq!(
+        crate::test_support::remove_stale_app_dirs(&parent, now),
+        0,
+        "thư mục mới thì giữ"
+    );
+    let later = now + Duration::from_secs(2 * 3600);
+    assert_eq!(crate::test_support::remove_stale_app_dirs(&parent, later), 2);
+    assert!(parent.join("mt-settings-x").exists(), "chỉ dọn thư mục của app giả");
+    std::fs::remove_dir_all(parent).unwrap();
+}
+
 /// Q8(c) của review 02c: câu hỏi quyền ghi âm thanh hệ thống có bản tiếng Anh (gốc, trong `Info.plist`) và tiếng Việt
 /// (`vi.lproj`), đều nói tên AI Translator, và `tauri.conf.json` chép hai file `InfoPlist.strings` vào gói `.app`.
 #[test]
```

Tạo `src-tauri/src/db.rs`, lúc này mới có phần test:

```rust
//! SQLite mã hóa bằng SQLCipher (spec §6.6, §10.2): từ điển thuật ngữ và lịch sử chép lời. File `data.db` nằm trong thư
//! mục dữ liệu cục bộ của app (`app_local_data_dir`): macOS là `~/Library/Application Support/<bundle-id>/` (cạnh
//! `settings.json`), Windows là `%LOCALAPPDATA%\<bundle-id>\`, không đi theo hồ sơ roaming, cùng chỗ với khóa của nó
//! (kho khóa Windows lưu `persistence = Local`).
//!
//! - **Khóa:** 32 byte ngẫu nhiên (`getrandom`), lưu dạng hex trong kho khóa của hệ điều hành, mục `db-key`. SQLCipher nhận
//!   thẳng khóa thô (`PRAGMA key = "x'…'"`), không qua PBKDF2, nên mở nhanh. Khóa không bao giờ vào log.
//! - **Mở lúc cần:** chỉ mở (và chỉ đọc kho khóa) ở lần đầu một tính năng cần tới DB, nên người dùng Free không bao giờ
//!   chạm tới Keychain vì DB.
//! - **Mất khóa hoặc khóa sai** (kho khóa bị xóa, file chép từ máy khác): không đọc được file nữa. File cũ được đổi tên
//!   thành `data.db.unreadable-<giây Unix>` để bộ phận hỗ trợ còn xem được, rồi app tạo DB mới. **Kho khóa lỗi** (người
//!   dùng từ chối hộp thoại Keychain, Credential Manager không mở được): trả lỗi, không đụng tới file.
//! - **Schema:** `PRAGMA user_version` là số phiên bản; [`MIGRATIONS`] chạy lần lượt trong một transaction. File của bản
//!   app mới hơn (số lớn hơn) thì từ chối mở, không sửa gì.
//! - **Xóa:** [`DataStore::wipe`] đóng kết nối, xóa file (cả journal và các bản `data.db.unreadable-*`) và mục khóa. Hai
//!   nút "Xóa toàn bộ dữ liệu" (kế hoạch 03) và "Xóa model và dữ liệu" (kế hoạch 04) đều gọi hàm này; trạng thái bản quyền
//!   và bộ đếm hạn mức nằm ở mục khác của kho khóa nên không bị xóa (§4.3).
//! - macOS dùng CommonCrypto; Windows dùng OpenSSL build tĩnh từ mã nguồn (`openssl-src`), xem `Cargo.toml`.

#[cfg(test)]
mod tests {
    use super::*;
    use keyring_core::api::CredentialStoreApi;
    use keyring_core::mock::Store as MockStore;
    use std::sync::Arc;

    const SERVICE: &str = "com.aitranslator.desktop.test";

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-db-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn store(dir: &Path, keys: &Arc<MockStore>) -> DataStore {
        DataStore::new(dir.to_path_buf(), Ok(keystore(keys)))
    }

    fn keystore(keys: &Arc<MockStore>) -> Keystore {
        Keystore::with_store(SERVICE, keys.clone())
    }

    fn tables(conn: &Connection) -> Vec<String> {
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(Result::unwrap).collect()
    }

    #[test]
    fn a_new_database_is_encrypted_and_has_the_schema() {
        let dir = temp_dir("new");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        let (names, version) = db
            .with(|c| {
                Ok((
                    tables(c),
                    c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?,
                ))
            })
            .unwrap();
        assert_eq!(names, ["glossary", "lines", "sessions"]);
        assert_eq!(version, SCHEMA_VERSION);
        let secure = db
            .with(|c| Ok::<i64, DbError>(c.query_row("PRAGMA secure_delete", [], |r| r.get(0))?))
            .unwrap();
        assert_eq!(secure, 1, "dữ liệu bị xóa được ghi đè (QĐ5)");
        let header = std::fs::read(db.path()).unwrap();
        assert_ne!(
            &header[..16],
            b"SQLite format 3\0",
            "file không có header SQLite thường"
        );
        let stored = keystore(&keys).get(KEY_NAME).unwrap().unwrap();
        assert_eq!(stored.len(), 64);
        assert!(parse_key(&stored).is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_file_cannot_be_read_without_the_right_key() {
        let dir = temp_dir("nokey");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        db.with(|c| {
            c.execute("INSERT INTO sessions VALUES (1, 0, 0, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        let plain = Connection::open(db.path()).unwrap();
        let err = plain
            .query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))
            .unwrap_err();
        assert_eq!(err.sqlite_error_code(), Some(ErrorCode::NotADatabase));
        let wrong = open_with_key(&db.path(), &[7; KEY_BYTES]).unwrap_err();
        assert!(
            matches!(&wrong, DbError::Sql(e) if e.sqlite_error_code() == Some(ErrorCode::NotADatabase)),
            "{wrong}"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// Spec §11 ("Bảo mật"): mở file lịch sử bằng công cụ SQLite bên ngoài thì không đọc được. Chạy được khi máy có
    /// `sqlite3` (macOS có sẵn ở `/usr/bin/sqlite3`); không có thì bỏ qua.
    #[test]
    fn the_sqlite3_tool_cannot_read_the_file() {
        let Ok(output) = std::process::Command::new("sqlite3").arg("-version").output() else {
            println!("không có sqlite3, bỏ qua");
            return;
        };
        assert!(output.status.success());
        let dir = temp_dir("cli");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        db.with(|c| {
            c.execute(
                "INSERT INTO glossary (source, target, match_key, created_at) VALUES ('API', 'giao diện lập trình', 'api', 0)",
                [],
            )?;
            Ok(())
        })
        .unwrap();
        let output = std::process::Command::new("sqlite3")
            .arg(db.path())
            .arg("SELECT target FROM glossary")
            .output()
            .unwrap();
        let stderr = String::from_utf8_lossy(&output.stderr);
        assert!(!output.status.success());
        assert!(stderr.contains("file is not a database"), "{stderr}");
        assert!(!String::from_utf8_lossy(&output.stdout).contains("giao diện"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reopening_uses_the_same_key() {
        let dir = temp_dir("reopen");
        let keys = MockStore::new().unwrap();
        store(&dir, &keys)
            .with(|c| {
                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
                Ok(())
            })
            .unwrap();
        let count = store(&dir, &keys)
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
            .unwrap();
        assert_eq!(count, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_lost_key_moves_the_old_file_aside() {
        let dir = temp_dir("lost");
        let keys = MockStore::new().unwrap();
        store(&dir, &keys)
            .with(|c| {
                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
                Ok(())
            })
            .unwrap();
        assert!(keystore(&keys).delete(KEY_NAME).unwrap());
        let count = store(&dir, &keys)
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
            .unwrap();
        assert_eq!(count, 0, "DB mới, rỗng");
        let aside: Vec<String> = std::fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.starts_with("data.db.unreadable-"))
            .collect();
        assert_eq!(aside.len(), 1, "file cũ được giữ lại để hỗ trợ xem: {aside:?}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_wrong_key_also_moves_the_old_file_aside() {
        let dir = temp_dir("wrong");
        std::fs::create_dir_all(&dir).unwrap();
        drop(open_with_key(&dir.join(DB_FILE), &[1; KEY_BYTES]).unwrap());
        let keys = MockStore::new().unwrap();
        keystore(&keys)
            .set(KEY_NAME, to_hex(&[2; KEY_BYTES]).as_bytes())
            .unwrap();
        let names = store(&dir, &keys).with(|c| Ok(tables(c))).unwrap();
        assert_eq!(names, ["glossary", "lines", "sessions"]);
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            2,
            "data.db mới và bản cũ đã đổi tên"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keystore_errors_leave_the_file_alone() {
        let dir = temp_dir("denied");
        let keys = MockStore::new().unwrap();
        store(&dir, &keys).with(|_| Ok(())).unwrap();
        let before = std::fs::read(dir.join(DB_FILE)).unwrap();
        let entry = keys.build(SERVICE, KEY_NAME, None).unwrap();
        let cred: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        cred.set_error(keyring_core::Error::NoStorageAccess("người dùng từ chối".into()));
        let err = store(&dir, &keys).with(|_| Ok(())).unwrap_err();
        assert!(matches!(err, DbError::Keystore(_)), "{err}");
        assert_eq!(std::fs::read(dir.join(DB_FILE)).unwrap(), before);
        assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
        let none = DataStore::new(dir.clone(), Err("không có kho khóa".into()));
        assert!(matches!(none.with(|_| Ok(())), Err(DbError::Keystore(_))));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_database_of_a_newer_app_is_refused() {
        let dir = temp_dir("newer");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        let conn = open_with_key(&path, &[3; KEY_BYTES]).unwrap();
        conn.execute_batch(&format!("PRAGMA user_version = {};", SCHEMA_VERSION + 1))
            .unwrap();
        drop(conn);
        let err = open_with_key(&path, &[3; KEY_BYTES]).unwrap_err();
        assert!(matches!(err, DbError::Newer(v) if v == SCHEMA_VERSION + 1), "{err}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn wipe_removes_the_file_and_the_key() {
        let dir = temp_dir("wipe");
        let keys = MockStore::new().unwrap();
        let db = store(&dir, &keys);
        db.with(|c| {
            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
            Ok(())
        })
        .unwrap();
        // Bản đã đổi tên vì mất khóa (`set_aside`) và journal cũng mất: thư mục không còn file nào (Q2 của review 03).
        std::fs::write(dir.join(format!("{DB_FILE}.unreadable-1")), b"cu").unwrap();
        std::fs::write(dir.join(format!("{DB_FILE}.unreadable-1-1")), b"cu hon").unwrap();
        std::fs::write(journal_path(&db.path()), b"journal").unwrap();
        db.wipe().unwrap();
        assert!(!db.path().exists());
        assert_eq!(
            std::fs::read_dir(&dir).unwrap().count(),
            0,
            "không còn file nào của dữ liệu cũ"
        );
        assert_eq!(keystore(&keys).get(KEY_NAME).unwrap(), None);
        let count = db
            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
            .unwrap();
        assert_eq!(count, 0, "lần dùng sau tạo DB mới");
        db.wipe().unwrap();
        db.wipe().unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn set_aside_keeps_older_copies_and_drops_the_journal() {
        let dir = temp_dir("aside");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(DB_FILE);
        std::fs::write(&path, b"lan 1").unwrap();
        std::fs::write(journal_path(&path), b"journal").unwrap();
        let first = set_aside(&path).unwrap();
        assert!(!journal_path(&path).exists(), "journal của file cũ không còn dùng được");
        std::fs::write(&path, b"lan 2").unwrap();
        let second = set_aside(&path).unwrap();
        assert_ne!(first, second, "không ghi đè bản cũ hơn");
        assert_eq!(std::fs::read(&first).unwrap(), b"lan 1");
        assert_eq!(std::fs::read(&second).unwrap(), b"lan 2");
        std::fs::remove_dir_all(dir).unwrap();
    }

    /// N7 của review 03: SQLCipher dùng đúng thư viện mật mã của từng hệ điều hành (QĐ1). Máy build có `OPENSSL_DIR` thì
    /// `libsqlite3-sys` có thể link OpenSSL động cả trên macOS: test này đỏ.
    #[test]
    fn the_cipher_provider_matches_the_platform() {
        let dir = temp_dir("provider");
        std::fs::create_dir_all(&dir).unwrap();
        let conn = open_with_key(&dir.join(DB_FILE), &[4; KEY_BYTES]).unwrap();
        let provider: String = conn.query_row("PRAGMA cipher_provider", [], |r| r.get(0)).unwrap();
        let version: String = conn
            .query_row("PRAGMA cipher_provider_version", [], |r| r.get(0))
            .unwrap();
        if cfg!(target_os = "macos") {
            assert_eq!(provider, "commoncrypto");
        } else if cfg!(windows) {
            assert_eq!(provider, "openssl");
            assert!(version.starts_with("OpenSSL 3.6.3"), "{version}");
        }
        drop(conn);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn keys_are_64_hex_digits() {
        let key = new_key().unwrap();
        assert_eq!(parse_key(to_hex(&key).as_bytes()), Some(key));
        assert_eq!(parse_key(b"zz"), None);
        assert_eq!(parse_key("g".repeat(64).as_bytes()), None);
        assert_eq!(parse_key("+f".repeat(32).as_bytes()), None, "from_str_radix nhận dấu +");
        let multibyte = format!("a{}", "ế".repeat(21));
        assert_eq!(multibyte.len(), 64);
        assert_eq!(
            parse_key(multibyte.as_bytes()),
            None,
            "không cắt giữa một ký tự nhiều byte"
        );
        assert_ne!(new_key().unwrap(), key, "hai khóa ngẫu nhiên khác nhau");
    }
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index eefd817d4c54b7f3820fd39cebe0f1f83d26cfc6..0d3cb3b6861f5cb15d714b86db88a1014aa045c2 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -161,6 +161,7 @@
                 VAD_FAILED,
                 QUOTA_EXHAUSTED,
                 PRO_REQUIRED,
+                DATA_UNAVAILABLE,
                 UNKNOWN,
             ]
             .map(String::from),
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index a76dcd687a73f5e819088e4c374ffc8ec215eaf3..0d3dec655914efaceb69a834902465d61325625e 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -9,6 +9,7 @@
 pub mod actions;
 pub mod capture;
 pub mod commands;
+pub mod db;
 pub mod errors;
 pub mod events;
 pub mod hotkey_registry;
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 9055e19a4f7e0dfc40c7ed1610169209446248e1..efde5a95498c646ced643410faf307b8c47a836d 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -3,9 +3,9 @@
 //! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.
 
 use std::ops::ControlFlow;
-use std::sync::atomic::{AtomicBool, Ordering};
+use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
 use std::sync::{Arc, Condvar, Mutex};
-use std::time::Duration;
+use std::time::{Duration, SystemTime};
 
 use asr_protocol::{TranscribeRequest, TranscribeResult};
 use pipeline::engine::{EnergyVad, FrameSource, VadFactory};
@@ -20,10 +20,12 @@
 
 use crate::capture::OnEvent;
 use crate::commands;
+use crate::db::DataStore;
 use crate::errors::{self, CommandError};
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
 use crate::overlay::{OverlaySurface, Surface};
 use crate::pro::{Entitlement, ProGate};
+use crate::security::keystore::Keystore;
 use crate::session::{Session, SessionDeps};
 use crate::settings::migrate::FileMeta;
 use crate::settings::persist::{SettingsFile, Writer};
@@ -371,6 +373,18 @@
     let login = FakeLoginItem::default();
     let file = FakeSettingsFile::default();
     let pro = FakePro(Arc::new(AtomicBool::new(true)));
+    // Mỗi app giả một thư mục DB riêng trong thư mục tạm, kho khóa trong bộ nhớ.
+    static APPS: AtomicUsize = AtomicUsize::new(0);
+    static CLEAN: std::sync::Once = std::sync::Once::new();
+    CLEAN.call_once(|| {
+        remove_stale_app_dirs(&std::env::temp_dir(), SystemTime::now());
+    });
+    let data_dir = std::env::temp_dir().join(format!(
+        "{APP_DIR_PREFIX}{}-{}",
+        std::process::id(),
+        APPS.fetch_add(1, Ordering::SeqCst)
+    ));
+    let _ = std::fs::remove_dir_all(&data_dir);
     let app = builder
         .manage(AppState::new(
             Settings::defaults(UiLanguage::Vi),
@@ -386,6 +400,10 @@
         .manage(Writer(Box::new(file.clone())))
         .manage(file)
         .manage(Entitlement(Box::new(pro.clone())))
+        .manage(DataStore::new(
+            data_dir,
+            Ok(Keystore::mock("com.aitranslator.desktop.test")),
+        ))
         .manage(pro)
         .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
@@ -393,6 +411,34 @@
         .expect("dựng được app giả");
     crate::pro::refresh(app.handle());
     app
+}
+
+const APP_DIR_PREFIX: &str = "mt-app-data-";
+
+/// Thư mục tạm của app giả (DB, file xuất) không xóa được lúc app giả bị hủy: state của app giả không bao giờ được drop
+/// (app giữ `AppHandle` trong chính state của nó), và tiến trình test thoát mà không chạy `Drop` của biến `static`. Nên lần
+/// đầu dựng app giả trong một tiến trình test thì xóa thư mục của những lần chạy trước, cũ hơn một giờ tính tới `now` (để
+/// không đụng thư mục của một lần `cargo test` khác đang chạy cùng lúc). Trả số thư mục đã xóa (N8 của review 03).
+pub fn remove_stale_app_dirs(parent: &std::path::Path, now: SystemTime) -> usize {
+    let Ok(entries) = std::fs::read_dir(parent) else {
+        return 0;
+    };
+    let mut removed = 0;
+    for entry in entries.flatten() {
+        let old = entry
+            .metadata()
+            .and_then(|m| m.modified())
+            .ok()
+            .and_then(|t| now.duration_since(t).ok())
+            .is_some_and(|age| age >= Duration::from_secs(3600));
+        if old
+            && entry.file_name().to_string_lossy().starts_with(APP_DIR_PREFIX)
+            && std::fs::remove_dir_all(entry.path()).is_ok()
+        {
+            removed += 1;
+        }
+    }
+    removed
 }
 
 /// Đổi gói của app giả: `true` là Pro, `false` là Free.
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib db:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `db.rs`, chưa có `rusqlite`):
```text
error: could not compile `meeting-translator` (lib test) due to 60 previous errors; 1 warning emitted
error[E0425]: cannot find function `journal_path` in this scope
error[E0425]: cannot find function `new_key` in this scope
error[E0425]: cannot find function `open_with_key` in this scope
error[E0425]: cannot find function `parse_key` in this scope
error[E0425]: cannot find function `set_aside` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `deny.toml` (áp bằng `git apply`):

```diff
diff --git a/deny.toml b/deny.toml
index ee53a66fcd7e41524d7517a4c6788583545e11b4..16d036329820242022722da53296843009abd725 100644
--- a/deny.toml
+++ b/deny.toml
@@ -45,6 +45,10 @@
 deny = [
     { crate = "whisper-rs-sys", wrappers = ["whisper-rs", "asr-worker"], reason = "ggml chỉ được vào qua whisper-rs, hoặc asr-worker đọc bảng thiết bị ggml" },
     { crate = "whisper-rs", wrappers = ["asr-worker"], reason = "chỉ asr-worker được link whisper.cpp" },
+    # Một thư viện mật mã C duy nhất trong tiến trình chính (§6.12, mục 6.4 của kế hoạch 00): OpenSSL chỉ vào qua
+    # SQLCipher trên Windows (kế hoạch 03), build tĩnh từ mã nguồn.
+    { crate = "openssl-sys", wrappers = ["libsqlite3-sys"], reason = "OpenSSL chỉ dành cho SQLCipher trên Windows" },
+    { crate = "openssl-src", wrappers = ["openssl-sys"], reason = "OpenSSL chỉ build kèm cho SQLCipher" },
 ]
 
 [sources]
```

Sửa `scripts/check-windows.sh` (áp bằng `git apply`):

```diff
diff --git a/scripts/check-windows.sh b/scripts/check-windows.sh
index f450c49eff0c4df9cd784497874fe1fc981320dd..e6896a625b2eb6c89e23e5423e8445b2bd9369f8 100755
--- a/scripts/check-windows.sh
+++ b/scripts/check-windows.sh
@@ -10,5 +10,19 @@
 export RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc"
 # onig_sys (candle-core → tokenizers) muốn biên dịch thư viện C oniguruma cho Windows (xem fake-pkg-config).
 export PKG_CONFIG_x86_64_pc_windows_msvc="$here/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1
+# rusqlite trên Windows (bundled-sqlcipher-vendored-openssl) muốn biên dịch SQLCipher và OpenSSL bằng công cụ của MSVC,
+# mà Mac không có. Kiểm kiểu thì không cần thư viện thật:
+# - libsqlite3-sys: LIBSQLITE3_SYS_USE_PKG_CONFIG=1 và SQLCIPHER_LIB_DIR thì chỉ in lệnh link, dùng binding có sẵn;
+# - openssl-sys: OPENSSL_NO_VENDOR=1 thì không build OpenSSL từ mã nguồn, mà đọc phiên bản trong header của OPENSSL_DIR
+#   (header giả ghi 3.6.3, đúng bản `openssl-src` khóa trong Cargo.lock), tiền xử lý bằng clang của Xcode;
+#   OPENSSL_STATIC=1 để nó không đi tìm file thư viện.
+# `cargo clippy` không link, nên thư viện giả không bao giờ được dùng.
+fake_ssl="${TMPDIR:-/tmp}/meeting-translator-fake-openssl"
+mkdir -p "$fake_ssl/include/openssl" "$fake_ssl/lib"
+printf '#define OPENSSL_VERSION_MAJOR 3\n#define OPENSSL_VERSION_MINOR 6\n#define OPENSSL_VERSION_PATCH 3\n' \
+  > "$fake_ssl/include/openssl/opensslv.h"
+: > "$fake_ssl/include/openssl/opensslconf.h"
+export OPENSSL_NO_VENDOR=1 OPENSSL_DIR="$fake_ssl" OPENSSL_STATIC=1 CC_x86_64_pc_windows_msvc=clang
+export LIBSQLITE3_SYS_USE_PKG_CONFIG=1 SQLCIPHER_LIB_DIR="$fake_ssl/lib"
 cargo clippy -p meeting-translator -p pipeline -p audio-capture --target x86_64-pc-windows-msvc --all-targets "$@" \
   -- -D warnings
```

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 7771c4f24f8a6c5249a79cb738778e592587c209..92a8ddbee7ba88adaf6f7b07e1a569ab5286aeb2 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -17,10 +17,15 @@
 [dependencies]
 anyhow.workspace = true
 audio-capture = { path = "../crates/audio-capture" }
+# Khóa ngẫu nhiên của DB (db.rs). Cùng bản `Cargo.lock` đã có (qua `tempfile`).
+getrandom = "0.4.3"
 keyring-core = "1.0.0"
 log = "0.4.34"
 pipeline = { path = "../crates/pipeline" }
 rtrb.workspace = true
+# SQLite mã hóa bằng SQLCipher (spec §6.6, §10.2): SQLCipher 4.14 (SQLite 3.51.3) build kèm. macOS dùng CommonCrypto của
+# hệ thống; Windows thêm OpenSSL build tĩnh từ mã nguồn (bên dưới). Không bật `cache` mặc định (không cần `hashlink`).
+rusqlite = { version = "0.40.2", default-features = false, features = ["bundled-sqlcipher"] }
 serde.workspace = true
 serde_json.workspace = true
 sha2 = "0.11.0"
@@ -48,6 +53,9 @@
     "Win32_UI_WindowsAndMessaging",
 ] }
 windows-native-keyring-store = "1.1.0"
+# Windows không có CommonCrypto: SQLCipher dùng OpenSSL 3.6 (`openssl-src` 300.6, Apache-2.0) link tĩnh, nên không có DLL
+# OpenSSL nào trong thư mục cài đặt. Build cần Perl (Strawberry Perl); có `nasm` thì bật mã assembly, không thì `no-asm`.
+rusqlite = { version = "0.40.2", default-features = false, features = ["bundled-sqlcipher-vendored-openssl"] }
 
 [dev-dependencies]
 # Kiểu `TranscribeRequest`/`TranscribeResult` cho `asr-worker` giả trong `test_support.rs`.
```

Thêm vào `src-tauri/src/db.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, ErrorCode};
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::security::keystore::Keystore;

pub const DB_FILE: &str = "data.db";
/// Tên mục trong kho khóa (dưới service là bundle identifier, `keystore.rs`).
pub const KEY_NAME: &str = "db-key";
const KEY_BYTES: usize = 32;

/// `MIGRATIONS[i]` nâng DB từ phiên bản `i` lên `i + 1`. Thêm bước mới ở cuối, không sửa bước cũ.
pub const MIGRATIONS: &[&str] = &[
    // 0 → 1: từ điển thuật ngữ (F5) và lịch sử chép lời (F4).
    "CREATE TABLE glossary (
        id INTEGER PRIMARY KEY,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        -- Khóa so trùng: NFC, chữ thường (`pipeline::glossary::normalize`).
        match_key TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
        id INTEGER PRIMARY KEY,
        -- Giờ Unix, ms.
        started_at INTEGER NOT NULL,
        ended_at INTEGER NOT NULL,
        target_lang TEXT NOT NULL
    );
    CREATE TABLE lines (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        start_ms INTEGER NOT NULL,
        end_ms INTEGER NOT NULL,
        src_lang TEXT NOT NULL,
        src_text TEXT NOT NULL,
        tgt_text TEXT NOT NULL,
        status TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
    ) WITHOUT ROWID;",
];

pub const SCHEMA_VERSION: i64 = MIGRATIONS.len() as i64;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("không dùng được kho khóa: {0}")]
    Keystore(String),
    #[error("lỗi SQLite: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("lỗi file: {0}")]
    Io(#[from] std::io::Error),
    #[error("dữ liệu do bản app mới hơn ghi (schema {0})")]
    Newer(i64),
    #[error("không tạo được khóa ngẫu nhiên: {0}")]
    Random(String),
}

impl From<DbError> for CommandError {
    fn from(e: DbError) -> Self {
        CommandError::new(errors::DATA_UNAVAILABLE, None, e.to_string())
    }
}

/// Cài `DataStore` của app: file trong thư mục dữ liệu cục bộ của app, khóa trong kho khóa của hệ điều hành. Chưa mở gì
/// ở đây. Gọi một lần ở `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let dir = app.path().app_local_data_dir()?;
    let keystore = Keystore::os(&app.config().identifier).map_err(|e| e.to_string());
    app.manage(DataStore::new(dir, keystore));
    Ok(())
}

/// Chạy `f` với DB của app. Chưa cài `DataStore` thì lỗi `dataUnavailable`.
pub fn with<R: Runtime, T>(
    app: &AppHandle<R>,
    f: impl FnOnce(&mut Connection) -> Result<T, DbError>,
) -> Result<T, CommandError> {
    let store = app
        .try_state::<DataStore>()
        .ok_or_else(|| CommandError::new(errors::DATA_UNAVAILABLE, None, "chưa cài DataStore"))?;
    store.with(f).map_err(|e| {
        log::error!("DB lỗi: {e}");
        CommandError::from(e)
    })
}

/// DB của app, mở lúc cần. Quản lý bằng `app.manage`.
pub struct DataStore {
    dir: PathBuf,
    keystore: Result<Keystore, String>,
    conn: Mutex<Option<Connection>>,
}

impl DataStore {
    /// `dir`: thư mục dữ liệu của app. `keystore`: kho khóa của hệ điều hành (test dùng `Keystore::mock`); `Err` khi không
    /// tạo được kho khóa, khi đó mọi lần dùng DB đều báo lỗi.
    pub fn new(dir: PathBuf, keystore: Result<Keystore, String>) -> Self {
        Self {
            dir,
            keystore,
            conn: Mutex::new(None),
        }
    }

    pub fn path(&self) -> PathBuf {
        self.dir.join(DB_FILE)
    }

    /// Chạy `f` với kết nối, mở DB nếu chưa mở. Các lần gọi chạy lần lượt (một kết nối, giữ khóa trong lúc chạy).
    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, DbError>) -> Result<T, DbError> {
        let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if slot.is_none() {
            *slot = Some(self.open()?);
        }
        f(slot.as_mut().expect("vừa mở"))
    }

    /// Xóa hẳn dữ liệu: đóng kết nối, xóa file DB (cả file journal) và mục khóa. Lần dùng sau tạo DB mới với khóa mới.
    pub fn wipe(&self) -> Result<(), DbError> {
        let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(conn) = slot.take() {
            conn.close().map_err(|(_, e)| e)?;
        }
        // Cả các bản đã đổi tên vì không đọc được (`set_aside`): chúng vẫn chứa dữ liệu đã mã hóa, đọc lại được nếu khóa cũ
        // xuất hiện lại (Keychain khôi phục từ bản sao lưu). "Xóa toàn bộ dữ liệu" thì không để lại gì (Q2 của review 03).
        let mut paths = vec![self.path(), journal_path(&self.path())];
        if let Ok(entries) = std::fs::read_dir(&self.dir) {
            let prefix = format!("{DB_FILE}.unreadable-");
            paths.extend(
                entries
                    .flatten()
                    .filter(|e| e.file_name().to_string_lossy().starts_with(&prefix))
                    .map(|e| e.path()),
            );
        }
        for path in paths {
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.into()),
            }
        }
        self.keystore()?
            .delete(KEY_NAME)
            .map_err(|e| DbError::Keystore(e.to_string()))?;
        Ok(())
    }

    fn keystore(&self) -> Result<&Keystore, DbError> {
        self.keystore.as_ref().map_err(|e| DbError::Keystore(e.clone()))
    }

    fn open(&self) -> Result<Connection, DbError> {
        let keystore = self.keystore()?;
        let stored = keystore.get(KEY_NAME).map_err(|e| DbError::Keystore(e.to_string()))?;
        let path = self.path();
        // Không có khóa mà file đã có thì khóa mới không mở được file: nhánh `NotADatabase` bên dưới đổi tên file cũ.
        let key = match stored.as_deref().and_then(parse_key) {
            Some(key) => key,
            None => {
                let key = new_key()?;
                keystore
                    .set(KEY_NAME, to_hex(&key).as_bytes())
                    .map_err(|e| DbError::Keystore(e.to_string()))?;
                key
            }
        };
        std::fs::create_dir_all(&self.dir)?;
        match open_with_key(&path, &key) {
            Err(DbError::Sql(e)) if e.sqlite_error_code() == Some(ErrorCode::NotADatabase) => {
                log::warn!("khóa không mở được {}: tạo DB mới", path.display());
                set_aside(&path)?;
                open_with_key(&path, &key)
            }
            other => other,
        }
    }
}

/// Mở (hoặc tạo) file `path` bằng khóa thô `key`, kiểm khóa ngay, rồi nâng schema.
pub fn open_with_key(path: &Path, key: &[u8; KEY_BYTES]) -> Result<Connection, DbError> {
    let conn = Connection::open(path)?;
    // Chuỗi hex chỉ có [0-9a-f], nên ghép thẳng vào câu lệnh được.
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", to_hex(key)))?;
    // Sai khóa thì câu lệnh đầu tiên đọc file trả `NotADatabase`.
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))?;
    // Dữ liệu bị xóa được ghi đè bằng số 0, không còn nằm lại trong các trang trống của file. Khóa ngoại (xóa phiên thì
    // xóa các câu) đã bật sẵn: SQLCipher build kèm với `SQLITE_DEFAULT_FOREIGN_KEYS=1` (libsqlite3-sys).
    conn.execute_batch("PRAGMA secure_delete = ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), DbError> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version > SCHEMA_VERSION {
        return Err(DbError::Newer(version));
    }
    for (i, step) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        // Mỗi bước một transaction: lỗi giữa chừng thì không còn nửa schema.
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(step)?;
        tx.pragma_update(None, "user_version", i as i64 + 1)?;
        tx.commit()?;
    }
    Ok(())
}

/// Đổi tên file không đọc được (và file journal của nó) thành `<tên>.unreadable-<giây Unix>`, không ghi đè bản cũ hơn.
fn set_aside(path: &Path) -> Result<PathBuf, DbError> {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    let target = (0..)
        .map(|n| {
            let mut name = path.as_os_str().to_owned();
            name.push(format!(".unreadable-{now}"));
            if n > 0 {
                name.push(format!("-{n}"));
            }
            PathBuf::from(name)
        })
        .find(|candidate| !candidate.exists())
        .expect("dãy vô hạn");
    std::fs::rename(path, &target)?;
    let journal = journal_path(path);
    if journal.exists() {
        std::fs::remove_file(journal)?;
    }
    log::warn!("đã đổi tên DB không đọc được thành {}", target.display());
    Ok(target)
}

fn journal_path(path: &Path) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push("-journal");
    PathBuf::from(name)
}

fn new_key() -> Result<[u8; KEY_BYTES], DbError> {
    let mut key = [0u8; KEY_BYTES];
    getrandom::fill(&mut key).map_err(|e| DbError::Random(e.to_string()))?;
    Ok(key)
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Khóa trong kho khóa: đúng 64 chữ số hex. Giá trị khác coi như không có khóa.
fn parse_key(stored: &[u8]) -> Option<[u8; KEY_BYTES]> {
    let text = std::str::from_utf8(stored).ok()?;
    if text.len() != KEY_BYTES * 2 || !text.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let mut key = [0u8; KEY_BYTES];
    for (i, byte) in key.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[2 * i..2 * i + 2], 16).ok()?;
    }
    Some(key)
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 0d3cb3b6861f5cb15d714b86db88a1014aa045c2..52df62e462fde8fb2701f8c37a2e80577729487a 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -54,6 +54,8 @@
 // Mã lỗi của kế hoạch 03.
 /// Tính năng Pro (lịch sử, xuất file, từ điển thuật ngữ) khi đang ở gói Free (`pro::require`).
 pub const PRO_REQUIRED: &str = "proRequired";
+/// Không mở được DB của lịch sử và từ điển (kho khóa bị từ chối, file lỗi, file của bản app mới hơn).
+pub const DATA_UNAVAILABLE: &str = "dataUnavailable";
 /// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
 pub const UNKNOWN: &str = "unknown";
 
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 0d3dec655914efaceb69a834902465d61325625e..f82d4e5d094bf0d0700efc94b22168091467713d 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -118,6 +118,8 @@
     app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
     // Điểm kiểm tra Pro duy nhất (Đ6): bản debug luôn Pro, bản release là Free; kế hoạch 06 cài trạng thái bản quyền.
     pro::install_default_gate(&handle);
+    // DB mã hóa của lịch sử và từ điển: chưa mở, chưa đọc kho khóa ở đây (db.rs).
+    db::install(&handle)?;
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 583c8cec6799344eba85b0329c4940f2f6f6ec6e..eb020a83d726dab5eba5c6bb86c55c635cf371b8 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -167,6 +167,7 @@
   "error.modelBroken": "The model is damaged. Please download it again.",
   "error.quotaExhausted": "The translation quota has been used up.",
   "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
+  "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 492d7f866eff6e1f92edf84e51f58cc3a7632e3a..45c715e9b7a102e84623e091be520942b2d87e69 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -167,5 +167,6 @@
   "error.modelBroken": "Model bị hỏng. Hãy tải lại model.",
   "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
   "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
+  "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Khóa đúng bản đã thử (bảng "Phiên bản đã chốt"); lệnh in các bản trong `Cargo.lock`:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && cargo update -q -p rusqlite --precise 0.40.2 && cargo update -q -p openssl-src --precise 300.6.1+3.6.3 && grep -A1 -E '^name = "(rusqlite|libsqlite3-sys|openssl-sys|openssl-src)"' Cargo.lock
```
Expected (lúc lập kế hoạch):
```text
name = "libsqlite3-sys"
version = "0.38.2"
--
name = "openssl-src"
version = "300.6.1+3.6.3"
--
name = "openssl-sys"
version = "0.9.117"
--
name = "rusqlite"
version = "0.40.2"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib db:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test db::tests::a_database_of_a_newer_app_is_refused ... ok
test db::tests::a_lost_key_moves_the_old_file_aside ... ok
test db::tests::a_new_database_is_encrypted_and_has_the_schema ... ok
test db::tests::a_wrong_key_also_moves_the_old_file_aside ... ok
test db::tests::keys_are_64_hex_digits ... ok
test db::tests::keystore_errors_leave_the_file_alone ... ok
test db::tests::reopening_uses_the_same_key ... ok
test db::tests::set_aside_keeps_older_copies_and_drops_the_journal ... ok
test db::tests::the_cipher_provider_matches_the_platform ... ok
test db::tests::the_file_cannot_be_read_without_the_right_key ... ok
test db::tests::the_sqlite3_tool_cannot_read_the_file ... ok
test db::tests::wipe_removes_the_file_and_the_key ... ok
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 167 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib old_temporary -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::old_temporary_folders_of_mock_apps_are_removed ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 178 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 177 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  6 passed (6)
      Tests  67 passed (67)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  deny.toml \
  scripts/check-windows.sh \
  src-tauri/Cargo.toml \
  src-tauri/src/app_tests.rs \
  src-tauri/src/db.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/test_support.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): SQLite mã hóa bằng SQLCipher, khóa ngẫu nhiên trong kho khóa (§6.6, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 4: Khớp thuật ngữ và mẫu "terminology" trong `pipeline`

Dòng 140, 269, 286; QĐ9–QĐ13. Logic khớp thuật ngữ nằm trong crate `pipeline` (Rust, test không cần Tauri):

- `glossary.rs`: `normalize` (NFC, chữ thường), `Glossary::matches` theo QĐ10, tối đa 20 mục mỗi câu; `SharedGlossary` cho luồng dịch.
- `prompt::terminology_prompt`: mẫu nguyên văn của model card (QĐ11).
- `translate::Job.terms`: có thuật ngữ thì dùng mẫu "terminology" và bỏ ngữ cảnh. `EngineConfig.glossary`: luồng dịch đọc bản mới nhất ở mỗi câu.
- Mọi chỗ dựng `Job` và `EngineConfig` (`latency-bench mt-eval`, test tích hợp, app) thêm trường mới: `mt-eval` truyền từ điển rỗng, nên prompt của A3 không đổi (QĐ13).
- `tests/real_terms.rs`: test `#[ignore]` với model thật (Step 5), kết quả ở bảng "Thuật ngữ với model thật".

**Files:**
- Modify: `crates/latency-bench/src/mt_eval.rs`
- Modify: `crates/pipeline/Cargo.toml`
- Modify: `crates/pipeline/src/engine.rs`
- Create: `crates/pipeline/src/glossary.rs`
- Modify: `crates/pipeline/src/lib.rs`
- Modify: `crates/pipeline/src/prompt.rs`
- Modify: `crates/pipeline/src/translate.rs`
- Modify: `crates/pipeline/tests/engine.rs`
- Modify: `crates/pipeline/tests/lifecycle.rs`
- Modify: `crates/pipeline/tests/real_sidecars.rs`
- Create: `crates/pipeline/tests/real_terms.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `crates/pipeline/src/engine.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/engine.rs b/crates/pipeline/src/engine.rs
index 88c6856abe3b75e2c0d9bf4cfec72c2320043852..1590688089782ae35b40ffb5200c1ad7c1aa77e1 100644
--- a/crates/pipeline/src/engine.rs
+++ b/crates/pipeline/src/engine.rs
@@ -1429,6 +1429,106 @@
         assert_eq!(out.len(), 1_000);
     }
 
+    /// Luồng dịch đưa thuật ngữ có trong câu vào prompt theo mẫu "terminology" (§6.5); sửa từ điển giữa phiên thì câu sau
+    /// dùng ngay bản mới; câu không có thuật ngữ nào giữ prompt mặc định.
+    #[test]
+    fn the_translation_thread_puts_matching_terms_into_the_prompt() {
+        use crate::glossary::{Glossary, Term};
+        use crate::prompt::terminology_prompt;
+        use std::sync::RwLock;
+
+        struct Recording(Arc<Mutex<Vec<String>>>);
+        impl Mt for Recording {
+            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
+                Ok(text.split_whitespace().count())
+            }
+            fn stream(
+                &mut self,
+                req: &ChatRequest,
+                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
+            ) -> Result<StreamEnd, MtError> {
+                self.0.lock().unwrap().push(req.prompt.to_string());
+                let _ = on_delta("Xong");
+                Ok(StreamEnd {
+                    text: "Xong".into(),
+                    finish_reason: Some("stop".into()),
+                    chunks: 1,
+                    ..StreamEnd::default()
+                })
+            }
+        }
+        let term = |source: &str, target: &str| Term {
+            source: source.into(),
+            target: target.into(),
+        };
+        let prompts = Arc::new(Mutex::new(Vec::new()));
+        let glossary: SharedGlossary = Arc::new(RwLock::new(Glossary::new([term("sprint", "đợt chạy")])));
+        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
+        let (tx, rx) = mpsc::channel::<Msg>();
+        let thread = {
+            let (mt, glossary) = (Box::new(Recording(prompts.clone())), glossary.clone());
+            std::thread::spawn(move || {
+                mt_loop(
+                    mt,
+                    jobs_rx,
+                    &tx,
+                    &MtConfig::default(),
+                    Lang::Vi,
+                    &AtomicBool::new(false),
+                    &glossary,
+                )
+            })
+        };
+        let translate_one = |sub_id: u64, text: &str| {
+            let cancel = Arc::new(AtomicBool::new(false));
+            jobs_tx
+                .send(MtJob {
+                    sub_id,
+                    version: 0,
+                    src: Lang::En,
+                    text: text.into(),
+                    context: None,
+                    cancel,
+                })
+                .unwrap();
+            loop {
+                if let Msg::MtDone { sub_id: done, .. } = rx.recv().unwrap()
+                    && done == sub_id
+                {
+                    break;
+                }
+            }
+        };
+        translate_one(1, "The sprint starts today");
+        *glossary.write().unwrap() = Glossary::new([term("sprint", "đợt chạy"), term("demo", "buổi trình diễn")]);
+        translate_one(2, "A demo after the sprint");
+        translate_one(3, "Nothing to look up");
+        drop(jobs_tx);
+        thread.join().unwrap();
+        let prompts = prompts.lock().unwrap();
+        assert_eq!(prompts.len(), 4, "làm nóng rồi ba câu");
+        assert_eq!(
+            prompts[1],
+            terminology_prompt(
+                "The sprint starts today",
+                &[term("sprint", "đợt chạy")],
+                Lang::En,
+                Lang::Vi
+            )
+        );
+        assert_eq!(
+            prompts[2],
+            terminology_prompt(
+                "A demo after the sprint",
+                &[term("sprint", "đợt chạy"), term("demo", "buổi trình diễn")],
+                Lang::En,
+                Lang::Vi
+            ),
+            "từ điển mới; mục dài hơn trước"
+        );
+        assert_eq!(prompts[3], translation_prompt("Nothing to look up", Lang::En, Lang::Vi));
+    }
+
     // ---- Luồng phụ đề, nạp thẳng tin nhắn (Q2 của review 02b): tất định, không luồng, không tiến trình phụ. ----
 
     #[derive(Default)]
@@ -1494,6 +1594,7 @@
             target: Lang::Vi,
             translation_context: false,
             id_base: 0,
+            glossary: SharedGlossary::default(),
         }
     }
 
```

Tạo `crates/pipeline/src/glossary.rs`, lúc này mới có phần test:

```rust
//! Từ điển thuật ngữ khi dịch (spec §6.5 "Thuật ngữ", F5): chỉ những mục **có trong câu** mới vào prompt, tối đa 20 mục
//! mỗi câu, theo mẫu "terminology" của Hy-MT2 (`prompt::terminology_prompt`).
//!
//! So khớp:
//! - Cả câu lẫn thuật ngữ được chuẩn hóa bằng [`normalize`]: Unicode NFC rồi chữ thường, nên "Đà Nẵng" gõ dựng sẵn
//!   (NFC) khớp với chữ chép lời tổ hợp (NFD), và "api" khớp "API".
//! - Chữ Latin (và mọi chữ không phải Trung, Nhật, Hàn) khớp theo ranh giới từ: ở mỗi đầu của thuật ngữ, nếu ký tự ở đầu
//!   đó là chữ hay số thì ký tự kề bên trong câu không được là chữ hay số. Nên "AI" không khớp trong "said", nhưng khớp
//!   trong "AI's" và "使用AI模型".
//! - Chữ Trung, Nhật, Hàn khớp theo chuỗi con (không có khoảng trắng giữa từ; tiếng Hàn có trợ từ dính liền như
//!   "회의를"). Ranh giới chỉ xét theo ký tự ở từng đầu của thuật ngữ, nên thuật ngữ trộn như "AI模型" vẫn đúng luật.
//! - Câu khớp quá 20 mục thì lấy mục dài hơn trước (cụ thể hơn), cùng độ dài thì theo thứ tự trong từ điển.
//!
//! App giữ một [`SharedGlossary`] cho mọi phiên: sửa từ điển giữa phiên thì câu dịch sau dùng ngay bản mới; gói Free thì
//! app đặt từ điển rỗng (kế hoạch 03, `pro.rs`).

#[cfg(test)]
mod tests {
    use super::*;

    fn term(source: &str, target: &str) -> Term {
        Term {
            source: source.into(),
            target: target.into(),
        }
    }

    fn sources(g: &Glossary, text: &str) -> Vec<String> {
        g.matches(text).into_iter().map(|t| t.source).collect()
    }

    #[test]
    fn latin_terms_match_whole_words_only_and_ignore_case() {
        let g = Glossary::new([term("AI", "trí tuệ nhân tạo"), term("sprint", "đợt chạy")]);
        assert_eq!(sources(&g, "Our ai team said hello."), ["AI"]);
        assert!(
            sources(&g, "She said it was fair.").is_empty(),
            "\"ai\" trong \"said\", \"fair\""
        );
        assert_eq!(sources(&g, "The AI's answer, then the Sprint."), ["sprint", "AI"]);
        assert!(sources(&g, "sprints are long").is_empty());
        assert_eq!(sources(&g, "AI"), ["AI"], "cả câu là thuật ngữ");
    }

    #[test]
    fn vietnamese_with_diacritics_matches_in_any_unicode_form() {
        let g = Glossary::new([term("Đà Nẵng", "Da Nang"), term("họp", "meeting")]);
        // Chữ chép lời ở dạng tổ hợp (NFD): "Đà Nẵng" sau khi tách dấu.
        let nfd: String = "Chúng ta gặp ở ĐÀ NẴNG".nfd().collect();
        assert_ne!(nfd, "Chúng ta gặp ở ĐÀ NẴNG");
        assert_eq!(sources(&g, &nfd), ["Đà Nẵng"]);
        assert_eq!(sources(&g, "Cuộc họp bắt đầu"), ["họp"]);
        assert!(sources(&g, "Cuộc hợp tác").is_empty(), "\"hợp\" khác \"họp\" ở dấu");
        assert!(sources(&g, "hopp").is_empty());
    }

    #[test]
    fn chinese_japanese_korean_terms_match_as_substrings() {
        let g = Glossary::new([
            term("模型", "mô hình"),
            term("会議", "cuộc họp"),
            term("회의", "cuộc họp"),
            term("AI模型", "mô hình AI"),
        ]);
        assert_eq!(sources(&g, "我们需要训练这个模型。"), ["模型"]);
        assert_eq!(sources(&g, "明日の会議は十時からです"), ["会議"]);
        assert_eq!(sources(&g, "내일 회의를 시작합니다"), ["회의"], "trợ từ dính liền");
        assert_eq!(sources(&g, "使用AI模型"), ["AI模型", "模型"]);
        assert!(sources(&g, "使用 MAI模型").contains(&"模型".to_string()));
        assert!(
            !sources(&g, "使用 MAI模型").contains(&"AI模型".to_string()),
            "đầu Latin của AI模型 vẫn xét ranh giới"
        );
    }

    #[test]
    fn latin_terms_next_to_cjk_text_still_match() {
        let g = Glossary::new([term("API", "giao diện lập trình")]);
        assert_eq!(sources(&g, "这个API很好"), ["API"]);
        assert_eq!(sources(&g, "APIを使います"), ["API"]);
    }

    #[test]
    fn edges_that_are_not_letters_need_no_boundary() {
        let g = Glossary::new([term("C++", "C++"), term(".NET", "dot net")]);
        assert_eq!(sources(&g, "We use C++ and ASP.NET"), [".NET", "C++"]);
        assert_eq!(
            sources(&g, "We use C++11"),
            ["C++"],
            "đầu phải là dấu +: không xét ranh giới ở đầu đó"
        );
    }

    #[test]
    fn at_most_twenty_terms_longest_first() {
        let words: Vec<String> = (0..30).map(|i| format!("w{i:02}")).collect();
        let mut terms: Vec<Term> = words.iter().map(|w| term(w, "x")).collect();
        terms.push(term("w05 w06", "cụm"));
        let g = Glossary::new(terms);
        let text = words.join(" ");
        let found = sources(&g, &text);
        assert_eq!(found.len(), MAX_TERMS_PER_SENTENCE);
        assert_eq!(found[0], "w05 w06", "mục dài hơn trước");
        assert_eq!(
            found[1..4],
            ["w00", "w01", "w02"],
            "cùng độ dài thì theo thứ tự từ điển"
        );
    }

    #[test]
    fn duplicates_and_empty_sources_are_dropped() {
        let g = Glossary::new([
            term("API", "một"),
            term("api", "hai"),
            term("  ", "ba"),
            term("", "bốn"),
        ]);
        assert_eq!(g.len(), 1);
        assert_eq!(g.matches("the API").first().map(|t| t.target.as_str()), Some("một"));
        assert!(Glossary::default().matches("anything").is_empty());
        assert!(Glossary::default().is_empty());
    }

    #[test]
    fn normalize_composes_and_lowercases() {
        let nfd: String = "Tiếng Việt".nfd().collect();
        assert_eq!(normalize(&nfd), "tiếng việt");
        assert_eq!(normalize("ÉCOLE"), "école");
        assert!(is_cjk('模') && is_cjk('の') && is_cjk('회') && is_cjk('ｱ') && is_cjk('𠀀'));
        assert!(!is_cjk('a') && !is_cjk('đ') && !is_cjk('。'));
    }
}
```

Sửa `crates/pipeline/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/lib.rs b/crates/pipeline/src/lib.rs
index 7c05ddd12a7f7270826121763f9b86e4fad4c87f..3ea22a2820b6616408c672bbf3f24dd199d39250 100644
--- a/crates/pipeline/src/lib.rs
+++ b/crates/pipeline/src/lib.rs
@@ -2,6 +2,7 @@
 pub mod config;
 pub mod engine;
 pub mod filter;
+pub mod glossary;
 pub mod llama;
 pub mod logfile;
 pub mod metrics;
```

Sửa `crates/pipeline/src/prompt.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/prompt.rs b/crates/pipeline/src/prompt.rs
index 9364cd940b8ce347f2db08293308c50af5488803..c277554dbe785735d3c427551aebbe659ffbc357 100644
--- a/crates/pipeline/src/prompt.rs
+++ b/crates/pipeline/src/prompt.rs
@@ -123,6 +123,37 @@
         assert!(p.ends_with("[Source Text]\nB"));
     }
 
+    fn terms() -> Vec<Term> {
+        vec![
+            Term {
+                source: "sprint".into(),
+                target: "đợt chạy".into(),
+            },
+            Term {
+                source: "API".into(),
+                target: "giao diện lập trình".into(),
+            },
+        ]
+    }
+
+    #[test]
+    fn terminology_template_english() {
+        assert_eq!(
+            terminology_prompt("The sprint API", &terms(), Lang::En, Lang::Vi),
+            "Reference the following translations:\nsprint translates to đợt chạy\nAPI translates to giao diện lập trình\n\n\
+             Translate the following text into Vietnamese. Note that you must ONLY output the translated result without \
+             any additional explanation:\n\nThe sprint API"
+        );
+    }
+
+    #[test]
+    fn terminology_template_chinese() {
+        assert_eq!(
+            terminology_prompt("这个API", &terms()[1..], Lang::Zh, Lang::Vi),
+            "参考下面的翻译：\nAPI 翻译成 giao diện lập trình\n将以下文本翻译为越南语，注意只需要输出翻译后的结果，不要额外解释：\n\n这个API"
+        );
+    }
+
     #[test]
     fn lang_codes_roundtrip() {
         for code in ["en", "zh", "ja", "ko", "vi"] {
```

Sửa `crates/pipeline/src/translate.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/translate.rs b/crates/pipeline/src/translate.rs
index 8ec91c288b46c38500174b63268e8b3b59e2f7c1..075fab708bc606621fd228a1d564d1e025a2f3f5 100644
--- a/crates/pipeline/src/translate.rs
+++ b/crates/pipeline/src/translate.rs
@@ -243,6 +243,7 @@
             src: Lang::En,
             tgt: Lang::Vi,
             context: None,
+            terms: &[],
         }
     }
 
@@ -375,4 +376,26 @@
         run(&mut mt, &with_context);
         assert!(mt.requests[0].0.starts_with("[Background Information]\ncâu trước"));
     }
-}
+
+    #[test]
+    fn terms_use_the_terminology_template_and_drop_the_context() {
+        let mut mt = Scripted {
+            replies: vec![Ok((vec!["Đợt", " chạy"], "stop"))],
+            requests: vec![],
+        };
+        let terms = [Term {
+            source: "sprint".into(),
+            target: "đợt chạy".into(),
+        }];
+        let with_terms = Job {
+            context: Some("câu trước"),
+            terms: &terms,
+            ..job("The sprint")
+        };
+        run(&mut mt, &with_terms);
+        assert_eq!(
+            mt.requests[0].0,
+            terminology_prompt("The sprint", &terms, Lang::En, Lang::Vi)
+        );
+    }
+}
```

Sửa `crates/pipeline/tests/engine.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/tests/engine.rs b/crates/pipeline/tests/engine.rs
index b1891fa9ab5f3804caecf2f1969efdc2d56b39f0..73cbec8cb7913f1105a357ca9b8d1d249b53a400 100644
--- a/crates/pipeline/tests/engine.rs
+++ b/crates/pipeline/tests/engine.rs
@@ -202,6 +202,7 @@
         target: Lang::Vi,
         translation_context: false,
         id_base: 1_000,
+        glossary: Default::default(),
     }
 }
 
```

Sửa `crates/pipeline/tests/lifecycle.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/tests/lifecycle.rs b/crates/pipeline/tests/lifecycle.rs
index 3040fb4eac15877801c4979368315354a30ce49e..0a2d42a36048f5f4ec9236e9450e61cf0f226bcd 100644
--- a/crates/pipeline/tests/lifecycle.rs
+++ b/crates/pipeline/tests/lifecycle.rs
@@ -388,6 +388,7 @@
         src: Lang::En,
         tgt: Lang::Vi,
         context: None,
+        terms: &[],
     };
     let mut mt = s.manager.mt();
     translate(&mut mt, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(()))
```

Sửa `crates/pipeline/tests/real_sidecars.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/tests/real_sidecars.rs b/crates/pipeline/tests/real_sidecars.rs
index 795ace5763a91af6bce2f7d32c5c9843af88db18..85f875e4817b61caa580685055fa1e205ff86c20 100644
--- a/crates/pipeline/tests/real_sidecars.rs
+++ b/crates/pipeline/tests/real_sidecars.rs
@@ -102,6 +102,7 @@
             target: Lang::Vi,
             translation_context: false,
             id_base: 0,
+            glossary: Default::default(),
         },
         Box::new(SampleSource::new(samples, 512, Duration::from_millis(32))),
         Box::new(move || Ok(Box::new(SileroVad::load(&vad_model)?) as _)),
```

Tạo `crates/pipeline/tests/real_terms.rs`:

````rust
//! Thuật ngữ với `llama-server` và Hy-MT2 thật (spec §6.5 "Thuật ngữ"): mỗi câu được dịch hai lần, không có và có từ
//! điển (mẫu "terminology"), rồi đếm số thuật ngữ có bản dịch đúng như từ điển. Model 1,8B không luôn theo từ điển, nên
//! test chỉ đòi có từ điển thì đúng nhiều hơn hẳn không có, và in bảng để ghi vào kế hoạch. Cần model và binary nên bị bỏ
//! qua mặc định. Chạy từ gốc repo, với từng model:
//!
//! ```text
//! MT_LLAMA_SERVER=$PWD/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
//! MT_MT_MODEL=$PWD/models/Hy-MT2-1.8B-Q4_K_M.gguf cargo test -p pipeline --test real_terms -- --include-ignored --nocapture
//! ```

use pipeline::config::MtConfig;
use pipeline::glossary::{Glossary, Term};
use pipeline::llama::{LlamaLaunch, LlamaServer};
use pipeline::prompt::Lang;
use pipeline::translate::{Job, Outcome, translate};
use std::ops::ControlFlow;
use std::path::PathBuf;

fn env(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("đặt {name}")))
}

fn term(source: &str, target: &str) -> Term {
    Term {
        source: source.into(),
        target: target.into(),
    }
}

fn run(server: &mut LlamaServer, text: &str, src: Lang, terms: &[Term]) -> String {
    let job = Job {
        text,
        src,
        tgt: Lang::Vi,
        context: None,
        terms,
    };
    match translate(server, &job, &MtConfig::default(), &mut |_| ControlFlow::Continue(())) {
        Outcome::Done(done) => done.text,
        other => panic!("{text}: {other:?}"),
    }
}

#[test]
#[ignore = "cần model và binary thật, xem đầu file"]
fn real_model_follows_the_glossary_more_often() {
    let log = std::env::temp_dir().join(format!("pipeline-real-terms-{}.log", std::process::id()));
    let mut server = LlamaServer::spawn(&LlamaLaunch::new(&env("MT_LLAMA_SERVER"), &env("MT_MT_MODEL"), &log)).unwrap();
    let glossary = Glossary::new([
        term("sprint", "sprint"),
        term("standup", "họp đứng"),
        term("churn rate", "tỉ lệ rời bỏ"),
        term("onboarding", "quy trình làm quen"),
        term("backlog", "danh sách tồn đọng"),
        term("灰度发布", "phát hành thử nghiệm"),
        term("スプリント", "sprint"),
        term("스프린트", "sprint"),
    ]);
    let cases = [
        ("The sprint ends on Friday, so the standup moves to nine.", Lang::En),
        ("Our churn rate dropped after the onboarding change.", Lang::En),
        ("The backlog is too long for this quarter.", Lang::En),
        ("灰度发布下周开始。", Lang::Zh),
        ("来週のスプリントでログイン画面を直します。", Lang::Ja),
        ("다음 주 스프린트에서 결제 화면을 고칩니다.", Lang::Ko),
    ];
    let (mut total, mut plain_hits, mut glossary_hits) = (0, 0, 0);
    for (text, src) in cases {
        let terms = glossary.matches(text);
        assert!(!terms.is_empty(), "{text}");
        let plain = run(&mut server, text, src, &[]);
        let with_terms = run(&mut server, text, src, &terms);
        let hits = |out: &str| {
            terms
                .iter()
                .filter(|t| out.to_lowercase().contains(&t.target.to_lowercase()))
                .count()
        };
        total += terms.len();
        plain_hits += hits(&plain);
        glossary_hits += hits(&with_terms);
        println!(
            "{text}\n  không từ điển ({}/{}): {plain}\n  có từ điển   ({}/{}): {with_terms}",
            hits(&plain),
            terms.len(),
            hits(&with_terms),
            terms.len()
        );
    }
    println!("thuật ngữ đúng như từ điển: không từ điển {plain_hits}/{total}, có từ điển {glossary_hits}/{total}");
    assert!(
        glossary_hits >= plain_hits + 3,
        "có từ điển phải đúng nhiều hơn hẳn: {glossary_hits} so với {plain_hits} trên {total}"
    );
}
````

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p pipeline --lib glossary 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `glossary.rs`, `terminology_prompt`, `Job.terms`):
```text
error: could not compile `pipeline` (lib test) due to 41 previous errors; 1 warning emitted
error[E0061]: this function takes 6 arguments but 7 arguments were supplied
error[E0422]: cannot find struct, variant or union type `Term` in this scope
error[E0425]: cannot find function `is_cjk` in this scope
error[E0425]: cannot find function `normalize` in this scope
error[E0425]: cannot find function `terminology_prompt` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `crates/latency-bench/src/mt_eval.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/latency-bench/src/mt_eval.rs b/crates/latency-bench/src/mt_eval.rs
index b9518aa48139cdcdd53fdd241b8f9e860e6f48fc..aa3ad3361f14c5d9fb0bd164b88aad65a27aaac0 100644
--- a/crates/latency-bench/src/mt_eval.rs
+++ b/crates/latency-bench/src/mt_eval.rs
@@ -323,6 +323,8 @@
             } else {
                 None
             },
+            // A3 chấm prompt mặc định, không có từ điển.
+            terms: &[],
         };
         let row = to_row(
             item,
```

Sửa `crates/pipeline/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/Cargo.toml b/crates/pipeline/Cargo.toml
index c829b71c3421e4ac76253f76025fefe06ae04ec3..c30247637a8fd7b1f9f0c20fe267820e9cace088 100644
--- a/crates/pipeline/Cargo.toml
+++ b/crates/pipeline/Cargo.toml
@@ -18,6 +18,8 @@
 serde.workspace = true
 serde_json.workspace = true
 thiserror.workspace = true
+# Chuẩn hóa NFC khi so khớp thuật ngữ (spec §6.5, `glossary.rs`).
+unicode-normalization = "0.1.25"
 
 [target.'cfg(unix)'.dependencies]
 libc = "0.2.189"
```

Sửa `crates/pipeline/src/engine.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/engine.rs b/crates/pipeline/src/engine.rs
index 1590688089782ae35b40ffb5200c1ad7c1aa77e1..a85d156f50a269daddcf296c78cabc9665a86e97 100644
--- a/crates/pipeline/src/engine.rs
+++ b/crates/pipeline/src/engine.rs
@@ -31,6 +31,7 @@
 
 use crate::config::{AudioConfig, FilterConfig, MtConfig, PipelineConfig};
 use crate::filter::{Evidence, Verdict, pcm_skip, verdict};
+use crate::glossary::SharedGlossary;
 use crate::metrics::SessionMetrics;
 use crate::prompt::{Lang, translation_prompt};
 use crate::prompt_history::PromptHistory;
@@ -68,6 +69,9 @@
     pub translation_context: bool,
     /// Cộng vào id của mọi phụ đề, để id không trùng giữa các phiên của cùng một lần chạy app.
     pub id_base: u64,
+    /// Từ điển thuật ngữ (F5, §6.5). Luồng dịch đọc bản mới nhất ở mỗi câu, nên app sửa từ điển giữa phiên thì câu sau
+    /// dùng ngay. Gói Free: app đưa từ điển rỗng.
+    pub glossary: SharedGlossary,
 }
 
 /// Nguồn âm thanh 16 kHz mono.
@@ -383,11 +387,12 @@
 
         let mt_thread = {
             let (tx, mt_cfg, target, hurry) = (tx.clone(), cfg.pipeline.mt.clone(), cfg.target, flags.hurry.clone());
+            let glossary = cfg.glossary.clone();
             std::thread::Builder::new()
                 .name("mt".into())
                 .spawn(move || {
                     let _guard = MtGuard(tx.clone());
-                    mt_loop(mt, jobs_rx, &tx, &mt_cfg, target, &hurry)
+                    mt_loop(mt, jobs_rx, &tx, &mt_cfg, target, &hurry, &glossary)
                 })
                 .map_err(|e| fail(e, &flags, &queue))?
         };
@@ -728,6 +733,7 @@
     cfg: &MtConfig,
     target: Lang,
     hurry: &AtomicBool,
+    glossary: &SharedGlossary,
 ) {
     // Làm nóng khi bắt đầu phiên (§6.5); lỗi ở đây không quan trọng, request thật sẽ báo lỗi của nó. Bấm Dừng thì bỏ
     // ngang lần làm nóng.
@@ -750,11 +756,14 @@
     }
     for job in jobs {
         let (sub_id, version) = (job.sub_id, job.version);
+        // Thuật ngữ có trong câu, theo bản từ điển lúc bắt đầu dịch câu này (§6.5).
+        let terms = glossary.read().map(|g| g.matches(&job.text)).unwrap_or_default();
         let request = Job {
             text: &job.text,
             src: job.src,
             tgt: target,
             context: job.context.as_deref(),
+            terms: &terms,
         };
         let outcome = translate(&mut *mt, &request, cfg, &mut |event| {
             if job.cancel.load(Ordering::SeqCst) {
```

Thêm vào `crates/pipeline/src/glossary.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::sync::{Arc, RwLock};

use unicode_normalization::UnicodeNormalization;

/// Số mục tối đa đưa vào prompt của một câu (spec §6.5).
pub const MAX_TERMS_PER_SENTENCE: usize = 20;

/// Một cặp thuật ngữ: chữ nguồn và bản dịch mong muốn, như người dùng nhập.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Term {
    pub source: String,
    pub target: String,
}

/// Từ điển dùng chung giữa app và luồng dịch của engine.
pub type SharedGlossary = Arc<RwLock<Glossary>>;

/// Chuẩn hóa để so khớp và để so trùng: NFC, chữ thường, NFC lại (vài chữ hoa đổi sang chữ thường thành chuỗi tổ hợp).
pub fn normalize(text: &str) -> String {
    text.nfc().collect::<String>().to_lowercase().nfc().collect()
}

/// Chữ Trung (Hán), Nhật (kana) và Hàn (Hangul): khớp theo chuỗi con, không xét ranh giới từ.
pub fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{1100}'..='\u{11FF}'      // Hangul Jamo
        | '\u{3005}'..='\u{3007}'    // 々 〆 〇
        | '\u{3040}'..='\u{30FF}'    // Hiragana, Katakana
        | '\u{3130}'..='\u{318F}'    // Hangul Compatibility Jamo
        | '\u{31F0}'..='\u{31FF}'    // Katakana Phonetic Extensions
        | '\u{3400}'..='\u{4DBF}'    // CJK Extension A
        | '\u{4E00}'..='\u{9FFF}'    // CJK Unified Ideographs
        | '\u{A960}'..='\u{A97F}'    // Hangul Jamo Extended-A
        | '\u{AC00}'..='\u{D7FF}'    // Hangul Syllables, Jamo Extended-B
        | '\u{F900}'..='\u{FAFF}'    // CJK Compatibility Ideographs
        | '\u{FF66}'..='\u{FF9F}'    // Katakana nửa độ rộng
        | '\u{20000}'..='\u{323AF}'  // CJK Extension B–H, Compatibility Supplement
    )
}

/// Ký tự làm nên một từ, cho luật ranh giới: chữ hay số, trừ chữ Trung, Nhật, Hàn.
fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() && !is_cjk(c)
}

#[derive(Clone, Debug)]
struct Entry {
    key: String,
    /// Đầu trái, đầu phải của thuật ngữ là ký tự của một từ: phải kiểm ranh giới ở đầu đó.
    bound_left: bool,
    bound_right: bool,
    term: Term,
}

#[derive(Clone, Debug, Default)]
pub struct Glossary {
    /// Xếp theo độ dài khóa giảm dần, cùng độ dài thì theo thứ tự đưa vào.
    entries: Vec<Entry>,
}

impl Glossary {
    /// Bỏ mục có chữ nguồn rỗng sau khi chuẩn hóa; hai mục trùng khóa thì giữ mục đầu.
    pub fn new(terms: impl IntoIterator<Item = Term>) -> Self {
        let mut entries: Vec<Entry> = Vec::new();
        for term in terms {
            let key = normalize(term.source.trim());
            let (Some(first), Some(last)) = (key.chars().next(), key.chars().next_back()) else {
                continue;
            };
            if entries.iter().any(|e| e.key == key) {
                continue;
            }
            entries.push(Entry {
                bound_left: is_word_char(first),
                bound_right: is_word_char(last),
                key,
                term,
            });
        }
        // Sắp ổn định: các mục cùng độ dài giữ thứ tự cũ.
        entries.sort_by_key(|e| std::cmp::Reverse(e.key.chars().count()));
        Self { entries }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Các mục có trong câu `text`, tối đa [`MAX_TERMS_PER_SENTENCE`], mục dài trước.
    pub fn matches(&self, text: &str) -> Vec<Term> {
        if self.entries.is_empty() {
            return Vec::new();
        }
        let hay = normalize(text);
        self.entries
            .iter()
            .filter(|e| occurs(&hay, e))
            .take(MAX_TERMS_PER_SENTENCE)
            .map(|e| e.term.clone())
            .collect()
    }
}

/// `entry.key` có xuất hiện trong `hay` (đã chuẩn hóa), đúng luật ranh giới ở hai đầu.
fn occurs(hay: &str, entry: &Entry) -> bool {
    hay.match_indices(entry.key.as_str()).any(|(i, found)| {
        let before = hay[..i].chars().next_back();
        let after = hay[i + found.len()..].chars().next();
        let left_ok = !entry.bound_left || !before.is_some_and(is_word_char);
        let right_ok = !entry.bound_right || !after.is_some_and(is_word_char);
        left_ok && right_ok
    })
}
```

Sửa `crates/pipeline/src/prompt.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/prompt.rs b/crates/pipeline/src/prompt.rs
index c277554dbe785735d3c427551aebbe659ffbc357..06a7fc920149e1f724e0e7b0cd4bae55346b9abf 100644
--- a/crates/pipeline/src/prompt.rs
+++ b/crates/pipeline/src/prompt.rs
@@ -1,4 +1,6 @@
 //! Mẫu prompt lấy nguyên văn từ model card của Hy-MT2 (spec §6.5).
+
+use crate::glossary::Term;
 
 #[derive(Clone, Copy, Debug, PartialEq, Eq)]
 pub enum Lang {
@@ -71,6 +73,35 @@
              without any additional explanation:\n\n{text}",
             tgt.english_name()
         )
+    }
+}
+
+/// Mẫu "terminology" của model card Hy-MT2 (spec §6.5 "Thuật ngữ"; README của `tencent/Hy-MT2-1.8B`, commit `9a341cd`,
+/// mục "Hy-MT2 Translation Task Instruction Examples"): mỗi cặp một dòng, rồi câu lệnh dịch. Chọn mẫu tiếng Trung hay tiếng
+/// Anh theo cùng luật với mẫu mặc định. Mẫu tiếng Anh có dòng trống trước câu lệnh và viết "must ONLY", mẫu tiếng Trung
+/// không có dòng trống: đúng như model card.
+pub fn terminology_prompt(text: &str, terms: &[Term], src: Lang, tgt: Lang) -> String {
+    if uses_chinese_template(src, tgt) {
+        let mut prompt = String::from("参考下面的翻译：\n");
+        for t in terms {
+            prompt.push_str(&format!("{} 翻译成 {}\n", t.source, t.target));
+        }
+        prompt.push_str(&format!(
+            "将以下文本翻译为{}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}",
+            tgt.chinese_name()
+        ));
+        prompt
+    } else {
+        let mut prompt = String::from("Reference the following translations:\n");
+        for t in terms {
+            prompt.push_str(&format!("{} translates to {}\n", t.source, t.target));
+        }
+        prompt.push_str(&format!(
+            "\nTranslate the following text into {}. Note that you must ONLY output the translated result without any \
+             additional explanation:\n\n{text}",
+            tgt.english_name()
+        ));
+        prompt
     }
 }
 
```

Sửa `crates/pipeline/src/translate.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/translate.rs b/crates/pipeline/src/translate.rs
index 075fab708bc606621fd228a1d564d1e025a2f3f5..8c979cd4b5434129c37abc62766e9881ca60f59c 100644
--- a/crates/pipeline/src/translate.rs
+++ b/crates/pipeline/src/translate.rs
@@ -3,9 +3,10 @@
 //! Đ4 của kế hoạch 00) dùng đúng hàm này.
 
 use crate::config::MtConfig;
+use crate::glossary::Term;
 use crate::llama::{ChatRequest, LlamaServer, StreamEnd};
 use crate::postprocess::{PostProcessor, Step, Violation};
-use crate::prompt::{Lang, context_prompt, translation_prompt};
+use crate::prompt::{Lang, context_prompt, terminology_prompt, translation_prompt};
 use std::ops::ControlFlow;
 use std::time::Instant;
 
@@ -51,6 +52,9 @@
     pub tgt: Lang,
     /// Câu trước, khi bật cờ thử nghiệm `experimental.translationContext` (§6.5).
     pub context: Option<&'a str>,
+    /// Thuật ngữ có trong câu (`Glossary::matches`, §6.5). Có thuật ngữ thì dùng mẫu "terminology" và bỏ ngữ cảnh: model
+    /// card không có mẫu gộp hai thứ, và cờ ngữ cảnh chỉ là thử nghiệm, mặc định tắt.
+    pub terms: &'a [Term],
 }
 
 /// Sự kiện trong lúc dịch, cho luồng phụ đề.
@@ -106,6 +110,7 @@
 ) -> Outcome {
     let started = Instant::now();
     let prompt = match job.context {
+        _ if !job.terms.is_empty() => terminology_prompt(job.text, job.terms, job.src, job.tgt),
         Some(context) => context_prompt(job.text, context, job.src, job.tgt),
         None => translation_prompt(job.text, job.src, job.tgt),
     };
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 9a99ee30ba3bb0abb4c01b323076debec66d8791..ac4e057f51f270890823c3ddd6e7518ebaa0d073 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -148,6 +148,7 @@
         target: MtLang::from_code(code_of(settings.target_language)).expect("năm ngôn ngữ của F2"),
         translation_context: settings.experimental.translation_context,
         id_base,
+        glossary: Default::default(),
     }
 }
 
```

Khóa đúng bản đã thử:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && cargo update -q -p unicode-normalization --precise 0.1.25 && grep -A1 -E '^name = "(unicode-normalization)"' Cargo.lock
```
Expected (lúc lập kế hoạch):
```text
name = "unicode-normalization"
version = "0.1.25"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p pipeline --lib glossary -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test glossary::tests::at_most_twenty_terms_longest_first ... ok
test glossary::tests::chinese_japanese_korean_terms_match_as_substrings ... ok
test glossary::tests::duplicates_and_empty_sources_are_dropped ... ok
test glossary::tests::edges_that_are_not_letters_need_no_boundary ... ok
test glossary::tests::latin_terms_match_whole_words_only_and_ignore_case ... ok
test glossary::tests::latin_terms_next_to_cjk_text_still_match ... ok
test glossary::tests::normalize_composes_and_lowercases ... ok
test glossary::tests::vietnamese_with_diacritics_matches_in_any_unicode_form ... ok
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 158 filtered out
```

Run:
```bash
cargo test -p pipeline --lib prompt:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test prompt::tests::chinese_template_when_source_is_chinese ... ok
test prompt::tests::chinese_template_when_target_is_chinese ... ok
test prompt::tests::context_template_english ... ok
test prompt::tests::english_template_for_non_chinese_pairs ... ok
test prompt::tests::lang_codes_roundtrip ... ok
test prompt::tests::terminology_template_chinese ... ok
test prompt::tests::terminology_template_english ... ok
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 159 filtered out
```

Run:
```bash
cargo test -p pipeline --lib terms -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test engine::tests::the_translation_thread_puts_matching_terms_into_the_prompt ... ok
test glossary::tests::at_most_twenty_terms_longest_first ... ok
test glossary::tests::chinese_japanese_korean_terms_match_as_substrings ... ok
test glossary::tests::latin_terms_match_whole_words_only_and_ignore_case ... ok
test glossary::tests::latin_terms_next_to_cjk_text_still_match ... ok
test translate::tests::terms_use_the_terminology_template_and_drop_the_context ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 160 filtered out
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch):
```text
passed 531 failed 0 ignored 12
```

- [ ] **Step 5: Thử với model thật (tùy chọn)**

Chạy với `llama-server` b11146 và Hy-MT2 thật. `tools/` và `models/` không có trong worktree sạch (bị `.gitignore` bỏ qua), nên đặt `R` là repo chính có hai thư mục đó (N10 của review 03); không có thì bỏ bước này. Mỗi model chạy vài giây, không đo thời gian. Test chỉ đòi có từ điển thì đúng nhiều hơn hẳn không có (ít nhất 3 thuật ngữ); số cụ thể ghi ở bảng "Thuật ngữ với model thật" của file này.

Run:
```bash
R=${R:-/Users/dtphong/Desktop/software_business/meeting-translator}
for m in Q8_0 Q4_K_M; do
  MT_LLAMA_SERVER=$R/tools/llama-b11146/macos-arm64/llama-b11146/llama-server \
  MT_MT_MODEL=$R/models/Hy-MT2-1.8B-$m.gguf \
  cargo test -q -p pipeline --test real_terms -- --include-ignored --nocapture 2>&1 | grep -E '^thuật ngữ|^test result' | sed 's/; finished in .*//'
done
```
Expected (lúc lập kế hoạch):
```text
thuật ngữ đúng như từ điển: không từ điển 0/8, có từ điển 4/8
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
thuật ngữ đúng như từ điển: không từ điển 1/8, có từ điển 7/8
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 6: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 7: Commit**

```bash
git add Cargo.lock \
  crates/latency-bench/src/mt_eval.rs \
  crates/pipeline/Cargo.toml \
  crates/pipeline/src/engine.rs \
  crates/pipeline/src/glossary.rs \
  crates/pipeline/src/lib.rs \
  crates/pipeline/src/prompt.rs \
  crates/pipeline/src/translate.rs \
  crates/pipeline/tests/engine.rs \
  crates/pipeline/tests/lifecycle.rs \
  crates/pipeline/tests/real_sidecars.rs \
  crates/pipeline/tests/real_terms.rs \
  src-tauri/src/session.rs
git commit -m "feat(pipeline): khớp thuật ngữ theo §6.5 và mẫu terminology của Hy-MT2 (F5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 5: Từ điển thuật ngữ trong DB, CSV, nối vào phiên

Dòng 19, 49, 155, 193, 318 (`glossary.rs` của app); QĐ12, QĐ14.

- Thêm, sửa, xóa, liệt kê; mã lỗi `glossaryEmpty`, `glossaryTooLong`, `glossaryInvalidChar`, `glossaryDuplicate` (kèm trường `source` hay `target`), `glossaryFull`, `glossaryNotFound`, `csvInvalid`.
- `export_csv`, `import_csv` theo QĐ14 (bằng crate `csv`). Ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm `'` khi xuất để Excel không chạy công thức (`guard`), và bỏ đúng dấu đó khi nhập (`unguard`), nên nhập rồi xuất lại giữ nguyên thuật ngữ (N1 của review 03).
- `ActiveGlossary` (một `SharedGlossary` cho mọi phiên) và `reload`: Pro thì đọc DB, Free thì rỗng. `session::start_with` gọi `reload` trước khi giữ khóa của phiên (đọc DB có thể chờ kho khóa), rồi truyền vào `EngineConfig`.
- `forget`: luồng dịch thôi dùng thuật ngữ mà không đọc DB. `pro::refresh` gọi nó khi gói về Free, để thuật ngữ thôi vào prompt ngay giữa phiên (N11 của review 03); lên Pro thì không đọc DB ở đó (lúc khởi động không mở DB, QĐ4), phiên sau tự nạp.
- `db::with` và `DataStore::with` nhận lỗi kiểu bất kỳ có `From<DbError>` (để hàm của từ điển trả `GlossaryError`); test của `db.rs` dùng hàm `run` để suy ra kiểu lỗi.
- `FakeDeps` ghi lại prompt của từng request dịch (`prompts`), để test phiên kiểm thuật ngữ vào prompt ở gói Pro, không vào ở gói Free.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/db.rs`
- Modify: `src-tauri/src/errors.rs`
- Create: `src-tauri/src/glossary.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/pro.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/test_support.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 671a04a114b5995d6b62729a606bb0506065cc93..6270209029578dbf1dfb884a4f4329fad2352bb7 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -13,7 +13,8 @@
 use crate::session::{self, StartOptions};
 use crate::state::{AppState, SessionStatus};
 use crate::test_support::{
-    FakeAudio, FakeDeps, PrepareGate, invoke, last_saved, login_state, mock_app, mock_app_with, overlay_calls, window,
+    FakeAudio, FakeDeps, PrepareGate, invoke, last_saved, login_state, mock_app, mock_app_with, overlay_calls, set_pro,
+    window,
 };
 
 /// Ghi lại mọi payload của một sự kiện.
@@ -533,6 +534,59 @@
     assert!(before < running && running < idle, "{before} {running} {idle}");
 }
 
+/// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
+#[test]
+fn glossary_terms_reach_the_prompt_only_for_pro() {
+    let deps = FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    };
+    let prompts = deps.prompts.clone();
+    let app = mock_app_with(deps);
+    let _main = window(&app, "main");
+    crate::db::with(app.handle(), |c| crate::glossary::add(c, "everyone", "mọi người")).unwrap();
+    // Prompt của câu "Hello everyone." trong một phiên (bỏ lần làm nóng).
+    let sentence_prompt = || {
+        prompts.lock().unwrap().clear();
+        session::start(app.handle()).unwrap();
+        wait_until("câu đầu được gửi đi dịch", || {
+            prompts.lock().unwrap().iter().any(|p| p.ends_with("Hello everyone."))
+        });
+        session::stop(app.handle());
+        let prompts = prompts.lock().unwrap();
+        prompts.iter().find(|p| p.ends_with("Hello everyone.")).unwrap().clone()
+    };
+    let pro = sentence_prompt();
+    assert!(
+        pro.starts_with("Reference the following translations:\neveryone translates to mọi người\n"),
+        "{pro}"
+    );
+    set_pro(&app, false);
+    let free = sentence_prompt();
+    assert!(
+        free.starts_with("Translate the following text into Vietnamese."),
+        "{free}"
+    );
+}
+
+/// N11 của review 03: về Free (`pro::refresh`) thì luồng dịch thôi dùng thuật ngữ ngay, không chờ phiên sau. Lên Pro thì
+/// không mở DB (lúc khởi động app cũng vậy, QĐ4).
+#[test]
+fn losing_pro_empties_the_glossary_of_the_translation_thread() {
+    let app = mock_app();
+    assert!(
+        !app.state::<crate::db::DataStore>().path().exists(),
+        "dựng app (Pro) không mở DB"
+    );
+    crate::db::with(app.handle(), |c| crate::glossary::add(c, "sprint", "sprint")).unwrap();
+    crate::glossary::reload(app.handle());
+    let active = || app.state::<crate::glossary::ActiveGlossary>().0.read().unwrap().len();
+    assert_eq!(active(), 1);
+    set_pro(&app, false);
+    crate::pro::refresh(app.handle());
+    assert_eq!(active(), 0, "về Free thì không còn thuật ngữ trong prompt");
+}
+
 /// Cài đặt có số thứ tự tăng dần (điểm cần quyết 10 của 02a), để giao diện bỏ bản cũ tới muộn. Số trong kết quả của
 /// lệnh, trong sự kiện `settings://changed` và trong `get_settings` là một.
 #[test]
```

Sửa `src-tauri/src/db.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/db.rs b/src-tauri/src/db.rs
index 7db991da2c0ddaa4a72f45dc706ef8af7c0300f7..9604986a9dc952c5ec081f31b3479cdf2535a9de 100644
--- a/src-tauri/src/db.rs
+++ b/src-tauri/src/db.rs
@@ -305,6 +305,11 @@
         Keystore::with_store(SERVICE, keys.clone())
     }
 
+    /// `DataStore::with` với lỗi là `DbError` (để suy ra kiểu lỗi trong test).
+    fn run<T>(db: &DataStore, f: impl FnOnce(&mut Connection) -> Result<T, DbError>) -> Result<T, DbError> {
+        db.with(f)
+    }
+
     fn tables(conn: &Connection) -> Vec<String> {
         let mut stmt = conn
             .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
@@ -317,14 +322,13 @@
         let dir = temp_dir("new");
         let keys = MockStore::new().unwrap();
         let db = store(&dir, &keys);
-        let (names, version) = db
-            .with(|c| {
-                Ok((
-                    tables(c),
-                    c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?,
-                ))
-            })
-            .unwrap();
+        let (names, version) = run(&db, |c| {
+            Ok((
+                tables(c),
+                c.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))?,
+            ))
+        })
+        .unwrap();
         assert_eq!(names, ["glossary", "lines", "sessions"]);
         assert_eq!(version, SCHEMA_VERSION);
         let secure = db
@@ -348,7 +352,7 @@
         let dir = temp_dir("nokey");
         let keys = MockStore::new().unwrap();
         let db = store(&dir, &keys);
-        db.with(|c| {
+        run(&db, |c| {
             c.execute("INSERT INTO sessions VALUES (1, 0, 0, 'vi')", [])?;
             Ok(())
         })
@@ -378,7 +382,7 @@
         let dir = temp_dir("cli");
         let keys = MockStore::new().unwrap();
         let db = store(&dir, &keys);
-        db.with(|c| {
+        run(&db, |c| {
             c.execute(
                 "INSERT INTO glossary (source, target, match_key, created_at) VALUES ('API', 'giao diện lập trình', 'api', 0)",
                 [],
@@ -402,15 +406,15 @@
     fn reopening_uses_the_same_key() {
         let dir = temp_dir("reopen");
         let keys = MockStore::new().unwrap();
-        store(&dir, &keys)
-            .with(|c| {
-                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
-                Ok(())
-            })
-            .unwrap();
-        let count = store(&dir, &keys)
-            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
-            .unwrap();
+        run(&store(&dir, &keys), |c| {
+            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
+            Ok(())
+        })
+        .unwrap();
+        let count = run(&store(&dir, &keys), |c| {
+            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
+        })
+        .unwrap();
         assert_eq!(count, 1);
         std::fs::remove_dir_all(dir).unwrap();
     }
@@ -419,16 +423,16 @@
     fn a_lost_key_moves_the_old_file_aside() {
         let dir = temp_dir("lost");
         let keys = MockStore::new().unwrap();
-        store(&dir, &keys)
-            .with(|c| {
-                c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
-                Ok(())
-            })
-            .unwrap();
+        run(&store(&dir, &keys), |c| {
+            c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
+            Ok(())
+        })
+        .unwrap();
         assert!(keystore(&keys).delete(KEY_NAME).unwrap());
-        let count = store(&dir, &keys)
-            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
-            .unwrap();
+        let count = run(&store(&dir, &keys), |c| {
+            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
+        })
+        .unwrap();
         assert_eq!(count, 0, "DB mới, rỗng");
         let aside: Vec<String> = std::fs::read_dir(&dir)
             .unwrap()
@@ -448,7 +452,7 @@
         keystore(&keys)
             .set(KEY_NAME, to_hex(&[2; KEY_BYTES]).as_bytes())
             .unwrap();
-        let names = store(&dir, &keys).with(|c| Ok(tables(c))).unwrap();
+        let names = run(&store(&dir, &keys), |c| Ok(tables(c))).unwrap();
         assert_eq!(names, ["glossary", "lines", "sessions"]);
         assert_eq!(
             std::fs::read_dir(&dir).unwrap().count(),
@@ -462,17 +466,17 @@
     fn keystore_errors_leave_the_file_alone() {
         let dir = temp_dir("denied");
         let keys = MockStore::new().unwrap();
-        store(&dir, &keys).with(|_| Ok(())).unwrap();
+        run(&store(&dir, &keys), |_| Ok(())).unwrap();
         let before = std::fs::read(dir.join(DB_FILE)).unwrap();
         let entry = keys.build(SERVICE, KEY_NAME, None).unwrap();
         let cred: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
         cred.set_error(keyring_core::Error::NoStorageAccess("người dùng từ chối".into()));
-        let err = store(&dir, &keys).with(|_| Ok(())).unwrap_err();
+        let err = run(&store(&dir, &keys), |_| Ok(())).unwrap_err();
         assert!(matches!(err, DbError::Keystore(_)), "{err}");
         assert_eq!(std::fs::read(dir.join(DB_FILE)).unwrap(), before);
         assert_eq!(std::fs::read_dir(&dir).unwrap().count(), 1);
         let none = DataStore::new(dir.clone(), Err("không có kho khóa".into()));
-        assert!(matches!(none.with(|_| Ok(())), Err(DbError::Keystore(_))));
+        assert!(matches!(run(&none, |_| Ok(())), Err(DbError::Keystore(_))));
         std::fs::remove_dir_all(dir).unwrap();
     }
 
@@ -495,7 +499,7 @@
         let dir = temp_dir("wipe");
         let keys = MockStore::new().unwrap();
         let db = store(&dir, &keys);
-        db.with(|c| {
+        run(&db, |c| {
             c.execute("INSERT INTO sessions VALUES (1, 10, 20, 'vi')", [])?;
             Ok(())
         })
@@ -512,9 +516,10 @@
             "không còn file nào của dữ liệu cũ"
         );
         assert_eq!(keystore(&keys).get(KEY_NAME).unwrap(), None);
-        let count = db
-            .with(|c| Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?))
-            .unwrap();
+        let count = run(&db, |c| {
+            Ok(c.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, i64>(0))?)
+        })
+        .unwrap();
         assert_eq!(count, 0, "lần dùng sau tạo DB mới");
         db.wipe().unwrap();
         db.wipe().unwrap();
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 52df62e462fde8fb2701f8c37a2e80577729487a..7ca3070a07d72ea158e10f2e07a96e9586b25ac5 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -168,6 +168,7 @@
             ]
             .map(String::from),
         );
+        codes.extend(crate::glossary::ERROR_CODES.iter().map(|c| c.to_string()));
         for code in codes {
             assert!(
                 en.contains(&format!("\"error.{code}\":")),
```

Tạo `src-tauri/src/glossary.rs`, lúc này mới có phần test:

```rust
//! Từ điển thuật ngữ của người dùng (F5, tính năng Pro): lưu trong DB mã hóa (`db.rs`, bảng `glossary`), không trong file
//! cài đặt (§6.9). Tối đa 500 cặp; thêm, sửa, xóa; nhập và xuất CSV (§4.3).
//!
//! - Chữ nguồn và bản dịch được cắt khoảng trắng hai đầu, không rỗng, tối đa 200 ký tự, không có ký tự điều khiển (xuống
//!   dòng làm hỏng prompt, vì mẫu "terminology" ghi mỗi cặp một dòng).
//! - Hai mục không được trùng chữ nguồn sau khi chuẩn hóa (`pipeline::glossary::normalize`: NFC, chữ thường), đúng như
//!   cách luồng dịch so khớp.
//! - CSV: hai cột `source,target`, dòng đầu là tên cột, mã UTF-8 có BOM để Excel mở đúng tiếng Việt. Nhập: bỏ BOM, bỏ
//!   dòng tên cột nếu có, chữ nguồn đã có thì cập nhật bản dịch, chữ nguồn mới thì thêm tới khi đủ 500, dòng không hợp lệ
//!   thì bỏ qua và đếm; cả lần nhập là một transaction.
//! - Chặn công thức khi mở bằng Excel (N1 của review 03): khi xuất, ô bắt đầu bằng `=`, `+`, `-`, `@` được thêm một dấu
//!   `'` ở đầu ([`guard`]); khi nhập, bỏ đúng một dấu `'` đó ([`unguard`]), nên nhập rồi xuất lại vẫn giữ nguyên thuật ngữ.
//! - Luồng dịch dùng bản trong bộ nhớ ([`ActiveGlossary`]): nạp lúc bắt đầu phiên và sau mỗi lần sửa ([`reload`]); gói
//!   Free thì rỗng (`pro::is_pro`).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_with_key;

    fn conn(name: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mt-glossary-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        (open_with_key(&dir.join("data.db"), &[9; 32]).unwrap(), dir)
    }

    fn code(e: GlossaryError) -> (String, Option<String>) {
        let e = CommandError::from(e);
        (e.code, e.field)
    }

    #[test]
    fn add_update_delete_and_list() {
        let (c, dir) = conn("crud");
        let api = add(&c, "  API ", " giao diện lập trình ").unwrap();
        assert_eq!(
            (api.source.as_str(), api.target.as_str()),
            ("API", "giao diện lập trình")
        );
        let sprint = add(&c, "sprint", "đợt chạy").unwrap();
        let sprint = update(&c, sprint.id, "Sprint", "chặng nước rút").unwrap();
        assert_eq!(list(&c).unwrap(), [api.clone(), sprint.clone()]);
        delete(&c, api.id).unwrap();
        assert_eq!(list(&c).unwrap(), [sprint]);
        assert_eq!(code(delete(&c, api.id).unwrap_err()).0, "glossaryNotFound");
        assert_eq!(code(update(&c, 999, "x", "y").unwrap_err()).0, "glossaryNotFound");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn duplicates_follow_the_matching_rules() {
        let (c, dir) = conn("dup");
        // "Đà Nẵng" ở dạng tổ hợp (NFD): à = a + dấu huyền, ẵ = a + dấu trăng + dấu ngã.
        let nfd = "Đa\u{300} Na\u{306}\u{303}ng";
        let first = add(&c, "Đà Nẵng", "Da Nang").unwrap();
        assert_eq!(
            code(add(&c, &nfd.to_uppercase(), "x").unwrap_err()),
            ("glossaryDuplicate".to_string(), Some("source".to_string()))
        );
        let other = add(&c, "Hội An", "Hoi An").unwrap();
        assert_eq!(
            code(update(&c, other.id, "đà nẵng", "x").unwrap_err()).0,
            "glossaryDuplicate"
        );
        update(&c, first.id, "ĐÀ NẴNG", "Đà Nẵng city").unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn values_are_checked() {
        let (c, dir) = conn("check");
        let field = |e| code(e).1.unwrap();
        assert_eq!(code(add(&c, "  ", "x").unwrap_err()).0, "glossaryEmpty");
        assert_eq!(field(add(&c, "x", "").unwrap_err()), "target");
        assert_eq!(code(add(&c, &"a".repeat(201), "x").unwrap_err()).0, "glossaryTooLong");
        add(&c, &"ế".repeat(200), "x").unwrap();
        assert_eq!(code(add(&c, "a\nb", "x").unwrap_err()).0, "glossaryInvalidChar");
        assert_eq!(field(add(&c, "ab", "x\ty").unwrap_err()), "target");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn at_most_500_entries() {
        let (c, dir) = conn("full");
        for i in 0..MAX_ENTRIES {
            add(&c, &format!("term {i}"), "x").unwrap();
        }
        assert_eq!(code(add(&c, "one more", "x").unwrap_err()).0, "glossaryFull");
        let first = list(&c).unwrap()[0].id;
        update(&c, first, "renamed", "y").unwrap();
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn csv_roundtrip_keeps_commas_quotes_and_vietnamese() {
        let (mut c, dir) = conn("csv");
        add(&c, "Q1, Q2", "quý 1, quý 2").unwrap();
        add(&c, "say \"hi\"", "nói \"chào\"").unwrap();
        add(&c, "会議", "cuộc họp").unwrap();
        let text = export_csv(&c).unwrap();
        assert!(text.starts_with("\u{feff}source,target\n"), "{text:?}");
        assert!(text.contains("\"Q1, Q2\",\"quý 1, quý 2\"\n"), "{text:?}");
        assert!(text.contains("\"say \"\"hi\"\"\",\"nói \"\"chào\"\"\"\n"), "{text:?}");
        let (mut other, other_dir) = conn("csv-other");
        let report = import_csv(&mut other, text.as_bytes()).unwrap();
        assert_eq!(
            report,
            ImportReport {
                added: 3,
                ..Default::default()
            }
        );
        let pairs = |c: &Connection| -> Vec<(String, String)> {
            list(c).unwrap().into_iter().map(|e| (e.source, e.target)).collect()
        };
        assert_eq!(pairs(&other), pairs(&c));
        let again = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!((again.added, again.updated), (0, 3), "nhập lại cùng file: chỉ cập nhật");
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(other_dir).unwrap();
    }

    /// N1 của review 03: Excel không chạy công thức từ file xuất ra; nhập lại thì được đúng thuật ngữ cũ.
    #[test]
    fn csv_cells_that_excel_reads_as_formulas_are_guarded() {
        assert_eq!(guard("=HYPERLINK(\"x\")"), "'=HYPERLINK(\"x\")");
        for (cell, out) in [
            ("+1", "'+1"),
            ("-ish", "'-ish"),
            ("@home", "'@home"),
            ("'=x", "''=x"),
            ("a=b", "a=b"),
        ] {
            assert_eq!(guard(cell), out);
            assert_eq!(unguard(out.to_string()), cell);
        }
        assert_eq!(unguard("'abc".into()), "'abc", "dấu ' của người dùng thì giữ");
        assert_eq!(unguard("'".into()), "'");
        let (c, dir) = conn("formula");
        add(&c, "=1+1", "-sum").unwrap();
        add(&c, "'@x", "y").unwrap();
        let text = export_csv(&c).unwrap();
        assert!(text.contains("'=1+1,'-sum\n"), "{text:?}");
        assert!(text.contains("''@x,y\n"), "{text:?}");
        let (mut other, other_dir) = conn("formula-other");
        import_csv(&mut other, text.as_bytes()).unwrap();
        let pairs = |c: &Connection| -> Vec<(String, String)> {
            list(c).unwrap().into_iter().map(|e| (e.source, e.target)).collect()
        };
        assert_eq!(pairs(&other), pairs(&c));
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(other_dir).unwrap();
    }

    #[test]
    fn import_updates_existing_terms_and_counts_bad_rows() {
        let (mut c, dir) = conn("import");
        add(&c, "API", "giao diện").unwrap();
        let text = "API,giao diện lập trình\r\nsprint,đợt chạy\r\nchỉ một cột\r\n ,rỗng\r\nbacklog,việc tồn\r\n";
        let report = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!(
            report,
            ImportReport {
                added: 2,
                updated: 1,
                skipped: 2,
                over_limit: 0
            }
        );
        let api = list(&c).unwrap().into_iter().find(|e| e.source == "API").unwrap();
        assert_eq!(
            api.target, "giao diện lập trình",
            "không có dòng tên cột thì dòng đầu là dữ liệu"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn import_stops_adding_at_500_and_a_file_that_is_not_utf8_imports_nothing() {
        let (mut c, dir) = conn("import-full");
        let mut text = String::from("Source,Target\n");
        for i in 0..MAX_ENTRIES + 3 {
            text.push_str(&format!("term {i},x\n"));
        }
        let report = import_csv(&mut c, text.as_bytes()).unwrap();
        assert_eq!((report.added, report.over_limit), (MAX_ENTRIES, 3));
        assert_eq!(list(&c).unwrap().len(), MAX_ENTRIES);
        let (mut empty, empty_dir) = conn("import-bad");
        // "Hội nghị" theo bảng mã Windows-1258: không phải UTF-8.
        let err = import_csv(&mut empty, b"H\xf4i ngh\xf2,conference\n").unwrap_err();
        assert_eq!(code(err).0, "csvInvalid");
        assert!(list(&empty).unwrap().is_empty());
        std::fs::remove_dir_all(dir).unwrap();
        std::fs::remove_dir_all(empty_dir).unwrap();
    }
}
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index f82d4e5d094bf0d0700efc94b22168091467713d..b2fb1ffaac5873729f528c8eee7fbb52b2b23ed0 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -12,6 +12,7 @@
 pub mod db;
 pub mod errors;
 pub mod events;
+pub mod glossary;
 pub mod hotkey_registry;
 pub mod hotkeys;
 pub mod i18n;
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index ac4e057f51f270890823c3ddd6e7518ebaa0d073..57026cc3362089c2f3cdecf74a954827688eaba2 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -961,7 +961,7 @@
     fn the_engine_follows_the_language_and_pause_settings() {
         let mut settings = Settings::defaults(UiLanguage::Vi);
         settings.vad_end_silence_ms = 500;
-        let cfg = engine_config(&settings, 3_000_000);
+        let cfg = engine_config(&settings, 3_000_000, SharedGlossary::default());
         assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
         assert_eq!(cfg.target, MtLang::Vi);
         assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 500);
@@ -970,7 +970,7 @@
         settings.source_lock = Some(Lang::Ja);
         settings.target_language = Lang::En;
         settings.experimental.translation_context = true;
-        let cfg = engine_config(&settings, 0);
+        let cfg = engine_config(&settings, 0, SharedGlossary::default());
         assert_eq!(cfg.languages, ["ja"], "khóa ngôn ngữ nguồn thì bỏ nhận diện (§6.4)");
         assert_eq!(cfg.target, MtLang::En);
         assert!(cfg.translation_context);
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index efde5a95498c646ced643410faf307b8c47a836d..c738b3eb8795dd365aa8d08dfa16aa00d1c2d9e5 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -22,6 +22,7 @@
 use crate::commands;
 use crate::db::DataStore;
 use crate::errors::{self, CommandError};
+use crate::glossary::ActiveGlossary;
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
 use crate::overlay::{OverlaySurface, Surface};
 use crate::pro::{Entitlement, ProGate};
@@ -217,6 +218,8 @@
     pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
     /// Số lần `shutdown` và `kill_all` được gọi.
     pub shutdowns: Arc<Mutex<Vec<&'static str>>>,
+    /// Prompt của từng request dịch, kể cả lần làm nóng.
+    pub prompts: Arc<Mutex<Vec<String>>>,
 }
 
 struct FakeCapture {
@@ -265,7 +268,9 @@
     }
 }
 
-struct FakeMt;
+struct FakeMt {
+    prompts: Arc<Mutex<Vec<String>>>,
+}
 
 impl Mt for FakeMt {
     fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
@@ -274,9 +279,10 @@
 
     fn stream(
         &mut self,
-        _req: &ChatRequest,
+        req: &ChatRequest,
         on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
     ) -> Result<StreamEnd, MtError> {
+        self.prompts.lock().unwrap().push(req.prompt.to_string());
         let chunks = ["Xin", " chào", " mọi", " người."];
         for c in chunks {
             if on_delta(c).is_break() {
@@ -326,7 +332,9 @@
     }
 
     fn mt(&self) -> Box<dyn Mt> {
-        Box::new(FakeMt)
+        Box::new(FakeMt {
+            prompts: self.prompts.clone(),
+        })
     }
 
     fn vad(&self) -> VadFactory {
@@ -404,6 +412,7 @@
             data_dir,
             Ok(Keystore::mock("com.aitranslator.desktop.test")),
         ))
+        .manage(ActiveGlossary::default())
         .manage(pro)
         .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib glossary 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `glossary.rs`, `ActiveGlossary`, `FakeDeps.prompts`):
```text
error: could not compile `meeting-translator` (lib test) due to 69 previous errors; 1 warning emitted
error[E0061]: this function takes 2 arguments but 3 arguments were supplied
error[E0422]: cannot find struct, variant or union type `ImportReport` in this scope
error[E0425]: cannot find function `add` in module `crate::glossary`
error[E0425]: cannot find function `add` in this scope
error[E0425]: cannot find function `delete` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 92a8ddbee7ba88adaf6f7b07e1a569ab5286aeb2..95467d3c968e8c524d523569940a342f71699696 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -17,6 +17,8 @@
 [dependencies]
 anyhow.workspace = true
 audio-capture = { path = "../crates/audio-capture" }
+# Nhập và xuất từ điển thuật ngữ dạng CSV (glossary.rs).
+csv = "1.4.0"
 # Khóa ngẫu nhiên của DB (db.rs). Cùng bản `Cargo.lock` đã có (qua `tempfile`).
 getrandom = "0.4.3"
 keyring-core = "1.0.0"
```

Sửa `src-tauri/src/db.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/db.rs b/src-tauri/src/db.rs
index 9604986a9dc952c5ec081f31b3479cdf2535a9de..53ff335403eb1f25b30172119795539f84ada8e8 100644
--- a/src-tauri/src/db.rs
+++ b/src-tauri/src/db.rs
@@ -94,17 +94,20 @@
     Ok(())
 }
 
-/// Chạy `f` với DB của app. Chưa cài `DataStore` thì lỗi `dataUnavailable`.
-pub fn with<R: Runtime, T>(
+/// Chạy `f` với DB của app. Lỗi (của DB hay của `f`) thành `CommandError`; chưa cài `DataStore` thì `dataUnavailable`.
+pub fn with<R: Runtime, T, E>(
     app: &AppHandle<R>,
-    f: impl FnOnce(&mut Connection) -> Result<T, DbError>,
-) -> Result<T, CommandError> {
+    f: impl FnOnce(&mut Connection) -> Result<T, E>,
+) -> Result<T, CommandError>
+where
+    E: From<DbError> + Into<CommandError> + std::fmt::Display,
+{
     let store = app
         .try_state::<DataStore>()
         .ok_or_else(|| CommandError::new(errors::DATA_UNAVAILABLE, None, "chưa cài DataStore"))?;
     store.with(f).map_err(|e| {
-        log::error!("DB lỗi: {e}");
-        CommandError::from(e)
+        log::warn!("thao tác với DB lỗi: {e}");
+        e.into()
     })
 }
 
@@ -131,7 +134,7 @@
     }
 
     /// Chạy `f` với kết nối, mở DB nếu chưa mở. Các lần gọi chạy lần lượt (một kết nối, giữ khóa trong lúc chạy).
-    pub fn with<T>(&self, f: impl FnOnce(&mut Connection) -> Result<T, DbError>) -> Result<T, DbError> {
+    pub fn with<T, E: From<DbError>>(&self, f: impl FnOnce(&mut Connection) -> Result<T, E>) -> Result<T, E> {
         let mut slot = self.conn.lock().unwrap_or_else(|e| e.into_inner());
         if slot.is_none() {
             *slot = Some(self.open()?);
```

Thêm vào `src-tauri/src/glossary.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::time::{SystemTime, UNIX_EPOCH};

use pipeline::glossary::{Glossary, SharedGlossary, Term, normalize};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::db::{self, DbError};
use crate::errors::CommandError;
use crate::pro;

pub const MAX_ENTRIES: usize = 500;
pub const MAX_TERM_CHARS: usize = 200;
const BOM: char = '\u{feff}';
const HEADER: [&str; 2] = ["source", "target"];

/// Một cặp thuật ngữ như giao diện thấy.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GlossaryEntry {
    pub id: i64,
    pub source: String,
    pub target: String,
}

/// Kết quả một lần nhập CSV.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct ImportReport {
    pub added: usize,
    /// Chữ nguồn đã có, bản dịch được thay.
    pub updated: usize,
    /// Dòng không hợp lệ (thiếu cột, rỗng, quá dài, có ký tự điều khiển).
    pub skipped: usize,
    /// Dòng hợp lệ bị bỏ vì từ điển đã đủ 500 cặp.
    pub over_limit: usize,
}

/// Lỗi của một thao tác trên từ điển. Đổi sang `CommandError` với mã `glossary…` và trường bị lỗi.
#[derive(Debug, thiserror::Error)]
pub enum GlossaryError {
    #[error("{0} rỗng")]
    Empty(&'static str),
    #[error("{0} dài quá {MAX_TERM_CHARS} ký tự")]
    TooLong(&'static str),
    #[error("{0} có ký tự điều khiển")]
    InvalidChar(&'static str),
    #[error("chữ nguồn đã có trong từ điển")]
    Duplicate,
    #[error("từ điển đã đủ {MAX_ENTRIES} cặp")]
    Full,
    #[error("không có mục {0}")]
    NotFound(i64),
    #[error("file CSV không đọc được: {0}")]
    Csv(String),
    #[error(transparent)]
    Db(#[from] DbError),
}

impl From<rusqlite::Error> for GlossaryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(DbError::Sql(e))
    }
}

impl From<GlossaryError> for CommandError {
    fn from(e: GlossaryError) -> Self {
        let message = e.to_string();
        let (code, field) = match e {
            GlossaryError::Empty(field) => ("glossaryEmpty", Some(field)),
            GlossaryError::TooLong(field) => ("glossaryTooLong", Some(field)),
            GlossaryError::InvalidChar(field) => ("glossaryInvalidChar", Some(field)),
            GlossaryError::Duplicate => ("glossaryDuplicate", Some("source")),
            GlossaryError::Full => ("glossaryFull", None),
            GlossaryError::NotFound(_) => ("glossaryNotFound", None),
            GlossaryError::Csv(_) => ("csvInvalid", None),
            GlossaryError::Db(e) => return CommandError::from(e),
        };
        CommandError::new(code, field, message)
    }
}

/// Mã lỗi của module này, để test kiểm mỗi mã có câu báo lỗi trong i18n.
pub const ERROR_CODES: &[&str] = &[
    "glossaryEmpty",
    "glossaryTooLong",
    "glossaryInvalidChar",
    "glossaryDuplicate",
    "glossaryFull",
    "glossaryNotFound",
    "csvInvalid",
];

/// Cắt khoảng trắng và kiểm một ô; `field` là `source` hoặc `target`.
fn clean(field: &'static str, value: &str) -> Result<String, GlossaryError> {
    let value = value.trim();
    if value.is_empty() {
        return Err(GlossaryError::Empty(field));
    }
    if value.chars().count() > MAX_TERM_CHARS {
        return Err(GlossaryError::TooLong(field));
    }
    if value.chars().any(char::is_control) {
        return Err(GlossaryError::InvalidChar(field));
    }
    Ok(value.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64)
}

fn count(conn: &Connection) -> Result<usize, GlossaryError> {
    Ok(conn.query_row("SELECT count(*) FROM glossary", [], |r| r.get::<_, i64>(0))? as usize)
}

fn id_of_key(conn: &Connection, key: &str) -> Result<Option<i64>, GlossaryError> {
    Ok(conn
        .query_row("SELECT id FROM glossary WHERE match_key = ?1", [key], |r| r.get(0))
        .optional()?)
}

pub fn list(conn: &Connection) -> Result<Vec<GlossaryEntry>, GlossaryError> {
    let mut stmt = conn.prepare("SELECT id, source, target FROM glossary ORDER BY id")?;
    let rows = stmt.query_map([], |r| {
        Ok(GlossaryEntry {
            id: r.get(0)?,
            source: r.get(1)?,
            target: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn add(conn: &Connection, source: &str, target: &str) -> Result<GlossaryEntry, GlossaryError> {
    let (source, target) = (clean("source", source)?, clean("target", target)?);
    let key = normalize(&source);
    if id_of_key(conn, &key)?.is_some() {
        return Err(GlossaryError::Duplicate);
    }
    if count(conn)? >= MAX_ENTRIES {
        return Err(GlossaryError::Full);
    }
    conn.execute(
        "INSERT INTO glossary (source, target, match_key, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![source, target, key, now_ms()],
    )?;
    Ok(GlossaryEntry {
        id: conn.last_insert_rowid(),
        source,
        target,
    })
}

pub fn update(conn: &Connection, id: i64, source: &str, target: &str) -> Result<GlossaryEntry, GlossaryError> {
    let (source, target) = (clean("source", source)?, clean("target", target)?);
    let key = normalize(&source);
    if id_of_key(conn, &key)?.is_some_and(|other| other != id) {
        return Err(GlossaryError::Duplicate);
    }
    let changed = conn.execute(
        "UPDATE glossary SET source = ?1, target = ?2, match_key = ?3 WHERE id = ?4",
        params![source, target, key, id],
    )?;
    if changed == 0 {
        return Err(GlossaryError::NotFound(id));
    }
    Ok(GlossaryEntry { id, source, target })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), GlossaryError> {
    if conn.execute("DELETE FROM glossary WHERE id = ?1", [id])? == 0 {
        return Err(GlossaryError::NotFound(id));
    }
    Ok(())
}

/// Ô này Excel sẽ đọc như công thức (bắt đầu bằng `=`, `+`, `-`, `@`), hoặc là một ô đã được [`guard`] (một dấu `'` rồi
/// tới một ô như vậy): cần thêm dấu `'` khi xuất.
fn needs_guard(cell: &str) -> bool {
    match cell.chars().next() {
        Some('=' | '+' | '-' | '@') => true,
        Some('\'') => needs_guard(&cell[1..]),
        _ => false,
    }
}

/// Ô khi xuất CSV: thêm `'` ở đầu nếu Excel sẽ đọc ô như công thức.
pub fn guard(cell: &str) -> String {
    if needs_guard(cell) {
        format!("'{cell}")
    } else {
        cell.to_string()
    }
}

/// Ngược của [`guard`] khi nhập CSV: bỏ một dấu `'` ở đầu nếu phần còn lại là ô cần chặn.
pub fn unguard(cell: String) -> String {
    match cell.strip_prefix('\'') {
        Some(rest) if needs_guard(rest) => rest.to_string(),
        _ => cell,
    }
}

/// Ghi cả từ điển ra CSV (UTF-8 có BOM, dòng đầu là tên cột).
pub fn export_csv(conn: &Connection) -> Result<String, GlossaryError> {
    let mut out = csv::Writer::from_writer(Vec::new());
    out.write_record(HEADER)
        .map_err(|e| GlossaryError::Csv(e.to_string()))?;
    for e in list(conn)? {
        out.write_record([guard(&e.source), guard(&e.target)])
            .map_err(|e| GlossaryError::Csv(e.to_string()))?;
    }
    let bytes = out.into_inner().map_err(|e| GlossaryError::Csv(e.to_string()))?;
    let text = String::from_utf8(bytes).map_err(|e| GlossaryError::Csv(e.to_string()))?;
    Ok(format!("{BOM}{text}"))
}

/// Nhập CSV vào từ điển đang có (xem đầu module). File không phải UTF-8 (ví dụ Excel lưu theo bảng mã của Windows) thì
/// lỗi `csvInvalid`, không nhập gì. Bộ đọc CSV dễ dãi: ngoặc kép chưa đóng ở cuối file thì lấy tới hết file.
pub fn import_csv(conn: &mut Connection, bytes: &[u8]) -> Result<ImportReport, GlossaryError> {
    // Bộ đọc của `csv` tự bỏ BOM ở đầu file.
    let text = std::str::from_utf8(bytes).map_err(|e| GlossaryError::Csv(format!("không phải UTF-8: {e}")))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(text.as_bytes());
    let mut rows = Vec::new();
    for record in reader.records() {
        rows.push(record.map_err(|e| GlossaryError::Csv(e.to_string()))?);
    }
    let is_header = |r: &csv::StringRecord| {
        r.len() >= 2
            && HEADER
                .iter()
                .zip(r.iter())
                .all(|(h, v)| v.trim().eq_ignore_ascii_case(h))
    };
    let skip = usize::from(rows.first().is_some_and(is_header));
    let tx = conn.transaction()?;
    let mut report = ImportReport::default();
    let mut total = count(&tx)?;
    for row in &rows[skip..] {
        let (Some(source), Some(target)) = (row.get(0), row.get(1)) else {
            report.skipped += 1;
            continue;
        };
        let (Ok(source), Ok(target)) = (clean("source", source), clean("target", target)) else {
            report.skipped += 1;
            continue;
        };
        let (source, target) = (unguard(source), unguard(target));
        let key = normalize(&source);
        match id_of_key(&tx, &key)? {
            Some(id) => {
                tx.execute(
                    "UPDATE glossary SET target = ?1 WHERE id = ?2 AND target <> ?1",
                    params![target, id],
                )?;
                report.updated += 1;
            }
            None if total >= MAX_ENTRIES => report.over_limit += 1,
            None => {
                tx.execute(
                    "INSERT INTO glossary (source, target, match_key, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![source, target, key, now_ms()],
                )?;
                total += 1;
                report.added += 1;
            }
        }
    }
    tx.commit()?;
    Ok(report)
}

/// Từ điển của luồng dịch, dùng chung cho mọi phiên. Quản lý bằng `app.manage`.
#[derive(Default)]
pub struct ActiveGlossary(pub SharedGlossary);

/// Gói về Free: luồng dịch thôi dùng thuật ngữ ngay, từ câu sau (N11 của review 03). Không đọc DB.
pub fn forget<R: Runtime>(app: &AppHandle<R>) {
    if let Some(active) = app.try_state::<ActiveGlossary>() {
        *active.0.write().unwrap_or_else(|e| e.into_inner()) = Glossary::default();
    }
}

/// Nạp lại từ điển của luồng dịch: Pro thì đọc DB, Free thì rỗng. Đọc DB lỗi thì để rỗng và ghi log (phiên vẫn dịch,
/// chỉ không có thuật ngữ). Gọi lúc bắt đầu phiên và sau mỗi lần sửa từ điển.
pub fn reload<R: Runtime>(app: &AppHandle<R>) {
    let Some(active) = app.try_state::<ActiveGlossary>() else {
        return;
    };
    let next = if pro::is_pro(app) {
        match db::with(app, |c| list(c)) {
            Ok(entries) => Glossary::new(entries.into_iter().map(|e| Term {
                source: e.source,
                target: e.target,
            })),
            Err(e) => {
                log::warn!("không nạp được từ điển thuật ngữ: {}", e.message);
                Glossary::default()
            }
        }
    } else {
        Glossary::default()
    };
    *active.0.write().unwrap_or_else(|e| e.into_inner()) = next;
}
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index b2fb1ffaac5873729f528c8eee7fbb52b2b23ed0..211f56fddc97e46bc7d244fc0ca9dd25b51113d0 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -121,6 +121,7 @@
     pro::install_default_gate(&handle);
     // DB mã hóa của lịch sử và từ điển: chưa mở, chưa đọc kho khóa ở đây (db.rs).
     db::install(&handle)?;
+    app.manage(glossary::ActiveGlossary::default());
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Sửa `src-tauri/src/pro.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/pro.rs b/src-tauri/src/pro.rs
index 35c0923cd0c30774c9fb3f8a1f6de5d0496f9372..6e45fcc2fa06dd2629e2301ad1b65e8952db286f 100644
--- a/src-tauri/src/pro.rs
+++ b/src-tauri/src/pro.rs
@@ -113,6 +113,11 @@
     }
     state.update_status(|s| s.pro = pro);
     actions::status_changed(app);
+    // Về Free giữa phiên (06: hết hạn, bị thu hồi): thuật ngữ thôi vào prompt ngay (N11 của review 03). Lên Pro thì
+    // không đọc DB ở đây (lúc khởi động không mở DB, QĐ4): phiên sau nạp từ điển lúc bắt đầu.
+    if !pro {
+        crate::glossary::forget(app);
+    }
 }
 
 #[cfg(test)]
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 57026cc3362089c2f3cdecf74a954827688eaba2..beb4240aeac09bc1fe39472516efaab3633ad718 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -24,6 +24,7 @@
 
 use pipeline::config::PipelineConfig;
 use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
+use pipeline::glossary::SharedGlossary;
 use pipeline::prompt::Lang as MtLang;
 use pipeline::subtitle::{Delta, Subtitle};
 use pipeline::supervisor::{Asr, GiveUpCause, SidecarEvent, SidecarEvents, SidecarManager, SystemClock, Which};
@@ -33,6 +34,7 @@
 
 use crate::capture::{CaptureEvent, LiveCapture, OnEvent};
 use crate::errors::{self, CommandError};
+use crate::glossary::{self, ActiveGlossary};
 use crate::settings::{AudioSource, Lang, ModelTier, Settings};
 use crate::sidecar::{self, first_run, integrity};
 use crate::state::{AppState, AppStatus, Loading, SessionStatus};
@@ -130,8 +132,8 @@
     }
 }
 
-/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh.
-pub fn engine_config(settings: &Settings, id_base: u64) -> EngineConfig {
+/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh; và từ điển thuật ngữ dùng chung.
+pub fn engine_config(settings: &Settings, id_base: u64, glossary: SharedGlossary) -> EngineConfig {
     let mut pipeline = PipelineConfig::default();
     pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
     let languages = match settings.source_lock {
@@ -148,7 +150,7 @@
         target: MtLang::from_code(code_of(settings.target_language)).expect("năm ngôn ngữ của F2"),
         translation_context: settings.experimental.translation_context,
         id_base,
-        glossary: Default::default(),
+        glossary,
     }
 }
 
@@ -267,6 +269,12 @@
     if !current() {
         return Ok(state.status());
     }
+    // Từ điển thuật ngữ theo gói và theo DB lúc này (§6.5, F5); đọc DB có thể chờ kho khóa nên làm trước khi giữ khóa.
+    glossary::reload(app);
+    let glossary = app
+        .try_state::<ActiveGlossary>()
+        .map(|g| g.0.clone())
+        .unwrap_or_default();
     // Từ đây tới lúc gắn engine thì giữ khóa (nhanh: chỉ mở nguồn và tạo luồng): lỗi của nguồn âm thanh tới ngay lúc mở
     // (`fail`, trên luồng riêng) chờ tới khi engine đã gắn rồi mới dừng nó.
     let _gate = session.gate.lock().unwrap();
@@ -283,7 +291,7 @@
         asr_code: session.deps.clone(),
     });
     let engine = match Engine::start(
-        engine_config(&settings, n * ID_STRIDE),
+        engine_config(&settings, n * ID_STRIDE, glossary),
         source,
         session.deps.vad(),
         session.deps.asr(),
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index eb020a83d726dab5eba5c6bb86c55c635cf371b8..67ed717c6214becd477aaec92f37e7c192b3902d 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -168,6 +168,13 @@
   "error.quotaExhausted": "The translation quota has been used up.",
   "error.proRequired": "This is a Pro feature. Upgrade to a paid plan to use it.",
   "error.dataUnavailable": "Could not open the history and glossary data. If the system asked for keychain access, allow it and try again.",
+  "error.glossaryEmpty": "Fill in both the term and its translation.",
+  "error.glossaryTooLong": "Use at most 200 characters.",
+  "error.glossaryInvalidChar": "Line breaks and tabs are not allowed.",
+  "error.glossaryDuplicate": "This term is already in the glossary.",
+  "error.glossaryFull": "The glossary already has 500 terms. Delete some before adding more.",
+  "error.glossaryNotFound": "This term no longer exists.",
+  "error.csvInvalid": "This CSV file could not be read. Nothing was imported.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 45c715e9b7a102e84623e091be520942b2d87e69..d8eeb932a4e24878bcf94ca76e88ddfb0504cd07 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -168,5 +168,12 @@
   "error.quotaExhausted": "Đã dùng hết hạn mức dịch.",
   "error.proRequired": "Đây là tính năng Pro. Nâng cấp lên gói trả phí để dùng.",
   "error.dataUnavailable": "Không mở được dữ liệu lịch sử và từ điển. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
+  "error.glossaryEmpty": "Hãy điền cả thuật ngữ lẫn bản dịch.",
+  "error.glossaryTooLong": "Dùng tối đa 200 ký tự.",
+  "error.glossaryInvalidChar": "Không dùng được dấu xuống dòng và dấu tab.",
+  "error.glossaryDuplicate": "Thuật ngữ này đã có trong từ điển.",
+  "error.glossaryFull": "Từ điển đã đủ 500 thuật ngữ. Hãy xóa bớt trước khi thêm.",
+  "error.glossaryNotFound": "Thuật ngữ này không còn nữa.",
+  "error.csvInvalid": "Không đọc được file CSV này. Chưa nhập gì.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Khóa đúng bản đã thử:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && cargo update -q -p csv --precise 1.4.0 && grep -A1 -E '^name = "(csv|csv-core)"' Cargo.lock
```
Expected (lúc lập kế hoạch):
```text
name = "csv"
version = "1.4.0"
--
name = "csv-core"
version = "0.1.13"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib glossary -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::glossary_terms_reach_the_prompt_only_for_pro ... ok
test app_tests::losing_pro_empties_the_glossary_of_the_translation_thread ... ok
test glossary::tests::add_update_delete_and_list ... ok
test glossary::tests::at_most_500_entries ... ok
test glossary::tests::csv_cells_that_excel_reads_as_formulas_are_guarded ... ok
test glossary::tests::csv_roundtrip_keeps_commas_quotes_and_vietnamese ... ok
test glossary::tests::duplicates_follow_the_matching_rules ... ok
test glossary::tests::import_stops_adding_at_500_and_a_file_that_is_not_utf8_imports_nothing ... ok
test glossary::tests::import_updates_existing_terms_and_counts_bad_rows ... ok
test glossary::tests::values_are_checked ... ok
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 179 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib db:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test db::tests::a_database_of_a_newer_app_is_refused ... ok
test db::tests::a_lost_key_moves_the_old_file_aside ... ok
test db::tests::a_new_database_is_encrypted_and_has_the_schema ... ok
test db::tests::a_wrong_key_also_moves_the_old_file_aside ... ok
test db::tests::keys_are_64_hex_digits ... ok
test db::tests::keystore_errors_leave_the_file_alone ... ok
test db::tests::reopening_uses_the_same_key ... ok
test db::tests::set_aside_keeps_older_copies_and_drops_the_journal ... ok
test db::tests::the_cipher_provider_matches_the_platform ... ok
test db::tests::the_file_cannot_be_read_without_the_right_key ... ok
test db::tests::the_sqlite3_tool_cannot_read_the_file ... ok
test db::tests::wipe_removes_the_file_and_the_key ... ok
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 177 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 187 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  6 passed (6)
      Tests  67 passed (67)
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/app_tests.rs \
  src-tauri/src/db.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/glossary.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/pro.rs \
  src-tauri/src/session.rs \
  src-tauri/src/test_support.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): từ điển thuật ngữ trong DB mã hóa, nhập và xuất CSV, đưa vào phiên dịch ở gói Pro (F5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 6: Bản chép lời trong bộ nhớ và xuất TXT, SRT, Markdown

Dòng 18, 45, 47, 151, 152, 154, 156, 292 (phần xuất file); QĐ16.

- `transcript/store.rs`: `TranscriptStore` giữ mọi phụ đề của phiên hiện tại hoặc vừa dừng (theo đúng luật `upsert`, `delta`, `replaces`), không giới hạn số dòng; bỏ sự kiện của phiên khác; `end` trả bản chép lời một lần khi phiên dừng.
- `transcript/export.rs`: `txt`, `srt`, `markdown`, `file_name`; giờ địa phương theo độ lệch múi giờ (`local_time`, thuật toán `civil_from_days`); chữ trong file theo ngôn ngữ giao diện (`i18n.rs` thêm sáu chuỗi).
- `session.rs`: `begin` khi phiên bắt đầu, `TauriSink` ghi phụ đề vào bản chép lời trước khi phát sự kiện, `stop_engine` chốt bản chép lời.

**Files:**
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/i18n.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/test_support.rs`
- Create: `src-tauri/src/transcript/export.rs`
- Create: `src-tauri/src/transcript/mod.rs`
- Create: `src-tauri/src/transcript/store.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 6270209029578dbf1dfb884a4f4329fad2352bb7..919baaafc89cf3e77536d5d644570451680bfce9 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -534,6 +534,38 @@
     assert!(before < running && running < idle, "{before} {running} {idle}");
 }
 
+/// Bản chép lời của phiên nằm trong bộ nhớ (§6.6): đủ các câu, chữ dịch đầy đủ; dừng phiên thì có giờ kết thúc; phiên sau
+/// bắt đầu với bản mới.
+#[test]
+fn a_session_keeps_its_transcript_in_memory() {
+    use crate::transcript::store::TranscriptStore;
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let _main = window(&app, "main");
+    let store = app.state::<TranscriptStore>();
+    session::start(app.handle()).unwrap();
+    wait_until("một câu dịch xong", || {
+        store
+            .snapshot()
+            .lines
+            .iter()
+            .any(|l| l.tgt_text == "Xin chào mọi người.")
+    });
+    assert_eq!(store.snapshot().ended_at, None);
+    session::stop(app.handle());
+    let t = store.snapshot();
+    assert_eq!((t.session, t.target_lang.as_str()), (1, "vi"));
+    assert!(t.started_at > 1_700_000_000_000, "giờ Unix ms: {}", t.started_at);
+    assert!(t.ended_at.is_some_and(|end| end >= t.started_at));
+    assert!(t.lines.iter().all(|l| l.src_text == "Hello everyone."));
+    session::start(app.handle()).unwrap();
+    assert_eq!(store.snapshot().session, 2);
+    assert_eq!(store.snapshot().ended_at, None);
+    session::stop(app.handle());
+}
+
 /// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
 #[test]
 fn glossary_terms_reach_the_prompt_only_for_pro() {
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 211f56fddc97e46bc7d244fc0ca9dd25b51113d0..33c6a6308934056b9a82bb10343492cb56883c39 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -28,6 +28,7 @@
 pub mod sidecar;
 pub mod state;
 pub mod system;
+pub mod transcript;
 pub mod tray;
 pub mod tray_menu;
 pub mod window;
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index c738b3eb8795dd365aa8d08dfa16aa00d1c2d9e5..12aca690685267a358ae1c2143fa09e497759229 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -33,6 +33,7 @@
 use crate::settings::{AudioSource, Settings, UiLanguage};
 use crate::state::AppState;
 use crate::system::{System, SystemOpener};
+use crate::transcript::store::TranscriptStore;
 
 /// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`.
 #[derive(Clone, Default)]
@@ -413,6 +414,7 @@
             Ok(Keystore::mock("com.aitranslator.desktop.test")),
         ))
         .manage(ActiveGlossary::default())
+        .manage(TranscriptStore::default())
         .manage(pro)
         .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
```

Tạo `src-tauri/src/transcript/export.rs`, lúc này mới có phần test:

```rust
//! Xuất bản chép lời (spec §6.6 "Xuất file", F4): TXT, SRT, Markdown. Viết phía Rust vì webview chặn `blob:` (§10.2, spec
//! §11); giao diện chỉ chọn định dạng, phía Rust ghi file (`commands`) hoặc trả chữ để sao chép.
//!
//! - **TXT:** mỗi câu là `[giờ] câu gốc` rồi dòng `→ bản dịch`, các câu cách nhau một dòng trống. Giờ là giờ địa phương
//!   lúc câu bắt đầu, `HH:MM:SS`.
//! - **SRT:** chọn xuất câu gốc hay bản dịch; mốc thời gian tính từ đầu phiên (`HH:MM:SS,mmm`), để ghép được với bản ghi
//!   hình của cuộc họp nếu người dùng có.
//! - **Markdown:** tiêu đề có ngày giờ bắt đầu phiên, rồi một bảng ba cột (giờ, câu gốc, bản dịch); ký tự đặc biệt của
//!   Markdown trong câu được thoát.
//!
//! Câu theo trạng thái (§6.6): `dropped` hiện "[bỏ qua đoạn]"; `failed` có bản dịch là "(chưa dịch được)"; `same_lang` và
//! `skipped` chỉ có câu gốc. SRT bản dịch: câu không có bản dịch thì hiện câu gốc. Chữ theo ngôn ngữ giao diện (`i18n.rs`).
//!
//! Giờ địa phương: app không kèm cơ sở dữ liệu múi giờ; giao diện gửi độ lệch so với UTC lúc xuất (`utc_offset_minutes`,
//! từ `Date.getTimezoneOffset()` của webview).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n::{EN, VI};

    /// 2026-10-02 07:05:00 UTC, tức 14:05:00 giờ Việt Nam (UTC+7).
    const STARTED: u64 = 1_790_924_700_000;
    const HANOI: i32 = 7 * 60;

    fn line(id: u64, start_ms: u64, src: &str, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms,
            end_ms: start_ms + 2_500,
            src_lang: "en".into(),
            src_text: src.into(),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
        }
    }

    fn transcript() -> Transcript {
        Transcript {
            session: 1,
            started_at: STARTED,
            ended_at: Some(STARTED + 60_000),
            target_lang: "vi".into(),
            lines: vec![
                line(
                    1,
                    1_000,
                    "Good morning, everyone.",
                    "Chào buổi sáng mọi người.",
                    Status::Done,
                ),
                line(2, 9_450, "Xin chào.", "", Status::SameLang),
                line(3, 15_000, "", "", Status::Dropped),
                line(4, 3_600_000 + 61_234, "The *final* | answer", "", Status::Failed),
            ],
        }
    }

    #[test]
    fn local_time_follows_the_calendar_and_the_offset() {
        let l = local_time(STARTED, HANOI);
        assert_eq!(
            (l.year, l.month, l.day, l.hour, l.minute, l.second),
            (2026, 10, 2, 14, 5, 0)
        );
        let utc = local_time(STARTED, 0);
        assert_eq!((utc.day, utc.hour), (2, 7));
        // Lệch âm qua nửa đêm, năm nhuận, đầu năm.
        let ny = local_time(STARTED, -9 * 60);
        assert_eq!((ny.day, ny.hour), (1, 22));
        let leap = local_time(1_709_164_800_000, 0); // 2024-02-29 00:00 UTC
        assert_eq!((leap.year, leap.month, leap.day), (2024, 2, 29));
        let epoch = local_time(0, 0);
        assert_eq!((epoch.year, epoch.month, epoch.day, epoch.hour), (1970, 1, 1, 0));
    }

    #[test]
    fn txt_has_time_source_then_translation() {
        assert_eq!(
            txt(&transcript(), HANOI, &VI),
            "[14:05:01] Good morning, everyone.\n→ Chào buổi sáng mọi người.\n\n\
             [14:05:09] Xin chào.\n\n\
             [14:05:15] [bỏ qua đoạn]\n\n\
             [15:06:01] The *final* | answer\n→ (chưa dịch được)\n\n"
        );
        assert!(txt(&transcript(), HANOI, &EN).contains("[segment skipped]"));
        assert_eq!(txt(&Transcript::default(), 0, &VI), "");
    }

    #[test]
    fn srt_uses_session_offsets_and_the_chosen_text() {
        assert_eq!(
            srt(&transcript(), SrtText::Translation, &VI),
            "1\n00:00:01,000 --> 00:00:03,500\nChào buổi sáng mọi người.\n\n\
             2\n00:00:09,450 --> 00:00:11,950\nXin chào.\n\n\
             3\n00:00:15,000 --> 00:00:17,500\n[bỏ qua đoạn]\n\n\
             4\n01:01:01,234 --> 01:01:03,734\nThe *final* | answer\n\n"
        );
        let source = srt(&transcript(), SrtText::Source, &EN);
        assert!(source.starts_with("1\n00:00:01,000 --> 00:00:03,500\nGood morning, everyone.\n\n"));
        let empty = Transcript {
            lines: vec![line(1, 0, "  ", "", Status::SameLang)],
            ..transcript()
        };
        assert_eq!(srt(&empty, SrtText::Source, &VI), "", "câu rỗng không thành mục SRT");
    }

    #[test]
    fn markdown_is_a_table_with_escaped_text() {
        assert_eq!(
            markdown(&transcript(), HANOI, &VI),
            "# Bản chép lời · 2026-10-02 14:05\n\n\
             | Giờ | Câu gốc | Bản dịch |\n|---|---|---|\n\
             | 14:05:01 | Good morning, everyone. | Chào buổi sáng mọi người. |\n\
             | 14:05:09 | Xin chào. |  |\n\
             | 14:05:15 | \\[bỏ qua đoạn\\] |  |\n\
             | 15:06:01 | The \\*final\\* \\| answer | (chưa dịch được) |\n"
        );
        assert!(markdown(&transcript(), 0, &EN).starts_with("# Transcript · 2026-10-02 07:05\n"));
        assert_eq!(escape_markdown("a\nb_c\\d"), "a b\\_c\\\\d");
    }

    #[test]
    fn file_names_follow_the_session_start() {
        assert_eq!(
            file_name(&transcript(), Format::Markdown, HANOI),
            "transcript-2026-10-02-1405.md"
        );
        assert_eq!(
            file_name(&transcript(), Format::Srt, 0),
            "transcript-2026-10-02-0705.srt"
        );
    }
}
```

Tạo `src-tauri/src/transcript/mod.rs`:

```rust
//! Bản chép lời (spec §6.6, F4): trong bộ nhớ theo từng phiên (`store.rs`), xuất file (`export.rs`), lịch sử trong DB mã
//! hóa (`history.rs`).

pub mod export;
pub mod store;
```

Tạo `src-tauri/src/transcript/store.rs`, lúc này mới có phần test:

```rust
//! Bản chép lời của phiên, trong bộ nhớ (spec §6.6 "Lưu trữ", F4): mọi phụ đề của phiên đang chạy hoặc phiên vừa dừng,
//! theo đúng luật của thanh phụ đề (`upsert` thay cả đối tượng, `delta` nối chữ dịch, `replaces` xóa phụ đề đã gộp), nhưng
//! không giới hạn số dòng. Cửa sổ chính đọc bản này khi mở màn hình Bản chép lời; khi phiên dừng, app lưu nó vào lịch sử
//! nếu bật "Lưu lịch sử" và đang là Pro (`history.rs`). Phiên mới bắt đầu thì bản cũ bị thay.

#[cfg(test)]
mod tests {
    use super::*;
    use pipeline::subtitle::Status;

    fn sub(id: u64, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms: id * 1_000,
            end_ms: id * 1_000 + 800,
            src_lang: "en".into(),
            src_text: format!("source {id}"),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
        }
    }

    #[test]
    fn keeps_every_line_of_the_session_in_order() {
        let store = TranscriptStore::default();
        store.begin(1, 5_000, "vi");
        store.upsert(1, &sub(3, "", Status::Translating));
        store.delta(
            1,
            &Delta {
                id: 3,
                text: "Ba".into(),
            },
        );
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.upsert(1, &sub(2, "", Status::SameLang));
        let t = store.snapshot();
        assert_eq!((t.session, t.started_at, t.target_lang.as_str()), (1, 5_000, "vi"));
        let ids: Vec<u64> = t.lines.iter().map(|l| l.id).collect();
        assert_eq!(ids, [1, 2, 3]);
        assert_eq!(t.lines[2].tgt_text, "Ba", "chữ dịch tới dần được nối");
        for id in 4..2_000 {
            store.upsert(1, &sub(id, "x", Status::Done));
        }
        assert_eq!(
            store.snapshot().lines.len(),
            1_999,
            "không giới hạn số dòng như thanh phụ đề"
        );
    }

    #[test]
    fn merged_subtitles_replace_the_ones_they_absorb() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        for id in 1..=3 {
            store.upsert(1, &sub(id, "", Status::AsrDone));
        }
        let merged = Subtitle {
            replaces: vec![2, 3],
            ..sub(2, "Hai ba", Status::Done)
        };
        store.upsert(1, &merged);
        let t = store.snapshot();
        assert_eq!(t.lines.iter().map(|l| l.id).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(t.lines[1].tgt_text, "Hai ba");
    }

    #[test]
    fn events_of_another_session_are_ignored_and_a_new_session_starts_empty() {
        let store = TranscriptStore::default();
        store.begin(1, 0, "vi");
        store.upsert(1, &sub(1, "Một", Status::Done));
        store.begin(2, 9_000, "en");
        store.upsert(1, &sub(2, "muộn", Status::Done));
        store.delta(
            1,
            &Delta {
                id: 2,
                text: "x".into(),
            },
        );
        let t = store.snapshot();
        assert_eq!((t.session, t.target_lang.as_str(), t.lines.len()), (2, "en", 0));
    }

    #[test]
    fn end_returns_the_transcript_once() {
        let store = TranscriptStore::default();
        assert_eq!(store.end(0, 1), None, "chưa có phiên");
        store.begin(1, 100, "vi");
        store.upsert(1, &sub(1, "Một", Status::Done));
        assert_eq!(store.end(2, 500), None, "không phải phiên hiện tại");
        let t = store.end(1, 500).unwrap();
        assert_eq!((t.ended_at, t.lines.len()), (Some(500), 1));
        assert_eq!(store.end(1, 600), None, "đã dừng rồi");
        assert_eq!(store.snapshot().ended_at, Some(500));
        store.clear();
        assert!(store.snapshot().lines.is_empty());
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib transcript:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `transcript/`, chuỗi `export_*`):
```text
error: could not compile `meeting-translator` (lib test) due to 44 previous errors; 2 warnings emitted
error[E0422]: cannot find struct, variant or union type `Delta` in this scope
error[E0422]: cannot find struct, variant or union type `Subtitle` in this scope
error[E0422]: cannot find struct, variant or union type `Transcript` in this scope
error[E0425]: cannot find function `escape_markdown` in this scope
error[E0425]: cannot find function `file_name` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/i18n.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/i18n.rs b/src-tauri/src/i18n.rs
index 89993b26f8681ebe8e67bf296b9b7de0c49c7424..58f0253768a4f14e2c771da877d30f502977fd5c 100644
--- a/src-tauri/src/i18n.rs
+++ b/src-tauri/src/i18n.rs
@@ -1,4 +1,4 @@
-//! Chuỗi phía Rust (spec §4.5): menu khay, chú thích icon khay, tiêu đề cửa sổ.
+//! Chuỗi phía Rust (spec §4.5): menu khay, chú thích icon khay, tiêu đề cửa sổ, chữ trong file xuất bản chép lời.
 //! Giao diện React có từ điển riêng ở `src/i18n/`. MVP không dùng thông báo hệ thống (Q13):
 //! lỗi và lời nhắc hiện ngay trong app (cửa sổ chính, menu khay, thanh phụ đề).
 //!
@@ -23,6 +23,13 @@
     pub status_idle: &'static str,
     pub status_running: &'static str,
     pub overlay_title: &'static str,
+    /// File xuất bản chép lời (`transcript/export.rs`): tiêu đề, tên cột, đoạn bị bỏ, câu dịch lỗi.
+    pub export_title: &'static str,
+    pub export_time: &'static str,
+    pub export_source: &'static str,
+    pub export_translation: &'static str,
+    pub export_dropped: &'static str,
+    pub export_failed: &'static str,
 }
 
 pub const EN: Strings = Strings {
@@ -39,6 +46,12 @@
     status_idle: "Ready",
     status_running: "Translating",
     overlay_title: "Subtitles",
+    export_title: "Transcript",
+    export_time: "Time",
+    export_source: "Original",
+    export_translation: "Translation",
+    export_dropped: "[segment skipped]",
+    export_failed: "(not translated)",
 };
 
 pub const VI: Strings = Strings {
@@ -55,6 +68,12 @@
     status_idle: "Sẵn sàng",
     status_running: "Đang dịch",
     overlay_title: "Phụ đề",
+    export_title: "Bản chép lời",
+    export_time: "Giờ",
+    export_source: "Câu gốc",
+    export_translation: "Bản dịch",
+    export_dropped: "[bỏ qua đoạn]",
+    export_failed: "(chưa dịch được)",
 };
 
 impl Strings {
@@ -75,6 +94,12 @@
             status_idle,
             status_running,
             overlay_title,
+            export_title,
+            export_time,
+            export_source,
+            export_translation,
+            export_dropped,
+            export_failed,
         } = *self;
         vec![
             ("tray_start", tray_start),
@@ -90,6 +115,12 @@
             ("status_idle", status_idle),
             ("status_running", status_running),
             ("overlay_title", overlay_title),
+            ("export_title", export_title),
+            ("export_time", export_time),
+            ("export_source", export_source),
+            ("export_translation", export_translation),
+            ("export_dropped", export_dropped),
+            ("export_failed", export_failed),
         ]
     }
 
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 33c6a6308934056b9a82bb10343492cb56883c39..6b283584576fa3fc4fa6df36663f723b4cbe25c4 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -123,6 +123,7 @@
     // DB mã hóa của lịch sử và từ điển: chưa mở, chưa đọc kho khóa ở đây (db.rs).
     db::install(&handle)?;
     app.manage(glossary::ActiveGlossary::default());
+    app.manage(transcript::store::TranscriptStore::default());
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index beb4240aeac09bc1fe39472516efaab3633ad718..dad11c562e8b594b727b27d78af031c7ecd92b4c 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -20,7 +20,7 @@
 use std::path::{Path, PathBuf};
 use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
 use std::sync::{Arc, Mutex};
-use std::time::{Duration, Instant};
+use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
 
 use pipeline::config::PipelineConfig;
 use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
@@ -38,6 +38,7 @@
 use crate::settings::{AudioSource, Lang, ModelTier, Settings};
 use crate::sidecar::{self, first_run, integrity};
 use crate::state::{AppState, AppStatus, Loading, SessionStatus};
+use crate::transcript::store::TranscriptStore;
 use crate::{actions, events, overlay, window};
 
 /// Chu kỳ gọi `SessionDeps::tick` (tắt tiến trình phụ khi rảnh 10 phút). Để ngoài `PipelineConfig`: chỉ là nhịp kiểm, mốc
@@ -282,6 +283,9 @@
         return Ok(state.status());
     }
     let n = session.sessions.fetch_add(1, Ordering::SeqCst) + 1;
+    if let Some(transcript) = app.try_state::<TranscriptStore>() {
+        transcript.begin(n, now_ms(), code_of(settings.target_language));
+    }
     let source = session
         .deps
         .capture(&settings.audio_source, options.include_self, capture_events(app, n));
@@ -353,8 +357,9 @@
     })
 }
 
-/// Dừng engine (nếu có) và báo cho tiến trình phụ. Không đổi trạng thái. Trả `false` nếu không có engine nào chạy.
-fn stop_engine(session: &Session) -> bool {
+/// Dừng engine (nếu có), báo cho tiến trình phụ, chốt bản chép lời của phiên. Không đổi trạng thái. Trả `false` nếu
+/// không có engine nào chạy.
+fn stop_engine<R: Runtime>(app: &AppHandle<R>, session: &Session) -> bool {
     let engine = session.engine.lock().unwrap().take();
     let Some(engine) = engine else {
         return false;
@@ -363,14 +368,24 @@
     // Số đo của phiên vào log, không có chữ chép lời (§7, Đ17).
     log::info!("kết thúc phiên dịch: {}", metrics.summary());
     session.deps.end_session();
+    if let Some(transcript) = app.try_state::<TranscriptStore>() {
+        transcript.end(session.sessions.load(Ordering::SeqCst), now_ms());
+    }
     true
+}
+
+/// Giờ Unix, ms.
+fn now_ms() -> u64 {
+    SystemTime::now()
+        .duration_since(UNIX_EPOCH)
+        .map_or(0, |d| d.as_millis() as u64)
 }
 
 /// Dừng phiên (bấm Dừng). Thanh phụ đề giữ nguyên để người dùng còn đọc được các dòng cuối.
 pub fn stop<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
     let session = app.state::<Session>();
     let _gate = session.gate.lock().unwrap();
-    stop_engine(&session);
+    stop_engine(app, &session);
     app.state::<AppState>().update_status(|s| {
         s.session = SessionStatus::Idle;
         s.loading = None;
@@ -386,7 +401,7 @@
 fn fail<R: Runtime>(app: &AppHandle<R>, n: u64, code: &str, message: &str) {
     let session = app.state::<Session>();
     let _gate = session.gate.lock().unwrap();
-    if session.sessions.load(Ordering::SeqCst) != n || !stop_engine(&session) {
+    if session.sessions.load(Ordering::SeqCst) != n || !stop_engine(app, &session) {
         return;
     }
     log::error!("phiên dịch dừng vì lỗi {code}: {message}");
@@ -458,7 +473,7 @@
     loop {
         match session.gate.try_lock() {
             Ok(_gate) => {
-                stop_engine(&session);
+                stop_engine(app, &session);
                 break;
             }
             Err(_) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
@@ -482,7 +497,8 @@
     });
 }
 
-/// Kết quả của engine sang giao diện. Kế hoạch 06 thêm `usage` (đếm phút cho hạn mức, §6.8) ở đây.
+/// Kết quả của engine sang giao diện và sang bản chép lời trong bộ nhớ (§6.6). Kế hoạch 06 thêm `usage` (đếm phút cho hạn
+/// mức, §6.8) ở đây.
 struct TauriSink<R: Runtime> {
     app: AppHandle<R>,
     session: u64,
@@ -491,10 +507,16 @@
 
 impl<R: Runtime> EventSink for TauriSink<R> {
     fn subtitle(&self, subtitle: &Subtitle) {
+        if let Some(transcript) = self.app.try_state::<TranscriptStore>() {
+            transcript.upsert(self.session, subtitle);
+        }
         let _ = self.app.emit(events::SUBTITLE_UPSERT, subtitle);
     }
 
     fn delta(&self, delta: &Delta) {
+        if let Some(transcript) = self.app.try_state::<TranscriptStore>() {
+            transcript.delta(self.session, delta);
+        }
         let _ = self.app.emit(events::SUBTITLE_DELTA, delta);
     }
 
```

Thêm vào `src-tauri/src/transcript/export.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use pipeline::subtitle::{Status, Subtitle};
use serde::Deserialize;

use super::store::Transcript;
use crate::i18n::Strings;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Txt,
    Srt,
    Markdown,
}

impl Format {
    pub fn extension(self) -> &'static str {
        match self {
            Format::Txt => "txt",
            Format::Srt => "srt",
            Format::Markdown => "md",
        }
    }
}

/// Phần chữ của SRT.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SrtText {
    Source,
    Translation,
}

/// Năm, tháng, ngày, giờ, phút, giây theo giờ địa phương.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalTime {
    pub year: i64,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

/// Giờ Unix (ms) cộng độ lệch múi giờ (phút) ra giờ địa phương. Ngày theo lịch Gregory (thuật toán `civil_from_days` của
/// Howard Hinnant).
pub fn local_time(unix_ms: u64, utc_offset_minutes: i32) -> LocalTime {
    let secs = (unix_ms / 1_000) as i64 + i64::from(utc_offset_minutes) * 60;
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    LocalTime {
        year,
        month,
        day,
        hour: (rem / 3_600) as u32,
        minute: (rem % 3_600 / 60) as u32,
        second: (rem % 60) as u32,
    }
}

fn clock(t: &Transcript, line: &Subtitle, offset: i32) -> String {
    let l = local_time(t.started_at + line.start_ms, offset);
    format!("{:02}:{:02}:{:02}", l.hour, l.minute, l.second)
}

fn srt_time(ms: u64) -> String {
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3_600_000,
        ms / 60_000 % 60,
        ms / 1_000 % 60,
        ms % 1_000
    )
}

/// Câu gốc như người đọc thấy: đoạn bị bỏ thì là "[bỏ qua đoạn]".
fn source(line: &Subtitle, s: &Strings) -> String {
    if line.status == Status::Dropped {
        s.export_dropped.to_string()
    } else {
        line.src_text.clone()
    }
}

/// Bản dịch của câu, nếu câu có bản dịch để hiện.
fn translation(line: &Subtitle, s: &Strings) -> Option<String> {
    match line.status {
        Status::Failed => Some(s.export_failed.to_string()),
        Status::SameLang | Status::Skipped | Status::Dropped => None,
        Status::AsrDone | Status::Translating | Status::Done => {
            Some(line.tgt_text.trim().to_string()).filter(|t| !t.is_empty())
        }
    }
}

pub fn txt(t: &Transcript, utc_offset_minutes: i32, s: &Strings) -> String {
    let mut out = String::new();
    for line in &t.lines {
        out.push_str(&format!(
            "[{}] {}\n",
            clock(t, line, utc_offset_minutes),
            source(line, s)
        ));
        if let Some(tgt) = translation(line, s) {
            out.push_str(&format!("→ {tgt}\n"));
        }
        out.push('\n');
    }
    out
}

pub fn srt(t: &Transcript, text: SrtText, s: &Strings) -> String {
    let mut out = String::new();
    let mut n = 0;
    for line in &t.lines {
        let body = match text {
            SrtText::Source => source(line, s),
            SrtText::Translation => match line.status {
                Status::Failed => source(line, s),
                _ => translation(line, s).unwrap_or_else(|| source(line, s)),
            },
        };
        if body.trim().is_empty() {
            continue;
        }
        n += 1;
        out.push_str(&format!(
            "{n}\n{} --> {}\n{}\n\n",
            srt_time(line.start_ms),
            srt_time(line.end_ms.max(line.start_ms)),
            body.trim()
        ));
    }
    out
}

/// Thoát ký tự có nghĩa trong Markdown và trong bảng, để câu nói hiện đúng nguyên văn.
pub fn escape_markdown(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '\\' | '|' | '*' | '_' | '`' | '[' | ']' | '<' | '>' | '#' | '~' => {
                out.push('\\');
                out.push(c);
            }
            '\n' | '\r' => out.push(' '),
            _ => out.push(c),
        }
    }
    out
}

pub fn markdown(t: &Transcript, utc_offset_minutes: i32, s: &Strings) -> String {
    let start = local_time(t.started_at, utc_offset_minutes);
    let mut out = format!(
        "# {} · {:04}-{:02}-{:02} {:02}:{:02}\n\n| {} | {} | {} |\n|---|---|---|\n",
        s.export_title,
        start.year,
        start.month,
        start.day,
        start.hour,
        start.minute,
        s.export_time,
        s.export_source,
        s.export_translation
    );
    for line in &t.lines {
        out.push_str(&format!(
            "| {} | {} | {} |\n",
            clock(t, line, utc_offset_minutes),
            escape_markdown(&source(line, s)),
            translation(line, s).map(|t| escape_markdown(&t)).unwrap_or_default()
        ));
    }
    out
}

/// Tên file gợi ý khi lưu, theo giờ bắt đầu phiên: `transcript-2026-10-02-1405.txt`.
pub fn file_name(t: &Transcript, format: Format, utc_offset_minutes: i32) -> String {
    let l = local_time(t.started_at, utc_offset_minutes);
    format!(
        "transcript-{:04}-{:02}-{:02}-{:02}{:02}.{}",
        l.year,
        l.month,
        l.day,
        l.hour,
        l.minute,
        format.extension()
    )
}
```

Thêm vào `src-tauri/src/transcript/store.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::collections::BTreeMap;
use std::sync::Mutex;

use pipeline::subtitle::{Delta, Subtitle};
use serde::Serialize;

/// Bản chép lời của một phiên.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    /// Số của phiên trong lần chạy này của app (`session::Session`); 0 là chưa có phiên nào.
    pub session: u64,
    /// Giờ Unix (ms) lúc bắt đầu phiên. `start_ms`, `end_ms` của từng dòng tính từ mốc này.
    pub started_at: u64,
    /// Giờ Unix (ms) lúc phiên dừng; `None` khi phiên còn chạy.
    pub ended_at: Option<u64>,
    /// Mã ngôn ngữ đích của phiên (`vi`, `en`…).
    pub target_lang: String,
    /// Theo thứ tự `id`, tức thứ tự câu.
    pub lines: Vec<Subtitle>,
}

#[derive(Default)]
struct Current {
    meta: Transcript,
    lines: BTreeMap<u64, Subtitle>,
}

/// Bản chép lời của phiên hiện tại (hoặc vừa dừng). Quản lý bằng `app.manage`; luồng phụ đề của engine ghi vào, lệnh
/// của giao diện đọc ra.
#[derive(Default)]
pub struct TranscriptStore(Mutex<Current>);

impl TranscriptStore {
    fn lock(&self) -> std::sync::MutexGuard<'_, Current> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Phiên `session` bắt đầu: bỏ bản của phiên trước.
    pub fn begin(&self, session: u64, started_at: u64, target_lang: &str) {
        *self.lock() = Current {
            meta: Transcript {
                session,
                started_at,
                ended_at: None,
                target_lang: target_lang.to_string(),
                lines: Vec::new(),
            },
            lines: BTreeMap::new(),
        };
    }

    /// Một `subtitle://upsert` của phiên `session`. Sự kiện của phiên khác (tới muộn) bị bỏ.
    pub fn upsert(&self, session: u64, subtitle: &Subtitle) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        for id in &subtitle.replaces {
            current.lines.remove(id);
        }
        current.lines.insert(subtitle.id, subtitle.clone());
    }

    /// Một `subtitle://delta` của phiên `session`: nối vào chữ dịch của phụ đề cùng `id`.
    pub fn delta(&self, session: u64, delta: &Delta) {
        let mut current = self.lock();
        if current.meta.session != session {
            return;
        }
        if let Some(line) = current.lines.get_mut(&delta.id) {
            line.tgt_text.push_str(&delta.text);
        }
    }

    /// Phiên `session` dừng lúc `ended_at`. Trả bản chép lời để lưu lịch sử; `None` nếu đó không phải phiên hiện tại hay
    /// đã dừng rồi.
    pub fn end(&self, session: u64, ended_at: u64) -> Option<Transcript> {
        let mut current = self.lock();
        if session == 0 || current.meta.session != session || current.meta.ended_at.is_some() {
            return None;
        }
        current.meta.ended_at = Some(ended_at);
        Some(snapshot(&current))
    }

    /// Bản chép lời hiện có, cho giao diện và để xuất file.
    pub fn snapshot(&self) -> Transcript {
        snapshot(&self.lock())
    }

    /// Xóa toàn bộ dữ liệu (§4.3, Quyền riêng tư): bỏ cả bản chép lời trong bộ nhớ. Phiên đang chạy vẫn ghi tiếp các câu
    /// sau.
    pub fn clear(&self) {
        let mut current = self.lock();
        current.lines.clear();
    }
}

fn snapshot(current: &Current) -> Transcript {
    Transcript {
        lines: current.lines.values().cloned().collect(),
        ..current.meta.clone()
    }
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib transcript:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test transcript::export::tests::file_names_follow_the_session_start ... ok
test transcript::export::tests::local_time_follows_the_calendar_and_the_offset ... ok
test transcript::export::tests::markdown_is_a_table_with_escaped_text ... ok
test transcript::export::tests::srt_uses_session_offsets_and_the_chosen_text ... ok
test transcript::export::tests::txt_has_time_source_then_translation ... ok
test transcript::store::tests::end_returns_the_transcript_once ... ok
test transcript::store::tests::events_of_another_session_are_ignored_and_a_new_session_starts_empty ... ok
test transcript::store::tests::keeps_every_line_of_the_session_in_order ... ok
test transcript::store::tests::merged_subtitles_replace_the_ones_they_absorb ... ok
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 190 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib a_session_keeps -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::a_session_keeps_its_transcript_in_memory ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 198 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 197 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs \
  src-tauri/src/i18n.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/session.rs \
  src-tauri/src/test_support.rs \
  src-tauri/src/transcript/export.rs \
  src-tauri/src/transcript/mod.rs \
  src-tauri/src/transcript/store.rs
git commit -m "feat(app): bản chép lời trong bộ nhớ theo phiên, xuất TXT, SRT, Markdown (F4, §6.6)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 7: Lịch sử trong DB

Dòng 18, 48, 155, 252, 273; QĐ15.

- `transcript/history.rs`: `save` (một transaction; phiên không có câu nào thì không lưu), `list` (mới nhất trước, câu xem trước 80 ký tự), `get`, `delete`, `clear`; mã lỗi `historyNotFound`.
- `save_if_enabled`: chỉ khi bật "Lưu lịch sử" và là Pro; lỗi chỉ ghi log, không có chữ chép lời.
- `pipeline::subtitle::Status` thêm `Deserialize` để đọc lại trạng thái đã lưu.
- `session::stop_engine` lưu lịch sử ngay lúc phiên dừng: bấm Dừng, lỗi, Thoát ở menu khay (`session::shutdown`).
- `session::save_on_exit`, gọi ở `RunEvent::Exit` qua `on_exit` của `lib.rs` (sau `kill_all`; `on_exit` nhận hàm kill để test gọi được, N-A của review 03 lần 2): lưu phiên đang chạy khi app thoát không qua menu khay, tức máy tắt, khởi động lại, đăng xuất, app tự khởi động lại để cập nhật (Q3 của review 03). Không chờ engine; `TranscriptStore::end` chỉ trả bản chép lời một lần, nên không lưu hai lần.

**Files:**
- Modify: `crates/pipeline/src/subtitle.rs`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/session.rs`
- Create: `src-tauri/src/transcript/history.rs`
- Modify: `src-tauri/src/transcript/mod.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 919baaafc89cf3e77536d5d644570451680bfce9..88159c54365b0f445839ce3606b1ced85049f575 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -566,6 +566,88 @@
     session::stop(app.handle());
 }
 
+/// Lịch sử (F4): phiên dừng thì được lưu chỉ khi bật "Lưu lịch sử" và là Pro; mặc định tắt nên không lưu gì.
+#[test]
+fn a_stopped_session_is_saved_only_with_save_history_on_and_pro() {
+    use crate::transcript::history;
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let main = window(&app, "main");
+    let run_session = || {
+        let store = app.state::<crate::transcript::store::TranscriptStore>();
+        session::start(app.handle()).unwrap();
+        wait_until("một câu dịch xong", || {
+            store.snapshot().lines.iter().any(|l| !l.tgt_text.is_empty())
+        });
+        session::stop(app.handle());
+    };
+    let saved = || crate::db::with(app.handle(), |c| history::list(c)).unwrap().len();
+    run_session();
+    assert_eq!(saved(), 0, "lưu lịch sử mặc định tắt");
+    invoke(&main, "update_settings", json!({ "patch": { "saveHistory": true } })).unwrap();
+    run_session();
+    assert_eq!(saved(), 1);
+    let list = crate::db::with(app.handle(), |c| history::list(c)).unwrap();
+    assert_eq!(list[0].preview, "Hello everyone.");
+    set_pro(&app, false);
+    run_session();
+    assert_eq!(saved(), 1, "gói Free không lưu");
+}
+
+/// Chạy một phiên có lưu lịch sử tới khi có một câu dịch xong; phiên vẫn chạy khi hàm trả về.
+fn running_session_with_history() -> tauri::App<tauri::test::MockRuntime> {
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let main = window(&app, "main");
+    invoke(&main, "update_settings", json!({ "patch": { "saveHistory": true } })).unwrap();
+    session::start(app.handle()).unwrap();
+    let store = app.state::<crate::transcript::store::TranscriptStore>();
+    wait_until("một câu dịch xong", || {
+        store.snapshot().lines.iter().any(|l| !l.tgt_text.is_empty())
+    });
+    app
+}
+
+fn saved_sessions(app: &tauri::App<tauri::test::MockRuntime>) -> usize {
+    crate::db::with(app.handle(), |c| crate::transcript::history::list(c))
+        .unwrap()
+        .len()
+}
+
+/// Q3 của review 03: Thoát ở menu khay (`session::shutdown`) lưu phiên đang chạy vào lịch sử, như khi bấm Dừng (§4.3).
+/// `RunEvent::Exit` tới sau đó không lưu lần nữa.
+#[test]
+fn quitting_saves_the_running_session_to_history() {
+    let app = running_session_with_history();
+    session::shutdown(app.handle());
+    assert_eq!(saved_sessions(&app), 1);
+    session::save_on_exit(app.handle());
+    assert_eq!(saved_sessions(&app), 1, "không lưu hai lần");
+}
+
+/// Q3 của review 03: app thoát không qua menu khay (máy tắt, đăng xuất, app tự khởi động lại để cập nhật) thì
+/// `RunEvent::Exit` gọi `crate::on_exit`: kill tiến trình phụ rồi lưu phiên đang chạy vào lịch sử, không chờ engine dừng
+/// (N-A của review 03 lần 2: test đi qua đúng hàm mà `RunEvent::Exit` gọi).
+#[test]
+fn the_exit_event_saves_the_running_session_to_history() {
+    use std::sync::atomic::{AtomicBool, Ordering};
+    static KILLED: AtomicBool = AtomicBool::new(false);
+    fn fake_kill_all() {
+        KILLED.store(true, Ordering::SeqCst);
+    }
+    let app = running_session_with_history();
+    crate::on_exit(app.handle(), fake_kill_all);
+    assert!(KILLED.load(Ordering::SeqCst), "kill tiến trình phụ còn sót");
+    assert_eq!(saved_sessions(&app), 1);
+    crate::on_exit(app.handle(), fake_kill_all);
+    session::stop(app.handle());
+    assert_eq!(saved_sessions(&app), 1, "không lưu hai lần");
+}
+
 /// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
 #[test]
 fn glossary_terms_reach_the_prompt_only_for_pro() {
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 7ca3070a07d72ea158e10f2e07a96e9586b25ac5..ef1de8f1a6201268f8dda84c0007f72126075ab2 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -169,6 +169,7 @@
             .map(String::from),
         );
         codes.extend(crate::glossary::ERROR_CODES.iter().map(|c| c.to_string()));
+        codes.push(crate::transcript::history::NOT_FOUND.to_string());
         for code in codes {
             assert!(
                 en.contains(&format!("\"error.{code}\":")),
```

Tạo `src-tauri/src/transcript/history.rs`, lúc này mới có phần test:

```rust
//! Lịch sử chép lời (F4, §4.3 "Lịch sử", tính năng Pro): bản chép lời của các phiên đã dừng, lưu trong DB mã hóa (`db.rs`,
//! bảng `sessions` và `lines`). Chỉ lưu khi bật "Lưu lịch sử" (mặc định tắt, §10.1) và đang là Pro; lưu một lần khi phiên
//! dừng, trong một transaction. Phiên không có câu nào thì không lưu. Xóa từng phiên hoặc xóa tất cả.
//!
//! App bị tắt đột ngột giữa phiên (Force Quit, mất điện) thì mất phiên đó: lịch sử chỉ ghi khi phiên dừng.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_with_key;

    fn conn(name: &str) -> (Connection, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("mt-history-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        (open_with_key(&dir.join("data.db"), &[5; 32]).unwrap(), dir)
    }

    fn line(id: u64, src: &str, tgt: &str, status: Status) -> Subtitle {
        Subtitle {
            id,
            start_ms: id * 1_000,
            end_ms: id * 1_000 + 900,
            src_lang: "en".into(),
            src_text: src.into(),
            tgt_text: tgt.into(),
            status,
            provisional: false,
            replaces: Vec::new(),
        }
    }

    fn transcript(started_at: u64, first: &str) -> Transcript {
        Transcript {
            session: 3,
            started_at,
            ended_at: Some(started_at + 60_000),
            target_lang: "vi".into(),
            lines: vec![
                line(1_000_001, "", "", Status::Dropped),
                line(1_000_002, first, "Xin chào.", Status::Done),
                line(1_000_005, "Xin chào.", "", Status::SameLang),
                line(1_000_007, "Oops", "", Status::Failed),
            ],
        }
    }

    #[test]
    fn a_saved_session_reads_back_with_its_lines_and_statuses() {
        let (mut c, dir) = conn("roundtrip");
        let t = transcript(1_000, "Hello.");
        let id = save(&mut c, &t).unwrap().unwrap();
        let back = get(&c, id).unwrap();
        assert_eq!((back.session, back.started_at, back.ended_at), (0, 1_000, Some(61_000)));
        let statuses: Vec<Status> = back.lines.iter().map(|l| l.status).collect();
        assert_eq!(
            statuses,
            [Status::Dropped, Status::Done, Status::SameLang, Status::Failed]
        );
        assert_eq!(back.lines[1].tgt_text, "Xin chào.");
        assert_eq!(back.lines[1].start_ms, 1_000_002_000, "giữ nguyên mốc thời gian");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_list_is_newest_first_with_a_preview() {
        let (mut c, dir) = conn("list");
        let long = "a".repeat(100);
        let old = save(&mut c, &transcript(1_000, "Old meeting.")).unwrap().unwrap();
        let new = save(&mut c, &transcript(9_000, &long)).unwrap().unwrap();
        let empty = Transcript {
            lines: Vec::new(),
            ..transcript(5_000, "")
        };
        assert_eq!(
            save(&mut c, &empty).unwrap(),
            None,
            "phiên không có câu nào thì không lưu"
        );
        let list = list(&c).unwrap();
        assert_eq!(list.iter().map(|s| s.id).collect::<Vec<_>>(), [new, old]);
        assert_eq!(list[1].preview, "Old meeting.", "bỏ qua câu rỗng của đoạn bị bỏ");
        assert_eq!(list[0].preview.chars().count(), 80);
        assert_eq!((list[1].lines, list[1].target_lang.as_str()), (4, "vi"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn delete_one_or_all() {
        let (mut c, dir) = conn("delete");
        let a = save(&mut c, &transcript(1_000, "A")).unwrap().unwrap();
        let b = save(&mut c, &transcript(2_000, "B")).unwrap().unwrap();
        delete(&c, a).unwrap();
        assert_eq!(CommandError::from(delete(&c, a).unwrap_err()).code, NOT_FOUND);
        assert_eq!(CommandError::from(get(&c, a).unwrap_err()).code, NOT_FOUND);
        let lines: i64 = c
            .query_row("SELECT count(*) FROM lines WHERE session_id = ?1", [a], |r| r.get(0))
            .unwrap();
        assert_eq!(lines, 0, "xóa phiên thì xóa cả các câu");
        assert_eq!(get(&c, b).unwrap().lines.len(), 4);
        assert_eq!(clear(&c).unwrap(), 1);
        assert!(list(&c).unwrap().is_empty());
        let lines: i64 = c.query_row("SELECT count(*) FROM lines", [], |r| r.get(0)).unwrap();
        assert_eq!(lines, 0);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
```

Sửa `src-tauri/src/transcript/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/transcript/mod.rs b/src-tauri/src/transcript/mod.rs
index 6c67454e38f2adb9b3506a77cf4a45166dd3cdd0..9cfaa0ec6b87feff371b491c3d7aaf9301a4802f 100644
--- a/src-tauri/src/transcript/mod.rs
+++ b/src-tauri/src/transcript/mod.rs
@@ -2,4 +2,5 @@
 //! hóa (`history.rs`).
 
 pub mod export;
+pub mod history;
 pub mod store;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib history 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `history.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 41 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `Subtitle` in this scope
error[E0422]: cannot find struct, variant or union type `Transcript` in this scope
error[E0425]: cannot find function `clear` in this scope
error[E0425]: cannot find function `delete` in this scope
error[E0425]: cannot find function `get` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `crates/pipeline/src/subtitle.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/subtitle.rs b/crates/pipeline/src/subtitle.rs
index f3745bc33ac22b6ae905b141a6c45dbe9dc97d99..b1a39220a3d13d1f18513cbeab2550de365dbfd2 100644
--- a/crates/pipeline/src/subtitle.rs
+++ b/crates/pipeline/src/subtitle.rs
@@ -4,9 +4,10 @@
 //! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
 //! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.
 
-use serde::Serialize;
+use serde::{Deserialize, Serialize};
 
-#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
+/// `Deserialize` cho lịch sử chép lời của app (đọc lại trạng thái đã lưu trong DB, kế hoạch 03).
+#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
 #[serde(rename_all = "snake_case")]
 pub enum Status {
     /// Đã có chữ gốc, đang chờ dịch.
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 6b283584576fa3fc4fa6df36663f723b4cbe25c4..656c723e0a830b65e375a027d77614bbf998b225 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -176,10 +176,17 @@
         // Bấm icon ở Dock khi cửa sổ chính đang ẩn.
         #[cfg(target_os = "macos")]
         RunEvent::Reopen { .. } => window::show_main(app),
-        // Lưới an toàn: tiến trình phụ nào còn sống lúc app thoát thì kill (Thoát ở menu khay đã tắt chúng).
-        RunEvent::Exit => pipeline::process::kill_all(),
+        RunEvent::Exit => on_exit(app, pipeline::process::kill_all),
         _ => {}
     }
+}
+
+/// App thoát (`RunEvent::Exit`): lưới an toàn kill tiến trình phụ còn sống (Thoát ở menu khay đã tắt chúng), rồi lưu lịch
+/// sử của phiên còn chạy khi app thoát không qua menu khay: tắt máy, đăng xuất, cập nhật (Q3 của review 03). Tách riêng,
+/// nhận hàm kill, để test gọi được mà không kill tiến trình của test khác (N-A của review 03 lần 2).
+pub(crate) fn on_exit<R: tauri::Runtime>(app: &AppHandle<R>, kill_all: fn()) {
+    kill_all();
+    session::save_on_exit(app);
 }
 
 /// Windows: chỉ nạp DLL từ thư mục hệ thống và thư mục của app, không từ thư mục hiện hành hay `PATH` (chống DLL
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index dad11c562e8b594b727b27d78af031c7ecd92b4c..d12eb2d7ad1d85e57fd0d1f10fdf4b4d56429aa5 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -38,6 +38,7 @@
 use crate::settings::{AudioSource, Lang, ModelTier, Settings};
 use crate::sidecar::{self, first_run, integrity};
 use crate::state::{AppState, AppStatus, Loading, SessionStatus};
+use crate::transcript::history;
 use crate::transcript::store::TranscriptStore;
 use crate::{actions, events, overlay, window};
 
@@ -368,10 +369,30 @@
     // Số đo của phiên vào log, không có chữ chép lời (§7, Đ17).
     log::info!("kết thúc phiên dịch: {}", metrics.summary());
     session.deps.end_session();
-    if let Some(transcript) = app.try_state::<TranscriptStore>() {
-        transcript.end(session.sessions.load(Ordering::SeqCst), now_ms());
-    }
+    // Lưu lịch sử nếu bật "Lưu lịch sử" và là Pro (F4). Chạy ngay ở đây, cả khi thoát app, để không mất phiên cuối.
+    end_transcript(app, session);
     true
+}
+
+/// Chốt bản chép lời của phiên hiện tại và lưu lịch sử nếu được (`history::save_if_enabled`). `TranscriptStore::end` chỉ
+/// trả bản chép lời một lần mỗi phiên, nên gọi lại không lưu hai lần.
+fn end_transcript<R: Runtime>(app: &AppHandle<R>, session: &Session) {
+    let ended = app
+        .try_state::<TranscriptStore>()
+        .and_then(|t| t.end(session.sessions.load(Ordering::SeqCst), now_ms()));
+    if let Some(transcript) = ended {
+        history::save_if_enabled(app, &transcript);
+    }
+}
+
+/// App thoát mà không qua Thoát ở menu khay: máy tắt, khởi động lại, đăng xuất (macOS cho thoát ngay, `quit_guard`), app
+/// tự khởi động lại để cập nhật (§4.3, §6.11). Gọi ở `RunEvent::Exit`: lưu lịch sử của phiên đang chạy như khi bấm Dừng
+/// (QĐ15), không chờ engine hay khóa của phiên (Q3 của review 03). Thoát ở menu khay đã lưu ở [`shutdown`], nên lần gọi
+/// này không làm gì.
+pub fn save_on_exit<R: Runtime>(app: &AppHandle<R>) {
+    if let Some(session) = app.try_state::<Session>() {
+        end_transcript(app, &session);
+    }
 }
 
 /// Giờ Unix, ms.
```

Thêm vào `src-tauri/src/transcript/history.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use pipeline::subtitle::{Status, Subtitle};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use super::store::Transcript;
use crate::db::{self, DbError};
use crate::errors::CommandError;
use crate::pro;
use crate::state::AppState;

/// Số ký tự tối đa của câu xem trước trong danh sách.
const PREVIEW_CHARS: usize = 80;

/// Một phiên trong danh sách Lịch sử.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: i64,
    pub started_at: u64,
    pub ended_at: u64,
    pub target_lang: String,
    pub lines: usize,
    /// Câu gốc đầu tiên, cắt còn 80 ký tự.
    pub preview: String,
}

#[derive(Debug, thiserror::Error)]
pub enum HistoryError {
    #[error("không có phiên {0} trong lịch sử")]
    NotFound(i64),
    #[error(transparent)]
    Db(#[from] DbError),
}

impl From<rusqlite::Error> for HistoryError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Db(DbError::Sql(e))
    }
}

impl From<HistoryError> for CommandError {
    fn from(e: HistoryError) -> Self {
        match e {
            HistoryError::NotFound(_) => CommandError::new(NOT_FOUND, None, e.to_string()),
            HistoryError::Db(e) => e.into(),
        }
    }
}

pub const NOT_FOUND: &str = "historyNotFound";

fn status_name(status: Status) -> String {
    serde_json::to_value(status)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_default()
}

fn status_from(name: &str) -> Status {
    serde_json::from_value(serde_json::Value::String(name.to_string())).unwrap_or(Status::Done)
}

/// Lưu bản chép lời của một phiên đã dừng. Trả id của phiên trong lịch sử; `None` nếu phiên không có câu nào.
pub fn save(conn: &mut Connection, t: &Transcript) -> Result<Option<i64>, HistoryError> {
    if t.lines.is_empty() {
        return Ok(None);
    }
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO sessions (started_at, ended_at, target_lang) VALUES (?1, ?2, ?3)",
        params![
            t.started_at as i64,
            t.ended_at.unwrap_or(t.started_at) as i64,
            t.target_lang
        ],
    )?;
    let id = tx.last_insert_rowid();
    {
        let mut insert = tx.prepare(
            "INSERT INTO lines (session_id, seq, start_ms, end_ms, src_lang, src_text, tgt_text, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for (seq, line) in t.lines.iter().enumerate() {
            insert.execute(params![
                id,
                seq as i64,
                line.start_ms as i64,
                line.end_ms as i64,
                line.src_lang,
                line.src_text,
                line.tgt_text,
                status_name(line.status)
            ])?;
        }
    }
    tx.commit()?;
    Ok(Some(id))
}

/// Mọi phiên đã lưu, mới nhất trước.
pub fn list(conn: &Connection) -> Result<Vec<SessionSummary>, HistoryError> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.started_at, s.ended_at, s.target_lang,
                (SELECT count(*) FROM lines l WHERE l.session_id = s.id),
                (SELECT src_text FROM lines l WHERE l.session_id = s.id AND src_text <> '' ORDER BY seq LIMIT 1)
         FROM sessions s ORDER BY s.started_at DESC, s.id DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        let preview: Option<String> = r.get(5)?;
        Ok(SessionSummary {
            id: r.get(0)?,
            started_at: r.get::<_, i64>(1)? as u64,
            ended_at: r.get::<_, i64>(2)? as u64,
            target_lang: r.get(3)?,
            lines: r.get::<_, i64>(4)? as usize,
            preview: preview.unwrap_or_default().chars().take(PREVIEW_CHARS).collect(),
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Bản chép lời của phiên `id` (để xem, sao chép, xuất). `session` của kết quả là 0: đây không phải phiên của lần chạy này.
pub fn get(conn: &Connection, id: i64) -> Result<Transcript, HistoryError> {
    let meta: Option<(i64, i64, String)> = conn
        .query_row(
            "SELECT started_at, ended_at, target_lang FROM sessions WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()?;
    let Some((started_at, ended_at, target_lang)) = meta else {
        return Err(HistoryError::NotFound(id));
    };
    let mut stmt = conn.prepare(
        "SELECT seq, start_ms, end_ms, src_lang, src_text, tgt_text, status FROM lines WHERE session_id = ?1 ORDER BY seq",
    )?;
    let lines = stmt.query_map([id], |r| {
        Ok(Subtitle {
            id: r.get::<_, i64>(0)? as u64,
            start_ms: r.get::<_, i64>(1)? as u64,
            end_ms: r.get::<_, i64>(2)? as u64,
            src_lang: r.get(3)?,
            src_text: r.get(4)?,
            tgt_text: r.get(5)?,
            status: status_from(&r.get::<_, String>(6)?),
            provisional: false,
            replaces: Vec::new(),
        })
    })?;
    Ok(Transcript {
        session: 0,
        started_at: started_at as u64,
        ended_at: Some(ended_at as u64),
        target_lang,
        lines: lines.collect::<Result<_, _>>()?,
    })
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), HistoryError> {
    if conn.execute("DELETE FROM sessions WHERE id = ?1", [id])? == 0 {
        return Err(HistoryError::NotFound(id));
    }
    Ok(())
}

/// Xóa mọi phiên đã lưu. Trả số phiên đã xóa.
pub fn clear(conn: &Connection) -> Result<usize, HistoryError> {
    Ok(conn.execute("DELETE FROM sessions", [])?)
}

/// Phiên vừa dừng: lưu vào lịch sử nếu bật "Lưu lịch sử" và đang là Pro. Lỗi chỉ ghi log (không có chữ chép lời), phiên
/// vẫn dừng bình thường.
pub fn save_if_enabled<R: Runtime>(app: &AppHandle<R>, t: &Transcript) {
    let enabled = app.try_state::<AppState>().is_some_and(|s| s.settings().save_history);
    if !enabled || !pro::is_pro(app) {
        return;
    }
    match db::with(app, |c| save(c, t)) {
        Ok(Some(id)) => log::info!("đã lưu phiên vào lịch sử ({} câu, id {id})", t.lines.len()),
        Ok(None) => {}
        Err(e) => log::error!("không lưu được lịch sử: {} ({})", e.code, e.message),
    }
}
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 67ed717c6214becd477aaec92f37e7c192b3902d..85f3149bbb848dad34521af644d81c6e23b73068 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -175,6 +175,7 @@
   "error.glossaryFull": "The glossary already has 500 terms. Delete some before adding more.",
   "error.glossaryNotFound": "This term no longer exists.",
   "error.csvInvalid": "This CSV file could not be read. Nothing was imported.",
+  "error.historyNotFound": "This session is no longer in the history.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index d8eeb932a4e24878bcf94ca76e88ddfb0504cd07..648ce06ffda1c6492f484d81f99e32ba838fe331 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -175,5 +175,6 @@
   "error.glossaryFull": "Từ điển đã đủ 500 thuật ngữ. Hãy xóa bớt trước khi thêm.",
   "error.glossaryNotFound": "Thuật ngữ này không còn nữa.",
   "error.csvInvalid": "Không đọc được file CSV này. Chưa nhập gì.",
+  "error.historyNotFound": "Phiên này không còn trong lịch sử.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib history -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::a_stopped_session_is_saved_only_with_save_history_on_and_pro ... ok
test app_tests::quitting_saves_the_running_session_to_history ... ok
test app_tests::the_exit_event_saves_the_running_session_to_history ... ok
test transcript::history::tests::a_saved_session_reads_back_with_its_lines_and_statuses ... ok
test transcript::history::tests::delete_one_or_all ... ok
test transcript::history::tests::the_list_is_newest_first_with_a_preview ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 199 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib a_stopped_session -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::a_stopped_session_is_saved_only_with_save_history_on_and_pro ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 204 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib saves_the_running_session -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::quitting_saves_the_running_session_to_history ... ok
test app_tests::the_exit_event_saves_the_running_session_to_history ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 203 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 203 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
cargo test -p pipeline --lib subtitle 2>&1 | grep '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 164 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

- [ ] **Step 6: Commit**

```bash
git add crates/pipeline/src/subtitle.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/session.rs \
  src-tauri/src/transcript/history.rs \
  src-tauri/src/transcript/mod.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): lịch sử chép lời trong DB mã hóa, chỉ lưu khi bật và là Pro (F4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 8: Lệnh bản chép lời, lịch sử, xuất file (hộp thoại lưu)

Dòng 47, 48, 156; QĐ8, QĐ17. Bảy lệnh mới của cửa sổ `main` (đủ ba chỗ: `commands.rs`, `build.rs`, `capabilities/main.json`):
`get_transcript`, `transcript_text` (sao chép, mọi gói), `export_transcript` (Pro), `list_history`, `get_history_session`, `delete_history_session`, `clear_history` (Pro).

- `data.rs`: việc của các lệnh; `blocking` chạy việc trên luồng của `spawn_blocking` (lệnh `async`), vì mở DB lần đầu có thể chờ Keychain và hộp thoại lưu chặn tới khi người dùng chọn.
- `files.rs`: trait `FilePicker` (bản thật dùng `tauri-plugin-dialog`, gọi từ Rust, hộp thoại gắn vào cửa sổ chính bằng `set_parent`, N12 của review 03), `save_as`, `open_bytes` (tối đa 1 MiB, có test M05); mã lỗi `fileFailed`, `fileTooLarge`. Đường dẫn chỉ vào `message` của lỗi (log), không lên giao diện.
- `utcOffsetMinutes` ngoài ±1080 (±18 giờ) thì lỗi `outOfRange` (§10.2, N4 của review 03).
- `test_support`: `FakePicker` lưu vào thư mục tạm của app giả, hoặc như người dùng bấm Hủy.
- `acl_tests`: lệnh của plugin dialog bị cấm ở mọi cửa sổ.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src-tauri/src/acl_tests.rs`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/commands.rs`
- Create: `src-tauri/src/data.rs`
- Modify: `src-tauri/src/errors.rs`
- Create: `src-tauri/src/files.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/test_support.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/acl_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/acl_tests.rs b/src-tauri/src/acl_tests.rs
index 774f1a031e27c14cc145c7e1e2030268dd81ccb3..926c97fbc92a7bc30a8640369f644f91e0d64dbb 100644
--- a/src-tauri/src/acl_tests.rs
+++ b/src-tauri/src/acl_tests.rs
@@ -41,6 +41,9 @@
     "plugin:log|log",
     "plugin:event|emit",
     "plugin:global-shortcut|register",
+    "plugin:dialog|save",
+    "plugin:dialog|open",
+    "plugin:dialog|message",
 ];
 
 /// Lệnh của app có tác dụng ra ngoài app (mở Finder, System Settings, Settings của Windows).
```

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 88159c54365b0f445839ce3606b1ced85049f575..2bd0af37c66e3b2817f2b1366820ae4496b2e3e0 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -648,6 +648,180 @@
     assert_eq!(saved_sessions(&app), 1, "không lưu hai lần");
 }
 
+/// App giả đã chạy xong một phiên có câu dịch (lưu lịch sử bật hay tắt theo `save_history`).
+fn app_after_one_session(save_history: bool) -> tauri::App<tauri::test::MockRuntime> {
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let main = window(&app, "main");
+    invoke(
+        &main,
+        "update_settings",
+        json!({ "patch": { "saveHistory": save_history } }),
+    )
+    .unwrap();
+    let store = app.state::<crate::transcript::store::TranscriptStore>();
+    session::start(app.handle()).unwrap();
+    wait_until("một câu dịch xong", || {
+        store
+            .snapshot()
+            .lines
+            .iter()
+            .any(|l| l.status == pipeline::subtitle::Status::Done)
+    });
+    session::stop(app.handle());
+    app
+}
+
+/// File chọn để nhập lớn hơn 1 MiB thì từ chối (`fileTooLarge`), đúng 1 MiB thì đọc được (M05 của review 03).
+#[test]
+fn files_larger_than_1_mib_are_not_read() {
+    use crate::test_support::FakePicker;
+    let app = mock_app();
+    let picker = app.state::<FakePicker>();
+    let dir = picker.dir.lock().unwrap().clone();
+    std::fs::create_dir_all(&dir).unwrap();
+    let path = dir.join("big.csv");
+    *picker.to_open.lock().unwrap() = Some(path.clone());
+    std::fs::write(&path, vec![b'a'; crate::files::MAX_IMPORT_BYTES as usize]).unwrap();
+    let read = crate::files::open_bytes(app.handle(), crate::files::CSV)
+        .unwrap()
+        .unwrap();
+    assert_eq!(read.len() as u64, crate::files::MAX_IMPORT_BYTES);
+    std::fs::write(&path, vec![b'a'; crate::files::MAX_IMPORT_BYTES as usize + 1]).unwrap();
+    let refused = crate::files::open_bytes(app.handle(), crate::files::CSV).unwrap_err();
+    assert_eq!(refused.code, errors::FILE_TOO_LARGE);
+}
+
+/// Bản chép lời (F4): xem và sao chép ở mọi gói; xuất file là Pro, ghi đúng định dạng vào chỗ người dùng chọn.
+#[test]
+fn the_transcript_can_be_read_copied_and_exported() {
+    use crate::test_support::FakePicker;
+    let app = app_after_one_session(false);
+    let main = window(&app, "main");
+    let t = invoke(&main, "get_transcript", json!({})).unwrap();
+    assert!(
+        t["lines"]
+            .as_array()
+            .unwrap()
+            .iter()
+            .any(|l| l["tgt_text"] == "Xin chào mọi người.")
+    );
+    assert!(t["startedAt"].as_u64().is_some() && t["endedAt"].as_u64().is_some());
+    let current = json!({ "kind": "current" });
+    let text = invoke(
+        &main,
+        "transcript_text",
+        json!({ "source": current, "utcOffsetMinutes": 420 }),
+    )
+    .unwrap();
+    let text = text.as_str().unwrap();
+    assert!(text.contains("] Hello everyone.\n→ Xin chào mọi người.\n"), "{text}");
+
+    let export = |format: &str| {
+        invoke(
+            &main,
+            "export_transcript",
+            json!({ "source": current, "format": format, "srtText": "translation", "utcOffsetMinutes": 0 }),
+        )
+    };
+    // N4 của review 03: độ lệch múi giờ ngoài ±18 giờ là dữ liệu hỏng.
+    for bad in [1081, -1081] {
+        let refused = invoke(
+            &main,
+            "transcript_text",
+            json!({ "source": current, "utcOffsetMinutes": bad }),
+        )
+        .unwrap_err();
+        assert!(refused.contains("outOfRange"), "{refused}");
+        let refused = invoke(
+            &main,
+            "export_transcript",
+            json!({ "source": current, "format": "txt", "srtText": "translation", "utcOffsetMinutes": bad }),
+        )
+        .unwrap_err();
+        assert!(refused.contains("outOfRange"), "{refused}");
+    }
+    assert!(
+        invoke(
+            &main,
+            "transcript_text",
+            json!({ "source": current, "utcOffsetMinutes": -1080 })
+        )
+        .is_ok()
+    );
+    let path = export("srt").unwrap();
+    let written = std::fs::read_to_string(path.as_str().unwrap()).unwrap();
+    assert!(written.starts_with("1\n00:00:"), "{written}");
+    assert!(written.contains("Xin chào mọi người."));
+    assert!(path.as_str().unwrap().ends_with(".srt"));
+    let md = export("markdown").unwrap();
+    assert!(
+        std::fs::read_to_string(md.as_str().unwrap())
+            .unwrap()
+            .starts_with("# Bản chép lời · ")
+    );
+
+    app.state::<FakePicker>()
+        .cancel
+        .store(true, std::sync::atomic::Ordering::SeqCst);
+    assert_eq!(export("txt").unwrap(), Value::Null, "bấm Hủy thì không ghi gì");
+    app.state::<FakePicker>()
+        .cancel
+        .store(false, std::sync::atomic::Ordering::SeqCst);
+
+    set_pro(&app, false);
+    let refused = export("txt").unwrap_err();
+    assert!(refused.contains(errors::PRO_REQUIRED), "{refused}");
+    assert!(
+        invoke(
+            &main,
+            "transcript_text",
+            json!({ "source": current, "utcOffsetMinutes": 0 })
+        )
+        .is_ok()
+    );
+}
+
+/// Lịch sử (Pro): danh sách, xem lại, xuất, xóa từng phiên, xóa tất cả; gói Free bị khóa.
+#[test]
+fn history_commands_list_open_delete_and_need_pro() {
+    let app = app_after_one_session(true);
+    let main = window(&app, "main");
+    let list = invoke(&main, "list_history", json!({})).unwrap();
+    let id = list[0]["id"].as_i64().unwrap();
+    assert_eq!(list[0]["preview"], "Hello everyone.");
+    let saved = invoke(&main, "get_history_session", json!({ "id": id })).unwrap();
+    assert_eq!(saved["session"], 0);
+    assert!(!saved["lines"].as_array().unwrap().is_empty());
+    let source = json!({ "kind": "history", "id": id });
+    let text = invoke(
+        &main,
+        "transcript_text",
+        json!({ "source": source, "utcOffsetMinutes": 0 }),
+    )
+    .unwrap();
+    assert!(text.as_str().unwrap().contains("Hello everyone."));
+
+    set_pro(&app, false);
+    for (cmd, args) in [
+        ("list_history", json!({})),
+        ("get_history_session", json!({ "id": id })),
+        ("delete_history_session", json!({ "id": id })),
+        ("clear_history", json!({})),
+        ("transcript_text", json!({ "source": source, "utcOffsetMinutes": 0 })),
+    ] {
+        let refused = invoke(&main, cmd, args).unwrap_err();
+        assert!(refused.contains(errors::PRO_REQUIRED), "{cmd}: {refused}");
+    }
+    set_pro(&app, true);
+    invoke(&main, "delete_history_session", json!({ "id": id })).unwrap();
+    let missing = invoke(&main, "get_history_session", json!({ "id": id })).unwrap_err();
+    assert!(missing.contains("historyNotFound"), "{missing}");
+    assert_eq!(invoke(&main, "clear_history", json!({})).unwrap(), 0);
+}
+
 /// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
 #[test]
 fn glossary_terms_reach_the_prompt_only_for_pro() {
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index ef1de8f1a6201268f8dda84c0007f72126075ab2..d6ce6a4e69169ac3e1eaeb813daf21bb9a41036b 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -164,6 +164,8 @@
                 QUOTA_EXHAUSTED,
                 PRO_REQUIRED,
                 DATA_UNAVAILABLE,
+                FILE_FAILED,
+                FILE_TOO_LARGE,
                 UNKNOWN,
             ]
             .map(String::from),
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 656c723e0a830b65e375a027d77614bbf998b225..a5d4ec270ea60a320feb1b2b2c94e59b6e4fd76e 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -9,9 +9,11 @@
 pub mod actions;
 pub mod capture;
 pub mod commands;
+pub mod data;
 pub mod db;
 pub mod errors;
 pub mod events;
+pub mod files;
 pub mod glossary;
 pub mod hotkey_registry;
 pub mod hotkeys;
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 12aca690685267a358ae1c2143fa09e497759229..64e76a139ed74178496d2590d1361a189625352b 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -3,6 +3,7 @@
 //! phần bên ngoài giả (`FakeDeps`): không chạy tiến trình phụ, không thu âm thật.
 
 use std::ops::ControlFlow;
+use std::path::PathBuf;
 use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
 use std::sync::{Arc, Condvar, Mutex};
 use std::time::{Duration, SystemTime};
@@ -22,6 +23,7 @@
 use crate::commands;
 use crate::db::DataStore;
 use crate::errors::{self, CommandError};
+use crate::files::{FilePicker, FileType, Picker};
 use crate::glossary::ActiveGlossary;
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
 use crate::overlay::{OverlaySurface, Surface};
@@ -125,6 +127,35 @@
 impl ProGate for FakePro {
     fn is_pro(&self) -> bool {
         self.0.load(Ordering::SeqCst)
+    }
+}
+
+/// Bản giả của `FilePicker`: "lưu" vào thư mục tạm của app giả với tên gợi ý, "mở" file test đã đặt; hoặc như người
+/// dùng bấm Hủy.
+#[derive(Clone, Default)]
+pub struct FakePicker {
+    pub dir: Arc<Mutex<PathBuf>>,
+    /// File trả về khi hỏi mở.
+    pub to_open: Arc<Mutex<Option<PathBuf>>>,
+    /// Người dùng bấm Hủy.
+    pub cancel: Arc<AtomicBool>,
+}
+
+impl FilePicker for FakePicker {
+    fn save(&self, file_name: &str, _kind: FileType) -> Option<PathBuf> {
+        if self.cancel.load(Ordering::SeqCst) {
+            return None;
+        }
+        let dir = self.dir.lock().unwrap().clone();
+        std::fs::create_dir_all(&dir).unwrap();
+        Some(dir.join(file_name))
+    }
+
+    fn open(&self, _kind: FileType) -> Option<PathBuf> {
+        if self.cancel.load(Ordering::SeqCst) {
+            return None;
+        }
+        self.to_open.lock().unwrap().clone()
     }
 }
 
@@ -394,6 +425,8 @@
         APPS.fetch_add(1, Ordering::SeqCst)
     ));
     let _ = std::fs::remove_dir_all(&data_dir);
+    let picker = FakePicker::default();
+    *picker.dir.lock().unwrap() = data_dir.join("exports");
     let app = builder
         .manage(AppState::new(
             Settings::defaults(UiLanguage::Vi),
@@ -415,6 +448,8 @@
         ))
         .manage(ActiveGlossary::default())
         .manage(TranscriptStore::default())
+        .manage(Picker(Box::new(picker.clone())))
+        .manage(picker)
         .manage(pro)
         .manage(Session::new(Arc::new(deps)))
         .invoke_handler(commands::handler())
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib history_commands 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có lệnh mới, `data.rs`, `files.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 5 previous errors
error[E0425]: cannot find value `FILE_FAILED` in this scope
error[E0425]: cannot find value `FILE_TOO_LARGE` in module `errors`
error[E0425]: cannot find value `FILE_TOO_LARGE` in this scope
error[E0583]: file not found for module `data`
error[E0583]: file not found for module `files`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 95467d3c968e8c524d523569940a342f71699696..808c65c755e3c9a4a966034debc44a71981c59a5 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -34,6 +34,8 @@
 sys-locale = "0.3.2"
 tauri = { version = "2.12.1", features = ["macos-private-api", "tray-icon"] }
 tauri-plugin-autostart = "2.7.0"
+# Hộp thoại lưu và mở file của hệ điều hành, chỉ gọi từ Rust (files.rs); không cửa sổ nào được cấp `dialog:*`.
+tauri-plugin-dialog = "2.8.1"
 tauri-plugin-global-shortcut = "2.4.0"
 tauri-plugin-log = "2.10.0"
 tauri-plugin-opener = "2.7.0"
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index 4fb539bfbbf9f17646b29e22e5669ddb9972cef1..a9fe97f92f7cd198f5c362b5239d63b86627e892 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -22,6 +22,13 @@
             "open_login_items_settings",
             "list_audio_sources",
             "open_audio_permission_settings",
+            "get_transcript",
+            "transcript_text",
+            "export_transcript",
+            "list_history",
+            "get_history_session",
+            "delete_history_session",
+            "clear_history",
             "get_overlay_view",
         ])),
     )
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index 918ab885ac67df7536f5b3ff18ce69c5d526842f..a87feba58289ee512e76f8263106d0503b274e48 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -17,6 +17,13 @@
     "allow-open-login-items-settings",
     "allow-list-audio-sources",
     "allow-open-audio-permission-settings",
+    "allow-get-transcript",
+    "allow-transcript-text",
+    "allow-export-transcript",
+    "allow-list-history",
+    "allow-get-history-session",
+    "allow-delete-history-session",
+    "allow-clear-history",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:webview:allow-set-webview-zoom"
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index ed627a8cfe73a19a1ec33a18f22acf8d241c6b69..0d479044e13e6488f5601f4268c18d31f65f2cd4 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -10,10 +10,14 @@
 use tauri::{AppHandle, Runtime, State};
 
 use crate::actions::{self, AudioSourceOption};
+use crate::data::{self, TranscriptRef, blocking};
 use crate::errors::{self, CommandError};
 use crate::hotkeys::HotkeyAction;
 use crate::settings::Settings;
 use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
+use crate::transcript::export::{Format, SrtText};
+use crate::transcript::history::SessionSummary;
+use crate::transcript::store::Transcript;
 
 #[tauri::command]
 pub fn get_settings(state: State<'_, AppState>) -> Settings {
@@ -95,6 +99,60 @@
 #[tauri::command]
 pub fn open_audio_permission_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
     actions::open_audio_permission_settings(&app)
+}
+
+// ---- Bản chép lời, lịch sử, xuất file (kế hoạch 03, F4). Lệnh chạm DB hay hộp thoại là `async` (xem `data.rs`). ----
+
+/// Bản chép lời của phiên hiện tại hoặc vừa dừng, trong bộ nhớ.
+#[tauri::command]
+pub fn get_transcript<R: Runtime>(app: AppHandle<R>) -> Transcript {
+    data::current(&app)
+}
+
+/// Chữ TXT để sao chép. `utc_offset_minutes`: độ lệch múi giờ của máy, để ghi giờ địa phương.
+#[tauri::command]
+pub async fn transcript_text<R: Runtime>(
+    app: AppHandle<R>,
+    source: TranscriptRef,
+    utc_offset_minutes: i32,
+) -> Result<String, CommandError> {
+    blocking(app, move |app| data::transcript_text(app, source, utc_offset_minutes)).await
+}
+
+/// Xuất ra file (Pro). Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy ở hộp thoại lưu.
+#[tauri::command]
+pub async fn export_transcript<R: Runtime>(
+    app: AppHandle<R>,
+    source: TranscriptRef,
+    format: Format,
+    srt_text: SrtText,
+    utc_offset_minutes: i32,
+) -> Result<Option<String>, CommandError> {
+    blocking(app, move |app| {
+        data::export_transcript(app, source, format, srt_text, utc_offset_minutes)
+    })
+    .await
+}
+
+#[tauri::command]
+pub async fn list_history<R: Runtime>(app: AppHandle<R>) -> Result<Vec<SessionSummary>, CommandError> {
+    blocking(app, data::list_history).await
+}
+
+#[tauri::command]
+pub async fn get_history_session<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<Transcript, CommandError> {
+    blocking(app, move |app| data::load(app, TranscriptRef::History { id })).await
+}
+
+#[tauri::command]
+pub async fn delete_history_session<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<(), CommandError> {
+    blocking(app, move |app| data::delete_history_session(app, id)).await
+}
+
+/// Xóa mọi phiên trong lịch sử (Pro). Trả số phiên đã xóa.
+#[tauri::command]
+pub async fn clear_history<R: Runtime>(app: AppHandle<R>) -> Result<usize, CommandError> {
+    blocking(app, data::clear_history).await
 }
 
 /// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
@@ -118,6 +176,13 @@
     "open_login_items_settings",
     "list_audio_sources",
     "open_audio_permission_settings",
+    "get_transcript",
+    "transcript_text",
+    "export_transcript",
+    "list_history",
+    "get_history_session",
+    "delete_history_session",
+    "clear_history",
 ];
 
 /// Lệnh của cửa sổ `overlay`.
@@ -138,6 +203,13 @@
         open_login_items_settings,
         list_audio_sources,
         open_audio_permission_settings,
+        get_transcript,
+        transcript_text,
+        export_transcript,
+        list_history,
+        get_history_session,
+        delete_history_session,
+        clear_history,
         get_overlay_view,
     ]
 }
```

Tạo `src-tauri/src/data.rs`:

```rust
//! Việc của các lệnh về dữ liệu người dùng (§4.3): bản chép lời, lịch sử, xuất file. Tính năng Pro hỏi `pro::require`
//! trước mọi việc khác (Đ6). Mọi việc ở đây có thể chặn (mở DB lần đầu chờ kho khóa, hộp thoại lưu file), nên lệnh gọi
//! chúng là lệnh `async` chạy việc trên luồng của `spawn_blocking`, không trên luồng chính.

use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::settings::{Invalid, Reason};
use crate::state::AppState;
use crate::transcript::export::{self, Format, SrtText};
use crate::transcript::history::{self, SessionSummary};
use crate::transcript::store::{Transcript, TranscriptStore};
use crate::{db, files, i18n, pro};

/// Bản chép lời nào: của phiên hiện tại (hoặc vừa dừng), hay một phiên trong lịch sử.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TranscriptRef {
    Current,
    History { id: i64 },
}

/// Chạy `f` trên luồng của `spawn_blocking`.
pub async fn blocking<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>) -> Result<T, CommandError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(move || f(&app))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

pub fn current<R: Runtime>(app: &AppHandle<R>) -> Transcript {
    app.try_state::<TranscriptStore>()
        .map(|t| t.snapshot())
        .unwrap_or_default()
}

/// Bản chép lời theo `source`. Xem lịch sử là tính năng Pro.
pub fn load<R: Runtime>(app: &AppHandle<R>, source: TranscriptRef) -> Result<Transcript, CommandError> {
    match source {
        TranscriptRef::Current => Ok(current(app)),
        TranscriptRef::History { id } => {
            pro::require(app)?;
            db::with(app, |c| history::get(c, id))
        }
    }
}

/// Độ lệch múi giờ lớn nhất giao diện được gửi: ±18 giờ (giới hạn của ISO 8601). Ngoài khoảng này là dữ liệu hỏng, trả lỗi
/// `outOfRange` (§10.2: kiểm phạm vi mọi dữ liệu từ giao diện; N4 của review 03).
pub const MAX_UTC_OFFSET_MINUTES: i32 = 18 * 60;

fn check_offset(utc_offset_minutes: i32) -> Result<(), CommandError> {
    if (-MAX_UTC_OFFSET_MINUTES..=MAX_UTC_OFFSET_MINUTES).contains(&utc_offset_minutes) {
        Ok(())
    } else {
        Err(Invalid::new("utcOffsetMinutes", Reason::OutOfRange).into())
    }
}

fn strings<R: Runtime>(app: &AppHandle<R>) -> &'static i18n::Strings {
    i18n::strings(app.state::<AppState>().settings().ui_language)
}

/// Chữ TXT của bản chép lời, để sao chép (sao chép không phải tính năng Pro, F4).
pub fn transcript_text<R: Runtime>(
    app: &AppHandle<R>,
    source: TranscriptRef,
    utc_offset_minutes: i32,
) -> Result<String, CommandError> {
    check_offset(utc_offset_minutes)?;
    let t = load(app, source)?;
    Ok(export::txt(&t, utc_offset_minutes, strings(app)))
}

/// Xuất ra file (Pro): hỏi chỗ lưu rồi ghi. Trả đường dẫn đã ghi, `None` nếu người dùng hủy.
pub fn export_transcript<R: Runtime>(
    app: &AppHandle<R>,
    source: TranscriptRef,
    format: Format,
    srt_text: SrtText,
    utc_offset_minutes: i32,
) -> Result<Option<String>, CommandError> {
    pro::require(app)?;
    check_offset(utc_offset_minutes)?;
    let t = load(app, source)?;
    let s = strings(app);
    let (content, kind) = match format {
        Format::Txt => (export::txt(&t, utc_offset_minutes, s), files::TXT),
        Format::Srt => (export::srt(&t, srt_text, s), files::SRT),
        Format::Markdown => (export::markdown(&t, utc_offset_minutes, s), files::MARKDOWN),
    };
    files::save_as(app, &export::file_name(&t, format, utc_offset_minutes), kind, &content)
}

pub fn list_history<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<SessionSummary>, CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::list(c))
}

pub fn delete_history_session<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<(), CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::delete(c, id))
}

pub fn clear_history<R: Runtime>(app: &AppHandle<R>) -> Result<usize, CommandError> {
    pro::require(app)?;
    db::with(app, |c| history::clear(c))
}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index d6ce6a4e69169ac3e1eaeb813daf21bb9a41036b..c8a521804700ce5229620ce8ba1a74728578603e 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -56,6 +56,10 @@
 pub const PRO_REQUIRED: &str = "proRequired";
 /// Không mở được DB của lịch sử và từ điển (kho khóa bị từ chối, file lỗi, file của bản app mới hơn).
 pub const DATA_UNAVAILABLE: &str = "dataUnavailable";
+/// Không đọc hay ghi được file người dùng đã chọn (`files.rs`).
+pub const FILE_FAILED: &str = "fileFailed";
+/// File chọn để nhập lớn quá giới hạn (`files::MAX_IMPORT_BYTES`).
+pub const FILE_TOO_LARGE: &str = "fileTooLarge";
 /// Lỗi bên trong app không thuộc loại nào ở trên (ví dụ một tác vụ nền dừng bất thường).
 pub const UNKNOWN: &str = "unknown";
 
```

Tạo `src-tauri/src/files.rs`:

```rust
//! Chọn file để lưu hay mở bằng hộp thoại của hệ điều hành (xuất bản chép lời, nhập và xuất từ điển CSV). Webview chặn
//! `blob:` và không được gọi lệnh của plugin nào (§10.2), nên phía Rust tự mở hộp thoại (`tauri-plugin-dialog`, chỉ dùng
//! từ Rust: không cửa sổ nào được cấp quyền `dialog:*`), rồi tự đọc ghi file.
//!
//! Đi qua trait [`FilePicker`]: app thật dùng hộp thoại, test dùng bản giả trả đường dẫn trong thư mục tạm. Hộp thoại chặn
//! tới khi người dùng chọn xong, nên chỉ gọi từ luồng nền (lệnh `async` + `spawn_blocking`), không từ luồng chính.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

use crate::errors::{self, CommandError};
use crate::window;

/// Một loại file cho hộp thoại: tên hiển thị và đuôi file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FileType {
    pub name: &'static str,
    pub extension: &'static str,
}

pub const TXT: FileType = FileType {
    name: "Text",
    extension: "txt",
};
pub const SRT: FileType = FileType {
    name: "SubRip",
    extension: "srt",
};
pub const MARKDOWN: FileType = FileType {
    name: "Markdown",
    extension: "md",
};
pub const CSV: FileType = FileType {
    name: "CSV",
    extension: "csv",
};

/// File CSV nhập vào lớn hơn chừng này thì từ chối: 500 cặp, mỗi ô 200 ký tự, chưa tới 1 MiB.
pub const MAX_IMPORT_BYTES: u64 = 1 << 20;

pub trait FilePicker: Send + Sync + 'static {
    /// Hỏi chỗ lưu, gợi ý tên `file_name`. `None`: người dùng bấm Hủy.
    fn save(&self, file_name: &str, kind: FileType) -> Option<PathBuf>;
    /// Hỏi một file để mở. `None`: người dùng bấm Hủy.
    fn open(&self, kind: FileType) -> Option<PathBuf>;
}

/// `FilePicker` đang dùng, quản lý bằng `app.manage`.
pub struct Picker(pub Box<dyn FilePicker>);

struct Dialogs<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Dialogs<R> {
    /// Hộp thoại gắn vào cửa sổ chính (N12 của review 03): trên macOS nó hiện như sheet của cửa sổ chính, không mở thành
    /// cửa sổ riêng có thể nằm sau cửa sổ chính.
    fn builder(&self) -> FileDialogBuilder<R> {
        let builder = self.0.dialog().file();
        match self.0.get_webview_window(window::MAIN) {
            Some(main) => builder.set_parent(&main),
            None => builder,
        }
    }
}

impl<R: Runtime> FilePicker for Dialogs<R> {
    fn save(&self, file_name: &str, kind: FileType) -> Option<PathBuf> {
        self.builder()
            .set_file_name(file_name)
            .add_filter(kind.name, &[kind.extension])
            .blocking_save_file()
            .and_then(|p| p.into_path().ok())
    }

    fn open(&self, kind: FileType) -> Option<PathBuf> {
        self.builder()
            .add_filter(kind.name, &[kind.extension])
            .blocking_pick_file()
            .and_then(|p| p.into_path().ok())
    }
}

/// Cài hộp thoại thật. Gọi ở `setup`, sau khi đã đăng ký `tauri_plugin_dialog`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(Picker(Box::new(Dialogs(app.clone()))));
}

fn picker<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, Picker>, CommandError> {
    app.try_state::<Picker>()
        .ok_or_else(|| CommandError::new(errors::FILE_FAILED, None, "chưa cài FilePicker"))
}

/// Hỏi chỗ lưu rồi ghi `content`. Trả đường dẫn đã ghi, hoặc `None` nếu người dùng hủy.
pub fn save_as<R: Runtime>(
    app: &AppHandle<R>,
    file_name: &str,
    kind: FileType,
    content: &str,
) -> Result<Option<String>, CommandError> {
    let Some(path) = picker(app)?.0.save(file_name, kind) else {
        return Ok(None);
    };
    std::fs::write(&path, content).map_err(|e| file_error(&path, e))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Hỏi một file rồi đọc nó (tối đa [`MAX_IMPORT_BYTES`]). `None` nếu người dùng hủy.
pub fn open_bytes<R: Runtime>(app: &AppHandle<R>, kind: FileType) -> Result<Option<Vec<u8>>, CommandError> {
    let Some(path) = picker(app)?.0.open(kind) else {
        return Ok(None);
    };
    let size = std::fs::metadata(&path).map_err(|e| file_error(&path, e))?.len();
    if size > MAX_IMPORT_BYTES {
        return Err(CommandError::new(errors::FILE_TOO_LARGE, None, format!("{size} byte")));
    }
    std::fs::read(&path).map(Some).map_err(|e| file_error(&path, e))
}

fn file_error(path: &Path, e: std::io::Error) -> CommandError {
    // Đường dẫn có thể chứa tên người dùng: chỉ ghi vào `message` (log, hỗ trợ), giao diện hiện câu chung.
    CommandError::new(errors::FILE_FAILED, None, format!("{}: {e}", path.display()))
}
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index a5d4ec270ea60a320feb1b2b2c94e59b6e4fd76e..c02d6e4a87d65767ddbbe9c7f82f974b6ddc8eed 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -74,6 +74,7 @@
         .plugin(logging::plugin())
         .plugin(tauri_plugin_store::Builder::new().build())
         .plugin(autostart.build())
+        .plugin(tauri_plugin_dialog::init())
         .plugin(
             tauri_plugin_opener::Builder::new()
                 .open_js_links_on_click(false)
@@ -126,6 +127,7 @@
     db::install(&handle)?;
     app.manage(glossary::ActiveGlossary::default());
     app.manage(transcript::store::TranscriptStore::default());
+    files::install(&handle);
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 85f3149bbb848dad34521af644d81c6e23b73068..7fc78310fa9e7b521a0275814b9c160e61133164 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -176,6 +176,8 @@
   "error.glossaryNotFound": "This term no longer exists.",
   "error.csvInvalid": "This CSV file could not be read. Nothing was imported.",
   "error.historyNotFound": "This session is no longer in the history.",
+  "error.fileFailed": "Could not read or write that file. Choose another place and try again.",
+  "error.fileTooLarge": "This file is too large. A glossary file is at most 1 MB.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index 648ce06ffda1c6492f484d81f99e32ba838fe331..b2cb33539ec3e2fb033fff3a5e2f9d5d2a91b730 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -176,5 +176,7 @@
   "error.glossaryNotFound": "Thuật ngữ này không còn nữa.",
   "error.csvInvalid": "Không đọc được file CSV này. Chưa nhập gì.",
   "error.historyNotFound": "Phiên này không còn trong lịch sử.",
+  "error.fileFailed": "Không đọc hay ghi được file đó. Hãy chọn chỗ khác rồi thử lại.",
+  "error.fileTooLarge": "File này quá lớn. File từ điển tối đa 1 MB.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Khóa đúng bản đã thử:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && cargo update -q -p tauri-plugin-dialog --precise 2.8.1 && grep -A1 -E '^name = "(tauri-plugin-dialog|tauri-plugin-fs|rfd)"' Cargo.lock
```
Expected (lúc lập kế hoạch):
```text
name = "rfd"
version = "0.16.0"
--
name = "tauri-plugin-dialog"
version = "2.8.1"
--
name = "tauri-plugin-fs"
version = "2.6.0"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib the_transcript_can_be -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_transcript_can_be_read_copied_and_exported ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 207 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib files_larger_than -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::files_larger_than_1_mib_are_not_read ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 207 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib history_commands -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::history_commands_list_open_delete_and_need_pro ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 207 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib acl_tests -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 205 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 206 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/src/acl_tests.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/data.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/files.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/test_support.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): lệnh bản chép lời, lịch sử và xuất file qua hộp thoại lưu (F4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 9: Lệnh từ điển, xóa toàn bộ dữ liệu, bảng debug

Dòng 49, 56, 57, 222, 252, 273; QĐ6, QĐ21. Tám lệnh mới của cửa sổ `main`:
`list_glossary`, `add_glossary_entry`, `update_glossary_entry`, `delete_glossary_entry`, `import_glossary_csv`, `export_glossary_csv` (Pro; sửa xong thì nạp lại từ điển của luồng dịch), `clear_all_data` (mọi gói), `get_debug_sessions`.

- `data::clear_all_data`: `DataStore::wipe`, xóa bản chép lời trong bộ nhớ, đặt từ điển của luồng dịch về rỗng (`glossary::forget`, không đọc DB, để không tạo ngay file và khóa mới). Kế hoạch 04 gọi hàm này cho nút "Xóa model và dữ liệu".
- Test theo Q4 của review 03: mọi lệnh của từ điển, kể cả sửa và xóa, trả `proRequired` ở gói Free và không sửa gì (M01, M02); luồng dịch có ngay bản mới sau thêm, sửa, xóa và nhập (M03, M04).
- `debug.rs`: `DebugLog` giữ số đo của 10 phiên gần nhất (`DebugSession`: số câu theo loại, p50 và p90 từng bước), ghi ở `session::stop_engine`. Không có chữ chép lời.
- `ImportReport` gửi sang giao diện ở dạng camelCase (`overLimit`).

**Files:**
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/data.rs`
- Create: `src-tauri/src/debug.rs`
- Modify: `src-tauri/src/glossary.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/test_support.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 2bd0af37c66e3b2817f2b1366820ae4496b2e3e0..7bbf7eee4e6f7f45882ddd892a8ca07417072846 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -822,6 +822,205 @@
     assert_eq!(invoke(&main, "clear_history", json!({})).unwrap(), 0);
 }
 
+/// Từ điển thuật ngữ (Pro): thêm, sửa, xóa, xuất rồi nhập CSV qua hộp thoại; lỗi có mã; gói Free bị khóa.
+#[test]
+fn glossary_commands_edit_import_export_and_need_pro() {
+    use crate::test_support::FakePicker;
+    let app = mock_app();
+    let main = window(&app, "main");
+    let added = invoke(
+        &main,
+        "add_glossary_entry",
+        json!({ "source": "sprint", "target": "đợt chạy" }),
+    )
+    .unwrap();
+    let id = added["id"].as_i64().unwrap();
+    let dup = invoke(
+        &main,
+        "add_glossary_entry",
+        json!({ "source": "SPRINT", "target": "x" }),
+    )
+    .unwrap_err();
+    assert!(dup.contains("glossaryDuplicate"), "{dup}");
+    // Mỗi lần sửa thì luồng dịch có ngay bản mới (QĐ12): sau thêm, sửa, xóa và nhập (M03, M04 của review 03).
+    let active = app.state::<crate::glossary::ActiveGlossary>();
+    let active_target = |source: &str| {
+        active
+            .0
+            .read()
+            .unwrap()
+            .matches(source)
+            .first()
+            .map(|t| t.target.clone())
+    };
+    assert_eq!(active_target("sprint").as_deref(), Some("đợt chạy"));
+    invoke(
+        &main,
+        "update_glossary_entry",
+        json!({ "id": id, "source": "sprint", "target": "chặng" }),
+    )
+    .unwrap();
+    assert_eq!(active_target("sprint").as_deref(), Some("chặng"));
+    invoke(
+        &main,
+        "add_glossary_entry",
+        json!({ "source": "API, SDK", "target": "giao diện" }),
+    )
+    .unwrap();
+    assert_eq!(active.0.read().unwrap().len(), 2);
+
+    let path = invoke(&main, "export_glossary_csv", json!({})).unwrap();
+    let path = std::path::PathBuf::from(path.as_str().unwrap());
+    assert!(path.ends_with("glossary.csv"));
+    let csv = std::fs::read_to_string(&path).unwrap();
+    assert_eq!(csv, "\u{feff}source,target\nsprint,chặng\n\"API, SDK\",giao diện\n");
+    invoke(&main, "delete_glossary_entry", json!({ "id": id })).unwrap();
+    assert_eq!(active_target("sprint"), None, "xóa xong thì thôi dùng ngay");
+    assert_eq!(
+        invoke(&main, "list_glossary", json!({}))
+            .unwrap()
+            .as_array()
+            .unwrap()
+            .len(),
+        1
+    );
+
+    *app.state::<FakePicker>().to_open.lock().unwrap() = Some(path);
+    let report = invoke(&main, "import_glossary_csv", json!({})).unwrap();
+    assert_eq!(
+        report,
+        json!({ "added": 1, "updated": 1, "skipped": 0, "overLimit": 0 })
+    );
+    let sources: Vec<Value> = invoke(&main, "list_glossary", json!({}))
+        .unwrap()
+        .as_array()
+        .unwrap()
+        .iter()
+        .map(|e| e["source"].clone())
+        .collect();
+    assert_eq!(sources, [json!("API, SDK"), json!("sprint")]);
+    assert_eq!(
+        active_target("sprint").as_deref(),
+        Some("chặng"),
+        "nhập xong thì dùng ngay"
+    );
+    app.state::<FakePicker>()
+        .cancel
+        .store(true, std::sync::atomic::Ordering::SeqCst);
+    assert_eq!(invoke(&main, "import_glossary_csv", json!({})).unwrap(), Value::Null);
+
+    // Mọi lệnh của từ điển đi qua điểm kiểm tra Pro (M01, M02 của review 03), và không sửa gì ở gói Free.
+    set_pro(&app, false);
+    for (cmd, args) in [
+        ("list_glossary", json!({})),
+        ("import_glossary_csv", json!({})),
+        ("export_glossary_csv", json!({})),
+        ("add_glossary_entry", json!({ "source": "a", "target": "b" })),
+        (
+            "update_glossary_entry",
+            json!({ "id": id, "source": "sprint", "target": "x" }),
+        ),
+        ("delete_glossary_entry", json!({ "id": id })),
+    ] {
+        let refused = invoke(&main, cmd, args).unwrap_err();
+        assert!(refused.contains(errors::PRO_REQUIRED), "{cmd}: {refused}");
+    }
+    let kept = crate::db::with(app.handle(), |c| crate::glossary::list(c)).unwrap();
+    assert_eq!(kept.len(), 2);
+    assert!(kept.iter().any(|e| e.source == "sprint" && e.target == "chặng"));
+}
+
+/// Nút "Xóa toàn bộ dữ liệu" (§4.3): lịch sử, từ điển và bản chép lời trong bộ nhớ đều mất, kể cả ở gói Free; cài đặt
+/// giữ nguyên.
+#[test]
+fn clear_all_data_removes_history_glossary_and_the_transcript() {
+    let app = app_after_one_session(true);
+    let main = window(&app, "main");
+    invoke(
+        &main,
+        "add_glossary_entry",
+        json!({ "source": "sprint", "target": "đợt chạy" }),
+    )
+    .unwrap();
+    assert_eq!(
+        invoke(&main, "list_history", json!({}))
+            .unwrap()
+            .as_array()
+            .unwrap()
+            .len(),
+        1
+    );
+    let db_file = app.state::<crate::db::DataStore>().path();
+    assert!(db_file.exists());
+    set_pro(&app, false);
+    invoke(&main, "clear_all_data", json!({})).unwrap();
+    assert!(!db_file.exists(), "file DB bị xóa");
+    assert!(
+        invoke(&main, "get_transcript", json!({})).unwrap()["lines"]
+            .as_array()
+            .unwrap()
+            .is_empty()
+    );
+    assert!(
+        app.state::<crate::glossary::ActiveGlossary>()
+            .0
+            .read()
+            .unwrap()
+            .is_empty()
+    );
+    set_pro(&app, true);
+    assert!(
+        invoke(&main, "list_history", json!({}))
+            .unwrap()
+            .as_array()
+            .unwrap()
+            .is_empty()
+    );
+    assert!(
+        invoke(&main, "list_glossary", json!({}))
+            .unwrap()
+            .as_array()
+            .unwrap()
+            .is_empty()
+    );
+    assert_eq!(
+        invoke(&main, "get_settings", json!({})).unwrap()["saveHistory"],
+        true,
+        "cài đặt giữ nguyên"
+    );
+    // Xóa khi đang Pro: luồng dịch cũng thôi dùng thuật ngữ ngay (ở trên, về Free đã làm việc đó, C1 của lần chạy mutation).
+    invoke(
+        &main,
+        "add_glossary_entry",
+        json!({ "source": "sprint", "target": "đợt chạy" }),
+    )
+    .unwrap();
+    invoke(&main, "clear_all_data", json!({})).unwrap();
+    assert!(
+        app.state::<crate::glossary::ActiveGlossary>()
+            .0
+            .read()
+            .unwrap()
+            .is_empty()
+    );
+}
+
+/// Bảng debug ẩn (§7): số đo của phiên vừa dừng, không có chữ chép lời.
+#[test]
+fn the_debug_panel_lists_the_metrics_of_finished_sessions() {
+    let app = app_after_one_session(false);
+    let main = window(&app, "main");
+    let sessions = invoke(&main, "get_debug_sessions", json!({})).unwrap();
+    let first = &sessions[0];
+    assert_eq!(first["session"], 1);
+    assert!(first["translated"].as_u64().unwrap() >= 1);
+    assert_eq!(first["stages"][3]["name"], "total");
+    assert!(
+        !sessions.to_string().contains("Hello everyone"),
+        "không có chữ chép lời"
+    );
+}
+
 /// Từ điển thuật ngữ (F5) vào prompt của phiên ở gói Pro, theo mẫu "terminology" (§6.5); gói Free thì không (Đ6).
 #[test]
 fn glossary_terms_reach_the_prompt_only_for_pro() {
```

Tạo `src-tauri/src/debug.rs`, lúc này mới có phần test:

```rust
//! Bảng debug ẩn (spec §7, "Số đo từng phiên"; Đ17 của kế hoạch 00): số đo của vài phiên gần nhất trong lần chạy này của
//! app, chỉ trong bộ nhớ, không gửi đi đâu. Bản tóm tắt của mỗi phiên cũng nằm trong log (`session.rs`). Không có chữ chép
//! lời nào ở đây.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_ten_sessions_newest_first_with_stage_percentiles() {
        let log = DebugLog::default();
        for n in 1..=12 {
            let m = SessionMetrics {
                segments: n as usize,
                asr_ms: vec![100.0, 300.0],
                ..Default::default()
            };
            log.record(DebugSession::new(n, n * 1_000, &m));
        }
        let sessions = log.sessions();
        assert_eq!(sessions.len(), KEEP_SESSIONS);
        assert_eq!((sessions[0].session, sessions[9].session), (12, 3));
        let asr = &sessions[0].stages[1];
        assert_eq!(
            (asr.name, asr.count, asr.p50, asr.p90),
            ("asr", 2, Some(200.0), Some(280.0))
        );
        assert_eq!(sessions[0].stages[0].p50, None, "bước không có số đo");
        assert!(sessions[0].summary.starts_with("12 đoạn"));
    }
}
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index c02d6e4a87d65767ddbbe9c7f82f974b6ddc8eed..05ff528a8d0b2f23a60f6db84435e141c55a97bb 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -11,6 +11,7 @@
 pub mod commands;
 pub mod data;
 pub mod db;
+pub mod debug;
 pub mod errors;
 pub mod events;
 pub mod files;
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 64e76a139ed74178496d2590d1361a189625352b..8d0b418c0fa0cd949a238c26f209e52383b26f20 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -448,6 +448,7 @@
         ))
         .manage(ActiveGlossary::default())
         .manage(TranscriptStore::default())
+        .manage(crate::debug::DebugLog::default())
         .manage(Picker(Box::new(picker.clone())))
         .manage(picker)
         .manage(pro)
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib glossary_commands 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có lệnh mới, `debug.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 5 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `SessionMetrics` in this scope
error[E0425]: cannot find value `KEEP_SESSIONS` in this scope
error[E0433]: cannot find `DebugLog` in `debug`
error[E0433]: cannot find type `DebugLog` in this scope
error[E0433]: cannot find type `DebugSession` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index a9fe97f92f7cd198f5c362b5239d63b86627e892..3569d05133aa10d168acc3e6ff90052f29d01da6 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -29,6 +29,14 @@
             "get_history_session",
             "delete_history_session",
             "clear_history",
+            "list_glossary",
+            "add_glossary_entry",
+            "update_glossary_entry",
+            "delete_glossary_entry",
+            "import_glossary_csv",
+            "export_glossary_csv",
+            "clear_all_data",
+            "get_debug_sessions",
             "get_overlay_view",
         ])),
     )
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index a87feba58289ee512e76f8263106d0503b274e48..0e0644bfeede45f1db286cf90ddb8b913f233478 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -24,6 +24,14 @@
     "allow-get-history-session",
     "allow-delete-history-session",
     "allow-clear-history",
+    "allow-list-glossary",
+    "allow-add-glossary-entry",
+    "allow-update-glossary-entry",
+    "allow-delete-glossary-entry",
+    "allow-import-glossary-csv",
+    "allow-export-glossary-csv",
+    "allow-clear-all-data",
+    "allow-get-debug-sessions",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:webview:allow-set-webview-zoom"
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index 0d479044e13e6488f5601f4268c18d31f65f2cd4..3d37e6b87c76a424f3acc08899b5933eec7282b4 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -11,7 +11,9 @@
 
 use crate::actions::{self, AudioSourceOption};
 use crate::data::{self, TranscriptRef, blocking};
+use crate::debug::DebugSession;
 use crate::errors::{self, CommandError};
+use crate::glossary::{GlossaryEntry, ImportReport};
 use crate::hotkeys::HotkeyAction;
 use crate::settings::Settings;
 use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
@@ -153,6 +155,61 @@
 #[tauri::command]
 pub async fn clear_history<R: Runtime>(app: AppHandle<R>) -> Result<usize, CommandError> {
     blocking(app, data::clear_history).await
+}
+
+// ---- Từ điển thuật ngữ (F5, Pro), quyền riêng tư, bảng debug. ----
+
+#[tauri::command]
+pub async fn list_glossary<R: Runtime>(app: AppHandle<R>) -> Result<Vec<GlossaryEntry>, CommandError> {
+    blocking(app, data::list_glossary).await
+}
+
+#[tauri::command]
+pub async fn add_glossary_entry<R: Runtime>(
+    app: AppHandle<R>,
+    source: String,
+    target: String,
+) -> Result<GlossaryEntry, CommandError> {
+    blocking(app, move |app| data::add_glossary_entry(app, &source, &target)).await
+}
+
+#[tauri::command]
+pub async fn update_glossary_entry<R: Runtime>(
+    app: AppHandle<R>,
+    id: i64,
+    source: String,
+    target: String,
+) -> Result<GlossaryEntry, CommandError> {
+    blocking(app, move |app| data::update_glossary_entry(app, id, &source, &target)).await
+}
+
+#[tauri::command]
+pub async fn delete_glossary_entry<R: Runtime>(app: AppHandle<R>, id: i64) -> Result<(), CommandError> {
+    blocking(app, move |app| data::delete_glossary_entry(app, id)).await
+}
+
+/// Nhập CSV (Pro). `null` nếu người dùng bấm Hủy ở hộp thoại mở file.
+#[tauri::command]
+pub async fn import_glossary_csv<R: Runtime>(app: AppHandle<R>) -> Result<Option<ImportReport>, CommandError> {
+    blocking(app, data::import_glossary_csv).await
+}
+
+/// Xuất CSV (Pro). Trả đường dẫn đã ghi, `null` nếu người dùng bấm Hủy.
+#[tauri::command]
+pub async fn export_glossary_csv<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, CommandError> {
+    blocking(app, data::export_glossary_csv).await
+}
+
+/// Nút "Xóa toàn bộ dữ liệu": lịch sử và từ điển (§4.3).
+#[tauri::command]
+pub async fn clear_all_data<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
+    blocking(app, data::clear_all_data).await
+}
+
+/// Số đo của các phiên gần nhất, cho bảng debug ẩn (§7).
+#[tauri::command]
+pub fn get_debug_sessions<R: Runtime>(app: AppHandle<R>) -> Vec<DebugSession> {
+    data::debug_sessions(&app)
 }
 
 /// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
@@ -183,6 +240,14 @@
     "get_history_session",
     "delete_history_session",
     "clear_history",
+    "list_glossary",
+    "add_glossary_entry",
+    "update_glossary_entry",
+    "delete_glossary_entry",
+    "import_glossary_csv",
+    "export_glossary_csv",
+    "clear_all_data",
+    "get_debug_sessions",
 ];
 
 /// Lệnh của cửa sổ `overlay`.
@@ -210,6 +275,14 @@
         get_history_session,
         delete_history_session,
         clear_history,
+        list_glossary,
+        add_glossary_entry,
+        update_glossary_entry,
+        delete_glossary_entry,
+        import_glossary_csv,
+        export_glossary_csv,
+        clear_all_data,
+        get_debug_sessions,
         get_overlay_view,
     ]
 }
```

Sửa `src-tauri/src/data.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/data.rs b/src-tauri/src/data.rs
index ae31893627400b9cd2bdf74a484e9337ed462492..9cac62a422141a96e6ccf0cbbe33f21ddc563721 100644
--- a/src-tauri/src/data.rs
+++ b/src-tauri/src/data.rs
@@ -1,11 +1,14 @@
-//! Việc của các lệnh về dữ liệu người dùng (§4.3): bản chép lời, lịch sử, xuất file. Tính năng Pro hỏi `pro::require`
-//! trước mọi việc khác (Đ6). Mọi việc ở đây có thể chặn (mở DB lần đầu chờ kho khóa, hộp thoại lưu file), nên lệnh gọi
+//! Việc của các lệnh về dữ liệu người dùng (§4.3): bản chép lời, lịch sử, xuất file, từ điển thuật ngữ, xóa toàn bộ dữ liệu,
+//! bảng debug. Tính năng Pro hỏi `pro::require` trước mọi việc khác (Đ6). Mọi việc ở đây có thể chặn (mở DB lần đầu chờ kho khóa, hộp thoại lưu file), nên lệnh gọi
 //! chúng là lệnh `async` chạy việc trên luồng của `spawn_blocking`, không trên luồng chính.
 
 use serde::Deserialize;
 use tauri::{AppHandle, Manager, Runtime};
 
+use crate::db::DataStore;
+use crate::debug::{DebugLog, DebugSession};
 use crate::errors::{self, CommandError};
+use crate::glossary::{self, GlossaryEntry, ImportReport};
 use crate::settings::{Invalid, Reason};
 use crate::state::AppState;
 use crate::transcript::export::{self, Format, SrtText};
@@ -109,3 +112,82 @@
     pro::require(app)?;
     db::with(app, |c| history::clear(c))
 }
+
+// ---- Từ điển thuật ngữ (F5, Pro). Mỗi lần sửa thì nạp lại bản của luồng dịch, nên câu dịch sau dùng ngay. ----
+
+pub fn list_glossary<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<GlossaryEntry>, CommandError> {
+    pro::require(app)?;
+    db::with(app, |c| glossary::list(c))
+}
+
+pub fn add_glossary_entry<R: Runtime>(
+    app: &AppHandle<R>,
+    source: &str,
+    target: &str,
+) -> Result<GlossaryEntry, CommandError> {
+    pro::require(app)?;
+    let entry = db::with(app, |c| glossary::add(c, source, target))?;
+    glossary::reload(app);
+    Ok(entry)
+}
+
+pub fn update_glossary_entry<R: Runtime>(
+    app: &AppHandle<R>,
+    id: i64,
+    source: &str,
+    target: &str,
+) -> Result<GlossaryEntry, CommandError> {
+    pro::require(app)?;
+    let entry = db::with(app, |c| glossary::update(c, id, source, target))?;
+    glossary::reload(app);
+    Ok(entry)
+}
+
+pub fn delete_glossary_entry<R: Runtime>(app: &AppHandle<R>, id: i64) -> Result<(), CommandError> {
+    pro::require(app)?;
+    db::with(app, |c| glossary::delete(c, id))?;
+    glossary::reload(app);
+    Ok(())
+}
+
+/// Hỏi một file CSV rồi nhập. `None` nếu người dùng hủy.
+pub fn import_glossary_csv<R: Runtime>(app: &AppHandle<R>) -> Result<Option<ImportReport>, CommandError> {
+    pro::require(app)?;
+    let Some(bytes) = files::open_bytes(app, files::CSV)? else {
+        return Ok(None);
+    };
+    let report = db::with(app, |c| glossary::import_csv(c, &bytes))?;
+    glossary::reload(app);
+    Ok(Some(report))
+}
+
+/// Hỏi chỗ lưu rồi ghi cả từ điển ra CSV. Trả đường dẫn, `None` nếu người dùng hủy.
+pub fn export_glossary_csv<R: Runtime>(app: &AppHandle<R>) -> Result<Option<String>, CommandError> {
+    pro::require(app)?;
+    let text = db::with(app, |c| glossary::export_csv(c))?;
+    files::save_as(app, "glossary.csv", files::CSV, &text)
+}
+
+/// Nút "Xóa toàn bộ dữ liệu" (§4.3, Quyền riêng tư): xóa file DB (lịch sử và từ điển) cùng khóa của nó, và bản chép lời
+/// trong bộ nhớ. Không phải tính năng Pro: người đã về Free vẫn xóa được dữ liệu cũ. Không đụng trạng thái bản quyền,
+/// bộ đếm hạn mức (mục khác của kho khóa) hay file cài đặt. Kế hoạch 04 gọi hàm này cho nút "Xóa model và dữ liệu".
+pub fn clear_all_data<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
+    if let Some(store) = app.try_state::<DataStore>() {
+        store.wipe().map_err(|e| {
+            log::error!("không xóa được dữ liệu: {e}");
+            CommandError::from(e)
+        })?;
+    }
+    if let Some(transcript) = app.try_state::<TranscriptStore>() {
+        transcript.clear();
+    }
+    // Không nạp lại từ DB ở đây: đọc DB sẽ tạo ngay file và khóa mới.
+    glossary::forget(app);
+    log::info!("đã xóa toàn bộ lịch sử và từ điển theo yêu cầu của người dùng");
+    Ok(())
+}
+
+/// Số đo của các phiên gần nhất, cho bảng debug ẩn (§7).
+pub fn debug_sessions<R: Runtime>(app: &AppHandle<R>) -> Vec<DebugSession> {
+    app.try_state::<DebugLog>().map(|l| l.sessions()).unwrap_or_default()
+}
```

Thêm vào `src-tauri/src/debug.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::collections::VecDeque;
use std::sync::Mutex;

use pipeline::metrics::{SessionMetrics, percentile};
use serde::Serialize;

/// Số phiên giữ lại.
pub const KEEP_SESSIONS: usize = 10;

/// p50 và p90 của một bước, ms.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Stage {
    pub name: &'static str,
    pub count: usize,
    pub p50: Option<f32>,
    pub p90: Option<f32>,
}

/// Số đo của một phiên đã dừng.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugSession {
    pub session: u64,
    /// Giờ Unix (ms) lúc phiên dừng.
    pub ended_at: u64,
    /// Một dòng như trong log.
    pub summary: String,
    pub segments: usize,
    pub filtered: usize,
    pub dropped: usize,
    pub translated: usize,
    pub failed: usize,
    pub skipped: usize,
    pub same_lang: usize,
    pub merges: usize,
    pub translated_speech_ms: u64,
    /// Cắt đoạn, nhận dạng, dịch, tổng thể.
    pub stages: Vec<Stage>,
}

impl DebugSession {
    pub fn new(session: u64, ended_at: u64, m: &SessionMetrics) -> Self {
        let stage = |name, v: &[f32]| Stage {
            name,
            count: v.len(),
            p50: percentile(v, 50.0),
            p90: percentile(v, 90.0),
        };
        Self {
            session,
            ended_at,
            summary: m.summary(),
            segments: m.segments,
            filtered: m.filtered,
            dropped: m.dropped,
            translated: m.translated,
            failed: m.failed,
            skipped: m.skipped,
            same_lang: m.same_lang,
            merges: m.merges,
            translated_speech_ms: m.translated_speech_ms,
            stages: vec![
                stage("vad", &m.vad_ms),
                stage("asr", &m.asr_ms),
                stage("mt", &m.mt_ms),
                stage("total", &m.latency_ms),
            ],
        }
    }
}

/// Các phiên gần nhất, mới nhất trước. Quản lý bằng `app.manage`.
#[derive(Default)]
pub struct DebugLog(Mutex<VecDeque<DebugSession>>);

impl DebugLog {
    pub fn record(&self, entry: DebugSession) {
        let mut log = self.0.lock().unwrap_or_else(|e| e.into_inner());
        log.push_front(entry);
        log.truncate(KEEP_SESSIONS);
    }

    pub fn sessions(&self) -> Vec<DebugSession> {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .cloned()
            .collect()
    }
}
```

Sửa `src-tauri/src/glossary.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/glossary.rs b/src-tauri/src/glossary.rs
index cf4fb55c44c78b83caab4b7132675cc69fa86ffa..de45c16a6d7e55ab662d01c0753527057355de6b 100644
--- a/src-tauri/src/glossary.rs
+++ b/src-tauri/src/glossary.rs
@@ -39,6 +39,7 @@
 
 /// Kết quả một lần nhập CSV.
 #[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
+#[serde(rename_all = "camelCase")]
 pub struct ImportReport {
     pub added: usize,
     /// Chữ nguồn đã có, bản dịch được thay.
@@ -293,7 +294,8 @@
 #[derive(Default)]
 pub struct ActiveGlossary(pub SharedGlossary);
 
-/// Gói về Free: luồng dịch thôi dùng thuật ngữ ngay, từ câu sau (N11 của review 03). Không đọc DB.
+/// Luồng dịch thôi dùng thuật ngữ ngay, từ câu sau, mà không đọc DB: khi gói về Free (N11 của review 03) và khi xóa toàn
+/// bộ dữ liệu.
 pub fn forget<R: Runtime>(app: &AppHandle<R>) {
     if let Some(active) = app.try_state::<ActiveGlossary>() {
         *active.0.write().unwrap_or_else(|e| e.into_inner()) = Glossary::default();
```

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 05ff528a8d0b2f23a60f6db84435e141c55a97bb..c912bf1ea5632a9e72940cd4e7103d157ff423d7 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -129,6 +129,7 @@
     app.manage(glossary::ActiveGlossary::default());
     app.manage(transcript::store::TranscriptStore::default());
     files::install(&handle);
+    app.manage(debug::DebugLog::default());
     app.manage(HotkeyRegistry::default());
     // Tiến trình phụ mà lần chạy trước bỏ lại (Force Quit, app bị kill): kill trước khi chạy sẵn tiến trình mới, rồi từ
     // giờ ghi pidfile (Q8 của review 02c). Windows: Job Object đã lo, hàm không làm gì. Đọc pidfile ở đây chỉ đúng vì
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index d12eb2d7ad1d85e57fd0d1f10fdf4b4d56429aa5..39ad48fa99e58417aaa81fffee21625fcde44ae3 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -33,6 +33,7 @@
 use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};
 
 use crate::capture::{CaptureEvent, LiveCapture, OnEvent};
+use crate::debug::{DebugLog, DebugSession};
 use crate::errors::{self, CommandError};
 use crate::glossary::{self, ActiveGlossary};
 use crate::settings::{AudioSource, Lang, ModelTier, Settings};
@@ -366,8 +367,12 @@
         return false;
     };
     let metrics = engine.stop();
-    // Số đo của phiên vào log, không có chữ chép lời (§7, Đ17).
+    // Số đo của phiên vào log và bảng debug ẩn, không có chữ chép lời (§7, Đ17).
     log::info!("kết thúc phiên dịch: {}", metrics.summary());
+    let n = session.sessions.load(Ordering::SeqCst);
+    if let Some(debug) = app.try_state::<DebugLog>() {
+        debug.record(DebugSession::new(n, now_ms(), &metrics));
+    }
     session.deps.end_session();
     // Lưu lịch sử nếu bật "Lưu lịch sử" và là Pro (F4). Chạy ngay ở đây, cả khi thoát app, để không mất phiên cuối.
     end_transcript(app, session);
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib glossary_commands -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::glossary_commands_edit_import_export_and_need_pro ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 211 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib clear_all_data -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::clear_all_data_removes_history_glossary_and_the_transcript ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 211 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib debug -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_debug_panel_lists_the_metrics_of_finished_sessions ... ok
test debug::tests::keeps_the_last_ten_sessions_newest_first_with_stage_percentiles ... ok
test navigation::tests::packaged_ui_ignores_dev_url_even_in_debug_builds ... ok
test pro::tests::the_dev_gate_exists_only_in_debug_builds ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 208 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 210 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/data.rs \
  src-tauri/src/debug.rs \
  src-tauri/src/glossary.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/session.rs \
  src-tauri/src/test_support.rs
git commit -m "feat(app): lệnh từ điển thuật ngữ, xóa toàn bộ dữ liệu, bảng debug ẩn (F5, §4.3, §7)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 10: Thanh phụ đề phía Rust: mức âm lượng, kéo cạnh, nút ẩn, lệnh nghe thử

Dòng 17, 40, 43, 68; QĐ19, QĐ20. Theo §4.4 đã sửa ngày 2026-10-02 (commit `5925d42`, yêu cầu của chủ dự án sau khi thử tay): kéo cạnh hoặc góc trên cả macOS lẫn Windows, cỡ tối thiểu 320 × 80 điểm, nút ✕ ẩn thanh.

- `TauriSink::level` gửi `audio://level` cho cả thanh phụ đề (chỉ báo "đang nghe", §4.2).
- Trait `Surface` thêm `frame`, `set_frame`, `cursor`, `system_resize`; `OverlaySurface::new` giữ lần kéo cạnh đang dở. `remember_position` đọc khung qua `Surface`, nên test được bằng `FakeSurface` (đặt khung, màn hình, con trỏ).
- Kéo cạnh (`overlay::begin_resize`, `resize_to_cursor`, `end_resize`; `placement::resized` là phép tính): Windows để hệ điều hành đổi kích thước (`start_resize_dragging` của Tauri); macOS không có cách đó trong tao, nên app tự đặt khung theo vị trí con trỏ (đọc ở phía Rust, không nhận tọa độ từ giao diện). Độ dời con trỏ tính bằng điểm logic rồi đổi ra pixel theo tỉ lệ của màn hình chứa thanh, nên hai màn hình khác tỉ lệ vẫn đúng (Q-A của review 03 lần 2; test `the_edge_follows_the_cursor_on_screens_of_different_scales`). Không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước mới; thanh đang khóa thì không làm gì. Cả hai bản `overlay::create` vẫn đặt `resizable(true)` và cỡ tối thiểu lúc tạo.
- Bốn lệnh mới của cửa sổ `overlay` (đủ ba chỗ: `commands.rs`, `build.rs`, `capabilities/overlay.json`): `hide_overlay` (nút ✕: ẩn như phím tắt, phiên vẫn chạy), `begin_overlay_resize`, `overlay_resize_move`, `end_overlay_resize`. Các lệnh này chỉ đụng tới cửa sổ của chính thanh phụ đề; overlay **không** được cấp `core:window:allow-start-resize-dragging`.
- `actions::set_overlay_visible(false)` nhớ vị trí trước khi ẩn; có test (M17 của review 03).
- `StartOptions::LISTEN_TEST` (thu cả âm thanh của app, thu toàn hệ thống) và lệnh `start_listen_test` cho bước "Nghe thử"; `FakeDeps.capture_sources` ghi lại nguồn của từng lần mở.

**Files:**
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src-tauri/capabilities/overlay.json`
- Modify: `src-tauri/src/acl_tests.rs`
- Modify: `src-tauri/src/actions.rs`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/overlay/macos.rs`
- Modify: `src-tauri/src/overlay/mod.rs`
- Modify: `src-tauri/src/overlay/placement.rs`
- Modify: `src-tauri/src/overlay/windows.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/test_support.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/acl_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/acl_tests.rs b/src-tauri/src/acl_tests.rs
index 926c97fbc92a7bc30a8640369f644f91e0d64dbb..848c4a277a4c105b2265f2ac51e3de6452d6faed 100644
--- a/src-tauri/src/acl_tests.rs
+++ b/src-tauri/src/acl_tests.rs
@@ -7,8 +7,8 @@
 //! 3. Lệnh có tác dụng ra ngoài app chỉ tới bản giả của `SystemOpener` (QĐ28): bị chặn thì bản giả
 //!    không ghi nhận gì, được phép thì ghi nhận đúng lời gọi.
 //!
-//! Kế hoạch sau thêm quyền (ví dụ 03 cấp `core:window:allow-start-resize-dragging` cho overlay) thì sửa
-//! danh sách cố định ở đây trong cùng commit.
+//! Kế hoạch sau thêm quyền thì sửa danh sách cố định ở đây trong cùng commit. Kéo cạnh và nút ẩn của thanh phụ đề (03)
+//! là lệnh của app chỉ đụng tới cửa sổ của chính nó, không cấp `core:window:allow-start-resize-dragging`.
 
 use serde_json::{Value, json};
 
@@ -102,7 +102,7 @@
     assert_eq!(
         permissions(include_str!("../capabilities/overlay.json"), "overlay"),
         expected(OVERLAY_COMMANDS, OVERLAY_CORE_PERMISSIONS),
-        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện và kéo cửa sổ của chính nó"
+        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện, kéo, đổi kích thước và ẩn cửa sổ của chính nó"
     );
     let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
     let mut files: Vec<String> = std::fs::read_dir(dir)
```

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 7bbf7eee4e6f7f45882ddd892a8ca07417072846..37691163b39e9c4308ea3c3c29bd0a5ad01f5c95 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -246,11 +246,194 @@
     let captures = deps.captures.clone();
     let app = mock_app_with(deps);
     let _main = window(&app, "main");
-    session::start_with(app.handle(), StartOptions { include_self: true }).unwrap();
+    session::start_with(app.handle(), StartOptions::LISTEN_TEST).unwrap();
     session::stop(app.handle());
     session::start(app.handle()).unwrap();
     session::stop(app.handle());
     assert_eq!(*captures.lock().unwrap(), [true, false]);
+}
+
+/// Thanh phụ đề trên màn hình 1920 × 1080 điểm, tỉ lệ 2 (Retina): khung 900 × 160 điểm.
+fn overlay_on_a_retina_screen(app: &tauri::App<tauri::test::MockRuntime>) -> crate::test_support::FakeSurface {
+    use crate::overlay::placement::{Frame, Screen};
+    let surface = app.state::<crate::test_support::FakeSurface>().inner().clone();
+    let screen = Screen {
+        key: "Retina 3840x2160".into(),
+        x: 0,
+        y: 0,
+        width: 3840,
+        height: 2160,
+        scale: 2.0,
+    };
+    let frame = Frame {
+        x: 200,
+        y: 1600,
+        width: 1800,
+        height: 320,
+    };
+    *surface.frame.lock().unwrap() = Some((frame, screen));
+    surface
+}
+
+fn saved_rect(app: &tauri::App<tauri::test::MockRuntime>) -> Option<(f64, f64, f64, f64)> {
+    let settings = app.state::<AppState>().settings();
+    let r = settings.overlay.positions.get("Retina 3840x2160")?;
+    Some((r.x, r.y, r.width, r.height))
+}
+
+/// Kéo cạnh trên macOS (§4.4): app tự đặt khung theo con trỏ, không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước
+/// mới cho màn hình đó. Thanh đang khóa thì không đổi gì.
+#[test]
+fn dragging_an_edge_resizes_the_overlay_and_remembers_it() {
+    let app = mock_app();
+    let overlay = window(&app, "overlay");
+    let surface = overlay_on_a_retina_screen(&app);
+    // Con trỏ tính bằng điểm: dời (100, −30) điểm là (200, −60) pixel trên màn hình tỉ lệ 2.
+    *surface.cursor.lock().unwrap() = (100.0, 850.0);
+    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "northWest" })).unwrap();
+    *surface.cursor.lock().unwrap() = (200.0, 820.0);
+    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+    *surface.cursor.lock().unwrap() = (2500.0, 2500.0);
+    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+    invoke(&overlay, "end_overlay_resize", json!({})).unwrap();
+    assert_eq!(
+        overlay_calls(&app),
+        ["frame 400 1540 1600x380", "frame 1360 1760 640x160"],
+        "cạnh phải và cạnh dưới đứng yên; cỡ tối thiểu 320 × 80 điểm là 640 × 160 pixel"
+    );
+    assert_eq!(saved_rect(&app), Some((680.0, 880.0, 320.0, 80.0)));
+    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+    assert_eq!(overlay_calls(&app).len(), 2, "nhả chuột rồi thì thôi theo con trỏ");
+
+    let main = window(&app, "main");
+    invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
+    let before = overlay_calls(&app).len();
+    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "east" })).unwrap();
+    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+    assert_eq!(overlay_calls(&app).len(), before, "đang khóa thì không đổi kích thước");
+}
+
+/// Q-A của review 03 lần 2: mép thanh dính theo con trỏ trên màn hình tỉ lệ 1 cũng như trên màn hình Retina (tỉ lệ 2), dù
+/// màn hình chính có tỉ lệ nào: con trỏ dời 100 điểm thì khung dời 100 điểm, tức 100 pixel trên màn hình 1×, 200 pixel trên
+/// màn hình 2×.
+#[test]
+fn the_edge_follows_the_cursor_on_screens_of_different_scales() {
+    use crate::overlay::placement::{Frame, Screen};
+    for (scale, expected) in [(1.0, "frame 0 0 1000x160"), (2.0, "frame 0 0 1100x160")] {
+        let app = mock_app();
+        let overlay = window(&app, "overlay");
+        let surface = app.state::<crate::test_support::FakeSurface>().inner().clone();
+        let screen = Screen {
+            key: format!("screen {scale}"),
+            x: 0,
+            y: 0,
+            width: 3840,
+            height: 2160,
+            scale,
+        };
+        let frame = Frame {
+            x: 0,
+            y: 0,
+            width: 900,
+            height: 160,
+        };
+        *surface.frame.lock().unwrap() = Some((frame, screen));
+        *surface.cursor.lock().unwrap() = (500.0, 50.0);
+        invoke(&overlay, "begin_overlay_resize", json!({ "edge": "east" })).unwrap();
+        *surface.cursor.lock().unwrap() = (600.0, 50.0);
+        invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+        assert_eq!(overlay_calls(&app), [expected], "tỉ lệ {scale}");
+    }
+}
+
+/// Kéo cạnh trên Windows (§4.4): hệ điều hành đổi kích thước (`start_resize_dragging`); app không tự đặt khung.
+#[test]
+fn on_windows_the_system_resizes_the_overlay() {
+    let app = mock_app();
+    let overlay = window(&app, "overlay");
+    let surface = overlay_on_a_retina_screen(&app);
+    surface.system_resize.store(true, std::sync::atomic::Ordering::SeqCst);
+    invoke(&overlay, "begin_overlay_resize", json!({ "edge": "southEast" })).unwrap();
+    *surface.cursor.lock().unwrap() = (400.0, 1640.0);
+    invoke(&overlay, "overlay_resize_move", json!({})).unwrap();
+    invoke(&overlay, "end_overlay_resize", json!({})).unwrap();
+    assert_eq!(overlay_calls(&app), ["system resize SouthEast"]);
+    assert!(invoke(&overlay, "begin_overlay_resize", json!({ "edge": "up" })).is_err());
+}
+
+/// Nút ✕ (§4.4): ẩn thanh như phím tắt, phiên dịch vẫn chạy; vị trí được nhớ lúc ẩn (QĐ19, M17 của review 03).
+#[test]
+fn the_hide_button_hides_the_overlay_keeps_the_session_and_remembers_the_position() {
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let overlay = window(&app, "overlay");
+    overlay_on_a_retina_screen(&app);
+    session::start(app.handle()).unwrap();
+    assert!(app.state::<AppState>().status().overlay_visible);
+    invoke(&overlay, "hide_overlay", json!({})).unwrap();
+    let status = app.state::<AppState>().status();
+    assert!(!status.overlay_visible);
+    assert_eq!(status.session, SessionStatus::Running, "ẩn thanh không dừng phiên");
+    assert_eq!(overlay_calls(&app).last().map(String::as_str), Some("hide"));
+    assert_eq!(saved_rect(&app), Some((100.0, 800.0, 900.0, 160.0)));
+    session::stop(app.handle());
+}
+
+/// Ẩn bằng phím tắt, menu khay hay nút ở cửa sổ chính cũng nhớ vị trí (QĐ19, M17 của review 03).
+#[test]
+fn hiding_the_overlay_from_the_main_window_remembers_the_position() {
+    let app = mock_app();
+    let main = window(&app, "main");
+    overlay_on_a_retina_screen(&app);
+    assert_eq!(saved_rect(&app), None);
+    invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
+    assert_eq!(saved_rect(&app), Some((100.0, 800.0, 900.0, 160.0)));
+}
+
+/// Lệnh `start_listen_test`: thu toàn hệ thống kể cả chính app, dù cài đặt đang chọn một app họp; phiên thường vẫn theo
+/// cài đặt. Thanh phụ đề cũng nhận mức âm lượng (chỉ báo "đang nghe", §4.4).
+#[test]
+fn the_listening_test_captures_the_whole_system_and_the_overlay_hears_the_level() {
+    use crate::settings::AudioSource;
+    let deps = FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    };
+    let (captures, sources) = (deps.captures.clone(), deps.capture_sources.clone());
+    let app = mock_app_with(deps);
+    let main = window(&app, "main");
+    let _overlay = window(&app, "overlay");
+    invoke(
+        &main,
+        "update_settings",
+        json!({ "patch": { "audioSource": { "kind": "app", "bundleId": "us.zoom.xos" } } }),
+    )
+    .unwrap();
+    let levels = Arc::new(Mutex::new(0usize));
+    let seen = levels.clone();
+    app.get_webview_window("overlay")
+        .unwrap()
+        .listen(AUDIO_LEVEL, move |_| *seen.lock().unwrap() += 1);
+    let status = invoke(&main, "start_listen_test", json!({})).unwrap();
+    assert_eq!(status["session"], "running");
+    wait_until("thanh phụ đề nhận mức âm lượng", || {
+        *levels.lock().unwrap() > 0
+    });
+    invoke(&main, "toggle_session", json!({})).unwrap();
+    invoke(&main, "toggle_session", json!({})).unwrap();
+    invoke(&main, "toggle_session", json!({})).unwrap();
+    assert_eq!(*captures.lock().unwrap(), [true, false]);
+    assert_eq!(
+        *sources.lock().unwrap(),
+        [
+            AudioSource::System,
+            AudioSource::App {
+                bundle_id: "us.zoom.xos".into()
+            }
+        ]
+    );
 }
 
 /// App giả có `prepare` chặn ở cổng (như nạp model lâu), và một lần bắt đầu phiên đang chờ ở đó trên luồng riêng.
```

Sửa `src-tauri/src/overlay/placement.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/placement.rs b/src-tauri/src/overlay/placement.rs
index 5ed16dd2aedfb3f4efe7657760ca4ce4a59b9b44..b6039482d5dd1ce58b88fc264ceb1d6dfaa24dcc 100644
--- a/src-tauri/src/overlay/placement.rs
+++ b/src-tauri/src/overlay/placement.rs
@@ -406,4 +406,56 @@
         remember(&mut positions, "e", rect_at(0.0), 50, 3);
         assert_eq!(positions.keys().collect::<Vec<_>>(), ["b", "d", "e"]);
     }
-}
+
+    /// Kéo cạnh hay góc (§4.4): chỉ cạnh được kéo dời đi, cạnh đối diện đứng yên; không nhỏ hơn cỡ tối thiểu.
+    #[test]
+    fn resizing_moves_only_the_dragged_sides() {
+        let start = Frame {
+            x: 100,
+            y: 500,
+            width: 900,
+            height: 160,
+        };
+        let f = |x, y, width, height| Frame { x, y, width, height };
+        let cases = [
+            (Edge::East, 50, 30, f(100, 500, 950, 160)),
+            (Edge::West, 50, 30, f(150, 500, 850, 160)),
+            (Edge::North, 50, -30, f(100, 470, 900, 190)),
+            (Edge::South, 50, -30, f(100, 500, 900, 130)),
+            (Edge::NorthEast, -100, 20, f(100, 520, 800, 140)),
+            (Edge::NorthWest, -100, 20, f(0, 520, 1000, 140)),
+            (Edge::SouthEast, 10, 10, f(100, 500, 910, 170)),
+            (Edge::SouthWest, 10, 10, f(110, 500, 890, 170)),
+        ];
+        for (edge, dx, dy, expected) in cases {
+            assert_eq!(resized(start, edge, dx, dy, 640, 80), expected, "{edge:?}");
+        }
+        // Kéo quá cỡ tối thiểu: dừng ở cỡ tối thiểu, cạnh đối diện vẫn đứng yên.
+        assert_eq!(resized(start, Edge::West, 5000, 0, 640, 80), f(360, 500, 640, 160));
+        assert_eq!(resized(start, Edge::North, 0, 5000, 640, 80), f(100, 580, 900, 80));
+        assert_eq!(
+            resized(start, Edge::SouthEast, -5000, -5000, 640, 80),
+            f(100, 500, 640, 80)
+        );
+    }
+
+    /// Giao diện gửi tên cạnh dạng camelCase; Windows nhận tên hướng của Tauri.
+    #[test]
+    fn edges_come_in_camel_case_and_map_to_tauri_directions() {
+        let names = [
+            ("north", "North"),
+            ("south", "South"),
+            ("east", "East"),
+            ("west", "West"),
+            ("northEast", "NorthEast"),
+            ("northWest", "NorthWest"),
+            ("southEast", "SouthEast"),
+            ("southWest", "SouthWest"),
+        ];
+        for (name, direction) in names {
+            let edge: Edge = serde_json::from_value(serde_json::json!(name)).unwrap();
+            assert_eq!(edge.direction(), direction);
+        }
+        assert!(serde_json::from_value::<Edge>(serde_json::json!("up")).is_err());
+    }
+}
```

Sửa `src-tauri/src/test_support.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/test_support.rs b/src-tauri/src/test_support.rs
index 8d0b418c0fa0cd949a238c26f209e52383b26f20..7151909e71c803394d92aed0f20d181a5c5256d4 100644
--- a/src-tauri/src/test_support.rs
+++ b/src-tauri/src/test_support.rs
@@ -26,6 +26,7 @@
 use crate::files::{FilePicker, FileType, Picker};
 use crate::glossary::ActiveGlossary;
 use crate::login_item::{AgentStatus, LoginItem, LoginItems};
+use crate::overlay::placement::{Edge, Frame, Screen};
 use crate::overlay::{OverlaySurface, Surface};
 use crate::pro::{Entitlement, ProGate};
 use crate::security::keystore::Keystore;
@@ -37,25 +38,60 @@
 use crate::system::{System, SystemOpener};
 use crate::transcript::store::TranscriptStore;
 
-/// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`.
+/// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`, `frame 1 2 300x80`,
+/// `system resize west`. Khung cửa sổ (pixel), màn hình và con trỏ (điểm logic, như `Surface::cursor`) do test đặt; mặc
+/// định chưa có khung (như chưa có cửa sổ).
 #[derive(Clone, Default)]
-pub struct FakeSurface(Arc<Mutex<Vec<String>>>);
+pub struct FakeSurface {
+    calls: Arc<Mutex<Vec<String>>>,
+    pub frame: Arc<Mutex<Option<(Frame, Screen)>>>,
+    pub cursor: Arc<Mutex<(f64, f64)>>,
+    /// Hệ điều hành tự đổi kích thước (như Windows); mặc định không (như macOS).
+    pub system_resize: Arc<AtomicBool>,
+}
+
+impl FakeSurface {
+    fn push(&self, call: String) {
+        self.calls.lock().unwrap().push(call);
+    }
+}
 
 impl Surface for FakeSurface {
     fn set_visible(&self, visible: bool) -> tauri::Result<()> {
-        self.0
-            .lock()
-            .unwrap()
-            .push(if visible { "show" } else { "hide" }.into());
+        self.push(if visible { "show" } else { "hide" }.into());
         Ok(())
     }
 
     fn set_click_through(&self, on: bool) -> tauri::Result<()> {
-        self.0
-            .lock()
-            .unwrap()
-            .push(if on { "click_through on" } else { "click_through off" }.into());
-        Ok(())
+        self.push(if on { "click_through on" } else { "click_through off" }.into());
+        Ok(())
+    }
+
+    fn frame(&self) -> Option<(Frame, Screen)> {
+        self.frame.lock().unwrap().clone()
+    }
+
+    fn set_frame(&self, frame: Frame) -> tauri::Result<()> {
+        self.push(format!(
+            "frame {} {} {}x{}",
+            frame.x, frame.y, frame.width, frame.height
+        ));
+        if let Some((current, _)) = self.frame.lock().unwrap().as_mut() {
+            *current = frame;
+        }
+        Ok(())
+    }
+
+    fn cursor(&self) -> Option<(f64, f64)> {
+        Some(*self.cursor.lock().unwrap())
+    }
+
+    fn system_resize(&self, edge: Edge) -> bool {
+        if !self.system_resize.load(Ordering::SeqCst) {
+            return false;
+        }
+        self.push(format!("system resize {}", edge.direction()));
+        true
     }
 }
 
@@ -246,6 +282,8 @@
     pub asr_unavailable: bool,
     /// Giá trị `include_self` của từng lần mở nguồn âm thanh.
     pub captures: Arc<Mutex<Vec<bool>>>,
+    /// Nguồn âm thanh của từng lần mở.
+    pub capture_sources: Arc<Mutex<Vec<AudioSource>>>,
     /// Nơi nhận việc của nguồn âm thanh của từng phiên, theo thứ tự: test gọi để giả lỗi tới muộn.
     pub capture_events: Arc<Mutex<Vec<OnEvent>>>,
     /// Số lần `shutdown` và `kill_all` được gọi.
@@ -373,8 +411,9 @@
         Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.05 }) as _))
     }
 
-    fn capture(&self, _source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
+    fn capture(&self, source: &AudioSource, include_self: bool, on_event: OnEvent) -> Box<dyn FrameSource> {
         self.captures.lock().unwrap().push(include_self);
+        self.capture_sources.lock().unwrap().push(source.clone());
         if let Some(code) = self.capture_error {
             on_event(crate::capture::CaptureEvent::Failed {
                 code,
@@ -433,7 +472,7 @@
             FileMeta::current(),
             false,
         ))
-        .manage(OverlaySurface(Box::new(surface.clone())))
+        .manage(OverlaySurface::new(Box::new(surface.clone())))
         .manage(surface)
         .manage(System(Box::new(system.clone())))
         .manage(system)
@@ -515,7 +554,7 @@
 
 /// Các lần gọi tới thanh phụ đề từ lúc dựng app giả.
 pub fn overlay_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
-    app.state::<FakeSurface>().0.lock().unwrap().clone()
+    app.state::<FakeSurface>().calls.lock().unwrap().clone()
 }
 
 pub fn window(app: &tauri::App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib overlay 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có `placement::Frame`, `Edge`, các hàm mới của `Surface`, `StartOptions::LISTEN_TEST`, `capture_sources`):
```text
error: could not compile `meeting-translator` (lib test) due to 28 previous errors
error[E0407]: method `cursor` is not a member of trait `Surface`
error[E0407]: method `frame` is not a member of trait `Surface`
error[E0407]: method `set_frame` is not a member of trait `Surface`
error[E0407]: method `system_resize` is not a member of trait `Surface`
error[E0422]: cannot find struct, variant or union type `Frame` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index 3569d05133aa10d168acc3e6ff90052f29d01da6..568ad369f6eedca41db211f6fa2b905b52c0ce12 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -14,6 +14,7 @@
             "set_hotkey",
             "get_app_status",
             "toggle_session",
+            "start_listen_test",
             "set_overlay_visible",
             "set_overlay_locked",
             "get_app_info",
@@ -38,6 +39,10 @@
             "clear_all_data",
             "get_debug_sessions",
             "get_overlay_view",
+            "hide_overlay",
+            "begin_overlay_resize",
+            "overlay_resize_move",
+            "end_overlay_resize",
         ])),
     )
     .expect("tauri-build thất bại");
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index 0e0644bfeede45f1db286cf90ddb8b913f233478..6c58d5ab82c7337d07fcff63fcd4333588c9ebb5 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -9,6 +9,7 @@
     "allow-set-hotkey",
     "allow-get-app-status",
     "allow-toggle-session",
+    "allow-start-listen-test",
     "allow-set-overlay-visible",
     "allow-set-overlay-locked",
     "allow-get-app-info",
```

Sửa `src-tauri/capabilities/overlay.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/overlay.json b/src-tauri/capabilities/overlay.json
index 8dd428903b74dc233b3f03ca903e25a308207043..4781eba37ce9579626b74daa080e377b2ef6228d 100644
--- a/src-tauri/capabilities/overlay.json
+++ b/src-tauri/capabilities/overlay.json
@@ -1,10 +1,14 @@
 {
   "$schema": "../gen/schemas/desktop-schema.json",
   "identifier": "overlay",
-  "description": "Thanh phụ đề: chỉ đọc phần cài đặt của nó, nghe sự kiện và kéo cửa sổ của chính nó (spec §10.2).",
+  "description": "Thanh phụ đề: chỉ đọc phần cài đặt của nó, nghe sự kiện, kéo, kéo cạnh để đổi kích thước và ẩn cửa sổ của chính nó (spec §4.4, §10.2).",
   "windows": ["overlay"],
   "permissions": [
     "allow-get-overlay-view",
+    "allow-hide-overlay",
+    "allow-begin-overlay-resize",
+    "allow-overlay-resize-move",
+    "allow-end-overlay-resize",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:window:allow-start-dragging"
```

Sửa `src-tauri/src/actions.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/actions.rs b/src-tauri/src/actions.rs
index 6ce90d0396275c85a16a1ab20d8bfd2c30ba7ab2..5bcbf77c997b4c9f0d69fdee4ca299cf16a5711f 100644
--- a/src-tauri/src/actions.rs
+++ b/src-tauri/src/actions.rs
@@ -93,6 +93,10 @@
 }
 
 pub fn set_overlay_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
+    if !visible {
+        // Nhớ vị trí cả lúc ẩn, phòng khi NSPanel không báo sự kiện di chuyển (mục 2.3 của kế hoạch 00, 01 Task 24).
+        overlay::remember_position(app);
+    }
     overlay::set_visible(app, visible).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?;
     app.state::<AppState>().update_status(|s| s.overlay_visible = visible);
     Ok(status_changed(app))
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index 3d37e6b87c76a424f3acc08899b5933eec7282b4..801f3fbc1b8e0e097d336434faa21438dc0ed48c 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -15,6 +15,7 @@
 use crate::errors::{self, CommandError};
 use crate::glossary::{GlossaryEntry, ImportReport};
 use crate::hotkeys::HotkeyAction;
+use crate::overlay::{self, placement::Edge};
 use crate::settings::Settings;
 use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
 use crate::transcript::export::{Format, SrtText};
@@ -52,6 +53,17 @@
     tauri::async_runtime::spawn_blocking(move || actions::toggle_session(&app))
         .await
         .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
+}
+
+/// Bước "Nghe thử" (§4.1 bước 6): bắt đầu phiên thu toàn hệ thống, kể cả câu mẫu do chính app phát. Dừng bằng
+/// `toggle_session` như phiên thường.
+#[tauri::command]
+pub async fn start_listen_test<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
+    tauri::async_runtime::spawn_blocking(move || {
+        crate::session::start_with(&app, crate::session::StartOptions::LISTEN_TEST)
+    })
+    .await
+    .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
 }
 
 #[tauri::command]
@@ -212,10 +224,33 @@
     data::debug_sessions(&app)
 }
 
-/// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
+// ---- Lệnh của cửa sổ `overlay` (§10.2): đọc phần cài đặt của nó, và chỉ đụng tới cửa sổ của chính nó. ----
+
 #[tauri::command]
 pub fn get_overlay_view(state: State<'_, AppState>) -> OverlayView {
     OverlayView::from_settings(&state.settings())
+}
+
+/// Nút ✕ của thanh phụ đề (§4.4): ẩn thanh như phím tắt ẩn/hiện; phiên dịch vẫn chạy, app không thoát.
+#[tauri::command]
+pub fn hide_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
+    actions::set_overlay_visible(&app, false).map(|_| ())
+}
+
+/// Bấm giữ ở cạnh hay góc của thanh phụ đề để đổi kích thước (§4.4). Vị trí con trỏ đọc ở phía Rust.
+#[tauri::command]
+pub fn begin_overlay_resize<R: Runtime>(app: AppHandle<R>, edge: Edge) {
+    overlay::begin_resize(&app, edge);
+}
+
+#[tauri::command]
+pub fn overlay_resize_move<R: Runtime>(app: AppHandle<R>) {
+    overlay::resize_to_cursor(&app);
+}
+
+#[tauri::command]
+pub fn end_overlay_resize<R: Runtime>(app: AppHandle<R>) {
+    overlay::end_resize(&app);
 }
 
 /// Lệnh của cửa sổ `main`.
@@ -225,6 +260,7 @@
     "set_hotkey",
     "get_app_status",
     "toggle_session",
+    "start_listen_test",
     "set_overlay_visible",
     "set_overlay_locked",
     "get_app_info",
@@ -251,7 +287,13 @@
 ];
 
 /// Lệnh của cửa sổ `overlay`.
-pub const OVERLAY_COMMANDS: &[&str] = &["get_overlay_view"];
+pub const OVERLAY_COMMANDS: &[&str] = &[
+    "get_overlay_view",
+    "hide_overlay",
+    "begin_overlay_resize",
+    "overlay_resize_move",
+    "end_overlay_resize",
+];
 
 pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
     tauri::generate_handler![
@@ -260,6 +302,7 @@
         set_hotkey,
         get_app_status,
         toggle_session,
+        start_listen_test,
         set_overlay_visible,
         set_overlay_locked,
         get_app_info,
@@ -284,5 +327,9 @@
         clear_all_data,
         get_debug_sessions,
         get_overlay_view,
+        hide_overlay,
+        begin_overlay_resize,
+        overlay_resize_move,
+        end_overlay_resize,
     ]
 }
```

Sửa `src-tauri/src/overlay/macos.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/macos.rs b/src-tauri/src/overlay/macos.rs
index 19546dcfd6b5627d23bb85f6429d594305a8b57d..4759f637f337ebf0fdf162ccdf27e364c8e5cce8 100644
--- a/src-tauri/src/overlay/macos.rs
+++ b/src-tauri/src/overlay/macos.rs
@@ -7,7 +7,8 @@
 use tauri::{AppHandle, Runtime, WebviewUrl};
 use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};
 
-use super::LABEL;
+use super::placement::Edge;
+use super::{LABEL, MIN_HEIGHT, MIN_WIDTH};
 use crate::navigation;
 
 tauri_nspanel::tauri_panel! {
@@ -25,6 +26,10 @@
         .url(WebviewUrl::App("overlay.html".into()))
         .title(title)
         .size(tauri::Size::Logical(tauri::LogicalSize::new(900.0, 160.0)))
+        // Kéo cạnh để đổi kích thước (§4.4): app tự đổi khung theo con trỏ (`overlay::resize_to_cursor`). Vẫn đặt
+        // `resizable` và cỡ tối thiểu, phòng khi chính NSPanel không viền cũng cho kéo ở mép ngoài cùng.
+        .resizable(true)
+        .min_size(tauri::Size::Logical(tauri::LogicalSize::new(MIN_WIDTH, MIN_HEIGHT)))
         .with_window(move |w| {
             w.decorations(false)
                 .transparent(true)
@@ -62,3 +67,8 @@
     }
     Ok(())
 }
+
+/// tao trên macOS không có `drag_resize_window`: app tự đổi kích thước theo con trỏ.
+pub fn system_resize<R: Runtime>(_app: &AppHandle<R>, _edge: Edge) -> bool {
+    false
+}
```

Sửa `src-tauri/src/overlay/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/mod.rs b/src-tauri/src/overlay/mod.rs
index 5fff622dc1d9bd379477bebe2d8d7b74d2bc08e4..fc4ddf6eb7ffdc15f804a6752fc77961fdb4d298 100644
--- a/src-tauri/src/overlay/mod.rs
+++ b/src-tauri/src/overlay/mod.rs
@@ -3,8 +3,16 @@
 //! - macOS (`macos.rs`): NSPanel non-activating qua `tauri-nspanel`;
 //! - Windows (`windows.rs`): cửa sổ topmost, `skip_taskbar`, `focusable(false)`.
 //!
-//! Phần chung ở đây: ẩn/hiện, khóa (click xuyên qua), nhớ vị trí theo từng màn hình. Ẩn/hiện và khóa
-//! đi qua trait `Surface`, để test (`app_tests.rs`) kiểm bằng bản giả mà không cần cửa sổ thật.
+//! Phần chung ở đây: ẩn/hiện, khóa (click xuyên qua), nhớ vị trí theo từng màn hình, kéo cạnh để đổi kích thước. Các
+//! thao tác trên cửa sổ đi qua trait `Surface`, để test (`app_tests.rs`) kiểm bằng bản giả mà không cần cửa sổ thật.
+//!
+//! Kéo cạnh hay góc (§4.4, cả macOS lẫn Windows): thanh phụ đề vẽ vùng kéo ở mép (khi chưa khóa) và gọi
+//! [`begin_resize`], [`resize_to_cursor`], [`end_resize`]. Windows để hệ điều hành đổi kích thước (`start_resize_dragging`).
+//! macOS không có cách đó trong tao, nên app tự đặt khung cửa sổ theo vị trí con trỏ (đọc ở phía Rust, không nhận tọa độ
+//! từ giao diện) mỗi lần con trỏ di chuyển. Độ dời của con trỏ tính bằng điểm logic rồi mới đổi ra pixel theo tỉ lệ của
+//! màn hình chứa thanh: tao đổi vị trí con trỏ ra pixel theo tỉ lệ của màn hình chính, còn khung cửa sổ theo tỉ lệ của màn
+//! hình chứa nó, nên hai màn hình khác tỉ lệ (Retina và màn hình ngoài 1×) mà cộng thẳng pixel thì mép thanh chạy nhanh
+//! gấp đôi hay chậm một nửa so với con trỏ (Q-A của review 03 lần 2).
 
 pub mod placement;
 
@@ -17,6 +25,7 @@
 #[cfg(not(target_os = "macos"))]
 use windows as platform;
 
+use std::sync::Mutex;
 use std::time::{SystemTime, UNIX_EPOCH};
 
 use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime};
@@ -24,9 +33,13 @@
 use crate::i18n;
 use crate::settings::{MAX_OVERLAY_POSITIONS, persist};
 use crate::state::AppState;
-use placement::Screen;
+use placement::{Edge, Frame, Screen};
 
 pub const LABEL: &str = "overlay";
+/// Cỡ nhỏ nhất của thanh phụ đề khi kéo cạnh (điểm logic, §4.4): 320 × 80, trên mức tối thiểu `settings::OVERLAY_WIDTH`
+/// (200) và `OVERLAY_HEIGHT` (40), để vị trí sau khi kéo luôn qua `Settings::validate` và được lưu.
+pub const MIN_WIDTH: f64 = 320.0;
+pub const MIN_HEIGHT: f64 = 80.0;
 
 /// Thao tác trên cửa sổ của thanh phụ đề. Bản thật gọi `macos.rs` hoặc `windows.rs`; test dùng bản giả
 /// ghi lại từng lần gọi (`test_support::FakeSurface`).
@@ -34,10 +47,45 @@
     fn set_visible(&self, visible: bool) -> tauri::Result<()>;
     /// Chế độ khóa: click đi xuyên qua thanh phụ đề (§4.4).
     fn set_click_through(&self, on: bool) -> tauri::Result<()>;
+    /// Khung hiện tại của cửa sổ và màn hình nó đang nằm. `None`: chưa có cửa sổ, hay không đọc được.
+    fn frame(&self) -> Option<(Frame, Screen)>;
+    fn set_frame(&self, frame: Frame) -> tauri::Result<()>;
+    /// Vị trí con trỏ chuột, bằng điểm logic (không phải pixel).
+    fn cursor(&self) -> Option<(f64, f64)>;
+    /// Để hệ điều hành đổi kích thước theo con trỏ cho tới khi nhả chuột. `false`: hệ điều hành không làm được (macOS),
+    /// app tự đổi ([`resize_to_cursor`]).
+    fn system_resize(&self, edge: Edge) -> bool;
+}
+
+/// Một lần kéo cạnh đang dở (macOS): cạnh đang kéo, con trỏ (điểm) và khung (pixel) lúc bấm, tỉ lệ của màn hình chứa
+/// thanh, cỡ tối thiểu theo pixel của màn hình đó.
+#[derive(Clone, Copy, Debug)]
+struct Drag {
+    edge: Edge,
+    cursor: (f64, f64),
+    frame: Frame,
+    scale: f64,
+    min: (u32, u32),
 }
 
 /// `Surface` đang dùng, quản lý bằng `app.manage`: `create` đặt bản thật, test đặt bản giả.
-pub struct OverlaySurface(pub Box<dyn Surface>);
+pub struct OverlaySurface {
+    surface: Box<dyn Surface>,
+    drag: Mutex<Option<Drag>>,
+}
+
+impl OverlaySurface {
+    pub fn new(surface: Box<dyn Surface>) -> Self {
+        Self {
+            surface,
+            drag: Mutex::new(None),
+        }
+    }
+
+    fn drag(&self) -> std::sync::MutexGuard<'_, Option<Drag>> {
+        self.drag.lock().unwrap_or_else(|e| e.into_inner())
+    }
+}
 
 struct Native<R: Runtime>(AppHandle<R>);
 
@@ -48,6 +96,47 @@
 
     fn set_click_through(&self, on: bool) -> tauri::Result<()> {
         platform::set_ignore_mouse(&self.0, on)
+    }
+
+    fn frame(&self) -> Option<(Frame, Screen)> {
+        let window = self.0.get_webview_window(LABEL)?;
+        let (Ok(position), Ok(size), Ok(Some(monitor))) =
+            (window.outer_position(), window.outer_size(), window.current_monitor())
+        else {
+            return None;
+        };
+        let frame = Frame {
+            x: position.x,
+            y: position.y,
+            width: size.width,
+            height: size.height,
+        };
+        Some((frame, screen_of(&monitor)))
+    }
+
+    fn set_frame(&self, frame: Frame) -> tauri::Result<()> {
+        if let Some(window) = self.0.get_webview_window(LABEL) {
+            window.set_size(PhysicalSize::new(frame.width, frame.height))?;
+            window.set_position(PhysicalPosition::new(frame.x, frame.y))?;
+        }
+        Ok(())
+    }
+
+    fn cursor(&self) -> Option<(f64, f64)> {
+        // tao đổi vị trí con trỏ (điểm, `NSEvent mouseLocation`) ra pixel theo tỉ lệ của màn hình chính: chia lại cho tỉ lệ
+        // đó. Chỉ macOS dùng (Windows để hệ điều hành đổi kích thước).
+        let p = self.0.cursor_position().ok()?;
+        let scale = self
+            .0
+            .primary_monitor()
+            .ok()
+            .flatten()
+            .map_or(1.0, |m| m.scale_factor());
+        Some((p.x / scale, p.y / scale))
+    }
+
+    fn system_resize(&self, edge: Edge) -> bool {
+        platform::system_resize(&self.0, edge)
     }
 }
 
@@ -56,14 +145,14 @@
 pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
     let settings = app.state::<AppState>().settings();
     platform::create(app, i18n::strings(settings.ui_language).overlay_title)?;
-    app.manage(OverlaySurface(Box::new(Native(app.clone()))));
+    app.manage(OverlaySurface::new(Box::new(Native(app.clone()))));
     restore_position(app);
     set_locked(app, settings.overlay.locked)
 }
 
 pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
     match app.try_state::<OverlaySurface>() {
-        Some(surface) => surface.0.set_visible(visible),
+        Some(overlay) => overlay.surface.set_visible(visible),
         None => Ok(()),
     }
 }
@@ -71,7 +160,7 @@
 /// Chế độ khóa: cho click xuyên qua thanh phụ đề (§4.4).
 pub fn set_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> tauri::Result<()> {
     match app.try_state::<OverlaySurface>() {
-        Some(surface) => surface.0.set_click_through(locked),
+        Some(overlay) => overlay.surface.set_click_through(locked),
         None => Ok(()),
     }
 }
@@ -119,18 +208,12 @@
 }
 
 /// Nhớ vị trí hiện tại của thanh phụ đề cho màn hình nó đang nằm (gọi khi cửa sổ di chuyển hay đổi
-/// kích thước, và trước khi thoát).
+/// kích thước, khi ẩn, và trước khi thoát).
 pub fn remember_position<R: Runtime>(app: &AppHandle<R>) {
-    let Some(window) = app.get_webview_window(LABEL) else {
-        return;
-    };
-    let (Ok(position), Ok(size), Ok(Some(monitor))) =
-        (window.outer_position(), window.outer_size(), window.current_monitor())
-    else {
-        return;
-    };
-    let screen = screen_of(&monitor);
-    let rect = placement::to_relative(&screen, position.x, position.y, size.width, size.height);
+    let Some((frame, screen)) = app.try_state::<OverlaySurface>().and_then(|o| o.surface.frame()) else {
+        return;
+    };
+    let rect = placement::to_relative(&screen, frame.x, frame.y, frame.width, frame.height);
     let state = app.state::<AppState>();
     let mut next = state.settings();
     let unchanged = next
@@ -159,3 +242,62 @@
         log::warn!("không lưu được vị trí thanh phụ đề: {e}");
     }
 }
+
+/// Bấm giữ ở cạnh hay góc `edge` của thanh phụ đề (§4.4). Thanh đang khóa thì không làm gì (click đi xuyên qua, nên lệnh
+/// này thường không tới).
+pub fn begin_resize<R: Runtime>(app: &AppHandle<R>, edge: Edge) {
+    if app.state::<AppState>().settings().overlay.locked {
+        return;
+    }
+    let Some(overlay) = app.try_state::<OverlaySurface>() else {
+        return;
+    };
+    *overlay.drag() = None;
+    if overlay.surface.system_resize(edge) {
+        return;
+    }
+    let (Some((frame, screen)), Some(cursor)) = (overlay.surface.frame(), overlay.surface.cursor()) else {
+        return;
+    };
+    let min = (
+        (MIN_WIDTH * screen.scale).ceil() as u32,
+        (MIN_HEIGHT * screen.scale).ceil() as u32,
+    );
+    *overlay.drag() = Some(Drag {
+        edge,
+        cursor,
+        frame,
+        scale: screen.scale,
+        min,
+    });
+}
+
+/// Con trỏ di chuyển trong lúc kéo cạnh: đặt khung theo con trỏ (chỉ khi app tự đổi kích thước, xem [`Surface`]).
+pub fn resize_to_cursor<R: Runtime>(app: &AppHandle<R>) {
+    let Some(overlay) = app.try_state::<OverlaySurface>() else {
+        return;
+    };
+    let Some(drag) = *overlay.drag() else {
+        return;
+    };
+    let Some(cursor) = overlay.surface.cursor() else {
+        return;
+    };
+    // Độ dời bằng điểm, đổi ra pixel theo tỉ lệ của màn hình chứa thanh.
+    let dx = ((cursor.0 - drag.cursor.0) * drag.scale).round() as i32;
+    let dy = ((cursor.1 - drag.cursor.1) * drag.scale).round() as i32;
+    let next = placement::resized(drag.frame, drag.edge, dx, dy, drag.min.0, drag.min.1);
+    if let Err(e) = overlay.surface.set_frame(next) {
+        log::warn!("không đổi được kích thước thanh phụ đề: {e}");
+    }
+}
+
+/// Nhả chuột: hết lần kéo cạnh, nhớ vị trí và kích thước mới.
+pub fn end_resize<R: Runtime>(app: &AppHandle<R>) {
+    let Some(overlay) = app.try_state::<OverlaySurface>() else {
+        return;
+    };
+    if overlay.drag().take().is_some() {
+        remember_position(app);
+    }
+}
```

Sửa `src-tauri/src/overlay/placement.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/placement.rs b/src-tauri/src/overlay/placement.rs
index b6039482d5dd1ce58b88fc264ceb1d6dfaa24dcc..8b530ef63d5b4f6ba8077b2efc50ddbe5335a2b8 100644
--- a/src-tauri/src/overlay/placement.rs
+++ b/src-tauri/src/overlay/placement.rs
@@ -5,6 +5,8 @@
 //! File này chỉ có phép tính, không gọi Tauri; phần đọc màn hình và đặt cửa sổ nằm ở `overlay/mod.rs`.
 
 use std::collections::BTreeMap;
+
+use serde::Deserialize;
 
 use crate::settings::OverlayRect;
 
@@ -35,6 +37,82 @@
 /// Khoảng cách tối thiểu tới mép trái và phải, và khoảng cách tới mép dưới khi đặt mặc định.
 const MARGIN: f64 = 24.0;
 const BOTTOM_GAP: f64 = 72.0;
+
+/// Khung của cửa sổ, tọa độ vật lý (pixel).
+#[derive(Clone, Copy, Debug, PartialEq, Eq)]
+pub struct Frame {
+    pub x: i32,
+    pub y: i32,
+    pub width: u32,
+    pub height: u32,
+}
+
+/// Cạnh hay góc đang kéo để đổi kích thước thanh phụ đề (§4.4). Tên theo hướng: `north` là cạnh trên.
+#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
+#[serde(rename_all = "camelCase")]
+pub enum Edge {
+    North,
+    South,
+    East,
+    West,
+    NorthEast,
+    NorthWest,
+    SouthEast,
+    SouthWest,
+}
+
+impl Edge {
+    /// Tên hướng theo `ResizeDirection` của Tauri (`start_resize_dragging`).
+    pub fn direction(self) -> &'static str {
+        use Edge::*;
+        match self {
+            North => "North",
+            South => "South",
+            East => "East",
+            West => "West",
+            NorthEast => "NorthEast",
+            NorthWest => "NorthWest",
+            SouthEast => "SouthEast",
+            SouthWest => "SouthWest",
+        }
+    }
+
+    fn sides(self) -> (bool, bool, bool, bool) {
+        use Edge::*;
+        // (trên, dưới, trái, phải)
+        match self {
+            North => (true, false, false, false),
+            South => (false, true, false, false),
+            East => (false, false, false, true),
+            West => (false, false, true, false),
+            NorthEast => (true, false, false, true),
+            NorthWest => (true, false, true, false),
+            SouthEast => (false, true, false, true),
+            SouthWest => (false, true, true, false),
+        }
+    }
+}
+
+/// Khung mới khi kéo `edge` của khung `start` đi một đoạn (`dx`, `dy`) pixel: chỉ cạnh được kéo dời đi, cạnh đối diện đứng
+/// yên; không nhỏ hơn `min_width` × `min_height`.
+pub fn resized(start: Frame, edge: Edge, dx: i32, dy: i32, min_width: u32, min_height: u32) -> Frame {
+    let (top, bottom, left, right) = edge.sides();
+    let grow = |size: u32, by: i32, min: u32| (i64::from(size) + i64::from(by)).max(i64::from(min)) as u32;
+    let mut next = start;
+    if left {
+        next.width = grow(start.width, -dx, min_width);
+        next.x = start.x + start.width as i32 - next.width as i32;
+    } else if right {
+        next.width = grow(start.width, dx, min_width);
+    }
+    if top {
+        next.height = grow(start.height, -dy, min_height);
+        next.y = start.y + start.height as i32 - next.height as i32;
+    } else if bottom {
+        next.height = grow(start.height, dy, min_height);
+    }
+    next
+}
 
 /// Khóa của một màn hình: tên và độ phân giải đầy đủ. Hai màn hình cùng model và cùng độ phân giải
 /// dùng chung một vị trí; chấp nhận được, vì vị trí vẫn nằm trong màn hình.
```

Sửa `src-tauri/src/overlay/windows.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/overlay/windows.rs b/src-tauri/src/overlay/windows.rs
index 7cd707983852d222d7b220c44eda6a6bd76df0c3..1e47ec5f90c65129be0e16cb10cc0b2eba9f01d7 100644
--- a/src-tauri/src/overlay/windows.rs
+++ b/src-tauri/src/overlay/windows.rs
@@ -16,12 +16,18 @@
 };
 
 use super::LABEL;
+use super::placement::Edge;
 use crate::navigation;
 
 pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<()> {
     WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
         .title(title)
         .inner_size(900.0, 160.0)
+        // Kéo cạnh để đổi kích thước (§4.4): thanh phụ đề tự vẽ vùng kéo cạnh, rồi hệ điều hành đổi kích thước
+        // (`system_resize`). Cờ đặt một lần ở đây (QĐ23 của kế hoạch 01). Cỡ tối thiểu trên mức của `settings`, để vị trí
+        // luôn lưu được.
+        .resizable(true)
+        .min_inner_size(super::MIN_WIDTH, super::MIN_HEIGHT)
         .decorations(false)
         .transparent(true)
         .always_on_top(true)
@@ -79,3 +85,15 @@
     }
     Ok(())
 }
+
+/// Hệ điều hành đổi kích thước theo con trỏ tới khi nhả chuột (`WM_NCLBUTTONDOWN` với cạnh tương ứng, qua tao).
+pub fn system_resize<R: Runtime>(app: &AppHandle<R>, edge: Edge) -> bool {
+    let Some(window) = app.get_webview_window(LABEL) else {
+        return false;
+    };
+    // `tauri` không xuất kiểu `ResizeDirection`; tên hướng trùng `Edge::direction`, nên dựng qua serde.
+    let Ok(direction) = serde_json::from_value(serde_json::Value::String(edge.direction().into())) else {
+        return false;
+    };
+    window.as_ref().window().start_resize_dragging(direction).is_ok()
+}
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index 39ad48fa99e58417aaa81fffee21625fcde44ae3..f4725b270ef9bbbd0d4b2a0fcc5a77d66bc7d04b 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -203,6 +203,17 @@
     /// Thu cả âm thanh của chính app: cho bước "Nghe thử" (§4.1 bước 6), khi app tự phát một câu mẫu. Kế hoạch 03 dùng
     /// (Đ16 của kế hoạch 00). Chỉ có tác dụng trên macOS với nguồn toàn hệ thống.
     pub include_self: bool,
+    /// Thu toàn hệ thống, bỏ qua nguồn trong cài đặt: câu mẫu của bước "Nghe thử" phát ra thiết bị mặc định, không phát
+    /// từ app họp đã chọn (macOS) hay thiết bị đã chọn (Windows).
+    pub system_source: bool,
+}
+
+impl StartOptions {
+    /// Bước "Nghe thử": thu toàn hệ thống, kể cả âm thanh của chính app.
+    pub const LISTEN_TEST: StartOptions = StartOptions {
+        include_self: true,
+        system_source: true,
+    };
 }
 
 /// Bắt đầu phiên với nguồn âm thanh trong cài đặt. Chặn tới khi phiên chạy (hoặc lỗi, hoặc bị hủy): gọi từ luồng nền.
@@ -288,9 +299,14 @@
     if let Some(transcript) = app.try_state::<TranscriptStore>() {
         transcript.begin(n, now_ms(), code_of(settings.target_language));
     }
+    let audio_source = if options.system_source {
+        AudioSource::System
+    } else {
+        settings.audio_source.clone()
+    };
     let source = session
         .deps
-        .capture(&settings.audio_source, options.include_self, capture_events(app, n));
+        .capture(&audio_source, options.include_self, capture_events(app, n));
     let sink = Arc::new(TauriSink {
         app: app.clone(),
         session: n,
@@ -547,10 +563,12 @@
     }
 
     fn level(&self, rms: f32) {
-        // Chỉ cửa sổ chính vẽ mức âm lượng.
-        let _ = self
-            .app
-            .emit_to(EventTarget::webview_window(window::MAIN), events::AUDIO_LEVEL, rms);
+        // Cửa sổ chính vẽ thanh mức âm lượng; thanh phụ đề vẽ chỉ báo "đang nghe" (§4.2, §4.4).
+        for label in [window::MAIN, overlay::LABEL] {
+            let _ = self
+                .app
+                .emit_to(EventTarget::webview_window(label), events::AUDIO_LEVEL, rms);
+        }
     }
 
     fn indicators(&self, indicators: &Indicators) {
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib listening -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::a_listening_test_session_also_captures_the_app_itself ... ok
test app_tests::the_listening_test_captures_the_whole_system_and_the_overlay_hears_the_level ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 218 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib overlay -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::dragging_an_edge_resizes_the_overlay_and_remembers_it ... ok
test app_tests::hide_show_and_lock_reach_the_overlay_window ... ok
test app_tests::hiding_the_overlay_from_the_main_window_remembers_the_position ... ok
test app_tests::on_windows_the_system_resizes_the_overlay ... ok
test app_tests::overlay_starts_hidden_and_appears_when_a_session_starts ... ok
test app_tests::the_hide_button_hides_the_overlay_keeps_the_session_and_remembers_the_position ... ok
test app_tests::the_listening_test_captures_the_whole_system_and_the_overlay_hears_the_level ... ok
test overlay::placement::tests::edges_come_in_camel_case_and_map_to_tauri_directions ... ok
test overlay::placement::tests::first_launch_goes_bottom_center_of_primary ... ok
test overlay::placement::tests::last_screen_without_a_saved_position_is_skipped ... ok
test overlay::placement::tests::narrow_screen_keeps_margins_in_default_rect ... ok
test overlay::placement::tests::no_screen_means_no_placement ... ok
test overlay::placement::tests::off_screen_position_is_pulled_back_inside ... ok
test overlay::placement::tests::position_below_the_bottom_edge_is_pulled_up ... ok
test overlay::placement::tests::relative_position_roundtrips_through_scale ... ok
test overlay::placement::tests::remember_drops_the_least_recently_used_screen ... ok
test overlay::placement::tests::remember_stamps_time_and_updates_in_place ... ok
test overlay::placement::tests::resizing_moves_only_the_dragged_sides ... ok
test overlay::placement::tests::saved_position_is_restored_on_its_screen ... ok
test overlay::placement::tests::saved_screen_is_found_anywhere_in_the_list ... ok
test overlay::placement::tests::screen_key_uses_name_and_resolution ... ok
test overlay::placement::tests::unplugged_screen_falls_back_to_another_saved_screen_then_default ... ok
test settings::persist::tests::save_writes_every_key_and_save_overlay_only_overlay ... ok
test settings::tests::overlay_positions_are_bounded ... ok
test result: ok. 24 passed; 0 failed; 0 ignored; 0 measured; 196 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib different_scales -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_edge_follows_the_cursor_on_screens_of_different_scales ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 219 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib acl_tests -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 217 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 218 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  6 passed (6)
      Tests  67 passed (67)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/capabilities/overlay.json \
  src-tauri/src/acl_tests.rs \
  src-tauri/src/actions.rs \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/overlay/macos.rs \
  src-tauri/src/overlay/mod.rs \
  src-tauri/src/overlay/placement.rs \
  src-tauri/src/overlay/windows.rs \
  src-tauri/src/session.rs \
  src-tauri/src/test_support.rs
git commit -m "feat(app): thanh phụ đề kéo cạnh trên cả macOS và Windows, nút ẩn, mức âm lượng, lệnh nghe thử (§4.1 bước 6, §4.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 11: Màu chữ và màu nền của phụ đề (phía Rust)

§4.3 đã sửa ngày 2026-10-02 (commit `5925d42`): Cài đặt › Phụ đề có màu chữ và màu nền, chọn từ bảng màu có sẵn (chữ: trắng, vàng, xanh lá, xanh dương nhạt, cam; nền: đen, xám đậm, xanh navy, nâu đậm, tím đậm), mặc định chữ trắng trên nền đen, đổi là thấy ngay trên thanh phụ đề. QĐ23.

- `settings::TextColor`, `settings::BackgroundColor` (tên camelCase trong file và IPC), hai khóa `overlay.textColor`, `overlay.background` có `#[serde(default)]`: file cài đặt của bản trước không cần bước migrate, màu không có trong bảng thì về mặc định (`rejected`), như mọi khóa khác.
- `update_settings` nhận hai khóa này (không phải khóa chỉ đọc); giá trị ngoài bảng màu là `wrongType`.
- `OverlayView` thêm `textColor`, `background`, nên thanh phụ đề nhận màu mới qua `overlay://view` ngay khi đổi. Mã màu nằm ở giao diện (03b Task 1).

**Files:**
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/settings/migrate.rs`
- Modify: `src-tauri/src/settings/mod.rs`
- Modify: `src-tauri/src/settings/patch.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 37691163b39e9c4308ea3c3c29bd0a5ad01f5c95..5b97117d76448a7aacf336bde024caf461d59f48 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -279,6 +279,37 @@
     let settings = app.state::<AppState>().settings();
     let r = settings.overlay.positions.get("Retina 3840x2160")?;
     Some((r.x, r.y, r.width, r.height))
+}
+
+/// Đổi màu chữ, màu nền ở Cài đặt › Phụ đề (§4.3): thanh phụ đề thấy ngay qua `overlay://view`. Mặc định chữ trắng trên
+/// nền đen.
+#[test]
+fn subtitle_colors_reach_the_overlay_at_once() {
+    let app = mock_app();
+    let main = window(&app, "main");
+    let overlay = window(&app, "overlay");
+    let view = invoke(&overlay, "get_overlay_view", json!({})).unwrap();
+    assert_eq!(
+        (&view["textColor"], &view["background"]),
+        (&json!("white"), &json!("black"))
+    );
+    let views = record(&app, crate::events::OVERLAY_VIEW);
+    invoke(
+        &main,
+        "update_settings",
+        json!({ "patch": { "overlay": { "textColor": "yellow", "background": "navy" } } }),
+    )
+    .unwrap();
+    let last = views.lock().unwrap().last().cloned().unwrap();
+    assert_eq!(
+        (&last["textColor"], &last["background"]),
+        (&json!("yellow"), &json!("navy"))
+    );
+    let saved = last_saved(&app, "overlay").unwrap();
+    assert_eq!(
+        (&saved["textColor"], &saved["background"]),
+        (&json!("yellow"), &json!("navy"))
+    );
 }
 
 /// Kéo cạnh trên macOS (§4.4): app tự đặt khung theo con trỏ, không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước
```

Sửa `src-tauri/src/settings/migrate.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/migrate.rs b/src-tauri/src/settings/migrate.rs
index e14e91e20327646f26960183ab2bdb424bcdfad1..7bb0255b288c93691afb16d33c724129367e6198 100644
--- a/src-tauri/src/settings/migrate.rs
+++ b/src-tauri/src/settings/migrate.rs
@@ -374,6 +374,34 @@
         assert!(loaded.needs_save());
     }
 
+    /// File của bản trước chưa có màu phụ đề: chữ trắng trên nền đen (§4.3), các khóa khác của nhóm giữ nguyên. Màu
+    /// không có trong bảng màu thì về mặc định.
+    #[test]
+    fn subtitle_colors_default_to_white_on_black() {
+        use crate::settings::{BackgroundColor, TextColor};
+        let raw = object(json!({ "schemaVersion": 1, "overlay": { "fontSize": 30 } }));
+        let loaded = load(raw, defaults());
+        let o = &loaded.settings.overlay;
+        assert_eq!(
+            (o.text_color, o.background, o.font_size),
+            (TextColor::White, BackgroundColor::Black, 30)
+        );
+        let raw = object(json!({
+            "schemaVersion": 1,
+            "overlay": { "textColor": "yellow", "background": "pink" },
+        }));
+        let loaded = load(raw, defaults());
+        let o = &loaded.settings.overlay;
+        assert_eq!(
+            (o.text_color, o.background),
+            (TextColor::Yellow, BackgroundColor::Black)
+        );
+        assert_eq!(loaded.rejected, ["overlay.background"]);
+        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
+        assert_eq!(entries["overlay"]["textColor"], "yellow");
+        assert_eq!(entries["overlay"]["background"], "black");
+    }
+
     #[test]
     fn swapped_hotkeys_are_kept_together() {
         let raw = object(json!({
```

Sửa `src-tauri/src/settings/patch.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/patch.rs b/src-tauri/src/settings/patch.rs
index 75cd9700733c212b6d7bfbc193b4166ebf40ddcf..13825fb866b8250cb18365d29408e49e8d8dd861 100644
--- a/src-tauri/src/settings/patch.rs
+++ b/src-tauri/src/settings/patch.rs
@@ -159,6 +159,29 @@
         );
     }
 
+    /// Màu chữ và màu nền của phụ đề (§4.3): chỉ nhận màu trong bảng màu có sẵn.
+    #[test]
+    fn subtitle_colors_come_from_the_palette() {
+        use crate::settings::{BackgroundColor, TextColor};
+        let s = apply(
+            &current(),
+            &json!({ "overlay": { "textColor": "lightBlue", "background": "darkPurple" } }),
+        )
+        .unwrap();
+        assert_eq!(
+            (s.overlay.text_color, s.overlay.background),
+            (TextColor::LightBlue, BackgroundColor::DarkPurple)
+        );
+        assert_eq!(
+            apply(&current(), &json!({ "overlay": { "textColor": "#ff00ff" } })),
+            Err(Invalid::new("overlay.textColor", Reason::WrongType))
+        );
+        assert_eq!(
+            apply(&current(), &json!({ "overlay": { "background": "white" } })),
+            Err(Invalid::new("overlay.background", Reason::WrongType))
+        );
+    }
+
     #[test]
     fn rejects_wrong_types() {
         assert_eq!(
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib color 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có `TextColor`, `BackgroundColor`):
```text
error: could not compile `meeting-translator` (lib test) due to 8 previous errors
error[E0432]: unresolved imports `crate::settings::BackgroundColor`, `crate::settings::TextColor`
error[E0609]: no field `background` on type `&OverlaySettings`
error[E0609]: no field `background` on type `OverlaySettings`
error[E0609]: no field `text_color` on type `&OverlaySettings`
error[E0609]: no field `text_color` on type `OverlaySettings`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/settings/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/settings/mod.rs b/src-tauri/src/settings/mod.rs
index 1996abbe66365022d7cbfb5e2f8a90f66c27d422..bacb7578c1482b83cb027aac3ae92b4c5bd7200b 100644
--- a/src-tauri/src/settings/mod.rs
+++ b/src-tauri/src/settings/mod.rs
@@ -76,6 +76,31 @@
     Beta,
 }
 
+/// Màu chữ của phụ đề (§4.3, Cài đặt › Phụ đề), chọn từ bảng màu có sẵn. Mã màu nằm ở giao diện
+/// (`src/lib/subtitleView.ts`).
+#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
+#[serde(rename_all = "camelCase")]
+pub enum TextColor {
+    #[default]
+    White,
+    Yellow,
+    Green,
+    LightBlue,
+    Orange,
+}
+
+/// Màu nền của thanh phụ đề (§4.3); độ trong suốt của nền là `OverlaySettings::opacity`.
+#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
+#[serde(rename_all = "camelCase")]
+pub enum BackgroundColor {
+    #[default]
+    Black,
+    DarkGray,
+    Navy,
+    DarkBrown,
+    DarkPurple,
+}
+
 /// Vị trí và kích thước thanh phụ đề trên một màn hình, tính bằng điểm logic so với góc trên
 /// bên trái vùng làm việc của màn hình đó.
 #[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
@@ -98,6 +123,11 @@
     pub lines: u32,
     /// Độ mờ của nền, 0 là trong suốt hẳn.
     pub opacity: f64,
+    /// Mặc định chữ trắng trên nền đen (§4.3). File cài đặt của bản trước chưa có hai khóa này thì lấy mặc định.
+    #[serde(default)]
+    pub text_color: TextColor,
+    #[serde(default)]
+    pub background: BackgroundColor,
     pub show_source: bool,
     pub locked: bool,
     /// Vị trí đã nhớ theo từng màn hình, khóa là `overlay::placement::screen_key`.
@@ -203,6 +233,8 @@
                 font_size: 22,
                 lines: 2,
                 opacity: 0.6,
+                text_color: TextColor::White,
+                background: BackgroundColor::Black,
                 show_source: false,
                 locked: false,
                 positions: BTreeMap::new(),
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/state.rs b/src-tauri/src/state.rs
index 9cca06d63496f823db073ab0207985b6d78402d6..705be782963aea3eb08c5118e108b780c2ae59c1 100644
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -8,7 +8,7 @@
 
 use crate::hotkeys::HotkeyAction;
 use crate::settings::migrate::FileMeta;
-use crate::settings::{Settings, UiLanguage};
+use crate::settings::{BackgroundColor, Settings, TextColor, UiLanguage};
 
 /// Trạng thái phiên dịch (§4.3: Sẵn sàng, Đang dịch, Lỗi).
 #[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
@@ -70,6 +70,8 @@
     pub font_size: u32,
     pub lines: u32,
     pub opacity: f64,
+    pub text_color: TextColor,
+    pub background: BackgroundColor,
     pub show_source: bool,
     pub locked: bool,
 }
@@ -82,6 +84,8 @@
             font_size: o.font_size,
             lines: o.lines,
             opacity: o.opacity,
+            text_color: o.text_color,
+            background: o.background,
             show_source: o.show_source,
             locked: o.locked,
         }
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib color -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::subtitle_colors_reach_the_overlay_at_once ... ok
test settings::migrate::tests::subtitle_colors_default_to_white_on_black ... ok
test settings::patch::tests::subtitle_colors_come_from_the_palette ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 220 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 221 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs \
  src-tauri/src/settings/migrate.rs \
  src-tauri/src/settings/mod.rs \
  src-tauri/src/settings/patch.rs \
  src-tauri/src/state.rs
git commit -m "feat(app): màu chữ và màu nền của phụ đề trong cài đặt, tới thanh phụ đề ngay khi đổi (§4.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 12: Tắt tiến trình phụ khi rảnh không chen vào lần Bắt đầu

Ghi chú N1 của review cuối 02 (`notes-for-plan02-exec.md` mục 7), Q5 của review 03: 03 nhận ghi chú này (04 làm N2). Kịch bản: `tick` tính "rảnh" (10 phút không dịch), rồi `LiveDeps::prepare` của một lần Bắt đầu thấy tiến trình phụ còn chạy nên chỉ `touch`, rồi `tick` tắt cả hai. Phiên vẫn chạy được (tiến trình phụ chạy lại khi cần), nhưng câu đầu phải chờ nạp model 10–60 giây. QĐ24.

- `SidecarManager::stop_if_idle` (`tick` gọi): kiểm lại "rảnh" dưới khóa của từng tiến trình phụ, ngay trước khi lấy nó ra; không còn rảnh thì giữ. `stop` (thoát app, test) giữ nguyên, dùng chung `stop_each`.
- `LiveDeps::prepare`: `touch` trước rồi mới hỏi `running`, để lần kiểm lại ở trên thấy lần chạm này.
- Test với đồng hồ giả (`tests/lifecycle.rs`): chạm hay `begin_session` sau khi đã rảnh 10 phút thì `stop_if_idle` không tắt; rảnh thật thì vẫn tắt.

**Files:**
- Modify: `crates/pipeline/src/supervisor.rs`
- Modify: `crates/pipeline/tests/lifecycle.rs`
- Modify: `src-tauri/src/session.rs`

- [ ] **Step 1: Viết test trước**

Sửa `crates/pipeline/tests/lifecycle.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/tests/lifecycle.rs b/crates/pipeline/tests/lifecycle.rs
index 0a2d42a36048f5f4ec9236e9450e61cf0f226bcd..5118d8748e3958e852694a3df0ab2bef18f1ae5b 100644
--- a/crates/pipeline/tests/lifecycle.rs
+++ b/crates/pipeline/tests/lifecycle.rs
@@ -370,6 +370,27 @@
     );
 }
 
+/// N1 của review cuối 02 (Q5 của review 03): `tick` đã tính "rảnh", rồi một lần Bắt đầu `touch` hay `begin_session`
+/// trước khi `tick` kịp tắt. Lần tắt kiểm lại dưới khóa của tiến trình phụ, nên phiên mới giữ được tiến trình phụ.
+#[test]
+fn a_start_right_after_the_idle_check_keeps_the_sidecars() {
+    let s = setup("idle-race", true, &[], &[]);
+    s.manager.ensure_started().unwrap();
+    s.clock.advance(Duration::from_secs(10 * 60));
+    // Như `tick` đã thấy rảnh, rồi `prepare` của lần Bắt đầu chạm vào trước khi `tick` tắt.
+    s.manager.touch();
+    assert!(!s.manager.stop_if_idle());
+    assert!(s.manager.running());
+    s.clock.advance(Duration::from_secs(10 * 60));
+    s.manager.begin_session();
+    assert!(!s.manager.stop_if_idle());
+    assert!(s.manager.running());
+    s.manager.end_session();
+    s.clock.advance(Duration::from_secs(10 * 60));
+    assert!(s.manager.stop_if_idle(), "rảnh thật thì vẫn tắt");
+    assert!(!s.manager.running());
+}
+
 #[test]
 fn a_running_session_keeps_the_sidecars() {
     let s = setup("session", true, &[], &[]);
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p pipeline --test lifecycle 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có `stop_if_idle`):
```text
error: could not compile `pipeline` (test "lifecycle") due to 3 previous errors
error[E0599]: no method named `stop_if_idle` found for struct `Arc<SidecarManager>` in the current scope
```

- [ ] **Step 3: Viết code**

Sửa `crates/pipeline/src/supervisor.rs` (áp bằng `git apply`):

```diff
diff --git a/crates/pipeline/src/supervisor.rs b/crates/pipeline/src/supervisor.rs
index 64704b6c1ceb18f72b26db0fc070f74190f13019..bf1986d347f7f6be422ec4a8562a7c70a989966f 100644
--- a/crates/pipeline/src/supervisor.rs
+++ b/crates/pipeline/src/supervisor.rs
@@ -530,18 +530,26 @@
         a.last_active_ms = self.clock.now_ms();
     }
 
+    /// Không có phiên nào và rảnh quá `idle_shutdown_ms`.
+    fn idle(&self) -> bool {
+        let a = lock(&self.activity);
+        a.sessions == 0 && self.clock.now_ms().saturating_sub(a.last_active_ms) >= self.spec.supervisor.idle_shutdown_ms
+    }
+
     /// Gọi định kỳ. Không có phiên nào và rảnh quá `idle_shutdown_ms` thì tắt cả hai; trả `true` nếu vừa tắt.
     pub fn tick(&self) -> bool {
-        let idle = {
-            let a = lock(&self.activity);
-            a.sessions == 0
-                && self.clock.now_ms().saturating_sub(a.last_active_ms) >= self.spec.supervisor.idle_shutdown_ms
-        };
-        if !idle || !self.running() || self.closing() {
+        if !self.idle() || !self.running() || self.closing() {
             return false;
         }
-        self.stop(true);
-        true
+        self.stop_if_idle()
+    }
+
+    /// Tắt cả hai vì rảnh, nhưng kiểm lại "rảnh" dưới khóa của từng tiến trình phụ, ngay trước khi lấy nó ra. `tick` tính
+    /// "rảnh" rồi mới tới đây: trong lúc đó một lần Bắt đầu có thể đã `touch` (chuẩn bị tiến trình phụ cho phiên) hay
+    /// `begin_session`, và phiên mới không được mất tiến trình phụ vừa giữ (N1 của review cuối 02, Q5 của review 03).
+    /// Trả `true` nếu đã tắt ít nhất một tiến trình.
+    pub fn stop_if_idle(&self) -> bool {
+        self.stop_each(true, true)
     }
 
     /// Có tiến trình phụ nào đang chạy không. Không chờ khóa nào.
@@ -581,9 +589,18 @@
         if !idle {
             self.shutdown();
         }
+        self.stop_each(idle, false);
+    }
+
+    /// Lấy từng tiến trình phụ ra khỏi slot rồi tắt. `recheck`: dưới khóa của slot, không còn rảnh thì thôi (giữ tiến
+    /// trình đó và tiến trình sau). Trả `true` nếu đã tắt ít nhất một tiến trình.
+    fn stop_each(&self, idle: bool, recheck: bool) -> bool {
         // Bỏ `killers` cùng lúc lấy tiến trình ra khỏi slot (dưới khóa của slot), để không lần chạy mới nào xen vào giữa.
         let server = {
             let mut slot = lock(&self.llama);
+            if recheck && !self.idle() {
+                return false;
+            }
             let server = slot.server.take();
             if server.is_some() {
                 self.llama_running.store(false, Ordering::SeqCst);
@@ -591,6 +608,7 @@
             }
             server
         };
+        let stopped_llama = server.is_some();
         if let Some(server) = server {
             drop(server);
             self.emit(SidecarEvent::Stopped {
@@ -600,6 +618,9 @@
         }
         let worker = {
             let mut slot = lock(&self.asr);
+            if recheck && !self.idle() {
+                return stopped_llama;
+            }
             let worker = slot.worker.take();
             if worker.is_some() {
                 self.asr_running.store(false, Ordering::SeqCst);
@@ -607,6 +628,7 @@
             }
             worker
         };
+        let stopped_asr = worker.is_some();
         if let Some(worker) = worker {
             drop(worker);
             self.emit(SidecarEvent::Stopped {
@@ -614,6 +636,7 @@
                 idle,
             });
         }
+        stopped_llama || stopped_asr
     }
 
     /// Thiết bị thật của `asr-worker` lần chạy gần nhất. Không chờ khóa của tiến trình phụ.
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index f4725b270ef9bbbd0d4b2a0fcc5a77d66bc7d04b..253e10e4490031252d65c8129620ff4ce7dc7eef 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -732,9 +732,13 @@
                 .filter(|l| l.tier == settings.model_tier)
                 .map(|l| l.manager.clone())
         };
-        if let Some(manager) = running.filter(|m| m.running()) {
+        // Chạm trước rồi mới hỏi còn chạy không: lần tắt khi rảnh (`SidecarManager::stop_if_idle`) kiểm lại "rảnh" dưới khóa
+        // của tiến trình phụ, nên nó không tắt sau lần chạm này (Q5 của review 03).
+        if let Some(manager) = running {
             manager.touch();
-            return Ok(());
+            if manager.running() {
+                return Ok(());
+            }
         }
         // Kiểm SHA-256 lúc chuẩn bị; giám sát còn kiểm lại trước mỗi lần chạy tiến trình phụ (`before_spawn`).
         let prepared = sidecar::prepare(&self.app, settings)?;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p pipeline --test lifecycle sidecars -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test a_running_session_keeps_the_sidecars ... ok
test a_start_right_after_the_idle_check_keeps_the_sidecars ... ok
test both_sidecars_stop_after_10_minutes_without_translating ... ok
test without_a_gpu_both_sidecars_run_on_the_cpu ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 37 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 221 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

- [ ] **Step 6: Commit**

```bash
git add crates/pipeline/src/supervisor.rs \
  crates/pipeline/tests/lifecycle.rs \
  src-tauri/src/session.rs
git commit -m "fix(pipeline): tắt tiến trình phụ khi rảnh kiểm lại dưới khóa, không chen vào lần Bắt đầu (N1 của review cuối 02)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 13: Kiểm tra chuẩn sau 03a

Kiểm cả workspace trước khi sang 03b. Không có commit. Đủ khối lệnh của mục 6.2 của kế hoạch 00 chạy ở 03b Task 7.

- [ ] **Step 1: Định dạng, clippy, test của cả workspace**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch; trên `main` `5925d42` là 500 qua, 11 bỏ qua; 03a thêm 76 test, và `real_terms` bỏ qua):
```text
passed 576 failed 0 ignored 12
```

- [ ] **Step 2: `cargo deny`, `cargo audit`, giao diện, kiểm code Windows**

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
cargo audit 2>&1 | grep -E '^(error|warning):' | grep -v 'is locked'
```
Expected (lúc lập kế hoạch; ba cảnh báo cũ đã được cho phép, như trước 03; dòng `… is locked` chỉ hiện khi tiến trình khác đang dùng advisory-db nên bị lọc, N9 của review 03):
```text
warning: 3 allowed warnings found
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) ' && pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch; trên `main` `5925d42` là 65 test trong 6 file; Task 1 và 2 của 03a thêm 2 test vitest):
```text
 Test Files  6 passed (6)
      Tests  67 passed (67)
build ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```
