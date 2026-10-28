# Phân biệt người nói, kế hoạch 06: vận hành (công thức đọc tên tải từ xa có ký số, báo cáo tình trạng, kiểm tra tự động hằng ngày)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, clippy, fmt liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Giữ nhánh `phan-biet-nguoi-noi`, không gộp `main`, không rebase. Chỉ commit khi chủ dự án nói rõ. (Riêng lệnh `pnpm recipes:update` của người vận hành, sau này, tự commit và đẩy `main` như `pnpm models:update`: đó là công cụ vận hành, không phải việc của kế hoạch này.)
>
> **Task phần A (Task 0–16) làm hoàn toàn trên máy Mac này, không deploy, không chạm production, Cloudflare, R2, không chạy gì với Teams, Chrome, Edge, Zoom hay app thật.** Mọi test dùng cây giả, cây ghi sẵn, server giả, D1 cục bộ của vitest. Task phần B (Task 17–22, file 06b) cần chủ dự án: đặt, triển khai, bật workflow, tạo tài khoản, chạy trên máy thật.

**Goal:** đặt hạ tầng vận hành cho "Phân biệt người nói" để Teams, Meet, Zoom đổi giao diện thì sửa được mà không phải phát hành app, và biết ngay khi nó hỏng: (1) công thức đọc tên tải từ xa có ký số (`pnpm recipes:update`, CI ký, R2; app tải lúc mở và mỗi 6 giờ, chống quay lui, hỏng thì giữ bản đang có); (2) báo cáo tình trạng bộ đọc (`speaker_health`: app gom, gửi qua `POST /v1/diagnostics`, server lưu bảng D1 riêng, Web Admin có tab, cron gửi email khi một phiên bản app họp hỏng); (3) kiểm tra tự động hằng ngày chạy bộ đọc thật lên cuộc họp thử (macOS, Windows). Làm thêm các việc mà kế hoạch 03, 04, 05 đã hứa cho kế hoạch này: mô tả chỉ báo tự học trong báo cáo, `app_version` trên Windows, hợp nhất `Stats`, bộ che báo cáo lỗi biết tên người tham dự.

**Architecture:** mọi logic thuần (phong bì ký riêng của công thức, luật nhận hay từ chối công thức, gom tình trạng thành báo cáo, luật chấm kiểm tra tự động) nằm ở crate mới `crates/speaker-ops`, test trọn vẹn trên Mac; app (`src-tauri`) và công cụ kiểm tra tự động (`crates/speaker-canary`) chỉ nối mỏng. `speaker-worker` **không** phụ thuộc crate này (không thêm thư viện ký hay mạng vào worker). Công thức tải từ xa đi đúng kiểu `models.json`: phong bì Ed25519, cùng khóa ký manifest trong CI nhưng `format` và tiền tố ký riêng, `version` chống quay lui, giới hạn kích thước, chỉ là dữ liệu. Báo cáo tình trạng đi cùng endpoint với báo cáo lỗi nhưng bảng, hạn mức, danh sách trường cho phép đều riêng; không có tên người ở bất kỳ tầng nào. Kiểm tra tự động chấm ở mức bộ đọc (cây giao diện thật so với lịch nói đã biết), không chạy cả app.

**Tech Stack:** Rust 1.98.1 (edition 2024, MSRV 1.98 của workspace); TypeScript 7.0.2, Hono 4.13.12, vitest 4.1.11 + `@cloudflare/vitest-plugin` 1.3.4 (server); React 19.3.0, vitest 5.0.3 (Web Admin); Node 24 (`node --test`). **Không thêm thư viện npm nào.** Rust: crate mới `speaker-ops` dùng `base64` 0.23.1, `ed25519-dalek` 3.0.0 (không bật feature mặc định), `serde`, `serde_json`, `thiserror`, `tempfile` 3.27.0 (chỉ test); crate mới `speaker-canary` thêm `reqwest` 0.13.5 (`blocking`, `native-tls`, `system-proxy`), `sha2` 0.11.0, `clap`, `anyhow`. Kiểm bằng `cargo search` và `cargo info` ngày 2026-10-27: `ed25519-dalek` 3.0.0 (MSRV 1.85), `base64` 0.23.1 (1.71), `tempfile` 3.27.0 (1.63), `reqwest` 0.13.5, `thiserror` 2.0.21, `serde` 1.0.229, `regex` 1.13.1, `clap` 4.6.7 (1.85), `anyhow` 1.0.104, `windows` 0.62.2: **đều là bản ổn định mới nhất và trùng `Cargo.lock`**, MSRV đều ≤ 1.98.1. Hai chỗ chưa mới nhất, ghi rõ: `sha2` 0.11.0 (crates.io có 0.11.1, MSRV 1.88) và `serde_json` 1.0.151 (có 1.0.154); cả hai đang khóa chung cho nhiều crate của workspace (app, `speaker-worker`, `pipeline`…), nâng chúng đổi `Cargo.lock` của cả workspace nên để đợt cập nhật phụ thuộc chung, không làm ở đây (mục "Điều cần chủ dự án quyết" 8). `Cargo.lock` đổi đúng ba chỗ (gói `speaker-ops`, gói `speaker-canary`, một dòng trong phụ thuộc của `meeting-translator`), không đổi phiên bản của crate nào có sẵn; `windows` thêm hai feature (`Win32_Storage_FileSystem`, `Win32_Storage_Packaging_Appx`), không thêm crate. Không có hai bản ggml (không crate mới nào chứa ggml). `cargo deny check` và `cargo audit` sạch trên bản đã dựng thử.

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §7 (7.1 công thức đọc, 7.2 báo cáo tình trạng, 7.3 kiểm tra tự động hằng ngày, 7.4 hỏng thì vẫn chạy), §10 (bảo mật, quyền riêng tư), §12 (kiểm thử), §13 mục 6 và 7, §14. Spec công thức và manifest: `docs/superpowers/specs/2026-10-23-cap-nhat-model-tu-dong-design.md`; báo cáo lỗi: `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md`.

**Dựa trên:** kế hoạch 02 đến 05 đã thực thi phần tự động (nhánh `phan-biet-nguoi-noi`, working tree): `crates/speaker-recipe` (định dạng công thức, `parse`, `Matcher`), `crates/speaker-protocol` (`ReaderState`), `crates/speaker-worker/src/{reader,names}/`, `src-tauri/src/speaker/`, `src-tauri/src/diagnostics/` (báo cáo lỗi: `Host`, `Reporter`, `HttpReportApi`, `scrub`), `src-tauri/src/models/{signed,source,service}.rs` (mẫu cho tải có ký), `scripts/models/*` (mẫu cho `pnpm models:update`), `.github/workflows/sign-manifest.yml`, `server/` (`diagnostics.ts`, `error-reports.ts`, `alerts.ts`, `reconcile.ts`, `admin-*.ts`, `admin-ui/`), `scripts/speaker-recipes/` (`recipes.json`, fixtures). Đọc `$B/results/04-do.md`, `05-windows.md` và các mục "Để kế hoạch sau" của 04, 05b (cuối file) trước khi làm.

**Kế hoạch đi kèm:** `2026-10-27-phan-biet-nguoi-noi-06b-van-hanh-server-canary.md` (Task 10–22: server, Web Admin, công cụ kiểm tra tự động, runbook, mốc kiểm cuối của phần A, rồi phần B cần chủ dự án). File này (Task 0–9) là phần Rust và script làm trước; số Task dùng chung cho hai file. **Phủ spec, "Để kế hoạch sau", rủi ro và điều cần chủ dự án quyết của cả hai file ở cuối file 06b.**

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo); `B` = `$W/bench/2026-10-26-nguoi-noi`. Đặt ba biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`** (lệnh của `server/` thì `cd $W/server &&`).
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0`.** Không `cargo clean`, không xóa gì trong `target/`. Lệnh `cargo test` có từ hai bộ lọc tên trở lên viết dạng `--lib -- a:: b::`.
- **Đĩa:** bước build nặng (build lần đầu sau khi đổi nhiều file, mọi lệnh `--release`, build `meeting-translator`) **bắt đầu bằng lệnh kiểm đĩa có điều kiện**, dừng thật khi thiếu: `avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; }` (ngưỡng **18** GiB cho lệnh `--release`). Lệnh dừng thì **báo chủ dự án** (không tự dọn).
- **Định dạng Rust:** mã mẫu dưới đây đã qua `cargo fmt` (`max_width = 120`); mỗi Mốc kiểm vẫn chạy `cargo fmt -p <crate>` rồi `-- --check`.
- **Server và Web Admin:** `cd $W/server && pnpm install --frozen-lockfile` một lần (cài `server/` và `server/admin-ui/`, cùng một workspace pnpm riêng). Test server: `pnpm exec vitest run`, kiểm kiểu `pnpm typecheck`; test Web Admin: `cd $W/server/admin-ui && pnpm exec vitest run`.
- **Windows build:** `scripts/check-windows.sh` kiểm kiểu và clippy target `x86_64-pc-windows-msvc` (bằng mingw, không dùng `cargo-xwin`, điều khoản của Microsoft). Mã Windows chỉ biên dịch chéo và clippy được trên Mac; hành vi thật cần máy Windows (Task 20).
- Repo GitHub công khai: không ghi đường dẫn thư mục cá nhân, tên người thật, bí mật vào file nào của repo. Tên trong test là tên giả; tên tài khoản thử và đường dẫn của máy chạy kiểm tra chỉ nằm trong file cấu hình **ngoài repo**. Lúc làm Task 16 quét lại.
- **Tên người không bao giờ vào log, `CommandError.message`, báo cáo lỗi, báo cáo tình trạng, email cảnh báo.** Báo cáo tình trạng chỉ có số đếm, trạng thái, phiên bản, mô tả chỉ báo (vai trò, vị trí, lớp) và `device_id_hash` (như báo cáo lỗi hiện có); chỉ gửi khi công tắc "Gửi báo cáo lỗi" (Cài đặt › Quyền riêng tư) bật, tắt thì xóa sổ trên máy.
- `speaker-worker` không có mã mạng (CI kiểm bốn lớp `scripts/release/check-no-network.sh`): đừng viết tên API mạng, kể cả trong chú thích, ở `crates/speaker-worker/src`, `crates/speaker-protocol/src`, `crates/speaker-recipe/src`.
- Số test "mong đợi" là số đo khi viết kế hoạch trên bản sao của cây hiện tại; lệch thì ghi số thật và xem lại, đổi hành vi thì dừng, báo.

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **Crate `speaker-ops`, không thêm gì vào `speaker-worker`.** Phong bì ký cần `ed25519-dalek` và `base64`; báo cáo cần `serde_json`. Worker có bảng SHA-256 của mọi thứ trong `binaries/` và cam kết "không mã mạng, ít phụ thuộc": giữ nguyên. Công thức đã được **app** kiểm chữ ký, worker chỉ kiểm lại cấu trúc (`speaker_recipe::parse`), đúng chữ spec 4.2. `speaker-ops` phụ thuộc `speaker-recipe` và `speaker-protocol` (kiểu dùng chung), không phụ thuộc Tauri.
2. **Phong bì ký riêng, không sửa `models/signed.rs`.** `format` là `ai-translator-speaker-recipes`, tiền tố ký `ai-translator-speaker-recipes.v1.`, cùng khóa trong khối `production` của `manifest-public-keys.json` (spec 7.1: "cùng khóa ký manifest trong CI"). Một chữ ký của `models.json` không mở được công thức và ngược lại (test cả hai chiều, ở Rust và Node). Cách làm là sao ~40 dòng đọc phong bì của `models/signed.rs` có tham số riêng thay vì tách hàm chung: không đụng manifest model (đang chạy production), và bộ vector do Node sinh (`gen-recipe-vectors.mjs`) bảo đảm hai bản không lệch nhau.
3. **Chống quay lui bằng `version` của phần thân** (số nguyên dương, đã có ở `recipes.json`). Bản đang có là bản lớn hơn trong bản build sẵn và bản đã lưu. Số nhỏ hơn: từ chối (kể cả chữ ký đúng); bằng số mà khác nội dung (so JSON theo ngữ nghĩa, vì bản build sẵn viết tay còn bản tải về gọn): xung đột, từ chối; đúng bản đang có: không đổi. `min_app_version` bắt buộc, đúng dạng `x.y.z`, không lớn hơn bản app. Công thức không còn mục nào vẫn nhận được: đó là **công tắc tắt từ xa** bộ đọc (người dùng quay về "Người N" mà không cần phát hành app).
4. **Tải công thức chỉ khi tính năng đang bật cho người dùng** (`speaker::enabled()` và "Phân biệt người nói" và "Lấy tên"): sau 20 giây lúc mở, rồi mỗi 6 giờ; một lệnh GET không kèm mã máy hay thông tin nào. Bản nhận được lưu **nguyên văn phong bì** và kiểm lại chữ ký mỗi lần nạp (file bị sửa trên đĩa thì bị bỏ). Công thức mới áp dụng từ **phiên dịch sau** (`Load` gửi công thức một lần lúc worker chạy); không đổi công thức giữa phiên.
5. **`pnpm recipes:update`** (`scripts/speaker-recipes/update*.mjs`): nguồn là `scripts/speaker-recipes/recipes.json` (cũng là bản build sẵn của app). Người vận hành sửa file đó, tăng `version`, chạy lệnh: kiểm luật của app (`check_recipes_body`), chạy toàn bộ test của `speaker-worker` (có bộ test cây giao diện ghi sẵn và fixture Windows), in khác biệt so với bản đang phát hành, hỏi y/N, rồi commit, đẩy `main`, kích `sign-recipes.yml` (cùng environment `release`, cùng secret `MANIFEST_SIGNING_KEY`; **không có secret mới**), tải `recipes.json` đã ký, đăng R2 bằng `wrangler r2 object put` (không cần rclone), sao lưu bản cũ, kiểm lại qua URL công khai. Bản đã phát hành lưu ở `scripts/speaker-recipes/released/body-<V>.json`. **Quay lại** là `--revert-to <V>`: số mới = đang phát hành + 1, nội dung của V (app không nhận số cũ hơn). Lệnh không lưu `state.json`: dừng giữa chừng thì chạy lại (không commit lần hai, `git push` an toàn, CI ký lại).
6. **Giao thức 3: `ReaderState.patterns`.** `LearnedPattern {role, path, states[{subrole, classes}]}` (spec 6.5: "mẫu chỉ báo tìm được: vai trò, id, lớp CSS, vị trí so với chữ tên; không có tên người"). Bộ hiệu chỉnh nhớ mô tả của từng ứng viên đã thấy (`CandidateShape`, chỉ khi đang hiệu chỉnh) và khi học được thì lưu mô tả các trạng thái thấy nhiều nhất. Giới hạn cứng ở giao thức (`MAX_*`, `patterns_fit`: app coi khung vượt là worker hỏng), rồi lọc theo danh sách cho phép ở app (`sanitize_patterns`: chỉ `[A-Za-z0-9_-]`, không dãy ≥ 5 chữ số, ≤ 32 byte) và ở server (danh sách cho phép chặt hơn nữa). `AXIdentifier`/`AXDOMIdentifier` **không** đi vào mô tả (id có thể mang mã người dùng); chỉ vai trò, vai trò phụ và lớp.
7. **`app_version` trên Windows:** Teams mới là gói MSIX trong `WindowsApps` (đọc file phiên bản của file chạy ở đó thường bị từ chối), nên lấy phiên bản từ **tên đầy đủ của gói** (`GetPackageFullName` trên handle `PROCESS_QUERY_LIMITED_INFORMATION`, cắt trường phiên bản) và, nếu tiến trình không phải app đóng gói (Chrome, Edge, Zoom), từ tài nguyên phiên bản của file chạy (`GetFileVersionInfoW`). Chỉ hỏi cho app trong danh sách viết cứng; nhớ cùng file chạy 30 giây. Hai feature mới của `windows` (đã nêu ở Tech Stack). Phần phân tích chuỗi (`package_version`, `fixed_file_version`) thuần và test được trên Mac; phần gọi Win32 chỉ clippy chéo (rủi ro ở cuối file 06b).
8. **Hợp nhất `Stats`:** `reader::macos` bỏ bản `Stats` riêng, dùng `reader::stats::Stats` (viết ở kế hoạch 05). Dòng log mỗi 60 giây đổi chữ "phần tử p90" thành "lệnh đọc p90" (không script nào đọc dòng này). **Không** hợp nhất vòng lặp `tick` của macOS và Windows: bản macOS chưa thử với app thật (04b Task 19–21 còn chờ chủ dự án), sửa nó bây giờ là đổi mã chưa kiểm chứng; ghi ở "Để kế hoạch sau".
9. **Báo cáo tình trạng:** app gom mỗi `ReaderState` vào sổ trên máy theo (ngày UTC, app họp, phiên bản app họp, tình trạng). "Phút họp" là thời gian bộ đọc có app họp và không nghỉ (`Ok`, `NoNames`, `NoSpeaking`, `NoPermission`, `Blocked`); "phút đọc được tên" chỉ tính `Ok` (có tên **và** có chỉ báo "đang nói"). Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản): gửi **ngày đã qua** (không gửi ngày đang chạy), từ một phút trở lên, khi công tắc "Gửi báo cáo lỗi" bật và app rảnh; tắt công tắc thì xóa cả sổ. Thân báo cáo chỉ có chuỗi trong danh sách cho phép; còn mẫu nhạy cảm (bộ kiểm cuối của báo cáo lỗi) thì bỏ báo cáo đó.
10. **Server:** cùng `POST /v1/diagnostics`, nhận `kind: "speaker_health"` **trước** `parseReport`, bảng D1 riêng `speaker_health` (migration 0007, chỉ thêm), hạn mức riêng (`speaker_device` 20 mỗi giờ, `speaker_global` 600; không ăn vào hạn mức báo cáo lỗi), danh sách trường cho phép ở mọi cấp (khóa lạ là từ chối: nơi tên người có thể lọt vào), mỗi (máy, ngày, app họp, phiên bản, canary) một dòng (gửi lại không tạo bản trùng), 422 nếu bộ phát hiện nhạy cảm của báo cáo lỗi còn thấy gì, giữ 60 ngày, xóa theo email (`/admin/erase`) xóa luôn báo cáo của máy đã kích hoạt license của email đó.
11. **Cảnh báo (cron 5 phút):** một (app họp, phiên bản) có ≥ 30% báo cáo hỏng (`no_names`, `no_speaking`, `blocked`; **không** tính `no_permission`, là việc của người dùng) từ 5 báo cáo trong 3 ngày qua (chỉ bản release, không canary); kiểm tra tự động hỏng 2 ngày liền, **hoặc im lặng 3 ngày** sau khi từng có kết quả (nếu chỉ chờ "hỏng", kiểm tra tự chết lặng im sẽ không bao giờ báo). Mỗi chủ thể cảnh báo tối đa một lần mỗi ngày (nhớ bằng hàng `speaker_seen:…` ở `ops_alerts`, không bao giờ gửi email vì `count = notified_count`); email là hai loại tĩnh, chỉ có số lượng, không nêu app hay phiên bản.
12. **Bộ che báo cáo lỗi biết tên người tham dự** (kế hoạch 03 hứa, spec §10): `Host::known_names` (app: tên người tham dự và nhãn có tên của bảng người nói hiện có, không tính "Người N") dùng để che bằng `<tên>` trong câu lỗi và ba file log trước khi dựng báo cáo lỗi, cả tự động lẫn gửi tay. Biên từ theo Unicode, không phân biệt hoa thường; tên ngắn hơn 2 ký tự hay dài hơn 160 byte bị bỏ qua. Lớp bảo vệ thêm: log của app vốn không in tên.
13. **Kiểm tra tự động ở mức bộ đọc, khác chữ "chạy bản app dev" của spec 7.3** (cần chủ dự án duyệt, mục 1 của "Điều cần chủ dự án quyết"): `speaker-canary` chạy **bộ đọc thật** của `speaker-worker` (cùng `LiveReader`, cùng `SpeakingTracker` mà worker dùng) lên cửa sổ họp của app thật trong lúc hai khách chạy theo lịch nói đã biết, và chấm "tên đọc được và chỉ báo đúng người, đúng lúc" (A-spk3: đúng ≥ 90%, sai ≤ 5%). Không chạy cả app: không cần quyền thu âm máy ban đêm, không cần đo lại nhận giọng (A-spk1, A-spk2 đã đo ngoại tuyến), và thứ hay vỡ khi Teams, Meet đổi giao diện chính là bộ đọc. Hệ quả: nhận giọng và ghép tên với giọng không nằm trong lượt kiểm tra này (đã có test ghép tên trên dòng thời gian giả và nghiệm thu A-spk3 bằng họp thật ở kế hoạch 07).
14. **Bộ điều khiển Node, bộ đọc-chấm Rust, bộ chuyển (adapter) làm cùng chủ dự án.** `tools/speaker-canary/canary.mjs` dựng lịch, mở và dọn cuộc họp qua `adapters/<app>.mjs`, gọi `speaker-canary run`, ghi nhật ký; `crates/speaker-canary` có mã mạng (gửi báo cáo) nên là crate riêng, không phải của worker. **Bộ chuyển** (mở cuộc họp thử bằng app chủ phòng thật + hai trình duyệt tự động có micro giả) **chưa có trong repo**: cách tạo phòng và vào phòng của Teams, Meet, Zoom bằng tự động hóa chưa kiểm được ở máy này (không được chạy Teams, Chrome, Zoom); dựng ở Task 19, 20 cùng chủ dự án (rủi ro lớn nhất, cuối file 06b). Tên hai khách chỉ nằm trong cấu hình ngoài repo và file lịch tạm (xóa sau mỗi lượt), không bao giờ vào log, kết quả, báo cáo.
15. **Không commit** (đầu file); không deploy, không chạm production.

## Cấu trúc file

"06" là file này (Task 0–9); "06b" là file đi kèm (Task 10–22).

| File | Việc | Task |
|---|---|---|
| Tạo `crates/speaker-ops/{Cargo.toml,src/lib.rs,src/envelope.rs,testdata/recipe-vectors.json}` | phong bì ký riêng của công thức | 1 |
| Tạo `scripts/speaker-recipes/{lib.mjs,gen-recipe-vectors.mjs}` | ký và kiểm bằng Node, bộ vector | 1 |
| Tạo `crates/speaker-ops/src/recipes.rs` | luật nhận công thức, lưu trên máy, cổng kiểm | 2 |
| Tạo `src-tauri/src/speaker/recipes.rs`; sửa `src-tauri/Cargo.toml`, `src-tauri/src/speaker/mod.rs`, `src-tauri/src/lib.rs` | tải công thức, dùng cho `Load` | 3 |
| Tạo `scripts/speaker-recipes/{sign-recipes,update-lib,update-flow,update}.mjs`, `update.test.mjs`, `scripts/release/{sign-recipes-ci.mjs,sign-recipes-ci.test.mjs}`, `.github/workflows/sign-recipes.yml`; sửa `.github/workflows/ci.yml`, `package.json`, `.gitignore`, `scripts/release/workflow.test.mjs` | ký và đăng công thức | 4 |
| Sửa `crates/speaker-protocol/src/lib.rs`, `crates/pipeline/src/{speaker,speaker_client,engine}.rs`, `crates/pipeline/src/bin/fake_speaker_worker.rs`, `crates/pipeline/tests/speaker_client.rs`, `crates/speaker-worker/src/{reader/extract.rs,names/calibrate.rs,names/track.rs,session.rs}` | giao thức 3, mô tả chỉ báo tự học | 5 |
| Sửa `crates/speaker-worker/Cargo.toml`, `reader/{winscan,uia,macos}.rs` | `app_version` Windows, hợp nhất `Stats` | 6 |
| Tạo `crates/speaker-ops/src/{health,canary}.rs`; sửa `lib.rs` | gom tình trạng, báo cáo, chấm kiểm tra tự động | 7 |
| Tạo `src-tauri/src/speaker/health.rs`; sửa `speaker/mod.rs`, `lib.rs`, `session.rs`, `diagnostics/mod.rs` | sổ và gửi báo cáo tình trạng | 8 |
| Sửa `src-tauri/src/diagnostics/{scrub,report,reporter,mod}.rs`, `speaker/mod.rs` | che tên người tham dự trong báo cáo lỗi | 9 |
| Tạo `server/migrations/0007_speaker_health.sql`, `server/src/speaker-health.ts`, `server/test/{speaker-health-fixture.ts,speaker-health.test.ts}`; sửa `alerts.ts`, `ratelimit.ts`, `diagnostics.ts`, `admin.ts`, test hiện có | server nhận và lưu | 10 (06b) |
| Tạo `server/src/admin-speaker-health.ts`, `server/test/admin-speaker-health.test.ts`; sửa `reconcile.ts`, `admin.ts` | cron cảnh báo, route admin | 11 (06b) |
| Tạo `server/admin-ui/src/pages/{speaker-kit.tsx,SpeakerHealthPanel.tsx,SpeakerHealthPanel.test.tsx}`; sửa `api/{types,endpoints}.ts`, `api/endpoints.test.ts`, `pages/ErrorsPage.tsx` | tab Bộ đọc tên | 12 (06b) |
| Tạo `crates/speaker-canary/{Cargo.toml,src/lib.rs,src/main.rs}` | bộ đọc và chấm kiểm tra tự động | 13 (06b) |
| Tạo `tools/speaker-canary/{lib.mjs,canary.mjs,canary.test.mjs,README.md,templates/canary.example.json}` | bộ điều khiển, lịch tác vụ | 14 (06b) |
| Sửa `docs/release/phat-hanh.md` | runbook mục 15 | 15 (06b) |
| Tạo `$B/results/06-van-hanh.md` | kết quả phần A | 16 (06b) |
| Tạo `$DATA/canary/`, `tools/speaker-canary/adapters/*.mjs` | bộ chuyển, tài khoản thử, lịch ban đêm | 19, 20 (06b, chủ dự án) |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Nhánh, trạng thái, đĩa, công cụ**

Run: `cd $W && git branch --show-current && git log --oneline -1 && git status --short | wc -l && git diff --shortstat Cargo.lock && df -k /System/Volumes/Data | tail -1 | awk '{printf "%.1f GiB trống\n", $4/1048576}' && node --version && rustc --version && (cargo deny --version; cargo audit --version) 2>&1 | head -2`
Expected: `phan-biet-nguoi-noi`; một dòng commit; số dòng `git status` và dòng `git diff --shortstat Cargo.lock` (ghi lại, dùng đối chiếu ở các Mốc kiểm; có các file của 03, 04, 05 chưa commit); còn trống ≥ 14 GiB (dưới thì dừng, báo chủ dự án); Node 24.x; `rustc 1.98.1`; cả hai công cụ in phiên bản.

- [ ] **Step 2: Test các phần sẽ sửa** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && for p in speaker-protocol speaker-recipe speaker-worker pipeline; do echo "== $p"; cargo test -p $p 2>&1 | grep -E "^test result"; done; echo "== app"; cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result"; cd $W/server && pnpm install --frozen-lockfile 2>&1 | tail -2 && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files"; cd $W/server/admin-ui && pnpm exec vitest run 2>&1 | grep -E "Tests |Test Files"`
Expected (mốc đo khi viết kế hoạch; lệch thì ghi số thật): `speaker-protocol` 14 đạt; `speaker-recipe` 8; `speaker-worker` lib 162 đạt, 5 bỏ qua và `worker_process` 10; `pipeline` lib 360 và `speaker_client` 31; app lib 935 đạt, 6 bỏ qua; server 45 file (số test ghi lại); Web Admin 50 file (số test ghi lại). **Chép các số này vào `$B/results/06-van-hanh.md` (Task 16)**. Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 3: Công cụ chéo Windows có sẵn**

Run: `cd $W && rustup target list --installed | grep -E "x86_64-pc-windows-(msvc|gnu)"; test -x scripts/fake-llvm-rc && test -x scripts/fake-pkg-config && echo "script giả có"`
Expected: hai target `x86_64-pc-windows-gnu` và `x86_64-pc-windows-msvc`; `script giả có`. Thiếu target thì `rustup target add …` (công cụ build, không phải thư viện của app).

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && git status --short | wc -l`
Expected: bằng số ghi ở Step 1. Không commit.

---

### Task 1: `speaker-ops`, phần phong bì ký riêng của công thức

Spec 7.1: "Phong bì ký cùng cấu trúc với `models.json`, cùng khóa ký manifest trong CI, nhưng `format` là `ai-translator-speaker-recipes` và tiền tố ký riêng, để chữ ký manifest model không dùng được cho công thức và ngược lại." Crate mới có một module ở bước này; các module sau thêm ở Task 2 và 7. Bộ vector do **Node** sinh (script ký), Rust kiểm đúng như script: nếu hai bên lệch nhau về định dạng, test đỏ ở một trong hai.

**Files:**
- Create: `crates/speaker-ops/Cargo.toml`, `crates/speaker-ops/src/lib.rs`, `crates/speaker-ops/src/envelope.rs`, `crates/speaker-ops/testdata/recipe-vectors.json`
- Create: `scripts/speaker-recipes/lib.mjs`, `scripts/speaker-recipes/gen-recipe-vectors.mjs`

- [ ] **Step 1: Script Node dùng chung (ký, kiểm) và bộ vector**

Tạo `scripts/speaker-recipes/lib.mjs`:

```javascript
// Phần dùng chung của các script công thức đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06). Định dạng phong bì phải
// khớp `crates/speaker-ops/src/envelope.rs`:
//   { "format": "ai-translator-speaker-recipes", "version": 1, "kid", "body": base64url(JSON phần thân), "sig" }
//   sig = Ed25519(CONTEXT + body), body là chuỗi base64url không đệm.
// Cùng khóa ký manifest model (khối production của src-tauri/keys/manifest-public-keys.json), nhưng `format` và tiền tố ký riêng:
// chữ ký của manifest model không dùng được cho công thức, và ngược lại.
import { webcrypto } from "node:crypto";
import { b64url, builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, REPO, testKey } from "../models/lib.mjs";

const { subtle } = webcrypto;
export const FORMAT = "ai-translator-speaker-recipes";
export const VERSION = 1;
export const CONTEXT = "ai-translator-speaker-recipes.v1.";
export { b64url, builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, REPO, testKey };

// Ký phần thân (chuỗi JSON hay Buffer) thành phong bì. `format` và `context` chỉ đổi trong bộ vector (ca "ký sai chỗ").
export async function signRecipes(privateKey, kid, body, { context = CONTEXT, format = FORMAT } = {}) {
  const bodyB64 = b64url(Buffer.isBuffer(body) ? body : Buffer.from(body));
  const sig = await subtle.sign({ name: "Ed25519" }, privateKey, Buffer.from(context + bodyB64));
  return { format, version: VERSION, kid, body: bodyB64, sig: b64url(sig) };
}

// Kiểm phong bì bằng khóa công khai `{ kid, x }`; trả phần thân đã đọc (chuỗi JSON), hay ném lỗi.
export async function verifyRecipes(envelope, keys) {
  if (envelope.format !== FORMAT || envelope.version !== VERSION) throw new Error("Phong bì sai định dạng.");
  const key = keys.find((k) => k.kid === envelope.kid);
  if (!key) throw new Error(`Không có khóa công khai cho kid ${envelope.kid}.`);
  const publicKey = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: key.x }, { name: "Ed25519" }, false, ["verify"]);
  const ok = await subtle.verify(
    { name: "Ed25519" },
    publicKey,
    Buffer.from(envelope.sig, "base64url"),
    Buffer.from(CONTEXT + envelope.body),
  );
  if (!ok) throw new Error("Chữ ký không đúng.");
  return Buffer.from(envelope.body, "base64url").toString("utf8");
}
```

Tạo `scripts/speaker-recipes/gen-recipe-vectors.mjs`:

