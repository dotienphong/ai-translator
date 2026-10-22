# Chat hỗ trợ 03: app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Màn hình "Hỗ trợ" trong app, giữa "Nâng cấp Pro" và "Giới thiệu": khách chat với chủ dự án qua `/v1/support/*` của license server (kể cả Free và chưa có license); phía Rust giữ cuộc chat trong `support.json`, tự hỏi tin mới theo đúng nhịp của spec và báo giao diện bằng sự kiện; chấm đỏ ở mục Hỗ trợ khi có câu trả lời mới; ô "Gửi kèm thông tin máy", "Đính kèm log", thẻ email, menu ⋯ xóa; năm ngôn ngữ giao diện.

**Architecture:** Module Rust mới `src-tauri/src/support/`: client HTTP `api.rs` (`reqwest` blocking có sẵn, theo mẫu `diagnostics/send.rs`: không theo redirect, lỗi không kèm URL, cùng `PRODUCTION_URL`; trait `SupportApi` để test thay server giả), `store.rs` (`support.json`), `cadence.rs` (luật nhịp hỏi, hàm thuần), `chat.rs` (lõi `Chat` không phụ thuộc Tauri, trait `Host` cho giờ, trạng thái dịch, cửa sổ chính và sự kiện), `context.rs` (dòng thông tin máy), và `mod.rs` ghép với app (trạng thái `Arc<Chat>`, luồng hỏi nền, sự kiện `support://view`, việc của 6 lệnh IPC). **Rust điều khiển nhịp:** luồng nền gọi `Chat::tick()` (hỏi server nếu tới hạn, trả thời gian ngủ) rồi `Chat::wait()` (ngủ trên `Condvar`, lệnh của giao diện đánh thức); giao diện chỉ báo màn hình mở hay đóng (`support_screen`) và nhận `SupportView`. Giao diện: store zustand `src/store/support.ts`, khung chat thuần props `SupportChat.tsx` (test bằng `react-dom/server`), `SupportScreen.tsx` nối store, chấm đỏ ở `Shell.tsx`; DOM thật kiểm bằng `scripts/ui-preview/check-i18n.mjs` trên trang xem trước có IPC giả.

**Tech Stack:** Rust 2024 (toolchain 1.98.1), Tauri 2.12, `reqwest` 0.13 blocking, `serde`, `thiserror` (đều có sẵn); React 19.3, TypeScript 7 strict, zustand 5, vitest 5, Vite 8 (trang xem trước), Chrome không đầu qua `website/tools/browser/cdp.mjs`. **Không thêm crate hay gói npm nào** (CLAUDE.md, spec gốc §6.12).

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` (mục 4; câu A7 mới ở mục 5; phần app của mục 6). **Hợp đồng:** `2026-10-22-chat-ho-tro-00-tong-quan.md`

---

## Quy tắc chung cho mọi task

- Làm **thẳng trên nhánh `main`** trong `/Users/dtphong/Desktop/software_business/ai-translator`, không worktree. **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`** (shell reset thư mục sau mỗi lệnh). Trước mỗi commit chạy `git branch --show-current` (phải ra `main`). Thư mục có thể có phiên khác cùng làm (lúc viết kế hoạch: spec chat hỗ trợ đang sửa dở, các kế hoạch 00, 01, 04 chưa commit): **chỉ `git add` đúng các file của task**, không `git add -A`.
- **Không push, không deploy, không phát hành, không đặt secret.** Không đụng chính sách quyền riêng tư, spec gốc hay website (kế hoạch 04), không đụng `server/` (kế hoạch 01).
- **Không gọi server thật trong test.** Client HTTP test bằng server TCP giả trong máy (như `diagnostics/send.rs`); lõi và lệnh test bằng `test_support::FakeSupportApi`. App giả (`mock_app`) không cài chat thật (`support::install` chỉ chạy trong `setup` của app thật).
- Mã trong kế hoạch **đã chạy thật** trên một bản sao của repo (commit `01c2077a`): `cargo test` 798 test, `cargo fmt --check`, `cargo clippy -D warnings`, `scripts/check-windows.sh`, `tsc`, vitest 359 test, `vite build`, `check-i18n.mjs` đủ năm ngôn ngữ. Chép nguyên văn; đoạn "tìm … thay bằng …" khớp đúng file hiện tại (đã kiểm bằng máy).
- Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên. Mọi chuỗi giao diện qua `t(...)`, đủ năm từ điển `src/i18n/{en,vi,ja,zh,ko}.ts`.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kiểm tra cuối mỗi nhóm task (Task 8 cho phần Rust, Task 14 cho cả kế hoạch): `cargo fmt --all -- --check`, `cargo clippy --locked --workspace --all-targets -- -D warnings`, `sh scripts/check-windows.sh --locked`, `pnpm build`, `pnpm test`.

## Hợp đồng IPC của kế hoạch này (Rust ⇄ giao diện)

Hợp đồng API với server và hợp đồng phía khách nằm ở kế hoạch 00; bảng dưới chỉ là phần giữa lõi Rust và giao diện của app.

| Lệnh (chỉ cửa sổ `main`) | Tham số | Kết quả | Gọi mạng |
|---|---|---|---|
| `support_screen` | `{ open: boolean }` | `SupportView` | không. Màn hình Hỗ trợ mở hay đóng; lúc mở cửa sổ gọi với `false` để có chấm đỏ |
| `support_fetch` | — | `SupportView` | `GET /v1/support/messages?after=0` khi đã có cuộc chat; chưa có thì không gọi mạng |
| `support_send` | `{ text: string, withMachineInfo: boolean }` | `SupportView` | `POST /v1/support/messages` (không token: cuộc mới, kèm `lang`, `source`, `context` nếu tích) |
| `support_set_email` | `{ email: string \| null }` | `null` | `PUT /v1/support/email` |
| `support_delete` | — | `SupportView` | `DELETE /v1/support/conversation` (chưa có cuộc chat thì không) |
| `support_machine_info` | — | `string` | không. Dòng thông tin máy, hiện nguyên văn cạnh ô tích |

Sự kiện `support://view` (chỉ tới cửa sổ chính): `SupportView` mới sau lần hỏi nền (tin mới, chấm đỏ, chat tắt hay bị chặn, cuộc chat không còn), và sau lỗi của lệnh làm đổi trạng thái.

```ts
interface SupportMessage { id: number; sender: "customer" | "owner"; text: string; createdAt: number }
interface SupportView { enabled: boolean; closed: boolean; hasConversation: boolean; messages: SupportMessage[]; unread: boolean; rev: number }
```

Mã lỗi giao diện (`CommandError.code`, câu ở `error.<mã>`): `supportOffline` (mạng, `5xx`, `404` khi server chưa có chat), `supportRateLimited` (`429 rate_limited`), `supportBusy` (`429 support_busy`), `supportDisabled` (`503`), `supportClosed` (`403`), `supportExpired` (`401`: cuộc chat không còn), `supportInvalid` (`400`/`413`/`415` hay app tự kiểm trước; `field` là `text` hay `email`).

## Quyết định của kế hoạch này (spec và hợp đồng không nêu; chọn thay chủ dự án, nêu lý do)

1. **Thiết kế nhịp hỏi.** Luồng nền riêng gọi `Chat::tick()` rồi `Chat::wait(…)`. `tick` đọc trạng thái lúc đó (có cuộc chat, màn hình mở, cửa sổ chính hiện, đang dịch, `waitingSince`, lần cuối có tin mới) và hỏi `cadence::next`, một hàm thuần trả `Poll(giây)`, `Recheck(giây)` (không gọi mạng, chỉ xét lại: cửa sổ có thể hiện lại, phiên dịch có thể dừng) hay `Idle` (ngủ tới khi bị đánh thức). Lệnh `support_screen`, `support_send`, `support_delete` đánh thức luồng (`Condvar`). Nhờ vậy luật nhịp test được bằng đồng hồ giả, từng giây một, không cần chờ thật.
2. **Sáu lệnh: bỏ `support_status`, thêm `support_screen`.** Spec kể `support_status`, `support_fetch`, `support_send`, `support_set_email`, `support_delete` và lệnh dòng thông tin máy. App không gọi `GET /v1/support/status` (quyết định 5), nên không có lệnh `support_status`. Rust không tự biết màn hình nào đang mở, nên thêm `support_screen`: giao diện báo khi `SupportScreen` mở và đóng (mount/unmount); lệnh này không gọi mạng.
3. **"Cửa sổ đang hiện" do Rust kiểm:** cửa sổ chính `is_visible() && !is_minimized()` mỗi nhịp, không dựa `visibilitychange` của webview (WKWebView và WebView2 không chắc báo khi cửa sổ ẩn xuống khay). Màn hình mở mà cửa sổ ẩn thì như màn hình đóng; cửa sổ hiện lại đúng màn hình Hỗ trợ thì tự bỏ chấm đỏ.
4. **Lần hỏi đầu của nhịp "đang chờ trả lời"** là 60 giây sau khi mở app (hợp đồng phía app: "60 giây"; chỉ website "hỏi một lần khi tải trang"). Lúc mở app không có kết nối nào.
5. **Chưa từng nhắn thì không có kết nối nào cho chat, kể cả khi mở màn hình Hỗ trợ** (kế hoạch 04 cam kết "chưa từng nhắn thì app không kết nối gì cho chat"). Chưa có cuộc chat (không có `support.json`): mở màn hình không gọi mạng, `enabled` coi như chưa biết (`true`) nên hiện lời chào và ô nhập. Tin đầu nhận `503 support_disabled` thì tin đó hiện lỗi và màn hình chuyển sang dòng "Chat đang tạm tắt…" (lõi đặt `enabled = false` và báo qua sự kiện); không có token nên không lưu gì. Lần mở màn hình sau lại hiện ô nhập (vẫn không gọi mạng) để gửi lại. Đã có cuộc chat thì `enabled` lấy từ thân `GET messages` như hợp đồng. App không dùng `GET /v1/support/status` (website vẫn dùng). Test khóa: `opening_the_screen_without_a_conversation_makes_no_request` (Task 7), `without_a_conversation_nothing_connects_even_with_the_screen_open` và `a_first_message_into_a_disabled_chat_…` (Task 6), vitest "mở màn hình khi chưa có cuộc chat…" (Task 9), cảnh `support` và `support-send-disabled` của `check-i18n` (Task 13).
6. **`support.json` thêm khóa `unread`** cạnh `{ token, lastId, waitingSince }` của hợp đồng, để chấm đỏ còn sau khi mở lại app. File chỉ app đọc; không đổi hợp đồng API. Không có cuộc chat thì không có file.
7. **`lastId` chỉ tăng theo tin nhận qua lần hỏi, không theo tin vừa gửi:** `id` tăng trong toàn hệ thống, nhảy con trỏ tới tin vừa gửi sẽ bỏ sót câu trả lời có `id` nhỏ hơn tới giữa lần hỏi trước và lúc gửi. Lần hỏi sau trả lại chính tin vừa gửi; lõi gộp theo `id`. Hỏi mà không có gì mới thì không ghi file, không phát sự kiện.
8. **`401` khi gửi:** bỏ cuộc chat (xóa `support.json`), báo giao diện bằng sự kiện, trả lỗi `supportExpired`; tin ở lại với "Không gửi được, thử lại"; bấm thử lại là tin đầu của cuộc mới (ô thông tin máy hiện lại). Không tự gửi lại ngầm.
9. **Dòng thông tin máy dựng trong Rust:** `support_send` nhận `withMachineInfo: boolean`, không nhận chữ thông tin máy từ giao diện, nên nội dung chỉ có thể từ `MachineFacts` (kiểu này không có chỗ cho key, email, mã máy, tên máy, tên người dùng). Định dạng: `AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi`. Windows: `Windows 11 (26100)` (bản dựng từ 22000 là Windows 11), `GPU <tên>` theo lần dò GPU lúc mở app. Tên gói model theo ngôn ngữ giao diện (tiếng Việt: tên `vi` của manifest, ngôn ngữ khác: tên `en`, như `localized` của giao diện); manifest không có gói thì mã gói. Có thêm `UI <mã>` vì spec §4 liệt kê "ngôn ngữ giao diện" (ví dụ ở §2.3 không có).
10. **Tin của "Đính kèm log" theo ngôn ngữ giao diện** (`support.logMessage`, ví dụ vi "📎 Mã báo cáo log: R-7F3K-92QD", en "📎 Log report code: …"); spec chỉ ghi câu tiếng Việt. Lệnh dùng đúng `send_log_report` có sẵn (lỗi `reportFailed`, `reportRateLimited`, `reportRejected` hiện dưới nút).
11. **Thẻ email chỉ sống trong store của lần chạy này:** hiện sau tin đầu tiên gửi thành công của một cuộc chat, tới khi lưu hay đóng thẻ; mở lại app thì không hiện lại (server không trả email). Email không lưu trên máy.
12. **Bảy mã lỗi mới đều thuộc `SKIPPED_CODES`** (không gửi báo cáo lỗi; test `every_error_code_is_classified_exactly_once` buộc phân loại). `error.supportDisabled` và `error.supportClosed` cũng là dòng thay ô nhập (chữ tiếng Việt đúng hợp đồng).
13. **Sau `429` khi hỏi tin:** chờ `Retry-After`, tối thiểu 15 giây (client nâng lên), tối đa 3600 giây (lệnh của giao diện vẫn đánh thức sớm được). Lỗi mạng giãn 3 → 15 → 60 giây; luôn lấy số lớn hơn giữa nhịp hiện tại và thời gian chờ.
14. **"Xóa toàn bộ dữ liệu" (Cài đặt › Quyền riêng tư) không xóa `support.json`;** cuộc chat xóa bằng menu ⋯ (xóa cả trên server). Spec không nói.
15. **Không hiện giờ của từng tin** (spec không đòi). Đếm ký tự hiện từ 900 ký tự.
16. **Trang xem trước** thêm tham số `chat=`, `support=`, `send=`, `email=`. Không thêm cảnh vào `shoot.mjs` (ảnh đó là của website; kế hoạch 04 quyết có cần ảnh màn hình Hỗ trợ không).

## Cấu trúc file

| File | Việc |
|---|---|
| Create `src-tauri/src/support/mod.rs` | Phần ghép với app: `AppHost`, `install`, luồng hỏi nền, việc của 6 lệnh, đọc máy thật cho dòng thông tin máy; test với app giả |
| Create `src-tauri/src/support/store.rs` | `support.json`: `Saved`, `Store`, `token_ok` |
| Create `src-tauri/src/support/cadence.rs` | Luật nhịp hỏi (hàm thuần `next`, `network_backoff`) |
| Create `src-tauri/src/support/api.rs` | Client HTTP: `SupportApi`, `HttpSupportApi`, `ApiError`, `SupportMessage` |
| Create `src-tauri/src/support/context.rs` | `MachineFacts`, `line`, `os_label`, `gpu_names` |
| Create `src-tauri/src/support/chat.rs` | Lõi `Chat`, `SupportView`, `Host`, `clean_text`, `clean_email` |
| Modify `src-tauri/src/lib.rs` | `pub mod support;`, `support::install` trong `setup` |
| Modify `src-tauri/src/errors.rs`, `src-tauri/src/diagnostics/mod.rs` | 7 mã lỗi; xếp vào `SKIPPED_CODES` |
| Modify `src-tauri/src/events.rs` | Sự kiện `support://view` |
| Modify `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/src/acl_tests.rs` | 6 lệnh, ACL, test ACL |
| Modify `src-tauri/src/test_support.rs` | `FakeSupportApi`, `install_support` |
| Modify `src/lib/ipc.ts` | Kiểu, lệnh, sự kiện; `Screen` thêm `"support"` |
| Create `src/store/support.ts`, `src/store/support.test.ts` | Store của màn hình Hỗ trợ, 13 test |
| Modify `src/i18n/{en,vi,ja,zh,ko}.ts` | 7 câu lỗi, 28 khóa giao diện |
| Modify `src/components/Icon.tsx` | Biểu tượng `support`, `send`, `more`, `paperclip` |
| Create `src/windows/main/screens/SupportChat.tsx`, `SupportChat.test.ts` | Khung chat (thuần props), 15 test |
| Create `src/windows/main/screens/SupportScreen.tsx`, `src/windows/main/supportStore.ts` | Nối store với lõi Rust |
| Modify `src/windows/main/Shell.tsx`, `src/windows/main/main.tsx`, `src/styles/main.css` | Mục Hỗ trợ và chấm đỏ, nghe sự kiện từ lúc mở cửa sổ, kiểu dáng |
| Modify `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs` | IPC giả của chat, điều kiện DOM và bấm thật |

---

### Task 0: Mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và cây làm việc**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short
```
Expected: không có file nào dưới `src-tauri/`, `src/`, `scripts/`. (Có thể có các file tài liệu của chat hỗ trợ chưa commit, như spec `2026-10-22-chat-ho-tro-zalo-design.md` và các kế hoạch `2026-10-22-chat-ho-tro-0*.md`, kể cả file này: của phiên khác, đừng đụng.) Có thay đổi dưới `src-tauri/`, `src/` hay `scripts/` thì dừng và hỏi.

- [ ] **Step 2: Mốc test Rust**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 753 passed; 0 failed; 6 ignored; …`

Đo ngày 2026-10-22 trên `main` (`01c2077a`): **753 passed, 6 ignored**. Mỗi task Rust dưới đây ghi số mới; Task 8 đòi **798**. Có test đỏ trước khi sửa gì thì dừng và báo.

- [ ] **Step 3: Mốc test giao diện và kiểu**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  26 passed (26)` và `Tests  331 passed (331)` (đo ngày 2026-10-22). Task 11 đưa lên **28 file, 359 test**.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì (exit 0).

- [ ] **Step 4: Công cụ cho các bước kiểm sau**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && rustup target list --installed | grep x86_64-pc-windows-msvc
```
Expected: `x86_64-pc-windows-msvc` (cho `scripts/check-windows.sh`). Không có thì `rustup target add x86_64-pc-windows-msvc`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && test -d "/Applications/Google Chrome.app" && echo có
```
Expected: `có` (cho `check-i18n.mjs`). Không có thì đặt `CHROME=<đường dẫn tới Chrome>` cho mọi lệnh `node scripts/ui-preview/…`.

---

### Task 1: Khung module và `support.json` (`store.rs`)

**Files:**
- Create: `src-tauri/src/support/mod.rs`, `src-tauri/src/support/store.rs`
- Modify: `src-tauri/src/lib.rs`

`support.json` nằm ở `app_local_data_dir` (cùng chỗ với `reports/` của báo cáo lỗi và `sidecars-seen.json`). Khóa theo hợp đồng phía khách (`token`, `lastId`, `waitingSince`) cộng `unread` (quyết định 6). Ghi bằng file tạm rồi đổi tên (như `diagnostics/queue.rs`); không có cuộc chat thì xóa file. File hỏng hay token sai dạng thì coi như chưa có cuộc chat.

- [ ] **Step 1: Viết test trước (đỏ)**

Tạo `src-tauri/src/support/mod.rs` với nội dung:

```rust
//! Chat hỗ trợ trong app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4; kế hoạch chat-ho-tro-03). Khách nhắn ở màn hình Hỗ trợ,
//! tin tới Zalo của chủ dự án qua license server (`api.`); câu trả lời về bằng cách hỏi tin mới định kỳ. Dùng được với mọi người
//! dùng, kể cả Free và chưa có license.
//!
//! - [`api`]: gọi `/v1/support/*` (production, không theo redirect, lỗi không kèm URL hay token);
//! - [`store`]: `support.json` (token, con trỏ, đang chờ trả lời, chấm đỏ);
//! - [`cadence`]: luật nhịp hỏi tin (hàm thuần); [`chat`]: lõi, không phụ thuộc Tauri;
//! - [`context`]: dòng thông tin máy gửi kèm tin đầu tiên (không bao giờ có key, email, mã máy, tên máy, tên người dùng);
//! - file này: phần ghép với app (trạng thái quản lý bằng `app.manage`, luồng hỏi nền, sự kiện `support://view`, việc của các
//!   lệnh `support_*`).

pub mod store;
```

Tạo `src-tauri/src/support/store.rs` với nội dung:

```rust
//! File `support.json` trong thư mục dữ liệu của app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4): token của cuộc chat, con
//! trỏ `lastId` và `waitingSince` như hợp đồng phía khách, thêm `unread` để chấm đỏ còn sau khi mở lại app. Không dùng kho khóa:
//! token chỉ mở được cuộc chat, và kho khóa của macOS ký ad-hoc hỏi quyền. Chưa có cuộc chat thì không có file.

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123-_6";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-support-store-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir.join("support.json")
    }

    #[test]
    fn a_conversation_survives_a_restart_with_the_contract_keys() {
        let path = temp("roundtrip");
        let store = Store::new(path.clone());
        let saved = Saved {
            token: Some(TOKEN.into()),
            last_id: 42,
            waiting_since: Some(1_800_000_000),
            unread: true,
        };
        store.save(&saved).unwrap();
        assert_eq!(Store::new(path.clone()).load(), saved);
        let raw: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(
            raw,
            serde_json::json!({ "token": TOKEN, "lastId": 42, "waitingSince": 1_800_000_000, "unread": true })
        );
        assert!(!path.with_extension("json.tmp").exists(), "không còn file tạm");
    }

    #[test]
    fn no_conversation_means_no_file() {
        let path = temp("forget");
        let store = Store::new(path.clone());
        assert_eq!(store.load(), Saved::default(), "chưa có file");
        store.save(&Saved::default()).unwrap();
        assert!(!path.exists());
        store
            .save(&Saved {
                token: Some(TOKEN.into()),
                ..Saved::default()
            })
            .unwrap();
        assert!(path.exists());
        store.save(&Saved::default()).unwrap();
        assert!(!path.exists(), "xóa cuộc chat thì xóa file");
    }

    #[test]
    fn a_broken_file_or_a_bad_token_is_ignored() {
        let path = temp("broken");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"{ not json").unwrap();
        assert_eq!(Store::new(path.clone()).load(), Saved::default());
        std::fs::write(&path, br#"{"token":"short","lastId":3}"#).unwrap();
        assert_eq!(Store::new(path.clone()).load(), Saved::default());
        std::fs::write(&path, format!(r#"{{"token":"{TOKEN}","lastId":-5}}"#)).unwrap();
        assert_eq!(
            Store::new(path).load(),
            Saved {
                token: Some(TOKEN.into()),
                ..Saved::default()
            },
            "thiếu khóa thì lấy mặc định, con trỏ âm thành 0"
        );
    }

    #[test]
    fn only_base64url_tokens_of_43_chars_are_accepted() {
        assert!(token_ok(TOKEN));
        assert!(!token_ok(&TOKEN[..42]));
        assert!(!token_ok(&format!("{}=", &TOKEN[..42])));
        assert!(!token_ok(&format!("{}/", &TOKEN[..42])));
    }
}
```

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod state;
pub mod system;
```

và thay bằng:

```rust
pub mod state;
pub mod support;
pub mod system;
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::store 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`) trong `support/store.rs`: chưa có `Saved`, `Store`, `token_ok`, `PathBuf`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/store.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
use std::io;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Nội dung của `support.json`.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    /// Token của cuộc chat (43 ký tự base64url); `None` là chưa có cuộc chat.
    pub token: Option<String>,
    /// `id` lớn nhất đã nhận qua lần hỏi tin (con trỏ `after`).
    #[serde(default)]
    pub last_id: i64,
    /// Giây Unix của tin khách cuối chưa có trả lời; `None` khi không chờ.
    #[serde(default)]
    pub waiting_since: Option<i64>,
    /// Có câu trả lời mới chưa xem (chấm đỏ ở mục Hỗ trợ).
    #[serde(default)]
    pub unread: bool,
}

/// Token đúng dạng của hợp đồng: 43 ký tự base64url (32 byte ngẫu nhiên).
pub fn token_ok(token: &str) -> bool {
    token.len() == 43
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

pub struct Store {
    path: PathBuf,
}

impl Store {
    /// `path`: đường dẫn đầy đủ của `support.json` (thư mục được tạo khi ghi).
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    /// Đọc file. Không có, hỏng, hay token sai dạng thì như chưa có cuộc chat.
    pub fn load(&self) -> Saved {
        let saved: Saved = std::fs::read(&self.path)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        match saved.token.as_deref() {
            Some(token) if token_ok(token) => Saved {
                last_id: saved.last_id.max(0),
                ..saved
            },
            _ => Saved::default(),
        }
    }

    /// Ghi file (ghi file tạm rồi đổi tên, để không bao giờ còn nửa file). Không có token thì xóa file.
    pub fn save(&self, saved: &Saved) -> io::Result<()> {
        if saved.token.is_none() {
            return match std::fs::remove_file(&self.path) {
                Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
                _ => Ok(()),
            };
        }
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let bytes = serde_json::to_vec(saved).map_err(io::Error::other)?;
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &self.path)
    }
}

```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::store 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 4 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 757 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/support/store.rs src-tauri/src/lib.rs && git commit -m "feat(app): support.json cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 2: Luật nhịp hỏi tin (`cadence.rs`)

**Files:**
- Create: `src-tauri/src/support/cadence.rs`
- Modify: `src-tauri/src/support/mod.rs`

Hàm thuần, đúng bảng của spec §4 và hợp đồng phía khách: màn hình mở và cửa sổ hiện thì 3 giây (2 phút liền không có tin mới thì 15 giây); đang chờ trả lời trong 24 giờ và không đang dịch thì 60 giây; còn lại, kể cả khi chưa có cuộc chat, không gọi mạng. Lỗi mạng giãn 3 → 15 → 60 giây.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/support/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod store;
```

và thay bằng:

```rust
pub mod cadence;
pub mod store;
```

Tạo `src-tauri/src/support/cadence.rs` với nội dung:

```rust
//! Nhịp hỏi tin mới của app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4, hợp đồng phía khách). Hàm thuần: không giờ thật,
//! không mạng; lõi (`chat.rs`) gọi mỗi nhịp với trạng thái hiện tại.
//!
//! | Lúc nào | Nhịp |
//! |---|---|
//! | Màn hình Hỗ trợ đang mở và cửa sổ chính đang hiện | 3 giây; 2 phút liền không có tin mới thì 15 giây |
//! | Đang chờ trả lời (tin cuối của khách, trong 24 giờ qua) và không đang dịch | 60 giây |
//! | Còn lại, kể cả khi chưa từng dùng chat | không gọi mạng |

#[cfg(test)]
mod tests {
    use super::*;

    const T: i64 = 1_800_000_000;

    fn base() -> Inputs {
        Inputs {
            has_conversation: true,
            screen_open: false,
            window_visible: true,
            translating: false,
            waiting_since: None,
            active_at: T,
            now: T,
        }
    }

    #[test]
    fn without_a_conversation_nothing_ever_connects() {
        for (screen_open, translating) in [(false, false), (true, false), (true, true)] {
            let i = Inputs {
                has_conversation: false,
                screen_open,
                translating,
                waiting_since: Some(T),
                ..base()
            };
            assert_eq!(next(&i), Next::Idle, "{i:?}");
        }
    }

    #[test]
    fn an_open_screen_polls_every_3_seconds_then_15_after_two_quiet_minutes() {
        let open = Inputs {
            screen_open: true,
            ..base()
        };
        assert_eq!(next(&open), Next::Poll(3));
        assert_eq!(next(&Inputs { now: T + 119, ..open }), Next::Poll(3));
        assert_eq!(next(&Inputs { now: T + 120, ..open }), Next::Poll(15));
        // Đang dịch không làm màn hình đang mở ngừng hỏi (người dùng đang nhìn cuộc chat).
        assert_eq!(
            next(&Inputs {
                translating: true,
                ..open
            }),
            Next::Poll(3)
        );
    }

    #[test]
    fn waiting_for_a_reply_polls_every_minute_unless_translating() {
        let waiting = Inputs {
            waiting_since: Some(T - 3600),
            ..base()
        };
        assert_eq!(next(&waiting), Next::Poll(60));
        assert_eq!(
            next(&Inputs {
                translating: true,
                ..waiting
            }),
            Next::Recheck(15),
            "đang dịch: không gọi mạng, chỉ xét lại"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T - WAITING_FOR_SECS),
                ..waiting
            }),
            Next::Idle,
            "quá 24 giờ thì thôi chờ"
        );
        assert_eq!(next(&base()), Next::Idle, "không chờ, màn hình đóng");
    }

    #[test]
    fn a_hidden_window_is_not_an_open_screen() {
        let hidden = Inputs {
            screen_open: true,
            window_visible: false,
            ..base()
        };
        assert_eq!(
            next(&hidden),
            Next::Recheck(3),
            "không hỏi, xét lại để biết khi cửa sổ hiện lại"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T),
                ..hidden
            }),
            Next::Poll(60),
            "cửa sổ ẩn mà đang chờ trả lời: như màn hình đóng"
        );
        assert_eq!(
            next(&Inputs {
                waiting_since: Some(T),
                translating: true,
                ..hidden
            }),
            Next::Recheck(3)
        );
    }

    #[test]
    fn network_errors_back_off_3_15_then_60_seconds() {
        assert_eq!([1, 2, 3, 4, 50].map(network_backoff), [3, 15, 60, 60, 60]);
        assert_eq!(network_backoff(0), 3);
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::cadence 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`) trong `support/cadence.rs`: chưa có `Inputs`, `Next`, `next`, `network_backoff`, `WAITING_FOR_SECS`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/cadence.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
/// Nhịp khi màn hình Hỗ trợ đang mở.
pub const FAST_SECS: i64 = 3;
/// Nhịp khi màn hình đang mở mà đã 2 phút không có tin mới.
pub const SLOW_SECS: i64 = 15;
/// Bao lâu không có tin mới thì chuyển từ 3 sang 15 giây.
pub const QUIET_AFTER_SECS: i64 = 120;
/// Nhịp khi đang chờ trả lời mà màn hình đóng.
pub const WAITING_SECS: i64 = 60;
/// Tin cuối của khách cũ hơn chừng này thì thôi chờ trả lời.
pub const WAITING_FOR_SECS: i64 = 24 * 3600;
/// Chờ sau lỗi mạng liền: lần 1, lần 2, từ lần 3.
const BACKOFF_SECS: [i64; 3] = [3, 15, 60];

