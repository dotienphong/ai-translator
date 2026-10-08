# AI Translator

App desktop (Windows và macOS) hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp, chạy offline.

- **Tên:** AI Translator (`productName` trong `src-tauri/tauri.conf.json`). Thư mục và repo GitHub đặt là `ai-translator`. Tên crate và binary vẫn là `meeting-translator` (tên mã cũ, chưa đổi).
- **Thiết kế:** `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Đọc file này trước khi làm bất kỳ việc gì.
- **Mốc benchmark chọn model:** `bench/2026-09-29-mt-benchmark/`.
- **Website marketing:** `website/` (tên miền `aitranslator.io.vn`, tĩnh, hai ngôn ngữ, Worker Static Assets). Thiết kế: `docs/superpowers/specs/2026-10-08-marketing-website-design.md`; cách dựng và thêm trang: `website/README.md`. Nội dung về sản phẩm chỉ được nói điều có thật (số đo kèm điều kiện đo); đổi giá ở `server/wrangler.jsonc` thì đổi cả `website/src/plans.mjs` và các trang nhắc giá.
- **Môi trường:** chỉ có production; bản dev (debug) cũng nối production. Công tắc Pro của dev (`AI_TRANSLATOR_DEV_PRO=true` trong `.env`, chỉ bản debug) và các lớp chống lọt vào bản phát hành: `docs/superpowers/specs/2026-10-04-single-production-environment-design.md`. Không thêm lại staging hay biến ghi đè URL.

## Quy tắc bắt buộc

- **Phiên bản thư viện (spec §6.12):**
  - Khi cài công nghệ hay thư viện bên thứ ba, luôn dùng bản ổn định mới nhất.
  - Trước khi chốt phiên bản, phải kiểm tra kỹ tương thích và xung đột: peer dependency, React 19, plugin Tauri cùng dòng phiên bản với Tauri core, MSRV của Rust, không có hai bản ggml trong cùng một tiến trình.
  - Sau khi cài, build lại toàn bộ và chạy test.
- **Bảo mật (spec §10.2):** không đưa bí mật nào vào app. Khóa API của PayOS và các khóa ký chỉ nằm trên server hoặc trong CI.
