# Phân biệt người nói, kế hoạch 05: đọc tên người nói trên Windows (UI Automation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, clippy, fmt liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Giữ nhánh `phan-biet-nguoi-noi`, không gộp `main`, không rebase. Chỉ commit khi chủ dự án nói rõ.
>
> **Không chạy gì trên máy này liên quan Teams, Chrome, Edge, Zoom.** Mọi test dùng cây giả hay cây ghi sẵn. Việc cần đọc app thật trên Windows là Task **(cần chủ dự án)** ở file 05b.

**Goal:** bộ đọc tên người nói của `speaker-worker` chạy được trên Windows: một lượt đọc UI Automation trả đúng `TileSample` như bộ đọc macOS (tên, mic, chỉ báo "đang nói", người dùng), đi qua **đúng** phần thuần đã làm ở kế hoạch 04 (bộ duyệt, `SpeakingTracker`, `NameMatcher`, tách giọng, tự hiệu chỉnh, công thức), kèm công cụ ghi và đo (`uia-record`) và gói chạy cho chủ dự án trên máy Windows. Vì **chưa có bản ghi cây giao diện Windows nào** (Teams, Meet, Zoom), công thức Windows nằm ở dạng ứng viên (đoán từ bản ghi macOS), **không** vào bản build sẵn, và bộ đọc **không được nạp** trên Windows cho tới khi công thức có mục Windows (spec 7.1, như Meet và Zoom ở macOS, QĐ 16, 32 của kế hoạch 04). Tính năng vẫn tắt với người dùng cuối tới kế hoạch 07.

**Architecture:** năm lớp, bốn lớp đầu thuần Rust test được ngay trên Mac. (1) `Os::{web_role, window_role, static_text_role}`: các tên vai trò cứng của macOS trong bộ duyệt thành hàm theo hệ điều hành. (2) `reader::uia_tree`: trait `UiaBackend` (mỗi hàm là một lệnh UI Automation) và `UiaTree<B>` hiện thực trait `Tree` của 04: ánh xạ loại điều khiển, `AutomationId`, `ClassName`, `Name` sang `Attrs`; hình dạng của con đi cùng lệnh lấy con, nên đọc lại trong cùng lượt không tốn lệnh. (3) `reader::winscan`: tìm cửa sổ họp qua trait `Desktop`, chỉ đọc tiêu đề cửa sổ của file chạy trong danh sách viết cứng. (4) `reader::windowset` và `reader::stats`: điều phối một lượt đọc trên các cửa sổ họp trong một ngân sách, chung mọi `Tree`. (5) `reader::uia` (chỉ Windows): `ComBackend` (crate `windows` đã có trong `Cargo.toml`), `Win32Desktop`, `LiveReader`, luồng `speaker-reader`; chỉ biên dịch chéo và clippy được trên Mac, hành vi thật cần máy Windows. Ráp: `PLATFORM = Windows`, `reader_setup` chỉ tạo luồng đọc khi công thức có mục Windows.

**Tech Stack:** Rust 1.98 (edition 2024). **Không thêm crate nào, không đổi `Cargo.lock`, không thêm feature của `windows`:** `windows` 0.62.2 (đã trong lock và trong `crates/speaker-worker/Cargo.toml`) là bản **mới nhất ổn định** trên crates.io (`cargo info windows`, 2026-10-27; MSRV 1.82 ≤ 1.98); các feature cần (`Win32_UI_Accessibility`, `Win32_System_Com`, `Win32_System_Threading`, `Win32_UI_WindowsAndMessaging`, `Win32_Foundation`) đã bật từ `uia-probe` của kế hoạch 01; không có `Win32_Networking`. `windows-core` mới nhất riêng lẻ trên crates.io là 0.100.0 nhưng `windows` 0.62.2 dùng `windows-core` 0.62.2: **không** thêm `windows-core` riêng (hai bản trong cây là xung đột không cần). `regex` 1.13.1, `serde_json`, `libc` như 04. Không có hai bản ggml (crate này không chứa ggml). Python 3 cho `make_fixture.py` (chạy `-I`).

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §6.1 (danh sách app và cửa sổ họp), §6.2 (Windows: UI Automation), §6.3–§6.4, §6.6 (độ trễ), §6.7 (Windows không có dòng mời), §6.8, §7.1 (công thức), §10, §11 (đọc ≤ 30 ms), §12, §13 mục 5, §14. Số đo nền: `bench/2026-10-26-nguoi-noi/results/{tong-hop,teams-chrome,02-windows}.md`.

**Dựa trên:** kế hoạch 04, 04b đã thực thi phần tự động (HEAD của nhánh `phan-biet-nguoi-noi` kèm các thay đổi chưa commit của 03, 04): `crates/speaker-worker/src/reader/{mod,tree,extract,macos,eui}.rs`, `names/*`, `crates/speaker-recipe`, `scripts/speaker-recipes/{recipes.json,make_fixture.py,fixtures/}`. Mã `reader::macos` **không bị sửa** ở kế hoạch này (chưa thử với app thật, 04b Task 19–21 còn chờ chủ dự án).

**Kế hoạch đi kèm:** `2026-10-27-phan-biet-nguoi-noi-05b-doc-ten-windows-do.md` (Task 9–15: gói Windows, ghi cây và đo trên máy Windows **(cần chủ dự án)**, chốt công thức từ bản ghi, Meet và Zoom, mốc kiểm cuối). File này (Task 0–8) là phần làm được hoàn toàn trên Mac; chạy file này trước. Số Task dùng chung cho hai file. **Phủ spec, "Để kế hoạch sau", rủi ro và điều cần chủ dự án quyết của cả hai file ở cuối file 05b.**

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo: model, bản ghi cây có tên thật, gói Windows); `B` = `$W/bench/2026-10-26-nguoi-noi`. Đặt ba biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`**.
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`.** Không `cargo clean`, không xóa gì trong `target/`. Lệnh `cargo test` có từ hai bộ lọc tên trở lên viết dạng `--lib -- a:: b::`.
- **Đĩa:** bước build nặng (build lần đầu sau khi đổi nhiều file, mọi lệnh `--release`) **bắt đầu bằng lệnh kiểm đĩa có điều kiện**, dừng thật khi thiếu: `avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; }` (ngưỡng **18** GiB cho lệnh `--release`). Lệnh dừng thì **báo chủ dự án** (không tự dọn).
- **Định dạng Rust:** mã mẫu dưới đây đã qua `cargo fmt` (`max_width = 120`); mỗi Mốc kiểm vẫn chạy `cargo fmt -p <crate>` rồi `-- --check`.
- **Windows build:** bằng mingw (`scripts/check-windows.sh` cho kiểm kiểu và clippy target `x86_64-pc-windows-msvc`; `x86_64-pc-windows-gnu` + `x86_64-w64-mingw32-gcc` cho `.exe`). **Không dùng `cargo-xwin`** (điều khoản của Microsoft).
- Repo GitHub công khai: không ghi đường dẫn cá nhân hay tên người thật vào file nào của repo. Tên trong test là tên giả. Bản ghi cây có tên thật chỉ nằm ở `$DATA`.
- Tên người không bao giờ vào log, `CommandError.message`, báo cáo lỗi (như 04): log của bộ đọc chỉ có số đếm, thời gian, trạng thái, mã lỗi; `Debug` của kiểu có chữ (`Attrs`, `TileSample`, `MeetingWindow`) che chữ.
- `speaker-worker` không có mã mạng (CI kiểm bốn lớp `scripts/release/check-no-network.sh`): đừng viết tên API mạng, kể cả trong chú thích, ở `crates/speaker-worker/src`, `crates/speaker-protocol/src`, `crates/speaker-recipe/src`.
- Việc **(cần chủ dự án)** chỉ ở file 05b. Task trong file này không đọc app thật.

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **Tái dùng tối đa, thêm đúng phần riêng Windows.** Không đổi: trait `Tree`, `reader::extract` (`Walk`, `sample_tile`, `sample_round`, `Budget`, `Metered`), `names::*`, công thức `speaker-recipe` (định dạng, kiểm, `Matcher`), giao thức (`ReaderPlatform::Windows`, `MeetingApp::windows_exe`, `Os::Windows` đã có từ 02, 04). Chỉ đổi ba chỗ cứng của macOS trong bộ duyệt (Task 1) và `reader_setup`. Mã mới: `Os::{web_role, window_role, static_text_role}`, `uia_tree`, `winscan`, `windowset`, `stats`, `uia`, bin `uia-record`.
2. **Ánh xạ UI Automation sang `Attrs`:** `role` = tên loại điều khiển ("Button", "MenuItem", "Group", "Document", "Text"…, `uia_tree::control_type_name`); `subrole` = vai trò ARIA (`UIA_AriaRolePropertyId`; rỗng nếu app họp không cung cấp); `ident` = `AutomationId`; `classes` = các từ của `ClassName` (tối đa 32); `title` = `Name`; `value` = `Name` khi `role == "Text"` (chữ tĩnh, như `AXValue` của `AXStaticText` mà công thức Meet đọc); `desc` và `dom_id` để trống (`Matcher::matches_shape` đã khớp `ident` hay `dom_id`). **Không đọc `HelpText`** (uia-probe đọc, bộ đọc thật không cần). Với trình duyệt, Chromium cung cấp `ClassName` và `AutomationId` từ thuộc tính `class` và `id` của DOM: **chỉ là giả định, chưa kiểm** (Task 10 xác nhận hay bác).
3. **Hai lớp để test được: `UiaBackend` (lệnh thật) và `UiaTree` (thuần).** `UiaBackend` có ba hàm, mỗi hàm một lệnh qua tiến trình của app họp: `shape`, `name`, `children` (cả danh sách con kèm hình dạng, một lệnh). `UiaTree` giữ **bộ nhớ đệm hình dạng theo lượt**: hình dạng nhận cùng lệnh lấy con có số thứ tự lượt; `Tree::shape` trong cùng lượt trả từ đệm, **không tốn lệnh**; sang lượt mới (`begin_pass`) thì đọc lại, vì lượt nhanh phải thấy trạng thái mới của ô và neo (một đệm sống lâu hơn một lượt làm chỉ báo "đang nói" không bao giờ đổi). `Name` không nằm trong bộ nhớ đệm: chỉ đọc khi bộ duyệt hỏi chữ (QĐ 3 của kế hoạch 04: đọc chữ có chọn lọc, nên khung chat không bị đọc). `Fake` backend trong test đếm từng loại lệnh.
4. **Tìm cửa sổ họp bằng `EnumWindows`, không quét tiến trình.** `winscan::Scanner` (mỗi 2 s, spec 6.1): với mỗi cửa sổ cấp cao nhất đang hiện, hỏi **tiến trình sở hữu** rồi **file chạy** (nhớ 30 s theo tiến trình, tiến trình hết cửa sổ thì quên); **chỉ khi file chạy là một trong `MeetingApp::windows_exe` (không phân biệt hoa thường, chỉ xét tên file) và công thức có mục Windows cho app đó** mới đọc tiêu đề cửa sổ (và tên lớp cửa sổ Win32 khi công thức dùng `window_id`; trên Windows `window_id` khớp tên lớp cửa sổ). Cửa sổ của mọi app khác không bao giờ bị đọc tiêu đề (test `titles_of_other_apps_are_never_read`). App họp đầu tiên theo thứ tự `MeetingApp::ALL` có cửa sổ họp được đọc, tối đa 2 cửa sổ. **Nhận app theo tên file chạy** (đúng chữ spec 6.1), không kiểm đường dẫn: xem "Điều cần chủ dự án quyết" mục 7.
5. **Điều phối một lượt viết một lần cho mọi `Tree`** (`windowset::read_windows`, `reconcile`) và **không sửa `reader::macos`**: vòng lặp tương đương trong `LiveReader::tick` của macOS (và `Stats` riêng của nó) chưa được thử với app thật; sửa nó để dùng chung bây giờ là đổi mã chưa kiểm chứng. Hai bản trùng logic được ghi ở "Để kế hoạch sau" (hợp nhất sau khi 04b Task 19–21 đạt). `Stats` (dòng thống kê 60 s vào log) viết lại dạng thuần để test.
6. **Windows không tạo luồng đọc khi công thức không có mục Windows** (`Worker::reader_setup`): bản build sẵn chưa có mục Windows, nên worker Windows không khởi tạo COM, không nạp `UIAutomationCore.dll`, không quét cửa sổ. Hai DLL hệ thống mới (`ole32.dll`, `user32.dll`) vẫn được nạp **tĩnh** lúc khởi động vì `speaker-worker.exe` nhập chúng (đã thấy trong bản dựng thử, Task 8); chi phí nạp đo ở Task 12. macOS không đổi (công thức không có app nào vẫn chạy luồng đọc, như phép đo A-spk4 của 04).
7. **Không quyền, không `AXEnhancedUserInterface`, không file dấu, không bao giờ `NoPermission`.** UI Automation trên Windows không cần quyền cấp riêng và không có thuộc tính nào để bật trong app họp (spec 6.2); `eui_marker` của `Load.names` bị bỏ qua. Trạng thái bộ đọc Windows chỉ là `Off`, `NoMeeting`, `Ok`, `Blocked` (`windowset::health`: 5 lượt liền có lệnh quá hạn hay bị chặn thì `Blocked`; test ghim không bao giờ `NoPermission`, vì trạng thái đó làm dòng mời cấp quyền Trợ năng hiện ra, mà Windows không có dòng đó, spec 6.7). App họp chạy quyền cao hơn app này (quản trị) thường chặn UI Automation (`E_ACCESSDENIED`): đếm là lệnh hỏng, ra `Blocked`, "Người N", không xin nâng quyền.
8. **Công thức Windows ở dạng ứng viên, mặc định TẮT** (như QĐ 16, 32 của 04): ba file trong `scripts/speaker-recipes/fixtures/` — `teams-windows.recipes.json`, `meet-windows.recipes.json`, `zoom-windows-explore.recipes.json` — **đoán** từ bản ghi macOS (vai trò `AXMenuItem` → `MenuItem`, `AXGroup` → `Group`, lớp CSS và id giữ nguyên vì cùng DOM web; Zoom chỉ để tìm cửa sổ và ghi cây). Chỉ dùng cho test thuần (`reader::uia_tree::tests`) và `uia-record --recipe`. `scripts/speaker-recipes/recipes.json` **không đổi**: không có mục Windows. Mục Teams Windows vào bản build sẵn ở Task 11 chỉ sau khi có bản ghi thật và test độ khớp đạt; Meet và Zoom ở Task 13 theo tiêu chí của 04 (QĐ 16, 32).
9. **Đọc phạm vi hẹp, như macOS.** `Name` chỉ đọc ở: tiêu đề cửa sổ (`GetWindowTextW`, không qua UI Automation), vùng web `Document` của trình duyệt (để so tiêu đề), phần tử khớp hình dạng của ô, và phần tử bên trong ô (tên Meet, neo, ứng viên). Không `HelpText`, không đọc cây ngoài cửa sổ họp, không gọi `ElementFromHandle` cho cửa sổ không phải cửa sổ họp, **không đăng ký bộ nghe sự kiện** UI Automation, không bấm, không gõ. Lý do không chạm vào cửa sổ khác: Chromium (Teams mới, Chrome, Edge) có thể bật chế độ trợ năng của nó khi thấy một khách UI Automation; hạn chế điều đó vào cửa sổ họp (cũng như macOS chỉ bật `AXEnhancedUserInterface` khi có cửa sổ họp). **Chưa kiểm** tác động thật: Task 12 đo, Task 13 Step 4 kiểm Chrome có tự tắt chế độ đó khi bộ đọc dừng không.
10. **Hạn chờ 0,2 s mỗi lệnh** (spec 6.2, §10): `IUIAutomation2::SetConnectionTimeout(200)` và `SetTransactionTimeout(200)` ngay khi tạo `ComBackend` (thay `AXUIElementSetMessagingTimeout`; có từ Windows 8.1, app đòi Windows 10 trở lên). Lệnh quá hạn (`UIA_E_TIMEOUT`) tính vào `UiaTree::timeouts`, ra `Blocked` sau 5 lượt liền.
11. **Nhịp và ngân sách y như macOS** (QĐ 13 của 04): 1 lần/giây, 4 lần/giây khi cần; lượt đầy đủ mỗi 3 s; quét cửa sổ mỗi 2 s; ≤ 3 000 lệnh đọc (mỗi lần gọi `Tree`, đếm bởi `Metered`) và ≤ 30 ms cho cả lượt. **Chi phí thật của một lệnh UI Automation chưa biết** (qua COM sang tiến trình khác, thường lớn hơn một lệnh Accessibility); nếu 30 ms chỉ đủ cho vài chục lệnh thì lượt đầy đủ trải ra nhiều lượt (đúng thiết kế của `Walk`) và ô đầu tiên có thể mất vài giây mới thấy. Task 12 đo; phương án nếu không đạt: lấy cả cây con một lệnh (bộ nhớ đệm cây con) ở `ComBackend`, không đổi trait (xem "Để kế hoạch sau").
12. **Đo chi phí bằng giây CPU, không bằng số lệnh và năng lượng** (spec 6.8 dùng hai cái đó trên macOS): Windows không cho số lệnh hay năng lượng từng tiến trình mà không cần quyền quản trị. `chay-05.ps1 -Che do` đo giây CPU của app họp thêm ở ba mức (không đọc, 1 lần/giây, 4 lần/giây) và của `uia-record`; thêm số lệnh đọc và thời gian lượt từ `uia-record stats`.
13. **Fixture Windows cùng định dạng macOS** (`độ sâu|role|subrole|title|desc|value|ident|help|dom|lớp`): `uia-record fixture` ghi, `make_fixture.py` (nhận cả khóa `lines` và vai trò Windows) ẩn danh, `FixtureTree` đọc. Bản ghi gốc (có tên thật) chỉ ở `$DATA`; vào repo chỉ sau khi người điều phối hay chủ dự án duyệt bản in `review`, như 04 Task 3.
14. **`app_version` để trống trên Windows** (`Sample.app_version = None`): phiên bản app họp của `ReaderState` phục vụ báo cáo `speaker_health` (kế hoạch 06). Teams mới là gói MSIX trong thư mục `WindowsApps` (đọc file phiên bản của file chạy ở đó thường bị từ chối): kế hoạch 06 chọn cách lấy (xem "Để kế hoạch sau").
15. **A-spk4 trên i5 để kế hoạch 07.** Bộ `latency-bench session` cần `asr-worker`, `llama-server` và model; không có trong gói Windows. Kế hoạch này đo **chi phí của bộ đọc** (QĐ 12) trên i5 làm đầu vào cho A-spk4; nghiệm thu A-spk4 trên i5 ở 07 (spec 11, 12).
16. **Gói chạy cho chủ dự án gộp được với gói 02b**: `win-pack-02.zip` (nhận giọng trên i5) vẫn chờ chủ dự án; lần ngồi máy Windows nên chạy cả `chay-tat-ca.ps1` của gói đó và `chay-05.ps1` của gói này.
17. **Không sửa `reader::macos`, `ax-record`, giao thức, app (`src-tauri`), pipeline.** Windows không cần thay đổi nào ở các chỗ đó: `ReaderPlatform::Windows` đã có, dòng mời chỉ theo `ReaderStatus::NoPermission` (Windows không phát ra), `names_setup` đã gửi `eui_marker` (Windows bỏ qua). Task 8 Step 5 kiểm bằng lệnh tìm.
18. **Không commit** (đầu file).

