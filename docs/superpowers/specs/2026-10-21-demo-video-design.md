# AI Translator: video giới thiệu Dịch live + Gõ dịch cho mạng xã hội — Design

**Ngày:** 2026-10-21
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-21 (các quyết định ở mục 0). Chỉ thêm công cụ dựng video
trong `scripts/demo-video/` và một chỗ móc nhỏ trong `scripts/ui-preview/tauri-mock.ts`; **không sửa code app, không sửa website**.
**Quan hệ với spec khác:** dùng lại giao diện thật của thanh phụ đề (spec 2026-10-10 dịch trong lúc nói §6) và ô Gõ dịch
(`2026-10-17-go-dich-design.md` §1) qua trang xem trước `scripts/ui-preview`; dữ liệu phụ đề lấy từ `latency-bench session`
(spec 2026-10-10 §8, §10.1), bản dịch Gõ dịch lấy từ `latency-bench mt-eval` (cùng hàm `pipeline::translate` mà Gõ dịch dùng,
xem `src-tauri/src/compose/worker.rs`). Quy tắc nội dung theo `website/README.md`: chỉ nói điều có thật, số đo kèm điều kiện đo,
không công bố công nghệ lõi.

---

## 0. Yêu cầu và quyết định của chủ dự án

- **Yêu cầu gốc:** video mô phỏng tính năng dịch live và tính năng Gõ dịch.
- **Nơi dùng:** mạng xã hội (TikTok, Reels, Facebook). Khung dọc **9:16, 1080×1920**, **có tiếng**, dài **30–60 giây**.
- **Người xem và ngôn ngữ:** người Việt. Dịch live: đối tác nói **tiếng Anh**, phụ đề **tiếng Việt**. Gõ dịch: gõ **tiếng Việt**,
  gửi đi **tiếng Anh**. Giao diện app và chữ chú thích trên video bằng tiếng Việt.
- **Giọng người nói:** giọng **Premium của macOS** (Ava hoặc Evan; chủ dự án tự tải trong Cài đặt › Trợ năng › Nội dung được nói).
  Chạy trên máy, không gửi gì ra ngoài.
- **Cách làm: "hình dựng, chữ thật"** (cách C; đã loại A quay màn hình app thật và B mô phỏng chữ tự viết):
  - hình do trang web dựng, gồm giao diện thật của thanh phụ đề và ô Gõ dịch;
  - chữ chép lời, chữ dịch và thời điểm từng dòng hiện ra đều do code thật của app tạo trên file giọng đọc.
- **Kịch bản** (mục 1) đã duyệt nguyên văn, gồm cả việc bật "Dịch trong lúc nói" và không dùng nhạc nền.
- **Cách dựng** (mục 2, 3) đã duyệt. **Trung thực, kiểm tra, phạm vi** (mục 4–7) đã duyệt.
- **Chi tiết thêm khi viết spec** (không có trong hội thoại duyệt; chủ dự án xem lúc đọc spec):
  - mọi sự kiện phụ đề cộng thêm 80 ms cho phần thu âm và hiển thị mà `latency-bench` không đo (mục 3.2);
  - bản dịch của Gõ dịch hiện dần trong đúng khoảng thời gian dịch đã đo (mục 3.3);
  - sau khi dán vẫn phải bấm Enter lần nữa mới gửi, đúng luồng thật (mục 1);
  - trang dựng cảnh có khung 540×960 điểm CSS ở mật độ điểm ảnh 2 (mục 2.4).
