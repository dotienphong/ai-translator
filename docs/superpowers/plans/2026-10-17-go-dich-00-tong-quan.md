# Gõ dịch 00: tổng quan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng bấm ⌃⌥G (Ctrl+Alt+G) ở ô chat của app bất kỳ, gõ tin nhắn bằng tiếng của mình vào một ô soạn nổi, thấy bản dịch hiện dần; Enter lần 1 thì app dán bản dịch vào ô chat cũ, Enter lần 2 (của app chat) thì gửi.

**Architecture:** Cửa sổ WebView thứ ba `compose` (NSPanel không kích hoạt app trên macOS, cửa sổ topmost trên Windows) với trang React riêng. Phía Rust có module `src-tauri/src/compose/`: luật ngôn ngữ đích, nhận diện chữ viết, luồng dịch dùng lại `pipeline::translate::translate`, việc dán qua trait `Native` (bản thật cho từng hệ điều hành, bản giả cho test). Tiến trình phụ được chuẩn bị đúng thứ tự VRAM như khi mở cửa sổ chính, qua `session::with_compose_mt`.

**Tech Stack:** Rust 2024 (`rust-version = 1.98`), Tauri 2.12, `tauri-nspanel` 2.1, `objc2-app-kit` / `objc2-core-graphics` 0.3.2 (đã có trong đồ thị), `windows` 0.62 (thêm feature), React 19, Zustand 5, Vitest 5.

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md`. Đọc spec trước khi làm.

---

## Các kế hoạch và thứ tự

| # | File | Làm gì | Cần trước |
|---|---|---|---|
| 01 | `2026-10-17-go-dich-01-loi.md` | Nhóm cài đặt `compose`, ngôn ngữ đích tự động, nhận diện chữ viết, luật bản quyền của Gõ dịch, ba mã lỗi mới, kiểu `Settings` phía giao diện | — |
| 02 | `2026-10-17-go-dich-02-luong-dich-ipc.md` | Luồng dịch, `session::with_compose_mt`, trạng thái `Compose`, trait `Native`, tám lệnh `compose_*`, sự kiện `compose://*`, quyền của cửa sổ `compose`, test cấp app | 01 |
| 03 | `2026-10-17-go-dich-03-cua-so-phim-tat-dan-spike.md` | Phím tắt ⌃⌥G (cài đặt, migrate `v2→v3`, đăng ký, bật/tắt), cửa sổ thật và việc dán trên macOS/Windows, trang React của ô soạn, **spike S1–S3** | 02 |
| 04 | `2026-10-17-go-dich-04-cai-dat-xem-truoc.md` | Nhóm Cài đặt "Gõ dịch" (cửa sổ chính), hai lệnh quyền Trợ năng, trang xem trước và kiểm năm ngôn ngữ | 03 (đã qua cổng spike) |
| 05 | `2026-10-17-go-dich-05-nghiem-thu-tai-lieu.md` | Nghiệm thu GD1–GD6 trên Mac, biên bản, sửa spec gốc | 04 |

**Cổng:** kế hoạch 03 kết thúc bằng spike S1–S3 trên Mac (spec §7). S1 hay S2 không đạt thì **dừng**, báo chủ dự án và xem lại thiết kế (kế hoạch 03 có mục "Nếu spike không đạt"); không làm 04, 05.

## Quy tắc chung cho mọi kế hoạch

- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich`, nhánh **`go-dich`**. **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich &&`**: shell reset thư mục sau mỗi lệnh. Trước mỗi commit chạy `git branch --show-current` (phải ra `go-dich`).
- **Không merge, không push, không phát hành, không deploy.** Chủ dự án quyết các việc đó sau nghiệm thu.
- Mã Rust phải qua `cargo fmt --all -- --check` (`rustfmt.toml`: edition 2024, `max_width = 120`), `cargo clippy --locked --workspace --all-targets -- -D warnings`, và `sh scripts/check-windows.sh --locked` (clippy cho Windows ngay trên Mac). Mã giao diện phải qua `pnpm build` (`tsc --noEmit` rồi `vite build`) và `pnpm test`. Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- **Mã trong các kế hoạch đã chạy thật** trên nhánh nháp `go-dich-proto` (cùng worktree; commit `5711936` = kế hoạch 01, `2fddb55` = 02, `91802a6` = 03, `9da931b` = 04): đủ test, rustfmt, clippy Mac và Windows, `pnpm build`, `pnpm test`, `check-i18n.mjs` cho các cảnh Gõ dịch. Chép nguyên văn, đừng "dọn" lại. Gặp chỗ khác thì đối chiếu `git show <commit>:<đường dẫn>`. Nhánh nháp chỉ để đối chiếu: không merge, không cherry-pick; xóa khi chủ dự án cho phép.
- **Các kế hoạch 01–04 đã được kiểm bằng máy** (2026-10-17): áp đúng các bước "tìm … thay bằng …", "Tạo", "thêm ngay sau" của kế hoạch lên commit gốc thì ra từng byte trùng commit nháp (trừ một test kế hoạch 02 thêm sau bản nháp, `every_request_prepares_the_sidecars_first`, cho mục "`touch()`" của spec §8.1; test này cũng đã chạy thật); trạng thái sau mỗi task đều biên dịch được, mọi test xanh, số test khớp mốc ghi trong task (riêng sau Task 4 của kế hoạch 03, bản Windows chỉ biên dịch được từ Task 5). Một đoạn "tìm" không thấy hay thấy hai lần nghĩa là mã đã lệch khỏi kế hoạch: dừng và đối chiếu, đừng đoán.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không thêm biến môi trường ghi đè URL hay môi trường staging (CLAUDE.md). Gõ dịch không gọi mạng (spec §6).
- Chữ người dùng gõ và bản dịch **không bao giờ** được ghi vào log, file, báo cáo lỗi (spec §6). Log của Gõ dịch chỉ có số liệu.

## Mốc số test

Đo ngày 2026-10-17 trên worktree `go-dich` (commit `16cea32`, chỉ có spec):

| Sau | `cargo test --locked -p meeting-translator --lib` | `pnpm test` |
|---|---|---|
| Mốc (N0, T0) | 643 passed, 4 ignored | 297 |
| Kế hoạch 01 | N0 + 16 | T0 |
| Kế hoạch 02 | N0 + 36 | T0 |
| Kế hoạch 03 | N0 + 45 | T0 + 21 |
| Kế hoạch 04 | N0 + 46 | T0 + 24 |

Một test của kế hoạch 02 (`without_permission_the_translation_is_only_copied`) chỉ chạy trên macOS; trên Windows số của 02, 03, 04 ít hơn 1.

## Hợp đồng giữa các kế hoạch (đừng đổi khi chưa sửa mọi kế hoạch dùng nó)

| Điều | Giá trị | Có từ |
|---|---|---|
| Cài đặt | nhóm `compose`: `{ "enabled": bool, "target": "auto"\|"en"\|"zh"\|"ja"\|"ko"\|"vi", "autoPaste": bool }`, mặc định `{ true, "auto", true }`; sửa qua `update_settings` từng khóa con | 01 |
| Phím tắt | `hotkeys.compose`, mặc định `"Ctrl+Alt+G"` (`settings::COMPOSE_HOTKEY`); `HotkeyAction::Compose` (`"compose"`); schema cài đặt lên bản 3 | 03 |
| Mã lỗi | `composeTooLong`, `composeFailed`, `composeUnavailable` (01), `copyFailed` (02); đều thuộc `diagnostics::SKIPPED_CODES` | 01, 02 |
| Lệnh cửa sổ `compose` | `get_compose_view() → ComposeView`; `compose_translate({text}) → u64`; `compose_submit({id}) → "pasted"\|"copied"\|"needsPermission"`; `compose_close()`; `compose_resize({height})`; `compose_open_accessibility()`; `compose_copy_only()`; `compose_open_main({screen: "models"\|"upgrade"\|"license"\|"home"})` | 02 |
| Lệnh cửa sổ `main` | `get_accessibility_trusted() → bool`; `open_accessibility_settings()` | 04 |
| Sự kiện (chỉ tới `compose`) | `compose://open` (`ComposeView`), `compose://loading` (`{id}`), `compose://delta` (`{id, line, text, reset}`), `compose://done` (`{id, outcome}` với `outcome` là `{kind:"translated",text}` \| `{kind:"sameLanguage"}` \| `{kind:"failed",code}`) | 02 |
| `ComposeView` | `{ uiLanguage, theme, target, autoPaste, blocked: string\|null, platform: "macos"\|"windows" }` | 02 |
| Trait `compose::Native` | `show`, `hide`, `visible`, `set_height`, `trusted`, `request_trust`, `set_clipboard`, `paste` (bản giả `test_support::FakeNative` ghi `show`, `hide`, `height N`, `request_trust`, `clipboard <chữ>`, `paste`) | 02 |
| Nhóm Cài đặt | `SettingsGroup` thêm `"compose"`, đứng sau `"subtitles"` | 04 |