## Cấu trúc file

"05" là file này (Task 0–8); "05b" là file đi kèm (Task 9–15).

| File | Việc | Task |
|---|---|---|
| Sửa `crates/speaker-recipe/src/lib.rs` | `Os::{web_role, window_role, static_text_role}` | 1 |
| Sửa `crates/speaker-worker/src/reader/extract.rs` | bộ duyệt dùng ba hàm trên | 1 |
| Tạo `crates/speaker-worker/src/reader/uia_tree.rs`; sửa `reader/mod.rs` | `UiaBackend`, `UiaTree`, ánh xạ, phân loại lỗi | 2 |
| Tạo `scripts/speaker-recipes/fixtures/{teams,meet}-windows.recipes.json`, `zoom-windows-explore.recipes.json` | công thức ứng viên (đoán) | 3 |
| Tạo `crates/speaker-worker/src/reader/winscan.rs` | tìm cửa sổ họp | 4 |
| Tạo `crates/speaker-worker/src/reader/{windowset,stats}.rs` | điều phối lượt đọc, thống kê | 5 |
| Tạo `crates/speaker-worker/src/reader/uia.rs`; sửa `reader/mod.rs`, `session.rs` | `ComBackend`, `Win32Desktop`, `LiveReader`, `spawn`, `PLATFORM`, `reader_setup` | 6 |
| Tạo `crates/speaker-worker/src/bin/uia-record.rs`; sửa `scripts/speaker-recipes/{make_fixture.py,test_make_fixture.py}` | công cụ ghi và đo | 7 |
| Tạo `$DATA/win-pack-05-nguon/*`, `$DATA/win-pack-05.zip`; tạo `$B/results/05-windows.md` | gói Windows | 9 (05b) |
| Sửa `scripts/speaker-recipes/recipes.json`, `fixtures/*`, `names/track.rs` (test), `reader/tree.rs` (test) | công thức Windows thật, fixture, độ khớp | 11 (05b) |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Nhánh, trạng thái, đĩa**

Run: `cd $W && git branch --show-current && git log --oneline -1 && git status --short | wc -l && git diff --shortstat Cargo.lock && df -k /System/Volumes/Data | tail -1 | awk '{printf "%.1f GiB trống\n", $4/1048576}'`
Expected: `phan-biet-nguoi-noi`; một dòng commit; số dòng `git status` và dòng `git diff --shortstat Cargo.lock` (ghi lại, dùng đối chiếu ở các Mốc kiểm; có hai file kế hoạch 05, 05b chưa track); còn trống ≥ 14 GiB (dưới thì dừng, báo chủ dự án).

- [ ] **Step 2: Test của các crate sẽ sửa** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-recipe 2>&1 | grep -E "^test result"; cargo test -p speaker-worker 2>&1 | grep -E "^test result"; cd $W && python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -3`
Expected (mốc đã biết sau 04b Task 18; lệch thì ghi số thật): `speaker-recipe` **7** đạt; `speaker-worker` lib **139 đạt, 5 bỏ qua**, `worker_process` **10** đạt; `test_make_fixture.py` **6** test `OK`. Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 3: Công cụ cross Windows có sẵn**

Run: `cd $W && rustup target list --installed | grep -E "x86_64-pc-windows-(msvc|gnu)"; which x86_64-w64-mingw32-gcc x86_64-w64-mingw32-objdump clang; test -x scripts/fake-llvm-rc && test -x scripts/fake-pkg-config && echo "script giả có"`
Expected: hai target `x86_64-pc-windows-gnu` và `x86_64-pc-windows-msvc`; ba đường dẫn công cụ; `script giả có`. Thiếu `x86_64-w64-mingw32-gcc` (`brew install mingw-w64`) hay target (`rustup target add …`) thì cài rồi tiếp (không cần hỏi: công cụ build, không phải thư viện của app).

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && git status --short | wc -l`
Expected: bằng số ghi ở Step 1. Không commit.

---

### Task 1: Vai trò theo hệ điều hành trong bộ duyệt

Bộ duyệt `reader::extract` (04) cứng ba tên vai trò của macOS: `AXWebArea` (vùng web của trình duyệt, ở `Walk::visit` và `dump_lines`), `AXStaticText` (chữ tĩnh chứa tên ô Meet, ở `first_text`) và dòng cửa sổ `AXWindow|AXStandardWindow` của `dump_lines`. Trên Windows các vai trò là `Document`, `Text`, `Window`. Công thức đã biết hệ điều hành của nó (`AppRecipe::os`), nên cho `Os` ba hàm trả tên đó và để bộ duyệt hỏi công thức. Hành vi macOS không đổi (cả bộ test của 04 vẫn đạt).

**Files:**
- Modify: `crates/speaker-recipe/src/lib.rs` (impl `Os`, doc của `Attrs`, test)
- Modify: `crates/speaker-worker/src/reader/extract.rs` (`Walk::visit`, `tile_ref`, `first_text`, `dump_lines`)

- [ ] **Step 1: Test (đỏ)** — thêm vào mod `tests` của `speaker-recipe`:

Trong `crates/speaker-recipe/src/lib.rs`, thay

```rust
    #[test]
    fn matchers_check_every_given_field() {
```

bằng

```rust
    /// Kế hoạch 05: vai trò của vùng web và của cửa sổ theo hệ điều hành.
    #[test]
    fn web_and_window_roles_follow_the_os() {
        assert_eq!(Os::Macos.web_role(), "AXWebArea");
        assert_eq!(Os::Windows.web_role(), "Document");
        assert_eq!(Os::Macos.static_text_role(), "AXStaticText");
        assert_eq!(Os::Windows.static_text_role(), "Text");
        assert_eq!(Os::Macos.window_role(), ("AXWindow", "AXStandardWindow"));
        assert_eq!(Os::Windows.window_role(), ("Window", ""));
    }

    #[test]
    fn matchers_check_every_given_field() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-recipe 2>&1 | grep -E "^error|no method named" | head -3`
Expected: lỗi biên dịch `no method named \`web_role\` found for enum \`Os\``.

- [ ] **Step 3: Mã** — ba hàm của `Os` và doc của `Attrs`:

Trong `crates/speaker-recipe/src/lib.rs`, thay

```rust
    }
}

/// Thuộc tính một phần tử giao diện mà bộ đọc dùng (macOS: AXRole, AXSubrole, AXTitle, AXDescription, AXValue, AXIdentifier,
/// AXDOMIdentifier, AXDOMClassList; Windows ở kế hoạch 05). Có thể chứa chữ của app họp: không in ra log.
```

bằng

```rust
    }

    /// Vai trò của phần tử gốc "vùng web" trong cây giao diện của trình duyệt (spec §6.2): bộ đọc chỉ đọc chữ trong vùng web có
    /// tiêu đề khớp công thức. macOS: `AXWebArea`; Windows (UI Automation): `Document`.
    pub fn web_role(self) -> &'static str {
        match self {
            Os::Macos => "AXWebArea",
            Os::Windows => "Document",
        }
    }

    /// Vai trò của chữ tĩnh (tên của ô Meet là chữ tĩnh đầu tiên trong ô, `NameFrom::Text`). macOS: `AXStaticText`; Windows: `Text`.
    pub fn static_text_role(self) -> &'static str {
        match self {
            Os::Macos => "AXStaticText",
            Os::Windows => "Text",
        }
    }

    /// Vai trò và vai trò phụ của dòng cửa sổ trong bản ghi cây định dạng fixture (`reader::extract::dump_lines`).
    pub fn window_role(self) -> (&'static str, &'static str) {
        match self {
            Os::Macos => ("AXWindow", "AXStandardWindow"),
            Os::Windows => ("Window", ""),
        }
    }
}

/// Thuộc tính một phần tử giao diện mà bộ đọc dùng. macOS: AXRole, AXSubrole, AXTitle, AXDescription, AXValue, AXIdentifier,
/// AXDOMIdentifier, AXDOMClassList. Windows (UI Automation, kế hoạch 05): `role` là tên loại điều khiển ("Button", "MenuItem",
/// "Group", "Document"…), `subrole` là vai trò ARIA, `title` là `Name` (kèm `value` khi là "Text"), `ident` là `AutomationId`,
/// `classes` là các từ của `ClassName`; `desc` và `dom_id` để trống. Có thể chứa chữ của app họp: không in ra log.
```

