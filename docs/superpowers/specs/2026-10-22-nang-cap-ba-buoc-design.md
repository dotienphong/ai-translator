# Màn hình Nâng cấp: ba bước, cách trả chọn sẵn theo ngôn ngữ (thiết kế)

Ngày 2026-10-22. Chủ dự án đã duyệt bố cục (mẫu C, "các bước đánh số") qua mockup cùng ngày. Phạm vi: `src/windows/main/screens/UpgradeView.tsx`, `UpgradeScreen.tsx`, `src/lib/license.ts`, `src/store/license.ts`, `src/lib/ipc.ts`, `src/styles/main.css`, `src/components/Icon.tsx`, `src/i18n/*.ts`, `src-tauri/src/license/{client,purchase,manager}.rs`, `src-tauri/src/app_tests.rs`, `scripts/ui-preview/`, `website/src/content/{vi,en}/{guide-license,pricing}.mjs` và ảnh `website/src/assets/img/app/app-upgrade*`. **Server không đổi, không phải deploy.**

Spec này thay quyết định D4 của `2026-10-14-creem-international-payment-design.md` ở phía app: cách trả không còn chọn sẵn theo nước của máy.

## 1. Vấn đề

- Hai ô **Chuyển khoản VietQR (VND)** và **Thẻ quốc tế (USD)** dùng đúng kiểu thẻ của bốn ô gói: cùng viền, cùng nút tròn, cùng viền màu nhấn khi chọn. Nhìn như thêm một hàng gói, khó biết mình đang ở mục VietQR hay mục thẻ.
- Ghi chú về cách trả ("VietQR: chuyển khoản từ tài khoản ngân hàng Việt Nam.", hay hai câu về Creem) nằm dưới bảng giá, cách xa ô chọn cách trả.
- Cách trả chọn sẵn theo nước của máy (server đoán từ IP, trường `suggested_currency`). Chủ dự án muốn chọn sẵn theo ngôn ngữ giao diện: khách Việt Nam (giao diện tiếng Việt) thấy VietQR, khách quốc tế (en, ja, zh, ko) thấy thẻ quốc tế.

## 2. Bố cục mới

Dưới tiêu đề màn hình (thẻ `h1` "Nâng cấp Pro" của `Shell`, không đổi) có ba bước. Mỗi bước có một tiêu đề `h2`, gồm số thứ tự trong vòng tròn màu nhấn (chỉ để nhìn, `aria-hidden`) và tên bước. Phần thân của bước thụt vào cho thẳng với chữ của tiêu đề.

1. **Cách thanh toán** (`upgrade.method`, chữ có sẵn). Thân bước gồm:
   - Nhóm radio (`role="radiogroup"`, `aria-labelledby` trỏ vào phần chữ của tiêu đề bước, id `upgrade-method-label` như cũ). Mỗi lựa chọn là một **nút viên thuốc** (bo tròn hẳn), có biểu tượng mới (`qr` cho VietQR, `card` cho thẻ) và nhãn có sẵn (`upgrade.method.vnd`, `upgrade.method.usd`).
     - Đang chọn: nền màu nhấn (`--accent`), chữ và biểu tượng trắng.
     - Chưa chọn: nền `--surface`, viền `--border-strong`, chữ `--muted`; rê chuột vào thì chữ `--text`.
     - Ô radio gốc vẫn còn nhưng ẩn bằng cách che (không dùng `display: none`), nên phím mũi tên chuyển lựa chọn như radio thường và test vẫn tìm được `input[name="method"]`. Có focus bằng bàn phím thì nút có viền `--focus` (`:has(input:focus-visible)`).
     - Cửa sổ hẹp (tối thiểu 720 px) thì hai nút xuống dòng (`flex-wrap`).
   - Ngay dưới hai nút là ghi chú của cách trả đang chọn, chuyển lên từ `.plan-notes`: VietQR có `upgrade.bankOnly`, thẻ có `upgrade.cardNote` và `upgrade.cardMor`. Chữ ghi chú không đổi.
   - Server chỉ bán VND (chưa bật Creem): bước 1 vẫn hiện, chỉ có một nút VietQR đang chọn và ghi chú của nó. Khách vẫn thấy mình trả bằng gì, và thứ tự 1 · 2 · 3 không đổi. Trước đây trường hợp này ẩn cả nhóm.