/// Trạng thái để quyết nhịp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Inputs {
    /// Đã có cuộc chat (có token).
    pub has_conversation: bool,
    /// Màn hình Hỗ trợ đang mở (giao diện báo).
    pub screen_open: bool,
    /// Cửa sổ chính đang hiện.
    pub window_visible: bool,
    /// Có phiên dịch đang bắt đầu hay chạy.
    pub translating: bool,
    /// Giây Unix của tin khách cuối chưa có trả lời.
    pub waiting_since: Option<i64>,
    /// Lần cuối có tin mới, khách gửi tin hay mở màn hình (giây Unix).
    pub active_at: i64,
    pub now: i64,
}

/// Việc của nhịp kế tiếp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Next {
    /// Hỏi server, cách lần hỏi trước chừng này giây.
    Poll(i64),
    /// Không hỏi; xét lại sau chừng này giây (cửa sổ có thể hiện lại, phiên dịch có thể dừng). Không gọi mạng.
    Recheck(i64),
    /// Không hỏi, không cần xét lại cho tới khi một lệnh của giao diện đánh thức.
    Idle,
}

/// Đang chờ trả lời: tin cuối của khách chưa có trả lời và gửi trong 24 giờ qua.
pub fn waiting(waiting_since: Option<i64>, now: i64) -> bool {
    waiting_since.is_some_and(|since| now - since < WAITING_FOR_SECS)
}

pub fn next(i: &Inputs) -> Next {
    if !i.has_conversation {
        return Next::Idle;
    }
    let waiting = waiting(i.waiting_since, i.now);
    if i.screen_open && i.window_visible {
        let quiet = i.now - i.active_at >= QUIET_AFTER_SECS;
        return Next::Poll(if quiet { SLOW_SECS } else { FAST_SECS });
    }
    if waiting && !i.translating {
        return Next::Poll(WAITING_SECS);
    }
    if i.screen_open {
        return Next::Recheck(FAST_SECS);
    }
    if waiting {
        return Next::Recheck(SLOW_SECS);
    }
    Next::Idle
}

/// Chờ bao lâu sau `failures` lần lỗi mạng liền (tính từ 1): 3, 15, rồi 60 giây.
pub fn network_backoff(failures: u32) -> i64 {
    let index = usize::try_from(failures.saturating_sub(1)).unwrap_or(usize::MAX);
    BACKOFF_SECS[index.min(BACKOFF_SECS.len() - 1)]
}

```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::cadence 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 5 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 762 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/support/cadence.rs && git commit -m "feat(app): luật nhịp hỏi tin của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 3: Client HTTP (`api.rs`)

**Files:**
- Create: `src-tauri/src/support/api.rs`
- Modify: `src-tauri/src/support/mod.rs`

Theo mẫu `diagnostics/send.rs`: `reqwest` blocking, `User-Agent: AI-Translator`, **không theo redirect**, hết giờ kết nối 10 giây và cả request 15 giây, lỗi mạng dùng `without_url()` (không kèm URL), cùng `PRODUCTION_URL` qua `accept_base`. App không gọi `GET /v1/support/status` (quyết định 5). Phân loại lỗi đúng bảng mã lỗi của hợp đồng; `429` nâng `Retry-After` lên tối thiểu 15 giây; `404` (server chưa có các đường chat) coi như không gọi được. `SupportMessage` đọc `created_at` của server và gửi giao diện `createdAt`. Test chạy server TCP giả trong máy, không ra mạng.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/support/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod cadence;
pub mod store;
```

và thay bằng:

```rust
pub mod api;
pub mod cadence;
pub mod store;
```

Tạo `src-tauri/src/support/api.rs` với nội dung:

