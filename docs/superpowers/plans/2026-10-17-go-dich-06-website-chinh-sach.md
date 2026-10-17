# Gõ dịch 06: website và chính sách quyền riêng tư — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Website `aitranslator.io.vn` (tiếng Việt và tiếng Anh) giới thiệu đúng tính năng Gõ dịch: có trang hướng dẫn riêng, có mặt ở Trang chủ, Tính năng, Bảng giá, Hỏi đáp, Dữ liệu và bảo mật, Khắc phục sự cố, bảng phím tắt; không còn câu nào trở thành sai khi có Gõ dịch ("năm phím tắt", "cần đúng một quyền trên macOS", "dịch một chiều" nói chung). Chính sách quyền riêng tư lên bản 1.4, nói chữ gõ ở lại trên máy, việc ghi clipboard và quyền Trợ năng. Có test chặn câu cũ quay lại.

**Architecture:** Website tĩnh sinh bằng Node thuần (`website/`, đọc `website/README.md` trước). Văn bản pháp lý là nguồn duy nhất: `docs/legal/privacy.{vi,en}.md` vừa được app đóng gói lúc build, vừa sinh hai trang chính sách của website. Ảnh giao diện chụp từ giao diện thật của app chạy với IPC giả (`scripts/ui-preview/`). Chính sách đổi nội dung trước (dòng phiên bản vẫn 1.3), rồi lên 1.4 kèm ngày hiệu lực bằng một lệnh **vào ngày phát hành, trước khi build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực").

**Tech Stack:** Node (bộ sinh website, `node --test`), Vite và Chrome không đầu (`scripts/ui-preview/shoot.mjs`, cần `cwebp` và `sips`, chỉ chạy trên macOS).

**Spec:** `docs/superpowers/specs/2026-10-17-go-dich-design.md` §6 (quyền riêng tư, pháp lý), §10 (website). Tổng quan và quy tắc chung: `docs/superpowers/plans/2026-10-17-go-dich-00-tong-quan.md`. Cần kế hoạch 05 đã xong (đã có biên bản nghiệm thu).

**Quy tắc chung:** như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00, thêm:
- **Không deploy website.** `pnpm deploy` do chủ dự án chạy **sau khi** bản app có Gõ dịch đã đăng (bước cuối của quy trình phát hành). Deploy sớm hơn thì website nói về một tính năng người dùng chưa có.
- Website chỉ nói điều có thật, không nêu công nghệ lõi (`website/README.md`; có test chặn). Chữ trích từ app (nhãn nút, câu báo) phải đúng nguyên văn từ điển `src/i18n/{vi,en}.ts` (có test).
- Mã ở đây đã chạy thật ở commit `682d315` của nhánh `go-dich-proto` (trừ Task 7, đã chạy thử rồi hoàn lại): mọi test website xanh, test pháp lý của app xanh, ảnh đã xem bằng mắt, bố cục đã xem ở 1280 px và 375 px.

## Quyết định của kế hoạch này (chủ dự án cần biết)

1. **Chính sách quyền riêng tư lên 1.4**, sửa mục 2, 3, 4, 10: chữ gõ ở Gõ dịch và bản dịch chỉ nằm trong bộ nhớ, không ghi đĩa, không gửi đi, không có trong log hay báo cáo lỗi; ứng dụng ghi bản dịch vào clipboard; quyền Trợ năng trên macOS chỉ để gửi phím dán. Không có kết nối, bên xử lý hay dữ liệu máy chủ mới, nên không đổi các mục khác. Lý do vẫn sửa dù không có gì rời máy: chính sách liệt kê dữ liệu ở lại trên máy (mục 3) và nói chưa có kết nối nào mang chữ gì; thiếu Gõ dịch thì không còn đủ.
2. **EULA giữ bản 1.3**: mục 1 nói ứng dụng hiện phụ đề dịch và dịch trên máy; Gõ dịch cũng dịch trên máy và không đổi quyền, nghĩa vụ hay dữ liệu rời máy. Muốn EULA nêu cả Gõ dịch thì làm thêm một bản EULA (ngày hiệu lực riêng), không có trong kế hoạch này.
3. **Website nói thẳng bản Windows chưa được thử trên máy thật** (hướng dẫn Gõ dịch và trang Tính năng, vi và en), theo CLAUDE.md. Bỏ câu đó khi đã thử Gõ dịch trên Windows; bỏ thì sửa cả needle của test `Gõ dịch: các trang nêu …` (`website/README.md` ghi việc này).
4. **Website không nêu số đo** thời gian dịch của Gõ dịch (GD2) và không liệt kê tên app đã thử; chỉ nói chung "ô chat của trình duyệt, app chat và khung chat của app họp". Câu liệt kê này chỉ đúng khi GD1 đạt ở cả ba nhóm đó. Task 0 đọc biên bản; nhóm nào chưa thử hay không đạt thì **Task 6a** đổi các câu cho đúng phạm vi đã kiểm (lần thực thi 2026-10-18: GD1 mới đạt ở TextEdit và Chrome, nên đã áp Task 6a).
5. **Câu hướng dẫn bật lại quyền Trợ năng sau khi cập nhật** dùng cách "xóa khỏi danh sách rồi thêm lại, hoặc tắt rồi bật lại công tắc". Nếu kết luận spike S3 (`bench/2026-10-17-go-dich/results/spike.md`) khác, sửa câu đó ở hướng dẫn Gõ dịch và Khắc phục sự cố (vi, en) cho khớp chuỗi `settings.compose.permission.missing` của app.
6. **Thời điểm:** Task 1 đến 6 và Task 8 làm sau kế hoạch 05, trước khi phát hành. Task 7 làm **vào ngày phát hành, trước khi nâng phiên bản và build app**. Ảnh có chân thanh bên ghi phiên bản app (`app-settings-*`): chụp lại sau khi nâng phiên bản, theo quy tắc sẵn có của `website/README.md` (mục ảnh chụp), cùng các ảnh khác của quy trình phát hành.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md` | Mục 2, 3, 4, 10; dòng phiên bản lên 1.4 ở Task 7 |
| Modify `docs/legal/README.md` | Lịch sử bản 1.4, "Đã làm"; ngày ở Task 7 |
| Modify `scripts/ui-preview/shoot.mjs` | Cảnh `compose-done` (cắt theo khung ô soạn), `app-settings-compose` |
| Modify `website/src/assets/img/app/manifest.json`; Create/Modify ảnh `compose-done.*`, `app-settings-compose.*`, `app-settings-hotkeys.*` | Ảnh mới, ảnh Phím tắt sáu dòng |
| Create `website/src/content/{vi,en}/guide-type-translate.mjs` | Hướng dẫn Gõ dịch (`/huong-dan/go-dich/`, `/en/guide/type-and-translate/`) |
| Modify `website/src/content/index.mjs`, `{vi,en}/guide.mjs`, `{vi,en}/guide-glossary.mjs`, `{vi,en}/guide-subtitle-bar.mjs` | Danh mục, mục lục Hướng dẫn, bài trước và bài sau, bảng phím tắt |
| Modify `website/src/content/{vi,en}/{features,home,pricing}.mjs`, `website/src/assets/site.css` | Mục Gõ dịch ở Tính năng, khối Gõ dịch ở Trang chủ, hàng Bảng giá |
| Modify `website/src/content/{vi,en}/{faq,data-security,guide-troubleshooting,guide-audio-permission,compare-offline-cloud,solutions,solutions-meetings}.mjs` | Câu hỏi mới, dữ liệu trên máy, sự cố, sửa câu cũ |
| Modify `website/test/site.test.mjs`, `website/README.md` | Test Gõ dịch và luật câu cũ `STALE_COMPOSE`; quy tắc mới |

---

### Task 0: Kiểm nhánh, kết quả nghiệm thu, mốc test

**Files:** không sửa file.

- [ ] **Step 1: Nhánh và biên bản**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && sed -n '/^| GD1 /p' bench/2026-10-17-go-dich/results/nghiem-thu-mac.md && sed -n '/^## Kết luận cho spec §4.2/,$p' bench/2026-10-17-go-dich/results/spike.md
```
Expected: `go-dich`, không có file đổi; dòng GD1 của biên bản; phần kết luận S3. Đọc hai phần này theo quyết định 4 và 5 ở trên. GD1 không đạt ở cả một nhóm (trình duyệt, app chat hay khung chat của app họp), hay S3 cho cách bật lại quyền khác: ghi lại, sửa đúng câu tương ứng khi làm Task 3 đến 5 (chỉ sửa chữ, đừng bỏ needle của test), rồi báo trong báo cáo cuối.

- [ ] **Step 2: Cài phụ thuộc của website, mốc test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm install --frozen-lockfile >/dev/null && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ tests 119`, `ℹ pass 117`, `ℹ fail 0`, `ℹ skipped 2` (hai test cần Chrome hay PowerShell có thể bỏ qua tùy máy). Có test đỏ thì dừng và báo.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep Tests && which cwebp sips
```
Expected: `Tests  19 passed (19)`; hai đường dẫn (`cwebp` cài bằng Homebrew, `sips` có sẵn trên macOS).

---

### Task 1: Chính sách quyền riêng tư (nội dung; dòng phiên bản vẫn 1.3)

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

Bản tiếng Việt là bản gốc; bản tiếng Anh dịch tương đương, cùng cấu trúc (test kiểm). Không đánh số lại mục nào. App đóng gói bốn file văn bản lúc build, nên sửa ở đây là sửa nội dung trong app ở lần build sau.

- [ ] **Step 1: Viết test trước (đỏ)**

Trong `website/test/site.test.mjs`, tìm dòng (duy nhất):

```js
test("luật giá USD (usdAmounts): đọc đúng '3.99 USD' (en) và '$3,99' (vi), bắt 'US$ 4.99', '4.99$', 'USD 3.99', '1,000 USD', 'đô la'; không nhầm tên cột kế bên là giá", () => {
```

thay bằng:

```js
test("chính sách quyền riêng tư: Gõ dịch ở mục 2, 3 (dữ liệu trên máy, clipboard, quyền Trợ năng), 4 (không kết nối nào mang chữ gõ) và 10 (báo cáo không gồm chữ gõ)", () => {
  const errors = [
    ...sectionErrors("/chinh-sach-quyen-rieng-tu/", {
      2: ["Chữ bạn gõ ở Gõ dịch", "không được gửi đi và không được ghi xuống đĩa"],
      3: ["Chữ bạn gõ ở Gõ dịch và bản dịch của nó", "clipboard", "Trợ năng", "không đọc chữ, nội dung hay clipboard của ứng dụng khác"],
      4: ["hay chữ bạn gõ ở Gõ dịch"],
      10: ["chữ bạn gõ ở Gõ dịch"],
    }),
    ...sectionErrors("/en/privacy/", {
      2: ["Text you type in Type", "it is not sent anywhere and not written to disk"],
      3: ["Translate and its translation", "clipboard", "Accessibility", "does not read text, content or the clipboard of other apps"],
      4: ["or text you type in Type"],
      10: ["text typed in Type"],
    }),
  ];
  assert.deepEqual(errors, []);
});

test("luật giá USD (usdAmounts): đọc đúng '3.99 USD' (en) và '$3,99' (vi), bắt 'US$ 4.99', '4.99$', 'USD 3.99', '1,000 USD', 'đô la'; không nhầm tên cột kế bên là giá", () => {
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ fail 1`: test `chính sách quyền riêng tư: Gõ dịch ở mục 2, 3 …` đỏ.

- [ ] **Step 2: Chính sách tiếng Việt**

Trong `docs/legal/privacy.vi.md`, tìm đoạn (duy nhất):

```markdown
- Âm thanh cuộc họp được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa.
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**. Khi gặp lỗi, ứng dụng **tự gửi báo cáo lỗi đã che dữ liệu cá nhân** cho chúng tôi để sửa lỗi; bạn tắt được bất cứ lúc nào (mục 10).
```

thay bằng:

```markdown
- Âm thanh cuộc họp được xử lý **hoàn toàn trên máy bạn**. Âm thanh **không bao giờ** được gửi đi, và không được ghi xuống đĩa.
- Chữ bạn gõ ở **Gõ dịch** (ô soạn tin nhắn để dịch rồi dán vào ứng dụng khác) cũng được dịch **hoàn toàn trên máy bạn**: không được gửi đi và không được ghi xuống đĩa (mục 3).
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**. Khi gặp lỗi, ứng dụng **tự gửi báo cáo lỗi đã che dữ liệu cá nhân** cho chúng tôi để sửa lỗi; bạn tắt được bất cứ lúc nào (mục 10).
```

Cùng file, tìm đoạn (duy nhất):

```markdown
| Bản chép lời và bản dịch | Hiện trên màn hình. **Lịch sử mặc định tắt.** Bật thì lưu trên máy bạn, mã hóa, và xóa toàn bộ được bằng một nút |
| Từ điển thuật ngữ, cài đặt | Lưu trên máy bạn |
```

thay bằng:

```markdown
| Bản chép lời và bản dịch | Hiện trên màn hình. **Lịch sử mặc định tắt.** Bật thì lưu trên máy bạn, mã hóa, và xóa toàn bộ được bằng một nút |
| Chữ bạn gõ ở Gõ dịch và bản dịch của nó | Chỉ nằm trong bộ nhớ RAM tới khi bạn dán hoặc thoát ứng dụng; không ghi xuống đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Ứng dụng chép bản dịch vào clipboard của hệ điều hành để dán; bản dịch ở lại đó tới khi bạn chép thứ khác |
| Từ điển thuật ngữ, cài đặt | Lưu trên máy bạn |
```

Cùng file, tìm đoạn (duy nhất):

```markdown
Các công cụ phụ của ứng dụng chỉ nghe trên `127.0.0.1` (máy bạn) hoặc không mở cổng mạng nào.

```

thay bằng:

```markdown
Các công cụ phụ của ứng dụng chỉ nghe trên `127.0.0.1` (máy bạn) hoặc không mở cổng mạng nào.

Trên macOS, Gõ dịch có thể xin quyền **Trợ năng** (Accessibility) để tự dán bản dịch vào ô bạn đang gõ. Ứng dụng chỉ dùng quyền này để gửi tổ hợp phím dán (⌘V); ứng dụng không đọc chữ, nội dung hay clipboard của ứng dụng khác. Nếu bạn không cấp quyền, ứng dụng chỉ chép bản dịch vào clipboard để bạn tự dán.

```

Cùng file, tìm đoạn (duy nhất):

```markdown

Không có kết nối nào khác, và không có kết nối nào mang âm thanh hay nội dung chép lời.

```

thay bằng:

```markdown

Không có kết nối nào khác, và không có kết nối nào mang âm thanh, nội dung chép lời hay chữ bạn gõ ở Gõ dịch.

```

Cùng file, tìm đoạn (duy nhất):

```markdown
| Báo cáo gồm | Mã báo cáo, loại và mã lỗi, giờ xảy ra; phiên bản ứng dụng, hệ điều hành và phiên bản, kiến trúc, tên chip hoặc CPU, RAM, loại GPU đang dùng, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; **mã băm của ID máy**; và phần log liên quan đến lỗi (tối đa 64 KB) |
| Báo cáo không gồm | Âm thanh, bản chép lời, bản dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP |
| Che dữ liệu | Trước khi gửi, ứng dụng che đường dẫn thư mục cá nhân, key, token và email trong log; còn sót mẫu nhạy cảm thì bỏ cả báo cáo. Máy chủ kiểm lại và từ chối báo cáo nếu còn |
```

thay bằng:

```markdown
| Báo cáo gồm | Mã báo cáo, loại và mã lỗi, giờ xảy ra; phiên bản ứng dụng, hệ điều hành và phiên bản, kiến trúc, tên chip hoặc CPU, RAM, loại GPU đang dùng, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; **mã băm của ID máy**; và phần log liên quan đến lỗi (tối đa 64 KB) |
| Báo cáo không gồm | Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP |
| Che dữ liệu | Trước khi gửi, ứng dụng che đường dẫn thư mục cá nhân, key, token và email trong log; còn sót mẫu nhạy cảm thì bỏ cả báo cáo. Máy chủ kiểm lại và từ chối báo cáo nếu còn |
```

- [ ] **Step 3: Chính sách tiếng Anh**

Trong `docs/legal/privacy.en.md`, tìm đoạn (duy nhất):

```markdown
- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
- The app has **no sign-in accounts, no advertising and no analytics**. When it hits an error, it **automatically sends us an error report with personal data scrubbed out** so we can fix the problem; you can turn this off at any time (section 10).
```

thay bằng:

```markdown
- Meeting audio is processed **entirely on your computer**. Audio is **never** sent anywhere and is not written to disk.
- Text you type in **Type & Translate** (a box for writing a message, translating it and pasting it into another app) is also translated **entirely on your computer**: it is not sent anywhere and not written to disk (section 3).
- The app has **no sign-in accounts, no advertising and no analytics**. When it hits an error, it **automatically sends us an error report with personal data scrubbed out** so we can fix the problem; you can turn this off at any time (section 10).
```

Cùng file, tìm đoạn (duy nhất):

```markdown
| Transcripts and translations | Shown on screen. **History is off by default.** If you turn it on, it is stored on your computer, encrypted, and can be deleted with one button |
| Glossary, settings | Stored on your computer |
```

thay bằng:

```markdown
| Transcripts and translations | Shown on screen. **History is off by default.** If you turn it on, it is stored on your computer, encrypted, and can be deleted with one button |
| Text you type in Type & Translate and its translation | Held only in RAM until you paste it or quit the app; never written to disk, never sent over the network, not in logs or error reports. The app copies the translation to the operating system's clipboard to paste it; it stays there until you copy something else |
| Glossary, settings | Stored on your computer |
```

Cùng file, tìm đoạn (duy nhất):

```markdown
The app's helper programs only listen on `127.0.0.1` (your own machine) or open no network port at all.

```

thay bằng:

```markdown
The app's helper programs only listen on `127.0.0.1` (your own machine) or open no network port at all.

On macOS, Type & Translate can ask for the **Accessibility** permission to paste the translation into the box you are typing in. The app uses this permission only to send the paste keys (⌘V); it does not read text, content or the clipboard of other apps. If you do not grant it, the app only copies the translation to the clipboard for you to paste.

```

Cùng file, tìm đoạn (duy nhất):

```markdown

There are no other connections, and none carries audio or transcript text.

```

thay bằng:

```markdown

There are no other connections, and none carries audio, transcript text or text you type in Type & Translate.

```

Cùng file, tìm đoạn (duy nhất):

```markdown
| The report contains | The report code, the type and code of the error, the time it happened; the app version, the operating system and its version, the architecture, the chip or CPU name, RAM, the type of GPU in use, the model pack, the name of your license plan (never the key), the interface language; a **hash of the machine ID**; and the part of the log that relates to the error (at most 64 KB) |
| The report does not contain | Audio, transcripts, translations, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
| Scrubbing | Before sending, the app removes personal folder paths, keys, tokens and email addresses from the log; if any sensitive pattern is left, the whole report is dropped. Our server checks again and rejects a report if anything is left |
```

thay bằng:

```markdown
| The report contains | The report code, the type and code of the error, the time it happened; the app version, the operating system and its version, the architecture, the chip or CPU name, RAM, the type of GPU in use, the model pack, the name of your license plan (never the key), the interface language; a **hash of the machine ID**; and the part of the log that relates to the error (at most 64 KB) |
| The report does not contain | Audio, transcripts, translations, text typed in Type & Translate, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
| Scrubbing | Before sending, the app removes personal folder paths, keys, tokens and email addresses from the log; if any sensitive pattern is left, the whole report is dropped. Our server checks again and rejects a report if anything is left |
```

- [ ] **Step 4: Cụm bắt buộc của mục 10 trong test cũ**

Mục 10 thêm "chữ bạn gõ ở Gõ dịch" vào giữa danh sách "Báo cáo không gồm", nên cụm liền mạch cũ của test mục 10 không còn khớp. Trang dựng từ Markdown đổi `&` thành thực thể HTML, nên cụm tiếng Anh tách ở chỗ "Type & Translate".

Trong `website/test/site.test.mjs`, tìm đoạn (duy nhất):

```js
          "mã băm của ID máy",
          "Âm thanh, bản chép lời, bản dịch, license key, token, email",
          "có thể nối báo cáo với license và email",
```

thay bằng:

```js
          "mã băm của ID máy",
          "Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email",
          "có thể nối báo cáo với license và email",
```

Cùng file, tìm đoạn (duy nhất):

```js
          "hash of the machine ID",
          "Audio, transcripts, translations, license keys, tokens, email addresses",
          "can link a report to that machine",
```

thay bằng:

```js
          "hash of the machine ID",
          "Audio, transcripts, translations, text typed in Type",
          "Translate, license keys, tokens, email addresses",
          "can link a report to that machine",
```

- [ ] **Step 5: README pháp lý**

Trong `docs/legal/README.md`, tìm đoạn (duy nhất):

```markdown
**Chính sách 1.3 thêm báo cáo lỗi tự động** theo spec `2026-10-17-diagnostics-reports-design.md` (mục 0, 6 và 9): app tự gửi báo cáo lỗi đã che dữ liệu cá nhân tới `POST /v1/diagnostics` (chính sách mục 10; tóm tắt ở mục 2, dữ liệu ở lại trên máy ở mục 3, kết nối mạng ở mục 4, dữ liệu máy chủ ở mục 5, bên xử lý ở mục 6, yêu cầu xóa ở mục 7). Báo cáo gắn với `device_id_hash` nên nối được với license và email; giữ 30 ngày, tối đa 3.000. Tính năng bật mặc định, kể cả với người dùng đã cài từ trước (chủ dự án chọn 2026-10-17: không hỏi, không thông báo trong app). **EULA không đổi** (giữ bản 1.3): EULA chỉ nói ứng dụng "không gửi âm thanh đi đâu" (vẫn đúng) và dẫn tới chính sách cho phần dữ liệu. Mục "Báo cáo lỗi" là mục 10, nên "Thay đổi chính sách" và "Liên hệ" thành mục 11 và 12; các mục 1 đến 9 giữ số để các tham chiếu "mục 5", "mục 6", "mục 7" và test của website vẫn đúng.

```

thay bằng:

