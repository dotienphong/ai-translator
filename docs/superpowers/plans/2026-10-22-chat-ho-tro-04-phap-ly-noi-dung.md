# Chat hỗ trợ 04: pháp lý và nội dung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Khi có chat hỗ trợ, mọi văn bản và trang nói về kênh hỗ trợ và dữ liệu vẫn đúng sự thật: Chính sách quyền riêng tư lên bản 1.5 (mục 11 "Chat hỗ trợ" mới, Zalo là bên xử lý), A7 và §10.1 của spec gốc, `docs/legal/README.md`, website năm ngôn ngữ (Liên hệ, Dữ liệu và bảo mật, Trang chủ, Hỏi đáp), runbook phát hành từ bước 10 của mục 11. Có test chặn câu "email là kênh hỗ trợ duy nhất, website không có form" quay lại, và chặn "Zalo Bot", "zaloplatforms" ngoài hai trang chính sách.

**Architecture:** Văn bản pháp lý là nguồn duy nhất: `docs/legal/privacy.{vi,en}.md` vừa được app đóng gói lúc build vừa sinh hai trang chính sách của website (`website/src/content/legal.mjs`). Chính sách thêm mục 11 (mục 1–10 giữ số, "Thay đổi chính sách" và "Liên hệ" thành 12 và 13) và sửa mục 2, 4, 5, 6, 7; dòng phiên bản lên 1.5 **vào ngày phát hành app 0.2.4** bằng một lệnh (Task 10). Các trang thường nói lại đúng các điều đó nhưng không nêu tên kênh chuyển tin (quy tắc "không công bố kiến trúc nội bộ" của `website/README.md`). Mỗi thay đổi nội dung đi kèm test trong `website/test/site.test.mjs` viết trước.

**Tech Stack:** Markdown (`docs/legal`, spec, runbook); website tĩnh Node thuần (`website/`, test `node --test`); app chỉ được kiểm lại bằng `vitest` (`src/lib/legal.test.ts`), không sửa mã app.

**Spec:** `docs/superpowers/specs/2026-10-22-chat-ho-tro-zalo-design.md` (mục 0, 2.1, 2.3, 2.6, 2.7, 4, 5, 7, 8). **Hợp đồng:** `2026-10-22-chat-ho-tro-00-tong-quan.md`

---

## Quy tắc chung

Như mục "Quy tắc chung cho mọi kế hoạch" của kế hoạch 00, cộng thêm:

- **Mọi lệnh bắt đầu bằng `cd /Users/dtphong/Desktop/software_business/ai-translator &&`** (hay `cd /Users/dtphong/Desktop/software_business/ai-translator/website &&` cho lệnh test website). Làm thẳng trên `main`. Trước mỗi commit chạy `git branch --show-current` (phải ra `main`); chỉ `git add` đúng các file của task. **Không push, không deploy, không phát hành.**
- Sửa văn bản bằng công cụ **Edit**. Mỗi bước sửa ghi `Tệp: …` rồi một cặp khối ` ```old ` (nguyên văn hiện tại) và ` ```new ` (văn bản thay vào): dùng Edit với `old_string` = nội dung khối `old`, `new_string` = nội dung khối `new`. Khối `old` phải khớp **đúng một lần** trong tệp ngay trước khi sửa; không khớp hay khớp nhiều lần thì dừng và báo, đừng đoán. Làm các cặp lần lượt từ trên xuống. Thêm test vào cuối `website/test/site.test.mjs` bằng lệnh `cat >>` ghi sẵn ở từng task.
- **Chỉ nói điều có thật** (CLAUDE.md). **Không nhắc Zalo ở các trang thường của website**: chỉ hai trang chính sách (sinh từ `docs/legal`) nêu Zalo vì luật buộc nêu bên xử lý (spec mục 5). Chữ "Zalo" đứng riêng đã có sẵn ở hướng dẫn Gõ dịch (tên một app chat) và ở câu nhãn hiệu của chân trang chung, và vẫn được; test chỉ chặn "Zalo Bot" và "zaloplatforms" trên toàn site, và chặn "Zalo" trong thân trang Dữ liệu và bảo mật.
- Sửa một trang thì sửa đủ năm bản vi/en/ja/zh/ko; pháp lý chỉ vi/en. Bản ja/zh/ko phải giữ cùng khung với bản en (`website/test/i18n-content.test.mjs`: cùng số h2, cùng `id`, cùng liên kết, không sót câu tiếng Anh từ năm từ Latin liền nhau).
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Hợp đồng và quyết định dùng trong kế hoạch này

**Dữ kiện trích từ spec (không thêm, không bớt):** tin khách đi qua `api.aitranslator.io.vn` (D1) tới Zalo của chủ dự án qua Zalo Bot; câu trả lời về qua webhook. Dữ liệu tới Zalo chỉ gồm nội dung tin, mã cuộc chat (3 ký tự), nguồn, ngôn ngữ, trang (web), dòng thông tin máy (app, khi khách để tích) và thông báo "khách đã để lại email" (không kèm địa chỉ) hay "khách đã xóa cuộc chat"; **email không bao giờ tới Zalo**. Máy chủ lưu nội dung tin, email tự nguyện, nguồn, ngôn ngữ, trang (chỉ path, tối đa 200 ký tự, web), dòng thông tin máy (tối đa 300 ký tự, app), **mã băm SHA-256 của token** (không lưu token gốc). IP chỉ ở dạng HMAC trong bộ đếm `rate_limits`. Cuộc chat **tự xóa 90 ngày sau tin cuối** (`last_activity_at`); khách tự xóa bằng nút trong khung chat. Thư trả lời gửi qua Resend khi khách để lại email (cron, sau 2 phút, tối đa mỗi giờ một thư). Dòng thông tin máy: phiên bản app, hệ điều hành và phiên bản, chip hay CPU, RAM, card đồ họa (Windows), gói bản quyền, gói model, ngôn ngữ giao diện; **không bao giờ** có key, email của license, mã máy, tên máy hay tên người dùng; ô gửi kèm tích sẵn, chỉ hiện và chỉ gửi kèm tin đầu tiên. Nhịp hỏi tin của app (hợp đồng phía khách ở kế hoạch 00): màn hình Hỗ trợ đang mở thì 3 giây rồi 15 giây; đang chờ trả lời (tin cuối là của khách, trong 24 giờ qua) và **không đang dịch** thì 60 giây; còn lại, kể cả khi chưa từng chat, không kết nối. Spec mục 5: "trong lúc dịch chỉ khi màn hình Hỗ trợ đang mở hay người dùng bấm gửi". Bên xử lý: **Zalo, Công ty Cổ phần VNG, máy chủ ở Việt Nam**. EULA giữ bản 1.3. App có chat là **0.2.4**.

**Nhãn trong app** (kế hoạch 03 đặt; app là nguồn đúng). Kế hoạch này viết theo nhãn dự kiến dưới đây; Task 0 Step 3 kiểm và nếu app dùng nhãn khác thì thay trước khi làm Task 2–5.

| Ngôn ngữ | Nhãn màn hình Hỗ trợ dự kiến (khóa `nav.support`) | Các dạng xuất hiện trong kế hoạch này |
|---|---|---|
| vi | `Hỗ trợ` | `mục Hỗ trợ trong app`, `mục <strong>Hỗ trợ</strong> trong app`, `đang mở mục Hỗ trợ`, `màn hình **Hỗ trợ**`, `màn hình Hỗ trợ` |
| en | `Support` | `the Support screen`, `<strong>Support</strong> screen`, `the **Support** screen` |
| ja | `サポート` | `「サポート」画面`, `<strong>サポート</strong>画面` |
| zh | `客服` | `“客服”页面`, `<strong>客服</strong>页面` |
| ko | `지원` | `'지원' 화면`, `<strong>지원</strong> 화면` |

**Quyết định của kế hoạch này (chủ dự án cần biết):**

1. **Mục 4 của chính sách không thêm mục số 6.** Chat đi tới đúng host `api.aitranslator.io.vn` nên được gộp vào mục số 3 ("Làm việc với license server"), kèm nhịp kết nối. Lý do: trang Dữ liệu và bảo mật đếm "năm nơi" theo nơi nhận và có test giữ số dòng bảng bằng số mục ở mục 4 của chính sách.
2. **Chính sách nói thẳng rằng bản sao tin đã chuyển sang Zalo không tự xóa** theo 90 ngày hay theo nút xóa của khách, và hứa người vận hành xóa bản đó khi khách yêu cầu (mục 7, mục 11). Spec không nói gì về bản trong Zalo; viết khác đi thì chính sách sai sự thật. Nếu chủ dự án không muốn nhận việc xóa tay trong Zalo, sửa hai câu đó (Task 2 Step 5, Step 6, Step 9, Step 10) trước khi phát hành.
3. **Trang Dữ liệu và bảo mật không nêu tên Zalo** (theo spec mục 5) mà ghi "một dịch vụ nhắn tin đặt máy chủ ở Việt Nam", dẫn tới mục 6 của chính sách.
4. **Câu "máy chủ chỉ lưu …" ở Trang chủ và Hỏi đáp được sửa** (năm ngôn ngữ) vì là danh sách đóng: thêm chat thì câu cũ thành sai. Các câu "mạng chỉ cần để tải model, mua, kiểm tra bản quyền…" (Về chúng tôi, Hỏi đáp, So sánh, Trang chủ) **giữ nguyên**: chúng nói việc dịch cần mạng khi nào, không phải danh sách mọi kết nối (đợt báo cáo lỗi cũng giữ nguyên các câu này).
5. Ô "Dữ liệu cuộc hội thoại" ở Dữ liệu và bảo mật đổi thành "Dữ liệu cuộc họp" (năm ngôn ngữ), và câu "không có dữ liệu cuộc hội thoại" ở Trang chủ thành "không có nội dung cuộc họp", để không lẫn với cuộc trò chuyện ở chat hỗ trợ (cuộc chat có lưu trên máy chủ).
6. Callout "Giới hạn của phép đo" ở Dữ liệu và bảo mật ghi **chat hỗ trợ chưa được đo bằng proxy**. Khi A7 có chat được đo (spec mục 6), sửa câu đó (runbook bước 12 nhắc).
7. `website/README.md` thêm quy tắc chat và **ngoại lệ "không `pnpm deploy`"** từ lúc nội dung chat vào `main` tới bước deploy website của runbook (bỏ qua nếu kế hoạch 02 đã thêm).

**Ngày hiệu lực chính sách 1.5** = ngày phát hành app 0.2.4, đặt bằng lệnh ở Task 10, **trước khi nâng phiên bản và build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực"). Cho tới Task 10, dòng phiên bản của hai file chính sách vẫn là 1.4, 18/10/2026.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | A7 (§3.3); §10.1 (kết nối, mục "Chat hỗ trợ", dữ liệu server lưu, thời gian lưu, xóa theo email, chuyển ra nước ngoài); §15 |
| Modify `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md` | Mục 2, 4, 5, 6, 7 sửa; mục 11 mới; 12, 13 đổi số; dòng phiên bản lên 1.5 ở Task 10 |
| Modify `docs/legal/README.md` | Đoạn 1.5, thông tin đã chốt, bên xử lý, câu hỏi luật sư, đối chiếu, "Đã làm", quy tắc đổi ngày; ngày ở Task 10 |
| Modify `website/src/content/{vi,en,ja,zh,ko}/contact.mjs` | Bỏ "kênh duy nhất", "không có form"; thêm ô Chat; mô tả trang |
| Modify `website/src/content/{vi,en,ja,zh,ko}/data-security.mjs` | Mục "Chat hỗ trợ" mới; kết nối, máy chủ, bên xử lý, xóa dữ liệu, giới hạn phép đo |
| Modify `website/src/content/{vi,en,ja,zh,ko}/home.mjs`, `.../faq.mjs` | Câu "máy chủ chỉ lưu …" thêm chat |
| Modify `website/test/site.test.mjs` | Chính sách 13 mục; test mục 11; luật `STALE_SUPPORT`; test Liên hệ, Dữ liệu và bảo mật, Trang chủ và Hỏi đáp; test chặn "Zalo Bot"; nâng 1.4 → 1.5 ở Task 10 |
| Modify `website/README.md` | Quy tắc chat hỗ trợ; ngoại lệ deploy |
| Modify `docs/release/phat-hanh.md` | Mục 11: thay dòng giữ chỗ của kế hoạch 01 bằng bước 10–14, xóa theo yêu cầu, đường lui |

Kết quả `grep` thật (2026-10-22) của các câu phải bỏ, trên `website/src` và `docs/legal` ở năm ngôn ngữ, chỉ có ở trang Liên hệ (3 chỗ mỗi ngôn ngữ, 15 dòng):

```
website/src/content/vi/contact.mjs:50   lead: "… Đây là kênh hỗ trợ duy nhất: website này không có form liên hệ …"
website/src/content/vi/contact.mjs:56   ["Kênh khác", "Không có<small>Không có form trên web, không có điện thoại</small>"]
website/src/content/vi/contact.mjs:122  callout: "…; mọi liên hệ đi qua email ở trên."
website/src/content/en/contact.mjs:50   lead: "… It is our only support channel: this website has no contact form …"
website/src/content/en/contact.mjs:56   ["Other channels", "None<small>No web form, no phone</small>"]
website/src/content/en/contact.mjs:122  callout: "…; all contact goes through the email above."
website/src/content/ja/contact.mjs:49   lead: "…これが唯一のサポート窓口で、このウェブサイトにはお問い合わせフォームも…"
website/src/content/ja/contact.mjs:55   ["ほかの窓口", "なし<small>ウェブフォームも電話もありません</small>"]
website/src/content/ja/contact.mjs:121  callout: "…ご連絡はすべて上のメールアドレスでお受けしています。"
website/src/content/zh/contact.mjs:48   lead: "…这是我们唯一的支持渠道：本网站没有联系表单…"
website/src/content/zh/contact.mjs:54   ["其他渠道", "无<small>没有网页表单，没有电话</small>"]
website/src/content/zh/contact.mjs:120  callout: "…所有联系都通过上面的邮箱进行。"
website/src/content/ko/contact.mjs:49   lead: "…이것이 유일한 지원 창구이며, 이 웹사이트에는 문의 양식이 없고…"
website/src/content/ko/contact.mjs:55   ["다른 창구", "없음<small>웹 양식도 전화도 없습니다</small>"]
website/src/content/ko/contact.mjs:121  callout: "…모든 연락은 위 이메일로 받습니다."
```

Câu "máy chủ chỉ lưu …" (danh sách đóng, thành sai khi có chat): `website/src/content/{vi,en,ja,zh,ko}/home.mjs` (khối "Giảm rủi ro lộ thông tin", dòng 129–133) và `.../faq.mjs` dòng 109 (câu "Có quảng cáo hay thu thập dữ liệu không?"). EULA (`docs/legal/eula.{vi,en}.md`) không dẫn số mục nào của chính sách (đã `grep`), nên giữ nguyên. `src/lib/legal.ts` và `src/lib/legal.test.ts` không khóa phiên bản hay số mục: không sửa.

---

### Task 0: Mốc xuất phát và điều kiện

**Files:** không sửa file.

- [ ] **Step 1: Nhánh và cây làm việc**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short | head -10
```
Expected: `main`. Có thể có file của phiên khác đang làm (thư mục dùng chung); chỉ cần các file ở bảng "Cấu trúc file" không có thay đổi chưa commit. Có thì dừng và hỏi.

- [ ] **Step 2: Kế hoạch 01, 02, 03 đã xong**

Task 1, 2 và 7 không phụ thuộc mã, làm được ngay. Task 3–6 cần nhãn của app (kế hoạch 03) và bong bóng chat trên website (kế hoạch 02). Task 8 cần mục 11 của runbook (kế hoạch 01).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && ls -d server/src/support src-tauri/src/support; grep -c '^## 11\. Đợt thêm chat hỗ trợ' docs/release/phat-hanh.md; grep -c '<!-- kế hoạch 04: các bước app, website, bật chat và thử tay -->' docs/release/phat-hanh.md; grep -rln 'https://api.aitranslator.io.vn' website/src | head -3
```
Expected: hai thư mục được liệt kê; `1`; `1`; ít nhất một file trong `website/src` (CSP `connect-src` hay mã khung chat của kế hoạch 02; trang nội dung hiện chỉ ghi `api.aitranslator.io.vn` không có `https://`, nên không khớp). Thiếu cái nào thì làm các task không phụ thuộc nó trước và báo.

- [ ] **Step 3: Nhãn màn hình Hỗ trợ trong app**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && for l in vi en ja zh ko; do printf '%s: ' $l; grep -h '"nav\.support"' src/i18n/$l.ts || echo 'KHÔNG CÓ'; done
```
Expected (đúng thứ tự): `"nav.support": "Hỗ trợ",`, `"nav.support": "Support",`, `"nav.support": "サポート",`, `"nav.support": "客服",`, `"nav.support": "지원",`. Khác thì: tìm khóa đúng (`grep -n -i 'support\|hỗ trợ' src/i18n/en.ts | head`), rồi thay **trong file kế hoạch này** mọi dạng ở cột "Các dạng xuất hiện" của bảng "Nhãn trong app" bằng nhãn thật của app (kể cả needle của các test), trước khi làm Task 2–5.

- [ ] **Step 4: Mốc test website**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`. Mốc đo ngày 2026-10-22 trên `main` (trước kế hoạch 02): `ℹ tests 152`, `ℹ pass 150`, `ℹ fail 0`, `ℹ skipped 2` (hai test cần Chrome hay PowerShell bị bỏ qua tùy máy). Kế hoạch 02 thêm test nên số lúc làm sẽ lớn hơn: **ghi số `pass` thật làm N0**. Kế hoạch này thêm 7 test; sau Task 9 phải là `pass` = N0 + 7. Có `fail` trước khi sửa gì thì dừng và báo.

- [ ] **Step 5: Mốc test pháp lý của app**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Test Files|Tests '
```
Expected: `Test Files  2 passed (2)`, `Tests  19 passed (19)` (đo 2026-10-22). Toàn bộ `pnpm test` của app đo cùng ngày: `Tests  331 passed (331)` (trước kế hoạch 03). Kế hoạch này không sửa mã hay test của app.

- [ ] **Step 6: Đếm câu cũ (để so ở Task 9)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -rniE 'kênh hỗ trợ duy nhất|không có form|mọi liên hệ đi qua email ở trên|only support channel|no contact form|No web form|all contact goes through the email above|唯一のサポート窓口|ウェブフォーム|すべて上のメールアドレスで|唯一的支持渠道|没有网页表单|所有联系都通过上面的邮箱进行|유일한 지원 창구|웹 양식도|모든 연락은 위 이메일로' website/src docs/legal/privacy.vi.md docs/legal/privacy.en.md | wc -l
```
Expected: `15` (danh sách ở mục "Cấu trúc file"). Task 9 Step 1 phải ra `0`.

---

### Task 1: Spec gốc (A7, §10.1, §15)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

