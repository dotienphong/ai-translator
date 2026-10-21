# AI Translator: video giới thiệu bản 16:10 (màn hình Windows thật) — Design

**Ngày:** 2026-10-21
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-21 (các quyết định ở mục 0). Làm trên nhánh `demo-video`;
**không merge, không push** khi chưa được cho phép. Không sửa code app, không sửa website.
**Quan hệ với spec khác:** bản thứ hai của `2026-10-21-demo-video-design.md` (bản dọc 9:16, giữ nguyên). Dùng lại công cụ của bản đó
(`scripts/demo-video/`: giọng đọc, dữ liệu chữ thật `data/*.vi.json` đã duyệt, đồng hồ ảo `vclock.js`, `audio.mjs`, `render.mjs`,
chỗ móc `demo=1` của `scripts/ui-preview/tauri-mock.ts`). Vị trí cửa sổ theo app thật: thanh phụ đề
`src-tauri/src/overlay/placement.rs` (900×160, giữa, cách đáy vùng làm việc 72), ô Gõ dịch `src-tauri/src/compose/native_windows.rs`
(rộng 560, giữa màn hình, mép trên ở 25% chiều cao màn hình).

---

## 0. Yêu cầu và quyết định của chủ dự án

- **Yêu cầu:** bản thứ nhất "hơi bị AI, chưa giống thật". Làm thêm một bản **16:10** như màn hình máy tính thật:
  1. cảnh dịch họp giống cuộc họp thật, **3–4 người** gọi video như trên MS Teams hoặc Google Meet;
  2. **chuyển cảnh mượt** sang Gõ dịch, làm như đang **nhắn tin giữa hai người** bằng Messenger.
- **Thương hiệu:** giao diện **giống thật nhưng không logo, không tên** Teams, Meet, Messenger (cũng không logo Windows, Apple).
- **Người trong cuộc họp:** **clip người thật từ kho video miễn phí** cho phép dùng thương mại. Sarah (người nói tiếng Anh, giọng
  Ava) **tắt cam**: ô của cô hiện ảnh đại diện và viền sáng khi nói, nên không lộ lệch khẩu hình.
- **Chữ trên video:** **nhãn nhỏ** kiểu video demo sản phẩm, mỗi cảnh một nhãn 2–3 giây; có màn kết.
- **Màn kết:** chỉ biểu tượng, tên app, địa chỉ web. **Không có dòng chữ nhỏ** về minh họa hay điều kiện đo (chủ dự án không muốn).
  Hệ quả: video **không ghi con số tốc độ nào** (quy tắc website: số đo phải kèm điều kiện đo).
- **Hệ điều hành:** màn hình **Windows 11**, phím tắt **Ctrl + Alt + G** (không dùng ký hiệu macOS). Chủ dự án đã được báo: tốc độ phụ
  đề trong video đo trên Mac M4 Pro, máy Windows yếu hiện chữ chậm hơn; font là bản gần giống Segoe UI.
- **Cách làm:** hướng A, mở rộng bộ công cụ đang có (không quay màn hình thật).
- **Đã báo chủ dự án** (không phải chữ trên video): TikTok, YouTube có ô đánh dấu "nội dung tạo bằng AI" khi có giọng đọc tổng hợp
  nghe như người thật; chủ dự án tự quyết khi đăng.

## 1. Kịch bản (1920×1200, 30 khung/giây, khoảng 45 giây)

Bối cảnh chung: màn hình laptop Windows 11, 1536×960 điểm (1920×1200 ở tỉ lệ 125%). Hình nền trừu tượng tự tạo. Thanh tác vụ cao
48 điểm ở đáy: các biểu tượng app chung chung ở giữa (không logo Windows), khay hệ thống bên phải có biểu tượng AI Translator, Wi-Fi,
loa, pin, giờ và ngày. Con trỏ chuột kiểu Windows di chuyển và bấm như người dùng thật.

