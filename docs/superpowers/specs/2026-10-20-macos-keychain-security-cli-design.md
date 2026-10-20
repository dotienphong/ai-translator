# Kho khóa macOS qua `/usr/bin/security`: hết hỏi Keychain khi cập nhật

Ngày 2026-10-20. Chủ dự án chọn cách **S** (dùng `/usr/bin/security`) thay vì cách H (helper tự viết, đóng băng) để cập nhật bản ad-hoc không còn hỏi mật khẩu Keychain, khi chưa có Developer ID. Nối tiếp `2026-10-09-macos-update-prompts-research.md` (lựa chọn B đã gộp 5 mục thành 1, còn 1 hộp thoại mỗi lần cập nhật). Thay đoạn chấp nhận "1 hộp thoại Keychain mỗi lần cập nhật" của `2026-10-05-macos-adhoc-signing-design.md` §4.

## 1. Vấn đề

Quyền đọc một mục Keychain gắn với chữ ký của chương trình đang đọc. Bản ký ad-hoc đổi `cdhash` sau mỗi lần build nên mỗi lần cập nhật macOS hỏi mật khẩu đăng nhập (lựa chọn B giảm còn 1 hộp thoại). Chỉ chữ ký có Team ID do Apple cấp hết hỏi, mà chưa có ngân sách cho Developer ID.

## 2. Quyết định

Giao việc đọc và ghi Keychain cho một chương trình không bao giờ đổi theo bản của app: `/usr/bin/security`, do Apple ký và được SIP bảo vệ. Mục do `security` tạo chỉ tin `security`, nên app cập nhật bao nhiêu lần macOS vẫn thấy cùng một người đọc và không hỏi.

- Phạm vi: chỉ macOS. Windows giữ nguyên Credential Manager (không hỏi gì khi cập nhật).
- Giữ nguyên giao diện của `Keystore` (`get`, `set`, `delete`) và `Vault`; không đổi chỗ gọi (`db.rs`, `license/`).
- Không xóa, không ghi đè mục Keychain cũ do bản trước tạo.
- Không dựa vào công cụ ngoài làm dữ liệu mất: mọi lỗi là lỗi, chỉ một mã thoát duy nhất mới nghĩa là "không có mục" (mục 4.2).

Đã loại: cách H (helper đóng băng: phải ghim nhị phân, chạm hơn mười file của đường phát hành, và mỗi lần sửa helper lại hỏi một lần); chứng thư tự cấp, ACL "mọi app", `codesign -r`, giả Team ID bằng `OU` (đều đã đo, vẫn hỏi); lưu file (mất lớp bảo vệ, trái những gì chính sách quyền riêng tư và website đang nói).

## 3. Căn cứ đo (2026-10-20, MacBook Pro M4 Pro, macOS 26.6.2)

Bộ thử ở `bench/2026-10-20-keychain-security-cli/` (dựa trên `bench/2026-10-09-keychain-prompts/kc.c`, tắt hộp thoại để biết có hỏi không).

| Phép đo | Kết quả |
|---|---|
| ad-hoc, bản build khác đọc mục của bản kia | hỏi |
| chứng thư tự cấp có `OU=ABCDE12345` | `TeamIdentifier=not set`, vẫn hỏi (macOS chỉ nhận Team ID từ chứng thư Apple cấp) |
| file không đổi byte (biên dịch lại ở thư mục khác, chép, ký lại) | cùng SHA-256, cùng `cdhash`, không hỏi |
| `security` gọi từ hai app có `cdhash` khác nhau | không hỏi; giá trị 6000 ký tự khớp; đọc khoảng 20 ms, ghi (`-i`) khoảng 41 ms mỗi lần chạy |
| liệt kê thuộc tính mục cũ (`SecItemCopyMatching`, không lấy bí mật) từ bản khác | không hỏi (status 0); đọc bí mật vẫn hỏi (-25293) |
| mã thoát của `security` | 0 thành công, 44 không có mục, 45 trùng mục; ở chế độ `-i` là mã của lệnh cuối |
| độ dài dòng của `security -i` | đạt tới khoảng 4097 byte; 4100 byte bị cắt (3 ký tự cuối thành "lệnh" thừa, mục lưu giá trị cụt, mã thoát 1) |