- [ ] **Step 1: A7 (§3.3): ngoại lệ chat, việc phải đo lại**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
kiểm tra cập nhật app và manifest model, và gửi báo cáo lỗi (§10.1; `POST /v1/diagnostics`, chỉ tới `api.aitranslator.io.vn`, chỉ khi app không đang dịch: báo cáo xếp hàng trên đĩa và gửi sau khi phiên dừng). Phải kiểm lại bằng proxy sau khi có tính năng báo cáo lỗi, kể cả lúc có báo cáo đang xếp hàng (spec 2026-10-17-diagnostics-reports-design §7). Không request nào chứa âm thanh hay nội dung chép lời. |
```
```new
kiểm tra cập nhật app và manifest model, gửi báo cáo lỗi (§10.1; `POST /v1/diagnostics`, chỉ tới `api.aitranslator.io.vn`, chỉ khi app không đang dịch: báo cáo xếp hàng trên đĩa và gửi sau khi phiên dừng), và gửi và nhận tin chat hỗ trợ (`/v1/support/*`, chỉ tới `api.aitranslator.io.vn`, chỉ khi người dùng đã dùng chat; trong lúc dịch chỉ khi màn hình Hỗ trợ đang mở hay người dùng bấm gửi; không request nào chứa âm thanh hay nội dung chép lời; spec 2026-10-22-chat-ho-tro-zalo-design §4, §5). Phải kiểm lại bằng proxy sau khi có tính năng báo cáo lỗi, kể cả lúc có báo cáo đang xếp hàng (spec 2026-10-17-diagnostics-reports-design §7), và sau khi có chat hỗ trợ: chưa dùng chat thì không có kết nối mới nào, dùng chat thì chỉ tới `api.`, đang dịch mà màn hình Hỗ trợ đóng thì không có request chat (spec 2026-10-22-chat-ho-tro-zalo-design §6). Không request nào chứa âm thanh hay nội dung chép lời. |
```

- [ ] **Step 2: §10.1: app còn kết nối cho chat**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
và người dùng cũng bấm gửi tay được ở màn hình Giới thiệu.
```
```new
và người dùng cũng bấm gửi tay được ở màn hình Giới thiệu. App còn gửi và nhận tin **chat hỗ trợ** qua `/v1/support/*` của license server (cùng host `api.`, không thêm host nào; mục "Chat hỗ trợ" ngay dưới), chỉ khi người dùng đã dùng chat; trong lúc dịch chỉ khi màn hình Hỗ trợ đang mở hay người dùng bấm gửi.
```

- [ ] **Step 3: §10.1: mục "Chat hỗ trợ"**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy
```
```new
- **Chat hỗ trợ** (spec `2026-10-22-chat-ho-tro-zalo-design.md`): khách chat trên website (bong bóng ở mọi trang) và trong app (màn hình Hỗ trợ). Worker `mt-license` lưu cuộc chat ở D1 (`support_conversations`, `support_messages`, `support_settings`; migration 0005), chuyển tin sang Zalo cá nhân của chủ dự án qua Zalo Bot, và nhận câu trả lời qua webhook `POST /v1/webhooks/zalo`.
  - **Lưu:** nội dung tin, nguồn (`web`, `app`, `app-debug`), ngôn ngữ, trang (chỉ path, web), dòng thông tin máy (app, chỉ khi khách để tích; không bao giờ có key, email của license, mã máy, tên máy hay tên người dùng), email khách tự để lại, mã băm SHA-256 của token (không lưu token gốc). IP chỉ ở dạng HMAC trong `rate_limits`, không lưu cùng cuộc chat.
  - **Gửi sang Zalo:** nội dung tin, mã cuộc chat, nguồn, ngôn ngữ, trang, dòng thông tin máy, thông báo "khách đã để lại email" (không kèm địa chỉ) hay "khách đã xóa cuộc chat". **Email của khách không bao giờ tới Zalo.** Zalo (Công ty Cổ phần VNG) đặt máy chủ ở Việt Nam. Thư trả lời gửi qua Resend khi khách để lại email.
  - **Giữ:** tự xóa 90 ngày sau tin cuối (cron); khách tự xóa bằng nút trong khung chat. Đây là ngoại lệ của "giữ không thời hạn" ở dưới. Bản đã chuyển vào Zalo không tự xóa: người vận hành xóa tay khi khách yêu cầu.
  - Chính sách quyền riêng tư (mục 11) và website nói đúng những điều trên; trang thường của website không nêu tên Zalo (chỉ chính sách nêu bên xử lý).
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy
```

- [ ] **Step 4: §10.1: server lưu gì, thời gian lưu, xóa theo email, chuyển ra nước ngoài**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ) và thời điểm kiểm tra bản quyền gần nhất.
```
```new
tên máy (`device_label`, để người dùng nhận ra máy khi cần gỡ), thời điểm kiểm tra bản quyền gần nhất, và cuộc chat hỗ trợ khi khách dùng chat (mục "Chat hỗ trợ" ở trên; tự xóa sau 90 ngày).
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
  - **Thời gian lưu (chốt 2026-10-01): dữ liệu cá nhân được giữ không thời hạn**, không bao giờ tự xóa:
```
```new
  - **Thời gian lưu (chốt 2026-10-01): dữ liệu cá nhân được giữ không thời hạn**, không bao giờ tự xóa (ngoại lệ: báo cáo lỗi giữ 30 ngày và cuộc chat hỗ trợ giữ 90 ngày kể từ tin cuối, ở mục "Báo cáo lỗi" và "Chat hỗ trợ" ở trên):
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
      - **xóa** các báo cáo lỗi (bảng `error_reports` và `error_report_logs`) của các máy từng kích hoạt license của email đó;
```
```new
      - **xóa** các báo cáo lỗi (bảng `error_reports` và `error_report_logs`) của các máy từng kích hoạt license của email đó;
      - **xóa** các cuộc chat hỗ trợ có email đó (`support_conversations` và tin của chúng; bằng lệnh D1 ở `docs/release/phat-hanh.md` mục 11, vì Web Admin chưa có thao tác này), và xóa tay các tin tương ứng trong cuộc trò chuyện Zalo của người vận hành;
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
      - log thư do Resend lưu (địa chỉ nhận và nội dung thư, có key)
```
```new
      - cuộc chat hỗ trợ không để lại email (không tìm theo email được): tự xóa sau 90 ngày kể từ tin cuối, hay khách tự xóa bằng nút trong khung chat;
      - log thư do Resend lưu (địa chỉ nhận và nội dung thư, có key)
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
Việc này phụ thuộc loại hình đăng ký kinh doanh (§15), cần hỏi luật sư.
```
```new
Việc này phụ thuộc loại hình đăng ký kinh doanh (§15), cần hỏi luật sư. Zalo (bên chuyển tin chat hỗ trợ, Công ty Cổ phần VNG) đặt máy chủ ở Việt Nam nên không thêm việc chuyển ra nước ngoài; thư trả lời chat đi qua Resend như thư chứa key.
```

- [ ] **Step 5: §15: câu hỏi cho luật sư**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`
```old
  - thủ tục thông báo website bán hàng với Bộ Công Thương.
```
```new
  - chat hỗ trợ (§10.1, "Chat hỗ trợ"): Zalo (VNG) là bên xử lý hay bên kiểm soát độc lập với nội dung chat, có cần thỏa thuận xử lý dữ liệu; bản sao trong Zalo không tự xóa theo 90 ngày; cơ sở xử lý khi khách chủ động gửi tin không qua ô đồng ý riêng, ô thông tin máy tích sẵn; khách trên website chưa từng đồng ý chính sách;
  - thủ tục thông báo website bán hàng với Bộ Công Thương.
```

- [ ] **Step 6: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && grep -c 'v1/support' $S; grep -c 'Chat hỗ trợ' $S; grep -n '^| A7 ' $S | grep -c 'chat hỗ trợ'
```
Expected: `2` (A7 và dòng "App chỉ kết nối mạng để" của §10.1), `5` (số dòng có chuỗi viết hoa "Chat hỗ trợ": dòng "App chỉ kết nối mạng để", mục "Chat hỗ trợ", dòng "License server chỉ lưu", dòng "Thời gian lưu", câu hỏi §15), `1`. Lệch số thì đọc lại các bước trên, đừng sửa số.

- [ ] **Step 7: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): spec gốc theo chat hỗ trợ (A7, §10.1, §15)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chính sách quyền riêng tư (nội dung; dòng phiên bản vẫn 1.4)

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`
- Test: `website/test/site.test.mjs`

Cấu trúc hai bản vi và en phải **giống nhau** từng mục (số gạch đầu dòng, số hàng bảng, số đoạn): test `văn bản pháp lý … cùng cấu trúc` kiểm điều đó. Đừng thêm gạch đầu dòng, hàng hay đoạn ở bản này mà thiếu ở bản kia.

- [ ] **Step 1: Sửa test hiện có: chính sách có 13 mục; "Thay đổi chính sách" và "Liên hệ" là mục 12, 13**

Tệp: `website/test/site.test.mjs`
```old
  for (const [name, count] of [["eula", 16], ["privacy", 12]]) {
```
```new
  for (const [name, count] of [["eula", 16], ["privacy", 13]]) {
```

Tệp: `website/test/site.test.mjs`
```old
        11: ["Thay đổi chính sách"],
        12: ["Liên hệ"],
```
```new
        12: ["Thay đổi chính sách"],
        13: ["Liên hệ"],
```

Tệp: `website/test/site.test.mjs`
```old
        11: ["Changes to this policy"],
        12: ["Contact"],
```
```new
        12: ["Changes to this policy"],
        13: ["Contact"],
```

- [ ] **Step 2: Thêm test mục 11 và các mục nhắc chat (cuối file)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

// ---- Chat hỗ trợ (spec 2026-10-22-chat-ho-tro-zalo-design §5): chính sách 1.5, trang Liên hệ, Dữ liệu và bảo mật, không lộ kênh nội bộ ----

test("chính sách quyền riêng tư: mục 11 Chat hỗ trợ (lưu gì, email không sang Zalo, IP chỉ băm, nhịp kết nối, 90 ngày, bản sao trong Zalo), các mục 2, 4, 5, 6, 7 nhắc chat, Zalo là bên xử lý", () => {
  const errors = [
    ...sectionErrors("/chinh-sach-quyen-rieng-tu/", {
      2: ["chat hỗ trợ", "tự xóa sau 90 ngày kể từ tin cuối", "tin nhắn chat hỗ trợ (giữ 90 ngày)"],
      4: ["Khi bạn dùng chat hỗ trợ", "chưa từng dùng chat thì không có kết nối nào cho chat", "Trong lúc dịch, ứng dụng chỉ gửi hay nhận tin chat khi màn hình Hỗ trợ đang mở hoặc khi bạn bấm gửi"],
      5: ["Chat hỗ trợ (mục 11)", "không lưu địa chỉ IP cùng cuộc chat", "trừ email bạn tự để lại trong chat"],
      6: ["Công ty Cổ phần VNG", "máy chủ ở Việt Nam", "Không có email của bạn", "mục 5, mục 10 và mục 11"],
      7: ["cuộc chat hỗ trợ (tự xóa sau 90 ngày kể từ tin cuối, mục 11)", "xóa các cuộc chat hỗ trợ mà bạn đã để lại email đó"],
      11: [
        "Chat hỗ trợ",
        "Bạn không cần có Zalo",
        "Email của bạn không bao giờ được gửi sang Zalo",
        "Không lưu cùng cuộc chat",
        "Không bao giờ có license key, email, mã máy, tên máy",
        "localStorage",
        "24 giờ qua",
        "tự xóa sau 90 ngày",
        "Bản sao các tin đã chuyển sang Zalo",
      ],
      12: ["Thay đổi chính sách"],
      13: ["Liên hệ"],
    }),
    ...sectionErrors("/en/privacy/", {
      2: ["support chat", "deleted automatically 90 days after the last message", "support chat messages (kept for 90 days)"],
      4: ["When you use the support chat", "if you have never used the chat, the app makes no connection for it", "While translating, the app sends or receives chat messages only when the Support screen is open or when you press send"],
      5: ["Support chat (section 11)", "no IP address is stored with the chat", "except one you choose to leave in the chat"],
      6: ["VNG Corporation", "servers in Vietnam", "Not your email", "sections 5, 10 and 11"],
      7: ["the support chat (deleted 90 days after the last message, section 11)", "delete the support chats in which you left that email"],
      11: [
        "Support chat",
        "You do not need Zalo",
        "Your email is never sent to Zalo",
        "Not stored with the chat",
        "never contains a license key, email, machine ID, computer name",
        "localStorage",
        "last 24 hours",
        "deleted automatically 90 days",
        "Copies of the messages forwarded to Zalo",
      ],
      12: ["Changes to this policy"],
      13: ["Contact"],
    }),
  ];
  // Dữ liệu gửi Zalo (hàng "Gửi sang Zalo" của mục 11, hàng Zalo của mục 6): có câu phủ định về email, và ngoài câu đó cùng cụm
  // "đã để lại email" (thông báo không kèm địa chỉ) thì không còn chữ "email" nào (spec §2.3: email không bao giờ tới Zalo).
  for (const [urlPath, row11, row6, not11, not6, notice] of [
    ["/chinh-sach-quyen-rieng-tu/", "Gửi sang Zalo", "Zalo (", "không kèm địa chỉ email", "Không có email của bạn", "để lại email"],
    ["/en/privacy/", "Sent to Zalo", "Zalo (", "without the email address", "Not your email", "left an email"],
  ]) {
    const sections = legalSections(urlPath);
    for (const [where, row, ok] of [
      [`mục 11, hàng "${row11}"`, rowText(sections.get("11")?.html, row11), not11],
      [`mục 6, hàng "${row6}"`, rowText(sections.get("6")?.html, row6), not6],
    ]) {
      if (!row.includes(ok)) errors.push(`${urlPath} ${where}: thiếu "${ok}" (hàng: ${row || "không có"})`);
      else if (/email/i.test(row.replace(ok, "").replaceAll(notice, ""))) errors.push(`${urlPath} ${where}: dữ liệu gửi Zalo nhắc email ngoài câu phủ định`);
    }
  }
  assert.deepEqual(errors, []);
});
EOF
```

- [ ] **Step 3: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'mục 11 Chat hỗ trợ|văn bản pháp lý \(điều khoản|mục 10 Báo cáo lỗi' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)|privacy.vi.md: 12 mục|không thấy mục 13'
```
Expected: `ℹ tests 3`, `ℹ pass 0`, `ℹ fail 3`; có dòng `privacy.vi.md: 12 mục (giữ 13 mục)` và dòng `không thấy mục 13`.

- [ ] **Step 4: Tiếng Việt, mục 2 (Tóm tắt)**

Tệp: `docs/legal/privacy.vi.md`
```old
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license, mã nhận diện máy đã băm và báo cáo lỗi (giữ 30 ngày), để cấp key, kiểm tra bản quyền, bảo đảm mỗi máy chỉ dùng thử gói Free một lần và sửa lỗi.
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7), trừ báo cáo lỗi tự xóa sau 30 ngày (mục 10).
```
```new
- Nếu bạn nhắn ở **chat hỗ trợ** (trên website hay trong ứng dụng), tin nhắn được lưu trên máy chủ của chúng tôi, chuyển tới tài khoản Zalo của người vận hành để trả lời, và **tự xóa sau 90 ngày** kể từ tin cuối; bạn tự xóa được sớm hơn (mục 11).
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói, hoặc khi bạn tự để lại trong chat hỗ trợ), thông tin đơn hàng, license, mã nhận diện máy đã băm, báo cáo lỗi (giữ 30 ngày) và tin nhắn chat hỗ trợ (giữ 90 ngày), để cấp key, kiểm tra bản quyền, bảo đảm mỗi máy chỉ dùng thử gói Free một lần, sửa lỗi và trả lời bạn.
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7), trừ báo cáo lỗi tự xóa sau 30 ngày (mục 10) và tin nhắn chat hỗ trợ tự xóa sau 90 ngày kể từ tin cuối (mục 11).
```

- [ ] **Step 5: Tiếng Việt, mục 4 (kết nối mạng) và mục 5 (dữ liệu trên máy chủ)**

Tệp: `docs/legal/privacy.vi.md`
```old
Việc hỏi giờ không gửi dữ liệu gì của bạn.
```
```new
Việc hỏi giờ không gửi dữ liệu gì của bạn. Khi bạn dùng **chat hỗ trợ**, ứng dụng cũng gửi và nhận tin chat qua máy chủ này (mục 11): chỉ khi màn hình Hỗ trợ đang mở, hoặc khi bạn đang chờ câu trả lời cho tin đã gửi trong 24 giờ qua và ứng dụng không đang dịch; chưa từng dùng chat thì không có kết nối nào cho chat. Trong lúc dịch, ứng dụng chỉ gửi hay nhận tin chat khi màn hình Hỗ trợ đang mở hoặc khi bạn bấm gửi.
```

Tệp: `docs/legal/privacy.vi.md`
```old
trừ dòng "Báo cáo lỗi", áp cho mọi máy mà ứng dụng gửi báo cáo:
```
```new
trừ dòng "Báo cáo lỗi", áp cho mọi máy mà ứng dụng gửi báo cáo, và dòng "Chat hỗ trợ", áp cho mọi người đã nhắn ở chat hỗ trợ trên website hay trong ứng dụng:
```

Tệp: `docs/legal/privacy.vi.md`
```old
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
| Báo cáo lỗi (mục 10): loại và mã lỗi, thông tin máy, **mã băm** của ID máy và phần log liên quan; không có email, tên máy hay nội dung cuộc họp | Tìm và sửa lỗi; tự xóa sau 30 ngày |
```
```new
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email, cuộc chat; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
| Báo cáo lỗi (mục 10): loại và mã lỗi, thông tin máy, **mã băm** của ID máy và phần log liên quan; không có email, tên máy hay nội dung cuộc họp | Tìm và sửa lỗi; tự xóa sau 30 ngày |
| Chat hỗ trợ (mục 11): nội dung tin của bạn và câu trả lời, thời điểm, nguồn (website hay ứng dụng), ngôn ngữ, trang bạn đang xem lúc mở chat (website), dòng thông tin máy nếu bạn để tích (ứng dụng), email nếu bạn tự để lại, **mã băm** của mã bí mật của cuộc chat; không lưu địa chỉ IP cùng cuộc chat | Trả lời bạn, và gửi câu trả lời qua email nếu bạn để lại email; tự xóa sau 90 ngày kể từ tin cuối |
```

Tệp: `docs/legal/privacy.vi.md`
```old
Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên và, nếu ứng dụng gửi báo cáo lỗi, các báo cáo đó: không có email, tên máy hay thông tin nào khác của bạn.
```
```new
Dùng gói Free mà không mua và không kích hoạt key thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên, các báo cáo lỗi nếu ứng dụng gửi, và cuộc chat hỗ trợ nếu bạn nhắn: không có email (trừ email bạn tự để lại trong chat), tên máy hay thông tin nào khác của bạn.
```

- [ ] **Step 6: Tiếng Việt, mục 6 (bên xử lý) và mục 7 (thời gian lưu, quyền)**

Tệp: `docs/legal/privacy.vi.md`
```old
| **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5, kể cả báo cáo lỗi (mục 10); nhật ký kỹ thuật tự hết hạn |
| **Resend** | Gửi email chứa key | Email bạn, nội dung thư (có key); theo chính sách lưu của Resend |

Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia, nên dữ liệu ở mục 5 và mục 10 có thể được xử lý ở nước ngoài. Bằng việc mua gói và đồng ý xử lý email, bạn đồng ý với việc này.
```
```new
| **Cloudflare** | Máy chủ chạy license server, cơ sở dữ liệu, lưu trữ và phân phối bản cập nhật, model | Dữ liệu ở mục 5, kể cả báo cáo lỗi (mục 10) và chat hỗ trợ (mục 11); nhật ký kỹ thuật tự hết hạn |
| **Resend** | Gửi email chứa key, và email chứa câu trả lời chat hỗ trợ khi bạn để lại email | Email bạn, nội dung thư (có key, hay câu trả lời chat); theo chính sách lưu của Resend |
| **Zalo** (Công ty Cổ phần VNG, Việt Nam; máy chủ ở Việt Nam) | Chuyển tin nhắn chat hỗ trợ của bạn tới tài khoản Zalo của người vận hành, và chuyển câu trả lời của người vận hành về máy chủ của chúng tôi | Nội dung tin, mã cuộc chat (3 ký tự), nguồn (website hay ứng dụng), ngôn ngữ, trang bạn đang xem (website), dòng thông tin máy nếu bạn để tích (ứng dụng), và thông báo bạn đã để lại email hay đã xóa cuộc chat. **Không có email của bạn** và không có địa chỉ IP của bạn. Zalo xử lý các dữ liệu đó theo điều khoản và chính sách riêng của Zalo |

Cloudflare và Resend đặt máy chủ ngoài Việt Nam, còn Creem là pháp nhân Estonia, nên dữ liệu ở mục 5, mục 10 và mục 11 có thể được xử lý ở nước ngoài; Zalo đặt máy chủ ở Việt Nam. Bằng việc mua gói và đồng ý xử lý email, hoặc gửi tin ở chat hỗ trợ, bạn đồng ý với việc này.
```

Tệp: `docs/legal/privacy.vi.md`
```old
**Dữ liệu cá nhân trên máy chủ được giữ cho tới khi bạn yêu cầu xóa.** Chúng tôi không tự xóa.
```
```new
**Dữ liệu cá nhân trên máy chủ được giữ cho tới khi bạn yêu cầu xóa.** Chúng tôi không tự xóa, trừ báo cáo lỗi (tự xóa sau 30 ngày, mục 10) và cuộc chat hỗ trợ (tự xóa sau 90 ngày kể từ tin cuối, mục 11).
```

Tệp: `docs/legal/privacy.vi.md`
```old
từ email đã dùng khi mua (để chúng tôi xác nhận là bạn).
```
```new
từ email đã dùng khi mua, hay email bạn đã để lại trong chat hỗ trợ (để chúng tôi xác nhận là bạn).
```

Tệp: `docs/legal/privacy.vi.md`
```old
- **xóa** các báo cáo lỗi của những máy từng kích hoạt key của email đó (mục 10);
```
```new
- **xóa** các báo cáo lỗi của những máy từng kích hoạt key của email đó (mục 10);
- **xóa** các cuộc chat hỗ trợ mà bạn đã để lại email đó, cả trên máy chủ của chúng tôi lẫn bản đã chuyển vào cuộc trò chuyện Zalo của người vận hành (mục 11);
```

Tệp: `docs/legal/privacy.vi.md`
```old
Báo cáo lỗi của một máy chưa từng kích hoạt key không gắn với email nào nên không tìm theo email được; những báo cáo đó tự xóa sau 30 ngày.
```
```new
Báo cáo lỗi của một máy chưa từng kích hoạt key không gắn với email nào nên không tìm theo email được; những báo cáo đó tự xóa sau 30 ngày. Cuộc chat hỗ trợ không để lại email thì cũng không tìm theo email được: hãy tự xóa bằng nút trong khung chat, hoặc gửi yêu cầu kèm thời điểm và nội dung gần đúng của tin nhắn để chúng tôi tìm; nếu không, cuộc chat tự xóa sau 90 ngày kể từ tin cuối (bản đã chuyển vào Zalo chỉ được xóa khi bạn yêu cầu).
```

- [ ] **Step 7: Tiếng Việt, mục 11 mới; mục 12, 13 đổi số**

Tệp: `docs/legal/privacy.vi.md`
```old
## 12. Liên hệ
```
```new
## 13. Liên hệ
```

Tệp: `docs/legal/privacy.vi.md`
```old
## 11. Thay đổi chính sách
```
```new
## 11. Chat hỗ trợ

Bạn có thể nhắn cho chúng tôi ở **chat hỗ trợ**: nút chat ở góc mỗi trang của website `aitranslator.io.vn`, hoặc màn hình **Hỗ trợ** trong ứng dụng. Không cần tài khoản, và mọi người dùng đều chat được, kể cả gói Free. Người trả lời là người vận hành ứng dụng, không phải bot. Tin của bạn đi qua máy chủ của chúng tôi (`api.aitranslator.io.vn`) tới tài khoản Zalo của người vận hành; người vận hành trả lời trong Zalo và câu trả lời hiện trong khung chat của bạn. Bạn không cần có Zalo.

| Nội dung | Chi tiết |
|---|---|
| Máy chủ lưu gì | Nội dung các tin của bạn và câu trả lời, thời điểm các tin; nguồn (website hay ứng dụng) và ngôn ngữ; trang bạn đang xem lúc mở chat (chỉ trên website, chỉ đường dẫn của trang); dòng thông tin máy nếu bạn để tích (chỉ trong ứng dụng); email nếu bạn tự để lại; **mã băm** của mã bí mật của cuộc chat (máy chủ không lưu mã gốc) |
| Email | Không bắt buộc. Nếu bạn để lại, chúng tôi chỉ dùng nó để gửi câu trả lời qua email (qua Resend, mục 6) khi bạn không mở khung chat, và bạn trả lời được bằng chính thư đó. Bạn bỏ email được bất cứ lúc nào trong khung chat. Email của bạn **không bao giờ được gửi sang Zalo** |
| Thông tin máy (ứng dụng) | Ô gửi kèm thông tin máy được tích sẵn, bỏ tích được, chỉ hiện trước tin đầu tiên và chỉ đi kèm tin đầu tiên. Ứng dụng hiện nguyên văn dòng này trước khi gửi: phiên bản ứng dụng, hệ điều hành và phiên bản, chip hoặc CPU, RAM, card đồ họa (Windows), tên gói bản quyền, gói model, ngôn ngữ giao diện. **Không bao giờ** có license key, email, mã máy, tên máy hay tên tài khoản hệ điều hành |
| Địa chỉ IP | Không lưu cùng cuộc chat. IP chỉ dùng để giới hạn tần suất; bộ đếm trên máy chủ chỉ lưu giá trị băm của IP (mục 5) |
| Gửi sang Zalo | Nội dung tin, mã cuộc chat (3 ký tự), nguồn, ngôn ngữ, trang (website), dòng thông tin máy nếu bạn để tích (ứng dụng), và thông báo bạn đã để lại email hay đã xóa cuộc chat (không kèm địa chỉ email). Câu trả lời của người vận hành đi từ Zalo về máy chủ của chúng tôi |
| Trên máy hay trình duyệt của bạn | Mã bí mật của cuộc chat và vị trí tin đã đọc: trên website, lưu trong bộ nhớ của trình duyệt (`localStorage`); trong ứng dụng, lưu trong một file ở thư mục dữ liệu của ứng dụng. Ai có mã này thì mở được cuộc chat. Xóa cuộc trò chuyện thì mã này cũng bị xóa |
| Khi nào có kết nối | Website: trình duyệt hỏi tin mới khi khung chat đang mở, hoặc khi bạn đang chờ câu trả lời cho tin đã gửi trong 24 giờ qua. Ứng dụng: như mục 4. Chưa từng dùng chat thì không có kết nối nào cho chat |
| Giữ bao lâu | Cuộc chat và mọi tin **tự xóa sau 90 ngày** kể từ tin cuối cùng. Bạn xóa ngay được bằng nút xóa cuộc trò chuyện trong khung chat |
| Ai xem được | Chỉ người vận hành ứng dụng, đọc và trả lời trong Zalo. Dữ liệu nằm trên Cloudflare và Zalo (mục 6) |

- Việc tự xóa sau 90 ngày và nút xóa chỉ xóa dữ liệu trên máy chủ của chúng tôi (nút xóa còn xóa mã trên máy bạn). Bản sao các tin đã chuyển sang Zalo vẫn nằm trong cuộc trò chuyện Zalo của người vận hành, và trên hệ thống của Zalo theo chính sách của Zalo, cho tới khi người vận hành xóa; muốn xóa cả bản đó, hãy yêu cầu theo mục 7. Thư trả lời đã gửi tới email của bạn thì nằm trong hộp thư của bạn và nhật ký thư của Resend.
- Chúng tôi dùng chat chỉ để trả lời bạn; không dùng cho quảng cáo, không bán và không chia sẻ cho bên nào ngoài các bên xử lý ở mục 6.
- Nếu trong ứng dụng bạn chọn đính kèm log, ứng dụng gửi một báo cáo lỗi như nút **Gửi log cho hỗ trợ** (mục 10) rồi gửi mã báo cáo vào cuộc chat.
- Đừng gửi mật khẩu, số thẻ hay số tài khoản ngân hàng qua chat; chúng tôi không cần những thông tin đó. Chat có thể tạm tắt; khi đó khung chat hiện địa chỉ support@aitranslator.io.vn.

## 12. Thay đổi chính sách
```

- [ ] **Step 8: Tiếng Anh, mục 2**

Tệp: `docs/legal/privacy.en.md`
```old
- Our servers only store your **email** (when you buy a plan), order details, your license, a hashed machine identifier and error reports (kept for 30 days), in order to issue keys, check licenses, make sure each machine gets the Free trial only once, and fix bugs.
- Personal data on our servers is **kept until you ask us to delete it** (section 7), except error reports, which are deleted automatically after 30 days (section 10).
```
```new
- If you write to us in the **support chat** (on the website or in the app), your messages are stored on our server, forwarded to the operator's Zalo account so they can reply, and **deleted automatically 90 days** after the last message; you can delete them sooner yourself (section 11).
- Our servers only store your **email** (when you buy a plan, or when you choose to leave it in the support chat), order details, your license, a hashed machine identifier, error reports (kept for 30 days) and support chat messages (kept for 90 days), in order to issue keys, check licenses, make sure each machine gets the Free trial only once, fix bugs and reply to you.
- Personal data on our servers is **kept until you ask us to delete it** (section 7), except error reports, which are deleted automatically after 30 days (section 10), and support chat messages, which are deleted automatically 90 days after the last message (section 11).
```

- [ ] **Step 9: Tiếng Anh, mục 4 và mục 5**

Tệp: `docs/legal/privacy.en.md`
```old
Asking for the time sends none of your data.
```
```new
Asking for the time sends none of your data. When you use the **support chat**, the app also sends and receives chat messages through this server (section 11): only while the Support screen is open, or while you are waiting for a reply to a message you sent in the last 24 hours and the app is not translating; if you have never used the chat, the app makes no connection for it. While translating, the app sends or receives chat messages only when the Support screen is open or when you press send.
```

Tệp: `docs/legal/privacy.en.md`
```old
except the "Error reports" row, which applies to every machine whose app sends a report:
```
```new
except the "Error reports" row, which applies to every machine whose app sends a report, and the "Support chat" row, which applies to everyone who writes in the support chat on the website or in the app:
```

Tệp: `docs/legal/privacy.en.md`
```old
| Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |
| Error reports (section 10): error type and code, machine details, a **hash** of the machine ID and the relevant part of the log; no email, computer name or meeting content | Find and fix bugs; deleted automatically after 30 days |
```
```new
| Rate-limit counters (only HMAC hashes of IP, key, email, chat conversation; expire after about 3 hours) | Block key guessing and spam |
| Error reports (section 10): error type and code, machine details, a **hash** of the machine ID and the relevant part of the log; no email, computer name or meeting content | Find and fix bugs; deleted automatically after 30 days |
| Support chat (section 11): the text of your messages and our replies, their times, the source (website or app), the language, the page you were on when you opened the chat (website), the machine details line if you left it ticked (app), your email if you chose to leave it, a **hash** of the chat's secret code; no IP address is stored with the chat | Reply to you, and email you our reply if you left an email; deleted automatically 90 days after the last message |
```

Tệp: `docs/legal/privacy.en.md`
```old
we store only the "Free trial" row above and, if the app sends error reports, those reports: no email, computer name or any other information about you.
```
```new
we store only the "Free trial" row above, error reports if the app sends any, and your support chat if you write in it: no email (except one you choose to leave in the chat), computer name or any other information about you.
```

- [ ] **Step 10: Tiếng Anh, mục 6 và mục 7**

Tệp: `docs/legal/privacy.en.md`
```old
| **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5, including error reports (section 10); technical logs that expire on their own |
| **Resend** | Sends the email containing your key | Your email and the message (including the key); retention per Resend's own policy |

Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company, so the data in sections 5 and 10 may be processed abroad. By buying a plan and consenting to email processing you agree to this.
```
```new
| **Cloudflare** | Hosts the license server, database, and the storage and delivery of updates and models | The data in section 5, including error reports (section 10) and the support chat (section 11); technical logs that expire on their own |
| **Resend** | Sends the email containing your key, and the email containing our support chat reply when you left an email | Your email and the message (including the key, or our chat reply); retention per Resend's own policy |
| **Zalo** (VNG Corporation, Vietnam; servers in Vietnam) | Carries your support chat messages to the operator's Zalo account and carries the operator's replies back to our server | The message text, the chat code (3 characters), the source (website or app), the language, the page you were on (website), the machine details line if you left it ticked (app), and notices that you left an email or deleted the chat. **Not your email** and not your IP address. Zalo processes this data under its own terms and policy |

Cloudflare and Resend operate servers outside Vietnam and Creem is an Estonian company, so the data in sections 5, 10 and 11 may be processed abroad; Zalo's servers are in Vietnam. By buying a plan and consenting to email processing, or by sending a message in the support chat, you agree to this.
```

Tệp: `docs/legal/privacy.en.md`
```old
**Personal data on our servers is kept until you ask us to delete it.** We do not delete it automatically.
```
```new
**Personal data on our servers is kept until you ask us to delete it.** We do not delete it automatically, except error reports (deleted after 30 days, section 10) and the support chat (deleted 90 days after the last message, section 11).
```

Tệp: `docs/legal/privacy.en.md`
```old
from the email you used when buying (so we can confirm it is you).
```
```new
from the email you used when buying, or the email you left in the support chat (so we can confirm it is you).
```

Tệp: `docs/legal/privacy.en.md`
```old
- **delete** the error reports of the machines that ever activated a key for that email (section 10);
```
```new
- **delete** the error reports of the machines that ever activated a key for that email (section 10);
- **delete** the support chats in which you left that email, both on our server and the copies forwarded into the operator's Zalo conversation (section 11);
```

Tệp: `docs/legal/privacy.en.md`
```old
Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days.
```
```new
Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days. A support chat in which you left no email cannot be found by email either: delete it yourself with the button in the chat, or send a request with the approximate time and content of your messages so we can find it; otherwise it is deleted automatically 90 days after the last message (the copy forwarded into Zalo is deleted only when you ask).
```

- [ ] **Step 11: Tiếng Anh, mục 11 mới; mục 12, 13 đổi số**

Tệp: `docs/legal/privacy.en.md`
```old
## 12. Contact
```
```new
## 13. Contact
```

Tệp: `docs/legal/privacy.en.md`
```old
## 11. Changes to this policy
```
```new
## 11. Support chat

You can write to us in the **support chat**: the chat button in the corner of every page of the `aitranslator.io.vn` website, or the **Support** screen in the app. No account is needed, and everyone can use it, including on the Free plan. Replies come from the operator of the app, not from a bot. Your messages go through our server (`api.aitranslator.io.vn`) to the operator's Zalo account; the operator replies in Zalo and the reply appears in your chat. You do not need Zalo.

| What | Details |
|---|---|
| What our server stores | The text of your messages and our replies and their times; the source (website or app) and the language; the page you were on when you opened the chat (website only, just the page path); the machine details line if you left it ticked (app only); your email if you chose to leave it; a **hash** of the chat's secret code (the server does not store the code itself) |
| Email | Optional. If you leave it, we use it only to email you our reply (through Resend, section 6) when you do not have the chat open, and you can reply to that email. You can remove your email in the chat at any time. Your email is **never sent to Zalo** |
| Machine details (app) | The box to include machine details is ticked by default, can be unticked, is shown only before your first message and is sent only with your first message. The app shows the exact line before sending: app version, operating system and its version, chip or CPU, RAM, graphics card (Windows), license plan name, model pack, interface language. It **never** contains a license key, email, machine ID, computer name or operating-system user name |
| IP address | Not stored with the chat. Your IP is used only for rate limiting; the counters on our server store only a hash of the IP (section 5) |
| Sent to Zalo | The message text, the chat code (3 characters), the source, the language, the page (website), the machine details line if you left it ticked (app), and notices that you left an email or deleted the chat (without the email address). The operator's replies travel from Zalo back to our server |
| On your computer or browser | The chat's secret code and how far you have read: on the website, in your browser's storage (`localStorage`); in the app, in a file in the app's data folder. Anyone with this code can open the chat. Deleting the conversation also deletes the code |
| When it connects | Website: the browser checks for new messages while the chat is open, or while you are waiting for a reply to a message you sent in the last 24 hours. App: as in section 4. If you have never used the chat, nothing connects for it |
| How long it is kept | The chat and all its messages are **deleted automatically 90 days** after the last message. You can delete it right away with the delete-conversation button in the chat |
| Who can see it | Only the operator of the app, who reads and replies in Zalo. The data is held on Cloudflare and Zalo (section 6) |

- The 90-day deletion and the delete button remove only the data on our server (the delete button also removes the code on your computer). Copies of the messages forwarded to Zalo stay in the operator's Zalo conversation, and on Zalo's systems under Zalo's policy, until the operator deletes them; to have those deleted too, ask under section 7. Reply emails we sent you stay in your mailbox and in Resend's mail logs.
- We use the chat only to reply to you; we do not use it for advertising, sell it or share it with anyone other than the processors in section 6.
- If you choose to attach logs in the app's chat, the app sends an error report like the **Send log to support** button (section 10) and then posts the report code in the chat.
- Do not send passwords, card numbers or bank account numbers in the chat; we do not need them. The chat may be turned off temporarily; the chat then shows the address support@aitranslator.io.vn.

## 12. Changes to this policy
```

- [ ] **Step 12: Kiểm cấu trúc vi và en giống nhau**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && node -e '
const fs = require("fs");
const skeleton = (md) => md.split(/^## /m).slice(1).map((sec) => {
  const lines = sec.split("\n").slice(1).filter((l) => l.trim() !== "");
  return { section: /^(\d+)\./.exec(sec)?.[1], items: lines.filter((l) => /^(- |\d+\. )/.test(l)).length, rows: lines.filter((l) => l.startsWith("|")).length, paragraphs: lines.filter((l) => !/^(- |\d+\. |\||#)/.test(l)).length };
});
const vi = skeleton(fs.readFileSync("docs/legal/privacy.vi.md", "utf8"));
const en = skeleton(fs.readFileSync("docs/legal/privacy.en.md", "utf8"));
console.log("mục:", vi.length, en.length, "giống nhau:", JSON.stringify(vi) === JSON.stringify(en));
console.log(JSON.stringify(vi.find((s) => s.section === "11")));
'
```
Expected: `mục: 13 13 giống nhau: true` và `{"section":"11","items":4,"rows":11,"paragraphs":1}`.

- [ ] **Step 13: Chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 1. Test mới đỏ ở một cụm thì đọc dòng `thiếu "…"` và sửa **văn bản** cho khớp spec, không nới needle. `cấu trúc en khác vi` thì so lại Step 12.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Tests '
```
Expected: `Tests  19 passed (19)` (app đọc đúng bốn file).

- [ ] **Step 14: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md website/test/site.test.mjs && git commit -m "docs(legal): chính sách quyền riêng tư thêm mục 11 Chat hỗ trợ, sửa mục 2, 4, 5, 6, 7 (dòng phiên bản đổi lúc phát hành)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Trang Liên hệ, năm ngôn ngữ; luật câu cũ `STALE_SUPPORT`

**Files:**
- Modify: `website/src/content/{vi,en,ja,zh,ko}/contact.mjs`
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Thêm luật câu cũ và test (cuối file)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

// Câu cũ đã gỡ khi có chat hỗ trợ: "email là kênh hỗ trợ duy nhất", "website không có form", "mọi liên hệ đi qua email" (năm ngôn ngữ).
// Văn bản CJK không tách câu theo 。 (sentencesOf chỉ tách theo dấu câu Latin và xuống dòng): luật CJK khớp trong cả đoạn.
const STALE_SUPPORT = [
  { id: "vi: kênh hỗ trợ duy nhất", re: /kênh\s+(?:hỗ\s+trợ\s+)?(?:liên\s+hệ\s+)?duy\s+nhất/iu },
  { id: "vi: không có form", re: /không\s+có\s+(?:form|biểu\s+mẫu)/iu },
  { id: "vi: mọi liên hệ đi qua email", re: /mọi\s+liên\s+hệ\s+(?:đều\s+)?(?:đi\s+qua|qua)\s+email(?:\s+ở\s+trên)?(?!\s+(?:hoặc|hay))/iu },
  { id: "en: only support channel", re: /\bonly\s+(?:support\s+|contact\s+)?channel\b/i },
  { id: "en: no contact or web form", re: /\bno\s+(?:contact|web)\s+form\b/i },
  { id: "en: all contact goes through the email", re: /\ball\s+contact\s+goes\s+through\s+(?:the\s+)?email\b(?!\s+or\b)/i },
  { id: "ja: 唯一の窓口", re: /唯一の(?:サポート)?窓口/u },
  { id: "ja: フォームもありません", re: /(?:お問い合わせ|ウェブ)フォーム(?:も|は)/u },
  { id: "ja: すべて上のメールアドレスで", re: /すべて上のメールアドレスで/u },
  { id: "zh: 唯一的渠道", re: /唯一的(?:支持|客服|联系)?渠道/u },
  { id: "zh: 没有表单", re: /没有(?:联系|网页)表单/u },
  { id: "zh: 所有联系都通过上面的邮箱进行", re: /所有联系都通过上面的邮箱进行/u },
  { id: "ko: 유일한 창구", re: /유일한\s*(?:지원\s*)?창구/u },
  { id: "ko: 문의 양식이 없음, 웹 양식도", re: /(?:문의|웹)\s*양식(?:이|도)/u },
  { id: "ko: 모든 연락은 위 이메일로", re: /모든\s*연락은\s*위\s*이메일로/u },
];
// Câu cũ nguyên văn (trang Liên hệ trước khi có chat) mà luật phải bắt.
const STALE_SUPPORT_MUST_CATCH = [
  "Cách liên hệ AI Translator là gửi email tới support@aitranslator.io.vn. Đây là kênh hỗ trợ duy nhất: website này không có form liên hệ và chúng tôi không có số điện thoại hỗ trợ.",
  "Không có form trên web, không có điện thoại",
  "Chúng tôi chưa công bố địa chỉ, số điện thoại hay mã số thuế trên website này; mọi liên hệ đi qua email ở trên.",
  "The way to reach AI Translator is to email support@aitranslator.io.vn. It is our only support channel: this website has no contact form, and we have no support phone line.",
  "No web form, no phone",
  "We have not published an address, phone number or tax code on this website; all contact goes through the email above.",
  "これが唯一のサポート窓口で、このウェブサイトにはお問い合わせフォームもサポート用の電話もありません。",
  "ウェブフォームも電話もありません",
  "ご連絡はすべて上のメールアドレスでお受けしています。",
  "这是我们唯一的支持渠道：本网站没有联系表单，我们也没有客服电话。",
  "没有网页表单，没有电话",
  "所有联系都通过上面的邮箱进行。",
  "이것이 유일한 지원 창구이며, 이 웹사이트에는 문의 양식이 없고 지원 전화도 없습니다.",
  "웹 양식도 전화도 없습니다",
  "모든 연락은 위 이메일로 받습니다.",
];
// Câu đúng của bản mới (và câu khác đang có trên site) mà luật KHÔNG được bắt.
const STALE_SUPPORT_MUST_KEEP = [
  "Bạn liên hệ AI Translator bằng email tới support@aitranslator.io.vn, hoặc nhắn ở chat hỗ trợ: nút chat ở góc dưới bên phải mỗi trang của website này, hay mục Hỗ trợ trong app. Chúng tôi không có số điện thoại hỗ trợ.",
  "Ngoài email và chat, chúng tôi không có điện thoại hay kênh hỗ trợ nào khác",
  "Chúng tôi chưa công bố địa chỉ, số điện thoại hay mã số thuế trên website này; mọi liên hệ đi qua email hoặc chat hỗ trợ ở trên.",
  "Apart from email and chat, we have no phone line or other support channel",
  "We have not published an address, phone number or tax code on this website; all contact goes through the email or the support chat above.",
  "メールとチャットのほかに、電話などのサポート窓口はありません",
  "ご連絡は上のメールアドレスかサポートチャットでお受けしています。",
  "除邮件和聊天外，我们没有电话或其他支持渠道",
  "所有联系都通过上面的邮箱或客服聊天进行。",
  "이메일과 채팅 외에 전화 등 다른 지원 창구는 없습니다",
  "모든 연락은 위 이메일이나 지원 채팅으로 받습니다.",
  "아래 버튼을 누르면 제목과 양식이 채워진 채로 이메일 앱이 열립니다.",
];

test("luật câu cũ về kênh hỗ trợ (STALE_SUPPORT) bắt câu 'email là kênh duy nhất, không có form' ở năm ngôn ngữ và không bắt câu mới", () => {
  const missed = STALE_SUPPORT_MUST_CATCH.filter((s) => staleHits(s, STALE_SUPPORT).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_SUPPORT_MUST_KEEP.filter((s) => staleHits(s, STALE_SUPPORT).length > 0).map((s) => `${s} → ${staleHits(s, STALE_SUPPORT).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site còn câu nói email là kênh hỗ trợ duy nhất hay website không có form", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_SUPPORT), []);
});

test("Liên hệ (năm ngôn ngữ): chat hỗ trợ cạnh email, ô Kênh khác chỉ nói không có điện thoại, mô tả trang nêu chat", () => {
  const need = {
    "/lien-he/": ["support@aitranslator.io.vn", "chat hỗ trợ", "góc dưới bên phải", "mục Hỗ trợ trong app", "Người thật trả lời, không phải bot", "Tin nhắn được lưu 90 ngày", "Ngoài email và chat", "email hoặc chat hỗ trợ ở trên"],
    "/en/contact/": ["support@aitranslator.io.vn", "support chat", "bottom right", "Support screen in the app", "A real person replies, not a bot", "Messages are kept for 90 days", "Apart from email and chat", "the email or the support chat above"],
    "/ja/contact/": ["support@aitranslator.io.vn", "サポートチャット", "右下", "「サポート」画面", "90 日間", "メールとチャットのほかに", "上のメールアドレスかサポートチャット"],
    "/zh/contact/": ["support@aitranslator.io.vn", "客服聊天", "右下角", "“客服”页面", "90 天", "除邮件和聊天外", "上面的邮箱或客服聊天"],
    "/ko/contact/": ["support@aitranslator.io.vn", "지원 채팅", "오른쪽 아래", "'지원' 화면", "90일간", "이메일과 채팅 외에", "위 이메일이나 지원 채팅"],
  };
  const errors = Object.entries(need).flatMap(([p, needles]) => needsIn(p, textOf(htmlByPath.get(p) ?? ""), needles));
  for (const [p, word] of [["/lien-he/", "chat hỗ trợ"], ["/en/contact/", "support chat"], ["/ja/contact/", "サポートチャット"], ["/zh/contact/", "客服聊天"], ["/ko/contact/", "지원 채팅"]]) {
    const meta = pageSources(p, htmlByPath.get(p) ?? "").get(`${p} [meta]`) ?? "";
    if (!meta.includes(word)) errors.push(`${p}: mô tả (meta) chưa nêu "${word}"`);
  }
  assert.deepEqual(errors, []);
});
EOF
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'STALE_SUPPORT|kênh hỗ trợ duy nhất hay website|Liên hệ \(năm ngôn ngữ\)' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
```
Expected: `ℹ tests 3`, `ℹ pass 1` (luật là hàm thuần nên xanh ngay), `ℹ fail 2`.

- [ ] **Step 3: Tiếng Việt**

Tệp: `website/src/content/vi/contact.mjs`
```old
    "Liên hệ AI Translator qua email support@aitranslator.io.vn: nhận bản cài, hỗ trợ kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu và báo lỗi bảo mật.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-15",
  llm: "Cách liên hệ và nhận hỗ trợ: email support@aitranslator.io.vn, việc nên gửi tới đó (nhận bản cài, kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu, bảo mật) và nên kèm thông tin gì.",
```
```new
    "Liên hệ AI Translator qua email support@aitranslator.io.vn hoặc chat hỗ trợ trên web và trong app: kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu, bảo mật.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  llm: "Cách liên hệ và nhận hỗ trợ: email support@aitranslator.io.vn hoặc chat hỗ trợ (nút chat ở góc dưới bên phải mỗi trang, mục Hỗ trợ trong app), việc nên gửi (nhận bản cài, kỹ thuật, mất key, thanh toán, hoàn tiền, xóa dữ liệu, bảo mật) và nên kèm thông tin gì.",
```

Tệp: `website/src/content/vi/contact.mjs`
```old
  lead: "Cách liên hệ AI Translator là gửi email tới support@aitranslator.io.vn. Đây là kênh hỗ trợ duy nhất: website này không có form liên hệ và chúng tôi không có số điện thoại hỗ trợ.",
```
```new
  lead: "Bạn liên hệ AI Translator bằng email tới support@aitranslator.io.vn, hoặc nhắn ở chat hỗ trợ: nút chat ở góc dưới bên phải mỗi trang của website này, hay mục Hỗ trợ trong app. Chúng tôi không có số điện thoại hỗ trợ.",
```

Tệp: `website/src/content/vi/contact.mjs`
```old
  ["Kênh khác", "Không có<small>Không có form trên web, không có điện thoại</small>"],
```
```new
  ["Chat", "Nút chat ở góc dưới bên phải mỗi trang, hoặc mục Hỗ trợ trong app<small>Người thật trả lời, không phải bot. Để lại email (không bắt buộc) để nhận câu trả lời qua email nếu bạn rời trang. Tin nhắn được lưu 90 ngày. Không thấy nút chat (ví dụ trình duyệt tắt JavaScript) thì hãy gửi email</small>"],
  ["Kênh khác", "Không có<small>Ngoài email và chat, chúng tôi không có điện thoại hay kênh hỗ trợ nào khác</small>"],
```

Tệp: `website/src/content/vi/contact.mjs`
```old
mọi liên hệ đi qua email ở trên.
```
```new
mọi liên hệ đi qua email hoặc chat hỗ trợ ở trên.
```

- [ ] **Step 4: Tiếng Anh**

Tệp: `website/src/content/en/contact.mjs`
```old
    "Contact AI Translator at support@aitranslator.io.vn: installer, technical support, lost keys, payment issues, refunds, data deletion and security reports.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-15",
  llm: "How to reach us and get support: email support@aitranslator.io.vn, what to send there (installer, technical help, lost key, payments, refunds, data deletion, security) and what to include.",
```
```new
    "Reach AI Translator at support@aitranslator.io.vn or in the support chat on this site and in the app: technical help, lost keys, payments, refunds, data deletion.",
  schemaType: "ContactPage",
  breadcrumbs: crumbs,
  modified: "2026-10-22",
  llm: "How to reach us and get support: email support@aitranslator.io.vn or the support chat (the chat button at the bottom right of every page, the Support screen in the app), what to send (installer, technical help, lost key, payments, refunds, data deletion, security) and what to include.",
```

Tệp: `website/src/content/en/contact.mjs`
```old
  lead: "The way to reach AI Translator is to email support@aitranslator.io.vn. It is our only support channel: this website has no contact form, and we have no support phone line.",
```
```new
  lead: "You can reach AI Translator by email at support@aitranslator.io.vn, or in the support chat: the chat button at the bottom right of every page of this website, or the Support screen in the app. We have no support phone line.",
```

Tệp: `website/src/content/en/contact.mjs`
```old
  ["Other channels", "None<small>No web form, no phone</small>"],
```
```new
  ["Chat", "The chat button at the bottom right of every page, or the Support screen in the app<small>A real person replies, not a bot. Leave your email (optional) to get the reply by email if you leave the page. Messages are kept for 90 days. If you do not see the chat button (for example with JavaScript turned off), email us</small>"],
  ["Other channels", "None<small>Apart from email and chat, we have no phone line or other support channel</small>"],
```

Tệp: `website/src/content/en/contact.mjs`
```old
all contact goes through the email above.
```
```new
all contact goes through the email or the support chat above.
```

- [ ] **Step 5: Tiếng Nhật**

Tệp: `website/src/content/ja/contact.mjs`
```old
    "AI Translator へのお問い合わせは support@aitranslator.io.vn まで。インストーラー、技術サポート、キーの紛失、支払い、返金、データ削除、セキュリティ報告。",
```
```new
    "AI Translator へのお問い合わせは support@aitranslator.io.vn へのメール、またはサイトとアプリのサポートチャットで。技術サポート、キーの紛失、支払い、返金、データ削除。",
```

Tệp: `website/src/content/ja/contact.mjs`
```old
  lead: "AI Translator へのご連絡は support@aitranslator.io.vn へのメールでお願いします。これが唯一のサポート窓口で、このウェブサイトにはお問い合わせフォームもサポート用の電話もありません。",
```
```new
  lead: "AI Translator へのご連絡は、support@aitranslator.io.vn へのメールか、サポートチャット（このウェブサイトの各ページ右下にあるチャットボタン、またはアプリの「サポート」画面）でお願いします。サポート用の電話はありません。",
```

Tệp: `website/src/content/ja/contact.mjs`
```old
  ["ほかの窓口", "なし<small>ウェブフォームも電話もありません</small>"],
```
```new
  ["チャット", "各ページ右下のチャットボタン、またはアプリの「サポート」画面<small>ボットではなく人が返信します。メールアドレスを残すと（任意）、ページを離れても返信をメールで受け取れます。メッセージは 90 日間保存されます。チャットボタンが表示されない場合（JavaScript がオフのときなど）は、メールをお送りください</small>"],
  ["ほかの窓口", "なし<small>メールとチャットのほかに、電話などのサポート窓口はありません</small>"],
```

Tệp: `website/src/content/ja/contact.mjs`
```old
ご連絡はすべて上のメールアドレスでお受けしています。
```
```new
ご連絡は上のメールアドレスかサポートチャットでお受けしています。
```

- [ ] **Step 6: Tiếng Trung**

Tệp: `website/src/content/zh/contact.mjs`
```old
    "通过 support@aitranslator.io.vn 联系 AI Translator：安装包、技术支持、密钥丢失、付款问题、退款、数据删除和安全报告。",
```
```new
    "通过 support@aitranslator.io.vn 或网站和应用中的客服聊天联系 AI Translator：安装包、技术支持、密钥丢失、付款问题、退款、数据删除和安全报告。",
```

Tệp: `website/src/content/zh/contact.mjs`
```old
  lead: "联系 AI Translator 的方式是发邮件到 support@aitranslator.io.vn。这是我们唯一的支持渠道：本网站没有联系表单，我们也没有客服电话。",
```
```new
  lead: "你可以发邮件到 support@aitranslator.io.vn 联系 AI Translator，也可以使用客服聊天：本网站每个页面右下角的聊天按钮，或应用中的“客服”页面。我们没有客服电话。",
```

Tệp: `website/src/content/zh/contact.mjs`
```old
  ["其他渠道", "无<small>没有网页表单，没有电话</small>"],
```
```new
  ["聊天", "每个页面右下角的聊天按钮，或应用中的“客服”页面<small>由真人回复，不是机器人。可以留下邮箱（选填），离开页面后也能通过邮件收到回复。消息保存 90 天。看不到聊天按钮（例如浏览器关闭了 JavaScript）时，请发邮件</small>"],
  ["其他渠道", "无<small>除邮件和聊天外，我们没有电话或其他支持渠道</small>"],
```

Tệp: `website/src/content/zh/contact.mjs`
```old
所有联系都通过上面的邮箱进行。
```
```new
所有联系都通过上面的邮箱或客服聊天进行。
```

- [ ] **Step 7: Tiếng Hàn**

Tệp: `website/src/content/ko/contact.mjs`
```old
    "support@aitranslator.io.vn으로 AI Translator에 문의하세요: 설치 파일, 기술 지원, 키 분실, 결제 문제, 환불, 데이터 삭제, 보안 신고.",
```
```new
    "support@aitranslator.io.vn 이메일이나 웹사이트와 앱의 지원 채팅으로 AI Translator에 문의하세요: 기술 지원, 키 분실, 결제 문제, 환불, 데이터 삭제, 보안 신고.",
```

Tệp: `website/src/content/ko/contact.mjs`
```old
  lead: "AI Translator에 연락하는 방법은 support@aitranslator.io.vn으로 이메일을 보내는 것입니다. 이것이 유일한 지원 창구이며, 이 웹사이트에는 문의 양식이 없고 지원 전화도 없습니다.",
```
```new
  lead: "AI Translator에는 support@aitranslator.io.vn으로 이메일을 보내거나, 지원 채팅(이 웹사이트 모든 페이지 오른쪽 아래의 채팅 버튼, 또는 앱의 '지원' 화면)으로 연락할 수 있습니다. 지원 전화는 없습니다.",
```

Tệp: `website/src/content/ko/contact.mjs`
```old
  ["다른 창구", "없음<small>웹 양식도 전화도 없습니다</small>"],
```
```new
  ["채팅", "모든 페이지 오른쪽 아래의 채팅 버튼, 또는 앱의 '지원' 화면<small>봇이 아닌 사람이 답변합니다. 이메일을 남기면(선택) 페이지를 떠나도 답장을 이메일로 받을 수 있습니다. 메시지는 90일간 보관됩니다. 채팅 버튼이 보이지 않으면(예: 브라우저에서 JavaScript를 끈 경우) 이메일을 보내 주세요</small>"],
  ["다른 창구", "없음<small>이메일과 채팅 외에 전화 등 다른 지원 창구는 없습니다</small>"],
```

Tệp: `website/src/content/ko/contact.mjs`
```old
모든 연락은 위 이메일로 받습니다.
```
```new
모든 연락은 위 이메일이나 지원 채팅으로 받습니다.
```

- [ ] **Step 8: Chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)|^not ok'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 4. Nếu test độ dài mô tả đỏ (vi/en 90–165 ký tự, ja/zh/ko 50–120), rút gọn mô tả của trang đó, giữ chữ "chat hỗ trợ" / "support chat" / "サポートチャット" / "客服聊天" / "지원 채팅".

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add website/src/content/vi/contact.mjs website/src/content/en/contact.mjs website/src/content/ja/contact.mjs website/src/content/zh/contact.mjs website/src/content/ko/contact.mjs website/test/site.test.mjs && git commit -m "feat(website): trang Liên hệ năm ngôn ngữ nêu chat hỗ trợ cạnh email, bỏ câu kênh duy nhất (luật STALE_SUPPORT)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Trang Dữ liệu và bảo mật, năm ngôn ngữ

**Files:**
- Modify: `website/src/content/{vi,en,ja,zh,ko}/data-security.mjs`
- Test: `website/test/site.test.mjs`

Mục mới có `id` là `chat-ho-tro` (vi) và `support-chat` (en, ja, zh, ko), đặt ngay sau mục Báo cáo lỗi. Bảng "nơi app kết nối" vẫn năm dòng (chat đi tới `api.aitranslator.io.vn`, đã có dòng): test `số nơi app kết nối…` vẫn đúng.

- [ ] **Step 1: Thêm test (cuối file)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

test("Dữ liệu và bảo mật (năm ngôn ngữ): mục Chat hỗ trợ, hàng chat ở bảng máy chủ, chat trong mục kết nối và bên xử lý, không nêu tên bên chuyển tin", () => {
  const cfg = [
    {
      path: "/bao-mat-du-lieu/", ids: { chat: "chat-ho-tro", server: "may-chu", network: "ket-noi-mang", processors: "ben-xu-ly" }, row: "Chat hỗ trợ:",
      chat: ["Không lưu địa chỉ IP cùng cuộc chat", "chỉ đi kèm tin đầu tiên", "không bao giờ có key, email, mã máy hay tên máy", "không bắt buộc", "tự xóa sau 90 ngày kể từ tin cuối", "khi bạn yêu cầu qua email", "mục 11 của Chính sách quyền riêng tư"],
      rowNeeds: ["tự xóa sau 90 ngày kể từ tin cuối"], network: ["cùng tin chat hỗ trợ khi bạn đang mở mục Hỗ trợ hay bấm gửi", "tin chat hỗ trợ bạn gửi"], processors: ["kể cả báo cáo lỗi và chat hỗ trợ", "dịch vụ nhắn tin đặt máy chủ ở Việt Nam"],
    },
    {
      path: "/en/data-security/", ids: { chat: "support-chat", server: "server", network: "network", processors: "processors" }, row: "Support chat:",
      chat: ["No IP address is stored with the chat", "goes only with your first message", "never contains your key, email, machine ID or computer name", "optional", "deleted automatically 90 days after the last message", "when you ask us by email", "section 11 of the Privacy policy"],
      rowNeeds: ["deleted automatically 90 days after the last message"], network: ["plus support chat messages while you have the Support screen open or press send", "support chat messages you send"], processors: ["including error reports and the support chat", "messaging service with servers in Vietnam"],
    },
    {
      path: "/ja/data-security/", ids: { chat: "support-chat", server: "server", network: "network", processors: "processors" }, row: "サポートチャット：",
      chat: ["IP アドレスはチャットと一緒に保存しません", "最初のメッセージにだけ付き", "最後のメッセージから 90 日後に自動で削除します", "メールでご依頼いただいたときに削除します", "第 11 節"],
      rowNeeds: ["最後のメッセージから 90 日後に自動で削除"], network: ["送信を押したときのサポートチャットのメッセージ", "送信したサポートチャットのメッセージ"], processors: ["エラーレポートとサポートチャットを含む", "ベトナム国内にサーバーを置くメッセージサービス"],
    },
    {
      path: "/zh/data-security/", ids: { chat: "support-chat", server: "server", network: "network", processors: "processors" }, row: "客服聊天：",
      chat: ["不会把 IP 地址和聊天一起保存", "只随第一条消息发送", "最后一条消息 90 天后自动删除", "在你通过邮件提出要求时删除", "第 11 节"],
      rowNeeds: ["最后一条消息 90 天后自动删除"], network: ["点击发送时的客服聊天消息", "你发送的客服聊天消息"], processors: ["包括错误报告和客服聊天", "服务器位于越南的消息服务"],
    },
    {
      path: "/ko/data-security/", ids: { chat: "support-chat", server: "server", network: "network", processors: "processors" }, row: "지원 채팅:",
      chat: ["IP 주소는 채팅과 함께 저장하지 않습니다", "첫 메시지에만 붙으며", "마지막 메시지 90일 뒤 자동 삭제됩니다", "이메일로 요청하시면 삭제합니다", "제11절"],
      rowNeeds: ["마지막 메시지 90일 뒤 자동 삭제"], network: ["보내기를 눌렀을 때의 지원 채팅 메시지", "보낸 지원 채팅 메시지"], processors: ["오류 보고서와 지원 채팅 포함", "베트남에 서버를 둔 메시징 서비스"],
    },
  ];
  const errors = [];
  for (const c of cfg) {
    errors.push(...needsIn(`${c.path} #${c.ids.chat}`, textOf(pageSection(c.path, c.ids.chat)), c.chat));
    const row = rowText(pageSection(c.path, c.ids.server), c.row);
    if (!row) errors.push(`${c.path} #${c.ids.server}: không có hàng "${c.row}"`);
    else errors.push(...needsIn(`${c.path} #${c.ids.server} hàng "${c.row}"`, row, c.rowNeeds));
    errors.push(...needsIn(`${c.path} #${c.ids.network}`, textOf(pageSection(c.path, c.ids.network)), c.network));
    errors.push(...needsIn(`${c.path} #${c.ids.processors}`, textOf(pageSection(c.path, c.ids.processors)), c.processors));
    // Tên bên chuyển tin chỉ nằm ở Chính sách quyền riêng tư (spec mục 5). Chỉ đọc phần thân <main>: chân trang chung của mọi trang
    // có câu nhãn hiệu "Zoom, Microsoft Teams, Google Meet, Zalo… thuộc về chủ sở hữu" (tên app họp, không phải bên xử lý).
    const main = /<main id="main">([\s\S]*)<\/main>/.exec(htmlByPath.get(c.path) ?? "")?.[1] ?? "";
    if (!main) errors.push(`${c.path}: không tìm thấy <main id="main">`);
    const leak = /zalo|\bVNG\b/i.exec(textOf(main));
    if (leak) errors.push(`${c.path}: thân trang nêu "${leak[0]}" (chỉ chính sách được nêu bên xử lý)`);
  }
  assert.deepEqual(errors, []);
});
EOF
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'Dữ liệu và bảo mật \(năm ngôn ngữ\)' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
```
Expected: `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Tiếng Việt**

Tệp: `website/src/content/vi/data-security.mjs`
```old
  { level: 2, id: "bao-cao-loi", text: "Báo cáo lỗi: app gửi gì khi gặp lỗi?" },
```
```new
  { level: 2, id: "bao-cao-loi", text: "Báo cáo lỗi: app gửi gì khi gặp lỗi?" },
  { level: 2, id: "chat-ho-tro", text: "Chat hỗ trợ: tin nhắn đi đâu, giữ bao lâu?" },
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
  modified: "2026-10-14",
  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS, dữ liệu máy chủ lưu và thời gian giữ, báo cáo lỗi tự động (gửi gì, tắt thế nào), bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
```
```new
  modified: "2026-10-22",
  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS, dữ liệu máy chủ lưu và thời gian giữ, báo cáo lỗi tự động (gửi gì, tắt thế nào), chat hỗ trợ (lưu gì, giữ bao lâu), bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
  ["Dữ liệu cuộc hội thoại", "Chỉ ở trên máy bạn; máy chủ của chúng tôi không có"],
```
```new
  ["Dữ liệu cuộc họp", "Chỉ ở trên máy bạn; máy chủ của chúng tôi không có"],
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh, chữ chép lời hay chữ bạn gõ"],
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy, báo cáo lỗi"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa; báo cáo lỗi 30 ngày"],
```
```new
  ["Kết nối mạng", "Năm nơi; không nơi nào nhận âm thanh, chữ chép lời hay chữ bạn gõ ở Gõ dịch"],
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy, báo cáo lỗi, tin nhắn chat hỗ trợ"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa; báo cáo lỗi 30 ngày; chat hỗ trợ 90 ngày"],
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
Đúng năm nơi, và không nơi nào nhận âm thanh, nội dung chép lời hay chữ bạn gõ. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn).
```
```new
Đúng năm nơi, và không nơi nào nhận âm thanh, nội dung chép lời hay chữ bạn gõ ở Gõ dịch. Nhận dạng giọng nói và dịch không cần mạng. Trong lúc dịch, app chỉ có thể gửi các yêu cầu định kỳ tới máy chủ của chúng tôi (kiểm tra bản cập nhật, và kiểm tra bản quyền khi đến hạn), cùng tin chat hỗ trợ khi bạn đang mở mục Hỗ trợ hay bấm gửi.
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
<tr><th scope="row">api.aitranslator.io.vn</th><td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền, nhận báo cáo lỗi; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key; báo cáo lỗi đã che dữ liệu cá nhân (chỉ khi app không đang dịch)</td></tr>
```
```new
<tr><th scope="row">api.aitranslator.io.vn</th><td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền, nhận báo cáo lỗi, chat hỗ trợ; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key; báo cáo lỗi đã che dữ liệu cá nhân (chỉ khi app không đang dịch); tin chat hỗ trợ bạn gửi, kèm dòng thông tin máy nếu bạn để tích và email nếu bạn tự để lại (chỉ khi bạn dùng chat)</td></tr>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
trừ dòng báo cáo lỗi (áp cho mọi máy mà app gửi báo cáo).</p>
```
```new
trừ dòng báo cáo lỗi (áp cho mọi máy mà app gửi báo cáo) và dòng chat hỗ trợ (áp cho mọi người đã nhắn ở chat).</p>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
<tr><th scope="row">Báo cáo lỗi: loại và mã lỗi, thông tin máy, mã băm ID máy, phần log liên quan</th><td>Tìm và sửa lỗi; tự xóa sau 30 ngày (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>)</td></tr>
```
```new
<tr><th scope="row">Báo cáo lỗi: loại và mã lỗi, thông tin máy, mã băm ID máy, phần log liên quan</th><td>Tìm và sửa lỗi; tự xóa sau 30 ngày (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>)</td></tr>
<tr><th scope="row">Chat hỗ trợ: tin nhắn của bạn và câu trả lời, nguồn, ngôn ngữ, trang bạn đang xem (website), dòng thông tin máy nếu bạn để tích (app), email nếu bạn tự để lại</th><td>Trả lời bạn; tự xóa sau 90 ngày kể từ tin cuối (xem <a href="#chat-ho-tro">Chat hỗ trợ</a>)</td></tr>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
chúng tôi không tự xóa (trừ báo cáo lỗi, tự xóa sau 30 ngày).
```
```new
chúng tôi không tự xóa (trừ báo cáo lỗi, tự xóa sau 30 ngày, và chat hỗ trợ, tự xóa sau 90 ngày kể từ tin cuối).
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn.</p>
```
```new
Nếu chỉ dùng Free, máy chủ không có email hay tên máy của bạn, trừ email bạn tự để lại trong chat hỗ trợ.</p>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
```
```new
<h2 id="chat-ho-tro">Chat hỗ trợ: tin nhắn đi đâu, giữ bao lâu?</h2>
<p>Bạn nhắn cho chúng tôi được bằng nút chat ở góc dưới bên phải mỗi trang của website này, hoặc ở mục <strong>Hỗ trợ</strong> trong app. Tin nhắn đi qua máy chủ của chúng tôi tới người vận hành AI Translator, và câu trả lời hiện lại trong khung chat. Dùng chat là do bạn chọn: chưa từng nhắn thì app không kết nối gì cho chat.</p>
<ul>
<li><strong>Máy chủ lưu:</strong> tin nhắn của bạn và câu trả lời, thời điểm, nguồn (website hay app), ngôn ngữ, trang bạn đang xem lúc mở chat (website), dòng thông tin máy nếu bạn để tích (app), và email nếu bạn tự để lại. Không lưu địa chỉ IP cùng cuộc chat.</li>
<li><strong>Thông tin máy (app):</strong> ô này tích sẵn, bỏ tích được, chỉ đi kèm tin đầu tiên và hiện nguyên văn trước khi gửi; không bao giờ có key, email, mã máy hay tên máy.</li>
<li><strong>Email:</strong> không bắt buộc; chỉ dùng để gửi câu trả lời qua email khi bạn đã rời khung chat.</li>
<li><strong>Giữ bao lâu:</strong> tự xóa sau 90 ngày kể từ tin cuối. Bạn xóa ngay được cuộc trò chuyện ở menu ⋯ của khung chat; bản sao tin nhắn đã tới người trả lời thì được xóa khi bạn yêu cầu qua email.</li>
</ul>
<p>Văn bản đầy đủ, kể cả bên chuyển tin nhắn, ở mục 11 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>.</p>

<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn, và xóa báo cáo lỗi của các máy từng kích hoạt key của email đó. License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
```
```new
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn, xóa báo cáo lỗi của các máy từng kích hoạt key của email đó, và xóa các cuộc chat hỗ trợ mà bạn đã để lại email đó (kể cả bản đã tới người trả lời). License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
<tr><th scope="row">Cloudflare</th><td>Chạy máy chủ bản quyền, cơ sở dữ liệu; lưu và phân phối model, bản cập nhật</td><td>Dữ liệu ở bảng trên, kể cả báo cáo lỗi; nhật ký kỹ thuật tự hết hạn</td></tr>
<tr><th scope="row">Resend</th><td>Gửi email chứa key</td><td>Email của bạn và nội dung thư (có key); nhật ký thư theo chính sách lưu của Resend</td></tr>
```
```new
<tr><th scope="row">Cloudflare</th><td>Chạy máy chủ bản quyền, cơ sở dữ liệu; lưu và phân phối model, bản cập nhật</td><td>Dữ liệu ở bảng trên, kể cả báo cáo lỗi và chat hỗ trợ; nhật ký kỹ thuật tự hết hạn</td></tr>
<tr><th scope="row">Resend</th><td>Gửi email chứa key, và câu trả lời chat hỗ trợ khi bạn để lại email</td><td>Email của bạn và nội dung thư (có key, hay câu trả lời chat); nhật ký thư theo chính sách lưu của Resend</td></tr>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
nên dữ liệu có thể được xử lý ở nước ngoài. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>
```
```new
nên dữ liệu có thể được xử lý ở nước ngoài. Tin nhắn chat hỗ trợ còn đi qua một dịch vụ nhắn tin đặt máy chủ ở Việt Nam để tới người trả lời (không kèm email của bạn); tên bên này và dữ liệu họ nhận có ở mục 6 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>. Chúng tôi không bán và không chia sẻ dữ liệu của bạn cho mục đích quảng cáo.</p>
```

Tệp: `website/src/content/vi/data-security.mjs`
```old
phần báo cáo lỗi tự động chỉ đo một lượt (một phiên 12 phút, một báo cáo).
```
```new
phần báo cáo lỗi tự động chỉ đo một lượt (một phiên 12 phút, một báo cáo), còn chat hỗ trợ chưa được đo bằng proxy.
```

- [ ] **Step 4: Tiếng Anh**

Tệp: `website/src/content/en/data-security.mjs`
```old
  { level: 2, id: "error-reports", text: "Error reports: what does the app send?" },
```
```new
  { level: 2, id: "error-reports", text: "Error reports: what does the app send?" },
  { level: 2, id: "support-chat", text: "Support chat: where do messages go?" },
```

Tệp: `website/src/content/en/data-security.mjs`
```old
  modified: "2026-10-14",
  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS, what our servers store and for how long, automatic error reports (what is sent, how to turn them off), processors, protections, signing status and how to request deletion.",
```
```new
  modified: "2026-10-22",
  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS, what our servers store and for how long, automatic error reports (what is sent, how to turn them off), the support chat (what is stored, for how long), processors, protections, signing status and how to request deletion.",
```

Tệp: `website/src/content/en/data-security.mjs`
```old
  ["Conversation data", "Only on your computer; our server has none"],
```
```new
  ["Meeting data", "Only on your computer; our server has none"],
```

Tệp: `website/src/content/en/data-security.mjs`
```old
  ["Network", "Five places; none of them receives audio, transcripts or the text you type"],
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID, error reports"],
  ["Kept for", "Until you ask us to delete it; error reports 30 days"],
```
```new
  ["Network", "Five places; none of them receives audio, transcripts or the text you type in Type &amp; Translate"],
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID, error reports, support chat messages"],
  ["Kept for", "Until you ask us to delete it; error reports 30 days; support chat 90 days"],
```

Tệp: `website/src/content/en/data-security.mjs`
```old
To exactly five places, and none of them receives audio, transcript content or the text you type. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due).
```
```new
To exactly five places, and none of them receives audio, transcript content or the text you type in Type &amp; Translate. Speech recognition and translation need no network. While translating, the app may only send scheduled requests to our own servers (an update check, and a license check when one is due), plus support chat messages while you have the Support screen open or press send.
```

Tệp: `website/src/content/en/data-security.mjs`
```old
<tr><th scope="row">api.aitranslator.io.vn</th><td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks, receiving error reports; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key; error reports with personal data scrubbed out (only while the app is not translating)</td></tr>
```
```new
<tr><th scope="row">api.aitranslator.io.vn</th><td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks, receiving error reports, the support chat; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key; error reports with personal data scrubbed out (only while the app is not translating); support chat messages you send, with the machine details line if you leave it ticked and your email if you choose to leave it (only if you use the chat)</td></tr>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
except the error-reports row, which applies to every device whose app sends a report.</p>
```
```new
except the error-reports row, which applies to every device whose app sends a report, and the support-chat row, which applies to everyone who writes in the chat.</p>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
<tr><th scope="row">Error reports: error type and code, machine details, hashed machine ID, the relevant part of the log</th><td>Finding and fixing bugs; deleted automatically after 30 days (see <a href="#error-reports">Error reports</a>)</td></tr>
```
```new
<tr><th scope="row">Error reports: error type and code, machine details, hashed machine ID, the relevant part of the log</th><td>Finding and fixing bugs; deleted automatically after 30 days (see <a href="#error-reports">Error reports</a>)</td></tr>
<tr><th scope="row">Support chat: your messages and our replies, source, language, the page you were on (website), the machine details line if you left it ticked (app), your email if you chose to leave it</th><td>Replying to you; deleted automatically 90 days after the last message (see <a href="#support-chat">Support chat</a>)</td></tr>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
we never delete personal data on our own (except error reports, which are deleted automatically after 30 days).
```
```new
we never delete personal data on our own (except error reports, which are deleted automatically after 30 days, and the support chat, deleted 90 days after the last message).
```

Tệp: `website/src/content/en/data-security.mjs`
```old
If you only use Free, our servers hold no email or device name for you.</p>
```
```new
If you only use Free, our servers hold no email or device name for you, except an email you choose to leave in the support chat.</p>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
<h2 id="delete-data">How do I delete my data?</h2>
```
```new
<h2 id="support-chat">Support chat: where do your messages go, and for how long?</h2>
<p>You can write to us with the chat button at the bottom right of every page of this website, or on the <strong>Support</strong> screen in the app. Your messages go through our server to the person who runs AI Translator, and the reply appears in the same chat. Using the chat is up to you: if you have never written in it, the app makes no connection for it.</p>
<ul>
<li><strong>Our server stores:</strong> your messages and our replies, their times, the source (website or app), the language, the page you were on when you opened the chat (website), the machine details line if you left it ticked (app), and your email if you chose to leave it. No IP address is stored with the chat.</li>
<li><strong>Machine details (app):</strong> the box is ticked by default, can be unticked, goes only with your first message and is shown word for word before sending; it never contains your key, email, machine ID or computer name.</li>
<li><strong>Email:</strong> optional; used only to email you our reply when you have left the chat.</li>
<li><strong>How long:</strong> deleted automatically 90 days after the last message. You can delete the conversation right away from the ⋯ menu of the chat; the copy of your messages that reached the person who replies is deleted when you ask us by email.</li>
</ul>
<p>The full text, including who carries the messages, is in section 11 of the <a href="/en/privacy/">Privacy policy</a>.</p>

<h2 id="delete-data">How do I delete my data?</h2>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
    { title: "What we do", text: "We remove your email and device name, and delete the error reports of the machines that ever activated a key for that email. Your license still works, but can no longer be recovered by email." },
```
```new
    { title: "What we do", text: "We remove your email and device name, delete the error reports of the machines that ever activated a key for that email, and delete the support chats in which you left that email (including the copy that reached the person who replies). Your license still works, but can no longer be recovered by email." },
```

Tệp: `website/src/content/en/data-security.mjs`
```old
<tr><th scope="row">Cloudflare</th><td>Runs the license server and database; stores and serves models and updates</td><td>The data in the table above, including error reports; technical logs that expire on their own</td></tr>
<tr><th scope="row">Resend</th><td>Sends the email that contains your key</td><td>Your email and the message (with the key); mail logs kept under Resend's own policy</td></tr>
```
```new
<tr><th scope="row">Cloudflare</th><td>Runs the license server and database; stores and serves models and updates</td><td>The data in the table above, including error reports and the support chat; technical logs that expire on their own</td></tr>
<tr><th scope="row">Resend</th><td>Sends the email that contains your key, and our support chat reply if you left an email</td><td>Your email and the message (with the key, or our chat reply); mail logs kept under Resend's own policy</td></tr>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
so data may be processed abroad. We do not sell your data and do not share it for advertising.</p>
```
```new
so data may be processed abroad. Support chat messages also pass through a messaging service with servers in Vietnam to reach the person who replies (without your email); its name and the data it receives are in section 6 of the <a href="/en/privacy/">Privacy policy</a>. We do not sell your data and do not share it for advertising.</p>
```

Tệp: `website/src/content/en/data-security.mjs`
```old
the automatic error report was measured once (one 12-minute session, one report).
```
```new
the automatic error report was measured once (one 12-minute session, one report), and the support chat has not been measured with the proxy yet.
```

- [ ] **Step 5: Tiếng Nhật**

Tệp: `website/src/content/ja/data-security.mjs`
```old
  { level: 2, id: "error-reports", text: "エラーレポート：アプリは何を送るか" },
```
```new
  { level: 2, id: "error-reports", text: "エラーレポート：アプリは何を送るか" },
  { level: 2, id: "support-chat", text: "サポートチャット：メッセージの行き先と保存期間" },
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
  ["会話のデータ", "パソコンにだけ存在し、サーバーにはありません"],
```
```new
  ["会議のデータ", "パソコンにだけ存在し、サーバーにはありません"],
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
  ["ネットワーク", "5 か所。どこにも音声、文字起こし、入力したテキストは送りません"],
  ["サーバーに保存", "メールアドレス（購入時）、注文、ライセンス、ハッシュ化したマシン ID、エラーレポート"],
  ["保存期間", "削除のご依頼があるまで。エラーレポートは 30 日"],
```
```new
  ["ネットワーク", "5 か所。どこにも音声、文字起こし、入力翻訳で入力したテキストは送りません"],
  ["サーバーに保存", "メールアドレス（購入時）、注文、ライセンス、ハッシュ化したマシン ID、エラーレポート、サポートチャットのメッセージ"],
  ["保存期間", "削除のご依頼があるまで。エラーレポートは 30 日、サポートチャットは 90 日"],
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
ちょうど 5 か所で、どこにも音声、文字起こしの内容、入力したテキストは送りません。音声認識と翻訳にネットワークは不要です。翻訳中にアプリが送ることがあるのは、自社サーバーへの定期的なリクエスト（更新の確認と、時期が来たときのライセンスの確認）だけです。
```
```new
ちょうど 5 か所で、どこにも音声、文字起こしの内容、入力翻訳で入力したテキストは送りません。音声認識と翻訳にネットワークは不要です。翻訳中にアプリが送ることがあるのは、自社サーバーへの定期的なリクエスト（更新の確認と、時期が来たときのライセンスの確認）と、「サポート」画面を開いているときや送信を押したときのサポートチャットのメッセージだけです。
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
<tr><th scope="row">api.aitranslator.io.vn</th><td>ライセンスサーバー：Free お試しの登録、購入、有効化、無効化、キーの再送、ライセンスの確認、エラーレポートの受信。ときどきサーバーに時刻を問い合わせます</td><td>ハッシュ化したマシン ID、デバイス名、キー。購入時とキーの再送時にはメールアドレスも。個人情報を除いたエラーレポート（アプリが翻訳していないときだけ）</td></tr>
```
```new
<tr><th scope="row">api.aitranslator.io.vn</th><td>ライセンスサーバー：Free お試しの登録、購入、有効化、無効化、キーの再送、ライセンスの確認、エラーレポートの受信、サポートチャット。ときどきサーバーに時刻を問い合わせます</td><td>ハッシュ化したマシン ID、デバイス名、キー。購入時とキーの再送時にはメールアドレスも。個人情報を除いたエラーレポート（アプリが翻訳していないときだけ）。送信したサポートチャットのメッセージと、チェックを残した場合のマシン情報の行、残した場合のメールアドレス（チャットを使ったときだけ）</td></tr>
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
ただしエラーレポートの行は、アプリがレポートを送ったすべてのデバイスが対象です。
```
```new
ただしエラーレポートの行はアプリがレポートを送ったすべてのデバイス、サポートチャットの行はチャットでメッセージを送ったすべての方が対象です。
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
<tr><th scope="row">エラーレポート：エラーの種類とコード、マシンの情報、ハッシュ化したマシン ID、関係するログの部分</th><td>不具合の発見と修正。30 日後に自動で削除（<a href="#error-reports">エラーレポート</a>をご覧ください）</td></tr>
```
```new
<tr><th scope="row">エラーレポート：エラーの種類とコード、マシンの情報、ハッシュ化したマシン ID、関係するログの部分</th><td>不具合の発見と修正。30 日後に自動で削除（<a href="#error-reports">エラーレポート</a>をご覧ください）</td></tr>
<tr><th scope="row">サポートチャット：あなたのメッセージと返信、送信元、言語、チャットを開いたときのページ（ウェブサイト）、チェックを残した場合のマシン情報の行（アプリ）、残した場合のメールアドレス</th><td>あなたへの返信。最後のメッセージから 90 日後に自動で削除（<a href="#support-chat">サポートチャット</a>をご覧ください）</td></tr>
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
（30 日後に自動で削除されるエラーレポートを除く）
```
```new
（30 日後に自動で削除されるエラーレポートと、最後のメッセージから 90 日後に自動で削除されるサポートチャットを除く）
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
Free だけを使う場合、サーバーにあなたのメールアドレスやデバイス名はありません。
```
```new
Free だけを使う場合、サポートチャットにご自身で残したメールアドレスを除き、サーバーにあなたのメールアドレスやデバイス名はありません。
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
<h2 id="delete-data">データを削除するには？</h2>
```
```new
<h2 id="support-chat">サポートチャット：メッセージの行き先と保存期間</h2>
<p>このウェブサイトの各ページ右下にあるチャットボタン、またはアプリの<strong>サポート</strong>画面からメッセージを送れます。メッセージは私たちのサーバーを通って AI Translator の運営者に届き、返信は同じチャットに表示されます。チャットを使うかどうかはあなたが決めます。一度もメッセージを送っていなければ、アプリはチャットのための接続をしません。</p>
<ul>
<li><strong>サーバーに保存するもの：</strong>あなたのメッセージと返信、日時、送信元（ウェブサイトまたはアプリ）、言語、チャットを開いたときのページ（ウェブサイト）、チェックを残した場合のマシン情報の行（アプリ）、残した場合のメールアドレス。IP アドレスはチャットと一緒に保存しません。</li>
<li><strong>マシン情報（アプリ）：</strong>チェックは最初から入っていて外せます。最初のメッセージにだけ付き、送信前にそのままの文面で表示されます。キー、メールアドレス、マシン ID、パソコン名は決して含みません。</li>
<li><strong>メールアドレス：</strong>任意です。チャットを離れたあとに返信をメールでお送りするためだけに使います。</li>
<li><strong>保存期間：</strong>最後のメッセージから 90 日後に自動で削除します。チャットの ⋯ メニューから会話をすぐに削除することもできます。返信する人に届いたメッセージの写しは、メールでご依頼いただいたときに削除します。</li>
</ul>
<p>メッセージを運ぶ事業者を含む全文は、<a href="/en/privacy/">プライバシーポリシー（英語）</a>の第 11 節にあります。</p>

<h2 id="delete-data">データを削除するには？</h2>
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
    { title: "私たちが行うこと", text: "メールアドレスとデバイス名を削除し、そのメールアドレスのキーを一度でも有効にしたマシンのエラーレポートを削除します。ライセンスは引き続き使えますが、メールで取り戻すことはできなくなります。" },
```
```new
    { title: "私たちが行うこと", text: "メールアドレスとデバイス名を削除し、そのメールアドレスのキーを一度でも有効にしたマシンのエラーレポートと、そのメールアドレスを残したサポートチャット（返信する人に届いた写しを含む）を削除します。ライセンスは引き続き使えますが、メールで取り戻すことはできなくなります。" },
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
<tr><th scope="row">Cloudflare</th><td>ライセンスサーバーとデータベースの運用。モデルと更新の保存と配信</td><td>上の表のデータ（エラーレポートを含む）。自動で失効する技術的なログ</td></tr>
<tr><th scope="row">Resend</th><td>キーが記載されたメールの送信</td><td>メールアドレスとメッセージ（キーを含む）。Resend のポリシーに基づくメールのログ</td></tr>
```
```new
<tr><th scope="row">Cloudflare</th><td>ライセンスサーバーとデータベースの運用。モデルと更新の保存と配信</td><td>上の表のデータ（エラーレポートとサポートチャットを含む）。自動で失効する技術的なログ</td></tr>
<tr><th scope="row">Resend</th><td>キーが記載されたメールと、メールアドレスを残した場合のサポートチャットの返信の送信</td><td>メールアドレスとメッセージ（キーまたはチャットの返信を含む）。Resend のポリシーに基づくメールのログ</td></tr>
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
データが国外で処理されることがあります。データを販売したり、広告のために共有したりすることはありません。</p>
```
```new
データが国外で処理されることがあります。サポートチャットのメッセージは、返信する人に届くまでに、ベトナム国内にサーバーを置くメッセージサービスも通ります（メールアドレスは含みません）。その事業者の名前と受け取るデータは<a href="/en/privacy/">プライバシーポリシー（英語）</a>の第 6 節にあります。データを販売したり、広告のために共有したりすることはありません。</p>
```

Tệp: `website/src/content/ja/data-security.mjs`
```old
エラーレポートの自動送信は 1 回だけ測定しました（12 分のセッション 1 回、レポート 1 件）。
```
```new
エラーレポートの自動送信は 1 回だけ測定しました（12 分のセッション 1 回、レポート 1 件）。サポートチャットはまだプロキシで測定していません。
```

- [ ] **Step 6: Tiếng Trung**

Tệp: `website/src/content/zh/data-security.mjs`
```old
  { level: 2, id: "error-reports", text: "错误报告：应用会发送什么？" },
```
```new
  { level: 2, id: "error-reports", text: "错误报告：应用会发送什么？" },
  { level: 2, id: "support-chat", text: "客服聊天：消息去了哪里，保存多久？" },
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
  ["对话数据", "只在你的电脑上；我们的服务器上没有"],
```
```new
  ["会议数据", "只在你的电脑上；我们的服务器上没有"],
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
  ["网络", "5 个地方；都不会收到音频、转写内容或你输入的文字"],
  ["服务器保存", "邮箱（购买时）、订单、许可证、哈希处理后的设备 ID、错误报告"],
  ["保存期限", "直到你要求删除；错误报告 30 天"],
```
```new
  ["网络", "5 个地方；都不会收到音频、转写内容或你在输入翻译中输入的文字"],
  ["服务器保存", "邮箱（购买时）、订单、许可证、哈希处理后的设备 ID、错误报告、客服聊天消息"],
  ["保存期限", "直到你要求删除；错误报告 30 天；客服聊天 90 天"],
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
恰好 5 个地方，都不会收到音频、转写内容或你输入的文字。语音识别和翻译不需要网络。翻译过程中，应用只可能向我们自己的服务器发送定期请求（检查更新，以及到期时的许可证检查）。
```
```new
恰好 5 个地方，都不会收到音频、转写内容或你在输入翻译中输入的文字。语音识别和翻译不需要网络。翻译过程中，应用只可能向我们自己的服务器发送定期请求（检查更新，以及到期时的许可证检查），以及你打开“客服”页面或点击发送时的客服聊天消息。
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
<tr><th scope="row">api.aitranslator.io.vn</th><td>许可证服务器：Free 试用登记、购买、激活、停用、找回密钥、许可证检查、接收错误报告；偶尔向服务器询问时间</td><td>哈希处理后的设备 ID、设备名称、密钥；购买或找回密钥时还有你的邮箱；已去除个人数据的错误报告（只在应用没有翻译时发送）</td></tr>
```
```new
<tr><th scope="row">api.aitranslator.io.vn</th><td>许可证服务器：Free 试用登记、购买、激活、停用、找回密钥、许可证检查、接收错误报告、客服聊天；偶尔向服务器询问时间</td><td>哈希处理后的设备 ID、设备名称、密钥；购买或找回密钥时还有你的邮箱；已去除个人数据的错误报告（只在应用没有翻译时发送）；你发送的客服聊天消息，以及你保留勾选时的设备信息行和你自愿留下的邮箱（只在你使用聊天时）</td></tr>
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
但错误报告这一行例外，它适用于每台应用发送过报告的设备。
```
```new
但错误报告这一行适用于每台应用发送过报告的设备，客服聊天这一行适用于每个在聊天中发过消息的人。
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
<tr><th scope="row">错误报告：错误类型和代码、机器信息、哈希处理后的设备 ID、日志中的相关部分</th><td>发现和修复故障；30 天后自动删除（见<a href="#error-reports">错误报告</a>）</td></tr>
```
```new
<tr><th scope="row">错误报告：错误类型和代码、机器信息、哈希处理后的设备 ID、日志中的相关部分</th><td>发现和修复故障；30 天后自动删除（见<a href="#error-reports">错误报告</a>）</td></tr>
<tr><th scope="row">客服聊天：你的消息和我们的回复、来源、语言、打开聊天时所在的页面（网站）、你保留勾选时的设备信息行（应用）、你自愿留下的邮箱</th><td>回复你；最后一条消息 90 天后自动删除（见<a href="#support-chat">客服聊天</a>）</td></tr>
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
（错误报告除外，30 天后自动删除）
```
```new
（错误报告除外，30 天后自动删除；客服聊天也除外，最后一条消息 90 天后自动删除）
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
如果你只使用 Free，我们的服务器上没有你的邮箱或设备名称。
```
```new
如果你只使用 Free，除了你在客服聊天中自愿留下的邮箱，我们的服务器上没有你的邮箱或设备名称。
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
<h2 id="delete-data">如何删除我的数据？</h2>
```
```new
<h2 id="support-chat">客服聊天：消息去了哪里，保存多久？</h2>
<p>你可以通过本网站每个页面右下角的聊天按钮，或应用中的<strong>客服</strong>页面给我们发消息。消息经过我们的服务器送到 AI Translator 的运营者，回复会显示在同一个聊天窗口中。用不用聊天由你决定：如果你从未发过消息，应用不会为聊天建立任何连接。</p>
<ul>
<li><strong>服务器保存：</strong>你的消息和我们的回复、时间、来源（网站或应用）、语言、打开聊天时所在的页面（网站）、你保留勾选时的设备信息行（应用），以及你自愿留下的邮箱。不会把 IP 地址和聊天一起保存。</li>
<li><strong>设备信息（应用）：</strong>默认勾选，可以取消；只随第一条消息发送，发送前原样显示；从不包含密钥、邮箱、设备 ID 或电脑名称。</li>
<li><strong>邮箱：</strong>选填；只用于在你离开聊天后通过邮件发送回复。</li>
<li><strong>保存多久：</strong>最后一条消息 90 天后自动删除。你也可以在聊天的 ⋯ 菜单中立即删除对话；已送到回复者那里的消息副本，在你通过邮件提出要求时删除。</li>
</ul>
<p>完整内容（包括负责传送消息的服务方）见<a href="/en/privacy/">隐私政策（英文）</a>第 11 节。</p>

<h2 id="delete-data">如何删除我的数据？</h2>
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
    { title: "我们会做什么", text: "我们会删除你的邮箱和设备名称，并删除曾为该邮箱激活过密钥的机器的错误报告。你的许可证仍然可以使用，但无法再通过邮件找回。" },
```
```new
    { title: "我们会做什么", text: "我们会删除你的邮箱和设备名称，删除曾为该邮箱激活过密钥的机器的错误报告，并删除你留下该邮箱的客服聊天（包括已送到回复者那里的副本）。你的许可证仍然可以使用，但无法再通过邮件找回。" },
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
<tr><th scope="row">Cloudflare</th><td>运行许可证服务器和数据库；存储和分发模型及更新</td><td>上表中的数据，包括错误报告；会自行过期的技术日志</td></tr>
<tr><th scope="row">Resend</th><td>发送包含你密钥的邮件</td><td>你的邮箱和邮件内容（含密钥）；按 Resend 自己的政策保存的邮件日志</td></tr>
```
```new
<tr><th scope="row">Cloudflare</th><td>运行许可证服务器和数据库；存储和分发模型及更新</td><td>上表中的数据，包括错误报告和客服聊天；会自行过期的技术日志</td></tr>
<tr><th scope="row">Resend</th><td>发送包含你密钥的邮件，以及你留下邮箱时的客服聊天回复</td><td>你的邮箱和邮件内容（含密钥或聊天回复）；按 Resend 自己的政策保存的邮件日志</td></tr>
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
所以数据可能在境外处理。我们不出售你的数据，也不为广告共享数据。</p>
```
```new
所以数据可能在境外处理。客服聊天消息在送到回复者之前，还会经过一家服务器位于越南的消息服务（不含你的邮箱）；该服务方的名称和它收到的数据见<a href="/en/privacy/">隐私政策（英文）</a>第 6 节。我们不出售你的数据，也不为广告共享数据。</p>
```

Tệp: `website/src/content/zh/data-security.mjs`
```old
自动错误报告只测量了一次（一个 12 分钟的会话，一份报告）。
```
```new
自动错误报告只测量了一次（一个 12 分钟的会话，一份报告）；客服聊天还没有用代理测量。
```

- [ ] **Step 7: Tiếng Hàn**

Tệp: `website/src/content/ko/data-security.mjs`
```old
  { level: 2, id: "error-reports", text: "오류 보고서: 앱은 무엇을 보내나요?" },
```
```new
  { level: 2, id: "error-reports", text: "오류 보고서: 앱은 무엇을 보내나요?" },
  { level: 2, id: "support-chat", text: "지원 채팅: 메시지는 어디로 가고 얼마나 보관하나요?" },
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
  ["대화 데이터", "컴퓨터에만 있으며, 서버에는 없습니다"],
```
```new
  ["회의 데이터", "컴퓨터에만 있으며, 서버에는 없습니다"],
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
  ["네트워크", "5곳. 어느 곳도 오디오, 받아쓰기 내용, 입력한 텍스트를 받지 않습니다"],
  ["서버에 저장", "이메일(구매 시), 주문, 라이선스, 해시 처리한 기기 ID, 오류 보고서"],
  ["보관 기간", "삭제를 요청할 때까지. 오류 보고서는 30일"],
```
```new
  ["네트워크", "5곳. 어느 곳도 오디오, 받아쓰기 내용, 입력 번역에서 입력한 텍스트를 받지 않습니다"],
  ["서버에 저장", "이메일(구매 시), 주문, 라이선스, 해시 처리한 기기 ID, 오류 보고서, 지원 채팅 메시지"],
  ["보관 기간", "삭제를 요청할 때까지. 오류 보고서는 30일, 지원 채팅은 90일"],
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
정확히 5곳이며, 어느 곳도 오디오, 받아쓰기 내용, 입력한 텍스트를 받지 않습니다. 음성 인식과 번역에는 네트워크가 필요 없습니다. 번역하는 동안 앱이 보낼 수 있는 것은 자체 서버로 보내는 정기 요청(업데이트 확인, 그리고 때가 되었을 때의 라이선스 확인)뿐입니다.
```
```new
정확히 5곳이며, 어느 곳도 오디오, 받아쓰기 내용, 입력 번역에서 입력한 텍스트를 받지 않습니다. 음성 인식과 번역에는 네트워크가 필요 없습니다. 번역하는 동안 앱이 보낼 수 있는 것은 자체 서버로 보내는 정기 요청(업데이트 확인, 그리고 때가 되었을 때의 라이선스 확인)과, '지원' 화면을 열어 두었거나 보내기를 눌렀을 때의 지원 채팅 메시지뿐입니다.
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
<tr><th scope="row">api.aitranslator.io.vn</th><td>라이선스 서버: Free 체험 등록, 구매, 활성화, 비활성화, 키 다시 받기, 라이선스 확인, 오류 보고서 수신. 가끔 서버에 시간을 묻습니다</td><td>해시 처리한 기기 ID, 기기 이름, 키. 구매하거나 키를 다시 받을 때는 이메일도. 개인정보를 지운 오류 보고서(앱이 번역하지 않을 때만)</td></tr>
```
```new
<tr><th scope="row">api.aitranslator.io.vn</th><td>라이선스 서버: Free 체험 등록, 구매, 활성화, 비활성화, 키 다시 받기, 라이선스 확인, 오류 보고서 수신, 지원 채팅. 가끔 서버에 시간을 묻습니다</td><td>해시 처리한 기기 ID, 기기 이름, 키. 구매하거나 키를 다시 받을 때는 이메일도. 개인정보를 지운 오류 보고서(앱이 번역하지 않을 때만). 보낸 지원 채팅 메시지와, 체크를 남겨 둔 경우의 기기 정보 줄, 직접 남긴 경우의 이메일(채팅을 쓸 때만)</td></tr>
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
단, 오류 보고서 행은 앱이 보고서를 보낸 모든 기기에 해당합니다.
```
```new
단, 오류 보고서 행은 앱이 보고서를 보낸 모든 기기에, 지원 채팅 행은 채팅으로 메시지를 보낸 모든 분께 해당합니다.
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
<tr><th scope="row">오류 보고서: 오류 종류와 코드, 기기 정보, 해시 처리한 기기 ID, 관련된 로그 부분</th><td>버그 발견과 수정. 30일 뒤 자동 삭제(<a href="#error-reports">오류 보고서</a> 참고)</td></tr>
```
```new
<tr><th scope="row">오류 보고서: 오류 종류와 코드, 기기 정보, 해시 처리한 기기 ID, 관련된 로그 부분</th><td>버그 발견과 수정. 30일 뒤 자동 삭제(<a href="#error-reports">오류 보고서</a> 참고)</td></tr>
<tr><th scope="row">지원 채팅: 보낸 메시지와 답장, 출처, 언어, 채팅을 연 페이지(웹사이트), 체크를 남겨 둔 경우의 기기 정보 줄(앱), 직접 남긴 경우의 이메일</th><td>답장하기. 마지막 메시지 90일 뒤 자동 삭제(<a href="#support-chat">지원 채팅</a> 참고)</td></tr>
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
(30일 뒤 자동 삭제되는 오류 보고서 제외)
```
```new
(30일 뒤 자동 삭제되는 오류 보고서와, 마지막 메시지 90일 뒤 자동 삭제되는 지원 채팅 제외)
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
Free만 쓴다면 서버에는 이메일이나 기기 이름이 없습니다.
```
```new
Free만 쓴다면 지원 채팅에 직접 남긴 이메일을 빼면 서버에는 이메일이나 기기 이름이 없습니다.
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
<h2 id="delete-data">데이터는 어떻게 삭제하나요?</h2>
```
```new
<h2 id="support-chat">지원 채팅: 메시지는 어디로 가고 얼마나 보관하나요?</h2>
<p>이 웹사이트 모든 페이지 오른쪽 아래의 채팅 버튼이나 앱의 <strong>지원</strong> 화면에서 메시지를 보낼 수 있습니다. 메시지는 저희 서버를 거쳐 AI Translator 운영자에게 전달되고, 답장은 같은 채팅에 표시됩니다. 채팅은 원할 때만 쓰면 됩니다. 메시지를 한 번도 보내지 않았다면 앱은 채팅을 위한 연결을 하지 않습니다.</p>
<ul>
<li><strong>서버에 저장하는 것:</strong> 보낸 메시지와 답장, 시각, 출처(웹사이트 또는 앱), 언어, 채팅을 연 페이지(웹사이트), 체크를 남겨 둔 경우의 기기 정보 줄(앱), 직접 남긴 경우의 이메일. IP 주소는 채팅과 함께 저장하지 않습니다.</li>
<li><strong>기기 정보(앱):</strong> 기본으로 체크되어 있고 해제할 수 있습니다. 첫 메시지에만 붙으며 보내기 전에 그대로 표시됩니다. 키, 이메일, 기기 ID, 컴퓨터 이름은 절대 들어가지 않습니다.</li>
<li><strong>이메일:</strong> 선택입니다. 채팅을 떠난 뒤 답장을 이메일로 보내는 데만 씁니다.</li>
<li><strong>보관 기간:</strong> 마지막 메시지 90일 뒤 자동 삭제됩니다. 채팅의 ⋯ 메뉴에서 대화를 바로 삭제할 수도 있습니다. 답장하는 사람에게 전달된 메시지 사본은 이메일로 요청하시면 삭제합니다.</li>
</ul>
<p>메시지를 전달하는 곳을 포함한 전문은 <a href="/en/privacy/">개인정보 처리방침(영어)</a> 제11절에 있습니다.</p>

<h2 id="delete-data">데이터는 어떻게 삭제하나요?</h2>
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
    { title: "저희가 하는 일", text: "이메일과 기기 이름을 지우고, 그 이메일의 키를 한 번이라도 활성화한 기기의 오류 보고서를 삭제합니다. 라이선스는 계속 쓸 수 있지만, 이메일로 다시 받을 수는 없게 됩니다." },
```
```new
    { title: "저희가 하는 일", text: "이메일과 기기 이름을 지우고, 그 이메일의 키를 한 번이라도 활성화한 기기의 오류 보고서와, 그 이메일을 남긴 지원 채팅(답장하는 사람에게 전달된 사본 포함)을 삭제합니다. 라이선스는 계속 쓸 수 있지만, 이메일로 다시 받을 수는 없게 됩니다." },
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
<tr><th scope="row">Cloudflare</th><td>라이선스 서버와 데이터베이스 운영. 모델과 업데이트 저장 및 배포</td><td>위 표의 데이터(오류 보고서 포함). 스스로 만료되는 기술 로그</td></tr>
<tr><th scope="row">Resend</th><td>키가 담긴 이메일 발송</td><td>이메일 주소와 메시지(키 포함). Resend의 정책에 따른 메일 로그</td></tr>
```
```new
<tr><th scope="row">Cloudflare</th><td>라이선스 서버와 데이터베이스 운영. 모델과 업데이트 저장 및 배포</td><td>위 표의 데이터(오류 보고서와 지원 채팅 포함). 스스로 만료되는 기술 로그</td></tr>
<tr><th scope="row">Resend</th><td>키가 담긴 이메일과, 이메일을 남긴 경우 지원 채팅 답장 발송</td><td>이메일 주소와 메시지(키 또는 채팅 답장 포함). Resend의 정책에 따른 메일 로그</td></tr>
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
데이터가 해외에서 처리될 수 있습니다. 데이터를 판매하거나 광고를 위해 공유하지 않습니다.</p>
```
```new
데이터가 해외에서 처리될 수 있습니다. 지원 채팅 메시지는 답장하는 사람에게 가는 동안 베트남에 서버를 둔 메시징 서비스도 거칩니다(이메일은 포함하지 않습니다). 그곳의 이름과 받는 데이터는 <a href="/en/privacy/">개인정보 처리방침(영어)</a> 제6절에 있습니다. 데이터를 판매하거나 광고를 위해 공유하지 않습니다.</p>
```

Tệp: `website/src/content/ko/data-security.mjs`
```old
오류 보고서 자동 전송은 한 번만 측정했습니다(12분 세션 1회, 보고서 1건).
```
```new
오류 보고서 자동 전송은 한 번만 측정했습니다(12분 세션 1회, 보고서 1건). 지원 채팅은 아직 프록시로 측정하지 않았습니다.
```

- [ ] **Step 8: Chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)|^not ok'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 5. Nếu `i18n-content.test.mjs` đỏ vì "nhãn giao diện … thiếu nhãn" thì nhãn `<strong>` của bản ja/zh/ko khác chữ của app: sửa theo app (Task 0 Step 3). Đỏ vì "liên kết khác bản en" hay "id khác bản en" thì so lại khối mục mới của bản đó với bản en.

- [ ] **Step 9: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add website/src/content/vi/data-security.mjs website/src/content/en/data-security.mjs website/src/content/ja/data-security.mjs website/src/content/zh/data-security.mjs website/src/content/ko/data-security.mjs website/test/site.test.mjs && git commit -m "feat(website): Dữ liệu và bảo mật năm ngôn ngữ có mục Chat hỗ trợ, chat trong kết nối, máy chủ, bên xử lý" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Trang chủ và Hỏi đáp, năm ngôn ngữ (câu "máy chủ chỉ lưu …")

**Files:**
- Modify: `website/src/content/{vi,en,ja,zh,ko}/home.mjs`, `website/src/content/{vi,en,ja,zh,ko}/faq.mjs`
- Test: `website/test/site.test.mjs`

- [ ] **Step 1: Thêm test (cuối file)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

test("Trang chủ và Hỏi đáp (năm ngôn ngữ): câu liệt kê dữ liệu máy chủ lưu có tin nhắn chat hỗ trợ giữ 90 ngày", () => {
  const need = {
    "/": ["tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày)", "không có nội dung cuộc họp"],
    "/en/": ["support chat messages if you use the chat (kept for 90 days)", "never meeting content"],
    "/ja/": ["サポートチャットのメッセージ（90 日間保存）", "会議の内容は一切保存しません"],
    "/zh/": ["聊天消息（保存 90 天）", "从不保存会议内容"],
    "/ko/": ["지원 채팅 메시지(90일 보관)", "회의 내용은 절대 저장하지 않습니다"],
    "/cau-hoi-thuong-gap/": ["tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày)"],
    "/en/faq/": ["support chat messages if you use the chat (kept for 90 days)"],
    "/ja/faq/": ["サポートチャットのメッセージ（90 日間保存）"],
    "/zh/faq/": ["聊天消息（保存 90 天）"],
    "/ko/faq/": ["지원 채팅 메시지(90일 보관)"],
  };
  const errors = Object.entries(need).flatMap(([p, needles]) => needsIn(p, textOf(htmlByPath.get(p) ?? ""), needles));
  assert.deepEqual(errors, []);
});
EOF
```

- [ ] **Step 2: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'Trang chủ và Hỏi đáp \(năm ngôn ngữ\)' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
```
Expected: `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`.

- [ ] **Step 3: Trang chủ**

Tệp: `website/src/content/vi/home.mjs`
```old
  modified: "2026-10-21",
```
```new
  modified: "2026-10-22",
```

Tệp: `website/src/content/vi/home.mjs`
```old
nhật ký thay đổi license và báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày), không có dữ liệu cuộc hội thoại.
```
```new
nhật ký thay đổi license, báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), không có nội dung cuộc họp.
```

Tệp: `website/src/content/en/home.mjs`
```old
  modified: "2026-10-21",
```
```new
  modified: "2026-10-22",
```

Tệp: `website/src/content/en/home.mjs`
```old
a log of license changes and error reports with personal data scrubbed out (kept for 30 days), never conversation data.
```
```new
a log of license changes, error reports with personal data scrubbed out (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), never meeting content.
```

Tệp: `website/src/content/ja/home.mjs`
```old
ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）だけで、会話のデータは一切保存しません。
```
```new
ライセンス変更の記録、個人情報を除いたエラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、会議の内容は一切保存しません。
```

Tệp: `website/src/content/zh/home.mjs`
```old
许可证变更记录，以及去除了个人数据的错误报告（保存 30 天），从不保存对话数据。
```
```new
许可证变更记录、去除了个人数据的错误报告（保存 30 天），以及你使用客服聊天时的聊天消息（保存 90 天），从不保存会议内容。
```

Tệp: `website/src/content/ko/home.mjs`
```old
라이선스 변경 기록, 개인 정보를 지운 오류 보고서(30일 보관)만 저장하며, 대화 데이터는 절대 저장하지 않습니다.
```
```new
라이선스 변경 기록, 개인 정보를 지운 오류 보고서(30일 보관), 채팅을 쓴 경우의 지원 채팅 메시지(90일 보관)만 저장하며, 회의 내용은 절대 저장하지 않습니다.
```

- [ ] **Step 4: Hỏi đáp, câu "Có quảng cáo hay thu thập dữ liệu không?"**

Tệp: `website/src/content/vi/faq.mjs`
```old
Máy chủ chỉ lưu email (khi bạn mua), đơn hàng, license, mã băm ID máy, tên máy (khi bạn kích hoạt key), mốc dùng thử Free, nhật ký thay đổi license và các báo cáo lỗi (giữ 30 ngày), để cấp key, bảo đảm mỗi key một máy, mỗi máy dùng thử một lần và sửa lỗi.
```
```new
Máy chủ chỉ lưu email (khi bạn mua, hay khi bạn tự để lại trong chat hỗ trợ), đơn hàng, license, mã băm ID máy, tên máy (khi bạn kích hoạt key), mốc dùng thử Free, nhật ký thay đổi license, các báo cáo lỗi (giữ 30 ngày) và tin nhắn chat hỗ trợ khi bạn dùng chat (giữ 90 ngày), để cấp key, bảo đảm mỗi key một máy, mỗi máy dùng thử một lần, sửa lỗi và trả lời bạn.
```

Tệp: `website/src/content/vi/faq.mjs`
```old
  modified: "2026-10-15",
```
```new
  modified: "2026-10-22",
```

Tệp: `website/src/content/en/faq.mjs`
```old
Our servers store only your email (when you buy), orders, licenses, a hashed machine ID, the device name (when you activate a key), the Free trial dates, a license change log and error reports (kept for 30 days), so we can issue keys, keep to one device per key and one trial per device, and fix bugs.
```
```new
Our servers store only your email (when you buy, or when you choose to leave it in the support chat), orders, licenses, a hashed machine ID, the device name (when you activate a key), the Free trial dates, a license change log, error reports (kept for 30 days) and support chat messages if you use the chat (kept for 90 days), so we can issue keys, keep to one device per key and one trial per device, fix bugs and reply to you.
```

Tệp: `website/src/content/en/faq.mjs`
```old
  modified: "2026-10-15",
```
```new
  modified: "2026-10-22",
```

Tệp: `website/src/content/ja/faq.mjs`
```old
サーバーに保存するのは、メールアドレス（購入時）、注文、ライセンス、ハッシュ化したマシン ID、デバイス名（キーを有効にしたとき）、Free お試しの日付、ライセンス変更の記録、エラーレポート（30 日間保存）だけで、キーの発行、1 つのキーにつき 1 台、1 台につき 1 回のお試しの維持、不具合の修正のために使います。
```
```new
サーバーに保存するのは、メールアドレス（購入時、またはサポートチャットにご自身で残したとき）、注文、ライセンス、ハッシュ化したマシン ID、デバイス名（キーを有効にしたとき）、Free お試しの日付、ライセンス変更の記録、エラーレポート（30 日間保存）、チャットを使った場合のサポートチャットのメッセージ（90 日間保存）だけで、キーの発行、1 つのキーにつき 1 台、1 台につき 1 回のお試しの維持、不具合の修正、お問い合わせへの返信のために使います。
```

Tệp: `website/src/content/zh/faq.mjs`
```old
我们的服务器只保存你的邮箱（购买时）、订单、许可证、经过哈希处理的设备 ID、设备名称（激活密钥时）、Free 试用的日期、许可证变更记录和错误报告（保存 30 天），用于发放密钥、保证一个密钥一台设备和每台设备一次试用，以及修复错误。
```
```new
我们的服务器只保存你的邮箱（购买时，或你在客服聊天中自愿留下时）、订单、许可证、经过哈希处理的设备 ID、设备名称（激活密钥时）、Free 试用的日期、许可证变更记录、错误报告（保存 30 天）和你使用客服聊天时的聊天消息（保存 90 天），用于发放密钥、保证一个密钥一台设备和每台设备一次试用、修复错误以及回复你。
```

Tệp: `website/src/content/ko/faq.mjs`
```old
서버에는 이메일(구매 시), 주문, 라이선스, 해시 처리한 기기 ID, 기기 이름(키를 활성화할 때), Free 체험 날짜, 라이선스 변경 기록, 오류 보고서(30일 보관)만 저장하며, 키를 발급하고, 키 하나에 기기 한 대와 기기 한 대에 체험 한 번을 지키고, 버그를 고치는 데 씁니다.
```
```new
서버에는 이메일(구매 시, 또는 지원 채팅에 직접 남겼을 때), 주문, 라이선스, 해시 처리한 기기 ID, 기기 이름(키를 활성화할 때), Free 체험 날짜, 라이선스 변경 기록, 오류 보고서(30일 보관), 채팅을 쓴 경우의 지원 채팅 메시지(90일 보관)만 저장하며, 키를 발급하고, 키 하나에 기기 한 대와 기기 한 대에 체험 한 번을 지키고, 버그를 고치고, 문의에 답하는 데 씁니다.
```

- [ ] **Step 5: Chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)|^not ok'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 6.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add website/src/content/vi/home.mjs website/src/content/en/home.mjs website/src/content/ja/home.mjs website/src/content/zh/home.mjs website/src/content/ko/home.mjs website/src/content/vi/faq.mjs website/src/content/en/faq.mjs website/src/content/ja/faq.mjs website/src/content/zh/faq.mjs website/src/content/ko/faq.mjs website/test/site.test.mjs && git commit -m "feat(website): Trang chủ và Hỏi đáp năm ngôn ngữ nêu tin nhắn chat hỗ trợ trong dữ liệu máy chủ lưu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Test chặn "Zalo Bot" ngoài trang chính sách; quy tắc trong `website/README.md`

**Files:**
- Modify: `website/test/site.test.mjs`, `website/README.md`

- [ ] **Step 1: Thêm test (cuối file)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && cat >> website/test/site.test.mjs <<'EOF'

// Kênh chuyển tin của chat hỗ trợ là kiến trúc nội bộ (website/README.md, "Không công bố công nghệ lõi"): chỉ Chính sách quyền riêng tư
// được nêu bên xử lý, vì luật buộc. Chữ "Zalo" đứng riêng vẫn được (tên app chat ở hướng dẫn Gõ dịch).
const SUPPORT_INTERNAL = /zalo\s*bot|zaloplatforms/i;
const POLICY_PAGES = ["/chinh-sach-quyen-rieng-tu/", "/en/privacy/"];
/** Các chỗ trong `sources` (Map nơi → chữ) nhắc kênh nội bộ của chat. Hàm thuần: ca âm cố định ở test dưới. */
const supportInternalHits = (sources) =>
  [...sources].flatMap(([where, text]) => {
    const m = SUPPORT_INTERNAL.exec(text);
    return m ? [`${where}: “${m[0]}” …${text.slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, " ")}…`] : [];
  });

