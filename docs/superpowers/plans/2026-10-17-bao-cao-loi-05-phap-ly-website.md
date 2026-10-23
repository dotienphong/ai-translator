# Báo cáo lỗi 05: spec gốc, chính sách quyền riêng tư, website và runbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi app tự gửi báo cáo lỗi, mọi văn bản và trang nói về dữ liệu rời máy vẫn đúng sự thật: spec gốc, Chính sách quyền riêng tư (lên bản 1.3), website (tiếng Việt và tiếng Anh), ảnh chụp giao diện trên website, runbook phát hành. Có test chặn không cho câu cũ ("app không tự gửi báo cáo lỗi hay log") quay lại.

**Architecture:** Văn bản pháp lý là nguồn duy nhất: `docs/legal/privacy.{vi,en}.md` vừa được app đóng gói vừa sinh ra hai trang của website (`website/src/content/legal.mjs`). Chính sách thêm mục 10 "Báo cáo lỗi" (không đánh số lại các mục 1–9, để test của website theo số mục vẫn đúng) và sửa các mục 2, 3, 4, 5, 6, 7 nhắc tới nó. Các trang website nói lại đúng các điều đó, có thêm một mục "Báo cáo lỗi" ở trang Dữ liệu và bảo mật. Một test mới của website chặn các câu cũ, kể cả trong chuỗi giao diện của app (vi và en). Ngày hiệu lực của chính sách 1.3 được đặt **lúc phát hành** bằng một lệnh, kèm test bắt ngày chưa đặt.

**Tech Stack:** Markdown (`docs/legal`, spec, runbook), website tĩnh bằng Node thuần (`website/`, test `node --test`), Vite và Chrome không đầu cho ảnh chụp (`scripts/ui-preview/`).

**Spec:** `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md` (mục 6, 8, 9). Đọc trước. Kế hoạch này không viết mã của app hay server.

**Quy tắc chung cho mọi task:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports` (nhánh `diagnostics-reports`). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** vì shell reset thư mục sau mỗi lệnh.
- **Không merge, không push, không deploy.** Runbook (Task 6) là tài liệu cho chủ dự án tự chạy.
- **Chỉ nói điều có thật** (CLAUDE.md): số đo kèm điều kiện đo; chưa đo thì ghi chưa đo. **Không công bố công nghệ lõi** trên website (tên model, engine, thư viện, khung app, kiến trúc nội bộ; có test chặn).
- Sửa văn bản bằng công cụ **Edit** (không dùng `sed -i`). Mỗi khối ` ```old ` phải khớp **đúng một lần** trong tệp ngay trước khi sửa; không khớp hay khớp nhiều lần thì dừng và báo, đừng đoán.
- Mã JS của website theo giọng các file kế bên (chú thích tiếng Việt).
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Cách đọc các bước sửa văn bản

Mỗi bước sửa ghi `Tệp: …`, rồi một cặp khối: ` ```old ` (văn bản hiện có) và ` ```new ` (văn bản thay vào). Khối có thể nhiều dòng. Dùng Edit với `old_string` = nội dung khối `old`, `new_string` = nội dung khối `new`. Khi một bước có nhiều cặp trên cùng một tệp, làm lần lượt từ trên xuống.

## Hợp đồng và quyết định dùng trong kế hoạch này

**Nhãn trong app** (kế hoạch 04 đặt; app là nguồn đúng, website và chính sách trích nguyên văn). Task 0 Step 4 kiểm các nhãn này có trong `src/i18n/vi.ts` và `src/i18n/en.ts`; nếu app dùng nhãn khác thì **dừng**, thay nhãn trong kế hoạch này (tìm từng chuỗi ở bảng) rồi mới làm tiếp.

| Nơi | Tiếng Việt | Tiếng Anh |
|---|---|---|
| Nút ở Giới thiệu | Gửi log cho hỗ trợ | Send log to support |
| Công tắc ở Cài đặt › Quyền riêng tư | Gửi báo cáo lỗi tự động | Send error reports automatically |

**Số liệu và hành vi** (spec 2026-10-17 mục 1 đến 3; trích đúng, không thêm): mã báo cáo dạng `R-XXXX-XXXX`; gửi tự động khi lần chạy trước chết, khi phiên dịch dừng vì lỗi của app, khi tiến trình phụ chết rồi được khởi động lại; **không bao giờ gửi lúc đang dịch**; tối đa 5 báo cáo mỗi máy mỗi ngày; log ≤ 64 KB; báo cáo gồm thông tin máy và `device_id_hash`, không gồm âm thanh, chữ chép lời, bản dịch, key, token, email, tên máy, tên tài khoản hệ điều hành, đường dẫn thư mục cá nhân, địa chỉ IP; giữ **30 ngày**, tối đa **3.000** báo cáo; gắn được với license và email qua mã băm của máy; xóa theo email xóa luôn báo cáo của các máy từng kích hoạt key của email đó; bật mặc định, kể cả với người dùng đã cài từ trước (chủ dự án chọn 2026-10-17: không hỏi, không thông báo trong app).

**Quyết định của kế hoạch này, cần chủ dự án biết:**
1. Chính sách và website **nói thẳng** rằng tính năng bật mặc định kể cả sau khi cập nhật từ bản cũ. Chủ dự án chọn không thông báo trong app; văn bản vẫn phải đúng sự thật. Muốn bỏ câu đó thì xóa đoạn "và người dùng đã cài từ trước cũng được bật…" (và "kể cả sau khi bạn cập nhật từ bản cũ hơn") ở mục 10 của chính sách (Task 2 Step 5 và Step 10) và ở trang Dữ liệu và bảo mật (Task 3 Step 5 và Step 10), rồi bỏ hai needle `đã cài từ trước` và `installed the app earlier` ở test của Task 2 Step 13.
2. Lượt đo A7 trên trang Dữ liệu và bảo mật có trước tính năng này. Trang ghi thẳng là **chưa đo lại** (Task 3). Khi chủ dự án chạy lại A7 (spec mục 7, runbook Task 6 điều kiện c) thì thay câu đó bằng số đo thật (ngày, máy, bản dựng).
3. Chính sách lên bản **1.3** và EULA **giữ bản 1.3, ngày 2026-10-16** (EULA không đổi; đã kiểm: EULA chỉ nói "không gửi âm thanh đi đâu" và dẫn tới chính sách cho phần dữ liệu, cả hai vẫn đúng).
4. Mục "Báo cáo lỗi" là **mục 10** của chính sách; "Thay đổi chính sách" và "Liên hệ" thành mục 11 và 12. Không chèn vào giữa các mục 1–9 vì website có test theo số mục (4, 5, 6, 7) và các văn bản tham chiếu chéo "mục 5", "mục 7".

**Ngày hiệu lực chính sách 1.3** = ngày phát hành bản app có tính năng này, đặt bằng lệnh ở Task 8 lúc phát hành, **trước khi build app** (quy tắc ở `docs/legal/README.md`, "Đổi ngày hiệu lực"). Cho tới Task 8, dòng phiên bản của hai file chính sách vẫn là 1.2, 16/10/2026.

## Cấu trúc file

| File | Việc |
|---|---|
| Modify `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §3.3 (A7), §4.1, §4.3, §6.8, §6.9, §7, §10.1, §10.2, §15 |
| Modify `docs/legal/privacy.vi.md`, `privacy.en.md` | Mục 2–7 sửa; mục 10 mới; mục 11, 12 đổi số; dòng phiên bản đổi ở Task 8 |
| Modify `docs/legal/README.md` | Lịch sử, quyết định, rủi ro cho luật sư, quy tắc đổi ngày; ngày đặt ở Task 8 |
| Modify `website/src/content/{vi,en}/data-security.mjs` | Mục "Báo cáo lỗi" mới và các chỗ liên quan |
| Modify `website/src/content/{vi,en}/{about,faq,home,contact,guide-troubleshooting,guide-quick-start,guide-history-export,privacy}.mjs` | Bỏ câu cũ, nói đúng sự thật |
| Modify `website/src/build/build.mjs` | Dòng "Privacy" của `llms.txt` |
| Modify `website/README.md` | Quy tắc mới |
| Modify `website/test/site.test.mjs` | Số mục chính sách 12; test mục 10; test chặn câu cũ; nâng lên 1.3 và bắt ngày chưa đặt (Task 8) |
| Modify `website/src/assets/img/app/{app-about,app-settings-privacy,app-onboarding-2}.{vi,en}.webp`, `manifest.json` | Chụp lại, mô tả mới |
| Modify `docs/release/phat-hanh.md` | Mục 10 mới |

---

### Task 0: Mốc xuất phát và điều kiện

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh và cài phụ thuộc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git branch --show-current && git status --short | head -5
```
Expected: `diagnostics-reports`; không có tệp lạ ngoài các kế hoạch `docs/superpowers/plans/2026-10-17-bao-cao-loi-*.md` chưa commit của các kế hoạch khác.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm install --frozen-lockfile && pnpm -C website install --frozen-lockfile
```
Expected: kết thúc không lỗi. (Website chỉ có `wrangler` làm devDependency; test chạy bằng Node thuần.)

- [ ] **Step 2: Đo mốc test website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -12
```
Expected: `ℹ tests 116`, `ℹ pass 114`, `ℹ fail 0`, `ℹ skipped 2` (hai test cần Google Chrome bị bỏ qua nếu không có Chrome). Nếu có `fail` **trước khi sửa gì**, dừng và báo. Ghi lại số `pass`: các task sau nêu số mới.

- [ ] **Step 3: Đo mốc test pháp lý của app**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -8
```
Expected: `Tests  7 passed (7)` (một file, bảy test).

- [ ] **Step 4: Kiểm kế hoạch 04 (giao diện app) đã làm: nhãn có trong app**

Task 2, 3, 4, 5 và 7 trích nhãn của app, nên chỉ làm sau khi kế hoạch 04 xong. Task 1 và Task 6 làm được ngay.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -c "Gửi log cho hỗ trợ\|Gửi báo cáo lỗi tự động" src/i18n/vi.ts && grep -c "Send log to support\|Send error reports automatically" src/i18n/en.ts
```
Expected: mỗi lệnh in một số ≥ 2 (ít nhất hai chuỗi: nút và công tắc). In `0` hay `1` thì kế hoạch 04 chưa xong hay dùng nhãn khác: xem `grep -n -i "report\|log" src/i18n/en.ts | head -30`, thay nhãn trong kế hoạch này theo app (bảng "Nhãn trong app" ở trên và mọi chỗ trích nhãn), hoặc đợi kế hoạch 04.

- [ ] **Step 5: Ghi lại các câu cũ hiện có (để so với Task 9)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -rniIE 'không tự gửi (báo cáo|log)|không gửi báo cáo lỗi tự động|app không tự gửi gì|bạn tự quyết( định)? có gửi|bạn tự gửi cho chúng tôi|log chỉ nằm trên máy|no automatic crash reports|sends no automatic|never sends (logs|anything)|you decide whether to send (them|logs)|you send them to us yourself|logs? stay on (your|this) (computer|machine)' docs/legal/privacy.vi.md docs/legal/privacy.en.md website/src src/i18n | wc -l
```
Expected: một số dương (mốc hiện tại: **24** dòng: 4 ở hai file chính sách, 18 ở các trang website, 2 ở `src/i18n/{vi,en}.ts`, chuỗi `about.logsHint`). Task 9 phải ra `0`.

---

### Task 1: Spec gốc

**Files:**
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

Spec gốc hiện cam kết "không gửi báo cáo crash, log tự gửi" ở §10.1, §7 và hàng rủi ro §10.2; A7 liệt kê các việc được phép có request mạng. Sửa theo spec 2026-10-17 mục 6.

- [ ] **Step 1: A7 (§3.3): thêm báo cáo lỗi vào các việc được phép, và việc phải đo lại**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
kiểm tra cập nhật app và manifest model. Không request nào chứa âm thanh hay nội dung chép lời. |
```
```new
kiểm tra cập nhật app và manifest model, và gửi báo cáo lỗi (§10.1; `POST /v1/diagnostics`, chỉ tới `api.aitranslator.vn`, chỉ khi app không đang dịch: báo cáo xếp hàng trên đĩa và gửi sau khi phiên dừng). Phải kiểm lại bằng proxy sau khi có tính năng báo cáo lỗi, kể cả lúc có báo cáo đang xếp hàng (spec 2026-10-17-diagnostics-reports-design §7). Không request nào chứa âm thanh hay nội dung chép lời. |
```

- [ ] **Step 2: §4.1 bước 1b: ô tùy chọn tích sẵn**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
phải tick đồng ý mới bấm được "Tiếp" (spec 2026-10-06 legal-in-app).
```
```new
phải tick đồng ý mới bấm được "Tiếp" (spec 2026-10-06 legal-in-app). Cùng màn hình có một ô tùy chọn **tích sẵn** "Gửi báo cáo lỗi tự động" (bỏ tích được): cài mới chưa gửi báo cáo nào cho tới khi qua bước này (§10.1, spec 2026-10-17-diagnostics-reports-design §5).
```

- [ ] **Step 3: §4.3: công tắc ở Quyền riêng tư và nút ở Giới thiệu**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
    - Bật/tắt lưu lịch sử.
```
```new
    - Bật/tắt lưu lịch sử.
    - Bật/tắt "Gửi báo cáo lỗi tự động" (§10.1); tắt thì xóa luôn hàng đợi báo cáo chưa gửi.
```

```old
- **Giới thiệu và giấy phép mã nguồn mở.**
```
```new
- **Giới thiệu và giấy phép mã nguồn mở.** Có nút "Mở thư mục log" và nút "Gửi log cho hỗ trợ": nút sau gửi ngay một báo cáo lỗi (kể cả khi đã tắt gửi tự động) và hiện mã báo cáo để người dùng đưa cho hỗ trợ (§10.1).
```

- [ ] **Step 4: §6.8: route mới và việc của người vận hành**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
Thiếu hay sai `TRIAL_DAYS` thì `503 trial_not_configured`. |
```
```new
Thiếu hay sai `TRIAL_DAYS` thì `503 trial_not_configured`. |
| `POST /v1/diagnostics` `{v: 1, id, kind, code, fingerprint, at, message, build, app, os, hw, model_pack, plan, ui_lang, device_id_hash, logs}` | Nhận báo cáo lỗi của app (§10.1, "Báo cáo lỗi"; spec `2026-10-17-diagnostics-reports-design.md`). Không cần token, vì app có thể chưa có. Chỉ nhận `application/json`, tối đa 80 KB. Kiểm schema, chạy lại bộ phát hiện dữ liệu nhạy cảm (key, token, `Bearer`, email, đường dẫn thư mục cá nhân): còn sót thì `422 rejected_sensitive` và không lưu. Ghi `error_reports` và `error_report_logs` (D1); gửi lại cùng `id` không tạo bản trùng. Trả `202 {id}`. Giới hạn theo giờ: 30 mỗi IP, 3 mỗi máy, 120 toàn hệ thống (§10.2); chạm trần toàn hệ thống thì cảnh báo `diagnostics_flood`, gặp dấu vân tay lỗi mới thì cảnh báo `error_report_new` (email chỉ có số lượng). Giữ 30 ngày và tối đa 3.000 báo cáo (cron dọn). |
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
- **Xóa hoặc ẩn danh dữ liệu cá nhân theo email** (§10.1). Thao tác này chỉ chạy khi người vận hành tự gọi, ví dụ khi khách yêu cầu xóa; không bao giờ chạy tự động.
```
```new
- **Xóa hoặc ẩn danh dữ liệu cá nhân theo email** (§10.1). Thao tác này chỉ chạy khi người vận hành tự gọi, ví dụ khi khách yêu cầu xóa; không bao giờ chạy tự động. Thao tác này xóa luôn báo cáo lỗi của các máy từng kích hoạt license của email đó.
- **Báo cáo lỗi của app** (§10.1): Web Admin xem theo nhóm dấu vân tay, xem một báo cáo kèm log, tìm theo mã báo cáo, xóa một báo cáo hay cả nhóm (`GET /admin/error-groups`, `GET /admin/error-reports`, `GET /admin/error-reports/{id}`, `POST /admin/error-reports/delete`). Log là văn bản thô do app gửi (đã che); Web Admin chỉ hiện dạng văn bản, không dựng HTML từ nó.
```

- [ ] **Step 5: §6.9: khóa cài đặt mới**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
- `saveHistory`
- `launchAtLogin`
```
```new
- `saveHistory`
- `sendErrorReports`: gửi báo cáo lỗi tự động (§10.1). Cài mới mặc định `false` cho tới khi người dùng qua bước Điều khoản (§4.1), nơi ô tương ứng tích sẵn; bước migrate của file cài đặt đã có đặt `true` (người dùng đã cài từ trước giữ bật, không hỏi)
- `launchAtLogin`
```

