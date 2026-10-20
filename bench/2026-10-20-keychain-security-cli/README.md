# Đo: hết hỏi Keychain khi cập nhật bằng cách dùng `/usr/bin/security` (2026-10-20)

MacBook Pro M4 Pro, macOS 26.6.2. Thiết kế: `docs/superpowers/specs/2026-10-20-macos-keychain-security-cli-design.md`.
Nối tiếp `bench/2026-10-09-keychain-prompts/` (cùng cách đo: tắt hộp thoại để biết macOS có hỏi không; `-25293` hay `-25308`
là SẼ HỎI, `0` là không hỏi).

Mọi script dùng service thử riêng, xóa mục thử khi xong, đọc có đồng hồ báo thức hoặc tắt hộp thoại nên không bao giờ treo máy hay
bật hộp thoại trên màn hình. Kiểm lại sau khi chạy: `security dump-keychain | grep at-bench` không ra gì.

## Chạy lại

```sh
bench/2026-10-20-keychain-security-cli/mechanism.sh   # cơ chế, không cần app (cần clang)
bench/2026-10-20-keychain-security-cli/run.sh         # trên chính mã của app (Keystore::os), tự dựng binary test
```

## `mechanism.sh`: cơ chế

| Phép đo | Kết quả (2026-10-20) |
|---|---|
| ad-hoc, hai bản build (cdhash `4a6a9198a1f9` và `fe0a920293b8`), bản khác đọc mục của bản trước | **hỏi** (-25293) |
| file không đổi byte: biên dịch ở hai thư mục, chép, ký lại cùng lệnh | cùng SHA-256 và cùng cdhash (`aae9e20edb70`); mỗi bản đọc mục của bản gốc **không hỏi** |
| `/usr/bin/security` gọi từ hai app ad-hoc có cdhash khác nhau (`ce2760b2857d`, `616da5eb5bab`), giá trị 6000 ký tự | cả hai đọc được, khớp, **không hỏi** |
| `security find-generic-password` với mục không có | mã thoát 44 |
| liệt kê thuộc tính mục cũ từ bản khác (`SecItemCopyMatching`, không lấy bí mật) | **không hỏi** (status 0, đủ 2 mục); đọc bí mật cùng mục thì hỏi (-25293) |

## `run.sh`: trên mã của app

Dựng binary test (`cargo test --no-run`), tạo ba bản sao ký ad-hoc với ba `identifier` khác nhau (cdhash khác nhau, giả lập ba bản
cập nhật liên tiếp), chạy `os_keystore_probe` (test `#[ignore]` trong `keystore.rs`) với đồng hồ báo thức 60 giây mỗi bước.

| Bước | Kết quả |
|---|---|
| A) bản 1 ghi bằng `Keystore::os`; bản 2 và bản 3 đọc | đạt, tức thì, không treo |
| B) bản 1 tạo mục cũ bằng API Keychain (như 0.1.x) rồi di trú; bản 2 và bản 3 đọc lại | đạt: sau di trú chỉ kiểm dấu, **không mở kho cũ** (mở sẽ hỏi và treo) |
| dọn | không còn mục thử |

Giới hạn của phép đo B: bản 1 vừa tạo mục cũ vừa di trú nên đọc kho cũ không hỏi; ở máy thật, lần cập nhật đầu tiên lên bản có
thay đổi này vẫn hỏi 1 hộp thoại (đọc `vault` cũ do bản trước tạo), điều chưa đo được mà không bật hộp thoại.

## Đo tay khác (không có script)

- **Chứng thư tự cấp có `OU=ABCDE12345`** (tạo bằng `openssl req -x509` với extendedKeyUsage `codeSigning`, nhập vào keychain tạm, ký
  bằng `codesign -s`): `TeamIdentifier=not set`, yêu cầu định danh `identifier "…" and certificate root = H"…"`, và bản build khác
  đọc mục của bản trước vẫn **hỏi** (-25293). macOS chỉ lấy Team ID từ chứng thư do Apple cấp. Lưu ý khi tự làm lại: `codesign
  --keychain <tệp>` báo "no identity found" với chứng thư chưa tin cậy; phải thêm keychain tạm vào danh sách tìm kiếm trong lúc ký
  rồi khôi phục danh sách (`security list-keychains -d user -s <login>`).
- **Giới hạn dòng của `security -i`**: dòng tới 4097 byte (kể cả xuống dòng) ghi đủ; 4100 byte thì mục lưu giá trị cụt (4027 ký tự
  thay vì 4030) và mã thoát 1, phần thừa bị coi là lệnh mới. Vì thế code giữ dòng dưới 3900 byte và đọc lại sau mỗi lần ghi.
- **Mã thoát của `security -i`**: là mã của lệnh cuối (44 khi `find` không thấy, 45 khi `add` không có `-U` gặp mục trùng). Lệnh
  `add-generic-password ... <đường dẫn keychain không tồn tại>` vẫn tạo mục ở keychain mặc định và thoát 0: đừng truyền đường dẫn
  keychain.
- **Chạy song song**: 8 luồng, mỗi luồng ghi rồi đọc lại 25 lần trên tài khoản riêng của mình (200 lần ghi kèm đọc lại cùng lúc
  qua `security -i`): 0 lần lỗi hay lệch. Bốn luồng ghi cùng MỘT mục (100 lần): 55 lần đọc lại thấy giá trị của luồng khác, không
  lần nào lỗi mã thoát. Vì thế hai nơi ghi cùng một tên cùng lúc sẽ báo lỗi giả; trong app, mọi lần ghi chạy lần lượt dưới một khóa
  chung của kho (`WRITE_LOCK` trong `keychain_cli.rs`, vì `License::accept` ghi `LICENSE` trước khi lấy khóa của nó).
- **Thời gian** (trung bình 20 lần): đọc (`find-generic-password -w`) 21 ms; ghi (`add-generic-password -U` qua `-i`) 41 ms; ghi rồi
  đọc lại bằng hai lần chạy 67 ms; **ghi rồi đọc lại trong MỘT lần chạy `security -i` (hai dòng) 43 ms**. Lệnh ghi lỗi (mục trùng
  không `-U`) rồi lệnh đọc: mã thoát là của lệnh đọc (0) và đầu ra là giá trị CŨ, nên so với giá trị định ghi sẽ lệch. Bộ đếm hạn
  mức ghi sau mỗi phụ đề dịch xong (một bộ đếm với gói Free, hai với gói trả phí) và nhịp bản quyền ghi hai mục mỗi phút.