test("chat hỗ trợ: ngoài hai trang Chính sách quyền riêng tư, không nguồn chữ nào của site và không file chữ nào của dist nhắc \"Zalo Bot\" hay \"zaloplatforms\"", async () => {
  const fake = new Map([["a", "Tin đi qua Zalo Bot"], ["b", "https://bot-api.ZaloPlatforms.com/bot123/sendMessage"], ["c", "zalobot"], ["d", "Messenger, Slack, Zalo, khung chat của Zoom"]]);
  assert.deepEqual(supportInternalHits(fake).map((h) => h.split(":")[0]), ["a", "b", "c"]);
  const sources = await siteTexts();
  for (const p of pages) sources.set(`${p.path} [html]`, htmlByPath.get(p.path));
  for (const key of [...sources.keys()]) if (POLICY_PAGES.some((p) => key === p || key.startsWith(`${p} [`))) sources.delete(key);
  // Mọi file chữ khác của dist (JS và CSS của khung chat, _headers, sitemap, llms…), trừ HTML của hai trang chính sách.
  const skip = new Set(POLICY_PAGES.map((p) => path.join(DIST, p, "index.html")));
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) await walk(f);
      else if ((/\.(?:html|m?js|css|txt|xml|json|webmanifest)$/.test(e.name) || e.name === "_headers" || e.name === "_redirects") && !skip.has(f)) sources.set(path.relative(DIST, f), await readFile(f, "utf8"));
    }
  };
  await walk(DIST);
  assert.ok(sources.has("_headers") && sources.has("sitemap.xml"), "bộ quét không đọc được dist");
  assert.deepEqual(supportInternalHits(sources), []);
});
EOF
```

- [ ] **Step 2: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'Zalo Bot' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)'
```
Expected: `ℹ tests 1`, `ℹ pass 1`, `ℹ fail 0`. Test này là hàng rào cho sau này (nội dung hiện tại không nhắc hai cụm), nên không có bước đỏ; ca âm trong test chứng minh hàm bắt đúng. Nếu đỏ ở phần quét thật: đọc dòng báo (file nào), bỏ cụm đó khỏi file (thường là file JS của khung chat do kế hoạch 02 viết), không nới luật.

