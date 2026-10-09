# Đo: vì sao cập nhật bản ad-hoc làm macOS hỏi lại Keychain, và cách nào hết hỏi

Ngày 2026-10-09, MacBook Pro M4 Pro, macOS 26.6.2. Bộ thử `kc.c` dùng đúng API Keychain cũ mà `keyring` (apple-native-keyring-store 1.0.2) dùng:
`SecKeychainAddGenericPassword` để tạo mục, `SecKeychainFindGenericPassword` để đọc. Khi đọc, `SecKeychainSetUserInteractionAllowed(FALSE)`
tắt hộp thoại: trả `-25293` (errSecAuthFailed) nghĩa là **macOS sẽ hỏi người dùng**, `0` là đọc được không hỏi.

"Bản build khác" = cùng mã nguồn, thêm `-DBUILD_ID="2"` nên khác nhau về cdhash, giống cập nhật sang bản mới. Mục được tạo bằng `kc1`,
đọc bằng `kc2`.

```sh
clang -arch arm64 -DBUILD_ID='"1"' -o kc1 kc.c -framework Security -framework CoreFoundation -Wno-deprecated-declarations   # và BUILD_ID 2
codesign --force -s <danh tính> --identifier com.aitranslator.kctest kc1 kc2
./kc1 write kc-test acct secret; ./kc1 read kc-test acct; ./kc2 read kc-test acct; ./kc1 delete kc-test acct
```

| # | Cách ký | `kc2` đọc mục của `kc1` | Ghi chú |
|---|---|---|---|
| V1 | ad-hoc (như bản phát hành hiện tại) | **hỏi** (-25293) | designated requirement là `cdhash H"…"`, đổi mỗi bản build |
| V2 | chứng thư tự cấp cố định (`AI Translator Dev`) | **hỏi** (-25293) | DR ổn định (`identifier … and certificate leaf = H"…"`) nhưng không có Team ID nên vùng phân vùng (partition) vẫn theo cdhash |
| V3 | Apple Development (Apple ID miễn phí, Team ID `H7WM3795WU`) | **không hỏi** (0) | vùng phân vùng theo `teamid:` nên bền qua các bản build |
| V5 | ad-hoc, mục tạo bằng `SecAccessCreate(…, NULL)` (cho mọi app) | **hỏi** (-25293) | ACL "mọi app" không bỏ được phân vùng |
| V6 | ad-hoc, 5 mục | **hỏi 5 lần** | mỗi mục một hộp thoại, khớp số đo 5 hộp thoại của spec 2026-10-05 |

Kết luận: chỉ chữ ký có **Team ID do Apple cấp** (Apple Development của Apple ID miễn phí, hay Developer ID) làm Keychain hết hỏi
qua các bản cập nhật. Chứng thư tự cấp và ACL "mọi app" không giúp. Chưa đo quyền ghi âm thanh hệ thống (TCC) vì cần bấm hộp thoại
thật; lý do dự đoán nó bền khi có danh tính ký ổn định: TCC lưu yêu cầu định danh của app, ad-hoc là `cdhash` (đổi mỗi bản), còn Apple
Development/Developer ID là `identifier … and anchor apple generic and certificate leaf[subject.CN] = …` (không đổi).
