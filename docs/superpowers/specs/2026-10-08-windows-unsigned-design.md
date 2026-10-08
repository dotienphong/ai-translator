# Bản Windows chưa ký khi chưa có chứng thư ký mã

Ngày 2026-10-08. Chủ dự án chọn phương án này để phát hành sớm bản Windows, vì chưa mua chứng thư ký mã OV (T2; giá khoảng 100–400 USD mỗi năm, Azure Artifact Signing không nhận cá nhân ở Việt Nam). Cùng hướng với bản macOS ký ad-hoc (spec 2026-10-05). Sửa spec gốc §10.2 (dòng "Sửa hoặc ký lại file của app") và các chỗ nhắc T2 trong kế hoạch Phase 1 · 00.

## 1. Vấn đề

`src-tauri/src/license/genuine.rs` kiểm chữ ký của chính app lúc khởi động. Trên Windows, bản release yêu cầu chữ ký Authenticode hợp lệ của đúng chủ chứng thư (`AI_TRANSLATOR_SIGNER`). Thiếu tên chủ chứng thư thì bản đó bị coi là "không chính hãng" và chỉ chạy gói Free.

Chưa có chứng thư thì mọi bản Windows đều rơi vào nhánh khóa này. Khách trả tiền trên Windows không dùng được gói trả phí.

## 2. Quyết định

- Thêm chế độ **chưa ký** cho Windows. Ở chế độ này app không kiểm chữ ký Authenticode.
- Chế độ này tạm thời: khi có tên chủ chứng thư thì app tự về chế độ chặt, không phải sửa code.
- Phạm vi chỉ gồm Windows. macOS không đổi.

Khác với macOS ad-hoc, chế độ này không còn phép kiểm nào cho file chạy chính: không có chữ ký thì không có gì để kiểm. Đã loại hai hướng:
- Chứng thư tự cấp, khóa để trong secret của CI: Windows không tin chứng thư này nên SmartScreen vẫn cảnh báo y như không ký; muốn app tự kiểm thì phải viết phép kiểm chữ ký không qua chuỗi tin cậy, thêm một secret phải giữ, mà kẻ vá binary vẫn bỏ được phép kiểm. Lợi ích nhỏ.
- So SHA-256 của file chạy chính với danh sách build sẵn: file không tự chứa được băm của chính nó. Tiến trình phụ đã được so SHA-256 (spec §10.2, "Thay tiến trình phụ"), không đổi.

## 3. Thiết kế

### 3.1 Chọn chế độ lúc build
Biến build mới `AI_TRANSLATOR_WIN_SIGNING`, đọc bằng `option_env!` như `SIGNER`. Giá trị rỗng của `SIGNER` coi như không đặt (workflow truyền `vars.X` rỗng thì được chuỗi rỗng, không phải `None`).

| `SIGNER` | `WIN_SIGNING` | Chế độ |
|---|---|---|
| có, khác rỗng | bất kỳ | chặt: `WinVerifyTrust` rồi so tên người ký, cờ chưa ký bị bỏ qua |
| không hay rỗng | `unsigned` | chưa ký: `Genuine`, không kiểm chữ ký, ghi một dòng log `info` |
| không hay rỗng | khác hoặc không đặt | không chính hãng, chỉ Free (như trước) |

Giữ nguyên nguyên tắc "quên cấu hình thì khóa": thiếu cả hai biến thì khóa. Hàm thuần `windows_check(signer, win_signing)` chọn chế độ, test được trên mọi hệ điều hành.

Để sau này thêm kênh Microsoft Store (MSIX, Microsoft ký lại gói, người ký không phải tên của mình), biến này nhận thêm giá trị mới (ví dụ `store`, kiểm định danh gói thay cho tên người ký). Chưa làm.

### 3.2 Build và phát hành
- `release.yml`, job `windows-app`: đặt `AI_TRANSLATOR_WIN_SIGNING=unsigned` khi `vars.WINDOWS_SIGNER` rỗng.
- Job `windows-bundle`: `WINDOWS_SIGNER` có mà `MT_WINDOWS_SIGN_CMD` rỗng thì dừng trước khi đóng gói (bản đó sẽ bị chính app khóa về Free). Không có lệnh ký thì ghi dòng "Bản Windows chưa ký" vào tóm tắt của lần chạy.
- `package-windows.mjs` và `build-sidecars-windows.mjs` đã bỏ qua bước ký khi không có `MT_WINDOWS_SIGN_CMD`; không sửa.
- Chữ ký bản cập nhật (minisign, `sign-updates.mjs`) không phụ thuộc chứng thư này, vẫn bắt buộc.
- Cổng `no-dev-gate` không đổi.