```markdown
**Chính sách 1.3 thêm báo cáo lỗi tự động** theo spec `2026-10-17-diagnostics-reports-design.md` (mục 0, 6 và 9): app tự gửi báo cáo lỗi đã che dữ liệu cá nhân tới `POST /v1/diagnostics` (chính sách mục 10; tóm tắt ở mục 2, dữ liệu ở lại trên máy ở mục 3, kết nối mạng ở mục 4, dữ liệu máy chủ ở mục 5, bên xử lý ở mục 6, yêu cầu xóa ở mục 7). Báo cáo gắn với `device_id_hash` nên nối được với license và email; giữ 30 ngày, tối đa 3.000. Tính năng bật mặc định, kể cả với người dùng đã cài từ trước (chủ dự án chọn 2026-10-17: không hỏi, không thông báo trong app). **EULA không đổi** (giữ bản 1.3): EULA chỉ nói ứng dụng "không gửi âm thanh đi đâu" (vẫn đúng) và dẫn tới chính sách cho phần dữ liệu. Mục "Báo cáo lỗi" là mục 10, nên "Thay đổi chính sách" và "Liên hệ" thành mục 11 và 12; các mục 1 đến 9 giữ số để các tham chiếu "mục 5", "mục 6", "mục 7" và test của website vẫn đúng.

**Chính sách 1.4 thêm Gõ dịch** theo spec `2026-10-17-go-dich-design.md` (mục 6): chữ người dùng gõ ở ô soạn Gõ dịch và bản dịch chỉ nằm trong bộ nhớ, không ghi xuống đĩa, không gửi đi, không có trong log hay báo cáo lỗi (mục 2, 3, 10); ứng dụng chỉ ghi bản dịch vào clipboard; trên macOS, quyền Trợ năng chỉ dùng để gửi phím dán, ứng dụng không đọc chữ hay clipboard của ứng dụng khác (mục 3); không kết nối nào mang chữ gõ (mục 4). Không thêm kết nối mạng, bên xử lý hay dữ liệu máy chủ. **EULA không đổi** (giữ bản 1.3): mục 1 nói ứng dụng hiện phụ đề dịch và việc dịch chạy trên máy; Gõ dịch cũng dịch trên máy, không đổi quyền, nghĩa vụ hay dữ liệu rời máy. Ngày hiệu lực của chính sách 1.4 đặt theo mục "Đổi ngày hiệu lực" lúc phát hành bản app có Gõ dịch.

```

Cùng file, tìm đoạn (duy nhất):

```markdown
- **Đã làm (báo cáo lỗi, spec `2026-10-17-diagnostics-reports-design.md`):** chính sách mục 10 và các mục 2 đến 7 nhắc tới báo cáo lỗi; website sửa mọi trang nói "không tự gửi" (Trang chủ, Về chúng tôi, Hỏi đáp, Liên hệ, Khắc phục sự cố, Bắt đầu nhanh) và có mục Báo cáo lỗi ở Dữ liệu và bảo mật, kèm test chặn câu cũ; app có ô tích sẵn ở bước Điều khoản, công tắc ở Cài đặt › Quyền riêng tư và nút Gửi log cho hỗ trợ ở Giới thiệu.
- **Chưa làm:** trang giấy phép của bộ cài NSIS (Windows, làm ở đợt Windows); DMG của macOS không có trang giấy phép (đồng ý ở onboarding); hỏi lại khi điều khoản đổi phiên bản; lưu bằng chứng đồng ý EULA ở máy.
```

thay bằng:

```markdown
- **Đã làm (báo cáo lỗi, spec `2026-10-17-diagnostics-reports-design.md`):** chính sách mục 10 và các mục 2 đến 7 nhắc tới báo cáo lỗi; website sửa mọi trang nói "không tự gửi" (Trang chủ, Về chúng tôi, Hỏi đáp, Liên hệ, Khắc phục sự cố, Bắt đầu nhanh) và có mục Báo cáo lỗi ở Dữ liệu và bảo mật, kèm test chặn câu cũ; app có ô tích sẵn ở bước Điều khoản, công tắc ở Cài đặt › Quyền riêng tư và nút Gửi log cho hỗ trợ ở Giới thiệu.
- **Đã làm (Gõ dịch, spec `2026-10-17-go-dich-design.md`):** chính sách mục 2, 3, 4 và 10 nói chữ gõ ở lại trên máy, việc ghi vào clipboard và quyền Trợ năng; website có hướng dẫn Gõ dịch mới và sửa Tính năng, Trang chủ, Bảng giá, Hỏi đáp, Dữ liệu và bảo mật, Khắc phục sự cố, Thanh phụ đề và phím tắt; test `STALE_COMPOSE` chặn câu cũ.
- **Chưa làm:** trang giấy phép của bộ cài NSIS (Windows, làm ở đợt Windows); DMG của macOS không có trang giấy phép (đồng ý ở onboarding); hỏi lại khi điều khoản đổi phiên bản; lưu bằng chứng đồng ý EULA ở máy.
```

- [ ] **Step 6: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ pass 118`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep Tests
```
Expected: `Tests  19 passed (19)`.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add docs/legal website/test/site.test.mjs && git commit -q -m "docs(legal): chính sách quyền riêng tư nói về Gõ dịch (chữ gõ ở lại trên máy, clipboard, quyền Trợ năng)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: Ảnh chụp ô soạn và Cài đặt › Gõ dịch; chụp lại Cài đặt › Phím tắt

**Files:**
- Modify: `scripts/ui-preview/shoot.mjs`, `website/src/assets/img/app/manifest.json`
- Create: `website/src/assets/img/app/compose-done.{vi,en}.webp`, `website/src/assets/img/app/app-settings-compose.{vi,en}.webp`
- Modify: `website/src/assets/img/app/app-settings-hotkeys.{vi,en}.webp`

Ảnh làm trước các trang (trang dùng ảnh thì ảnh phải có sẵn, test kiểm). `shoot.mjs` chụp giao diện thật của app trên trang xem trước (IPC giả của kế hoạch 04): ô soạn ở `compose.html?state=done` (trang tự gõ chữ mẫu rồi dịch như thật), cắt đúng khung `.compose` trên nền trong suốt (website đặt nó trên nền tối, như ảnh thanh phụ đề), sau khi bỏ vùng chọn sẵn của bản nháp. Nhóm Phím tắt giờ có sáu dòng (dòng "Mở Gõ dịch"), nên chụp lại ảnh đó.

- [ ] **Step 1: Cảnh mới của `shoot.mjs`**

Trong `scripts/ui-preview/shoot.mjs`, tìm đoạn (duy nhất):

```js
  ["app-settings-hotkeys", "screen=settings&group=hotkeys"],
  ["app-settings-license", "screen=settings&group=license"],
```

thay bằng:

```js
  ["app-settings-hotkeys", "screen=settings&group=hotkeys"],
  ["app-settings-compose", "screen=settings&group=compose"],
  ["app-settings-license", "screen=settings&group=license"],
```

Cùng file, tìm đoạn (duy nhất):

```js
];
const OVERLAY = [
```

thay bằng:

```js
];
// Ô soạn Gõ dịch (compose.html, rộng 560 px như cửa sổ thật): trang tự gõ chữ mẫu rồi chờ dịch như thật; ảnh cắt đúng khung
// `.compose`, nền trong suốt (website đặt nó trên nền tối như thanh phụ đề).
const COMPOSE = [["compose-done", "state=done"]];
const OVERLAY = [
```

Cùng file, tìm đoạn (duy nhất):

```js

async function shoot(slug, lang, url, { width, height, dpr, dark, transparent, prepare, cropHeight, fit }) {
  const page = await browser.newPage({ width, height, dpr, dark });
```

thay bằng:

```js

async function shoot(slug, lang, url, { width, height, dpr, dark, transparent, prepare, cropHeight, fit, clipSelector }) {
  const page = await browser.newPage({ width, height, dpr, dark });
```

Cùng file, tìm đoạn (duy nhất):

```js
  // Ảnh thấp hơn cửa sổ: chỉ lấy phần trên cùng (`cropHeight` tính bằng điểm ảnh của file).
  const clip = cropHeight ? { x: 0, y: 0, width, height: cropHeight / dpr, scale: 1 } : undefined;
  const shot = await page.s.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
```

thay bằng:

```js
  // Ảnh thấp hơn cửa sổ: chỉ lấy phần trên cùng (`cropHeight` tính bằng điểm ảnh của file).
  // `clipSelector`: chỉ lấy khung của phần tử đó (tính bằng điểm CSS).
  const clip = clipSelector
    ? await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(clipSelector)}).getBoundingClientRect(); return { x: r.x, y: r.y, width: Math.ceil(r.width), height: Math.ceil(r.height), scale: 1 }; })()`)
    : cropHeight
      ? { x: 0, y: 0, width, height: cropHeight / dpr, scale: 1 }
      : undefined;
  const shot = await page.s.send("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
```

Cùng file, tìm đoạn (duy nhất):

```js
    }
    for (const [slug, query, opts] of OVERLAY.filter(want)) {
```

thay bằng:

```js
    }
    for (const [slug, query] of COMPOSE.filter(want)) {
      await shoot(slug, lang, `${BASE}/compose.html?${query}&lang=${lang}`, {
        width: 560,
        height: 420,
        dpr: 2,
        transparent: true,
        clipSelector: ".compose",
        // Ô soạn chọn sẵn bản nháp khi mở: bỏ vùng chọn để ảnh không có nền xám trên chữ.
        prepare: `(() => { const t = document.querySelector("textarea"); t.setSelectionRange(t.value.length, t.value.length); t.blur(); })()`,
      });
    }
    for (const [slug, query, opts] of OVERLAY.filter(want)) {
```

- [ ] **Step 2: Mục mới của manifest ảnh**

Mô tả trong manifest là chữ viết tay; `shoot.mjs` ghi lại `bytes`, `width`, `height` theo ảnh thật ở Step 3 (số dưới đây là số của lần chụp gốc).

Trong `website/src/assets/img/app/manifest.json`, tìm đoạn (duy nhất):

```json
  "height": 960,
  "bytes": 43446,
  "description": "Cài đặt phím tắt trên macOS: năm phím tắt toàn cục, ví dụ ⌃⌥T để bắt đầu hoặc dừng dịch."
 },
```

thay bằng:

```json
  "height": 960,
  "bytes": 45946,
  "description": "Cài đặt phím tắt trên macOS: sáu phím tắt toàn cục, ví dụ ⌃⌥T để bắt đầu hoặc dừng dịch và ⌃⌥G để mở Gõ dịch."
 },
```

Cùng file, tìm đoạn (duy nhất):

```json
  "height": 960,
  "bytes": 42152,
  "description": "Shortcut settings on macOS: five global shortcuts, for example ⌃⌥T to start or stop translating."
 },
```

thay bằng:

```json
  "height": 960,
  "bytes": 46966,
  "description": "Shortcut settings on macOS: six global shortcuts, for example ⌃⌥T to start or stop translating and ⌃⌥G to open Type & Translate."
 },
 {
  "file": "app-settings-compose.vi.webp",
  "slug": "app-settings-compose",
  "lang": "vi",
  "theme": "light",
  "width": 1440,
  "height": 960,
  "bytes": 51826,
  "description": "Cài đặt nhóm Gõ dịch trên macOS: công tắc Bật Gõ dịch, ô Dịch sang đang chọn Tự động, công tắc Tự dán vào ô đang gõ và dòng Quyền Trợ năng đã cấp kèm nút Mở cài đặt Trợ năng."
 },
 {
  "file": "app-settings-compose.en.webp",
  "slug": "app-settings-compose",
  "lang": "en",
  "theme": "light",
  "width": 1440,
  "height": 960,
  "bytes": 59240,
  "description": "The Type & Translate settings group on macOS: the Turn on Type & Translate switch, Translate into set to Automatic, the Paste into the chat box automatically switch and the Accessibility permission row showing Granted with an Open Accessibility settings button."
 },
```

Cùng file, tìm đoạn (duy nhất):

```json
  "description": "The subtitle bar in locked, click-through mode: no handle and no buttons, with three meeting sentences translated into English."
 }
```

thay bằng:

```json
  "description": "The subtitle bar in locked, click-through mode: no handle and no buttons, with three meeting sentences translated into English."
 },
 {
  "file": "compose-done.vi.webp",
  "slug": "compose-done",
  "lang": "vi",
  "theme": "light",
  "width": 1120,
  "height": 464,
  "bytes": 17800,
  "description": "Ô soạn Gõ dịch khi bản dịch đã xong: tin nhắn tiếng Việt trong ô gõ, bản dịch tiếng Anh bên dưới, chân ô ghi Enter: dán, Shift+Enter: xuống dòng, Esc: đóng."
 },
 {
  "file": "compose-done.en.webp",
  "slug": "compose-done",
  "lang": "en",
  "theme": "light",
  "width": 1120,
  "height": 464,
  "bytes": 18460,
  "description": "The Type & Translate box once the translation is ready: an English message in the text box, the Vietnamese translation below, and the footer Enter: paste, Shift+Enter: new line, Esc: close."
 }
```

- [ ] **Step 3: Chụp**

Chạy trang xem trước ở nền (cổng 1430; nhớ tắt ở Step 5):

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1430 --strictPort
```

Khi `curl -sf http://127.0.0.1:1430/compose.html` trả về được:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && node scripts/ui-preview/shoot.mjs --port=1430 compose-done app-settings-compose app-settings-hotkeys
```
Expected: sáu dòng `<tên>.<vi|en>.webp <số> B`, không lỗi.

- [ ] **Step 4: Xem từng ảnh**

Mở sáu ảnh bằng công cụ đọc ảnh. Kiểm: `compose-done`: dòng đầu "Gõ dịch · → English" (vi) hay "Type & Translate · → Tiếng Việt" (en), chữ trong ô gõ **không** bị bôi nền xám, bản dịch rõ (không mờ), chân ô ghi gợi ý phím, bốn góc trong suốt; `app-settings-compose`: bốn dòng (Bật Gõ dịch, Dịch sang "Tự động (đang là English)", Tự dán, Quyền Trợ năng "Đã cấp."); `app-settings-hotkeys`: sáu dòng, dòng cuối "Mở Gõ dịch" / "Open Type & Translate" với ⌃⌥G. Sai thì sửa rồi chụp lại, không đăng ảnh sai.

- [ ] **Step 5: Tắt trang xem trước, chạy test, commit**

Dừng lệnh nền ở Step 3, rồi:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && (lsof -nP -iTCP:1430 -sTCP:LISTEN || echo CONG-1430-DA-DONG)
```
Expected: `CONG-1430-DA-DONG`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ pass 118`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add scripts/ui-preview/shoot.mjs website/src/assets/img/app && git commit -q -m "test(go-dich): ảnh ô soạn và Cài đặt › Gõ dịch cho website, chụp lại Phím tắt sáu dòng" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Trang hướng dẫn Gõ dịch, mục lục Hướng dẫn, bảng phím tắt

**Files:**
- Create: `website/src/content/vi/guide-type-translate.mjs`, `website/src/content/en/guide-type-translate.mjs`
- Modify: `website/src/content/index.mjs`, `website/src/content/{vi,en}/guide.mjs`, `website/src/content/{vi,en}/guide-glossary.mjs`, `website/src/content/{vi,en}/guide-subtitle-bar.mjs`

Trang mới theo khuôn các bài hướng dẫn sẵn có (xem `vi/guide-glossary.mjs`): `pageHero`, bảng tóm tắt `facts`, `docLayout` có mục lục, HowTo JSON-LD, `docNav`. Mọi chữ trích từ app (nhãn, câu báo) đúng nguyên văn từ điển của app. Bài đứng giữa "Thanh phụ đề và phím tắt" và "Dùng từ điển thuật ngữ". Mục lục Hướng dẫn lên mười bài; lưới "Dùng hằng ngày" đổi sang hai cột (bốn thẻ). Bảng phím tắt thêm dòng mở ô soạn.

- [ ] **Step 1: Trang tiếng Việt**

Tạo `website/src/content/vi/guide-type-translate.mjs`:

```js
import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Trang chủ", path: "/" },
  { name: "Hướng dẫn", path: "/huong-dan/" },
  { name: "Gõ dịch tin nhắn", path: "/huong-dan/go-dich/" },
];

const toc = [
  { level: 2, id: "cach-dung", text: "Gõ dịch dùng thế nào" },
  { level: 2, id: "phim", text: "Phím trong ô soạn" },
  { level: 2, id: "ngon-ngu", text: "Dịch sang ngôn ngữ nào" },
  { level: 2, id: "quyen-tro-nang", text: "Tự dán trên macOS: quyền Trợ năng" },
  { level: 2, id: "windows", text: "Trên Windows" },
  { level: 2, id: "khi-khong-dan-duoc", text: "Giới hạn và khi không dán được" },
  { level: 2, id: "rieng-tu", text: "Chữ bạn gõ đi đâu" },
];