Mã thoát bằng OSStatus theo modulo 256 (-25300 thành 44, -25299 thành 45). Các mã 36 (không được hiện hộp thoại), 51 (từ chối) và 128 (người dùng hủy) suy ra từ quy tắc này, chưa gây ra được mà không bật hộp thoại.

Thực tế bên ngoài: Claude Code từng hỏng thông tin đăng nhập vì đúng giới hạn 4096 byte của `security -i`; Coder CLI cũng lưu bí mật qua `/usr/bin/security`.

## 4. Thiết kế

### 4.1 Bố cục lưu trữ

Mới (do `security` tạo), một mục mỗi giá trị:

- `service` = `<bundle id>.security` (ví dụ `com.aitranslator.desktop.security`): khác service của mục cũ, để `add-generic-password -U` không bao giờ nhắm vào mục cũ do API tạo (sẽ bị hỏi).
- `account` = tên giá trị (`db-key`, `license`, `quota-free`, …), cùng quy tắc tên như `Keystore::entry`.
- Giá trị = `v1:` + base64 của byte gốc. Tiền tố cho phép giá trị rỗng, cho phép đổi định dạng sau này, và phát hiện mục lạ (không có `v1:` thì là lỗi định dạng, không bao giờ là "không có mục").
- Dấu di trú: mục `account` = `@migrated` (ký tự `@` không có trong tên hợp lệ của app nên không đụng được).

Cũ (giữ nguyên, chỉ đọc một lần để di trú): service `<bundle id>`, mục gộp `vault` (JSON `VaultDoc`) cùng các mục riêng của bản 0.1.0.

### 4.2 Lệnh, giới hạn và quy tắc

| Việc | Lệnh | Ghi chú |
|---|---|---|
| đọc | `security find-generic-password -s S -a A -w` | bí mật chỉ ra stdout |
| ghi | `security -i`, stdin hai dòng: `add-generic-password -U -s "S" -a "A" -w "v1:…"` rồi `find-generic-password -s "S" -a "A" -w` | bí mật không nằm trên dòng lệnh (`ps`); một lần chạy, mã thoát là của lệnh cuối |
| xóa | `security delete-generic-password -s S -a A` | |

Quy tắc, mỗi dòng là một bài học đã đo hay đã gặp:

1. **Chỉ mã thoát 44 là "không có mục"** (`Error::NoEntry`). Mọi mã khác, lỗi chạy lệnh, hết giờ, đầu ra sai định dạng (kể cả thiếu dấu xuống dòng cuối mà `security -w` luôn thêm: thiếu nghĩa là đầu ra bị cắt, và đầu ra cụt ở ranh giới 4 ký tự base64 vẫn giải mã được thành giá trị ngắn hơn) đều là lỗi. Lý do: `db.rs` coi "không có khóa" là cớ tạo khóa mới và đổi tên DB cũ (mất lịch sử), `license/` coi "không có bản ghi" là hết hạn mức.
2. **Ghi xong đọc lại và so từng byte** (lệnh thứ hai của cùng lần chạy); lệch hay không thấy mục là lỗi. Lệnh ghi lỗi thì lệnh đọc trả giá trị cũ, ghi cụt thì trả giá trị cụt: cả hai đều lệch. Chặn nhóm lỗi "ghi cụt không báo" đã làm hỏng Claude Code. Gộp vào một lần chạy vì mỗi lần chạy `security` tốn khoảng 20 ms (đã đo: ghi kèm đọc lại 43 ms, thay vì 67 ms khi chạy hai lần).
3. **Dòng của `-i` tối đa 3900 byte** (giới hạn thật ở khoảng 4096). Giá trị tối đa của app là 2048 byte (base64 khoảng 2732 ký tự) nên luôn vừa; quá thì lỗi `TooLong` trước khi chạy lệnh. Có test cho trường hợp xấu nhất.
4. **stderr bỏ hẳn** (`Stdio::null`): khi lỗi `security` in lại nguyên dòng lệnh, kể cả bí mật.
5. **Tên và service chỉ gồm `A-Za-z0-9._@-`** (tối đa 128): không thể chèn lệnh vào dòng stdin của `-i`.
6. **Đường dẫn tuyệt đối `/usr/bin/security`**, không qua `PATH`, không qua shell.
7. **Hết giờ 120 giây** thì dừng tiến trình con và trả lỗi truy cập (đang chờ hộp thoại): không treo mãi khóa của bản quyền.
8. **Thử lại đúng một lần** khi lỗi là lỗi nền tảng (không chạy được tiến trình con, mã thoát lạ, đầu ra sai, đọc lại lệch), sau 50 ms. Lý do: lỗi ghi bộ đếm làm `License::add_usage` coi như hết hạn mức và dừng phiên đang dịch (`free_error`/`paid_error` → `remaining_locked` = 0 → `Break`), và lần ghi này chạy sau mỗi phụ đề. KHÔNG thử lại "không có mục" (là câu trả lời) hay lỗi truy cập (từ chối, hết giờ chờ hộp thoại: thử lại sẽ bật hộp thoại lần nữa hay chờ gấp đôi). Mọi thao tác đều lũy đẳng (`-U`; xóa mục đã xóa trả mã 44).
9. **Ghi và xóa chạy lần lượt** dưới một khóa chung của tiến trình (`WRITE_LOCK`, giữ suốt cả lần thử lại): hai nơi ghi cùng một tên chồng nhau, hay một lần xóa chen vào giữa lệnh ghi và lệnh đọc lại (`License::deactivate` xóa `LICENSE` ngoài khóa của `License` trong lúc ticker ghi nó), làm lần đọc lại báo lỗi giả. Khóa này không bao giờ giữ khóa nào khác (chỉ lồng sau khóa di trú), nên không thể gây khóa chéo.
10. **Chờ đầu ra có giới hạn:** sau khi `security` thoát chỉ chờ thêm 500 ms cho ống stdout. `std` tạo ống rồi mới đặt CLOEXEC (không nguyên tử) nên một tiến trình khác của app (tiến trình phụ vừa chạy ở luồng khác) có thể thừa hưởng đầu ghi và giữ ống mở hàng giờ; chờ EOF vô hạn lúc đó là giữ khóa ghi và khóa của `License` hàng giờ. Mọi lối ra sớm dừng và thu dọn tiến trình con, luồng không chạy được là lỗi (không panic khi đang giữ khóa), lỗi đọc ống là lỗi.

