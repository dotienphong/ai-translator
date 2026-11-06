# Video marketing tổng hợp (Dịch họp Teams & Giọng đọc + Dịch YouTube + Gõ dịch Messenger) — Design

**Ngày:** 2026-11-06
**Trạng thái:** Chờ chủ dự án duyệt bản viết (chủ dự án đã chọn Phương án A và khung thời lượng 1,5–2 phút qua hội thoại ngày 2026-11-06).
**Quan hệ với spec khác:** mở rộng bộ dựng cảnh 16:10 của `2026-10-21-demo-video-desktop-design.md`, kết hợp tính năng đọc bản dịch / Nghe dịch trực tiếp (`2026-11-02-nghe-dich-truc-tiep-design.md`) và màn hình Giọng đọc (`2026-11-04-giong-doc-design.md`).

---

## 1. Mục đích và lý do (Intent & Why)

- Các video demo trước đây (`ai-translator-meeting.vi.mp4` ~24 giây và `ai-translator-typing.vi.mp4` ~19 giây) chỉ mới tách lẻ 2 tính năng cơ bản (phụ đề họp và Gõ dịch), chưa có phần trình diễn tính năng mới **Giọng đọc / Nghe dịch trực tiếp** và chưa có cảnh **dịch video YouTube** trực tiếp trên máy tính.
- Chủ dự án cần một **video marketing tổng hợp dài 1,5–2 phút (90–120 giây)** chạy thử đầy đủ các tính năng cốt lõi theo một mạch câu chuyện liền mạch, chuyển cảnh mượt và có **thẻ giới thiệu ngắn trước mỗi cảnh** để người xem nắm ngay tính năng sắp xuất hiện dùng để làm gì.

---

## 2. Mục tiêu, ngoài phạm vi và điều cấm (Goals, Non-Goals, Anti-Goals)

### Mục tiêu (Goals)
1. **Thời lượng 90–120 giây** (mục tiêu ~100–105 giây), khung hình 16:10 (`1920×1200`, 30 fps, màn hình Windows 11 ở mật độ `1.25` trên khung CSS `1536×960`).
2. **Trình diễn trọn vẹn 3 nhóm tính năng chính:**
   - **Cảnh 1 — Dịch cuộc họp (kiểu MS Teams) + Giọng đọc AI:**
     - Phần 1a (Phụ đề trực tiếp): người tham gia nói tiếng Anh, thanh phụ đề nổi (`overlay.html`) hiện câu gốc và bản dịch tiếng Việt theo thời gian thực (bật "Dịch trong lúc nói").
     - Phần 1b (Nghe dịch & Giọng đọc): con trỏ mở khóa thanh phụ đề, bấm nút **Nghe dịch** (`ListenControls.tsx`) → hiện thanh trượt **Mức tiếng họp**, âm lượng giọng tiếng Anh gốc được hạ nhỏ (ducking) xuống nền, và giọng đọc AI tiếng Việt (`tts-worker`) đọc vang bản dịch từng câu. Tiếp đó mở nhanh cửa sổ chính AI Translator ở mục **Giọng đọc** (`VoiceScreen.tsx`) để thấy danh sách chọn giọng tiếng Việt / tiếng Anh theo 3 miền (Bắc / Trung / Nam), nút **Nghe thử** và thanh chỉnh Âm lượng, Tốc độ, Khoảng nghỉ.
   - **Cảnh 2 — Dịch video kiểu YouTube trên trình duyệt:**
     - Giao diện trình duyệt web đang phát một video bài giảng / thuyết trình công nghệ bằng tiếng Anh (khung phát 16:9 có hình chuyển động, thanh thời gian chạy, tiêu đề video, danh sách video gợi ý bên phải).
     - Thanh phụ đề nổi (`overlay.html`) đặt phía dưới tự động nghe âm thanh hệ thống từ trình duyệt và dịch trực tiếp sang tiếng Việt (kèm đọc dịch câu chốt).
   - **Cảnh 3 — Gõ dịch (`Ctrl + Alt + G`) khi nhắn tin kiểu Facebook Messenger:**
     - Nhận tin nhắn tiếng Anh từ đồng nghiệp trong cửa sổ chat kiểu Messenger → bấm `Ctrl + Alt + G` mở ô **Gõ dịch** (`compose.html`) → gõ câu trả lời bằng tiếng Việt → bản dịch tiếng Anh hiện ra → bấm `Enter` tự dán vào ô nhập tin nhắn và gửi đi.