```javascript
#!/usr/bin/env node
// Sinh bộ vector kiểm phong bì công thức, dùng chung giữa script ký (Node) và app (Rust, `crates/speaker-ops/src/envelope.rs`).
// Chạy lại cho ra đúng file cũ: Ed25519 là chữ ký tất định, khóa test sinh từ nhãn cố định. Khóa trong file này CHỈ để test; kid
// luôn bắt đầu bằng "test-" và không bao giờ có trong manifest-public-keys.json.
// Dùng: node scripts/speaker-recipes/gen-recipe-vectors.mjs > crates/speaker-ops/testdata/recipe-vectors.json
import { CONTEXT as MODELS_CONTEXT, FORMAT as MODELS_FORMAT } from "../models/lib.mjs";
import { b64url, signRecipes, testKey } from "./lib.mjs";

const k1 = await testKey("test-r1", "ai-translator speaker recipes test key 1");
const k2 = await testKey("test-r2", "ai-translator speaker recipes test key 2");
const body = {
  schema: 1,
  version: 2,
  min_app_version: "0.3.2",
  apps: [
    {
      app: "teams",
      os: "macos",
      window_title: ["^Meeting with "],
      tile: { role: "AXMenuItem", label: "^(?P<name>[^,]+), Context menu is available$" },
      name_from: "label",
      speaking: [{ kind: "presence", anchor: { scope: "child", role: "AXGroup", class_token: "vdi-frame-occlusion" } }],
      delay_ms: 900,
    },
  ],
};
const json = JSON.stringify(body);
const valid = await signRecipes(k1.privateKey, "test-r1", json);
const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Chữ ký 64 byte là 86 ký tự; ký tự cuối chỉ mang 2 bit, 4 bit còn lại phải bằng 0.
const last = valid.sig.at(-1);
const trailingBits = valid.sig.slice(0, -1) + B64URL[B64URL.indexOf(last) ^ 1];

const cases = [
  { name: "valid", envelope: valid, expect: "ok" },
  { name: "valid_second_key", envelope: await signRecipes(k2.privateKey, "test-r2", json), expect: "ok" },
  { name: "tampered_body", envelope: { ...valid, body: b64url(JSON.stringify({ ...body, version: 3 })) }, expect: "bad_signature" },
  { name: "kid_signed_by_other_key", envelope: await signRecipes(k2.privateKey, "test-r1", json), expect: "bad_signature" },
  { name: "unknown_kid", envelope: await signRecipes(k1.privateKey, "test-r9", json), expect: "unknown_key" },
  { name: "signed_without_context", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: "" }), expect: "bad_signature" },
  // Chữ ký của manifest model (cùng khóa) dưới phong bì công thức: tiền tố ký riêng nên không dùng được.
  { name: "signed_with_models_context", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: MODELS_CONTEXT }), expect: "bad_signature" },
  { name: "models_envelope", envelope: await signRecipes(k1.privateKey, "test-r1", json, { context: MODELS_CONTEXT, format: MODELS_FORMAT }), expect: "malformed" },
  { name: "body_with_padding", envelope: { ...valid, body: `${valid.body}==` }, expect: "malformed" },
  { name: "signature_trailing_bits", envelope: { ...valid, sig: trailingBits }, expect: "malformed" },
  { name: "unknown_envelope_field", envelope: { ...valid, note: "x" }, expect: "malformed" },
  { name: "wrong_format", envelope: { ...valid, format: "ai-translator-token" }, expect: "malformed" },
  { name: "version_2", envelope: { ...valid, version: 2 }, expect: "malformed" },
  { name: "kid_uppercase", envelope: { ...valid, kid: "TEST-R1" }, expect: "malformed" },
  { name: "bom", raw: `﻿${JSON.stringify(valid)}`, expect: "malformed" },
  { name: "body_not_utf8_signed", envelope: await signRecipes(k1.privateKey, "test-r1", Buffer.from([0xff, 0xfe, 0xfd])), expect: "malformed" },
];

process.stdout.write(
  `${JSON.stringify(
    {
      _note: "Vector kiểm phong bì công thức đọc tên (kế hoạch 06). Sinh bằng scripts/speaker-recipes/gen-recipe-vectors.mjs; không sửa tay. Khóa test-* chỉ để test.",
      keys: [k1, k2].map(({ kid, seed, x }) => ({ kid, x, seed })),
      body,
      cases,
    },
    null,
    2,
  )}\n`,
);
```

Sinh bộ vector (Ed25519 tất định: chạy lại ra đúng file cũ):

Run: `cd $W && mkdir -p crates/speaker-ops/testdata && node scripts/speaker-recipes/gen-recipe-vectors.mjs > crates/speaker-ops/testdata/recipe-vectors.json && node scripts/speaker-recipes/gen-recipe-vectors.mjs | cmp - crates/speaker-ops/testdata/recipe-vectors.json && echo "tất định" && grep -c '"name"' crates/speaker-ops/testdata/recipe-vectors.json`
Expected: `tất định`; `16` (16 ca: hai ca hợp lệ, các ca sai chữ ký, sai khóa, sai tiền tố, ký bằng tiền tố của manifest model, phong bì của manifest model, base64 có đệm, bit thừa của chữ ký, khóa lạ ở phong bì, sai format, sai version, `kid` viết hoa, BOM, phần thân không phải UTF-8).

- [ ] **Step 2: Crate `speaker-ops`**

Tạo `crates/speaker-ops/Cargo.toml` (workspace tự nhận `crates/*`):

```toml
[package]
name = "speaker-ops"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

# Vận hành của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §7): phong bì ký của công thức đọc tên, chống quay
# lui, gom tình trạng bộ đọc thành báo cáo `speaker_health`, chấm kiểm tra tự động. Phần thuần: không mạng, không Tauri; app
# (`src-tauri`) và công cụ kiểm tra tự động (`speaker-canary`) dùng chung. `speaker-worker` KHÔNG dùng crate này (worker không có
# mã mạng và không cần chữ ký).
[dependencies]
# Cùng bản `Cargo.lock` và app đang dùng cho manifest model; bản mới nhất ổn định trên crates.io (`cargo search`, 2026-10-27).
base64 = "0.23.1"
ed25519-dalek = { version = "3.0.0", default-features = false }
serde.workspace = true
serde_json.workspace = true
speaker-protocol = { path = "../speaker-protocol" }
speaker-recipe = { path = "../speaker-recipe" }
thiserror.workspace = true

[features]
# Hàm ký cho test của app (`src-tauri`) và bộ vector; không bao giờ bật trong bản phát hành.
testing = []

[dev-dependencies]
tempfile = "3.27.0"
```

Tạo `crates/speaker-ops/src/lib.rs` (bước này chỉ có một module; Task 2 và 7 thêm các dòng còn lại):

```rust
//! Vận hành của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §7). Chỉ phần thuần, không mạng:
//!
//! - [`envelope`]: phong bì ký của công thức đọc tên (`format` và tiền tố ký riêng, tách khỏi manifest model).

#![forbid(unsafe_code)]

pub mod envelope;
```

Tạo `crates/speaker-ops/src/envelope.rs`:

````rust
//! Phong bì ký của công thức đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.1): app chỉ đọc phần thân khi chữ ký Ed25519 đúng với
//! một khóa công khai build sẵn. Cùng cấu trúc với `models.json` (`src-tauri/src/models/signed.rs`) và cùng khóa ký trong CI, nhưng
//! `format` khác và **tiền tố ký riêng**: chữ ký của manifest model không dùng được cho công thức, và ngược lại.
//!
//! ```json
//! { "format": "ai-translator-speaker-recipes", "version": 1, "kid": "prod-2026-10-1", "body": "<b64url>", "sig": "<b64url>" }
//! ```
//!
//! - `body`: base64url không đệm của các byte JSON phần thân (công thức, `speaker_recipe::parse`). Ký trên chính chuỗi này nên không
//!   cần chuẩn hóa JSON.
//! - `sig`: chữ ký Ed25519 trên `CONTEXT || body` (chuỗi ASCII của `body`).
//! - Phong bì đọc chặt: khóa lạ, base64url có đệm hay không ở dạng chuẩn, BOM, phần thân không phải UTF-8, quá cỡ đều là
//!   `Malformed`. Thông báo lỗi không nhắc lại `kid` hay nội dung nhận được.
//! - Bộ vector `testdata/recipe-vectors.json` sinh bằng `scripts/speaker-recipes/gen-recipe-vectors.mjs` (Node, WebCrypto): Rust
//!   kiểm đúng như script ký.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use speaker_protocol::MAX_RECIPE_BYTES;

pub const FORMAT: &str = "ai-translator-speaker-recipes";
pub const VERSION: u32 = 1;
/// Tiền tố của thông điệp được ký.
pub const CONTEXT: &[u8] = b"ai-translator-speaker-recipes.v1.";
/// Phong bì lớn hơn chừng này thì không đọc: phần thân tối đa 256 KB (`MAX_RECIPE_BYTES`) nở 4/3 lần khi mã hóa base64url.
pub const MAX_ENVELOPE_BYTES: usize = 360 * 1024;

/// Khóa công khai tin cậy: `kid` và khóa Ed25519. App dựng từ khối `production` của `manifest-public-keys.json`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustedKey {
    pub kid: String,
    pub key: VerifyingKey,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum EnvelopeError {
    #[error("phong bì công thức sai định dạng: {0}")]
    Malformed(&'static str),
    #[error("công thức ký bằng khóa lạ")]
    UnknownKey,
    #[error("chữ ký công thức không đúng")]
    BadSignature,
}

/// Phong bì đã kiểm chữ ký: khóa đã ký và phần thân (chuỗi JSON, chưa qua `speaker_recipe::parse`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opened {
    pub kid: String,
    pub body: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u32,
    kid: String,
    body: String,
    sig: String,
}

fn kid_ok(kid: &str) -> bool {
    !kid.is_empty()
        && kid.len() <= 32
        && kid
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Thông điệp được ký của một phần thân đã mã hóa base64url.
pub fn message(body_b64: &str) -> Vec<u8> {
    [CONTEXT, body_b64.as_bytes()].concat()
}

/// Kiểm phong bì, rồi chữ ký. Phần thân trả về chưa được hiểu: người gọi chuyển cho `recipes::judge`.
pub fn open(bytes: &[u8], keys: &[TrustedKey]) -> Result<Opened, EnvelopeError> {
    if bytes.len() > MAX_ENVELOPE_BYTES {
        return Err(EnvelopeError::Malformed("quá lớn"));
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| EnvelopeError::Malformed("json"))?;
    if envelope.format != FORMAT {
        return Err(EnvelopeError::Malformed("format"));
    }
    if envelope.version != VERSION {
        return Err(EnvelopeError::Malformed("version"));
    }
    if !kid_ok(&envelope.kid) {
        return Err(EnvelopeError::Malformed("kid"));
    }
    let body = URL_SAFE_NO_PAD
        .decode(&envelope.body)
        .map_err(|_| EnvelopeError::Malformed("body"))?;
    let sig: [u8; 64] = URL_SAFE_NO_PAD
        .decode(&envelope.sig)
        .ok()
        .and_then(|s| s.try_into().ok())
        .ok_or(EnvelopeError::Malformed("sig"))?;
    let key = keys
        .iter()
        .find(|k| k.kid == envelope.kid)
        .ok_or(EnvelopeError::UnknownKey)?;
    key.key
        .verify_strict(&message(&envelope.body), &Signature::from_bytes(&sig))
        .map_err(|_| EnvelopeError::BadSignature)?;
    if body.len() > MAX_RECIPE_BYTES {
        return Err(EnvelopeError::Malformed("body quá lớn"));
    }
    let body = String::from_utf8(body).map_err(|_| EnvelopeError::Malformed("body không phải UTF-8"))?;
    Ok(Opened {
        kid: envelope.kid,
        body,
    })
}

/// Ký và khóa test của bộ vector (`test-r1`, `test-r2`). Chỉ cho test của crate này và của app (`features = ["testing"]`).
#[cfg(any(test, feature = "testing"))]
pub mod testing {
    use super::*;
    use ed25519_dalek::Signer;
    use serde_json::Value;

    /// Bộ vector dùng chung với script Node.
    pub const VECTORS: &str = include_str!("../testdata/recipe-vectors.json");

    /// Khóa công khai của hai khóa test.
    pub fn test_keys() -> Vec<TrustedKey> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        v["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|k| {
                let x: [u8; 32] = URL_SAFE_NO_PAD
                    .decode(k["x"].as_str().unwrap())
                    .unwrap()
                    .try_into()
                    .unwrap();
                TrustedKey {
                    kid: k["kid"].as_str().unwrap().to_string(),
                    key: VerifyingKey::from_bytes(&x).unwrap(),
                }
            })
            .collect()
    }

    /// Phong bì hợp lệ của `body`, ký bằng khóa test số `which` (0 là `test-r1`).
    pub fn sign(which: usize, body: &str) -> Vec<u8> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let key = &v["keys"][which];
        let seed: [u8; 32] = URL_SAFE_NO_PAD
            .decode(key["seed"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let signing = ed25519_dalek::SigningKey::from_bytes(&seed);
        let body_b64 = URL_SAFE_NO_PAD.encode(body.as_bytes());
        let sig = signing.sign(&message(&body_b64));
        serde_json::to_vec(&serde_json::json!({
            "format": FORMAT, "version": VERSION, "kid": key["kid"], "body": body_b64,
            "sig": URL_SAFE_NO_PAD.encode(sig.to_bytes())
        }))
        .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{VECTORS, sign, test_keys};
    use super::*;
    use serde_json::Value;

    fn kind(result: &Result<Opened, EnvelopeError>) -> &'static str {
        match result {
            Ok(_) => "ok",
            Err(EnvelopeError::Malformed(_)) => "malformed",
            Err(EnvelopeError::UnknownKey) => "unknown_key",
            Err(EnvelopeError::BadSignature) => "bad_signature",
        }
    }

    /// Bộ vector do Node sinh: Rust kiểm đúng như script ký (và từ chối chữ ký manifest model).
    #[test]
    fn vectors_verify_as_expected() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let keys = test_keys();
        assert_eq!(keys.len(), 2);
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 16);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let bytes = match &case["raw"] {
                Value::String(raw) => raw.as_bytes().to_vec(),
                _ => serde_json::to_vec(&case["envelope"]).unwrap(),
            };
            let result = open(&bytes, &keys);
            assert_eq!(kind(&result), case["expect"].as_str().unwrap(), "{name}: {result:?}");
        }
        let valid = cases.iter().find(|c| c["name"] == "valid").unwrap();
        let opened = open(&serde_json::to_vec(&valid["envelope"]).unwrap(), &keys).unwrap();
        assert_eq!(opened.kid, "test-r1");
        assert_eq!(serde_json::from_str::<Value>(&opened.body).unwrap(), v["body"]);
    }

    #[test]
    fn an_envelope_signed_in_rust_verifies_and_other_keys_do_not() {
        let bytes = sign(0, r#"{"schema":1}"#);
        assert_eq!(open(&bytes, &test_keys()).unwrap().body, r#"{"schema":1}"#);
        assert_eq!(kind(&open(&bytes, &test_keys()[1..])), "unknown_key");
        assert_eq!(kind(&open(&bytes, &[])), "unknown_key");
    }

    #[test]
    fn size_limits_are_enforced_before_and_after_decoding() {
        let mut big = sign(0, "{}");
        big.resize(MAX_ENVELOPE_BYTES + 1, b' ');
        assert_eq!(kind(&open(&big, &test_keys())), "malformed");
        // Chữ ký đúng nhưng phần thân vượt 256 KB: vẫn bị từ chối (phong bì còn trong 360 KB).
        let body = format!("{{\"pad\":\"{}\"}}", "a".repeat(MAX_RECIPE_BYTES));
        let bytes = sign(0, &body);
        assert!(bytes.len() <= MAX_ENVELOPE_BYTES);
        let result = open(&bytes, &test_keys());
        assert_eq!(result, Err(EnvelopeError::Malformed("body quá lớn")));
    }

    /// Lỗi không nhắc lại `kid` hay nội dung nhận được.
    #[test]
    fn errors_do_not_echo_the_input() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let unknown = v["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == "unknown_kid")
            .unwrap();
        let err = open(&serde_json::to_vec(&unknown["envelope"]).unwrap(), &test_keys()).unwrap_err();
        assert!(!err.to_string().contains("test-r9"), "{err}");
    }
}
````

- [ ] **Step 3: Chạy test**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-ops 2>&1 | grep -E "^test |^test result|^error"`
Expected: 4 test đạt (`vectors_verify_as_expected`, `an_envelope_signed_in_rust_verifies_and_other_keys_do_not`, `size_limits_are_enforced_before_and_after_decoding`, `errors_do_not_echo_the_input`); `test result: ok. 4 passed`. Lần đầu build `ed25519-dalek`, `curve25519-dalek` mất vài chục giây.

- [ ] **Step 4: Kiểm âm tính (một lần, rồi hoàn lại)**

Trong `crates/speaker-ops/src/envelope.rs` đổi `CONTEXT` thành `b"ai-translator-models.v1."` rồi chạy lại `cargo test -p speaker-ops`: `vectors_verify_as_expected` phải **đỏ** (hai ca "signed_with_models_context" và "valid" không còn đúng). Hoàn lại `CONTEXT` về `b"ai-translator-speaker-recipes.v1."`, test xanh lại. (Bước này chứng minh bộ vector thật sự giữ hai tiền tố tách nhau.)

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-ops && cargo fmt -p speaker-ops -- --check && cargo clippy -p speaker-ops --all-targets -- -D warnings 2>&1 | tail -2 && git status --short | wc -l`
Expected: không lỗi fmt; clippy `Finished`; số dòng `git status` tăng đúng 5 file mới (`Cargo.lock` đổi: thêm gói `speaker-ops`; `git diff --stat Cargo.lock` chỉ thêm dòng, không đổi phiên bản crate nào). Không commit.

---

### Task 2: `speaker-ops`, luật nhận công thức và lưu trên máy

Luật ở mục 3 của "Quyết định thiết kế". `RecipeStore` lưu phong bì nguyên văn, ghi nguyên tử, kiểm lại chữ ký mỗi lần nạp. Kèm cổng kiểm `check_recipes_body` (đánh dấu `#[ignore]`) mà `pnpm recipes:update` và CI chạy với `RECIPES_BODY`.

**Files:**
- Create: `crates/speaker-ops/src/recipes.rs`
- Modify: `crates/speaker-ops/src/lib.rs`

- [ ] **Step 1: Module `recipes`**

Tạo `crates/speaker-ops/src/recipes.rs`:

```rust
//! Nhận hay từ chối một công thức đọc tên tải về (spec 2026-10-26-phan-biet-nguoi-noi §7.1) và lưu nó trên máy.
//!
//! Luật nhận (`judge`), áp lên phần thân đã qua [`crate::envelope::open`]:
//! 1. `speaker_recipe::parse` đọc được (đúng schema, trong 256 KB). Mục sai hay app ngoài danh sách viết cứng thì bị bỏ riêng mục
//!    đó, như bản build sẵn; công thức không còn mục nào vẫn nhận được (cách tắt từ xa bộ đọc của một app là đăng công thức không có
//!    mục của app đó).
//! 2. `min_app_version` có mặt, đúng dạng `x.y.z` và không lớn hơn bản app này.
//! 3. `version` ≥ 1 và **không nhỏ hơn bản đang có** (chống quay lui: kẻ gian phát lại công thức cũ có chữ ký đúng). Cùng `version` mà
//!    khác nội dung là xung đột và bị từ chối; đúng bản đang có thì không đổi gì.
//!
//! "Bản đang có" là bản lớn hơn trong bản build sẵn và bản đã lưu ([`choose`]). Lỗi gì cũng giữ bản đang có.

use std::fs::File;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use crate::envelope::{self, EnvelopeError, MAX_ENVELOPE_BYTES, TrustedKey};

/// Một công thức đang dùng hay có thể dùng: số phiên bản định dạng (`version` của phần thân) và chính phần thân.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Active {
    pub version: u32,
    pub body: String,
}

impl Active {
    /// Bản build sẵn trong app (`speaker_recipe::BUILTIN_JSON`).
    pub fn builtin() -> Self {
        let body = speaker_recipe::BUILTIN_JSON.to_string();
        let version = speaker_recipe::parse(&body).map_or(0, |r| r.version);
        Self { version, body }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Accept {
    /// Mới hơn bản đang có: nhận.
    Newer,
    /// Đúng bản đang có: không đổi gì.
    Same,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum Reject {
    #[error("công thức cũ hơn bản đang có ({got} < {have})")]
    Rollback { have: u32, got: u32 },
    #[error("công thức cùng số {0} nhưng khác nội dung")]
    Conflict(u32),
    #[error("công thức cần app bản mới hơn")]
    NeedsNewerApp,
    #[error("công thức không dùng được: {0}")]
    Invalid(&'static str),
}

/// `x.y.z` (bỏ hậu tố `-…`, `+…`) thành bộ ba số; `None` nếu sai dạng. Cùng cách đọc của `models::manifest::version`.
pub fn version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let v = (next()?, next()?, next()?);
    parts.next().is_none().then_some(v)
}

/// Có nhận `body` thay cho `current` không (luật ở đầu module). `app_version`: bản app đang chạy.
pub fn judge(current: &Active, body: &str, app_version: &str) -> Result<Accept, Reject> {
    let recipes = speaker_recipe::parse(body).map_err(|_| Reject::Invalid("parse"))?;
    let min = version(&recipes.min_app_version).ok_or(Reject::Invalid("min_app_version"))?;
    let app = version(app_version).ok_or(Reject::Invalid("app_version"))?;
    if min > app {
        return Err(Reject::NeedsNewerApp);
    }
    let got = recipes.version;
    if got == 0 {
        return Err(Reject::Invalid("version"));
    }
    match got.cmp(&current.version) {
        std::cmp::Ordering::Greater => Ok(Accept::Newer),
        std::cmp::Ordering::Less => Err(Reject::Rollback {
            have: current.version,
            got,
        }),
        std::cmp::Ordering::Equal if same_json(body, &current.body) => Ok(Accept::Same),
        std::cmp::Ordering::Equal => Err(Reject::Conflict(got)),
    }
}

/// Hai chuỗi JSON cùng nội dung (khác cách xuống dòng và khoảng trắng): bản build sẵn là file viết tay, bản tải về là JSON gọn.
fn same_json(a: &str, b: &str) -> bool {
    match (
        serde_json::from_str::<serde_json::Value>(a),
        serde_json::from_str::<serde_json::Value>(b),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Bản đang có: bản đã lưu nếu `version` lớn hơn bản build sẵn, không thì bản build sẵn.
pub fn choose(builtin: Active, stored: Option<Active>) -> Active {
    match stored {
        Some(s) if s.version > builtin.version => s,
        _ => builtin,
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConsiderError {
    #[error(transparent)]
    Envelope(#[from] EnvelopeError),
    #[error(transparent)]
    Reject(#[from] Reject),
    #[error("không lưu được công thức: {0}")]
    Io(#[from] io::Error),
}

/// Công thức đã tải trên máy: file phong bì nguyên văn (`speaker-recipes.json` trong thư mục dữ liệu của app). Đọc lại và kiểm lại
/// chữ ký mỗi lần nạp, nên file bị sửa trên đĩa thì bị bỏ.
pub struct RecipeStore {
    path: PathBuf,
}

impl RecipeStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn read(&self) -> Option<Vec<u8>> {
        let mut raw = Vec::new();
        File::open(&self.path)
            .ok()?
            .take(MAX_ENVELOPE_BYTES as u64 + 1)
            .read_to_end(&mut raw)
            .ok()?;
        Some(raw)
    }

    /// Công thức đã lưu, nếu còn hợp lệ so với `builtin` (chữ ký đúng, mới hơn bản build sẵn, hợp với app này).
    pub fn load(&self, keys: &[TrustedKey], app_version: &str, builtin: &Active) -> Option<Active> {
        let opened = envelope::open(&self.read()?, keys).ok()?;
        match judge(builtin, &opened.body, app_version) {
            Ok(Accept::Newer) => speaker_recipe::parse(&opened.body).ok().map(|r| Active {
                version: r.version,
                body: opened.body,
            }),
            _ => None,
        }
    }

    /// Xét một phong bì vừa tải về. `Ok(Some(_))`: bản mới hơn `current`, đã lưu (ghi nguyên tử); `Ok(None)`: đúng bản đang có.
    pub fn consider(
        &self,
        raw: &[u8],
        keys: &[TrustedKey],
        app_version: &str,
        current: &Active,
    ) -> Result<Option<Active>, ConsiderError> {
        let opened = envelope::open(raw, keys)?;
        match judge(current, &opened.body, app_version)? {
            Accept::Same => Ok(None),
            Accept::Newer => {
                self.save(raw)?;
                let version = speaker_recipe::parse(&opened.body).map_or(0, |r| r.version);
                Ok(Some(Active {
                    version,
                    body: opened.body,
                }))
            }
        }
    }

    fn save(&self, raw: &[u8]) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        {
            let mut file = File::create(&tmp)?;
            file.write_all(raw)?;
            file.sync_all()?;
        }
        std::fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::testing::{sign, test_keys};

    const APP: &str = "0.3.2";

    /// Công thức tối thiểu hợp lệ có số phiên bản `v` và `min_app_version` cho trước.
    fn body(v: u32, min: &str) -> String {
        format!(
            r#"{{"schema":1,"version":{v},"min_app_version":"{min}","apps":[{{"app":"teams","os":"macos","window_title":["^M"],"tile":{{"role":"AXMenuItem","label":"^(?P<name>.+)$"}},"name_from":"label","speaking":[{{"kind":"presence","anchor":{{"scope":"child","class_token":"x"}}}}],"delay_ms":900}}]}}"#
        )
    }

    fn active(v: u32) -> Active {
        Active {
            version: v,
            body: body(v, "0.3.2"),
        }
    }

    #[test]
    fn the_builtin_recipe_is_active_version_one_or_more() {
        let b = Active::builtin();
        assert!(b.version >= 1, "{}", b.version);
        assert_eq!(speaker_recipe::parse(&b.body).unwrap().version, b.version);
    }

    #[test]
    fn a_newer_version_is_accepted_the_same_one_is_not_a_change() {
        assert_eq!(judge(&active(3), &body(4, "0.3.2"), APP), Ok(Accept::Newer));
        assert_eq!(judge(&active(3), &body(3, "0.3.2"), APP), Ok(Accept::Same));
    }

    /// Bản build sẵn là file viết tay (xuống dòng, thụt lề), bản tải về là JSON gọn: cùng nội dung thì vẫn là đúng bản đang có, không
    /// phải xung đột (không thì mỗi lần tải lại ghi một cảnh báo vô nghĩa).
    #[test]
    fn the_same_content_in_another_layout_is_the_same_recipe() {
        let value: serde_json::Value = serde_json::from_str(&body(3, "0.3.2")).unwrap();
        let pretty = serde_json::to_string_pretty(&value).unwrap();
        assert_ne!(pretty, body(3, "0.3.2"));
        let current = Active {
            version: 3,
            body: pretty,
        };
        assert_eq!(judge(&current, &body(3, "0.3.2"), APP), Ok(Accept::Same));
    }

    /// Chống quay lui: kể cả khi chữ ký đúng, số cũ hơn bị từ chối; cùng số khác nội dung là xung đột.
    #[test]
    fn older_versions_and_conflicts_are_refused() {
        assert_eq!(
            judge(&active(3), &body(2, "0.3.2"), APP),
            Err(Reject::Rollback { have: 3, got: 2 })
        );
        let other = body(3, "0.3.2").replace("^M", "^N");
        assert_eq!(judge(&active(3), &other, APP), Err(Reject::Conflict(3)));
        assert_eq!(
            judge(&active(3), &body(0, "0.3.2"), APP),
            Err(Reject::Invalid("version"))
        );
    }

    #[test]
    fn min_app_version_must_be_present_well_formed_and_not_above_the_app() {
        assert_eq!(judge(&active(1), &body(2, "0.4.0"), APP), Err(Reject::NeedsNewerApp));
        assert_eq!(
            judge(&active(1), &body(2, "0.3.2"), "0.3.1"),
            Err(Reject::NeedsNewerApp)
        );
        assert_eq!(judge(&active(1), &body(2, "0.3.2"), "0.3.2-beta.1"), Ok(Accept::Newer));
        assert_eq!(
            judge(&active(1), &body(2, "bậy"), APP),
            Err(Reject::Invalid("min_app_version"))
        );
        let none = body(2, "0.3.2").replace(r#""min_app_version":"0.3.2","#, "");
        assert_eq!(judge(&active(1), &none, APP), Err(Reject::Invalid("min_app_version")));
        assert_eq!(
            judge(&active(1), &body(2, "0.3.2"), "x"),
            Err(Reject::Invalid("app_version"))
        );
    }

    #[test]
    fn a_body_that_does_not_parse_is_invalid() {
        assert_eq!(judge(&active(1), "{", APP), Err(Reject::Invalid("parse")));
        let schema = body(2, "0.3.2").replace("\"schema\":1", "\"schema\":9");
        assert_eq!(judge(&active(1), &schema, APP), Err(Reject::Invalid("parse")));
        let big = " ".repeat(speaker_protocol::MAX_RECIPE_BYTES + 1);
        assert_eq!(judge(&active(1), &big, APP), Err(Reject::Invalid("parse")));
    }

    /// Công thức không còn mục nào (hay mục của app ngoài danh sách bị bỏ) vẫn nhận được: đó là cách tắt từ xa một bộ đọc.
    #[test]
    fn a_recipe_with_no_usable_app_is_still_accepted_as_a_kill_switch() {
        let none = r#"{"schema":1,"version":2,"min_app_version":"0.3.2","apps":[]}"#;
        assert_eq!(judge(&active(1), none, APP), Ok(Accept::Newer));
        let webex = body(2, "0.3.2").replace("\"teams\"", "\"webex\"");
        assert_eq!(judge(&active(1), &webex, APP), Ok(Accept::Newer));
        assert!(speaker_recipe::parse(&webex).unwrap().apps.is_empty());
    }

    #[test]
    fn the_greater_of_builtin_and_stored_wins() {
        assert_eq!(choose(active(3), None), active(3));
        assert_eq!(choose(active(3), Some(active(5))), active(5));
        assert_eq!(choose(active(3), Some(active(3))), active(3));
        assert_eq!(
            choose(active(3), Some(active(2))),
            active(3),
            "app mới có bản build sẵn mới hơn bản đã lưu"
        );
    }

    #[test]
    fn a_considered_envelope_is_saved_and_reloaded() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("speaker-recipes.json"));
        let keys = test_keys();
        let builtin = active(1);
        assert_eq!(store.load(&keys, APP, &builtin), None, "chưa có file");
        let raw = sign(0, &body(2, "0.3.2"));
        let got = store.consider(&raw, &keys, APP, &builtin).unwrap().unwrap();
        assert_eq!(got.version, 2);
        assert_eq!(store.load(&keys, APP, &builtin), Some(got.clone()));
        // Lần tải lại đúng bản đang có: không đổi, không lỗi.
        assert!(store.consider(&raw, &keys, APP, &got).unwrap().is_none());
        // App mới có bản build sẵn mới hơn: bản đã lưu không còn dùng.
        assert_eq!(store.load(&keys, APP, &active(2)), None);
        assert_eq!(store.load(&keys, APP, &active(3)), None);
    }

    #[test]
    fn a_refused_envelope_leaves_the_stored_one_alone() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("sub").join("speaker-recipes.json"));
        let keys = test_keys();
        let two = sign(0, &body(2, "0.3.2"));
        let current = store.consider(&two, &keys, APP, &active(1)).unwrap().unwrap();
        let one = sign(0, &body(1, "0.3.2"));
        let err = store.consider(&one, &keys, APP, &current).unwrap_err();
        assert!(
            matches!(err, ConsiderError::Reject(Reject::Rollback { have: 2, got: 1 })),
            "{err}"
        );
        assert!(matches!(
            store.consider(b"khong phai json", &keys, APP, &current),
            Err(ConsiderError::Envelope(EnvelopeError::Malformed(_)))
        ));
        assert!(matches!(
            store.consider(&two, &[], APP, &current),
            Err(ConsiderError::Envelope(EnvelopeError::UnknownKey))
        ));
        assert_eq!(
            store.load(&keys, APP, &active(1)),
            Some(current),
            "bản đã lưu vẫn như cũ"
        );
    }

    /// File đã lưu bị sửa trên đĩa (một byte của phần thân) thì không dùng.
    #[test]
    fn a_tampered_stored_file_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("speaker-recipes.json"));
        let keys = test_keys();
        store
            .consider(&sign(0, &body(2, "0.3.2")), &keys, APP, &active(1))
            .unwrap();
        let mut text = std::fs::read_to_string(store.path()).unwrap();
        let at = text.find("\"body\":\"").unwrap() + 8;
        let flipped = if &text[at..=at] == "A" { "B" } else { "A" };
        text.replace_range(at..=at, flipped);
        std::fs::write(store.path(), text).unwrap();
        assert_eq!(store.load(&keys, APP, &active(1)), None);
    }
    /// Cổng kiểm của `pnpm recipes:update` và job `check` của `sign-recipes.yml` (không có khóa ký): `RECIPES_BODY` là phần thân mới,
    /// `RECIPES_PREVIOUS` là phần thân đang phát hành (bỏ trống ở lần đăng đầu tiên). Phần thân phải được app nhận (`judge` ra `Newer`
    /// với bản app rất mới) và mọi mục phải hợp lệ (không mục nào bị bỏ).
    #[test]
    #[ignore = "chạy bằng: RECIPES_BODY=<file> cargo test -p speaker-ops check_recipes_body -- --ignored"]
    fn check_recipes_body() {
        let read = |var: &str| {
            std::env::var(var)
                .ok()
                .filter(|p| !p.is_empty())
                .map(|p| std::fs::read_to_string(p).unwrap())
        };
        let body = read("RECIPES_BODY").expect("thiếu RECIPES_BODY");
        let current = match read("RECIPES_PREVIOUS") {
            Some(previous) => Active {
                version: speaker_recipe::parse(&previous).unwrap().version,
                body: previous,
            },
            None => Active {
                version: 0,
                body: String::new(),
            },
        };
        assert_eq!(
            judge(&current, &body, "9999.0.0"),
            Ok(Accept::Newer),
            "phần thân phải có `version` lớn hơn bản đang phát hành"
        );
        let recipes = speaker_recipe::parse(&body).unwrap();
        assert!(recipes.dropped.is_empty(), "mục bị bỏ: {:?}", recipes.dropped);
    }
}
```

Trong `crates/speaker-ops/src/lib.rs` thêm hai dòng (thay phần đầu file cho khớp):

```rust
//! Vận hành của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §7). Chỉ phần thuần, không mạng:
//!
//! - [`envelope`]: phong bì ký của công thức đọc tên (`format` và tiền tố ký riêng, tách khỏi manifest model);
//! - [`recipes`]: nhận hay từ chối một công thức tải về (chống quay lui, `min_app_version`), lưu trên máy.

#![forbid(unsafe_code)]

pub mod envelope;
pub mod recipes;
```

- [ ] **Step 2: Chạy test và cổng kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p speaker-ops 2>&1 | grep -E "^test result|FAILED|panicked" ; R=$W/scripts/speaker-recipes/recipes.json; RECIPES_BODY=$R cargo test -p speaker-ops check_recipes_body -- --ignored 2>&1 | grep -E "^test |test result"; RECIPES_BODY=$R RECIPES_PREVIOUS=$R cargo test -p speaker-ops check_recipes_body -- --ignored 2>&1 | grep -E "left:|right:|test result"`
Expected: `15 passed; 0 failed; 1 ignored` (4 của `envelope`, 11 của `recipes`); cổng kiểm với một mình `RECIPES_BODY` (lần đầu, không có bản trước): `test recipes::tests::check_recipes_body ... ok`; với `RECIPES_PREVIOUS` cùng file: **đỏ** có `left: Ok(Same)` và `right: Ok(Newer)` (cổng chặn đăng lại cùng số phiên bản; đây là kết quả mong đợi, không phải lỗi).

- [ ] **Step 3: Kiểm âm tính**

Trong `judge` đổi `std::cmp::Ordering::Less => Err(Reject::Rollback { … })` thành `Ok(Accept::Newer)` rồi chạy `cargo test -p speaker-ops older_versions`: **đỏ**. Hoàn lại.

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-ops -- --check && cargo clippy -p speaker-ops --all-targets -- -D warnings 2>&1 | tail -2`
Expected: không lỗi. Không commit.

---

### Task 3: App tải công thức từ xa

`src-tauri/src/speaker/recipes.rs`: `RecipeService` nạp công thức đã lưu, chọn bản đang có (lớn hơn trong build sẵn và đã lưu), `check()` tải một lần (GET, giới hạn kích thước, `speaker_ops::recipes::RecipeStore::consider`), luồng nền tải lúc mở và mỗi 6 giờ **chỉ khi tính năng bật cho người dùng**. `names_setup` đưa `recipes::body(app)` vào `Load`. Test dùng `FakeServer` của `models::test_http` (cổng ngẫu nhiên trên 127.0.0.1) và khóa test của bộ vector (`speaker-ops` với feature `testing`, chỉ ở `[dev-dependencies]`).

**Files:**
- Create: `src-tauri/src/speaker/recipes.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/speaker/mod.rs`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Phụ thuộc, khai báo module, nối vào `Load` và khởi động**

**Sửa `src-tauri/Cargo.toml`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```toml
# Công thức đọc tên build sẵn (kế hoạch 04 của phân biệt người nói): gửi cho worker qua `Load.names`.
speaker-recipe = { path = "../crates/speaker-recipe" }
```

Đoạn thêm vào:

```toml
# Vận hành của phân biệt người nói (kế hoạch 06): phong bì ký của công thức tải từ xa, chống quay lui, báo cáo tình trạng bộ đọc tên.
speaker-ops = { path = "../crates/speaker-ops" }
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```toml
[dev-dependencies]
```

Đoạn thêm vào:

```toml
# Hàm ký và khóa test của bộ vector công thức (`features = ["testing"]` chỉ có khi chạy test, không vào bản phát hành).
speaker-ops = { path = "../crates/speaker-ops", features = ["testing"] }
```

**Sửa `src-tauri/src/speaker/mod.rs`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
#[cfg(target_os = "macos")]
pub mod eui_macos;
```

Đoạn thêm vào:

```rust
pub mod recipes;
```

Thay đoạn:

```rust
/// Phần tên của `Load` (kế hoạch 04): công tắc "Lấy tên", công thức build sẵn (kế hoạch 06 thay bằng bản đã kiểm chữ ký), file dấu.
fn names_setup<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> NamesSetup {
    NamesSetup {
        enabled: settings.speaker_names,
        recipe_json: speaker_recipe::BUILTIN_JSON.to_string(),
```

bằng:

```rust
/// Phần tên của `Load` (kế hoạch 04, 06): công tắc "Lấy tên", công thức đang có (bản build sẵn hay bản tải về đã kiểm chữ ký, xem
/// [`recipes`]), file dấu.
fn names_setup<R: Runtime>(app: &AppHandle<R>, settings: &Settings) -> NamesSetup {
    NamesSetup {
        enabled: settings.speaker_names,
        recipe_json: recipes::body(app),
```

**Sửa `src-tauri/src/lib.rs`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
    diagnostics::install(&handle)?;
```

Đoạn thêm vào:

```rust
    // Công thức đọc tên tải từ xa có ký số (kế hoạch 06 của phân biệt người nói, spec §7.1).
    speaker::recipes::install(&handle)?;
```


- [ ] **Step 2: Module `recipes`**

Tạo `src-tauri/src/speaker/recipes.rs`:

```rust
//! Công thức đọc tên tải từ xa có ký số (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06). Bản mới đăng ở [`RECIPES_URL`] mà không cần
//! phát hành app; chỉ là **dữ liệu** (mô tả, không mã), nên khóa ký có bị lộ cũng không thêm được app hay mở đường gửi dữ liệu đi.
//!
//! - App tải lúc mở (sau [`FIRST_CHECK_DELAY`]) rồi mỗi [`CHECK_EVERY`], **chỉ khi** tính năng đang bật cho người dùng này ([`wanted`]:
//!   công tắc nội bộ, "Phân biệt người nói" và "Lấy tên"). Một lệnh GET không kèm mã máy hay thông tin gì của người dùng.
//! - Kiểm bằng `speaker_ops`: phong bì ký riêng (`envelope`), rồi luật nhận (`recipes::judge`: đọc được, `min_app_version`, không nhận số
//!   cũ hơn bản đang có). Lỗi gì cũng giữ bản đang có. Bản nhận được lưu nguyên văn trên máy và kiểm lại chữ ký mỗi lần nạp.
//! - Bản đang có là bản lớn hơn trong bản build sẵn và bản đã lưu. [`body`] đưa phần thân đó vào `Load.names.recipe_json` ở đầu mỗi phiên;
//!   worker kiểm lại cấu trúc. Công thức mới áp dụng từ **phiên dịch sau** (worker của phiên đang chạy giữ bản cũ).
//! - Log chỉ có số phiên bản và loại kết quả; không có nội dung công thức, URL hay khóa.

use std::io::Read;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use reqwest::Url;
use reqwest::blocking::Client;
use speaker_ops::envelope::{MAX_ENVELOPE_BYTES, TrustedKey};
use speaker_ops::recipes::{Active, RecipeStore, choose};
use tauri::{AppHandle, Manager, Runtime};

use crate::models::{download, signed};
use crate::settings::Settings;
use crate::state::AppState;

/// URL công thức đang phát hành: cùng bucket và tên miền với `models.json` (spec 2026-10-23-ten-mien-aitranslator-vn). Trùng `RECIPES_URL`
/// của `scripts/speaker-recipes/update-lib.mjs` (có test).
pub const RECIPES_URL: &str = "https://releases.aitranslator.vn/speaker/recipes.json";
/// File công thức đã tải, trong thư mục dữ liệu của app.
pub const FILE_NAME: &str = "speaker-recipes.json";
/// Kiểm lại mỗi chừng này (spec §7.1: "lúc mở và mỗi 6 giờ").
pub const CHECK_EVERY: Duration = Duration::from_secs(6 * 3600);
/// Lần kiểm đầu sau khi mở app: để không tranh việc khởi động.
pub const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);

