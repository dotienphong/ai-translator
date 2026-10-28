# Kiểm tra tự động hằng ngày của bộ đọc tên người nói

Spec: `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` mục 7.3. Kế hoạch: `docs/superpowers/plans/2026-10-27-phan-biet-nguoi-noi-06-van-hanh.md`.

Teams, Meet và Zoom đổi giao diện không báo trước, và công thức đọc tên (spec 7.1) khớp theo giao diện đó. Mỗi đêm, trên máy của chủ dự án, công cụ này mở một cuộc họp thử, cho hai khách tự động nói theo một lịch đã biết, rồi cho **bộ đọc thật** của `speaker-worker` đọc cửa sổ họp của app thật và chấm: có thấy tên người tham dự không, chỉ báo "đang nói" có đúng người, đúng lúc không. Kết quả gửi về server như báo cáo tình trạng với `canary = true`; hỏng hai ngày liền (hay im lặng ba ngày) thì có email cảnh báo (spec 7.2).

Công cụ **không** thu âm, không chạy cả app, không đọc dữ liệu của người dùng, không cần tài khoản thật của ai. Nó chỉ đọc cây giao diện của cửa sổ họp thử (đúng phạm vi bộ đọc của app).

## Gồm những gì

| Phần | Việc |
|---|---|
| `crates/speaker-canary` (`speaker-canary`) | Chạy bộ đọc thật `--seconds` giây, chấm theo lịch, ghi kết quả, gửi báo cáo. Chạm hệ điều hành (Accessibility, UI Automation). |
| `crates/speaker-ops` (`canary.rs`, `health.rs`) | Luật chấm và dựng báo cáo (thuần, có test). |
| `canary.mjs`, `lib.mjs` | Bộ điều khiển: dựng lịch, mở và dọn cuộc họp qua bộ chuyển, gọi `speaker-canary run`, ghi nhật ký. |
| `adapters/<app>.mjs` | Bộ chuyển cho từng app: mở cuộc họp thử (chủ phòng là app thật, hai khách là trình duyệt tự động có micro giả là file giọng đọc) và chạy lịch nói của hai khách. **Làm cùng chủ dự án ở Task 19, 20 của kế hoạch 06**; chưa có file nào trong repo cho tới khi đó. |
| `templates/` | Mẫu cấu hình. |

## Cấu hình (ngoài repo)

File JSON ở **ngoài repo** (ví dụ thư mục dữ liệu riêng của máy), chỉ có tên hiển thị của các tài khoản thử và đường dẫn; **không có mật khẩu**: các hồ sơ trình duyệt đã đăng nhập sẵn một lần bằng tay.

```json
{
  "machine": "mac-chu-du-an",
  "canaryBin": "/đường/dẫn/tới/speaker-canary",
  "logDir": "/đường/dẫn/tới/thư-mục-nhật-ký",
  "api": "https://api.aitranslator.vn",
  "leadSeconds": 20,
  "apps": {
    "teams": { "guests": ["Tên khách A", "Tên khách B"], "options": {} },
    "meet_chrome": { "guests": ["Tên khách A", "Tên khách B"], "options": {} },
    "zoom": { "guests": ["Tên khách A", "Tên khách B"], "enabled": false, "options": {} }
  }
}
```

- `machine`: nhãn của máy chạy kiểm tra (chữ, số, `.`, `_`, `-`); thành `device_id_hash` của báo cáo (SHA-256 của `canary|<nhãn>`). Mac và Windows dùng hai nhãn khác nhau.
- `guests`: đúng tên hiển thị của hai khách trong cuộc họp thử. Tên này chỉ nằm trong file này và trong file lịch tạm (xóa sau mỗi lượt); không bao giờ vào log, kết quả hay báo cáo.
- `options`: tùy chọn riêng của bộ chuyển (hồ sơ trình duyệt, đường dẫn file giọng đọc…).
- `recipe` (tùy chọn): đường dẫn tới một công thức thay bản build sẵn, để thử công thức ứng viên hay cố ý thử với công thức hỏng (kiểm cảnh báo, Task 21 của kế hoạch 06).
- App không khai báo hay `enabled: false` thì bị bỏ qua.

## Tài khoản cần có

