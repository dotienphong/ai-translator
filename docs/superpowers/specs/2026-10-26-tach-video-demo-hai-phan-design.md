# Tách video demo thành hai video: dịch cuộc họp và Gõ dịch — Design

> Bố cục hai video cạnh nhau của spec này đã được thay bằng khối tab "Tính năng chính" (spec 2026-10-27-trang-chu-ba-viec-tab-design.md); các video và việc cắt video vẫn dùng như mô tả ở đây.

**Ngày:** 2026-10-26
**Trạng thái:** Chủ dự án duyệt qua hội thoại ngày 2026-10-26 (bố cục: hai video cạnh nhau; phần còn lại duyệt nguyên văn). Nhánh `video-tach-hai-phan`; deploy theo lời chủ dự án ("up lên website lại"), không push GitHub nếu chưa được bảo.
**Quan hệ:** thay một phần `2026-10-21-website-demo-video-design.md` (một video mỗi ngôn ngữ) và `2026-10-22-website-ja-zh-ko-design.md` §4 (nút phát, ja/zh/ko). Nguồn video: `2026-10-21-demo-video-desktop-design.md`. Quy tắc nội dung website: `website/README.md`.

## 1. Vấn đề

Trang chủ mỗi ngôn ngữ hiện một video 16:10 dài khoảng 40 giây, gồm ba cảnh liền nhau: họp (dịch phụ đề trực tiếp), Gõ dịch, màn kết. Chủ dự án muốn hai video riêng, mỗi video giới thiệu một tính năng, cho đủ năm ngôn ngữ (vi, en, ja, zh, ko).

## 2. Quyết định

- **Cắt từ năm MP4 đã duyệt, không quay lại.** Nội dung hình và tiếng giữ nguyên bản chủ dự án đã duyệt; mất vài giây thay vì khoảng 45 phút quay lại cả năm ngôn ngữ. Mốc cắt lấy từ chính `buildDesktopTimeline` (cùng script, voice, live, compose đã dùng để quay), không gõ tay, nên không lệch nếu sau này đổi kịch bản.
- **Video họp** = cảnh họp `[0, liveEnd]` + màn kết `[chatEnd, hết]`, nối bằng chuyển mờ 0,4 s (hình và tiếng). Khoảng 24 s.
- **Video Gõ dịch** = cảnh nhắn tin `[chatStart, hết]` (gồm màn kết, giữ nguyên chuyển cảnh gốc), mờ dần vào 0,3 s (hình và tiếng) vì không còn cảnh trượt ngang dẫn vào. Khoảng 19 s.
- **Bỏ video gộp cũ khỏi website** (10 file `ai-translator-demo.<lang>.{mp4,webp}`); bản gốc vẫn ở `target/demo-video/`. Đường dẫn cũ trả 404: chỉ trang chủ dùng, không nơi nào khác nhúng.
- **Bố cục (chủ dự án chọn):** hai video cạnh nhau ở mục `#video-demo` (hai cột từ 1000 px trở lên, xếp dọc dưới đó: ở 900 px mỗi video chỉ còn khoảng 400 px). Mỗi cột có tiêu đề nhỏ, một câu mô tả rồi khung video. Mục vẫn mang tiêu đề "Xem AI Translator hoạt động".
- **Chữ phụ đề nhỏ hơn.** Mỗi video chỉ rộng khoảng 535 px ở màn 1280 px nên chữ phụ đề trong video (cao 22 px ở khung 1536) còn khoảng 7 px. Đã báo chủ dự án trước khi chọn; nút toàn màn hình của trình phát vẫn xem được cỡ đầy đủ. Kiểm bằng ảnh chụp trước khi deploy; nếu đọc không được thì báo để chọn lại bố cục.

## 3. Cắt video (`scripts/demo-video/split.mjs`)

- Đầu vào mỗi ngôn ngữ `L`: `target/demo-video/ai-translator-demo.desktop.L.mp4`, kịch bản `script.desktop.L.json` và bộ dữ liệu như `render.mjs` (qua `names.mjs`), khung chính `keyframes.desktop.L/`.
- Hàm thuần `splitPlan(timeline)` đổi mốc ms của `scenes` ra số khung (30 khung/giây, `Math.round(ms / FRAME_MS)`, cùng cách `render.mjs` tính khung chính): `meeting = [0, M)`, `chat = [C, E)`, `outro = [O, E)` với `O = chatEnd`. Có test với mốc của bản tiếng Việt và tiếng Anh (khác nhau) và kiểm các đoạn không chồng nhau.
- `ffmpeg` cắt theo khung (`trim=start_frame/end_frame`, `atrim`), `xfade` + `acrossfade` cho video họp, `fade` + `afade` cho video Gõ dịch. Mã hóa y như `render.mjs`: x264 `-preset slow -crf 18`, bt709 giới hạn dải tv, AAC 192k, `+faststart`; ghi ra `.mp4.part` rồi đổi tên.
- Đầu ra: `target/demo-video/ai-translator-meeting.L.mp4` và `ai-translator-typing.L.mp4`. Script chạy cả năm ngôn ngữ hoặc `--lang L`; `--publish` thêm bước chép MP4 và làm ảnh bìa WebP (§4) vào `website/src/assets/video/`.
- Chuyển mờ họp → màn kết: `xfade offset` lùi nửa khung so với khung bắt đầu chuyển, vì làm tròn `offset` lên làm video thừa một khung (gặp ở bản en; script kiểm số khung đúng bằng kế hoạch nên bắt được).
- Kiểm sau cắt (script tự làm, ffprobe): thời lượng bằng số khung dự kiến (với video họp trừ đoạn chồng chuyển mờ); có đủ hình và tiếng; hai file mỗi ngôn ngữ dưới 25 MiB.

