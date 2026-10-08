# Web Admin: thiết kế lại giao diện (UI/UX)

Ngày: 2026-10-08. Trạng thái: chủ dự án giao toàn quyền về chất lượng ("làm thật kĩ UI/UX thật đẹp cho tới khi tự hào, kiểm thử sai thì sửa tới khi ổn"); thiết kế do agent chốt, làm thẳng trên `main`.
Phạm vi: **chỉ giao diện** (`server/admin-ui/`). Không đổi API, dữ liệu, luật nghiệp vụ, CSP, bảo mật, hành vi của hộp xác nhận (ghi chú bắt buộc, gõ chữ xác nhận, chống bấm đúp, xử lý "không chắc kết quả"), cũng không đổi thao tác nào của người vận hành.

## 1. Chẩn đoán hiện trạng (ảnh chụp 2026-10-08)
Dùng được nhưng chung chung: mọi trang là tiêu đề và các hộp trắng; link xanh gạch chân; nút viền mảnh; trang chi tiết (đơn, license, máy) là danh sách nhãn và giá trị chiếm chỗ mà không có thứ bậc; thanh bên chỉ là chữ, không nhóm, không biểu tượng; thanh trên chật; không có nhận diện thương hiệu; phía dưới trống; trạng thái tải chỉ là chữ "Đang tải…"; bảng dày chữ, không căn số; nhật ký là bảng khô; hộp thao tác nhỏ, ít phân biệt thao tác nguy hiểm.

## 2. Hướng thiết kế: "bảng điều khiển vận hành" bình tĩnh, chính xác, cùng nhận diện với website
Đối tượng: một người vận hành, dùng hằng ngày, cần quét nhanh và thao tác không nhầm. Ưu tiên: thứ bậc rõ, mật độ vừa phải, số liệu dễ đọc, hành động nguy hiểm khó bấm nhầm.

**Nhận diện (theo website `website/src/assets/site.css`):** font Be Vietnam Pro tự lưu trữ (file woff2 sao từ `website/src/assets/fonts`, đủ latin và vietnamese, cùng giấy phép OFL), xanh thương hiệu `#1d63c9` (tối: `#4d9bff`), teal `#0a8f83` làm màu nhấn thứ hai, mực navy `#0b1322`, nền tối navy `#080d18`. Mono là `ui-monospace` cho key, mã máy, mã hành động.

**Token** (CSS custom property, sáng và tối, theo `prefers-color-scheme` như hiện nay): thang nền (`--bg`, `--surface`, `--surface-2`, `--surface-3`), đường kẻ (`--line`, `--line-strong`), mực (`--ink`, `--ink-2`, `--ink-3`), thương hiệu (`--brand`, `--brand-hover`, `--brand-soft`, `--on-brand`), ngữ nghĩa (`--ok`, `--warn`, `--bad`, `--info` và bản `-soft`), bóng (`--shadow-sm|md|lg`), bo góc (`--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 16px`), khoảng cách (thang 4px), chuyển động (`--ease`, thời lượng 120 đến 200 ms), vòng focus (`--focus`). Mọi cặp chữ và nền đạt tương phản WCAG AA (chữ thường ≥ 4,5:1; chữ lớn và biểu tượng ≥ 3:1), kiểm bằng phép tính chứ không bằng mắt.

**Chữ:** nền 14px/1,5 (dày hơn trang web vì là công cụ làm việc), tiêu đề trang 22px đậm vừa, nhãn nhóm 12px hoa tracking rộng, số tiền và số đếm dùng `font-variant-numeric: tabular-nums` (nếu font hỗ trợ; nếu không thì căn phải trong bảng), id dùng mono.

