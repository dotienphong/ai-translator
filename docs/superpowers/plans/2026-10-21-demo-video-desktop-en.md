# Video 16:10 bản tiếng Anh (Việt → Anh) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Thêm bản 16:10 cho người nước ngoài: họp tiếng Việt có phụ đề tiếng Anh, Gõ dịch gõ Anh gửi Việt, giao diện tiếng Anh.

**Architecture:** Dùng nguyên bộ công cụ bản 16:10 (spec `2026-10-21-demo-video-desktop-design.md` mục 9). Chỉ thêm kịch bản `script.desktop.en.json`, đưa chữ giao diện cứng vào kịch bản, cho `voice.mjs` nhận ngôn ngữ nguồn, rồi chạy voice → data → render.

**Tech Stack:** như kế hoạch `2026-10-21-demo-video-desktop.md`. Quy ước (cd tuyệt đối, kiểm nhánh `demo-video`, không push/merge, tắt vite bằng `lsof`) giữ nguyên.

---

### Task 1: Mốc hồi quy bản Việt 16:10
- [ ] Bật vite 1432 (nền), quay `--script desktop.vi --png-dir target/demo-video/regress-before --from 150 --to 210`, lưu `shasum` vào `regress-before.sha`.

### Task 2: Chữ giao diện vào kịch bản
- [ ] `script.desktop.vi.json` thêm `"ui": { "chats": "Đoạn chat", "search": "Tìm kiếm", "leave": "Rời", "youPrefix": "Bạn: " }`.
- [ ] `desktop-chat.mjs`: `"Đoạn chat"` → `script.ui.chats`, `"Tìm kiếm"` → `script.ui.search`, `` `Bạn: ${text}` `` → `` `${script.ui.youPrefix}${text}` ``.
- [ ] `desktop-meeting.mjs`: `"Rời"` → `script.ui.leave`.
- [ ] `desktop.mjs`, `assets.mjs`: bộ dữ liệu `script.data ?? <tên kịch bản>`.
- [ ] Quay lại đúng đoạn của Task 1 ra `regress-after`; mã băm phải giống hệt. Commit.

### Task 3: `voice.mjs` nhận ngôn ngữ nguồn (TDD)
- [ ] Test: `truthFor([{ text: "Xin chào." }], [{ startMs: 600, endMs: 1500 }], "vi")[0].lang === "vi"`; mặc định vẫn `"en"`.
- [ ] `truthFor(lines, spans, lang = "en")`; `main` truyền `script.voice.lang ?? "en"`. Chạy mọi test. Commit.

### Task 4: Kịch bản tiếng Anh
- [ ] Viết `scripts/demo-video/script.desktop.en.json` theo mục 9 của spec:
  - `voice`: Linh (Enhanced), `lang: "vi"`, 4 câu;
  - `target: "en"`;
  - `chat`: `reply` tiếng Anh, `replyLang: "en"`, `replyTarget: "vi"`;
  - `ui`: chữ tiếng Anh;
  - `taskbar`: kiểu Mỹ;
  - `call.people`: Thu Hà (speaker, `self-still`), David Park, Sarah Collins, You (`p2-still`);
  - layout và timing như bản Việt.
- [ ] Commit.

### Task 5: Giọng và chữ thật, duyệt nội dung
- [ ] `node scripts/demo-video/voice.mjs desktop.en`. Kiểm hai file WAV dài bằng nhau.
- [ ] `node scripts/demo-video/data.mjs desktop.en` khi máy rảnh. Kiểm không còn sidecar sót.
- [ ] **Cổng trung thực:**
  - câu chép khớp kịch bản;
  - bản dịch tiếng Anh đúng nghĩa và tự nhiên;
  - bản dịch tiếng Việt của câu gõ đúng nghĩa;
  - chưa đạt thì đổi câu trong kịch bản rồi chạy lại (thử nhanh bằng `latency-bench mt-eval` với đường dẫn tuyệt đối), không sửa `data/*.json`.
- [ ] Commit `data/*.desktop.en.json` và kịch bản.

### Task 6: Quay, kiểm, bàn giao
- [ ] Quay một khung cảnh họp và một khung cảnh chat ra PNG để xem trước (chữ tiếng Anh, giao diện tiếng Anh, không chữ bị cắt).
- [ ] Dựng lặp lại một đoạn hai lần phải giống hệt.
- [ ] Quay `--script desktop.en`; `ffprobe` (H.264 1920×1200, 30 khung/giây, AAC); xem 13 khung chính.
- [ ] Chạy mọi test, `tsc`; tắt vite; dọn file thử; cập nhật bộ nhớ; báo chủ dự án.