export default {
  id: "guide-type-translate",
  lang: "vi",
  path: "/huong-dan/go-dich/",
  title: "Gõ dịch: soạn tin bằng tiếng Việt, dán vào ô chat",
  description:
    "Hướng dẫn Gõ dịch của AI Translator: bấm ⌃⌥G hoặc Ctrl+Alt+G, gõ tin nhắn bằng tiếng của bạn, Enter để dán bản dịch vào ô chat của app bất kỳ.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-17",
  llm: "Hướng dẫn Gõ dịch: mở ô soạn bằng ⌃⌥G (Ctrl+Alt+G), gõ tin nhắn, Enter dán bản dịch vào ô chat của app đang dùng; ngôn ngữ đích, quyền Trợ năng trên macOS, giới hạn và quyền riêng tư.",
  llmTitle: "Gõ dịch tin nhắn trong AI Translator",
  schema: [
    howTo({
      name: "Gửi tin nhắn đã dịch bằng Gõ dịch của AI Translator",
      description: "Soạn tin bằng tiếng của bạn trong ô soạn của AI Translator, dán bản dịch vào ô chat rồi gửi.",
      totalTime: "PT1M",
      steps: [
        { name: "Đặt con trỏ vào ô chat", text: "Mở app chat hay trang web bạn đang dùng và bấm vào ô nhập tin nhắn." },
        { name: "Mở ô soạn", text: "Bấm ⌃⌥G trên macOS hoặc Ctrl+Alt+G trên Windows. Ô soạn Gõ dịch hiện giữa màn hình, con trỏ nằm sẵn trong ô gõ." },
        { name: "Gõ tin nhắn", text: "Gõ bằng tiếng của bạn, Telex hay VNI đều được. Ngừng gõ một chút thì bản dịch hiện bên dưới." },
        { name: "Bấm Enter để dán", text: "Ô soạn đóng và bản dịch được dán vào ô chat. Chưa có gì được gửi đi." },
        { name: "Bấm Enter lần nữa để gửi", text: "Xem lại bản dịch trong ô chat, rồi bấm Enter của app chat để gửi." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Gõ dịch tin nhắn",
  lead: "Gõ dịch giúp bạn nhắn tin cho người nói tiếng khác ở bất kỳ ô chat nào: trình duyệt, app chat, khung chat của app họp. Bạn gõ bằng tiếng của mình trong một ô soạn nổi, AI Translator dịch ngay trên máy, rồi dán bản dịch vào ô chat để bạn xem lại và gửi.",
  meta: `<span>Cập nhật {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "Trong bài này",
  body: `
${facts([
  ["Phím tắt", "⌃⌥G trên macOS, Ctrl+Alt+G trên Windows<small>Đổi ở Cài đặt › Phím tắt</small>"],
  ["Gói", "Mọi gói còn hiệu lực<small>Kể cả Free trong thời gian dùng thử; không trừ thời lượng dịch</small>"],
  ["Ngôn ngữ", "English, 中文, 日本語, 한국어, Tiếng Việt<small>Mặc định là tiếng của người bên kia</small>"],
  ["Độ dài", "Tối đa 4000 ký tự mỗi tin<small>Dòng quá dài thì tách ra</small>"],
  ["Mạng", "Không cần<small>Dịch trên máy bạn</small>"],
  ["Tự dán trên macOS", "Cần quyền Trợ năng<small>Chưa có quyền thì app chép bản dịch để bạn tự dán</small>"],
])}

<h2 id="cach-dung">Gõ dịch dùng thế nào?</h2>
<ol>
<li>Bấm vào ô chat của app bạn đang dùng (Messenger, Slack, Zalo, khung chat của Zoom…), như khi định gõ tin.</li>
<li>Bấm ${keys(["⌃", "⌥", "G"])} trên macOS hoặc ${keys(["Ctrl", "Alt", "G"])} trên Windows. Ô soạn <strong>Gõ dịch</strong> hiện giữa màn hình có con trỏ chuột, con trỏ nằm sẵn trong ô gõ. App chat vẫn ở phía trước, ô chat của nó không mất chữ đang có.</li>
<li>Gõ tin nhắn bằng tiếng của bạn. Bộ gõ Telex, VNI chạy như ở mọi ô nhập khác. Ngừng gõ khoảng nửa giây thì AI Translator dịch toàn bộ chữ đang có và bản dịch hiện dần bên dưới. Gõ tiếp thì app dịch lại.</li>
<li>Bấm <strong>Enter</strong>. Ô soạn đóng, con trỏ về ô chat cũ và bản dịch được dán vào đó. <strong>Chưa có gì được gửi đi.</strong></li>
<li>Xem lại bản dịch trong ô chat, sửa nếu cần, rồi bấm Enter (của app chat) để gửi.</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "vi",
  alt: "Ô soạn Gõ dịch: dòng đầu ghi Gõ dịch và ngôn ngữ đích English, ô gõ có một tin nhắn tiếng Việt, bên dưới là bản dịch tiếng Anh, chân ô ghi Enter: dán, Shift+Enter: xuống dòng, Esc: đóng",
  caption: "Ô soạn Gõ dịch khi bản dịch đã xong: bấm Enter để dán vào ô chat.",
})}
<p>Dòng đầu của ô soạn ghi ngôn ngữ đang dịch sang và trạng thái: “Đang nạp model…” (lần đầu dùng sau một lúc app rảnh), “Đang dịch…”, hay “Đã là English” khi tin của bạn đã ở đúng ngôn ngữ đích (Enter khi đó dán nguyên văn). Bản dịch hiện mờ khi chưa khớp chữ bạn đang có.</p>
<p>Bản nháp được giữ khi bạn đóng ô soạn bằng Esc, bằng phím tắt hay bằng cách bấm ra ngoài. Mở lại thì chữ cũ còn đó và được chọn sẵn, gõ đè được ngay. Dán xong thì ô trống; bản nháp mất khi thoát app.</p>
${callout({
  title: "Cần đã tải model, như khi dịch phụ đề.",
  text: "Gõ dịch dùng cùng model dịch với phụ đề, nên cần gói model đã tải xong (Cài đặt › Model). Dùng được cả khi đang dịch phụ đề; khi đó mỗi lần dịch tin có thể làm phụ đề hiện chậm thêm một chút. Gõ dịch không dùng từ điển thuật ngữ.",
})}

<h2 id="phim">Phím trong ô soạn</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Phím</th><th scope="col">Tác dụng</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>Dán bản dịch vào ô chat. Đang dịch thì dịch xong mới dán. Dịch lỗi thì dịch lại: app <strong>không bao giờ dán câu gốc</strong> khi dịch lỗi. Ô trống thì đóng.</td></tr>
<tr><th scope="row">Shift+Enter</th><td>Xuống dòng. Mỗi dòng được dịch riêng, bản dịch giữ đúng các dòng của bạn.</td></tr>
<tr><th scope="row">Esc</th><td>Đóng ô soạn, không dán, giữ bản nháp.</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>Khi ô soạn đang mở: đóng như Esc.</td></tr>
<tr><th scope="row">Bấm ra ngoài ô soạn</th><td>Đóng như Esc.</td></tr>
</tbody></table></div>
<p>Khi bộ gõ đang chọn chữ (bộ gõ tiếng Nhật, tiếng Trung, tiếng Hàn), Enter chỉ chốt chữ của bộ gõ, không dán. Phím tắt mở ô soạn đổi được ở <strong>Cài đặt › Phím tắt</strong>, dòng “Mở Gõ dịch” (xem <a href="/huong-dan/thanh-phu-de-va-phim-tat/">thanh phụ đề và phím tắt</a>).</p>

<h2 id="ngon-ngu">Dịch sang ngôn ngữ nào?</h2>
<p>Mặc định là <strong>tiếng của người bên kia</strong>, tính từ cài đặt phụ đề: “Tự động lấy tiếng của người bên kia theo cài đặt phụ đề: ngôn ngữ của cuộc họp nếu chỉ có một, không thì English (Tiếng Việt khi phụ đề đang dịch sang English).” Ví dụ bạn đọc phụ đề tiếng Việt và khóa ngôn ngữ nguồn là tiếng Nhật thì Gõ dịch dịch sang tiếng Nhật.</p>
<p>Muốn cố định một ngôn ngữ, mở <strong>Cài đặt › Gõ dịch</strong> và chọn ở ô <strong>Dịch sang</strong>: “Tự động (đang là …)” hoặc một trong năm ngôn ngữ. Ở đây cũng có công tắc <strong>Bật Gõ dịch</strong>: tắt thì phím tắt của ô soạn không còn tác dụng (phím đã chọn vẫn được giữ).</p>
${appShot({
  slug: "app-settings-compose",
  lang: "vi",
  alt: "Cài đặt nhóm Gõ dịch: công tắc Bật Gõ dịch, ô Dịch sang đang chọn Tự động, công tắc Tự dán vào ô đang gõ và dòng Quyền Trợ năng đã cấp kèm nút Mở cài đặt Trợ năng",
  caption: "Cài đặt › Gõ dịch trên macOS.",
})}

<h2 id="quyen-tro-nang">Tự dán trên macOS: quyền Trợ năng</h2>
<p>Để tự dán bản dịch vào app khác, macOS yêu cầu quyền <strong>Trợ năng</strong> (Accessibility). AI Translator chỉ dùng quyền này để gửi tổ hợp dán ⌘V vào ô chat bạn đang gõ; app không đọc chữ hay nội dung của app khác.</p>
<ol>
<li>Lần đầu bạn bấm Enter khi chưa có quyền, ô soạn không đóng: bản dịch đã được chép và ô soạn ghi “Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator.” Bạn có thể bấm Enter hay Esc rồi tự bấm ⌘V ở ô chat.</li>
<li>Bấm <strong>Bật tự dán</strong>. macOS mở System Settings › Quyền riêng tư &amp; Bảo mật › Trợ năng; bật công tắc của AI Translator.</li>
<li>Không muốn cấp quyền thì bấm <strong>Luôn chỉ chép</strong>: từ đó Enter chỉ chép bản dịch rồi đóng ô soạn, bạn tự dán bằng ⌘V. Đổi lại ở <strong>Cài đặt › Gõ dịch › Tự dán vào ô đang gõ</strong>.</li>
</ol>
<p>Trạng thái quyền hiện ở Cài đặt › Gõ dịch, dòng <strong>Quyền Trợ năng</strong> (“Đã cấp.” hay “Chưa cấp. …”), kèm nút <strong>Mở cài đặt Trợ năng</strong>.</p>
${callout({
  kind: "warn",
  title: "Sau khi cập nhật app, có thể phải bật lại quyền.",
  text: "Bản macOS hiện chưa được ký bằng chứng thư nhà phát triển của Apple, nên sau mỗi lần cập nhật macOS có thể coi AI Translator là app khác: mục của app trong Trợ năng vẫn bật mà app vẫn báo chưa cấp. Khi đó hãy xóa AI Translator khỏi danh sách (nút −) rồi thêm lại (nút +), hoặc tắt rồi bật lại công tắc. Trong lúc chưa có quyền, Gõ dịch vẫn chép bản dịch để bạn tự dán.",
})}

<h2 id="windows">Trên Windows</h2>
<p>Windows không cần cấp quyền. Khi bạn bấm Enter, AI Translator đưa cửa sổ bạn đang chat về phía trước rồi gửi Ctrl+V. Nếu cửa sổ đó đã đóng, hay không lên được phía trước kịp, app chỉ chép bản dịch (không gửi phím vào cửa sổ khác) để bạn tự dán bằng Ctrl+V.</p>
<p class="small muted">Bản Windows có đủ tính năng này nhưng chúng tôi chưa thử nó trên máy Windows thật. Nếu gặp lỗi, hãy báo cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>.</p>

<h2 id="khi-khong-dan-duoc">Giới hạn và khi không dán được</h2>
<ul>
<li><strong>Bản dịch luôn ở trong clipboard.</strong> Sau khi dán, bản dịch vẫn nằm trong clipboard (nội dung cũ của clipboard bị thay). Nếu chữ không vào ô chat, hãy bấm vào ô đó rồi tự dán bằng ⌘V hay Ctrl+V.</li>
<li><strong>Một số ô không nhận dán tự động:</strong> ô mật khẩu (macOS chặn phím gửi từ app khác), app đang chạy với quyền quản trị trên Windows, và app tự chặn việc dán. App không biết được những trường hợp này.</li>
<li><strong>Tối đa 4000 ký tự mỗi tin.</strong> Một dòng quá dài thì ô soạn báo “Một dòng quá dài để dịch. Hãy tách thành nhiều dòng hay nhiều tin.”</li>
<li><strong>Dịch lỗi:</strong> ô soạn báo “Chưa dịch được. Bấm Enter để thử lại.”</li>
<li><strong>Phím tắt không mở ô soạn:</strong> kiểm Cài đặt › Gõ dịch đã bật; trên Windows, phím có thể đang bị app khác giữ (Cài đặt › Phím tắt báo phím chưa đăng ký được), hãy đổi sang phím khác. Trên macOS, nếu một app khác cũng dùng ⌃⌥G thì hãy đổi phím của một bên.</li>
</ul>
<p>Các lỗi khác (chưa tải model, hết dùng thử, key bị khóa) hiện trong ô soạn kèm nút mở đúng màn hình của app. Xem thêm <a href="/huong-dan/khac-phuc-su-co/">khắc phục sự cố</a>.</p>

<h2 id="rieng-tu">Chữ bạn gõ đi đâu?</h2>
<p>Không đi đâu cả. Chữ bạn gõ và bản dịch chỉ nằm trong bộ nhớ của AI Translator trên máy bạn: không gửi qua mạng, không ghi xuống đĩa, không có trong log hay báo cáo lỗi. App chỉ <strong>ghi</strong> bản dịch vào clipboard để dán, không đọc clipboard hay chữ của app khác. Xem <a href="/bao-mat-du-lieu/">dữ liệu và bảo mật</a>.</p>
`,
})}
${docNav(
  [
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài trước", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/tu-dien-thuat-ngu/", kicker: "Bài tiếp theo", title: "Dùng từ điển thuật ngữ" },
  ],
  "Bài liên quan",
)}
</div></section>
`,
};
```

- [ ] **Step 2: Trang tiếng Anh**

Tạo `website/src/content/en/guide-type-translate.mjs`:

```js
import { pageHero, callout, facts, appShot, overlayShot, keys, docLayout, docNav } from "../../build/components.mjs";
import { howTo } from "../../build/schema.mjs";

const crumbs = [
  { name: "Home", path: "/en/" },
  { name: "Guides", path: "/en/guide/" },
  { name: "Type & Translate", path: "/en/guide/type-and-translate/" },
];

const toc = [
  { level: 2, id: "how-to-use", text: "How Type & Translate works" },
  { level: 2, id: "keys", text: "Keys in the compose box" },
  { level: 2, id: "language", text: "Which language it translates into" },
  { level: 2, id: "accessibility", text: "Auto-paste on macOS: Accessibility" },
  { level: 2, id: "windows", text: "On Windows" },
  { level: 2, id: "when-paste-fails", text: "Limits and when pasting fails" },
  { level: 2, id: "privacy", text: "Where your text goes" },
];

export default {
  id: "guide-type-translate",
  lang: "en",
  path: "/en/guide/type-and-translate/",
  title: "Type & Translate: translate and paste chat messages",
  description:
    "How to use Type & Translate in AI Translator: press ⌃⌥G or Ctrl+Alt+G, type in your own language, press Enter to paste the translation into any chat box.",
  breadcrumbs: crumbs,
  type: "article",
  schemaType: "TechArticle",
  published: "2026-10-17",
  modified: "2026-10-17",
  llm: "Guide to Type & Translate: open the compose box with ⌃⌥G (Ctrl+Alt+G), type a message, press Enter to paste the translation into the chat box of the app you are using; target language, the Accessibility permission on macOS, limits and privacy.",
  llmTitle: "Type & Translate in AI Translator",
  schema: [
    howTo({
      name: "Send a translated message with Type & Translate in AI Translator",
      description: "Write a message in your own language in the AI Translator compose box, paste the translation into a chat box and send it.",
      totalTime: "PT1M",
      steps: [
        { name: "Click into the chat box", text: "Open the chat app or web page you are using and click the box where you type messages." },
        { name: "Open the compose box", text: "Press ⌃⌥G on macOS or Ctrl+Alt+G on Windows. The Type & Translate box appears in the middle of the screen with the cursor already in it." },
        { name: "Type your message", text: "Type in your own language. Pause for a moment and the translation appears below." },
        { name: "Press Enter to paste", text: "The compose box closes and the translation is pasted into the chat box. Nothing has been sent yet." },
        { name: "Press Enter again to send", text: "Check the translation in the chat box, then press the chat app's Enter to send it." },
      ],
    }),
  ],
  body: () => `
${pageHero({
  crumbs,
  title: "Type & Translate",
  lead: "Type & Translate lets you message people who speak another language from any chat box: a browser, a chat app, the chat panel of a meeting app. You type in your own language in a floating compose box, AI Translator translates it on your computer, then pastes the translation into the chat box for you to check and send.",
  meta: `<span>Updated {{updated}}</span>`,
})}

<section class="section-tight"><div class="container">
${docLayout({
  toc,
  tocTitle: "In this guide",
  body: `
${facts([
  ["Shortcut", "⌃⌥G on macOS, Ctrl+Alt+G on Windows<small>Change it in Settings › Shortcuts</small>"],
  ["Plans", "Every active plan<small>Including Free during the trial; does not use translation time</small>"],
  ["Languages", "English, 中文, 日本語, 한국어, Tiếng Việt<small>By default, the language of the people you talk to</small>"],
  ["Length", "Up to 4000 characters per message<small>Split lines that are too long</small>"],
  ["Network", "Not needed<small>Translated on your computer</small>"],
  ["Auto-paste on macOS", "Needs the Accessibility permission<small>Without it, the app copies the translation for you to paste</small>"],
])}

<h2 id="how-to-use">How does Type &amp; Translate work?</h2>
<ol>
<li>Click into the chat box of the app you are using (Messenger, Slack, Zalo, the Zoom chat…), as if you were about to type.</li>
<li>Press ${keys(["⌃", "⌥", "G"])} on macOS or ${keys(["Ctrl", "Alt", "G"])} on Windows. The <strong>Type &amp; Translate</strong> box appears in the middle of the screen that has the mouse pointer, with the cursor already in it. The chat app stays in front and keeps whatever is in its chat box.</li>
<li>Type your message in your own language. Pause for about half a second and AI Translator translates everything you have typed; the translation appears below as it is written. Keep typing and it translates again.</li>
<li>Press <strong>Enter</strong>. The compose box closes, the cursor goes back to the chat box and the translation is pasted there. <strong>Nothing has been sent yet.</strong></li>
<li>Check the translation in the chat box, edit it if needed, then press Enter (in the chat app) to send it.</li>
</ol>
${overlayShot({
  slug: "compose-done",
  lang: "en",
  alt: "The Type & Translate box: the top line shows Type & Translate and the target language Vietnamese, the text box holds a short English message, the Vietnamese translation is below, and the footer says Enter: paste, Shift+Enter: new line, Esc: close",
  caption: "The Type & Translate box once the translation is ready: press Enter to paste it into the chat box.",
})}
<p>The top line of the compose box shows the language it translates into and what it is doing: “Loading models…” (the first time after the app has been idle for a while), “Translating…”, or “Already in English” when your message is already in the target language (Enter then pastes it as you typed it). The translation is shown faded while it does not match your text yet.</p>
<p>Your draft is kept when you close the compose box with Esc, with the shortcut or by clicking outside it. Open it again and your text is still there, already selected so you can type over it. After pasting, the box is empty; the draft is lost when you quit the app.</p>
${callout({
  title: "The models must be downloaded, as for subtitles.",
  text: "Type & Translate uses the same translation model as the subtitles, so it needs a downloaded model pack (Settings › Model). It also works while subtitles are running; then each message you translate can make the subtitles appear a little later. Type & Translate does not use the glossary.",
})}

<h2 id="keys">Keys in the compose box</h2>
<div class="table-wrap"><table>
<thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead>
<tbody>
<tr><th scope="row">Enter</th><td>Pastes the translation into the chat box. While translating, it pastes once the translation is done. If translating failed, it translates again: the app <strong>never pastes your original text</strong> after a failed translation. In an empty box, it closes the box.</td></tr>
<tr><th scope="row">Shift+Enter</th><td>New line. Each line is translated separately and the translation keeps your lines.</td></tr>
<tr><th scope="row">Esc</th><td>Closes the compose box without pasting and keeps your draft.</td></tr>
<tr><th scope="row">${keys(["⌃", "⌥", "G"])} / ${keys(["Ctrl", "Alt", "G"])}</th><td>While the compose box is open: closes it, like Esc.</td></tr>
<tr><th scope="row">Clicking outside the box</th><td>Closes it, like Esc.</td></tr>
</tbody></table></div>
<p>While an input method is choosing characters (Japanese, Chinese or Korean input), Enter only confirms the characters and does not paste. You can change the shortcut in <strong>Settings › Shortcuts</strong>, on the “Open Type &amp; Translate” row (see <a href="/en/guide/subtitle-bar-and-shortcuts/">subtitle bar and shortcuts</a>).</p>

<h2 id="language">Which language does it translate into?</h2>
<p>By default, <strong>the language of the people you talk to</strong>, worked out from the subtitle settings: “Automatic uses the language of the people you talk to, from the subtitle settings: the meeting language if there is only one, otherwise English (Vietnamese when the subtitles are in English).” For example, if you read subtitles in Vietnamese and have locked the source language to Japanese, Type &amp; Translate translates into Japanese.</p>
<p>To always use one language, open <strong>Settings › Type &amp; Translate</strong> and choose it under <strong>Translate into</strong>: “Automatic (now …)” or one of the five languages. This group also has the <strong>Turn on Type &amp; Translate</strong> switch: when it is off, the compose box shortcut does nothing (the shortcut you chose is kept).</p>
${appShot({
  slug: "app-settings-compose",
  lang: "en",
  alt: "The Type & Translate settings group: the Turn on Type & Translate switch, Translate into set to Automatic, the Paste into the chat box automatically switch and the Accessibility permission row showing Granted with an Open Accessibility settings button",
  caption: "Settings › Type & Translate on macOS.",
})}

<h2 id="accessibility">Auto-paste on macOS: the Accessibility permission</h2>
<p>To paste the translation into another app for you, macOS requires the <strong>Accessibility</strong> permission. AI Translator uses it only to send the ⌘V paste keys to the chat box you are typing in; the app does not read text or content from other apps.</p>
<ol>
<li>The first time you press Enter without the permission, the compose box stays open: the translation has been copied and the box says “Translation copied. To let AI Translator paste it for you, allow it in Accessibility.” You can press Enter or Esc and paste with ⌘V in the chat box yourself.</li>
<li>Click <strong>Turn on auto-paste</strong>. macOS opens System Settings › Privacy &amp; Security › Accessibility; turn on the switch for AI Translator.</li>
<li>If you do not want to grant it, click <strong>Always copy only</strong>: from then on Enter only copies the translation and closes the compose box, and you paste with ⌘V. Change this back in <strong>Settings › Type &amp; Translate › Paste into the chat box automatically</strong>.</li>
</ol>
<p>The permission status is shown in Settings › Type &amp; Translate, on the <strong>Accessibility permission</strong> row (“Granted.” or “Not granted. …”), next to an <strong>Open Accessibility settings</strong> button.</p>
${callout({
  kind: "warn",
  title: "After an app update, you may have to turn the permission on again.",
  text: "The macOS version is not yet signed with an Apple developer certificate, so after each update macOS may treat AI Translator as a different app: its entry in Accessibility is still on but the app still says it is not granted. Then remove AI Translator from the list (the − button) and add it again (the + button), or turn its switch off and on again. Until it has the permission, Type & Translate still copies the translation for you to paste.",
})}

<h2 id="windows">On Windows</h2>
<p>Windows needs no permission. When you press Enter, AI Translator brings the window you were chatting in back to the front and sends Ctrl+V. If that window has closed, or does not come to the front in time, the app only copies the translation (it does not send keys to another window) so you can paste it with Ctrl+V yourself.</p>
<p class="small muted">The Windows version includes this feature, but we have not yet tried it on a real Windows computer. If something goes wrong, please tell us on the <a href="/en/contact/">contact</a> page.</p>

<h2 id="when-paste-fails">Limits and when pasting fails</h2>
<ul>
<li><strong>The translation is always on the clipboard.</strong> After pasting, the translation stays on the clipboard (it replaces what was there). If the text does not appear in the chat box, click into it and paste with ⌘V or Ctrl+V yourself.</li>
<li><strong>Some boxes do not accept automatic pasting:</strong> password fields (macOS blocks keys sent by other apps there), apps running as administrator on Windows, and apps that block pasting. The app cannot detect these cases.</li>
<li><strong>Up to 4000 characters per message.</strong> When one line is too long, the compose box says “A line is too long to translate. Split it into several lines or messages.”</li>
<li><strong>Translation failed:</strong> the compose box says “Could not translate this text. Press Enter to try again.”</li>
<li><strong>The shortcut does not open the compose box:</strong> check that Settings › Type &amp; Translate is turned on; on Windows another app may hold the shortcut (Settings › Shortcuts shows it as not registered), so choose another one. On macOS, if another app also uses ⌃⌥G, change the shortcut of one of them.</li>
</ul>
<p>Other errors (models not downloaded, trial ended, key locked) appear in the compose box with a button that opens the right screen of the app. See also <a href="/en/guide/troubleshooting/">troubleshooting</a>.</p>

<h2 id="privacy">Where does your text go?</h2>
<p>Nowhere. The text you type and its translation stay only in AI Translator's memory on your computer: they are not sent over the network, not written to disk, and not in logs or error reports. The app only <strong>writes</strong> the translation to the clipboard to paste it; it does not read the clipboard or text from other apps. See <a href="/en/data-security/">data and security</a>.</p>
`,
})}
${docNav(
  [
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Previous", title: "Subtitle bar and shortcuts" },
    { href: "/en/guide/glossary/", kicker: "Next", title: "Use the glossary" },
  ],
  "Related guides",
)}
</div></section>
`,
};
```

- [ ] **Step 3: Danh mục trang**

Trong `website/src/content/index.mjs`, tìm đoạn (duy nhất):

```js
  "solutions", "solutions-meetings", "solutions-webinar",
  "guide", "guide-quick-start", "guide-install-macos", "guide-install-windows", "guide-audio-permission", "guide-subtitle-bar", "guide-glossary",
  "guide-history-export", "guide-license", "guide-troubleshooting",
```

thay bằng:

```js
  "solutions", "solutions-meetings", "solutions-webinar",
  "guide", "guide-quick-start", "guide-install-macos", "guide-install-windows", "guide-audio-permission", "guide-subtitle-bar", "guide-type-translate", "guide-glossary",
  "guide-history-export", "guide-license", "guide-troubleshooting",
```

Cùng file, tìm đoạn (duy nhất):

```js
  guide: "guide", "guide-quick-start": "guide-quick-start", "guide-install-macos": "guide-install-macos", "guide-install-windows": "guide-install-windows",
  "guide-audio-permission": "guide-audio-permission", "guide-subtitle-bar": "guide-subtitle-bar", "guide-glossary": "guide-glossary",
  "guide-history-export": "guide-history-export", "guide-license": "guide-license", "guide-troubleshooting": "guide-troubleshooting",
```

thay bằng:

```js
  guide: "guide", "guide-quick-start": "guide-quick-start", "guide-install-macos": "guide-install-macos", "guide-install-windows": "guide-install-windows",
  "guide-audio-permission": "guide-audio-permission", "guide-subtitle-bar": "guide-subtitle-bar",
  "guide-type-translate": "guide-type-translate", "guide-glossary": "guide-glossary",
  "guide-history-export": "guide-history-export", "guide-license": "guide-license", "guide-troubleshooting": "guide-troubleshooting",
```

- [ ] **Step 4: Mục lục Hướng dẫn**

Trong `website/src/content/vi/guide.mjs`, tìm đoạn (duy nhất):

```js
  description:
    "Chín bài hướng dẫn từng bước: cài trên macOS và Windows, cấp quyền ghi âm, phím tắt, từ điển thuật ngữ, xuất bản chép lời, mua key và sửa lỗi thường gặp.",
  schemaType: "CollectionPage",
```

thay bằng:

```js
  description:
    "Mười bài hướng dẫn từng bước: cài trên macOS và Windows, cấp quyền ghi âm, phím tắt, Gõ dịch, từ điển thuật ngữ, xuất bản chép lời, mua key và sửa lỗi.",
  schemaType: "CollectionPage",
```

Cùng file, tìm đoạn (duy nhất):

```js
  modified: "2026-10-14",
  llm: "Mục lục chín bài hướng dẫn sử dụng AI Translator: bắt đầu nhanh, cài đặt macOS, cài đặt Windows, cấp quyền ghi âm trên macOS, thanh phụ đề và phím tắt, từ điển thuật ngữ, lịch sử và xuất file, mua và kích hoạt key, khắc phục sự cố.",
  llmTitle: "Hướng dẫn sử dụng AI Translator",
```

thay bằng:

```js
  modified: "2026-10-14",
  llm: "Mục lục mười bài hướng dẫn sử dụng AI Translator: bắt đầu nhanh, cài đặt macOS, cài đặt Windows, cấp quyền ghi âm trên macOS, thanh phụ đề và phím tắt, Gõ dịch tin nhắn, từ điển thuật ngữ, lịch sử và xuất file, mua và kích hoạt key, khắc phục sự cố.",
  llmTitle: "Hướng dẫn sử dụng AI Translator",
```

Cùng file, tìm đoạn (duy nhất):

```js
  title: "Hướng dẫn sử dụng AI Translator",
  lead: "Chín bài hướng dẫn từng bước cho AI Translator, từ cài đặt trên macOS và Windows tới mua key và xử lý sự cố. Mỗi bài dùng đúng tên nút và tên mục trong app; phần lớn có ảnh chụp giao diện thật.",
})}
```

thay bằng:

```js
  title: "Hướng dẫn sử dụng AI Translator",
  lead: "Mười bài hướng dẫn từng bước cho AI Translator, từ cài đặt trên macOS và Windows tới mua key và xử lý sự cố. Mỗi bài dùng đúng tên nút và tên mục trong app; phần lớn có ảnh chụp giao diện thật.",
})}
```

Cùng file, tìm đoạn (duy nhất):

```js
<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Dùng hằng ngày", title: "Làm chủ thanh phụ đề, từ điển và bản chép lời" })}
<div class="grid grid-3">
${linkCard({ href: "/huong-dan/thanh-phu-de-va-phim-tat/", icon: "captions", title: "Thanh phụ đề và phím tắt", text: "Kéo, khóa, ẩn và cuộn thanh phụ đề, chỉnh cỡ chữ và màu, bảng phím tắt và menu ở menu bar.", more: MORE })}
${linkCard({ href: "/huong-dan/tu-dien-thuat-ngu/", icon: "book", title: "Dùng từ điển thuật ngữ", text: "Thêm tên riêng và thuật ngữ, nhập xuất CSV, và hiểu vì sao từ điển chỉ là gợi ý cho bộ dịch.", more: MORE })}
```

thay bằng:

```js
<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Dùng hằng ngày", title: "Làm chủ thanh phụ đề, Gõ dịch, từ điển và bản chép lời" })}
<div class="grid grid-2">
${linkCard({ href: "/huong-dan/thanh-phu-de-va-phim-tat/", icon: "captions", title: "Thanh phụ đề và phím tắt", text: "Kéo, khóa, ẩn và cuộn thanh phụ đề, chỉnh cỡ chữ và màu, bảng phím tắt và menu ở menu bar.", more: MORE })}
${linkCard({ href: "/huong-dan/go-dich/", icon: "message", title: "Gõ dịch tin nhắn", text: "Bấm ⌃⌥G (Ctrl+Alt+G) ở ô chat bất kỳ, gõ bằng tiếng của bạn, Enter để dán bản dịch; quyền Trợ năng trên macOS.", more: MORE })}
${linkCard({ href: "/huong-dan/tu-dien-thuat-ngu/", icon: "book", title: "Dùng từ điển thuật ngữ", text: "Thêm tên riêng và thuật ngữ, nhập xuất CSV, và hiểu vì sao từ điển chỉ là gợi ý cho bộ dịch.", more: MORE })}
```

Cùng file, tìm đoạn (duy nhất):

```js
  ["Cần dịch đúng tên riêng, thuật ngữ", "Xem <a href=\"/huong-dan/tu-dien-thuat-ngu/\">từ điển thuật ngữ</a>"],
  ["Đổi máy hoặc mất key", "Xem <a href=\"/huong-dan/mua-va-kich-hoat-key/\">mua và kích hoạt key</a>"],