3. **Chuyển cảnh mượt kèm giới thiệu ngắn:**
   - Trước mỗi cảnh (và khi chuyển giữa các desktop ảo) có một **thẻ giới thiệu (Intro Card / Transition Banner)** nổi rõ ~2,8–3,2 giây kèm hiệu ứng trượt màn hình mượt (`easeInOutCubic`), giải thích ngắn gọn tính năng sắp chuyển qua dùng để làm gì.

### Ngoài phạm vi (Non-Goals)
- Không sửa code logic sản phẩm của app Rust/React (chỉ bổ sung mock handler trong `scripts/ui-preview/tauri-mock.ts` cho chế độ xem trước/demo nếu thiếu).
- Không tự động thay thế 2 video ngắn đang nhúng trên trang chủ `aitranslator.vn` trừ khi chủ dự án yêu cầu sau khi xem file MP4.
- Chưa dựng bản đa ngôn ngữ (`en`, `ja`, `zh`, `ko`) cho video dài 1,5–2 phút này; tập trung làm chuẩn bản tiếng Việt (`showcase.vi`) trước.

### Điều cấm (Anti-Goals)
- **Không gắn logo hay chữ tên thương hiệu bên thứ ba** (`Microsoft Teams`, `YouTube`, `Facebook`, `Messenger`, `Windows`, `Apple`) lên giao diện giả lập — bố cục và màu sắc nhận diện đủ giống để người xem nhận ra ngay ngữ cảnh họp Teams, xem YouTube, chat Messenger nhưng an toàn bản quyền thương mại (theo quy tắc của `2026-10-21-demo-video-desktop-design.md`).
- **Không nêu tên công nghệ lõi / tên model** (`Whisper`, `Hy-MT`, `VieNeu`, `llama.cpp`, `ONNX`, `Tauri`...) trên bất kỳ chữ hay nhãn nào trong video (`CLAUDE.md`).
- **Không ghi con số tốc độ/độ trễ cụ thể** nếu không kèm điều kiện đo; không dùng từ phóng đại sai sự thật.
- **Không sửa tay kết quả dịch hay tự bịa phụ đề:** phụ đề cuộc họp, phụ đề YouTube, bản dịch Gõ dịch và âm thanh giọng đọc AI đều phải lấy từ đầu ra thật của engine (`latency-bench` + `tts-worker`).

---

## 3. Ràng buộc kỹ thuật (Constraints)

1. **Môi trường chạy trên Windows 11:**
   - Các script cũ (`voice.mjs`, `data.mjs`) từng gọi lệnh `say` của macOS và đường dẫn binary `-aarch64-apple-darwin`.
   - Trên máy Windows hiện tại đã có sẵn:
     - `src-tauri/binaries/tts-worker-x86_64-pc-windows-msvc.exe` cùng gói model `models/tts/` (`vieneu-v3-turbo/onnx_int8`, `moss-codec`, `sea_g2p.bin`, `voices_v3_turbo.json`, `onnxruntime.dll`).
     - `src-tauri/binaries/asr-worker-vulkan-x86_64-pc-windows-msvc.exe` (và bản CPU) cùng `models/ggml-large-v3-turbo-q5_0.bin`, `models/silero_vad_v6.2.3.onnx`.
     - `src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe` cùng `models/Hy-MT2-1.8B-Q8_0.gguf`.
   - Cần cập nhật/bổ sung công cụ tạo giọng và lấy dữ liệu để chạy trực tiếp trên Windows bằng `tts-worker` và binary Windows của `asr-worker` / `llama-server`.