### 3.3 Tài liệu
- Spec gốc §10.2: sửa dòng "Sửa hoặc ký lại file của app" và dòng giới hạn "Sửa app để gửi `device_id_hash` giả".
- `docs/superpowers/plans/2026-10-01-phase-1-00-tong-quan.md`: T2 ghi "chưa có; Windows phát hành chưa ký (spec 2026-10-08)".
- `docs/release/phat-hanh.md`: thêm mục bản Windows chưa ký, gồm hướng dẫn SmartScreen cho khách và cách chuyển sang bản ký.
- Website: trang cài đặt Windows (`/huong-dan/cai-dat-windows/`) hướng dẫn "More info" › "Run anyway"; mọi trang đổi trạng thái Windows sang beta nhận qua email (quyết định của chủ dự án 2026-10-08). Chỉ deploy website khi bản Windows đầu tiên đã build và gửi được.

## 4. Giới hạn chấp nhận

- **Không phát hiện được file chạy chính bị sửa.** Ai vá `meeting-translator.exe` thì app không biết. Kẻ biết vá binary vẫn bỏ được phép kiểm dù có chứng thư; phương án này bỏ đi một lớp cản. Phần chống sao chép thật sự vẫn là token Ed25519 do server ký, giới hạn máy và khóa tạm (spec §10.2).
- **SmartScreen cảnh báo khi mở bộ cài** ("Windows protected your PC", Publisher: Unknown publisher). Khách bấm "More info" › "Run anyway". Trình duyệt có thể cảnh báo file ít người tải. Có chứng thư thì cảnh báo giảm dần theo uy tín, không mất ngay.
- **Bộ cài có thể bị người khác sửa rồi phát tán** mà khách khó nhận ra (không có tên nhà phát hành để kiểm). Bù bằng mã SHA-256 gửi kèm mỗi bản cài và hướng dẫn kiểm trên website.
- Cài đặt theo từng người dùng (`installMode: currentUser`), nên không có hộp thoại UAC "Unknown publisher" lúc cài. Bản cập nhật do app tải về không mang dấu tải từ internet nên dự kiến không qua SmartScreen; chưa thử tay (07b Task 14).
- A6 (SmartScreen) không đạt cho tới khi có chứng thư.

## 5. Test

Unit test trong `genuine.rs`:
- Bảng chọn chế độ ở mục 3.1: đủ ba dòng, kể cả tên chủ chứng thư rỗng, cờ viết hoa, cờ `adhoc` của macOS.
- Trên Windows: file không ký thì `signer_of` báo lỗi; file của Microsoft (nếu nhúng chữ ký) đọc ra tên có "Microsoft".
- Test cũ giữ nguyên; điều kiện "bản release thiếu cấu hình ký thì khóa" thêm `WIN_SIGNING`.

Test workflow (`scripts/release/workflow.test.mjs`): bước build app Windows đặt cờ theo `WINDOWS_SIGNER`; bước bộ cài chặn `WINDOWS_SIGNER` không có lệnh ký trước khi đóng gói và ghi tóm tắt khi chưa ký.

Kiểm tay: dựng bản release bằng `package-windows.mjs` với `AI_TRANSLATOR_WIN_SIGNING=unsigned`, cài trên máy sạch qua SmartScreen, nhập key thật, thấy gói trả phí.

## 6. Ngoài phạm vi

- Mua chứng thư OV, chọn dịch vụ ký (T2): khi có chỉ đặt `WINDOWS_SIGNER` và `MT_WINDOWS_SIGN_CMD`, không sửa code.
- Kênh Microsoft Store (MSIX): cần kiểm định danh gói, tắt bộ cập nhật, đổi cách khởi động cùng Windows, thử thư mục dữ liệu bị chuyển hướng. Spec riêng.
