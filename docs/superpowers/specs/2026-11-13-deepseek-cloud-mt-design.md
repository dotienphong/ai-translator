# Thiết kế: Thêm DeepSeek làm nguồn dịch Cloud (cạnh ChatGPT và Gemini)

- **Ngày:** 2026-11-13
- **Phạm vi:** `src-tauri` (`settings`, `cloud_mt`, `state`, `compose`, `actions`), `src` (5 ngôn ngữ `vi`, `en`, `ja`, `zh`, `ko`)
- **Dựa trên:** `2026-11-07-cloud-mt-fallback-design.md` (giữ nguyên toàn bộ cơ chế dự phòng về Model Local)

## 1. Mục tiêu

Người dùng có API Key của DeepSeek chọn được **DeepSeek** ở **Cài đặt › Model › Nguồn dịch**, giống hệt cách đã chọn ChatGPT
và Gemini. Mặc định của app vẫn là `local`; người dùng cũ không bị đổi gì.

- **Không làm:** không đổi hành vi của ChatGPT, Gemini, Model Local; không thêm thư viện; không đổi website (website không
  công bố công nghệ lõi).
- **Thất bại nếu:** app crash hay ngừng dịch khi DeepSeek lỗi, thiếu key, hết số dư, hay mất mạng.

## 2. Model

API của DeepSeek (2026-11) chỉ có hai mã model, và mã gọi API khác tên hiển thị:

| Mã gửi lên API | Tên của DeepSeek | Trong app |
| --- | --- | --- |
| `deepseek-flash` | DeepSeek V4.1 Flash | **mặc định** |
| `deepseek-v4-pro` | DeepSeek V4 Pro | tùy chọn |

DeepSeek chưa có bản "V4.1 Pro"; dòng Pro hiện hành là `deepseek-v4-pro`. Khi DeepSeek đổi mã model thì sửa
`settings::DEEPSEEK_MODELS` và `DEEPSEEK_MODELS` trong `src/lib/ipc.ts`.

## 3. Các phương án đã xét

1. **(Chọn) Thêm một nhánh vào `CloudMt` sẵn có.** DeepSeek dùng đúng định dạng `/chat/completions` và SSE của OpenAI, nên
   dùng lại nhánh OpenAI, bộ đọc SSE, `FallbackMt`, làm ấm kết nối. Ít mã mới nhất, rủi ro thấp nhất cho tính năng đang chạy.
2. **(Loại) Đi qua lớp tương thích Anthropic của DeepSeek** (`/anthropic`): phải viết bộ đọc stream mới, không được gì thêm.
3. **(Loại) Gộp cả ba nhà cung cấp vào một bảng cấu hình chung:** gọn hơn về lâu dài nhưng phải sửa mã ChatGPT/Gemini đang
   chạy ổn, trái yêu cầu "không ảnh hưởng tính năng hiện có".

## 4. Thiết kế

- **Cài đặt:** `TranslationProvider::Deepseek` (JSON `"deepseek"`); `deepseek_model: String` (`#[serde(default)]`, mặc định
  `deepseek-flash`), kiểm tra thuộc `DEEPSEEK_MODELS` (sai thì `deepseekModel` / `OutOfRange`).
- **API Key:** mục `deepseek-api-key` trong `Keystore`; `TranslationKeysStatus` thêm `deepseekConfigured`, `deepseekHint`
  (chỉ 4 ký tự cuối). Dùng lại lệnh `get_translation_keys`, `set_translation_api_key`.
- **Gọi API:** `POST https://api.deepseek.com/chat/completions`, `Authorization: Bearer <key>`, thân như ChatGPT, thêm
  `"thinking": {"type": "disabled"}`. DeepSeek mặc định bật suy luận: model nghĩ xong mới trả chữ (chậm vài giây) và phần
  suy luận ăn vào `max_tokens` (128–512) làm cụt bản dịch, nên luôn tắt. Thân request của ChatGPT không đổi.
- **Lỗi:** mọi lỗi đi qua `FallbackMt` như cũ. Thêm HTTP 402 (DeepSeek: hết số dư) vào nhóm lỗi "chuyển hẳn sang Local đến
  hết phiên" cùng 401/403, vì thử lại câu sau cũng không khá hơn.
- **Phiên dịch:** DeepSeek là nguồn Cloud nên dùng sẵn các ngưỡng Cloud của `session::engine_config` (không dịch tạm đầu câu,
  ngắt câu tối thiểu 200 ms, hàng đợi 2 câu).
- **Giao diện:** thêm lựa chọn DeepSeek, dropdown hai model, ô API Key dùng chung; huy hiệu `DeepSeek · <model>` trên thanh
  phụ đề và ô Gõ dịch (`translationBadge`).

## 5. Kiểm thử

- Rust: thân request DeepSeek có `thinking: disabled`, thân ChatGPT y như trước; đọc stream có `reasoning_content` và gói
  `usage`; key lưu riêng, che còn 4 ký tự cuối; thiếu key thì về Local; 402 là lỗi dứt khoát; kiểm tra hợp lệ cài đặt.
- TypeScript: `translationBadge` cho DeepSeek; khóa i18n mới có đủ 5 ngôn ngữ.
