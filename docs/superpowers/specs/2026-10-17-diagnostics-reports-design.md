# AI Translator: báo cáo lỗi gửi về nhà phát triển — Design

**Ngày:** 2026-10-17
**Trạng thái:** Chủ dự án đã duyệt thiết kế qua hội thoại ngày 2026-10-17 (các quyết định ở mục 0). Làm trên nhánh `diagnostics-reports` (worktree `meeting-translator-work/diagnostics-reports`), **không merge, không push, không deploy khi chưa được cho phép**.
**Quan hệ với spec khác:** **đổi** cam kết của spec gốc `2026-09-29-desktop-meeting-translator-design.md` §10.1 ("MVP không có analytics và không gửi báo cáo crash. Log nằm trên máy; khi cần hỗ trợ, người dùng tự gửi") và danh sách kết nối mạng của A7 (§3.3 của spec gốc, tiêu chí nghiệm thu). Thêm bảng vào D1 của `2026-10-07-three-plans-single-device-design.md` (§6.8 của spec gốc). Dùng lại: Web Admin (`2026-10-07-web-admin-design.md`), công tắc dev (`2026-10-04-single-production-environment-design.md`), chính sách quyền riêng tư (`docs/legal`).

---

## 0. Yêu cầu và quyết định của chủ dự án

- **Yêu cầu gốc:** làm tính năng cho người dùng gửi log lỗi về cho dev, để dev kiểm tra khi app của người dùng bị lỗi.
- **Gửi tự động**, không chỉ khi người dùng bấm (chủ dự án chọn, đổi cam kết "không gửi báo cáo crash").
- **Đồng ý ở onboarding, tích sẵn** (bỏ tích được). Cài đặt › Quyền riêng tư có công tắc để đổi lại sau.
- **Người dùng đã cài từ trước: không hỏi, không thông báo, giữ bật.** Chủ dự án chọn khi đã được báo: app không có cơ chế hỏi lại khi điều khoản đổi, và Chính sách 1.2 người dùng cũ đã đồng ý ghi "log lưu trên máy, bạn tự gửi nếu muốn". Ghi vào rủi ro (mục 9).
- **Định danh bằng `device_id_hash` của bản quyền**, không dùng mã giả danh riêng. Báo cáo gắn được với license và email qua bảng `activations`.
- **Hướng kỹ thuật:** endpoint mới trên Worker `mt-license` hiện có, lưu D1, xem ở Web Admin. Không dùng dịch vụ crash của bên thứ ba (thêm bên xử lý dữ liệu và host mới, phá danh sách kết nối của A7); không gửi qua email (không nhóm được, log nằm trong hộp thư).

## 1. Khi nào app gửi

Bốn loại báo cáo (`kind`):

| `kind` | Khi nào | Tự động? |
|---|---|---|
| `crash` | Lần chạy trước chết. Hai nguồn: panic hook ghi file `panic.json` (vị trí và câu panic) trước khi abort (bản phát hành build `panic = "abort"`, `lib.rs` đã cài `pipeline::process::install_panic_hook`); hoặc file đánh dấu "đang chạy" còn sót lại mà không có `panic.json` (mã `unclean_exit`). Hai file này là của bản phát hành; bản debug dùng `run.debug.marker` và `panic.debug.json` trong cùng thư mục (hai bản chung identifier nên chung thư mục dữ liệu), để bản phát hành đã cài không báo cái chết của một bản debug thành `crash` của mình. Gửi ở lần mở sau | Có |
| `session_error` | Phiên dịch dừng vì lỗi **của app**: `sidecarFailed`, `sidecarMissing`, `sidecarTampered`, `modelBroken`, `vadFailed`, `captureFailed`, `dataUnavailable`, `unknown` | Có |
| `sidecar_died` | `SidecarEvent::Restarting` của `pipeline::supervisor`: tiến trình phụ chết rồi được app tự khởi động lại | Có |
| `manual` | Người dùng bấm "Gửi log cho hỗ trợ" ở Giới thiệu | Không: bấm tay, gửi ngay, kể cả khi tắt tự động |