- **Chốt thêm khi viết kế hoạch** (2026-10-21, sau khi đọc code):
  - cỡ chữ mặc định của thanh phụ đề là 20 (không phải 28 như bản đầu); video đặt 24, trong khoảng 14–48 của Cài đặt › Phụ đề
    (mục 2.4);
  - nội dung quan trọng nằm trong vùng không bị giao diện TikTok/Reels che (mục 2.4);
  - hạ mẫu 48 → 16 kHz bằng bộ lọc tự viết trong Node thay cho `afconvert`, để hai file khớp nhau tuyệt đối về thời gian (mục 2.2);
  - thời gian ảo là đồng hồ tự cài vào mọi frame, không dùng thời gian ảo của Chrome (mục 2.5);
  - chấm "đang nghe" của thanh phụ đề và vòng sáng người nói theo mức âm lượng thật của giọng đọc (mục 2.2, 3.1).

## 1. Kịch bản (khung 1080×1920, 30 khung/giây, khoảng 50 giây)

Thời gian dưới đây là dự kiến. Độ dài thật của cảnh 1 theo độ dài giọng đọc cộng phần chờ dòng phụ đề cuối chốt xong.

| Thời gian | Cảnh | Hình | Tiếng |
|---|---|---|---|
| 0–3 s | Câu mở | Cửa sổ cuộc gọi (chưa ai nói). Dòng chữ lớn: *"Họp với đối tác nước ngoài mà nghe không kịp?"* | Im |
| 3–28 s | Dịch live | Cửa sổ cuộc gọi video **tự vẽ**, không giả Zoom/Meet. Ô người nói có ảnh đại diện chữ cái đầu, tên *"Sarah · Product Lead"*, vòng sáng khi đang nói. Bên dưới là **thanh phụ đề thật** của app: câu gốc tiếng Anh và bản dịch tiếng Việt; bật "Dịch trong lúc nói" (chữ dịch hiện nhạt trong lúc Sarah nói, đậm lên khi chốt). Chú thích trên: *"Phụ đề tiếng Việt hiện ra trong lúc đối tác đang nói"*; dòng nhỏ: *"Chạy trên máy, âm thanh không gửi lên cloud"* | Giọng tiếng Anh đọc 3–4 câu họp công việc (dời ngày ra mắt, xin báo giá mới) |
| 28–45 s | Gõ dịch | Khung chat **tự vẽ**, không giả Slack/Teams. Sarah nhắn một câu tiếng Anh. Hình phím ⌃⌥G được bấm, **ô Gõ dịch thật** mở ra. Câu tiếng Việt gõ dần từng chữ (ví dụ *"Dạ, em sẽ gửi báo giá mới trước thứ Sáu ạ"*); bản dịch tiếng Anh hiện trong ô. Enter: ô đóng, câu tiếng Anh vào ô nhập của chat. Enter lần nữa: tin nhắn được gửi. Chú thích: *"Gõ tiếng Việt, gửi đi tiếng Anh"* | Tiếng gõ phím nhẹ |
| 45–50 s | Kết | Tên *AI Translator*, dòng *"Dịch live + Gõ dịch · chạy offline"*, địa chỉ *aitranslator.vn*. Dòng chữ nhỏ: *"Phụ đề và bản dịch do app tạo ra; đo trên MacBook Pro M4 Pro, gói Chuẩn, bật Dịch trong lúc nói."* | Im |

- Câu tiếng Anh, tin nhắn của Sarah và câu tiếng Việt cụ thể viết trong `script.vi.json` (mục 2.1). Đổi câu thì chạy lại mục 3.
- Không nhạc nền: TikTok/Reels có kho nhạc riêng, chủ dự án tự thêm lúc đăng; tránh rủi ro bản quyền.

## 2. Thành phần

Tất cả nằm trong `scripts/demo-video/`. Kết quả trung gian và video ra `target/demo-video/` (không commit).

### 2.1 Kịch bản: `script.vi.json`

- Các câu tiếng Anh của Sarah, mỗi câu kèm khoảng nghỉ sau nó (ms).
- Tin nhắn chat của Sarah (tiếng Anh), câu trả lời tiếng Việt cần gõ.
- Các dòng chú thích, chữ màn kết, dòng điều kiện đo.
- Tên giọng đọc (ví dụ `Ava (Premium)`).

### 2.2 Giọng đọc