- [ ] **Step 3: Quy tắc trong `website/README.md`**

Tệp: `website/README.md`
```old
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật
```
```new
- **Chat hỗ trợ** (spec `2026-10-22-chat-ho-tro-zalo-design.md`): website có bong bóng chat ở góc dưới bên phải mọi trang (kế hoạch `2026-10-22-chat-ho-tro-02-website.md`), app có màn hình Hỗ trợ. Trang Liên hệ nói hai kênh, email và chat; **không** nói "email là kênh hỗ trợ duy nhất" hay "website không có form": luật `STALE_SUPPORT` trong `test/site.test.mjs` chặn các câu đó ở năm ngôn ngữ (gặp cách nói cũ mới thì thêm vào `STALE_SUPPORT_MUST_CATCH`, câu đúng bị bắt thừa thì thêm vào `STALE_SUPPORT_MUST_KEEP`). Tin nhắn lưu 90 ngày; Dữ liệu và bảo mật có mục Chat hỗ trợ. **Không nêu tên kênh chuyển tin hay host API của nó ở trang thường** (kiến trúc nội bộ); chỉ Chính sách quyền riêng tư (sinh từ `docs/legal`) nêu bên xử lý vì luật buộc. Test `chat hỗ trợ: ngoài hai trang Chính sách…` chặn "Zalo Bot" và "zaloplatforms" ở mọi file chữ của `dist/` trừ hai trang đó; chữ "Zalo" đứng riêng vẫn được (tên app chat ở hướng dẫn Gõ dịch, và câu nhãn hiệu ở chân trang chung), còn thân trang Dữ liệu và bảo mật thì không được nêu "Zalo" (test của trang đó). Đổi hành vi chat (thời gian lưu, dữ liệu gửi đi, nhịp kết nối) thì sửa chính sách mục 4, 5, 6, 7, 11 (`docs/legal/privacy.{vi,en}.md`) và, ở năm ngôn ngữ, Liên hệ, Dữ liệu và bảo mật, Trang chủ (khối "Giảm rủi ro lộ thông tin") và Hỏi đáp (câu "Có quảng cáo hay thu thập dữ liệu không?").
- Ảnh chụp giao diện app (`src/assets/img/app/`) chụp bằng giao diện thật
```

