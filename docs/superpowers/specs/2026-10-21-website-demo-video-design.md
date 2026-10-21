# Website: video demo trên trang chủ — Design

**Ngày:** 2026-10-21
**Trạng thái:** Chủ dự án duyệt qua hội thoại ngày 2026-10-21. Nhánh `website-video` (worktree `meeting-translator-work/website-video`); gộp `main` và `pnpm deploy` sau khi chủ dự án xem ảnh trang và đồng ý; không push GitHub nếu chưa được bảo.
**Quan hệ:** video từ nhánh `demo-video` (spec `2026-10-21-demo-video-desktop-design.md`): `ai-translator-demo.desktop.vi.mp4` (40,5 s) và `ai-translator-demo.desktop.en.mp4` (38,7 s). Quy tắc website: `website/README.md`.

## Quyết định
- **Trang và video:** trang chủ tiếng Việt `/` hiện video 16:10 tiếng Việt (đối tác nói tiếng Anh, phụ đề tiếng Việt; Gõ dịch Việt → Anh); trang chủ tiếng Anh `/en/` hiện video 16:10 tiếng Anh (đối tác nói tiếng Việt, phụ đề tiếng Anh; Gõ dịch Anh → Việt).
- **Vị trí:** một mục riêng ngay dưới phần đầu trang (hero), trước đoạn "AI Translator là gì". Khối minh họa HTML cũ ở hero giữ nguyên.
- **Nội dung mục:** nhãn "Video demo"; tiêu đề "Xem AI Translator hoạt động" / "See AI Translator in action"; một câu mô tả đúng những gì video cho thấy, có độ dài và "có tiếng". Không số đo tốc độ, không tên công nghệ lõi.
- **Phát:** `<video controls preload="none" playsinline>` có `poster` (khung có phụ đề, WebP) và kích thước 1920×1200: chỉ tải video khi người xem bấm phát. Có liên kết tải MP4 làm nội dung dự phòng.
- **Lưu trữ:** tự lưu trên website (CSP `default-src 'self'`, không dịch vụ bên thứ ba): `website/src/assets/video/ai-translator-demo.{vi,en}.{mp4,webp}`, dựng chép vào `dist/assets/video/`, cache 30 ngày, đường dẫn kèm `?v=<mã băm nội dung>` như ảnh chụp app. Mỗi file dưới giới hạn 25 MiB của Workers Static Assets.
- **SEO:** thêm node JSON-LD `VideoObject` (tên, mô tả, ảnh bìa, đường dẫn file, độ dài, ngày đăng, ngôn ngữ, nhà xuất bản) vào trang chủ mỗi ngôn ngữ.

## Kiểm tra
- Test mới trong `website/test/site.test.mjs`: mỗi trang chủ có đúng một `<video>` của đúng ngôn ngữ (không lẫn file của ngôn ngữ kia), có `controls`, `preload="none"`, `playsinline`, `width`/`height`, `poster`; file MP4 và ảnh bìa có trong `dist`, MP4 dưới 25 MiB; JSON-LD có `VideoObject` trỏ đúng file.
- Bộ kiểm liên kết nội bộ quét thêm `<source src>` và `<video poster>`.
- `pnpm test` toàn bộ; chụp mục video ở 375 px và 1280 px, sáng và tối, cho chủ dự án xem trước.
- Sau deploy: trang 200, file MP4 trả 200 và `video/mp4`, hỗ trợ tải từng đoạn (Range, 206).