- `say -v <giọng>` đọc từng câu ra file 48 kHz. Script cắt khoảng lặng đầu cuối của từng câu, rồi ghép các câu với khoảng nghỉ
  đã khai thành **một** file 48 kHz cho video.
- Từ đúng file đó, script hạ mẫu ra WAV 16 kHz mono cho bộ máy dịch: lọc thông thấp FIR đối xứng (không làm trễ) rồi lấy 1
  trong 3 mẫu. Mẫu thứ n của file 16 kHz đúng là thời điểm của mẫu 3n của file 48 kHz, nên mốc câu khớp cả hai file.
- Ghi `truth.json` cùng định dạng `bench/phase0/data/latency/*.truth.json` (`id`, `lang`, `start_ms`, `end_ms`, `vad_end_ms`,
  `text`), tính từ độ dài từng câu và khoảng nghỉ.
- Ghi `scripts/demo-video/data/voice.<ngôn ngữ>.json` (commit): tên giọng, bản macOS, độ dài, mốc câu, mức âm lượng (RMS) mỗi
  100 ms, mã băm SHA-256 của file 48 kHz. Lúc dựng, file 48 kHz phải đúng mã băm này (tức là đúng file đã dùng để lấy chữ),
  không thì dừng.
- Giọng khai trong kịch bản chưa được cài thì **dừng và báo**, không tự dùng giọng khác.

### 2.3 Chữ thật

- **Dịch live:** `latency-bench session --streaming`, gói Chuẩn (whisper turbo q5_0 + Hy-MT2 Q8_0, như `run_sessions.py`
  `--pack chuan`), đích `vi`, các tiếng nguồn và ngưỡng im lặng theo mặc định của app. Build lại bản release trước
  (`cargo build --release -p latency-bench`; bản đang có trong `target/release/` cũ, chưa có lệnh `session`).
- **Gõ dịch:** `latency-bench mt-eval` biến thể không ngữ cảnh (`plain`) với một dòng `vi → en`: cùng hàm dịch, prompt, tham số
  sinh và hậu xử lý mà Gõ dịch dùng. Ghi cả thời gian dịch đo được (cần cho mục 3.3; nếu `mt-eval` chưa ghi thì đo quanh lệnh gọi
  dịch, không đoán).
- Hai kết quả (file sự kiện của `session` và bản dịch của `mt-eval`, kèm điều kiện chạy) được **commit** vào
  `scripts/demo-video/data/`: sửa hình thì dựng lại video mà không chạy model lại, và ai cũng đối chiếu được chữ trong video.

### 2.4 Trang dựng cảnh: `stage.html`

- Chạy trên server của `scripts/ui-preview/vite.config.ts` (gốc là thư mục repo, nên trang ở `/scripts/demo-video/stage.html`).
- Khung 540×960 điểm CSS, mật độ điểm ảnh 2 → ảnh 1080×1920.
- Thanh phụ đề rộng 470 điểm CSS, cỡ chữ 24 (Cài đặt › Phụ đề cho 14–48; mặc định của app là 20): chữ dịch hiện thành 48 px điểm
  ảnh, đủ đọc trên điện thoại. Ô Gõ dịch giữ đúng bề rộng thật 560 điểm, thu còn 0,84 lần để vừa khung.
- **Vùng an toàn:** chú thích, cửa sổ, thanh phụ đề, ô Gõ dịch và hình phím nằm trong khoảng dọc 126–720 và ngang tới 486 (điểm
  CSS), tránh phần trên cùng, phần chữ mô tả ở dưới và cột nút bên phải mà TikTok/Reels vẽ đè lên video. Tham số `guides=1` tô đỏ
  phần ngoài vùng an toàn để kiểm.