**Không gửi** lỗi do môi trường hay người dùng: `audioPermission`, `appNotPlaying`, `quotaExhausted`, `trialEnded`, `trialNeedsNetwork`, `clockRolledBack`, `licenseConflict`, `licenseInvalid`, `licenseNeedsRefresh`, `proRequired`, mọi mã `models*` và `update*`, lỗi phím tắt, lỗi cài đặt. Một test bắt buộc mọi mã trong `errors.rs` nằm đúng một trong hai danh sách (gửi / không gửi), để mã mới thêm sau buộc phải có quyết định.

**Giới hạn phía app** (cho báo cáo tự động):
- **Không bao giờ gửi trong lúc đang dịch** (phiên đang bắt đầu, chạy hay dừng). Báo cáo xếp hàng trên đĩa, gửi khi rảnh. Giữ đúng A7 (không có request mạng lúc dịch ngoài các việc theo lịch đã liệt kê) và không giành băng thông của cuộc họp.
- Mỗi máy: tối đa **1 báo cáo cho mỗi dấu vân tay trong 24 giờ**, tối đa **5 báo cáo mỗi ngày** (ngày UTC). Hàng đợi tối đa **5** báo cáo (đầy thì bỏ cái cũ nhất).
- Gửi nền, **sau khi app chạy ít nhất 10 giây**. Thất bại do mạng hay `5xx`: thử lại ở lần mở sau, tối đa 3 lần rồi bỏ. `4xx` là lỗi vĩnh viễn: bỏ ngay (chỉ ghi lý do vào log). Lỗi mạng của báo cáo tự động không bao giờ hiện lên giao diện.
- **Bản debug không tự gửi**, vì bản dev cũng nối production (CLAUDE.md) và sẽ làm bẩn số liệu. Đặt `AI_TRANSLATOR_DEV_REPORTS=true` trong `.env` để bật lại khi thử; công tắc này theo đúng cơ chế và các lớp chống lọt vào bản phát hành của `AI_TRANSLATOR_DEV_PRO`. Nút gửi tay vẫn chạy ở bản debug; báo cáo mang `build: "debug"` để Web Admin ẩn mặc định.
- Khi làm phải kiểm: tắt máy hay đăng xuất lúc app đang chạy (Windows) **không** được tính là `unclean_exit`.

## 2. Báo cáo chứa gì

JSON, `v: 1`:

```
id            "R-7F3K-92QD"  (R- + 8 ký tự Crockford base32, app sinh ngẫu nhiên; là mã người dùng đọc cho hỗ trợ)
kind, code    kind ở mục 1; code là mã lỗi (null với manual)
fingerprint   16 hex: SHA-256(kind | code | vị trí) cắt 16. Vị trí: file:line của panic; which của sidecar; "unclean" với unclean_exit. Không gồm phiên bản app
at            giờ Unix (giây)
message       tối đa 500 ký tự, đã che
build         "release" | "debug"
app           version
os            name, version, arch
hw            chip hoặc tên CPU, ram_mb, gpu_backend (metal, vulkan hay cpu)
model_pack    tên gói model
plan          free | monthly | six_months | yearly (không có key)
ui_lang       vi | en | ja | zh | ko
device_id_hash  64 hex, hàm license::device::hash_id đang có
logs          app (300 dòng cuối app.log, ≤ 24 KB);
              asr, llama (các dòng cảnh báo hay lỗi của asr-worker.log và llama-server.log, cộng 60 dòng cuối, mỗi file ≤ 16 KB)
```

