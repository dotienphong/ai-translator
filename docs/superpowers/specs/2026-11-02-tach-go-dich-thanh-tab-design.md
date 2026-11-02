# Tách Gõ dịch thành tab riêng của thanh điều hướng

Ngày 2026-11-02. Chủ dự án muốn Gõ dịch là một mục riêng trong menu bên trái, ngang hàng Cài đặt, nằm ngay dưới Màn hình chính (trước đó là một nhóm của Cài đặt, spec 2026-10-17-go-dich §1.4).

## Thay đổi

- `Screen` có thêm `"compose"`; thứ tự thanh điều hướng: Màn hình chính, **Gõ dịch**, Bản chép lời, Lịch sử, Từ điển thuật ngữ, Cài đặt, Nâng cấp Pro, Hỗ trợ, Giới thiệu (`src/windows/main/navigation.ts`, biểu tượng `keyboard` có sẵn).
- `SettingsGroup` bỏ `"compose"`: Cài đặt còn bảy nhóm (Chung, Phụ đề, Âm thanh, Model, Phím tắt, Bản quyền, Quyền riêng tư).
- `ComposeSettings` chuyển thành `screens/ComposeScreen.tsx`, giữ nguyên các ô, id và hành vi (công tắc bật, ngôn ngữ đích, tự dán và quyền Trợ năng trên macOS; đọc lại quyền mỗi khi cửa sổ được focus).
- i18n năm ngôn ngữ: thêm `nav.compose` (cùng chữ với nhóm cũ), bỏ `settings.group.compose`; câu hướng dẫn phím tắt trên màn hình mới nói rõ "Cài đặt › Phím tắt" (`settings.compose.enabled.hint`).
- Không đổi phía Rust, cài đặt đã lưu (`settings.compose`) hay phím tắt toàn cục: không cần di chuyển dữ liệu.
- Công cụ xem trước (`scripts/ui-preview`): cảnh `compose` thay cho `settings&group=compose`.

## Việc còn lại sau khi phát hành bản app

Website còn nhắc "Cài đặt › Gõ dịch" ở các trang hướng dẫn Gõ dịch, xử lý sự cố và thanh phụ đề (đủ vi, en, ja, zh, ko) và ảnh chụp `app-settings-compose` (chạy `scripts/ui-preview/shoot.mjs`, cần `cwebp` và `sips` trên macOS). Website chỉ được nói điều đã thật, nên sửa sau khi bản app mới đã phát hành.