- Trang tự vẽ: cửa sổ cuộc gọi, khung chat, chú thích, hình phím, màn kết.
- Thanh phụ đề và ô Gõ dịch là **đúng** `overlay.html` và `compose.html` của app, nhúng bằng iframe cùng nguồn.
- Trang nhận một mốc thời gian (lịch, mục 3) và đẩy từng sự kiện vào iframe đúng lúc.
- **Chỗ móc trong `tauri-mock.ts`:** chỉ bật khi URL có `demo=1`. Khi bật thì không phát dữ liệu mẫu sẵn có và cho trang ngoài gọi
  hàm phát sự kiện của bản giả. Không có `demo=1` thì trang xem trước chạy như cũ.

### 2.5 Xuất video: `render.mjs`

- Chrome không đầu qua `website/tools/browser/cdp.mjs` (công cụ sẵn có; không thêm thư viện).
- **Thời gian ảo:** mỗi khung tiến đúng 1/30 giây rồi chụp ảnh, nên không giật, không lệch tiếng, dựng lần nào cũng ra y hệt.
  - Đồng hồ ảo tự cài (`vclock.js`), nạp vào mọi frame trước script của trang (`Page.addScriptToEvaluateOnNewDocument`). Nó thay
    Date, performance.now, setTimeout/setInterval, requestAnimationFrame; mọi frame dùng chung đồng hồ của trang ngoài cùng, và
    thời gian chỉ tiến khi `render.mjs` gọi.
  - Trang dựng cảnh không dùng transition/animation CSS: mọi chuyển động tính theo thời điểm. Trong hai iframe, trang dựng cảnh
    tắt transition (app chỉ có hai cái: chấm "đang nghe" 0,12 s và hiệu ứng rê chuột, không thấy được khi đứng yên) và ẩn con trỏ
    nhấp nháy của ô gõ, vì các thứ này chạy theo giờ thật.
  - Đã cân nhắc thời gian ảo của Chrome (`Emulation.setVirtualTimePolicy`): bỏ, vì không chắc nó điều khiển được mọi thứ trong
    iframe, mà giao diện app lại gần như không có animation để cần tới.
- **Âm thanh:** script ghép một file WAV 48 kHz gồm giọng đọc đặt đúng chỗ của cảnh 1 và tiếng gõ phím tự sinh (chuỗi xung ngắn)
  đặt đúng lúc từng chữ được gõ, theo cùng lịch với hình.
- **ffmpeg:** ghép ảnh thành H.264 `yuv420p` (ma trận màu BT.709, để màu không lệch so với ảnh chụp), âm thanh AAC, MP4 có
  `+faststart`. Ra `target/demo-video/ai-translator-demo.vi.mp4`, một ảnh bìa PNG và khoảng 10 khung chính
  (`target/demo-video/keyframes.vi/`) để xem lại.
- `ffmpeg` chưa có trên máy: cài bằng `brew install ffmpeg` (công cụ của máy dev, không vào app); **hỏi chủ dự án trước khi cài**.

## 3. Lịch thời gian

Một module thuần (không đụng trình duyệt, có test) dựng lịch từ kịch bản và dữ liệu thật. Trang dựng cảnh và phần âm thanh đọc
cùng một lịch.

### 3.1 Cảnh và giọng

- Giọng bắt đầu ở mốc `voiceStart` của cảnh 1 (dự kiến 3 s). Cảnh 1 kết thúc sau sự kiện phụ đề cuối cùng cộng một khoảng giữ để
  người xem đọc xong.
- Chấm "đang nghe" (`audio://level`, mỗi 100 ms) và vòng sáng quanh ảnh đại diện người nói theo mức âm lượng của giọng đọc
  (`voice.json`), không phải số ngẫu nhiên như trang xem trước.

### 3.2 Phụ đề

- Sự kiện có thời điểm `t_ms` tính từ lúc phát mẫu đầu của WAV (`origin` trong `crates/latency-bench/src/session.rs`). Trong
  video, sự kiện hiện ở `voiceStart + t_ms + 80 ms`.