/// Kết quả một lần kiểm; không mang nội dung công thức.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Outcome {
    /// Nhận bản mới (số phiên bản).
    Updated(u32),
    /// Đúng bản đang có.
    Unchanged,
    /// Bản tải về bị từ chối (chữ ký, quay lui, cần app mới hơn…); giữ bản đang có.
    Refused(String),
    /// Không tải được (mạng, HTTP, chưa có nguồn).
    Failed(String),
}

pub struct RecipeService {
    store: RecipeStore,
    keys: Vec<TrustedKey>,
    app_version: String,
    url: Option<Url>,
    client: OnceLock<Option<Client>>,
    active: Mutex<Active>,
}

/// Khóa công khai của manifest model, dùng cho công thức (cùng khóa ký trong CI, tiền tố ký riêng).
pub fn trusted_keys() -> Vec<TrustedKey> {
    signed::trusted_keys()
        .into_iter()
        .map(|k| TrustedKey { kid: k.kid, key: k.key })
        .collect()
}

/// URL của mọi bản build: production, chỉ `https`.
pub fn production_url() -> Option<Url> {
    Url::parse(RECIPES_URL).ok().filter(|u| u.scheme() == "https")
}

/// Có tải công thức không: công tắc nội bộ (`enabled`) bật và người dùng bật cả "Phân biệt người nói" lẫn "Lấy tên". Không bật thì không
/// có lệnh gọi mạng nào.
pub fn wanted(enabled: bool, settings: &Settings) -> bool {
    enabled && settings.speaker_diarization && settings.speaker_names
}

fn fetch(client: &Client, url: &Url) -> Result<Vec<u8>, String> {
    let response = client
        .get(url.clone())
        .send()
        .map_err(|e| format!("mạng: {}", e.without_url()))?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status().as_u16()));
    }
    let mut raw = Vec::new();
    response
        .take(MAX_ENVELOPE_BYTES as u64 + 1)
        .read_to_end(&mut raw)
        .map_err(|e| format!("mạng: {e}"))?;
    Ok(raw)
}

impl RecipeService {
    /// Nạp công thức đã lưu (nếu còn hợp lệ so với bản build sẵn) và chọn bản đang có.
    pub fn new(path: PathBuf, keys: Vec<TrustedKey>, app_version: String, url: Option<Url>) -> Self {
        let builtin = Active::builtin();
        let store = RecipeStore::new(path);
        let active = choose(builtin.clone(), store.load(&keys, &app_version, &builtin));
        Self {
            store,
            keys,
            app_version,
            url,
            client: OnceLock::new(),
            active: Mutex::new(active),
        }
    }

    pub fn active(&self) -> Active {
        self.active.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Phần thân công thức đang có (chuỗi JSON), cho `Load.names.recipe_json`.
    pub fn body(&self) -> String {
        self.active().body
    }

    fn client(&self) -> Option<&Client> {
        self.client
            .get_or_init(|| {
                download::client()
                    .map_err(|e| log::error!("không tạo được client HTTP cho công thức đọc tên: {e}"))
                    .ok()
            })
            .as_ref()
    }

    /// Tải và xét một lần. Chặn trong lúc gọi mạng: gọi từ luồng nền.
    pub fn check(&self) -> Outcome {
        let (Some(url), Some(client)) = (self.url.as_ref(), self.client()) else {
            return Outcome::Failed("chưa có nguồn".into());
        };
        let raw = match fetch(client, url) {
            Ok(raw) => raw,
            Err(e) => return Outcome::Failed(e),
        };
        let current = self.active();
        match self.store.consider(&raw, &self.keys, &self.app_version, &current) {
            Ok(Some(new)) => {
                let version = new.version;
                *self.active.lock().unwrap_or_else(|e| e.into_inner()) = new;
                Outcome::Updated(version)
            }
            Ok(None) => Outcome::Unchanged,
            Err(e) => Outcome::Refused(e.to_string()),
        }
    }
}

/// Phần thân công thức cho `Load` của phiên này: bản đang có của dịch vụ, hay bản build sẵn khi chưa có dịch vụ (test, công cụ).
pub fn body<R: Runtime>(app: &AppHandle<R>) -> String {
    app.try_state::<Arc<RecipeService>>()
        .map_or_else(|| speaker_recipe::BUILTIN_JSON.to_string(), |s| s.body())
}

/// Cài dịch vụ lúc khởi động (`setup`, sau `AppState`): nạp bản đã lưu và chạy luồng kiểm nền. Luồng nền chỉ gọi mạng khi [`wanted`].
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let path = app.path().app_local_data_dir()?.join(FILE_NAME);
    let service = Arc::new(RecipeService::new(
        path,
        trusted_keys(),
        app.package_info().version.to_string(),
        production_url(),
    ));
    log::info!("công thức đọc tên: dùng số {}", service.active().version);
    app.manage(Arc::clone(&service));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            let on = app
                .try_state::<AppState>()
                .is_some_and(|s| wanted(super::enabled(), &s.settings()));
            if on {
                match service.check() {
                    Outcome::Updated(v) => log::info!("công thức đọc tên: nhận số {v}, áp dụng từ phiên dịch sau"),
                    Outcome::Unchanged => log::info!("công thức đọc tên: không có bản mới"),
                    Outcome::Refused(why) => log::warn!("công thức đọc tên: từ chối bản tải về ({why})"),
                    Outcome::Failed(why) => log::info!("công thức đọc tên: chưa tải được ({why})"),
                }
            }
            std::thread::sleep(CHECK_EVERY);
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    use crate::models::test_http::{FakeServer, Fault};
    use crate::settings::UiLanguage;
    use speaker_ops::envelope::testing::{sign, test_keys};

    const APP: &str = "0.3.2";
    const PATH: &str = "speaker/recipes.json";

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-recipes-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Bản build sẵn với `version` và `min_app_version` đổi.
    fn body_with(version: u32, min: &str) -> String {
        let mut v: serde_json::Value = serde_json::from_str(speaker_recipe::BUILTIN_JSON).unwrap();
        v["version"] = version.into();
        v["min_app_version"] = min.into();
        v.to_string()
    }

    fn service(dir: &Path, server: &FakeServer) -> RecipeService {
        RecipeService::new(dir.join(FILE_NAME), test_keys(), APP.into(), Some(server.url(PATH)))
    }

    #[test]
    fn the_url_matches_the_production_https_url() {
        assert_eq!(production_url().unwrap().as_str(), RECIPES_URL);
        assert!(RECIPES_URL.starts_with("https://releases.aitranslator.vn/"));
    }

    #[test]
    fn it_starts_with_the_builtin_recipe_and_uses_the_real_keys_in_the_app() {
        let server = FakeServer::start();
        let s = service(&temp("start"), &server);
        assert_eq!(s.active(), Active::builtin());
        assert_eq!(s.body(), speaker_recipe::BUILTIN_JSON);
        assert!(server.requests().is_empty(), "tạo dịch vụ không gọi mạng");
        assert!(trusted_keys().iter().all(|k| !k.kid.starts_with("test-")));
    }

    #[test]
    fn a_newer_signed_recipe_is_taken_saved_and_survives_a_restart() {
        let dir = temp("newer");
        let server = FakeServer::start();
        let next = body_with(Active::builtin().version + 1, "0.3.2");
        server.put(PATH, &sign(0, &next));
        let s = service(&dir, &server);
        assert_eq!(s.check(), Outcome::Updated(Active::builtin().version + 1));
        assert_eq!(s.body(), next);
        assert_eq!(s.check(), Outcome::Unchanged, "lần sau đúng bản đang có");
        // App chạy lại: nạp từ file đã lưu, kiểm lại chữ ký.
        assert_eq!(service(&dir, &server).body(), next);
        assert_eq!(server.requests().len(), 2);
        assert!(server.requests()[0].user_agent.is_some());
    }

    #[test]
    fn an_older_one_a_bad_signature_and_a_recipe_for_a_newer_app_are_refused_and_the_current_one_kept() {
        let dir = temp("refused");
        let server = FakeServer::start();
        let s = service(&dir, &server);
        let v = Active::builtin().version;
        server.put(PATH, &sign(0, &body_with(v + 5, "0.3.2")));
        assert_eq!(s.check(), Outcome::Updated(v + 5));
        let kept = s.body();
        // Quay lui: chữ ký đúng nhưng số cũ hơn.
        server.put(PATH, &sign(0, &body_with(v + 1, "0.3.2")));
        assert!(
            matches!(s.check(), Outcome::Refused(w) if w.contains("cũ hơn")),
            "quay lui"
        );
        // Khóa lạ: ký bằng khóa không có trong danh sách của app.
        let keys_for_second_only = RecipeService::new(
            dir.join("other.json"),
            test_keys()[1..].to_vec(),
            APP.into(),
            Some(server.url(PATH)),
        );
        server.put(PATH, &sign(0, &body_with(v + 9, "0.3.2")));
        assert!(matches!(keys_for_second_only.check(), Outcome::Refused(_)));
        // Cần app mới hơn.
        server.put(PATH, &sign(0, &body_with(v + 9, "9.9.9")));
        assert!(matches!(s.check(), Outcome::Refused(w) if w.contains("app bản mới hơn")));
        // Không phải phong bì.
        server.put(PATH, b"{\"hello\":1}");
        assert!(matches!(s.check(), Outcome::Refused(_)));
        assert_eq!(s.body(), kept);
        assert_eq!(
            service(&dir, &server).body(),
            kept,
            "file đã lưu không bị đè bởi bản bị từ chối"
        );
    }

    #[test]
    fn network_and_http_errors_keep_the_current_recipe() {
        let server = FakeServer::start();
        let s = service(&temp("net"), &server);
        assert!(
            matches!(s.check(), Outcome::Failed(w) if w.contains("HTTP 404")),
            "chưa đăng gì"
        );
        server.put(PATH, &sign(0, &body_with(Active::builtin().version + 1, "0.3.2")));
        server.fault(Fault::Status(503));
        assert!(matches!(s.check(), Outcome::Failed(w) if w.contains("HTTP 503")));
        server.fault(Fault::DropAfter(10));
        assert!(matches!(s.check(), Outcome::Failed(_)));
        assert_eq!(s.active(), Active::builtin());
        let no_url = RecipeService::new(temp("nourl").join(FILE_NAME), test_keys(), APP.into(), None);
        assert_eq!(no_url.check(), Outcome::Failed("chưa có nguồn".into()));
    }

    #[test]
    fn a_response_larger_than_the_limit_is_refused() {
        let server = FakeServer::start();
        server.put(PATH, &vec![b' '; MAX_ENVELOPE_BYTES + 5_000]);
        let s = service(&temp("big"), &server);
        assert!(matches!(s.check(), Outcome::Refused(w) if w.contains("quá lớn")));
    }

    /// `Load.names.recipe_json` của phiên lấy đúng bản đang có: bản build sẵn khi chưa có dịch vụ, bản tải về sau khi nhận.
    #[test]
    fn the_recipe_given_to_a_session_is_the_one_in_force() {
        let app = crate::test_support::mock_app();
        assert_eq!(
            body(app.handle()),
            speaker_recipe::BUILTIN_JSON,
            "chưa có dịch vụ: bản build sẵn"
        );
        let server = FakeServer::start();
        let next = body_with(Active::builtin().version + 1, "0.3.2");
        server.put(PATH, &sign(0, &next));
        let s = Arc::new(service(&temp("session"), &server));
        app.manage(Arc::clone(&s));
        assert_eq!(body(app.handle()), speaker_recipe::BUILTIN_JSON);
        s.check();
        assert_eq!(body(app.handle()), next, "phiên sau nhận công thức mới");
    }

    /// Chỉ tải khi tính năng đang bật cho người dùng này (không có lệnh gọi mạng nào khi người dùng tắt).
    #[test]
    fn it_is_wanted_only_when_the_switch_and_both_settings_are_on() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert!(s.speaker_diarization && s.speaker_names);
        assert!(wanted(true, &s));
        assert!(!wanted(false, &s), "bản phát hành chưa bật tính năng");
        s.speaker_names = false;
        assert!(!wanted(true, &s));
        s.speaker_names = true;
        s.speaker_diarization = false;
        assert!(!wanted(true, &s));
    }
}
```

- [ ] **Step 3: Chạy test** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo test -p meeting-translator --lib -- speaker:: 2>&1 | grep -E "^test result|FAILED|panicked|^error"`
Expected: toàn bộ test `speaker::` đạt (số cũ của `speaker::` cộng 8 test mới của `speaker::recipes`); không có test cũ nào đỏ, đặc biệt `the_session_launch_carries_the_builtin_recipe_and_the_names_switch` (khi chưa có dịch vụ, `Load` vẫn mang bản build sẵn).

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator -- --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -2 && git diff --stat Cargo.lock | tail -1`
Expected: không lỗi fmt và clippy `Finished`; `Cargo.lock` chỉ thêm một dòng `"speaker-ops",` vào phụ thuộc của `meeting-translator`. Không commit.

---

### Task 4: Ký và đăng công thức: `pnpm recipes:update`, CI

Luồng ở mục 5 của "Quyết định thiết kế". Mọi thứ ngoài (lệnh, mạng, câu hỏi, đường dẫn, khóa) đến qua `ctx = { io, paths, ask, keys }` như `scripts/models/update-flow.mjs`, nên test chạy bằng đồ giả (CI "ký" bằng khóa test). Không có secret mới: `sign-recipes.yml` dùng `MANIFEST_SIGNING_KEY` của environment `release` có sẵn.

**Files:**
- Create: `scripts/speaker-recipes/{sign-recipes,update-lib,update-flow,update}.mjs`, `scripts/speaker-recipes/update.test.mjs`
- Create: `scripts/release/sign-recipes-ci.mjs`, `scripts/release/sign-recipes-ci.test.mjs`, `.github/workflows/sign-recipes.yml`
- Modify: `.github/workflows/ci.yml`, `package.json`, `.gitignore`, `scripts/release/workflow.test.mjs`

- [ ] **Step 1: Script ký**

Tạo `scripts/speaker-recipes/sign-recipes.mjs`:

```javascript
#!/usr/bin/env node
// Ký phần thân công thức đọc tên thành recipes.json (kế hoạch 06; spec 2026-10-26-phan-biet-nguoi-noi §7.1). Chạy trong CI
// (sign-recipes.yml, environment `release`) với khóa lấy từ secret MANIFEST_SIGNING_KEY (cùng khóa ký manifest model; tiền tố ký
// riêng nên chữ ký này không dùng được cho manifest model).
// - --key: file JWK khóa riêng (gen-manifest-key.mjs), phải nằm ngoài repo và chỉ chủ file đọc được.
// - kid của khóa phải có trong khối production của manifest-public-keys.json, đúng khóa công khai: app mới nhận công thức này.
// - Ký xong thì tự kiểm lại bằng khóa build sẵn rồi mới ghi --out.
//
//   node scripts/speaker-recipes/sign-recipes.mjs --key /đường/dẫn/khóa.jwk --body recipes.json --out target/recipes/recipes.json
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { builtInKeys, importPrivateJwk, insideRepo, KEYS_FILE, signRecipes, verifyRecipes } from "./lib.mjs";

const fail = (message) => {
  console.error(message);
  process.exit(2);
};
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const keyPath = opt("--key");
const bodyPath = opt("--body");
const outPath = opt("--out");
const keysFile = opt("--keys") ?? KEYS_FILE;
if (!keyPath || !bodyPath || !outPath) fail("Tham số: --key <JWK> --body <phần thân> --out <recipes.json> [--keys <file>]");
if (insideRepo(keyPath)) fail("Khóa riêng không được nằm trong repo.");
if (process.platform !== "win32" && (statSync(keyPath).mode & 0o077) !== 0) fail(`${keyPath} phải chỉ chủ file đọc được (chmod 600).`);
const jwk = JSON.parse(readFileSync(keyPath, "utf8"));
const trusted = builtInKeys(keysFile);
const known = trusted.find((k) => k.kid === jwk.kid);
if (!known) fail(`kid ${jwk.kid} không có trong khối production của ${keysFile}: app sẽ không nhận công thức này.`);
if (known.x !== jwk.x) fail(`Khóa công khai của ${jwk.kid} trong ${keysFile} không khớp khóa riêng.`);
const parsed = JSON.parse(readFileSync(bodyPath, "utf8"));
if (parsed.schema !== 1 || !Number.isSafeInteger(parsed.version) || parsed.version < 1) fail("Phần thân không đúng schema 1 hay thiếu `version` ≥ 1.");
const body = JSON.stringify(parsed);
const envelope = await signRecipes(await importPrivateJwk(jwk), jwk.kid, body);
if ((await verifyRecipes(envelope, trusted)) !== body) fail("Bản đã ký không trả lại đúng phần thân.");
writeFileSync(outPath, `${JSON.stringify(envelope)}\n`);
console.error(`Đã ký ${outPath}: kid ${jwk.kid}, version ${parsed.version}.`);
```

- [ ] **Step 2: Logic thuần và luồng của `recipes:update`**

Tạo `scripts/speaker-recipes/update-lib.mjs`:

```javascript
// Logic của `pnpm recipes:update` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06): đọc tham số, kiểm phần thân, so với bản đang phát
// hành, dựng bảng in ra, quyết định những đường dẫn mà một lượt đăng được phép đụng trong repo. Không gọi mạng, không chạy lệnh
// ngoài (phần đó ở update-flow.mjs).
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** URL công thức đang phát hành; trùng `RECIPES_URL` của `src-tauri/src/speaker/recipes.rs` (có test). */
export const RECIPES_URL = "https://releases.aitranslator.vn/speaker/recipes.json";
/** Khóa trong bucket R2 (cùng bucket với models.json, `BUCKET` của scripts/models/update-lib.mjs). */
export const R2_KEY = "speaker/recipes.json";
/** Nguồn: cũng là bản build sẵn nhúng vào app (`speaker_recipe::BUILTIN_JSON`). */
export const SOURCE = "scripts/speaker-recipes/recipes.json";
/** Lưu phần thân đã phát hành (`body-<version>.json`), để quay lại và để so ở lượt sau. */
export const RELEASED_DIR = "scripts/speaker-recipes/released";
export const FIXTURES_DIR = "scripts/speaker-recipes/fixtures";

export const USAGE = `Dùng:
  pnpm recipes:update                  kiểm scripts/speaker-recipes/recipes.json (đã sửa, tăng "version"), chạy bộ test, hỏi y/N rồi đăng
  pnpm recipes:update --check          chỉ kiểm và in khác biệt so với bản đang phát hành, không đăng
  pnpm recipes:update --revert-to <V>  đăng lại nội dung của phiên bản V (số mới = số đang phát hành + 1)`;