2. **Chọn gói** (khóa mới `upgrade.step.plan`). Bảng bốn gói (Free và ba gói trả phí, lưới 2 × 2) giữ nguyên kiểu và hành vi.
3. **Thanh toán** (khóa mới `upgrade.step.pay`). Theo thứ tự: ô báo lỗi (`role="alert"`, như cũ); form tạo đơn (câu gia hạn nếu có, ô email có nhãn `upgrade.email`, ô đồng ý, tài liệu pháp lý, nút trả tiền), chỉ hiện khi không có đơn đang chờ, như cũ; khung đơn (mã QR, hay khung "trang thanh toán đã mở" với đơn thẻ), hiện khi có đơn, như cũ. Đơn đã xong (đã trả, hết hạn, đã hủy) thì cả form lẫn khung đơn cùng hiện, như cũ. Tiêu đề khung đơn (`.card-title`) đổi từ `h2` sang `h3` cho đúng thứ bậc dưới tiêu đề bước; cỡ chữ giữ nguyên vì kiểu đặt theo lớp `.card-title`.

### 2.1. Các trạng thái

- **Chưa có bảng gói** (`plans === null`: đang tải, hay không có mạng): không hiện tiêu đề bước nào. Màn hình gồm ô Free, câu `upgrade.loading` hay ô báo lỗi, và khung đơn nếu đang có đơn chờ. Ghi chú cách trả chỉ hiện khi đang có đơn chờ, vì lúc đó loại tiền biết chắc từ đơn (đơn thẻ vẫn có câu bên bán lại); không có đơn thì không hiện, vì chưa biết sẽ chọn sẵn loại nào. Lý do: chưa biết server bán loại tiền nào thì không vẽ nút cách trả hay ghi chú, tránh cảnh vừa hiện VietQR lại nhảy sang thẻ khi bảng gói về.
- **Đang có đơn chờ trả**, hay đang tạo đơn (`busy`): bước 1 và bước 2 khóa ở cách trả và gói của đơn, như hiện nay (`lockedCurrency`). Nút viên thuốc và thẻ gói đang chọn vẫn rõ như lúc chọn được; các ô còn lại mờ (`opacity: 0.6`), con trỏ thường.
- Giao diện tối: chỉ dùng token màu, không đặt màu cứng.

## 3. Cách trả chọn sẵn

- `defaultCurrency(plans, lang)`: giao diện `vi` thì VND; giao diện khác (`en`, `ja`, `zh`, `ko`) thì USD nếu server bán được USD (`offeredCurrencies`), không thì VND.
- `chosenCurrency(picked, plans, lang)`: khách đã bấm chọn và loại tiền đó còn bán thì giữ; ngược lại theo mặc định. Lựa chọn nằm trong state của `UpgradeView`, nên rời màn hình là mất: mỗi lần vào màn hình Nâng cấp, cách trả chọn sẵn lại theo ngôn ngữ. Chưa bấm chọn mà đổi ngôn ngữ giao diện thì lựa chọn sẵn đổi theo.
- Có đơn đang chờ thì vẫn khóa theo đơn (`lockedCurrency`), không theo ngôn ngữ.
- Hệ quả đã nói với chủ dự án: người Việt để giao diện tiếng Anh thấy thẻ quốc tế được chọn sẵn, bấm một lần là đổi được.

### 3.1. Bỏ `suggested_currency` ở phía app

App không dùng gợi ý theo nước nữa, nên bỏ cả đường đi của nó trong app:

- Rust: `PlansReply.suggested_currency` và hàm `known_currency` (`license/client.rs`); `PlansView.suggested_currency` trả cho giao diện (`license/purchase.rs`); `FakeApi` trong test của `license/manager.rs`. Lệnh IPC `get_plans` trả `{ plans }`, vẫn là object như hiện nay.
- TypeScript: trường `suggestedCurrency` trong `ipc.ts`, `store/license.ts`, props của `UpgradeView`, `UpgradeScreen`; tham số `suggest=` của IPC giả (`scripts/ui-preview/tauri-mock.ts`).
- Server vẫn gửi `suggested_currency` cho app cũ (≤ 0.2.2). serde bỏ qua trường lạ, nên app mới đọc bảng gói bình thường. Phải có test giữ điều này: một phản hồi có `suggested_currency` vẫn đọc được bảng gói.

## 4. Chữ (i18n)

Hai khóa mới, đủ năm ngôn ngữ, theo cách gọi "gói" đã dùng trong từng file (ja プラン, zh 套餐, ko 플랜):

| Khóa | vi | en | ja | zh | ko |
| --- | --- | --- | --- | --- | --- |
| `upgrade.step.plan` | Chọn gói | Choose a plan | プランを選ぶ | 选择套餐 | 플랜 선택 |
| `upgrade.step.pay` | Thanh toán | Checkout | お支払い | 付款 | 결제 |