**Khung trang (app shell):**
- Thanh bên trái 248px: khối thương hiệu (biểu tượng và tên "AI Translator" kèm nhãn "Admin"), các nhóm có nhãn: *Vận hành* (Việc cần xử lý, Tổng quan), *Dữ liệu* (Đơn hàng, License, Máy và dùng thử), *Hệ thống* (Nhật ký, Hệ thống, Công cụ); mỗi mục có biểu tượng SVG nội tuyến 18px (viết tay, không thêm thư viện), mục đang chọn có nền `--brand-soft` và vạch nhấn trái; số đếm nhỏ trên "Việc cần xử lý" nếu có việc (lấy từ `/admin/summary` hay `/admin/queue` đã có, không thêm API). Thu gọn được thành thanh biểu tượng (nhớ lựa chọn bằng `localStorage`, bọc `try/catch`). Trên điện thoại: ngăn kéo trượt vào từ trái có lớp phủ, khóa cuộn nền, đóng bằng Esc, chạm ngoài hay đổi trang, trả focus về nút mở.
- Thanh trên 56px, dính, nền mờ: ô tra cứu lớn có biểu tượng kính lúp và gợi ý phím tắt (`/` hay Ctrl hay Cmd + K để nhảy vào ô), bên phải là nhãn môi trường "Production" và chip người vận hành (avatar chữ cái đầu và email, ẩn email trên điện thoại).
- Vùng nội dung: tối đa 1280px, đệm co giãn; **PageHeader** dùng chung: đường dẫn phụ (breadcrumb) cho trang chi tiết, tiêu đề, huy hiệu trạng thái, dòng mô tả, nhóm nút hành động bên phải (tự xuống dòng trên màn hẹp).

**Thành phần dùng chung** (mỗi cái một file, có test): Button (primary, secondary, ghost, danger; ba cỡ; trạng thái đang xử lý), IconButton, Badge (chấm màu và chữ, năm tông), Card (đầu thẻ có tiêu đề, mô tả, hành động), Stat (nhãn, giá trị lớn, ghi chú, biểu tượng, tông), EmptyState (biểu tượng, tiêu đề, gợi ý, hành động), Skeleton (thanh, thẻ, dòng bảng; thay mọi chữ "Đang tải…"), CopyButton (đổi chữ "Đã chép" 1,5 giây, thông báo cho trình đọc màn hình), KeyValue (lưới nhãn và giá trị, có thể chép), Timeline (nhật ký theo trục thời gian dọc), Toolbar/FilterBar (bộ lọc dạng thanh công cụ, chip cho bộ lọc đang bật, nút xóa lọc), DataTable (tiêu đề dính, hàng hover, số căn phải, dòng đếm kết quả, "Tải thêm", trên điện thoại thành thẻ có nhãn như hiện nay nhưng gọn hơn), Dialog (ConfirmDialog kiểu mới: biểu tượng ở đầu, tông nguy hiểm tách biệt, vùng hành động cố định).

**Trang:**
- *Việc cần xử lý:* dải ba chỉ số trên cùng; mỗi nhóm việc là một thẻ có chấm tông, số lượng, hướng dẫn xử lý, danh sách dòng có hành động rõ; không có việc thì trạng thái "mọi thứ ổn" thân thiện.
- *Tổng quan:* ô số có biểu tượng; mỗi biểu đồ trong thẻ có tiêu đề và mô tả; bảng màu biểu đồ thống nhất, tương phản tốt ở cả hai chế độ (xem kỹ năng `dataviz`); tooltip cùng phong cách.
- *Hệ thống:* thẻ trạng thái (kênh phát hành, model, cảnh báo) với chip trạng thái.
- *Danh sách (Đơn hàng, License, Máy và dùng thử, Nhật ký):* thanh lọc dạng chip và ô chọn thống nhất; bảng trong thẻ có dòng đếm; Nhật ký có chế độ xem dòng thời gian.
- *Chi tiết (Đơn, License, Máy):* PageHeader (huy hiệu, hành động chính), bố cục hai cột: trái là nội dung chính (máy, đơn, nhật ký dạng timeline), phải là thẻ "Thông tin" (KeyValue có nút chép) và thẻ "Hành động"; thao tác nguy hiểm (thu hồi, ẩn danh) nằm tách trong khu vực riêng và tông đỏ.
- *Công cụ:* lưới thẻ có biểu tượng; "Ẩn danh dữ liệu" trong khu vực nguy hiểm.
- *Tra cứu:* kết quả theo nhóm với thẻ tóm tắt.
- *Trang trống, lỗi, 404:* thiết kế riêng, không để màn hình trắng hay chữ trần.