- [ ] **Step 6: §7: số đo từng phiên**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
lưu trên máy và không gửi đi đâu: thời gian của từng bước (cắt đoạn, nhận dạng, dịch, tổng thể). Xem được trong bảng debug ẩn và trong log để hỗ trợ khi người dùng báo lỗi.
```
```new
lưu trên máy: thời gian của từng bước (cắt đoạn, nhận dạng, dịch, tổng thể). Xem được trong bảng debug ẩn và trong log để hỗ trợ khi người dùng báo lỗi. Bảng debug chỉ nằm trong bộ nhớ và không gửi đi đâu; bản tóm tắt của phiên nằm trong log nên có trong báo cáo lỗi khi có lỗi hay khi người dùng bấm gửi log (§10.1, "Báo cáo lỗi"). Báo cáo không chứa chữ chép lời.
```

- [ ] **Step 7: §10.1: bỏ cam kết cũ, thêm mục "Báo cáo lỗi", xóa theo email**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
MVP **không có analytics và không gửi báo cáo crash**. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi.
```
```new
MVP **không có analytics**. App **tự gửi báo cáo lỗi** tới `POST /v1/diagnostics` của license server (cùng host `api.`, không thêm host nào; mục "Báo cáo lỗi" ngay dưới), không bao giờ trong lúc đang dịch. Phần log liên quan, đã che dữ liệu cá nhân, là thứ duy nhất của log rời máy; log vẫn nằm trên máy, và người dùng cũng bấm gửi tay được ở màn hình Giới thiệu.
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy
```
```new
- **Báo cáo lỗi** (spec `2026-10-17-diagnostics-reports-design.md`; đổi cam kết "không gửi báo cáo crash" cũ):
  - **Khi nào:** `crash` (lần chạy trước chết: panic hook ghi file trước khi abort, hay file "đang chạy" còn sót), `session_error` (phiên dừng vì lỗi của app: `sidecarFailed`, `sidecarMissing`, `sidecarTampered`, `modelBroken`, `vadFailed`, `captureFailed`, `dataUnavailable`, `unknown`; không gồm lỗi do môi trường hay người dùng), `sidecar_died` (tiến trình phụ chết rồi được khởi động lại) và `manual` (nút "Gửi log cho hỗ trợ" ở Giới thiệu, §4.3). Báo cáo tự động xếp hàng trên đĩa và **chỉ gửi khi không đang dịch**; mỗi máy tối đa 1 báo cáo mỗi dấu vân tay mỗi 24 giờ và 5 báo cáo mỗi ngày.
  - **Gồm:** mã báo cáo (`R-XXXX-XXXX`), loại và mã lỗi, thông tin máy (phiên bản app, hệ điều hành, kiến trúc, chip, RAM, loại GPU, gói model, tên gói bản quyền, ngôn ngữ giao diện), `device_id_hash` và phần log liên quan (≤ 64 KB). **Không bao giờ gồm:** âm thanh, chữ chép lời, bản dịch, license key, token, email, `device_label`, tên tài khoản hệ điều hành, đường dẫn thư mục cá nhân, địa chỉ IP. App che dữ liệu trước khi xếp hàng và bỏ cả báo cáo nếu còn sót mẫu nhạy cảm; server chạy lại bộ phát hiện và từ chối (`422`) nếu còn.
  - **Đồng ý:** ô **tích sẵn** ở bước Điều khoản (§4.1) và công tắc ở Cài đặt › Quyền riêng tư (§4.3, §6.9 `sendErrorReports`). Người dùng đã cài từ trước giữ bật mà không được hỏi hay thông báo (chủ dự án chọn 2026-10-17; rủi ro ở §15). Bản debug không tự gửi.
  - **Gắn với người:** báo cáo mang `device_id_hash` của bản quyền, nên nối được với license và email qua bảng `activations`.
  - **Lưu và xóa:** bảng `error_reports` và `error_report_logs` ở D1, **giữ 30 ngày** và tối đa 3.000 báo cáo (cron dọn). Đây là dữ liệu kỹ thuật tự hết hạn, khác với dữ liệu khách hàng giữ không thời hạn ở dưới. Thao tác admin "xóa theo email" xóa luôn báo cáo của các máy thuộc email đó (§6.8). Người vận hành xem và xóa ở Web Admin (§6.8).
  - Chính sách quyền riêng tư (mục 10) và website nói đúng những điều trên.
- **Tiến trình phụ:** `llama-server` chỉ nghe trên `127.0.0.1`, với API key ngẫu nhiên tạo mới mỗi lần chạy
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
      - giữ dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền;
```
```new
      - giữ dòng đơn hàng ở mức kế toán cần: mã đơn, ngày, số tiền;
      - **xóa** các báo cáo lỗi (bảng `error_reports` và `error_report_logs`) của các máy từng kích hoạt license của email đó;
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
      - log thư do Resend lưu (địa chỉ nhận và nội dung thư, có key)
```
```new
      - báo cáo lỗi của máy chỉ dùng thử (không có activation nên không gắn với email, không xóa theo email được): tự hết hạn sau 30 ngày;
      - log thư do Resend lưu (địa chỉ nhận và nội dung thư, có key)
```

- [ ] **Step 8: §10.2 hàng "Lộ nội dung cuộc họp" và §15 câu hỏi cho luật sư**

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
Log không bao giờ chứa nội dung chép lời. File xuất ra do người dùng chủ động tạo và tự quản lý. |
```
```new
Log không bao giờ chứa nội dung chép lời; phần log rời máy trong báo cáo lỗi còn được che đường dẫn cá nhân, key, token và email, và server từ chối nếu còn sót (§10.1). File xuất ra do người dùng chủ động tạo và tự quản lý. |
```

Tệp: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`

```old
  - thủ tục thông báo website bán hàng với Bộ Công Thương.
```
```new
  - việc app **tự gửi báo cáo lỗi** gắn với `device_id_hash` (§10.1, "Báo cáo lỗi"): người dùng đã cài từ trước bị gửi mà không được hỏi hay thông báo, dù đã đồng ý chính sách bản trước ghi log chỉ nằm trên máy; ô đồng ý tích sẵn ở bước Điều khoản có được coi là đồng ý hợp lệ không (nhất là với người dùng ở EU); báo cáo nối được với license và email; thời hạn giữ 30 ngày và việc xóa theo email;
  - thủ tục thông báo website bán hàng với Bộ Công Thương.
```

- [ ] **Step 9: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && S=docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && grep -c 'MVP \*\*không có analytics và không gửi báo cáo crash\|lưu trên máy và không gửi đi đâu: thời gian' $S; grep -c 'diagnostics' $S
```
Expected: `0` (không còn hai câu cũ, nguyên văn), rồi `5` (số dòng nhắc tới `diagnostics`: A7, §4.1, bảng route §6.8, hai dòng ở §10.1).

- [ ] **Step 10: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md && git commit -m "docs(spec): spec gốc theo báo cáo lỗi tự động (§3.3, §4, §6.8, §6.9, §7, §10, §15)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chính sách quyền riêng tư (nội dung; dòng phiên bản vẫn 1.2)

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`
- Modify: `website/test/site.test.mjs`

Cấu trúc hai bản vi và en phải **giống nhau** từng mục (số gạch đầu dòng, số hàng bảng, số đoạn): test `văn bản pháp lý … cùng cấu trúc` kiểm điều đó. Đừng thêm một gạch đầu dòng, hàng hay đoạn ở bản này mà thiếu ở bản kia.

- [ ] **Step 1: Tiếng Việt, mục 2 (Tóm tắt)**

Tệp: `docs/legal/privacy.vi.md`

```old
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics, không gửi báo cáo lỗi tự động**.
```
```new
- Ứng dụng **không có tài khoản đăng nhập, không có quảng cáo, không có analytics**. Khi gặp lỗi, ứng dụng **tự gửi báo cáo lỗi đã che dữ liệu cá nhân** cho chúng tôi để sửa lỗi; bạn tắt được bất cứ lúc nào (mục 10).
```

```old
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license và mã nhận diện máy đã băm, để cấp key, kiểm tra bản quyền và bảo đảm mỗi máy chỉ dùng thử gói Free một lần.
```
```new
- Máy chủ của chúng tôi chỉ lưu **email** (khi bạn mua gói), thông tin đơn hàng, license, mã nhận diện máy đã băm và báo cáo lỗi (giữ 30 ngày), để cấp key, kiểm tra bản quyền, bảo đảm mỗi máy chỉ dùng thử gói Free một lần và sửa lỗi.
```

```old
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7).
```
```new
- Dữ liệu cá nhân trên máy chủ được **giữ cho tới khi bạn yêu cầu xóa** (mục 7), trừ báo cáo lỗi tự xóa sau 30 ngày (mục 10).
```

- [ ] **Step 2: Tiếng Việt, mục 3 (dữ liệu ở lại trên máy) và mục 4 (kết nối mạng)**

Tệp: `docs/legal/privacy.vi.md`

```old
## 3. Dữ liệu ở lại trên máy bạn (không gửi cho chúng tôi)
```
```new
## 3. Dữ liệu ở lại trên máy bạn
```

```old
| Nhật ký hoạt động (log) | Lưu trên máy bạn, không chứa nội dung chép lời. Khi cần hỗ trợ, bạn tự gửi cho chúng tôi nếu muốn |
```
```new
| Nhật ký hoạt động (log) | Lưu trên máy bạn, không chứa nội dung chép lời. Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân (mục 10); bạn cũng có thể gửi log cho hỗ trợ bằng nút trong ứng dụng |
```

```old
kiểm tra bản quyền định kỳ, và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch.
```
```new
kiểm tra bản quyền định kỳ, gửi báo cáo lỗi (mục 10) và (hiếm khi) hỏi giờ của máy chủ khi đồng hồ máy bị đặt lệch.
```

- [ ] **Step 3: Tiếng Việt, mục 5 (dữ liệu máy chủ) và mục 6 (bên thứ ba)**

Tệp: `docs/legal/privacy.vi.md`

```old
các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key:
```
```new
các dòng còn lại chỉ khi bạn mua gói hay kích hoạt key, trừ dòng "Báo cáo lỗi", áp cho mọi máy mà ứng dụng gửi báo cáo:
```

```old
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
```
```new
| Bộ đếm giới hạn tần suất (chỉ lưu giá trị băm HMAC của IP, key, email; tự hết hạn sau khoảng 3 giờ) | Chặn dò key và spam |
| Báo cáo lỗi (mục 10): loại và mã lỗi, thông tin máy, **mã băm** của ID máy và phần log liên quan; không có email, tên máy hay nội dung cuộc họp | Tìm và sửa lỗi; tự xóa sau 30 ngày |
```

```old
thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên: không có email, tên máy hay thông tin nào khác của bạn.
```
```new
thì chúng tôi chỉ lưu dòng "Dùng thử Free" ở trên và, nếu ứng dụng gửi báo cáo lỗi, các báo cáo đó: không có email, tên máy hay thông tin nào khác của bạn.
```

Tệp: `docs/legal/privacy.vi.md`

```old
| Dữ liệu ở mục 5; nhật ký kỹ thuật tự hết hạn |
```
```new
| Dữ liệu ở mục 5, kể cả báo cáo lỗi (mục 10); nhật ký kỹ thuật tự hết hạn |
```

```old
nên dữ liệu ở mục 5 có thể được xử lý ở nước ngoài.
```
```new
nên dữ liệu ở mục 5 và mục 10 có thể được xử lý ở nước ngoài.
```

- [ ] **Step 4: Tiếng Việt, mục 7 (xóa dữ liệu)**

Tệp: `docs/legal/privacy.vi.md`

```old
- **bỏ** email và tên máy của bạn;
```
```new
- **bỏ** email và tên máy của bạn;
- **xóa** các báo cáo lỗi của những máy từng kích hoạt key của email đó (mục 10);
```

```old
muốn xóa ở Creem, hãy liên hệ Creem.
```
```new
muốn xóa ở Creem, hãy liên hệ Creem. Báo cáo lỗi của một máy chưa từng kích hoạt key không gắn với email nào nên không tìm theo email được; những báo cáo đó tự xóa sau 30 ngày.
```

- [ ] **Step 5: Tiếng Việt, mục 10 mới (Báo cáo lỗi) và đổi số mục 11, 12**

Tệp: `docs/legal/privacy.vi.md`

```old
## 11. Liên hệ
```
```new
## 12. Liên hệ
```

```old
## 10. Thay đổi chính sách
```
```new
## 10. Báo cáo lỗi

Khi ứng dụng gặp lỗi, nó **tự gửi một báo cáo lỗi** cho chúng tôi qua license server (`api.aitranslator.vn`) để chúng tôi biết và sửa lỗi. Tính năng này **bật mặc định**: ở bước Điều khoản khi mở ứng dụng lần đầu có một ô đã tích sẵn mà bạn bỏ tích được, và người dùng đã cài từ trước cũng được bật sau khi cập nhật lên bản có tính năng này. Bạn tắt hay bật lại bất cứ lúc nào ở **Cài đặt › Quyền riêng tư › Gửi báo cáo lỗi tự động**; tắt thì các báo cáo đang chờ gửi bị xóa. Bạn cũng tự gửi được một báo cáo bất cứ lúc nào bằng nút **Gửi log cho hỗ trợ** ở màn hình Giới thiệu: nút này gửi ngay, kể cả khi bạn đã tắt gửi tự động, và cho bạn một **mã báo cáo** để đưa cho bộ phận hỗ trợ.

| Nội dung | Chi tiết |
|---|---|
| Khi nào gửi tự động | Khi lần chạy trước của ứng dụng bị dừng đột ngột; khi một phiên dịch dừng vì lỗi của ứng dụng (không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm, hết hạn mức, hết dùng thử, mất mạng, hết dung lượng); hoặc khi một công cụ phụ của ứng dụng chết rồi được tự khởi động lại. Báo cáo chỉ được gửi khi ứng dụng không đang dịch, và mỗi máy gửi tối đa 5 báo cáo mỗi ngày |
| Báo cáo gồm | Mã báo cáo, loại và mã lỗi, giờ xảy ra; phiên bản ứng dụng, hệ điều hành và phiên bản, kiến trúc, tên chip hoặc CPU, RAM, loại GPU đang dùng, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; **mã băm của ID máy**; và phần log liên quan đến lỗi (tối đa 64 KB) |
| Báo cáo không gồm | Âm thanh, bản chép lời, bản dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP |
| Che dữ liệu | Trước khi gửi, ứng dụng che đường dẫn thư mục cá nhân, key, token và email trong log; còn sót mẫu nhạy cảm thì bỏ cả báo cáo. Máy chủ kiểm lại và từ chối báo cáo nếu còn |
| Gắn với bạn thế nào | Mã băm của ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free (mục 5), nên chúng tôi **có thể nối báo cáo với license và email** của máy đó khi tra cứu hỗ trợ |
| Giữ bao lâu | Tối đa **30 ngày** rồi tự xóa; máy chủ giữ tối đa 3.000 báo cáo, báo cáo cũ nhất bị xóa trước |
| Ai xem được | Chỉ người vận hành ứng dụng, qua trang quản trị có đăng nhập riêng. Dữ liệu nằm trên Cloudflare (mục 6) |

- Chúng tôi dùng báo cáo chỉ để tìm và sửa lỗi; không dùng cho quảng cáo, không bán và không chia sẻ cho bên nào ngoài các bên xử lý ở mục 6.
- Muốn xóa báo cáo của máy bạn trước hạn 30 ngày, hãy yêu cầu xóa dữ liệu theo mục 7: khi xử lý yêu cầu xóa theo email, chúng tôi xóa luôn báo cáo lỗi của các máy từng kích hoạt key của email đó.
- Nếu bạn không muốn gửi gì, hãy bỏ tích ở bước Điều khoản hoặc tắt công tắc ở Cài đặt; ứng dụng vẫn dùng đầy đủ tính năng khi tắt.

## 11. Thay đổi chính sách
```

- [ ] **Step 6: Tiếng Anh, mục 2 (Summary)**

Tệp: `docs/legal/privacy.en.md`

```old
- The app has **no sign-in accounts, no advertising, no analytics, and no automatic crash reports**.
```
```new
- The app has **no sign-in accounts, no advertising and no analytics**. When it hits an error, it **automatically sends us an error report with personal data scrubbed out** so we can fix the problem; you can turn this off at any time (section 10).
```

```old
- Our servers only store your **email** (when you buy a plan), order details, your license and a hashed machine identifier, in order to issue keys, check licenses and make sure each machine gets the Free trial only once.
```
```new
- Our servers only store your **email** (when you buy a plan), order details, your license, a hashed machine identifier and error reports (kept for 30 days), in order to issue keys, check licenses, make sure each machine gets the Free trial only once, and fix bugs.
```