## 4. Ảnh bìa

- Video họp: khung `03-phu-de.png` (giống ảnh bìa hiện tại, đang có phụ đề).
- Video Gõ dịch: khung `09-ban-dich.png` (bản dịch trong ô soạn).
- Cùng cách làm cũ: `cwebp -q 80 -resize 1440 900` → `website/src/assets/video/ai-translator-<kind>.<lang>.webp`. Chủ dự án xem ảnh bìa Gõ dịch cả năm ngôn ngữ để chắc nút phát không che chữ chính.

## 5. Website

- **File:** `website/src/assets/video/ai-translator-{meeting,typing}.<lang>.{mp4,webp}`; `kind` là `meeting` hoặc `typing`. Xóa 10 file `ai-translator-demo.*`.
- **`build/mp4.mjs`:** `videoMeta(lang, kind)` đọc đúng file; thời lượng trên nhãn nút và `duration` của JSON-LD vẫn lấy từ file MP4.
- **`build/components.mjs`:** `demoVideo({ lang, kind, label, fallback })` chọn file theo `kind`. Hàm mới `demoVideoPair({ lang, items })` dựng lưới hai cột, mỗi cột có `<h3>`, câu mô tả rồi `demoVideo`; `home.mjs` của năm ngôn ngữ chỉ truyền chữ.
- **`build/schema.mjs`:** `videoObject({ lang, kind, name, description, uploadDate })`; `@id` là `<trang chủ>#video-meeting` và `#video-typing`. Trang chủ có hai `VideoObject`. `uploadDate` 2026-10-26.
- **Chữ (`content/<lang>/home.mjs`):** câu mô tả cũ tách làm hai, giữ đúng những gì video cho thấy và không thêm lời nào mới (ngôn ngữ nói và ngôn ngữ phụ đề như `VIDEO_TEXT` cũ: vi/ja/zh/ko người nói tiếng Anh, phụ đề và Gõ dịch theo ngôn ngữ trang; en người nói tiếng Việt). Mỗi mô tả ghi thời lượng thật và "có tiếng". Không số đo tốc độ, không tên công nghệ lõi, không thêm phím tắt (video quay trên Windows, app macOS dùng phím khác). Tiêu đề, nhãn đọc màn hình, chữ liên kết tải MP4 (ghi dung lượng thật làm tròn) và tên `VideoObject` có đủ năm ngôn ngữ.
- **`assets/site.css`:** lưới `.video-pair` hai cột từ 1000 px, một cột dưới đó; nút phát và nhãn nhỏ lại trong khung hẹp.
- **`assets/site.js`:** khi một video bắt đầu phát thì tạm dừng video còn lại (không để hai tiếng chồng nhau). Nút đập nhịp mời xem giữ nguyên, mỗi khung tự đập một lần khi cuộn tới.
- **`website/README.md`:** ghi quy trình tách và chép video (một dòng ở mục video).

## 6. Kiểm tra

- `scripts/demo-video/split.test.mjs`: kế hoạch cắt (bản vi, en), đoạn không chồng nhau, mọi mốc trong khoảng video.
- `website/test/site.test.mjs`: mỗi trang chủ đã mở có đúng hai `<video>` (meeting, typing) của đúng ngôn ngữ, không lẫn ngôn ngữ khác, không còn tham chiếu `ai-translator-demo.`; cùng các kiểm cũ cho từng video (controls, preload none, playsinline, kích thước, ảnh bìa, file trong dist và dưới 25 MiB); hai `VideoObject` đúng `contentUrl`, `thumbnailUrl`, `duration`, `inLanguage` và `@id` khác nhau.
- `website/test/i18n.test.mjs`: `videoMeta`, `videoObject`, `demoVideo`, `demoVideoPair` theo tham số `kind`.
- `website/test/video-facade.test.mjs`: hai nút phát cùng hoạt động, không tải MP4 trước khi bấm; phát video này thì video kia tạm dừng.
- `pnpm test` toàn bộ website, `node --test scripts/demo-video` và các test cũ không đỏ.
- Ảnh chụp trang chủ vi, en, ja, zh, ko ở 375 px và 1280 px (sáng, tối) cho chủ dự án xem trước deploy; có ảnh phóng một khung video 1280 px để đánh giá chữ phụ đề.
- Sau deploy: năm trang chủ trả 200; mười file MP4 trả 200 và `video/mp4`; mười ảnh bìa 200; đường dẫn video gộp cũ 404; sitemap và IndexNow (nếu `pnpm deploy` gọi) bình thường.

## 7. Ngoài phạm vi

Không quay lại hình hay tiếng; không đổi kịch bản, giọng đọc, bố cục trong video; không làm video dọc 9:16 tách đôi; không thêm trình phát tab hay thư viện mới.