| Thời gian | Cảnh | Hình | Tiếng |
|---|---|---|---|
| 0–25 s | Dịch họp | Cửa sổ app họp phóng to hết vùng làm việc (không logo). Lưới 2×2: **Sarah · Product Lead** tắt cam (ảnh chân dung tròn giữa ô, viền sáng và biểu tượng sóng âm khi nói), **2 người bật cam** (clip đang nghe, gật đầu), ô **Bạn** (clip, người châu Á). Mỗi ô có tên ở góc dưới trái và biểu tượng mic. Thanh trên: tên cuộc họp "Weekly sync" và đồng hồ thời lượng họp chạy. Thanh dưới: mic, camera, chia sẻ màn hình, giơ tay, nút rời họp màu đỏ. **Thanh phụ đề thật** nổi đúng vị trí mặc định của app; chữ dịch hiện trong lúc Sarah nói (bật "Dịch trong lúc nói"). Nhãn nhỏ góc dưới trái 0,8–3,8 s: *"Dịch cuộc họp trực tiếp · chạy trên máy"* | Giọng Ava, 4 câu đã duyệt |
| ~25–26 s | Chuyển cảnh | Cả màn hình (trừ thanh tác vụ) trượt ngang sang trái như chuyển desktop ảo của Windows; desktop thứ hai có cửa sổ chat | Im |
| 26–41 s | Gõ dịch | Cửa sổ chat kiểu Messenger (không logo), không phóng to, thấy hình nền quanh: cột trái danh sách hội thoại (ảnh đại diện tròn, tên, tin cuối), khung phải là hội thoại với Sarah (ảnh, tên, "Đang hoạt động"). Sarah "đang nhập…" rồi tin hiện: *"Hi! Following up on the quote we discussed in the meeting."* Con trỏ bấm vào ô nhập. Ô hiện phím góc dưới phải cho thấy **Ctrl + Alt + G**; **ô Gõ dịch thật** mở đúng vị trí của app trên Windows, câu tiếng Việt gõ dần, bản dịch tiếng Anh hiện ra. **Enter**: ô đóng, câu tiếng Anh vào ô nhập. **Enter**: tin được gửi. Sarah "đang nhập…" rồi trả lời *"Perfect, thank you!"*. Nhãn nhỏ: *"Gõ dịch · Ctrl + Alt + G · nhắn tiếng Việt, gửi đi tiếng Anh"* | Tiếng gõ phím, tiếng bấm chuột, tiếng "pop" khi có tin |
| 41–45 s | Kết | Biểu tượng AI Translator, tên *AI Translator*, *aitranslator.io.vn* trên nền tối, hiện dần | Im |

- Câu nói, bản dịch phụ đề, câu trả lời tiếng Việt và bản dịch Gõ dịch là dữ liệu đã duyệt của bản dọc (`data/voice.vi.json`,
  `data/live.vi.json`, `data/compose.vi.json`); không chạy lại model.
- Tin nhắn của Sarah là chữ của kịch bản (lời người bên kia), không phải chữ do app tạo.
- Thời gian ở bảng là dự kiến; độ dài thật theo dữ liệu thật (mục 3).

## 2. Thành phần

Tất cả trong `scripts/demo-video/`. File lớn tải về và ảnh tách ra ở `target/demo-video/` (không commit).

### 2.1 Kịch bản: `script.desktop.vi.json`

- `data`: tên bộ dữ liệu chữ thật dùng lại (`"vi"` → `data/voice.vi.json`, `live.vi.json`, `compose.vi.json`), và file giọng
  `target/demo-video/voice48.vi.wav`.
- `stage`: `"desktop"`; `viewport`: 1536×960, mật độ 1,25.
- Tên người, tên cuộc họp, tin nhắn của Sarah và lời đáp cuối, nhãn, chữ màn kết, nhịp thời gian, bố cục (vị trí cửa sổ, ô lưới),
  tên các file clip/ảnh trong `assets.json`.

### 2.2 Clip và ảnh người thật: `assets.json`, `assets.mjs`

- `assets.json` (commit): mỗi file một mục: tên dùng trong kịch bản, loại (clip/ảnh), trang nguồn, đường tải, tác giả, tên giấy
  phép và đường dẫn giấy phép, ngày kiểm giấy phép, đoạn cắt (giây bắt đầu, độ dài), vùng cắt khung.
