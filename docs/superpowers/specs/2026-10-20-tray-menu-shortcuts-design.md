# Phím tắt trong menu khay (thiết kế)

Ngày 2026-10-20. Phạm vi: `src-tauri/src/tray.rs`, `tray_menu.rs`, `i18n.rs`, `actions.rs`, `compose/`.

## 1. Mục tiêu

Người dùng bấm chuột phải (Windows) hay bấm (macOS) vào icon khay thì thấy phím tắt của từng việc ngay bên cạnh mục menu, không phải mở Cài đặt › Phím tắt. Đồng thời thêm mục **Gõ dịch** vào menu khay, vì tính năng này chỉ có phím tắt, người dùng chưa biết thì không tìm ra.

## 2. Hành vi

Menu sau khi đổi (các mục không có phím tắt không hiện gì bên phải):

```
[⚠ Có phím tắt không đăng ký được]   (chỉ khi có lỗi, như cũ)
Bắt đầu dịch / Dừng dịch              ⌃⌥T      Windows: Ctrl+Alt+T
Hiện phụ đề / Ẩn phụ đề               ⌃⌥H      Ctrl+Alt+H
Khóa phụ đề / Mở khóa phụ đề         ⌃⌥L      Ctrl+Alt+L
Mở Gõ dịch                            ⌃⌥G      Ctrl+Alt+G
────────
Mở cửa sổ chính
Kiểm tra cập nhật…
────────
[Khởi động lại để cập nhật]           (như cũ)
Thoát
```

- Phím hiện là phím người dùng đang đặt trong Cài đặt (`settings.hotkeys`), không phải mặc định. Đổi phím thì menu dựng lại ngay (`commit_settings` thêm điều kiện `previous.hotkeys != next.hotkeys`).
- Phím của một việc không đăng ký được (có trong `status.hotkey_failures`): mục vẫn hiện, **không** kèm phím, vì phím đó không hoạt động.
- Mục **Mở Gõ dịch** chỉ hiện khi `settings.compose.enabled` (phím của nó cũng chỉ đăng ký khi bật, `actions::sync_compose_hotkey`). Bật hay tắt Gõ dịch thì menu dựng lại (thêm `previous.compose.enabled != next.compose.enabled` vào điều kiện dựng lại).
- Nhãn "Mở Gõ dịch" lấy đúng chữ của `hotkeys.compose` ở giao diện React, để menu và Cài đặt cùng một tên: vi "Mở Gõ dịch", en "Open Type & Translate", ja "入力翻訳を開く", zh "打开输入翻译", ko "입력 번역 열기". Thêm trường `tray_compose` vào `Strings` (cả hàm `all()`).
- Bấm mục **Mở Gõ dịch** chạy `actions::run_hotkey(app, HotkeyAction::Compose)`, giống bấm phím tắt.

## 3. Cách gắn phím

Dùng `accelerator` của `MenuItem` (native), không nhét chữ vào nhãn. Dạng chuẩn của app (`Ctrl+Alt+T`, `Ctrl+Alt+PageUp`, `Super+F10`) đã được `muda` 0.20 đọc (có test). `muda` không hỗ trợ vài phím mà plugin phím tắt nhận (phím numpad và media trên macOS; **phím Win (`Super`) trên Windows**). Nó báo lỗi lúc `menu.append`, trước khi mục vào menu (đã đọc code macOS `create_ns` và Windows `to_accel`), nên khi lỗi thì thêm lại mục không kèm phím và ghi `log::warn`: menu khay không bao giờ thiếu mục. Hệ quả: trên Windows, người dùng đặt phím có Win thì mục đó hiện không kèm phím.

`tray_menu.rs` thêm `TrayItem::Compose` và `TrayItem::hotkey_action() -> Option<HotkeyAction>` (Session, Overlay, Lock, Compose có; còn lại `None`). `TrayItem::ALL` thành 9 mục, `Compose` đứng ngay sau `Lock`. `TrayModel` thêm `compose_enabled`.

