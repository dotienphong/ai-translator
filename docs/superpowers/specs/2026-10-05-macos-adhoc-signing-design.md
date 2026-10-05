# Bản macOS ký ad-hoc khi chưa có Developer ID

Ngày 2026-10-05. Chủ dự án chọn phương án này vì chưa có ngân sách cho Apple Developer Program (99 USD mỗi năm). Sửa spec gốc §10.2 (dòng "Sửa hoặc ký lại file của app") và các chỗ nhắc T1 trong kế hoạch Giai đoạn 1 · 00.

## 1. Vấn đề

`src-tauri/src/license/genuine.rs` kiểm chữ ký của chính app lúc khởi động. Trên macOS, bản release yêu cầu chứng thư Developer ID của đúng Team ID (`AI_TRANSLATOR_TEAM_ID`). Thiếu Team ID thì bản đó bị coi là "không chính hãng" và chỉ chạy gói Free (cố ý: quên cấu hình thì khóa).

Chưa có Developer ID thì mọi bản macOS đều rơi vào nhánh khóa này. Khách trả tiền trên Mac không dùng được gói Professional, X2, X5.

## 2. Quyết định

- Thêm chế độ **ký ad-hoc** cho macOS. Ở chế độ này app chỉ kiểm chữ ký còn nguyên vẹn, không kiểm Team ID.
- Chế độ này tạm thời: khi có Team ID thì app tự về chế độ chặt, không phải sửa code.
- Phạm vi chỉ gồm macOS. Windows không đổi (chứng thư OV, T2, là một quyết định riêng).

Đã loại hai hướng khác:
- Không kiểm gì trên Mac: mất cả khả năng phát hiện file hỏng, không có lợi gì thêm.
- So SHA-256 các file phụ với danh sách build sẵn: công sức lớn, lợi ích nhỏ. Việc so này đã có sẵn cho tiến trình phụ (spec §10.2, "Thay tiến trình phụ"), file app chính thì không tự so được.

## 3. Thiết kế

### 3.1 Chọn chế độ lúc build
Biến build mới `AI_TRANSLATOR_MAC_SIGNING`, đọc bằng `option_env!` như `TEAM_ID`. Giá trị rỗng coi như không đặt (workflow truyền `vars.X` rỗng thì được chuỗi rỗng, không phải `None`).

| `TEAM_ID` | `MAC_SIGNING` | Chế độ |
|---|---|---|
| có, hợp lệ | bất kỳ | chặt: như hiện nay, cờ ad-hoc bị bỏ qua |
| không | `adhoc` | ad-hoc: chỉ kiểm chữ ký còn nguyên vẹn |
| không | khác hoặc không đặt | không chính hãng, chỉ Free (như hiện nay) |
| có nhưng sai dạng | bất kỳ | không chính hãng (không rơi sang ad-hoc) |

Dòng cuối giữ nguyên nguyên tắc "cấu hình sai thì khóa": Team ID đặt mà sai không được tự hạ xuống chế độ lỏng hơn.

### 3.2 Phép kiểm ở chế độ ad-hoc
- Vẫn dùng `SecStaticCodeCheckValidity` trên gói `.app`, với `CHECK_NESTED_CODE | STRICT_VALIDATE`. Bắt file bị sửa hay hỏng sau khi ký, kể cả code lồng bên trong.
- Yêu cầu chữ ký là `identifier "<bundle id>"` thay cho yêu cầu Team ID. Bundle id lấy từ cấu hình app (`com.aitranslator.desktop`), không viết cứng ở hai nơi.
- Chữ ký hợp lệ thì `Genuine`; lỗi thì `NotGenuine` kèm lý do để ghi log, như cũ.

### 3.3 Build và phát hành
- `release.yml`, job build app: đặt `AI_TRANSLATOR_MAC_SIGNING=adhoc` khi `vars.APPLE_TEAM_ID` rỗng.
- `package-macos.sh` đã ký ad-hoc khi không có `MT_SIGN_IDENTITY` và bỏ qua notarize khi không có khóa; không cần sửa phần ký.
- `release-check.mjs` và `check-release-config.sh` không đọc Team ID nên không đổi. Bước ký của CI in dòng "bản ký ad-hoc, chưa notarize" vào tóm tắt khi không có chứng thư.
- Cổng `no-dev-gate` không đổi.