- `assets.mjs`: tải file về `target/demo-video/assets/`, kiểm độ dài clip; ffmpeg cắt đoạn, cắt khung 16:9 cho vừa ô, hạ cỡ đúng
  kích thước ô ở mật độ 1,25, tách thành ảnh JPEG 30 khung/giây (`target/demo-video/frames/<tên>/00001.jpg`…); ảnh chân dung cắt
  vuông. Thiếu file thì dừng và in đường dẫn để tải tay.
- Cần 3 clip (2 người tham gia, ô "Bạn"), mỗi clip từ 25 giây trở lên; ảnh: Sarah và 3 người trong danh sách hội thoại.

### 2.3 Trang dựng cảnh: `desktop.html`, `desktop.css`, `desktop.mjs`

- Chạy trên server của `scripts/ui-preview` như `stage.html`; khung 1536×960 điểm CSS.
- Trang tự vẽ: hình nền, thanh tác vụ, cửa sổ họp (lưới 2×2, thanh trên, thanh dưới), desktop thứ hai với cửa sổ chat, con trỏ,
  ô hiện phím, nhãn, màn kết. Mọi chuyển động tính theo thời điểm `t` (không transition/animation CSS), như `stage.mjs`.
- Ô bật cam hiện ảnh JPEG của đúng khung `floor(t / khung)`; `render(t)` trả Promise đợi các ảnh đã giải mã xong.
- Thanh phụ đề và ô Gõ dịch là `overlay.html`, `compose.html` thật (iframe, `demo=1`, `platform=windows`):
  - thanh phụ đề: 900×200 điểm (Cài đặt cho kéo cỡ), cỡ chữ 22 (Cài đặt cho 14–48), đặt theo luật mặc định của app: giữa màn hình,
    cách đáy vùng làm việc (trên thanh tác vụ) 72 điểm;
  - ô Gõ dịch: rộng 560 điểm, giữa màn hình, mép trên ở 240 điểm (25% của 960), như `native_windows.rs`;
  - `ComposeView.platform = "windows"`: chữ gợi ý theo Windows;
  - font: trang chèn CSS đổi font của hai iframe sang font gần giống Segoe UI (mục 2.4).

### 2.4 Font

- Ưu tiên **Selawik** (Microsoft, SIL OFL, cùng thông số với Segoe UI). Kiểm có đủ dấu tiếng Việt (ạ, ầ, ẩ, ẫ, ậ, ể, ữ, ỹ…); thiếu thì
  dùng **Noto Sans** (SIL OFL). File font và file giấy phép đặt trong `scripts/demo-video/fonts/` (commit, vài trăm KB).

### 2.5 Lịch thời gian: `desktop-timeline.mjs`

- Module thuần, có test; dùng lại các hàm của `timeline.mjs` (sự kiện phụ đề cộng 80 ms, mức âm lượng, lịch gõ, bản dịch về dần,
  độ hiện).
- Trả cùng các trường mà `render.mjs` cần như lịch bản dọc (`totalMs`, `frames`, `voiceStartMs`, `posterMs`, `overlayEvents`,
  `chat.translateAt`, `chat.translatedAt`), thêm: `keyTimes` (khung chính để xem lại), `sounds` (mốc và loại tiếng: gõ phím, bấm
  chuột, pop), đường đi con trỏ (các mốc vị trí, nội suy làm mượt), mốc chấm "đang nhập…", mốc các tin nhắn, mốc ô hiện phím, mốc
  chuyển cảnh.

### 2.6 Sửa công cụ chung

- `render.mjs`: lấy trang (`stage.html` hay `desktop.html`), kích thước khung và mật độ từ kịch bản; lịch theo loại trang; khung
  chính từ `keyTimes` của lịch; `await __stage.render(t)`; kiểm phụ đề bằng `.overlay-frame` như cũ. Bản dọc phải ra y hệt trước khi
  sửa (mục 6.2).
- `audio.mjs`: thêm tiếng bấm chuột và tiếng "pop" tự sinh; ghép theo `sounds`. Lịch bản dọc đổi `clicks` thành `sounds` loại gõ phím
  (tiếng ra như cũ).
