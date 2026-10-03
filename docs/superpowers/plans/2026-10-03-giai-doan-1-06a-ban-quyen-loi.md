# Giai đoạn 1 · 06a: Bản quyền trong app — lõi Rust

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm phần lõi Rust của kế hoạch 06 (mục 2.6 của kế hoạch 00), tức F8 phía app:
- token bản quyền v1 kiểm offline bằng khóa công khai build sẵn (hai khóa mỗi môi trường, để xoay khóa), theo bộ vector của 05;
- license key người dùng gõ, `device_id_hash`, tên máy;
- luật hạn mức của mọi gói (spec §6.8 "Hạn mức"): chu kỳ theo `issued_at`, khóa bộ đếm có `activation_id` và `quota_epoch`, bản ghi đánh dấu, "đồng hồ thật" của Free, chu kỳ cuối ngắn, mất bản ghi; bộ đếm trong kho khóa của hệ điều hành;
- client của license server, trạng thái bản quyền của máy, lịch `validate`, chống chỉnh lùi đồng hồ;
- điểm kiểm tra Pro thật thay `DevGate` của 03; hạn mức chặn phiên mới và dừng phiên đang chạy (`quotaExhausted`); nhắc khi còn 5 phút;
- mua, gia hạn, đổi gói bằng VietQR ngay trong app; 11 lệnh bản quyền cho cửa sổ chính;
- app tự kiểm chữ ký của bản cài (§10.2).

Giao diện (Cài đặt › Bản quyền, màn hình Nâng cấp, hạn mức ở màn hình chính, lời nhắc), thử tay, đợt Windows và cập nhật kế hoạch 00 nằm ở **06b** (`docs/superpowers/plans/2026-10-03-giai-doan-1-06b-ban-quyen-giao-dien.md`). Làm 06a trước, rồi 06b.

**Kiến trúc:**
- Mọi logic bản quyền nằm trong Rust, module `src-tauri/src/license/` (§10.2, "Bị clone"); JavaScript chỉ hiển thị `LicenseView` và gọi lệnh. Mỗi file một việc: `token.rs`, `keys.rs`, `key.rs`, `device.rs`, `quota.rs` (phép tính thuần), `store.rs` (kho khóa), `client.rs` (HTTP), `manager.rs` (trạng thái, không phụ thuộc Tauri), `app.rs` (nối vào Tauri), `purchase.rs`, `genuine.rs`.
- `License` (`manager.rs`) nhận server (`LicenseApi`), kho khóa (`Vault`), khóa công khai, mã máy và múi giờ qua tham số; nơi gọi truyền giờ máy và thời gian đơn điệu. Test chạy với server giả, kho khóa giả, đồng hồ giả và token ký bằng khóa test của bộ vector; không test nào gọi mạng thật hay đọc Keychain thật.
- `LicenseGate` (cài một lần ở chỗ `pro::install_default_gate` của 03) là `ProGate` thật: mọi chỗ 03 đã hỏi `pro::require`, `pro::is_pro` nay theo bản quyền thật. Hạn mức kiểm ở hai chỗ khác: trước khi bắt đầu phiên (`session::start_with`) và mỗi lần cộng phút (`EventSink::usage`).
- Gọi license server bằng `reqwest` đồng bộ trên luồng nền (TLS và proxy của hệ điều hành, cùng cấu hình với 04). URL của staging, production còn trống tới khi 05 Task 19, 21 xong: khi đó app chỉ dùng token đã lưu và Free.

**Công nghệ:** Giữ nguyên Rust 1.98.1, Tauri 2.12.1, React 19.3, Vite 8.3, TypeScript 7.0. Dùng `ed25519-dalek`, `base64`, `reqwest`, `libc` mà 04 đã thêm; thêm `chrono`, `qrcode`, `security-framework`, `core-foundation` (macOS), thêm feature của `windows` (bảng "Phiên bản đã chốt"). Không thêm gói npm nào.

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.6, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Tên file dùng ngày viết `2026-10-03` (Đ1).

Kế hoạch 06 chia hai file, làm theo thứ tự:
1. **06a** (file này): Task 1–11.
2. **06b**: Task 1–8.

Bảng phiên bản, mục "Nối với kế hoạch 04", dòng của bảng đối chiếu, hợp đồng với 05, quyết định (QĐ), điểm cần chủ dự án quyết, kết quả mutation và bảng commit tham chiếu nằm ở file này, dùng chung cho cả hai.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-03, theo §6.12)

Kiểm bằng API của crates.io: bản ổn định mới nhất, ngày phát hành (luật "đã ra ít nhất 1 ngày", mục 6.1 của kế hoạch 00), MSRV, giấy phép, có bị yanked không. Mọi crate build được với Rust 1.98.1; `cargo deny check` sạch. Bốn crate `ed25519-dalek`, `base64`, `reqwest`, `libc` đã có từ 04 (04a, "Phiên bản đã chốt"); 06 dùng đúng bản và feature đó, không thêm dòng nào.

| Thành phần | Phiên bản | Dùng ở | Ghi chú tương thích |
|---|---|---|---|
| ed25519-dalek | 3.0.0 (`default-features = false`) | app (`license/token.rs`) | Bản ổn định mới nhất (2026-07-06), BSD-3-Clause (có trong `deny.toml`), MSRV 1.85. Kéo `curve25519-dalek` 5.0.0, `ed25519` 3.0.0: thuần Rust. Chỉ kiểm chữ ký (`verify_strict`, từ chối khóa yếu và chữ ký không chuẩn); test ký bằng `SigningKey` với khóa test của bộ vector. Cùng bản 04 dùng cho manifest model |
| base64 | 0.23.1 | app | Bản mới nhất (2026-08-04), MIT OR Apache-2.0, MSRV 1.71. Cùng bản `reqwest` kéo vào. `URL_SAFE_NO_PAD` từ chối đệm và bit thừa, khớp vector `malformed` của 05 |
| reqwest | 0.13.5 (đã có ở `pipeline`); app bật `blocking`, `native-tls`, `system-proxy`, `default-features = false` | app (`license/client.rs`) | Bản mới nhất (2026-09-08). Cùng feature 04 chọn (thân JSON tự ghi bằng `serde_json`, không cần feature `json`). TLS của hệ điều hành qua `native-tls` 0.2.18 (2026-02-18; Security.framework trên macOS, SChannel trên Windows): nhận chứng chỉ gốc cài trong máy (proxy công ty), không có OpenSSL, `rustls`, `ring` hay `aws-lc` nào trên macOS (Task 6 kiểm). Không theo redirect |
| chrono | 0.4.45 (`default-features = false`, `clock`, `serde`) | app (`license/quota.rs`) | Bản mới nhất (2026-06-04), MIT OR Apache-2.0, MSRV 1.62. Cùng bản `Cargo.lock` đã có (qua crate khác). `clock` kéo `iana-time-zone` 0.1.65 (2026-01-28) để đọc múi giờ của hệ điều hành cho "ngày" của Free. Cũng dùng để đọc header `Date` (RFC 2822) |
| qrcode | 0.14.1 (`default-features = false`, `svg`) | app (`license/purchase.rs`) | Bản mới nhất (2024-07-05; crate ổn định, ít đổi), MIT OR Apache-2.0, MSRV 1.67.1. Chỉ feature `svg`: không kéo `image` hay crate nào khác |
| libc | 0.2.189 | app (macOS: `gethostuuid`, `gethostname`) | Cùng bản `pipeline` và 04. Bản 0.2.190 ra 2026-10-02 19:33 UTC, chưa đủ 1 ngày lúc kiểm (21:08 UTC), nên chưa dùng |
| security-framework / core-foundation | 3.7.0 / 0.10.1 | app (chỉ macOS, `license/genuine.rs`) | Bản mới nhất (2026-02-20 / 2025-05-26), MIT OR Apache-2.0, MSRV 1.85 / 1.65. Đúng bản `native-tls` đã kéo vào, nên không thêm crate nào vào cây. `SecStaticCode`, `SecRequirement` |
| windows | 0.62.2 (đã có); thêm `Win32_System_Registry`, `Win32_Security_Cryptography`, `Win32_Security_Cryptography_Catalog`, `Win32_Security_Cryptography_Sip`, `Win32_Security_WinTrust` | app (chỉ Windows) | Cùng bản đang dùng (bản mới nhất, 2025-10-06). `RegGetValueW` (MachineGuid), `WinVerifyTrust`, `CertGetNameStringW`. Chỉ kiểm biên dịch trên Mac (`scripts/check-windows.sh`) |

Ghi chú:
- **Không có thư viện mật mã C mới nào.** Ed25519 thuần Rust; TLS là của hệ điều hành. Không thêm `sha2` (đã có), `ring`, `rustls`, OpenSSL.
- **Không thêm gói npm nào**; `pnpm-lock.yaml` giữ nguyên. Mã VietQR vẽ ở phía Rust (SVG), giao diện chỉ hiện.
- `cargo audit`: không thêm cảnh báo nào so với trước 06 (06b Task 5).
- **Không bí mật nào trong app** (spec §10.2): chỉ khóa công khai (`src-tauri/keys/license-public-keys.json`) và URL công khai. Khóa ký token, khóa API của PayOS chỉ nằm trên server và trong CI.

## Cách đọc kế hoạch này

- **Thứ tự và trạng thái đầu.** Làm trên `main`, sau khi 04 đã thực thi xong (`d28fe3b`); cây đầu là `5f48558` (mục "Nối với kế hoạch 04"). Trước mỗi task, `git status` phải sạch. 06a làm hết rồi mới tới 06b.
- **Khối code.**
  - "Tạo `<file>`": chép nguyên khối vào file mới.
  - "Tạo `<file>`, lúc này mới có phần test": file chỉ có các dòng `//!` đầu và khối `#[cfg(test)] mod tests`; bước sau thêm phần code.
  - "Thêm vào `<file>`": chèn khối vào giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`, cách mỗi bên một dòng trống.
  - "Sửa `<file>` (áp bằng `git apply`)": khối `diff` là bản vá chuẩn; lưu khối vào một file tạm rồi chạy `git apply <file tạm>` từ gốc repo. `git apply --check` báo lỗi nghĩa là cây file đã lệch so với kế hoạch: dừng lại, đừng sửa tay cho khớp.
  - "Xóa `<file>`": chạy đúng lệnh `git rm -q` ghi kèm.
  - Mỗi khối `diff` có dòng `index <blob trước>..<blob sau>` (SHA đầy đủ). Nếu cây đã lệch vì `main` có commit mới, `git apply --3way <file tạm>` gộp được, với điều kiện file trước task còn đúng như cây tham chiếu (blob có sẵn trong repo). Khối áp lên file vừa được bước viết test sửa thì blob trước không có sẵn: khi đó thêm tay đúng các dòng `+`, giữ phần của `main`.
- **Khối Expected.** Mọi khối Expected là output thật, lấy từ một lần chạy lại toàn bộ các task từ file kế hoạch trên một bản sao sạch của `5f48558`, với target riêng (2026-10-03). Lệnh đã lọc output (`grep`, `sed`) để Expected không phụ thuộc thời gian chạy; test chạy một luồng (`--test-threads=1`) khi Expected liệt kê tên test, để thứ tự cố định. Bước đỏ chỉ in tối đa 6 dòng lỗi khác nhau (sắp theo chữ cái); output thật có thể dài hơn. Số test là số lúc lập kế hoạch.
- **Môi trường.** Mọi lệnh chạy từ gốc repo, sau `source "$HOME/.cargo/env" && eval "$(fnm env --use-on-cd)"` (Node 24.21.0, pnpm 12.6.0, Rust 1.98.1). Bản sao mới thì chạy `pnpm install --frozen-lockfile` một lần trước task đầu, và `pnpm build` (để `dist/` có sẵn cho `src-tauri`).
- **Không gọi dịch vụ thật, không bật hộp thoại quyền** (mục 6.8 của kế hoạch 00): test dùng server HTTP giả trên `127.0.0.1` (Task 6), `FakeApi`, kho khóa trong bộ nhớ (`FakeVault`, `Keystore::mock`) và token ký bằng khóa test `test-1` của bộ vector; không task nào của 06a mở app, đọc Keychain thật, gọi PayOS, Resend hay license server thật. Task 3 và Task 10 đọc IOPlatformUUID và chữ ký của `/bin/ls`: không cần quyền gì.
- **Staging chưa chạy** (05 Task 19 chưa làm, cần tài khoản Cloudflare và PayOS). Mọi task của 06a chạy được mà không có staging. Phần cần staging nằm ở 06b Task 6 (cần người).
- **Task cần người hoặc Windows:** ở cuối 06b (Task 6, 7).

## Nối với kế hoạch 04

**04 thực thi trước 06** (controller quyết, 2026-10-03). **base: `5f48558`.** Kế hoạch này dựng trên cây cuối của 04: `meeting-translator-work/p04-repo`, nhánh `ref-fix2`, commit `5f48558` (11 commit T1–T11 của 04 cộng 5 commit sửa sau review cuối thực thi 04: QE-1, N-1, N-2, N-4 và race của `run_download`; tất cả trên `main` `d63efc6`). 04 đã thực thi trên `main` cùng các sửa đó (`d28fe3b`); cây code của `main` trùng `5f48558` (`git diff 5f48558 d28fe3b -- . ':!docs'` không in gì, kiểm ngày 2026-10-03). Trước khi làm, kiểm cây của `main` khớp `5f48558` (`git diff --stat 5f48558 HEAD -- src src-tauri crates` không in gì); lệch thì xem mục "Cách đọc" (dùng `--3way`), lệch nhiều thì báo controller để dựng lại 06 trên `main` thật.

06 dùng đúng các crate và feature 04a đã chốt (`ed25519-dalek` 3.0.0, `base64` 0.23.1, `reqwest` 0.13.5 `blocking` + `native-tls` + `system-proxy`, `libc` 0.2.189): không thêm dòng nào cho chúng. Thân JSON của request tự ghi bằng `serde_json`, nên không cần feature `json` của `reqwest`. Mọi chỗ hai kế hoạch cùng đụng đã gộp sẵn trong khối `diff` của 06:

| File | 04 đã có | 06 thêm |
|---|---|---|
| `src-tauri/Cargo.toml` | `base64`, `ed25519-dalek`, `reqwest`, `libc` ở cuối `[dependencies]`; feature `Win32_Storage_FileSystem`, `Win32_System_SystemInformation` của `windows` | `chrono`, `qrcode` ở cuối nhóm; `security-framework`, `core-foundation` (macOS); feature `Win32_System_Registry`, `Win32_Security_*` của `windows`, xếp theo chữ cái |
| `src-tauri/src/session.rs` | `start_with` có `refuse` cho lỗi trước khi bắt đầu (`check_quota`: đang cập nhật model…); đọc cài đặt trước `begin`, ghi `Session.pack` trong `begin` (QE-1); `SessionDeps::models_in_use` | `check_start` của bản quyền chạy trước `check_quota`, cùng đường `refuse` (hết hạn mức thì `quotaExhausted`) |
| `src-tauri/src/commands.rs`, `build.rs`, `capabilities/main.json` | 9 lệnh của màn hình Model | 11 lệnh bản quyền, đặt sau các lệnh của 04 |
| `src/windows/main/main.tsx` | `modelsStore.init()` | `licenseStore.init()` ngay sau |
| `src/windows/main/screens/SettingsScreen.tsx` | nhóm Model (`ModelSettings`); câu mô tả tạm còn cho nhóm Bản quyền | nhóm Bản quyền (`LicenseSettings`); không còn nhóm nào cần câu mô tả tạm |
| `src/windows/main/screens/Home.tsx` | nút mở Cài đặt › Model khi `modelMissing`, `modelBroken` | thời điểm reset và nút nâng gói khi `quotaExhausted` |
| `src-tauri/src/lib.rs`, `state.rs`, `errors.rs`, `navigation.rs`, `app_tests.rs`, `src/lib/ipc.ts`, `src/i18n/*.ts`, `src/styles/main.css`, test fixture của `AppStatus` | phần của model | phần của bản quyền (gộp không xung đột) |
| `src/windows/main/screens/Placeholders.tsx` | không đụng | xóa (khung tạm cuối cùng của 01, chỉ còn màn hình Nâng cấp) |

Nút "Xóa model và dữ liệu" của 04 gọi `data::clear_all_data` của 03: test `wiping_user_data_keeps_the_license_and_the_quota_counters` (Task 5) kiểm cả hai nút không đụng mục bản quyền nào trong kho khóa.

## Dòng của bảng đối chiếu giao cho kế hoạch 06

Lấy từ mục 4 của kế hoạch 00 (các dòng có `06` ở cột kế hoạch). Cột "Task": `a<số>` là 06a, `b<số>` là 06b; dòng nào còn phần của kế hoạch khác hay còn chờ thì ghi rõ.

| # | Yêu cầu (rút gọn) | Phần của 06 | Task |
|---|---|---|---|
| 11 | D11: thanh toán bằng PayOS, VietQR, VND | mua trong app | a9, b3; b6 (người, staging) |
| 13 | P1: 4 gói, hạn mức riêng từng máy, gói trả phí chung tính năng Pro | bảng gói, hạn mức theo `plan` của token, Pro theo gói hiệu lực | a1, a4, a7, a8, b3 |
| 14 | P2: key sau khi PayOS xác nhận; tối đa 2 máy; offline nhờ token, ân hạn 14 ngày; không có tài khoản | kích hoạt, token offline tới `refresh_before`, key đủ 2 máy | a1, a7, a9, b2 |
| 18, 19 | F4, F5: lịch sử, xuất file, từ điển là Pro | `LicenseGate` thay `DevGate` (03 đã hỏi `pro::require`, `pro::is_pro` ở mọi chỗ) | a8; b6 (người) |
| 22 | F8: phân quyền theo gói bằng license key, offline; hạn mức đếm riêng từng máy | cả module `license/` | a1–a10 |
| 44 | Nhắc khi còn 5 phút; hết thì dừng (`quota_exhausted`), báo thời điểm reset, nút nâng gói; X5 không giới hạn | `take_warning`, `AppStatus.quota_warning`, `quota_reset_at`; chặn và dừng phiên | a7, a8, b1, b4 |
| 46 | Màn hình chính: hạn mức còn lại kèm lúc reset | `QuotaView`, màn hình chính | a7, b4 |
| 55 | Cài đặt › Bản quyền: nhập key; gói, trạng thái, hết hạn; hạn mức; gia hạn, đổi gói; gỡ kích hoạt | nhóm Bản quyền | a9, b2 |
| 57 | Hai nút xóa dữ liệu giữ bản quyền và bộ đếm (Q14 của 03) | test `wiping_user_data_keeps_the_license_and_the_quota_counters` | a5 |
| 58 | Màn hình Nâng cấp: 4 gói, email, ô đồng ý, VietQR, gia hạn, đổi gói, không hoàn tiền | màn hình Nâng cấp | a9, b3 |
| 83 | App chỉ gọi server khi mua, kích hoạt, kiểm tra; âm thanh, chữ không qua server | `client.rs` chỉ có các lệnh của hợp đồng 05 | a6; 08 nghiệm thu |
| 178 | Token Ed25519, khóa công khai build sẵn, đủ trường | `token.rs`, `keys.rs`, 30 vector | a1 |
| 179 | `device_id_hash` từ IOPlatformUUID, MachineGuid | `device.rs` | a3; b7 (Win) |
| 180 | Quá `refresh_before` chưa làm mới được thì về Free | `Standing::RefreshNeeded` | a7 |
| 181 | Quá `expires_at`: có mạng thì `validate` trước; về Free khi server xác nhận, hay khi không có mạng | `validate_due`; chờ một lần `validate` tối đa 5 phút (QĐ30); `Standing::Expired`, kết luận của server nhớ qua lần mở lại (QĐ14) | a7 |
| 182 | Mua trong app: gói, email, đồng ý; VietQR tự vẽ, nút mở trang PayOS; hỏi đơn mỗi 3 giây; tự kích hoạt; gia hạn, đổi gói thì `validate`; lưu đơn để hỏi lại | `purchase.rs`, `license-order` | a9, b3; b6 (người, staging) |
| 183 | Gia hạn: nhắc trước 7 ngày và khi đã hết hạn; nút "Gia hạn" | `licenseNotice`, nút ở Cài đặt và thanh báo | a9, b1, b2, b4 |
| 184 | Kiểm tra lúc khởi động và mỗi giờ; quá 24 giờ thì `validate`, kể cả khi chạy liên tục | ticker mỗi phút, `validate_due` | a7, a8 |
| 185 | Máy bị gỡ từ xa về Free ở lần `validate` kế tiếp; offline thì dùng tới `refresh_before` | `validate` (`activation_not_found`) | a7 |
| 186 | Cách đếm phút: `speech_ms` của đoạn đã dịch, không tính `same_lang`… | dùng `EventSink::usage` của 02 (02 đã đếm đúng luật); 06 cộng vào bộ đếm | a8 |
| 187 | Free reset lúc 00:00 giờ máy, khi ngày tăng và đã qua 20 giờ đồng hồ thật | `resolve_free` | a4 |
| 188 | Mất bản ghi khi đã có dữ liệu thì coi như hết; ngày, chu kỳ mới thì từ 0 | `resolve_free`, `resolve_paid` | a4, a7 |
| 189 | `LicenseProvider` (activate, validate, deactivate) | trait `LicenseApi` | a6 |
| 190 | PayOS chỉ nhận ngân hàng Việt Nam | câu ở màn hình Nâng cấp | b3 |
| 239 | Hết hạn mức: dừng, báo thời điểm reset, nút nâng gói | | a8, b4 |
| 240 | License không hợp lệ, hết hạn, thu hồi: về Free, báo lý do | `Standing`, `licenseNotice` | a7, b1, b4 |
| 241 | Mất mạng lúc cần kiểm tra: giữ gói trả phí 14 ngày ân hạn | `refresh_before` | a7 |
| 242 | Key đủ 2 máy (`409`): danh sách máy, gỡ một máy rồi kích hoạt | `ActivateOutcome.devices`, `deactivate_other_device` | a9, b2 |
| 243 | Webhook chậm: app hỏi đơn mỗi 3 giây | `spawn_order_poller` | a9 |
| 245 | Chuyển thiếu, link hết hạn: không cấp, hướng dẫn liên hệ hỗ trợ | `OrderOutcome`, câu theo trạng thái | a9, b1, b3 |
| 254 | Ô đồng ý xử lý email (`consent: true`) | thiếu ô đồng ý thì không gọi server | a9, b3 |
| 262 | Không đầu tư quá tay vào chống crack | QĐ27 | a8, a10 |
| 263 | Kiểm bản quyền ở nhiều chỗ, không dồn vào một biến; làm rối chuỗi | kiểm ở nhiều chỗ: có; làm rối chuỗi: chưa (QĐ27, điểm cần quyết 3) | a8 |
| 264, 308 | Tự kiểm chữ ký (Team ID, tên chủ chứng thư); sai thì chỉ Free, báo "Bản cài không chính hãng" | `genuine.rs`, `Standing::NotGenuine` | a10, b1; Team ID và tên thật ở 07 (Đ14, chờ T1, T2) |
| 265, 310 | Chỉnh đồng hồ: mốc lớn nhất từng thấy; lùi quá 10 phút thì không reset, kiểm online lại, nhắc chỉnh giờ; chu kỳ mới chỉ khi có token qua mốc | `Seen` (so cả với `Date` của server), giờ tin được, `Standing::ClockRolledBack`, `n` theo `issued_at`; Free: bộ đếm "ở tương lai" kéo về, hỏi giờ của server, nhắc cả ở Free (QĐ8, QĐ29, QĐ31) | a4, a7, a8, b1; b6 (người, đổi giờ thật) |
| 266 | Trạng thái bản quyền, bộ đếm trong kho khóa, không file thường | `store.rs` | a5; b6 (người), b7 (Win) |
| 267, 268 | Tối đa 2 máy, khóa tạm `423`; `429` kèm `Retry-After` | `licenseLocked`, `licenseRateLimited`, chờ `Retry-After` | a6, a7 |
| 271 | Link ngoài chỉ mở khi nằm trong danh sách cho phép | `EXTERNAL_HOSTS = ["pay.payos.vn"]` | a9 |
| 275 | Hai khóa công khai, `kid` có số thứ tự | `keys.rs` (ô `a`, `b`) | a1 |
| 289 | Unit test hạn mức | `quota.rs`, `manager.rs` | a4, a7 |
| 290 | Unit test trạng thái bản quyền (ân hạn, thu hồi, tự làm mới khi chạy quá 24 giờ) | `manager.rs` | a7 |
| 309 | Token bị từ chối khi sai chữ ký, máy khác, quá hạn, `kid` lạ | 30 vector | a1 |
| 312 | Overlay gọi lệnh bản quyền thì bị chặn | lệnh mới chỉ ở `capabilities/main.json`; `acl_tests` | a9 |
| 326, 328, 329 | `GET /v1/plans`; đổi gói (ngày quy đổi, ước tính); máy thứ hai nhận gói mới khi `validate` | màn hình Nâng cấp hiện ước tính của server; `validate` | a9, b3 |
| 330–333, 343–347 | Luật hạn mức sau review spec | `quota.rs`, `manager.rs` | a4, a7 |
| 334 | `423 license_locked`, `429` | | a6, a7, b2 |
| 339 | Không có hóa đơn điện tử: app không có ô nhập | màn hình Nâng cấp chỉ có email | b3 |
| 348 | Quy ước API: `snake_case`, `{"error": …}`, giây Unix, `429` kèm `Retry-After`, chỉ HTTPS, gọi từ Rust | `client.rs` | a6 |

## Hợp đồng với kế hoạch 05

- **Bộ vector token:** `server/test/vectors/token-v1.json` (30 token, SHA-256 `f7b6b332f25cbe5ebec012a6f106b9d274175279926d07898cc196d7683c8542`). Test của Task 1 đọc file bằng `include_str!` và kiểm SHA-256: server đổi vector thì test của app đỏ, hai bên phải sửa cùng lúc. Lưu ý phía Rust của Phụ lục C của 05: tự kiểm |n| ≤ 2^53 − 1, thiếu trường là `malformed`, đọc bằng `from_slice`, kiểm đủ định dạng trước khi tra `kid`, có BOM là `malformed`.
- **Key mẫu:** 7 ví dụ `license_keys` trong cùng file (Task 2).
- **Khóa công khai:** `src-tauri/keys/license-public-keys.json` cùng định dạng với `server/keys/public-keys.json` (khối `staging`, `production`, mỗi khối hai ô `a`, `b` dạng `{kid, x}`; có thể có `retired`, `_note`). Nay hai khối còn trống vì server chưa tạo khóa (05 Task 19, 21). Test `the_app_copy_matches_the_server_file_when_it_exists` so hai file khi file của server đã có. Điền ở 06b Task 6 Step 1.
- **API:** đúng mục "Hợp đồng API cho kế hoạch 06" của 05: `GET /v1/plans`, `POST /v1/checkout`, `GET /v1/orders/{order_code}` (header `Authorization: Bearer <order_token>`), `POST /v1/licenses/activate`, `POST /v1/licenses/validate`, `POST /v1/licenses/deactivate`, `POST /v1/licenses/recover`; lỗi `{"error": "<mã>", …}`; bảng "App hiện gì theo `status`".
- **Cửa sổ `quota_fresh`** (mục 21, 26 của `quota-decisions-2.md`; mục 2 của ghi chú review spec lần 5): server đặt `quota_fresh: true` cho mọi token cấp trong 15 phút kể từ mốc gần nhất (tạo activation; token đầu tiên sau khi admin tăng `quota_epoch`, kể cả khi response của token đó mất trên đường; lúc server áp đổi `cycle_anchor`). App không tự tính cửa sổ này: chỉ tin cờ trong response vừa nhận, token đọc lại từ kho khóa luôn là `false` (QĐ7).
- **URL của server:** `client::STAGING_URL`, `PRODUCTION_URL` còn `None`; điền ở 06b Task 6 Step 1 khi 05 Task 19 (staging) và Task 21 (production) xong. Bản debug đặt được `AI_TRANSLATOR_LICENSE_URL=http://127.0.0.1:8787` để thử với `wrangler dev`.

## Sửa sau review lần 1 (2026-10-03)

Review lần 1 (`$S/review-06-r1.md`, trên `0a01ac4`) kết luận "Cần sửa": 0 Nghiêm trọng, 2 Quan trọng, 6 Nhỏ; hai điểm Quan trọng đã được tái hiện bằng test tạm. Bản này sửa như sau; mọi test mới đỏ trước khi sửa code (chạy với stub ở cây tham chiếu).

| Mã | Sửa ở đâu | Cách sửa |
|---|---|---|
| Q1 | 06a Task 4, 5, 7 | `Seen::rolled_back` so cả với header `Date` mới nhất (giờ máy chậm từ trước lần mở app đầu cũng là chỉnh lùi); thời hạn của token so với `Seen::trusted_now`; `license_expired`, `license_revoked` lưu vào `LicenseRecord.verdict` (QĐ8, QĐ14, QĐ15). Test `a_machine_clock_behind_the_server_is_rolled_back`, `a_machine_clock_behind_the_server_from_the_start_is_caught`, `expired_and_revoked_from_the_server_are_kept_across_restarts` |
| Q2 | 06a Task 4, 7, 8; 06b Task 1, 2 | bộ đếm Free "ở tương lai" kéo về hiện tại, giữ `used_ms` (QĐ29); người dùng Free hỏi giờ của server khi giờ máy bị coi là chỉnh lùi (QĐ31); `LicenseView.clock_rolled_back` và lời nhắc ở cả gói Free. Test `a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes` (cả hai chiều), `a_free_user_with_a_clock_set_ahead_gets_the_time_from_the_server` |
| N1 | 06a Task 7 | ghi bị từ chối thì giữ luật chặt tới khi ghi lại được, không đọc lại bộ đếm cũ; gói trả phí lấy số lớn hơn ở lần `validate` sau (QĐ13). Test `a_keystore_that_refuses_writes_never_gives_minutes_back`; QA19 nay bị giết |
| N2 | 06b Task 6 Step 2 | người (không phải agent) xóa thư mục dữ liệu và các mục Keychain của app; Expected "Còn 10 phút" đúng khi cả hai đã xóa |
| N3 | 06a Task 1 | test vector so đủ 13 trường của claims |
| N4 | 06a Task 7 | ở `expires_at`, chờ một lần `validate` tối đa 5 phút (QĐ30). Test `at_expiry_the_plan_waits_for_one_validate_before_going_free` |
| N5 | 06a Task 7, 8 | chưa kiểm xong chữ ký thì chưa mở Pro, chưa báo "không chính hãng" (QĐ26). Test `pro_waits_for_the_build_check` |
| N6 | mục "Nối với kế hoạch 04" | dựng lại trên `5f48558` (04 cộng các sửa sau review cuối thực thi 04, gồm QE-1 ở `session.rs`) |

## Sửa sau review lần 2 (2026-10-03)

Review lần 2 (`$S/review-06-r2.md`, trên `6dff778`) kết luận "Cần sửa": 0 Nghiêm trọng, 3 Quan trọng, 3 Nhỏ; QA, QB và N1 đã được tái hiện bằng test tạm (R2-A, R2-B, R2-D), nay thành test tất định, đỏ trước khi sửa. 06a Task 1–3 không đổi và đã được thực thi trên `main` (`3f570c9`, `06c9dd7`, `48ddb20`, cùng code với chuỗi tham chiếu).

| Mã | Sửa ở đâu | Cách sửa |
|---|---|---|
| QA | 06a Task 4, 7 | `issued_at` đã ký là mốc giờ của server (`Seen::observe_signed`; QĐ8). Test `the_signed_issue_time_counts_as_server_time`, `a_slow_clock_is_caught_by_the_signed_issue_time_without_any_date_header` (R2-A: không có `Date`, xóa `license-seen`, mở lại app) |
| QB | 06a Task 4, 7 | bộ đếm vừa kéo về bỏ hiệu giờ máy tới lần reset sau (`clock_pulled`); `Date` đầu tiên sau đó làm mốc; `refresh_clock` cả khi bộ đếm `clock_pulled` đã sang ngày mới (QĐ29, QĐ31); bảng mô hình đe dọa ở dưới. Test `forward_back_forward_with_the_same_offset_gives_no_new_minutes` (R2-B), `a_pulled_back_free_counter_resets_with_the_server_clock` (chiều trung thực), `a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes` (sửa theo luật mới) |
| QC | 06b Task 6 | còn đúng một Task 6: Step 1, Step 2 mới (người làm, không agent đọc ghi Keychain), Step 3–8 |
| N1 | 06a Task 7 | `accept` ghi lần thử thành công vào `last_attempt` (QĐ15). Test `a_slow_clock_retries_validate_every_five_minutes` (R2-D) |
| N2 | 06a Task 7 | hạn mức theo gói trong lúc chưa kiểm xong chữ ký (`quota_claims`; QĐ26). Test `the_quota_follows_the_plan_while_the_build_check_runs` |
| N3 | spec §10.1, A7 | thêm request `GET /v1/plans` hỏi giờ của server (commit riêng trên `main`, chỉ đổi hai câu đó) |

## Mô hình đe dọa của luật đồng hồ

"Mốc" là giờ lớn nhất trong: giờ máy lớn nhất từng thấy, header `Date` mới nhất, `issued_at` của token đang lưu. Chỉnh lùi là giờ máy nhỏ hơn mốc quá 10 phút. Free reset cần sang ngày mới theo giờ máy và 20 giờ "đồng hồ thật".

| Kịch bản | Kết quả cho người trung thực | Kết quả cho người gian lận | Test |
|---|---|---|---|
| Lùi giờ sau khi đã chạy app, để kéo dài gói hay reset Free | (không áp dụng) | gói trả phí về `ClockRolledBack` (Free) tới khi giờ về đúng; Free không reset (hiệu giờ máy không tính) | `a_clock_moved_back_needs_an_online_check`, `moving_the_clock_does_not_reset_free_but_real_time_does` |
| Giờ máy chậm từ trước lần mở đầu (pin đồng hồ hỏng, hay cố ý) | gói trả phí không dùng được tới khi chỉnh giờ; lời nhắc chỉnh giờ; `validate` 5 phút một lần | như người trung thực: `Date` và `issued_at` cho thấy giờ chậm | `a_machine_clock_behind_the_server_from_the_start_is_caught`, `a_slow_clock_retries_validate_every_five_minutes` |
| Như trên, qua proxy TLS của người dùng xóa `Date` và đổi `license_expired` thành lỗi mạng, hay sửa `license-seen` | (không áp dụng) | vẫn `ClockRolledBack`: `issued_at` đã ký không xóa hay sửa được | `a_slow_clock_is_caught_by_the_signed_issue_time_without_any_date_header` |
| Proxy của người dùng làm giả `Date` (cần tự cài chứng chỉ gốc) | (không áp dụng) | `Date` lớn: tự làm gói hết hạn sớm. `Date` nhỏ: hạ giờ máy lớn nhất nhưng không hạ `issued_at`. Free: tương đương chỉnh giờ tới trước (dòng dưới), mỗi ngày theo giờ máy tối đa một lần reset. Rủi ro chấp nhận (§10.2) | (không có test riêng) |
| Đặt nhầm giờ tới trước (ví dụ +1 năm) rồi chỉnh lại | gói trả phí: có mạng thì `Date` hạ mốc, dùng lại sau lần `validate` (≤ 5 phút); offline thì Free tới khi có mạng. Free: bộ đếm kéo về, không kẹt tới năm sau; reset hôm sau khi qua 20 giờ theo giờ server (có mạng) hay 20 giờ app chạy (offline) | (không áp dụng) | `a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes`, `a_free_user_with_a_clock_set_ahead_gets_the_time_from_the_server`, `a_pulled_back_free_counter_resets_with_the_server_clock` |
| Tiến +1 ngày để reset Free, lùi về, tiến lại (cùng độ lệch hay xa hơn), lặp lại | (không áp dụng) | lần tiến đầu được thêm 10 phút (rủi ro chấp nhận, §10.2); các lần sau không mở thêm phút nào (bộ đếm `clock_pulled`) | `forward_back_forward_with_the_same_offset_gives_no_new_minutes` |
| Tiến giờ mãi, mỗi lần thêm 1 ngày, không lùi về | (không áp dụng) | mỗi lần thêm 10 phút, giờ máy lệch ngày càng xa (lịch, cuộc họp lệch theo). Có mạng cũng vậy, vì giờ máy không bị coi là lùi. Rủi ro chấp nhận, như "chỉnh giờ tới trước" của §10.2; gói trả phí không được lợi (`n` theo `issued_at`) | `the_cycle_follows_the_server_clock_and_never_goes_below_zero` |
| Mất mạng lâu | gói trả phí dùng tới `refresh_before` (14 ngày); Free như thường | (không áp dụng) | `validate_results_move_the_machine_to_the_right_standing` |
| Sửa hay xóa mục bản quyền, bộ đếm trong kho khóa (kể cả khôi phục một token cũ cùng giờ máy giả) | (không áp dụng) | mất bộ đếm thì coi như hết hạn mức; khôi phục token cũ cùng giờ máy giả và `license-seen` đã sửa thì giữ được tính năng Pro tới `refresh_before` của token đó. Rủi ro chấp nhận (§10.2: "MVP không ký hay mã hóa thêm") | `a_marker_without_its_counter_means_the_record_was_lost`, `free_starts_at_zero_on_the_first_run_and_is_used_up_when_its_record_is_lost` |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ31, dùng chung cho 06a và 06b. Các QĐ sửa hay thêm sau review lần 1, lần 2 ghi rõ mã của review.

- **QĐ1. Token kiểm đúng thứ tự của server** (`server/src/token.ts`): định dạng, `kid`, chữ ký (`verify_strict`), máy, `expires_at`, `refresh_before`. `decode` (ba bước đầu) tách khỏi `check` (ba bước sau) để token đã lưu mà hết hạn vẫn đọc được gói, `cycle_anchor` cho màn hình và cho lịch `validate`.
- **QĐ2. Khóa công khai theo môi trường của bản build:** bản debug dùng `staging`, bản phát hành dùng `production`. Không có cách nào đổi môi trường lúc chạy (không biến môi trường, không cài đặt). Một môi trường có hai ô `a`, `b` (khóa đang ký và khóa dự phòng, §10.2); khóa trong `retired` không bao giờ được build vào app.
- **QĐ3. `device_id_hash` = hex chữ thường của SHA-256 trên chuỗi ID phần cứng** (IOPlatformUUID đúng như `ioreg` in, MachineGuid đúng như registry), không thêm muối: cùng một máy thì cùng một giá trị qua các lần cài lại app, để kích hoạt lại không tốn suất. Tên máy chỉ để hiện ở danh sách máy của key.
- **QĐ4. Chu kỳ và hạn mức gói trả phí** theo spec §6.8: `n` theo `issued_at` của token mới nhất, kẹp `n ≥ 0`; mốc đầu chu kỳ = `cycle_anchor + n × 30 ngày`; chu kỳ cuối (mốc kế tiếp sau `expires_at`) có hạn mức `ceil(q × số_ngày / 30)` với số ngày làm tròn lên; `quota_minutes_per_cycle = null` là không giới hạn (X5).
- **QĐ5. Luật chọn bộ đếm gói trả phí** (thứ tự trong `resolve_paid`): đã có bộ đếm của khóa hiện tại (`license_id`, `activation_id`, mốc, epoch) thì dùng (luật 1 của ghi chú review spec lần 5, mục 1; **spec §6.8 chưa có câu này**, 06b Task 8 thêm); `quota_fresh` trong response vừa nhận; epoch của token lớn hơn epoch trong bản ghi đánh dấu; bản ghi đánh dấu có mốc cũ hơn mốc hiện tại; còn lại là mất bản ghi, đã dùng hết. Đổi gói làm `cycle_anchor` đổi nên mốc đổi: server đặt `quota_fresh`, hay bản ghi đánh dấu có mốc cũ hơn, đều bắt đầu từ 0.
- **QĐ6. Free:** một bộ đếm (`quota-free`); lần đầu chạy app (chưa có `settings.json` từ trước, chưa có `license-seen` và bản ghi license) thì bắt đầu từ 0; đã có dữ liệu mà mất bộ đếm thì hết 10 phút của ngày. Reset theo spec (ngày tăng và 20 giờ "đồng hồ thật"). "Ngày" theo múi giờ hiện tại của máy (`chrono::Local`): đổi múi giờ không mở được ngày mới vì vẫn cần 20 giờ.
- **QĐ7. `quota_fresh` chỉ tin trong response vừa nhận** (`Granted.quota_fresh`), không đọc từ token đã lưu.
- **QĐ8. Chống chỉnh lùi đồng hồ:** `license-seen` giữ giờ máy lớn nhất từng thấy (cập nhật mỗi phút) và header `Date` mới nhất. Giờ máy nhỏ hơn mốc quá 10 phút: Free không reset, token trả phí không được tin (`Standing::ClockRolledBack`, chạy Free) tới khi giờ máy về đúng; `validate_due` gọi ngay, thử lại mỗi 5 phút; giao diện nhắc chỉnh giờ. Header `Date` của server (qua TLS) hạ mốc về giờ server khi mốc vượt giờ server quá 10 phút: người từng đặt nhầm giờ tới trước rồi chỉnh lại không bị kẹt mãi ở trạng thái "giờ máy bị chỉnh lùi"; chỉnh lùi thật vẫn bị phát hiện vì giờ máy khi đó nhỏ hơn cả giờ server. Giờ máy chậm hơn header `Date` mới nhất của server quá 10 phút cũng là chỉnh lùi, kể cả khi giờ máy đã chậm từ trước lần mở app đầu tiên; thời hạn của token (`expires_at`, `refresh_before`) so với "giờ tin được" = max(giờ máy, `Date` mới nhất) (Q1 của review lần 1). Máy có giờ chậm thật (pin đồng hồ hỏng) thì phải chỉnh giờ mới dùng được gói trả phí; giao diện nhắc chỉnh giờ ở cả gói Free (`LicenseView.clock_rolled_back`). `issued_at` đã ký của token mới nhất cũng là một mốc giờ của server (`Seen::observe_signed`, mỗi lần đọc token hay nhận token mới): nó không làm giả được và có cả khi offline, khi response không có `Date` (proxy TLS của chính người dùng xóa header) hay khi mục `license-seen` bị sửa (QA của review lần 2).
- **QĐ9. Phút dịch** lấy đúng từ `EventSink::usage` của 02 (đã theo luật đếm của spec §6.8). Bộ đếm Free luôn cộng; bộ đếm gói trả phí cộng khi đang có gói hiệu lực; gói trả phí hết thì Free của ngày cũng hết.
- **QĐ10. Mỗi mục kho khóa là một JSON nhỏ** (dưới 2048 byte, test với token thật của vector). Tên mục của bộ đếm, bản ghi đánh dấu có 32 ký tự hex của SHA-256 khóa (giới hạn tên 64 ký tự của `Keystore`); nội dung giữ đủ khóa, đọc ra mà khóa không khớp thì coi như không có. Bộ đếm cũ của chu kỳ trước không xóa (vài trăm byte mỗi chu kỳ; xóa sẽ mở đường "mất bản ghi" giả).
- **QĐ11. Không theo redirect, chỉ `https`.** Server không bao giờ trả redirect; theo redirect chỉ mở đường cho proxy độc hại đổi đích. Timeout 10 giây kết nối, 20 giây toàn bộ.
- **QĐ12. User-Agent chung** (`AI-Translator`), không có phiên bản app hay hệ điều hành (§10.1: không gửi gì không cần). Không ghi key, token, email vào log.
- **QĐ13. Lỗi kho khóa áp luật chặt:** đọc hay ghi bộ đếm lỗi (kho khóa bị từ chối, mục hỏng) thì coi như hết hạn mức (`licenseStorage` trong log, giao diện báo hết hạn mức); đọc bản ghi license lỗi thì chạy Free ở lần chạy đó (ghi log, không xóa gì), lần mở app sau đọc lại; token đã lưu mà không đọc được (khóa công khai đã đổi, token hỏng) thì `Standing::Unverified`, chạy Free, `validate` khi có mạng. Ghi bị từ chối thì luật chặt giữ tới khi một lần ghi sau thành công (ticker ghi lại mỗi phút); bộ đếm trong bộ nhớ không bị thay bằng bản cũ đọc từ kho khóa, cả với Free (ở `tick`) lẫn gói trả phí (ở lần `validate` sau: lấy số lớn hơn) (N1 của review lần 1). Lý do: kho khóa từ chối có thể do người dùng cố tình chặn để không ghi được bộ đếm.
- **QĐ14. Kết quả của `validate`:** `activation_not_found` (máy bị gỡ) hay `invalid_key`: xóa bản ghi license, về Free. `license_revoked`: `Standing::Revoked`, giữ key. `license_expired`: `Standing::Expired`, giữ key để gia hạn. Hai kết luận này ghi vào bản ghi license (`LicenseRecord.verdict`), nên mở lại app khi offline vẫn đúng; token mới từ server xóa nó (Q1 của review lần 1). Lỗi mạng, `5xx`: giữ token tới `refresh_before`. `429`: chờ đúng `Retry-After`, không coi là lỗi của key.
- **QĐ15. Lịch `validate`** (`validate_due`, ticker mỗi phút): lúc khởi động; quá 24 giờ từ lần thành công gần nhất (thử lại mỗi giờ); giờ máy qua mốc chu kỳ kế tiếp (token mới vẫn trước mốc thì hẹn lại (mốc − `issued_at`) + 1 phút); qua `expires_at` theo giờ tin được, hay server đã báo `license_expired` (có thể đã gia hạn ở máy khác); giờ máy lùi; token đã lưu không đọc được. Ba việc cuối thử lại mỗi 5 phút. Các lần thử gấp tính từ lần thử gần nhất, kể cả lần thành công: giờ máy chậm mà `validate` vẫn thành công thì lần sau là sau 5 phút, không phải mỗi phút (N1 của review lần 2).
- **QĐ16. Gỡ kích hoạt máy này cần mạng:** server phải nhận để trả suất; lỗi mạng thì báo `licenseNetwork`, giữ nguyên. Server trả `activation_not_found` (đã bị gỡ từ máy khác) thì coi là đã gỡ. Gỡ máy khác (từ danh sách `409`) dùng key người dùng vừa gõ, không cần máy này đã kích hoạt.
- **QĐ17. Bản debug không giới hạn** (tiếp QĐ7 của 03): bản debug không đặt `AI_TRANSLATOR_DEV_FREE=1` cài `DevGate` (Pro) và không đếm phút, để dev thử app không bị khóa; đặt biến này thì dùng trạng thái bản quyền thật, như bản phát hành (thử Free, hạn mức, mua trên staging). Bản phát hành luôn dùng `LicenseGate`, không đọc biến này (test chạy ở profile release, 06b Task 5).
- **QĐ18. Nhắc còn 5 phút** một lần cho mỗi bộ đếm (mỗi ngày Free, mỗi chu kỳ gói trả phí), qua `AppStatus.quota_warning` (thanh phụ đề) và `QuotaView` (cửa sổ chính). Sắp hết hạn gói (7 ngày) là lời nhắc riêng ở thanh báo của cửa sổ chính.
- **QĐ19. Phiên "Nghe thử" cũng trừ hạn mức và cũng bị chặn khi hạn mức còn 0** (N13 của review 03). Lý do: phía Rust không giới hạn được độ dài phiên nghe thử (thu toàn hệ thống), nên miễn phí sẽ là đường lách. Ở lần đầu mở, Free còn đủ 10 phút; câu mẫu chỉ khoảng 5 giây.
- **QĐ20. Gate Pro và hạn mức kiểm ở nhiều chỗ** (§10.2 "Crack để dùng Pro"): `pro::require` ở từng lệnh Pro (03), `pro::is_pro` ở việc chạy ngầm (03), `check_start` trước mỗi phiên, `add_usage` mỗi đoạn dịch (dừng phiên khi chạm hạn mức). Không có một biến đúng/sai chung: mỗi chỗ hỏi `License` với giờ hiện tại.
- **QĐ21. Giao diện không bao giờ nhận key đầy đủ, token hay `order_token`** (01 QĐ6): `LicenseView.key` là key đã che (`••••-…-RST5`, 4 ký tự cuối để người dùng nhận ra key); test kiểm sự kiện `license://changed`. Gửi lại key qua email dùng `POST /v1/recover`.
- **QĐ22. Mã VietQR vẽ ở phía Rust** (`qrcode`, SVG) từ chuỗi `qr_code` của checkout: không thêm gói npm, giao diện chỉ chèn SVG do Rust tạo (không có dữ liệu người dùng trong SVG). Nút "Mở trang thanh toán" mở `checkout_url` của đơn đang chờ (Rust giữ) qua `SystemOpener`, chỉ khi host là `pay.payos.vn`.
- **QĐ23. Đơn đang chờ** lưu ở `license-order` (có `order_token`), hỏi mỗi 3 giây trên một luồng nền duy nhất tới khi đơn kết thúc; mở lại app thì hỏi tiếp; giữ thêm 24 giờ sau khi link hết hạn (webhook đến chậm) rồi bỏ. Đơn `paid`: `grant_kind: new` thì kích hoạt key mới (kể cả đơn gia hạn được hỗ trợ cấp key mới, mục 2 của review cuối 05); `extend`, `change` thì `validate`. Đơn `underpaid` hỏi tiếp (khách có thể chuyển bù); `paid_needs_review`, `refunded`, `cancelled`, `expired`, `failed` thì thôi và hiện câu theo bảng của 05.
- **QĐ24. Thiếu ô đồng ý thì không gọi server** (`licenseConsentRequired`); email kiểm sơ bộ (có `@`, có dấu chấm sau `@`, tối đa 254 ký tự), server kiểm kỹ.
- **QĐ25. Lệnh bản quyền chỉ cho cửa sổ chính** (11 lệnh, ba chỗ `commands.rs`, `build.rs`, `capabilities/main.json`); overlay chỉ nhận `AppStatus.quota_warning`, `quota_reset_at` qua `app://status` như cũ.
- **QĐ26. Tự kiểm chữ ký lúc khởi động**, trên luồng ticker, trước lần `validate` đầu, nên không làm chậm lúc mở cửa sổ (macOS kiểm cả code lồng bên trong gói; model không nằm trong gói). Bản phát hành thiếu `AI_TRANSLATOR_TEAM_ID` (macOS) hay `AI_TRANSLATOR_SIGNER` (Windows) lúc build thì không chính hãng: quên cấu hình thì khóa, không mở cho không. 07 đặt hai biến trong CI và thêm một test chạy bản phát hành đã ký (Nhận từ 06 ở kế hoạch 00). Chưa kiểm xong thì chưa mở Pro (`genuine` bắt đầu là "chưa biết"), nhưng cũng chưa báo "không chính hãng": vài giây đầu sau khi mở app, người có gói trả phí thấy tính năng Pro khóa rồi mở (N5 của review lần 1). Trong lúc đó hạn mức vẫn theo gói trả phí (bắt đầu phiên, cộng phút vào bộ đếm của gói), chỉ tính năng Pro chờ (N2 của review lần 2).
- **QĐ27. Mức chống crack** (dòng 262, 263): kiểm ở nhiều chỗ (QĐ20), token ký số, tự kiểm chữ ký; bản phát hành đã có `strip`, `lto`, `codegen-units = 1`, `panic = "abort"` từ GĐ0. **Chưa làm rối chuỗi** liên quan tới bản quyền: lợi ích nhỏ (người crack tìm theo lời gọi hàm, không theo chuỗi), thêm một crate macro. Ghi ở điểm cần quyết 3.
- **QĐ28. Bảng gói lấy từ server** (`GET /v1/plans`: tên, hạn mức, giá); app chỉ giữ mã gói (`pro`, `pro_x2`, `pro_x5`) và gói Free (10 phút mỗi ngày, hằng số của app). Không có mạng thì màn hình Nâng cấp báo cần mạng, không hiện giá cũ.
- **QĐ29. Bộ đếm Free "ở tương lai"** (giờ máy từng đặt tới trước lúc reset, rồi lùi về; Q2 của review lần 1, QB của review lần 2): `resolve_free` kéo `day`, `reset_at` về hiện tại, giữ `used_ms` và thời gian đơn điệu đã đếm, ghi `server_date_at_reset` = `Date` mới nhất (chưa có thì lấy `Date` đầu tiên sau đó), và đánh dấu `clock_pulled`: giờ máy không tin được tới lần reset sau. Lần reset đó cần sang ngày mới **và** 20 giờ thời gian đơn điệu hay hiệu `Date`; hiệu giờ máy không tính. Nhờ vậy đặt giờ tới trước rồi lùi về, lặp lại với cùng độ lệch hay xa hơn, không mở thêm phút nào (bảng "Mô hình đe dọa của luật đồng hồ"). Người trung thực: có mạng thì reset hôm sau khi đã qua 20 giờ theo giờ của server; offline thì khi app đã chạy đủ 20 giờ.
- **QĐ30. Ở `expires_at`, chờ một lần `validate`** (N4 của review lần 1): có server mà chưa thử `validate` nào từ sau mốc thì gói còn dùng được tối đa 5 phút (`EXPIRY_GRACE_SECS`); ticker gọi `validate` trong vòng 1 phút. Đã gia hạn ở máy khác thì nhận token mới và dùng tiếp, không bị dừng phiên; lần thử lỗi mạng hay server báo `license_expired` thì về Free ngay.
- **QĐ31. Người dùng Free cũng lấy giờ của server** (Q2 của review lần 1, QB của review lần 2): chưa có license thì không có `validate`, nên ticker gọi `GET /v1/plans` (không gửi gì của người dùng) tối đa 5 phút một lần khi giờ máy bị coi là chỉnh lùi, hay khi bộ đếm Free đang `clock_pulled` mà đã sang ngày mới, để header `Date` hạ mốc về giờ thật và cho hiệu `Date` của lần reset. Spec §10.1 và A7 ghi request này (`main` `4375a8f`; N3 của review lần 2).

## Điểm cần chủ dự án quyết

1. **Câu "luật 1" trong spec §6.8** (đã có bộ đếm của khóa hiện tại thì dùng nó, trước mọi luật "bắt đầu từ 0" và "mất bản ghi"): ghi chú review spec lần 5 yêu cầu sửa spec cùng lúc với 06. Code đã làm theo; 06b Task 8 Step 2 thêm câu vào spec. **Đề xuất:** duyệt câu ở 06b Task 8.
2. **Gói có hạn mức mà kho khóa lỗi thì khóa dịch** (QĐ13). Phương án khác: cho dịch tới khi kho khóa ghi được lại, chấp nhận lách. **Đề xuất:** giữ luật chặt; lỗi kho khóa trên máy thật hiếm.
3. **Làm rối chuỗi bản quyền** (QĐ27, dòng 263). **Đề xuất:** không làm ở MVP, ghi rủi ro chấp nhận ở §10.2.
4. **Phiên "Nghe thử" trừ hạn mức** (QĐ19). **Đề xuất:** giữ.
5. **Bản debug không giới hạn** (QĐ17), dev thử Free bằng `AI_TRANSLATOR_DEV_FREE=1`. **Đề xuất:** giữ, vì bản phát hành không đọc biến này (có test).

## Kết quả mutation lúc lập kế hoạch

Script ngoài repo `meeting-translator-work/p06gen/mut6.py`, chạy trên cây cuối của 06 (`plan06`). Mỗi mutation sửa đúng một chỗ, chạy bộ test liên quan (lọc theo module), test phải đỏ, rồi trả code về. Trọng tâm theo yêu cầu: luật hạn mức, chống lùi đồng hồ, kiểm chữ ký token; thêm lịch `validate`, mua gói, gate Pro. Kết quả dưới đây là lượt chạy trên cây cuối (`plan06`, base `5f48558`): 80/80 bị giết. Lượt đầu (53 mutation, trên chuỗi dựng thử) có 10 mutation sống; 9 bị giết sau khi thêm test (khóa yếu và chữ ký tầm thường, file chỉ có khối `staging`, token của activation khác, hạn mức không chia hết cho 30, cùng ngày đã qua 20 giờ, Free cộng phút của gói trả phí, kho khóa lỗi, qua `expires_at`); QA19 lúc đó bị ghi nhầm là tương đương (N1 của review lần 1), nay bị giết. Sau review lần 1 thêm 18 mutation (TK11, CL7–CL11, QA24–QA28, VA7–VA11, GT3, UL1); CL8 và QA28 bị giết sau khi thêm test. Sau review lần 2 thêm 9 mutation (CL12–CL18, VA12, GT4), đều bị giết; CL2, QA25 viết lại theo code mới.

| Mã | File | Mutation | Kết quả |
|---|---|---|---|
| TK1 | `license/token.rs` | không kiểm chữ ký Ed25519 | bị giết |
| TK2 | `license/token.rs` | `verify` thay `verify_strict` (nhận chữ ký không chuẩn, khóa yếu) | bị giết |
| TK3 | `license/token.rs` | không kiểm số nguyên an toàn (|n| ≤ 2^53 − 1) | bị giết |
| TK4 | `license/token.rs` | không kiểm `device_id_hash` | bị giết |
| TK5 | `license/token.rs` | đúng lúc `expires_at` vẫn còn hạn | bị giết |
| TK6 | `license/token.rs` | không kiểm `refresh_before` | bị giết |
| TK7 | `license/token.rs` | thiếu `quota_minutes_per_cycle` coi là không giới hạn | bị giết |
| TK8 | `license/token.rs` | nhận payload có BOM, UTF-8 hỏng | bị giết |
| TK9 | `license/keys.rs` | thiếu khối `production` thì dùng khóa `staging` | bị giết |
| TK10 | `license/manager.rs` | nhận token của activation khác | bị giết |
| KE1 | `license/key.rs` | không kiểm ký tự kiểm tra Luhn | bị giết |
| QA1 | `license/quota.rs` | không kẹp `n ≥ 0` | bị giết |
| QA2 | `license/quota.rs` | chu kỳ cuối ngắn làm tròn xuống | bị giết |
| QA3 | `license/quota.rs` | số ngày của chu kỳ cuối không làm tròn lên | bị giết |
| QA4 | `license/quota.rs` | bỏ luật 1 (đã có bộ đếm của khóa hiện tại thì dùng) | bị giết |
| QA5 | `license/quota.rs` | dùng bộ đếm của khóa khác | bị giết |
| QA6 | `license/quota.rs` | bỏ qua `quota_fresh` | bị giết |
| QA7 | `license/quota.rs` | epoch bằng epoch của bản ghi đánh dấu cũng bắt đầu từ 0 | bị giết |
| QA8 | `license/quota.rs` | sang chu kỳ mới không bắt đầu từ 0 | bị giết |
| QA9 | `license/quota.rs` | dùng bản ghi đánh dấu của activation khác | bị giết |
| QA10 | `license/quota.rs` | Free reset không cần 20 giờ | bị giết |
| QA11 | `license/quota.rs` | Free reset không cần sang ngày mới | bị giết |
| QA12 | `license/quota.rs` | mất bộ đếm Free khi đã có dữ liệu thì bắt đầu từ 0 | bị giết |
| QA13 | `license/quota.rs` | dùng hiệu `Date` khi không có `Date` trước lần reset | bị giết |
| QA14 | `license/store.rs` | ghi bản ghi đánh dấu trước bộ đếm | bị giết |
| QA15 | `license/manager.rs` | token đọc lại từ kho khóa coi là `quota_fresh` | bị giết |
| QA16 | `license/manager.rs` | Free không cộng phút dịch lúc ở gói trả phí | bị giết |
| QA17 | `license/manager.rs` | hết gói trả phí mà Free của ngày vẫn còn | bị giết |
| QA18 | `license/manager.rs` | kho khóa lỗi khi ghi bộ đếm gói trả phí mà vẫn dịch được | bị giết |
| QA19 | `license/manager.rs` | kho khóa lỗi khi đọc bộ đếm Free mà vẫn dịch được | bị giết |
| QA20 | `license/manager.rs` | nhắc còn 5 phút lặp lại | bị giết |
| QA21 | `license/app.rs` | hạn mức còn 0 vẫn bắt đầu được phiên | bị giết |
| QA22 | `session.rs` | chạm hạn mức mà phiên không dừng | bị giết |
| QA23 | `license/manager.rs` | đã có `license-seen` mà vẫn coi là lần đầu chạy (Free từ 0) | bị giết |
| CL1 | `license/quota.rs` | dung sai chỉnh lùi 100 phút thay vì 10 | bị giết |
| CL2 | `license/quota.rs` | đồng hồ bị chỉnh lùi mà vẫn tính hiệu giờ máy | bị giết |
| CL3 | `license/quota.rs` | header `Date` không hạ mốc giờ máy (đặt nhầm giờ tới trước thì kẹt mãi) | bị giết |
| CL4 | `license/manager.rs` | giờ máy chỉnh lùi mà vẫn tin token | bị giết |
| CL5 | `license/manager.rs` | giờ máy chỉnh lùi mà không gọi `validate` ngay | bị giết |
| CL6 | `license/manager.rs` | ticker không cập nhật giờ máy lớn nhất | bị giết |
| VA1 | `license/manager.rs` | `validate` mỗi 48 giờ thay vì 24 | bị giết |
| VA2 | `license/manager.rs` | qua `expires_at` mà không gọi `validate` ngay | bị giết |
| VA3 | `license/manager.rs` | token mới vẫn trước mốc chu kỳ mà gọi lại ngay (không hẹn) | bị giết |
| VA4 | `license/manager.rs` | máy bị gỡ từ xa mà vẫn giữ bản ghi license | bị giết |
| VA5 | `license/manager.rs` | license bị thu hồi mà vẫn Pro | bị giết |
| VA6 | `license/manager.rs` | `429` không chờ đúng `Retry-After` | bị giết |
| PU1 | `license/purchase.rs` | tạo đơn không cần ô đồng ý | bị giết |
| PU2 | `license/purchase.rs` | đơn gia hạn được cấp key mới mà vẫn `validate` key cũ | bị giết |
| PU3 | `license/purchase.rs` | đơn `underpaid` thôi hỏi | bị giết |
| PU4 | `navigation.rs` | mở URL ngoài danh sách cho phép | bị giết |
| PU5 | `license/manager.rs` | `LicenseView` mang key đầy đủ | bị giết |
| GT1 | `pro.rs` | bản phát hành chạy Pro không giới hạn (test chạy ở profile release) | bị giết |
| GT2 | `license/genuine.rs` | bản phát hành thiếu Team ID mà vẫn chính hãng (test chạy ở profile release) | bị giết |
| TK11 | `license/token.rs` | đọc `cycle_anchor` từ trường `issued_at` (N3 của review lần 1) | bị giết |
| CL7 | `license/quota.rs` | chỉnh lùi chỉ so với giờ máy lớn nhất, bỏ qua `Date` của server (Q1) | bị giết |
| CL8 | `license/manager.rs` | thời hạn của token so với giờ máy, không với giờ tin được (Q1) | bị giết |
| CL9 | `license/quota.rs` | giờ tin được là giờ máy (Q1) | bị giết |
| CL10 | `license/manager.rs` | Free hỏi giờ server mà không đọc `Date` (Q2) | bị giết |
| CL11 | `license/manager.rs` | Free hỏi giờ server mỗi phút, không giới hạn 5 phút (Q2) | bị giết |
| QA24 | `license/quota.rs` | không kéo bộ đếm Free "ở tương lai" về hiện tại (Q2) | bị giết |
| QA25 | `license/quota.rs` | kéo về mà đặt lại phút đã dùng về 0 (Q2, chiều gian lận) | bị giết |
| QA26 | `license/manager.rs` | ghi Free bị từ chối thì đọc lại bộ đếm cũ (N1) | bị giết |
| QA27 | `license/manager.rs` | `validate` thay bộ đếm gói trả phí trong bộ nhớ bằng bản cũ (N1) | bị giết |
| QA28 | `license/manager.rs` | ticker không ghi lại bộ đếm gói trả phí bị từ chối (N1) | bị giết |
| VA7 | `license/manager.rs` | `license_expired` từ server không đổi trạng thái (Q1) | bị giết |
| VA8 | `license/manager.rs` | kết luận `expired` đã lưu bị bỏ qua (Q1) | bị giết |
| VA9 | `license/manager.rs` | về Free ngay ở `expires_at`, không chờ `validate` (N4) | bị giết |
| VA10 | `license/manager.rs` | chờ `validate` cả khi đã thử sau mốc (N4) | bị giết |
| VA11 | `license/manager.rs` | kết luận của server không ghi vào kho khóa (Q1) | bị giết |
| GT3 | `license/manager.rs` | chưa kiểm xong chữ ký mà đã mở Pro (N5) | bị giết |
| UL1 | `lib/license.ts` | gói Free không nhắc giờ máy chỉnh lùi (Q2) | bị giết |
| CL12 | `license/manager.rs` | mở app không ghi nhận `issued_at` của token đã lưu (QA của review lần 2) | bị giết |
| CL13 | `license/manager.rs` | nhận token mới không ghi nhận `issued_at` (QA) | bị giết |
| CL14 | `license/quota.rs` | `observe_signed` không làm gì (QA) | bị giết |
| CL15 | `license/quota.rs` | bộ đếm vừa kéo về vẫn tính hiệu giờ máy (QB) | bị giết |
| CL16 | `license/quota.rs` | kéo về mà không đánh dấu `clock_pulled` (QB) | bị giết |
| CL17 | `license/manager.rs` | bộ đếm `clock_pulled` sang ngày mới mà không hỏi giờ server (QB) | bị giết |
| CL18 | `license/manager.rs` | `Date` đầu tiên sau khi kéo về không làm mốc (QB) | bị giết |
| VA12 | `license/manager.rs` | `validate` thành công xóa lần thử gần nhất: giờ chậm thì gọi mỗi phút (N1 của review lần 2) | bị giết |
| GT4 | `license/manager.rs` | chưa kiểm xong chữ ký thì hạn mức tính như Free (N2 của review lần 2) | bị giết |

## Bảng task → commit tham chiếu

Cây tham chiếu: `meeting-translator-work/p06-repo`, nhánh `plan06` (dựng bằng cách chạy lại kế hoạch từ file, từ `5f48558`). Mỗi task có code ứng với đúng một commit; cây sau mỗi commit khớp từng byte với chuỗi dựng thử ban đầu (nhánh `p06`).

| Task | Commit | Thông điệp |
|---|---|---|
| 06a Task 1 | `077ba38` | T1: token v1 and public keys |
| 06a Task 2 | `2d2e196` | T2: license key format |
| 06a Task 3 | `cc59076` | T3: device id hash and label |
| 06a Task 4 | `02d8a9d` | T4: quota rules |
| 06a Task 5 | `cb69d8a` | T5: license store in keystore |
| 06a Task 6 | `504ab43` | T6: license server client |
| 06a Task 7 | `6f43296` | T7: license manager |
| 06a Task 8 | `0d760a9` | T8: license wired into the app |
| 06a Task 9 | `1f5935f` | T9: purchase flow and license commands |
| 06a Task 10 | `34959b3` | T10: genuine build self-check |
| 06b Task 1 | `702a252` | B1: license ipc types and store |
| 06b Task 2 | `9c2a89b` | B2: license settings group |
| 06b Task 3 | `4623b45` | B3: upgrade screen |
| 06b Task 4 | `77c3aff` | B4: quota on home, license notices, overlay reset time |

06a Task 11 và 06b Task 5 là kiểm tra, không có commit; 06b Task 6–8 là việc của người, Windows và cập nhật kế hoạch 00.

---

## Task 1: Token v1 và khóa công khai (`license/token.rs`, `license/keys.rs`)

Spec §6.8 "Token bản quyền", §10.2 "Khóa ký token"; hợp đồng với 05 (QĐ4 của 05, `server/src/token.ts`). QĐ1, QĐ2.

- `token::decode` đọc và kiểm định dạng (đủ trường, đúng kiểu, số nguyên an toàn của JavaScript, UTF-8 chặt không BOM), rồi `kid`, rồi chữ ký Ed25519 (`verify_strict`); `token::check` kiểm máy, `expires_at`, `refresh_before`. Thứ tự lỗi đúng `checks_order` của vector.
- Test chạy cả 30 token của `server/test/vectors/token-v1.json` (đọc bằng `include_str!`, kiểm SHA-256 của file đúng bản đã chốt với server); token `ok` so đủ 13 trường của claims với vector (N3 của review lần 1).
- `keys::PublicKeys`: đọc khối `staging` hay `production` của `src-tauri/keys/license-public-keys.json` (định dạng y hệt `server/keys/public-keys.json`, chép nguyên file đó sau 05 Task 19), bỏ qua `retired`, `_note` và khóa lạ ở gốc. Bản debug dùng `staging`, bản phát hành dùng `production`. Hai khối còn trống: mọi token là `unknown_kid`, tức Free, tới khi điền khóa (06b Task 6). Test kiểm bản chép khớp file của server khi file đó đã có.

**Files:**
- Create: `src-tauri/keys/license-public-keys.json`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/license/keys.rs`
- Create: `src-tauri/src/license/mod.rs`
- Create: `src-tauri/src/license/token.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index a4f496e94b3d57e5bf3737bbd3704858b98d1984..41a16c4925065e94b41612af9221bafc8922abff 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -19,6 +19,7 @@
 pub mod hotkey_registry;
 pub mod hotkeys;
 pub mod i18n;
+pub mod license;
 pub mod logging;
 pub mod login_item;
 pub mod models;
```

Tạo `src-tauri/src/license/keys.rs`, lúc này mới có phần test:

```rust
//! Khóa công khai kiểm token bản quyền (spec §10.2, "Khóa ký token"): mỗi môi trường hai ô `a`, `b` (khóa đang ký và khóa
//! dự phòng), tra theo `kid`. File `src-tauri/keys/license-public-keys.json` chép nguyên từ `server/keys/public-keys.json`
//! của license server (kế hoạch 05): app chỉ đọc khối của môi trường mình, bỏ qua `retired` (khóa đã bỏ), `_note` và mọi
//! khóa lạ ở gốc file.

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "_note": "ghi chú",
        "staging": {
            "a": {"kid": "stg-2026-10-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"},
            "b": {"kid": "stg-2026-10-2", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"}
        },
        "production": {
            "a": {"kid": "prod-2026-10-1", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"}
        },
        "retired": [{"kid": "stg-2026-09-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}],
        "something_new": 1
    }"#;

    #[test]
    fn each_environment_reads_only_its_own_slots() {
        let staging = PublicKeys::from_json(SAMPLE, LicenseEnv::Staging).unwrap();
        assert!(staging.get("stg-2026-10-1").is_some() && staging.get("stg-2026-10-2").is_some());
        assert!(staging.get("prod-2026-10-1").is_none());
        assert!(
            staging.get("stg-2026-09-1").is_none(),
            "khóa đã bỏ (`retired`) không dùng"
        );
        let production = PublicKeys::from_json(SAMPLE, LicenseEnv::Production).unwrap();
        assert!(production.get("prod-2026-10-1").is_some());
        assert!(production.get("stg-2026-10-1").is_none());
    }

    #[test]
    fn a_missing_environment_is_empty_and_bad_keys_are_refused() {
        assert!(
            PublicKeys::from_json(r#"{"staging": {}}"#, LicenseEnv::Production)
                .unwrap()
                .is_empty()
        );
        // Chỉ có khối `staging`: `production` rỗng, không mượn khóa của staging.
        let only_staging =
            r#"{"staging": {"a": {"kid": "stg-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}}}"#;
        assert!(
            PublicKeys::from_json(only_staging, LicenseEnv::Production)
                .unwrap()
                .is_empty()
        );
        assert!(
            !PublicKeys::from_json(only_staging, LicenseEnv::Staging)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            PublicKeys::from_json("[]", LicenseEnv::Staging),
            Err(KeysError::NotObject)
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"staging": {"a": {"kid": "k", "x": "AAAA"}}}"#, LicenseEnv::Staging),
            Err(KeysError::BadKey("k".into()))
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"staging": {"a": {"kid": "k"}}}"#, LicenseEnv::Staging),
            Err(KeysError::BadEnv("staging".into()))
        );
    }

    /// File build sẵn đọc được ở cả hai môi trường; bản debug dùng staging, bản phát hành dùng production.
    #[test]
    fn the_embedded_file_parses_for_both_environments() {
        PublicKeys::from_json(EMBEDDED, LicenseEnv::Staging).unwrap();
        PublicKeys::from_json(EMBEDDED, LicenseEnv::Production).unwrap();
        assert_eq!(LicenseEnv::current() == LicenseEnv::Staging, cfg!(debug_assertions));
    }

    /// Bản chép của app phải khớp `server/keys/public-keys.json` khi file đó đã có (sau kế hoạch 05, Task 19): cùng các
    /// khóa của `staging` và `production`.
    #[test]
    fn the_app_copy_matches_the_server_file_when_it_exists() {
        let server = concat!(env!("CARGO_MANIFEST_DIR"), "/../server/keys/public-keys.json");
        let Ok(text) = std::fs::read_to_string(server) else {
            return;
        };
        for env in [LicenseEnv::Staging, LicenseEnv::Production] {
            assert_eq!(
                PublicKeys::from_json(EMBEDDED, env).unwrap(),
                PublicKeys::from_json(&text, env).unwrap(),
                "{env:?}: chép lại server/keys/public-keys.json vào src-tauri/keys/license-public-keys.json"
            );
        }
    }
}
```

Tạo `src-tauri/src/license/mod.rs`:

```rust
//! Bản quyền trong app (kế hoạch 06; spec §6.8, §10.2): token bản quyền, hạn mức, kích hoạt và mua gói.
//!
//! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
//!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.

pub mod keys;
pub mod token;
```

Tạo `src-tauri/src/license/token.rs`, lúc này mới có phần test:

```rust
//! Token bản quyền v1 (spec §6.8 "Token bản quyền", §10.2; kế hoạch 05, QĐ4):
//! `v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>`, base64url không đệm.
//!
//! Thứ tự kiểm, giống hệt `server/src/token.ts`: định dạng (đủ trường, đúng kiểu), `kid`, chữ ký, máy, `expires_at`, rồi
//! `refresh_before`. Token có nhiều lỗi thì trả lỗi đứng trước. Hợp đồng chốt bằng 30 vector ở
//! `server/test/vectors/token-v1.json`:
//! - mọi số nguyên phải là số nguyên an toàn của JavaScript (|n| ≤ 2^53 − 1), vì server sinh token bằng JavaScript;
//! - thiếu trường là `malformed`, kể cả `quota_minutes_per_cycle` (giá trị `null` mới là không giới hạn);
//! - payload là UTF-8 chặt, không có BOM (`serde_json::from_slice` trên byte đã giải mã);
//! - kiểm đủ định dạng trước khi tra `kid` và kiểm chữ ký.
//!
//! `quota_fresh` chỉ đúng trong response vừa nhận từ server (spec §6.8): token đọc lại từ kho khóa phải coi là `false`
//! (việc của nơi gọi).

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    /// Bộ vector dùng chung với license server (kế hoạch 05, Task 6; Đ9 của kế hoạch 00).
    const VECTORS: &str = include_str!("../../../server/test/vectors/token-v1.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).unwrap()
    }

    fn keys(v: &Value) -> PublicKeys {
        let pairs = v["public_keys"].as_object().unwrap();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    fn label(e: VerifyError) -> String {
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    /// Đúng bản vector đã chốt với server (`d7bdfdb`, Phụ lục C đợt A2 của kế hoạch 05).
    #[test]
    fn the_vector_file_is_the_agreed_one() {
        let hash = hex(&Sha256::digest(VECTORS.as_bytes()));
        assert_eq!(hash, "f7b6b332f25cbe5ebec012a6f106b9d274175279926d07898cc196d7683c8542");
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn every_vector_gives_the_expected_result() {
        let v = vectors();
        let keys = keys(&v);
        let order: Vec<&str> = v["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap())
            .collect();
        let mut checked = 0;
        for t in v["tokens"].as_array().unwrap() {
            let name = t["name"].as_str().unwrap();
            let got = verify(
                t["token"].as_str().unwrap(),
                &keys,
                t["now"].as_i64().unwrap(),
                t["device_id_hash"].as_str().unwrap(),
            );
            let expected = t["expected"].as_str().unwrap();
            match got {
                Ok(claims) => {
                    assert_eq!(expected, "ok", "{name}");
                    // So đủ mọi trường với `claims` của vector (N3 của review 06 lần 1).
                    let plan = match claims.plan {
                        Plan::Pro => "pro",
                        Plan::ProX2 => "pro_x2",
                        Plan::ProX5 => "pro_x5",
                    };
                    let got = serde_json::json!({
                        "kid": claims.kid,
                        "license_id": claims.license_id,
                        "activation_id": claims.activation_id,
                        "activation_created_at": claims.activation_created_at,
                        "device_id_hash": claims.device_id_hash,
                        "plan": plan,
                        "expires_at": claims.expires_at,
                        "cycle_anchor": claims.cycle_anchor,
                        "quota_minutes_per_cycle": claims.quota_minutes_per_cycle,
                        "quota_epoch": claims.quota_epoch,
                        "quota_fresh": claims.quota_fresh,
                        "issued_at": claims.issued_at,
                        "refresh_before": claims.refresh_before,
                    });
                    assert_eq!(got, t["claims"], "{name}");
                }
                Err(e) => {
                    assert_eq!(label(e), expected, "{name}");
                    assert!(order.contains(&expected));
                }
            }
            checked += 1;
        }
        assert_eq!(checked, 30);
    }

    /// Thứ tự lỗi của `VerifyError` đúng `checks_order` của vector.
    #[test]
    fn errors_are_ordered_like_the_contract() {
        let v = vectors();
        let order: Vec<String> = v["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap().into())
            .collect();
        let ours = [
            VerifyError::Malformed,
            VerifyError::UnknownKid,
            VerifyError::BadSignature,
            VerifyError::WrongDevice,
            VerifyError::LicenseExpired,
            VerifyError::RefreshExpired,
        ];
        assert_eq!(ours.map(label).to_vec(), order);
    }

    /// Không có khóa nào (môi trường chưa triển khai): token hợp lệ cũng là `unknown_kid`, tức gói Free.
    #[test]
    fn without_keys_every_token_is_unknown() {
        let v = vectors();
        let valid = v["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(decode(valid, &PublicKeys::default()), Err(VerifyError::UnknownKid));
    }

    /// `verify_strict`: khóa yếu (điểm bậc nhỏ) bị từ chối. Với khóa là điểm đơn vị, chữ ký (R = điểm đơn vị, s = 0)
    /// qua phép kiểm thường với mọi thông điệp; phép kiểm chặt phải từ chối.
    #[test]
    fn a_weak_key_and_a_trivial_signature_are_refused() {
        let v = vectors();
        let valid = v["tokens"][0]["token"].as_str().unwrap();
        let payload = valid.split('.').nth(1).unwrap();
        let mut claims: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap();
        claims["kid"] = Value::from("weak");
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        let mut identity = [0u8; 32];
        identity[0] = 1;
        let keys = PublicKeys::from_pairs([("weak", URL_SAFE_NO_PAD.encode(identity).as_str())]).unwrap();
        let mut sig = [0u8; 64];
        sig[0] = 1;
        let token = format!("v1.{payload}.{}", URL_SAFE_NO_PAD.encode(sig));
        assert_eq!(decode(&token, &keys), Err(VerifyError::BadSignature));
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `token.rs`, `keys.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 59 previous errors; 2 warnings emitted
error[E0425]: cannot find function `decode` in this scope
error[E0425]: cannot find function `verify` in this scope
error[E0425]: cannot find type `PublicKeys` in this scope
error[E0425]: cannot find type `Value` in this scope
error[E0425]: cannot find type `VerifyError` in this scope
```

- [ ] **Step 3: Viết code**

Tạo `src-tauri/keys/license-public-keys.json`:

```json
{
  "_note": "Khóa công khai kiểm token bản quyền (spec §6.8, §10.2), chép nguyên từ server/keys/public-keys.json (kế hoạch 05, Task 19, 21). Mỗi môi trường có hai ô a, b (khóa đang ký và khóa dự phòng). App bỏ qua `retired` và `_note`. Bản debug dùng `staging`, bản phát hành dùng `production`; ô trống thì mọi token đều `unknown_kid` (gói Free).",
  "staging": {},
  "production": {}
}
```

Thêm vào `src-tauri/src/license/keys.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::collections::HashMap;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Value;

/// Môi trường của license server mà bản build này nói chuyện: bản debug là `staging`, bản phát hành là `production`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LicenseEnv {
    Staging,
    Production,
}

impl LicenseEnv {
    pub fn current() -> Self {
        if cfg!(debug_assertions) {
            Self::Staging
        } else {
            Self::Production
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }
}

/// File khóa công khai build sẵn vào app.
pub const EMBEDDED: &str = include_str!("../../keys/license-public-keys.json");

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum KeysError {
    #[error("file khóa công khai không phải JSON object")]
    NotObject,
    #[error("khối `{0}` của file khóa công khai sai dạng")]
    BadEnv(String),
    #[error("khóa `{0}` không phải khóa công khai Ed25519 32 byte dạng base64url")]
    BadKey(String),
}

/// Khóa công khai theo `kid` (32 byte Ed25519).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PublicKeys(HashMap<String, [u8; 32]>);

impl PublicKeys {
    /// Đọc khối `env` của file theo định dạng `server/keys/public-keys.json`: `{"<env>": {"a": {"kid", "x"}, "b": …}}`.
    /// Khối không có thì rỗng (chưa triển khai môi trường đó).
    pub fn from_json(text: &str, env: LicenseEnv) -> Result<Self, KeysError> {
        let root: Value = serde_json::from_str(text).map_err(|_| KeysError::NotObject)?;
        let root = root.as_object().ok_or(KeysError::NotObject)?;
        let Some(block) = root.get(env.key()) else {
            return Ok(Self::default());
        };
        let slots = block.as_object().ok_or_else(|| KeysError::BadEnv(env.key().into()))?;
        let mut keys = HashMap::new();
        for slot in slots.values() {
            let (Some(kid), Some(x)) = (
                slot.get("kid").and_then(Value::as_str),
                slot.get("x").and_then(Value::as_str),
            ) else {
                return Err(KeysError::BadEnv(env.key().into()));
            };
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    /// Khóa của môi trường mà bản build này dùng ([`LicenseEnv::current`]).
    pub fn embedded() -> Self {
        Self::from_json(EMBEDDED, LicenseEnv::current()).unwrap_or_else(|e| {
            log::error!("file khóa công khai build sẵn hỏng: {e}");
            Self::default()
        })
    }

    /// Từ cặp (`kid`, khóa base64url), cho test và bộ vector.
    pub fn from_pairs<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Result<Self, KeysError> {
        let mut keys = HashMap::new();
        for (kid, x) in pairs {
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    pub fn get(&self, kid: &str) -> Option<&[u8; 32]> {
        self.0.get(kid)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

fn decode_key(kid: &str, x: &str) -> Result<[u8; 32], KeysError> {
    URL_SAFE_NO_PAD
        .decode(x)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b).ok())
        .ok_or_else(|| KeysError::BadKey(kid.into()))
}
```

Thêm vào `src-tauri/src/license/token.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Serialize;
use serde_json::{Map, Value};

use super::keys::PublicKeys;

pub const VERSION: &str = "v1";
/// Số nguyên lớn nhất JavaScript biểu diễn chính xác (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE: i64 = (1 << 53) - 1;

/// Gói trả phí trong token (spec §2). Free không có token.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    Pro,
    ProX2,
    ProX5,
}

impl Plan {
    fn parse(code: &str) -> Option<Self> {
        match code {
            "pro" => Some(Self::Pro),
            "pro_x2" => Some(Self::ProX2),
            "pro_x5" => Some(Self::ProX5),
            _ => None,
        }
    }
}

/// Nội dung của token. Thời điểm là giây Unix theo giờ của server.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Claims {
    pub kid: String,
    pub license_id: String,
    pub activation_id: String,
    pub activation_created_at: i64,
    pub device_id_hash: String,
    pub plan: Plan,
    pub expires_at: i64,
    pub cycle_anchor: i64,
    /// Phút mỗi chu kỳ 30 ngày; `None` là không giới hạn (X5).
    pub quota_minutes_per_cycle: Option<u32>,
    pub quota_epoch: i64,
    pub quota_fresh: bool,
    pub issued_at: i64,
    pub refresh_before: i64,
}

/// Lỗi khi kiểm token, theo đúng thứ tự kiểm.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, thiserror::Error)]
#[serde(rename_all = "snake_case")]
pub enum VerifyError {
    #[error("token sai định dạng")]
    Malformed,
    #[error("token ký bằng khóa không có trong app")]
    UnknownKid,
    #[error("chữ ký của token không đúng")]
    BadSignature,
    #[error("token của máy khác")]
    WrongDevice,
    #[error("license đã hết hạn")]
    LicenseExpired,
    #[error("token quá hạn làm mới")]
    RefreshExpired,
}

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy và thời hạn ([`check`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<Claims, VerifyError> {
    let mut parts = token.split('.');
    let (Some(version), Some(payload), Some(sig), None) = (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(VerifyError::Malformed);
    };
    if version != VERSION {
        return Err(VerifyError::Malformed);
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| VerifyError::Malformed)?;
    let json: Value = serde_json::from_slice(&bytes).map_err(|_| VerifyError::Malformed)?;
    let claims = parse_claims(&json).ok_or(VerifyError::Malformed)?;
    let sig = URL_SAFE_NO_PAD
        .decode(sig)
        .ok()
        .and_then(|b| <[u8; 64]>::try_from(b).ok())
        .ok_or(VerifyError::Malformed)?;
    let key = keys.get(&claims.kid).ok_or(VerifyError::UnknownKid)?;
    let key = VerifyingKey::from_bytes(key).map_err(|_| VerifyError::BadSignature)?;
    let signing_input = format!("{VERSION}.{payload}");
    key.verify_strict(signing_input.as_bytes(), &Signature::from_bytes(&sig))
        .map_err(|_| VerifyError::BadSignature)?;
    Ok(claims)
}

/// Kiểm máy và thời hạn của claims đã kiểm chữ ký. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
pub fn check(claims: &Claims, now: i64, device_id_hash: &str) -> Result<(), VerifyError> {
    if claims.device_id_hash != device_id_hash {
        return Err(VerifyError::WrongDevice);
    }
    if now >= claims.expires_at {
        return Err(VerifyError::LicenseExpired);
    }
    if now >= claims.refresh_before {
        return Err(VerifyError::RefreshExpired);
    }
    Ok(())
}

/// Kiểm đủ: [`decode`] rồi [`check`].
pub fn verify(token: &str, keys: &PublicKeys, now: i64, device_id_hash: &str) -> Result<Claims, VerifyError> {
    let claims = decode(token, keys)?;
    check(&claims, now, device_id_hash)?;
    Ok(claims)
}

fn int(c: &Map<String, Value>, key: &str) -> Option<i64> {
    let n = c.get(key)?.as_i64()?;
    (-MAX_SAFE..=MAX_SAFE).contains(&n).then_some(n)
}

fn string(c: &Map<String, Value>, key: &str) -> Option<String> {
    c.get(key)?.as_str().map(String::from)
}

fn parse_claims(json: &Value) -> Option<Claims> {
    let c = json.as_object()?;
    let quota = match c.get("quota_minutes_per_cycle")? {
        Value::Null => None,
        v => {
            let n = v.as_i64().filter(|n| (1..=MAX_SAFE).contains(n))?;
            Some(u32::try_from(n).ok()?)
        }
    };
    let quota_epoch = int(c, "quota_epoch").filter(|&e| e >= 0)?;
    Some(Claims {
        kid: string(c, "kid")?,
        license_id: string(c, "license_id")?,
        activation_id: string(c, "activation_id")?,
        activation_created_at: int(c, "activation_created_at")?,
        device_id_hash: string(c, "device_id_hash")?,
        plan: Plan::parse(c.get("plan")?.as_str()?)?,
        expires_at: int(c, "expires_at")?,
        cycle_anchor: int(c, "cycle_anchor")?,
        quota_minutes_per_cycle: quota,
        quota_epoch,
        quota_fresh: c.get("quota_fresh")?.as_bool()?,
        issued_at: int(c, "issued_at")?,
        refresh_before: int(c, "refresh_before")?,
    })
}
```

Bản 04 đã khóa, 06 dùng chung (bảng "Phiên bản đã chốt"):

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && grep -A1 -E '^name = "(ed25519-dalek|curve25519-dalek|ed25519|base64)"' Cargo.lock | grep -v '^--'
```
Expected (lúc lập kế hoạch):
```text
name = "base64"
version = "0.13.1"
name = "base64"
version = "0.21.7"
name = "base64"
version = "0.22.1"
name = "base64"
version = "0.23.1"
name = "curve25519-dalek"
version = "5.0.0"
name = "ed25519"
version = "3.0.0"
name = "ed25519-dalek"
version = "3.0.0"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::keys::tests::a_missing_environment_is_empty_and_bad_keys_are_refused ... ok
test license::keys::tests::each_environment_reads_only_its_own_slots ... ok
test license::keys::tests::the_app_copy_matches_the_server_file_when_it_exists ... ok
test license::keys::tests::the_embedded_file_parses_for_both_environments ... ok
test license::token::tests::a_weak_key_and_a_trivial_signature_are_refused ... ok
test license::token::tests::errors_are_ordered_like_the_contract ... ok
test license::token::tests::every_vector_gives_the_expected_result ... ok
test license::token::tests::the_vector_file_is_the_agreed_one ... ok
test license::token::tests::without_keys_every_token_is_unknown ... ok
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 311 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 317 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/keys/license-public-keys.json \
  src-tauri/src/lib.rs \
  src-tauri/src/license/keys.rs \
  src-tauri/src/license/mod.rs \
  src-tauri/src/license/token.rs
git commit -m "feat(app): token bản quyền v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn, theo bộ vector của 05 (§6.8, §10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 2: License key người dùng gõ (`license/key.rs`)

Spec §10.2 ("Key sinh ngẫu nhiên … có ký tự kiểm tra"); `server/src/license-key.ts`. Chuẩn hóa giống hệt server (bỏ khoảng trắng và gạch nối, viết hoa, `O` → `0`, `I`, `L` → `1`), kiểm Luhn mod 32 trước khi gọi server, để gõ sai không tốn một lần thất bại của luật chặn IP (§10.2). Test chạy 7 ví dụ `license_keys` của vector và mọi lỗi thay một ký tự.

**Files:**
- Create: `src-tauri/src/license/key.rs`
- Modify: `src-tauri/src/license/mod.rs`

- [ ] **Step 1: Viết test trước**

Tạo `src-tauri/src/license/key.rs`, lúc này mới có phần test:

```rust
//! License key người dùng gõ (spec §10.2; kế hoạch 05, `server/src/license-key.ts`): 27 ký tự ngẫu nhiên theo bảng
//! Crockford base32 cộng 1 ký tự kiểm tra Luhn mod 32. App kiểm ký tự kiểm tra trước khi gọi server, để báo gõ sai ngay
//! mà không tốn một lần thất bại của luật chặn IP (§10.2). Chuẩn hóa giống hệt server: bỏ khoảng trắng và gạch nối, viết
//! hoa, đổi `O` thành `0`, `I` và `L` thành `1`.

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("../../../server/test/vectors/token-v1.json");

    #[test]
    fn keys_normalize_like_the_server() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let cases = v["license_keys"].as_array().unwrap();
        assert_eq!(cases.len(), 7);
        for case in cases {
            let input = case["input"].as_str().unwrap();
            assert_eq!(normalize(input).as_deref(), case["normalized"].as_str(), "{input:?}");
        }
    }

    #[test]
    fn every_single_character_typo_is_caught() {
        let key = "0123456789ABCDEFGHJKMNPQRST5";
        assert!(normalize(key).is_some());
        for i in 0..key.len() {
            for &c in ALPHABET {
                let mut typo = key.as_bytes().to_vec();
                if typo[i] == c {
                    continue;
                }
                typo[i] = c;
                assert!(
                    normalize(std::str::from_utf8(&typo).unwrap()).is_none(),
                    "{i} {}",
                    c as char
                );
            }
        }
    }

    #[test]
    fn display_groups_by_four_and_long_or_odd_input_is_refused() {
        assert_eq!(
            display("0123456789ABCDEFGHJKMNPQRST5"),
            "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5"
        );
        assert_eq!(normalize(&"0".repeat(65)), None);
        assert_eq!(normalize("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTÀ"), None);
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index e9059bb2459131f09f5cac901b7e10febb338063..d3dd5af51ffa1c0449512b8ed47e3e549a196039 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -3,5 +3,6 @@
 //! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
 
+pub mod key;
 pub mod keys;
 pub mod token;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::key:: 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `key.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 7 previous errors; 1 warning emitted
error[E0425]: cannot find function `display` in this scope
error[E0425]: cannot find function `normalize` in this scope
error[E0425]: cannot find value `ALPHABET` in this scope
```

- [ ] **Step 3: Viết code**

Thêm vào `src-tauri/src/license/key.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
pub const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH: usize = 27;
const MAX_INPUT_LENGTH: usize = 64;

fn luhn_check_char(body: &[u8]) -> u8 {
    let n = ALPHABET.len();
    let mut factor = 2;
    let mut sum = 0;
    for &c in body.iter().rev() {
        let value = ALPHABET.iter().position(|&a| a == c).unwrap_or(0);
        let product = factor * value;
        sum += product / n + product % n;
        factor = if factor == 2 { 1 } else { 2 };
    }
    ALPHABET[(n - sum % n) % n]
}

/// Dạng lưu trữ (28 ký tự, không gạch nối) của key người dùng gõ, hoặc `None` nếu sai độ dài, sai ký tự hay sai ký tự kiểm
/// tra.
pub fn normalize(input: &str) -> Option<String> {
    if input.len() > MAX_INPUT_LENGTH {
        return None;
    }
    let key: Vec<u8> = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .map(|c| u8::try_from(c).unwrap_or(0))
        .collect();
    if key.len() != BODY_LENGTH + 1 || !key.iter().all(|c| ALPHABET.contains(c)) {
        return None;
    }
    (luhn_check_char(&key[..BODY_LENGTH]) == key[BODY_LENGTH]).then(|| String::from_utf8(key).expect("ASCII"))
}

/// Dạng hiển thị: 7 nhóm 4 ký tự nối bằng `-`.
pub fn display(key: &str) -> String {
    key.as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .collect::<Vec<_>>()
        .join("-")
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index d3dd5af51ffa1c0449512b8ed47e3e549a196039..c5897cd5229c9927fa2ab230331883400a00bb56 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -2,6 +2,7 @@
 //!
 //! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
+//! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 
 pub mod key;
 pub mod keys;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::key:: -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::key::tests::display_groups_by_four_and_long_or_odd_input_is_refused ... ok
test license::key::tests::every_single_character_typo_is_caught ... ok
test license::key::tests::keys_normalize_like_the_server ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 320 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/key.rs \
  src-tauri/src/license/mod.rs
git commit -m "feat(app): kiểm license key người dùng gõ bằng ký tự kiểm tra Luhn mod 32 như server (§10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 3: Mã máy và tên máy (`license/device.rs`)

Spec §6.8 (`device_id_hash` là SHA-256 của ID phần cứng: IOPlatformUUID trên macOS, MachineGuid trên Windows), QĐ3.

- macOS: `gethostuuid` (cùng giá trị `ioreg` hiện, test so với `ioreg`); tên máy từ `gethostname`, bỏ đuôi `.local`.
- Windows: `RegGetValueW` đọc `MachineGuid` ở khung 64 bit (`RRF_SUBKEY_WOW6464KEY`); tên máy từ `COMPUTERNAME`. Chỉ kiểm biên dịch trên Mac (`check-windows.sh`); thử thật ở 06b Task 7.
- Tên máy làm sạch như server (`parseDeviceLabel`): bỏ ký tự điều khiển, tối đa 64 ký tự, rỗng thì `null`.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/license/device.rs`
- Modify: `src-tauri/src/license/mod.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Tạo `src-tauri/src/license/device.rs`, lúc này mới có phần test:

```rust
//! Mã máy gửi cho license server (spec §6.8): `device_id_hash` là SHA-256 (64 chữ số hex thường) của ID phần cứng, và
//! `device_label` là tên máy để người dùng nhận ra máy trong danh sách khi key đã đủ 2 máy (`409 device_limit`).
//!
//! - macOS: ID phần cứng là IOPlatformUUID, đọc bằng `gethostuuid` (cùng giá trị `ioreg` hiện), dạng chữ hoa có gạch nối.
//! - Windows: `MachineGuid` ở `HKLM\SOFTWARE\Microsoft\Cryptography` (khung 64 bit), nguyên văn như registry lưu. Cần
//!   Windows để thử (06b, task Windows).
//!
//! Chuỗi đem băm là hợp đồng với mọi bản app sau này: đổi cách viết (hoa, thường, có gạch nối hay không) thì máy đã kích
//! hoạt thành máy mới, tốn thêm một suất kích hoạt.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_hash_is_64_lowercase_hex_digits_like_the_server_wants() {
        let h = hash_id("11481334-7115-5291-BC6B-AFE810450A15");
        assert_eq!(h.len(), 64);
        assert!(h.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_eq!(
            hash_id(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn labels_are_cleaned_like_the_server_does() {
        assert_eq!(
            clean_label("Phong-MacBook-Pro.local").as_deref(),
            Some("Phong-MacBook-Pro")
        );
        assert_eq!(clean_label("  Máy\u{7}\tvăn phòng \n").as_deref(), Some("Máyvăn phòng"));
        assert_eq!(clean_label(" \u{1} "), None);
        assert_eq!(clean_label(&"á".repeat(80)).unwrap().chars().count(), 64);
    }

    /// Đọc ID thật của máy (không cần quyền gì): cùng giá trị `ioreg` hiện, và đọc hai lần ra một.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_hardware_id_is_the_platform_uuid() {
        let id = hardware_id().unwrap();
        assert_eq!(id, hardware_id().unwrap());
        let out = std::process::Command::new("/usr/sbin/ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
            .unwrap();
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().find(|l| l.contains("IOPlatformUUID")).unwrap();
        assert!(line.contains(&format!("\"{id}\"")), "{line} / {id}");
        assert!(label().is_some());
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index c5897cd5229c9927fa2ab230331883400a00bb56..07b1267a57feb26bf6d4d8fb9188aefed62336dc 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -4,6 +4,7 @@
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 
+pub mod device;
 pub mod key;
 pub mod keys;
 pub mod token;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::device 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `device.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 9 previous errors; 1 warning emitted
error[E0425]: cannot find function `clean_label` in this scope
error[E0425]: cannot find function `hardware_id` in this scope
error[E0425]: cannot find function `hash_id` in this scope
error[E0425]: cannot find function `label` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 307246d1afdac1e987f5d2df37437e953576b1bf..a15f174d04648455ecb146ecb3a62818a3b80f49 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -64,6 +64,7 @@
     "Win32_Foundation",
     "Win32_Storage_FileSystem",
     "Win32_System_LibraryLoader",
+    "Win32_System_Registry",
     "Win32_System_SystemInformation",
     "Win32_UI_WindowsAndMessaging",
 ] }
```

Thêm vào `src-tauri/src/license/device.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use sha2::{Digest, Sha256};

/// Độ dài tối đa của tên máy, như server cắt (`parseDeviceLabel`).
const MAX_LABEL_CHARS: usize = 64;

/// `device_id_hash` của chuỗi ID phần cứng.
pub fn hash_id(hardware_id: &str) -> String {
    Sha256::digest(hardware_id.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Tên máy gửi lên server: bỏ ký tự điều khiển, cắt khoảng trắng, tối đa 64 ký tự; bỏ đuôi `.local` của macOS. Rỗng thì
/// `None` (server lưu `null`).
pub fn clean_label(raw: &str) -> Option<String> {
    let raw = raw.trim().strip_suffix(".local").unwrap_or(raw.trim());
    let label: String = raw.chars().filter(|c| !c.is_control()).take(MAX_LABEL_CHARS).collect();
    let label = label.trim().to_string();
    (!label.is_empty()).then_some(label)
}

/// ID phần cứng của máy này.
pub fn hardware_id() -> Result<String, String> {
    platform::hardware_id()
}

/// Tên máy này, đã làm sạch.
pub fn label() -> Option<String> {
    clean_label(&platform::raw_label())
}

#[cfg(target_os = "macos")]
mod platform {
    pub fn hardware_id() -> Result<String, String> {
        let mut id = [0u8; 16];
        let wait = libc::timespec { tv_sec: 1, tv_nsec: 0 };
        // SAFETY: `id` đủ 16 byte như `uuid_t`; `wait` sống suốt lời gọi.
        let rc = unsafe { libc::gethostuuid(id.as_mut_ptr(), &wait) };
        if rc != 0 {
            return Err(format!("gethostuuid lỗi {}", std::io::Error::last_os_error()));
        }
        let h: String = id.iter().map(|b| format!("{b:02X}")).collect();
        Ok(format!(
            "{}-{}-{}-{}-{}",
            &h[..8],
            &h[8..12],
            &h[12..16],
            &h[16..20],
            &h[20..]
        ))
    }

    pub fn raw_label() -> String {
        let mut buf = [0u8; 256];
        // SAFETY: `buf` đủ chỗ; `gethostname` ghi tối đa `buf.len()` byte.
        let rc = unsafe { libc::gethostname(buf.as_mut_ptr().cast(), buf.len()) };
        if rc != 0 {
            return String::new();
        }
        let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
        String::from_utf8_lossy(&buf[..end]).into_owned()
    }
}

#[cfg(windows)]
mod platform {
    use windows::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY, RegGetValueW};
    use windows::core::w;

    pub fn hardware_id() -> Result<String, String> {
        let mut buf = [0u16; 128];
        let mut size = std::mem::size_of_val(&buf) as u32;
        // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                w!("SOFTWARE\\Microsoft\\Cryptography"),
                w!("MachineGuid"),
                // Khung 64 bit của registry, kể cả khi tiến trình là 32 bit.
                RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return Err(format!("không đọc được MachineGuid: {rc:?}"));
        }
        let chars = (size as usize / 2).saturating_sub(1);
        Ok(String::from_utf16_lossy(&buf[..chars.min(buf.len())]))
    }

    pub fn raw_label() -> String {
        std::env::var("COMPUTERNAME").unwrap_or_default()
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn hardware_id() -> Result<String, String> {
        Err("chỉ hỗ trợ macOS và Windows (spec D3)".into())
    }

    pub fn raw_label() -> String {
        String::new()
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 07b1267a57feb26bf6d4d8fb9188aefed62336dc..f907349ca05b458372c65e4ff83f092395f17848 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -2,6 +2,7 @@
 //!
 //! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
+//! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 
 pub mod device;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::device -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::device::tests::labels_are_cleaned_like_the_server_does ... ok
test license::device::tests::the_hardware_id_is_the_platform_uuid ... ok
test license::device::tests::the_hash_is_64_lowercase_hex_digits_like_the_server_wants ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 323 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/license/device.rs \
  src-tauri/src/license/mod.rs
git commit -m "feat(app): device_id_hash từ IOPlatformUUID hay MachineGuid, tên máy cho danh sách kích hoạt (§6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 4: Luật hạn mức (`license/quota.rs`)

Spec §6.8 "Hạn mức", §4.2 bước 2, §10.2 (chỉnh đồng hồ); `quota-decisions-2.md` và `notes-for-plan06.md`. QĐ5–QĐ9. Phép tính thuần, không đụng kho khóa hay đồng hồ:

- **Chu kỳ** (`cycle`): `n = floor((issued_at − cycle_anchor) / 30 ngày)` theo token mới nhất (giờ server), kẹp `n ≥ 0`; chu kỳ cuối ngắn thì `ceil(hạn_mức × số_ngày / 30)`.
- **Bộ đếm gói trả phí** (`resolve_paid`), theo thứ tự: đã có bộ đếm của khóa hiện tại thì dùng nó (luật 1, mục 1 của `notes-for-plan06.md`); token vừa nhận có `quota_fresh`; epoch lớn hơn bản ghi đánh dấu; bản ghi đánh dấu có mốc cũ hơn (sang chu kỳ mới); còn lại là mất bản ghi (đã dùng hết). Bản ghi của activation khác không dùng.
- **Free** (`resolve_free`): bắt đầu từ 0 ở lần đầu chạy, mất bộ đếm khi đã có dữ liệu thì coi như hết; reset khi ngày theo giờ máy tăng và đã qua 20 giờ theo "đồng hồ thật" (thời gian đơn điệu, hiệu hai header `Date`, hiệu giờ máy chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Múi giờ truyền vào (`chrono::Local` ở app, múi giờ cố định trong test).
- **Đồng hồ** (`Seen`, QĐ8): chỉnh lùi là giờ máy nhỏ hơn quá 10 phút so với mốc lớn nhất từng thấy, hay so với giờ server mới nhất (header `Date`, `issued_at` đã ký của token); `trusted_now` = max(giờ máy, giờ server). Bộ đếm Free "ở tương lai" kéo về hiện tại, giữ phút đã dùng, và bỏ hiệu giờ máy tới lần reset sau (QĐ29; bảng mô hình đe dọa).
- Test có đủ các ca `notes-for-plan06.md` mục 3: tắt app giữa hai lần ghi ở cả ba luật bắt đầu từ 0, mất bản ghi đánh dấu mà còn bộ đếm, epoch mới khi cửa sổ đã đóng (còn và không còn bản ghi đánh dấu), đổi gói (có và không có bản ghi đánh dấu).

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/license/mod.rs`
- Create: `src-tauri/src/license/quota.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index f907349ca05b458372c65e4ff83f092395f17848..c75fac7b127ea581b10e376c790e136ba9c99e89 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -8,4 +8,5 @@
 pub mod device;
 pub mod key;
 pub mod keys;
+pub mod quota;
 pub mod token;
```

Tạo `src-tauri/src/license/quota.rs`, lúc này mới có phần test:

```rust
//! Luật hạn mức (spec §6.8 "Hạn mức", §4.2 bước 2, §10.2; `quota-decisions-2.md`, `notes-for-plan06.md`), viết thành
//! phép tính thuần, không đụng kho khóa hay đồng hồ: nơi gọi truyền giờ và bản ghi vào, lưu kết quả ra. Phút tính bằng
//! mili giây tiếng nói đã dịch (`EventSink::usage`).
//!
//! **Gói trả phí.** Chu kỳ 30 ngày tính từ `cycle_anchor`; số thứ tự `n` theo `issued_at` của token mới nhất (giờ server),
//! kẹp `n ≥ 0`, nên chỉnh đồng hồ máy không mở được chu kỳ mới. Khóa của bộ đếm là (`license_id`, `activation_id`, mốc đầu
//! chu kỳ, `quota_epoch`). Bản ghi đánh dấu của activation giữ mốc và epoch của bộ đếm gần nhất. [`resolve_paid`] chọn bộ
//! đếm theo thứ tự:
//! 1. đã có bộ đếm của khóa hiện tại: dùng nó (rồi cập nhật bản ghi đánh dấu nếu đang cũ);
//! 2. token vừa nhận từ server có `quota_fresh`: bắt đầu từ 0;
//! 3. epoch của token lớn hơn epoch trong bản ghi đánh dấu: bắt đầu từ 0 (chỉ admin tăng được epoch);
//! 4. bản ghi đánh dấu có mốc cũ hơn mốc hiện tại (sang chu kỳ mới): bắt đầu từ 0;
//! 5. còn lại là mất bản ghi: coi như đã dùng hết hạn mức của chu kỳ.
//!
//! **Free.** Một bộ đếm theo ngày, 10 phút. Reset khi ngày theo giờ máy đã tăng **và** đã qua ít nhất 20 giờ theo "đồng
//! hồ thật" (lớn nhất trong: thời gian đơn điệu cộng dồn lúc app chạy; hiệu hai header `Date` của server; hiệu giờ máy,
//! chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Bộ đếm Free luôn cộng cả phút dịch lúc ở gói trả
//! phí, và hết hạn mức gói trả phí thì Free của ngày đó cũng hết.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::token::Plan;
    use chrono::FixedOffset;

    /// 2026-10-01 00:00:00 UTC.
    const T0: i64 = 1_790_812_800;
    const MIN: u64 = 60_000;

    fn claims() -> Claims {
        Claims {
            kid: "test-1".into(),
            license_id: "lic".into(),
            activation_id: "act".into(),
            activation_created_at: T0,
            device_id_hash: "dev".into(),
            plan: Plan::Pro,
            expires_at: T0 + 60 * DAY_SECS,
            cycle_anchor: T0,
            quota_minutes_per_cycle: Some(1800),
            quota_epoch: 0,
            quota_fresh: false,
            issued_at: T0 + DAY_SECS,
            refresh_before: T0 + 15 * DAY_SECS,
        }
    }

    fn counter(c: &Claims, used_ms: u64) -> PaidCounter {
        PaidCounter {
            key: PaidKey::of(c),
            used_ms,
            lost: false,
        }
    }

    fn marker(c: &Claims) -> Marker {
        Marker::of(&PaidKey::of(c))
    }

    #[test]
    fn the_cycle_follows_the_server_clock_and_never_goes_below_zero() {
        let mut c = claims();
        assert_eq!(cycle(&c).n, 0);
        c.issued_at = T0 + CYCLE_SECS - 1;
        assert_eq!(cycle(&c).n, 0);
        c.issued_at = T0 + CYCLE_SECS;
        assert_eq!((cycle(&c).n, cycle(&c).start), (1, T0 + CYCLE_SECS));
        // Token cấp trước `cycle_anchor` (đồng hồ của cổng thanh toán nhanh hơn server): kẹp về chu kỳ 0, không phải -1.
        c.issued_at = T0 - 10;
        assert_eq!((cycle(&c).n, cycle(&c).start), (0, T0));
    }

    #[test]
    fn a_short_last_cycle_gets_a_share_of_the_quota_rounded_up() {
        let mut c = claims();
        assert_eq!(cycle(&c).limit_ms, Some(1800 * MIN));
        // Chu kỳ thứ hai chỉ còn 6 ngày 1 giây: 7 ngày, ceil(1800 × 7 / 30) = 420 phút.
        c.issued_at = T0 + CYCLE_SECS;
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(420 * MIN));
        c.expires_at = T0 + CYCLE_SECS + DAY_SECS / 2;
        assert_eq!(cycle(&c).limit_ms, Some(60 * MIN), "nửa ngày làm tròn lên 1 ngày");
        // Hạn mức không chia hết cho 30 (bảng gói ở server đổi được): làm tròn lên.
        c.quota_minutes_per_cycle = Some(1000);
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(234 * MIN), "ceil(1000 × 7 / 30) = 234");
        c.quota_minutes_per_cycle = None;
        assert_eq!(cycle(&c).limit_ms, None, "X5 không giới hạn");
    }

    #[test]
    fn an_existing_counter_is_used_and_a_stale_or_missing_marker_is_rewritten() {
        let c = claims();
        let s = resolve_paid(&c, true, Some(counter(&c, 5 * MIN)), Some(&marker(&c)));
        assert_eq!(
            (s.resolution, s.counter.used_ms, s.write_counter, s.write_marker),
            (Resolution::Existing, 5 * MIN, false, false)
        );
        // Mất bản ghi đánh dấu nhưng còn bộ đếm (notes-for-plan06 mục 1): dùng bộ đếm, ghi lại bản ghi đánh dấu.
        let s = resolve_paid(&c, false, Some(counter(&c, 5 * MIN)), None);
        assert_eq!((s.resolution, s.write_marker), (Resolution::Existing, true));
        let mut old = marker(&c);
        old.cycle_start -= CYCLE_SECS;
        let s = resolve_paid(&c, false, Some(counter(&c, 5 * MIN)), Some(&old));
        assert_eq!((s.resolution, s.write_marker), (Resolution::Existing, true));
    }

    /// Ba luật "bắt đầu từ 0", và app bị tắt sau khi ghi bộ đếm mà trước khi ghi bản ghi đánh dấu: lần sau token không
    /// còn `fresh`, vẫn dùng đúng bộ đếm đã ghi, không bị coi là mất bản ghi (notes-for-plan06 mục 3).
    #[test]
    fn the_three_fresh_rules_survive_a_crash_between_the_two_writes() {
        let base = claims();
        let mut next_epoch = base.clone();
        next_epoch.quota_epoch = 1;
        let mut next_cycle = base.clone();
        next_cycle.issued_at = T0 + CYCLE_SECS + 10;
        let cases = [
            ("token fresh", base.clone(), true, None),
            ("epoch lớn hơn", next_epoch, false, Some(marker(&base))),
            ("chu kỳ mới", next_cycle, false, Some(marker(&base))),
        ];
        for (name, c, fresh, old_marker) in cases {
            let first = resolve_paid(&c, fresh, None, old_marker.as_ref());
            assert_eq!(first.resolution, Resolution::Fresh, "{name}");
            assert_eq!(
                (first.counter.used_ms, first.write_counter, first.write_marker),
                (0, true, true),
                "{name}"
            );
            let mut used = first.counter.clone();
            used.used_ms = 3 * MIN;
            // Chỉ bộ đếm đã ghi; bản ghi đánh dấu vẫn là bản cũ (hay chưa có).
            let again = resolve_paid(&c, false, Some(used), old_marker.as_ref());
            assert_eq!(
                (again.resolution, again.counter.used_ms, again.write_marker),
                (Resolution::Existing, 3 * MIN, true),
                "{name}"
            );
        }
    }

    #[test]
    fn a_marker_without_its_counter_means_the_record_was_lost() {
        let c = claims();
        let s = resolve_paid(&c, false, None, Some(&marker(&c)));
        assert_eq!(s.resolution, Resolution::Lost);
        assert!(s.counter.lost);
        assert_eq!(paid_remaining(&c, &s.counter), Some(0), "coi như đã dùng hết cả chu kỳ");
        // Không có bản ghi nào của activation này, token không `fresh` (xóa sạch dữ liệu quá cửa sổ 15 phút).
        assert_eq!(resolve_paid(&c, false, None, None).resolution, Resolution::Lost);
        // Trong cửa sổ `fresh`, bắt đầu từ 0 đứng trước mất bản ghi (rủi ro chấp nhận, §10.2).
        assert_eq!(
            resolve_paid(&c, true, None, Some(&marker(&c))).resolution,
            Resolution::Fresh
        );
    }

    /// Admin tăng `quota_epoch` (đường cứu): máy còn bản ghi đánh dấu thì bắt đầu từ 0 ngay cả khi cửa sổ đã đóng; máy đã
    /// xóa sạch dữ liệu chỉ được cứu trong cửa sổ `fresh` (notes-for-plan06 mục 3).
    #[test]
    fn a_new_epoch_starts_over_with_a_marker_or_inside_the_fresh_window() {
        let base = claims();
        let mut bumped = base.clone();
        bumped.quota_epoch = 1;
        assert_eq!(
            resolve_paid(&bumped, false, None, Some(&marker(&base))).resolution,
            Resolution::Fresh
        );
        assert_eq!(resolve_paid(&bumped, false, None, None).resolution, Resolution::Lost);
        assert_eq!(resolve_paid(&bumped, true, None, None).resolution, Resolution::Fresh);
        // Epoch nhỏ hơn bản ghi đánh dấu (bản ghi bị sửa tay): không mở bộ đếm mới.
        let mut m = marker(&base);
        m.epoch = 2;
        assert_eq!(
            resolve_paid(&bumped, false, None, Some(&m)).resolution,
            Resolution::Lost
        );
    }

    /// Đổi gói đặt lại `cycle_anchor` (notes-for-plan06 mục 3): có bản ghi đánh dấu của mốc cũ thì bắt đầu từ 0; không có
    /// thì chỉ bắt đầu từ 0 khi token `fresh`.
    #[test]
    fn changing_plan_starts_a_new_counter_with_or_without_a_marker() {
        let old = claims();
        let mut changed = old.clone();
        changed.plan = Plan::ProX2;
        changed.quota_minutes_per_cycle = Some(6000);
        changed.cycle_anchor = T0 + 10 * DAY_SECS;
        changed.issued_at = T0 + 10 * DAY_SECS + 60;
        assert_eq!(
            resolve_paid(&changed, false, None, Some(&marker(&old))).resolution,
            Resolution::Fresh
        );
        assert_eq!(resolve_paid(&changed, true, None, None).resolution, Resolution::Fresh);
        assert_eq!(resolve_paid(&changed, false, None, None).resolution, Resolution::Lost);
        // Bộ đếm của gói cũ không dùng cho gói mới.
        assert_eq!(
            resolve_paid(&changed, false, Some(counter(&old, 100 * MIN)), Some(&marker(&old)))
                .counter
                .used_ms,
            0
        );
    }

    /// Bản ghi của activation khác (cài lại hệ điều hành, server tạo activation mới cho cùng máy) không được dùng.
    #[test]
    fn records_of_another_activation_are_not_used() {
        let c = claims();
        let mut other = claims();
        other.activation_id = "act-2".into();
        assert_eq!(
            resolve_paid(&c, false, Some(counter(&other, MIN)), None).resolution,
            Resolution::Lost
        );
        let mut m = marker(&c);
        m.cycle_start -= CYCLE_SECS;
        m.activation_id = "act-2".into();
        assert_eq!(resolve_paid(&c, false, None, Some(&m)).resolution, Resolution::Lost);
    }

    fn vn() -> FixedOffset {
        FixedOffset::east_opt(7 * 3600).unwrap()
    }

    /// 2026-10-01 08:00 giờ Việt Nam.
    const MORNING: i64 = T0 + 3600;

    #[test]
    fn free_starts_at_zero_on_the_first_run_and_is_used_up_when_its_record_is_lost() {
        let seen = Seen::default();
        let (c, write) = resolve_free(&vn(), None, false, MORNING, &seen);
        assert_eq!((c.used_ms, c.lost, write), (0, false, true));
        assert_eq!(c.day, NaiveDate::from_ymd_opt(2026, 10, 1).unwrap());
        let (c, write) = resolve_free(&vn(), None, true, MORNING, &seen);
        assert_eq!((free_remaining(&c), c.lost, write), (0, true, true));
    }

    #[test]
    fn free_resets_only_on_a_new_day_after_20_real_hours() {
        let seen = Seen {
            max_machine: MORNING,
            latest_server_date: None,
        };
        let mut c = free_start(&vn(), MORNING, &seen);
        c.used_ms = FREE_DAILY_MS;
        // 23:30 cùng ngày: chưa qua ngày.
        let late = MORNING + 15 * 3600 + 1800;
        assert!(!resolve_free(&vn(), Some(c.clone()), true, late, &seen).1);
        // 00:30 hôm sau nhưng mới 16 giờ rưỡi: chưa đủ 20 giờ.
        let after_midnight = MORNING + 16 * 3600 + 1800;
        assert!(!resolve_free(&vn(), Some(c.clone()), true, after_midnight, &seen).1);
        // 04:00 hôm sau, đủ 20 giờ: reset.
        let (r, write) = resolve_free(&vn(), Some(c.clone()), true, MORNING + 20 * 3600, &seen);
        assert!(write);
        assert_eq!((r.used_ms, r.day), (0, NaiveDate::from_ymd_opt(2026, 10, 2).unwrap()));
        assert_eq!(
            free_reset_time(&vn(), &c),
            MORNING + 20 * 3600,
            "max(00:00 hôm sau, reset + 20 giờ)"
        );
        let mut evening = free_start(&vn(), MORNING + 12 * 3600, &seen);
        evening.used_ms = 1;
        assert_eq!(
            free_reset_time(&vn(), &evening),
            MORNING + 32 * 3600,
            "reset lúc 20:00 thì mở lại lúc 16:00 hôm sau"
        );
    }

    /// Chỉnh đồng hồ lùi hay đổi múi giờ qua lại không mở được Free; thời gian đơn điệu và header `Date` của server vẫn đếm.
    #[test]
    fn moving_the_clock_does_not_reset_free_but_real_time_does() {
        let mut seen = Seen {
            max_machine: MORNING + 30 * 3600,
            latest_server_date: None,
        };
        let c = free_start(&vn(), MORNING, &seen);
        // Đã từng thấy giờ máy tới +30 giờ rồi chỉnh lùi về +21 giờ: hiệu giờ máy không được tính.
        let back = MORNING + 21 * 3600;
        assert!(seen.rolled_back(back));
        assert!(!resolve_free(&vn(), Some(c.clone()), true, back, &seen).1);
        // Nhưng thời gian đơn điệu lúc app chạy đã đủ 20 giờ.
        let mut ran = c.clone();
        ran.monotonic_ms = 20 * 3600 * 1000;
        assert!(resolve_free(&vn(), Some(ran), true, back, &seen).1);
        // Hoặc hai header `Date` của server cách nhau đủ 20 giờ (server thấy +30 giờ: giờ máy +21 giờ đúng là bị chỉnh lùi).
        let mut dated = c.clone();
        dated.server_date_at_reset = Some(MORNING + 10 * 3600);
        seen.observe_server(MORNING + 30 * 3600);
        assert!(seen.rolled_back(back));
        assert!(resolve_free(&vn(), Some(dated.clone()), true, back, &seen).1);
        // Chỉ có `Date` sau lần reset, không có `Date` trước đó: số này không dùng.
        dated.server_date_at_reset = None;
        assert!(!resolve_free(&vn(), Some(dated), true, back, &seen).1);
        // Đổi múi giờ sang +14 cho ngày tăng sớm: vẫn cần đủ 20 giờ.
        let east = FixedOffset::east_opt(14 * 3600).unwrap();
        let c2 = free_start(&vn(), MORNING, &Seen::default());
        assert!(!resolve_free(&east, Some(c2), true, MORNING + 11 * 3600, &Seen::default()).1);
    }

    /// Bộ đếm Free reset lúc giờ máy đặt nhầm tới trước (Q2 của review 06 lần 1): giờ máy về đúng thì kéo `day`, `reset_at`
    /// về hiện tại, giữ phút đã dùng; lần reset kế tiếp theo luật thường (sang ngày mới và 20 giờ đồng hồ thật). Chiều
    /// ngược lại (chỉnh lùi sau khi đã dùng hết) không mở được phút nào.
    #[test]
    fn a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes() {
        let ahead = MORNING + 365 * DAY_SECS;
        let mut used = free_start(&vn(), ahead, &Seen::default());
        used.used_ms = FREE_DAILY_MS;
        used.monotonic_ms = 3600 * 1000;
        let dated = Seen {
            max_machine: MORNING,
            latest_server_date: Some(MORNING),
        };
        let (pulled, write) = resolve_free(&vn(), Some(used), true, MORNING, &dated);
        assert!(write);
        assert_eq!((pulled.day, pulled.reset_at), (local_day(&vn(), MORNING), MORNING));
        assert_eq!(pulled.used_ms, FREE_DAILY_MS, "không mở thêm phút nào");
        assert_eq!(
            pulled.monotonic_ms,
            3600 * 1000,
            "thời gian đơn điệu đã đếm vẫn là thời gian thật"
        );
        assert!(!resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 3600, &Seen::default()).1);
        // Hôm sau: giờ máy chưa tin lại được (QB của review 06 lần 2), nên reset nhờ hiệu `Date` hay 20 giờ app chạy; không
        // kẹt tới năm sau.
        assert!(!resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 21 * 3600, &dated).1);
        let later = Seen {
            max_machine: MORNING + 21 * 3600,
            latest_server_date: Some(MORNING + 21 * 3600),
        };
        let (next, reset) = resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 21 * 3600, &later);
        assert!(reset && next.used_ms == 0 && !next.clock_pulled, "hiệu `Date` 21 giờ");
        let mut ran = pulled;
        ran.monotonic_ms = 20 * 3600 * 1000;
        assert!(
            resolve_free(&vn(), Some(ran), true, MORNING + 21 * 3600, &dated).1,
            "20 giờ app chạy"
        );
        // Chiều ngược lại: dùng hết hôm nay rồi chỉnh lùi hai ngày, rồi đặt tới "ngày mai" của ngày giả.
        let mut today = free_start(&vn(), MORNING, &Seen::default());
        today.used_ms = FREE_DAILY_MS;
        let seen = Seen {
            max_machine: MORNING,
            latest_server_date: None,
        };
        let back = MORNING - 2 * DAY_SECS;
        let (c, _) = resolve_free(&vn(), Some(today), true, back, &seen);
        assert_eq!(c.used_ms, FREE_DAILY_MS);
        let (c, reset) = resolve_free(&vn(), Some(c), true, back + DAY_SECS, &seen);
        assert!(
            !reset && c.used_ms == FREE_DAILY_MS,
            "chưa đủ 20 giờ thật: không mở phút nào"
        );
    }

    /// Đặt giờ tới trước rồi lùi về, lặp lại với cùng độ lệch (QB của review 06 lần 2): lần tiến đầu reset được (rủi ro đã
    /// chấp nhận ở §10.2), nhưng bộ đếm vừa kéo về bỏ hiệu giờ máy tới lần reset sau, nên lần tiến thứ hai không mở thêm
    /// phút nào, kể cả khi `Date` của server đã hạ mốc giờ máy.
    #[test]
    fn forward_back_forward_with_the_same_offset_gives_no_new_minutes() {
        let mut c = free_start(&vn(), MORNING, &Seen::default());
        c.used_ms = FREE_DAILY_MS;
        let ahead = MORNING + DAY_SECS;
        let (mut c, reset) = resolve_free(&vn(), Some(c), true, ahead, &Seen::default());
        assert!(reset, "lần tiến đầu: rủi ro đã chấp nhận");
        c.used_ms = FREE_DAILY_MS;
        let real = Seen {
            max_machine: MORNING + 60,
            latest_server_date: Some(MORNING + 60),
        };
        let (c, _) = resolve_free(&vn(), Some(c), true, MORNING + 60, &real);
        assert!(c.clock_pulled && c.used_ms == FREE_DAILY_MS);
        for round in 1..=5 {
            let again = ahead + round * 120;
            let (next, reset) = resolve_free(&vn(), Some(c.clone()), true, again, &real);
            assert!(
                !reset && next.used_ms == FREE_DAILY_MS,
                "lần tiến thứ {round}: không mở phút nào"
            );
        }
    }

    /// `issued_at` đã ký của token là một mốc giờ của server (QA của review 06 lần 2): nâng mốc so sánh của chỉnh lùi và giờ
    /// tin được, nhưng không hạ giờ máy lớn nhất từng thấy (token có thể đã cấp từ nhiều ngày trước).
    #[test]
    fn the_signed_issue_time_counts_as_server_time() {
        let mut seen = Seen {
            max_machine: T0 + DAY_SECS,
            latest_server_date: None,
        };
        seen.observe_signed(T0);
        assert_eq!(seen.max_machine, T0 + DAY_SECS);
        assert_eq!(seen.latest_server_date, Some(T0));
        let mut slow = Seen::default();
        slow.observe_machine(T0 - 365 * DAY_SECS);
        slow.observe_signed(T0);
        assert!(slow.rolled_back(T0 - 365 * DAY_SECS + 60));
    }

    /// Free chỉ reset khi sang ngày mới theo giờ máy, kể cả khi đã qua 20 giờ (§6.8).
    #[test]
    fn free_needs_a_new_day_as_well_as_twenty_hours() {
        let early = T0 - 7 * 3600 + 1800; // 00:30 giờ Việt Nam
        let mut ran = free_start(&vn(), early, &Seen::default());
        ran.monotonic_ms = 20 * 3600 * 1000;
        let same_day = early + 20 * 3600;
        assert!(
            !resolve_free(&vn(), Some(ran.clone()), true, same_day, &Seen::default()).1,
            "20:30 cùng ngày"
        );
        assert!(resolve_free(&vn(), Some(ran), true, early + 24 * 3600, &Seen::default()).1);
    }

    #[test]
    fn the_rollback_tolerance_is_ten_minutes() {
        let mut seen = Seen::default();
        seen.observe_machine(T0);
        seen.observe_machine(T0 - 3600);
        assert_eq!(seen.max_machine, T0);
        assert!(!seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS));
        assert!(seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS - 1));
        seen.observe_server(T0);
        seen.observe_server(T0 - 5);
        assert_eq!(seen.latest_server_date, Some(T0));
        // Giờ máy từng đặt tới trước một năm rồi chỉnh lại: header `Date` của server hạ mốc về giờ thật.
        let mut ahead = Seen::default();
        ahead.observe_machine(T0 + 365 * DAY_SECS);
        assert!(ahead.rolled_back(T0));
        ahead.observe_server(T0 + ROLLBACK_TOLERANCE_SECS);
        assert!(!ahead.rolled_back(T0), "mốc đã về giờ server");
        ahead.observe_server(T0);
        assert!(
            ahead.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS - 1),
            "chỉnh lùi thật vẫn bị phát hiện"
        );
    }

    /// Giờ máy chậm hơn header `Date` của server quá 10 phút cũng là chỉnh lùi, kể cả khi giờ máy đã chậm từ trước lần
    /// mở app đầu tiên (Q1 của review 06 lần 1). Giờ tin được là giờ lớn hơn trong hai giờ.
    #[test]
    fn a_machine_clock_behind_the_server_is_rolled_back() {
        let year = 365 * DAY_SECS;
        let mut seen = Seen::default();
        seen.observe_machine(T0 - year);
        seen.observe_server(T0);
        assert!(seen.rolled_back(T0 - year + 60));
        assert_eq!(seen.trusted_now(T0 - year + 60), T0);
        assert!(!seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS));
        assert_eq!(seen.trusted_now(T0 + 60), T0 + 60);
    }
}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::quota 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `quota.rs`, chưa có `chrono`):
```text
error: could not compile `meeting-translator` (lib test) due to 159 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `Claims` in this scope
error[E0422]: cannot find struct, variant or union type `PaidCounter` in this scope
error[E0422]: cannot find struct, variant or union type `Seen` in this scope
error[E0425]: cannot find function `cycle` in this scope
error[E0425]: cannot find function `free_remaining` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index a15f174d04648455ecb146ecb3a62818a3b80f49..3f3c556ff739ecced870b6410186e87162201389 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -51,6 +51,9 @@
 reqwest = { version = "0.13.5", default-features = false, features = ["blocking", "native-tls", "system-proxy"] }
 # macOS: RAM và dung lượng trống cho đề xuất gói model (spec §8). Cùng bản `pipeline` đang dùng.
 libc = "0.2.189"
+# Bản quyền (kế hoạch 06): các crate 04 đã thêm (`base64`, `ed25519-dalek`, `reqwest`, `libc`) dùng chung, ở trên.
+# Ngày theo giờ máy cho hạn mức Free (license/quota.rs): múi giờ của hệ điều hành. Cùng bản `Cargo.lock` đã có.
+chrono = { version = "0.4.45", default-features = false, features = ["clock", "serde"] }
 
 [target.'cfg(target_os = "macos")'.dependencies]
 apple-native-keyring-store = { version = "1.0.2", features = ["keychain"] }
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index c75fac7b127ea581b10e376c790e136ba9c99e89..4a6f215d6a3250ae91b03a78b3273551518bffa6 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -4,6 +4,7 @@
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
+//! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
 pub mod device;
 pub mod key;
```

Thêm vào `src-tauri/src/license/quota.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use chrono::{Days, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use super::token::Claims;

pub const DAY_SECS: i64 = 86_400;
pub const CYCLE_SECS: i64 = 30 * DAY_SECS;
/// Hạn mức Free mỗi ngày (spec §2): hằng số phía app, vì Free không có token.
pub const FREE_DAILY_MS: u64 = 10 * 60_000;
/// Free reset cần đã qua ít nhất chừng này theo "đồng hồ thật" kể từ lần reset trước.
pub const FREE_MIN_GAP_SECS: i64 = 20 * 3600;
/// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá chừng này thì coi là đã chỉnh lùi (§10.2).
pub const ROLLBACK_TOLERANCE_SECS: i64 = 10 * 60;
/// Nhắc khi hạn mức còn chừng này (§4.2 bước 2).
pub const WARN_REMAINING_MS: u64 = 5 * 60_000;

/// Chu kỳ hạn mức hiện tại của một token.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cycle {
    /// Số thứ tự `n` (≥ 0).
    pub n: i64,
    /// Mốc đầu chu kỳ: `cycle_anchor + n × 30 ngày`.
    pub start: i64,
    /// Mốc đầu chu kỳ kế tiếp.
    pub next_start: i64,
    /// Hạn mức của chu kỳ (mili giây); `None` là không giới hạn. Chu kỳ cuối ngắn hơn 30 ngày tính theo số ngày còn lại.
    pub limit_ms: Option<u64>,
}

/// Chu kỳ theo `issued_at` của token (giờ server), kẹp `n ≥ 0` (mục 3 của bổ sung sau review cuối 05).
pub fn cycle(claims: &Claims) -> Cycle {
    let n = (claims.issued_at - claims.cycle_anchor).div_euclid(CYCLE_SECS).max(0);
    let start = claims.cycle_anchor + n * CYCLE_SECS;
    let next_start = start + CYCLE_SECS;
    let limit_ms = claims.quota_minutes_per_cycle.map(|minutes| {
        let minutes = u64::from(minutes);
        let minutes = if claims.expires_at < next_start {
            // Chu kỳ cuối ngắn: ceil(hạn_mức × số_ngày / 30), số_ngày làm tròn lên.
            let days = (claims.expires_at - start).max(0).div_euclid(DAY_SECS)
                + i64::from((claims.expires_at - start).max(0).rem_euclid(DAY_SECS) > 0);
            (minutes * days as u64).div_ceil(30)
        } else {
            minutes
        };
        minutes * 60_000
    });
    Cycle {
        n,
        start,
        next_start,
        limit_ms,
    }
}

/// Khóa của bộ đếm gói trả phí.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaidKey {
    pub license_id: String,
    pub activation_id: String,
    pub cycle_start: i64,
    pub epoch: i64,
}

impl PaidKey {
    pub fn of(claims: &Claims) -> Self {
        Self {
            license_id: claims.license_id.clone(),
            activation_id: claims.activation_id.clone(),
            cycle_start: cycle(claims).start,
            epoch: claims.quota_epoch,
        }
    }
}

/// Bộ đếm của một khóa. `lost`: tạo ra vì mất bản ghi (đã dùng hết), để giao diện báo lý do và cách liên hệ hỗ trợ.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaidCounter {
    pub key: PaidKey,
    pub used_ms: u64,
    #[serde(default)]
    pub lost: bool,
}

/// Bản ghi đánh dấu "đã từng chạy license này trên máy này" của một activation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Marker {
    pub license_id: String,
    pub activation_id: String,
    pub cycle_start: i64,
    pub epoch: i64,
}

impl Marker {
    pub fn of(key: &PaidKey) -> Self {
        Self {
            license_id: key.license_id.clone(),
            activation_id: key.activation_id.clone(),
            cycle_start: key.cycle_start,
            epoch: key.epoch,
        }
    }
}

/// Bộ đếm chọn được cho token hiện tại.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolution {
    /// Dùng bộ đếm đã có (luật 1).
    Existing,
    /// Bắt đầu từ 0 (luật 2–4).
    Fresh,
    /// Mất bản ghi: đã dùng hết hạn mức của chu kỳ (luật 5).
    Lost,
}

/// Kết quả: bộ đếm để dùng, cùng việc cần ghi xuống kho khóa, theo đúng thứ tự (bộ đếm trước, bản ghi đánh dấu sau).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaidState {
    pub resolution: Resolution,
    pub counter: PaidCounter,
    /// Ghi bộ đếm (bộ đếm mới hay bộ đếm "mất bản ghi").
    pub write_counter: bool,
    /// Ghi bản ghi đánh dấu (chưa có, hay đang cũ).
    pub write_marker: bool,
}

/// Chọn bộ đếm cho token (xem đầu module). `fresh`: token **vừa nhận từ server** có `quota_fresh` (token đọc lại từ kho
/// khóa luôn là `false`). `existing`: bộ đếm của khóa hiện tại nếu có. `marker`: bản ghi đánh dấu của activation này.
pub fn resolve_paid(claims: &Claims, fresh: bool, existing: Option<PaidCounter>, marker: Option<&Marker>) -> PaidState {
    let key = PaidKey::of(claims);
    let stale_marker = |m: Option<&Marker>| m.is_none_or(|m| *m != Marker::of(&key));
    if let Some(counter) = existing.filter(|c| c.key == key) {
        return PaidState {
            resolution: Resolution::Existing,
            write_marker: stale_marker(marker),
            counter,
            write_counter: false,
        };
    }
    let marker = marker.filter(|m| m.license_id == key.license_id && m.activation_id == key.activation_id);
    let fresh_start = fresh
        || marker.is_some_and(|m| key.epoch > m.epoch)
        || marker.is_some_and(|m| m.epoch == key.epoch && m.cycle_start < key.cycle_start);
    let (resolution, used_ms, lost) = if fresh_start {
        (Resolution::Fresh, 0, false)
    } else {
        let limit = cycle(claims).limit_ms.unwrap_or(0);
        (Resolution::Lost, limit, true)
    };
    PaidState {
        resolution,
        counter: PaidCounter {
            key: key.clone(),
            used_ms,
            lost,
        },
        write_counter: true,
        write_marker: true,
    }
}

/// Còn bao nhiêu mili giây của chu kỳ; `None` là không giới hạn.
pub fn paid_remaining(claims: &Claims, counter: &PaidCounter) -> Option<u64> {
    cycle(claims)
        .limit_ms
        .map(|limit| limit.saturating_sub(counter.used_ms))
}

/// Bộ đếm Free của ngày.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FreeCounter {
    /// Ngày (theo giờ máy) của lần reset gần nhất.
    pub day: NaiveDate,
    /// Giờ máy lúc reset (giây Unix).
    pub reset_at: i64,
    /// Header `Date` mới nhất của server thấy được trước lần reset (giây Unix), nếu có.
    pub server_date_at_reset: Option<i64>,
    /// Thời gian đơn điệu cộng dồn lúc app chạy kể từ lần reset (mili giây).
    pub monotonic_ms: u64,
    pub used_ms: u64,
    /// Tạo ra vì mất bản ghi (đã dùng hết hôm đó).
    #[serde(default)]
    pub lost: bool,
    /// Bộ đếm vừa được kéo về vì lần reset ghi theo giờ máy ở tương lai: giờ máy không tin được tới lần reset sau, nên lần
    /// reset đó chỉ dựa vào thời gian đơn điệu hay hiệu header `Date` (QB của review 06 lần 2).
    #[serde(default)]
    pub clock_pulled: bool,
}

/// Mốc thời gian chung cho luật đồng hồ.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Seen {
    /// Giờ máy lớn nhất từng thấy (giây Unix).
    pub max_machine: i64,
    /// Header `Date` mới nhất của server (giây Unix).
    pub latest_server_date: Option<i64>,
}

impl Seen {
    /// Ghi nhận giờ máy hiện tại.
    pub fn observe_machine(&mut self, now: i64) {
        self.max_machine = self.max_machine.max(now);
    }

    /// Ghi nhận `issued_at` của token đã ký: một mốc giờ của server không làm giả được, có cả khi offline hay khi response
    /// không có `Date` (QA của review 06 lần 2). Nâng mốc của giờ tin được và của chỉnh lùi; không hạ giờ máy lớn nhất (token
    /// có thể đã cấp từ nhiều ngày trước).
    pub fn observe_signed(&mut self, issued_at: i64) {
        self.latest_server_date = Some(self.latest_server_date.map_or(issued_at, |d| d.max(issued_at)));
    }

    /// Ghi nhận header `Date` của một response từ server của app. Mốc giờ máy lớn nhất mà vượt giờ server quá 10 phút (giờ
    /// máy từng bị đặt tới trước rồi chỉnh lại đúng) thì hạ về giờ server: server là nguồn giờ đáng tin (qua TLS), nên
    /// người từng đặt nhầm giờ tới trước không bị coi là chỉnh lùi mãi. Chỉnh lùi thật vẫn bị phát hiện, vì giờ máy khi
    /// đó nhỏ hơn cả giờ server.
    pub fn observe_server(&mut self, date: i64) {
        self.latest_server_date = Some(self.latest_server_date.map_or(date, |d| d.max(date)));
        if self.max_machine > date + ROLLBACK_TOLERANCE_SECS {
            self.max_machine = date;
        }
    }

    /// Giờ tin được: giờ máy, hay header `Date` mới nhất của server nếu lớn hơn (giờ máy chậm). Dùng để so thời hạn của
    /// token, để đặt giờ máy lùi không kéo dài được gói trả phí.
    pub fn trusted_now(&self, now: i64) -> i64 {
        self.latest_server_date.map_or(now, |d| now.max(d))
    }

    /// Đồng hồ đã bị chỉnh lùi (§10.2): giờ máy hiện tại nhỏ hơn quá 10 phút so với mốc lớn nhất từng thấy, hay so với
    /// header `Date` mới nhất của server (giờ máy chậm từ trước lần mở app đầu tiên).
    pub fn rolled_back(&self, now: i64) -> bool {
        let mark = self
            .latest_server_date
            .map_or(self.max_machine, |d| self.max_machine.max(d));
        now < mark - ROLLBACK_TOLERANCE_SECS
    }
}

/// Ngày theo múi giờ `tz` của thời điểm `t`. App truyền `chrono::Local` (giờ máy); test truyền múi giờ cố định.
pub fn local_day<Tz: TimeZone>(tz: &Tz, t: i64) -> NaiveDate {
    tz.timestamp_opt(t, 0)
        .earliest()
        .map_or_else(NaiveDate::default, |d| d.date_naive())
}

/// Bộ đếm Free mới, bắt đầu từ 0, reset lúc `now`.
pub fn free_start<Tz: TimeZone>(tz: &Tz, now: i64, seen: &Seen) -> FreeCounter {
    FreeCounter {
        day: local_day(tz, now),
        reset_at: now,
        server_date_at_reset: seen.latest_server_date,
        monotonic_ms: 0,
        used_ms: 0,
        lost: false,
        clock_pulled: false,
    }
}

/// Thời gian đã qua kể từ lần reset theo "đồng hồ thật" (giây): lớn nhất trong ba số (xem đầu module).
pub fn free_elapsed(counter: &FreeCounter, now: i64, seen: &Seen) -> i64 {
    let monotonic = (counter.monotonic_ms / 1000) as i64;
    let server = match (counter.server_date_at_reset, seen.latest_server_date) {
        (Some(before), Some(latest)) => latest - before,
        _ => 0,
    };
    let machine = if seen.rolled_back(now) || counter.clock_pulled {
        0
    } else {
        now - counter.reset_at
    };
    monotonic.max(server).max(machine)
}

/// Bộ đếm Free dùng lúc `now`. `stored`: bộ đếm đã lưu nếu có. `has_prior_data`: app đã có dữ liệu từ trước (file cài
/// đặt, mục kho khóa khác). Trả bộ đếm và `true` nếu phải ghi lại.
pub fn resolve_free<Tz: TimeZone>(
    tz: &Tz,
    stored: Option<FreeCounter>,
    has_prior_data: bool,
    now: i64,
    seen: &Seen,
) -> (FreeCounter, bool) {
    match stored {
        // Lần reset ghi theo giờ máy ở tương lai (giờ máy từng đặt nhầm tới trước rồi chỉnh lại): kéo `day`, `reset_at` về
        // hiện tại, giữ phút đã dùng và thời gian đơn điệu đã đếm, và đánh dấu giờ máy không tin được tới lần reset sau:
        // lần đó cần sang ngày mới và 20 giờ thời gian đơn điệu hay hiệu `Date` tính từ đây, không tính hiệu giờ máy (QB của
        // review 06 lần 2). Nhờ vậy đặt giờ tới trước rồi lùi về, lặp lại, không mở thêm phút nào.
        Some(c) if c.day > local_day(tz, now) || c.reset_at > now + ROLLBACK_TOLERANCE_SECS => (
            FreeCounter {
                day: local_day(tz, now),
                reset_at: now,
                server_date_at_reset: seen.latest_server_date,
                clock_pulled: true,
                ..c
            },
            true,
        ),
        Some(c) if local_day(tz, now) > c.day && free_elapsed(&c, now, seen) >= FREE_MIN_GAP_SECS => {
            (free_start(tz, now, seen), true)
        }
        Some(c) => (c, false),
        None if has_prior_data => (
            FreeCounter {
                used_ms: FREE_DAILY_MS,
                lost: true,
                ..free_start(tz, now, seen)
            },
            true,
        ),
        None => (free_start(tz, now, seen), true),
    }
}

/// Thời điểm hạn mức Free reset (giây Unix, giờ máy): max(00:00 hôm sau của ngày reset, lần reset trước + 20 giờ).
pub fn free_reset_time<Tz: TimeZone>(tz: &Tz, counter: &FreeCounter) -> i64 {
    let midnight = counter
        .day
        .checked_add_days(Days::new(1))
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|d| tz.from_local_datetime(&d).earliest())
        .map_or(counter.reset_at + DAY_SECS, |d| d.timestamp());
    midnight.max(counter.reset_at + FREE_MIN_GAP_SECS)
}

pub fn free_remaining(counter: &FreeCounter) -> u64 {
    FREE_DAILY_MS.saturating_sub(counter.used_ms)
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::quota -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::quota::tests::a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes ... ok
test license::quota::tests::a_machine_clock_behind_the_server_is_rolled_back ... ok
test license::quota::tests::a_marker_without_its_counter_means_the_record_was_lost ... ok
test license::quota::tests::a_new_epoch_starts_over_with_a_marker_or_inside_the_fresh_window ... ok
test license::quota::tests::a_short_last_cycle_gets_a_share_of_the_quota_rounded_up ... ok
test license::quota::tests::an_existing_counter_is_used_and_a_stale_or_missing_marker_is_rewritten ... ok
test license::quota::tests::changing_plan_starts_a_new_counter_with_or_without_a_marker ... ok
test license::quota::tests::forward_back_forward_with_the_same_offset_gives_no_new_minutes ... ok
test license::quota::tests::free_needs_a_new_day_as_well_as_twenty_hours ... ok
test license::quota::tests::free_resets_only_on_a_new_day_after_20_real_hours ... ok
test license::quota::tests::free_starts_at_zero_on_the_first_run_and_is_used_up_when_its_record_is_lost ... ok
test license::quota::tests::moving_the_clock_does_not_reset_free_but_real_time_does ... ok
test license::quota::tests::records_of_another_activation_are_not_used ... ok
test license::quota::tests::the_cycle_follows_the_server_clock_and_never_goes_below_zero ... ok
test license::quota::tests::the_rollback_tolerance_is_ten_minutes ... ok
test license::quota::tests::the_signed_issue_time_counts_as_server_time ... ok
test license::quota::tests::the_three_fresh_rules_survive_a_crash_between_the_two_writes ... ok
test result: ok. 17 passed; 0 failed; 0 ignored; 0 measured; 326 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/license/mod.rs \
  src-tauri/src/license/quota.rs
git commit -m "feat(app): luật hạn mức của gói trả phí và Free, chống chỉnh đồng hồ, dạng phép tính thuần (§6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 5: Bản ghi trong kho khóa (`license/store.rs`)

Spec §6.8 "Lưu bộ đếm", "Thứ tự ghi", §10.2. QĐ10. Mỗi mục kho khóa là một JSON nhỏ (dưới 2048 byte): `license` (key, `activation_id`, token, lần `validate` thành công gần nhất), `license-order` (đơn đang chờ), `license-seen` (giờ máy lớn nhất, header `Date` mới nhất), `quota-free`, `quota-paid-<băm>`, `quota-mark-<băm>` (tên mục có băm vì giới hạn 64 ký tự; nội dung mang đủ khóa, bộ đếm chỉ dùng khi khóa khớp).

- `write_paid` ghi bộ đếm trước, bản ghi đánh dấu sau. Test kiểm thứ tự, và ca app bị tắt sau lần ghi đầu.
- Đọc lỗi (kho khóa bị từ chối, mục hỏng) khác "chưa có": nơi gọi áp luật chặt.
- Bản ghi license có `verdict` (`expired`, `revoked`): kết luận gần nhất của server, nhớ qua lần mở app sau (QĐ14).
- `Vault` là trait (kho khóa thật, `FakeVault` trong test).

**Files:**
- Modify: `src-tauri/src/license/mod.rs`
- Create: `src-tauri/src/license/store.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 4a6f215d6a3250ae91b03a78b3273551518bffa6..3d3dff0716880b68cd214235e7ee7386bfdca441 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -10,4 +10,5 @@
 pub mod key;
 pub mod keys;
 pub mod quota;
+pub mod store;
 pub mod token;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::store 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `store.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 1 previous error
error[E0583]: file not found for module `store`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 3d3dff0716880b68cd214235e7ee7386bfdca441..430de1f6fd5568172be957d2985ed1df8b53068c 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -4,6 +4,7 @@
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
+//! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
 //! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
 pub mod device;
```

Tạo `src-tauri/src/license/store.rs`:

```rust
//! Trạng thái bản quyền và hạn mức trong kho khóa của hệ điều hành (spec §6.8 "Lưu bộ đếm", §10.2): Keychain trên macOS,
//! Credential Manager trên Windows (`persistence = Local`). Không lưu file thường.
//!
//! Mục của kho khóa (mỗi mục một JSON nhỏ, dưới giới hạn 2048 byte của `Keystore`):
//! - `license`: key đã kích hoạt, `activation_id`, token mới nhất, lần `validate` thành công gần nhất (giờ máy);
//! - `license-order`: đơn đang chờ thanh toán (`order_code`, `order_token`), để mở lại app vẫn hỏi tiếp (§6.8 bước 5);
//! - `license-seen`: giờ máy lớn nhất từng thấy và header `Date` mới nhất của server ([`Seen`]);
//! - `quota-free`: bộ đếm Free của ngày;
//! - `quota-paid-<băm>`: bộ đếm của một khóa (`license_id`, `activation_id`, mốc đầu chu kỳ, `quota_epoch`);
//! - `quota-mark-<băm>`: bản ghi đánh dấu của một activation (`license_id`, `activation_id`).
//!
//! Tên mục có phần băm (32 chữ số hex đầu của SHA-256) vì kho khóa giới hạn tên 64 ký tự; nội dung mục vẫn mang đủ khóa,
//! và bộ đếm chỉ được dùng khi khóa trong nội dung khớp. Thứ tự ghi của luật hạn mức (bộ đếm trước, bản ghi đánh dấu sau)
//! nằm ở [`write_paid`].
//!
//! Đọc lỗi (kho khóa bị từ chối, mục hỏng) khác với "chưa có": [`StoreError`] để nơi gọi áp luật chặt (coi như đã hết
//! hạn mức), không coi là bắt đầu từ 0.

use serde::Serialize;
use serde::de::DeserializeOwned;
use sha2::{Digest, Sha256};

use super::quota::{FreeCounter, Marker, PaidCounter, PaidKey, PaidState, Seen};
use crate::security::keystore::Keystore;

pub const LICENSE: &str = "license";
pub const ORDER: &str = "license-order";
pub const SEEN: &str = "license-seen";
pub const FREE: &str = "quota-free";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum StoreError {
    #[error("không đọc ghi được kho khóa: {0}")]
    Keystore(String),
    #[error("mục `{0}` của kho khóa hỏng")]
    Corrupt(String),
}

/// Nơi lưu: kho khóa thật, hay bản giả trong test.
pub trait Vault: Send + Sync {
    fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String>;
    fn set(&self, name: &str, value: &[u8]) -> Result<(), String>;
    fn delete(&self, name: &str) -> Result<(), String>;
}

impl Vault for Keystore {
    fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
        Keystore::get(self, name).map_err(|e| e.to_string())
    }

    fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
        Keystore::set(self, name, value).map_err(|e| e.to_string())
    }

    fn delete(&self, name: &str) -> Result<(), String> {
        Keystore::delete(self, name).map(|_| ()).map_err(|e| e.to_string())
    }
}

/// Key đã kích hoạt trên máy này.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct LicenseRecord {
    /// Dạng lưu trữ (28 ký tự).
    pub key: String,
    pub activation_id: String,
    /// Token mới nhất server cấp.
    pub token: String,
    /// Giờ máy của lần `activate` hay `validate` thành công gần nhất (giây Unix).
    pub validated_at: i64,
    /// Kết luận gần nhất của server về license này (`license_expired`, `license_revoked`), nhớ qua lần mở app sau kể cả khi
    /// offline. Token mới từ server xóa nó.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verdict: Option<Verdict>,
}

/// Kết luận của server khi `validate`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Expired,
    Revoked,
}

/// Đơn đang chờ thanh toán.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
pub struct PendingOrder {
    pub order_code: i64,
    pub order_token: String,
    pub plan: String,
    /// Hết hạn của link thanh toán (giây Unix).
    pub expires_at: i64,
    /// Đơn gia hạn hay đổi gói (có `license_key`): khi đã trả tiền thì `validate`, không `activate`.
    pub renewal: bool,
}

fn short_hash(parts: &[&str]) -> String {
    let mut h = Sha256::new();
    for p in parts {
        h.update((p.len() as u64).to_le_bytes());
        h.update(p.as_bytes());
    }
    h.finalize()[..16].iter().map(|b| format!("{b:02x}")).collect()
}

pub fn paid_name(key: &PaidKey) -> String {
    let start = key.cycle_start.to_string();
    let epoch = key.epoch.to_string();
    format!(
        "quota-paid-{}",
        short_hash(&[&key.license_id, &key.activation_id, &start, &epoch])
    )
}

pub fn marker_name(license_id: &str, activation_id: &str) -> String {
    format!("quota-mark-{}", short_hash(&[license_id, activation_id]))
}

pub fn read<T: DeserializeOwned>(vault: &dyn Vault, name: &str) -> Result<Option<T>, StoreError> {
    match vault.get(name).map_err(StoreError::Keystore)? {
        None => Ok(None),
        Some(bytes) => serde_json::from_slice(&bytes)
            .map(Some)
            .map_err(|_| StoreError::Corrupt(name.into())),
    }
}

pub fn write<T: Serialize>(vault: &dyn Vault, name: &str, value: &T) -> Result<(), StoreError> {
    let bytes = serde_json::to_vec(value).map_err(|_| StoreError::Corrupt(name.into()))?;
    vault.set(name, &bytes).map_err(StoreError::Keystore)
}

pub fn delete(vault: &dyn Vault, name: &str) -> Result<(), StoreError> {
    vault.delete(name).map_err(StoreError::Keystore)
}

/// Bộ đếm của khóa `key`, chỉ khi nội dung mục mang đúng khóa đó.
pub fn read_paid(vault: &dyn Vault, key: &PaidKey) -> Result<Option<PaidCounter>, StoreError> {
    Ok(read::<PaidCounter>(vault, &paid_name(key))?.filter(|c| c.key == *key))
}

pub fn read_marker(vault: &dyn Vault, license_id: &str, activation_id: &str) -> Result<Option<Marker>, StoreError> {
    read(vault, &marker_name(license_id, activation_id))
}

/// Ghi kết quả của `quota::resolve_paid`: bộ đếm trước, bản ghi đánh dấu sau (spec §6.8 "Thứ tự ghi"). App bị tắt giữa
/// hai lần ghi thì lần sau còn bộ đếm, nên luật "đã có bộ đếm" dùng lại nó, không coi là mất bản ghi.
pub fn write_paid(vault: &dyn Vault, state: &PaidState) -> Result<(), StoreError> {
    if state.write_counter {
        write(vault, &paid_name(&state.counter.key), &state.counter)?;
    }
    if state.write_marker {
        let key = &state.counter.key;
        write(
            vault,
            &marker_name(&key.license_id, &key.activation_id),
            &Marker::of(key),
        )?;
    }
    Ok(())
}

/// Cộng phút vào bộ đếm đã có rồi ghi lại.
pub fn save_paid(vault: &dyn Vault, counter: &PaidCounter) -> Result<(), StoreError> {
    write(vault, &paid_name(&counter.key), counter)
}

pub fn read_free(vault: &dyn Vault) -> Result<Option<FreeCounter>, StoreError> {
    read(vault, FREE)
}

pub fn read_seen(vault: &dyn Vault) -> Result<Seen, StoreError> {
    Ok(read(vault, SEEN)?.unwrap_or_default())
}

#[cfg(test)]
pub mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::*;
    use crate::license::quota::{Resolution, resolve_paid};
    use crate::license::token::{Claims, Plan};

    /// Kho giả: ghi lại thứ tự các lần ghi; có thể cho lỗi đọc hay lỗi ghi một mục.
    #[derive(Default)]
    pub struct FakeVault {
        pub items: Mutex<HashMap<String, Vec<u8>>>,
        pub writes: Mutex<Vec<String>>,
        pub fail_reads: Mutex<bool>,
        pub fail_writes_of: Mutex<Option<String>>,
    }

    impl Vault for FakeVault {
        fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            if *self.fail_reads.lock().unwrap() {
                return Err("bị từ chối".into());
            }
            Ok(self.items.lock().unwrap().get(name).cloned())
        }

        fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
            if self
                .fail_writes_of
                .lock()
                .unwrap()
                .as_deref()
                .is_some_and(|p| name.starts_with(p))
            {
                return Err("bị tắt giữa chừng".into());
            }
            self.writes.lock().unwrap().push(name.into());
            self.items.lock().unwrap().insert(name.into(), value.to_vec());
            Ok(())
        }

        fn delete(&self, name: &str) -> Result<(), String> {
            self.items.lock().unwrap().remove(name);
            Ok(())
        }
    }

    pub fn claims() -> Claims {
        Claims {
            kid: "test-1".into(),
            license_id: "lic".into(),
            activation_id: "act".into(),
            activation_created_at: 1_790_812_800,
            device_id_hash: "dev".into(),
            plan: Plan::Pro,
            expires_at: 1_790_812_800 + 30 * 86_400,
            cycle_anchor: 1_790_812_800,
            quota_minutes_per_cycle: Some(1800),
            quota_epoch: 0,
            quota_fresh: false,
            issued_at: 1_790_812_800 + 3600,
            refresh_before: 1_790_812_800 + 15 * 86_400,
        }
    }

    #[test]
    fn the_counter_is_written_before_the_marker() {
        let vault = FakeVault::default();
        let state = resolve_paid(&claims(), true, None, None);
        write_paid(&vault, &state).unwrap();
        let key = PaidKey::of(&claims());
        assert_eq!(
            *vault.writes.lock().unwrap(),
            [paid_name(&key), marker_name("lic", "act")]
        );
        assert_eq!(read_paid(&vault, &key).unwrap().unwrap().used_ms, 0);
        assert_eq!(read_marker(&vault, "lic", "act").unwrap(), Some(Marker::of(&key)));
    }

    /// App bị tắt sau khi ghi bộ đếm mà trước khi ghi bản ghi đánh dấu: lần sau vẫn dùng bộ đếm đó.
    #[test]
    fn a_crash_after_the_counter_write_keeps_the_counter() {
        let vault = FakeVault::default();
        *vault.fail_writes_of.lock().unwrap() = Some("quota-mark-".into());
        let state = resolve_paid(&claims(), true, None, None);
        assert!(write_paid(&vault, &state).is_err());
        *vault.fail_writes_of.lock().unwrap() = None;
        let key = PaidKey::of(&claims());
        let existing = read_paid(&vault, &key).unwrap();
        let again = resolve_paid(
            &claims(),
            false,
            existing,
            read_marker(&vault, "lic", "act").unwrap().as_ref(),
        );
        assert_eq!((again.resolution, again.write_marker), (Resolution::Existing, true));
    }

    #[test]
    fn names_fit_the_keystore_and_a_counter_is_only_used_for_its_own_key() {
        let key = PaidKey::of(&claims());
        let name = paid_name(&key);
        assert!(name.len() <= 64 && name.starts_with("quota-paid-"), "{name}");
        assert!(marker_name("lic", "act").len() <= 64);
        let mut other = key.clone();
        other.epoch = 1;
        assert_ne!(paid_name(&other), name);
        // Mục mang khóa khác (bị sửa, hay trùng băm) thì không dùng.
        let vault = FakeVault::default();
        write(
            &vault,
            &name,
            &PaidCounter {
                key: other,
                used_ms: 1,
                lost: false,
            },
        )
        .unwrap();
        assert_eq!(read_paid(&vault, &key).unwrap(), None);
    }

    #[test]
    fn read_errors_and_corrupt_items_are_not_the_same_as_missing() {
        let vault = FakeVault::default();
        assert_eq!(read_free(&vault).unwrap(), None);
        vault.items.lock().unwrap().insert(FREE.into(), b"{".to_vec());
        assert_eq!(read_free(&vault), Err(StoreError::Corrupt(FREE.into())));
        *vault.fail_reads.lock().unwrap() = true;
        assert!(matches!(read_seen(&vault), Err(StoreError::Keystore(_))));
    }

    /// Hai nút xóa dữ liệu (§4.3; 04 thêm "Xóa model và dữ liệu", cũng gọi `data::clear_all_data`) chỉ xóa `data.db` và mục
    /// `db-key`: bản quyền, đơn đang chờ và bộ đếm hạn mức trong cùng kho khóa giữ nguyên (Q14 của 03).
    #[test]
    fn wiping_user_data_keeps_the_license_and_the_quota_counters() {
        let keys = keyring_core::mock::Store::new().unwrap();
        let service = "com.aitranslator.desktop.test";
        let ks = Keystore::with_store(service, keys.clone());
        let dir = std::env::temp_dir().join(format!("mt-license-wipe-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let db = crate::db::DataStore::new(dir.clone(), Ok(Keystore::with_store(service, keys)));
        db.with(|_| Ok::<_, crate::db::DbError>(())).unwrap();
        assert!(ks.get(crate::db::KEY_NAME).unwrap().is_some());
        let names = [LICENSE, ORDER, SEEN, FREE, "quota-paid-0123", "quota-mark-0123"];
        for name in names {
            ks.set(name, b"{}").unwrap();
        }
        db.wipe().unwrap();
        assert_eq!(ks.get(crate::db::KEY_NAME).unwrap(), None, "khóa DB bị xóa");
        for name in names {
            assert_eq!(ks.get(name).unwrap().as_deref(), Some(&b"{}"[..]), "{name} giữ nguyên");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Với kho khóa trong bộ nhớ của `keyring-core`: mục lớn nhất (bản ghi license có token thật) vừa giới hạn 2048 byte.
    #[test]
    fn a_license_record_with_a_real_token_fits_the_keystore() {
        let ks = Keystore::mock("com.aitranslator.desktop.test");
        let vectors: serde_json::Value =
            serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap();
        let record = LicenseRecord {
            key: "0123456789ABCDEFGHJKMNPQRST5".into(),
            activation_id: "5d0e8a47-3b2c-4f6d-8e1a-7c9b0d2e4f60".into(),
            token: vectors["tokens"][0]["token"].as_str().unwrap().into(),
            validated_at: 1_790_816_400,
            verdict: Some(Verdict::Revoked),
        };
        write(&ks, LICENSE, &record).unwrap();
        assert_eq!(read::<LicenseRecord>(&ks, LICENSE).unwrap(), Some(record));
    }
}
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::store -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::store::tests::a_crash_after_the_counter_write_keeps_the_counter ... ok
test license::store::tests::a_license_record_with_a_real_token_fits_the_keystore ... ok
test license::store::tests::names_fit_the_keystore_and_a_counter_is_only_used_for_its_own_key ... ok
test license::store::tests::read_errors_and_corrupt_items_are_not_the_same_as_missing ... ok
test license::store::tests::the_counter_is_written_before_the_marker ... ok
test license::store::tests::wiping_user_data_keeps_the_license_and_the_quota_counters ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 343 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/mod.rs \
  src-tauri/src/license/store.rs
git commit -m "feat(app): bản ghi bản quyền và bộ đếm hạn mức trong kho khóa, ghi bộ đếm trước bản ghi đánh dấu (§6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 6: Client của license server (`license/client.rs`)

Spec §6.8 "API của license server", "Trong app: interface `LicenseProvider`"; hợp đồng ở mục "Hợp đồng API cho kế hoạch 06" của 05. QĐ11, QĐ12.

- Trait `LicenseApi` (plans, checkout, order, activate, validate, deactivate, recover); bản thật `HttpApi` dùng `reqwest` đồng bộ mà 04 đã thêm (TLS của hệ điều hành, proxy hệ thống; thân JSON tự ghi bằng `serde_json`), không theo redirect, User-Agent chung, chỉ `https` (bản debug cho thêm `http://127.0.0.1`, `http://localhost` qua `AI_TRANSLATOR_LICENSE_URL` để chạy `wrangler dev`).
- `STAGING_URL`, `PRODUCTION_URL` còn `None` (điền ở 06b Task 6 sau 05 Task 19, 21): chưa có thì app chỉ dùng token đã lưu và Free.
- Mọi response trả header `Date` cho nơi gọi. Lỗi `{"error": …}` giữ mã và các trường app hiện: `409 device_limit` kèm danh sách máy (`device_label` có thể `null`), `429` kèm `Retry-After`, `403 license_expired` kèm `expires_at`. `order_token` đi trong header `Authorization`.
- Test dùng server HTTP giả chạy trên `127.0.0.1` (luồng riêng, `TcpListener`).
- Lệnh kiểm cuối của Step 5 in `warning: nothing to print.` (không có `openssl-sys` trong cây của macOS) và `0` (không có `rustls`, `aws-lc-rs`, `ring`).

**Files:**
- Create: `src-tauri/src/license/client.rs`
- Modify: `src-tauri/src/license/mod.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Tạo `src-tauri/src/license/client.rs`, lúc này mới có phần test:

```rust
//! Client của license server (spec §6.8 "API của license server", "Trong app: interface `LicenseProvider`"; hợp đồng ở
//! mục "Hợp đồng API cho kế hoạch 06" của kế hoạch 05). Gọi từ phía Rust (server không bật CORS), bằng `reqwest` đồng bộ
//! trên luồng nền, TLS và proxy của hệ điều hành.
//!
//! - Chỉ `https`, không theo redirect. Bản debug cho thêm `http://127.0.0.1` và `http://localhost` (chạy `wrangler dev`
//!   cục bộ) qua biến `AI_TRANSLATOR_LICENSE_URL`.
//! - Mọi response (cả lỗi) đưa header `Date` cho nơi gọi, làm mốc "đồng hồ thật" của Free (§6.8).
//! - `429` mang `Retry-After` (giây); app báo "thử lại sau", không thử lại liên tục. `429` ở `activate` không có nghĩa là
//!   key sai (§10.2, CGNAT).
//! - Không ghi key, token hay email vào log.

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    /// Một request server giả nhận được.
    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        authorization: Option<String>,
        body: Value,
    }

    /// Một response của server giả: mã, header thêm, body.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server HTTP giả: trả lần lượt các response cho các request tới.
    fn serve(responses: Vec<Canned>) -> (String, Arc<Mutex<Vec<Seen>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for (status, headers, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let mut parts = line.split_whitespace();
                let mut req = Seen {
                    method: parts.next().unwrap_or_default().into(),
                    path: parts.next().unwrap_or_default().into(),
                    ..Seen::default()
                };
                let mut length = 0;
                loop {
                    let mut h = String::new();
                    reader.read_line(&mut h).unwrap();
                    let h = h.trim_end();
                    if h.is_empty() {
                        break;
                    }
                    let (name, value) = h.split_once(':').unwrap();
                    match name.to_ascii_lowercase().as_str() {
                        "content-length" => length = value.trim().parse().unwrap(),
                        "authorization" => req.authorization = Some(value.trim().into()),
                        _ => {}
                    }
                }
                let mut buf = vec![0; length];
                reader.read_exact(&mut buf).unwrap();
                req.body = serde_json::from_slice(&buf).unwrap_or(Value::Null);
                log.lock().unwrap().push(req);
                let extra: String = headers.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nDate: Thu, 01 Oct 2026 00:00:00 GMT\r\n{extra}Connection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    #[test]
    fn activate_sends_the_device_and_reads_the_token_and_the_server_date() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"pro","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"));
        let granted = reply.result.unwrap();
        assert_eq!(
            (
                granted.token.as_str(),
                granted.activation_id.as_str(),
                granted.quota_fresh
            ),
            ("v1.a.b", "act", true)
        );
        assert_eq!(
            reply.date,
            Some(1_790_812_800),
            "header Date làm mốc đồng hồ thật của Free"
        );
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(
            (req.method.as_str(), req.path.as_str()),
            ("POST", "/v1/licenses/activate")
        );
        assert_eq!(
            req.body,
            json!({ "key": "KEY", "device_id_hash": "ab12", "device_label": "Máy của Phong" })
        );
    }

    #[test]
    fn errors_keep_their_code_and_the_fields_the_app_shows() {
        let (base, _) = serve(vec![
            (
                409,
                vec![],
                r#"{"error":"device_limit","activations":[{"activation_id":"a1","device_label":null,"last_validated_at":5},{"activation_id":"a2","device_label":"Mac","last_validated_at":null}]}"#,
            ),
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (403, vec![], r#"{"error":"license_expired","expires_at":1790000000}"#),
            (502, vec![], "not json"),
        ]);
        let api = HttpApi::new(accept_base(&base, true));
        let Err(ApiError::Server(e)) = api.activate("K", "d", None).result else {
            panic!()
        };
        assert_eq!((e.status, e.code.as_str()), (409, "device_limit"));
        assert_eq!(e.devices.len(), 2);
        assert_eq!(e.devices[0].device_label, None, "`device_label` có thể là null");
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
        assert_eq!((e.code.as_str(), e.retry_after), ("rate_limited", Some(120)));
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
        assert_eq!(
            (e.code.as_str(), e.expires_at),
            ("license_expired", Some(1_790_000_000))
        );
        let Err(ApiError::Server(e)) = api.recover("a@b.vn").result else {
            panic!()
        };
        assert_eq!(e.code, "http_502");
    }

    /// `order_token` đi trong header `Authorization`, không trong URL (§6.8).
    #[test]
    fn the_order_token_goes_in_the_authorization_header() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"order_code":12,"status":"paid","plan":"pro","amount":50000,"currency":"VND","expires_at":9,"license_key":"0123-4567-89AB-CDEF-GHJK-MNPQ-RST5","license_plan":"pro","license_expires_at":99,"grant_kind":"new"}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.order(12, "tok-1").result.unwrap();
        assert_eq!(
            (order.status.as_str(), order.grant_kind.as_deref()),
            ("paid", Some("new"))
        );
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(req.path, "/v1/orders/12");
        assert_eq!(req.authorization.as_deref(), Some("Bearer tok-1"));
    }

    #[test]
    fn checkout_sends_consent_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"pro","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        assert_eq!(api.checkout("pro", "a@b.vn", None).result.unwrap().order_code, 7);
        api.checkout("pro", "a@b.vn", Some("KEY")).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "pro", "email": "a@b.vn", "consent": true })
        );
        assert_eq!(reqs[1].body["license_key"], "KEY");
    }

    #[test]
    fn only_https_is_accepted_and_http_only_for_this_machine_in_debug() {
        assert_eq!(
            accept_base("https://api.example.vn/", false).as_deref(),
            Some("https://api.example.vn")
        );
        assert_eq!(accept_base("http://api.example.vn", true), None);
        assert_eq!(accept_base("http://127.0.0.1:8787", false), None);
        assert!(accept_base("http://127.0.0.1:8787", true).is_some());
        assert_eq!(accept_base("https://x.vn/?k=1", false), None);
        assert_eq!(accept_base("ftp://x.vn", true), None);
        let none = HttpApi::new(None);
        assert!(!none.configured());
        assert_eq!(none.plans().result, Err(ApiError::NotConfigured));
    }

    #[test]
    fn http_dates_parse_and_bad_ones_are_ignored() {
        assert_eq!(parse_http_date("Thu, 01 Oct 2026 00:00:00 GMT"), Some(1_790_812_800));
        assert_eq!(parse_http_date("hôm qua"), None);
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 430de1f6fd5568172be957d2985ed1df8b53068c..238f300d3fef84de8c2f9ddf0df4c606818de6c2 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -7,6 +7,7 @@
 //! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
 //! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
+pub mod client;
 pub mod device;
 pub mod key;
 pub mod keys;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::client 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `client.rs`):
```text
error: cannot find macro `json` in this scope
error: could not compile `meeting-translator` (lib test) due to 26 previous errors; 1 warning emitted
error[E0425]: cannot find function `accept_base` in this scope
error[E0425]: cannot find function `parse_http_date` in this scope
error[E0425]: cannot find type `Value` in this scope
error[E0433]: cannot find type `ApiError` in this scope
```

- [ ] **Step 3: Viết code**

Thêm vào `src-tauri/src/license/client.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

/// Địa chỉ license server của từng môi trường. Điền sau khi triển khai (kế hoạch 05, Task 19 cho staging, Task 21 cho
/// production; tên miền chờ T7). Chưa có thì app chỉ dùng được token đã lưu và gói Free.
pub const STAGING_URL: Option<&str> = None;
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản debug: trỏ sang server khác (ví dụ `http://127.0.0.1:8787` của `wrangler dev`).
pub const URL_ENV: &str = "AI_TRANSLATOR_LICENSE_URL";
const USER_AGENT: &str = "AI-Translator";

/// Lỗi của một lần gọi server.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ApiError {
    #[error("chưa cấu hình địa chỉ license server")]
    NotConfigured,
    #[error("lỗi mạng: {0}")]
    Network(String),
    /// Server trả lỗi `{"error": "<mã>", …}`.
    #[error("server trả {0}")]
    Server(ServerError),
    #[error("response sai dạng: {0}")]
    Decode(String),
}

/// Lỗi có mã của server, cùng các trường đi kèm mà app dùng.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ServerError {
    pub status: u16,
    pub code: String,
    /// `429`: số giây phải chờ.
    pub retry_after: Option<u64>,
    /// `409 device_limit`: các máy đang kích hoạt.
    pub devices: Vec<Device>,
    /// `403 license_expired`.
    pub expires_at: Option<i64>,
    /// `400 invalid_request`: trường sai.
    pub field: Option<String>,
}

impl std::fmt::Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.status, self.code)
    }
}

/// Một máy đã kích hoạt, trong `409 device_limit`. `device_label` có thể là `null` (ví dụ sau khi admin xóa dữ liệu cá
/// nhân): giao diện hiện tên thay thế.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Device {
    pub activation_id: String,
    pub device_label: Option<String>,
    pub last_validated_at: Option<i64>,
}

/// Token server vừa cấp (`activate`, `validate`). App tự đọc mọi trường từ token đã kiểm chữ ký; `quota_fresh` của
/// response này là nơi duy nhất app tin cờ đó (spec §6.8).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Granted {
    pub token: String,
    pub activation_id: String,
    pub quota_fresh: bool,
}

/// Một gói đang bán (`GET /v1/plans`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct PlanOffer {
    pub code: String,
    pub name: String,
    pub quota_minutes_per_cycle: Option<u32>,
    pub days_per_order: u32,
    pub prices: std::collections::BTreeMap<String, i64>,
}

/// Đơn vừa tạo (`POST /v1/checkout`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Checkout {
    pub order_code: i64,
    pub order_token: String,
    pub checkout_url: String,
    pub qr_code: String,
    pub plan: String,
    pub amount: i64,
    pub currency: String,
    pub expires_at: i64,
    pub license_expires_at: Option<i64>,
    pub converted_days: Option<i64>,
}

/// Trạng thái đơn (`GET /v1/orders/{order_code}`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct OrderStatus {
    pub order_code: i64,
    pub status: String,
    pub plan: String,
    pub expires_at: i64,
    pub license_key: Option<String>,
    pub license_plan: Option<String>,
    pub license_expires_at: Option<i64>,
    pub grant_kind: Option<String>,
}

/// Một response: kết quả, cùng header `Date` (giây Unix) nếu đọc được.
pub struct Reply<T> {
    pub result: Result<T, ApiError>,
    pub date: Option<i64>,
}

/// Các lệnh của license server mà app dùng (spec §6.8). App thật là [`HttpApi`]; test dùng bản giả.
pub trait LicenseApi: Send + Sync {
    fn plans(&self) -> Reply<Vec<PlanOffer>>;
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout>;
    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus>;
    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted>;
    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted>;
    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()>;
    fn recover(&self, email: &str) -> Reply<()>;
}

/// Client HTTP thật.
pub struct HttpApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

/// URL gốc được nhận: `https://…`, hay (`allow_http`) `http://127.0.0.1…`, `http://localhost…`.
pub fn accept_base(url: &str, allow_http: bool) -> Option<String> {
    let url = url.trim_end_matches('/');
    let parsed = reqwest::Url::parse(url).ok()?;
    let ok = match parsed.scheme() {
        "https" => true,
        "http" => allow_http && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost")),
        _ => false,
    };
    (ok && parsed.query().is_none()).then(|| url.to_string())
}

impl HttpApi {
    /// Server của bản build này: debug là staging (hay `AI_TRANSLATOR_LICENSE_URL`), phát hành là production.
    pub fn for_this_build() -> Self {
        let base = if cfg!(debug_assertions) {
            std::env::var(URL_ENV)
                .ok()
                .and_then(|u| accept_base(&u, true))
                .or_else(|| STAGING_URL.and_then(|u| accept_base(u, false)))
        } else {
            PRODUCTION_URL.and_then(|u| accept_base(u, false))
        };
        Self::new(base)
    }

    pub fn new(base: Option<String>) -> Self {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        Self { base, client }
    }

    pub fn configured(&self) -> bool {
        self.base.is_some()
    }

    fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        bearer: Option<&str>,
    ) -> Reply<T> {
        let Some(base) = &self.base else {
            return Reply {
                result: Err(ApiError::NotConfigured),
                date: None,
            };
        };
        let url = format!("{base}{path}");
        let mut req = match method {
            "GET" => self.client.get(&url),
            _ => self.client.post(&url),
        };
        if let Some(body) = body {
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }
        if let Some(token) = bearer {
            req = req.bearer_auth(token);
        }
        let resp = match req.send() {
            Ok(r) => r,
            Err(e) => {
                return Reply {
                    // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn có `order_code`.
                    result: Err(ApiError::Network(e.without_url().to_string())),
                    date: None,
                };
            }
        };
        let date = resp
            .headers()
            .get(reqwest::header::DATE)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_http_date);
        let status = resp.status().as_u16();
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let bytes = match resp.bytes() {
            Ok(b) => b,
            Err(e) => {
                return Reply {
                    result: Err(ApiError::Network(e.without_url().to_string())),
                    date,
                };
            }
        };
        let result = if (200..300).contains(&status) {
            serde_json::from_slice::<T>(&bytes).map_err(|e| ApiError::Decode(e.to_string()))
        } else {
            Err(ApiError::Server(server_error(status, retry_after, &bytes)))
        };
        Reply { result, date }
    }
}

/// Header `Date` (IMF-fixdate, cũng là dạng RFC 2822) ra giây Unix.
pub fn parse_http_date(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(value.trim())
        .ok()
        .map(|d| d.timestamp())
}

fn server_error(status: u16, retry_after: Option<u64>, body: &[u8]) -> ServerError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let devices = v
        .get("activations")
        .cloned()
        .and_then(|a| serde_json::from_value::<Vec<Device>>(a).ok())
        .unwrap_or_default();
    ServerError {
        status,
        code: v
            .get("error")
            .and_then(Value::as_str)
            .map_or_else(|| format!("http_{status}"), String::from),
        retry_after,
        devices,
        expires_at: v.get("expires_at").and_then(Value::as_i64),
        field: v.get("field").and_then(Value::as_str).map(String::from),
    }
}

#[derive(Deserialize)]
struct Ok200 {}

#[derive(Deserialize)]
struct PlansBody {
    plans: Vec<PlanOffer>,
}

fn unit<T>(reply: Reply<T>) -> Reply<()> {
    Reply {
        result: reply.result.map(|_| ()),
        date: reply.date,
    }
}

impl LicenseApi for HttpApi {
    fn plans(&self) -> Reply<Vec<PlanOffer>> {
        let r: Reply<PlansBody> = self.call("GET", "/v1/plans", None, None);
        Reply {
            result: r.result.map(|b| b.plans),
            date: r.date,
        }
    }

    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout> {
        let mut body = json!({ "plan": plan, "email": email, "consent": true });
        if let Some(key) = license_key {
            body["license_key"] = json!(key);
        }
        self.call("POST", "/v1/checkout", Some(body), None)
    }

    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus> {
        self.call("GET", &format!("/v1/orders/{order_code}"), None, Some(order_token))
    }

    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted> {
        let body = json!({ "key": key, "device_id_hash": device_id_hash, "device_label": device_label });
        self.call("POST", "/v1/licenses/activate", Some(body), None)
    }

    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
        let body = json!({ "key": key, "activation_id": activation_id });
        self.call("POST", "/v1/licenses/validate", Some(body), None)
    }

    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
        let body = json!({ "key": key, "activation_id": activation_id });
        unit(self.call::<Ok200>("POST", "/v1/licenses/deactivate", Some(body), None))
    }

    fn recover(&self, email: &str) -> Reply<()> {
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(json!({ "email": email })), None))
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 238f300d3fef84de8c2f9ddf0df4c606818de6c2..71da516e0effafa434a191a7a97c1d00479d941b 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -2,6 +2,7 @@
 //!
 //! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
+//! - [`client`]: gọi license server (`LicenseApi`, bản thật [`client::HttpApi`]).
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 //! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
```

Bản 04 đã khóa, 06 dùng chung:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && grep -A1 -E '^name = "(reqwest|native-tls)"' Cargo.lock | grep -v '^--'
```
Expected (lúc lập kế hoạch):
```text
name = "native-tls"
version = "0.2.18"
name = "reqwest"
version = "0.13.5"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::client -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::client::tests::activate_sends_the_device_and_reads_the_token_and_the_server_date ... ok
test license::client::tests::checkout_sends_consent_and_the_key_only_when_renewing ... ok
test license::client::tests::errors_keep_their_code_and_the_fields_the_app_shows ... ok
test license::client::tests::http_dates_parse_and_bad_ones_are_ignored ... ok
test license::client::tests::only_https_is_accepted_and_http_only_for_this_machine_in_debug ... ok
test license::client::tests::the_order_token_goes_in_the_authorization_header ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 349 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

Run:
```bash
cargo tree -p meeting-translator --target aarch64-apple-darwin -e normal -i openssl-sys 2>&1 | head -2; cargo tree -p meeting-translator --target aarch64-apple-darwin -e normal 2>/dev/null | grep -cE ' (rustls|aws-lc-rs|ring) v'
```
Expected (lúc lập kế hoạch):
```text
warning: nothing to print.

0
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/src/license/client.rs \
  src-tauri/src/license/mod.rs
git commit -m "feat(app): client của license server qua TLS của hệ điều hành, đọc header Date, lỗi có mã (§6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 7: Trạng thái bản quyền và hạn mức của máy (`license/manager.rs`)

Spec §6.8, §9, §10.2. QĐ13–QĐ18. `License` không phụ thuộc Tauri: nơi gọi truyền giờ máy và thời gian đơn điệu.

- Gói hiệu lực: token đã kiểm chữ ký, đúng máy và activation, trước `expires_at` và `refresh_before`, giờ máy không bị chỉnh lùi, chưa thu hồi, bản cài chính hãng. Token đọc lại từ kho khóa không bao giờ `fresh`.
- `activate` (kiểm key tại chỗ trước), `validate` (máy bị gỡ, key không còn: xóa bản ghi, về Free; thu hồi: về Free giữ key; hết hạn; lỗi mạng: giữ tới `refresh_before`; `429`: chờ `Retry-After`), `deactivate` (máy này, hay máy khác từ danh sách `409`).
- `validate_due`: quá 24 giờ (thử lại mỗi giờ); qua mốc chu kỳ kế tiếp (token mới vẫn trước mốc thì hẹn lại sau (mốc − `issued_at`) + 1 phút); qua `expires_at`; giờ máy chỉnh lùi; token không đọc được (thử lại mỗi 5 phút).
- `add_usage`: cộng vào Free của ngày, và vào bộ đếm gói trả phí nếu đang có gói; gói trả phí hết thì Free của ngày cũng hết; `Break` khi chạm hạn mức. `can_start`, `take_warning` (còn từ 5 phút, một lần mỗi bộ đếm), `tick` (thời gian đơn điệu, reset Free, giờ máy lớn nhất), `view` (giao diện).
- Thời hạn của token so với giờ tin được (QĐ8); ở `expires_at` chờ một lần `validate` tối đa 5 phút (QĐ30); kết luận `license_expired`, `license_revoked` ghi vào bản ghi (QĐ14); ghi kho khóa bị từ chối thì giữ luật chặt tới khi ghi lại được (QĐ13); chưa kiểm xong chữ ký bản cài thì chưa mở Pro nhưng hạn mức vẫn theo gói (QĐ26); `refresh_clock` cho người dùng Free (QĐ31); lần thử `validate` gấp cách lần thử gần nhất 5 phút, kể cả lần thành công (QĐ15).
- Bản debug không giới hạn (`dev_unlimited`): Pro, không đếm phút.
- Test dùng server giả (`FakeApi`), kho khóa giả và token ký bằng khóa `test-1` của bộ vector.

**Files:**
- Create: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/mod.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 71da516e0effafa434a191a7a97c1d00479d941b..771f547345854df24a032da78beda248400ce8be 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -12,6 +12,7 @@
 pub mod device;
 pub mod key;
 pub mod keys;
+pub mod manager;
 pub mod quota;
 pub mod store;
 pub mod token;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::manager 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `manager.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 1 previous error
error[E0583]: file not found for module `manager`
```

- [ ] **Step 3: Viết code**

Tạo `src-tauri/src/license/manager.rs`:

```rust
//! Trạng thái bản quyền và hạn mức của máy này (spec §6.8, §9, §10.2), không phụ thuộc Tauri: nơi gọi truyền giờ máy và
//! thời gian đơn điệu, nên test chạy được với server giả ([`LicenseApi`]), kho khóa giả ([`Vault`]) và đồng hồ giả.
//!
//! - **Gói hiệu lực:** gói trả phí khi có token đã kiểm chữ ký, đúng máy này, còn trước `expires_at` và `refresh_before`
//!   theo giờ máy, giờ máy không bị chỉnh lùi (§10.2), license chưa bị thu hồi, và bản cài là chính hãng (§10.2). Ngoài
//!   ra là Free. Token đọc lại từ kho khóa luôn coi `quota_fresh = false`.
//! - **Hạn mức:** mỗi phút dịch cộng vào bộ đếm Free của ngày, và vào bộ đếm của gói trả phí nếu đang có gói. Hết hạn
//!   mức gói trả phí thì Free của ngày cũng hết. Kho khóa lỗi thì áp luật chặt: coi như đã hết.
//! - **Lịch `validate`** ([`License::validate_due`]): khi lần thành công gần nhất đã quá 24 giờ (thử lại mỗi giờ); khi
//!   giờ máy qua mốc đầu chu kỳ kế tiếp (token mới mà `issued_at` vẫn trước mốc thì hẹn lại sau (mốc − `issued_at`) + 1
//!   phút); khi qua `expires_at` (có thể đã gia hạn từ máy khác); khi giờ máy bị chỉnh lùi; khi token đã lưu không đọc
//!   được. Ba việc sau thử lại mỗi 5 phút. `429` thì chờ đúng `Retry-After`.
//! - **Kết quả của server:** máy bị gỡ (`activation_not_found`) hay key không còn (`invalid_key`): xóa bản ghi license,
//!   về Free. Thu hồi, hết hạn: giữ key để gia hạn, về Free. Lỗi mạng: giữ token tới `refresh_before` (§9).

use std::ops::ControlFlow;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU8, Ordering};

use chrono::{FixedOffset, Local};
use serde::Serialize;

use super::client::{ApiError, Device, Granted, LicenseApi, Reply};
use super::key;
use super::keys::PublicKeys;
use super::quota::{self, FreeCounter, PaidCounter, Seen};
use super::store::{self, LicenseRecord, Vault, Verdict};
use super::token::{self, Claims, Plan};

/// Lần `validate` thành công gần nhất quá chừng này thì gọi lại (§6.8, "Kiểm tra định kỳ").
pub const VALIDATE_EVERY_SECS: i64 = 24 * 3600;
/// Nhắc gia hạn trước chừng này (§6.8, "Gia hạn").
pub const RENEW_WARNING_SECS: i64 = 7 * 86_400;
const ROUTINE_RETRY_SECS: i64 = 3600;
const URGENT_RETRY_SECS: i64 = 300;
const CYCLE_RETRY_SLACK_SECS: i64 = 60;
/// Tới `expires_at`, gói còn dùng được trong lúc chờ lần `validate` đầu sau mốc (có thể đã gia hạn ở máy khác), tối đa
/// chừng này (N4 của review 06 lần 1).
pub const EXPIRY_GRACE_SECS: i64 = 300;
const GENUINE_UNKNOWN: u8 = 0;
const GENUINE_YES: u8 = 1;
const GENUINE_NO: u8 = 2;

/// Múi giờ cho "ngày" của Free: giờ máy, hay múi giờ cố định trong test.
#[derive(Clone, Copy, Debug)]
pub enum Zone {
    Local,
    Fixed(FixedOffset),
}

impl Zone {
    fn resolve_free(&self, stored: Option<FreeCounter>, prior: bool, now: i64, seen: &Seen) -> (FreeCounter, bool) {
        match self {
            Self::Local => quota::resolve_free(&Local, stored, prior, now, seen),
            Self::Fixed(z) => quota::resolve_free(z, stored, prior, now, seen),
        }
    }

    fn local_day(&self, t: i64) -> chrono::NaiveDate {
        match self {
            Self::Local => quota::local_day(&Local, t),
            Self::Fixed(z) => quota::local_day(z, t),
        }
    }

    fn free_reset_time(&self, counter: &FreeCounter) -> i64 {
        match self {
            Self::Local => quota::free_reset_time(&Local, counter),
            Self::Fixed(z) => quota::free_reset_time(z, counter),
        }
    }
}

/// Máy này, gửi cho server khi kích hoạt.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Machine {
    pub id_hash: String,
    pub label: Option<String>,
}

/// Tình trạng bản quyền mà giao diện hiện.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Standing {
    /// Chưa kích hoạt key nào.
    Free,
    Active,
    /// Quá `expires_at` (server xác nhận chưa gia hạn, hay đang offline).
    Expired,
    Revoked,
    /// Quá `refresh_before` mà chưa làm mới được token (offline lâu).
    RefreshNeeded,
    /// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá 10 phút: chỉnh giờ rồi kết nối mạng để kiểm lại (§10.2).
    ClockRolledBack,
    /// Token đã lưu không đọc được (khóa công khai đã đổi, token hỏng): chờ `validate`.
    Unverified,
    /// Bản cài không chính hãng (§10.2): chỉ chạy Free.
    NotGenuine,
}

/// Mốc reset hạn mức hiển thị (§4.2 bước 2).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ResetKind {
    /// Free: max(00:00 hôm sau, lần reset trước + 20 giờ).
    Daily,
    /// Gói trả phí: mốc đầu chu kỳ kế tiếp, cần có mạng để mở hạn mức mới.
    Cycle,
    /// `expires_at` đến trước mốc chu kỳ kế tiếp: báo ngày hết hạn.
    Expiry,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaView {
    /// Gói không giới hạn (X5) hay bản debug không giới hạn.
    pub unlimited: bool,
    pub limit_ms: u64,
    pub used_ms: u64,
    pub remaining_ms: u64,
    pub reset_at: Option<i64>,
    pub reset_kind: ResetKind,
    /// Giờ máy đã qua mốc chu kỳ kế tiếp mà chưa có token mới (offline): cần mạng để mở hạn mức mới (§9).
    pub needs_network: bool,
    /// Bộ đếm mất bản ghi, coi như đã dùng hết (§9): hướng dẫn liên hệ hỗ trợ.
    pub lost: bool,
    /// Kho khóa không đọc ghi được: coi như đã hết.
    pub storage_error: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseView {
    pub standing: Standing,
    /// `free`, `pro`, `pro_x2`, `pro_x5`: gói đang có hiệu lực.
    pub plan: String,
    /// Gói ghi trong token đã lưu (kể cả khi đã hết hạn), để hiện "Professional đã hết hạn".
    pub licensed_plan: Option<Plan>,
    /// Key dạng hiển thị.
    pub key: Option<String>,
    pub expires_at: Option<i64>,
    pub refresh_before: Option<i64>,
    pub validated_at: Option<i64>,
    /// Còn dưới 7 ngày tới `expires_at`, hay đã hết hạn: nhắc gia hạn.
    pub renew_soon: bool,
    pub quota: QuotaView,
    /// Bản build có địa chỉ license server.
    pub server_configured: bool,
    /// Bản debug chạy Pro không giới hạn (`DevGate`, kế hoạch 03).
    pub dev_override: bool,
    /// Giờ máy bị coi là chỉnh lùi (cả ở gói Free): giao diện nhắc chỉnh giờ.
    pub clock_rolled_back: bool,
}

/// Lỗi của một thao tác bản quyền; giao diện chọn câu theo [`LicenseError::code`].
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum LicenseError {
    #[error("key sai định dạng hay sai ký tự kiểm tra")]
    InvalidKey,
    #[error("chưa có key nào được kích hoạt")]
    NotActivated,
    #[error("chưa cấu hình license server")]
    NotConfigured,
    #[error("lỗi mạng")]
    Network,
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("key đã kích hoạt đủ 2 máy")]
    DeviceLimit(Vec<Device>),
    #[error("key đang bị khóa tạm")]
    Locked,
    #[error("license đã bị thu hồi")]
    Revoked,
    #[error("license đã hết hạn")]
    Expired(Option<i64>),
    #[error("máy này đã bị gỡ khỏi key")]
    Deactivated,
    #[error("token server trả không hợp lệ: {0}")]
    BadToken(String),
    #[error("không ghi được kho khóa: {0}")]
    Storage(String),
    #[error("server trả lỗi {0}")]
    Server(String),
}

impl LicenseError {
    /// Mã lỗi cho giao diện (`error.<mã>` trong i18n).
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidKey => "licenseInvalidKey",
            Self::NotActivated => "licenseNotActivated",
            Self::NotConfigured => "licenseNotConfigured",
            Self::Network => "licenseNetwork",
            Self::RateLimited(_) => "licenseRateLimited",
            Self::DeviceLimit(_) => "licenseDeviceLimit",
            Self::Locked => "licenseLocked",
            Self::Revoked => "licenseRevoked",
            Self::Expired(_) => "licenseExpired",
            Self::Deactivated => "licenseDeactivated",
            Self::BadToken(_) => "licenseBadToken",
            Self::Storage(_) => "licenseStorage",
            Self::Server(_) => "licenseServer",
        }
    }
}

fn map_api(e: ApiError) -> LicenseError {
    match e {
        ApiError::NotConfigured => LicenseError::NotConfigured,
        ApiError::Network(_) => LicenseError::Network,
        ApiError::Decode(m) => LicenseError::Server(m),
        ApiError::Server(s) => match (s.status, s.code.as_str()) {
            (_, "device_limit") => LicenseError::DeviceLimit(s.devices),
            (_, "license_locked") => LicenseError::Locked,
            (_, "license_revoked") => LicenseError::Revoked,
            (_, "license_expired") => LicenseError::Expired(s.expires_at),
            (_, "activation_not_found") => LicenseError::Deactivated,
            (_, "invalid_key") => LicenseError::InvalidKey,
            (429, _) => LicenseError::RateLimited(s.retry_after),
            _ => LicenseError::Server(s.code),
        },
    }
}

#[derive(Default)]
struct Inner {
    record: Option<LicenseRecord>,
    /// Claims của token đã lưu: đã kiểm chữ ký, đúng máy và đúng activation. `None` nếu không đọc được.
    claims: Option<Claims>,
    paid: Option<PaidCounter>,
    paid_error: bool,
    free: Option<FreeCounter>,
    free_error: bool,
    seen: Seen,
    /// Token mới nhất vẫn trước mốc chu kỳ mà giờ máy đã qua: hẹn `validate` lại lúc này.
    cycle_retry_at: Option<i64>,
    /// `429`: không gọi lại trước lúc này.
    blocked_until: Option<i64>,
    last_attempt: Option<i64>,
    /// Đã nhắc "còn 5 phút" cho bộ đếm nào (tên mục kho khóa), để chỉ nhắc một lần.
    warned: Option<String>,
    has_prior_data: bool,
    /// Lần hỏi giờ của server gần nhất khi giờ máy bị coi là chỉnh lùi mà chưa có license ([`License::refresh_clock`]).
    clock_check_at: Option<i64>,
}

pub struct License {
    api: Box<dyn LicenseApi>,
    vault: Box<dyn Vault>,
    keys: PublicKeys,
    machine: Machine,
    zone: Zone,
    server_configured: bool,
    /// Bản debug: Pro không giới hạn (`DevGate`).
    dev_unlimited: bool,
    /// Kết quả kiểm chữ ký bản cài: chưa kiểm xong thì chưa mở Pro, nhưng chưa báo "không chính hãng" (N5 của review 06).
    genuine: AtomicU8,
    inner: Mutex<Inner>,
}

/// Các bản ghi cần ghi xuống kho khóa sau một thay đổi.
fn save_free(vault: &dyn Vault, inner: &mut Inner) {
    if let Some(free) = &inner.free {
        inner.free_error = store::write(vault, store::FREE, free).is_err();
    }
}

impl License {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        api: Box<dyn LicenseApi>,
        vault: Box<dyn Vault>,
        keys: PublicKeys,
        machine: Machine,
        zone: Zone,
        server_configured: bool,
        dev_unlimited: bool,
        has_prior_data: bool,
        now: i64,
    ) -> Self {
        let license = Self {
            api,
            vault,
            keys,
            machine,
            zone,
            server_configured,
            dev_unlimited,
            genuine: AtomicU8::new(GENUINE_UNKNOWN),
            inner: Mutex::new(Inner {
                has_prior_data,
                ..Inner::default()
            }),
        };
        license.load(now);
        license
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Đọc kho khóa lúc khởi động.
    fn load(&self, now: i64) {
        let vault = self.vault.as_ref();
        let mut inner = self.lock();
        let seen = store::read::<Seen>(vault, store::SEEN);
        // Đã có mốc thời gian từ lần chạy trước: app đã có dữ liệu, nên thiếu bộ đếm Free là mất bản ghi.
        inner.has_prior_data |= !matches!(seen, Ok(None));
        inner.seen = seen.ok().flatten().unwrap_or_default();
        inner.seen.observe_machine(now);
        let _ = store::write(vault, store::SEEN, &inner.seen);
        match store::read::<LicenseRecord>(vault, store::LICENSE) {
            Ok(record) => inner.record = record,
            Err(e) => log::warn!("không đọc được bản ghi license: {e}"),
        }
        // Có bản ghi license nghĩa là app đã có dữ liệu từ trước, dù file cài đặt có còn hay không.
        inner.has_prior_data |= inner.record.is_some();
        inner.claims = inner
            .record
            .as_ref()
            .and_then(|r| self.read_token(&r.token, &r.activation_id));
        if let Some(issued_at) = inner.claims.as_ref().map(|c| c.issued_at) {
            inner.seen.observe_signed(issued_at);
        }
        self.resolve_free_locked(&mut inner, now);
        if let Some(claims) = inner.claims.clone() {
            self.resolve_paid_locked(&mut inner, &claims, false);
        }
    }

    /// Token đã kiểm chữ ký, đúng máy này và đúng activation; không kiểm thời hạn.
    fn read_token(&self, token: &str, activation_id: &str) -> Option<Claims> {
        match token::decode(token, &self.keys) {
            Ok(c) if c.device_id_hash == self.machine.id_hash && c.activation_id == activation_id => Some(c),
            Ok(_) => {
                log::warn!("token đã lưu là của máy hay activation khác");
                None
            }
            Err(e) => {
                log::warn!("token đã lưu không đọc được: {e}");
                None
            }
        }
    }

    fn resolve_free_locked(&self, inner: &mut Inner, now: i64) {
        let vault = self.vault.as_ref();
        let stored = match store::read_free(vault) {
            Ok(c) => c,
            Err(e) => {
                log::warn!("không đọc được bộ đếm Free: {e}");
                inner.free_error = true;
                return;
            }
        };
        let (counter, write) = self.zone.resolve_free(stored, inner.has_prior_data, now, &inner.seen);
        inner.free = Some(counter);
        inner.free_error = false;
        if write {
            save_free(vault, inner);
        }
        inner.has_prior_data = true;
    }

    fn resolve_paid_locked(&self, inner: &mut Inner, claims: &Claims, fresh: bool) {
        let vault = self.vault.as_ref();
        let key = quota::PaidKey::of(claims);
        let existing = store::read_paid(vault, &key);
        let marker = store::read_marker(vault, &claims.license_id, &claims.activation_id);
        let (Ok(existing), Ok(marker)) = (existing, marker) else {
            inner.paid = None;
            inner.paid_error = true;
            return;
        };
        let mut state = quota::resolve_paid(claims, fresh, existing, marker.as_ref());
        // Lần ghi trước bị kho khóa từ chối: phút đã cộng trong bộ nhớ không mất (N1 của review 06 lần 1).
        if let Some(mem) = inner
            .paid
            .as_ref()
            .filter(|m| m.key == state.counter.key && m.used_ms > state.counter.used_ms)
        {
            state.counter.used_ms = mem.used_ms;
            state.write_counter = true;
        }
        if state.resolution == quota::Resolution::Lost {
            log::warn!("mất bản ghi bộ đếm hạn mức của chu kỳ này: coi như đã dùng hết");
        }
        inner.paid_error = store::write_paid(vault, &state).is_err() && state.write_counter;
        inner.paid = Some(state.counter);
    }

    /// Kết quả kiểm chữ ký bản cài (§10.2). Không chính hãng thì chỉ chạy Free.
    pub fn set_genuine(&self, genuine: bool) {
        self.genuine
            .store(if genuine { GENUINE_YES } else { GENUINE_NO }, Ordering::SeqCst);
    }

    pub fn dev_unlimited(&self) -> bool {
        self.dev_unlimited
    }

    fn standing_locked(&self, inner: &Inner, now: i64) -> Standing {
        if self.genuine.load(Ordering::SeqCst) == GENUINE_NO {
            return Standing::NotGenuine;
        }
        let Some(record) = &inner.record else {
            return Standing::Free;
        };
        match record.verdict {
            Some(Verdict::Revoked) => return Standing::Revoked,
            Some(Verdict::Expired) => return Standing::Expired,
            None => {}
        }
        let Some(claims) = &inner.claims else {
            return Standing::Unverified;
        };
        if inner.seen.rolled_back(now) {
            return Standing::ClockRolledBack;
        }
        // So thời hạn theo giờ tin được: giờ máy chậm hơn server không kéo dài được gói (Q1 của review 06 lần 1).
        let trusted = inner.seen.trusted_now(now);
        match token::check(claims, trusted, &self.machine.id_hash) {
            Ok(()) => Standing::Active,
            Err(token::VerifyError::LicenseExpired) if self.in_expiry_grace(inner, claims, trusted) => Standing::Active,
            Err(token::VerifyError::LicenseExpired) => Standing::Expired,
            Err(_) => Standing::RefreshNeeded,
        }
    }

    /// Vừa qua `expires_at`, có server, và chưa thử `validate` nào từ sau mốc: chờ lần thử đó (tối đa
    /// [`EXPIRY_GRACE_SECS`]) rồi mới về Free, vì có thể đã gia hạn ở máy khác (N4 của review 06 lần 1).
    fn in_expiry_grace(&self, inner: &Inner, claims: &Claims, trusted: i64) -> bool {
        self.server_configured
            && trusted < claims.expires_at + EXPIRY_GRACE_SECS
            && inner.last_attempt.is_none_or(|t| t < claims.expires_at)
    }

    /// Đang có gói trả phí hiệu lực không (xem đầu module). Bản debug không giới hạn thì luôn có.
    pub fn is_pro(&self, now: i64) -> bool {
        self.dev_unlimited || self.active_claims(&self.lock(), now).is_some()
    }

    /// Claims dùng cho hạn mức: `Active`, và bản cài chưa bị kiểm là không chính hãng. Trong lúc đang kiểm, hạn mức vẫn theo
    /// gói trả phí, chỉ tính năng Pro chờ (N2 của review 06 lần 2).
    fn quota_claims(&self, inner: &Inner, now: i64) -> Option<Claims> {
        (self.standing_locked(inner, now) == Standing::Active)
            .then(|| inner.claims.clone())
            .flatten()
    }

    /// Claims của gói đang hiệu lực: `Active` và bản cài đã kiểm là chính hãng.
    fn active_claims(&self, inner: &Inner, now: i64) -> Option<Claims> {
        (self.standing_locked(inner, now) == Standing::Active && self.genuine.load(Ordering::SeqCst) == GENUINE_YES)
            .then(|| inner.claims.clone())
            .flatten()
    }

    /// Ghi nhận header `Date` của một response.
    fn observe<T>(&self, reply: &Reply<T>) {
        if let Some(date) = reply.date {
            let mut inner = self.lock();
            inner.seen.observe_server(date);
            let _ = store::write(self.vault.as_ref(), store::SEEN, &inner.seen);
            // Bộ đếm Free vừa kéo về mà chưa có mốc `Date`: lấy `Date` đầu tiên làm mốc, để hiệu `Date` tính được (QB).
            if let Some(free) = inner
                .free
                .as_mut()
                .filter(|f| f.clock_pulled && f.server_date_at_reset.is_none())
            {
                free.server_date_at_reset = Some(date);
                save_free(self.vault.as_ref(), &mut inner);
            }
        }
    }

    /// Nhận token server vừa cấp: kiểm, lưu bản ghi license, chọn bộ đếm với `quota_fresh` của response này.
    fn accept(&self, granted: Granted, key: String, now: i64) -> Result<(), LicenseError> {
        let claims = token::decode(&granted.token, &self.keys).map_err(|e| LicenseError::BadToken(e.to_string()))?;
        if claims.device_id_hash != self.machine.id_hash || claims.activation_id != granted.activation_id {
            return Err(LicenseError::BadToken("token không khớp máy này".into()));
        }
        let record = LicenseRecord {
            key,
            activation_id: granted.activation_id.clone(),
            token: granted.token,
            validated_at: now,
            verdict: None,
        };
        store::write(self.vault.as_ref(), store::LICENSE, &record).map_err(|e| LicenseError::Storage(e.to_string()))?;
        let mut inner = self.lock();
        inner.record = Some(record);
        inner.seen.observe_signed(claims.issued_at);
        // Lần thử này thành công; lần thử gấp kế tiếp (giờ máy vẫn bị coi là lùi…) cách nó 5 phút (N1 của review 06 lần 2).
        inner.last_attempt = Some(now);
        inner.blocked_until = None;
        // Giờ máy đã qua mốc chu kỳ kế tiếp mà token mới vẫn trước mốc (giờ máy nhanh): hẹn lại.
        let cycle = quota::cycle(&claims);
        inner.cycle_retry_at =
            (now >= cycle.next_start).then_some(now + (cycle.next_start - claims.issued_at) + CYCLE_RETRY_SLACK_SECS);
        inner.claims = Some(claims.clone());
        self.resolve_paid_locked(&mut inner, &claims, granted.quota_fresh);
        Ok(())
    }

    /// Kích hoạt key người dùng gõ trên máy này.
    pub fn activate(&self, input: &str, now: i64) -> Result<(), LicenseError> {
        let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
        let reply = self
            .api
            .activate(&key, &self.machine.id_hash, self.machine.label.as_deref());
        self.observe(&reply);
        let granted = reply.result.map_err(map_api)?;
        self.accept(granted, key, now)
    }

    /// Làm mới token của key đã kích hoạt.
    pub fn validate(&self, now: i64) -> Result<(), LicenseError> {
        let Some(record) = self.lock().record.clone() else {
            return Err(LicenseError::NotActivated);
        };
        self.lock().last_attempt = Some(now);
        let reply = self.api.validate(&record.key, &record.activation_id);
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(granted) => self.accept(granted, record.key, now),
            Err(e) => {
                let mut inner = self.lock();
                match &e {
                    LicenseError::Deactivated | LicenseError::InvalidKey => {
                        let _ = store::delete(self.vault.as_ref(), store::LICENSE);
                        inner.record = None;
                        inner.claims = None;
                        inner.paid = None;
                    }
                    LicenseError::Revoked => self.keep_verdict(&mut inner, Verdict::Revoked),
                    LicenseError::Expired(_) => self.keep_verdict(&mut inner, Verdict::Expired),
                    LicenseError::RateLimited(after) => {
                        inner.blocked_until = Some(now + after.map_or(ROUTINE_RETRY_SECS, |s| s as i64));
                    }
                    _ => {}
                }
                Err(e)
            }
        }
    }

    /// Nhớ kết luận của server vào bản ghi license, để mở lại app khi offline không quay về `Active`.
    fn keep_verdict(&self, inner: &mut Inner, verdict: Verdict) {
        if let Some(record) = inner.record.as_mut() {
            record.verdict = Some(verdict);
            if let Err(e) = store::write(self.vault.as_ref(), store::LICENSE, record) {
                log::warn!("không ghi được kết luận của server: {e}");
            }
        }
    }

    /// Gỡ kích hoạt. `remote`: gỡ máy khác của key (từ danh sách `409 device_limit`), với key người dùng vừa gõ.
    pub fn deactivate(&self, remote: Option<(&str, &str)>) -> Result<(), LicenseError> {
        if let Some((input, activation_id)) = remote {
            let key = key::normalize(input).ok_or(LicenseError::InvalidKey)?;
            let reply = self.api.deactivate(&key, activation_id);
            self.observe(&reply);
            return reply.result.map_err(map_api);
        }
        let Some(record) = self.lock().record.clone() else {
            return Err(LicenseError::NotActivated);
        };
        let reply = self.api.deactivate(&record.key, &record.activation_id);
        self.observe(&reply);
        match reply.result.map_err(map_api) {
            Ok(()) | Err(LicenseError::Deactivated) => {
                store::delete(self.vault.as_ref(), store::LICENSE).map_err(|e| LicenseError::Storage(e.to_string()))?;
                let mut inner = self.lock();
                inner.record = None;
                inner.claims = None;
                inner.paid = None;
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    /// Có nên gọi `validate` lúc `now` không (xem đầu module).
    pub fn validate_due(&self, now: i64) -> bool {
        let inner = self.lock();
        let Some(record) = &inner.record else {
            return false;
        };
        if !self.server_configured || inner.blocked_until.is_some_and(|t| now < t) {
            return false;
        }
        let since_attempt = inner.last_attempt.map_or(i64::MAX, |t| now - t);
        let trusted = inner.seen.trusted_now(now);
        let urgent = inner.claims.as_ref().is_none_or(|c| {
            trusted >= c.expires_at
                || (now >= quota::cycle(c).next_start && inner.cycle_retry_at.is_none_or(|t| now >= t))
        }) || record.verdict == Some(Verdict::Expired)
            || inner.seen.rolled_back(now);
        let routine = now - record.validated_at >= VALIDATE_EVERY_SECS || now < record.validated_at;
        (urgent && since_attempt >= URGENT_RETRY_SECS) || (routine && since_attempt >= ROUTINE_RETRY_SECS)
    }

    /// Gọi định kỳ (mỗi phút): cộng thời gian đơn điệu, reset Free khi sang ngày, ghi giờ máy lớn nhất.
    pub fn tick(&self, now: i64, elapsed_ms: u64) {
        let mut inner = self.lock();
        if let Some(free) = inner.free.as_mut() {
            free.monotonic_ms = free.monotonic_ms.saturating_add(elapsed_ms);
        }
        inner.seen.observe_machine(now);
        let _ = store::write(self.vault.as_ref(), store::SEEN, &inner.seen);
        // Lần ghi trước bị từ chối thì bộ đếm trong bộ nhớ vẫn đúng: ghi lại, không đọc bản cũ trong kho khóa (N1 của review 06
        // lần 1). Chỉ đọc lại khi chưa có bộ đếm (đọc lỗi lúc khởi động).
        let stored = inner.free.clone();
        if stored.is_none() {
            self.resolve_free_locked(&mut inner, now);
        } else {
            let (counter, reset) = self.zone.resolve_free(stored, true, now, &inner.seen);
            if reset {
                inner.warned = None;
            }
            inner.free = Some(counter);
            save_free(self.vault.as_ref(), &mut inner);
        }
        if inner.paid_error
            && let Some(counter) = inner.paid.clone()
        {
            inner.paid_error = store::save_paid(self.vault.as_ref(), &counter).is_err();
        }
    }

    /// Còn bao nhiêu mili giây (`None`: không giới hạn) theo gói hiệu lực.
    fn remaining_locked(&self, inner: &Inner, now: i64) -> Option<u64> {
        if self.dev_unlimited {
            return None;
        }
        if let Some(claims) = self.quota_claims(inner, now) {
            if inner.paid_error {
                return Some(0);
            }
            return inner
                .paid
                .as_ref()
                .map_or(Some(0), |c| quota::paid_remaining(&claims, c));
        }
        if inner.free_error {
            return Some(0);
        }
        Some(inner.free.as_ref().map_or(0, quota::free_remaining))
    }

    /// Có bắt đầu được phiên không: hạn mức còn 0 thì không (§6.8, "Khi chạm hạn mức").
    pub fn can_start(&self, now: i64) -> bool {
        self.remaining_locked(&self.lock(), now) != Some(0)
    }

    /// Cộng `speech_ms` vừa dịch xong. Trả `Break` khi đã chạm hạn mức: engine dừng phiên (`quota_exhausted`).
    pub fn add_usage(&self, speech_ms: u64, now: i64) -> ControlFlow<()> {
        if self.dev_unlimited {
            return ControlFlow::Continue(());
        }
        let vault = self.vault.as_ref();
        let mut inner = self.lock();
        let paid_claims = self.quota_claims(&inner, now);
        if let Some(free) = inner.free.as_mut() {
            free.used_ms = free.used_ms.saturating_add(speech_ms);
        }
        if let Some(claims) = &paid_claims
            && let Some(counter) = inner.paid.as_mut()
        {
            counter.used_ms = counter.used_ms.saturating_add(speech_ms);
            let counter = counter.clone();
            inner.paid_error = store::save_paid(vault, &counter).is_err();
            // Hết hạn mức gói trả phí thì Free của ngày đó cũng hết (§6.8).
            if quota::paid_remaining(claims, &counter) == Some(0)
                && let Some(free) = inner.free.as_mut()
            {
                free.used_ms = free.used_ms.max(quota::FREE_DAILY_MS);
            }
        }
        save_free(vault, &mut inner);
        if self.remaining_locked(&inner, now) == Some(0) {
            ControlFlow::Break(())
        } else {
            ControlFlow::Continue(())
        }
    }

    /// `true` đúng một lần cho mỗi bộ đếm khi hạn mức còn từ 5 phút trở xuống (§4.2 bước 2).
    pub fn take_warning(&self, now: i64) -> bool {
        let mut inner = self.lock();
        let Some(remaining) = self.remaining_locked(&inner, now) else {
            return false;
        };
        if remaining == 0 || remaining > quota::WARN_REMAINING_MS {
            return false;
        }
        let which = match (&self.quota_claims(&inner, now), &inner.paid) {
            (Some(_), Some(c)) => store::paid_name(&c.key),
            _ => format!("free-{}", inner.free.as_ref().map_or(0, |f| f.reset_at)),
        };
        if inner.warned.as_deref() == Some(which.as_str()) {
            return false;
        }
        inner.warned = Some(which);
        true
    }

    pub fn view(&self, now: i64) -> LicenseView {
        let inner = self.lock();
        let standing = self.standing_locked(&inner, now);
        let active = self.active_claims(&inner, now);
        let remaining = self.remaining_locked(&inner, now);
        let quota = match (&self.quota_claims(&inner, now), &inner.paid) {
            _ if self.dev_unlimited => QuotaView {
                unlimited: true,
                limit_ms: 0,
                used_ms: 0,
                remaining_ms: 0,
                reset_at: None,
                reset_kind: ResetKind::Cycle,
                needs_network: false,
                lost: false,
                storage_error: false,
            },
            (Some(claims), counter) => {
                let cycle = quota::cycle(claims);
                let (reset_at, reset_kind) = if claims.expires_at < cycle.next_start {
                    (claims.expires_at, ResetKind::Expiry)
                } else {
                    (cycle.next_start, ResetKind::Cycle)
                };
                QuotaView {
                    unlimited: cycle.limit_ms.is_none(),
                    limit_ms: cycle.limit_ms.unwrap_or(0),
                    used_ms: counter.as_ref().map_or(0, |c| c.used_ms),
                    remaining_ms: remaining.unwrap_or(0),
                    reset_at: Some(reset_at),
                    reset_kind,
                    needs_network: now >= cycle.next_start,
                    lost: counter.as_ref().is_some_and(|c| c.lost),
                    storage_error: inner.paid_error,
                }
            }
            (None, _) => QuotaView {
                unlimited: false,
                limit_ms: quota::FREE_DAILY_MS,
                used_ms: inner.free.as_ref().map_or(0, |f| f.used_ms),
                remaining_ms: remaining.unwrap_or(0),
                reset_at: inner.free.as_ref().map(|f| self.zone.free_reset_time(f)),
                reset_kind: ResetKind::Daily,
                needs_network: false,
                lost: inner.free.as_ref().is_some_and(|f| f.lost),
                storage_error: inner.free_error,
            },
        };
        let stored = inner.claims.as_ref();
        LicenseView {
            standing,
            plan: match (&active, self.dev_unlimited) {
                (_, true) => "pro_x5".into(),
                (Some(c), _) => plan_code(c.plan).into(),
                (None, _) => "free".into(),
            },
            licensed_plan: stored.map(|c| c.plan),
            key: inner.record.as_ref().map(|r| key::display(&r.key)),
            expires_at: stored.map(|c| c.expires_at),
            refresh_before: stored.map(|c| c.refresh_before),
            validated_at: inner.record.as_ref().map(|r| r.validated_at),
            renew_soon: stored.is_some_and(|c| c.expires_at - now <= RENEW_WARNING_SECS),
            quota,
            server_configured: self.server_configured,
            dev_override: self.dev_unlimited,
            clock_rolled_back: inner.seen.rolled_back(now),
        }
    }

    /// Chưa có license mà giờ máy bị coi là chỉnh lùi (thường là giờ máy từng đặt nhầm tới trước rồi chỉnh lại): hỏi giờ
    /// của server bằng một request nhẹ (`GET /v1/plans`), tối đa 5 phút một lần, để header `Date` hạ mốc về giờ thật (Q2 của
    /// review 06 lần 1). Có license thì việc này là của `validate`.
    pub fn refresh_clock(&self, now: i64) {
        {
            let mut inner = self.lock();
            // Bộ đếm Free vừa kéo về mà đã sang ngày mới: cần `Date` để reset (QB của review 06 lần 2).
            let pulled_new_day = inner
                .free
                .as_ref()
                .is_some_and(|f| f.clock_pulled && self.zone.local_day(now) > f.day);
            if !self.server_configured
                || inner.record.is_some()
                || !(inner.seen.rolled_back(now) || pulled_new_day)
                || inner.clock_check_at.is_some_and(|t| now - t < URGENT_RETRY_SECS)
            {
                return;
            }
            inner.clock_check_at = Some(now);
        }
        let reply = self.api.plans();
        self.observe(&reply);
    }

    pub fn api(&self) -> &dyn LicenseApi {
        self.api.as_ref()
    }

    /// Key đã kích hoạt (dạng lưu trữ), cho đơn gia hạn hay đổi gói.
    pub fn license_key(&self) -> Option<String> {
        self.lock().record.as_ref().map(|r| r.key.clone())
    }

    pub fn vault(&self) -> &dyn Vault {
        self.vault.as_ref()
    }

    pub fn observe_reply<T>(&self, reply: &Reply<T>) {
        self.observe(reply);
    }
}

pub fn plan_code(plan: Plan) -> &'static str {
    match plan {
        Plan::Pro => "pro",
        Plan::ProX2 => "pro_x2",
        Plan::ProX5 => "pro_x5",
    }
}

#[cfg(test)]
pub mod tests {
    use std::collections::VecDeque;
    use std::sync::Arc;

    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{Value, json};

    use super::*;
    use crate::license::client::{Checkout, OrderStatus, PlanOffer, ServerError};
    use crate::license::store::tests::FakeVault;

    /// 2026-10-01 00:00:00 UTC.
    pub const T0: i64 = 1_790_812_800;
    pub const DAY: i64 = 86_400;
    pub const KEY: &str = "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5";
    pub const DEVICE: &str = "19a1a8158951ecebddefb479e098dbc84c018c897ea6d4b8c5fc024051306b4f";
    const MIN: u64 = 60_000;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap()
    }

    pub fn test_keys() -> PublicKeys {
        let v = vectors();
        let pairs = v["public_keys"].as_object().unwrap().clone();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    /// Ký token như server (khóa `test-1` của bộ vector).
    pub fn sign(claims: &Value) -> String {
        let v = vectors();
        let seed: [u8; 32] = URL_SAFE_NO_PAD
            .decode(v["test_keys"][0]["seed_b64url"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).unwrap());
        let input = format!("v1.{payload}");
        let sig = SigningKey::from_bytes(&seed).sign(input.as_bytes());
        format!("{input}.{}", URL_SAFE_NO_PAD.encode(sig.to_bytes()))
    }

    /// Claims của một license Professional, kích hoạt lúc `T0`, cấp lúc `issued_at`.
    pub fn claims(issued_at: i64) -> Value {
        json!({
            "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": T0,
            "device_id_hash": DEVICE, "plan": "pro", "expires_at": T0 + 30 * DAY, "cycle_anchor": T0,
            "quota_minutes_per_cycle": 1800, "quota_epoch": 0, "quota_fresh": false,
            "issued_at": issued_at, "refresh_before": issued_at + 14 * DAY,
        })
    }

    pub fn granted(c: &Value, fresh: bool) -> Result<Granted, ApiError> {
        Ok(Granted {
            token: sign(c),
            activation_id: c["activation_id"].as_str().unwrap().into(),
            quota_fresh: fresh,
        })
    }

    pub fn server(status: u16, code: &str) -> ApiError {
        ApiError::Server(ServerError {
            status,
            code: code.into(),
            ..ServerError::default()
        })
    }

    /// Server giả: trả lần lượt các kết quả đã xếp cho `activate`, `validate`, `deactivate`; ghi lại các lần gọi.
    #[derive(Default)]
    pub struct FakeApi {
        pub replies: Mutex<VecDeque<Result<Granted, ApiError>>>,
        pub deactivations: Mutex<VecDeque<Result<(), ApiError>>>,
        pub calls: Mutex<Vec<String>>,
        pub date: Mutex<Option<i64>>,
    }

    impl FakeApi {
        fn next(&self, call: String) -> Reply<Granted> {
            self.calls.lock().unwrap().push(call);
            Reply {
                result: self
                    .replies
                    .lock()
                    .unwrap()
                    .pop_front()
                    .unwrap_or(Err(ApiError::Network("hết".into()))),
                date: *self.date.lock().unwrap(),
            }
        }
    }

    impl LicenseApi for Arc<FakeApi> {
        fn plans(&self) -> Reply<Vec<PlanOffer>> {
            self.calls.lock().unwrap().push("plans".into());
            Reply {
                result: Ok(Vec::new()),
                date: *self.date.lock().unwrap(),
            }
        }
        fn checkout(&self, _: &str, _: &str, _: Option<&str>) -> Reply<Checkout> {
            Reply {
                result: Err(ApiError::NotConfigured),
                date: None,
            }
        }
        fn order(&self, _: i64, _: &str) -> Reply<OrderStatus> {
            Reply {
                result: Err(ApiError::NotConfigured),
                date: None,
            }
        }
        fn activate(&self, key: &str, device: &str, label: Option<&str>) -> Reply<Granted> {
            self.next(format!("activate {key} {device} {}", label.unwrap_or("-")))
        }
        fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
            self.next(format!("validate {key} {activation_id}"))
        }
        fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
            self.calls
                .lock()
                .unwrap()
                .push(format!("deactivate {key} {activation_id}"));
            Reply {
                result: self.deactivations.lock().unwrap().pop_front().unwrap_or(Ok(())),
                date: None,
            }
        }
        fn recover(&self, _: &str) -> Reply<()> {
            Reply {
                result: Ok(()),
                date: None,
            }
        }
    }

    impl Vault for Arc<FakeVault> {
        fn get(&self, name: &str) -> Result<Option<Vec<u8>>, String> {
            self.as_ref().get(name)
        }
        fn set(&self, name: &str, value: &[u8]) -> Result<(), String> {
            self.as_ref().set(name, value)
        }
        fn delete(&self, name: &str) -> Result<(), String> {
            self.as_ref().delete(name)
        }
    }

    pub fn vn() -> Zone {
        Zone::Fixed(FixedOffset::east_opt(7 * 3600).unwrap())
    }

    /// `License` vừa tạo, chưa có kết quả kiểm chữ ký bản cài.
    pub fn license_unchecked(api: &Arc<FakeApi>, vault: &Arc<FakeVault>, now: i64) -> License {
        License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: DEVICE.into(),
                label: Some("Mac".into()),
            },
            vn(),
            true,
            false,
            false,
            now,
        )
    }

    /// `License` của bản cài đã kiểm chữ ký xong (chính hãng).
    pub fn license(api: &Arc<FakeApi>, vault: &Arc<FakeVault>, now: i64) -> License {
        let l = license_unchecked(api, vault, now);
        l.set_genuine(true);
        l
    }

    fn activated(now: i64, fresh: bool) -> (Arc<FakeApi>, Arc<FakeVault>, License) {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, now);
        api.replies.lock().unwrap().push_back(granted(&claims(now), fresh));
        l.activate(KEY, now).unwrap();
        (api, vault, l)
    }

    #[test]
    fn a_first_run_is_free_with_ten_minutes_that_stop_the_session_when_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.quota.remaining_ms),
            (Standing::Free, "free", 10 * MIN)
        );
        assert!(l.can_start(T0) && !l.is_pro(T0));
        assert!(l.add_usage(9 * MIN, T0).is_continue());
        assert!(l.add_usage(MIN, T0).is_break(), "chạm hạn mức thì engine dừng phiên");
        assert!(!l.can_start(T0), "hạn mức còn 0 thì không bắt đầu phiên");
        // Mở lại app cùng ngày: bộ đếm còn nguyên.
        assert!(!license(&api, &vault, T0 + 60).can_start(T0 + 60));
        // Hôm sau, đủ 20 giờ: mở lại.
        let next = T0 + 21 * 3600;
        let l = license(&api, &vault, next);
        assert!(l.can_start(next));
        assert_eq!(l.view(next).quota.reset_kind, ResetKind::Daily);
    }

    #[test]
    fn a_missing_free_counter_after_earlier_runs_counts_as_used_up() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        license(&api, &vault, T0);
        vault.items.lock().unwrap().remove(store::FREE);
        let l = license(&api, &vault, T0 + 60);
        let v = l.view(T0 + 60);
        assert!(!l.can_start(T0 + 60));
        assert!(v.quota.lost, "báo mất bản ghi, hướng dẫn liên hệ hỗ trợ");
    }

    #[test]
    fn activating_checks_the_key_locally_then_uses_the_fresh_flag_of_the_reply() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert_eq!(
            l.activate("0123-4567-89AB-CDEF-GHJK-MNPQ-RST0", T0),
            Err(LicenseError::InvalidKey)
        );
        assert!(api.calls.lock().unwrap().is_empty(), "gõ sai thì không gọi server");
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert_eq!(
            api.calls.lock().unwrap()[0],
            format!("activate 0123456789ABCDEFGHJKMNPQRST5 {DEVICE} Mac")
        );
        let v = l.view(T0);
        assert_eq!(
            (v.standing, v.plan.as_str(), v.key.as_deref()),
            (Standing::Active, "pro", Some(KEY))
        );
        assert_eq!(
            (v.quota.limit_ms, v.quota.remaining_ms, v.quota.lost),
            (1800 * MIN, 1800 * MIN, false)
        );
        assert!(l.is_pro(T0));
    }

    #[test]
    fn server_refusals_are_reported_with_their_details() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let devices = vec![Device {
            activation_id: "a1".into(),
            device_label: None,
            last_validated_at: Some(T0),
        }];
        api.replies.lock().unwrap().extend([
            Err(ApiError::Server(ServerError {
                status: 409,
                code: "device_limit".into(),
                devices: devices.clone(),
                ..ServerError::default()
            })),
            Err(server(423, "license_locked")),
            Err(ApiError::Server(ServerError {
                status: 429,
                code: "rate_limited".into(),
                retry_after: Some(60),
                ..ServerError::default()
            })),
        ]);
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::DeviceLimit(devices)));
        assert_eq!(l.activate(KEY, T0), Err(LicenseError::Locked));
        assert_eq!(
            l.activate(KEY, T0),
            Err(LicenseError::RateLimited(Some(60))),
            "429 không có nghĩa là key sai"
        );
        assert_eq!(l.view(T0).standing, Standing::Free);
    }

    /// Token đọc lại từ kho khóa không bao giờ là `fresh`: mở lại app dùng tiếp bộ đếm đã có.
    #[test]
    fn a_relaunch_keeps_the_paid_counter() {
        let (api, vault, l) = activated(T0, true);
        assert!(l.add_usage(100 * MIN, T0).is_continue());
        let l = license(&api, &vault, T0 + 60);
        assert_eq!(l.view(T0 + 60).quota.used_ms, 100 * MIN);
        // Xóa bộ đếm (còn bản ghi đánh dấu): mất bản ghi, đã dùng hết chu kỳ.
        let names: Vec<String> = vault
            .items
            .lock()
            .unwrap()
            .keys()
            .filter(|k| k.starts_with("quota-paid-"))
            .cloned()
            .collect();
        for n in names {
            vault.items.lock().unwrap().remove(&n);
        }
        let l = license(&api, &vault, T0 + 120);
        let v = l.view(T0 + 120);
        assert!((v.quota.lost, v.quota.remaining_ms) == (true, 0) && !l.can_start(T0 + 120));
    }

    #[test]
    fn paid_minutes_also_count_for_free_and_a_used_up_plan_uses_up_free_for_the_day() {
        let mut c = claims(T0);
        c["quota_minutes_per_cycle"] = json!(15);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(4 * MIN, T0).is_continue());
        assert!(l.add_usage(11 * MIN, T0).is_break());
        // Gỡ kích hoạt cùng ngày: Free hôm đó cũng đã hết.
        l.deactivate(None).unwrap();
        let v = l.view(T0);
        assert_eq!((v.plan.as_str(), v.quota.remaining_ms), ("free", 0));
    }

    #[test]
    fn validate_results_move_the_machine_to_the_right_standing() {
        // Máy bị gỡ từ xa: về Free, xóa bản ghi license.
        let (api, vault, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(404, "activation_not_found")));
        assert_eq!(l.validate(T0 + DAY), Err(LicenseError::Deactivated));
        assert_eq!(l.view(T0 + DAY).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
        // Thu hồi: giữ key, không còn Pro.
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        assert_eq!(l.validate(T0 + DAY), Err(LicenseError::Revoked));
        assert_eq!(l.view(T0 + DAY).standing, Standing::Revoked);
        assert!(!l.is_pro(T0 + DAY));
        // Lỗi mạng: giữ gói tới `refresh_before` (14 ngày), rồi về Free.
        let (api, _, l) = activated(T0, true);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        assert_eq!(l.validate(T0 + 2 * DAY), Err(LicenseError::Network));
        assert!(l.is_pro(T0 + 14 * DAY - 1));
        assert_eq!(l.view(T0 + 14 * DAY).standing, Standing::RefreshNeeded);
        // Quá `expires_at`: hết hạn.
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 2 * DAY);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        // Chờ lần `validate` đầu sau mốc tối đa 5 phút (N4 của review 06 lần 1), rồi hết hạn.
        assert_eq!(l.view(T0 + 2 * DAY).standing, Standing::Active);
        assert_eq!(l.view(T0 + 2 * DAY + EXPIRY_GRACE_SECS).standing, Standing::Expired);
        assert!(l.view(T0 + DAY).renew_soon);
    }

    /// Giờ máy chỉnh lùi quá 10 phút so với mốc lớn nhất từng thấy: không tin token tới khi `validate` lại (§10.2).
    #[test]
    fn a_clock_moved_back_needs_an_online_check() {
        let (_, _, l) = activated(T0, true);
        l.tick(T0 + 3600, 0);
        assert!(l.is_pro(T0 + 3600 - 600));
        let back = T0 + 3600 - 601;
        assert_eq!(l.view(back).standing, Standing::ClockRolledBack);
        assert!(!l.is_pro(back));
        assert!(l.validate_due(back));
        // Giờ máy từng đặt tới trước một năm rồi chỉnh lại đúng: `validate` thành công, header `Date` của server hạ mốc
        // về giờ thật, gói dùng lại được (không bị coi là chỉnh lùi mãi).
        let (api, _, ahead) = activated(T0, true);
        ahead.tick(T0 + 365 * DAY, 0);
        assert_eq!(ahead.view(T0 + DAY).standing, Standing::ClockRolledBack);
        *api.date.lock().unwrap() = Some(T0 + DAY);
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + DAY), false));
        ahead.validate(T0 + DAY).unwrap();
        assert_eq!(ahead.view(T0 + DAY).standing, Standing::Active);
    }

    /// Token server trả phải đúng activation trong response (§6.8): sai thì không lưu, vẫn Free.
    #[test]
    fn a_token_for_another_activation_is_refused() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        let mut reply = granted(&claims(T0), true);
        if let Ok(g) = reply.as_mut() {
            g.activation_id = "act-khac".into();
        }
        api.replies.lock().unwrap().push_back(reply);
        assert!(matches!(l.activate(KEY, T0), Err(LicenseError::BadToken(_))));
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
    }

    /// Phút dịch lúc ở gói trả phí cũng cộng vào Free của ngày; hết hạn mức gói trả phí thì Free của ngày cũng hết
    /// (§6.8).
    #[test]
    fn paid_minutes_also_count_against_free_and_a_used_up_plan_ends_free_for_the_day() {
        let after = T0 + 3600 + EXPIRY_GRACE_SECS;
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(3 * 60_000, T0 + 60).is_continue());
        assert_eq!(l.view(after).standing, Standing::Expired);
        assert_eq!(l.view(after).quota.used_ms, 3 * 60_000, "Free của ngày đã cộng 3 phút");
        // Gói 1 phút mỗi chu kỳ: dùng hết thì Free của ngày cũng hết.
        c["quota_minutes_per_cycle"] = json!(1);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(60_000, T0 + 60).is_break());
        assert_eq!(l.view(after).quota.remaining_ms, 0);
        assert!(!l.can_start(after));
    }

    /// Kho khóa lỗi thì coi như đã hết hạn mức (QĐ13 của 06): khi ghi bộ đếm gói trả phí, và khi đọc bộ đếm Free.
    #[test]
    fn a_failing_keystore_counts_as_a_used_up_quota() {
        let (_, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(1000, T0 + 60);
        assert!(!l.can_start(T0 + 60));
        assert!(l.view(T0 + 60).quota.storage_error);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_reads.lock().unwrap() = true;
        let l = license(&api, &vault, T0);
        assert!(!l.can_start(T0));
        assert!(l.view(T0).quota.storage_error);
    }

    /// Qua `expires_at` thì gọi `validate` ngay (có thể đã gia hạn ở máy khác), không chờ đủ 24 giờ (§6.8).
    #[test]
    fn expiry_triggers_a_validate_right_away() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        assert!(!l.validate_due(T0 + 3599));
        assert!(l.validate_due(T0 + 3600));
    }

    /// Giờ máy chậm từ trước lần mở app đầu (Q1 của review 06 lần 1): header `Date` của server cho thấy giờ máy lùi, gói
    /// trả phí không được tin tới khi giờ máy về đúng.
    #[test]
    fn a_machine_clock_behind_the_server_from_the_start_is_caught() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 - year);
        *api.date.lock().unwrap() = Some(T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0 - year).unwrap();
        assert_eq!(l.view(T0 - year + 60).standing, Standing::ClockRolledBack);
        assert!(!l.is_pro(T0 - year + 60));
        assert!(
            !l.validate_due(T0 - year + 60),
            "vừa validate xong: lần thử gấp sau là sau 5 phút"
        );
        assert!(l.validate_due(T0 - year + 300));
        assert!(l.is_pro(T0 + 60), "giờ máy về đúng: dùng được");
        // Giờ máy chậm dưới 10 phút (chưa là chỉnh lùi) nhưng theo giờ server thì token đã hết hạn quá 5 phút: hết hạn.
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        *api.date.lock().unwrap() = Some(T0 + 4000);
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("chậm".into())));
        let _ = l.validate(T0 + 3500);
        assert_eq!(l.view(T0 + 3500).standing, Standing::Expired);
    }

    /// `license_expired`, `license_revoked` từ server đổi trạng thái ngay và được nhớ qua lần mở app sau, kể cả khi
    /// offline (QĐ14; Q1 của review 06 lần 1). Token mới từ server xóa trạng thái đó.
    #[test]
    fn expired_and_revoked_from_the_server_are_kept_across_restarts() {
        let (api, vault, l) = activated(T0, true);
        let t = T0 + 10 * DAY;
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_expired")));
        assert!(matches!(l.validate(t), Err(LicenseError::Expired(_))));
        assert_eq!(l.view(t).standing, Standing::Expired);
        assert!(!l.is_pro(t));
        let reopened = license(&api, &vault, t + 60);
        assert_eq!(
            reopened.view(t + 60).standing,
            Standing::Expired,
            "mở lại app vẫn hết hạn"
        );
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(server(403, "license_revoked")));
        let _ = reopened.validate(t + 120);
        let reopened = license(&api, &vault, t + 180);
        assert_eq!(reopened.view(t + 180).standing, Standing::Revoked);
        // Gia hạn ở máy khác rồi `validate`: token mới, về Active.
        api.replies.lock().unwrap().push_back(granted(&claims(t + 240), false));
        reopened.validate(t + 240).unwrap();
        assert_eq!(reopened.view(t + 240).standing, Standing::Active);
    }

    /// Tới `expires_at` (có thể đã gia hạn ở máy khác): còn dùng được trong lúc chờ lần `validate` đầu sau mốc, tối đa 5
    /// phút, rồi mới về Free (N4 của review 06 lần 1). Lần thử đó lỗi mạng thì về Free ngay.
    #[test]
    fn at_expiry_the_plan_waits_for_one_validate_before_going_free() {
        let mut c = claims(T0);
        c["expires_at"] = json!(T0 + 3600);
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&c, true));
        l.activate(KEY, T0).unwrap();
        let at = T0 + 3600;
        assert!(l.is_pro(at), "chưa validate sau mốc: còn dùng được");
        assert!(!l.is_pro(at + 301), "quá 5 phút: về Free");
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(at + 30);
        assert!(!l.is_pro(at + 31), "lỗi mạng sau mốc: về Free");
        let mut renewed = claims(at + 60);
        renewed["expires_at"] = json!(at + 30 * DAY);
        api.replies.lock().unwrap().push_back(granted(&renewed, false));
        l.validate(at + 60).unwrap();
        assert!(l.is_pro(at + 61), "đã gia hạn ở máy khác: dùng tiếp");
    }

    /// Kho khóa từ chối ghi mà vẫn đọc được (N1 của review 06 lần 1): luật chặt giữ tới khi ghi lại được, và không đọc
    /// lại bộ đếm cũ (phút đã dùng không mất). Gói trả phí cũng vậy ở lần `validate` sau.
    #[test]
    fn a_keystore_that_refuses_writes_never_gives_minutes_back() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-free".into());
        assert!(l.add_usage(3 * 60_000, T0 + 60).is_break());
        l.tick(T0 + 120, 60_000);
        assert!(!l.can_start(T0 + 120), "vẫn chặn khi chưa ghi được");
        *vault.fail_writes_of.lock().unwrap() = None;
        l.tick(T0 + 180, 60_000);
        assert!(l.can_start(T0 + 180));
        assert_eq!(l.view(T0 + 180).quota.used_ms, 3 * 60_000, "phút đã dùng không mất");
        let (api, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(3 * 60_000, T0 + 60);
        *vault.fail_writes_of.lock().unwrap() = None;
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + 120), false));
        l.validate(T0 + 120).unwrap();
        assert_eq!(l.view(T0 + 120).quota.used_ms, 3 * 60_000);
        assert!(l.can_start(T0 + 120));
        // Không có `validate` nào: ticker ghi lại bộ đếm gói trả phí khi kho khóa nhận ghi trở lại.
        let (_, vault, l) = activated(T0, true);
        *vault.fail_writes_of.lock().unwrap() = Some("quota-paid-".into());
        let _ = l.add_usage(3 * 60_000, T0 + 60);
        assert!(!l.can_start(T0 + 60));
        *vault.fail_writes_of.lock().unwrap() = None;
        l.tick(T0 + 120, 60_000);
        assert!(l.can_start(T0 + 120));
    }

    /// Chưa kiểm xong chữ ký bản cài (vài giây đầu sau khi mở app): chưa mở Pro, nhưng cũng chưa báo "không chính hãng"
    /// (N5 của review 06 lần 1).
    #[test]
    fn pro_waits_for_the_build_check() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license_unchecked(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert!(!l.is_pro(T0));
        assert_eq!(l.view(T0).standing, Standing::Active);
        l.set_genuine(true);
        assert!(l.is_pro(T0));
        l.set_genuine(false);
        assert_eq!(l.view(T0).standing, Standing::NotGenuine);
    }

    /// Người dùng Free có giờ máy từng đặt tới trước rồi chỉnh lại (Q2 của review 06 lần 1): giao diện nhắc, và app hỏi giờ
    /// của server bằng một request nhẹ (`GET /v1/plans`), tối đa 5 phút một lần, tới khi giờ máy được tin lại.
    #[test]
    fn a_free_user_with_a_clock_set_ahead_gets_the_time_from_the_server() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 + year);
        l.tick(T0, 60_000);
        assert!(l.view(T0).clock_rolled_back);
        l.refresh_clock(T0);
        l.refresh_clock(T0 + 60);
        assert_eq!(api.calls.lock().unwrap().len(), 1, "offline: tối đa 5 phút một lần");
        *api.date.lock().unwrap() = Some(T0 + 301);
        l.refresh_clock(T0 + 301);
        assert!(!l.view(T0 + 301).clock_rolled_back);
        l.refresh_clock(T0 + 700);
        assert_eq!(api.calls.lock().unwrap().len(), 2, "giờ máy đã được tin: không hỏi nữa");
    }

    /// Giờ máy lùi trước lần mở đầu mà response không có header `Date` (proxy TLS của người dùng xóa header, hay sửa mục
    /// `license-seen`; QA của review 06 lần 2): `issued_at` đã ký của token cho thấy giờ máy chậm, cả sau khi mở lại app.
    #[test]
    fn a_slow_clock_is_caught_by_the_signed_issue_time_without_any_date_header() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 - year);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0 - year).unwrap();
        assert_eq!(l.view(T0 - year + 60).standing, Standing::ClockRolledBack);
        assert!(
            !l.is_pro(T0 - year + 300 * DAY),
            "300 ngày theo giờ giả: vẫn không dùng được"
        );
        vault.items.lock().unwrap().remove(store::SEEN);
        let reopened = license(&api, &vault, T0 - year + 120);
        assert_eq!(reopened.view(T0 - year + 120).standing, Standing::ClockRolledBack);
    }

    /// Giờ máy chậm 1 giờ (N1 của review 06 lần 2): `validate` thành công mà giờ máy vẫn bị coi là lùi thì lần thử sau là
    /// sau 5 phút (QĐ15), không phải mỗi phút.
    #[test]
    fn a_slow_clock_retries_validate_every_five_minutes() {
        let t = T0 - 3600;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, t);
        *api.date.lock().unwrap() = Some(T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, t).unwrap();
        assert!(!l.validate_due(t + 60));
        assert!(l.validate_due(t + 300));
        api.replies.lock().unwrap().push_back(granted(&claims(T0 + 300), false));
        l.validate(t + 300).unwrap();
        assert!(!l.validate_due(t + 360));
        assert!(l.validate_due(t + 600));
    }

    /// Chưa kiểm xong chữ ký bản cài: hạn mức vẫn theo gói trả phí, chỉ tính năng Pro chờ (N2 của review 06 lần 2), nên bấm
    /// Bắt đầu ngay sau khi mở app không bị từ chối vì Free của ngày đã hết.
    #[test]
    fn the_quota_follows_the_plan_while_the_build_check_runs() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license_unchecked(&api, &vault, T0);
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        assert!(l.add_usage(quota::FREE_DAILY_MS, T0 + 60).is_continue());
        assert!(l.can_start(T0 + 60));
        assert_eq!(l.view(T0 + 60).quota.limit_ms, 1800 * 60_000);
        assert!(!l.is_pro(T0 + 60));
    }

    /// Bộ đếm Free vừa kéo về (giờ máy từng đặt tới trước): sang ngày mới thì app hỏi giờ của server, và reset bằng hiệu
    /// `Date` tính từ lần `Date` đầu sau khi kéo về, không cần 20 giờ app chạy (QB của review 06 lần 2).
    #[test]
    fn a_pulled_back_free_counter_resets_with_the_server_clock() {
        let year = 365 * DAY;
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0 + year);
        let _ = l.add_usage(quota::FREE_DAILY_MS, T0 + year + 60);
        l.tick(T0, 60_000);
        assert!(!l.can_start(T0));
        *api.date.lock().unwrap() = Some(T0);
        l.refresh_clock(T0);
        assert!(!l.view(T0).clock_rolled_back);
        let next_day = T0 + 21 * 3600;
        *api.date.lock().unwrap() = Some(next_day);
        l.refresh_clock(next_day);
        l.tick(next_day, 60_000);
        assert!(l.can_start(next_day));
    }

    #[test]
    fn validate_runs_daily_at_cycle_boundaries_and_at_expiry_but_not_in_a_loop() {
        let (api, _, l) = activated(T0, true);
        assert!(!l.validate_due(T0 + 23 * 3600));
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("tắt mạng".into())));
        let _ = l.validate(T0 + VALIDATE_EVERY_SECS);
        assert!(
            !l.validate_due(T0 + VALIDATE_EVERY_SECS + 600),
            "lỗi mạng: thử lại sau một giờ"
        );
        assert!(l.validate_due(T0 + VALIDATE_EVERY_SECS + 3600));
        // 429: chờ đúng `Retry-After`.
        api.replies.lock().unwrap().push_back(Err(ApiError::Server(ServerError {
            status: 429,
            code: "rate_limited".into(),
            retry_after: Some(7200),
            ..ServerError::default()
        })));
        let t = T0 + 2 * DAY;
        let _ = l.validate(t);
        assert!(!l.validate_due(t + 3600));
        assert!(l.validate_due(t + 7200));
    }

    /// Giờ máy qua mốc chu kỳ kế tiếp thì gọi `validate`; token mới mà `issued_at` vẫn trước mốc (giờ máy nhanh) thì hẹn
    /// lại sau (mốc − `issued_at`) + 1 phút (§6.8).
    #[test]
    fn a_fast_machine_clock_at_the_cycle_boundary_retries_later() {
        let (api, _, l) = activated(T0 + DAY, true);
        let boundary = T0 + 30 * DAY;
        let mut c = claims(T0 + DAY);
        c["expires_at"] = json!(T0 + 90 * DAY);
        api.replies.lock().unwrap().push_back(granted(&c, false));
        l.validate(T0 + DAY + 10).unwrap();
        assert!(l.validate_due(boundary), "qua mốc chu kỳ thì gọi ngay");
        // Server cấp token lúc mốc − 2 giờ (giờ máy nhanh 2 giờ).
        let mut early = c.clone();
        early["issued_at"] = json!(boundary - 7200);
        early["refresh_before"] = json!(boundary - 7200 + 14 * DAY);
        api.replies.lock().unwrap().push_back(granted(&early, false));
        l.validate(boundary).unwrap();
        assert!(l.view(boundary).quota.needs_network, "vẫn là chu kỳ cũ");
        assert!(!l.validate_due(boundary + 7200));
        assert!(l.validate_due(boundary + 7200 + 60));
    }

    #[test]
    fn a_debug_override_is_pro_without_limits() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = License::new(
            Box::new(api.clone()),
            Box::new(vault.clone()),
            test_keys(),
            Machine {
                id_hash: DEVICE.into(),
                label: None,
            },
            vn(),
            false,
            true,
            false,
            T0,
        );
        assert!(l.is_pro(T0) && l.add_usage(999 * MIN, T0).is_continue() && l.can_start(T0));
        let v = l.view(T0);
        assert!(v.quota.unlimited && v.dev_override);
    }

    #[test]
    fn an_unreadable_keystore_counts_as_used_up_and_a_fake_build_is_free() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *vault.fail_reads.lock().unwrap() = true;
        let l = license(&api, &vault, T0);
        assert!(!l.can_start(T0));
        assert!(l.view(T0).quota.storage_error);
        let (_, _, l) = activated(T0, true);
        l.set_genuine(false);
        assert_eq!(l.view(T0).standing, Standing::NotGenuine);
        assert!(!l.is_pro(T0));
    }

    #[test]
    fn the_five_minute_warning_fires_once_per_counter() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
        assert!(l.take_warning(T0));
        assert!(!l.take_warning(T0));
        let _ = l.add_usage(5 * MIN, T0);
        assert!(!l.take_warning(T0), "đã hết thì không nhắc còn 5 phút");
    }

    #[test]
    fn deactivating_this_machine_or_another_one() {
        let (api, vault, l) = activated(T0, true);
        l.deactivate(Some((KEY, "other"))).unwrap();
        assert_eq!(
            api.calls.lock().unwrap().last().unwrap(),
            "deactivate 0123456789ABCDEFGHJKMNPQRST5 other"
        );
        assert!(l.is_pro(T0), "gỡ máy khác không đụng máy này");
        api.deactivations
            .lock()
            .unwrap()
            .push_back(Err(server(404, "activation_not_found")));
        l.deactivate(None).unwrap();
        assert_eq!(l.view(T0).standing, Standing::Free);
        assert!(!vault.items.lock().unwrap().contains_key(store::LICENSE));
        assert_eq!(l.deactivate(None), Err(LicenseError::NotActivated));
    }

    /// Header `Date` của mọi response được ghi làm mốc cho "đồng hồ thật" của Free.
    #[test]
    fn server_dates_are_recorded() {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        *api.date.lock().unwrap() = Some(T0 + 5);
        let l = license(&api, &vault, T0);
        let _ = l.activate(KEY, T0);
        let seen: Seen = store::read(vault.as_ref(), store::SEEN).unwrap().unwrap();
        assert_eq!(seen.latest_server_date, Some(T0 + 5));
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 771f547345854df24a032da78beda248400ce8be..6714cf6e3b7b76203665f2d20c8eec4739db6b0c 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -6,6 +6,7 @@
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 //! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
+//! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
 //! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
 pub mod client;
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::manager -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::manager::tests::a_clock_moved_back_needs_an_online_check ... ok
test license::manager::tests::a_debug_override_is_pro_without_limits ... ok
test license::manager::tests::a_failing_keystore_counts_as_a_used_up_quota ... ok
test license::manager::tests::a_fast_machine_clock_at_the_cycle_boundary_retries_later ... ok
test license::manager::tests::a_first_run_is_free_with_ten_minutes_that_stop_the_session_when_used_up ... ok
test license::manager::tests::a_free_user_with_a_clock_set_ahead_gets_the_time_from_the_server ... ok
test license::manager::tests::a_keystore_that_refuses_writes_never_gives_minutes_back ... ok
test license::manager::tests::a_machine_clock_behind_the_server_from_the_start_is_caught ... ok
test license::manager::tests::a_missing_free_counter_after_earlier_runs_counts_as_used_up ... ok
test license::manager::tests::a_pulled_back_free_counter_resets_with_the_server_clock ... ok
test license::manager::tests::a_relaunch_keeps_the_paid_counter ... ok
test license::manager::tests::a_slow_clock_is_caught_by_the_signed_issue_time_without_any_date_header ... ok
test license::manager::tests::a_slow_clock_retries_validate_every_five_minutes ... ok
test license::manager::tests::a_token_for_another_activation_is_refused ... ok
test license::manager::tests::activating_checks_the_key_locally_then_uses_the_fresh_flag_of_the_reply ... ok
test license::manager::tests::an_unreadable_keystore_counts_as_used_up_and_a_fake_build_is_free ... ok
test license::manager::tests::at_expiry_the_plan_waits_for_one_validate_before_going_free ... ok
test license::manager::tests::deactivating_this_machine_or_another_one ... ok
test license::manager::tests::expired_and_revoked_from_the_server_are_kept_across_restarts ... ok
test license::manager::tests::expiry_triggers_a_validate_right_away ... ok
test license::manager::tests::paid_minutes_also_count_against_free_and_a_used_up_plan_ends_free_for_the_day ... ok
test license::manager::tests::paid_minutes_also_count_for_free_and_a_used_up_plan_uses_up_free_for_the_day ... ok
test license::manager::tests::pro_waits_for_the_build_check ... ok
test license::manager::tests::server_dates_are_recorded ... ok
test license::manager::tests::server_refusals_are_reported_with_their_details ... ok
test license::manager::tests::the_five_minute_warning_fires_once_per_counter ... ok
test license::manager::tests::the_quota_follows_the_plan_while_the_build_check_runs ... ok
test license::manager::tests::validate_results_move_the_machine_to_the_right_standing ... ok
test license::manager::tests::validate_runs_daily_at_cycle_boundaries_and_at_expiry_but_not_in_a_loop ... ok
test result: ok. 29 passed; 0 failed; 0 ignored; 0 measured; 355 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/license/manager.rs \
  src-tauri/src/license/mod.rs
git commit -m "feat(app): trạng thái bản quyền và hạn mức của máy: kích hoạt, làm mới, gỡ, đếm phút, lịch validate (§6.8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 8: Nối bản quyền vào app

Spec §6.8, §4.2 bước 2; Đ6 của kế hoạch 00. QĐ19–QĐ21.

- `license::app::install` ở `setup` (thay `pro::install_default_gate` của 03): kho khóa thật, ID máy, khóa công khai build sẵn, server của bản build. Bản phát hành cài `LicenseGate` (Pro theo trạng thái bản quyền thật); bản debug không đặt `AI_TRANSLATOR_DEV_FREE=1` cài `DevGate` và không đếm phút (`pro::dev_override`, `pro::install_dev_gate`).
- `session::start_with` hỏi `license::app::check_start` trước (hạn mức còn 0: `quotaExhausted`); `TauriSink::usage` gọi `license::app::add_usage` (`Break` thì engine dừng phiên với `quotaExhausted`).
- Ticker nền mỗi phút: `tick`, `refresh_clock` (QĐ31), `validate` khi tới lịch, báo giao diện. `AppStatus` thêm `quota_warning`, `quota_reset_at` (cho thanh phụ đề); cửa sổ chính nhận `LicenseView` qua `license://changed`. View chỉ có key đã che (`••••-…-RST5`), không token (01 QĐ6).

**Files:**
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/license/app.rs`
- Modify: `src-tauri/src/license/key.rs`
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/mod.rs`
- Modify: `src-tauri/src/pro.rs`
- Modify: `src-tauri/src/session.rs`
- Modify: `src-tauri/src/state.rs`

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 1d9bcefdea77e0862b317b43156d9ce316d93dd6..6b708d899dc29d253621f12894457d5e70e2cc04 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -1360,3 +1360,101 @@
         );
     }
 }
+
+/// Bản quyền cho app giả: server và kho khóa giả của `license::manager::tests`, giờ thật.
+fn license_for(
+    app: &tauri::App<tauri::test::MockRuntime>,
+) -> (
+    Arc<crate::license::manager::tests::FakeApi>,
+    Arc<crate::license::manager::License>,
+) {
+    use crate::license::manager::tests::{DEVICE, FakeApi, test_keys, vn};
+    use crate::license::manager::{License, Machine};
+    use crate::license::store::tests::FakeVault;
+    let api = Arc::new(FakeApi::default());
+    let vault = Arc::new(FakeVault::default());
+    let license = License::new(
+        Box::new(api.clone()),
+        Box::new(vault),
+        test_keys(),
+        Machine {
+            id_hash: DEVICE.into(),
+            label: None,
+        },
+        vn(),
+        true,
+        false,
+        false,
+        crate::license::app::now(),
+    );
+    license.set_genuine(true);
+    crate::license::app::install_with(app.handle(), license);
+    let installed = app.state::<crate::license::app::Licensing>().0.clone();
+    (api, installed)
+}
+
+/// Hạn mức (§6.8, "Khi chạm hạn mức"): đang dịch mà chạm hạn mức thì phiên dừng với `quotaExhausted`; hạn mức còn 0 thì
+/// không bắt đầu được phiên mới.
+#[test]
+fn a_used_up_quota_stops_the_session_and_refuses_the_next_one() {
+    use crate::license::quota::FREE_DAILY_MS;
+    let app = mock_app_with(FakeDeps {
+        audio: FakeAudio::Tone,
+        ..FakeDeps::default()
+    });
+    let _main = window(&app, "main");
+    let (_, license) = license_for(&app);
+    let now = crate::license::app::now();
+    assert!(license.add_usage(FREE_DAILY_MS - 1, now).is_continue());
+    session::start(app.handle()).unwrap();
+    let state = app.state::<AppState>();
+    wait_until("phiên dừng vì hết hạn mức", || {
+        state.status().session == SessionStatus::Error
+    });
+    assert_eq!(state.status().session_error.as_deref(), Some(errors::QUOTA_EXHAUSTED));
+    let refused = session::start(app.handle()).unwrap_err();
+    assert_eq!(refused.code, errors::QUOTA_EXHAUSTED);
+    assert!(state.status().quota_reset_at.is_some(), "báo thời điểm reset");
+    // Phiên "Nghe thử" là phiên thật (N13 của review 03): cũng trừ hạn mức và cũng bị chặn (QĐ của 06).
+    let refused = session::start_with(app.handle(), StartOptions::LISTEN_TEST).unwrap_err();
+    assert_eq!(refused.code, errors::QUOTA_EXHAUSTED);
+}
+
+/// Còn từ 5 phút trở xuống: `AppStatus.quota_warning` bật, thanh phụ đề và cửa sổ chính nhắc (§4.2 bước 2).
+#[test]
+fn the_five_minute_warning_reaches_the_status() {
+    use crate::license::quota::FREE_DAILY_MS;
+    let app = mock_app();
+    let (_, license) = license_for(&app);
+    let state = app.state::<AppState>();
+    assert!(!state.status().quota_warning);
+    let _ = license.add_usage(FREE_DAILY_MS - 4 * 60_000, crate::license::app::now());
+    crate::license::app::refresh(app.handle());
+    assert!(state.status().quota_warning);
+}
+
+/// Sự kiện `license://changed` không mang key đầy đủ hay token (01 QĐ6: sự kiện không phải ranh giới quyền).
+#[test]
+fn license_events_never_carry_the_key_or_the_token() {
+    use crate::license::manager::tests::{DEVICE, KEY, granted, sign};
+    let app = mock_app();
+    let views = record(&app, crate::license::app::LICENSE_CHANGED);
+    let (api, license) = license_for(&app);
+    let now = crate::license::app::now();
+    let claims = json!({
+        "kid": "test-1", "license_id": "lic", "activation_id": "act", "activation_created_at": now,
+        "device_id_hash": DEVICE, "plan": "pro_x2", "expires_at": now + 30 * 86_400, "cycle_anchor": now,
+        "quota_minutes_per_cycle": 6000, "quota_epoch": 0, "quota_fresh": true,
+        "issued_at": now, "refresh_before": now + 14 * 86_400,
+    });
+    api.replies.lock().unwrap().push_back(granted(&claims, true));
+    license.activate(KEY, now).unwrap();
+    crate::license::app::refresh(app.handle());
+    let last = views.lock().unwrap().last().cloned().unwrap();
+    assert_eq!(last["plan"], "pro_x2");
+    let text = last.to_string();
+    assert!(text.contains("••••-••••-••••-••••-••••-••••-RST5"), "{text}");
+    assert!(!text.contains(&sign(&claims)[..20]), "không có token");
+    assert!(!text.contains("0123-4567"), "không có key đầy đủ");
+    assert!(app.state::<AppState>().status().pro, "gate Pro theo bản quyền thật");
+}
```

Sửa `src-tauri/src/license/key.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/key.rs b/src-tauri/src/license/key.rs
index a9120155d7f5036128facf76f8a9863386cca557..c401dc19c126124d43f240d00feb3164026a41af 100644
--- a/src-tauri/src/license/key.rs
+++ b/src-tauri/src/license/key.rs
@@ -95,6 +95,10 @@
             display("0123456789ABCDEFGHJKMNPQRST5"),
             "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5"
         );
+        assert_eq!(
+            masked("0123456789ABCDEFGHJKMNPQRST5"),
+            "••••-••••-••••-••••-••••-••••-RST5"
+        );
         assert_eq!(normalize(&"0".repeat(65)), None);
         assert_eq!(normalize("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTÀ"), None);
     }
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 6714cf6e3b7b76203665f2d20c8eec4739db6b0c..5ed849edb43f1fe477ad98cbd6170e5d066377e1 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -9,6 +9,7 @@
 //! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
 //! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
+pub mod app;
 pub mod client;
 pub mod device;
 pub mod key;
```

Sửa `src-tauri/src/pro.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/pro.rs b/src-tauri/src/pro.rs
index 6e45fcc2fa06dd2629e2301ad1b65e8952db286f..d3eb161603c14dd5216334c1e40f0bb75ff51fee 100644
--- a/src-tauri/src/pro.rs
+++ b/src-tauri/src/pro.rs
@@ -141,6 +141,14 @@
         assert_eq!(app.state::<AppState>().status().pro, cfg!(debug_assertions));
     }
 
+    /// Bản phát hành không bao giờ chạy Pro không giới hạn nhờ biến môi trường (QĐ17 của 06); bản debug thì có, trừ khi
+    /// `AI_TRANSLATOR_DEV_FREE=1`. Chạy cả với `--release` ở 06b Task 5.
+    #[test]
+    fn only_a_debug_build_runs_unlimited() {
+        let asked_free = std::env::var("AI_TRANSLATOR_DEV_FREE").as_deref() == Ok("1");
+        assert_eq!(dev_override(), cfg!(debug_assertions) && !asked_free);
+    }
+
     #[cfg(debug_assertions)]
     #[test]
     fn the_dev_gate_is_pro_unless_asked_to_be_free() {
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có `license::app`, `key::masked`, `AppStatus.quota_warning`):
```text
error: could not compile `meeting-translator` (lib test) due to 7 previous errors
error[E0425]: cannot find function `dev_override` in this scope
error[E0425]: cannot find function `masked` in this scope
error[E0583]: file not found for module `app`
error[E0609]: no field `quota_reset_at` on type `AppStatus`
error[E0609]: no field `quota_warning` on type `AppStatus`
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/src/lib.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 41a16c4925065e94b41612af9221bafc8922abff..1c368a3f2a6929bf175244d04431cef0f4f11b7b 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -118,14 +118,17 @@
         );
     }
     let needs_save = loaded.needs_save();
+    // File cài đặt đã có từ trước: không phải lần đầu chạy app, nên thiếu bộ đếm Free là mất bản ghi (§6.8).
+    let had_settings = loaded.meta.version > 0;
     let mut settings = loaded.settings;
     let launch_changed = actions::sync_launch_at_login(&handle, &mut settings);
     if needs_save || launch_changed {
         persist::save(&handle, &settings, &loaded.meta)?;
     }
     app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
-    // Điểm kiểm tra Pro duy nhất (Đ6): bản debug luôn Pro, bản release là Free; kế hoạch 06 cài trạng thái bản quyền.
-    pro::install_default_gate(&handle);
+    // Điểm kiểm tra Pro duy nhất (Đ6), theo trạng thái bản quyền thật (kế hoạch 06); bản debug không đặt
+    // `AI_TRANSLATOR_DEV_FREE=1` thì Pro không giới hạn.
+    license::app::install(&handle, had_settings);
     // DB mã hóa của lịch sử và từ điển: chưa mở, chưa đọc kho khóa ở đây (db.rs).
     db::install(&handle)?;
     app.manage(glossary::ActiveGlossary::default());
```

Tạo `src-tauri/src/license/app.rs`:

```rust
//! Nối [`License`] vào app (spec §6.8, §4.2 bước 2): điểm kiểm tra Pro thật (`pro::ProGate`, thay `DevGate` của kế hoạch
//! 03 ở bản phát hành), kiểm hạn mức trước khi bắt đầu phiên, đếm phút từ `EventSink::usage`, lịch `validate` chạy nền,
//! và báo giao diện.
//!
//! - Giao diện nhận [`LicenseView`] qua sự kiện `license://changed` (chỉ cửa sổ chính) và lệnh `get_license`. View
//!   không có key đầy đủ hay token (01 QĐ6).
//! - `AppStatus.quota_warning` (còn từ 5 phút trở xuống) và `AppStatus.quota_reset_at` đi cùng `app://status`, để thanh
//!   phụ đề nhắc mà không cần lệnh mới.
//! - Bản debug không đặt `AI_TRANSLATOR_DEV_FREE=1` thì chạy Pro không giới hạn (`DevGate`, kế hoạch 03); đặt biến này
//!   thì dùng trạng thái bản quyền thật, như bản phát hành.

use std::ops::ControlFlow;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};

use super::client::HttpApi;
use super::device;
use super::keys::PublicKeys;
use super::manager::{License, LicenseView, Machine, Zone};
use super::store::Vault;
use crate::errors::{self, CommandError};
use crate::pro::{self, ProGate};
use crate::security::keystore::Keystore;
use crate::state::AppState;
use crate::{actions, window};

pub const LICENSE_CHANGED: &str = "license://changed";
/// Ticker của bản quyền: cộng thời gian đơn điệu, reset Free, gọi `validate` khi tới lịch.
const TICK_EVERY: Duration = Duration::from_secs(60);

/// [`License`] của app, quản lý bằng `app.manage`.
pub struct Licensing(pub Arc<License>);

/// `ProGate` theo trạng thái bản quyền thật.
struct LicenseGate(Arc<License>);

impl ProGate for LicenseGate {
    fn is_pro(&self) -> bool {
        self.0.is_pro(now())
    }
}

pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

/// Kho khóa không mở được: mọi lần đọc ghi đều lỗi, nên luật hạn mức áp luật chặt.
struct NoVault(String);

impl Vault for NoVault {
    fn get(&self, _: &str) -> Result<Option<Vec<u8>>, String> {
        Err(self.0.clone())
    }
    fn set(&self, _: &str, _: &[u8]) -> Result<(), String> {
        Err(self.0.clone())
    }
    fn delete(&self, _: &str) -> Result<(), String> {
        Err(self.0.clone())
    }
}

/// Cài bản quyền thật lúc khởi động. `has_prior_data`: file cài đặt đã có từ trước (không phải lần đầu chạy app).
pub fn install<R: Runtime>(app: &AppHandle<R>, has_prior_data: bool) {
    let api = HttpApi::for_this_build();
    let configured = api.configured();
    let vault: Box<dyn Vault> = match Keystore::os(&app.config().identifier) {
        Ok(ks) => Box::new(ks),
        Err(e) => {
            log::error!("không mở được kho khóa cho bản quyền: {e}");
            Box::new(NoVault(e.to_string()))
        }
    };
    let machine = Machine {
        id_hash: device::hardware_id()
            .map(|id| device::hash_id(&id))
            .unwrap_or_else(|e| {
                log::error!("không đọc được ID máy: {e}");
                String::new()
            }),
        label: device::label(),
    };
    let dev = pro::dev_override();
    let license = License::new(
        Box::new(api),
        vault,
        PublicKeys::embedded(),
        machine,
        Zone::Local,
        configured,
        dev,
        has_prior_data,
        now(),
    );
    install_with(app, license);
    spawn_ticker(app);
}

/// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
    let license = Arc::new(license);
    app.manage(Licensing(license.clone()));
    if license.dev_unlimited() {
        pro::install_dev_gate(app);
    } else {
        pro::install_gate(app, Box::new(LicenseGate(license)));
    }
    refresh(app);
}

fn licensing<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<License>> {
    app.try_state::<Licensing>().map(|l| l.0.clone())
}

/// Trạng thái bản quyền hiện tại.
pub fn view<R: Runtime>(app: &AppHandle<R>) -> Option<LicenseView> {
    licensing(app).map(|l| l.view(now()))
}

/// Đọc lại trạng thái bản quyền: Pro (`pro::refresh`), các trường hạn mức của `AppStatus`, và sự kiện cho cửa sổ chính.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    let view = license.view(t);
    pro::refresh(app);
    if let Some(state) = app.try_state::<AppState>() {
        let reset_at = (!view.quota.unlimited).then_some(view.quota.reset_at).flatten();
        let warning = !view.quota.unlimited
            && view.quota.remaining_ms > 0
            && view.quota.remaining_ms <= super::quota::WARN_REMAINING_MS;
        let changed = state.update_status(|s| {
            let changed = s.quota_reset_at != reset_at || s.quota_warning != warning;
            s.quota_reset_at = reset_at;
            s.quota_warning = warning;
            changed
        });
        if changed {
            actions::status_changed(app);
        }
    }
    let _ = app.emit_to(EventTarget::webview_window(window::MAIN), LICENSE_CHANGED, &view);
}

/// Trước khi bắt đầu phiên: hạn mức còn 0 thì từ chối với `quotaExhausted` (§6.8, "Khi chạm hạn mức").
pub fn check_start<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    match licensing(app) {
        Some(l) if !l.can_start(now()) => Err(CommandError::new(errors::QUOTA_EXHAUSTED, None, "hạn mức còn 0")),
        _ => Ok(()),
    }
}

/// Phút vừa dịch xong (`EventSink::usage`). `Break` khi đã chạm hạn mức.
pub fn add_usage<R: Runtime>(app: &AppHandle<R>, speech_ms: u64) -> ControlFlow<()> {
    let Some(license) = licensing(app) else {
        return ControlFlow::Continue(());
    };
    let t = now();
    let flow = license.add_usage(speech_ms, t);
    if license.take_warning(t) || flow.is_break() {
        refresh(app);
    }
    flow
}

/// Gọi `validate` nếu tới lịch, rồi báo giao diện. Chạy trên luồng nền.
pub fn validate_if_due<R: Runtime>(app: &AppHandle<R>) {
    let Some(license) = licensing(app) else {
        return;
    };
    let t = now();
    if license.validate_due(t) {
        if let Err(e) = license.validate(t) {
            log::info!("validate chưa được: {}", e.code());
        }
        refresh(app);
    }
}

fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ").
        validate_if_due(&app);
        let mut last = Instant::now();
        loop {
            std::thread::sleep(TICK_EVERY);
            let elapsed = last.elapsed();
            last = Instant::now();
            if let Some(license) = licensing(&app) {
                let t = now();
                license.tick(t, elapsed.as_millis() as u64);
                license.refresh_clock(t);
            }
            validate_if_due(&app);
            refresh(&app);
        }
    });
}
```

Sửa `src-tauri/src/license/key.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/key.rs b/src-tauri/src/license/key.rs
index c401dc19c126124d43f240d00feb3164026a41af..301ee633784fc0e8fef7c63d49d5bc6bb80fdee9 100644
--- a/src-tauri/src/license/key.rs
+++ b/src-tauri/src/license/key.rs
@@ -49,6 +49,14 @@
         .map(|c| std::str::from_utf8(c).unwrap_or(""))
         .collect::<Vec<_>>()
         .join("-")
+}
+
+/// Dạng che để hiện trên giao diện: mọi nhóm trừ nhóm cuối thay bằng `••••`.
+pub fn masked(key: &str) -> String {
+    let groups = display(key);
+    let mut parts: Vec<&str> = groups.split('-').collect();
+    let last = parts.pop().unwrap_or_default();
+    parts.iter().map(|_| "••••").chain([last]).collect::<Vec<_>>().join("-")
 }
 
 #[cfg(test)]
```

Sửa `src-tauri/src/license/manager.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/manager.rs b/src-tauri/src/license/manager.rs
index fd48690011f0c8e01bd99e0e36117df6abc81d38..9beee1297dbe5047840533a090ac5ce365bd8d4e 100644
--- a/src-tauri/src/license/manager.rs
+++ b/src-tauri/src/license/manager.rs
@@ -136,7 +136,8 @@
     pub plan: String,
     /// Gói ghi trong token đã lưu (kể cả khi đã hết hạn), để hiện "Professional đã hết hạn".
     pub licensed_plan: Option<Plan>,
-    /// Key dạng hiển thị.
+    /// Key đã che, chỉ còn 4 ký tự cuối (`••••-…-RST5`): sự kiện không phải ranh giới quyền, nên không gửi key đầy đủ
+    /// (01 QĐ6). Key đầy đủ nằm trong email mua hàng.
     pub key: Option<String>,
     pub expires_at: Option<i64>,
     pub refresh_before: Option<i64>,
@@ -763,7 +764,7 @@
                 (None, _) => "free".into(),
             },
             licensed_plan: stored.map(|c| c.plan),
-            key: inner.record.as_ref().map(|r| key::display(&r.key)),
+            key: inner.record.as_ref().map(|r| key::masked(&r.key)),
             expires_at: stored.map(|c| c.expires_at),
             refresh_before: stored.map(|c| c.refresh_before),
             validated_at: inner.record.as_ref().map(|r| r.validated_at),
@@ -1064,7 +1065,7 @@
         let v = l.view(T0);
         assert_eq!(
             (v.standing, v.plan.as_str(), v.key.as_deref()),
-            (Standing::Active, "pro", Some(KEY))
+            (Standing::Active, "pro", Some("••••-••••-••••-••••-••••-••••-RST5"))
         );
         assert_eq!(
             (v.quota.limit_ms, v.quota.remaining_ms, v.quota.lost),
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 5ed849edb43f1fe477ad98cbd6170e5d066377e1..8ae5f5103330ab48588428ecf0975d87d5d1dbf3 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -2,6 +2,7 @@
 //!
 //! - [`token`]: token v1 ký Ed25519, kiểm offline bằng khóa công khai build sẵn ([`keys`]). Định dạng và thứ tự kiểm là
 //!   hợp đồng với license server (kế hoạch 05, `server/src/token.ts`), chốt bằng bộ vector `server/test/vectors/token-v1.json`.
+//! - [`app`]: nối vào app: điểm kiểm tra Pro thật, hạn mức của phiên, lịch `validate`, sự kiện cho giao diện.
 //! - [`client`]: gọi license server (`LicenseApi`, bản thật [`client::HttpApi`]).
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
```

Sửa `src-tauri/src/pro.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/pro.rs b/src-tauri/src/pro.rs
index d3eb161603c14dd5216334c1e40f0bb75ff51fee..5a548ef368aedbe2f00f6b16cc631c78c97f9456 100644
--- a/src-tauri/src/pro.rs
+++ b/src-tauri/src/pro.rs
@@ -71,6 +71,27 @@
     }
 }
 
+/// Bản debug chạy Pro không giới hạn (`DevGate` là Pro): không đặt `AI_TRANSLATOR_DEV_FREE=1`. Bản phát hành luôn `false`.
+/// Kế hoạch 06 dùng để chọn gate và bỏ hạn mức ở bản debug (`license::app::install`).
+pub fn dev_override() -> bool {
+    #[cfg(debug_assertions)]
+    {
+        DevGate::from_env().is_pro()
+    }
+    #[cfg(not(debug_assertions))]
+    {
+        false
+    }
+}
+
+/// Cài `DevGate` Pro (chỉ bản debug, khi [`dev_override`]). Bản phát hành không làm gì: không có `DevGate`.
+pub fn install_dev_gate<R: Runtime>(app: &AppHandle<R>) {
+    #[cfg(debug_assertions)]
+    install_gate(app, Box::new(DevGate::from_value(None)));
+    #[cfg(not(debug_assertions))]
+    let _ = app;
+}
+
 /// Cài [`default_gate`] (nếu có). Gọi một lần ở `setup`, sau khi đã có `AppState`.
 pub fn install_default_gate<R: Runtime>(app: &AppHandle<R>) {
     if let Some(gate) = default_gate() {
```

Sửa `src-tauri/src/session.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/session.rs b/src-tauri/src/session.rs
index f775556e6da11559b53d30892b4d75626f49f16e..22ef0ca556a623903d9c96dda45aa9af68d3bab8 100644
--- a/src-tauri/src/session.rs
+++ b/src-tauri/src/session.rs
@@ -17,13 +17,14 @@
 //! Phần bên ngoài (tiến trình phụ, nguồn âm thanh, VAD) đi qua `SessionDeps`: app dùng `LiveDeps`, test dùng bản giả
 //! (`test_support.rs`), nên luồng bắt đầu, hủy, dừng, lỗi, thoát test được bằng `MockRuntime`.
 
+use std::ops::ControlFlow;
 use std::path::{Path, PathBuf};
 use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
 use std::sync::{Arc, Mutex};
 use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
 
 use pipeline::config::PipelineConfig;
-use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, VadFactory};
+use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, Usage, VadFactory};
 use pipeline::glossary::SharedGlossary;
 use pipeline::prompt::Lang as MtLang;
 use pipeline::subtitle::{Delta, Subtitle};
@@ -276,7 +277,7 @@
         }
         Ok(state.status())
     };
-    if let Err(e) = session.deps.check_quota() {
+    if let Err(e) = crate::license::app::check_start(app).and_then(|()| session.deps.check_quota()) {
         return refuse(e);
     }
     let mut attempt = 0;
@@ -669,6 +670,11 @@
             .state::<AppState>()
             .update_status(|s| s.indicators = indicators.clone());
         changed(&self.app);
+    }
+
+    /// Đếm phút cho hạn mức (§6.8): `Break` khi chạm hạn mức, engine dừng phiên với `quotaExhausted`.
+    fn usage(&self, usage: &Usage) -> ControlFlow<()> {
+        crate::license::app::add_usage(&self.app, usage.speech_ms)
     }
 
     fn fatal(&self, kind: Fatal, reason: &str) {
```

Sửa `src-tauri/src/state.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/state.rs b/src-tauri/src/state.rs
index 705be782963aea3eb08c5118e108b780c2ae59c1..e8b21e4236d2dbc632cfd4713caa9c3c147e689e 100644
--- a/src-tauri/src/state.rs
+++ b/src-tauri/src/state.rs
@@ -57,6 +57,10 @@
     pub waiting_for_app: bool,
     /// Đang có gói trả phí còn hạn (spec §2 "Pro"): giao diện mở hay khóa tính năng Pro. Đặt bởi `pro::refresh`.
     pub pro: bool,
+    /// Hạn mức còn từ 5 phút trở xuống (§4.2 bước 2): thanh phụ đề và cửa sổ chính nhắc. Đặt bởi `license::app::refresh`.
+    pub quota_warning: bool,
+    /// Thời điểm hạn mức được reset (giây Unix), để báo khi hết hạn mức; `None` khi không giới hạn.
+    pub quota_reset_at: Option<i64>,
     /// Tăng mỗi lần trạng thái đổi. Giao diện bỏ trạng thái có `rev` nhỏ hơn trạng thái đã có (kết quả của một lệnh có thể
     /// tới sau sự kiện `app://status` mới hơn).
     pub rev: u64,
@@ -131,6 +135,8 @@
                 permission_suspected: false,
                 waiting_for_app: false,
                 pro: false,
+                quota_warning: false,
+                quota_reset_at: None,
                 rev: 0,
             }),
             launched_at_login,
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib used_up_quota -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::a_used_up_quota_stops_the_session_and_refuses_the_next_one ... ok
test license::manager::tests::a_failing_keystore_counts_as_a_used_up_quota ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 386 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib five_minute_warning -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_five_minute_warning_reaches_the_status ... ok
test license::manager::tests::the_five_minute_warning_fires_once_per_counter ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 386 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib license_events -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::license_events_never_carry_the_key_or_the_token ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 387 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 385 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  12 passed (12)
      Tests  115 passed (115)
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/app_tests.rs \
  src-tauri/src/lib.rs \
  src-tauri/src/license/app.rs \
  src-tauri/src/license/key.rs \
  src-tauri/src/license/manager.rs \
  src-tauri/src/license/mod.rs \
  src-tauri/src/pro.rs \
  src-tauri/src/session.rs \
  src-tauri/src/state.rs
git commit -m "feat(app): điểm kiểm tra Pro theo bản quyền thật, hạn mức chặn và dừng phiên, lịch validate chạy nền (§6.8, §4.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 9: Mua gói trong app và các lệnh bản quyền

Spec §6.8 "Mua ngay trong app", §4.3 "Bản quyền", "Nâng cấp", §9, §10.1; bảng "App hiện gì theo `status`" của 05. QĐ22–QĐ25.

- `license/purchase.rs`: bảng gói; tạo đơn (thiếu ô đồng ý thì từ chối, không gọi server; email kiểm sơ bộ; gia hạn hay đổi gói gửi key đang có); vẽ mã VietQR thành SVG bằng `qrcode` (phía Rust); lưu đơn đang chờ; hỏi đơn (`paid` với `grant_kind: new` thì kích hoạt key mới, kể cả đơn gia hạn được hỗ trợ cấp key mới; `extend`, `change` thì `validate`; `underpaid` hỏi tiếp; `paid_needs_review`, `refunded`, hết hạn link, `cancelled`, `failed` thì thôi).
- Luồng hỏi đơn mỗi 3 giây (một luồng mỗi lúc), gửi `license://order`; mở lại app thì hỏi tiếp đơn còn chờ.
- 11 lệnh mới của cửa sổ `main` (đủ ba chỗ: `commands.rs`, `build.rs`, `capabilities/main.json`; overlay không có lệnh nào): `get_license`, `activate_license` (key đủ 2 máy thì trả danh sách máy, không phải lỗi), `deactivate_license`, `deactivate_other_device`, `validate_license`, `get_plans`, `start_checkout`, `get_pending_order`, `cancel_checkout`, `open_checkout_page`, `recover_license`. `order_token` không bao giờ ra giao diện.
- `open_checkout_page` mở URL của đơn đang chờ (phía Rust giữ) bằng `SystemOpener`, chỉ khi URL nằm trong `navigation::EXTERNAL_HOSTS`; danh sách nay có `pay.payos.vn` (01 QĐ28, Nhận từ 01).
- Mã lỗi `license*` và câu báo lỗi en, vi.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/build.rs`
- Modify: `src-tauri/capabilities/main.json`
- Modify: `src-tauri/src/app_tests.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/license/app.rs`
- Modify: `src-tauri/src/license/manager.rs`
- Modify: `src-tauri/src/license/mod.rs`
- Create: `src-tauri/src/license/purchase.rs`
- Modify: `src-tauri/src/license/store.rs`
- Modify: `src-tauri/src/navigation.rs`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/vi.ts`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Sửa `src-tauri/src/app_tests.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/app_tests.rs b/src-tauri/src/app_tests.rs
index 6b708d899dc29d253621f12894457d5e70e2cc04..677ad6e05b2e678349fde4ae86187cff4cd6974f 100644
--- a/src-tauri/src/app_tests.rs
+++ b/src-tauri/src/app_tests.rs
@@ -1458,3 +1458,65 @@
     assert!(!text.contains("0123-4567"), "không có key đầy đủ");
     assert!(app.state::<AppState>().status().pro, "gate Pro theo bản quyền thật");
 }
+
+/// Trang thanh toán của PayOS mở bằng trình duyệt của hệ thống (01 QĐ28), chỉ với URL do phía Rust giữ và nằm trong
+/// danh sách cho phép (§10.2); giao diện không gửi URL nào.
+#[test]
+fn the_checkout_page_opens_only_for_the_pending_payos_order() {
+    use crate::license::store::{self, PendingOrder};
+    use crate::test_support::system_calls;
+    let app = mock_app();
+    let main = window(&app, "main");
+    let (_, license) = license_for(&app);
+    let refused = invoke(&main, "open_checkout_page", json!({})).unwrap_err();
+    assert!(refused.contains(errors::OPEN_FAILED), "{refused}");
+    let mut order = PendingOrder {
+        order_code: 7,
+        order_token: "tok".into(),
+        plan: "pro".into(),
+        expires_at: crate::license::app::now() + 900,
+        renewal: false,
+        checkout_url: "https://pay.payos.vn/web/abc".into(),
+        qr_code: "000201".into(),
+    };
+    store::write(license.vault(), store::ORDER, &order).unwrap();
+    invoke(&main, "open_checkout_page", json!({})).unwrap();
+    assert_eq!(system_calls(&app), ["open_external_url https://pay.payos.vn/web/abc"]);
+    order.checkout_url = "https://pay.payos.vn.evil.example/x".into();
+    store::write(license.vault(), store::ORDER, &order).unwrap();
+    assert!(invoke(&main, "open_checkout_page", json!({})).is_err());
+    let pending = invoke(&main, "get_pending_order", json!({})).unwrap();
+    assert!(pending["qrSvg"].as_str().unwrap().contains("<svg"));
+    assert!(!pending.to_string().contains("tok"), "order_token không ra giao diện");
+    invoke(&main, "cancel_checkout", json!({})).unwrap();
+    assert_eq!(invoke(&main, "get_pending_order", json!({})).unwrap(), Value::Null);
+}
+
+/// Key đã đủ 2 máy: lệnh kích hoạt trả danh sách máy để gỡ một máy (§9), không phải lỗi.
+#[test]
+fn activating_a_full_key_returns_its_devices() {
+    use crate::license::client::{ApiError, Device, ServerError};
+    let app = mock_app();
+    let main = window(&app, "main");
+    let (api, _) = license_for(&app);
+    api.replies.lock().unwrap().push_back(Err(ApiError::Server(ServerError {
+        status: 409,
+        code: "device_limit".into(),
+        devices: vec![Device {
+            activation_id: "a1".into(),
+            device_label: None,
+            last_validated_at: Some(1),
+        }],
+        ..ServerError::default()
+    })));
+    let out = invoke(
+        &main,
+        "activate_license",
+        json!({ "key": crate::license::manager::tests::KEY }),
+    )
+    .unwrap();
+    assert_eq!(out["view"], Value::Null);
+    assert_eq!(out["devices"][0]["activation_id"], "a1");
+    let bad = invoke(&main, "activate_license", json!({ "key": "abc" })).unwrap_err();
+    assert!(bad.contains("licenseInvalidKey"), "{bad}");
+}
```

Sửa `src-tauri/src/errors.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/errors.rs b/src-tauri/src/errors.rs
index 9ed05a1285d671527fe1eb0c7dadb59bded78e02..7c66a97592f58c45fc155dfc9dd6a651ead06af1 100644
--- a/src-tauri/src/errors.rs
+++ b/src-tauri/src/errors.rs
@@ -213,6 +213,7 @@
         );
         codes.extend(crate::glossary::ERROR_CODES.iter().map(|c| c.to_string()));
         codes.push(crate::transcript::history::NOT_FOUND.to_string());
+        codes.extend(crate::license::manager::ERROR_CODES.iter().map(|c| c.to_string()));
         for code in codes {
             assert!(
                 en.contains(&format!("\"error.{code}\":")),
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 8ae5f5103330ab48588428ecf0975d87d5d1dbf3..a01b60eec7d4b3136042aabe0c77245b7317f911 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -16,6 +16,7 @@
 pub mod key;
 pub mod keys;
 pub mod manager;
+pub mod purchase;
 pub mod quota;
 pub mod store;
 pub mod token;
```

Tạo `src-tauri/src/license/purchase.rs`, lúc này mới có phần test:

```rust
//! Mua, gia hạn, đổi gói ngay trong app (spec §6.8 "Mua ngay trong app", §4.3 "Nâng cấp", §10.1; hợp đồng ở mục "App hiện
//! gì theo `status`" của kế hoạch 05):
//! 1. bảng gói lấy từ server (`GET /v1/plans`);
//! 2. tạo đơn với email và ô đồng ý (`consent`), kèm key đang có khi gia hạn hay đổi gói;
//! 3. vẽ mã VietQR từ chuỗi `qr_code` (SVG, phía Rust), kèm nút mở trang thanh toán của PayOS;
//! 4. hỏi trạng thái đơn mỗi 3 giây tới khi link hết hạn; đơn đã trả tiền thì tự kích hoạt key mới (`grant_kind: new`,
//!    kể cả đơn gia hạn được hỗ trợ cấp key mới), hay `validate` để lấy token có gói và hạn mới (`extend`, `change`);
//! 5. đơn đang chờ lưu trong kho khóa (`license-order`), mở lại app thì hỏi tiếp.

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::license::client::ApiError;
    use crate::license::manager::tests::{FakeApi, KEY, T0, claims, granted, license};
    use crate::license::store::tests::FakeVault;

    fn checkout(code: i64) -> Checkout {
        Checkout {
            order_code: code,
            order_token: "tok".into(),
            checkout_url: "https://pay.payos.vn/web/abc".into(),
            qr_code: "00020101021238570010A000000727012700069704220113VQRQAA".into(),
            plan: "pro".into(),
            amount: 50_000,
            currency: "VND".into(),
            expires_at: T0 + 900,
            license_expires_at: None,
            converted_days: None,
        }
    }

    fn order(status: &str, kind: Option<&str>, key: Option<&str>) -> OrderStatus {
        OrderStatus {
            order_code: 7,
            status: status.into(),
            plan: "pro".into(),
            expires_at: T0 + 900,
            license_key: key.map(String::from),
            license_plan: Some("pro".into()),
            license_expires_at: Some(T0 + 30 * 86_400),
            grant_kind: kind.map(String::from),
        }
    }

    fn setup() -> (Arc<FakeApi>, Arc<FakeVault>, License) {
        let (api, vault) = (Arc::new(FakeApi::default()), Arc::new(FakeVault::default()));
        let l = license(&api, &vault, T0);
        (api, vault, l)
    }

    #[test]
    fn a_checkout_needs_consent_a_valid_email_and_a_paid_plan() {
        let (api, _, l) = setup();
        assert_eq!(
            start(&l, "pro", "a@b.vn", false, false),
            Err(LicenseError::ConsentRequired)
        );
        assert_eq!(
            start(&l, "pro", "khong-co-a-cong", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert_eq!(
            start(&l, "pro", "a b@c.vn", true, false),
            Err(LicenseError::EmailInvalid)
        );
        assert!(start(&l, "free", "a@b.vn", true, false).is_err());
        assert_eq!(
            start(&l, "pro", "a@b.vn", true, true),
            Err(LicenseError::NotActivated),
            "gia hạn cần key đã kích hoạt"
        );
        assert!(api.calls.lock().unwrap().is_empty(), "không gọi server");
    }

    #[test]
    fn a_new_order_draws_the_qr_and_is_kept_for_polling() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        let view = start(&l, "pro", " a@b.vn ", true, false).unwrap();
        assert_eq!(api.calls.lock().unwrap()[0], "checkout pro a@b.vn -");
        assert!(view.qr_svg.contains("<svg") && view.qr_svg.contains("</svg>"));
        let kept = pending(&l).unwrap();
        assert_eq!(
            (kept.order_code, kept.order_token.as_str(), kept.renewal),
            (7, "tok", false)
        );
        let json = serde_json::to_string(&view).unwrap();
        assert!(!json.contains("tok"), "order_token không ra giao diện");
    }

    #[test]
    fn a_paid_new_order_activates_its_key_on_this_machine() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().extend([
            Ok(order("pending", None, None)),
            Ok(order("paid", Some("new"), Some(KEY))),
        ]);
        assert_eq!(
            poll(&l, T0 + 3),
            Some(OrderOutcome::Waiting {
                order_code: 7,
                expires_at: T0 + 900
            })
        );
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        assert_eq!(
            poll(&l, T0 + 6),
            Some(OrderOutcome::Paid {
                order_code: 7,
                plan: "pro".into()
            })
        );
        assert!(l.is_pro(T0 + 6));
        assert!(
            api.calls
                .lock()
                .unwrap()
                .iter()
                .any(|c| c.starts_with("activate 0123456789ABCDEFGHJKMNPQRST5"))
        );
        assert_eq!(pending(&l), None, "thôi hỏi");
        assert_eq!(poll(&l, T0 + 9), None);
    }

    /// Gia hạn, đổi gói: `validate` để lấy token có gói và hạn mới. Hỗ trợ cấp key mới cho đơn của license đã thu hồi
    /// (`grant_kind: new`): kích hoạt key mới, không `validate` key cũ.
    #[test]
    fn a_paid_renewal_validates_unless_support_granted_a_new_key() {
        let (api, _, l) = setup();
        api.replies.lock().unwrap().push_back(granted(&claims(T0), true));
        l.activate(KEY, T0).unwrap();
        for (kind, expect) in [
            ("extend", "validate"),
            ("change", "validate"),
            ("new", "activate 1111111111111111111111111Z0V"),
        ] {
            api.checkouts.lock().unwrap().push_back(Ok(checkout(8)));
            start(&l, "pro_x2", "a@b.vn", true, true).unwrap();
            assert!(
                api.calls
                    .lock()
                    .unwrap()
                    .last()
                    .unwrap()
                    .ends_with("0123456789ABCDEFGHJKMNPQRST5")
            );
            let key = (kind == "new").then_some("1111-1111-1111-1111-1111-1111-1Z0V");
            api.orders
                .lock()
                .unwrap()
                .push_back(Ok(order("paid", Some(kind), key.or(Some(KEY)))));
            api.replies.lock().unwrap().push_back(granted(&claims(T0 + 10), false));
            assert!(matches!(poll(&l, T0 + 10), Some(OrderOutcome::Paid { .. })), "{kind}");
            let calls = api.calls.lock().unwrap();
            assert!(calls[calls.len() - 1].starts_with(expect), "{kind}: {:?}", calls.last());
        }
    }

    #[test]
    fn other_order_states_end_or_continue_polling_as_the_contract_says() {
        let cases = [
            ("underpaid", OrderOutcome::Underpaid { order_code: 7 }, false),
            ("paid_needs_review", OrderOutcome::NeedsReview { order_code: 7 }, true),
            ("refunded", OrderOutcome::Refunded { order_code: 7 }, true),
            ("cancelled", OrderOutcome::Failed { order_code: 7 }, true),
            ("expired", OrderOutcome::Failed { order_code: 7 }, true),
            ("failed", OrderOutcome::Failed { order_code: 7 }, true),
        ];
        for (status, outcome, done) in cases {
            let (api, _, l) = setup();
            api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
            start(&l, "pro", "a@b.vn", true, false).unwrap();
            api.orders.lock().unwrap().push_back(Ok(order(status, None, None)));
            assert_eq!(poll(&l, T0 + 3), Some(outcome), "{status}");
            assert_eq!(pending(&l).is_none(), done, "{status}");
        }
        // Link đã hết hạn mà server vẫn báo `pending`: đơn không thành.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Ok(order("pending", None, None)));
        assert_eq!(poll(&l, T0 + 901), Some(OrderOutcome::Failed { order_code: 7 }));
        // Lỗi mạng: hỏi tiếp, tới 24 giờ sau khi link hết hạn.
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert!(matches!(poll(&l, T0 + 3600), Some(OrderOutcome::Waiting { .. })));
        api.orders.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert_eq!(
            poll(&l, T0 + 900 + 86_401),
            Some(OrderOutcome::Failed { order_code: 7 })
        );
    }

    #[test]
    fn a_paid_order_whose_key_cannot_be_activated_here_reports_why() {
        let (api, _, l) = setup();
        api.checkouts.lock().unwrap().push_back(Ok(checkout(7)));
        start(&l, "pro", "a@b.vn", true, false).unwrap();
        api.orders
            .lock()
            .unwrap()
            .push_back(Ok(order("paid", Some("new"), Some(KEY))));
        api.replies
            .lock()
            .unwrap()
            .push_back(Err(crate::license::manager::tests::server(423, "license_locked")));
        assert_eq!(
            poll(&l, T0 + 3),
            Some(OrderOutcome::PaidButNotApplied {
                order_code: 7,
                code: "licenseLocked".into()
            })
        );
    }
}
```

Sửa `src-tauri/src/navigation.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/navigation.rs b/src-tauri/src/navigation.rs
index 6cd4c55712897ba0a9c30d7d31d8dc929cd1104c..5e11d4e441e469af025ee33280a8a543c2550744 100644
--- a/src-tauri/src/navigation.rs
+++ b/src-tauri/src/navigation.rs
@@ -280,4 +280,25 @@
         }
         assert_eq!(system_calls(&app), ["open_external_url https://pay.payos.vn/web/abc"]);
     }
-}
+
+    /// Danh sách thật (kế hoạch 06): trang thanh toán của PayOS mở bằng trình duyệt; tên miền con, `http` hay cổng khác
+    /// thì chặn.
+    #[test]
+    fn the_payos_checkout_page_is_the_only_external_host() {
+        let ok = Url::parse("https://pay.payos.vn/web/abc").unwrap();
+        assert_eq!(decide(&ok, Os::MacOs, None, EXTERNAL_HOSTS), Decision::OpenExternal);
+        for bad in [
+            "http://pay.payos.vn/web/abc",
+            "https://evil.pay.payos.vn/x",
+            "https://pay.payos.vn:8443/x",
+            "https://pay.payos.vn.evil.example/x",
+            "https://payos.vn/x",
+        ] {
+            assert_eq!(
+                decide(&Url::parse(bad).unwrap(), Os::MacOs, None, EXTERNAL_HOSTS),
+                Decision::Block,
+                "{bad}"
+            );
+        }
+    }
+}
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::purchase 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `purchase.rs`, chưa có `qrcode`):
```text
error: could not compile `meeting-translator` (lib test) due to 64 previous errors; 1 warning emitted
error[E0422]: cannot find struct, variant or union type `Checkout` in this scope
error[E0422]: cannot find struct, variant or union type `OrderStatus` in this scope
error[E0425]: cannot find function `pending` in this scope
error[E0425]: cannot find function `poll` in this scope
error[E0425]: cannot find function `start` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 3f3c556ff739ecced870b6410186e87162201389..7d85141785861162a7c82c6fcb7761e8203f0f12 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -54,6 +54,8 @@
 # Bản quyền (kế hoạch 06): các crate 04 đã thêm (`base64`, `ed25519-dalek`, `reqwest`, `libc`) dùng chung, ở trên.
 # Ngày theo giờ máy cho hạn mức Free (license/quota.rs): múi giờ của hệ điều hành. Cùng bản `Cargo.lock` đã có.
 chrono = { version = "0.4.45", default-features = false, features = ["clock", "serde"] }
+# Vẽ mã VietQR của đơn thành SVG ngay trong app (license/purchase.rs, spec §6.8 "Mua ngay trong app"). Không kéo crate nào.
+qrcode = { version = "0.14.1", default-features = false, features = ["svg"] }
 
 [target.'cfg(target_os = "macos")'.dependencies]
 apple-native-keyring-store = { version = "1.0.2", features = ["keychain"] }
```

Sửa `src-tauri/build.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/build.rs b/src-tauri/build.rs
index d8849f35e5e58aacaf3ba0c120eec237b2462313..3434946262cce5136ddc0d07b04b639d4a375931 100644
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@ -47,6 +47,17 @@
             "delete_models_and_data",
             "dismiss_models_update",
             "verify_models",
+            "get_license",
+            "activate_license",
+            "deactivate_license",
+            "deactivate_other_device",
+            "validate_license",
+            "get_plans",
+            "start_checkout",
+            "get_pending_order",
+            "cancel_checkout",
+            "open_checkout_page",
+            "recover_license",
             "get_overlay_view",
             "hide_overlay",
             "begin_overlay_resize",
```

Sửa `src-tauri/capabilities/main.json` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/capabilities/main.json b/src-tauri/capabilities/main.json
index 236241336f232e1cc053e90aa3fe0a31f364c863..38cfcf6c19c350fbb04e8b2e7d03ceccccd93bda 100644
--- a/src-tauri/capabilities/main.json
+++ b/src-tauri/capabilities/main.json
@@ -42,6 +42,17 @@
     "allow-delete-models-and-data",
     "allow-dismiss-models-update",
     "allow-verify-models",
+    "allow-get-license",
+    "allow-activate-license",
+    "allow-deactivate-license",
+    "allow-deactivate-other-device",
+    "allow-validate-license",
+    "allow-get-plans",
+    "allow-start-checkout",
+    "allow-get-pending-order",
+    "allow-cancel-checkout",
+    "allow-open-checkout-page",
+    "allow-recover-license",
     "core:event:allow-listen",
     "core:event:allow-unlisten",
     "core:webview:allow-set-webview-zoom"
```

Sửa `src-tauri/src/commands.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/commands.rs b/src-tauri/src/commands.rs
index c41f5ebd519e0c3e90b60fa453ee1a127f23259d..c7e63efe2c72080de240e83fd99e8da17f95683d 100644
--- a/src-tauri/src/commands.rs
+++ b/src-tauri/src/commands.rs
@@ -15,6 +15,10 @@
 use crate::errors::{self, CommandError};
 use crate::glossary::{GlossaryEntry, ImportReport};
 use crate::hotkeys::HotkeyAction;
+use crate::license::app::{self as license_app, ActivateOutcome};
+use crate::license::client::PlanOffer;
+use crate::license::manager::LicenseView;
+use crate::license::purchase::CheckoutView;
 use crate::overlay::{self, placement::Edge};
 use crate::settings::Settings;
 use crate::state::{AppInfo, AppState, AppStatus, OverlayView};
@@ -222,6 +226,78 @@
 #[tauri::command]
 pub fn get_debug_sessions<R: Runtime>(app: AppHandle<R>) -> Vec<DebugSession> {
     data::debug_sessions(&app)
+}
+
+// ---- Bản quyền (kế hoạch 06, §4.3 "Bản quyền", "Nâng cấp"). Chỉ cửa sổ `main`. Lệnh gọi server là `async`. ----
+
+#[tauri::command]
+pub fn get_license<R: Runtime>(app: AppHandle<R>) -> Option<LicenseView> {
+    license_app::view(&app)
+}
+
+#[tauri::command]
+pub async fn activate_license<R: Runtime>(app: AppHandle<R>, key: String) -> Result<ActivateOutcome, CommandError> {
+    blocking(app, move |app| license_app::activate(app, &key)).await
+}
+
+#[tauri::command]
+pub async fn deactivate_license<R: Runtime>(app: AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
+    blocking(app, license_app::deactivate).await
+}
+
+/// Gỡ một máy khác của key (danh sách `409 device_limit`), với key người dùng vừa gõ.
+#[tauri::command]
+pub async fn deactivate_other_device<R: Runtime>(
+    app: AppHandle<R>,
+    key: String,
+    activation_id: String,
+) -> Result<(), CommandError> {
+    blocking(app, move |app| license_app::deactivate_other(app, &key, &activation_id)).await
+}
+
+#[tauri::command]
+pub async fn validate_license<R: Runtime>(app: AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
+    blocking(app, license_app::validate_now).await
+}
+
+#[tauri::command]
+pub async fn get_plans<R: Runtime>(app: AppHandle<R>) -> Result<Vec<PlanOffer>, CommandError> {
+    blocking(app, license_app::plans).await
+}
+
+#[tauri::command]
+pub async fn start_checkout<R: Runtime>(
+    app: AppHandle<R>,
+    plan: String,
+    email: String,
+    consent: bool,
+    renew: bool,
+) -> Result<CheckoutView, CommandError> {
+    blocking(app, move |app| {
+        license_app::start_checkout(app, &plan, &email, consent, renew)
+    })
+    .await
+}
+
+#[tauri::command]
+pub fn get_pending_order<R: Runtime>(app: AppHandle<R>) -> Option<CheckoutView> {
+    license_app::pending_order(&app)
+}
+
+#[tauri::command]
+pub fn cancel_checkout<R: Runtime>(app: AppHandle<R>) {
+    license_app::cancel_checkout(&app);
+}
+
+/// Mở trang thanh toán của đơn đang chờ bằng trình duyệt của hệ thống. Không nhận URL từ giao diện.
+#[tauri::command]
+pub fn open_checkout_page<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
+    license_app::open_checkout_page(&app)
+}
+
+#[tauri::command]
+pub async fn recover_license<R: Runtime>(app: AppHandle<R>, email: String) -> Result<(), CommandError> {
+    blocking(app, move |app| license_app::recover(app, &email)).await
 }
 
 // ---- Lệnh của cửa sổ `overlay` (§10.2): đọc phần cài đặt của nó, và chỉ đụng tới cửa sổ của chính nó. ----
@@ -293,6 +369,17 @@
     "delete_models_and_data",
     "dismiss_models_update",
     "verify_models",
+    "get_license",
+    "activate_license",
+    "deactivate_license",
+    "deactivate_other_device",
+    "validate_license",
+    "get_plans",
+    "start_checkout",
+    "get_pending_order",
+    "cancel_checkout",
+    "open_checkout_page",
+    "recover_license",
 ];
 
 /// Lệnh của cửa sổ `overlay`.
@@ -335,6 +422,17 @@
         export_glossary_csv,
         clear_all_data,
         get_debug_sessions,
+        get_license,
+        activate_license,
+        deactivate_license,
+        deactivate_other_device,
+        validate_license,
+        get_plans,
+        start_checkout,
+        get_pending_order,
+        cancel_checkout,
+        open_checkout_page,
+        recover_license,
         get_overlay_view,
         hide_overlay,
         begin_overlay_resize,
```

Sửa `src-tauri/src/license/app.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/app.rs b/src-tauri/src/license/app.rs
index 5f81307c95bf5e614b1b267a6ec13d4b6f0ceb85..3462788f07aa9ebc66607036f4530d88d3951e1d 100644
--- a/src-tauri/src/license/app.rs
+++ b/src-tauri/src/license/app.rs
@@ -11,27 +11,37 @@
 
 use std::ops::ControlFlow;
 use std::sync::Arc;
+use std::sync::atomic::{AtomicBool, Ordering};
 use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
 
 use tauri::{AppHandle, Emitter, EventTarget, Manager, Runtime};
 
-use super::client::HttpApi;
+use super::client::{Device, HttpApi, PlanOffer};
 use super::device;
 use super::keys::PublicKeys;
-use super::manager::{License, LicenseView, Machine, Zone};
+use super::manager::{License, LicenseError, LicenseView, Machine, Zone};
+use super::purchase::{self, CheckoutView, OrderOutcome};
 use super::store::Vault;
 use crate::errors::{self, CommandError};
 use crate::pro::{self, ProGate};
 use crate::security::keystore::Keystore;
 use crate::state::AppState;
-use crate::{actions, window};
+use crate::{actions, navigation, window};
 
 pub const LICENSE_CHANGED: &str = "license://changed";
+/// Kết quả mỗi lần hỏi đơn đang chờ ([`OrderOutcome`]), cho màn hình Nâng cấp.
+pub const ORDER_CHANGED: &str = "license://order";
 /// Ticker của bản quyền: cộng thời gian đơn điệu, reset Free, gọi `validate` khi tới lịch.
 const TICK_EVERY: Duration = Duration::from_secs(60);
 
 /// [`License`] của app, quản lý bằng `app.manage`.
-pub struct Licensing(pub Arc<License>);
+pub struct Licensing(pub Arc<License>, AtomicBool);
+
+impl Licensing {
+    pub fn new(license: Arc<License>) -> Self {
+        Self(license, AtomicBool::new(false))
+    }
+}
 
 /// `ProGate` theo trạng thái bản quyền thật.
 struct LicenseGate(Arc<License>);
@@ -97,12 +107,14 @@
     );
     install_with(app, license);
     spawn_ticker(app);
+    // Đơn còn chờ từ lần chạy trước (§6.8 bước 5): hỏi tiếp.
+    spawn_order_poller(app);
 }
 
 /// Cài một [`License`] đã dựng (test dùng server và kho khóa giả). Không chạy ticker.
 pub fn install_with<R: Runtime>(app: &AppHandle<R>, license: License) {
     let license = Arc::new(license);
-    app.manage(Licensing(license.clone()));
+    app.manage(Licensing::new(license.clone()));
     if license.dev_unlimited() {
         pro::install_dev_gate(app);
     } else {
@@ -201,3 +213,142 @@
         }
     });
 }
+
+fn command_error(e: LicenseError) -> CommandError {
+    CommandError::new(e.code(), None, e.to_string())
+}
+
+fn license_or_error<R: Runtime>(app: &AppHandle<R>) -> Result<Arc<License>, CommandError> {
+    licensing(app).ok_or_else(|| command_error(LicenseError::NotConfigured))
+}
+
+/// Kết quả của lệnh kích hoạt: thành công, hay key đã đủ 2 máy (giao diện hiện danh sách để gỡ một máy).
+#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
+#[serde(rename_all = "camelCase")]
+pub struct ActivateOutcome {
+    pub view: Option<LicenseView>,
+    pub devices: Option<Vec<Device>>,
+}
+
+pub fn activate<R: Runtime>(app: &AppHandle<R>, key: &str) -> Result<ActivateOutcome, CommandError> {
+    let license = license_or_error(app)?;
+    let result = license.activate(key, now());
+    refresh(app);
+    match result {
+        Ok(()) => Ok(ActivateOutcome {
+            view: Some(license.view(now())),
+            devices: None,
+        }),
+        Err(LicenseError::DeviceLimit(devices)) => Ok(ActivateOutcome {
+            view: None,
+            devices: Some(devices),
+        }),
+        Err(e) => Err(command_error(e)),
+    }
+}
+
+pub fn deactivate<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
+    let license = license_or_error(app)?;
+    let result = license.deactivate(None);
+    refresh(app);
+    result.map(|()| Some(license.view(now()))).map_err(command_error)
+}
+
+pub fn deactivate_other<R: Runtime>(app: &AppHandle<R>, key: &str, activation_id: &str) -> Result<(), CommandError> {
+    license_or_error(app)?
+        .deactivate(Some((key, activation_id)))
+        .map_err(command_error)
+}
+
+pub fn validate_now<R: Runtime>(app: &AppHandle<R>) -> Result<Option<LicenseView>, CommandError> {
+    let license = license_or_error(app)?;
+    let result = license.validate(now());
+    refresh(app);
+    result.map(|()| Some(license.view(now()))).map_err(command_error)
+}
+
+pub fn plans<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<PlanOffer>, CommandError> {
+    purchase::plans(&*license_or_error(app)?).map_err(command_error)
+}
+
+pub fn start_checkout<R: Runtime>(
+    app: &AppHandle<R>,
+    plan: &str,
+    email: &str,
+    consent: bool,
+    renew: bool,
+) -> Result<CheckoutView, CommandError> {
+    let view = purchase::start(&*license_or_error(app)?, plan, email, consent, renew).map_err(command_error)?;
+    spawn_order_poller(app);
+    Ok(view)
+}
+
+/// Đơn đang chờ, vẽ lại mã QR (mở lại màn hình Nâng cấp hay mở lại app).
+pub fn pending_order<R: Runtime>(app: &AppHandle<R>) -> Option<CheckoutView> {
+    let order = purchase::pending(&*licensing(app)?)?;
+    Some(CheckoutView {
+        order_code: order.order_code,
+        plan: order.plan,
+        amount: 0,
+        currency: String::new(),
+        expires_at: order.expires_at,
+        qr_svg: purchase::qr_svg(&order.qr_code).ok()?,
+        license_expires_at: None,
+        converted_days: None,
+    })
+}
+
+pub fn cancel_checkout<R: Runtime>(app: &AppHandle<R>) {
+    if let Some(license) = licensing(app) {
+        purchase::forget(&license);
+    }
+}
+
+pub fn open_checkout_page<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
+    let order = licensing(app)
+        .and_then(|l| purchase::pending(&l))
+        .ok_or_else(|| CommandError::new(errors::OPEN_FAILED, None, "không có đơn đang chờ"))?;
+    navigation::open_external(app, &order.checkout_url).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
+}
+
+pub fn recover<R: Runtime>(app: &AppHandle<R>, email: &str) -> Result<(), CommandError> {
+    let license = license_or_error(app)?;
+    let reply = license.api().recover(email.trim());
+    license.observe_reply(&reply);
+    reply.result.map_err(|e| command_error(super::manager::map_api(e)))
+}
+
+/// Hỏi đơn đang chờ mỗi 3 giây tới khi có kết quả cuối (§6.8 bước 4). Chỉ một luồng hỏi mỗi lúc.
+pub fn spawn_order_poller<R: Runtime>(app: &AppHandle<R>) {
+    let Some(state) = app.try_state::<Licensing>() else {
+        return;
+    };
+    if state.1.swap(true, Ordering::SeqCst) {
+        return;
+    }
+    let app = app.clone();
+    std::thread::spawn(move || {
+        loop {
+            let Some(license) = licensing(&app) else {
+                break;
+            };
+            let Some(outcome) = purchase::poll(&license, now()) else {
+                break;
+            };
+            let _ = app.emit_to(EventTarget::webview_window(window::MAIN), ORDER_CHANGED, &outcome);
+            if matches!(
+                outcome,
+                OrderOutcome::Paid { .. } | OrderOutcome::PaidButNotApplied { .. }
+            ) {
+                refresh(&app);
+            }
+            if outcome.is_final() {
+                break;
+            }
+            std::thread::sleep(Duration::from_secs(purchase::POLL_EVERY_SECS));
+        }
+        if let Some(state) = app.try_state::<Licensing>() {
+            state.1.store(false, Ordering::SeqCst);
+        }
+    });
+}
```

Sửa `src-tauri/src/license/manager.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/manager.rs b/src-tauri/src/license/manager.rs
index 9beee1297dbe5047840533a090ac5ce365bd8d4e..0f0700770445975c61b67e33643b24807d1fb7c3 100644
--- a/src-tauri/src/license/manager.rs
+++ b/src-tauri/src/license/manager.rs
@@ -182,7 +182,30 @@
     Storage(String),
     #[error("server trả lỗi {0}")]
     Server(String),
+    #[error("chưa đồng ý xử lý email")]
+    ConsentRequired,
+    #[error("email không hợp lệ")]
+    EmailInvalid,
 }
+
+/// Mọi mã lỗi của bản quyền (test của `errors.rs` kiểm đủ câu báo lỗi).
+pub const ERROR_CODES: &[&str] = &[
+    "licenseInvalidKey",
+    "licenseNotActivated",
+    "licenseNotConfigured",
+    "licenseNetwork",
+    "licenseRateLimited",
+    "licenseDeviceLimit",
+    "licenseLocked",
+    "licenseRevoked",
+    "licenseExpired",
+    "licenseDeactivated",
+    "licenseBadToken",
+    "licenseStorage",
+    "licenseServer",
+    "licenseConsentRequired",
+    "licenseEmailInvalid",
+];
 
 impl LicenseError {
     /// Mã lỗi cho giao diện (`error.<mã>` trong i18n).
@@ -201,11 +224,13 @@
             Self::BadToken(_) => "licenseBadToken",
             Self::Storage(_) => "licenseStorage",
             Self::Server(_) => "licenseServer",
+            Self::ConsentRequired => "licenseConsentRequired",
+            Self::EmailInvalid => "licenseEmailInvalid",
         }
     }
 }
 
-fn map_api(e: ApiError) -> LicenseError {
+pub(crate) fn map_api(e: ApiError) -> LicenseError {
     match e {
         ApiError::NotConfigured => LicenseError::NotConfigured,
         ApiError::Network(_) => LicenseError::Network,
@@ -902,6 +927,8 @@
     pub struct FakeApi {
         pub replies: Mutex<VecDeque<Result<Granted, ApiError>>>,
         pub deactivations: Mutex<VecDeque<Result<(), ApiError>>>,
+        pub checkouts: Mutex<VecDeque<Result<Checkout, ApiError>>>,
+        pub orders: Mutex<VecDeque<Result<OrderStatus, ApiError>>>,
         pub calls: Mutex<Vec<String>>,
         pub date: Mutex<Option<i64>>,
     }
@@ -929,15 +956,30 @@
                 date: *self.date.lock().unwrap(),
             }
         }
-        fn checkout(&self, _: &str, _: &str, _: Option<&str>) -> Reply<Checkout> {
+        fn checkout(&self, plan: &str, email: &str, key: Option<&str>) -> Reply<Checkout> {
+            self.calls
+                .lock()
+                .unwrap()
+                .push(format!("checkout {plan} {email} {}", key.unwrap_or("-")));
             Reply {
-                result: Err(ApiError::NotConfigured),
+                result: self
+                    .checkouts
+                    .lock()
+                    .unwrap()
+                    .pop_front()
+                    .unwrap_or(Err(ApiError::NotConfigured)),
                 date: None,
             }
         }
-        fn order(&self, _: i64, _: &str) -> Reply<OrderStatus> {
+        fn order(&self, code: i64, token: &str) -> Reply<OrderStatus> {
+            self.calls.lock().unwrap().push(format!("order {code} {token}"));
             Reply {
-                result: Err(ApiError::NotConfigured),
+                result: self
+                    .orders
+                    .lock()
+                    .unwrap()
+                    .pop_front()
+                    .unwrap_or(Err(ApiError::NotConfigured)),
                 date: None,
             }
         }
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index a01b60eec7d4b3136042aabe0c77245b7317f911..b4d65e298b2958c50e9359280efb5dbb3f359063 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -8,6 +8,7 @@
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 //! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
 //! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
+//! - [`purchase`]: mua, gia hạn, đổi gói ngay trong app (bảng gói, đơn, mã VietQR, hỏi trạng thái đơn).
 //! - [`quota`]: luật hạn mức của gói trả phí và của Free, chống chỉnh đồng hồ, dạng phép tính thuần.
 
 pub mod app;
```

Thêm vào `src-tauri/src/license/purchase.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
use qrcode::QrCode;
use qrcode::render::svg;
use serde::Serialize;

use super::client::{Checkout, OrderStatus, PlanOffer};
use super::manager::{License, LicenseError};
use super::store::{self, PendingOrder};

/// Mã gói được bán (spec §2).
pub const PLANS: [&str; 3] = ["pro", "pro_x2", "pro_x5"];
/// App hỏi trạng thái đơn mỗi chừng này (§6.8 bước 4).
pub const POLL_EVERY_SECS: u64 = 3;
/// Đơn đang chờ giữ thêm chừng này sau khi link hết hạn (webhook đến chậm, mở lại app vẫn hỏi lại một lần), rồi bỏ.
const KEEP_AFTER_EXPIRY_SECS: i64 = 24 * 3600;
const MAX_EMAIL_LEN: usize = 254;

/// Đơn vừa tạo, cho màn hình Nâng cấp. Không có `order_token` (chỉ phía Rust giữ).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutView {
    pub order_code: i64,
    pub plan: String,
    pub amount: i64,
    pub currency: String,
    pub expires_at: i64,
    /// Mã VietQR đã vẽ (SVG).
    pub qr_svg: String,
    pub license_expires_at: Option<i64>,
    pub converted_days: Option<i64>,
}

/// Kết quả một lần hỏi đơn, theo bảng "App hiện gì theo `status`".
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum OrderOutcome {
    /// `pending`, `processing`: hỏi tiếp.
    Waiting { order_code: i64, expires_at: i64 },
    /// `paid`: đã kích hoạt hay làm mới token; thôi hỏi.
    Paid { order_code: i64, plan: String },
    /// `underpaid`: chuyển bù cho đúng đơn trong 24 giờ, hay liên hệ hỗ trợ.
    Underpaid { order_code: i64 },
    /// `paid_needs_review`: đã nhận tiền, chờ hỗ trợ xử lý; thôi hỏi.
    NeedsReview { order_code: i64 },
    /// `refunded`: đơn đã được hoàn tiền, không có key; thôi hỏi.
    Refunded { order_code: i64 },
    /// `cancelled`, `expired`, `failed`, hay link đã hết hạn: cho tạo đơn mới; thôi hỏi.
    Failed { order_code: i64 },
    /// Đã trả tiền nhưng kích hoạt hay làm mới trên máy này lỗi (ví dụ key mới đã đủ 2 máy): báo lỗi, key vẫn có trong
    /// email.
    PaidButNotApplied { order_code: i64, code: String },
}

impl OrderOutcome {
    /// Thôi hỏi đơn này.
    pub fn is_final(&self) -> bool {
        !matches!(self, Self::Waiting { .. } | Self::Underpaid { .. })
    }
}

fn check_email(email: &str) -> Result<String, LicenseError> {
    let email = email.trim();
    let (local, domain) = email.split_once('@').ok_or(LicenseError::EmailInvalid)?;
    let ok = !local.is_empty()
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && email.len() <= MAX_EMAIL_LEN
        && !email.chars().any(|c| c.is_whitespace() || c.is_control());
    if ok {
        Ok(email.to_string())
    } else {
        Err(LicenseError::EmailInvalid)
    }
}

/// Mã VietQR (chuỗi EMVCo thô của PayOS) thành SVG.
pub fn qr_svg(data: &str) -> Result<String, LicenseError> {
    let code = QrCode::new(data.as_bytes()).map_err(|e| LicenseError::Server(format!("qr: {e}")))?;
    Ok(code
        .render::<svg::Color<'_>>()
        .min_dimensions(240, 240)
        .quiet_zone(true)
        .build())
}

fn checkout_view(c: &Checkout) -> Result<CheckoutView, LicenseError> {
    Ok(CheckoutView {
        order_code: c.order_code,
        plan: c.plan.clone(),
        amount: c.amount,
        currency: c.currency.clone(),
        expires_at: c.expires_at,
        qr_svg: qr_svg(&c.qr_code)?,
        license_expires_at: c.license_expires_at,
        converted_days: c.converted_days,
    })
}

/// Bảng gói đang bán.
pub fn plans(license: &License) -> Result<Vec<PlanOffer>, LicenseError> {
    let reply = license.api().plans();
    license.observe_reply(&reply);
    reply.result.map_err(super::manager::map_api)
}

/// Tạo đơn. `renew`: gia hạn hay đổi gói key đang có (cần đã kích hoạt). Thiếu ô đồng ý thì từ chối, không gọi server
/// (§10.1).
pub fn start(
    license: &License,
    plan: &str,
    email: &str,
    consent: bool,
    renew: bool,
) -> Result<CheckoutView, LicenseError> {
    if !consent {
        return Err(LicenseError::ConsentRequired);
    }
    if !PLANS.contains(&plan) {
        return Err(LicenseError::Server("plan".into()));
    }
    let email = check_email(email)?;
    let key = if renew {
        Some(license.license_key().ok_or(LicenseError::NotActivated)?)
    } else {
        None
    };
    let reply = license.api().checkout(plan, &email, key.as_deref());
    license.observe_reply(&reply);
    let checkout = reply.result.map_err(super::manager::map_api)?;
    let view = checkout_view(&checkout)?;
    let pending = PendingOrder {
        order_code: checkout.order_code,
        order_token: checkout.order_token,
        plan: checkout.plan,
        expires_at: checkout.expires_at,
        renewal: renew,
        checkout_url: checkout.checkout_url,
        qr_code: checkout.qr_code,
    };
    store::write(license.vault(), store::ORDER, &pending).map_err(|e| LicenseError::Storage(e.to_string()))?;
    Ok(view)
}

/// Đơn đang chờ (nếu có).
pub fn pending(license: &License) -> Option<PendingOrder> {
    store::read(license.vault(), store::ORDER).ok().flatten()
}

/// Bỏ đơn đang chờ (người dùng đóng màn hình thanh toán, hay đơn đã xong).
pub fn forget(license: &License) {
    let _ = store::delete(license.vault(), store::ORDER);
}

/// Hỏi đơn đang chờ một lần, áp kết quả. `None`: không có đơn nào.
pub fn poll(license: &License, now: i64) -> Option<OrderOutcome> {
    let order = pending(license)?;
    let code = order.order_code;
    let reply = license.api().order(code, &order.order_token);
    license.observe_reply(&reply);
    let outcome = match reply.result {
        Ok(status) => apply(license, &order, &status, now),
        Err(e) => {
            log::info!("chưa hỏi được đơn: {e}");
            if now > order.expires_at + KEEP_AFTER_EXPIRY_SECS {
                OrderOutcome::Failed { order_code: code }
            } else {
                OrderOutcome::Waiting {
                    order_code: code,
                    expires_at: order.expires_at,
                }
            }
        }
    };
    if outcome.is_final() {
        forget(license);
    }
    Some(outcome)
}

fn apply(license: &License, order: &PendingOrder, status: &OrderStatus, now: i64) -> OrderOutcome {
    let code = order.order_code;
    match status.status.as_str() {
        "paid" => {
            let result = match (status.grant_kind.as_deref(), &status.license_key) {
                // Key mới (đơn mới, hay hỗ trợ cấp key mới cho đơn gia hạn của license đã thu hồi): kích hoạt key này.
                (Some("new"), Some(key)) => license.activate(key, now),
                (_, _) if order.renewal => license.validate(now),
                (_, Some(key)) => license.activate(key, now),
                _ => Err(LicenseError::Server("paid_without_key".into())),
            };
            match result {
                Ok(()) => OrderOutcome::Paid {
                    order_code: code,
                    plan: status.license_plan.clone().unwrap_or_else(|| status.plan.clone()),
                },
                Err(e) => OrderOutcome::PaidButNotApplied {
                    order_code: code,
                    code: e.code().into(),
                },
            }
        }
        "underpaid" => OrderOutcome::Underpaid { order_code: code },
        "paid_needs_review" => OrderOutcome::NeedsReview { order_code: code },
        "refunded" => OrderOutcome::Refunded { order_code: code },
        "pending" | "processing" if now <= order.expires_at => OrderOutcome::Waiting {
            order_code: code,
            expires_at: order.expires_at,
        },
        _ => OrderOutcome::Failed { order_code: code },
    }
}
```

Sửa `src-tauri/src/license/store.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/store.rs b/src-tauri/src/license/store.rs
index 454d5a6bcd182a89df80413b06ebfc0621995bce..90e56073a7c4edfdd82091b19fdfd7ba309785f1 100644
--- a/src-tauri/src/license/store.rs
+++ b/src-tauri/src/license/store.rs
@@ -91,6 +91,10 @@
     pub expires_at: i64,
     /// Đơn gia hạn hay đổi gói (có `license_key`): khi đã trả tiền thì `validate`, không `activate`.
     pub renewal: bool,
+    /// Trang thanh toán của PayOS, để mở lại bằng trình duyệt (không nhận URL từ giao diện).
+    pub checkout_url: String,
+    /// Chuỗi VietQR thô, để vẽ lại mã QR khi mở lại màn hình Nâng cấp.
+    pub qr_code: String,
 }
 
 fn short_hash(parts: &[&str]) -> String {
```

Sửa `src-tauri/src/navigation.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/navigation.rs b/src-tauri/src/navigation.rs
index 5e11d4e441e469af025ee33280a8a543c2550744..6790a722a66b57f861e7dfafd0e959a0214d87f9 100644
--- a/src-tauri/src/navigation.rs
+++ b/src-tauri/src/navigation.rs
@@ -20,7 +20,10 @@
 
 /// Tên miền được mở bằng trình duyệt. Kế hoạch 06 thêm trang thanh toán của PayOS, kế hoạch 07 thêm
 /// website của sản phẩm (tên miền chờ Q1). Chỉ so khớp đúng cả tên miền, không nhận tên miền con.
-pub const EXTERNAL_HOSTS: &[&str] = &[];
+pub const EXTERNAL_HOSTS: &[&str] = &[
+    // Trang thanh toán của PayOS (`checkout_url` của đơn, kế hoạch 06; spec §6.8 "Mua ngay trong app" bước 2).
+    "pay.payos.vn",
+];
 
 #[derive(Clone, Copy, Debug, PartialEq, Eq)]
 pub enum Decision {
@@ -111,6 +114,20 @@
             false
         }
     }
+}
+
+/// Mở một URL do phía Rust giữ (ví dụ trang thanh toán của đơn, kế hoạch 06) bằng trình duyệt, chỉ khi URL đó là link
+/// ngoài được phép (`EXTERNAL_HOSTS`, `https`). Còn lại thì từ chối và ghi log.
+pub fn open_external<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
+    let parsed = Url::parse(url).map_err(|e| e.to_string())?;
+    if decide(&parsed, CURRENT_OS, None, EXTERNAL_HOSTS) != Decision::OpenExternal {
+        log::warn!(
+            "không mở {}: không nằm trong danh sách cho phép",
+            parsed.origin().ascii_serialization()
+        );
+        return Err("không nằm trong danh sách cho phép".into());
+    }
+    system::open_external_url(app, parsed.as_str())
 }
 
 /// Plugin kiểm mọi lần điều hướng của mọi webview.
```

Sửa `src/i18n/en.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/en.ts b/src/i18n/en.ts
index 0b4a0f07859b7bbb2387bf7ab6dae7d6f23a9c52..0eb54209adecde66ac1f952e92c2494f2319c840 100644
--- a/src/i18n/en.ts
+++ b/src/i18n/en.ts
@@ -320,6 +320,21 @@
   "error.fileFailed": "Could not read or write that file. Choose another place and try again.",
   "error.fileTooLarge": "This file is too large. A glossary file is at most 1 MB.",
   "error.copyFailed": "Could not copy to the clipboard.",
+  "error.licenseInvalidKey": "This key is not valid. Check it for typos.",
+  "error.licenseNotActivated": "No license key is activated on this computer.",
+  "error.licenseNotConfigured": "This build cannot reach the license server.",
+  "error.licenseNetwork": "Could not reach the license server. Check your internet connection and try again.",
+  "error.licenseRateLimited": "Too many attempts. Please try again later.",
+  "error.licenseDeviceLimit": "This key is already active on 2 computers. Remove one of them to use it here.",
+  "error.licenseLocked": "This key is temporarily locked because computers were changed too often. Please contact support.",
+  "error.licenseRevoked": "This license has been revoked. Please contact support.",
+  "error.licenseExpired": "This license has expired. Renew it to keep using Pro features.",
+  "error.licenseDeactivated": "This computer was removed from the license. Activate the key again to use it here.",
+  "error.licenseBadToken": "The license server sent an invalid reply. Please try again later.",
+  "error.licenseStorage": "Could not save the license on this computer. If the system asked for keychain access, allow it and try again.",
+  "error.licenseServer": "The license server could not complete the request. Please try again later.",
+  "error.licenseConsentRequired": "Please agree to the processing of your email to continue.",
+  "error.licenseEmailInvalid": "This email address is not valid.",
   "error.unknown": "Something went wrong.",
 } as const;
 
```

Sửa `src/i18n/vi.ts` (áp bằng `git apply`):

```diff
diff --git a/src/i18n/vi.ts b/src/i18n/vi.ts
index b650f397097429692157afa5b2b4c2a12edd5db3..30c99efbec3cc062ea8ec6e0d380a75658d0875e 100644
--- a/src/i18n/vi.ts
+++ b/src/i18n/vi.ts
@@ -320,5 +320,20 @@
   "error.fileFailed": "Không đọc hay ghi được file đó. Hãy chọn chỗ khác rồi thử lại.",
   "error.fileTooLarge": "File này quá lớn. File từ điển tối đa 1 MB.",
   "error.copyFailed": "Không sao chép được vào clipboard.",
+  "error.licenseInvalidKey": "Key này không đúng. Kiểm lại xem có gõ sai không.",
+  "error.licenseNotActivated": "Máy này chưa kích hoạt key nào.",
+  "error.licenseNotConfigured": "Bản cài này chưa kết nối được máy chủ bản quyền.",
+  "error.licenseNetwork": "Không kết nối được máy chủ bản quyền. Kiểm tra mạng rồi thử lại.",
+  "error.licenseRateLimited": "Thử quá nhiều lần. Vui lòng thử lại sau.",
+  "error.licenseDeviceLimit": "Key này đã kích hoạt trên 2 máy. Gỡ một máy để dùng ở máy này.",
+  "error.licenseLocked": "Key này đang bị khóa tạm vì đổi máy quá nhiều lần. Vui lòng liên hệ hỗ trợ.",
+  "error.licenseRevoked": "License này đã bị thu hồi. Vui lòng liên hệ hỗ trợ.",
+  "error.licenseExpired": "License này đã hết hạn. Gia hạn để tiếp tục dùng tính năng Pro.",
+  "error.licenseDeactivated": "Máy này đã bị gỡ khỏi key. Kích hoạt lại key để dùng ở máy này.",
+  "error.licenseBadToken": "Máy chủ bản quyền trả kết quả không hợp lệ. Vui lòng thử lại sau.",
+  "error.licenseStorage": "Không lưu được bản quyền trên máy. Nếu hệ thống hỏi quyền truy cập kho khóa, hãy cho phép rồi thử lại.",
+  "error.licenseServer": "Máy chủ bản quyền chưa xử lý được yêu cầu. Vui lòng thử lại sau.",
+  "error.licenseConsentRequired": "Vui lòng đồng ý cho xử lý email để tiếp tục.",
+  "error.licenseEmailInvalid": "Địa chỉ email không hợp lệ.",
   "error.unknown": "Có lỗi xảy ra.",
 };
```

Bản cargo chọn:

Run:
```bash
cargo metadata --format-version 1 >/dev/null 2>&1 && grep -A1 -E '^name = "(qrcode)"' Cargo.lock | grep -v '^--'
```
Expected (lúc lập kế hoạch):
```text
name = "qrcode"
version = "0.14.1"
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::purchase -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::purchase::tests::a_checkout_needs_consent_a_valid_email_and_a_paid_plan ... ok
test license::purchase::tests::a_new_order_draws_the_qr_and_is_kept_for_polling ... ok
test license::purchase::tests::a_paid_new_order_activates_its_key_on_this_machine ... ok
test license::purchase::tests::a_paid_order_whose_key_cannot_be_activated_here_reports_why ... ok
test license::purchase::tests::a_paid_renewal_validates_unless_support_granted_a_new_key ... ok
test license::purchase::tests::other_order_states_end_or_continue_polling_as_the_contract_says ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 391 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib checkout_page -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::the_checkout_page_opens_only_for_the_pending_payos_order ... ok
test navigation::tests::the_payos_checkout_page_is_the_only_external_host ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 395 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib full_key -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test app_tests::activating_a_full_key_returns_its_devices ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 396 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib payos_checkout -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test navigation::tests::the_payos_checkout_page_is_the_only_external_host ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 396 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib acl_tests -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test acl_tests::capabilities_grant_exactly_the_fixed_lists ... ok
test acl_tests::each_window_only_reaches_its_own_commands ... ok
test acl_tests::outside_effects_only_reach_the_fake_opener ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 394 filtered out
```

Run:
```bash
cargo test -p meeting-translator --lib every_error_code -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test errors::tests::every_error_code_has_ui_text ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 396 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 394 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) '
```
Expected (lúc lập kế hoạch):
```text
 Test Files  12 passed (12)
      Tests  115 passed (115)
```

Run:
```bash
pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch):
```text
build ok
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/build.rs \
  src-tauri/capabilities/main.json \
  src-tauri/src/app_tests.rs \
  src-tauri/src/commands.rs \
  src-tauri/src/errors.rs \
  src-tauri/src/license/app.rs \
  src-tauri/src/license/manager.rs \
  src-tauri/src/license/mod.rs \
  src-tauri/src/license/purchase.rs \
  src-tauri/src/license/store.rs \
  src-tauri/src/navigation.rs \
  src/i18n/en.ts \
  src/i18n/vi.ts
git commit -m "feat(app): mua, gia hạn, đổi gói bằng VietQR ngay trong app, lệnh bản quyền cho cửa sổ chính (§6.8, §4.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 10: App tự kiểm chữ ký của bản cài (`license/genuine.rs`)

Spec §10.2 "Sửa hoặc ký lại file của app". QĐ26.

- macOS: `SecStaticCodeCheckValidity` (qua `security-framework`, đã có trong cây qua `native-tls`) trên gói `.app` đang chạy, kiểm cả code lồng bên trong, yêu cầu `anchor apple generic and certificate leaf[subject.OU] = "<Team ID>"`.
- Windows: `WinVerifyTrust` trên file `.exe` đang chạy, rồi so tên chủ chứng thư của người ký (`CertGetNameStringW`). Chỉ kiểm biên dịch trên Mac.
- Team ID và tên chủ chứng thư thật chờ tài khoản (T1, T2): 07 đặt `AI_TRANSLATOR_TEAM_ID`, `AI_TRANSLATOR_SIGNER` lúc build trong CI. Bản phát hành thiếu biến này thì không chính hãng (chỉ Free); bản debug bỏ qua.
- Ticker kiểm lúc khởi động, trước lần `validate` đầu; không chính hãng thì `Standing::NotGenuine`, chỉ Free.
- Test trên Mac thật (không cần quyền): `/bin/ls` qua yêu cầu `anchor apple`, không qua yêu cầu Team ID; file không ký thì lỗi.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/license/app.rs`
- Create: `src-tauri/src/license/genuine.rs`
- Modify: `src-tauri/src/license/mod.rs`
- Modify: `Cargo.lock` (cargo tự cập nhật; Step 3 khóa đúng bản đã thử)

- [ ] **Step 1: Viết test trước**

Tạo `src-tauri/src/license/genuine.rs`, lúc này mới có phần test:

```rust
//! App tự kiểm chữ ký số của chính nó lúc khởi động (spec §10.2, "Sửa hoặc ký lại file của app"):
//! - macOS: `SecStaticCodeCheckValidity` trên gói `.app` đang chạy, kiểm cả code lồng bên trong (tiến trình phụ, dylib),
//!   với yêu cầu chứng thư Developer ID của đúng Team ID;
//! - Windows: `WinVerifyTrust` trên file `.exe` đang chạy, rồi so tên chủ chứng thư của người ký. Cần Windows để thử.
//!
//! Chữ ký không hợp lệ thì app chỉ chạy Free và báo "Bản cài không chính hãng" kèm link tải chính thức. Bản debug bỏ qua
//! bước này. Team ID và tên chủ chứng thư thật chờ tài khoản (T1, T2): kế hoạch 07 đặt biến môi trường lúc build trong CI
//! (`AI_TRANSLATOR_TEAM_ID`, `AI_TRANSLATOR_SIGNER`). Bản phát hành build thiếu biến này thì coi là không chính hãng
//! (quên cấu hình thì khóa, không mở cho không).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_team_requirement_only_takes_a_real_team_id() {
        assert_eq!(
            team_requirement("ABCDE12345").as_deref(),
            Some("anchor apple generic and certificate leaf[subject.OU] = \"ABCDE12345\"")
        );
        assert_eq!(team_requirement("abc\" or true"), None);
        assert_eq!(team_requirement(""), None);
        if cfg!(debug_assertions) {
            assert_eq!(check_this_build(), Genuineness::Skipped, "bản debug bỏ qua");
        } else if TEAM_ID.is_none() && SIGNER.is_none() {
            // Bản phát hành build thiếu Team ID (chưa qua CI của 07): không chính hãng, chỉ chạy Free.
            assert!(matches!(check_this_build(), Genuineness::NotGenuine(_)));
        }
    }

    /// Trên máy thật, không cần quyền gì: `/bin/ls` do Apple ký nên qua yêu cầu `anchor apple`, nhưng không qua yêu cầu
    /// Team ID của một nhà phát triển; file không ký thì lỗi.
    #[cfg(target_os = "macos")]
    #[test]
    fn signatures_are_checked_against_the_requirement() {
        use std::path::Path;
        let ls = Path::new("/bin/ls");
        platform::check_path(ls, "anchor apple").unwrap();
        assert!(platform::check_path(ls, &team_requirement("ABCDE12345").unwrap()).is_err());
        let unsigned = std::env::temp_dir().join(format!("mt-unsigned-{}", std::process::id()));
        std::fs::write(&unsigned, b"#!/bin/sh\necho hi\n").unwrap();
        assert!(platform::check_path(&unsigned, "anchor apple").is_err());
        std::fs::remove_file(unsigned).unwrap();
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index b4d65e298b2958c50e9359280efb5dbb3f359063..0d1e65154762a72d0816a3ad127b1b65800c60ee 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -14,6 +14,7 @@
 pub mod app;
 pub mod client;
 pub mod device;
+pub mod genuine;
 pub mod key;
 pub mod keys;
 pub mod manager;
```

- [ ] **Step 2: Chạy test, thấy đỏ**

Run:
```bash
cargo test -p meeting-translator --lib license::genuine 2>&1 | grep -E '^error(\[E[0-9]+\])?:' | sort -u | head -6
```
Expected (lúc lập kế hoạch; chưa có phần code của `genuine.rs`):
```text
error: could not compile `meeting-translator` (lib test) due to 13 previous errors; 1 warning emitted
error[E0425]: cannot find function `check_this_build` in this scope
error[E0425]: cannot find function `team_requirement` in this scope
error[E0425]: cannot find value `SIGNER` in this scope
error[E0425]: cannot find value `TEAM_ID` in this scope
error[E0433]: cannot find module or crate `platform` in this scope
```

- [ ] **Step 3: Viết code**

Sửa `src-tauri/Cargo.toml` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
index 7d85141785861162a7c82c6fcb7761e8203f0f12..8bce8fe4d0ab3457ed7428ab47ce8c799cbe6283 100644
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@ -58,6 +58,10 @@
 qrcode = { version = "0.14.1", default-features = false, features = ["svg"] }
 
 [target.'cfg(target_os = "macos")'.dependencies]
+# Bản quyền (kế hoạch 06): app tự kiểm chữ ký của gói `.app` (`SecStaticCodeCheckValidity`, license/genuine.rs, §10.2).
+# Cùng bản `native-tls` đang kéo vào.
+core-foundation = "0.10.1"
+security-framework = "3.7.0"
 apple-native-keyring-store = { version = "1.0.2", features = ["keychain"] }
 objc2 = "0.6.4"
 objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSString", "NSURL"] }
@@ -69,6 +73,10 @@
     "Win32_Foundation",
     "Win32_Storage_FileSystem",
     "Win32_System_LibraryLoader",
+    "Win32_Security_Cryptography",
+    "Win32_Security_Cryptography_Catalog",
+    "Win32_Security_Cryptography_Sip",
+    "Win32_Security_WinTrust",
     "Win32_System_Registry",
     "Win32_System_SystemInformation",
     "Win32_UI_WindowsAndMessaging",
```

Sửa `src-tauri/src/license/app.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/app.rs b/src-tauri/src/license/app.rs
index 3462788f07aa9ebc66607036f4530d88d3951e1d..cb4f101bacf2b9183ce1097515d284031c4a4478 100644
--- a/src-tauri/src/license/app.rs
+++ b/src-tauri/src/license/app.rs
@@ -196,6 +196,15 @@
 fn spawn_ticker<R: Runtime>(app: &AppHandle<R>) {
     let app = app.clone();
     std::thread::spawn(move || {
+        // Kiểm chữ ký của bản cài trước (§10.2); không chính hãng thì chỉ chạy Free.
+        let genuine = super::genuine::check_this_build();
+        if let super::genuine::Genuineness::NotGenuine(why) = &genuine {
+            log::error!("bản cài không chính hãng: {why}");
+        }
+        if let Some(license) = licensing(&app) {
+            license.set_genuine(!matches!(genuine, super::genuine::Genuineness::NotGenuine(_)));
+        }
+        refresh(&app);
         // Lúc khởi động: kiểm ngay (§6.8, "Kiểm tra định kỳ").
         validate_if_due(&app);
         let mut last = Instant::now();
```

Thêm vào `src-tauri/src/license/genuine.rs` (phần code, nằm giữa các dòng `//!` đầu file và khối `#[cfg(test)] mod tests`):

```rust
/// Team ID của Apple Developer, đặt lúc build bản phát hành (kế hoạch 07).
pub const TEAM_ID: Option<&str> = option_env!("AI_TRANSLATOR_TEAM_ID");
/// Tên chủ chứng thư ký mã trên Windows, đặt lúc build bản phát hành (kế hoạch 07).
pub const SIGNER: Option<&str> = option_env!("AI_TRANSLATOR_SIGNER");

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Genuineness {
    Genuine,
    /// Kèm lý do, chỉ để ghi log.
    NotGenuine(String),
    /// Bản debug không kiểm.
    Skipped,
}

/// Yêu cầu chữ ký của macOS cho một Team ID: chứng thư Developer ID do Apple cấp, đúng Team ID.
pub fn team_requirement(team_id: &str) -> Option<String> {
    let ok = team_id.len() == 10 && team_id.bytes().all(|b| b.is_ascii_uppercase() || b.is_ascii_digit());
    ok.then(|| format!("anchor apple generic and certificate leaf[subject.OU] = \"{team_id}\""))
}

/// Kiểm bản đang chạy.
pub fn check_this_build() -> Genuineness {
    if cfg!(debug_assertions) {
        return Genuineness::Skipped;
    }
    platform::check_self()
}

#[cfg(target_os = "macos")]
pub mod platform {
    use std::path::Path;
    use std::str::FromStr;

    use core_foundation::url::CFURL;
    use security_framework::os::macos::code_signing::{Flags, SecCode, SecRequirement, SecStaticCode};

    use super::{Genuineness, TEAM_ID, team_requirement};

    /// Kiểm chữ ký của code ở `path` (file thực thi hay gói `.app`) theo `requirement` (cú pháp của `codesign`).
    pub fn check_path(path: &Path, requirement: &str) -> Result<(), String> {
        let requirement = SecRequirement::from_str(requirement).map_err(|e| format!("yêu cầu sai: {e}"))?;
        let url = CFURL::from_path(path, path.is_dir()).ok_or("đường dẫn không hợp lệ")?;
        let code = SecStaticCode::from_path(&url, Flags::NONE).map_err(|e| e.to_string())?;
        code.check_validity(Flags::CHECK_NESTED_CODE | Flags::STRICT_VALIDATE, &requirement)
            .map_err(|e| e.to_string())
    }

    pub fn check_self() -> Genuineness {
        let Some(requirement) = TEAM_ID.and_then(team_requirement) else {
            return Genuineness::NotGenuine("bản phát hành thiếu Team ID".into());
        };
        let path = match SecCode::for_self(Flags::NONE).and_then(|c| c.path(Flags::NONE)) {
            Ok(url) => url.to_path(),
            Err(e) => return Genuineness::NotGenuine(e.to_string()),
        };
        let Some(path) = path else {
            return Genuineness::NotGenuine("không biết đường dẫn của app".into());
        };
        match check_path(&path, &requirement) {
            Ok(()) => Genuineness::Genuine,
            Err(e) => Genuineness::NotGenuine(e),
        }
    }
}

#[cfg(windows)]
pub mod platform {
    use windows::Win32::Foundation::{HANDLE, HWND};
    use windows::Win32::Security::Cryptography::{CERT_NAME_SIMPLE_DISPLAY_TYPE, CertGetNameStringW};
    use windows::Win32::Security::WinTrust::{
        WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0, WINTRUST_FILE_INFO, WTD_CHOICE_FILE,
        WTD_REVOKE_NONE, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE, WTHelperGetProvSignerFromChain,
        WTHelperProvDataFromStateData, WinVerifyTrust,
    };
    use windows::core::PCWSTR;

    use super::{Genuineness, SIGNER};

    /// Kiểm chữ ký Authenticode của file và trả tên chủ chứng thư của người ký.
    pub fn signer_of(path: &std::path::Path) -> Result<String, String> {
        let wide: Vec<u16> = path.as_os_str().encode_wide_null();
        let mut file = WINTRUST_FILE_INFO {
            cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
            pcwszFilePath: PCWSTR(wide.as_ptr()),
            hFile: HANDLE::default(),
            pgKnownSubject: std::ptr::null_mut(),
        };
        let mut data = WINTRUST_DATA {
            cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
            dwUIChoice: WTD_UI_NONE,
            fdwRevocationChecks: WTD_REVOKE_NONE,
            dwUnionChoice: WTD_CHOICE_FILE,
            Anonymous: WINTRUST_DATA_0 { pFile: &mut file },
            dwStateAction: WTD_STATEACTION_VERIFY,
            ..Default::default()
        };
        let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
        // SAFETY: `file`, `wide`, `data` sống tới hết hàm; đóng trạng thái bằng `WTD_STATEACTION_CLOSE` ở dưới.
        let status = unsafe { WinVerifyTrust(HWND::default(), &mut action, (&mut data as *mut WINTRUST_DATA).cast()) };
        let name = if status == 0 {
            // SAFETY: trạng thái hợp lệ sau `WTD_STATEACTION_VERIFY` thành công; con trỏ do wintrust quản lý.
            unsafe {
                let provider = WTHelperProvDataFromStateData(data.hWVTStateData);
                let signer = WTHelperGetProvSignerFromChain(provider, 0, false, 0);
                if signer.is_null() || (*signer).csCertChain == 0 {
                    Err("không có người ký".to_string())
                } else {
                    let cert = (*(*signer).pasCertChain).pCert;
                    let mut buf = [0u16; 256];
                    let n = CertGetNameStringW(cert, CERT_NAME_SIMPLE_DISPLAY_TYPE, 0, None, Some(&mut buf));
                    Ok(String::from_utf16_lossy(&buf[..(n as usize).saturating_sub(1)]))
                }
            }
        } else {
            Err(format!("WinVerifyTrust trả 0x{status:08x}"))
        };
        data.dwStateAction = WTD_STATEACTION_CLOSE;
        // SAFETY: đóng trạng thái đã mở ở trên.
        let _ = unsafe { WinVerifyTrust(HWND::default(), &mut action, (&mut data as *mut WINTRUST_DATA).cast()) };
        name
    }

    trait EncodeWideNull {
        fn encode_wide_null(&self) -> Vec<u16>;
    }

    impl EncodeWideNull for std::ffi::OsStr {
        fn encode_wide_null(&self) -> Vec<u16> {
            use std::os::windows::ffi::OsStrExt;
            self.encode_wide().chain([0]).collect()
        }
    }

    pub fn check_self() -> Genuineness {
        let Some(expected) = SIGNER else {
            return Genuineness::NotGenuine("bản phát hành thiếu tên người ký".into());
        };
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(e) => return Genuineness::NotGenuine(e.to_string()),
        };
        match signer_of(&exe) {
            Ok(name) if name == expected => Genuineness::Genuine,
            Ok(name) => Genuineness::NotGenuine(format!("người ký khác: {name}")),
            Err(e) => Genuineness::NotGenuine(e),
        }
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
pub mod platform {
    use super::Genuineness;

    pub fn check_self() -> Genuineness {
        Genuineness::NotGenuine("chỉ hỗ trợ macOS và Windows".into())
    }
}
```

Sửa `src-tauri/src/license/mod.rs` (áp bằng `git apply`):

```diff
diff --git a/src-tauri/src/license/mod.rs b/src-tauri/src/license/mod.rs
index 0d1e65154762a72d0816a3ad127b1b65800c60ee..2fe8da4918ddce15dd955675f1905108be11a506 100644
--- a/src-tauri/src/license/mod.rs
+++ b/src-tauri/src/license/mod.rs
@@ -5,6 +5,7 @@
 //! - [`app`]: nối vào app: điểm kiểm tra Pro thật, hạn mức của phiên, lịch `validate`, sự kiện cho giao diện.
 //! - [`client`]: gọi license server (`LicenseApi`, bản thật [`client::HttpApi`]).
 //! - [`device`]: `device_id_hash` và tên máy gửi cho server.
+//! - [`genuine`]: app tự kiểm chữ ký số của chính nó (§10.2).
 //! - [`key`]: chuẩn hóa và kiểm ký tự kiểm tra của license key người dùng gõ.
 //! - [`store`]: bản ghi trong kho khóa (key, token, bộ đếm, bản ghi đánh dấu, đơn đang chờ).
 //! - [`manager`]: trạng thái bản quyền và hạn mức của máy này: kích hoạt, làm mới, gỡ, đếm phút, lịch `validate`.
```

- [ ] **Step 4: Chạy test, thấy xanh**

Run:
```bash
cargo test -p meeting-translator --lib license::genuine -- --test-threads=1 2>&1 | grep -E '^test |^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test license::genuine::tests::signatures_are_checked_against_the_requirement ... ok
test license::genuine::tests::the_team_requirement_only_takes_a_real_team_id ... ok
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 397 filtered out
```

Run:
```bash
cargo test -p meeting-translator 2>&1 | grep -m1 '^test result' | sed 's/; finished in .*//'
```
Expected (lúc lập kế hoạch):
```text
test result: ok. 396 passed; 0 failed; 3 ignored; 0 measured; 0 filtered out
```

- [ ] **Step 5: Định dạng, clippy và các kiểm tra khác**

Run:
```bash
cargo fmt --all -- --check && cargo clippy -p meeting-translator --all-targets -q -- -D warnings && echo clippy ok
```
Expected (lúc lập kế hoạch):
```text
clippy ok
```

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```

- [ ] **Step 6: Commit**

```bash
git add Cargo.lock \
  src-tauri/Cargo.toml \
  src-tauri/src/license/app.rs \
  src-tauri/src/license/genuine.rs \
  src-tauri/src/license/mod.rs
git commit -m "feat(app): app tự kiểm chữ ký số của bản cài, không chính hãng thì chỉ chạy Free (§10.2)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


## Task 11: Kiểm tra chuẩn sau 06a

Kiểm cả workspace trước khi sang 06b. Không có commit. Đủ khối lệnh của mục 6.2 của kế hoạch 00 chạy ở 06b Task 5.

- [ ] **Step 1: Định dạng, clippy, test của cả workspace**

Run:
```bash
cargo fmt --all -- --check && cargo clippy --workspace --all-targets -q -- -D warnings 2>&1 | grep -E '^error' | head -3; echo "clippy: ${PIPESTATUS[0]}"
```
Expected (lúc lập kế hoạch):
```text
clippy: 0
```

Run:
```bash
cargo test --workspace 2>&1 | grep -E '^test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
```
Expected (lúc lập kế hoạch; trên cây đầu `5f48558` là 663 test qua, 0 lỗi, 13 bỏ qua):
```text
passed 751 failed 0 ignored 13
```

- [ ] **Step 2: `cargo deny`, `cargo audit`, giao diện, kiểm code Windows**

Run:
```bash
cargo deny check 2>&1 | tail -1
```
Expected (lúc lập kế hoạch):
```text
advisories ok, bans ok, licenses ok, sources ok
```

Run:
```bash
cargo audit 2>&1 | grep -E '^(error|warning):' | grep -v 'is locked'
```
Expected (lúc lập kế hoạch; cùng ba cảnh báo đã được cho phép như trước 06, không có cảnh báo mới):
```text
warning: 3 allowed warnings found
```

Run:
```bash
NO_COLOR=1 pnpm test 2>&1 | grep -E '^ +(Test Files|Tests) ' && pnpm build >/dev/null 2>&1 && echo build ok
```
Expected (lúc lập kế hoạch; trên cây đầu `5f48558` là 115 test trong 12 file):
```text
 Test Files  12 passed (12)
      Tests  115 passed (115)
build ok
```

Run:
```bash
./scripts/check-windows.sh -q && echo check-windows ok
```
Expected (lúc lập kế hoạch):
```text
check-windows ok
```