Ánh xạ mã thoát: 44 → `NoEntry`; 36, 51, 128 và hết giờ → `NoStorageAccess` (thành `KeystoreError::Access`); còn lại → `PlatformFailure`.

### 4.3 Di trú (một lần cho mỗi máy)

Trạng thái nằm trong chính kho mới (dấu `@migrated`); mỗi `Keystore` kiểm dấu ở thao tác đầu tiên (một lần gọi `security`), trong khóa chung của tiến trình, rồi nhớ trong bộ nhớ.

Chưa có dấu thì chạy di trú:

1. Liệt kê mục cũ cùng `service` bằng `search` (chỉ thuộc tính, không hỏi). Chỉ nhận đúng service (mock của test so khớp theo chuỗi con). Mục không cho biết service và tên là lỗi; tên không hợp lệ thì bỏ qua (app không bao giờ tạo ra: `Keystore::entry` chặn từ 0.1.0, nên đó không phải dữ liệu của app). Đây là chỗ duy nhất bỏ qua.
2. Đọc `vault` (macOS hỏi một lần; người dùng mới và máy sạch thì không có gì để đọc, không hỏi). Lấy mọi `items` của nó. Vừa được liệt kê mà đọc lại "không có" là LỖI, không phải rỗng (rỗng thì dấu được ghi mà không chép gì, dữ liệu cũ bị bỏ lại mãi); lần sau liệt kê lại và quyết định trên dữ liệu thật.
3. Các mục riêng cũ không nằm trong `items` cũng không trong `legacy_done` (người đi thẳng từ 0.1.0): đọc nốt (mỗi mục hỏi một lần, như lần di trú 0.1.0 → 0.1.1). Mục trong `legacy_done` là bản cũ đã chép hay đã xóa: bỏ qua, không "sống lại".
4. Với mỗi tên hợp lệ: chỉ chép nếu kho mới **chưa có** (không bao giờ đè giá trị mới), mỗi lần ghi có đọc lại kiểm.
5. **Ghi dấu sau cùng.** Bất kỳ bước nào lỗi (từ chối hộp thoại, JSON hỏng, ghi lỗi, đọc dấu lỗi) thì không ghi dấu, thao tác đang chạy trả lỗi, thao tác sau thử lại; không có chỗ nào coi lỗi là "rỗng" (ngoại lệ duy nhất là tên không hợp lệ ở bước 1). Không đọc được dấu cũng là lỗi (không phải "chưa di trú"): không mở kho cũ.