2. **Trần thời lượng của `render.mjs`:**
   - Hiện `render.mjs` chặn cứng `tl.totalMs < 30_000 || tl.totalMs > 60_000`. Cần cho phép kịch bản cấu hình khoảng thời lượng hợp lệ (ví dụ `timing.durationRangeMs: [90_000, 125_000]`, mặc định giữ `[30_000, 60_000]` cho các kịch bản cũ để không phá test cũ).
3. **`ffmpeg` và `ffprobe`:**
   - Máy hiện chưa có `ffmpeg` trong `PATH`; bước chuẩn bị sẽ cài `ffmpeg` (qua `winget` hoặc binary tĩnh trong công cụ) để cắt khung ảnh mẫu và xuất MP4 H.264 `yuv420p` + AAC 48 kHz.

---

## 4. Các phương án đã cân nhắc (Approaches)

### Phương án A (Đã chọn) — Mở rộng bộ dựng `scripts/demo-video/` chạy 100% trên Windows với giao diện và giọng đọc thật
- **Mô tả:** Mở rộng kiến trúc trang dựng cảnh `desktop.html` / `desktop.mjs` thành luồng 3 màn hình làm việc (Desktop 1: Họp kiểu Teams + Nghe dịch + cửa sổ Giọng đọc; Desktop 2: Trình duyệt xem video kiểu YouTube; Desktop 3: Chat kiểu Messenger + Gõ dịch), có lớp thẻ giới thiệu chuyển cảnh (Feature Intro Card) hiển thị trước mỗi cảnh. Dùng `tts-worker` thật của Windows để sinh giọng nói tiếng Anh (cho cảnh YouTube / câu họp mới) và giọng đọc dịch tiếng Việt (cho phần Nghe dịch và Nghe thử), chạy qua `latency-bench` trên Windows để lấy đúng sự kiện phụ đề streaming.
- **Ưu điểm:** Hình ảnh sắc nét đồng nhất ở `1920×1200`, chuyển cảnh trượt mượt trên cùng thanh tác vụ Windows, nhúng đúng `overlay.html`, `compose.html` và `index.html?screen=voice` thật của sản phẩm, âm thanh giọng đọc là giọng thật của app.
- **Nhược điểm:** Thời gian render khoảng 2.900–3.200 khung hình bằng Chrome headless mất ~8–15 phút.

### Phương án B — Cắt ghép bằng `ffmpeg` từ 2 file MP4 cũ và chỉ quay bổ sung phần thiếu
- **Mô tả:** Lấy `ai-translator-meeting.vi.mp4` và `ai-translator-typing.vi.mp4` sẵn có, quay rời đoạn Giọng đọc và đoạn YouTube rồi nối lại bằng `ffmpeg`.
- **Ưu điểm:** Tiết kiệm thời gian render cảnh 1a và cảnh 3.
- **Nhược điểm:** Bị đứt mạch thị giác giữa phần cũ và phần mới, không trượt ngang liền mạch trên cùng màn hình desktop, và khó chèn mượt thao tác bật Nghe dịch + hạ âm lượng vào giữa cảnh họp đã nén.

**Quyết định:** Chủ dự án chọn **Phương án A**.

---

## 5. Thiết kế chi tiết ( kịch bản, giao diện, âm thanh & kiến trúc )

### 5.1 Bố cục thời gian và kịch bản (~102 giây)

Kịch bản đặt tại `scripts/demo-video/script.showcase.vi.json` (tổng thời lượng trong khoảng **95–115 giây**):