- [ ] **Step 4: Ngoại lệ deploy (bỏ qua nếu kế hoạch 02 đã thêm)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -c 'Ngoại lệ, đợt chat hỗ trợ' website/README.md
```
Expected: `0` thì làm sửa dưới; `1` thì kế hoạch 02 đã thêm: đọc đoạn đó, bảo đảm nó nói cả nội dung của kế hoạch này (trang Liên hệ, Dữ liệu và bảo mật, chính sách mục 11); thiếu thì thêm nửa câu tương ứng vào đoạn đó, rồi bỏ qua sửa dưới.

Tệp: `website/README.md`
```old
Website là bước sau cùng của mục 9 (bước 11), chỉ khi bản app có Creem đã đăng và Creem đang bán thật; đọc mục 9 trước khi deploy bất cứ thứ gì sau khi gộp.
```
```new
Website là bước sau cùng của mục 9 (bước 11), chỉ khi bản app có Creem đã đăng và Creem đang bán thật; đọc mục 9 trước khi deploy bất cứ thứ gì sau khi gộp.
- **Ngoại lệ, đợt chat hỗ trợ: từ lúc nội dung chat vào `main` (bong bóng, trang Liên hệ, Dữ liệu và bảo mật, chính sách mục 11) cho tới bước deploy website của `docs/release/phat-hanh.md` mục 11, KHÔNG `pnpm deploy`.** Trong khoảng đó `main` mang trang nói có chat và chính sách có mục Chat hỗ trợ (dòng phiên bản còn 1.4) trong khi server có thể chưa có `/v1/support/*` và app chưa có màn hình Hỗ trợ. Website đi sau khi app 0.2.4 đã lên R2.
```

- [ ] **Step 5: Chạy toàn bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 7.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add website/test/site.test.mjs website/README.md && git commit -m "test(website): chặn Zalo Bot và zaloplatforms ngoài trang chính sách; quy tắc chat hỗ trợ và ngoại lệ deploy trong README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `docs/legal/README.md`

**Files:**
- Modify: `docs/legal/README.md`

Các chỗ có **ngày hiệu lực mới** của chính sách 1.5 (dòng đầu và dòng "Mặc định đã chọn") do Task 10 đặt bằng lệnh; Task này không ghi ngày mới.

- [ ] **Step 1: Đoạn "Chính sách 1.5 thêm chat hỗ trợ"**

Tệp: `docs/legal/README.md`
```old
> **Chưa được luật sư hay kế toán xem.**
```
```new
**Chính sách 1.5 thêm chat hỗ trợ** theo spec `2026-10-22-chat-ho-tro-zalo-design.md` (mục 0, 2 và 5): khách chat trên website (bong bóng ở mọi trang) và trong app (màn hình Hỗ trợ); tin đi qua `api.aitranslator.io.vn` (D1) tới Zalo cá nhân của người vận hành qua Zalo Bot, câu trả lời đi ngược lại qua webhook (chính sách mục 11; tóm tắt ở mục 2, kết nối mạng ở mục 4, dữ liệu máy chủ ở mục 5, bên xử lý ở mục 6, thời gian lưu và yêu cầu xóa ở mục 7). Cuộc chat tự xóa sau 90 ngày kể từ tin cuối, khách tự xóa được; email không bắt buộc, chỉ để gửi câu trả lời qua Resend, **không bao giờ gửi sang Zalo**; IP chỉ ở dạng băm trong bộ đếm giới hạn tần suất; máy chủ chỉ lưu mã băm của token. Bản sao tin đã chuyển vào Zalo **không** tự xóa: chính sách nói thẳng điều này và hứa người vận hành xóa khi khách yêu cầu. Bên xử lý mới: Zalo (Công ty Cổ phần VNG, máy chủ ở Việt Nam), nên không thêm việc chuyển dữ liệu ra nước ngoài; thư trả lời đi qua Resend (ngoài Việt Nam) như thư chứa key. **EULA không đổi** (giữ bản 1.3): EULA không nói về kênh hỗ trợ hay danh sách kết nối và không dẫn số mục nào của chính sách. Mục "Chat hỗ trợ" là mục 11, nên "Thay đổi chính sách" và "Liên hệ" thành mục 12 và 13; mục 1 đến 10 giữ số. Ngày hiệu lực của chính sách 1.5 đặt theo mục "Đổi ngày hiệu lực" lúc phát hành bản app có chat (0.2.4). Website (trang Liên hệ, Dữ liệu và bảo mật, Trang chủ, Hỏi đáp) nói cùng các điều đó nhưng không nêu tên Zalo (spec mục 5).

