# Thiết kế: Kết nối API Key ChatGPT / Gemini kèm tự động dự phòng về Model Local

- **Ngày:** 2026-11-07
- **Phạm vi:** `crates/pipeline`, `src-tauri`, `src` (5 ngôn ngữ `vi`, `en`, `ja`, `zh`, `ko`)

---

## 1. Mục tiêu & Nguyên tắc

1. **Mặc định an toàn cho cả người dùng mới và cũ (`Local`):**
   - Người dùng cài mới vẫn đi qua luồng tải model Local và dùng `translationProvider = "local"` mặc định.
   - Người dùng cũ cập nhật app giữ nguyên cài đặt `local` hiện tại (nhờ `#[serde(default)]` trên các trường cài đặt mới), chỉ thay đổi khi họ chủ động vào **Cài đặt › Model** để chọn **ChatGPT** hoặc **Gemini**.
2. **Tùy chọn nguồn dịch & Dropdown chọn model:**
   - Người dùng chọn 1 trong 3 nguồn dịch:
     - `local`: Model trên máy (như hiện tại).
     - `openai`: ChatGPT (OpenAI API) — chọn model qua Dropdown:
       - `gpt-4o-mini` *(mặc định)*
       - `gpt-4.1-mini`
       - `gpt-4.1-nano`
       - `gpt-4o`
     - `gemini`: Gemini (Google AI Studio API) — chọn model qua Dropdown:
       - `gemini-2.0-flash` *(mặc định)*
       - `gemini-2.5-flash-lite`
       - `gemini-2.5-flash`
       - `gemini-2.5-pro`