```

thay bằng:

```js
  ["Cần dịch đúng tên riêng, thuật ngữ", "Xem <a href=\"/huong-dan/tu-dien-thuat-ngu/\">từ điển thuật ngữ</a>"],
  ["Muốn nhắn tin bằng tiếng của người bên kia", "Xem <a href=\"/huong-dan/go-dich/\">Gõ dịch tin nhắn</a>"],
  ["Đổi máy hoặc mất key", "Xem <a href=\"/huong-dan/mua-va-kich-hoat-key/\">mua và kích hoạt key</a>"],
```

Trong `website/src/content/en/guide.mjs`, tìm đoạn (duy nhất):

```js
  description:
    "Nine step-by-step guides: install on macOS or Windows, recording permission, subtitle bar and shortcuts, glossary, history and export, buying a key, troubleshooting.",
  schemaType: "CollectionPage",
```

thay bằng:

```js
  description:
    "Ten step-by-step guides: install on macOS or Windows, recording permission, shortcuts, Type & Translate, glossary, history and export, buying a key, troubleshooting.",
  schemaType: "CollectionPage",
```

Cùng file, tìm đoạn (duy nhất):

```js
  modified: "2026-10-14",
  llm: "Index of nine AI Translator user guides: quick start, macOS installation, Windows installation, macOS audio permission, subtitle bar and shortcuts, glossary, history and export, buying and activating a key, troubleshooting.",
  llmTitle: "AI Translator user guides",
```

thay bằng:

```js
  modified: "2026-10-14",
  llm: "Index of ten AI Translator user guides: quick start, macOS installation, Windows installation, macOS audio permission, subtitle bar and shortcuts, Type & Translate, glossary, history and export, buying and activating a key, troubleshooting.",
  llmTitle: "AI Translator user guides",