| Thời gian (dự kiến) | Phân cảnh | Thẻ giới thiệu / Nhãn dẫn | Nội dung hiển thị & thao tác | Âm thanh (48 kHz) |
|---|---|---|---|---|
| **00:00 – 00:03.2** | **Mở đầu & Giới thiệu Cảnh 1** | **Thẻ giới thiệu 1:** *"1. Dịch cuộc họp trực tiếp & Giọng đọc AI — Hiện phụ đề dịch tức thời và đọc bản dịch bằng giọng tiếng Việt tự nhiên khi họp trên Teams, Meet, Zoom"* | Nền màn hình Windows 11 làm mờ nhẹ phía sau thẻ giới thiệu, sau đó thẻ mờ dần để lộ cửa sổ họp kiểu MS Teams đang diễn ra. | Tiếng chuyển cảnh nhẹ (chime êm) |
| **00:03.2 – 00:22.0** | **Cảnh 1a: Họp kiểu Teams — Phụ đề trực tiếp** | Nhãn góc dưới trái: *"Dịch cuộc họp trực tiếp · Phụ đề song ngữ ngay trong lúc nói"* | Cửa sổ họp kiểu MS Teams (thanh trên màu tối tím-xám đặc trưng của Teams, lưới 2×2: Sarah Collins, David Park, Emma Wilson, Bạn). Sarah nói 3 câu tiếng Anh; thanh phụ đề nổi (`overlay.html`) hiện chữ đang nói hai tầng (`LiveLineView`) và chốt bản dịch tiếng Việt. | Giọng tiếng Anh của Sarah (100% âm lượng) |
| **00:22.0 – 00:48.0** | **Cảnh 1b: Tính năng Nghe dịch & Màn hình Giọng đọc** | Nhãn góc dưới trái: *"Nghe dịch trực tiếp & Giọng đọc · Tự hạ nhỏ tiếng họp, đọc bản dịch bằng 25 giọng AI 3 miền"* | • **00:22–00:36:** Thanh phụ đề mở khóa (`locked=false`), hiện nút **Nghe dịch** (`ListenControls.tsx`). Con trỏ chuột di chuyển tới bấm **Nghe dịch** → nút sáng xanh, hiện thanh trượt **Mức tiếng họp** (đặt ở 15%). Sarah nói tiếp 2 câu tiếng Anh: tiếng của Sarah tự động hạ nhỏ xuống 15%, và ngay khi câu dịch chốt, giọng AI tiếng Việt đọc rõ ràng bản dịch câu đó.<br>• **00:36–00:48:** Cửa sổ chính AI Translator (`index.html?demo=1&platform=windows&lang=vi&screen=voice`) mở lên ở giữa màn hình tại mục **Giọng đọc**, hiển thị 2 cột chọn giọng **Tiếng Việt** (nhóm miền Bắc / Trung / Nam) và **Tiếng Anh**, cùng 3 thanh trượt **Âm lượng (100%)**, **Tốc độ (1,00×)**, **Khoảng nghỉ (1,0×)**. Con trỏ bấm chọn giọng và bấm nút **Nghe thử** → nút chuyển sang trạng thái đang đọc và phát câu mẫu giọng đọc. | Tiếng bấm chuột; giọng tiếng Anh của Sarah hạ nhỏ (15%) khi giọng AI tiếng Việt đọc bản dịch + đọc câu mẫu Nghe thử |
| **00:48.0 – 00:52.0** | **Chuyển cảnh 1 → 2 & Giới thiệu Cảnh 2** | **Thẻ giới thiệu 2:** *"2. Dịch video & YouTube — Xem video công nghệ, bài giảng, livestream ngoại ngữ với phụ đề tiếng Việt trực tiếp"* | Màn hình trượt ngang mượt mà (`SLIDE_MS = 900 ms`) từ Desktop 1 sang Desktop 2, đồng thời hiện thẻ giới thiệu Cảnh 2 trong ~3 giây rồi mở vào màn hình trình duyệt. | Tiếng chuyển cảnh nhẹ |
| **00:52.0 – 01:18.0** | **Cảnh 2: Dịch video kiểu YouTube trên trình duyệt** | Nhãn góc dưới trái: *"Dịch âm thanh từ trình duyệt · Dùng cho YouTube, bài giảng, hội thảo trực tuyến"* | Cửa sổ trình duyệt web trên Desktop 2 với bố cục trang xem video kiểu YouTube (thanh tìm kiếm trên cùng, khung phát video 16:9 bên trái có hình diễn giả đang thuyết trình + sóng âm/chuyển động, thanh tiến trình màu đỏ đang chạy, tiêu đề *"Keynote: Building Reliable On-Device AI Systems"*, lượt xem, nút Thích/Chia sẻ, và cột 3 video gợi ý bên phải). Diễn giả nói 3 câu tiếng Anh; thanh phụ đề nổi (`overlay.html`) phía dưới dịch trực tiếp sang tiếng Việt (và đọc câu chốt cuối bằng giọng AI). | Giọng diễn giả tiếng Anh trong video + giọng đọc dịch ở câu cuối |
| **01:18.0 – 01:22.0** | **Chuyển cảnh 2 → 3 & Giới thiệu Cảnh 3** | **Thẻ giới thiệu 3:** *"3. Gõ dịch (Ctrl + Alt + G) — Gõ bằng tiếng Việt, tự dịch và gửi đi bằng ngôn ngữ của người nhận trên Messenger, Zalo, Slack"* | Màn hình trượt ngang từ Desktop 2 sang Desktop 3, kèm thẻ giới thiệu Cảnh 3 trong ~3 giây. | Tiếng chuyển cảnh nhẹ |
| **01:22.0 – 01:40.0** | **Cảnh 3: Gõ dịch trên cửa sổ chat kiểu Facebook Messenger** | Nhãn góc dưới trái: *"Gõ dịch · Ctrl + Alt + G · Nhắn tiếng Việt, gửi đi tiếng Anh"* | Cửa sổ chat kiểu Messenger trên Desktop 3: Sarah nhắn tin hỏi báo giá bằng tiếng Anh → con trỏ bấm vào ô nhập → hiện phím tắt `Ctrl + Alt + G` → ô **Gõ dịch** (`compose.html`) mở ra → gõ câu tiếng Việt (*"Dạ vâng, em sẽ gửi báo giá mới cho chị trước thứ Sáu."*) → bản dịch tiếng Anh hiện ra → `Enter` tự dán vào ô chat Messenger → `Enter` gửi đi → Sarah trả lời *"Perfect, thank you!"*. | Tiếng pop tin nhắn, tiếng chuột, tiếng gõ phím, tiếng Enter |
| **01:40.0 – 01:44.0** | **Màn kết (Outro)** | — | Nền tối hiện dần biểu tượng **AI Translator**, tên sản phẩm và địa chỉ **`aitranslator.vn`**. | Im |