3. **Bảo mật API Key:**
   - API Key của OpenAI và Gemini được lưu trong kho khóa của hệ điều hành ([`Keystore`](file:///d:/Dev/WORKSPACE/ai-translator/src-tauri/src/security/keystore.rs)) dưới tên mục `"openai-api-key"` và `"gemini-api-key"`.
   - Không lưu API Key vào `settings.json`, không ghi ra log, không trả ngược toàn bộ chuỗi key lên giao diện (chỉ trả trạng thái đã lưu + 4 ký tự cuối dạng `••••abcd`).
4. **Tự động chuyển sang Model Local khi lỗi (Phương án B — giữ Local đến hết phiên):**
   - Trong phiên dịch phụ đề (`Overlay`) hoặc khi dùng Gõ dịch (`Compose`), nếu người dùng chọn `openai` hoặc `gemini` nhưng:
     - Chưa nhập API Key, hoặc
     - Không có mạng / DNS lỗi / timeout kết nối, hoặc
     - API trả lỗi (401 sai key, 403, 429 hết hạn mức/rate-limit, 5xx lỗi máy chủ), hoặc
     - Stream bị ngắt giữa chừng trước khi hoàn tất câu,
   - Hệ thống **tự động chuyển sang `llama-server` (Model Local)** ngay trong câu đang dịch (0 giây chờ vì `llama-server` đã được chuẩn bị sẵn) và **giữ nguyên chế độ Local cho đến hết phiên dịch**.
   - Khi người dùng bắt đầu một phiên dịch mới (hoặc đổi lại cài đặt API Key/nguồn dịch), hệ thống mới thử lại nguồn Cloud đã chọn.
5. **Hiển thị nguồn đang dịch trên khung dịch:**
   - Trên **Thanh phụ đề (`Overlay`)** (cạnh chấm trạng thái ở góc trên) và trên **Ô soạn Gõ dịch (`Compose`)** (ở thanh tiêu đề):
     - Luôn hiện nhãn nguồn dịch đang hoạt động: `Local`, `ChatGPT · <model>`, `Gemini · <model>`.
     - Khi đã tự động chuyển về Local do lỗi kết nối/API: hiện nhãn nổi bật `Local (dự phòng)` để người dùng biết ngay đang dịch bằng model Local.

---

## 2. Các phương án kiến trúc đã xét

### Phương án 1 (Đã chọn): Bộ điều phối `FallbackMt` bọc trên trait `Mt` + giữ `llama-server` sẵn sàng nền
- Giữ nguyên `SidecarManager` khởi động sẵn `asr-worker` và `llama-server`.
- Cài đặt `CloudMt` (gọi HTTP SSE tới OpenAI và Gemini) và `FallbackMt` (bọc `CloudMt` + `LocalMt`, thực thi trait `pipeline::translate::Mt`).
- **Ưu điểm:** Chuyển đổi dự phòng tức thì (0 giây chờ nạp model) ngay giữa câu đang nói; dùng chung một cơ chế cho cả `Overlay` và `Compose`; không phá vỡ kiến trúc quản lý tiến trình phụ hiện có.

### Phương án 2 (Loại): Chỉ khởi động `llama-server` khi Cloud lỗi (Lazy Load)
- **Nhược điểm:** Khi mất mạng giữa cuộc họp, câu đang dịch bị treo 10–30 giây để chờ nạp model GGUF vào RAM/VRAM.

---

## 3. Thiết kế chi tiết các thành phần

### 3.1. Cài đặt (`src-tauri/src/settings/`)
- Thêm kiểu `TranslationProvider`:
  ```rust
  #[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
  #[serde(rename_all = "lowercase")]
  pub enum TranslationProvider {
      #[default]
      Local,
      Openai,
      Gemini,
  }
  ```
- Thêm vào `Settings` (với `#[serde(default)]` để tương thích ngược tự động với mọi file `settings.json` cũ):
  - `translation_provider: TranslationProvider` (mặc định `TranslationProvider::Local`)
  - `openai_model: String` (mặc định `"gpt-4o-mini"`)
  - `gemini_model: String` (mặc định `"gemini-2.0-flash"`)
- Kiểm tra hợp lệ (`Settings::validate` trong `settings/mod.rs` và `settings/patch.rs`):
  - `openai_model` phải thuộc `["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o"]`.
  - `gemini_model` phải thuộc `["gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"]`.

### 3.2. Lưu trữ API Key (`src-tauri/src/security/keystore.rs` & `commands.rs`)
- Hai mục trong `Keystore`:
  - `OPENAI_KEY_ENTRY = "openai-api-key"`
  - `GEMINI_KEY_ENTRY = "gemini-api-key"`
- Thêm 2 lệnh IPC cho cửa sổ `main` (đăng ký trong `lib.rs` và `capabilities/main.json`):
  - `get_translation_keys`: trả về `TranslationKeysStatus { openai_configured: bool, openai_hint: Option<String>, gemini_configured: bool, gemini_hint: Option<String> }`.
  - `set_translation_api_key(provider: TranslationProvider, api_key: String)`:
    - Nếu `api_key.trim().is_empty()` thì xóa mục tương ứng trong `Keystore`.
    - Nếu có chữ thì lưu vào `Keystore`, đồng thời nếu đang có phiên dịch hoặc trạng thái fallback cũ thì reset cờ fallback để áp dụng key mới.

### 3.3. Client dịch Cloud & `FallbackMt` (`crates/pipeline/src/cloud.rs` hoặc `src-tauri/src/cloud_mt.rs`)
- **HTTP SSE Streaming:**
  - Dùng `reqwest::blocking::Client` (timeout kết nối 6 giây, timeout toàn request 25 giây).
  - **OpenAI:** `POST https://api.openai.com/v1/chat/completions` với header `Authorization: Bearer <key>`.
  - **Gemini:** `POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` với header `Authorization: Bearer <key>`.
  - Thân JSON gửi đi:
    ```json
    {
      "model": "<model>",
      "messages": [{ "role": "user", "content": "<prompt>" }],
      "stream": true,
      "temperature": 0.0,
      "max_tokens": 512
    }
    ```
  - Tái sử dụng hàm `sse::parse_sse_line` có sẵn trong `crates/pipeline/src/sse.rs` để đọc từng mảnh `Delta` và kiểm tra cờ hủy `cancel` ở mỗi dòng SSE.
- **Điều phối dự phòng (`FallbackMt`):**
  - Thực thi trait `pipeline::translate::Mt`:
    - `count_tokens`: gọi `local.count_tokens(text)` (nhanh, chạy trên `127.0.0.1` của `llama-server` đã mở sẵn).
    - `stream`:
      - Kiểm tra cờ dùng chung của phiên `fell_back: Arc<AtomicBool>`. Nếu đã `true`, gọi thẳng `local.stream(req, on_delta)`.
      - Nếu chưa `fell_back`: gọi `cloud.stream(req, ...)`.
      - **Trường hợp 1 — Lỗi trước khi phát bất kỳ chữ nào** (mất mạng, timeout kết nối, HTTP 401/403/429/5xx):
        - Đặt `fell_back = true`, gọi callback cập nhật `AppStatus.translation_fallback = true` (báo ngay lên `Overlay` và `Compose`), rồi gọi thẳng `local.stream(req, on_delta)` ngay trong cùng lần gọi.
      - **Trường hợp 2 — Đứt mạng giữa chừng sau khi đã phát một vài từ:**
        - Đặt `fell_back = true`, gọi callback cập nhật trạng thái, và trả về `Err(MtError::Failed(...))` để vòng lặp `attempt = 2` có sẵn của `pipeline::translate::translate` phát `Event::Retry` (xóa phần chữ dở trên giao diện) rồi dịch lại toàn bộ câu bằng `local.stream`.

### 3.4. Trạng thái & Giao diện (`Overlay`, `Compose`, `ModelSettings`)
- **`AppStatus` & `OverlayView` & `ComposeView`:**
  - Bổ sung trạng thái `translation_fallback: bool` vào `AppStatus` (đặt về `false` mỗi khi bắt đầu phiên mới hoặc khi người dùng đổi nguồn dịch / cập nhật API key).
  - Bổ sung `translation_provider`, `openai_model`, `gemini_model` vào `OverlayView` và `ComposeView` (cùng `translation_fallback` trong `ComposeView`).
- **Trên Thanh phụ đề (`src/windows/overlay/overlay.tsx`):**
  - Trong thanh `.indicators` ở góc trên, hiển thị huy hiệu nguồn dịch (`.note.provider` hoặc `.note.fallback`):
    - Khi dịch bằng nguồn đã chọn: `Local`, `ChatGPT · gpt-4o-mini`, `Gemini · gemini-2.0-flash`.
    - Khi đã tự động chuyển về Local do lỗi: `Local (dự phòng)` (màu vàng cam nhẹ để dễ nhận biết).
- **Trên Ô soạn Gõ dịch (`src/windows/compose/compose.tsx`):**
  - Trên `<header>`, cạnh tên ngôn ngữ đích, hiển thị huy hiệu nguồn dịch tương ứng (`Local`, `ChatGPT · ...`, `Gemini · ...`, hoặc `Local (dự phòng)`).
- **Trong `Cài đặt › Model` (`src/windows/main/settings/ModelSettings.tsx`):**
  - Thêm thẻ **"Nguồn dịch (Translation Engine)"** ở đầu trang `ModelSettings`:
    - Chọn nguồn: **Model trên máy (Local)** / **ChatGPT (OpenAI)** / **Gemini (Google)**.
    - Khi chọn **ChatGPT** hoặc **Gemini**:
      - Hiện **Dropdown chọn Model** tương ứng.
      - Hiện ô nhập **API Key** (dạng password, có nút Lưu và nút Xóa khi đã có key, kèm trạng thái `Đã lưu key (••••abcd)` hoặc `Chưa có API Key — sẽ tự dùng Model Local`).
      - Ghi chú rõ: *"Nếu mất mạng hoặc kết nối API bị lỗi, ứng dụng tự động chuyển sang dịch bằng Model Local đã tải trên máy."*
  - Phần danh sách tải gói Model Local bên dưới giữ nguyên 100% để người dùng luôn có model Local dự phòng.