> **Chưa được luật sư hay kế toán xem.**
```

- [ ] **Step 2: "Thông tin đã chốt" và bên xử lý**

Tệp: `docs/legal/README.md`
```old
- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07):
```
```new
- **Chat hỗ trợ giữ 90 ngày** kể từ tin cuối rồi tự xóa (spec 2026-10-22-chat-ho-tro-zalo-design §0, §2.6); khách tự xóa bằng nút trong khung chat. Bản đã chuyển vào Zalo của người vận hành không tự xóa: chỉ xóa khi khách yêu cầu (chính sách mục 7 và 11; lệnh D1 xóa theo email ở `docs/release/phat-hanh.md` mục 11).
- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07):
```

Tệp: `docs/legal/README.md`
```old
- Bên xử lý dữ liệu: PayOS (Việt Nam); Cloudflare, Resend (ngoài Việt Nam); Creem (Armitage Labs OÜ, Estonia; điều khoản người bán của Creem, mục 2.1.5).
```
```new
- Bên xử lý dữ liệu: PayOS (Việt Nam); Cloudflare, Resend (ngoài Việt Nam); Creem (Armitage Labs OÜ, Estonia; điều khoản người bán của Creem, mục 2.1.5); Zalo (Công ty Cổ phần VNG, máy chủ ở Việt Nam; chỉ cho chat hỗ trợ, từ chính sách 1.5).
```

- [ ] **Step 3: Số mục "Thay đổi chính sách" trong câu hỏi cũ, và câu hỏi mới cho luật sư**

Tệp: `docs/legal/README.md`
```old
chính sách mục 11 nói thông báo
```
```new
chính sách mục 12 (mục 11 ở bản 1.3 và 1.4) nói thông báo
```

Tệp: `docs/legal/README.md`
```old
(chính sách không hứa "không có dữ liệu cá nhân nào ngoài mã băm ID máy").
```
```new
(chính sách không hứa "không có dữ liệu cá nhân nào ngoài mã băm ID máy").
- **Vai trò của Zalo (VNG) với nội dung chat.** Chính sách 1.5 đặt Zalo trong bảng bên xử lý, nhưng tin tới tài khoản Zalo cá nhân của người vận hành dưới dạng cuộc trò chuyện với một bot, theo điều khoản sử dụng Zalo Bot Platform (điều khoản cho VNG quyền tạm ngưng tài khoản bot), không có thỏa thuận xử lý dữ liệu riêng. Hỏi: VNG là bên xử lý hay bên kiểm soát độc lập với nội dung chat; có cần thỏa thuận xử lý dữ liệu không; chính sách có phải gọi khác đi không.
- **Bản sao trong Zalo không tự xóa.** Cuộc chat tự xóa sau 90 ngày và khách tự xóa được, nhưng bản đã chuyển vào Zalo còn trong lịch sử trò chuyện của người vận hành và trên hệ thống của Zalo. Chính sách nói thẳng điều này và hứa xóa bản đó khi khách yêu cầu (mục 7, 11); khung chat chỉ ghi "Tin nhắn được lưu 90 ngày". Hỏi: cách nói này có đủ không, khung chat có phải nói rõ hơn không, và nghĩa vụ xóa phía Zalo tới đâu.
- **Cơ sở xử lý khi khách chat.** Khách gõ và gửi tin mà không qua ô đồng ý riêng; chân khung chat dẫn tới chính sách. Ô gửi kèm thông tin máy trong app được tích sẵn. Mục 6 viết "gửi tin ở chat hỗ trợ, bạn đồng ý với việc này" (dữ liệu nằm trên Cloudflare, thư trả lời qua Resend, đều ngoài Việt Nam). Hỏi: việc khách chủ động gửi tin có đủ làm cơ sở (đồng ý, hay thực hiện yêu cầu của chính khách) không; ô tích sẵn có ổn không; câu đồng ý ở mục 6 có hợp lệ không.
- **Khách trên website chưa từng đồng ý chính sách.** Chính sách viết cho người dùng app (đồng ý ở onboarding); khách chat trên website chỉ thấy liên kết "Quyền riêng tư" ở chân khung chat, và mục 1 của chính sách chỉ nói về "ứng dụng". Hỏi: có cần thông báo hay đồng ý khác cho khách website không, và mục 1 có phải nói rõ chính sách áp cả cho website không.
```

- [ ] **Step 4: "Đã đối chiếu", "Cài vào sản phẩm", "Đổi ngày hiệu lực"**

Tệp: `docs/legal/README.md`
```old
**Chưa đối chiếu:** Buyer Terms của Creem
```
```new
**Chat hỗ trợ, chưa đối chiếu hết:** chính sách mục 4, 5, 6 và 11 viết theo spec `2026-10-22-chat-ho-tro-zalo-design.md` và hợp đồng của kế hoạch 00. A7 **chưa đo lại** với chat (spec mục 6, "A7 bằng proxy": chưa dùng chat thì 0 kết nối mới, đang dịch mà màn hình Hỗ trợ đóng thì không có request chat); trang Dữ liệu và bảo mật ghi thẳng là chưa đo. "Máy chủ của Zalo ở Việt Nam" lấy theo spec, chưa có văn bản của VNG lưu trong repo. Thân webhook Zalo thật đối chiếu ở bước 0 của kế hoạch 01 (`bench/2026-10-22-chat-ho-tro/`). Lệch thì sửa chính sách mục 4, 6, 11 và trang Dữ liệu và bảo mật.