### 5.2 Chi tiết các thành phần giao diện mới / mở rộng

1. **Thẻ giới thiệu chuyển cảnh (Feature Intro Card — `desktop-shell.mjs` & `desktop.css`):**
   - Mỗi lần chuẩn bị vào cảnh mới (`introCards` trong lịch thời gian), một lớp phủ bán trong suốt làm mờ nhẹ màn hình phía sau (`backdrop-filter: blur(10px)`, nền `rgba(11, 16, 28, 0.72)`), ở giữa hiện thẻ giới thiệu gồm:
     - Huy hiệu bước (ví dụ: `TÍNH NĂNG 01 / 03` kèm icon AI Translator).
     - Tiêu đề lớn rõ ràng (28 px, chữ trắng đậm).
     - Câu mô tả ngắn (18 px, chữ xám sáng) giải thích tính năng đó giúp người dùng làm việc gì.
   - Độ mờ (`opacity`) và độ phóng nhẹ (`scale`) tính thuần theo thời điểm `t` (không dùng CSS transition để `vclock.js` chụp từng khung chính xác tuyệt đối).

2. **Cảnh 1 — Giao diện kiểu MS Teams + Nghe dịch + Cửa sổ Giọng đọc (`desktop-meeting.mjs`, `desktop.mjs`, `tauri-mock.ts`):**
   - Tinh chỉnh màu sắc thanh trên và thanh điều khiển của `desktop-meeting.mjs` mang sắc thái темно-tím/xám hiện đại của MS Teams (vẫn không dùng logo hay chữ "Microsoft Teams").
   - Trong `scripts/ui-preview/tauri-mock.ts`: bổ sung các handler IPC còn thiếu cho chế độ `demo=1` trên Windows:
     - `overlay_listen_status`: trả `{ supported: true, active: false }`.
     - `overlay_listen_set`: cập nhật `{ supported: true, active: args.enabled }` và phát sự kiện nếu cần.
     - `overlay_tts_status` và `tts_status`: trả `{ available: true, running: false, reason: null, progress: null }`.
     - `tts_preview` và `overlay_tts_speak`: trong chế độ `demo=1`, gửi gói PCM giả ngắn qua `onEvent` rồi báo `{ kind: "done" }` sau đúng thời lượng câu đọc để nút `Nghe thử` / trạng thái `speaking` trên giao diện đổi trạng thái thật như khi chạy app.
   - Trong `desktop.mjs`:
     - Ở nửa sau Cảnh 1, gửi sự kiện `overlay://view` với `locked: false` vào `overlayFrame` để thanh phụ đề hiện nút **Nghe dịch** (`ListenControls`).
     - Khi con trỏ bấm vào nút **Nghe dịch**, kích hoạt `.listen-toggle` trong `overlayFrame` để bật trạng thái `aria-pressed="true"` và hiện thanh trượt **Mức tiếng họp**.
     - Thêm một `iframe` thứ ba (`mainFrame`: `/index.html?demo=1&platform=windows&lang=vi&screen=voice`) đặt trong khung cửa sổ Windows chuẩn ở giữa màn hình trong khoảng thời gian giới thiệu màn hình **Giọng đọc** (`00:36 – 00:48`), cho phép con trỏ bấm nút **Nghe thử** trên `VoiceScreen.tsx`.

