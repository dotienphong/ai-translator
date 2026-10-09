# Cài macOS bằng một dòng lệnh (không cần Open Anyway)

Ngày 2026-10-09. Chủ dự án muốn người dùng mới trên Mac "cài rồi mở một phát được ngay", không phải vào System Settings bấm Open Anyway.

## Vấn đề

Bản macOS ký ad-hoc, chưa notarize (chưa có Developer ID, spec `2026-10-05-macos-adhoc-signing-design.md`). File `.dmg` tải bằng trình duyệt mang cờ `com.apple.quarantine`; Gatekeeper chặn app chưa notarize có cờ đó, và từ macOS 15 chỉ còn đường Privacy & Security › Open Anyway. Chỉ Developer ID + notarize mới bỏ được bước này một cách chính thống (99 USD/năm; chưa có ngân sách).

## Quyết định

Cung cấp script cài chạy bằng `curl -fsSL https://aitranslator.io.vn/install.sh | bash`. File tải bằng `curl` không bị macOS gắn cờ quarantine, nên Gatekeeper không đánh giá nó và app mở thẳng (chữ ký ad-hoc đủ để chạy trên Apple Silicon). Không đổi app, không đổi pipeline release.

- Script là file tĩnh `website/src/public/install.sh`, phục vụ bởi Worker website (`/install.sh`, `text/plain`, cache 5 phút, `noindex`).
- Nguồn bộ cài: R2 `releases.aitranslator.io.vn` do job `publish` đã đăng: `<kênh>/latest.json` (lấy `version`), `<version>/AI Translator_<version>_aarch64.dmg`, `<version>/SHA256SUMS-macos.txt`.
- Các bước: kiểm máy (Darwin, không root, Apple Silicon, macOS ≥ 14.2); đọc phiên bản (kênh stable mặc định, `--beta`); tải .dmg và SHA256SUMS, đối chiếu SHA-256; gắn .dmg chỉ đọc; kiểm mã định danh `com.aitranslator.desktop` và `codesign --verify --deep --strict`; đóng app đang chạy; `ditto` vào `.installing` rồi đổi tên (thay bản cũ nguyên khối, có hoàn tác); gỡ cờ quarantine khỏi app vừa cài (phòng hờ); kiểm chữ ký lần cuối; đóng .dmg, xóa thư mục tạm; mở app.
- Cài vào `/Applications`, không ghi được thì `~/Applications`. Không sudo, không gửi dữ liệu, không sửa gì ngoài thư mục cài.
- Toàn bộ script nằm trong hàm `main` gọi ở dòng cuối để đường truyền đứt giữa chừng không chạy nửa script. Thông báo song ngữ (theo ngôn ngữ macOS; vùng Việt Nam tính là tiếng Việt).
- Biến tùy chọn: `AI_TRANSLATOR_CHANNEL`, `AI_TRANSLATOR_INSTALL_DIR`, `AI_TRANSLATOR_NO_OPEN`, `AI_TRANSLATOR_LANG`. Không có biến ghi đè URL máy chủ (spec 2026-10-04); test dùng `curl` giả trong PATH.

## Giới hạn nói thẳng với người dùng

- Chạy lệnh dán từ internet là tin nguồn `aitranslator.io.vn`. SHA-256 nằm cùng máy chủ nên chỉ chống file hỏng, không chống kẻ kiểm soát máy chủ. Website nói rõ điều này và đưa lệnh "tải về đọc rồi chạy".
- Cách này không làm app được Apple notarize. File .dmg tải bằng trình duyệt vẫn bị chặn lần mở đầu.
- Cập nhật giữa hai bản ad-hoc vẫn hỏi 5 Keychain + 1 quyền thu âm (spec 2026-10-05, đã chốt chấp nhận).
- macOS có thể siết Gatekeeper ở các bản sau; khi có Developer ID thì đây không còn là đường duy nhất.

## Website

Trang Tải xuống (vi/en) có mục "Cài trên macOS bằng một dòng lệnh" (khối lệnh có nút Sao chép, cách đọc script trước khi chạy, kênh beta); hướng dẫn cài macOS có cách nhanh bằng lệnh và cách .dmg; các trang nhắc "chưa có tải công khai" / "lần mở đầu cần Open Anyway" sửa cho đúng (Windows vẫn nhận qua email; .dmg tải bằng trình duyệt vẫn cần Open Anyway). Không nêu công nghệ lõi (test chặn).

## Kiểm chứng

- `website/test/install-script.test.mjs`: hợp đồng với release (URL, tên file, mã định danh, SHA256SUMS), lệnh trên trang khớp header script, và chạy script thật với `curl` giả + .dmg giả (cài mới, cài đè, SHA-256 sai, thiếu dòng SHA, kênh 404, `version` độc hại, thư mục không ghi được).
- Đã thử trên MacBook Pro M4 Pro, macOS 26.6.2: app ký ad-hoc cài bằng script mở thẳng qua `open`, không bị chặn.
- Sau khi đăng bản thật lên R2: chạy lệnh từ URL công khai trên một Mac, mở app thật.