- **Dòng cảnh báo hay lỗi** của log tiến trình phụ: dòng có mức `W` hoặc `E` (định dạng của llama-server), hoặc khớp không phân biệt hoa thường `error|fail|abort|assert|out of memory|oom|fatal|panic|crash|unable|cannot|exception`. Cách này bỏ hàng trăm dòng biên dịch Metal mỗi lần mở (log thật trên máy dev: `asr-worker.log` khoảng 900/2000 dòng là `ggml_metal_library_compile_pipeline`).
- Tổng JSON ≤ **64 KB**; vượt thì cắt phần cũ nhất của từng log.
- **Không bao giờ gồm:** âm thanh; chữ chép lời hay bản dịch; license key, token, email, `device_label`; tên tài khoản hệ điều hành, tên máy, đường dẫn thư mục cá nhân; địa chỉ IP (server chỉ lưu HMAC của IP để giới hạn tần suất, không lưu IP).
- Đã kiểm trên log thật của máy dev (2026-10-17): `llama-server.log` chỉ có số đo thời gian (các dòng có chữ "prompt" đều là `prompt eval time … tokens`), `asr-worker.log` không có dòng nào có dạng chữ chép lời, `app.log` không có key, token, email hay `Bearer`. Mỗi file `*.log` của sidecar có **19 chỗ chứa đường dẫn có tên tài khoản** (`/Users/<tên>/…`): bắt buộc che.

### Che dữ liệu (phía app, trước khi ghi vào hàng đợi)

- Thay thư mục home, tên tài khoản và tên máy bằng `~`, `<user>`, `<host>`; cả dạng `C:\Users\…` và `file:///…`.
- Che mẫu **license key** (28 ký tự Crockford base32, hiển thị 7 nhóm 4 ký tự nối bằng `-`; `server/src/license-key.ts`), **token** (`v1.<base64url>.<base64url>`; `server/src/token.ts`), `Bearer …`, `Authorization`, địa chỉ email, và phần query của URL.
- **Fail closed:** sau khi che, nếu vẫn còn mẫu nhạy cảm thì **bỏ cả báo cáo** và chỉ ghi lý do (không ghi nội dung) vào log.
- Bộ mẫu và các ca thử nằm ở **một file vector dùng chung** (`server/test/vectors/scrub-v1.json`, theo mẫu `token-v1.json`) để test Rust của app và test TypeScript của server cùng chạy trên đó và không lệch nhau.

## 3. Server (`mt-license`, D1)

