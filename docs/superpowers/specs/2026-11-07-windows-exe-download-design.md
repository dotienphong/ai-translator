# Tải bộ cài `.exe` dự phòng trên trang Tải xuống Windows

## Mục đích và lý do
Trên trang Tải xuống (`/tai-xuong/#cai-windows` và các bản ngôn ngữ `en`, `ja`, `zh`, `ko`), cách cài mặc định bằng một dòng lệnh PowerShell (`irm https://aitranslator.vn/install.ps1 | iex`) được giữ ở vị trí ưu tiên số 1 vì không gắn dấu Mark-of-the-Web nên không qua màn hình cảnh báo SmartScreen. Tuy nhiên, nhiều người dùng Windows quen bấm tải trực tiếp file `.exe` hoặc dùng máy công ty chặn PowerShell. Thay vì phải gửi email xin file `.exe`, trang Tải xuống sẽ cung cấp thêm **Cách 2: tải trực tiếp bộ cài `.exe`** ngay dưới 3 bước PowerShell, với liên kết tự động cập nhật theo đúng phiên bản vừa phát hành mỗi khi chạy `pnpm deploy`.

## Mục tiêu & Phi mục tiêu
- **Mục tiêu:**
  - Giữ nguyên 3 bước cài bằng lệnh PowerShell làm cách cài ưu tiên ở đầu tab Windows.
  - Thêm khối **Cách 2: tải bộ cài `.exe`** ngay bên dưới 3 bước PowerShell trên tab Windows của cả 5 ngôn ngữ (`vi`, `en`, `ja`, `zh`, `ko`), chứa nút bấm tải trực tiếp file `AI Translator_<version>_x64-setup.exe` từ CDN R2 (`https://releases.aitranslator.vn/<version>/AI%20Translator_<version>_x64-setup.exe`) và liên kết tới `SHA256SUMS-windows.txt` cùng hướng dẫn qua SmartScreen (`/huong-dan/cai-dat-windows/#cai-bang-exe`).
  - Liên kết `.exe` và tên file tự động lấy từ `SITE.version` (khi `pnpm deploy` lấy từ `stable/latest.json` trên R2 và đã đối chiếu `SHA256SUMS-windows.txt`; khi `pnpm build`/`dev`/`test` lấy từ `src-tauri/tauri.conf.json`).
  - Cập nhật câu hỏi thường gặp trong `download.mjs` (5 ngôn ngữ) cho nhất quán với việc tab Windows đã có nút tải trực tiếp `.exe` dự phòng.
- **Phi mục tiêu:**
  - Không đổi cách cài trên macOS (vẫn cài bằng lệnh `curl ... | bash` hoặc nhận `.dmg` qua email).
  - Không dùng JavaScript phía trình duyệt để gọi mạng sang `releases.aitranslator.vn` (giữ nguyên CSP chặt của website).

## Các phương án đã xét
1. **Phương án 1 (Được chọn): Sinh URL `.exe` tĩnh lúc build/deploy từ `SITE.version` và `RELEASES_URL`.**
   - Tận dụng `resolveRelease()` trong `website/src/release.mjs`: lúc chạy `pnpm deploy` (`--deploy`), build đọc `stable/latest.json` trên R2 và kiểm tra dòng của `AI Translator_<version>_x64-setup.exe` trong `SHA256SUMS-windows.txt` trước khi sinh HTML. Không phát sinh kết nối mạng ở trình duyệt, hoạt động cả khi tắt JS, giữ nguyên mô hình bảo mật ghim phiên bản lúc deploy.
2. **Phương án 2 (Loại): Dùng JS trên trình duyệt đọc `stable/latest.json` từ R2.**
   - Vi phạm CSP (`connect-src` không mở sang `releases.aitranslator.vn`), không chạy khi tắt JS và trái với kiểm toán bảo mật 2026-10-25.

## Chi tiết thiết kế
1. **`website/src/release.mjs` & `website/src/site.mjs`:**
   - Xuất hàm `winInstallerOf(version)` trong `website/src/release.mjs` trả về `{ file, url, sums }`:
     - `file`: `AI Translator_${version}_x64-setup.exe`
     - `url`: `${RELEASES_URL}/${version}/AI%20Translator_${version}_x64-setup.exe`
     - `sums`: `${RELEASES_URL}/${version}/SHA256SUMS-windows.txt`
   - Gắn `winInstaller: winInstallerOf(release.version)` vào `SITE` trong `website/src/site.mjs`.
2. **Giao diện khối tải `.exe` dự phòng (`website/src/assets/site.css` & `website/src/content/<lang>/download.mjs`):**
   - Trong `winPanel()` của `vi`, `en`, `ja`, `zh`, `ko`, ngay sau `${flow([...])}` và trước `<div class="panel-more">`, thêm khối `.panel-alt` (`id="tai-exe"` ở bản `vi`, `id="download-exe"` ở bản `en`/`ja`/`zh`/`ko`) gồm:
     - Tiêu đề phụ (`<h3>`) nêu rõ đây là cách dự phòng: tải bộ cài `.exe`.
     - Đoạn mô tả ngắn: dùng khi bạn muốn tự chạy bộ cài hoặc máy chặn PowerShell; vì bản Windows chưa ký mã nên trình duyệt hoặc SmartScreen có thể cảnh báo (bấm **More info › Run anyway**), kèm liên kết tới hướng dẫn kiểm tra `SHA256SUMS-windows.txt` và cài từ `.exe`.
     - Nút tải `<a class="btn btn-secondary" href="${SITE.winInstaller.url}">${icon("download")} <span>... <code>${SITE.winInstaller.file}</code></span></a>` và liên kết phụ tới `${SITE.winInstaller.sums}` (`SHA-256`).
   - Cập nhật câu hỏi trong `DL_FAQ` và FAQ của `winPanel` ở cả 5 ngôn ngữ cho khớp.
3. **Kiểm thử:**
   - Thêm test trong `website/test/release.test.mjs` cho `winInstallerOf(version)`.
   - Thêm test trong `website/test/download-page.test.mjs` và `website/test/site.test.mjs` kiểm tra nút tải `.exe` trên trang Tải xuống khớp đúng `SITE.version`, URL trỏ tới `https://releases.aitranslator.vn/<version>/AI%20Translator_<version>_x64-setup.exe`, và không bị tràn ngang ở mọi kích thước màn hình.