Các khóa khác giữ nguyên chữ. Bản dịch không qua người bản ngữ duyệt, như các lần trước.

## 5. Biểu tượng

Thêm `qr` và `card` vào `src/components/Icon.tsx`, cùng kiểu với các biểu tượng sẵn có (một đường `path` trên lưới 24 × 24; độ dày nét và đầu nét tròn do component `Icon` đặt chung). `qr`: ba ô vuông góc cộng vài chấm. `card`: hình chữ nhật bo góc có một vạch ngang.

## 6. Website

Website chỉ nói điều có thật, nên chỉ deploy **sau khi** bản app có thay đổi này đã phát hành (quy trình phát hành, bước `pnpm deploy`).

- `guide-license` (vi, en): câu "app chọn sẵn theo nước nơi bạn kết nối mạng" đổi thành chọn sẵn theo ngôn ngữ giao diện (tiếng Việt thì VietQR, ngôn ngữ khác thì thẻ quốc tế). Các bước hướng dẫn nói theo ba bước mới của màn hình.
- `pricing` (en): dùng ảnh `app-upgrade` bản en, vì giao diện tiếng Anh giờ đã chọn sẵn thẻ; bỏ cảnh `app-upgrade-usd`.
- Câu mô tả ảnh (`alt`) của các ảnh `app-upgrade*` (vi, en) tả bố cục ba bước và cách trả đang chọn.
- `scripts/ui-preview/shoot.mjs`: bỏ cảnh `app-upgrade-usd`, bỏ `suggest=usd` khỏi các cảnh khác; chụp lại `app-upgrade`, `app-upgrade-qr`, `app-upgrade-card` và cập nhật `manifest.json`.
- Chạy lại test của website, trong đó có test chặn lộ công nghệ lõi.

## 7. Kiểm thử

- **Vitest `lib/license.test.ts`:** `defaultCurrency` và `chosenCurrency` theo ngôn ngữ. `vi` cho VND; `en`, `ja`, `zh`, `ko` cho USD; server không bán USD thì mọi ngôn ngữ đều VND; lựa chọn đã bấm được giữ; lựa chọn không còn bán thì quay về mặc định.
- **`UpgradeView.test.ts`:**
  - Đã có bảng gói thì có ba tiêu đề bước, theo đúng thứ tự; chưa có bảng gói thì không có tiêu đề bước nào.
  - Mặc định là VND khi `lang: "vi"`, USD khi `lang: "en"`.
  - Ghi chú cách trả nằm trong bước 1, đứng trước bảng gói.
  - Chỉ bán VND thì có đúng một radio `method`, đang chọn.
  - Có đơn chờ thì nhóm cách trả bị khóa, như các test hiện có.
  - Tiêu đề khung đơn là `h3`.
- **`store/license.test.ts`:** bỏ các kiểm tra `suggestedCurrency`.
- **Rust:** bỏ các test về `suggested_currency`; thêm test cho thấy phản hồi có `suggested_currency` vẫn đọc được bảng gói; `get_plans` trả `{ plans }`.
- **`scripts/ui-preview/check-i18n.mjs`** (DOM thật, Chrome không đầu, năm ngôn ngữ): bỏ `suggest=` khỏi các cảnh; kiểm cách trả chọn sẵn theo ngôn ngữ của lượt chạy (`vi` thì VND, còn lại USD); kiểm có ba tiêu đề bước, nhãn của nhóm radio, ghi chú nằm trong bước 1; đổi bộ chọn `h2.card-title` thành `h3.card-title`; cảnh `usd=0` có đúng một nút VietQR.
- **Nhìn bằng mắt:** chụp màn hình Nâng cấp ở vi và en, sáng và tối, ở cỡ cửa sổ mặc định (960 × 640) và cỡ nhỏ nhất (720 × 480), qua `scripts/ui-preview`.
- Build lại toàn bộ rồi chạy hết test: Vitest, `cargo test`, `cargo clippy`, test website.

## 8. Ngoài phạm vi

- Trường `suggested_currency` của server: giữ nguyên cho app cũ.
- Giá, gói, luồng tạo đơn và hỏi trạng thái đơn.
- Bố cục trang Bảng giá của website, ngoài ảnh và câu mô tả ảnh.

## 9. Phát hành

Đi cùng bản app kế tiếp (0.2.3) theo quy trình phát hành 5 bước. Làm trên nhánh `nang-cap-ba-buoc` (worktree `meeting-translator-work/nang-cap-ba-buoc`). Không merge, push, đẩy tag hay deploy khi chủ dự án chưa cho phép.