- [ ] **Step 4: Bộ duyệt dùng ba hàm đó** — năm chỗ trong `extract.rs`:

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
            if t.role(&node).as_deref() == Some("AXWebArea") {
```

bằng

```rust
            if t.role(&node).as_deref() == Some(app.os.web_role()) {
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
            let (n, text) = first_text(t, &node)?;
```

bằng

```rust
            let (n, text) = first_text(t, &node, app.os.static_text_role())?;
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
fn first_text<T: Tree>(t: &mut T, tile: &T::Node) -> Option<(T::Node, String)> {
```

bằng

```rust
fn first_text<T: Tree>(t: &mut T, tile: &T::Node, static_text: &str) -> Option<(T::Node, String)> {
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
        if a.role == "AXStaticText" && t.text(&n, &mut a) && !a.value.trim().is_empty() {
```

bằng

```rust
        if a.role == static_text && t.text(&n, &mut a) && !a.value.trim().is_empty() {
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
    let mut out = vec![format!("0|AXWindow|AXStandardWindow|{}||||||", clean_field(title))];
```

bằng

```rust
    let (window_role, window_subrole) = app.os.window_role();
    let mut out = vec![format!("0|{window_role}|{window_subrole}|{}||||||", clean_field(title))];
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
            if t.role(&n).as_deref() == Some("AXWebArea") {
```

bằng

```rust
            if t.role(&n).as_deref() == Some(app.os.web_role()) {
```

Trong `crates/speaker-worker/src/reader/extract.rs`, thay

```rust
                    a.role = "AXWebArea".into();
```

bằng

```rust
                    a.role = app.os.web_role().into();
```

- [ ] **Step 5: Chạy, thấy xanh; macOS không đổi**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-recipe 2>&1 | grep -E "^test result"; cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result"`
Expected: `speaker-recipe` **8** đạt; `speaker-worker` lib **139** đạt, 5 bỏ qua (không đổi: mọi test macOS của `reader::extract`, `names::*` vẫn đạt, kể cả `meet_reads_text_only_inside_its_web_area` và `dumped_lines_read_back_to_the_same_tiles`).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-recipe -p speaker-worker && cargo fmt -p speaker-recipe -p speaker-worker -- --check && cargo clippy -p speaker-recipe -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short | wc -l`
Expected: sạch; `Finished`; số dòng `git status` tăng 0 so với Task 0 Step 1 (chỉ sửa file đã có). Không commit.

---

### Task 2: `UiaTree`: cây UI Automation qua trait `Tree`

**Files:**
- Create: `crates/speaker-worker/src/reader/uia_tree.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs`

- [ ] **Step 1: Khai báo module**

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
pub mod tree;
```

bằng

```rust
pub mod tree;
pub mod uia_tree;
```

- [ ] **Step 2: Test trước** — tạo `crates/speaker-worker/src/reader/uia_tree.rs` chỉ với phần test dưới đây (mod `tests` của file; **chưa có mã nào ngoài nó**). `Fake` là backend giả dùng lại ở Task 3.

```rust
#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Phần tử giả: hình dạng, `Name` và con.
    pub(crate) struct FakeNode {
        pub shape: RawShape,
        pub name: String,
        pub kids: Vec<usize>,
    }

    /// Backend giả: một cây trong bộ nhớ, đếm từng loại lệnh, tiêm lỗi.
    #[derive(Default)]
    pub(crate) struct Fake {
        pub nodes: Vec<FakeNode>,
        pub shape_calls: u32,
        pub name_calls: u32,
        pub children_calls: u32,
        pub fail: Option<UiaError>,
    }

    impl Fake {
        pub fn add(
            &mut self,
            parent: Option<usize>,
            control_type: i32,
            aria: &str,
            id: &str,
            class: &str,
            name: &str,
        ) -> usize {
            let i = self.nodes.len();
            self.nodes.push(FakeNode {
                shape: RawShape {
                    control_type,
                    aria_role: aria.into(),
                    automation_id: id.into(),
                    class_name: class.into(),
                },
                name: name.into(),
                kids: Vec::new(),
            });
            if let Some(p) = parent {
                self.nodes[p].kids.push(i);
            }
            i
        }
    }

    impl UiaBackend for Fake {
        type El = usize;

        fn shape(&mut self, el: &usize) -> Result<RawShape, UiaError> {
            self.shape_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el].shape.clone())
        }

        fn name(&mut self, el: &usize) -> Result<String, UiaError> {
            self.name_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el].name.clone())
        }

        fn children(&mut self, el: &usize) -> Result<Vec<(usize, RawShape)>, UiaError> {
            self.children_calls += 1;
            if let Some(e) = self.fail {
                return Err(e);
            }
            Ok(self.nodes[*el]
                .kids
                .iter()
                .map(|&k| (k, self.nodes[k].shape.clone()))
                .collect())
        }
    }

    const GROUP: i32 = 50026;
    const TEXT: i32 = 50020;
    const MENU_ITEM: i32 = 50011;

    #[test]
    fn control_types_have_names() {
        assert_eq!(control_type_name(50000), "Button");
        assert_eq!(control_type_name(MENU_ITEM), "MenuItem");
        assert_eq!(control_type_name(GROUP), "Group");
        assert_eq!(control_type_name(TEXT), "Text");
        assert_eq!(control_type_name(50030), "Document");
        assert_eq!(control_type_name(50032), "Window");
        assert_eq!(control_type_name(50040), "AppBar");
        assert_eq!(control_type_name(50041), "Control50041");
        assert_eq!(control_type_name(0), "Control0");
        assert_eq!(control_type_name(-5), "Control-5");
    }

    /// Mã lỗi COM và UI Automation thường gặp (kiểm với `windows` 0.62.2: `UIA_E_TIMEOUT` 2148734213, `UIA_E_ELEMENTNOTAVAILABLE`
    /// 2147746305, `E_ACCESSDENIED` 0x80070005).
    #[test]
    fn hresults_are_classified() {
        assert_eq!(classify_hresult(2_148_734_213), UiaError::Timeout);
        assert_eq!(classify_hresult(0x8001_011F), UiaError::Timeout);
        assert_eq!(classify_hresult(2_147_746_305), UiaError::Gone);
        assert_eq!(classify_hresult(0x8007_06BA), UiaError::Gone);
        assert_eq!(classify_hresult(0x8007_0005), UiaError::Denied);
        assert_eq!(classify_hresult(0x8000_4005), UiaError::Other);
        assert_eq!(classify_hresult(0), UiaError::Other);
    }

    #[test]
    fn raw_shapes_become_attrs_without_text() {
        let raw = RawShape {
            control_type: GROUP,
            aria_role: "menuitem".into(),
            automation_id: "call-duration".into(),
            class_name: "fui-Flex  vdi-frame-occlusion ".into(),
        };
        let a = attrs_of(&raw);
        assert_eq!(
            (a.role.as_str(), a.subrole.as_str(), a.ident.as_str()),
            ("Group", "menuitem", "call-duration")
        );
        assert_eq!(a.classes, ["fui-Flex", "vdi-frame-occlusion"]);
        assert!(a.dom_id.is_empty() && !a.has_text());
        let many = RawShape {
            class_name: (0..40).map(|i| format!("c{i}")).collect::<Vec<_>>().join(" "),
            ..RawShape::default()
        };
        assert_eq!(attrs_of(&many).classes.len(), MAX_CLASS_TOKENS);
    }

    /// QĐ 3: hình dạng của con đi cùng lệnh lấy con, đọc lại trong cùng lượt không tốn lệnh; sang lượt mới thì đọc lại.
    #[test]
    fn child_shapes_come_with_the_children_command_within_a_pass() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        let a = f.add(Some(root), MENU_ITEM, "menuitem", "", "fui-Flex", "Lan");
        f.add(Some(root), GROUP, "", "", "", "");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let kids = t.children(&UiaNode::new(root));
        assert_eq!(kids.len(), 2);
        assert_eq!(t.reads(), 1);
        assert_eq!(t.shape(&kids[0]).unwrap().role, "MenuItem");
        assert_eq!(t.role(&kids[1]).as_deref(), Some("Group"));
        assert_eq!((t.reads(), t.backend().shape_calls), (1, 0), "không lệnh nào thêm");
        t.begin_pass();
        assert_eq!(t.reads(), 0);
        assert_eq!(t.shape(&kids[0]).unwrap().classes, ["fui-Flex"]);
        assert_eq!((t.reads(), t.backend().shape_calls), (1, 1), "lượt mới đọc lại");
        assert_eq!(t.backend().nodes[a].name, "Lan");
    }

    /// Chữ chỉ đọc khi được hỏi; "Text" cho cả `value` (như `AXValue` của chữ tĩnh); cắt ở 300 ký tự.
    #[test]
    fn names_are_read_on_demand_and_static_text_has_a_value() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), TEXT, "", "", "", &"ạ".repeat(500));
        f.add(Some(root), MENU_ITEM, "", "", "", "Minh, muted");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let kids = t.children(&UiaNode::new(root));
        assert_eq!(t.backend().name_calls, 0, "lấy con không đọc chữ");
        let mut a = t.shape(&kids[0]).unwrap();
        assert!(t.text(&kids[0], &mut a));
        assert_eq!(
            (a.title.chars().count(), a.value.chars().count()),
            (MAX_TEXT_CHARS, MAX_TEXT_CHARS)
        );
        let mut b = t.shape(&kids[1]).unwrap();
        assert!(t.text(&kids[1], &mut b));
        assert_eq!(
            (b.title.as_str(), b.value.as_str(), b.label()),
            ("Minh, muted", "", "Minh, muted")
        );
        assert_eq!(t.backend().name_calls, 2);
    }

    /// Lệnh lỗi thì không có kết quả; quá hạn chờ và bị chặn được đếm riêng cho lượt này.
    #[test]
    fn failing_commands_are_counted() {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), GROUP, "", "", "", "");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let node = UiaNode::new(root);
        t.backend_mut().fail = Some(UiaError::Timeout);
        assert!(t.shape(&node).is_none() && t.children(&node).is_empty());
        assert!(!t.text(&node, &mut Attrs::default()));
        t.backend_mut().fail = Some(UiaError::Denied);
        assert!(t.shape(&node).is_none());
        t.backend_mut().fail = Some(UiaError::Gone);
        assert!(t.shape(&node).is_none());
        assert_eq!((t.reads(), t.timeouts(), t.denied()), (5, 3, 1));
        t.begin_pass();
        assert_eq!((t.reads(), t.timeouts(), t.denied()), (0, 0, 0));
    }

}
```

- [ ] **Step 3: Chạy, thấy đỏ**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- reader::uia_tree 2>&1 | grep -E "^error" | sort | uniq -c | head -5`
Expected: lỗi biên dịch không tìm thấy `UiaBackend`, `UiaError`, `RawShape`, `UiaTree`, `classify_hresult`, `control_type_name`, `attrs_of`, `MAX_TEXT_CHARS`.

- [ ] **Step 4: Mã** — chèn phần này vào **đầu** file (trước dòng `#[cfg(test)]`):

```rust
//! Cây UI Automation qua trait [`Tree`] (spec 2026-10-26-phan-biet-nguoi-noi §6.2, Windows; kế hoạch 05). Phần này thuần Rust, biên
//! dịch và test trên mọi nền tảng; lệnh UI Automation thật nằm sau trait [`UiaBackend`] (Windows: `reader::uia::ComBackend`).
//!
//! - Ánh xạ sang [`Attrs`] (QĐ 2 của kế hoạch 05): `role` = tên loại điều khiển, `subrole` = vai trò ARIA, `ident` =
//!   `AutomationId`, `classes` = các từ của `ClassName`, `title` = `Name`; `value` = `Name` khi là "Text" (chữ tĩnh, như
//!   `AXValue` của `AXStaticText` mà công thức Meet đọc). `desc` và `dom_id` để trống. Không đọc `HelpText`.
//! - Hình dạng (không chữ) và chữ đọc bằng hai lệnh riêng: hình dạng đi cùng lệnh lấy con (một lệnh cho cả danh sách con), chữ
//!   chỉ đọc khi bộ duyệt hỏi (QĐ 3 của kế hoạch 04: `Name` không nằm trong bộ nhớ đệm của hình dạng).
//! - Hình dạng của con đã có sẵn trong lượt đọc hiện tại thì [`Tree::shape`] không tốn lệnh nào (QĐ 3 của kế hoạch 05); sang lượt
//!   đọc mới ([`UiaTree::begin_pass`]) thì đọc lại, vì bộ đọc nhanh phải thấy trạng thái mới của ô và neo.

use speaker_recipe::Attrs;

use super::tree::Tree;

/// Chữ đọc được cắt ở chừng này ký tự (như bộ đọc macOS).
pub const MAX_TEXT_CHARS: usize = 300;
/// Số từ tối đa của `ClassName` (như `AXDOMClassList` của bộ đọc macOS).
pub const MAX_CLASS_TOKENS: usize = 32;

/// Lỗi của một lệnh UI Automation, đã phân loại.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UiaError {
    /// Quá hạn chờ: app họp treo hay bận.
    Timeout,
    /// Phần tử không còn (cửa sổ đóng, ô bị dựng lại, tiến trình thoát).
    Gone,
    /// Bị chặn: thường là app họp chạy với quyền cao hơn app này.
    Denied,
    Other,
}

/// Phân loại một mã `HRESULT` (viết dạng số không dấu) của UI Automation và COM.
pub fn classify_hresult(hr: u32) -> UiaError {
    match hr {
        // UIA_E_TIMEOUT, RPC_E_TIMEOUT.
        0x8013_1505 | 0x8001_011F => UiaError::Timeout,
        // UIA_E_ELEMENTNOTAVAILABLE, RPC_S_SERVER_UNAVAILABLE, RPC_S_CALL_FAILED, RPC_E_DISCONNECTED, RPC_E_SERVER_DIED.
        0x8004_0201 | 0x8007_06BA | 0x8007_06BE | 0x8001_0108 | 0x8001_0007 => UiaError::Gone,
        // E_ACCESSDENIED.
        0x8007_0005 => UiaError::Denied,
        _ => UiaError::Other,
    }
}

/// Hình dạng thô của một phần tử (không có chữ), đúng bốn thuộc tính bộ đọc lấy.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RawShape {
    pub control_type: i32,
    pub aria_role: String,
    pub automation_id: String,
    pub class_name: String,
}

/// Lệnh UI Automation mà bộ đọc dùng. Mỗi hàm là **một** lệnh qua tiến trình của app họp.
pub trait UiaBackend {
    type El: Clone;
    /// Hình dạng mới nhất của một phần tử.
    fn shape(&mut self, el: &Self::El) -> Result<RawShape, UiaError>;
    /// `Name` mới nhất của một phần tử.
    fn name(&mut self, el: &Self::El) -> Result<String, UiaError>;
    /// Các con trực tiếp, kèm hình dạng đọc cùng lệnh.
    fn children(&mut self, el: &Self::El) -> Result<Vec<(Self::El, RawShape)>, UiaError>;
}

/// Tên của một loại điều khiển UI Automation (`UIA_*ControlTypeId`, 50000–50040; đối chiếu với `windows` 0.62.2). Loại lạ: `Control<mã>`.
pub fn control_type_name(id: i32) -> String {
    const NAMES: [&str; 41] = [
        "Button",
        "Calendar",
        "CheckBox",
        "ComboBox",
        "Edit",
        "Hyperlink",
        "Image",
        "ListItem",
        "List",
        "Menu",
        "MenuBar",
        "MenuItem",
        "ProgressBar",
        "RadioButton",
        "ScrollBar",
        "Slider",
        "Spinner",
        "StatusBar",
        "Tab",
        "TabItem",
        "Text",
        "ToolBar",
        "ToolTip",
        "Tree",
        "TreeItem",
        "Custom",
        "Group",
        "Thumb",
        "DataGrid",
        "DataItem",
        "Document",
        "SplitButton",
        "Window",
        "Pane",
        "Header",
        "HeaderItem",
        "Table",
        "TitleBar",
        "Separator",
        "SemanticZoom",
        "AppBar",
    ];
    usize::try_from(id - 50_000)
        .ok()
        .and_then(|i| NAMES.get(i))
        .map_or_else(|| format!("Control{id}"), |n| (*n).to_string())
}

fn cut(s: &str) -> String {
    s.chars().take(MAX_TEXT_CHARS).collect()
}

/// [`RawShape`] thành [`Attrs`] không chữ.
pub fn attrs_of(raw: &RawShape) -> Attrs {
    Attrs {
        role: control_type_name(raw.control_type),
        subrole: cut(&raw.aria_role),
        ident: cut(&raw.automation_id),
        classes: raw
            .class_name
            .split_whitespace()
            .take(MAX_CLASS_TOKENS)
            .map(String::from)
            .collect(),
        ..Attrs::default()
    }
}

/// Một phần tử của cây. `shape` là hình dạng đã đọc sẵn cùng lệnh lấy con, kèm số thứ tự lượt đọc đó.
#[derive(Clone)]
pub struct UiaNode<E> {
    el: E,
    shape: Option<(u64, Attrs)>,
}

impl<E> UiaNode<E> {
    /// Phần tử chưa có hình dạng đọc sẵn (cửa sổ họp, phần tử từ `ElementFromHandle`).
    pub fn new(el: E) -> Self {
        Self { el, shape: None }
    }

    pub fn element(&self) -> &E {
        &self.el
    }
}

/// Cây UI Automation thật hay giả, qua [`UiaBackend`]. Đếm số lệnh và số lệnh lỗi trong lượt đọc hiện tại.
pub struct UiaTree<B: UiaBackend> {
    backend: B,
    epoch: u64,
    reads: u32,
    timeouts: u32,
    denied: u32,
}

impl<B: UiaBackend> UiaTree<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend,
            epoch: 0,
            reads: 0,
            timeouts: 0,
            denied: 0,
        }
    }

    pub fn backend(&self) -> &B {
        &self.backend
    }

    pub fn backend_mut(&mut self) -> &mut B {
        &mut self.backend
    }

    /// Bắt đầu một lượt đọc: hình dạng đọc sẵn của lượt trước hết hạn, đếm lại từ đầu.
    pub fn begin_pass(&mut self) {
        self.epoch += 1;
        self.reads = 0;
        self.timeouts = 0;
        self.denied = 0;
    }

    /// Số lệnh UI Automation đã gửi trong lượt này.
    pub fn reads(&self) -> u32 {
        self.reads
    }

    /// Số lệnh quá hạn chờ trong lượt này.
    pub fn timeouts(&self) -> u32 {
        self.timeouts
    }

    /// Số lệnh bị chặn trong lượt này.
    pub fn denied(&self) -> u32 {
        self.denied
    }

    fn note<T>(&mut self, r: Result<T, UiaError>) -> Option<T> {
        match r {
            Ok(v) => Some(v),
            Err(e) => {
                match e {
                    UiaError::Timeout => self.timeouts += 1,
                    UiaError::Denied => self.denied += 1,
                    UiaError::Gone | UiaError::Other => {}
                }
                None
            }
        }
    }

    fn fresh(&self, n: &UiaNode<B::El>) -> Option<Attrs> {
        n.shape
            .as_ref()
            .filter(|(epoch, _)| *epoch == self.epoch)
            .map(|(_, a)| a.clone())
    }
}

impl<B: UiaBackend> Tree for UiaTree<B> {
    type Node = UiaNode<B::El>;

    fn role(&mut self, n: &Self::Node) -> Option<String> {
        self.shape(n).map(|a| a.role)
    }

    fn shape(&mut self, n: &Self::Node) -> Option<Attrs> {
        if let Some(a) = self.fresh(n) {
            return Some(a);
        }
        self.reads += 1;
        let r = self.backend.shape(&n.el);
        self.note(r).map(|raw| attrs_of(&raw))
    }

    fn text(&mut self, n: &Self::Node, attrs: &mut Attrs) -> bool {
        self.reads += 1;
        let r = self.backend.name(&n.el);
        let Some(name) = self.note(r) else { return false };
        let name = cut(&name);
        if attrs.role == "Text" {
            attrs.value.clone_from(&name);
        }
        attrs.title = name;
        true
    }

    fn children(&mut self, n: &Self::Node) -> Vec<Self::Node> {
        self.reads += 1;
        let r = self.backend.children(&n.el);
        let epoch = self.epoch;
        self.note(r)
            .unwrap_or_default()
            .into_iter()
            .map(|(el, raw)| UiaNode {
                el,
                shape: Some((epoch, attrs_of(&raw))),
            })
            .collect()
    }
}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo test -p speaker-worker --lib -- reader::uia_tree 2>&1 | grep -E "^test |^test result"`
Expected: 6 test `ok` (`control_types_have_names`, `hresults_are_classified`, `raw_shapes_become_attrs_without_text`, `child_shapes_come_with_the_children_command_within_a_pass`, `names_are_read_on_demand_and_static_text_has_a_value`, `failing_commands_are_counted`); `test result: ok. 6 passed`.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result" && git status --short | wc -l`
Expected: sạch; `Finished`; lib **145** đạt, 5 bỏ qua; số dòng `git status` tăng 1 (file mới `uia_tree.rs` nằm trong thư mục `reader/` đã untracked từ 04: có thể tăng 0). Không commit.

---

### Task 3: Công thức ứng viên cho Windows và đường đọc tổng hợp

Công thức đoán (QĐ 8) và ba test cho thấy chuỗi `UiaTree` → bộ duyệt chung → `TileSample` chạy đúng trên một cây **tổng hợp** giống Teams và Meet. Đây không phải bằng chứng Windows đọc được Teams: chỉ bằng chứng ống dẫn đúng.

**Files:**
- Create: `scripts/speaker-recipes/fixtures/teams-windows.recipes.json`, `meet-windows.recipes.json`, `zoom-windows-explore.recipes.json`
- Modify: `crates/speaker-worker/src/reader/uia_tree.rs` (thêm test)

- [ ] **Step 1: Test (đỏ)** — thay dấu `}` cuối cùng của `uia_tree.rs` (dấu đóng mod `tests`) bằng khối dưới đây (đã gồm dấu `}` đóng mod):

```rust
    // ---- Đường đọc Windows từ đầu tới cuối trên cây TỔNG HỢP (không phải bản ghi thật) ----

    fn windows_recipes(file: &str) -> speaker_recipe::Recipes {
        let path = crate::reader::tree::tests::fixture_path(file);
        let r = speaker_recipe::parse(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert!(r.dropped.is_empty(), "{file}: {:?}", r.dropped);
        r
    }

    /// Cây giống Teams (suy từ bản ghi macOS: ô video là `MenuItem` mang nhãn, khung đang nói là con `Group` có lớp
    /// `vdi-frame-occlusion`, nút rời cuộc gọi có id `hangup-button`). **Tổng hợp**: tên lớp, vai trò, id trên Windows chưa có bản
    /// ghi thật (kế hoạch 05 Task 11); test này chỉ kiểm đường ống: ánh xạ, bộ duyệt chung, lệnh đọc.
    struct TeamsLike {
        fake: Fake,
        root: usize,
        lan: usize,
        hangup: usize,
    }

    fn teams_like() -> TeamsLike {
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        let pane = f.add(Some(root), 50033, "", "", "", "");
        let hangup = f.add(Some(pane), 50000, "button", "hangup-button", "fui-Button", "Leave");
        let lan = f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Lan (Guest), Context menu is available",
        );
        f.add(Some(lan), GROUP, "", "", "fui-Flex vdi-frame-occlusion", "");
        f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Minh (Guest), muted, Context menu is available",
        );
        f.add(
            Some(pane),
            MENU_ITEM,
            "menuitem",
            "",
            "fui-Flex",
            "Myself video, Hoa Phạm, Muted, Has context menu",
        );
        TeamsLike {
            fake: f,
            root,
            lan,
            hangup,
        }
    }

    #[test]
    fn a_teams_like_uia_tree_gives_names_mics_the_user_and_the_speaking_frame() {
        use crate::reader::extract::{Budget, Walk, sample_round};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("teams-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::Teams).unwrap();
        let TeamsLike { fake, root, lan, .. } = teams_like();
        let mut t = UiaTree::new(fake);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert_eq!(tiles.len(), 3);
        assert_eq!(t.backend().name_calls, 3, "chữ chỉ đọc ở ba ô, không đọc nút hay khung");
        let samples = |t: &mut UiaTree<Fake>| {
            t.begin_pass();
            let round = sample_round(t, &tiles, app, 0, false, &mut Budget::unlimited());
            assert!(!round.gone);
            round.samples
        };
        let s = samples(&mut t);
        let view: Vec<_> = s
            .iter()
            .map(|x| (x.name.as_str(), x.is_self, x.muted, x.anchors.clone()))
            .collect();
        assert_eq!(
            view,
            [
                ("Lan", false, Some(false), vec![Some(1)]),
                ("Minh", false, Some(true), vec![None]),
                ("Hoa Phạm", true, Some(true), vec![None]),
            ]
        );
        // Khung đang nói biến mất: lượt đọc nhanh kế tiếp thấy ngay (hình dạng đọc lại ở lượt mới).
        t.backend_mut().nodes[lan].kids.clear();
        let s = samples(&mut t);
        assert_eq!(s[0].anchors, [None]);
    }

    /// Ba công thức ứng viên cho Windows (đoán từ bản ghi macOS, chưa có bản ghi Windows nào) phải hợp lệ, mỗi mục đúng app và hệ điều hành.
    #[test]
    fn the_candidate_windows_recipes_are_valid() {
        use speaker_recipe::{MeetingApp, Os};
        for (file, apps) in [
            ("teams-windows.recipes.json", vec![MeetingApp::Teams]),
            (
                "meet-windows.recipes.json",
                vec![MeetingApp::MeetChrome, MeetingApp::MeetEdge],
            ),
            ("zoom-windows-explore.recipes.json", vec![MeetingApp::Zoom]),
        ] {
            let r = windows_recipes(file);
            assert!(!r.has_os(Os::Macos), "{file}");
            for app in apps {
                assert!(r.app(Os::Windows, app).is_some(), "{file}: {app:?}");
            }
        }
    }

    /// Không có nút rời cuộc gọi thì không phải cửa sổ họp: không ô nào (như macOS).
    #[test]
    fn without_the_hangup_button_the_window_is_not_a_meeting() {
        use crate::reader::extract::{Budget, Walk};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("teams-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::Teams).unwrap();
        let TeamsLike {
            mut fake, root, hangup, ..
        } = teams_like();
        fake.nodes[hangup].shape.automation_id = "other-button".into();
        let mut t = UiaTree::new(fake);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert!(tiles.is_empty());
    }

    /// Trình duyệt: chỉ vào vùng web (`Document`) có tên khớp tiêu đề Meet; bên ngoài (thẻ, thanh địa chỉ) chỉ đọc vai trò.
    #[test]
    fn meet_like_tree_reads_text_only_inside_the_matching_document() {
        use crate::reader::extract::{Budget, Walk};
        use speaker_recipe::{MeetingApp, Os};
        let recipes = windows_recipes("meet-windows.recipes.json");
        let app = recipes.app(Os::Windows, MeetingApp::MeetChrome).unwrap();
        let mut f = Fake::default();
        let root = f.add(None, 50032, "", "", "", "");
        f.add(Some(root), 50000, "", "", "", "Dấu trang riêng");
        let meet = f.add(Some(root), 50030, "", "", "", "Meet - abc-defg-hij");
        let tile = f.add(Some(meet), GROUP, "", "", "oZRSLe", "");
        f.add(Some(tile), GROUP, "", "", "DYfzY cYKTje", "");
        f.add(Some(tile), GROUP, "", "", "qg7mD KXY1yb", "");
        f.add(Some(tile), TEXT, "", "", "", "Lan Nguyễn");
        let gmail = f.add(Some(root), 50030, "", "", "", "Gmail - Hộp thư");
        f.add(Some(gmail), TEXT, "", "", "", "thư riêng");
        let mut t = UiaTree::new(f);
        t.begin_pass();
        let tiles = Walk::new(UiaNode::new(root), 0, app.web_only)
            .step(&mut t, app, &mut Budget::unlimited())
            .unwrap();
        assert_eq!(
            tiles.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(),
            ["Lan Nguyễn"]
        );
        // Tên đọc: hai vùng web (để so tiêu đề) và chữ tên trong ô; không đọc dấu trang hay thư.
        assert_eq!(t.backend().name_calls, 3);
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- reader::uia_tree 2>&1 | grep -E "panicked|No such file|^test result" | head -4`
Expected: bốn test mới đỏ vì không đọc được `teams-windows.recipes.json` (`No such file or directory`); `FAILED. 6 passed; 4 failed`.

- [ ] **Step 3: Công thức Teams (đoán)** — `scripts/speaker-recipes/fixtures/teams-windows.recipes.json`. Bản sao của mục Teams macOS với `os: windows`, `role: MenuItem`, neo `Group`, không `enhanced_ui`. **Chưa có bản ghi Windows nào**: nút rời cuộc gọi có `AutomationId` `hangup-button` hay không, `ô là MenuItem` hay không, tiêu đề cửa sổ Windows ra sao đều là giả định; Task 11 thay bằng điều bản ghi thật cho thấy.

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "teams",
      "os": "windows",
      "window_title": ["^Meeting with ", "^Meeting in ", "^Cuộc họp với ", "^Cuộc họp trong "],
      "confirm_id": "hangup-button",
      "tile": {
        "role": "MenuItem",
        "label": "^(?:(?P<self>Myself video), )?(?P<name>[^,]{1,120}?)(?:, (?P<muted>[Mm]uted))?, (?:Context menu is available|Has context menu)$"
      },
      "name_from": "label",
      "name_suffixes": ["\\s*\\((?:Guest|Khách|Host|Organizer|Người tổ chức|External|Bên ngoài)\\)$"],
      "mic": { "muted_values": ["muted", "Muted"], "absent_means_unmuted": true },
      "speaking": [
        { "kind": "presence", "anchor": { "scope": "child", "role": "Group", "class_token": "vdi-frame-occlusion" } }
      ],
      "delay_ms": 900
    }
  ]
}
```

- [ ] **Step 4: Công thức Meet (đoán)** — `meet-windows.recipes.json`: cùng DOM web của Meet nên lớp CSS giữ nguyên (`oZRSLe`, `DYfzY`, `qg7mD`); `AXGroup` → `Group`. Giới hạn đã biết của Meet (04 QĐ 32: không có chỉ báo ở cửa sổ người nghe) áp dụng cả trên Windows tới khi có bản ghi thật.

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "meet_chrome",
      "os": "windows",
      "window_title": ["^Meet [–-] "],
      "web_only": true,
      "tile": { "role": "Group", "class_token": "oZRSLe" },
      "name_from": "text",
      "self_name": "^(?:Bạn|You)$",
      "speaking": [
        { "kind": "flicker", "anchor": { "scope": "descendant", "class_token": "DYfzY", "max_depth": 6 } },
        { "kind": "deviation", "anchor": { "scope": "descendant", "class_token": "qg7mD", "max_depth": 6 } }
      ],
      "delay_ms": 800
    },
    {
      "app": "meet_edge",
      "os": "windows",
      "window_title": ["^Meet [–-] "],
      "web_only": true,
      "tile": { "role": "Group", "class_token": "oZRSLe" },
      "name_from": "text",
      "self_name": "^(?:Bạn|You)$",
      "speaking": [
        { "kind": "flicker", "anchor": { "scope": "descendant", "class_token": "DYfzY", "max_depth": 6 } },
        { "kind": "deviation", "anchor": { "scope": "descendant", "class_token": "qg7mD", "max_depth": 6 } }
      ],
      "delay_ms": 800
    }
  ]
}
```

- [ ] **Step 5: Công thức Zoom thăm dò** — `zoom-windows-explore.recipes.json`: chỉ để `uia-record` tìm cửa sổ họp Zoom và ghi cây; ô và nhãn lấy từ mô tả của spec §3 (như công thức Zoom tổng hợp của 04), **không** dùng để gán tên.

```json
{
  "schema": 1,
  "version": 1,
  "min_app_version": "0.3.2",
  "apps": [
    {
      "app": "zoom",
      "os": "windows",
      "window_title": ["^Zoom Meeting", "^Cuộc họp Zoom"],
      "tile": {
        "role": "Button",
        "label": "^(?P<name>[^,]{1,120}), Computer audio (?P<muted>muted|unmuted)(?:, Video (?:on|off))?(?P<speaking>, active speaker)?$"
      },
      "name_from": "label",
      "name_suffixes": ["\\s*\\((?:me|tôi|Host|Chủ trì|Co-host|Đồng chủ trì|Guest|Khách)\\)$"],
      "self_name": "\\((?:me|tôi)\\)$",
      "mic": { "muted_values": ["muted"], "absent_means_unmuted": false },
      "speaking": [{ "kind": "label" }],
      "delay_ms": 500
    }
  ]
}
```

- [ ] **Step 6: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- reader::uia_tree reader::tree 2>&1 | grep -E "^test |^test result"`
Expected: 10 test của `uia_tree` `ok` (6 + `a_teams_like_uia_tree_gives_names_mics_the_user_and_the_speaking_frame`, `without_the_hangup_button_the_window_is_not_a_meeting`, `meet_like_tree_reads_text_only_inside_the_matching_document`, `the_candidate_windows_recipes_are_valid`) và 3 test của `reader::tree` `ok` (trong đó `fixtures_have_no_account_ids_links_or_paths` vẫn đạt: ba file JSON mới nằm trong thư mục fixture và không chứa mẫu cấm).

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result" && git status --short | wc -l`
Expected: sạch; `Finished`; lib **149** đạt, 5 bỏ qua; `git status` thêm 3 file JSON mới. Không commit.

---

### Task 4: `winscan`: tìm cửa sổ họp trên Windows

**Files:**
- Create: `crates/speaker-worker/src/reader/winscan.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs`

- [ ] **Step 1: Khai báo module**

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
pub mod uia_tree;
```

bằng

```rust
pub mod uia_tree;
pub mod winscan;
```

- [ ] **Step 2: Test trước** — tạo `winscan.rs` chỉ với mod `tests` dưới đây:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use speaker_recipe::parse;

    /// Bàn làm việc giả: danh sách cửa sổ, và ghi lại những cửa sổ đã bị đọc tiêu đề, những tiến trình đã bị hỏi file chạy.
    #[derive(Default)]
    struct Fake {
        windows: Vec<(RawWindow, &'static str, &'static str, &'static str)>,
        titled: Vec<isize>,
        exe_asked: Vec<u32>,
    }

    impl Fake {
        fn add(&mut self, id: isize, pid: u32, exe: &'static str, title: &'static str) {
            self.windows
                .push((RawWindow { id, pid }, exe, title, "Chrome_WidgetWin_1"));
        }
    }

    impl Desktop for Fake {
        fn top_windows(&mut self) -> Vec<RawWindow> {
            self.windows.iter().map(|w| w.0).collect()
        }

        fn exe_path(&mut self, pid: u32) -> Option<String> {
            self.exe_asked.push(pid);
            self.windows.iter().find(|w| w.0.pid == pid).map(|w| w.1.to_string())
        }

        fn title(&mut self, id: isize) -> String {
            self.titled.push(id);
            self.windows
                .iter()
                .find(|w| w.0.id == id)
                .map(|w| w.2.to_string())
                .unwrap_or_default()
        }

        fn class_name(&mut self, id: isize) -> String {
            self.windows
                .iter()
                .find(|w| w.0.id == id)
                .map(|w| w.3.to_string())
                .unwrap_or_default()
        }
    }

    fn recipes() -> Recipes {
        // Teams (công thức ứng viên) và Meet trên Chrome, Edge: hai file ứng viên gộp thành một.
        let read = |name: &str| std::fs::read_to_string(crate::reader::tree::tests::fixture_path(name)).unwrap();
        let teams: serde_json::Value = serde_json::from_str(&read("teams-windows.recipes.json")).unwrap();
        let meet: serde_json::Value = serde_json::from_str(&read("meet-windows.recipes.json")).unwrap();
        let mut apps = teams["apps"].as_array().unwrap().clone();
        apps.extend(meet["apps"].as_array().unwrap().iter().cloned());
        let json = serde_json::json!({"schema": 1, "version": 1, "min_app_version": "0.3.2", "apps": apps});
        let r = parse(&json.to_string()).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        r
    }

    #[test]
    fn executables_map_to_the_hard_coded_apps() {
        assert_eq!(app_of_exe("ms-teams.exe"), Some(MeetingApp::Teams));
        assert_eq!(
            app_of_exe(r"C:\Program Files\WindowsApps\MSTeams_1_x64__x\MS-Teams.EXE"),
            Some(MeetingApp::Teams)
        );
        assert_eq!(
            app_of_exe(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            Some(MeetingApp::MeetChrome)
        );
        assert_eq!(app_of_exe("C:/x/msedge.exe"), Some(MeetingApp::MeetEdge));
        assert_eq!(app_of_exe("Zoom.exe"), Some(MeetingApp::Zoom));
        assert_eq!(app_of_exe("notepad.exe"), None);
        assert_eq!(app_of_exe("chrome.exe.bak"), None);
        assert_eq!(app_of_exe(r"C:\x\notchrome.exe"), None);
        assert_eq!(app_of_exe(""), None);
    }

    /// QĐ 4: chỉ cửa sổ của file chạy trong danh sách (và có công thức) bị đọc tiêu đề.
    #[test]
    fn titles_of_other_apps_are_never_read() {
        let mut d = Fake::default();
        d.add(1, 100, "notepad.exe", "Meeting with my diary - Notepad");
        d.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        d.add(3, 102, "Zoom.exe", "Zoom Meeting");
        d.add(4, 103, "explorer.exe", "Meeting with taxes");
        let mut s = Scanner::default();
        let found = s.scan(&mut d, &recipes(), None, Instant::now()).unwrap();
        assert_eq!(found.app, MeetingApp::Teams);
        assert_eq!(found.windows.len(), 1);
        assert_eq!(found.windows[0].id, 2);
        assert_eq!(d.titled, [2], "Zoom không có công thức Windows: cũng không đọc tiêu đề");
    }

    #[test]
    fn only_meeting_titles_match_and_the_first_app_by_priority_wins() {
        let mut d = Fake::default();
        d.add(1, 200, "chrome.exe", "Meet - abc-defg-hij - Google Chrome");
        d.add(2, 200, "chrome.exe", "Gmail - Google Chrome");
        d.add(3, 201, "ms-teams.exe", "Chat | Microsoft Teams");
        d.add(4, 201, "ms-teams.exe", "Meeting with Lan | Microsoft Teams");
        let mut s = Scanner::default();
        let found = s.scan(&mut d, &recipes(), None, Instant::now()).unwrap();
        assert_eq!(
            (found.app, found.windows.iter().map(|w| w.id).collect::<Vec<_>>()),
            (MeetingApp::Teams, vec![4])
        );
        // `only` thu hẹp.
        let found = s
            .scan(&mut d, &recipes(), Some(MeetingApp::MeetChrome), Instant::now())
            .unwrap();
        assert_eq!((found.app, found.windows.len()), (MeetingApp::MeetChrome, 1));
        assert!(
            s.scan(&mut d, &recipes(), Some(MeetingApp::MeetEdge), Instant::now())
                .is_none()
        );
    }

    #[test]
    fn at_most_two_windows_per_app() {
        let mut d = Fake::default();
        for i in 0..5 {
            d.add(10 + i, 300, "chrome.exe", "Meet - abc-defg-hij - Google Chrome");
        }
        let found = Scanner::default()
            .scan(&mut d, &recipes(), None, Instant::now())
            .unwrap();
        assert_eq!(found.windows.iter().map(|w| w.id).collect::<Vec<_>>(), [10, 11]);
    }

    /// File chạy được nhớ 30 s theo tiến trình; tiến trình hết cửa sổ thì bị quên; sau 30 s hỏi lại.
    #[test]
    fn executables_are_remembered_for_a_while() {
        let mut d = Fake::default();
        d.add(1, 400, "ms-teams.exe", "Meeting with Lan | Microsoft Teams");
        let (mut s, r, t0) = (Scanner::default(), recipes(), Instant::now());
        s.scan(&mut d, &r, None, t0);
        s.scan(&mut d, &r, None, t0 + Duration::from_secs(2));
        assert_eq!(d.exe_asked, [400], "lần quét thứ hai dùng bản nhớ");
        s.scan(&mut d, &r, None, t0 + EXE_TTL + Duration::from_secs(1));
        assert_eq!(d.exe_asked, [400, 400], "hết hạn thì hỏi lại");
        d.windows.clear();
        assert!(s.scan(&mut d, &r, None, t0 + Duration::from_secs(40)).is_none());
        assert!(s.exes.is_empty(), "tiến trình không còn cửa sổ thì bị quên");
        d.add(2, 400, "notepad.exe", "Meeting with a reused pid");
        assert!(
            s.scan(&mut d, &r, None, t0 + Duration::from_secs(41)).is_none(),
            "số hiệu dùng lại cho app khác"
        );
    }

    #[test]
    fn debug_output_hides_titles() {
        let w = MeetingWindow {
            id: 7,
            title: "Meeting with Lan".into(),
        };
        assert_eq!(format!("{w:?}"), "MeetingWindow(7, tiêu đề 16 ký tự)");
    }
}
```

- [ ] **Step 3: Chạy, thấy đỏ**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- reader::winscan 2>&1 | grep -E "^error" | sort | uniq -c | head -5`
Expected: lỗi biên dịch không tìm thấy `RawWindow`, `Desktop`, `Scanner`, `app_of_exe`, `MeetingApp`, `MeetingWindow`, `EXE_TTL`.

- [ ] **Step 4: Mã** — chèn vào **đầu** file (trước `#[cfg(test)]`):

```rust
//! Tìm cửa sổ họp trên Windows (spec 2026-10-26-phan-biet-nguoi-noi §6.1; kế hoạch 05 QĐ 4). Phần này thuần Rust, test trên mọi nền
//! tảng; hàm Win32 thật nằm sau trait [`Desktop`] (Windows: `reader::uia::Win32Desktop`).
//!
//! Thứ tự đọc là bảo vệ quyền riêng tư (QĐ 3 của kế hoạch 04): trước hết chỉ hỏi cửa sổ thuộc **tiến trình nào** và tiến trình đó
//! là **file chạy nào**; tiêu đề cửa sổ chỉ được đọc khi file chạy nằm trong danh sách viết cứng ([`MeetingApp::windows_exe`]) và
//! có công thức cho Windows. Cửa sổ của mọi app khác không bao giờ bị đọc tiêu đề.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::time::{Duration, Instant};

use speaker_protocol::MeetingApp;
use speaker_recipe::{Os, Recipes};

use super::extract::is_meeting_window;

/// Hai cửa sổ họp mỗi app là đủ (spec §6.1).
pub const MAX_WINDOWS: usize = 2;
/// Số cửa sổ cấp cao nhất xét mỗi lần quét.
pub const MAX_TOP_WINDOWS: usize = 1_024;
/// File chạy của một tiến trình được nhớ chừng này (tiến trình thoát, số hiệu dùng lại cho app khác thì tự hết hạn).
pub const EXE_TTL: Duration = Duration::from_secs(30);

/// Một cửa sổ cấp cao nhất đang hiện: số hiệu (HWND) và tiến trình sở hữu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RawWindow {
    pub id: isize,
    pub pid: u32,
}

/// Hàm hệ thống mà bộ quét dùng.
pub trait Desktop {
    /// Cửa sổ cấp cao nhất đang hiện, theo thứ tự trên xuống dưới. Không đọc tiêu đề.
    fn top_windows(&mut self) -> Vec<RawWindow>;
    /// Đường dẫn hay tên file chạy của tiến trình.
    fn exe_path(&mut self, pid: u32) -> Option<String>;
    fn title(&mut self, id: isize) -> String;
    /// Tên lớp cửa sổ Win32 (công thức dùng làm `window_id`).
    fn class_name(&mut self, id: isize) -> String;
}

/// App họp của một file chạy (danh sách viết cứng, không phân biệt hoa thường, chỉ xét tên file không xét thư mục).
pub fn app_of_exe(path: &str) -> Option<MeetingApp> {
    let file = path.rsplit(['\\', '/']).next()?;
    MeetingApp::ALL
        .into_iter()
        .find(|a| a.windows_exe().eq_ignore_ascii_case(file))
}

/// Cửa sổ họp tìm được. `title` có chữ của app họp: không in ra log.
#[derive(Clone, PartialEq, Eq)]
pub struct MeetingWindow {
    pub id: isize,
    pub title: String,
}

impl fmt::Debug for MeetingWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "MeetingWindow({}, tiêu đề {} ký tự)",
            self.id,
            self.title.chars().count()
        )
    }
}

/// App họp đầu tiên (theo ưu tiên của [`MeetingApp::ALL`]) có cửa sổ họp, và các cửa sổ họp của nó.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Found {
    pub app: MeetingApp,
    pub windows: Vec<MeetingWindow>,
}

/// Bộ quét, nhớ file chạy của từng tiến trình giữa các lần quét.
#[derive(Default)]
pub struct Scanner {
    exes: HashMap<u32, (Instant, Option<MeetingApp>)>,
}

impl Scanner {
    /// `only`: chỉ xét app này (công cụ `uia-record`). Chỉ app có công thức Windows mới vào danh sách (như macOS).
    pub fn scan<D: Desktop>(
        &mut self,
        d: &mut D,
        recipes: &Recipes,
        only: Option<MeetingApp>,
        now: Instant,
    ) -> Option<Found> {
        let mut seen = HashSet::new();
        let mut per_app: Vec<Vec<MeetingWindow>> = vec![Vec::new(); MeetingApp::ALL.len()];
        for w in d.top_windows().into_iter().take(MAX_TOP_WINDOWS) {
            seen.insert(w.pid);
            let app = match self.exes.get(&w.pid) {
                Some((at, app)) if now.saturating_duration_since(*at) < EXE_TTL => *app,
                _ => {
                    let app = d.exe_path(w.pid).as_deref().and_then(app_of_exe);
                    self.exes.insert(w.pid, (now, app));
                    app
                }
            };
            let Some(app) = app.filter(|a| only.is_none_or(|o| o == *a)) else {
                continue;
            };
            let Some(recipe) = recipes.app(Os::Windows, app) else {
                continue;
            };
            let title = d.title(w.id);
            let class = if recipe.window_id.is_some() {
                d.class_name(w.id)
            } else {
                String::new()
            };
            if is_meeting_window(recipe, &title, &class) {
                let slot = MeetingApp::ALL.iter().position(|a| *a == app).unwrap_or(0);
                per_app[slot].push(MeetingWindow { id: w.id, title });
            }
        }
        self.exes.retain(|pid, _| seen.contains(pid));
        MeetingApp::ALL
            .into_iter()
            .zip(per_app)
            .find(|(_, windows)| !windows.is_empty())
            .map(|(app, mut windows)| {
                windows.truncate(MAX_WINDOWS);
                Found { app, windows }
            })
    }
}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo test -p speaker-worker --lib -- reader::winscan 2>&1 | grep -E "^test |^test result"`
Expected: 6 test `ok` (`executables_map_to_the_hard_coded_apps`, `titles_of_other_apps_are_never_read`, `only_meeting_titles_match_and_the_first_app_by_priority_wins`, `at_most_two_windows_per_app`, `executables_are_remembered_for_a_while`, `debug_output_hides_titles`).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result"`
Expected: sạch; `Finished`; lib **155** đạt, 5 bỏ qua. Không commit.

---

### Task 5: `windowset` và `stats`: điều phối một lượt đọc

**Files:**
- Create: `crates/speaker-worker/src/reader/windowset.rs`, `crates/speaker-worker/src/reader/stats.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs`

- [ ] **Step 1: Khai báo module**

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
pub mod tree;
```

bằng

```rust
pub mod stats;
pub mod tree;
```

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
pub mod uia_tree;
pub mod winscan;
```

bằng

```rust
pub mod uia_tree;
pub mod windowset;
pub mod winscan;
```

- [ ] **Step 2: Test trước** — tạo `windowset.rs` và `stats.rs` chỉ với mod `tests` của từng file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::reader::tree::tests::fixture;
    use crate::reader::tree::{FixtureTree, Snapshot};
    use speaker_recipe::{BUILTIN_JSON, MeetingApp, Os, parse};
    use std::collections::BTreeSet;
    use std::time::Duration;

    /// Cây ghi sẵn có thể "mất" (mọi lệnh đọc trả rỗng), để thử ô không còn.
    struct Flaky {
        tree: FixtureTree,
        dead: bool,
    }

    impl Tree for Flaky {
        type Node = usize;

        fn role(&mut self, n: &usize) -> Option<String> {
            if self.dead { None } else { self.tree.role(n) }
        }

        fn shape(&mut self, n: &usize) -> Option<speaker_recipe::Attrs> {
            if self.dead { None } else { self.tree.shape(n) }
        }

        fn text(&mut self, n: &usize, a: &mut speaker_recipe::Attrs) -> bool {
            !self.dead && self.tree.text(n, a)
        }

        fn children(&mut self, n: &usize) -> Vec<usize> {
            if self.dead { Vec::new() } else { self.tree.children(n) }
        }
    }

    fn teams_window(snap: &Snapshot) -> (Flaky, Vec<WindowState<usize>>) {
        let (tree, roots) = FixtureTree::parse(&snap.lines);
        let windows = roots
            .iter()
            .map(|&r| WindowState::new(r as isize, r, tree.title(r).to_string()))
            .collect();
        (Flaky { tree, dead: false }, windows)
    }

    fn names(samples: &[TileSample]) -> BTreeSet<&str> {
        samples.iter().map(|s| s.name.as_str()).collect()
    }

    /// Lượt đầu duyệt cả cửa sổ rồi lấy mẫu; lượt kế (chưa tới hạn) chỉ đọc nhanh, cùng các ô.
    #[test]
    fn a_full_pass_then_fast_passes() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        let (first, full) = read_windows(&mut t, &mut windows[..1], app, false, &mut Budget::unlimited());
        assert!(full);
        assert_eq!(names(&first), BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]));
        assert_eq!(windows[0].tile_count(), 3);
        let (second, full) = read_windows(&mut t, &mut windows[..1], app, false, &mut Budget::unlimited());
        assert!(!full, "chưa tới {FULL_EVERY:?}");
        assert_eq!(names(&second), names(&first));
    }

    /// Ngân sách nhỏ: lượt đầy đủ đi tiếp qua nhiều lượt, cuối cùng vẫn tìm đủ ô (không kẹt ở một phần tử).
    #[test]
    fn a_small_budget_converges_over_several_passes() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        let mut passes = 0;
        let samples = loop {
            passes += 1;
            assert!(passes < 200, "không hội tụ");
            let mut budget = Budget::new(40, Duration::from_secs(5));
            let (s, _) = read_windows(&mut t, &mut windows[..1], app, false, &mut budget);
            if windows[0].tile_count() == 3 && s.len() == 3 {
                break s;
            }
        };
        assert!(passes > 1, "40 lệnh không đủ cho cả cửa sổ");
        assert_eq!(names(&samples), BTreeSet::from(["Hoa Phạm", "Lan", "Minh"]));
    }

    /// Một ô không còn đọc được thì đánh dấu duyệt lại; cây trở lại thì lượt kế tìm lại đủ ô.
    #[test]
    fn a_vanished_tile_triggers_a_new_full_pass() {
        let r = parse(BUILTIN_JSON).unwrap();
        let app = r.app(Os::Macos, MeetingApp::Teams).unwrap();
        let (mut t, mut windows) = teams_window(&fixture("teams-macos-people-closed.jsonl")[0]);
        read_windows(&mut t, &mut windows[..1], app, false, &mut Budget::unlimited());
        t.dead = true;
        let (none, _) = read_windows(&mut t, &mut windows[..1], app, false, &mut Budget::unlimited());
        assert!(none.is_empty());
        t.dead = false;
        let (again, full) = read_windows(&mut t, &mut windows[..1], app, false, &mut Budget::unlimited());
        assert!(full, "duyệt lại cả cửa sổ");
        assert_eq!(names(&again).len(), 3);
    }

    /// Năm lượt hỏng liền thì `Blocked`; một lượt tốt là hết; không bao giờ `NoPermission`.
    #[test]
    fn five_broken_passes_in_a_row_block_and_one_good_pass_clears() {
        let mut failures = 0;
        let mut seen = Vec::new();
        for broken in [true, true, true, true, true, true, false, true] {
            let (f, status) = health(failures, broken);
            failures = f;
            seen.push(status);
        }
        use ReaderStatus::{Blocked, Ok};
        assert_eq!(seen, [Ok, Ok, Ok, Ok, Blocked, Blocked, Ok, Ok]);
        assert!(seen.iter().all(|s| *s != ReaderStatus::NoPermission));
    }

    #[test]
    fn reconcile_keeps_known_windows_and_drops_the_rest() {
        let mut old = vec![
            WindowState::new(1, 10usize, "cũ".into()),
            WindowState::new(2, 20, "bị đóng".into()),
        ];
        old[0].next = 5;
        let found = [(1, "mới".to_string()), (3, "thêm".to_string()), (4, "lỗi".to_string())];
        let mut made = Vec::new();
        let out = reconcile(old, &found, |id| {
            made.push(id);
            (id != 4).then_some(id as usize * 10)
        });
        assert_eq!(made, [3, 4], "cửa sổ còn đó không dựng lại");
        assert_eq!(out.iter().map(|w| w.id).collect::<Vec<_>>(), [1, 3]);
        assert_eq!((out[0].title.as_str(), out[0].next, out[0].node), ("mới", 5, 10));
        assert_eq!((out[1].title.as_str(), out[1].node), ("thêm", 30));
    }
}
```

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_comes_out_once_a_minute_and_counts_restart() {
        let (mut s, t0) = (Stats::default(), Instant::now());
        assert_eq!(s.add(Pass::Idle, 1.0, 0, t0), None, "lượt nghỉ không tính");
        assert_eq!(s.add(Pass::Full, 12.0, 80, t0), None);
        assert_eq!(s.add(Pass::Fast, 2.0, 9, t0 + Duration::from_secs(1)), None);
        assert_eq!(s.add(Pass::Fast, 40.0, 9, t0 + Duration::from_secs(30)), None);
        let line = s.add(Pass::Fast, 3.0, 9, t0 + STATS_EVERY).unwrap();
        assert!(line.contains("1 lượt đầy đủ (p50 12.0 ms"), "{line}");
        assert!(
            line.contains("3 lượt nhanh (p50 3.0 ms, p90 40.0, lớn nhất 40.0)"),
            "{line}"
        );
        assert!(line.contains("lệnh đọc p90 80, 1 lượt quá 30 ms"), "{line}");
        assert_eq!(
            s.add(Pass::Fast, 1.0, 1, t0 + STATS_EVERY + Duration::from_secs(1)),
            None,
            "đếm lại"
        );
    }
}
```