Có dấu thì **không bao giờ đụng kho cũ nữa** (mở kho cũ sau một lần cập nhật sẽ hỏi lại, và xóa xong sẽ sống lại). Không xóa mục cũ: hộp thoại xóa có thể bật thêm, và bản sao `db-key` cũ (khóa không đổi) còn là đường lùi. Mục cũ nào người dùng đã bấm "Always Allow" thì mục đó không hỏi thêm.

Hệ quả cho người dùng: cài mới 0 hộp thoại; người dùng hiện có 1 hộp thoại ở lần cập nhật sang bản này (đọc `vault`) và 0 ở mọi lần sau.

### 4.4 Chỗ sửa trong mã

- `src-tauri/src/security/keychain_cli.rs` (mới): `Runner` (bản thật chạy `security`, bản giả cho test), `SecurityCliStore` cài `keyring_core::CredentialStoreApi`, ghép vào `Keystore` như một store thường.
- `src-tauri/src/security/keystore.rs`: macOS dùng `SecurityCliStore` làm kho chính và store `apple-native-keyring-store` cũ làm nguồn di trú; bỏ chế độ gộp một mục (nay chỉ còn đọc `VaultDoc` để di trú). Windows không đổi.
- `src/i18n/*.ts`: `notice.updateReprompt` không còn nhắc mật khẩu đăng nhập (còn quyền thu âm, vì quyền này không thuộc Keychain).
- Không đổi: `db.rs`, `license/*`, đóng gói, CI, `build.rs`, bảng SHA-256, phụ thuộc.

## 5. Rủi ro và đánh đổi

- **Đọc im lặng:** tiến trình nào của cùng tài khoản cũng gọi được `security find-generic-password` và đọc mục này mà không bị hỏi (trước đây hộp thoại chặn lại). Windows vốn đã như vậy (Credential Manager không phân biệt app). Dữ liệu vẫn nằm trong Keychain (website và chính sách quyền riêng tư vẫn đúng). Chặn chặt hơn cần cách H cộng xác thực tiến trình gọi, đã cân nhắc và để ngoài phạm vi.
- **EDR doanh nghiệp:** một số luật phát hiện bắt lệnh `security find-generic-password`. Luật công khai của Elastic chỉ khớp khi dòng lệnh nhắc tên trình duyệt nên không trúng ở đây; EDR khác chưa kiểm được. Nếu gặp thì đổi sang cách H (người dùng thêm một hộp thoại).
- **Phụ thuộc hành vi công cụ của Apple** (mã thoát, `-w`, `-i`): đã dùng rộng rãi nhiều năm; mọi sai lệch thành lỗi chứ không thành "rỗng" (4.2).
- **Chi phí mỗi lần ghi:** bộ đếm hạn mức ghi sau mỗi phụ đề dịch xong, trên luồng engine (`session.rs` `usage`, `license::manager::add_usage`): khoảng 43 ms với gói Free, khoảng 86 ms với gói trả phí (hai bộ đếm), so với vài ms của API trước. Chấp nhận: phụ đề đã được gửi đi trước khi ghi (`engine.rs` `settle`), ngân sách độ trễ A2 là p50 2,0 s, và nhịp là vài giây mỗi phụ đề. Phải đo lại A2 khi thử bản có thay đổi này.
- **Hai nơi ghi cùng một tên cùng lúc, hay xóa chen vào giữa ghi:** lần đọc lại của một bên có thể thấy giá trị của bên kia (hay không thấy mục) và báo lỗi giả (đã đo trên `security` thật: 55 trên 100 lần khi 4 luồng tranh một mục; 8 luồng ghi 8 mục riêng, 200 lần, không lỗi nào). Có thể xảy ra thật: `License::accept` ghi `LICENSE` trước khi lấy khóa của `License`, và `deactivate` xóa nó ngoài khóa. Nên ghi và xóa chạy lần lượt dưới `WRITE_LOCK` (quy tắc 9, có test chạy chồng bằng `security` giả có độ trễ). Hai tiến trình app cùng lúc không được hỗ trợ (Tauri chạy một bản).
- **Lỗi ghi dừng phiên đang dịch:** `License::add_usage` coi lỗi ghi bộ đếm là hết hạn mức (từ trước, cả với API cũ: không ghi được bộ đếm thì không cho dùng tiếp, chống dùng mà không bị đếm). Cách CLI thêm các kiểu lỗi mà API trong tiến trình không có (không chạy được tiến trình con, mã lạ, kẹt), nên có quy tắc 8 (thử lại một lần). Chưa đổi luật đó (thành "giữ bộ đếm trong bộ nhớ, ghi lại ở nhịp sau khi còn hạn mức") vì là thay đổi logic bản quyền (spec gốc §6.8), ngoài phạm vi này; nếu thấy lỗi ghi thật ở máy người dùng thì đó là việc tiếp theo.
- **Từ chối hộp thoại di trú:** mọi thao tác sau (kể cả nhịp mỗi phút) lại thử và lại bật hộp thoại, và `License::load` chỉ chạy một lần lúc khởi động nên gói trả phí chỉ được nạp lại sau khi mở lại app. Giống hệt các bản trước (đọc `vault` bằng API); hướng dẫn "đừng bấm Deny, lỡ bấm thì thoát hẳn và mở lại" giữ nguyên.
- **`security -i` đợi EOF của stdin:** nếu một tiến trình khác thừa hưởng đầu ghi của ống stdin (cùng khe hở không nguyên tử như quy tắc 10), `security` không bao giờ thấy EOF và bị chặn bởi hạn 120 giây rồi trả lỗi truy cập. Xác suất cực nhỏ (khe hở cỡ micro giây, vài lần chạy mỗi phút); không xử lý riêng.
- **Phạm vi macOS đã đo:** mã thoát, giới hạn dòng và hành vi `-i` chỉ đo trên macOS 26.6.2, mà bản tối thiểu là 14.2 (`tauri.macos.json`). Sai khác ở đó sẽ hỏng ồn ào (đọc lại lệch, mã 44 không như kỳ vọng) chứ không thành "rỗng", nhưng làm hỏng bản quyền: phải chạy lại bộ đo ở macOS 14.x trước khi phát hành (mục 7).
- **Keychain bị khóa** vẫn hỏi mở khóa, như mọi cách khác.
- **Quay lại bản cũ** đọc kho cũ (đã đứng yên từ lúc di trú): thấy dữ liệu cũ, không mất gì, nhưng không thấy giá trị mới.