```

Cùng file, tìm đoạn (duy nhất):

```js
  title: "AI Translator user guides",
  lead: "Nine step-by-step guides for AI Translator, from installing on macOS or Windows to buying a key and fixing problems. Each one uses the exact button and menu names you see in the app, and most include screenshots of the real interface.",
})}
```

thay bằng:

```js
  title: "AI Translator user guides",
  lead: "Ten step-by-step guides for AI Translator, from installing on macOS or Windows to buying a key and fixing problems. Each one uses the exact button and menu names you see in the app, and most include screenshots of the real interface.",
})}
```

Cùng file, tìm đoạn (duy nhất):

```js
<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Everyday use", title: "Get the most from the bar, glossary and transcript" })}
<div class="grid grid-3">
${linkCard({ href: "/en/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "Subtitle bar and shortcuts", text: "Move, lock, hide and scroll the bar, change font size and colors, the shortcut table and the menu bar menu.", more: MORE })}
${linkCard({ href: "/en/guide/glossary/", icon: "book", title: "Use the glossary", text: "Add names and terms, import and export CSV, and see why the glossary is a hint to the translator, not a guarantee.", more: MORE })}
```

thay bằng:

```js
<section class="section-tight"><div class="container">
${sectionHead({ eyebrow: "Everyday use", title: "Get the most from the bar, Type & Translate, glossary and transcript" })}
<div class="grid grid-2">
${linkCard({ href: "/en/guide/subtitle-bar-and-shortcuts/", icon: "captions", title: "Subtitle bar and shortcuts", text: "Move, lock, hide and scroll the bar, change font size and colors, the shortcut table and the menu bar menu.", more: MORE })}
${linkCard({ href: "/en/guide/type-and-translate/", icon: "message", title: "Type & Translate", text: "Press ⌃⌥G (Ctrl+Alt+G) in any chat box, type in your own language and press Enter to paste the translation; Accessibility on macOS.", more: MORE })}
${linkCard({ href: "/en/guide/glossary/", icon: "book", title: "Use the glossary", text: "Add names and terms, import and export CSV, and see why the glossary is a hint to the translator, not a guarantee.", more: MORE })}
```

Cùng file, tìm đoạn (duy nhất):

```js
  ["You need names and terms translated consistently", "See <a href=\"/en/guide/glossary/\">the glossary</a>"],
  ["You changed computers or lost a key", "See <a href=\"/en/guide/buy-and-activate/\">buy and activate a key</a>"],
```

thay bằng:

```js
  ["You need names and terms translated consistently", "See <a href=\"/en/guide/glossary/\">the glossary</a>"],
  ["You want to reply in the other person's language", "See <a href=\"/en/guide/type-and-translate/\">Type &amp; Translate</a>"],
  ["You changed computers or lost a key", "See <a href=\"/en/guide/buy-and-activate/\">buy and activate a key</a>"],
```

- [ ] **Step 5: Bài trước, bài sau và bảng phím tắt**

Trong `website/src/content/vi/guide-glossary.mjs`, tìm đoạn (duy nhất):

```js
  [
    { href: "/huong-dan/thanh-phu-de-va-phim-tat/", kicker: "Bài trước", title: "Thanh phụ đề và phím tắt" },
    { href: "/huong-dan/lich-su-va-xuat-file/", kicker: "Bài tiếp theo", title: "Lịch sử và xuất bản chép lời" },
```

thay bằng:

```js
  [
    { href: "/huong-dan/go-dich/", kicker: "Bài trước", title: "Gõ dịch tin nhắn" },
    { href: "/huong-dan/lich-su-va-xuat-file/", kicker: "Bài tiếp theo", title: "Lịch sử và xuất bản chép lời" },
```

Trong `website/src/content/en/guide-glossary.mjs`, tìm đoạn (duy nhất):

```js
  [
    { href: "/en/guide/subtitle-bar-and-shortcuts/", kicker: "Previous", title: "Subtitle bar and shortcuts" },
    { href: "/en/guide/history-and-export/", kicker: "Next", title: "History and exporting transcripts" },
```

thay bằng:

```js
  [
    { href: "/en/guide/type-and-translate/", kicker: "Previous", title: "Type & Translate" },
    { href: "/en/guide/history-and-export/", kicker: "Next", title: "History and exporting transcripts" },
```

Trong `website/src/content/vi/guide-subtitle-bar.mjs`, tìm đoạn (duy nhất):

```js
  title: "Thanh phụ đề và phím tắt",
  lead: "Thanh phụ đề là cửa sổ nổi luôn nằm trên cùng, hiện bản dịch mà không lấy focus của app họp. Bạn kéo để di chuyển, kéo cạnh để đổi kích thước, khóa để chuột xuyên qua, và điều khiển bằng năm phím tắt mặc định như ⌃⌥T (bắt đầu hoặc dừng dịch) và ⌃⌥H (ẩn hoặc hiện).",
  meta: "<span>macOS và Windows</span> <span>Cập nhật {{updated}}</span>",
```

thay bằng:

```js
  title: "Thanh phụ đề và phím tắt",
  lead: "Thanh phụ đề là cửa sổ nổi luôn nằm trên cùng, hiện bản dịch mà không lấy focus của app họp. Bạn kéo để di chuyển, kéo cạnh để đổi kích thước, khóa để chuột xuyên qua, và điều khiển bằng phím tắt như ⌃⌥T (bắt đầu hoặc dừng dịch) và ⌃⌥H (ẩn hoặc hiện).",
  meta: "<span>macOS và Windows</span> <span>Cập nhật {{updated}}</span>",
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Cuộn phụ đề xuống (câu mới hơn)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">Trên macOS, ⌃ là phím Control và ⌥ là phím Option (không phải Command).</p>

```

thay bằng:

```js
<tr><th scope="row">Cuộn phụ đề xuống (câu mới hơn)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">Mở hoặc đóng ô soạn Gõ dịch</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">Trên macOS, ⌃ là phím Control và ⌥ là phím Option (không phải Command).</p>
<p>Phím mở Gõ dịch chỉ có tác dụng khi Gõ dịch đang bật (Cài đặt › Gõ dịch). Cách dùng ô soạn xem ở <a href="/huong-dan/go-dich/">Gõ dịch tin nhắn</a>.</p>

```

Cùng file, tìm đoạn (duy nhất):

```js
<p>Tổ hợp mới phải có ít nhất một phím Ctrl, Alt hoặc Cmd; chỉ có Shift thì chưa đủ. App báo “Tổ hợp này đang dùng cho việc khác.” nếu bạn đặt trùng một phím tắt của chính nó, và “Hệ thống không cho dùng tổ hợp này; có thể app khác đang giữ.” nếu hệ điều hành từ chối. Chúng tôi chưa kiểm xem phím mặc định có trùng phím tắt của Zoom, Teams hay Meet hay không; nếu bạn thấy trùng, hãy đổi ở đây.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt liệt kê năm việc cùng tổ hợp phím mặc định trên macOS và nút Đổi", caption: "Cài đặt › Phím tắt." })}

```

thay bằng:

```js
<p>Tổ hợp mới phải có ít nhất một phím Ctrl, Alt hoặc Cmd; chỉ có Shift thì chưa đủ. App báo “Tổ hợp này đang dùng cho việc khác.” nếu bạn đặt trùng một phím tắt của chính nó, và “Hệ thống không cho dùng tổ hợp này; có thể app khác đang giữ.” nếu hệ điều hành từ chối. Chúng tôi chưa kiểm xem phím mặc định có trùng phím tắt của Zoom, Teams hay Meet hay không; nếu bạn thấy trùng, hãy đổi ở đây.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt liệt kê sáu việc, gồm Mở Gõ dịch, cùng tổ hợp phím mặc định trên macOS và nút Đổi", caption: "Cài đặt › Phím tắt." })}

```

Cùng file, tìm đoạn (duy nhất):

```js
    { href: "/huong-dan/cap-quyen-thu-am-macos/", kicker: "Bài trước", title: "Cấp quyền ghi âm thanh hệ thống trên macOS" },
    { href: "/huong-dan/tu-dien-thuat-ngu/", kicker: "Bài sau", title: "Dùng từ điển thuật ngữ" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
```

thay bằng:

```js
    { href: "/huong-dan/cap-quyen-thu-am-macos/", kicker: "Bài trước", title: "Cấp quyền ghi âm thanh hệ thống trên macOS" },
    { href: "/huong-dan/go-dich/", kicker: "Bài sau", title: "Gõ dịch tin nhắn" },
    { href: "/huong-dan/khac-phuc-su-co/", kicker: "Liên quan", title: "Khắc phục sự cố" },
```

Trong `website/src/content/en/guide-subtitle-bar.mjs`, tìm đoạn (duy nhất):

```js
  title: "The subtitle bar and shortcuts",
  lead: "The subtitle bar is a floating window that stays on top and shows the translation without taking focus from your meeting app. Drag it to move it, drag an edge to resize it, lock it so the mouse passes through, and control it with five default shortcuts such as ⌃⌥T (start or stop) and ⌃⌥H (show or hide).",
  meta: "<span>macOS and Windows</span> <span>Updated {{updated}}</span>",
```

thay bằng:

```js
  title: "The subtitle bar and shortcuts",
  lead: "The subtitle bar is a floating window that stays on top and shows the translation without taking focus from your meeting app. Drag it to move it, drag an edge to resize it, lock it so the mouse passes through, and control it with shortcuts such as ⌃⌥T (start or stop) and ⌃⌥H (show or hide).",
  meta: "<span>macOS and Windows</span> <span>Updated {{updated}}</span>",
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
<p class="small muted">On macOS, ⌃ is the Control key and ⌥ is the Option key (not Command).</p>

```

thay bằng:

```js
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">Open or close the Type &amp; Translate box</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
<p class="small muted">On macOS, ⌃ is the Control key and ⌥ is the Option key (not Command).</p>
<p>The Type &amp; Translate shortcut only works while Type &amp; Translate is turned on (Settings › Type &amp; Translate). See <a href="/en/guide/type-and-translate/">Type &amp; Translate</a> for how to use the compose box.</p>

```

Cùng file, tìm đoạn (duy nhất):

```js
<p>A new shortcut needs at least one of Ctrl, Alt or Cmd; Shift alone is not enough. The app says “This shortcut is already used for another action.” if you pick one of its own shortcuts, and “The system refused this shortcut; another app may be using it.” if the operating system declines it. We have not checked whether the default keys clash with shortcuts in Zoom, Teams or Meet; if you find a clash, change the shortcut here.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings listing the five actions with their default macOS key combinations and a Change button", caption: "Settings › Shortcuts." })}

```

thay bằng:

```js
<p>A new shortcut needs at least one of Ctrl, Alt or Cmd; Shift alone is not enough. The app says “This shortcut is already used for another action.” if you pick one of its own shortcuts, and “The system refused this shortcut; another app may be using it.” if the operating system declines it. We have not checked whether the default keys clash with shortcuts in Zoom, Teams or Meet; if you find a clash, change the shortcut here.</p>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings listing the six actions, including Open Type & Translate, with their default macOS key combinations and a Change button", caption: "Settings › Shortcuts." })}

```

Cùng file, tìm đoạn (duy nhất):

```js
    { href: "/en/guide/macos-audio-permission/", kicker: "Previous", title: "Grant system audio recording permission on macOS" },
    { href: "/en/guide/glossary/", kicker: "Next", title: "Use the glossary" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
```

thay bằng:

```js
    { href: "/en/guide/macos-audio-permission/", kicker: "Previous", title: "Grant system audio recording permission on macOS" },
    { href: "/en/guide/type-and-translate/", kicker: "Next", title: "Type & Translate" },
    { href: "/en/guide/troubleshooting/", kicker: "Related", title: "Troubleshooting" },
```

- [ ] **Step 6: Chạy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ pass 118`, `ℹ fail 0`, không dòng `✖` (test tiêu đề ≤ 70 ký tự và mô tả 90–165 ký tự của trang mới đạt; liên kết và neo đều tồn tại).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add website/src/content && git commit -q -m "docs(website): hướng dẫn Gõ dịch, mục lục Hướng dẫn mười bài, dòng phím tắt mở ô soạn" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: Tính năng, Trang chủ, Bảng giá

**Files:**
- Modify: `website/src/content/{vi,en}/features.mjs`, `website/src/content/{vi,en}/home.mjs`, `website/src/assets/site.css`, `website/src/content/{vi,en}/pricing.mjs`

- Tính năng: thẻ "Gõ dịch" ở lưới đầu trang; mục `#go-dich` / `#type-and-translate` mới, đặt sau Từ điển thuật ngữ. Mục mới chen vào chuỗi nền xen kẽ (trắng, xám) nên ba mục sau đổi lớp nền (Phím tắt, Model, Hiệu năng). Callout "một chiều" nói rõ là phụ đề và trỏ tới Gõ dịch. Phím tắt: "Sáu", thêm dòng ⌃⌥G.
- Trang chủ: khối Gõ dịch đặt **trong cùng mục** với khối "Một màn hình, đủ mọi thứ cần thiết" (không đổi chuỗi nền của các mục sau); `site.css` thêm khoảng cách giữa hai khối hai cột liền nhau.
- Bảng giá: hàng "Gõ dịch tin nhắn (không trừ thời lượng dịch)", có ở cả bốn gói.

- [ ] **Step 1: Trang Tính năng**

Trong `website/src/content/vi/features.mjs`, tìm đoạn (duy nhất):

```js
  description:
    "Phụ đề dịch trực tiếp 5 ngôn ngữ, thanh phụ đề tùy chỉnh, từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown, phím tắt. Tất cả chạy offline trên máy của bạn.",
  software: true,
```

thay bằng:

```js
  description:
    "Phụ đề dịch trực tiếp 5 ngôn ngữ, thanh phụ đề, Gõ dịch tin nhắn, từ điển thuật ngữ, lịch sử, xuất TXT/SRT/Markdown. Tất cả chạy offline trên máy bạn.",
  software: true,
```

Cùng file, tìm đoạn (duy nhất):

```js
  modified: "2026-10-14",
  llm: "Danh sách đầy đủ tính năng đã có trong app (phụ đề dịch, thanh phụ đề, từ điển thuật ngữ, lịch sử, xuất file, phím tắt, model) cùng số đo hiệu năng có ghi điều kiện.",
  llmTitle: "Tính năng của AI Translator",
```

thay bằng:

```js
  modified: "2026-10-14",
  llm: "Danh sách đầy đủ tính năng đã có trong app (phụ đề dịch, thanh phụ đề, Gõ dịch tin nhắn, từ điển thuật ngữ, lịch sử, xuất file, phím tắt, model) cùng số đo hiệu năng có ghi điều kiện.",
  llmTitle: "Tính năng của AI Translator",
```

Cùng file, tìm đoạn (duy nhất):

```js
<a class="card card-link" href="#tu-dien"><strong class="card-title">Từ điển thuật ngữ</strong><p class="muted">Tên riêng, thuật ngữ (Pro)</p></a>
<a class="card card-link" href="#nguon-am-thanh"><strong class="card-title">Nguồn âm thanh</strong><p class="muted">Mọi app họp, không bot</p></a>
```

thay bằng:

```js
<a class="card card-link" href="#tu-dien"><strong class="card-title">Từ điển thuật ngữ</strong><p class="muted">Tên riêng, thuật ngữ (Pro)</p></a>
<a class="card card-link" href="#go-dich"><strong class="card-title">Gõ dịch</strong><p class="muted">Nhắn tin bằng tiếng người bên kia</p></a>
<a class="card card-link" href="#nguon-am-thanh"><strong class="card-title">Nguồn âm thanh</strong><p class="muted">Mọi app họp, không bot</p></a>
```

Cùng file, tìm đoạn (duy nhất):

```js
</div>
${callout({ title: "Một chiều, từ cuộc họp sang bạn.", text: "AI Translator dịch âm thanh phát ra từ máy tính sang ngôn ngữ của bạn. Hiện chưa dịch giọng của bạn để phát vào cuộc họp. Nếu cả hai bên cùng cài app, mỗi bên đều thấy phụ đề của phía kia." })}
</div></section>
```

thay bằng:

```js
</div>
${callout({ title: "Phụ đề dịch một chiều, từ cuộc họp sang bạn.", text: "AI Translator dịch âm thanh phát ra từ máy tính sang ngôn ngữ của bạn. Hiện chưa dịch giọng của bạn để phát vào cuộc họp. Muốn trả lời bằng chữ trong khung chat, hãy dùng <a href=\"#go-dich\">Gõ dịch</a>: bạn gõ bằng tiếng của mình, app dán bản dịch vào ô chat. Nếu cả hai bên cùng cài app, mỗi bên đều thấy phụ đề của phía kia." })}
</div></section>
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section section-alt" id="phim-tat"><div class="container">
<div class="split">
```

thay bằng:

```js

<section class="section section-alt" id="go-dich"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Gõ dịch</span>
<h2>Nhắn tin bằng tiếng của người bên kia, ở bất kỳ ô chat nào</h2>
<p>Bấm ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) ở ô chat của trình duyệt, app chat hay khung chat của app họp. Gõ bằng tiếng của bạn trong ô soạn nổi, bản dịch hiện ngay bên dưới. Bấm Enter để dán bản dịch vào ô chat, xem lại rồi bấm Enter lần nữa để gửi.</p>
${checkList([
  "Dịch sang <strong>tiếng của người bên kia</strong>, tự lấy từ cài đặt phụ đề, hoặc một ngôn ngữ bạn chọn",
  "Có ở <strong>mọi gói</strong> còn hiệu lực, kể cả Free trong thời gian dùng thử, và <strong>không trừ</strong> thời lượng dịch",
  "Dịch trên máy bạn: chữ bạn gõ và bản dịch không rời máy",
  "Gõ Telex, VNI như bình thường; dịch lỗi thì app không bao giờ dán câu gốc",
])}
<p class="small muted">Trên macOS, tự dán cần quyền Trợ năng; chưa có quyền thì app chép bản dịch để bạn tự dán bằng ⌘V. Bản Windows chưa được thử trên máy thật. Xem <a href="/huong-dan/go-dich/">hướng dẫn Gõ dịch</a>.</p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "vi", alt: "Ô soạn Gõ dịch với một tin nhắn tiếng Việt và bản dịch tiếng Anh bên dưới", caption: "Ô soạn Gõ dịch: Enter để dán bản dịch vào ô chat." })}
</div>
</div>
</div></section>

<section class="section" id="phim-tat"><div class="container">
<div class="split">
```

Cùng file, tìm đoạn (duy nhất):

```js
<h2>Điều khiển mà không rời cuộc họp</h2>
<p>Năm phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở. Bạn đổi được từng phím trong Cài đặt › Phím tắt.</p>
<div class="table-wrap"><table>
```

thay bằng:

```js
<h2>Điều khiển mà không rời cuộc họp</h2>
<p>Sáu phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở. Bạn đổi được từng phím trong Cài đặt › Phím tắt.</p>
<div class="table-wrap"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Cuộn phụ đề xuống (câu mới)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
```

thay bằng:

```js
<tr><th scope="row">Cuộn phụ đề xuống (câu mới)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">Mở hoặc đóng ô soạn Gõ dịch</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
```

Cùng file, tìm đoạn (duy nhất):

```js
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt hiển thị năm phím tắt mặc định trên macOS", caption: "Cài đặt › Phím tắt: bấm Đổi rồi nhấn tổ hợp phím mới." })}
</div>
```

thay bằng:

```js
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "vi", alt: "Cài đặt Phím tắt hiển thị sáu phím tắt mặc định trên macOS", caption: "Cài đặt › Phím tắt: bấm Đổi rồi nhấn tổ hợp phím mới." })}
</div>
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section" id="model"><div class="container">
<div class="model-intro">
```

thay bằng:

```js

<section class="section section-alt" id="model"><div class="container">
<div class="model-intro">
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section section-alt" id="hieu-nang"><div class="container">
${sectionHead({ eyebrow: "Hiệu năng", title: "Số đo thật, kèm điều kiện đo", text: "Chúng tôi chỉ công bố những gì đã đo, trên đúng máy đã đo, và nói rõ máy nào chưa đo.", center: true })}
```

thay bằng:

```js

<section class="section" id="hieu-nang"><div class="container">
${sectionHead({ eyebrow: "Hiệu năng", title: "Số đo thật, kèm điều kiện đo", text: "Chúng tôi chỉ công bố những gì đã đo, trên đúng máy đã đo, và nói rõ máy nào chưa đo.", center: true })}
```

Trong `website/src/content/en/features.mjs`, tìm đoạn (duy nhất):

```js
  description:
    "Live translated subtitles in 5 languages, a customizable subtitle bar, glossary, history, TXT/SRT/Markdown export and shortcuts. All offline, on your computer.",
  software: true,
```

thay bằng:

```js
  description:
    "Live translated subtitles in 5 languages, a subtitle bar, Type & Translate for chat, glossary, history and TXT/SRT/Markdown export. All offline, on your computer.",
  software: true,
```

Cùng file, tìm đoạn (duy nhất):

```js
  modified: "2026-10-14",
  llm: "Complete list of what the app does today (live translated subtitles, subtitle bar, glossary, history, export, shortcuts, models), with performance figures and the conditions they were measured under.",
  llmTitle: "AI Translator features",
```

thay bằng:

```js
  modified: "2026-10-14",
  llm: "Complete list of what the app does today (live translated subtitles, subtitle bar, Type & Translate for chat messages, glossary, history, export, shortcuts, models), with performance figures and the conditions they were measured under.",
  llmTitle: "AI Translator features",
```

Cùng file, tìm đoạn (duy nhất):

```js
<a class="card card-link" href="#glossary"><h3>Glossary</h3><p class="muted">Names and terms (Pro)</p></a>
<a class="card card-link" href="#audio-source"><h3>Audio source</h3><p class="muted">Any meeting app, no bot</p></a>
```

thay bằng:

```js
<a class="card card-link" href="#glossary"><h3>Glossary</h3><p class="muted">Names and terms (Pro)</p></a>
<a class="card card-link" href="#type-and-translate"><h3>Type &amp; Translate</h3><p class="muted">Chat in the other person's language</p></a>
<a class="card card-link" href="#audio-source"><h3>Audio source</h3><p class="muted">Any meeting app, no bot</p></a>
```

Cùng file, tìm đoạn (duy nhất):

```js
</div>
${callout({ title: "One direction: from the meeting to you.", text: "AI Translator translates the audio coming out of your computer into your language. It does not translate your own voice into the meeting yet. If both sides install the app, each person sees subtitles of the other side." })}
</div></section>
```

thay bằng:

```js
</div>
${callout({ title: "Subtitles go one way: from the meeting to you.", text: "AI Translator translates the audio coming out of your computer into your language. It does not translate your own voice into the meeting yet. To reply in writing in the chat, use <a href=\"#type-and-translate\">Type &amp; Translate</a>: you type in your own language and the app pastes the translation into the chat box. If both sides install the app, each person sees subtitles of the other side." })}
</div></section>
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section section-alt" id="shortcuts"><div class="container">
<div class="split">
```

thay bằng:

```js

<section class="section section-alt" id="type-and-translate"><div class="container">
<div class="split">
<div class="stack-lg reveal">
<span class="eyebrow">Type &amp; Translate</span>
<h2>Chat in the other person's language, in any chat box</h2>
<p>Press ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) in the chat box of a browser, a chat app or a meeting app. Type in your own language in the floating compose box and the translation appears right below. Press Enter to paste the translation into the chat box, check it, then press Enter again to send.</p>
${checkList([
  "Translates into <strong>the language of the people you talk to</strong>, taken from your subtitle settings, or a language you choose",
  "Included in <strong>every active plan</strong>, Free during the trial too, and it <strong>does not use</strong> translation time",
  "Translated on your computer: what you type and its translation never leave it",
  "Type with your usual keyboard and input method; if translating fails, the app never pastes your original text",
])}
<p class="small muted">On macOS, auto-paste needs the Accessibility permission; without it the app copies the translation so you can paste it with ⌘V. The Windows version has not been tried on a real computer yet. See the <a href="/en/guide/type-and-translate/">Type &amp; Translate guide</a>.</p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "en", alt: "The Type & Translate box with an English message and its Vietnamese translation below", caption: "The Type & Translate box: press Enter to paste the translation into the chat box." })}
</div>
</div>
</div></section>

<section class="section" id="shortcuts"><div class="container">
<div class="split">
```

Cùng file, tìm đoạn (duy nhất):

```js
<h2>Control it without leaving the meeting</h2>
<p>Five global shortcuts work even when AI Translator is not the window in front. You can change each one in Settings › Shortcuts.</p>
<div class="table-wrap" role="region" aria-label="Keyboard shortcuts" tabindex="0"><table>
```

thay bằng:

```js
<h2>Control it without leaving the meeting</h2>
<p>Six global shortcuts work even when AI Translator is not the window in front. You can change each one in Settings › Shortcuts.</p>
<div class="table-wrap" role="region" aria-label="Keyboard shortcuts" tabindex="0"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
</tbody></table></div>
```

thay bằng:

```js
<tr><th scope="row">Scroll subtitles down (newer sentences)</th><td>${keys(["⌃", "⌥", "PageDown"])}</td><td>${keys(["Ctrl", "Alt", "PageDown"])}</td></tr>
<tr><th scope="row">Open or close the Type &amp; Translate box</th><td>${keys(["⌃", "⌥", "G"])}</td><td>${keys(["Ctrl", "Alt", "G"])}</td></tr>
</tbody></table></div>
```

Cùng file, tìm đoạn (duy nhất):

```js
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings showing the five default shortcuts on macOS", caption: "Settings › Shortcuts: press Change, then the new key combination." })}
</div>
```

thay bằng:

```js
<div>
${appShot({ slug: "app-settings-hotkeys", lang: "en", alt: "Shortcuts settings showing the six default shortcuts on macOS", caption: "Settings › Shortcuts: press Change, then the new key combination." })}
</div>
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section" id="models"><div class="container stack-lg">
<div class="model-intro">
```

thay bằng:

```js

<section class="section section-alt" id="models"><div class="container stack-lg">
<div class="model-intro">
```

Cùng file, tìm đoạn (duy nhất):

```js

<section class="section section-alt" id="performance"><div class="container">
${sectionHead({ eyebrow: "Performance", title: "Real measurements, with the conditions", text: "We publish only what we measured, on the machine we measured it on, and we say which machines we have not tested.", center: true })}
```

thay bằng:

```js

<section class="section" id="performance"><div class="container">
${sectionHead({ eyebrow: "Performance", title: "Real measurements, with the conditions", text: "We publish only what we measured, on the machine we measured it on, and we say which machines we have not tested.", center: true })}
```

- [ ] **Step 2: Trang chủ**

Trong `website/src/assets/site.css`, tìm đoạn (duy nhất):

```css
.split + .facts, .table-wrap + .facts, .grid + .facts { margin-top: clamp(28px, 4vw, 48px); }
.facts > div { padding: 16px 20px; box-shadow: inset 0 0 0 .5px var(--line); }
```

thay bằng:

```css
.split + .facts, .table-wrap + .facts, .grid + .facts { margin-top: clamp(28px, 4vw, 48px); }
/* Hai khối hai cột liền nhau trong cùng một mục (Trang chủ: Một màn hình, rồi Gõ dịch). */
.split + .split { margin-top: clamp(48px, 7vw, 96px); }
.facts > div { padding: 16px 20px; box-shadow: inset 0 0 0 .5px var(--line); }
```

Trong `website/src/content/vi/home.mjs`, tìm đoạn (duy nhất):

```js
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
```

thay bằng:

```js
])}
</div>
</div>
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Gõ dịch</span>
<h2>Trả lời bằng tiếng của người bên kia</h2>
<p class="lead">Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat bất kỳ, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.</p>
${checkList([
  "Dùng ở ô chat của trình duyệt, app chat và khung chat của app họp",
  "Dịch trên máy bạn: chữ bạn gõ không rời máy",
  "Có ở mọi gói, không trừ thời lượng dịch",
])}
<p><a class="btn btn-secondary" href="/huong-dan/go-dich/">Xem hướng dẫn Gõ dịch ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "vi", alt: "Ô soạn Gõ dịch với một tin nhắn tiếng Việt và bản dịch tiếng Anh bên dưới", caption: "Ô soạn Gõ dịch: Enter để dán bản dịch vào ô chat." })}
</div>
</div>
</div></section>

<section class="section"><div class="container">
```

Trong `website/src/content/en/home.mjs`, tìm đoạn (duy nhất):

```js
])}
</div>
</div>
</div></section>

<section class="section"><div class="container">
```

thay bằng:

```js
])}
</div>
</div>
<div class="split wide-right">
<div class="stack-lg reveal">
<span class="eyebrow">Type &amp; Translate</span>
<h2>Reply in the other person's language</h2>
<p class="lead">Press ⌃⌥G (Windows: Ctrl+Alt+G) in any chat box, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.</p>
${checkList([
  "Works in the chat boxes of browsers, chat apps and meeting apps",
  "Translated on your computer: what you type never leaves it",
  "Included in every plan, and it does not use translation time",
])}
<p><a class="btn btn-secondary" href="/en/guide/type-and-translate/">Read the Type &amp; Translate guide ${icon("arrow-right")}</a></p>
</div>
<div>
${overlayShot({ slug: "compose-done", lang: "en", alt: "The Type & Translate box with an English message and its Vietnamese translation below", caption: "The Type & Translate box: press Enter to paste the translation into the chat box." })}
</div>
</div>
</div></section>

<section class="section"><div class="container">
```

- [ ] **Step 3: Bảng giá**

Trong `website/src/content/vi/pricing.mjs`, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Sao chép bản chép lời</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Từ điển thuật ngữ (Pro)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
```

thay bằng:

```js
<tr><th scope="row">Sao chép bản chép lời</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Gõ dịch tin nhắn (không trừ thời lượng dịch)</th><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
<tr><th scope="row">Từ điển thuật ngữ (Pro)</th><td><span class="no">Không</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td><td><span class="yes">Có</span></td></tr>
```

Trong `website/src/content/en/pricing.mjs`, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Copy the transcript</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Glossary (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
```

thay bằng:

```js
<tr><th scope="row">Copy the transcript</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Type &amp; Translate for chat messages (does not use translation time)</th><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
<tr><th scope="row">Glossary (Pro)</th><td><span class="no">No</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td><td><span class="yes">Yes</span></td></tr>
```

- [ ] **Step 4: Chạy, xem, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ pass 118`, `ℹ fail 0`, không dòng `✖` (test `bảng so sánh gói: mỗi hàng có đủ số ô` đạt với hàng mới).

Xem bố cục: dựng rồi phục vụ ở một cổng trống (4173 có thể đang bị chiếm bởi việc khác: đừng tắt tiến trình không do mình mở), chạy ở nền:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && node src/build/build.mjs >/dev/null && node src/serve.mjs 4183
```

Mở bằng Chrome không đầu (`website/tools/browser/cdp.mjs`, `page.screenshot(file, { clipSelector })`) hay trình duyệt: `http://127.0.0.1:4183/tinh-nang/#go-dich`, `/` (khối "Trả lời bằng tiếng của người bên kia"), `/en/` ở bề rộng 375 px. Kiểm: ảnh ô soạn nằm trên nền tối, hai khối của Trang chủ cách nhau rõ, không tràn ngang ở 375 px. Xong thì dừng máy chủ đó và kiểm `lsof -nP -iTCP:4183 -sTCP:LISTEN` rỗng.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add website/src/content website/src/assets/site.css && git commit -q -m "docs(website): Gõ dịch ở trang Tính năng, Trang chủ và Bảng giá" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Hỏi đáp, Dữ liệu và bảo mật, Khắc phục sự cố, và các câu cũ

**Files:**
- Modify: `website/src/content/{vi,en}/faq.mjs`, `website/src/content/{vi,en}/data-security.mjs`, `website/src/content/{vi,en}/guide-troubleshooting.mjs`, `website/src/content/{vi,en}/guide-audio-permission.mjs`, `website/src/content/{vi,en}/compare-offline-cloud.mjs`, `website/src/content/{vi,en}/solutions.mjs`, `website/src/content/{vi,en}/solutions-meetings.mjs`

- Hỏi đáp: "Dịch theo chiều nào" nói rõ phụ đề một chiều và trỏ tới Gõ dịch; "Cần cấp quyền gì trên macOS" thêm quyền Trợ năng (không bắt buộc); "Thời lượng dịch" thêm câu Gõ dịch không tính; "Phím tắt mặc định" thêm ⌃⌥G; câu hỏi mới "Gõ dịch là gì? Chữ tôi gõ có bị gửi đi đâu không?".
- Dữ liệu và bảo mật: hàng "Chữ bạn gõ ở Gõ dịch và bản dịch của nó", đoạn về quyền Trợ năng, "không nơi nào nhận … chữ bạn gõ", báo cáo lỗi không gồm chữ gõ. Số nơi kết nối giữ **năm** (test đếm).
- Khắc phục sự cố: mục "Gõ dịch" mới (bốn thẻ: phím tắt không mở, hộp quyền Trợ năng, dán không vào, dòng quá dài).
- Câu cũ: hướng dẫn quyền ghi âm ("Để dịch phụ đề, … cần đúng một quyền"), So sánh, Giải pháp, Giải pháp họp trực tuyến ("Phụ đề một chiều").

- [ ] **Step 1: Hỏi đáp**

Trong `website/src/content/vi/faq.mjs`, tìm đoạn (duy nhất):

```js
        q: "Dịch theo chiều nào? Có dịch giọng của tôi cho người khác không?",
        a: `<p>Một chiều: từ âm thanh đang phát trên máy sang ngôn ngữ của bạn. Hiện app chưa dịch giọng của bạn để phát vào cuộc họp. Nếu cả hai bên cùng cài app, mỗi bên sẽ thấy phụ đề của phía kia.</p>`,
      },
```

thay bằng:

```js
        q: "Dịch theo chiều nào? Có dịch giọng của tôi cho người khác không?",
        a: `<p>Phụ đề dịch một chiều: từ âm thanh đang phát trên máy sang ngôn ngữ của bạn. Hiện app chưa dịch giọng của bạn để phát vào cuộc họp. Muốn trả lời bằng chữ, bạn dùng <a href="/huong-dan/go-dich/">Gõ dịch</a>: gõ tin nhắn bằng tiếng của bạn, app dán bản dịch vào ô chat. Nếu cả hai bên cùng cài app, mỗi bên sẽ thấy phụ đề của phía kia.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "Cần cấp quyền gì trên macOS?",
        a: `<p>Chỉ quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro. macOS hỏi ở lần đầu bạn bấm Bắt đầu. Nếu bạn từ chối, macOS không báo lỗi mà chỉ cho app nhận im lặng; app sẽ nhắc bạn bật lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">hướng dẫn cấp quyền ghi âm</a>. Trên Windows không cần cấp quyền ghi âm.</p>`,
      },
```

thay bằng:

```js
        q: "Cần cấp quyền gì trên macOS?",
        a: `<p>Để dịch phụ đề, chỉ cần quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro. macOS hỏi ở lần đầu bạn bấm Bắt đầu. Nếu bạn từ chối, macOS không báo lỗi mà chỉ cho app nhận im lặng; app sẽ nhắc bạn bật lại. Xem <a href="/huong-dan/cap-quyen-thu-am-macos/">hướng dẫn cấp quyền ghi âm</a>. Gõ dịch có thể xin thêm quyền Trợ năng (Accessibility), chỉ để tự dán bản dịch vào ô chat; không cấp thì app chép bản dịch để bạn tự dán (xem <a href="/huong-dan/go-dich/#quyen-tro-nang">Gõ dịch</a>). Trên Windows không cần cấp quyền nào trong hai quyền này.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "Thời lượng dịch được tính thế nào?",
        a: `<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy; app nhắc khi còn dưới 5 phút.</p>`,
      },
```

thay bằng:

```js
        q: "Thời lượng dịch được tính thế nào?",
        a: `<p>Chỉ tính phần tiếng nói đã được dịch xong, theo độ dài tiếng nói. Thời gian im lặng, câu đã ở đúng ngôn ngữ bạn muốn đọc và đoạn chưa dịch được không bị tính. Hạn mức tính riêng cho từng máy; app nhắc khi còn dưới 5 phút. Tin nhắn dịch bằng Gõ dịch không tính vào thời lượng.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "Phím tắt mặc định là gì?",
        a: `<p>Trên macOS: ⌃⌥T bắt đầu hoặc dừng dịch, ⌃⌥H hiện hoặc ẩn phụ đề, ⌃⌥L khóa hoặc mở khóa, ⌃⌥PageUp và ⌃⌥PageDown cuộn xem câu cũ và mới (⌃ là Control, ⌥ là Option). Trên Windows là Ctrl+Alt cùng các phím T, H, L, PageUp, PageDown. Bạn đổi được ở Cài đặt › Phím tắt, nên nếu trùng phím của app khác thì cứ đổi.</p>`,
      },
```

thay bằng:

```js
        q: "Phím tắt mặc định là gì?",
        a: `<p>Trên macOS: ⌃⌥T bắt đầu hoặc dừng dịch, ⌃⌥H hiện hoặc ẩn phụ đề, ⌃⌥L khóa hoặc mở khóa, ⌃⌥PageUp và ⌃⌥PageDown cuộn xem câu cũ và mới (⌃ là Control, ⌥ là Option). Trên Windows là Ctrl+Alt cùng các phím T, H, L, PageUp, PageDown. ⌃⌥G (Ctrl+Alt+G) mở ô soạn Gõ dịch. Bạn đổi được ở Cài đặt › Phím tắt, nên nếu trùng phím của app khác thì cứ đổi.</p>`,
      },
      {
        q: "Gõ dịch là gì? Chữ tôi gõ có bị gửi đi đâu không?",
        a: `<p>Gõ dịch giúp bạn nhắn tin bằng tiếng của người bên kia ở bất kỳ ô chat nào: bấm ⌃⌥G (Ctrl+Alt+G), gõ bằng tiếng của bạn, bấm Enter để dán bản dịch vào ô chat, rồi Enter lần nữa để gửi. Chữ bạn gõ và bản dịch được xử lý trên máy bạn, không gửi qua mạng, không ghi xuống đĩa; app chỉ chép bản dịch vào clipboard để dán. Gõ dịch có ở mọi gói còn hiệu lực và không trừ thời lượng dịch. Xem <a href="/huong-dan/go-dich/">hướng dẫn Gõ dịch</a>.</p>`,
      },
```

Trong `website/src/content/en/faq.mjs`, tìm đoạn (duy nhất):

```js
        q: "Which direction does it translate? Does it translate my own voice?",
        a: `<p>One direction: from the audio playing on your computer into your language. The app does not yet translate your voice to play into the meeting. If both sides install the app, each side sees the other's subtitles.</p>`,
      },
```

thay bằng:

```js
        q: "Which direction does it translate? Does it translate my own voice?",
        a: `<p>Subtitles go one direction: from the audio playing on your computer into your language. The app does not yet translate your voice to play into the meeting. To reply in writing, use <a href="/en/guide/type-and-translate/">Type &amp; Translate</a>: type a message in your own language and the app pastes the translation into the chat box. If both sides install the app, each side sees the other's subtitles.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "What permissions does it need on macOS?",
        a: `<p>Only System Audio Recording permission; AI Translator does not use the microphone. macOS asks the first time you press Start. If you decline, macOS shows no error and the app simply receives silence; the app will prompt you to turn it back on. See the <a href="/en/guide/macos-audio-permission/">audio permission guide</a>. Windows needs no audio-recording permission.</p>`,
      },
```

thay bằng:

```js
        q: "What permissions does it need on macOS?",
        a: `<p>For subtitles, only System Audio Recording permission; AI Translator does not use the microphone. macOS asks the first time you press Start. If you decline, macOS shows no error and the app simply receives silence; the app will prompt you to turn it back on. See the <a href="/en/guide/macos-audio-permission/">audio permission guide</a>. Type &amp; Translate can also ask for the Accessibility permission, only to paste the translation into the chat box for you; without it, the app copies the translation for you to paste (see <a href="/en/guide/type-and-translate/#accessibility">Type &amp; Translate</a>). Windows needs neither permission.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "How is translation time counted?",
        a: `<p>Only speech that has been translated is counted, by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The quota is per device, and the app warns you when less than 5 minutes remain.</p>`,
      },
```

thay bằng:

```js
        q: "How is translation time counted?",
        a: `<p>Only speech that has been translated is counted, by the length of the speech. Silence, sentences already in the language you want to read, and segments that could not be translated are not counted. The quota is per device, and the app warns you when less than 5 minutes remain. Messages translated with Type &amp; Translate are not counted.</p>`,
      },
```

Cùng file, tìm đoạn (duy nhất):

```js
        q: "What are the default shortcuts?",
        a: `<p>On macOS: ⌃⌥T starts or stops translating, ⌃⌥H shows or hides subtitles, ⌃⌥L locks or unlocks them, and ⌃⌥PageUp and ⌃⌥PageDown scroll to older and newer sentences (⌃ is Control, ⌥ is Option). On Windows it is Ctrl+Alt with T, H, L, PageUp and PageDown. You can change them under Settings › Shortcuts, so if one clashes with another app, just change it.</p>`,
      },
```

thay bằng:

```js
        q: "What are the default shortcuts?",
        a: `<p>On macOS: ⌃⌥T starts or stops translating, ⌃⌥H shows or hides subtitles, ⌃⌥L locks or unlocks them, and ⌃⌥PageUp and ⌃⌥PageDown scroll to older and newer sentences (⌃ is Control, ⌥ is Option). On Windows it is Ctrl+Alt with T, H, L, PageUp and PageDown. ⌃⌥G (Ctrl+Alt+G) opens the Type &amp; Translate box. You can change them under Settings › Shortcuts, so if one clashes with another app, just change it.</p>`,
      },
      {
        q: "What is Type & Translate? Is the text I type sent anywhere?",
        a: `<p>Type &amp; Translate lets you message people in their language from any chat box: press ⌃⌥G (Ctrl+Alt+G), type in your own language, press Enter to paste the translation into the chat box, then press Enter again to send. What you type and its translation are processed on your computer, not sent over the network and not written to disk; the app only copies the translation to the clipboard to paste it. Type &amp; Translate is included in every active plan and does not use translation time. See the <a href="/en/guide/type-and-translate/">Type &amp; Translate guide</a>.</p>`,
      },
```

- [ ] **Step 2: Dữ liệu và bảo mật**

Trong `website/src/content/vi/data-security.mjs`, tìm đoạn (duy nhất):

```js
  ["Âm thanh", "Chỉ nằm trong RAM, không ghi đĩa, không gửi đi"],
  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh hay chữ chép lời"],
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy, báo cáo lỗi"],
```

thay bằng:

```js
  ["Âm thanh", "Chỉ nằm trong RAM, không ghi đĩa, không gửi đi"],
  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh, chữ chép lời hay chữ bạn gõ"],
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy, báo cáo lỗi"],
```

Cùng file, tìm đoạn (duy nhất):

```js
<h2 id="tren-may">Dữ liệu nào ở lại trên máy bạn?</h2>
<p>Âm thanh, bản chép lời và bản dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo và không analytics. Khi gặp lỗi, app gửi một báo cáo lỗi đã che dữ liệu cá nhân cho chúng tôi (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>); báo cáo đó không có âm thanh, chữ chép lời hay bản dịch.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu ở lại trên máy bạn" tabindex="0"><table>
```

thay bằng:

```js
<h2 id="tren-may">Dữ liệu nào ở lại trên máy bạn?</h2>
<p>Âm thanh, bản chép lời, bản dịch và chữ bạn gõ ở Gõ dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo và không analytics. Khi gặp lỗi, app gửi một báo cáo lỗi đã che dữ liệu cá nhân cho chúng tôi (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>); báo cáo đó không có âm thanh, chữ chép lời hay bản dịch.</p>
<div class="table-wrap" role="region" aria-label="Dữ liệu ở lại trên máy bạn" tabindex="0"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Bản chép lời và bản dịch</th><td>Hiện trên màn hình và nằm trong bộ nhớ theo phiên. Lịch sử mặc định tắt; nếu bạn bật (tính năng Pro), lịch sử lưu trên máy, được mã hóa.</td></tr>
<tr><th scope="row">Khóa, token, bộ đếm hạn mức</th><td>Khóa mã hóa lịch sử, token bản quyền, token dùng thử và bộ đếm hạn mức nằm trong Keychain (macOS) hoặc Credential Manager (Windows).</td></tr>
```

thay bằng:

```js
<tr><th scope="row">Bản chép lời và bản dịch</th><td>Hiện trên màn hình và nằm trong bộ nhớ theo phiên. Lịch sử mặc định tắt; nếu bạn bật (tính năng Pro), lịch sử lưu trên máy, được mã hóa.</td></tr>
<tr><th scope="row">Chữ bạn gõ ở Gõ dịch và bản dịch của nó</th><td>Chỉ nằm trong bộ nhớ của app tới khi bạn dán hay thoát app. Không ghi đĩa, không gửi qua mạng, không có trong log hay báo cáo lỗi. Bản dịch được chép vào clipboard để dán và ở lại đó tới khi bạn chép thứ khác.</td></tr>
<tr><th scope="row">Khóa, token, bộ đếm hạn mức</th><td>Khóa mã hóa lịch sử, token bản quyền, token dùng thử và bộ đếm hạn mức nằm trong Keychain (macOS) hoặc Credential Manager (Windows).</td></tr>
```

Cùng file, tìm đoạn (duy nhất):

```js
</tbody></table></div>

<h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>
<p>Đúng năm nơi, và không nơi nào nhận âm thanh hay nội dung chép lời. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn). Mục 4 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a> cũng liệt kê năm kết nối nhưng đếm theo mục đích (tải model và kiểm tra bản cập nhật cùng đi tới releases.aitranslator.io.vn; trang thanh toán của PayOS và của Creem gộp một mục), còn bảng dưới đếm theo nơi nhận.</p>
<div class="table-wrap" role="region" aria-label="Các nơi app kết nối mạng" tabindex="0"><table>
```

thay bằng:

```js
</tbody></table></div>
<p>Trên macOS, Gõ dịch xin quyền Trợ năng (Accessibility) chỉ để gửi tổ hợp dán ⌘V vào ô chat bạn đang gõ. App không đọc chữ, nội dung hay clipboard của app khác; không cấp quyền thì app chỉ chép bản dịch để bạn tự dán (xem <a href="/huong-dan/go-dich/#quyen-tro-nang">Gõ dịch</a>).</p>