- `scripts/ui-preview/tauri-mock.ts`: không cần sửa thêm (`platform=windows` đã có).

## 3. Lịch thời gian

- Giọng bắt đầu ở 0,8 s (cảnh mở bằng cuộc họp đang diễn ra, không có câu hỏi mở đầu). Phụ đề: giọng bắt đầu + `t_ms` + 80 ms như
  bản dọc. Cảnh họp hết sau sự kiện phụ đề cuối cùng cộng khoảng giữ để đọc xong.
- Chuyển cảnh trượt ngang 900 ms, làm mượt đầu cuối.
- Cảnh chat: Sarah "đang nhập…" 1,2 s → tin hiện (pop) → con trỏ đi tới ô nhập và bấm → ô hiện phím Ctrl + Alt + G → ô Gõ dịch mở →
  gõ theo nhịp như bản dọc (mọi khoảng dưới 400 ms) → ô soạn xin dịch sau 400 ms (thời gian chờ thật) → bản dịch về dần trong thời gian
  đo được → Enter → dán → Enter → tin gửi → Sarah "đang nhập…" 1,5 s → lời đáp (pop) → giữ 1,5 s.
- Màn kết 4 s.

## 4. Giữ trung thực

- Chữ phụ đề, bản dịch Gõ dịch và thời điểm của chúng là dữ liệu do code của app tạo (không sửa tay); không nhanh hơn thật (cộng 80 ms;
  thời gian chờ 400 ms và thời gian dịch đo được).
- Không con số tốc độ, không chữ "tức thì"; nhãn chỉ nói điều có thật ("chạy trên máy").
- Không logo, tên hay biểu tượng đặc trưng của Teams, Meet, Messenger, Windows, Apple; tên người là tên bịa.
- Clip và ảnh người thật chỉ dùng đúng giấy phép, có ghi nguồn trong `assets.json`; không dùng cảnh có logo hay nhãn hiệu lộ ra.

## 5. Âm thanh

- 48 kHz mono: giọng Ava đặt ở mốc giọng; tiếng gõ phím (như bản dọc), tiếng bấm chuột (xung ngắn trầm hơn), tiếng "pop" (sóng sin
  ngắn tắt dần, cao độ trượt nhẹ), đều tự sinh, lần nào cũng như nhau.

## 6. Kiểm tra

1. Test `node:test` cho `desktop-timeline.mjs` (mốc cảnh, nội suy con trỏ, mốc đang nhập/tin nhắn/ô hiện phím, `sounds`) và phần mới
   của `audio.mjs`; mọi test cũ vẫn đạt.
2. Bản dọc: trước khi sửa `render.mjs`, quay một đoạn khung (120–240) ra PNG và lưu mã băm; sau khi sửa quay lại đúng đoạn đó, mã băm
   phải giống hệt.
3. Bản 16:10: dựng một đoạn hai lần giống hệt; mỗi phụ đề chốt có trên thanh phụ đề đúng khung; ô Gõ dịch xin dịch đúng một lần đúng
   lúc; trang không lỗi JS; `ffprobe`: H.264 `yuv420p` 1920×1200, 30 khung/giây, AAC 48 kHz.
4. Tự xem các khung chính (`keyframes.desktop.vi/`) trước; chủ dự án xem cả video và duyệt.
5. Rà bằng mắt: không logo hay tên thương hiệu khác; không chữ nào bị cắt; dấu tiếng Việt đủ trong thanh phụ đề và ô Gõ dịch.

## 7. Rủi ro

- Kho video chặn tải tự động: `assets.mjs` dừng và in đường dẫn, chủ dự án tải tay vào `target/demo-video/assets/`.
- Font gần giống Segoe UI thiếu dấu tiếng Việt: dùng Noto Sans.
- Quay lâu hơn bản dọc (khung lớn hơn, mỗi khung nạp ảnh clip): ước 5–10 phút.
- Giấy phép kho video có điều khoản về người trong ảnh: đọc từng giấy phép; điều khoản nào không chắc thì báo chủ dự án trước khi dùng.

## 8. Ngoài phạm vi

Dựng lại bản dọc 9:16 theo phong cách mới, bản tiếng Anh, nhạc nền.