## 6. Kiểm thử

Test đơn vị chạy trên cả hai hệ điều hành bằng `Runner` giả mô phỏng `security` (kể cả giới hạn dòng 4096, mã thoát của lệnh cuối, độ trễ giữa hai lệnh để các luồng chen vào nhau): vòng ghi đọc xóa kể cả byte tùy ý và giá trị rỗng; chỉ 44 là "không có mục"; thử lại đúng một lần cho lỗi nền tảng và không bao giờ cho lỗi truy cập hay "không có mục"; bí mật không bao giờ nằm trong đối số; ghi cụt hay ghi không dính bị bắt; thiếu dấu xuống dòng cuối là lỗi định dạng; dạng đầu vào của lệnh ghi (không dòng trống, đúng một dấu xuống dòng cuối); giá trị quá lớn bị chặn trước khi chạy; ký tự lạ bị từ chối; ghi và xóa không bao giờ chạy chồng nhau (đo bằng số lần chạy đồng thời lớn nhất). Di trú: cài mới không chạm kho cũ; chép đủ `vault`; bỏ mục cũ trong `legacy_done`; nhận mục riêng của 0.1.0; không đè giá trị mới; ghi đầu tiên vẫn di trú trước; lỗi liệt kê, lỗi đọc dấu, lỗi ghi dấu, mục vừa liệt kê đã biến mất, JSON hỏng đều là lỗi không ghi dấu và thử lại được; sau dấu không mở kho cũ nữa; xóa xong không sống lại; nhiều `Keystore` song song chỉ di trú một lần. Riêng nhóm test chạy chương trình thật qua `SystemRunner` (đầu ra lớn, hết giờ, tín hiệu, tiến trình khác giữ ống mở) chỉ chạy ở unix. Chạy thật trên macOS (`#[ignore]`): vòng ghi đọc xóa qua Keychain thật (kể cả giá trị 2048 byte) kiểm bằng `security`, và hợp đồng mã thoát 44 (`security_exit_44_contract`, chỉ đọc). Đo "cập nhật" bằng ba bản có `cdhash` khác nhau (ký lại cùng file với ba `identifier`) chạy từng bản với đồng hồ báo thức: nếu hỏi sẽ treo (`bench/2026-10-20-keychain-security-cli/run.sh`).

