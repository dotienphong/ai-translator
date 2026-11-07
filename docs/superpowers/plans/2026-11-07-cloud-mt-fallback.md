# Cloud MT (ChatGPT & Gemini) with Automatic Local Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép người dùng chọn nguồn dịch giữa Model Local, ChatGPT (OpenAI API) và Gemini (Google API) kèm Dropdown chọn model, lưu API Key an toàn vào Keystore, tự động dự phòng (fallback) tức thì về Model Local khi mất mạng hoặc lỗi API, và hiển thị nhãn nguồn đang dịch ngay trên khung dịch (`Overlay` và `Compose`).

**Architecture:** Giữ nguyên cơ chế nạp sẵn `asr-worker` và `llama-server` (`SidecarManager`) để đảm bảo tương thích 100% cho người dùng mới/cũ và chuyển đổi dự phòng 0 giây chờ. Cài đặt module `cloud_mt` (`CloudMt` + `FallbackMt`) thực thi trait `pipeline::translate::Mt` dùng chung cho cả phiên dịch phụ đề (`session.rs`) lẫn Gõ dịch (`compose/mod.rs`), tự động chuyển sang `LocalMt` đến hết phiên khi gặp bất kỳ lỗi mạng/API nào và phát trạng thái cập nhật lên giao diện.

**Tech Stack:** Rust (`tauri`, `reqwest::blocking`, `serde`, `keyring-core`), TypeScript, React 19, Zustand, Vitest, Cargo test.

**Spec:** `docs/superpowers/specs/2026-11-07-cloud-mt-fallback-design.md`

## Global Constraints

- Mặc định `translationProvider = "local"` cho cả người dùng cài mới lẫn người dùng cũ cập nhật lên; không thay đổi hành vi hiện tại trừ khi người dùng tự chọn `openai` hoặc `gemini`.
- Dropdown model của ChatGPT (`openaiModel`): `["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"]`, mặc định `"gpt-4o-mini"`.
- Dropdown model của Gemini (`geminiModel`): `["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"]`, mặc định `"gemini-2.0-flash"`.
- API Key chỉ lưu trong `Keystore` (`"openai-api-key"`, `"gemini-api-key"`), không bao giờ ghi vào `settings.json`, không ghi ra log, không trả nguyên văn về WebView.
- Mọi lời gọi mạng/luồng dịch không bao giờ dùng `unwrap()`/`expect()` trên dữ liệu ngoài để tuyệt đối không làm crash app.
- Khi đang chọn `openai` hoặc `gemini` mà chưa có API Key, mất mạng, timeout, HTTP lỗi (4xx/5xx) hoặc đứt stream giữa chừng: tự động chuyển sang `llama-server` (Local) ngay trong câu đó và giữ nguyên `Local` cho đến hết phiên dịch.

## Review Focus

- Người dùng chọn `openai` hoặc `gemini` nhưng chưa lưu API Key (hoặc vừa xóa API Key) rồi bấm Bắt đầu dịch → không báo lỗi dừng phiên, tự động chuyển sang dịch bằng `Local` và hiện nhãn `Local (dự phòng)`.
- Mạng bị rớt giữa chừng khi Cloud đã stream được vài chữ đầu của câu → `FallbackMt` đánh dấu fallback, trả `MtError::Failed` ở lượt 1 để `pipeline::translate::translate` phát `Event::Retry` xóa chữ dở, rồi lượt 2 dịch trọn câu bằng `Local`.
- Server Cloud trả lỗi HTTP 401/429 kèm thân JSON có chứa lại mảnh API Key → hàm báo lỗi chỉ lấy mã HTTP (`HTTP 401`, `HTTP 429`), tuyệt đối không đưa thân phảnồi hoặc API Key vào chuỗi lỗi hay log.
- Người dùng cũ cập nhật app (file `settings.json` chưa có `translationProvider`, `openaiModel`, `geminiModel`) → `migrate::load` tự ghép mặc định `local`, `gpt-4o-mini`, `gemini-2.0-flash`, giữ nguyên gói model Local đang dùng.
- Quyền ACL của Tauri (`acl_tests.rs`) → mọi lệnh IPC mới (`get_translation_keys`, `set_translation_api_key`) phải khớp cả 4 nơi: `commands.rs` (`MAIN_COMMANDS` + `handler()`), `build.rs`, `capabilities/main.json`, và không cấp cho cửa sổ `overlay`/`compose`/`hint`.

