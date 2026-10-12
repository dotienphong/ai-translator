# Phiên bản và ngày phát hành của website tự theo bản đã đăng

Ngày 2026-10-13. Website nói "Phiên bản X, phát hành ngày D" (JSON-LD `softwareVersion`/`datePublished` và `llms.txt`), lấy từ `SITE.version` và `SITE.releaseDate` trong `website/src/site.mjs`. Hai giá trị này đang **gõ tay** và phải sửa bằng một commit thứ hai sau mỗi lần phát hành (`docs(website): phiên bản hiện tại 0.1.X`). Lần 0.1.7 quên commit đó: website ghi 0.1.6 trong khi R2 đã đăng 0.1.7, và test `SITE.version khớp tauri.conf.json` đỏ.

Spec này bỏ việc sửa tay đó, không thêm quyền ghi nào cho CI.

## 1. Quyết định

| # | Quyết định | Lý do |
|---|---|---|
| Q1 | Version và ngày **không còn gõ trong `site.mjs`**; một module `website/src/release.mjs` tính chúng lúc nạp. | Hết commit tay thứ hai, hết lệch. |
| Q2 | Có hai chế độ: **xem trước** (mặc định: `pnpm build`, `pnpm dev`, `pnpm test`) và **deploy** (`pnpm deploy`). | Build và test không cần mạng; chỉ deploy mới được lên mạng nên chỉ deploy cần sự thật từ R2. |
| Q3 | Chế độ xem trước: version = `version` trong `src-tauri/tauri.conf.json`; ngày = ngày commit gần nhất đổi dòng `"version"` của file đó (qua `git`). | Nâng bản app là website tự theo; không cần mạng. |
| Q4 | Chế độ deploy: version và ngày lấy từ `https://releases.aitranslator.io.vn/stable/latest.json` (`version`, `pub_date` đổi sang ngày giờ Việt Nam). Lỗi mạng hay dữ liệu lạ thì **dừng deploy**. | Website chỉ được nói điều có thật (CLAUDE.md): bản chưa đăng thì không được nói là đã phát hành. |
| Q5 | Deploy dùng version **của R2**, không từ chối khi nó thấp hơn `tauri.conf.json`. Từ chối khi nó **cao hơn** (repo cũ hơn bản đã đăng). | Giữa lúc nâng bản và lúc phát hành, bạn vẫn sửa được lỗi website (website nói bản đã phát hành thật). R2 mới hơn repo nghĩa là máy bạn chưa `git pull`, deploy lúc đó sẽ làm mất nội dung. |
| Q6 | Không thêm gì vào `release.yml`, không commit nào do CI làm. | Không thêm đường ghi vào `main` cho pipeline phát hành (kiểm toán 2026-10-09). |

## 2. Thiết kế

`website/src/release.mjs` (mới), gồm các hàm thuần để test và một hàm nối:

- `vnDate(iso)`: chuỗi ISO UTC → `YYYY-MM-DD` theo múi giờ `Asia/Ho_Chi_Minh` (`2026-10-12T18:00:00Z` → `2026-10-13`).
- `previewRelease({ confVersion, gitDate, today })` → `{ version, releaseDate }`: `version = confVersion`; `releaseDate = gitDate ?? today`.
- `deployRelease({ confVersion, latest })` → `{ version, releaseDate }`, ném lỗi tiếng Việt khi:
  - `latest.version` không phải `X.Y.Z` (kênh stable không có bản beta),
  - `latest.pub_date` không phải thời điểm ISO hợp lệ,
  - `latest.version` **cao hơn** `confVersion` ("R2 đã có bản X mới hơn repo (Y): `git pull` rồi deploy lại").