- **Endpoint:** `POST /v1/diagnostics`, file mới `server/src/diagnostics.ts` với `registerDiagnostics(app)` nối vào `createApp` (theo mẫu `registerTrial`). Hiện `app.ts` đặt `bodyLimit` 16 KB cho mọi `/v1/*`: **đổi để `/v1/diagnostics` có trần riêng 80 KB**, các route khác giữ 16 KB. Giữ luật 415 (chỉ `application/json`) và HTTPS-only đang có.
- **Không cần token:** app có thể chưa có token (chết lúc onboarding, trước khi đăng ký dùng thử). Chống lạm dụng bằng kích thước, schema và giới hạn tần suất.
- **Phản hồi:** `202 {"id":"…"}`; `400 invalid_request` (schema sai); `413` (quá lớn); `422 rejected_sensitive`; `429` kèm `Retry-After`. Gửi lại cùng `id` thì không tạo bản trùng (`INSERT OR IGNORE`) và vẫn trả `202`.
- **Kiểm schema, không tin app:** `v == 1`; `kind` thuộc bốn giá trị; `id`, `fingerprint`, `device_id_hash` đúng định dạng; `at` trong ±7 ngày so với giờ server; giới hạn độ dài từng trường; mỗi log và tổng đúng trần ở mục 2. Chạy lại cùng bộ mẫu nhạy cảm của vector dùng chung (key, token, Bearer, email, đường dẫn home): khớp thì `422`, **không lưu**.
- **Giới hạn tần suất** (bảng `rate_limits` chỉ có cửa sổ cố định 1 giờ, `server/src/ratelimit.ts`, nên các ngưỡng tính theo giờ): `diag_ip` 30/giờ (HMAC của IP), `diag_device` 3/giờ (HMAC của `device_id_hash`), `diag_global` 120/giờ. Chạm `diag_global` thì `429` và `raiseAlert`.
- **Bảng** (migration `0004`): `error_reports` (metadata: `id` khóa chính, `received_at`, `kind`, `code`, `fingerprint`, `build`, `app_version`, `os_name`, `os_version`, `arch`, `chip`, `ram_mb`, `gpu_backend`, `model_pack`, `plan`, `ui_lang`, `device_id_hash`, `message`; chỉ mục `(fingerprint, received_at)` và `(received_at)`) và `error_report_logs` (`id`, `app_log`, `asr_log`, `llama_log`). Tách ra để trang danh sách không đọc phần log lớn.
- **Giữ 30 ngày, tối đa 3.000 báo cáo.** Bước dọn thêm vào cron `*/5` đang có (`reconcile`): xóa báo cáo quá 30 ngày (tối đa 500 dòng mỗi lần chạy), và xóa báo cáo cũ nhất khi vượt 3.000 (trần dung lượng trong trường hợp bị tấn công; ≤ 192 MB với log đầy 64 KB). Đây là dữ liệu kỹ thuật tự hết hạn, khác với dữ liệu khách hàng giữ không thời hạn ở spec gốc §10.1.
- **Cảnh báo:** thêm hai `AlertKind` vào `alerts.ts` theo cơ chế `ops_alerts` có sẵn: `error_report_new` (có dấu vân tay mới) và `diagnostics_flood` (chạm `diag_global`). Email gộp theo giờ như các cảnh báo khác và **chỉ có số lượng và liên kết tới Web Admin, không có nội dung log**.
- **Xóa theo email** (`POST /admin/erase` ở `server/src/admin.ts`): thêm vào cùng batch việc xóa `error_reports` và `error_report_logs` của các `device_id_hash` thuộc `activations` của license có email đó, **trước** câu `UPDATE licenses SET email = NULL`, và đếm số báo cáo xóa vào dòng nhật ký `personal_data_erased`.

## 4. Web Admin

- Trang mới **Báo cáo lỗi** (theo mẫu `TrialsPage`, `AuditPage`, `detail-kit`, `list-kit`; API ở `admin-read.ts` và `admin.ts`):
  - **Danh sách nhóm** theo `fingerprint` (với `kind` ≠ `manual`): loại, mã lỗi, các phiên bản app, số máy khác nhau, số báo cáo, lần đầu, lần cuối. Lọc theo phiên bản và loại. Ẩn `build = debug` mặc định.
  - **Tab Gửi tay:** báo cáo `manual` xếp theo thời gian, không nhóm; **tìm theo mã báo cáo** `R-XXXX-XXXX` (người dùng đọc cho hỗ trợ).
  - **Chi tiết:** metadata và ba log ở dạng **văn bản thuần** (không render HTML), nút sao chép, liên kết sang trang máy (`DevicePage`) và license theo `device_id_hash`.
  - **Xóa** một báo cáo, hay cả nhóm.
- Nhật ký thao tác (`audit_log`) như mọi trang admin: mỗi lần xem danh sách ghi một dòng `list_viewed` (bộ lọc ghi vào nhật ký không chứa mã máy; ẩn mặc định ở trang Nhật ký), xem chi tiết ghi `error_report_viewed` (chỉ có mã báo cáo), xóa ghi `error_reports_deleted` (kèm số lượng). Xóa không đòi `note` (khác các thao tác trên license): dọn báo cáo là việc thường ngày và nhật ký không chứa dữ liệu cá nhân.
- Trang một nhóm lấy dữ liệu từ danh sách báo cáo lọc theo dấu vân tay; ô tra cứu toàn cục không nhận mã báo cáo (tìm theo mã nằm ở tab Gửi tay).

## 5. App

