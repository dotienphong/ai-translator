# Website: video demo trên trang chủ — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Trang chủ VI/EN có mục video demo 16:10 đúng ngôn ngữ (spec `2026-10-21-website-demo-video-design.md`).

**Architecture:**
- Video và ảnh bìa nằm ở `website/src/assets/video/`.
- `components.mjs` thêm `demoVideo()`: đường dẫn kèm mã băm, dùng chung hàm băm với ảnh app.
- `schema.mjs` thêm `videoObject()`.
- `build.mjs` chép thư mục `video` và đặt cache.
- Hai `home.mjs` thêm mục video dưới hero; `site.css` thêm kiểu `.shot.video`.

**Quy ước:** làm trong worktree `meeting-translator-work/website-video` (nhánh `website-video`); mỗi lệnh `cd` đường dẫn tuyệt đối; kiểm nhánh trước commit; không push.

### Task 1: Tài nguyên
- [ ] Chép hai MP4 từ `ai-translator/target/demo-video/` (`ai-translator-demo.desktop.{vi,en}.mp4`) thành `website/src/assets/video/ai-translator-demo.{vi,en}.mp4`.
- [ ] Ảnh bìa: `cwebp -q 80 -resize 1440 900` từ khung chính `keyframes.desktop.{vi,en}/03-phu-de.png` → `ai-translator-demo.{vi,en}.webp`.

### Task 2: Test trước (TDD)
- [ ] Thêm test "trang chủ có video demo đúng ngôn ngữ…" (kiểm như spec).
- [ ] Mở rộng bộ kiểm liên kết: thẻ `source`, `video`, thuộc tính `poster`.
- [ ] Chạy `pnpm test`: test mới phải hỏng (chưa có video).

### Task 3: Mã
- [ ] `build.mjs`: chép `video`; `_headers` thêm `/assets/video/*` cache 30 ngày.
- [ ] `components.mjs`: `hashed(dir, file)` dùng chung; `appImg` gọi nó; `demoVideo({ lang, label, fallback })`.
- [ ] `schema.mjs`: `videoObject({ lang, name, description, duration, uploadDate })`.
- [ ] `vi/home.mjs`, `en/home.mjs`: mục `#video-demo` dưới hero; thêm `videoObject` vào `schema`; `modified: "2026-10-21"`.
- [ ] `site.css`: `.shot.video` (khung tối, `aspect-ratio: 16 / 10`, rộng tối đa 1100 px, giữa).
- [ ] `pnpm test` đạt hết. Commit.

### Task 4: Xem trước
- [ ] `pnpm dev`, chụp mục video ở `/` và `/en/` ở 375 px và 1280 px, sáng và tối; xem ảnh; kiểm bấm phát được (video `readyState` > 0 sau khi phát).
- [ ] Gửi ảnh cho chủ dự án, chờ đồng ý.

### Task 5: Gộp và deploy (khi chủ dự án đồng ý)
- [ ] Gộp `website-video` vào `main` (fast-forward, cục bộ).
- [ ] `pnpm deploy` từ worktree đang ở đúng `main` (hay thư mục chính sau khi về `main`): kiểm phiên wrangler (`wrangler whoami`) trước.
- [ ] Kiểm trang thật: `/` và `/en/` 200 và có `<video>`; file MP4 200 `video/mp4`, Range trả 206; không có `cloudflareinsights`.