export function parseArgs(argv) {
  if (argv.length === 0) return { mode: "update" };
  const [flag, value, ...rest] = argv;
  if (flag === "--check" && value === undefined) return { mode: "check" };
  if (flag === "--revert-to" && value && rest.length === 0) {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--revert-to cần số phiên bản nguyên dương, không phải ${value}.`);
    return { mode: "revert", version: Number(value) };
  }
  throw new Error(`Tham số không hợp lệ: ${argv.join(" ")}\n${USAGE}`);
}

/** Đọc và kiểm hình dạng một phần thân; ném lỗi nếu không phải công thức schema 1 có `version` nguyên dương. */
export function bodyInfo(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    throw new Error(`Công thức không phải JSON: ${e.message}`);
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("Công thức phải là một đối tượng JSON.");
  if (body.schema !== 1) throw new Error(`Công thức có schema ${body.schema}, app đọc schema 1.`);
  if (!Number.isSafeInteger(body.version) || body.version < 1) throw new Error('Công thức thiếu "version" nguyên dương.');
  if (typeof body.min_app_version !== "string" || !/^\d+\.\d+\.\d+$/.test(body.min_app_version)) {
    throw new Error('Công thức thiếu "min_app_version" dạng x.y.z.');
  }
  if (!Array.isArray(body.apps)) throw new Error('Công thức thiếu mảng "apps".');
  return { body, version: body.version, minAppVersion: body.min_app_version, apps: body.apps.map((a) => `${a.app}/${a.os}`) };
}

/** Phần thân gọn đúng như `sign-recipes.mjs` ký (`JSON.stringify` của bản đã đọc). */
export const canonical = (text) => JSON.stringify(JSON.parse(text));

/** Phần thân đã phát hành có số lớn nhất trong `dir` (`body-<n>.json`); `null` nếu chưa có. */
export function latestReleased(dir) {
  const numbers = readdirSync(dir)
    .map((name) => /^body-([1-9]\d*)\.json$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  if (numbers.length === 0) return null;
  const version = Math.max(...numbers);
  return { version, path: join(dir, `body-${version}.json`) };
}

/** Các dòng mô tả khác biệt giữa hai phần thân (đã đọc): phiên bản, bản app tối thiểu, mục thêm, bỏ, đổi. */
export function describeDiff(prev, next) {
  const lines = [];
  const key = (a) => `${a.app}/${a.os}`;
  const prevApps = new Map((prev?.apps ?? []).map((a) => [key(a), JSON.stringify(a)]));
  const nextApps = new Map(next.apps.map((a) => [key(a), JSON.stringify(a)]));
  lines.push(`version: ${prev ? prev.version : "(chưa có bản nào)"} → ${next.version}`);
  if (prev && prev.min_app_version !== next.min_app_version) lines.push(`min_app_version: ${prev.min_app_version} → ${next.min_app_version}`);
  for (const k of [...nextApps.keys()].filter((k) => !prevApps.has(k))) lines.push(`+ thêm ${k}`);
  for (const k of [...prevApps.keys()].filter((k) => !nextApps.has(k))) lines.push(`- bỏ ${k}${nextApps.size === 0 ? " (công thức không còn mục nào: bộ đọc tắt từ xa)" : ""}`);
  for (const [k, v] of nextApps) if (prevApps.has(k) && prevApps.get(k) !== v) lines.push(`~ đổi ${k}`);
  if (lines.length === 1 && prev && prev.version === next.version) lines.push("(không có gì khác)");
  return lines;
}

/** Phần thân để quay lại `target`: nội dung cũ, `version` mới (= đang phát hành + 1, vì app không nhận số cũ hơn). */
export function revertBody(targetText, liveVersion) {
  const body = JSON.parse(targetText);
  body.version = liveVersion + 1;
  return `${JSON.stringify(body, null, 2)}\n`;
}

/** Các đường dẫn mà lượt đăng phiên bản `version` được phép đụng trong repo: nguồn, bản lưu của nó, và file mới của bộ fixture. */
export const allowedPath = (version) => (path) =>
  path === SOURCE || path === `${RELEASED_DIR}/body-${version}.json` || path.startsWith(`${FIXTURES_DIR}/`);

/** Đường dẫn trong đầu ra `git status --porcelain -z` không nằm trong `allowed`. */
export function strangers(porcelainZ, allowed) {
  return porcelainZ
    .split("\0")
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((path) => !allowed(path));
}

export const commitMessage = (version) => `feat(speaker): công thức đọc tên số ${version}`;
```

Tạo `scripts/speaker-recipes/update-flow.mjs`:

```javascript
// Luồng của `pnpm recipes:update` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06): kiểm công thức, chạy bộ test cây giao diện ghi sẵn, hỏi
// rồi đăng (đẩy main, ký trong CI, đăng lên R2, kiểm lại qua URL công khai), quay lại bản trước. Mọi thứ bên ngoài (lệnh, mạng, câu hỏi,
// đường dẫn, khóa) đến qua `ctx = { io, paths, ask, keys }`, nên test chạy được bằng đồ giả; cùng kiểu với scripts/models/update-flow.mjs.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isYes, BUCKET } from "../models/update-lib.mjs";
import { GH_REPO, ghEnv, textWithHint } from "../models/update-publish.mjs";
import {
  R2_KEY,
  RECIPES_URL,
  RELEASED_DIR,
  SOURCE,
  allowedPath,
  bodyInfo,
  canonical,
  commitMessage,
  describeDiff,
  latestReleased,
  revertBody,
  strangers,
} from "./update-lib.mjs";
import { verifyRecipes } from "./lib.mjs";

const fresh = (url) => `${url}?t=${Date.now()}`;
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const git = (io, args) => io.run("git", args).trim();

/** Phần thân đang phát hành (đọc từ URL công khai, kiểm chữ ký bằng `keys`); `null` nếu chưa đăng lần nào (404). */
export async function liveBody(io, keys) {
  let text;
  try {
    text = textWithHint(io, fresh(RECIPES_URL));
  } catch (e) {
    if (e.status === 22) return null; // curl -f: HTTP 4xx (chưa có file)
    throw e;
  }
  const envelope = JSON.parse(text);
  const body = await verifyRecipes(envelope, keys);
  return { text: body, envelope };
}

/** Điều kiện trước khi đăng: nhánh, cây làm việc (chỉ file của lượt này), công cụ. Trả commit `HEAD` lúc kiểm. */
function preflight({ io }, version) {
  const branch = git(io, ["branch", "--show-current"]);
  if (branch !== "main") throw new Error(`Phải chạy ở nhánh main (đang ở ${branch || "HEAD rời"}).`);
  const others = strangers(io.run("git", ["status", "--porcelain", "-z", "--untracked-files=all"]), allowedPath(version));
  if (others.length) throw new Error(`Cây làm việc có file ngoài công thức (${others.slice(0, 5).join(", ")}): commit hay cất chúng trước.`);
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const head = git(io, ["rev-parse", "HEAD"]);
  if (head !== git(io, ["rev-parse", "origin/main"])) throw new Error("main ở máy khác origin/main: pull hay push trước.");
  ghEnv(io);
  io.run("pnpm", ["--dir", "server", "exec", "wrangler", "whoami", "--json"]);
  io.run("curl", ["--version"]);
  io.run("cargo", ["--version"]);
  return head;
}

/** Cổng kiểm: luật của app (`check_recipes_body`) rồi bộ test cây giao diện ghi sẵn của worker. */
function gate({ io, paths }, bodyPath, previousPath) {
  const env = { RECIPES_BODY: join(paths.repo, bodyPath), ...(previousPath ? { RECIPES_PREVIOUS: join(paths.repo, previousPath) } : {}) };
  io.run("cargo", ["test", "--locked", "-p", "speaker-ops", "--lib", "check_recipes_body", "--", "--ignored", "--nocapture"], { inherit: true, env });
  io.run("cargo", ["test", "--locked", "-p", "speaker-worker", "--lib"], { inherit: true });
}

/** Kích sign-recipes.yml, đợi, tải recipes.json đã ký về; trả đường dẫn. Mã lượt chạy nhận ra bằng `headSha` đúng `origin/main`. */
function signInCi(io, { bodyRel, previousRel, work }) {
  const env = ghEnv(io);
  const gh = (args, opts = {}) => io.run("gh", [...args, "--repo", GH_REPO], { env, ...opts });
  const listRuns = (fields) => JSON.parse(gh(["run", "list", "--workflow", "sign-recipes.yml", "--limit", "20", "--json", fields]));
  io.run("git", ["fetch", "--quiet", "origin", "main"]);
  const origin = git(io, ["rev-parse", "origin/main"]);
  const known = new Set(listRuns("databaseId").map((r) => r.databaseId));
  const inputs = ["-f", `body=${bodyRel}`, ...(previousRel ? ["-f", `previous=${previousRel}`] : ["-f", "first_release=true"])];
  gh(["workflow", "run", "sign-recipes.yml", "--ref", "main", ...inputs]);
  let run;
  for (let i = 0; i < 24 && !run; i++) {
    io.sleep(5000);
    run = listRuns("databaseId,headSha").find((r) => !known.has(r.databaseId) && r.headSha === origin)?.databaseId;
  }
  if (!run) throw new Error("Không tìm thấy lượt chạy sign-recipes.yml vừa kích: xem tab Actions.");
  console.log(`Đợi CI ký công thức (lượt ${run})…`);
  gh(["run", "watch", String(run), "--exit-status", "--interval", "15"], { inherit: true });
  const dir = join(work, "signed", String(run));
  rmSync(dir, { recursive: true, force: true });
  gh(["run", "download", String(run), "-n", "speaker-recipes", "-D", dir]);
  return join(dir, "recipes.json");
}

/** Đăng recipes.json đã ký lên R2 (sao lưu bản đang chạy trước), rồi kiểm lại qua URL công khai. */
function publish(io, signedPath, { work, previousVersion }) {
  const signed = readFileSync(signedPath, "utf8");
  const live = (() => {
    try {
      return textWithHint(io, fresh(RECIPES_URL));
    } catch (e) {
      if (e.status === 22) return null;
      throw e;
    }
  })();
  if (live === signed) return "recipes.json này đã được đăng từ trước";
  if (live !== null) {
    const liveVersion = JSON.parse(Buffer.from(JSON.parse(live).body, "base64url").toString("utf8")).version;
    if (liveVersion !== previousVersion) throw new Error(`Bản đang phát hành là số ${liveVersion}, không phải số ${previousVersion}: không đăng.`);
    const backup = join(work, "backup", `recipes-v${liveVersion}.json`);
    mkdirSync(dirname(backup), { recursive: true });
    writeFileSync(backup, live);
  }
  const put = ["--dir", "server", "exec", "wrangler", "r2", "object", "put", `${BUCKET}/${R2_KEY}`, "--file", signedPath, "--content-type", "application/json", "--cache-control", "no-cache", "--remote"];
  io.run("pnpm", put, { inherit: true });
  if (textWithHint(io, fresh(RECIPES_URL)) !== signed) throw new Error(`Đã đăng nhưng ${RECIPES_URL} chưa trả đúng bản đã ký. Đăng lại: pnpm ${put.join(" ")}`);
  return live === null ? "đã đăng recipes.json (lần đầu)" : `đã đăng recipes.json (bản cũ lưu ở ${join(work, "backup")})`;
}

/** Kiểm nguồn và in khác biệt; trả thông tin cho bước đăng. */
async function prepare(ctx, { revertTo } = {}) {
  const { io, paths, keys } = ctx;
  const live = await liveBody(io, keys);
  const liveInfo = live ? bodyInfo(live.text) : null;
  const released = existsSync(paths.released) ? latestReleased(paths.released) : null;
  let sourceText = readFileSync(join(paths.repo, SOURCE), "utf8");
  if (revertTo !== undefined) {
    const target = join(paths.released, `body-${revertTo}.json`);
    if (!existsSync(target)) throw new Error(`Không có ${RELEASED_DIR}/body-${revertTo}.json.`);
    if (!liveInfo) throw new Error("Chưa có công thức nào đang phát hành: không có gì để quay lại.");
    if (revertTo >= liveInfo.version) throw new Error(`--revert-to ${revertTo}: bản đang phát hành là số ${liveInfo.version}, phải chọn số nhỏ hơn.`);
    sourceText = revertBody(readFileSync(target, "utf8"), liveInfo.version);
  }
  const info = bodyInfo(sourceText);
  if (liveInfo && info.version <= liveInfo.version) {
    throw new Error(`"version" là ${info.version} nhưng bản đang phát hành là số ${liveInfo.version}: tăng "version" (app không nhận số cũ hơn).`);
  }
  if (liveInfo && released && released.version !== liveInfo.version) {
    throw new Error(`${RELEASED_DIR} có bản mới nhất là số ${released.version} nhưng đang phát hành số ${liveInfo.version}: kiểm lại (lượt đăng dở?).`);
  }
  console.log(`Công thức đang phát hành: ${liveInfo ? `số ${liveInfo.version}` : "chưa có"}.\n`);
  console.log(describeDiff(live ? JSON.parse(live.text) : null, info.body).join("\n"));
  return { live, liveInfo, info, sourceText, released };
}

/** Chạy một chế độ của lệnh (`args` từ `parseArgs`); trả mã thoát (0 hay 1), lỗi thì ném. */
export async function run(args, ctx) {
  const { io, paths } = ctx;
  if (args.mode === "check") {
    const p = await prepare(ctx);
    gate(ctx, SOURCE, p.liveInfo ? `${RELEASED_DIR}/body-${p.liveInfo.version}.json` : null);
    return 0;
  }
  // `prepare` trước `preflight`: phải biết số phiên bản mới thì mới biết file nào của repo được phép đổi (`allowedPath`).
  const p = await prepare(ctx, { revertTo: args.mode === "revert" ? args.version : undefined });
  const version = p.info.version;
  const preflightHead = preflight(ctx, version);
  const bodyRel = SOURCE;
  const previousRel = p.liveInfo ? `${RELEASED_DIR}/body-${p.liveInfo.version}.json` : null;
  if (args.mode === "revert") writeFileSync(join(paths.repo, SOURCE), p.sourceText);
  gate(ctx, bodyRel, previousRel);
  const question = args.mode === "revert" ? `Đăng lại nội dung số ${args.version} thành công thức số ${version}? [y/N] ` : `Đăng công thức số ${version} cho người dùng? [y/N] `;
  console.log("\nGõ y: commit và đẩy main, ký công thức trong CI, đăng recipes.json lên R2. App của người dùng nhận trong vòng 6 giờ, áp dụng từ phiên dịch sau.");
  if (!isYes(await ctx.ask(question))) {
    if (args.mode === "revert") io.run("git", ["checkout", "--", SOURCE]);
    console.log("Không đăng.");
    return 0;
  }
  if (git(io, ["rev-parse", "HEAD"]) !== preflightHead) throw new Error("main đã đổi trong lúc kiểm: chạy lại từ đầu.");
  const releasedRel = `${RELEASED_DIR}/body-${version}.json`;
  mkdirSync(join(paths.repo, RELEASED_DIR), { recursive: true });
  writeFileSync(join(paths.repo, releasedRel), `${canonical(p.sourceText)}\n`);
  const add = [SOURCE, releasedRel];
  io.run("git", ["add", "--", ...add, "scripts/speaker-recipes/fixtures"]);
  // Chạy lại sau khi đã commit (lượt trước dừng giữa chừng): không còn gì để commit thì bỏ qua, đẩy vẫn là lệnh an toàn.
  if (io.run("git", ["diff", "--cached", "--name-only"]).trim()) {
    io.run("git", ["commit", "-m", commitMessage(version), "--", ...add, "scripts/speaker-recipes/fixtures"]);
  }
  io.run("git", ["push", "origin", "HEAD:main"], { inherit: true });
  const signed = signInCi(io, { bodyRel, previousRel, work: paths.work });
  const envelope = readJson(signed);
  if ((await verifyRecipes(envelope, ctx.keys)) !== canonical(p.sourceText)) throw new Error("Bản đã ký không khớp công thức trong repo: KHÔNG đăng, cần người xem.");
  console.log(publish(io, signed, { work: paths.work, previousVersion: p.liveInfo?.version ?? null }));
  console.log(`\nXong: công thức số ${version} đã đăng.`);
  return 0;
}
```

Tạo `scripts/speaker-recipes/update.mjs`:

```javascript
#!/usr/bin/env node
// `pnpm recipes:update`: kiểm công thức đọc tên đã sửa, chạy bộ test cây giao diện ghi sẵn, hỏi rồi đăng lên hệ thống; quay lại bản trước bằng
// `--revert-to` (spec 2026-10-26-phan-biet-nguoi-noi §7.1; runbook docs/release/phat-hanh.md mục 15). File này chỉ đọc tham số và nối các thứ
// thật vào luồng ở update-flow.mjs.
import { resolve } from "node:path";
import { ask, createIo } from "../models/update-io.mjs";
import { builtInKeys, REPO } from "./lib.mjs";
import { run } from "./update-flow.mjs";
import { parseArgs } from "./update-lib.mjs";

const paths = {
  repo: REPO,
  released: resolve(REPO, "scripts/speaker-recipes/released"),
  work: resolve(REPO, ".recipes-update"),
};

run(parseArgs(process.argv.slice(2)), { io: createIo(), paths, ask, keys: builtInKeys() }).then(
  (code) => process.exit(code),
  (e) => {
    console.error(`Lỗi: ${e.message}`);
    process.exit(2);
  },
);
```

- [ ] **Step 3: Bước ký trong CI và workflow**

Tạo `scripts/release/sign-recipes-ci.mjs`:

```javascript
#!/usr/bin/env node
// Bước ký công thức đọc tên của sign-recipes.yml (kế hoạch 06; spec 2026-10-26-phan-biet-nguoi-noi §7.1). Chạy ở job có secret, sau job
// `check` (không secret) đã kiểm phần thân bằng đúng luật của app (`check_recipes_body` của crate speaker-ops).
//
//   MANIFEST_SIGNING_KEY=<JWK> BODY=<đường dẫn trong repo> node scripts/release/sign-recipes-ci.mjs
//   BODY=<…> [PREVIOUS=<…>] [FIRST_RELEASE=true] node scripts/release/sign-recipes-ci.mjs --check   # job `check`: chỉ kiểm đầu vào
//
// `PREVIOUS` (phần thân của bản đang phát hành) bắt buộc trừ khi người chạy khai đây là lần đăng công thức đầu tiên (`FIRST_RELEASE`):
// thiếu nó thì `check_recipes_body` không so số phiên bản với bản đó (chống quay lui ở phía đăng, như sign-manifest-ci.mjs).
//
// Ghi khóa riêng ra file tạm quyền 0600 ngoài repo (sign-recipes.mjs đòi vậy), chạy sign-recipes.mjs với môi trường không còn biến khóa,
// rồi xóa file khóa dù thành công hay lỗi. Ra: target/recipes/recipes.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { bodyErrors } from "./sign-manifest-ci.mjs";
import { root as repoRoot } from "./versions.mjs";

/** Lỗi của các đầu vào của job `check`: BODY như `bodyErrors`; PREVIOUS bắt buộc trừ khi `first`; khai `first` mà vẫn đưa PREVIOUS là mâu thuẫn. */
export function inputErrors(root, body, previous, first = false) {
  const errors = bodyErrors(root, body);
  if (first && previous) errors.push("FIRST_RELEASE và PREVIOUS không đi cùng nhau: lần đầu thì không có bản trước");
  else if (previous) errors.push(...bodyErrors(root, previous, "PREVIOUS"));
  else if (!first) errors.push("PREVIOUS trống: phải so với phần thân của bản đang phát hành; lần đăng công thức đầu tiên thì tick first_release");
  return errors;
}

export function main(env = process.env, root = repoRoot) {
  const key = env.MANIFEST_SIGNING_KEY;
  if (!key) throw new Error("environment release chưa có secret MANIFEST_SIGNING_KEY");
  const script = join(root, "scripts/speaker-recipes/sign-recipes.mjs");
  if (!existsSync(script)) throw new Error("chưa có scripts/speaker-recipes/sign-recipes.mjs");
  const errors = bodyErrors(root, env.BODY);
  if (errors.length > 0) throw new Error(errors.join("; "));
  const dir = env.RUNNER_TEMP ?? tmpdir();
  const keyFile = join(dir, `recipes-signing-key-${process.pid}.jwk`);
  const childEnv = { ...env };
  delete childEnv.MANIFEST_SIGNING_KEY;
  try {
    writeFileSync(keyFile, key, { mode: 0o600 });
    mkdirSync(join(root, "target", "recipes"), { recursive: true });
    const out = join(root, "target", "recipes", "recipes.json");
    const r = spawnSync(process.execPath, [script, "--key", keyFile, "--body", join(root, env.BODY), "--out", out], {
      cwd: root,
      env: childEnv,
      stdio: "inherit",
    });
    if (r.status !== 0) throw new Error(`sign-recipes.mjs thoát mã ${r.status}`);
    return out;
  } finally {
    rmSync(keyFile, { force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    if (process.argv.includes("--check")) {
      const errors = inputErrors(repoRoot, process.env.BODY, process.env.PREVIOUS, process.env.FIRST_RELEASE === "true");
      if (errors.length > 0) throw new Error(errors.join("; "));
      console.log("BODY, PREVIOUS hợp lệ");
    } else console.log(`đã ký ${main()}`);
  } catch (error) {
    console.error(`LỖI: ${error.message}`);
    process.exitCode = 1;
  }
}
```

Tạo `.github/workflows/sign-recipes.yml` (các action ghim SHA giống hệt `sign-manifest.yml`):

```yaml
# Ký công thức đọc tên người nói production trong CI (spec 2026-10-26-phan-biet-nguoi-noi §7.1; kế hoạch 06). Cùng khóa ký với manifest model
# (secret MANIFEST_SIGNING_KEY của environment `release`; JWK Ed25519 có `kid` thuộc khối `production` của
# src-tauri/keys/manifest-public-keys.json), nhưng phong bì có `format` và tiền tố ký riêng (crates/speaker-ops/src/envelope.rs).
# Người vận hành chạy `pnpm recipes:update` (nó đẩy phần thân lên main rồi kích workflow này, tải recipes.json đã ký và đăng lên R2);
# cũng chạy tay được với đường dẫn phần thân (JSON chưa ký, commit trong repo).
#
# Hai job như sign-manifest.yml: `check` (không secret) kiểm phần thân bằng đúng luật của app (`check_recipes_body`) và chạy bộ test cây
# giao diện ghi sẵn; `sign` (environment `release`) chạy trên runner mới, không biên dịch gì, chỉ ký.
name: Sign speaker recipes

on:
  workflow_dispatch:
    inputs:
      body:
        description: Đường dẫn tương đối trong repo tới phần thân công thức mới (JSON chưa ký)
        required: true
        type: string
      previous:
        description: Đường dẫn tương đối trong repo tới phần thân của bản đang phát hành (bỏ trống chỉ khi tick first_release)
        required: false
        type: string
      first_release:
        description: Tick khi đây là lần đăng công thức đầu tiên (chưa có bản nào đã phát hành để so, nên bỏ trống previous)
        required: false
        type: boolean
        default: false

permissions:
  contents: read

jobs:
  check:
    name: Kiểm phần thân bằng luật của app (không secret)
    runs-on: macos-26
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Rust theo rust-toolchain.toml
        run: rustup toolchain install
      - name: check_recipes_body và bộ test cây giao diện ghi sẵn
        env:
          BODY: ${{ inputs.body }}
          PREVIOUS: ${{ inputs.previous }}
          FIRST_RELEASE: ${{ inputs.first_release }}
        run: |
          node scripts/release/sign-recipes-ci.mjs --check
          export RECIPES_BODY="$PWD/$BODY"
          if [ -n "$PREVIOUS" ]; then export RECIPES_PREVIOUS="$PWD/$PREVIOUS"; fi
          cargo test --locked -p speaker-ops --lib check_recipes_body -- --ignored --nocapture
          cargo test --locked -p speaker-worker --lib

  sign:
    name: Ký công thức production (secret, không biên dịch)
    needs: check
    # Chỉ chạy script Node (không biên dịch, không cần macOS): máy Linux rẻ hơn và không bị tắc hàng như macOS arm64.
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    environment: release
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version
      - name: Ký phần thân bằng khóa production
        env:
          MANIFEST_SIGNING_KEY: ${{ secrets.MANIFEST_SIGNING_KEY }}
          BODY: ${{ inputs.body }}
        run: node scripts/release/sign-recipes-ci.mjs
      - uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
        with:
          name: speaker-recipes
          path: target/recipes/recipes.json
          if-no-files-found: error
```

- [ ] **Step 4: Test**

Tạo `scripts/speaker-recipes/update.test.mjs`:

```javascript
// Test `pnpm recipes:update` và script ký công thức (kế hoạch 06). Chạy: node --test scripts/speaker-recipes/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { REPO, signRecipes, testKey, verifyRecipes } from "./lib.mjs";
import { run } from "./update-flow.mjs";
import {
  RECIPES_URL,
  SOURCE,
  allowedPath,
  bodyInfo,
  canonical,
  describeDiff,
  latestReleased,
  parseArgs,
  revertBody,
  strangers,
} from "./update-lib.mjs";

const KEY = await testKey("test-r1", "ai-translator speaker recipes test key 1");
const KEYS = [{ kid: KEY.kid, x: KEY.x }];

const app = (name, os = "macos", extra = {}) => ({ app: name, os, window_title: ["^M"], tile: { role: "AXMenuItem" }, name_from: "label", speaking: [], delay_ms: 900, ...extra });
const body = (version, apps = [app("teams")], min = "0.3.2") => ({ schema: 1, version, min_app_version: min, apps });
const pretty = (b) => `${JSON.stringify(b, null, 2)}\n`;

/** Thư mục tạm của một test, xóa khi test xong. */
const temp = (t) => {
  const dir = mkdtempSync(join(tmpdir(), "mt-recipes-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("parseArgs", () => {
  assert.deepEqual(parseArgs([]), { mode: "update" });
  assert.deepEqual(parseArgs(["--check"]), { mode: "check" });
  assert.deepEqual(parseArgs(["--revert-to", "3"]), { mode: "revert", version: 3 });
  for (const bad of [["--revert-to"], ["--revert-to", "0"], ["--revert-to", "x"], ["--check", "1"], ["--sua"], ["--revert-to", "2", "3"]]) {
    assert.throws(() => parseArgs(bad), /không hợp lệ|cần số/, bad.join(" "));
  }
});

test("URL công khai trùng hằng của app", () => {
  const rust = readFileSync(resolve(REPO, "src-tauri/src/speaker/recipes.rs"), "utf8");
  assert.ok(rust.includes(`"${RECIPES_URL}"`), "RECIPES_URL của app khác của script");
});

test("bodyInfo kiểm hình dạng", () => {
  const info = bodyInfo(JSON.stringify(body(4, [app("teams"), app("zoom")])));
  assert.equal(info.version, 4);
  assert.deepEqual(info.apps, ["teams/macos", "zoom/macos"]);
  for (const [bad, re] of [
    ["{", /không phải JSON/],
    ["[]", /đối tượng/],
    [JSON.stringify({ ...body(1), schema: 2 }), /schema 2/],
    [JSON.stringify({ ...body(1), version: 0 }), /version/],
    [JSON.stringify({ ...body(1), version: 1.5 }), /version/],
    [JSON.stringify({ ...body(1), min_app_version: "0.3" }), /min_app_version/],
    [JSON.stringify({ ...body(1), apps: {} }), /apps/],
  ]) {
    assert.throws(() => bodyInfo(bad), re, bad);
  }
});

test("describeDiff nêu phiên bản, mục thêm, bỏ, đổi; công thức rỗng là tắt từ xa", () => {
  const prev = body(1, [app("teams"), app("zoom")]);
  const next = body(2, [app("teams", "macos", { delay_ms: 700 }), app("meet_chrome")], "0.3.3");
  assert.deepEqual(describeDiff(prev, next), [
    "version: 1 → 2",
    "min_app_version: 0.3.2 → 0.3.3",
    "+ thêm meet_chrome/macos",
    "- bỏ zoom/macos",
    "~ đổi teams/macos",
  ]);
  assert.deepEqual(describeDiff(null, body(1)), ["version: (chưa có bản nào) → 1", "+ thêm teams/macos"]);
  assert.match(describeDiff(body(1), body(2, [])).join("\n"), /bộ đọc tắt từ xa/);
});

test("revertBody giữ nội dung cũ, số mới là đang phát hành + 1", () => {
  const out = JSON.parse(revertBody(pretty(body(1, [app("zoom")])), 3));
  assert.equal(out.version, 4);
  assert.deepEqual(out.apps, [app("zoom")]);
});

test("strangers: chỉ file của lượt này được phép đổi", () => {
  const ok = allowedPath(5);
  const z = (...p) => p.map((x) => ` M ${x}\0`).join("");
  assert.deepEqual(strangers(z(SOURCE, "scripts/speaker-recipes/released/body-5.json", "scripts/speaker-recipes/fixtures/new.jsonl"), ok), []);
  assert.deepEqual(strangers(z(SOURCE, "src/main.rs", "scripts/speaker-recipes/released/body-4.json"), ok), ["src/main.rs", "scripts/speaker-recipes/released/body-4.json"]);
  assert.deepEqual(strangers("", ok), []);
});

test("latestReleased lấy số lớn nhất, bỏ file lạ; thư mục rỗng thì null", (t) => {
  const dir = temp(t);
  assert.equal(latestReleased(dir), null);
  for (const n of ["body-1.json", "body-10.json", "body-2.json", "readme.md", "body-x.json"]) writeFileSync(join(dir, n), "{}");
  assert.deepEqual(latestReleased(dir), { version: 10, path: join(dir, "body-10.json") });
});

test("bộ vector trong repo đúng như script sinh ra", () => {
  const fresh = execFileSync(process.execPath, [resolve(REPO, "scripts/speaker-recipes/gen-recipe-vectors.mjs")], { encoding: "utf8" });
  assert.equal(fresh, readFileSync(resolve(REPO, "crates/speaker-ops/testdata/recipe-vectors.json"), "utf8"));
});

test("ký rồi kiểm được; chữ ký của manifest model không dùng được cho công thức, và ngược lại", async () => {
  const { CONTEXT: MODELS_CONTEXT, verifyEnvelope } = await import("../models/lib.mjs");
  const json = JSON.stringify(body(2));
  const envelope = await signRecipes(KEY.privateKey, KEY.kid, json);
  assert.equal(await verifyRecipes(envelope, KEYS), json);
  await assert.rejects(verifyRecipes({ ...envelope, body: Buffer.from(JSON.stringify(body(3))).toString("base64url") }, KEYS), /Chữ ký không đúng/);
  await assert.rejects(verifyRecipes({ ...envelope, kid: "test-r2" }, KEYS), /Không có khóa công khai/);
  const asModels = await signRecipes(KEY.privateKey, KEY.kid, json, { context: MODELS_CONTEXT });
  await assert.rejects(verifyRecipes(asModels, KEYS), /Chữ ký không đúng/);
  await assert.rejects(verifyEnvelope(envelope, KEYS), /Chữ ký không đúng/);
});

test("sign-recipes.mjs từ chối khóa trong repo, kid lạ, phần thân sai schema", async (t) => {
  const dir = temp(t);
  const bodyPath = join(dir, "body.json");
  writeFileSync(bodyPath, JSON.stringify(body(2)));
  const keyPath = join(dir, "key.jwk");
  writeFileSync(keyPath, JSON.stringify({ kty: "OKP", crv: "Ed25519", kid: "test-r1", x: KEY.x, d: "AAAA" }), { mode: 0o600 });
  const sign = (...args) => spawnSync(process.execPath, [resolve(REPO, "scripts/speaker-recipes/sign-recipes.mjs"), ...args], { encoding: "utf8" });
  const unknown = sign("--key", keyPath, "--body", bodyPath, "--out", join(dir, "out.json"));
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /không có trong khối production/);
  const inRepo = sign("--key", resolve(REPO, "package.json"), "--body", bodyPath, "--out", join(dir, "out.json"));
  assert.equal(inRepo.status, 2);
  assert.match(inRepo.stderr, /không được nằm trong repo/);
  assert.equal(sign().status, 2);
});

/** Bàn làm việc giả cho luồng đăng: repo tạm, `io` ghi lại lệnh, CI "ký" bằng khóa test. */
function bench(t, { live = null, sourceVersion = 2, released = [], dirty = [], branch = "main", signWrong = false } = {}) {
  const repo = temp(t);
  const work = join(repo, ".recipes-update");
  const releasedDir = join(repo, "scripts/speaker-recipes/released");
  mkdirSync(releasedDir, { recursive: true });
  const source = body(sourceVersion, [app("teams"), app("zoom")]);
  writeFileSync(join(repo, SOURCE), pretty(source));
  for (const v of released) writeFileSync(join(releasedDir, `body-${v}.json`), pretty(body(v, [app("teams")])));
  const calls = [];
  const state = { live: live === null ? null : live, put: null, answers: [] };
  const sign = async (text) => `${JSON.stringify(await signRecipes(KEY.privateKey, KEY.kid, text))}\n`;
  const io = {
    calls,
    run(cmd, args, opts = {}) {
      calls.push({ cmd, args, env: opts.env });
      const line = `${cmd} ${args.join(" ")}`;
      if (line === "git branch --show-current") return `${branch}\n`;
      if (cmd === "git" && args[0] === "status") return dirty.map((p) => ` M ${p}\0`).join("");
      if (cmd === "git" && args[0] === "rev-parse") return "abc123\n";
      if (cmd === "git" && args[0] === "add") state.staged = true;
      if (cmd === "git" && args[0] === "diff") return state.staged ? "scripts/speaker-recipes/recipes.json\n" : "";
      if (cmd === "gh" && args[0] === "auth") return "token\n";
      if (cmd === "gh" && args[0] === "run" && args[1] === "list") return JSON.stringify(state.runs ?? []);
      if (cmd === "gh" && args[0] === "run" && args[1] === "download") {
        const dir = args[args.indexOf("-D") + 1];
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "recipes.json"), state.signed);
        return "";
      }
      if (cmd === "pnpm" && args.includes("put")) {
        state.put = args;
        state.live = readFileSync(args[args.indexOf("--file") + 1], "utf8");
        return "";
      }
      return "";
    },
    text(url) {
      assert.ok(url.startsWith(RECIPES_URL), url);
      if (state.live === null) throw Object.assign(new Error("404"), { status: 22 });
      return state.live;
    },
    sleep() {},
  };
  // Sau `gh workflow run`, lượt chạy mới xuất hiện với headSha đúng origin/main.
  const origRun = io.run;
  io.run = function (cmd, args, opts) {
    const out = origRun.call(this, cmd, args, opts);
    if (cmd === "gh" && args[0] === "workflow") state.runs = [{ databaseId: 77, headSha: "abc123" }];
    return out;
  };
  const ctx = {
    io,
    paths: { repo, released: releasedDir, work },
    keys: KEYS,
    ask: async () => state.answers.shift() ?? "y",
  };
  return { repo, ctx, calls, state, source, sign, signWrong };
}

const liveOf = async (version) => `${JSON.stringify(await signRecipes(KEY.privateKey, KEY.kid, JSON.stringify(body(version, [app("teams")]))))}\n`;
const cmds = (calls) => calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);

test("lần đăng đầu: commit, kích CI với first_release, ký, đăng lên R2, kiểm lại; bản lưu released/body-1.json", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(lines.some((l) => l.startsWith("git commit -m feat(speaker): công thức đọc tên số 1")), lines.join("\n"));
  assert.ok(lines.includes("git push origin HEAD:main"));
  const dispatch = lines.find((l) => l.startsWith("gh workflow run sign-recipes.yml"));
  assert.match(dispatch, /-f body=scripts\/speaker-recipes\/recipes\.json -f first_release=true/);
  assert.ok(!dispatch.includes("previous="));
  const put = b.state.put.join(" ");
  assert.match(put, /r2 object put ai-translator-releases\/speaker\/recipes\.json --file .* --content-type application\/json --cache-control no-cache --remote/);
  assert.equal(JSON.parse(readFileSync(join(b.repo, "scripts/speaker-recipes/released/body-1.json"), "utf8")).version, 1);
  // Cổng kiểm chạy trước khi đăng: luật của app rồi bộ test của worker.
  const gates = b.calls.filter((c) => c.cmd === "cargo" && c.args[0] === "test");
  assert.equal(gates.length, 2);
  assert.equal(gates[0].env.RECIPES_BODY, join(b.repo, SOURCE));
  assert.equal(gates[0].env.RECIPES_PREVIOUS, undefined);
  assert.ok(lines.findIndex((l) => l.startsWith("cargo test --locked -p speaker-worker")) < lines.indexOf("git push origin HEAD:main"));
});

test("đã có bản đang phát hành: truyền previous, sao lưu bản cũ, đăng bản mới", async (t) => {
  const b = bench(t, { live: await liveOf(1), sourceVersion: 2, released: [1] });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const dispatch = cmds(b.calls).find((l) => l.startsWith("gh workflow run"));
  assert.match(dispatch, /-f previous=scripts\/speaker-recipes\/released\/body-1\.json/);
  assert.ok(!dispatch.includes("first_release"));
  assert.ok(existsSync(join(b.repo, ".recipes-update/backup/recipes-v1.json")));
  const gate = b.calls.find((c) => c.cmd === "cargo" && c.args[0] === "test");
  assert.equal(gate.env.RECIPES_PREVIOUS, join(b.repo, "scripts/speaker-recipes/released/body-1.json"));
});

test("không tăng version thì dừng trước khi đụng git hay R2", async (t) => {
  const b = bench(t, { live: await liveOf(2), sourceVersion: 2, released: [2] });
  await assert.rejects(run({ mode: "update" }, b.ctx), /tăng "version"/);
  assert.equal(b.calls.filter((c) => c.cmd === "git").length, 0);
  assert.equal(b.state.put, null);
});

test("cây làm việc có file ngoài công thức thì dừng; không ở main thì dừng", async (t) => {
  const stray = bench(t, { dirty: ["src/main.rs"] });
  await assert.rejects(run({ mode: "update" }, stray.ctx), /file ngoài công thức \(src\/main\.rs\)/);
  const feature = bench(t, { branch: "phan-biet-nguoi-noi" });
  await assert.rejects(run({ mode: "update" }, feature.ctx), /nhánh main/);
  assert.equal(stray.state.put, null);
});

test("chạy lại sau khi lượt trước đã commit: không commit lần hai, vẫn đẩy, ký và đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(canonical(readFileSync(join(b.repo, SOURCE), "utf8")));
  // Không còn gì ở vùng staged (đã commit từ lượt trước): giả lập bằng cách đặt cờ staged về false sau `git add`.
  const original = b.ctx.io.run;
  b.ctx.io.run = function (cmd, args, opts) {
    const out = original.call(this, cmd, args, opts);
    if (cmd === "git" && args[0] === "add") b.state.staged = false;
    return out;
  };
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(!lines.some((l) => l.startsWith("git commit")));
  assert.ok(lines.includes("git push origin HEAD:main"));
  assert.ok(b.state.put, "vẫn đăng lên R2");
});

test("trả lời không thì không commit, không đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.answers = ["n"];
  assert.equal(await run({ mode: "update" }, b.ctx), 0);
  const lines = cmds(b.calls);
  assert.ok(!lines.some((l) => l.startsWith("git commit") || l.startsWith("git push")));
  assert.equal(b.state.put, null);
});

test("bản CI ký không khớp công thức trong repo thì KHÔNG đăng", async (t) => {
  const b = bench(t, { sourceVersion: 1 });
  b.state.signed = await b.sign(JSON.stringify(body(1, [app("zoom")])));
  await assert.rejects(run({ mode: "update" }, b.ctx), /không khớp công thức trong repo/);
  assert.equal(b.state.put, null);
});

test("--check chỉ kiểm và chạy cổng, không đụng git hay R2", async (t) => {
  const b = bench(t, { live: await liveOf(1), sourceVersion: 2, released: [1] });
  assert.equal(await run({ mode: "check" }, b.ctx), 0);
  assert.equal(b.calls.filter((c) => c.cmd === "git" || c.cmd === "gh").length, 0);
  assert.equal(b.state.put, null);
});

test("--revert-to: nội dung cũ, số mới = đang phát hành + 1; số lớn hơn hay không có bản lưu thì dừng", async (t) => {
  const b = bench(t, { live: await liveOf(3), sourceVersion: 3, released: [1, 3] });
  b.state.signed = null;
  await assert.rejects(run({ mode: "revert", version: 3 }, b.ctx), /phải chọn số nhỏ hơn/);
  await assert.rejects(run({ mode: "revert", version: 2 }, b.ctx), /Không có .*body-2\.json/);
  // Số 1 có bản lưu: nguồn được ghi lại với version 4.
  b.state.signed = await b.sign(JSON.stringify({ ...body(1, [app("teams")]), version: 4 }));
  assert.equal(await run({ mode: "revert", version: 1 }, b.ctx), 0);
  const written = JSON.parse(readFileSync(join(b.repo, SOURCE), "utf8"));
  assert.equal(written.version, 4);
  assert.deepEqual(written.apps, [app("teams")]);
  assert.ok(existsSync(join(b.repo, "scripts/speaker-recipes/released/body-4.json")));
  assert.ok(dirname(b.state.put[b.state.put.indexOf("--file") + 1]).includes("signed"));
});
```

Tạo `scripts/release/sign-recipes-ci.test.mjs`:

```javascript
// Test bước ký công thức đọc tên trong CI (kế hoạch 06): sign-recipes-ci.mjs. Không dùng khóa thật: script ký là bản giả.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { inputErrors, main as signRecipes } from "./sign-recipes-ci.mjs";

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "sign-recipes-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("sign-recipes --check: PREVIOUS bắt buộc trừ lần đăng đầu tiên", (t) => {
  const dir = tempDir(t);
  mkdirSync(join(dir, "r"));
  writeFileSync(join(dir, "r", "new.json"), "{}");
  writeFileSync(join(dir, "r", "old.json"), "{}");
  assert.match(inputErrors(dir, "r/new.json", "")[0], /PREVIOUS trống/);
  assert.deepEqual(inputErrors(dir, "r/new.json", "r/old.json"), []);
  assert.deepEqual(inputErrors(dir, "r/new.json", "", true), []);
  assert.match(inputErrors(dir, "r/new.json", "r/old.json", true)[0], /không đi cùng nhau/);
  assert.deepEqual(inputErrors(dir, "r/new.json", "../old.json"), ["PREVIOUS không được có '..'"]);
  assert.deepEqual(inputErrors(dir, "r/new.json", "r/none.json"), ["không thấy r/none.json"]);
  assert.deepEqual(inputErrors(dir, "", "r/old.json"), ["BODY trống"]);
  assert.deepEqual(inputErrors(dir, "/etc/passwd", "r/old.json"), ["BODY phải là đường dẫn tương đối trong repo"]);
});

test("sign-recipes: khóa ghi ra file 0600 ngoài repo, con không thấy biến khóa, file khóa bị xóa kể cả khi lỗi", (t) => {
  const dir = tempDir(t);
  const fakeRoot = join(dir, "repo");
  mkdirSync(join(fakeRoot, "scripts", "speaker-recipes"), { recursive: true });
  writeFileSync(join(fakeRoot, "body.json"), "{}");
  const log = join(dir, "log.json");
  // sign-recipes.mjs giả: ghi lại tham số, quyền file khóa, nội dung khóa và biến môi trường mà nó thấy.
  writeFileSync(
    join(fakeRoot, "scripts", "speaker-recipes", "sign-recipes.mjs"),
    `import { readFileSync, statSync, writeFileSync } from "node:fs";
const a = process.argv.slice(2); const opt = (n) => a[a.indexOf(n) + 1];
writeFileSync(${JSON.stringify(log)}, JSON.stringify({ key: opt("--key"),
  mode: (statSync(opt("--key")).mode & 0o777).toString(8), content: readFileSync(opt("--key"), "utf8"),
  sees: process.env.MANIFEST_SIGNING_KEY ?? null }));
writeFileSync(opt("--out"), "{}");
process.exit(Number(process.env.STUB_EXIT ?? 0));
`,
  );
  const env = { PATH: process.env.PATH, RUNNER_TEMP: dir, MANIFEST_SIGNING_KEY: '{"kid":"thử"}', BODY: "body.json" };
  assert.equal(signRecipes(env, fakeRoot), join(fakeRoot, "target", "recipes", "recipes.json"));
  const seen = JSON.parse(readFileSync(log, "utf8"));
  // Windows không có quyền kiểu POSIX (NTFS báo 666): chỉ kiểm 0600 ở nơi có.
  const posixMode = process.platform === "win32" ? seen.mode : "600";
  assert.deepEqual({ ...seen, key: undefined }, { key: undefined, mode: posixMode, content: '{"kid":"thử"}', sees: null });
  assert.equal(seen.key.startsWith(dir), true);
  assert.equal(existsSync(seen.key), false, "file khóa đã bị xóa");
  assert.throws(() => signRecipes({ ...env, STUB_EXIT: "3" }, fakeRoot), /thoát mã 3/);
  assert.equal(existsSync(JSON.parse(readFileSync(log, "utf8")).key), false, "lỗi vẫn xóa file khóa");
  assert.throws(() => signRecipes({ ...env, MANIFEST_SIGNING_KEY: "" }, fakeRoot), /chưa có secret/);
  assert.throws(() => signRecipes({ ...env, BODY: "../x" }, fakeRoot), /không được có '..'/);
  assert.throws(() => signRecipes(env, dir), /chưa có scripts\/speaker-recipes\/sign-recipes.mjs/);
});

test("sign-recipes.yml: cùng luật như sign-manifest.yml (action ghim SHA, quyền chỉ đọc, ký ở job riêng có environment release)", () => {
  const yml = readFileSync(new URL("../../.github/workflows/sign-recipes.yml", import.meta.url), "utf8");
  assert.match(yml, /permissions:\n  contents: read/);
  assert.match(yml, /\n  sign:\n(?:.*\n)*?    environment: release\n/);
  assert.match(yml, /needs: check/);
  for (const use of yml.match(/uses: \S+/g)) assert.match(use, /@[0-9a-f]{40}$/, use);
  const check = yml.split("\n  sign:\n")[0];
  assert.ok(!check.includes("secrets."), "job check không có secret");
  assert.ok(yml.includes("MANIFEST_SIGNING_KEY: ${{ secrets.MANIFEST_SIGNING_KEY }}"));
  assert.ok(!/pnpm .*install/.test(yml.split("\n  sign:\n")[1]), "job có secret không cài gói");
});
```

- [ ] **Step 5: Nối vào CI, `package.json`, `.gitignore`, luật workflow**

**Sửa `.github/workflows/ci.yml`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```yaml
      - name: Script phát hành và script manifest model (node --test)
        run: node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/models/update.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs
```

Đoạn thêm vào:

```yaml
      - name: Công thức đọc tên (node --test, kế hoạch 06 của phân biệt người nói)
        run: node --test scripts/speaker-recipes/update.test.mjs
```

**Sửa `package.json`:**

Thay đoạn:

```json
    "models:update": "node scripts/models/update.mjs"
```

bằng:

```json
    "models:update": "node scripts/models/update.mjs",
    "recipes:update": "node scripts/speaker-recipes/update.mjs"
```

**Sửa `.gitignore`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```
/.models-update/
```

Đoạn thêm vào:

```
# Trạng thái lượt đăng công thức đọc tên của pnpm recipes:update (bản đã ký, bản sao lưu recipes.json)
/.recipes-update/
```

**Sửa `scripts/release/workflow.test.mjs`:**

Thay đoạn:

```javascript
const workflows = ["release", "sign-manifest"].map((name) => [
```

bằng:

```javascript
const workflows = ["release", "sign-manifest", "sign-recipes"].map((name) => [
```


- [ ] **Step 6: Chạy test**

Run: `cd $W && node --test scripts/speaker-recipes/update.test.mjs scripts/release/sign-recipes-ci.test.mjs scripts/release/workflow.test.mjs 2>&1 | grep -E "^ℹ (tests|pass|fail)|✖"`
Expected: `fail 0`; số `tests` = 19 (`update.test.mjs`) + 3 (`sign-recipes-ci.test.mjs`) + số test của `workflow.test.mjs` (mốc đo: tổng 29 test, `pass 29`). Test "URL công khai trùng hằng của app" đọc `src-tauri/src/speaker/recipes.rs` (Task 3 phải xong trước).

- [ ] **Step 7: Kiểm âm tính**

Trong `scripts/speaker-recipes/update-flow.mjs` xóa dòng `if (liveInfo && info.version <= liveInfo.version) {` cùng khối `throw` của nó (cho phép đăng số không tăng) rồi chạy `node --test scripts/speaker-recipes/update.test.mjs`: test "không tăng version thì dừng trước khi đụng git hay R2" phải **đỏ**. Hoàn lại.

- [ ] **Step 8: Mốc kiểm**

Run: `cd $W && node --test "scripts/release/*.test.mjs" scripts/speaker-recipes/update.test.mjs 2>&1 | grep -E "^ℹ (pass|fail)"; git status --short | wc -l`
Expected: `fail 0`; số dòng `git status` tăng đúng số file mới và sửa của Task này. Không commit.

---

### Task 5: Giao thức 3 và mô tả chỉ báo tự học

Spec 6.5: "Mẫu chỉ báo tìm được (vai trò, id, lớp CSS, vị trí so với chữ tên; không có tên người) đi kèm báo cáo tình trạng". Thêm `LearnedPattern` ở giao thức (kèm giới hạn và `patterns_fit`), tăng `PROTOCOL_VERSION` lên 3, thêm `patterns` vào `Response::ReaderState` và `ReaderInfo`; ở worker, `candidates()` ghi thêm `CandidateShape` (chỉ khi đang hiệu chỉnh) vào `TileSample.shapes`, `Calibrator` nhớ mô tả các (khóa, trạng thái) đã thấy và khi học được thì lưu mô tả, `push_state` gửi `patterns`. Ba chỗ cần đổi đồng thời (protocol, pipeline, worker) nên Task này **chỉ biên dịch sau khi làm xong cả ba**.

**Files:**
- Modify: `crates/speaker-protocol/src/lib.rs`
- Modify: `crates/pipeline/src/{speaker.rs,speaker_client.rs,engine.rs}`, `crates/pipeline/src/bin/fake_speaker_worker.rs`, `crates/pipeline/tests/speaker_client.rs`
- Modify: `crates/speaker-worker/src/reader/extract.rs`, `crates/speaker-worker/src/names/{calibrate.rs,track.rs}`, `crates/speaker-worker/src/session.rs`

- [ ] **Step 1: Giao thức**

**Sửa `crates/speaker-protocol/src/lib.rs`:**

Thay đoạn:

```rust
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác. Kế hoạch 04: 2.
pub const PROTOCOL_VERSION: u32 = 2;
```

bằng:

```rust
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác. Kế hoạch 06: 3
/// (`ReaderState.patterns`).
pub const PROTOCOL_VERSION: u32 = 3;
/// `ReaderState.patterns` có tối đa chừng này mẫu (spec §6.5, §7.2); app coi nhiều hơn là khung hỏng.
pub const MAX_LEARNED_PATTERNS: usize = 4;
/// Đường đi trong ô của một mẫu chỉ báo dài tối đa chừng này chỉ số.
pub const MAX_PATTERN_PATH: usize = 8;
/// Một mẫu chỉ báo có tối đa chừng này trạng thái (thường gặp nhất trước).
pub const MAX_PATTERN_STATES: usize = 3;
/// Một trạng thái có tối đa chừng này lớp.
pub const MAX_PATTERN_CLASSES: usize = 6;
/// Vai trò, vai trò phụ hay một lớp dài tối đa chừng này byte.
pub const MAX_PATTERN_TOKEN_BYTES: usize = 32;
```

Thay đoạn:

```rust
/// Phần đọc tên của `Load` (spec §4.2
```

bằng:

```rust
/// Một trạng thái của phần tử chỉ báo tự học: vai trò phụ và các lớp, **không có chữ** (không tên, không nhãn).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct PatternState {
    pub subrole: String,
    pub classes: Vec<String>,
}

/// Mô tả một chỉ báo "đang nói" mà bộ tự hiệu chỉnh tìm được (spec §6.5), để người vận hành cập nhật công thức: vai trò, vị trí
/// trong ô (chỉ số con theo đường đi) và các trạng thái đã thấy. Không có tên người, không có chữ của app họp. Giới hạn: `MAX_*`.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct LearnedPattern {
    pub role: String,
    pub path: Vec<u16>,
    pub states: Vec<PatternState>,
}

/// Phần đọc tên của `Load` (spec §4.2
```

Thay đoạn:

```rust
        /// Số chỉ báo tự học được (6.5).
        learned: u32,
    },
```

bằng:

```rust
        /// Số chỉ báo tự học được (6.5).
        learned: u32,
        /// Mô tả các chỉ báo tự học (tối đa [`MAX_LEARNED_PATTERNS`]), không có tên người (kế hoạch 06, spec §7.2).
        patterns: Vec<LearnedPattern>,
    },
```

Thay đoạn:

```rust
/// Mẫu f32 trong [-1, 1] sang PCM 16 bit, cùng công thức
```

bằng:

```rust
/// `ReaderState.patterns` trong giới hạn (app coi khung vượt là hỏng): ≤ 4 mẫu, mỗi mẫu đường đi ≤ 8, ≤ 3 trạng thái, mỗi trạng thái
/// ≤ 6 lớp, mỗi vai trò, vai trò phụ, lớp ≤ 32 byte.
pub fn patterns_fit(patterns: &[LearnedPattern]) -> bool {
    let token = |s: &String| s.len() <= MAX_PATTERN_TOKEN_BYTES;
    patterns.len() <= MAX_LEARNED_PATTERNS
        && patterns.iter().all(|p| {
            token(&p.role)
                && p.path.len() <= MAX_PATTERN_PATH
                && p.states.len() <= MAX_PATTERN_STATES
                && p.states
                    .iter()
                    .all(|s| token(&s.subrole) && s.classes.len() <= MAX_PATTERN_CLASSES && s.classes.iter().all(token))
        })
}

/// Mẫu f32 trong [-1, 1] sang PCM 16 bit, cùng công thức
```

Thay đoạn:

```rust
                recipe_version: 1,
                learned: 0,
            },
        ]
```

bằng:

```rust
                recipe_version: 1,
                learned: 1,
                patterns: vec![LearnedPattern {
                    role: "AXGroup".into(),
                    path: vec![2, 0],
                    states: vec![PatternState {
                        subrole: String::new(),
                        classes: vec!["vdi-frame-occlusion".into()],
                    }],
                }],
            },
        ]
```

Thay đoạn:

```rust
    /// Danh sách app viết cứng (spec §6.1): công thức đọc không thêm được app.
```

bằng:

```rust
    #[test]
    fn patterns_fit_limits() {
        let state = |classes: usize| PatternState {
            subrole: String::new(),
            classes: vec!["x".into(); classes],
        };
        let pattern = |path: usize, states: Vec<PatternState>| LearnedPattern {
            role: "AXGroup".into(),
            path: vec![0; path],
            states,
        };
        let ok = pattern(MAX_PATTERN_PATH, vec![state(MAX_PATTERN_CLASSES); MAX_PATTERN_STATES]);
        assert!(patterns_fit(&[]));
        assert!(patterns_fit(&vec![ok.clone(); MAX_LEARNED_PATTERNS]));
        assert!(!patterns_fit(&vec![ok.clone(); MAX_LEARNED_PATTERNS + 1]));
        assert!(!patterns_fit(&[pattern(MAX_PATTERN_PATH + 1, vec![])]));
        assert!(!patterns_fit(&[pattern(0, vec![state(0); MAX_PATTERN_STATES + 1])]));
        assert!(!patterns_fit(&[pattern(0, vec![state(MAX_PATTERN_CLASSES + 1)])]));
        let mut long = ok;
        long.role = "x".repeat(MAX_PATTERN_TOKEN_BYTES + 1);
        assert!(!patterns_fit(&[long]));
    }

    /// Danh sách app viết cứng (spec §6.1): công thức đọc không thêm được app.
```


- [ ] **Step 2: Pipeline (client của worker, ReaderInfo, bản giả của worker)**

**Sửa `crates/pipeline/src/speaker.rs`:**

Thay đoạn:

```rust
use speaker_protocol::{
    MAX_EMBED_SAMPLES, MeetingApp, PersonName, ReaderStatus, SegmentAudio, Source, VoiceInfo, pcm_from_f32,
};
```

bằng:

```rust
use speaker_protocol::{
    LearnedPattern, MAX_EMBED_SAMPLES, MeetingApp, PersonName, ReaderStatus, SegmentAudio, Source, VoiceInfo,
    pcm_from_f32,
};
```

Thay đoạn:

```rust
    pub recipe_version: u32,
    pub learned: u32,
}
```

bằng:

```rust
    pub recipe_version: u32,
    pub learned: u32,
    /// Mô tả các chỉ báo tự học (không có tên người), cho báo cáo tình trạng (kế hoạch 06, spec §7.2).
    pub patterns: Vec<LearnedPattern>,
}
```

**Sửa `crates/pipeline/src/speaker_client.rs`:**

Thay đoạn:

```rust
    MAX_APP_VERSION_BYTES, NamesSetup, PROTOCOL_VERSION, Request, Response, SegmentAudio, SpeakerConfig, VoiceInfo,
    read_frame, voices_fit, write_frame,
};
```

bằng:

```rust
    MAX_APP_VERSION_BYTES, NamesSetup, PROTOCOL_VERSION, Request, Response, SegmentAudio, SpeakerConfig, VoiceInfo,
    patterns_fit, read_frame, voices_fit, write_frame,
};
```

Thay đoạn:

```rust
            Response::ReaderState {
                app,
                app_version,
                state,
                recipe_version,
                learned,
            } => {
                if !forward(SpeakerUpdate::Reader(ReaderInfo {
                    app,
                    app_version,
                    state,
                    recipe_version,
                    learned,
                })) {
```

bằng:

```rust
            Response::ReaderState { patterns, .. } if !patterns_fit(&patterns) => {
                break "ReaderState vượt giới hạn".into();
            }
            Response::ReaderState {
                app,
                app_version,
                state,
                recipe_version,
                learned,
                patterns,
            } => {
                if !forward(SpeakerUpdate::Reader(ReaderInfo {
                    app,
                    app_version,
                    state,
                    recipe_version,
                    learned,
                    patterns,
                })) {
```

**Sửa `crates/pipeline/src/engine.rs`:**

Thay đoạn:

```rust
            app_version: None,
            state: ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 0,
        })));
```

bằng:

```rust
            app_version: None,
            state: ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 0,
            patterns: vec![],
        })));
```

**Sửa `crates/pipeline/src/bin/fake_speaker_worker.rs`:**

Thay đoạn:

```rust
            state: speaker_protocol::ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 0,
        });
```

bằng:

```rust
            state: speaker_protocol::ReaderStatus::NoPermission,
            recipe_version: 1,
            learned: 1,
            patterns: vec![speaker_protocol::LearnedPattern {
                role: "AXGroup".into(),
                path: vec![1, 0],
                states: vec![],
            }],
        });
```

**Sửa `crates/pipeline/tests/speaker_client.rs`:**

Thay đoạn:

```rust
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.state == ReaderStatus::NoPermission && r.app == Some(MeetingApp::Teams)
    ));
}
```

bằng:

```rust
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.state == ReaderStatus::NoPermission && r.app == Some(MeetingApp::Teams)
    ));
    assert!(matches!(
        seen.last(),
        Some(SpeakerUpdate::Reader(r)) if r.learned == 1 && r.patterns.len() == 1 && r.patterns[0].role == "AXGroup"
    ));
}
```

**Sửa `crates/pipeline/src/engine.rs`:**

Thay đoạn:

```rust
                app: None,
                app_version: None,
                state,
                recipe_version: 1,
                learned: 0,
            })
```

bằng:

```rust
                app: None,
                app_version: None,
                state,
                recipe_version: 1,
                learned: 0,
                patterns: vec![],
            })
```


- [ ] **Step 3: Worker (mô tả ứng viên, bộ hiệu chỉnh, trạng thái bộ đọc)**

**Sửa `crates/speaker-worker/src/reader/extract.rs`:**

Thay đoạn:

```rust
/// Mẫu của một ô ở một lượt đọc: đúng những gì ra khỏi bộ đọc (spec §6.3).
#[derive(Clone, PartialEq)]
pub struct TileSample {
```

bằng:

```rust
/// Mô tả một ứng viên tự hiệu chỉnh ở một trạng thái (kế hoạch 06, spec §7.2): vai trò, vị trí trong ô, vai trò phụ và các lớp. **Không
/// có chữ** (không tên, không nhãn): để báo cáo tình trạng mô tả chỉ báo tự học cho người cập nhật công thức.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CandidateShape {
    /// Khóa vị trí và trạng thái, như trong [`TileSample::candidates`].
    pub key: u64,
    pub state: u64,
    pub role: String,
    pub path: Vec<u16>,
    pub subrole: String,
    pub classes: Vec<String>,
}

/// Mẫu của một ô ở một lượt đọc: đúng những gì ra khỏi bộ đọc (spec §6.3).
#[derive(Clone, PartialEq)]
pub struct TileSample {
```

Thay đoạn:

```rust
    pub candidates: Vec<(u64, u64)>,
    /// Như [`TileRef::slot`].
```

bằng:

```rust
    pub candidates: Vec<(u64, u64)>,
    /// Mô tả của các ứng viên trên (cùng lúc, cùng thứ tự); chỉ để mô tả chỉ báo tự học trong báo cáo tình trạng.
    pub shapes: Vec<CandidateShape>,
    /// Như [`TileRef::slot`].
```

Thay đoạn:

```rust
            .field("candidates", &self.candidates.len())
            .field("slot", &self.slot)
```

bằng:

```rust
            .field("candidates", &self.candidates.len())
            .field("shapes", &self.shapes.len())
            .field("slot", &self.slot)
```

Thay đoạn:

```rust
fn candidates<T: Tree>(t: &mut T, tile: &T::Node) -> Vec<(u64, u64)> {
    let mut out = Vec::new();
```

bằng:

```rust
fn candidates<T: Tree>(t: &mut T, tile: &T::Node) -> (Vec<(u64, u64)>, Vec<CandidateShape>) {
    let mut out = Vec::new();
    let mut shapes = Vec::new();
```

Thay đoạn:

```rust
            (&path, &a.role).hash(&mut h);
            out.push((h.finish(), state_of(&a)));
```

bằng:

```rust
            (&path, &a.role).hash(&mut h);
            let (key, state) = (h.finish(), state_of(&a));
            out.push((key, state));
            shapes.push(CandidateShape {
                key,
                state,
                role: a.role.clone(),
                path: path.clone(),
                subrole: a.subrole.clone(),
                classes: a.classes.iter().take(MAX_SHAPE_CLASSES).cloned().collect(),
            });
```

Thay đoạn:

```rust
    out
}

/// Kết quả lấy mẫu một ô ở lượt nhanh.
```

bằng:

```rust
    (out, shapes)
}

/// Kết quả lấy mẫu một ô ở lượt nhanh.
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
/// Ứng viên nằm trong ô, sâu tối đa chừng này.
const CANDIDATE_DEPTH: usize = 4;
```

Đoạn thêm vào:

```rust
/// Số lớp giữ lại trong mô tả một ứng viên (`CandidateShape::classes`).
const MAX_SHAPE_CLASSES: usize = 8;
```

Thay đoạn:

```rust
    let candidates = if calibrate {
        candidates(t, &tile.node)
    } else {
        Vec::new()
    };
```

bằng:

```rust
    let (candidates, shapes) = if calibrate {
        candidates(t, &tile.node)
    } else {
        (Vec::new(), Vec::new())
    };
```

Thay đoạn:

```rust
        anchors,
        candidates,
        slot: tile.slot,
    })
```

bằng:

```rust
        anchors,
        candidates,
        shapes,
        slot: tile.slot,
    })
```

Thay đoạn:

```rust
            anchors: vec![Some(1)],
            candidates: vec![],
            slot: 0,
        };
        assert!(!format!("{s:?}").contains("Lan"));
```

bằng:

```rust
            anchors: vec![Some(1)],
            candidates: vec![],
            shapes: vec![],
            slot: 0,
        };
        assert!(!format!("{s:?}").contains("Lan"));
```

**Sửa `crates/speaker-worker/src/names/calibrate.rs`:**

Thay đoạn:

```rust
use super::Spans;
use crate::reader::extract::TileSample;
```

bằng:

```rust
use speaker_protocol::{LearnedPattern, MAX_LEARNED_PATTERNS, MAX_PATTERN_STATES, PatternState};

use super::Spans;
use crate::reader::extract::{CandidateShape, TileSample};
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
/// Một chuỗi cần ít nhất chừng này mẫu mới được xét.
const MIN_SAMPLES: usize = 8;
```

Đoạn thêm vào:

```rust
/// Số (khóa, trạng thái) tối đa giữ mô tả trong một lần tìm.
const MAX_SHAPES: usize = 128;
```

Thay đoạn:

```rust
    learned: BTreeMap<String, u64>,
    last_eval: Option<i64>,
}
```

bằng:

```rust
    learned: BTreeMap<String, u64>,
    last_eval: Option<i64>,
    /// Mô tả các ứng viên đã thấy trong lần tìm này: (khóa, trạng thái) → (số lần thấy, mô tả). Bỏ khi thôi tìm.
    seen: BTreeMap<(u64, u64), (u32, CandidateShape)>,
    /// Mô tả chỉ báo đã học, theo khóa ứng viên (không có tên người), để gửi kèm báo cáo tình trạng.
    patterns: BTreeMap<u64, LearnedPattern>,
}
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
    /// Chỉ báo tự học của từng người tham dự (khóa ứng viên).
    pub fn learned(&self) -> &BTreeMap<String, u64> {
        &self.learned
    }
```

Đoạn thêm vào:

```rust
    /// Mô tả các chỉ báo đã học (tối đa [`MAX_LEARNED_PATTERNS`], không trùng nhau, không có tên người): vai trò, vị trí trong ô và
    /// các trạng thái thấy nhiều nhất. Gửi kèm `ReaderState` (spec §7.2).
    pub fn patterns(&self) -> Vec<LearnedPattern> {
        self.patterns.values().take(MAX_LEARNED_PATTERNS).cloned().collect()
    }

    fn note(&mut self, shape: &CandidateShape) {
        let id = (shape.key, shape.state);
        if !self.seen.contains_key(&id) && self.seen.len() >= MAX_SHAPES {
            return;
        }
        self.seen.entry(id).or_insert_with(|| (0, shape.clone())).0 += 1;
    }

    /// Mô tả ứng viên `key` từ các trạng thái đã thấy (nhiều lần nhất trước, hòa thì trạng thái nhỏ hơn).
    fn describe(&self, key: u64) -> Option<LearnedPattern> {
        let mut states: Vec<&(u32, CandidateShape)> =
            self.seen.range((key, 0)..=(key, u64::MAX)).map(|(_, v)| v).collect();
        states.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.state.cmp(&b.1.state)));
        let first = &states.first()?.1;
        Some(LearnedPattern {
            role: first.role.clone(),
            path: first.path.clone(),
            states: states
                .iter()
                .take(MAX_PATTERN_STATES)
                .map(|(_, s)| PatternState {
                    subrole: s.subrole.clone(),
                    classes: s.classes.clone(),
                })
                .collect(),
        })
    }
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
            keys.extend(tile.candidates.iter().map(|(k, _)| *k));
```

Đoạn thêm vào:

```rust
            for shape in &tile.shapes {
                self.note(shape);
            }
```

Thay đoạn:

```rust
        self.retry_at = retry_at;
        self.series.clear();
    }
```

bằng:

```rust
        self.retry_at = retry_at;
        self.series.clear();
        self.seen.clear();
    }
```

Thay đoạn:

```rust
            if self.learned.len() < MAX_LEARNED {
                self.learned.insert(name, key);
                learned_new = true;
            }
```

bằng:

```rust
            if self.learned.len() < MAX_LEARNED {
                self.learned.insert(name, key);
                if let Some(pattern) = self.describe(key) {
                    self.patterns.entry(key).or_insert(pattern);
                }
                learned_new = true;
            }
```

Thay đoạn:

```rust
            anchors: vec![None],
            candidates,
            slot: 0,
        }
    }
```

bằng:

```rust
            anchors: vec![None],
            candidates,
            shapes: vec![],
            slot: 0,
        }
    }
```

**Sửa `crates/speaker-worker/src/names/track.rs`:**

Thay đoạn:

```rust
            anchors: vec![anchor],
            candidates,
            slot,
        }
```

bằng:

```rust
            anchors: vec![anchor],
            candidates,
            shapes: vec![],
            slot,
        }
```

Thay đoạn:

```rust
            anchors: vec![],
            candidates: vec![],
            slot: 9_999,
        };
```

bằng:

```rust
            anchors: vec![],
            candidates: vec![],
            shapes: vec![],
            slot: 9_999,
        };
```

Thay đoạn:

```rust
                candidates: (0..16u64).map(|k| (k, u64::from(i) + k)).collect(),
                slot: i,
```

bằng:

```rust
                candidates: (0..16u64).map(|k| (k, u64::from(i) + k)).collect(),
                shapes: vec![],
                slot: i,
```

**Sửa `crates/speaker-worker/src/session.rs`:**

Thay đoạn:

```rust
        let learned = self.names.calibrator.learned().len() as u32;
        let version = version.filter(|v| v.len() <= MAX_APP_VERSION_BYTES);
```

bằng:

```rust
        let learned = self.names.calibrator.learned().len() as u32;
        let patterns = self.names.calibrator.patterns();
        let version = version.filter(|v| v.len() <= MAX_APP_VERSION_BYTES);
```

Thay đoạn:

```rust
            state,
            recipe_version,
            learned,
        });
    }
```

bằng:

```rust
            state,
            recipe_version,
            learned,
            patterns,
        });
    }
```

Thay đoạn:

```rust
                    anchors: vec![on.then_some(1)],
                    candidates: vec![],
                    slot: 0,
```

bằng:

```rust
                    anchors: vec![on.then_some(1)],
                    candidates: vec![],
                    shapes: vec![],
                    slot: 0,
```

**Sửa `crates/speaker-worker/src/names/calibrate.rs`:**

Thay đoạn:

```rust
    /// QĐ 11 (rà soát A-Q10): máy lúc nào cũng có tiếng (Lan và Minh nói luân phiên)
```

bằng:

```rust
    /// Kế hoạch 06 (spec §7.2): chỉ báo học được kèm mô tả (vai trò, vị trí trong ô, các trạng thái đã thấy), không có tên người.
    #[test]
    fn a_learned_indicator_is_described_without_names() {
        let shape = |state: u64| CandidateShape {
            key: 7,
            state,
            role: "AXGroup".into(),
            path: vec![2, 0],
            subrole: String::new(),
            classes: if state == 2 {
                vec!["x".into(), "on".into()]
            } else {
                vec!["x".into()]
            },
        };
        let speech = bursts();
        let mut c = Calibrator::default();
        let mut t: i64 = 0;
        while t < 80_000 {
            let state = if speech.covers(t - CAL_SHIFT_MS) { 2 } else { 1 };
            let mut lan = tile("Lan", vec![(7, state)]);
            lan.shapes = vec![shape(state)];
            c.push(t, 250, &[me(), lan], false, &speech);
            t += 250;
        }
        assert_eq!(c.learned().get("Lan"), Some(&7));
        let patterns = c.patterns();
        assert_eq!(patterns.len(), 1);
        assert_eq!(
            (patterns[0].role.as_str(), patterns[0].path.as_slice()),
            ("AXGroup", &[2u16, 0][..])
        );
        let classes: Vec<&Vec<String>> = patterns[0].states.iter().map(|s| &s.classes).collect();
        assert_eq!(classes.len(), 2, "hai trạng thái: im và đang nói");
        assert!(
            classes.contains(&&vec!["x".to_string()]) && classes.contains(&&vec!["x".to_string(), "on".to_string()])
        );
        assert!(!format!("{patterns:?}").contains("Lan"), "mô tả không có tên người");
        assert!(speaker_protocol::patterns_fit(&patterns));
    }

    /// QĐ 11 (rà soát A-Q10): máy lúc nào cũng có tiếng (Lan và Minh nói luân phiên)
```


- [ ] **Step 4: Chạy test** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-protocol -p pipeline -p speaker-worker -- --check && cargo test -p speaker-protocol 2>&1 | grep -E "^test result|FAILED"; cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result|FAILED|panicked"; cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test result|FAILED|panicked"; cargo test -p pipeline --lib -- reader_ 2>&1 | grep -E "^test result|FAILED"`
Expected: `speaker-protocol` 15 đạt (thêm `patterns_fit_limits`; test `requests_and_responses_roundtrip`, `variant_indices_are_pinned` vẫn đạt); `speaker-worker` lib 163 đạt, 5 bỏ qua (thêm `a_learned_indicator_is_described_without_names`); `speaker_client` 31 đạt (trong đó `names_participants_and_reader_state_are_forwarded` kiểm thêm `patterns` đi qua client); `reader_` của pipeline 2 đạt. Giao thức đã tăng lên 3: `speaker-worker` tự báo phiên bản mới trong `Ready`.

- [ ] **Step 5: Kiểm âm tính**

Trong `patterns_fit` bỏ điều kiện `patterns.len() <= MAX_LEARNED_PATTERNS` rồi chạy `cargo test -p speaker-protocol patterns_fit`: **đỏ**. Hoàn lại. (Bước này chứng minh giới hạn thật sự chặn khung hỏng của worker.)

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo clippy -p speaker-protocol -p pipeline -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -2 && scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -1`
Expected: clippy `Finished`; `không có mã mạng: speaker-worker speaker-protocol speaker-recipe (…)`. Không commit.

---

### Task 6: `app_version` trên Windows và hợp nhất `Stats`

Hai việc nhỏ mà 05 để lại cho 06. (a) `ReaderState.app_version` trên Windows: `Desktop::app_version` (mặc định không biết), `Scanner` hỏi một lần cho mỗi tiến trình của app trong danh sách và nhớ cùng file chạy 30 giây, `Found.version`, `LiveReader` đưa vào `Sample`; `Win32Desktop` lấy từ tên gói MSIX hay từ tài nguyên phiên bản của file chạy. Phần phân tích (`package_version`, `fixed_file_version`) thuần, test trên Mac. (b) `reader::macos` dùng `reader::stats::Stats`. Không thêm crate; `windows` thêm hai feature.

**Files:**
- Modify: `crates/speaker-worker/Cargo.toml`, `crates/speaker-worker/src/reader/{winscan.rs,uia.rs,macos.rs}`

- [ ] **Step 1: Chỉnh sửa**

**Sửa `crates/speaker-worker/Cargo.toml`:**

Thay đoạn:

```toml
    "Win32_Foundation",
    "Win32_System_Com",
```

bằng:

```toml
    "Win32_Foundation",
    "Win32_Storage_FileSystem",
    "Win32_Storage_Packaging_Appx",
    "Win32_System_Com",
```

**Sửa `crates/speaker-worker/src/reader/winscan.rs`:**

Thay đoạn:

```rust
    fn class_name(&mut self, id: isize) -> String;
}
```

bằng:

```rust
    fn class_name(&mut self, id: isize) -> String;
    /// Phiên bản của app họp đang chạy ở tiến trình `pid` (file chạy `exe_path`), cho báo cáo tình trạng (kế hoạch 06, spec §7.2).
    /// Mặc định không biết. Chỉ gọi cho tiến trình của app trong danh sách viết cứng.
    fn app_version(&mut self, pid: u32, exe_path: &str) -> Option<String> {
        let _ = (pid, exe_path);
        None
    }
}
```

Thay đoạn:

```rust
/// Cửa sổ họp tìm được. `title` có chữ của app họp: không in ra log.
```

bằng:

```rust
/// Phiên bản trong tên đầy đủ của một gói MSIX (`Tên_Phiên.bản.số.nữa_Kiến-trúc_Mã-tài-nguyên_Mã-nhà-phát-hành`, ví dụ
/// `MSTeams_26032.1100.4129.1234_x64__8wekyb3d8bbwe`): Teams mới là gói trong `WindowsApps`, đọc file phiên bản của file chạy ở đó
/// thường bị từ chối, còn tên gói thì tiến trình nào cũng hỏi được. `None` nếu không đúng dạng (chỉ số và dấu chấm, ≤ 32 ký tự).
pub fn package_version(full_name: &str) -> Option<String> {
    let mut parts = full_name.split('_');
    let (_name, version) = (parts.next()?, parts.next()?);
    let ok = !version.is_empty()
        && version.len() <= speaker_protocol::MAX_APP_VERSION_BYTES
        && version
            .split('.')
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    (ok && parts.next().is_some()).then(|| version.to_string())
}

/// `a.b.c.d` của hai nửa `VS_FIXEDFILEINFO::dwFileVersionMS` và `dwFileVersionLS`.
pub fn fixed_file_version(ms: u32, ls: u32) -> String {
    format!("{}.{}.{}.{}", ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF)
}

/// Cửa sổ họp tìm được. `title` có chữ của app họp: không in ra log.
```

Thay đoạn:

```rust
pub struct Found {
    pub app: MeetingApp,
    pub windows: Vec<MeetingWindow>,
}
```

bằng:

```rust
pub struct Found {
    pub app: MeetingApp,
    pub windows: Vec<MeetingWindow>,
    /// Phiên bản app họp (từ tiến trình của cửa sổ họp đầu tiên), nếu hỏi được.
    pub version: Option<String>,
}
```

Thay đoạn:

```rust
pub struct Scanner {
    exes: HashMap<u32, (Instant, Option<MeetingApp>)>,
}
```

bằng:

```rust
pub struct Scanner {
    exes: HashMap<u32, (Instant, Option<MeetingApp>, Option<String>)>,
}
```

Thay đoạn:

```rust
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
```

bằng:

```rust
        let mut per_app: Vec<Vec<MeetingWindow>> = vec![Vec::new(); MeetingApp::ALL.len()];
        let mut versions: Vec<Option<String>> = vec![None; MeetingApp::ALL.len()];
        for w in d.top_windows().into_iter().take(MAX_TOP_WINDOWS) {
            seen.insert(w.pid);
            let (app, version) = match self.exes.get(&w.pid) {
                Some((at, app, version)) if now.saturating_duration_since(*at) < EXE_TTL => (*app, version.clone()),
                _ => {
                    let path = d.exe_path(w.pid);
                    let app = path.as_deref().and_then(app_of_exe);
                    // Phiên bản chỉ hỏi cho app trong danh sách viết cứng.
                    let version = app.and_then(|_| path.as_deref().and_then(|p| d.app_version(w.pid, p)));
                    self.exes.insert(w.pid, (now, app, version.clone()));
                    (app, version)
                }
            };
```

Thay đoạn:

```rust
                let slot = MeetingApp::ALL.iter().position(|a| *a == app).unwrap_or(0);
                per_app[slot].push(MeetingWindow { id: w.id, title });
```

bằng:

```rust
                let slot = MeetingApp::ALL.iter().position(|a| *a == app).unwrap_or(0);
                if per_app[slot].is_empty() {
                    versions[slot] = version;
                }
                per_app[slot].push(MeetingWindow { id: w.id, title });
```

Thay đoạn:

```rust
        MeetingApp::ALL
            .into_iter()
            .zip(per_app)
            .find(|(_, windows)| !windows.is_empty())
            .map(|(app, mut windows)| {
                windows.truncate(MAX_WINDOWS);
                Found { app, windows }
            })
```

bằng:

```rust
        MeetingApp::ALL
            .into_iter()
            .zip(per_app)
            .zip(versions)
            .find(|((_, windows), _)| !windows.is_empty())
            .map(|((app, mut windows), version)| {
                windows.truncate(MAX_WINDOWS);
                Found { app, windows, version }
            })
```

Thay đoạn:

```rust
        titled: Vec<isize>,
        exe_asked: Vec<u32>,
    }
```

bằng:

```rust
        titled: Vec<isize>,
        exe_asked: Vec<u32>,
        /// (tiến trình, phiên bản) mà `app_version` trả; ghi lại các tiến trình đã bị hỏi phiên bản.
        versions: Vec<(u32, &'static str)>,
        version_asked: Vec<u32>,
    }
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
        fn class_name(&mut self, id: isize) -> String {
            self.windows
                .iter()
                .find(|w| w.0.id == id)
                .map(|w| w.3.to_string())
                .unwrap_or_default()
        }
```

Đoạn thêm vào:

```rust
        fn app_version(&mut self, pid: u32, _exe_path: &str) -> Option<String> {
            self.version_asked.push(pid);
            self.versions.iter().find(|v| v.0 == pid).map(|v| v.1.to_string())
        }
```

Thay đoạn:

```rust
    #[test]
    fn executables_map_to_the_hard_coded_apps() {
```

bằng:

```rust
    #[test]
    fn package_names_give_the_app_version() {
        assert_eq!(
            package_version("MSTeams_26032.1100.4129.1234_x64__8wekyb3d8bbwe").as_deref(),
            Some("26032.1100.4129.1234")
        );
        assert_eq!(package_version("A_1_neutral__x").as_deref(), Some("1"));
        for bad in [
            "",
            "MSTeams",
            "MSTeams_26032.1100",
            "MSTeams__x64__x",
            "A_1.x_x64__x",
            "A_1..2_x64__x",
            "A_1.2._x64__x",
            "A_1.2.3.4.5.6.7.8.9.10.11.12.13.14.15_x64__x",
            "A_Lan Nguyễn_x64__x",
        ] {
            assert_eq!(package_version(bad), None, "{bad}");
        }
    }

    #[test]
    fn fixed_file_versions_read_four_numbers() {
        assert_eq!(fixed_file_version(0x0009_0001, 0x0002_0003), "9.1.2.3");
        assert_eq!(fixed_file_version(0x009C_0000, 0x1234_FFFF), "156.0.4660.65535");
    }

    /// Phiên bản của app họp đi cùng cửa sổ họp; chỉ hỏi cho app trong danh sách, và nhớ cùng file chạy (không hỏi lại trong `EXE_TTL`).
    #[test]
    fn the_app_version_comes_with_the_meeting_window_and_is_asked_once() {
        let mut d = Fake::default();
        d.add(1, 100, "notepad.exe", "Meeting with my diary - Notepad");
        d.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        d.versions = vec![(100, "9.9"), (101, "26032.1100.4129.1234")];
        let mut s = Scanner::default();
        let t0 = Instant::now();
        let found = s.scan(&mut d, &recipes(), None, t0).unwrap();
        assert_eq!(found.version.as_deref(), Some("26032.1100.4129.1234"));
        assert_eq!(
            d.version_asked,
            [101],
            "notepad không có trong danh sách: không hỏi phiên bản"
        );
        s.scan(&mut d, &recipes(), None, t0 + Duration::from_secs(2)).unwrap();
        assert_eq!(d.version_asked, [101], "còn trong EXE_TTL");
        s.scan(&mut d, &recipes(), None, t0 + EXE_TTL + Duration::from_secs(1))
            .unwrap();
        assert_eq!(d.version_asked, [101, 101], "hết hạn thì hỏi lại");
        let mut none = Fake::default();
        none.add(2, 101, "ms-teams.exe", "Meeting with Hoa Phạm | Microsoft Teams");
        assert_eq!(
            Scanner::default()
                .scan(&mut none, &recipes(), None, t0)
                .unwrap()
                .version,
            None
        );
    }

    #[test]
    fn executables_map_to_the_hard_coded_apps() {
```

**Sửa `crates/speaker-worker/src/reader/uia.rs`:**

Thay đoạn:

```rust
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
```

bằng:

```rust
use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, HWND, LPARAM};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW,
};
use windows::Win32::Storage::Packaging::Appx::GetPackageFullName;
```

Thay đoạn:

```rust
use windows::core::{BOOL, BSTR, Interface, PWSTR};
```

bằng:

```rust
use windows::core::{BOOL, BSTR, Interface, PCWSTR, PWSTR};
```

Thay đoạn:

```rust
use super::winscan::{Desktop, RawWindow, Scanner};
```

bằng:

```rust
use super::winscan::{Desktop, RawWindow, Scanner, fixed_file_version, package_version};
```

Thay đoạn:

```rust
    fn class_name(&mut self, id: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY: như `title`.
        let n = unsafe { GetClassNameW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }
}
```

bằng:

```rust
    fn class_name(&mut self, id: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY: như `title`.
        let n = unsafe { GetClassNameW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    fn app_version(&mut self, pid: u32, exe_path: &str) -> Option<String> {
        package_version_of_process(pid).or_else(|| file_version(exe_path))
    }
}

/// Phiên bản của gói MSIX mà tiến trình thuộc về (Teams mới), từ tên đầy đủ của gói; `None` nếu tiến trình không phải app đóng gói
/// hay không hỏi được. Không đọc file nào trong `WindowsApps`.
fn package_version_of_process(pid: u32) -> Option<String> {
    // SAFETY: mở tiến trình chỉ để hỏi tên gói (quyền hạn chế nhất), đóng handle ngay sau đó; bộ đệm 256 ký tự lớn hơn
    // `PACKAGE_FULL_NAME_MAX_LENGTH` (127) nên không bao giờ thiếu chỗ.
    let name = unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 256];
        let mut len = buf.len() as u32;
        let rc = GetPackageFullName(handle, &mut len, Some(PWSTR(buf.as_mut_ptr())));
        let _ = CloseHandle(handle);
        (rc == ERROR_SUCCESS)
            .then(|| String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1).min(buf.len())]))?
    };
    package_version(&name)
}

/// Phiên bản trong tài nguyên phiên bản của file chạy (Chrome, Edge, Zoom: file nằm ở thư mục đọc được). `None` nếu không đọc được.
fn file_version(path: &str) -> Option<String> {
    let file: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let root: Vec<u16> = "\\".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: cả hai chuỗi kết thúc bằng NUL và sống hơn các lệnh gọi; bộ đệm đúng cỡ `GetFileVersionInfoSizeW` trả (≤ 1 MiB);
    // `VerQueryValueW` trả con trỏ vào chính bộ đệm đó, và ta chỉ đọc khi đủ chỗ cho một `VS_FIXEDFILEINFO`.
    unsafe {
        let size = GetFileVersionInfoSizeW(PCWSTR(file.as_ptr()), None);
        if size == 0 || size > (1 << 20) {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(PCWSTR(file.as_ptr()), None, size, data.as_mut_ptr().cast()).ok()?;
        let mut info: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let found = VerQueryValueW(data.as_ptr().cast(), PCWSTR(root.as_ptr()), &mut info, &mut len);
        if !found.as_bool() || info.is_null() || (len as usize) < std::mem::size_of::<VS_FIXEDFILEINFO>() {
            return None;
        }
        let fixed = &*(info as *const VS_FIXEDFILEINFO);
        Some(fixed_file_version(fixed.dwFileVersionMS, fixed.dwFileVersionLS))
    }
}
```

Thay đoạn:

```rust
    scanner: Scanner,
    last_scan: Option<Instant>,
    app: Option<MeetingApp>,
    windows: Vec<WindowState<Node>>,
```

bằng:

```rust
    scanner: Scanner,
    last_scan: Option<Instant>,
    app: Option<MeetingApp>,
    /// Phiên bản của app họp đang đọc (`ReaderState.app_version`), nếu hỏi được.
    version: Option<String>,
    windows: Vec<WindowState<Node>>,
```

Thay đoạn:

```rust
            scanner: Scanner::default(),
            last_scan: None,
            app: None,
            windows: Vec::new(),
```

bằng:

```rust
            scanner: Scanner::default(),
            last_scan: None,
            app: None,
            version: None,
            windows: Vec::new(),
```

Thay đoạn:

```rust
        let Some(found) = found else {
            self.app = None;
            self.windows.clear();
            return;
        };
```

bằng:

```rust
        let Some(found) = found else {
            self.app = None;
            self.version = None;
            self.windows.clear();
            return;
        };
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
        self.windows = reconcile(old, &list, |id| backend.element_from_hwnd(id).map(UiaNode::new));
        self.app = Some(found.app);
```

Đoạn thêm vào:

```rust
        self.version = found.version;
```

Thay đoạn:

```rust
    pub fn release_all(&mut self) {
        self.app = None;
        self.windows.clear();
```

bằng:

```rust
    pub fn release_all(&mut self) {
        self.app = None;
        self.version = None;
        self.windows.clear();
```

Thay đoạn:

```rust
        let sample = Sample {
            tiles,
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
```

bằng:

```rust
        let sample = Sample {
            tiles,
            app_version: self.version.clone(),
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
```

**Sửa `crates/speaker-worker/src/reader/macos.rs`:**

Thay đoạn:

```rust
use super::tree::Tree;
use super::{Control, ControlState, FULL_EVERY
```

bằng:

```rust
use super::stats::Stats;
use super::tree::Tree;
use super::{Control, ControlState, FULL_EVERY
```

Thay đoạn:

```rust
/// Một dòng thống kê vào log mỗi chừng này.
const STATS_EVERY: Duration = Duration::from_secs(60);
```

bằng:

```rust

```

Thay đoạn:

```rust
#[derive(Default)]
struct Stats {
    full: Vec<f32>,
    fast: Vec<f32>,
    elements: Vec<u32>,
    since: Option<Instant>,
}

impl Stats {
    fn add(&mut self, pass: Pass, ms: f32, elements: u32) {
        match pass {
            Pass::Full => self.full.push(ms),
            Pass::Fast => self.fast.push(ms),
            Pass::Idle => return,
        }
        self.elements.push(elements);
        let since = *self.since.get_or_insert_with(Instant::now);
        if since.elapsed() >= STATS_EVERY {
            let q = |v: &mut Vec<f32>, p: f32| -> f32 {
                v.sort_by(f32::total_cmp);
                v.get(((v.len() as f32 - 1.0) * p).round().max(0.0) as usize)
                    .copied()
                    .unwrap_or(0.0)
            };
            self.elements.sort_unstable();
            let over = self.full.iter().chain(&self.fast).filter(|&&ms| ms > 30.0).count();
            eprintln!(
                "speaker-worker: bộ đọc: {} lượt đầy đủ (p50 {:.1} ms, p90 {:.1}, lớn nhất {:.1}), {} lượt nhanh (p50 {:.1} ms, p90 {:.1}, \
                 lớn nhất {:.1}), phần tử p90 {}, {over} lượt quá 30 ms",
                self.full.len(),
                q(&mut self.full, 0.5),
                q(&mut self.full, 0.9),
                q(&mut self.full, 1.0),
                self.fast.len(),
                q(&mut self.fast, 0.5),
                q(&mut self.fast, 0.9),
                q(&mut self.fast, 1.0),
                self.elements.get(self.elements.len() * 9 / 10).copied().unwrap_or(0)
            );
            *self = Stats::default();
        }
    }
}
```

bằng:

```rust

```

Thay đoạn:

```rust
        self.stats.add(s.pass, s.pass_ms, s.elements);
        s
    }
```

bằng:

```rust
        if let Some(line) = self.stats.add(s.pass, s.pass_ms, s.elements, Instant::now()) {
            eprintln!("{line}");
        }
        s
    }
```


- [ ] **Step 2: Chạy test trên Mac** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-worker -- --check && cargo test -p speaker-worker --lib 2>&1 | grep -E "^test result|FAILED|panicked" && cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -2`
Expected: 166 đạt, 5 bỏ qua (thêm `package_names_give_the_app_version`, `fixed_file_versions_read_four_numbers`, `the_app_version_comes_with_the_meeting_window_and_is_asked_once`); clippy `Finished` không cảnh báo (`STATS_EVERY` và `Duration` của `macos.rs` không còn thừa import).

- [ ] **Step 3: Biên dịch chéo và clippy cho Windows** (build nặng: kiểm đĩa trước, ngưỡng 14 GiB)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 RC_x86_64_pc_windows_msvc=$W/scripts/fake-llvm-rc PKG_CONFIG_x86_64_pc_windows_msvc=$W/scripts/fake-pkg-config PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 && cargo clippy -p speaker-worker --target x86_64-pc-windows-msvc --all-targets -- -D warnings 2>&1 | tail -3`
Expected: `Finished` không lỗi (đây là bước duy nhất kiểm `package_version_of_process` và `file_version` trong `uia.rs`: chữ ký `GetPackageFullName`, `GetFileVersionInfoW`, `VerQueryValueW` của `windows` 0.62.2). Hành vi thật chỉ biết trên máy Windows (Task 20).

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && scripts/release/check-no-network.sh speaker-worker speaker-protocol speaker-recipe 2>&1 | tail -1`
Expected: vẫn "không có mã mạng" (bốn lớp, kể cả "binary không nhập hàm socket" và cây phụ thuộc Windows không có `Win32_Networking`; hai feature mới là `Win32_Storage_*`). Không commit.

---

### Task 7: `speaker-ops`, gom tình trạng, báo cáo và chấm kiểm tra tự động

Hai module thuần. `health`: `Health` (năm tình trạng), `Tracker` (nhận từng `ReaderState`, cộng thời gian theo ngày, app, phiên bản, tình trạng, trần mỗi khoảng 3 giờ), `Ledger` (sổ lưu JSON), `due` (ngày đã qua, chưa gửi, từ một phút), `report_json` (thân `speaker_health`, danh sách cho phép: chuỗi lạ là lỗi và không có báo cáo), `sanitize_patterns`. `canary`: `Turn`, `Frame`, `Run`, `judge` (đạt khi ≥ 90% lượt nói đúng và ≤ 5% lượt đọc sai; xử lý lệch thời gian của chỉ báo, nói chồng, người vừa nói xong; chọn `no_names`/`no_speaking`/`blocked`), `entry`.

**Files:**
- Create: `crates/speaker-ops/src/health.rs`, `crates/speaker-ops/src/canary.rs`
- Modify: `crates/speaker-ops/src/lib.rs`

- [ ] **Step 1: Module `health`**

Tạo `crates/speaker-ops/src/health.rs`:

```rust
//! Gom trạng thái bộ đọc tên thành báo cáo tình trạng `speaker_health` (spec 2026-10-26-phan-biet-nguoi-noi §7.2).
//!
//! - [`Tracker`] nhận từng `ReaderState` của worker (đổi mới gửi) và cộng thời gian theo (ngày UTC, app họp, phiên bản app họp,
//!   trạng thái) vào [`Ledger`]; sổ này lưu trên máy (JSON) để báo cáo của một ngày gửi được sau khi ngày đó qua, kể cả khi app đã
//!   thoát. Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp): [`Tracker::due`] chỉ trả ngày đã qua và chưa gửi.
//! - [`report_json`] dựng thân báo cáo gửi tới `POST /v1/diagnostics` (`kind = "speaker_health"`). **Không có tên người, không có
//!   chữ**: mọi chuỗi đi qua danh sách cho phép (phiên bản, mã hệ điều hành, vai trò và lớp của chỉ báo tự học); chuỗi không hợp lệ
//!   là lỗi và không có báo cáo (đóng cửa khi nghi ngờ). App còn chạy bộ che và bộ kiểm cuối của báo cáo lỗi trên cả chuỗi JSON.
//!
//! Tính phút: `minutes.total` là thời gian bộ đọc có app họp và không nghỉ (`Ok`, `NoNames`, `NoSpeaking`, `NoPermission`,
//! `Blocked`); `minutes.ok` chỉ tính `Ok` (có tên và có chỉ báo "đang nói"). `Off`, `NoMeeting`, `Paused` không tính.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use speaker_protocol::{
    LearnedPattern, MAX_LEARNED_PATTERNS, MAX_PATTERN_CLASSES, MAX_PATTERN_PATH, MAX_PATTERN_STATES,
    MAX_PATTERN_TOKEN_BYTES, MeetingApp, PatternState, ReaderStatus,
};

/// Báo cáo chỉ gửi cho mục có ít nhất chừng này thời gian đọc (tránh nhiễu từ lần mở app họp vài giây).
pub const MIN_REPORT_MS: u64 = 60_000;
/// Một khoảng giữa hai `ReaderState` tính tối đa chừng này (máy ngủ giữa phiên không làm phút phình ra).
pub const MAX_INTERVAL_MS: u64 = 3 * 3_600_000;
/// Sổ giữ chừng này ngày gần nhất.
pub const KEEP_DAYS: i64 = 7;
pub const DAY_MS: u64 = 86_400_000;
/// Thân báo cáo tối đa chừng này byte.
pub const MAX_REPORT_BYTES: usize = 4096;

/// Tình trạng của bộ đọc trong một khoảng thời gian (spec §7.2). Thứ tự khai báo là thứ tự nặng dần (dùng khi hai trạng thái bằng
/// thời gian).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Health {
    Ok,
    NoPermission,
    NoSpeaking,
    NoNames,
    Blocked,
}