- **Cài đặt:** khóa mới `sendErrorReports` (Rust `send_error_reports`). Cài mới: `defaults()` đặt **`false`** cho tới khi người dùng qua bước Điều khoản. Bước migrate **`v1→v2`** trong `settings/migrate.rs` (`MIGRATIONS`, `CURRENT_SCHEMA_VERSION` thành 2) đặt `true` cho file cài đặt đã có và `onboardingDone = true`: đây là việc "người dùng cũ giữ bật". File đã có mà `onboardingDone = false` (cài dở) không bị đặt, chờ bước Điều khoản.
- **Onboarding:** ô tick **tích sẵn** ở bước **Điều khoản** (`Onboarding.tsx`, ngay cạnh việc đồng ý Chính sách; điểm móc là chỗ đang gọi `startTrial()` khi bấm Tiếp tục). Không đặt ở bước Quyền riêng tư cuối cùng vì lỗi có thể xảy ra từ bước tải model, trước khi người dùng tới đó. Bỏ tích thì lưu `false`. Một dòng giải thích nói gửi gì, giữ bao lâu, và liên kết "Xem chính sách" (`LegalDocument`).
- **Cài đặt › Quyền riêng tư** (`PrivacySettings.tsx`): công tắc "Gửi báo cáo lỗi tự động", mô tả ngắn gửi gì. Tắt thì **xóa luôn hàng đợi chưa gửi**.
- **Giới thiệu** (`About.tsx`): nút "Gửi log cho hỗ trợ" cạnh "Mở thư mục log". Gửi ngay; hiện **mã báo cáo** kèm nút sao chép; lỗi mạng thì báo "Không gửi được, kiểm tra kết nối"; `429` (đã gửi nhiều lần trong giờ qua) thì báo "Đã gửi quá nhiều, thử lại sau". Báo cáo gửi tay không vào hàng đợi. Câu `about.logsHint` ("Bạn tự gửi cho bộ phận hỗ trợ khi cần") đổi theo thực tế ở cả 5 ngôn ngữ.
- **Rust** (module mới `src-tauri/src/diagnostics/`, tên file là gợi ý cho kế hoạch): che dữ liệu, thu log và thông tin máy, hàng đợi trên đĩa (`<thư mục dữ liệu>/reports/pending/`, kèm `state.json` giữ bộ đếm ngày và thời điểm gửi gần nhất của từng dấu vân tay), gửi, và các điểm kích hoạt (panic hook, file đánh dấu "đang chạy", `session.rs`, `SidecarEvent::Restarting`). Gửi dùng cùng cấu hình URL của `license/client.rs` (một host: `api.`), nên A7 không thêm host mới.
- **Lệnh Tauri mới** `send_log_report` (gửi tay): chỉ cửa sổ chính gọi được; thêm vào `capabilities` và `acl_tests.rs`. Overlay không gọi được.
- **i18n:** mọi chuỗi mới ở đủ 5 ngôn ngữ (vi, en, ja, zh, ko; `dictionaries.test.ts` bắt thiếu khóa).

## 6. Pháp lý, spec gốc, website

Phải sửa cùng đợt, vì CLAUDE.md yêu cầu nội dung chỉ nói điều có thật, và hiện có hơn 30 chỗ cam kết "không tự gửi báo cáo lỗi" (24 ở chính sách, website và chuỗi giao diện; 4 ở spec gốc; 1 ở README pháp lý; 5 chú thích trong mã Rust; kế hoạch 05 liệt kê từng chỗ):