- [ ] **Step 3: Chạy, thấy đỏ**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- reader::windowset reader::stats 2>&1 | grep -E "^error" | sort | uniq -c | head -6`
Expected: lỗi biên dịch không tìm thấy `WindowState`, `read_windows`, `reconcile`, `health`, `BLOCKED_AFTER`, `Stats`, `STATS_EVERY`.

- [ ] **Step 4: Mã** — chèn vào **đầu** mỗi file (trước `#[cfg(test)]`):

`windowset.rs`:

```rust
//! Điều phối một lượt đọc trên các cửa sổ họp đã tìm được (spec 2026-10-26-phan-biet-nguoi-noi §6.2; kế hoạch 05 QĐ 5): với từng
//! cửa sổ, đi tiếp lượt đầy đủ (tìm ô và neo) khi tới hạn hay chưa xong, rồi lấy mẫu các ô đã biết, tất cả trong **một** ngân sách.
//! Viết cho mọi [`Tree`]: chạy trên cây ghi sẵn trong test, trên UI Automation ở Windows. Cùng logic với vòng lặp trong
//! `reader::macos::LiveReader::tick`, chưa dùng chung với nó (kế hoạch 05, "Để kế hoạch sau").

use std::time::Instant;

use speaker_protocol::ReaderStatus;
use speaker_recipe::AppRecipe;

use super::FULL_EVERY;
use super::extract::{Budget, TileRef, TileSample, Walk, sample_round};
use super::tree::Tree;

/// Chừng này lượt liền có lệnh quá hạn hay bị chặn thì trạng thái là `Blocked` (như `BLOCKED_AFTER` của bộ đọc macOS).
pub const BLOCKED_AFTER: u32 = 5;

/// Số lượt hỏng liền nhau sau lượt này, và trạng thái của lượt này. `broken`: lượt này có lệnh quá hạn hay bị chặn. Bộ đọc Windows chỉ
/// cho `Ok` hay `Blocked`: Windows không có quyền nào để xin, nên không bao giờ `NoPermission` (QĐ 7 của kế hoạch 05; trạng thái đó
/// làm dòng mời cấp quyền Trợ năng hiện ra).
pub fn health(failures: u32, broken: bool) -> (u32, ReaderStatus) {
    let failures = if broken { failures + 1 } else { 0 };
    let status = if failures >= BLOCKED_AFTER {
        ReaderStatus::Blocked
    } else {
        ReaderStatus::Ok
    };
    (failures, status)
}

/// Trạng thái đọc của một cửa sổ họp.
pub struct WindowState<N> {
    pub id: isize,
    pub node: N,
    pub title: String,
    walk: Option<Walk<N>>,
    tiles: Vec<TileRef<N>>,
    last_full: Option<Instant>,
    /// Phải duyệt lại cả cửa sổ (mới thấy, hay một ô không còn đọc được).
    stale: bool,
    /// Ô bắt đầu của lượt nhanh kế (xoay vòng khi hết ngân sách giữa chừng).
    next: usize,
}

impl<N> WindowState<N> {
    pub fn new(id: isize, node: N, title: String) -> Self {
        Self {
            id,
            node,
            title,
            walk: None,
            tiles: Vec::new(),
            last_full: None,
            stale: true,
            next: 0,
        }
    }

    pub fn tile_count(&self) -> usize {
        self.tiles.len()
    }
}

/// Danh sách cửa sổ mới (số hiệu, tiêu đề): cửa sổ còn đó giữ trạng thái đọc (ô, neo, nhịp), cửa sổ mới dựng bằng `make`
/// (`None`: không dựng được thì bỏ qua), cửa sổ không còn thì bỏ.
pub fn reconcile<N>(
    old: Vec<WindowState<N>>,
    found: &[(isize, String)],
    mut make: impl FnMut(isize) -> Option<N>,
) -> Vec<WindowState<N>> {
    let mut old = old;
    let mut out = Vec::new();
    for (id, title) in found {
        match old.iter().position(|w| w.id == *id) {
            Some(i) => {
                let mut kept = old.swap_remove(i);
                kept.title.clone_from(title);
                out.push(kept);
            }
            None => {
                if let Some(node) = make(*id) {
                    out.push(WindowState::new(*id, node, title.clone()));
                }
            }
        }
    }
    out
}

/// Một lượt đọc: mẫu của mọi ô, và có đi tiếp lượt đầy đủ không. Hết ngân sách giữa chừng thì phần đang đọc dở bị bỏ, lượt sau đọc
/// tiếp (lượt đầy đủ từ phần tử chưa duyệt, lượt nhanh từ ô chưa đọc).
pub fn read_windows<T: Tree>(
    t: &mut T,
    windows: &mut [WindowState<T::Node>],
    recipe: &AppRecipe,
    calibrate: bool,
    budget: &mut Budget,
) -> (Vec<TileSample>, bool) {
    let mut tiles = Vec::new();
    let mut full = false;
    for (k, w) in windows.iter_mut().enumerate() {
        let due = w.stale || w.walk.is_some() || w.last_full.is_none_or(|at| at.elapsed() >= FULL_EVERY);
        if due && !budget.exhausted() {
            full = true;
            let walk = w
                .walk
                .get_or_insert_with(|| Walk::new(w.node.clone(), k as u32, recipe.web_only));
            if let Some(found) = walk.step(t, recipe, budget) {
                w.tiles = found;
                w.walk = None;
                w.last_full = Some(Instant::now());
                w.stale = false;
                w.next = 0;
            }
        }
        let round = sample_round(t, &w.tiles, recipe, w.next, calibrate, budget);
        w.next = round.next;
        w.stale |= round.gone;
        tiles.extend(round.samples);
    }
    (tiles, full)
}
```