**Chuyển động và hành vi:** chuyển cảnh nhẹ (≤ 200 ms), `prefers-reduced-motion` tắt hết; focus nhìn thấy rõ ở mọi phần tử tương tác; vùng chạm ≥ 40px (44px trên điện thoại); không dịch chuyển bố cục khi tải (skeleton đúng kích thước); liên kết "Bỏ qua tới nội dung" ở đầu trang.

## 3. Ràng buộc kỹ thuật (không thương lượng)
- CSP giữ nguyên (`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; ...`): không style inline trong HTML, không thẻ `<style>`, không script inline, không tải font hay ảnh từ nơi khác. Font nằm trong bản build (Vite phát tệp băm tên cùng origin). Biểu tượng là SVG nội tuyến trong JSX hay `data:` URI.
- Không thêm thư viện giao diện hay biểu tượng (React 19.3.0, Recharts 3.10.1 đã có). Thêm thư viện chỉ khi thật cần, theo quy tắc phiên bản của dự án.
- Giữ nguyên ngữ nghĩa (vai trò ARIA, nhãn, chữ của nút) để test và trình đọc màn hình không vỡ; khi đổi chữ hay cấu trúc thì sửa test cho khớp thiết kế mới và giải thích.
- Dung lượng: gói chính không tăng quá 90 KB gzip tính cả font (so với giao diện cũ `4fe54dd`); font tải theo nhu cầu (`font-display: swap`). Quyết định 2026-10-08: ngưỡng ban đầu 60 KB được nới lên 90 KB vì riêng bốn tệp font (400 và 600, latin và tiếng Việt) đã khoảng 36 KB, phần còn lại (biểu tượng SVG nội tuyến, thành phần dùng chung, CSS hai chế độ màu) không bỏ được mà không mất nhận diện hay trợ năng; trang Tổng quan (Recharts) vẫn tải lười, không tính vào gói chính.
- Hiệu năng cảm nhận: không chặn vẽ lần đầu vì font; skeleton thay vì chữ.
- Giao diện chỉ tiếng Việt, giờ GMT+7 như cũ.

## 4. Quy trình và tiêu chí hoàn thành
Làm theo pha, mỗi pha dựng, chụp ảnh thật (`scripts/csp-check.mjs --shot`, và dev server với API giả), **tự phê bình bằng mắt** (liệt kê chỗ chưa đẹp rồi sửa), chạy test và `pnpm check`, commit, rồi pha sau:
1. Nền tảng thiết kế và khung trang (token, font, biểu tượng, thanh bên, thanh trên, PageHeader, ngăn kéo điện thoại).
2. Thành phần dùng chung.
3. Việc cần xử lý, Tổng quan, Hệ thống.
4. Các trang danh sách.
5. Các trang chi tiết, Công cụ, Tra cứu, trạng thái trống và lỗi.
6. Tinh chỉnh: chế độ tối, điện thoại, chuyển động, trợ năng (kiểm tương phản bằng phép tính, kiểm bàn phím, kiểm `prefers-reduced-motion`), dung lượng, rà soát độc lập bằng ảnh chụp (reviewer đối kháng chấm từng trang theo checklist ở mục 5, sửa đến khi hết lỗi Critical và Important).

Hoàn thành khi: toàn bộ test xanh, `pnpm check` exit 0, công cụ CSP 0 vi phạm ở mọi trang và ba khổ (máy tính, điện thoại 500px, tối), reviewer không còn Critical hay Important, dung lượng trong ngưỡng, CI xanh, deploy xong, và chính agent thấy không còn chỗ nào "tạm được".

## 5. Checklist chấm điểm của reviewer thị giác (mỗi trang, sáng và tối, máy tính và điện thoại)
Thứ bậc rõ trong 3 giây đầu; căn lề và khoảng cách thống nhất theo thang 4px; không có chữ bị cắt hay tràn; số căn phải và đọc được; màu chỉ mang nghĩa (không trang trí lẫn lộn); tương phản đủ; trạng thái hover, focus, disabled, đang xử lý, lỗi, rỗng đều có thiết kế; hành động chính nổi bật, hành động nguy hiểm tách biệt; không có vùng trống vô nghĩa; mật độ thông tin hợp lý; điện thoại không tràn ngang, vùng chạm đủ lớn; nhất quán với website (font, màu, độ bo).