impl Health {
    pub fn as_str(self) -> &'static str {
        match self {
            Health::Ok => "ok",
            Health::NoPermission => "no_permission",
            Health::NoSpeaking => "no_speaking",
            Health::NoNames => "no_names",
            Health::Blocked => "blocked",
        }
    }

    /// Trạng thái bộ đọc của worker thành tình trạng; `None` với `Off`, `NoMeeting`, `Paused` (không tính thời gian).
    pub fn of(state: ReaderStatus) -> Option<Self> {
        match state {
            ReaderStatus::Ok => Some(Health::Ok),
            ReaderStatus::NoNames => Some(Health::NoNames),
            ReaderStatus::NoSpeaking => Some(Health::NoSpeaking),
            ReaderStatus::NoPermission => Some(Health::NoPermission),
            ReaderStatus::Blocked => Some(Health::Blocked),
            ReaderStatus::Off | ReaderStatus::NoMeeting | ReaderStatus::Paused => None,
        }
    }

    /// Hỏng do công thức hay app họp đổi (khác `NoPermission`, là việc của người dùng): tính vào ngưỡng cảnh báo của server.
    pub fn broken(self) -> bool {
        matches!(self, Health::NoNames | Health::NoSpeaking | Health::Blocked)
    }
}

/// Thời gian của một cặp (app họp, phiên bản app họp) trong một ngày.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Entry {
    pub app: MeetingApp,
    pub app_version: Option<String>,
    /// Mili giây theo tình trạng.
    pub ms: BTreeMap<Health, u64>,
    /// Số phiên bản công thức lớn nhất đã thấy trong ngày.
    pub recipe_version: u32,
    /// Số chỉ báo tự học lớn nhất đã thấy trong ngày.
    pub learned: u32,
    /// Mô tả chỉ báo tự học (không trùng nhau, tối đa `MAX_LEARNED_PATTERNS`).
    pub patterns: Vec<LearnedPattern>,
}