`stats.rs`:

```rust
//! Thống kê thời gian đọc của bộ đọc (spec 2026-10-26-phan-biet-nguoi-noi §6.2, §11): mỗi [`STATS_EVERY`] một dòng vào log, chỉ có số
//! đếm và thời gian, không có tên người hay chữ của app họp. Cùng nội dung với `Stats` của `reader::macos`, viết lại ở đây dạng thuần
//! để test được (bộ đọc Windows dùng; kế hoạch 05 QĐ 5).

use std::time::{Duration, Instant};

use super::Pass;

/// Một dòng thống kê vào log mỗi chừng này.
pub const STATS_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Stats {
    full: Vec<f32>,
    fast: Vec<f32>,
    elements: Vec<u32>,
    since: Option<Instant>,
}

fn quantile(v: &mut [f32], p: f32) -> f32 {
    v.sort_by(f32::total_cmp);
    v.get(((v.len() as f32 - 1.0) * p).round().max(0.0) as usize)
        .copied()
        .unwrap_or(0.0)
}

impl Stats {
    /// Ghi một lượt (`ms` thời gian, `elements` số lệnh đọc). Trả dòng log khi đủ [`STATS_EVERY`] kể từ lượt đầu của chu kỳ, rồi đếm
    /// lại. Lượt `Idle` không tính.
    pub fn add(&mut self, pass: Pass, ms: f32, elements: u32, now: Instant) -> Option<String> {
        match pass {
            Pass::Full => self.full.push(ms),
            Pass::Fast => self.fast.push(ms),
            Pass::Idle => return None,
        }
        self.elements.push(elements);
        let since = *self.since.get_or_insert(now);
        if now.saturating_duration_since(since) < STATS_EVERY {
            return None;
        }
        self.elements.sort_unstable();
        let over = self.full.iter().chain(&self.fast).filter(|&&ms| ms > 30.0).count();
        let line = format!(
            "speaker-worker: bộ đọc: {} lượt đầy đủ (p50 {:.1} ms, p90 {:.1}, lớn nhất {:.1}), {} lượt nhanh (p50 {:.1} ms, p90 {:.1}, \
             lớn nhất {:.1}), lệnh đọc p90 {}, {over} lượt quá 30 ms",
            self.full.len(),
            quantile(&mut self.full, 0.5),
            quantile(&mut self.full, 0.9),
            quantile(&mut self.full, 1.0),
            self.fast.len(),
            quantile(&mut self.fast, 0.5),
            quantile(&mut self.fast, 0.9),
            quantile(&mut self.fast, 1.0),
            self.elements.get(self.elements.len() * 9 / 10).copied().unwrap_or(0)
        );
        *self = Stats::default();
        Some(line)
    }
}
```