## Quyết định chung (spec không nêu; chọn thay chủ dự án, có lý do)

1. **Nhận diện tiếng Việt không cần chuẩn hóa NFD.** Spec §2.2 nói xét dấu hỏi U+0309 và dấu nặng U+0323 "sau khi chuẩn hóa NFD". Kế hoạch xét thẳng khối U+1EA0–U+1EF9 (ở đoạn này khối Latin Extended Additional chỉ có chữ tiếng Việt, gồm mọi chữ mang dấu hỏi, dấu nặng) cộng ba dấu rời U+0309, U+0323, U+031B. Kết quả tương đương mà không thêm crate `unicode-normalization` vào `src-tauri`.
2. **Mở ô soạn chạy sẵn tiến trình phụ (`session::prewarm`), và mỗi lần dịch đều qua `session::with_compose_mt`**, vì client dịch (`SupervisedMt`) tự chạy `llama-server` một mình khi nó đang tắt. Nếu không chuẩn bị trước, sau 10 phút rảnh lần dịch kế sẽ chạy `llama-server` trước `asr-worker`, sai thứ tự VRAM của §5. `release_models` chờ cả việc của Gõ dịch. `prepare` của bản thật gọi `SidecarManager::touch()`, nên mỗi lần dịch tính lại 10 phút rảnh từ đầu (spec §3.4).
3. **Không chạy sẵn tiến trình phụ khi bản quyền đang chặn**: `ComposeView.blocked` cho ô soạn hiện hộp lỗi ngay lúc mở.
4. **Phím dự phòng khi người dùng đã tự đặt Ctrl+Alt+G cho việc khác**, theo thứ tự: `Ctrl+Alt+Shift+G`, `Ctrl+Alt+Y`, `Ctrl+Alt+J` (bước migrate `v2→v3`). Nếu không có bước này, mặc định mới trùng phím của người dùng, và việc ghép cả nhóm phím tắt có thể kéo phím của họ về mặc định.
5. **Đặt ô soạn bằng AppKit trên macOS** (`NSEvent::mouseLocation`, `NSScreen`, tính bằng điểm), **bằng API của Tauri trên Windows** (vị trí con trỏ và khung màn hình cùng là pixel của desktop). Lý do: trên macOS, tao đổi vị trí con trỏ ra pixel theo tỉ lệ của màn hình chính, còn khung màn hình theo tỉ lệ của từng màn hình, nên dễ lệch khi hai màn hình khác tỉ lệ (`overlay/mod.rs` đã ghi chú việc này).
6. **⌘V theo đúng phím ra chữ "v" của bố cục bàn phím đang dùng** (TIS + `UCKeyTranslate`, gọi trên luồng chính vì các hàm TIS dừng app khi bị gọi từ luồng khác), không tìm được thì `kVK_ANSI_V` (spec §4.2). Chờ 120 ms sau khi ẩn ô soạn rồi mới gửi phím; spike S2 chốt con số.
7. **Hai lệnh mới của cửa sổ chính** (`get_accessibility_trusted`, `open_accessibility_settings`) cho mục trạng thái quyền Trợ năng ở Cài đặt › Gõ dịch (spec §1.4). Lệnh `compose_open_accessibility` của ô soạn làm cùng việc nhưng chỉ cửa sổ `compose` gọi được.
8. **Mã lỗi Rust `copyFailed`** khi không ghi được clipboard: dùng lại câu `error.copyFailed` sẵn có của giao diện.
9. **Cửa sổ ô soạn tạo bằng `PanelBuilder` / `WebviewWindowBuilder` trong code**, như thanh phụ đề, tiêu đề cửa sổ là tên app (không hiện ra vì không có viền).
10. **Bản dịch ja/zh/ko của chuỗi mới** không có người bản ngữ duyệt, như spec 2026-10-12.
11. **Một trait `compose::Native` thay cho `Paster` của spec §3.2.** Việc cửa sổ (hiện, ẩn, đổi chiều cao) và việc dán (clipboard, quyền, gửi phím) cùng cần đúng cửa sổ của từng hệ điều hành, nên gộp làm một trait khai trong `compose/mod.rs`; bản thật ở `native_macos.rs`, `native_windows.rs`, bản giả là `test_support::FakeNative`. Kế hoạch 05 sửa bảng §3.2 của spec cho khớp.
12. **Trang ô soạn ở `src/windows/compose/`** (spec §3.2 ghi `src/compose/`), cạnh `src/windows/main/`, `src/windows/overlay/` của hai cửa sổ kia; store ở `src/store/compose.ts`, phần thuần ở `src/lib/compose.ts`.
13. **Cách đo của nghiệm thu** (kế hoạch 05): GD2 đọc dòng `Gõ dịch: … ms` của log (đo từ lúc luồng dịch nhận yêu cầu); GD3 so dòng tóm tắt `kết thúc phiên dịch: … tổng p50 …` (cùng số đo với A2) của hai phiên 5 phút cùng nguồn tiếng; GD5 lấy cửa sổ của phiên có Gõ dịch, vì `netaudit.py` của A7 đối chiếu mốc với dòng bắt đầu, kết thúc phiên trong log.