impl Entry {
    pub fn new(app: MeetingApp, app_version: Option<String>) -> Self {
        Self {
            app,
            app_version,
            ms: BTreeMap::new(),
            recipe_version: 0,
            learned: 0,
            patterns: Vec::new(),
        }
    }

    pub fn total_ms(&self) -> u64 {
        self.ms.values().sum()
    }

    pub fn ok_ms(&self) -> u64 {
        self.ms.get(&Health::Ok).copied().unwrap_or(0)
    }

    /// Tình trạng chiếm nhiều thời gian nhất; bằng nhau thì tình trạng nặng hơn.
    pub fn dominant(&self) -> Option<Health> {
        self.ms
            .iter()
            .filter(|(_, ms)| **ms > 0)
            .max_by_key(|(h, ms)| (**ms, **h))
            .map(|(h, _)| *h)
    }
}

fn app_str(app: MeetingApp) -> &'static str {
    match app {
        MeetingApp::Teams => "teams",
        MeetingApp::Zoom => "zoom",
        MeetingApp::MeetChrome => "meet_chrome",
        MeetingApp::MeetEdge => "meet_edge",
    }
}

/// Khóa của cặp (app họp, phiên bản app họp) trong sổ.
pub fn entry_key(app: MeetingApp, version: Option<&str>) -> String {
    format!("{}|{}", app_str(app), version.unwrap_or("?"))
}

/// Sổ trên máy: ngày UTC (số ngày từ 1970-01-01) → khóa → mục; kèm các (ngày, khóa) đã gửi.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Ledger {
    #[serde(default)]
    pub days: BTreeMap<i64, BTreeMap<String, Entry>>,
    #[serde(default)]
    pub sent: BTreeSet<String>,
}

/// Một `ReaderState` của worker (không có tên người).
#[derive(Clone, Debug, PartialEq)]
pub struct Reading {
    pub app: Option<MeetingApp>,
    pub app_version: Option<String>,
    pub state: ReaderStatus,
    pub recipe_version: u32,
    pub learned: u32,
    pub patterns: Vec<LearnedPattern>,
}

struct Open {
    since_ms: u64,
    app: MeetingApp,
    app_version: Option<String>,
    health: Health,
    recipe_version: u32,
    learned: u32,
    patterns: Vec<LearnedPattern>,
}

/// Một mục đến hạn gửi.
#[derive(Clone, Debug, PartialEq)]
pub struct Due {
    pub day: i64,
    pub key: String,
    pub entry: Entry,
}

pub struct Tracker {
    ledger: Ledger,
    open: Option<Open>,
    dirty: bool,
}

impl Tracker {
    pub fn new(ledger: Ledger) -> Self {
        Self {
            ledger,
            open: None,
            dirty: false,
        }
    }

    pub fn ledger(&self) -> &Ledger {
        &self.ledger
    }

    /// Sổ có đổi từ lần gọi trước không (để ghi xuống đĩa); đặt lại cờ.
    pub fn take_dirty(&mut self) -> bool {
        std::mem::take(&mut self.dirty)
    }

    /// Một `ReaderState` tới lúc `at_ms` (giờ Unix, ms): đóng khoảng đang mở rồi mở khoảng mới nếu trạng thái có tính thời gian.
    pub fn observe(&mut self, at_ms: u64, reading: Reading) {
        self.close(at_ms);
        let (Some(app), Some(health)) = (reading.app, Health::of(reading.state)) else {
            return;
        };
        self.open = Some(Open {
            since_ms: at_ms,
            app,
            app_version: reading.app_version,
            health,
            recipe_version: reading.recipe_version,
            learned: reading.learned,
            patterns: reading.patterns,
        });
    }

    /// Phiên dừng hay worker thoát: đóng khoảng đang mở.
    pub fn close(&mut self, at_ms: u64) {
        let Some(open) = self.open.take() else {
            return;
        };
        let dur = at_ms.saturating_sub(open.since_ms).min(MAX_INTERVAL_MS);
        let day = i64::try_from(at_ms / DAY_MS).unwrap_or(i64::MAX);
        let key = entry_key(open.app, open.app_version.as_deref());
        let entry = self
            .ledger
            .days
            .entry(day)
            .or_default()
            .entry(key)
            .or_insert_with(|| Entry::new(open.app, open.app_version.clone()));
        *entry.ms.entry(open.health).or_insert(0) += dur;
        entry.recipe_version = entry.recipe_version.max(open.recipe_version);
        entry.learned = entry.learned.max(open.learned);
        for p in open.patterns {
            if entry.patterns.len() < MAX_LEARNED_PATTERNS && !entry.patterns.contains(&p) {
                entry.patterns.push(p);
            }
        }
        self.dirty = true;
    }

    /// Các mục của ngày đã qua (`day < today`) chưa gửi và đủ [`MIN_REPORT_MS`], cũ nhất trước.
    pub fn due(&self, today: i64) -> Vec<Due> {
        let mut out = Vec::new();
        for (day, entries) in self.ledger.days.range(..today) {
            for (key, entry) in entries {
                if entry.total_ms() >= MIN_REPORT_MS && !self.ledger.sent.contains(&format!("{day}|{key}")) {
                    out.push(Due {
                        day: *day,
                        key: key.clone(),
                        entry: entry.clone(),
                    });
                }
            }
        }
        out
    }

    /// Đã gửi (hay bỏ hẳn) mục này: không gửi lại.
    pub fn mark_sent(&mut self, day: i64, key: &str) {
        if self.ledger.sent.insert(format!("{day}|{key}")) {
            self.dirty = true;
        }
    }

    /// Bỏ ngày cũ hơn [`KEEP_DAYS`] (kể cả dấu đã gửi của ngày đó).
    pub fn prune(&mut self, today: i64) {
        let cutoff = today - KEEP_DAYS;
        let before = (self.ledger.days.len(), self.ledger.sent.len());
        self.ledger.days.retain(|d, _| *d >= cutoff);
        self.ledger.sent.retain(|s| {
            s.split('|')
                .next()
                .and_then(|d| d.parse::<i64>().ok())
                .is_some_and(|d| d >= cutoff)
        });
        if before != (self.ledger.days.len(), self.ledger.sent.len()) {
            self.dirty = true;
        }
    }

    /// Người dùng tắt "Gửi báo cáo lỗi": bỏ cả sổ và khoảng đang mở.
    pub fn clear(&mut self) {
        self.ledger = Ledger::default();
        self.open = None;
        self.dirty = true;
    }
}

/// Thông tin app và máy trong báo cáo (không có gói, ngôn ngữ, phần cứng).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Facts {
    pub app_version: String,
    /// `release` hay `debug`.
    pub build: &'static str,
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub device_id_hash: String,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum BuildError {
    #[error("trường không hợp lệ: {0}")]
    Invalid(&'static str),
}

/// Chuỗi chỉ gồm chữ, số, `.`, `_`, `+`, `-` và khoảng trắng, dài 1–`max` ký tự: phiên bản và tên hệ điều hành.
fn plain(text: &str, max: usize) -> bool {
    !text.is_empty()
        && text.len() <= max
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '+' | '-' | ' '))
}

fn hash64(text: &str) -> bool {
    text.len() == 64 && text.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
}

/// Một lớp hay vai trò dùng được trong báo cáo: 1–32 byte của `[A-Za-z0-9_-]`, không có dãy từ 5 chữ số liền nhau (loại mã số
/// hay id kiểu `roster-avatar-img-12345678`).
fn token_ok(text: &str) -> bool {
    let mut run = 0;
    for c in text.chars() {
        if c.is_ascii_digit() {
            run += 1;
            if run >= 5 {
                return false;
            }
        } else {
            run = 0;
        }
    }
    !text.is_empty()
        && text.len() <= MAX_PATTERN_TOKEN_BYTES
        && text
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
}