- [ ] **Step 5: Chạy, thấy xanh**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo test -p speaker-worker --lib -- reader::windowset reader::stats 2>&1 | grep -E "^test |^test result"`
Expected: 6 test `ok` (`a_full_pass_then_fast_passes`, `a_small_budget_converges_over_several_passes`, `a_vanished_tile_triggers_a_new_full_pass`, `five_broken_passes_in_a_row_block_and_one_good_pass_clears`, `reconcile_keeps_known_windows_and_drops_the_rest`, `a_line_comes_out_once_a_minute_and_counts_restart`).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result"`
Expected: sạch; `Finished`; lib **161** đạt, 5 bỏ qua. Không commit.

---

### Task 6: `reader::uia` (chỉ Windows), `PLATFORM`, `reader_setup`

Phần Windows thật. Không test được trên Mac: kiểm bằng biên dịch chéo, clippy target `x86_64-pc-windows-msvc` và `x86_64-pc-windows-gnu` (`-D warnings`), và bằng test thuần của `reader_setup`. Hành vi thật (COM, lệnh UI Automation, tiêu đề cửa sổ) kiểm ở Task 10.

**Files:**
- Create: `crates/speaker-worker/src/reader/uia.rs`
- Modify: `crates/speaker-worker/src/reader/mod.rs`, `crates/speaker-worker/src/session.rs`

- [ ] **Step 1: Test của `reader_setup` (đỏ)** — thêm vào mod `tests` của `session.rs`, ngay trước `ready_reports_the_reader_and_a_broken_recipe_turns_names_off`:

Trong `crates/speaker-worker/src/session.rs`, thay

```rust
    #[test]
    fn ready_reports_the_reader_and_a_broken_recipe_turns_names_off() {
```

bằng