3. **Cảnh 2 — Giao diện trình duyệt xem video kiểu YouTube (`scripts/demo-video/desktop-youtube.mjs` mới):**
   - Cửa sổ trình duyệt trên Desktop 2 (`desk2`), gồm:
     - Thanh tab và thanh địa chỉ trình duyệt (hiện đường dẫn dạng `video.example.com/watch?v=on-device-ai`, không dùng logo/tên YouTube).
     - Khung phát video 16:9 bên trái: hiển thị hình ảnh người thuyết trình (từ ảnh/khung hình trong `assets.json` kèm hiệu ứng phóng nhẹ Ken Burns và bộ sóng âm / slide thuyết trình minh họa bên cạnh để khung video sống động), thanh tiến trình màu đỏ dưới đáy khung video chạy mượt theo `t`, thời gian chạy (`04:12 / 18:45`), nút Tạm dừng, Âm lượng, Phụ đề gốc tắt, Toàn màn hình.
     - Bên dưới khung video: tiêu đề video tiếng Anh, tên kênh, số lượt xem, nút Thích / Chia sẻ / Lưu.
     - Cột phải: danh sách 3–4 thẻ video tiếp theo (ảnh thu nhỏ + tiêu đề tiếng Anh + thời lượng).
   - Thanh phụ đề nổi (`overlayFrame`) được gắn trên lớp màn hình chung (hoặc di chuyển theo desktop đang hoạt động) để nổi ngay phía dưới khung trình duyệt ở Cảnh 2, hiển thị phụ đề dịch trực tiếp cho các câu của video YouTube.

4. **Âm thanh đa luồng và hạ âm lượng (`scripts/demo-video/audio.mjs` & công cụ sinh tiếng trên Windows):**
   - Mở rộng `mixAudio` trong `audio.mjs` để hỗ trợ:
     - Nhiều đoạn giọng nói gốc (`voiceClips` hoặc `segments` ở các mốc khác nhau cho Cảnh 1 và Cảnh 2), giữ tương thích ngược với tham số `voice` + `voiceStartMs` của các kịch bản cũ.
     - **Hạ âm lượng tự động (Ducking envelope):** trong khoảng thời gian bật **Nghe dịch**, âm lượng giọng tiếng Anh gốc được nhân hệ số hạ âm mượt (ramp 150 ms xuống `0.18`), và các đoạn giọng đọc AI tiếng Việt (`ttsClips` sinh từ `tts-worker`) được trộn vào ở mức `1.0` ngay sau khi câu phụ đề chốt.
     - Thêm âm báo chuyển cảnh nhẹ (`whoosh`/`chime` ngắn, hàm toán học tất định như `popSample`) tại các thẻ giới thiệu chuyển cảnh.