```rust
//! Gọi các đường `/v1/support/*` của license server (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.2; hợp đồng ở kế hoạch
//! `2026-10-22-chat-ho-tro-00-tong-quan.md`). Cùng host, cùng địa chỉ production với `license::client` và báo cáo lỗi, nên
//! danh sách kết nối của A7 không thêm host nào. App không dùng `GET /v1/support/status`: chưa từng nhắn thì không kết nối gì cho
//! chat, kể cả khi mở màn hình Hỗ trợ; chat tắt thì biết qua `503` của tin đầu hay thân `GET messages`.
//!
//! Không theo redirect. Lỗi không bao giờ kèm URL, token hay nội dung tin. Request ghi luôn có `Content-Type: application/json`
//! và thân là object JSON (kể cả `DELETE`: `{}`). Token của cuộc chat đi trong `Authorization: Bearer`.

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456";

    /// Một request server giả đã nhận.
    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        /// Header, tên viết thường.
        headers: Vec<(String, String)>,
        body: String,
    }

    impl Seen {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
        }
        fn json(&self) -> Value {
            serde_json::from_str(&self.body).unwrap()
        }
    }

    /// Một response của server giả: mã, header thêm, thân.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server giả: trả lần lượt các response cho các request tới, giữ lại mọi request.
    fn serve(responses: Vec<Canned>) -> (String, Arc<Mutex<Vec<Seen>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for (status, headers, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let mut parts = line.split_whitespace();
                let mut req = Seen {
                    method: parts.next().unwrap_or_default().into(),
                    path: parts.next().unwrap_or_default().into(),
                    ..Seen::default()
                };
                let mut length = 0;
                loop {
                    let mut h = String::new();
                    reader.read_line(&mut h).unwrap();
                    let h = h.trim_end();
                    if h.is_empty() {
                        break;
                    }
                    let (name, value) = h.split_once(':').unwrap();
                    let name = name.to_ascii_lowercase();
                    if name == "content-length" {
                        length = value.trim().parse().unwrap();
                    }
                    req.headers.push((name, value.trim().to_string()));
                }
                let mut buf = vec![0; length];
                reader.read_exact(&mut buf).unwrap();
                req.body = String::from_utf8(buf).unwrap();
                log.lock().unwrap().push(req);
                let extra: String = headers.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    #[test]
    fn the_first_message_opens_a_conversation_without_token() {
        let (base, seen) = serve(vec![(
            201,
            vec![],
            r#"{"token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456","message":{"id":7,"sender":"customer","text":"Chào","created_at":1800000000}}"#,
        )]);
        let opening = Opening {
            text: "Chào".into(),
            lang: "vi",
            source: "app-debug",
            context: Some("AI Translator 0.2.4 · macOS 15.6".into()),
        };
        let started = HttpSupportApi::new(Some(base)).start(&opening).unwrap();
        assert_eq!(started.token, TOKEN);
        assert_eq!(
            started.message,
            SupportMessage {
                id: 7,
                sender: Sender::Customer,
                text: "Chào".into(),
                created_at: 1_800_000_000
            }
        );
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("POST", "/v1/support/messages")
        );
        assert_eq!(
            seen[0].header("authorization"),
            None,
            "chưa có cuộc chat thì không có token"
        );
        assert_eq!(seen[0].header("content-type"), Some("application/json"));
        assert_eq!(
            seen[0].json(),
            json!({ "text": "Chào", "lang": "vi", "source": "app-debug", "context": "AI Translator 0.2.4 · macOS 15.6" })
        );
    }

    #[test]
    fn later_messages_carry_the_token_and_only_the_text() {
        let (base, seen) = serve(vec![(
            201,
            vec![],
            r#"{"message":{"id":9,"sender":"customer","text":"Thêm","created_at":1800000100}}"#,
        )]);
        let message = HttpSupportApi::new(Some(base)).send(TOKEN, "Thêm").unwrap();
        assert_eq!(message.id, 9);
        let seen = seen.lock().unwrap();
        assert_eq!(
            seen[0].header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
        assert_eq!(seen[0].json(), json!({ "text": "Thêm" }));
    }

    #[test]
    fn polling_asks_for_messages_after_the_cursor() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"enabled":true,"status":"open","messages":[{"id":43,"sender":"owner","text":"Xin chào","created_at":1800000200}]}"#,
        )]);
        let batch = HttpSupportApi::new(Some(base)).messages(TOKEN, 42).unwrap();
        assert!(batch.enabled);
        assert_eq!(batch.status, "open");
        assert_eq!(batch.messages[0].sender, Sender::Owner);
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("GET", "/v1/support/messages?after=42")
        );
        assert_eq!(
            seen[0].header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
    }

    #[test]
    fn email_and_delete_send_json_objects() {
        let ok = (200, vec![], r#"{"ok":true}"#);
        let (base, seen) = serve(vec![ok.clone(), ok.clone(), ok]);
        let api = HttpSupportApi::new(Some(base));
        assert_eq!(api.set_email(TOKEN, Some("khach@example.com")), Ok(()));
        assert_eq!(api.set_email(TOKEN, None), Ok(()));
        assert_eq!(api.delete(TOKEN), Ok(()));
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("PUT", "/v1/support/email")
        );
        assert_eq!(seen[0].json(), json!({ "email": "khach@example.com" }));
        assert_eq!(seen[1].json(), json!({ "email": null }));
        assert_eq!(
            (seen[2].method.as_str(), seen[2].path.as_str()),
            ("DELETE", "/v1/support/conversation")
        );
        assert_eq!(seen[2].header("content-type"), Some("application/json"));
        assert_eq!(seen[2].json(), json!({}));
        assert!(
            seen.iter()
                .all(|s| s.header("authorization") == Some(format!("Bearer {TOKEN}").as_str()))
        );
    }

    #[test]
    fn server_answers_map_to_the_contract_errors() {
        let (base, _) = serve(vec![
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (429, vec![("Retry-After", "3")], r#"{"error":"rate_limited"}"#),
            (429, vec![], r#"{"error":"support_busy"}"#),
            (503, vec![], r#"{"error":"support_disabled"}"#),
            (503, vec![], ""),
            (500, vec![], ""),
            (401, vec![], r#"{"error":"invalid_token"}"#),
            (403, vec![], r#"{"error":"conversation_closed"}"#),
            (400, vec![], r#"{"error":"invalid_request","field":"text"}"#),
            (415, vec![], r#"{"error":"unsupported_media_type"}"#),
            (404, vec![], "Not Found"),
            (302, vec![("Location", "https://nơi.khác/")], ""),
            (200, vec![], "không phải json"),
        ]);
        let api = HttpSupportApi::new(Some(base));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::RateLimited(120)));
        assert_eq!(
            api.send(TOKEN, "a"),
            Err(ApiError::RateLimited(15)),
            "tối thiểu 15 giây"
        );
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Busy(15)));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Disabled));
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "503 khác là lỗi tạm"
        );
        assert!(matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::InvalidToken));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Closed));
        assert_eq!(
            api.send(TOKEN, "a"),
            Err(ApiError::Invalid {
                status: 400,
                code: "invalid_request".into(),
                field: Some("text".into())
            })
        );
        assert!(matches!(
            api.send(TOKEN, "a"),
            Err(ApiError::Invalid { status: 415, .. })
        ));
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "404: server chưa có chat"
        );
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Invalid { status: 302, .. })),
            "không theo redirect"
        );
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "thân sai dạng"
        );
    }

    #[test]
    fn no_network_is_an_error_without_the_url_or_the_token() {
        // Cổng vừa đóng: kết nối bị từ chối.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let err = HttpSupportApi::new(Some(format!("http://127.0.0.1:{port}")))
            .send(TOKEN, "a")
            .unwrap_err();
        let ApiError::Network(message) = err else {
            panic!("{err:?}")
        };
        assert!(!message.contains("127.0.0.1") && !message.contains(TOKEN), "{message}");
    }

    #[test]
    fn an_unconfigured_build_never_calls() {
        assert_eq!(
            HttpSupportApi::new(None).messages(TOKEN, 0),
            Err(ApiError::NotConfigured)
        );
    }

    #[test]
    fn the_ui_receives_messages_in_camel_case() {
        let m = SupportMessage {
            id: 1,
            sender: Sender::Owner,
            text: "Chào".into(),
            created_at: 5,
        };
        assert_eq!(
            serde_json::to_value(&m).unwrap(),
            json!({ "id": 1, "sender": "owner", "text": "Chào", "createdAt": 5 })
        );
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::api 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`) trong `support/api.rs`: chưa có `HttpSupportApi`, `Opening`, `SupportMessage`, `Sender`, `ApiError`, `Value`, `json!`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/api.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
use std::time::Duration;

use reqwest::Method;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::license::client::{PRODUCTION_URL, accept_base};

const USER_AGENT: &str = "AI-Translator";

/// Sau `429` chờ tối thiểu chừng này giây (hợp đồng phía khách), kể cả khi server không gửi `Retry-After` hay gửi số nhỏ hơn.
pub const MIN_RETRY_AFTER_SECS: u64 = 15;

/// Người gửi một tin.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sender {
    Customer,
    Owner,
}

/// Một tin của cuộc chat. Server gửi `created_at`; giao diện nhận `createdAt` như mọi kiểu IPC.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportMessage {
    /// Tăng dần trong toàn hệ thống; dùng làm con trỏ `after`.
    pub id: i64,
    pub sender: Sender,
    pub text: String,
    /// Giây Unix.
    #[serde(alias = "created_at")]
    pub created_at: i64,
}

/// Kết quả của `GET /v1/support/messages`.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Batch {
    pub enabled: bool,
    /// `open`, hay `closed` khi chủ dự án đã chặn cuộc chat.
    pub status: String,
    pub messages: Vec<SupportMessage>,
}

/// Tin đầu tiên của một cuộc chat mới.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opening {
    pub text: String,
    /// Ngôn ngữ giao diện: `vi`, `en`, `ja`, `zh`, `ko`.
    pub lang: &'static str,
    /// `app`, hay `app-debug` ở bản debug.
    pub source: &'static str,
    /// Dòng thông tin máy (`support::context`), chỉ khi khách để tích "Gửi kèm thông tin máy".
    pub context: Option<String>,
}

/// Cuộc chat vừa tạo: token (chỉ app giữ) và tin đầu tiên server đã lưu.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Started {
    pub token: String,
    pub message: SupportMessage,
}

/// Lỗi của một lần gọi, đã phân loại theo hợp đồng.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ApiError {
    #[error("bản build chưa có địa chỉ server")]
    NotConfigured,
    /// Mạng hỏng, `5xx` (trừ `503 support_disabled`), `404` (server chưa có các đường chat), hay response sai dạng.
    #[error("không gọi được server: {0}")]
    Network(String),
    /// `429 rate_limited`: số giây phải chờ, đã nâng lên tối thiểu [`MIN_RETRY_AFTER_SECS`].
    #[error("gửi quá nhanh, chờ {0} giây")]
    RateLimited(u64),
    /// `429 support_busy`: chạm trần toàn hệ thống.
    #[error("hỗ trợ đang quá tải, chờ {0} giây")]
    Busy(u64),
    /// `503 support_disabled`: chủ dự án đã tắt chat (`/tat`).
    #[error("chat đang tắt")]
    Disabled,
    /// `403 conversation_closed`: chủ dự án đã chặn cuộc chat (`/chan`).
    #[error("cuộc chat đã đóng")]
    Closed,
    /// `401 invalid_token`: token sai, hay cuộc chat đã bị xóa (khách tự xóa, hết 90 ngày).
    #[error("cuộc chat không còn trên server")]
    InvalidToken,
    /// `400`, `413`, `415`, `3xx` hay `4xx` khác: thân sai hay app gọi sai. Kèm `field` nếu server báo; app tự kiểm trước thì
    /// `status` là 0.
    #[error("bị từ chối: {status} {code}")]
    Invalid {
        status: u16,
        code: String,
        field: Option<String>,
    },
}

/// Nơi nhận tin. App thật là [`HttpSupportApi`]; test dùng bản giả (`test_support::FakeSupportApi`).
pub trait SupportApi: Send + Sync {
    /// `POST /v1/support/messages` không có token: tạo cuộc chat mới.
    fn start(&self, opening: &Opening) -> Result<Started, ApiError>;
    /// `POST /v1/support/messages` có token: thêm một tin vào cuộc chat.
    fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError>;
    /// `GET /v1/support/messages?after=<after>`: các tin có `id > after`.
    fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError>;
    /// `PUT /v1/support/email`: để lại email, hay `None` để bỏ.
    fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError>;
    /// `DELETE /v1/support/conversation`: xóa cuộc chat và mọi tin.
    fn delete(&self, token: &str) -> Result<(), ApiError>;
}

pub struct HttpSupportApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

#[derive(Deserialize)]
struct MessageBody {
    message: SupportMessage,
}

impl HttpSupportApi {
    /// Server của mọi bản build, debug lẫn phát hành: production.
    pub fn for_this_build() -> Self {
        Self::new(PRODUCTION_URL.and_then(|u| accept_base(u, false)))
    }

    pub fn new(base: Option<String>) -> Self {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        Self { base, client }
    }

    fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Result<T, ApiError> {
        let base = self.base.as_ref().ok_or(ApiError::NotConfigured)?;
        let mut req = self.client.request(method, format!("{base}{path}"));
        if let Some(token) = token {
            req = req.bearer_auth(token);
        }
        if let Some(body) = body {
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }
        // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn.
        let resp = req.send().map_err(|e| ApiError::Network(e.without_url().to_string()))?;
        let status = resp.status().as_u16();
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let bytes = resp
            .bytes()
            .map_err(|e| ApiError::Network(e.without_url().to_string()))?;
        if (200..300).contains(&status) {
            return serde_json::from_slice(&bytes).map_err(|e| ApiError::Network(format!("response sai dạng: {e}")));
        }
        Err(error_of(status, retry_after, &bytes))
    }
}

/// Phân loại một response lỗi theo mã trạng thái và `error` của thân (hợp đồng, bảng mã lỗi).
fn error_of(status: u16, retry_after: Option<u64>, body: &[u8]) -> ApiError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let code = v
        .get("error")
        .and_then(Value::as_str)
        .map_or_else(|| format!("http_{status}"), String::from);
    let wait = retry_after.unwrap_or(0).max(MIN_RETRY_AFTER_SECS);
    match (status, code.as_str()) {
        (429, "support_busy") => ApiError::Busy(wait),
        (429, _) => ApiError::RateLimited(wait),
        (503, "support_disabled") => ApiError::Disabled,
        (401, _) => ApiError::InvalidToken,
        (403, "conversation_closed") => ApiError::Closed,
        // Server chưa có các đường chat (chưa deploy bản có chat): với khách, như không gọi được.
        (404, _) => ApiError::Network("server trả 404".into()),
        (s, _) if s >= 500 => ApiError::Network(format!("server trả {s}")),
        _ => ApiError::Invalid {
            status,
            field: v.get("field").and_then(Value::as_str).map(String::from),
            code,
        },
    }
}

impl SupportApi for HttpSupportApi {
    fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
        let body = json!({
            "text": opening.text,
            "lang": opening.lang,
            "source": opening.source,
            "context": opening.context,
        });
        self.call(Method::POST, "/v1/support/messages", None, Some(body))
    }

    fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError> {
        self.call::<MessageBody>(
            Method::POST,
            "/v1/support/messages",
            Some(token),
            Some(json!({ "text": text })),
        )
        .map(|b| b.message)
    }

    fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError> {
        let path = format!("/v1/support/messages?after={}", after.max(0));
        self.call(Method::GET, &path, Some(token), None)
    }

    fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError> {
        self.call::<IgnoredAny>(
            Method::PUT,
            "/v1/support/email",
            Some(token),
            Some(json!({ "email": email })),
        )
        .map(drop)
    }

    fn delete(&self, token: &str) -> Result<(), ApiError> {
        self.call::<IgnoredAny>(Method::DELETE, "/v1/support/conversation", Some(token), Some(json!({})))
            .map(drop)
    }
}

```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::api 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 8 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 770 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/support/api.rs && git commit -m "feat(app): client HTTP của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 4: Dòng thông tin máy (`context.rs`)

**Files:**
- Create: `src-tauri/src/support/context.rs`
- Modify: `src-tauri/src/support/mod.rs`

Phần thuần: dựng dòng từ `MachineFacts` (quyết định 9). Kiểu này không có trường nào cho key, email, mã máy, tên máy hay tên người dùng; mã gói lạ bị bỏ (chỉ bốn tên `Free`, `Monthly`, `6 Months`, `Yearly` đi qua); bỏ ký tự điều khiển; tối đa 300 ký tự. Phần đọc máy thật (Task 7) lấy từ `diagnostics::machine::system_info`, `models::machine::total_ram_bytes`, `sidecar::GpuProbe`, `license::app::view` và manifest model.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/support/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod cadence;
pub mod store;
```

và thay bằng:

```rust
pub mod cadence;
pub mod context;
pub mod store;
```

Tạo `src-tauri/src/support/context.rs` với nội dung:

```rust
//! Dòng thông tin máy gửi kèm tin đầu tiên khi khách để tích "Gửi kèm thông tin máy" (spec 2026-10-22-chat-ho-tro-zalo-design.md
//! §4), ví dụ `AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi`. Giao diện hiện nguyên văn
//! dòng này trước khi gửi.
//!
//! Dòng chỉ dựng từ [`MachineFacts`]: kiểu này không có trường nào cho key, email của license, mã máy, tên máy hay tên người dùng,
//! nên muốn thêm phải sửa kiểu (và test chặn ở `support::tests`). Phần đọc máy thật ở `support/mod.rs`.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sidecar::probe::GpuInfo;

    const GB: u64 = 1 << 30;

    fn mac() -> MachineFacts {
        MachineFacts {
            app_name: "AI Translator".into(),
            app_version: "0.2.4".into(),
            os_name: "macos",
            os_version: "15.6".into(),
            chip: Some("Apple M4 Pro".into()),
            ram_bytes: Some(24 * GB),
            gpus: Vec::new(),
            plan: Some("monthly".into()),
            model_pack: Some("Chuẩn".into()),
            ui_lang: "vi",
        }
    }

    #[test]
    fn a_mac_line_reads_like_the_spec_example() {
        assert_eq!(
            line(&mac()),
            "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi"
        );
    }

    #[test]
    fn a_windows_line_names_the_release_and_the_graphics_cards() {
        let facts = MachineFacts {
            os_name: "windows",
            os_version: "10.0.26100".into(),
            chip: Some("Intel(R) Core(TM) i5-1345U".into()),
            ram_bytes: Some(16 * GB - 300 * (1 << 20)),
            gpus: vec![
                "Intel(R) Iris(R) Xe Graphics".into(),
                "NVIDIA GeForce RTX 3050 Laptop GPU".into(),
            ],
            plan: Some("six_months".into()),
            model_pack: None,
            ui_lang: "en",
            ..mac()
        };
        assert_eq!(
            line(&facts),
            "AI Translator 0.2.4 · Windows 11 (26100) · Intel(R) Core(TM) i5-1345U · 16 GB · GPU Intel(R) Iris(R) Xe Graphics + NVIDIA GeForce RTX 3050 Laptop GPU · 6 Months · UI en"
        );
        assert_eq!(os_label("windows", "10.0.19045"), "Windows 10 (19045)");
        assert_eq!(os_label("windows", "unknown"), "Windows unknown");
    }

    #[test]
    fn only_the_four_plan_names_and_clean_text_get_through() {
        let facts = MachineFacts {
            // Mã gói lạ (kể cả thứ trông như một key) bị bỏ.
            plan: Some("7Q2M-4K9D-XXXX".into()),
            chip: Some("Apple\u{0} M4\n".into()),
            model_pack: Some("   ".into()),
            ram_bytes: None,
            ..mac()
        };
        assert_eq!(line(&facts), "AI Translator 0.2.4 · macOS 15.6 · Apple M4 · UI vi");
        for (code, name) in [
            ("free", "Free"),
            ("monthly", "Monthly"),
            ("six_months", "6 Months"),
            ("yearly", "Yearly"),
        ] {
            assert_eq!(plan_name(code), Some(name));
        }
    }

    #[test]
    fn the_line_is_capped_at_300_characters() {
        let facts = MachineFacts {
            chip: Some("ế".repeat(400)),
            ..mac()
        };
        assert_eq!(line(&facts).chars().count(), MAX_CHARS);
    }

    #[test]
    fn graphics_cards_come_from_the_gpu_probe() {
        let gpu = |name: &str, kind: &str| GpuInfo {
            name: name.into(),
            device_type: kind.into(),
            device_local_bytes: 0,
            vendor_id: 0,
        };
        let probe = ProbeOutcome {
            usable: true,
            gpus: vec![
                gpu("Intel(R) UHD Graphics", "integrated"),
                gpu("Microsoft Basic Render Driver", "cpu"),
                gpu("RTX 4060", "discrete"),
            ],
        };
        assert_eq!(gpu_names(Some(&probe)), ["Intel(R) UHD Graphics", "RTX 4060"]);
        assert!(gpu_names(None).is_empty(), "chưa dò (macOS, hay Windows chưa dò xong)");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::context 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`) trong `support/context.rs`: chưa có `MachineFacts`, `line`, `os_label`, `plan_name`, `gpu_names`, `ProbeOutcome`, `MAX_CHARS`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/context.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
use crate::sidecar::probe::ProbeOutcome;

/// Số ký tự tối đa (server cũng cắt ở 300).
pub const MAX_CHARS: usize = 300;

/// Mọi thứ dòng thông tin máy được phép chứa.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MachineFacts {
    /// Tên sản phẩm (`productName`) và phiên bản.
    pub app_name: String,
    pub app_version: String,
    /// `macos` hay `windows` (`diagnostics::machine::SystemInfo::os_name`).
    pub os_name: &'static str,
    /// `15.6`; Windows là `10.0.<bản dựng>`.
    pub os_version: String,
    pub chip: Option<String>,
    pub ram_bytes: Option<u64>,
    /// Tên card đồ họa (Windows, theo lần dò GPU lúc mở app); macOS rỗng.
    pub gpus: Vec<String>,
    /// Mã gói bản quyền (`free`, `monthly`, `six_months`, `yearly`); mã khác bị bỏ.
    pub plan: Option<String>,
    /// Tên gói model theo ngôn ngữ giao diện (`Chuẩn`, `Standard`…), hay mã gói khi manifest không có.
    pub model_pack: Option<String>,
    /// Ngôn ngữ giao diện: `vi`, `en`, `ja`, `zh`, `ko`.
    pub ui_lang: &'static str,
}

/// Tên gói hiện cho người dùng (như `plan.*` của giao diện, giống nhau ở mọi ngôn ngữ).
pub fn plan_name(code: &str) -> Option<&'static str> {
    match code {
        "free" => Some("Free"),
        "monthly" => Some("Monthly"),
        "six_months" => Some("6 Months"),
        "yearly" => Some("Yearly"),
        _ => None,
    }
}

/// Tên hệ điều hành kèm phiên bản. Windows báo `10.0` cho cả Windows 10 và 11: bản dựng từ 22000 trở lên là Windows 11.
pub fn os_label(os_name: &str, version: &str) -> String {
    match os_name {
        "macos" => format!("macOS {version}"),
        "windows" => match version.rsplit('.').next().and_then(|b| b.parse::<u32>().ok()) {
            Some(build) if build >= 22_000 => format!("Windows 11 ({build})"),
            Some(build) => format!("Windows 10 ({build})"),
            None => format!("Windows {version}"),
        },
        other => format!("{other} {version}"),
    }
}

/// RAM làm tròn tới GB gần nhất (Windows báo phần dùng được, hơi dưới số ghi trên máy).
fn ram_label(bytes: u64) -> String {
    format!("{} GB", (bytes + (1 << 29)) >> 30)
}

/// Tên các card đồ họa dùng được (card rời, GPU tích hợp) trong kết quả dò GPU.
pub fn gpu_names(probe: Option<&ProbeOutcome>) -> Vec<String> {
    probe
        .map(|o| {
            o.gpus
                .iter()
                .filter(|g| matches!(g.device_type.as_str(), "discrete" | "integrated"))
                .map(|g| g.name.clone())
                .collect()
        })
        .unwrap_or_default()
}

/// Bỏ ký tự điều khiển và khoảng trắng hai đầu; rỗng thì `None`.
fn clean(part: &str) -> Option<String> {
    let kept: String = part.chars().filter(|c| !c.is_control()).collect();
    let kept = kept.trim();
    (!kept.is_empty()).then(|| kept.to_string())
}

/// Dòng thông tin máy, tối đa [`MAX_CHARS`] ký tự.
pub fn line(f: &MachineFacts) -> String {
    let mut parts = vec![
        format!("{} {}", f.app_name, f.app_version),
        os_label(f.os_name, &f.os_version),
    ];
    parts.extend(f.chip.clone());
    parts.extend(f.ram_bytes.map(ram_label));
    if !f.gpus.is_empty() {
        parts.push(format!("GPU {}", f.gpus.join(" + ")));
    }
    parts.extend(f.plan.as_deref().and_then(plan_name).map(String::from));
    parts.extend(f.model_pack.clone());
    parts.push(format!("UI {}", f.ui_lang));
    let joined = parts.iter().filter_map(|p| clean(p)).collect::<Vec<_>>().join(" · ");
    joined.chars().take(MAX_CHARS).collect()
}

```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::context 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 5 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 775 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/support/context.rs && git commit -m "feat(app): dòng thông tin máy cho chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 5: Bảy mã lỗi của chat hỗ trợ

**Files:**
- Modify: `src-tauri/src/errors.rs`, `src-tauri/src/diagnostics/mod.rs`
- Modify: `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/ja.ts`, `src/i18n/zh.ts`, `src/i18n/ko.ts`

Hai test có sẵn giữ các mã khớp nhau: `errors::tests::every_error_code_has_ui_text` (mọi mã có `error.<mã>` trong `en.ts`) và `diagnostics::tests::every_error_code_is_classified_exactly_once` (mọi mã nằm đúng một trong `REPORTED_CODES`, `SKIPPED_CODES`). `dictionaries.test.ts` và `i18n.test.ts` đòi năm từ điển cùng bộ khóa, tiếng Việt khác tiếng Anh, ja/zh/ko có chữ của đúng ngôn ngữ, zh là giản thể. Câu `supportDisabled`, `supportClosed` tiếng Việt đúng nguyên văn hợp đồng (không có dấu chấm cuối) vì cũng là dòng thay ô nhập.

- [ ] **Step 1: Viết test trước (đỏ): thêm mã và đưa vào danh sách của test câu báo lỗi**

Trong `src-tauri/src/errors.rs`, tìm đoạn (duy nhất trong file):

```rust
/// Không ghi được bản dịch vào clipboard. Cùng mã với lỗi sao chép của giao diện (`error.copyFailed`).
pub const COPY_FAILED: &str = "copyFailed";
```

và thay bằng:

```rust
/// Không ghi được bản dịch vào clipboard. Cùng mã với lỗi sao chép của giao diện (`error.copyFailed`).
pub const COPY_FAILED: &str = "copyFailed";

// Mã lỗi của chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §4). Màn hình Hỗ trợ hiện câu báo lỗi; không mã nào gửi
// báo cáo lỗi.
/// Không gọi được server: mạng hỏng, server lỗi tạm.
pub const SUPPORT_OFFLINE: &str = "supportOffline";
/// Server bảo gửi chậm lại (`429 rate_limited`).
pub const SUPPORT_RATE_LIMITED: &str = "supportRateLimited";
/// Chạm trần tin của toàn hệ thống (`429 support_busy`): gửi email thay.
pub const SUPPORT_BUSY: &str = "supportBusy";
/// Chủ dự án đã tắt chat (`503 support_disabled`). Cùng câu với dòng thay ô nhập khi chat tắt.
pub const SUPPORT_DISABLED: &str = "supportDisabled";
/// Cuộc chat bị chủ dự án chặn (`403 conversation_closed`). Cùng câu với dòng thay ô nhập khi cuộc chat đóng.
pub const SUPPORT_CLOSED: &str = "supportClosed";
/// Cuộc chat không còn trên server (`401`: khách đã xóa, hay hết 90 ngày): gửi lại để bắt đầu cuộc mới.
pub const SUPPORT_EXPIRED: &str = "supportExpired";
/// Tin rỗng hay dài quá 1000 ký tự, email sai dạng (`field`), hay server từ chối thân request.
pub const SUPPORT_INVALID: &str = "supportInvalid";
```

Trong `src-tauri/src/errors.rs`, tìm đoạn (duy nhất trong file):

```rust
                COMPOSE_UNAVAILABLE,
                COPY_FAILED,
            ]
```

và thay bằng:

```rust
                COMPOSE_UNAVAILABLE,
                COPY_FAILED,
                SUPPORT_OFFLINE,
                SUPPORT_RATE_LIMITED,
                SUPPORT_BUSY,
                SUPPORT_DISABLED,
                SUPPORT_CLOSED,
                SUPPORT_EXPIRED,
                SUPPORT_INVALID,
            ]
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib every_error_code 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: 2 test `FAILED`: `src/i18n/en.ts thiếu error.supportOffline` và `mã `supportOffline` phải nằm đúng một trong REPORTED_CODES hay SKIPPED_CODES`.

- [ ] **Step 3: Phân loại mã và thêm câu ở năm từ điển**

Trong `src-tauri/src/diagnostics/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
    errors::COMPOSE_UNAVAILABLE,
    errors::COPY_FAILED,
];
```

và thay bằng:

```rust
    errors::COMPOSE_UNAVAILABLE,
    errors::COPY_FAILED,
    // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): lỗi mạng hay lỗi của server, màn hình Hỗ trợ tự báo.
    errors::SUPPORT_OFFLINE,
    errors::SUPPORT_RATE_LIMITED,
    errors::SUPPORT_BUSY,
    errors::SUPPORT_DISABLED,
    errors::SUPPORT_CLOSED,
    errors::SUPPORT_EXPIRED,
    errors::SUPPORT_INVALID,
];
```

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.composeUnavailable": "The translator stopped working. Restart AI Translator; if it keeps failing, send the logs to support.",
```

và thay bằng:

```ts
  "error.composeUnavailable": "The translator stopped working. Restart AI Translator; if it keeps failing, send the logs to support.",
  "error.supportOffline": "Could not reach support. Check your internet connection and try again.",
  "error.supportRateLimited": "You are sending messages too quickly. Please try again in a few minutes.",
  "error.supportBusy": "Support is very busy right now. Please email support@aitranslator.io.vn.",
  "error.supportDisabled": "Chat is temporarily off. Please email support@aitranslator.io.vn",
  "error.supportClosed": "This conversation has been closed. Please email support@aitranslator.io.vn",
  "error.supportExpired": "The earlier conversation is gone (deleted or expired). Send again to start a new one.",
  "error.supportInvalid": "Could not send this. Check the message (1 to 1,000 characters) or the email address.",
```

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.composeUnavailable": "Bộ dịch ngừng chạy. Hãy khởi động lại AI Translator; nếu vẫn lỗi, hãy gửi log cho bộ phận hỗ trợ.",
```

và thay bằng:

```ts
  "error.composeUnavailable": "Bộ dịch ngừng chạy. Hãy khởi động lại AI Translator; nếu vẫn lỗi, hãy gửi log cho bộ phận hỗ trợ.",
  "error.supportOffline": "Không kết nối được bộ phận hỗ trợ. Kiểm tra kết nối mạng rồi thử lại.",
  "error.supportRateLimited": "Bạn gửi tin quá nhanh. Vui lòng thử lại sau ít phút.",
  "error.supportBusy": "Bộ phận hỗ trợ đang quá tải. Hãy gửi email tới support@aitranslator.io.vn.",
  "error.supportDisabled": "Chat đang tạm tắt. Hãy gửi email tới support@aitranslator.io.vn",
  "error.supportClosed": "Cuộc trò chuyện đã đóng. Hãy gửi email tới support@aitranslator.io.vn",
  "error.supportExpired": "Cuộc trò chuyện cũ không còn (đã xóa hay hết hạn). Gửi lại để bắt đầu cuộc mới.",
  "error.supportInvalid": "Không gửi được. Kiểm tra lại tin nhắn (1 tới 1.000 ký tự) hay địa chỉ email.",
```

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.composeUnavailable": "翻訳エンジンが停止しました。AI Translator を再起動してください。それでも改善しない場合は、ログをサポートに送ってください。",
```

và thay bằng:

```ts
  "error.composeUnavailable": "翻訳エンジンが停止しました。AI Translator を再起動してください。それでも改善しない場合は、ログをサポートに送ってください。",
  "error.supportOffline": "サポートに接続できませんでした。インターネット接続を確認して、もう一度お試しください。",
  "error.supportRateLimited": "メッセージの送信が速すぎます。数分後にもう一度お試しください。",
  "error.supportBusy": "サポートは現在たいへん混み合っています。support@aitranslator.io.vn までメールでお問い合わせください。",
  "error.supportDisabled": "チャットは一時的に停止しています。support@aitranslator.io.vn までメールでお問い合わせください",
  "error.supportClosed": "この会話は終了しました。support@aitranslator.io.vn までメールでお問い合わせください",
  "error.supportExpired": "以前の会話はもうありません（削除されたか期限切れです）。もう一度送信すると新しい会話が始まります。",
  "error.supportInvalid": "送信できませんでした。メッセージ（1〜1,000 文字）またはメールアドレスを確認してください。",
```

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.composeUnavailable": "翻译引擎已停止工作。请重新启动 AI Translator；如果仍然失败，请把日志发给客服。",
```

và thay bằng:

```ts
  "error.composeUnavailable": "翻译引擎已停止工作。请重新启动 AI Translator；如果仍然失败，请把日志发给客服。",
  "error.supportOffline": "无法连接客服。请检查网络连接后重试。",
  "error.supportRateLimited": "发送消息过于频繁。请几分钟后重试。",
  "error.supportBusy": "客服当前非常繁忙。请发送邮件至 support@aitranslator.io.vn。",
  "error.supportDisabled": "聊天暂时关闭。请发送邮件至 support@aitranslator.io.vn",
  "error.supportClosed": "此对话已关闭。请发送邮件至 support@aitranslator.io.vn",
  "error.supportExpired": "之前的对话已不存在（已删除或已过期）。重新发送即可开始新的对话。",
  "error.supportInvalid": "无法发送。请检查消息（1 到 1,000 个字符）或邮箱地址。",
```

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.composeUnavailable": "번역기가 작동을 멈췄습니다. AI Translator를 다시 시작하세요. 계속 실패하면 로그를 지원팀에 보내 주세요.",
```

và thay bằng:

```ts
  "error.composeUnavailable": "번역기가 작동을 멈췄습니다. AI Translator를 다시 시작하세요. 계속 실패하면 로그를 지원팀에 보내 주세요.",
  "error.supportOffline": "지원팀에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.",
  "error.supportRateLimited": "메시지를 너무 빨리 보내고 있습니다. 몇 분 후에 다시 시도하세요.",
  "error.supportBusy": "지금은 지원팀이 매우 바쁩니다. support@aitranslator.io.vn 으로 이메일을 보내 주세요.",
  "error.supportDisabled": "채팅이 잠시 꺼져 있습니다. support@aitranslator.io.vn 으로 이메일을 보내 주세요",
  "error.supportClosed": "이 대화는 종료되었습니다. support@aitranslator.io.vn 으로 이메일을 보내 주세요",
  "error.supportExpired": "이전 대화가 더 이상 없습니다(삭제되었거나 만료됨). 다시 보내면 새 대화가 시작됩니다.",
  "error.supportInvalid": "보내지 못했습니다. 메시지(1~1,000자) 또는 이메일 주소를 확인하세요.",
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib every_error_code 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 2 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/i18n 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  2 passed (2)`, `Tests  66 passed (66)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 775 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/errors.rs src-tauri/src/diagnostics/mod.rs src/i18n/en.ts src/i18n/vi.ts src/i18n/ja.ts src/i18n/zh.ts src/i18n/ko.ts && git commit -m "feat(app): mã lỗi của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 6: Lõi chat (`chat.rs`) và server giả

**Files:**
- Create: `src-tauri/src/support/chat.rs`
- Modify: `src-tauri/src/support/mod.rs`, `src-tauri/src/test_support.rs`

Lõi không phụ thuộc Tauri (theo mẫu `diagnostics/reporter.rs`): `Host` cho giờ, trạng thái dịch, cửa sổ chính và sự kiện; `SupportApi` cho mạng; `Store` cho file. Không giữ khóa trong lúc gọi mạng: lấy token, nhả khóa, gọi, khóa lại và chỉ áp kết quả nếu cuộc chat vẫn là cuộc đó. `tick()` là một nhịp của luồng hỏi (quyết định 1); test chạy nó từng giây với đồng hồ giả và đếm các giây có hỏi server. `screen(true)` khi chưa có cuộc chat đặt `enabled` về chưa biết (hiện ô nhập) và không gọi mạng; tin đầu bị `503` thì `enabled = false`, báo giao diện, không lưu gì (quyết định 5).

Server giả `FakeSupportApi` (trong `test_support.rs`, dùng chung với test của Task 7 và Task 8) giữ một cuộc chat trong bộ nhớ như server thật: `id` tăng dần toàn server, `messages` trả tin có `id > after`, chủ dự án trả lời bằng `owner_reply`, lỗi đặt trước bằng `fail_next`.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất trong file):

```rust
use std::ops::ControlFlow;
```

và thay bằng:

```rust
use std::collections::VecDeque;
use std::ops::ControlFlow;
```

Trong `src-tauri/src/test_support.rs`, tìm đoạn (duy nhất trong file):

```rust
use crate::state::AppState;
```

và thay bằng:

```rust
use crate::state::AppState;
use crate::support::api::{ApiError, Batch, Opening, Sender, Started, SupportApi, SupportMessage};
```

Thêm vào **cuối** `src-tauri/src/test_support.rs` (sau dòng cuối cùng hiện có), nguyên văn:

```rust

// ---- Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design.md §4) ----

/// Trạng thái của server chat giả: một cuộc chat, tin đánh số tăng dần từ 1 trong toàn server (như `id` thật).
#[derive(Default)]
struct FakeSupportServer {
    disabled: bool,
    closed: bool,
    next_id: i64,
    messages: Vec<SupportMessage>,
    calls: Vec<String>,
    openings: Vec<Opening>,
    /// Lỗi trả cho các lần gọi kế tiếp, lần lượt (lần gọi vẫn được ghi lại).
    errors: VecDeque<ApiError>,
}

impl FakeSupportServer {
    /// Ghi lần gọi; còn lỗi đã đặt thì trả lỗi đó.
    fn call(&mut self, call: String) -> Result<(), ApiError> {
        self.calls.push(call);
        self.errors.pop_front().map_or(Ok(()), Err)
    }

    fn add(&mut self, sender: Sender, text: &str, at: i64) -> SupportMessage {
        self.next_id += 1;
        let message = SupportMessage {
            id: self.next_id,
            sender,
            text: text.to_string(),
            created_at: at,
        };
        self.messages.push(message.clone());
        message
    }
}

/// Server chat giả cho test, không ra mạng. Ghi mỗi lần gọi dạng `start`, `send`, `messages <after>`, `email <địa chỉ|null>`,
/// `delete`.
#[derive(Clone, Default)]
pub struct FakeSupportApi(Arc<Mutex<FakeSupportServer>>);

impl FakeSupportApi {
    /// Token server giả cấp cho mọi cuộc chat mới (43 ký tự base64url).
    pub const TOKEN: &'static str = "FakeSupportToken0123456789abcdefghijklmnopq";

    fn server(&self) -> std::sync::MutexGuard<'_, FakeSupportServer> {
        self.0.lock().unwrap()
    }

    pub fn calls(&self) -> Vec<String> {
        self.server().calls.clone()
    }

    /// Tin đầu tiên của từng cuộc chat đã tạo.
    pub fn openings(&self) -> Vec<Opening> {
        self.server().openings.clone()
    }

    /// Lần gọi kế tiếp (chưa dùng lỗi nào đã đặt) trả lỗi này.
    pub fn fail_next(&self, e: ApiError) {
        self.server().errors.push_back(e);
    }

    /// Chủ dự án trả lời lúc `at`.
    pub fn owner_reply(&self, text: &str, at: i64) {
        self.server().add(Sender::Owner, text, at);
    }

    /// Chat bật hay tắt (`/tat`), cuộc chat bị chặn hay không (`/chan`).
    pub fn set_server(&self, enabled: bool, closed: bool) {
        let mut server = self.server();
        server.disabled = !enabled;
        server.closed = closed;
    }
}

impl SupportApi for FakeSupportApi {
    fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
        let mut server = self.server();
        server.openings.push(opening.clone());
        server.call("start".into())?;
        server.messages.clear();
        let message = server.add(Sender::Customer, &opening.text, 0);
        Ok(Started {
            token: Self::TOKEN.into(),
            message,
        })
    }

    fn send(&self, _token: &str, text: &str) -> Result<SupportMessage, ApiError> {
        let mut server = self.server();
        server.call("send".into())?;
        Ok(server.add(Sender::Customer, text, 0))
    }

    fn messages(&self, _token: &str, after: i64) -> Result<Batch, ApiError> {
        let mut server = self.server();
        server.call(format!("messages {after}"))?;
        Ok(Batch {
            enabled: !server.disabled,
            status: if server.closed { "closed" } else { "open" }.into(),
            messages: server.messages.iter().filter(|m| m.id > after).cloned().collect(),
        })
    }

    fn set_email(&self, _token: &str, email: Option<&str>) -> Result<(), ApiError> {
        self.server().call(format!("email {}", email.unwrap_or("null")))
    }

    fn delete(&self, _token: &str) -> Result<(), ApiError> {
        let mut server = self.server();
        server.call("delete".into())?;
        server.messages.clear();
        Ok(())
    }
}
```

Trong `src-tauri/src/support/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod cadence;
pub mod context;
```

và thay bằng:

```rust
pub mod cadence;
pub mod chat;
pub mod context;
```

Tạo `src-tauri/src/support/chat.rs` với nội dung:

```rust
//! Lõi của chat hỗ trợ trong app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4): giữ cuộc chat đang có (token, tin đã biết,
//! chấm đỏ), gọi server qua [`SupportApi`], lưu `support.json` qua [`Store`], và quyết khi nào hỏi tin mới theo [`cadence`].
//! Không phụ thuộc Tauri: giờ, trạng thái dịch, cửa sổ chính và sự kiện cho giao diện đi qua [`Host`].
//!
//! Rust điều khiển nhịp hỏi: luồng nền gọi [`Chat::tick`] rồi ngủ theo kết quả ([`Chat::wait`]); lệnh của giao diện đánh thức
//! nó ([`Chat::wake`]). Giao diện không tự hẹn giờ, chỉ nhận [`SupportView`] (kết quả của lệnh, và sự kiện khi lần hỏi nền có
//! gì mới). Không giữ khóa trong lúc gọi mạng: lấy token, nhả khóa, gọi, rồi khóa lại và chỉ áp kết quả nếu cuộc chat vẫn là
//! cuộc đó (người dùng có thể xóa cuộc chat giữa chừng).

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

    use super::*;
    use crate::test_support::FakeSupportApi;

    const T: i64 = 1_800_000_000;

    /// App giả của lõi: đồng hồ, trạng thái dịch và cửa sổ do test đặt; giữ lại mọi lần báo giao diện.
    #[derive(Default)]
    struct FakeHost {
        now: AtomicI64,
        translating: AtomicBool,
        hidden: AtomicBool,
        changes: Mutex<Vec<SupportView>>,
    }

    impl Host for Arc<FakeHost> {
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
        fn translating(&self) -> bool {
            self.translating.load(Ordering::SeqCst)
        }
        fn window_visible(&self) -> bool {
            !self.hidden.load(Ordering::SeqCst)
        }
        fn changed(&self, view: &SupportView) {
            self.changes.lock().unwrap().push(view.clone());
        }
    }

    struct Rig {
        chat: Chat,
        host: Arc<FakeHost>,
        api: FakeSupportApi,
        path: PathBuf,
    }

    impl Rig {
        fn at(&self, now: i64) {
            self.host.now.store(now, Ordering::SeqCst);
        }
        /// Số lần hỏi tin (`messages <after>`) server giả đã nhận.
        fn polls(&self) -> usize {
            self.api.calls().iter().filter(|c| c.starts_with("messages")).count()
        }
        fn saved(&self) -> Saved {
            Store::new(self.path.clone()).load()
        }
    }

    fn rig(name: &str) -> Rig {
        let path = std::env::temp_dir()
            .join(format!("mt-support-chat-{name}-{}", std::process::id()))
            .join("support.json");
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        let host = Arc::new(FakeHost::default());
        host.now.store(T, Ordering::SeqCst);
        let api = FakeSupportApi::default();
        let chat = Chat::new(Box::new(host.clone()), Box::new(api.clone()), Store::new(path.clone()));
        Rig { chat, host, api, path }
    }

    fn first(context: Option<&str>) -> NewConversation {
        NewConversation {
            lang: "vi",
            source: "app-debug",
            context: context.map(String::from),
        }
    }

    /// Chạy luồng hỏi từ giờ hiện tại tới `until` (mỗi giây một nhịp), trả các giây có hỏi server (tính từ `T`).
    fn run_until(r: &Rig, until: i64) -> Vec<i64> {
        let mut at = Vec::new();
        let mut now = r.host.now.load(Ordering::SeqCst);
        while now <= until {
            r.at(now);
            let before = r.polls();
            r.chat.tick();
            if r.polls() > before {
                at.push(now - T);
            }
            now += 1;
        }
        at
    }

    /// Chưa từng nhắn: mở màn hình (như `open()` của giao diện: `support_screen`, rồi `support_fetch`) và để luồng hỏi chạy 5 phút
    /// cũng không có request nào.
    #[test]
    fn without_a_conversation_nothing_connects_even_with_the_screen_open() {
        let r = rig("idle");
        assert_eq!(r.chat.tick(), None);
        r.chat.screen(true);
        assert_eq!(run_until(&r, T + 300), Vec::<i64>::new());
        assert!(!r.chat.fetch().unwrap().has_conversation);
        assert!(r.api.calls().is_empty(), "không gọi mạng: {:?}", r.api.calls());
        assert!(!r.path.exists(), "không có file khi chưa có cuộc chat");
    }

    #[test]
    fn the_first_message_opens_a_conversation_and_later_ones_reuse_it() {
        let r = rig("send");
        let view = r
            .chat
            .send(
                "  Phụ đề không hiện\r\nkhi họp Teams\t ",
                &first(Some("AI Translator 0.2.4 · macOS 15.6")),
            )
            .unwrap();
        assert!(view.has_conversation);
        assert_eq!(view.messages.len(), 1);
        assert_eq!(view.messages[0].text, "Phụ đề không hiện\nkhi họp Teams");
        let openings = r.api.openings();
        assert_eq!(openings.len(), 1);
        assert_eq!(
            (openings[0].lang, openings[0].source, openings[0].context.as_deref()),
            ("vi", "app-debug", Some("AI Translator 0.2.4 · macOS 15.6"))
        );
        let saved = r.saved();
        assert_eq!(saved.token.as_deref(), Some(FakeSupportApi::TOKEN));
        assert_eq!(saved.waiting_since, Some(T), "đang chờ trả lời");
        r.at(T + 5);
        let view = r.chat.send("Thêm một câu", &first(Some("không dùng nữa"))).unwrap();
        assert_eq!(view.messages.len(), 2);
        assert_eq!(
            r.api.openings().len(),
            1,
            "tin sau không tạo cuộc mới, không gửi lại thông tin máy"
        );
        assert_eq!(r.api.calls(), ["start", "send"]);
        assert_eq!(r.saved().waiting_since, Some(T + 5));
    }

    #[test]
    fn text_and_email_are_checked_before_any_request() {
        let r = rig("validate");
        let invalid = |field: &str| ApiError::Invalid {
            status: 0,
            code: "invalid_request".into(),
            field: Some(field.into()),
        };
        assert_eq!(r.chat.send(" \n\t ", &first(None)), Err(invalid("text")));
        assert_eq!(r.chat.send(&"a".repeat(1001), &first(None)), Err(invalid("text")));
        assert!(r.api.calls().is_empty());
        assert_eq!(clean_text(&"ế".repeat(1000)).map(|t| t.chars().count()), Ok(1000));
        assert_eq!(clean_text("a\u{7}b\u{0}c"), Ok("abc".into()));
        r.chat.send("Chào", &first(None)).unwrap();
        assert_eq!(r.chat.set_email(Some("không phải email")), Err(invalid("email")));
        assert_eq!(clean_email(" Khach@Example.COM "), Ok("khach@example.com".into()));
        for bad in ["a@b", "a@.b", "a@b.", "@b.vn", "a b@c.vn", "a@b@c.vn", "a<b@c.vn"] {
            assert_eq!(clean_email(bad), Err(invalid("email")), "{bad}");
        }
        r.chat.set_email(Some("Khach@Example.com")).unwrap();
        r.chat.set_email(None).unwrap();
        assert_eq!(r.api.calls(), ["start", "email khach@example.com", "email null"]);
    }

    #[test]
    fn an_open_screen_polls_every_3_seconds_then_every_15_after_two_quiet_minutes() {
        let r = rig("fast");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        let at = run_until(&r, T + 200);
        let mut expected: Vec<i64> = (1..=39).map(|n| n * 3).collect();
        expected.extend([132, 147, 162, 177, 192]);
        assert_eq!(at, expected);
        assert_eq!(r.api.calls()[1], "messages 0", "lần hỏi đầu: con trỏ 0");
        assert!(
            r.api.calls().iter().skip(2).all(|c| c == "messages 1"),
            "sau đó: sau tin đã nhận"
        );
    }

    #[test]
    fn a_new_reply_brings_the_open_screen_back_to_3_seconds() {
        let r = rig("reply-fast");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        run_until(&r, T + 140);
        r.api.owner_reply("Chào bạn", T + 141);
        let at = run_until(&r, T + 175);
        // Lần hỏi 15 giây kế tiếp (147) nhận câu trả lời, rồi về 3 giây.
        assert_eq!(at, [147, 150, 153, 156, 159, 162, 165, 168, 171, 174]);
        let view = r.chat.view();
        assert_eq!(view.messages.last().map(|m| m.sender), Some(Sender::Owner));
        assert!(!view.unread, "đang xem màn hình thì không có chấm đỏ");
        assert_eq!(r.saved().waiting_since, None, "đã có trả lời");
    }

    #[test]
    fn waiting_for_a_reply_polls_every_minute_and_stops_while_translating() {
        let r = rig("waiting");
        r.chat.send("Chào", &first(None)).unwrap();
        assert_eq!(run_until(&r, T + 130), [60, 120]);
        r.host.translating.store(true, Ordering::SeqCst);
        assert_eq!(run_until(&r, T + 400), Vec::<i64>::new(), "đang dịch: không hỏi");
        r.host.translating.store(false, Ordering::SeqCst);
        assert_eq!(run_until(&r, T + 470), [400, 460]);
    }

    #[test]
    fn a_reply_while_the_screen_is_closed_lights_the_red_dot_until_the_screen_opens() {
        let r = rig("unread");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.owner_reply("Chào bạn", T + 10);
        assert_eq!(run_until(&r, T + 60), [60]);
        let changed = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(changed.unread, "báo giao diện có chấm đỏ");
        assert_eq!(changed.messages.len(), 2);
        assert!(r.saved().unread, "chấm đỏ còn sau khi mở lại app");
        assert_eq!(r.saved().waiting_since, None);
        assert_eq!(
            run_until(&r, T + 400),
            Vec::<i64>::new(),
            "hết chờ trả lời, màn hình đóng: không hỏi nữa"
        );
        let view = r.chat.screen(true);
        assert!(!view.unread);
        assert!(!r.saved().unread);
    }

    #[test]
    fn a_hidden_window_does_not_count_as_watching_the_screen() {
        let r = rig("hidden");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.host.hidden.store(true, Ordering::SeqCst);
        // Cửa sổ ẩn mà đang chờ trả lời: như màn hình đóng, 60 giây.
        assert_eq!(run_until(&r, T + 61), [60]);
        r.api.owner_reply("Chào bạn", T + 62);
        assert_eq!(run_until(&r, T + 120), [120]);
        assert!(r.chat.view().unread, "cửa sổ ẩn: chưa ai thấy câu trả lời");
        r.host.hidden.store(false, Ordering::SeqCst);
        r.chat.tick();
        assert!(
            !r.chat.view().unread,
            "cửa sổ hiện lại đúng màn hình Hỗ trợ: bỏ chấm đỏ"
        );
    }

    #[test]
    fn a_rate_limit_waits_retry_after_and_network_errors_back_off() {
        let r = rig("backoff");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.api.fail_next(ApiError::RateLimited(30));
        assert_eq!(run_until(&r, T + 40), [3, 33, 36, 39]);
        r.api.fail_next(ApiError::Network("x".into()));
        r.api.fail_next(ApiError::Network("x".into()));
        r.api.fail_next(ApiError::Network("x".into()));
        // 42 lỗi (chờ 3), 45 lỗi (chờ 15), 60 lỗi (chờ 60), 120 thành công; đã 2 phút không có tin mới nên tiếp theo là 15 giây.
        assert_eq!(run_until(&r, T + 136), [42, 45, 60, 120, 135]);
    }

    #[test]
    fn a_conversation_gone_from_the_server_is_forgotten() {
        let r = rig("gone");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.api.fail_next(ApiError::InvalidToken);
        assert_eq!(run_until(&r, T + 3), [3]);
        let view = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(!view.has_conversation && view.messages.is_empty());
        assert!(!r.path.exists(), "bỏ support.json");
        assert_eq!(
            run_until(&r, T + 100),
            Vec::<i64>::new(),
            "không còn cuộc chat: không hỏi nữa"
        );
    }

    #[test]
    fn sending_into_a_deleted_conversation_forgets_it_and_reports_the_error() {
        let r = rig("send-gone");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::InvalidToken);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::InvalidToken));
        assert!(!r.chat.view().has_conversation);
        assert!(
            !r.host.changes.lock().unwrap().last().unwrap().has_conversation,
            "giao diện biết để hiện lại ô thông tin máy"
        );
        let view = r.chat.send("Còn đó không?", &first(Some("máy"))).unwrap();
        assert!(view.has_conversation);
        assert_eq!(r.api.openings().len(), 2, "gửi lại là tin đầu của cuộc mới");
    }

    #[test]
    fn opening_the_screen_reloads_the_whole_conversation() {
        let r = rig("fetch");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.owner_reply("Chào bạn", T + 1);
        // Mở lại app: trong bộ nhớ chưa có tin nào.
        let reopened = Chat::new(
            Box::new(r.host.clone()),
            Box::new(r.api.clone()),
            Store::new(r.path.clone()),
        );
        assert!(reopened.view().messages.is_empty());
        let view = reopened.fetch().unwrap();
        assert_eq!(view.messages.len(), 2);
        assert_eq!(r.api.calls().last().map(String::as_str), Some("messages 0"));
        assert_eq!(Store::new(r.path.clone()).load().last_id, 2);
        r.api.set_server(false, true);
        let view = reopened.fetch().unwrap();
        assert!(!view.enabled && view.closed, "chat tắt, cuộc chat bị chặn");
    }

    #[test]
    fn a_disabled_chat_or_a_closed_conversation_shows_up_after_a_failed_send() {
        let r = rig("modes");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::Disabled);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::Disabled));
        assert!(!r.chat.view().enabled);
        r.api.fail_next(ApiError::Closed);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::Closed));
        assert!(r.chat.view().closed);
        assert!(r.chat.view().has_conversation, "lịch sử cũ vẫn còn");
    }

    /// Chưa từng nhắn thì không hỏi server chat có bật không; tin đầu nhận `503` thì màn hình chuyển sang dòng chat tắt, không lưu
    /// gì; mở lại màn hình thì hiện lại ô nhập (vẫn không gọi mạng) để gửi lại.
    #[test]
    fn a_first_message_into_a_disabled_chat_shows_the_disabled_line_and_saves_nothing() {
        let r = rig("disabled-first");
        assert!(r.chat.screen(true).enabled, "chưa biết: hiện ô nhập");
        r.api.fail_next(ApiError::Disabled);
        assert_eq!(r.chat.send("Chào", &first(Some("máy"))), Err(ApiError::Disabled));
        let changed = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(
            !changed.enabled && !changed.has_conversation,
            "giao diện chuyển sang dòng chat tắt"
        );
        assert!(!r.path.exists(), "không có token nên không có support.json");
        r.chat.screen(false);
        assert!(r.chat.screen(true).enabled, "mở lại: hiện ô nhập để gửi lại");
        assert!(!r.chat.fetch().unwrap().has_conversation);
        assert_eq!(r.api.calls(), ["start"], "chỉ lần gửi chạm server");
    }

    #[test]
    fn deleting_removes_the_conversation_everywhere() {
        let r = rig("delete");
        r.chat.send("Chào", &first(None)).unwrap();
        let view = r.chat.delete().unwrap();
        assert!(!view.has_conversation && view.messages.is_empty());
        assert!(!r.path.exists());
        assert_eq!(r.api.calls(), ["start", "delete"]);
        // Server đã xóa trước (hết 90 ngày): vẫn coi như xóa xong.
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::InvalidToken);
        assert!(!r.chat.delete().unwrap().has_conversation);
        // Lỗi mạng: giữ cuộc chat.
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::Network("x".into()));
        assert!(r.chat.delete().is_err());
        assert!(r.chat.view().has_conversation);
        // Chưa có cuộc chat: không gọi mạng.
        let r = rig("delete-empty");
        assert!(!r.chat.delete().unwrap().has_conversation);
        assert!(r.api.calls().is_empty());
    }

    #[test]
    fn every_change_raises_the_revision() {
        let r = rig("rev");
        let a = r.chat.screen(true).rev;
        let b = r.chat.send("Chào", &first(None)).unwrap().rev;
        let c = r.chat.screen(false).rev;
        assert!(a < b && b < c, "{a} {b} {c}");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::chat 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`) trong `support/chat.rs`: chưa có `Chat`, `Host`, `SupportView`, `NewConversation`, `clean_text`, `clean_email`, `Store`, `Saved`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/chat.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;

use super::api::{ApiError, Opening, Sender, SupportApi, SupportMessage};
use super::cadence::{self, Inputs, Next};
use super::store::{Saved, Store, token_ok};

/// Số ký tự tối đa của một tin, đếm theo code point (như `Array.from` của server).
pub const MAX_TEXT_CHARS: usize = 1000;
/// Độ dài tối đa của email (như `parseEmail` của server).
pub const MAX_EMAIL_CHARS: usize = 254;
/// Số tin giữ trong bộ nhớ: server trả tối đa 200 tin mỗi lần.
const MAX_MESSAGES: usize = 200;
/// Sau `429` khi hỏi tin, chờ tối đa chừng này giây dù server bảo lâu hơn (lệnh của giao diện vẫn đánh thức sớm được).
const MAX_POLL_WAIT_SECS: u64 = 3600;

/// Những gì lõi cần biết về app, đọc mỗi lần dùng.
pub trait Host: Send + Sync {
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
    /// Có phiên dịch đang bắt đầu hay chạy.
    fn translating(&self) -> bool;
    /// Cửa sổ chính đang hiện (không ẩn xuống khay, không thu nhỏ).
    fn window_visible(&self) -> bool;
    /// Trạng thái vừa đổi ngoài kết quả của một lệnh (lần hỏi nền có tin mới, chấm đỏ, chat tắt, cuộc chat không còn): báo
    /// giao diện.
    fn changed(&self, view: &SupportView);
}

/// Trạng thái chat mà giao diện vẽ (kết quả của các lệnh `support_*` và sự kiện `support://view`). Không có token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportView {
    /// Chat đang bật trên server. Chưa biết (chưa có cuộc chat: app không hỏi server khi chưa nhắn) thì `true`, để hiện ô nhập.
    pub enabled: bool,
    /// Chủ dự án đã chặn cuộc chat này.
    pub closed: bool,
    /// Đã có cuộc chat: ô "Gửi kèm thông tin máy" chỉ hiện khi chưa có.
    pub has_conversation: bool,
    /// Các tin đã biết, `id` tăng dần.
    pub messages: Vec<SupportMessage>,
    /// Có câu trả lời mới chưa xem: chấm đỏ ở mục Hỗ trợ.
    pub unread: bool,
    /// Tăng mỗi lần trạng thái đổi: giao diện bỏ bản có `rev` nhỏ hơn bản đang có.
    pub rev: u64,
}

/// Tin đầu tiên của một cuộc chat mới cần thêm gì (nơi gọi biết ngôn ngữ giao diện, bản build và thông tin máy).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewConversation {
    pub lang: &'static str,
    pub source: &'static str,
    pub context: Option<String>,
}

fn invalid(field: &str) -> ApiError {
    ApiError::Invalid {
        status: 0,
        code: "invalid_request".into(),
        field: Some(field.into()),
    }
}

/// Chữ của một tin theo luật của hợp đồng: `\r\n`, `\r` thành `\n`; bỏ ký tự điều khiển trừ `\n` (tab thành dấu cách); bỏ khoảng
/// trắng hai đầu; còn 1–1000 ký tự.
pub fn clean_text(text: &str) -> Result<String, ApiError> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let kept: String = normalized
        .chars()
        .filter_map(|c| match c {
            '\n' => Some('\n'),
            '\t' => Some(' '),
            c if c.is_control() => None,
            c => Some(c),
        })
        .collect();
    let kept = kept.trim();
    let count = kept.chars().count();
    if count == 0 || count > MAX_TEXT_CHARS {
        return Err(invalid("text"));
    }
    Ok(kept.to_string())
}

/// Email theo dạng của `parseEmail` ở server: bỏ khoảng trắng hai đầu, chữ thường, tối đa 254 ký tự, một `@`, sau `@` có dấu chấm
/// không ở đầu hay cuối, không có khoảng trắng hay `<>()[]\,;:"`.
pub fn clean_email(email: &str) -> Result<String, ApiError> {
    let email = email.trim().to_lowercase();
    let bad = |c: char| c.is_whitespace() || "@<>()[]\\,;:\"".contains(c);
    let ok = email.chars().count() <= MAX_EMAIL_CHARS
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && !local.chars().any(bad)
                && !domain.chars().any(bad)
                && domain
                    .char_indices()
                    .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
        });
    if ok { Ok(email) } else { Err(invalid("email")) }
}

fn seconds(secs: i64) -> Duration {
    Duration::from_secs(u64::try_from(secs).unwrap_or(0).max(1))
}

struct Inner {
    saved: Saved,
    enabled: bool,
    closed: bool,
    messages: Vec<SupportMessage>,
    /// Màn hình Hỗ trợ đang mở (giao diện báo qua `support_screen`).
    screen_open: bool,
    /// Lần cuối có tin mới, khách gửi tin hay mở màn hình (giây): mốc của luật "2 phút không có tin mới".
    active_at: i64,
    /// Lần hỏi server gần nhất, thành công hay không (giây).
    polled_at: i64,
    /// Không hỏi lại trước lúc này (giây): sau `429` hay lỗi mạng.
    not_before: i64,
    /// Số lần lỗi mạng liền khi hỏi tin.
    failures: u32,
    rev: u64,
    /// Tăng mỗi lần một lệnh đánh thức luồng hỏi.
    wakes: u64,
}

impl Inner {
    fn view(&self) -> SupportView {
        SupportView {
            enabled: self.enabled,
            closed: self.closed,
            has_conversation: self.saved.token.is_some(),
            messages: self.messages.clone(),
            unread: self.saved.unread,
            rev: self.rev,
        }
    }

    /// Có thay đổi: tăng `rev` và trả bản chụp (báo giao diện sau khi nhả khóa).
    fn bump(&mut self) -> SupportView {
        self.rev += 1;
        self.view()
    }

    /// Thêm các tin chưa có (theo `id`), giữ `id` tăng dần và tối đa [`MAX_MESSAGES`] tin mới nhất. Trả các tin vừa thêm.
    fn merge(&mut self, incoming: Vec<SupportMessage>) -> Vec<SupportMessage> {
        let mut added = Vec::new();
        for m in incoming {
            if !self.messages.iter().any(|known| known.id == m.id) {
                added.push(m.clone());
                self.messages.push(m);
            }
        }
        if !added.is_empty() {
            self.messages.sort_by_key(|m| m.id);
            let extra = self.messages.len().saturating_sub(MAX_MESSAGES);
            self.messages.drain(..extra);
        }
        added
    }

    /// Tin cuối là của chủ dự án thì hết chờ trả lời.
    fn settle_waiting(&mut self) {
        if self.messages.last().is_some_and(|m| m.sender == Sender::Owner) {
            self.saved.waiting_since = None;
        }
    }

    /// Bỏ cuộc chat hiện tại (đã xóa, hay server không còn nó).
    fn forget(&mut self) {
        self.saved = Saved::default();
        self.messages.clear();
        self.closed = false;
        self.failures = 0;
        self.not_before = 0;
    }

    fn is(&self, token: &str) -> bool {
        self.saved.token.as_deref() == Some(token)
    }

    /// Ghi nhận lỗi của một lần hỏi: giãn nhịp sau `429` và lỗi mạng; chat tắt hay cuộc chat bị chặn thì đổi trạng thái. Trả
    /// `true` nếu trạng thái hiện cho giao diện đã đổi.
    fn note_poll_error(&mut self, e: &ApiError, now: i64) -> bool {
        match e {
            ApiError::RateLimited(wait) | ApiError::Busy(wait) => {
                self.not_before = now + i64::try_from((*wait).min(MAX_POLL_WAIT_SECS)).unwrap_or(0);
                false
            }
            ApiError::Network(_) | ApiError::NotConfigured => {
                self.failures += 1;
                self.not_before = now + cadence::network_backoff(self.failures);
                false
            }
            ApiError::Disabled => !std::mem::replace(&mut self.enabled, false),
            ApiError::Closed => !std::mem::replace(&mut self.closed, true),
            ApiError::InvalidToken | ApiError::Invalid { .. } => false,
        }
    }
}

pub struct Chat {
    host: Box<dyn Host>,
    api: Box<dyn SupportApi>,
    store: Store,
    inner: Mutex<Inner>,
    wake: Condvar,
}

impl Chat {
    pub fn new(host: Box<dyn Host>, api: Box<dyn SupportApi>, store: Store) -> Self {
        let now = host.now();
        let saved = store.load();
        Self {
            host,
            api,
            store,
            inner: Mutex::new(Inner {
                saved,
                enabled: true,
                closed: false,
                messages: Vec::new(),
                screen_open: false,
                active_at: now,
                // Lần hỏi đầu tiên của nhịp chờ trả lời là một nhịp sau khi mở app, không phải ngay lúc mở.
                polled_at: now,
                not_before: 0,
                failures: 0,
                rev: 0,
                wakes: 0,
            }),
            wake: Condvar::new(),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ghi `support.json`; lỗi chỉ ghi log (cuộc chat vẫn dùng được trong lần mở này).
    fn persist(&self, inner: &Inner) {
        if let Err(e) = self.store.save(&inner.saved) {
            log::warn!("không ghi được support.json: {e}");
        }
    }

    pub fn view(&self) -> SupportView {
        self.lock().view()
    }

    pub fn has_conversation(&self) -> bool {
        self.lock().saved.token.is_some()
    }

    /// Đánh thức luồng hỏi để nó xét lại ngay (màn hình vừa mở, vừa gửi tin, vừa xóa cuộc chat).
    pub fn wake(&self) {
        self.lock().wakes += 1;
        self.wake.notify_all();
    }

    /// Ngủ tới hết `timeout` (`None`: tới khi bị đánh thức) hay tới khi có lệnh đánh thức.
    pub fn wait(&self, timeout: Option<Duration>) {
        let inner = self.lock();
        let seen = inner.wakes;
        if let Some(timeout) = timeout {
            let _woken = self.wake.wait_timeout_while(inner, timeout, |i| i.wakes == seen);
        } else {
            let _woken = self.wake.wait_while(inner, |i| i.wakes == seen);
        }
    }

    /// Màn hình Hỗ trợ mở hay đóng. Mở thì bỏ chấm đỏ và về nhịp 3 giây. Không gọi mạng, kể cả khi chưa có cuộc chat.
    pub fn screen(&self, open: bool) -> SupportView {
        let now = self.host.now();
        let view = {
            let mut inner = self.lock();
            inner.screen_open = open;
            if open {
                inner.active_at = now;
                if inner.saved.token.is_none() {
                    // Chưa có cuộc chat: không hỏi server chat có bật không (chưa nhắn thì không kết nối), coi như chưa biết và
                    // hiện ô nhập. Tin đầu bị `503` lần trước thì lần mở này cho gửi lại.
                    inner.enabled = true;
                    inner.closed = false;
                }
                if inner.saved.unread {
                    inner.saved.unread = false;
                    self.persist(&inner);
                }
            }
            inner.bump()
        };
        self.wake();
        view
    }

    /// Lấy lại toàn bộ cuộc chat (`after=0`) khi mở màn hình. Chưa có cuộc chat thì không gọi mạng. Server không còn cuộc chat
    /// (`401`) thì bỏ bản lưu và trả trạng thái mới, không phải lỗi.
    pub fn fetch(&self) -> Result<SupportView, ApiError> {
        let Some(token) = self.lock().saved.token.clone() else {
            return Ok(self.view());
        };
        let now = self.host.now();
        let result = self.api.messages(&token, 0);
        let mut inner = self.lock();
        if !inner.is(&token) {
            return Ok(inner.view());
        }
        inner.polled_at = now;
        match result {
            Ok(batch) => {
                inner.failures = 0;
                inner.not_before = 0;
                inner.enabled = batch.enabled;
                inner.closed = batch.status == "closed";
                inner.messages.clear();
                if let Some(max) = batch.messages.iter().map(|m| m.id).max() {
                    inner.saved.last_id = inner.saved.last_id.max(max);
                }
                inner.merge(batch.messages);
                inner.settle_waiting();
                self.persist(&inner);
                Ok(inner.bump())
            }
            Err(ApiError::InvalidToken) => {
                inner.forget();
                self.persist(&inner);
                Ok(inner.bump())
            }
            Err(e) => {
                inner.note_poll_error(&e, now);
                Err(e)
            }
        }
    }

    /// Gửi một tin. Chưa có cuộc chat thì tạo cuộc mới bằng `first` (ngôn ngữ, nguồn, thông tin máy nếu khách để tích); đã có thì
    /// chỉ gửi chữ. Trả trạng thái mới, đã có tin vừa gửi.
    pub fn send(&self, text: &str, first: &NewConversation) -> Result<SupportView, ApiError> {
        let text = clean_text(text)?;
        let token = self.lock().saved.token.clone();
        let now = self.host.now();
        let result = match &token {
            Some(token) => self.api.send(token, &text).map(|message| (None, message)),
            None => {
                let opening = Opening {
                    text: text.clone(),
                    lang: first.lang,
                    source: first.source,
                    context: first.context.clone(),
                };
                match self.api.start(&opening) {
                    Ok(started) if token_ok(&started.token) => Ok((Some(started.token), started.message)),
                    Ok(_) => Err(ApiError::Network("token sai dạng".into())),
                    Err(e) => Err(e),
                }
            }
        };
        let (new_token, message) = match result {
            Ok(sent) => sent,
            Err(e) => {
                self.after_error(token.as_deref(), &e);
                return Err(e);
            }
        };
        let view = {
            let mut inner = self.lock();
            if let Some(new_token) = new_token {
                inner.forget();
                inner.saved.token = Some(new_token);
            } else if inner.saved.token != token {
                // Cuộc chat bị xóa trong lúc gửi: không còn cuộc nào để hiện tin này.
                return Ok(inner.view());
            }
            inner.merge(vec![message]);
            inner.saved.waiting_since = Some(now);
            inner.active_at = now;
            inner.enabled = true;
            inner.closed = false;
            self.persist(&inner);
            inner.bump()
        };
        self.wake();
        Ok(view)
    }

    /// Để lại email (hay `None` để bỏ) cho cuộc chat hiện tại.
    pub fn set_email(&self, email: Option<&str>) -> Result<(), ApiError> {
        let email = email.map(clean_email).transpose()?;
        let Some(token) = self.lock().saved.token.clone() else {
            return Err(ApiError::InvalidToken);
        };
        let result = self.api.set_email(&token, email.as_deref());
        if let Err(e) = &result {
            self.after_error(Some(&token), e);
        }
        result
    }

    /// Xóa cuộc chat trên server rồi bỏ bản lưu. Server đã không còn cuộc chat (`401`) cũng coi như xóa xong.
    pub fn delete(&self) -> Result<SupportView, ApiError> {
        let token = self.lock().saved.token.clone();
        if let Some(token) = &token {
            match self.api.delete(token) {
                Ok(()) | Err(ApiError::InvalidToken) => {}
                Err(e) => return Err(e),
            }
        }
        let view = {
            let mut inner = self.lock();
            inner.forget();
            self.persist(&inner);
            inner.bump()
        };
        self.wake();
        Ok(view)
    }

    /// Lỗi của một lệnh làm đổi trạng thái (cuộc chat không còn, bị chặn, chat tắt): áp vào và báo giao diện, vì lệnh trả lỗi chứ
    /// không trả trạng thái.
    fn after_error(&self, token: Option<&str>, e: &ApiError) {
        let view = {
            let mut inner = self.lock();
            if inner.saved.token.as_deref() != token {
                return;
            }
            match e {
                ApiError::InvalidToken if token.is_some() => {
                    inner.forget();
                    self.persist(&inner);
                }
                ApiError::Disabled => inner.enabled = false,
                ApiError::Closed => inner.closed = true,
                _ => return,
            }
            inner.bump()
        };
        self.host.changed(&view);
    }

    /// Một nhịp của luồng hỏi: hỏi server nếu tới hạn; trả thời gian ngủ trước nhịp sau (`None`: ngủ tới khi bị đánh thức).
    pub fn tick(&self) -> Option<Duration> {
        let now = self.host.now();
        let translating = self.host.translating();
        let window_visible = self.host.window_visible();
        let (next, due, cleared) = {
            let mut inner = self.lock();
            // Màn hình đang mở và cửa sổ hiện lại sau khi có câu trả lời: người dùng đang thấy tin, bỏ chấm đỏ.
            let cleared = if inner.screen_open && window_visible && inner.saved.unread {
                inner.saved.unread = false;
                self.persist(&inner);
                Some(inner.bump())
            } else {
                None
            };
            let next = cadence::next(&Inputs {
                has_conversation: inner.saved.token.is_some(),
                screen_open: inner.screen_open,
                window_visible,
                translating,
                waiting_since: inner.saved.waiting_since,
                active_at: inner.active_at,
                now,
            });
            let due = match next {
                Next::Poll(every) => (inner.polled_at + every).max(inner.not_before),
                Next::Recheck(_) | Next::Idle => now,
            };
            (next, due, cleared)
        };
        if let Some(view) = cleared {
            self.host.changed(&view);
        }
        match next {
            Next::Idle => None,
            Next::Recheck(secs) => Some(seconds(secs)),
            Next::Poll(every) => {
                if now < due {
                    return Some(seconds(due - now));
                }
                self.poll(now, window_visible);
                Some(seconds(every))
            }
        }
    }

    /// Hỏi các tin sau con trỏ và áp kết quả. Không có gì mới thì không ghi file và không báo giao diện.
    fn poll(&self, now: i64, window_visible: bool) {
        let (token, after) = {
            let inner = self.lock();
            let Some(token) = inner.saved.token.clone() else {
                return;
            };
            (token, inner.saved.last_id)
        };
        let result = self.api.messages(&token, after);
        let view = {
            let mut inner = self.lock();
            if !inner.is(&token) {
                return;
            }
            inner.polled_at = now;
            match result {
                Ok(batch) => {
                    inner.failures = 0;
                    inner.not_before = 0;
                    let closed = batch.status == "closed";
                    let mut changed = inner.enabled != batch.enabled || inner.closed != closed;
                    inner.enabled = batch.enabled;
                    inner.closed = closed;
                    let mut dirty = false;
                    if let Some(max) = batch.messages.iter().map(|m| m.id).max()
                        && max > inner.saved.last_id
                    {
                        inner.saved.last_id = max;
                        dirty = true;
                    }
                    let added = inner.merge(batch.messages);
                    if !added.is_empty() {
                        changed = true;
                        inner.active_at = now;
                        let seen = inner.screen_open && window_visible;
                        if !seen && added.iter().any(|m| m.sender == Sender::Owner) {
                            inner.saved.unread = true;
                        }
                        inner.settle_waiting();
                    }
                    if dirty || changed {
                        self.persist(&inner);
                    }
                    if !changed {
                        return;
                    }
                    inner.bump()
                }
                Err(ApiError::InvalidToken) => {
                    inner.forget();
                    self.persist(&inner);
                    inner.bump()
                }
                Err(e) => {
                    // Lỗi không bao giờ kèm URL, token hay nội dung tin (`api.rs`).
                    log::info!("hỏi tin hỗ trợ lỗi: {e}");
                    if !inner.note_poll_error(&e, now) {
                        return;
                    }
                    inner.bump()
                }
            }
        };
        self.host.changed(&view);
    }
}

```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::chat 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 16 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 791 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/support/chat.rs src-tauri/src/test_support.rs && git commit -m "feat(app): lõi chat hỗ trợ và nhịp hỏi tin" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 7: Ghép với app (`support/mod.rs`, sự kiện, `setup`)

**Files:**
- Modify: `src-tauri/src/support/mod.rs`, `src-tauri/src/events.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/test_support.rs`

`AppHost` đọc trạng thái phiên (`Starting`, `Running` là đang dịch), cửa sổ chính (`is_visible && !is_minimized`) và phát `support://view` chỉ tới cửa sổ chính. `install` (gọi trong `setup`, sau `diagnostics::install`) đọc `support.json` và chạy luồng hỏi; chưa từng dùng chat thì luồng chỉ ngủ. Nguồn là `app-debug` ở bản debug. Việc của các lệnh map `ApiError` sang mã lỗi giao diện. Test chặn dòng thông tin máy chứa email, mã máy (cả dạng băm), tên máy, tên người dùng; test khóa việc mở màn hình khi chưa có cuộc chat không tạo request nào.

- [ ] **Step 1: Viết test trước (đỏ)**

Thêm vào **cuối** `src-tauri/src/support/mod.rs` (sau dòng cuối cùng hiện có), nguyên văn:

```rust

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::device;
    use crate::test_support::{install_support, mock_app, window};

    #[test]
    fn a_debug_build_marks_its_messages() {
        assert_eq!(source(), if cfg!(debug_assertions) { "app-debug" } else { "app" });
    }

    #[test]
    fn server_errors_map_to_the_ui_codes() {
        let code = |e: ApiError| command_error(&e).code;
        assert_eq!(code(ApiError::Network("x".into())), "supportOffline");
        assert_eq!(code(ApiError::NotConfigured), "supportOffline");
        assert_eq!(code(ApiError::RateLimited(15)), "supportRateLimited");
        assert_eq!(code(ApiError::Busy(15)), "supportBusy");
        assert_eq!(code(ApiError::Disabled), "supportDisabled");
        assert_eq!(code(ApiError::Closed), "supportClosed");
        assert_eq!(code(ApiError::InvalidToken), "supportExpired");
        let e = command_error(&ApiError::Invalid {
            status: 0,
            code: "invalid_request".into(),
            field: Some("email".into()),
        });
        assert_eq!((e.code.as_str(), e.field.as_deref()), ("supportInvalid", Some("email")));
    }

    #[test]
    fn the_host_follows_the_session_and_the_main_window() {
        let app = mock_app();
        let host = AppHost {
            app: app.handle().clone(),
        };
        assert!(!host.window_visible(), "chưa có cửa sổ chính");
        window(&app, "main");
        assert!(host.window_visible());
        for (session, translating) in [
            (SessionStatus::Idle, false),
            (SessionStatus::Error, false),
            (SessionStatus::Starting, true),
            (SessionStatus::Running, true),
        ] {
            app.state::<AppState>().update_status(|s| s.session = session);
            assert_eq!(host.translating(), translating, "{session:?}");
        }
    }

    /// Spec §4: dòng thông tin máy không bao giờ có key, email của license, mã máy, tên máy hay tên người dùng.
    #[test]
    fn the_machine_line_never_carries_identity() {
        let app = mock_app();
        let line = machine_line(app.handle());
        let version = app.package_info().version.to_string();
        assert!(
            line.starts_with(&format!("{} {version} · ", app.package_info().name)),
            "{line}"
        );
        assert!(line.ends_with(" · UI vi"), "{line}");
        assert!(line.chars().count() <= context::MAX_CHARS);
        assert!(!line.contains('@'), "không có email: {line}");
        if let Ok(id) = device::hardware_id() {
            assert!(
                !line.contains(&id) && !line.contains(&device::hash_id(&id)),
                "không có mã máy: {line}"
            );
        }
        if let Some(label) = device::label().filter(|l| l.chars().count() >= 6) {
            assert!(!line.contains(&label), "không có tên máy: {line}");
        }
        for var in ["USER", "USERNAME"] {
            if let Some(user) = std::env::var(var).ok().filter(|u| u.chars().count() >= 6) {
                assert!(!line.contains(&user), "không có tên người dùng: {line}");
            }
        }
    }

    /// Chưa từng nhắn: các lệnh mà màn hình Hỗ trợ gọi khi mở (`support_screen`, `support_fetch`, `support_machine_info`) không tạo
    /// request nào (kế hoạch 04: "chưa từng nhắn thì app không kết nối gì cho chat").
    #[test]
    fn opening_the_screen_without_a_conversation_makes_no_request() {
        let app = mock_app();
        let rig = install_support(&app);
        window(&app, "main");
        assert!(!screen(app.handle(), true).unwrap().has_conversation);
        assert!(!fetch(app.handle()).unwrap().has_conversation);
        machine_line(app.handle());
        screen(app.handle(), false).unwrap();
        assert!(rig.api.calls().is_empty(), "{:?}", rig.api.calls());
    }

    /// Lệnh gửi tin đầu tiên kèm đúng ngôn ngữ giao diện, nguồn của bản build, và dòng thông tin máy chỉ khi để tích.
    #[test]
    fn the_first_message_carries_the_ui_language_the_build_and_the_machine_line_only_when_ticked() {
        let app = mock_app();
        let rig = install_support(&app);
        send(app.handle(), "Chào", false).unwrap();
        let openings = rig.api.openings();
        assert_eq!((openings[0].lang, openings[0].source), ("vi", source()));
        assert_eq!(openings[0].context, None, "bỏ tích thì không gửi thông tin máy");
        delete(app.handle()).unwrap();
        send(app.handle(), "Chào", true).unwrap();
        assert_eq!(
            rig.api.openings()[1].context.as_deref(),
            Some(machine_line(app.handle()).as_str())
        );
        send(app.handle(), "Thêm", true).unwrap();
        assert_eq!(rig.api.openings().len(), 2, "tin sau không gửi lại thông tin máy");
    }
}
```

Thêm vào **cuối** `src-tauri/src/test_support.rs` (sau dòng cuối cùng hiện có), nguyên văn:

```rust

/// Chat hỗ trợ đã cài vào app giả: server giả của nó.
pub struct SupportRig {
    pub api: FakeSupportApi,
}

/// Cài chat hỗ trợ vào app giả (như `support::install` ở app thật) với server giả và `support.json` trong thư mục tạm riêng; không
/// có luồng hỏi nền.
pub fn install_support(app: &tauri::App<MockRuntime>) -> SupportRig {
    static DIRS: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "{APP_DIR_PREFIX}support-{}-{}",
        std::process::id(),
        DIRS.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    let api = FakeSupportApi::default();
    let chat = crate::support::chat_for_tests(app.handle(), Box::new(api.clone()), dir.join("support.json"));
    app.manage(chat);
    SupportRig { api }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::tests 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: biên dịch lỗi (`error[E04…]`): chưa có `support::chat_for_tests` (dùng ở `test_support::install_support`), `source`, `command_error`, `AppHost`, `machine_line`, `send`, `delete`.

- [ ] **Step 3: Mã tối thiểu**

Trong `src-tauri/src/support/mod.rs`, chèn đoạn sau ngay **trước** dòng `#[cfg(test)]` (duy nhất trong file):

```rust
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};

use self::api::{ApiError, HttpSupportApi};
use self::chat::{Chat, Host, NewConversation, SupportView};
use self::context::MachineFacts;
use self::store::Store;
use crate::errors::{self, CommandError};
use crate::models::service::ModelService;
use crate::settings::UiLanguage;
use crate::state::{AppState, SessionStatus};

/// Nguồn ghi trong cuộc chat. Bản debug cũng nối production (CLAUDE.md), nên ghi `app-debug` để chủ dự án nhận ra tin thử.
pub fn source() -> &'static str {
    if cfg!(debug_assertions) { "app-debug" } else { "app" }
}

/// Mã ngôn ngữ giao diện gửi kèm cuộc chat mới (`lang` của hợp đồng).
pub fn lang_code(lang: UiLanguage) -> &'static str {
    match lang {
        UiLanguage::En => "en",
        UiLanguage::Vi => "vi",
        UiLanguage::Ja => "ja",
        UiLanguage::Zh => "zh",
        UiLanguage::Ko => "ko",
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Những gì lõi cần biết về app, đọc từ trạng thái quản lý của Tauri mỗi lần dùng.
struct AppHost<R: Runtime> {
    app: AppHandle<R>,
}

impl<R: Runtime> Host for AppHost<R> {
    fn now(&self) -> i64 {
        unix_now()
    }

    /// Đang dịch: có phiên đang bắt đầu hay chạy (dừng phiên giữ `Running` tới khi câu cuối dịch xong).
    fn translating(&self) -> bool {
        self.app
            .try_state::<AppState>()
            .is_some_and(|state| matches!(state.status().session, SessionStatus::Starting | SessionStatus::Running))
    }

    /// Cửa sổ chính đang hiện: không ẩn xuống khay, không thu nhỏ. Chưa có cửa sổ thì coi như không hiện.
    fn window_visible(&self) -> bool {
        self.app
            .get_webview_window(crate::window::MAIN)
            .is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
    }

    fn changed(&self, view: &SupportView) {
        crate::events::support_view(&self.app, view);
    }
}

/// Cài chat hỗ trợ lúc khởi động (`setup`, sau khi đã có `AppState`): đọc `support.json` và chạy luồng hỏi nền. Chưa từng dùng chat
/// thì luồng chỉ ngủ, không kết nối gì.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let path = app.path().app_local_data_dir()?.join("support.json");
    let chat = Arc::new(Chat::new(
        Box::new(AppHost { app: app.clone() }),
        Box::new(HttpSupportApi::for_this_build()),
        Store::new(path),
    ));
    app.manage(Arc::clone(&chat));
    spawn_poller(chat);
    Ok(())
}

/// Luồng hỏi tin: mỗi nhịp hỏi server nếu tới hạn (`Chat::tick`), rồi ngủ tới nhịp sau hay tới khi một lệnh đánh thức.
fn spawn_poller(chat: Arc<Chat>) {
    std::thread::spawn(move || {
        loop {
            let wait = chat.tick();
            chat.wait(wait);
        }
    });
}

fn chat_of<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<Chat>, CommandError> {
    app.try_state::<Arc<Chat>>()
        .map(|chat| Arc::clone(&chat))
        .ok_or_else(|| CommandError::new(errors::SUPPORT_OFFLINE, None, "chưa cài chat hỗ trợ"))
}

/// Mã lỗi giao diện của một lỗi gọi server.
pub fn command_error(e: &ApiError) -> CommandError {
    let (code, field) = match e {
        ApiError::NotConfigured | ApiError::Network(_) => (errors::SUPPORT_OFFLINE, None),
        ApiError::RateLimited(_) => (errors::SUPPORT_RATE_LIMITED, None),
        ApiError::Busy(_) => (errors::SUPPORT_BUSY, None),
        ApiError::Disabled => (errors::SUPPORT_DISABLED, None),
        ApiError::Closed => (errors::SUPPORT_CLOSED, None),
        ApiError::InvalidToken => (errors::SUPPORT_EXPIRED, None),
        ApiError::Invalid { field, .. } => (errors::SUPPORT_INVALID, field.as_deref()),
    };
    CommandError::new(code, field, e.to_string())
}

/// Lệnh `support_screen`.
pub fn screen<R: Runtime>(app: &AppHandle<R>, open: bool) -> Result<SupportView, CommandError> {
    Ok(chat_of(app)?.screen(open))
}

/// Lệnh `support_fetch`.
pub fn fetch<R: Runtime>(app: &AppHandle<R>) -> Result<SupportView, CommandError> {
    chat_of(app)?.fetch().map_err(|e| command_error(&e))
}

/// Lệnh `support_send`. `with_machine_info`: ô "Gửi kèm thông tin máy" đang tích; chỉ có tác dụng ở tin đầu tiên của một cuộc chat.
pub fn send<R: Runtime>(app: &AppHandle<R>, text: &str, with_machine_info: bool) -> Result<SupportView, CommandError> {
    let chat = chat_of(app)?;
    let ui = app
        .try_state::<AppState>()
        .map_or(UiLanguage::En, |state| state.settings().ui_language);
    let first = NewConversation {
        lang: lang_code(ui),
        source: source(),
        context: (with_machine_info && !chat.has_conversation()).then(|| machine_line(app)),
    };
    chat.send(text, &first).map_err(|e| command_error(&e))
}

/// Lệnh `support_set_email`.
pub fn set_email<R: Runtime>(app: &AppHandle<R>, email: Option<&str>) -> Result<(), CommandError> {
    chat_of(app)?.set_email(email).map_err(|e| command_error(&e))
}

/// Lệnh `support_delete`.
pub fn delete<R: Runtime>(app: &AppHandle<R>) -> Result<SupportView, CommandError> {
    chat_of(app)?.delete().map_err(|e| command_error(&e))
}

/// Tên gói model theo ngôn ngữ giao diện (manifest có tên vi và en, như `localized` của giao diện); manifest không có gói này
/// thì mã gói.
fn pack_name<R: Runtime>(app: &AppHandle<R>, id: &str, ui: UiLanguage) -> String {
    app.try_state::<Arc<ModelService>>()
        .and_then(|models| models.manifest())
        .and_then(|signed| signed.manifest.packs.into_iter().find(|p| p.id == id))
        .map_or_else(
            || id.to_string(),
            |p| if ui == UiLanguage::Vi { p.name.vi } else { p.name.en },
        )
}

/// Đọc máy thật cho dòng thông tin máy. Chỉ đọc những thứ `MachineFacts` có chỗ.
fn machine_facts<R: Runtime>(app: &AppHandle<R>) -> MachineFacts {
    let settings = app.try_state::<AppState>().map(|state| state.settings());
    let ui = settings.as_ref().map_or(UiLanguage::En, |s| s.ui_language);
    let system = crate::diagnostics::machine::system_info();
    let probe = app
        .try_state::<crate::sidecar::GpuProbe>()
        .and_then(|probe| probe.get(Duration::ZERO));
    MachineFacts {
        app_name: app.package_info().name.clone(),
        app_version: app.package_info().version.to_string(),
        os_name: system.os_name,
        os_version: system.os_version,
        chip: system.chip,
        ram_bytes: crate::models::machine::total_ram_bytes(),
        gpus: context::gpu_names(probe.as_ref()),
        plan: crate::license::app::view(app).map(|view| view.plan),
        model_pack: settings
            .as_ref()
            .and_then(|s| s.model_tier.clone())
            .map(|id| pack_name(app, &id, ui)),
        ui_lang: lang_code(ui),
    }
}

/// Lệnh `support_machine_info`: dòng thông tin máy, để giao diện hiện nguyên văn cạnh ô tích.
pub fn machine_line<R: Runtime>(app: &AppHandle<R>) -> String {
    context::line(&machine_facts(app))
}

/// Dựng `Chat` cho app giả của test: app thật (trạng thái phiên, cửa sổ, sự kiện) nhưng server và file do test đưa vào, không có
/// luồng hỏi nền (test tự gọi `tick`).
#[cfg(test)]
pub fn chat_for_tests<R: Runtime>(
    app: &AppHandle<R>,
    api: Box<dyn api::SupportApi>,
    path: std::path::PathBuf,
) -> Arc<Chat> {
    Arc::new(Chat::new(Box::new(AppHost { app: app.clone() }), api, Store::new(path)))
}

```

Trong `src-tauri/src/events.rs`, tìm đoạn (duy nhất trong file):

```rust
pub const COMPOSE_DONE: &str = "compose://done";
```

và thay bằng:

```rust
pub const COMPOSE_DONE: &str = "compose://done";
/// Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4), chỉ gửi cho cửa sổ chính: trạng thái mới sau lần hỏi tin nền
/// (`support::chat::SupportView`, không có token).
pub const SUPPORT_VIEW: &str = "support://view";
```

Trong `src-tauri/src/events.rs`, tìm đoạn (duy nhất trong file):

```rust
use crate::state::{AppStatus, OverlayView};
```

và thay bằng:

```rust
use crate::state::{AppStatus, OverlayView};
use crate::support::chat::SupportView;
```

Trong `src-tauri/src/events.rs`, tìm đoạn (duy nhất trong file):

```rust
pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
```

và thay bằng:

```rust
pub fn support_view<R: Runtime>(app: &AppHandle<R>, view: &SupportView) {
    emit(app, window::MAIN, SUPPORT_VIEW, view);
}

pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
```

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất trong file):

```rust
    diagnostics::install(&handle)?;
```

và thay bằng:

```rust
    diagnostics::install(&handle)?;
    // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): đọc `support.json`, luồng hỏi tin chỉ kết nối khi đã dùng chat.
    support::install(&handle)?;
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib support::tests 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 6 passed; 0 failed; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 797 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/support/mod.rs src-tauri/src/events.rs src-tauri/src/lib.rs src-tauri/src/test_support.rs && git commit -m "feat(app): nối chat hỗ trợ vào app, luồng hỏi tin nền" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 8: Sáu lệnh IPC và ACL

**Files:**
- Modify: `src-tauri/src/acl_tests.rs`, `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`

Mỗi lệnh phải có ở bốn chỗ (đầu `commands.rs`): hàm `#[tauri::command]` và `handler()`, `MAIN_COMMANDS`, app manifest ở `build.rs`, quyền `allow-<tên-lệnh>` ở `capabilities/main.json`; `capabilities_grant_exactly_the_fixed_lists` giữ chúng khớp nhau. Lệnh gọi server là `async` chạy việc trên `spawn_blocking` (như `send_log_report`). Test mới: cửa sổ khác bị chặn và không tới server giả; cửa sổ chính gọi được cả sáu, tới đúng server giả, không lệnh nào trả token.

- [ ] **Step 1: Viết test trước (đỏ)**

Thêm vào **cuối** `src-tauri/src/acl_tests.rs` (sau dòng cuối cùng hiện có), nguyên văn:

```rust

/// Lệnh của chat hỗ trợ, theo thứ tự gọi thử ở test dưới (gửi trước khi lấy lại cuộc chat, xóa sau cùng).
const SUPPORT_COMMANDS: &[&str] = &[
    "support_screen",
    "support_send",
    "support_fetch",
    "support_set_email",
    "support_delete",
    "support_machine_info",
];

/// Spec 2026-10-22-chat-ho-tro-zalo §4: chỉ cửa sổ chính dùng được chat hỗ trợ. Lệnh bị chặn không tới server chat; lệnh được
/// phép tới đúng server giả (không ra mạng thật), và không lệnh nào trả token của cuộc chat.
#[test]
fn only_the_main_window_reaches_the_support_chat() {
    let app = mock_app();
    let rig = crate::test_support::install_support(&app);
    let args = |cmd: &str| match cmd {
        "support_screen" => json!({ "open": true }),
        "support_send" => json!({ "text": "Chào", "withMachineInfo": false }),
        "support_set_email" => json!({ "email": "khach@example.com" }),
        _ => json!({}),
    };
    for other in [
        window(&app, "overlay"),
        window(&app, "compose"),
        window(&app, "stranger"),
    ] {
        for cmd in SUPPORT_COMMANDS {
            let result = invoke(&other, cmd, args(cmd));
            assert!(denied(&result), "{} không được gọi {cmd}: {result:?}", other.label());
        }
    }
    assert!(rig.api.calls().is_empty(), "lệnh bị chặn không tới server chat");
    let main = window(&app, "main");
    for cmd in SUPPORT_COMMANDS {
        let result = invoke(&main, cmd, args(cmd)).unwrap_or_else(|e| panic!("main gọi được {cmd}: {e}"));
        assert!(
            !result.to_string().contains(crate::test_support::FakeSupportApi::TOKEN),
            "{cmd} không trả token"
        );
    }
    assert_eq!(
        rig.api.calls(),
        ["start", "messages 0", "email khach@example.com", "delete"]
    );
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib acl_tests::only_the_main_window_reaches_the_support_chat 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: FAILED. 0 passed; 1 failed`, kèm `panicked … main gọi được support_screen: "support_screen not allowed. …"` (lệnh chưa có trong app manifest và capability nên ACL chặn cả cửa sổ chính).

- [ ] **Step 3: Thêm lệnh**

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
```

và thay bằng:

```rust
use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
use crate::support::{self, chat::SupportView};
```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
    blocking(app, crate::diagnostics::send_manual).await
}

```

và thay bằng:

```rust
    blocking(app, crate::diagnostics::send_manual).await
}

// ---- Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): chỉ cửa sổ `main`. Lệnh gọi server chờ mạng tới 15 giây nên là `async`,
// chạy việc trên luồng của `spawn_blocking`; `support_screen` chỉ đọc bộ nhớ. Không lệnh nào trả token của cuộc chat. ----

/// Màn hình Hỗ trợ mở (`open: true`) hay đóng. Cửa sổ chính gọi với `false` lúc mở để có trạng thái ban đầu (chấm đỏ). Không gọi
/// mạng, kể cả khi chưa có cuộc chat.
#[tauri::command]
pub fn support_screen<R: Runtime>(app: AppHandle<R>, open: bool) -> Result<SupportView, CommandError> {
    support::screen(&app, open)
}

/// Lấy lại toàn bộ cuộc chat (`after=0`) lúc mở màn hình. Chưa có cuộc chat thì không gọi mạng.
#[tauri::command]
pub async fn support_fetch<R: Runtime>(app: AppHandle<R>) -> Result<SupportView, CommandError> {
    blocking(app, support::fetch).await
}

/// Gửi một tin. `with_machine_info`: ô "Gửi kèm thông tin máy" đang tích (chỉ có tác dụng ở tin đầu tiên của cuộc chat).
#[tauri::command]
pub async fn support_send<R: Runtime>(
    app: AppHandle<R>,
    text: String,
    with_machine_info: bool,
) -> Result<SupportView, CommandError> {
    blocking(app, move |app| support::send(app, &text, with_machine_info)).await
}

/// Để lại email (hay `null` để bỏ) cho cuộc chat hiện tại.
#[tauri::command]
pub async fn support_set_email<R: Runtime>(app: AppHandle<R>, email: Option<String>) -> Result<(), CommandError> {
    blocking(app, move |app| support::set_email(app, email.as_deref())).await
}

/// "Xóa cuộc trò chuyện": xóa trên server rồi bỏ `support.json`.
#[tauri::command]
pub async fn support_delete<R: Runtime>(app: AppHandle<R>) -> Result<SupportView, CommandError> {
    blocking(app, support::delete).await
}

/// Dòng thông tin máy gửi kèm tin đầu tiên, để giao diện hiện nguyên văn cạnh ô tích. Đọc trạng thái bản quyền và manifest model
/// nên chạy trên luồng của `spawn_blocking`.
#[tauri::command]
pub async fn support_machine_info<R: Runtime>(app: AppHandle<R>) -> Result<String, CommandError> {
    blocking(app, |app| Ok(support::machine_line(app))).await
}

```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
    "restart_to_update",
    "send_log_report",
];
```

và thay bằng:

```rust
    "restart_to_update",
    "send_log_report",
    "support_screen",
    "support_fetch",
    "support_send",
    "support_set_email",
    "support_delete",
    "support_machine_info",
];
```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
        send_log_report,
        get_overlay_view,
```

và thay bằng:

```rust
        send_log_report,
        support_screen,
        support_fetch,
        support_send,
        support_set_email,
        support_delete,
        support_machine_info,
        get_overlay_view,
```

Trong `src-tauri/build.rs`, tìm đoạn (duy nhất trong file):

```rust
                "send_log_report",
```

và thay bằng:

```rust
                "send_log_report",
                "support_screen",
                "support_fetch",
                "support_send",
                "support_set_email",
                "support_delete",
                "support_machine_info",
```

Trong `src-tauri/capabilities/main.json`, tìm đoạn (duy nhất trong file):

```json
    "allow-send-log-report",
```

và thay bằng:

```json
    "allow-send-log-report",
    "allow-support-screen",
    "allow-support-fetch",
    "allow-support-send",
    "allow-support-set-email",
    "allow-support-delete",
    "allow-support-machine-info",
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib acl_tests 2>&1 | grep -E "test result|panicked|^error" | head -20
```
Expected: `test result: ok. 5 passed; 0 failed; …` (4 test ACL có sẵn và test mới).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 798 passed; 0 failed; 6 ignored; …`

- [ ] **Step 5: Kiểm tra nhóm Rust**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E "^(error|warning)|Finished"
```
Expected: chỉ `Finished …` (cảnh báo `variable does not need to be mutable` của `third_party/whisper-rs-sys/build.rs` là lỗi có sẵn, không do kế hoạch này).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && sh scripts/check-windows.sh --locked 2>&1 | grep -E "^(error|warning)|Finished"
```
Expected: chỉ `Finished …`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src-tauri/src/acl_tests.rs src-tauri/src/commands.rs src-tauri/build.rs src-tauri/capabilities/main.json && git commit -m "feat(app): lệnh IPC và ACL của chat hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 9: Kiểu IPC và store của màn hình Hỗ trợ

**Files:**
- Create: `src/store/support.test.ts`, `src/store/support.ts`
- Modify: `src/lib/ipc.ts`

Store chỉ nhận `SupportView` (kết quả lệnh và sự kiện, bỏ bản có `rev` nhỏ hơn). Mở màn hình khi chưa có cuộc chat chỉ gọi `support_screen` và `support_machine_info` (không lệnh nào ra mạng); đã có thì thêm `support_fetch`. Store cộng các tin khách vừa bấm gửi mà server chưa nhận (`pending`: đang gửi hay lỗi, bấm để gửi lại đúng nội dung). Tin đầu tiên gửi kèm `withMachineInfo` theo ô tích; sau tin đầu tiên gửi thành công của một cuộc chat thì hiện thẻ email. "Đính kèm log" gọi đúng `send_log_report` có sẵn rồi gửi tin chứa mã báo cáo. `fakeIpc.ts` không cần đổi: nó nhận bảng lệnh theo kiểu `Commands`, mỗi test chỉ khai các lệnh nó dùng.

- [ ] **Step 1: Viết test trước (đỏ)**

Tạo `src/store/support.test.ts` với nội dung:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { CommandError, SupportMessage, SupportView } from "../lib/ipc";
import { createSupportStore } from "./support";

// Store của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4) với phía Rust giả: một cuộc chat trong bộ nhớ, `rev` tăng mỗi lần
// đổi như `support::chat::SupportView`.

const message = (id: number, sender: SupportMessage["sender"], text: string): SupportMessage => ({
  id,
  sender,
  text,
  createdAt: 1_800_000_000 + id,
});

function setup(initial: Partial<SupportView> = {}) {
  let view: SupportView = {
    enabled: true,
    closed: false,
    hasConversation: false,
    messages: [],
    unread: false,
    rev: 1,
    ...initial,
  };
  const change = (patch: Partial<SupportView>) => (view = { ...view, ...patch, rev: view.rev + 1 });
  // Lỗi mà lần `support_send` kế tiếp trả (lần lượt).
  const sendErrors: CommandError[] = [];
  let emailError: CommandError | null = null;
  let logError: CommandError | null = null;
  const fake = fakeIpc({
    support_screen: ({ open }) => change(open ? { unread: false } : {}),
    support_fetch: () => change({}),
    support_machine_info: () => "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi",
    support_send: ({ text }) => {
      const error = sendErrors.shift();
      if (error) throw error;
      return change({ hasConversation: true, messages: [...view.messages, message(view.messages.length + 1, "customer", text)] });
    },
    support_set_email: () => {
      if (emailError) throw emailError;
      return null;
    },
    support_delete: () => change({ hasConversation: false, messages: [], unread: false }),
    send_log_report: () => {
      if (logError) throw logError;
      return { id: "R-7F3K-92QD" };
    },
  });
  const store = createSupportStore(fake.ipc);
  return {
    fake,
    store,
    view: () => view,
    change,
    failNextSend: (code: string, field: string | null = null) => sendErrors.push({ code, field, message: "…" }),
    failEmail: (code: string, field: string | null) => (emailError = { code, field, message: "…" }),
    failLog: (code: string) => (logError = { code, field: null, message: "…" }),
    sends: () => fake.calls.filter((c) => c.cmd === "support_send").map((c) => c.args),
  };
}

describe("support store", () => {
  it("lúc mở cửa sổ: nghe sự kiện và đọc trạng thái ban đầu (chấm đỏ) mà không mở màn hình; bản cũ hơn bị bỏ", async () => {
    const { fake, store, change } = setup({ hasConversation: true, unread: true });
    const off = await store.getState().init();
    expect(fake.calls).toEqual([{ cmd: "support_screen", args: { open: false } }]);
    expect(store.getState().view?.unread).toBe(true);
    const newer = change({ messages: [message(1, "owner", "Chào bạn")] });
    fake.emit("support://view", newer);
    expect(store.getState().view?.messages).toHaveLength(1);
    fake.emit("support://view", { ...newer, rev: newer.rev - 1, messages: [] });
    expect(store.getState().view?.messages).toHaveLength(1);
    off();
    expect(fake.listenerCount("support://view")).toBe(0);
  });

  it("mở màn hình khi chưa có cuộc chat: chỉ báo mở và đọc dòng thông tin máy, không lệnh nào gọi mạng", async () => {
    const { fake, store } = setup();
    await store.getState().open();
    await Promise.resolve();
    expect(fake.calls.map((c) => c.cmd)).toEqual(["support_screen", "support_machine_info"]);
    expect(fake.calls[0]?.args).toEqual({ open: true });
    expect(store.getState().machineInfo).toContain("AI Translator 0.2.4");
    expect(store.getState().error).toBeNull();
  });

  it("mở màn hình khi đã có cuộc chat: lấy cả cuộc chat; mất mạng thì báo lỗi, lịch sử đã có vẫn còn", async () => {
    const { fake, store } = setup({ hasConversation: true, messages: [message(1, "customer", "Chào")] });
    await store.getState().open();
    expect(fake.calls.map((c) => c.cmd)).toContain("support_fetch");
    const offline = createSupportStore(
      fakeIpc({
        support_screen: () => ({ enabled: true, closed: false, hasConversation: true, messages: [message(1, "customer", "Chào")], unread: false, rev: 2 }),
        support_machine_info: () => "",
        support_fetch: () => {
          throw { code: "supportOffline", field: null, message: "…" };
        },
      }).ipc,
    );
    await offline.getState().open();
    expect(offline.getState().error).toEqual({ code: "supportOffline", field: null });
    expect(offline.getState().view?.messages).toHaveLength(1);
  });

  it("tin đầu tiên kèm thông tin máy khi để tích, tin sau thì không; gửi xong thì hiện thẻ email", async () => {
    const { store, sends } = setup();
    const sending = store.getState().send("  Phụ đề không hiện  ");
    expect(store.getState().pending).toEqual([{ localId: 1, text: "Phụ đề không hiện", status: "sending", error: null }]);
    expect(await sending).toBe(true);
    expect(store.getState().pending).toEqual([]);
    expect(store.getState().view?.messages.map((m) => m.text)).toEqual(["Phụ đề không hiện"]);
    expect(store.getState().emailCard).toBe("asking");
    store.getState().dismissEmail();
    await store.getState().send("Thêm một câu");
    expect(sends()).toEqual([
      { text: "Phụ đề không hiện", withMachineInfo: true },
      { text: "Thêm một câu", withMachineInfo: false },
    ]);
    expect(store.getState().emailCard, "đã đóng thẻ thì tin sau không mở lại").toBe("hidden");
  });

  it("tin đầu nhận supportDisabled: tin ở lại với lỗi, màn hình theo trạng thái tắt mà phía Rust báo, không có thẻ email", async () => {
    const { fake, store, failNextSend, change } = setup();
    await store.getState().init();
    failNextSend("supportDisabled");
    expect(await store.getState().send("Chào")).toBe(false);
    fake.emit("support://view", change({ enabled: false }));
    expect(store.getState().pending[0]?.error).toEqual({ code: "supportDisabled", field: null });
    expect(store.getState().view?.enabled).toBe(false);
    expect(store.getState().view?.hasConversation).toBe(false);
    expect(store.getState().emailCard).toBe("hidden");
  });

  it("bỏ tích thì tin đầu không kèm thông tin máy", async () => {
    const { store, sends } = setup();
    store.getState().setWithMachineInfo(false);
    await store.getState().send("Chào");
    expect(sends()).toEqual([{ text: "Chào", withMachineInfo: false }]);
  });

  it("tin rỗng hay quá 1000 ký tự không được gửi", async () => {
    const { store, sends } = setup();
    expect(await store.getState().send(" \n ")).toBe(false);
    expect(await store.getState().send("ế".repeat(1001))).toBe(false);
    expect(await store.getState().send("ế".repeat(1000))).toBe(true);
    expect(sends()).toHaveLength(1);
  });

  it("gửi lỗi thì tin ở lại với lỗi; bấm thử lại gửi đúng nội dung đó", async () => {
    const { store, sends, failNextSend } = setup({ hasConversation: true });
    await store.getState().init();
    failNextSend("supportRateLimited");
    expect(await store.getState().send("Còn đó không?")).toBe(false);
    expect(store.getState().pending).toEqual([
      { localId: 1, text: "Còn đó không?", status: "failed", error: { code: "supportRateLimited", field: null } },
    ]);
    await store.getState().retry(1);
    expect(store.getState().pending).toEqual([]);
    expect(sends()).toEqual([
      { text: "Còn đó không?", withMachineInfo: false },
      { text: "Còn đó không?", withMachineInfo: false },
    ]);
  });

  it("cuộc chat cũ không còn (supportExpired): gửi lại là tin đầu của cuộc mới, kèm thông tin máy nếu để tích", async () => {
    const { fake, store, sends, failNextSend, change } = setup({ hasConversation: true });
    await store.getState().init();
    failNextSend("supportExpired");
    await store.getState().send("Còn đó không?");
    // Phía Rust đã bỏ cuộc chat và báo qua sự kiện.
    fake.emit("support://view", change({ hasConversation: false, messages: [] }));
    await store.getState().retry(1);
    expect(sends().at(-1)).toEqual({ text: "Còn đó không?", withMachineInfo: true });
    expect(store.getState().emailCard).toBe("asking");
  });

  it("lưu email: đang lưu rồi đã lưu; lỗi thì hỏi lại kèm lỗi; đóng thẻ thì ẩn", async () => {
    const { fake, store, failEmail } = setup({ hasConversation: true });
    await store.getState().saveEmail(" khach@example.com ");
    expect(fake.calls.at(-1)).toEqual({ cmd: "support_set_email", args: { email: "khach@example.com" } });
    expect(store.getState().emailCard).toBe("saved");
    failEmail("supportInvalid", "email");
    await store.getState().saveEmail("sai");
    expect(store.getState().emailCard).toBe("asking");
    expect(store.getState().emailError).toEqual({ code: "supportInvalid", field: "email" });
    store.getState().dismissEmail();
    expect(store.getState().emailCard).toBe("hidden");
    expect(store.getState().emailError).toBeNull();
  });

  it("xóa cuộc trò chuyện: về trạng thái mới (tin chờ, thẻ email, ô tích); bấm đúp không gửi lệnh thứ hai", async () => {
    const { fake, store, failNextSend } = setup({ hasConversation: true, messages: [message(1, "customer", "Chào")] });
    failNextSend("supportOffline");
    await store.getState().send("Còn đó không?");
    store.getState().setWithMachineInfo(false);
    const first = store.getState().remove();
    expect(await store.getState().remove()).toBe(false);
    expect(await first).toBe(true);
    expect(fake.calls.filter((c) => c.cmd === "support_delete")).toHaveLength(1);
    expect(store.getState().view?.hasConversation).toBe(false);
    expect(store.getState().pending).toEqual([]);
    expect(store.getState().withMachineInfo).toBe(true);
    expect(store.getState().emailCard).toBe("hidden");
  });

  it("đính kèm log: chạy lệnh Gửi log cho hỗ trợ rồi gửi tin chứa mã báo cáo; lỗi của lệnh đó hiện ở nút, không gửi tin", async () => {
    const { store, sends, failLog } = setup({ hasConversation: true });
    await store.getState().init();
    await store.getState().attachLog((id) => `📎 Mã báo cáo log: ${id}`);
    expect(sends()).toEqual([{ text: "📎 Mã báo cáo log: R-7F3K-92QD", withMachineInfo: false }]);
    expect(store.getState().log).toEqual({ status: "idle" });
    failLog("reportRateLimited");
    await store.getState().attachLog((id) => `📎 Mã báo cáo log: ${id}`);
    expect(store.getState().log).toEqual({ status: "failed", code: "reportRateLimited" });
    expect(sends()).toHaveLength(1);
  });

  it("đóng màn hình thì báo phía Rust", async () => {
    const { fake, store } = setup();
    await store.getState().close();
    expect(fake.calls).toEqual([{ cmd: "support_screen", args: { open: false } }]);
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/store/support.test.ts 2>&1 | tail -6
```
Expected: `FAIL  src/store/support.test.ts`: không tải được module `./support` (file chưa có).

- [ ] **Step 3: Kiểu IPC và store**

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
export interface Commands {
  get_settings: { args: undefined; result: Settings };
```

và thay bằng:

```ts
// Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4; `support::api::SupportMessage`, `support::chat::SupportView`). Phía Rust giữ
// token và nhịp hỏi tin mới; giao diện chỉ nhận trạng thái này, không có token.
export interface SupportMessage {
  id: number;
  sender: "customer" | "owner";
  text: string;
  // Giây Unix.
  createdAt: number;
}

export interface SupportView {
  // Chat đang bật trên server. Chưa biết (chưa có cuộc chat: app không hỏi server khi chưa nhắn) thì `true`, để hiện ô nhập.
  enabled: boolean;
  // Chủ dự án đã chặn cuộc chat này.
  closed: boolean;
  // Đã có cuộc chat: ô "Gửi kèm thông tin máy" chỉ hiện khi chưa có.
  hasConversation: boolean;
  // Các tin đã biết, `id` tăng dần.
  messages: SupportMessage[];
  // Có câu trả lời mới chưa xem: chấm đỏ ở mục Hỗ trợ.
  unread: boolean;
  // Tăng mỗi lần trạng thái đổi: bản có `rev` nhỏ hơn bản đang có là cũ, bỏ qua.
  rev: number;
}

export interface Commands {
  get_settings: { args: undefined; result: Settings };
```

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
  send_log_report: { args: undefined; result: { id: string } };
```

và thay bằng:

```ts
  send_log_report: { args: undefined; result: { id: string } };
  // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4), chỉ cửa sổ chính. `support_screen`: màn hình Hỗ trợ mở hay đóng (lúc mở
  // cửa sổ gọi với `false` để có chấm đỏ), không gọi mạng. Lúc mở màn hình: `support_fetch` (cả cuộc chat) chỉ khi đã có cuộc chat;
  // chưa từng nhắn thì không gọi mạng. Lỗi: `supportOffline`, `supportRateLimited`, `supportBusy`, `supportDisabled`,
  // `supportClosed`, `supportExpired`, `supportInvalid` (kèm `field`).
  support_screen: { args: { open: boolean }; result: SupportView };
  support_fetch: { args: undefined; result: SupportView };
  // `withMachineInfo`: ô "Gửi kèm thông tin máy" đang tích; chỉ có tác dụng ở tin đầu tiên của cuộc chat.
  support_send: { args: { text: string; withMachineInfo: boolean }; result: SupportView };
  // `null`: bỏ email đã để lại.
  support_set_email: { args: { email: string | null }; result: null };
  support_delete: { args: undefined; result: SupportView };
  // Dòng thông tin máy gửi kèm tin đầu tiên (không có key, email, mã máy, tên máy, tên người dùng), hiện nguyên văn cạnh ô tích.
  support_machine_info: { args: undefined; result: string };
```

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
  "compose://done": ComposeDone;
}
```

và thay bằng:

```ts
  "compose://done": ComposeDone;
  // Chat hỗ trợ: trạng thái mới sau lần hỏi tin nền (tin mới, chấm đỏ, chat tắt, cuộc chat không còn).
  "support://view": SupportView;
}
```

Tạo `src/store/support.ts` với nội dung:

```ts
import { createStore } from "zustand/vanilla";
import type { Ipc, SupportView } from "../lib/ipc";
import { type UiError, toUiError } from "./app";

// Store của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4). Phía Rust giữ cuộc chat, token và nhịp hỏi tin mới; store chỉ
// nhận `SupportView` (kết quả lệnh và sự kiện `support://view`), cộng các tin khách vừa bấm gửi mà server chưa nhận.

// Tin khách vừa bấm gửi, chưa có trên server: đang gửi, hay lỗi (bấm để gửi lại đúng nội dung đó).
export interface PendingMessage {
  localId: number;
  text: string;
  status: "sending" | "failed";
  error: UiError | null;
}

// Thẻ "Để lại email": ẩn (chưa có tin đầu, hay đã đóng thẻ), đang hỏi, đang lưu, đã lưu.
export type EmailCard = "hidden" | "asking" | "saving" | "saved";

// Nút "Đính kèm log": chạy đúng lệnh của nút "Gửi log cho hỗ trợ" (`send_log_report`) rồi gửi mã báo cáo vào cuộc chat.
export type LogAttach = { status: "idle" } | { status: "sending" } | { status: "failed"; code: string };

// Số ký tự tối đa của một tin (hợp đồng, server kiểm lại).
export const MAX_CHARS = 1000;

// Số ký tự theo code point, như server đếm (`Array.from`).
export function charCount(text: string): number {
  return Array.from(text).length;
}

export interface SupportStoreState {
  view: SupportView | null;
  pending: PendingMessage[];
  // Ô "Gửi kèm thông tin máy": tích sẵn, chỉ hiện và chỉ có tác dụng trước tin đầu tiên.
  withMachineInfo: boolean;
  // Dòng thông tin máy hiện nguyên văn cạnh ô tích; `null` là chưa đọc.
  machineInfo: string | null;
  emailCard: EmailCard;
  emailError: UiError | null;
  // Lỗi lúc mở màn hình hay lúc xóa cuộc chat.
  error: UiError | null;
  deleting: boolean;
  log: LogAttach;
  // Nghe `support://view` và đọc trạng thái ban đầu (chấm đỏ) lúc mở cửa sổ. Trả hàm gỡ listener.
  init(): Promise<() => void>;
  // Màn hình Hỗ trợ vừa mở: báo phía Rust (bỏ chấm đỏ, nhịp 3 giây), đọc dòng thông tin máy, rồi lấy cả cuộc chat nếu đã có.
  // Chưa từng nhắn thì không gọi mạng (chat tắt thì biết qua lỗi `supportDisabled` của tin đầu).
  open(): Promise<void>;
  close(): Promise<void>;
  send(text: string): Promise<boolean>;
  retry(localId: number): Promise<void>;
  setWithMachineInfo(on: boolean): void;
  saveEmail(email: string): Promise<void>;
  dismissEmail(): void;
  remove(): Promise<boolean>;
  // `message`: chữ của tin chứa mã báo cáo (theo ngôn ngữ giao diện).
  attachLog(message: (id: string) => string): Promise<void>;
}

export function createSupportStore(ipc: Ipc) {
  return createStore<SupportStoreState>()((set, get) => {
    let nextLocalId = 0;

    // Nhận trạng thái mới từ lệnh hay sự kiện: bản có `rev` nhỏ hơn bản đang có là cũ, bỏ.
    function apply(view: SupportView) {
      const current = get().view;
      if (current && view.rev < current.rev) return;
      set({ view });
    }

    // Gửi một tin đang chờ; thành công thì bỏ khỏi danh sách chờ (tin đã nằm trong `view`).
    async function deliver(localId: number, text: string): Promise<boolean> {
      const first = !(get().view?.hasConversation ?? false);
      try {
        const view = await ipc.invoke("support_send", { text, withMachineInfo: first && get().withMachineInfo });
        apply(view);
        set((s) => ({
          pending: s.pending.filter((p) => p.localId !== localId),
          emailCard: first && s.emailCard === "hidden" ? "asking" : s.emailCard,
        }));
        return true;
      } catch (e) {
        const error = toUiError(e);
        set((s) => ({
          pending: s.pending.map((p) => (p.localId === localId ? { ...p, status: "failed", error } : p)),
        }));
        return false;
      }
    }

    return {
      view: null,
      pending: [],
      withMachineInfo: true,
      machineInfo: null,
      emailCard: "hidden",
      emailError: null,
      error: null,
      deleting: false,
      log: { status: "idle" },

      async init() {
        const off = await ipc.listen("support://view", apply);
        try {
          apply(await ipc.invoke("support_screen", { open: false }));
        } catch (e) {
          off();
          throw e;
        }
        return off;
      },

      async open() {
        let view: SupportView;
        try {
          view = await ipc.invoke("support_screen", { open: true });
        } catch (e) {
          set({ error: toUiError(e) });
          return;
        }
        apply(view);
        if (get().machineInfo === null) {
          // Không đọc được thì ô tích vẫn hiện, chỉ thiếu dòng xem trước.
          void ipc.invoke("support_machine_info").then(
            (machineInfo) => set({ machineInfo }),
            () => {},
          );
        }
        if (!view.hasConversation) {
          set({ error: null });
          return;
        }
        try {
          apply(await ipc.invoke("support_fetch"));
          set({ error: null });
        } catch (e) {
          set({ error: toUiError(e) });
        }
      },

      async close() {
        try {
          apply(await ipc.invoke("support_screen", { open: false }));
        } catch {
          // Màn hình đã đóng: không còn chỗ để báo lỗi.
        }
      },

      send(text) {
        const clean = text.trim();
        const length = charCount(clean);
        if (length === 0 || length > MAX_CHARS) return Promise.resolve(false);
        const localId = ++nextLocalId;
        set((s) => ({ pending: [...s.pending, { localId, text: clean, status: "sending", error: null }] }));
        return deliver(localId, clean);
      },

      async retry(localId) {
        const message = get().pending.find((p) => p.localId === localId);
        if (!message || message.status !== "failed") return;
        set((s) => ({
          pending: s.pending.map((p) => (p.localId === localId ? { ...p, status: "sending", error: null } : p)),
        }));
        await deliver(localId, message.text);
      },

      setWithMachineInfo(on) {
        set({ withMachineInfo: on });
      },

      async saveEmail(email) {
        set({ emailCard: "saving", emailError: null });
        try {
          await ipc.invoke("support_set_email", { email: email.trim() });
          set({ emailCard: "saved" });
        } catch (e) {
          set({ emailCard: "asking", emailError: toUiError(e) });
        }
      },

      dismissEmail() {
        set({ emailCard: "hidden", emailError: null });
      },

      async remove() {
        if (get().deleting) return false;
        set({ deleting: true });
        try {
          apply(await ipc.invoke("support_delete"));
          set({ pending: [], emailCard: "hidden", emailError: null, withMachineInfo: true, error: null });
          return true;
        } catch (e) {
          set({ error: toUiError(e) });
          return false;
        } finally {
          set({ deleting: false });
        }
      },

      async attachLog(message) {
        if (get().log.status === "sending") return;
        set({ log: { status: "sending" } });
        let id: string;
        try {
          ({ id } = await ipc.invoke("send_log_report"));
        } catch (e) {
          set({ log: { status: "failed", code: toUiError(e).code } });
          return;
        }
        set({ log: { status: "idle" } });
        await get().send(message(id));
      },
    };
  });
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/store/support.test.ts 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Tests  13 passed (13)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  27 passed (27)`, `Tests  344 passed (344)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src/store/support.test.ts src/store/support.ts src/lib/ipc.ts && git commit -m "feat(app): store và kiểu IPC của màn hình Hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 10: Chữ của màn hình Hỗ trợ ở năm ngôn ngữ

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/ja.ts`, `src/i18n/zh.ts`, `src/i18n/ko.ts`

28 khóa: `nav.support` và 27 khóa `support.*`. Lời chào (`support.greeting`), dòng phụ (`support.subtitle`) và chân khung (`support.footer` + " · " + `support.privacy`) là **nguyên văn hợp đồng phía khách** ở cả năm ngôn ngữ (test ở Task 11 so từng chữ). Thuật ngữ theo các bản dịch sẵn có: ja サポート, zh 客服, ko 지원팀 / 지원. `support.counter` khác nhau giữa vi và en (`1.000 ký tự` / `1,000 characters`) vì `i18n.test.ts` đòi chuỗi tiếng Việt khác tiếng Anh.

- [ ] **Step 1: Viết test trước (đỏ): thêm khóa vào từ điển chuẩn `en.ts`**

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "nav.upgrade": "Upgrade to Pro",
```

và thay bằng:

```ts
  "nav.upgrade": "Upgrade to Pro",
  "nav.support": "Support",
```

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "common.cancel": "Cancel",
```

và thay bằng:

```ts
  "support.unread": "Support: new reply",
  "support.subtitle": "A real person replies, not a bot · no guaranteed response time",
  "support.greeting": "Hi 👋 How can we help? You can write in English or Vietnamese.",
  "support.from.owner": "Support",
  "support.from.you": "You",
  "support.sending": "Sending…",
  "support.sent": "Sent",
  "support.failed": "Not sent, try again",
  "support.placeholder": "Type a message…",
  "support.inputLabel": "Message to support",
  "support.send": "Send",
  "support.counter": "{count}/1,000 characters",
  "support.machineInfo": "Include device info",
  "support.machineInfo.hint": "Sent with your first message only. Never includes your key, email, device ID, computer name or user name.",
  "support.attachLog": "Attach log",
  "support.attachLog.sending": "Sending log…",
  "support.logMessage": "📎 Log report code: {id}",
  "support.email.prompt": "Leave your email to get replies by email when the app isn't open (optional)",
  "support.email.save": "Save",
  "support.email.saved": "Email saved. Replies will also be sent there when the app isn't open.",
  "support.email.invalid": "That email address doesn't look right.",
  "support.menu": "More options",
  "support.delete": "Delete conversation",
  "support.delete.confirm": "Delete this conversation and all its messages? This can't be undone.",
  "support.delete.yes": "Delete",
  "support.footer": "Messages are kept for 90 days",
  "support.privacy": "Privacy",
  "common.cancel": "Cancel",
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/i18n 2>&1 | grep -E "FAIL|Tests "
```
Expected: `Tests  8 failed | 58 passed (66)`: `từ điển ja|zh|ko > có đúng các khóa của en…` và `… cùng tham số {…} với en ở mỗi khóa` (6), `vi có đúng các khóa của en…` và `hai ngôn ngữ có cùng tham số ở mỗi khóa` (2).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit 2>&1 | head -5
```
Expected: `error TS2740` ở `src/i18n/ja.ts`, `ko.ts`, `vi.ts`, `zh.ts`: thiếu `"nav.support", "support.attachLog", … and 24 more`.

- [ ] **Step 3: Thêm khóa vào bốn từ điển còn lại**

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "nav.upgrade": "Nâng cấp Pro",
```

và thay bằng:

```ts
  "nav.upgrade": "Nâng cấp Pro",
  "nav.support": "Hỗ trợ",
```

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "common.cancel": "Hủy",
```

và thay bằng:

```ts
  "support.unread": "Hỗ trợ: có câu trả lời mới",
  "support.subtitle": "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời",
  "support.greeting": "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.",
  "support.from.owner": "Hỗ trợ",
  "support.from.you": "Bạn",
  "support.sending": "Đang gửi…",
  "support.sent": "Đã gửi",
  "support.failed": "Không gửi được, thử lại",
  "support.placeholder": "Nhập tin nhắn…",
  "support.inputLabel": "Tin nhắn gửi bộ phận hỗ trợ",
  "support.send": "Gửi",
  "support.counter": "{count}/1.000 ký tự",
  "support.machineInfo": "Gửi kèm thông tin máy",
  "support.machineInfo.hint": "Chỉ gửi kèm tin đầu tiên. Không bao giờ có key, email, mã máy, tên máy hay tên người dùng.",
  "support.attachLog": "Đính kèm log",
  "support.attachLog.sending": "Đang gửi log…",
  "support.logMessage": "📎 Mã báo cáo log: {id}",
  "support.email.prompt": "Để lại email để nhận câu trả lời qua email khi bạn không mở app (không bắt buộc)",
  "support.email.save": "Lưu",
  "support.email.saved": "Đã lưu email. Khi bạn không mở app, câu trả lời cũng được gửi tới email này.",
  "support.email.invalid": "Địa chỉ email không hợp lệ.",
  "support.menu": "Tùy chọn khác",
  "support.delete": "Xóa cuộc trò chuyện",
  "support.delete.confirm": "Xóa cuộc trò chuyện này và mọi tin nhắn? Không hoàn tác được.",
  "support.delete.yes": "Xóa",
  "support.footer": "Tin nhắn được lưu 90 ngày",
  "support.privacy": "Quyền riêng tư",
  "common.cancel": "Hủy",
```

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "nav.upgrade": "Pro にアップグレード",
```

và thay bằng:

```ts
  "nav.upgrade": "Pro にアップグレード",
  "nav.support": "サポート",
```

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "common.cancel": "キャンセル",
```

và thay bằng:

```ts
  "support.unread": "サポート：新しい返信があります",
  "support.subtitle": "ボットではなく人が返信します · 返信時間は保証していません",
  "support.greeting": "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。",
  "support.from.owner": "サポート",
  "support.from.you": "あなた",
  "support.sending": "送信中…",
  "support.sent": "送信済み",
  "support.failed": "送信できませんでした。再送信",
  "support.placeholder": "メッセージを入力…",
  "support.inputLabel": "サポートへのメッセージ",
  "support.send": "送信",
  "support.counter": "{count}/1,000 文字",
  "support.machineInfo": "端末情報を添付",
  "support.machineInfo.hint": "最初のメッセージにだけ添付されます。キー、メールアドレス、端末 ID、コンピューター名、ユーザー名は含まれません。",
  "support.attachLog": "ログを添付",
  "support.attachLog.sending": "ログを送信中…",
  "support.logMessage": "📎 ログのレポートコード：{id}",
  "support.email.prompt": "アプリを開いていないときも返信をメールで受け取れるよう、メールアドレスを入力してください（任意）",
  "support.email.save": "保存",
  "support.email.saved": "メールアドレスを保存しました。アプリを開いていないときは、このアドレスにも返信が届きます。",
  "support.email.invalid": "メールアドレスの形式が正しくありません。",
  "support.menu": "その他のオプション",
  "support.delete": "会話を削除",
  "support.delete.confirm": "この会話とすべてのメッセージを削除しますか？元に戻せません。",
  "support.delete.yes": "削除",
  "support.footer": "メッセージは 90 日間保存されます",
  "support.privacy": "プライバシー",
  "common.cancel": "キャンセル",
```

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "nav.upgrade": "升级到 Pro",
```

và thay bằng:

```ts
  "nav.upgrade": "升级到 Pro",
  "nav.support": "客服",
```

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "common.cancel": "取消",
```

và thay bằng:

```ts
  "support.unread": "客服：有新回复",
  "support.subtitle": "由真人回复，不是机器人 · 不保证回复时间",
  "support.greeting": "你好 👋 有什么可以帮你？如果可以，请用英文书写。",
  "support.from.owner": "客服",
  "support.from.you": "你",
  "support.sending": "正在发送…",
  "support.sent": "已发送",
  "support.failed": "发送失败，重试",
  "support.placeholder": "输入消息…",
  "support.inputLabel": "发给客服的消息",
  "support.send": "发送",
  "support.counter": "{count}/1,000 个字符",
  "support.machineInfo": "附带设备信息",
  "support.machineInfo.hint": "仅随第一条消息发送。不包含密钥、邮箱、设备 ID、电脑名称或用户名。",
  "support.attachLog": "附加日志",
  "support.attachLog.sending": "正在发送日志…",
  "support.logMessage": "📎 日志报告编号：{id}",
  "support.email.prompt": "留下邮箱，未打开应用时可通过邮件接收回复（可选）",
  "support.email.save": "保存",
  "support.email.saved": "邮箱已保存。未打开应用时，回复也会发送到这个邮箱。",
  "support.email.invalid": "邮箱地址格式不正确。",
  "support.menu": "更多选项",
  "support.delete": "删除对话",
  "support.delete.confirm": "删除此对话及全部消息？此操作无法撤销。",
  "support.delete.yes": "删除",
  "support.footer": "消息保存 90 天",
  "support.privacy": "隐私",
  "common.cancel": "取消",
```

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "nav.upgrade": "Pro로 업그레이드",
```

và thay bằng:

```ts
  "nav.upgrade": "Pro로 업그레이드",
  "nav.support": "지원",
```

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "common.cancel": "취소",
```

và thay bằng:

```ts
  "support.unread": "지원: 새 답변이 있습니다",
  "support.subtitle": "봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다",
  "support.greeting": "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.",
  "support.from.owner": "지원팀",
  "support.from.you": "나",
  "support.sending": "보내는 중…",
  "support.sent": "보냄",
  "support.failed": "보내지 못했습니다. 다시 시도",
  "support.placeholder": "메시지를 입력하세요…",
  "support.inputLabel": "지원팀에 보낼 메시지",
  "support.send": "보내기",
  "support.counter": "{count}/1,000자",
  "support.machineInfo": "기기 정보 함께 보내기",
  "support.machineInfo.hint": "첫 메시지에만 첨부됩니다. 키, 이메일, 기기 ID, 컴퓨터 이름, 사용자 이름은 포함되지 않습니다.",
  "support.attachLog": "로그 첨부",
  "support.attachLog.sending": "로그 보내는 중…",
  "support.logMessage": "📎 로그 보고서 코드: {id}",
  "support.email.prompt": "앱을 열지 않았을 때 답변을 이메일로 받으려면 이메일을 남겨 주세요(선택 사항)",
  "support.email.save": "저장",
  "support.email.saved": "이메일을 저장했습니다. 앱을 열지 않았을 때 이 주소로도 답변이 전송됩니다.",
  "support.email.invalid": "이메일 주소 형식이 올바르지 않습니다.",
  "support.menu": "추가 옵션",
  "support.delete": "대화 삭제",
  "support.delete.confirm": "이 대화와 모든 메시지를 삭제할까요? 되돌릴 수 없습니다.",
  "support.delete.yes": "삭제",
  "support.footer": "메시지는 90일간 보관됩니다",
  "support.privacy": "개인정보",
  "common.cancel": "취소",
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/i18n 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Tests  66 passed (66)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  27 passed (27)`, `Tests  344 passed (344)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src/i18n/en.ts src/i18n/vi.ts src/i18n/ja.ts src/i18n/zh.ts src/i18n/ko.ts && git commit -m "feat(app): chữ của màn hình Hỗ trợ ở năm ngôn ngữ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 11: Khung chat (`SupportChat.tsx`) và biểu tượng

**Files:**
- Create: `src/windows/main/screens/SupportChat.test.ts`, `src/windows/main/screens/SupportChat.tsx`
- Modify: `src/components/Icon.tsx`

Khung chat chỉ vẽ theo props (như `UpgradeView`), để test vẽ bằng `react-dom/server` trong Node. Trạng thái tạm của riêng khung (chữ đang gõ, menu ⋯ mở, hỏi lại trước khi xóa, chính sách đang mở, email đang gõ) là `useState` bên trong; phần bấm thật kiểm ở Task 13 trên DOM thật. Enter gửi, Shift+Enter xuống dòng, Enter trong lúc bộ gõ đang soạn chữ (`isComposing`: tiếng Nhật, Trung, Hàn, Telex) là của bộ gõ. Danh sách tin có `aria-live="polite"`; mỗi tin có nhãn ẩn "Hỗ trợ:" / "Bạn:" cho trình đọc màn hình. "Quyền riêng tư" mở `LegalDocument kind="privacy"` ngay trong app.

- [ ] **Step 1: Viết test trước (đỏ)**

Tạo `src/windows/main/screens/SupportChat.test.ts` với nội dung:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { SupportView } from "../../../lib/ipc";
import { SupportChat, type SupportChatProps } from "./SupportChat";

// Màn hình Hỗ trợ vẽ bằng `react-dom/server` trong Node (như UpgradeView.test.ts): lời chào, dòng phụ và chân khung đúng hợp đồng
// phía khách ở năm ngôn ngữ; ô "Gửi kèm thông tin máy" chỉ trước tin đầu tiên; trạng thái từng tin; thẻ email; chế độ tắt, đóng.

const view = (patch: Partial<SupportView> = {}): SupportView => ({
  enabled: true,
  closed: false,
  hasConversation: false,
  messages: [],
  unread: false,
  rev: 1,
  ...patch,
});

const LINE = "AI Translator 0.2.4 · macOS 15.6 · Apple M4 Pro · 24 GB · Monthly · Chuẩn · UI vi";

const props = (patch: Partial<SupportChatProps> = {}): SupportChatProps => ({
  lang: "vi",
  view: view(),
  pending: [],
  withMachineInfo: true,
  machineInfo: LINE,
  emailCard: "hidden",
  emailError: null,
  error: null,
  deleting: false,
  log: { status: "idle" },
  onSend: () => {},
  onRetry: () => {},
  onToggleMachineInfo: () => {},
  onSaveEmail: () => {},
  onDismissEmail: () => {},
  onDelete: () => {},
  onAttachLog: () => {},
  ...patch,
});

const html = (patch: Partial<SupportChatProps> = {}) => renderToStaticMarkup(createElement(SupportChat, props(patch)));

// Chữ của từ điển như trong HTML (React thoát các ký tự đặc biệt).
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textIn = (lang: UiLanguage) => (key: MessageKey, params?: Params) => esc(translate(lang, key, params));
const text = textIn("vi");
// Chữ trong HTML, bỏ thẻ: để so cả câu có liên kết ở giữa.
const plain = (markup: string) => markup.replace(/<[^>]+>/g, "");

const withConversation = view({
  hasConversation: true,
  messages: [
    { id: 1, sender: "customer", text: "Phụ đề không hiện khi họp Teams", createdAt: 1 },
    { id: 2, sender: "owner", text: "Bạn đang dùng macOS bản nào?", createdAt: 2 },
  ],
});

describe("SupportChat: chữ của hợp đồng phía khách", () => {
  // Hợp đồng `2026-10-22-chat-ho-tro-00-tong-quan.md`, mục "Hợp đồng phía khách".
  const CONTRACT: Record<UiLanguage, { greeting: string; subtitle: string; foot: string }> = {
    vi: {
      greeting: "Chào bạn 👋 Bạn cần giúp gì? Bạn có thể viết bằng tiếng Việt hoặc English.",
      subtitle: "Người thật trả lời, không phải bot · chưa cam kết thời gian trả lời",
      foot: "Tin nhắn được lưu 90 ngày · Quyền riêng tư",
    },
    en: {
      greeting: "Hi 👋 How can we help? You can write in English or Vietnamese.",
      subtitle: "A real person replies, not a bot · no guaranteed response time",
      foot: "Messages are kept for 90 days · Privacy",
    },
    ja: {
      greeting: "こんにちは 👋 どのようなご用件でしょうか？できれば英語でお書きください。",
      subtitle: "ボットではなく人が返信します · 返信時間は保証していません",
      foot: "メッセージは 90 日間保存されます · プライバシー",
    },
    zh: {
      greeting: "你好 👋 有什么可以帮你？如果可以，请用英文书写。",
      subtitle: "由真人回复，不是机器人 · 不保证回复时间",
      foot: "消息保存 90 天 · 隐私",
    },
    ko: {
      greeting: "안녕하세요 👋 무엇을 도와드릴까요? 가능하면 영어로 써 주세요.",
      subtitle: "봇이 아닌 사람이 답변합니다 · 답변 시간은 보장하지 않습니다",
      foot: "메시지는 90일간 보관됩니다 · 개인정보",
    },
  };

  it.each(Object.entries(CONTRACT) as [UiLanguage, (typeof CONTRACT)["vi"]][])("%s: lời chào, dòng phụ, chân khung", (lang, c) => {
    const markup = html({ lang });
    expect(plain(markup)).toContain(c.greeting);
    expect(plain(markup)).toContain(c.subtitle);
    const foot = markup.match(/<p class="hint support-foot">(.*?)<\/p>/)?.[1] ?? "";
    expect(plain(foot)).toBe(c.foot);
    expect(foot).toContain(`<button class="link" aria-expanded="false">${esc(translate(lang, "support.privacy"))}</button>`);
  });
});

describe("SupportChat: ô thông tin máy, tin nhắn", () => {
  it("chưa có cuộc chat: ô tích sẵn, dòng thông tin máy hiện nguyên văn, chưa có menu ⋯", () => {
    const markup = html();
    expect(markup).toContain('<input type="checkbox" aria-describedby="support-machine-hint" checked=""/>');
    expect(markup).toContain(text("support.machineInfo"));
    expect(markup).toContain(text("support.machineInfo.hint"));
    expect(markup).toContain(`<code class="support-machine-line">${esc(LINE)}</code>`);
    expect(markup).not.toContain(text("support.menu"));
  });

  it("bỏ tích thì không hiện dòng thông tin máy", () => {
    const markup = html({ withMachineInfo: false });
    expect(markup).toContain('<input type="checkbox" aria-describedby="support-machine-hint"/>');
    expect(markup).not.toContain("support-machine-line");
  });

  it("đã có cuộc chat: không còn ô tích; có menu ⋯; tin khách ghi Đã gửi, tin chủ dự án không có trạng thái", () => {
    const markup = html({ view: withConversation });
    expect(markup).not.toContain("support-machine");
    expect(markup).toContain(`aria-label="${text("support.menu")}"`);
    expect(markup).toContain(
      `<div class="msg customer"><span class="sr-only">${text("support.from.you")}: </span><p class="msg-text">Phụ đề không hiện khi họp Teams</p><span class="msg-status">${text("support.sent")}</span></div>`,
    );
    expect(markup).toContain(
      `<div class="msg owner"><span class="sr-only">${text("support.from.owner")}: </span><p class="msg-text">Bạn đang dùng macOS bản nào?</p></div>`,
    );
    expect(markup).toContain('aria-live="polite"');
  });

  it("tin đang gửi và tin gửi lỗi: câu lỗi đúng mã và nút gửi lại", () => {
    const markup = html({
      view: withConversation,
      pending: [
        { localId: 1, text: "Còn đó không?", status: "sending", error: null },
        { localId: 2, text: "Alo", status: "failed", error: { code: "supportRateLimited", field: null } },
      ],
    });
    expect(markup).toContain(`<p class="msg-text">Còn đó không?</p><span class="msg-status">${text("support.sending")}</span>`);
    expect(markup).toContain('class="msg customer failed"');
    expect(markup).toContain(`<span class="msg-status error">${text("error.supportRateLimited")}</span>`);
    expect(markup).toContain(text("support.failed"));
  });

  it("ô trống thì nút Gửi bị khóa; có nút Đính kèm log", () => {
    const markup = html();
    expect(markup).toMatch(/<button type="submit" class="primary" disabled="">.*?<\/button>/);
    expect(markup).toContain(text("support.attachLog"));
    expect(markup).toContain(`placeholder="${text("support.placeholder")}"`);
  });

  it("Đính kèm log: đang gửi thì khóa nút; lỗi thì hiện câu lỗi của luồng Gửi log cho hỗ trợ", () => {
    expect(html({ log: { status: "sending" } })).toContain(text("support.attachLog.sending"));
    expect(html({ log: { status: "failed", code: "reportRateLimited" } })).toContain(text("error.reportRateLimited"));
  });

  it("lỗi lúc mở màn hình hiện ở ô báo lỗi", () => {
    expect(html({ error: { code: "supportOffline", field: null } })).toContain(
      `<p class="note error" role="alert">`,
    );
  });
});

describe("SupportChat: thẻ email, chế độ tắt và đóng", () => {
  it("thẻ email: hỏi (ô email, nút Lưu, nút đóng thẻ), đã lưu, email sai, ẩn", () => {
    const asking = html({ view: withConversation, emailCard: "asking" });
    expect(asking).toContain(`<label for="support-email">${text("support.email.prompt")}</label>`);
    expect(asking).toContain('type="email"');
    expect(asking).toContain(text("support.email.save"));
    expect(asking).toContain(`aria-label="${text("common.dismiss")}"`);
    expect(html({ view: withConversation, emailCard: "saved" })).toContain(text("support.email.saved"));
    const invalid = html({ view: withConversation, emailCard: "asking", emailError: { code: "supportInvalid", field: "email" } });
    expect(invalid).toContain(text("support.email.invalid"));
    expect(invalid).toContain('aria-invalid="true"');
    expect(html({ view: withConversation })).not.toContain("support-email");
  });

  it("chat tắt: ô nhập thành dòng email support@, lịch sử vẫn hiện, không có thẻ email", () => {
    const markup = html({ view: { ...withConversation, enabled: false }, emailCard: "asking" });
    expect(markup).not.toContain("<textarea");
    expect(markup).toContain(text("error.supportDisabled"));
    expect(markup).toContain("support@aitranslator.io.vn");
    expect(markup).toContain("Phụ đề không hiện khi họp Teams");
    expect(markup).not.toContain("support-email");
  });

  it("cuộc chat bị chặn: dòng cuộc trò chuyện đã đóng thay ô nhập", () => {
    const markup = html({ view: { ...withConversation, closed: true } });
    expect(markup).not.toContain("<textarea");
    expect(markup).toContain(text("error.supportClosed"));
  });
});
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/windows/main/screens/SupportChat.test.ts 2>&1 | tail -6
```
Expected: `FAIL  src/windows/main/screens/SupportChat.test.ts`: không tải được module `./SupportChat` (file chưa có).

- [ ] **Step 3: Biểu tượng và khung chat**

Trong `src/components/Icon.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  about: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.5M12 7.6v.1",
```

và thay bằng:

```tsx
  about: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 11v5.5M12 7.6v.1",
  // Màn hình Hỗ trợ (chat): bong bóng hội thoại; gửi tin; menu ⋯; đính kèm log.
  support: "M4.5 5h15a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 9.5h8M8 12.5h5",
  send: "M4 11.5 20 4l-6.5 16-2.5-6.5ZM11 13.5 20 4",
  more: "M5.5 12h.1M12 12h.1M18.5 12h.1",
  paperclip: "M16 7.5 9.2 14.3a1.8 1.8 0 0 0 2.5 2.5l7-7a3.6 3.6 0 0 0-5.1-5.1l-7.1 7.1a5.4 5.4 0 0 0 7.6 7.6L19.5 14",
```

Tạo `src/windows/main/screens/SupportChat.tsx` với nội dung:

```tsx
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/Icon";
import { errorKey, type MessageKey, type Params, translate, type UiLanguage } from "../../../i18n";
import type { SupportView } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { charCount, type EmailCard, type LogAttach, MAX_CHARS, type PendingMessage } from "../../../store/support";
import { LegalDocument } from "../LegalDocument";

// Đếm ký tự hiện khi tin dài từ chừng này ký tự (gần giới hạn 1000).
export const COUNTER_FROM = 900;

export interface SupportChatProps {
  lang: UiLanguage;
  view: SupportView | null;
  pending: PendingMessage[];
  withMachineInfo: boolean;
  machineInfo: string | null;
  emailCard: EmailCard;
  emailError: UiError | null;
  error: UiError | null;
  deleting: boolean;
  log: LogAttach;
  onSend(text: string): void;
  onRetry(localId: number): void;
  onToggleMachineInfo(on: boolean): void;
  onSaveEmail(email: string): void;
  onDismissEmail(): void;
  onDelete(): void;
  onAttachLog(): void;
}

// Khung chat của màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4, hợp đồng phía khách): dòng phụ, lời chào (chỉ hiện, không
// gửi lên server), các tin kèm trạng thái, ô "Gửi kèm thông tin máy" trước tin đầu tiên, ô nhập (Enter gửi, Shift+Enter xuống
// dòng, đếm ký tự khi gần 1000), "Đính kèm log", thẻ email, menu ⋯ "Xóa cuộc trò chuyện" (hỏi lại), chân "lưu 90 ngày · Quyền
// riêng tư" mở chính sách ngay trong app. Chat tắt hay cuộc chat bị chặn thì ô nhập thành dòng email support@, lịch sử vẫn hiện.
// Chỉ vẽ theo props (store ở `SupportScreen`), để test vẽ được trong Node.
export function SupportChat(p: SupportChatProps) {
  const t = (key: MessageKey, params?: Params) => translate(p.lang, key, params);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [email, setEmail] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const messages = p.view?.messages ?? [];
  const count = messages.length + p.pending.length;
  // Có tin mới (của ai cũng vậy) thì cuộn xuống cuối.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [count]);
  const hasConversation = p.view?.hasConversation ?? false;
  // Chat tắt (`enabled = false`) hay cuộc chat bị chặn: thay ô nhập bằng câu email support@.
  const blocked = p.view?.closed ? "supportClosed" : p.view && !p.view.enabled ? "supportDisabled" : null;
  const length = charCount(draft.trim());
  const canSend = length > 0 && length <= MAX_CHARS;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    p.onSend(draft);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter gửi, Shift+Enter xuống dòng; đang gõ bằng bộ gõ (tiếng Nhật, Trung, Hàn, Telex) thì Enter là của bộ gõ.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      <div className="card support-chat">
        <div className="support-head">
          <p className="hint">{t("support.subtitle")}</p>
          {hasConversation && (
            <div className="support-menu">
              <button
                className="ghost"
                aria-label={t("support.menu")}
                title={t("support.menu")}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="more" />
              </button>
              {menu && (
                <div className="support-menu-list" role="menu">
                  <button
                    role="menuitem"
                    className="ghost danger-text"
                    onClick={() => {
                      setMenu(false);
                      setConfirming(true);
                    }}
                  >
                    <Icon name="trash" size={16} />
                    {t("support.delete")}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {confirming && (
          <div className="confirm">
            <span>{t("support.delete.confirm")}</span>
            <button
              className="danger"
              disabled={p.deleting}
              onClick={() => {
                setConfirming(false);
                p.onDelete();
              }}
            >
              {t("support.delete.yes")}
            </button>
            <button onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
          </div>
        )}
        {p.error && (
          <p className="note error" role="alert">
            <Icon name="alert" size={16} />
            <span>{t(errorKey(p.error.code))}</span>
          </p>
        )}
        <div className="support-log" ref={log} aria-live="polite">
          <div className="msg owner">
            <span className="sr-only">{t("support.from.owner")}: </span>
            <p className="msg-text">{t("support.greeting")}</p>
          </div>
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.sender}`}>
              <span className="sr-only">{t(m.sender === "owner" ? "support.from.owner" : "support.from.you")}: </span>
              <p className="msg-text">{m.text}</p>
              {m.sender === "customer" && <span className="msg-status">{t("support.sent")}</span>}
            </div>
          ))}
          {p.pending.map((m) => (
            <div key={`pending-${m.localId}`} className={`msg customer ${m.status}`}>
              <span className="sr-only">{t("support.from.you")}: </span>
              <p className="msg-text">{m.text}</p>
              {m.status === "sending" ? (
                <span className="msg-status">{t("support.sending")}</span>
              ) : (
                <>
                  {m.error && <span className="msg-status error">{t(errorKey(m.error.code))}</span>}
                  <button className="link msg-retry" onClick={() => p.onRetry(m.localId)}>
                    <Icon name="refresh" size={14} />
                    {t("support.failed")}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        {blocked ? (
          <p className="note support-blocked">
            <Icon name="info" size={16} />
            <span>{t(errorKey(blocked))}</span>
          </p>
        ) : (
          <form className="support-compose" onSubmit={submit}>
            {!hasConversation && (
              <div className="support-machine">
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={p.withMachineInfo}
                    aria-describedby="support-machine-hint"
                    onChange={(e) => p.onToggleMachineInfo(e.target.checked)}
                  />
                  <span>{t("support.machineInfo")}</span>
                </label>
                <p className="hint consent-hint" id="support-machine-hint">
                  {t("support.machineInfo.hint")}
                </p>
                {p.withMachineInfo && p.machineInfo && <code className="support-machine-line">{p.machineInfo}</code>}
              </div>
            )}
            <textarea
              aria-label={t("support.inputLabel")}
              placeholder={t("support.placeholder")}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <div className="support-actions">
              <button
                type="button"
                className="ghost"
                disabled={p.log.status === "sending"}
                onClick={p.onAttachLog}
              >
                <Icon name="paperclip" size={16} />
                {t(p.log.status === "sending" ? "support.attachLog.sending" : "support.attachLog")}
              </button>
              {length >= COUNTER_FROM && (
                <span className={length > MAX_CHARS ? "support-counter error-text" : "support-counter hint"}>
                  {t("support.counter", { count: length })}
                </span>
              )}
              <button type="submit" className="primary" disabled={!canSend}>
                <Icon name="send" size={16} />
                {t("support.send")}
              </button>
            </div>
            {p.log.status === "failed" && (
              <p className="note error">
                <Icon name="alert" size={16} />
                <span>{t(errorKey(p.log.code))}</span>
              </p>
            )}
          </form>
        )}
        {p.emailCard !== "hidden" && !blocked && (
          <form
            className="support-email"
            onSubmit={(e) => {
              e.preventDefault();
              p.onSaveEmail(email);
            }}
          >
            {p.emailCard === "saved" ? (
              <p className="note">
                <Icon name="check" size={16} />
                <span>{t("support.email.saved")}</span>
              </p>
            ) : (
              <div>
                <label htmlFor="support-email">{t("support.email.prompt")}</label>
                <div className="row">
                  <input
                    id="support-email"
                    type="email"
                    autoComplete="email"
                    placeholder="email@example.com"
                    value={email}
                    aria-invalid={p.emailError?.field === "email" ? true : undefined}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <button type="submit" disabled={p.emailCard === "saving" || email.trim() === ""}>
                    {t("support.email.save")}
                  </button>
                </div>
                {p.emailError && (
                  <p className="note error">
                    <Icon name="alert" size={16} />
                    <span>
                      {t(p.emailError.field === "email" ? "support.email.invalid" : errorKey(p.emailError.code))}
                    </span>
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              className="ghost support-email-close"
              aria-label={t("common.dismiss")}
              title={t("common.dismiss")}
              onClick={p.onDismissEmail}
            >
              <Icon name="x" size={16} />
            </button>
          </form>
        )}
        <p className="hint support-foot">
          {t("support.footer")} ·{" "}
          <button className="link" aria-expanded={privacy} onClick={() => setPrivacy(!privacy)}>
            {t("support.privacy")}
          </button>
        </p>
      </div>
      {privacy && (
        <div className="card support-privacy">
          <div className="row split">
            <h2>{t("legal.privacy")}</h2>
            <button onClick={() => setPrivacy(false)}>{t("common.dismiss")}</button>
          </div>
          <LegalDocument kind="privacy" />
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/windows/main/screens/SupportChat.test.ts 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Tests  15 passed (15)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  28 passed (28)`, `Tests  359 passed (359)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src/windows/main/screens/SupportChat.test.ts src/windows/main/screens/SupportChat.tsx src/components/Icon.tsx && git commit -m "feat(app): khung chat của màn hình Hỗ trợ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 12: Mục Hỗ trợ trong thanh bên, chấm đỏ, kiểu dáng

**Files:**
- Modify: `src/lib/ipc.ts`, `src/windows/main/Shell.tsx`, `src/windows/main/main.tsx`, `src/styles/main.css`
- Create: `src/windows/main/supportStore.ts`, `src/windows/main/screens/SupportScreen.tsx`

`support` vào `SCREENS` giữa `upgrade` và `about`. Store nghe `support://view` từ lúc mở cửa sổ (`main.tsx`, như `licenseStore`), để chấm đỏ hiện cả khi màn hình chưa mở; lúc đó chỉ gọi `support_screen(false)`, không gọi mạng. `SupportScreen` báo mở khi mount và đóng khi unmount. Chấm đỏ là `<i class="nav-dot">` (không phải `<span>`: cửa sổ hẹp ẩn mọi `span` của nút điều hướng); khi có chấm, nhãn của nút là `support.unread`.

- [ ] **Step 1: Viết test trước (đỏ): thêm màn hình vào kiểu `Screen`**

`Shell.tsx` khai `ICONS` và `BODIES` là `Record<Screen, …>`, nên thêm `"support"` vào `Screen` làm `tsc` đỏ tới khi Shell có màn hình mới.

Trong `src/lib/ipc.ts`, tìm đoạn (duy nhất trong file):

```ts
export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "about";
```

và thay bằng:

```ts
// "support": màn hình Hỗ trợ (chat, spec 2026-10-22-chat-ho-tro-zalo §4), giữa Nâng cấp và Giới thiệu.
export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "support" | "about";
```

- [ ] **Step 2: Chạy, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit 2>&1 | head -6
```
Expected: lỗi ở `src/windows/main/Shell.tsx`: thuộc tính `support` thiếu trong `ICONS` và `BODIES` (`Property 'support' is missing in type …`).

- [ ] **Step 3: Store nối lõi, màn hình, thanh bên, kiểu dáng**

Tạo `src/windows/main/supportStore.ts` với nội dung:

```ts
import { useStore } from "zustand";
import { tauriIpc } from "../../lib/ipc";
import { type SupportStoreState, createSupportStore } from "../../store/support";

// Store chat hỗ trợ của cửa sổ chính, nối với lõi Rust thật. Nghe sự kiện từ lúc mở cửa sổ (`main.tsx`), để chấm đỏ ở mục Hỗ trợ
// hiện cả khi màn hình Hỗ trợ chưa mở.
export const supportStore = createSupportStore(tauriIpc);

export function useSupport<T>(selector: (state: SupportStoreState) => T): T {
  return useStore(supportStore, selector);
}
```

Tạo `src/windows/main/screens/SupportScreen.tsx` với nội dung:

```tsx
import { useEffect } from "react";
import { fallbackLanguage, useApp, useT } from "../appStore";
import { useSupport } from "../supportStore";
import { SupportChat } from "./SupportChat";

// Màn hình Hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): chat với chủ dự án, dùng được với mọi người dùng kể cả Free và chưa có
// license. Mở màn hình thì báo phía Rust (bỏ chấm đỏ, hỏi tin mỗi 3 giây), đóng thì báo lại (chỉ còn hỏi mỗi 60 giây khi đang chờ
// trả lời và không đang dịch). Phần hiển thị ở `SupportChat`; đây chỉ nối store.
export function SupportScreen() {
  const t = useT();
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  const view = useSupport((s) => s.view);
  const pending = useSupport((s) => s.pending);
  const withMachineInfo = useSupport((s) => s.withMachineInfo);
  const machineInfo = useSupport((s) => s.machineInfo);
  const emailCard = useSupport((s) => s.emailCard);
  const emailError = useSupport((s) => s.emailError);
  const error = useSupport((s) => s.error);
  const deleting = useSupport((s) => s.deleting);
  const log = useSupport((s) => s.log);
  const open = useSupport((s) => s.open);
  const close = useSupport((s) => s.close);
  const send = useSupport((s) => s.send);
  const retry = useSupport((s) => s.retry);
  const setWithMachineInfo = useSupport((s) => s.setWithMachineInfo);
  const saveEmail = useSupport((s) => s.saveEmail);
  const dismissEmail = useSupport((s) => s.dismissEmail);
  const remove = useSupport((s) => s.remove);
  const attachLog = useSupport((s) => s.attachLog);
  useEffect(() => {
    void open();
    return () => {
      void close();
    };
  }, [open, close]);
  return (
    <SupportChat
      lang={lang}
      view={view}
      pending={pending}
      withMachineInfo={withMachineInfo}
      machineInfo={machineInfo}
      emailCard={emailCard}
      emailError={emailError}
      error={error}
      deleting={deleting}
      log={log}
      onSend={(text) => void send(text)}
      onRetry={(localId) => void retry(localId)}
      onToggleMachineInfo={setWithMachineInfo}
      onSaveEmail={(email) => void saveEmail(email)}
      onDismissEmail={dismissEmail}
      onDelete={() => void remove()}
      onAttachLog={() => void attachLog((id) => t("support.logMessage", { id }))}
    />
  );
}
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
import { UpgradeScreen } from "./screens/UpgradeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TranscriptScreen } from "./screens/TranscriptScreen";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];
```

và thay bằng:

```tsx
import { UpgradeScreen } from "./screens/UpgradeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { SupportScreen } from "./screens/SupportScreen";
import { TranscriptScreen } from "./screens/TranscriptScreen";
import { useSupport } from "./supportStore";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "support", "about"];
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  upgrade: "upgrade",
  about: "about",
};
```

và thay bằng:

```tsx
  upgrade: "upgrade",
  support: "support",
  about: "about",
};
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  upgrade: UpgradeScreen,
  about: About,
};
```

và thay bằng:

```tsx
  upgrade: UpgradeScreen,
  support: SupportScreen,
  about: About,
};
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
// Cửa sổ hẹp thì thanh điều hướng chỉ còn biểu tượng; tên màn hình vẫn là nhãn của nút (`aria-label`, `title`).
export function Shell() {
```

và thay bằng:

```tsx
// Cửa sổ hẹp thì thanh điều hướng chỉ còn biểu tượng; tên màn hình vẫn là nhãn của nút (`aria-label`, `title`). Mục Hỗ trợ có chấm
// đỏ khi có câu trả lời mới chưa xem (spec 2026-10-22-chat-ho-tro-zalo §4); nhãn của nút nói điều đó cho trình đọc màn hình.
export function Shell() {
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  const plan = useLicense((s) => s.view?.plan ?? null);
```

và thay bằng:

```tsx
  const plan = useLicense((s) => s.view?.plan ?? null);
  const unread = useSupport((s) => s.view?.unread ?? false);
```

Trong `src/windows/main/Shell.tsx`, tìm đoạn (duy nhất trong file):

```tsx
        {SCREENS.map((s) => (
          <button
            key={s}
            className={s === "upgrade" ? "nav-upgrade" : undefined}
            aria-current={s === screen ? "page" : undefined}
            aria-label={t(`nav.${s}`)}
            title={t(`nav.${s}`)}
            onClick={() => navigate(s)}
          >
            <Icon name={ICONS[s]} />
            <span>{t(`nav.${s}`)}</span>
          </button>
        ))}
```

và thay bằng:

```tsx
        {SCREENS.map((s) => {
          const dot = s === "support" && unread;
          const label = dot ? t("support.unread") : t(`nav.${s}`);
          return (
            <button
              key={s}
              className={s === "upgrade" ? "nav-upgrade" : undefined}
              aria-current={s === screen ? "page" : undefined}
              aria-label={label}
              title={label}
              onClick={() => navigate(s)}
            >
              <Icon name={ICONS[s]} />
              <span>{t(`nav.${s}`)}</span>
              {dot && <i className="nav-dot" aria-hidden="true" />}
            </button>
          );
        })}
```

Trong `src/windows/main/main.tsx`, tìm đoạn (duy nhất trong file):

```tsx
import { licenseStore } from "./licenseStore";
```

và thay bằng:

```tsx
import { licenseStore } from "./licenseStore";
import { supportStore } from "./supportStore";
```

Trong `src/windows/main/main.tsx`, tìm đoạn (duy nhất trong file):

```tsx
  .catch((e: unknown) => console.error("không đọc được bản quyền", e));
```

và thay bằng:

```tsx
  .catch((e: unknown) => console.error("không đọc được bản quyền", e));
// Chat hỗ trợ nghe sự kiện từ lúc mở cửa sổ: chấm đỏ ở mục Hỗ trợ hiện cả khi màn hình chưa mở. Không gọi mạng.
supportStore
  .getState()
  .init()
  .catch((e: unknown) => console.error("không khởi tạo được chat hỗ trợ", e));
```

Thêm vào **cuối** `src/styles/main.css` (sau dòng cuối cùng hiện có), nguyên văn:

```css

/* ================================================================ hỗ trợ (chat, spec 2026-10-22-chat-ho-tro-zalo §4) */