### 3.4 Tài liệu
- Spec gốc §10.2: sửa dòng "Sửa hoặc ký lại file của app", ghi chế độ ad-hoc và rủi ro chấp nhận (mục 5).
- `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`: T1 ghi "chưa có; macOS chạy ad-hoc (spec 2026-10-05)"; A6 ghi Gatekeeper không đạt cho tới khi có Developer ID.
- `docs/release/phat-hanh.md`: thêm mục phát hành bản ad-hoc, gồm hướng dẫn "Open Anyway" cho khách.

## 4. Đo và xử lý Keychain

Chữ ký ad-hoc đổi theo từng bản build, nên macOS có thể coi bản mới là app lạ khi đọc các mục Keychain (khóa SQLCipher, token bản quyền, bộ đếm hạn mức, mốc thời gian) và hỏi mật khẩu đăng nhập. Chưa đo, nên làm theo thứ tự:

1. **Đo thật** trên hai bản ad-hoc liên tiếp: cài bản 1, dùng, cập nhật lên bản 2. Ghi vào `bench/phase1/results/` xem macOS có hỏi mật khẩu không, và có hỏi lại quyền thu âm thanh hệ thống không.
2. **Nếu có hỏi:** thử đặt yêu cầu định danh cố định bằng `codesign -r`, hoặc ký bằng một chứng thư tự cấp cố định. Cả hai miễn phí.
3. **Phương án cuối, chỉ khi hai cách trên không được:** chuyển các mục này sang file mã hóa trong thư mục dữ liệu của app. Phải sửa spec §10.2 và bị đánh giá yếu hơn; không làm khi chưa đo.

Bước 2 và 3 nằm ngoài phạm vi thiết kế này. Chỉ lập kế hoạch cho chúng nếu bước 1 cho thấy có hỏi.

## 5. Giới hạn chấp nhận

- **Chống sửa yếu hơn Developer ID.** Ai cố ý sửa file rồi ký ad-hoc lại thì qua phép kiểm này. Kẻ biết vá binary vẫn bẻ được phép kiểm dù có Developer ID; phương án này bỏ đi đúng một lớp cản nhỏ. Phần chống sao chép thật sự vẫn là token Ed25519 do server ký, giới hạn 2 máy và khóa tạm (spec §10.2).
- **Gatekeeper vẫn chặn lần mở đầu.** Khách phải vào System Settings › Privacy & Security › "Open Anyway". Phương án này chỉ làm gói trả phí chạy được sau khi họ đã mở được app.
- **Không notarize.** Mục A6 (Gatekeeper) và các số đo chính thức A5, A7 trên bản ký Developer ID chờ tới khi có tài khoản.
- **Có thể bị hỏi lại quyền sau mỗi lần cập nhật** (mục 4).

## 6. Test

Unit test trong `genuine.rs` (chạy trên macOS, không cần quyền):
- Bản ký ad-hoc nguyên vẹn qua yêu cầu `identifier`: `Genuine`.
- Sửa một byte sau khi ký: `NotGenuine`.
- Sai bundle id: `NotGenuine`.
- Bảng chọn chế độ ở mục 3.1: bốn dòng đều có test, kể cả chuỗi rỗng và Team ID sai dạng.
- Test cũ giữ nguyên (`/bin/ls`, file không ký, yêu cầu Team ID).

Kiểm tay: dựng bản release bằng `package-macos.sh` không đặt `MT_SIGN_IDENTITY`, mở trên máy sạch qua "Open Anyway", nhập key thật, thấy Professional.

## 7. Ngoài phạm vi

- Windows và chứng thư OV (T2).
- Chứng thư tự cấp cố định và chuyển Keychain sang file (mục 4, bước 2 và 3).
- Notarize và Developer ID: sẽ làm khi có tài khoản, không cần sửa code app.
