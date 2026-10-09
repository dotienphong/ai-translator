# Giảm hộp thoại Keychain và quyền ghi âm sau mỗi lần cập nhật macOS (nghiên cứu)

Ngày 2026-10-09. Câu hỏi của chủ dự án: bản ad-hoc hiện làm macOS hỏi 5 hộp thoại Keychain + 1 quyền ghi âm sau mỗi lần cập nhật (spec 2026-10-05 §4, đã chốt chấp nhận); có cách giảm xuống 1–2, hay tắt hẳn, không? Số đo và các lựa chọn. **Chủ dự án chọn B (2026-10-09); đã cài đặt, xem mục 5.**

## 1. Vì sao hỏi

- Mỗi mục Keychain có ACL riêng. App tạo mục thì được tin theo **partition list** của mục. Với app ký ad-hoc (không Team ID), phân vùng là `cdhash:<băm của chính file này>`. Bản mới có cdhash khác nên bị hỏi lại, **mỗi mục một hộp thoại**. App lưu 5 mục (`db-key`, `license`, `license-seen`, `quota-free`, `license-trial`, cộng bộ đếm và marker theo gói).
- Quyền ghi âm thanh hệ thống (TCC) gắn với yêu cầu định danh (code requirement) lúc cấp quyền. Ad-hoc: `cdhash H"…"`, đổi mỗi bản.
- Nguồn bên ngoài khớp với số đo: Apple Developer Forums (thread 98484: Keychain hỏi lại khi nâng cấp app; partition_id thêm một cdhash mới sau mỗi bản) và tài liệu HackTricks về `ACLAuthorizationPartitionID` (`teamid:`, `apple:`, `cdhash:`).

## 2. Số đo (bench/2026-10-09-keychain-prompts/)

| Cách ký | Cập nhật sang bản build khác |
|---|---|
| ad-hoc (hiện tại) | hỏi, mỗi mục một lần (5 mục = 5 hộp thoại) |
| chứng thư tự cấp cố định | **vẫn hỏi** (không có Team ID) |
| ACL "mọi app" khi tạo mục (ad-hoc) | **vẫn hỏi** |
| `codesign -r 'designated => identifier …'` (đo 2026-10-05) | **vẫn hỏi** |
| Apple Development của Apple ID miễn phí (có Team ID) | **không hỏi** |

## 3. Các lựa chọn

**A. Ký bằng chứng thư Apple Development của Apple ID miễn phí, đặt `APPLE_TEAM_ID` = Team ID của chứng thư.** Keychain: 0 hộp thoại (đã đo). Quyền ghi âm: dự đoán 0 (chưa đo). Không phải sửa mã app: chế độ chặt của `genuine.rs` đã đòi `anchor apple generic and certificate leaf[subject.OU] = "<Team ID>"`, mà chứng thư Apple Development có OU là Team ID; `package-macos.sh` và `release.yml` đã nhận `MT_SIGN_IDENTITY`, secret p12 và `APPLE_TEAM_ID`, bỏ qua notarize khi không có khóa notarize. Phải làm: xuất p12 (chứng thư + khóa riêng) từ Keychain của máy đã tạo, đặt secret `APPLE_CERTIFICATE_P12*`, đặt `vars.APPLE_TEAM_ID`. Rủi ro:
  - Chứng thư Apple Development của tài khoản miễn phí được cấp để phát triển và thử nghiệm, không để phân phối; điều khoản và việc Apple có thu hồi hay không là rủi ro chưa kiểm chứng. Chủ dự án đã từng loại phương án này (2026-10-05).
  - Hạn 1 năm, phải làm lại hằng năm. Team ID giữ nguyên nên phân vùng Keychain không đổi; chủ chứng thư (CN) cũng giữ nguyên nên TCC không đổi (dự đoán).
  - Chưa thử chạy bản ký kiểu này trên một Mac khác; cần thử trước khi phát hành.
  - Gatekeeper vẫn chặn file `.dmg` tải bằng trình duyệt (không notarize); đường cài bằng `curl` không bị ảnh hưởng.
  - Chuyển từ ad-hoc sang kiểu này: một lần 5 + 1 hộp thoại, sau đó không hỏi nữa.