**Chưa đối chiếu:** Buyer Terms của Creem
```

Tệp: `docs/legal/README.md`
```old
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```
```new
- **Đã làm (chat hỗ trợ, spec `2026-10-22-chat-ho-tro-zalo-design.md`):** chính sách mục 11 và các mục 2, 4, 5, 6, 7 nhắc tới chat; website (năm ngôn ngữ) sửa trang Liên hệ (chat cạnh email, bỏ "kênh duy nhất", "không có form"), có mục Chat hỗ trợ ở Dữ liệu và bảo mật, sửa câu "máy chủ chỉ lưu" ở Trang chủ và Hỏi đáp, kèm test `STALE_SUPPORT` và test chặn "Zalo Bot", "zaloplatforms" ngoài hai trang chính sách; khung chat (website và app) có chân "Tin nhắn được lưu 90 ngày · Quyền riêng tư" dẫn tới chính sách.
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```

Tệp: `docs/legal/README.md`
```old
Với chính sách 1.3, lệnh đặt ngày ở kế hoạch `2026-10-17-bao-cao-loi-05-phap-ly-website.md`, Task 8.
```
```new
Với chính sách 1.3, lệnh đặt ngày ở kế hoạch `2026-10-17-bao-cao-loi-05-phap-ly-website.md`, Task 8. Với chính sách 1.5, ở kế hoạch `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`, Task 10.
```

- [ ] **Step 5: Kiểm và commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -c 'chat hỗ trợ\|Chat hỗ trợ' docs/legal/README.md && grep -c 'chính sách quyền riêng tư phiên bản 1.4 (hiệu lực từ 2026-10-18)' docs/legal/README.md && git branch --show-current && git add docs/legal/README.md && git commit -m "docs(legal): README pháp lý theo chính sách 1.5 (chat hỗ trợ), bên xử lý Zalo, câu hỏi cho luật sư" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected: số dòng nhắc chat ≥ 6; `1` (dòng đầu vẫn ghi 1.4 cho tới Task 10); commit thành công.

---

### Task 8: Runbook phát hành, mục 11 từ bước 10

**Files:**
- Modify: `docs/release/phat-hanh.md`

Kế hoạch 01 đã viết mục `## 11. Đợt thêm chat hỗ trợ (migration D1 0005)` với đoạn mở đầu, "Điều kiện trước khi bắt đầu" và các bước server 1–9 (tạo Zalo Bot, `getUpdates`, ba secret, migration 0005, deploy và kiểm cron, `setWebhook`, thử hai chiều rồi nhắn `/tat`), kết thúc bằng dòng giữ chỗ. Task này thay dòng giữ chỗ bằng bước 10–14, cách xóa cuộc chat theo yêu cầu, và đường lui. Không viết lại phần cài đặt bot của kế hoạch 01. Đây là tài liệu cho chủ dự án tự chạy: kế hoạch này không chạy lệnh nào ghi vào production. Các lệnh chạy trong `server/`; `PROD` như mục 4.

- [ ] **Step 1: Thay dòng giữ chỗ**

Tệp: `docs/release/phat-hanh.md`
````old
<!-- kế hoạch 04: các bước app, website, bật chat và thử tay -->
````
````new
10. **Đặt ngày hiệu lực chính sách 1.5** theo kế hoạch `2026-10-22-chat-ho-tro-04-phap-ly-noi-dung.md`, Task 10 (`docs/legal/README.md`, "Đổi ngày hiệu lực"), **vào ngày phát hành, trước khi nâng phiên bản và build app**: app đóng gói chính sách lúc build. Lệnh lấy ngày hôm nay theo giờ Việt Nam; website (bước 12) không được deploy sớm hơn ngày đó.

    ```bash
    grep -n '^\*\*Phiên bản\|^\*\*Version' ../docs/legal/privacy.vi.md ../docs/legal/privacy.en.md
    ```

    Expected: hai dòng phiên bản `1.5` cùng một ngày (vi dạng `dd/mm/yyyy`, en dạng `d Month yyyy`).