/// Lọc mô tả chỉ báo tự học: bỏ lớp, vai trò không qua danh sách cho phép; mẫu không còn vai trò hợp lệ thì bỏ cả mẫu.
pub fn sanitize_patterns(list: &[LearnedPattern]) -> Vec<LearnedPattern> {
    list.iter()
        .filter(|p| p.role.chars().all(|c| c.is_ascii_alphabetic()) && token_ok(&p.role))
        .take(MAX_LEARNED_PATTERNS)
        .map(|p| LearnedPattern {
            role: p.role.clone(),
            path: p.path.iter().copied().take(MAX_PATTERN_PATH).collect(),
            states: p
                .states
                .iter()
                .take(MAX_PATTERN_STATES)
                .map(|s| PatternState {
                    subrole: if token_ok(&s.subrole) {
                        s.subrole.clone()
                    } else {
                        String::new()
                    },
                    classes: s
                        .classes
                        .iter()
                        .filter(|c| token_ok(c))
                        .take(MAX_PATTERN_CLASSES)
                        .cloned()
                        .collect(),
                })
                .collect(),
        })
        .collect()
}

/// Ngày dương lịch (năm, tháng, ngày) của số ngày từ 1970-01-01 (thuật toán `civil_from_days` của Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

/// `YYYY-MM-DD` của ngày UTC thứ `day` từ 1970-01-01.
pub fn day_string(day: i64) -> String {
    let (y, m, d) = civil_from_days(day);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Số ngày UTC từ 1970-01-01 của một thời điểm Unix tính bằng giây.
pub fn day_of_unix_secs(secs: i64) -> i64 {
    secs.div_euclid(86_400)
}

fn minutes(ms: u64) -> u64 {
    (ms + 30_000) / 60_000
}

/// Thân báo cáo `speaker_health` của một mục (spec §7.2). Lỗi nếu bất kỳ chuỗi nào ngoài danh sách cho phép: không có báo cáo.
pub fn report_json(facts: &Facts, day: i64, entry: &Entry, canary: bool) -> Result<String, BuildError> {
    let bad = BuildError::Invalid;
    if !plain(&facts.app_version, 40) {
        return Err(bad("app.version"));
    }
    if facts.build != "release" && facts.build != "debug" {
        return Err(bad("build"));
    }
    if !plain(&facts.os_name, 32) || !plain(&facts.os_version, 64) || !plain(&facts.arch, 16) {
        return Err(bad("os"));
    }
    if !hash64(&facts.device_id_hash) {
        return Err(bad("device_id_hash"));
    }
    if let Some(v) = &entry.app_version
        && !plain(v, 40)
    {
        return Err(bad("meeting.version"));
    }
    let state = entry.dominant().ok_or(bad("state"))?;
    let total = minutes(entry.total_ms());
    let ok = minutes(entry.ok_ms()).min(total);
    let patterns = sanitize_patterns(&entry.patterns);
    let json = serde_json::json!({
        "v": 1,
        "kind": "speaker_health",
        "day": day_string(day),
        "canary": canary,
        "build": facts.build,
        "app": { "version": facts.app_version },
        "os": { "name": facts.os_name, "version": facts.os_version, "arch": facts.arch },
        "meeting": { "app": app_str(entry.app), "version": entry.app_version },
        "recipe_version": entry.recipe_version,
        "state": state.as_str(),
        "minutes": { "ok": ok, "total": total },
        "learned": entry.learned,
        "patterns": patterns,
        "device_id_hash": facts.device_id_hash,
    })
    .to_string();
    if json.len() > MAX_REPORT_BYTES {
        return Err(bad("quá lớn"));
    }
    Ok(json)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const T0: u64 = 20_752 * DAY_MS + 10 * 3_600_000; // 2026-10-26 10:00 UTC
    const MIN: u64 = 60_000;

    fn reading(app: Option<MeetingApp>, state: ReaderStatus) -> Reading {
        Reading {
            app,
            app_version: Some("26032.1100".into()),
            state,
            recipe_version: 2,
            learned: 0,
            patterns: vec![],
        }
    }

    fn facts() -> Facts {
        Facts {
            app_version: "0.3.2".into(),
            build: "release",
            os_name: "macos".into(),
            os_version: "15.6.1".into(),
            arch: "aarch64".into(),
            device_id_hash: "a".repeat(64),
        }
    }

    fn pattern() -> LearnedPattern {
        LearnedPattern {
            role: "AXGroup".into(),
            path: vec![2, 0],
            states: vec![
                PatternState {
                    subrole: String::new(),
                    classes: vec!["vdi-frame-occlusion".into()],
                },
                PatternState {
                    subrole: String::new(),
                    classes: vec![],
                },
            ],
        }
    }

    #[test]
    fn time_is_added_by_state_and_only_for_states_that_count() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::NoMeeting));
        t.observe(T0 + 5 * MIN, reading(Some(MeetingApp::Teams), ReaderStatus::NoNames));
        t.observe(T0 + 8 * MIN, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.observe(T0 + 18 * MIN, reading(None, ReaderStatus::Paused));
        t.observe(
            T0 + 20 * MIN,
            reading(Some(MeetingApp::Teams), ReaderStatus::NoSpeaking),
        );
        t.close(T0 + 21 * MIN);
        let day = (T0 / DAY_MS) as i64;
        let e = &t.ledger().days[&day]["teams|26032.1100"];
        assert_eq!(e.ms[&Health::NoNames], 3 * MIN);
        assert_eq!(e.ms[&Health::Ok], 10 * MIN);
        assert_eq!(e.ms[&Health::NoSpeaking], MIN);
        assert_eq!(e.total_ms(), 14 * MIN, "NoMeeting và Paused không tính");
        assert_eq!(e.ok_ms(), 10 * MIN);
        assert_eq!(e.dominant(), Some(Health::Ok));
        assert_eq!(e.recipe_version, 2);
    }

    #[test]
    fn a_long_gap_is_capped_and_a_clock_going_back_adds_nothing() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Zoom), ReaderStatus::Ok));
        t.close(T0 + 10 * 3_600_000);
        let day = (T0 / DAY_MS) as i64;
        assert_eq!(t.ledger().days[&day]["zoom|26032.1100"].total_ms(), MAX_INTERVAL_MS);
        t.observe(T0, reading(Some(MeetingApp::Zoom), ReaderStatus::Ok));
        t.close(T0 - MIN);
        assert_eq!(t.ledger().days[&day]["zoom|26032.1100"].total_ms(), MAX_INTERVAL_MS);
    }

    #[test]
    fn ties_go_to_the_worse_state() {
        let mut e = Entry::new(MeetingApp::Teams, None);
        e.ms.insert(Health::Ok, 5 * MIN);
        e.ms.insert(Health::NoNames, 5 * MIN);
        assert_eq!(e.dominant(), Some(Health::NoNames));
        e.ms.insert(Health::Blocked, 5 * MIN);
        assert_eq!(e.dominant(), Some(Health::Blocked));
        assert_eq!(Entry::new(MeetingApp::Teams, None).dominant(), None);
    }

    #[test]
    fn broken_means_the_recipe_or_the_app_changed_not_the_user() {
        let broken: Vec<_> = [
            Health::Ok,
            Health::NoPermission,
            Health::NoSpeaking,
            Health::NoNames,
            Health::Blocked,
        ]
        .into_iter()
        .filter(|h| h.broken())
        .collect();
        assert_eq!(broken, [Health::NoSpeaking, Health::NoNames, Health::Blocked]);
    }

    /// Mỗi ngày một báo cáo cho mỗi cặp (app họp, phiên bản): chỉ ngày đã qua, chưa gửi, đủ một phút.
    #[test]
    fn only_finished_days_unsent_and_long_enough_are_due() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.observe(T0 + 30 * MIN, reading(Some(MeetingApp::Zoom), ReaderStatus::NoNames));
        t.observe(
            T0 + 30 * MIN + 30_000,
            reading(Some(MeetingApp::MeetChrome), ReaderStatus::Ok),
        );
        t.close(T0 + 40 * MIN);
        let day = (T0 / DAY_MS) as i64;
        assert!(t.due(day).is_empty(), "ngày hôm nay chưa gửi");
        let due = t.due(day + 1);
        assert_eq!(due.len(), 2, "Zoom chỉ 30 giây: dưới một phút");
        assert_eq!(due[0].key, "meet_chrome|26032.1100");
        assert_eq!(due[1].key, "teams|26032.1100");
        t.mark_sent(day, "teams|26032.1100");
        assert_eq!(t.due(day + 1).len(), 1);
        t.mark_sent(day, "teams|26032.1100");
        assert!(t.take_dirty());
        assert!(!t.take_dirty());
    }

    #[test]
    fn old_days_are_pruned_with_their_sent_marks() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.close(T0 + 5 * MIN);
        let day = (T0 / DAY_MS) as i64;
        t.mark_sent(day, "teams|26032.1100");
        t.prune(day + KEEP_DAYS);
        assert_eq!(t.ledger().days.len(), 1);
        t.prune(day + KEEP_DAYS + 1);
        assert!(t.ledger().days.is_empty() && t.ledger().sent.is_empty());
    }

    #[test]
    fn the_ledger_survives_json_and_garbage_is_not_trusted() {
        let mut t = Tracker::new(Ledger::default());
        let mut r = reading(Some(MeetingApp::Teams), ReaderStatus::Ok);
        r.patterns = vec![pattern()];
        r.learned = 1;
        t.observe(T0, r);
        t.close(T0 + 5 * MIN);
        let json = serde_json::to_string(t.ledger()).unwrap();
        let back: Ledger = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, t.ledger());
        assert!(serde_json::from_str::<Ledger>("{\"days\":{\"x\":1}}").is_err());
        assert_eq!(serde_json::from_str::<Ledger>("{}").unwrap(), Ledger::default());
    }

    #[test]
    fn clearing_forgets_everything() {
        let mut t = Tracker::new(Ledger::default());
        t.observe(T0, reading(Some(MeetingApp::Teams), ReaderStatus::Ok));
        t.close(T0 + 5 * MIN);
        t.clear();
        assert_eq!(t.ledger(), &Ledger::default());
        t.close(T0 + 6 * MIN);
        assert_eq!(t.ledger(), &Ledger::default(), "khoảng đang mở cũng đã bỏ");
    }

    #[test]
    fn days_are_written_as_utc_dates() {
        assert_eq!(day_string(0), "1970-01-01");
        assert_eq!(day_string(20_753), "2026-10-27");
        assert_eq!(day_string(19_782), "2024-02-29");
        assert_eq!(day_string(-1), "1969-12-31");
        assert_eq!(day_of_unix_secs(1_793_059_200), 20_753);
        assert_eq!(day_of_unix_secs(1_793_059_199), 20_752);
    }

    fn entry() -> Entry {
        let mut e = Entry::new(MeetingApp::Teams, Some("26032.1100".into()));
        e.ms.insert(Health::Ok, 9 * MIN + 40_000);
        e.ms.insert(Health::NoNames, 2 * MIN);
        e.recipe_version = 2;
        e.learned = 1;
        e.patterns = vec![pattern()];
        e
    }

    #[test]
    fn the_report_has_exactly_the_agreed_fields() {
        let json = report_json(&facts(), 20_752, &entry(), false).unwrap();
        let v: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["day"], "2026-10-26");
        assert_eq!(v["canary"], false);
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 10, "total": 12}));
        assert_eq!(v["recipe_version"], 2);
        assert_eq!(v["learned"], 1);
        assert_eq!(v["patterns"][0]["role"], "AXGroup");
        assert_eq!(v["patterns"][0]["path"], serde_json::json!([2, 0]));
        let mut keys: Vec<_> = v.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "app",
                "build",
                "canary",
                "day",
                "device_id_hash",
                "kind",
                "learned",
                "meeting",
                "minutes",
                "os",
                "patterns",
                "recipe_version",
                "state",
                "v"
            ]
        );
        assert!(json.len() < MAX_REPORT_BYTES);
    }

    /// Báo cáo không bao giờ có chữ tự do: tên người, đường dẫn, email trong bất kỳ trường nào làm hỏng cả báo cáo.
    #[test]
    fn a_free_text_field_fails_the_whole_report() {
        let e = entry();
        let fail = |f: &Facts, e: &Entry| report_json(f, 20_752, e, false).unwrap_err();
        let mut f = facts();
        f.os_version = "15.6 /usr/local".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("os"));
        let mut f = facts();
        f.app_version = "Lan Nguyễn".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("app.version"));
        let mut f = facts();
        f.device_id_hash = "A".repeat(64);
        assert_eq!(fail(&f, &e), BuildError::Invalid("device_id_hash"));
        f.device_id_hash = "a@b.c".into();
        assert_eq!(fail(&f, &e), BuildError::Invalid("device_id_hash"));
        let mut e2 = entry();
        e2.app_version = Some("lan@example.com".into());
        assert_eq!(fail(&facts(), &e2), BuildError::Invalid("meeting.version"));
        let mut f = facts();
        f.build = "staging";
        assert_eq!(fail(&f, &e), BuildError::Invalid("build"));
        assert_eq!(
            fail(&facts(), &Entry::new(MeetingApp::Teams, None)),
            BuildError::Invalid("state"),
            "không có thời gian nào thì không có báo cáo"
        );
    }

    #[test]
    fn learned_patterns_keep_only_safe_tokens() {
        let mut p = pattern();
        p.states[0].classes = vec![
            "vdi-frame-occlusion".into(),
            "Lan Nguyễn".into(),
            "roster-avatar-img-12345678".into(),
            "a".repeat(MAX_PATTERN_TOKEN_BYTES + 1),
            "oZRSLe".into(),
            "lan@x.vn".into(),
        ];
        p.states[0].subrole = "Nguyễn".into();
        let bad_role = LearnedPattern {
            role: "AX Group".into(),
            ..pattern()
        };
        let digits_role = LearnedPattern {
            role: "AXGroup2".into(),
            ..pattern()
        };
        let clean = sanitize_patterns(&[p, bad_role, digits_role]);
        assert_eq!(clean.len(), 1, "vai trò có khoảng trắng hay chữ số bị bỏ cả mẫu");
        assert_eq!(clean[0].states[0].classes, ["vdi-frame-occlusion", "oZRSLe"]);
        assert_eq!(clean[0].states[0].subrole, "");
        assert!(speaker_protocol::patterns_fit(&clean));
    }

    #[test]
    fn a_tracker_never_keeps_more_than_four_patterns() {
        let mut t = Tracker::new(Ledger::default());
        for i in 0..6u16 {
            let mut r = reading(Some(MeetingApp::Teams), ReaderStatus::Ok);
            r.patterns = vec![LearnedPattern {
                role: "AXGroup".into(),
                path: vec![i],
                states: vec![],
            }];
            t.observe(T0 + u64::from(i) * MIN, r);
        }
        t.close(T0 + 7 * MIN);
        let day = (T0 / DAY_MS) as i64;
        assert_eq!(
            t.ledger().days[&day]["teams|26032.1100"].patterns.len(),
            MAX_LEARNED_PATTERNS
        );
    }

    #[test]
    fn the_canary_flag_is_carried() {
        let json = report_json(&facts(), 20_752, &entry(), true).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&json).unwrap()["canary"], true);
    }
}
```

- [ ] **Step 2: Module `canary`**

Tạo `crates/speaker-ops/src/canary.rs`:

```rust
//! Chấm một lượt kiểm tra tự động hằng ngày (spec 2026-10-26-phan-biet-nguoi-noi §7.3): các khách chạy theo một lịch nói đã biết
//! (`Turn`), bộ đọc thật đọc cửa sổ họp của app thật, và ở mỗi lượt đọc ta biết những người đang được báo "đang nói" (`Frame`).
//! Kiểm tra này đo đúng thứ vỡ khi Teams, Meet, Zoom đổi giao diện: đọc được tên và chỉ báo "đang nói" đúng người.
//!
//! Luật chấm (cùng mức A-spk3 của spec §12: đúng ≥ 90%, sai ≤ 5%):
//! - Chỉ báo của app trễ so với lúc nói ([`Params::shift_ms`], mặc định 0,6 s): lượt đọc lúc `t` ứng với lúc nói `t − shift`.
//! - Một lượt nói đạt khi ≥ [`Params::min_cover`] (60%) số lượt đọc nằm trong nó báo đúng người nói. Ở chỗ nói chồng, mọi người đang
//!   nói đều là đáp án hợp lệ.
//! - Báo sai là có người **không** nói báo "đang nói" ở lượt đọc nằm trong một lượt nói hay khi im hẳn; người vừa nói xong trong
//!   [`Params::tail_ms`] trước đó thì không tính là sai (Zoom giữ người nói trước thêm 2,5–3,5 s, spec §3; Teams tắt chỉ báo trễ).
//! - Đạt toàn lượt kiểm khi ≥ 90% số lượt nói đạt và tỉ lệ báo sai ≤ 5%.
//! - Không đạt thì tình trạng ghi nhận: không thấy ô người tham dự nào → `no_names`; thấy ô mà không bao giờ có ai "đang nói" →
//!   `no_speaking`; app họp không trả lời đa số lượt đọc → `blocked`; còn lại (có chỉ báo nhưng sai người hay thiếu) → `no_speaking`.

use speaker_protocol::MeetingApp;

use crate::health::{Entry, Health};

/// Một lượt nói trong lịch: khách `who` (tên hiển thị trong cuộc họp thử) nói từ `start_ms` tới `end_ms` (giờ Unix, ms).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Turn {
    pub who: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

/// Một lượt đọc của bộ đọc: lúc `at_ms`, những người đang được báo "đang nói".
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Frame {
    pub at_ms: i64,
    pub speaking: Vec<String>,
}

/// Tóm tắt của cả lượt chạy bộ đọc (ngoài các `Frame`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Run {
    /// Số lượt đọc có ít nhất một ô người tham dự.
    pub passes_with_tiles: u32,
    /// Số lượt đọc app họp không trả lời (`Blocked`).
    pub passes_blocked: u32,
    /// Tổng số lượt đọc.
    pub passes: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Params {
    pub shift_ms: i64,
    pub tail_ms: i64,
    pub min_cover: f64,
    pub ok_turns: f64,
    pub max_wrong: f64,
    /// Ít hơn chừng này lượt nói thì kết quả không có nghĩa (lịch hỏng): lỗi, không phải tình trạng của app.
    pub min_turns: usize,
}

impl Default for Params {
    fn default() -> Self {
        Self {
            shift_ms: 600,
            tail_ms: 3_500,
            min_cover: 0.6,
            ok_turns: 0.9,
            max_wrong: 0.05,
            min_turns: 4,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Score {
    pub turns: u32,
    pub turns_ok: u32,
    /// Số lượt đọc đã xét và số lượt có người báo sai.
    pub judged: u32,
    pub wrong: u32,
}

impl Score {
    pub fn turn_ratio(&self) -> f64 {
        if self.turns == 0 {
            0.0
        } else {
            f64::from(self.turns_ok) / f64::from(self.turns)
        }
    }

    pub fn wrong_ratio(&self) -> f64 {
        if self.judged == 0 {
            0.0
        } else {
            f64::from(self.wrong) / f64::from(self.judged)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Verdict {
    pub health: Health,
    pub score: Score,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum CanaryError {
    #[error("lịch chỉ có {0} lượt nói, cần ít nhất {1}")]
    TooFewTurns(usize, usize),
    #[error("lượt nói {0} có thời gian không hợp lệ")]
    BadTurn(usize),
}

/// Chấm một lượt kiểm tra. `turns`: lịch nói; `frames`: các lượt đọc (không cần đúng thứ tự); `run`: tóm tắt của bộ đọc.
pub fn judge(turns: &[Turn], frames: &[Frame], run: Run, p: &Params) -> Result<Verdict, CanaryError> {
    if turns.len() < p.min_turns {
        return Err(CanaryError::TooFewTurns(turns.len(), p.min_turns));
    }
    if let Some(i) = turns.iter().position(|t| t.end_ms <= t.start_ms || t.who.is_empty()) {
        return Err(CanaryError::BadTurn(i));
    }
    // Người hợp lệ ở lượt đọc lúc `t`: đang nói, hay vừa nói xong trong `tail_ms` trước đó.
    let allowed_at = |t: i64| -> Vec<&Turn> {
        turns
            .iter()
            .filter(|u| (u.start_ms..u.end_ms + p.tail_ms).contains(&(t - p.shift_ms)))
            .collect()
    };
    let mut turns_ok = 0;
    for turn in turns {
        let inside: Vec<&Frame> = frames
            .iter()
            .filter(|f| (turn.start_ms..turn.end_ms).contains(&(f.at_ms - p.shift_ms)))
            .collect();
        let right = inside.iter().filter(|f| f.speaking.contains(&turn.who)).count();
        if !inside.is_empty() && right as f64 / inside.len() as f64 >= p.min_cover {
            turns_ok += 1;
        }
    }
    let (mut judged, mut wrong) = (0, 0);
    for f in frames {
        let allowed = allowed_at(f.at_ms);
        judged += 1;
        if f.speaking.iter().any(|n| !allowed.iter().any(|u| u.who == *n)) {
            wrong += 1;
        }
    }
    let score = Score {
        turns: turns.len() as u32,
        turns_ok,
        judged,
        wrong,
    };
    let anyone_spoke = frames.iter().any(|f| !f.speaking.is_empty());
    let health = if run.passes > 0 && run.passes_blocked * 2 > run.passes {
        Health::Blocked
    } else if run.passes_with_tiles == 0 {
        Health::NoNames
    } else if !anyone_spoke {
        Health::NoSpeaking
    } else if score.turn_ratio() >= p.ok_turns && score.wrong_ratio() <= p.max_wrong {
        Health::Ok
    } else {
        Health::NoSpeaking
    };
    Ok(Verdict { health, score })
}

/// Mục tình trạng của một lượt kiểm tra (để dựng báo cáo `speaker_health` có `canary = true`): toàn bộ thời gian chạy tính theo
/// tình trạng đã chấm.
pub fn entry(
    verdict: &Verdict,
    duration_ms: u64,
    app: MeetingApp,
    app_version: Option<String>,
    recipe_version: u32,
) -> Entry {
    let mut e = Entry::new(app, app_version);
    e.ms.insert(verdict.health, duration_ms);
    e.recipe_version = recipe_version;
    e
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: i64 = 1_793_059_200_000;

    fn turn(who: &str, from_s: i64, to_s: i64) -> Turn {
        Turn {
            who: who.into(),
            start_ms: T0 + from_s * 1_000,
            end_ms: T0 + to_s * 1_000,
        }
    }

    /// Hai khách nói lần lượt (4 lượt), rồi nói chồng.
    fn schedule() -> Vec<Turn> {
        vec![
            turn("Khach A", 0, 6),
            turn("Khach B", 8, 14),
            turn("Khach A", 16, 22),
            turn("Khach B", 24, 30),
            turn("Khach A", 32, 40),
            turn("Khach B", 34, 42),
        ]
    }

    /// Chỉ báo hoàn hảo: lượt đọc mỗi 0,25 s, báo đúng người đang nói (trễ 0,6 s), im ngoài lúc nói.
    fn frames_of(turns: &[Turn], tweak: impl Fn(i64, Vec<String>) -> Vec<String>) -> Vec<Frame> {
        (0..46_000 / 250)
            .map(|i| {
                let at = T0 + i * 250;
                let speaking: Vec<String> = turns
                    .iter()
                    .filter(|t| (t.start_ms..t.end_ms).contains(&(at - 600)))
                    .map(|t| t.who.clone())
                    .collect();
                Frame {
                    at_ms: at,
                    speaking: tweak(at, speaking),
                }
            })
            .collect()
    }

    fn run() -> Run {
        Run {
            passes_with_tiles: 180,
            passes_blocked: 0,
            passes: 184,
        }
    }

    #[test]
    fn a_perfect_reader_passes() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, s| s), run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::Ok);
        assert_eq!((v.score.turns, v.score.turns_ok, v.score.wrong), (6, 6, 0));
    }

    /// Zoom giữ người nói trước thêm vài giây sau khi im: không tính là sai.
    #[test]
    fn holding_the_previous_speaker_for_a_few_seconds_is_not_wrong() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, mut s| {
            let held = turns
                .iter()
                .filter(|t| (t.end_ms..t.end_ms + 3_000).contains(&(at - 600)))
                .map(|t| t.who.clone());
            s.extend(held);
            s.sort();
            s.dedup();
            s
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::Ok, "{:?}", v.score);
    }

    #[test]
    fn no_participant_tile_means_no_names() {
        let turns = schedule();
        let none = Run {
            passes_with_tiles: 0,
            passes_blocked: 0,
            passes: 184,
        };
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), none, &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoNames);
    }

    #[test]
    fn tiles_but_nobody_ever_speaking_means_no_speaking() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoSpeaking);
        assert_eq!(v.score.turns_ok, 0);
    }

    #[test]
    fn the_app_not_answering_means_blocked_before_anything_else() {
        let turns = schedule();
        let blocked = Run {
            passes_with_tiles: 10,
            passes_blocked: 100,
            passes: 184,
        };
        assert_eq!(
            judge(&turns, &frames_of(&turns, |_, s| s), blocked, &Params::default())
                .unwrap()
                .health,
            Health::Blocked
        );
        let half = Run {
            passes_with_tiles: 90,
            passes_blocked: 92,
            passes: 184,
        };
        assert_eq!(
            judge(&turns, &frames_of(&turns, |_, s| s), half, &Params::default())
                .unwrap()
                .health,
            Health::Ok,
            "đúng một nửa chưa là chặn"
        );
    }

    /// Chỉ báo đổi người: tên sai ở mọi lượt đọc.
    #[test]
    fn a_swapped_indicator_fails_on_both_counts() {
        let turns = schedule();
        let frames = frames_of(&turns, |_, s| {
            s.iter()
                .map(|n| {
                    if n == "Khach A" {
                        "Khach B".to_string()
                    } else {
                        "Khach A".to_string()
                    }
                })
                .collect()
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!(v.health, Health::NoSpeaking);
        assert_eq!(
            v.score.turns_ok, 2,
            "chỉ hai lượt nói chồng cuối còn đúng vì cả hai tên cùng hợp lệ: {:?}",
            v.score
        );
        assert!(v.score.wrong_ratio() > 0.3, "{:?}", v.score);
    }

    /// Một lượt nói mất chỉ báo: dưới 60% số lượt đọc của một lượt nói thì lượt đó không đạt; 1 lượt hỏng trên 6 là dưới 90%.
    #[test]
    fn one_missed_turn_in_six_is_below_ninety_percent() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, s| {
            let in_second = (T0 + 8_000..T0 + 14_000).contains(&(at - 600));
            if in_second { vec![] } else { s }
        });
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert_eq!((v.score.turns_ok, v.score.turns), (5, 6));
        assert_eq!(v.health, Health::NoSpeaking);
    }

    #[test]
    fn a_stray_name_while_nobody_speaks_counts_as_wrong() {
        let turns = schedule();
        let frames = frames_of(&turns, |at, s| {
            if s.is_empty() && at > T0 + 50_000 {
                vec!["Khach A".into()]
            } else {
                s
            }
        });
        // Không có lượt đọc sau 50 s trong frames_of: thêm tay vài lượt im có người báo.
        let mut frames = frames;
        for i in 0..40 {
            frames.push(Frame {
                at_ms: T0 + 60_000 + i * 250,
                speaking: vec!["Khach A".into()],
            });
        }
        let v = judge(&turns, &frames, run(), &Params::default()).unwrap();
        assert!(v.score.wrong >= 40, "{:?}", v.score);
        assert_eq!(v.health, Health::NoSpeaking);
    }

    #[test]
    fn a_broken_schedule_is_an_error_not_a_verdict() {
        let turns = schedule();
        assert_eq!(
            judge(&turns[..3], &[], run(), &Params::default()),
            Err(CanaryError::TooFewTurns(3, 4))
        );
        let mut bad = schedule();
        bad[2].end_ms = bad[2].start_ms;
        assert_eq!(
            judge(&bad, &[], run(), &Params::default()),
            Err(CanaryError::BadTurn(2))
        );
        let mut nameless = schedule();
        nameless[0].who.clear();
        assert_eq!(
            judge(&nameless, &[], run(), &Params::default()),
            Err(CanaryError::BadTurn(0))
        );
    }

    #[test]
    fn the_report_entry_carries_the_verdict() {
        let turns = schedule();
        let v = judge(&turns, &frames_of(&turns, |_, _| vec![]), run(), &Params::default()).unwrap();
        let e = entry(&v, 300_000, MeetingApp::Teams, Some("26032.1100".into()), 2);
        assert_eq!(e.dominant(), Some(Health::NoSpeaking));
        assert_eq!(e.total_ms(), 300_000);
        assert_eq!(e.ok_ms(), 0);
        assert_eq!(e.recipe_version, 2);
    }
}
```

Thay `crates/speaker-ops/src/lib.rs` bằng bản đầy đủ:

```rust
//! Vận hành của "Phân biệt người nói" (spec 2026-10-26-phan-biet-nguoi-noi §7). Chỉ phần thuần, không mạng:
//!
//! - [`envelope`]: phong bì ký của công thức đọc tên (`format` và tiền tố ký riêng, tách khỏi manifest model);
//! - [`recipes`]: nhận hay từ chối một công thức tải về (chống quay lui, `min_app_version`), lưu trên máy;
//! - [`health`]: gom trạng thái bộ đọc thành báo cáo tình trạng, không có tên người;
//! - [`canary`]: chấm một lượt kiểm tra tự động (tên đọc được so với lịch nói đã biết).

#![forbid(unsafe_code)]

pub mod canary;
pub mod envelope;
pub mod health;
pub mod recipes;
```

- [ ] **Step 3: Chạy test**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p speaker-ops -- --check && cargo test -p speaker-ops 2>&1 | grep -E "^test result|FAILED|panicked" && cargo clippy -p speaker-ops --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `39 passed; 0 failed; 1 ignored` (`canary` 10, `envelope` 4, `health` 14, `recipes` 11); clippy `Finished`.

- [ ] **Step 4: Kiểm âm tính**

Trong `health::token_ok` bỏ khối đếm dãy chữ số (đoạn `if c.is_ascii_digit() { run += 1; … }`), rồi chạy `cargo test -p speaker-ops learned_patterns_keep_only_safe_tokens`: **đỏ** (id kiểu `roster-avatar-img-12345678` lọt vào báo cáo). Hoàn lại. Trong `canary::judge` đổi `score.wrong_ratio() <= p.max_wrong` thành `score.wrong_ratio() <= 1.0`, rồi `cargo test -p speaker-ops a_stray_name`: **đỏ** (một tên báo sai khi không ai nói không còn làm hỏng lượt kiểm tra). Hoàn lại.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short | wc -l`
Expected: tăng đúng hai file mới và một file sửa của Task này. Không commit.

---

### Task 8: App, sổ và gửi báo cáo tình trạng

`src-tauri/src/speaker/health.rs`: `Health` giữ `Tracker` và đường dẫn sổ; `observe` (mỗi `ReaderState`, từ `TauriSink::reader`), `close` (hết phiên, từ `speaker::session_ended`), `flush` (gửi báo cáo ngày đã qua qua `ReportApi` khi công tắc "Gửi báo cáo lỗi" bật và app rảnh; lỗi tạm dừng cả lượt, bị từ chối thì bỏ), `purge` (tắt công tắc thì xóa sổ và file). Dùng lại `Host` (`auto_enabled`, `translation_idle`, `facts`) và `HttpReportApi` của báo cáo lỗi: cùng điều kiện, cùng mã máy đã băm, cùng host (`api.aitranslator.vn`).

**Files:**
- Create: `src-tauri/src/speaker/health.rs`
- Modify: `src-tauri/src/speaker/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/session.rs`, `src-tauri/src/diagnostics/mod.rs`

- [ ] **Step 1: Nối vào app**

