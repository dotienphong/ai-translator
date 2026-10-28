# Phân biệt người nói, kế hoạch 07b: pháp lý, website, spec chính, runbook, kiểm cuối (Task 10–15) và phần cần chủ dự án (Task 16–24)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Quy tắc chung, quy ước (`W`, `DATA`, `B`, `M`), quyết định thiết kế (QĐ 1–10) và cách làm với commit nằm ở **file 07** (`2026-10-28-phan-biet-nguoi-noi-07-phat-hanh.md`, Task 0–9): đọc phần đầu của file đó trước. Ở đây nhắc lại những điều dễ quên: **không push, không gộp `main`, không squash, rebase, amend, không deploy, không đẩy tag, không chạm production, Cloudflare, R2, GitHub Actions thật trong Task 10–15**; commit cục bộ được (nếu còn được phép: hỏi ở Task 0 Step 1); Task 16–24 do **chủ dự án chạy hay ra lệnh**, Claude chuẩn bị và kiểm kết quả bằng lệnh chỉ-đọc. Không chạy gì với Teams, Chrome, Edge, Zoom hay app họp thật trong Task 10–15. Mọi lệnh bắt đầu bằng `cd $W &&`. Grep dùng `/usr/bin/grep`.

**Goal của file này:** (1) viết nội dung pháp lý (chính sách quyền riêng tư 1.9, EULA 1.6) để chủ dự án và luật sư duyệt; (2) website năm ngôn ngữ nói đúng điều có thật về tính năng, kèm test chặn câu cũ; (3) sửa spec chính theo §15 của spec; (4) runbook phát hành, bật, tắt khẩn; (5) kiểm cuối toàn nhánh và biên bản; (6) các bước chủ dự án: gộp, triển khai server, nghiệm thu A-spk3 và A-spk6 với Teams thật, Windows i5, ngày hiệu lực pháp lý, phát hành app 0.3.2 "ngủ", đăng model để bật, website, theo dõi.

**Tech Stack:** Markdown (`docs/legal`, spec, runbook); website tĩnh Node thuần (`website/`, `node --test`); Python 3 (`unittest`, chỉ thư viện chuẩn) cho bộ chấm A-spk3; shell. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §10 (pháp lý), §12 (A-spk3, A-spk6), §13 mục 7, §15.

## Cấu trúc file

| File | Việc | Task |
|---|---|---|
| Sửa `docs/legal/privacy.{vi,en}.md`, `docs/legal/eula.{vi,en}.md`, `docs/legal/README.md`, `website/test/site.test.mjs` | chính sách 1.9, EULA 1.6 (dòng phiên bản giữ nguyên tới Task 21) | 10 |
| Sửa `website/src/content/{vi,en,ja,zh,ko}/{about,solutions,solutions-tiktok-live}.mjs`, `website/test/site.test.mjs` | gỡ câu cũ "chưa có / không biết ai đang nói" (15 chỗ) | 11 |
| Sửa `website/src/content/{vi,en,ja,zh,ko}/{guide-subtitle-bar,faq,data-security}.mjs`, `website/test/site.test.mjs` | nội dung người nói (mục hướng dẫn, một câu hỏi, mục quyền riêng tư) | 12 |
| Sửa spec chính | D1, §3.1 F13, §3.2, §3.3, §5, §6.3, §6.6, §7, §8, §10.1, §10.2 | 13 |
| Sửa `docs/release/phat-hanh.md` | mục 16: bật, tắt khẩn, quay lại | 14 |
| Tạo `$B/results/07-nghiem-thu.md` (hoàn thiện) | kiểm cuối, quét, biên bản | 15 |
| Tạo `bench/2026-10-26-nguoi-noi/score_names_export.py`, `test_score_names_export.py` | bộ chấm A-spk3 từ bản chép lời xuất ra | 18 |
| Tạo `scripts/models/released/body-4.json` (hay `body-N+1`) | phần thân manifest có mục `speaker` | 22 (chủ dự án) |
| Sửa `docs/legal/*` (dòng phiên bản), `docs/legal/README.md`, `website/test/site.test.mjs`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Cargo.lock` | ngày hiệu lực, nâng 0.3.1 → 0.3.2 | 21 (chủ dự án) |

---

### Task 10: Pháp lý, nội dung chính sách 1.9 và EULA 1.6 (dòng phiên bản và ngày giữ nguyên)

Chính sách quyền riêng tư (spec §10 "Pháp lý"): app tạm thời phân tích đặc điểm giọng ngay trên máy để phân biệt người nói, không để xác định danh tính, không lưu, không gửi đi; app đọc tên người tham dự hiển thị trên cửa sổ cuộc họp để gắn nhãn; tên chỉ lưu khi người dùng bật Lưu lịch sử; chế độ trợ năng của Teams (và trình duyệt khi Meet vào công thức); công thức tải từ xa; báo cáo tình trạng không có tên; model 26 MB. Nội dung đổi ngay; **dòng phiên bản và ngày hiệu lực giữ nguyên (1.8, 1.5) tới Task 21**, như kế hoạch nguồn micro 04 (app đóng gói `docs/legal` lúc build, website sinh từ đó; đổi ngày sớm thì website, app ghi hai ngày cho một phiên bản). Đây là **bản nháp cho chủ dự án duyệt và hỏi luật sư** (spec §10: dữ liệu sinh trắc học theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và Nghị định 356/2025).

**Files:** Modify `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/eula.vi.md`, `docs/legal/eula.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Test hỏng trước**

Thêm vào cuối `website/test/site.test.mjs` (dùng `textOf`, `htmlByPath` có sẵn):

```js

// ---- Phân biệt người nói (spec 2026-10-26-phan-biet-nguoi-noi §10; kế hoạch 07): pháp lý ----

test("chính sách quyền riêng tư và EULA nói về phân biệt người nói: đặc điểm giọng chỉ trong RAM, tên đọc từ cửa sổ họp Teams, Trợ năng, công thức tải từ xa, báo cáo tình trạng không có tên", () => {
  const needs = {
    "/chinh-sach-quyen-rieng-tu/": [
      "Đặc điểm giọng để phân biệt người nói",
      "tự xóa khi hết phiên",
      "không dùng nó để xác định danh tính",
      "Tên người tham dự đọc từ cuộc họp",
      "cửa sổ cuộc họp Microsoft Teams bản cài",
      "Không đọc chat",
      "chế độ trợ năng của Teams",
      "Công thức đọc tên",
      "Báo cáo tình trạng của bộ đọc tên",
      "không có tên người",
      "giữ 60 ngày",
    ],
    "/en/privacy/": [
      "Voice features used to tell speakers apart",
      "deleted automatically when the session ends",
      "does not use it to identify anyone",
      "Participant names read from the meeting",
      "Microsoft Teams desktop meeting window",
      "does not read the chat",
      "accessibility mode of Teams",
      "Name-reading recipe",
      "Name-reader status report",
      "no participant names",
      "kept 60 days",
    ],
    "/dieu-khoan/": ["hiện tên người tham dự đọc từ cửa sổ cuộc họp", "Nhãn người nói và tên do ứng dụng gán tự động có thể sai"],
    "/en/terms/": ["shows the names of participants read from the meeting window", "Speaker labels and names assigned automatically can be wrong"],
  };
  const errors = [];
  for (const [urlPath, list] of Object.entries(needs)) {
    const text = textOf(htmlByPath.get(urlPath));
    for (const n of list) if (!text.includes(n)) errors.push(`${urlPath}: thiếu "${n}"`);
  }
  assert.deepEqual(errors, []);
});
```
Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: `not ok … chính sách quyền riêng tư và EULA nói về phân biệt người nói…`, `# fail 1`.

- [ ] **Step 2: Chính sách tiếng Việt (`docs/legal/privacy.vi.md`)**

Mỗi cặp `old`/`new` là một lệnh Edit; `old` phải khớp **đúng một lần** (không khớp hay khớp nhiều lần thì dừng và báo, đừng đoán).

(a) Mục 2, thêm gạch đầu dòng ngay trước dòng "Ứng dụng không có tài khoản":
```old
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**.
```
```new
- **Phân biệt người nói** (bật mặc định, tắt được ở Cài đặt › Phụ đề › Người nói): ứng dụng tạm thời phân tích đặc điểm giọng ngay trên máy để biết câu nào do cùng một người nói và hiện nhãn "Người 1", "Người 2". Đặc điểm giọng **chỉ nằm trong bộ nhớ RAM, tự xóa khi hết phiên, không ghi xuống đĩa, không gửi đi**, và ứng dụng không dùng nó để xác định danh tính ai (mục 3). Trên macOS, ứng dụng còn đọc **tên người tham dự hiển thị trên cửa sổ cuộc họp Microsoft Teams bản cài** để gắn tên vào phụ đề (mục 3).
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**.
```
(b) Mục 2, dòng máy chủ lưu gì (một lần khớp):
```old
báo cáo lỗi (giữ 30 ngày) và tin nhắn chat hỗ trợ (giữ 90 ngày)
```
```new
báo cáo lỗi (giữ 30 ngày), báo cáo tình trạng của bộ đọc tên (giữ 60 ngày, không có tên người) và tin nhắn chat hỗ trợ (giữ 90 ngày)
```
(c) Mục 3, bảng: thêm bốn dòng sau dòng model:
```old
| Model nhận dạng và dịch | Tải về một lần, chạy hoàn toàn trên máy bạn |
```
```new
| Model nhận dạng và dịch | Tải về một lần, chạy hoàn toàn trên máy bạn |
| Model nhận giọng người nói (khi tính năng bật) | Tải về một lần (khoảng 26 MB), chạy hoàn toàn trên máy bạn |
| Đặc điểm giọng để phân biệt người nói (khi tính năng bật) | Ứng dụng tạm thời phân tích đặc điểm giọng của âm thanh đang dịch để biết câu nào do cùng một người nói. Dữ liệu này chỉ nằm trong bộ nhớ RAM của một tiến trình phụ trên máy bạn và **tự xóa khi hết phiên**; không ghi xuống đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Ứng dụng không dùng nó để xác định danh tính ai và không nhớ một người qua các phiên |
| Tên người tham dự đọc từ cuộc họp (khi tính năng bật) | Ứng dụng đọc tên hiển thị, trạng thái mic và dấu "đang nói" của người tham dự trên **cửa sổ cuộc họp Microsoft Teams bản cài trên máy bạn** để gắn tên vào phụ đề. Không đọc chat, nội dung chia sẻ, địa chỉ hay cửa sổ khác; không chụp màn hình. Tên chỉ nằm trong bộ nhớ RAM trong lúc dịch; chỉ được ghi xuống đĩa khi bạn bật Lưu lịch sử (Pro), cùng bản chép lời đã mã hóa; không có trong log, báo cáo lỗi hay báo cáo tình trạng |
| Công thức đọc tên | Một tệp mô tả nhỏ (không chứa mã chạy) có chữ ký số, tải từ `releases.aitranslator.vn`, lưu trên máy bạn |
```
(d) Mục 3, đoạn Trợ năng của Gõ dịch: thêm đoạn mới ngay sau:
```old
Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.
```
```new
Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.

Cũng trên macOS, việc hiện tên người nói dùng quyền **Trợ năng** để đọc tên người tham dự trên cửa sổ cuộc họp Microsoft Teams. Ứng dụng chỉ đọc cửa sổ cuộc họp của Teams (không đọc cửa sổ hay ứng dụng khác), chỉ lấy tên hiển thị, trạng thái mic và dấu "đang nói", và không bấm hay gõ gì trong Teams. Để đọc được, ứng dụng bật chế độ trợ năng của Teams trong lúc dịch một cuộc họp; **chế độ trợ năng của Teams còn bật tới khi Teams được khởi động lại** (không tốn gì khi không ai đọc). Nếu bạn không cấp quyền, hay tắt "Lấy tên từ Teams" ở Cài đặt › Phụ đề › Người nói, ứng dụng vẫn phân biệt người nói bằng màu và nhãn "Người 1", "Người 2". Sau mỗi lần cập nhật ứng dụng, macOS có thể đòi cấp lại quyền Trợ năng. Windows chưa có việc đọc tên này.
```
(e) Mục 4, mục 1 của danh sách:
```old
1. **Tải model** và kiểm tra bản mới của model (từ `releases.aitranslator.vn`).
```
```new
1. **Tải model** (gồm model nhận giọng người nói, khoảng 26 MB, khi tính năng bật) và kiểm tra bản mới của model, và **tải công thức đọc tên** (một tệp mô tả nhỏ có chữ ký số; lúc mở ứng dụng và mỗi 6 giờ, chỉ khi tính năng bật), đều từ `releases.aitranslator.vn`. Đây chỉ là yêu cầu tải tệp, không gửi dữ liệu nào của bạn.
```
(f) Mục 4, mục 3 của danh sách (một lần khớp):
```old
gửi báo cáo lỗi (mục 10) và (hiếm khi)
```
```new
gửi báo cáo lỗi và báo cáo tình trạng của bộ đọc tên (mục 10) và (hiếm khi)
```
(g) Mục 5, đoạn mới ngay trước tiêu đề mục 6:
```old
## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài
```
```new
Máy chủ cũng lưu **báo cáo tình trạng của bộ đọc tên** (mục 10; giữ 60 ngày rồi tự xóa): mã báo cáo, ngày, phiên bản ứng dụng và hệ điều hành, ứng dụng họp và phiên bản, trạng thái, số phút, mô tả loại phần tử giao diện và mã băm ID máy; **không có tên người, không có chữ trong cuộc họp**.

## 6. Bên thứ ba xử lý dữ liệu, và việc chuyển dữ liệu ra nước ngoài
```
(h) Mục 10, dòng "Báo cáo không gồm" (một lần khớp):
```old
tên micro, tên tài khoản hệ điều hành, địa chỉ IP
```
```new
tên micro, tên người tham dự hay tên người nói, tên tài khoản hệ điều hành, địa chỉ IP
```
(i) Mục 10, gạch đầu dòng mới ngay sau dòng "Nếu bạn không muốn gửi gì":
```old
- Nếu bạn không muốn gửi gì, hãy bỏ tích ở bước Điều khoản hoặc tắt công tắc ở Cài đặt; ứng dụng vẫn dùng đầy đủ tính năng khi tắt.
```
```new
- Nếu bạn không muốn gửi gì, hãy bỏ tích ở bước Điều khoản hoặc tắt công tắc ở Cài đặt; ứng dụng vẫn dùng đầy đủ tính năng khi tắt.
- **Báo cáo tình trạng của bộ đọc tên** (khi tính năng người nói bật và công tắc gửi báo cáo lỗi bật): mỗi ngày, mỗi máy gửi tối đa một báo cáo cho mỗi ứng dụng họp và phiên bản của nó, qua cùng máy chủ, để chúng tôi biết khi Teams đổi giao diện làm bộ đọc không đọc được nữa. Báo cáo chỉ gồm: phiên bản ứng dụng và hệ điều hành, tên và phiên bản ứng dụng họp, phiên bản công thức, trạng thái (đọc được tên, không thấy ai đang nói, thiếu quyền, bị chặn), số phút đọc được trên tổng số phút họp, mô tả loại phần tử giao diện (vai trò và lớp, không có tên người hay chữ) và mã băm ID máy như báo cáo lỗi; **không có tên người, không có chữ trong cuộc họp**. Giữ **60 ngày** rồi tự xóa; tắt công tắc gửi báo cáo lỗi thì ứng dụng xóa luôn số liệu đang chờ gửi; yêu cầu xóa theo email (mục 7) xóa luôn các báo cáo này của những máy từng kích hoạt key của email đó.
```
(j) Mục 2 và mục 7 (chỗ ghi "báo cáo lỗi tự xóa sau 30 ngày"): `cd $W && /usr/bin/grep -n "tự xóa sau 30 ngày" docs/legal/privacy.vi.md | cut -c1-120`. Mỗi chỗ tìm thấy, thêm ngay sau cụm đó: ` và báo cáo tình trạng của bộ đọc tên tự xóa sau 60 ngày`. Ghi `Tệp:` và dòng cũ/mới vào biên bản.

- [ ] **Step 3: Chính sách tiếng Anh (`docs/legal/privacy.en.md`)**

(a) Section 2:
```old
- The app has **no sign-in accounts, no advertising and no analytics**.
```
```new
- **Telling speakers apart** (on by default; turn it off in Settings › Subtitles › Speakers): the app briefly analyzes voice features on your computer to know which sentences come from the same person, and shows “Speaker 1”, “Speaker 2”. The voice features **live only in RAM, are deleted automatically when the session ends, are never written to disk and never leave your computer**, and the app does not use them to identify anyone (section 3). On macOS the app also reads **the names of participants shown in the Microsoft Teams desktop meeting window** to put names on the subtitles (section 3).
- The app has **no sign-in accounts, no advertising and no analytics**.
```
(b)
```old
error reports (kept for 30 days) and support chat messages (kept for 90 days)
```
```new
error reports (kept for 30 days), name-reader status reports (kept 60 days, with no participant names) and support chat messages (kept for 90 days)
```
(c) Section 3 table:
```old
| Recognition and translation models | Downloaded once, then run entirely on your computer |
```
```new
| Recognition and translation models | Downloaded once, then run entirely on your computer |
| Speaker model (when the feature is on) | Downloaded once (about 26 MB), then runs entirely on your computer |
| Voice features used to tell speakers apart (when the feature is on) | The app briefly analyzes voice features of the audio being translated to know which sentences come from the same person. This data lives only in the RAM of a helper program on your computer and is **deleted automatically when the session ends**; it is never written to disk, never sent over the network and never in logs or error reports. The app does not use it to identify anyone and does not remember a person across sessions |
| Participant names read from the meeting (when the feature is on) | The app reads the display name, microphone state and “speaking” marker of participants in the **Microsoft Teams desktop meeting window on your computer** to put names on the subtitles. It does not read the chat, shared content, addresses or any other window, and it takes no screenshots. Names live only in RAM while translating; they are written to disk only when you turn on Save history (Pro), together with the encrypted transcript; they are not in logs, error reports or status reports |
| Name-reading recipe | A small description file (it contains no executable code) with a digital signature, downloaded from `releases.aitranslator.vn` and stored on your computer |
```
(d)
```old
If you do not grant it, the app only copies the translation to the clipboard for you to paste.
```
```new
If you do not grant it, the app only copies the translation to the clipboard for you to paste.

Also on macOS, showing speaker names uses the **Accessibility** permission to read the names of participants in the Microsoft Teams meeting window. The app reads only the Teams meeting window (no other window or app), takes only the display name, microphone state and “speaking” marker, and clicks or types nothing in Teams. To read it, the app turns on the accessibility mode of Teams while you translate a meeting; **the accessibility mode of Teams stays on until Teams is restarted** (it costs nothing while nothing reads it). If you do not grant the permission, or turn off “Get names from Teams” in Settings › Subtitles › Speakers, the app still tells speakers apart with colors and the labels “Speaker 1”, “Speaker 2”. After each app update macOS may ask you to grant Accessibility again. Windows does not read names yet.
```
(e)
```old
1. **Download models** and check for new model versions (from `releases.aitranslator.vn`).
```
```new
1. **Download models** (including the speaker model, about 26 MB, when the feature is on) and check for new model versions, and **download the name-reading recipe** (a small description file with a digital signature; when the app opens and every 6 hours, only when the feature is on), all from `releases.aitranslator.vn`. These are file download requests only; none of your data is sent.
```
(f)
```old
send error reports (section 10) and (rarely)
```
```new
send error reports and name-reader status reports (section 10) and (rarely)
```
(g)
```old
## 6. 
```
Tiêu đề mục 6 tiếng Anh có thể dài hơn `## 6. `; kiểm: `cd $W && /usr/bin/grep -c "^## 6\. " docs/legal/privacy.en.md` phải ra `1`. Thay `## 6. ` bằng đoạn sau rồi `## 6. ` (đúng một lần, ở đầu dòng):
```new
Our servers also store **name-reader status reports** (section 10; kept 60 days, then deleted automatically): the report code, the date, the app version and operating system, the meeting app and its version, the status, minutes, a description of the kind of interface element and the hashed machine ID; **no participant names and no text from the meeting**.

## 6. 
```
(h)
```old
the microphone name, the operating-system user name, IP addresses
```
```new
the microphone name, names of meeting participants or speakers, the operating-system user name, IP addresses
```
(i)
```old
- If you would rather send nothing, untick the box at the Terms step or turn the switch off in Settings; the app keeps working fully with it off.
```
```new
- If you would rather send nothing, untick the box at the Terms step or turn the switch off in Settings; the app keeps working fully with it off.
- **Name-reader status report** (when the speaker feature is on and the switch for error reports is on): each day, each machine sends at most one report per meeting app and its version, through the same server, so that we know when Teams changes its interface and the reader can no longer read. The report contains only: the app version and operating system, the name and version of the meeting app, the recipe version, the status (names read, nobody seen speaking, permission missing, blocked), the minutes read out of the total meeting minutes, a description of the kind of interface element (role and class, no participant names or text) and the hashed machine ID as in error reports; **no participant names and no text from the meeting**. It is kept **60 days**, then deleted automatically; turning the error-report switch off also deletes any figures waiting to be sent; a deletion request by email (section 7) also deletes these reports of the machines that ever activated a key for that email.
```
(j) `cd $W && /usr/bin/grep -n "30 days" docs/legal/privacy.en.md | cut -c1-140`: mỗi chỗ nói báo cáo lỗi tự xóa sau 30 ngày ở section 2 và 7, thêm ngay sau cụm đó `, and name-reader status reports after 60 days`.

