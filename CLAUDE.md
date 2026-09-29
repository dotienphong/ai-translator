# Meeting Translator (tên tạm)

App desktop (Windows và macOS) hiện phụ đề dịch trực tiếp cho âm thanh cuộc họp, chạy offline.

- **Thiết kế:** `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Đọc file này trước khi làm bất kỳ việc gì.
- **Mốc benchmark chọn model:** `bench/2026-09-29-mt-benchmark/`.

## Quy tắc bắt buộc

- **Phiên bản thư viện (spec §6.12):**
  - Khi cài công nghệ hay thư viện bên thứ ba, luôn dùng bản ổn định mới nhất.
  - Trước khi chốt phiên bản, phải kiểm tra kỹ tương thích và xung đột: peer dependency, React 19, plugin Tauri cùng dòng phiên bản với Tauri core, MSRV của Rust, không có hai bản ggml trong cùng một tiến trình.
  - Sau khi cài, build lại toàn bộ và chạy test.
- **Bảo mật (spec §10.2):** không đưa bí mật nào vào app. Khóa API của PayOS và các khóa ký chỉ nằm trên server hoặc trong CI.