- 80 ms là phần `latency-bench` không đo: thu âm và resample 30–60 ms, tới màn hình 10–20 ms
  (`bench/2026-10-10-do-tre/README.md` mục 0). Lấy cận trên để video **không nhanh hơn thật**.
- Thứ tự và nội dung sự kiện giữ nguyên như file (`subtitle`, `delta`, `live`, `live_end`).

### 3.3 Gõ dịch

- Gõ từng ký tự theo nhịp người gõ (khai trong kịch bản), không ngừng giữa chừng quá 400 ms, nên chỉ có một lần xin dịch.
- Xin dịch ở 400 ms sau ký tự cuối, đúng thời gian chờ của ô soạn thật.
- Bản dịch của `mt-eval` hiện dần theo ký tự, đều trong khoảng thời gian dịch đã đo. Đây là cách xấp xỉ việc bản dịch thật về từng
  mảnh token; tổng thời gian là số thật.
- Enter: ô đóng, chữ vào ô nhập của chat. Enter lần nữa: tin nhắn hiện trong khung chat.

## 4. Giữ trung thực

- **Không sửa tay chữ của app.** Chép lời hay bản dịch ra chữ xấu thì đổi câu trong kịch bản rồi chạy lại mục 2.3, không chỉnh kết
  quả. Dữ liệu dùng để dựng được commit (mục 2.3).
- **Thời gian không nhanh hơn thật:** dùng đúng thời điểm đo được cộng 80 ms (mục 3.2); Gõ dịch dùng đúng thời gian chờ và thời
  gian dịch đo được (mục 3.3).
- **Chú thích chỉ nói điều đúng:** "trong lúc đối tác đang nói" (không viết "ngay", "tức thì"); "chạy trên máy, âm thanh không
  gửi lên cloud" (khớp website); dòng điều kiện đo ở màn kết.
- **Không công bố công nghệ lõi:** không tên model, engine, thư viện trên video; dòng điều kiện chỉ ghi máy, gói, chế độ.
- **Không giả thương hiệu khác:** cửa sổ họp và khung chat là giao diện chung chung, không logo; tên người là tên bịa.

## 5. Kiểm tra

1. Test tự động cho phần tính toán: ghép giọng và `truth.json`, đổi sự kiện thành lịch (độ lệch `voiceStart` + 80 ms, giữ thứ
   tự), lịch gõ phím và lần xin dịch, vị trí tiếng gõ trong file âm thanh.
2. Dựng cùng một đoạn ngắn hai lần: khung hình phải giống hệt nhau (so mã băm).
3. Script đối chiếu: mỗi dòng phụ đề chốt hiện trong video lệch không quá 1 khung so với lịch.
4. `ffprobe`: 1080×1920, 30 khung/giây, H.264 + AAC, dài trong khoảng 30–60 giây.
5. Trích khoảng 12 khung ở các thời điểm chính để tự xem trước khi đưa chủ dự án; chủ dự án xem cả video và duyệt.

## 6. Rủi ro và việc cần chủ dự án

- Chủ dự án tải một giọng Premium (Ava hoặc Evan) trước bước 2.2.
- Cài `ffmpeg` cần chủ dự án cho phép (mục 2.5).
- `latency-bench session` phát WAV theo thời gian thực: máy nặng làm số đo lệch. Công cụ cảnh báo khi phát chậm hơn lịch quá
  100 ms; khi đó chạy lại.
- Giọng máy có thể bị nhận dạng sai chữ: xử lý theo mục 4 (đổi câu, không sửa kết quả).
- Đồng hồ ảo có thể sót một thứ chạy theo giờ thật: lần dựng hai lần so mã băm (mục 5.2) bắt được.

## 7. Ngoài phạm vi

Bản tiếng Anh, bản ngang 16:9, nhạc nền, đưa video lên website, tự đăng lên mạng xã hội. Khi cần thì thêm kịch bản
(`script.<ngôn ngữ>.json`) hoặc đổi kích thước khung; công cụ ở mục 2 không phải viết lại.