- [ ] **Step 4: EULA (mục 1 và 6, vi và en)**

`docs/legal/eula.vi.md`:
```old
Việc nhận dạng giọng nói và dịch chạy **trên máy bạn**, không gửi âm thanh đi đâu.
```
```new
Việc nhận dạng giọng nói và dịch chạy **trên máy bạn**, không gửi âm thanh đi đâu. Khi bạn bật, ứng dụng cũng phân biệt người nói và hiện tên người tham dự đọc từ cửa sổ cuộc họp (hiện chỉ Microsoft Teams bản cài trên macOS); kết quả chỉ là nhãn trên phụ đề và có thể sai.
```
```old
Chúng tôi không nhận hay lưu âm thanh của bạn.
```
```new
Chúng tôi không nhận hay lưu âm thanh của bạn. Ứng dụng hiện tên người tham dự đọc từ cửa sổ cuộc họp trên phụ đề, trong bản chép lời và (nếu bạn lưu hay xuất) trong Lịch sử và file xuất: đó là dữ liệu cá nhân của người khác, và bạn tự chịu trách nhiệm khi lưu, xuất hay chia sẻ chúng. Nhãn người nói và tên do ứng dụng gán tự động có thể sai.
```
`docs/legal/eula.en.md`:
```old
Speech recognition and translation run **on your computer**; your audio is not sent anywhere.
```
```new
Speech recognition and translation run **on your computer**; your audio is not sent anywhere. When you turn it on, the app also tells speakers apart and shows the names of participants read from the meeting window (currently only the Microsoft Teams desktop app on macOS); the result is only a label on the subtitles and can be wrong.
```
```old
We do not receive or store your audio.
```
```new
We do not receive or store your audio. The app shows the names of participants read from the meeting window on the subtitles, in the transcript and (if you save or export) in History and exported files: these are other people's personal data, and you are responsible when you save, export or share them. Speaker labels and names assigned automatically can be wrong.
```
Chú ý các cụm kiểm ở Step 1: bản vi cần có "hiện tên người tham dự đọc từ cửa sổ cuộc họp" (khớp "hiện tên người tham dự đọc từ cửa sổ cuộc họp trên phụ đề") và bản en cần "shows the names of participants read from the meeting window" (khớp). Nếu `grep -c` cho thấy các câu `old` ở Step 4 không khớp đúng một lần (ví dụ "Chúng tôi không nhận hay lưu âm thanh của bạn." còn ở mục khác), dừng và báo.

- [ ] **Step 5: `docs/legal/README.md`**

(a) Đoạn lịch sử (ngay trước tiêu đề `## Thông tin đã chốt và đã dùng trong văn bản`):
```old
## Thông tin đã chốt và đã dùng trong văn bản
```
```new
**Chính sách 1.9 và EULA 1.6 thêm phân biệt người nói** theo spec `2026-10-26-phan-biet-nguoi-noi-design.md` (mục 10) và kế hoạch `2026-10-28-phan-biet-nguoi-noi-07-phat-hanh.md` (Task 10): app tạm thời phân tích đặc điểm giọng trên máy để phân biệt người nói (chỉ trong RAM, tự xóa khi hết phiên, không xác định danh tính, không gửi đi; chính sách mục 2, 3); trên macOS app đọc tên người tham dự trên cửa sổ cuộc họp Microsoft Teams bản cài, dùng quyền Trợ năng và bật chế độ trợ năng của Teams (còn bật tới khi Teams khởi động lại), chỉ lưu tên khi bật Lưu lịch sử (mục 3); app tải model nhận giọng (khoảng 26 MB) và công thức đọc tên (tệp mô tả có chữ ký số) từ `releases.aitranslator.vn` (mục 4); báo cáo tình trạng bộ đọc tên không có tên người, giữ 60 ngày (mục 2, 5, 10). EULA 1.6 thêm hai câu (mục 1, 6): kết quả có thể sai; tên người tham dự là dữ liệu cá nhân của người khác. **Dòng phiên bản và ngày hiệu lực chưa đổi (vẫn EULA 1.5, chính sách 1.8): đổi vào ngày phát hành 0.3.2, trước khi build app** (kế hoạch 07, Task 21).

## Thông tin đã chốt và đã dùng trong văn bản
```
(b) Câu hỏi cho luật sư (ngay sau tiêu đề, trước câu hỏi đầu):
```old
## Câu hỏi cho luật sư
```
```new
## Câu hỏi cho luật sư
- **Phân biệt người nói và dữ liệu sinh trắc học** (spec phân biệt người nói mục 10): Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực 01/01/2026) và Nghị định 356/2025 coi dữ liệu sinh trắc học dùng để xác định người là dữ liệu nhạy cảm. Thiết kế: đặc điểm giọng chỉ nằm trong RAM của một tiến trình phụ, xóa khi hết phiên, không ghi đĩa, không gửi đi, không đưa vào log hay báo cáo, không dùng để xác định danh tính, không nhớ một người qua các phiên. Hỏi: đặc điểm giọng tạm thời như vậy có phải là "dữ liệu sinh trắc học" theo luật không; nếu có, bật mặc định (tắt được) có đủ, hay cần đồng ý riêng trước khi bật; chính sách mục 2, 3 nói đủ chưa. **Chủ dự án hỏi luật sư trước khi đăng manifest có mục `speaker` (kế hoạch 07, Task 22).**
- **Tên người tham dự cuộc họp** (dữ liệu cá nhân của người khác, không phải của người dùng): app đọc tên hiển thị trên cửa sổ cuộc họp Teams để hiện trên phụ đề; chỉ lưu khi người dùng bật Lưu lịch sử (Pro); báo cáo tình trạng không có tên. Hỏi: người dùng có phải thông báo cho người tham dự không (EULA mục 6 chuyển trách nhiệm sang người dùng); việc lưu và xuất tên có cần cơ sở pháp lý riêng.
- **Bật chế độ trợ năng của Teams và đọc cây giao diện bằng quyền Trợ năng** (chính sách mục 3): có cần nói thêm gì ở EULA (điều khoản của Microsoft về tự động hóa Teams) không.
- **Công thức đọc tên tải từ xa** (chỉ mô tả, có chữ ký số): có phải thông báo riêng không (chính sách mục 4 đã nêu).
```
(c) Mục "Cài vào sản phẩm", thêm một gạch đầu dòng trước dòng "Chưa làm":
```old
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```
```new
- **Đã làm (phân biệt người nói, spec `2026-10-26-phan-biet-nguoi-noi-design.md`):** chính sách mục 2, 3, 4, 5, 10 nói về phân biệt giọng, đọc tên, quyền Trợ năng, công thức, báo cáo tình trạng; EULA mục 1, 6; website (năm ngôn ngữ) gỡ các câu "chưa có / không biết ai đang nói", có mục người nói ở hướng dẫn Thanh phụ đề, Hỏi đáp và Dữ liệu và bảo mật, kèm test `STALE_SPEAKER`.
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```

- [ ] **Step 6: Test xanh**

Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"; cd $W && /usr/bin/grep -c "Phiên bản 1.8" docs/legal/privacy.vi.md; /usr/bin/grep -c "Version 1.8" docs/legal/privacy.en.md; /usr/bin/grep -c "Phiên bản 1.5" docs/legal/eula.vi.md`
Expected: `# fail 0` (test mới xanh; **các test về phiên bản 1.8/1.5 và ngày không đổi**); ba số đếm `1`.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && git diff --stat docs/legal website/test | tail -7`
Expected: sáu file đổi. Ghi vào biên bản: danh sách việc **chủ dự án cần quyết/duyệt trước Task 22**: (1) duyệt từng câu pháp lý, (2) hỏi luật sư (README, câu hỏi đầu), (3) có sửa EULA không (mặc định có, hai câu). Commit cục bộ: `cd $W && git branch --show-current && git add docs/legal website/test/site.test.mjs && git commit -m "docs(legal): nội dung chính sách 1.9 và EULA 1.6 về phân biệt người nói (dòng phiên bản giữ nguyên tới ngày phát hành)"`.

---

### Task 11: Website, gỡ các câu cũ "chưa có / không biết ai đang nói" (năm ngôn ngữ)

Ba trang, mỗi trang năm ngôn ngữ, 15 chỗ (đã kiểm bằng `grep` ngày 2026-10-28): `about` (mục "đang cân nhắc"), `solutions` ("khi nào chưa phù hợp"), `solutions-tiktok-live` ("giới hạn"). Sau khi tính năng có thật, các câu này sai. Website chỉ **deploy** ở Task 23 (sau khi manifest có mục `speaker`); ở đây chỉ sửa và có test chặn.

**Files:** Modify `website/src/content/{vi,en,ja,zh,ko}/{about,solutions,solutions-tiktok-live}.mjs`, `website/test/site.test.mjs`

- [ ] **Step 1: Liệt kê chữ cũ**

Run: `cd $W/website/src/content && /usr/bin/grep -rn -E "ai đang nói|speaker labels|know who is speaking|Telling speakers apart|誰が話している|話者の区別|字幕で話者を区別|不会区分是谁|区分说话人|区分不同的说话人|화자 구분|누가 말하는지" . | cut -c1-120`
Expected: đúng **12 dòng** ở 12 file (vi: `about`, `solutions`, `solutions-tiktok-live`; en: ba file; ja: `about`, `solutions`, `solutions-tiktok-live`; zh: `about`, `solutions-tiktok-live`, `solutions`; ko: ba file). Lưu ý: ở `zh/solutions.mjs` câu là "你需要自动生成会议纪要、摘要或区分说话人。" (dòng 15 chỗ gồm cả `zh/solutions.mjs`; nếu ít hơn 15 dòng thì có file ghi bằng chữ khác: `grep -rn -E "不提供|暂不提供|Not available" about solutions` để tìm). Chữ khác với bảng dưới thì **dừng**, đọc dòng thật, chỉnh `old` cho đúng.

- [ ] **Step 2: Test trước (mẫu cũ phải bị bắt, mẫu mới không bị bắt)**

Thêm vào cuối `website/test/site.test.mjs`:

```js

// ---- Phân biệt người nói (spec 2026-10-26-phan-biet-nguoi-noi §10; kế hoạch 07): câu cũ "chưa có / không biết ai đang nói" ----
const STALE_SPEAKER = [
  { id: "vi: không biết ai đang nói", re: /không\s+biết\s+ai\s+đang\s+nói/iu },
  { id: "vi: biết ai đang nói, chưa có", re: /biết\s+ai\s+đang\s+nói\.\s*Chưa\s+có/iu },
  { id: "vi: lộ trình phân biệt ai đang nói", re: /Phân\s+biệt\s+ai\s+đang\s+nói\s+trong\s+phụ\s+đề/iu },
  { id: "en: does not know who is speaking", re: /does\s+not\s+know\s+who\s+is\s+speaking/i },
  { id: "en: speaker labels not available", re: /speaker\s+labels\.\s*Not\s+available/i },
  { id: "en: roadmap telling speakers apart", re: /Telling\s+speakers\s+apart\s+in\s+the\s+subtitles/i },
  { id: "ja: 誰が話しているかは区別しません", re: /誰が話しているかは区別しません/ },
  { id: "ja: 話者の区別が必要、対応していません", re: /話者の区別が必要。\s*対応していません/ },
  { id: "ja: 字幕で話者を区別する", re: /字幕で話者を区別する/ },
  { id: "zh: 不会区分是谁在说话", re: /不会区分是谁在说话/ },
  { id: "zh: 区分说话人，暂不提供", re: /区分说话人。\s*暂不提供/ },
  { id: "zh: 在字幕中区分不同的说话人", re: /在字幕中区分不同的说话人/ },
  { id: "ko: 누가 말하는지는 구분하지 않습니다", re: /누가 말하는지는 구분하지 않습니다/ },
  { id: "ko: 화자 구분이 필요하다, 지원하지 않습니다", re: /화자 구분이 필요하다\.\s*지원하지 않습니다/ },
  { id: "ko: 자막에서 화자 구분하기", re: /자막에서 화자 구분하기/ },
];
const STALE_SPEAKER_MUST_CATCH = [
  "Bạn cần biên bản, tóm tắt tự động hoặc biết ai đang nói. Chưa có.",
  "app dịch từng câu theo âm thanh nghe được và không biết ai đang nói.",
  "Phân biệt ai đang nói trong phụ đề",
  "You need automatic minutes, summaries or speaker labels. Not available.",
  "translates sentence by sentence from the sound it hears and does not know who is speaking.",
  "Telling speakers apart in the subtitles",
  "アプリは聞こえた音を 1 文ずつ翻訳し、誰が話しているかは区別しません。",
  "議事録の自動作成、要約、話者の区別が必要。対応していません。",
  "字幕で話者を区別する",
  "应用根据听到的声音逐句翻译，不会区分是谁在说话。",
  "你需要自动生成会议纪要、摘要或区分说话人。暂不提供。",
  "在字幕中区分不同的说话人",
  "앱은 들리는 소리를 문장 단위로 번역하며, 누가 말하는지는 구분하지 않습니다.",
  "자동 회의록, 요약, 화자 구분이 필요하다. 지원하지 않습니다.",
  "자막에서 화자 구분하기",
];
const STALE_SPEAKER_MUST_KEEP = [
  "Bạn cần biên bản hoặc tóm tắt tự động. Chưa có.",
  "Phụ đề có thể hiện mỗi người một màu và tên từ Teams bản cài trên macOS.",
  "Hiện tên người đang nói từ Google Meet và Zoom, và phân biệt người nói trên Windows",
  "You need automatic minutes or summaries. Not available.",
  "Showing speaker names from Google Meet and Zoom, and telling speakers apart on Windows",
  "議事録の自動作成や要約が必要。対応していません。",
  "你需要自动生成会议纪要或摘要。暂不提供。",
  "자동 회의록이나 요약이 필요하다. 지원하지 않습니다.",
];

