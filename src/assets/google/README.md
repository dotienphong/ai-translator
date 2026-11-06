# Nút "Đăng nhập bằng Google": tài sản chính thức

Thư mục này chứa tài sản chính thức của Google cho nút đăng nhập (spec `docs/superpowers/specs/2026-11-05-dang-nhap-google-design.md` §6.3).
**Không tự vẽ, không sửa màu hay hình** biểu tượng "G" của Google; chỉ dùng tệp tải từ Google.

Người vận hành đặt vào đây đúng một tệp:

- `google-g.svg` (ưu tiên) hoặc `google-g.png`: biểu tượng "G" nhiều màu chuẩn (standard color) trong bộ tài sản
  "Sign in with Google", tải từ trang hướng dẫn thương hiệu của Google:
  <https://developers.google.com/identity/branding-guidelines>

`src/components/GoogleSignInButton.tsx` tự nhận tệp này lúc build (`import.meta.glob`): chưa có tệp thì nút chỉ có chữ
(`account.gate.signIn`), app vẫn build và chạy bình thường. Có tệp rồi thì đối chiếu kiểu nút (màu nền, viền, cỡ chữ, khoảng
cách quanh biểu tượng, chữ "Sign in with Google" theo từng ngôn ngữ) với hướng dẫn trên và chỉnh `.google-signin` trong
`src/styles/main.css` nếu cần, rồi chụp lại cảnh `login-gate` của `scripts/ui-preview/check-i18n.mjs`.