/* Chấm đỏ ở mục Hỗ trợ: có câu trả lời mới chưa xem. Cửa sổ hẹp (chỉ còn biểu tượng) thì nằm ở góc trên biểu tượng. */
.nav-dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  margin-left: auto;
  border-radius: 50%;
  background: var(--danger);
}

@media (max-width: 820px) {
  .nav button {
    position: relative;
  }
  .nav-dot {
    position: absolute;
    top: 0.4rem;
    right: 0.55rem;
    margin: 0;
  }
}

.support-chat {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.support-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.support-head .hint {
  margin: 0;
}

.support-menu {
  position: relative;
}

.support-menu > button {
  padding: 0 0.5rem;
}

.support-menu-list {
  position: absolute;
  top: calc(100% + 0.25rem);
  right: 0;
  z-index: 5;
  padding: 0.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

/* Danh sách tin: cuộn riêng, cao vừa cửa sổ (cỡ nhỏ nhất 720×480 vẫn thấy ô nhập). */
.support-log {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 8rem;
  max-height: max(10rem, calc(100vh - 30rem));
  padding: 0.75rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.msg {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  max-width: 80%;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-lg);
}

.msg.owner {
  align-self: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
}

.msg.customer {
  align-self: flex-end;
  background: var(--accent-soft);
}

.msg-text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.msg-status {
  align-self: flex-end;
  color: var(--muted);
  font-size: 0.86rem;
}

.msg-status.error {
  align-self: flex-start;
  color: var(--danger);
}

.msg.customer.failed {
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
}

.msg-retry {
  align-self: flex-end;
  font-size: 0.86rem;
}

.support-compose {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.support-compose textarea {
  width: 100%;
  min-height: 4.5rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  background: var(--surface);
  resize: vertical;
}

.support-compose textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--focus);
  outline: none;
}

.support-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.support-actions .primary {
  margin-left: auto;
}

.support-counter {
  margin: 0;
  font-size: 0.86rem;
}

.support-machine .consent {
  margin-top: 0;
}

/* Dòng thông tin máy hiện nguyên văn như sẽ gửi. */
.support-machine-line {
  display: block;
  margin: 0.25rem 0 0 1.6rem;
  color: var(--muted);
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

.support-email {
  position: relative;
  padding: 0.75rem 2.5rem 0.75rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}

.support-email label {
  display: block;
}

.support-email .row {
  margin-bottom: 0;
}

.support-email .note {
  margin: 0;
}

.support-email-close {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  padding: 0 0.4rem;
}

.support-blocked {
  margin: 0;
}

.support-foot {
  margin: 0;
  text-align: center;
}

.support-foot button.link {
  font-size: inherit;
}

.support-privacy .row h2 {
  margin: 0;
}
```

- [ ] **Step 4: Chạy, thấy qua**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  28 passed (28)`, `Tests  359 passed (359)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm build 2>&1 | tail -3
```
Expected: kết thúc không lỗi (cảnh báo `Some chunks are larger than 500 kB` là cảnh báo có sẵn của bundle chính).

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add src/lib/ipc.ts src/windows/main/Shell.tsx src/windows/main/main.tsx src/styles/main.css src/windows/main/supportStore.ts src/windows/main/screens/SupportScreen.tsx && git commit -m "feat(app): mục Hỗ trợ trong thanh bên, chấm đỏ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 13: IPC giả của trang xem trước và kiểm DOM thật ở năm ngôn ngữ

**Files:**
- Modify: `scripts/ui-preview/check-i18n.mjs`, `scripts/ui-preview/tauri-mock.ts`

`check-i18n.mjs` chạy trang xem trước (Vite, IPC giả) trong Chrome không đầu ở 960×640 và 720×480: chữ không tràn ô, trang không cuộn ngang, cộng điều kiện riêng của từng cảnh và các lần bấm thật (gõ, Enter, Shift+Enter, gửi lỗi rồi gửi lại, tin đầu vào lúc chat tắt, thẻ email, menu ⋯ xóa, đính kèm log, mở chính sách). IPC giả `send=disabled` làm như lõi Rust: phát `support://view` có `enabled: false` rồi trả lỗi `supportDisabled`. Mỗi cảnh chụp ảnh PNG vào `target/ui-preview/ui-ja-zh-ko/` (không commit). Bản dev chạy React `StrictMode` (hiệu ứng chạy hai lần: mở, đóng, mở), nên điều kiện đếm lệnh mở màn hình dùng `> 0`, không `=== 1`.

- [ ] **Step 1: Viết điều kiện trước (đỏ)**

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
// lỗi, bị chặn vì bản quyền, hộp quyền Trợ năng, chỉ chép, giao diện tối. Ảnh PNG cho người kiểm xem ở
```

và thay bằng:

```js
// lỗi, bị chặn vì bản quyền, hộp quyền Trợ năng, chỉ chép, giao diện tối. Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): mục Hỗ
// trợ giữa Nâng cấp và Giới thiệu, chấm đỏ, chữ của hợp đồng phía khách, ô "Gửi kèm thông tin máy", gửi bằng Enter (Shift+Enter xuống
// dòng), tin gửi lỗi và gửi lại, thẻ email, menu ⋯ xóa, đính kèm log, chính sách mở trong app, chat tắt và cuộc chat đóng. Ảnh PNG
// cho người kiểm xem ở
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
// [tên, tham số URL, tùy chọn { prepare: biểu thức chạy trước khi kiểm, wait: ms, interact: async (page, ck, lang) bấm thật }]
const SCREENS = [
```

và thay bằng:

```js
// ---------------------------------------------------------------- chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4)

const TEXTAREA = ".support-compose textarea";
const TWO_LINES = JSON.stringify("Dòng một\ndòng hai");
const SEND = '.support-compose button[type="submit"]';
// Các lần gọi một lệnh của IPC giả (window.__ipcCalls).
const callsOf = (cmd) => `window.__ipcCalls.filter((c) => c.cmd === ${JSON.stringify(cmd)})`;

// Shift+Enter trong ô nhập: xuống dòng (trình duyệt tự chèn, giao diện không chặn).
async function shiftEnter(page) {
  const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 };
  await page.s.send("Input.dispatchKeyEvent", { type: "keyDown", text: "\r", ...key });
  await page.s.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
  await sleep(100);
}

// Bấm thật: gõ hai dòng (Shift+Enter xuống dòng), Enter gửi; đang gửi hiện "Đang gửi…"; lệnh gửi nhận đúng chữ và cờ thông tin
// máy (tích sẵn); gửi xong tin ghi "Đã gửi", ô tích biến mất, thẻ email hiện; lưu email thì gọi lệnh lưu và thẻ báo đã lưu.
async function supportSendFirst(page, ck, lang) {
  await type(page, TEXTAREA, "Dòng một");
  await shiftEnter(page);
  await type(page, TEXTAREA, "dòng hai");
  await ck(`document.querySelector(${JSON.stringify(TEXTAREA)}).value === ${TWO_LINES}`, "Shift+Enter xuống dòng, không gửi");
  await ck(`${callsOf("support_send")}.length === 0`, "chưa gửi gì");
  await page.press("Enter");
  await sleep(150);
  await ck(
    inPage(lang, `return document.querySelector(".msg.customer.sending .msg-status")?.textContent === t("support.sending");`),
    "đang gửi: tin hiện ngay với support.sending",
  );
  await ck(`document.querySelector(${JSON.stringify(TEXTAREA)}).value === ""`, "gửi thì ô nhập trống");
  await sleep(700);
  await ck(
    `(() => { const c = ${callsOf("support_send")}; return c.length === 1 && c[0].args.text === ${TWO_LINES} && c[0].args.withMachineInfo === true; })()`,
    "Enter gửi đúng một lệnh support_send, kèm thông tin máy (ô tích sẵn)",
  );
  await ck(
    inPage(lang, `const m = document.querySelector(".msg.customer:not(.sending)"); return !!m && m.querySelector(".msg-status").textContent === t("support.sent");`),
    "gửi xong: tin ghi support.sent",
  );
  await ck(`!document.querySelector(".support-machine")`, "đã có cuộc chat: ô Gửi kèm thông tin máy biến mất");
  await ck(
    inPage(lang, `return document.querySelector(".support-email label")?.textContent === t("support.email.prompt");`),
    "sau tin đầu tiên: thẻ email (support.email.prompt)",
  );
  await type(page, "#support-email", "khach@example.com");
  await page.click('.support-email button[type="submit"]');
  await sleep(500);
  await ck(
    `(() => { const c = ${callsOf("support_set_email")}; return c.length === 1 && c[0].args.email === "khach@example.com"; })()`,
    "Lưu gọi support_set_email với đúng email",
  );
  await ck(inPage(lang, `return document.querySelector(".support-email").textContent.includes(t("support.email.saved"));`), "thẻ báo support.email.saved");
}

// Bấm thật: gửi lỗi (`send=ratelimited`): tin ở lại với câu lỗi đúng mã và nút gửi lại; bấm gửi lại thì gọi lệnh lần nữa với đúng chữ.
async function supportSendFails(page, ck, lang) {
  await type(page, TEXTAREA, "Còn đó không?");
  await page.click(SEND);
  await sleep(800);
  await ck(
    inPage(
      lang,
      `const m = document.querySelector(".msg.customer.failed"); return !!m && m.querySelector(".msg-status.error").textContent === t("error.supportRateLimited") && m.querySelector(".msg-retry").textContent === t("support.failed");`,
    ),
    "gửi lỗi: câu error.supportRateLimited và nút support.failed",
  );
  await page.click(".msg-retry");
  await sleep(800);
  await ck(
    `(() => { const c = ${callsOf("support_send")}; return c.length === 2 && c.every((x) => x.args.text === "Còn đó không?" && x.args.withMachineInfo === false); })()`,
    "gửi lại đúng nội dung đó (đã có cuộc chat: không kèm thông tin máy)",
  );
}

// Bấm thật: menu ⋯ › Xóa cuộc trò chuyện hỏi lại; Hủy thì không xóa; đồng ý thì gọi lệnh xóa, về trạng thái mới (ô tích hiện lại).
async function supportDelete(page, ck, lang) {
  await page.click(".support-menu > button");
  await ck(inPage(lang, `return document.querySelector(".support-menu-list button")?.textContent === t("support.delete");`), "menu ⋯ có support.delete");
  await page.click(".support-menu-list button");
  await ck(inPage(lang, `return document.querySelector(".support-chat .confirm span")?.textContent === t("support.delete.confirm");`), "hỏi lại trước khi xóa");
  await page.click(".support-chat .confirm button:not(.danger)");
  await ck(`!document.querySelector(".support-chat .confirm") && ${callsOf("support_delete")}.length === 0`, "Hủy thì không xóa");
  await page.click(".support-menu > button");
  await page.click(".support-menu-list button");
  await page.click(".support-chat .confirm button.danger");
  await sleep(300);
  await ck(`${callsOf("support_delete")}.length === 1`, "đồng ý thì gọi đúng một lệnh support_delete");
  await ck(`document.querySelectorAll(".support-log .msg").length === 1 && !!document.querySelector(".support-machine")`, "về trạng thái mới: chỉ còn lời chào, ô tích hiện lại");
}

// Bấm thật: chưa có cuộc chat, chat đã tắt (`send=disabled`): gửi tin đầu thì tin đó báo lỗi và ô nhập thành dòng chat tắt.
async function supportSendDisabled(page, ck, lang) {
  await type(page, TEXTAREA, "Chào");
  await page.press("Enter");
  await sleep(800);
  await ck(
    inPage(lang, `return document.querySelector(".msg.customer.failed .msg-status.error")?.textContent === t("error.supportDisabled");`),
    "tin đầu báo lỗi error.supportDisabled",
  );
  await ck(
    inPage(lang, `return !document.querySelector(${JSON.stringify(TEXTAREA)}) && document.querySelector(".support-blocked")?.textContent === t("error.supportDisabled");`),
    "ô nhập thành dòng error.supportDisabled",
  );
}

// Bấm thật: "Đính kèm log" chạy lệnh của nút Gửi log cho hỗ trợ, rồi gửi tin chứa mã báo cáo.
async function supportAttachLog(page, ck, lang) {
  await page.click(".support-actions button.ghost");
  await sleep(1400);
  await ck(`${callsOf("send_log_report")}.length === 1`, "đúng một lệnh send_log_report");
  await ck(
    inPage(lang, `const c = ${callsOf("support_send")}; return c.length === 1 && c[0].args.text === t("support.logMessage", { id: "R-7F3K-92QD" });`),
    "gửi tin support.logMessage với mã R-7F3K-92QD",
  );
}

// Bấm thật: "Quyền riêng tư" ở chân khung mở chính sách ngay trong app.
async function supportPrivacy(page, ck) {
  await page.click(".support-foot button.link");
  await sleep(900);
  await ck(`!!document.querySelector(".support-privacy .legal")`, "mở chính sách quyền riêng tư trong app");
}

// [tên, tham số URL, tùy chọn { prepare: biểu thức chạy trước khi kiểm, wait: ms, interact: async (page, ck, lang) bấm thật }]
const SCREENS = [
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
  ["about", "screen=about"],
```

và thay bằng:

```js
  // Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4).
  ["support", "screen=support"],
  ["support-windows", "screen=support&platform=windows"],
  ["support-chat", "screen=support&chat=open"],
  ["support-chat-dark", "screen=support&chat=open&theme=dark"],
  ["support-unread", "screen=home&chat=unread"],
  ["support-off", "screen=support&chat=open&support=off"],
  ["support-closed", "screen=support&chat=open&support=closed"],
  ["support-send", "screen=support", { interact: supportSendFirst }],
  ["support-send-failed", "screen=support&chat=open&send=ratelimited", { interact: supportSendFails }],
  ["support-send-disabled", "screen=support&send=disabled", { interact: supportSendDisabled }],
  ["support-delete", "screen=support&chat=open", { interact: supportDelete }],
  ["support-log", "screen=support&chat=open", { interact: supportAttachLog }],
  ["support-privacy", "screen=support", { interact: supportPrivacy }],
  ["about", "screen=about"],
```

Trong `scripts/ui-preview/check-i18n.mjs`, tìm đoạn (duy nhất trong file):

```js
  "settings-privacy-off": () => [
```

và thay bằng:

```js
  // Chưa có cuộc chat: chữ của hợp đồng phía khách, ô tích sẵn và dòng thông tin máy, mục Hỗ trợ giữa Nâng cấp và Giới thiệu, mở màn
  // hình không gọi lệnh nào ra mạng.
  support: (lang) => [
    [inPage(lang, `return document.querySelector(".support-head .hint").textContent === t("support.subtitle");`), "dòng phụ support.subtitle"],
    [inPage(lang, `return document.querySelector(".support-log .msg.owner .msg-text").textContent === t("support.greeting");`), "lời chào support.greeting"],
    [
      inPage(lang, `return document.querySelector(".support-foot").textContent === t("support.footer") + " · " + t("support.privacy");`),
      "chân khung support.footer · support.privacy",
    ],
    [`document.querySelector(".support-machine input[type=checkbox]")?.checked === true`, "ô Gửi kèm thông tin máy tích sẵn"],
    [`document.querySelector(".support-machine-line")?.textContent.includes(" · UI ") === true`, "dòng thông tin máy hiện nguyên văn"],
    [`document.querySelector(${JSON.stringify(SEND)}).disabled === true`, "ô trống: nút Gửi bị khóa"],
    [
      `${callsOf("support_screen")}.some((c) => c.args.open === true) && window.__ipcCalls.every((c) => !["support_fetch", "support_send", "support_set_email", "support_delete"].includes(c.cmd))`,
      "mở màn hình khi chưa có cuộc chat: chỉ báo mở, không lệnh nào gọi mạng",
    ],
    [
      inPage(
        lang,
        `const b = [...document.querySelectorAll(".nav button")]; return b.length === 8 && b[5].textContent === t("nav.upgrade") && b[6].textContent === t("nav.support") && b[6].getAttribute("aria-current") === "page" && b[7].textContent === t("nav.about");`,
      ),
      "mục Hỗ trợ nằm giữa Nâng cấp và Giới thiệu",
    ],
    [`!document.querySelector(".nav-dot")`, "không có chấm đỏ"],
  ],
  "support-windows": () => [
    [`document.querySelector(".support-machine-line")?.textContent.includes("Windows 11 (26100)") === true`, "dòng thông tin máy của Windows"],
  ],
  // Đã có cuộc chat: lấy cả cuộc chat, không còn ô tích, có menu ⋯.
  "support-chat": (lang) => [
    [`document.querySelectorAll(".support-log .msg").length === 3`, "lời chào và hai tin của cuộc chat"],
    [`!document.querySelector(".support-machine")`, "không còn ô Gửi kèm thông tin máy"],
    [inPage(lang, `return document.querySelector(".support-menu > button")?.getAttribute("aria-label") === t("support.menu");`), "có menu ⋯ (support.menu)"],
    [`${callsOf("support_fetch")}.length > 0`, "đã có cuộc chat: lấy cả cuộc chat"],
  ],
  // Câu trả lời chưa xem: chấm đỏ ở mục Hỗ trợ, nhãn của nút nói có câu trả lời mới.
  "support-unread": (lang) => [
    [
      inPage(lang, `const b = [...document.querySelectorAll(".nav button")][6]; return !!b.querySelector(".nav-dot") && b.getAttribute("aria-label") === t("support.unread");`),
      "mục Hỗ trợ có chấm đỏ và nhãn support.unread",
    ],
  ],
  "support-off": (lang) => [
    [`!document.querySelector(${JSON.stringify(TEXTAREA)})`, "chat tắt: không có ô nhập"],
    [inPage(lang, `return document.querySelector(".support-blocked").textContent === t("error.supportDisabled");`), "dòng error.supportDisabled thay ô nhập"],
    [`document.querySelectorAll(".support-log .msg").length === 3`, "lịch sử cũ vẫn hiện"],
  ],
  "support-closed": (lang) => [
    [`!document.querySelector(${JSON.stringify(TEXTAREA)})`, "cuộc chat đóng: không có ô nhập"],
    [inPage(lang, `return document.querySelector(".support-blocked").textContent === t("error.supportClosed");`), "dòng error.supportClosed thay ô nhập"],
  ],
  "settings-privacy-off": () => [
```

- [ ] **Step 2: Chạy, thấy đỏ**

Chạy Vite của trang xem trước ở cổng 1431 **ở nền** (ghi nhớ đã mở để tắt ở Task 14):

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vite --config scripts/ui-preview/vite.config.ts --port 1431 --strictPort
```
```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:1431/
```
Expected: `200`. Cổng bận thì Vite báo lỗi và thoát: dừng lại, đừng tắt tiến trình không phải của bạn.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ONLY=support node scripts/ui-preview/check-i18n.mjs vi 2>&1 | tail -12
```
Expected: thoát mã 1 với nhiều điều kiện sai, ví dụ `vi/960x640/support: dòng thông tin máy hiện nguyên văn (được false)`: IPC giả chưa có lệnh `support_*` nên trả `null`.

- [ ] **Step 3: IPC giả của chat hỗ trợ**

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
//   screen=home|transcript|history|glossary|settings|upgrade|about  group=general|subtitles|audio|model|hotkeys|license|privacy
```

và thay bằng:

```ts
//   screen=home|transcript|history|glossary|settings|upgrade|support|about  group=general|subtitles|audio|model|hotkeys|license|privacy
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
//   video giới thiệu (scripts/demo-video
```

và thay bằng:

```ts
//   chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo §4): chat=none|open|unread (chưa có cuộc chat, mặc định; cuộc chat mẫu một hỏi
//     một đáp; như open mà câu trả lời chưa xem, mục Hỗ trợ có chấm đỏ)  support=off|closed (chủ dự án tắt chat; cuộc chat bị chặn)
//     send=failed|ratelimited|busy|expired|disabled (kết quả của lệnh gửi tin; disabled: chat đã tắt, như phía Rust báo trạng
//     tắt qua sự kiện rồi trả lỗi)  email=invalid (lưu email lỗi sai dạng)
//   video giới thiệu (scripts/demo-video
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
  Settings,
  Subtitle,
} from "../../src/lib/ipc";
```

và thay bằng:

```ts
  Settings,
  Subtitle,
  SupportView,
} from "../../src/lib/ipc";
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
// ---------------------------------------------------------------- sự kiện
```

và thay bằng:

```ts
// ---------------------------------------------------------------- chat hỗ trợ

// Cuộc chat mẫu theo ngôn ngữ giao diện: [câu hỏi của khách, câu trả lời của chủ dự án].
const SUPPORT_SAMPLE: Record<UiLang, [string, string]> = {
  vi: [
    "Phụ đề không hiện khi họp Teams",
    "Chào bạn, bạn đang dùng macOS bản nào? Bạn thử chọn nguồn âm thanh là Microsoft Teams ở màn hình chính nhé.",
  ],
  en: [
    "Subtitles don't show up during Teams meetings",
    "Hi! Which macOS version are you on? Please try choosing Microsoft Teams as the audio source on the home screen.",
  ],
  ja: [
    "Teams の会議中に字幕が表示されません",
    "こんにちは。macOS のバージョンを教えてください。ホーム画面で音声ソースに Microsoft Teams を選んでみてください。",
  ],
  zh: ["开 Teams 会议时字幕不显示", "你好！你用的是哪个 macOS 版本？请在主屏幕把音频来源选为 Microsoft Teams 试试。"],
  ko: [
    "Teams 회의 중에 자막이 나오지 않아요",
    "안녕하세요! 어떤 macOS 버전을 쓰고 계신가요? 홈 화면에서 오디오 소스를 Microsoft Teams로 선택해 보세요.",
  ],
};
const PLAN_NAMES = { free: "Free", monthly: "Monthly", six_months: "6 Months", yearly: "Yearly" } as const;

function supportStart(): SupportView {
  const chat = param("chat", "none");
  const [question, answer] = pick(SUPPORT_SAMPLE);
  const t0 = sec(now) - 600;
  const messages =
    chat === "open" || chat === "unread"
      ? [
          { id: 41, sender: "customer" as const, text: question, createdAt: t0 },
          { id: 42, sender: "owner" as const, text: answer, createdAt: t0 + 300 },
        ]
      : [];
  return {
    enabled: param("support") !== "off",
    closed: param("support") === "closed",
    hasConversation: messages.length > 0,
    messages,
    unread: chat === "unread",
    rev: 1,
  };
}
let supportView = supportStart();

function changeSupport(patch: Partial<SupportView>): SupportView {
  supportView = { ...supportView, ...patch, rev: supportView.rev + 1 };
  return supportView;
}

// Dòng thông tin máy mẫu như phía Rust dựng (`support::context::line`), theo hệ điều hành, gói và ngôn ngữ giao diện.
function machineLine(): string {
  const os =
    platform === "macos"
      ? "macOS 15.6 · Apple M4 Pro · 24 GB"
      : "Windows 11 (26100) · Intel(R) Core(TM) i5-1345U · 16 GB · GPU Intel(R) Iris(R) Xe Graphics";
  return `${info.name} ${info.version} · ${os} · ${PLAN_NAMES[plan]} · ${lang === "vi" ? "Chuẩn" : "Standard"} · UI ${lang}`;
}

// ---------------------------------------------------------------- sự kiện
```

Trong `scripts/ui-preview/tauri-mock.ts`, tìm đoạn (duy nhất trong file):

```ts
  check_for_updates: async () => {
```

và thay bằng:

```ts
  // Chat hỗ trợ: trạng thái trong bộ nhớ theo `chat=`, `support=`; gửi tin sau nửa giây, hay đúng lỗi của lệnh thật theo `send=`.
  support_screen: ({ open }) => changeSupport(open ? { unread: false } : {}),
  support_fetch: () => changeSupport({}),
  support_machine_info: () => machineLine(),
  support_send: async ({ text }) => {
    await wait(500);
    const codes: Record<string, string> = {
      failed: "supportOffline",
      ratelimited: "supportRateLimited",
      busy: "supportBusy",
      expired: "supportExpired",
    };
    const code = codes[param("send")];
    if (code) throw { code, field: null, message: "…" };
    if (param("send") === "disabled") {
      emit("support://view", changeSupport({ enabled: false }));
      throw { code: "supportDisabled", field: null, message: "…" };
    }
    const id = Math.max(42, ...supportView.messages.map((m) => m.id)) + 1;
    return changeSupport({
      hasConversation: true,
      messages: [...supportView.messages, { id, sender: "customer", text, createdAt: sec(Date.now()) }],
    });
  },
  support_set_email: async () => {
    await wait(300);
    if (param("email") === "invalid") throw { code: "supportInvalid", field: "email", message: "…" };
    return null;
  },
  support_delete: () => changeSupport({ hasConversation: false, messages: [], unread: false }),
  check_for_updates: async () => {
```

- [ ] **Step 4: Chạy, thấy qua ở năm ngôn ngữ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec tsc --noEmit
```
Expected: không in gì (`tsconfig.json` có cả `tauri-mock.ts`).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ONLY=support node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -4
```
Expected: `Đạt: vi, en, ja, zh, ko. Ảnh ở …/target/ui-preview/ui-ja-zh-ko`. Mất vài phút.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current
```
Expected: `main`. Ra nhánh khác thì dừng lại, đừng commit.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git add scripts/ui-preview/check-i18n.mjs scripts/ui-preview/tauri-mock.ts && git commit -m "test(app): kiểm giao diện màn hình Hỗ trợ ở năm ngôn ngữ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: một commit mới; `git status --short` không còn file nào của task này (các file tài liệu chưa commit của phiên khác vẫn ở đó, đừng add).

---

### Task 14: Kiểm tra toàn bộ và hoàn tất

**Files:** không sửa file (trừ khi một bước dưới đây đỏ: sửa đúng chỗ đó, chạy lại, commit riêng).

- [ ] **Step 1: Kiểm toàn bộ giao diện ở năm ngôn ngữ (mọi màn hình, không chỉ Hỗ trợ)**

Vite của Task 13 vẫn chạy ở cổng 1431. Mục mới làm thanh bên có 8 nút: kiểm lại mọi màn hình cũ ở cả hai cỡ cửa sổ.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -6
```
Expected: `Đạt: vi, en, ja, zh, ko. …`. Mất khoảng 25–35 phút. Trên bản sao, một lần chạy có 3 điều kiện sai ở `zh/960x640/upgrade-start-card` và `upgrade-start-qr` (trang chưa vẽ kịp: `<html lang> … (được false)`, `không thấy .plan:has(…)`); chạy lại `ONLY=upgrade node scripts/ui-preview/check-i18n.mjs zh` thì đạt. Đó là lỗi chập chờn có sẵn của màn hình Nâng cấp khi máy bận, không do kế hoạch này: gặp lại thì chạy lại riêng màn hình đó. Điều kiện sai ở màn hình `support*` hay ở thanh bên thì phải sửa.

- [ ] **Step 2: Xem ảnh chụp**

Mở các ảnh trong `target/ui-preview/ui-ja-zh-ko/` và nhìn bằng mắt (không commit ảnh): `vi.960x640.support.png` (chưa có cuộc chat: lời chào, ô tích sẵn, dòng thông tin máy), `vi.960x640.support-send.png` (tin "Đã gửi", thẻ email đã lưu), `ja.720x480.support-chat.png` (cửa sổ nhỏ nhất: thanh bên chỉ còn biểu tượng, vẫn thấy ô nhập), `vi.960x640.support-unread.png` (chấm đỏ ở mục Hỗ trợ), `ko.960x640.support-send-failed.png` (tin lỗi, câu lỗi, nút gửi lại), `en.960x640.support-off.png`, `zh.960x640.support-closed.png`, `vi.960x640.support-chat-dark.png` (giao diện tối), `vi.960x640.support-privacy.png` (chính sách mở trong app). Chữ không bị cắt, không chồng lên nhau.

- [ ] **Step 3: Tắt Vite đã mở ở Task 13**

Tắt đúng tiến trình nền mình đã mở (TaskStop hay Ctrl+C), rồi kiểm cổng đã trống:

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && lsof -nP -iTCP:1431 -sTCP:LISTEN | head -3
```
Expected: không in gì. Đừng tắt tiến trình không do mình mở.

- [ ] **Step 4: Bộ kiểm tra đầy đủ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo fmt --all -- --check
```
Expected: không in gì (exit 0).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | grep -E "^(error|warning)|Finished"
```
Expected: chỉ `Finished …` (cảnh báo có sẵn của `third_party/whisper-rs-sys/build.rs` không tính).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && sh scripts/check-windows.sh --locked 2>&1 | grep -E "^(error|warning)|Finished"
```
Expected: chỉ `Finished …`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cargo test --locked -p meeting-translator --lib 2>&1 | grep "test result"
```
Expected: `test result: ok. 798 passed; 0 failed; 6 ignored; …`

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm build 2>&1 | tail -3
```
Expected: kết thúc không lỗi.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `Test Files  28 passed (28)`, `Tests  359 passed (359)`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git status --short
```
Expected: không còn file nào của kế hoạch này chưa commit (chỉ còn các file của phiên khác, nếu có).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git log --oneline -14
```
Expected: 13 commit của Task 1–13 nằm trên cùng, theo thứ tự.

- [ ] **Step 5: Báo cáo cho chủ dự án**

Báo: số test (Rust 753 → 798, giao diện 331 → 359), các commit, ảnh đã xem. **Chưa push, chưa phát hành.** Còn lại sau kế hoạch này (không thuộc kế hoạch 03):
- server của kế hoạch 01 phải deploy trước app 0.2.4 (đúng thứ tự spec §7); trước đó các đường `/v1/support/*` trả `404` và màn hình Hỗ trợ báo `error.supportOffline` (client coi `404` như không gọi được);
- A7 bằng proxy (spec §6): chưa dùng chat thì 0 kết nối mới; dùng chat thì chỉ tới `api.`; đang dịch mà màn hình Hỗ trợ đóng thì không có request chat;
- thử tay sau deploy (chủ dự án nhắn từ app, trả lời có mã và không mã, `/tat`, `/bat`), thử trên Windows thật (dòng thông tin máy có `GPU …`);
- kế hoạch 04 (chính sách 1.5, A7 trong spec gốc, website) và phát hành 0.2.4.

---

## Tự rà kế hoạch

**Phủ mục 4 của spec:**

| Yêu cầu | Task |
|---|---|
| `support` trong `SCREENS` giữa Nâng cấp Pro và Giới thiệu, biểu tượng riêng, chữ năm ngôn ngữ | 12 (Shell, `Screen`), 11 (biểu tượng `support`), 10 (`nav.support`); kiểm thứ tự ở Task 13 (`support`) |
| Dùng được với mọi người dùng, kể cả Free và chưa có license | Không có `pro::require` nào trong `support/`; lệnh không đọc bản quyền ngoài tên gói của dòng thông tin máy (Task 7) |
| Giao diện như website: lời chào, trạng thái tin, thẻ email, menu ⋯ Xóa (hỏi lại), chân "lưu 90 ngày · Quyền riêng tư" mở chính sách trong app | 11 (`SupportChat`, test chữ hợp đồng năm ngôn ngữ), 13 (bấm thật: xóa, email, chính sách) |
| "Gửi kèm thông tin máy": tích sẵn, bỏ tích được, chỉ trước tin đầu và chỉ kèm tin đầu, hiện nguyên văn; nội dung đủ 8 mục; không bao giờ có key, email license, mã máy, tên máy, tên người dùng | 4 (`context.rs`), 7 (`machine_facts`, test `the_machine_line_never_carries_identity`, `the_first_message_carries_…_only_when_ticked`), 6 (`start` chỉ ở tin đầu), 9, 11, 13 |
| "Đính kèm log": đúng luồng "Gửi log cho hỗ trợ", thành công thì gửi tin "📎 … R-XXXX-XXXX", lỗi thì lỗi của luồng đó | 9 (`attachLog`, test), 11 (lỗi dưới nút), 13 (`support-log`) |
| `support.json` trong thư mục dữ liệu, không dùng kho khóa | 1, 7 (`install`: `app_local_data_dir/support.json`) |
| Nhịp hỏi: 3 s / 15 s sau 2 phút; 60 s khi chờ trả lời và không dịch; không kết nối khi chưa dùng chat; Rust điều khiển, giao diện nhận sự kiện | 2 (luật), 6 (`tick` với đồng hồ giả: `an_open_screen_polls_…`, `waiting_for_a_reply_…`, `without_a_conversation_nothing_connects…`, `a_hidden_window_…`), 7 (`AppHost`, luồng nền, `support://view`) |
| Chấm đỏ khi có trả lời | 6 (`a_reply_while_the_screen_is_closed_lights_the_red_dot…`), 12 (Shell), 13 (`support-unread`) |
| IPC `support_fetch`, `support_send`, `support_set_email`, `support_delete`, lệnh dòng thông tin máy; ACL và `acl_tests.rs` | 8 (không có `support_status`, thêm `support_screen`: quyết định 2, 5) |
| Bản debug gửi `source: "app-debug"` | 7 (`source()`, test) |

**Phủ phần app của mục 6:** test Rust cho client với API giả (Task 3, server TCP giả), luật nhịp (Task 2 thuần, Task 6 theo từng giây: 3 s, 15 s, 60 s, dừng khi dịch, không kết nối khi chưa dùng chat kể cả khi mở màn hình; Task 7 với app giả: `opening_the_screen_without_a_conversation_makes_no_request`), dòng thông tin máy không có key/email/mã máy (Task 4, Task 7); vitest cho store (Task 9, 13 test) và màn hình (Task 11, 15 test); `check-i18n` năm ngôn ngữ và ảnh chụp (Task 13, 14). Proxy A7 và thử tay cần server thật: ngoài kế hoạch (Task 14 Step 5).

**Phủ hợp đồng phía khách:** nhịp và `429` (`Retry-After` tối thiểu 15 s), lỗi mạng 3 → 15 → 60 s (Task 2, 3, 6); lưu `{ token, lastId, waitingSince }` + `unread`, `401` thì xóa bản lưu (Task 1, 6); lịch sử `after=0` khi mở (Task 6 `fetch`, Task 9 `open`); gửi tin hiện ngay "đang gửi", `201` thì "Đã gửi", lỗi thì "Không gửi được, thử lại" (Task 9, 11, 13); ô email sau tin đầu tới khi lưu hay đóng (Task 9, 11, 13); xóa hỏi lại, `200`/`401` thì về trạng thái mới (Task 6, 11, 13); khi tắt (thân `GET messages`, hay `503` của tin gửi, kể cả tin đầu) hay đóng thì thay ô nhập, lịch sử vẫn hiện (Task 6, 9, 11, 13); lời chào, dòng phụ, chân khung nguyên văn năm ngôn ngữ (Task 10, 11). Kiểm trước nội dung: chữ 1–1000 code point sau khi chuẩn hóa xuống dòng và bỏ ký tự điều khiển, email theo dạng `parseEmail` (Task 6 `clean_text`, `clean_email`; Task 9 chặn sớm ở giao diện).

**Tên nhất quán giữa Rust, IPC và TypeScript:**

| Rust | IPC / TypeScript |
|---|---|
| `support::chat::SupportView { enabled, closed, has_conversation, messages, unread, rev }` (`serde(rename_all = "camelCase")`) | `SupportView { enabled, closed, hasConversation, messages, unread, rev }` (`src/lib/ipc.ts`) |
| `support::api::SupportMessage { id, sender, text, created_at }` (đọc `created_at`, gửi `createdAt`) | `SupportMessage { id, sender: "customer" \| "owner", text, createdAt }` |
| `commands::support_send(text, with_machine_info)` | `support_send: { text, withMachineInfo }` (Tauri đổi tham số sang camelCase) |
| `commands::support_screen(open)`, `support_set_email(email: Option<String>)` | `{ open: boolean }`, `{ email: string \| null }` |
| `events::SUPPORT_VIEW = "support://view"` | `Events["support://view"]: SupportView` |
| `errors::SUPPORT_*` = `supportOffline` … `supportInvalid` | `error.supportOffline` … `error.supportInvalid` ở năm từ điển |

**Quét chỗ trống:** không có "TBD", "TODO", "tương tự Task N"; mọi bước sửa mã có mã đầy đủ; mọi đoạn "tìm … thay bằng …" đã được máy áp lên bản gốc theo đúng thứ tự và ra đúng các file đã chạy thật.

## Chỗ cần kế hoạch 04 và chủ dự án biết

- **Không dùng `GET /v1/support/status` ở app** (quyết định 5): chưa từng nhắn thì app không kết nối gì cho chat, kể cả khi mở màn hình Hỗ trợ; khớp câu của kế hoạch 04. Đường đó chỉ còn website dùng.
- **Hai chỗ spec và hợp đồng lệch nhau** (app không phụ thuộc, nhưng kế hoạch 01 nên chốt): spec §2.2 ghi mã `invalid_input` và thân tối đa 4 KB, hợp đồng ghi `invalid_request` và 16 KiB. Với 4 KB, một tin 1000 ký tự toàn chữ CJK hay emoji (3–4 byte mỗi ký tự) cộng dòng thông tin máy có thể vượt; app coi mọi `400`/`413` là `supportInvalid`.
- `support.json` của app có thêm khóa `unread` (quyết định 6).