---

### Task 1: Thêm cấu hình `TranslationProvider`, `openaiModel`, `geminiModel` vào `Settings`

**Files:**
- Modify: `src-tauri/src/settings/mod.rs`
- Modify: `src-tauri/src/settings/patch.rs`
- Modify: `src-tauri/src/actions.rs`

**Interfaces:**
- Produces:
  - `crate::settings::TranslationProvider` (`Local`, `Openai`, `Gemini`)
  - `crate::settings::OPENAI_MODELS: &[&str] = &["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"]`
  - `crate::settings::GEMINI_MODELS: &[&str] = &["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"]`
  - `Settings::translation_provider: TranslationProvider`
  - `Settings::openai_model: String`
  - `Settings::gemini_model: String`

- [ ] **Step 1: Viết bài test kiểm tra mặc định, tương thích file cũ và kiểm tra hợp lệ trong `src-tauri/src/settings/patch.rs`**

```rust
#[test]
fn translation_provider_and_cloud_models_are_validated() {
    use crate::settings::TranslationProvider;
    let d = current();
    assert_eq!(d.translation_provider, TranslationProvider::Local);
    assert_eq!(d.openai_model, "gpt-4o-mini");
    assert_eq!(d.gemini_model, "gemini-2.0-flash");

    let s = apply(
        &d,
        &json!({
            "translationProvider": "openai",
            "openaiModel": "gpt-4.1-mini",
            "geminiModel": "gemini-2.5-flash"
        }),
    )
    .unwrap();
    assert_eq!(s.translation_provider, TranslationProvider::Openai);
    assert_eq!(s.openai_model, "gpt-4.1-mini");
    assert_eq!(s.gemini_model, "gemini-2.5-flash");

    assert_eq!(
        apply(&d, &json!({ "translationProvider": "claude" })),
        Err(Invalid::new("translationProvider", Reason::WrongType))
    );
    assert_eq!(
        apply(&d, &json!({ "openaiModel": "gpt-3.5" })),
        Err(Invalid::new("openaiModel", Reason::OutOfRange))
    );
    assert_eq!(
        apply(&d, &json!({ "geminiModel": "gemini-1.0" })),
        Err(Invalid::new("geminiModel", Reason::OutOfRange))
    );
}
```

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings::patch::tests::translation_provider_and_cloud_models_are_validated`
Expected: FAIL (`TranslationProvider` chưa tồn tại).

- [ ] **Step 3: Cài đặt `TranslationProvider`, hằng model và kiểm tra phạm vi trong `src-tauri/src/settings/mod.rs` & `src-tauri/src/actions.rs`**

- Trong `src-tauri/src/settings/mod.rs`:
  - Định nghĩa `TranslationProvider { #[default] Local, Openai, Gemini }` với `#[serde(rename_all = "lowercase")]`.
  - Khai báo `OPENAI_MODELS`, `DEFAULT_OPENAI_MODEL = "gpt-4o-mini"`, `GEMINI_MODELS`, `DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"`.
  - Thêm `#[serde(default)] pub translation_provider: TranslationProvider`, `#[serde(default = "default_openai_model")] pub openai_model: String`, `#[serde(default = "default_gemini_model")] pub gemini_model: String` vào `Settings`.
  - Trong `Settings::validate`, kiểm tra `OPENAI_MODELS.contains(&self.openai_model.as_str())` (báo `Invalid::new("openaiModel", Reason::OutOfRange)`) và `GEMINI_MODELS.contains(&self.gemini_model.as_str())` (báo `Invalid::new("geminiModel", Reason::OutOfRange)`).
- Trong `src-tauri/src/actions.rs` (`update_settings`): khi `translation_provider`, `openai_model` hoặc `gemini_model` thay đổi, đặt `s.translation_fallback = false` trên `AppStatus` và phát sự kiện cập nhật cho `overlay` + `main`.

- [ ] **Step 4: Chạy lại bộ test `settings`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml settings::`
Expected: PASS.

---

### Task 2: Cài đặt `cloud_mt` (`CloudMt`, `FallbackMt` và lưu trữ API Key trong `Keystore`)

**Files:**
- Create: `src-tauri/src/cloud_mt.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src-tauri/src/acl_tests.rs`

**Interfaces:**
- Consumes: `pipeline::translate::{Mt, MtError}`, `pipeline::llama::{ChatRequest, StreamEnd}`, `pipeline::sse::{SseEvent, parse_sse_line}`, `crate::security::keystore::Keystore`, `crate::settings::TranslationProvider`.
- Produces:
  - `pub struct TranslationKeysStatus { pub openai_configured: bool, pub openai_hint: Option<String>, pub gemini_configured: bool, pub gemini_hint: Option<String> }`
  - `pub fn get_keys_status<R: Runtime>(app: &AppHandle<R>) -> TranslationKeysStatus`
  - `pub fn set_api_key<R: Runtime>(app: &AppHandle<R>, provider: TranslationProvider, api_key: &str) -> Result<TranslationKeysStatus, CommandError>`
  - `pub struct FallbackMt` thực thi `pipeline::translate::Mt`
  - Hai lệnh Tauri: `get_translation_keys`, `set_translation_api_key`

- [ ] **Step 1: Viết unit test cho `FallbackMt`, đọc/ghi key ẩn (`••••abcd`) và kiểm tra ACL trong `src-tauri/src/cloud_mt.rs` & `src-tauri/src/acl_tests.rs`**

Kiểm tra đủ 5 kịch bản trong `cloud_mt::tests`:
1. `cloud_success_streams_without_touching_local`: khi Cloud trả SSE thành công, `FallbackMt` phát đúng chữ của Cloud, không gọi `local`, cờ `fell_back` vẫn `false`.
2. `cloud_error_before_any_delta_falls_back_immediately_in_same_call`: khi Cloud lỗi kết nối/HTTP 401/429 trước khi phát ký tự nào, `FallbackMt` bật `fell_back = true`, gọi callback `on_fallback` đúng 1 lần, và chuyển sang `local.stream` ngay trong cùng lần gọi (lượt 1 thành công luôn).
3. `cloud_error_mid_stream_triggers_retry_then_uses_local`: khi Cloud phát được `"Xin"` rồi đứt mạng, lượt 1 trả `Err(MtError::Failed)`, `fell_back` bật `true`; lượt 2 của `pipeline::translate::translate` phát `Event::Retry` rồi dịch trọn câu bằng `local`.
4. `missing_api_key_falls_back_to_local_on_first_sentence`: chọn `openai`/`gemini` nhưng chưa lưu API Key → câu đầu tiên chuyển sang `local` và báo `on_fallback`.
5. `mask_key_only_exposes_last_four_chars_and_never_logs_secret`: chuỗi key `"sk-proj-1234567890abcd"` trả hint `Some("••••abcd")`; chuỗi ngắn `<= 4` ký tự trả `Some("••••")`.

- [ ] **Step 2: Chạy test để xác nhận fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt::`
Expected: FAIL (module `cloud_mt` chưa có).

- [ ] **Step 3: Cài đặt `src-tauri/src/cloud_mt.rs` và đăng ký 2 lệnh IPC**

- Trong `src-tauri/src/cloud_mt.rs`:
  - Lưu/đọc key qua `Keystore` (dùng `Keystore::os(&app.config().identifier)` khi chạy thật, và hỗ trợ `Keystore` quản lý trong `app.try_state::<Arc<Keystore>>()` cho `MockRuntime` test).
  - `CloudMt`:
    - Endpoint OpenAI: `"https://api.openai.com/v1/chat/completions"`
    - Endpoint Gemini: `"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"`
    - Dùng `reqwest::blocking::Client::builder().connect_timeout(Duration::from_secs(6)).timeout(Duration::from_secs(25)).build()`.
    - Gửi header `Authorization: Bearer <api_key>`, body JSON `{"model": model, "messages": [{"role": "user", "content": req.prompt}], "stream": true, "temperature": 0.0, "max_tokens": req.max_tokens}`.
    - Nếu status không phải 2xx: trả `Err(MtError::Failed(format!("cloud HTTP {}", resp.status().as_u16())))` (không đọc hay log nội dung nhạy cảm).
    - Đọc từng dòng bằng `BufReader::new(resp)`, gọi `pipeline::sse::parse_sse_line` để đẩy từng mảnh `Delta` sang `on_delta`.
  - `FallbackMt`:
    - Giữ `cloud: Option<Box<dyn Mt>>`, `local: Box<dyn Mt>`, `fell_back: Arc<AtomicBool>`, `on_fallback: Arc<dyn Fn() + Send + Sync>`.
    - Trong `stream`: nếu `fell_back` đang `false`, gọi `cloud.stream`. Nếu `cloud.stream` trả `Err(_)` mà chưa phát mảnh chữ nào (`!emitted`), bật `fell_back = true`, gọi `(self.on_fallback)()`, và gọi tiếp `self.local.stream(req, on_delta)`. Nếu đã phát chữ (`emitted == true`) mới lỗi, bật `fell_back = true`, gọi `(self.on_fallback)()`, và trả `Err(MtError::Failed(...))` để `pipeline::translate::translate` phát `Event::Retry` và dùng `self.local` ở lượt thử thứ 2.
- Đăng ký `get_translation_keys` và `set_translation_api_key` vào `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`.

- [ ] **Step 4: Chạy test `cloud_mt` và `acl_tests`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_mt:: acl_tests::`
Expected: PASS.

---

### Task 3: Nối `FallbackMt` và trạng thái nguồn dịch vào `Session`, `AppStatus`, `OverlayView`, `ComposeView`

**Files:**
- Modify: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/compose/mod.rs`

**Interfaces:**
- Consumes: `crate::cloud_mt`, `crate::settings::TranslationProvider`.
- Produces:
  - `AppStatus::translation_fallback: bool`
  - `OverlayView::translation_provider: TranslationProvider`
  - `OverlayView::openai_model: String`
  - `OverlayView::gemini_model: String`
  - `ComposeView::translation_provider: TranslationProvider`
  - `ComposeView::openai_model: String`
  - `ComposeView::gemini_model: String`
  - `ComposeView::translation_fallback: bool`

- [ ] **Step 1: Viết test kiểm tra trạng thái `translation_fallback` trong `OverlayView`, `ComposeView`, `AppStatus`**

Thêm test trong `src-tauri/src/cloud_mt.rs` kiểm tra `OverlayView::from_settings` mang đúng `translation_provider`, `openai_model`, `gemini_model` và khi `note_translation_fallback(&app)` chạy thì `AppStatus.translation_fallback` bật `true`.

- [ ] **Step 2: Cập nhật `state.rs`, `session.rs`, `compose/mod.rs`**

- Trong `src-tauri/src/state.rs`:
  - Thêm `pub translation_fallback: bool` vào `AppStatus` (khởi tạo `false`).
  - Thêm `pub translation_provider: TranslationProvider`, `pub openai_model: String`, `pub gemini_model: String` vào `OverlayView` (`OverlayView::from_settings`).
- Trong `src-tauri/src/compose/mod.rs`:
  - Thêm `pub translation_provider: TranslationProvider`, `pub openai_model: String`, `pub gemini_model: String`, `pub translation_fallback: bool` vào `ComposeView` (`view_for`).
- Trong `src-tauri/src/session.rs`:
  - Khi bắt đầu phiên mới (`start_with`), đặt `s.translation_fallback = false` và reset cờ `fell_back` của phiên.
  - Trong `LiveDeps::mt(&self)`: bọc `Box::new(self.manager().mt())` qua `cloud_mt::wrap_mt(&self.app, local_mt, session_fell_back)`.

- [ ] **Step 3: Chạy toàn bộ test Rust của `src-tauri`**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib`
Expected: PASS.

---

### Task 4: Cập nhật kiểu IPC, từ điển 5 ngôn ngữ (`i18n`) và giao diện `ModelSettings`, `Overlay`, `Compose`

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/subtitleView.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/ja.ts`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/ko.ts`
- Modify: `src/windows/main/settings/ModelSettings.tsx`
- Modify: `src/windows/overlay/overlay.tsx`
- Modify: `src/windows/overlay/overlay.css`
- Modify: `src/windows/compose/compose.tsx`
- Modify: `src/windows/compose/compose.css`

**Interfaces:**
- Consumes: Lệnh IPC `get_translation_keys`, `set_translation_api_key`, `update_settings` và các trường mới trong `Settings`, `AppStatus`, `OverlayView`, `ComposeView`.
- Produces:
  - Hàm `translationBadge(provider: TranslationProvider, openaiModel: string, geminiModel: string, fallback: boolean, fallbackLabel: string): { text: string; isFallback: boolean }` trong `src/lib/subtitleView.ts`.
  - Giao diện chọn nguồn dịch (`Local` / `ChatGPT` / `Gemini`), Dropdown chọn model và quản lý API Key trong `ModelSettings.tsx`.
  - Nhãn nguồn đang dịch trên `Overlay` (`.note.engine` / `.note.engine-fallback`) và trên `Compose` (`header .engine-badge`).

- [ ] **Step 1: Viết bài test cho `translationBadge` và đồng bộ từ điển 5 ngôn ngữ**

Trong `src/lib/subtitleView.test.ts`, thêm test kiểm tra `translationBadge`:
- `provider = "local"`, `fallback = false` → `{ text: "Local", isFallback: false }`
- `provider = "openai"`, `openaiModel = "gpt-4o-mini"`, `fallback = false` → `{ text: "ChatGPT · gpt-4o-mini", isFallback: false }`
- `provider = "gemini"`, `geminiModel = "gemini-2.0-flash"`, `fallback = false` → `{ text: "Gemini · gemini-2.0-flash", isFallback: false }`
- `provider = "openai"`, `fallback = true` → `{ text: "Local (dự phòng)", isFallback: true }`

- [ ] **Step 2: Cập nhật `src/lib/ipc.ts`, `src/lib/subtitleView.ts`, 5 file `src/i18n/*.ts` và các file test mock (`*.test.ts`)**

- Thêm `TranslationProvider`, `OPENAI_MODELS`, `GEMINI_MODELS`, `TranslationKeysStatus` vào `src/lib/ipc.ts`.
- Bổ sung chuỗi dịch cho 5 ngôn ngữ (`vi`, `en`, `ja`, `zh`, `ko`):
  - `settings.model.provider`: Nguồn dịch / Translation engine
  - `settings.model.provider.local`: Model trên máy (Local)
  - `settings.model.provider.openai`: ChatGPT (OpenAI API)
  - `settings.model.provider.gemini`: Gemini (Google API)
  - `settings.model.provider.hint`: Tự động chuyển về Model Local nếu mất mạng hoặc lỗi kết nối API.
  - `settings.model.cloudModel`: Model sử dụng
  - `settings.model.apiKey`: API Key
  - `settings.model.apiKey.placeholder`: Dán API Key vào đây…
  - `settings.model.apiKey.saved`: Đã lưu ({hint})
  - `settings.model.apiKey.missing`: Chưa có API Key (sẽ tự dùng Model Local)
  - `settings.model.apiKey.save`: Lưu Key
  - `settings.model.apiKey.clear`: Xóa Key
  - `overlay.engine.local`: Local
  - `overlay.engine.fallback`: Local (dự phòng)

- [ ] **Step 3: Cập nhật `ModelSettings.tsx`, `overlay.tsx`, `compose.tsx` và CSS**

- Trong `ModelSettings.tsx`: thêm khối chọn `Nguồn dịch` ở đầu trang (Dropdown chọn `Local` / `ChatGPT (OpenAI API)` / `Gemini (Google API)`). Khi chọn `ChatGPT` hoặc `Gemini`, hiện Dropdown chọn model tương ứng và ô nhập/lưu/xóa API Key.
- Trong `overlay.tsx`: hiển thị huy hiệu nguồn dịch (`translationBadge`) ngay trên thanh `.indicators` khi đang chạy hoặc có phụ đề.
- Trong `compose.tsx`: hiển thị huy hiệu nguồn dịch (`translationBadge`) trên thanh `<header>` của ô Gõ dịch.

- [ ] **Step 4: Chạy toàn bộ test Frontend (Vitest) và kiểm tra kiểu TypeScript**

Run: `pnpm test` và `pnpm tsc --noEmit`
Expected: PASS toàn bộ test và không có lỗi TypeScript.