**Sửa `src-tauri/src/speaker/mod.rs`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
#[cfg(target_os = "macos")]
pub mod eui_macos;
```

Đoạn thêm vào:

```rust
pub mod health;
```

Thay đoạn:

```rust
pub fn session_ended<R: Runtime>(app: &AppHandle<R>) {
    if let Some(running) = app.try_state::<Running>()
```

bằng:

```rust
pub fn session_ended<R: Runtime>(app: &AppHandle<R>) {
    health::note_session_ended(app);
    if let Some(running) = app.try_state::<Running>()
```

**Sửa `src-tauri/src/lib.rs`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
    diagnostics::install(&handle)?;
```

Đoạn thêm vào:

```rust
    // Báo cáo tình trạng bộ đọc tên người nói (kế hoạch 06, spec §7.2): sổ trên máy và luồng gửi nền.
    speaker::health::install(&handle)?;
```

**Sửa `src-tauri/src/session.rs`:**

Thay đoạn:

```rust
        if let Some(view) = self
            .app
            .try_state::<TranscriptStore>()
            .and_then(|t| t.reader(self.session, info.state))
```

bằng:

```rust
        crate::speaker::health::note_reader(&self.app, info);
        if let Some(view) = self
            .app
            .try_state::<TranscriptStore>()
            .and_then(|t| t.reader(self.session, info.state))
```

**Sửa `src-tauri/src/diagnostics/mod.rs`:**

Thay đoạn:

```rust
/// Người dùng tắt báo cáo lỗi tự động (`actions::commit_settings`): bỏ các báo cáo đang chờ gửi.
pub fn purge_queue<R: Runtime>(app: &AppHandle<R>) {
    if let Some(reporter) = reporter_of(app) {
        reporter.purge();
    }
}
```

bằng:

```rust
/// Người dùng tắt báo cáo lỗi tự động (`actions::commit_settings`): bỏ các báo cáo đang chờ gửi, và sổ tình trạng bộ đọc tên (spec
/// 2026-10-26-phan-biet-nguoi-noi §7.2).
pub fn purge_queue<R: Runtime>(app: &AppHandle<R>) {
    if let Some(reporter) = reporter_of(app) {
        reporter.purge();
    }
    crate::speaker::health::purge(app);
}

/// Đọc cài đặt, trạng thái phiên và thông tin máy như báo cáo lỗi (`Host`), cho báo cáo tình trạng bộ đọc tên (`speaker::health`): cùng
/// công tắc "Gửi báo cáo lỗi", cùng điều kiện bản build, cùng mã máy đã băm.
pub fn host_of<R: Runtime>(app: &AppHandle<R>) -> Box<dyn Host> {
    Box::new(AppHost::new(app.clone(), auto_allowed_in_this_build()))
}
```


- [ ] **Step 2: Module `health`**

Tạo `src-tauri/src/speaker/health.rs`:

```rust
//! Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2; kế hoạch 06): nối `speaker_ops::health` với app.
//!
//! - Mỗi `ReaderState` của worker (qua `TauriSink::reader`) vào [`Health::observe`]; hết phiên thì [`Health::close`]. Sổ (số phút theo ngày,
//!   app họp, phiên bản app họp, tình trạng) lưu trên máy ([`LEDGER_FILE`], JSON) để báo cáo của một ngày gửi được sau khi ngày đó qua.
//! - Gửi qua `POST /v1/diagnostics` (`kind = "speaker_health"`) bằng đúng `HttpReportApi` của báo cáo lỗi, **chỉ khi** công tắc "Gửi báo
//!   cáo lỗi" đang bật (`Host::auto_enabled`, cùng điều kiện với báo cáo lỗi: Cài đặt › Quyền riêng tư) và app đang rảnh (không dịch).
//!   Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp); tắt công tắc thì sổ bị xóa ([`purge`]).
//! - Không có tên người, không có chữ: `speaker_ops::health::report_json` chỉ nhận chuỗi trong danh sách cho phép, rồi cả chuỗi JSON còn
//!   qua bộ kiểm cuối của báo cáo lỗi (`scrub::find_sensitive`); nghi ngờ thì bỏ báo cáo đó. Log chỉ có số đếm và tên quy tắc.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pipeline::speaker::ReaderInfo;
use speaker_ops::health::{self as ops, Facts, Ledger, Reading, Tracker};
use tauri::{AppHandle, Manager, Runtime};

use crate::diagnostics::report::Facts as ReportFacts;
use crate::diagnostics::reporter::Host;
use crate::diagnostics::scrub;
use crate::diagnostics::send::{HttpReportApi, ReportApi, SendError};

/// File sổ trong thư mục dữ liệu của app, tách theo loại build (bản dev và bản cài cùng thư mục dữ liệu, như `EUI_MARKER_FILE`).
pub const LEDGER_FILE: &str = ledger_file(cfg!(debug_assertions));

pub const fn ledger_file(debug: bool) -> &'static str {
    if debug {
        "speaker-health-dev.json"
    } else {
        "speaker-health.json"
    }
}

/// Chờ chừng này sau khi mở app rồi mới thử gửi lần đầu; sau đó thử mỗi [`FLUSH_EVERY`].
pub const FIRST_FLUSH_DELAY: Duration = Duration::from_secs(60);
pub const FLUSH_EVERY: Duration = Duration::from_secs(1800);

fn unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

/// Phần của thông tin máy mà báo cáo tình trạng dùng (không có gói, ngôn ngữ, phần cứng).
fn ops_facts(f: &ReportFacts) -> Facts {
    Facts {
        app_version: f.app_version.clone(),
        build: f.build,
        os_name: f.os_name.clone(),
        os_version: f.os_version.clone(),
        arch: f.arch.clone(),
        device_id_hash: f.device_id_hash.clone(),
    }
}

/// Sổ tình trạng của app: bộ gom (`Tracker`) cộng đường dẫn file.
pub struct Health {
    path: PathBuf,
    tracker: Mutex<Tracker>,
}

impl Health {
    /// Nạp sổ đã lưu; file hỏng hay không có thì sổ rỗng.
    pub fn load(path: PathBuf) -> Self {
        let ledger = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Ledger>(&b).ok())
            .unwrap_or_default();
        Self {
            path,
            tracker: Mutex::new(Tracker::new(ledger)),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Tracker> {
        self.tracker.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ghi sổ xuống đĩa nếu có đổi (ghi nguyên tử). Lỗi ghi chỉ ghi log: mất sổ chỉ là mất số liệu.
    fn persist(&self, tracker: &mut Tracker) {
        if !tracker.take_dirty() {
            return;
        }
        let write = || -> std::io::Result<()> {
            if let Some(dir) = self.path.parent() {
                std::fs::create_dir_all(dir)?;
            }
            let tmp = self.path.with_extension("json.tmp");
            std::fs::write(
                &tmp,
                serde_json::to_vec(tracker.ledger()).map_err(std::io::Error::other)?,
            )?;
            std::fs::rename(&tmp, &self.path)
        };
        if let Err(e) = write() {
            log::warn!("không ghi được sổ tình trạng bộ đọc tên: {e}");
        }
    }

    /// Một `ReaderState` của worker lúc `at_ms`.
    pub fn observe(&self, at_ms: u64, info: &ReaderInfo) {
        let mut t = self.lock();
        t.observe(
            at_ms,
            Reading {
                app: info.app,
                app_version: info.app_version.clone(),
                state: info.state,
                recipe_version: info.recipe_version,
                learned: info.learned,
                patterns: info.patterns.clone(),
            },
        );
        self.persist(&mut t);
    }

    /// Phiên dừng hay worker thoát: đóng khoảng đang mở.
    pub fn close(&self, at_ms: u64) {
        let mut t = self.lock();
        t.close(at_ms);
        self.persist(&mut t);
    }

    /// Gửi các báo cáo đến hạn (ngày đã qua, chưa gửi, đủ một phút), nếu công tắc bật và app rảnh. Trả số báo cáo đã gửi được.
    /// Lỗi tạm hay `429` thì dừng cả lượt (lần sau thử lại); bị từ chối hay không dựng được thì bỏ báo cáo đó (không gửi lại).
    pub fn flush(&self, host: &dyn Host, api: &dyn ReportApi, now_secs: i64) -> usize {
        if !host.auto_enabled() {
            return 0;
        }
        let Some(facts) = host.facts() else {
            return 0;
        };
        let facts = ops_facts(&facts);
        let today = ops::day_of_unix_secs(now_secs);
        let due = {
            let mut t = self.lock();
            t.prune(today);
            self.persist(&mut t);
            t.due(today)
        };
        let mut sent = 0;
        for d in due {
            if !host.translation_idle() {
                break;
            }
            let json = match ops::report_json(&facts, d.day, &d.entry, false) {
                Ok(json) => json,
                Err(e) => {
                    log::warn!("bỏ báo cáo tình trạng bộ đọc tên: {e}");
                    self.finish(d.day, &d.key);
                    continue;
                }
            };
            if let Some(rule) = scrub::find_sensitive(&json) {
                log::warn!("bỏ báo cáo tình trạng bộ đọc tên: còn mẫu nhạy cảm ({})", rule.as_str());
                self.finish(d.day, &d.key);
                continue;
            }
            match api.send(&json) {
                Ok(()) => {
                    self.finish(d.day, &d.key);
                    sent += 1;
                }
                Err(e @ (SendError::Transient(_) | SendError::RateLimited(_))) => {
                    log::info!("chưa gửi được báo cáo tình trạng bộ đọc tên: {e}");
                    break;
                }
                Err(e @ SendError::Rejected { .. }) => {
                    log::warn!("server từ chối báo cáo tình trạng bộ đọc tên: {e}");
                    self.finish(d.day, &d.key);
                }
            }
        }
        sent
    }

    fn finish(&self, day: i64, key: &str) {
        let mut t = self.lock();
        t.mark_sent(day, key);
        self.persist(&mut t);
    }

    /// Người dùng tắt "Gửi báo cáo lỗi": bỏ cả sổ (kể cả file).
    pub fn purge(&self) {
        let mut t = self.lock();
        t.clear();
        let _ = std::fs::remove_file(&self.path);
        t.take_dirty();
    }
}

/// Cài sổ lúc khởi động (`setup`, sau `diagnostics::install`): nạp sổ, và chạy luồng gửi nền.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let health = Arc::new(Health::load(app.path().app_local_data_dir()?.join(LEDGER_FILE)));
    app.manage(Arc::clone(&health));
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_FLUSH_DELAY);
        let api = HttpReportApi::for_this_build();
        loop {
            let host = crate::diagnostics::host_of(&app);
            let sent = health.flush(host.as_ref(), &api, i64::try_from(unix_ms() / 1000).unwrap_or(i64::MAX));
            if sent > 0 {
                log::info!("đã gửi {sent} báo cáo tình trạng bộ đọc tên");
            }
            std::thread::sleep(FLUSH_EVERY);
        }
    });
    Ok(())
}

fn health_of<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<Health>> {
    app.try_state::<Arc<Health>>().map(|h| Arc::clone(&h))
}

/// `ReaderState` mới của phiên (`TauriSink::reader`).
pub fn note_reader<R: Runtime>(app: &AppHandle<R>, info: &ReaderInfo) {
    if let Some(health) = health_of(app) {
        health.observe(unix_ms(), info);
    }
}

/// Phiên dừng (`speaker::session_ended`).
pub fn note_session_ended<R: Runtime>(app: &AppHandle<R>) {
    if let Some(health) = health_of(app) {
        health.close(unix_ms());
    }
}

/// Người dùng tắt báo cáo lỗi tự động (`diagnostics::purge_queue`): bỏ sổ tình trạng.
pub fn purge<R: Runtime>(app: &AppHandle<R>) {
    if let Some(health) = health_of(app) {
        health.purge();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use speaker_protocol::{LearnedPattern, MeetingApp, PatternState, ReaderStatus};

    const DAY: i64 = 20_752; // 2026-10-26
    const T0: u64 = DAY as u64 * ops::DAY_MS + 10 * 3_600_000;
    const MIN: u64 = 60_000;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-health-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(LEDGER_FILE)
    }

    fn info(state: ReaderStatus, learned: u32, patterns: Vec<LearnedPattern>) -> ReaderInfo {
        ReaderInfo {
            app: Some(MeetingApp::Teams),
            app_version: Some("26032.1100".into()),
            state,
            recipe_version: 2,
            learned,
            patterns,
        }
    }

    /// `idle`: các câu trả lời lần lượt của `translation_idle` (câu cuối lặp lại mãi).
    struct FakeHost {
        auto: bool,
        idle: Mutex<Vec<bool>>,
    }

    impl Host for FakeHost {
        fn auto_enabled(&self) -> bool {
            self.auto
        }
        fn translation_idle(&self) -> bool {
            let mut idle = self.idle.lock().unwrap();
            if idle.len() > 1 {
                idle.remove(0)
            } else {
                idle.first().copied().unwrap_or(true)
            }
        }
        fn facts(&self) -> Option<ReportFacts> {
            Some(ReportFacts {
                app_version: "0.3.2".into(),
                build: "release",
                os_name: "macos".into(),
                os_version: "15.6.1".into(),
                arch: "aarch64".into(),
                chip: Some("Apple M4 Pro".into()),
                ram_mb: Some(24_576),
                gpu_backend: Some("metal".into()),
                model_pack: Some("standard".into()),
                plan: Some("monthly".into()),
                ui_lang: "vi".into(),
                device_id_hash: "a".repeat(64),
            })
        }
        fn now(&self) -> i64 {
            0
        }
    }

    fn host(auto: bool) -> FakeHost {
        FakeHost {
            auto,
            idle: Mutex::new(vec![true]),
        }
    }

    #[derive(Default)]
    struct FakeApi {
        sent: Mutex<Vec<String>>,
        fail: Mutex<Vec<SendError>>,
    }

    impl ReportApi for FakeApi {
        fn send(&self, body: &str) -> Result<(), SendError> {
            if let Some(e) = self.fail.lock().unwrap().pop() {
                return Err(e);
            }
            self.sent.lock().unwrap().push(body.to_string());
            Ok(())
        }
    }

    /// Một phiên Teams 20 phút hôm 26/10: 5 phút không thấy tên, rồi 15 phút đọc được, có một chỉ báo tự học.
    fn session(h: &Health) {
        h.observe(T0, &info(ReaderStatus::NoNames, 0, vec![]));
        h.observe(
            T0 + 5 * MIN,
            &info(
                ReaderStatus::Ok,
                1,
                vec![LearnedPattern {
                    role: "AXGroup".into(),
                    path: vec![2, 0],
                    states: vec![PatternState {
                        subrole: String::new(),
                        classes: vec!["vdi-frame-occlusion".into()],
                    }],
                }],
            ),
        );
        h.close(T0 + 20 * MIN);
    }

    #[test]
    fn a_finished_day_is_sent_once_with_the_agreed_fields_and_no_names() {
        let path = temp("send");
        let h = Health::load(path.clone());
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        assert_eq!(
            h.flush(&host(true), &api, DAY * 86_400 + 40_000),
            0,
            "ngày hôm nay chưa gửi"
        );
        assert_eq!(h.flush(&host(true), &api, next_day), 1);
        assert_eq!(h.flush(&host(true), &api, next_day + 100), 0, "không gửi lại");
        let sent = api.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        let v: Value = serde_json::from_str(&sent[0]).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["day"], "2026-10-26");
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 15, "total": 20}));
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        assert_eq!(v["recipe_version"], 2);
        assert_eq!(v["learned"], 1);
        assert_eq!(v["canary"], false);
        assert_eq!(v["device_id_hash"], "a".repeat(64));
        assert!(v.get("plan").is_none() && v.get("ui_lang").is_none() && v.get("hw").is_none());
        assert!(scrub::find_sensitive(&sent[0]).is_none());
    }

    #[test]
    fn nothing_is_sent_when_reports_are_off_or_a_session_is_running_and_the_ledger_is_kept() {
        let h = Health::load(temp("gates"));
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        assert_eq!(h.flush(&host(false), &api, next_day), 0, "công tắc tắt");
        let busy = FakeHost {
            auto: true,
            idle: Mutex::new(vec![false]),
        };
        assert_eq!(h.flush(&busy, &api, next_day), 0, "đang dịch");
        assert!(api.sent.lock().unwrap().is_empty());
        assert_eq!(h.flush(&host(true), &api, next_day), 1, "rảnh và bật thì gửi");
    }

    #[test]
    fn transient_errors_stop_the_round_and_retry_later_rejections_drop_the_report() {
        let h = Health::load(temp("errors"));
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        api.fail.lock().unwrap().push(SendError::Transient("mạng".into()));
        assert_eq!(h.flush(&host(true), &api, next_day), 0);
        api.fail.lock().unwrap().push(SendError::RateLimited(Some(60)));
        assert_eq!(h.flush(&host(true), &api, next_day), 0);
        api.fail.lock().unwrap().push(SendError::Rejected {
            status: 422,
            code: "rejected_sensitive".into(),
        });
        assert_eq!(h.flush(&host(true), &api, next_day), 0, "bị từ chối: bỏ");
        assert_eq!(h.flush(&host(true), &api, next_day), 0, "và không gửi lại");
        assert!(api.sent.lock().unwrap().is_empty());
    }

    /// App thoát giữa chừng rồi mở lại: sổ đã lưu nên báo cáo của ngày hôm trước vẫn gửi được.
    #[test]
    fn the_ledger_survives_a_restart_and_garbage_files_are_ignored() {
        let path = temp("restart");
        session(&Health::load(path.clone()));
        let api = FakeApi::default();
        assert_eq!(
            Health::load(path.clone()).flush(&host(true), &api, (DAY + 1) * 86_400),
            1
        );
        std::fs::write(&path, b"not json").unwrap();
        assert_eq!(Health::load(path).flush(&host(true), &api, (DAY + 1) * 86_400), 0);
    }

    #[test]
    fn turning_reports_off_forgets_everything_including_the_file() {
        let path = temp("purge");
        let h = Health::load(path.clone());
        session(&h);
        assert!(path.exists());
        h.purge();
        assert!(!path.exists());
        assert_eq!(h.flush(&host(true), &FakeApi::default(), (DAY + 1) * 86_400), 0);
        h.close(T0 + 30 * MIN);
        assert!(!path.exists(), "khoảng đang mở cũng đã bỏ");
    }

    /// Đường nối của app: `ReaderState` và hết phiên đi vào sổ; tắt "Gửi báo cáo lỗi" (`diagnostics::purge_queue`) xóa sổ và file.
    #[test]
    fn the_app_feeds_the_ledger_and_turning_reports_off_purges_it() {
        let app = crate::test_support::mock_app();
        let path = temp("wiring");
        app.manage(Arc::new(Health::load(path.clone())));
        note_reader(app.handle(), &info(ReaderStatus::Ok, 0, vec![]));
        assert!(!path.exists(), "khoảng còn mở: chưa có gì để ghi");
        note_session_ended(app.handle());
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("teams|26032.1100"), "{saved}");
        assert!(!saved.contains("Lan"));
        crate::diagnostics::purge_queue(app.handle());
        assert!(!path.exists());
    }

    #[test]
    fn debug_and_release_builds_keep_separate_ledgers() {
        assert_ne!(ledger_file(true), ledger_file(false));
        assert_eq!(LEDGER_FILE, ledger_file(cfg!(debug_assertions)));
    }
}
```

- [ ] **Step 3: Chạy test** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator -- --check && cargo test -p meeting-translator --lib -- speaker:: diagnostics:: 2>&1 | grep -E "^test result|FAILED|panicked|^error"`
Expected: toàn bộ test `speaker::` và `diagnostics::` đạt (thêm 7 test của `speaker::health`: gửi một lần với đúng các trường và không có tên, các cổng công tắc và phiên đang chạy, phân loại lỗi gửi, sổ sống sót khi mở lại và file hỏng, tắt báo cáo xóa sổ, đường nối của app, sổ debug và release tách nhau).

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `Finished`. Không commit.

---

### Task 9: Bộ che báo cáo lỗi biết tên người tham dự

Kế hoạch 03 và spec §10: "bộ che báo cáo lỗi thêm luật kiểm tên người". `Host::known_names` (mặc định rỗng; app lấy từ bảng người nói hiện có: tên người tham dự và nhãn có tên, không tính "Người N"); `scrub::redact_names` che bằng `<tên>` (không phân biệt hoa thường, biên từ Unicode, tên ≥ 2 ký tự và ≤ 160 byte); `RawLogs::redact_names`; `Reporter` che câu lỗi và ba file log trước `report::build`, cả báo cáo tự động lẫn gửi tay.

**Files:**
- Modify: `src-tauri/src/diagnostics/{scrub,report,reporter,mod}.rs`, `src-tauri/src/speaker/mod.rs`

- [ ] **Step 1: Chỉnh sửa**

**Sửa `src-tauri/src/diagnostics/scrub.rs`:**

Thay đoạn:

```rust
#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;
```

bằng:

```rust
/// Tên người tham dự dài tối thiểu chừng này ký tự mới che (tên một chữ cái không có thật; tên hai ký tự như "An" vẫn che, vì biên từ
/// theo Unicode không để nó phá chữ khác).
const MIN_PARTICIPANT_CHARS: usize = 2;
/// Tên dài hơn chừng này byte không che (khung của worker đã giới hạn 160 byte, `speaker_protocol::MAX_NAME_BYTES`).
const MAX_PARTICIPANT_BYTES: usize = 160;

/// Mẫu một tên người tham dự: không phân biệt hoa thường, biên từ theo Unicode (chữ cái và chữ số), nên "Lan" không bị che trong
/// "Lanh" hay "Lan2".
fn participant_pattern(name: &str) -> Option<Regex> {
    let name = name.trim();
    if name.chars().count() < MIN_PARTICIPANT_CHARS || name.len() > MAX_PARTICIPANT_BYTES {
        return None;
    }
    Regex::new(&format!(
        r"(?i)(^|[^\p{{L}}\p{{N}}]){}($|[^\p{{L}}\p{{N}}])",
        regex::escape(name)
    ))
    .ok()
}

/// Che tên người tham dự đang có trong cuộc họp (spec 2026-10-26-phan-biet-nguoi-noi §10) bằng `<tên>`. Log của app không bao giờ in tên
/// (mọi `Debug` che chữ); đây là lớp bảo vệ thêm cho báo cáo lỗi, tính trên các tên mà app đang giữ (`Host::known_names`).
pub fn redact_names(text: &str, names: &[String]) -> String {
    let mut out = text.to_string();
    for pattern in names.iter().filter_map(|n| participant_pattern(n)) {
        // Hai tên cách nhau một ký tự dùng chung ký tự đó làm biên: lặp tới khi hết thay đổi.
        for _ in 0..4 {
            let next = pattern.replace_all(&out, "${1}<tên>${2}").into_owned();
            if next == out {
                break;
            }
            out = next;
        }
    }
    out
}

/// Còn tên người tham dự nào trong `text` không (kiểm lại sau khi che).
pub fn contains_name(text: &str, names: &[String]) -> bool {
    names
        .iter()
        .filter_map(|n| participant_pattern(n))
        .any(|pattern| pattern.is_match(text))
}

#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    fn names(list: &[&str]) -> Vec<String> {
        list.iter().map(ToString::to_string).collect()
    }

    /// Tên người tham dự (kể cả có dấu, viết hoa khác) bị che; chữ khác chứa tên như một phần thì giữ nguyên.
    #[test]
    fn participant_names_are_redacted_by_whole_word() {
        let n = names(&["Lan Nguyễn", "An", "Bình"]);
        assert_eq!(
            redact_names("họp với lan nguyễn và AN, bình.", &n),
            "họp với <tên> và <tên>, <tên>."
        );
        assert_eq!(redact_names("Lanh, Anna, Bình2, vận", &n), "Lanh, Anna, Bình2, vận");
        assert_eq!(
            redact_names("An Bình", &n),
            "<tên> <tên>",
            "hai tên liền nhau dùng chung một khoảng trắng"
        );
        assert_eq!(redact_names("Lan Nguyễn\nBình", &n), "<tên>\n<tên>");
    }

    #[test]
    fn short_empty_or_huge_names_are_ignored_and_no_names_changes_nothing() {
        let text = "a b c Lan";
        assert_eq!(redact_names(text, &[]), text);
        assert_eq!(redact_names(text, &names(&["", " ", "a"])), text);
        assert_eq!(
            redact_names(text, &names(&[&"x".repeat(MAX_PARTICIPANT_BYTES + 1)])),
            text
        );
        assert!(!contains_name(text, &names(&["a"])));
    }

    #[test]
    fn contains_name_sees_what_redaction_removes() {
        let n = names(&["Lan Nguyễn"]);
        assert!(contains_name("gọi LAN NGUYỄN lúc 9h", &n));
        assert!(!contains_name(&redact_names("gọi LAN NGUYỄN lúc 9h", &n), &n));
        assert!(!contains_name("Lan Nguyễnx", &n));
    }

    /// Tên có ký tự đặc biệt của regex không làm hỏng mẫu hay che nhầm.
    #[test]
    fn regex_characters_in_names_are_literal() {
        let n = names(&["A.B (Guest)", "x+y"]);
        assert_eq!(
            redact_names("A.B (Guest) và AxB (Guest), x+y, xxy", &n),
            "<tên> và AxB (Guest), <tên>, xxy"
        );
    }
```

**Sửa `src-tauri/src/diagnostics/report.rs`:**

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
/// Nội dung thô của ba file log (chưa chọn dòng, chưa che).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawLogs {
    pub app: String,
    pub asr: String,
    pub llama: String,
}
```

Đoạn thêm vào:

```rust
impl RawLogs {
    /// Bản đã che tên người tham dự đang có (`scrub::redact_names`), trước khi chọn dòng và che tiếp.
    pub fn redact_names(&self, names: &[String]) -> RawLogs {
        RawLogs {
            app: scrub::redact_names(&self.app, names),
            asr: scrub::redact_names(&self.asr, names),
            llama: scrub::redact_names(&self.llama, names),
        }
    }
}
```

Thay đoạn:

```rust
    fn params() -> Params {
```

bằng:

```rust
    #[test]
    fn raw_logs_lose_the_participant_names_before_selection() {
        let raw = RawLogs {
            app: "[WARN] gặp lỗi khi gán tên Lan Nguyễn cho giọng 2".into(),
            asr: "không có tên".into(),
            llama: "Minh Trần nói".into(),
        };
        let clean = raw.redact_names(&["Lan Nguyễn".to_string(), "Minh Trần".to_string()]);
        assert_eq!(clean.app, "[WARN] gặp lỗi khi gán tên <tên> cho giọng 2");
        assert_eq!(
            (clean.asr.as_str(), clean.llama.as_str()),
            ("không có tên", "<tên> nói")
        );
    }

    fn params() -> Params {
```

**Sửa `src-tauri/src/diagnostics/reporter.rs`:**

Thay đoạn:

```rust
use super::scrub::Params;
```

bằng:

```rust
use super::scrub::{self, Params};
```

Thay đoạn:

```rust
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
}
```

bằng:

```rust
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
    /// Tên người tham dự đang có trong bảng người nói (spec 2026-10-26-phan-biet-nguoi-noi §10): bị che trong câu lỗi và log của mọi báo
    /// cáo lỗi, kể cả khi một dòng log lỡ in tên. Mặc định không có.
    fn known_names(&self) -> Vec<String> {
        Vec::new()
    }
}
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
        event.at = event.at.clamp(now - MAX_AGE_SECONDS, now);
```

Đoạn thêm vào:

```rust
        let names = self.host.known_names();
        event.message = scrub::redact_names(&event.message, &names);
```

Thay đoạn:

```rust
        let built = report::build(&event, &facts, &self.raw_logs(), &self.params, report::new_id());
```

bằng:

```rust
        let built = report::build(
            &event,
            &facts,
            &self.raw_logs().redact_names(&names),
            &self.params,
            report::new_id(),
        );
```

Thay đoạn:

```rust
        let report = report::build(&event, &facts, &self.raw_logs(), &self.params, report::new_id())?;
```

bằng:

```rust
        let names = self.host.known_names();
        let report = report::build(
            &event,
            &facts,
            &self.raw_logs().redact_names(&names),
            &self.params,
            report::new_id(),
        )?;
```

Thay đoạn:

```rust
        facts: Arc<Mutex<Option<Facts>>>,
    }

    impl FakeHost {
        fn new() -> Self {
            Self {
                enabled: Arc::new(AtomicBool::new(true)),
                idle: Arc::new(AtomicBool::new(true)),
                now: Arc::new(AtomicI64::new(T0)),
                facts: Arc::new(Mutex::new(Some(facts()))),
            }
        }
    }
```

bằng:

```rust
        facts: Arc<Mutex<Option<Facts>>>,
        names: Arc<Mutex<Vec<String>>>,
    }

    impl FakeHost {
        fn new() -> Self {
            Self {
                enabled: Arc::new(AtomicBool::new(true)),
                idle: Arc::new(AtomicBool::new(true)),
                now: Arc::new(AtomicI64::new(T0)),
                facts: Arc::new(Mutex::new(Some(facts()))),
                names: Arc::default(),
            }
        }
    }
```

Thay đoạn:

```rust
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
    }

    fn facts() -> Facts {
```

bằng:

```rust
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
        fn known_names(&self) -> Vec<String> {
            self.names.lock().unwrap().clone()
        }
    }

    fn facts() -> Facts {
```

Thay đoạn:

```rust
    fn session_error(code: &str) -> Event {
```

bằng:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §10: tên người tham dự đang có bị che khỏi câu lỗi và log của cả báo cáo tự động lẫn báo cáo
    /// gửi tay, kể cả khi một dòng log lỡ in tên.
    #[test]
    fn participant_names_never_reach_a_report() {
        let r = rig("names");
        *r.host.names.lock().unwrap() = vec!["Lan Nguyễn".into(), "Minh Trần".into()];
        r.logs.0.lock().unwrap()[0] = "[2026-10-27][10:00:00][WARN][x] gán tên Lan Nguyễn cho giọng 2\n".into();
        r.logs.0.lock().unwrap()[2] = "Minh Trần đang nói\n".into();
        let mut event = session_error("sidecarFailed");
        event.message = "worker chết khi đọc ô của lan nguyễn".into();
        assert!(r.reporter.record(event).is_some());
        let queued = r.reporter.pending_reports().remove(0);
        let lower = queued.to_lowercase();
        assert!(!lower.contains("nguyễn") && !lower.contains("minh trần"), "{queued}");
        assert!(queued.contains("<tên>"), "{queued}");
        r.reporter.send_manual().unwrap();
        let sent = r.api.bodies.lock().unwrap().last().unwrap().clone();
        let lower = sent.to_lowercase();
        assert!(!lower.contains("nguyễn") && !lower.contains("minh trần"), "{sent}");
    }

    fn session_error(code: &str) -> Event {
```

**Sửa `src-tauri/src/diagnostics/mod.rs`:**

Thay đoạn:

```rust
    fn now(&self) -> i64 {
        unix_now()
    }
}
```

bằng:

```rust
    fn now(&self) -> i64 {
        unix_now()
    }

    /// Tên người tham dự và nhãn có tên (đọc từ app họp hay do người dùng đặt) của bảng người nói hiện có; không có "Người N".
    fn known_names(&self) -> Vec<String> {
        let Some(store) = self.app.try_state::<TranscriptStore>() else {
            return Vec::new();
        };
        let view = store.roster_view();
        view.participants
            .into_iter()
            .chain(
                view.voices
                    .into_iter()
                    .filter(|v| v.source != NameSource::Voice)
                    .map(|v| v.label),
            )
            .collect()
    }
}
```

Giữ nguyên đoạn sau (chỉ để định vị), rồi thêm ngay phía dưới nó:

```rust
use crate::state::{AppState, SessionStatus};
```

Đoạn thêm vào:

```rust
use crate::transcript::speakers::NameSource;
use crate::transcript::store::TranscriptStore;
```

**Sửa `src-tauri/src/speaker/mod.rs`:**

Thay đoạn:

```rust
    /// QĐ 31: tắt "Lấy tên" thì app tự xóa tên tự động và người tham dự rồi phát bảng
```

bằng:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §10: báo cáo lỗi biết tên người tham dự và nhãn có tên của bảng người nói hiện có (để che), không
    /// tính nhãn "Người N".
    #[test]
    fn the_error_report_host_knows_the_names_in_the_roster() {
        use pipeline::subtitle::{NamedVoice, Names};
        let app = crate::test_support::mock_app();
        one_voice(&app);
        let host = crate::diagnostics::host_of(app.handle());
        assert!(host.known_names().is_empty(), "chưa có tên: nhãn là Người 1");
        let names = Names {
            voices: vec![NamedVoice {
                id: 1,
                name: "Lan Nguyễn".into(),
                room_index: None,
            }],
            participants: vec!["Lan Nguyễn".into(), "Minh Trần".into()],
        };
        assert!(app.state::<TranscriptStore>().names(1, &names).is_some());
        let mut known = host.known_names();
        known.sort();
        known.dedup();
        assert_eq!(known, ["Lan Nguyễn", "Minh Trần"]);
    }

    /// QĐ 31: tắt "Lấy tên" thì app tự xóa tên tự động và người tham dự rồi phát bảng
```


- [ ] **Step 2: Chạy test** (build nặng: kiểm đĩa trước)

Run: `cd $W && avail=$(df -k /System/Volumes/Data | awk 'NR==2{printf "%d", $4/1048576}'); [ "$avail" -ge 14 ] || { echo "đĩa còn $avail GiB, dừng"; exit 1; } && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo fmt -p meeting-translator -- --check && cargo test -p meeting-translator --lib -- diagnostics:: speaker:: 2>&1 | grep -E "^test result|FAILED|panicked|^error" && cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED"`
Expected: `diagnostics::` và `speaker::` đạt (thêm 4 test của `scrub`, 1 của `report`, 1 của `reporter`, 1 của `speaker`); toàn bộ test lib của app: **957 đạt, 6 bỏ qua** (mốc đo khi viết kế hoạch).

- [ ] **Step 3: Kiểm âm tính**

Trong `Reporter::record` bỏ dòng `event.message = scrub::redact_names(&event.message, &names);` rồi chạy `cargo test -p meeting-translator --lib participant_names_never_reach_a_report`: **đỏ** (câu lỗi còn tên). Hoàn lại.

- [ ] **Step 4: Mốc kiểm**

Run: `cd $W && export CARGO_TARGET_DIR=$W/target CARGO_INCREMENTAL=0 && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -2 && git status --short | wc -l`
Expected: clippy `Finished`; `git status` chỉ thêm file sửa của Task này. Không commit.
