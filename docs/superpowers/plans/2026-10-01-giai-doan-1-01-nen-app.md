# Giai đoạn 1 · 01: Nền app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Biến app spike S5 thành khung app thật, để các kế hoạch sau chỉ việc lắp chức năng vào:
- cài đặt có số phiên bản schema và bước migrate (§6.9), lưu bằng `tauri-plugin-store`;
- i18n vi/en cho giao diện (en là nguồn chuẩn) và bảng chuỗi phía Rust cho khay (§4.5);
- khay hệ thống (menu bar trên Mac), phím tắt toàn cục đổi được (F10), chỉ chạy một bản (Q7), khởi động cùng hệ thống (Đ19);
- hai cửa sổ `main` và `overlay` với quyền riêng (§10.2):
  - thanh phụ đề giữ hành vi của S5, ẩn lúc khởi động, hiện khi bắt đầu phiên (§4.2);
  - thêm khóa và ẩn/hiện từ khay, nhớ vị trí theo từng màn hình;
  - link ngoài không mở trong webview mà mở bằng trình duyệt của hệ thống (§10.2);
- đóng cửa sổ chỉ ẩn xuống khay; `⌘Q` và Quit ở Dock không thoát (app hiện lời nhắc thoát ở menu bar), nhưng không cản đăng xuất hay tắt máy (§4.3);
- wrapper kho khóa của hệ điều hành (Đ5), log ra file có xoay vòng (Đ10);
- khung các màn hình ở §4.3 và các bước lần đầu mở ở §4.1, store Zustand nhận sự kiện.

**Kiến trúc:**
- `src-tauri` tách thành lib `meeting_translator_lib` và `main.rs` mỏng.
- Logic thuần nằm trong module riêng có unit test, không cần mở cửa sổ: cài đặt và migrate, phím tắt (cả luật đổi phím với bộ đăng ký giả), chuỗi Rust, vị trí thanh phụ đề, chặn thoát, điều hướng, trạng thái khởi động cùng hệ thống, kho khóa, mã lỗi, nội dung menu khay.
- Phần nối với Tauri (lệnh, sự kiện, khay, cửa sổ) nằm trong `actions.rs`, `commands.rs`, `tray.rs`, `window.rs`, `overlay/`. Phần này test bằng `MockRuntime`: ACL thật của từng cửa sổ, và hành vi qua lệnh `invoke`.
- Giao diện: store Zustand dựng trên một lớp `Ipc` mỏng, test bằng bản giả; i18n là từ điển có kiểu, không thêm thư viện; điều hướng bằng store.
- Phiên dịch trong kế hoạch này là phiên tạm (`session_stub.rs`), chỉ đổi trạng thái, hiện thanh phụ đề và phát phụ đề mẫu; kế hoạch 02 thay bằng `session.rs`.

**Công nghệ:** Giữ Tauri 2.12, React 19.3, Vite 8.3, TypeScript 7.0, Rust 1.98.1 của Giai đoạn 0. Thêm:
- các plugin Tauri 2 chính thức: store, single-instance, autostart, opener, log;
- `keyring-core` cùng hai store gốc của hệ điều hành;
- `objc2-foundation` và `objc2-service-management` (macOS), `windows` (Windows), `sys-locale`, `log`;
- Zustand 5 và Vitest 5 ở phía giao diện.

Chi tiết ở bảng "Phiên bản đã chốt".

Tổng quan: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md` (mục 2.1, 6, 8, 9). Spec: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`. Kế hoạch spike S5: `docs/superpowers/plans/2026-09-29-giai-doan-0-05-s5-thanh-phu-de.md`.

Bản này đã sửa theo bốn lượt review ngày 2026-10-01:
- lượt 1: thanh phụ đề ẩn lúc khởi động, quyền phóng to chữ, chặn điều hướng ra ngoài, test ACL chặt hơn, giữ giá trị của file cài đặt bản mới hơn, thanh phụ đề trên Windows hiện mà không lấy focus, và các mục nhỏ ở QĐ21–QĐ27;
- lượt 2: trên Windows, ẩn/hiện và khóa thanh phụ đề làm hẳn bằng Win32 (QĐ23); giữ cả khóa con lạ của file bản mới hơn (QĐ2); test ACL kiểm khóa của file capability (QĐ5); origin của app theo từng hệ điều hành (QĐ22); lời nhắc khi Login Items cần cho phép (QĐ16); `<Notice/>` ở cả các bước lần đầu mở; test hiện/ẩn/khóa bằng bản giả của thanh phụ đề (QĐ27);
- lượt 3: bản dev nhận biết bằng `tauri::is_dev()`, để `pnpm tauri build --debug` không trắng màn hình (QĐ22); thanh phụ đề trên Windows không phóng to hay ghép nửa màn hình khi kéo lên mép (QĐ23); mọi việc mở ra ngoài app đi qua `SystemOpener`, test dùng bản giả (QĐ28); thanh báo trong các bước lần đầu mở không có nút "Mở cài đặt" (QĐ12).
- lượt 4: chốt tên **AI Translator** và bundle id **`com.aitranslator.desktop`** (Q1, QĐ29); tắt khởi động cùng hệ thống mà còn mục ở `HKLM` thì báo lỗi (QĐ16); ghi file cài đặt và bật/tắt khởi động cùng hệ thống qua trait để test dùng bản giả (QĐ27); luật tuổi phát hành áp cho cả crate.

---

## Phiên bản đã chốt (kiểm ngày 2026-10-01, theo §6.12)

Kiểm bằng `cargo info <crate>@2`, `cargo search`, `pnpm view <gói> version peerDependencies engines`, và API của crates.io (ngày phát hành, MSRV, giấy phép, có bị yanked không).

| Thành phần | Phiên bản | Ghi chú tương thích |
|---|---|---|
| tauri / tauri-build | 2.12.0 / 2.7.0 (giữ) | thêm feature `tray-icon`; dev-dependency thêm feature `test` (MockRuntime). Dòng 3.0 chỉ có alpha nên không dùng |
| tauri-plugin-store | 2.5.0 | bản 2.x mới nhất; MSRV 1.90; Apache-2.0 OR MIT |
| tauri-plugin-single-instance | 2.5.2 | bản 2.x mới nhất (ra 2026-10-01 00:28 UTC, xem ghi chú); macOS dùng Unix socket, Windows dùng named mutex; phải là plugin đầu tiên |
| tauri-plugin-autostart | 2.7.0 (kéo theo `auto-launch` 0.6.0) | bản 2.x mới nhất (ra 2026-10-01 00:27 UTC, xem ghi chú); macOS mặc định vẫn là LaunchAgent (không hỏi quyền Automation như cách AppleScript); Windows: `is_enabled()` đọc cả `StartupApproved\Run` của Task Manager (QĐ16) |
| tauri-plugin-opener | 2.7.0 | chỉ gọi từ Rust; tắt `open_js_links_on_click` |
| tauri-plugin-log | 2.10.0 | có `RotationStrategy::KeepSome`, `max_file_size`, `TimezoneStrategy::UseLocal` |
| tauri-plugin-global-shortcut, tauri-nspanel | 2.4.0, 2.1.0 (giữ) | như S5 |
| keyring-core | 1.0.0 | tác giả `keyring` 4.x khuyên app dùng `keyring-core` và store của từng nền tảng thay vì crate gộp `keyring`; có store giả (`mock`) để test; MSRV 1.85 |
| apple-native-keyring-store | 1.0.2 (feature `keychain`) | chỉ macOS; Keychain đăng nhập qua `security-framework` |
| windows-native-keyring-store | 1.1.0 | chỉ Windows; Credential Manager; MSRV 1.88; modifier `persistence = Local` (QĐ8) |
| objc2 | 0.6.4 (đã có trong `audio-capture`) | `applicationShouldTerminate:` bằng `msg_send!` |
| objc2-foundation | 0.3.2 (feature `NSString`, `NSURL`) | cùng dòng objc2 0.6; đã có trong `audio-capture` |
| objc2-service-management | 0.3.2 (feature `SMAppService`, `objc2-foundation`) | bản mới nhất, cùng dòng objc2 0.6; `SMAppService statusForLegacyURL:` (macOS 13+) đọc trạng thái thật của LaunchAgent, `openSystemSettingsLoginItems` mở trang Login Items (QĐ16); Zlib OR Apache-2.0 OR MIT |
| smappservice-rs | 0.1.3 (gián tiếp) | phụ thuộc mới của `auto-launch` 0.6.0, chỉ trên macOS; MIT; không khai MSRV; app không dùng chế độ `SMAppService` của nó |
| windows | 0.62.2 (feature `Win32_Foundation`, `Win32_UI_WindowsAndMessaging`) | cùng bản mà Tauri và `audio-capture` đang dùng, nên `HWND` của `WebviewWindow::hwnd()` khớp kiểu; ẩn/hiện và click xuyên qua của thanh phụ đề bằng `ShowWindow`, `SetWindowLongPtrW`, `SetWindowPos` (QĐ23) |
| sys-locale | 0.3.2 | đọc locale hệ điều hành cho ngôn ngữ giao diện mặc định; MSRV 1.56 |
| log | 0.4.34 | facade mà `tauri-plugin-log` đọc |
| yoke-derive (phụ thuộc gián tiếp của candle) | 0.8.3 → 0.8.4 | 0.8.3 đã bị yanked, làm `cargo deny check` trên `main` báo lỗi từ trước kế hoạch này; 0.8.4 ra 2026-09-30 13:19 UTC do chính người bảo trì ICU4X phát hành |
| zustand | 5.0.15 | peer React ≥ 18 (tùy chọn), chạy với React 19.3; MIT |
| vitest | 5.0.3, hoặc 5.0.2 (xem ghi chú) | peer `vite ^6.4 \|\| ^7 \|\| ^8`, Node `^22.12 \|\| ^24 \|\| ≥26`; môi trường `node`, không cần jsdom hay happy-dom |

Ghi chú:
- **Luật tuổi phát hành, dùng chung cho mọi kế hoạch, cho cả gói npm lẫn crate:** dùng bản ổn định mới nhất đã ra ít nhất 1 ngày. Bản mới nhất chưa đủ 1 ngày thì dùng bản ngay trước đó; bản bị yanked thì dùng bản ngay trước nó. Ghi lại trong kế hoạch. Với npm, không bao giờ commit `minimumReleaseAgeExclude`.
  - Lúc lập kế hoạch, vitest 5.0.3 mới ra được khoảng 9 giờ (2026-09-30 11:30 UTC); `pnpm add` tự tạo `pnpm-workspace.yaml` có `minimumReleaseAgeExclude`.
  - Vì vậy lần chạy thử cuối dùng 5.0.2; bản 5.0.3 cũng đã chạy thử lúc đầu, cho cùng kết quả.
  - Task 1, Step 6 làm đúng luật này: thử 5.0.3, và nếu `pnpm-workspace.yaml` xuất hiện thì xóa nó và cài 5.0.2.
- Crate, theo luật trên:
  - lúc lập kế hoạch, `tauri-plugin-autostart` 2.7.0, `tauri-plugin-single-instance` 2.5.2 (ra 2026-10-01 00:27 và 00:28 UTC) và `yoke-derive` 0.8.4 (2026-09-30 13:19 UTC) chưa đủ 1 ngày. Kế hoạch vẫn chốt ba bản này, vì lúc thực thi chúng đã đủ tuổi: Task 1, Step 1 có lệnh in ngày phát hành và xác nhận điều đó;
  - nếu lúc thực thi một bản vẫn chưa đủ 1 ngày, hay bị yanked, thì dùng bản ngay trước đó: `tauri-plugin-autostart` 2.6.0, `tauri-plugin-single-instance` 2.5.1 (sửa mức trong `Cargo.toml` và chạy `cargo update -p <crate> --precise <bản>`). Với `yoke-derive`, bản trước là 0.8.3 đã bị yanked, nên phải chờ 0.8.4 đủ tuổi;
  - lúc thực thi, app dùng bản dự phòng `tauri-plugin-autostart` 2.6.0 (`auto-launch` 0.5.0; xem phụ lục). **Sau khi nâng lên 2.7.0, chạy lại test của Task 12 và Task 17.** Với 2.6.0, trên Windows mọi mục khởi động chỉ nằm ở `HKCU`; chú thích `HKLM` ở `login_item.rs` chỉ đúng sau khi nâng;
  - lần chạy thử cuối dùng đúng các bản đã chốt (cùng `tauri-plugin` 2.7.1, `tauri-utils` 2.10.1 kéo theo): build, test, clippy, `check-windows.sh`, `cargo deny` đều sạch. Đã đọc code `auto-launch` 0.6.0: macOS vẫn là file `~/Library/LaunchAgents/<tên>.plist` với `Label` là `<tên>`, `is_enabled()` vẫn chỉ xem file có tồn tại không.
- Crate mới đều không bị yanked, giấy phép nằm trong `deny.toml`, MSRV không vượt 1.98. Không crate nào kéo ggml hay thư viện C thứ hai vào tiến trình chính (`cargo deny check bans` vẫn sạch).
- Giấy phép gói npm chạy trong app: `@tauri-apps/api` (Apache-2.0 OR MIT), `react`, `react-dom`, `scheduler`, `zustand` (MIT).
- `cargo audit` còn 3 cảnh báo cũ, đều có từ trước: `paste` (đã có ngoại lệ trong `deny.toml`), `proc-macro-error` và `glib` (chỉ có trên Linux, qua gtk của Tauri).

## Dòng của bảng đối chiếu giao cho kế hoạch này

Lấy bằng lệnh ở Task 2, Step 1 của kế hoạch 00. Cột cuối là task nhận phần của 01.

| # | Yêu cầu (rút gọn) | Phần của 01 | Task |
|---|---|---|---|
| 2 | D2: nhận diện thương hiệu mới | token màu và icon tạm, không dùng gì của AI Live Translator | 17, 21 |
| 4 | D4: Tauri 2, React 19, Zustand | thêm Zustand | 1, 18 |
| 8, 21 | D8, F7: giao diện vi và en | từ điển vi/en, đổi trong Cài đặt | 14, 21 |
| 16 | F2: ngôn ngữ đích, tập nguồn, khóa nguồn | khóa cài đặt, bộ chọn ở màn hình chính và bước 5 | 4, 21 |
| 17, 64, 69, 70, 71 | F3, §4.4: kiểu cửa sổ thanh phụ đề, khóa, NSPanel, topmost | giữ cách tạo của S5; ẩn lúc khởi động; khóa và ẩn/hiện từ khay và phím tắt; Windows hiện mà không lấy focus | 17, 24, 25 |
| 24, 54 | F10: phím tắt đổi được, khay, kiểm trùng | đăng ký, đổi, báo lỗi; nhóm Cài đặt "Phím tắt" | 2, 3, 17, 19, 21, 24 |
| 35, 39, 41, 42 | §4.1 bước 1, 5, 7, 8 | các bước của 01; bước cuối trên Windows có hình và nút mở Taskbar | 21, 25 |
| 38, 230 | §4.1 bước 4, §9 thiếu quyền macOS | khung bước (02 làm nội dung) | 21 |
| 43, 46 | Bắt đầu qua nút, phím tắt, khay; màn hình chính | điểm bắt đầu nối vào phiên tạm, hiện thanh phụ đề; khung màn hình chính | 17, 21 |
| 50, 204 | Cài đặt nhóm Chung; kênh cập nhật | ngôn ngữ, khởi động cùng hệ thống, sáng/tối, kênh cập nhật | 4, 12, 17, 21 |
| 59, 257, 260 | Giới thiệu; giấy phép; câu miễn trừ nhãn hiệu | màn hình, nút mở thư mục log, chỗ cho danh sách giấy phép (07) | 17, 21 |
| 60, 61, 62, 63, 305 | Đóng cửa sổ, Thoát, `⌘Q`, Dock, tắt máy | ẩn xuống khay; Thoát ở khay; chặn `⌘Q` và Dock kèm lời nhắc; không chặn tắt máy | 10, 17, 24, 25 |
| 68 | Nhớ vị trí theo từng màn hình | lưu và đặt lại vị trí, bỏ màn hình lâu không dùng nhất (03 làm kéo cạnh) | 9, 17, 24 |
| 72 | Icon ở Dock theo cửa sổ chính | `regular` khi hiện, `accessory` khi ẩn | 17, 24 |
| 74, 75, 76, 292 | i18n có kiểu, đổi ngay, chuỗi Rust, vitest đủ khóa | toàn bộ | 7, 14, 15 |
| 79 | Đ19: tiến trình phụ theo cửa sổ chính | mở lúc đăng nhập thì chỉ nằm ở khay; `launchedAtLogin` cho 02 | 17 |
| 87, 141, 252 | `audioSource` chọn thiết bị; cờ ngữ cảnh; lưu lịch sử mặc định tắt | khóa cài đặt và giá trị mặc định | 4 |
| 191, 192 | `tauri-plugin-store`, schema, migrate, đủ khóa | toàn bộ | 4, 5, 6, 13 |
| 194, 195 | React, Zustand; hai cửa sổ, `invoke`, sự kiện | store nhận sự kiện | 18, 20, 21 |
| 196, 197 | Thương hiệu mới; chữ phóng to được | token màu tạm; cỡ chữ theo rem, `zoomHotkeysEnabled` cùng quyền `set-webview-zoom` | 17, 21, 24, 25 |
| 249 | Không analytics; log nằm trên máy | nút mở thư mục log | 17, 21 |
| 266 | Trạng thái bản quyền và quota trong kho khóa | wrapper kho khóa (06 dùng) | 8 |
| 271, 312 | Quyền từng cửa sổ; link ngoài mở bằng trình duyệt; overlay không gọi được lệnh ngoài quyền | app manifest, capabilities, chặn điều hướng, test ACL chặt | 11, 17 |
| 318 | Cây thư mục §12 | phần `src-tauri/src/` và `src/` của 01 | 17, 21 |

## Quyết định của kế hoạch này

Đánh số QĐ1–QĐ29, chỉ dùng trong file này. QĐ21–QĐ29 thêm khi sửa theo review.

- **QĐ1. Chia module.** `src-tauri/src/` theo §12 (`settings/`, `tray.rs`, `hotkeys.rs`, `i18n.rs`, `overlay/{macos,windows}.rs`, `security/keystore.rs`), thêm:
  - `commands.rs` (lệnh `invoke`), `actions.rs` (việc dùng chung cho lệnh, khay, phím tắt), `events.rs` (tên và cách gửi sự kiện), `state.rs` (trạng thái dùng chung);
  - `window.rs` (cửa sổ chính, menu app trên Mac), `hotkey_registry.rs` (đăng ký với hệ điều hành), `quit_guard.rs` (chặn `⌘Q`), `navigation.rs` (chặn điều hướng), `system.rs` (mọi việc mở ra ngoài app, QĐ28), `login_item.rs` (trạng thái khởi động cùng hệ thống), `logging.rs`, `session_stub.rs` (phiên tạm);
  - phần thuần tách riêng để test trước: `errors.rs` (mã lỗi trả về giao diện), `tray_menu.rs` (nội dung menu khay);
  - test chạy bằng MockRuntime: `test_support.rs`, `acl_tests.rs`, `app_tests.rs`.
- **QĐ2. File cài đặt phẳng.** Mỗi khóa của `Settings` là một mục ở mức trên cùng của store, cộng `schemaVersion`.
  - Đọc file: khoan dung theo từng khóa. Khóa sai kiểu hay ngoài phạm vi thì về mặc định và ghi log; không bỏ cả file vì một khóa hỏng. Nhóm con (`overlay`, `hotkeys`, `experimental`) thử cả nhóm trước, rồi mới xét từng khóa con, để giữ được thay đổi chỉ hợp lệ khi đi cùng nhau (đổi chỗ hai phím tắt).
  - Ghi file: chỉ ghi khóa đã biết, nên khóa lạ của bản app mới hơn còn nguyên trong file; không hạ `schemaVersion`.
  - File do bản app mới hơn ghi (`schemaVersion` lớn hơn bản hiện tại):
    - khóa không đọc được không làm app ghi lại file;
    - lần ghi sau vẫn giữ giá trị thô của file (`FileMeta::preserved`), trừ khi người dùng đổi chính khóa đó;
    - khóa con lạ trong nhóm (ví dụ `overlay.futureSub`, `experimental.newFlag`) được ghép lại khi ghi (`FileMeta::unknown`), vì store ghi cả nhóm một lần;
    - hạn chế, chấp nhận cho MVP: người dùng cố ý chọn đúng giá trị mặc định cho một khóa đang được giữ thì lần ghi sau vẫn ghi lại giá trị thô của file, vì app không phân biệt được "chưa đổi" với "đổi về mặc định".
  - Sửa từ giao diện: nghiêm. Khóa lạ, sai kiểu, ngoài phạm vi đều bị từ chối, trả mã lỗi và tên khóa.
  - File không đọc được thì đổi tên thành `settings.json.corrupt-<giây Unix>` (trùng tên thì thêm `-1`, `-2`…, không ghi đè bản cũ; phụ lục, đợt R, mục 20) trước khi mở store, vì `tauri-plugin-store` lặng lẽ mở store rỗng và lần ghi sau sẽ đè mất file.
- **QĐ3. Khóa và giá trị mặc định.** Theo §6.9, thêm hai khóa: `onboardingDone` (đã xong các bước lần đầu) và `overlay.lastMonitor`. Mỗi vị trí trong `overlay.positions` có thêm `lastUsed` (QĐ13).
  - `audioSource` là `{kind: "system"}`, `{kind: "device", id}` (Windows) hoặc `{kind: "app", bundleId}` (macOS); 02 dùng.
  - `modelTier` là `null` khi chưa chọn; 04 đặt.
  - Phím tắt lưu ở dạng chuẩn `Ctrl+Alt+T` (thứ tự Ctrl, Alt, Shift, Super).
  - Mặc định của thanh phụ đề: cỡ chữ 22, 2 dòng, độ mờ nền 0,6, không hiện câu gốc. 03 được đổi, kèm bước migrate nếu cần.
  - Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (§4.1 bước 5). Chọn ngôn ngữ giao diện ở bước 1 cũng đặt luôn ngôn ngữ đích; bước 5 đổi lại được.
- **QĐ4. Khóa chỉ đổi qua lệnh riêng:** `hotkeys` (lệnh `set_hotkey`, vì phải đăng ký lại với hệ điều hành), `overlay.locked` (lệnh `set_overlay_locked`, vì phải đổi cửa sổ), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi).
- **QĐ5. Quyền tối thiểu.**
  - Cửa sổ `main`: 11 lệnh của app, nghe sự kiện, và `core:webview:allow-set-webview-zoom`. Quyền thứ ba cần vì trên macOS, `zoomHotkeysEnabled` là một đoạn JS gọi `plugin:webview|set_webview_zoom`; thiếu quyền thì `⌘+`/`⌘-` không làm gì.
  - Cửa sổ `overlay`: một lệnh chỉ đọc, `get_overlay_view` (phần cài đặt của chính nó), cùng quyền nghe sự kiện và kéo cửa sổ. Khác chữ §10.2 một chút: overlay không gọi lệnh khóa, vì khi đã khóa thì click đi xuyên qua, không bấm được gì trên thanh; mở khóa bằng phím tắt hoặc menu khay như §4.4.
  - Không cửa sổ nào được cấp lệnh của plugin (store, autostart, opener, log, global-shortcut) hay lệnh cửa sổ khác của Tauri. Thư mục log và trang Taskbar mở bằng lệnh Rust với đích cố định.
  - Test ACL kiểm:
    - quyền của mỗi cửa sổ khớp đúng một danh sách cố định;
    - mỗi file capability chỉ có các khóa `$schema`, `identifier`, `description`, `windows`, `permissions` (không có `remote`, `platforms`, `local`) và gắn đúng một cửa sổ;
    - thư mục `capabilities/` chỉ có hai file;
    - một danh sách lệnh nhạy cảm bị chặn ở cả hai cửa sổ.
- **QĐ6. Sự kiện không phải ranh giới quyền.** Trong Tauri 2, listener JS đăng ký với đích `Any` nhận cả sự kiện gửi riêng cho cửa sổ khác (`event/listener.rs`, `match_any_or_filter`). Vì vậy không gửi bí mật qua sự kiện. Kế hoạch 06 phải giữ điều này (không gửi token hay license key đầy đủ). `emit_to` chỉ để bớt việc thừa.
- **QĐ7. Chặn `⌘Q` và Quit ở Dock (R9).**
  - tao không cài `applicationShouldTerminate:`, nên mọi `terminate:` đều thoát ngay, không qua `RunEvent::ExitRequested`.
  - App thêm phương thức này vào lớp app delegate của tao: Apple Event `quit` có thuộc tính lý do (đăng xuất, khởi động lại, tắt máy) thì cho thoát; còn lại thì hủy, rồi hiện cửa sổ chính kèm lời nhắc "chọn Thoát ở biểu tượng trên menu bar" (QĐ12). Không dùng thông báo hệ thống, vì cần hộp thoại xin quyền.
  - Menu app giữ mục Quit (`⌘Q`); mục này cũng đi qua hook ở trên, nên bị hủy và hiện lời nhắc.
  - Thoát ở khay gọi `AppHandle::exit`; tao dừng bằng `stop:`, không qua hook này. `AppHandle::restart` (cập nhật, 07) cũng vậy.
- **QĐ8. Kho khóa:** `keyring-core` cùng store gốc của từng hệ điều hành (không dùng crate gộp `keyring`).
  - "Service" là bundle identifier đọc từ `app.config().identifier` (R17), tức `com.aitranslator.desktop` (QĐ29).
  - Tên mục chỉ gồm `[a-z0-9._-]`, dài 1–64; giá trị tối đa 2048 byte (Credential Manager giới hạn 2560).
  - Windows: mục lưu với `persistence = Local` (chỉ trên máy này), không dùng mặc định `Enterprise` (đi theo hồ sơ roaming sang máy khác), vì trạng thái bản quyền và quota gắn với từng máy.
  - Test dùng store giả của `keyring-core`, chạy qua đúng code của bản thật.
- **QĐ9. i18n không thêm thư viện.**
  - Giao diện: `en.ts` là `as const`, `vi.ts` là `Record<MessageKey, string>`, cộng hàm `translate`.
  - Rust: hằng `Strings`; thiếu trường thì không biên dịch được.
  - Test Rust (`errors.rs`) đọc `src/i18n/en.ts` để kiểm mọi mã lỗi phía Rust đều có câu báo lỗi.
- **QĐ10.** Điều hướng bằng store, không thêm router. Màn hình chưa có chức năng hiện trạng thái trống có chuỗi i18n.
- **QĐ11. Phiên tạm.** Bắt đầu/Dừng (nút, phím tắt, khay) đổi trạng thái, hiện thanh phụ đề khi bắt đầu (QĐ21), và phát phụ đề mẫu mỗi 1,5 giây như S5, để thử thanh phụ đề bằng tay. 02 thay `session_stub.rs` bằng `session.rs`.
- **QĐ12. Thông báo trong app (theo đề xuất Q13).**
  - Lỗi của lệnh gần nhất hiện ở thanh báo của cửa sổ chính.
  - Lời nhắc từ phía Rust (sự kiện `app://notice`, hiện chỉ có "thoát ở menu bar") hiện ở thanh báo, đóng được.
  - Phím tắt không đăng ký được thì hiện ở thanh báo, ở nhóm Cài đặt "Phím tắt", và ở một dòng trong menu khay; bấm dòng đó thì mở đúng nhóm Cài đặt.
  - Thanh báo có ở cả khung cửa sổ chính lẫn các bước lần đầu mở. Trong các bước lần đầu mở, `App` chỉ hiện `Onboarding`, nên nút "Mở cài đặt" ở thanh báo phím tắt bị ẩn (`canOpenScreens`, có test), và câu báo đổi thành "đổi ở Cài đặt › Phím tắt sau khi xong các bước này". Không thêm bước phím tắt vào lần đầu mở, vì §4.1 không có bước này.
  - Không xin quyền thông báo hệ thống.
- **QĐ13. Vị trí thanh phụ đề theo màn hình.**
  - Khóa của màn hình là tên cộng độ phân giải.
  - Vị trí lưu bằng điểm logic so với vùng làm việc của màn hình, nên đúng cả khi các màn hình có scale khác nhau.
  - Nhớ tối đa 16 màn hình; quá thì bỏ màn hình có `lastUsed` cũ nhất (giây Unix lần cuối thanh phụ đề nằm trên màn hình đó), không bao giờ bỏ màn hình vừa dùng. Vị trí nằm ngoài màn hình thì kéo vào trong.
  - Thứ tự chọn màn hình: màn hình của lần đặt gần nhất; màn hình khác có vị trí đã nhớ; màn hình chính.
  - Khi đang kéo thì chỉ ghi khóa `overlay`, vì sự kiện `Moved` đến dồn dập.
- **QĐ14. Log:** `tauri-plugin-log` ghi `app.log` ở thư mục log của hệ điều hành; mỗi file 1 MB, giữ 5 file; giờ địa phương; `tao` và `wry` ở mức Warn.
- **QĐ15.** Menu app trên Mac dùng chữ mặc định (English) của các mục có sẵn (About, Edit, Window, Quit…). Chỉ menu khay theo ngôn ngữ giao diện.
- **QĐ16. Trạng thái thật của "khởi động cùng hệ thống".** Lúc khởi động, `launchAtLogin` lấy theo hệ điều hành chứ không theo file cài đặt.
  - macOS: plugin chỉ xem file LaunchAgent có tồn tại không. Người dùng tắt app ở System Settings › General › Login Items thì file vẫn còn. Vì vậy app hỏi thêm `SMAppService statusForLegacyURL:` và chỉ coi là bật khi trạng thái là `Enabled`. Lúc lập kế hoạch, với một file không tồn tại, hàm này trả `NotRegistered` và không bật hộp thoại nào. Task 24 thử với Login Items thật.
  - macOS, bật trong app mà hệ thống báo `RequiresApproval` (mục đang bị tắt ở Login Items): app gửi lời nhắc `loginItemsApproval`, có nút mở System Settings › General › Login Items bằng `SMAppService openSystemSettingsLoginItems` (lệnh `open_login_items_settings`). Lệnh này đi qua `SystemOpener` (QĐ28): app giả của test dùng bản giả, nên kể cả khi ACL lỡ cấp thừa, không test nào mở System Settings thật. Phần quyết định (`login_item::needs_approval`) có test; Task 24 dòng 21 thử bằng tay.
  - Windows: `auto-launch` 0.6.0 (plugin dùng) đọc cả giá trị trong `...\CurrentVersion\Run` lẫn khóa `Explorer\StartupApproved\Run` của Task Manager (ở cả `HKLM` và `HKCU`), nên tắt ở Task Manager thì app hiện "tắt". `enable()` ghi lại cả hai, nên bật trong app là bật thật.
  - Windows: `auto-launch` 0.6.0 mặc định ghi vào `HKLM` trước (mọi người dùng), chỉ khi không có quyền mới ghi `HKCU`; plugin 2.7.0 chưa cho chọn. App chạy bằng quyền người dùng thường nên thực tế ghi `HKCU` (Task 25 dòng 13 kiểm).
  - Windows, tắt: `disable()` xóa ở cả `HKLM` và `HKCU`, nhưng không có quyền admin thì mục ở `HKLM` (do một lần chạy bằng quyền admin ghi) còn nguyên. Vì vậy sau `disable()` app gọi lại `is_enabled()`; còn bật thì trả lỗi `autostartStillEnabled` kèm câu i18n, cài đặt giữ "bật". Có test bằng bản giả; Task 25 dòng 18 thử thật. Ghi chú cho 07: bộ cài nên dọn mục ở `HKLM` khi gỡ app.
  - Ghi chú cho 07: giá trị trong `Run` là đường dẫn exe không có dấu nháy, kèm `--autostart`. Đường dẫn cài đặt có dấu cách (ví dụ `...\AI Translator\...`) thì Windows có thể hiểu sai; 07 phải xử lý (đường dẫn không dấu cách, hoặc sửa cách ghi giá trị).
  - Việc bật/tắt và hỏi trạng thái đi qua trait `login_item::LoginItem` (bản thật cài ở đầu `setup`); test dùng bản giả `test_support::FakeLoginItem`, không đụng LaunchAgent, Login Items hay registry thật.
- **QĐ17.** Trên Windows, bấm chuột trái vào icon khay thì mở cửa sổ chính, chuột phải thì mở menu. Trên Mac, bấm vào icon luôn mở menu, như mọi icon ở menu bar.
- **QĐ18.** Kiểm kiểu và clippy phần code Windows ngay trên Mac bằng `scripts/check-windows.sh`, với một `llvm-rc` giả, vì tauri-build cần trình biên dịch resource cho target Windows. `cargo check` và `cargo clippy` không link, nên file resource rỗng không ảnh hưởng gì.
- **QĐ19.** Ký bản dev bằng chứng thư cố định (R8) qua `scripts/run-dev-signed.sh`, để Keychain và quyền của macOS không hỏi lại sau mỗi lần build. Đây là bước tùy chọn của người.
- **QĐ20.** Vitest chạy môi trường `node`. Store test qua bản giả của `Ipc`, nên không cần jsdom hay happy-dom. Khi 03 cần test phần hiển thị thì thêm môi trường DOM.
- **QĐ21. Thanh phụ đề ẩn lúc khởi động** (§4.2, Đ19), kể cả khi mở lúc đăng nhập.
  - Bắt đầu phiên thì hiện thanh (`session_stub::start`; `session.rs` của 02 làm y như vậy).
  - Dừng phiên thì thanh giữ nguyên, để người dùng còn đọc được các dòng cuối.
  - Ẩn/hiện bằng tay (nút, phím tắt, khay) vẫn dùng được.
- **QĐ22. Điều hướng của webview (§10.2).**
  - URL của app thì cho đi. Bản nạp giao diện đóng gói chỉ nhận origin của giao diện đó trên đúng hệ điều hành đang chạy: macOS `tauri://localhost`, Windows `http(s)://tauri.localhost`. Bản dev chỉ nhận đúng origin của dev server (`devUrl`).
  - "Bản dev" là `tauri::is_dev()` (chưa bật feature `custom-protocol`), đúng cách Tauri chọn nguồn giao diện; không dùng `cfg!(debug_assertions)`, vì `pnpm tauri build --debug` là bản debug mà vẫn nạp giao diện đóng gói, và khi đó cả hai cửa sổ sẽ trắng. Phần chọn URL (`dev_url_for`) có test.
  - `blob:` bị chặn, kể cả `blob:` của chính app. Ghi chú cho 03: nếu xuất file bằng cách điều hướng tới `blob:` (`<a download>`) thì phải làm cách khác, ví dụ ghi file phía Rust.
  - URL `https` ở cổng mặc định, có tên miền đúng từng chữ trong `navigation::EXTERNAL_HOSTS`, thì mở bằng trình duyệt qua opener phía Rust.
  - Còn lại thì chặn và ghi log (chỉ ghi origin).
  - Danh sách hiện rỗng; 06 thêm trang thanh toán PayOS, 07 thêm website.
  - Luật áp cho mọi webview (plugin `navigation-guard`, hook `on_navigation`), và cho yêu cầu mở cửa sổ mới (`on_new_window`, luôn từ chối). Cửa sổ chính vì vậy được tạo bằng code thay vì khai trong `tauri.conf.json`.
- **QĐ23. Trên Windows, ẩn/hiện và khóa thanh phụ đề làm hẳn bằng Win32,** không gọi `show`, `hide` hay `set_ignore_cursor_events` của tao cho cửa sổ này.
  - Hiện: `ShowWindow(SW_SHOWNOACTIVATE)`, để không lấy focus của app họp. Ẩn: `ShowWindow(SW_HIDE)`.
  - Khóa (click xuyên qua): `SetWindowLongPtrW(GWL_EXSTYLE, …)` bật/tắt `WS_EX_TRANSPARENT | WS_EX_LAYERED` như tao làm, rồi `SetWindowPos(SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)`.
  - Lý do: tao giữ cờ `VISIBLE` riêng. Cửa sổ hiện bằng Win32 thì tao vẫn tưởng đang ẩn, nên `hide()` không làm gì. Đổi click xuyên qua tao thì tao áp lại cả bộ cờ: gọi `SW_HIDE` (thanh biến mất) hoặc `SW_SHOW` (lấy focus).
  - Cũng vì tao giữ cờ riêng, sau khi tạo thì không gọi hàm nào đổi cờ của tao cho overlay trên Windows (`set_resizable`, `set_always_on_top`, `set_decorations`, `set_maximizable`, `set_minimizable`…): mọi cờ đặt một lần lúc tạo.
  - Overlay tạo với `maximizable(false)` và `minimizable(false)`: kéo thanh lên mép trên thì Aero Snap không phóng to (nếu phóng to, `remember_position` sẽ lưu luôn kích thước đó, và cờ `MAXIMIZED` của tao bị lệch). Việc ghép nửa màn hình khi kéo sang mép trái, phải còn tùy kiểu cửa sổ cho đổi cỡ (`WS_THICKFRAME`), cờ này không chắc chặn được; Task 25 dòng 17 kiểm, nếu vẫn ghép thì 03 xử lý cùng lúc làm kéo cạnh.
  - Ghi chú cho 03 khi làm kéo cạnh: dùng `start_resize_dragging` (không đổi cờ); nếu cần đổi `resizable` thì đặt lúc tạo cửa sổ, không gọi `set_resizable` sau đó.
  - `AppStatus.overlay_visible` là trạng thái gốc. Kiểm kiểu bằng `scripts/check-windows.sh`; hành vi thật ở Task 25 dòng 5–7 và 17.
- **QĐ24. Đổi phím tắt mà phím cũ cũng không đăng ký lại được** thì việc đó được thêm vào `hotkeyFailures`, để khay và thanh báo có cảnh báo như lỗi lúc khởi động. Luật nằm ở `hotkeys::rebind`, test bằng bộ đăng ký giả.
- **QĐ25. `toggle_session` trả `Result<AppStatus, CommandError>` ngay từ 01.**
  - Lệnh này hiện là lệnh đồng bộ, chạy trên luồng chính.
  - Ghi chú cho 02: bắt đầu phiên thật (thu âm, chạy tiến trình phụ) không được chạy trên luồng chính, nên khi đó chuyển lệnh sang `async`.
- **QĐ26. TDD chặt:** mọi phần có test đều có bước chạy thấy đỏ trước. Vì vậy phần thuần của menu khay và mã lỗi được tách thành `tray_menu.rs` và `errors.rs` (Task 15, 16), còn các test chạy bằng MockRuntime được viết trước ở Task 17.
- **QĐ27.** Test chạy bằng MockRuntime (`app_tests.rs`) kiểm hành vi qua lệnh thật:
  - thanh phụ đề ẩn lúc đầu, hiện khi bắt đầu phiên, giữ nguyên khi dừng;
  - lệnh ẩn, hiện, khóa, mở khóa đi tới đúng cửa sổ, khóa không tự ẩn hay hiện thanh, và khóa được ghi vào file cài đặt;
  - bật khởi động cùng hệ thống khi Login Items cần cho phép thì có lời nhắc; bật thì đăng ký, tắt bình thường thì hết đăng ký, tắt mà vẫn còn bật thì báo lỗi; lúc khởi động, cài đặt theo trạng thái thật của hệ thống;
  - bỏ qua yêu cầu thoát thì gửi lời nhắc tới cửa sổ chính.
  - Thao tác cửa sổ của thanh phụ đề đi qua trait `overlay::Surface`: bản thật gọi `macos.rs` hay `windows.rs`, test dùng bản giả ghi lại từng lần gọi (`test_support::FakeSurface`).
  - Ghi file cài đặt đi qua trait `persist::SettingsFile` (bản thật ghi vào `tauri-plugin-store`), bật/tắt khởi động cùng hệ thống qua `login_item::LoginItem`; app giả dùng `FakeSettingsFile`, `FakeLoginItem`. Đăng ký `tauri-plugin-store` thật trong test sẽ ghi vào thư mục cài đặt thật của app, nên không làm vậy.
  - Hạn chế: bản giả không kiểm được code Win32, NSPanel, store hay registry thật; các phần này thử tay ở Task 24 và 25.
- **QĐ28. Mọi việc mở ra ngoài app đi qua trait `system::SystemOpener`,** cách làm giống `overlay::Surface`: mở thư mục log, trang Taskbar của Windows, trang Login Items của macOS, link ngoài bằng trình duyệt. Kế hoạch 02 thêm `open_audio_permission_settings` (trang quyền ghi âm thanh) vào đây.
  - App thật cài bản thật ở đầu `setup` (`system::install`); chưa cài thì mọi lời gọi trả lỗi, không mở gì.
  - `mock_app` và mọi test dùng bản giả `test_support::FakeSystem`, ghi lại các lần gọi. Vì vậy kể cả khi ACL lỡ cấp thừa một lệnh, test chạy tới handler cũng không mở Finder, System Settings hay Settings của Windows.
  - Test ACL kiểm: lệnh bị chặn thì bản giả không ghi nhận gì; lệnh được phép thì ghi nhận đúng lời gọi.
  - Không chỗ nào khác gọi `tauri-plugin-opener` hay API mở System Settings.
- **QĐ29. Tên sản phẩm và bundle identifier (Q1 đã chốt).** `productName` là **AI Translator**, `identifier` là **`com.aitranslator.desktop`** (thay `dev.meetingtranslator.spike` của spike), đặt ở `tauri.conf.json`.
  - Lấy theo identifier: thư mục cài đặt (`~/Library/Application Support/com.aitranslator.desktop/`, `%APPDATA%\com.aitranslator.desktop\`), thư mục log, "service" của kho khóa, tên của single instance.
  - Lấy theo `productName`: tên cửa sổ chính, chú thích ở khay, menu app trên Mac, giá trị trong `Run` của Windows. Chuỗi i18n nhắc tên app đổi thành "AI Translator".
  - LaunchAgent trên macOS: `auto-launch` 0.6.0 đặt cả tên file plist lẫn `Label` theo `app_name`, mặc định là `productName` ("AI Translator", có dấu cách). Nhãn có dấu cách không đúng kiểu reverse-DNS mà launchd dùng, và mọi lệnh `launchctl` với nhãn đó phải đặt trong nháy. Vì vậy app đặt `app_name` của plugin là identifier trên macOS: file `~/Library/LaunchAgents/com.aitranslator.desktop.plist`, `Label` là `com.aitranslator.desktop`. `login_item::autostart_name` giữ hai chỗ này khớp nhau, có test. Agent không bật autostart thật lúc lập kế hoạch; Task 24 dòng 19 kiểm bằng `plutil -p`.
  - Giữ nguyên: tên crate và package npm (`meeting-translator`), tên binary (`meeting-translator`), tên thư mục repo, biến môi trường `MT_DEV_SIGN_IDENTITY`.
  - Dữ liệu của bản spike dưới identifier cũ không chuyển sang (chưa có người dùng). Task 24 ghi cách xóa thư mục cũ và `Meeting Translator.plist` cũ nếu có.
  - Ghi chú cho 07: đổi `productName` thì bản đóng gói là `AI Translator.app`, thư mục cài đặt trên Windows có dấu cách (xem QĐ16 về giá trị `Run`).

## Điểm cần chủ dự án xem

Nếu tới lúc thực thi mà chưa có ý kiến, làm theo đề xuất.

- **Identifier (Q1) đã chốt:** AI Translator, `com.aitranslator.desktop` (QĐ29). Từ giờ không đổi identifier nữa: sau khi 03 và 06 ghi khóa SQLCipher, bản quyền, quota vào kho khóa, đổi identifier thì dữ liệu cũ không còn đọc được (R17).
- **Quit ở Dock và `⌘Q` bị chặn hẳn (QĐ7).** Chỉ Thoát ở menu khay mới thoát; Force Quit của macOS vẫn dùng được. Khi bị chặn, app hiện cửa sổ chính kèm lời nhắc. Đúng như §4.3; ghi ở đây để chủ dự án biết.
- **`yoke-derive` 0.8.3 bị yanked** làm `cargo deny check` trên `main` hỏng từ trước kế hoạch này. Task 1 sửa. Nếu phần crate của 02 chạy trước, 02 cũng phải chạy `cargo update -p yoke-derive --precise 0.8.4`.
- **Phím tắt `Ctrl+Alt+…` trên Windows** trùng với AltGr của một số bố cục bàn phím (Polish, German…), có thể nuốt ký tự người dùng gõ. Task 25 dòng 9 kiểm; nếu trùng thật thì cân nhắc đổi mặc định của F10.
- **Ba chỗ lệch spec nhỏ**, Task 26 ghi vào Q12 của kế hoạch 00:
  - overlay chỉ có lệnh đọc `get_overlay_view`, không gọi lệnh khóa (QĐ5);
  - 03 sẽ cấp `core:window:allow-start-resize-dragging` cho overlay, và sửa danh sách cố định trong test ACL;
  - menu app trên Mac chỉ có chữ English ở MVP (QĐ15).

## Cấu trúc file sau kế hoạch này

```
src-tauri/
├── Cargo.toml                  # sửa: thêm plugin, keyring-core, objc2-*, windows, [lib]
├── build.rs                    # sửa: app manifest 12 lệnh
├── tauri.conf.json             # sửa: không khai cửa sổ (cửa sổ chính tạo bằng code)
├── capabilities/main.json      # sửa: 11 lệnh, nghe sự kiện, phóng to chữ
├── capabilities/overlay.json   # sửa: get_overlay_view, nghe sự kiện, kéo cửa sổ
├── icons/tray-template.png     # mới: icon khay tạm cho macOS (template)
└── src/
    ├── main.rs                 # thay: chỉ gọi meeting_translator_lib::run()
    ├── lib.rs                  # mới (từ main.rs của S5): plugin, setup, vòng đời app
    ├── settings/{mod,migrate,patch,persist}.rs
    ├── hotkeys.rs  hotkey_registry.rs
    ├── i18n.rs  errors.rs  tray_menu.rs  tray.rs  window.rs
    ├── quit_guard.rs  navigation.rs  system.rs  login_item.rs
    ├── overlay/{mod,placement,macos,windows}.rs
    ├── security/{mod,keystore}.rs
    ├── state.rs  events.rs  commands.rs  actions.rs
    ├── session_stub.rs  logging.rs
    └── test_support.rs  acl_tests.rs  app_tests.rs
src/
├── i18n/{en,vi,index}.ts, i18n.test.ts
├── lib/{ipc,hotkeys,fakeIpc}.ts, hotkeys.test.ts
├── store/{app,overlay}.ts, app.test.ts, overlay.test.ts
├── styles/{tokens,main}.css
├── components/EmptyState.tsx
└── windows/
    ├── main/{main,App,Shell,Notice,LanguagePicker}.tsx, appStore.ts
    │   ├── screens/{Home,Placeholders,About,SettingsScreen}.tsx
    │   ├── settings/{GeneralSettings,HotkeySettings}.tsx
    │   └── onboarding/{Onboarding,TaskbarGuide}.tsx
    └── overlay/overlay.tsx, overlay.css
scripts/make_tray_icon.py, check-windows.sh, fake-llvm-rc, run-dev-signed.sh
index.html, overlay.html, package.json, vitest.config.ts, Cargo.lock, pnpm-lock.yaml
```

## Lưu ý khi thực thi

- Mọi lệnh shell bắt đầu bằng `source "$HOME/.cargo/env" && eval "$(fnm env --use-on-cd)" >/dev/null && …`, chạy từ gốc repo. Các Expected dưới đây bỏ phần tiền tố này.
- Expected ghi số đo thật **lúc lập kế hoạch** (2026-10-01, trên M4 Pro, trên commit `10bb011`; code của app như `3f085a9`). Lần chạy thử dùng target riêng, build lại từ đầu, nên thời gian build ở Expected là của lần build đầu.
- Kế hoạch này chạy song song được với phần crate của 02 (Đ18), nhưng hai bên cùng sửa `Cargo.lock`. Task 1 của 01 nên làm xong và commit trước khi 02 thêm crate mới. Nếu 02 đang giữ thay đổi chưa commit ở `Cargo.lock`, hai bên thống nhất trước khi chạy `cargo update` hay thêm phụ thuộc.
- Task 24–25 cần người thao tác hoặc máy Windows. Agent làm Task 1–23 và 26, rồi dừng chờ kết quả của 24–25 trước khi đánh dấu các dòng liên quan là `xong`.
- Agent không chạy `pnpm tauri dev` hay binary của app, và không chạy test `#[ignore]` đụng Keychain (mục 6.8 của kế hoạch 00). Agent không chạy thứ gì mở cửa sổ, System Settings hay Finder trên màn hình người dùng; mutation cấp thừa lệnh mở ra ngoài app (Task 17 Step 17) chỉ chạy khi `mock_app` đã dùng bản giả `FakeSystem`. Riêng test `#[ignore]` của `login_item` chỉ đọc trạng thái, không bật hộp thoại, nên agent chạy được (Task 12, Step 6).

---

## Task 1: Thêm thư viện, tách `src-tauri` thành lib và binary

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Move: `src-tauri/src/main.rs` → `src-tauri/src/lib.rs` (giữ code S5, đổi `main` thành `pub fn run`)
- Create: `src-tauri/src/main.rs`
- Modify: `Cargo.lock`, `package.json`, `pnpm-lock.yaml`

Task này chưa đổi hành vi của app; chỉ thêm thư viện và đổi chỗ code, rồi build lại toàn bộ và chạy test theo CLAUDE.md.

- [ ] **Step 1: Kiểm lại phiên bản trước khi cài**

Run:
```bash
for c in tauri tauri-plugin-store tauri-plugin-single-instance tauri-plugin-autostart tauri-plugin-opener tauri-plugin-log tauri-plugin-global-shortcut; do cargo info "$c@2" 2>/dev/null | grep -E '^version|^rust-version'; done
cargo info keyring-core | grep -E '^version|^rust-version'
cargo info apple-native-keyring-store | grep -E '^version'
cargo info windows-native-keyring-store | grep -E '^version'
for c in objc2-foundation objc2-service-management windows; do cargo info "$c" 2>/dev/null | grep -E '^version|^rust-version'; done
pnpm view zustand version && pnpm view vitest version && pnpm view vitest peerDependencies.vite engines.node
```
Expected (lúc lập kế hoạch; bỏ qua các dòng `Updating crates.io index`):
```text
version: 2.12.0 (latest 3.0.0-alpha.3)
rust-version: 1.90
version: 2.5.0 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 2.5.2 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 2.7.0 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 2.7.0 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 2.10.0 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 2.4.0 (latest 3.0.0-alpha.2)
rust-version: 1.90
version: 1.0.0
rust-version: 1.85
version: 1.0.2
version: 1.1.0
version: 0.3.2
rust-version: 1.71
version: 0.3.2
rust-version: 1.71
version: 0.62.2
rust-version: 1.82
5.0.15
5.0.3
peerDependencies.vite = '^6.4.0 || ^7.0.0 || ^8.0.0'
engines.node = '^22.12.0 || ^24.0.0 || >=26.0.0'
```
Nếu có bản mới hơn bảng "Phiên bản đã chốt", dừng lại và kiểm tương thích như §6.12 trước khi đi tiếp. Dòng 3.x của Tauri chỉ có alpha, không dùng.

Kiểm luật tuổi phát hành (ghi chú của bảng "Phiên bản đã chốt"): mỗi crate thêm vào phải ra ít nhất 1 ngày và không bị yanked.

Run:
```bash
for c in tauri-plugin-store@2.5.0 tauri-plugin-single-instance@2.5.2 tauri-plugin-autostart@2.7.0 tauri-plugin-opener@2.7.0 tauri-plugin-log@2.10.0 keyring-core@1.0.0 apple-native-keyring-store@1.0.2 windows-native-keyring-store@1.1.0 objc2-foundation@0.3.2 objc2-service-management@0.3.2 windows@0.62.2 sys-locale@0.3.2 log@0.4.34 yoke-derive@0.8.4; do
  curl -s -A "release-age-check" "https://crates.io/api/v1/crates/${c%@*}/${c#*@}" \
    | python3 -c 'import json, sys, datetime as d; v = json.load(sys.stdin)["version"]; age = d.datetime.now(d.timezone.utc) - d.datetime.fromisoformat(v["created_at"]); print(v["crate"], v["num"], v["created_at"][:16], "YANKED" if v["yanked"] else "ok", "đủ 1 ngày" if age >= d.timedelta(days=1) else "CHƯA ĐỦ 1 NGÀY")'
done
```
Expected: mọi dòng có `ok` và `đủ 1 ngày`. Lúc lập kế hoạch (2026-10-01 khoảng 01:40 UTC), ba dòng chưa đủ tuổi; lúc thực thi chúng phải đã đủ:
```text
tauri-plugin-store 2.5.0 2026-09-26T22:58 ok đủ 1 ngày
tauri-plugin-single-instance 2.5.2 2026-10-01T00:28 ok CHƯA ĐỦ 1 NGÀY
tauri-plugin-autostart 2.7.0 2026-10-01T00:27 ok CHƯA ĐỦ 1 NGÀY
tauri-plugin-opener 2.7.0 2026-09-29T20:05 ok đủ 1 ngày
tauri-plugin-log 2.10.0 2026-09-26T22:56 ok đủ 1 ngày
keyring-core 1.0.0 2026-04-21T18:51 ok đủ 1 ngày
apple-native-keyring-store 1.0.2 2026-08-06T15:44 ok đủ 1 ngày
windows-native-keyring-store 1.1.0 2026-05-24T20:15 ok đủ 1 ngày
objc2-foundation 0.3.2 2025-10-04T15:47 ok đủ 1 ngày
objc2-service-management 0.3.2 2025-10-04T16:33 ok đủ 1 ngày
windows 0.62.2 2025-10-06T19:19 ok đủ 1 ngày
sys-locale 0.3.2 2024-11-01T18:12 ok đủ 1 ngày
log 0.4.34 2026-08-22T11:44 ok đủ 1 ngày
yoke-derive 0.8.4 2026-09-30T13:19 ok CHƯA ĐỦ 1 NGÀY
```
Dòng nào còn `CHƯA ĐỦ 1 NGÀY` hay `YANKED` thì dùng bản ngay trước đó như ghi chú của bảng, và ghi lại trong kế hoạch.

- [ ] **Step 2: Sửa `src-tauri/Cargo.toml`** (thay toàn bộ file)

```toml
[package]
name = "meeting-translator"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[lib]
# Tên lib khác tên binary, để file output không trùng nhau trên Windows (rust-lang/cargo#8519).
name = "meeting_translator_lib"

[build-dependencies]
tauri-build = { version = "2.7.0", features = [] }

[dependencies]
keyring-core = "1.0.0"
log = "0.4.34"
serde.workspace = true
serde_json.workspace = true
sys-locale = "0.3.2"
tauri = { version = "2.12.0", features = ["macos-private-api", "tray-icon"] }
tauri-plugin-autostart = "2.7.0"
tauri-plugin-global-shortcut = "2.4.0"
tauri-plugin-log = "2.10.0"
tauri-plugin-opener = "2.7.0"
tauri-plugin-single-instance = "2.5.2"
tauri-plugin-store = "2.5.0"
thiserror.workspace = true

[target.'cfg(target_os = "macos")'.dependencies]
apple-native-keyring-store = { version = "1.0.2", features = ["keychain"] }
objc2 = "0.6.4"
objc2-foundation = { version = "0.3.2", default-features = false, features = ["std", "NSString", "NSURL"] }
objc2-service-management = { version = "0.3.2", default-features = false, features = ["std", "SMAppService", "objc2", "objc2-foundation"] }
tauri-nspanel = "2.1.0"

[target.'cfg(windows)'.dependencies]
windows = { version = "0.62.2", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }
windows-native-keyring-store = "1.1.0"

[dev-dependencies]
# `test`: MockRuntime để test ACL của từng cửa sổ mà không mở cửa sổ thật.
tauri = { version = "2.12.0", features = ["macos-private-api", "tray-icon", "test"] }
```

- [ ] **Step 3: Tách lib và binary**

Run:
```bash
git mv src-tauri/src/main.rs src-tauri/src/lib.rs
```

Trong `src-tauri/src/lib.rs`, xóa dòng `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` cùng dòng trống ngay sau nó, và đổi dòng
```rust
fn main() {
```
thành
```rust
pub fn run() {
```
Phần còn lại của file giữ nguyên code S5. Task 17 thay cả file này.

Tạo `src-tauri/src/main.rs`:

```rust
// Bản phát hành trên Windows không mở cửa sổ console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meeting_translator_lib::run();
}
```

- [ ] **Step 4: Cập nhật lockfile, bỏ bản `yoke-derive` đã bị yanked**

Run: `cargo update -p yoke-derive --precise 0.8.4`
Expected: cargo thêm các crate mới vào `Cargo.lock` (các dòng `Adding …`), và có dòng
```text
    Updating yoke-derive v0.8.3 -> v0.8.4
```

- [ ] **Step 5: Build lại, clippy, test, kiểm phụ thuộc**

Run:
```bash
cargo build -p meeting-translator
cargo clippy -p meeting-translator --all-targets -- -D warnings
cargo test --workspace 2>&1 | grep -E 'test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo deny check
cargo audit 2>&1 | tail -1
```
Expected:
- build và clippy không lỗi, không cảnh báo;
- test (lúc lập kế hoạch): `passed 144 failed 0 ignored 1` (chưa có test mới; test bỏ qua là `vad_reference`);
- `advisories ok, bans ok, licenses ok, sources ok`;
- `warning: 3 allowed warnings found` (ba cảnh báo cũ ghi ở bảng "Phiên bản đã chốt").

- [ ] **Step 6: Thêm Zustand và Vitest** (luật tuổi phát hành ở ghi chú của bảng "Phiên bản đã chốt")

Run:
```bash
pnpm add zustand@5.0.15
pnpm add -D vitest@5.0.3
ls pnpm-workspace.yaml
```
Expected: `package.json` có `"zustand": "5.0.15"` trong `dependencies` và `"vitest": "5.0.3"` trong `devDependencies`; lệnh `ls` báo `No such file or directory`.

Nếu `pnpm-workspace.yaml` xuất hiện, tức là pnpm vừa thêm `minimumReleaseAgeExclude` vì vitest 5.0.3 chưa đủ 1 ngày tuổi. Lúc lập kế hoạch đúng là như vậy, file có nội dung:
```text
minimumReleaseAgeExclude:
  - '@vitest/mocker@5.0.3'
  - '@vitest/spy@5.0.3'
  - vitest@5.0.3
```
Khi đó không commit file này, mà chạy:
```bash
rm pnpm-workspace.yaml
pnpm add -D vitest@5.0.2
ls pnpm-workspace.yaml
```
Expected: `"vitest": "5.0.2"` trong `devDependencies`; `ls` báo `No such file or directory`.

- [ ] **Step 7: Build giao diện, kiểm lỗ hổng và giấy phép**

Run:
```bash
pnpm build
pnpm audit
pnpm licenses list --prod
```
Expected:
- `pnpm build` in `✓ built in …`;
- `No known vulnerabilities found`;
- bảng giấy phép chỉ có `@tauri-apps/api` (Apache-2.0 OR MIT), `react`, `react-dom`, `scheduler`, `zustand` (MIT).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/main.rs Cargo.lock package.json pnpm-lock.yaml
git commit -m "build(app): thêm plugin Tauri, keyring-core, objc2, windows, Zustand, Vitest; tách src-tauri thành lib" -m "yoke-derive 0.8.3 đã bị yanked nên nâng lên 0.8.4 để cargo deny sạch." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 2: Đọc và kiểm phím tắt (TDD)

**Files:**
- Create: `src-tauri/src/hotkeys.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod hotkeys;`)

Ba việc có phím tắt (F10): bắt đầu/dừng, ẩn/hiện, khóa/mở khóa. Hàm `parse` đọc chuỗi từ giao diện (tối đa 64 ký tự), bắt phải có phím bổ trợ, và trả về dạng chuẩn để lưu. `check_all` kiểm trùng. Task 3 thêm luật đổi phím tắt; phần đăng ký thật với hệ điều hành ở Task 17.

- [ ] **Step 1: Khai báo module.** Trong `src-tauri/src/lib.rs`, thêm dòng sau ngay trên dòng `use std::sync::Arc;`, cách một dòng trống:

```rust
pub mod hotkeys;
```

Từ Task 4 trở đi, mỗi module mới thêm một dòng `pub mod …;` vào khối này, theo thứ tự chữ cái (`cargo fmt` cũng sắp như vậy).

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/hotkeys.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Phím tắt toàn cục (F10, spec §3.1): đọc, chuẩn hóa và kiểm trùng ba phím tắt.
//! Phần đăng ký với hệ điều hành nằm ở `hotkey_registry.rs`.

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical_of(accelerator: &str) -> Result<String, HotkeyError> {
        parse(accelerator).map(|(_, canonical)| canonical)
    }

    #[test]
    fn canonicalizes_modifier_order_and_key_names() {
        assert_eq!(canonical_of("Ctrl+Alt+T").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("control+alt+KeyT").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("Alt+Ctrl+t").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("Shift+Super+Digit1").unwrap(), "Shift+Super+1");
        assert_eq!(canonical_of("Cmd+Shift+F10").unwrap(), "Shift+Super+F10");
        assert_eq!(canonical_of("Ctrl+Alt+Space").unwrap(), "Ctrl+Alt+Space");
    }

    #[test]
    fn canonical_form_parses_back_to_same_shortcut() {
        for accelerator in [
            "Ctrl+Alt+T",
            "Shift+Super+1",
            "Ctrl+Alt+F10",
            "Alt+Shift+ArrowUp",
            "Ctrl+Backquote",
        ] {
            let (shortcut, canonical) = parse(accelerator).unwrap();
            let (again, _) = parse(&canonical).unwrap();
            assert_eq!(shortcut.id(), again.id(), "{accelerator}");
        }
    }

    #[test]
    fn rejects_malformed_accelerators() {
        assert_eq!(canonical_of(""), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("   "), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Alt+"), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Alt+T+Y"), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Hyper+T"), Err(HotkeyError::Invalid));
        assert_eq!(
            canonical_of(&format!("Ctrl+{}", "A".repeat(80))),
            Err(HotkeyError::Invalid)
        );
    }

    #[test]
    fn requires_a_modifier() {
        assert_eq!(canonical_of("T"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("F10"), Err(HotkeyError::NoModifier));
    }

    #[test]
    fn check_all_reports_first_duplicate_or_invalid() {
        let ok = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleOverlay, "Ctrl+Alt+H"),
            (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
        ];
        assert_eq!(check_all(&ok), Ok(()));
        let duplicate = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleOverlay, "control+alt+KeyT"),
            (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
        ];
        assert_eq!(
            check_all(&duplicate),
            Err((HotkeyAction::ToggleOverlay, HotkeyError::Duplicate))
        );
        let invalid = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleLock, "L"),
        ];
        assert_eq!(
            check_all(&invalid),
            Err((HotkeyAction::ToggleLock, HotkeyError::NoModifier))
        );
    }

    #[test]
    fn action_keys_match_settings_fields() {
        let keys: Vec<_> = HotkeyAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(keys, ["toggleSession", "toggleOverlay", "toggleLock"]);
        assert_eq!(
            serde_json::to_string(&HotkeyAction::ToggleLock).unwrap(),
            "\"toggleLock\""
        );
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib hotkeys::`
Expected: FAIL, biên dịch lỗi vì chưa có code:
```text
error[E0425]: cannot find type `HotkeyError` in this scope
error[E0425]: cannot find function `parse` in this scope
error[E0433]: cannot find type `HotkeyError` in this scope
error[E0433]: cannot find type `HotkeyAction` in this scope
error[E0425]: cannot find function `check_all` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau vào `src-tauri/src/hotkeys.rs`, ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

/// Ba việc có phím tắt toàn cục.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    /// Bắt đầu hoặc dừng phiên dịch.
    ToggleSession,
    /// Ẩn hoặc hiện thanh phụ đề.
    ToggleOverlay,
    /// Khóa hoặc mở khóa thanh phụ đề (click xuyên qua).
    ToggleLock,
}

impl HotkeyAction {
    pub const ALL: [HotkeyAction; 3] = [Self::ToggleSession, Self::ToggleOverlay, Self::ToggleLock];

    /// Tên khóa con trong `hotkeys` của cài đặt.
    pub fn key(self) -> &'static str {
        match self {
            Self::ToggleSession => "toggleSession",
            Self::ToggleOverlay => "toggleOverlay",
            Self::ToggleLock => "toggleLock",
        }
    }
}

/// Lý do một phím tắt không dùng được.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum HotkeyError {
    #[error("không đọc được phím tắt")]
    Invalid,
    #[error("phím tắt phải có ít nhất một phím bổ trợ (Ctrl, Alt, Shift, Cmd hoặc Win)")]
    NoModifier,
    #[error("phím tắt đang dùng cho việc khác của app")]
    Duplicate,
    #[error("hệ điều hành không cho đăng ký phím tắt này")]
    RegisterFailed,
}

/// Chuỗi phím tắt dài hơn mức này thì coi là không hợp lệ (dữ liệu từ giao diện, spec §10.2).
const MAX_LEN: usize = 64;

/// Đọc chuỗi phím tắt, ví dụ `"Ctrl+Alt+T"` hoặc `"control+alt+KeyT"`.
/// Trả về phím tắt đã đọc và dạng chuẩn để lưu vào cài đặt.
pub fn parse(accelerator: &str) -> Result<(Shortcut, String), HotkeyError> {
    if accelerator.trim().is_empty() || accelerator.len() > MAX_LEN {
        return Err(HotkeyError::Invalid);
    }
    let shortcut: Shortcut = accelerator.parse().map_err(|_| HotkeyError::Invalid)?;
    let modifiers = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT | Modifiers::SUPER;
    if (shortcut.mods & modifiers).is_empty() {
        return Err(HotkeyError::NoModifier);
    }
    Ok((shortcut, canonical(&shortcut)))
}

/// Dạng chuẩn: phím bổ trợ theo thứ tự Ctrl, Alt, Shift, Super, rồi tới phím chính.
/// `KeyT` viết là `T`, `Digit1` viết là `1`; phím khác giữ tên theo W3C (`F10`, `Space`).
fn canonical(shortcut: &Shortcut) -> String {
    let mut parts: Vec<String> = [
        (Modifiers::CONTROL, "Ctrl"),
        (Modifiers::ALT, "Alt"),
        (Modifiers::SHIFT, "Shift"),
        (Modifiers::SUPER, "Super"),
    ]
    .into_iter()
    .filter(|(modifier, _)| shortcut.mods.contains(*modifier))
    .map(|(_, name)| name.to_string())
    .collect();
    let code = shortcut.key.to_string();
    let key = ["Key", "Digit"]
        .iter()
        .find_map(|prefix| code.strip_prefix(prefix).filter(|rest| rest.len() == 1))
        .unwrap_or(&code);
    parts.push(key.to_string());
    parts.join("+")
}

/// Kiểm cả bộ phím tắt: mỗi phím đọc được, có phím bổ trợ, và không trùng phím của việc khác.
/// Lỗi trả về việc gặp lỗi đầu tiên theo thứ tự của `bindings`.
pub fn check_all(bindings: &[(HotkeyAction, &str)]) -> Result<(), (HotkeyAction, HotkeyError)> {
    let mut seen: Vec<String> = Vec::with_capacity(bindings.len());
    for (action, accelerator) in bindings {
        let (_, canonical) = parse(accelerator).map_err(|e| (*action, e))?;
        if seen.contains(&canonical) {
            return Err((*action, HotkeyError::Duplicate));
        }
        seen.push(canonical);
    }
    Ok(())
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib hotkeys::`
Expected:
```text
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo, không in gì từ `cargo fmt`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/hotkeys.rs src-tauri/src/lib.rs
git commit -m "feat(app): đọc, chuẩn hóa và kiểm trùng phím tắt toàn cục (F10)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 3: Đăng ký và đổi phím tắt, với bộ đăng ký giả (TDD)

**Files:**
- Modify: `src-tauri/src/hotkeys.rs`

Luật đổi phím tắt (QĐ24) nằm ở phần thuần, qua trait `Registrar`:
- phím mới không hợp lệ hay trùng thì không gọi hệ điều hành;
- đặt lại đúng phím đang có thì không làm gì;
- hệ điều hành từ chối phím mới thì đăng ký lại phím cũ;
- nếu phím cũ cũng không đăng ký lại được thì báo `old_active: false`, để app đưa việc đó vào danh sách phím tắt lỗi.

Bản `Registrar` thật bọc `tauri-plugin-global-shortcut` ở Task 17.

- [ ] **Step 1: Viết test trước.** Trong `src-tauri/src/hotkeys.rs`, thêm đoạn sau vào cuối `mod tests`, ngay trước dấu `}` đóng module:

```rust
    /// Bộ đăng ký giả: từ chối các tổ hợp trong `refused`, ghi lại các lần gọi.
    #[derive(Default)]
    struct FakeRegistrar {
        refused: std::cell::RefCell<Vec<String>>,
        calls: std::cell::RefCell<Vec<String>>,
    }

    impl FakeRegistrar {
        fn refuse(&self, accelerator: &str) {
            self.refused.borrow_mut().push(canonical_of(accelerator).unwrap());
        }
    }

    impl Registrar for FakeRegistrar {
        fn register(&self, shortcut: Shortcut) -> bool {
            let name = canonical(&shortcut);
            self.calls.borrow_mut().push(format!("+{name}"));
            !self.refused.borrow().contains(&name)
        }

        fn unregister(&self, shortcut: Shortcut) {
            self.calls.borrow_mut().push(format!("-{}", canonical(&shortcut)));
        }
    }

    const DEFAULTS: [(HotkeyAction, &str); 3] = [
        (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
        (HotkeyAction::ToggleOverlay, "Ctrl+Alt+H"),
        (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
    ];

    fn started(registrar: &FakeRegistrar) -> Bound {
        let mut bound = Bound::default();
        register_all(registrar, &mut bound, &DEFAULTS);
        registrar.calls.borrow_mut().clear();
        bound
    }

    #[test]
    fn register_all_reports_refused_shortcuts() {
        let registrar = FakeRegistrar::default();
        registrar.refuse("Ctrl+Alt+H");
        let mut bound = Bound::default();
        assert_eq!(
            register_all(&registrar, &mut bound, &DEFAULTS),
            [HotkeyAction::ToggleOverlay]
        );
        let t = parse("Ctrl+Alt+T").unwrap().0;
        assert_eq!(bound.action_for(t.id()), Some(HotkeyAction::ToggleSession));
        assert_eq!(bound.get(HotkeyAction::ToggleOverlay), None);
    }

    #[test]
    fn rebind_swaps_registration() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "control+alt+KeyK",
        );
        assert_eq!(result, Ok("Ctrl+Alt+K".to_string()));
        assert_eq!(*registrar.calls.borrow(), ["-Ctrl+Alt+T", "+Ctrl+Alt+K"]);
        let k = parse("Ctrl+Alt+K").unwrap().0;
        assert_eq!(bound.action_for(k.id()), Some(HotkeyAction::ToggleSession));
    }

    #[test]
    fn refused_shortcut_keeps_the_old_one() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        registrar.refuse("Ctrl+Alt+K");
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "Ctrl+Alt+K",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::RegisterFailed,
                old_active: true
            })
        );
        assert_eq!(*registrar.calls.borrow(), ["-Ctrl+Alt+T", "+Ctrl+Alt+K", "+Ctrl+Alt+T"]);
        assert_eq!(
            bound.get(HotkeyAction::ToggleSession),
            Some(parse("Ctrl+Alt+T").unwrap().0)
        );
    }

    #[test]
    fn losing_the_old_shortcut_too_is_reported() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        registrar.refuse("Ctrl+Alt+K");
        registrar.refuse("Ctrl+Alt+T");
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "Ctrl+Alt+K",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::RegisterFailed,
                old_active: false
            })
        );
        assert_eq!(bound.get(HotkeyAction::ToggleSession), None);
    }

    #[test]
    fn invalid_or_duplicate_shortcut_never_reaches_the_os() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleLock,
            "Ctrl+Alt+H",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::Duplicate,
                old_active: true
            })
        );
        let result = rebind(&registrar, &mut bound, &DEFAULTS, HotkeyAction::ToggleLock, "L");
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::NoModifier,
                old_active: true
            })
        );
        assert!(registrar.calls.borrow().is_empty());
    }

    #[test]
    fn same_shortcut_or_retry_after_startup_failure() {
        let registrar = FakeRegistrar::default();
        registrar.refuse("Ctrl+Alt+L");
        let mut bound = Bound::default();
        register_all(&registrar, &mut bound, &DEFAULTS);
        registrar.calls.borrow_mut().clear();
        // Đặt lại đúng phím đang có: không gọi hệ điều hành.
        assert_eq!(
            rebind(
                &registrar,
                &mut bound,
                &DEFAULTS,
                HotkeyAction::ToggleSession,
                "Ctrl+Alt+T"
            ),
            Ok("Ctrl+Alt+T".into())
        );
        assert!(registrar.calls.borrow().is_empty());
        // Việc chưa đăng ký được lúc khởi động: đổi sang phím khác thì đăng ký luôn.
        assert_eq!(
            rebind(
                &registrar,
                &mut bound,
                &DEFAULTS,
                HotkeyAction::ToggleLock,
                "Ctrl+Alt+K"
            ),
            Ok("Ctrl+Alt+K".into())
        );
        assert_eq!(*registrar.calls.borrow(), ["+Ctrl+Alt+K"]);
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib hotkeys::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0405]: cannot find trait `Registrar` in this scope
error[E0425]: cannot find type `Bound` in this scope
error[E0433]: cannot find type `Bound` in this scope
error[E0422]: cannot find struct, variant or union type `RebindError` in this scope
error[E0425]: cannot find function `register_all` in this scope
```

- [ ] **Step 3: Viết code.** Thay phần đầu file (các dòng `//!` và hai dòng `use`, tới trước `/// Ba việc có phím tắt toàn cục.`) bằng:

```rust
//! Phím tắt toàn cục (F10, spec §3.1): đọc, chuẩn hóa và kiểm trùng ba phím tắt; đăng ký và đổi phím
//! tắt qua một `Registrar`. Bản `Registrar` thật bọc `tauri-plugin-global-shortcut` (`hotkey_registry.rs`).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};
```

Rồi chèn đoạn sau ngay trên `#[cfg(test)]`:

```rust
/// Nơi đăng ký phím tắt với hệ điều hành. Test dùng bản giả.
pub trait Registrar {
    /// Đăng ký; `false` nếu hệ điều hành từ chối (ví dụ app khác đang giữ tổ hợp này trên Windows).
    fn register(&self, shortcut: Shortcut) -> bool;
    fn unregister(&self, shortcut: Shortcut);
}

/// Phím tắt đang đăng ký thành công, theo từng việc.
#[derive(Debug, Default)]
pub struct Bound(BTreeMap<HotkeyAction, Shortcut>);

impl Bound {
    /// Việc ứng với phím tắt vừa được bấm (`Shortcut::id()`).
    pub fn action_for(&self, id: u32) -> Option<HotkeyAction> {
        self.0.iter().find(|(_, s)| s.id() == id).map(|(a, _)| *a)
    }

    pub fn get(&self, action: HotkeyAction) -> Option<Shortcut> {
        self.0.get(&action).copied()
    }
}

/// Đăng ký cả bộ phím tắt lúc khởi động. Trả về các việc không đăng ký được.
pub fn register_all(
    registrar: &impl Registrar,
    bound: &mut Bound,
    bindings: &[(HotkeyAction, &str)],
) -> Vec<HotkeyAction> {
    let mut failures = Vec::new();
    for (action, accelerator) in bindings {
        match parse(accelerator) {
            Ok((shortcut, _)) if registrar.register(shortcut) => {
                bound.0.insert(*action, shortcut);
            }
            _ => failures.push(*action),
        }
    }
    failures
}

/// Đổi phím tắt thất bại.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RebindError {
    pub error: HotkeyError,
    /// Phím cũ của việc này còn đăng ký với hệ điều hành. `false` thì việc này đang không có phím tắt
    /// nào, và phải báo cho người dùng như lỗi lúc khởi động.
    pub old_active: bool,
}

/// Đổi phím tắt của `action`. `current` là cả bộ phím tắt hiện tại (dạng chuẩn).
/// Thành công thì trả về dạng chuẩn của phím mới. Hệ điều hành từ chối phím mới thì đăng ký lại phím cũ.
pub fn rebind(
    registrar: &impl Registrar,
    bound: &mut Bound,
    current: &[(HotkeyAction, &str)],
    action: HotkeyAction,
    accelerator: &str,
) -> Result<String, RebindError> {
    let fail = |error, bound: &Bound| RebindError {
        error,
        old_active: bound.get(action).is_some(),
    };
    let (shortcut, canonical) = parse(accelerator).map_err(|e| fail(e, bound))?;
    let next: Vec<(HotkeyAction, &str)> = current
        .iter()
        .map(|&(a, s)| if a == action { (a, canonical.as_str()) } else { (a, s) })
        .collect();
    check_all(&next).map_err(|(_, e)| fail(e, bound))?;
    if bound.get(action) == Some(shortcut) {
        return Ok(canonical);
    }
    let old = bound.0.remove(&action);
    if let Some(old) = old {
        registrar.unregister(old);
    }
    if registrar.register(shortcut) {
        bound.0.insert(action, shortcut);
        return Ok(canonical);
    }
    let restored = old.filter(|old| registrar.register(*old));
    if let Some(old) = restored {
        bound.0.insert(action, old);
    }
    Err(RebindError {
        error: HotkeyError::RegisterFailed,
        old_active: restored.is_some(),
    })
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib hotkeys::`
Expected:
```text
test result: ok. 12 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```

- [ ] **Step 5: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/hotkeys.rs
git commit -m "feat(app): đổi phím tắt qua Registrar, giữ phím cũ khi hệ điều hành từ chối phím mới" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 4: Kiểu cài đặt, giá trị mặc định, kiểm phạm vi (TDD)

**Files:**
- Create: `src-tauri/src/settings/mod.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod settings;`)

Mọi khóa của §6.9 cộng hai khóa ở QĐ3. `validate` là nơi phía Rust quyết định phạm vi (§10.2): giao diện gửi gì cũng qua đây. Lỗi trả về tên khóa (dạng `overlay.lines`) và mã lý do; giao diện dịch mã lý do thành câu báo lỗi.

Phạm vi:

| Khóa | Phạm vi |
|---|---|
| `vadEndSilenceMs` | 200–800 (§6.3) |
| `sourceLanguages` | không rỗng, không trùng |
| `audioSource.id`, `audioSource.bundleId` | 1–512 ký tự |
| `overlay.fontSize` | 14–48 |
| `overlay.lines` | 1–3 (§4.4) |
| `overlay.opacity` | 0–1, không phải NaN |
| `overlay.positions` | tối đa 16 màn hình; rộng 200–10 000, cao 40–4 000 điểm; số hữu hạn |
| `hotkeys.*` | đọc được, có phím bổ trợ, không trùng nhau |

- [ ] **Step 1: Khai báo module.** Thêm `pub mod settings;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/settings/mod.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Cài đặt của app (spec §6.9): kiểu, giá trị mặc định và luật kiểm phạm vi.
//! - `migrate.rs`: số phiên bản schema, các bước migrate, đọc file cũ.
//! - `patch.rs`: sửa một phần cài đặt theo yêu cầu từ giao diện.
//! - `persist.rs`: đọc ghi file bằng `tauri-plugin-store`.
//!
//! Kế hoạch sau thêm khóa thì thêm trường ở đây, thêm luật vào `validate`, và thêm một bước migrate
//! nếu khóa cũ đổi tên hay đổi nghĩa (khóa mới hoàn toàn thì chỉ cần giá trị mặc định).

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid() -> Settings {
        Settings::defaults(UiLanguage::Vi)
    }

    fn rejects(settings: Settings, field: &str, reason: Reason) {
        assert_eq!(settings.validate(), Err(Invalid::new(field, reason)));
    }

    #[test]
    fn defaults_follow_spec() {
        let vi = Settings::defaults(UiLanguage::Vi);
        assert_eq!(vi.validate(), Ok(()));
        assert_eq!(vi.target_language, Lang::Vi);
        assert_eq!(vi.source_languages, Lang::ALL.to_vec());
        assert_eq!(vi.vad_end_silence_ms, 300);
        assert!(!vi.save_history, "lưu lịch sử mặc định tắt (F4)");
        assert!(
            !vi.experimental.translation_context,
            "ngữ cảnh câu trước mặc định tắt (§6.5)"
        );
        assert_eq!(vi.update_channel, UpdateChannel::Stable);
        assert_eq!(
            vi.hotkeys.bindings().map(|(_, a)| a.to_string()),
            ["Ctrl+Alt+T", "Ctrl+Alt+H", "Ctrl+Alt+L"]
        );
        assert_eq!(Settings::defaults(UiLanguage::En).target_language, Lang::En);
    }

    #[test]
    fn serializes_with_camel_case_keys_of_spec() {
        let value = serde_json::to_value(valid()).unwrap();
        let keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
        for key in [
            "uiLanguage",
            "targetLanguage",
            "sourceLanguages",
            "sourceLock",
            "audioSource",
            "vadEndSilenceMs",
            "overlay",
            "modelTier",
            "hotkeys",
            "saveHistory",
            "launchAtLogin",
            "theme",
            "updateChannel",
            "experimental",
            "onboardingDone",
        ] {
            assert!(keys.contains(&key.to_string()), "thiếu khóa {key}");
        }
        assert_eq!(value["overlay"]["fontSize"], json!(22));
        assert_eq!(value["audioSource"], json!({ "kind": "system" }));
        assert_eq!(value["experimental"], json!({ "translationContext": false }));
        let app = AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        };
        assert_eq!(
            serde_json::to_value(app).unwrap(),
            json!({ "kind": "app", "bundleId": "us.zoom.xos" })
        );
    }

    #[test]
    fn rejects_out_of_range_values() {
        let mut s = valid();
        s.vad_end_silence_ms = 199;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.vad_end_silence_ms = 801;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.lines = 4;
        rejects(s, "overlay.lines", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.font_size = 13;
        rejects(s, "overlay.fontSize", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.opacity = 1.5;
        rejects(s, "overlay.opacity", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.opacity = f64::NAN;
        rejects(s, "overlay.opacity", Reason::OutOfRange);
    }

    #[test]
    fn accepts_range_bounds() {
        let mut s = valid();
        s.vad_end_silence_ms = 200;
        s.overlay.lines = 3;
        s.overlay.font_size = 48;
        s.overlay.opacity = 0.0;
        assert_eq!(s.validate(), Ok(()));
        s.vad_end_silence_ms = 800;
        s.overlay.lines = 1;
        s.overlay.opacity = 1.0;
        assert_eq!(s.validate(), Ok(()));
    }

    #[test]
    fn source_languages_must_be_non_empty_and_unique() {
        let mut s = valid();
        s.source_languages.clear();
        rejects(s, "sourceLanguages", Reason::Empty);
        let mut s = valid();
        s.source_languages = vec![Lang::En, Lang::Vi, Lang::En];
        rejects(s, "sourceLanguages", Reason::Duplicate);
    }

    #[test]
    fn audio_source_ids_are_bounded() {
        let mut s = valid();
        s.audio_source = AudioSource::Device { id: String::new() };
        rejects(s, "audioSource", Reason::Empty);
        let mut s = valid();
        s.audio_source = AudioSource::App {
            bundle_id: "x".repeat(513),
        };
        rejects(s, "audioSource", Reason::TooLong);
    }

    #[test]
    fn overlay_positions_are_bounded() {
        let rect = OverlayRect {
            x: 10.0,
            y: 10.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        };
        let mut s = valid();
        s.overlay.positions.insert("Built-in 3024x1964".into(), rect);
        assert_eq!(s.validate(), Ok(()));
        let mut s = valid();
        s.overlay
            .positions
            .insert("m".into(), OverlayRect { width: 50.0, ..rect });
        rejects(s, "overlay.positions", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.positions.insert(
            "m".into(),
            OverlayRect {
                x: f64::INFINITY,
                ..rect
            },
        );
        rejects(s, "overlay.positions", Reason::OutOfRange);
        let mut s = valid();
        for i in 0..=MAX_OVERLAY_POSITIONS {
            s.overlay.positions.insert(format!("m{i}"), rect);
        }
        rejects(s, "overlay.positions", Reason::TooLong);
    }

    #[test]
    fn hotkeys_must_be_valid_and_distinct() {
        let mut s = valid();
        s.hotkeys.toggle_lock = "L".into();
        rejects(s, "hotkeys.toggleLock", Reason::InvalidHotkey);
        let mut s = valid();
        s.hotkeys.toggle_overlay = "Ctrl+Alt+T".into();
        rejects(s, "hotkeys.toggleOverlay", Reason::Duplicate);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib settings::tests`
Expected: FAIL, biên dịch lỗi, ví dụ:
```text
error[E0425]: cannot find type `Settings` in this scope
error[E0425]: cannot find type `Reason` in this scope
error[E0422]: cannot find struct, variant or union type `OverlayRect` in this scope
error[E0425]: cannot find value `MAX_OVERLAY_POSITIONS` in this scope
error[E0433]: cannot find type `Settings` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::hotkeys::{self, HotkeyAction, HotkeyError};

/// Ngôn ngữ giao diện (§4.5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UiLanguage {
    En,
    Vi,
}

/// Năm ngôn ngữ của F2, dùng cho ngôn ngữ đích và tập ngôn ngữ nguồn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    En,
    Zh,
    Ja,
    Ko,
    Vi,
}

impl Lang {
    pub const ALL: [Lang; 5] = [Lang::En, Lang::Zh, Lang::Ja, Lang::Ko, Lang::Vi];
}

/// Nguồn âm thanh (§4.3, §6.1). Kế hoạch 02 dùng giá trị này để chọn cách thu.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AudioSource {
    /// Windows: chế độ tự động (thiết bị Console và Communications). macOS: toàn hệ thống, trừ chính app.
    System,
    /// Windows: một thiết bị phát chọn tay, theo ID endpoint.
    Device { id: String },
    /// macOS: chỉ tap một app, theo bundle ID.
    App { bundle_id: String },
}

/// Gói model (§6.7). `None` là chưa chọn; kế hoạch 04 đặt giá trị này.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    Standard,
    Lite,
}

/// Giao diện sáng/tối (§4.3, nhóm Chung).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// Kênh cập nhật (§6.11). Kế hoạch 07 đọc giá trị này.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Beta,
}

/// Vị trí và kích thước thanh phụ đề trên một màn hình, tính bằng điểm logic so với góc trên
/// bên trái vùng làm việc của màn hình đó.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Lần cuối thanh phụ đề nằm trên màn hình này (giây Unix), để bỏ màn hình lâu không dùng nhất.
    #[serde(default)]
    pub last_used: u64,
}

/// Cài đặt của thanh phụ đề (§4.4). Kế hoạch 03 làm nhóm Cài đặt "Phụ đề" trên các khóa này.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub font_size: u32,
    pub lines: u32,
    /// Độ mờ của nền, 0 là trong suốt hẳn.
    pub opacity: f64,
    pub show_source: bool,
    pub locked: bool,
    /// Vị trí đã nhớ theo từng màn hình, khóa là `overlay::placement::monitor_key`.
    pub positions: BTreeMap<String, OverlayRect>,
    /// Màn hình của lần đặt thanh phụ đề gần nhất.
    pub last_monitor: Option<String>,
}

/// Phím tắt toàn cục (F10), lưu ở dạng chuẩn của `hotkeys::parse`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkeys {
    pub toggle_session: String,
    pub toggle_overlay: String,
    pub toggle_lock: String,
}

impl Hotkeys {
    pub fn get(&self, action: HotkeyAction) -> &str {
        match action {
            HotkeyAction::ToggleSession => &self.toggle_session,
            HotkeyAction::ToggleOverlay => &self.toggle_overlay,
            HotkeyAction::ToggleLock => &self.toggle_lock,
        }
    }

    pub fn set(&mut self, action: HotkeyAction, accelerator: String) {
        match action {
            HotkeyAction::ToggleSession => self.toggle_session = accelerator,
            HotkeyAction::ToggleOverlay => self.toggle_overlay = accelerator,
            HotkeyAction::ToggleLock => self.toggle_lock = accelerator,
        }
    }

    pub fn bindings(&self) -> [(HotkeyAction, &str); 3] {
        HotkeyAction::ALL.map(|action| (action, self.get(action)))
    }
}

/// Cờ thử nghiệm (§6.5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Experimental {
    /// Đưa câu trước vào làm ngữ cảnh khi dịch. Mặc định tắt (S7).
    pub translation_context: bool,
}

/// Toàn bộ cài đặt. Tên khóa trong file JSON là tên trường dạng camelCase.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ui_language: UiLanguage,
    pub target_language: Lang,
    pub source_languages: Vec<Lang>,
    /// Khóa cố định một ngôn ngữ nguồn; `None` là tự nhận diện trong `source_languages`.
    pub source_lock: Option<Lang>,
    pub audio_source: AudioSource,
    /// Im lặng bao lâu thì chốt đoạn (§6.3, "Độ nhạy ngắt câu").
    pub vad_end_silence_ms: u32,
    pub overlay: OverlaySettings,
    pub model_tier: Option<ModelTier>,
    pub hotkeys: Hotkeys,
    pub save_history: bool,
    pub launch_at_login: bool,
    pub theme: Theme,
    pub update_channel: UpdateChannel,
    pub experimental: Experimental,
    /// Đã đi hết các bước lần đầu mở app (§4.1).
    pub onboarding_done: bool,
}

pub const VAD_END_SILENCE_MS: std::ops::RangeInclusive<u32> = 200..=800;
pub const OVERLAY_FONT_SIZE: std::ops::RangeInclusive<u32> = 14..=48;
pub const OVERLAY_LINES: std::ops::RangeInclusive<u32> = 1..=3;
pub const OVERLAY_WIDTH: std::ops::RangeInclusive<f64> = 200.0..=10_000.0;
pub const OVERLAY_HEIGHT: std::ops::RangeInclusive<f64> = 40.0..=4_000.0;
/// Số màn hình nhớ vị trí tối đa, để file cài đặt không phình ra.
pub const MAX_OVERLAY_POSITIONS: usize = 16;
const MAX_ID_LEN: usize = 512;

impl Settings {
    /// Giá trị mặc định. Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (§4.1, bước 5).
    pub fn defaults(ui_language: UiLanguage) -> Self {
        let target_language = match ui_language {
            UiLanguage::En => Lang::En,
            UiLanguage::Vi => Lang::Vi,
        };
        Self {
            ui_language,
            target_language,
            source_languages: Lang::ALL.to_vec(),
            source_lock: None,
            audio_source: AudioSource::System,
            vad_end_silence_ms: 300,
            overlay: OverlaySettings {
                font_size: 22,
                lines: 2,
                opacity: 0.6,
                show_source: false,
                locked: false,
                positions: BTreeMap::new(),
                last_monitor: None,
            },
            model_tier: None,
            hotkeys: Hotkeys {
                toggle_session: "Ctrl+Alt+T".into(),
                toggle_overlay: "Ctrl+Alt+H".into(),
                toggle_lock: "Ctrl+Alt+L".into(),
            },
            save_history: false,
            launch_at_login: false,
            theme: Theme::System,
            update_channel: UpdateChannel::Stable,
            experimental: Experimental {
                translation_context: false,
            },
            onboarding_done: false,
        }
    }

    /// Kiểm phạm vi mọi khóa. Phía Rust là nơi quyết định: giao diện gửi gì cũng qua đây (§10.2).
    pub fn validate(&self) -> Result<(), Invalid> {
        if !VAD_END_SILENCE_MS.contains(&self.vad_end_silence_ms) {
            return Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange));
        }
        if self.source_languages.is_empty() {
            return Err(Invalid::new("sourceLanguages", Reason::Empty));
        }
        let mut seen = Vec::with_capacity(self.source_languages.len());
        for lang in &self.source_languages {
            if seen.contains(lang) {
                return Err(Invalid::new("sourceLanguages", Reason::Duplicate));
            }
            seen.push(*lang);
        }
        match &self.audio_source {
            AudioSource::System => {}
            AudioSource::Device { id } => check_id("audioSource", id)?,
            AudioSource::App { bundle_id } => check_id("audioSource", bundle_id)?,
        }
        let overlay = &self.overlay;
        if !OVERLAY_FONT_SIZE.contains(&overlay.font_size) {
            return Err(Invalid::new("overlay.fontSize", Reason::OutOfRange));
        }
        if !OVERLAY_LINES.contains(&overlay.lines) {
            return Err(Invalid::new("overlay.lines", Reason::OutOfRange));
        }
        if !(0.0..=1.0).contains(&overlay.opacity) {
            return Err(Invalid::new("overlay.opacity", Reason::OutOfRange));
        }
        if overlay.positions.len() > MAX_OVERLAY_POSITIONS {
            return Err(Invalid::new("overlay.positions", Reason::TooLong));
        }
        for (key, rect) in &overlay.positions {
            check_id("overlay.positions", key)?;
            let finite = [rect.x, rect.y, rect.width, rect.height].iter().all(|v| v.is_finite());
            if !finite || !OVERLAY_WIDTH.contains(&rect.width) || !OVERLAY_HEIGHT.contains(&rect.height) {
                return Err(Invalid::new("overlay.positions", Reason::OutOfRange));
            }
        }
        if let Some(key) = &overlay.last_monitor {
            check_id("overlay.lastMonitor", key)?;
        }
        hotkeys::check_all(&self.hotkeys.bindings()).map_err(|(action, error)| {
            let reason = match error {
                HotkeyError::Duplicate => Reason::Duplicate,
                _ => Reason::InvalidHotkey,
            };
            Invalid::new(format!("hotkeys.{}", action.key()), reason)
        })?;
        Ok(())
    }
}

fn check_id(field: &str, value: &str) -> Result<(), Invalid> {
    if value.is_empty() {
        return Err(Invalid::new(field, Reason::Empty));
    }
    if value.len() > MAX_ID_LEN {
        return Err(Invalid::new(field, Reason::TooLong));
    }
    Ok(())
}

/// Lý do một khóa cài đặt bị từ chối. Giao diện dịch mã này thành câu báo lỗi.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    OutOfRange,
    Empty,
    Duplicate,
    TooLong,
    InvalidHotkey,
    WrongType,
    UnknownKey,
    ReadOnly,
    NotObject,
}

/// Một khóa cài đặt không hợp lệ.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("cài đặt `{field}` không hợp lệ ({reason:?})")]
pub struct Invalid {
    pub field: String,
    pub reason: Reason,
}

impl Invalid {
    pub fn new(field: impl Into<String>, reason: Reason) -> Self {
        Self {
            field: field.into(),
            reason,
        }
    }
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib settings::tests`
Expected:
```text
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 12 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings/mod.rs src-tauri/src/lib.rs
git commit -m "feat(app): kiểu cài đặt theo §6.9, giá trị mặc định và kiểm phạm vi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 5: Số phiên bản schema và migrate (TDD)

**Files:**
- Create: `src-tauri/src/settings/migrate.rs`
- Modify: `src-tauri/src/settings/mod.rs` (thêm `pub mod migrate;`)

Theo QĐ2.
- Bản 0 là file chưa có `schemaVersion`. Bản 1 là bản đầu tiên có số phiên bản, các khóa giữ tên, nên bước 0→1 không đổi gì.
- Test cơ chế migrate bằng một schema cũ giả (đổi tên khóa, đổi kiểu giá trị), chạy qua `load_with`.
- File của bản app mới hơn:
  - khóa không đọc được không làm `needs_save` thành true, và `to_entries` ghi lại giá trị thô của khóa đó, trừ khi người dùng đã đổi chính nó;
  - khóa con lạ trong nhóm (`overlay`, `hotkeys`, `experimental`) được giữ trong `FileMeta::unknown` và ghép lại khi ghi.
  - Hạn chế, chấp nhận cho MVP: người dùng cố ý chọn đúng giá trị mặc định cho một khóa đang được giữ thì giá trị thô vẫn được ghi lại (QĐ2).

Khi một kế hoạch sau đổi tên hay đổi nghĩa một khóa: thêm một hàm `vN_to_vN1` vào cuối `MIGRATIONS` (không sửa bước cũ), thêm test đọc file bản N, và `CURRENT_SCHEMA_VERSION` tự tăng theo.

- [ ] **Step 1: Khai báo module.** Trong `src-tauri/src/settings/mod.rs`, thêm dòng sau dưới các dòng `//!`, cách một dòng trống, trên `use std::collections::BTreeMap;`:

```rust
pub mod migrate;
```

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/settings/migrate.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Số phiên bản schema và bước migrate của file cài đặt (spec §6.9).
//!
//! File là một object JSON phẳng ở mức trên cùng (mỗi khóa của `Settings` là một mục của store),
//! cộng khóa `schemaVersion`. Bản 0 là file chưa có `schemaVersion`.
//!
//! Khi đọc:
//! 1. Chạy lần lượt các bước migrate từ phiên bản của file lên `CURRENT_SCHEMA_VERSION`.
//! 2. Ghép từng khóa của file vào giá trị mặc định. Khóa nào sai kiểu hay ngoài phạm vi thì giữ
//!    giá trị mặc định và ghi vào `rejected`; không bỏ cả file vì một khóa hỏng.
//! 3. Khóa lạ (ví dụ của bản app mới hơn) bị bỏ qua khi đọc, nhưng vẫn nằm nguyên trong file, vì
//!    `persist::save` chỉ ghi các khóa nó biết.
//! 4. File do bản app mới hơn ghi (`schemaVersion` lớn hơn bản hiện tại): khóa không đọc được có thể
//!    là giá trị hợp lệ của bản mới. App dùng mặc định trong lúc chạy, nhưng giữ nguyên giá trị thô
//!    khi ghi file, trừ khi người dùng đổi chính khóa đó (`FileMeta::preserved`). Khóa con lạ trong
//!    các nhóm (ví dụ `overlay.futureSub`) cũng được ghép lại khi ghi (`FileMeta::unknown`), vì store
//!    ghi cả nhóm một lần.
//!    Hạn chế, chấp nhận cho MVP: người dùng cố ý chọn đúng giá trị mặc định cho một khóa đang được giữ
//!    thì lần ghi sau vẫn ghi lại giá trị thô của file.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Lang, Theme, UiLanguage};
    use serde_json::json;

    fn defaults() -> Settings {
        Settings::defaults(UiLanguage::En)
    }

    fn object(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn empty_file_gives_defaults_and_needs_save() {
        let loaded = load(Map::new(), defaults());
        assert_eq!(loaded.settings, defaults());
        assert_eq!(loaded.meta.version, 0);
        assert!(loaded.rejected.is_empty());
        assert!(loaded.needs_save());
    }

    #[test]
    fn saved_entries_load_back_unchanged() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.theme = Theme::Dark;
        settings.vad_end_silence_ms = 450;
        settings.overlay.lines = 3;
        settings.source_lock = Some(Lang::Ja);
        let raw: Map<String, Value> = to_entries(&settings, &FileMeta::current()).into_iter().collect();
        assert_eq!(raw[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings, settings);
        assert!(!loaded.needs_save());
    }

    #[test]
    fn unversioned_file_is_migrated_to_current_version() {
        let raw = object(json!({ "uiLanguage": "vi", "theme": "light" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.meta.version, 0);
        assert_eq!(loaded.settings.ui_language, UiLanguage::Vi);
        assert_eq!(loaded.settings.theme, Theme::Light);
        assert!(loaded.needs_save());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(1));
    }

    #[test]
    fn migrations_run_in_order_from_file_version() {
        // Giả lập một schema cũ: bản 0 gọi khóa là `vadSilence`, bản 1 đổi thành `vadEndSilenceMs`,
        // bản 2 đổi đơn vị theme từ số sang chữ.
        fn rename_vad(raw: &mut Map<String, Value>) {
            if let Some(v) = raw.remove("vadSilence") {
                raw.insert("vadEndSilenceMs".into(), v);
            }
        }
        fn theme_from_number(raw: &mut Map<String, Value>) {
            if let Some(n) = raw.get("theme").and_then(Value::as_u64) {
                raw.insert("theme".into(), json!(if n == 2 { "dark" } else { "light" }));
            }
        }
        let steps: &[Migration] = &[rename_vad, theme_from_number];
        let v0 = object(json!({ "vadSilence": 500, "theme": 2 }));
        let loaded = load_with(v0, defaults(), steps);
        assert_eq!(loaded.settings.vad_end_silence_ms, 500);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        // File đã ở bản 1 thì chỉ chạy bước thứ hai.
        let v1 = object(json!({ "schemaVersion": 1, "vadSilence": 500, "theme": 2 }));
        let loaded = load_with(v1, defaults(), steps);
        assert_eq!(loaded.settings.vad_end_silence_ms, 300, "bước 0→1 không chạy lại");
        assert_eq!(loaded.settings.theme, Theme::Dark);
    }

    #[test]
    fn invalid_keys_fall_back_to_defaults_one_by_one() {
        let raw = object(json!({
            "schemaVersion": 1,
            "uiLanguage": "fr",
            "vadEndSilenceMs": 5000,
            "theme": "dark",
            "overlay": { "lines": 9, "fontSize": 30, "opacity": "đậm" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.ui_language, UiLanguage::En);
        assert_eq!(loaded.settings.vad_end_silence_ms, 300);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        assert_eq!(loaded.settings.overlay.font_size, 30, "khóa con hợp lệ vẫn được giữ");
        assert_eq!(loaded.settings.overlay.lines, 2);
        assert_eq!(loaded.settings.overlay.opacity, 0.6);
        let mut rejected = loaded.rejected.clone();
        rejected.sort();
        assert_eq!(
            rejected,
            ["overlay.lines", "overlay.opacity", "uiLanguage", "vadEndSilenceMs"]
        );
        assert!(loaded.needs_save());
    }

    #[test]
    fn swapped_hotkeys_are_kept_together() {
        let raw = object(json!({
            "schemaVersion": 1,
            "hotkeys": { "toggleSession": "Ctrl+Alt+H", "toggleOverlay": "Ctrl+Alt+T" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+H");
        assert_eq!(loaded.settings.hotkeys.toggle_overlay, "Ctrl+Alt+T");
        assert!(loaded.rejected.is_empty());
    }

    #[test]
    fn newer_file_keeps_its_version_and_unknown_keys_are_ignored() {
        let raw = object(json!({ "schemaVersion": 7, "theme": "dark", "futureKey": { "a": 1 } }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.meta.version, 7);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        assert!(!loaded.needs_save());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(7), "không hạ phiên bản của file");
        assert!(
            !entries.contains_key("futureKey"),
            "chỉ ghi khóa đã biết; khóa lạ trong file giữ nguyên"
        );
    }

    #[test]
    fn newer_file_keeps_values_this_version_cannot_read() {
        // Bản app mới hơn (schema 7) ghi `theme: 2` và `overlay.lines: 9`; bản này không đọc được.
        let raw = object(json!({
            "schemaVersion": 7,
            "theme": 2,
            "overlay": { "lines": 9, "fontSize": 30 },
        }));
        let loaded = load(raw, defaults());
        let mut rejected = loaded.rejected.clone();
        rejected.sort();
        assert_eq!(rejected, ["overlay.lines", "theme"]);
        assert_eq!(loaded.settings.theme, Theme::System, "lúc chạy dùng mặc định");
        assert!(!loaded.needs_save(), "không ghi đè file chỉ vì đọc không được");
        // Ghi lại (ví dụ người dùng đổi khóa khác): giữ giá trị thô của file.
        let mut settings = loaded.settings.clone();
        settings.vad_end_silence_ms = 500;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!(2));
        assert_eq!(entries["overlay"]["lines"], json!(9));
        assert_eq!(entries["overlay"]["fontSize"], json!(30));
        assert_eq!(entries["vadEndSilenceMs"], json!(500));
        // Người dùng tự đổi chính khóa đó: ghi giá trị mới.
        settings.theme = Theme::Dark;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!("dark"));
    }

    #[test]
    fn newer_file_keeps_unknown_sub_keys_of_groups() {
        let raw = object(json!({
            "schemaVersion": 7,
            "overlay": { "fontSize": 30, "futureSub": 1 },
            "experimental": { "newFlag": true },
        }));
        let loaded = load(raw, defaults());
        assert!(loaded.rejected.is_empty());
        assert_eq!(loaded.settings.overlay.font_size, 30);
        assert!(!loaded.needs_save());
        // Ghi lại sau khi người dùng đổi một khóa con của chính nhóm đó.
        let mut settings = loaded.settings.clone();
        settings.overlay.lines = 3;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["overlay"]["futureSub"], json!(1));
        assert_eq!(entries["overlay"]["fontSize"], json!(30));
        assert_eq!(entries["overlay"]["lines"], json!(3));
        assert_eq!(entries["experimental"]["newFlag"], json!(true));
        assert_eq!(entries["experimental"]["translationContext"], json!(false));
        // File cùng phiên bản: khóa con lạ không phải của bản nào cả, không giữ.
        let raw = object(json!({ "schemaVersion": 1, "overlay": { "futureSub": 1 } }));
        let loaded = load(raw, defaults());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert!(entries["overlay"].get("futureSub").is_none());
    }

    #[test]
    fn current_version_file_with_bad_keys_is_repaired() {
        let raw = object(json!({ "schemaVersion": 1, "theme": 2 }));
        let loaded = load(raw, defaults());
        assert!(loaded.needs_save());
        assert!(loaded.meta.preserved.is_empty());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!("system"));
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib settings::migrate`
Expected: FAIL, biên dịch lỗi, ví dụ:
```text
error[E0425]: cannot find type `Settings` in this scope
error[E0433]: cannot find type `Settings` in this scope
error[E0425]: cannot find type `Value` in this scope
error[E0425]: cannot find type `Map` in this scope
error[E0433]: cannot find type `Map` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::collections::BTreeMap;

use serde_json::{Map, Value};

use super::Settings;

pub const SCHEMA_VERSION_KEY: &str = "schemaVersion";

/// Một bước migrate: sửa object thô của file từ phiên bản `i` lên `i + 1`.
pub type Migration = fn(&mut Map<String, Value>);

/// `MIGRATIONS[i]` nâng file từ phiên bản `i` lên `i + 1`.
/// Thêm bước mới ở cuối; không sửa bước cũ, vì máy người dùng có thể còn file ở mọi phiên bản.
pub const MIGRATIONS: &[Migration] = &[v0_to_v1];

pub const CURRENT_SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

/// Bản 1 là bản đầu tiên có số phiên bản, các khóa giữ nguyên tên. Bước này chỉ để file bản 0
/// (chưa có `schemaVersion`) đi qua cùng một đường với mọi bản sau.
fn v0_to_v1(_raw: &mut Map<String, Value>) {}

/// Khóa là object con: ghép theo từng khóa con, để một khóa con hỏng không kéo cả nhóm về mặc định.
const NESTED: &[&str] = &["overlay", "hotkeys", "experimental"];

/// Giá trị thô của một khóa không đọc được trong file của bản app mới hơn.
#[derive(Clone, Debug, PartialEq)]
pub struct Preserved {
    /// Giá trị trong file.
    pub raw: Value,
    /// Giá trị app dùng thay (mặc định). Lúc ghi, nếu khóa vẫn giữ giá trị này thì ghi lại `raw`.
    pub fallback: Value,
}

/// Những gì cần nhớ về file để ghi lại cho đúng.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FileMeta {
    /// Phiên bản ghi trong file (0 nếu chưa có). Lớn hơn `CURRENT_SCHEMA_VERSION` khi file do bản app
    /// mới hơn ghi; khi đó giữ nguyên số này lúc lưu, không hạ phiên bản.
    pub version: u32,
    /// Chỉ có khi file mới hơn bản hiện tại. Khóa dạng `theme` hoặc `overlay.lines`.
    pub preserved: BTreeMap<String, Preserved>,
    /// Chỉ có khi file mới hơn bản hiện tại: khóa con bản này không biết, theo từng nhóm (`overlay`,
    /// `hotkeys`, `experimental`).
    pub unknown: BTreeMap<String, Map<String, Value>>,
}

impl FileMeta {
    /// File vừa tạo bởi bản hiện tại.
    pub fn current() -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            ..Self::default()
        }
    }
}

/// Kết quả đọc file cài đặt.
#[derive(Debug, PartialEq)]
pub struct Loaded {
    pub settings: Settings,
    pub meta: FileMeta,
    /// Các khóa trong file bị bỏ vì sai kiểu hoặc ngoài phạm vi, dạng `overlay.lines`.
    pub rejected: Vec<String>,
}

impl Loaded {
    /// Có cần ghi lại file không: file cũ hơn bản hiện tại; hoặc file cùng bản có khóa hỏng (ghi lại
    /// giá trị mặc định). File của bản mới hơn thì không ghi chỉ vì có khóa không đọc được.
    pub fn needs_save(&self) -> bool {
        self.meta.version < CURRENT_SCHEMA_VERSION
            || (self.meta.version == CURRENT_SCHEMA_VERSION && !self.rejected.is_empty())
    }
}

/// Đọc object thô của file cài đặt.
pub fn load(raw: Map<String, Value>, defaults: Settings) -> Loaded {
    load_with(raw, defaults, MIGRATIONS)
}

/// Như `load`, với danh sách bước migrate tùy chọn (để test cơ chế migrate).
pub fn load_with(mut raw: Map<String, Value>, defaults: Settings, migrations: &[Migration]) -> Loaded {
    let file_version = raw
        .get(SCHEMA_VERSION_KEY)
        .and_then(Value::as_u64)
        .map_or(0, |v| u32::try_from(v).unwrap_or(u32::MAX));
    for migration in migrations.iter().skip(file_version as usize) {
        migration(&mut raw);
    }
    let newer = file_version > CURRENT_SCHEMA_VERSION;
    let mut merged = to_object(&defaults);
    let mut rejected = Vec::new();
    let mut unknown = BTreeMap::new();
    for (key, value) in &raw {
        let Some(current) = merged.get(key).cloned() else {
            continue;
        };
        match (NESTED.contains(&key.as_str()), current, value) {
            (true, Value::Object(mut group), Value::Object(sub)) => {
                let (known, extra): (Vec<_>, Vec<_>) = sub.iter().partition(|(k, _)| group.contains_key(*k));
                if newer && !extra.is_empty() {
                    let extra: Map<String, Value> = extra.into_iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                    unknown.insert(key.clone(), extra);
                }
                // Thử cả nhóm trước, để giữ được các thay đổi chỉ hợp lệ khi đi cùng nhau
                // (ví dụ đổi chỗ hai phím tắt); không được thì ghép từng khóa con.
                for (sub_key, sub_value) in &known {
                    group.insert((*sub_key).clone(), (*sub_value).clone());
                }
                if !try_set(&mut merged, key, None, Value::Object(group)) {
                    for (sub_key, sub_value) in known {
                        if !try_set(&mut merged, key, Some(sub_key), sub_value.clone()) {
                            rejected.push(format!("{key}.{sub_key}"));
                        }
                    }
                }
            }
            _ => {
                if !try_set(&mut merged, key, None, value.clone()) {
                    rejected.push(key.clone());
                }
            }
        }
    }
    let mut preserved = BTreeMap::new();
    if newer {
        for path in &rejected {
            if let (Some(raw), Some(fallback)) = (at_path(&raw, path), at_path(&merged, path)) {
                preserved.insert(
                    path.clone(),
                    Preserved {
                        raw: raw.clone(),
                        fallback: fallback.clone(),
                    },
                );
            }
        }
    }
    let settings = serde_json::from_value(Value::Object(merged)).expect("giá trị đã ghép luôn đọc được");
    Loaded {
        settings,
        meta: FileMeta {
            version: file_version,
            preserved,
            unknown,
        },
        rejected,
    }
}

fn at_path<'a>(map: &'a Map<String, Value>, path: &str) -> Option<&'a Value> {
    match path.split_once('.') {
        None => map.get(path),
        Some((key, sub_key)) => map.get(key)?.get(sub_key),
    }
}

/// Đặt `merged[key]` (hoặc `merged[key][sub_key]`) bằng `value` nếu kết quả vẫn là cài đặt hợp lệ.
fn try_set(merged: &mut Map<String, Value>, key: &str, sub_key: Option<&str>, value: Value) -> bool {
    let mut candidate = merged.clone();
    match sub_key {
        None => {
            candidate.insert(key.to_string(), value);
        }
        Some(sub_key) => {
            let Some(Value::Object(group)) = candidate.get_mut(key) else {
                return false;
            };
            group.insert(sub_key.to_string(), value);
        }
    }
    let valid = serde_json::from_value::<Settings>(Value::Object(candidate.clone()))
        .is_ok_and(|settings| settings.validate().is_ok());
    if valid {
        *merged = candidate;
    }
    valid
}

pub(crate) fn to_object(settings: &Settings) -> Map<String, Value> {
    match serde_json::to_value(settings).expect("Settings luôn ghi được ra JSON") {
        Value::Object(map) => map,
        _ => unreachable!("Settings là struct nên luôn ra object"),
    }
}

/// Các mục cần ghi vào store: mọi khóa của `settings`, cộng `schemaVersion`.
/// Không hạ phiên bản của file do bản app mới hơn ghi; khóa trong `meta.preserved` mà người dùng
/// chưa đổi thì ghi lại giá trị thô của file; khóa con lạ trong `meta.unknown` được ghép lại vào nhóm.
pub fn to_entries(settings: &Settings, meta: &FileMeta) -> Vec<(String, Value)> {
    let mut object = to_object(settings);
    for (key, extra) in &meta.unknown {
        if let Some(Value::Object(group)) = object.get_mut(key) {
            for (sub_key, value) in extra {
                group.entry(sub_key.clone()).or_insert_with(|| value.clone());
            }
        }
    }
    for (path, p) in &meta.preserved {
        let slot = match path.split_once('.') {
            None => object.get_mut(path),
            Some((key, sub_key)) => object.get_mut(key).and_then(|group| group.get_mut(sub_key)),
        };
        if let Some(slot) = slot.filter(|v| **v == p.fallback) {
            *slot = p.raw.clone();
        }
    }
    let mut entries: Vec<(String, Value)> = object.into_iter().collect();
    entries.push((
        SCHEMA_VERSION_KEY.to_string(),
        Value::from(meta.version.max(CURRENT_SCHEMA_VERSION)),
    ));
    entries
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib settings::migrate`
Expected:
```text
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 20 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings/migrate.rs src-tauri/src/settings/mod.rs
git commit -m "feat(app): số phiên bản schema, bước migrate, giữ giá trị của file do bản mới hơn ghi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 6: Sửa một phần cài đặt từ giao diện (TDD)

**Files:**
- Create: `src-tauri/src/settings/patch.rs`
- Modify: `src-tauri/src/settings/mod.rs` (thêm `pub mod patch;`)

Lệnh `update_settings` (Task 17) gửi một object chỉ gồm các khóa cần đổi. `apply` ghép vào cài đặt hiện tại rồi kiểm lại toàn bộ. Khác lúc đọc file, mọi lỗi đều bị từ chối, và cài đặt hiện tại giữ nguyên. Các khóa ở QĐ4 không đổi được qua đây.

- [ ] **Step 1: Khai báo module.** Thêm `pub mod patch;` vào khối `pub mod` ở đầu `src-tauri/src/settings/mod.rs`, sau `pub mod migrate;`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/settings/patch.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Sửa một phần cài đặt theo yêu cầu từ giao diện (lệnh `update_settings`).
//!
//! Khác với lúc đọc file (`migrate::load`), ở đây mọi lỗi đều bị từ chối: khóa lạ, sai kiểu, ngoài
//! phạm vi. Một số khóa chỉ đổi qua lệnh riêng, vì đổi chúng cần làm thêm việc khác.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Lang, Theme, UiLanguage};
    use serde_json::json;

    fn current() -> Settings {
        Settings::defaults(UiLanguage::Vi)
    }

    #[test]
    fn applies_top_level_and_nested_keys() {
        let patch = json!({
            "uiLanguage": "en",
            "theme": "dark",
            "sourceLanguages": ["en", "ja"],
            "sourceLock": "ja",
            "overlay": { "fontSize": 30, "showSource": true },
            "experimental": { "translationContext": true },
        });
        let s = apply(&current(), &patch).unwrap();
        assert_eq!(s.ui_language, UiLanguage::En);
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.source_languages, vec![Lang::En, Lang::Ja]);
        assert_eq!(s.source_lock, Some(Lang::Ja));
        assert_eq!(s.overlay.font_size, 30);
        assert!(s.overlay.show_source);
        assert_eq!(s.overlay.lines, 2, "khóa con không có trong bản sửa giữ nguyên");
        assert!(s.experimental.translation_context);
        let unlocked = apply(&s, &json!({ "sourceLock": null })).unwrap();
        assert_eq!(unlocked.source_lock, None);
    }

    #[test]
    fn rejects_out_of_range_values() {
        assert_eq!(
            apply(&current(), &json!({ "vadEndSilenceMs": 900 })),
            Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "lines": 0 } })),
            Err(Invalid::new("overlay.lines", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "sourceLanguages": [] })),
            Err(Invalid::new("sourceLanguages", Reason::Empty))
        );
    }

    #[test]
    fn rejects_wrong_types() {
        assert_eq!(
            apply(&current(), &json!({ "theme": "dark", "vadEndSilenceMs": "300" })),
            Err(Invalid::new("vadEndSilenceMs", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "uiLanguage": "fr" })),
            Err(Invalid::new("uiLanguage", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": 3 })),
            Err(Invalid::new("overlay", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!([1, 2])),
            Err(Invalid::new("", Reason::NotObject))
        );
    }

    #[test]
    fn rejects_unknown_and_read_only_keys() {
        assert_eq!(
            apply(&current(), &json!({ "licenseKey": "x" })),
            Err(Invalid::new("licenseKey", Reason::UnknownKey))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "color": "red" } })),
            Err(Invalid::new("overlay.color", Reason::UnknownKey))
        );
        assert_eq!(
            apply(&current(), &json!({ "hotkeys": { "toggleLock": "Ctrl+Alt+K" } })),
            Err(Invalid::new("hotkeys", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "locked": true } })),
            Err(Invalid::new("overlay.locked", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "positions": {} } })),
            Err(Invalid::new("overlay.positions", Reason::ReadOnly))
        );
    }

    #[test]
    fn failed_patch_leaves_current_untouched() {
        let before = current();
        let _ = apply(&before, &json!({ "theme": "dark", "vadEndSilenceMs": 5 }));
        assert_eq!(before, current());
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib settings::patch`
Expected: FAIL, biên dịch lỗi, ví dụ:
```text
error[E0425]: cannot find type `Settings` in this scope
error[E0433]: cannot find type `Settings` in this scope
error[E0433]: cannot find type `Invalid` in this scope
error[E0433]: cannot find type `Reason` in this scope
error[E0425]: cannot find function `apply` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use serde_json::{Map, Value};

use super::migrate::to_object;
use super::{Invalid, Reason, Settings};

/// Khóa không đổi được qua `update_settings`, kèm lý do:
/// - `hotkeys`: phải đăng ký lại với hệ điều hành (lệnh `set_hotkey`);
/// - `overlay.locked`: phải đổi cửa sổ sang click xuyên qua (lệnh `set_overlay_locked`);
/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển.
const READ_ONLY: &[&str] = &["hotkeys", "overlay.locked", "overlay.positions", "overlay.lastMonitor"];

/// Khóa là object con: bản sửa gửi object con thì ghép theo từng khóa con.
const NESTED: &[&str] = &["overlay", "experimental"];

/// Áp bản sửa `patch` lên `current`. Trả về cài đặt mới đã kiểm phạm vi, hoặc lỗi của khóa đầu tiên sai.
pub fn apply(current: &Settings, patch: &Value) -> Result<Settings, Invalid> {
    let Value::Object(patch) = patch else {
        return Err(Invalid::new("", Reason::NotObject));
    };
    let mut merged = to_object(current);
    for (key, value) in patch {
        set(&mut merged, key, value)?;
    }
    let settings: Settings =
        serde_json::from_value(Value::Object(merged)).map_err(|_| first_wrong_type(current, patch))?;
    settings.validate()?;
    Ok(settings)
}

fn set(merged: &mut Map<String, Value>, key: &str, value: &Value) -> Result<(), Invalid> {
    if READ_ONLY.contains(&key) {
        return Err(Invalid::new(key, Reason::ReadOnly));
    }
    let Some(slot) = merged.get_mut(key) else {
        return Err(Invalid::new(key, Reason::UnknownKey));
    };
    if !NESTED.contains(&key) {
        *slot = value.clone();
        return Ok(());
    }
    let (Value::Object(group), Value::Object(sub)) = (slot, value) else {
        return Err(Invalid::new(key, Reason::WrongType));
    };
    for (sub_key, sub_value) in sub {
        let field = format!("{key}.{sub_key}");
        if READ_ONLY.contains(&field.as_str()) {
            return Err(Invalid::new(field, Reason::ReadOnly));
        }
        let Some(slot) = group.get_mut(sub_key) else {
            return Err(Invalid::new(field, Reason::UnknownKey));
        };
        *slot = sub_value.clone();
    }
    Ok(())
}

/// Tìm khóa làm hỏng kiểu dữ liệu, bằng cách áp riêng từng khóa của bản sửa.
fn first_wrong_type(current: &Settings, patch: &Map<String, Value>) -> Invalid {
    for (key, value) in patch {
        let mut merged = to_object(current);
        if set(&mut merged, key, value).is_ok() && serde_json::from_value::<Settings>(Value::Object(merged)).is_err() {
            return Invalid::new(key.as_str(), Reason::WrongType);
        }
    }
    Invalid::new("", Reason::WrongType)
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib settings::patch`
Expected:
```text
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 30 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings/patch.rs src-tauri/src/settings/mod.rs
git commit -m "feat(app): sửa một phần cài đặt, từ chối khóa lạ, sai kiểu, ngoài phạm vi" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 7: Chuỗi phía Rust cho khay, và ngôn ngữ mặc định theo hệ điều hành (TDD)

**Files:**
- Create: `src-tauri/src/i18n.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod i18n;`)

§4.5: chuỗi phía Rust nằm trong một bảng nhỏ, đủ vi và en.
- Theo Q13 (đề xuất của kế hoạch 00), MVP không dùng thông báo hệ thống. Vì vậy bảng chỉ gồm menu khay, chú thích icon khay và tiêu đề thanh phụ đề (13 chuỗi). Lời nhắc trong app (QĐ12) nằm ở từ điển của giao diện.
- Kế hoạch 07 thêm chuỗi mời khởi động lại để cập nhật.
- Ngôn ngữ giao diện mặc định lấy từ locale của hệ điều hành qua `sys-locale` (§4.1, bước 1).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod i18n;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/i18n.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Chuỗi phía Rust (spec §4.5): menu khay, chú thích icon khay, tiêu đề cửa sổ.
//! Giao diện React có từ điển riêng ở `src/i18n/`. MVP không dùng thông báo hệ thống (Q13):
//! lỗi và lời nhắc hiện ngay trong app (cửa sổ chính, menu khay, thanh phụ đề).
//!
//! Mỗi ngôn ngữ là một hằng `Strings`: thiếu trường nào thì không biên dịch được.

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholders(s: &str) -> Vec<&str> {
        s.match_indices('{')
            .filter_map(|(i, _)| s[i..].find('}').map(|j| &s[i..=i + j]))
            .collect()
    }

    #[test]
    fn every_string_is_filled_in_both_languages() {
        for (name, text) in EN.all().into_iter().chain(VI.all()) {
            assert!(!text.trim().is_empty(), "{name} rỗng");
            assert_eq!(text, text.trim(), "{name} thừa khoảng trắng");
        }
    }

    #[test]
    fn placeholders_match_between_languages() {
        for ((name, en), (_, vi)) in EN.all().into_iter().zip(VI.all()) {
            assert_eq!(placeholders(en), placeholders(vi), "{name}");
        }
    }

    #[test]
    fn vietnamese_is_actually_translated() {
        let same: Vec<_> = EN
            .all()
            .into_iter()
            .zip(VI.all())
            .filter(|((_, en), (_, vi))| en == vi)
            .map(|((n, _), _)| n)
            .collect();
        assert_eq!(same, ["tray_tooltip"], "chỉ mẫu chú thích là giống nhau");
    }

    #[test]
    fn tooltip_fills_app_name_and_status() {
        assert_eq!(VI.tooltip("AI Translator", false), "AI Translator: Sẵn sàng");
        assert_eq!(EN.tooltip("AI Translator", true), "AI Translator: Translating");
    }

    #[test]
    fn default_ui_language_from_os_locale() {
        assert_eq!(ui_language_from_locale(Some("vi-VN")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("vi_VN")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("vi")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("VI-vn")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("en-US")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(Some("fr-FR")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(Some("video")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(None), UiLanguage::En);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib i18n::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find value `EN` in this scope
error[E0425]: cannot find value `VI` in this scope
error[E0433]: cannot find type `UiLanguage` in this scope
error[E0425]: cannot find function `ui_language_from_locale` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use crate::settings::UiLanguage;

#[derive(Debug)]
pub struct Strings {
    pub tray_start: &'static str,
    pub tray_stop: &'static str,
    pub tray_show_overlay: &'static str,
    pub tray_hide_overlay: &'static str,
    pub tray_lock_overlay: &'static str,
    pub tray_unlock_overlay: &'static str,
    pub tray_open_main: &'static str,
    pub tray_quit: &'static str,
    /// Dòng báo trong menu khay khi có phím tắt không đăng ký được.
    pub tray_hotkey_failed: &'static str,
    /// Chú thích icon khay: `{app}` là tên app, `{status}` là trạng thái.
    pub tray_tooltip: &'static str,
    pub status_idle: &'static str,
    pub status_running: &'static str,
    pub overlay_title: &'static str,
}

pub const EN: Strings = Strings {
    tray_start: "Start translating",
    tray_stop: "Stop translating",
    tray_show_overlay: "Show subtitles",
    tray_hide_overlay: "Hide subtitles",
    tray_lock_overlay: "Lock subtitles (click-through)",
    tray_unlock_overlay: "Unlock subtitles",
    tray_open_main: "Open main window",
    tray_quit: "Quit",
    tray_hotkey_failed: "Some shortcuts could not be registered",
    tray_tooltip: "{app}: {status}",
    status_idle: "Ready",
    status_running: "Translating",
    overlay_title: "Subtitles",
};

pub const VI: Strings = Strings {
    tray_start: "Bắt đầu dịch",
    tray_stop: "Dừng dịch",
    tray_show_overlay: "Hiện phụ đề",
    tray_hide_overlay: "Ẩn phụ đề",
    tray_lock_overlay: "Khóa phụ đề (click xuyên qua)",
    tray_unlock_overlay: "Mở khóa phụ đề",
    tray_open_main: "Mở cửa sổ chính",
    tray_quit: "Thoát",
    tray_hotkey_failed: "Có phím tắt không đăng ký được",
    tray_tooltip: "{app}: {status}",
    status_idle: "Sẵn sàng",
    status_running: "Đang dịch",
    overlay_title: "Phụ đề",
};

impl Strings {
    /// Mọi chuỗi, để test. Liệt kê đủ trường, không dùng `..`, nên thêm trường mà quên ở đây thì
    /// không biên dịch được.
    pub fn all(&self) -> Vec<(&'static str, &'static str)> {
        let Strings {
            tray_start,
            tray_stop,
            tray_show_overlay,
            tray_hide_overlay,
            tray_lock_overlay,
            tray_unlock_overlay,
            tray_open_main,
            tray_quit,
            tray_hotkey_failed,
            tray_tooltip,
            status_idle,
            status_running,
            overlay_title,
        } = *self;
        vec![
            ("tray_start", tray_start),
            ("tray_stop", tray_stop),
            ("tray_show_overlay", tray_show_overlay),
            ("tray_hide_overlay", tray_hide_overlay),
            ("tray_lock_overlay", tray_lock_overlay),
            ("tray_unlock_overlay", tray_unlock_overlay),
            ("tray_open_main", tray_open_main),
            ("tray_quit", tray_quit),
            ("tray_hotkey_failed", tray_hotkey_failed),
            ("tray_tooltip", tray_tooltip),
            ("status_idle", status_idle),
            ("status_running", status_running),
            ("overlay_title", overlay_title),
        ]
    }

    pub fn tooltip(&self, app: &str, running: bool) -> String {
        let status = if running { self.status_running } else { self.status_idle };
        self.tray_tooltip.replace("{app}", app).replace("{status}", status)
    }
}

pub fn strings(lang: UiLanguage) -> &'static Strings {
    match lang {
        UiLanguage::En => &EN,
        UiLanguage::Vi => &VI,
    }
}

/// Ngôn ngữ giao diện mặc định theo locale của hệ điều hành (§4.1, bước 1):
/// tiếng Việt nếu locale là tiếng Việt, còn lại là English.
pub fn ui_language_from_locale(locale: Option<&str>) -> UiLanguage {
    let primary = locale.and_then(|l| l.split(['-', '_']).next()).unwrap_or("");
    if primary.eq_ignore_ascii_case("vi") {
        UiLanguage::Vi
    } else {
        UiLanguage::En
    }
}

pub fn system_ui_language() -> UiLanguage {
    ui_language_from_locale(sys_locale::get_locale().as_deref())
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib i18n::`
Expected:
```text
test result: ok. 5 passed; 0 failed; 0 ignored; 0 measured; 35 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/i18n.rs src-tauri/src/lib.rs
git commit -m "feat(app): chuỗi phía Rust vi/en cho khay, ngôn ngữ mặc định theo hệ điều hành (§4.5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 8: Kho khóa của hệ điều hành (TDD)

**Files:**
- Create: `src-tauri/src/security/mod.rs`, `src-tauri/src/security/keystore.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod security;`)

Theo Đ5 và QĐ8.
- Kế hoạch 03 lưu khóa SQLCipher, kế hoạch 06 lưu trạng thái bản quyền và quota; mỗi kế hoạch tự đặt tên mục.
- Trên Windows, mỗi mục lưu với `persistence = Local`.
- Test dùng store giả của `keyring-core`.
- Test với kho khóa thật để `#[ignore]`; người chạy ở Task 24 và 25, vì agent không được đụng Keychain (mục 6.8 của kế hoạch 00).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod security;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`, rồi tạo `src-tauri/src/security/mod.rs`:

```rust
//! Bảo mật phía app (spec §10.2). Kế hoạch 06 thêm `integrity.rs` và `clock.rs`.

pub mod keystore;
```

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/security/keystore.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Kho khóa của hệ điều hành (spec §10.2, Đ5 của kế hoạch 00): Keychain trên macOS, Credential
//! Manager trên Windows, qua `keyring-core`.
//!
//! Người dùng sau: kế hoạch 03 lưu khóa SQLCipher; kế hoạch 06 lưu trạng thái bản quyền và quota.
//! Mỗi kế hoạch tự đặt tên mục (hằng số `&str`) của mình.
//!
//! - Mọi mục nằm dưới cùng một "service" là bundle identifier của app (`app.config().identifier`),
//!   để khi Q1 chốt identifier thì chỉ đổi ở một chỗ (R17).
//! - Windows: mục lưu với `persistence = Local` (chỉ trên máy này), không dùng mặc định `Enterprise`
//!   (đi theo hồ sơ roaming của tài khoản domain sang máy khác), vì trạng thái bản quyền và quota gắn
//!   với từng máy (spec §6.8).
//! - Không ghi giá trị bí mật vào log, kể cả khi lỗi.
//! - Test dùng `Keystore::mock`, không đụng kho khóa thật. Đọc ghi Keychain thật bằng binary vừa
//!   build lại có thể bật hộp thoại hỏi quyền (mục 6.8 của kế hoạch 00), nên test thật để `#[ignore]`.

#[cfg(test)]
mod tests {
    use super::*;

    const SERVICE: &str = "com.aitranslator.desktop.test";

    #[test]
    fn set_get_delete_roundtrip() {
        let ks = Keystore::mock(SERVICE);
        assert_eq!(ks.get("db-key").unwrap(), None);
        ks.set("db-key", &[1, 2, 3]).unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(vec![1, 2, 3]));
        ks.set("db-key", b"moi").unwrap();
        assert_eq!(ks.get("db-key").unwrap(), Some(b"moi".to_vec()), "ghi đè giá trị cũ");
        assert!(ks.delete("db-key").unwrap());
        assert_eq!(ks.get("db-key").unwrap(), None);
        assert!(!ks.delete("db-key").unwrap(), "xóa mục chưa có không phải lỗi");
    }

    #[test]
    fn items_are_separated_by_name_and_service() {
        let store = keyring_core::mock::Store::new().unwrap();
        let app = Keystore::with_store(SERVICE, store.clone());
        let other = Keystore::with_store("other.app", store);
        app.set("license.state", b"a").unwrap();
        app.set("quota", b"b").unwrap();
        assert_eq!(app.get("license.state").unwrap(), Some(b"a".to_vec()));
        assert_eq!(app.get("quota").unwrap(), Some(b"b".to_vec()));
        assert_eq!(other.get("quota").unwrap(), None);
    }

    #[test]
    fn rejects_bad_names_and_large_values() {
        let ks = Keystore::mock(SERVICE);
        for name in ["", "Db-Key", "db key", "khóa", &"a".repeat(65)] {
            assert!(
                matches!(ks.set(name, b"x"), Err(KeystoreError::InvalidName(_))),
                "{name:?}"
            );
        }
        assert!(matches!(
            ks.set("big", &[0; MAX_SECRET_BYTES + 1]),
            Err(KeystoreError::TooLarge(2049))
        ));
        ks.set("big", &[0; MAX_SECRET_BYTES]).unwrap();
    }

    #[test]
    fn platform_errors_are_reported() {
        let ks = Keystore::mock(SERVICE);
        let entry = ks.entry("db-key").unwrap();
        let mock: &keyring_core::mock::Cred = entry.as_any().downcast_ref().unwrap();
        mock.set_error(Error::NoStorageAccess("bị khóa".into()));
        assert!(matches!(ks.get("db-key"), Err(KeystoreError::Access(_))));
        assert_eq!(ks.get("db-key").unwrap(), None, "lỗi giả chỉ áp cho một lần gọi");
    }

    #[test]
    fn windows_items_stay_on_this_machine() {
        let expected: &[(&str, &str)] = if cfg!(windows) {
            &[("persistence", "Local")]
        } else {
            &[]
        };
        assert_eq!(PLATFORM_MODIFIERS, expected);
    }

    /// Chạy tay (người): `cargo test -p meeting-translator --lib os_keystore -- --ignored`.
    /// Ghi, đọc rồi xóa một mục thật trong Keychain hoặc Credential Manager.
    #[test]
    #[ignore = "đụng kho khóa thật của hệ điều hành; có thể bật hộp thoại hỏi quyền"]
    fn os_keystore_roundtrip() {
        let ks = Keystore::os(SERVICE).unwrap();
        let name = format!("test-{}", std::process::id());
        ks.set(&name, b"gia-tri-thu").unwrap();
        assert_eq!(ks.get(&name).unwrap(), Some(b"gia-tri-thu".to_vec()));
        assert!(ks.delete(&name).unwrap());
        assert_eq!(ks.get(&name).unwrap(), None);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib security::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find value `MAX_SECRET_BYTES` in this scope
error[E0433]: cannot find type `Error` in this scope
error[E0425]: cannot find value `PLATFORM_MODIFIERS` in this scope
error[E0433]: cannot find type `Keystore` in this scope
error[E0433]: cannot find type `KeystoreError` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::collections::HashMap;
use std::sync::Arc;

use keyring_core::{CredentialStore, Error};

/// Credential Manager giới hạn 2560 byte mỗi mục; giữ một giới hạn chung cho cả hai hệ điều hành.
pub const MAX_SECRET_BYTES: usize = 2048;
const MAX_NAME_LEN: usize = 64;

/// Tùy chọn của store gốc khi tạo từng mục (modifier của `keyring-core`).
#[cfg(windows)]
pub const PLATFORM_MODIFIERS: &[(&str, &str)] = &[("persistence", "Local")];
#[cfg(not(windows))]
pub const PLATFORM_MODIFIERS: &[(&str, &str)] = &[];

#[derive(Debug, thiserror::Error)]
pub enum KeystoreError {
    #[error("tên mục kho khóa không hợp lệ: {0:?}")]
    InvalidName(String),
    #[error("giá trị quá lớn cho kho khóa ({0} byte, tối đa {MAX_SECRET_BYTES})")]
    TooLarge(usize),
    #[error("không truy cập được kho khóa của hệ điều hành: {0}")]
    Access(String),
    #[error("lỗi kho khóa của hệ điều hành: {0}")]
    Platform(String),
}

pub struct Keystore {
    service: String,
    store: Arc<CredentialStore>,
    modifiers: &'static [(&'static str, &'static str)],
}

impl Keystore {
    /// Kho khóa thật của hệ điều hành.
    pub fn os(service: &str) -> Result<Self, KeystoreError> {
        Ok(Self {
            modifiers: PLATFORM_MODIFIERS,
            ..Self::with_store(service, platform_store()?)
        })
    }

    /// Kho khóa trong bộ nhớ, cho test. Dữ liệu mất khi `Keystore` bị hủy.
    pub fn mock(service: &str) -> Self {
        Self::with_store(
            service,
            keyring_core::mock::Store::new().expect("mock store luôn tạo được"),
        )
    }

    pub fn with_store(service: &str, store: Arc<CredentialStore>) -> Self {
        Self {
            service: service.to_string(),
            store,
            modifiers: &[],
        }
    }

    /// Đọc một mục; `None` nếu chưa có.
    pub fn get(&self, name: &str) -> Result<Option<Vec<u8>>, KeystoreError> {
        match self.entry(name)?.get_secret() {
            Ok(secret) => Ok(Some(secret)),
            Err(Error::NoEntry) => Ok(None),
            Err(e) => Err(map_error(e)),
        }
    }

    /// Ghi đè một mục.
    pub fn set(&self, name: &str, secret: &[u8]) -> Result<(), KeystoreError> {
        if secret.len() > MAX_SECRET_BYTES {
            return Err(KeystoreError::TooLarge(secret.len()));
        }
        self.entry(name)?.set_secret(secret).map_err(map_error)
    }

    /// Xóa một mục; trả `false` nếu mục chưa có.
    pub fn delete(&self, name: &str) -> Result<bool, KeystoreError> {
        match self.entry(name)?.delete_credential() {
            Ok(()) => Ok(true),
            Err(Error::NoEntry) => Ok(false),
            Err(e) => Err(map_error(e)),
        }
    }

    fn entry(&self, name: &str) -> Result<keyring_core::Entry, KeystoreError> {
        let valid = !name.is_empty()
            && name.len() <= MAX_NAME_LEN
            && name
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(&b));
        if !valid {
            return Err(KeystoreError::InvalidName(name.to_string()));
        }
        let modifiers: HashMap<&str, &str> = self.modifiers.iter().copied().collect();
        self.store
            .build(&self.service, name, (!modifiers.is_empty()).then_some(&modifiers))
            .map_err(map_error)
    }
}

#[cfg(target_os = "macos")]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    let store: Arc<CredentialStore> = apple_native_keyring_store::keychain::Store::new().map_err(map_error)?;
    Ok(store)
}

#[cfg(windows)]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    let store: Arc<CredentialStore> = windows_native_keyring_store::Store::new().map_err(map_error)?;
    Ok(store)
}

#[cfg(not(any(target_os = "macos", windows)))]
fn platform_store() -> Result<Arc<CredentialStore>, KeystoreError> {
    Err(KeystoreError::Platform("chỉ hỗ trợ macOS và Windows (spec D3)".into()))
}

/// Đổi lỗi của keyring sang lỗi của app. Chỉ giữ thông báo chữ; `BadEncoding` và `BadDataFormat`
/// có kèm byte của giá trị, nên không dùng `Debug` của lỗi gốc.
fn map_error(error: Error) -> KeystoreError {
    match error {
        Error::NoStorageAccess(e) => KeystoreError::Access(e.to_string()),
        other => KeystoreError::Platform(other.to_string()),
    }
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib security::`
Expected (test thật bị bỏ qua):
```text
test result: ok. 5 passed; 0 failed; 1 ignored; 0 measured; 40 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo. Phần `#[cfg(windows)]` được kiểm ở Task 22 (`scripts/check-windows.sh`).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/security src-tauri/src/lib.rs
git commit -m "feat(app): wrapper kho khóa của hệ điều hành (Keychain, Credential Manager chỉ trên máy này) qua keyring-core" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 9: Vị trí thanh phụ đề theo từng màn hình (TDD)

**Files:**
- Create: `src-tauri/src/overlay/mod.rs` (tạm; Task 17 thay), `src-tauri/src/overlay/placement.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod overlay;`)

Theo QĐ13.
- File này chỉ có phép tính trên tọa độ, và luật nhớ tối đa 16 màn hình (bỏ màn hình lâu không dùng nhất).
- Phần đọc màn hình của Tauri và đặt cửa sổ ở Task 17.
- Tọa độ Tauri trả về là pixel vật lý; vị trí lưu là điểm logic so với vùng làm việc của màn hình.

- [ ] **Step 1: Khai báo module.** Thêm `pub mod overlay;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`, rồi tạo `src-tauri/src/overlay/mod.rs`:

```rust
//! Thanh phụ đề (spec §4.4). Task 17 thêm phần tạo cửa sổ, ẩn/hiện, khóa và lưu vị trí.

pub mod placement;
```

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/overlay/placement.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Nhớ vị trí thanh phụ đề theo từng màn hình (spec §4.4, khóa `overlay.positions` ở §6.9).
//!
//! Vị trí lưu bằng điểm logic, so với góc trên bên trái vùng làm việc (work area) của màn hình, để
//! đúng cả khi màn hình có tỉ lệ (scale) khác nhau hay đổi vị trí trong cách sắp xếp màn hình.
//! File này chỉ có phép tính, không gọi Tauri; phần đọc màn hình và đặt cửa sổ nằm ở `overlay/mod.rs`.

#[cfg(test)]
mod tests {
    use super::*;

    fn laptop() -> Screen {
        // MacBook Pro 14": 3024×1964 vật lý, scale 2, vùng làm việc trừ menu bar 37 px.
        Screen {
            key: screen_key(Some("Built-in Retina Display"), 3024, 1964),
            x: 0,
            y: 74,
            width: 3024,
            height: 1890,
            scale: 2.0,
        }
    }

    fn external() -> Screen {
        Screen {
            key: screen_key(Some("DELL U2723QE"), 2560, 1440),
            x: 3024,
            y: 0,
            width: 2560,
            height: 1400,
            scale: 1.0,
        }
    }

    #[test]
    fn screen_key_uses_name_and_resolution() {
        assert_eq!(screen_key(Some("DELL U2723QE"), 2560, 1440), "DELL U2723QE 2560x1440");
        assert_eq!(screen_key(None, 1920, 1080), "unknown 1920x1080");
        assert_eq!(screen_key(Some("  "), 1920, 1080), "unknown 1920x1080");
    }

    #[test]
    fn first_launch_goes_bottom_center_of_primary() {
        let screens = [external(), laptop()];
        let p = place(&BTreeMap::new(), None, &screens, Some(&laptop().key)).unwrap();
        // Màn hình logic 1512×945: rộng 900, x = (1512 − 900) / 2 = 306, y = 945 − 160 − 72 = 713.
        assert_eq!(
            p,
            Placement {
                screen_key: laptop().key,
                x: 612,
                y: 74 + 1426,
                width: 1800,
                height: 320
            }
        );
    }

    #[test]
    fn saved_position_is_restored_on_its_screen() {
        let rect = OverlayRect {
            x: 100.0,
            y: 50.0,
            width: 800.0,
            height: 120.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(external().key, rect)]);
        let screens = [laptop(), external()];
        let p = place(&positions, Some(&external().key), &screens, Some(&laptop().key)).unwrap();
        assert_eq!(
            p,
            Placement {
                screen_key: external().key,
                x: 3124,
                y: 50,
                width: 800,
                height: 120
            }
        );
    }

    #[test]
    fn relative_position_roundtrips_through_scale() {
        let screen = laptop();
        let rect = to_relative(&screen, 612, 1500, 1800, 320);
        assert_eq!(
            rect,
            OverlayRect {
                x: 306.0,
                y: 713.0,
                width: 900.0,
                height: 160.0,
                last_used: 0,
            }
        );
        let positions = BTreeMap::from([(screen.key.clone(), rect)]);
        let p = place(&positions, Some(&screen.key), std::slice::from_ref(&screen), None).unwrap();
        assert_eq!((p.x, p.y, p.width, p.height), (612, 1500, 1800, 320));
    }

    #[test]
    fn unplugged_screen_falls_back_to_another_saved_screen_then_default() {
        let on_laptop = OverlayRect {
            x: 10.0,
            y: 20.0,
            width: 700.0,
            height: 100.0,
            last_used: 0,
        };
        let on_external = OverlayRect {
            x: 0.0,
            y: 0.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(laptop().key, on_laptop), (external().key, on_external)]);
        // Màn hình ngoài đã rút: về vị trí đã nhớ trên laptop.
        let p = place(&positions, Some(&external().key), &[laptop()], None).unwrap();
        assert_eq!((p.screen_key.as_str(), p.x, p.y), (laptop().key.as_str(), 20, 74 + 40));
        // Không màn hình nào có vị trí đã nhớ: vị trí mặc định trên màn hình chính.
        let only_external = BTreeMap::from([(external().key, on_external)]);
        let p = place(&only_external, Some(&external().key), &[laptop()], Some(&laptop().key)).unwrap();
        assert_eq!((p.x, p.y), (612, 74 + 1426));
    }

    #[test]
    fn off_screen_position_is_pulled_back_inside() {
        let far = OverlayRect {
            x: 5000.0,
            y: -300.0,
            width: 3000.0,
            height: 160.0,
            last_used: 0,
        };
        let positions = BTreeMap::from([(external().key, far)]);
        let p = place(&positions, Some(&external().key), &[external()], None).unwrap();
        assert_eq!(
            p,
            Placement {
                screen_key: external().key,
                x: 3024,
                y: 0,
                width: 2560,
                height: 160
            }
        );
    }

    #[test]
    fn no_screen_means_no_placement() {
        assert_eq!(place(&BTreeMap::new(), None, &[], None), None);
    }

    #[test]
    fn narrow_screen_keeps_margins_in_default_rect() {
        let small = Screen {
            key: "small 800x600".into(),
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            scale: 1.0,
        };
        assert_eq!(
            default_rect(&small),
            OverlayRect {
                x: 24.0,
                y: 368.0,
                width: 752.0,
                height: 160.0,
                last_used: 0,
            }
        );
    }

    fn rect_at(x: f64) -> OverlayRect {
        OverlayRect {
            x,
            y: 0.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        }
    }

    #[test]
    fn remember_stamps_time_and_updates_in_place() {
        let mut positions = BTreeMap::new();
        remember(&mut positions, "a", rect_at(1.0), 100, 3);
        remember(&mut positions, "a", rect_at(2.0), 200, 3);
        assert_eq!(positions.len(), 1);
        assert_eq!(
            positions["a"],
            OverlayRect {
                last_used: 200,
                ..rect_at(2.0)
            }
        );
        assert!(same_geometry(&positions["a"], &rect_at(2.0)));
        assert!(!same_geometry(&positions["a"], &rect_at(3.0)));
    }

    #[test]
    fn remember_drops_the_least_recently_used_screen() {
        let mut positions = BTreeMap::new();
        remember(&mut positions, "b", rect_at(0.0), 300, 3);
        remember(&mut positions, "a", rect_at(0.0), 100, 3);
        remember(&mut positions, "c", rect_at(0.0), 200, 3);
        // Màn hình thứ tư: bỏ "a" (dùng lâu nhất), không phải "b" (đứng đầu theo thứ tự tên).
        remember(&mut positions, "d", rect_at(0.0), 400, 3);
        assert_eq!(positions.keys().collect::<Vec<_>>(), ["b", "c", "d"]);
        // Màn hình vừa nhớ không bao giờ bị bỏ, kể cả khi đồng hồ lùi.
        remember(&mut positions, "e", rect_at(0.0), 50, 3);
        assert_eq!(positions.keys().collect::<Vec<_>>(), ["b", "d", "e"]);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib overlay::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find type `Screen` in this scope
error[E0422]: cannot find struct, variant or union type `Screen` in this scope
error[E0433]: cannot find type `BTreeMap` in this scope
error[E0422]: cannot find struct, variant or union type `Placement` in this scope
error[E0422]: cannot find struct, variant or union type `OverlayRect` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::collections::BTreeMap;

use crate::settings::OverlayRect;

/// Một màn hình đang cắm, tọa độ vật lý (pixel) như Tauri trả về.
#[derive(Clone, Debug, PartialEq)]
pub struct Screen {
    pub key: String,
    /// Vùng làm việc: trừ menu bar, Dock, taskbar.
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f64,
}

/// Chỗ đặt thanh phụ đề, tọa độ vật lý.
#[derive(Clone, Debug, PartialEq)]
pub struct Placement {
    pub screen_key: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

pub const DEFAULT_WIDTH: f64 = 900.0;
pub const DEFAULT_HEIGHT: f64 = 160.0;
/// Khoảng cách tối thiểu tới mép trái và phải, và khoảng cách tới mép dưới khi đặt mặc định.
const MARGIN: f64 = 24.0;
const BOTTOM_GAP: f64 = 72.0;

/// Khóa của một màn hình: tên và độ phân giải đầy đủ. Hai màn hình cùng model và cùng độ phân giải
/// dùng chung một vị trí; chấp nhận được, vì vị trí vẫn nằm trong màn hình.
pub fn screen_key(name: Option<&str>, width: u32, height: u32) -> String {
    let name = name.map(str::trim).filter(|n| !n.is_empty()).unwrap_or("unknown");
    format!("{name} {width}x{height}")
}

/// Vị trí mặc định: giữa màn hình theo chiều ngang, cách mép dưới một khoảng.
pub fn default_rect(screen: &Screen) -> OverlayRect {
    let (w, h) = logical_size(screen);
    let width = DEFAULT_WIDTH.min(w - 2.0 * MARGIN).max(1.0);
    let height = DEFAULT_HEIGHT.min(h).max(1.0);
    OverlayRect {
        x: ((w - width) / 2.0).max(0.0),
        y: (h - height - BOTTOM_GAP).max(0.0),
        width,
        height,
        last_used: 0,
    }
}

/// Đổi vị trí vật lý của cửa sổ sang vị trí logic so với màn hình, để lưu.
pub fn to_relative(screen: &Screen, x: i32, y: i32, width: u32, height: u32) -> OverlayRect {
    OverlayRect {
        x: f64::from(x - screen.x) / screen.scale,
        y: f64::from(y - screen.y) / screen.scale,
        width: f64::from(width) / screen.scale,
        height: f64::from(height) / screen.scale,
        last_used: 0,
    }
}

/// Nhớ vị trí trên màn hình `key` lúc `now` (giây Unix). Nhớ quá `max` màn hình thì bỏ màn hình lâu
/// không dùng nhất (trừ màn hình vừa nhớ), để file cài đặt không phình ra.
pub fn remember(positions: &mut BTreeMap<String, OverlayRect>, key: &str, rect: OverlayRect, now: u64, max: usize) {
    positions.insert(key.to_string(), OverlayRect { last_used: now, ..rect });
    while positions.len() > max {
        let oldest = positions
            .iter()
            .filter(|(k, _)| k.as_str() != key)
            .min_by_key(|(_, r)| r.last_used)
            .map(|(k, _)| k.clone());
        match oldest {
            Some(k) => positions.remove(&k),
            None => break,
        };
    }
}

/// Hai vị trí cùng chỗ và cùng kích thước (bỏ qua thời điểm dùng).
pub fn same_geometry(a: &OverlayRect, b: &OverlayRect) -> bool {
    (a.x, a.y, a.width, a.height) == (b.x, b.y, b.width, b.height)
}

/// Chọn màn hình và vị trí cho thanh phụ đề:
/// 1. màn hình của lần đặt gần nhất, nếu còn cắm;
/// 2. không thì màn hình đầu tiên có vị trí đã nhớ;
/// 3. không thì màn hình chính (hoặc màn hình đầu tiên), ở vị trí mặc định.
///
/// Vị trí luôn được kéo vào trong vùng làm việc, để thanh không nằm ngoài màn hình.
pub fn place(
    positions: &BTreeMap<String, OverlayRect>,
    last_screen: Option<&str>,
    screens: &[Screen],
    primary: Option<&str>,
) -> Option<Placement> {
    let saved = |key: &str| positions.get(key).copied();
    let by_key = |key: &str| screens.iter().find(|s| s.key == key);
    let screen = last_screen
        .and_then(by_key)
        .filter(|s| saved(&s.key).is_some())
        .or_else(|| screens.iter().find(|s| saved(&s.key).is_some()))
        .or_else(|| primary.and_then(by_key))
        .or_else(|| screens.first())?;
    let rect = clamp(screen, saved(&screen.key).unwrap_or_else(|| default_rect(screen)));
    Some(Placement {
        screen_key: screen.key.clone(),
        x: screen.x + (rect.x * screen.scale).round() as i32,
        y: screen.y + (rect.y * screen.scale).round() as i32,
        width: (rect.width * screen.scale).round() as u32,
        height: (rect.height * screen.scale).round() as u32,
    })
}

fn logical_size(screen: &Screen) -> (f64, f64) {
    (
        f64::from(screen.width) / screen.scale,
        f64::from(screen.height) / screen.scale,
    )
}

fn clamp(screen: &Screen, rect: OverlayRect) -> OverlayRect {
    let (w, h) = logical_size(screen);
    let width = rect.width.min(w);
    let height = rect.height.min(h);
    OverlayRect {
        x: rect.x.clamp(0.0, w - width),
        y: rect.y.clamp(0.0, h - height),
        width,
        height,
        ..rect
    }
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib overlay::`
Expected:
```text
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 46 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/overlay src-tauri/src/lib.rs
git commit -m "feat(app): chọn chỗ đặt thanh phụ đề theo vị trí đã nhớ của từng màn hình (§4.4)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 10: Chặn `⌘Q` và Quit ở Dock, không chặn tắt máy (TDD)

**Files:**
- Create: `src-tauri/src/quit_guard.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod quit_guard;`)

Theo QĐ7 (R9 của kế hoạch 00).
- Test tự động chỉ kiểm luật quyết định (`allow_terminate`).
- Phần gắn vào AppKit (`install`, gọi `on_cancel` khi hủy) chỉ thử được bằng tay, ở Task 24: `⌘Q`, Quit ở Dock, đăng xuất, khởi động lại, tắt máy.
- Việc app làm sau khi hủy (hiện cửa sổ chính kèm lời nhắc) có test bằng MockRuntime ở Task 17.

- [ ] **Step 1: Khai báo module.** Thêm `pub mod quit_guard;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/quit_guard.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Trên Mac, `⌘Q` và mục Quit ở Dock không thoát app (spec §4.3); chỉ Thoát ở menu khay mới thoát.
//! Nhưng không được cản đăng xuất, khởi động lại, tắt máy (R9 của kế hoạch 00).
//!
//! Cách làm: tao (event loop của Tauri) không cài `applicationShouldTerminate:`, nên `⌘Q`, Quit ở
//! Dock và yêu cầu thoát của hệ thống đều đi thẳng tới `NSApp terminate:` rồi thoát. App thêm
//! `applicationShouldTerminate:` vào lớp app delegate của tao:
//! - Apple Event `quit` có thuộc tính lý do (`kAEQuitReason`) là do loginwindow gửi khi đăng xuất,
//!   khởi động lại hay tắt máy: cho thoát.
//! - Mọi trường hợp khác (`⌘Q`, mục Quit ở menu app, Quit ở Dock, `osascript -e 'quit app ...'`): hủy,
//!   rồi gọi `on_cancel` để app hiện cửa sổ chính kèm lời nhắc thoát ở menu bar (không dùng thông báo
//!   hệ thống, vì cần xin quyền).
//!
//! Thoát ở menu khay gọi `AppHandle::exit`; tao dừng event loop bằng `stop:`, không qua `terminate:`,
//! nên không bị hàm này chặn. Cập nhật app (kế hoạch 07) dùng `AppHandle::restart`, cũng không qua đây.

#[cfg(test)]
mod tests {
    use super::*;

    fn quit(reason: Option<&[u8; 4]>) -> Option<QuitEvent> {
        Some(QuitEvent {
            event_class: K_CORE_EVENT_CLASS,
            event_id: K_AE_QUIT_APPLICATION,
            reason: reason.map(four_cc),
        })
    }

    #[test]
    fn four_cc_is_big_endian() {
        assert_eq!(four_cc(b"quit"), 0x7175_6974);
    }

    #[test]
    fn logout_restart_and_shutdown_are_allowed() {
        for reason in [b"logo", b"rlgo", b"rrst", b"rsdn", b"rest", b"shut"] {
            assert!(
                allow_terminate(quit(Some(reason))),
                "{}",
                String::from_utf8_lossy(reason)
            );
        }
    }

    #[test]
    fn cmd_q_and_dock_quit_are_cancelled() {
        // ⌘Q gọi thẳng `terminate:`, không có Apple Event.
        assert!(!allow_terminate(None));
        // Quit ở Dock và `osascript` gửi Apple Event `quit` không có lý do.
        assert!(!allow_terminate(quit(None)));
        // Lý do lạ cũng không cho qua.
        assert!(!allow_terminate(quit(Some(b"abcd"))));
        // Apple Event khác (ví dụ mở file) đang xử lý lúc gọi `terminate:`.
        let open = QuitEvent {
            event_class: K_CORE_EVENT_CLASS,
            event_id: four_cc(b"odoc"),
            reason: Some(four_cc(b"shut")),
        };
        assert!(!allow_terminate(Some(open)));
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib quit_guard::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find type `QuitEvent` in this scope
error[E0422]: cannot find struct, variant or union type `QuitEvent` in this scope
error[E0425]: cannot find value `K_CORE_EVENT_CLASS` in this scope
error[E0425]: cannot find value `K_AE_QUIT_APPLICATION` in this scope
error[E0425]: cannot find value `four_cc` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
/// Mã bốn ký tự của Apple Event, như `'why?'`.
pub const fn four_cc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

pub const K_CORE_EVENT_CLASS: u32 = four_cc(b"aevt");
pub const K_AE_QUIT_APPLICATION: u32 = four_cc(b"quit");
pub const K_AE_QUIT_REASON: u32 = four_cc(b"why?");

/// Các lý do thoát do hệ thống gửi (AERegistry.h).
const SYSTEM_QUIT_REASONS: [u32; 6] = [
    four_cc(b"logo"), // kAELogOut
    four_cc(b"rlgo"), // kAEReallyLogOut
    four_cc(b"rrst"), // kAEShowRestartDialog
    four_cc(b"rsdn"), // kAEShowShutdownDialog
    four_cc(b"rest"), // kAERestart
    four_cc(b"shut"), // kAEShutDown
];

/// Apple Event đang được xử lý lúc `terminate:` được gọi, nếu có.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QuitEvent {
    pub event_class: u32,
    pub event_id: u32,
    /// Giá trị của thuộc tính `kAEQuitReason`, nếu có.
    pub reason: Option<u32>,
}

/// Có cho app thoát không.
pub fn allow_terminate(event: Option<QuitEvent>) -> bool {
    event.is_some_and(|e| {
        e.event_class == K_CORE_EVENT_CLASS
            && e.event_id == K_AE_QUIT_APPLICATION
            && e.reason.is_some_and(|r| SYSTEM_QUIT_REASONS.contains(&r))
    })
}

/// Việc cần làm khi hủy một yêu cầu thoát.
#[cfg(target_os = "macos")]
static ON_CANCEL: std::sync::OnceLock<Box<dyn Fn() + Send + Sync>> = std::sync::OnceLock::new();

/// Cài `applicationShouldTerminate:` vào app delegate. Gọi một lần trong `setup`, trên luồng chính.
#[cfg(target_os = "macos")]
pub fn install(on_cancel: impl Fn() + Send + Sync + 'static) {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{class, msg_send, sel};

    const NS_TERMINATE_CANCEL: usize = 0;
    const NS_TERMINATE_NOW: usize = 1;

    extern "C-unwind" fn should_terminate(_this: *mut AnyObject, _cmd: Sel, _sender: *mut AnyObject) -> usize {
        let event = current_quit_event();
        if allow_terminate(event) {
            log::info!("cho thoát theo yêu cầu của hệ thống: {event:?}");
            NS_TERMINATE_NOW
        } else {
            log::info!("bỏ qua yêu cầu thoát không đến từ menu khay: {event:?}");
            if let Some(on_cancel) = ON_CANCEL.get() {
                on_cancel();
            }
            NS_TERMINATE_CANCEL
        }
    }

    if ON_CANCEL.set(Box::new(on_cancel)).is_err() {
        log::warn!("chặn thoát đã được cài");
        return;
    }
    // SAFETY: gọi trên luồng chính sau khi tao đã tạo NSApplication và gắn delegate. Chữ ký của
    // hàm khớp `- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender`,
    // kiểu trả về là NSUInteger ("Q"); `class_addMethod` không ghi đè nếu lớp đã có phương thức này.
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let delegate: *mut AnyObject = msg_send![app, delegate];
        let Some(delegate) = delegate.as_ref() else {
            log::warn!("NSApp chưa có delegate, không cài được chặn thoát");
            return;
        };
        let class = delegate.class() as *const AnyClass as *mut AnyClass;
        let imp: Imp = std::mem::transmute::<extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize, Imp>(
            should_terminate,
        );
        let added = objc2::ffi::class_addMethod(class, sel!(applicationShouldTerminate:), imp, c"Q@:@".as_ptr());
        if !added.as_bool() {
            log::warn!("app delegate đã có applicationShouldTerminate:, không cài chặn thoát");
        }
    }
}

#[cfg(target_os = "macos")]
fn current_quit_event() -> Option<QuitEvent> {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    // SAFETY: NSAppleEventManager dùng được trên luồng chính; `currentAppleEvent` trả nil khi không
    // có Apple Event nào đang xử lý. AEEventClass, AEEventID, AEKeyword và OSType đều là UInt32.
    unsafe {
        let manager: *mut AnyObject = msg_send![class!(NSAppleEventManager), sharedAppleEventManager];
        let event: *mut AnyObject = msg_send![manager, currentAppleEvent];
        let event = event.as_ref()?;
        let event_class: u32 = msg_send![event, eventClass];
        let event_id: u32 = msg_send![event, eventID];
        let reason: *mut AnyObject = msg_send![event, attributeDescriptorForKeyword: K_AE_QUIT_REASON];
        let reason = reason.as_ref().map(|descriptor| {
            let code: u32 = msg_send![descriptor, enumCodeValue];
            code
        });
        Some(QuitEvent {
            event_class,
            event_id,
            reason,
        })
    }
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib quit_guard::`
Expected:
```text
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 56 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/quit_guard.rs src-tauri/src/lib.rs
git commit -m "feat(app): ⌘Q và Quit ở Dock không thoát app, vẫn cho thoát khi đăng xuất hay tắt máy (§4.3)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 11: Chặn điều hướng ra ngoài; mọi việc mở ra ngoài app đi qua `SystemOpener` (TDD)

**Files:**
- Create: `src-tauri/src/navigation.rs`, `src-tauri/src/system.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod navigation;` và `pub mod system;`)

Theo QĐ22 (§10.2: "Link ngoài mở bằng trình duyệt của hệ thống") và QĐ28.
- `decide` là hàm thuần, có test. Hệ điều hành là tham số (`Os`), nên test kiểm được origin của cả macOS lẫn Windows ngay trên Mac; app truyền `CURRENT_OS`.
- `dev_url_for` chọn URL của dev server theo `tauri::is_dev()`, không theo `cfg!(debug_assertions)`: `pnpm tauri build --debug` là bản debug nhưng nạp giao diện đóng gói, nên không được coi là bản dev (nếu không, cả hai cửa sổ trắng).
- `blob:` bị chặn, kể cả `blob:` của chính app (ghi chú cho 03 ở QĐ22).
- `plugin()` (hook `on_navigation`) và `new_window_handler()` (gắn vào từng cửa sổ) được nối vào app ở Task 17.
- Danh sách `EXTERNAL_HOSTS` để rỗng; test dùng một danh sách riêng.
- `system.rs`: trait `SystemOpener` cho mọi việc mở ra ngoài app (thư mục log, trang Taskbar của Windows, trang Login Items của macOS, link ngoài). Chưa cài thì mọi lời gọi trả lỗi. Test chỉ dùng app giả của Tauri và một bản ghi lời gọi, không mở gì. App thật cài bản thật ở `setup` (Task 17); app giả của các test sau dùng bản giả `test_support::FakeSystem` (Task 17).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod navigation;` và `pub mod system;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/navigation.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Điều hướng của webview (spec §10.2: "Link ngoài mở bằng trình duyệt của hệ thống").
//! - URL của chính app: cho đi. Bản phát hành chỉ nhận origin của giao diện đóng gói trên đúng hệ điều
//!   hành đang chạy (macOS `tauri://localhost`, Windows `http(s)://tauri.localhost`); bản dev chỉ nhận
//!   origin của dev server.
//! - URL `https` (cổng mặc định) có tên miền nằm trong `EXTERNAL_HOSTS`: không mở trong webview, mà
//!   mở bằng trình duyệt của hệ thống qua `system::open_external_url` (`SystemOpener`, QĐ28).
//! - Mọi URL khác: chặn và ghi log (chỉ ghi origin, không ghi đường dẫn hay tham số).
//!
//! Áp cho cả điều hướng trong trang (`on_navigation` của plugin, cho mọi webview) và yêu cầu mở cửa sổ
//! mới (`target="_blank"`, `window.open`), qua `new_window_handler` gắn vào từng cửa sổ.
//!
//! Lưu ý cho kế hoạch 03: URL `blob:` bị chặn, kể cả `blob:` của chính app. Nếu xuất file bằng cách
//! điều hướng tới `blob:` (thẻ `<a download>`) thì phải làm cách khác, ví dụ ghi file phía Rust.

#[cfg(test)]
mod tests {
    use super::*;

    fn d(url: &str, os: Os, dev: Option<&str>, hosts: &[&str]) -> Decision {
        let dev = dev.map(|u| Url::parse(u).unwrap());
        decide(&Url::parse(url).unwrap(), os, dev.as_ref(), hosts)
    }

    const PAYOS: &[&str] = &["pay.payos.vn"];
    const DEV: Option<&str> = Some("http://localhost:1420");

    #[test]
    fn app_urls_depend_on_the_os() {
        assert_eq!(d("tauri://localhost/index.html", Os::MacOs, None, &[]), Decision::Allow);
        assert_eq!(
            d("http://tauri.localhost/overlay.html", Os::MacOs, None, &[]),
            Decision::Block
        );
        assert_eq!(
            d("http://tauri.localhost/overlay.html", Os::Windows, None, &[]),
            Decision::Allow
        );
        assert_eq!(d("https://tauri.localhost/", Os::Windows, None, &[]), Decision::Allow);
        assert_eq!(
            d("tauri://localhost/index.html", Os::Windows, None, &[]),
            Decision::Block
        );
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(d("about:blank", os, None, &[]), Decision::Allow);
        }
    }

    #[test]
    fn dev_build_only_allows_the_dev_server() {
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(d("http://localhost:1420/index.html", os, DEV, &[]), Decision::Allow);
            assert_eq!(d("http://localhost:1420/index.html", os, None, &[]), Decision::Block);
            assert_eq!(d("http://localhost:1421/", os, DEV, &[]), Decision::Block);
            assert_eq!(d("tauri://localhost/index.html", os, DEV, &[]), Decision::Block);
            assert_eq!(d("http://tauri.localhost/", os, DEV, &[]), Decision::Block);
            assert_eq!(d("http://user@localhost:1420/", os, DEV, &[]), Decision::Block);
        }
    }

    #[test]
    fn packaged_ui_ignores_dev_url_even_in_debug_builds() {
        let dev = Url::parse("http://localhost:1420").unwrap();
        assert_eq!(dev_url_for(true, Some(&dev)), Some(dev.clone()));
        assert_eq!(dev_url_for(true, None), None);
        assert_eq!(dev_url_for(false, Some(&dev)), None, "`tauri build --debug`");
        let packaged = dev_url_for(false, Some(&dev));
        let url = Url::parse("tauri://localhost/index.html").unwrap();
        assert_eq!(decide(&url, Os::MacOs, packaged.as_ref(), &[]), Decision::Allow);
    }

    #[test]
    fn blob_urls_are_blocked_even_from_the_app() {
        assert_eq!(d("blob:tauri://localhost/1b2c", Os::MacOs, None, &[]), Decision::Block);
        assert_eq!(
            d("blob:http://tauri.localhost/1b2c", Os::Windows, None, &[]),
            Decision::Block
        );
        assert_eq!(
            d("blob:http://localhost:1420/1b2c", Os::MacOs, DEV, &[]),
            Decision::Block
        );
    }

    #[test]
    fn allowed_https_hosts_open_in_the_browser() {
        for os in [Os::MacOs, Os::Windows] {
            assert_eq!(
                d("https://pay.payos.vn/web/abc?x=1", os, None, PAYOS),
                Decision::OpenExternal
            );
            assert_eq!(
                d("https://PAY.payos.vn/web/abc", os, DEV, PAYOS),
                Decision::OpenExternal
            );
        }
    }

    #[test]
    fn everything_else_is_blocked() {
        for os in [Os::MacOs, Os::Windows] {
            for url in [
                "http://pay.payos.vn/web/abc",
                "https://evil.pay.payos.vn/",
                "https://pay.payos.vn.evil.com/",
                "https://user@pay.payos.vn/",
                "https://pay.payos.vn:8443/",
                "https://example.com/",
                "tauri://evil/",
                "tauri://localhost:8080/",
                "http://tauri.localhost:8080/",
                "http://user@tauri.localhost/",
                "file:///etc/passwd",
                "javascript:alert(1)",
                "data:text/html,<b>x</b>",
            ] {
                assert_eq!(d(url, os, DEV, PAYOS), Decision::Block, "{os:?} {url}");
                assert_eq!(d(url, os, None, PAYOS), Decision::Block, "{os:?} {url}");
            }
            assert_eq!(
                d("https://pay.payos.vn/", os, None, &[]),
                Decision::Block,
                "danh sách rỗng thì chặn hết"
            );
        }
    }
}
```

Tạo `src-tauri/src/system.rs`, cũng chỉ có phần chú thích đầu file và test:

```rust
//! Mọi việc app mở ra ngoài chính nó: thư mục log trong Finder/Explorer, trang của System Settings
//! hay Settings của Windows, link ngoài trong trình duyệt (QĐ28 của kế hoạch 01).
//!
//! Tất cả đi qua trait `SystemOpener`, quản lý bằng `app.manage(System(..))`:
//! - app thật cài bản thật ở `setup` (`install`);
//! - app giả của test cài bản giả ghi lại từng lần gọi (`test_support::FakeSystem`). Vì vậy kể cả khi
//!   ACL lỡ cấp thừa một lệnh, test chạy tới handler cũng không mở gì trên màn hình người dùng.
//! - Chưa cài thì mọi lời gọi trả lỗi, không mở gì.
//!
//! Kế hoạch sau thêm việc mở ra ngoài (ví dụ 02: trang quyền ghi âm thanh của System Settings) thì thêm
//! một phương thức vào trait này, không gọi `tauri-plugin-opener` hay API hệ thống ở chỗ khác.

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Default)]
    struct Recorder(Arc<Mutex<Vec<String>>>);

    impl Recorder {
        fn push(&self, call: &str) -> Result<(), String> {
            self.0.lock().unwrap().push(call.into());
            Ok(())
        }
    }

    impl SystemOpener for Recorder {
        fn open_log_dir(&self) -> Result<(), String> {
            self.push("open_log_dir")
        }
        fn open_taskbar_settings(&self) -> Result<(), String> {
            self.push("open_taskbar_settings")
        }
        fn open_login_items_settings(&self) -> Result<(), String> {
            self.push("open_login_items_settings")
        }
        fn open_external_url(&self, url: &str) -> Result<(), String> {
            self.push(&format!("open_external_url {url}"))
        }
    }

    #[test]
    fn nothing_opens_until_an_opener_is_installed() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        assert!(open_log_dir(app).is_err());
        assert!(open_taskbar_settings(app).is_err());
        assert!(open_login_items_settings(app).is_err());
        assert!(open_external_url(app, "https://pay.payos.vn/").is_err());
    }

    #[test]
    fn calls_go_to_the_installed_opener() {
        let app = tauri::test::mock_app();
        let recorder = Recorder::default();
        app.manage(System(Box::new(recorder.clone())));
        let app = app.handle();
        open_log_dir(app).unwrap();
        open_taskbar_settings(app).unwrap();
        open_login_items_settings(app).unwrap();
        open_external_url(app, "https://pay.payos.vn/web/1").unwrap();
        assert_eq!(
            *recorder.0.lock().unwrap(),
            [
                "open_log_dir",
                "open_taskbar_settings",
                "open_login_items_settings",
                "open_external_url https://pay.payos.vn/web/1",
            ]
        );
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib -- navigation:: system::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find type `Os` in this scope
error[E0425]: cannot find type `Decision` in this scope
error[E0405]: cannot find trait `SystemOpener` in this scope
error[E0425]: cannot find function, tuple struct or tuple variant `System` in this scope
error[E0433]: cannot find type `Url` in this scope
```

- [ ] **Step 4: Viết code.** Trong `src-tauri/src/navigation.rs`, chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use tauri::plugin::TauriPlugin;
use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, Url};

use crate::system;

/// Tên miền được mở bằng trình duyệt. Kế hoạch 06 thêm trang thanh toán của PayOS, kế hoạch 07 thêm
/// website của sản phẩm (tên miền chờ Q1). Chỉ so khớp đúng cả tên miền, không nhận tên miền con.
pub const EXTERNAL_HOSTS: &[&str] = &[];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Allow,
    OpenExternal,
    Block,
}

/// Hệ điều hành, để biết origin của giao diện đóng gói.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Os {
    MacOs,
    Windows,
}

pub const CURRENT_OS: Os = if cfg!(target_os = "macos") {
    Os::MacOs
} else {
    Os::Windows
};

/// Quyết định cho một URL. `dev_url` chỉ có ở bản dev (`devUrl` của `tauri.conf.json`).
pub fn decide(url: &Url, os: Os, dev_url: Option<&Url>, external_hosts: &[&str]) -> Decision {
    if is_app_url(url, os, dev_url) {
        return Decision::Allow;
    }
    let external = url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .host_str()
            .is_some_and(|host| external_hosts.iter().any(|h| h.eq_ignore_ascii_case(host)));
    if external {
        Decision::OpenExternal
    } else {
        Decision::Block
    }
}

fn is_app_url(url: &Url, os: Os, dev_url: Option<&Url>) -> bool {
    if url.as_str() == "about:blank" {
        return true;
    }
    if let Some(dev) = dev_url {
        // Bản dev: giao diện chỉ đến từ dev server. So cả scheme để `blob:` của dev server không lọt.
        return url.scheme() == dev.scheme() && url.origin() == dev.origin() && url.username().is_empty();
    }
    let plain = url.port().is_none() && url.username().is_empty() && url.password().is_none();
    let host = url.host_str();
    match os {
        Os::MacOs => url.scheme() == "tauri" && host == Some("localhost") && plain,
        // `https` khi bật `useHttpsScheme`.
        Os::Windows => matches!(url.scheme(), "http" | "https") && host == Some("tauri.localhost") && plain,
    }
}

/// URL của dev server, chỉ khi app nạp giao diện từ đó. `tauri::is_dev()` (chưa bật feature
/// `custom-protocol`) là đúng cách Tauri chọn nguồn giao diện; `cfg!(debug_assertions)` thì sai với
/// `pnpm tauri build --debug`, bản debug mà vẫn nạp giao diện đóng gói từ `tauri://localhost`.
pub fn dev_url_for(is_dev: bool, configured: Option<&Url>) -> Option<Url> {
    if is_dev { configured.cloned() } else { None }
}

fn dev_url<R: Runtime>(app: &AppHandle<R>) -> Option<Url> {
    dev_url_for(tauri::is_dev(), app.config().build.dev_url.as_ref())
}

/// Áp quyết định; trả về `true` nếu webview được đi tới URL này.
fn apply<R: Runtime>(app: &AppHandle<R>, url: &Url) -> bool {
    match decide(url, CURRENT_OS, dev_url(app).as_ref(), EXTERNAL_HOSTS) {
        Decision::Allow => true,
        Decision::OpenExternal => {
            if let Err(e) = system::open_external_url(app, url.as_str()) {
                log::warn!(
                    "không mở được {} bằng trình duyệt: {e}",
                    url.origin().ascii_serialization()
                );
            }
            false
        }
        Decision::Block => {
            log::warn!("chặn điều hướng tới {}", url.origin().ascii_serialization());
            false
        }
    }
}

/// Plugin kiểm mọi lần điều hướng của mọi webview.
pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("navigation-guard")
        .on_navigation(|webview, url| apply(webview.app_handle(), url))
        .build()
}

/// Gắn vào từng cửa sổ (`on_new_window`): không bao giờ mở cửa sổ webview mới; link ngoài được phép
/// thì mở bằng trình duyệt.
pub fn new_window_handler<R: Runtime>(
    app: AppHandle<R>,
) -> impl Fn(Url, NewWindowFeatures) -> NewWindowResponse<R> + Send + 'static {
    move |url, _features| {
        apply(&app, &url);
        NewWindowResponse::Deny
    }
}
```

Trong `src-tauri/src/system.rs`, chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt as _;

pub trait SystemOpener: Send + Sync + 'static {
    /// Mở thư mục log bằng trình quản lý file (tạo thư mục nếu chưa có).
    fn open_log_dir(&self) -> Result<(), String>;
    /// Windows: Settings › Personalization › Taskbar.
    fn open_taskbar_settings(&self) -> Result<(), String>;
    /// macOS: System Settings › General › Login Items.
    fn open_login_items_settings(&self) -> Result<(), String>;
    /// Mở một URL mà `navigation` đã cho phép bằng trình duyệt của hệ thống.
    fn open_external_url(&self, url: &str) -> Result<(), String>;
}

/// `SystemOpener` đang dùng.
pub struct System(pub Box<dyn SystemOpener>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SystemOpener for Native<R> {
    fn open_log_dir(&self) -> Result<(), String> {
        let dir = self.0.path().app_log_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        self.0
            .opener()
            .open_path(dir.to_string_lossy(), None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_taskbar_settings(&self) -> Result<(), String> {
        if !cfg!(windows) {
            return Err("chỉ có trên Windows".into());
        }
        self.0
            .opener()
            .open_url("ms-settings:taskbar", None::<&str>)
            .map_err(|e| e.to_string())
    }

    fn open_login_items_settings(&self) -> Result<(), String> {
        #[cfg(target_os = "macos")]
        {
            use objc2_service_management::SMAppService;
            // SAFETY: phương thức lớp, không tham số; có từ macOS 13, app yêu cầu 14.2 trở lên (spec D3).
            unsafe { SMAppService::openSystemSettingsLoginItems() };
            Ok(())
        }
        #[cfg(not(target_os = "macos"))]
        Err("chỉ có trên macOS".into())
    }

    fn open_external_url(&self, url: &str) -> Result<(), String> {
        self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}

/// Cài bản thật. Gọi một lần ở đầu `setup`, trước khi tạo cửa sổ.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(System(Box::new(Native(app.clone()))));
}

fn with<R: Runtime>(
    app: &AppHandle<R>,
    call: impl FnOnce(&dyn SystemOpener) -> Result<(), String>,
) -> Result<(), String> {
    match app.try_state::<System>() {
        Some(system) => call(system.0.as_ref()),
        None => Err("chưa cài SystemOpener".into()),
    }
}

pub fn open_log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_log_dir())
}

pub fn open_taskbar_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_taskbar_settings())
}

pub fn open_login_items_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_login_items_settings())
}

pub fn open_external_url<R: Runtime>(app: &AppHandle<R>, url: &str) -> Result<(), String> {
    with(app, |s| s.open_external_url(url))
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib -- navigation:: system::`
Expected:
```text
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 59 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/navigation.rs src-tauri/src/system.rs src-tauri/src/lib.rs
git commit -m "feat(app): chặn điều hướng ra ngoài app, link ngoài được phép thì mở bằng trình duyệt (§10.2); mọi việc mở ra ngoài app đi qua SystemOpener" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 12: Trạng thái thật của "khởi động cùng hệ thống" (TDD)

**Files:**
- Create: `src-tauri/src/login_item.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod login_item;`)

Theo QĐ16 và QĐ29.
- `effective`, `needs_approval`, `launch_agent_path` và `autostart_name` (tên LaunchAgent theo bundle identifier trên macOS, theo tên sản phẩm trên Windows) là phần thuần, có test.
- Trait `LoginItem` gói việc bật, tắt và hỏi trạng thái (bản thật dùng `tauri-plugin-autostart` và `agent_status`, cài ở `setup` bằng `login_item::install`). Test ở Task 17 dùng bản giả, không đụng LaunchAgent hay registry thật.
- `agent_status` (macOS) hỏi `SMAppService statusForLegacyURL:`. Hàm này chỉ đọc, không đăng ký gì và không bật hộp thoại, nên agent chạy được test `#[ignore]` của nó (Step 6).
- Việc mở System Settings › Login Items (`SMAppService openSystemSettingsLoginItems`) không nằm ở đây, mà ở `SystemOpener` (Task 11, QĐ28). Test dùng bản giả, nên kể cả khi ACL lỡ cấp thừa, không test nào mở System Settings thật. Người thử bằng tay ở Task 24 dòng 21.
- Task 17 dùng các hàm này trong `actions::sync_launch_at_login` và `actions::update_settings` (lời nhắc khi cần cho phép; tắt mà vẫn còn bật thì báo lỗi `autostartStillEnabled`).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod login_item;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/login_item.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Trạng thái thật của "khởi động cùng hệ thống" (Đ19, QĐ16 và QĐ29 của kế hoạch 01).
//!
//! macOS: `tauri-plugin-autostart` 2.7.0 (`auto-launch` 0.6.0) ghi một LaunchAgent ở
//! `~/Library/LaunchAgents/<tên>.plist`, với `Label` cũng là `<tên>`; app đặt `<tên>` là bundle
//! identifier (`autostart_name`, QĐ29). `is_enabled()` chỉ xem file đó có tồn tại không. Người dùng tắt
//! app ở System Settings › General › Login Items thì file vẫn còn, nhưng launchd không chạy nó nữa. Vì
//! vậy app hỏi thêm `SMAppService statusForLegacyURL:` (macOS 13+): chỉ coi là bật khi trạng thái là
//! `Enabled`. Người dùng bật lại trong app mà mục vẫn bị tắt ở Login Items thì hệ thống báo
//! `RequiresApproval`; app hiện lời nhắc kèm nút mở đúng trang đó của System Settings
//! (`system::open_login_items_settings`).
//!
//! Windows: `auto-launch` 0.6.0 đọc cả giá trị trong `...\CurrentVersion\Run` lẫn khóa
//! `Explorer\StartupApproved\Run` mà Task Manager ghi khi người dùng tắt mục khởi động, ở cả `HKLM` và
//! `HKCU`, nên `is_enabled()` đã là trạng thái thật. `enable()` ghi `HKLM` trước (mọi người dùng), chỉ
//! khi không có quyền mới ghi `HKCU`; `disable()` xóa cả hai, nhưng không có quyền admin thì mục ở
//! `HKLM` còn nguyên. Vì vậy sau khi tắt, app hỏi lại và báo lỗi nếu vẫn còn bật.
//!
//! Việc bật/tắt và hỏi trạng thái đi qua trait `LoginItem`, để test dùng bản giả
//! (`test_support::FakeLoginItem`) mà không đụng LaunchAgent, Login Items hay registry thật.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_agent_is_named_after_the_bundle_identifier() {
        let name = autostart_name("com.aitranslator.desktop", "AI Translator");
        if cfg!(target_os = "macos") {
            assert_eq!(name, "com.aitranslator.desktop");
            assert_eq!(
                launch_agent_path(Path::new("/Users/a"), name),
                PathBuf::from("/Users/a/Library/LaunchAgents/com.aitranslator.desktop.plist")
            );
        } else {
            assert_eq!(name, "AI Translator", "Windows: tên giá trị trong `Run`");
        }
    }

    #[test]
    fn only_enabled_status_counts() {
        assert!(effective(true, Some(AgentStatus::Enabled)));
        assert!(effective(true, None), "không đọc được trạng thái thì tin plugin");
        assert!(
            !effective(true, Some(AgentStatus::RequiresApproval)),
            "đã tắt ở Login Items"
        );
        assert!(!effective(true, Some(AgentStatus::NotFound)));
        assert!(!effective(false, Some(AgentStatus::Enabled)), "plugin chưa đăng ký");
        assert_eq!(AgentStatus::from_raw(7), AgentStatus::Unknown(7));
        assert!(!effective(true, Some(AgentStatus::Unknown(7))));
    }

    #[test]
    fn approval_is_needed_only_when_the_system_asks_for_it() {
        assert!(needs_approval(Some(AgentStatus::RequiresApproval)));
        for status in [
            None,
            Some(AgentStatus::Enabled),
            Some(AgentStatus::NotRegistered),
            Some(AgentStatus::NotFound),
            Some(AgentStatus::Unknown(7)),
        ] {
            assert!(!needs_approval(status), "{status:?}");
        }
    }

    /// Chạy tay: `cargo test -p meeting-translator --lib login_item -- --ignored --nocapture`.
    /// Chỉ đọc trạng thái, không đăng ký gì, không bật hộp thoại.
    #[test]
    #[ignore = "hỏi dịch vụ Background Task Management của macOS"]
    #[cfg(target_os = "macos")]
    fn system_reports_missing_agent() {
        let status = agent_status(Path::new("/tmp/com.aitranslator.desktop.khong-co.plist"));
        println!("{status:?}");
        assert!(matches!(
            status,
            Some(AgentStatus::NotFound | AgentStatus::NotRegistered)
        ));
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib login_item::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0433]: cannot find type `Path` in this scope
error[E0433]: cannot find type `PathBuf` in this scope
error[E0425]: cannot find function `autostart_name` in this scope
error[E0425]: cannot find function `launch_agent_path` in this scope
error[E0433]: cannot find type `AgentStatus` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_autostart::ManagerExt as _;

/// Tên mục khởi động cùng hệ thống mà app đăng ký (QĐ29). macOS: bundle identifier, dùng cho cả tên
/// file LaunchAgent lẫn `Label` (không có dấu cách, đúng kiểu reverse-DNS của launchd). Windows: tên sản
/// phẩm, là tên giá trị trong `Run` (mặc định của plugin).
pub fn autostart_name<'a>(identifier: &'a str, product_name: &'a str) -> &'a str {
    if cfg!(target_os = "macos") {
        identifier
    } else {
        product_name
    }
}

/// Đường dẫn LaunchAgent mà `auto-launch` (dùng bởi `tauri-plugin-autostart`) tạo cho app.
pub fn launch_agent_path(home: &Path, app_name: &str) -> PathBuf {
    home.join("Library/LaunchAgents").join(format!("{app_name}.plist"))
}

/// Trạng thái hệ thống báo cho một LaunchAgent cũ (không đăng ký qua `SMAppService`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentStatus {
    Enabled,
    /// Người dùng đã tắt ở Login Items, hoặc chưa cho phép.
    RequiresApproval,
    NotRegistered,
    NotFound,
    Unknown(isize),
}

impl AgentStatus {
    pub fn from_raw(raw: isize) -> Self {
        match raw {
            0 => Self::NotRegistered,
            1 => Self::Enabled,
            2 => Self::RequiresApproval,
            3 => Self::NotFound,
            other => Self::Unknown(other),
        }
    }
}

/// Có đang khởi động cùng hệ thống thật không: plugin báo đã đăng ký, và (trên macOS) hệ thống báo
/// `Enabled`. Không đọc được trạng thái của hệ thống thì tin plugin.
pub fn effective(registered: bool, status: Option<AgentStatus>) -> bool {
    registered && status.is_none_or(|s| s == AgentStatus::Enabled)
}

/// Vừa bật trong app mà hệ thống vẫn báo cần cho phép: mục đang bị tắt ở Login Items, phải nhắc người
/// dùng bật lại ở System Settings (app không tự bật được).
pub fn needs_approval(status: Option<AgentStatus>) -> bool {
    status == Some(AgentStatus::RequiresApproval)
}

/// Hỏi hệ thống trạng thái của LaunchAgent ở `plist`. Không bật hộp thoại nào.
#[cfg(target_os = "macos")]
pub fn agent_status(plist: &Path) -> Option<AgentStatus> {
    use objc2_foundation::{NSString, NSURL};
    use objc2_service_management::SMAppService;
    let path = NSString::from_str(plist.to_str()?);
    let url = NSURL::fileURLWithPath(&path);
    // SAFETY: phương thức lớp, chỉ đọc; có từ macOS 13, app yêu cầu 14.2 trở lên (spec D3).
    let status = unsafe { SMAppService::statusForLegacyURL(&url) };
    Some(AgentStatus::from_raw(status.0))
}

#[cfg(not(target_os = "macos"))]
pub fn agent_status(_plist: &Path) -> Option<AgentStatus> {
    None
}

/// Bật/tắt và đọc trạng thái "khởi động cùng hệ thống". Bản thật dùng `tauri-plugin-autostart` và
/// `SMAppService`; test dùng bản giả.
pub trait LoginItem: Send + Sync + 'static {
    fn enable(&self) -> Result<(), String>;
    fn disable(&self) -> Result<(), String>;
    /// Plugin báo đã đăng ký chưa (macOS: có file LaunchAgent; Windows: có giá trị trong `Run` và Task
    /// Manager không tắt).
    fn is_registered(&self) -> Result<bool, String>;
    /// macOS: trạng thái hệ thống báo cho LaunchAgent của app; `None` trên Windows hay khi không đọc được.
    fn system_status(&self) -> Option<AgentStatus>;
}

/// `LoginItem` đang dùng, quản lý bằng `app.manage`.
pub struct LoginItems(pub Box<dyn LoginItem>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> LoginItem for Native<R> {
    fn enable(&self) -> Result<(), String> {
        self.0.autolaunch().enable().map_err(|e| e.to_string())
    }

    fn disable(&self) -> Result<(), String> {
        self.0.autolaunch().disable().map_err(|e| e.to_string())
    }

    fn is_registered(&self) -> Result<bool, String> {
        self.0.autolaunch().is_enabled().map_err(|e| e.to_string())
    }

    fn system_status(&self) -> Option<AgentStatus> {
        let home = self.0.path().home_dir().ok()?;
        let name = autostart_name(&self.0.config().identifier, &self.0.package_info().name);
        agent_status(&launch_agent_path(&home, name))
    }
}

/// Cài bản thật. Gọi một lần ở đầu `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(LoginItems(Box::new(Native(app.clone()))));
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib login_item::`
Expected:
```text
test result: ok. 3 passed; 0 failed; 1 ignored; 0 measured; 67 filtered out; finished in 0.00s
```

- [ ] **Step 6: Hỏi hệ thống thật một lần** (chỉ đọc)

Run: `cargo test -p meeting-translator --lib login_item -- --ignored --nocapture`
Expected (lúc lập kế hoạch):
```text
Some(NotRegistered)
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 70 filtered out; finished in 0.00s
```

- [ ] **Step 7: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/login_item.rs src-tauri/src/lib.rs
git commit -m "feat(app): đọc trạng thái thật của khởi động cùng hệ thống trên macOS bằng SMAppService" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 13: Đọc ghi file cài đặt bằng `tauri-plugin-store` (TDD)

**Files:**
- Create: `src-tauri/src/settings/persist.rs`
- Modify: `src-tauri/src/settings/mod.rs` (thêm `pub mod persist;`)

`load` cần `AppHandle` có `tauri-plugin-store` thật nên chạy ở Task 17 và thử tay ở Task 24. Test tự động kiểm phần giữ lại file hỏng (QĐ2), trong thư mục tạm.
- Việc ghi đi qua trait `SettingsFile` (bản thật ghi vào store, cài ở `setup` bằng `persist::install`). Chưa cài thì `save` trả lỗi, không panic. Test dùng app giả của Tauri với một bản ghi lời gọi: `save` ghi mọi khóa cùng `schemaVersion`, `save_overlay` chỉ ghi `overlay`. Test ở Task 17 dùng bản giả `FakeSettingsFile`, vì đăng ký `tauri-plugin-store` thật trong test sẽ ghi vào thư mục cài đặt thật của app.
- `save` và `save_overlay` ghi qua `migrate::to_entries`, nên giữ được giá trị thô và khóa con lạ của file bản mới hơn (QĐ2).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod persist;` vào khối `pub mod` ở đầu `src-tauri/src/settings/mod.rs`, sau `pub mod patch;`. Khối này giờ là:

```rust
pub mod migrate;
pub mod patch;
pub mod persist;
```

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/settings/persist.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Đọc ghi file cài đặt bằng `tauri-plugin-store` (spec §6.9).
//!
//! File nằm ở thư mục dữ liệu của app (`BaseDirectory::AppData`): trên macOS là
//! `~/Library/Application Support/<bundle-id>/settings.json`, trên Windows là
//! `%APPDATA%\<bundle-id>\settings.json`. Store tự ghi file sau 300 ms kể từ lần sửa cuối, và ghi
//! lần cuối khi app thoát.
//!
//! Giao diện không gọi thẳng được lệnh của plugin (capabilities không cấp `store:*`); mọi thay đổi
//! đi qua lệnh `update_settings`, nơi phía Rust kiểm phạm vi.
//!
//! Việc ghi đi qua trait `SettingsFile`: app thật cài bản ghi vào store ở `setup` (`install`); app giả
//! của test dùng bản giả (`test_support::FakeSettingsFile`), vì đăng ký `tauri-plugin-store` trong test
//! sẽ ghi vào thư mục cài đặt thật của app. Chưa cài thì `save` trả lỗi, không panic.

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-settings-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn corrupt_file_is_renamed() {
        let dir = temp_dir("corrupt");
        let path = dir.join(STORE_FILE);
        std::fs::write(&path, b"{\"uiLanguage\": \"vi\",").unwrap();
        let backup = backup_if_corrupt(&path).unwrap().unwrap();
        assert_eq!(backup, dir.join("settings.json.corrupt"));
        assert!(!path.exists());
        assert_eq!(std::fs::read(&backup).unwrap(), b"{\"uiLanguage\": \"vi\",");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[derive(Clone, Default)]
    struct Recorder(std::sync::Arc<std::sync::Mutex<Vec<Vec<String>>>>);

    impl SettingsFile for Recorder {
        fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
            self.0
                .lock()
                .unwrap()
                .push(entries.into_iter().map(|(k, _)| k).collect());
            Ok(())
        }
    }

    #[test]
    fn saving_without_a_settings_file_fails_instead_of_panicking() {
        let app = tauri::test::mock_app();
        let settings = Settings::defaults(crate::settings::UiLanguage::Vi);
        assert!(save(app.handle(), &settings, &FileMeta::current()).is_err());
        assert!(save_overlay(app.handle(), &settings, &FileMeta::current()).is_err());
    }

    #[test]
    fn save_writes_every_key_and_save_overlay_only_overlay() {
        let app = tauri::test::mock_app();
        let recorder = Recorder::default();
        app.manage(Writer(Box::new(recorder.clone())));
        let settings = Settings::defaults(crate::settings::UiLanguage::Vi);
        save(app.handle(), &settings, &FileMeta::current()).unwrap();
        save_overlay(app.handle(), &settings, &FileMeta::current()).unwrap();
        let writes = recorder.0.lock().unwrap();
        assert!(writes[0].contains(&"schemaVersion".to_string()));
        assert!(writes[0].contains(&"overlay".to_string()));
        assert!(writes[0].contains(&"launchAtLogin".to_string()));
        assert_eq!(writes[1], ["overlay"]);
    }

    #[test]
    fn valid_or_missing_file_is_left_alone() {
        let dir = temp_dir("valid");
        let path = dir.join(STORE_FILE);
        assert_eq!(backup_if_corrupt(&path).unwrap(), None);
        std::fs::write(&path, b"{\"schemaVersion\": 1}").unwrap();
        assert_eq!(backup_if_corrupt(&path).unwrap(), None);
        assert!(path.exists());
        // Mảng JSON không phải object của store: coi là hỏng.
        std::fs::write(&path, b"[1, 2]").unwrap();
        assert!(backup_if_corrupt(&path).unwrap().is_some());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib settings::persist`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find type `PathBuf` in this scope
error[E0425]: cannot find value `STORE_FILE` in this scope
error[E0405]: cannot find trait `SettingsFile` in this scope
error[E0425]: cannot find type `Value` in this scope
error[E0433]: cannot find type `Settings` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_store::{StoreBuilder, StoreExt};

use super::Settings;
use super::migrate::{self, FileMeta, Loaded};

pub const STORE_FILE: &str = "settings.json";
const AUTO_SAVE: Duration = Duration::from_millis(300);

/// Mở store và đọc cài đặt, kèm migrate từ schema cũ.
pub fn load<R: Runtime>(app: &AppHandle<R>, defaults: Settings) -> Result<Loaded, tauri_plugin_store::Error> {
    let path = tauri_plugin_store::resolve_store_path(app, STORE_FILE)?;
    match backup_if_corrupt(&path) {
        Ok(Some(backup)) => log::warn!("file cài đặt hỏng, đã đổi tên thành {}", backup.display()),
        Ok(None) => {}
        Err(e) => log::warn!("không kiểm được file cài đặt: {e}"),
    }
    let store = StoreBuilder::new(app, STORE_FILE).auto_save(AUTO_SAVE).build()?;
    let raw: Map<String, Value> = store.entries().into_iter().collect();
    Ok(migrate::load(raw, defaults))
}

/// Nơi ghi các mục của file cài đặt.
pub trait SettingsFile: Send + Sync + 'static {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String>;
}

/// `SettingsFile` đang dùng, quản lý bằng `app.manage`.
pub struct Writer(pub Box<dyn SettingsFile>);

struct StoreFile<R: Runtime>(AppHandle<R>);

impl<R: Runtime> SettingsFile for StoreFile<R> {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
        let store = self.0.store(STORE_FILE).map_err(|e| e.to_string())?;
        for (key, value) in entries {
            store.set(key, value);
        }
        Ok(())
    }
}

/// Cài bản ghi vào store. Gọi một lần ở đầu `setup`.
pub fn install<R: Runtime>(app: &AppHandle<R>) {
    app.manage(Writer(Box::new(StoreFile(app.clone()))));
}

fn write<R: Runtime>(app: &AppHandle<R>, entries: Vec<(String, Value)>) -> Result<(), String> {
    match app.try_state::<Writer>() {
        Some(writer) => writer.0.write(entries),
        None => Err("chưa cài SettingsFile".into()),
    }
}

/// Ghi mọi khóa của `settings` vào store. Khóa lạ đã có trong file (của bản app mới hơn) giữ nguyên;
/// khóa bản mới hơn ghi mà bản này không đọc được thì ghi lại giá trị thô (`FileMeta::preserved`).
pub fn save<R: Runtime>(app: &AppHandle<R>, settings: &Settings, meta: &FileMeta) -> Result<(), String> {
    write(app, migrate::to_entries(settings, meta))
}

/// Chỉ ghi khóa `overlay`. Dùng khi thanh phụ đề di chuyển: lúc kéo, sự kiện đến dồn dập, nên không
/// ghi lại mọi khóa (mỗi lần ghi một khóa, store phát một sự kiện `store://change`).
pub fn save_overlay<R: Runtime>(app: &AppHandle<R>, settings: &Settings, meta: &FileMeta) -> Result<(), String> {
    let entries = migrate::to_entries(settings, meta)
        .into_iter()
        .filter(|(k, _)| k == "overlay")
        .collect();
    write(app, entries)
}

/// `tauri-plugin-store` bỏ qua file không đọc được và mở store rỗng; lần ghi sau sẽ đè mất file.
/// Vì vậy trước khi mở store, file không phải object JSON thì đổi tên thành `settings.json.corrupt`
/// để người dùng hay bộ phận hỗ trợ còn xem lại được. Trả về đường dẫn bản đã đổi tên, nếu có.
pub fn backup_if_corrupt(path: &Path) -> std::io::Result<Option<PathBuf>> {
    let bytes = match std::fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e),
    };
    if serde_json::from_slice::<Map<String, Value>>(&bytes).is_ok() {
        return Ok(None);
    }
    let mut backup = path.as_os_str().to_owned();
    backup.push(".corrupt");
    let backup = PathBuf::from(backup);
    std::fs::rename(path, &backup)?;
    Ok(Some(backup))
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib settings::persist`
Expected:
```text
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 71 filtered out; finished in 0.01s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/settings/persist.rs src-tauri/src/settings/mod.rs
git commit -m "feat(app): đọc ghi cài đặt bằng tauri-plugin-store, giữ lại file cài đặt hỏng" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 14: Từ điển giao diện vi/en và Vitest (TDD)

**Files:**
- Create: `vitest.config.ts`, `src/i18n/i18n.test.ts`, `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/index.ts`
- Modify: `package.json` (thêm lệnh `test`)

§4.5 và QĐ9.
- `en.ts` là nguồn chuẩn của danh sách khóa. Kiểu `Record<MessageKey, string>` trong `vi.ts` báo lỗi biên dịch nếu thiếu hay thừa khóa.
- Test kiểm thêm lúc chạy: chuỗi rỗng, tham số lệch nhau, chuỗi quên dịch.
- Từ điển gồm chữ của mọi màn hình ở Task 21, lời nhắc `notice.*`, và câu báo lỗi `error.<mã>` cho mọi mã lỗi phía Rust.

Task này làm trước Task 15, vì test ở Task 15 đọc `src/i18n/en.ts`.

- [ ] **Step 1: Cấu hình Vitest.** Tạo `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

// Test logic của giao diện (store, i18n, phím tắt) chạy trong Node, không cần DOM hay Tauri.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

Trong `package.json`, đặt khối `scripts` thành:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "tauri": "tauri"
  },
```

- [ ] **Step 2: Viết test trước.** Tạo `src/i18n/i18n.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectUiLanguage, en, errorKey, placeholders, translate, vi } from "./index";

describe("từ điển giao diện", () => {
  it("vi có đúng các khóa của en, không thiếu không thừa", () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it("không chuỗi nào rỗng hay thừa khoảng trắng", () => {
    for (const dict of [en, vi]) {
      for (const [key, text] of Object.entries(dict)) {
        expect(text.trim(), key).not.toBe("");
        expect(text, key).toBe(text.trim());
      }
    }
  });

  it("hai ngôn ngữ có cùng tham số ở mỗi khóa", () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(vi[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it("chuỗi tiếng Việt đã được dịch, trừ tên riêng và tên ngôn ngữ", () => {
    const same = (Object.keys(en) as (keyof typeof en)[]).filter((key) => en[key] === vi[key]);
    expect(same.sort()).toEqual(
      ["app.name", "channel.beta", "lang.en", "lang.ja", "lang.ko", "lang.vi", "lang.zh", "settings.group.model"].sort(),
    );
  });
});

describe("translate", () => {
  it("chọn đúng ngôn ngữ", () => {
    expect(translate("vi", "home.start")).toBe("Bắt đầu");
    expect(translate("en", "home.start")).toBe("Start");
  });

  it("điền tham số, giữ nguyên chỗ không có tham số", () => {
    expect(translate("vi", "onboarding.step", { n: 2, total: 8 })).toBe("Bước 2/8");
    expect(translate("en", "about.version", {})).toBe("Version {version}");
  });
});

describe("detectUiLanguage", () => {
  it("tiếng Việt nếu locale đầu tiên là tiếng Việt, còn lại English", () => {
    expect(detectUiLanguage(["vi-VN", "en-US"])).toBe("vi");
    expect(detectUiLanguage(["vi"])).toBe("vi");
    expect(detectUiLanguage(["en-US", "vi-VN"])).toBe("en");
    expect(detectUiLanguage(["fr-FR"])).toBe("en");
    expect(detectUiLanguage([])).toBe("en");
  });
});

describe("errorKey", () => {
  it("mã lỗi của Rust ra khóa error.<mã>, mã lạ ra câu chung", () => {
    expect(errorKey("outOfRange")).toBe("error.outOfRange");
    expect(errorKey("hotkeyDuplicate")).toBe("error.hotkeyDuplicate");
    expect(errorKey("khongCo")).toBe("error.unknown");
  });
});
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `pnpm test`
Expected: FAIL:
```text
 FAIL  src/i18n/i18n.test.ts [ src/i18n/i18n.test.ts ]
Error: Cannot find module './index' imported from /Users/dtphong/Desktop/software_business/meeting-translator/src/i18n/i18n.test.ts
 Test Files  1 failed (1)
```

- [ ] **Step 4: Tạo `src/i18n/en.ts`**

```ts
// Từ điển English: nguồn chuẩn của danh sách khóa (spec §4.5). Thêm khóa ở đây trước, rồi thêm ở vi.ts;
// kiểu `Record<MessageKey, string>` trong vi.ts báo lỗi nếu thiếu hay thừa khóa.
// `{tên}` là chỗ điền tham số; hai ngôn ngữ phải có cùng tham số (test ở i18n.test.ts).
export const en = {
  "app.name": "AI Translator",

  "nav.home": "Home",
  "nav.transcript": "Transcript",
  "nav.history": "History",
  "nav.glossary": "Glossary",
  "nav.settings": "Settings",
  "nav.upgrade": "Upgrade to Pro",
  "nav.about": "About",

  "status.idle": "Ready",
  "status.running": "Translating",
  "status.error": "Error",

  "home.start": "Start",
  "home.stop": "Stop",
  "home.languages": "Languages",
  "home.audioSource": "Audio source",
  "home.audioSource.system.macos": "Whole system, except this app",
  "home.audioSource.system.windows": "Default playback devices (automatic)",
  "home.inputLevel": "Input level",
  "home.minutesLeft": "Free minutes left today",
  "home.overlay": "Subtitle bar",
  "home.overlay.show": "Show",
  "home.overlay.hide": "Hide",
  "home.overlay.lock": "Lock (click-through)",
  "home.overlay.unlock": "Unlock",

  "languages.target": "Translate into",
  "languages.sources": "Languages spoken in the meeting",
  "languages.lock": "Source language",
  "languages.lock.auto": "Detect automatically",

  "lang.en": "English",
  "lang.zh": "中文",
  "lang.ja": "日本語",
  "lang.ko": "한국어",
  "lang.vi": "Tiếng Việt",

  "transcript.empty": "Subtitles of the current session will appear here, with time, original text and translation.",
  "history.empty": "Saved sessions will appear here. Saving history is a Pro feature and is off by default.",
  "glossary.empty": "Your glossary terms will appear here. The glossary is a Pro feature.",
  "upgrade.empty": "Pro plans and in-app payment will appear here.",

  "settings.group.general": "General",
  "settings.group.subtitles": "Subtitles",
  "settings.group.audio": "Audio",
  "settings.group.model": "Model",
  "settings.group.hotkeys": "Shortcuts",
  "settings.group.license": "License",
  "settings.group.privacy": "Privacy",
  "settings.subtitles.description": "Font size, number of lines, background opacity and original text.",
  "settings.audio.description": "Audio source and how quickly a sentence is closed after a pause.",
  "settings.model.description": "Model pack in use, disk space, download again or delete.",
  "settings.license.description": "License key, status and expiry date, renew or deactivate.",
  "settings.privacy.description": "Saving history, delete all data, delete models and data.",
  "settings.general.uiLanguage": "Interface language",
  "settings.general.launchAtLogin": "Launch at login",
  "settings.general.launchAtLogin.hint": "The app starts in the menu bar or system tray, without opening this window.",
  "settings.general.theme": "Appearance",
  "settings.general.updateChannel": "Update channel",
  "theme.system": "Same as system",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "channel.stable": "Stable",
  "channel.beta": "Beta",

  "hotkeys.toggleSession": "Start or stop translating",
  "hotkeys.toggleOverlay": "Show or hide subtitles",
  "hotkeys.toggleLock": "Lock or unlock subtitles",
  "hotkeys.change": "Change",
  "hotkeys.cancel": "Cancel",
  "hotkeys.press": "Press the new shortcut, or Esc to cancel",
  "hotkeys.failed": "Not registered: another app may be using it.",
  "hotkeys.hint": "Shortcuts work in every app. Use at least one of Ctrl, Alt, Shift or {super}.",

  "about.version": "Version {version}",
  "about.openLogs": "Open log folder",
  "about.logsHint": "Logs stay on this computer and never contain what was said. Send them to support only if you want to.",
  "about.licenses": "Open-source licenses",
  "about.licensesPending": "The list of open-source licenses will appear here.",
  "about.trademark": "Microsoft Teams, Zoom and Google Meet are mentioned only to describe compatibility. AI Translator is not affiliated with these companies.",

  "onboarding.step": "Step {n} of {total}",
  "onboarding.next": "Next",
  "onboarding.back": "Back",
  "onboarding.finish": "Start using AI Translator",
  "onboarding.language.title": "Choose the interface language",
  "onboarding.model.title": "Check this computer and choose a model pack",
  "onboarding.download.title": "Download the model",
  "onboarding.permission.title": "Allow system audio recording",
  "onboarding.languages.title": "Choose your languages",
  "onboarding.test.title": "Try it",
  "onboarding.privacy.title": "Your privacy",
  "onboarding.privacy.local": "Audio never leaves this computer: speech recognition and translation run entirely on your machine.",
  "onboarding.privacy.notify": "If the law or your company requires it, you are responsible for telling other participants that you use a translation tool.",
  "onboarding.tray.title": "AI Translator keeps running in the background",
  "onboarding.tray.macos": "The app stays in the menu bar. Closing this window only hides it; choose Quit from the menu bar icon to exit.",
  "onboarding.tray.windows": "The app stays in the system tray. Closing this window only hides it; choose Quit from the tray icon to exit.",
  "onboarding.tray.windowsPin": "Windows hides new tray icons behind the ^ arrow. Drag the icon onto the taskbar, or turn it on in Taskbar settings.",
  "onboarding.tray.openTaskbarSettings": "Open Taskbar settings",

  "overlay.waiting": "Subtitles will appear here",

  "notice.hotkeysFailed": "Some shortcuts could not be registered. Open Settings › Shortcuts to change them.",
  "notice.hotkeysFailedLater": "Some shortcuts could not be registered. You can change them in Settings › Shortcuts after these steps.",
  "notice.openSettings": "Open settings",
  "notice.quitFromTray": "AI Translator keeps running in the menu bar. To quit, choose Quit from the menu bar icon.",
  "notice.loginItemsApproval": "AI Translator is turned off in System Settings › General › Login Items, so it will not open when you log in. Turn it on there.",
  "notice.openLoginItems": "Open Login Items",

  "common.dismiss": "Dismiss",
  "common.notYet": "Not available yet.",

  "error.outOfRange": "This value is out of range.",
  "error.empty": "Choose at least one item.",
  "error.duplicate": "This value is used twice.",
  "error.tooLong": "This value is too long.",
  "error.invalidHotkey": "This shortcut is not valid.",
  "error.wrongType": "This value is not valid.",
  "error.unknownKey": "This setting does not exist.",
  "error.readOnly": "This setting cannot be changed here.",
  "error.notObject": "The change request is not valid.",
  "error.hotkeyInvalid": "This key combination is not supported.",
  "error.hotkeyNoModifier": "Use at least one of Ctrl, Alt, Shift or Cmd/Win.",
  "error.hotkeyDuplicate": "This shortcut is already used for another action.",
  "error.hotkeyRegisterFailed": "The system refused this shortcut; another app may be using it.",
  "error.autostartFailed": "Could not change launch at login.",
  "error.autostartStillEnabled": "Launch at login is still on: an entry for all users (HKEY_LOCAL_MACHINE) can only be removed with administrator rights.",
  "error.overlayFailed": "Could not change the subtitle bar.",
  "error.openFailed": "Could not open it.",
  "error.unsupported": "Not available on this system.",
  "error.unknown": "Something went wrong.",
} as const;

export type MessageKey = keyof typeof en;
```

- [ ] **Step 5: Tạo `src/i18n/vi.ts`**

```ts
import type { MessageKey } from "./en";

// Từ điển tiếng Việt. Kiểu `Record<MessageKey, string>` bắt đủ mọi khóa của en.ts (spec §4.5).
export const vi: Record<MessageKey, string> = {
  "app.name": "AI Translator",

  "nav.home": "Màn hình chính",
  "nav.transcript": "Bản chép lời",
  "nav.history": "Lịch sử",
  "nav.glossary": "Từ điển thuật ngữ",
  "nav.settings": "Cài đặt",
  "nav.upgrade": "Nâng cấp Pro",
  "nav.about": "Giới thiệu",

  "status.idle": "Sẵn sàng",
  "status.running": "Đang dịch",
  "status.error": "Lỗi",

  "home.start": "Bắt đầu",
  "home.stop": "Dừng",
  "home.languages": "Ngôn ngữ",
  "home.audioSource": "Nguồn âm thanh",
  "home.audioSource.system.macos": "Toàn hệ thống, trừ app này",
  "home.audioSource.system.windows": "Thiết bị phát mặc định (tự động)",
  "home.inputLevel": "Mức âm lượng vào",
  "home.minutesLeft": "Số phút miễn phí còn lại hôm nay",
  "home.overlay": "Thanh phụ đề",
  "home.overlay.show": "Hiện",
  "home.overlay.hide": "Ẩn",
  "home.overlay.lock": "Khóa (click xuyên qua)",
  "home.overlay.unlock": "Mở khóa",

  "languages.target": "Dịch sang",
  "languages.sources": "Ngôn ngữ nói trong cuộc họp",
  "languages.lock": "Ngôn ngữ nguồn",
  "languages.lock.auto": "Tự nhận diện",

  "lang.en": "English",
  "lang.zh": "中文",
  "lang.ja": "日本語",
  "lang.ko": "한국어",
  "lang.vi": "Tiếng Việt",

  "transcript.empty": "Phụ đề của phiên đang dịch sẽ hiện ở đây, gồm giờ, câu gốc và bản dịch.",
  "history.empty": "Các phiên đã lưu sẽ hiện ở đây. Lưu lịch sử là tính năng Pro và mặc định tắt.",
  "glossary.empty": "Các thuật ngữ của bạn sẽ hiện ở đây. Từ điển thuật ngữ là tính năng Pro.",
  "upgrade.empty": "Các gói Pro và thanh toán ngay trong app sẽ hiện ở đây.",

  "settings.group.general": "Chung",
  "settings.group.subtitles": "Phụ đề",
  "settings.group.audio": "Âm thanh",
  "settings.group.model": "Model",
  "settings.group.hotkeys": "Phím tắt",
  "settings.group.license": "Bản quyền",
  "settings.group.privacy": "Quyền riêng tư",
  "settings.subtitles.description": "Cỡ chữ, số dòng, độ mờ nền và câu gốc.",
  "settings.audio.description": "Nguồn âm thanh và độ nhạy ngắt câu.",
  "settings.model.description": "Gói model đang dùng, dung lượng, tải lại hoặc xóa.",
  "settings.license.description": "Key bản quyền, trạng thái và ngày hết hạn, gia hạn hoặc gỡ kích hoạt.",
  "settings.privacy.description": "Lưu lịch sử, xóa toàn bộ dữ liệu, xóa model và dữ liệu.",
  "settings.general.uiLanguage": "Ngôn ngữ giao diện",
  "settings.general.launchAtLogin": "Khởi động cùng hệ thống",
  "settings.general.launchAtLogin.hint": "App mở sẵn ở menu bar hoặc khay hệ thống, không mở cửa sổ này.",
  "settings.general.theme": "Giao diện",
  "settings.general.updateChannel": "Kênh cập nhật",
  "theme.system": "Theo hệ thống",
  "theme.light": "Sáng",
  "theme.dark": "Tối",
  "channel.stable": "Ổn định",
  "channel.beta": "Beta",

  "hotkeys.toggleSession": "Bắt đầu hoặc dừng dịch",
  "hotkeys.toggleOverlay": "Hiện hoặc ẩn phụ đề",
  "hotkeys.toggleLock": "Khóa hoặc mở khóa phụ đề",
  "hotkeys.change": "Đổi",
  "hotkeys.cancel": "Hủy",
  "hotkeys.press": "Bấm tổ hợp phím mới, hoặc Esc để hủy",
  "hotkeys.failed": "Chưa đăng ký được: có thể app khác đang dùng.",
  "hotkeys.hint": "Phím tắt dùng được ở mọi app. Hãy dùng ít nhất một phím Ctrl, Alt, Shift hoặc {super}.",

  "about.version": "Phiên bản {version}",
  "about.openLogs": "Mở thư mục log",
  "about.logsHint": "Log chỉ nằm trên máy này và không bao giờ chứa nội dung cuộc họp. Bạn tự gửi cho bộ phận hỗ trợ khi cần.",
  "about.licenses": "Giấy phép mã nguồn mở",
  "about.licensesPending": "Danh sách giấy phép mã nguồn mở sẽ hiện ở đây.",
  "about.trademark": "Microsoft Teams, Zoom và Google Meet chỉ được nhắc tới để mô tả khả năng tương thích. AI Translator không liên kết với các công ty này.",

  "onboarding.step": "Bước {n}/{total}",
  "onboarding.next": "Tiếp",
  "onboarding.back": "Quay lại",
  "onboarding.finish": "Bắt đầu dùng AI Translator",
  "onboarding.language.title": "Chọn ngôn ngữ giao diện",
  "onboarding.model.title": "Kiểm tra máy và chọn gói model",
  "onboarding.download.title": "Tải model",
  "onboarding.permission.title": "Cho phép ghi âm thanh hệ thống",
  "onboarding.languages.title": "Chọn ngôn ngữ",
  "onboarding.test.title": "Nghe thử",
  "onboarding.privacy.title": "Quyền riêng tư",
  "onboarding.privacy.local": "Âm thanh không rời khỏi máy: nhận dạng giọng nói và dịch đều chạy trên máy của bạn.",
  "onboarding.privacy.notify": "Nếu pháp luật hoặc quy định công ty yêu cầu, bạn tự chịu trách nhiệm thông báo cho người cùng họp là bạn dùng công cụ dịch.",
  "onboarding.tray.title": "AI Translator vẫn chạy khi bạn đóng cửa sổ",
  "onboarding.tray.macos": "App nằm ở menu bar. Đóng cửa sổ này chỉ ẩn nó đi; muốn thoát hẳn thì chọn Thoát ở icon trên menu bar.",
  "onboarding.tray.windows": "App nằm ở khay hệ thống. Đóng cửa sổ này chỉ ẩn nó đi; muốn thoát hẳn thì chọn Thoát ở icon trong khay.",
  "onboarding.tray.windowsPin": "Windows giấu icon mới vào mục mũi tên ^. Hãy kéo icon ra taskbar, hoặc bật icon trong cài đặt Taskbar.",
  "onboarding.tray.openTaskbarSettings": "Mở cài đặt Taskbar",

  "overlay.waiting": "Phụ đề sẽ hiện ở đây",

  "notice.hotkeysFailed": "Có phím tắt không đăng ký được. Mở Cài đặt › Phím tắt để đổi.",
  "notice.hotkeysFailedLater": "Có phím tắt không đăng ký được. Bạn đổi được ở Cài đặt › Phím tắt sau khi xong các bước này.",
  "notice.openSettings": "Mở cài đặt",
  "notice.quitFromTray": "AI Translator vẫn chạy ở menu bar. Muốn thoát, chọn Thoát ở biểu tượng trên menu bar.",
  "notice.loginItemsApproval": "AI Translator đang bị tắt ở System Settings › General › Login Items, nên sẽ không tự mở khi đăng nhập. Hãy bật lại ở đó.",
  "notice.openLoginItems": "Mở Login Items",

  "common.dismiss": "Đóng",
  "common.notYet": "Chưa có.",

  "error.outOfRange": "Giá trị nằm ngoài phạm vi cho phép.",
  "error.empty": "Hãy chọn ít nhất một mục.",
  "error.duplicate": "Giá trị bị trùng.",
  "error.tooLong": "Giá trị quá dài.",
  "error.invalidHotkey": "Phím tắt không hợp lệ.",
  "error.wrongType": "Giá trị không hợp lệ.",
  "error.unknownKey": "Không có cài đặt này.",
  "error.readOnly": "Không đổi được cài đặt này ở đây.",
  "error.notObject": "Yêu cầu thay đổi không hợp lệ.",
  "error.hotkeyInvalid": "Không dùng được tổ hợp phím này.",
  "error.hotkeyNoModifier": "Hãy dùng ít nhất một phím Ctrl, Alt, Shift hoặc Cmd/Win.",
  "error.hotkeyDuplicate": "Tổ hợp này đang dùng cho việc khác.",
  "error.hotkeyRegisterFailed": "Hệ thống không cho dùng tổ hợp này; có thể app khác đang giữ.",
  "error.autostartFailed": "Không đổi được chế độ khởi động cùng hệ thống.",
  "error.autostartStillEnabled": "Vẫn còn khởi động cùng hệ thống: có một mục cho mọi người dùng (HKEY_LOCAL_MACHINE), chỉ xóa được bằng quyền quản trị.",
  "error.overlayFailed": "Không đổi được thanh phụ đề.",
  "error.openFailed": "Không mở được.",
  "error.unsupported": "Không có trên hệ điều hành này.",
  "error.unknown": "Có lỗi xảy ra.",
};
```

- [ ] **Step 6: Tạo `src/i18n/index.ts`**

```ts
import { en, type MessageKey } from "./en";
import { vi } from "./vi";

export type { MessageKey };
export type UiLanguage = "en" | "vi";
export type Params = Record<string, string | number>;

const dictionaries: Record<UiLanguage, Record<MessageKey, string>> = { en, vi };

// Đổi ngôn ngữ có tác dụng ngay (§4.5): giao diện gọi hàm này mỗi lần vẽ, với ngôn ngữ đang chọn.
export function translate(lang: UiLanguage, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

// Ngôn ngữ giao diện trước khi đọc được cài đặt: tiếng Việt nếu locale đầu tiên là tiếng Việt,
// còn lại English (§4.1, bước 1). Sau đó phía Rust quyết định theo locale của hệ điều hành.
export function detectUiLanguage(locales: readonly string[]): UiLanguage {
  const primary = (locales[0] ?? "").split(/[-_]/)[0]?.toLowerCase();
  return primary === "vi" ? "vi" : "en";
}

// Khóa câu báo lỗi cho mã lỗi của phía Rust (`CommandError.code`); mã lạ thì dùng câu chung.
export function errorKey(code: string): MessageKey {
  const key = `error.${code}`;
  return key in en ? (key as MessageKey) : "error.unknown";
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();
}

export { en, vi };
```

- [ ] **Step 7: Chạy test và build**

Run: `pnpm test && pnpm build`
Expected: `Test Files  1 passed (1)`, `Tests  8 passed (8)`; `tsc` không lỗi và Vite in `✓ built in …`.

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts package.json src/i18n
git commit -m "feat(ui): từ điển giao diện en/vi có kiểu, test đủ khóa bằng Vitest (§4.5)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 15: Mã lỗi trả về giao diện (TDD)

**Files:**
- Create: `src-tauri/src/errors.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod errors;`)

Mọi lệnh `invoke` trả lỗi dạng `CommandError { code, field, message }`.
- `code` là mã lý do của cài đặt (`settings::Reason`), mã phím tắt, hoặc một trong năm mã khác (trong đó `autostartStillEnabled`, QĐ16).
- Giao diện dịch `code` thành câu báo lỗi `error.<code>`.
- Test đọc `src/i18n/en.ts`, để thêm mã mới mà quên câu báo lỗi thì test đỏ.

- [ ] **Step 1: Khai báo module.** Thêm `pub mod errors;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/errors.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Lỗi trả về giao diện qua lệnh `invoke`. `code` là khóa để giao diện chọn câu báo lỗi
//! (`error.<code>` trong `src/i18n/en.ts`); test bên dưới kiểm mọi mã đều có câu báo lỗi.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Reason;

    /// Mọi mã lỗi phía Rust có câu báo lỗi trong từ điển chuẩn của giao diện (`src/i18n/en.ts`).
    #[test]
    fn every_error_code_has_ui_text() {
        let en = include_str!("../../src/i18n/en.ts");
        let reasons = [
            Reason::OutOfRange,
            Reason::Empty,
            Reason::Duplicate,
            Reason::TooLong,
            Reason::InvalidHotkey,
            Reason::WrongType,
            Reason::UnknownKey,
            Reason::ReadOnly,
            Reason::NotObject,
        ];
        // Không dùng `_`: thêm biến thể mà quên liệt kê ở trên thì không biên dịch được.
        for reason in reasons {
            match reason {
                Reason::OutOfRange
                | Reason::Empty
                | Reason::Duplicate
                | Reason::TooLong
                | Reason::InvalidHotkey
                | Reason::WrongType
                | Reason::UnknownKey
                | Reason::ReadOnly
                | Reason::NotObject => {}
            }
        }
        let mut codes: Vec<String> = reasons
            .iter()
            .map(|r| CommandError::from(Invalid::new("x", *r)).code)
            .collect();
        for error in [
            HotkeyError::Invalid,
            HotkeyError::NoModifier,
            HotkeyError::Duplicate,
            HotkeyError::RegisterFailed,
        ] {
            match error {
                HotkeyError::Invalid
                | HotkeyError::NoModifier
                | HotkeyError::Duplicate
                | HotkeyError::RegisterFailed => {}
            }
            codes.push(CommandError::hotkey(HotkeyAction::ToggleLock, error).code);
        }
        codes.extend(
            [
                AUTOSTART_FAILED,
                AUTOSTART_STILL_ENABLED,
                OVERLAY_FAILED,
                OPEN_FAILED,
                UNSUPPORTED,
            ]
            .map(String::from),
        );
        for code in codes {
            assert!(
                en.contains(&format!("\"error.{code}\":")),
                "src/i18n/en.ts thiếu error.{code}"
            );
        }
    }

    #[test]
    fn invalid_setting_maps_to_reason_code_and_field() {
        let e = CommandError::from(Invalid::new("overlay.lines", Reason::OutOfRange));
        assert_eq!(
            (e.code.as_str(), e.field.as_deref()),
            ("outOfRange", Some("overlay.lines"))
        );
        let e = CommandError::hotkey(HotkeyAction::ToggleOverlay, HotkeyError::Duplicate);
        assert_eq!(
            (e.code.as_str(), e.field.as_deref()),
            ("hotkeyDuplicate", Some("toggleOverlay"))
        );
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib errors::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0433]: cannot find type `Invalid` in this scope
error[E0433]: cannot find type `HotkeyError` in this scope
error[E0433]: cannot find type `HotkeyAction` in this scope
error[E0425]: cannot find value `AUTOSTART_FAILED` in this scope
error[E0425]: cannot find value `AUTOSTART_STILL_ENABLED` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use serde::Serialize;

use crate::hotkeys::{HotkeyAction, HotkeyError};
use crate::settings::Invalid;

/// Lỗi trả về giao diện. `code` là khóa để giao diện chọn câu báo lỗi (`error.<code>` trong i18n).
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: String,
    pub field: Option<String>,
    /// Chi tiết cho log và cho người hỗ trợ; không hiện nguyên văn trên giao diện.
    pub message: String,
}

/// Mã lỗi ngoài lỗi cài đặt (`settings::Reason`) và lỗi phím tắt (`CommandError::hotkey`).
pub const AUTOSTART_FAILED: &str = "autostartFailed";
/// Windows: tắt rồi mà vẫn còn mục khởi động ở `HKLM`, app không có quyền xóa (QĐ16).
pub const AUTOSTART_STILL_ENABLED: &str = "autostartStillEnabled";
pub const OVERLAY_FAILED: &str = "overlayFailed";
pub const OPEN_FAILED: &str = "openFailed";
pub const UNSUPPORTED: &str = "unsupported";

impl CommandError {
    pub fn new(code: &str, field: Option<&str>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            field: field.map(Into::into),
            message: message.into(),
        }
    }

    pub fn hotkey(action: HotkeyAction, error: HotkeyError) -> Self {
        let code = match error {
            HotkeyError::Invalid => "hotkeyInvalid",
            HotkeyError::NoModifier => "hotkeyNoModifier",
            HotkeyError::Duplicate => "hotkeyDuplicate",
            HotkeyError::RegisterFailed => "hotkeyRegisterFailed",
        };
        Self::new(code, Some(action.key()), error.to_string())
    }
}

impl From<Invalid> for CommandError {
    fn from(e: Invalid) -> Self {
        let code = serde_json::to_value(e.reason)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        Self {
            code,
            field: Some(e.field.clone()),
            message: e.to_string(),
        }
    }
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib errors::`
Expected:
```text
test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 75 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/errors.rs src-tauri/src/lib.rs
git commit -m "feat(app): mã lỗi trả về giao diện, test mọi mã đều có câu báo lỗi trong en.ts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 16: Nội dung menu khay (TDD)

**Files:**
- Create: `src-tauri/src/tray_menu.rs`
- Modify: `src-tauri/src/lib.rs` (thêm `pub mod tray_menu;`)

Các dòng của menu khay theo trạng thái (đang dịch, thanh phụ đề đang hiện, đang khóa, có phím tắt lỗi) và ngôn ngữ giao diện. Phần dựng menu thật của Tauri ở `tray.rs` (Task 17).

- [ ] **Step 1: Khai báo module.** Thêm `pub mod tray_menu;` vào khối `pub mod` ở đầu `src-tauri/src/lib.rs`.

- [ ] **Step 2: Viết test trước.** Tạo `src-tauri/src/tray_menu.rs`, tạm thời chỉ có phần chú thích đầu file và test:

```rust
//! Nội dung menu khay (F10, spec §4.2, §4.3): các dòng và chữ theo trạng thái và ngôn ngữ giao diện.
//! Phần dựng menu thật của Tauri ở `tray.rs`.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n;

    fn texts(lines: &[Option<(TrayItem, &'static str)>]) -> Vec<&'static str> {
        lines.iter().map(|l| l.map_or("---", |(_, text)| text)).collect()
    }

    #[test]
    fn idle_menu_in_vietnamese() {
        let model = TrayModel {
            running: false,
            overlay_visible: true,
            locked: false,
            hotkeys_failed: false,
        };
        assert_eq!(
            texts(&menu_lines(&i18n::VI, model)),
            [
                "Bắt đầu dịch",
                "Ẩn phụ đề",
                "Khóa phụ đề (click xuyên qua)",
                "---",
                "Mở cửa sổ chính",
                "---",
                "Thoát"
            ]
        );
    }

    #[test]
    fn labels_follow_state_in_english() {
        let model = TrayModel {
            running: true,
            overlay_visible: false,
            locked: true,
            hotkeys_failed: true,
        };
        assert_eq!(
            texts(&menu_lines(&i18n::EN, model)),
            [
                "Some shortcuts could not be registered",
                "---",
                "Stop translating",
                "Show subtitles",
                "Unlock subtitles",
                "---",
                "Open main window",
                "---",
                "Quit"
            ]
        );
    }

    #[test]
    fn item_ids_roundtrip() {
        for item in TrayItem::ALL {
            assert_eq!(TrayItem::from_id(item.id()), Some(item));
        }
        assert_eq!(TrayItem::from_id("khac"), None);
    }
}
```

- [ ] **Step 3: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib tray_menu::`
Expected: FAIL, biên dịch lỗi:
```text
error[E0425]: cannot find type `TrayItem` in this scope
error[E0422]: cannot find struct, variant or union type `TrayModel` in this scope
error[E0425]: cannot find function `menu_lines` in this scope
error[E0433]: cannot find type `TrayItem` in this scope
```

- [ ] **Step 4: Viết code.** Chèn đoạn sau ngay dưới các dòng `//!`, trên `#[cfg(test)]`:

```rust
use crate::i18n::Strings;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayItem {
    HotkeyWarning,
    Session,
    Overlay,
    Lock,
    OpenMain,
    Quit,
}

impl TrayItem {
    pub const ALL: [TrayItem; 6] = [
        Self::HotkeyWarning,
        Self::Session,
        Self::Overlay,
        Self::Lock,
        Self::OpenMain,
        Self::Quit,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::HotkeyWarning => "hotkey-warning",
            Self::Session => "session",
            Self::Overlay => "overlay-visible",
            Self::Lock => "overlay-lock",
            Self::OpenMain => "open-main",
            Self::Quit => "quit",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|item| item.id() == id)
    }
}

/// Những gì menu khay cần biết.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrayModel {
    pub running: bool,
    pub overlay_visible: bool,
    pub locked: bool,
    pub hotkeys_failed: bool,
}

/// Các dòng của menu theo thứ tự; `None` là đường kẻ ngang.
pub fn menu_lines(strings: &Strings, model: TrayModel) -> Vec<Option<(TrayItem, &'static str)>> {
    let mut lines = Vec::new();
    if model.hotkeys_failed {
        lines.push(Some((TrayItem::HotkeyWarning, strings.tray_hotkey_failed)));
        lines.push(None);
    }
    lines.push(Some((
        TrayItem::Session,
        if model.running {
            strings.tray_stop
        } else {
            strings.tray_start
        },
    )));
    let overlay = if model.overlay_visible {
        strings.tray_hide_overlay
    } else {
        strings.tray_show_overlay
    };
    lines.push(Some((TrayItem::Overlay, overlay)));
    let lock = if model.locked {
        strings.tray_unlock_overlay
    } else {
        strings.tray_lock_overlay
    };
    lines.push(Some((TrayItem::Lock, lock)));
    lines.push(None);
    lines.push(Some((TrayItem::OpenMain, strings.tray_open_main)));
    lines.push(None);
    lines.push(Some((TrayItem::Quit, strings.tray_quit)));
    lines
}
```

- [ ] **Step 5: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator --lib tray_menu::`
Expected:
```text
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 77 filtered out; finished in 0.00s
```

- [ ] **Step 6: clippy và định dạng**

Run: `cargo clippy -p meeting-translator --all-targets -- -D warnings && cargo fmt --all -- --check`
Expected: không lỗi, không cảnh báo.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/tray_menu.rs src-tauri/src/lib.rs
git commit -m "feat(app): nội dung menu khay theo trạng thái và ngôn ngữ giao diện" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 17: Nối vào app: trạng thái, lệnh, quyền từng cửa sổ, khay, cửa sổ, thanh phụ đề (TDD)

**Files:**
- Create (trong `src-tauri/src/`): `test_support.rs`, `acl_tests.rs`, `app_tests.rs`, `state.rs`, `events.rs`, `commands.rs`, `actions.rs`, `hotkey_registry.rs`, `tray.rs`, `window.rs`, `session_stub.rs`, `logging.rs`
- Create: `src-tauri/src/overlay/macos.rs`, `src-tauri/src/overlay/windows.rs`, `scripts/make_tray_icon.py`, `src-tauri/icons/tray-template.png` (script sinh ra)
- Modify (thay toàn bộ): `src-tauri/src/lib.rs`, `src-tauri/src/overlay/mod.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/capabilities/overlay.json`, `src-tauri/tauri.conf.json`

Task này thay code spike S5 trong `lib.rs` bằng khung app thật.
- Cách tạo thanh phụ đề của S5 giữ nguyên, chuyển sang `overlay/macos.rs` và `overlay/windows.rs`. Thêm:
  - ẩn lúc khởi động (QĐ21);
  - từ chối cửa sổ mới (QĐ22);
  - trên Windows, ẩn/hiện và khóa làm hẳn bằng Win32, hiện mà không lấy focus (QĐ23);
  - ẩn/hiện và khóa đi qua trait `overlay::Surface`, để test dùng bản giả (QĐ27).
- `setup` cài `SystemOpener` thật (`system::install`, Task 11) trước khi tạo cửa sổ; mọi lệnh mở ra ngoài app đi qua nó. App giả của test dùng bản giả (QĐ28).
- Cửa sổ chính tạo bằng code (`window::create_main`), để gắn được `on_new_window`.
- Các file phụ thuộc lẫn nhau (`actions.rs` gọi khay, thanh phụ đề, phím tắt; các nơi đó lại gọi `actions.rs`), nên chỉ build được khi đủ file. Test viết trước ở Step 1.

Lệnh và sự kiện:

| Lệnh | Cửa sổ | Việc |
|---|---|---|
| `get_settings` | main | đọc cài đặt |
| `update_settings { patch }` | main | sửa một phần cài đặt (Task 6); đổi `launchAtLogin` thì bật/tắt khởi động cùng hệ thống; bật mà Login Items báo cần cho phép thì gửi lời nhắc; tắt mà vẫn còn bật thì trả lỗi `autostartStillEnabled` (QĐ16) |
| `set_hotkey { action, accelerator }` | main | đổi phím tắt, đăng ký lại với hệ điều hành (Task 3) |
| `get_app_status`, `toggle_session` | main | trạng thái; bắt đầu/dừng phiên tạm, bắt đầu thì hiện thanh phụ đề (`toggle_session` trả `Result`, QĐ25) |
| `set_overlay_visible { visible }`, `set_overlay_locked { locked }` | main | ẩn/hiện, khóa thanh phụ đề |
| `get_app_info` | main | tên, phiên bản, identifier, hệ điều hành, có mở lúc đăng nhập không |
| `open_log_dir`, `open_taskbar_settings` | main | mở thư mục log (Đ10); mở `ms-settings:taskbar` (Windows) |
| `open_login_items_settings` | main | mở System Settings › General › Login Items (macOS), từ nút ở lời nhắc (QĐ16) |
| `get_overlay_view` | overlay | phần cài đặt của thanh phụ đề, chỉ đọc |

| Sự kiện | Gửi tới | Nội dung |
|---|---|---|
| `settings://changed` | main | toàn bộ cài đặt |
| `app://status` | main | `{ session, overlayVisible, hotkeyFailures }` |
| `app://navigate` | main | màn hình cần mở (từ dòng báo lỗi ở menu khay) |
| `app://notice` | main | lời nhắc trong app: `{ kind: "quitFromTray" }` hoặc `{ kind: "loginItemsApproval" }` (QĐ12, QĐ16) |
| `overlay://view` | overlay | như `get_overlay_view` |
| `subtitle://upsert` | cả hai | phụ đề (§6.6); ở kế hoạch này chỉ có phụ đề mẫu của phiên tạm |

- [ ] **Step 1: Viết test trước.** Tạo `src-tauri/src/test_support.rs` (app giả, kèm các bản giả `FakeSurface` của thanh phụ đề, `FakeSystem` của `SystemOpener`, `FakeLoginItem` của khởi động cùng hệ thống, `FakeSettingsFile` của file cài đặt):

```rust
//! Dụng cụ cho các test chạy app bằng `MockRuntime`: đúng `tauri.conf.json`, `capabilities/` và app
//! manifest của `build.rs`, nhưng không mở cửa sổ thật.

use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

use crate::commands;
use crate::login_item::{AgentStatus, LoginItem, LoginItems};
use crate::overlay::{OverlaySurface, Surface};
use crate::settings::migrate::FileMeta;
use crate::settings::persist::{SettingsFile, Writer};
use crate::settings::{Settings, UiLanguage};
use crate::state::AppState;
use crate::system::{System, SystemOpener};

/// Bản giả của thanh phụ đề: ghi lại từng lần gọi, dạng `show`, `hide`, `click_through on`.
#[derive(Clone, Default)]
pub struct FakeSurface(Arc<Mutex<Vec<String>>>);

impl Surface for FakeSurface {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        self.0
            .lock()
            .unwrap()
            .push(if visible { "show" } else { "hide" }.into());
        Ok(())
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        self.0
            .lock()
            .unwrap()
            .push(if on { "click_through on" } else { "click_through off" }.into());
        Ok(())
    }
}

/// Bản giả của `SystemOpener`: ghi lại từng lần gọi, không mở gì (QĐ28). Mọi test chạy app giả đều dùng
/// bản này, nên kể cả khi ACL lỡ cấp thừa, lệnh tới handler cũng không mở Finder hay System Settings.
#[derive(Clone, Default)]
pub struct FakeSystem(Arc<Mutex<Vec<String>>>);

impl FakeSystem {
    fn push(&self, call: String) -> Result<(), String> {
        self.0.lock().unwrap().push(call);
        Ok(())
    }
}

impl SystemOpener for FakeSystem {
    fn open_log_dir(&self) -> Result<(), String> {
        self.push("open_log_dir".into())
    }
    fn open_taskbar_settings(&self) -> Result<(), String> {
        self.push("open_taskbar_settings".into())
    }
    fn open_login_items_settings(&self) -> Result<(), String> {
        self.push("open_login_items_settings".into())
    }
    fn open_external_url(&self, url: &str) -> Result<(), String> {
        self.push(format!("open_external_url {url}"))
    }
}

/// Trạng thái của bản giả `FakeLoginItem`.
#[derive(Default)]
pub struct FakeLogin {
    pub registered: bool,
    /// Windows: `disable()` không xóa được mục ở `HKLM` (không có quyền admin), nên vẫn còn bật.
    pub stuck_on: bool,
    pub status: Option<AgentStatus>,
}

/// Bản giả của `LoginItem`: không đụng LaunchAgent, Login Items hay registry thật.
#[derive(Clone, Default)]
pub struct FakeLoginItem(pub Arc<Mutex<FakeLogin>>);

impl LoginItem for FakeLoginItem {
    fn enable(&self) -> Result<(), String> {
        self.0.lock().unwrap().registered = true;
        Ok(())
    }
    fn disable(&self) -> Result<(), String> {
        let mut state = self.0.lock().unwrap();
        state.registered = state.stuck_on;
        Ok(())
    }
    fn is_registered(&self) -> Result<bool, String> {
        Ok(self.0.lock().unwrap().registered)
    }
    fn system_status(&self) -> Option<AgentStatus> {
        self.0.lock().unwrap().status
    }
}

/// Các mục của một lần ghi file cài đặt.
type Entries = Vec<(String, Value)>;

/// Bản giả của `SettingsFile`: giữ lại các lần ghi, không đụng thư mục cài đặt thật.
#[derive(Clone, Default)]
pub struct FakeSettingsFile(Arc<Mutex<Vec<Entries>>>);

impl SettingsFile for FakeSettingsFile {
    fn write(&self, entries: Vec<(String, Value)>) -> Result<(), String> {
        self.0.lock().unwrap().push(entries);
        Ok(())
    }
}

pub fn mock_app() -> tauri::App<MockRuntime> {
    let builder = mock_builder();
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    let surface = FakeSurface::default();
    let system = FakeSystem::default();
    let login = FakeLoginItem::default();
    let file = FakeSettingsFile::default();
    builder
        .manage(AppState::new(
            Settings::defaults(UiLanguage::Vi),
            FileMeta::current(),
            false,
        ))
        .manage(OverlaySurface(Box::new(surface.clone())))
        .manage(surface)
        .manage(System(Box::new(system.clone())))
        .manage(system)
        .manage(LoginItems(Box::new(login.clone())))
        .manage(login)
        .manage(Writer(Box::new(file.clone())))
        .manage(file)
        .invoke_handler(commands::handler())
        .build(tauri::generate_context!(test = true))
        .expect("dựng được app giả")
}

/// Giá trị của `key` ở lần ghi file cài đặt gần nhất có khóa đó.
pub fn last_saved(app: &tauri::App<MockRuntime>, key: &str) -> Option<Value> {
    let writes = app.state::<FakeSettingsFile>().0.lock().unwrap().clone();
    writes
        .iter()
        .rev()
        .find_map(|entries| entries.iter().find(|(k, _)| k == key).map(|(_, v)| v.clone()))
}

/// Đổi trạng thái của bản giả `FakeLoginItem` trong app giả.
pub fn login_state(app: &tauri::App<MockRuntime>, change: impl FnOnce(&mut FakeLogin)) {
    change(&mut app.state::<FakeLoginItem>().0.lock().unwrap());
}

/// Các lần gọi tới `SystemOpener` từ lúc dựng app giả.
pub fn system_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeSystem>().0.lock().unwrap().clone()
}

/// Các lần gọi tới thanh phụ đề từ lúc dựng app giả.
pub fn overlay_calls(app: &tauri::App<MockRuntime>) -> Vec<String> {
    app.state::<FakeSurface>().0.lock().unwrap().clone()
}

pub fn window(app: &tauri::App<MockRuntime>, label: &str) -> WebviewWindow<MockRuntime> {
    app.get_webview_window(label).unwrap_or_else(|| {
        WebviewWindowBuilder::new(app, label, Default::default())
            .build()
            .expect("tạo được cửa sổ giả")
    })
}

/// Gọi một lệnh như giao diện gọi `invoke(cmd, args)` từ cửa sổ `window`.
pub fn invoke(window: &WebviewWindow<MockRuntime>, cmd: &str, args: Value) -> Result<Value, String> {
    let request = InvokeRequest {
        cmd: cmd.into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "tauri://localhost".parse().unwrap(),
        body: InvokeBody::Json(args),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(window, request)
        .map(|body| body.deserialize::<Value>().unwrap())
        .map_err(|e| e.to_string())
}

/// Lệnh bị ACL chặn (chưa tới handler).
pub fn denied(result: &Result<Value, String>) -> bool {
    matches!(result, Err(message) if message.contains("not allowed"))
}
```

Tạo `src-tauri/src/acl_tests.rs` (QĐ5, QĐ28):

```rust
//! Test quyền của từng cửa sổ (spec §10.2, §11 "cửa sổ overlay gọi một lệnh không được cấp thì Tauri
//! chặn lại"). Hai lớp kiểm:
//! 1. Tĩnh: danh sách quyền trong `capabilities/` khớp đúng một danh sách cố định; mỗi file chỉ có các
//!    khóa đã biết (không có `remote`, `platforms`, `local`…), gắn đúng một cửa sổ; thư mục chỉ có hai
//!    file; `tauri.conf.json` không khai capability riêng.
//! 2. Lúc chạy: app chạy bằng `MockRuntime` với ACL thật của app; lệnh không được cấp thì bị chặn.
//! 3. Lệnh có tác dụng ra ngoài app chỉ tới bản giả của `SystemOpener` (QĐ28): bị chặn thì bản giả
//!    không ghi nhận gì, được phép thì ghi nhận đúng lời gọi.
//!
//! Kế hoạch sau thêm quyền (ví dụ 03 cấp `core:window:allow-start-resize-dragging` cho overlay) thì sửa
//! danh sách cố định ở đây trong cùng commit.

use serde_json::{Value, json};

use crate::commands::{MAIN_COMMANDS, OVERLAY_COMMANDS};
use crate::test_support::{denied, invoke, mock_app, system_calls, window};

/// Quyền không phải lệnh của app, theo từng cửa sổ.
const MAIN_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:webview:allow-set-webview-zoom",
];
const OVERLAY_CORE_PERMISSIONS: &[&str] = &[
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging",
];

/// Lệnh của Tauri và plugin mà không cửa sổ nào được gọi.
const FORBIDDEN: &[&str] = &[
    "plugin:window|set_position",
    "plugin:window|close",
    "plugin:webview|create_webview_window",
    "plugin:store|get",
    "plugin:store|set",
    "plugin:autostart|enable",
    "plugin:autostart|disable",
    "plugin:opener|open_url",
    "plugin:opener|open_path",
    "plugin:log|log",
    "plugin:event|emit",
    "plugin:global-shortcut|register",
];

/// Lệnh của app có tác dụng ra ngoài app (mở Finder, System Settings, Settings của Windows).
const OPENER_COMMANDS: &[&str] = &["open_log_dir", "open_taskbar_settings", "open_login_items_settings"];

fn allow(cmd: &str) -> String {
    format!("allow-{}", cmd.replace('_', "-"))
}

fn expected(commands: &[&str], core: &[&str]) -> Vec<String> {
    let mut all: Vec<String> = commands
        .iter()
        .map(|c| allow(c))
        .chain(core.iter().map(|p| p.to_string()))
        .collect();
    all.sort();
    all
}

/// Khóa được phép trong một file capability. `remote` (cho trang web ngoài gọi lệnh), `platforms`,
/// `local` hay khóa lạ đều làm test đỏ.
const CAPABILITY_KEYS: &[&str] = &["$schema", "description", "identifier", "permissions", "windows"];

fn permissions(file: &str, label: &str) -> Vec<String> {
    let cap: Value = serde_json::from_str(file).unwrap();
    let mut keys: Vec<&str> = cap.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort();
    assert_eq!(keys, CAPABILITY_KEYS, "capability {label} chỉ có các khóa đã biết");
    assert_eq!(cap["identifier"], label);
    assert_eq!(
        cap["windows"],
        json!([label]),
        "capability {label} chỉ gắn cửa sổ {label}"
    );
    let mut all: Vec<String> = cap["permissions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p.as_str().unwrap().to_string())
        .collect();
    all.sort();
    all
}

#[test]
fn capabilities_grant_exactly_the_fixed_lists() {
    assert_eq!(
        permissions(include_str!("../capabilities/main.json"), "main"),
        expected(MAIN_COMMANDS, MAIN_CORE_PERMISSIONS)
    );
    assert_eq!(
        permissions(include_str!("../capabilities/overlay.json"), "overlay"),
        expected(OVERLAY_COMMANDS, OVERLAY_CORE_PERMISSIONS),
        "overlay chỉ đọc phần cài đặt của nó, nghe sự kiện và kéo cửa sổ của chính nó"
    );
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities");
    let mut files: Vec<String> = std::fs::read_dir(dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    files.sort();
    assert_eq!(files, ["main.json", "overlay.json"], "không có capability nào khác");
    let conf: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    assert!(
        conf["app"]["security"].get("capabilities").is_none(),
        "không khai capability trong tauri.conf.json"
    );
    let build_rs = include_str!("../build.rs");
    for cmd in MAIN_COMMANDS.iter().chain(OVERLAY_COMMANDS) {
        assert!(build_rs.contains(&format!("\"{cmd}\"")), "build.rs thiếu {cmd}");
    }
}

#[test]
fn each_window_only_reaches_its_own_commands() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");

    let settings = invoke(&main, "get_settings", json!({})).expect("main đọc được cài đặt");
    assert_eq!(settings["uiLanguage"], "vi");
    let view = invoke(&overlay, "get_overlay_view", json!({})).expect("overlay đọc được phần của nó");
    assert_eq!(view["lines"], 2);
    assert!(view.get("hotkeys").is_none(), "overlay không thấy cài đặt khác");
    let zoom = invoke(&main, "plugin:webview|set_webview_zoom", json!({ "value": 1.2 }));
    assert!(!denied(&zoom), "main phóng to được chữ: {zoom:?}");

    for cmd in MAIN_COMMANDS {
        let result = invoke(&overlay, cmd, json!({}));
        assert!(denied(&result), "overlay không được gọi {cmd}: {result:?}");
    }
    for cmd in OVERLAY_COMMANDS {
        let result = invoke(&main, cmd, json!({}));
        assert!(denied(&result), "main không cần gọi {cmd}: {result:?}");
    }
    assert!(denied(&invoke(
        &overlay,
        "plugin:webview|set_webview_zoom",
        json!({ "value": 1.2 })
    )));
    // Không cửa sổ nào tự đọc ghi file cài đặt, bật tắt khởi động cùng hệ thống, mở URL hay đường dẫn,
    // tạo cửa sổ, di chuyển cửa sổ, phát sự kiện, hay đăng ký phím tắt.
    for cmd in FORBIDDEN {
        for window in [&main, &overlay] {
            let result = invoke(window, cmd, json!({}));
            assert!(denied(&result), "{} không được gọi {cmd}: {result:?}", window.label());
        }
    }
    // Cửa sổ lạ (ví dụ trang ngoài mở trong webview mới) không có quyền nào.
    let stranger = window(&app, "stranger");
    assert!(denied(&invoke(&stranger, "get_settings", json!({}))));
}

#[test]
fn outside_effects_only_reach_the_fake_opener() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    for cmd in OPENER_COMMANDS {
        let result = invoke(&overlay, cmd, json!({}));
        assert!(denied(&result), "overlay không được gọi {cmd}: {result:?}");
    }
    assert!(system_calls(&app).is_empty(), "lệnh bị chặn không tới SystemOpener");
    for cmd in OPENER_COMMANDS {
        let _ = invoke(&main, cmd, json!({}));
    }
    // Lệnh không có trên hệ điều hành này trả `unsupported` trước khi tới SystemOpener.
    let expected: &[&str] = if cfg!(target_os = "macos") {
        &["open_log_dir", "open_login_items_settings"]
    } else {
        &["open_log_dir", "open_taskbar_settings"]
    };
    assert_eq!(system_calls(&app), expected);
}
```

Tạo `src-tauri/src/app_tests.rs` (QĐ27):

```rust
//! Test hành vi của app qua lệnh `invoke`, chạy bằng `MockRuntime` (không mở cửa sổ thật).

use std::sync::{Arc, Mutex};

use serde_json::json;
use tauri::Listener;

use crate::actions;
use crate::events::NOTICE;
use crate::login_item::AgentStatus;
use crate::test_support::{invoke, last_saved, login_state, mock_app, overlay_calls, window};

#[test]
fn overlay_starts_hidden_and_appears_when_a_session_starts() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "get_app_status", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(false))
    );
    assert!(overlay_calls(&app).is_empty());
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("running"), Some(true))
    );
    assert_eq!(overlay_calls(&app), ["show"], "bắt đầu phiên thì hiện thanh phụ đề");
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        (status["session"].as_str(), status["overlayVisible"].as_bool()),
        (Some("idle"), Some(true)),
        "dừng phiên thì thanh phụ đề giữ nguyên"
    );
    assert_eq!(overlay_calls(&app), ["show"]);
}

#[test]
fn hide_show_and_lock_reach_the_overlay_window() {
    let app = mock_app();
    let main = window(&app, "main");
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": true })).unwrap();
    assert_eq!(status["overlayVisible"], true);
    let status = invoke(&main, "set_overlay_visible", json!({ "visible": false })).unwrap();
    assert_eq!(status["overlayVisible"], false);
    let settings = invoke(&main, "set_overlay_locked", json!({ "locked": true })).unwrap();
    assert_eq!(settings["overlay"]["locked"], true);
    assert_eq!(
        last_saved(&app, "overlay").unwrap()["locked"],
        true,
        "khóa được ghi vào file"
    );
    invoke(&main, "set_overlay_locked", json!({ "locked": false })).unwrap();
    assert_eq!(
        overlay_calls(&app),
        ["show", "hide", "click_through on", "click_through off"],
        "khóa và mở khóa không tự hiện hay ẩn thanh phụ đề"
    );
}

#[test]
fn blocked_quit_shows_a_notice_in_the_main_window() {
    let app = mock_app();
    let _main = window(&app, "main");
    let received = notices(&app);
    actions::quit_blocked(app.handle());
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"quitFromTray"}"#]);
}

fn notices(app: &tauri::App<tauri::test::MockRuntime>) -> Arc<Mutex<Vec<String>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    app.listen_any(NOTICE, move |event| {
        sink.lock().unwrap().push(event.payload().to_string())
    });
    received
}

#[test]
fn enabling_launch_at_login_blocked_in_login_items_shows_a_notice() {
    let app = mock_app();
    let main = window(&app, "main");
    let received = notices(&app);
    login_state(&app, |s| s.status = Some(AgentStatus::RequiresApproval));
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert_eq!(*received.lock().unwrap(), [r#"{"kind":"loginItemsApproval"}"#]);
}

#[test]
fn turning_off_launch_at_login_works_and_reports_when_it_stays_on() {
    let app = mock_app();
    let main = window(&app, "main");
    let registered = |app: &tauri::App<tauri::test::MockRuntime>| {
        let mut value = false;
        login_state(app, |s| value = s.registered);
        value
    };
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    assert_eq!(settings["launchAtLogin"], true);
    assert!(registered(&app), "bật thì gọi `enable()`");
    let settings = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap();
    assert_eq!(settings["launchAtLogin"], false);
    assert!(!registered(&app), "tắt bình thường thì hết đăng ký");
    invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": true } })).unwrap();
    // Windows: mục ở `HKLM` không xóa được khi không có quyền admin.
    login_state(&app, |s| s.stuck_on = true);
    let error = invoke(&main, "update_settings", json!({ "patch": { "launchAtLogin": false } })).unwrap_err();
    assert!(error.contains("autostartStillEnabled"), "{error}");
    let settings = invoke(&main, "get_settings", json!({})).unwrap();
    assert_eq!(settings["launchAtLogin"], true, "cài đặt giữ đúng trạng thái thật");
}

#[test]
fn startup_follows_the_system_when_login_items_turned_it_off() {
    let app = mock_app();
    login_state(&app, |s| {
        s.registered = true;
        s.status = Some(AgentStatus::RequiresApproval);
    });
    let mut settings = crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi);
    settings.launch_at_login = true;
    assert!(actions::sync_launch_at_login(app.handle(), &mut settings));
    assert!(!settings.launch_at_login);
}
```

Thêm vào đầu khối `pub mod` của `src-tauri/src/lib.rs` (vẫn là code S5), cách khối `pub mod` một dòng trống:

```rust
#[cfg(test)]
mod acl_tests;
#[cfg(test)]
mod app_tests;
#[cfg(test)]
mod test_support;
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cargo test -p meeting-translator --lib`
Expected: FAIL:
```text
error[E0432]: unresolved imports `crate::overlay::OverlaySurface`, `crate::overlay::Surface`
error[E0432]: unresolved import `crate::commands`
error[E0432]: unresolved import `crate::actions`
error[E0432]: unresolved import `crate::events`
error[E0432]: unresolved import `crate::state`
```

- [ ] **Step 3: Tạo `src-tauri/src/state.rs`** (QĐ21: thanh phụ đề ẩn lúc đầu)

```rust
//! Trạng thái dùng chung của app, quản lý bằng `tauri::Manager::manage`.

use std::sync::Mutex;

use serde::Serialize;

use crate::hotkeys::HotkeyAction;
use crate::settings::migrate::FileMeta;
use crate::settings::{Settings, UiLanguage};

/// Trạng thái phiên dịch. Kế hoạch 02 thêm trạng thái (đang nạp model, lỗi…) khi nối pipeline.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionStatus {
    Idle,
    Running,
}

/// Trạng thái lúc chạy, không lưu xuống đĩa. Cửa sổ chính nhận qua sự kiện `app://status`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub session: SessionStatus,
    pub overlay_visible: bool,
    /// Phím tắt không đăng ký được với hệ điều hành, theo thứ tự của `HotkeyAction::ALL`.
    pub hotkey_failures: Vec<HotkeyAction>,
}

/// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayView {
    pub ui_language: UiLanguage,
    pub font_size: u32,
    pub lines: u32,
    pub opacity: f64,
    pub show_source: bool,
    pub locked: bool,
}

impl OverlayView {
    pub fn from_settings(settings: &Settings) -> Self {
        let o = &settings.overlay;
        Self {
            ui_language: settings.ui_language,
            font_size: o.font_size,
            lines: o.lines,
            opacity: o.opacity,
            show_source: o.show_source,
            locked: o.locked,
        }
    }
}

/// Thông tin cho màn hình Giới thiệu và các bước chỉ có trên một hệ điều hành.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub identifier: String,
    /// `macos` hoặc `windows`.
    pub platform: &'static str,
    /// App được hệ điều hành mở lúc đăng nhập (Đ19): chỉ nằm ở khay, chưa chạy tiến trình phụ.
    pub launched_at_login: bool,
}

pub struct AppState {
    settings: Mutex<Settings>,
    /// Thông tin về file cài đặt lúc đọc (phiên bản schema, giá trị thô của bản mới hơn).
    file_meta: FileMeta,
    status: Mutex<AppStatus>,
    launched_at_login: bool,
}

impl AppState {
    pub fn new(settings: Settings, file_meta: FileMeta, launched_at_login: bool) -> Self {
        Self {
            settings: Mutex::new(settings),
            file_meta,
            status: Mutex::new(AppStatus {
                session: SessionStatus::Idle,
                // Thanh phụ đề ẩn lúc khởi động, kể cả khi mở lúc đăng nhập; hiện khi bắt đầu phiên (§4.2, Đ19).
                overlay_visible: false,
                hotkey_failures: Vec::new(),
            }),
            launched_at_login,
        }
    }

    pub fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    /// Thay cài đặt, trả về bản cũ.
    pub fn replace_settings(&self, next: Settings) -> Settings {
        std::mem::replace(&mut *self.settings.lock().unwrap(), next)
    }

    pub fn file_meta(&self) -> &FileMeta {
        &self.file_meta
    }

    pub fn status(&self) -> AppStatus {
        self.status.lock().unwrap().clone()
    }

    pub fn update_status<T>(&self, f: impl FnOnce(&mut AppStatus) -> T) -> T {
        f(&mut self.status.lock().unwrap())
    }

    pub fn launched_at_login(&self) -> bool {
        self.launched_at_login
    }
}
```

- [ ] **Step 4: Tạo `src-tauri/src/events.rs`** (QĐ6, QĐ12)

```rust
//! Sự kiện gửi sang giao diện. Tên sự kiện phải khớp `src/lib/ipc.ts`.
//!
//! Lưu ý bảo mật: trong Tauri 2, sự kiện không phải ranh giới quyền. Một listener JS đăng ký với
//! đích `Any` nhận cả sự kiện gửi riêng cho cửa sổ khác. Vì vậy không gửi bí mật nào qua sự kiện
//! (kế hoạch 06: không gửi token hay license key đầy đủ); `emit_to` chỉ để giảm việc thừa.

use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};

use crate::overlay;
use crate::settings::Settings;
use crate::state::{AppStatus, OverlayView};
use crate::window;

pub const SETTINGS_CHANGED: &str = "settings://changed";
pub const STATUS_CHANGED: &str = "app://status";
pub const NAVIGATE: &str = "app://navigate";
pub const NOTICE: &str = "app://notice";
pub const OVERLAY_VIEW: &str = "overlay://view";
/// Phụ đề (spec §6.6). Kế hoạch 02 phát sự kiện này từ pipeline; kế hoạch 01 chỉ phát phụ đề mẫu.
pub const SUBTITLE_UPSERT: &str = "subtitle://upsert";

/// Yêu cầu cửa sổ chính mở một màn hình, ví dụ khi bấm dòng báo lỗi phím tắt ở menu khay.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Navigate {
    pub screen: &'static str,
    pub settings_group: Option<&'static str>,
}

/// Lời nhắc trong app (QĐ12), hiện ở thanh báo của cửa sổ chính. Giao diện dịch `kind` thành câu.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Notice {
    /// macOS: app vừa bỏ qua `⌘Q` hay Quit ở Dock; muốn thoát thì dùng menu khay.
    QuitFromTray,
    /// macOS: vừa bật khởi động cùng hệ thống, nhưng mục của app đang bị tắt ở Login Items; giao diện
    /// có nút mở System Settings (lệnh `open_login_items_settings`).
    LoginItemsApproval,
}

pub fn settings_changed<R: Runtime>(app: &AppHandle<R>, settings: &Settings) {
    emit(app, window::MAIN, SETTINGS_CHANGED, settings);
}

pub fn status_changed<R: Runtime>(app: &AppHandle<R>, status: &AppStatus) {
    emit(app, window::MAIN, STATUS_CHANGED, status);
}

pub fn overlay_view<R: Runtime>(app: &AppHandle<R>, view: &OverlayView) {
    emit(app, overlay::LABEL, OVERLAY_VIEW, view);
}

pub fn navigate<R: Runtime>(app: &AppHandle<R>, target: Navigate) {
    emit(app, window::MAIN, NAVIGATE, target);
}

pub fn notice<R: Runtime>(app: &AppHandle<R>, notice: Notice) {
    emit(app, window::MAIN, NOTICE, notice);
}

fn emit<R: Runtime, S: Serialize + Clone>(app: &AppHandle<R>, label: &str, event: &str, payload: S) {
    if let Err(e) = app.emit_to(EventTarget::webview_window(label), event, payload) {
        log::warn!("không gửi được sự kiện {event}: {e}");
    }
}
```

- [ ] **Step 5: Tạo `src-tauri/src/commands.rs`**

```rust
//! Lệnh `invoke` của giao diện. Mỗi lệnh phải có trong ba chỗ, test `acl_tests` giữ chúng khớp nhau:
//! 1. `handler()` bên dưới;
//! 2. `build.rs` (app manifest, để lệnh đi qua ACL);
//! 3. `capabilities/main.json` hoặc `capabilities/overlay.json` (quyền `allow-<tên-lệnh>`).
//!
//! Lệnh generic theo `R: Runtime` để test ACL chạy được với `MockRuntime`.
//! Dữ liệu từ giao diện luôn được kiểm kiểu (serde) và phạm vi (`Settings::validate`) trước khi dùng.

use serde_json::Value;
use tauri::{AppHandle, Runtime, State};

use crate::actions;
use crate::errors::CommandError;
use crate::hotkeys::HotkeyAction;
use crate::settings::Settings;
use crate::state::{AppInfo, AppState, AppStatus, OverlayView};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings()
}

#[tauri::command]
pub fn update_settings<R: Runtime>(app: AppHandle<R>, patch: Value) -> Result<Settings, CommandError> {
    actions::update_settings(&app, &patch)
}

#[tauri::command]
pub fn set_hotkey<R: Runtime>(
    app: AppHandle<R>,
    action: HotkeyAction,
    accelerator: String,
) -> Result<Settings, CommandError> {
    actions::set_hotkey(&app, action, &accelerator)
}

#[tauri::command]
pub fn get_app_status(state: State<'_, AppState>) -> AppStatus {
    state.status()
}

/// Kế hoạch 02: bắt đầu phiên thật (mở thu âm, chạy tiến trình phụ) không được chạy trên luồng chính;
/// lệnh đồng bộ của Tauri chạy trên luồng chính, nên khi đó chuyển lệnh này sang `async`.
#[tauri::command]
pub fn toggle_session<R: Runtime>(app: AppHandle<R>) -> Result<AppStatus, CommandError> {
    actions::toggle_session(&app)
}

#[tauri::command]
pub fn set_overlay_visible<R: Runtime>(app: AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
    actions::set_overlay_visible(&app, visible)
}

#[tauri::command]
pub fn set_overlay_locked<R: Runtime>(app: AppHandle<R>, locked: bool) -> Result<Settings, CommandError> {
    actions::set_overlay_locked(&app, locked)
}

#[tauri::command]
pub fn get_app_info<R: Runtime>(app: AppHandle<R>, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        name: app.package_info().name.clone(),
        version: app.package_info().version.to_string(),
        identifier: app.config().identifier.clone(),
        platform: if cfg!(target_os = "macos") { "macos" } else { "windows" },
        launched_at_login: state.launched_at_login(),
    }
}

#[tauri::command]
pub fn open_log_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_log_dir(&app)
}

#[tauri::command]
pub fn open_taskbar_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_taskbar_settings(&app)
}

#[tauri::command]
pub fn open_login_items_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_login_items_settings(&app)
}

/// Lệnh duy nhất cửa sổ `overlay` gọi được, chỉ đọc (§10.2).
#[tauri::command]
pub fn get_overlay_view(state: State<'_, AppState>) -> OverlayView {
    OverlayView::from_settings(&state.settings())
}

/// Lệnh của cửa sổ `main`.
pub const MAIN_COMMANDS: &[&str] = &[
    "get_settings",
    "update_settings",
    "set_hotkey",
    "get_app_status",
    "toggle_session",
    "set_overlay_visible",
    "set_overlay_locked",
    "get_app_info",
    "open_log_dir",
    "open_taskbar_settings",
    "open_login_items_settings",
];

/// Lệnh của cửa sổ `overlay`.
pub const OVERLAY_COMMANDS: &[&str] = &["get_overlay_view"];

pub fn handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        get_settings,
        update_settings,
        set_hotkey,
        get_app_status,
        toggle_session,
        set_overlay_visible,
        set_overlay_locked,
        get_app_info,
        open_log_dir,
        open_taskbar_settings,
        open_login_items_settings,
        get_overlay_view,
    ]
}
```

- [ ] **Step 6: Tạo `src-tauri/src/actions.rs`** (QĐ16, QĐ21, QĐ24, QĐ25)

```rust
//! Các việc dùng chung cho lệnh `invoke`, menu khay và phím tắt. Mỗi việc đổi trạng thái rồi báo
//! lại cho giao diện, menu khay và thanh phụ đề, để ba nơi luôn khớp nhau.

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use crate::errors::{self, CommandError};
use crate::hotkeys::HotkeyAction;
use crate::login_item::LoginItems;
use crate::settings::{self, Settings, persist};
use crate::state::{AppState, AppStatus, OverlayView, SessionStatus};
use crate::{events, hotkey_registry, login_item, overlay, session_stub, system, tray, window};

/// Lưu cài đặt mới rồi báo mọi nơi cần biết.
fn commit_settings<R: Runtime>(app: &AppHandle<R>, next: Settings) -> Settings {
    let state = app.state::<AppState>();
    let previous = state.replace_settings(next.clone());
    if let Err(e) = persist::save(app, &next, state.file_meta()) {
        log::error!("không lưu được cài đặt: {e}");
    }
    events::settings_changed(app, &next);
    let view = OverlayView::from_settings(&next);
    if view != OverlayView::from_settings(&previous) {
        events::overlay_view(app, &view);
    }
    if previous.ui_language != next.ui_language || previous.overlay.locked != next.overlay.locked {
        tray::refresh(app);
    }
    next
}

fn status_changed<R: Runtime>(app: &AppHandle<R>) -> AppStatus {
    let status = app.state::<AppState>().status();
    events::status_changed(app, &status);
    tray::refresh(app);
    status
}

pub fn update_settings<R: Runtime>(app: &AppHandle<R>, patch: &Value) -> Result<Settings, CommandError> {
    let current = app.state::<AppState>().settings();
    let next = settings::patch::apply(&current, patch)?;
    let enabling = next.launch_at_login && !current.launch_at_login;
    if next.launch_at_login != current.launch_at_login {
        set_launch_at_login(app, next.launch_at_login)?;
    }
    // macOS: mục đã bị tắt ở Login Items thì bật lại trong app chưa đủ; nhắc người dùng (QĐ16). Hỏi trước
    // khi lưu, để không có lỗi nào xảy ra sau khi cài đặt đã được lưu.
    let needs_approval = enabling && login_item::needs_approval(login_items(app)?.0.system_status());
    let next = commit_settings(app, next);
    if needs_approval {
        events::notice(app, events::Notice::LoginItemsApproval);
    }
    Ok(next)
}

pub fn set_hotkey<R: Runtime>(
    app: &AppHandle<R>,
    action: HotkeyAction,
    accelerator: &str,
) -> Result<Settings, CommandError> {
    let state = app.state::<AppState>();
    let mut next = state.settings();
    match hotkey_registry::rebind(app, &next.hotkeys, action, accelerator) {
        Ok(hotkeys) => {
            next.hotkeys = hotkeys;
            state.update_status(|s| s.hotkey_failures.retain(|a| *a != action));
            status_changed(app);
            Ok(commit_settings(app, next))
        }
        Err(e) => {
            if !e.old_active {
                // Phím cũ cũng không đăng ký lại được: việc này đang không có phím tắt, báo như lỗi lúc khởi động.
                state.update_status(|s| {
                    if !s.hotkey_failures.contains(&action) {
                        s.hotkey_failures.push(action);
                        s.hotkey_failures.sort();
                    }
                });
                status_changed(app);
            }
            Err(CommandError::hotkey(action, e.error))
        }
    }
}

/// Bắt đầu hoặc dừng phiên. Bắt đầu thì hiện thanh phụ đề (§4.2); dừng thì thanh giữ nguyên, để
/// người dùng còn đọc được các dòng cuối.
pub fn toggle_session<R: Runtime>(app: &AppHandle<R>) -> Result<AppStatus, CommandError> {
    match app.state::<AppState>().status().session {
        SessionStatus::Idle => {
            session_stub::start(app).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?
        }
        SessionStatus::Running => session_stub::stop(app),
    }
    Ok(status_changed(app))
}

pub fn set_overlay_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> Result<AppStatus, CommandError> {
    overlay::set_visible(app, visible).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?;
    app.state::<AppState>().update_status(|s| s.overlay_visible = visible);
    Ok(status_changed(app))
}

pub fn set_overlay_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> Result<Settings, CommandError> {
    overlay::set_locked(app, locked).map_err(|e| CommandError::new(errors::OVERLAY_FAILED, None, e.to_string()))?;
    let mut next = app.state::<AppState>().settings();
    next.overlay.locked = locked;
    Ok(commit_settings(app, next))
}

/// Chạy việc của một phím tắt toàn cục hoặc một mục của menu khay.
pub fn run_hotkey<R: Runtime>(app: &AppHandle<R>, action: HotkeyAction) {
    let state = app.state::<AppState>();
    let result = match action {
        HotkeyAction::ToggleSession => toggle_session(app).map(drop),
        HotkeyAction::ToggleOverlay => set_overlay_visible(app, !state.status().overlay_visible).map(drop),
        HotkeyAction::ToggleLock => set_overlay_locked(app, !state.settings().overlay.locked).map(drop),
    };
    if let Err(e) = result {
        log::warn!("phím tắt {action:?} lỗi: {e:?}");
    }
}

fn login_items<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::State<'_, LoginItems>, CommandError> {
    app.try_state::<LoginItems>()
        .ok_or_else(|| CommandError::new(errors::AUTOSTART_FAILED, Some("launchAtLogin"), "chưa cài LoginItem"))
}

fn set_launch_at_login<R: Runtime>(app: &AppHandle<R>, enabled: bool) -> Result<(), CommandError> {
    let items = login_items(app)?;
    let result = if enabled { items.0.enable() } else { items.0.disable() };
    result.map_err(|e| CommandError::new(errors::AUTOSTART_FAILED, Some("launchAtLogin"), e))?;
    // Windows: `disable()` không xóa được mục ở `HKLM` nếu không có quyền admin (QĐ16).
    if !enabled && items.0.is_registered().unwrap_or(false) {
        return Err(CommandError::new(
            errors::AUTOSTART_STILL_ENABLED,
            Some("launchAtLogin"),
            "đã tắt nhưng hệ thống vẫn báo đang bật",
        ));
    }
    Ok(())
}

/// Lúc khởi động: người dùng có thể đã tắt mục khởi động cùng hệ thống trong System Settings hay
/// Task Manager, nên trạng thái thật của hệ điều hành là đúng (QĐ16). Trả về `true` nếu cài đặt phải sửa.
pub fn sync_launch_at_login<R: Runtime>(app: &AppHandle<R>, settings: &mut Settings) -> bool {
    let Ok(items) = login_items(app) else {
        return false;
    };
    let registered = match items.0.is_registered() {
        Ok(registered) => registered,
        Err(e) => {
            log::warn!("không đọc được trạng thái khởi động cùng hệ thống: {e}");
            return false;
        }
    };
    let status = items.0.system_status();
    let enabled = login_item::effective(registered, status);
    if registered && !enabled {
        log::info!("mục khởi động cùng hệ thống đang bị tắt ở System Settings: {status:?}");
    }
    if enabled == settings.launch_at_login {
        return false;
    }
    settings.launch_at_login = enabled;
    true
}

/// macOS: mở System Settings › General › Login Items, từ nút ở lời nhắc `LoginItemsApproval`.
pub fn open_login_items_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(target_os = "macos") {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên macOS"));
    }
    system::open_login_items_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Mở thư mục log bằng trình quản lý file của hệ điều hành (Đ10), để người dùng tự gửi log khi cần hỗ trợ.
pub fn open_log_dir<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    system::open_log_dir(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Windows: mở trang cài đặt Taskbar để người dùng bật icon của app (§4.1, bước 8).
pub fn open_taskbar_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    if !cfg!(windows) {
        return Err(CommandError::new(errors::UNSUPPORTED, None, "chỉ có trên Windows"));
    }
    system::open_taskbar_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Thoát hẳn, chỉ gọi từ menu khay (§4.3). Kế hoạch 02 dừng phiên và tắt hai tiến trình phụ ở đây.
pub fn quit<R: Runtime>(app: &AppHandle<R>) {
    session_stub::stop(app);
    overlay::remember_position(app);
    log::info!("thoát theo yêu cầu từ menu khay");
    app.exit(0);
}

/// macOS: vừa bỏ qua một yêu cầu thoát không đến từ menu khay (`⌘Q`, mục Quit ở menu app, Quit ở
/// Dock). Hiện cửa sổ chính kèm lời nhắc, để người dùng biết vì sao app không thoát.
pub fn quit_blocked<R: Runtime>(app: &AppHandle<R>) {
    window::show_main(app);
    events::notice(app, events::Notice::QuitFromTray);
}

/// Mở cửa sổ chính ở một màn hình, dùng cho các dòng báo lỗi ở menu khay.
pub fn open_main_at<R: Runtime>(app: &AppHandle<R>, target: events::Navigate) {
    window::show_main(app);
    events::navigate(app, target);
}
```

- [ ] **Step 7: Tạo `src-tauri/src/hotkey_registry.rs`**

```rust
//! Đăng ký ba phím tắt toàn cục với hệ điều hành qua `tauri-plugin-global-shortcut`. Luật đổi phím
//! tắt (đăng ký lại phím cũ khi phím mới bị từ chối) nằm ở `hotkeys::rebind`, có test với bản giả.
//!
//! Trên Windows, phím tắt đã bị app khác giữ thì đăng ký thất bại, và app báo lỗi. Trên macOS, đăng
//! ký gần như luôn thành công dù app khác đang dùng cùng tổ hợp, nên chỉ thử tay mới thấy trùng
//! (ma trận S5, dòng 13; C5 của kế hoạch 00).

use std::sync::Mutex;

use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcut, GlobalShortcutExt, Shortcut, ShortcutState};

use crate::actions;
use crate::hotkeys::{self, Bound, HotkeyAction, RebindError, Registrar};
use crate::settings::Hotkeys;

/// Phím tắt đang đăng ký, dùng chung cho handler của plugin và lệnh `set_hotkey`.
#[derive(Default)]
pub struct HotkeyRegistry(Mutex<Bound>);

struct OsRegistrar<'a, R: Runtime>(&'a GlobalShortcut<R>);

impl<R: Runtime> Registrar for OsRegistrar<'_, R> {
    fn register(&self, shortcut: Shortcut) -> bool {
        match self.0.register(shortcut) {
            Ok(()) => true,
            Err(e) => {
                log::warn!("không đăng ký được phím tắt {shortcut}: {e}");
                false
            }
        }
    }

    fn unregister(&self, shortcut: Shortcut) {
        if let Err(e) = self.0.unregister(shortcut) {
            log::warn!("không gỡ được phím tắt {shortcut}: {e}");
        }
    }
}

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let action = app
                .state::<HotkeyRegistry>()
                .0
                .lock()
                .unwrap()
                .action_for(shortcut.id());
            if let Some(action) = action {
                actions::run_hotkey(app, action);
            }
        })
        .build()
}

/// Đăng ký cả ba phím tắt lúc khởi động. Trả về các việc không đăng ký được.
pub fn register_all<R: Runtime>(app: &AppHandle<R>, hotkeys: &Hotkeys) -> Vec<HotkeyAction> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    hotkeys::register_all(&OsRegistrar(app.global_shortcut()), &mut bound, &hotkeys.bindings())
}

/// Đổi phím tắt của một việc; trả về bộ phím tắt mới.
pub fn rebind<R: Runtime>(
    app: &AppHandle<R>,
    current: &Hotkeys,
    action: HotkeyAction,
    accelerator: &str,
) -> Result<Hotkeys, RebindError> {
    let registry = app.state::<HotkeyRegistry>();
    let mut bound = registry.0.lock().unwrap();
    let canonical = hotkeys::rebind(
        &OsRegistrar(app.global_shortcut()),
        &mut bound,
        &current.bindings(),
        action,
        accelerator,
    )?;
    let mut next = current.clone();
    next.set(action, canonical);
    Ok(next)
}
```

- [ ] **Step 8: Icon khay tạm.** Tạo `scripts/make_tray_icon.py`:

```python
"""Tạo icon khay tạm cho macOS: `src-tauri/icons/tray-template.png`, 44×44 (22 pt ở màn hình @2x).

Icon dạng template: chỉ dùng kênh alpha, màu đen; macOS tự đổi màu theo menu bar sáng hay tối.
Hình: khung phụ đề bo góc với hai dòng chữ. Logo thật chưa chốt (Q1).

Dùng:  python3 scripts/make_tray_icon.py
Chỉ dùng thư viện chuẩn của Python.
"""
import struct
import zlib

SIZE = 44
SUB = 4  # lấy mẫu 4×4 mỗi pixel để khử răng cưa


def inside_round_rect(x, y, left, top, right, bottom, radius):
    cx = min(max(x, left + radius), right - radius)
    cy = min(max(y, top + radius), bottom - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2 and left <= x <= right and top <= y <= bottom


def covered(x, y):
    # Viền khung: phần giữa hai hình chữ nhật bo góc.
    outer = inside_round_rect(x, y, 3, 7, 41, 37, 7)
    inner = inside_round_rect(x, y, 6.5, 10.5, 37.5, 33.5, 4)
    if outer and not inner:
        return True
    # Hai dòng chữ.
    return inside_round_rect(x, y, 11, 16, 33, 19.5, 1.75) or inside_round_rect(x, y, 11, 24.5, 27, 28, 1.75)


def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def main():
    rows = []
    for py in range(SIZE):
        row = bytearray([0])  # bộ lọc "None" cho mỗi hàng
        for px in range(SIZE):
            hits = sum(
                covered(px + (i + 0.5) / SUB, py + (j + 0.5) / SUB) for i in range(SUB) for j in range(SUB)
            )
            row += bytes((0, 0, 0, round(255 * hits / (SUB * SUB))))
        rows.append(bytes(row))
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0)  # 8 bit mỗi kênh, RGBA
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
           + chunk(b"IEND", b""))
    with open("src-tauri/icons/tray-template.png", "wb") as f:
        f.write(png)


if __name__ == "__main__":
    main()
```

Run: `python3 scripts/make_tray_icon.py && file src-tauri/icons/tray-template.png`
Expected: `src-tauri/icons/tray-template.png: PNG image data, 44 x 44, 8-bit/color RGBA, non-interlaced`. Mở file bằng Preview: khung phụ đề bo góc màu đen với hai dòng chữ, nền trong suốt.

- [ ] **Step 9: Tạo `src-tauri/src/tray.rs`** (QĐ12, QĐ17)

```rust
//! Icon ở khay hệ thống (menu bar trên Mac) và menu của nó (F10, spec §4.2, §4.3).
//! Menu dựng lại mỗi khi trạng thái hay ngôn ngữ giao diện đổi, nên chữ luôn theo ngôn ngữ đang chọn.
//! Nội dung menu (dòng nào, chữ gì) nằm ở `tray_menu.rs`, có test.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Runtime};

use crate::hotkeys::HotkeyAction;
use crate::i18n::{self, Strings};
use crate::state::{AppState, SessionStatus};
use crate::tray_menu::{TrayItem, TrayModel, menu_lines};
use crate::{actions, events, window};

pub const TRAY_ID: &str = "main";

fn model<R: Runtime>(app: &AppHandle<R>) -> (TrayModel, &'static Strings) {
    let state = app.state::<AppState>();
    let settings = state.settings();
    let status = state.status();
    let model = TrayModel {
        running: status.session == SessionStatus::Running,
        overlay_visible: status.overlay_visible,
        locked: settings.overlay.locked,
        hotkeys_failed: !status.hotkey_failures.is_empty(),
    };
    (model, i18n::strings(settings.ui_language))
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<(Menu<R>, String)> {
    let (model, strings) = model(app);
    let menu = Menu::new(app)?;
    for line in menu_lines(strings, model) {
        match line {
            Some((item, text)) => menu.append(&MenuItem::with_id(app, item.id(), text, true, None::<&str>)?)?,
            None => menu.append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok((menu, strings.tooltip(&app.package_info().name, model.running)))
}

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let (menu, tooltip) = build_menu(app)?;
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()));
    // macOS: icon đơn sắc dạng template, hệ thống tự đổi màu theo menu bar sáng hay tối; bấm chuột
    // trái mở menu như mọi icon menu bar. Windows: icon màu của app; bấm chuột trái mở cửa sổ chính,
    // chuột phải mở menu.
    #[cfg(target_os = "macos")]
    let builder = builder
        .icon(tauri::include_image!("icons/tray-template.png"))
        .icon_as_template(true);
    #[cfg(not(target_os = "macos"))]
    let builder = {
        use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
        let builder = builder
            .show_menu_on_left_click(false)
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    window::show_main(tray.app_handle());
                }
            });
        match app.default_window_icon() {
            Some(icon) => builder.icon(icon.clone()),
            None => builder,
        }
    };
    builder.build(app)?;
    Ok(())
}

/// Dựng lại menu và chú thích theo trạng thái hiện tại.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else { return };
    match build_menu(app) {
        Ok((menu, tooltip)) => {
            let _ = tray.set_menu(Some(menu));
            let _ = tray.set_tooltip(Some(tooltip));
        }
        Err(e) => log::warn!("không dựng lại được menu khay: {e}"),
    }
}

fn on_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match TrayItem::from_id(id) {
        Some(TrayItem::HotkeyWarning) => actions::open_main_at(
            app,
            events::Navigate {
                screen: "settings",
                settings_group: Some("hotkeys"),
            },
        ),
        Some(TrayItem::Session) => actions::run_hotkey(app, HotkeyAction::ToggleSession),
        Some(TrayItem::Overlay) => actions::run_hotkey(app, HotkeyAction::ToggleOverlay),
        Some(TrayItem::Lock) => actions::run_hotkey(app, HotkeyAction::ToggleLock),
        Some(TrayItem::OpenMain) => window::show_main(app),
        Some(TrayItem::Quit) => actions::quit(app),
        None => log::warn!("mục menu khay lạ: {id}"),
    }
}
```

- [ ] **Step 10: Tạo `src-tauri/src/window.rs`** (QĐ7, QĐ15, QĐ22)

```rust
//! Cửa sổ chính: bấm X chỉ ẩn xuống khay (spec §4.3); icon ở Dock theo cửa sổ chính (§4.4).

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder, Window, WindowEvent};

use crate::{navigation, overlay};

pub const MAIN: &str = "main";

/// Tạo cửa sổ chính, ẩn. Tạo bằng code (không khai trong `tauri.conf.json`) để gắn được
/// `on_new_window`: link mở cửa sổ mới không bao giờ mở webview mới (`navigation.rs`).
pub fn create_main<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title(app.package_info().name.clone())
        .inner_size(960.0, 640.0)
        .min_inner_size(720.0, 480.0)
        .center()
        .visible(false)
        // ⌘+ / Ctrl+ phóng to chữ (§6.10). Trên macOS cần quyền `core:webview:allow-set-webview-zoom`.
        .zoom_hotkeys_enabled(true)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(())
}

/// Hiện cửa sổ chính. Trên Mac, app hiện icon ở Dock (activation policy `regular`).
/// Kế hoạch 02 chạy hai tiến trình phụ khi cửa sổ chính mở (§5), từ chỗ gọi hàm này.
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
        log::warn!("không đổi được activation policy: {e}");
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Ẩn cửa sổ chính xuống khay. Trên Mac, app bỏ icon ở Dock (activation policy `accessory`).
pub fn hide_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
    }
    #[cfg(target_os = "macos")]
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
        log::warn!("không đổi được activation policy: {e}");
    }
}

pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    match (window.label(), event) {
        // X, ⌘W, Alt+F4: chỉ ẩn. App, phím tắt và phiên dịch vẫn chạy.
        (MAIN, WindowEvent::CloseRequested { api, .. }) => {
            api.prevent_close();
            hide_main(window.app_handle());
        }
        (overlay::LABEL, WindowEvent::Moved(_) | WindowEvent::Resized(_)) => {
            overlay::remember_position(window.app_handle());
        }
        _ => {}
    }
}

/// Menu của app trên Mac, gần như menu mặc định của Tauri. Mục Quit (`⌘Q`) vẫn còn, nhưng mọi yêu cầu
/// thoát đi qua `quit_guard`: không phải do hệ thống gửi thì bị hủy, và app hiện lời nhắc thoát ở menu
/// bar (§4.3).
#[cfg(target_os = "macos")]
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem as P, Submenu};
    let name = app.package_info().name.clone();
    let about = AboutMetadata {
        name: Some(name.clone()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                &name,
                true,
                &[
                    &P::about(app, None, Some(about))?,
                    &P::separator(app)?,
                    &P::services(app, None)?,
                    &P::separator(app)?,
                    &P::hide(app, None)?,
                    &P::hide_others(app, None)?,
                    &P::show_all(app, None)?,
                    &P::separator(app)?,
                    &P::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &P::undo(app, None)?,
                    &P::redo(app, None)?,
                    &P::separator(app)?,
                    &P::cut(app, None)?,
                    &P::copy(app, None)?,
                    &P::paste(app, None)?,
                    &P::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &P::minimize(app, None)?,
                    &P::maximize(app, None)?,
                    &P::separator(app)?,
                    &P::close_window(app, None)?,
                ],
            )?,
        ],
    )
}
```

- [ ] **Step 11: Thanh phụ đề.** Thay toàn bộ `src-tauri/src/overlay/mod.rs`:

```rust
//! Thanh phụ đề (spec §4.4): cửa sổ `overlay` không viền, trong suốt, luôn nổi trên cùng, không lấy
//! focus của app họp. Cách làm từ spike S5 (kế hoạch 0-05):
//! - macOS (`macos.rs`): NSPanel non-activating qua `tauri-nspanel`;
//! - Windows (`windows.rs`): cửa sổ topmost, `skip_taskbar`, `focusable(false)`.
//!
//! Phần chung ở đây: ẩn/hiện, khóa (click xuyên qua), nhớ vị trí theo từng màn hình. Ẩn/hiện và khóa
//! đi qua trait `Surface`, để test (`app_tests.rs`) kiểm bằng bản giả mà không cần cửa sổ thật.

pub mod placement;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(not(target_os = "macos"))]
mod windows;
#[cfg(not(target_os = "macos"))]
use windows as platform;

use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, Runtime};

use crate::i18n;
use crate::settings::{MAX_OVERLAY_POSITIONS, persist};
use crate::state::AppState;
use placement::Screen;

pub const LABEL: &str = "overlay";

/// Thao tác trên cửa sổ của thanh phụ đề. Bản thật gọi `macos.rs` hoặc `windows.rs`; test dùng bản giả
/// ghi lại từng lần gọi (`test_support::FakeSurface`).
pub trait Surface: Send + Sync + 'static {
    fn set_visible(&self, visible: bool) -> tauri::Result<()>;
    /// Chế độ khóa: click đi xuyên qua thanh phụ đề (§4.4).
    fn set_click_through(&self, on: bool) -> tauri::Result<()>;
}

/// `Surface` đang dùng, quản lý bằng `app.manage`: `create` đặt bản thật, test đặt bản giả.
pub struct OverlaySurface(pub Box<dyn Surface>);

struct Native<R: Runtime>(AppHandle<R>);

impl<R: Runtime> Surface for Native<R> {
    fn set_visible(&self, visible: bool) -> tauri::Result<()> {
        platform::set_visible(&self.0, visible)
    }

    fn set_click_through(&self, on: bool) -> tauri::Result<()> {
        platform::set_ignore_mouse(&self.0, on)
    }
}

/// Tạo thanh phụ đề ở trạng thái ẩn, đặt vào vị trí đã nhớ, áp chế độ khóa đã lưu. Thanh chỉ hiện khi
/// bắt đầu phiên (`session_stub::start`, sau này `session.rs` của 02) hoặc khi người dùng bấm hiện (§4.2).
pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let settings = app.state::<AppState>().settings();
    platform::create(app, i18n::strings(settings.ui_language).overlay_title)?;
    app.manage(OverlaySurface(Box::new(Native(app.clone()))));
    restore_position(app);
    set_locked(app, settings.overlay.locked)
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(surface) => surface.0.set_visible(visible),
        None => Ok(()),
    }
}

/// Chế độ khóa: cho click xuyên qua thanh phụ đề (§4.4).
pub fn set_locked<R: Runtime>(app: &AppHandle<R>, locked: bool) -> tauri::Result<()> {
    match app.try_state::<OverlaySurface>() {
        Some(surface) => surface.0.set_click_through(locked),
        None => Ok(()),
    }
}

fn screen_of(monitor: &Monitor) -> Screen {
    let area = monitor.work_area();
    Screen {
        key: placement::screen_key(
            monitor.name().map(String::as_str),
            monitor.size().width,
            monitor.size().height,
        ),
        x: area.position.x,
        y: area.position.y,
        width: area.size.width,
        height: area.size.height,
        scale: monitor.scale_factor(),
    }
}

/// Đặt thanh phụ đề vào vị trí đã nhớ (hoặc vị trí mặc định) trên màn hình phù hợp.
pub fn restore_position<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let screens: Vec<Screen> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(screen_of)
        .collect();
    let primary = app.primary_monitor().ok().flatten().map(|m| screen_of(&m).key);
    let settings = app.state::<AppState>().settings();
    let Some(p) = placement::place(
        &settings.overlay.positions,
        settings.overlay.last_monitor.as_deref(),
        &screens,
        primary.as_deref(),
    ) else {
        log::warn!("không thấy màn hình nào để đặt thanh phụ đề");
        return;
    };
    let _ = window.set_size(PhysicalSize::new(p.width, p.height));
    let _ = window.set_position(PhysicalPosition::new(p.x, p.y));
}

/// Nhớ vị trí hiện tại của thanh phụ đề cho màn hình nó đang nằm (gọi khi cửa sổ di chuyển hay đổi
/// kích thước, và trước khi thoát).
pub fn remember_position<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    let (Ok(position), Ok(size), Ok(Some(monitor))) =
        (window.outer_position(), window.outer_size(), window.current_monitor())
    else {
        return;
    };
    let screen = screen_of(&monitor);
    let rect = placement::to_relative(&screen, position.x, position.y, size.width, size.height);
    let state = app.state::<AppState>();
    let mut next = state.settings();
    let unchanged = next
        .overlay
        .positions
        .get(&screen.key)
        .is_some_and(|r| placement::same_geometry(r, &rect));
    if unchanged && next.overlay.last_monitor.as_deref() == Some(&screen.key) {
        return;
    }
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    placement::remember(
        &mut next.overlay.positions,
        &screen.key,
        rect,
        now,
        MAX_OVERLAY_POSITIONS,
    );
    next.overlay.last_monitor = Some(screen.key);
    if next.validate().is_err() {
        // Cửa sổ bị thu quá nhỏ hay nằm ngoài phạm vi: không lưu.
        return;
    }
    state.replace_settings(next.clone());
    if let Err(e) = persist::save_overlay(app, &next, state.file_meta()) {
        log::warn!("không lưu được vị trí thanh phụ đề: {e}");
    }
}
```

Tạo `src-tauri/src/overlay/macos.rs` (code tạo NSPanel của S5, không đổi cờ nào; thêm `on_new_window`):

```rust
//! Thanh phụ đề trên macOS: NSPanel non-activating, mức `Status`, có mặt ở mọi Space kể cả Space
//! toàn màn hình của app khác (spec §4.4). Giữ nguyên cách tạo của spike S5 (kế hoạch 0-05, Task 2):
//! - panel tạo từ cửa sổ không viền, trong suốt, không focus, `accept_first_mouse`;
//! - bit NonactivatingPanel được cộng thêm bằng `add_style_mask`; `StyleMask::borderless()` gán đè
//!   cả mask nên không được dùng, nếu không panel sẽ lấy focus của app họp.

use tauri::{AppHandle, Runtime, WebviewUrl};
use tauri_nspanel::{CollectionBehavior, ManagerExt, PanelBuilder, PanelLevel, StyleMask};

use super::LABEL;
use crate::navigation;

tauri_nspanel::tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: false,
            is_floating_panel: true
        }
    })
}

pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<()> {
    let handle = app.clone();
    PanelBuilder::<_, OverlayPanel<R>>::new(app, LABEL)
        .url(WebviewUrl::App("overlay.html".into()))
        .title(title)
        .size(tauri::Size::Logical(tauri::LogicalSize::new(900.0, 160.0)))
        .with_window(move |w| {
            w.decorations(false)
                .transparent(true)
                .focused(false)
                .visible(false)
                .accept_first_mouse(true)
                .on_new_window(navigation::new_window_handler(handle.clone()))
        })
        .level(PanelLevel::Status)
        .add_style_mask(StyleMask::empty().nonactivating_panel())
        .collection_behavior(
            CollectionBehavior::new()
                .can_join_all_spaces()
                .full_screen_auxiliary()
                .stationary(),
        )
        .transparent(true)
        .has_shadow(false)
        .hides_on_deactivate(false)
        .no_activate(true)
        .build()?;
    Ok(())
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    if let Ok(panel) = app.get_webview_panel(LABEL) {
        if visible { panel.show() } else { panel.hide() }
    }
    Ok(())
}

pub fn set_ignore_mouse<R: Runtime>(app: &AppHandle<R>, ignore: bool) -> tauri::Result<()> {
    if let Ok(panel) = app.get_webview_panel(LABEL) {
        panel.set_ignores_mouse_events(ignore);
    }
    Ok(())
}
```

Tạo `src-tauri/src/overlay/windows.rs` (QĐ23: sau khi tạo, ẩn/hiện và click xuyên qua chỉ dùng Win32, không gọi `show`, `hide`, `set_ignore_cursor_events` hay hàm đổi cờ nào khác của tao; `maximizable(false)` và `minimizable(false)` để Aero Snap không phóng to):

```rust
//! Thanh phụ đề trên Windows: cửa sổ không viền, trong suốt, topmost, không có nút ở taskbar, không
//! lấy focus (`focusable(false)` đặt `WS_EX_NOACTIVATE`). Giữ nguyên cách tạo của spike S5.
//! Cần Windows để thử (ma trận S5 trên Windows, C5 của kế hoạch 00).
//!
//! Sau khi tạo, ẩn/hiện và click xuyên qua làm hẳn bằng Win32, không qua `show`, `hide` hay
//! `set_ignore_cursor_events` của tao (QĐ23). tao giữ cờ `VISIBLE` riêng: cửa sổ hiện bằng Win32 thì tao
//! vẫn tưởng đang ẩn, nên `hide()` không làm gì; đổi click xuyên qua tao thì tao áp lại cả bộ cờ, gọi
//! `SW_HIDE` (thanh biến mất) hoặc `SW_SHOW` (lấy focus). `AppStatus.overlay_visible` là trạng thái gốc.
//! Cũng vì vậy, không gọi hàm nào đổi cờ của tao cho cửa sổ này sau khi tạo (`set_resizable`,
//! `set_always_on_top`, `set_decorations`, `set_maximizable`…): mọi cờ đặt một lần ở `create`.

use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};
use windows::Win32::UI::WindowsAndMessaging::{
    GWL_EXSTYLE, GetWindowLongPtrW, SW_HIDE, SW_SHOWNOACTIVATE, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
    SWP_NOSIZE, SWP_NOZORDER, SetWindowLongPtrW, SetWindowPos, ShowWindow, WS_EX_LAYERED, WS_EX_TRANSPARENT,
};

use super::LABEL;
use crate::navigation;

pub fn create<R: Runtime>(app: &AppHandle<R>, title: &str) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("overlay.html".into()))
        .title(title)
        .inner_size(900.0, 160.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        // Không có nút phóng to: kéo thanh lên mép trên thì Aero Snap không phóng to. Ghép nửa màn hình
        // (kéo sang mép trái, phải) còn tùy kiểu cửa sổ cho đổi cỡ (`WS_THICKFRAME`), cờ này không chắc
        // chặn được; Task 25 dòng 17 kiểm.
        .maximizable(false)
        .minimizable(false)
        .shadow(false)
        .focused(false)
        .focusable(false)
        .visible(false)
        .on_new_window(navigation::new_window_handler(app.clone()))
        .build()?;
    Ok(())
}

pub fn set_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let hwnd = window.hwnd()?;
    // `SW_SHOWNOACTIVATE` hiện cửa sổ mà không kích hoạt, nên không lấy focus của app họp.
    let command = if visible { SW_SHOWNOACTIVATE } else { SW_HIDE };
    // SAFETY: `hwnd` là cửa sổ của chính app, còn sống trong lúc gọi. Hàm Win32 này gửi việc sang luồng
    // sở hữu cửa sổ nếu cần, nên gọi từ luồng nào cũng được.
    let _ = unsafe { ShowWindow(hwnd, command) };
    Ok(())
}

/// Bật/tắt click xuyên qua bằng đúng hai bit mà tao dùng (`WS_EX_TRANSPARENT | WS_EX_LAYERED`), rồi báo
/// hệ thống cập nhật khung cửa sổ mà không đổi vị trí, thứ tự hay focus.
pub fn set_ignore_mouse<R: Runtime>(app: &AppHandle<R>, ignore: bool) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let hwnd = window.hwnd()?;
    let bits = (WS_EX_TRANSPARENT.0 | WS_EX_LAYERED.0) as isize;
    // SAFETY: như `set_visible`; chỉ đổi hai bit của kiểu mở rộng, giữ nguyên các bit khác.
    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        let next = if ignore { style | bits } else { style & !bits };
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next);
        SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        )
        .map_err(std::io::Error::other)?;
    }
    Ok(())
}
```

- [ ] **Step 12: Tạo `src-tauri/src/session_stub.rs`** (QĐ11, QĐ21)

```rust
//! Phiên dịch tạm của kế hoạch 01: Bắt đầu/Dừng chỉ đổi trạng thái, và trong lúc "đang dịch" thì
//! phát phụ đề mẫu mỗi 1,5 giây (như spike S5) để thử thanh phụ đề bằng tay.
//! Kế hoạch 02 thay file này bằng `session.rs`, nối `audio-capture` và `pipeline` (§12).

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::events::SUBTITLE_UPSERT;
use crate::overlay;
use crate::state::{AppState, SessionStatus};

const SAMPLES: &[(&str, &str, &str)] = &[
    (
        "en",
        "Good morning everyone, thanks for joining.",
        "Chào buổi sáng mọi người, cảm ơn đã tham gia.",
    ),
    (
        "en",
        "Let's review the quarterly numbers first.",
        "Trước hết hãy xem lại số liệu quý.",
    ),
    (
        "zh",
        "我们下周需要完成测试。",
        "Tuần sau chúng ta cần hoàn thành việc kiểm thử.",
    ),
    (
        "ja",
        "来月の予算を確認させてください。",
        "Cho tôi xác nhận lại ngân sách tháng tới.",
    ),
];

/// Tăng mỗi lần bắt đầu hay dừng; luồng phát mẫu tự dừng khi thấy số này đổi.
static GENERATION: AtomicU64 = AtomicU64::new(0);

/// Bắt đầu phiên tạm: hiện thanh phụ đề (§4.2; `session.rs` của 02 làm y như vậy), rồi phát phụ đề mẫu.
pub fn start<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    overlay::set_visible(app, true)?;
    app.state::<AppState>().update_status(|s| {
        s.session = SessionStatus::Running;
        s.overlay_visible = true;
    });
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    std::thread::spawn(move || {
        for n in 0u64.. {
            std::thread::sleep(Duration::from_millis(1500));
            if GENERATION.load(Ordering::SeqCst) != generation {
                break;
            }
            let (lang, src, tgt) = SAMPLES[n as usize % SAMPLES.len()];
            let start_ms = n * 1500;
            let payload = json!({
                "id": n,
                "start_ms": start_ms,
                "end_ms": start_ms + 1200,
                "src_lang": lang,
                "src_text": src,
                "tgt_text": tgt,
                "status": "done",
                "provisional": n % 4 == 3,
            });
            let _ = app.emit(SUBTITLE_UPSERT, payload);
        }
    });
    Ok(())
}

pub fn stop<R: Runtime>(app: &AppHandle<R>) {
    GENERATION.fetch_add(1, Ordering::SeqCst);
    app.state::<AppState>()
        .update_status(|s| s.session = SessionStatus::Idle);
}
```

- [ ] **Step 13: Tạo `src-tauri/src/logging.rs`** (QĐ14)

```rust
//! Log của app (Đ10 của kế hoạch 00): ghi ra file trên máy, xoay vòng, không gửi đi đâu (§10.1).
//!
//! - macOS: `~/Library/Logs/<bundle-id>/app.log`; Windows: `%LOCALAPPDATA%\<bundle-id>\logs\app.log`.
//! - Mỗi file tối đa 1 MB, giữ 5 file cũ.
//! - Log không bao giờ chứa âm thanh, nội dung chép lời, license key đầy đủ, token hay khóa API (§10.2).
//! - Giao diện không ghi được log (capabilities không cấp `log:*`).

use tauri::Runtime;
use tauri::plugin::TauriPlugin;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

pub const MAX_FILE_BYTES: u128 = 1_000_000;
pub const KEEP_FILES: usize = 5;

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let level = if cfg!(debug_assertions) {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("app".into()),
        }))
        .target(Target::new(TargetKind::Stdout))
        .level(level)
        // Thư viện cửa sổ và webview ghi rất nhiều ở mức debug.
        .level_for("tao", log::LevelFilter::Warn)
        .level_for("wry", log::LevelFilter::Warn)
        .max_file_size(MAX_FILE_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(KEEP_FILES))
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}
```

- [ ] **Step 14: Thay toàn bộ `src-tauri/src/lib.rs`**

```rust
//! Lõi Rust của app AI Translator (spec §5, §12). `main.rs` chỉ gọi `run()`.
//!
//! Tên sản phẩm và bundle identifier nằm ở `tauri.conf.json` (`productName`, `identifier`); tên crate,
//! tên binary (`meeting-translator`) và tên thư mục repo giữ nguyên (QĐ29).
//!
//! Kế hoạch 01 dựng khung: cài đặt, i18n phía Rust, khay, phím tắt, hai cửa sổ, quyền, kho khóa, log.
//! Kế hoạch 02 nối `audio-capture` và `pipeline` vào, thay `session_stub.rs` bằng `session.rs`.

pub mod actions;
pub mod commands;
pub mod errors;
pub mod events;
pub mod hotkey_registry;
pub mod hotkeys;
pub mod i18n;
pub mod logging;
pub mod login_item;
pub mod navigation;
pub mod overlay;
pub mod quit_guard;
pub mod security;
pub mod session_stub;
pub mod settings;
pub mod state;
pub mod system;
pub mod tray;
pub mod tray_menu;
pub mod window;

#[cfg(test)]
mod acl_tests;
#[cfg(test)]
mod app_tests;
#[cfg(test)]
mod test_support;

use tauri::{App, AppHandle, Manager, RunEvent};

use crate::hotkey_registry::HotkeyRegistry;
use crate::settings::{Settings, persist};
use crate::state::AppState;

/// Tham số hệ điều hành truyền khi mở app lúc đăng nhập (tauri-plugin-autostart).
pub const AUTOSTART_ARG: &str = "--autostart";

pub fn run() {
    let context = tauri::generate_context!();
    // QĐ29: tên mục khởi động cùng hệ thống theo một luật duy nhất (`login_item::autostart_name`): macOS
    // là bundle identifier (tên file LaunchAgent và `Label`), Windows là tên sản phẩm (tên giá trị trong `Run`).
    let autostart_name =
        login_item::autostart_name(&context.config().identifier, &context.package_info().name).to_string();
    let autostart = tauri_plugin_autostart::Builder::new()
        .app_name(autostart_name)
        .arg(AUTOSTART_ARG);
    // single-instance phải là plugin đầu tiên: bản thứ hai thoát ngay, bản đang chạy hiện cửa sổ chính (Q7).
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show_main(app)
        }))
        .plugin(logging::plugin())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(autostart.build())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(hotkey_registry::plugin())
        .plugin(navigation::plugin());
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init()).menu(window::app_menu);
    builder
        .invoke_handler(commands::handler())
        .on_window_event(window::on_window_event)
        .setup(setup)
        .build(context)
        .expect("không dựng được app")
        .run(on_run_event);
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();
    // Mọi việc mở ra ngoài app (Finder, System Settings, trình duyệt) đi qua đây (QĐ28).
    system::install(&handle);
    // Ghi file cài đặt và bật/tắt khởi động cùng hệ thống cũng qua trait, để test dùng bản giả.
    persist::install(&handle);
    login_item::install(&handle);
    let launched_at_login = std::env::args().any(|arg| arg == AUTOSTART_ARG);
    log::info!(
        "khởi động {} {}, lúc đăng nhập: {launched_at_login}",
        handle.package_info().name,
        handle.package_info().version
    );

    let loaded = persist::load(&handle, Settings::defaults(i18n::system_ui_language()))?;
    if !loaded.rejected.is_empty() {
        log::warn!(
            "bỏ các khóa cài đặt không hợp lệ, dùng giá trị mặc định: {:?}",
            loaded.rejected
        );
    }
    let needs_save = loaded.needs_save();
    let mut settings = loaded.settings;
    let launch_changed = actions::sync_launch_at_login(&handle, &mut settings);
    if needs_save || launch_changed {
        persist::save(&handle, &settings, &loaded.meta)?;
    }
    app.manage(AppState::new(settings.clone(), loaded.meta, launched_at_login));
    app.manage(HotkeyRegistry::default());

    #[cfg(target_os = "macos")]
    {
        let app = handle.clone();
        quit_guard::install(move || actions::quit_blocked(&app));
    }

    window::create_main(&handle)?;
    overlay::create(&handle)?;
    let failures = hotkey_registry::register_all(&handle, &settings.hotkeys);
    handle
        .state::<AppState>()
        .update_status(|s| s.hotkey_failures = failures);
    tray::create(&handle)?;

    // Đ19: mở lúc đăng nhập thì chỉ nằm ở khay; người dùng tự mở app thì hiện cửa sổ chính. Thanh phụ
    // đề ẩn trong cả hai trường hợp, tới khi bắt đầu phiên.
    if launched_at_login {
        window::hide_main(&handle)
    } else {
        window::show_main(&handle)
    }
    Ok(())
}

// `app` chỉ dùng trên macOS.
#[cfg_attr(not(target_os = "macos"), allow(unused_variables))]
fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        // Đóng hết cửa sổ không làm app thoát; chỉ Thoát ở menu khay mới thoát (`AppHandle::exit`,
        // lúc đó `code` có giá trị).
        RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
        // Bấm icon ở Dock khi cửa sổ chính đang ẩn.
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => window::show_main(app),
        _ => {}
    }
}
```

- [ ] **Step 15: App manifest, quyền của từng cửa sổ, cấu hình**

Thay toàn bộ `src-tauri/build.rs`:

```rust
fn main() {
    // App manifest: lệnh của app cũng đi qua ACL (spec §10.2). Cửa sổ nào không được cấp
    // `allow-<tên-lệnh>` trong capabilities thì không gọi được. Danh sách phải khớp
    // `src/commands.rs` (test `acl_tests::capabilities_grant_exactly_the_fixed_lists`).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "get_settings",
            "update_settings",
            "set_hotkey",
            "get_app_status",
            "toggle_session",
            "set_overlay_visible",
            "set_overlay_locked",
            "get_app_info",
            "open_log_dir",
            "open_taskbar_settings",
            "open_login_items_settings",
            "get_overlay_view",
        ])),
    )
    .expect("tauri-build thất bại");
}
```

Thay toàn bộ `src-tauri/capabilities/main.json` (QĐ5):

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main",
  "description": "Cửa sổ chính: đúng các lệnh của màn hình ở §4.3, nghe sự kiện, và phóng to chữ bằng ⌘+/Ctrl+ (spec §6.10, §10.2). Không cấp lệnh của plugin nào khác.",
  "windows": ["main"],
  "permissions": [
    "allow-get-settings",
    "allow-update-settings",
    "allow-set-hotkey",
    "allow-get-app-status",
    "allow-toggle-session",
    "allow-set-overlay-visible",
    "allow-set-overlay-locked",
    "allow-get-app-info",
    "allow-open-log-dir",
    "allow-open-taskbar-settings",
    "allow-open-login-items-settings",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:webview:allow-set-webview-zoom"
  ]
}
```

Thay toàn bộ `src-tauri/capabilities/overlay.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "overlay",
  "description": "Thanh phụ đề: chỉ đọc phần cài đặt của nó, nghe sự kiện và kéo cửa sổ của chính nó (spec §10.2).",
  "windows": ["overlay"],
  "permissions": [
    "allow-get-overlay-view",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
    "core:window:allow-start-dragging"
  ]
}
```

Thay toàn bộ `src-tauri/tauri.conf.json`.
- `productName` là "AI Translator", `identifier` là `com.aitranslator.desktop` (QĐ29). Thư mục cài đặt và log, "service" của kho khóa, tên của single instance đều lấy theo identifier; tên cửa sổ chính, chú thích ở khay, menu app trên Mac lấy theo `productName`. Tên crate và tên binary vẫn là `meeting-translator`.
- So với S5, file không còn khai cửa sổ nào. Cửa sổ chính tạo ở `window::create_main`: tên lấy theo `productName` ("AI Translator"), 960×640, nhỏ nhất 720×480, ẩn lúc tạo (phía Rust hiện sau khi xử lý xong trường hợp mở lúc đăng nhập).
- Phóng to chữ bằng `⌘+`/`⌘-`/`⌘0` (Mac) và `Ctrl +`/`-`/`0` (Windows) nhờ `zoom_hotkeys_enabled` (§6.10). Trên macOS cần quyền `core:webview:allow-set-webview-zoom` ở `main.json` (QĐ5).
- CSP giữ nguyên.
- Bản phát hành không có devtools, vì không bật feature `devtools` của `tauri` (§10.2).

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "AI Translator",
  "version": "0.1.0",
  "identifier": "com.aitranslator.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "app": {
    "macOSPrivateApi": true,
    "windows": [],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": false,
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

- [ ] **Step 16: Chạy test, thấy qua**

Run: `cargo test -p meeting-translator`
Expected (lúc lập kế hoạch):
```text
running 89 tests
test result: ok. 87 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.01s
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
running 0 tests
test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s
```
Khối đầu là test của lib. Hai test bỏ qua là `os_keystore_roundtrip` và `system_reports_missing_agent`. Hai khối sau là binary `main.rs` và doc-test.

- [ ] **Step 17: Kiểm chéo rằng test bắt được lỗi.** Lần lượt cấp thêm cho `main` ba quyền nhạy cảm, thêm khóa `remote` vào `main.json`, cấp cho `overlay` lệnh `open_login_items_settings`, rồi thêm một file capability thứ ba; mỗi lần chạy test ACL. Sau đó sửa `actions.rs` hai cách (bỏ bước hỏi lại `is_registered()` sau khi tắt; bỏ lời gọi `enable()`), mỗi lần chạy test tắt khởi động cùng hệ thống. Mỗi lần xong thì trả file về như cũ.

Chỉ chạy bước này khi `test_support::mock_app` đã cài bản giả `FakeSystem` (Step 1). Khi đó lệnh mở ra ngoài app, nếu lỡ tới handler, chỉ đi tới bản giả; không có gì mở trên màn hình (QĐ28).

Run:
```bash
cp src-tauri/capabilities/main.json "${TMPDIR:-/tmp}/main.json.bak"
for perm in core:window:allow-set-position store:allow-set core:webview:allow-create-webview-window; do
  python3 -c '
import json, sys; p = "src-tauri/capabilities/main.json"; c = json.load(open(p)); c["permissions"].append(sys.argv[1]); open(p, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")' "$perm"
  echo "=== $perm"
  cargo test -p meeting-translator --lib acl_tests 2>&1 | grep -E "panicked|không được gọi|test result"
  cp "${TMPDIR:-/tmp}/main.json.bak" src-tauri/capabilities/main.json
done
python3 -c '
import json; p = "src-tauri/capabilities/main.json"; c = json.load(open(p)); c["remote"] = {"urls": ["https://*"]}; open(p, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")'
echo "=== remote"
cargo test -p meeting-translator --lib acl_tests 2>&1 | grep -E "panicked|khóa đã biết|test result"
cp "${TMPDIR:-/tmp}/main.json.bak" src-tauri/capabilities/main.json
cp src-tauri/capabilities/overlay.json "${TMPDIR:-/tmp}/overlay.json.bak"
python3 -c '
import json; p = "src-tauri/capabilities/overlay.json"; c = json.load(open(p)); c["permissions"].append("allow-open-login-items-settings"); open(p, "w").write(json.dumps(c, indent=2, ensure_ascii=False) + "\n")'
echo "=== overlay: allow-open-login-items-settings"
cargo test -p meeting-translator --lib acl_tests 2>&1 | grep -E "panicked|không được gọi|test result"
cp "${TMPDIR:-/tmp}/overlay.json.bak" src-tauri/capabilities/overlay.json
printf '%s\n' '{' '  "identifier": "extra",' '  "windows": ["main"],' '  "permissions": ["core:window:allow-set-position"]' '}' > src-tauri/capabilities/extra.json
echo "=== extra.json"
cargo test -p meeting-translator --lib acl_tests 2>&1 | grep -E "panicked|không được gọi|không có capability|test result"
rm src-tauri/capabilities/extra.json
echo "=== trả lại"
cargo test -p meeting-translator --lib acl_tests 2>&1 | grep -E "test result"
cp src-tauri/src/actions.rs "${TMPDIR:-/tmp}/actions.rs.bak"
python3 -c '
p = "src-tauri/src/actions.rs"; s = open(p).read(); s = s.replace("if !enabled && items.0.is_registered().unwrap_or(false) {", "if false {"); open(p, "w").write(s)'
echo "=== actions.rs: bỏ kiểm is_registered() sau khi tắt"
cargo test -p meeting-translator --lib app_tests::turning_off 2>&1 | grep -E "panicked|unwrap_err|test result"
cp "${TMPDIR:-/tmp}/actions.rs.bak" src-tauri/src/actions.rs
python3 -c '
p = "src-tauri/src/actions.rs"; s = open(p).read(); s = s.replace("items.0.enable()", "Ok(())"); open(p, "w").write(s)'
echo "=== actions.rs: bỏ lời gọi enable()"
cargo test -p meeting-translator --lib app_tests::turning_off 2>&1 | grep -E "panicked|bật thì|test result"
cp "${TMPDIR:-/tmp}/actions.rs.bak" src-tauri/src/actions.rs
echo "=== trả lại actions.rs"
cargo test -p meeting-translator --lib app_tests::turning_off 2>&1 | grep -E "test result"
```
Expected (lúc lập kế hoạch):
- mỗi lần có quyền thừa, cả hai test ACL đều hỏng: danh sách cố định lệch, và lệnh nhạy cảm đi tới được handler (lỗi chỉ còn là thiếu tham số, hoặc plugin chưa đăng ký trong app giả);
- có khóa `remote` thì test tĩnh hỏng vì file có khóa lạ; test lúc chạy vẫn qua, vì `remote` chỉ cấp quyền cho trang web ngoài, mà test gọi lệnh từ `tauri://localhost`;
- overlay được cấp `open_login_items_settings` thì cả ba test hỏng; lệnh tới handler và trả `Ok(Null)` từ bản giả, System Settings không mở;
- bỏ bước hỏi lại `is_registered()` thì lần tắt cuối trả `Ok` thay vì lỗi `autostartStillEnabled`; bỏ `enable()` thì test hỏng ngay ở bước bật (QĐ16);
- trả file về thì xanh lại.
- Các test chạy song song, nên thứ tự các dòng `panicked` trong cùng một lần chạy có thể khác giữa các lần (ví dụ ở `extra.json`).

```text
=== core:window:allow-set-position
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:90:5:
thread 'acl_tests::each_window_only_reaches_its_own_commands' (…) panicked at src-tauri/src/acl_tests.rs:149:13:
main không được gọi plugin:window|set_position: Err("\"invalid args `value` for command `set_position`: command set_position missing required key value\"")
test result: FAILED. 1 passed; 2 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== store:allow-set
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:90:5:
thread 'acl_tests::each_window_only_reaches_its_own_commands' (…) panicked at src-tauri/src/acl_tests.rs:149:13:
main không được gọi plugin:store|set: Err("\"plugin store not found\"")
test result: FAILED. 1 passed; 2 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== core:webview:allow-create-webview-window
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:90:5:
thread 'acl_tests::each_window_only_reaches_its_own_commands' (…) panicked at src-tauri/src/acl_tests.rs:149:13:
main không được gọi plugin:webview|create_webview_window: Err("\"invalid args `options` for command `create_webview_window`: command create_webview_window missing required key options\"")
test result: FAILED. 1 passed; 2 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== remote
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:71:5:
assertion `left == right` failed: capability main chỉ có các khóa đã biết
test result: FAILED. 2 passed; 1 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.03s
=== overlay: allow-open-login-items-settings
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:94:5:
thread 'acl_tests::outside_effects_only_reach_the_fake_opener' (…) panicked at src-tauri/src/acl_tests.rs:164:9:
overlay không được gọi open_login_items_settings: Ok(Null)
thread 'acl_tests::each_window_only_reaches_its_own_commands' (…) panicked at src-tauri/src/acl_tests.rs:133:9:
overlay không được gọi open_login_items_settings: Ok(Null)
test result: FAILED. 0 passed; 3 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== extra.json
thread 'acl_tests::capabilities_grant_exactly_the_fixed_lists' (…) panicked at src-tauri/src/acl_tests.rs:105:5:
assertion `left == right` failed: không có capability nào khác
thread 'acl_tests::each_window_only_reaches_its_own_commands' (…) panicked at src-tauri/src/acl_tests.rs:149:13:
main không được gọi plugin:window|set_position: Err("\"invalid args `value` for command `set_position`: command set_position missing required key value\"")
test result: FAILED. 1 passed; 2 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== trả lại
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 86 filtered out; finished in 0.01s
=== actions.rs: bỏ kiểm is_registered() sau khi tắt
thread 'app_tests::turning_off_launch_at_login_works_and_reports_when_it_stays_on' (…) panicked at src-tauri/src/app_tests.rs:108:98:
called `Result::unwrap_err()` on an `Ok` value: Object {"audioSource": Object {"kind": String("system")}, "experimental": Object {"translationContext": Bool(false)}, "hotkeys": Object {"toggleLock": String("Ctrl+Alt+L"), "toggleOverlay": String("Ctrl+Alt+H"), "toggleSession": String("Ctrl+Alt+T")}, "launchAtLogin": Bool(false), "modelTier": Null, "onboardingDone": Bool(false), "overlay": Object {"fontSize": Number(22), "lastMonitor": Null, "lines": Number(2), "locked": Bool(false), "opacity": Number(0.6), "positions": Object {}, "showSource": Bool(false)}, "saveHistory": Bool(false), "sourceLanguages": Array [String("en"), String("zh"), String("ja"), String("ko"), String("vi")], "sourceLock": Null, "targetLanguage": String("vi"), "theme": String("system"), "uiLanguage": String("vi"), "updateChannel": String("stable"), "vadEndSilenceMs": Number(300)}
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 88 filtered out; finished in 0.00s
=== actions.rs: bỏ lời gọi enable()
thread 'app_tests::turning_off_launch_at_login_works_and_reports_when_it_stays_on' (…) panicked at src-tauri/src/app_tests.rs:101:5:
bật thì gọi `enable()`
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 88 filtered out; finished in 0.00s
=== trả lại actions.rs
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 88 filtered out; finished in 0.00s
```

- [ ] **Step 18: clippy, định dạng, và build cả hai kiểu**

Run:
```bash
cargo clippy -p meeting-translator --all-targets -- -D warnings
cargo fmt --all -- --check
pnpm build
CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16 cargo build --release -p meeting-translator
```
Expected: không lỗi, không cảnh báo.
- Bản release nhúng `dist/`, nên phải chạy `pnpm build` trước.
- Tắt LTO chỉ để build nhanh hơn, không đổi hành vi cửa sổ. Lúc lập kế hoạch, lần build release đầu tiên (chưa có thư viện release nào trong `target/`) mất khoảng 1 phút (``Finished `release` profile [optimized] target(s) in 1m 09s``); lúc máy đang bận build việc khác thì tới gần 3 phút.
- Không chạy binary vừa build.

- [ ] **Step 19: Commit**

```bash
git add src-tauri scripts/make_tray_icon.py
git commit -m "feat(app): khung app thật: lệnh và quyền từng cửa sổ, khay, phím tắt, đóng xuống khay, chặn ⌘Q, chặn điều hướng, single instance, khởi động cùng hệ thống, log" -m "Thanh phụ đề giữ cách tạo của S5 (NSPanel non-activating, topmost trên Windows), ẩn lúc khởi động và hiện khi bắt đầu phiên, thêm khóa và ẩn/hiện từ khay, nhớ vị trí theo từng màn hình. Phiên dịch còn là phiên tạm; kế hoạch 02 nối pipeline." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 18: Kiểu dữ liệu IPC và store Zustand của cửa sổ chính (TDD)

**Files:**
- Create: `src/lib/ipc.ts`, `src/lib/fakeIpc.ts`, `src/store/app.test.ts`, `src/store/app.ts`

§6.10: store Zustand đăng ký nhận sự kiện.
- Store giữ bản sao cài đặt và trạng thái do phía Rust gửi.
- Mọi thay đổi đi qua lệnh `invoke`, và store chỉ cập nhật theo kết quả phía Rust trả về.
- `ipc.ts` phải khớp kiểu ở `settings/mod.rs`, `state.rs`, `commands.rs`, `events.rs` của Task 17.
- `toggle_session` trả lỗi như mọi lệnh khác (QĐ25).
- Lời nhắc `app://notice` vào `notice` của store (QĐ12). Lời nhắc `loginItemsApproval` có nút gọi `open_login_items_settings`; bấm rồi thì lời nhắc đóng (QĐ16).
- `canOpenScreens`: chưa xong các bước lần đầu mở thì `false`, để thanh báo không có nút đưa tới màn hình khác (QĐ12).

- [ ] **Step 1: Tạo `src/lib/ipc.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UiLanguage } from "../i18n";

// Kiểu dữ liệu và tên lệnh, tên sự kiện giữa giao diện và lõi Rust (spec §6.10).
// Phía Rust là nơi quyết định: kiểu ở đây phải khớp `src-tauri/src/settings/mod.rs`, `state.rs`,
// `commands.rs` và `events.rs`.

export type Lang = "en" | "zh" | "ja" | "ko" | "vi";
export const LANGS: readonly Lang[] = ["en", "zh", "ja", "ko", "vi"];

export type AudioSource = { kind: "system" } | { kind: "device"; id: string } | { kind: "app"; bundleId: string };
export type Theme = "system" | "light" | "dark";
export type UpdateChannel = "stable" | "beta";
export type ModelTier = "standard" | "lite";
export type HotkeyAction = "toggleSession" | "toggleOverlay" | "toggleLock";
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = ["toggleSession", "toggleOverlay", "toggleLock"];

export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
  // Lần cuối thanh phụ đề nằm trên màn hình này (giây Unix).
  lastUsed: number;
}

export interface Settings {
  uiLanguage: UiLanguage;
  targetLanguage: Lang;
  sourceLanguages: Lang[];
  sourceLock: Lang | null;
  audioSource: AudioSource;
  vadEndSilenceMs: number;
  overlay: {
    fontSize: number;
    lines: number;
    opacity: number;
    showSource: boolean;
    locked: boolean;
    positions: Record<string, OverlayRect>;
    lastMonitor: string | null;
  };
  modelTier: ModelTier | null;
  hotkeys: Record<HotkeyAction, string>;
  saveHistory: boolean;
  launchAtLogin: boolean;
  theme: Theme;
  updateChannel: UpdateChannel;
  experimental: { translationContext: boolean };
  onboardingDone: boolean;
}

// Bản sửa gửi cho `update_settings`. Không có `hotkeys` (dùng `set_hotkey`), `overlay.locked`
// (dùng `set_overlay_locked`), `overlay.positions` và `overlay.lastMonitor` (chỉ phía Rust ghi).
export type SettingsPatch = Partial<Omit<Settings, "hotkeys" | "overlay" | "experimental">> & {
  overlay?: Partial<Omit<Settings["overlay"], "locked" | "positions" | "lastMonitor">>;
  experimental?: Partial<Settings["experimental"]>;
};

export type SessionStatus = "idle" | "running";

export interface AppStatus {
  session: SessionStatus;
  overlayVisible: boolean;
  hotkeyFailures: HotkeyAction[];
}

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
  platform: "macos" | "windows";
  launchedAtLogin: boolean;
}

export interface OverlayView {
  uiLanguage: UiLanguage;
  fontSize: number;
  lines: number;
  opacity: number;
  showSource: boolean;
  locked: boolean;
}

// Phụ đề (spec §6.6). Kế hoạch 02 phát đủ các trạng thái; kế hoạch 01 chỉ phát phụ đề mẫu.
export interface Subtitle {
  id: number;
  start_ms: number;
  end_ms: number;
  src_lang: string;
  src_text: string;
  tgt_text: string;
  status: "asr_done" | "translating" | "done" | "failed" | "same_lang" | "skipped" | "dropped";
  provisional: boolean;
}

export type Screen = "home" | "transcript" | "history" | "glossary" | "settings" | "upgrade" | "about";
export type SettingsGroup = "general" | "subtitles" | "audio" | "model" | "hotkeys" | "license" | "privacy";

export interface Navigate {
  screen: Screen;
  settingsGroup: SettingsGroup | null;
}

// Lời nhắc trong app do phía Rust gửi (`events::Notice`).
export type AppNotice = { kind: "quitFromTray" } | { kind: "loginItemsApproval" };

// Lỗi phía Rust trả về (`CommandError`).
export interface CommandError {
  code: string;
  field: string | null;
  message: string;
}

export interface Commands {
  get_settings: { args: undefined; result: Settings };
  update_settings: { args: { patch: SettingsPatch }; result: Settings };
  set_hotkey: { args: { action: HotkeyAction; accelerator: string }; result: Settings };
  get_app_status: { args: undefined; result: AppStatus };
  // Lỗi (ví dụ không hiện được thanh phụ đề) thì `invoke` reject với `CommandError`.
  toggle_session: { args: undefined; result: AppStatus };
  set_overlay_visible: { args: { visible: boolean }; result: AppStatus };
  set_overlay_locked: { args: { locked: boolean }; result: Settings };
  get_app_info: { args: undefined; result: AppInfo };
  open_log_dir: { args: undefined; result: null };
  open_taskbar_settings: { args: undefined; result: null };
  open_login_items_settings: { args: undefined; result: null };
  get_overlay_view: { args: undefined; result: OverlayView };
}

export interface Events {
  "settings://changed": Settings;
  "app://status": AppStatus;
  "app://navigate": Navigate;
  "app://notice": AppNotice;
  "overlay://view": OverlayView;
  "subtitle://upsert": Subtitle;
}

export type Command = keyof Commands;
export type EventName = keyof Events;

// Lớp mỏng quanh `invoke` và `listen`, để store test được với bản giả.
export interface Ipc {
  invoke<C extends Command>(cmd: C, args?: Commands[C]["args"]): Promise<Commands[C]["result"]>;
  listen<E extends EventName>(event: E, handler: (payload: Events[E]) => void): Promise<() => void>;
}

export const tauriIpc: Ipc = {
  invoke: (cmd, args) => invoke(cmd, args),
  listen: (event, handler) => listen(event, (e) => handler(e.payload as never)),
};
```

- [ ] **Step 2: Tạo bản giả `src/lib/fakeIpc.ts`** (chỉ dùng trong test)

```ts
import type { Command, Commands, EventName, Events, Ipc } from "./ipc";

// Bản giả của `Ipc` cho test: trả kết quả theo bảng `handlers`, ghi lại các lệnh đã gọi, và cho
// test tự phát sự kiện như phía Rust. Chỉ dùng trong file *.test.ts.
type Handlers = { [C in Command]?: (args: Commands[C]["args"]) => Commands[C]["result"] | Promise<Commands[C]["result"]> };

export function fakeIpc(handlers: Handlers) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const calls: { cmd: Command; args: unknown }[] = [];
  const ipc: Ipc = {
    async invoke(cmd, args) {
      calls.push({ cmd, args });
      const handler = handlers[cmd] as ((a: unknown) => unknown) | undefined;
      if (!handler) throw `Command ${cmd} not allowed by ACL`;
      return (await handler(args)) as never;
    },
    async listen(event, handler) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler as (payload: unknown) => void);
      listeners.set(event, set);
      return () => set.delete(handler as (payload: unknown) => void);
    },
  };
  return {
    ipc,
    calls,
    emit<E extends EventName>(event: E, payload: Events[E]) {
      listeners.get(event)?.forEach((h) => h(payload));
    },
    listenerCount(event: EventName) {
      return listeners.get(event)?.size ?? 0;
    },
  };
}
```

- [ ] **Step 3: Viết test trước.** Tạo `src/store/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { AppInfo, AppStatus, Settings } from "../lib/ipc";
import { canOpenScreens, createAppStore, toUiError } from "./app";

const settings: Settings = {
  uiLanguage: "vi",
  targetLanguage: "vi",
  sourceLanguages: ["en", "zh", "ja", "ko", "vi"],
  sourceLock: null,
  audioSource: { kind: "system" },
  vadEndSilenceMs: 300,
  overlay: { fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false, positions: {}, lastMonitor: null },
  modelTier: null,
  hotkeys: { toggleSession: "Ctrl+Alt+T", toggleOverlay: "Ctrl+Alt+H", toggleLock: "Ctrl+Alt+L" },
  saveHistory: false,
  launchAtLogin: false,
  theme: "system",
  updateChannel: "stable",
  experimental: { translationContext: false },
  onboardingDone: false,
};
const status: AppStatus = { session: "idle", overlayVisible: true, hotkeyFailures: [] };
const info: AppInfo = {
  name: "AI Translator",
  version: "0.1.0",
  identifier: "com.aitranslator.desktop",
  platform: "macos",
  launchedAtLogin: false,
};

let failToggle = false;

function setup() {
  failToggle = false;
  const fake = fakeIpc({
    get_settings: () => settings,
    get_app_status: () => status,
    get_app_info: () => info,
    update_settings: ({ patch }) => {
      if (patch.vadEndSilenceMs === 900) throw { code: "outOfRange", field: "vadEndSilenceMs", message: "…" };
      return { ...settings, ...patch } as Settings;
    },
    set_hotkey: ({ action, accelerator }) => {
      if (accelerator === "Ctrl+Alt+KeyH") throw { code: "hotkeyDuplicate", field: action, message: "…" };
      return { ...settings, hotkeys: { ...settings.hotkeys, [action]: accelerator.replace("Key", "") } };
    },
    toggle_session: () => {
      if (failToggle) throw { code: "overlayFailed", field: null, message: "…" };
      return { ...status, session: "running", overlayVisible: true };
    },
    set_overlay_locked: ({ locked }) => ({ ...settings, overlay: { ...settings.overlay, locked } }),
    open_login_items_settings: () => null,
  });
  return { fake, store: createAppStore(fake.ipc) };
}

describe("app store", () => {
  it("init đọc cài đặt, trạng thái, thông tin app và nghe bốn sự kiện", async () => {
    const { fake, store } = setup();
    const off = await store.getState().init();
    expect(store.getState().settings).toEqual(settings);
    expect(store.getState().status).toEqual(status);
    expect(store.getState().info?.platform).toBe("macos");
    expect(fake.listenerCount("settings://changed")).toBe(1);
    expect(fake.listenerCount("app://status")).toBe(1);
    expect(fake.listenerCount("app://navigate")).toBe(1);
    expect(fake.listenerCount("app://notice")).toBe(1);
    off();
    expect(fake.listenerCount("settings://changed")).toBe(0);
  });

  it("sự kiện từ phía Rust cập nhật store (khay, phím tắt đổi trạng thái)", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://status", { ...status, session: "running", hotkeyFailures: ["toggleLock"] });
    expect(store.getState().status?.session).toBe("running");
    expect(store.getState().status?.hotkeyFailures).toEqual(["toggleLock"]);
    fake.emit("settings://changed", { ...settings, uiLanguage: "en" });
    expect(store.getState().settings?.uiLanguage).toBe("en");
    fake.emit("app://navigate", { screen: "settings", settingsGroup: "hotkeys" });
    expect(store.getState().screen).toBe("settings");
    expect(store.getState().settingsGroup).toBe("hotkeys");
  });

  it("updateSettings gửi bản sửa và lấy cài đặt phía Rust trả về", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    expect(await store.getState().updateSettings({ theme: "dark" })).toBe(true);
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { theme: "dark" } } });
    expect(store.getState().settings?.theme).toBe("dark");
    expect(store.getState().error).toBeNull();
  });

  it("giá trị bị phía Rust từ chối thì báo lỗi, cài đặt giữ nguyên", async () => {
    const { store } = setup();
    await store.getState().init();
    expect(await store.getState().updateSettings({ vadEndSilenceMs: 900 })).toBe(false);
    expect(store.getState().error).toEqual({ code: "outOfRange", field: "vadEndSilenceMs" });
    expect(store.getState().settings?.vadEndSilenceMs).toBe(300);
    store.getState().dismissError();
    expect(store.getState().error).toBeNull();
  });

  it("setHotkey trả lỗi cho ô đang sửa, không bật thanh báo lỗi chung", async () => {
    const { store } = setup();
    await store.getState().init();
    expect(await store.getState().setHotkey("toggleLock", "Ctrl+Alt+KeyH")).toEqual({
      code: "hotkeyDuplicate",
      field: "toggleLock",
    });
    expect(store.getState().error).toBeNull();
    expect(await store.getState().setHotkey("toggleLock", "Ctrl+Alt+KeyK")).toBeNull();
    expect(store.getState().settings?.hotkeys.toggleLock).toBe("Ctrl+Alt+K");
  });

  it("bắt đầu/dừng và khóa phụ đề lấy trạng thái từ kết quả", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().toggleSession();
    expect(store.getState().status?.session).toBe("running");
    expect(store.getState().status?.overlayVisible).toBe(true);
    await store.getState().setOverlayLocked(true);
    expect(store.getState().settings?.overlay.locked).toBe(true);
  });

  it("bắt đầu phiên lỗi thì báo lỗi, trạng thái giữ nguyên", async () => {
    const { store } = setup();
    await store.getState().init();
    failToggle = true;
    await store.getState().toggleSession();
    expect(store.getState().error).toEqual({ code: "overlayFailed", field: null });
    expect(store.getState().status?.session).toBe("idle");
  });

  it("lời nhắc từ phía Rust hiện rồi đóng được", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://notice", { kind: "quitFromTray" });
    expect(store.getState().notice).toEqual({ kind: "quitFromTray" });
    store.getState().dismissNotice();
    expect(store.getState().notice).toBeNull();
  });

  it("lời nhắc Login Items có nút mở System Settings, bấm rồi thì đóng", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    fake.emit("app://notice", { kind: "loginItemsApproval" });
    expect(store.getState().notice).toEqual({ kind: "loginItemsApproval" });
    await store.getState().openLoginItemsSettings();
    expect(fake.calls.at(-1)).toEqual({ cmd: "open_login_items_settings", args: undefined });
    expect(store.getState().notice).toBeNull();
  });

  it("lệnh bị ACL chặn hay lỗi lạ thì ra mã unknown", async () => {
    const { store } = setup();
    await store.getState().init();
    await store.getState().openLogDir();
    expect(store.getState().error).toEqual({ code: "unknown", field: null });
    expect(toUiError(new Error("x"))).toEqual({ code: "unknown", field: null });
  });

  it("đang ở các bước lần đầu thì không có nút mở màn hình khác", async () => {
    const { store } = setup();
    expect(canOpenScreens(store.getState())).toBe(false);
    await store.getState().init();
    expect(canOpenScreens(store.getState())).toBe(false);
    await store.getState().finishOnboarding();
    expect(canOpenScreens(store.getState())).toBe(true);
  });

  it("xong các bước lần đầu thì lưu onboardingDone và về màn hình chính", async () => {
    const { fake, store } = setup();
    await store.getState().init();
    store.getState().navigate("about");
    await store.getState().finishOnboarding();
    expect(fake.calls.at(-1)).toEqual({ cmd: "update_settings", args: { patch: { onboardingDone: true } } });
    expect(store.getState().settings?.onboardingDone).toBe(true);
    expect(store.getState().screen).toBe("home");
  });
});
```

- [ ] **Step 4: Chạy test, thấy lỗi**

Run: `pnpm exec vitest run src/store/app.test.ts`
Expected: FAIL:
```text
 FAIL  src/store/app.test.ts [ src/store/app.test.ts ]
Error: Cannot find module './app' imported from /Users/dtphong/Desktop/software_business/meeting-translator/src/store/app.test.ts
 Test Files  1 failed (1)
```

- [ ] **Step 5: Tạo `src/store/app.ts`**

```ts
import { createStore } from "zustand/vanilla";
import type {
  AppInfo,
  AppNotice,
  AppStatus,
  CommandError,
  HotkeyAction,
  Ipc,
  Navigate,
  Screen,
  Settings,
  SettingsGroup,
  SettingsPatch,
} from "../lib/ipc";

// Store của cửa sổ chính (spec §6.10): giữ bản sao cài đặt và trạng thái do phía Rust gửi sang,
// nhận sự kiện để luôn khớp với menu khay và phím tắt. Mọi thay đổi đi qua lệnh `invoke`; store chỉ
// cập nhật theo kết quả phía Rust trả về, không tự đoán.

export interface UiError {
  code: string;
  field: string | null;
}

export interface AppStoreState {
  settings: Settings | null;
  status: AppStatus | null;
  info: AppInfo | null;
  screen: Screen;
  settingsGroup: SettingsGroup;
  onboardingStep: number;
  error: UiError | null;
  notice: AppNotice | null;
  init(): Promise<() => void>;
  navigate(screen: Screen, settingsGroup?: SettingsGroup | null): void;
  setOnboardingStep(step: number): void;
  updateSettings(patch: SettingsPatch): Promise<boolean>;
  setHotkey(action: HotkeyAction, accelerator: string): Promise<UiError | null>;
  toggleSession(): Promise<void>;
  setOverlayVisible(visible: boolean): Promise<void>;
  setOverlayLocked(locked: boolean): Promise<void>;
  openLogDir(): Promise<void>;
  openTaskbarSettings(): Promise<void>;
  openLoginItemsSettings(): Promise<void>;
  finishOnboarding(): Promise<void>;
  dismissError(): void;
  dismissNotice(): void;
}

// Đã xong các bước lần đầu mở chưa. Chưa xong thì `App` chỉ hiện `Onboarding`, nên đổi `screen` không có
// tác dụng gì; nút đưa tới một màn hình (ví dụ "Mở cài đặt" ở thanh báo phím tắt lỗi) phải ẩn đi.
export function canOpenScreens(state: Pick<AppStoreState, "settings">): boolean {
  return state.settings?.onboardingDone === true;
}

// Lỗi từ `invoke`: `CommandError` của app, hoặc chuỗi lỗi của Tauri (sai tham số, bị ACL chặn).
export function toUiError(e: unknown): UiError {
  if (typeof e === "object" && e !== null && typeof (e as CommandError).code === "string") {
    const { code, field } = e as CommandError;
    return { code, field: field ?? null };
  }
  return { code: "unknown", field: null };
}

export function createAppStore(ipc: Ipc) {
  return createStore<AppStoreState>()((set, get) => {
    // Chạy một lệnh; lỗi thì hiện ở thanh báo lỗi của cửa sổ chính.
    async function run<T>(call: () => Promise<T>, apply: (result: T) => void): Promise<boolean> {
      try {
        apply(await call());
        return true;
      } catch (e) {
        set({ error: toUiError(e) });
        return false;
      }
    }

    return {
      settings: null,
      status: null,
      info: null,
      screen: "home",
      settingsGroup: "general",
      onboardingStep: 0,
      error: null,
      notice: null,

      async init() {
        const offs = await Promise.all([
          ipc.listen("settings://changed", (settings) => set({ settings })),
          ipc.listen("app://status", (status) => set({ status })),
          ipc.listen("app://navigate", (target: Navigate) => get().navigate(target.screen, target.settingsGroup)),
          ipc.listen("app://notice", (notice) => set({ notice })),
        ]);
        const [settings, status, info] = await Promise.all([
          ipc.invoke("get_settings"),
          ipc.invoke("get_app_status"),
          ipc.invoke("get_app_info"),
        ]);
        set({ settings, status, info });
        return () => offs.forEach((off) => off());
      },

      navigate(screen, settingsGroup) {
        set(settingsGroup ? { screen, settingsGroup } : { screen });
      },

      setOnboardingStep(onboardingStep) {
        set({ onboardingStep });
      },

      updateSettings(patch) {
        return run(
          () => ipc.invoke("update_settings", { patch }),
          (settings) => set({ settings }),
        );
      },

      async setHotkey(action, accelerator) {
        try {
          set({ settings: await ipc.invoke("set_hotkey", { action, accelerator }) });
          return null;
        } catch (e) {
          return toUiError(e);
        }
      },

      async toggleSession() {
        await run(
          () => ipc.invoke("toggle_session"),
          (status) => set({ status }),
        );
      },

      async setOverlayVisible(visible) {
        await run(
          () => ipc.invoke("set_overlay_visible", { visible }),
          (status) => set({ status }),
        );
      },

      async setOverlayLocked(locked) {
        await run(
          () => ipc.invoke("set_overlay_locked", { locked }),
          (settings) => set({ settings }),
        );
      },

      async openLogDir() {
        await run(
          () => ipc.invoke("open_log_dir"),
          () => {},
        );
      },

      async openTaskbarSettings() {
        await run(
          () => ipc.invoke("open_taskbar_settings"),
          () => {},
        );
      },

      // macOS: mở System Settings › Login Items từ lời nhắc `loginItemsApproval`, rồi đóng lời nhắc.
      async openLoginItemsSettings() {
        await run(
          () => ipc.invoke("open_login_items_settings"),
          () => set({ notice: null }),
        );
      },

      async finishOnboarding() {
        if (await get().updateSettings({ onboardingDone: true })) set({ screen: "home" });
      },

      dismissError() {
        set({ error: null });
      },

      dismissNotice() {
        set({ notice: null });
      },
    };
  });
}

export type AppStore = ReturnType<typeof createAppStore>;
```

- [ ] **Step 6: Chạy test và kiểm kiểu**

Run: `pnpm exec vitest run src/store/app.test.ts && pnpm exec tsc --noEmit`
Expected: `Test Files  1 passed (1)`, `Tests  12 passed (12)`; `tsc` không in gì và trả mã 0. Vitest không kiểm kiểu, nên cần `tsc` để bắt chỗ `ipc.ts` lệch với store.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ipc.ts src/lib/fakeIpc.ts src/store/app.ts src/store/app.test.ts
git commit -m "feat(ui): kiểu IPC và store Zustand của cửa sổ chính nhận sự kiện từ lõi Rust" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 19: Ghi và hiển thị phím tắt ở giao diện (TDD)

**Files:**
- Create: `src/lib/hotkeys.test.ts`, `src/lib/hotkeys.ts`

Ô đổi phím tắt ghi tổ hợp theo `KeyboardEvent.code` (không phụ thuộc bố cục bàn phím) và gửi cho phía Rust. Phía Rust chuẩn hóa về `Ctrl+Alt+T` và kiểm (Task 2). Hiển thị theo thói quen của từng hệ điều hành: `⌃⌥T` trên Mac, `Ctrl+Alt+T` trên Windows.

- [ ] **Step 1: Viết test trước.** Tạo `src/lib/hotkeys.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { acceleratorFromEvent, formatAccelerator } from "./hotkeys";

const key = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
  metaKey: mods.meta ?? false,
});

describe("acceleratorFromEvent", () => {
  it("ghép phím bổ trợ theo thứ tự Ctrl, Alt, Shift, Super rồi tới mã phím", () => {
    expect(acceleratorFromEvent(key("KeyT", { ctrl: true, alt: true }))).toBe("Ctrl+Alt+KeyT");
    expect(acceleratorFromEvent(key("Digit1", { meta: true, shift: true }))).toBe("Shift+Super+Digit1");
    expect(acceleratorFromEvent(key("F10", { alt: true }))).toBe("Alt+F10");
  });

  it("chờ phím chính khi mới bấm phím bổ trợ", () => {
    expect(acceleratorFromEvent(key("ControlLeft", { ctrl: true }))).toBeNull();
    expect(acceleratorFromEvent(key("MetaRight", { meta: true }))).toBeNull();
    expect(acceleratorFromEvent(key(""))).toBeNull();
  });

  it("không có phím bổ trợ vẫn trả về, để phía Rust báo lỗi", () => {
    expect(acceleratorFromEvent(key("KeyT"))).toBe("KeyT");
  });
});

describe("formatAccelerator", () => {
  it("macOS dùng ký hiệu", () => {
    expect(formatAccelerator("Ctrl+Alt+T", "macos")).toBe("⌃⌥T");
    expect(formatAccelerator("Shift+Super+1", "macos")).toBe("⇧⌘1");
  });

  it("Windows dùng tên phím", () => {
    expect(formatAccelerator("Ctrl+Alt+T", "windows")).toBe("Ctrl+Alt+T");
    expect(formatAccelerator("Shift+Super+F10", "windows")).toBe("Shift+Win+F10");
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `pnpm exec vitest run src/lib/hotkeys.test.ts`
Expected: FAIL:
```text
 FAIL  src/lib/hotkeys.test.ts [ src/lib/hotkeys.test.ts ]
Error: Cannot find module './hotkeys' imported from /Users/dtphong/Desktop/software_business/meeting-translator/src/lib/hotkeys.test.ts
 Test Files  1 failed (1)
```

- [ ] **Step 3: Tạo `src/lib/hotkeys.ts`**

```ts
// Ghi và hiển thị phím tắt ở nhóm Cài đặt "Phím tắt" (F10). Phía Rust đọc lại, chuẩn hóa về dạng
// "Ctrl+Alt+T" và kiểm hợp lệ, trùng, đăng ký được hay không (`src-tauri/src/hotkeys.rs`).

export interface KeyInput {
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "ShiftLeft",
  "ShiftRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
]);

// Chuỗi phím tắt từ một lần bấm phím, theo `KeyboardEvent.code` (không phụ thuộc bố cục bàn phím).
// Trả `null` khi mới chỉ bấm phím bổ trợ.
export function acceleratorFromEvent(e: KeyInput): string | null {
  if (MODIFIER_CODES.has(e.code) || e.code === "") return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  parts.push(e.code);
  return parts.join("+");
}

const MAC_SYMBOLS: Record<string, string> = { Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Super: "⌘" };
const WINDOWS_NAMES: Record<string, string> = { Ctrl: "Ctrl", Alt: "Alt", Shift: "Shift", Super: "Win" };

// Hiển thị phím tắt dạng chuẩn: macOS "⌃⌥T", Windows "Ctrl+Alt+T".
export function formatAccelerator(accelerator: string, platform: "macos" | "windows"): string {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  if (platform === "macos") return parts.map((m) => MAC_SYMBOLS[m] ?? m).join("") + key;
  return [...parts.map((m) => WINDOWS_NAMES[m] ?? m), key].join("+");
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `pnpm exec vitest run src/lib/hotkeys.test.ts`
Expected: `Test Files  1 passed (1)`, `Tests  5 passed (5)`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hotkeys.ts src/lib/hotkeys.test.ts
git commit -m "feat(ui): ghi phím tắt theo mã phím, hiển thị theo kiểu macOS và Windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 20: Store của thanh phụ đề (TDD)

**Files:**
- Create: `src/store/overlay.test.ts`, `src/store/overlay.ts`

Thanh phụ đề chỉ gọi `get_overlay_view` và nghe `overlay://view`, `subtitle://upsert` (QĐ5).
- Luật cập nhật dòng giữ như S5: phụ đề cùng `id` (phụ đề tạm được thay, §6.3) cập nhật tại chỗ, dòng mới thêm vào cuối, chỉ giữ số dòng theo cài đặt.
- Kế hoạch 03 làm đủ phần hiển thị.

- [ ] **Step 1: Viết test trước.** Tạo `src/store/overlay.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { fakeIpc } from "../lib/fakeIpc";
import type { OverlayView, Subtitle } from "../lib/ipc";
import { createOverlayStore, upsertLine } from "./overlay";

const sub = (id: number, tgt: string, provisional = false): Subtitle => ({
  id,
  start_ms: id * 1000,
  end_ms: id * 1000 + 800,
  src_lang: "en",
  src_text: `src ${id}`,
  tgt_text: tgt,
  status: "done",
  provisional,
});

const view: OverlayView = { uiLanguage: "vi", fontSize: 22, lines: 2, opacity: 0.6, showSource: false, locked: false };

describe("upsertLine", () => {
  it("thêm dòng mới vào cuối, giữ tối đa max dòng", () => {
    const lines = [sub(1, "a"), sub(2, "b")];
    expect(upsertLine(lines, sub(3, "c"), 2).map((l) => l.id)).toEqual([2, 3]);
  });

  it("phụ đề tạm cùng id được thay tại chỗ", () => {
    const lines = [sub(1, "a"), sub(2, "b", true)];
    const next = upsertLine(lines, sub(2, "b đã ghép"), 3);
    expect(next.map((l) => l.tgt_text)).toEqual(["a", "b đã ghép"]);
    expect(next[1]?.provisional).toBe(false);
  });
});

describe("overlay store", () => {
  it("đọc phần cài đặt của thanh phụ đề và nhận phụ đề qua sự kiện", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    expect(store.getState().view).toEqual(view);
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://upsert", sub(2, "hai"));
    fake.emit("subtitle://upsert", sub(3, "ba"));
    expect(store.getState().lines.map((l) => l.id)).toEqual([2, 3]);
    fake.emit("overlay://view", { ...view, lines: 1, locked: true });
    expect(store.getState().view?.locked).toBe(true);
    expect(store.getState().lines.map((l) => l.id)).toEqual([3]);
    expect(fake.calls.map((c) => c.cmd)).toEqual(["get_overlay_view"]);
  });
});
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `pnpm exec vitest run src/store/overlay.test.ts`
Expected: FAIL:
```text
 FAIL  src/store/overlay.test.ts [ src/store/overlay.test.ts ]
Error: Cannot find module './overlay' imported from /Users/dtphong/Desktop/software_business/meeting-translator/src/store/overlay.test.ts
 Test Files  1 failed (1)
```

- [ ] **Step 3: Tạo `src/store/overlay.ts`**

```ts
import { createStore } from "zustand/vanilla";
import type { Ipc, OverlayView, Subtitle } from "../lib/ipc";

// Store của thanh phụ đề. Cửa sổ `overlay` chỉ đọc được phần cài đặt của nó (`get_overlay_view`)
// và nghe sự kiện; không gọi được lệnh nào khác (spec §10.2). Kế hoạch 03 làm đủ phần hiển thị.

// Giữ tối đa `max` phụ đề gần nhất. Phụ đề cùng `id` (phụ đề tạm được thay, §6.3) cập nhật tại chỗ.
export function upsertLine(lines: readonly Subtitle[], subtitle: Subtitle, max: number): Subtitle[] {
  const i = lines.findIndex((l) => l.id === subtitle.id);
  const next = i >= 0 ? lines.map((l, j) => (j === i ? subtitle : l)) : [...lines, subtitle];
  return next.slice(-Math.max(1, max));
}

export interface OverlayStoreState {
  view: OverlayView | null;
  lines: Subtitle[];
  init(): Promise<() => void>;
}

export function createOverlayStore(ipc: Ipc) {
  return createStore<OverlayStoreState>()((set, get) => ({
    view: null,
    lines: [],
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view, lines: get().lines.slice(-view.lines) })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle, get().view?.lines ?? 3) }),
        ),
      ]);
      set({ view: await ipc.invoke("get_overlay_view") });
      return () => offs.forEach((off) => off());
    },
  }));
}
```

- [ ] **Step 4: Chạy toàn bộ test giao diện**

Run: `pnpm test`
Expected: `Test Files  4 passed (4)`, `Tests  28 passed (28)`.

- [ ] **Step 5: Commit**

```bash
git add src/store/overlay.ts src/store/overlay.test.ts
git commit -m "feat(ui): store của thanh phụ đề, chỉ đọc phần cài đặt của nó và nhận phụ đề qua sự kiện" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 21: Khung các màn hình, các bước lần đầu mở, thanh phụ đề

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/main.css`, `src/components/EmptyState.tsx`
- Create: `src/windows/main/appStore.ts`, `Notice.tsx`, `LanguagePicker.tsx`, `Shell.tsx`, `App.tsx` (trong `src/windows/main/`)
- Create: `src/windows/main/screens/{Home,Placeholders,About,SettingsScreen}.tsx`, `src/windows/main/settings/{GeneralSettings,HotkeySettings}.tsx`, `src/windows/main/onboarding/{Onboarding,TaskbarGuide}.tsx`, `src/windows/overlay/overlay.css`
- Modify (thay toàn bộ): `src/windows/main/main.tsx`, `src/windows/overlay/overlay.tsx`, `index.html`, `overlay.html`

Chỉ là khung (QĐ10): màn hình nào chưa có chức năng thì hiện trạng thái trống có chuỗi i18n. Phần do 01 làm có chức năng thật:
- màn hình chính: trạng thái, Bắt đầu/Dừng (phiên tạm), ngôn ngữ đích và tập nguồn (F2), ẩn/hiện và khóa thanh phụ đề;
- thanh báo (`Notice.tsx`): lỗi của lệnh gần nhất, lời nhắc "thoát ở menu bar", lời nhắc Login Items kèm nút mở System Settings (QĐ16), phím tắt không đăng ký được (QĐ12). Thanh báo có ở cả khung cửa sổ chính (`Shell`) lẫn các bước lần đầu mở (`Onboarding`), để khi đang ở các bước này vẫn thấy lời nhắc và lỗi. Trong các bước lần đầu mở, thanh báo phím tắt không có nút "Mở cài đặt" và nói "đổi sau khi xong các bước này" (QĐ12);
- Cài đặt, nhóm Chung (ngôn ngữ giao diện, khởi động cùng hệ thống, sáng/tối, kênh cập nhật) và nhóm Phím tắt;
- Giới thiệu: phiên bản, nút mở thư mục log, câu miễn trừ nhãn hiệu (§10.1);
- các bước lần đầu mở 1, 5, 7, 8 của §4.1. Bước 8 (ghim icon khay) trên Windows có hình minh họa tạm và nút mở cài đặt Taskbar. Bước 2, 3 (04), 4 (02, chỉ macOS) và 6 (03) là khung. Windows không có bước 4, nên ở đó chỉ có 7 bước và bước ghim icon hiện là "Bước 7/7".

CSS và CSP:
- CSP (`style-src 'self'`) chặn thẻ `<style>` và thuộc tính `style` viết trong HTML, nên mọi CSS nằm trong file `.css` do Vite đóng gói.
- Giá trị thay đổi theo cài đặt (cỡ chữ, độ mờ nền của thanh phụ đề) đặt qua prop `style` của React. React ghi qua CSSOM nên CSP không chặn.
- Cỡ chữ dùng rem để phóng to được (§6.10).

- [ ] **Step 1: Token màu và CSS.** Tạo `src/styles/tokens.css`:

```css
/* Token màu và chữ tạm của thương hiệu mới (spec §6.10, D2: không dùng nhận diện của AI Live
   Translator). Tên, logo và màu thật chờ Q1. Cỡ chữ tính bằng rem để phóng to được (⌘+ / Ctrl+). */
:root {
  --color-bg: #f5f7fa;
  --color-surface: #ffffff;
  --color-border: #d6dbe3;
  --color-text: #141821;
  --color-muted: #566072;
  --color-accent: #1d63c9;
  --color-accent-text: #ffffff;
  --color-danger: #a3261b;
  --color-danger-bg: #fdecea;
  --color-running: #127a3e;
  --radius: 0.5rem;
  --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #11141a;
    --color-surface: #1a1f28;
    --color-border: #2e3542;
    --color-text: #e8ebf0;
    --color-muted: #9aa4b5;
    --color-accent: #5b9bf0;
    --color-accent-text: #0b1220;
    --color-danger: #ff8a7f;
    --color-danger-bg: #3a1c1a;
    --color-running: #4cc38a;
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --color-bg: #11141a;
  --color-surface: #1a1f28;
  --color-border: #2e3542;
  --color-text: #e8ebf0;
  --color-muted: #9aa4b5;
  --color-accent: #5b9bf0;
  --color-accent-text: #0b1220;
  --color-danger: #ff8a7f;
  --color-danger-bg: #3a1c1a;
  --color-running: #4cc38a;
  color-scheme: dark;
}
```

Tạo `src/styles/main.css`:

```css
@import "./tokens.css";

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font);
  font-size: 1rem;
  line-height: 1.5;
  color: var(--color-text);
  background: var(--color-bg);
}

button,
select,
input {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}

button.primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

select {
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.shell {
  display: grid;
  grid-template-columns: 14rem 1fr;
  min-height: 100vh;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 0.75rem;
  border-right: 1px solid var(--color-border);
  background: var(--color-surface);
}

.nav .brand {
  font-weight: 600;
  margin: 0 0.5rem 0.75rem;
}

.nav button {
  text-align: left;
  border-color: transparent;
  background: transparent;
}

.nav button[aria-current="page"] {
  background: var(--color-bg);
  border-color: var(--color-border);
  font-weight: 600;
}

.content {
  padding: 1.5rem 2rem;
  overflow: auto;
}

.content h1 {
  font-size: 1.4rem;
  margin: 0 0 1rem;
}

.card {
  padding: 1rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-surface);
}

.card h2 {
  font-size: 1rem;
  margin: 0 0 0.75rem;
}

.row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 0.5rem 0;
}

.row > label:first-child,
.row > span:first-child {
  min-width: 14rem;
}

.hint,
.empty {
  color: var(--color-muted);
  font-size: 0.9rem;
}

.error-text {
  color: var(--color-danger);
  font-size: 0.9rem;
}

.badge {
  display: inline-block;
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  font-size: 0.85rem;
}

.badge.running {
  color: var(--color-running);
  border-color: var(--color-running);
}

.notice {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.6rem 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius);
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.notice span {
  flex: 1;
}

.tabs {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.tabs button[aria-selected="true"] {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

.checks {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

kbd {
  font-family: var(--font);
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--color-border);
  border-radius: 0.3rem;
  background: var(--color-bg);
}

.onboarding {
  max-width: 40rem;
  margin: 0 auto;
  padding: 2.5rem 1.5rem;
}

.onboarding .actions {
  display: flex;
  justify-content: space-between;
  margin-top: 2rem;
}

.taskbar-guide {
  width: 100%;
  max-width: 26rem;
  height: auto;
  color: var(--color-muted);
}
```

- [ ] **Step 2: Store của cửa sổ chính và thành phần dùng chung.** Tạo `src/windows/main/appStore.ts`:

```ts
import { useStore } from "zustand";
import { detectUiLanguage, type MessageKey, type Params, translate } from "../../i18n";
import { tauriIpc } from "../../lib/ipc";
import { type AppStoreState, createAppStore } from "../../store/app";

// Store dùng chung của cửa sổ chính, nối với lõi Rust thật.
export const appStore = createAppStore(tauriIpc);

export function useApp<T>(selector: (state: AppStoreState) => T): T {
  return useStore(appStore, selector);
}

const fallbackLanguage = detectUiLanguage(navigator.languages);

// Hàm dịch theo ngôn ngữ giao diện đang chọn; đổi ngôn ngữ thì mọi màn hình vẽ lại ngay (§4.5).
export function useT(): (key: MessageKey, params?: Params) => string {
  const lang = useApp((s) => s.settings?.uiLanguage ?? fallbackLanguage);
  return (key, params) => translate(lang, key, params);
}
```

Tạo `src/components/EmptyState.tsx`:

```tsx
// Trạng thái trống của màn hình chưa có dữ liệu hay chưa có chức năng.
export function EmptyState({ text }: { text: string }) {
  return <p className="empty">{text}</p>;
}
```

Tạo `src/windows/main/Notice.tsx` (QĐ12):

```tsx
import { errorKey } from "../../i18n";
import { canOpenScreens } from "../../store/app";
import { useApp, useT } from "./appStore";

// Thông báo trong app (Q13 của kế hoạch 00: MVP không dùng thông báo hệ thống): lời nhắc từ phía Rust
// (vừa bỏ qua ⌘Q; mục Login Items đang bị tắt), lỗi của lệnh gần nhất, và phím tắt không đăng ký được.
// Đặt ở cả khung cửa sổ chính (`Shell`) lẫn các bước lần đầu mở (`Onboarding`). Trong các bước lần đầu
// mở thì không có nút "Mở cài đặt" (`canOpenScreens`), vì chưa mở được màn hình Cài đặt.
export function Notice() {
  const t = useT();
  const error = useApp((s) => s.error);
  const failures = useApp((s) => s.status?.hotkeyFailures.length ?? 0);
  const dismiss = useApp((s) => s.dismissError);
  const notice = useApp((s) => s.notice);
  const dismissNotice = useApp((s) => s.dismissNotice);
  const navigate = useApp((s) => s.navigate);
  const openLoginItems = useApp((s) => s.openLoginItemsSettings);
  const canNavigate = useApp(canOpenScreens);
  return (
    <>
      {notice?.kind === "quitFromTray" && (
        <div className="notice" role="status">
          <span>{t("notice.quitFromTray")}</span>
          <button onClick={dismissNotice}>{t("common.dismiss")}</button>
        </div>
      )}
      {notice?.kind === "loginItemsApproval" && (
        <div className="notice" role="status">
          <span>{t("notice.loginItemsApproval")}</span>
          <button onClick={() => void openLoginItems()}>{t("notice.openLoginItems")}</button>
          <button onClick={dismissNotice}>{t("common.dismiss")}</button>
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          <span>{t(errorKey(error.code))}</span>
          <button onClick={dismiss}>{t("common.dismiss")}</button>
        </div>
      )}
      {failures > 0 && (
        <div className="notice" role="status">
          <span>{t(canNavigate ? "notice.hotkeysFailed" : "notice.hotkeysFailedLater")}</span>
          {canNavigate && <button onClick={() => navigate("settings", "hotkeys")}>{t("notice.openSettings")}</button>}
        </div>
      )}
    </>
  );
}
```

Tạo `src/windows/main/LanguagePicker.tsx`:

```tsx
import { LANGS, type Lang } from "../../lib/ipc";
import { useApp, useT } from "./appStore";

// Ngôn ngữ đích, tập ngôn ngữ nguồn và khóa một ngôn ngữ (F2). Dùng ở màn hình chính và bước 5 của
// lần đầu mở. Phía Rust từ chối tập nguồn rỗng; ở đây không cho bỏ chọn ngôn ngữ cuối cùng.
export function LanguagePicker() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  const toggleSource = (lang: Lang, on: boolean) => {
    const next = on ? LANGS.filter((l) => l === lang || settings.sourceLanguages.includes(l)) : settings.sourceLanguages.filter((l) => l !== lang);
    void update({ sourceLanguages: next });
  };
  return (
    <>
      <div className="row">
        <label htmlFor="target">{t("languages.target")}</label>
        <select id="target" value={settings.targetLanguage} onChange={(e) => void update({ targetLanguage: e.target.value as Lang })}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <span>{t("languages.sources")}</span>
        <div className="checks">
          {LANGS.map((l) => {
            const checked = settings.sourceLanguages.includes(l);
            return (
              <label key={l}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={checked && settings.sourceLanguages.length === 1}
                  onChange={(e) => toggleSource(l, e.target.checked)}
                />{" "}
                {t(`lang.${l}`)}
              </label>
            );
          })}
        </div>
      </div>
      <div className="row">
        <label htmlFor="lock">{t("languages.lock")}</label>
        <select
          id="lock"
          value={settings.sourceLock ?? ""}
          onChange={(e) => void update({ sourceLock: e.target.value === "" ? null : (e.target.value as Lang) })}
        >
          <option value="">{t("languages.lock.auto")}</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {t(`lang.${l}`)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Các màn hình.** Tạo `src/windows/main/screens/Home.tsx`:

```tsx
import { useApp, useT } from "../appStore";
import { LanguagePicker } from "../LanguagePicker";

// Màn hình chính (§4.3). Kế hoạch 02 nối nút Bắt đầu với pipeline, nguồn âm thanh và mức âm lượng;
// kế hoạch 06 điền số phút còn lại.
export function Home() {
  const t = useT();
  const status = useApp((s) => s.status);
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const toggleSession = useApp((s) => s.toggleSession);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const setLocked = useApp((s) => s.setOverlayLocked);
  if (!status || !settings || !info) return null;
  const running = status.session === "running";
  return (
    <>
      <div className="card">
        <div className="row">
          <span className={running ? "badge running" : "badge"}>{t(running ? "status.running" : "status.idle")}</span>
          <button className="primary" onClick={() => void toggleSession()}>
            {t(running ? "home.stop" : "home.start")}
          </button>
        </div>
      </div>
      <div className="card">
        <h2>{t("home.languages")}</h2>
        <LanguagePicker />
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.audioSource")}</span>
          <span>{t(info.platform === "macos" ? "home.audioSource.system.macos" : "home.audioSource.system.windows")}</span>
        </div>
        <div className="row">
          <span>{t("home.inputLevel")}</span>
          <span className="hint">{t("common.notYet")}</span>
        </div>
        <div className="row">
          <span>{t("home.minutesLeft")}</span>
          <span className="hint">{t("common.notYet")}</span>
        </div>
      </div>
      <div className="card">
        <div className="row">
          <span>{t("home.overlay")}</span>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
          <button onClick={() => void setLocked(!settings.overlay.locked)}>
            {t(settings.overlay.locked ? "home.overlay.unlock" : "home.overlay.lock")}
          </button>
        </div>
      </div>
    </>
  );
}
```

Tạo `src/windows/main/screens/Placeholders.tsx`:

```tsx
import { EmptyState } from "../../../components/EmptyState";
import { useT } from "../appStore";

// Khung các màn hình mà kế hoạch sau làm nội dung: bản chép lời, lịch sử, từ điển (03), nâng cấp Pro (06).
export function Transcript() {
  return <EmptyState text={useT()("transcript.empty")} />;
}

export function History() {
  return <EmptyState text={useT()("history.empty")} />;
}

export function Glossary() {
  return <EmptyState text={useT()("glossary.empty")} />;
}

export function Upgrade() {
  return <EmptyState text={useT()("upgrade.empty")} />;
}
```

Tạo `src/windows/main/screens/About.tsx`:

```tsx
import { useApp, useT } from "../appStore";

// Giới thiệu (§4.3): phiên bản, thư mục log (Đ10), câu miễn trừ nhãn hiệu (§10.1).
// Kế hoạch 07 thêm danh sách giấy phép sinh từ `THIRD_PARTY_NOTICES`.
export function About() {
  const t = useT();
  const info = useApp((s) => s.info);
  const openLogDir = useApp((s) => s.openLogDir);
  if (!info) return null;
  return (
    <>
      <div className="card">
        <h2>{info.name}</h2>
        <p>{t("about.version", { version: info.version })}</p>
        <div className="row">
          <button onClick={() => void openLogDir()}>{t("about.openLogs")}</button>
        </div>
        <p className="hint">{t("about.logsHint")}</p>
      </div>
      <div className="card">
        <h2>{t("about.licenses")}</h2>
        <p className="hint">{t("about.licensesPending")}</p>
      </div>
      <p className="hint">{t("about.trademark")}</p>
    </>
  );
}
```

- [ ] **Step 4: Cài đặt.** Tạo `src/windows/main/settings/GeneralSettings.tsx`:

```tsx
import type { UiLanguage } from "../../../i18n";
import type { Theme, UpdateChannel } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Chung" (§4.3). Kênh cập nhật được kế hoạch 07 dùng.
export function GeneralSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  if (!settings) return null;
  return (
    <div className="card">
      <div className="row">
        <label htmlFor="ui-language">{t("settings.general.uiLanguage")}</label>
        <select
          id="ui-language"
          value={settings.uiLanguage}
          onChange={(e) => void update({ uiLanguage: e.target.value as UiLanguage })}
        >
          <option value="en">English</option>
          <option value="vi">Tiếng Việt</option>
        </select>
      </div>
      <div className="row">
        <label htmlFor="launch-at-login">{t("settings.general.launchAtLogin")}</label>
        <input
          id="launch-at-login"
          type="checkbox"
          checked={settings.launchAtLogin}
          onChange={(e) => void update({ launchAtLogin: e.target.checked })}
        />
        <span className="hint">{t("settings.general.launchAtLogin.hint")}</span>
      </div>
      <div className="row">
        <label htmlFor="theme">{t("settings.general.theme")}</label>
        <select id="theme" value={settings.theme} onChange={(e) => void update({ theme: e.target.value as Theme })}>
          <option value="system">{t("theme.system")}</option>
          <option value="light">{t("theme.light")}</option>
          <option value="dark">{t("theme.dark")}</option>
        </select>
      </div>
      <div className="row">
        <label htmlFor="channel">{t("settings.general.updateChannel")}</label>
        <select
          id="channel"
          value={settings.updateChannel}
          onChange={(e) => void update({ updateChannel: e.target.value as UpdateChannel })}
        >
          <option value="stable">{t("channel.stable")}</option>
          <option value="beta">{t("channel.beta")}</option>
        </select>
      </div>
    </div>
  );
}
```

Tạo `src/windows/main/settings/HotkeySettings.tsx`:

```tsx
import { useEffect, useState } from "react";
import { errorKey } from "../../../i18n";
import { acceleratorFromEvent, formatAccelerator } from "../../../lib/hotkeys";
import { HOTKEY_ACTIONS, type HotkeyAction } from "../../../lib/ipc";
import type { UiError } from "../../../store/app";
import { useApp, useT } from "../appStore";

// Nhóm Cài đặt "Phím tắt" (F10). Bấm "Đổi" rồi bấm tổ hợp mới; phía Rust kiểm và đăng ký với hệ
// điều hành, lỗi (trùng, không đăng ký được) hiện ngay dưới dòng đang sửa.
export function HotkeySettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const info = useApp((s) => s.info);
  const setHotkey = useApp((s) => s.setHotkey);
  const [editing, setEditing] = useState<HotkeyAction | null>(null);
  const [errors, setErrors] = useState<Partial<Record<HotkeyAction, UiError>>>({});

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code === "Escape") {
        setEditing(null);
        return;
      }
      const accelerator = acceleratorFromEvent(e);
      if (!accelerator) return;
      const action = editing;
      void setHotkey(action, accelerator).then((error) => {
        setErrors((prev) => ({ ...prev, [action]: error ?? undefined }));
        if (!error) setEditing(null);
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, setHotkey]);

  if (!settings || !status || !info) return null;
  return (
    <div className="card">
      <p className="hint">{t("hotkeys.hint", { super: info.platform === "macos" ? "Cmd" : "Win" })}</p>
      {HOTKEY_ACTIONS.map((action) => {
        const error = errors[action];
        const failed = status.hotkeyFailures.includes(action);
        return (
          <div key={action}>
            <div className="row">
              <span>{t(`hotkeys.${action}`)}</span>
              {editing === action ? (
                <>
                  <span className="hint">{t("hotkeys.press")}</span>
                  <button onClick={() => setEditing(null)}>{t("hotkeys.cancel")}</button>
                </>
              ) : (
                <>
                  <kbd>{formatAccelerator(settings.hotkeys[action], info.platform)}</kbd>
                  <button onClick={() => setEditing(action)}>{t("hotkeys.change")}</button>
                </>
              )}
            </div>
            {error && <p className="error-text">{t(errorKey(error.code))}</p>}
            {!error && failed && <p className="error-text">{t("hotkeys.failed")}</p>}
          </div>
        );
      })}
    </div>
  );
}
```

Tạo `src/windows/main/screens/SettingsScreen.tsx`:

```tsx
import type { MessageKey } from "../../../i18n";
import type { SettingsGroup } from "../../../lib/ipc";
import { useApp, useT } from "../appStore";
import { GeneralSettings } from "../settings/GeneralSettings";
import { HotkeySettings } from "../settings/HotkeySettings";

const GROUPS: readonly SettingsGroup[] = ["general", "subtitles", "audio", "model", "hotkeys", "license", "privacy"];

// Nhóm do kế hoạch khác làm: Phụ đề (03), Âm thanh (02), Model (04), Bản quyền (06), Quyền riêng tư (03, 04).
const DESCRIPTIONS: Partial<Record<SettingsGroup, MessageKey>> = {
  subtitles: "settings.subtitles.description",
  audio: "settings.audio.description",
  model: "settings.model.description",
  license: "settings.license.description",
  privacy: "settings.privacy.description",
};

export function SettingsScreen() {
  const t = useT();
  const group = useApp((s) => s.settingsGroup);
  const navigate = useApp((s) => s.navigate);
  const description = DESCRIPTIONS[group];
  return (
    <>
      <div className="tabs" role="tablist">
        {GROUPS.map((g) => (
          <button key={g} role="tab" aria-selected={g === group} onClick={() => navigate("settings", g)}>
            {t(`settings.group.${g}`)}
          </button>
        ))}
      </div>
      {group === "general" && <GeneralSettings />}
      {group === "hotkeys" && <HotkeySettings />}
      {description && (
        <div className="card">
          <p>{t(description)}</p>
          <p className="hint">{t("common.notYet")}</p>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Các bước lần đầu mở.** Tạo `src/windows/main/onboarding/TaskbarGuide.tsx`:

```tsx
// Hình minh họa tạm cho bước 8 trên Windows: kéo icon từ mục icon ẩn (mũi tên ^) ra taskbar.
// Ảnh chụp thật của Windows 10 và 11 thay hình này ở phần Windows của kế hoạch 01.
export function TaskbarGuide({ label }: { label: string }) {
  return (
    <svg className="taskbar-guide" viewBox="0 0 320 120" role="img" aria-label={label}>
      <rect x="10" y="10" width="120" height="56" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="28" y="26" width="24" height="24" rx="4" fill="currentColor" opacity="0.35" />
      <rect x="64" y="26" width="24" height="24" rx="4" fill="currentColor" />
      <rect x="0" y="84" width="320" height="30" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M196 106 l8 -10 l8 10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="226" y="89" width="20" height="20" rx="3" fill="currentColor" />
      <path d="M88 60 C 140 110, 190 110, 222 99" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 4" />
      <path d="M214 94 l9 5 l-8 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
```

Tạo `src/windows/main/onboarding/Onboarding.tsx`:

```tsx
import type { MessageKey, UiLanguage } from "../../../i18n";
import { useApp, useT } from "../appStore";
import { LanguagePicker } from "../LanguagePicker";
import { Notice } from "../Notice";
import { TaskbarGuide } from "./TaskbarGuide";

// Các bước lần đầu mở app (§4.1). Kế hoạch 01 làm khung và các bước 1, 5, 7, 8; bước 2–3 do kế
// hoạch 04 làm (kiểm tra máy, tải model), bước 4 do 02 (quyền ghi âm thanh hệ thống, chỉ macOS),
// bước 6 do 03 (nghe thử).
type Step = "language" | "model" | "download" | "permission" | "languages" | "test" | "privacy" | "tray";

const TITLES: Record<Step, MessageKey> = {
  language: "onboarding.language.title",
  model: "onboarding.model.title",
  download: "onboarding.download.title",
  permission: "onboarding.permission.title",
  languages: "onboarding.languages.title",
  test: "onboarding.test.title",
  privacy: "onboarding.privacy.title",
  tray: "onboarding.tray.title",
};

export function stepsFor(platform: "macos" | "windows"): Step[] {
  const steps: Step[] = ["language", "model", "download", "permission", "languages", "test", "privacy", "tray"];
  return platform === "macos" ? steps : steps.filter((s) => s !== "permission");
}

export function Onboarding() {
  const t = useT();
  const info = useApp((s) => s.info);
  const index = useApp((s) => s.onboardingStep);
  const setStep = useApp((s) => s.setOnboardingStep);
  const finish = useApp((s) => s.finishOnboarding);
  if (!info) return null;
  const steps = stepsFor(info.platform);
  const current = Math.min(index, steps.length - 1);
  const step = steps[current] ?? "language";
  const last = current === steps.length - 1;
  return (
    <main className="onboarding">
      <Notice />
      <p className="hint">{t("onboarding.step", { n: current + 1, total: steps.length })}</p>
      <h1>{t(TITLES[step])}</h1>
      <StepBody step={step} platform={info.platform} />
      <div className="actions">
        <button disabled={current === 0} onClick={() => setStep(current - 1)}>
          {t("onboarding.back")}
        </button>
        <button className="primary" onClick={() => (last ? void finish() : setStep(current + 1))}>
          {t(last ? "onboarding.finish" : "onboarding.next")}
        </button>
      </div>
    </main>
  );
}

function StepBody({ step, platform }: { step: Step; platform: "macos" | "windows" }) {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const openTaskbarSettings = useApp((s) => s.openTaskbarSettings);
  switch (step) {
    // Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (bước 5 đổi lại được).
    case "language":
      return (
        <div className="checks" role="radiogroup">
          {(["vi", "en"] as UiLanguage[]).map((lang) => (
            <label key={lang}>
              <input
                type="radio"
                name="ui-language"
                checked={settings?.uiLanguage === lang}
                onChange={() => void update({ uiLanguage: lang, targetLanguage: lang })}
              />{" "}
              {lang === "vi" ? "Tiếng Việt" : "English"}
            </label>
          ))}
        </div>
      );
    case "languages":
      return <LanguagePicker />;
    case "privacy":
      return (
        <>
          <p>{t("onboarding.privacy.local")}</p>
          <p>{t("onboarding.privacy.notify")}</p>
        </>
      );
    case "tray":
      return platform === "macos" ? (
        <p>{t("onboarding.tray.macos")}</p>
      ) : (
        <>
          <p>{t("onboarding.tray.windows")}</p>
          <p>{t("onboarding.tray.windowsPin")}</p>
          <TaskbarGuide label={t("onboarding.tray.windowsPin")} />
          <div className="row">
            <button onClick={() => void openTaskbarSettings()}>{t("onboarding.tray.openTaskbarSettings")}</button>
          </div>
        </>
      );
    default:
      return <p className="hint">{t("common.notYet")}</p>;
  }
}
```

- [ ] **Step 6: Khung cửa sổ chính và entry.** Tạo `src/windows/main/Shell.tsx`:

```tsx
import type { Screen } from "../../lib/ipc";
import { useApp, useT } from "./appStore";
import { Notice } from "./Notice";
import { About } from "./screens/About";
import { Home } from "./screens/Home";
import { Glossary, History, Transcript, Upgrade } from "./screens/Placeholders";
import { SettingsScreen } from "./screens/SettingsScreen";

const SCREENS: readonly Screen[] = ["home", "transcript", "history", "glossary", "settings", "upgrade", "about"];

const BODIES: Record<Screen, () => React.JSX.Element | null> = {
  home: Home,
  transcript: Transcript,
  history: History,
  glossary: Glossary,
  settings: SettingsScreen,
  upgrade: Upgrade,
  about: About,
};

// Khung cửa sổ chính: thanh điều hướng tới mọi màn hình ở §4.3.
export function Shell() {
  const t = useT();
  const screen = useApp((s) => s.screen);
  const navigate = useApp((s) => s.navigate);
  const Body = BODIES[screen];
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">{t("app.name")}</div>
        {SCREENS.map((s) => (
          <button key={s} aria-current={s === screen ? "page" : undefined} onClick={() => navigate(s)}>
            {t(`nav.${s}`)}
          </button>
        ))}
      </nav>
      <main className="content">
        <h1>{t(`nav.${screen}`)}</h1>
        <Notice />
        <Body />
      </main>
    </div>
  );
}
```

Tạo `src/windows/main/App.tsx`:

```tsx
import { useApp } from "./appStore";
import { Onboarding } from "./onboarding/Onboarding";
import { Shell } from "./Shell";

export function App() {
  const ready = useApp((s) => s.settings !== null && s.status !== null && s.info !== null);
  const onboardingDone = useApp((s) => s.settings?.onboardingDone ?? false);
  if (!ready) return null;
  return onboardingDone ? <Shell /> : <Onboarding />;
}
```

Thay toàn bộ `src/windows/main/main.tsx`:

```tsx
import "../../styles/main.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { appStore } from "./appStore";

// Giao diện sáng/tối và thuộc tính `lang` theo cài đặt, đổi ngay khi cài đặt đổi.
appStore.subscribe((state) => {
  const settings = state.settings;
  if (!settings) return;
  const root = document.documentElement;
  if (settings.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  root.lang = settings.uiLanguage;
});

void appStore.getState().init();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Thay toàn bộ `index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Translator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/windows/main/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Thanh phụ đề.** Tạo `src/windows/overlay/overlay.css`:

```css
body {
  margin: 0;
  background: transparent;
  overflow: hidden;
}

.overlay {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  padding: 0.5rem 1rem;
  border-radius: 0.75rem;
  color: #ffffff;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  line-height: 1.35;
}

.overlay.unlocked {
  cursor: move;
  outline: 1px dashed rgba(255, 255, 255, 0.4);
  outline-offset: -1px;
}

.overlay .source {
  font-size: 0.6em;
  opacity: 0.75;
}

.overlay .provisional {
  opacity: 0.6;
}

.overlay .waiting {
  opacity: 0.6;
  font-size: 0.7em;
}
```

Thay toàn bộ `src/windows/overlay/overlay.tsx`:

```tsx
import "./overlay.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { translate } from "../../i18n";
import { tauriIpc } from "../../lib/ipc";
import { createOverlayStore } from "../../store/overlay";

const store = createOverlayStore(tauriIpc);
void store.getState().init();

// Thanh phụ đề (§4.4): N dòng gần nhất, phụ đề tạm màu nhạt hơn. Khi chưa khóa thì kéo được cả thanh
// (`data-tauri-drag-region="deep"`, như spike S5); khi khóa thì click xuyên qua, do phía Rust đặt.
// Kế hoạch 03 làm đủ phần hiển thị (hiện dần từng chữ, chỉ báo, kéo cạnh đổi kích thước).
function Overlay() {
  const view = useStore(store, (s) => s.view);
  const lines = useStore(store, (s) => s.lines);
  if (!view) return null;
  return (
    <div
      className={view.locked ? "overlay" : "overlay unlocked"}
      data-tauri-drag-region={view.locked ? undefined : "deep"}
      style={{ fontSize: view.fontSize, background: `rgba(0, 0, 0, ${view.opacity})` }}
    >
      {lines.length === 0 && <div className="waiting">{translate(view.uiLanguage, "overlay.waiting")}</div>}
      {lines.map((l) => (
        <div key={l.id} className={l.provisional ? "provisional" : undefined}>
          {view.showSource && <div className="source">{l.src_text}</div>}
          <div>{l.tgt_text}</div>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
```

Thay toàn bộ `overlay.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Subtitles</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/windows/overlay/overlay.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Build và test**

Run: `pnpm build && pnpm test`
Expected (lúc lập kế hoạch):
```text
dist/overlay.html                      0.40 kB │ gzip:  0.25 kB
dist/index.html                        0.47 kB │ gzip:  0.29 kB
dist/assets/overlay-74s5WgTU.css       0.46 kB │ gzip:  0.29 kB
dist/assets/main-Bod--Ppy.css          3.62 kB │ gzip:  1.14 kB
dist/assets/overlay-BaNgG9U0.js        1.26 kB │ gzip:  0.69 kB
dist/assets/main-DLHY9pdO.js          15.84 kB │ gzip:  4.31 kB
dist/assets/jsx-runtime-BOs0BLyN.js  236.30 kB │ gzip: 74.69 kB
✓ built in 306ms
```
và `Tests  28 passed (28)`.

- [ ] **Step 9: Commit**

```bash
git add src index.html overlay.html
git commit -m "feat(ui): khung các màn hình §4.3, các bước lần đầu mở §4.1, thanh báo, thanh phụ đề đọc cài đặt của nó" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 22: Script kiểm code Windows trên Mac, và chạy bản dev đã ký

**Files:**
- Create: `scripts/fake-llvm-rc`, `scripts/check-windows.sh`, `scripts/run-dev-signed.sh`

QĐ18 và QĐ19. `run-dev-signed.sh` mở app, nên agent chỉ kiểm cú pháp; người chạy ở Task 24.

- [ ] **Step 1: Tạo `scripts/fake-llvm-rc`**

```sh
#!/bin/sh
# llvm-rc giả, chỉ dùng cho scripts/check-windows.sh: tauri-build gọi trình biên dịch resource khi
# build cho Windows, mà Mac không có sẵn llvm-rc. `cargo check` và `cargo clippy` không link, nên file
# .lib rỗng tạo ra ở đây không bao giờ được dùng. Không dùng script này để build bản chạy thật.
for arg in "$@"; do
  if [ "$arg" = "/?" ]; then
    echo "OVERVIEW: LLVM Resource Converter (giả, có /no-preprocess)"
    exit 0
  fi
done
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "/fo" ]; then out="$arg"; fi
  prev="$arg"
done
if [ -n "$out" ]; then : > "$out"; fi
```

- [ ] **Step 2: Tạo `scripts/check-windows.sh`**

```sh
#!/bin/sh
# Kiểm kiểu và clippy phần code Windows của app ngay trên Mac (R1 của kế hoạch 00), vì chưa có máy
# Windows. Chỉ kiểm được là code biên dịch được; hành vi thật (khay, Alt+F4, thanh phụ đề topmost,
# Credential Manager) vẫn phải thử trên Windows.
# Cần một lần: rustup target add x86_64-pc-windows-msvc
set -eu
here=$(cd "$(dirname "$0")" && pwd)
RC_x86_64_pc_windows_msvc="$here/fake-llvm-rc" \
  cargo clippy -p meeting-translator --target x86_64-pc-windows-msvc --all-targets -- -D warnings
```

- [ ] **Step 3: Tạo `scripts/run-dev-signed.sh`**

```sh
#!/bin/sh
# Chạy bản dev đã ký bằng một chứng thư cố định (R8 của kế hoạch 00). Bản `pnpm tauri dev` chỉ có
# chữ ký ad-hoc, đổi sau mỗi lần build, nên Keychain và các quyền của macOS hỏi lại mỗi lần. Ký bằng
# cùng một chứng thư thì yêu cầu định danh (designated requirement) không đổi, hệ thống nhớ quyền đã cấp.
#
# Cần một lần: tạo chứng thư ký mã trong Keychain Access (xem Task 24, dòng 29 của kế hoạch 01), hoặc dùng
# chứng thư "Apple Development" của một Apple ID. Tên chứng thư đặt qua MT_DEV_SIGN_IDENTITY.
set -eu
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
target="${CARGO_TARGET_DIR:-$root/target}"
identifier=$(sed -n 's/^  "identifier": "\(.*\)",$/\1/p' "$root/src-tauri/tauri.conf.json")

cd "$root"
cargo build -p meeting-translator
codesign --force --sign "$identity" --identifier "$identifier" "$target/debug/meeting-translator"
codesign --verify --verbose=2 "$target/debug/meeting-translator"

# Bản dev mở http://localhost:1420 do Vite phục vụ: chạy Vite trước, chờ nó sẵn sàng.
pnpm dev >/dev/null 2>&1 &
vite=$!
trap 'kill "$vite" 2>/dev/null' EXIT INT TERM
until curl -sf http://localhost:1420 >/dev/null; do sleep 0.2; done
"$target/debug/meeting-translator"
```

- [ ] **Step 4: Chạy thử**

Run:
```bash
chmod +x scripts/fake-llvm-rc scripts/check-windows.sh scripts/run-dev-signed.sh
sh -n scripts/fake-llvm-rc && sh -n scripts/check-windows.sh && sh -n scripts/run-dev-signed.sh && echo ok
rustup target add x86_64-pc-windows-msvc
./scripts/check-windows.sh
```
Expected (lúc lập kế hoạch):
- `ok`;
- `rustup`: target Windows có thể đã được cài sẵn từ trước (lúc lập kế hoạch là vậy), khi đó chỉ báo:
```text
info: component rust-std for target x86_64-pc-windows-msvc is up to date
```
  Nếu chưa có thì `rustup` tải thư viện chuẩn cho target Windows (một lần, khoảng 115 MB, không cần quyền admin).
- `check-windows.sh` kết thúc bằng dòng ``Finished `dev` profile …``, không lỗi, không cảnh báo. Script kiểm cả code chỉ có trên Windows: ẩn/hiện và click xuyên qua bằng Win32 (QĐ23), `persistence = Local` của kho khóa (QĐ8), `open_login_items_settings` trả `unsupported`.
- Lần đầu mất khoảng 30 giây (lúc lập kế hoạch: ``Finished `dev` profile [unoptimized + debuginfo] target(s) in 36.28s``; lúc máy đang bận build việc khác thì hơn 1 phút), và thư mục `target/x86_64-pc-windows-msvc/` khoảng 260 MB.

- [ ] **Step 5: Commit**

```bash
git add scripts/fake-llvm-rc scripts/check-windows.sh scripts/run-dev-signed.sh
git commit -m "chore(app): kiểm code Windows của app trên Mac; chạy bản dev ký bằng chứng thư cố định (R8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 23: Kiểm tra chuẩn toàn bộ

**Files:** không sửa file nào.

- [ ] **Step 1: Chạy kiểm tra chuẩn (mục 6.2 của kế hoạch 00), thêm `pnpm test` và `scripts/check-windows.sh`**

```bash
cargo fmt --all -- --check
pnpm install --frozen-lockfile
pnpm build
pnpm test
cargo clippy --workspace --all-targets -- -D warnings
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --workspace 2>&1 | grep -E 'test result' | awk '{p+=$4; f+=$6; i+=$8} END {print "passed", p, "failed", f, "ignored", i}'
cargo test -p asr-worker --features shared-encode
cargo build --release -p asr-worker --features metal,shared-encode
./scripts/check-windows.sh
cargo deny check && cargo audit
pnpm audit
```
Expected (lúc lập kế hoạch):
- không lỗi, không cảnh báo của clippy. Build script của `whisper-rs-sys` in một cảnh báo `variable does not need to be mutable` từ trước; đó là code trong `third_party/`, không phải lint của clippy.
- `pnpm test`: `Tests  28 passed (28)`;
- `cargo test --workspace`: `passed 231 failed 0 ignored 3`. So với mốc trước kế hoạch này (`passed 144 failed 0 ignored 1`), thêm 87 test của `meeting-translator`. Ba test bỏ qua là `vad_reference`, `os_keystore_roundtrip` và `system_reports_missing_agent`.
- `cargo test -p asr-worker --features shared-encode`: `28 passed`;
- `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` kết thúc bằng `warning: 3 allowed warnings found`;
- `No known vulnerabilities found`.

- [ ] **Step 2: Kiểm ổ đĩa.** Run: `df -h /System/Volumes/Data`.

Lúc lập kế hoạch:
- target Windows của Task 22 chiếm khoảng 260 MB (`target/x86_64-pc-windows-msvc/`);
- bản release của app ở Task 17 thêm khoảng 1,2 GB vào `target/release/` (phần lớn là thư viện của Tauri, dùng lại được khi `pnpm tauri build`).

Nếu còn dưới 10 GiB trống, xóa target Windows (lần chạy `scripts/check-windows.sh` sau sẽ build lại):

```bash
rm -rf target/x86_64-pc-windows-msvc
```

## Task 24 (người): Thử tay trên Mac

**Files:**
- Create: `bench/phase1/results/p01_app_shell_manual.md`

Agent dừng ở đây, gửi bảng dưới cho người làm, và chờ kết quả. Các dòng này bật cửa sổ, đụng Keychain, LaunchAgent, đăng xuất, nên agent không tự chạy (mục 6.8 của kế hoạch 00).

Chuẩn bị:
- Xóa cài đặt cũ (nếu có) để thấy các bước lần đầu mở: `rm -f ~/Library/Application\ Support/com.aitranslator.desktop/settings.json`
- Nếu đã thử bản spike trước đây: thư mục `~/Library/Application Support/dev.meetingtranslator.spike/` và `~/Library/Logs/dev.meetingtranslator.spike/` của identifier cũ không còn dùng, xóa được. Nếu còn `~/Library/LaunchAgents/Meeting Translator.plist` (bản trước QĐ29) thì xóa file đó trước dòng 19.
- Chạy: `pnpm tauri dev`. Muốn thử cả bản release: `pnpm build && CARGO_PROFILE_RELEASE_LTO=false pnpm tauri build --no-bundle`, rồi chạy `target/release/meeting-translator`.
- Log: `~/Library/Logs/com.aitranslator.desktop/app.log`.

- [ ] **Step 1: Chạy từng dòng và ghi kết quả**

| # | Thao tác | Đạt khi |
|---|---|---|
| 1 | Mở app lần đầu | Cửa sổ chính hiện các bước lần đầu mở, "Bước 1/8"; **không thấy thanh phụ đề** (QĐ21). Ngôn ngữ giao diện theo macOS (tiếng Việt nếu macOS dùng tiếng Việt, còn lại English). Chọn ngôn ngữ kia thì chữ đổi ngay. Đi hết 8 bước, bấm nút cuối thì về màn hình chính |
| 2 | Nhìn menu bar | Có icon khung phụ đề đơn sắc; đổi menu bar sáng/tối (System Settings › Appearance) thì icon đổi màu theo. Bấm icon: menu có Bắt đầu dịch, Hiện phụ đề, Khóa phụ đề (click xuyên qua), Mở cửa sổ chính, Thoát |
| 3 | Khay › Bắt đầu dịch; rồi Khay › Dừng dịch | Khi bắt đầu: thanh phụ đề hiện ra ở giữa đáy màn hình, có phụ đề mẫu mỗi 1,5 giây, dòng thứ tư nhạt hơn; màn hình chính báo "Đang dịch"; menu khay có "Dừng dịch" và "Ẩn phụ đề"; di chuột lên icon thấy chú thích dạng "AI Translator: Đang dịch" (theo ngôn ngữ đang chọn). Khi dừng: phụ đề mẫu ngừng, thanh phụ đề vẫn hiện |
| 4 | Để Finder active, bấm `⌃⌥T`, `⌃⌥H`, `⌃⌥L` (mỗi phím hai lần) | Lần lượt bắt đầu rồi dừng dịch, ẩn rồi hiện thanh phụ đề, khóa rồi mở khóa; màn hình chính và menu khay đổi theo; Finder vẫn active |
| 5 | Khóa (khay hoặc `⌃⌥L`), rồi click vào vùng thanh phụ đề đang nằm trên một cửa sổ khác | Click đi xuyên tới cửa sổ bên dưới; viền nét đứt biến mất. Mở khóa bằng khay được |
| 6 | Kéo thanh phụ đề sang chỗ khác, Thoát ở khay, mở lại app, bấm `⌃⌥H` | Mở lại thì chưa có thanh phụ đề; bấm `⌃⌥H` thì thanh hiện đúng chỗ vừa kéo. Nếu thanh luôn về giữa đáy màn hình, ghi lại: sự kiện di chuyển của NSPanel không tới Tauri, 03 phải lưu vị trí cách khác |
| 7 | Có màn hình ngoài: kéo thanh sang màn hình ngoài, thoát, rút màn hình ngoài, mở lại, bấm `⌃⌥H`; rồi cắm lại, thoát, mở lại, bấm `⌃⌥H` | Khi rút: thanh ở vị trí đã nhớ trên màn hình laptop (hoặc giữa đáy nếu chưa từng nhớ). Khi cắm lại: thanh về màn hình ngoài, đúng vị trí cũ |
| 8 | Cài đặt › Chung › Ngôn ngữ giao diện | Cửa sổ chính đổi ngay; mở lại menu khay thấy chữ mới; chữ chờ "Phụ đề sẽ hiện ở đây" trên thanh phụ đề đổi theo |
| 9 | Cài đặt › Chung › Giao diện: Tối, Sáng, Theo hệ thống | Đổi ngay; "Theo hệ thống" đi theo macOS |
| 10 | Cửa sổ chính active: bấm `⌘+` hai lần, `⌘-` một lần, rồi `⌘0` | Chữ và khung to dần, nhỏ lại một nấc, rồi về cỡ gốc (§6.10). Nếu chữ không đổi: chuột phải › Inspect Element › Console, chép lỗi (thường là thiếu quyền `set_webview_zoom`) vào kết quả |
| 11 | Cài đặt › Phím tắt: đổi "Bắt đầu hoặc dừng dịch" thành `⌃⌥K`; thử `⌃⌥K` và `⌃⌥T` | `⌃⌥K` bắt đầu/dừng được, `⌃⌥T` hết tác dụng |
| 12 | Đổi "Hiện hoặc ẩn phụ đề" thành `⌃⌥K`; vẫn ở dòng đó (đang chờ phím mới), gõ `T` không kèm phím bổ trợ, rồi `⇧T`; rồi Esc | Báo "Tổ hợp này đang dùng cho việc khác."; cả `T` lẫn `⇧T` đều báo "Hãy dùng ít nhất một phím Ctrl, Alt hoặc Cmd/Win. Chỉ có Shift thì chưa đủ." (English: "Use at least one of Ctrl, Alt or Cmd/Win. Shift alone is not enough."); Esc hủy, dòng báo lỗi mất, phím cũ giữ nguyên |
| 13 | Bấm X, rồi mở lại; bấm `⌘W` | Cửa sổ ẩn, icon ở Dock biến mất, phụ đề mẫu vẫn chạy nếu đang dịch. Khay › Mở cửa sổ chính: cửa sổ hiện, icon ở Dock hiện lại |
| 14 | Cửa sổ chính đang active, bấm `⌘Q`; bấm Đóng ở thanh báo; rồi mở menu tên app ở menu bar › Quit AI Translator | Cả hai lần app đều không thoát; cửa sổ chính có thanh báo "AI Translator vẫn chạy ở menu bar. Muốn thoát, chọn Thoát ở biểu tượng trên menu bar." (English nếu giao diện là English); Đóng thì thanh báo mất. Không có thông báo nào ở Notification Center, không có hộp thoại xin quyền thông báo. Log có hai dòng `bỏ qua yêu cầu thoát không đến từ menu khay` |
| 15 | Bấm X để ẩn cửa sổ chính, bấm `⌃⌥H` cho thanh phụ đề hiện; Khay › Mở cửa sổ chính; chuột phải icon ở Dock › Quit | App không thoát; cửa sổ chính ra trước, có thanh báo như dòng 14; thanh phụ đề giữ nguyên |
| 16 | Khay › Thoát | App thoát hẳn: `pgrep -fl meeting-translator` không in gì. Log có `thoát theo yêu cầu từ menu khay` |
| 17 | Lần lượt ba lần, mỗi lần mở app trước: Apple menu › Log Out; Apple menu › Restart; Apple menu › Shut Down | Cả ba lần: không bị chặn, không có hộp thoại báo AI Translator hủy việc đăng xuất, khởi động lại hay tắt máy. Sau mỗi lần đăng nhập lại, log có một dòng `cho thoát theo yêu cầu của hệ thống` mới. Nếu lần nào bị chặn, chép dòng `bỏ qua yêu cầu thoát…` trong log (có mã lý do) vào kết quả |
| 18 | App đang chạy (`pnpm tauri dev`), mở terminal khác chạy `target/debug/meeting-translator` | Bản thứ hai thoát ngay; bản đang chạy hiện cửa sổ chính |
| 19 | Cài đặt › Chung › bật "Khởi động cùng hệ thống"; `ls ~/Library/LaunchAgents/`; `plutil -p ~/Library/LaunchAgents/com.aitranslator.desktop.plist`; đăng xuất rồi đăng nhập | Có `com.aitranslator.desktop.plist`; `Label` là `com.aitranslator.desktop`, `ProgramArguments` là đường dẫn binary dev kèm `--autostart` (QĐ29). Sau khi đăng nhập: app chạy, chỉ có icon ở menu bar; không có cửa sổ chính, icon ở Dock hay thanh phụ đề. Khay › Bắt đầu dịch thì thanh phụ đề hiện |
| 20 | Tiếp dòng 19: System Settings › General › Login Items & Extensions (macOS 14: Login Items) › mục Allow in the Background, tắt AI Translator; Khay › Thoát, mở lại app | Cài đặt › Chung hiện "Khởi động cùng hệ thống" đang tắt; log có `mục khởi động cùng hệ thống đang bị tắt ở System Settings` (QĐ16) |
| 21 | Tiếp dòng 20: trong app bật lại "Khởi động cùng hệ thống"; bấm "Mở Login Items" ở thanh báo; bật AI Translator ở trang vừa mở; Khay › Thoát, mở lại app; cuối cùng tắt trong app | Sau khi bật trong app: thanh báo "AI Translator đang bị tắt ở System Settings › General › Login Items & Extensions (macOS 14: Login Items), nên sẽ không tự mở khi đăng nhập. Hãy bật lại ở đó." kèm nút "Mở Login Items" (QĐ16); thanh báo màu trung tính, không đỏ. Bấm nút: System Settings mở đúng trang Login Items & Extensions (macOS 14: Login Items), thanh báo đóng. Bật ở đó rồi mở lại app: Cài đặt hiện bật. Tắt trong app thì file plist bị xóa. Nếu không có thanh báo, chép dòng log về trạng thái khởi động cùng hệ thống vào kết quả. Bản dev đăng ký đường dẫn của binary dev, nên nhớ tắt sau khi thử |
| 22 | `cat ~/Library/Application\ Support/com.aitranslator.desktop/settings.json`; rồi ghi rác vào file (`echo '{hỏng' > …/settings.json`) và mở lại app | Có `"schemaVersion": 1` và các khóa của §6.9. Sau khi ghi rác: app mở bình thường với cài đặt mặc định (lại hiện các bước lần đầu), cạnh đó có `settings.json.corrupt-<giây Unix>` (ví dụ `settings.json.corrupt-1790000000`); làm lại lần nữa thì có thêm một bản sao mới, bản cũ còn nguyên |
| 23 | Thoát app. Sửa `settings.json`: đặt `"schemaVersion": 99`, thêm `"futureKey": true`, đặt `"targetLanguage"` thành `42`, thêm `"futureSub": 1` vào nhóm `"overlay"`. Mở app, đổi Giao diện sang Tối, thoát, rồi `cat` file | File vẫn có `"schemaVersion": 99`, `"futureKey": true`, `"targetLanguage": 42` và `"overlay": {…, "futureSub": 1}` (QĐ2); `"theme"` là `"dark"`. Xóa file sau khi thử |
| 24 | Giới thiệu › Mở thư mục log | Finder mở `~/Library/Logs/com.aitranslator.desktop/`, có `app.log`; log không chứa câu phụ đề mẫu nào |
| 25 | Bản dev: chuột phải trong cửa sổ chính › Inspect Element, tab Console: gõ `location.href = "https://example.com"`; rồi `window.open("https://example.com")` | Cửa sổ vẫn ở giao diện của app; không có cửa sổ mới, trình duyệt không mở. Log có hai dòng `chặn điều hướng tới https://example.com` (QĐ22) |
| 26 | `cargo test -p meeting-translator --lib os_keystore -- --ignored` | `1 passed`. Nếu Keychain hỏi quyền, ghi lại nội dung hộp thoại |
| 27 | Phím tắt trùng với app họp (C5; ma trận S5, dòng 13): để Zoom, Teams, Meet (Chrome) lần lượt active, bấm ba phím tắt | Ghi lại phản ứng của cả app này và app họp |
| 28 | Ma trận S5 trên Mac (kế hoạch 0-05, Task 3), nếu chưa chạy: ít nhất dòng 1, 7, 9, 11 với app này (Bắt đầu dịch trước để thanh phụ đề hiện) | Như ma trận S5 |
| 29 | Tùy chọn (R8): tạo chứng thư trong Keychain Access › Certificate Assistant › Create a Certificate…: tên "AI Translator Dev", Identity Type "Self Signed Root", Certificate Type "Code Signing". Chạy `./scripts/run-dev-signed.sh` | Script in `valid on disk` và `satisfies its Designated Requirement`, rồi app mở như `pnpm tauri dev`. Kế hoạch 02, 03, 06 dùng cách này để quyền ghi âm thanh và Keychain không hỏi lại sau mỗi lần build |
| 30 | Bản debug có giao diện đóng gói: `pnpm build && pnpm tauri build --debug --no-bundle`, rồi chạy `target/debug/meeting-translator` | Cửa sổ chính hiện giao diện bình thường (không trắng); Bắt đầu dịch thì thanh phụ đề có phụ đề mẫu. Log không có dòng `chặn điều hướng tới tauri://localhost` (QĐ22) |
| 31 | Cài đặt › Phím tắt: đổi "Khóa hoặc mở khóa phụ đề" thành `⌃⌥↑`, giữ cả tổ hợp khoảng một giây rồi thả; để Finder active, bấm `⌃⌥↑`; rồi bấm Đổi ở dòng đó, gõ `⌃⌥K` (trùng dòng 11), bấm Hủy; cuối cùng đổi lại `⌃⌥L` | Ô phím tắt hiện `⌃⌥↑` (không phải `⌃⌥ArrowUp`); giữ phím thì chỉ gửi một lần, không hiện lỗi nào (phím lặp bị bỏ qua). `⌃⌥↑` khóa/mở khóa được. Gõ `⌃⌥K` thì báo trùng; bấm Hủy thì dòng báo lỗi mất, phím `⌃⌥↑` giữ nguyên |
| 32 | Bật VoiceOver (`⌘F5`). Cài đặt: Tab tới hàng nhóm cài đặt, bấm mũi tên phải hai lần rồi Tab; bấm một mục ở thanh điều hướng bên trái; ở Màn hình chính, Tab tới ô chọn ngôn ngữ nguồn; bấm `⌘Q` khi cửa sổ chính active. Tắt VoiceOver | Mũi tên đổi nhóm, focus đi theo tab đang chọn, VoiceOver đọc "tab"; Tab từ hàng nhóm vào thẳng nội dung nhóm. Đổi màn hình thì focus về tiêu đề màn hình mới. Ô ngôn ngữ nguồn được đọc kèm tên nhóm "Ngôn ngữ nói trong cuộc họp". Thanh báo của dòng 14 được đọc khi hiện. Giao diện tiếng Việt thì VoiceOver đọc chữ của cửa sổ chính bằng giọng tiếng Việt |

- [ ] **Step 2: Ghi `bench/phase1/results/p01_app_shell_manual.md`:** phiên bản macOS, máy, commit đã thử, bảng trên với cột kết quả, và ảnh chụp dòng 2, 5 và 14 (lưu trong `bench/phase1/results/p01/`).

- [ ] **Step 3: Nếu dòng nào không đạt:** ghi lỗi vào file kết quả, sửa code trong một task mới của kế hoạch này (viết test trước nếu là logic), rồi chạy lại dòng đó. Riêng dòng 6 và 7: nếu NSPanel không phát sự kiện di chuyển, ghi vào mục 2.3 của kế hoạch 00 để 03 xử lý.

- [ ] **Step 4: Commit**

```bash
git add bench/phase1/results/p01_app_shell_manual.md bench/phase1/results/p01
git commit -m "test(app): thử tay khung app trên macOS (khay, phím tắt, thoát, thanh phụ đề)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 25 (người, Win): Thử tay trên Windows

**Files:**
- Modify: `bench/phase1/results/p01_app_shell_manual.md` (thêm mục Windows)

Làm trong đợt Windows (mục 3 của kế hoạch 00), trên máy đã làm kế hoạch 0-01 Task 2. Windows 11, thêm Windows 10 nếu có.

- [ ] **Step 1: Build và test ngay trên Windows** (PowerShell, từ gốc repo)

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
cargo clippy -p meeting-translator --all-targets -- -D warnings
cargo test -p meeting-translator
```
Expected:
- vitest `Tests  46 passed (46)` (sau đợt U);
- lib của `meeting-translator`: `106 passed; 0 failed; 1 ignored` (sau đợt R và U). Trên Mac là `108 passed; 0 failed; 2 ignored`; ba test chỉ có trên macOS nên Windows không có: `system_reports_missing_agent` (bỏ qua trên Mac), `from_raw_matches_sm_app_service_status`, `install_off_the_main_thread_does_nothing`. Số này tính từ code, chưa chạy thật trên Windows.

- [ ] **Step 2: Chạy `pnpm tauri dev` và làm từng dòng**

Xóa `%APPDATA%\com.aitranslator.desktop\settings.json` (nếu có) trước dòng 1.

| # | Thao tác | Đạt khi |
|---|---|---|
| 1 | Mở app lần đầu; nhìn khay hệ thống (kể cả mục mũi tên `^`) | Cửa sổ chính hiện "Bước 1/7"; không thấy thanh phụ đề. Có icon của app ở khay. Bấm chuột trái: cửa sổ chính hiện. Bấm chuột phải: menu năm mục như trên Mac |
| 2 | Đi tới "Bước 7/7" của lần đầu mở (bước ghim icon khay) | Có hình hướng dẫn và nút "Mở cài đặt Taskbar"; bấm nút thì mở đúng Settings › Personalization › Taskbar. Nếu hình tạm khó hiểu, chụp ảnh thật trên Windows 10 và 11 và ghi vào kết quả để thay hình |
| 3 | `Alt+F4` và nút X ở cửa sổ chính | Cửa sổ ẩn, mất khỏi taskbar; app, phím tắt, phụ đề mẫu vẫn chạy; khay › Mở cửa sổ chính hiện lại |
| 4 | Khay › Bắt đầu dịch; rồi ma trận S5 trên Windows (kế hoạch 0-05 Task 4, ít nhất dòng 1, 6, 7, 9, 12) | Thanh phụ đề hiện khi bắt đầu. Không có nút ở taskbar; nổi trên Teams toàn màn hình; đang gõ trong ô chat của Teams thì chữ vẫn vào Teams; khóa thì click xuyên qua |
| 5 | Thanh phụ đề đang hiện: bấm `Ctrl+Alt+H`; rồi bấm lại | Lần đầu thanh ẩn hẳn; lần sau thanh hiện lại đúng chỗ cũ. Màn hình chính và menu khay đổi theo mỗi lần (QĐ23) |
| 6 | Mở Notepad và gõ liên tục. Trong lúc gõ: bấm `Ctrl+Alt+H` hai lần (ẩn rồi hiện thanh phụ đề), rồi `Ctrl+Alt+T` hai lần. Lặp lại với ô chat của Teams | Mỗi lần thanh phụ đề ẩn hay hiện lại: Notepad (hoặc Teams) vẫn là cửa sổ active, thanh tiêu đề không đổi màu, chữ gõ tiếp vẫn vào đó, không mất ký tự nào (QĐ23) |
| 7 | Thanh phụ đề đang hiện, đang gõ ở Notepad (rồi ở ô chat của Teams): bấm `Ctrl+Alt+L` (khóa), click vào vùng thanh phụ đề, gõ tiếp; bấm `Ctrl+Alt+L` (mở khóa), gõ tiếp | Khi khóa: thanh vẫn hiện, viền nét đứt mất, click đi xuyên xuống cửa sổ bên dưới. Khi mở khóa: thanh vẫn hiện, kéo được. Cả hai lần chữ vẫn vào app đang gõ, cửa sổ đó vẫn active (QĐ23). Nếu khóa làm thanh biến mất, hay nền thanh đổi màu hoặc mất hẳn, ghi lại |
| 8 | Để một app khác giữ `Ctrl+Alt+T` (ví dụ đặt phím tắt đó trong PowerToys), rồi mở app | Cửa sổ chính có thanh báo phím tắt không đăng ký được; nhóm Phím tắt ghi "Chưa đăng ký được"; menu khay có dòng báo, bấm vào thì mở đúng nhóm Phím tắt. Đổi sang tổ hợp khác thì hết báo |
| 9 | Thêm bố cục bàn phím Polish (Settings › Time & language › Language & region › English hoặc Polish › Keyboards › Polish (Programmer's)), chuyển sang bố cục đó (`Win+Space`). App đang chạy với phím tắt mặc định, thanh phụ đề đang hiện. Mở Notepad, gõ `ł` bằng AltGr+L (phím Alt bên phải + L) vài lần | Ghi lại: `ł` có hiện trong Notepad không, và thanh phụ đề có bị khóa/mở khóa theo mỗi lần gõ không. Windows coi AltGr là `Ctrl+Alt`, nên AltGr+L trùng `Ctrl+Alt+L` (khóa phụ đề) và có thể nuốt ký tự. Nếu có, báo chủ dự án để cân nhắc đổi phím tắt mặc định (F10). Xong thì chuyển về bố cục cũ |
| 10 | Cửa sổ chính active: `Ctrl +` hai lần, `Ctrl -` một lần, rồi `Ctrl 0` | Chữ và khung to dần, nhỏ lại một nấc, rồi về cỡ gốc (§6.10) |
| 11 | Lần lượt, mỗi lần mở app trước: Start › Power › Shut down; Restart; Start › tài khoản › Sign out | Không có màn hình "This app is preventing you from shutting down" do AI Translator |
| 12 | Chạy `target\debug\meeting-translator.exe` lần thứ hai khi app đang chạy | Bản thứ hai thoát ngay; bản đang chạy hiện cửa sổ chính |
| 13 | Bật "Khởi động cùng hệ thống"; xem `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; đăng xuất rồi đăng nhập; tắt mục này ở Task Manager › Startup apps, Khay › Thoát, mở lại app; bật lại trong app; cuối cùng tắt trong app | Có giá trị `AI Translator` trỏ tới exe, kèm `--autostart`; đường dẫn không có dấu nháy (ghi chú cho 07: đường dẫn cài đặt có dấu cách thì phải xử lý). Sau khi đăng nhập: chỉ có icon ở khay, không mở cửa sổ, không có thanh phụ đề. Tắt ở Task Manager rồi mở lại app: Cài đặt hiện "tắt" (QĐ16). Bật lại trong app: Task Manager hiện Enabled. Tắt trong app thì giá trị trong `Run` bị xóa. Kết quả này đúng cho cả `tauri-plugin-autostart` 2.6.0 (`auto-launch` 0.5.0, bản đang dùng) lẫn 2.7.0 |
| 14 | `cargo test -p meeting-translator --lib os_keystore -- --ignored` | `1 passed` (Credential Manager, `persistence = Local`, QĐ8); test tự xóa mục vừa ghi |
| 14a | Ngay sau dòng 14: `$env:KEYSTORE_KEEP=1; cargo test -p meeting-translator --lib os_keystore -- --ignored --nocapture; Remove-Item Env:KEYSTORE_KEEP`; rồi `cmdkey /list` | Test in `giữ lại mục test-<số> của service com.aitranslator.desktop.test` rồi `1 passed`. Trong `cmdkey /list`, mục có `test-<số>` và `com.aitranslator.desktop.test` trong `Target` ghi `Local machine persistence` (bản Windows tiếng Việt: chữ tương đương), không phải `Enterprise persistence`. Xong thì xóa mục: `cmdkey /delete:<Target vừa thấy>` |
| 15 | Đường dẫn file | Cài đặt ở `%APPDATA%\com.aitranslator.desktop\settings.json`; log ở `%LOCALAPPDATA%\com.aitranslator.desktop\logs\app.log` |
| 16 | Màn hình scale 150% và hai màn hình: kéo thanh phụ đề sang màn hình kia, thoát, mở lại, bấm `Ctrl+Alt+H` | Thanh về đúng màn hình và vị trí; chữ nét, không bị cắt |
| 17 | Thanh phụ đề đang hiện, chưa khóa: kéo thanh lên sát mép trên màn hình rồi thả; làm lại với mép trái và mép phải; Thoát ở khay, mở lại app, bấm `Ctrl+Alt+H` | Thanh không phóng to và không bám vào nửa màn hình; kích thước giữ nguyên. Mở lại thì thanh có đúng kích thước cũ (QĐ23). Nếu Windows vẫn ghép thanh vào nửa màn hình, ghi lại để 03 xử lý |
| 18 | Chạy app bằng quyền admin (chuột phải exe › Run as administrator), bật "Khởi động cùng hệ thống", Khay › Thoát; xem `HKLM\Software\Microsoft\Windows\CurrentVersion\Run`; rồi chạy app bình thường và tắt mục này; cuối cùng chạy lại bằng quyền admin và tắt | Với `tauri-plugin-autostart` 2.7.0: khi chạy bằng quyền admin, giá trị nằm ở `HKLM` (`auto-launch` 0.6.0 ghi `HKLM` trước, QĐ16). Chạy bình thường mà tắt: thanh báo "Vẫn còn khởi động cùng hệ thống…" (mã `autostartStillEnabled`), công tắc vẫn bật. Chạy bằng quyền admin mà tắt thì giá trị bị xóa, không báo lỗi. **Với bản đang dùng (2.6.0, `auto-launch` 0.5.0):** mọi giá trị chỉ nằm ở `HKCU` của tài khoản đang chạy, `HKLM` không có gì, tắt không báo lỗi; ghi kết quả theo bản đang dùng, và làm lại dòng này sau khi nâng lên 2.7.0 |

- [ ] **Step 3: Ghi kết quả vào mục "Windows" của `bench/phase1/results/p01_app_shell_manual.md`** (phiên bản Windows, máy, ảnh chụp dòng 1, 2, 4, 7, 17 và 18), rồi commit

```powershell
git add bench/phase1/results/p01_app_shell_manual.md bench/phase1/results/p01
git commit -m "test(app): thử tay khung app trên Windows (khay, Alt+F4, thanh phụ đề không lấy focus, phím tắt trùng)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Task 26: Cập nhật tổng quan Giai đoạn 1 (Task 2 của kế hoạch 00)

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md`

- [ ] **Step 1: Làm Task 2 của kế hoạch 00 với số `01`.** Gợi ý trạng thái khi Task 1–24 đã xong (Task 25 chưa có máy Windows):

| Trạng thái | Dòng |
|---|---|
| `xong` (ghi SHA ngắn) | 8, 21, 35, 39, 41, 54, 62, 69, 72, 74, 75, 76, 191, 192, 194, 195, 260 |
| `chờ` (Win), ghi "phần macOS xong" | 42, 60, 63, 71 |
| `chờ` (C5) | 64, 70 (phần code xong; chờ ma trận S5 trên app họp toàn màn hình) |
| `đang làm`, ghi "phần 01 xong" và kế hoạch còn lại | 2, 4, 16, 17, 24, 38, 43, 46, 50, 59, 61, 68, 79, 87, 141, 196, 197, 204, 230, 249, 252, 257, 266, 271, 292, 305, 312, 318 |

Ghi chú cho vài dòng:
- dòng 24 và 305 còn phần kiểm trùng phím tắt với app họp (C5) và phần Windows;
- dòng 271 và 312 còn phần của 06 (lệnh bản quyền, trang thanh toán trong `navigation::EXTERNAL_HOSTS`) và 07 (website);
- dòng 17 và 71 còn phần Windows của QĐ23 (Task 25 dòng 5–7 và 17).

- [ ] **Step 2: Cập nhật các mục khác của kế hoạch 00**
  - Mục 6.2:
    - thêm `pnpm test` sau `pnpm build`, và `./scripts/check-windows.sh` sau `cargo build --release -p asr-worker …`;
    - sửa số test thành "231 test qua, 3 test bỏ qua (`vad_reference`, `os_keystore_roundtrip`, `system_reports_missing_agent`)".
  - Mục 2.1, ghi các chỗ bàn giao khác mô tả:
    - overlay có một lệnh chỉ đọc `get_overlay_view` và không gọi lệnh khóa (QĐ5);
    - menu app trên Mac chỉ có chữ English (QĐ15);
    - `yoke-derive` nâng 0.8.4.
  - Mục 8, Q12, thêm ba ý:
    - §10.2 ghi overlay được gọi lệnh khóa; 01 chỉ cấp cho overlay lệnh đọc `get_overlay_view`, vì khi đã khóa thì click đi xuyên qua thanh (QĐ5);
    - 03 sẽ cấp `core:window:allow-start-resize-dragging` cho overlay (kéo cạnh để đổi cỡ), và phải sửa danh sách cố định của overlay trong `acl_tests.rs`;
    - menu app trên Mac chỉ có chữ English ở MVP (QĐ15); §4.5 chỉ đòi khay theo ngôn ngữ giao diện.
  - Mục 2.2 (02):
    - 02 thay `session_stub.rs` bằng `session.rs`. Bắt đầu phiên phải hiện thanh phụ đề như `session_stub::start` (QĐ21), và test `app_tests.rs` phải còn qua;
    - lệnh mở trang quyền ghi âm thanh (`open_audio_permission_settings`) thêm thành một phương thức của `system::SystemOpener`, và vào `test_support::FakeSystem`, `OPENER_COMMANDS` của test ACL (QĐ28); không gọi `tauri-plugin-opener` hay API mở System Settings ở chỗ khác;
    - `toggle_session` đã trả `Result<AppStatus, CommandError>` (QĐ25). Bắt đầu phiên thật (thu âm, chạy tiến trình phụ) không chạy trên luồng chính, nên 02 chuyển lệnh sang `async`;
    - chạy tiến trình phụ ở `window::show_main` và khi bắt đầu phiên; không chạy khi `AppState::launched_at_login()` và cửa sổ chính chưa mở (Đ19);
    - dừng phiên và tắt tiến trình phụ trong `actions::quit`.
  - Mục 2.3 (03): mặc định của thanh phụ đề ở QĐ3; quyền kéo cạnh ở trên; kéo cạnh dùng `start_resize_dragging`, không gọi hàm đổi cờ của tao cho overlay trên Windows (QĐ23); `blob:` bị chặn, kể cả của chính app, nên xuất file không đi qua `<a download>` tới `blob:` (QĐ22); ẩn/hiện và khóa thanh phụ đề đi qua `overlay::Surface`, trên Windows là Win32 (QĐ23); nếu Task 24 dòng 6–7 không đạt thì ghi ở đây.
  - Mục 2.6 (06): không gửi bí mật qua sự kiện (QĐ6); dùng `security::keystore::Keystore`; thêm tên miền trang thanh toán vào `navigation::EXTERNAL_HOSTS` kèm test; mở trang thanh toán qua `SystemOpener` (QĐ28).
  - Mục 8: đánh dấu Q1 đã chốt (AI Translator, `com.aitranslator.desktop`, QĐ29). Không sửa spec ở task này; việc đó thuộc lượt cập nhật spec.
  - Mục 2.7 (07): bản đóng gói tên `AI Translator.app`; giá trị trong `Run` không có dấu nháy, đường dẫn có dấu cách phải xử lý; bộ cài dọn mục khởi động ở `HKLM` khi gỡ (QĐ16, QĐ29); thêm tên miền website vào `navigation::EXTERNAL_HOSTS`; `AppHandle::restart` không qua chặn thoát (QĐ7).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-10-01-giai-doan-1-00-tong-quan.md
git commit -m "docs(plan): cập nhật tổng quan Giai đoạn 1 sau kế hoạch 01" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Phụ lục: sửa sau review lúc thực thi (đợt R)

Đợt R sửa các mục phía Rust trong danh sách người review ghi lại khi review 23 task code. Số mục theo danh sách đó. Mọi test mới đều được thử bằng mutation: các mutation còn sống mà danh sách nêu (M1, M2 của `hotkeys.rs`; M15 của `migrate.rs`; M1, M6 của `patch.rs`) và mutation cho từng chỗ sửa đều bị bắt. Code trong các task ở trên vẫn là bản trước đợt R; bản đúng là code trong repo.

**Phiên bản thực tế lúc thực thi.** Lúc chạy Task 1, `tauri-plugin-autostart` 2.7.0 và `tauri-plugin-single-instance` 2.5.2 chưa đủ 1 ngày tuổi. Vì vậy app dùng bản dự phòng đã ghi ở mục "Phiên bản đã chốt": `tauri-plugin-autostart` 2.6.0 và `tauri-plugin-single-instance` 2.5.1, kéo theo `tauri-plugin` 2.7.0 và `tauri-utils` 2.10.0 (không phải 2.7.1 và 2.10.1). Chú thích ở `login_item.rs` vẫn ghi theo 2.7.0; sau khi nâng phải chạy lại test của Task 12 và 17.

**Commit sửa trong lúc thực thi:** `4560558`. Commit này cho thoát khi hệ thống gửi `kAEQuitAll` (`quia`), và chặn URL chỉ có mật khẩu cùng URL `about:` khác `about:blank`.

| Mục | Thay đổi | Commit |
|---|---|---|
| 1 | Test chuỗi đọc được nhưng dài hơn `MAX_LEN` (`"Ctrl+"` + 70 dấu cách + `"Alt+T"`) | `e20f3ce` |
| 2 | Test phím mới sai cho việc chưa có phím nào: `old_active = false` | `e20f3ce` |
| 3 | Phím tắt phải có Ctrl, Alt hoặc Super; Shift một mình không đủ. Sửa câu lỗi Rust, `hotkeys.hint` và `error.hotkeyNoModifier` (en, vi) | `e20f3ce` |
| 5 | Test `schemaVersion` lớn hơn `u32::MAX`: coi là bản mới hơn, không ghi đè, giữ giá trị thô | `4d95f83` |
| 7 | `check_id` đếm theo ký tự (`chars().count()`), có test với chữ có dấu | `4d95f83` |
| 9 | Test `overlay.lastMonitor` là khóa chỉ đọc, và khóa con lạ trong `experimental` | `4d95f83` |
| 10 | `patch::apply`: sai kiểu ở khóa con thì báo tên khóa con; số nguyên âm hay tràn cho khóa số nguyên thì báo `OutOfRange`. Chú thích ghi rõ thứ tự kiểm (khóa xét theo thứ tự chữ cái vì `Map` của `serde_json` không bật `preserve_order`) | `4d95f83` |
| 11 (code) | `os_keystore_roundtrip` (`#[ignore]`) kiểm `persistence == "Local"` trên Windows. Bước `cmdkey /list` của Task 25 chưa thêm | `9998752` |
| 12 | Test bước 2 của thứ tự chọn màn hình, kẹp y ở mép dưới, và `.filter(saved)` của `last_screen` | `9998752` |
| 13 | Test tên mục kho khóa dài đúng 64 ký tự và tên có `_` | `9998752` |
| 14 | Chú thích `OverlaySettings::positions` đổi `monitor_key` thành `screen_key` | `4d95f83` |
| 15, 26 | `navigation::apply` nhận danh sách tên miền; tách `new_window` khỏi `new_window_handler`. Test bằng app giả: link ngoài trả `false` và đi qua `FakeSystem.open_external_url`; yêu cầu mở cửa sổ mới luôn `Deny` | `e501a61` |
| 16 | `quit_guard::install` dừng nếu không ở luồng chính (`MainThreadMarker`); kiểm delegate và cài phương thức xong mới gán `ON_CANCEL`; trả `bool`. Logic trả lời tách thành `terminate_reply`, bọc `on_cancel` bằng `catch_unwind` | `d4a7796` |
| 17 | `Native::open_external_url` chỉ mở URL `https` có tên máy chủ (`system::https_only`) | `e501a61` |
| 19 | Test bảng `AgentStatus::from_raw` theo `SMAppServiceStatus` (chỉ macOS) | `d4a7796` |
| 20 | Bản sao file cài đặt hỏng tên `settings.json.corrupt-<giây Unix>`; trùng tên thì thêm `-1`, `-2`…, tối đa 100 bản mỗi giây; không ghi đè bản cũ | `4d95f83` |
| 22 | Test menu khay so theo cặp `(id, chữ)` | `a5cbfd4` |
| 23 | Test `TrayItem::ALL` có `match` đầy đủ, không dùng `_` | `a5cbfd4` |
| 24 | `errors.rs`: chú thích chung của năm mã lỗi đổi thành comment thường; mỗi hằng có doc comment riêng | `a5cbfd4` |
| 32 (`migrate`) | `migrate::load` đưa phím tắt về dạng chuẩn (`Loaded::normalized`); file cùng phiên bản thì ghi lại, file của bản mới hơn thì không | `4d95f83` |

Sau đợt R: `cargo test -p meeting-translator --lib` cho 108 test qua và 2 test bỏ qua. Clippy `-D warnings` (Mac và `check-windows.sh`), `cargo fmt --check` và `pnpm test` (28 test) đều sạch.

## Phụ lục: sửa sau review lúc thực thi (đợt U)

Đợt U sửa các mục phía giao diện trong cùng danh sách của người review, và sửa tài liệu của kế hoạch này cho khớp code sau đợt R và U. Mục logic có test viết trước. Mỗi test mới được thử bằng mutation và đều bắt được mutation, trừ một mutation tương đương (tra bảng tên phím cho cả phím bổ trợ; bảng không có tên phím bổ trợ nên kết quả không đổi). Mục chỉ là chữ, CSS hay trợ năng thì kiểm bằng `pnpm build` và đọc lại. Như đợt R, code trong các task ở trên vẫn là bản trước đợt U; bản đúng là code trong repo.

| Mục | Thay đổi | Commit |
|---|---|---|
| 4 | Task 25 dòng 9 thử đúng bố cục Polish (Programmer's), gõ `ł` bằng AltGr+L, ghi lại ký tự có bị nuốt và phím tắt khóa phụ đề có chạy không | commit tài liệu này |
| 11 (bước thử tay) | `os_keystore_roundtrip` không xóa mục khi có biến môi trường `KEYSTORE_KEEP`; Task 25 thêm dòng 14a: chạy test với `KEYSTORE_KEEP=1`, rồi `cmdkey /list` phải thấy `Local machine persistence`, rồi tự xóa mục | `d11d343` |
| 21 | Ghi chú ở "Phiên bản đã chốt": sau khi nâng `tauri-plugin-autostart` lên 2.7.0, chạy lại test của Task 12 và Task 17. Task 25 dòng 18 ghi kết quả mong đợi theo cả 2.6.0 (chỉ `HKCU`) và 2.7.0 (`HKLM` trước) | commit tài liệu này |
| 25 | Lời nhắc Login Items ghi đường dẫn "Login Items & Extensions" (macOS 15 trở lên), kèm "Login Items" cho macOS 14, ở cả en và vi. Chữ tiếng Việt dùng "biểu tượng", không dùng "icon"; có test | `ab88519` |
| 29 | Test cho các mutation còn sống: lưu `onboardingDone` lỗi thì không về màn hình chính (M5); mở Login Items lỗi thì lời nhắc còn (M6); thay tại chỗ một dòng không nằm cuối (M11); phụ đề tới trước khi có `view` thì giữ 3 dòng (M12); `OSLeft`/`OSRight` là phím bổ trợ (M15) | `629847b` |
| 30 | `run` của store xóa `error` khi lệnh sau thành công | `629847b` |
| 31 | `init()`: đăng ký một sự kiện lỗi, hay một lệnh đọc lỗi, thì gỡ mọi listener đã đăng ký rồi ném lỗi tiếp | `629847b` |
| 32 (`formatAccelerator`) | Hiện tên phím thân thiện: `↑ ↓ ← →`, `` ` ``, `=`, `-`, `[ ] \ ; ' , . /`, `Esc`; `Space`, `Enter`, `Tab`, `Backspace`, `Delete`, `F1`–`F24` giữ tên. Cài đặt vẫn lưu tên W3C | `629847b` |
| 33 | `main.tsx`: `init()` lỗi thì hiện câu `app.loadFailed` theo ngôn ngữ của hệ điều hành thay vì cửa sổ trắng. Store có `sessionPending`: lệnh Bắt đầu/Dừng đang chờ thì không gửi lệnh thứ hai, nút bị khóa. `setSourceLanguage` tính tập nguồn từ cài đặt mới nhất trong store. `recorderStep` (`lib/hotkeys.ts`): bỏ phím lặp, Esc hủy kể cả khi đang chờ, đang chờ thì bỏ phím mới; `HotkeySettings` bỏ kết quả của lời gọi đã hủy hay đã bị thay (đếm lượt), Hủy thì xóa lỗi cũ | `629847b`, `ab88519` |
| 33 (trợ năng, màu, chữ) | Cài đặt là bộ tab đủ `tabpanel`, `aria-controls`, mũi tên trái/phải và Home/End; radiogroup ở bước 1 có tên (tiêu đề bước); nhóm ngôn ngữ nguồn dùng `fieldset`/`legend`; dòng lỗi phím tắt gắn vào nút bằng `aria-describedby`; đổi màn hình hay đổi bước thì focus về tiêu đề; `Notice` có hai vùng live (`status`, `alert`) luôn nằm trong DOM; `lang` của `overlay.html` theo ngôn ngữ giao diện; thanh báo lời nhắc màu trung tính, chỉ lỗi màu đỏ; tên ngôn ngữ ở bước 1 và Cài đặt › Chung lấy từ `t('lang.en')`, `t('lang.vi')` | `ab88519` |
| `quit_guard.rs` | Chú thích của `terminate_reply` ghi rõ: bản phát hành dùng `panic = "abort"`, nên `catch_unwind` chỉ có tác dụng ở bản dev và trong test | `e96692d` |
| Task 24–25 | Câu báo phím tắt chỉ có Shift lấy đúng chữ trong `en.ts`, `vi.ts`; tên bản sao file hỏng `settings.json.corrupt-<giây Unix>` (cả QĐ2); đường dẫn Login Items & Extensions; số test ở Task 25 Step 1 (vitest 46; lib trên Windows 106 qua, 1 bỏ qua); Task 24 thêm dòng 31 (tên phím thân thiện, phím lặp, Hủy xóa lỗi) và dòng 32 (bàn phím và VoiceOver) | commit tài liệu này |

Mục 28 (store của thanh phụ đề: `revision`, thứ tự của `upsertLine`, xóa `lines` khi phiên mới) thuộc kế hoạch 02, không làm ở đây.

Việc chặn bấm đúp chỉ thấy rõ khi bắt đầu phiên mất thời gian (kế hoạch 02). Với `session_stub` của kế hoạch 01, lệnh trả về gần như ngay, nên bấm đúp vẫn có thể bắt đầu rồi dừng; Task 24 không có dòng thử việc này.

**Ảnh hưởng tới kế hoạch 02c.** Các patch `git apply` của 02c viết trên bản trước đợt U, nên khi thực thi 02c phải viết lại patch cho các file sau:
- `src/store/app.ts`, `src/store/app.test.ts`: đợt U đổi `init()`, `toggleSession()` (`sessionPending`), `run` (xóa lỗi), thêm `setSourceLanguage` và các test mới;
- `src/windows/main/screens/SettingsScreen.tsx`: nội dung nhóm nằm trong `tabpanel`, nên hunk thêm `AudioSettings` lệch ngữ cảnh;
- `src/windows/main/screens/Home.tsx`: 02c thay toàn bộ file, phải giữ `disabled={pending}` (`sessionPending`) ở nút Bắt đầu/Dừng;
- `src/store/overlay.test.ts`: 02c thay toàn bộ file; nên giữ hai test mới của đợt U (thay tại chỗ dòng không nằm cuối, mặc định 3 dòng khi chưa có `view`) nếu hành vi vẫn đúng;
- `src/i18n/en.ts`, `vi.ts`, `src/styles/main.css`, `Onboarding.tsx`, `overlay.tsx`: đợt U chỉ sửa ngoài vùng ngữ cảnh của các hunk 02c, nên `git apply` vẫn áp được (lệch dòng); vẫn cần chạy thử khi thực thi 02c.

Sau đợt U: `pnpm test` cho 46 test qua (4 file), `pnpm build` sạch; `cargo test -p meeting-translator --lib` cho 108 test qua và 2 test bỏ qua; clippy `-D warnings` (Mac và `check-windows.sh`) và `cargo fmt --check` sạch.