**B. Gộp 5 mục Keychain thành 1 (chỉ macOS).** 5 hộp thoại còn 1. Giữ ad-hoc, không rủi ro điều khoản. Sửa `security/keystore.rs`: một mục "vault" chứa bản đồ tên → giá trị, đọc/ghi nguyên khối, kèm di trú từ 5 mục cũ (đọc 5 mục cũ một lần: thêm một lượt 5 hộp thoại ở lần cập nhật đầu). Giá trị tối đa 2048 byte mỗi mục hiện nay là giới hạn của Credential Manager (Windows), macOS cho lớn hơn. Quyền ghi âm vẫn hỏi lại (còn 1 + 1 = 2 hộp thoại mỗi lần cập nhật). Cần chốt: một mục duy nhất làm rủi ro ghi đè lẫn nhau nếu hai tiến trình ghi cùng lúc (app chỉ có một tiến trình ghi).

**C. Developer ID (99 USD/năm).** Như A nhưng đúng điều khoản, thêm notarize: hết cả Open Anyway của `.dmg`. Là đích cuối.

**D. Không khả thi (đã đo hoặc đã loại):** chứng thư tự cấp; ACL "mọi app"; `-r designated`; chuyển Keychain sang file (chủ dự án đã quyết KHÔNG, 2026-10-05).

## 4. Khuyến nghị (trước khi chọn)

Nếu chấp nhận rủi ro điều khoản: A (một cấu hình, không sửa mã, hết hỏi) rồi chuyển C khi có ngân sách. Nếu không: B (còn 2 hộp thoại mỗi lần cập nhật). B và A không loại trừ nhau, nhưng B không còn cần khi đã có A hay C. Chưa thực hiện lựa chọn nào; cần chủ dự án quyết.

## 5. Đã làm: lựa chọn B (gộp một mục Keychain)

`src-tauri/src/security/keystore.rs`: trên macOS `Keystore::os` ở chế độ gộp. Mọi giá trị (JSON, base64) nằm trong một mục Keychain tên `vault` của service `com.aitranslator.desktop`; Windows giữ từng mục riêng.

- **Di trú lười:** khi đọc một tên chưa có trong `vault`, app đọc mục riêng cũ cùng tên (macOS hỏi một lần cho mục đó, như trước), chép vào `vault`. Không xóa mục riêng cũ (xóa có thể bật thêm hộp thoại): tên đã xử lý được ghi vào `legacy_done` nên mục cũ còn sót không bao giờ được đọc lại hay "sống lại" sau khi xóa.
- **Ghi:** ghi vào `vault` (đọc-sửa-ghi nguyên khối) dưới một khóa chung cho cả tiến trình, vì `db.rs` và `license/app.rs` mỗi nơi một `Keystore::os`. Mục chung hỏng (JSON sai) là lỗi, không bị ghi đè.
- **Kỳ vọng:** cập nhật từ bản cũ lên bản gộp: tới 5 hộp thoại Keychain (đọc 5 mục riêng) + 1 quyền thu âm, một lần. Từ đó mỗi lần cập nhật: **1 hộp thoại Keychain + 1 quyền thu âm**. Windows không đổi.
- **Test:** 12 test mới (`aggregated_*`: vòng đọc ghi xóa, chỉ một mục, di trú, không sống lại, ghi đè mục cũ, tách service, lỗi nền tảng không làm mất dữ liệu, mục hỏng không bị ghi đè, 8 luồng ghi cùng lúc không mất dữ liệu); 2 test chạy tay trên Keychain thật (`os_keystore_roundtrip`, `os_keystore_one_item`: ghi 5 giá trị, `security find-generic-password` chỉ thấy `vault`). 493 test Rust, clippy sạch.
- **Chưa đo trên chuỗi cập nhật thật** (cần hai bản phát hành liên tiếp có chữ ký khác nhau): làm khi phát hành bản có thay đổi này rồi bản kế tiếp, đếm hộp thoại. Chỉ sau số đo đó mới sửa website (các trang đang ghi "5 hộp thoại").
- Lời mời cập nhật trong app đổi từ "vài lần" sang "một lần" (`notice.updateReprompt`, vi/en).