## 4. Gõ dịch mở từ menu khay

- **macOS:** bấm icon menu bar không đổi app đang ở phía trước, và ô soạn không lấy quyền kích hoạt, nên bản dịch dán vào đúng ô chat như khi dùng phím tắt. Phải thử tay (mục 6).
- **Windows:** khi menu khay đóng, cửa sổ ở phía trước là cửa sổ ẩn của khay (hoặc thanh taskbar), không phải app người dùng đang gõ. `Native::show()` đang nhớ cửa sổ đó làm đích dán, nên Enter sẽ gửi Ctrl+V vào nơi không nhận và báo "đã dán" sai. Vì vậy lần mở từ khay trên Windows chạy ở **chế độ chỉ chép**, là chế độ đã có sẵn (`auto_paste = false`): chân ô ghi "Enter: chép, rồi Ctrl+V để dán" (`compose.hint.copy`), Enter chỉ chép bản dịch vào clipboard (`Submitted::Copied`, không gọi `paste()`), người dùng tự dán. Dùng phím tắt ⌃⌥G thì vẫn dán tự động như trước.
  Cách làm: `Compose` (trạng thái trong `compose/mod.rs`) có cờ `copy_only` ứng với một lần mở. `open` nhận thêm tham số `from_tray: bool` và đặt cờ `copy_only = from_tray && cfg!(windows)` trước khi gửi `compose://open`; phím tắt gọi `open(app, false)`, menu khay gọi `open(app, true)`; `close` xóa cờ. `view()` (trường `auto_paste`) và `submit()` (biến `auto`) cùng đọc cờ này. Không sửa `native_windows.rs`.

Mục "Mục Gõ dịch trong menu khay" ở spec Gõ dịch §11 (Không làm) được bỏ khỏi danh sách đó bằng spec này.

## 5. Không làm

- Không thêm mục cho cuộn phụ đề lên/xuống (không phải việc bấm từ menu).
- Không đổi Cài đặt › Phím tắt, không đổi website.
- Không làm cho Gõ dịch mở từ khay trên Windows dán tự động (phải đoán cửa sổ người dùng đang gõ trước khi bấm khay, không đo được).

## 6. Kiểm thử

- Test Rust (`tray_menu.rs`): menu có đủ 4 mục có phím theo thứ tự; Gõ dịch ẩn khi tắt; `hotkey_action` đúng từng mục; `ALL` đủ 9 mục. Test `i18n` (có sẵn) bắt thiếu `tray_compose` ở ngôn ngữ nào.
- Test đọc chuỗi phím: mọi phím mặc định và vài phím dạng chuẩn (`Ctrl+Alt+Digit1`, `Ctrl+Alt+Backquote`, `Super+Alt+Space`, …) tạo được `MenuItem` với `accelerator`. Phần `menu.append` và thử lại không kèm phím chỉ thử tay (mục 6, macOS): `Menu` của macOS chỉ dựng được trên luồng chính nên test đơn vị không thêm mục vào menu được.
- Test `commit_settings`: đổi `hotkeys` hoặc `compose.enabled` thì dựng lại menu.
- Test `compose`: mở từ khay (giả lập Windows) thì `view().auto_paste` là `false` và `submit` không gọi `paste()`; mở bằng phím tắt thì cờ bị xóa.
- Tay trên macOS (tôi làm): mở menu khay, chụp ảnh thấy `⌃⌥T/H/L/G`; đổi một phím trong Cài đặt thì menu đổi; tắt Gõ dịch thì mục biến mất; bấm "Mở Gõ dịch" từ menu khi TextEdit đang ở phía trước, gõ, Enter: bản dịch dán vào TextEdit.
- Tay trên Windows (chủ dự án làm, tôi không có máy): menu hiện `Ctrl+Alt+T…` căn phải; bấm "Mở Gõ dịch" mở ô soạn với chân ô "Enter: chép, rồi Ctrl+V để dán", Enter chép bản dịch vào clipboard; phím tắt ⌃⌥G vẫn dán tự động như trước.