## Đối chiếu spec → kế hoạch

| Spec | Ở đâu |
|---|---|
| §0 phím tắt ⌃⌥G | 03 Task 1–3 |
| §1.1, §1.2, §1.3 trải nghiệm, ô soạn, phím | 02 (Rust), 03 Task 6–8 (trang ô soạn) |
| §1.4 Cài đặt | 01 Task 1, Task 6 (khóa, kiểu phía giao diện), 03 Task 3 (bật/tắt phím), 04 Task 1–4 (nhóm Cài đặt) |
| §1.5 bản quyền | 01 Task 4 |
| §2.1, §2.2 ngôn ngữ | 01 Task 2–3; 04 Task 2 (bản TypeScript của §2.1) |
| §3.1 cửa sổ | 03 Task 4–5 |
| §3.2–§3.4 mô-đun, dịch, tiến trình phụ | 02 Task 1, 3, 4 |
| §3.5 cài đặt và phím tắt | 01 Task 1, 03 Task 1–3 |
| §3.6 lệnh và phân quyền | 02 Task 5–6; 04 Task 1 |
| §3.7 phiên bản thư viện | 03 Task 4 |
| §4 dán | 02 Task 2 (trang Trợ năng), Task 4 (luồng), 03 Task 4–5 (bản thật), 03 Task 9 (spike S2, S3) |
| §5 lỗi | 01 Task 5, 02 Task 2 và 4, 03 Task 6 và 8 (hộp lỗi) |
| §6 quyền riêng tư | 02 Task 7 (test log), 05 Task 4 (GD5, GD6), mọi kế hoạch |
| §7 spike | 03 Task 9 |
| §8.1 test tự động | mọi kế hoạch; ảnh chụp giao diện: 04 Task 5 |
| §8.2 nghiệm thu | 05 Task 1–4 |
| §10 spec gốc, website, phát hành | 05 Task 5 (spec gốc); website, chính sách, phát hành chờ chủ dự án (05 Task 6 nêu lại) |