## 7. Trước và sau khi phát hành (chưa làm trong thay đổi này)

**Trước khi phát hành:**
- Chạy `bench/2026-10-20-keychain-security-cli/mechanism.sh`, `run.sh` và hai test chạy tay (`os_keystore_security_cli_roundtrip`, `security_exit_44_contract`) trên một Mac macOS 14.x (bản tối thiểu 14.2): mọi phép đo ở đây mới có trên macOS 26.6.2 (mục 5).
- Đo lại độ trễ A2 trên bản có thay đổi này (mỗi phụ đề dịch xong ghi thêm khoảng 43 ms, 86 ms với gói trả phí, trên luồng engine).
- Máy của chủ dự án chạy Microsoft Defender for Endpoint, ghi lại đối số của mọi lệnh được chạy (ở đây chỉ có tên service và account, không có bí mật). Xem cổng của nó có cảnh báo cho `security find-generic-password` không, trước khi coi rủi ro EDR (mục 5) là nhỏ; các phép đo ngày 2026-10-20 đã chạy lệnh này nhiều lần trên mục thử.

**Sau khi phát hành:**
1. Đo trên hai bản phát hành liên tiếp thật: lần cập nhật đầu (từ bản cũ) đếm đúng 1 hộp thoại Keychain, lần sau 0.
2. Chỉ sau số đo đó mới sửa lời trên website (download, faq, guide-install-macos, guide-troubleshooting, data-security: mục "1 hộp thoại Keychain") và `docs/release/phat-hanh.md` mục 5. Quyền thu âm và quyền Trợ năng vẫn hỏi lại mỗi lần cập nhật ad-hoc; trang web phải giữ phần đó.
3. Nếu có Developer ID: bỏ được lớp này (API gốc không hỏi khi có Team ID), nhưng không bắt buộc; mục do `security` tạo vẫn dùng được.

## 8. Ngoài phạm vi

Quyền ghi âm và Trợ năng (TCC, gắn với chữ ký, không liên quan Keychain; chứng thư tự cấp cố định nhiều khả năng giữ được nhưng chưa đo); xóa mục Keychain cũ; cách H; Windows.

## 9. Vận hành và gỡ lỗi (cho người thử và hỗ trợ)

- Xem các mục của app, không hiện bí mật: `security dump-keychain ~/Library/Keychains/login.keychain-db | grep -B8 'com.aitranslator.desktop.security'`. Mỗi giá trị một mục (`db-key`, `license`, `license-seen`, `quota-free`, …) cộng mục `@migrated`.
- Đọc một giá trị khi cần (in `v1:` + base64): `security find-generic-password -s com.aitranslator.desktop.security -a license -w`.
- Ép chạy lại di trú, an toàn vì chỉ chép tên chưa có và không đè: `security delete-generic-password -s com.aitranslator.desktop.security -a @migrated`. Lần mở app sau đọc lại kho cũ (macOS hỏi một lần nếu `cdhash` đã đổi từ lúc đó).
- **Xóa sạch app để thử lại như người dùng mới:** KHÔNG xóa các mục `db-key`, `license*`, `quota-*` của gói trả phí. Mất bản ghi bộ đếm thì app coi như đã dùng hết hạn mức cả chu kỳ và phải nhờ admin "Reset hạn mức" (spec §6.8; xem ghi chú khi xóa `vault` ở bản cũ). Muốn thử lại di trú thì chỉ xóa mục `@migrated`.
- Log (`~/Library/Logs/com.aitranslator.desktop/app.log`): dòng "kho khóa: đã chép N mục từ Keychain cũ sang kho mới" xuất hiện một lần mỗi máy.
- Mục thử của test chạy tay (`#[ignore]`) có service `com.aitranslator.desktop.test.cli-<pid>.security`; test tự xóa. Bộ đo `bench/2026-10-20-keychain-security-cli/` dùng service `at-bench-*` và `…test.probe-*`, cũng tự xóa.