- **Spec gốc:** §10.1 (câu "MVP không có analytics và không gửi báo cáo crash…"); tiêu chí A7 ở §3.3 (thêm `POST /v1/diagnostics` vào các việc được phép, kèm điều kiện "không trong lúc dịch"); hàng "Lộ nội dung cuộc họp" ở bảng rủi ro §10.2 (log vẫn không chứa chữ chép lời; thêm rằng log rời máy chỉ qua báo cáo đã che); và §7 dòng "Số đo từng phiên… không gửi đi đâu" (số đo vẫn nằm trong log, nên nằm trong báo cáo).
- **Chính sách quyền riêng tư** `docs/legal/privacy.vi.md`, `privacy.en.md` lên **bản 1.3**: dòng 12 (không còn "không gửi báo cáo lỗi tự động"), dòng 24 hay mục "Nhật ký hoạt động" (đổi), thêm mục **Báo cáo lỗi** (gửi gì, lúc nào, **gắn với license qua mã băm của máy**, giữ 30 ngày, tắt ở đâu, xóa theo yêu cầu), và `docs/legal/README.md` (phiên bản, ngày hiệu lực). Ngày hiệu lực là ngày phát hành bản app có tính năng này. EULA không đổi.
- **Website** (vi và en): `about`, `faq`, `data-security`, `home`, `guide-troubleshooting` (câu hỏi nhanh và mục "Gửi log và báo lỗi cho hỗ trợ"). Trang chỉ lên cùng bản app (quy trình phát hành 5 bước, `SITE.version` tự theo bản).
- **Không công bố công nghệ lõi** (CLAUDE.md, `website/README.md`, có test chặn): nói "báo cáo lỗi", không nêu tên hạ tầng bên trong.

## 7. Kiểm thử

- **Rust:** ca thử che dữ liệu chạy trên vector dùng chung; fail closed; chọn dòng log (có, và bỏ nhiễu); hàng đợi (trần 5, thử lại 3 lần, `4xx` bỏ ngay); giới hạn 1 báo cáo mỗi vân tay mỗi 24 giờ và 5 mỗi ngày; **không gửi khi phiên đang chạy**; phân loại mã lỗi (mọi mã trong `errors.rs` thuộc đúng một danh sách); migrate `v1→v2` và mặc định `false` của cài mới; ACL của lệnh mới. Test tích hợp: **dựng phiên giả với chữ chép lời có dấu riêng, kiểm báo cáo không chứa chữ đó** (mở rộng test "Log của một phiên dịch không chứa nội dung chép lời" sẵn có).
- **Server (vitest và `test/node`):** schema, 415, 413, `422`, giới hạn tần suất, gửi lại cùng `id`, dọn 30 ngày và trần 3.000, xóa theo email có xóa báo cáo, cảnh báo, và vector dùng chung. Test `wrangler-config` nếu đổi.
- **Web Admin (vitest):** trang danh sách, chi tiết (văn bản thuần, không HTML), tìm theo mã, xóa.
- **App (vitest):** ô tick onboarding (tích sẵn, lưu đúng), công tắc cài đặt, nút Giới thiệu và mã báo cáo, `dictionaries.test.ts`.
- **Website và pháp lý:** test website hiện có (114 test, gồm test chặn công nghệ lõi), `legal.test.ts`.
- **Nghiệm thu A7 lại** bằng proxy mạng: lúc dịch không có request nào, kể cả khi có báo cáo đang xếp hàng; báo cáo chỉ đi tới `api.aitranslator.vn` và chỉ sau khi phiên dừng.
- Cuối cùng: build lại toàn bộ và chạy mọi bộ test (CLAUDE.md, spec §6.12).

## 8. Triển khai và kế hoạch

Năm kế hoạch trong `docs/superpowers/plans/` (ba mảng của thiết kế, tách thêm Web Admin UI và giao diện app vì mỗi phần có bộ test và gói riêng):
1. `2026-10-17-bao-cao-loi-01-server.md`: migration `0004`, endpoint, dọn dẹp, cảnh báo, xóa theo email, API Web Admin, vector dùng chung. **Làm trước**: kế hoạch 03 cần Task 2 (vector) và Task 3, 4 của nó.
2. `2026-10-17-bao-cao-loi-02-admin-ui.md`: trang Báo cáo lỗi của Web Admin. Cần API của kế hoạch 01.
3. `2026-10-17-bao-cao-loi-03-app-loi-cot.md`: lõi Rust của app (che dữ liệu, thu log, hàng đợi, gửi, điểm kích hoạt, cài đặt và migrate, lệnh gửi tay, công tắc dev).
4. `2026-10-17-bao-cao-loi-04-app-giao-dien.md`: giao diện app (onboarding, cài đặt, Giới thiệu, i18n 5 ngôn ngữ). Task 7 cần Task 9 của kế hoạch 03 (ba câu `error.report*`).
5. `2026-10-17-bao-cao-loi-05-phap-ly-website.md`: spec gốc, chính sách 1.3, website, runbook, ảnh chụp (Task 5 cần kế hoạch 04 xong).