5. **Tạo dữ liệu giọng đọc và phụ đề thật trên Windows (`scripts/demo-video/tts-win.mjs` / cập nhật `data.mjs`):**
   - Viết module `scripts/demo-video/tts-win.mjs` giao tiếp trực tiếp với `src-tauri/binaries/tts-worker-x86_64-pc-windows-msvc.exe` theo giao thức khung `u32 LE + postcard` (`crates/tts-protocol`) để:
     - Tổng hợp giọng nói tiếng Anh (`Lang::En`, giọng `Adam` hoặc kết hợp với bản thu sẵn `voice.vi.json`) và giọng đọc bản dịch tiếng Việt (`Lang::Vi`, giọng `Thục Đoan` / `Hải Đăng`) ra WAV 48 kHz mono.
   - Chạy `latency-bench` trên Windows (với `asr-worker-vulkan-x86_64-pc-windows-msvc.exe` và `llama-server-x86_64-pc-windows-msvc.exe`) cho các câu mới của Cảnh 1b và Cảnh 2 để thu đúng chuỗi sự kiện `live`, `delta`, `subtitle` thật lưu vào `scripts/demo-video/data/`.

---

## 6. Những phần để người triển khai tự quyết (Left to the Builder)

- Câu chữ tiếng Anh cụ thể của 2 câu nối thêm ở Cảnh 1b và 3 câu thuyết trình ở Cảnh 2 (chọn câu ngắn gọn, rõ nghĩa về công việc/công nghệ để `asr-worker` và `Hy-MT` dịch tự nhiên nhất).
- Tọa độ điểm ảnh chi tiết của khung trình duyệt YouTube và cửa sổ `VoiceScreen` sao cho không che khuất thanh phụ đề `overlay.html`.
- Chi tiết hàm sóng âm của tiếng chuyển cảnh nhẹ (`transitionSample`) trong `audio.mjs`.

---

## 7. Kiểm thử và nghiệm thu (Verification)

1. **Unit test (`node --test scripts/demo-video/*.test.mjs`):**
   - Toàn bộ test hiện có của `scripts/demo-video/` vẫn xanh (tương thích ngược với `vi`, `desktop.vi`, `desktop.en`...).
   - Thêm test cho lịch thời gian `showcase.vi`: tổng thời lượng nằm trong `90_000..120_000 ms`, các cảnh (`intro1`, `meeting`, `voiceWindow`, `intro2`, `youtube`, `intro3`, `chat`, `outro`) nối tiếp không chồng chéo sai, có đủ sự kiện bật Nghe dịch, hạ âm lượng và trộn giọng đọc AI.
2. **Kiểm tra tự động trong `render.mjs`:**
   - Mọi phụ đề chốt của cả Cảnh 1 (Họp) và Cảnh 2 (YouTube) đều xuất hiện đúng khung trên `.overlay-frame`.
   - Nút **Nghe dịch** trên `.overlay-frame` có `aria-pressed="true"` trong phân đoạn Cảnh 1b.
   - Cửa sổ **Giọng đọc** (`.main-frame`) hiển thị đúng danh sách giọng và nút **Nghe thử** hoạt động không có lỗi JS.
   - Ô **Gõ dịch** (`.compose-frame`) ở Cảnh 3 xin dịch đúng 1 lần và dán bản dịch vào ô chat.
   - File xuất `target/demo-video/ai-translator-demo.showcase.vi.mp4` đạt chuẩn H.264 `yuv420p` `1920×1200` 30 fps, AAC 48 kHz, thời lượng 90–120 giây.
3. **Xem bằng mắt các khung hình chính (`target/demo-video/keyframes.showcase.vi/`):**
   - Kiểm tra đủ các khung đại diện: Thẻ giới thiệu 1, Họp phụ đề, Bật Nghe dịch + thanh Mức tiếng họp, Cửa sổ Giọng đọc, Thẻ giới thiệu 2, Dịch YouTube, Thẻ giới thiệu 3, Gõ dịch Messenger, Màn kết.