```old
- Personal data on our servers is **kept until you ask us to delete it** (section 7).
```
```new
- Personal data on our servers is **kept until you ask us to delete it** (section 7), except error reports, which are deleted automatically after 30 days (section 10).
```

- [ ] **Step 7: Tiếng Anh, mục 3 và mục 4**

Tệp: `docs/legal/privacy.en.md`

```old
## 3. Data that stays on your computer (not sent to us)
```
```new
## 3. Data that stays on your computer
```

```old
| Activity logs | Stored on your computer; they do not contain transcript text. If you want support, you send them to us yourself |
```
```new
| Activity logs | Stored on your computer; they do not contain transcript text. Only the part of a log that relates to an error leaves your computer, inside an error report with personal data scrubbed out (section 10); you can also send a log to support with a button in the app |
```

```old
check your license periodically, and (rarely) ask for the server's time when your computer's clock looks wrong.
```
```new
check your license periodically, send error reports (section 10) and (rarely) ask for the server's time when your computer's clock looks wrong.
```

- [ ] **Step 8: Tiếng Anh, mục 5 và mục 6**

Tệp: `docs/legal/privacy.en.md`

```old
the other rows only apply when you buy a plan or activate a key:
```
```new
the other rows only apply when you buy a plan or activate a key, except the "Error reports" row, which applies to every machine whose app sends a report:
```

```old
| Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |
```
```new
| Rate-limit counters (only HMAC hashes of IP, key, email; expire after about 3 hours) | Block key guessing and spam |
| Error reports (section 10): error type and code, machine details, a **hash** of the machine ID and the relevant part of the log; no email, computer name or meeting content | Find and fix bugs; deleted automatically after 30 days |
```

```old
we store only the "Free trial" row above: no email, computer name or any other information about you.
```
```new
we store only the "Free trial" row above and, if the app sends error reports, those reports: no email, computer name or any other information about you.
```

Tệp: `docs/legal/privacy.en.md`

```old
| The data in section 5; technical logs that expire on their own |
```
```new
| The data in section 5, including error reports (section 10); technical logs that expire on their own |
```

```old
so the data in section 5 may be processed abroad.
```
```new
so the data in sections 5 and 10 may be processed abroad.
```

- [ ] **Step 9: Tiếng Anh, mục 7**

Tệp: `docs/legal/privacy.en.md`

```old
- **remove** your email and computer name;
```
```new
- **remove** your email and computer name;
- **delete** the error reports of the machines that ever activated a key for that email (section 10);
```

```old
to have them deleted at Creem, contact Creem.
```
```new
to have them deleted at Creem, contact Creem. Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days.
```

- [ ] **Step 10: Tiếng Anh, mục 10 mới (Error reports) và đổi số mục 11**

Tệp: `docs/legal/privacy.en.md`

```old
## 11. Contact
```
```new
## 12. Contact
```

```old
## 10. Changes to this policy
```
```new
## 10. Error reports

When the app hits an error, it **automatically sends us an error report** through our license server (`api.aitranslator.vn`) so we can find and fix the problem. This is **on by default**: the Terms step the first time you open the app has a pre-ticked box you can untick, and people who installed the app earlier have it on after updating to a version that includes this feature. You can turn it off or on again at any time in **Settings › Privacy › Send error reports automatically**; turning it off deletes any reports still waiting to be sent. You can also send a report yourself at any time with the **Send log to support** button on the About screen: it sends immediately, even if you turned automatic sending off, and gives you a **report code** to hand to support.

| What | Details |
|---|---|
| When it is sent automatically | When the app's previous run ended abruptly; when a translation session stops because of an error in the app (not errors caused by you or your environment, such as a missing recording permission, a used-up quota, an ended trial, no network or no disk space); or when one of the app's helper programs dies and is restarted automatically. A report is only sent while the app is not translating, and each machine sends at most 5 reports a day |
| The report contains | The report code, the type and code of the error, the time it happened; the app version, the operating system and its version, the architecture, the chip or CPU name, RAM, the type of GPU in use, the model pack, the name of your license plan (never the key), the interface language; a **hash of the machine ID**; and the part of the log that relates to the error (at most 64 KB) |
| The report does not contain | Audio, transcripts, translations, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses |
| Scrubbing | Before sending, the app removes personal folder paths, keys, tokens and email addresses from the log; if any sensitive pattern is left, the whole report is dropped. Our server checks again and rejects a report if anything is left |
| How it is tied to you | The machine-ID hash in the report is the same one we store for licensing and the Free trial (section 5), so we **can link a report to that machine's license and email** when handling a support request |
| How long it is kept | At most **30 days**, then deleted automatically; the server keeps at most 3,000 reports and deletes the oldest first |
| Who can see it | Only the operator of the app, through an admin page with its own login. The data is held on Cloudflare (section 6) |

- We use reports only to find and fix bugs; we do not use them for advertising, sell them or share them with anyone other than the processors in section 6.
- To have the reports of your machine deleted before the 30 days are up, ask for deletion under section 7: when we handle a deletion request by email, we also delete the error reports of the machines that ever activated a key for that email.
- If you would rather send nothing, untick the box at the Terms step or turn the switch off in Settings; the app keeps working fully with it off.

## 11. Changes to this policy
```