- `resolveRelease({ deploy, confPath, readFile, git, fetchLatest, today })`: đọc `tauri.conf.json`, rồi gọi hàm tương ứng. `fetchLatest` là `fetch` tới `RELEASES_URL/stable/latest.json` (hằng `RELEASES_URL = "https://releases.aitranslator.io.vn"`), hết hạn sau 15 giây, mã khác 200 hay JSON hỏng thì ném lỗi.
- Chế độ deploy bật khi dòng lệnh có cờ `--deploy`. Dùng cờ, không dùng biến môi trường, để chạy giống nhau ở mọi shell.

`website/src/site.mjs`: bỏ hai trường `version` và `releaseDate` gõ tay, thay bằng `const release = await resolveRelease(...)` rồi `version: release.version`, `releaseDate: release.releaseDate` (top-level await; `site.mjs` được nạp bằng `import` ở mọi nơi nên không đổi cách dùng).

`website/package.json`: `deploy` thành `node src/build/build.mjs --deploy && wrangler deploy && …` (phần còn lại giữ nguyên). Build lỗi thì `&&` dừng cả chuỗi, không có gì lên Cloudflare.

`SITE.updated` (ngày cập nhật nội dung) **giữ như cũ**, vẫn là ngày của nội dung do bạn sửa.

## 3. Đổi theo

- `website/README.md`: dòng "Trạng thái (bản 0.1.6 đã phát hành chính thức, …)" bỏ số phiên bản; thêm mục "Phiên bản và ngày phát hành" mô tả hai chế độ và việc `pnpm deploy` cần mạng tới R2.
- Test `JSON-LD: … version khớp bản phát hành` (`website/test/site.test.mjs`) giữ nguyên: ở chế độ xem trước `SITE.version` bằng `tauri.conf.json` theo cách tính, nên nó vẫn đúng và còn là hàng rào cho việc tính này.

## 4. Kiểm thử (`website/test/release.test.mjs`, mới)

- `vnDate`: ngày thường, sát nửa đêm UTC (qua ngày theo giờ Việt Nam), chuỗi sai.
- `previewRelease`: dùng `gitDate`; thiếu thì dùng `today`; chấp nhận version beta của `tauri.conf.json` (chỉ xem trước).
- `deployRelease`: dùng version và ngày của R2 khi R2 bằng hoặc thấp hơn repo; ném lỗi khi R2 cao hơn, R2 là bản beta, thiếu hay sai `pub_date`, thiếu `version`.
- `resolveRelease` với phụ thuộc giả: chế độ xem trước không gọi `fetchLatest`; chế độ deploy gọi đúng một lần; `fetchLatest` ném lỗi hay trả mã khác 200 thì deploy dừng, thông báo nói rõ lý do.
- `package.json`: lệnh `deploy` chạy `build.mjs --deploy` trước `wrangler deploy`.
- Dòng git: lệnh lấy ngày commit đổi dòng `"version"` của `tauri.conf.json` trả một ngày hợp lệ trong repo này.
- Kiểm tay một lần, không phải test tự động: `node src/build/build.mjs --deploy` thật với R2 (kỳ vọng ra `0.1.7` và `2026-10-12` ở thời điểm viết spec).

## 5. Không làm

- Không tự deploy website và không đụng `release.yml`.
- Không tự nâng 4 file version của app (`package.json`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`): vẫn là commit `chore(release)` của bạn.
- Không hiển thị version động bằng JS phía trình duyệt (CSP `default-src 'self'`, và công cụ tìm kiếm đọc HTML tĩnh).
- Bản beta: website chỉ nói bản stable, nên chế độ deploy chỉ đọc kênh `stable`.

## 6. Rủi ro còn lại

- `pnpm deploy` cần mạng tới `releases.aitranslator.io.vn`; mất mạng thì deploy dừng (chủ ý, an toàn).
- Chế độ xem trước có thể ghi version chưa phát hành (ví dụ sau khi nâng lên 0.1.8, trước khi đăng). Chỉ ảnh hưởng bản dựng cục bộ; không lên mạng được vì deploy dùng R2.
- Ngày ở chế độ xem trước là ngày commit nâng bản, không phải ngày đăng; chỉ để xem thử.