Theo spec 7.3 (chủ dự án tạo và đăng nhập sẵn trên máy chạy kiểm tra, trong hồ sơ trình duyệt riêng):

- 2–3 tài khoản Gmail: khách Meet phải đăng nhập Google. Một tài khoản làm chủ phòng Meet trong Chrome (hay Edge), hai tài khoản làm khách.
- 1 tài khoản Microsoft cá nhân: chủ phòng Teams (app Teams mới đã đăng nhập). Khách Teams vào bằng trình duyệt, không cần tài khoản.
- Zoom: chỉ khi chủ dự án có tài khoản và đồng ý (Zoom chưa có trong công thức build sẵn, nên chưa kiểm được).

## Chạy tay một lượt

```bash
# macOS (cần quyền Trợ năng cho tiến trình chạy lệnh; xem "Quyền Trợ năng")
cargo build --release -p speaker-canary
node tools/speaker-canary/canary.mjs --app teams --config "$HOME/…/canary.json"
# thử khô: không mở gì, không chạy speaker-canary
node tools/speaker-canary/canary.mjs --app teams --config "$HOME/…/canary.json" --dry-run
```

Mã thoát: `0` đạt; `1` tình trạng hỏng (đã gửi báo cáo); `2` lỗi chạy `speaker-canary`; `3` chưa gửi được (mạng; gửi lại bằng `speaker-canary send --report <file>`); `4` server từ chối (**mã 3 và 4 che mã 1**: tình trạng thật, kể cả hỏng, nằm ở trường `result.state` của nhật ký, và báo cáo chưa gửi được giữ ở `<logDir>/<ngày>-<app>.report.json` để gửi lại); `5` bộ chuyển không mở được cuộc họp (hạ tầng thử hỏng, **không** gửi báo cáo của app họp; xem nhật ký); `6` cấu hình sai.

Nhật ký mỗi lượt: `<logDir>/<ngày>-<app>.jsonl` (một dòng JSON: ngày giờ, app, mã thoát, tình trạng, điểm; không có tên người).

## Lịch chạy ban đêm

Sinh file lịch bằng `lib.mjs` (`launchdPlist`, `taskXml`, `slots`): mỗi app một lượt, cách nhau 10 phút.

- macOS (launchd): đặt plist vào `~/Library/LaunchAgents/`, rồi `launchctl bootstrap gui/$(id -u) <plist>`. Máy phải đã đăng nhập và không khóa màn hình lúc chạy (đọc cây giao diện cần phiên người dùng).
- Windows (Task Scheduler): `schtasks /Create /TN "AI Translator speaker-canary teams" /XML <file.xml>`; chỉ chạy khi người dùng đã đăng nhập.

Mỗi lượt khoảng 5 phút mỗi app (spec 7.3), nên đặt giờ lúc máy không dùng.

## Quyền Trợ năng (macOS)

Bộ đọc cần quyền Trợ năng. Với launchd, quyền thuộc về chương trình chạy: cấp cho cả `node` và `speaker-canary` ở System Settings › Privacy & Security › Accessibility. **Chưa kiểm** rằng cấp như vậy là đủ khi chạy từ launchd; kiểm ở Task 19 của kế hoạch 06.

## Khi hỏng

| Dấu hiệu | Việc |
|---|---|
| Email "speaker_canary_failed", tab Bộ đọc tên (Web Admin) hiện `no_names` | Giao diện app họp đổi: chạy `ax-record fixture` / `uia-record fixture` trên máy có app họp bản mới, sửa công thức, `pnpm recipes:update` (`docs/release/phat-hanh.md` mục 15). |
| `no_speaking` | Ô tên còn đọc được mà chỉ báo "đang nói" đổi: xem mẫu chỉ báo tự học ở tab Bộ đọc tên, rồi như trên. |
| `blocked` | App họp không trả lời bộ đọc (Teams treo, quyền cao hơn): kiểm tay. |
| Mã thoát 5 nhiều ngày | Bộ chuyển hỏng (hồ sơ đăng xuất, app họp đổi cách vào phòng): sửa bộ chuyển. Sau 3 ngày không có kết quả nào, server cũng gửi cảnh báo. |
| Không có email dù biết đã hỏng | Kiểm cron (`wrangler tail` Worker API: bước `speaker_health_alerts`), và `OPERATOR_EMAIL` đã đặt. |
