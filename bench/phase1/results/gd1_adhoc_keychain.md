# Đo Keychain và quyền thu âm với bản macOS ký ad-hoc (2026-10-05)

Máy: MacBook Pro M4 Pro, macOS 26. Người đo: chủ dự án (PHONG); đối chiếu với `~/Library/Logs/com.aitranslator.desktop/app.log`.

- Bản 1: `0.1.0`, `CDHash=04c9d5fe018a0d2c078c2b7394da01b9b6362696`.
- Bản 2: `0.1.0-adhoc2`, `CDHash=774c5dca316984588c91cd7c76db5cb1270e7068`.
- Cả hai: `Signature=adhoc`, `TeamIdentifier=not set`, `Identifier=com.aitranslator.desktop`, dựng bằng `AI_TRANSLATOR_MAC_SIGNING=adhoc scripts/release/package-macos.sh`.
- Phép kiểm giả lập phép tự kiểm của app trên bản đóng gói thật: `codesign --verify --strict --deep -R "=identifier \"com.aitranslator.desktop\""` đạt cho cả hai; với bundle id sai thì bị từ chối (exit 3).

## Chuẩn bị
Trước khi đo đã xóa 6 mục Keychain cũ của bản dev (`db-key`, `license`, `license-seen`, `quota-free`, `quota-mark-…`, `quota-paid-…`) để mô phỏng người dùng mới. Hệ quả đúng thiết kế, thấy trong log: "mất bản ghi bộ đếm hạn mức… coi như đã dùng hết" (nên Free báo `quotaExhausted` cho tới khi nhập key), và "khóa không mở được data.db: tạo DB mới" (file cũ đổi tên `data.db.unreadable-…`, lịch sử không mất). Model giữ nguyên.

## Kết quả

| Bước | Quan sát |
|---|---|
| A. Mở bản 1 có quarantine (cài kiểu tải về) | Gatekeeper chặn; Privacy & Security có nút **Open Anyway**; mở được sau khi bấm. Keychain: **0** hộp thoại. Log không có dòng "không chính hãng" (phép tự kiểm đạt trên bản đóng gói thật). |
| B. Nhập key, bắt đầu dịch (bản 1) | Keychain: 0 hộp thoại. Quyền thu âm: hỏi 1 lần (cấp). Phụ đề hiện; log: 6 và 2 đoạn được nhận dạng. |
| C. Thoát hẳn bản 1, mở bản 2 (không quarantine, như bản cập nhật tự động) | Keychain: **5 hộp thoại** hỏi mật khẩu (đã bấm Always Allow). Quyền thu âm: **hỏi lại 1 lần** (đã cấp). Gatekeeper: không chặn. Còn **Professional**, không phải nhập lại key. Phụ đề hiện; log: 3 và 2 đoạn được nhận dạng. |
| D. Thoát rồi mở lại bản 2 | Không còn hộp thoại Keychain hay quyền nào. Dịch bình thường (log 22:50:58, 2 đoạn). |

## Lần thử đầu của bước C không hợp lệ
Lần đầu bản 1 chưa thoát hẳn khi chép bản 2 đè lên (tiến trình vẫn chạy, đường dẫn `AppTranslocation/…`, log chỉ có một dòng "khởi động"). Từ lúc thay file, các phiên dịch tiếp theo nhận khung âm thanh nhưng 0 đoạn nhận dạng và app báo "Không nghe thấy gì". Đây là hệ quả của việc thay file dưới một tiến trình đang chạy, không phải của bản 2; không tính vào kết quả. Lần thử lại (thoát hẳn bằng khay, kiểm `pgrep`, rồi mở bản 2) cho kết quả ở bảng trên.

## Kết luận
- Phép tự kiểm ad-hoc hoạt động trên bản đóng gói thật: gói Professional chạy, không bị coi là không chính hãng.
- **Mỗi lần cập nhật giữa hai bản ad-hoc khác nhau, người dùng gặp một lần: 5 hộp thoại Keychain và 1 hộp thoại quyền thu âm** (CDHash đổi nên macOS coi là app khác). Sau khi cấp thì các lần mở sau không hỏi nữa. Không mất dữ liệu, không mất Professional.
- Cài mới lần đầu không bị hỏi Keychain; chỉ có Gatekeeper (Open Anyway) và quyền thu âm.
- Lưu ý khi mô phỏng: `ditto` kèm `xattr` quarantine vào `/Applications` làm app chạy qua App Translocation; khách thật kéo từ `.dmg` bằng Finder có thể không bị translocation. Chưa đo đường đó.
- Chưa đo qua bộ cập nhật tự động của app (cần bản đăng lên R2); lần này thay bản bằng tay.

## Thử giảm hỏi lại: yêu cầu định danh cố định bằng `codesign -r` (2026-10-05, buổi tối)

Cách thử: ký lại hai bản `.app` đã dựng bằng `codesign --force --sign - -r "=designated => identifier \"com.aitranslator.desktop\"" --options runtime --entitlements src-tauri/release/entitlements.plist`. `codesign` chấp nhận; yêu cầu định danh của cả hai bản là `designated => identifier "com.aitranslator.desktop"` (trước đó là `cdhash H"…"`), CDHash vẫn khác nhau (`c4812b3f…` và `da359d5c…`), phép tự kiểm của app vẫn đạt. Cài bản 1 rồi bản 2 vào `/Applications` theo đúng quy trình ở trên, không xóa gì giữa hai bản.

| Bước | Quan sát |
|---|---|
| Bản 1 (yêu cầu định danh), nhập key X2, bắt đầu dịch | Dịch được (log: 3 đoạn lúc 23:10). Quyền thu âm đã cấp. |
| Mở bản 2 thay bản 1 (sau khi thoát hẳn) | **5 hộp thoại Keychain** và **quyền thu âm hỏi lại**; còn Pro X2; phụ đề hiện (log 23:13 và 23:14, bản `0.1.0-adhoc2`). |
| Mở lại bản 2 | Không còn hộp thoại nào. |

**Kết luận: không có tác dụng.** Số hộp thoại giống hệt khi không có yêu cầu định danh. Nhiều khả năng macOS gắn quyền Keychain (partition ID) và quyền thu âm của app ký ad-hoc với mã băm của chính chữ ký (`cdhash`), không dùng yêu cầu định danh ta đặt. Đây là suy luận từ kết quả đo, chưa kiểm trực tiếp bằng công cụ.

Ghi chú về cách đo:
- `clean.sh` (script đo, nằm ngoài repo) lần đầu xóa cả `quota-paid-*` và `quota-mark-*`, nên app áp luật mất bản ghi bộ đếm (spec §6.8): coi như hết hạn mức cả chu kỳ khi nhập lại key trên cùng máy. Phải nhờ admin `reset-quota` (activation của license X2, `quota_epoch` 0 lên 1), rồi gỡ kích hoạt và nhập lại key để có token `quota_fresh`. Không xóa các mục `quota-*` và `license*` khi đo lại.
- Máy có sẵn một chứng thư `Apple Development` (Apple ID miễn phí, có Team ID cá nhân). Chưa thử ký bằng nó.