<h2 id="ket-noi-mang">App kết nối mạng tới đâu?</h2>
<p>Đúng năm nơi, và không nơi nào nhận âm thanh, nội dung chép lời hay chữ bạn gõ. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn). Mục 4 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a> cũng liệt kê năm kết nối nhưng đếm theo mục đích (tải model và kiểm tra bản cập nhật cùng đi tới releases.aitranslator.io.vn; trang thanh toán của PayOS và của Creem gộp một mục), còn bảng dưới đếm theo nơi nhận.</p>
<div class="table-wrap" role="region" aria-label="Các nơi app kết nối mạng" tabindex="0"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Báo cáo gồm</th><td>Mã báo cáo, loại và mã lỗi; phiên bản app, hệ điều hành, chip hoặc CPU, RAM, loại GPU, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; mã băm ID máy; phần log liên quan đến lỗi, tối đa 64 KB.</td></tr>
<tr><th scope="row">Báo cáo không gồm</th><td>Âm thanh, bản chép lời, bản dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP. App che đường dẫn thư mục cá nhân, key, token và email trong log trước khi gửi; máy chủ kiểm lại và từ chối báo cáo nếu còn sót.</td></tr>
<tr><th scope="row">Gắn với bạn thế nào</th><td>Mã băm ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free, nên chúng tôi có thể nối báo cáo với license và email của máy đó khi tra cứu hỗ trợ.</td></tr>
```

thay bằng:

```js
<tr><th scope="row">Báo cáo gồm</th><td>Mã báo cáo, loại và mã lỗi; phiên bản app, hệ điều hành, chip hoặc CPU, RAM, loại GPU, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; mã băm ID máy; phần log liên quan đến lỗi, tối đa 64 KB.</td></tr>
<tr><th scope="row">Báo cáo không gồm</th><td>Âm thanh, bản chép lời, bản dịch, chữ bạn gõ ở Gõ dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP. App che đường dẫn thư mục cá nhân, key, token và email trong log trước khi gửi; máy chủ kiểm lại và từ chối báo cáo nếu còn sót.</td></tr>
<tr><th scope="row">Gắn với bạn thế nào</th><td>Mã băm ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free, nên chúng tôi có thể nối báo cáo với license và email của máy đó khi tra cứu hỗ trợ.</td></tr>
```

Trong `website/src/content/en/data-security.mjs`, tìm đoạn (duy nhất):

```js
  ["Audio", "Only in RAM, never written to disk, never sent out"],
  ["Network", "Five places; none of them receives audio or transcripts"],
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID, error reports"],
```

thay bằng:

```js
  ["Audio", "Only in RAM, never written to disk, never sent out"],
  ["Network", "Five places; none of them receives audio, transcripts or the text you type"],
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID, error reports"],
```

Cùng file, tìm đoạn (duy nhất):

```js
<h2 id="on-device">What data stays on your computer?</h2>
<p>Audio, transcripts and translations never leave your computer. The app also has no sign-in, no ads and no analytics. When it hits an error, it sends us an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>); that report contains no audio, no transcript text and no translation.</p>
<div class="table-wrap" role="region" aria-label="Data that stays on your computer" tabindex="0"><table>
```

thay bằng:

```js
<h2 id="on-device">What data stays on your computer?</h2>
<p>Audio, transcripts, translations and the text you type in Type &amp; Translate never leave your computer. The app also has no sign-in, no ads and no analytics. When it hits an error, it sends us an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>); that report contains no audio, no transcript text and no translation.</p>
<div class="table-wrap" role="region" aria-label="Data that stays on your computer" tabindex="0"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">Transcript and translation</th><td>Shown on screen and held in memory for the session. History is off by default; if you turn it on (a Pro feature), it is stored on your computer, encrypted.</td></tr>
<tr><th scope="row">Keys, tokens, quota counters</th><td>The history encryption key, license token, trial token and quota counters live in Keychain (macOS) or Credential Manager (Windows).</td></tr>
```

thay bằng:

```js
<tr><th scope="row">Transcript and translation</th><td>Shown on screen and held in memory for the session. History is off by default; if you turn it on (a Pro feature), it is stored on your computer, encrypted.</td></tr>
<tr><th scope="row">Text you type in Type &amp; Translate and its translation</th><td>Held only in the app's memory until you paste it or quit the app. Not written to disk, not sent over the network, not in logs or error reports. The translation is copied to the clipboard to paste it and stays there until you copy something else.</td></tr>
<tr><th scope="row">Keys, tokens, quota counters</th><td>The history encryption key, license token, trial token and quota counters live in Keychain (macOS) or Credential Manager (Windows).</td></tr>
```

Cùng file, tìm đoạn (duy nhất):

```js
</tbody></table></div>

<h2 id="network">Where does the app connect?</h2>
<p>To exactly five places, and none of them receives audio or transcript content. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due). Section 4 of the <a href="/en/privacy/">Privacy policy</a> also lists five connections but counts them by purpose (model downloads and update checks both go to releases.aitranslator.io.vn; the PayOS and Creem payment pages are one item), while the table below counts them by destination.</p>
<div class="table-wrap" role="region" aria-label="Places the app connects to" tabindex="0"><table>
```

thay bằng:

```js
</tbody></table></div>
<p>On macOS, Type &amp; Translate asks for the Accessibility permission only to send the ⌘V paste keys to the chat box you are typing in. The app does not read text, content or the clipboard of other apps; without the permission it only copies the translation for you to paste (see <a href="/en/guide/type-and-translate/#accessibility">Type &amp; Translate</a>).</p>

<h2 id="network">Where does the app connect?</h2>
<p>To exactly five places, and none of them receives audio, transcript content or the text you type. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due). Section 4 of the <a href="/en/privacy/">Privacy policy</a> also lists five connections but counts them by purpose (model downloads and update checks both go to releases.aitranslator.io.vn; the PayOS and Creem payment pages are one item), while the table below counts them by destination.</p>
<div class="table-wrap" role="region" aria-label="Places the app connects to" tabindex="0"><table>
```

Cùng file, tìm đoạn (duy nhất):

```js
<tr><th scope="row">A report contains</th><td>The report code, the type and code of the error; the app version, operating system, chip or CPU, RAM, type of GPU, model pack, the name of your license plan (never the key), the interface language; the hashed machine ID; and the part of the log that relates to the error, at most 64 KB.</td></tr>
<tr><th scope="row">A report does not contain</th><td>Audio, transcripts, translations, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses. The app scrubs personal folder paths, keys, tokens and email addresses from the log before sending; our server checks again and rejects a report if anything is left.</td></tr>
<tr><th scope="row">How it is tied to you</th><td>The hashed machine ID in the report is the same one we store for licensing and the Free trial, so we can link a report to that machine's license and email when handling a support request.</td></tr>
```

thay bằng:

```js
<tr><th scope="row">A report contains</th><td>The report code, the type and code of the error; the app version, operating system, chip or CPU, RAM, type of GPU, model pack, the name of your license plan (never the key), the interface language; the hashed machine ID; and the part of the log that relates to the error, at most 64 KB.</td></tr>
<tr><th scope="row">A report does not contain</th><td>Audio, transcripts, translations, text typed in Type &amp; Translate, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses. The app scrubs personal folder paths, keys, tokens and email addresses from the log before sending; our server checks again and rejects a report if anything is left.</td></tr>
<tr><th scope="row">How it is tied to you</th><td>The hashed machine ID in the report is the same one we store for licensing and the Free trial, so we can link a report to that machine's license and email when handling a support request.</td></tr>
```

- [ ] **Step 3: Khắc phục sự cố**

Trong `website/src/content/vi/guide-troubleshooting.mjs`, tìm đoạn (duy nhất):

```js
  { level: 2, id: "ban-quyen", text: "Bản quyền, hạn mức, dùng thử" },
  { level: 2, id: "gui-log", text: "Gửi log và báo lỗi" },
```

thay bằng:

```js
  { level: 2, id: "ban-quyen", text: "Bản quyền, hạn mức, dùng thử" },
  { level: 2, id: "go-dich", text: "Gõ dịch" },
  { level: 2, id: "gui-log", text: "Gửi log và báo lỗi" },
```

Cùng file, tìm đoạn (duy nhất):

```js

<h2 id="gui-log">Gửi log và báo lỗi cho hỗ trợ</h2>
```

thay bằng:

```js

<h2 id="go-dich">Gõ dịch</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">Bấm ⌃⌥G (Ctrl+Alt+G) mà ô soạn không hiện</span><p><strong>Nguyên nhân:</strong> Gõ dịch đang tắt, hoặc phím tắt bị app khác giữ.</p><p><strong>Cách xử lý:</strong> Bật ở Cài đặt › Gõ dịch. Trên Windows, Cài đặt › Phím tắt báo phím chưa đăng ký được thì đổi sang phím khác; trên macOS, nếu app khác cũng dùng ⌃⌥G thì đổi phím của một bên.</p></div>
<div class="card"><span class="card-title">“Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator.”</span><p><strong>Nguyên nhân:</strong> macOS chưa cho AI Translator quyền Trợ năng, hoặc quyền mất sau khi cập nhật app.</p><p><strong>Cách xử lý:</strong> Bấm ⌘V ở ô chat để dán lần này. Muốn app tự dán, bấm <strong>Bật tự dán</strong> rồi bật AI Translator trong Trợ năng; đã bật mà vẫn báo thì xóa app khỏi danh sách rồi thêm lại. Xem <a href="/huong-dan/go-dich/#quyen-tro-nang">Gõ dịch</a>.</p></div>
<div class="card"><span class="card-title">Bấm Enter mà bản dịch không vào ô chat</span><p><strong>Nguyên nhân:</strong> Ô đó không nhận dán tự động (ô mật khẩu, app chạy với quyền quản trị trên Windows, app chặn dán), hoặc cửa sổ chat không về phía trước kịp.</p><p><strong>Cách xử lý:</strong> Bản dịch vẫn nằm trong clipboard: bấm vào ô chat rồi dán bằng ⌘V hay Ctrl+V.</p></div>
<div class="card"><span class="card-title">“Một dòng quá dài để dịch. Hãy tách thành nhiều dòng hay nhiều tin.”</span><p><strong>Nguyên nhân:</strong> Một dòng của tin nhắn quá dài để dịch một lần (cả tin tối đa 4000 ký tự).</p><p><strong>Cách xử lý:</strong> Bấm Shift+Enter để xuống dòng ở chỗ hợp lý, hoặc tách thành nhiều tin.</p></div>
</div>

<h2 id="gui-log">Gửi log và báo lỗi cho hỗ trợ</h2>
```

Trong `website/src/content/en/guide-troubleshooting.mjs`, tìm đoạn (duy nhất):

```js
  { level: 2, id: "license-quota", text: "License, quota and trial" },
  { level: 2, id: "send-logs", text: "Send logs and report a problem" },
```

thay bằng:

```js
  { level: 2, id: "license-quota", text: "License, quota and trial" },
  { level: 2, id: "type-and-translate", text: "Type & Translate" },
  { level: 2, id: "send-logs", text: "Send logs and report a problem" },
```

Cùng file, tìm đoạn (duy nhất):

```js

<h2 id="send-logs">Send logs and report a problem</h2>
```

thay bằng:

```js

<h2 id="type-and-translate">Type &amp; Translate</h2>
<div class="grid grid-2">
<div class="card"><span class="card-title">Pressing ⌃⌥G (Ctrl+Alt+G) does not open the compose box</span><p><strong>Cause:</strong> Type &amp; Translate is turned off, or another app holds the shortcut.</p><p><strong>Fix:</strong> Turn it on in Settings › Type &amp; Translate. On Windows, if Settings › Shortcuts says the shortcut is not registered, choose another one; on macOS, if another app also uses ⌃⌥G, change the shortcut of one of them.</p></div>
<div class="card"><span class="card-title">“Translation copied. To let AI Translator paste it for you, allow it in Accessibility.”</span><p><strong>Cause:</strong> macOS has not given AI Translator the Accessibility permission, or the permission was lost after an app update.</p><p><strong>Fix:</strong> Press ⌘V in the chat box to paste this time. To let the app paste for you, click <strong>Turn on auto-paste</strong> and turn on AI Translator in Accessibility; if it is already on and the app still asks, remove it from the list and add it again. See <a href="/en/guide/type-and-translate/#accessibility">Type &amp; Translate</a>.</p></div>
<div class="card"><span class="card-title">Pressing Enter does not put the translation in the chat box</span><p><strong>Cause:</strong> That box does not accept automatic pasting (a password field, an app running as administrator on Windows, an app that blocks pasting), or the chat window did not come to the front in time.</p><p><strong>Fix:</strong> The translation is still on the clipboard: click into the chat box and paste with ⌘V or Ctrl+V.</p></div>
<div class="card"><span class="card-title">“A line is too long to translate. Split it into several lines or messages.”</span><p><strong>Cause:</strong> One line of the message is too long to translate at once (a whole message can be up to 4000 characters).</p><p><strong>Fix:</strong> Press Shift+Enter to break the line at a sensible place, or split it into several messages.</p></div>
</div>

<h2 id="send-logs">Send logs and report a problem</h2>
```

- [ ] **Step 4: Câu cũ ở các trang khác**

Trong `website/src/content/vi/guide-audio-permission.mjs`, tìm đoạn (duy nhất):

```js
  title: "Cấp quyền ghi âm thanh hệ thống trên macOS",
  lead: "AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống (System Audio Recording), để nghe âm thanh mà máy Mac đang phát. App không dùng micro. Nếu bạn lỡ từ chối, hãy bật lại ở System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>Chỉ áp dụng cho macOS 14.2 trở lên</span> <span>Cập nhật {{updated}}</span>",
```

thay bằng:

```js
  title: "Cấp quyền ghi âm thanh hệ thống trên macOS",
  lead: "Để dịch phụ đề, AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống (System Audio Recording), để nghe âm thanh mà máy Mac đang phát. App không dùng micro. Nếu bạn lỡ từ chối, hãy bật lại ở System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>Chỉ áp dụng cho macOS 14.2 trở lên</span> <span>Cập nhật {{updated}}</span>",
```

Trong `website/src/content/en/guide-audio-permission.mjs`, tìm đoạn (duy nhất):

```js
  title: "Grant system audio recording permission on macOS",
  lead: "AI Translator needs exactly one macOS permission: System Audio Recording, so it can hear the audio your Mac is playing. It does not use the microphone. If you refused it by mistake, turn it back on in System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>macOS 14.2 or later only</span> <span>Updated {{updated}}</span>",
```

thay bằng:

```js
  title: "Grant system audio recording permission on macOS",
  lead: "For subtitles, AI Translator needs exactly one macOS permission: System Audio Recording, so it can hear the audio your Mac is playing. It does not use the microphone. If you refused it by mistake, turn it back on in System Settings › Privacy & Security › Screen & System Audio Recording.",
  meta: "<span>macOS 14.2 or later only</span> <span>Updated {{updated}}</span>",
```

Trong `website/src/content/vi/compare-offline-cloud.mjs`, tìm đoạn (duy nhất):

```js
    q: "Dịch offline có dịch giọng của tôi cho người khác nghe không?",
    a: "<p>Chưa. AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn; chưa dịch giọng bạn cho người khác nghe.</p>",
  },
```

thay bằng:

```js
    q: "Dịch offline có dịch giọng của tôi cho người khác nghe không?",
    a: "<p>Chưa. Phụ đề của AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn; chưa dịch giọng bạn cho người khác nghe. Muốn trả lời bằng chữ, bạn dùng <a href=\"/huong-dan/go-dich/\">Gõ dịch</a>: gõ bằng tiếng của bạn, app dán bản dịch vào ô chat, cũng chạy trên máy.</p>",
  },