```rust
    /// Kế hoạch 05 QĐ 6: Windows không có công thức cho Windows thì không có luồng đọc; có thì có. macOS không bị ảnh hưởng (công
    /// thức không có app nào vẫn chạy luồng đọc, như phép đo A-spk4 của kế hoạch 04).
    #[test]
    fn windows_reads_only_when_a_recipe_has_a_windows_entry() {
        const NO_APPS: &str = r#"{"schema":1,"version":1,"min_app_version":"0.3.2","apps":[]}"#;
        let teams_windows = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../../scripts/speaker-recipes/fixtures/teams-windows.recipes.json"),
        )
        .unwrap();
        let reader_for = |os: Os, recipe: &str| {
            let (w, _) = worker();
            let mut w = w.with_os(os);
            replies(w.handle(Request::Load {
                model_path: "/m/tot.onnx".into(),
                model_sha256: None,
                config: SpeakerConfig::default(),
                names: NamesSetup {
                    recipe_json: recipe.into(),
                    ..names_on()
                },
            }));
            w.reader_setup().is_some()
        };
        assert!(!reader_for(Os::Windows, NO_APPS), "không có mục Windows: không đọc");
        assert!(reader_for(Os::Windows, &teams_windows), "có mục Windows: đọc");
        assert_eq!(reader_for(Os::Macos, NO_APPS), PLATFORM != ReaderPlatform::Unsupported);
    }

    #[test]
    fn ready_reports_the_reader_and_a_broken_recipe_turns_names_off() {
```

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-worker --lib -- session::tests::windows_reads_only 2>&1 | grep -E "panicked|^test result" | head -3`
Expected: test đỏ ở dòng đầu với thông báo `không có mục Windows: không đọc` (hiện `reader_setup` chỉ xét `PLATFORM`, nên Windows luôn tạo luồng đọc).

- [ ] **Step 2: `reader_setup` chỉ tạo luồng khi có việc**

Trong `crates/speaker-worker/src/session.rs`, thay

```rust
    /// Thứ để chạy luồng đọc: chỉ khi đọc tên bật, có công thức, và bản worker có bộ đọc.
    pub fn reader_setup(&self) -> Option<ReaderSetup> {
        let recipes = self.names.recipes.clone()?;
        (self.names.enabled && PLATFORM != ReaderPlatform::Unsupported).then(|| ReaderSetup {
```

bằng

```rust
    /// Thứ để chạy luồng đọc: chỉ khi đọc tên bật, có công thức, và bản worker có bộ đọc. Windows: còn cần công thức có mục cho Windows
    /// (kế hoạch 05 QĐ 6): không có gì để đọc thì không nạp UI Automation (tiết kiệm bộ nhớ, tốc độ khởi động).
    pub fn reader_setup(&self) -> Option<ReaderSetup> {
        let recipes = self.names.recipes.clone()?;
        let has_work = self.os != Os::Windows || recipes.has_os(Os::Windows);
        (self.names.enabled && PLATFORM != ReaderPlatform::Unsupported && has_work).then(|| ReaderSetup {
```

- [ ] **Step 3: `PLATFORM` và `spawn` cho Windows** — khai báo module `uia` (chỉ Windows), `PLATFORM = Windows`, `spawn` gọi `uia::spawn`:

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
pub mod stats;
pub mod tree;
pub mod uia_tree;
```

bằng

```rust
pub mod stats;
pub mod tree;
#[cfg(windows)]
pub mod uia;
pub mod uia_tree;
```

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
/// Bộ đọc mà bản worker này có (`Ready.reader_platform`). Windows: kế hoạch 05.
pub const PLATFORM: ReaderPlatform = if cfg!(target_os = "macos") {
    ReaderPlatform::MacOs
} else {
```

bằng

```rust
/// Bộ đọc mà bản worker này có (`Ready.reader_platform`).
pub const PLATFORM: ReaderPlatform = if cfg!(target_os = "macos") {
    ReaderPlatform::MacOs
} else if cfg!(windows) {
    ReaderPlatform::Windows
} else {
```

Trong `crates/speaker-worker/src/reader/mod.rs`, thay

```rust
/// Chạy bộ đọc trên luồng riêng (macOS: `macos::spawn`); nền tảng chưa có bộ đọc (Windows tới kế hoạch 05) thì `None`.
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, sink: SampleSink) -> Option<std::thread::JoinHandle<()>> {
    #[cfg(target_os = "macos")]
    {
        macos::spawn(setup, control, sink)
    }
    #[cfg(not(target_os = "macos"))]
    {
```

bằng

```rust
/// Chạy bộ đọc trên luồng riêng (macOS: `macos::spawn`, Windows: `uia::spawn`); nền tảng chưa có bộ đọc thì `None`.
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, sink: SampleSink) -> Option<std::thread::JoinHandle<()>> {
    #[cfg(target_os = "macos")]
    {
        macos::spawn(setup, control, sink)
    }
    #[cfg(windows)]
    {
        uia::spawn(setup, control, sink)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
```

- [ ] **Step 4: Bộ đọc Windows** — `crates/speaker-worker/src/reader/uia.rs` (chỉ biên dịch trên Windows). Điểm cần để ý khi đọc: COM khởi tạo trên luồng đọc (`ComGuard`, đa luồng) và mọi đối tượng COM tạo **trong** luồng đó (không `Send`); `ComBackend::shape` dùng `BuildUpdatedCache` (một lệnh), `children` dùng `FindAllBuildCache(TreeScope_Children)` (một lệnh cho cả danh sách con kèm bốn thuộc tính), `name` dùng `CurrentName` (một lệnh); bộ nhớ đệm không có `Name`; `Win32Desktop::top_windows` chỉ lấy số hiệu và tiến trình, không đọc chữ; `LiveReader::tick` gọi `begin_pass` đầu lượt, quét cửa sổ mỗi `SCAN_EVERY`, rồi `read_windows` trong một `Budget`.

```rust
//! Bộ đọc tên trên Windows (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.8; kế hoạch 05 Task 6). Cứ [`SCAN_EVERY`] liệt kê cửa sổ
//! cấp cao nhất, chỉ đọc tiêu đề cửa sổ của file chạy trong danh sách viết cứng (`winscan`); đọc cây UI Automation của cửa sổ họp
//! qua `uia_tree`; một ngân sách (≤ 3 000 lệnh, ≤ 30 ms) cho cả lượt (QĐ 13 của kế hoạch 04). Mỗi lệnh chờ tối đa 0,2 s. Không cần
//! quyền nào của hệ điều hành và không đặt thuộc tính nào trong app họp (khác macOS: không `AXEnhancedUserInterface`, không file dấu,
//! không bao giờ trả `NoPermission`). Chỉ đọc: không bấm, không gõ, không đổi gì trong app họp. Log chỉ có số đếm, thời gian, trạng
//! thái; không có tên người hay chữ của app họp.

use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use speaker_protocol::{MeetingApp, ReaderStatus};
use speaker_recipe::{Os, Recipes};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomation2, IUIAutomationCacheRequest, IUIAutomationCondition,
    IUIAutomationElement, TreeScope_Children, TreeScope_Element, UIA_AriaRolePropertyId, UIA_AutomationIdPropertyId,
    UIA_ClassNamePropertyId, UIA_ControlTypePropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows::core::{BOOL, BSTR, Interface, PWSTR};

use super::extract::{Budget, MAX_ELEMENTS, PASS_BUDGET, dump_lines};
use super::stats::Stats;
use super::uia_tree::{RawShape, UiaBackend, UiaError, UiaNode, UiaTree, classify_hresult};
use super::windowset::{WindowState, health, read_windows, reconcile};
use super::winscan::{Desktop, RawWindow, Scanner};
use super::{Control, ControlState, Pass, ReaderSetup, SCAN_EVERY, Sample, SampleSink, next_turn};

/// Hạn chờ của mỗi lệnh UI Automation (spec §6.2, §10), ms.
const TIMEOUT_MS: u32 = 200;
/// Số con tối đa đọc từ một phần tử trong một lệnh.
const MAX_CHILDREN: i32 = 512;
/// Chữ lấy từ cửa sổ hệ thống cắt ở chừng này ký tự (như `uia_tree::MAX_TEXT_CHARS`).
const WINDOW_TEXT: usize = 300;

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn hwnd(id: isize) -> HWND {
    HWND(id as *mut core::ffi::c_void)
}

fn bstr(r: windows::core::Result<BSTR>) -> String {
    r.map(|b| b.to_string()).unwrap_or_default()
}

fn fail(e: &windows::core::Error) -> UiaError {
    classify_hresult(e.code().0 as u32)
}

/// COM của luồng gọi (đa luồng). Luồng đọc và công cụ `uia-record` giữ một bản suốt đời của bộ đọc, và tạo bộ đọc **sau** nó.
pub struct ComGuard(bool);

impl ComGuard {
    pub fn init() -> Self {
        // SAFETY: chỉ khởi tạo COM cho luồng gọi; `Drop` gỡ đúng một lần khi đã khởi tạo được.
        Self(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            // SAFETY: cặp với `CoInitializeEx` thành công ở `init`.
            unsafe { CoUninitialize() };
        }
    }
}

/// Lệnh UI Automation thật. Hình dạng đọc kèm một bộ nhớ đệm bốn thuộc tính (loại điều khiển, vai trò ARIA, `AutomationId`,
/// `ClassName`); `Name` không nằm trong bộ nhớ đệm, chỉ đọc khi bộ duyệt hỏi (QĐ 3 của kế hoạch 04).
pub struct ComBackend {
    auto: IUIAutomation,
    cache: IUIAutomationCacheRequest,
    all: IUIAutomationCondition,
}

impl ComBackend {
    /// Cần COM đã khởi tạo trên luồng gọi ([`ComGuard`]).
    pub fn new() -> windows::core::Result<Self> {
        // SAFETY: lệnh COM trên luồng đã khởi tạo; mọi giá trị trả về là đối tượng COM do `windows` giữ và nhả.
        unsafe {
            let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            if let Ok(a2) = auto.cast::<IUIAutomation2>() {
                // Không có (Windows cũ) thì dùng hạn chờ mặc định của hệ thống; vẫn chạy được.
                let _ = a2.SetConnectionTimeout(TIMEOUT_MS);
                let _ = a2.SetTransactionTimeout(TIMEOUT_MS);
            }
            let cache = auto.CreateCacheRequest()?;
            for p in [
                UIA_ControlTypePropertyId,
                UIA_AriaRolePropertyId,
                UIA_AutomationIdPropertyId,
                UIA_ClassNamePropertyId,
            ] {
                cache.AddProperty(p)?;
            }
            cache.SetTreeScope(TreeScope_Element)?;
            let all = auto.CreateTrueCondition()?;
            Ok(Self { auto, cache, all })
        }
    }

    /// Phần tử UI Automation của một cửa sổ (số hiệu từ `Desktop::top_windows`); `None` khi cửa sổ đã đóng.
    pub fn element_from_hwnd(&self, id: isize) -> Option<IUIAutomationElement> {
        // SAFETY: lệnh COM; HWND không còn thì trả lỗi.
        unsafe { self.auto.ElementFromHandle(hwnd(id)) }.ok()
    }

    fn raw(el: &IUIAutomationElement) -> RawShape {
        // SAFETY: đọc thuộc tính đã nằm trong bộ nhớ đệm của phần tử (dựng bằng `self.cache`), không gọi sang tiến trình khác.
        unsafe {
            RawShape {
                control_type: el.CachedControlType().map_or(0, |c| c.0),
                aria_role: bstr(el.CachedAriaRole()),
                automation_id: bstr(el.CachedAutomationId()),
                class_name: bstr(el.CachedClassName()),
            }
        }
    }
}

impl UiaBackend for ComBackend {
    type El = IUIAutomationElement;

    fn shape(&mut self, el: &IUIAutomationElement) -> Result<RawShape, UiaError> {
        // SAFETY: lệnh COM; một lệnh qua tiến trình, hạn chờ `TIMEOUT_MS`.
        let fresh = unsafe { el.BuildUpdatedCache(&self.cache) }.map_err(|e| fail(&e))?;
        Ok(Self::raw(&fresh))
    }

    fn name(&mut self, el: &IUIAutomationElement) -> Result<String, UiaError> {
        // SAFETY: lệnh COM như trên.
        unsafe { el.CurrentName() }.map(|b| b.to_string()).map_err(|e| fail(&e))
    }

    fn children(&mut self, el: &IUIAutomationElement) -> Result<Vec<(IUIAutomationElement, RawShape)>, UiaError> {
        // SAFETY: lệnh COM như trên; một lệnh lấy cả danh sách con kèm bộ nhớ đệm.
        unsafe {
            let array = el
                .FindAllBuildCache(TreeScope_Children, &self.all, &self.cache)
                .map_err(|e| fail(&e))?;
            let n = array.Length().map_err(|e| fail(&e))?.clamp(0, MAX_CHILDREN);
            let mut out = Vec::with_capacity(n as usize);
            for i in 0..n {
                let child = array.GetElement(i).map_err(|e| fail(&e))?;
                let raw = Self::raw(&child);
                out.push((child, raw));
            }
            Ok(out)
        }
    }
}

unsafe extern "system" fn collect(window: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` là con trỏ `Vec<RawWindow>` do `top_windows` truyền và còn sống suốt lệnh `EnumWindows`.
    let list = unsafe { &mut *(lparam.0 as *mut Vec<RawWindow>) };
    // SAFETY: các lệnh chỉ đọc thuộc tính của cửa sổ; cửa sổ đã đóng thì trả giá trị rỗng.
    if unsafe { IsWindowVisible(window) }.as_bool() {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
        list.push(RawWindow {
            id: window.0 as isize,
            pid,
        });
    }
    true.into()
}

/// Hàm Win32 thật cho [`Desktop`].
pub struct Win32Desktop;

impl Desktop for Win32Desktop {
    fn top_windows(&mut self) -> Vec<RawWindow> {
        let mut list: Vec<RawWindow> = Vec::new();
        // SAFETY: `collect` chỉ dùng `lparam` như `Vec<RawWindow>`, và `list` sống hơn lệnh gọi.
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut list as *mut Vec<RawWindow> as isize));
        }
        list
    }

    fn exe_path(&mut self, pid: u32) -> Option<String> {
        // SAFETY: mở tiến trình chỉ để hỏi đường dẫn file chạy (quyền hạn chế nhất), đóng handle ngay sau đó.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(handle);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    fn title(&mut self, id: isize) -> String {
        let mut buf = [0u16; 512];
        // SAFETY: bộ đệm đủ chỗ; cửa sổ không còn thì trả 0.
        let n = unsafe { GetWindowTextW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
            .chars()
            .take(WINDOW_TEXT)
            .collect()
    }

    fn class_name(&mut self, id: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY: như `title`.
        let n = unsafe { GetClassNameW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }
}

fn empty(status: ReaderStatus, app: Option<MeetingApp>, pass: Pass) -> Sample {
    Sample {
        at_unix_ms: 0,
        period_ms: 0,
        status,
        app,
        app_version: None,
        tiles: Vec::new(),
        pass,
        pass_ms: 0.0,
        elements: 0,
    }
}

type Node = UiaNode<IUIAutomationElement>;

/// Bộ đọc của một lần chạy worker (hay của `uia-record`). Tạo trên luồng đã có [`ComGuard`].
pub struct LiveReader {
    recipes: Arc<Recipes>,
    /// `uia-record`: chỉ đọc app này.
    only: Option<MeetingApp>,
    desktop: Win32Desktop,
    scanner: Scanner,
    last_scan: Option<Instant>,
    app: Option<MeetingApp>,
    windows: Vec<WindowState<Node>>,
    tree: UiaTree<ComBackend>,
    failures: u32,
    stats: Stats,
}

impl LiveReader {
    pub fn new(recipes: Arc<Recipes>, only: Option<MeetingApp>) -> windows::core::Result<Self> {
        Ok(Self {
            recipes,
            only,
            desktop: Win32Desktop,
            scanner: Scanner::default(),
            last_scan: None,
            app: None,
            windows: Vec::new(),
            tree: UiaTree::new(ComBackend::new()?),
            failures: 0,
            stats: Stats::default(),
        })
    }

    /// Quét cửa sổ họp khi tới hạn: cửa sổ còn đó giữ trạng thái đọc, cửa sổ mới dựng phần tử UI Automation.
    fn rescan(&mut self, now: Instant) {
        self.last_scan = Some(now);
        let found = self.scanner.scan(&mut self.desktop, &self.recipes, self.only, now);
        let Some(found) = found else {
            self.app = None;
            self.windows.clear();
            return;
        };
        let list: Vec<(isize, String)> = found.windows.into_iter().map(|w| (w.id, w.title)).collect();
        let old = if self.app == Some(found.app) {
            std::mem::take(&mut self.windows)
        } else {
            Vec::new()
        };
        let backend = self.tree.backend();
        self.windows = reconcile(old, &list, |id| backend.element_from_hwnd(id).map(UiaNode::new));
        self.app = Some(found.app);
    }

    /// Đọc tên tắt: không đọc gì.
    pub fn idle(&mut self) -> Sample {
        self.release_all();
        empty(ReaderStatus::Off, None, Pass::Idle)
    }

    /// Bỏ trạng thái đọc (tắt "Lấy tên", tạm dừng, dừng phiên, worker thoát). Không có gì phải trả trong app họp.
    pub fn release_all(&mut self) {
        self.app = None;
        self.windows.clear();
        self.last_scan = None;
    }

    /// Một lượt đọc. Một ngân sách cho cả lượt (QĐ 13 của kế hoạch 04); hết thì lượt sau đọc tiếp.
    pub fn tick(&mut self, calibrate: bool) -> Sample {
        let started = Instant::now();
        let at = unix_ms();
        self.tree.begin_pass();
        if self.last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            self.rescan(started);
        }
        let recipes = self.recipes.clone();
        let Some((app, recipe)) = self.app.and_then(|a| recipes.app(Os::Windows, a).map(|r| (a, r))) else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let mut budget = Budget::new(MAX_ELEMENTS, PASS_BUDGET);
        let (tiles, full) = read_windows(&mut self.tree, &mut self.windows, recipe, calibrate, &mut budget);
        let broken = self.tree.timeouts() + self.tree.denied() > 0;
        let (failures, status) = health(self.failures, broken);
        self.failures = failures;
        let sample = Sample {
            tiles,
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
        self.finish(sample, at, started)
    }

    fn finish(&mut self, mut s: Sample, at: u64, started: Instant) -> Sample {
        s.at_unix_ms = at;
        s.pass_ms = started.elapsed().as_secs_f32() * 1000.0;
        s.elements = self.tree.reads();
        if let Some(line) = self.stats.add(s.pass, s.pass_ms, s.elements, Instant::now()) {
            eprintln!("{line}");
        }
        s
    }

    /// Số lệnh quá hạn chờ ở lượt vừa đọc (`uia-record stats`).
    pub fn timeouts(&self) -> u32 {
        self.tree.timeouts()
    }

    /// Số lệnh bị chặn ở lượt vừa đọc (`uia-record stats`).
    pub fn denied(&self) -> u32 {
        self.tree.denied()
    }

    /// Cây của các cửa sổ họp đang đọc, định dạng fixture (`uia-record fixture`; có chữ của app họp).
    pub fn dump_windows(&mut self) -> Vec<String> {
        let recipes = self.recipes.clone();
        let Some(recipe) = self.app.and_then(|a| recipes.app(Os::Windows, a)) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for w in &self.windows {
            out.extend(dump_lines(&mut self.tree, &w.node, &w.title, recipe));
        }
        out
    }
}

/// Chạy bộ đọc trên luồng riêng. Nhịp theo `Control` (QĐ 13 của kế hoạch 04); giữa hai lượt luồng ngủ bằng `next_turn`. "Lấy tên" tắt
/// hay tạm dừng: gửi một mẫu `Off` rồi ngủ không hạn tới khi trạng thái đổi. Dừng khi `stop` hay khi luồng chính thôi nhận mẫu.
/// Không tạo được UI Automation thì ghi log và thôi (phụ đề vẫn chạy, tên không có).
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, mut sink: SampleSink) -> Option<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("speaker-reader".into())
        .spawn(move || {
            let _com = ComGuard::init();
            let mut reader = match LiveReader::new(setup.recipes, None) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!(
                        "speaker-worker: không khởi tạo được UI Automation (0x{:08X})",
                        e.code().0 as u32
                    );
                    return;
                }
            };
            let mut last = Instant::now();
            let mut c: ControlState = control.get();
            loop {
                let started = Instant::now();
                let mut sample = if c.enabled {
                    reader.tick(c.calibrate)
                } else {
                    reader.idle()
                };
                sample.period_ms = started.duration_since(last).as_millis().min(u128::from(u32::MAX)) as u32;
                last = started;
                if !sink(sample) {
                    break;
                }
                match next_turn(&control, c, started) {
                    Some(next) => c = next,
                    None => break,
                }
            }
            reader.release_all();
        })
        .ok()
}
```

- [ ] **Step 5: Test thuần xanh trên Mac**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result"; cargo test -p speaker-worker --test worker_process 2>&1 | grep -E "^test result"`
Expected: lib **162** đạt, 5 bỏ qua (`reader_setup` mới: +1); `worker_process` **10** đạt. `uia.rs` không biên dịch trên macOS (`#[cfg(windows)]`) nên không ảnh hưởng.

- [ ] **Step 6: Kiểm kiểu và clippy cho Windows (msvc)**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && scripts/check-windows.sh --locked 2>&1 | tail -4`
Expected: `Finished` và không cảnh báo, mã thoát 0 (`scripts/check-windows.sh` chạy `cargo clippy … --target x86_64-pc-windows-msvc --all-targets -- -D warnings` cho `speaker-worker` cùng các crate khác, gồm `uia.rs` và `uia-record`). Lỗi biên dịch nhỏ ở `uia.rs` (kiểu `windows` 0.62.2: mượn, `Param`, tên hàm) thì sửa **không đổi hành vi**; muốn đổi hành vi thì dừng, báo.

- [ ] **Step 7: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && scripts/release/check-no-network.sh && git status --short | wc -l`
Expected: sạch; `Finished`; `không có mã mạng: speaker-worker speaker-protocol speaker-recipe (…)`; `git status` thêm `uia.rs`. Không commit.

---

### Task 7: `uia-record` và `make_fixture.py` cho bản ghi Windows

**Files:**
- Create: `crates/speaker-worker/src/bin/uia-record.rs`
- Modify: `scripts/speaker-recipes/make_fixture.py`, `scripts/speaker-recipes/test_make_fixture.py`

- [ ] **Step 1: Test Python (đỏ)** — `make_fixture.py` nhận bản ghi của `uia-record fixture` (khóa `lines`, vai trò Windows):

Trong `scripts/speaker-recipes/test_make_fixture.py`, thay

```python
from make_fixture import Anonymizer, cmd_review, fields, leaks  # noqa: E402
```

bằng

```python
import re  # noqa: E402

from make_fixture import Anonymizer, cmd_review, fields, leaks, meeting_lines, snapshot_lines  # noqa: E402
```

```python
class WindowsRolesTest(unittest.TestCase):
    """Kế hoạch 05: bản ghi của `uia-record fixture` (khóa `lines`, vai trò là tên loại điều khiển UI Automation)."""

    def test_snapshot_lines_accepts_texts_and_lines(self):
        self.assertEqual(snapshot_lines({"t": 0, "texts": ["a"]}), ["a"])
        self.assertEqual(snapshot_lines({"t": 0, "lines": ["b"]}), ["b"])

    def test_windows_roles_pick_the_meeting_window_and_its_document(self):
        def row(depth, role, title="", value="", cls=""):
            return f"{depth}|{role}||{title}||{value}|||" + f"|{cls}"

        lines = [
            row(0, "Window", "Meet - abc-defg-hij - Google Chrome"),
            row(1, "Button", "Dấu trang riêng", cls="BookmarkButton"),
            row(2, "Document", "Meet - abc-defg-hij"),
            row(3, "Group", cls="oZRSLe"),
            row(2, "Document", "Gmail - Hộp thư"),
            row(3, "Text", "thư riêng", "thư riêng"),
            row(0, "Window", "Notepad"),
        ]
        title = re.compile(r"^Meet - ")
        kept = meeting_lines(lines, re.compile(r"Meet - "), True, None)
        self.assertEqual([f[1] for f in kept], ["Window", "Document", "Group"])
        self.assertEqual(len(meeting_lines(lines, re.compile(r"Meet - "), False, None)), 6)
        self.assertEqual(len(meeting_lines(lines, re.compile(r"Notepad"), False, None)), 1)
        self.assertIsNotNone(title.search("Meet - x"))
```

(Dán khối `class WindowsRolesTest` trên ngay trước dòng `if __name__ == "__main__":` của `test_make_fixture.py`.)

Run: `cd $W && python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -3`
Expected: lỗi `ImportError: cannot import name 'meeting_lines'`/`snapshot_lines`.

- [ ] **Step 2: `make_fixture.py` nhận vai trò và khóa của Windows**

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
def fields(line):
```

bằng

```python
# Vai trò theo hệ điều hành: cửa sổ, vùng web, chữ tĩnh (macOS: AX…; Windows: tên loại điều khiển UI Automation, kế hoạch 05).
WINDOW_ROLES = ("AXWindow", "Window")
WEB_ROLES = ("AXWebArea", "Document")
TEXT_ROLES = ("AXStaticText", "Text")


def snapshot_lines(snap):
    """Các dòng của một ảnh chụp: `texts` (bản ghi `axtrace`) hay `lines` (`ax-record fixture`, `uia-record fixture`)."""
    return snap["texts"] if "texts" in snap else snap["lines"]


def fields(line):
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
python3 -I make_fixture.py build <watch.jsonl> <truth.json> <ra.jsonl> --names <ánh xạ.json> --window <regex tiêu đề cửa sổ>
```

bằng

```python
python3 -I make_fixture.py build <watch.jsonl> <truth.json> <ra.jsonl> --names <ánh xạ.json> --window <regex tiêu đề cửa sổ>
    (`<watch.jsonl>`: bản ghi `axtrace watch` (khóa `texts`) hay `ax-record fixture`, `uia-record fixture` (khóa `lines`); vai trò
    cửa sổ, vùng web, chữ tĩnh của macOS và của Windows đều nhận.)
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
            keep = f[1] == "AXWindow" and bool(title_re.search(f[3]))
```

bằng

```python
            keep = f[1] in WINDOW_ROLES and bool(title_re.search(f[3]))
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
                if f[1] == "AXWebArea" and title_re.search(f[3]):
```

bằng

```python
                if f[1] in WEB_ROLES and title_re.search(f[3]):
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
            for snap_line in json.loads(line)["texts"] if line.strip() else []:
```

bằng

```python
            for snap_line in snapshot_lines(json.loads(line)) if line.strip() else []:
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
            for x in json.loads(line)["texts"]:
```

bằng

```python
            for x in snapshot_lines(json.loads(line)):
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
                elif pending is not None and f[1] == "AXStaticText" and f[5].strip():
```

bằng

```python
                elif pending is not None and f[1] in TEXT_ROLES and f[5].strip():
```

Trong `scripts/speaker-recipes/make_fixture.py`, thay

```python
        lines = meeting_lines(s["texts"], title_re, a.web_area, a.title)
```

bằng

```python
        lines = meeting_lines(snapshot_lines(s), title_re, a.web_area, a.title)
```

- [ ] **Step 3: Chạy Python, thấy xanh**

Run: `cd $W && python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -3`
Expected: `Ran 8 tests` rồi `OK`.

- [ ] **Step 4: Công cụ `uia-record`** — `crates/speaker-worker/src/bin/uia-record.rs`, cùng cách dùng với `ax-record` (không có `--marker`: Windows không có file dấu). Trên không phải Windows chỉ in một dòng và thoát mã 2.

```rust
//! Công cụ đo và ghi của bộ đọc tên trên Windows (kế hoạch 05 Task 7; chỉ Windows): chạy đúng bộ đọc của `speaker-worker` (công thức
//! build sẵn hay `--recipe <file>`) trên một app họp đang chạy, `--rate` lượt mỗi giây, trong `--seconds` giây, rồi thoát. Chỉ đọc,
//! không bấm gì, không cần quyền quản trị (app họp và công cụ phải cùng mức quyền, thường cả hai chạy quyền người dùng thường).
//!
//!   uia-record stats <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>] [--calibrate]
//!       mỗi lượt một dòng {"t", "pass", "ms", "elements", "status", "tiles", "timeouts", "denied"}: không có tên người
//!   uia-record fixture <app> <ra.jsonl> [--rate 1|4] [--seconds 60] [--recipe <file>]
//!       mỗi lượt một ảnh chụp cây của cửa sổ họp (tối đa `--rate` lần mỗi giây; mỗi lần chụp cả cây có thể mất hơn 250 ms), định dạng fixture: CÓ TÊN THẬT VÀ CHỮ CỦA APP HỌP, chỉ ghi vào thư mục dữ liệu, ẩn
//!       danh bằng scripts/speaker-recipes/make_fixture.py trước khi vào repo
//!
//! <app>: teams | zoom | meet_chrome | meet_edge. Công thức build sẵn chưa có mục Windows (kế hoạch 05 QĐ 8): cần `--recipe`.
//! `--calibrate`: mỗi lượt đọc cả ứng viên tự hiệu chỉnh, như worker khi đang tìm hay đã học được chỉ báo.

#[cfg(not(windows))]
fn main() {
    eprintln!("uia-record chỉ chạy trên Windows");
    std::process::exit(2);
}

#[cfg(windows)]
fn main() -> anyhow::Result<()> {
    use std::io::Write;
    use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

    use anyhow::{Context, bail};
    use speaker_protocol::MeetingApp;
    use speaker_recipe::Os;
    use speaker_worker::reader::uia::{ComGuard, LiveReader};

    const USAGE: &str = "cách dùng: uia-record stats|fixture <teams|zoom|meet_chrome|meet_edge> <ra.jsonl> [--rate 1|4] \
                         [--seconds N] [--recipe <file>] [--calibrate]";
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 4 {
        bail!("{USAGE}");
    }
    let (mode, out) = (args[1].as_str(), args[3].as_str());
    if mode != "stats" && mode != "fixture" {
        bail!("{USAGE}");
    }
    let app: MeetingApp = serde_json::from_value(serde_json::Value::String(args[2].clone())).context(USAGE)?;
    let opt = |name: &str| {
        args.iter()
            .position(|a| a == name)
            .and_then(|i| args.get(i + 1))
            .cloned()
    };
    let rate: u64 = opt("--rate").map_or(Ok(1), |v| v.parse()).context("--rate")?;
    let seconds: u64 = opt("--seconds").map_or(Ok(60), |v| v.parse()).context("--seconds")?;
    let calibrate = args.iter().any(|a| a == "--calibrate");
    let recipe_json = match opt("--recipe") {
        Some(p) => std::fs::read_to_string(&p).with_context(|| format!("không đọc được {p}"))?,
        None => speaker_recipe::BUILTIN_JSON.to_string(),
    };
    let recipes = speaker_recipe::parse(&recipe_json)?;
    if recipes.app(Os::Windows, app).is_none() {
        bail!(
            "công thức không có mục Windows cho {app:?} (bỏ: {:?}); dùng --recipe <file>",
            recipes.dropped
        );
    }
    let _com = ComGuard::init();
    let mut reader = LiveReader::new(std::sync::Arc::new(recipes), Some(app))
        .map_err(|e| anyhow::anyhow!("không khởi tạo được UI Automation (0x{:08X})", e.code().0 as u32))?;
    let mut file =
        std::io::BufWriter::new(std::fs::File::create(out).with_context(|| format!("không tạo được {out}"))?);
    let period = Duration::from_millis(1_000 / rate.clamp(1, 4));
    let end = Instant::now() + Duration::from_secs(seconds);
    let mut result = Ok(());
    while Instant::now() < end && result.is_ok() {
        let started = Instant::now();
        let s = reader.tick(calibrate);
        let t = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs_f64();
        let line = if mode == "stats" {
            serde_json::json!({
                "t": t, "pass": format!("{:?}", s.pass), "ms": s.pass_ms, "elements": s.elements,
                "status": format!("{:?}", s.status), "tiles": s.tiles.len(),
                "timeouts": reader.timeouts(), "denied": reader.denied(),
            })
        } else {
            serde_json::json!({"t": t, "lines": reader.dump_windows()})
        };
        result = writeln!(file, "{line}");
        std::thread::sleep(period.saturating_sub(started.elapsed()));
    }
    reader.release_all();
    result?;
    file.flush()?;
    Ok(())
}
```

- [ ] **Step 5: Kiểm kiểu và clippy cho Windows; biên dịch bằng mingw**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker && scripts/check-windows.sh --locked 2>&1 | tail -3; cargo build -p speaker-worker --bin uia-record 2>&1 | tail -1; target/debug/uia-record; echo "mã thoát $?"`
Expected: `check-windows.sh` `Finished`, mã 0; bản macOS của `uia-record` `Finished`; chạy nó in `uia-record chỉ chạy trên Windows` và `mã thoát 2`.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -1 && git status --short | wc -l && ls scripts/speaker-recipes | grep -c pycache`
Expected: sạch; `Finished`; `OK`; `git status` thêm `uia-record.rs`; `0` (không có `__pycache__`: dùng `-B`). Không commit.

---

### Task 8: Mốc kiểm tổng của phần làm trên Mac (Task 0–7)

**Files:** không

- [ ] **Step 1: fmt, clippy toàn workspace, clippy Windows**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt --all -- --check && echo fmt-ok && cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1 && scripts/check-windows.sh --locked 2>&1 | tail -1`
Expected: `fmt-ok`; hai `Finished`, không cảnh báo.

- [ ] **Step 2: Test**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-protocol 2>&1 | grep -E "^test result"; cargo test -p speaker-recipe 2>&1 | grep -E "^test result"; cargo test -p speaker-worker 2>&1 | grep -E "^test result"; cargo test -p pipeline --lib 2>&1 | grep -E "^test result"; cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result"; cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result"; python3 -I -B scripts/speaker-recipes/test_make_fixture.py 2>&1 | tail -1`
Expected: `speaker-protocol` 14; `speaker-recipe` **8**; `speaker-worker` lib **162** đạt (5 bỏ qua), `worker_process` **10**; `pipeline` lib 360; `speaker_client` 31; `meeting-translator --lib` 935 (6 bỏ qua); `OK` (8 test). Các số không phải của kế hoạch này không đổi so với Task 0.

- [ ] **Step 3: Không mã mạng, không thêm phụ thuộc**

Run: `cd $W && scripts/release/check-no-network.sh && git diff --shortstat Cargo.lock && grep -n "windows = " crates/speaker-worker/Cargo.toml`
Expected: `không có mã mạng: speaker-worker speaker-protocol speaker-recipe (…)`; `git diff --shortstat Cargo.lock` **giống hệt** dòng ghi ở Task 0 Step 1 (kế hoạch này không thêm crate nào, không đổi `Cargo.lock`); `windows = { version = "0.62.2", …` không đổi.

- [ ] **Step 4: Dựng `.exe` Windows bằng mingw (profile release của repo) và kiểm DLL nhập**

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 18 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc CFLAGS_x86_64_pc_windows_gnu="-ffile-prefix-map=$HOME=/home/user -ffile-prefix-map=$W=/src" RUSTFLAGS="--remap-path-prefix=$HOME=/home/user --remap-path-prefix=$W=/src" CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 cargo build --release --locked --target x86_64-pc-windows-gnu -p speaker-worker --bin speaker-worker --bin uia-record 2>&1 | tail -1 && G=target/x86_64-pc-windows-gnu/release && ls -l $G/speaker-worker.exe $G/uia-record.exe | awk '{print $5, $9}' && for f in speaker-worker uia-record; do echo "== $f"; x86_64-w64-mingw32-objdump -p $G/$f.exe | grep "DLL Name" | sed 's/.*DLL Name: //' | sort -u | tr '\n' ' '; echo; done; x86_64-w64-mingw32-objdump -p $G/speaker-worker.exe | grep -ci "ws2_32\|winhttp\|wininet\|wsock"; strings $G/speaker-worker.exe | grep -c "/User[s]/"; xz -9e -c $G/speaker-worker.exe | wc -c`
Expected: `Finished` (vài phút; build lần đầu có thể lâu hơn); hai file `.exe` (ghi cỡ thật; bản thử khi viết kế hoạch: `speaker-worker.exe` 6 163 456 byte, `uia-record.exe` 1 829 376 byte); danh sách DLL của `speaker-worker.exe` **chỉ là DLL hệ thống Windows**: `KERNEL32`, `ntdll`, `api-ms-win-core-synch-l1-2-0`, `api-ms-win-crt-*`, `bcryptprimitives`, `oleaut32` (đã có ở `02-windows.md`) **và mới `ole32.dll`, `user32.dll`** (bản thử); **dòng đếm `ws2_32|winhttp|wininet|wsock` phải là `0`** (có thì dừng, báo: một đường mã mạng lọt vào); `strings … /User[s]/` là `0`; cỡ xz (bản thử 1 545 836 byte) cộng 21 101 359 (bộ cài 0.3.1) phải còn xa giới hạn 60 000 000 byte (`package-windows.mjs`). Ghi các số thật vào `$B/results/05-windows.md` ở Task 9.

- [ ] **Step 5: Windows không cần thay đổi nào ở app, pipeline, giao thức**

Run: `cd $W && grep -rn "reader_platform\|ReaderPlatform" src-tauri/src crates/pipeline/src --include=*.rs | grep -v "^crates/speaker-protocol" | head; grep -rn "NoPermission" src-tauri/src crates/pipeline/src --include=*.rs | grep -v "test" | head -6`
Expected: dòng đầu không có kết quả (app và pipeline không đọc `reader_platform`); dòng sau chỉ thấy `transcript/speakers.rs` (`ask_access` theo `ReaderStatus::NoPermission`), nơi Windows không bao giờ tạo trạng thái đó (QĐ 7). Có chỗ khác dùng `reader_platform` hay `ReaderPlatform` thì dừng, báo (QĐ 17 sai).

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && git status --short | wc -l && ls scripts/speaker-recipes/fixtures | grep -c windows`
Expected: số dòng bằng Task 0 Step 1 cộng các file mới (`uia_tree.rs`, `winscan.rs`, `windowset.rs`, `stats.rs`, `uia.rs`, `uia-record.rs` nếu `reader/` chưa untracked, ba JSON); `3`. Không commit.