test("luật câu cũ về người nói (STALE_SPEAKER) bắt câu cũ và không bắt câu đúng", () => {
  const missed = STALE_SPEAKER_MUST_CATCH.filter((s) => staleHits(s, STALE_SPEAKER).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_SPEAKER_MUST_KEEP.filter((s) => staleHits(s, STALE_SPEAKER).length > 0).map((s) => `${s} → ${staleHits(s, STALE_SPEAKER).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site còn câu cũ 'chưa có / không biết ai đang nói'", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_SPEAKER), []);
});
```
Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: test `luật câu cũ…` **xanh** (mẫu độc lập với trang); test `không nguồn chữ nào…` **đỏ** (15 chỗ cũ).

- [ ] **Step 3: Sửa 15 chỗ**

Mỗi chỗ một Edit; `old` là cả dòng (giữ nguyên dấu phẩy cuối, thụt lề, escape của file); `old` khớp đúng một lần trong file.

`about.mjs` (mục "đang cân nhắc"; chữ mới vẫn là hướng đang cân nhắc, không phải cam kết):

| File | `old` | `new` |
|---|---|---|
| `vi/about.mjs` | `<li>Phân biệt ai đang nói trong phụ đề</li>` | `<li>Hiện tên người đang nói từ Google Meet và Zoom, và phân biệt người nói trên Windows</li>` |
| `en/about.mjs` | `<li>Telling speakers apart in the subtitles</li>` | `<li>Showing speaker names from Google Meet and Zoom, and telling speakers apart on Windows</li>` |
| `ja/about.mjs` | `<li>字幕で話者を区別する</li>` | `<li>Google Meet と Zoom から話者名を表示し、Windows でも話者を区別する</li>` |
| `zh/about.mjs` | `<li>在字幕中区分不同的说话人</li>` | `<li>显示来自 Google Meet 和 Zoom 的说话人姓名，并在 Windows 上区分说话人</li>` |
| `ko/about.mjs` | `<li>자막에서 화자 구분하기</li>` | `<li>Google Meet와 Zoom에서 화자 이름 표시, Windows에서도 화자 구분</li>` |

`solutions.mjs` ("khi nào chưa phù hợp": chỉ bỏ vế người nói; biên bản và tóm tắt vẫn chưa có):

| File | `old` | `new` |
|---|---|---|
| `vi/solutions.mjs` | `  "<strong>Bạn cần biên bản, tóm tắt tự động hoặc biết ai đang nói.</strong> Chưa có.",` | `  "<strong>Bạn cần biên bản hoặc tóm tắt tự động.</strong> Chưa có.",` |
| `en/solutions.mjs` | `  "<strong>You need automatic minutes, summaries or speaker labels.</strong> Not available.",` | `  "<strong>You need automatic minutes or summaries.</strong> Not available.",` |
| `ja/solutions.mjs` | `  "<strong>議事録の自動作成、要約、話者の区別が必要。</strong>対応していません。",` | `  "<strong>議事録の自動作成や要約が必要。</strong>対応していません。",` |
| `zh/solutions.mjs` | `  "<strong>你需要自动生成会议纪要、摘要或区分说话人。</strong>暂不提供。",` | `  "<strong>你需要自动生成会议纪要或摘要。</strong>暂不提供。",` |
| `ko/solutions.mjs` | `  "<strong>자동 회의록, 요약, 화자 구분이 필요하다.</strong> 지원하지 않습니다.",` | `  "<strong>자동 회의록이나 요약이 필요하다.</strong> 지원하지 않습니다.",` |

`solutions-tiktok-live.mjs` (giới hạn thật: nói chồng thì nhãn có thể sai; Windows chưa có):

| File | `old` | `new` |
|---|---|---|
| `vi/solutions-tiktok-live.mjs` | `  "<strong>Nhiều người nói chồng lên nhau:</strong> app dịch từng câu theo âm thanh nghe được và không biết ai đang nói.",` | `  "<strong>Nhiều người nói chồng lên nhau:</strong> app dịch từng câu theo âm thanh nghe được. Trên macOS, phụ đề có thể hiện mỗi người một màu (“Người 1”, “Người 2”), nhưng khi nhiều người nói chồng, nhãn có thể sai, và hai người giống giọng có thể bị gộp thành một.",` |
| `en/solutions-tiktok-live.mjs` | `  "<strong>Several people talking over each other:</strong> the app translates sentence by sentence from the sound it hears and does not know who is speaking.",` | `  "<strong>Several people talking over each other:</strong> the app translates sentence by sentence from the sound it hears. On macOS the subtitles can show each person in a color (“Speaker 1”, “Speaker 2”), but when several people talk over each other a label can be wrong, and two people with similar voices can end up sharing one.",` |
| `ja/solutions-tiktok-live.mjs` | `  "<strong>複数の人が同時に話す：</strong>アプリは聞こえた音を 1 文ずつ翻訳し、誰が話しているかは区別しません。",` | `  "<strong>複数の人が同時に話す：</strong>アプリは聞こえた音を 1 文ずつ翻訳します。macOS では字幕で人ごとに色を分けて表示できます（「話者1」「話者2」）が、複数の人が同時に話すとラベルが間違うことがあり、声が似た 2 人が 1 つにまとめられることもあります。",` |
| `zh/solutions-tiktok-live.mjs` | `  "<strong>多人同时说话：</strong>应用根据听到的声音逐句翻译，不会区分是谁在说话。",` | `  "<strong>多人同时说话：</strong>应用根据听到的声音逐句翻译。在 macOS 上，字幕可以为每个人显示不同颜色（“说话人1”“说话人2”），但多人同时说话时标签可能出错，声音相似的两个人也可能被合并成一个。",` |
| `ko/solutions-tiktok-live.mjs` | `  "<strong>여러 사람이 동시에 말할 때:</strong> 앱은 들리는 소리를 문장 단위로 번역하며, 누가 말하는지는 구분하지 않습니다.",` | `  "<strong>여러 사람이 동시에 말할 때:</strong> 앱은 들리는 소리를 문장 단위로 번역합니다. macOS에서는 자막에 사람마다 다른 색으로 표시할 수 있지만(“화자 1”, “화자 2”), 여러 사람이 동시에 말하면 표시가 틀릴 수 있고 목소리가 비슷한 두 사람이 하나로 합쳐질 수도 있습니다.",` |

- [ ] **Step 4: Kiểm**

Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"; cd $W/website/src/content && /usr/bin/grep -rn -E "ai đang nói|speaker labels|know who is speaking|Telling speakers apart in the subtitles|字幕で話者を区別する|在字幕中区分不同的说话人|자막에서 화자 구분하기" . | cut -c1-100`
Expected: `# fail 0` (gồm `test/i18n-content.test.mjs`: bản ja/zh/ko cùng khung với bản en; không câu tiếng Anh sót); lệnh grep cuối không in gì.

- [ ] **Step 5: Mốc kiểm và commit**

Run: `cd $W && git diff --stat website | tail -3`
Expected: 15 file `.mjs` và `site.test.mjs` đổi. Commit cục bộ: `cd $W && git branch --show-current && git add website/src/content website/test/site.test.mjs && git commit -m "docs(website): gỡ câu cũ 'chưa có / không biết ai đang nói' năm ngôn ngữ, thêm STALE_SPEAKER"`.

---

### Task 12: Website, nội dung người nói (hướng dẫn, hỏi đáp, dữ liệu và bảo mật), năm ngôn ngữ

Chỉ nói điều có thật (website/README.md): bản 0.3.2 trở lên; macOS; tên tự động chỉ với Microsoft Teams bản cài; Meet, Zoom, Windows chưa; nói chồng và hai giọng giống thì nhãn có thể sai; thà "Người N" hơn sai tên; mọi gói dùng được, tên trong Lịch sử và xuất file theo Pro; quyền Trợ năng; **không nêu tên model, thư viện hay cách đọc giao diện** (test `CORE_TECH`). Không số đo trên website ở đợt này (số đo ở biên bản). Chưa đo bằng proxy: ghi thẳng (như câu của chat hỗ trợ) tới khi Task 22 đo xong.

**Files:** Modify `website/src/content/{vi,en,ja,zh,ko}/{guide-subtitle-bar,faq,data-security}.mjs`, `website/test/site.test.mjs`

Tên nhãn app dùng trên website (từ `src/i18n`, test đối chiếu bằng `appDict`):

| Khóa | vi | en | ja | zh | ko |
|---|---|---|---|---|---|
| `settings.speakers.title` | Người nói | Speakers | 話者 | 说话人 | 화자 |
| `settings.group.subtitles` | Phụ đề | Subtitles | 字幕 | 字幕 | 자막 |
| `transcript.speaker.participants` | Chọn người trong cuộc họp | Pick someone from the meeting | 会議の参加者から選ぶ | 从会议参与者中选择 | 회의 참가자 중에서 선택 |
| `transcript.speaker.merge` | Gộp vào người khác | Merge into another speaker | 別の話者に統合 | 合并到其他说话人 | 다른 화자와 합치기 |
| `overlay.speakers.ask` | Cho phép quyền Trợ năng để hiện tên người nói | Allow Accessibility access to show speaker names | 話者の名前を表示するには、アクセシビリティを許可してください | 允许辅助功能权限以显示说话人姓名 | 말하는 사람의 이름을 표시하려면 손쉬운 사용 권한을 허용하세요 |

- [ ] **Step 1: Test trước**

Thêm vào cuối `website/test/site.test.mjs`:

```js

// ---- Phân biệt người nói (kế hoạch 07): nội dung hướng dẫn, hỏi đáp, dữ liệu và bảo mật ----
const SPEAKER_PAGES = {
  vi: { guide: "/huong-dan/thanh-phu-de-va-phim-tat/", faq: "/cau-hoi-thuong-gap/", data: "/bao-mat-du-lieu/" },
  en: { guide: "/en/guide/subtitle-bar-and-shortcuts/", faq: "/en/faq/", data: "/en/data-security/" },
};

test("hướng dẫn thanh phụ đề, hỏi đáp, dữ liệu và bảo mật nói đúng về người nói (vi, en): đúng chữ của app, đúng phạm vi", async () => {
  const errors = [];
  for (const [lang, pages] of Object.entries(SPEAKER_PAGES)) {
    const d = await appDict(lang);
    const guide = plainAmp(textOf(htmlByPath.get(pages.guide)));
    for (const key of ["settings.speakers.title", "transcript.speaker.participants", "transcript.speaker.merge"]) {
      if (!guide.includes(plainAmp(d[key]))) errors.push(`${pages.guide}: thiếu chữ của app "${d[key]}" (${key})`);
    }
    const need = {
      vi: ["macOS", "Microsoft Teams", "Người 1", "chưa có tên tự động", "Windows", "Trợ năng", "chỉ khi bạn bật Lưu lịch sử", "nói chồng"],
      en: ["macOS", "Microsoft Teams", "Speaker 1", "not available yet", "Windows", "Accessibility", "only when you turn on Save history", "talk over each other"],
    }[lang];
    for (const n of need) if (!guide.includes(n)) errors.push(`${pages.guide}: thiếu "${n}"`);
    const data = plainAmp(textOf(htmlByPath.get(pages.data)));
    const needData = {
      vi: ["Đặc điểm giọng", "tự xóa khi hết phiên", "không dùng để xác định danh tính", "công thức đọc tên", "chưa đo bằng proxy"],
      en: ["Voice features", "deleted automatically when the session ends", "not used to identify anyone", "name-reading recipe", "not measured with the proxy yet"],
    }[lang];
    for (const n of needData) if (!data.includes(n)) errors.push(`${pages.data}: thiếu "${n}"`);
    const faq = plainAmp(textOf(htmlByPath.get(pages.faq)));
    const needFaq = { vi: ["tên từng người nói", "Microsoft Teams"], en: ["names of the people speaking", "Microsoft Teams"] }[lang];
    for (const n of needFaq) if (!faq.includes(n)) errors.push(`${pages.faq}: thiếu "${n}"`);
  }
  assert.deepEqual(errors, []);
});
```
Đường dẫn các trang đã kiểm bằng `grep -n "^  path:"` ngày 2026-10-28 (vi `/huong-dan/thanh-phu-de-va-phim-tat/`, `/cau-hoi-thuong-gap/`, `/bao-mat-du-lieu/`; en `/en/guide/subtitle-bar-and-shortcuts/`, `/en/faq/`, `/en/data-security/`); đổi khác thì sửa `SPEAKER_PAGES` cho đúng.
Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: test mới **đỏ** (thiếu các câu).

- [ ] **Step 2: Hướng dẫn thanh phụ đề: mục "Ai đang nói" (năm ngôn ngữ)**

Mỗi ngôn ngữ **hai Edit** trong `guide-subtitle-bar.mjs`: (1) thêm dòng mục lục (mảng `toc`) ngay trước dòng `indicators` (id của vi: `chi-bao`); (2) thêm mục mới ngay **trước** `<h2 id="indicators">` (vi `<h2 id="chi-bao">`). `old` của (1) và (2) là dòng sẵn có:

| Ngôn ngữ | (1) `old` (một dòng của `toc`) | (2) `old` (một dòng thân trang) | id mới |
|---|---|---|---|
| vi | `  { level: 2, id: "chi-bao", text: "Chỉ báo trên thanh" },` | `<h2 id="chi-bao">Chỉ báo trên thanh</h2>` | `nguoi-noi` |
| en | `  { level: 2, id: "indicators", text: "Indicators on the bar" },` | `<h2 id="indicators">Indicators on the bar</h2>` | `speakers` |
| ja | `  { level: 2, id: "indicators", text: "バーの表示の意味" },` | `<h2 id="indicators">バーの表示の意味</h2>` | `speakers` |
| zh | `  { level: 2, id: "indicators", text: "字幕条上的提示" },` | `<h2 id="indicators">字幕条上的提示</h2>` | `speakers` |
| ko | `  { level: 2, id: "indicators", text: "바에 나타나는 표시" },` | `<h2 id="indicators">바에 나타나는 표시</h2>` | `speakers` |

`new` của (1) = dòng mục lục mới (cấp 2, id mới, chữ theo bảng dưới) rồi xuống dòng và dòng `old`; `new` của (2) = khối HTML dưới đây rồi một dòng trống và dòng `old`.

Chữ mục lục: vi `Ai đang nói: màu và tên`; en `Who is speaking: colors and names`; ja `誰が話しているか：色と名前`; zh `谁在说话：颜色和姓名`; ko `누가 말하는지: 색과 이름`.

Khối HTML (en, cơ sở của bản dịch; các bản khác cùng khung, cùng số `<li>`, cùng id):
```html
<h2 id="speakers">Who is speaking: colors and names</h2>
<p>On macOS, with AI Translator 0.3.2 or later, the subtitle bar can show who is speaking. It is on by default on every plan; you can turn it off in <strong>Settings › Subtitles › Speakers</strong>.</p>
<ul>
<li><strong>A color for each voice.</strong> The app tells voices apart on your computer and labels them “Speaker 1”, “Speaker 2” in order of appearance. The label and a colored bar appear on the first line of each turn; further sentences from the same person only have the colored bar.</li>
<li><strong>Real names from Microsoft Teams.</strong> When you translate a meeting in the Teams desktop app, the app reads the names of the participants from the meeting window and shows a name once it is reasonably sure. Until then, or when it is not sure, it keeps “Speaker N”: a wrong name is worse than a generic label. It does not read the chat and does not take screenshots. Names from Google Meet and Zoom are not available yet.</li>
<li><strong>Fix it yourself.</strong> In the transcript in the main window, click a label to rename it, to <em>Pick someone from the meeting</em>, or to <em>Merge into another speaker</em> when two labels are the same person. A change applies to the whole current session.</li>
<li><strong>Permission.</strong> To read names, macOS asks for the <em>Accessibility</em> permission: the bar shows a short invitation (<em>Allow Accessibility access to show speaker names</em>) with a button to open Settings; the app never opens the system dialog by itself. After an app update macOS may ask for it again. Without the permission you still get colors and “Speaker N”.</li>
<li><strong>History and exports.</strong> Labels and names are saved to History and to exported files only with a Pro plan and only when you turn on Save history; the copy button and exports on every plan include them in the text.</li>
</ul>
<p>Limits: two people with very similar voices can share one label, and when several people talk over each other a label can be wrong. Windows is not supported yet, and in Google Meet and Zoom the app shows colors and “Speaker N” but no names (not available yet).</p>
```
Các bản dịch (cùng khung năm đoạn `<li>` và đoạn "Limits"):

vi (`id="nguoi-noi"`):
```html
<h2 id="nguoi-noi">Ai đang nói: màu và tên</h2>
<p>Trên macOS, từ AI Translator 0.3.2, thanh phụ đề có thể hiện ai đang nói. Tính năng bật sẵn ở mọi gói; bạn tắt được ở <strong>Cài đặt › Phụ đề › Người nói</strong>.</p>
<ul>
<li><strong>Mỗi giọng một màu.</strong> App phân biệt giọng ngay trên máy và gọi là “Người 1”, “Người 2” theo thứ tự xuất hiện. Nhãn và vạch màu hiện ở dòng đầu mỗi lượt nói; các câu sau của cùng người chỉ có vạch màu.</li>
<li><strong>Tên thật từ Microsoft Teams.</strong> Khi bạn dịch một cuộc họp trong app Teams cài trên máy, app đọc tên người tham dự từ cửa sổ cuộc họp và chỉ hiện tên khi đã đủ chắc. Chưa chắc thì giữ “Người N”: sai tên còn tệ hơn nhãn chung. App không đọc chat và không chụp màn hình. Google Meet và Zoom chưa có tên tự động.</li>
<li><strong>Tự sửa.</strong> Ở bản chép lời trong cửa sổ chính, bấm một nhãn để đổi tên, <em>Chọn người trong cuộc họp</em>, hay <em>Gộp vào người khác</em> khi hai nhãn là cùng một người. Thay đổi áp cho cả phiên đang chạy.</li>
<li><strong>Quyền.</strong> Để đọc tên, macOS hỏi quyền <em>Trợ năng</em>: thanh hiện một dòng mời ngắn (<em>Cho phép quyền Trợ năng để hiện tên người nói</em>) kèm nút mở Cài đặt; app không tự bật hộp thoại của hệ thống. Sau khi cập nhật app, macOS có thể hỏi lại. Không cấp quyền thì vẫn có màu và “Người N”.</li>
<li><strong>Lịch sử và xuất file.</strong> Nhãn và tên chỉ được lưu vào Lịch sử và file xuất khi bạn có gói Pro và chỉ khi bạn bật Lưu lịch sử; nút sao chép và xuất file ở mọi gói có kèm nhãn trong văn bản.</li>
</ul>
<p>Giới hạn: hai người có giọng rất giống có thể dùng chung một nhãn, và khi nhiều người nói chồng, nhãn có thể sai. Windows chưa hỗ trợ; ở Google Meet và Zoom app hiện màu và “Người N” nhưng chưa có tên tự động.</p>
```
ja (`id="speakers"`):
```html
<h2 id="speakers">誰が話しているか：色と名前</h2>
<p>macOS の AI Translator 0.3.2 以降では、字幕バーに誰が話しているかを表示できます。どのプランでも初期設定でオンで、<strong>設定 › 字幕 › 話者</strong>でオフにできます。</p>
<ul>
<li><strong>声ごとに色を分けます。</strong>声の区別はこのパソコン上で行い、現れた順に「話者1」「話者2」と表示します。ラベルと色のバーは各発言の最初の行に表示され、同じ人の続く文には色のバーだけが付きます。</li>
<li><strong>Microsoft Teams から実名を取得します。</strong>パソコンにインストールした Teams アプリで会議を翻訳すると、会議ウィンドウから参加者の名前を読み取り、十分に確かな場合だけ名前を表示します。確かでないうちは「話者N」のままにします。間違った名前は一般的なラベルより悪いためです。チャットは読まず、画面も撮影しません。Google Meet と Zoom の名前はまだ取得できません。</li>
<li><strong>自分で直せます。</strong>メインウィンドウの文字起こしでラベルを選ぶと、名前を変更したり、<em>会議の参加者から選ぶ</em>、同じ人の 2 つのラベルを<em>別の話者に統合</em>したりできます。変更は実行中のセッション全体に反映されます。</li>
<li><strong>権限。</strong>名前を読み取るため、macOS は<em>アクセシビリティ</em>の許可を求めます。バーに短い案内（<em>話者の名前を表示するには、アクセシビリティを許可してください</em>）と設定を開くボタンが表示されます。アプリがシステムのダイアログを自動で開くことはありません。アプリの更新後に再度求められることがあります。許可しなくても、色と「話者N」は使えます。</li>
<li><strong>履歴とエクスポート。</strong>ラベルと名前は、Pro プランで「履歴を保存」をオンにした場合にだけ履歴とエクスポートしたファイルに保存されます。コピーボタンとエクスポートは、どのプランでも本文にラベルを含みます。</li>
</ul>
<p>制限：声がとても似た 2 人が 1 つのラベルを共有することがあり、複数の人が同時に話すとラベルが間違うことがあります。Windows にはまだ対応していません。Google Meet と Zoom では色と「話者N」は表示されますが、名前はまだ取得できません。</p>
```
zh (`id="speakers"`):
```html
<h2 id="speakers">谁在说话：颜色和姓名</h2>
<p>在 macOS 上，AI Translator 0.3.2 及以上版本的字幕条可以显示谁在说话。所有套餐默认开启，可在<strong>设置 › 字幕 › 说话人</strong>中关闭。</p>
<ul>
<li><strong>每个声音一种颜色。</strong>声音在你的电脑上区分，并按出现顺序标为“说话人1”“说话人2”。标签和彩色竖条出现在每次发言的第一行；同一个人后面的句子只有彩色竖条。</li>
<li><strong>来自 Microsoft Teams 的真实姓名。</strong>在电脑上安装的 Teams 应用里翻译会议时，应用从会议窗口读取参会者姓名，只有足够确定时才显示姓名；不确定时保持“说话人N”，因为错误的姓名比通用标签更糟。应用不读取聊天，也不截屏。Google Meet 和 Zoom 的姓名暂时还没有。</li>
<li><strong>可以自己修正。</strong>在主窗口的转写记录中，点击标签可以重命名、<em>从会议参与者中选择</em>，或在两个标签其实是同一个人时<em>合并到其他说话人</em>。修改对当前整个会话生效。</li>
<li><strong>权限。</strong>为了读取姓名，macOS 会请求<em>辅助功能</em>权限：字幕条会显示一行简短提示（<em>允许辅助功能权限以显示说话人姓名</em>）和打开设置的按钮；应用不会自己弹出系统对话框。应用更新后 macOS 可能再次请求。不授予权限时仍有颜色和“说话人N”。</li>
<li><strong>历史记录和导出。</strong>标签和姓名仅在你使用 Pro 套餐并开启“保存历史记录”时才会存入历史记录和导出的文件；复制按钮和导出在所有套餐中都会在文本里带上标签。</li>
</ul>
<p>局限：声音非常相似的两个人可能共用一个标签，多人同时说话时标签可能出错。暂不支持 Windows；在 Google Meet 和 Zoom 中，应用会显示颜色和“说话人N”，但暂时没有姓名。</p>
```
ko (`id="speakers"`):
```html
<h2 id="speakers">누가 말하는지: 색과 이름</h2>
<p>macOS의 AI Translator 0.3.2 이상에서는 자막 바에 누가 말하는지 표시할 수 있습니다. 모든 요금제에서 기본으로 켜져 있으며 <strong>설정 › 자막 › 화자</strong>에서 끌 수 있습니다.</p>
<ul>
<li><strong>목소리마다 색을 다르게 표시합니다.</strong> 목소리 구분은 이 컴퓨터에서 하며 등장 순서대로 “화자 1”, “화자 2”로 표시합니다. 라벨과 색 막대는 각 발언의 첫 줄에 나타나고, 같은 사람의 다음 문장에는 색 막대만 붙습니다.</li>
<li><strong>Microsoft Teams에서 실제 이름을 가져옵니다.</strong> 컴퓨터에 설치한 Teams 앱에서 회의를 번역하면 회의 창에서 참가자 이름을 읽고, 충분히 확실할 때만 이름을 표시합니다. 확실하지 않으면 “화자 N”을 유지합니다. 틀린 이름이 일반 라벨보다 나쁘기 때문입니다. 채팅은 읽지 않으며 화면을 캡처하지 않습니다. Google Meet와 Zoom의 이름은 아직 지원하지 않습니다.</li>
<li><strong>직접 고칠 수 있습니다.</strong> 메인 창의 기록에서 라벨을 누르면 이름을 바꾸거나 <em>회의 참가자 중에서 선택</em>하거나, 두 라벨이 같은 사람일 때 <em>다른 화자와 합치기</em>를 할 수 있습니다. 변경은 진행 중인 세션 전체에 적용됩니다.</li>
<li><strong>권한.</strong> 이름을 읽으려면 macOS가 <em>손쉬운 사용</em> 권한을 요청합니다. 바에 짧은 안내(<em>말하는 사람의 이름을 표시하려면 손쉬운 사용 권한을 허용하세요</em>)와 설정을 여는 버튼이 표시되며, 앱이 시스템 대화상자를 스스로 열지는 않습니다. 앱을 업데이트한 뒤 macOS가 다시 요청할 수 있습니다. 권한이 없어도 색과 “화자 N”은 사용할 수 있습니다.</li>
<li><strong>기록과 내보내기.</strong> 라벨과 이름은 Pro 요금제에서 ‘기록 저장’을 켠 경우에만 기록과 내보낸 파일에 저장됩니다. 복사 버튼과 내보내기는 모든 요금제에서 본문에 라벨을 포함합니다.</li>
</ul>
<p>제한: 목소리가 매우 비슷한 두 사람이 하나의 라벨을 함께 쓸 수 있고, 여러 사람이 동시에 말하면 라벨이 틀릴 수 있습니다. Windows는 아직 지원하지 않으며, Google Meet와 Zoom에서는 색과 “화자 N”은 표시되지만 이름은 아직 지원하지 않습니다.</p>
```
Test (Step 1) tìm các cụm vi/en: vi cần "chưa có tên tự động" (câu "Google Meet và Zoom chưa có tên tự động" **có**), "nói chồng" (có), "Người 1" (có), "chỉ khi bạn bật Lưu lịch sử" (khối vi viết "chỉ khi bạn bật Lưu lịch sử": có), "Trợ năng", "Windows", "macOS", "Microsoft Teams"; en cần "not available yet" (có: "Names from Google Meet and Zoom are not available yet"), "talk over each other" (có), "only when you turn on Save history" (có), "Speaker 1", "Accessibility". Sai khác nhỏ thì sửa **chữ trang** cho đúng ý của test, không nới test.

- [ ] **Step 3: Hỏi đáp: một câu mới (năm ngôn ngữ)**

Trong `faq.mjs` của từng ngôn ngữ, thêm **một đối tượng** ngay **trước** đối tượng có câu hỏi về gỡ cài đặt. `old` là dòng `      {` rồi dòng `q:` dưới đây (đúng một lần trong mỗi file, dòng 165–166); `new` = đối tượng mới (dưới) rồi hai dòng `old`:

| Ngôn ngữ | Dòng `q:` của câu hỏi gỡ cài đặt |
|---|---|
| vi | `        q: "Gỡ cài đặt AI Translator như thế nào?",` |
| en | `        q: "How do I uninstall AI Translator?",` |
| ja | `        q: "AI Translator をアンインストールするには？",` |
| zh | `        q: "如何卸载 AI Translator？",` |
| ko | `        q: "AI Translator는 어떻게 삭제하나요?",` |

Dạng đối tượng (giống mọi mục khác trong file; bản en làm mẫu):

```js
      {
        q: "Does it show which person is speaking?",
        a: `<p>On macOS, yes. From version 0.3.2 the subtitles can give each voice its own color and label (“Speaker 1”, “Speaker 2”), and when you translate a meeting in the Microsoft Teams desktop app the app can show the <strong>names of the people speaking</strong>, read from the meeting window, once it is reasonably sure; otherwise it keeps the generic label. Google Meet and Zoom names, and Windows, are not available yet. Two people with very similar voices can share a label, and when people talk over each other a label can be wrong. It is on by default on every plan and you can turn it off in Settings › Subtitles › Speakers. <a href="/en/guide/subtitle-bar-and-shortcuts/#speakers">How it works</a>.</p>`,
      },
```
Bản dịch (`q` và `a`, cùng khung; liên kết trỏ tới mục mới ở hướng dẫn của đúng ngôn ngữ, id như bảng Step 2 và đường dẫn trang hướng dẫn của ngôn ngữ đó: vi `/huong-dan/thanh-phu-de-va-phim-tat/#nguoi-noi`, en `/en/guide/subtitle-bar-and-shortcuts/#speakers`, còn ja/zh/ko là đường dẫn của trang ở ngôn ngữ đó + `#speakers`: lấy từ `grep -n "^  path:" $l/guide-subtitle-bar.mjs`):

- vi: `q: "App có hiện tên từng người nói không?"`; `a`: `<p>Có, trên macOS. Từ bản 0.3.2, phụ đề có thể cho mỗi giọng một màu và một nhãn (“Người 1”, “Người 2”), và khi bạn dịch một cuộc họp trong app Microsoft Teams cài trên máy, app có thể hiện <strong>tên từng người nói</strong>, đọc từ cửa sổ cuộc họp, khi đã đủ chắc; chưa chắc thì giữ nhãn chung. Tên từ Google Meet và Zoom, và Windows, chưa có. Hai người giống giọng có thể dùng chung một nhãn, và khi nhiều người nói chồng, nhãn có thể sai. Tính năng bật sẵn ở mọi gói và tắt được ở Cài đặt › Phụ đề › Người nói. <a href="…">Cách hoạt động</a>.</p>`
- ja: `q: "誰が話しているかを表示できますか？"`; `a`: `<p>macOS では表示できます。バージョン 0.3.2 から、字幕で声ごとに色とラベル（「話者1」「話者2」）を付けられ、パソコンにインストールした Microsoft Teams アプリで会議を翻訳するときは、会議ウィンドウから読み取った<strong>話している人の名前</strong>を、十分に確かな場合に表示できます。確かでないときは一般的なラベルのままです。Google Meet と Zoom の名前、および Windows にはまだ対応していません。声がとても似た 2 人が 1 つのラベルを共有することがあり、複数の人が同時に話すとラベルが間違うことがあります。どのプランでも初期設定でオンで、設定 › 字幕 › 話者でオフにできます。<a href="…">しくみ</a>。</p>`
- zh: `q: "能显示是哪位在说话吗？"`; `a`: `<p>在 macOS 上可以。从 0.3.2 版本起，字幕可以为每个声音显示一种颜色和标签（“说话人1”“说话人2”），在电脑上安装的 Microsoft Teams 应用里翻译会议时，应用可以在足够确定的情况下显示从会议窗口读取的<strong>说话人姓名</strong>；不确定时保持通用标签。Google Meet 和 Zoom 的姓名以及 Windows 暂时还没有。声音非常相似的两个人可能共用一个标签，多人同时说话时标签可能出错。所有套餐默认开启，可在设置 › 字幕 › 说话人中关闭。<a href="…">工作方式</a>。</p>`
- ko: `q: "누가 말하는지 표시해 주나요?"`; `a`: `<p>macOS에서는 가능합니다. 0.3.2 버전부터 자막에서 목소리마다 색과 라벨(“화자 1”, “화자 2”)을 붙일 수 있고, 컴퓨터에 설치한 Microsoft Teams 앱에서 회의를 번역하면 회의 창에서 읽은 <strong>말하는 사람의 이름</strong>을 충분히 확실할 때 표시할 수 있습니다. 확실하지 않으면 일반 라벨을 유지합니다. Google Meet와 Zoom의 이름, 그리고 Windows는 아직 지원하지 않습니다. 목소리가 매우 비슷한 두 사람이 하나의 라벨을 함께 쓸 수 있고, 여러 사람이 동시에 말하면 라벨이 틀릴 수 있습니다. 모든 요금제에서 기본으로 켜져 있으며 설정 › 자막 › 화자에서 끌 수 있습니다. <a href="…">작동 방식</a>.</p>`

(`href="…"` là đường dẫn đã nêu; không để dấu ba chấm trong file thật. Câu FAQ có thêm vào dữ liệu có cấu trúc của trang (JSON-LD FAQ) tự động nếu mọi mục `q`/`a` đều đi vào đó: kiểm `pnpm test`.)

- [ ] **Step 4: Dữ liệu và bảo mật: mục mới và hàng của bảng mạng (năm ngôn ngữ)**

Trong `data-security.mjs`: (1) thêm **mục mới** ngay **trước** `<h2 id="network">` (dòng `old`: vi `<h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>`, en `<h2 id="network">Where does the app connect?</h2>`, ja `<h2 id="network">アプリはどこに接続しますか？</h2>`, zh `<h2 id="network">应用会连接到哪里？</h2>`, ko `<h2 id="network">앱은 어디에 연결되나요?</h2>`; id mới của vi `nguoi-noi`, các ngôn ngữ còn lại `speakers`; `new` = khối HTML rồi một dòng trống và dòng `old`); (2) bổ sung hàng `releases.aitranslator.vn` của bảng "Where does the app connect?".

(1) Khối HTML (en):
```html
<h2 id="speakers">Telling speakers apart and reading names</h2>
<p>This feature is on by default on macOS (from version 0.3.2) and you can turn it off in Settings › Subtitles › Speakers. Nothing in it sends audio or names anywhere.</p>
<div class="table-wrap" role="region" aria-label="Data used to tell speakers apart" tabindex="0"><table>
<thead><tr><th scope="col">Data</th><th scope="col">How it is handled</th></tr></thead>
<tbody>
<tr><th scope="row">Voice features</th><td>The app briefly analyzes the voice in the audio being translated, on your computer, to know which sentences come from the same person. They live only in RAM and are deleted automatically when the session ends. Never written to disk, never sent, not in logs or error reports, and not used to identify anyone or remember a person across sessions.</td></tr>
<tr><th scope="row">Participant names</th><td>On macOS, from the Microsoft Teams desktop meeting window only: display name, microphone state and a “speaking” marker. No chat, no shared content, no other window, no screenshots. Names live only in RAM, and are saved only if you turn on Save history (Pro), inside the encrypted history.</td></tr>
<tr><th scope="row">Accessibility permission</th><td>macOS asks for it (the bar shows an invitation; the app never opens the system dialog itself). The app clicks and types nothing in Teams. While you translate a meeting it turns on the accessibility mode of Teams, which stays on until Teams is restarted.</td></tr>
<tr><th scope="row">Name-reading recipe</th><td>A small description file (no executable code) with a digital signature, downloaded from our releases server when the app opens and every 6 hours. It is not used to identify anyone; the download request carries none of your data.</td></tr>
<tr><th scope="row">Status report</th><td>With error reports on, at most one report a day per meeting app and version: versions, status, minutes read out of the total, and a description of the kind of interface element. It contains no participant names and no text from the meeting; kept 60 days.</td></tr>
</tbody></table></div>
<p>This feature has not been measured with the traffic proxy the way the rest of the app was (see “How did we check that?”): it is not measured with the proxy yet. The full text (including the name-reading recipe) is in sections 2, 3, 4 and 10 of the <a href="/en/privacy/">Privacy policy</a>.</p>
```
vi (`id="nguoi-noi"`):
```html
<h2 id="nguoi-noi">Phân biệt người nói và đọc tên</h2>
<p>Tính năng bật sẵn trên macOS (từ bản 0.3.2) và bạn tắt được ở Cài đặt › Phụ đề › Người nói. Trong đó không có gì gửi âm thanh hay tên đi đâu.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu dùng để phân biệt người nói" tabindex="0"><table>
<thead><tr><th scope="col">Dữ liệu</th><th scope="col">Cách xử lý</th></tr></thead>
<tbody>
<tr><th scope="row">Đặc điểm giọng</th><td>App tạm thời phân tích giọng trong âm thanh đang dịch, ngay trên máy bạn, để biết câu nào do cùng một người nói. Chỉ nằm trong RAM và tự xóa khi hết phiên. Không ghi xuống đĩa, không gửi đi, không có trong log hay báo cáo lỗi, không dùng để xác định danh tính và không nhớ một người qua các phiên.</td></tr>
<tr><th scope="row">Tên người tham dự</th><td>Trên macOS, chỉ từ cửa sổ cuộc họp của app Microsoft Teams cài trên máy: tên hiển thị, trạng thái mic và dấu “đang nói”. Không đọc chat, nội dung chia sẻ, cửa sổ khác; không chụp màn hình. Tên chỉ nằm trong RAM, và chỉ được lưu khi bạn bật Lưu lịch sử (Pro), trong lịch sử đã mã hóa.</td></tr>
<tr><th scope="row">Quyền Trợ năng</th><td>macOS hỏi quyền này (thanh phụ đề hiện một dòng mời; app không tự bật hộp thoại của hệ thống). App không bấm hay gõ gì trong Teams. Trong lúc dịch một cuộc họp, app bật chế độ trợ năng của Teams; chế độ này còn bật tới khi Teams được khởi động lại.</td></tr>
<tr><th scope="row">Công thức đọc tên</th><td>Một tệp mô tả nhỏ (không có mã chạy) có chữ ký số, tải từ máy chủ phát hành của chúng tôi khi mở app và mỗi 6 giờ. Không dùng để xác định danh tính; yêu cầu tải không mang dữ liệu nào của bạn.</td></tr>
<tr><th scope="row">Báo cáo tình trạng</th><td>Khi báo cáo lỗi bật, tối đa một báo cáo mỗi ngày cho mỗi ứng dụng họp và phiên bản: phiên bản, trạng thái, số phút đọc được trên tổng số, và mô tả loại phần tử giao diện. Không có tên người tham dự, không có chữ trong cuộc họp; giữ 60 ngày.</td></tr>
</tbody></table></div>
<p>Tính năng này chưa đo bằng proxy như phần còn lại của app (xem “Chúng tôi đã kiểm tra thế nào?”). Toàn văn (kể cả công thức đọc tên) ở mục 2, 3, 4 và 10 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>.</p>
```
Test ở Step 1 cần trên trang dữ liệu: vi "Đặc điểm giọng", "tự xóa khi hết phiên", "không dùng để xác định danh tính", "công thức đọc tên" (chữ thường: có ở đoạn cuối), "chưa đo bằng proxy"; en "Voice features", "deleted automatically when the session ends", "not used to identify anyone", "name-reading recipe" (chữ thường: có ở đoạn cuối), "not measured with the proxy yet". Khối trên đã chứa đủ; lệch thì sửa **chữ trang** cho khớp ý của test, không nới test.

ja/zh/ko: dịch cùng khung (cùng số hàng bảng, cùng `id="speakers"`, cùng liên kết), ngắn gọn, đúng các ý của bản en; chữ nhãn app dùng đúng bảng ở đầu Task. Bản ja/zh/ko của "Where does the app connect?" liên kết chính sách dẫn tới `/en/privacy/` kèm "(tiếng Anh)" của ngôn ngữ đó (như các trang hiện có: lấy mẫu từ liên kết chính sách đã có trong cùng file).

(2) Bảng mạng, hàng `releases.aitranslator.vn`: chữ cũ của en `<td>Downloading models, checking for and downloading app updates</td>` → `<td>Downloading models (including the speaker model, about 26 MB, once the feature is on), checking for and downloading app updates, and downloading the name-reading recipe</td>`; vi: tìm bằng `grep -n "releases.aitranslator.vn</th>" vi/data-security.mjs` rồi thêm vào ô "Để làm gì" đúng vế: `, tải model nhận giọng (khoảng 26 MB, khi tính năng bật) và công thức đọc tên`; ja/zh/ko tương tự (ghi `Tệp:` dòng cũ/mới vào biên bản). Ô "Gửi gì" giữ "Chỉ yêu cầu tải file" (vẫn đúng).

- [ ] **Step 5: Test xanh, không lộ công nghệ lõi, năm ngôn ngữ**

Run: `cd $W/website && pnpm test 2>&1 | /usr/bin/grep -E "^not ok|^# (pass|fail)"`
Expected: `# fail 0`: test mới xanh; `CORE_TECH` (không tên model, thư viện, "Accessibility API" kỹ thuật: dùng "Accessibility permission/quyền Trợ năng" như chính sách), `i18n-content` (ja/zh/ko cùng số h2, cùng `id`, cùng liên kết, không câu tiếng Anh năm từ Latin liền nhau: tên “Microsoft Teams”, “Google Meet”, “Zoom”, “Pro”, “macOS”, “Windows” được phép ở mức từ đơn), JSON-LD, title/description không đổi. Test báo thừa thì sửa chữ trang.

- [ ] **Step 6: Mốc kiểm và commit**

Run: `cd $W && git diff --stat website | tail -3`
Expected: 15 file `.mjs` (ba trang × năm ngôn ngữ) và `site.test.mjs` đổi. Commit cục bộ: `cd $W && git branch --show-current && git add website/src/content website/test/site.test.mjs && git commit -m "docs(website): nội dung phân biệt người nói năm ngôn ngữ (hướng dẫn thanh phụ đề, hỏi đáp, dữ liệu và bảo mật)"`.

---

### Task 13: Sửa spec chính theo §15 của spec phân biệt người nói

**Files:** Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

Cách làm như kế hoạch nguồn micro 04 (Task 1): mỗi chỗ ghi mốc tìm bằng `grep -n`, đọc nguyên dòng, rồi Edit chèn/sửa đúng chỗ. Với dòng dài, `old` là **tiền tố duy nhất** của dòng, `new` = tiền tố + chữ thêm; cặp `old`/`new` phải khớp đúng một lần.

- [ ] **Step 1: §2 D1 và §3.1 F13, §3.2**

(a) D1: chữ cũ (dòng 49) có đoạn `Không cần bot, plugin hay tài khoản trên các nền tảng họp. |`:
```old
Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
```
```new
Hiện nhãn người nói trên phụ đề ("Người 1", "Người 2") và, trên macOS với Microsoft Teams bản cài, tên người đang nói đọc từ cửa sổ cuộc họp (F13). Không cần bot, plugin hay tài khoản trên các nền tảng họp. |
```
(b) F13: ngay sau dòng bắt đầu bằng `| F12 | **Nguồn micro**` (`grep -n "^| F12 |" <spec>`), thêm dòng (đọc nguyên dòng F12 rồi Edit: `old` = cả dòng F12, `new` = cả dòng F12 + xuống dòng + dòng F13):
```
| F13 | **Phân biệt người nói** (spec `2026-10-26-phan-biet-nguoi-noi-design.md`): phụ đề hiện nhãn mỗi giọng một màu ("Người 1", "Người 2", theo thứ tự xuất hiện; tên có màu ở dòng đầu mỗi lượt nói, vạch màu ở các câu sau) và, khi đọc được và đủ chắc, tên thật của người đang nói (hiện chỉ Microsoft Teams bản cài trên macOS, đọc từ cửa sổ cuộc họp bằng quyền Trợ năng; Meet, Zoom và Windows chưa). Nhận giọng và đọc tên chạy trong tiến trình phụ `speaker-worker` ưu tiên thấp, không chờ nhãn (§7); không ghi dấu giọng, không gửi đi. Đổi tên, chọn từ danh sách người tham dự, gộp hai người ngay trong phiên. Mọi gói; tên trong Lịch sử và file xuất theo Pro. Công thức đọc tên tải từ xa có ký số, báo cáo tình trạng không có tên người (§10.1). Tắt được ở Cài đặt › Phụ đề › Người nói. |
```
(c) §3.2: bỏ dòng `- Phân biệt ai đang nói`:
```old
- Phân biệt ai đang nói
- Ghi âm cuộc họp
```
```new
- Ghi âm cuộc họp
```
(Nếu `old` không khớp vì dòng kế khác `- Ghi âm cuộc họp`, đọc đoạn §3.2 thật rồi chỉ xóa đúng dòng `- Phân biệt ai đang nói`.)

- [ ] **Step 2: §3.3, bảy tiêu chí A-spk1…A-spk7**

Thêm bảy dòng vào bảng §3.3, ngay sau dòng cuối của bảng (`grep -n "^| A-ảo |" <spec>`; `old` = cả dòng `A-ảo`, `new` = dòng đó + các dòng dưới). Các số là kết quả đã đo ở kế hoạch 01, 02, 04 và Task 7–9 của kế hoạch 07 (điền **số thật của biên bản `07-nghiem-thu.md`** vào ba ô `<…>`: không để lại dấu `<`):
```
| A-spk1 | **Nhận giọng offline** (AMI, 4 bản ghi kiểm, tham số cố định, đúng đường của app): dòng ≥ 1 s đúng người ≥ 85%, mọi dòng ≥ 80%, tính theo trung bình các bản ghi kiểm. Đã đo trên bản phát hành: <dòng ≥ 1 s>% và <mọi dòng>%; mốc chống thụt lùi. |
| A-spk2 | **Nhận giọng tiếng Việt** (hội thoại dựng từ Common Voice tiếng Việt, 3–4 người): dòng ≥ 1 s đúng người ≥ 85%, theo trung bình các bản ghi kiểm. Đã đo: <số>%. Rủi ro đã biết: hai người giống giọng bị gộp thành một nhãn. |
| A-spk3 | **Tên thật** (kịch bản có lịch nói đã biết, sau khi mỗi người đã nói ≥ 2 lượt): dòng ≥ 1 s đúng tên ≥ 90%, sai tên ≤ 5%. Phát hành: Teams bản cài trên macOS. |
| A-spk4 | **Độ trễ** khi bật so với tắt (cặp xen kẽ, cùng đoạn âm thanh): A2 p50 chậm thêm ≤ 20 ms, p90 ≤ 50 ms, chữ dịch đầu p50 ≤ 20 ms (cận trên khoảng tin cậy 95%). |
| A-spk5 | **Tải:** `speaker-worker` ≤ 8% một lõi và RAM ≤ 250 MB trên M4 Pro (≤ 10% một lõi trên Windows i5); Teams không chậm rõ khi bị đọc (đo bằng số lệnh và năng lượng). |
| A-spk6 | **Họp thật** tiếng Việt ≥ 3 người do chủ dự án thử trên macOS (Windows khi bật): chủ dự án đánh giá đạt. |
| A-spk7 | **Bảo mật:** `cargo deny`, `cargo audit`, kiểm không có mã mạng trong `speaker-worker`, capability của `overlay` chỉ thêm `open_speaker_settings`, báo cáo tình trạng không có tên người. |
```

- [ ] **Step 3: §5 sơ đồ, §6.3 luật ghép câu, §6.6 `Subtitle`**

(a) §5: trong khối sơ đồ, thêm vào đoạn ngay sau sơ đồ (trước dòng `**Vì sao chạy cả nhận dạng giọng nói lẫn dịch thành tiến trình phụ (sidecar):**`) một đoạn mô tả tiến trình thứ ba (không sửa hình vẽ ASCII để khỏi vỡ khung):
```old
**Vì sao chạy cả nhận dạng giọng nói lẫn dịch thành tiến trình phụ (sidecar):**
```
```new
**Tiến trình phụ thứ ba, `speaker-worker`** (F13; spec `2026-10-26-phan-biet-nguoi-noi-design.md` §4): nhận giọng ("Người N") và đọc tên người tham dự từ cửa sổ cuộc họp, ưu tiên thấp, **không chứa ggml**, không có mã mạng, nói chuyện với app qua stdin/stdout. Tiến trình chính chép tối đa 4 s đầu mỗi đoạn vào kênh giới hạn 4 đoạn bằng `try_send` (đầy thì bỏ đoạn đó) và **không bao giờ chờ nhãn**; chữ gốc, bản dịch và chữ hiện dần đi đúng đường cũ. Chạy cùng phiên nếu tính năng bật và manifest có model; chết 3 lần thì tắt tới hết phiên, phụ đề vẫn chạy.

**Vì sao chạy cả nhận dạng giọng nói lẫn dịch thành tiến trình phụ (sidecar):**
```
(b) §6.3: dòng luật ghép (`grep -n "Đoạn khác ngôn ngữ thì mở một câu mới" <spec>`): thêm vào cuối dòng đó:
```old
Đoạn khác ngôn ngữ thì mở một câu mới.
```
```new
Đoạn khác ngôn ngữ thì mở một câu mới. **Hai đoạn đều đã biết giọng và khác giọng thì không ghép** (F13): giọng của một đoạn là nhãn đã nhận tới lúc kết quả nhận dạng của đoạn đó về; chưa có nhãn thì luật cũ áp dụng, nên luật đúng cả khi nhãn đến muộn.
```
(c) §6.6: cấu trúc `Subtitle` (dòng bắt đầu `- **Cấu trúc:** `Subtitle { id, start_ms`):
```old
`Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status, replaces }`
```
```new
`Subtitle { id, start_ms, end_ms, src_lang, src_text, tgt_text, status, replaces, speaker }`
```
rồi thêm hai gạch đầu dòng con sau `replaces`: `  - `speaker`: `Option<u32>`, mã giọng của câu (F13). Tên và màu không nằm trong phụ đề mà ở bảng người nói của phiên (sự kiện `speaker://roster`).` và, sau bốn sự kiện `subtitle://…` hiện có, hai sự kiện `subtitle://speaker {id, speaker}` (nhãn tới sau khi phụ đề đã phát) và `speaker://roster {voices: [{id, label, color, source, room}], participants}`. Mục "Lưu trữ" thêm: cột `speaker TEXT` (cho phép rỗng) ở bảng `lines` của SQLCipher, ghi nhãn tại lúc lưu (sau đổi tên), vẫn chỉ khi có Pro và bật "Lưu lịch sử". Mục "Xuất file": TXT `[giờ] Lan: câu gốc` rồi `→ bản dịch`; SRT thêm tùy chọn tiền tố `Lan: ` (mặc định tắt); Markdown `**Lan:** …`; không có nhãn thì như cũ. Dùng `Edit` từng chỗ trên các dòng đã `grep` (`- **Gửi sang giao diện qua sự kiện Tauri:**`, `- **Lưu trữ:**`, `- **Xuất file:**`).

- [ ] **Step 4: §7, §8, §10.1, §10.2**

(a) §7: dòng liệt kê luồng (`7. Tiến trình phụ `llama-server`.`) và hàng đợi:
```old
  7. Tiến trình phụ `llama-server`.
```
```new
  7. Tiến trình phụ `llama-server`.
  8. Luồng client của `speaker-worker` (F13): ghi khung xuống stdin, một luồng đọc nhận nhãn và chuyển cho luồng phụ đề qua kênh; tiến trình phụ `speaker-worker` (ưu tiên thấp, 2 luồng tính toán).
```
Thêm sau gạch đầu dòng **Hàng đợi đoạn âm thanh**: `- **Kênh sang `speaker-worker`** chứa tối đa 4 đoạn; đầy thì bỏ đoạn đó (`try_send`), luồng VAD không bao giờ chờ.` và sửa gạch **Hàng đợi dịch**: sau câu `Khi đầy, gộp các câu liên tiếp cùng ngôn ngữ vào một request.` thêm: ` Khi tính năng người nói bật, hàng đợi gộp theo hai lượt: lượt 1 không gộp hai giọng đã biết khác nhau; nếu hàng còn nhiều câu hơn số câu mà cách gộp lúc tắt tính năng để lại thì lượt 2 gộp như khi tắt, kể cả câu khác giọng, và câu gộp từ hai giọng khác nhau không mang nhãn. Nhờ đó hàng không bao giờ dài hơn, câu không chờ lâu hơn và không thêm câu `Skip` so với khi tắt.`
(b) §8 (hiệu năng): thêm gạch đầu dòng vào mục RAM đo được (sau đoạn `**RAM đo được trên Mac M4 Pro**`) hay ngay trước `**VRAM ước tính trên Windows**`:
```old
**VRAM ước tính trên Windows (card rời), cần kiểm chứng ở S6:**
```
```new
**`speaker-worker` (F13), M4 Pro** (spec `2026-10-26-phan-biet-nguoi-noi-design.md` §11): trung bình ≤ 8% một lõi khi người nói liên tục (đo bằng số lệnh và năng lượng, không bằng %CPU) và RAM ≤ 250 MB (đo: đỉnh 137–198 MB khi phát theo thời gian thực, 141,8 MB sau 92 phút, không rò); Windows i5 ≤ 10% một lõi, chờ số đo. Khi chạy quá chậm hơn thời gian thực 30 s liền thì tạm dừng đọc tên, chỉ nhận giọng; vẫn chậm thì tắt tới hết phiên.

**VRAM ước tính trên Windows (card rời), cần kiểm chứng ở S6:**
```
(c) §10.1, thêm hai gạch đầu dòng sau gạch **Chat hỗ trợ** (`grep -n "^- \*\*Chat hỗ trợ\*\*" <spec>`: chèn sau cả khối của gạch đó, tức ngay trước `- **Tiến trình phụ:** `llama-server` chỉ nghe`):
```
- **Phân biệt người nói** (F13; spec `2026-10-26-phan-biet-nguoi-noi-design.md` §10): đặc điểm giọng (vector nhúng) và tâm cụm chỉ nằm trong RAM của `speaker-worker`, xóa khi hết phiên hay worker thoát; không ghi đĩa, không gửi đi, không đưa vào log hay báo cáo; không dùng để xác định danh tính, không nhớ một người qua các phiên. Tên người tham dự đọc từ cửa sổ cuộc họp (chỉ Microsoft Teams bản cài trên macOS; chỉ cửa sổ họp; chỉ tên hiển thị, trạng thái mic, dấu "đang nói"; không chat, không ảnh) chỉ nằm trong RAM và Lịch sử mã hóa (Pro, khi bật lưu); log chỉ có số đếm và trạng thái. `speaker-worker` không có mã mạng (CI kiểm bốn lớp bằng `scripts/release/check-no-network.sh`).
- **Báo cáo tình trạng và công thức đọc tên** (F13): app tải công thức đọc tên (tệp mô tả, không mã, ký Ed25519 cùng khóa manifest nhưng `format` và tiền tố ký riêng, chống quay lui) từ `releases.aitranslator.vn` lúc mở và mỗi 6 giờ khi tính năng bật; một lệnh GET không kèm dữ liệu nào. Khi công tắc "Gửi báo cáo lỗi" bật, mỗi ngày tối đa một báo cáo `speaker_health` cho mỗi cặp (ứng dụng họp, phiên bản) qua `POST /v1/diagnostics`: phiên bản, trạng thái, số phút, mô tả loại phần tử (vai trò, lớp), mã băm ID máy; **không có tên người, không có chữ**; giữ 60 ngày; xóa theo email xóa luôn báo cáo của máy đã kích hoạt key của email đó. Model nhận giọng (~26 MB, Apache-2.0) tải cùng cách với model khác, kiểm SHA-256; manifest không có mục `speaker` thì tính năng tắt ở phiên dịch kế tiếp (công tắc tắt khẩn).
```
(d) §10.2: thêm hàng vào bảng mối đe dọa (sau hàng `Thay tiến trình phụ, hoặc chèn thư viện giả`): `grep -n "^| Thay tiến trình phụ" <spec>`, `old` là tiền tố `| Thay tiến trình phụ, hoặc chèn thư viện giả |`, thêm một dòng bảng **sau cả hàng đó** (đọc nguyên hàng trước khi Edit):
```
| Thay `speaker-worker`, công thức độc, đọc quá phạm vi | `speaker-worker` được kiểm SHA-256 theo danh sách build sẵn, ký cùng app, nạp DLL hạn chế (Windows) và băm lại đúng các byte model nó đọc. Công thức đọc tên chỉ mô tả (không mã), ký số, app trong danh sách viết cứng (Teams, Zoom, Meet), mẫu chữ bằng `regex` tuyến tính ≤ 256 ký tự, file ≤ 256 KB, không nhận bản cũ hơn; worker không có mạng nên kể cả khóa ký bị lộ thì không gửi được gì ra ngoài. Danh sách app, cửa sổ họp và thứ đọc ra viết cứng trong app; giới hạn ≤ 3 000 phần tử và 30 ms mỗi lượt; cửa sổ `overlay` chỉ thêm đúng một lệnh không tham số `open_speaker_settings`. |
```

- [ ] **Step 5: Kiểm và commit**

Run: `cd $W && /usr/bin/grep -n "Phân biệt ai đang nói" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | head; /usr/bin/grep -c "A-spk[1-7]" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md; /usr/bin/grep -n "<[a-zA-Z ≥]*>%" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | head -3; /usr/bin/grep -c "/Use[r]s/" docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
Expected: không còn dòng "Phân biệt ai đang nói" ở §3.2 (nếu còn ở §13 lộ trình thì đọc: `grep -n "Phân biệt ai đang nói"` dòng ~1410 thuộc danh sách "Sau MVP": đổi thành `- ~~Phân biệt ai đang nói~~ (đã làm: F13)` hay xóa dòng, ghi vào biên bản); `A-spk` xuất hiện ≥ 7 lần; không còn ô `<…>%` chưa điền; `/Use[r]s/` ra `0`. Commit cục bộ: `cd $W && git branch --show-current && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): spec chính ghi phân biệt người nói (F13, A-spk1–7, speaker-worker, §6.3, §6.6, §7, §8, §10)"`.

---

### Task 14: Runbook, mục 16 "Phân biệt người nói: phát hành, bật, tắt khẩn"

**Files:** Modify `docs/release/phat-hanh.md`

- [ ] **Step 1: Thêm mục 16 vào cuối file**

Thêm vào **cuối** `docs/release/phat-hanh.md` (sau mục 15.5):

````markdown

## 16. Phân biệt người nói: phát hành app, bật, tắt khẩn, quay lại

Spec `2026-10-26-phan-biet-nguoi-noi-design.md`, kế hoạch `2026-10-28-phan-biet-nguoi-noi-07-phat-hanh.md` (và `07b`). **Mỗi bước ghi vào production do chủ dự án chạy.** Tính năng có hai công tắc từ xa độc lập với bản app: manifest model (mục `speaker`) và công thức đọc tên (mục 15). App 0.3.2 phát hành lúc manifest chưa có mục `speaker` thì "ngủ": không tải model, không tải công thức, không gửi báo cáo, không hiện nhóm Cài đặt "Người nói".

### 16.1. Điều kiện trước khi phát hành app 0.3.2

1. Nhánh `phan-biet-nguoi-noi` đã gộp vào `main` và đẩy; CI của `main` xanh (macOS và Windows; gồm `speaker::`, `db::`, `diagnostics::` ở bản release).
2. Mục 15.1 và 15.2 đã làm: migration 0007 và hai Worker đã deploy, cron 5 phút chạy, công thức đầu tiên (`version` 1) đã đăng ở `releases.aitranslator.vn/speaker/recipes.json`.
3. `docs/legal`: nội dung chính sách 1.9 và EULA 1.6 đã duyệt; dòng phiên bản và ngày đổi vào **ngày phát hành** (`docs/legal/README.md`, "Đổi ngày hiệu lực"), trước khi build; website chưa deploy.
4. Biên bản `bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md`: A-spk1, A-spk2, A-spk4, A-spk7 đạt; A-spk3 và A-spk6 đã đánh giá với Teams thật.
5. `SHIPS_ON_WINDOWS` (`src-tauri/src/speaker/mod.rs`) là `false` trừ khi mục "Windows" của biên bản đạt.

### 16.2. Phát hành app: năm bước của mục 2

Làm đúng mục 2 (nâng bốn file lên `0.3.2`, chờ CI xanh vì `cancel-in-progress`, hỏi chủ dự án rồi đẩy tag `v0.3.2`, kiểm R2 và SHA-256, `pnpm deploy` website). Khác một điểm: **chưa deploy website ở bước 5**: website nói về tính năng đã bật, nên chỉ deploy ở 16.4. Sau khi tag lên, kiểm "ngủ": mở bản mới (hay chạy bản release) và xác nhận bằng proxy hay `nettop` rằng **không có kết nối mới** tới `releases.aitranslator.vn/speaker/` hay `api.aitranslator.vn/v1/diagnostics` với `speaker_health`, và Cài đặt › Phụ đề không có nhóm "Người nói".

### 16.3. Bật: đăng manifest có mục `speaker`

Điều kiện: bản 0.3.2 đã lên R2 và ổn ít nhất một ngày (không báo cáo lỗi lạ), chủ dự án xác nhận pháp lý (luật sư), A-spk3 đạt.

```bash
# 1. Đặt model lên R2 (cạnh các model khác; không ghi đè file đã có).
cd $M && node scripts/models/speaker-manifest.mjs add --file <thư mục dữ liệu>/models/eres2net-sv-en-voxceleb-16k.onnx --min-app-version 0.3.2
#    in đường dẫn R2 `models/speaker/<12 ký tự SHA>/eres2net-sv-en-voxceleb-16k.onnx` và ghi scripts/models/released/body-<N+1>.json
pnpm -C server exec wrangler r2 object put "ai-translator-releases/models/speaker/<12 ký tự SHA>/eres2net-sv-en-voxceleb-16k.onnx" --file <thư mục dữ liệu>/models/eres2net-sv-en-voxceleb-16k.onnx --content-type application/octet-stream --remote
pnpm -C server exec wrangler r2 object put "ai-translator-releases/models/speaker/<12 ký tự SHA>/3D-Speaker-LICENSE.txt" --file licenses/models/3D-Speaker-LICENSE.txt --content-type text/plain --remote
# 2. Kiểm file đã lên đúng SHA-256 (qua URL công khai).
curl -s https://releases.aitranslator.vn/models/speaker/<12 ký tự SHA>/eres2net-sv-en-voxceleb-16k.onnx | shasum -a 256
# 3. Commit body, đẩy main, ký bằng workflow `Sign model manifest` (input body=scripts/models/released/body-<N+1>.json,
#    previous=scripts/models/released/body-<N>.json), tải artifact models-manifest/models.json, đăng lên R2 như mục 13.
```
Cách `wrangler r2 object put` hay `rclone` (mục 13.1, `--s3-no-check-bucket`) đều được; không đăng `models.json` trước khi file model đã lên và khớp SHA-256 (app tải model theo manifest). Kiểm sau khi đăng: `curl -s https://releases.aitranslator.vn/models/models.json` có `"speaker"` ở gốc phần thân (giải mã `body`); app 0.3.2 mở lại, trong vòng một giờ thấy manifest mới, Cài đặt › Phụ đề hiện nhóm "Người nói" với ghi chú "Chưa có dữ liệu nhận giọng" rồi "Đang tải"; phiên dịch kế tiếp có "Người N". Dây chuyền chuẩn của `pnpm models:update` về sau giữ khóa `speaker` (test `scripts/models/speaker-manifest.test.mjs`).

### 16.4. Website

Sau 16.3 và A7 (mục 16.6): `cd website && pnpm test && pnpm deploy`; kiểm: `curl -s https://aitranslator.vn/chinh-sach-quyen-rieng-tu/ | grep -c "Phiên bản 1.9"` ≥ 1 và `curl -s https://aitranslator.vn/huong-dan/thanh-phu-de-va-phim-tat/ | grep -c 'id="nguoi-noi"'` ≥ 1.

### 16.5. Tắt khẩn, từ nhẹ tới nặng

| Muốn | Làm | Hiệu lực |
|---|---|---|
| Chỉ tắt đọc tên (còn "Người N") | `pnpm recipes:update` với công thức không có mục (`"apps": []`), hay `--revert-to <V>` (mục 15.3) | phiên dịch kế tiếp, trong vòng 6 giờ |
| Tắt cả tính năng từ xa | `node scripts/models/speaker-manifest.mjs remove` → `body-<N+1>.json` không có `speaker`; ký và đăng như 16.3 (không cần model mới) | phiên dịch kế tiếp, sau khi app nhận manifest (≤ 1 giờ) |
| Tắt hẳn trong một bản app | đặt `SHIPS_ON_WINDOWS`/bảng hệ điều hành trong `speaker::ships_on` rồi phát hành bản mới | khi người dùng cập nhật |
| Người dùng tự tắt | Cài đặt › Phụ đề › Người nói | ngay phiên sau (tắt giữa phiên dừng worker) |

Sau khi tắt từ xa: model đã tải vẫn nằm trong kho model của máy (không dùng tới); báo cáo tình trạng đã gửi nằm ở D1 (giữ 60 ngày; xóa tay bằng lệnh ở mục 15.4 nếu cần).

### 16.6. A7 (không kết nối lạ) và theo dõi

Trước khi deploy website: chạy A7 bằng proxy trên bản release ký ad-hoc ở chế độ có người nói (`bench/phase1/acceptance/RUNBOOK-mac.md`, danh sách cho phép `bench/phase1/results/acceptance/a7-allow.json` đã có `/speaker/recipes.json` và đường dẫn model), ghi `bench/phase1/results/acceptance/a7-mac-nguoi-noi.{md,json}`. Theo dõi 7 ngày: tab **Bộ đọc tên** của Web Admin (mục 15.4), email `speaker_health_degraded` và `speaker_canary_failed`, báo cáo lỗi mới (`asr-worker`/`speaker-worker` chết, `unclean_exit`), và email hỗ trợ.
````

- [ ] **Step 2: Kiểm và commit**

Run: `cd $W && /usr/bin/grep -n "^## 1[0-9]\." docs/release/phat-hanh.md | tail -4 && /usr/bin/grep -c "/Use[r]s/" docs/release/phat-hanh.md; node --test "scripts/release/*.test.mjs" 2>&1 | /usr/bin/grep -E "^ℹ (pass|fail)"`
Expected: có `## 16.`; số `/Use[r]s/` **không tăng** so với trước (bốn dòng có sẵn ở mục 14 cũ theo `06-van-hanh.md`; so bằng `git diff docs/release/phat-hanh.md | /usr/bin/grep -c "^+.*/Use[r]s/"` ra `0`); `ℹ fail 0`. Commit cục bộ: `cd $W && git branch --show-current && git add docs/release/phat-hanh.md && git commit -m "docs(release): runbook mục 16, phát hành, bật, tắt khẩn phân biệt người nói"`.

---

### Task 15: Kiểm cuối toàn nhánh, quét và biên bản

**Files:** Modify `$B/results/07-nghiem-thu.md`

- [ ] **Step 1: Mọi bộ test**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && echo fmt-ok && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -2 && scripts/check-windows.sh --locked 2>&1 | tail -2 && cargo test --locked --workspace 2>&1 | /usr/bin/grep -E "^test result|FAILED|panicked" | sort | uniq -c | sort -rn | head -8 && cargo test --locked -p asr-worker --features shared-encode 2>&1 | /usr/bin/grep -E "^test result|FAILED"; pnpm install --frozen-lockfile >/dev/null 2>&1; pnpm build 2>&1 | tail -2; pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files"; (cd server && pnpm run check 2>&1 | tail -3); (cd server/admin-ui && pnpm exec vitest run 2>&1 | /usr/bin/grep -E "Tests |Test Files"); (cd website && pnpm test 2>&1 | /usr/bin/grep -E "^# (pass|fail)"); node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/models/speaker-manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs scripts/speaker-recipes/update.test.mjs tools/speaker-canary/canary.test.mjs 2>&1 | /usr/bin/grep -E "^ℹ (pass|fail)"; python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py' 2>&1 | tail -2`
Expected: `fmt-ok`; clippy và `check-windows` sạch; mọi `test result: ok`; vitest, server (`pnpm run check`: typecheck, vector, test, script, ui, dry-run), Web Admin, website đạt; `node --test` `ℹ fail 0` (≥ 239: 230 cũ + 9 của `speaker-manifest`); `unittest` OK. Số test ghi vào biên bản "Chưa kiểm" → mục "Số test cuối".

- [ ] **Step 2: Công cụ chấm A-spk3 (Task 18) có test**

Công cụ viết ở Task 18 Step 1; nếu đã làm: `cd $W/bench/2026-10-26-nguoi-noi && python3 -m unittest test_score_names_export 2>&1 | tail -3`. Nếu Task 18 chưa tới thì bỏ bước này.

- [ ] **Step 3: Quét repo công khai**

Quét chuỗi không được có trong file thêm hay sửa (trừ `bench/` kết quả đã có và `docs/superpowers/plans/`): đường dẫn thư mục cá nhân, khóa, mã truy cập, email thật, tên người thật.
Run: `cd $W && for f in $(git diff --name-only origin/main...HEAD 2>/dev/null | /usr/bin/grep -v "^docs/superpowers/plans/"; git status --short | awk '{print $2}'); do [ -f "$f" ] && /usr/bin/grep -nH -E '/Use[r]s/|/home/[a-z]|BEGIN (RSA|EC|OPENSSH|PRIVATE)|AKIA[0-9A-Z]{12}|ghp_[0-9A-Za-z]{20}|xox[bp]-|sk-[A-Za-z0-9]{20}' "$f"; done | /usr/bin/grep -v "^docs/release/phat-hanh.md:.*/Use[r]s/" | head -20`
Expected: không dòng nào (bốn dòng `/Use[r]s/` có sẵn ở mục 14 cũ của `docs/release/phat-hanh.md` được loại trừ như `06-van-hanh.md`; lệnh `git diff origin/main...HEAD` cần `git fetch` ở Task 0; nếu `origin/main` không có thì dùng `git diff --name-only HEAD~12`). Có dòng khớp mà là chuỗi giả trong test/bộ phát hiện thì ghi lại và chỉ rõ; thật thì **dừng**, báo. Tên người trong `tools/speaker-canary/` và test là tên giả (An, Binh, Lan…).
Quét chuỗi công nghệ lõi trong nội dung website: `cd $W/website/src/content && /usr/bin/grep -rn -i -E "eres2net|3d-speaker|candle|onnx|embedding|vector nhúng|speaker-worker|AXUIElement|UI Automation|accessibility api" . | head` ra rỗng (test `CORE_TECH` cũng chặn).

- [ ] **Step 4: Rà mã**

Gọi skill `superpowers:requesting-code-review` cho `git diff origin/main...HEAD -- src-tauri src crates scripts .github` (hay `/code-review` mức `high`), tập trung phần của kế hoạch 07: `speaker/mod.rs` (`ships_on`, `speaker_offered`), `recipes.rs` (điều kiện vòng tải), `SubtitleSettings.tsx`, `speaker-manifest.mjs`, hai dòng CI. Sửa lỗi Critical/Important; mỗi sửa một commit cục bộ, chạy lại Step 1.

- [ ] **Step 5: Hoàn thiện biên bản và báo chủ dự án**

Hoàn thiện `$B/results/07-nghiem-thu.md`: bảng A-spk1…A-spk7 (cột: mức đạt, kết quả, file/lệnh, trạng thái "đạt/chờ"); các mục "chờ chủ dự án" (Task 18, 19, 20); mục "Chưa kiểm" (xem cuối file 07b). Báo chủ dự án bằng tiếng Việt, ngắn: bảng kết quả, các điều chờ, **đề nghị chủ dự án duyệt nội dung pháp lý và website, hỏi luật sư, rồi cho phép Task 16**. Cập nhật memory: sửa `memory/phan-biet-nguoi-noi-research-2026-10-26.md` và dòng của nó trong `MEMORY.md` (kế hoạch 07 phần A xong, còn gì), tắt mọi tiến trình nền mình đã mở. Commit cục bộ: `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "docs(speaker): biên bản nghiệm thu 07, kiểm cuối phần A"`.

---

## Phần B: cần chủ dự án

Điều kiện chung: Task 0–15 xong và chủ dự án đã đọc biên bản. Mọi lệnh ghi vào production, đẩy `main`, đẩy tag, đăng R2, deploy do **chủ dự án chạy hay ra lệnh rõ**; Claude chuẩn bị lệnh và kiểm kết quả bằng lệnh chỉ-đọc. Mỗi việc không hoàn tác được thì hỏi (AskUserQuestion) ngay trước khi chạy.

### Task 16: Cổng 1, duyệt và gộp vào `main` (chủ dự án)

- [ ] **Step 1: Chủ dự án duyệt** (checklist, ghi vào biên bản): nội dung chính sách 1.9 và EULA 1.6 (`docs/legal`), nội dung website (Task 11, 12), spec chính (Task 13), runbook mục 16, các quyết định ở "Điều cần chủ dự án quyết".
- [ ] **Step 2: Gộp và đẩy (chủ dự án chọn cách).** `main` đã đi trước nhánh (commit website; Task 0 Step 1 cho số). Không fast-forward được, nên chủ dự án chọn: `git merge phan-biet-nguoi-noi` (merge commit) hay rebase nhánh lên `main`, rồi `git push origin main`. Kế hoạch này không làm việc đó. Sau khi gộp: chạy lại Task 15 Step 1 **trên `main`** (hay trên nhánh gộp thử) trước khi đẩy.
- [ ] **Step 3: CI xanh.** Chờ CI của commit đẩy (macOS và Windows; ~30 phút; `cancel-in-progress` nên không đẩy gì thêm trong lúc chờ). Kiểm từng job bằng `gh run view <id> --json jobs` (không tin trạng thái chung của run). Có job đỏ: đọc log, sửa trên nhánh, gộp lại.

### Task 17: Triển khai server, Web Admin, công thức đầu tiên (chủ dự án chạy; Claude kiểm)

Việc này là phần B của kế hoạch 06 (`06b` Task 17 và 18); làm đúng **runbook mục 15.1 và 15.2** (migration 0007 trước, Worker sau, kiểm cron, đăng công thức `version` 1).

- [ ] **Step 1: Chủ dự án chạy mục 15.1 rồi 15.2.**
- [ ] **Step 2: Claude kiểm (chỉ đọc)**: `dig @8.8.8.8 releases.aitranslator.vn +short`; `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.aitranslator.vn/v1/diagnostics -H 'content-type: application/json' -d '{"v":1,"kind":"speaker_health"}'` ra `400`; `curl -s https://releases.aitranslator.vn/speaker/recipes.json | head -c 200` có `"format":"ai-translator-speaker-recipes"`; Web Admin tab **Bộ đọc tên** mở được và báo trống; `wrangler tail` thấy `"event":"reconcile"` không có `reconcile_failed` ở hai bước `speaker_health_alerts`, `prune_speaker_health`.
- [ ] **Step 3: Ghi vào biên bản** ngày giờ, kết quả từng lệnh. Chưa đạt thì **không sang Task 21**.

### Task 18: A-spk3 và A-spk6 với Teams thật trên macOS, và A-spk4/A-spk5 khi Teams đang bị đọc (chủ dự án và Claude làm cùng)

Điều kiện: 04b Task 19–21 đạt (bộ đọc macOS thử với app thật). Tài khoản thử: 1 tài khoản Microsoft cá nhân (chủ phòng Teams) và hai khách vào bằng trình duyệt (spec §7.3). Không dùng cuộc họp thật của khách hàng.

**Files:** Create `bench/2026-10-26-nguoi-noi/score_names_export.py`, `bench/2026-10-26-nguoi-noi/test_score_names_export.py`

- [ ] **Step 1: Bộ chấm A-spk3 từ bản chép lời xuất ra (Claude, làm trước trên máy này)**

Hai file dưới đây đã chạy thử ngoài repo (7 test đạt). Tạo với **đúng** nội dung này:

File `bench/2026-10-26-nguoi-noi/score_names_export.py`:

```python
"""Chấm A-spk3 (tên thật trên phụ đề) từ bản chép lời xuất ra của một cuộc họp thử có lịch nói đã biết.

Dùng: python -I score_names_export.py <chep-loi.txt> <lich.json> [--offset-s N] [--tol-s 1.5] [--min-words 3] [--min-turns 2]

- `chep-loi.txt`: bản TXT xuất ra hay "Sao chép tất cả" (mỗi dòng `[HH:MM:SS] Tên: câu gốc`, kế đó `→ bản dịch`; dòng không nhãn là
  `[HH:MM:SS] câu gốc`). Tên người ghi trong file này nên chỉ để ở thư mục dữ liệu ngoài repo.
- `lich.json`: `[{"name": "...", "start": "HH:MM:SS", "end": "HH:MM:SS"}, ...]`, giờ đồng hồ của máy chạy app, theo thứ tự nói.
- Một dòng chép lời được tính khi giờ của nó rơi vào đúng MỘT lượt nói (nới `--tol-s` giây mỗi đầu) và có từ `--min-words` từ trở lên
  (xấp xỉ "dòng ≥ 1 s"). Chỉ tính các lượt sau khi mỗi người đã nói đủ `--min-turns` lượt ("sau khi mỗi người đã nói ≥ 2 lượt").
- Nhãn chung ("Người 3", "Speaker 2", "話者1", "说话人1", "화자 1") là *không tên*; nhãn khác tên đúng là *sai tên*.

Đạt (spec §12, A-spk3): đúng tên ≥ 90% và sai tên ≤ 5% trên các dòng được tính. In JSON; thoát 0 nếu đạt, 1 nếu không.
"""
import argparse
import json
import re
import sys

GENERIC = re.compile(r"^(Người|Speaker|話者|说话人|화자) ?\d+$")
LINE = re.compile(r"^\[(\d{1,2}):(\d{2}):(\d{2})\] (.*)$")


def secs(text):
    h, m, s = (int(x) for x in text.split(":"))
    return h * 3600 + m * 60 + s


def parse_export(text):
    """[(giờ_giây, nhãn hay None, câu gốc)]: dòng `→` và dòng trống bị bỏ."""
    out = []
    for raw in text.splitlines():
        m = LINE.match(raw.strip())
        if not m:
            continue
        t = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        body = m.group(4)
        label, sep, rest = body.partition(": ")
        if sep and 0 < len(label) <= 40:
            out.append((t, label.strip(), rest.strip()))
        else:
            out.append((t, None, body.strip()))
    return out


def score(lines, turns, offset_s=0.0, tol_s=1.5, min_words=3, min_turns=2):
    """Đếm đúng tên, sai tên, nhãn chung, không nhãn trên các dòng được tính."""
    names = sorted({t["name"] for t in turns})
    seen = {n: 0 for n in names}
    eligible_after = None
    for t in turns:
        seen[t["name"]] += 1
        if eligible_after is None and all(v >= min_turns for v in seen.values()):
            eligible_after = secs(t["end"])
    counted = correct = wrong = generic = none = 0
    if eligible_after is None:
        return {"counted": 0, "correct": 0, "wrong": 0, "generic": 0, "none": 0, "eligible": False, "turns": len(turns)}
    for t, label, text in lines:
        t = t + offset_s
        if t < eligible_after or len(text.split()) < min_words:
            continue
        hits = [x for x in turns if secs(x["start"]) - tol_s <= t <= secs(x["end"]) + tol_s]
        if len(hits) != 1:
            continue
        counted += 1
        if label is None:
            none += 1
        elif GENERIC.match(label):
            generic += 1
        elif label == hits[0]["name"]:
            correct += 1
        else:
            wrong += 1
    return {"counted": counted, "correct": correct, "wrong": wrong, "generic": generic, "none": none, "eligible": True, "turns": len(turns)}


def verdict(r):
    if not r["eligible"] or r["counted"] == 0:
        return False
    return r["correct"] / r["counted"] >= 0.90 and r["wrong"] / r["counted"] <= 0.05


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("export")
    ap.add_argument("schedule")
    ap.add_argument("--offset-s", type=float, default=0.0)
    ap.add_argument("--tol-s", type=float, default=1.5)
    ap.add_argument("--min-words", type=int, default=3)
    ap.add_argument("--min-turns", type=int, default=2)
    a = ap.parse_args(argv)
    lines = parse_export(open(a.export, encoding="utf-8").read())
    turns = json.load(open(a.schedule, encoding="utf-8"))
    r = score(lines, turns, a.offset_s, a.tol_s, a.min_words, a.min_turns)
    r["pass"] = verdict(r)
    if r["counted"]:
        r["correct_rate"] = round(r["correct"] / r["counted"], 4)
        r["wrong_rate"] = round(r["wrong"] / r["counted"], 4)
    print(json.dumps(r, ensure_ascii=False))
    return 0 if r["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

File `bench/2026-10-26-nguoi-noi/test_score_names_export.py`:

```python
import unittest

import score_names_export as s

TURNS = [
    {"name": "An", "start": "10:00:00", "end": "10:00:10"},
    {"name": "Binh", "start": "10:00:12", "end": "10:00:22"},
    {"name": "An", "start": "10:00:30", "end": "10:00:40"},
    {"name": "Binh", "start": "10:00:42", "end": "10:00:52"},
    {"name": "An", "start": "10:01:00", "end": "10:01:10"},
    {"name": "Binh", "start": "10:01:12", "end": "10:01:22"},
    {"name": "An", "start": "10:01:30", "end": "10:01:40"},
]


def export(rows):
    return "\n".join(f"[{t}] {label + ': ' if label else ''}{text}\n→ dịch" for t, label, text in rows)


class ScoreNames(unittest.TestCase):
    def test_parse_export_labels_and_plain_lines(self):
        lines = s.parse_export(export([("10:00:05", "An", "hello there my friend"), ("10:00:15", None, "no label here")]))
        self.assertEqual(lines, [(36005, "An", "hello there my friend"), (36015, None, "no label here")])

    def test_only_turns_after_everyone_spoke_twice_count(self):
        rows = [("10:00:05", "An", "one two three"), ("10:00:15", "Binh", "one two three"), ("10:00:35", "An", "one two three"),
                ("10:00:45", "Binh", "one two three"), ("10:01:05", "An", "one two three"), ("10:01:15", "Binh", "one two three")]
        r = s.score(s.parse_export(export(rows)), TURNS)
        self.assertTrue(r["eligible"])
        self.assertEqual(r["counted"], 2)  # chỉ hai lượt sau khi Binh nói xong lượt thứ hai
        self.assertEqual(r["correct"], 2)

    def test_wrong_generic_none_and_short_lines(self):
        rows = [("10:01:01", "Binh", "one two three"), ("10:01:02", "An", "one two three"), ("10:01:03", "Người 2", "one two three"),
                ("10:01:04", None, "one two three"), ("10:01:05", "An", "ok")]
        r = s.score(s.parse_export(export(rows)), TURNS)
        self.assertEqual((r["correct"], r["wrong"], r["generic"], r["none"], r["counted"]), (1, 1, 1, 1, 4))  # "ok" ngắn bị bỏ

    def test_overlapping_or_gap_lines_are_ignored(self):
        turns = TURNS + [{"name": "Binh", "start": "10:01:09", "end": "10:01:20"}]
        r = s.score(s.parse_export(export([("10:01:10", "An", "one two three"), ("10:00:56", "An", "one two three")])), turns, tol_s=0.5)
        self.assertEqual(r["counted"], 0)

    def test_verdict_thresholds(self):
        ok = {"eligible": True, "counted": 20, "correct": 18, "wrong": 1, "generic": 1, "none": 0}
        self.assertTrue(s.verdict(ok))
        self.assertFalse(s.verdict({**ok, "correct": 17, "generic": 2}))
        self.assertFalse(s.verdict({**ok, "wrong": 2, "generic": 0}))
        self.assertFalse(s.verdict({**ok, "eligible": False}))

    def test_nobody_spoke_enough(self):
        r = s.score([], TURNS[:3])
        self.assertFalse(r["eligible"])

    def test_offset_shifts_export_clock(self):
        rows = [("10:00:58", "An", "one two three"), ("10:01:10", "Binh", "one two three")]
        r = s.score(s.parse_export(export(rows)), TURNS, offset_s=2)
        self.assertEqual((r["counted"], r["correct"]), (2, 2))


if __name__ == "__main__":
    unittest.main()
```

Run: `cd $W/bench/2026-10-26-nguoi-noi && python3 -m unittest -v test_score_names_export 2>&1 | tail -4`
Expected: `Ran 7 tests`, `OK`. (Chạy không dùng `-I` vì `unittest` cần thư mục hiện tại trong đường dẫn; `score_names_export.py` đọc file dữ liệu ngoài repo.)

- [ ] **Step 2: Cuộc họp thử có lịch nói (chủ dự án; Claude hướng dẫn và chấm)**

(a) Chuẩn bị bản dev có tính năng: trong `.env` ở gốc repo (file bị `.gitignore`) thêm `AI_TRANSLATOR_DEV_SPEAKER=true`; model nhận giọng của bản dev lấy ở `MT_MODELS_DIR` hay `<repo>/models` (chép `eres2net-sv-en-voxceleb-16k.onnx` vào đó nếu chưa có). Mở bằng `scripts/run-dev-app.sh` (bản dev dùng `data-dev.db` và khóa riêng nên không đụng dữ liệu của app đã cài). Cấp quyền Trợ năng cho bản dev nếu macOS hỏi (dòng mời trên thanh phụ đề). **Hỏi chủ dự án trước khi chạy gì trên máy họ.**
(b) Tạo cuộc họp Teams thử (chủ phòng là app Teams cài trên máy; hai khách vào bằng trình duyệt, đặt tên hiển thị **tên giả**, ví dụ "Khach An", "Khach Binh"). Kịch bản 10 phút: hai khách luân phiên đọc theo lịch (mỗi lượt 8–12 s, nghỉ 1–3 s; khoảng 8 lượt mỗi người, thêm hai đoạn nói chồng ngắn). Ghi **giờ đồng hồ** bắt đầu và kết thúc từng lượt vào `$DATA/a-spk3/lich.json` theo mẫu `[{"name": "Khach An", "start": "14:02:10", "end": "14:02:21"}, …]` (khách đọc từ một tờ kịch bản có đồng hồ; hay chạy `date +%T` ở máy khách khi bắt đầu từng lượt).
(c) Dịch cuộc họp bằng bản dev (âm thanh máy). Cuối buổi, dùng "Sao chép tất cả" ở bản chép lời (mọi gói) hay xuất TXT (Pro) và dán vào `$DATA/a-spk3/chep-loi.txt`.
(d) Chấm: `python3 -I $W/bench/2026-10-26-nguoi-noi/score_names_export.py $DATA/a-spk3/chep-loi.txt $DATA/a-spk3/lich.json`.
Expected: `"pass": true`, `correct_rate` ≥ 0,90 và `wrong_rate` ≤ 0,05 (spec §12 A-spk3). Chạy lại ít nhất **ba cuộc họp** (hai tài khoản khác nhau, một lần có bảng People mở, một lần đóng); số liệu từng lượt vào biên bản. Không đạt: **không bật** cho Teams (chỉnh công thức `recipes:update` rồi đo lại; kế hoạch 04 QĐ 14, 25: thà "Người N"), và ghi lý do. Kết quả thiếu dòng nhãn (nhiều `none` hay `generic`) nghĩa là bộ đọc không đủ chắc, chấp nhận được nếu `wrong_rate` ≤ 0,05 (ưu tiên 2).

- [ ] **Step 3: A-spk6 (họp thật tiếng Việt ≥ 3 người)**

Chủ dự án tổ chức một cuộc họp Teams thật tiếng Việt với ít nhất 3 người (đồng nghiệp tự nguyện, thông báo trước là có phụ đề tên người; **không** dùng cuộc họp có người ngoài chưa biết), dịch bằng bản dev. Đánh giá ngay: tên đúng/sai, nhãn "Người N" có hợp lý, phụ đề có chậm hơn thường không (ưu tiên 1), thanh phụ đề dễ đọc. Chủ dự án ghi "đạt/chưa đạt" và nhận xét vào biên bản (không ghi tên người thật vào repo). Có tên sai thì chụp lại cây giao diện bằng `ax-record fixture teams …` cho 04b/06 (mục 15.2) rồi sửa công thức.

- [ ] **Step 4: A-spk4 và A-spk5 với Teams thật bị đọc**

Cùng cuộc họp ở Step 2 (hay cuộc họp mới), chạy `latency-bench session` ngoại tuyến **song song** với việc Teams đang bị bộ đọc thật đọc: chạy lại pha `s2` của Task 8 với `--speaker-names-recipe $W/scripts/speaker-recipes/recipes.json` (công thức thật, không phải `khong-app`) trong khi cuộc họp Teams mở, hai khách đang nói. So bảng chênh với Task 8 và đo phần tốn của Teams bằng `rus` (`$B/tro-nang/rus.swift`, bản dựng `$DATA/bin/rus`): `$DATA/bin/rus speaker-worker MSTeams` hai lượt (đọc bật/tắt) như `$B/results/teams-chrome.md`. Mức đạt: A-spk4 vẫn đạt; `speaker-worker` ≤ 8% một lõi (theo số lệnh, năng lượng); Teams thêm ≤ ~0,45 W ở nhịp 4 lần/giây (số đo kế hoạch 01), không chậm rõ khi họp. Số liệu vào biên bản "A-spk3" (đổi tên mục thành "A-spk3, A-spk4, A-spk5, A-spk6 với Teams thật").

- [ ] **Step 5: Mốc kiểm**

Biên bản có: bảng ba cuộc họp A-spk3, nhận xét A-spk6, bảng A-spk4/5 với Teams. Commit cục bộ (Claude, nếu được phép): `cd $W && git branch --show-current && git add bench/2026-10-26-nguoi-noi/score_names_export.py bench/2026-10-26-nguoi-noi/test_score_names_export.py bench/2026-10-26-nguoi-noi/results/07-nghiem-thu.md && git commit -m "feat(speaker): bộ chấm A-spk3 từ bản chép lời, kết quả nghiệm thu với Teams thật"`. Đạt A-spk3 là **điều kiện của Task 22**; A-spk6 là của chủ dự án.

### Task 19: Windows i5, quyết `SHIPS_ON_WINDOWS` (chủ dự án chạy gói; Claude đọc kết quả)

Không chặn 0.3.2 (mặc định Windows tắt). Chỉ làm khi chủ dự án muốn bật Windows ở bản này hay bản kế.

- [ ] **Step 1: Gói chạy trên máy Windows i5** (có sẵn ở `$DATA/win-pack` và `$DATA/win-pack-02`, hướng dẫn trong gói và `$B/results/02-windows.md`, `05-windows.md`; Claude dựng lại gói với bản `speaker-worker` mới bằng `scripts/release/build-sidecars-windows.mjs` nếu cần). Chủ dự án chạy, gửi lại kết quả: tốc độ nhúng và CPU (≤ 10% một lõi), RAM của B' và allocator Windows (≤ 250 MB), A-spk4 trên i5 (độ trễ bật/tắt như Task 8), bản ghi cây Teams bằng `uia-record` (05b Task 10), chi phí đọc (05b Task 12).
- [ ] **Step 2: Quyết định.** Chỉ khi **mọi** mức đạt (A-spk4 và A-spk5 trên i5; 05b Task 11 đạt ba tiêu chí của công thức Windows; Task 18 đã đạt ở macOS) thì đổi `SHIPS_ON_WINDOWS` thành `true` (và đăng công thức có mục Windows qua `recipes:update`) ở **bản phát hành đó**, kèm test `the_release_ships_on_the_audited_platforms_only` đổi theo (hằng đổi thì `assert_eq!(ships_on("windows"), SHIPS_ON_WINDOWS)` vẫn đúng). Không đạt thì giữ `false`; ghi lý do vào biên bản "Windows".
- [ ] **Step 3: Mốc kiểm.** Biên bản "Windows" có số thật hay ghi "chưa đo, giữ tắt". Website và chính sách đã nói "Windows chưa".

### Task 20: Pháp lý, chốt (chủ dự án)

- [ ] **Step 1: Hỏi luật sư** các câu ở `docs/legal/README.md` (câu hỏi đầu: dữ liệu sinh trắc học theo Luật 91/2025/QH15 và Nghị định 356/2025); ghi câu trả lời vào README (mục "Đã đối chiếu" hay cuối mục luật sư) và sửa chữ chính sách nếu luật sư yêu cầu (Claude sửa theo chỉ dẫn, chạy lại Task 10 Step 6).
- [ ] **Step 2: Chốt có sửa EULA 1.6 không** (mặc định có, hai câu; nếu không, hoàn nguyên bốn `old/new` ở Task 10 Step 4 và đổi Task 21 Step 2 chỉ đổi chính sách).
- [ ] **Step 3: Bản app ngủ có thể phát hành trước khi luật sư trả lời** (tính năng chưa chạy với ai); **đăng manifest có mục `speaker` (Task 22) chỉ sau khi chủ dự án xác nhận pháp lý** (ghi xác nhận vào biên bản).

### Task 21: Phát hành app 0.3.2 "ngủ" (chủ dự án ra lệnh; Claude chuẩn bị và kiểm)

Điều kiện: Task 16, 17 xong; Task 18 Step 2 đạt (A-spk3); Task 20 Step 2 đã chốt. Quy trình mục 2 của `docs/release/phat-hanh.md`, **và mục 16.2**. Mọi bước dưới đây **hỏi chủ dự án ngay trước khi chạy** (AskUserQuestion): (1) đổi ngày hiệu lực và nâng bản; (2) đẩy `main`; (3) đẩy tag `v0.3.2` (tự đăng R2 stable, mọi app tự cập nhật, không hoàn tác).

- [ ] **Step 1: Đồng bộ với `main`**

Run: `cd $M && git fetch origin && git branch --show-current && git status --short | head -3 && git log --oneline HEAD..origin/main | head`
Expected: `main`, sạch, không commit mới trên `origin/main` ngoài thứ đã biết. Có commit mới thì dừng, báo (cần gộp lại và chạy lại Task 15 Step 1).

- [ ] **Step 2: Ngày hiệu lực chính sách 1.9 và EULA 1.6 (trước khi nâng bản)**

Ngày phát hành, giờ Việt Nam (dòng phiên bản hiện là chính sách 1.8 ngày 25/10/2026, EULA 1.5; kiểm `head -3 docs/legal/*.md` trước):
```bash
cd $M && VI=$(TZ=Asia/Ho_Chi_Minh date +%d/%m/%Y) && EN=$(TZ=Asia/Ho_Chi_Minh LC_ALL=C date +"%-d %B %Y") && ISO=$(TZ=Asia/Ho_Chi_Minh date +%F) && echo "$VI | $EN | $ISO" \
 && sed -i '' "s|^\*\*Phiên bản 1\.8, hiệu lực từ 25/10/2026\.\*\*$|**Phiên bản 1.9, hiệu lực từ $VI.**|" docs/legal/privacy.vi.md \
 && sed -i '' "s|^\*\*Version 1\.8, effective 25 October 2026\.|**Version 1.9, effective $EN.|" docs/legal/privacy.en.md \
 && sed -i '' "s|^\*\*Phiên bản 1\.5, hiệu lực từ 25/10/2026\.\*\*$|**Phiên bản 1.6, hiệu lực từ $VI.**|" docs/legal/eula.vi.md \
 && sed -i '' "s|^\*\*Version 1\.5, effective 25 October 2026\.|**Version 1.6, effective $EN.|" docs/legal/eula.en.md \
 && head -3 docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/eula.vi.md docs/legal/eula.en.md | /usr/bin/grep -E "Phiên bản|Version"
```
Expected: bốn dòng 1.9/1.6 và ngày hôm nay. `docs/legal/README.md`: dòng đầu đổi `**EULA phiên bản 1.5 và chính sách quyền riêng tư phiên bản 1.8 (cùng hiệu lực từ 2026-10-25)**` thành `**EULA phiên bản 1.6 và chính sách quyền riêng tư phiên bản 1.9 (cùng hiệu lực từ <ISO>)**` và dòng "Mặc định đã chọn" (đọc nguyên văn trước khi sửa) sang `<ISO>`. Test website: tìm bằng `/usr/bin/grep -n "Phiên bản 1.8\|Version 1.8\|Phiên bản 1.5\|Version 1.5\|chính sách 1.8\|EULA 1.5" website/test/site.test.mjs` và đổi sang 1.9/1.6 đúng như Task 12 Step 3 của kế hoạch nguồn micro 04 (các mảng `viNeeds`, `enNeeds` của test điều khoản và chính sách; khối "EULA lên 1.5 và chính sách lên 1.8" thành 1.6/1.9 với `iso < "2026-10-28"`). Chạy `cd website && pnpm test 2>&1 | /usr/bin/grep -E "^# (pass|fail)"` → `# fail 0`; `git grep -n "25/10/2026\|25 October 2026" -- docs/legal` chỉ còn ở dòng lịch sử của README. Commit: `chore(legal): EULA 1.6 và chính sách 1.9 hiệu lực từ ngày phát hành 0.3.2`.

- [ ] **Step 3: Nâng 0.3.1 → 0.3.2 (đúng bốn file)**

Sửa `package.json` (`"version": "0.3.2"`), `src-tauri/Cargo.toml` (`version = "0.3.2"` của package `meeting-translator`), `src-tauri/tauri.conf.json` (`"version": "0.3.2"`), `Cargo.lock` (khối `meeting-translator`).
Run: `cd $M && cargo metadata --locked --format-version 1 >/dev/null && git diff --stat && /usr/bin/grep -rn '"0.3.2"\|version = "0.3.2"' package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json Cargo.lock | wc -l`
Expected: thoát 0; bốn file đổi, mỗi file một dòng; đếm `4`. Commit: `chore(release): nâng phiên bản 0.3.1 → 0.3.2`. (`speaker::SHIPS_ON_WINDOWS` đã quyết ở Task 19.)

- [ ] **Step 4: Đẩy `main`, chờ CI** (hỏi trước). `git push origin main`; chờ CI của commit nâng bản bằng Monitor (vòng `gh run view <id> --json status,jobs` mỗi 60 giây, **kiểm từng job**, không đẩy gì thêm vì CI hủy lượt cũ). Đỏ: đọc log, sửa, quay lại.

- [ ] **Step 5: Đẩy tag** (hỏi trước). `SHA=$(git rev-parse HEAD) && git log --oneline -1 && git tag v0.3.2 "$SHA" && git push origin v0.3.2`. Chờ workflow `Release` (~50 phút, 12 job); `dig @8.8.8.8 releases.aitranslator.vn +short` có IP trước khi chạy lại job đăng nếu đỏ vì DNS.

- [ ] **Step 6: Kiểm R2 và SHA-256**
```bash
curl -s https://releases.aitranslator.vn/stable/latest.json | head -c 300; echo; curl -s https://releases.aitranslator.io.vn/stable/latest.json | head -c 120; echo
```
Expected: cả hai `"version":"0.3.2"`. Tải `.dmg` và `.exe` từ `https://releases.aitranslator.vn/0.3.2/`, đổi `%20` thành dấu cách trong tên, `shasum -a 256 -c` với `SHA256SUMS-macos.txt`, `SHA256SUMS-windows.txt` → `OK`.

- [ ] **Step 7: Kích thước, giấy phép và "ngủ"** (chỉ đọc; không chạy app của chủ dự án nếu không hỏi)

`ls -l` hai file: `.dmg` ≈ 11 MB và `.exe` ≈ 22,6 MB (≤ 60 MB; ước tính Task 6 Step 5). Gắn `.dmg` chỉ-đọc (`hdiutil attach -readonly -nobrowse`), kiểm `Info.plist` 0.3.2, chữ ký app nguyên vẹn, `grep -c "3D-Speaker" "<…>/AI Translator.app/Contents/Resources/THIRD_PARTY_NOTICES.txt"` ≥ 1, `strings -a <file chạy> | grep -c "AI_TRANSLATOR_DEV_SPEAKER"` ra `0`, không tên miền cũ; gỡ gắn. **Kiểm "ngủ":** chủ dự án cập nhật bản của mình lên 0.3.2 (bản đã cài, không phải bản dev), mở Cài đặt › Phụ đề (không có nhóm "Người nói"), dịch một phiên ngắn: log (`speaker-worker.log` không được tạo; dòng `nhận giọng: chưa có model, phiên này không bật`) và proxy hay `nettop` không thấy kết nối tới `releases.aitranslator.vn/speaker/`. Ghi vào biên bản "Phát hành".

- [ ] **Step 8: GitHub Release** (hỏi trước): job `github-release` tạo bản nháp; viết ghi chú vi + en ngắn: "bản cập nhật nền cho tính năng phân biệt người nói (chưa bật); chính sách quyền riêng tư 1.9 và EULA 1.6", rồi `gh release edit v0.3.2 --draft=false --latest --notes-file <file>`. **Ghi chú không nêu công nghệ lõi.**

- [ ] **Step 9: Mốc kiểm.** Biên bản "Phát hành" có: commit, tag → SHA, R2 hai tên, SHA khớp, kích thước thật, kết quả kiểm "ngủ". **Website chưa deploy** (Task 23). Dọn: tắt mọi tiến trình nền, tắt `AI_TRANSLATOR_DEV_SPEAKER` trong `.env` nếu đã bật ở Task 18 (không để lọt vào build nào khác).

### Task 22: Bật, đăng model và manifest (chủ dự án chạy; Claude kiểm)

Điều kiện: Task 21 xong và bản 0.3.2 ổn ít nhất một ngày; A-spk3 đạt (Task 18); chủ dự án xác nhận pháp lý (Task 20 Step 3); công thức đã đăng (Task 17). **Hỏi chủ dự án ngay trước bước đẩy manifest (không hoàn tác ngay được: chỉ gỡ được bằng manifest số mới).** Làm đúng runbook mục 16.3.

- [ ] **Step 1: Dựng phần thân (Claude, ở thư mục chính, nhánh `main` sạch)**

Run: `cd $M && git branch --show-current && git status --short | head -3 && node scripts/models/speaker-manifest.mjs add --file $DATA/models/eres2net-sv-en-voxceleb-16k.onnx --min-app-version 0.3.2 && git status --short scripts/models`
Expected: in `models/speaker/beffe43e7027/eres2net-sv-en-voxceleb-16k.onnx`, SHA-256 `beffe43e…043e`, `26496496 byte`, `Đã ghi …/body-4.json (manifest số 4, trước đó số 3)` (số thật có thể lớn hơn nếu `models:update` đã đăng thêm manifest: `ls scripts/models/released` và kiểm `curl -s https://releases.aitranslator.vn/models/models.json` có `sequence` bằng số của `body` mới nhất trước lệnh); chỉ có file `released/body-<N+1>.json` mới.
- [ ] **Step 2: Đặt model lên R2 (chủ dự án)**: hai lệnh `wrangler r2 object put` của mục 16.3 (model và `3D-Speaker-LICENSE.txt`); kiểm SHA-256 qua URL công khai bằng lệnh `curl … | shasum -a 256` (phải `beffe43e…043e`).
- [ ] **Step 3: Commit, đẩy, ký (chủ dự án ra lệnh)**: commit `chore(models): manifest số <N+1> có model nhận giọng`, đẩy `main`, chờ CI xanh; chạy workflow `Sign model manifest` (`body=scripts/models/released/body-<N+1>.json`, `previous=…/body-<N>.json`; job `check` chạy `check_manifest_body`); tải artifact `models-manifest`.
- [ ] **Step 4: Đăng `models.json` đã ký lên R2** như mục 13 (lệnh sao lưu bản cũ trước); kiểm: `curl -s https://releases.aitranslator.vn/models/models.json` giải mã `body` có `"speaker"`; app 0.3.2 của chủ dự án nhận manifest tối đa sau khoảng 25 giờ (app kiểm manifest tối đa một lần mỗi 24 giờ, `source::CHECK_EVERY_SECS`, và nhớ lần kiểm cuối trong kho model nên khởi động lại app KHÔNG ép kiểm; chưa có cách kiểm ngay ở bản phát hành, phải chờ), Cài đặt › Phụ đề hiện nhóm "Người nói" (ghi chú tải rồi hết ghi chú); model chỉ tải nền ở phiên dịch đầu tiên sau khi có manifest (phiên đó log `nhận giọng: chưa có model, phiên này không bật`), từ phiên dịch sau mới có "Người 1", "Người 2"; log có `nhận giọng: bật cho phiên này` và `công thức đọc tên: …`.
- [ ] **Step 5: A7 với tính năng bật**: chạy A7 bằng proxy trên bản đã cài (không phải bản dev) ở chế độ có người nói theo `bench/phase1/acceptance/RUNBOOK-mac.md` (cập nhật `a7-allow.json`: thêm `"/speaker/recipes.json"` cho `releases.aitranslator.vn` với `during_session: true` và đường dẫn model nếu proxy thấy; **không thêm host mới**: `speaker-worker` không có mạng nên mọi kết nối là của tiến trình chính). Mức đạt: không kết nối ngoài danh sách; không âm thanh, chữ chép lời, tên người trong thân request; từ mồi `canaries` không xuất hiện. Ghi `bench/phase1/results/acceptance/a7-mac-nguoi-noi.{md,json}`.
- [ ] **Step 6: Mốc kiểm.** Biên bản "A7 (Task 22)" có kết quả. **Có kết nối lạ hay tên người trong request: tắt khẩn ngay (mục 16.5, lớp 2), báo.**

### Task 23: Website, deploy và kiểm (chủ dự án chạy `pnpm deploy`; Claude kiểm)

Chỉ sau Task 22 (tính năng đã có với người dùng) và A7 đạt.

- [ ] **Step 1: Cập nhật câu "chưa đo bằng proxy" (Claude)**: sửa các trang `data-security.mjs` năm ngôn ngữ: bỏ câu "not measured with the proxy yet" (Task 12 Step 4), thêm một gạch đầu dòng vào danh sách "How did we check that?" với kết quả A7 thật (ngày đo, bản, máy, số yêu cầu, điều kiện; chỉ macOS, một máy), và đổi test `needData` của Task 12 (cụm "chưa đo bằng proxy" / "not measured with the proxy yet" thành cụm mới); sửa callout "Limits of this test" nếu cần. Chạy `cd $W/website && pnpm test` → `# fail 0`. Commit.
- [ ] **Step 2: Deploy (chủ dự án)**: `cd website && pnpm test && pnpm deploy` (build lấy 0.3.2 từ R2). Hỏi trước.
- [ ] **Step 3: Kiểm bản chạy thật (Claude)**: `curl -s https://aitranslator.vn/chinh-sach-quyen-rieng-tu/ | /usr/bin/grep -c "Phiên bản 1.9"`; `curl -s https://aitranslator.vn/huong-dan/thanh-phu-de-va-phim-tat/ | /usr/bin/grep -c 'id="nguoi-noi"'`; `curl -s https://aitranslator.vn/en/faq/ | /usr/bin/grep -c "names of the people speaking"`; `curl -s https://aitranslator.vn/ve-chung-toi/ | /usr/bin/grep -c "Phân biệt ai đang nói trong phụ đề"` ra `0`; `sitemap` có đủ trang; `install.sh`/`install.ps1` ghim 0.3.2 và SHA khớp R2.

### Task 24: Theo dõi, tắt khẩn, dọn (chủ dự án và Claude)

- [ ] **Step 1: Theo dõi 7 ngày**: Web Admin tab **Bộ đọc tên**; email `speaker_health_degraded` và `speaker_canary_failed`; báo cáo lỗi mới liên quan `speaker-worker`/`asr-worker`; hỗ trợ (chat, email). Ngưỡng và cách làm ở runbook 15.4 và 16.5.
- [ ] **Step 2: Điều kiện tắt khẩn** (ví dụ: tên sai được báo; phụ đề chậm đi; kết nối lạ): làm lớp 1 hay 2 của mục 16.5 trước, rồi tìm nguyên nhân; không gỡ bản app.
- [ ] **Step 3: Memory và dọn.** Cập nhật `memory/phan-biet-nguoi-noi-research-2026-10-26.md` và tạo `memory/release-0-3-2-<ngày>.md` theo mẫu các bản trước (tag → commit, R2, SHA, website, bật ngày nào, còn gì); dòng trong `MEMORY.md`; tắt tiến trình nền đã mở; hỏi chủ dự án có xóa worktree `phan-biet-nguoi-noi` không (không tự xóa); xóa `$DATA/plan07-tmp/` nếu còn.

---

## Phủ spec

| Mục spec | Yêu cầu | Task |
|---|---|---|
| §1 | thứ tự ưu tiên: tốc độ, đúng tên (thà "Người N"), bảo mật | QĐ của file 07; Task 8 (A-spk4), 18 (A-spk3), 7 và 22 (A-spk7, A7) |
| §1 | mọi gói dùng được; tên trong Lịch sử và xuất file theo Pro; bật sẵn cả hai phần | Task 2 (công tắc), 10, 12 (chữ pháp lý và website) |
| §1 | macOS và Windows phát hành cùng lúc | **Khác có chủ ý** (QĐ 2): Windows tắt bằng `SHIPS_ON_WINDOWS` tới khi có số đo; Task 19 |
| §2 | không extension; Meet, Zoom bản cài, Teams bản cài | công thức build sẵn chỉ Teams; Task 3, 11, 12 nói đúng phạm vi |
| §4.5 | model nhận giọng ở khóa gốc `speaker`, host R2, SHA-256, `min_app_version`; app cũ bỏ qua | Task 4 (script, giấy phép), Task 22 (đăng); app 0.3.1 đã kiểm ở kế hoạch 01 |
| §4.5 | tải cùng gói model đang dùng; chưa có file thì tắt lặng lẽ | đã có (02); Task 2 (`speaker_offered`: ngủ khi manifest chưa có mục) |
| §10 | không bí mật mới; thay worker; không mã mạng; công thức độc; phụ thuộc mới qua `cargo deny`, `cargo audit`, bản mới nhất | Task 1 (bốn thư viện, deny, audit, không mạng), Task 7 Step 4, Task 6 Step 3 |
| §10 | quyền mới: không entitlement mới; `overlay` chỉ thêm `open_speaker_settings` | Task 7 Step 4 (`acl_tests`) |
| §10 Pháp lý | chính sách lên bản mới (vi, en): phân tích giọng tạm thời, không lưu, không gửi, đọc tên, chỉ lưu khi bật Lưu lịch sử, trợ năng; EULA chỉ đổi khi cần; luật sư; website chỉ nói điều có thật | Task 10, 11, 12, 20; ngày hiệu lực Task 21 |
| §11 | A-spk4 (A2 p50 ≤ +20, p90 ≤ +50, chữ đầu ≤ +20 ms) | Task 8 (M4 Pro, ứng viên), Task 18 Step 4 (Teams đang bị đọc), Task 19 (i5) |
| §11 | tải ≤ 8% một lõi, RAM ≤ 250 MB; soak ≥ 1 giờ; quá tải tạm dừng đọc tên | Task 9 (soak), Task 18 Step 4 |
| §12 | A-spk1, A-spk2 (nhận giọng offline, tiếng Việt) | Task 7 |
| §12 | A-spk3 (tên thật ≥ 90%, sai ≤ 5%) | Task 18 (bộ chấm, ba cuộc họp Teams); Meet, Zoom: ngoài phạm vi 0.3.2 |
| §12 | A-spk5, A-spk6, A-spk7 | Task 9 và 18 (A-spk5), Task 18 Step 3 (A-spk6), Task 7 Step 4 (A-spk7) |
| §13 mục 7 | chính sách, spec chính, website năm ngôn ngữ, nghiệm thu, phát hành | Task 10–15 (làm), 16–24 (phát hành) |
| §14 | Windows chưa đo; hai người giống giọng bị gộp; Teams, Meet đổi giao diện | Task 19; chữ website nói giới hạn (Task 11, 12); công thức tải từ xa và tắt khẩn (runbook 16.5) |
| §15 | sửa spec chính: D1, F13, §3.2, §3.3 (A-spk1–7), §5, §6.3, §6.6, §7, §8, §10.1, §10.2 | Task 13 |
| 02 hứa | đăng model và mục `speaker`; `pnpm models:update` giữ khóa `speaker`; LICENSE, NOTICE trong THIRD_PARTY_NOTICES | Task 4, 22 |
| 02 hứa | nâng `libc` 0.2.191, `sha2` 0.11.1 (và `serde_json` 1.0.154, thêm `realfft` 3.5.1) | Task 1 |
| 02, 03 hứa | thêm `speaker::`, `db::` vào test bản release của `release.yml` | Task 5 |
| 02 hứa | mở `speaker::enabled()` cho bản phát hành; gốc rễ ghi chú (b) khóa bảo trì khi tải model, (d) tải cùng gói | Task 2 (mở công tắc, ngủ); (b), (d): xem "Để kế hoạch sau" |
| 03 hứa | cờ dev `AI_TRANSLATOR_DEV_SPEAKER` thành tính năng thật, chống lọt | Task 2, QĐ 4, Task 6 Step 2 |
| 04 hứa | chính sách nói đúng trợ năng Teams và trình duyệt; nghiệm thu A-spk3, A-spk5, A-spk6, A-spk7 | Task 10 (Teams; trình duyệt chưa vì Meet tắt), Task 18, Task 7 |
| 05b hứa | A-spk4 và A-spk5 trên i5; A-spk3 phần Windows | Task 19 (không chặn 0.3.2) |
| 06 hứa | chính sách nói công thức tải từ xa và báo cáo tình trạng; A7 trước khi bật; ngưỡng cảnh báo theo số liệu thật (sau) | Task 10, 22 Step 5; ngưỡng: "Để kế hoạch sau" |
| quy trình | 5 bước của `docs/release/phat-hanh.md` mục 2, mục 15 | Task 21, 22, 23; runbook mục 16 (Task 14) |

## Để kế hoạch sau

- **Windows bật tính năng** (đổi `SHIPS_ON_WINDOWS` và đăng công thức có mục Windows) khi Task 19 đạt: bản phát hành kế tiếp.
- **Meet và Zoom vào công thức** (kế hoạch 04 QĐ 16, 32; 05b): chỉ khi có bản ghi thật đạt tiêu chí; khi đó sửa chữ app (Task 3), website, chính sách (chế độ trợ năng của trình duyệt trả sau 30 giây, spec §6.8) và bản app kế.
- **Gốc rễ ghi chú (b) của kế hoạch 02:** `download_speaker_model` giữ khóa bảo trì (`begin_work`) suốt lúc tải, nên người dùng bấm tải gói model lúc đó gặp `modelsBusy` (`src-tauri/src/models/service.rs`): đã có ghi chú "đang tải" nhìn thấy (03); sửa gốc rễ (tải không giữ khóa) khi có báo cáo thật, vì model chỉ 26 MB và tải nền một lần.
- **Ghi chú (d) "tải cùng gói model đang dùng":** hiện app tải model nhận giọng ở phiên dịch đầu tiên sau khi manifest có mục (nền), không tải trong job tải gói; chấp nhận (một lần, 26 MB).
- **Trang chủ và Tính năng nhắc "Người nói"; ảnh chụp** (`scripts/ui-preview/shoot.mjs` với `speakers=1`, tên giả): sau khi có kết quả họp thật và chủ dự án muốn nêu trong marketing; cần cảnh mới và năm mục `manifest.json`.
- **Số đo chính xác trên website** (A-spk1, A-spk2 kèm điều kiện đo): chưa đăng; cần chủ dự án quyết có nêu không.
- **Ngưỡng cảnh báo `speaker_health`** (30%, 5 báo cáo, 3 ngày) chỉnh theo số liệu thật sau 2 tuần bật.
- **Hợp nhất vòng `tick` của `reader::macos` và `reader::uia`** (kế hoạch 05b, 06): sau khi cả hai chạy với app thật.
- **Kiểm tra tự động ở mức cả app** (06 QĐ 13): chỉ nếu họp thật cho thấy bộ đọc đúng mà ghép tên sai.
- **Tách một giọng bị gộp bằng tay**; **tìm theo tên người nói** trong bản chép lời; **bỏ một lần gộp tay**.
- **Gửi mẫu gỡ lỗi khi tên sai** (người dùng bấm báo "tên sai"): chưa có thiết kế; chỉ sau khi có phản hồi thật.
- **Hỏi lại khi điều khoản đổi phiên bản** (EULA 1.6, chính sách 1.9): chưa có cơ chế (README, câu hỏi luật sư "Người dùng cũ chưa thấy EULA 1.3"); mặc định như các đợt trước.
- **`pnpm outdated` npm:** nâng gói npm là đợt riêng.

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| **A-spk3 với Teams thật chưa có số**: bộ đọc macOS chưa thử với app thật khi viết kế hoạch (04b Task 19–21 chờ chủ dự án); Teams đổi giao diện; Meet, Zoom, Windows chưa | Task 18 là điều kiện của Task 22 (bật); không đạt thì không bật cho Teams; tắt từ xa bằng công thức rỗng (nhẹ) hay manifest bỏ `speaker` (nặng); công thức sửa không cần phát hành app (mục 15.2) |
| **Windows i5 chưa đo** (tốc độ, RAM B' và allocator, UI Automation, A-spk4) | Tắt bằng hằng `SHIPS_ON_WINDOWS` ở 0.3.2; Task 19 không chặn; trang web và chính sách nói "Windows chưa" |
| **Luật sư chưa trả lời** (dữ liệu sinh trắc học, tên người tham dự) | Bản app "ngủ" phát hành trước; Task 22 (bật) chờ xác nhận pháp lý; nội dung viết theo thiết kế "không lưu, không gửi, không xác định danh tính"; nếu luật sư đòi đồng ý riêng thì sửa thiết kế (tắt mặc định) trước khi bật |
| **Nâng `libc`, `sha2`, `serde_json`, `realfft` đổi `Cargo.lock` của mọi binary phát hành**; `realfft` ảnh hưởng fbank | Task 1: build lại và test toàn workspace, fbank so `kaldi-native-fbank`, nhúng so onnxruntime, B' giống từng bit, deny, audit, không mạng, chéo Windows; hỏng thì giữ phiên bản cũ của thư viện đó và ghi lý do |
| **Tiến trình phụ thứ ba làm phụ đề chậm hoặc máy yếu nóng** (ưu tiên 1) | A-spk4 đạt trên M4 Pro (Task 8, 18); kênh 4 đoạn bỏ khi đầy, không bao giờ chờ; quá tải thì tạm dừng đọc tên rồi tắt; i5 chưa đo nên Windows tắt; tắt khẩn có ba lớp |
| **Sai tên** (ưu tiên 2) | Luật ghép tên chặt (≥ 60%, ≥ 3 s, ≥ 2 đoạn; bỏ tên khi dưới 50%; giọng nghi gộp không nhận tên trội); A-spk3 sai ≤ 5%; thà "Người N"; người dùng đổi tay; website nói giới hạn |
| **Quyền Trợ năng mất sau mỗi bản cập nhật (ký ad-hoc)** | Dùng chung nút `tccutil reset` và dòng mời (đã có từ 0.1.14); chữ chính sách và website nói đúng; không có Developer ID (điều kiện cố định) |
| **Bật chế độ trợ năng của Teams** làm Teams tốn thêm | Bật mà không đọc không tốn đo được; nhịp mặc định 1 lần/giây; chính sách nói thẳng "còn bật tới khi Teams khởi động lại"; chủ dự án đo ở Task 18 Step 4 |
| **Model 26 MB tải nền ở lần dùng đầu** (người dùng nghĩ app nặng; mạng yếu) | Chỉ khi manifest có mục; tải nền, phiên dịch không chờ; Cài đặt ghi "đang tải"; kiểm SHA-256; chưa có file thì tắt lặng lẽ (phụ đề bình thường) |
| **Giấy phép model** (Apache-2.0 nguồn 3D-Speaker và sherpa-onnx) chưa kiểm hết dòng bản quyền | Task 4 Step 2: đọc nguồn thật, không đoán tên chủ bản quyền; thiếu thì dừng, không phát hành model |
| **`models:update` về sau làm mất mục `speaker`** | `bumpBody` giữ khóa gốc; test `speaker-manifest.test.mjs` khóa lại; `check_manifest_body` kiểm mục `speaker` hợp lệ trong CI ký |
| **Manifest đăng sai thứ tự** (manifest trước model) | Runbook 16.3 ghi rõ: model lên R2 và đúng SHA-256 **trước** manifest; app từ chối model sai SHA-256 và tắt lặng lẽ |
| **Website nói điều chưa đúng** (đăng trước khi bật) | Website chỉ deploy ở Task 23 sau Task 22 và A7; test `STALE_SPEAKER`, `CORE_TECH`, đối chiếu chữ app; câu "chưa đo bằng proxy" tới khi A7 xong |
| **Ngày hiệu lực pháp lý lệch app và website** (README, "Đổi ngày hiệu lực") | Đổi một lần ở Task 21 Step 2 trước khi build; website deploy sau (ngày hiệu lực không muộn hơn ngày deploy: test sitemap) |
| **Hai tag gần nhau làm job `publish` bị hủy** (`concurrency`) | Mỗi lần một tag; chờ `publish` xong (runbook mục 2); không có tag thứ hai trong kế hoạch này |
| **CI Windows đỏ vì test `speaker::` chỉ macOS** khi chạy bản release | Task 5 Step 3 rà `cfg`; `check-windows.sh` (Task 1) biên dịch chéo `--all-targets`; nếu đỏ ở Windows CI thì sửa cổng `cfg` của test (không đổi hành vi) |
| **Máy này còn ~23 GiB trống; build release cần ≥ 18 GiB** | Cổng đĩa ở mọi lệnh nặng; dừng và báo chủ dự án, không tự dọn |
| Số test "mong đợi" là số đo ở `06-van-hanh.md` | Lệch thì ghi số thật; đổi hành vi thì dừng, báo |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác.

1. **Số bản app:** mặc định **0.3.2** (`origin/main` 0.3.1, tag mới nhất `v0.3.1`; Task 0 kiểm lại). Cách khác: số khác nếu có bản chen vào.
2. **Cách phát hành:** mặc định **stable 0.3.2 "ngủ", rồi bật bằng manifest** (Task 21 rồi 22): mỗi bước có rút lui riêng, ngày hiệu lực pháp lý tách khỏi ngày bật. Cách khác: **beta `0.3.2-beta.1` trước** (kênh beta tự chọn; chính sách phải hiệu lực trước bản đầu tiên có mã tính năng, kể cả beta; hai lần build 50 phút); hay **bật ngay** (đăng manifest trước app).
3. **Windows:** mặc định **tắt ở 0.3.2** (`SHIPS_ON_WINDOWS = false`), bật khi Task 19 đạt (bản kế). Cách khác: bật ngay cả Windows chỉ nếu chủ dự án đã chạy gói i5 và A-spk4/A-spk5 đạt.
4. **Meet và Zoom:** mặc định **ngoài công thức** (chỉ Teams), chữ app và website chỉ nói Teams. Cách khác: chờ bản ghi thật rồi bật qua `recipes:update` (sửa chữ ở bản app kế).
5. **Nâng `libc`, `sha2`, `serde_json`, `realfft`:** mặc định **có** (Task 1; CLAUDE.md đòi bản mới nhất). Cách khác: để đợt cập nhật phụ thuộc chung (vi phạm quy tắc "bản ổn định mới nhất" của CLAUDE.md, như 02 và 06 đã ghi).
6. **Sửa EULA 1.6** (hai câu: kết quả có thể sai; tên người tham dự là dữ liệu cá nhân của người khác): mặc định **có**. Cách khác: chỉ sửa chính sách (spec §10: "EULA không đổi trừ khi rà soát thấy cần").
7. **Hỏi luật sư trước khi bật** (spec §10): mặc định **có, và bản app ngủ phát hành trước**; chỉ đăng manifest sau khi chủ dự án xác nhận pháp lý. Cách khác: bật ngay không chờ luật sư (rủi ro pháp lý do chủ dự án chịu).
8. **Bật mặc định hay hỏi:** mặc định **bật sẵn cả hai phần** (spec §1). Cách khác: tắt mặc định, người dùng tự bật ở Cài đặt (an toàn hơn về quyền riêng tư, gần như không ai bật).
9. **Công tắc dev `AI_TRANSLATOR_DEV_SPEAKER`:** mặc định **giữ nguyên ở bản debug** (bản phát hành không đọc biến môi trường). Cách khác: bỏ hẳn công tắc và dùng `SHIPS_ON` ở bản debug (đổi `.env` mẫu, `run-dev-app.sh`, test).
10. **Nhóm Cài đặt "Người nói" chỉ hiện khi manifest có mục `speaker`** (QĐ 3): mặc định **có**. Cách khác: luôn hiện (nút bật tắt lúc "ngủ" không có tác dụng).
11. **Website:** mặc định **deploy sau khi bật** (Task 23), không nêu số đo, không đổi Trang chủ và Tính năng. Cách khác: nêu số đo A-spk1, A-spk2 kèm điều kiện đo.
12. **Quyền commit cục bộ** cho phần A (điều phối viên xác nhận 2026-10-28; Task 0 Step 1 hỏi lại nếu cần). Mặc định: commit mỗi Task, không push, không gộp.
13. **Cách gộp nhánh vào `main`** (Task 16): `main` đã đi trước (commit website). Mặc định: merge commit (giữ lịch sử); cách khác: rebase nhánh lên `main` (chủ dự án chạy, đổi hash commit).
14. **Phát hành khi nào:** mặc định **chờ Task 17 và Task 18 (A-spk3) xong** trước Task 21; A-spk6 và Windows không chặn bản ngủ. Cách khác: phát hành bản ngủ ngay sau Task 16 (sớm hơn, chưa có số A-spk3 trước khi bật vẫn an toàn vì tính năng ngủ), rồi đo.
15. **Tắt khẩn:** mặc định **ba lớp** (công thức rỗng; manifest bỏ `speaker`; công tắc người dùng); chủ dự án quyết ngưỡng nào thì tắt (ví dụ ≥ 2 báo cáo tên sai trong ngày).
16. **Lịch cho các bước cần chủ dự án** (ước): Task 16 vài giờ (duyệt, gộp, chờ CI 30 phút); Task 17 khoảng 1,5 giờ (30 phút deploy + 1 giờ công thức); Task 18 khoảng nửa ngày (ba cuộc họp thử, một buổi họp thật, đo Teams); Task 19 khoảng 2–3 giờ trên máy Windows; Task 21 khoảng 1,5 giờ (50 phút Release); Task 22 khoảng 1 giờ (+ chờ 1 ngày trước); Task 23 khoảng 30 phút. Mặc định: 16, 17 rồi 18; 19 song song; 21 sau; 22 sau một ngày.