11. **Phát hành app 0.2.4** theo mục 2 (nâng phiên bản ở đó; mỗi lần một tag). Chat vẫn tắt từ bước 9: màn hình Hỗ trợ của bản mới hiện "Chat đang tạm tắt…" kèm email support@ cho tới bước 13, đó là đúng. Kiểm R2 như mục 2 bước 5 (`latest.json` của kênh stable ra `0.2.4`, SHA-256 khớp). Job đăng R2 đỏ vì không phân giải được `*.io.vn` thì chạy `dig @8.8.8.8 releases.aitranslator.io.vn` trước khi chạy lại (sự cố DNSSEC của vùng io.vn ngày 2026-10-22).

12. **Deploy website** sau khi 0.2.4 đã lên R2. Nếu A7 có chat đã đo (spec mục 6, "A7 bằng proxy") thì trước khi deploy sửa câu "chat hỗ trợ chưa được đo bằng proxy" trong callout "Giới hạn của phép đo" của trang Dữ liệu và bảo mật (`website/src/content/{vi,en,ja,zh,ko}/data-security.mjs`) và đoạn "Chat hỗ trợ, chưa đối chiếu hết" của `docs/legal/README.md` cho khớp số đo (ngày, máy, bản dựng), rồi commit.

    ```bash
    curl -s https://releases.aitranslator.io.vn/stable/latest.json | grep -o '"version":"[^"]*"'
    cd ../website && pnpm test 2>&1 | grep -E 'ℹ (pass|fail)' && pnpm deploy
    curl -sI https://aitranslator.io.vn/ | grep -i '^content-security-policy' | grep -o "connect-src[^;]*"
    curl -s https://aitranslator.io.vn/chinh-sach-quyen-rieng-tu/ | grep -o 'Phiên bản 1\.5[^<]*' | head -1
    curl -s https://aitranslator.io.vn/lien-he/ | grep -c 'kênh hỗ trợ duy nhất'
    ```

    Expected: `"version":"0.2.4"`; `ℹ fail 0` rồi deploy xong (lệnh `pnpm deploy` tự dừng nếu R2 cao hơn repo); `connect-src 'self' https://api.aitranslator.io.vn`; `Phiên bản 1.5, hiệu lực từ <ngày ở bước 10>`; `0`. Mở `https://aitranslator.io.vn/` trong trình duyệt: bong bóng ở góc dưới phải; bấm vào thấy khung chat với dòng "Chat đang tạm tắt…" (chat còn tắt). Các lệnh sau chạy lại trong `server/` (`cd ../server`).

13. **Bật chat.** Chủ dự án nhắn `/bat` cho bot trong Zalo.

    ```bash
    curl -s "$PROD/v1/support/status"; echo
    ```

    Expected: bot trả lời xác nhận chat đã bật; lệnh in `{"enabled":true}`.

14. **Thử tay** (spec mục 6, "Thử tay sau deploy"), bằng trình duyệt thường và app 0.2.4 vừa phát hành:
    a. **Website:** mở bong bóng ở `https://aitranslator.io.vn/lien-he/`, gửi một tin. Zalo nhận dòng `🆕 #XXX · web · vi · /lien-he/` và nội dung tin. Trả lời trong Zalo **không ghi mã** (chỉ một cuộc chat nhắn trong 30 phút): bot báo "✓ đã gửi tới #XXX", câu trả lời hiện trong khung chat trong vài giây. Đóng khung, trả lời thêm một tin: trong khoảng một phút bong bóng hiện chấm đỏ.
    b. **App:** mục Hỗ trợ, để tích "Gửi kèm thông tin máy", gửi một tin. Zalo nhận dòng `🆕 #YYY · app · …` có phiên bản 0.2.4, hệ điều hành, chip, RAM, gói, gói model; **không có** key, email, mã máy, tên máy. Trả lời **có mã** (`#YYY nội dung`): câu trả lời hiện trong app. Bấm đính kèm log: Zalo nhận `#YYY 📎 Mã báo cáo log: R-…`, và tìm được báo cáo đó ở Web Admin › Báo cáo lỗi.
    c. **Hai cuộc chat cùng lúc:** nhắn ở cả website và app trong 30 phút, rồi trả lời không ghi mã: bot báo "⚠️ Có 2 cuộc chat vừa nhắn trong 30 phút qua (#…, #…)…" và không gửi cho ai.
    d. **Email khi rời trang:** ở website, để lại email ở thẻ email, đóng tab. Zalo nhận `#XXX ✉️ khách đã để lại email` **không kèm địa chỉ**. Trả lời trong Zalo; trong khoảng 2–7 phút (tin phải cũ hơn 2 phút, cron 5 phút) thư tới hộp thư đó, song ngữ vi/en, `Reply-To: support@aitranslator.io.vn`.
    e. **Tắt, bật:** nhắn `/tat`; website và app hiện "Chat đang tạm tắt. Hãy gửi email tới support@aitranslator.io.vn", lịch sử cũ vẫn hiện; nhắn `/bat` lại.
    f. **Xóa:** ở website, menu ⋯ › Xóa cuộc trò chuyện. Bot báo "🗑 khách đã xóa cuộc chat"; kiểm D1 (thay `XXX` bằng mã thật):

       ```bash
       pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS n FROM support_conversations WHERE code = 'XXX'"
       ```

       Expected: `n` bằng `0`.
    g. **Dọn:** xóa các cuộc chat thử còn lại bằng nút xóa trong khung chat (website và app); xóa tay các tin thử trong cuộc trò chuyện với bot ở Zalo nếu muốn.

**Xóa cuộc chat theo yêu cầu của khách** (chính sách mục 7 và 11). Khách tự xóa được trong khung chat; khi khách yêu cầu qua email, người vận hành chạy các lệnh dưới (tên bảng và cột theo `server/migrations/0005_support_chat.sql`; khác thì sửa lệnh trước khi chạy), rồi xóa tay các tin tương ứng (tìm theo mã `#…` của từng cuộc chat) trong cuộc trò chuyện với bot ở Zalo. Cuộc chat không có email thì tìm theo thời điểm và nội dung khách tả (`SELECT id, code, datetime(last_activity_at, 'unixepoch') FROM support_conversations ORDER BY last_activity_at DESC LIMIT 20`), rồi xóa theo `id` bằng hai lệnh `DELETE` tương tự.

```bash
E='email-cua-khach@example.com'   # email khách đã để lại, chữ thường
pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT id, code, source, datetime(last_activity_at, 'unixepoch') AS last FROM support_conversations WHERE email = '$E'"
pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM support_messages WHERE conversation_id IN (SELECT id FROM support_conversations WHERE email = '$E')"
pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM support_conversations WHERE email = '$E'"
```

Expected: câu đầu liệt kê các cuộc chat (ghi lại mã để xóa trong Zalo); hai câu sau báo số dòng đã xóa; chạy lại câu đầu thì không còn dòng nào.

**Đường lui.**
- **Tắt chat ngay, không deploy:** nhắn `/tat` cho bot. Website và app thay ô nhập bằng email support@; tin cũ vẫn hiện; app 0.2.4 không cần rút. Bot không nhận lệnh (Zalo lỗi, webhook hỏng) thì đặt thẳng trong D1. Chạy `pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT * FROM support_settings"` trước để thấy tên cột thật (spec §2.1 gọi là khóa và giá trị; migration 0005 của kế hoạch 01 đặt tên `key`, `value` thì dùng nguyên lệnh dưới, tên khác thì đổi tên cột trong lệnh), rồi `pnpm exec wrangler d1 execute mt-license-production --remote --command "UPDATE support_settings SET value = '0' WHERE key = 'enabled'"`; chạy lại câu `SELECT` thấy `enabled` là `0`.
- **Worker lỗi:** `pnpm exec wrangler rollback` về bản trước đợt này: các đường `/v1/support/*` và `/v1/webhooks/zalo` biến mất, khung chat báo không gửi được, trang Liên hệ và chính sách vẫn nêu email. Kiểm cron còn chạy như mục 4 bước 9 (không thấy cron thì `pnpm exec wrangler triggers deploy`; sự cố 2026-10-07).
- **Dữ liệu:** migration 0005 chỉ **thêm** bảng, không đổi bảng cũ, nên Worker cũ chạy đúng trên schema mới; không cần lùi migration hay Time Travel. Xóa toàn bộ dữ liệu chat nếu cần: `DELETE FROM support_messages` rồi `DELETE FROM support_conversations` (hai lệnh `wrangler d1 execute --remote --command`, bảng tin trước).
- **Nội dung website:** nếu chat bị bỏ lâu dài thì phải sửa lại trang Liên hệ, Dữ liệu và bảo mật, Trang chủ, Hỏi đáp và chính sách (bản mới, ngày hiệu lực mới); `/tat` không đổi chữ trên website.
````

- [ ] **Step 2: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -c 'kế hoạch 04: các bước app, website, bật chat và thử tay' docs/release/phat-hanh.md; grep -c '^1[0-4]\. \*\*' docs/release/phat-hanh.md; grep -c '^\*\*Xóa cuộc chat theo yêu cầu của khách\*\*' docs/release/phat-hanh.md; tail -c1 docs/release/phat-hanh.md | wc -l
```
Expected: `0` (hết dòng giữ chỗ); một số ≥ 5 (các bước 10–14 của mục này, cộng các bước số hai chữ số của mục khác nếu có); `1`; `1` (tệp kết thúc bằng xuống dòng).

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/release/phat-hanh.md && git commit -m "docs(release): runbook mục 11 bước 10-14 (chính sách 1.5, app 0.2.4, website, /bat, thử tay), xóa theo yêu cầu, đường lui" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Kiểm cuối (trước ngày phát hành)

**Files:** không sửa file (chỉ sửa nếu bước kiểm lộ lỗi, rồi commit riêng).

- [ ] **Step 1: Không còn câu cũ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -rniE 'kênh hỗ trợ duy nhất|không có form|mọi liên hệ đi qua email ở trên|only support channel|no contact form|No web form|all contact goes through the email above|唯一のサポート窓口|ウェブフォーム|すべて上のメールアドレスで|唯一的支持渠道|没有网页表单|所有联系都通过上面的邮箱进行|유일한 지원 창구|웹 양식도|모든 연락은 위 이메일로' website/src docs/legal/privacy.vi.md docs/legal/privacy.en.md | wc -l; grep -rniE 'zalo ?bot|zaloplatforms' website/src | wc -l
```
Expected: `0` (mốc Task 0 Step 6 là 15), rồi `0`.

- [ ] **Step 2: Toàn bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 7.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Tests '
```
Expected: `Tests  19 passed (19)`.

- [ ] **Step 3: Khớp spec mục 5 (đọc nhanh)**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -c '90 ngày' docs/legal/privacy.vi.md; grep -c 'không bao giờ được gửi sang Zalo\|Không có email của bạn' docs/legal/privacy.vi.md; grep -n '^## ' docs/legal/privacy.vi.md | tail -3; grep -c 'Zalo' docs/legal/eula.vi.md
```
Expected: một số ≥ 6 (đo khi chạy thử: 8); `3` (hàng PayOS và hàng Zalo của mục 6 "Không có email của bạn", hàng Email của mục 11); ba dòng `## 11. Chat hỗ trợ`, `## 12. Thay đổi chính sách`, `## 13. Liên hệ`; `0` (EULA không đổi).

- [ ] **Step 4: Không có chỗ chưa làm; danh sách commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git log --oneline -12 && git status --short -- docs/legal docs/release website docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && grep -nE '\bTBD\b|\bTODO\b|\bFIXME\b' docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/README.md website/src/content/*/contact.mjs website/src/content/*/data-security.mjs
```
Expected: các commit của Task 1 đến Task 8 có trong log; `git status` không in file nào ở các đường dẫn đó; `grep` không in dòng nào.

- [ ] **Step 5: Báo cáo**

Báo chủ dự án (tiếng Việt): số test website (`pass` so với N0), các test hiện có bị đổi (chính sách 12 → 13 mục, mục 11/12 → 12/13), các trang đã sửa (Liên hệ, Dữ liệu và bảo mật, Trang chủ, Hỏi đáp, năm ngôn ngữ), các quyết định ở đầu kế hoạch (nhất là bản sao trong Zalo và trang Dữ liệu và bảo mật không nêu tên Zalo). Nhắc: **chưa deploy website, chưa phát hành app**; chính sách vẫn ghi 1.4 cho tới Task 10; Task 10 làm vào ngày phát hành 0.2.4, trước khi build; website deploy sau khi 0.2.4 lên R2 (runbook mục 11 bước 12).

---

### Task 10: Ngày phát hành: chính sách lên 1.5 và ngày hiệu lực

**Làm vào ngày phát hành app 0.2.4, trước khi nâng phiên bản và build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực"; runbook mục 11 bước 10). Chỉ làm khi chủ dự án đã cho phép phát hành. Ngày hiệu lực không được muộn hơn ngày deploy website; lệnh dưới lấy **ngày hôm nay theo giờ Việt Nam** (cùng múi giờ test sitemap dùng). EULA không đổi (giữ 1.3, ngày 2026-10-16).

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Cây làm việc sạch, các task trước đã xong**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git status --short -- docs/legal website && git log --oneline -30 | grep -c 'chat hỗ trợ\|Chat hỗ trợ\|chính sách 1.5\|mục 11'
```
Expected: `main`; `git status` không in file nào; số commit ≥ 6 (Task 1–8).

- [ ] **Step 2: Sửa test trước: chính sách 1.5, ngày sau 2026-10-18**

Tệp: `website/test/site.test.mjs`
```old
test("chính sách quyền riêng tư 1.4 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```
```new
test("chính sách quyền riêng tư 1.5 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```

Tệp: `website/test/site.test.mjs`
```old
  const viNeeds = ["Phiên bản 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.4", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```
```new
  const viNeeds = ["Phiên bản 1.5", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.5", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

Tệp: `website/test/site.test.mjs`
```old
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.4 (Gõ dịch) với ngày hiệu lực không sớm hơn ngày của bản 1.3 (2026-10-17).
  // Đặt bản và ngày bằng lệnh ở kế hoạch go-dich-06 (task ngày phát hành), trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.4") errors.push("giữ EULA 1.3 và chính sách 1.4");
  if (!privacyHead || privacyHead.iso < "2026-10-17") {
    errors.push(`chính sách 1.4 phải có ngày hiệu lực từ 2026-10-17 (ngày của bản 1.3) trở đi, đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```
```new
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.5 (chat hỗ trợ) với ngày hiệu lực SAU ngày của bản 1.4 (2026-10-18): ngày chưa
  // được đặt (còn ngày của bản 1.4) thì test đỏ. Đặt bản và ngày bằng lệnh ở kế hoạch chat-ho-tro-04, Task 10, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.5") errors.push("giữ EULA 1.3 và chính sách 1.5");
  if (!privacyHead || privacyHead.iso <= "2026-10-18") {
    errors.push(`chính sách 1.5 phải có ngày hiệu lực sau 2026-10-18 (ngày của bản 1.4), đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

Tệp: `website/test/site.test.mjs`
```old
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.4: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```
```new
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.5: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```

- [ ] **Step 3: Chạy test, thấy đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && node --test --test-name-pattern 'chính sách quyền riêng tư 1.5 nêu Creem|văn bản pháp lý \(điều khoản' test/site.test.mjs 2>&1 | grep -E 'ℹ (tests|pass|fail)|giữ EULA 1.3 và chính sách 1.5'
```
Expected: `ℹ tests 2`, `ℹ pass 0`, `ℹ fail 2`; có dòng `giữ EULA 1.3 và chính sách 1.5`.

- [ ] **Step 4: Đặt 1.5 và ngày ở bốn nơi, bằng một lệnh**

Lệnh ghi một script tạm ra thư mục tạm (ngoài repo, không commit), chạy với ngày hôm nay theo giờ Việt Nam, rồi xóa. Mỗi chuỗi cũ phải xuất hiện đúng một lần, nên chạy lần hai thì báo lỗi và không đổi gì thêm.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && T=$(mktemp -d) && cat > "$T/dat-ngay-chinh-sach-1-5.mjs" <<'EOF'
// Đặt chính sách quyền riêng tư 1.5 (chat hỗ trợ) và ngày hiệu lực ở mọi nơi trong repo. Chạy: node dat-ngay-chinh-sach-1-5.mjs <thư mục repo> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from "node:fs";

const [repo, iso] = process.argv.slice(2);
if (!repo || !/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) throw new Error("cách dùng: node dat-ngay-chinh-sach-1-5.mjs <thư mục repo> <YYYY-MM-DD>");
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

edit("docs/legal/privacy.vi.md", "**Phiên bản 1.4, hiệu lực từ 18/10/2026.**", `**Phiên bản 1.5, hiệu lực từ ${vi}.**`);
edit(
  "docs/legal/privacy.en.md",
  "**Version 1.4, effective 18 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**",
  `**Version 1.5, effective ${en}. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**`,
);
edit(
  "docs/legal/README.md",
  "**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.4 (hiệu lực từ 2026-10-18)**",
  `**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.5 (hiệu lực từ ${iso})**`,
);
edit("docs/legal/README.md", "chính sách quyền riêng tư 2026-10-18 (bản 1.4).", `chính sách quyền riêng tư ${iso} (bản 1.5).`);
console.log(`đã đặt chính sách 1.5, hiệu lực ${iso} (${vi} / ${en})`);
EOF
node "$T/dat-ngay-chinh-sach-1-5.mjs" "$PWD" "$(TZ=Asia/Ho_Chi_Minh date +%F)"; rm -rf "$T"
```
Expected: một dòng `đã đặt chính sách 1.5, hiệu lực <ngày hôm nay> (<dd/mm/yyyy> / <d tháng yyyy>)`. Lỗi `xuất hiện 0 lần` nghĩa là lệnh đã chạy rồi, hay dòng phiên bản không còn là 1.4, 18/10/2026.

- [ ] **Step 5: Kiểm ngày nhất quán, chạy test, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && grep -n '^\*\*Phiên bản\|^\*\*Version' docs/legal/privacy.vi.md docs/legal/privacy.en.md && grep -c 'chính sách quyền riêng tư phiên bản 1.5' docs/legal/README.md && grep -c '18/10/2026' docs/legal/privacy.vi.md
```
Expected: hai dòng phiên bản `1.5` cùng một ngày; `1`; `0`.

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator/website && pnpm test 2>&1 | grep -E 'ℹ (tests|pass|fail|skipped)'
```
Expected: `ℹ fail 0`, `ℹ pass` = N0 + 7 (Task 10 chỉ đổi test cũ).

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && pnpm exec vitest run src/lib/legal.test.ts src/lib/markdown.test.ts 2>&1 | grep -E 'Tests '
```
Expected: `Tests  19 passed (19)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/ai-translator && git branch --show-current && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/README.md website/test/site.test.mjs && git commit -m "docs(legal): chính sách quyền riêng tư lên bản 1.5, đặt ngày hiệu lực theo ngày phát hành" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Sau đó mới nâng phiên bản và build app theo `docs/release/phat-hanh.md` mục 2 (runbook mục 11 bước 11). Website deploy (`pnpm deploy`, bước 12) do chủ dự án chạy khi 0.2.4 đã lên R2.

---

## Tự rà

**Phủ mục 5 của spec:**
- Chính sách 1.5, mục 1–10 giữ số, mục 11 "Chat hỗ trợ", 12 và 13 đổi số, sửa mọi tham chiếu: Task 2 (văn bản, test 13 mục, test 12/13), Task 7 (README: "mục 11 nói thông báo" → mục 12). EULA và website không dẫn số mục 11, 12 (đã `grep`); app không dẫn số mục.
- Mục 2 (có chat, 90 ngày): Task 2 Step 4, Step 8. Mục 4 (chỉ khi dùng chat, theo nhịp; trong lúc dịch chỉ khi màn hình Hỗ trợ mở hay bấm gửi): Step 5, Step 9. Mục 5 (nội dung tin, email tự nguyện, nguồn, trang, thông tin máy, IP chỉ băm, mã băm token): Step 5, Step 9 và mục 11. Mục 6 (Zalo, Công ty Cổ phần VNG, máy chủ ở Việt Nam; dữ liệu theo §2.3; không có email): Step 6, Step 10. Mục 7 (90 ngày, nút xóa, yêu cầu qua email): Step 6, Step 10.
- EULA giữ 1.3; ngày hiệu lực 1.5 lúc phát hành 0.2.4: Task 10. `docs/legal/README.md`: Task 7, Task 10.
- Spec gốc A7 đúng câu ở mục 5 của spec, §10.1 hết mâu thuẫn ("App chỉ kết nối mạng để", "License server chỉ lưu", "giữ không thời hạn, không bao giờ tự xóa"), §15: Task 1.
- Website năm ngôn ngữ: Liên hệ (Task 3), Dữ liệu và bảo mật (Task 4), mọi trang có câu "kênh duy nhất / không có form" (grep: chỉ Liên hệ, Task 3), câu "máy chủ chỉ lưu" (Task 5). Không nhắc Zalo ở trang thường; test chặn "Zalo Bot", "zaloplatforms": Task 6. `modified` của trang vi/en đã sửa lên 2026-10-22 (ja/zh/ko đã là 2026-10-22; ngày dựng thật lấy từ git, `website/src/content/index.mjs`).
- Runbook: Task 8 (bước 10–14 thay dòng giữ chỗ của kế hoạch 01; thứ tự server → app 0.2.4 → website sau R2 → `/bat` → thử tay).

**Dữ kiện khớp spec:** 90 ngày kể từ tin cuối (mục 2, 5, 7, 11; website); email không tới Zalo (mục 6, 11, có test kiểm hàng Zalo không nhắc email ngoài câu phủ định); IP chỉ băm (mục 5, 11); nhịp kết nối của app theo hợp đồng phía khách (mục 4: màn hình Hỗ trợ mở, hay chờ trả lời 24 giờ và không đang dịch; chưa từng chat thì không kết nối; trong lúc dịch chỉ khi màn hình mở hay bấm gửi); thông tin máy không có key, email, mã máy, tên máy (mục 11, website); thư trả lời qua Resend (mục 6, 11).

**Chỗ spec thiếu, kế hoạch đã chọn cách viết (Quyết định 2):** bản sao trong Zalo không tự xóa; chính sách nói thẳng và hứa xóa khi khách yêu cầu.