- [ ] **Step 11: Kiểm cấu trúc vi và en giống nhau (trước khi sửa test)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node -e '
const fs = require("fs");
const skeleton = (md) => md.split(/^## /m).slice(1).map((sec) => {
  const lines = sec.split("\n").slice(1).filter((l) => l.trim() !== "");
  return { section: /^(\d+)\./.exec(sec)?.[1], items: lines.filter((l) => /^(- |\d+\. )/.test(l)).length, rows: lines.filter((l) => l.startsWith("|")).length, paragraphs: lines.filter((l) => !/^(- |\d+\. |\||#)/.test(l)).length };
});
const vi = skeleton(fs.readFileSync("docs/legal/privacy.vi.md", "utf8"));
const en = skeleton(fs.readFileSync("docs/legal/privacy.en.md", "utf8"));
console.log("mục:", vi.length, en.length, "giống nhau:", JSON.stringify(vi) === JSON.stringify(en));
console.log(JSON.stringify(vi.find((s) => s.section === "10")));
'
```
Expected: `mục: 12 12 giống nhau: true` và `{"section":"10","items":3,"rows":9,"paragraphs":1}`.

- [ ] **Step 12: Sửa test website: chính sách có 12 mục**

Tệp: `website/test/site.test.mjs`

```old
  for (const [name, count] of [["eula", 16], ["privacy", 11]]) {
```
```new
  for (const [name, count] of [["eula", 16], ["privacy", 12]]) {
```

- [ ] **Step 13: Thêm test cho mục 10 và các mục nhắc tới báo cáo lỗi**

Tệp: `website/test/site.test.mjs`

```old
test("văn bản pháp lý (điều khoản và chính sách ở docs/legal): bốn file nêu merchant of record, EULA nêu rút ngắn hay thu hồi khi hoàn tiền, bản tiếng Anh cùng cấu trúc và cùng ngày với bản tiếng Việt", async () => {
```
```new
test("chính sách quyền riêng tư: mục 10 Báo cáo lỗi nêu khi nào gửi, gồm và không gồm gì, gắn với mã băm của máy, giữ 30 ngày, tắt ở đâu; các mục 2, 3, 4, 5, 7 nhắc tới báo cáo lỗi; không còn câu cũ", () => {
  const errors = [
    ...sectionErrors(
      "/chinh-sach-quyen-rieng-tu/",
      {
        2: ["tự gửi báo cáo lỗi đã che dữ liệu cá nhân", "trừ báo cáo lỗi tự xóa sau 30 ngày"],
        3: ["Chỉ phần log liên quan đến một lỗi rời máy"],
        4: ["gửi báo cáo lỗi (mục 10)"],
        5: ["Báo cáo lỗi (mục 10)", "tự xóa sau 30 ngày"],
        7: ["xóa các báo cáo lỗi của những máy từng kích hoạt key của email đó", "không gắn với email nào"],
        10: [
          "Gửi báo cáo lỗi tự động",
          "Gửi log cho hỗ trợ",
          "bật mặc định",
          "đã cài từ trước",
          "mã báo cáo",
          "không đang dịch",
          "mã băm của ID máy",
          "Âm thanh, bản chép lời, bản dịch, license key, token, email",
          "có thể nối báo cáo với license và email",
          "30 ngày",
          "3.000",
        ],
        11: ["Thay đổi chính sách"],
        12: ["Liên hệ"],
      },
      { 2: ["không gửi báo cáo lỗi tự động"], 3: ["bạn tự gửi cho chúng tôi nếu muốn"] },
    ),
    ...sectionErrors(
      "/en/privacy/",
      {
        2: ["automatically sends us an error report with personal data scrubbed out", "except error reports"],
        3: ["Only the part of a log that relates to an error leaves your computer"],
        4: ["send error reports (section 10)"],
        5: ["Error reports (section 10)", "deleted automatically after 30 days"],
        7: ["delete the error reports of the machines that ever activated a key for that email", "not tied to any email"],
        10: [
          "Send error reports automatically",
          "Send log to support",
          "on by default",
          "installed the app earlier",
          "report code",
          "not translating",
          "hash of the machine ID",
          "Audio, transcripts, translations, license keys, tokens, email addresses",
          "can link a report to that machine",
          "30 days",
          "3,000",
        ],
        11: ["Changes to this policy"],
        12: ["Contact"],
      },
      { 2: ["no automatic crash reports"], 3: ["you send them to us yourself"] },
    ),
  ];
  for (const [urlPath, first, needles] of [
    ["/chinh-sach-quyen-rieng-tu/", "Báo cáo lỗi (mục 10)", ["mã băm", "Tìm và sửa lỗi"]],
    ["/en/privacy/", "Error reports (section 10)", ["hash", "Find and fix bugs"]],
  ]) {
    const row = rowText(legalSections(urlPath).get("5")?.html, first);
    if (!row) errors.push(`${urlPath} mục 5: không có hàng "${first}"`);
    for (const n of needles) if (row && !row.includes(n)) errors.push(`${urlPath} mục 5, hàng "${first}": thiếu "${n}" (hàng: ${row})`);
  }
  assert.deepEqual(errors, []);
});

test("văn bản pháp lý (điều khoản và chính sách ở docs/legal): bốn file nêu merchant of record, EULA nêu rút ngắn hay thu hồi khi hoàn tiền, bản tiếng Anh cùng cấu trúc và cùng ngày với bản tiếng Việt", async () => {
```

- [ ] **Step 14: Chạy test website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -10
```
Expected: `ℹ tests 117`, `ℹ pass 115`, `ℹ fail 0`, `ℹ skipped 2`. Test mới đỏ ở một cụm thì đọc dòng `thiếu "…"` và sửa **văn bản** cho khớp spec (không nới needle). Test `privacy 12` đỏ ở `cấu trúc en khác vi` thì so lại Step 11.

- [ ] **Step 15: Chạy test pháp lý của app (app đọc đúng bốn file)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -6
```
Expected: `Tests  7 passed (7)`.

- [ ] **Step 16: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md website/test/site.test.mjs && git commit -m "docs(legal): chính sách quyền riêng tư thêm mục 10 Báo cáo lỗi, sửa mục 2-7 (dòng phiên bản đổi ở lúc phát hành)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Website, trang Dữ liệu và bảo mật (tiếng Việt và tiếng Anh)

**Files:**
- Modify: `website/src/content/vi/data-security.mjs`, `website/src/content/en/data-security.mjs`

Test hiện có ghim: câu mở đầu "Đúng năm nơi" / "exactly five places" và số dòng bảng "Các nơi app kết nối" = số mục ở mục 4 của chính sách (5). Vì vậy báo cáo lỗi **không** thêm hàng thứ sáu vào bảng đó: chỉ sửa hàng `api.aitranslator.vn`.

- [ ] **Step 1: Tiếng Việt, mục lục, mô tả llm, bảng tóm tắt**

Tệp: `website/src/content/vi/data-security.mjs`

```old
  { level: 2, id: "may-chu", text: "Máy chủ lưu gì và giữ bao lâu?" },
```
```new
  { level: 2, id: "may-chu", text: "Máy chủ lưu gì và giữ bao lâu?" },
  { level: 2, id: "bao-cao-loi", text: "Báo cáo lỗi: app gửi gì khi gặp lỗi?" },
```

```old
  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS (Windows chưa đo), dữ liệu máy chủ lưu và thời gian giữ, bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
```
```new
  llm: "Dữ liệu ở lại trên máy, năm nơi app kết nối mạng, cách đã kiểm tra bằng proxy trên macOS (Windows chưa đo), dữ liệu máy chủ lưu và thời gian giữ, báo cáo lỗi tự động (gửi gì, tắt thế nào), bên xử lý, lớp bảo vệ, trạng thái ký số và cách yêu cầu xóa dữ liệu.",
```

```old
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa"],
```
```new
  ["Máy chủ lưu", "Email (khi mua), đơn hàng, license, mã băm ID máy, báo cáo lỗi"],
  ["Giữ bao lâu", "Cho tới khi bạn yêu cầu xóa; báo cáo lỗi 30 ngày"],
```

- [ ] **Step 2: Tiếng Việt, mục "Dữ liệu nào ở lại trên máy bạn?" và bảng kết nối**

Tệp: `website/src/content/vi/data-security.mjs`

```old
<p>Âm thanh, bản chép lời và bản dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo, không analytics và không tự gửi báo cáo lỗi.</p>
```
```new
<p>Âm thanh, bản chép lời và bản dịch không bao giờ rời khỏi máy. App cũng không có tài khoản đăng nhập, không quảng cáo và không analytics. Khi gặp lỗi, app gửi một báo cáo lỗi đã che dữ liệu cá nhân cho chúng tôi (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>); báo cáo đó không có âm thanh, chữ chép lời hay bản dịch.</p>
```

```old
<tr><th scope="row">Log</th><td>Nằm trên máy bạn, không chứa nội dung chép lời. Bạn tự quyết định có gửi cho chúng tôi hay không.</td></tr>
```
```new
<tr><th scope="row">Log</th><td>Nằm trên máy bạn, không chứa nội dung chép lời. Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>).</td></tr>
```

```old
<td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key</td>
```
```new
<td>Máy chủ bản quyền: đăng ký dùng thử Free, mua gói, kích hoạt, gỡ kích hoạt, khôi phục key, kiểm tra bản quyền, nhận báo cáo lỗi; thỉnh thoảng hỏi giờ máy chủ</td><td>Mã băm ID máy, tên máy, key; thêm email khi bạn mua hoặc khôi phục key; báo cáo lỗi đã che dữ liệu cá nhân (chỉ khi app không đang dịch)</td>
```

- [ ] **Step 3: Tiếng Việt, mục "Chúng tôi đã kiểm tra điều đó thế nào?" (nói thẳng lượt đo có trước tính năng này)**

Tệp: `website/src/content/vi/data-security.mjs`

```old
Chỉ đo trên macOS, một máy, một bản dựng ký ad-hoc. <strong>Windows chưa đo.</strong>
```
```new
Chỉ đo trên macOS, một máy, một bản dựng ký ad-hoc, và lượt đo có trước tính năng báo cáo lỗi tự động (app được thiết kế chỉ gửi báo cáo khi không đang dịch, nhưng <strong>chúng tôi chưa đo lại điều này bằng proxy</strong>). <strong>Windows chưa đo.</strong>
```

- [ ] **Step 4: Tiếng Việt, mục "Máy chủ lưu gì và giữ bao lâu?"**

Tệp: `website/src/content/vi/data-security.mjs`

```old
các dòng còn lại chỉ có khi bạn mua gói hoặc kích hoạt key.</p>
```
```new
các dòng còn lại chỉ có khi bạn mua gói hoặc kích hoạt key, trừ dòng báo cáo lỗi (áp cho mọi máy mà app gửi báo cáo).</p>
```

```old
<tr><th scope="row">Bộ đếm giới hạn tần suất (chỉ giá trị băm, tự hết hạn sau khoảng 3 giờ)</th><td>Chặn dò key và spam</td></tr>
```
```new
<tr><th scope="row">Bộ đếm giới hạn tần suất (chỉ giá trị băm, tự hết hạn sau khoảng 3 giờ)</th><td>Chặn dò key và spam</td></tr>
<tr><th scope="row">Báo cáo lỗi: loại và mã lỗi, thông tin máy, mã băm ID máy, phần log liên quan</th><td>Tìm và sửa lỗi; tự xóa sau 30 ngày (xem <a href="#bao-cao-loi">Báo cáo lỗi</a>)</td></tr>
```

```old
<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa.
```
```new
<p><strong>Giữ bao lâu:</strong> cho tới khi bạn yêu cầu xóa; chúng tôi không tự xóa (trừ báo cáo lỗi, tự xóa sau 30 ngày).
```

- [ ] **Step 5: Tiếng Việt, mục mới "Báo cáo lỗi" (đặt giữa "Máy chủ lưu gì" và "Làm sao để xóa dữ liệu")**

Tệp: `website/src/content/vi/data-security.mjs`

```old
<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
```
```new
<h2 id="bao-cao-loi">Báo cáo lỗi: app gửi gì khi gặp lỗi?</h2>
<p>Khi app gặp lỗi, nó tự gửi một báo cáo lỗi cho chúng tôi để chúng tôi biết và sửa. Tính năng này bật mặc định (kể cả sau khi bạn cập nhật từ bản cũ hơn); bạn tắt hay bật lại ở <strong>Cài đặt › Quyền riêng tư</strong>, và bỏ tích được ngay ở bước Điều khoản khi mở app lần đầu. Ở màn hình <strong>Giới thiệu</strong>, nút <strong>Gửi log cho hỗ trợ</strong> gửi ngay một báo cáo (kể cả khi bạn đã tắt gửi tự động) và cho bạn <strong>mã báo cáo</strong> để ghi vào thư gửi hỗ trợ.</p>
<div class="table-wrap" role="region" aria-label="Báo cáo lỗi của app" tabindex="0"><table>
<thead><tr><th scope="col">Nội dung</th><th scope="col">Chi tiết</th></tr></thead>
<tbody>
<tr><th scope="row">Khi nào app gửi</th><td>Khi lần chạy trước bị dừng đột ngột; khi một phiên dịch dừng vì lỗi của app (không tính lỗi do bạn hay môi trường như thiếu quyền ghi âm, hết hạn mức, mất mạng); khi một công cụ phụ của app chết rồi tự khởi động lại. Chỉ gửi khi app không đang dịch, tối đa 5 báo cáo mỗi ngày mỗi máy.</td></tr>
<tr><th scope="row">Báo cáo gồm</th><td>Mã báo cáo, loại và mã lỗi; phiên bản app, hệ điều hành, chip hoặc CPU, RAM, loại GPU, gói model, tên gói bản quyền (không có key), ngôn ngữ giao diện; mã băm ID máy; phần log liên quan đến lỗi, tối đa 64 KB.</td></tr>
<tr><th scope="row">Báo cáo không gồm</th><td>Âm thanh, bản chép lời, bản dịch, license key, token, email, tên máy, tên tài khoản hệ điều hành, địa chỉ IP. App che đường dẫn thư mục cá nhân, key, token và email trong log trước khi gửi; máy chủ kiểm lại và từ chối báo cáo nếu còn sót.</td></tr>
<tr><th scope="row">Gắn với bạn thế nào</th><td>Mã băm ID máy trong báo cáo cũng là mã chúng tôi lưu cho bản quyền và dùng thử Free, nên chúng tôi có thể nối báo cáo với license và email của máy đó khi tra cứu hỗ trợ.</td></tr>
<tr><th scope="row">Giữ bao lâu</th><td>Tối đa 30 ngày rồi tự xóa (máy chủ giữ tối đa 3.000 báo cáo). Yêu cầu xóa theo email xóa luôn báo cáo của các máy từng kích hoạt key của email đó.</td></tr>
</tbody></table></div>
<p>Chúng tôi chỉ dùng báo cáo để tìm và sửa lỗi, không dùng cho quảng cáo và không chia sẻ cho bên nào ngoài các bên xử lý ở bảng bên dưới. Văn bản đầy đủ ở mục 10 của <a href="/chinh-sach-quyen-rieng-tu/">Chính sách quyền riêng tư</a>.</p>

<h2 id="xoa-du-lieu">Làm sao để xóa dữ liệu của bạn?</h2>
```

- [ ] **Step 6: Tiếng Việt, mục xóa dữ liệu và bảng bên xử lý**

Tệp: `website/src/content/vi/data-security.mjs`

```old
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn. License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
```
```new
    { title: "Điều chúng tôi làm", text: "Bỏ email và tên máy của bạn, và xóa báo cáo lỗi của các máy từng kích hoạt key của email đó. License vẫn dùng được, nhưng không khôi phục qua email được nữa." },
```

```old
muốn xóa ở Creem, hãy liên hệ Creem.</p>
```
```new
muốn xóa ở Creem, hãy liên hệ Creem. Báo cáo lỗi của máy chưa từng kích hoạt key không gắn với email nên không xóa theo email được; chúng tự xóa sau 30 ngày.</p>
```

```old
<td>Dữ liệu ở bảng trên; nhật ký kỹ thuật tự hết hạn</td>
```
```new
<td>Dữ liệu ở bảng trên, kể cả báo cáo lỗi; nhật ký kỹ thuật tự hết hạn</td>
```

- [ ] **Step 7: Tiếng Anh, mục lục, mô tả llm, bảng tóm tắt**

Tệp: `website/src/content/en/data-security.mjs`

```old
  { level: 2, id: "server", text: "What do our servers store, and for how long?" },
```
```new
  { level: 2, id: "server", text: "What do our servers store, and for how long?" },
  { level: 2, id: "error-reports", text: "Error reports: what does the app send?" },
```

```old
  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS (Windows not yet measured), what our servers store and for how long, processors, protections, signing status and how to request deletion.",
```
```new
  llm: "What data stays on your device, the five places the app connects to, how it was checked with a proxy on macOS (Windows not yet measured), what our servers store and for how long, automatic error reports (what is sent, how to turn them off), processors, protections, signing status and how to request deletion.",
```

```old
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID"],
  ["Kept for", "Until you ask us to delete it"],
```
```new
  ["Servers store", "Email (when you buy), orders, licenses, hashed machine ID, error reports"],
  ["Kept for", "Until you ask us to delete it; error reports 30 days"],
```

- [ ] **Step 8: Tiếng Anh, "What data stays on your computer?", bảng kết nối, ghi chú phép đo**

Tệp: `website/src/content/en/data-security.mjs`

```old
<p>Audio, transcripts and translations never leave your computer. The app also has no sign-in, no ads, no analytics and sends no automatic crash reports.</p>
```
```new
<p>Audio, transcripts and translations never leave your computer. The app also has no sign-in, no ads and no analytics. When it hits an error, it sends us an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>); that report contains no audio, no transcript text and no translation.</p>
```

```old
<tr><th scope="row">Logs</th><td>Stored on your computer and free of transcript content. You decide whether to send them to us.</td></tr>
```
```new
<tr><th scope="row">Logs</th><td>Stored on your computer and free of transcript content. Only the part of a log that relates to an error leaves your computer, inside an error report with personal data scrubbed out (see <a href="#error-reports">Error reports</a>).</td></tr>
```

```old
<td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key</td>
```
```new
<td>License server: Free trial registration, buying, activating, deactivating, recovering keys, license checks, receiving error reports; occasionally asks the server for the time</td><td>Hashed machine ID, device name, key; plus your email when you buy or recover a key; error reports with personal data scrubbed out (only while the app is not translating)</td>
```

```old
Measured only on macOS, one machine, one ad-hoc signed build. <strong>Windows has not been measured.</strong>
```
```new
Measured only on macOS, one machine, one ad-hoc signed build, and the run predates automatic error reports (the app is designed to send a report only while it is not translating, but <strong>we have not re-measured that with the proxy</strong>). <strong>Windows has not been measured.</strong>
```

- [ ] **Step 9: Tiếng Anh, "What do our servers store?"**

Tệp: `website/src/content/en/data-security.mjs`

```old
the other rows exist only if you buy a plan or activate a key.</p>
```
```new
the other rows exist only if you buy a plan or activate a key, except the error-reports row, which applies to every device whose app sends a report.</p>
```

```old
<tr><th scope="row">Rate-limit counters (hashed values only, expire after about 3 hours)</th><td>Blocking key guessing and spam</td></tr>
```
```new
<tr><th scope="row">Rate-limit counters (hashed values only, expire after about 3 hours)</th><td>Blocking key guessing and spam</td></tr>
<tr><th scope="row">Error reports: error type and code, machine details, hashed machine ID, the relevant part of the log</th><td>Finding and fixing bugs; deleted automatically after 30 days (see <a href="#error-reports">Error reports</a>)</td></tr>
```

```old
<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own.
```
```new
<p><strong>Kept for:</strong> until you ask us to delete it; we never delete personal data on our own (except error reports, which are deleted automatically after 30 days).
```

- [ ] **Step 10: Tiếng Anh, mục mới "Error reports"**

Tệp: `website/src/content/en/data-security.mjs`

```old
<h2 id="delete-data">How do I delete my data?</h2>
```
```new
<h2 id="error-reports">Error reports: what does the app send when it hits an error?</h2>
<p>When the app hits an error, it automatically sends us an error report so we can find and fix the problem. This is on by default (including after you update from an older version); you turn it off or back on in <strong>Settings › Privacy</strong>, and you can untick it right at the Terms step the first time you open the app. The <strong>Send log to support</strong> button on the <strong>About</strong> screen sends a report immediately (even if you turned automatic sending off) and gives you a <strong>report code</strong> to put in your email to support.</p>
<div class="table-wrap" role="region" aria-label="Error reports from the app" tabindex="0"><table>
<thead><tr><th scope="col">What</th><th scope="col">Details</th></tr></thead>
<tbody>
<tr><th scope="row">When the app sends one</th><td>When the previous run ended abruptly; when a translation session stops because of an error in the app (not errors caused by you or your environment, such as a missing recording permission, a used-up quota or no network); when one of the app's helper programs dies and restarts. Only while the app is not translating, at most 5 reports a day per machine.</td></tr>
<tr><th scope="row">A report contains</th><td>The report code, the type and code of the error; the app version, operating system, chip or CPU, RAM, type of GPU, model pack, the name of your license plan (never the key), the interface language; the hashed machine ID; and the part of the log that relates to the error, at most 64 KB.</td></tr>
<tr><th scope="row">A report does not contain</th><td>Audio, transcripts, translations, license keys, tokens, email addresses, the computer name, the operating-system user name, IP addresses. The app scrubs personal folder paths, keys, tokens and email addresses from the log before sending; our server checks again and rejects a report if anything is left.</td></tr>
<tr><th scope="row">How it is tied to you</th><td>The hashed machine ID in the report is the same one we store for licensing and the Free trial, so we can link a report to that machine's license and email when handling a support request.</td></tr>
<tr><th scope="row">How long it is kept</th><td>At most 30 days, then deleted automatically (the server keeps at most 3,000 reports). A deletion request by email also deletes the reports of the machines that ever activated a key for that email.</td></tr>
</tbody></table></div>
<p>We use reports only to find and fix bugs, not for advertising, and we do not share them with anyone other than the processors in the table below. The full text is in section 10 of the <a href="/en/privacy/">Privacy policy</a>.</p>

<h2 id="delete-data">How do I delete my data?</h2>
```

- [ ] **Step 11: Tiếng Anh, mục xóa dữ liệu và bảng bên xử lý**

Tệp: `website/src/content/en/data-security.mjs`

```old
    { title: "What we do", text: "We remove your email and device name. Your license still works, but can no longer be recovered by email." },
```
```new
    { title: "What we do", text: "We remove your email and device name, and delete the error reports of the machines that ever activated a key for that email. Your license still works, but can no longer be recovered by email." },
```

```old
to have them deleted at Creem, contact Creem.</p>
```
```new
to have them deleted at Creem, contact Creem. Error reports from a machine that never activated a key are not tied to any email, so they cannot be found by email; they are deleted automatically after 30 days.</p>
```

```old
<td>The data in the table above; technical logs that expire on their own</td>
```
```new
<td>The data in the table above, including error reports; technical logs that expire on their own</td>
```

- [ ] **Step 12: Chạy test website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -10
```
Expected: `ℹ tests 117`, `ℹ pass 115`, `ℹ fail 0`. Đỏ ở "số nơi app kết nối" thì bạn đã thêm hay bớt một hàng ở bảng "Các nơi app kết nối mạng" (không được). Đỏ ở "CORE_TECH" thì một từ ở văn bản mới trùng danh sách công nghệ lõi: đổi từ.

- [ ] **Step 13: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add website/src/content/vi/data-security.mjs website/src/content/en/data-security.mjs && git commit -m "feat(website): trang Dữ liệu và bảo mật có mục Báo cáo lỗi, bỏ cam kết không tự gửi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Website, các trang còn lại, test chặn câu cũ

**Files:**
- Modify: `website/src/content/{vi,en}/{about,faq,home,contact,guide-troubleshooting,guide-quick-start,guide-history-export,privacy}.mjs`
- Modify: `website/src/build/build.mjs`, `website/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Về chúng tôi (vi và en)**

Tệp: `website/src/content/vi/about.mjs`

```old
Máy chủ chỉ giữ dữ liệu cần cho bản quyền, đơn hàng và dùng thử. Chi tiết ở
```
```new
Máy chủ chỉ giữ dữ liệu cần cho bản quyền, đơn hàng, dùng thử và báo cáo lỗi. Chi tiết ở
```

```old
App không có quảng cáo, không có analytics, không tự gửi báo cáo lỗi. Chúng tôi sống nhờ gói trả phí, không nhờ dữ liệu của bạn.
```
```new
App không có quảng cáo và không có analytics. Khi gặp lỗi, app tự gửi báo cáo lỗi đã che dữ liệu cá nhân (không có âm thanh hay nội dung cuộc họp) để chúng tôi sửa lỗi; bạn tắt được ở Cài đặt. Chúng tôi sống nhờ gói trả phí, không nhờ dữ liệu của bạn.
```

Tệp: `website/src/content/en/about.mjs`

```old
Our servers keep only what licensing, orders and the trial need. Details on
```
```new
Our servers keep only what licensing, orders, the trial and error reports need. Details on
```

```old
The app has no ads, no analytics and sends no automatic crash reports. We make a living from paid plans, not from your data.
```
```new
The app has no ads and no analytics. When it hits an error, it sends an error report with personal data scrubbed out (no audio and no meeting content) so we can fix the problem; you can turn that off in Settings. We make a living from paid plans, not from your data.
```

- [ ] **Step 2: Hỏi đáp (vi và en)**

Tệp: `website/src/content/vi/faq.mjs`

```old
<p>Không có quảng cáo, không có analytics, và app không tự gửi báo cáo lỗi. Máy chủ chỉ lưu email (khi bạn mua), đơn hàng, license, mã băm ID máy, tên máy (khi bạn kích hoạt key), mốc dùng thử Free và nhật ký thay đổi license, để cấp key và bảo đảm mỗi key một máy, mỗi máy dùng thử một lần. Chúng tôi không bán hay chia sẻ dữ liệu cho mục đích quảng cáo.</p>
```
```new
<p>Không có quảng cáo và không có analytics. Khi app gặp lỗi, nó tự gửi một báo cáo lỗi đã che dữ liệu cá nhân (không có âm thanh, chữ chép lời, key hay email); bạn tắt được ở Cài đặt › Quyền riêng tư. Máy chủ chỉ lưu email (khi bạn mua), đơn hàng, license, mã băm ID máy, tên máy (khi bạn kích hoạt key), mốc dùng thử Free, nhật ký thay đổi license và các báo cáo lỗi (giữ 30 ngày), để cấp key, bảo đảm mỗi key một máy, mỗi máy dùng thử một lần và sửa lỗi. Chúng tôi không bán hay chia sẻ dữ liệu cho mục đích quảng cáo. Chi tiết ở <a href="/bao-mat-du-lieu/#bao-cao-loi">Dữ liệu và bảo mật</a>.</p>
```

Tệp: `website/src/content/en/faq.mjs`

```old
<p>There are no ads and no analytics, and the app sends no automatic crash reports. Our servers store only your email (when you buy), orders, licenses, a hashed machine ID, the device name (when you activate a key), the Free trial dates and a license change log, so we can issue keys and keep to one device per key and one trial per device. We do not sell your data or share it for advertising.</p>
```
```new
<p>There are no ads and no analytics. When the app hits an error, it automatically sends an error report with personal data scrubbed out (no audio, no transcript text, no keys and no email); you can turn it off in Settings › Privacy. Our servers store only your email (when you buy), orders, licenses, a hashed machine ID, the device name (when you activate a key), the Free trial dates, a license change log and error reports (kept for 30 days), so we can issue keys, keep to one device per key and one trial per device, and fix bugs. We do not sell your data or share it for advertising. Details are on <a href="/en/data-security/#error-reports">Data and security</a>.</p>
```

- [ ] **Step 2b: Trang chủ (vi và en)**

Tệp: `website/src/content/vi/home.mjs`

```old
App không có analytics và không gửi báo cáo lỗi tự động.
```
```new
App không có analytics; khi gặp lỗi, app gửi báo cáo lỗi đã che dữ liệu cá nhân (tắt được ở Cài đặt).
```

```old
mốc dùng thử Free (mã băm ID máy) và nhật ký thay đổi license, không có dữ liệu cuộc hội thoại.
```
```new
mốc dùng thử Free (mã băm ID máy), nhật ký thay đổi license và báo cáo lỗi đã che dữ liệu cá nhân (giữ 30 ngày), không có dữ liệu cuộc hội thoại.
```

Tệp: `website/src/content/en/home.mjs`

```old
The app has no analytics and sends no automatic crash reports.
```
```new
The app has no analytics; when it hits an error, it sends an error report with personal data scrubbed out (you can turn that off in Settings).
```

```old
the Free-trial start (a hashed machine ID) and a log of license changes, never conversation data.
```
```new
the Free-trial start (a hashed machine ID), a log of license changes and error reports with personal data scrubbed out (kept for 30 days), never conversation data.
```

- [ ] **Step 3: Liên hệ, mục "Hỗ trợ kỹ thuật" (vi và en)**

Tệp: `website/src/content/vi/contact.mjs`

```old
<p>Nếu có thể, đính kèm log: vào Giới thiệu › Mở thư mục log. Log nằm trên máy bạn và không chứa nội dung chép lời; bạn tự quyết định có gửi hay không. Hãy thử
```
```new
<p>Cách nhanh nhất: vào Giới thiệu › Gửi log cho hỗ trợ, rồi ghi mã báo cáo hiện ra (dạng R-XXXX-XXXX) vào thư; chúng tôi tìm được log của bạn bằng mã đó. Log không chứa âm thanh hay nội dung chép lời, và dữ liệu cá nhân đã được che trước khi gửi. Muốn tự đính kèm file thì vào Giới thiệu › Mở thư mục log. Hãy thử
```

Tệp: `website/src/content/en/contact.mjs`

```old
<p>If you can, attach the log: About › Open log folder. Logs stay on your computer and never contain what was said; you decide whether to send them. Please try the
```
```new
<p>The quickest way: go to About › Send log to support and put the report code it shows (like R-XXXX-XXXX) in your email; we can find your log with that code. Logs never contain what was said, and personal data is scrubbed before sending. If you would rather attach the file yourself, go to About › Open log folder. Please try the
```

- [ ] **Step 4: Khắc phục sự cố, hỏi nhanh (vi và en)**

Tệp: `website/src/content/vi/guide-troubleshooting.mjs`

```old
    a: "<p>Không. Log không chứa âm thanh hay nội dung chép lời, và app không tự gửi log đi đâu.</p>",
```
```new
    a: "<p>Không. Log không chứa âm thanh hay nội dung chép lời. Khi app gặp lỗi, nó tự gửi phần log liên quan, đã che đường dẫn thư mục cá nhân, key, token và email, cho chúng tôi; bạn tắt được ở Cài đặt › Quyền riêng tư.</p>",
```

Tệp: `website/src/content/en/guide-troubleshooting.mjs`

```old
    a: "<p>No. Logs contain no audio and no transcript text, and the app never sends logs anywhere by itself.</p>",
```
```new
    a: "<p>No. Logs contain no audio and no transcript text. When the app hits an error, it sends us the relevant part of the log with personal folder paths, keys, tokens and email addresses scrubbed out; you can turn that off in Settings › Privacy.</p>",
```

- [ ] **Step 5: Khắc phục sự cố, mục "Gửi log và báo lỗi cho hỗ trợ" (vi)**

Tệp: `website/src/content/vi/guide-troubleshooting.mjs`

```old
<p>Mở <strong>Giới thiệu › Mở thư mục log</strong> để thấy file <code>app.log</code> (trên macOS: thư mục con <code>com.aitranslator.desktop</code> trong <code>~/Library/Logs/</code>; trên Windows: <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>). Log chỉ nằm trên máy bạn và không chứa âm thanh, nội dung chép lời hay key đầy đủ. App không tự gửi gì: bạn tự quyết có gửi cho <a href="/lien-he/">hỗ trợ</a> (support@aitranslator.vn) hay không.</p>
```
```new
<p>Khi app gặp lỗi (dừng đột ngột, phiên dịch dừng vì lỗi của app, hoặc một công cụ phụ chết rồi tự khởi động lại), nó <strong>tự gửi một báo cáo lỗi</strong> cho chúng tôi: thông tin máy và phần log liên quan, đã che đường dẫn thư mục cá nhân, key, token và email, không có âm thanh hay nội dung chép lời. Báo cáo chỉ được gửi khi app không đang dịch. Tính năng này bật mặc định; bạn tắt ở <strong>Cài đặt › Quyền riêng tư › Gửi báo cáo lỗi tự động</strong>. Xem <a href="/bao-mat-du-lieu/#bao-cao-loi">báo cáo gồm gì và giữ bao lâu</a>.</p>
<p>Với lỗi không làm app dừng (phụ đề sai, chậm…), hãy vào <strong>Giới thiệu › Gửi log cho hỗ trợ</strong>: app gửi ngay một báo cáo, kể cả khi bạn đã tắt gửi tự động, và hiện một <strong>mã báo cáo</strong> (dạng <code>R-XXXX-XXXX</code>). Ghi mã này vào thư gửi <a href="/lien-he/">hỗ trợ</a> (support@aitranslator.vn) để chúng tôi tìm đúng báo cáo của bạn.</p>
<p>Muốn tự xem hay đính kèm log, mở <strong>Giới thiệu › Mở thư mục log</strong> để thấy file <code>app.log</code> (trên macOS: thư mục con <code>com.aitranslator.desktop</code> trong <code>~/Library/Logs/</code>; trên Windows: <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>). File này nằm trên máy bạn và không chứa âm thanh, nội dung chép lời hay key đầy đủ.</p>
```

Tệp: `website/src/content/vi/guide-troubleshooting.mjs`

```old
  alt: "Màn hình Giới thiệu: tên app, dòng Phiên bản, nút Mở thư mục log kèm lưu ý log chỉ nằm trên máy, và mục điều khoản và quyền riêng tư",
  caption: "Giới thiệu: phiên bản và Mở thư mục log.",
```
```new
  alt: "Màn hình Giới thiệu: tên app, dòng Phiên bản, hai nút Mở thư mục log và Gửi log cho hỗ trợ, và mục điều khoản và quyền riêng tư",
  caption: "Giới thiệu: phiên bản, Mở thư mục log và Gửi log cho hỗ trợ.",
```

```old
<li>Mã đơn nếu liên quan thanh toán; <code>app.log</code> nếu bạn đồng ý.</li>
```
```new
<li>Mã báo cáo (nếu bạn đã bấm Gửi log cho hỗ trợ) và mã đơn nếu liên quan thanh toán; <code>app.log</code> nếu bạn muốn đính kèm.</li>
```

- [ ] **Step 6: Khắc phục sự cố, mục "Send logs and report a problem" (en)**

Tệp: `website/src/content/en/guide-troubleshooting.mjs`

```old
<p>Open <strong>About › Open log folder</strong> to find <code>app.log</code> (on macOS: the <code>com.aitranslator.desktop</code> folder inside <code>~/Library/Logs/</code>). Logs stay on your computer and contain no audio, no transcript text and no full license key. The app never sends anything by itself: you decide whether to send them to <a href="/en/contact/">support</a> (support@aitranslator.vn).</p>
```
```new
<p>When the app hits an error (it stops suddenly, a translation session stops because of an error in the app, or a helper program dies and restarts), it <strong>automatically sends us an error report</strong>: machine details and the relevant part of the log, with personal folder paths, keys, tokens and email addresses scrubbed out, and no audio or transcript text. A report is only sent while the app is not translating. This is on by default; you turn it off in <strong>Settings › Privacy › Send error reports automatically</strong>. See <a href="/en/data-security/#error-reports">what a report contains and how long it is kept</a>.</p>
<p>For a problem that does not stop the app (wrong or slow subtitles, for example), go to <strong>About › Send log to support</strong>: the app sends a report right away, even if you turned automatic sending off, and shows a <strong>report code</strong> (like <code>R-XXXX-XXXX</code>). Put that code in your email to <a href="/en/contact/">support</a> (support@aitranslator.vn) so we can find your report.</p>
<p>To look at or attach the log yourself, open <strong>About › Open log folder</strong> to find <code>app.log</code> (on macOS: the <code>com.aitranslator.desktop</code> folder inside <code>~/Library/Logs/</code>; on Windows: <code>%LOCALAPPDATA%\\com.aitranslator.desktop\\logs\\</code>). That file stays on your computer and contains no audio, no transcript text and no full license key.</p>
```

Tệp: `website/src/content/en/guide-troubleshooting.mjs`

```old
  alt: "The About screen: the app name, the Version line, the Open log folder button with a note that logs stay on this computer, and the terms and privacy section",
  caption: "About: the version and Open log folder.",
```
```new
  alt: "The About screen: the app name, the Version line, the Open log folder and Send log to support buttons, and the terms and privacy section",
  caption: "About: the version, Open log folder and Send log to support.",
```

```old
<li>The order number for payment issues; <code>app.log</code> if you agree.</li>
```
```new
<li>The report code (if you pressed Send log to support) and the order number for payment issues; <code>app.log</code> if you want to attach it.</li>
```

- [ ] **Step 7: Bắt đầu nhanh, bước 2 Điều khoản (vi và en), ảnh Quyền riêng tư**

Tệp: `website/src/content/vi/guide-quick-start.mjs`

```old
Khi bạn bấm Tiếp, app đăng ký dùng thử Free của máy với máy chủ, nên cần có mạng một lần.</p>
```
```new
Ở cùng màn hình có một ô tùy chọn đã tích sẵn cho việc gửi báo cáo lỗi tự động khi app gặp lỗi (không có âm thanh hay nội dung chép lời); bỏ tích nếu bạn không muốn, và đổi lại được ở Cài đặt › Quyền riêng tư. Khi bạn bấm Tiếp, app đăng ký dùng thử Free của máy với máy chủ, nên cần có mạng một lần.</p>
```

```old
alt: "Bước Điều khoản sử dụng với hai văn bản gập được và ô tick đồng ý bắt buộc"
```
```new
alt: "Bước Điều khoản sử dụng với hai văn bản gập được, ô tick đồng ý bắt buộc và ô tùy chọn gửi báo cáo lỗi tự động đã tích sẵn"
```

Tệp: `website/src/content/en/guide-quick-start.mjs`

```old
When you click Next, the app registers this computer's Free trial with the server, so you need an internet connection once.</p>
```
```new
The same screen has an optional box, ticked by default, for sending error reports automatically when the app hits an error (no audio and no transcript text); untick it if you prefer, and change it later in Settings › Privacy. When you click Next, the app registers this computer's Free trial with the server, so you need an internet connection once.</p>
```

```old
alt: "Terms of use step with two collapsible documents and the required consent checkbox"
```
```new
alt: "Terms of use step with two collapsible documents, the required consent checkbox and an optional, pre-ticked checkbox for automatic error reports"
```

Tệp: `website/src/content/vi/guide-history-export.mjs`

```old
  alt: "Cài đặt Quyền riêng tư: công tắc Lưu lịch sử chép lời (đang tắt), nút Xóa toàn bộ dữ liệu và nút Xóa model và dữ liệu",
```
```new
  alt: "Cài đặt Quyền riêng tư: công tắc Lưu lịch sử chép lời (đang tắt), công tắc Gửi báo cáo lỗi tự động (đang bật), nút Xóa toàn bộ dữ liệu và nút Xóa model và dữ liệu",
```

Tệp: `website/src/content/en/guide-history-export.mjs`

```old
  alt: "Privacy settings: the Save transcript history switch (off), the Delete all data button and the Delete models and data button",
```
```new
  alt: "Privacy settings: the Save transcript history switch (off), the Send error reports automatically switch (on), the Delete all data button and the Delete models and data button",
```

- [ ] **Step 8: Mô tả cho trợ lý AI: trang chính sách và `llms.txt`**

Tệp: `website/src/content/vi/privacy.mjs`

```old
  llm: "Chính sách quyền riêng tư: dữ liệu ở lại trên máy, dữ liệu máy chủ lưu, thời gian giữ, bên xử lý và cách yêu cầu xóa.",
```
```new
  llm: "Chính sách quyền riêng tư: dữ liệu ở lại trên máy, dữ liệu máy chủ lưu, báo cáo lỗi tự động (gửi gì, giữ 30 ngày, tắt thế nào), thời gian giữ, bên xử lý và cách yêu cầu xóa.",
```

Tệp: `website/src/content/en/privacy.mjs`

```old
  llm: "Privacy policy: data that stays on your device, data stored on our server, retention, processors and how to request deletion.",
```
```new
  llm: "Privacy policy: data that stays on your device, data stored on our server, automatic error reports (what is sent, kept 30 days, how to turn off), retention, processors and how to request deletion.",
```

Tệp: `website/src/build/build.mjs`

```old
    `- Privacy: no bot, no account, no ads, no analytics or cookies on the website; the app sends no audio or transcripts to any server; not open source`,
```
```new
    `- Privacy: no bot, no account, no ads, no analytics or cookies on the website; the app sends no audio or transcripts to any server; when the app hits an error it sends an error report with personal data scrubbed out (no audio, no transcript text), which you can turn off in Settings; not open source`,
```

- [ ] **Step 9: Quy tắc mới trong README của website**

Tệp: `website/README.md`

```old
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
```
```new
- Không cookie, không analytics, không script hay font của bên thứ ba (khớp lời hứa quyền riêng tư; CSP `default-src 'self'`).
- **Báo cáo lỗi tự động của app** (spec `2026-10-17-diagnostics-reports-design.md`): website nói đúng việc app tự gửi báo cáo lỗi đã che dữ liệu cá nhân (bật mặc định, tắt ở Cài đặt › Quyền riêng tư, giữ 30 ngày, gắn được với license qua mã băm của máy). **Không** nói "app không tự gửi báo cáo lỗi hay log": test `STALE_REPORTS` chặn các câu đó, kể cả trong chuỗi giao diện của app (vi, en). Đổi hành vi này thì sửa chính sách mục 10 (`docs/legal/privacy.{vi,en}.md`), các trang Dữ liệu và bảo mật, Hỏi đáp, Khắc phục sự cố, Liên hệ và Bắt đầu nhanh.
```

- [ ] **Step 10: Test chặn câu cũ (luật, mẫu bắt và mẫu giữ, quét cả site và chuỗi giao diện của app)**

Tệp: `website/test/site.test.mjs`

```old
test("không nguồn chữ nào của site (thân trang, <title>, mô tả, alt, aria-label, JSON-LD, mẫu thư, ba file llms) còn câu cũ nói chưa có thẻ quốc tế hay chỉ nhận VietQR", async () => {
  assert.deepEqual(scanStale(await siteTexts()), []);
});
```
```new
test("không nguồn chữ nào của site (thân trang, <title>, mô tả, alt, aria-label, JSON-LD, mẫu thư, ba file llms) còn câu cũ nói chưa có thẻ quốc tế hay chỉ nhận VietQR", async () => {
  assert.deepEqual(scanStale(await siteTexts()), []);
});

// Báo cáo lỗi tự động (spec 2026-10-17-diagnostics-reports-design): app tự gửi báo cáo lỗi đã che dữ liệu cá nhân, nên website và chính sách
// không được còn nói "app không tự gửi báo cáo lỗi hay log, bạn tự quyết có gửi". Mỗi luật chỉ bắt đúng ý cũ đó, không bắt câu mới
// nói app có gửi (xem STALE_REPORTS_MUST_KEEP).
const STALE_REPORTS = [
  { id: "vi: không tự gửi báo cáo lỗi hay log", re: /không\s+tự\s+gửi\s+(?:báo cáo|log|nhật ký)/iu },
  { id: "vi: không gửi báo cáo lỗi tự động", re: /không\s+(?:có\s+)?gửi\s+báo cáo(?:\s+lỗi)?\s+tự động/iu },
  { id: "vi: app không tự gửi gì", re: /app\s+không\s+tự\s+gửi\s+gì/iu },
  { id: "vi: bạn tự quyết có gửi hay không", re: /bạn\s+tự\s+quyết(?:\s+định)?\s+có\s+gửi/iu },
  { id: "vi: bạn tự gửi cho chúng tôi", re: /bạn\s+tự\s+gửi\s+cho\s+chúng\s+tôi/iu },
  { id: "vi: log chỉ nằm trên máy", re: /\blog\s+chỉ\s+nằm\s+trên\s+máy/iu },
  { id: "en: sends no automatic crash reports", re: /\b(?:sends?|has)\s+no\s+automatic\s+(?:crash|error)\s+reports\b/i },
  { id: "en: no automatic crash reports", re: /\bno\s+automatic\s+(?:crash|error)\s+reports\b/i },
  { id: "en: never sends logs or anything by itself", re: /\bnever\s+sends?\s+(?:logs?|anything)\b/i },
  { id: "en: you decide whether to send logs", re: /\byou\s+decide\s+whether\s+to\s+send\s+(?:them|the\s+logs?|logs?)\b/i },
  { id: "en: you send them to us yourself", re: /\byou\s+send\s+them\s+to\s+us\s+yourself\b/i },
  { id: "en: logs stay on your computer", re: /\blogs?\s+stay\s+on\s+(?:your|this)\s+(?:computer|machine)\b/i },
];

// Câu cũ (nguyên văn từ website, chính sách 1.2 và chuỗi giao diện trước khi có báo cáo lỗi tự động) mà luật phải bắt.
const STALE_REPORTS_MUST_CATCH = [
  "App không có quảng cáo, không có analytics, không tự gửi báo cáo lỗi.",
  "App không có analytics và không gửi báo cáo lỗi tự động.",
  "Không. Log không chứa âm thanh hay nội dung chép lời, và app không tự gửi log đi đâu.",
  "App không tự gửi gì: bạn tự quyết có gửi cho hỗ trợ hay không.",
  "Log nằm trên máy bạn và không chứa nội dung chép lời; bạn tự quyết định có gửi hay không.",
  "Lưu trên máy bạn, không chứa nội dung chép lời. Khi cần hỗ trợ, bạn tự gửi cho chúng tôi nếu muốn",
  "Log chỉ nằm trên máy này và không bao giờ chứa nội dung cuộc họp.",
  "Ứng dụng không có tài khoản đăng nhập, không có quảng cáo, không có analytics, không gửi báo cáo lỗi tự động.",
  "The app has no ads, no analytics and sends no automatic crash reports.",
  "The app has no sign-in accounts, no advertising, no analytics, and no automatic crash reports.",
  "Logs contain no audio and no transcript text, and the app never sends logs anywhere by itself.",
  "The app never sends anything by itself: you decide whether to send them to support.",
  "Logs stay on your computer and never contain what was said; you decide whether to send them.",
  "Stored on your computer; they do not contain transcript text. If you want support, you send them to us yourself",
  "Stored on your computer and free of transcript content. You decide whether to send them to us.",
];
// Câu đúng của bản mới (nói app có gửi) mà luật KHÔNG được bắt.
const STALE_REPORTS_MUST_KEEP = [
  "Khi app gặp lỗi, nó tự gửi một báo cáo lỗi đã che dữ liệu cá nhân.",
  "Bạn tắt được ở Cài đặt › Quyền riêng tư.",
  "Log không chứa âm thanh hay nội dung chép lời.",
  "Ứng dụng không có tài khoản đăng nhập, không có quảng cáo và không có analytics.",
  "Chỉ phần log liên quan đến một lỗi rời máy, trong báo cáo lỗi đã che dữ liệu cá nhân.",
  "The app has no sign-in accounts, no advertising and no analytics.",
  "When the app hits an error, it sends us the relevant part of the log.",
  "Logs never contain what was said, and personal data is scrubbed before sending.",
  "Audio never leaves your computer.",
];

test("luật câu cũ về báo cáo lỗi (STALE_REPORTS) bắt các câu cũ đã gỡ và không bắt câu đúng của bản mới", () => {
  assert.ok(STALE_REPORTS_MUST_CATCH.length >= 10 && STALE_REPORTS_MUST_KEEP.length >= 5);
  const missed = STALE_REPORTS_MUST_CATCH.filter((s) => staleHits(s, STALE_REPORTS).length === 0);
  assert.deepEqual(missed, [], "câu cũ mà luật không bắt");
  const extra = STALE_REPORTS_MUST_KEEP.filter((s) => staleHits(s, STALE_REPORTS).length > 0).map((s) => `${s} → ${staleHits(s, STALE_REPORTS).map((h) => h.id).join(", ")}`);
  assert.deepEqual(extra, [], "câu đúng mà luật bắt thừa");
});

test("không nguồn chữ nào của site (kể cả chính sách dựng từ docs/legal) và không chuỗi giao diện nào của app (vi, en) còn câu nói app không tự gửi báo cáo lỗi hay log", async () => {
  assert.deepEqual(scanStale(await siteTexts(), STALE_REPORTS), []);
  for (const lang of ["vi", "en"]) {
    const d = await appDict(lang);
    assert.ok(Object.keys(d).length > 100, `${lang}: không đọc được từ điển của app`);
    const bad = Object.entries(d).filter(([, v]) => staleHits(v, STALE_REPORTS).length > 0).map(([k, v]) => `${lang} ${k}: ${v}`);
    assert.deepEqual(bad, [], "chuỗi của app còn câu cũ về báo cáo lỗi (kế hoạch bao-cao-loi-04 phải sửa, cả ja, zh, ko: luật này chỉ đọc vi và en)");
  }
});
```

- [ ] **Step 11: Chạy test website**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -12
```
Expected: `ℹ tests 119`, `ℹ pass 117`, `ℹ fail 0`, `ℹ skipped 2`. Nếu test cuối đỏ ở một dòng `vi about.logsHint` hay `en about.logsHint`, kế hoạch 04 chưa sửa chuỗi đó: sửa ở đó (không nới luật). Đỏ ở một trang của website thì câu cũ còn sót: sửa trang.

- [ ] **Step 12: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add website/src/content website/src/build/build.mjs website/README.md website/test/site.test.mjs && git commit -m "feat(website): các trang nói đúng việc app tự gửi báo cáo lỗi, test chặn câu cũ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ảnh chụp giao diện của website (làm sau khi kế hoạch 04 xong)

**Files:**
- Modify: `website/src/assets/img/app/app-about.{vi,en}.webp`, `app-settings-privacy.{vi,en}.webp`, `app-onboarding-2.{vi,en}.webp`, `manifest.json`

Ba màn hình đổi ở app: Giới thiệu (nút Gửi log cho hỗ trợ), Cài đặt › Quyền riêng tư (công tắc), onboarding bước 2 Điều khoản (ô tùy chọn tích sẵn). Các ảnh khác (bước 8 Quyền riêng tư của onboarding, v.v.) giữ nguyên theo spec 2026-10-17 mục 5. Ảnh chụp từ giao diện thật của `src/` chạy trên trang xem trước với IPC giả (`scripts/ui-preview/`), nên **cần kế hoạch 04 đã làm** (cả mock IPC của trang xem trước nếu kế hoạch 04 thêm trường cài đặt mới).

- [ ] **Step 1: Kiểm công cụ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && command -v cwebp sips && ls "/Applications/Google Chrome.app" >/dev/null && echo "chrome ok" && git status --short | head -5
```
Expected: hai đường dẫn `cwebp` và `sips`, rồi `chrome ok`; cây làm việc sạch (mọi task trước đã commit). Thiếu công cụ (chỉ có trên macOS, cần Chrome) thì dừng và báo: không chụp được trên máy này.

- [ ] **Step 2: Chạy trang xem trước ở nền**

Chạy lệnh này ở **nền** (công cụ Bash với `run_in_background`), ghi lại tiến trình để tắt đúng nó sau này:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vite --config scripts/ui-preview/vite.config.ts
```
Rồi lặp lại lệnh sau tới khi in `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:1430/
```
Expected: `200` (cấu hình đặt cổng 1430 với `strictPort`, đúng cổng mặc định của `shoot.mjs`). Cổng bận thì Vite báo lỗi và thoát: dừng, đừng tắt tiến trình không phải của bạn.

- [ ] **Step 3: Chụp ba cảnh (vi và en)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node scripts/ui-preview/shoot.mjs app-about app-settings-privacy app-onboarding-2
```
Expected: sáu dòng `app-<tên>.<vi|en>.webp <số> B` (ba cảnh × hai ngôn ngữ), không dòng lỗi. Có dòng `cửa sổ vẫn thấp hơn nội dung` hay lỗi console của trang thì dừng và báo.

- [ ] **Step 4: Tắt trang xem trước**

Dừng đúng tác vụ nền ở Step 2 (TaskStop), rồi:

```bash
lsof -ti :1430 || echo "cổng 1430 đã trống"
```
Expected: `cổng 1430 đã trống`. Còn tiến trình do bạn mở thì tắt nó; không tắt tiến trình không phải của bạn.

- [ ] **Step 5: Xem từng ảnh mới**

Mở từng ảnh bằng công cụ Read (đường dẫn tuyệt đối dưới `website/src/assets/img/app/`): `app-about.vi.webp`, `app-about.en.webp`, `app-settings-privacy.vi.webp`, `app-settings-privacy.en.webp`, `app-onboarding-2.vi.webp`, `app-onboarding-2.en.webp`. Xác nhận bằng mắt:
- `app-about`: có nút Mở thư mục log và nút **Gửi log cho hỗ trợ** (en: Send log to support), phần Điều khoản và quyền riêng tư; không lộ tên thư viện hay model.
- `app-settings-privacy`: công tắc **Gửi báo cáo lỗi tự động** (en: Send error reports automatically) đang **bật**, công tắc Lưu lịch sử đang tắt, hai nút xóa.
- `app-onboarding-2`: ô đồng ý bắt buộc và ô tùy chọn gửi báo cáo lỗi tự động **đã tích**.
Thiếu một thành phần thì kế hoạch 04 chưa đưa vào đúng màn hình: dừng và báo; không sửa alt cho khớp ảnh sai.
Riêng `app-about`: nút mới và câu `about.logsHint` dài hơn làm màn hình cao hơn. Ảnh cao 580 px mà hàng nút hay phần Điều khoản và quyền riêng tư bị cắt thì tăng `height` của cảnh `app-about` trong `scripts/ui-preview/shoot.mjs` (kế hoạch 04 Task 7 Step 2), chụp lại, cập nhật cỡ ảnh trong `manifest.json` nếu manifest ghi cỡ, và thêm `scripts/ui-preview/shoot.mjs` vào `git add` của Step 8 cùng các ảnh.

- [ ] **Step 6: Mô tả trong `manifest.json`**

Tệp: `website/src/assets/img/app/manifest.json`

```old
"description": "Màn hình Giới thiệu: tên app, dòng Phiên bản, nút Mở thư mục log, Điều khoản và quyền riêng tư."
```
```new
"description": "Màn hình Giới thiệu: tên app, dòng Phiên bản, nút Mở thư mục log và nút Gửi log cho hỗ trợ, Điều khoản và quyền riêng tư."
```

```old
"description": "The About screen: the app name, the Version line, the Open log folder button, and Terms and privacy."
```
```new
"description": "The About screen: the app name, the Version line, the Open log folder and Send log to support buttons, and Terms and privacy."
```

```old
"description": "Cài đặt quyền riêng tư: lưu lịch sử chép lời mặc định tắt, cùng nút xóa toàn bộ dữ liệu và xóa model."
```
```new
"description": "Cài đặt quyền riêng tư: lưu lịch sử chép lời mặc định tắt, gửi báo cáo lỗi tự động mặc định bật, cùng nút xóa toàn bộ dữ liệu và xóa model."
```

```old
"description": "Privacy settings: saving transcript history is off by default, with buttons to delete all data and to delete models."
```
```new
"description": "Privacy settings: saving transcript history is off by default and sending error reports automatically is on by default, with buttons to delete all data and to delete models."
```

```old
"description": "Bước 2: điều khoản sử dụng, có ô đồng ý với Thỏa thuận cấp phép và Chính sách quyền riêng tư."
```
```new
"description": "Bước 2: điều khoản sử dụng, có ô đồng ý với Thỏa thuận cấp phép và Chính sách quyền riêng tư, và ô tùy chọn gửi báo cáo lỗi tự động đã tích sẵn."
```

```old
"description": "Step 2: terms of use, with a checkbox to accept the License Agreement and the Privacy Policy."
```
```new
"description": "Step 2: terms of use, with a checkbox to accept the License Agreement and the Privacy Policy, and a pre-ticked optional checkbox for automatic error reports."
```

- [ ] **Step 7: Chạy test website (kiểm dung lượng ảnh khớp manifest)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -8 && cd .. && git status --short
```
Expected: `ℹ fail 0`; `git status` liệt kê đúng bảy tệp: sáu `.webp` và `manifest.json` (và không gì khác). Test "manifest ảnh app" đỏ vì lệch dung lượng thì `shoot.mjs` chưa ghi lại manifest: chạy lại Step 3.

- [ ] **Step 8: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add website/src/assets/img/app && git commit -m "docs(website): chụp lại ảnh Giới thiệu, Quyền riêng tư và Điều khoản theo giao diện báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Runbook phát hành

**Files:**
- Modify: `docs/release/phat-hanh.md` (thêm mục 10 ở cuối)

Đây là **tài liệu cho chủ dự án tự chạy**: kế hoạch này không bao giờ chạy lệnh nào ghi vào production. Mẫu là mục 8 (migration D1 0003) của chính runbook; giữ cùng văn phong và ký hiệu `PROD`, `PADMIN`.

- [ ] **Step 1: Thêm mục 10 vào cuối runbook**

Dùng Bash (đây là thêm vào cuối tệp, không phải thay một đoạn): lệnh đầu bảo đảm tệp kết thúc bằng xuống dòng, lệnh sau nối mục mới.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && [ "$(tail -c1 docs/release/phat-hanh.md | wc -l)" -eq 1 ] || printf '\n' >> docs/release/phat-hanh.md
```

````bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cat >> docs/release/phat-hanh.md <<'EOF'

## 10. Đợt thêm báo cáo lỗi tự động (migration D1 0004)

Spec `2026-10-17-diagnostics-reports-design.md` (mục 3, 8 và 9), kế hoạch `2026-10-17-bao-cao-loi-01-server.md` đến `2026-10-17-bao-cao-loi-05-phap-ly-website.md`. **Mỗi bước chỉ làm khi chủ dự án cho phép**; các lệnh ghi vào production do chủ dự án chạy. Thứ tự không đổi được: migration, Worker API, Worker admin, app, website cùng chính sách. Chạy trong `server/`; `PROD` và `PADMIN` như mục 4.

Vì sao thứ tự này: migration 0004 chỉ **thêm** hai bảng (`error_reports`, `error_report_logs`) và ba index, không đổi bảng nào đã có, nên Worker cũ vẫn chạy đúng trên schema mới; Worker API mới cần hai bảng để nhận báo cáo; app mới gọi `POST /v1/diagnostics`, nên server phải lên trước app (app lên trước thì nhận `404`, coi là lỗi vĩnh viễn và bỏ báo cáo: người dùng không thấy lỗi gì nhưng mất báo cáo); website và chính sách chỉ được nói điều đã thật nên đi sau cùng. Hai Worker không ràng buộc nhau chặt như ở mục 8 (Worker admin chỉ đọc và xóa hai bảng mới, Worker API chỉ ghi), nhưng nên lên liền nhau để Web Admin thấy ngay báo cáo.

**Điều kiện trước khi bắt đầu.** Chỉ làm khi đủ cả bốn điều:

- **Mã xong và đã gộp.** Kế hoạch 01 đến 05 đã làm và đã rà, đã gộp vào `main` (chủ dự án quyết lúc nào), CI xanh, `pnpm check` trong `server/` xanh trên `main`.
- **A7 đã chạy lại** bằng proxy trên macOS với một bản build có tính năng này (cách build: `docs/huong-dan-build/build-dmg-macos.md`), có một báo cáo đang xếp hàng trên đĩa: trong lúc dịch không có request nào, và báo cáo chỉ đi tới `api.aitranslator.vn` sau khi phiên dừng. Ghi số đo (ngày, máy, bản dựng). Rồi sửa câu "chúng tôi chưa đo lại điều này bằng proxy" ở mục "Chúng tôi đã kiểm tra điều đó thế nào?" của trang Dữ liệu và bảo mật (`website/src/content/{vi,en}/data-security.mjs`) và đoạn "Báo cáo lỗi, chưa đối chiếu bằng số đo thật" của `docs/legal/README.md` cho khớp số đo.
- **Ngày hiệu lực chính sách 1.3 đã đặt** theo `docs/legal/README.md`, mục "Đổi ngày hiệu lực" (kế hoạch 05, Task 8), **trước khi build app**: app đóng gói chính sách lúc build.
- **Ảnh chụp của website đã được chụp lại** theo giao diện của bản app sắp phát hành (kế hoạch 05, Task 5).

1. **Kiểm trước khi áp (chỉ đọc), ghi lại kết quả để so sau.**

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE name LIKE 'error_report%'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: `time-travel info` in mốc hiện tại (chép lại); câu thứ hai không trả dòng nào (chưa có bảng báo cáo); chép lại ba số của câu thứ ba (`licenses`, `orders`, `orders_seq`); `foreign_key_check` không trả dòng nào. Đã có bảng `error_report%` thì dừng và báo: ai đó đã áp tay.

2. **Áp migration lên production.** Migration chỉ tạo bảng nên không cần khôi phục dữ liệu nếu lỗi (wrangler hoàn tác chính migration đó); vẫn chụp lại mốc:

   ```bash
   pnpm exec wrangler d1 time-travel info mt-license-production
   pnpm exec wrangler d1 migrations apply mt-license-production --remote
   ```

   Expected: `migrations apply` liệt kê chỉ `0004_error_reports.sql`, hỏi xác nhận (trả lời `y`), rồi `✅`. Lỗi thì dừng, không deploy Worker, báo chủ dự án.

3. **Kiểm sau khi áp:**

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT name FROM sqlite_master WHERE (type = 'table' AND name LIKE 'error_report%') OR (type = 'index' AND name LIKE 'error_reports_%') ORDER BY type, name"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT (SELECT COUNT(*) FROM error_reports) AS reports, (SELECT COUNT(*) FROM error_report_logs) AS logs, (SELECT COUNT(*) FROM licenses) AS licenses, (SELECT COUNT(*) FROM orders) AS orders, (SELECT seq FROM sqlite_sequence WHERE name = 'orders') AS orders_seq"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "PRAGMA foreign_key_check"
   ```

   Expected: hai bảng `error_report_logs`, `error_reports` và ba index `error_reports_device`, `error_reports_fingerprint`, `error_reports_received`; `reports` và `logs` đều `0`; `licenses`, `orders`, `orders_seq` **bằng đúng** bước 1 (số đơn không được lùi: PayOS nhớ mọi `orderCode` đã dùng); `foreign_key_check` không trả dòng nào. Lệch thì dừng, không deploy.

4. **Deploy Worker API:**

   ```bash
   pnpm check && pnpm exec wrangler deploy
   curl -s "$PROD/v1/health"; echo
   curl -s -o /dev/null -w '%{http_code}\n' -X POST "$PROD/v1/diagnostics"
   ```

   Expected: như mục 4 bước 9 (`Uploaded mt-license`, `schedule: */5 * * * *`, `{"ok":true}`); câu `curl` cuối in `415` (route có, từ chối vì thiếu `Content-Type: application/json`). **Kiểm cron chạy thật** như mục 4 bước 9: `pnpm exec wrangler tail mt-license --format pretty` qua một mốc 5 phút; Expected: sự kiện cron `*/5 * * * *` có log `{"event":"reconcile",…}` và **không có** `reconcile_step_failed` với `"step":"prune_error_reports"`. Không thấy cron thì `pnpm exec wrangler triggers deploy` rồi kiểm lại (sự cố 2026-10-07).

5. **Deploy Worker admin** (ngay sau bước 4):

   ```bash
   pnpm ui:build && pnpm exec wrangler deploy -c wrangler.admin.jsonc
   curl -s -o /dev/null -w '%{http_code}\n' "$PADMIN/admin/whoami"
   ```

   Expected: như mục 4 bước 10 (khi chưa đăng nhập Access thì không phải `5xx`). Đăng nhập Web Admin: thanh bên có mục **Báo cáo lỗi**, danh sách trống.

6. **Thử bằng một báo cáo giả, trước khi phát hành app.** Báo cáo mang `build: "release"` và phiên bản `0.0.0` để thấy được ở Web Admin (báo cáo `debug` bị ẩn mặc định) và nhận ra ngay là báo cáo thử. Thử ba trường hợp: hợp lệ (`202`), còn mẫu key (`422`, không lưu), sai `Content-Type` (`415`). Hai request đầu cùng một mã máy nên dùng hết 2 trong 3 lượt mỗi giờ của máy đó; đừng chạy lại quá hai lần trong một giờ.

   ```bash
   W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
   HASH=$(printf 'kiem-tra-bao-cao-loi' | shasum -a 256 | cut -d' ' -f1)
   NOW=$(date +%s)
   printf '{"v":1,"id":"R-ZZZZ-0001","kind":"session_error","code":"sidecarFailed","fingerprint":"deadbeefdeadbeef","at":%s,"message":"kiem tra sau trien khai","build":"release","app":{"version":"0.0.0"},"os":{"name":"macos","version":"0","arch":"aarch64"},"hw":{"chip":null,"ram_mb":null,"gpu_backend":null},"model_pack":null,"plan":null,"ui_lang":"vi","device_id_hash":"%s","logs":{"app":"dong log kiem tra\\n","asr":"","llama":""}}' "$NOW" "$HASH" > "$W/ok.json"
   curl -s -w '\n%{http_code}\n' -H 'content-type: application/json' --data-binary @"$W/ok.json" "$PROD/v1/diagnostics"
   sed 's/kiem tra sau trien khai/khoa 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF/; s/R-ZZZZ-0001/R-ZZZZ-0002/' "$W/ok.json" > "$W/nhay-cam.json"
   curl -s -w '\n%{http_code}\n' -H 'content-type: application/json' --data-binary @"$W/nhay-cam.json" "$PROD/v1/diagnostics"
   curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: text/plain' --data-binary @"$W/ok.json" "$PROD/v1/diagnostics"
   ```

   Expected: `{"id":"R-ZZZZ-0001"}` rồi `202`; `{"error":"rejected_sensitive","rule":"license_key"}` rồi `422`; `415`. Ở Web Admin › Báo cáo lỗi có **một nhóm** (`session_error`, `sidecarFailed`, phiên bản `0.0.0`, 1 máy, 1 báo cáo); mở báo cáo thấy dòng log thử ở dạng văn bản. Báo cáo `R-ZZZZ-0002` **không** có (bị từ chối, không lưu). Kiểm cảnh báo: `pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT kind, count FROM ops_alerts WHERE kind = 'error_report_new'"` ra một dòng; thư cảnh báo tới `ops@aitranslator.vn` trong vòng khoảng một giờ (gộp theo giờ) với tiêu đề `[license production] Cảnh báo: error_report_new (1)` và **chỉ có số lượng**, không có nội dung log hay mã máy. Dọn báo cáo thử (bằng nút xóa ở Web Admin, hoặc hai lệnh dưới, bảng log trước), rồi kiểm lại:

   ```bash
   pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM error_report_logs WHERE id = 'R-ZZZZ-0001'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "DELETE FROM error_reports WHERE id = 'R-ZZZZ-0001'"
   pnpm exec wrangler d1 execute mt-license-production --remote --command "SELECT COUNT(*) AS reports FROM error_reports"
   ```

   Expected: câu cuối in `reports` bằng `0`.

7. **Phát hành app** theo mục 2 (nâng phiên bản ở đó). Chính sách 1.3 đã đặt ngày hiệu lực từ trước khi build (điều kiện ở trên). App mới cho người dùng đã cài từ trước bật mặc định báo cáo lỗi, không hỏi và không thông báo (quyết định của chủ dự án, 2026-10-17).

8. **Deploy website cùng chính sách** sau khi bản app đã lên R2 (kiểm R2 ở mục 2): `cd ../website && pnpm deploy` (các lệnh của mục này chạy trong `server/`). Ngày hiệu lực chính sách 1.3 không được muộn hơn ngày deploy (test sitemap của website đỏ nếu `lastmod` ở tương lai, tính theo giờ Việt Nam).

9. **Thử tay với app thật** (bản vừa phát hành, trên máy chưa từng cài, hoặc sau khi xóa dữ liệu): (a) onboarding bước Điều khoản có ô báo cáo lỗi **tích sẵn**; (b) Giới thiệu › Gửi log cho hỗ trợ hiện mã báo cáo, và tìm được báo cáo đó ở Web Admin › Báo cáo lỗi bằng mã; (c) tắt công tắc ở Cài đặt › Quyền riêng tư rồi bấm lại nút gửi tay: vẫn gửi được; (d) xóa báo cáo thử ở Web Admin. Báo cáo thật đầu tiên đến từ máy người dùng: mở xem và kiểm log **không** có đường dẫn thư mục cá nhân, key, token hay email; có thì xóa ngay, và sửa bộ che dữ liệu (kế hoạch 03) trước khi để báo cáo tiếp theo vào.

**Đường lui.** Không có công tắc tắt nhận báo cáo riêng. Muốn dừng nhận khẩn cấp: `pnpm exec wrangler rollback` (Worker API) về bản trước đợt này: route `POST /v1/diagnostics` biến mất, app nhận `404` và bỏ báo cáo, người dùng không thấy lỗi gì. Worker admin lỗi thì `pnpm exec wrangler rollback -c wrangler.admin.jsonc`. Schema mới tương thích với code cũ (code cũ không biết hai bảng); sau khi lùi Worker admin, thao tác xóa theo email **không** xóa báo cáo, nên xóa tay nếu có yêu cầu. Xóa toàn bộ báo cáo: `DELETE FROM error_report_logs` rồi `DELETE FROM error_reports` (hai lệnh `wrangler d1 execute --remote --command`, bảng log trước). Migration 0004 không có bước lùi vì chỉ thêm bảng và không đổi dữ liệu cũ; không cần Time Travel.
EOF
````

- [ ] **Step 2: Kiểm**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -c '^## 10\. Đợt thêm báo cáo lỗi tự động' docs/release/phat-hanh.md && grep -c '^## ' docs/release/phat-hanh.md && tail -c1 docs/release/phat-hanh.md | wc -l
```
Expected: `1`, rồi `10` (mười mục `##`), rồi `1` (tệp kết thúc bằng xuống dòng). Chạy lại Step 1 lần nữa thì mục xuất hiện hai lần: kiểm số `1` trước khi commit.

- [ ] **Step 3: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add docs/release/phat-hanh.md && git commit -m "docs(release): runbook mục 10, đợt thêm báo cáo lỗi tự động (migration 0004)" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `docs/legal/README.md`

**Files:**
- Modify: `docs/legal/README.md`

Các chỗ có **ngày hiệu lực mới** của chính sách 1.3 (dòng đầu và dòng "Mặc định đã chọn") do Task 8 đặt bằng lệnh; Task này không ghi ngày mới.

- [ ] **Step 1: Đoạn mới về chính sách 1.3 và câu về ngày hiệu lực cũ**

Tệp: `docs/legal/README.md`

```old
**Ngày hiệu lực 2026-10-16 do chủ dự án chốt (ngày gộp nhánh `payment` vào `main`)**: ngày này không được muộn hơn ngày deploy website; muốn khớp đúng ngày phát hành thật (khác 2026-10-16) thì đổi ngày theo mục "Đổi ngày hiệu lực" ở cuối file, **trước khi build app phát hành**.
```
```new
**Ngày hiệu lực 2026-10-16 của EULA 1.3 và của chính sách 1.2 do chủ dự án chốt (ngày gộp nhánh `payment` vào `main`; hai bản đó đã phát hành cùng app 0.1.10).** Ngày hiệu lực của chính sách 1.3 đặt theo mục "Đổi ngày hiệu lực" ở cuối file, **trước khi build app phát hành**; ngày này không được muộn hơn ngày deploy website.
```

```old
> **Chưa được luật sư hay kế toán xem.**
```
```new
**Chính sách 1.3 thêm báo cáo lỗi tự động** theo spec `2026-10-17-diagnostics-reports-design.md` (mục 0, 6 và 9): app tự gửi báo cáo lỗi đã che dữ liệu cá nhân tới `POST /v1/diagnostics` (chính sách mục 10; tóm tắt ở mục 2, dữ liệu ở lại trên máy ở mục 3, kết nối mạng ở mục 4, dữ liệu máy chủ ở mục 5, bên xử lý ở mục 6, yêu cầu xóa ở mục 7). Báo cáo gắn với `device_id_hash` nên nối được với license và email; giữ 30 ngày, tối đa 3.000. Tính năng bật mặc định, kể cả với người dùng đã cài từ trước (chủ dự án chọn 2026-10-17: không hỏi, không thông báo trong app). **EULA không đổi** (giữ bản 1.3): EULA chỉ nói ứng dụng "không gửi âm thanh đi đâu" (vẫn đúng) và dẫn tới chính sách cho phần dữ liệu. Mục "Báo cáo lỗi" là mục 10, nên "Thay đổi chính sách" và "Liên hệ" thành mục 11 và 12; các mục 1 đến 9 giữ số để các tham chiếu "mục 5", "mục 6", "mục 7" và test của website vẫn đúng.

> **Chưa được luật sư hay kế toán xem.**
```

- [ ] **Step 2: Mục "Thông tin đã chốt": báo cáo lỗi giữ 30 ngày**

Tệp: `docs/legal/README.md`

```old
- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07):
```
```new
- **Báo cáo lỗi tự động giữ 30 ngày** (tối đa 3.000 báo cáo) rồi tự xóa: dữ liệu kỹ thuật, khác dữ liệu khách hàng giữ không thời hạn (spec 2026-10-17-diagnostics-reports-design §3). Yêu cầu xóa theo email xóa luôn báo cáo của các máy từng kích hoạt key của email đó; báo cáo của máy chỉ dùng thử (không gắn với email) tự hết hạn.
- Bốn gói (từ 2026-10-13; ba gói từ 2026-10-07):
```

- [ ] **Step 3: Bốn rủi ro mới cho luật sư**

Tệp: `docs/legal/README.md`

```old
- **Thời hạn lưu log thư của Resend**: spec yêu cầu ghi vào chính sách; **chưa kiểm**. Hiện chính sách ghi "theo chính sách lưu của Resend".
```
```new
- **Thời hạn lưu log thư của Resend**: spec yêu cầu ghi vào chính sách; **chưa kiểm**. Hiện chính sách ghi "theo chính sách lưu của Resend".
- **Báo cáo lỗi tự động: người dùng cũ không được hỏi hay thông báo.** Chính sách 1.2 (người dùng đã cài từ trước đã đồng ý) ghi log lưu trên máy và người dùng tự gửi khi cần hỗ trợ, và ghi ứng dụng không có báo cáo lỗi tự động. Từ bản app có tính năng này, báo cáo lỗi bật mặc định cho cả họ, không hỏi lại và không thông báo trong app (chủ dự án chọn 2026-10-17, đã được báo rủi ro). Chính sách 1.3 và website được sửa, và chính sách mục 11 nói thông báo "trong ứng dụng hoặc trên website". Hỏi: có đủ không, và có cần cơ chế hỏi lại hay thông báo khi điều khoản đổi (cùng gốc với câu hỏi "Người dùng cũ chưa thấy EULA 1.3…" ở trên).
- **Đồng ý tích sẵn (báo cáo lỗi).** Ô gửi báo cáo lỗi tự động ở bước Điều khoản của onboarding được tích sẵn. Hỏi: ô tích sẵn có được coi là đồng ý hợp lệ không, nhất là với người dùng ở EU hay UK (app bán thẻ USD qua Creem cho người dùng quốc tế); có nên để trống ô hay dựa trên cơ sở pháp lý khác (lợi ích chính đáng), và chính sách có phải nói rõ cơ sở đó không.
- **Báo cáo lỗi gắn được với người.** Báo cáo mang `device_id_hash` của bản quyền, nên nối được với license, email và tên máy (qua `activations`); chính sách mục 10 nói rõ điều này. Hỏi: đây có phải dữ liệu cá nhân cần đánh giá tác động riêng không; thời hạn 30 ngày và việc xóa theo email (xóa báo cáo của các máy từng kích hoạt key của email đó, còn báo cáo của máy chỉ dùng thử tự hết hạn) có đủ không; bên xử lý là Cloudflare (đã ghi ở mục 6).
- **Dữ liệu lạ trong log.** Log do thư viện và hệ điều hành ghi, có thể chứa dữ liệu chưa lường (ví dụ thông báo lỗi có tên file). Giảm bằng che dữ liệu phía app, bỏ cả báo cáo khi còn sót mẫu nhạy cảm, kiểm lại ở server, trần 64 KB, giữ 30 ngày và xóa tay được. Hỏi: mức này có đủ để chính sách nói báo cáo "không gồm" các mục đã liệt kê không (chính sách không hứa "không có dữ liệu cá nhân nào ngoài mã băm ID máy").
```

- [ ] **Step 4: "Đã đối chiếu với sản phẩm thật" và "Cài vào sản phẩm"**

Tệp: `docs/legal/README.md`

```old
server chỉ lưu email, đơn, license, mã băm máy, `device_label`, thời điểm kiểm tra (spec §10.1);
```
```new
server chỉ lưu email, đơn, license, mã băm máy, `device_label`, thời điểm kiểm tra và báo cáo lỗi (spec §10.1);
```

```old
**Chưa đối chiếu:** Buyer Terms của Creem
```
```new
**Báo cáo lỗi, chưa đối chiếu bằng số đo thật:** chính sách mục 10 nói app chỉ gửi báo cáo khi không đang dịch và che dữ liệu trước khi gửi. Điều này được thiết kế và có test ở app và server, nhưng A7 (proxy) **chưa chạy lại** sau khi thêm tính năng, và chưa có báo cáo thật nào từ máy người dùng. Đối chiếu bằng A7 mới và bằng báo cáo thật đầu tiên ở Web Admin; lệch thì sửa chính sách mục 10, các trang website (Dữ liệu và bảo mật, Hỏi đáp, Khắc phục sự cố) và `docs/release/phat-hanh.md` mục 10.

**Chưa đối chiếu:** Buyer Terms của Creem
```

```old
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```
```new
- **Đã làm (báo cáo lỗi, spec `2026-10-17-diagnostics-reports-design.md`):** chính sách mục 10 và các mục 2 đến 7 nhắc tới báo cáo lỗi; website sửa mọi trang nói "không tự gửi" (Trang chủ, Về chúng tôi, Hỏi đáp, Liên hệ, Khắc phục sự cố, Bắt đầu nhanh) và có mục Báo cáo lỗi ở Dữ liệu và bảo mật, kèm test chặn câu cũ; app có ô tích sẵn ở bước Điều khoản, công tắc ở Cài đặt › Quyền riêng tư và nút Gửi log cho hỗ trợ ở Giới thiệu.
- **Chưa làm:** trang giấy phép của bộ cài NSIS
```

- [ ] **Step 5: "Đổi ngày hiệu lực" nói theo từng văn bản**

Tệp: `docs/legal/README.md`

```old
Khi phát hành bản có EULA 1.3 và chính sách 1.2 vào ngày khác 2026-10-16, hoặc khi lên phiên bản mới, đổi ngày **trước khi build app phát hành**.
```
```new
Khi một văn bản lên phiên bản mới (chính sách 1.3 của đợt báo cáo lỗi), hoặc khi phát hành vào ngày khác ngày đã ghi, đổi ngày **trước khi build app phát hành**. Chỉ văn bản nào đổi nội dung mới đổi dòng phiên bản và ngày của nó: đợt báo cáo lỗi chỉ đổi hai file chính sách, EULA giữ bản 1.3 và ngày 2026-10-16.
```

```old
1. Dòng phiên bản và ngày hiệu lực ở đầu **bốn file văn bản** (`eula.vi.md`, `eula.en.md`, `privacy.vi.md`, `privacy.en.md`).
```
```new
1. Dòng phiên bản và ngày hiệu lực ở đầu các file văn bản có đổi (`eula.vi.md` và `eula.en.md` nếu EULA đổi; `privacy.vi.md` và `privacy.en.md` nếu chính sách đổi). Bản tiếng Anh và bản tiếng Việt của cùng một văn bản phải trùng ngày (test của website kiểm). Với chính sách 1.3, lệnh đặt ngày ở kế hoạch `2026-10-17-bao-cao-loi-05-phap-ly-website.md`, Task 8.
```

```old
4. Kiểm còn sót ngày cũ: `git grep -n "<ngày cũ>" -- docs/legal website/src/content` (viết theo ba dạng: `2026-10-16`, `16/10/2026`, `16 October 2026`).
```
```new
4. Kiểm còn sót ngày cũ: `git grep -n "<ngày cũ>" -- docs/legal website/src/content` (viết theo ba dạng: `2026-10-16`, `16/10/2026`, `16 October 2026`). Với chính sách 1.3, ngày cũ 2026-10-16 vẫn đúng ở EULA (không đổi) và ở các dòng lịch sử của README này; chỉ hai file chính sách và hai chỗ nêu ngày chính sách của README được hết ngày đó.
```

- [ ] **Step 6: Kiểm và commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -c 'diagnostics' docs/legal/README.md && git add docs/legal/README.md && git commit -m "docs(legal): README pháp lý theo chính sách 1.3 (báo cáo lỗi), rủi ro cho luật sư" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Expected: số dòng nhắc `diagnostics` ≥ 3 (mốc: 3), rồi commit thành công.

---

### Task 8: Phát hành: nâng chính sách lên 1.3 và đặt ngày hiệu lực

**Làm vào ngày phát hành, trước khi nâng phiên bản và build app** (`docs/legal/README.md`, "Đổi ngày hiệu lực"; `docs/release/phat-hanh.md` mục 10, điều kiện thứ ba). Ngày hiệu lực không được muộn hơn ngày deploy website; lệnh dưới lấy **ngày hôm nay theo giờ Việt Nam** (cùng múi giờ test sitemap của website dùng).

**Files:**
- Modify: `docs/legal/privacy.vi.md`, `docs/legal/privacy.en.md`, `docs/legal/README.md`, `website/test/site.test.mjs`

- [ ] **Step 1: Kiểm cây làm việc sạch và các task trước đã xong**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git status --short | head -5 && git log --oneline main..HEAD | head -20
```
Expected: không có tệp đang sửa; danh sách commit có các commit của Task 1 đến Task 7 của kế hoạch này (và của kế hoạch 01 đến 04 nếu cùng nhánh).

- [ ] **Step 2: Đặt dòng phiên bản 1.3 và ngày, ở bốn nơi, bằng một lệnh**

Lệnh dưới ghi một script tạm ra thư mục tạm (ngoài repo, không commit), chạy nó với ngày hôm nay theo giờ Việt Nam, rồi xóa. Script đổi dòng phiên bản của hai file chính sách và hai chỗ nêu ngày chính sách ở README; mỗi chuỗi cũ phải xuất hiện đúng một lần, nên chạy lần hai (đã đổi rồi) thì báo lỗi và không đổi gì thêm.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && T=$(mktemp -d) && cat > "$T/dat-ngay-chinh-sach.mjs" <<'EOF'
// Đặt chính sách quyền riêng tư 1.3 và ngày hiệu lực ở mọi nơi trong repo. Chạy: node dat-ngay-chinh-sach.mjs <thư mục repo> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from "node:fs";

const [repo, iso] = process.argv.slice(2);
if (!repo || !/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) throw new Error("cách dùng: node dat-ngay-chinh-sach.mjs <thư mục repo> <YYYY-MM-DD>");
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

edit("docs/legal/privacy.vi.md", "**Phiên bản 1.2, hiệu lực từ 16/10/2026.**", `**Phiên bản 1.3, hiệu lực từ ${vi}.**`);
edit(
  "docs/legal/privacy.en.md",
  "**Version 1.2, effective 16 October 2026. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**",
  `**Version 1.3, effective ${en}. If this English translation and the Vietnamese version differ, the Vietnamese version prevails.**`,
);
edit(
  "docs/legal/README.md",
  "**EULA phiên bản 1.3 và chính sách quyền riêng tư phiên bản 1.2, cùng hiệu lực từ 2026-10-16**",
  `**EULA phiên bản 1.3 (hiệu lực từ 2026-10-16) và chính sách quyền riêng tư phiên bản 1.3 (hiệu lực từ ${iso})**`,
);
edit("docs/legal/README.md", "chính sách quyền riêng tư 2026-10-16 (bản 1.2).", `chính sách quyền riêng tư ${iso} (bản 1.3).`);
console.log(`đã đặt chính sách 1.3, hiệu lực ${iso} (${vi} / ${en})`);
EOF
node "$T/dat-ngay-chinh-sach.mjs" "$PWD" "$(TZ=Asia/Ho_Chi_Minh date +%F)"; rm -rf "$T"
```
Expected: một dòng `đã đặt chính sách 1.3, hiệu lực <ngày hôm nay> (<dd/mm/yyyy> / <d tháng yyyy>)`. Lỗi `xuất hiện 0 lần` nghĩa là Task 2 hay Task 7 chưa làm, hoặc lệnh đã chạy rồi.

- [ ] **Step 3: Nâng test của website lên 1.3 và bắt ngày chưa đặt**

Tệp: `website/test/site.test.mjs`

```old
test("chính sách quyền riêng tư 1.2 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```
```new
test("chính sách quyền riêng tư 1.3 nêu Creem là bên bán lại (merchant of record), dữ liệu gửi và Creem tự thu, Creem giữ dữ liệu ngoài yêu cầu xóa, và website trong danh sách kết nối", () => {
```

```old
  const viNeeds = ["Phiên bản 1.2", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.2", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```
```new
  const viNeeds = ["Phiên bản 1.3", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "điền sẵn trang thanh toán", "số thẻ", "loại tiền"];
  const enNeeds = ["Version 1.3", "PayOS", "Creem", "Armitage Labs OÜ", "Estonia", "pre-fill the payment page", "card number", "currency"];
```

```old
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || !/^\*\*Phiên bản 1\.2,/m.test(docs["privacy.vi.md"])) errors.push("giữ EULA 1.3 và chính sách 1.2 (chưa phát hành)");
```
```new
  // EULA giữ bản 1.3, ngày 2026-10-16; chính sách lên 1.3 (báo cáo lỗi tự động) với ngày hiệu lực SAU ngày của bản 1.2 (2026-10-16): ngày
  // chưa được đặt (còn ngày của bản 1.2) thì test đỏ. Đặt ngày bằng lệnh ở kế hoạch bao-cao-loi-05, Task 8, trước khi build app.
  const privacyHead = docHeader(docs["privacy.vi.md"]);
  if (!/^\*\*Phiên bản 1\.3,/m.test(docs["eula.vi.md"]) || privacyHead?.version !== "1.3") errors.push("giữ EULA 1.3 và chính sách 1.3");
  if (!privacyHead || privacyHead.iso <= "2026-10-16") {
    errors.push(`chính sách 1.3 phải có ngày hiệu lực sau 2026-10-16 (ngày của bản 1.2), đang ghi ${privacyHead?.iso}: đặt ngày phát hành thật (docs/legal/README.md, "Đổi ngày hiệu lực")`);
  }
```

```old
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.2: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```
```new
test("Dữ liệu và bảo mật khớp Chính sách quyền riêng tư 1.3: dòng phiên bản lấy từ docs/legal, hàng Creem, mục xóa dữ liệu, email gửi Creem viết chủ động, dấu phẩy", () => {
```

```old
// ---- Hardening Creem D2: website khớp văn bản pháp lý (EULA 1.3, chính sách 1.2): Creem là merchant of record, thuế, hoàn tiền ----
```
```new
// ---- Hardening Creem D2: website khớp văn bản pháp lý (EULA 1.3, chính sách 1.3): Creem là merchant of record, thuế, hoàn tiền, báo cáo lỗi ----
```

- [ ] **Step 4: Kiểm ngày nhất quán giữa vi, en, README và hết ngày cũ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node -e '
const fs = require("fs");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const vi = /^\*\*Phiên bản (\d+\.\d+), hiệu lực từ (\d\d)\/(\d\d)\/(\d{4})\.\*\*$/m.exec(fs.readFileSync("docs/legal/privacy.vi.md", "utf8"));
const en = /^\*\*Version (\d+\.\d+), effective (\d{1,2}) ([A-Z][a-z]+) (\d{4})\./m.exec(fs.readFileSync("docs/legal/privacy.en.md", "utf8"));
const viIso = `${vi[4]}-${vi[3]}-${vi[2]}`;
const enIso = `${en[4]}-${String(MONTHS.indexOf(en[3]) + 1).padStart(2, "0")}-${en[2].padStart(2, "0")}`;
const readme = fs.readFileSync("docs/legal/README.md", "utf8");
const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const checks = [
  ["phiên bản vi và en cùng 1.3", vi[1] === "1.3" && en[1] === "1.3"],
  ["ngày vi bằng ngày en", viIso === enIso],
  ["ngày sau 2026-10-16", viIso > "2026-10-16"],
  ["ngày không ở tương lai (giờ Việt Nam)", viIso <= today],
  ["README ghi ngày đó hai lần", readme.split(`(hiệu lực từ ${viIso})`).length === 2 && readme.split(`chính sách quyền riêng tư ${viIso} (bản 1.3)`).length === 2],
  ["README không còn bản 1.2 của chính sách ở hai chỗ nêu ngày", !readme.includes("chính sách quyền riêng tư phiên bản 1.2, cùng hiệu lực") && !readme.includes("chính sách quyền riêng tư 2026-10-16 (bản 1.2)")],
];
for (const [name, ok] of checks) console.log(ok ? "ok   " : "LỖI ", name);
console.log("ngày hiệu lực:", viIso);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
'
```
Expected: sáu dòng `ok`, rồi `ngày hiệu lực: <ngày hôm nay>`, thoát mã `0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -c '16/10/2026' docs/legal/privacy.vi.md docs/legal/eula.vi.md && grep -c '16 October 2026' docs/legal/privacy.en.md docs/legal/eula.en.md
```
Expected: `docs/legal/privacy.vi.md:0`, `docs/legal/eula.vi.md:1`, rồi `docs/legal/privacy.en.md:0`, `docs/legal/eula.en.md:1` (chính sách hết ngày cũ; EULA vẫn ghi ngày của nó).

- [ ] **Step 5: Chạy test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -8 && cd .. && pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -5
```
Expected: `ℹ fail 0` (số `tests` và `pass` bằng Task 4 Step 11 hoặc Task 5 Step 7: 119 và 117, vì Task 8 chỉ đổi test cũ); rồi `Tests  7 passed (7)`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/README.md website/test/site.test.mjs && git commit -m "docs(legal): chính sách quyền riêng tư lên bản 1.3, đặt ngày hiệu lực theo ngày phát hành" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Kiểm cuối

**Files:** không sửa file (chỉ sửa nếu bước kiểm lộ lỗi, rồi commit riêng).

- [ ] **Step 1: Không còn câu cũ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && grep -rniIE 'không tự gửi (báo cáo|log)|không gửi báo cáo lỗi tự động|app không tự gửi gì|bạn tự quyết( định)? có gửi|bạn tự gửi cho chúng tôi|log chỉ nằm trên máy|no automatic crash reports|sends no automatic|never sends (logs|anything)|you decide whether to send (them|logs)|you send them to us yourself|logs? stay on (your|this) (computer|machine)' docs/legal/privacy.vi.md docs/legal/privacy.en.md docs/legal/eula.vi.md docs/legal/eula.en.md website/src src/i18n docs/release | wc -l
```
Expected: `0` (mốc ở Task 0 Step 5 là 24). Khác `0` thì xem dòng (bỏ `| wc -l`) và sửa, rồi chạy lại. Các tệp `src/i18n/{ja,zh,ko}.ts` không bị luật Latin này bắt: kiểm riêng chuỗi `about.logsHint` của ba ngôn ngữ đó ở kế hoạch 04.

- [ ] **Step 2: Toàn bộ test**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports/website && pnpm test 2>&1 | tail -8 && cd .. && pnpm exec vitest run src/lib/legal.test.ts 2>&1 | tail -5
```
Expected: `ℹ fail 0`, `ℹ tests 119`, `ℹ pass 117`, `ℹ skipped 2`; rồi `Tests  7 passed (7)`. Nếu cả bộ test của app (`pnpm test` ở gốc) được kế hoạch 04 chạy rồi thì không cần chạy lại ở đây.

- [ ] **Step 3: Nhãn trong website khớp app**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node -e '
const fs = require("fs");
const read = (p) => fs.readFileSync(p, "utf8");
const labels = { vi: ["Gửi log cho hỗ trợ", "Gửi báo cáo lỗi tự động"], en: ["Send log to support", "Send error reports automatically"] };
let bad = 0;
for (const [lang, list] of Object.entries(labels)) {
  const app = read(`src/i18n/${lang}.ts`);
  const site = ["docs/legal/privacy." + lang + ".md", ...fs.readdirSync(`website/src/content/${lang}`).map((f) => `website/src/content/${lang}/${f}`)].map(read).join("\n");
  for (const l of list) {
    const inApp = app.includes(`"${l}"`);
    const inSite = site.includes(l);
    if (!inApp || !inSite) { bad++; console.log(`LỖI ${lang} "${l}": trong app ${inApp}, trong website/chính sách ${inSite}`); }
  }
}
console.log(bad === 0 ? "nhãn khớp" : "có nhãn lệch");
process.exit(bad === 0 ? 0 : 1);
'
```
Expected: `nhãn khớp`. Lệch thì sửa theo app (nguồn đúng).

- [ ] **Step 4: Không có chỗ chưa làm trong các tệp đã đổi; danh sách commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git diff main --name-only -- docs/legal docs/release website docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md | xargs grep -nE '\bTBD\b|\bTODO\b|\bFIXME\b' | head; git status --short | head -3; git log --oneline main..HEAD | head -30
```
Expected: `grep` không in dòng nào; `git status` trống; danh sách commit có các commit của kế hoạch này (Task 1 đến Task 8, tám commit; Task 5 chỉ có nếu đã chụp ảnh).

- [ ] **Step 5: Báo cáo**

Ghi lại cho người duyệt: số test website (`pass` so với mốc 114), các test hiện có bị đổi (số mục 11→12, bản 1.2→1.3, kiểm ngày), `git diff --stat main -- docs website` tóm tắt, và nhắc **chưa deploy website, chưa phát hành app, chưa áp migration** (runbook mục 10; chỉ làm khi chủ dự án cho phép), **A7 chưa chạy lại** (trang Dữ liệu và bảo mật đang ghi thẳng điều đó), và ngày hiệu lực chính sách 1.3 phải **không muộn hơn ngày deploy website**.