```

Trong `website/src/content/en/compare-offline-cloud.mjs`, tìm đoạn (duy nhất):

```js
    q: "Can offline translation translate my voice for the other people?",
    a: "<p>Not yet. AI Translator works one way, from the audio playing on your computer into your language; it does not translate your voice for others to hear.</p>",
  },
```

thay bằng:

```js
    q: "Can offline translation translate my voice for the other people?",
    a: "<p>Not yet. AI Translator subtitles work one way, from the audio playing on your computer into your language; it does not translate your voice for others to hear. To reply in writing, use <a href=\"/en/guide/type-and-translate/\">Type &amp; Translate</a>: you type in your own language and the app pastes the translation into the chat box, also on your computer.</p>",
  },
```

Trong `website/src/content/vi/solutions.mjs`, tìm đoạn (duy nhất):

```js
${checkList([
  "<strong>Bạn cần người cùng họp nghe giọng bạn đã được dịch.</strong> AI Translator chỉ dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn. Chưa có dịch giọng bạn để phát vào cuộc họp.",
  "<strong>Bạn cần ghi âm cuộc họp.</strong> App không ghi âm xuống đĩa. Nó chỉ có bản chép lời bằng chữ; lưu lịch sử là tính năng Pro và mặc định tắt.",
```

thay bằng:

```js
${checkList([
  "<strong>Bạn cần người cùng họp nghe giọng bạn đã được dịch.</strong> Phụ đề của AI Translator chỉ dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn. Chưa có dịch giọng bạn để phát vào cuộc họp; trả lời bằng chữ thì dùng được <a href=\"/huong-dan/go-dich/\">Gõ dịch</a>.",
  "<strong>Bạn cần ghi âm cuộc họp.</strong> App không ghi âm xuống đĩa. Nó chỉ có bản chép lời bằng chữ; lưu lịch sử là tính năng Pro và mặc định tắt.",
```

Trong `website/src/content/en/solutions.mjs`, tìm đoạn (duy nhất):

```js
${checkList([
  "<strong>You need the other people to hear your translated voice.</strong> AI Translator translates one way only, from the audio playing on your computer into your language. It does not translate your voice and play it into the meeting.",
  "<strong>You need to record the meeting.</strong> The app does not record audio to disk. It keeps a text transcript only, and saving history is a Pro feature that is off by default.",
```

thay bằng:

```js
${checkList([
  "<strong>You need the other people to hear your translated voice.</strong> AI Translator subtitles go one way only, from the audio playing on your computer into your language. It does not translate your voice and play it into the meeting; for written replies you can use <a href=\"/en/guide/type-and-translate/\">Type &amp; Translate</a>.",
  "<strong>You need to record the meeting.</strong> The app does not record audio to disk. It keeps a text transcript only, and saving history is a Pro feature that is off by default.",
```

Trong `website/src/content/vi/solutions-meetings.mjs`, tìm đoạn (duy nhất):

```js
  ["Dùng với", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>Không bot, không plugin; app nào phát tiếng ra máy cũng thu được</small>"],
  ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Một chiều, sang ngôn ngữ bạn chọn</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Mac M4 Pro, gói model Chuẩn; máy yếu hơn sẽ chậm hơn</small>"],
```

thay bằng:

```js
  ["Dùng với", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>Không bot, không plugin; app nào phát tiếng ra máy cũng thu được</small>"],
  ["Ngôn ngữ", "tiếng Anh, tiếng Trung (中文), tiếng Nhật (日本語), tiếng Hàn (한국어), tiếng Việt<small>Phụ đề một chiều, sang ngôn ngữ bạn chọn</small>"],
  ["Độ trễ", "Trung vị 0,76–1,03 giây<small>Mac M4 Pro, gói model Chuẩn; máy yếu hơn sẽ chậm hơn</small>"],
```

Trong `website/src/content/en/solutions-meetings.mjs`, tìm đoạn (duy nhất):

```js
  ["Works with", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>No bot, no plugin; any app that plays sound through your computer can be captured</small>"],
  ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>One way, into the language you choose</small>"],
  ["Latency", "Median 0.76–1.03 seconds<small>Mac M4 Pro, Standard pack; slower machines will be slower</small>"],
```

thay bằng:

```js
  ["Works with", "Zoom, Microsoft Teams, Google Meet, Zalo PC<small>No bot, no plugin; any app that plays sound through your computer can be captured</small>"],
  ["Languages", "English, Chinese (中文), Japanese (日本語), Korean (한국어), Vietnamese (Tiếng Việt)<small>Subtitles go one way, into the language you choose</small>"],
  ["Latency", "Median 0.76–1.03 seconds<small>Mac M4 Pro, Standard pack; slower machines will be slower</small>"],
```

- [ ] **Step 5: Chạy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 120`, `ℹ pass 118`, `ℹ fail 0`, không dòng `✖` (test `Dữ liệu và bảo mật: số nơi app kết nối …` vẫn đạt: năm nơi).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add website/src/content && git commit -q -m "docs(website): Gõ dịch ở Hỏi đáp, Dữ liệu và bảo mật, Khắc phục sự cố; sửa các câu một chiều và một quyền" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: Test khóa nội dung Gõ dịch, quy tắc trong README

**Files:**
- Modify: `website/test/site.test.mjs`, `website/README.md`

Bốn test mới, đặt ngay trước test chính sách của Task 1:
- `STALE_COMPOSE`: luật câu cũ (hàm thuần, có mẫu phải bắt và mẫu phải giữ), rồi quét mọi nguồn chữ của site (thân trang, `<title>`, mô tả, `alt`, `aria-label`, JSON-LD, mẫu thư, ba file `llms*.txt`) bằng `scanStale` sẵn có.
- Hướng dẫn trích đúng 17 chuỗi của app (`appDict`, `blanked` sẵn có); chữ có "&" được so sau khi bỏ "&" ở cả hai phía.
- Cụm bắt buộc theo từng trang (vi, en).

Các test này đạt ngay vì nội dung đã làm ở Task 3 đến 5; chúng giữ nội dung không bị gỡ hay sai đi về sau. Để chắc chúng thật sự bắt lỗi, Step 2 làm hỏng tạm một câu rồi trả lại.

- [ ] **Step 1: Thêm test**

Trong `website/test/site.test.mjs`, tìm dòng (duy nhất):

```js
test("chính sách quyền riêng tư: Gõ dịch ở mục 2, 3 (dữ liệu trên máy, clipboard, quyền Trợ năng), 4 (không kết nối nào mang chữ gõ) và 10 (báo cáo không gồm chữ gõ)", () => {
```

thay bằng:

```js
// ---- Gõ dịch (spec 2026-10-17-go-dich): website nói đúng tính năng mới, trích đúng chữ của app, không còn câu cũ ----

// Câu cũ đã gỡ khi có Gõ dịch: số phím tắt, "cần đúng một quyền" trên macOS, "dịch một chiều" nói chung (phụ đề vẫn một chiều,
// nhưng tin nhắn gõ thì dịch được qua Gõ dịch: câu nói một chiều phải nói rõ là phụ đề).
const STALE_COMPOSE = [
  { id: "vi: năm phím tắt", re: /năm\s+phím\s+tắt|liệt\s+kê\s+năm\s+việc/iu },
  { id: "en: five shortcuts", re: /\bfive\s+(?:global\s+|default\s+)?shortcuts\b|\bfive\s+actions\b/i },
  { id: "vi: cần đúng một quyền", re: /cần\s+đúng\s+một\s+quyền/iu, unless: /dịch\s+phụ\s+đề/iu },
  { id: "en: exactly one permission", re: /\bexactly\s+one\s+(?:macOS\s+)?permission\b/i, unless: /\bsubtitles?\b/i },
  { id: "vi: chỉ quyền Ghi âm thanh hệ thống", re: /^Chỉ\s+quyền\s+Ghi\s+âm\s+thanh\s+hệ\s+thống/iu },
  { id: "en: only System Audio Recording permission", re: /^Only\s+System\s+Audio\s+Recording\s+permission/i },
  { id: "vi: dịch một chiều (không nói phụ đề)", re: /dịch\s+một\s+chiều|^một\s+chiều\b/iu, unless: /phụ\s+đề/iu },
  { id: "en: one way (without subtitles)", re: /\b(?:works?|translates?)\s+(?:in\s+)?one\s+(?:way|direction)\b|^one\s+(?:way|direction)\b/i, unless: /\bsubtitles?\b/i },
];
const STALE_COMPOSE_MUST_CATCH = [
  "Năm phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở.",
  "Cài đặt Phím tắt liệt kê năm việc cùng tổ hợp phím mặc định trên macOS.",
  "Five global shortcuts work even when AI Translator is not the window in front.",
  "Shortcuts settings listing the five actions with their default macOS key combinations.",
  "AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống.",
  "AI Translator needs exactly one macOS permission: System Audio Recording.",
  "Chỉ quyền Ghi âm thanh hệ thống (System Audio Recording); AI Translator không dùng micro.",
  "Only System Audio Recording permission; AI Translator does not use the microphone.",
  "Chưa. AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn.",
  "Not yet. AI Translator works one way, from the audio playing on your computer into your language.",
  "Một chiều, sang ngôn ngữ bạn chọn",
  "One way, into the language you choose",
];
const STALE_COMPOSE_MUST_KEEP = [
  "Sáu phím tắt toàn cục hoạt động ngay cả khi AI Translator không phải cửa sổ đang mở.",
  "Để dịch phụ đề, AI Translator cần đúng một quyền trên macOS: Ghi âm thanh hệ thống.",
  "For subtitles, AI Translator needs exactly one macOS permission: System Audio Recording.",
  "Phụ đề của AI Translator dịch một chiều, từ âm thanh phát trên máy sang ngôn ngữ của bạn.",
  "AI Translator subtitles work one way, from the audio playing on your computer into your language.",
  "Dịch hai chiều bằng giọng nói, để giọng của bạn cũng được dịch cho người cùng họp.",
];

test("luật câu cũ về Gõ dịch (STALE_COMPOSE) bắt câu cũ và không bắt câu đúng", () => {
  const missed = STALE_COMPOSE_MUST_CATCH.filter((s) => staleHits(s, STALE_COMPOSE).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_COMPOSE_MUST_KEEP.filter((s) => staleHits(s, STALE_COMPOSE).length > 0).map((s) => `${s} → ${staleHits(s, STALE_COMPOSE).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site còn câu cũ về số phím tắt, số quyền trên macOS hay 'dịch một chiều' không nói rõ là phụ đề", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_COMPOSE), []);
});

// Chữ của app có "&" (Type & Translate): textOf đổi thực thể HTML thành khoảng trắng, nên so cả hai phía sau khi bỏ "&".
const plainAmp = (s) => s.replace(/&/g, " ").replace(/\s+/g, " ").trim();

test("Gõ dịch: hướng dẫn trích đúng chữ trên ô soạn và ở Cài đặt › Gõ dịch của app (từ điển i18n vi và en)", async () => {
  const keys = [
    "compose.title", "compose.loading", "compose.translating", "compose.permission", "compose.permission.allow", "compose.permission.copyOnly",
    "settings.group.compose", "settings.compose.enabled", "settings.compose.target", "settings.compose.target.hint", "settings.compose.autoPaste",
    "settings.compose.permission", "settings.compose.permission.granted", "settings.compose.permission.open", "hotkeys.compose",
    "error.composeTooLong", "error.composeFailed",
  ];
  const errors = [];
  for (const [lang, path] of [["vi", "/huong-dan/go-dich/"], ["en", "/en/guide/type-and-translate/"]]) {
    const d = await appDict(lang);
    const text = plainAmp(textOf(htmlByPath.get(path)));
    for (const k of keys) {
      if (!d[k]) errors.push(`${lang}: không đọc được khóa ${k} của từ điển app`);
      else if (!text.includes(plainAmp(blanked(d[k])))) errors.push(`${path}: không trích "${blanked(d[k])}" (${k})`);
    }
  }
  assert.deepEqual(errors, []);
});

test("Gõ dịch: các trang nêu phím tắt, mọi gói, không trừ thời lượng, quyền Trợ năng, chữ gõ không rời máy; bản Windows chưa thử trên máy thật", () => {
  const need = {
    "/huong-dan/go-dich/": ["⌃⌥G", "Ctrl+Alt+G", "Mọi gói còn hiệu lực", "không trừ thời lượng dịch", "không bao giờ dán câu gốc", "Trợ năng", "clipboard", "chưa thử nó trên máy Windows thật"],
    "/en/guide/type-and-translate/": ["⌃⌥G", "Ctrl+Alt+G", "Every active plan", "does not use translation time", "never pastes your original text", "Accessibility", "clipboard", "not yet tried it on a real Windows computer"],
    "/": ["Trả lời bằng tiếng của người bên kia", "không trừ thời lượng dịch"],
    "/en/": ["Reply in the other person's language", "does not use translation time"],
    "/tinh-nang/": ["Sáu phím tắt toàn cục", "Mở hoặc đóng ô soạn Gõ dịch", "không trừ", "chưa được thử trên máy thật"],
    "/en/features/": ["Six global shortcuts", "Open or close the Type", "does not use", "has not been tried on a real computer"],
    "/bang-gia/": ["Gõ dịch tin nhắn (không trừ thời lượng dịch)"],
    "/en/pricing/": ["for chat messages (does not use translation time)"],
    "/huong-dan/thanh-phu-de-va-phim-tat/": ["Mở hoặc đóng ô soạn Gõ dịch"],
    "/en/guide/subtitle-bar-and-shortcuts/": ["Open or close the Type"],
    "/cau-hoi-thuong-gap/": ["Gõ dịch là gì?", "không tính vào thời lượng", "⌃⌥G (Ctrl+Alt+G)", "quyền Trợ năng"],
    "/en/faq/": ["What is Type", "are not counted", "⌃⌥G (Ctrl+Alt+G)", "Accessibility permission"],
    "/bao-mat-du-lieu/": ["Chữ bạn gõ ở Gõ dịch và bản dịch của nó", "quyền Trợ năng"],
    "/en/data-security/": ["Translate and its translation", "Accessibility permission"],
    "/huong-dan/khac-phuc-su-co/": ["Đã chép bản dịch. Muốn app tự dán, hãy cấp quyền Trợ năng cho AI Translator."],
    "/en/guide/troubleshooting/": ["Translation copied. To let AI Translator paste it for you, allow it in Accessibility."],
    "/huong-dan/": ["Gõ dịch tin nhắn"],
    "/en/guide/": ["Ten step-by-step guides"],
  };
  const errors = Object.entries(need).flatMap(([path, needles]) => needsIn(path, textOf(htmlByPath.get(path) ?? ""), needles));
  assert.deepEqual(errors, []);
});

test("chính sách quyền riêng tư: Gõ dịch ở mục 2, 3 (dữ liệu trên máy, clipboard, quyền Trợ năng), 4 (không kết nối nào mang chữ gõ) và 10 (báo cáo không gồm chữ gõ)", () => {
```

- [ ] **Step 2: Chạy, rồi thử làm hỏng tạm một câu**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 124`, `ℹ pass 122`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && sed -i '' 's/Sáu phím tắt toàn cục/Năm phím tắt toàn cục/' src/content/vi/features.mjs && pnpm test 2>&1 | grep -E 'ℹ fail|còn câu cũ \[vi: năm phím tắt\]' | head -3; git checkout -- src/content/vi/features.mjs && git status --short
```
Expected: `ℹ fail 2` (luật câu cũ và cụm bắt buộc của trang Tính năng) cùng dòng `còn câu cũ [vi: năm phím tắt]`; sau `git checkout` không còn file đổi.

- [ ] **Step 3: Quy tắc trong README của website**

Trong `website/README.md`, tìm đoạn (duy nhất):

```markdown
- **Báo cáo lỗi tự động của app** (spec `2026-10-17-diagnostics-reports-design.md`): website nói đúng việc app tự gửi báo cáo lỗi đã che dữ liệu cá nhân (bật mặc định, tắt ở Cài đặt › Quyền riêng tư, giữ 30 ngày, gắn được với license qua mã băm của máy). **Không** nói "app không tự gửi báo cáo lỗi hay log": test `STALE_REPORTS` chặn các câu đó, kể cả trong chuỗi giao diện của app (vi, en). Đổi hành vi này thì sửa chính sách mục 10 (`docs/legal/privacy.{vi,en}.md`), các trang Dữ liệu và bảo mật, Hỏi đáp, Khắc phục sự cố, Liên hệ và Bắt đầu nhanh.
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật chạy trong Chrome với IPC giả (`scripts/ui-preview/`: chạy `pnpm exec vite --config scripts/ui-preview/vite.config.ts` ở gốc repo, rồi `node scripts/ui-preview/shoot.mjs [tên ảnh…]`; Vite ở cổng khác thì thêm `--port=<cổng>` hay đặt `UI_PREVIEW_PORT`; cần `cwebp` và `sips`, nên chỉ chụp được trên macOS; script ghi WebP và cập nhật dung lượng, kích thước trong `manifest.json`). Chụp lại khi giao diện app đổi. Ảnh lặp lại được (múi giờ Chrome và giờ của đơn thanh toán cố định trong `shoot.mjs`; phiên bản ở chân thanh bên lấy từ `src-tauri/tauri.conf.json`: đổi phiên bản app thì chụp lại ảnh có chân thanh bên, rồi kiểm cùng các chỗ nêu số phiên bản trong hướng dẫn). Mô tả (`description`) trong `manifest.json` và alt ở `src/content/` là hai nguồn chữ tách nhau, sửa tay cả hai khi cảnh đổi; alt tả đúng cảnh chụp và dùng đúng nhãn trên màn hình ("Cách thanh toán", "Hoàn tất thanh toán trong trình duyệt"). Đổi giá hay hạn mức thì sửa bảng `PRICES` và `plansView` trong `scripts/ui-preview/tauri-mock.ts` (test `mock IPC của trang xem trước…` giữ chúng khớp `src/plans.mjs`) rồi chụp lại `app-upgrade*`. Ảnh Bảng giá tiếng Anh dùng cảnh USD `app-upgrade-usd` (khách ở nước ngoài thấy thẻ quốc tế chọn sẵn); trang tiếng Việt giữ cảnh VND `app-upgrade`. **Ảnh có lựa chọn thẻ chỉ đăng khi Creem bán thật**: nếu chụp lại trước đó (mock mặc định đã có giá USD và nhóm "Cách thanh toán") thì website nói về một cách trả chưa có; website là bước deploy sau cùng theo runbook phát hành (`docs/release/phat-hanh.md`), sau khi server và app đã chạy bản có thẻ.
```

thay bằng:

```markdown
- **Báo cáo lỗi tự động của app** (spec `2026-10-17-diagnostics-reports-design.md`): website nói đúng việc app tự gửi báo cáo lỗi đã che dữ liệu cá nhân (bật mặc định, tắt ở Cài đặt › Quyền riêng tư, giữ 30 ngày, gắn được với license qua mã băm của máy). **Không** nói "app không tự gửi báo cáo lỗi hay log": test `STALE_REPORTS` chặn các câu đó, kể cả trong chuỗi giao diện của app (vi, en). Đổi hành vi này thì sửa chính sách mục 10 (`docs/legal/privacy.{vi,en}.md`), các trang Dữ liệu và bảo mật, Hỏi đáp, Khắc phục sự cố, Liên hệ và Bắt đầu nhanh.
- **Gõ dịch** (spec `2026-10-17-go-dich-design.md`): website nói đúng: mở bằng ⌃⌥G / Ctrl+Alt+G, có ở mọi gói còn hiệu lực và không trừ thời lượng dịch, chữ gõ và bản dịch không rời máy, macOS cần quyền Trợ năng để tự dán, app có sáu phím tắt. Phụ đề vẫn dịch một chiều, nên câu nói "một chiều" phải nói rõ là phụ đề. Test `STALE_COMPOSE` chặn câu cũ ("năm phím tắt", "cần đúng một quyền", "dịch một chiều" không kèm "phụ đề"). Câu "bản Windows chưa được thử trên máy thật" ở hướng dẫn Gõ dịch và trang Tính năng (vi, en) chỉ bỏ khi đã thử Gõ dịch trên Windows; bỏ thì sửa cả needle của test `Gõ dịch: các trang nêu …`. Ảnh `compose-done` chụp từ `compose.html` của trang xem trước (cảnh `COMPOSE` của `shoot.mjs`).
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật chạy trong Chrome với IPC giả (`scripts/ui-preview/`: chạy `pnpm exec vite --config scripts/ui-preview/vite.config.ts` ở gốc repo, rồi `node scripts/ui-preview/shoot.mjs [tên ảnh…]`; Vite ở cổng khác thì thêm `--port=<cổng>` hay đặt `UI_PREVIEW_PORT`; cần `cwebp` và `sips`, nên chỉ chụp được trên macOS; script ghi WebP và cập nhật dung lượng, kích thước trong `manifest.json`). Chụp lại khi giao diện app đổi. Ảnh lặp lại được (múi giờ Chrome và giờ của đơn thanh toán cố định trong `shoot.mjs`; phiên bản ở chân thanh bên lấy từ `src-tauri/tauri.conf.json`: đổi phiên bản app thì chụp lại ảnh có chân thanh bên, rồi kiểm cùng các chỗ nêu số phiên bản trong hướng dẫn). Mô tả (`description`) trong `manifest.json` và alt ở `src/content/` là hai nguồn chữ tách nhau, sửa tay cả hai khi cảnh đổi; alt tả đúng cảnh chụp và dùng đúng nhãn trên màn hình ("Cách thanh toán", "Hoàn tất thanh toán trong trình duyệt"). Đổi giá hay hạn mức thì sửa bảng `PRICES` và `plansView` trong `scripts/ui-preview/tauri-mock.ts` (test `mock IPC của trang xem trước…` giữ chúng khớp `src/plans.mjs`) rồi chụp lại `app-upgrade*`. Ảnh Bảng giá tiếng Anh dùng cảnh USD `app-upgrade-usd` (khách ở nước ngoài thấy thẻ quốc tế chọn sẵn); trang tiếng Việt giữ cảnh VND `app-upgrade`. **Ảnh có lựa chọn thẻ chỉ đăng khi Creem bán thật**: nếu chụp lại trước đó (mock mặc định đã có giá USD và nhóm "Cách thanh toán") thì website nói về một cách trả chưa có; website là bước deploy sau cùng theo runbook phát hành (`docs/release/phat-hanh.md`), sau khi server và app đã chạy bản có thẻ.
```

- [ ] **Step 4: Chạy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 124`, `ℹ pass 122`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add website/test/site.test.mjs website/README.md && git commit -q -m "test(website): khóa nội dung Gõ dịch, chặn câu cũ về số phím tắt, số quyền và dịch một chiều" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6a: Chỉnh các câu nói quá phạm vi đã kiểm

**Làm sau Task 6, trước Task 7.** Lý do (quyết định 4): biên bản nghiệm thu (`bench/2026-10-17-go-dich/results/nghiem-thu-mac.md`) cho thấy GD1 mới đạt ở TextEdit và Chrome (trang thử); **chưa thử ở app chat thật**, nên website không được nói Gõ dịch dùng được "ở bất kỳ ô chat nào" hay liệt kê trình duyệt, app chat, khung chat của app họp như điều đã kiểm. Các câu được đổi thành mô tả đúng cơ chế ("dán vào ô bạn đang gõ, ở app nhận được lệnh dán") và hướng dẫn có thêm dòng "Phạm vi đã thử" ở mục giới hạn. Khi GD1 đạt ở các app chat thật, cập nhật dòng đó (và bỏ needle `chưa thử ở từng app chat`, `not yet tried every chat app` của test).

**Files:**
- Modify: `website/src/content/{vi,en}/{faq,guide-type-translate,features,guide,home}.mjs`, `website/test/site.test.mjs`

- [ ] **Step 1: Sửa các câu**

Trong `website/src/content/vi/faq.mjs`, tìm dòng (duy nhất):

```
        a: `<p>Gõ dịch giúp bạn nhắn tin bằng tiếng của người bên kia ở bất kỳ ô chat nào: bấm ⌃⌥G (Ctrl+Alt+G), gõ bằng tiếng của bạn, bấm Enter để dán bản dịch vào ô chat, rồi Enter lần nữa để gửi. Chữ bạn gõ và bản dịch được xử lý trên máy bạn, không gửi qua mạng, không ghi xuống đĩa; app chỉ chép bản dịch vào clipboard để dán. Gõ dịch có ở mọi gói còn hiệu lực và không trừ thời lượng dịch. Xem <a href="/huong-dan/go-dich/">hướng dẫn Gõ dịch</a>.</p>`,
```

thay bằng:

```
        a: `<p>Gõ dịch giúp bạn nhắn tin bằng tiếng của người bên kia ở ô chat đang dùng: bấm ⌃⌥G (Ctrl+Alt+G), gõ bằng tiếng của bạn, bấm Enter để dán bản dịch vào ô chat, rồi Enter lần nữa để gửi. Chữ bạn gõ và bản dịch được xử lý trên máy bạn, không gửi qua mạng, không ghi xuống đĩa; app chỉ chép bản dịch vào clipboard để dán. Gõ dịch có ở mọi gói còn hiệu lực và không trừ thời lượng dịch. Xem <a href="/huong-dan/go-dich/">hướng dẫn Gõ dịch</a>.</p>`,
```

Trong `website/src/content/vi/guide-type-translate.mjs`, tìm dòng (duy nhất):

```
    "Hướng dẫn Gõ dịch của AI Translator: bấm ⌃⌥G hoặc Ctrl+Alt+G, gõ tin nhắn bằng tiếng của bạn, Enter để dán bản dịch vào ô chat của app bất kỳ.",
```

thay bằng:

```
    "Hướng dẫn Gõ dịch của AI Translator: bấm ⌃⌥G hoặc Ctrl+Alt+G, gõ tin nhắn bằng tiếng của bạn, Enter để dán bản dịch vào ô chat bạn đang dùng.",
```

Cùng file, tìm dòng (duy nhất):

```
  lead: "Gõ dịch giúp bạn nhắn tin cho người nói tiếng khác ở bất kỳ ô chat nào: trình duyệt, app chat, khung chat của app họp. Bạn gõ bằng tiếng của mình trong một ô soạn nổi, AI Translator dịch ngay trên máy, rồi dán bản dịch vào ô chat để bạn xem lại và gửi.",
```

thay bằng:

```
  lead: "Gõ dịch giúp bạn nhắn tin cho người nói tiếng khác ở ô chat của app bạn đang dùng. Bạn gõ bằng tiếng của mình trong một ô soạn nổi, AI Translator dịch ngay trên máy, rồi dán bản dịch vào ô chat để bạn xem lại và gửi.",
```

Cùng file, tìm dòng (duy nhất):

```
<li><strong>Bản dịch luôn ở trong clipboard.</strong> Sau khi dán, bản dịch vẫn nằm trong clipboard (nội dung cũ của clipboard bị thay). Nếu chữ không vào ô chat, hãy bấm vào ô đó rồi tự dán bằng ⌘V hay Ctrl+V.</li>
```

thay bằng:

```
<li><strong>Phạm vi đã thử:</strong> trên macOS, chúng tôi đã thử ở trình duyệt Chrome và TextEdit, chưa thử ở từng app chat. Cách dán là gửi ⌘V (Ctrl+V) vào ô bạn đang gõ nên thường dùng được ở mọi ô nhận dán; nếu một app cho kết quả lạ, hãy báo cho chúng tôi ở trang <a href="/lien-he/">liên hệ</a>.</li>
<li><strong>Bản dịch luôn ở trong clipboard.</strong> Sau khi dán, bản dịch vẫn nằm trong clipboard (nội dung cũ của clipboard bị thay). Nếu chữ không vào ô chat, hãy bấm vào ô đó rồi tự dán bằng ⌘V hay Ctrl+V.</li>
```

Trong `website/src/content/vi/features.mjs`, tìm dòng (duy nhất):

```
<h2>Nhắn tin bằng tiếng của người bên kia, ở bất kỳ ô chat nào</h2>
```

thay bằng:

```
<h2>Nhắn tin bằng tiếng của người bên kia, ngay trong ô chat đang dùng</h2>
```

Cùng file, tìm dòng (duy nhất):

```
<p>Bấm ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) ở ô chat của trình duyệt, app chat hay khung chat của app họp. Gõ bằng tiếng của bạn trong ô soạn nổi, bản dịch hiện ngay bên dưới. Bấm Enter để dán bản dịch vào ô chat, xem lại rồi bấm Enter lần nữa để gửi.</p>
```

thay bằng:

```
<p>Bấm ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) ở ô chat của app bạn đang dùng. Gõ bằng tiếng của bạn trong ô soạn nổi, bản dịch hiện ngay bên dưới. Bấm Enter để dán bản dịch vào ô chat, xem lại rồi bấm Enter lần nữa để gửi.</p>
```

Trong `website/src/content/vi/guide.mjs`, tìm dòng (duy nhất):

```
${linkCard({ href: "/huong-dan/go-dich/", icon: "message", title: "Gõ dịch tin nhắn", text: "Bấm ⌃⌥G (Ctrl+Alt+G) ở ô chat bất kỳ, gõ bằng tiếng của bạn, Enter để dán bản dịch; quyền Trợ năng trên macOS.", more: MORE })}
```

thay bằng:

```
${linkCard({ href: "/huong-dan/go-dich/", icon: "message", title: "Gõ dịch tin nhắn", text: "Bấm ⌃⌥G (Ctrl+Alt+G) ở ô chat đang dùng, gõ bằng tiếng của bạn, Enter để dán bản dịch; quyền Trợ năng trên macOS.", more: MORE })}
```

Trong `website/src/content/vi/home.mjs`, tìm dòng (duy nhất):

```
<p class="lead">Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat bất kỳ, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.</p>
```

thay bằng:

```
<p class="lead">Bấm ⌃⌥G (Windows: Ctrl+Alt+G) ở ô chat đang dùng, gõ bằng tiếng của bạn rồi bấm Enter: bản dịch được dán vào ô chat để bạn xem lại và gửi.</p>
```

Cùng file, tìm dòng (duy nhất):

```
  "Dùng ở ô chat của trình duyệt, app chat và khung chat của app họp",
```

thay bằng:

```
  "Dán vào ô bạn đang gõ, ở app nhận được lệnh dán (⌘V, Ctrl+V)",
```

Trong `website/src/content/en/faq.mjs`, tìm dòng (duy nhất):

```
        a: `<p>Type &amp; Translate lets you message people in their language from any chat box: press ⌃⌥G (Ctrl+Alt+G), type in your own language, press Enter to paste the translation into the chat box, then press Enter again to send. What you type and its translation are processed on your computer, not sent over the network and not written to disk; the app only copies the translation to the clipboard to paste it. Type &amp; Translate is included in every active plan and does not use translation time. See the <a href="/en/guide/type-and-translate/">Type &amp; Translate guide</a>.</p>`,
```

thay bằng:

```
        a: `<p>Type &amp; Translate lets you message people in their language from the chat box you are using: press ⌃⌥G (Ctrl+Alt+G), type in your own language, press Enter to paste the translation into the chat box, then press Enter again to send. What you type and its translation are processed on your computer, not sent over the network and not written to disk; the app only copies the translation to the clipboard to paste it. Type &amp; Translate is included in every active plan and does not use translation time. See the <a href="/en/guide/type-and-translate/">Type &amp; Translate guide</a>.</p>`,
```

Trong `website/src/content/en/guide-type-translate.mjs`, tìm dòng (duy nhất):

```
    "How to use Type & Translate in AI Translator: press ⌃⌥G or Ctrl+Alt+G, type in your own language, press Enter to paste the translation into any chat box.",
```

thay bằng:

```
    "How to use Type & Translate in AI Translator: press ⌃⌥G or Ctrl+Alt+G, type in your own language, Enter pastes the translation into the chat box you are using.",
```

Cùng file, tìm dòng (duy nhất):

```
  lead: "Type & Translate lets you message people who speak another language from any chat box: a browser, a chat app, the chat panel of a meeting app. You type in your own language in a floating compose box, AI Translator translates it on your computer, then pastes the translation into the chat box for you to check and send.",
```

thay bằng:

```
  lead: "Type & Translate lets you message people who speak another language from the chat box of the app you are using. You type in your own language in a floating compose box, AI Translator translates it on your computer, then pastes the translation into the chat box for you to check and send.",
```

Cùng file, tìm dòng (duy nhất):

```
<li><strong>The translation is always on the clipboard.</strong> After pasting, the translation stays on the clipboard (it replaces what was there). If the text does not appear in the chat box, click into it and paste with ⌘V or Ctrl+V yourself.</li>
```

thay bằng:

```
<li><strong>What we have tried:</strong> on macOS, in the Chrome browser and TextEdit; we have not yet tried every chat app. Pasting works by sending ⌘V (Ctrl+V) to the box you are typing in, so it usually works in any box that accepts pasting; if an app behaves oddly, tell us on the <a href="/en/contact/">contact</a> page.</li>
<li><strong>The translation is always on the clipboard.</strong> After pasting, the translation stays on the clipboard (it replaces what was there). If the text does not appear in the chat box, click into it and paste with ⌘V or Ctrl+V yourself.</li>
```

Trong `website/src/content/en/features.mjs`, tìm dòng (duy nhất):

```
<h2>Chat in the other person's language, in any chat box</h2>
```

thay bằng:

```
<h2>Chat in the other person's language, right in the chat box you are using</h2>
```

Cùng file, tìm dòng (duy nhất):

```
<p>Press ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) in the chat box of a browser, a chat app or a meeting app. Type in your own language in the floating compose box and the translation appears right below. Press Enter to paste the translation into the chat box, check it, then press Enter again to send.</p>
```

thay bằng:

```
<p>Press ${keys(["⌃", "⌥", "G"])} (Windows: ${keys(["Ctrl", "Alt", "G"])}) in the chat box of the app you are using. Type in your own language in the floating compose box and the translation appears right below. Press Enter to paste the translation into the chat box, check it, then press Enter again to send.</p>
```

Trong `website/src/content/en/guide.mjs`, tìm dòng (duy nhất):

```
${linkCard({ href: "/en/guide/type-and-translate/", icon: "message", title: "Type & Translate", text: "Press ⌃⌥G (Ctrl+Alt+G) in any chat box, type in your own language and press Enter to paste the translation; Accessibility on macOS.", more: MORE })}
```

thay bằng:

```
${linkCard({ href: "/en/guide/type-and-translate/", icon: "message", title: "Type & Translate", text: "Press ⌃⌥G (Ctrl+Alt+G) in the chat box you are using, type in your own language and press Enter to paste the translation; Accessibility on macOS.", more: MORE })}
```

Trong `website/src/content/en/home.mjs`, tìm dòng (duy nhất):

```
<p class="lead">Press ⌃⌥G (Windows: Ctrl+Alt+G) in any chat box, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.</p>
```

thay bằng:

```
<p class="lead">Press ⌃⌥G (Windows: Ctrl+Alt+G) in the chat box you are using, type in your own language and press Enter: the translation is pasted into the chat box for you to check and send.</p>
```

Cùng file, tìm dòng (duy nhất):

```
  "Works in the chat boxes of browsers, chat apps and meeting apps",
```

thay bằng:

```
  "Pastes into the box you are typing in, in any app that accepts pasting (⌘V, Ctrl+V)",
```

Trong `website/test/site.test.mjs`, tìm dòng (duy nhất):

```
    "/huong-dan/go-dich/": ["⌃⌥G", "Ctrl+Alt+G", "Mọi gói còn hiệu lực", "không trừ thời lượng dịch", "không bao giờ dán câu gốc", "Trợ năng", "clipboard", "chưa thử nó trên máy Windows thật"],
```

thay bằng:

```
    "/huong-dan/go-dich/": ["⌃⌥G", "Ctrl+Alt+G", "Mọi gói còn hiệu lực", "không trừ thời lượng dịch", "không bao giờ dán câu gốc", "Trợ năng", "clipboard", "chưa thử nó trên máy Windows thật", "chưa thử ở từng app chat"],
```

Cùng file, tìm dòng (duy nhất):

```
    "/en/guide/type-and-translate/": ["⌃⌥G", "Ctrl+Alt+G", "Every active plan", "does not use translation time", "never pastes your original text", "Accessibility", "clipboard", "not yet tried it on a real Windows computer"],
```

thay bằng:

```
    "/en/guide/type-and-translate/": ["⌃⌥G", "Ctrl+Alt+G", "Every active plan", "does not use translation time", "never pastes your original text", "Accessibility", "clipboard", "not yet tried it on a real Windows computer", "not yet tried every chat app"],
```

- [ ] **Step 2: Chạy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && (cd website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖')
```
Expected: `ℹ tests 124`, `ℹ pass 122`, `ℹ fail 0` (mô tả meta của trang hướng dẫn tiếng Anh không quá 165 ký tự).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add website && git commit -q -m "docs(website): Gõ dịch chỉ nói điều đã kiểm: dán vào ô đang gõ, ghi phạm vi đã thử" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 7: Ngày phát hành: chính sách lên 1.4 và ngày hiệu lực

**Làm vào ngày phát hành bản app có Gõ dịch, trước khi nâng phiên bản và build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực"; quy trình phát hành ở `docs/release/phat-hanh.md`). Chỉ làm khi chủ dự án đã cho phép phát hành. Ngày hiệu lực không được muộn hơn ngày deploy website; lệnh dưới lấy **ngày hôm nay theo giờ Việt Nam** (cùng múi giờ test sitemap dùng). EULA không đổi (giữ 1.3, ngày 2026-10-16).

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Cây làm việc sạch, các task trước đã xong**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git status --short && git log --oneline -12 | grep -c 'Gõ dịch\|go-dich'
```
Expected: `go-dich`, không có file đổi; có các commit của Task 1 đến 6.

- [ ] **Step 2: Đặt 1.4 và ngày ở bốn nơi, bằng một lệnh**

Lệnh ghi một script tạm ra thư mục tạm (ngoài repo, không commit), chạy với ngày hôm nay theo giờ Việt Nam, rồi xóa. Mỗi chuỗi cũ phải xuất hiện đúng một lần, nên chạy lần hai thì báo lỗi và không đổi gì thêm.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && T=$(mktemp -d) && cat > "$T/dat-ngay-chinh-sach-1-4.mjs" <<'EOF'
// Đặt chính sách quyền riêng tư 1.4 (Gõ dịch) và ngày hiệu lực ở mọi nơi trong repo. Chạy: node dat-ngay-chinh-sach-1-4.mjs <thư mục repo> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from "node:fs";

const [repo, iso] = process.argv.slice(2);
if (!repo || !/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) throw new Error("cách dùng: node dat-ngay-chinh-sach-1-4.mjs <thư mục repo> <YYYY-MM-DD>");
const [y, m, d] = iso.split("-");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const vi = `${d}/${m}/${y}`;
const en = `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;

// Mỗi chuỗi cũ phải xuất hiện đúng một lần: chạy lại lần hai (đã đổi rồi) thì báo lỗi, không đổi gì thêm.
function edit(file, from, to) {
  const path = `${repo}/${file}`;
  const text = readFileSync(path, "utf8");
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: "${from}" xuất hiện ${n} lần (cần đúng 1)`);
  writeFileSync(path, text.replace(from, () => to));
}

edit("docs/legal/privacy.vi.md", "**Phiên bản 1.3, hiệu lực từ 17/10/2026.**", `**Phiên bản 1.4, hiệu lực từ ${vi}.**`);
edit(
  "docs/legal/privacy.en.md",
  "**Version 1.3, effective 17 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**",
  `**Version 1.4, effective ${en}. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**`,
);
edit(
  "docs/legal/README.md",
  "**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.3 (hiệu lực từ 2026-10-17)**",
  `**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.4 (hiệu lực từ ${iso})**`,
);
edit("docs/legal/README.md", "chính sách quyền riêng tư 2026-10-17 (bản 1.3).", `chính sách quyền riêng tư ${iso} (bản 1.4).`);
console.log(`đã đặt chính sách 1.4, hiệu lực ${iso} (${vi} / ${en})`);
EOF
node "$T/dat-ngay-chinh-sach-1-4.mjs" "$PWD" "$(TZ=Asia/Ho_Chi_Minh date +%F)"; rm -rf "$T"
```
Expected: một dòng `đã đặt chính sách 1.4, hiệu lực <ngày hôm nay> (<dd/mm/yyyy> / <d tháng yyyy>)`. Lỗi `xuất hiện 0 lần` nghĩa là lệnh đã chạy rồi, hay dòng phiên bản không còn là 1.3, 17/10/2026.

- [ ] **Step 3: Nâng test của website lên 1.4**

Trong `website/test/site.test.mjs`, tìm dòng (duy nhất) bắt đầu bằng `test("chính sách quyền riêng tư 1.3 nêu Creem là bên bán lại` và đổi `1.3` trong dòng đó thành `1.4`. Cùng file, tìm dòng (duy nhất) bắt đầu bằng `test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.3:` và đổi `1.3` thành `1.4`.

Cùng file, tìm đoạn (duy nhất):

```js
  const viNeeds = ["Phiên bản 1.3", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.3", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

thay bằng:

```js
  const viNeeds = ["Phiên bản 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

Cùng file, tìm đoạn (duy nhất):

```js
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.3 (báo cáo lỗi tự động) với ngày hiệu lực SAU ngày của bản 1.2 (2026-10-16): ngày
  // chưa được đặt (còn ngày của bản 1.2) thì test đỏ. Đặt ngày bằng lệnh ở kế hoạch bao-cao-loi-05, Task 8, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.3") errors.push("giữ EULA 1.3 và chính sách 1.3");
  if (!privacyHead || privacyHead.iso <= "2026-10-16") {
    errors.push(`chính sách 1.3 phải có ngày hiệu lực sau 2026-10-16 (ngày của bản 1.2), đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

thay bằng:

```js
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.4 (Gõ dịch) với ngày hiệu lực không sớm hơn ngày của bản 1.3 (2026-10-17).
  // Đặt bản và ngày bằng lệnh ở kế hoạch go-dich-06 (task ngày phát hành), trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.4") errors.push("giữ EULA 1.3 và chính sách 1.4");
  if (!privacyHead || privacyHead.iso < "2026-10-17") {
    errors.push(`chính sách 1.4 phải có ngày hiệu lực từ 2026-10-17 (ngày của bản 1.3) trở đi, đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

- [ ] **Step 4: Kiểm ngày nhất quán và chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && grep -n '^\*\*Phiên bản\|^\*\*Version' docs/legal/privacy.vi.md docs/legal/privacy.en.md && grep -c 'chính sách quyền riêng tư phiên bản 1.4' docs/legal/README.md && grep -c '17/10/2026' docs/legal/privacy.vi.md
```
Expected: hai dòng phiên bản `1.4` cùng một ngày (vi dạng `dd/mm/yyyy`, en dạng `d Month yyyy`); `1`; `0` (trừ khi hôm nay đúng là 17/10/2026).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 124`, `ℹ pass 122`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep Tests
```
Expected: `Tests  19 passed (19)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git branch --show-current && git add docs/legal website/test/site.test.mjs && git commit -q -m "docs(legal): chính sách quyền riêng tư lên bản 1.4, đặt ngày hiệu lực theo ngày phát hành" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

Sau đó mới nâng phiên bản và build app theo quy trình phát hành; chụp lại các ảnh có chân thanh bên theo `website/README.md`. Website deploy (`pnpm deploy`) là bước cuối, do chủ dự án chạy khi bản app đã đăng.

---

### Task 8: Kiểm cuối và báo cáo

**Files:** không sửa file.

- [ ] **Step 1: Toàn bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail)|^✖'
```
Expected: `ℹ tests 124`, `ℹ pass 122`, `ℹ fail 0`, không dòng `✖`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && pnpm test 2>&1 | grep Tests && git status --short
```
Expected: `Tests  321 passed` (giao diện app không đổi), không file nào chưa commit.

- [ ] **Step 2: Không lộ công nghệ lõi, không còn chỗ chưa làm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich && git diff --name-only $(git log --format=%H --grep='docs(legal): chính sách quyền riêng tư nói về Gõ dịch' -1)~1 HEAD -- website docs/legal | xargs grep -n 'TODO\|TBD' ; echo "---"; cd /Users/dtphong/Desktop/software_business/meeting-translator-work/go-dich/website && node --test --test-name-pattern 'không lộ công nghệ lõi' test/site.test.mjs 2>&1 | grep -E 'ℹ (pass|fail)'
```
Expected: không dòng nào trước `---`; `ℹ pass 1`, `ℹ fail 0`.

- [ ] **Step 3: Báo cáo**

Báo chủ dự án (tiếng Việt): các trang đã đổi (vi và en), trang mới, ảnh mới, chính sách 1.4 (đã đặt ngày hay chưa, tùy Task 7 đã làm chưa), các câu đã sửa theo biên bản GD1 và kết luận S3 (Task 0). Nhắc: **chưa deploy website**; deploy sau khi bản app có Gõ dịch đã đăng; câu "bản Windows chưa được thử" bỏ khi đã thử Windows.