Thứ tự deploy: server (áp migration `0004` lên D1 production, deploy `mt-license` rồi `mt-license-admin` liền nhau, **kiểm cron sau deploy** vì từng có sự cố cron không chạy, `wrangler triggers deploy`), rồi phát hành app mới, rồi website cùng chính sách (theo `docs/release/phat-hanh.md`). Server phải có trước app: app mới gọi endpoint chưa có sẽ nhận `404` (lỗi `4xx`, bị bỏ), nên không gây lỗi, nhưng mất báo cáo. **Không deploy, không đẩy tag, không merge khi chưa được cho phép.**

## 9. Rủi ro chủ dự án đã chấp nhận, và câu hỏi cho luật sư

- **Người dùng cũ bị gửi báo cáo mà không được thông báo.** Họ đã đồng ý Chính sách 1.2 ghi log chỉ nằm trên máy. Chính sách 1.3 và website được sửa, nhưng app không hỏi lại và không báo khi cập nhật. Chủ dự án chọn phương án này sau khi được báo (2026-10-17). Câu hỏi cho luật sư: có đủ không; cùng gốc với câu hỏi đã có ở `docs/legal/README.md` (app không có cơ chế hỏi lại khi điều khoản đổi).
- **Đồng ý tích sẵn.** Ô tích sẵn có thể không được coi là sự đồng ý hợp lệ theo luật của một số nơi (ví dụ EU, vì app bán thẻ USD qua Creem cho người dùng quốc tế). Cần luật sư xem.
- **Báo cáo gắn được với người** qua `device_id_hash` (license, email, tên máy). Chính sách ghi rõ; "xóa theo email" xóa luôn báo cáo của các máy đó.
- **Log có thể chứa dữ liệu chưa lường** (ví dụ thông báo lỗi của thư viện chứa tên file). Giảm bằng che dữ liệu, fail closed, kiểm lại ở server, trần 64 KB, giữ 30 ngày, và admin xóa tay được.
- **`unclean_exit` có thể báo nhầm** (tắt máy, hết pin, người dùng kill app). Hiện thành nhóm riêng ở Web Admin, không lẫn với panic. Trường hợp đã gặp thật: báo cáo `R-4C5A-RG44` (2026-10-24) là dấu của một bản debug (`tauri dev`) chết không qua đường thoát (log dừng im lặng, không có panic hay crash report của macOS; cách chết cụ thể chưa xác định) mà bản phát hành đã cài đọc phải; đã tách file dấu theo loại build (§1, bảng `crash`). Người dùng thật chạy một loại build nên không gặp lại kiểu này.
- **Chỉ một người vận hành** xem báo cáo (Cloudflare Access, `ADMIN_EMAILS`), như phần còn lại của Web Admin.

## 10. Không làm

- Không gửi âm thanh, chữ chép lời, bản dịch, key, token, email.
- Không dùng dịch vụ crash hay analytics của bên thứ ba; không thêm host mới.
- Không gửi báo cáo trong lúc dịch.
- Không hỏi hay thông báo người dùng cũ (quyết định của chủ dự án, mục 0).
- Không báo cáo `cpu_fallback` và `OutOfMemory` của tiến trình phụ (có thể thêm sau; chưa có yêu cầu).
- Không thêm màn hình xem trước nội dung báo cáo (có thể thêm sau).
- Không đổi EULA.
