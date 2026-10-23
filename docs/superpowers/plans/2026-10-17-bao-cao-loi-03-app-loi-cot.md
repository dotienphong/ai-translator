# Báo cáo lỗi 03: app, lõi Rust — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App tự gửi một báo cáo lỗi đã che dữ liệu cá nhân về `POST /v1/diagnostics` khi gặp lỗi của chính nó (crash ở lần chạy trước, phiên dịch lỗi vì lỗi của app, tiến trình phụ chết), và gửi tay được qua lệnh Tauri `send_log_report`; có cài đặt `sendErrorReports` (migrate `v1→v2`: người dùng cũ giữ bật, cài mới bật qua ô tích ở onboarding của kế hoạch 04), hàng đợi trên đĩa, giới hạn tần suất, và công tắc dev để bản debug chỉ tự gửi khi chủ dự án bật.

**Architecture:** Module mới `src-tauri/src/diagnostics/`. Lõi không phụ thuộc Tauri: `scrub` (che dữ liệu và phát hiện dữ liệu sót, dùng chung vector với server), `logs` (chọn dòng log), `report` (dựng JSON đúng hợp đồng, trong 64 KB, fail closed), `machine` (hệ điều hành, chip), `queue` (hàng đợi và giới hạn trên đĩa), `send` (HTTP), `marker` (dấu vết lần chạy trước để biết có crash), `reporter` (nối các phần trên, nhận mọi phụ thuộc qua trait `Host`, `LogSource`, `ReportApi` nên test bằng bản giả). `mod.rs` là phần ghép với app: `AppHost` (đọc cài đặt, trạng thái phiên, bản quyền), `install`, các điểm kích hoạt (`on_session_error`, `on_sidecar_died`, `mark_clean_exit`, `purge_queue`) và lệnh `send_manual`. Phần nối vào `lib.rs`, `session.rs`, `actions.rs`, `commands.rs` chỉ là vài dòng.

**Tech Stack:** Rust 2024 (`rust-version = 1.98`), Tauri 2, `regex 1.13.1` (thêm trực tiếp, đã có trong `Cargo.lock`), `reqwest` blocking, `serde_json`, `sha2` (đều đã có), vitest cho kiểm từ điển giao diện, `node --test` cho script.

**Spec:** `docs/superpowers/specs/2026-10-17-diagnostics-reports-design.md` (mục 1, 2, 5, 7). Đọc spec trước khi làm.

**Quy tắc chung cho mọi task:**
- Làm trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports` (nhánh `diagnostics-reports`). **Mọi lệnh bắt đầu bằng `cd <đường dẫn tuyệt đối> &&`** vì shell reset thư mục sau mỗi lệnh.
- **Không merge, không push, không deploy.** Kế hoạch này không đụng `server/` (trừ một file test Node ở Task 14) và không đụng `src/` (giao diện) ngoài ba chuỗi `error.report*` ở Task 9.
- Mã Rust phải qua `cargo fmt --all -- --check` (`rustfmt.toml`: edition 2024, `max_width = 120`) và `cargo clippy --locked --workspace --all-targets -- -D warnings`. Chú thích trong mã bằng tiếng Việt, theo giọng các file kế bên.
- Mã trong kế hoạch này đã được chạy thật trên bản sao của repo (cargo test, clippy, `check-windows.sh`); chép nguyên văn, đừng "dọn" lại. Nếu rustfmt đổi chỗ xuống dòng thì để nó đổi.
- Không thêm biến môi trường ghi đè URL và không thêm môi trường staging (CLAUDE.md: chỉ có production). Công tắc dev của báo cáo lỗi chỉ bật/tắt việc tự gửi, không đổi địa chỉ.
- Commit có hai dòng `-m`, dòng thứ hai là `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

**Thứ tự với các kế hoạch khác:**
- Cần kế hoạch 01 **Task 2** xong trước Task 1 (file `server/test/vectors/scrub-v1.json`, test của `scrub.rs` đọc nó) và **Task 3, 4** xong trước Task 14 (`server/src/error-reports.ts`, `ratelimit.ts`, test Node nối hằng số).
- Không cần kế hoạch 02 (Web Admin). Kế hoạch 04 (giao diện) độc lập về mã, làm trước hay sau đều được; chỉ cần cả hai xong mới thử tay được nút "Gửi log cho hỗ trợ".

## Hợp đồng (kế hoạch 04 dựa vào đây, đừng đổi khi chưa sửa cả hai)

| Điều | Giá trị |
|---|---|
| Lệnh Tauri | `send_log_report` (không tham số) trả `{ "id": "R-XXXX-XXXX" }`; lỗi là `CommandError` có `code` ∈ `reportFailed`, `reportRateLimited`, `reportRejected` |
| Cài đặt | khóa `sendErrorReports: boolean` (camelCase như mọi khóa), mặc định `false` ở cài mới; `schemaVersion` lên `2` |
| Migrate `v1→v2` | file có `onboardingDone = true` mà chưa có `sendErrorReports` thì đặt `true` (người dùng cũ giữ bật, không hỏi, không báo); file khác không đặt gì |
| Chuỗi giao diện | ba câu `error.reportFailed`, `error.reportRateLimited`, `error.reportRejected` ở 5 ngôn ngữ do **kế hoạch này** thêm (Task 9) vì test Rust `every_error_code_has_ui_text` đọc `src/i18n/en.ts` và test TS đòi mọi từ điển cùng khóa; mọi chuỗi khác của tính năng do kế hoạch 04 |
| Server | hợp đồng ở kế hoạch 01, mục "Hợp đồng" (JSON báo cáo, trần log 24/16/16 KiB, trần thân 80 KB, hạn mức theo giờ IP 30, máy 3, toàn hệ thống 120) |

## Quyết định của kế hoạch này (spec không nêu; chọn thay chủ dự án, nêu lý do)

1. **Thoát bình thường không bị tính là crash.** App ghi file `run.marker` lúc mở và **xóa nó ở dòng đầu của `on_exit`** (`RunEvent::Exit`). Căn cứ đã đọc trong mã nguồn: macOS `applicationWillTerminate:` → `LoopDestroyed` → `RunEvent::Exit` (tao 0.37.1); Windows `WM_ENDSESSION` → tao gọi `loop_destroyed()` rồi `std::process::exit(0)` (`tao-0.37.1/src/platform_impl/windows/event_loop.rs:2332-2342`); `tauri-runtime-wry-2.12.1/src/lib.rs:4131` đổi `Event::LoopDestroyed` thành `RunEvent::Exit`; cập nhật dùng `request_restart()` (`ExitRequested` rồi `Exit`) nên cũng qua `on_exit`. Xóa **trước** `updater::install_on_exit` vì trên Windows plugin có thể `process::exit` ngay. Chỉ `AppHandle::restart()` gọi trên luồng chính không phát `Exit`, mà app không dùng nó. Tắt máy và đăng xuất vì thế không sinh báo cáo thừa. Bổ sung: nếu máy đã khởi động lại sau lúc ghi marker (macOS `kern.boottime`, Windows `GetTickCount64`) thì không tính là crash (mất điện, treo máy không phải lỗi của app). Fast Startup của Windows có thể làm mốc "lúc khởi động" sớm hơn thực tế, nên có thể báo thừa một lần, không bao giờ bỏ sót.
2. **"Rảnh" là `SessionStatus::Idle` hoặc `Error`.** Dừng phiên giữ trạng thái `Running` cho tới khi xong (câu cuối còn được dịch), nên không có trạng thái "đang dừng" riêng. Báo cáo chỉ gửi khi rảnh; `flush` kiểm lại giữa các lần gửi.
3. **Công tắc dev `AI_TRANSLATOR_DEV_REPORTS`** theo đúng cơ chế nhiều lớp của `AI_TRANSLATOR_DEV_PRO` (hằng và mã đọc chỉ có ở bản debug, `read-dev-env.sh` allowlist, `run-dev-app.sh` `unset` rồi mới đọc `.env`, `release-check.mjs no-dev-gate` chặn chuỗi trong binary phát hành, test đối chiếu, tài liệu phát hành, CI). Bản debug không có công tắc thì không tự gửi (spec §1); nút gửi tay chạy ở mọi bản.
4. **Thêm `regex = "1.13.1"` vào `src-tauri/Cargo.toml`.** Đã là bản mới nhất trên crates.io (rust-version 1.65 ≤ 1.98), đã có trong `Cargo.lock` (qua `tauri-utils`, `tokenizers`…), nên chỉ thêm một dòng `"regex",` vào khối `meeting-translator` của `Cargo.lock`; không crate mới, không hai bản ggml.
5. **Logger test dùng chung.** `log::set_logger` chỉ cài được một lần mỗi tiến trình; test của `license::manager` đã tự cài một logger bắt log, trong khi test "không lộ chữ chép lời vào báo cáo" cần đọc log thật. Chuyển logger bắt log thành `test_support::capture_logs` rồi cho cả hai dùng.
6. **Tên file hàng đợi là `{số thứ tự 8 chữ số}-{mã báo cáo}.json`** để thứ tự gửi đúng thứ tự xếp hàng, không phụ thuộc đồng hồ (đồng hồ có thể lùi).
7. **`sidecar_died` chỉ báo khi `failures ≥ 1`.** `SidecarEvent::Restarting` với `failures = 0` là lần đầu tiến trình phụ chạy quá giờ chờ, chưa phải một lần chết.
8. **Gửi tay không qua hàng đợi và không bị giới hạn 1/dấu vân tay/24 giờ** (spec §1); chỉ bị hạn mức của server (máy 3/giờ).

## Cấu trúc file

| File | Việc |
|---|---|
| Create `src-tauri/src/diagnostics/scrub.rs` | Che dữ liệu, `find_sensitive`, `Params` |
| Create `src-tauri/src/diagnostics/logs.rs` | Chọn dòng log, `LogSource`, `FileLogs` |
| Create `src-tauri/src/diagnostics/report.rs` | `Event`, `Facts`, `build` (JSON hợp đồng, ≤ 64 KB, fail closed), dấu vân tay, mã báo cáo |
| Create `src-tauri/src/diagnostics/machine.rs` | Hệ điều hành và chip (macOS `sysctl`, Windows registry) |
| Create `src-tauri/src/diagnostics/queue.rs` | Hàng đợi trên đĩa và giới hạn tần suất |
| Create `src-tauri/src/diagnostics/send.rs` | `ReportApi`, `HttpReportApi`, `SendError` |
| Create `src-tauri/src/diagnostics/marker.rs` | `run.marker`, `panic.json`, `PreviousRun`, panic hook |
| Create `src-tauri/src/diagnostics/reporter.rs` | `Reporter`, trait `Host`, `record`, `flush`, `send_manual`, `purge` |
| Create `src-tauri/src/diagnostics/mod.rs` | Ghép với app, điểm kích hoạt, công tắc dev, phân loại mã lỗi |
| Modify `src-tauri/Cargo.toml`, `Cargo.lock` | Thêm `regex` |
| Modify `src-tauri/src/lib.rs` | `pub mod diagnostics;`, `diagnostics::install`, `mark_clean_exit` ở `on_exit` |
| Modify `src-tauri/src/errors.rs`, `src/i18n/{en,vi,ja,zh,ko}.ts` | Ba mã lỗi gửi báo cáo và câu hiển thị |
| Modify `src-tauri/src/settings/mod.rs`, `settings/migrate.rs` | `sendErrorReports`, migrate `v1→v2` |
| Modify `src-tauri/src/actions.rs` | Tắt cài đặt thì xóa hàng đợi |
| Modify `src-tauri/src/session.rs` | Ba điểm báo lỗi phiên, `sidecar_died`, nhớ backend GPU |
| Modify `src-tauri/src/commands.rs`, `build.rs`, `capabilities/main.json` | Lệnh `send_log_report` và quyền của cửa sổ chính |
| Modify `src-tauri/src/test_support.rs`, `license/manager.rs`, `app_tests.rs`, `acl_tests.rs` | Công cụ test chung, test đầu-cuối, test ACL |
| Modify `scripts/read-dev-env.sh`, `scripts/run-dev-app.sh`, `scripts/release/release-check.mjs`, `.env.example`, `docs/release/phat-hanh.md`, `.github/workflows/ci.yml` | Công tắc dev |
| Modify `scripts/dev-env.test.mjs`, `scripts/run-dev-app.test.mjs`, `scripts/release/release-check.test.mjs`, `scripts/release/dev-gate-markers.test.mjs` | Test công tắc dev |
| Modify `server/test/node/app-server-constants.test.mjs` | Nối hằng số app ↔ server |

---

### Task 0: Chuẩn bị môi trường và mốc xuất phát

**Files:** không sửa file.

- [ ] **Step 1: Kiểm nhánh, công cụ và file vector của kế hoạch 01**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git branch --show-current
```
Expected: `diagnostics-reports`

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && rustc --version && cargo --version
```
Expected: `rustc 1.98` trở lên (workspace đặt `rust-version = 1.98`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && test -f server/test/vectors/scrub-v1.json && echo có
```
Expected: `có`. Nếu không có file này thì kế hoạch 01 Task 2 chưa xong: làm Task 2 đó trước (hay lấy file từ nhánh đang làm kế hoạch 01), **đừng tự viết lại vector**.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm install --frozen-lockfile
```
Expected: kết thúc không lỗi (Task 9 chạy vitest cho từ điển giao diện).

- [ ] **Step 2: Chạy mốc xuất phát**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib 2>&1 | tail -5
```
Expected: `test result: ok.`, `0 failed`, vài test `ignored` (bản 2026-10-16: 556 passed, 4 ignored). **Ghi lại số `passed` này là N0**: Task 15 đòi N0 + 87. Nếu có test đỏ **trước** khi sửa gì, dừng lại và báo, đừng làm tiếp.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | tail -8
```
Expected: `# fail 0`.

---

### Task 1: Che dữ liệu (`scrub.rs`), phụ thuộc `regex` và khung module

**Files:**
- Modify: `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/src/lib.rs`
- Create: `src-tauri/src/diagnostics/mod.rs` (khung, Task 11 viết đủ), `src-tauri/src/diagnostics/scrub.rs`

`scrub.rs` che chuỗi tự do (câu lỗi, dòng log) theo thứ tự cố định: dòng `Authorization`, giá trị `Bearer`, token, key bản quyền, email, query của URL, thư mục home, tên máy, tên tài khoản. `find_sensitive` là lần kiểm cuối: còn mẫu nhạy cảm thì `report::build` bỏ cả báo cáo. Mẫu và thứ tự dùng chung với server qua `server/test/vectors/scrub-v1.json` (`detect`, `clean`, `scrub`, `rule_order`): test Rust đọc cùng file với test TypeScript của kế hoạch 01, nên hai bên không lệch nhau.

- [ ] **Step 1: Kiểm phiên bản `regex` và chỗ đứng trong đồ thị (CLAUDE.md, spec §6.12)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo search regex --limit 1
```
Expected: dòng đầu là `regex = "1.13.1"`. Nếu crates.io đã có bản ổn định mới hơn, dùng bản đó: kiểm `rust-version` ở `~/.cargo/registry/src/*/regex-<bản>/Cargo.toml` không quá 1.98 rồi đổi mọi chỗ `1.13.1` của kế hoạch này.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo tree --locked -p meeting-translator -i regex@1.13.1 --depth 1 2>&1 | head -8
```
Expected: in `regex v1.13.1` cùng các crate kéo nó (`tauri-utils`, `tokenizers`, `prost-build`…): đã có trong đồ thị, chỉ thêm một cạnh từ `meeting-translator`.

- [ ] **Step 2: Thêm phụ thuộc**

Trong `src-tauri/Cargo.toml`, tìm đoạn (duy nhất trong file):

```toml
qrcode = { version = "0.14.1", default-features = false, features = ["svg"] }
```

và thay bằng:

```toml
qrcode = { version = "0.14.1", default-features = false, features = ["svg"] }
# Báo cáo lỗi (diagnostics/scrub.rs, spec 2026-10-17): che dữ liệu cá nhân và phát hiện dữ liệu nhạy cảm còn sót. Cùng bản `Cargo.lock`
# đã có (qua các crate khác); mẫu dùng chung vector với server nên dùng cùng cú pháp regex.
regex = "1.13.1"
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo check -p meeting-translator 2>&1 | tail -3
```
Expected: `Finished`. (Lần này **không** `--locked` để Cargo ghi `Cargo.lock`.)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git diff Cargo.lock
```

Expected: đúng một dòng thêm, nằm trong khối `name = "meeting-translator"`, không dòng nào khác:

```diff
  "qrcode",
+ "regex",
  "reqwest",
```

- [ ] **Step 3: Tạo khung module và khai báo trong `lib.rs`**

Tạo `src-tauri/src/diagnostics/mod.rs`:

```rust
//! Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md; kế hoạch bao-cao-loi-03).
//!
//! Khung tạm: mỗi task thêm một module vào danh sách dưới đây; Task 11 thay file này bằng bản đầy đủ.

pub mod scrub;
```

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất trong file):

```rust
pub mod debug;
pub mod errors;
pub mod events;
```

và thay bằng:

```rust
pub mod debug;
pub mod diagnostics;
pub mod errors;
pub mod events;
```

- [ ] **Step 4: Viết test trước (đỏ)**

Tạo `src-tauri/src/diagnostics/scrub.rs` **chỉ với khối test** sau (phần cài đặt thêm ở Step 6):

```rust
#[cfg(test)]
mod tests {
    use serde::Deserialize;

    use super::*;

    /// File vector dùng chung với server (`server/test/vectors/scrub-v1.json`).
    const VECTORS: &str = include_str!("../../../server/test/vectors/scrub-v1.json");

    #[derive(Deserialize)]
    struct Vectors {
        scrub_defaults: ParamsJson,
        detect: Vec<Detect>,
        clean: Vec<Clean>,
        scrub: Vec<ScrubCase>,
    }

    #[derive(Deserialize, Clone)]
    struct ParamsJson {
        home: String,
        user: String,
        host: String,
    }

    #[derive(Deserialize)]
    struct Detect {
        name: String,
        text: String,
        rule: String,
    }

    #[derive(Deserialize)]
    struct Clean {
        name: String,
        text: String,
    }

    #[derive(Deserialize)]
    struct ScrubCase {
        name: String,
        params: Option<ParamsJson>,
        input: String,
        expected: String,
    }

    fn vectors() -> Vectors {
        serde_json::from_str(VECTORS).expect("file vector đọc được")
    }

    fn params(p: &ParamsJson) -> Params {
        Params {
            home: p.home.clone(),
            user: p.user.clone(),
            host: p.host.clone(),
        }
    }

    #[test]
    fn every_detect_vector_is_flagged_with_the_expected_rule() {
        for case in vectors().detect {
            let rule = find_sensitive(&case.text).map(Rule::as_str);
            assert_eq!(rule, Some(case.rule.as_str()), "{}", case.name);
        }
    }

    #[test]
    fn every_clean_vector_passes() {
        for case in vectors().clean {
            assert_eq!(find_sensitive(&case.text), None, "{}", case.name);
        }
    }

    #[test]
    fn every_scrub_vector_produces_the_expected_text_and_it_is_clean() {
        let v = vectors();
        for case in &v.scrub {
            let p = params(case.params.as_ref().unwrap_or(&v.scrub_defaults));
            let out = scrub(&case.input, &p);
            assert_eq!(out, case.expected, "{}", case.name);
            assert_eq!(find_sensitive(&out), None, "{}: kết quả còn mẫu nhạy cảm", case.name);
        }
    }

    #[test]
    fn scrubbing_twice_changes_nothing() {
        let v = vectors();
        let p = params(&v.scrub_defaults);
        for case in v.scrub.iter().filter(|c| c.params.is_none()) {
            let once = scrub(&case.input, &p);
            assert_eq!(scrub(&once, &p), once, "{}", case.name);
        }
    }

    #[test]
    fn a_debug_printed_windows_path_with_doubled_backslashes_is_scrubbed() {
        let p = Params {
            home: r"C:\Users\alice".into(),
            user: "alice".into(),
            host: "ALICE-PC".into(),
        };
        let out = scrub(r#"không mở được "C:\\Users\\alice\\AppData\\x.db""#, &p);
        assert_eq!(out, r#"không mở được "~\\AppData\\x.db""#);
        assert_eq!(find_sensitive(&out), None);
        let out = scrub("đọc C:/Users/Alice/AppData/x", &p);
        assert_eq!(out, "đọc ~/AppData/x");
    }

    #[test]
    fn a_root_like_home_is_never_replaced() {
        let p = Params {
            home: "/".into(),
            user: "root".into(),
            host: String::new(),
        };
        assert_eq!(scrub("mở /usr/local/bin", &p), "mở /usr/local/bin");
        let p = Params {
            home: "/root".into(),
            ..Params::default()
        };
        assert_eq!(scrub("mở /root/x", &p), "mở ~/x");
    }

    #[test]
    fn empty_params_replace_nothing() {
        assert_eq!(
            scrub("chữ bình thường alice", &Params::default()),
            "chữ bình thường alice"
        );
    }

    #[test]
    fn long_lines_do_not_make_the_matchers_slow() {
        let started = std::time::Instant::now();
        let p = Params::default();
        for text in [
            "a".repeat(60_000),
            "a.".repeat(30_000),
            "ABCD-".repeat(12_000),
            "v1.".repeat(20_000),
            "/Users/".repeat(8_000),
        ] {
            let _ = find_sensitive(&text);
            let _ = scrub(&text, &p);
        }
        assert!(
            started.elapsed() < std::time::Duration::from_secs(5),
            "{:?}",
            started.elapsed()
        );
    }
}
```

- [ ] **Step 5: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::scrub 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find …` cho `scrub`, `find_sensitive`, `Params`, `Rule` (chưa có cài đặt).

- [ ] **Step 6: Cài đặt**

Chèn đoạn sau vào **đầu** `scrub.rs`, phía trên `#[cfg(test)]` (giữ nguyên khối test):

```rust
//! Che dữ liệu cá nhân và phát hiện dữ liệu nhạy cảm còn sót trong báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2).
//!
//! Hợp đồng với server (`server/src/diagnostics-scan.ts`, `findSensitive`) là file vector chung `server/test/vectors/scrub-v1.json`:
//! test bên dưới nạp đúng file đó. Sửa mẫu ở đây thì sửa bản TypeScript và vector cùng lúc.
//! - Mọi `\b` là ASCII (`(?-u:\b)`) như JavaScript; mọi lượng từ có cận trên.
//! - Thứ tự che: Authorization, Bearer, token, key, email, query của URL, rồi thư mục home, tên máy, tên tài khoản.
//! - Thứ tự phát hiện (quy tắc đầu tiên khớp): key, token, Bearer, Authorization, email, đường dẫn home của người khác.

use std::sync::LazyLock;

use regex::Regex;

/// Quy tắc nhạy cảm; tên trong log và trong thông báo lỗi là `as_str`, trùng `SensitiveRule` của server.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Rule {
    LicenseKey,
    Token,
    Bearer,
    Authorization,
    Email,
    HomePath,
}

impl Rule {
    pub fn as_str(self) -> &'static str {
        match self {
            Rule::LicenseKey => "license_key",
            Rule::Token => "token",
            Rule::Bearer => "bearer",
            Rule::Authorization => "authorization",
            Rule::Email => "email",
            Rule::HomePath => "home_path",
        }
    }
}

const KEY_GROUPED: &str = r"(?-u:\b)(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{4}(?-u:\b)";
const KEY_PLAIN: &str = r"(?-u:\b)[0-9A-HJKMNP-TV-Z]{28}(?-u:\b)";
const TOKEN: &str = r"(?-u:\b)v1\.[A-Za-z0-9_-]{16,2048}\.[A-Za-z0-9_-]{16,2048}";
const BEARER: &str = r"(?i)(?-u:\b)bearer\s+[A-Za-z0-9._~+/=-]{8,2048}";
const AUTHORIZATION: &str = r"(?i)(?-u:\b)authorization\s*[:=]\s*[^\s<]";
const EMAIL: &str = r"[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}";
const UNIX_HOME: &str = r#"(?:^|[^A-Za-z0-9_])/(?:Users|home)/([^/\s"'<>:*?|\\]{1,128})"#;
const WINDOWS_HOME: &str = r#"(?i)[A-Za-z]:[\\/]{1,4}Users[\\/]{1,4}([^\\/\s"'<>:*?|]{1,128})"#;
/// Thư mục không phải của một người (so không phân biệt hoa thường; `All Users` bị cắt ở khoảng trắng nên là `all`).
const NEUTRAL_HOME_NAMES: [&str; 4] = ["shared", "public", "default", "all"];

// Chỉ để che (không phải để phát hiện).
const AUTH_LINE: &str = r"(?i)((?-u:\b)authorization\s*[:=]\s*)[^\r\n]+";
const BEARER_VALUE: &str = r"(?i)((?-u:\b)bearer\s+)[A-Za-z0-9._~+/=-]{8,2048}";
const URL_QUERY: &str = r#"(https?://[^\s?#"'<>]+)\?[^\s"'<>#]+"#;

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("mẫu regex cố định hợp lệ")
}

static R_KEY_GROUPED: LazyLock<Regex> = LazyLock::new(|| re(KEY_GROUPED));
static R_KEY_PLAIN: LazyLock<Regex> = LazyLock::new(|| re(KEY_PLAIN));
static R_TOKEN: LazyLock<Regex> = LazyLock::new(|| re(TOKEN));
static R_BEARER: LazyLock<Regex> = LazyLock::new(|| re(BEARER));
static R_AUTHORIZATION: LazyLock<Regex> = LazyLock::new(|| re(AUTHORIZATION));
static R_EMAIL: LazyLock<Regex> = LazyLock::new(|| re(EMAIL));
static R_UNIX_HOME: LazyLock<Regex> = LazyLock::new(|| re(UNIX_HOME));
static R_WINDOWS_HOME: LazyLock<Regex> = LazyLock::new(|| re(WINDOWS_HOME));
static R_AUTH_LINE: LazyLock<Regex> = LazyLock::new(|| re(AUTH_LINE));
static R_BEARER_VALUE: LazyLock<Regex> = LazyLock::new(|| re(BEARER_VALUE));
static R_URL_QUERY: LazyLock<Regex> = LazyLock::new(|| re(URL_QUERY));

/// Có đường dẫn `/Users/<tên>` hay `C:\Users\<tên>` mà `<tên>` không phải thư mục dùng chung.
fn has_personal_home(text: &str) -> bool {
    [&*R_UNIX_HOME, &*R_WINDOWS_HOME].iter().any(|r| {
        r.captures_iter(text).any(|c| {
            let name = c.get(1).map_or("", |m| m.as_str()).to_lowercase();
            !NEUTRAL_HOME_NAMES.contains(&name.as_str())
        })
    })
}

/// Quy tắc đầu tiên khớp, hoặc `None` nếu sạch. Cùng thứ tự với `findSensitive` của server.
pub fn find_sensitive(text: &str) -> Option<Rule> {
    if R_KEY_GROUPED.is_match(text) || R_KEY_PLAIN.is_match(text) {
        return Some(Rule::LicenseKey);
    }
    if R_TOKEN.is_match(text) {
        return Some(Rule::Token);
    }
    if R_BEARER.is_match(text) {
        return Some(Rule::Bearer);
    }
    if R_AUTHORIZATION.is_match(text) {
        return Some(Rule::Authorization);
    }
    if R_EMAIL.is_match(text) {
        return Some(Rule::Email);
    }
    if has_personal_home(text) {
        return Some(Rule::HomePath);
    }
    None
}

/// Thông tin của máy này để che: thư mục home, tên tài khoản và tên máy.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Params {
    pub home: String,
    pub user: String,
    pub host: String,
}

impl Params {
    /// Của máy đang chạy: biến môi trường của hệ điều hành và tên máy đã làm sạch (`license::device::label`).
    pub fn current(host: Option<String>) -> Self {
        let var = |names: &[&str]| names.iter().find_map(|n| std::env::var(n).ok()).unwrap_or_default();
        Self {
            home: var(&["HOME", "USERPROFILE"]),
            user: var(&["USER", "USERNAME"]),
            host: host.unwrap_or_default(),
        }
    }
}

/// Tên ngắn hơn ngần này ký tự thì không che theo từ (che "an" sẽ phá mọi chữ "an" trong log).
const MIN_NAME_CHARS: usize = 3;
/// Thư mục home ngắn hơn ngần này ký tự (ví dụ `/`) thì không che: che nó sẽ phá mọi đường dẫn.
const MIN_HOME_CHARS: usize = 4;

/// Che `text`: thứ tự và quy tắc ở đầu file.
pub fn scrub(text: &str, params: &Params) -> String {
    let mut out = R_AUTH_LINE.replace_all(text, "${1}<redacted>").into_owned();
    out = R_BEARER_VALUE.replace_all(&out, "${1}<redacted>").into_owned();
    out = R_TOKEN.replace_all(&out, "<token>").into_owned();
    out = R_KEY_GROUPED.replace_all(&out, "<key>").into_owned();
    out = R_KEY_PLAIN.replace_all(&out, "<key>").into_owned();
    out = R_EMAIL.replace_all(&out, "<email>").into_owned();
    out = R_URL_QUERY.replace_all(&out, "${1}?<query>").into_owned();
    out = replace_home(&out, &params.home);
    out = replace_name(&out, &params.host, "<host>");
    out = replace_name(&out, &params.user, "<user>");
    out
}

/// Thay thư mục home bằng `~`, ở ba dạng viết: nguyên văn, gạch chéo xuôi (Windows), và gạch chéo ngược gấp đôi (đường dẫn
/// in bằng `{:?}`). So không phân biệt hoa thường vì Windows không phân biệt.
fn replace_home(text: &str, home: &str) -> String {
    let home = home.trim_end_matches(['/', '\\']);
    if home.chars().count() < MIN_HOME_CHARS {
        return text.to_string();
    }
    let mut forms = vec![home.to_string()];
    if home.contains('\\') {
        forms.push(home.replace('\\', "/"));
        forms.push(home.replace('\\', "\\\\"));
    }
    // Dạng dài trước, để dạng gấp đôi không bị dạng một gạch ăn mất nửa.
    forms.sort_by_key(|f| std::cmp::Reverse(f.len()));
    let alternatives: Vec<String> = forms.iter().map(|f| regex::escape(f)).collect();
    let pattern = format!("(?i){}", alternatives.join("|"));
    re(&pattern).replace_all(text, "~").into_owned()
}

/// Thay một tên (tên máy, tên tài khoản) theo cả từ, không phân biệt hoa thường.
fn replace_name(text: &str, name: &str, with: &str) -> String {
    let name = name.trim();
    if name.chars().count() < MIN_NAME_CHARS {
        return text.to_string();
    }
    let pattern = format!(r"(?i)(?-u:\b){}(?-u:\b)", regex::escape(name));
    re(&pattern).replace_all(text, with).into_owned()
}
```

- [ ] **Step 7: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::scrub 2>&1 | tail -15
```
Expected: `test result: ok. 8 passed; 0 failed`. Nếu test đọc vector báo lệch, **không sửa vector**: vector là hợp đồng với server (kế hoạch 01 Task 2); sửa cài đặt cho khớp.

- [ ] **Step 8: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/Cargo.toml Cargo.lock src-tauri/src/lib.rs src-tauri/src/diagnostics && git commit -m "feat(app): che dữ liệu cá nhân và phát hiện dữ liệu sót cho báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chọn dòng log (`logs.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/logs.rs`

Spec §2: `app.log` lấy 300 dòng cuối; log của `asr-worker` và `llama-server` chỉ lấy dòng cảnh báo hay lỗi (`W`/`E` hay từ khóa như `error`, `panic`, `oom`) trong 60 dòng cuối; trần byte 24, 16, 16 KiB (cắt từ đầu, giữ phần mới nhất, không cắt giữa ký tự UTF-8). `FileLogs` đọc ba file ở thư mục log của app, chỉ phần cuối file (không nạp cả file log lớn vào bộ nhớ).

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `src-tauri/src/diagnostics/mod.rs`, thêm dòng này **trước** `pub mod scrub;` (giữ thứ tự bảng chữ cái):

```rust
pub mod logs;
```

Tạo `src-tauri/src/diagnostics/logs.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn numbered(n: usize) -> String {
        (1..=n).map(|i| format!("dòng {i}\n")).collect()
    }

    #[test]
    fn app_tail_keeps_the_last_300_lines() {
        let out = fit_tail(&app_lines(&numbered(1_000)), 1 << 20);
        let lines: Vec<&str> = out.lines().collect();
        assert_eq!(lines.len(), APP_LOG_LINES);
        assert_eq!(lines.first(), Some(&"dòng 701"));
        assert_eq!(lines.last(), Some(&"dòng 1000"));
        assert!(out.ends_with('\n'));
    }

    #[test]
    fn app_tail_of_a_short_or_empty_log_is_kept_whole() {
        assert_eq!(fit_tail(&app_lines("a\nb\n"), 1 << 20), "a\nb\n");
        assert_eq!(fit_tail(&app_lines(""), 1 << 20), "");
    }

    #[test]
    fn the_byte_cap_drops_the_oldest_lines_first() {
        let out = fit_tail(&app_lines(&numbered(300)), 100);
        assert!(out.len() <= 100, "{}", out.len());
        assert!(out.lines().last() == Some("dòng 300"));
        assert!(!out.contains("dòng 1\n"));
        // Không bao giờ cắt giữa một dòng.
        assert!(out.lines().all(|l| l.starts_with("dòng ")));
    }

    #[test]
    fn a_huge_line_is_capped_at_a_char_boundary() {
        let line = "ế".repeat(2_000);
        let out = fit_tail(&app_lines(&format!("{line}\nngắn\n")), 1 << 20);
        let first = out.lines().next().unwrap();
        assert!(first.ends_with('…'));
        assert!(first.len() <= MAX_LINE_BYTES + '…'.len_utf8());
        assert_eq!(out.lines().nth(1), Some("ngắn"));
    }

    #[test]
    fn sidecar_logs_keep_warnings_and_errors_plus_the_tail_in_original_order() {
        let mut text = String::new();
        for i in 0..400 {
            text.push_str(&format!("ggml_metal_library_compile_pipeline: loaded kernel_{i}\n"));
        }
        text.insert_str(0, "0.00.289.523 W load: special_eos_id is not in special_eog_ids\n");
        text.push_str("ggml_metal_init: error: failed to load library\n");
        for i in 0..70 {
            text.push_str(&format!("tail {i}\n"));
        }
        let lines = sidecar_lines(&text);
        let out = lines.join("\n");
        // 1 cảnh báo đầu, 1 dòng lỗi, rồi 60 dòng cuối (dòng lỗi nằm ngay trước 70 dòng đuôi nên một phần của nó đã trong đuôi).
        assert_eq!(
            lines[0],
            "0.00.289.523 W load: special_eos_id is not in special_eog_ids"
        );
        assert!(
            lines
                .iter()
                .any(|l| l == "ggml_metal_init: error: failed to load library")
        );
        assert_eq!(lines.last().map(String::as_str), Some("tail 69"));
        assert_eq!(lines.len(), 1 + 1 + 60);
        assert!(!out.contains("kernel_7\n"), "dòng biên dịch Metal bị bỏ");
    }

    #[test]
    fn warn_and_error_detection() {
        for line in [
            "0.00.289.523 W load: x",
            "1.02.003 E srv: y",
            "ggml_metal_init: error: failed",
            "llama_model_load: error loading model",
            "Out of memory",
            "thread panicked at",
            "OOM killer",
            "unable to open",
        ] {
            assert!(is_warn_or_error(line), "{line}");
        }
        for line in [
            "0.00.904.048 I cmn init: llama threadpool init, n_threads = 8",
            "ggml_metal_library_compile_pipeline: loaded kernel_mul_mv_q5_1_f32",
            "app us.zoom.xos đang phát",
            "whisper_init_state: compute buffer",
        ] {
            assert!(!is_warn_or_error(line), "{line}");
        }
    }

    #[test]
    fn file_logs_read_the_three_files_and_missing_ones_are_empty() {
        let dir = std::env::temp_dir().join(format!("mt-logs-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("app.log"), "một\nhai\n").unwrap();
        let logs = FileLogs { dir: dir.clone() };
        assert_eq!(logs.read(LogFile::App), "một\nhai\n");
        assert_eq!(logs.read(LogFile::Asr), "");
        assert_eq!(logs.read(LogFile::Llama), "");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_non_utf8_log_is_read_lossily() {
        let dir = std::env::temp_dir().join(format!("mt-logs-bad-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("app.log"), [b'o', b'k', 0xff, b'\n']).unwrap();
        let text = FileLogs { dir: dir.clone() }.read(LogFile::App);
        assert!(text.starts_with("ok") && text.contains('\u{fffd}'));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::logs 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find …` cho `app_lines`, `sidecar_lines`, `fit_tail`, `FileLogs`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `logs.rs`, phía trên `#[cfg(test)]`:

```rust
//! Chọn phần log đưa vào báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2): 300 dòng cuối của `app.log`; với log
//! của `asr-worker` và `llama-server` chỉ lấy dòng cảnh báo hay lỗi cộng 60 dòng cuối, bỏ hàng trăm dòng biên dịch Metal mỗi lần
//! mở. Mỗi log bị cắt theo byte, giữ phần mới nhất. Chưa che dữ liệu ở đây (việc của `scrub`).

use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::sync::LazyLock;

use regex::Regex;

/// Số dòng cuối của `app.log`.
pub const APP_LOG_LINES: usize = 300;
/// Số dòng cuối của log tiến trình phụ (ngoài các dòng cảnh báo hay lỗi).
pub const SIDECAR_TAIL_LINES: usize = 60;
/// Trần từng log, byte UTF-8 (cùng `LOG_LIMITS` của server, `server/src/error-reports.ts`).
pub const APP_LOG_MAX_BYTES: usize = 24 * 1024;
pub const ASR_LOG_MAX_BYTES: usize = 16 * 1024;
pub const LLAMA_LOG_MAX_BYTES: usize = 16 * 1024;
/// Một dòng dài hơn thế bị cắt (một dòng JSON hay stderr khổng lồ không được chiếm hết phần của log).
const MAX_LINE_BYTES: usize = 1024;
/// Chỉ đọc phần cuối của file lớn hơn thế (file log xoay vòng ở 1 MB, đây là lưới an toàn).
const MAX_READ_BYTES: u64 = 4 * 1024 * 1024;

/// Ba file log của app.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogFile {
    App,
    Asr,
    Llama,
}

impl LogFile {
    pub fn file_name(self) -> &'static str {
        match self {
            LogFile::App => "app.log",
            LogFile::Asr => "asr-worker.log",
            LogFile::Llama => "llama-server.log",
        }
    }
}

/// Nơi đọc log, để test thay bằng bản giả.
pub trait LogSource: Send + Sync {
    /// Nội dung log (rỗng nếu chưa có hay không đọc được).
    fn read(&self, file: LogFile) -> String;
}

/// Log thật trong thư mục log của app.
pub struct FileLogs {
    pub dir: PathBuf,
}

impl LogSource for FileLogs {
    fn read(&self, file: LogFile) -> String {
        read_tail(&self.dir.join(file.file_name())).unwrap_or_default()
    }
}

fn read_tail(path: &std::path::Path) -> std::io::Result<String> {
    let mut f = std::fs::File::open(path)?;
    let len = f.metadata()?.len();
    if len > MAX_READ_BYTES {
        f.seek(SeekFrom::Start(len - MAX_READ_BYTES))?;
    }
    let mut bytes = Vec::new();
    f.take(MAX_READ_BYTES).read_to_end(&mut bytes)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

/// llama-server: `0.00.289.523 W load: …` (mức W hay E sau mốc thời gian).
static LEVEL_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+(?:\.\d+){2,3} [WE] ").expect("mẫu cố định"));
static KEYWORDS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r"(?i)error|fail|abort|assert|out of memory|(?-u:\b)oom(?-u:\b)|fatal|panic|crash|unable|cannot|exception",
    )
    .expect("mẫu cố định")
});

/// Dòng cảnh báo hay lỗi của log tiến trình phụ.
pub fn is_warn_or_error(line: &str) -> bool {
    LEVEL_LINE.is_match(line) || KEYWORDS.is_match(line)
}

/// Cắt dòng quá dài ở ranh giới ký tự, thêm "…".
fn cap_line(line: &str) -> String {
    let line = line.trim_end_matches('\r');
    if line.len() <= MAX_LINE_BYTES {
        return line.to_string();
    }
    let mut end = MAX_LINE_BYTES;
    while !line.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &line[..end])
}

/// Giữ các dòng mới nhất sao cho tổng (kể cả dấu xuống dòng) không quá `max_bytes`.
pub fn fit_tail(lines: &[String], max_bytes: usize) -> String {
    let mut used = 0usize;
    let mut first = lines.len();
    for (i, line) in lines.iter().enumerate().rev() {
        let cost = line.len() + 1;
        if used + cost > max_bytes {
            break;
        }
        used += cost;
        first = i;
    }
    let mut out = String::with_capacity(used);
    for line in &lines[first..] {
        out.push_str(line);
        out.push('\n');
    }
    out
}

/// `app.log`: `APP_LOG_LINES` dòng cuối, mỗi dòng đã cắt độ dài. Chưa cắt theo byte: người gọi che dữ liệu từng dòng rồi mới
/// `fit_tail`, vì che có thể làm dòng dài ra (tên tài khoản 3 ký tự thành `<user>`).
pub fn app_lines(text: &str) -> Vec<String> {
    let all: Vec<&str> = text.lines().collect();
    let from = all.len().saturating_sub(APP_LOG_LINES);
    all[from..].iter().map(|l| cap_line(l)).collect()
}

/// Log của tiến trình phụ: dòng cảnh báo hay lỗi, cộng `SIDECAR_TAIL_LINES` dòng cuối, giữ thứ tự gốc.
pub fn sidecar_lines(text: &str) -> Vec<String> {
    let all: Vec<&str> = text.lines().collect();
    let tail_from = all.len().saturating_sub(SIDECAR_TAIL_LINES);
    all.iter()
        .enumerate()
        .filter(|(i, line)| *i >= tail_from || is_warn_or_error(line))
        .map(|(_, line)| cap_line(line))
        .collect()
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::logs 2>&1 | tail -15
```
Expected: `test result: ok. 8 passed; 0 failed`.

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): chọn dòng log đưa vào báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dựng báo cáo (`report.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/report.rs`

`build` ghép JSON đúng hợp đồng của kế hoạch 01: che từng dòng log, **kiểm lại mọi chuỗi tự do bằng `find_sensitive` (fail closed: còn mẫu nhạy cảm thì không có báo cáo)**, rồi cắt dần phần cũ của ba log (mỗi vòng còn 3/4, tối đa 8 vòng) cho tới khi JSON ≤ 64 KB. Dấu vân tay là 16 hex đầu của SHA-256 trên `loại|mã|vị trí` (không gồm phiên bản app, để một lỗi qua nhiều bản vẫn là một nhóm); báo cáo gửi tay dùng `0000000000000000`. Mã báo cáo `R-XXXX-XXXX` dùng bảng Crockford base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (cùng bảng với key bản quyền, test Node ở Task 14 giữ hai bên khớp).

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod report;` sau `pub mod logs;` (trước `pub mod scrub;`).

Tạo `src-tauri/src/diagnostics/report.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> Facts {
        Facts {
            app_version: "0.1.10".into(),
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
        }
    }

    fn event() -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some("sidecarFailed".into()),
            location: String::new(),
            message: "tiến trình phụ không khởi động được".into(),
            at: 1_790_812_740,
        }
    }

    fn params() -> Params {
        Params {
            home: "/Users/alice".into(),
            user: "alice".into(),
            host: "alice-mbp".into(),
        }
    }

    fn parsed(report: &Report) -> Value {
        serde_json::from_str(&report.json).unwrap()
    }

    #[test]
    fn ids_have_the_shape_the_server_wants() {
        let valid = regex::Regex::new(r"^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$").unwrap();
        for _ in 0..200 {
            let id = new_id();
            assert!(valid.is_match(&id), "{id}");
        }
        assert_eq!(id_from_bytes([0, 0, 0, 0, 0]), "R-0000-0000");
        assert_eq!(id_from_bytes([0xFF; 5]), "R-ZZZZ-ZZZZ");
        assert_ne!(new_id(), new_id());
    }

    #[test]
    fn fingerprints_group_the_same_error_and_split_different_ones() {
        let a = fingerprint(Kind::SessionError, Some("sidecarFailed"), "");
        assert_eq!(a.len(), 16);
        assert!(a.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_eq!(a, fingerprint(Kind::SessionError, Some("sidecarFailed"), ""));
        assert_ne!(a, fingerprint(Kind::SessionError, Some("modelBroken"), ""));
        assert_ne!(a, fingerprint(Kind::SidecarDied, Some("sidecarFailed"), ""));
        assert_ne!(
            fingerprint(Kind::Crash, Some("panic"), "src-tauri/src/a.rs:1"),
            fingerprint(Kind::Crash, Some("panic"), "src-tauri/src/a.rs:2")
        );
        assert_eq!(fingerprint(Kind::Manual, None, "x"), ZERO_FINGERPRINT);
        assert_ne!(
            fingerprint(Kind::Crash, Some("unclean_exit"), "unclean"),
            ZERO_FINGERPRINT
        );
    }

    #[test]
    fn panic_locations_drop_the_build_machines_path() {
        assert_eq!(
            location_key("/Users/runner/work/ai-translator/src-tauri/src/session.rs", 12),
            "src-tauri/src/session.rs:12"
        );
        assert_eq!(
            location_key(r"C:\a\ai-translator\crates\pipeline\src\engine.rs", 7),
            "crates/pipeline/src/engine.rs:7"
        );
        assert_eq!(
            location_key("/rustc/abc/library/core/src/option.rs", 3),
            "src/option.rs:3"
        );
        assert_eq!(location_key("main.rs", 1), "main.rs:1");
    }

    #[test]
    fn meta_strings_lose_control_characters_and_are_capped() {
        assert_eq!(clean_meta("Apple M4\n Pro\t", 128).as_deref(), Some("Apple M4 Pro"));
        assert_eq!(clean_meta("abcdef", 3).as_deref(), Some("abc"));
        assert_eq!(clean_meta("\n\t ", 10), None);
    }

    #[test]
    fn a_built_report_has_exactly_the_contract_shape() {
        let logs = RawLogs {
            app: "[2026-10-17][05:07:12][INFO][x] a\n".into(),
            asr: "ggml: error: boom\n".into(),
            llama: "0.00.1.2 W load: w\n".into(),
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert_eq!(report.id, "R-7F3K-92QD");
        assert_eq!(
            report.fingerprint,
            fingerprint(Kind::SessionError, Some("sidecarFailed"), "")
        );
        let v = parsed(&report);
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "app",
                "at",
                "build",
                "code",
                "device_id_hash",
                "fingerprint",
                "hw",
                "id",
                "kind",
                "logs",
                "message",
                "model_pack",
                "os",
                "plan",
                "ui_lang",
                "v"
            ]
        );
        assert_eq!(v["v"], 1);
        assert_eq!(v["kind"], "session_error");
        assert_eq!(v["code"], "sidecarFailed");
        assert_eq!(v["app"], json!({ "version": "0.1.10" }));
        assert_eq!(
            v["os"],
            json!({ "name": "macos", "version": "15.6.1", "arch": "aarch64" })
        );
        assert_eq!(
            v["hw"],
            json!({ "chip": "Apple M4 Pro", "ram_mb": 24576, "gpu_backend": "metal" })
        );
        assert_eq!(v["logs"]["asr"], "ggml: error: boom\n");
        assert_eq!(v["at"], 1_790_812_740_i64);
    }

    #[test]
    fn a_manual_report_has_no_code_and_the_zero_fingerprint() {
        let manual = Event {
            kind: Kind::Manual,
            code: None,
            location: String::new(),
            message: String::new(),
            at: 1,
        };
        let report = build(&manual, &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        let v = parsed(&report);
        assert_eq!(v["code"], Value::Null);
        assert_eq!(v["fingerprint"], ZERO_FINGERPRINT);
        assert_eq!(v["kind"], "manual");
    }

    #[test]
    fn personal_data_is_scrubbed_from_the_message_and_every_log() {
        let logs = RawLogs {
            app: "mở /Users/alice/Library/Application Support/x.db cho alice\n".into(),
            asr: "model '/Users/alice/models/w.bin' máy alice-mbp\n".into(),
            llama: "liên hệ an@example.com key 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF\n".into(),
        };
        let mut e = event();
        e.message = "không mở được /Users/alice/x".into();
        let report = build(&e, &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        let v = parsed(&report);
        assert_eq!(v["message"], "không mở được ~/x");
        assert_eq!(v["logs"]["app"], "mở ~/Library/Application Support/x.db cho <user>\n");
        assert_eq!(v["logs"]["asr"], "model '~/models/w.bin' máy <host>\n");
        assert_eq!(v["logs"]["llama"], "liên hệ <email> key <key>\n");
        assert!(!report.json.contains("alice"));
    }

    #[test]
    fn leftover_sensitive_data_cancels_the_whole_report() {
        // Thư mục home của NGƯỜI KHÁC: `scrub` chỉ che home của máy này, nên mẫu này còn lại và bị phát hiện.
        let logs = RawLogs {
            app: "đọc /Users/bob/Library/x\n".into(),
            ..RawLogs::default()
        };
        assert_eq!(
            build(&event(), &facts(), &logs, &params(), "R-0000-0001".into()),
            Err(BuildError::Sensitive("home_path"))
        );
        // Cả thông tin máy cũng bị kiểm.
        let mut f = facts();
        f.chip = Some("a@b.co".into());
        assert_eq!(
            build(&event(), &f, &RawLogs::default(), &params(), "R-0000-0001".into()),
            Err(BuildError::Sensitive("email"))
        );
    }

    #[test]
    fn the_message_is_capped_at_500_chars() {
        let mut e = event();
        e.message = "ế".repeat(900);
        let report = build(&e, &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        assert_eq!(
            parsed(&report)["message"].as_str().unwrap().chars().count(),
            MAX_MESSAGE_CHARS
        );
    }

    #[test]
    fn full_logs_still_fit_in_64_kb_and_keep_the_newest_lines() {
        let big = |tag: &str| {
            (0..3_000)
                .map(|i| format!("{tag} dòng số {i} có chữ có dấu ế ế ế\n"))
                .collect::<String>()
        };
        let logs = RawLogs {
            app: big("app"),
            asr: big("asr"),
            llama: big("llama"),
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert!(report.json.len() <= MAX_REPORT_BYTES, "{}", report.json.len());
        let v = parsed(&report);
        assert!(v["logs"]["app"].as_str().unwrap().len() <= APP_LOG_MAX_BYTES);
        assert!(
            v["logs"]["app"]
                .as_str()
                .unwrap()
                .ends_with("app dòng số 2999 có chữ có dấu ế ế ế\n")
        );
        assert!(v["logs"]["asr"].as_str().unwrap().len() <= ASR_LOG_MAX_BYTES);
    }

    #[test]
    fn json_escaping_is_accounted_for_when_the_logs_are_full_of_quotes() {
        // Mỗi `"` thành `\"` trong JSON: 16 KiB log đầy dấu nháy gần gấp đôi khi escape.
        let quoted = "\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\n".repeat(900);
        let logs = RawLogs {
            app: quoted.clone(),
            asr: quoted.clone(),
            llama: quoted,
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert!(report.json.len() <= MAX_REPORT_BYTES, "{}", report.json.len());
    }

    #[test]
    fn a_distinctive_transcript_in_the_inputs_is_not_invented_by_the_builder() {
        // Người gọi không bao giờ đưa chữ chép lời vào: builder chỉ chép những gì nó được đưa, nên kiểm ở bước tích hợp
        // (test_app) rằng log của một phiên thật không có chữ đó. Ở đây chỉ khẳng định builder không thêm gì ngoài đầu vào.
        let report = build(&event(), &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        assert!(!report.json.contains("Hello everyone"));
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::report 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find …` cho `build`, `Event`, `Facts`, `fingerprint`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `report.rs`, phía trên `#[cfg(test)]`:

```rust
//! Dựng báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2): chọn log, che dữ liệu, kiểm lần cuối (fail closed), ghép JSON
//! đúng hợp đồng của `POST /v1/diagnostics` (kế hoạch bao-cao-loi-01, mục "Hợp đồng") và giữ trong 64 KB.
//!
//! Không bao giờ có trong báo cáo: âm thanh, chữ chép lời, bản dịch, key, token, email, tên tài khoản, tên máy, đường dẫn thư mục
//! cá nhân. Ngoài việc che, mỗi chuỗi tự do còn qua `scrub::find_sensitive`: còn mẫu nhạy cảm thì bỏ cả báo cáo.

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::logs::{APP_LOG_MAX_BYTES, ASR_LOG_MAX_BYTES, LLAMA_LOG_MAX_BYTES, app_lines, fit_tail, sidecar_lines};
use super::scrub::{self, Params};

/// Trần cả báo cáo (JSON), byte. Server nhận tới 80 KB (`MAX_BODY_BYTES`), phần dư cho cách escape.
pub const MAX_REPORT_BYTES: usize = 64 * 1024;
/// Trần câu lỗi, ký tự (cùng `MAX_MESSAGE_CHARS` của server).
pub const MAX_MESSAGE_CHARS: usize = 500;
/// Dấu vân tay của báo cáo gửi tay: không thuộc nhóm lỗi nào.
pub const ZERO_FINGERPRINT: &str = "0000000000000000";
const ID_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Loại báo cáo (`kind` của server).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Crash,
    SessionError,
    SidecarDied,
    Manual,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Crash => "crash",
            Kind::SessionError => "session_error",
            Kind::SidecarDied => "sidecar_died",
            Kind::Manual => "manual",
        }
    }
}

/// Điều vừa xảy ra.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub kind: Kind,
    /// Mã lỗi (`sidecarFailed`, `panic`, `unclean_exit`, `asr`…); `None` với báo cáo gửi tay.
    pub code: Option<String>,
    /// Vị trí để nhóm lỗi: `file:line` của panic, `which` của tiến trình phụ, `unclean`; rỗng nếu không có.
    pub location: String,
    pub message: String,
    /// Giờ Unix (giây) lúc xảy ra.
    pub at: i64,
}

/// Thông tin máy và app, đã đọc sẵn (xem `machine.rs` và `mod.rs`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Facts {
    pub app_version: String,
    /// `release` hay `debug`.
    pub build: &'static str,
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub chip: Option<String>,
    pub ram_mb: Option<u64>,
    /// `metal`, `vulkan` hay `cpu`; `None` nếu `asr-worker` chưa chạy lần nào.
    pub gpu_backend: Option<String>,
    pub model_pack: Option<String>,
    /// `free`, `monthly`, `six_months`, `yearly` (không có key).
    pub plan: Option<String>,
    pub ui_lang: String,
    pub device_id_hash: String,
}

/// Nội dung thô của ba file log (chưa chọn dòng, chưa che).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawLogs {
    pub app: String,
    pub asr: String,
    pub llama: String,
}

/// Báo cáo đã dựng, sẵn sàng gửi hay xếp hàng.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub id: String,
    pub kind: Kind,
    pub fingerprint: String,
    pub json: String,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum BuildError {
    #[error("còn dữ liệu nhạy cảm ({0}) sau khi che: bỏ báo cáo")]
    Sensitive(&'static str),
    #[error("báo cáo vẫn quá lớn ({0} byte) sau khi cắt log")]
    TooLarge(usize),
}

/// Mã báo cáo ngẫu nhiên `R-XXXX-XXXX` (40 bit, bảng Crockford base32): người dùng đọc nó cho bộ phận hỗ trợ.
pub fn new_id() -> String {
    let mut bytes = [0u8; 5];
    getrandom::fill(&mut bytes).expect("hệ điều hành có nguồn ngẫu nhiên");
    id_from_bytes(bytes)
}

fn id_from_bytes(bytes: [u8; 5]) -> String {
    let bits = bytes.iter().fold(0u64, |acc, b| (acc << 8) | u64::from(*b));
    let symbol = |i: u32| ID_ALPHABET[((bits >> (35 - 5 * i)) & 31) as usize] as char;
    let first: String = (0..4).map(symbol).collect();
    let second: String = (4..8).map(symbol).collect();
    format!("R-{first}-{second}")
}

/// Dấu vân tay của lỗi: 16 hex đầu của SHA-256 trên `loại|mã|vị trí` (không gồm phiên bản app, để một lỗi qua nhiều bản vẫn
/// là một nhóm). Báo cáo gửi tay không có dấu vân tay.
pub fn fingerprint(kind: Kind, code: Option<&str>, location: &str) -> String {
    if kind == Kind::Manual {
        return ZERO_FINGERPRINT.to_string();
    }
    let input = format!("{}|{}|{}", kind.as_str(), code.unwrap_or(""), location);
    Sha256::digest(input.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Vị trí panic để nhóm lỗi: bỏ phần đường dẫn của máy build, giữ từ thư mục `src-tauri` hay `crates` trở đi (không thì hai
/// thành phần cuối), dùng `/`; kèm số dòng.
pub fn location_key(file: &str, line: u32) -> String {
    let parts: Vec<&str> = file.split(['/', '\\']).filter(|p| !p.is_empty()).collect();
    let start = parts
        .iter()
        .rposition(|p| *p == "src-tauri" || *p == "crates")
        .unwrap_or_else(|| parts.len().saturating_sub(2));
    format!("{}:{line}", parts[start..].join("/"))
}

/// Chuỗi thông tin máy hợp lệ với server: bỏ ký tự điều khiển, cắt còn `max` ký tự; rỗng thì `None`.
pub fn clean_meta(value: &str, max: usize) -> Option<String> {
    let cleaned: String = value.chars().filter(|c| !c.is_control()).take(max).collect();
    let cleaned = cleaned.trim().to_string();
    (!cleaned.is_empty()).then_some(cleaned)
}

fn truncate_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// Các dòng log đã chọn và che, chưa cắt theo byte.
struct Scrubbed {
    app: Vec<String>,
    asr: Vec<String>,
    llama: Vec<String>,
}

fn select_and_scrub(logs: &RawLogs, params: &Params) -> Scrubbed {
    let each = |lines: Vec<String>| -> Vec<String> { lines.iter().map(|l| scrub::scrub(l, params)).collect() };
    Scrubbed {
        app: each(app_lines(&logs.app)),
        asr: each(sidecar_lines(&logs.asr)),
        llama: each(sidecar_lines(&logs.llama)),
    }
}

fn assemble(id: &str, event: &Event, facts: &Facts, message: &str, logs: [&str; 3]) -> String {
    let value: Value = json!({
        "v": 1,
        "id": id,
        "kind": event.kind.as_str(),
        "code": event.code,
        "fingerprint": fingerprint(event.kind, event.code.as_deref(), &event.location),
        "at": event.at,
        "message": message,
        "build": facts.build,
        "app": { "version": facts.app_version },
        "os": { "name": facts.os_name, "version": facts.os_version, "arch": facts.arch },
        "hw": { "chip": facts.chip, "ram_mb": facts.ram_mb, "gpu_backend": facts.gpu_backend },
        "model_pack": facts.model_pack,
        "plan": facts.plan,
        "ui_lang": facts.ui_lang,
        "device_id_hash": facts.device_id_hash,
        "logs": { "app": logs[0], "asr": logs[1], "llama": logs[2] },
    });
    value.to_string()
}

/// Dựng báo cáo `id` cho `event`. Che dữ liệu bằng `params`; còn mẫu nhạy cảm ở bất kỳ chuỗi tự do nào (câu lỗi, log, thông tin
/// máy) thì trả `BuildError::Sensitive` và không có báo cáo nào (fail closed). Quá 64 KB thì cắt dần phần cũ nhất của mỗi log.
pub fn build(event: &Event, facts: &Facts, raw: &RawLogs, params: &Params, id: String) -> Result<Report, BuildError> {
    let message = truncate_chars(&scrub::scrub(&event.message, params), MAX_MESSAGE_CHARS);
    let scrubbed = select_and_scrub(raw, params);

    let free_strings = [
        Some(message.as_str()),
        facts.chip.as_deref(),
        facts.model_pack.as_deref(),
        Some(facts.os_version.as_str()),
        Some(facts.app_version.as_str()),
    ];
    let log_lines = scrubbed
        .app
        .iter()
        .chain(&scrubbed.asr)
        .chain(&scrubbed.llama)
        .map(String::as_str);
    for text in free_strings.into_iter().flatten().chain(log_lines) {
        if let Some(rule) = scrub::find_sensitive(text) {
            return Err(BuildError::Sensitive(rule.as_str()));
        }
    }

    let mut caps = [APP_LOG_MAX_BYTES, ASR_LOG_MAX_BYTES, LLAMA_LOG_MAX_BYTES];
    let mut size = 0;
    for _ in 0..8 {
        let logs = [
            fit_tail(&scrubbed.app, caps[0]),
            fit_tail(&scrubbed.asr, caps[1]),
            fit_tail(&scrubbed.llama, caps[2]),
        ];
        let json = assemble(&id, event, facts, &message, [&logs[0], &logs[1], &logs[2]]);
        if json.len() <= MAX_REPORT_BYTES {
            let fingerprint = fingerprint(event.kind, event.code.as_deref(), &event.location);
            return Ok(Report {
                id,
                kind: event.kind,
                fingerprint,
                json,
            });
        }
        size = json.len();
        caps = caps.map(|c| c * 3 / 4);
    }
    Err(BuildError::TooLarge(size))
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::report 2>&1 | tail -15
```
Expected: `test result: ok. 12 passed; 0 failed`.

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): dựng báo cáo lỗi đúng hợp đồng, che dữ liệu và fail closed" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Thông tin máy (`machine.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/machine.rs`

`system_info` trả tên hệ điều hành (`macos`/`windows`), phiên bản, kiến trúc và tên chip. macOS đọc `sysctlbyname` (`kern.osproductversion`, `machdep.cpu.brand_string`); Windows đọc registry (`CurrentBuildNumber` thành `10.0.<build>`, `ProcessorNameString`). Không gọi lệnh ngoài, không đọc tên máy hay tên tài khoản.

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod machine;` sau `pub mod logs;`.

Tạo `src-tauri/src/diagnostics/machine.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_basic_facts_are_filled_in_on_a_supported_os() {
        let info = system_info();
        assert!(!info.os_name.is_empty() && !info.arch.is_empty());
        if cfg!(any(target_os = "macos", windows)) {
            assert_ne!(info.os_version, "unknown");
            assert!(info.chip.as_deref().is_some_and(|c| !c.is_empty()), "{info:?}");
        }
        if cfg!(target_os = "macos") {
            assert_eq!(info.os_name, "macos");
            assert!(info.os_version.split('.').count() >= 2, "{}", info.os_version);
        }
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::machine 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find function system_info`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `machine.rs`, phía trên `#[cfg(test)]`:

```rust
//! Thông tin hệ điều hành và CPU cho báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2). RAM lấy từ
//! `models::machine::total_ram_bytes` (đã có), backend GPU từ sự kiện của tiến trình phụ; ở đây chỉ phần còn thiếu.

/// Tên hệ điều hành, phiên bản, kiến trúc và tên chip hay CPU.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SystemInfo {
    /// `macos` hay `windows` (`std::env::consts::OS`).
    pub os_name: &'static str,
    pub os_version: String,
    /// `aarch64` hay `x86_64` (`std::env::consts::ARCH`).
    pub arch: &'static str,
    /// `Apple M4 Pro`, `Intel(R) Core(TM) i7-1185G7 @ 3.00GHz`…
    pub chip: Option<String>,
}

pub fn system_info() -> SystemInfo {
    SystemInfo {
        os_name: std::env::consts::OS,
        os_version: platform::os_version().unwrap_or_else(|| "unknown".to_string()),
        arch: std::env::consts::ARCH,
        chip: platform::chip(),
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::CStr;

    /// Đọc một chuỗi của `sysctlbyname`.
    fn sysctl_string(name: &CStr) -> Option<String> {
        let mut len: usize = 0;
        // SAFETY: lần gọi đầu chỉ hỏi độ dài (không có vùng nhớ ra); `len` sống suốt lời gọi.
        let rc = unsafe { libc::sysctlbyname(name.as_ptr(), std::ptr::null_mut(), &mut len, std::ptr::null_mut(), 0) };
        if rc != 0 || len == 0 {
            return None;
        }
        let mut buf = vec![0u8; len];
        // SAFETY: `buf` đủ `len` byte và sống suốt lời gọi.
        let rc = unsafe {
            libc::sysctlbyname(
                name.as_ptr(),
                buf.as_mut_ptr().cast(),
                &mut len,
                std::ptr::null_mut(),
                0,
            )
        };
        if rc != 0 {
            return None;
        }
        buf.truncate(len);
        while buf.last() == Some(&0) {
            buf.pop();
        }
        String::from_utf8(buf).ok().filter(|s| !s.is_empty())
    }

    pub fn os_version() -> Option<String> {
        sysctl_string(c"kern.osproductversion")
    }

    pub fn chip() -> Option<String> {
        sysctl_string(c"machdep.cpu.brand_string")
    }
}

#[cfg(windows)]
mod platform {
    use windows::Win32::System::Registry::{HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RegGetValueW};
    use windows::core::{PCWSTR, w};

    /// Đọc một giá trị chuỗi của `HKLM`.
    fn registry_string(subkey: PCWSTR, value: PCWSTR) -> Option<String> {
        let mut buf = [0u16; 256];
        let mut size = std::mem::size_of_val(&buf) as u32;
        // SAFETY: `buf` và `size` sống suốt lời gọi; `size` là số byte của `buf`.
        let rc = unsafe {
            RegGetValueW(
                HKEY_LOCAL_MACHINE,
                subkey,
                value,
                RRF_RT_REG_SZ,
                None,
                Some(buf.as_mut_ptr().cast()),
                Some(&mut size),
            )
        };
        if rc.is_err() {
            return None;
        }
        let chars = (size as usize / 2).saturating_sub(1);
        let text = String::from_utf16_lossy(&buf[..chars.min(buf.len())]);
        Some(text.trim().to_string()).filter(|s| !s.is_empty())
    }

    /// Windows báo `10.0` cho cả Windows 10 và 11; số bản dựng (`26100`) mới phân biệt được.
    pub fn os_version() -> Option<String> {
        registry_string(
            w!("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion"),
            w!("CurrentBuildNumber"),
        )
        .map(|build| format!("10.0.{build}"))
    }

    pub fn chip() -> Option<String> {
        registry_string(
            w!("HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0"),
            w!("ProcessorNameString"),
        )
    }
}

#[cfg(not(any(target_os = "macos", windows)))]
mod platform {
    pub fn os_version() -> Option<String> {
        None
    }

    pub fn chip() -> Option<String> {
        None
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::machine 2>&1 | tail -15
```
Expected: `test result: ok. 1 passed; 0 failed`.

- [ ] **Step 5: fmt, clippy, kiểm code Windows biên dịch được, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ./scripts/check-windows.sh --locked 2>&1 | tail -5
```
Expected: kết thúc không lỗi (nhánh Windows của `machine.rs` dùng `windows::Win32::System::Registry`; script này chạy clippy cho target Windows).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): đọc hệ điều hành và chip cho báo cáo lỗi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Hàng đợi trên đĩa (`queue.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/queue.rs`

Giới hạn của spec §1 nằm ở đây: hàng đợi tối đa **5** báo cáo (`QUEUE_CAP`), **1** báo cáo cho mỗi dấu vân tay trong **24 giờ** (`PER_FINGERPRINT_SECONDS`), tối đa **5** báo cáo mỗi ngày UTC (`MAX_PER_DAY`), thử gửi tối đa **3** lần (`MAX_ATTEMPTS`) rồi bỏ. `admit` quyết định trước khi tốn công dựng báo cáo; `push` ghi file `{số thứ tự 8 chữ số}-{mã}.json` (ghi nguyên tử: viết file tạm rồi đổi tên); `state.json` nhớ ngày, số báo cáo trong ngày và giờ gửi gần nhất của từng dấu vân tay. File hỏng thì bị bỏ qua chứ không làm app lỗi.

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod queue;` sau `pub mod machine;`.

Tạo `src-tauri/src/diagnostics/queue.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::report::Kind;

    const T0: i64 = 1_790_812_800; // 2026-10-01T00:00:00Z, đầu một ngày UTC

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-queue-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn report(n: u32) -> Report {
        Report {
            id: format!("R-0000-{n:04}"),
            kind: Kind::SessionError,
            fingerprint: format!("{n:016x}"),
            json: format!("{{\"n\":{n}}}"),
        }
    }

    #[test]
    fn the_same_fingerprint_is_admitted_once_per_24_hours() {
        let dir = temp("fp");
        let q = Queue::new(dir.clone());
        assert!(q.admit("aaaa", T0));
        assert!(!q.admit("aaaa", T0 + 60));
        assert!(!q.admit("aaaa", T0 + PER_FINGERPRINT_SECONDS - 1));
        assert!(q.admit("bbbb", T0 + 60), "dấu vân tay khác thì được");
        assert!(q.admit("aaaa", T0 + PER_FINGERPRINT_SECONDS), "đủ 24 giờ thì được lại");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn at_most_five_reports_a_utc_day() {
        let dir = temp("day");
        let q = Queue::new(dir.clone());
        for i in 0..MAX_PER_DAY {
            assert!(q.admit(&format!("fp{i}"), T0 + i64::from(i)), "{i}");
        }
        assert!(!q.admit("fp-khác", T0 + 100), "báo cáo thứ 6 trong ngày");
        // Ngày UTC kế tiếp: bộ đếm về 0, và các dấu vân tay đã quá 24 giờ thì được lại.
        assert!(q.admit("fp-khác", T0 + DAY_SECONDS));
        assert!(q.admit("fp0", T0 + DAY_SECONDS + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_new_utc_day_resets_the_counter_but_not_the_24_hour_rule_of_a_fingerprint() {
        let dir = temp("midnight");
        let q = Queue::new(dir.clone());
        let late = T0 + DAY_SECONDS - 100;
        assert!(q.admit("late", late));
        let early_next_day = T0 + DAY_SECONDS + 10;
        assert!(
            !q.admit("late", early_next_day),
            "mới 110 giây, chưa đủ 24 giờ dù đã sang ngày mới"
        );
        for i in 0..MAX_PER_DAY {
            assert!(
                q.admit(&format!("new{i}"), early_next_day + i64::from(i)),
                "bộ đếm ngày mới bắt đầu từ 0: {i}"
            );
        }
        assert!(!q.admit("new-nữa", early_next_day + 50));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_state_file_starts_over_instead_of_blocking_forever() {
        let dir = temp("corrupt-state");
        let q = Queue::new(dir.clone());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("state.json"), b"khong phai json").unwrap();
        assert!(q.admit("aaaa", T0));
        assert!(!q.admit("aaaa", T0 + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn admission_is_refused_when_the_state_cannot_be_written() {
        let dir = temp("readonly");
        // `state.json` là một thư mục: không ghi được.
        std::fs::create_dir_all(dir.join("state.json")).unwrap();
        assert!(!Queue::new(dir.clone()).admit("aaaa", T0));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_queue_keeps_the_five_newest_reports_oldest_first() {
        let dir = temp("cap");
        let q = Queue::new(dir.clone());
        for n in 1..=7 {
            q.push(&report(n), T0 + i64::from(n)).unwrap();
        }
        let ids: Vec<String> = q.pending().into_iter().map(|p| p.id).collect();
        assert_eq!(
            ids,
            [
                "R-0000-0003",
                "R-0000-0004",
                "R-0000-0005",
                "R-0000-0006",
                "R-0000-0007"
            ]
        );
        assert_eq!(q.pending()[0].report, "{\"n\":3}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reports_queued_in_the_same_second_keep_their_order() {
        let dir = temp("same-second");
        let q = Queue::new(dir.clone());
        // Mã báo cáo ngẫu nhiên: nếu thứ tự lấy theo tên mã thì có lúc ra ngược.
        for n in [9, 3, 7, 1, 5] {
            q.push(&report(n), T0).unwrap();
        }
        let ids: Vec<String> = q.pending().into_iter().map(|p| p.id).collect();
        assert_eq!(
            ids,
            [
                "R-0000-0009",
                "R-0000-0003",
                "R-0000-0007",
                "R-0000-0001",
                "R-0000-0005"
            ]
        );
        // Sau khi xóa bớt, báo cáo mới vẫn nằm sau cùng.
        q.remove("R-0000-0003");
        q.push(&report(2), T0).unwrap();
        assert_eq!(q.pending().last().map(|p| p.id.as_str()), Some("R-0000-0002"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_report_is_dropped_after_three_failed_attempts() {
        let dir = temp("attempts");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        assert!(q.record_failure("R-0000-0001"));
        assert_eq!(q.pending()[0].attempts, 1);
        assert!(q.record_failure("R-0000-0001"));
        assert!(!q.record_failure("R-0000-0001"), "lần thứ 3 thì bỏ");
        assert!(q.pending().is_empty());
        assert!(!q.record_failure("R-0000-0001"), "không còn thì không làm gì");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn remove_and_clear() {
        let dir = temp("remove");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        q.push(&report(2), T0 + 1).unwrap();
        q.remove("R-0000-0001");
        assert_eq!(q.pending().len(), 1);
        q.clear();
        assert!(q.pending().is_empty());
        // Không đụng bộ đếm.
        assert!(q.admit("x", T0));
        q.clear();
        assert!(!q.admit("x", T0 + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_pending_file_is_deleted_and_skipped() {
        let dir = temp("corrupt-pending");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        std::fs::write(dir.join("pending").join("000000000001-bad.json"), b"hong").unwrap();
        assert_eq!(q.pending().len(), 1);
        assert_eq!(
            std::fs::read_dir(dir.join("pending")).unwrap().count(),
            1,
            "file hỏng đã bị xóa"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_empty_or_missing_queue_is_empty() {
        let dir = temp("empty");
        assert!(Queue::new(dir).pending().is_empty());
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::queue 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find type Queue`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `queue.rs`, phía trên `#[cfg(test)]`:

```rust
//! Hàng đợi báo cáo lỗi trên đĩa và giới hạn gửi của app (spec 2026-10-17-diagnostics-reports-design.md §1).
//!
//! - Mỗi máy: tối đa 1 báo cáo cho mỗi dấu vân tay trong 24 giờ, tối đa 5 báo cáo mỗi ngày (ngày UTC). Tính lúc xếp hàng.
//! - Hàng đợi tối đa 5 báo cáo, đầy thì bỏ cái cũ nhất.
//! - Báo cáo gửi lỗi tạm (mạng, 5xx) được thử lại ở lần mở sau, tối đa 3 lần rồi bỏ.
//! - File là JSON trong thư mục báo cáo của app: `pending/<số thứ tự>-<mã>.json` và `state.json` (bộ đếm). Người gọi giữ
//!   khóa của `Reporter` quanh mọi lời gọi, nên ở đây không khóa riêng.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::report::Report;

/// Số báo cáo tối đa trong hàng đợi.
pub const QUEUE_CAP: usize = 5;
/// Một dấu vân tay chỉ được xếp hàng một lần trong chừng này giây.
pub const PER_FINGERPRINT_SECONDS: i64 = 24 * 3600;
/// Số báo cáo tối đa xếp hàng mỗi ngày UTC.
pub const MAX_PER_DAY: u32 = 5;
/// Số lần gửi lỗi tạm tối đa của một báo cáo.
pub const MAX_ATTEMPTS: u32 = 3;
const DAY_SECONDS: i64 = 86_400;

#[derive(Default, Serialize, Deserialize)]
struct State {
    /// Ngày UTC (số ngày từ 1970-01-01) của bộ đếm `count`.
    day: i64,
    count: u32,
    /// Dấu vân tay → giờ Unix lần xếp hàng gần nhất.
    fingerprints: BTreeMap<String, i64>,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    id: String,
    queued_at: i64,
    attempts: u32,
    /// Thân báo cáo, gửi nguyên văn.
    report: String,
}

/// Một báo cáo đang chờ gửi.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pending {
    pub id: String,
    pub attempts: u32,
    pub report: String,
}

pub struct Queue {
    dir: PathBuf,
}

impl Queue {
    /// `dir`: thư mục báo cáo của app (tạo khi cần).
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn pending_dir(&self) -> PathBuf {
        self.dir.join("pending")
    }

    fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }

    fn load_state(&self) -> State {
        std::fs::read(self.state_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    /// Có được xếp hàng báo cáo của dấu vân tay này lúc `now` không. Được thì ghi nhận ngay (bộ đếm ngày và lần gần nhất của dấu
    /// vân tay). Không ghi được file thì từ chối: thà bỏ báo cáo còn hơn gửi không giới hạn.
    pub fn admit(&self, fingerprint: &str, now: i64) -> bool {
        let mut state = self.load_state();
        let today = now.div_euclid(DAY_SECONDS);
        if state.day != today {
            state.day = today;
            state.count = 0;
        }
        state.fingerprints.retain(|_, at| now - *at < PER_FINGERPRINT_SECONDS);
        if state.count >= MAX_PER_DAY || state.fingerprints.contains_key(fingerprint) {
            return false;
        }
        state.count += 1;
        state.fingerprints.insert(fingerprint.to_string(), now);
        match serde_json::to_vec(&state) {
            Ok(bytes) => write_atomic(&self.state_path(), &bytes).is_ok(),
            Err(_) => false,
        }
    }

    /// Xếp hàng một báo cáo; vượt `QUEUE_CAP` thì bỏ các báo cáo cũ nhất. Tên file bắt đầu bằng số thứ tự tăng dần (không theo giờ:
    /// hai báo cáo cùng một giây vẫn giữ đúng thứ tự xếp hàng).
    pub fn push(&self, report: &Report, now: i64) -> io::Result<()> {
        let dir = self.pending_dir();
        std::fs::create_dir_all(&dir)?;
        let next = self
            .pending_files()
            .iter()
            .filter_map(|p| sequence_of(p))
            .max()
            .map_or(0, |last| last + 1);
        let stored = Stored {
            id: report.id.clone(),
            queued_at: now,
            attempts: 0,
            report: report.json.clone(),
        };
        let bytes = serde_json::to_vec(&stored).map_err(io::Error::other)?;
        write_atomic(&dir.join(format!("{next:08}-{}.json", report.id)), &bytes)?;
        let mut files = self.pending_files();
        while files.len() > QUEUE_CAP {
            let oldest = files.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
        Ok(())
    }

    /// Tên các file chờ, cũ nhất trước.
    fn pending_files(&self) -> Vec<PathBuf> {
        let Ok(read) = std::fs::read_dir(self.pending_dir()) else {
            return Vec::new();
        };
        let mut files: Vec<PathBuf> = read
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .collect();
        files.sort();
        files
    }

    /// Các báo cáo đang chờ, cũ nhất trước. File hỏng bị xóa.
    pub fn pending(&self) -> Vec<Pending> {
        let mut out = Vec::new();
        for path in self.pending_files() {
            match std::fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice::<Stored>(&b).ok())
            {
                Some(s) => out.push(Pending {
                    id: s.id,
                    attempts: s.attempts,
                    report: s.report,
                }),
                None => {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        out
    }

    fn path_of(&self, id: &str) -> Option<PathBuf> {
        let suffix = format!("-{id}.json");
        self.pending_files()
            .into_iter()
            .find(|p| p.file_name().is_some_and(|n| n.to_string_lossy().ends_with(&suffix)))
    }

    /// Gửi xong (hay bỏ hẳn): xóa khỏi hàng đợi.
    pub fn remove(&self, id: &str) {
        if let Some(path) = self.path_of(id) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Một lần gửi lỗi tạm: tăng số lần thử. Đủ `MAX_ATTEMPTS` thì bỏ báo cáo và trả `false`; còn thì `true`.
    pub fn record_failure(&self, id: &str) -> bool {
        let Some(path) = self.path_of(id) else {
            return false;
        };
        let Some(mut stored) = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Stored>(&b).ok())
        else {
            let _ = std::fs::remove_file(path);
            return false;
        };
        stored.attempts += 1;
        if stored.attempts >= MAX_ATTEMPTS {
            let _ = std::fs::remove_file(path);
            return false;
        }
        match serde_json::to_vec(&stored) {
            Ok(bytes) => write_atomic(&path, &bytes).is_ok(),
            Err(_) => false,
        }
    }

    /// Xóa mọi báo cáo đang chờ (người dùng tắt báo cáo lỗi tự động). Không đụng bộ đếm.
    pub fn clear(&self) {
        for path in self.pending_files() {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Số thứ tự ở đầu tên file chờ (`00000003-R-….json`).
fn sequence_of(path: &Path) -> Option<u64> {
    path.file_name()?.to_str()?.split('-').next()?.parse().ok()
}

/// Ghi qua file tạm rồi đổi tên: file không bao giờ nằm dở dang.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::queue 2>&1 | tail -15
```
Expected: `test result: ok. 11 passed; 0 failed`.

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): hàng đợi báo cáo lỗi trên đĩa và giới hạn tần suất" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Gửi báo cáo (`send.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/send.rs`

`HttpReportApi` POST thân JSON nguyên văn tới `/v1/diagnostics` của **cùng host** với `license::client` (`api.aitranslator.vn`, dùng lại `PRODUCTION_URL` và `accept_base`), nên danh sách kết nối cho phép của A7 không thêm host nào. Không token, không theo redirect, timeout kết nối 10 giây và tổng 15 giây; lỗi mạng không kèm URL. Kết quả: `2xx` thành công; `429` là `RateLimited` (kèm `Retry-After` nếu có); `5xx` và lỗi mạng là `Transient` (thử lại ở lần mở sau); mọi `4xx`, `3xx` còn lại là `Rejected` (bỏ báo cáo, mã lấy từ trường `error` của server).

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod send;` ở cuối khối `pub mod` (sau `pub mod scrub;`).

Tạo `src-tauri/src/diagnostics/send.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        content_type: Option<String>,
        body: String,
    }

    /// Một response của server giả: mã, header thêm, thân.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server giả: trả lần lượt các response cho các request tới.
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
                        "content-type" => req.content_type = Some(value.trim().into()),
                        _ => {}
                    }
                }
                let mut buf = vec![0; length];
                reader.read_exact(&mut buf).unwrap();
                req.body = String::from_utf8(buf).unwrap();
                log.lock().unwrap().push(req);
                let extra: String = headers.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    #[test]
    fn a_report_is_posted_verbatim_as_json_to_the_diagnostics_route() {
        let (base, seen) = serve(vec![(202, vec![], r#"{"id":"R-7F3K-92QD"}"#)]);
        let body = r#"{"v":1,"id":"R-7F3K-92QD","message":"có dấu ế"}"#;
        assert_eq!(HttpReportApi::new(Some(base)).send(body), Ok(()));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("POST", "/v1/diagnostics")
        );
        assert_eq!(seen[0].content_type.as_deref(), Some("application/json"));
        assert_eq!(seen[0].body, body);
    }

    #[test]
    fn server_answers_map_to_the_three_outcomes() {
        let (base, _) = serve(vec![
            (429, vec![("Retry-After", "3600")], r#"{"error":"rate_limited"}"#),
            (429, vec![], r#"{"error":"rate_limited"}"#),
            (500, vec![], ""),
            (503, vec![], ""),
            (400, vec![], r#"{"error":"invalid_request","field":"logs"}"#),
            (413, vec![], r#"{"error":"invalid_request"}"#),
            (415, vec![], r#"{"error":"unsupported_media_type"}"#),
            (422, vec![], r#"{"error":"rejected_sensitive","rule":"home_path"}"#),
            (404, vec![], "không phải json"),
            (302, vec![("Location", "https://nơi.khác/")], ""),
        ]);
        let api = HttpReportApi::new(Some(base));
        assert_eq!(api.send("{}"), Err(SendError::RateLimited(Some(3600))));
        assert_eq!(api.send("{}"), Err(SendError::RateLimited(None)));
        assert!(matches!(api.send("{}"), Err(SendError::Transient(_))));
        assert!(matches!(api.send("{}"), Err(SendError::Transient(_))));
        let rejected = |status: u16, code: &str| {
            Err(SendError::Rejected {
                status,
                code: code.into(),
            })
        };
        assert_eq!(api.send("{}"), rejected(400, "invalid_request"));
        assert_eq!(api.send("{}"), rejected(413, "invalid_request"));
        assert_eq!(api.send("{}"), rejected(415, "unsupported_media_type"));
        assert_eq!(api.send("{}"), rejected(422, "rejected_sensitive"));
        assert_eq!(api.send("{}"), rejected(404, "http_404"));
        assert_eq!(api.send("{}"), rejected(302, "http_302"));
    }

    #[test]
    fn no_network_is_a_transient_error_without_the_url() {
        // Cổng vừa đóng: kết nối bị từ chối.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let err = HttpReportApi::new(Some(format!("http://127.0.0.1:{port}")))
            .send("{}")
            .unwrap_err();
        let SendError::Transient(message) = err else {
            panic!("{err:?}")
        };
        assert!(!message.contains("127.0.0.1"), "lỗi không kèm URL: {message}");
    }

    #[test]
    fn an_unconfigured_server_is_a_permanent_rejection() {
        assert_eq!(
            HttpReportApi::new(None).send("{}"),
            Err(SendError::Rejected {
                status: 0,
                code: "not_configured".into()
            })
        );
    }

    #[test]
    fn the_real_build_talks_only_to_the_production_api_host() {
        assert_eq!(PRODUCTION_URL, Some("https://api.aitranslator.vn"));
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::send 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find type HttpReportApi`, `SendError`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `send.rs`, phía trên `#[cfg(test)]`:

```rust
//! Gửi báo cáo lỗi tới `POST /v1/diagnostics` của license server (spec 2026-10-17-diagnostics-reports-design.md §3, §5). Cùng một
//! host với `license::client` (`api.`), cùng địa chỉ production, nên danh sách kết nối của A7 không thêm host nào.
//!
//! Không cần token. Không theo redirect. Lỗi không bao giờ kèm URL hay thân báo cáo. Phân loại kết quả cho nơi gọi:
//! - `Transient`: mạng hay `5xx`: thử lại ở lần mở sau (hàng đợi);
//! - `RateLimited`: `429`;
//! - `Rejected`: mọi `4xx` còn lại (và `3xx`): vĩnh viễn, bỏ báo cáo.

use std::time::Duration;

use serde_json::Value;

use crate::license::client::{PRODUCTION_URL, accept_base};

const USER_AGENT: &str = "AI-Translator";

/// Lỗi của một lần gửi.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SendError {
    #[error("không gửi được (mạng hay server lỗi tạm): {0}")]
    Transient(String),
    /// `429`; số giây phải chờ nếu server báo.
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("server từ chối báo cáo: {status} {code}")]
    Rejected { status: u16, code: String },
}

/// Nơi nhận báo cáo. App thật là [`HttpReportApi`]; test dùng bản giả.
pub trait ReportApi: Send + Sync {
    /// Gửi thân JSON của một báo cáo nguyên văn.
    fn send(&self, body: &str) -> Result<(), SendError>;
}

pub struct HttpReportApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

impl HttpReportApi {
    /// Server của mọi bản build, debug lẫn phát hành: production.
    pub fn for_this_build() -> Self {
        Self::new(PRODUCTION_URL.and_then(|u| accept_base(u, false)))
    }

    pub fn new(base: Option<String>) -> Self {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        Self { base, client }
    }
}

impl ReportApi for HttpReportApi {
    fn send(&self, body: &str) -> Result<(), SendError> {
        let Some(base) = &self.base else {
            return Err(SendError::Rejected {
                status: 0,
                code: "not_configured".into(),
            });
        };
        let response = self
            .client
            .post(format!("{base}/v1/diagnostics"))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn.
            .map_err(|e| SendError::Transient(e.without_url().to_string()))?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        if (200..300).contains(&status) {
            return Ok(());
        }
        if status == 429 {
            return Err(SendError::RateLimited(retry_after));
        }
        if status >= 500 {
            return Err(SendError::Transient(format!("server trả {status}")));
        }
        let code = response
            .bytes()
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|v| v.get("error").and_then(Value::as_str).map(String::from))
            .unwrap_or_else(|| format!("http_{status}"));
        Err(SendError::Rejected { status, code })
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::send 2>&1 | tail -15
```
Expected: `test result: ok. 5 passed; 0 failed` (test dựng server giả trên `127.0.0.1`, không ra mạng).

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): gửi báo cáo lỗi tới license server, phân loại kết quả" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Dấu vết lần chạy trước (`marker.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/marker.rs`

Cách biết lần chạy trước có crash (quyết định 1 ở đầu kế hoạch): `begin_run` đọc `panic.json` và `run.marker` của lần trước rồi ghi marker mới; `end_run` xóa marker (gọi ở `on_exit`); panic hook (`install_panic_dump`, nối vào hook cũ, không thay) ghi `panic.json` gồm giờ, vị trí `file:line` đã bỏ đường dẫn máy build, câu panic. `PreviousRun`: `Clean` (không marker), `Panicked` (có `panic.json`), `Unclean` (có marker mà không có `panic.json`: bị kill, hết bộ nhớ, crash của hệ điều hành), `RebootedSince` (marker cũ hơn lần khởi động của máy: không phải lỗi của app). `boot_time_secs` đọc mốc khởi động máy (`sysctl kern.boottime` trên macOS, `GetTickCount64` trên Windows).

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod marker;` sau `pub mod machine;` (trước `pub mod queue;`).

Tạo `src-tauri/src/diagnostics/marker.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;

    const T0: i64 = 1_790_812_800;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-marker-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn the_first_run_is_clean_and_leaves_a_marker() {
        let dir = temp("first");
        let files = RunFiles::new(dir.clone());
        assert_eq!(files.begin_run(T0, None, "0.1.10"), PreviousRun::Clean);
        assert!(dir.join(MARKER).exists());
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_normal_exit_leaves_nothing_to_report() {
        let dir = temp("normal");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.end_run();
        assert!(!dir.join(MARKER).exists());
        assert_eq!(files.begin_run(T0 + 100, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_leftover_marker_is_an_unclean_exit_once() {
        let dir = temp("unclean");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, Some(T0 - 3_600), "0.1.10");
        assert_eq!(
            files.begin_run(T0 + 500, Some(T0 - 3_600), "0.1.10"),
            PreviousRun::Unclean { started_at: T0 }
        );
        // Lần mở thứ ba: lần thứ hai đã đặt marker mới và (giả sử) lại không thoát bình thường.
        assert_eq!(
            files.begin_run(T0 + 900, Some(T0 - 3_600), "0.1.10"),
            PreviousRun::Unclean { started_at: T0 + 500 }
        );
        files.end_run();
        assert_eq!(files.begin_run(T0 + 1_000, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_reboot_since_the_marker_is_not_a_crash() {
        let dir = temp("reboot");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, Some(T0 - 3_600), "0.1.10");
        // Lần mở sau, máy khởi động lúc T0 + 60: sau khi ghi marker.
        assert_eq!(
            files.begin_run(T0 + 900, Some(T0 + 60), "0.1.10"),
            PreviousRun::RebootedSince
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_panic_dump_wins_over_the_marker_and_is_consumed() {
        let dir = temp("panic");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.record_panic(T0 + 5, "src-tauri/src/session.rs:12", &"ế".repeat(900));
        let PreviousRun::Panicked { at, location, message } = files.begin_run(T0 + 100, None, "0.1.10") else {
            panic!("phải là Panicked");
        };
        assert_eq!((at, location.as_str()), (T0 + 5, "src-tauri/src/session.rs:12"));
        assert_eq!(message.chars().count(), MAX_MESSAGE_CHARS);
        assert!(!dir.join(PANIC).exists());
        files.end_run();
        assert_eq!(files.begin_run(T0 + 200, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_panic_during_a_reboot_window_is_still_reported() {
        let dir = temp("panic-reboot");
        let files = RunFiles::new(dir.clone());
        files.begin_run(T0, None, "0.1.10");
        files.record_panic(T0 + 5, "x.rs:1", "boom");
        assert!(matches!(
            files.begin_run(T0 + 100, Some(T0 + 50), "0.1.10"),
            PreviousRun::Panicked { .. }
        ));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn corrupt_files_are_ignored_and_removed() {
        let dir = temp("corrupt");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(MARKER), b"hong").unwrap();
        std::fs::write(dir.join(PANIC), b"hong").unwrap();
        let files = RunFiles::new(dir.clone());
        assert_eq!(files.begin_run(T0, None, "0.1.10"), PreviousRun::Clean);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_boot_time_is_in_the_past_when_the_os_can_tell() {
        let now = now_secs();
        match boot_time_secs(now) {
            Some(boot) => assert!(boot < now && now - boot < 5 * 365 * 86_400, "{boot} so với {now}"),
            // Hệ điều hành không hỏi được mốc khởi động: chỉ chấp nhận ở nền tảng app không hỗ trợ.
            None => {
                #[cfg(any(target_os = "macos", windows))]
                panic!("macOS và Windows phải trả được mốc khởi động");
            }
        }
    }

    /// Hook thật: ghi dump rồi gọi tiếp hook cũ. Test duy nhất cài hook toàn cục trong tiến trình test này.
    #[test]
    fn the_panic_hook_writes_the_dump_and_still_calls_the_previous_hook() {
        static PREVIOUS_CALLED: AtomicBool = AtomicBool::new(false);
        let dir = temp("hook");
        std::panic::set_hook(Box::new(|_| PREVIOUS_CALLED.store(true, Ordering::SeqCst)));
        install_panic_dump(RunFiles::new(dir.clone()));
        let result = std::thread::spawn(|| panic!("lỗi thử")).join();
        assert!(result.is_err());
        assert!(PREVIOUS_CALLED.load(Ordering::SeqCst), "hook cũ vẫn chạy");
        let dump: PanicDump = serde_json::from_slice(&std::fs::read(dir.join(PANIC)).unwrap()).unwrap();
        assert_eq!(dump.message, "lỗi thử");
        assert!(dump.location.contains("marker.rs:"), "{}", dump.location);
        let _ = std::panic::take_hook();
        std::fs::remove_dir_all(dir).unwrap();
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::marker 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find type RunFiles`, `PreviousRun`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `marker.rs`, phía trên `#[cfg(test)]`:

```rust
//! Dấu vết của lần chạy trước, để báo cáo `crash` (spec 2026-10-17-diagnostics-reports-design.md §1).
//!
//! - **`run.marker`**: ghi lúc khởi động, xóa khi app thoát bình thường (`RunEvent::Exit`). Lần mở sau còn thấy nó nghĩa là lần
//!   chạy trước chết không qua đường thoát (`unclean_exit`). Mọi đường thoát có chủ ý đều qua `RunEvent::Exit`: menu khay
//!   (`app.exit`), cập nhật (`request_restart`), macOS tắt máy hay đăng xuất (`applicationWillTerminate:` → `LoopDestroyed`),
//!   Windows tắt máy hay đăng xuất (`tao` 0.37 xử lý `WM_ENDSESSION` bằng `loop_destroyed()` rồi `process::exit`, nên cũng qua
//!   `RunEvent::Exit`). Plugin cập nhật trên Windows còn gọi `process::exit` sau `install_on_exit`, nên marker phải xóa trước đó.
//! - **`panic.json`**: panic hook ghi vị trí và câu panic trước khi bản phát hành abort (`panic = "abort"`).
//! - Máy khởi động lại từ lúc ghi marker (mất điện, tắt máy cưỡng bức, kernel panic) không phải lỗi của app: không báo.
//!
//! Plugin single-instance bảo đảm chỉ một bản app chạy, nên marker còn lại luôn của một lần chạy đã chết.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

use super::report::{MAX_MESSAGE_CHARS, location_key};

const MARKER: &str = "run.marker";
const PANIC: &str = "panic.json";

#[derive(Serialize, Deserialize)]
struct Marker {
    started_at: i64,
    version: String,
}

#[derive(Serialize, Deserialize)]
struct PanicDump {
    at: i64,
    location: String,
    message: String,
}

/// Lần chạy trước của app, theo dấu vết còn lại.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PreviousRun {
    /// Thoát bình thường, hay chưa có lần chạy nào.
    Clean,
    /// Có `panic.json`: `location` đã chuẩn hóa (`location_key`), `message` chưa che.
    Panicked { at: i64, location: String, message: String },
    /// Còn `run.marker`, không có `panic.json`, và máy không khởi động lại từ đó.
    Unclean { started_at: i64 },
    /// Còn `run.marker` nhưng máy đã khởi động lại từ đó: không phải crash của app.
    RebootedSince,
}

#[derive(Clone)]
pub struct RunFiles {
    dir: PathBuf,
}

impl RunFiles {
    /// `dir`: thư mục báo cáo của app.
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn read<T: for<'de> Deserialize<'de>>(&self, name: &str) -> Option<T> {
        std::fs::read(self.dir.join(name))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
    }

    /// Gọi lúc khởi động: phân loại lần chạy trước, xóa dấu vết của nó, rồi đặt marker của lần chạy này. `boot_time`: giờ Unix
    /// (giây) máy khởi động, nếu biết.
    pub fn begin_run(&self, now: i64, boot_time: Option<i64>, version: &str) -> PreviousRun {
        let dump: Option<PanicDump> = self.read(PANIC);
        let marker: Option<Marker> = self.read(MARKER);
        let _ = std::fs::remove_file(self.dir.join(PANIC));
        let _ = std::fs::remove_file(self.dir.join(MARKER));
        if std::fs::create_dir_all(&self.dir).is_ok()
            && let Ok(bytes) = serde_json::to_vec(&Marker {
                started_at: now,
                version: version.to_string(),
            })
        {
            let _ = std::fs::write(self.dir.join(MARKER), bytes);
        }
        classify(dump, marker, boot_time)
    }

    /// App thoát bình thường: xóa marker.
    pub fn end_run(&self) {
        let _ = std::fs::remove_file(self.dir.join(MARKER));
    }

    /// Ghi panic dump. Gọi từ panic hook: không được panic, không làm gì nặng.
    pub fn record_panic(&self, at: i64, location: &str, message: &str) {
        let dump = PanicDump {
            at,
            location: location.to_string(),
            message: message.chars().take(MAX_MESSAGE_CHARS).collect(),
        };
        if let Ok(bytes) = serde_json::to_vec(&dump) {
            let _ = std::fs::create_dir_all(&self.dir);
            let _ = std::fs::write(self.dir.join(PANIC), bytes);
        }
    }

    fn record_panic_info(&self, info: &std::panic::PanicHookInfo<'_>) {
        let location = info
            .location()
            .map_or_else(|| "không rõ".to_string(), |l| location_key(l.file(), l.line()));
        let payload = info.payload();
        let message = payload
            .downcast_ref::<&str>()
            .map(|s| (*s).to_string())
            .or_else(|| payload.downcast_ref::<String>().cloned())
            .unwrap_or_default();
        self.record_panic(now_secs(), &location, &message);
    }

    pub fn dir(&self) -> &Path {
        &self.dir
    }
}

fn classify(dump: Option<PanicDump>, marker: Option<Marker>, boot_time: Option<i64>) -> PreviousRun {
    if let Some(d) = dump {
        return PreviousRun::Panicked {
            at: d.at,
            location: d.location,
            message: d.message,
        };
    }
    match marker {
        None => PreviousRun::Clean,
        Some(m) if boot_time.is_some_and(|boot| boot > m.started_at) => PreviousRun::RebootedSince,
        Some(m) => PreviousRun::Unclean {
            started_at: m.started_at,
        },
    }
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

static PANIC_FILES: OnceLock<RunFiles> = OnceLock::new();

/// Cài panic hook ghi `panic.json`, nối trước hook đang có (ở app: hook của `pipeline::process` kill tiến trình phụ rồi in
/// panic). Gọi một lần ở `setup`; lần sau không làm gì.
pub fn install_panic_dump(files: RunFiles) {
    if PANIC_FILES.set(files).is_err() {
        return;
    }
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(files) = PANIC_FILES.get() {
            files.record_panic_info(info);
        }
        previous(info);
    }));
}

/// Giờ Unix (giây) máy khởi động, nếu hỏi được.
#[cfg(target_os = "macos")]
pub fn boot_time_secs(_now: i64) -> Option<i64> {
    let mut tv = libc::timeval { tv_sec: 0, tv_usec: 0 };
    let mut len = std::mem::size_of::<libc::timeval>();
    // SAFETY: `kern.boottime` là một `struct timeval`; `tv` và `len` sống suốt lời gọi.
    let rc = unsafe {
        libc::sysctlbyname(
            c"kern.boottime".as_ptr(),
            (&mut tv as *mut libc::timeval).cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    (rc == 0 && tv.tv_sec > 0).then_some(tv.tv_sec)
}

/// Windows: giờ khởi động suy từ thời gian chạy của hệ thống (`GetTickCount64`). Với Fast Startup, "khởi động" của hệ thống
/// không tính lần tắt máy rồi bật lại, nên mốc này có thể quá sớm: khi đó lần tắt máy hiện là `Unclean` chứ không bị bỏ sót.
#[cfg(windows)]
pub fn boot_time_secs(now: i64) -> Option<i64> {
    use windows::Win32::System::SystemInformation::GetTickCount64;
    // SAFETY: hàm không tham số và không có điều kiện tiên quyết.
    let uptime_ms = unsafe { GetTickCount64() };
    Some(now - i64::try_from(uptime_ms / 1000).ok()?)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn boot_time_secs(_now: i64) -> Option<i64> {
    None
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::marker 2>&1 | tail -15
```
Expected: `test result: ok. 9 passed; 0 failed`.

- [ ] **Step 5: fmt, clippy, kiểm code Windows, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ./scripts/check-windows.sh --locked 2>&1 | tail -5
```
Expected: kết thúc không lỗi (nhánh Windows của `boot_time_secs` dùng `GetTickCount64`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): dấu vết lần chạy trước để biết app có crash" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lõi điều phối (`reporter.rs`)

**Files:**
- Modify: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/reporter.rs`

`Reporter` nối các phần trên, không biết gì về Tauri (mọi phụ thuộc qua trait `Host`, `LogSource`, `ReportApi`):
- `record(event)`: bỏ nếu tự động đang tắt; kẹp `at` không cũ quá 6 ngày (server từ chối lệch quá 7 ngày); hỏi `queue.admit` **trước** khi dựng; đọc log, dựng, xếp hàng. Mọi lỗi dựng (kể cả `Sensitive`) chỉ ghi vào log của app, không bao giờ hiện ra người dùng.
- `flush()`: chỉ chạy khi tự động bật và app rảnh (`translation_idle`, kiểm lại **giữa các lần gửi**); mỗi báo cáo thử một lần mỗi lần chạy; `Transient` hay `429` thì tính một lần thất bại và dừng lượt; `Rejected` thì xóa và đi tiếp.
- `send_manual()`: dựng và gửi ngay, không qua hàng đợi, không bị giới hạn 24 giờ, không đòi rảnh (người dùng vừa bấm).
- `purge()`: xóa hàng đợi (người dùng tắt cài đặt).

- [ ] **Step 1: Khai báo module và viết test trước (đỏ)**

Trong `mod.rs`, thêm `pub mod reporter;` sau `pub mod report;` (trước `pub mod scrub;`).

Tạo `src-tauri/src/diagnostics/reporter.rs` **chỉ với khối test**:

```rust
#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

    use super::*;

    const T0: i64 = 1_790_812_800;

    #[derive(Clone)]
    struct FakeHost {
        enabled: Arc<AtomicBool>,
        idle: Arc<AtomicBool>,
        now: Arc<AtomicI64>,
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

    impl Host for FakeHost {
        fn auto_enabled(&self) -> bool {
            self.enabled.load(Ordering::SeqCst)
        }
        fn translation_idle(&self) -> bool {
            self.idle.load(Ordering::SeqCst)
        }
        fn facts(&self) -> Option<Facts> {
            self.facts.lock().unwrap().clone()
        }
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
    }

    fn facts() -> Facts {
        Facts {
            app_version: "0.1.10".into(),
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
        }
    }

    #[derive(Clone, Default)]
    struct MemLogs(Arc<Mutex<[String; 3]>>);

    impl LogSource for MemLogs {
        fn read(&self, file: LogFile) -> String {
            let logs = self.0.lock().unwrap();
            match file {
                LogFile::App => logs[0].clone(),
                LogFile::Asr => logs[1].clone(),
                LogFile::Llama => logs[2].clone(),
            }
        }
    }

    /// Server giả: trả lần lượt các kết quả đã đặt (hết thì `Ok`), ghi lại thân đã nhận.
    #[derive(Clone, Default)]
    struct FakeApi {
        script: Arc<Mutex<Vec<Result<(), SendError>>>>,
        bodies: Arc<Mutex<Vec<String>>>,
    }

    impl ReportApi for FakeApi {
        fn send(&self, body: &str) -> Result<(), SendError> {
            self.bodies.lock().unwrap().push(body.to_string());
            let mut script = self.script.lock().unwrap();
            if script.is_empty() { Ok(()) } else { script.remove(0) }
        }
    }

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-reporter-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    struct Rig {
        host: FakeHost,
        logs: MemLogs,
        api: FakeApi,
        reporter: Reporter,
        dir: std::path::PathBuf,
    }

    fn rig(name: &str) -> Rig {
        let dir = temp(name);
        rig_in(dir, FakeHost::new(), FakeApi::default())
    }

    /// Một lần chạy app mới trên cùng thư mục (hàng đợi và bộ đếm còn trên đĩa).
    fn rig_in(dir: std::path::PathBuf, host: FakeHost, api: FakeApi) -> Rig {
        let logs = MemLogs::default();
        let params = Params {
            home: "/Users/alice".into(),
            user: "alice".into(),
            host: "alice-mbp".into(),
        };
        let reporter = Reporter::new(
            Box::new(host.clone()),
            Box::new(logs.clone()),
            Box::new(api.clone()),
            params,
            Queue::new(dir.clone()),
            Duration::ZERO,
        );
        Rig {
            host,
            logs,
            api,
            reporter,
            dir,
        }
    }

    fn session_error(code: &str) -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some(code.into()),
            location: String::new(),
            message: format!("lỗi {code}"),
            at: T0 - 5,
        }
    }

    #[test]
    fn nothing_is_recorded_while_automatic_reports_are_off() {
        let r = rig("off");
        r.host.enabled.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        assert_eq!(r.reporter.pending_count(), 0);
        // Tắt không tiêu bộ đếm: bật lại thì báo cáo đầu tiên vẫn được nhận.
        r.host.enabled.store(true, Ordering::SeqCst);
        assert!(r.reporter.record(session_error("sidecarFailed")).is_some());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_recorded_event_becomes_a_queued_report_with_the_clamped_time() {
        let r = rig("record");
        *r.logs.0.lock().unwrap() = ["dòng app\n".into(), "asr error: x\n".into(), String::new()];
        let mut event = session_error("modelBroken");
        event.at = T0 - 30 * 86_400; // quá cũ so với server: kẹp lại
        let id = r.reporter.record(event).expect("xếp hàng");
        let pending = r.reporter.pending_reports();
        assert_eq!(pending.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&pending[0]).unwrap();
        assert_eq!(v["id"], id.as_str());
        assert_eq!(
            (v["kind"].as_str(), v["code"].as_str()),
            (Some("session_error"), Some("modelBroken"))
        );
        assert_eq!(v["at"], T0 - 6 * 86_400);
        assert_eq!(v["logs"]["app"], "dòng app\n");
        assert_eq!(v["logs"]["asr"], "asr error: x\n");
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn the_same_error_is_recorded_once_a_day_and_at_most_five_a_day() {
        let r = rig("limits");
        assert!(r.reporter.record(session_error("sidecarFailed")).is_some());
        assert!(
            r.reporter.record(session_error("sidecarFailed")).is_none(),
            "cùng dấu vân tay trong 24 giờ"
        );
        for code in ["a", "b", "c", "d"] {
            assert!(r.reporter.record(session_error(code)).is_some(), "{code}");
        }
        assert!(
            r.reporter.record(session_error("e")).is_none(),
            "báo cáo thứ 6 trong ngày"
        );
        assert_eq!(r.reporter.pending_count(), 5);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn an_event_whose_report_would_leak_something_is_dropped() {
        let r = rig("leak");
        *r.logs.0.lock().unwrap() = ["đọc /Users/bob/Library/x\n".into(), String::new(), String::new()];
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn an_event_without_machine_facts_is_dropped() {
        let r = rig("nofacts");
        *r.host.facts.lock().unwrap() = None;
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn flush_sends_queued_reports_only_when_idle() {
        let r = rig("idle");
        r.reporter.record(session_error("a")).unwrap();
        r.host.idle.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 0);
        assert!(r.api.bodies.lock().unwrap().is_empty(), "không gửi gì lúc đang dịch");
        r.host.idle.store(true, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 1);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 1);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_session_starting_mid_flush_stops_the_rest() {
        struct StartsAfterFirst {
            inner: FakeHost,
            sent: Arc<std::sync::atomic::AtomicUsize>,
        }
        impl ReportApi for StartsAfterFirst {
            fn send(&self, _: &str) -> Result<(), SendError> {
                if self.sent.fetch_add(1, Ordering::SeqCst) == 0 {
                    self.inner.idle.store(false, Ordering::SeqCst);
                }
                Ok(())
            }
        }
        let dir = temp("mid");
        let host = FakeHost::new();
        let sent = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let reporter = Reporter::new(
            Box::new(host.clone()),
            Box::new(MemLogs::default()),
            Box::new(StartsAfterFirst {
                inner: host.clone(),
                sent: sent.clone(),
            }),
            Params::default(),
            Queue::new(dir.clone()),
            Duration::ZERO,
        );
        reporter.record(session_error("a")).unwrap();
        reporter.record(session_error("b")).unwrap();
        assert_eq!(reporter.flush(), 1);
        assert_eq!(
            sent.load(Ordering::SeqCst),
            1,
            "phiên vừa bắt đầu thì không gửi cái thứ hai"
        );
        assert_eq!(reporter.pending_count(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn flush_does_nothing_when_automatic_reports_are_off() {
        let r = rig("flush-off");
        r.reporter.record(session_error("a")).unwrap();
        r.host.enabled.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 0);
        assert!(r.api.bodies.lock().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_transient_failure_stops_the_pass_and_is_retried_only_on_the_next_run_three_times_at_most() {
        let dir = temp("retry");
        let api = FakeApi::default();
        let first = rig_in(dir.clone(), FakeHost::new(), api.clone());
        first.reporter.record(session_error("a")).unwrap();
        first.reporter.record(session_error("b")).unwrap();
        let failing = || {
            *api.script.lock().unwrap() = vec![Err(SendError::Transient("mạng rớt".into()))];
        };
        failing();
        assert_eq!(first.reporter.flush(), 0);
        assert_eq!(
            api.bodies.lock().unwrap().len(),
            1,
            "mạng hỏng thì dừng cả lượt, không thử cái thứ hai"
        );
        assert_eq!(
            first.reporter.flush(),
            1,
            "lần flush kế trong cùng lần chạy: báo cáo đã thử bị bỏ qua, cái còn lại được gửi"
        );
        assert_eq!(first.reporter.pending_count(), 1);

        // Lần mở thứ hai và thứ ba: báo cáo còn lại lỗi tạm tiếp.
        for run in 2..=3 {
            let next = rig_in(dir.clone(), FakeHost::new(), api.clone());
            failing();
            assert_eq!(next.reporter.flush(), 0, "lần chạy {run}");
        }
        let fourth = rig_in(dir.clone(), FakeHost::new(), api.clone());
        assert_eq!(fourth.reporter.pending_count(), 0, "đủ 3 lần lỗi thì đã bỏ");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_rate_limited_answer_counts_as_a_failed_attempt_and_stops_the_pass() {
        let r = rig("429");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.record(session_error("b")).unwrap();
        *r.api.script.lock().unwrap() = vec![Err(SendError::RateLimited(Some(3600)))];
        assert_eq!(r.reporter.flush(), 0);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 1);
        assert_eq!(r.reporter.pending_count(), 2);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_rejected_report_is_dropped_and_the_next_one_is_still_sent() {
        let r = rig("rejected");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.record(session_error("b")).unwrap();
        *r.api.script.lock().unwrap() = vec![Err(SendError::Rejected {
            status: 422,
            code: "rejected_sensitive".into(),
        })];
        assert_eq!(r.reporter.flush(), 1);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 2);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn purge_removes_everything_waiting() {
        let r = rig("purge");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.purge();
        assert_eq!(r.reporter.pending_count(), 0);
        assert_eq!(r.reporter.flush(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_manual_report_is_sent_at_once_even_with_automatic_reports_off_and_a_session_running() {
        let r = rig("manual");
        r.host.enabled.store(false, Ordering::SeqCst);
        r.host.idle.store(false, Ordering::SeqCst);
        let id = r.reporter.send_manual().unwrap();
        let bodies = r.api.bodies.lock().unwrap();
        assert_eq!(bodies.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&bodies[0]).unwrap();
        assert_eq!(v["id"], id.as_str());
        assert_eq!(
            (v["kind"].as_str(), v["code"].is_null(), v["fingerprint"].as_str()),
            (Some("manual"), true, Some("0000000000000000"))
        );
        drop(bodies);
        assert_eq!(r.reporter.pending_count(), 0, "không vào hàng đợi");
        // Không tính vào giới hạn: bấm hai lần đều gửi.
        assert!(r.reporter.send_manual().is_ok());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn manual_errors_say_what_went_wrong() {
        let r = rig("manual-errors");
        *r.api.script.lock().unwrap() = vec![Err(SendError::RateLimited(None)), Err(SendError::Transient("x".into()))];
        assert_eq!(
            r.reporter.send_manual(),
            Err(ManualError::Send(SendError::RateLimited(None)))
        );
        assert!(matches!(
            r.reporter.send_manual(),
            Err(ManualError::Send(SendError::Transient(_)))
        ));
        *r.logs.0.lock().unwrap() = ["đọc /Users/bob/x\n".into(), String::new(), String::new()];
        assert_eq!(
            r.reporter.send_manual(),
            Err(ManualError::Build(BuildError::Sensitive("home_path")))
        );
        *r.host.facts.lock().unwrap() = None;
        assert_eq!(r.reporter.send_manual(), Err(ManualError::NoFacts));
        let _ = std::fs::remove_dir_all(r.dir);
    }
}
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::reporter 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find type Reporter`, `Host`, `ManualError`.

- [ ] **Step 3: Cài đặt**

Chèn đoạn sau vào **đầu** `reporter.rs`, phía trên `#[cfg(test)]`:

```rust
//! Lõi của báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §1, §5): nhận sự kiện, xếp hàng có giới hạn, gửi nền khi
//! app rảnh, và gửi tay. Không phụ thuộc Tauri: mọi thứ của app đi qua [`Host`], log qua `LogSource`, mạng qua `ReportApi`.
//!
//! - **Tự động** (`record` rồi `flush`): chỉ khi `Host::auto_enabled`. Không bao giờ gửi lúc đang dịch (`Host::translation_idle`).
//! - **Gửi tay** (`send_manual`): ngay lập tức, kể cả khi tắt tự động và khi đang dịch (người dùng vừa bấm); không vào hàng đợi,
//!   không tính vào giới hạn.
//! - Lỗi tạm: mỗi báo cáo chỉ thử một lần mỗi lần chạy app (mạng hỏng thì cả lượt dừng); đủ 3 lần qua các lần mở thì bỏ.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use super::logs::{LogFile, LogSource};
use super::queue::Queue;
use super::report::{self, BuildError, Event, Facts, Kind, RawLogs};
use super::scrub::Params;
use super::send::{ReportApi, SendError};

/// Báo cáo ghi giờ xảy ra không quá cũ so với server (7 ngày): kẹp lại để không bị `400`.
const MAX_AGE_SECONDS: i64 = 6 * 86_400;

/// Những gì lõi cần biết về app, đọc mỗi lần dùng.
pub trait Host: Send + Sync {
    /// Báo cáo tự động bật: cài đặt `sendErrorReports` và (bản debug) công tắc dev.
    fn auto_enabled(&self) -> bool;
    /// Không có phiên dịch nào đang bắt đầu, chạy hay dừng.
    fn translation_idle(&self) -> bool;
    /// Thông tin app và máy; `None` nếu chưa đọc được (ví dụ mã máy).
    fn facts(&self) -> Option<Facts>;
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
}

/// Lỗi của lần gửi tay (giao diện hiện câu theo loại).
#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ManualError {
    #[error("không dựng được báo cáo: {0}")]
    Build(#[from] BuildError),
    #[error("chưa đọc được thông tin máy")]
    NoFacts,
    #[error(transparent)]
    Send(#[from] SendError),
}

pub struct Reporter {
    host: Box<dyn Host>,
    logs: Box<dyn LogSource>,
    api: Box<dyn ReportApi>,
    params: Params,
    /// Hàng đợi trên đĩa; khóa giữ quanh mọi thao tác (`Queue` không tự khóa).
    queue: Mutex<Queue>,
    /// Mã các báo cáo đã thử gửi trong lần chạy này.
    tried: Mutex<HashSet<String>>,
    /// Chờ trước khi đọc log của một sự kiện, để dòng log của chính lỗi đó kịp ghi xuống file.
    log_delay: Duration,
}

impl Reporter {
    pub fn new(
        host: Box<dyn Host>,
        logs: Box<dyn LogSource>,
        api: Box<dyn ReportApi>,
        params: Params,
        queue: Queue,
        log_delay: Duration,
    ) -> Self {
        Self {
            host,
            logs,
            api,
            params,
            queue: Mutex::new(queue),
            tried: Mutex::new(HashSet::new()),
            log_delay,
        }
    }

    fn raw_logs(&self) -> RawLogs {
        RawLogs {
            app: self.logs.read(LogFile::App),
            asr: self.logs.read(LogFile::Asr),
            llama: self.logs.read(LogFile::Llama),
        }
    }

    /// Có sự kiện đáng báo. Tắt tự động, quá giới hạn, hay không dựng được (fail closed) thì không làm gì. Trả mã báo cáo đã xếp
    /// hàng. Chặn trong lúc đọc log và che (cỡ chục mili giây, sau `log_delay`): gọi từ luồng nền.
    pub fn record(&self, mut event: Event) -> Option<String> {
        if !self.host.auto_enabled() {
            return None;
        }
        let now = self.host.now();
        event.at = event.at.clamp(now - MAX_AGE_SECONDS, now);
        let fingerprint = report::fingerprint(event.kind, event.code.as_deref(), &event.location);
        // Kiểm giới hạn trước khi tốn công dựng báo cáo.
        if !self.queue.lock().unwrap().admit(&fingerprint, now) {
            log::info!(
                "bỏ báo cáo lỗi vì quá giới hạn gửi của máy này: {}",
                event.kind.as_str()
            );
            return None;
        }
        if !self.log_delay.is_zero() {
            std::thread::sleep(self.log_delay);
        }
        let Some(facts) = self.host.facts() else {
            log::warn!("bỏ báo cáo lỗi: chưa đọc được thông tin máy");
            return None;
        };
        let built = report::build(&event, &facts, &self.raw_logs(), &self.params, report::new_id());
        let report = match built {
            Ok(report) => report,
            Err(e) => {
                // Chỉ ghi lý do (tên quy tắc), không bao giờ ghi nội dung.
                log::warn!("bỏ báo cáo lỗi: {e}");
                return None;
            }
        };
        match self.queue.lock().unwrap().push(&report, now) {
            Ok(()) => {
                log::info!("xếp hàng báo cáo lỗi {} ({})", report.id, event.kind.as_str());
                Some(report.id)
            }
            Err(e) => {
                log::warn!("không ghi được hàng đợi báo cáo lỗi: {e}");
                None
            }
        }
    }

    /// Gửi các báo cáo đang chờ, nếu tự động bật và app rảnh. Mỗi báo cáo thử tối đa một lần mỗi lần chạy: lỗi tạm hay `429` thì
    /// ghi một lần thất bại và dừng cả lượt (mạng hỏng thì thử tiếp chỉ vô ích); bị từ chối (`4xx` khác) thì bỏ báo cáo đó và đi
    /// tiếp. Trả số báo cáo đã gửi được.
    pub fn flush(&self) -> usize {
        if !self.host.auto_enabled() {
            return 0;
        }
        let pending = self.queue.lock().unwrap().pending();
        let mut sent = 0;
        for p in pending {
            // Mỗi lần gửi kiểm lại: phiên có thể vừa bắt đầu.
            if !self.host.translation_idle() {
                break;
            }
            if !self.tried.lock().unwrap().insert(p.id.clone()) {
                continue;
            }
            match self.api.send(&p.report) {
                Ok(()) => {
                    self.queue.lock().unwrap().remove(&p.id);
                    sent += 1;
                }
                Err(e @ (SendError::Transient(_) | SendError::RateLimited(_))) => {
                    log::info!("chưa gửi được báo cáo lỗi {}: {e}", p.id);
                    self.queue.lock().unwrap().record_failure(&p.id);
                    break;
                }
                Err(e @ SendError::Rejected { .. }) => {
                    log::warn!("server từ chối báo cáo lỗi {}: {e}", p.id);
                    self.queue.lock().unwrap().remove(&p.id);
                }
            }
        }
        sent
    }

    /// Người dùng bấm "Gửi log cho hỗ trợ": dựng và gửi ngay, trả mã báo cáo.
    pub fn send_manual(&self) -> Result<String, ManualError> {
        let facts = self.host.facts().ok_or(ManualError::NoFacts)?;
        let event = Event {
            kind: Kind::Manual,
            code: None,
            location: String::new(),
            message: String::new(),
            at: self.host.now(),
        };
        let report = report::build(&event, &facts, &self.raw_logs(), &self.params, report::new_id())?;
        self.api.send(&report.json)?;
        Ok(report.id)
    }

    /// Người dùng tắt báo cáo lỗi tự động: bỏ mọi báo cáo đang chờ.
    pub fn purge(&self) {
        self.queue.lock().unwrap().clear();
    }

    /// Số báo cáo đang chờ.
    pub fn pending_count(&self) -> usize {
        self.queue.lock().unwrap().pending().len()
    }

    /// Thân các báo cáo đang chờ, cũ nhất trước (cho test).
    pub fn pending_reports(&self) -> Vec<String> {
        self.queue
            .lock()
            .unwrap()
            .pending()
            .into_iter()
            .map(|p| p.report)
            .collect()
    }

    /// Báo cáo tự động đang bật không (cài đặt và bản build). Người gọi kiểm trước khi tốn công tạo luồng.
    pub fn auto_enabled(&self) -> bool {
        self.host.auto_enabled()
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::reporter 2>&1 | tail -15
```
Expected: `test result: ok. 14 passed; 0 failed`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics:: 2>&1 | tail -5
```
Expected: `test result: ok. 68 passed; 0 failed` (8 scrub + 8 logs + 12 report + 1 machine + 11 queue + 5 send + 9 marker + 14 reporter).

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics && git commit -m "feat(app): Reporter nối che dữ liệu, hàng đợi và gửi, không phụ thuộc Tauri" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ba mã lỗi giao diện của nút gửi tay

**Files:**
- Modify: `src-tauri/src/errors.rs`
- Modify: `src/i18n/en.ts`, `src/i18n/vi.ts`, `src/i18n/ja.ts`, `src/i18n/zh.ts`, `src/i18n/ko.ts`

Lệnh `send_log_report` (Task 12) báo lỗi bằng ba mã: `reportFailed` (mạng hỏng, server lỗi tạm, hay chưa đọc được thông tin máy), `reportRateLimited` (`429`: vừa gửi nhiều), `reportRejected` (server từ chối, hay app hủy vì còn dữ liệu nhạy cảm sau khi che). Báo cáo **tự động** không bao giờ hiện lỗi ra người dùng. Test Rust `every_error_code_has_ui_text` đọc `src/i18n/en.ts` và đòi mỗi mã trong `errors.rs` có câu `error.<mã>`; test TS (`dictionaries.test.ts`) đòi 5 từ điển cùng bộ khóa. Vì vậy ba câu này phải vào **cùng task** với ba mã, ở cả 5 ngôn ngữ (đây là ngoại lệ của kế hoạch 04, nơi có mọi chuỗi giao diện còn lại).

- [ ] **Step 1: Thêm ba mã vào danh sách của test trước (đỏ)**


Trong `src-tauri/src/errors.rs`, tìm đoạn (duy nhất trong file):

```rust
                MODELS_UNSUPPORTED,
            ]
            .map(String::from),
```

và thay bằng:

```rust
                MODELS_UNSUPPORTED,
                REPORT_FAILED,
                REPORT_RATE_LIMITED,
                REPORT_REJECTED,
            ]
            .map(String::from),
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib errors:: 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find value REPORT_FAILED in this scope` (và hai mã kia).

- [ ] **Step 3: Thêm ba mã**

Trong `src-tauri/src/errors.rs`, tìm đoạn (duy nhất trong file):

```rust
pub const MODELS_UNSUPPORTED: &str = "modelsUnsupported";

impl CommandError {
```

và thay bằng:

```rust
pub const MODELS_UNSUPPORTED: &str = "modelsUnsupported";

// Mã lỗi của báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §5). Chỉ nút "Gửi log cho hỗ trợ" hiện chúng; báo cáo tự
// động không bao giờ báo lỗi cho người dùng.
/// Không gửi được báo cáo: mạng hỏng, server lỗi tạm, hay chưa đọc được thông tin máy.
pub const REPORT_FAILED: &str = "reportFailed";
/// Server bảo gửi chậm lại (`429`): người dùng vừa gửi nhiều báo cáo.
pub const REPORT_RATE_LIMITED: &str = "reportRateLimited";
/// Server từ chối báo cáo, hay app hủy vì còn dữ liệu nhạy cảm sau khi che.
pub const REPORT_REJECTED: &str = "reportRejected";

impl CommandError {
```

- [ ] **Step 4: Thêm câu hiển thị ở 5 ngôn ngữ**

Mỗi file thêm ba khóa ngay sau khóa `error.licenseEmailInvalid` (cùng nhóm `error.*`):

**`src/i18n/en.ts`**

Trong `src/i18n/en.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.licenseEmailInvalid": "This email address is not valid.",
  "error.unknown": "Something went wrong.",
```

và thay bằng:

```ts
  "error.licenseEmailInvalid": "This email address is not valid.",
  "error.reportFailed": "Could not send the report. Check your internet connection and try again.",
  "error.reportRateLimited": "You sent several reports recently. Please try again later.",
  "error.reportRejected": "This report could not be sent.",
  "error.unknown": "Something went wrong.",
```

**`src/i18n/vi.ts`**

Trong `src/i18n/vi.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.licenseEmailInvalid": "Địa chỉ email không hợp lệ.",
  "error.unknown": "Có lỗi xảy ra.",
```

và thay bằng:

```ts
  "error.licenseEmailInvalid": "Địa chỉ email không hợp lệ.",
  "error.reportFailed": "Không gửi được báo cáo. Kiểm tra kết nối mạng rồi thử lại.",
  "error.reportRateLimited": "Bạn vừa gửi nhiều báo cáo. Vui lòng thử lại sau.",
  "error.reportRejected": "Không gửi được báo cáo này.",
  "error.unknown": "Có lỗi xảy ra.",
```

**`src/i18n/ja.ts`**

Trong `src/i18n/ja.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.licenseEmailInvalid": "このメールアドレスは無効です。",
  "error.unknown": "問題が発生しました。",
```

và thay bằng:

```ts
  "error.licenseEmailInvalid": "このメールアドレスは無効です。",
  "error.reportFailed": "レポートを送信できませんでした。インターネット接続を確認して、もう一度お試しください。",
  "error.reportRateLimited": "短時間に何度もレポートを送信しました。しばらくしてからもう一度お試しください。",
  "error.reportRejected": "このレポートは送信できませんでした。",
  "error.unknown": "問題が発生しました。",
```

**`src/i18n/zh.ts`**

Trong `src/i18n/zh.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.licenseEmailInvalid": "此邮箱地址无效。",
  "error.unknown": "出了点问题。",
```

và thay bằng:

```ts
  "error.licenseEmailInvalid": "此邮箱地址无效。",
  "error.reportFailed": "无法发送报告。请检查网络连接后重试。",
  "error.reportRateLimited": "你最近发送了多份报告。请稍后重试。",
  "error.reportRejected": "无法发送此报告。",
  "error.unknown": "出了点问题。",
```

**`src/i18n/ko.ts`**

Trong `src/i18n/ko.ts`, tìm đoạn (duy nhất trong file):

```ts
  "error.licenseEmailInvalid": "이 이메일 주소는 올바르지 않습니다.",
  "error.unknown": "문제가 발생했습니다.",
```

và thay bằng:

```ts
  "error.licenseEmailInvalid": "이 이메일 주소는 올바르지 않습니다.",
  "error.reportFailed": "보고서를 보내지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.",
  "error.reportRateLimited": "최근에 보고서를 여러 번 보냈습니다. 나중에 다시 시도하세요.",
  "error.reportRejected": "이 보고서를 보낼 수 없습니다.",
  "error.unknown": "문제가 발생했습니다.",
```

- [ ] **Step 5: Chạy test Rust và test từ điển**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib errors:: 2>&1 | tail -15
```
Expected: `test result: ok.`; `every_error_code_has_ui_text` xanh.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run src/i18n 2>&1 | tail -8
```
Expected: mọi test `passed` (5 từ điển cùng bộ khóa, không khóa thừa).

- [ ] **Step 6: fmt, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/errors.rs src/i18n && git commit -m "feat(app): ba mã lỗi của nút gửi log và câu hiển thị ở 5 ngôn ngữ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Cài đặt `sendErrorReports` và migrate `v1→v2`

**Files:**
- Modify: `src-tauri/src/settings/mod.rs`
- Modify: `src-tauri/src/settings/migrate.rs`

Spec §5: cài mới bắt đầu **tắt** cho tới khi người dùng qua bước Điều khoản (ô tích sẵn của kế hoạch 04 ghi `true`); người dùng đã cài từ trước (file có `onboardingDone = true`) được giữ **bật**, không hỏi, không báo (quyết định của chủ dự án). `schemaVersion` lên `2` bằng một bước migrate mới. Ba test cũ của `migrate.rs` đang viết cứng `schemaVersion: 1` làm "đã ở bản hiện hành": đổi sang `CURRENT_SCHEMA_VERSION` để không phải sửa lại mỗi lần lên bản. Hai khóa `settings` còn lại không đổi.

- [ ] **Step 1: Viết test trước (đỏ)**


Trong `src-tauri/src/settings/mod.rs`:

Trong `src-tauri/src/settings/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
        assert!(!vi.save_history, "lưu lịch sử mặc định tắt (F4)");
        assert!(
            !vi.experimental.translation_context,
            "ngữ cảnh câu trước mặc định tắt (§6.5)"
```

và thay bằng:

```rust
        assert!(!vi.save_history, "lưu lịch sử mặc định tắt (F4)");
        assert!(
            !vi.send_error_reports,
            "báo cáo lỗi tự động: cài mới chưa gửi gì cho tới khi qua bước Điều khoản (spec 2026-10-17 §5)"
        );
        assert!(
            !vi.experimental.translation_context,
            "ngữ cảnh câu trước mặc định tắt (§6.5)"
```

Trong `src-tauri/src/settings/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
            "saveHistory",
            "launchAtLogin",
            "theme",
```

và thay bằng:

```rust
            "saveHistory",
            "sendErrorReports",
            "launchAtLogin",
            "theme",
```

Trong `src-tauri/src/settings/migrate.rs` (ba test cũ đổi sang `CURRENT_SCHEMA_VERSION`, thêm hai test mới):

Trong `src-tauri/src/settings/migrate.rs`, tìm đoạn (duy nhất trong file):

```rust
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(1));
```

và thay bằng:

```rust
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
```

Trong `src-tauri/src/settings/migrate.rs`, tìm đoạn (duy nhất trong file):

```rust
        let raw = object(json!({ "schemaVersion": 1, "theme": "dark" }));
```

và thay bằng:

```rust
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
```

Trong `src-tauri/src/settings/migrate.rs`, tìm đoạn (duy nhất trong file):

```rust
        let raw = object(json!({ "schemaVersion": 1, "hotkeys": { "toggleSession": "Ctrl+Alt+K" } }));
```

và thay bằng:

```rust
        let raw =
            object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "hotkeys": { "toggleSession": "Ctrl+Alt+K" } }));
```

Trong `src-tauri/src/settings/migrate.rs`, ngay sau đoạn này (duy nhất trong file):

```rust
        assert_eq!(entries["theme"], json!("system"));
    }
```

thêm nguyên văn:

```rust
    /// Spec 2026-10-17 §5: người dùng đã cài từ trước (đã xong onboarding) giữ báo cáo lỗi bật mà không hỏi; mọi trường hợp
    /// khác bắt đầu tắt.
    #[test]
    fn existing_users_keep_error_reports_on_and_new_installs_start_off() {
        let migrated = |raw: Value| load(object(raw), defaults()).settings.send_error_reports;
        assert!(
            migrated(json!({ "schemaVersion": 1, "onboardingDone": true })),
            "file bản 1, đã xong onboarding"
        );
        assert!(
            migrated(json!({ "onboardingDone": true })),
            "file chưa có schemaVersion (bản 0), đã xong onboarding"
        );
        assert!(
            !migrated(json!({ "schemaVersion": 1, "onboardingDone": false })),
            "cài dở: chờ bước Điều khoản"
        );
        assert!(!migrated(json!({ "schemaVersion": 1 })), "chưa từng xong onboarding");
        assert!(!migrated(json!({})), "cài mới (không có file)");
        // Đã ở bản 2 thì bước migrate không chạy lại: người dùng đã tắt thì vẫn tắt.
        assert!(!migrated(json!({ "schemaVersion": 2, "onboardingDone": true })));
        assert!(!migrated(
            json!({ "schemaVersion": 2, "onboardingDone": true, "sendErrorReports": false })
        ));
        assert!(migrated(
            json!({ "schemaVersion": 2, "onboardingDone": true, "sendErrorReports": true })
        ));
        // Giá trị người dùng đã có (không thể có ở bản 1 thật, nhưng file sửa tay) không bị ghi đè.
        assert!(!migrated(
            json!({ "schemaVersion": 1, "onboardingDone": true, "sendErrorReports": false })
        ));
    }

    #[test]
    fn migrating_an_existing_file_asks_to_save_it_with_the_new_version() {
        let loaded = load(
            object(json!({ "schemaVersion": 1, "onboardingDone": true })),
            defaults(),
        );
        assert!(loaded.needs_save(), "file bản 1 phải được ghi lại ở bản 2");
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(2));
        assert_eq!(entries["sendErrorReports"], json!(true));
        // Cài mới: sau lần ghi đầu, khóa là false.
        let fresh = load(Map::new(), defaults());
        let entries: Map<String, Value> = to_entries(&fresh.settings, &fresh.meta).into_iter().collect();
        assert_eq!(entries["sendErrorReports"], json!(false));
    }
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib settings:: 2>&1 | tail -15
```
Expected: FAIL biên dịch: `no field send_error_reports on type Settings`.

- [ ] **Step 3: Cài đặt**

Trong `src-tauri/src/settings/mod.rs` (trường mới và giá trị mặc định):

Trong `src-tauri/src/settings/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
    pub save_history: bool,
    pub launch_at_login: bool,
    pub theme: Theme,
```

và thay bằng:

```rust
    pub save_history: bool,
    /// Gửi báo cáo lỗi tự động cho nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §5). Cài mới: `false` cho tới
    /// khi người dùng qua bước Điều khoản (ô tích sẵn, bỏ tích được); file cài đặt của người dùng đã cài từ trước: bước migrate
    /// `v1→v2` đặt `true` (quyết định của chủ dự án 2026-10-17). Bản debug vẫn không tự gửi trừ khi bật công tắc dev.
    pub send_error_reports: bool,
    pub launch_at_login: bool,
    pub theme: Theme,
```

Trong `src-tauri/src/settings/mod.rs`, tìm đoạn (duy nhất trong file):

```rust
            save_history: false,
            launch_at_login: false,
            theme: Theme::System,
```

và thay bằng:

```rust
            save_history: false,
            send_error_reports: false,
            launch_at_login: false,
            theme: Theme::System,
```

Trong `src-tauri/src/settings/migrate.rs` (bước migrate mới):

Trong `src-tauri/src/settings/migrate.rs`, tìm đoạn (duy nhất trong file):

```rust
pub const MIGRATIONS: &[Migration] = &[v0_to_v1];
```

và thay bằng:

```rust
pub const MIGRATIONS: &[Migration] = &[v0_to_v1, v1_to_v2];
```

Trong `src-tauri/src/settings/migrate.rs`, tìm đoạn (duy nhất trong file):

```rust
fn v0_to_v1(_raw: &mut Map<String, Value>) {}

/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
```

và thay bằng:

```rust
fn v0_to_v1(_raw: &mut Map<String, Value>) {}

/// Bản 2 thêm `sendErrorReports` (báo cáo lỗi tự động, spec 2026-10-17 §5). Người dùng đã cài từ trước (file có
/// `onboardingDone = true`) giữ bật, không hỏi và không báo: quyết định của chủ dự án. File của cài mới hay cài dở
/// (`onboardingDone` chưa `true`, hay file rỗng) không đặt gì: mặc định `false` cho tới khi qua bước Điều khoản.
fn v1_to_v2(raw: &mut Map<String, Value>) {
    if raw.get("onboardingDone") == Some(&Value::Bool(true)) {
        raw.entry("sendErrorReports").or_insert(Value::Bool(true));
    }
}

/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib settings:: 2>&1 | tail -15
```
Expected: `test result: ok.`, 0 failed (gồm hai test mới `existing_users_keep_error_reports_on_and_new_installs_start_off`, `migrating_an_existing_file_asks_to_save_it_with_the_new_version`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib 2>&1 | tail -5
```
Expected: `test result: ok.`, 0 failed (không test nào ở chỗ khác phụ thuộc `schemaVersion` bằng 1).

- [ ] **Step 5: fmt, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/settings && git commit -m "feat(app): cài đặt sendErrorReports, migrate v1 sang v2 giữ bật cho người dùng cũ" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Phần ghép với app (`diagnostics/mod.rs`) và công cụ test

**Files:**
- Modify: `src-tauri/src/test_support.rs`, `src-tauri/src/license/manager.rs` (test)
- Modify (viết đủ): `src-tauri/src/diagnostics/mod.rs`

`mod.rs` làm bốn việc:
1. **`AppHost`** (cài đặt của `Host`): `auto_enabled` = bản build cho phép (`auto_allowed_in_this_build`: bản phát hành luôn, bản debug chỉ khi `AI_TRANSLATOR_DEV_REPORTS=true`) **và** `settings.send_error_reports`; `translation_idle` (quyết định 2); `facts` đọc mã máy băm (`device::hardware_id` rồi `hash_id`), `machine::system_info`, RAM, gói bản quyền (không bao giờ có key), ngôn ngữ giao diện, gói model và backend GPU của `asr-worker` lần chạy gần nhất (`AsrBackendNote`, do `session.rs` ghi ở Task 12).
2. **`install`**: tạo `Reporter` (log ở thư mục log của app, hàng đợi ở `<app local data>/reports`), cài panic hook, phân loại lần chạy trước (báo `crash` trên luồng nền nếu cần), rồi chạy luồng gửi nền: đợi 10 giây, sau đó kiểm hàng đợi mỗi 30 giây.
3. **Điểm kích hoạt** gọi từ nơi khác: `on_session_error` (chỉ mã trong `REPORTED_CODES`), `on_sidecar_died`, `mark_clean_exit`, `purge_queue`, và `send_manual` cho lệnh `send_log_report`.
4. **Phân loại mã lỗi**: `REPORTED_CODES` (lỗi của chính app: `sidecarFailed`, `sidecarMissing`, `sidecarTampered`, `modelBroken`, `vadFailed`, `captureFailed`, `dataUnavailable`, `unknown`) và `SKIPPED_CODES` (mọi mã còn lại: quyền ghi âm, hạn mức, dùng thử, key, mạng, dung lượng, model chưa tải, phím tắt, cập nhật… và chính ba mã gửi báo cáo). Test `every_error_code_is_classified_exactly_once` quét `errors.rs` và buộc mọi mã nằm đúng một trong hai danh sách, nên ai thêm mã lỗi mới sau này phải quyết định nó có gửi báo cáo hay không.

- [ ] **Step 1: Công cụ test chung**

Test của `mod.rs`, `session.rs` và `app_tests.rs` cần chung một logger bắt log, một `Reporter` với log giả và máy chủ giả, và một app giả đã bật cài đặt. Chuyển logger của `license::manager` sang `test_support` (quyết định 5):


Trong `src-tauri/src/license/manager.rs`, tìm đoạn (duy nhất trong file):

```rust
    /// Bắt log của mọi luồng, kèm luồng ghi: test chỉ đọc phần của luồng mình.
    static CAPTURED: Mutex<Vec<(std::thread::ThreadId, String)>> = Mutex::new(Vec::new());

    struct Capture;

    impl log::Log for Capture {
        fn enabled(&self, _: &log::Metadata) -> bool {
            true
        }

        fn log(&self, record: &log::Record) {
            CAPTURED
                .lock()
                .unwrap()
                .push((std::thread::current().id(), record.args().to_string()));
        }

        fn flush(&self) {}
    }

    fn capture_logs() {
        static ONCE: std::sync::Once = std::sync::Once::new();
        ONCE.call_once(|| {
            let _ = log::set_logger(&Capture);
            log::set_max_level(log::LevelFilter::Warn);
        });
    }

    fn logs_of_this_thread() -> Vec<String> {
        let me = std::thread::current().id();
        CAPTURED
            .lock()
            .unwrap()
            .iter()
            .filter(|(thread, _)| *thread == me)
            .map(|(_, m)| m.clone())
            .collect()
    }
```

và thay bằng:

```rust
    // Log của cả tiến trình test do logger chung ở `test_support` ghi lại (mỗi dòng kèm luồng ghi): test chỉ đọc phần của luồng
    // mình. Dùng chung một logger vì `log::set_logger` chỉ cài được một lần mỗi tiến trình, mà báo cáo lỗi (spec 2026-10-17) cũng
    // cần đọc log thật của một phiên.
    use crate::test_support::{capture_logs, logs_of_this_thread};
```

Thêm vào **cuối** `src-tauri/src/test_support.rs`:

Trong `src-tauri/src/test_support.rs`, ngay sau đoạn này (duy nhất trong file):

```rust
    matches!(result, Err(message) if message.contains("not allowed"))
```

thêm nguyên văn:

```rust
}

// ---- Báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md) ----

/// Log của cả tiến trình test, do một logger toàn cục ghi (như `tauri-plugin-log` ghi `app.log`), kèm luồng ghi từng dòng. Báo
/// cáo lỗi của một phiên giả đọc log này, nên test kiểm được báo cáo từ log thật của phiên; test bản quyền đọc phần của luồng mình
/// (`logs_of_this_thread`). Một logger chung vì `log::set_logger` chỉ cài được một lần mỗi tiến trình.
static CAPTURED_LOG: Mutex<Vec<(std::thread::ThreadId, String)>> = Mutex::new(Vec::new());

struct CapturedLog;

impl log::Log for CapturedLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        CAPTURED_LOG.lock().unwrap().push((
            std::thread::current().id(),
            format!("[{}][{}] {}", record.level(), record.target(), record.args()),
        ));
    }

    fn flush(&self) {}
}

/// Cài logger ghi lại, mức Info (một lần mỗi tiến trình test).
pub fn capture_logs() {
    static INIT: std::sync::Once = std::sync::Once::new();
    INIT.call_once(|| {
        let _ = log::set_logger(&CapturedLog);
        log::set_max_level(log::LevelFilter::Info);
    });
}

/// Các dòng log mà luồng đang chạy đã ghi, từ lúc cài logger.
pub fn logs_of_this_thread() -> Vec<String> {
    let me = std::thread::current().id();
    CAPTURED_LOG
        .lock()
        .unwrap()
        .iter()
        .filter(|(thread, _)| *thread == me)
        .map(|(_, line)| line.clone())
        .collect()
}

/// Nguồn log của báo cáo lỗi trong app giả: `app.log` là log đã ghi lại ở trên; hai log tiến trình phụ rỗng.
pub struct FakeReportLogs;

impl crate::diagnostics::logs::LogSource for FakeReportLogs {
    fn read(&self, file: crate::diagnostics::logs::LogFile) -> String {
        match file {
            crate::diagnostics::logs::LogFile::App => {
                let mut text = CAPTURED_LOG
                    .lock()
                    .unwrap()
                    .iter()
                    .map(|(_, line)| line.as_str())
                    .collect::<Vec<_>>()
                    .join("\n");
                text.push('\n');
                text
            }
            _ => String::new(),
        }
    }
}

/// Máy chủ báo cáo giả: trả lần lượt các kết quả đã đặt (hết thì `Ok`) và giữ lại thân đã nhận.
#[derive(Clone, Default)]
pub struct FakeReportApi {
    pub script: Arc<Mutex<Vec<Result<(), crate::diagnostics::send::SendError>>>>,
    pub bodies: Arc<Mutex<Vec<String>>>,
}

impl crate::diagnostics::send::ReportApi for FakeReportApi {
    fn send(&self, body: &str) -> Result<(), crate::diagnostics::send::SendError> {
        self.bodies.lock().unwrap().push(body.to_string());
        let mut script = self.script.lock().unwrap();
        if script.is_empty() { Ok(()) } else { script.remove(0) }
    }
}

/// `Reporter` đã cài vào app giả, cùng máy chủ giả của nó.
pub struct ReportRig {
    pub reporter: Arc<crate::diagnostics::reporter::Reporter>,
    pub api: FakeReportApi,
}

/// Cài báo cáo lỗi vào app giả (như `diagnostics::install` ở app thật): máy chủ giả, log ghi lại, thư mục hàng đợi tạm riêng, và
/// cho phép gửi tự động dù đang là bản debug. Cài đặt `sendErrorReports` của app giả vẫn mặc định tắt: test bật bằng
/// `update_settings`.
pub fn install_reports(app: &tauri::App<MockRuntime>) -> ReportRig {
    capture_logs();
    static DIRS: AtomicUsize = AtomicUsize::new(0);
    let dir = std::env::temp_dir().join(format!(
        "{APP_DIR_PREFIX}reports-{}-{}",
        std::process::id(),
        DIRS.fetch_add(1, Ordering::SeqCst)
    ));
    let _ = std::fs::remove_dir_all(&dir);
    let api = FakeReportApi::default();
    let reporter =
        crate::diagnostics::reporter_for_tests(app.handle(), Box::new(FakeReportLogs), Box::new(api.clone()), dir);
    app.manage(reporter.clone());
    app.manage(crate::diagnostics::AsrBackendNote::default());
    ReportRig { reporter, api }
}

/// Bật `sendErrorReports` trong app giả, như người dùng bật ở Cài đặt (không qua lệnh, nên không cần cửa sổ).
pub fn enable_error_reports(app: &tauri::App<MockRuntime>) {
    let state = app.state::<AppState>();
    let mut next = state.settings();
    next.send_error_reports = true;
    state.replace_settings(&mut next);
```

- [ ] **Step 2: Viết test của `mod.rs` trước (đỏ)**

Thêm vào **cuối** `src-tauri/src/diagnostics/mod.rs` (hiện chỉ có khung của Task 1 và các dòng `pub mod`) khối test sau:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::mock_app;

    #[test]
    fn every_error_code_is_classified_exactly_once() {
        let source = include_str!("../errors.rs");
        let declared = regex::Regex::new(r#"(?m)^pub const [A-Z_]+: &str = "([A-Za-z]+)";"#).unwrap();
        let codes: Vec<&str> = declared
            .captures_iter(source)
            .map(|c| c.get(1).unwrap().as_str())
            .collect();
        assert!(codes.len() > 40, "đọc được {} mã trong errors.rs", codes.len());
        for code in &codes {
            let times = REPORTED_CODES
                .iter()
                .chain(SKIPPED_CODES)
                .filter(|c| *c == code)
                .count();
            assert_eq!(
                times, 1,
                "mã `{code}` phải nằm đúng một trong REPORTED_CODES hay SKIPPED_CODES"
            );
        }
        for listed in REPORTED_CODES.iter().chain(SKIPPED_CODES) {
            assert!(codes.contains(listed), "`{listed}` không còn trong errors.rs");
        }
    }

    #[test]
    fn only_the_apps_own_errors_are_reported() {
        for code in [
            "sidecarFailed",
            "sidecarMissing",
            "sidecarTampered",
            "modelBroken",
            "vadFailed",
            "captureFailed",
            "dataUnavailable",
            "unknown",
        ] {
            assert!(is_reported(code), "{code}");
        }
        for code in [
            "audioPermission",
            "quotaExhausted",
            "trialEnded",
            "licenseInvalid",
            "modelsOffline",
            "modelsNoSpace",
            "modelMissing",
            "updateBusy",
            "reportFailed",
        ] {
            assert!(!is_reported(code), "{code}");
        }
    }

    #[test]
    fn the_previous_run_becomes_a_crash_event_only_when_the_app_is_to_blame() {
        let now = 1_790_812_800;
        let panicked = PreviousRun::Panicked {
            at: now - 9,
            location: "src-tauri/src/a.rs:1".into(),
            message: "boom".into(),
        };
        let event = crash_event(panicked, now).unwrap();
        assert_eq!(
            (event.kind, event.code.as_deref(), event.at),
            (Kind::Crash, Some("panic"), now - 9)
        );
        assert_eq!(
            (event.location.as_str(), event.message.as_str()),
            ("src-tauri/src/a.rs:1", "boom")
        );
        let unclean = crash_event(PreviousRun::Unclean { started_at: now - 500 }, now).unwrap();
        assert_eq!(
            (unclean.kind, unclean.code.as_deref(), unclean.location.as_str()),
            (Kind::Crash, Some("unclean_exit"), "unclean")
        );
        assert_eq!(unclean.at, now);
        assert_eq!(crash_event(PreviousRun::Clean, now), None);
        assert_eq!(crash_event(PreviousRun::RebootedSince, now), None);
    }

    #[test]
    fn manual_errors_map_to_the_three_ui_codes() {
        let code = |e: ManualError| manual_error(&e).code;
        assert_eq!(
            code(ManualError::Send(SendError::RateLimited(None))),
            "reportRateLimited"
        );
        assert_eq!(
            code(ManualError::Send(SendError::Transient("x".into()))),
            "reportFailed"
        );
        assert_eq!(code(ManualError::NoFacts), "reportFailed");
        assert_eq!(
            code(ManualError::Send(SendError::Rejected {
                status: 422,
                code: "rejected_sensitive".into()
            })),
            "reportRejected"
        );
        assert_eq!(
            code(ManualError::Build(report::BuildError::Sensitive("email"))),
            "reportRejected"
        );
        // Câu lỗi kèm cho bộ phận hỗ trợ không bao giờ chứa nội dung báo cáo.
        let e = manual_error(&ManualError::Build(report::BuildError::Sensitive("home_path")));
        assert!(
            e.message.contains("home_path") && !e.message.contains('/'),
            "{}",
            e.message
        );
    }

    /// Công tắc dev: chỉ đúng `true`; bản phát hành không có công tắc (kể cả khi biến môi trường được đặt). Chạy cả với
    /// `--release`.
    #[test]
    fn only_a_debug_build_with_the_switch_on_sends_automatically() {
        // Tên biến viết thẳng ở đây vì hằng `DEV_REPORTS_ENV` chỉ có ở bản debug, mà test này phải biên dịch cả ở bản release.
        let on = std::env::var("AI_TRANSLATOR_DEV_REPORTS").as_deref() == Ok("true");
        assert_eq!(dev_reports(), cfg!(debug_assertions) && on);
        assert_eq!(auto_allowed_in_this_build(), !cfg!(debug_assertions) || dev_reports());
        #[cfg(not(debug_assertions))]
        {
            assert!(!dev_reports());
            assert!(auto_allowed_in_this_build());
        }
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_switch_is_on_only_for_the_exact_value_true() {
        assert!(switch_on(Some("true")));
        for value in [
            None,
            Some(""),
            Some("1"),
            Some("TRUE"),
            Some("True"),
            Some("yes"),
            Some(" true"),
            Some("true "),
        ] {
            assert!(!switch_on(value), "{value:?}");
        }
    }

    #[test]
    fn the_host_follows_the_setting_the_build_and_the_session_state() {
        let app = mock_app();
        let host = AppHost::new(app.handle().clone(), true);
        assert!(!host.auto_enabled(), "cài mới: tắt cho tới khi người dùng bật");
        let mut settings = app.state::<AppState>().settings();
        settings.send_error_reports = true;
        app.state::<AppState>().replace_settings(&mut settings);
        assert!(host.auto_enabled());
        assert!(
            !AppHost::new(app.handle().clone(), false).auto_enabled(),
            "bản build không cho phép"
        );
        assert!(host.translation_idle());
        for (session, idle) in [
            (SessionStatus::Idle, true),
            (SessionStatus::Error, true),
            (SessionStatus::Starting, false),
            (SessionStatus::Running, false),
        ] {
            app.state::<AppState>().update_status(|s| s.session = session);
            assert_eq!(host.translation_idle(), idle, "{session:?}");
        }
    }

    #[test]
    fn the_hosts_facts_follow_the_contract() {
        let app = mock_app();
        let host = AppHost::new(app.handle().clone(), true);
        let Some(facts) = host.facts() else {
            // Máy không đọc được mã phần cứng (hiếm): lõi bỏ báo cáo, không lỗi.
            return;
        };
        assert_eq!(facts.device_id_hash.len(), 64);
        assert_eq!(facts.ui_lang, "vi");
        assert_eq!(facts.build, if cfg!(debug_assertions) { "debug" } else { "release" });
        assert!(facts.app_version.split('.').count() >= 3, "{}", facts.app_version);
        assert!(facts.plan.is_none(), "app giả chưa cài bản quyền");
        assert_eq!(facts.os_name, std::env::consts::OS);
    }

    /// Lần chạy trước chết (panic hay thoát không bình thường) thì lần mở này xếp hàng một báo cáo `crash`; thoát bình thường
    /// hay máy khởi động lại thì không.
    #[test]
    fn the_previous_run_is_reported_at_startup_only_when_the_app_crashed() {
        use crate::test_support::{enable_error_reports, install_reports};
        let wait_for = |rig: &crate::test_support::ReportRig, n: usize| {
            let started = std::time::Instant::now();
            while rig.reporter.pending_count() < n {
                assert!(
                    started.elapsed() < Duration::from_secs(10),
                    "chờ quá lâu: báo cáo crash"
                );
                std::thread::sleep(Duration::from_millis(20));
            }
        };
        let app = mock_app();
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let now = unix_now();
        report_previous_run(&rig.reporter, PreviousRun::Clean, now);
        report_previous_run(&rig.reporter, PreviousRun::RebootedSince, now);
        std::thread::sleep(Duration::from_millis(100));
        assert_eq!(rig.reporter.pending_count(), 0);
        let panicked = PreviousRun::Panicked {
            at: now - 5,
            location: "src-tauri/src/a.rs:1".into(),
            message: "boom".into(),
        };
        report_previous_run(&rig.reporter, panicked, now);
        wait_for(&rig, 1);
        report_previous_run(&rig.reporter, PreviousRun::Unclean { started_at: now - 900 }, now);
        wait_for(&rig, 2);
        let reports: Vec<serde_json::Value> = rig
            .reporter
            .pending_reports()
            .iter()
            .map(|r| serde_json::from_str(r).unwrap())
            .collect();
        assert_eq!(
            (reports[0]["kind"].as_str(), reports[0]["code"].as_str()),
            (Some("crash"), Some("panic"))
        );
        assert_eq!(reports[0]["message"], "boom");
        assert_eq!(reports[1]["code"], "unclean_exit");
        assert_ne!(reports[0]["fingerprint"], reports[1]["fingerprint"]);
    }

    #[test]
    fn the_asr_backend_is_remembered_for_the_report() {
        let app = mock_app();
        app.manage(AsrBackendNote::default());
        let host = AppHost::new(app.handle().clone(), true);
        let Some(before) = host.facts() else {
            return;
        };
        assert_eq!(before.gpu_backend, None, "chưa có asr-worker nào chạy");
        note_asr_backend(app.handle(), Some(Backend::Metal));
        assert_eq!(host.facts().unwrap().gpu_backend.as_deref(), Some("metal"));
        note_asr_backend(app.handle(), Some(Backend::Cpu));
        assert_eq!(host.facts().unwrap().gpu_backend.as_deref(), Some("cpu"));
        note_asr_backend(app.handle(), None);
        assert_eq!(host.facts().unwrap().gpu_backend, None);
    }
}
```

- [ ] **Step 3: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics::tests 2>&1 | tail -15
```
Expected: FAIL biên dịch: `cannot find type AppHost`, `AsrBackendNote`, `reporter_for_tests`… (chưa có phần ghép).

- [ ] **Step 4: Viết phần ghép**

Trong `src-tauri/src/diagnostics/mod.rs`, xóa mọi dòng **phía trên** `#[cfg(test)]` của khối test vừa thêm và dán thay đoạn sau (giữ nguyên khối test; đoạn này gồm cả danh sách `pub mod`, doc đầy đủ và hàm `reporter_for_tests` chỉ có khi test):

```rust
//! Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md; kế hoạch bao-cao-loi-03).
//!
//! App tự gửi một báo cáo đã che dữ liệu cá nhân khi gặp lỗi của chính nó, và người dùng gửi tay được từ màn hình Giới thiệu.
//! Cam kết (spec §1, §2): không bao giờ có âm thanh, chữ chép lời, bản dịch, key, token, email, tên tài khoản hay đường dẫn
//! thư mục cá nhân trong báo cáo; không gửi trong lúc đang dịch; mỗi máy tối đa 1 báo cáo mỗi dấu vân tay mỗi 24 giờ và 5 báo
//! cáo mỗi ngày; bản debug không tự gửi trừ khi bật công tắc dev.
//!
//! - [`scrub`]: che dữ liệu và phát hiện dữ liệu còn sót (chung vector với server);
//! - [`logs`]: chọn dòng log đưa vào báo cáo; [`machine`]: hệ điều hành và chip;
//! - [`report`]: dựng JSON đúng hợp đồng của `POST /v1/diagnostics`, trong 64 KB, fail closed;
//! - [`queue`]: hàng đợi trên đĩa và giới hạn; [`send`]: gửi HTTP; [`marker`]: dấu vết của lần chạy trước (crash);
//! - [`reporter`]: lõi nối các phần trên, không phụ thuộc Tauri; file này là phần ghép với app (điểm kích hoạt, trạng thái
//!   quản lý bằng `app.manage`, lệnh `send_log_report`).

pub mod logs;
pub mod machine;
pub mod marker;
pub mod queue;
pub mod report;
pub mod reporter;
pub mod scrub;
pub mod send;

use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use asr_protocol::Backend;
use pipeline::supervisor::Which;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use self::logs::FileLogs;
use self::marker::{PreviousRun, RunFiles};
use self::queue::Queue;
use self::report::{Event, Facts, Kind};
use self::reporter::{Host, ManualError, Reporter};
use self::scrub::Params;
use self::send::{HttpReportApi, SendError};
use crate::errors::{self, CommandError};
use crate::license::{app as license_app, device};
use crate::models::machine as models_machine;
use crate::settings::UiLanguage;
use crate::state::{AppState, SessionStatus};

/// Chờ bấy nhiêu giây sau khi mở app rồi mới gửi lần đầu (spec §1).
pub const FIRST_SEND_DELAY_SECS: u64 = 10;
/// Nhịp kiểm hàng đợi để gửi, giây.
pub const FLUSH_EVERY_SECS: u64 = 30;
/// Chờ trước khi đọc log của một sự kiện, để dòng log của chính lỗi đó kịp ghi xuống file.
const LOG_FLUSH_DELAY: Duration = Duration::from_millis(500);

/// Biến môi trường của công tắc dev: đúng `true` thì bản debug tự gửi báo cáo lỗi (tới production, như mọi bản build). Chỉ bản
/// debug có biến này: bản phát hành không có mã đọc nó và không có cả tên biến (`release-check.mjs no-dev-gate` chặn nếu lọt
/// vào, cùng cơ chế với `AI_TRANSLATOR_DEV_PRO` ở `pro.rs`).
#[cfg(debug_assertions)]
pub const DEV_REPORTS_ENV: &str = "AI_TRANSLATOR_DEV_REPORTS";

/// Công tắc dev bật khi nào: chỉ giá trị đúng `true` (phân biệt hoa thường).
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Công tắc dev đang bật: chỉ bản debug có `AI_TRANSLATOR_DEV_REPORTS=true`. Bản phát hành luôn `false`.
pub fn dev_reports() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_REPORTS_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Bản build này cho phép báo cáo tự động không: bản phát hành luôn; bản debug chỉ khi công tắc dev bật. (Cài đặt
/// `sendErrorReports` của người dùng là điều kiện riêng.) Gửi tay không phụ thuộc điều này.
pub fn auto_allowed_in_this_build() -> bool {
    !cfg!(debug_assertions) || dev_reports()
}

/// Mã lỗi phiên dịch **có** gửi báo cáo: lỗi của chính app (spec §1).
pub const REPORTED_CODES: &[&str] = &[
    errors::SIDECAR_FAILED,
    errors::SIDECAR_MISSING,
    errors::SIDECAR_TAMPERED,
    errors::MODEL_BROKEN,
    errors::VAD_FAILED,
    errors::CAPTURE_FAILED,
    errors::DATA_UNAVAILABLE,
    errors::UNKNOWN,
];

/// Mã lỗi **không** gửi: do môi trường hay người dùng (quyền ghi âm, hạn mức, dùng thử, key, mạng, dung lượng, model chưa
/// tải…), lỗi phím tắt, cài đặt, mở file, cập nhật và chính lỗi gửi báo cáo. Test `every_error_code_is_classified_exactly_once`
/// buộc mọi mã trong `errors.rs` nằm đúng một trong hai danh sách: thêm mã mới thì phải quyết định.
pub const SKIPPED_CODES: &[&str] = &[
    errors::AUTOSTART_FAILED,
    errors::AUTOSTART_STILL_ENABLED,
    errors::OVERLAY_FAILED,
    errors::OPEN_FAILED,
    errors::UNSUPPORTED,
    errors::MODEL_MISSING,
    errors::AUDIO_PERMISSION,
    errors::APP_NOT_PLAYING,
    errors::QUOTA_EXHAUSTED,
    errors::TRIAL_ENDED,
    errors::TRIAL_NEEDS_NETWORK,
    errors::CLOCK_ROLLED_BACK,
    errors::LICENSE_CONFLICT,
    errors::LICENSE_INVALID,
    errors::LICENSE_NEEDS_REFRESH,
    errors::PRO_REQUIRED,
    errors::FILE_FAILED,
    errors::FILE_TOO_LARGE,
    errors::UPDATE_NOT_READY,
    errors::UPDATE_BUSY,
    errors::MODELS_NO_SOURCE,
    errors::MODELS_OFFLINE,
    errors::MODELS_MANIFEST_INVALID,
    errors::MODELS_UNKNOWN_PACK,
    errors::MODELS_APP_TOO_OLD,
    errors::MODELS_NO_SPACE,
    errors::MODELS_BUSY,
    errors::MODELS_IN_USE,
    errors::MODELS_DOWNLOAD_FAILED,
    errors::MODELS_CHECKSUM,
    errors::MODELS_DISK,
    errors::MODELS_UNSUPPORTED,
    errors::REPORT_FAILED,
    errors::REPORT_RATE_LIMITED,
    errors::REPORT_REJECTED,
];

/// Mã lỗi này có gửi báo cáo không.
pub fn is_reported(code: &str) -> bool {
    REPORTED_CODES.contains(&code)
}

/// Backend GPU của `asr-worker` lần chạy gần nhất (`metal`, `vulkan`, `cpu`); `None` nếu chưa chạy lần nào. Quản lý bằng
/// `app.manage`, nên mỗi app (kể cả app giả của test) có bản riêng.
#[derive(Default)]
pub struct AsrBackendNote(Mutex<Option<&'static str>>);

/// `asr-worker` vừa sẵn sàng (`SidecarEvent::Ready`): nhớ backend thật của nó cho báo cáo.
pub fn note_asr_backend<R: Runtime>(app: &AppHandle<R>, backend: Option<Backend>) {
    if let Some(note) = app.try_state::<AsrBackendNote>() {
        *note.0.lock().unwrap() = backend.map(Backend::as_str);
    }
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(i64::MAX))
}

/// Gói bản quyền được phép gửi (không bao giờ có key).
const PLAN_CODES: [&str; 4] = ["free", "monthly", "six_months", "yearly"];

/// Những gì lõi cần biết về app, đọc từ trạng thái quản lý của Tauri mỗi lần dùng.
struct AppHost<R: Runtime> {
    app: AppHandle<R>,
    /// Bản build này cho phép báo cáo tự động (`auto_allowed_in_this_build`); test đặt `true`.
    build_allows_auto: bool,
    /// `device_id_hash` của máy, đọc một lần (hỏi hệ điều hành mã phần cứng).
    device_hash: OnceLock<Option<String>>,
}

impl<R: Runtime> AppHost<R> {
    fn new(app: AppHandle<R>, build_allows_auto: bool) -> Self {
        Self {
            app,
            build_allows_auto,
            device_hash: OnceLock::new(),
        }
    }
}

impl<R: Runtime> Host for AppHost<R> {
    fn auto_enabled(&self) -> bool {
        self.build_allows_auto
            && self
                .app
                .try_state::<AppState>()
                .is_some_and(|state| state.settings().send_error_reports)
    }

    /// Rảnh: không có phiên nào đang bắt đầu hay chạy. Dừng phiên giữ trạng thái `Running` cho tới khi xong (câu cuối còn
    /// được dịch), nên `Idle` và `Error` là lúc không còn gì dịch.
    fn translation_idle(&self) -> bool {
        self.app
            .try_state::<AppState>()
            .is_some_and(|state| matches!(state.status().session, SessionStatus::Idle | SessionStatus::Error))
    }

    fn facts(&self) -> Option<Facts> {
        let settings = self.app.try_state::<AppState>()?.settings();
        let device_id_hash = self
            .device_hash
            .get_or_init(|| device::hardware_id().ok().map(|id| device::hash_id(&id)))
            .clone()?;
        let system = machine::system_info();
        let model_pack = settings
            .model_tier
            .as_deref()
            .filter(|p| {
                p.len() <= 64
                    && p.chars()
                        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
            })
            .map(str::to_string);
        let plan = license_app::view(&self.app)
            .map(|view| view.plan)
            .filter(|plan| PLAN_CODES.contains(&plan.as_str()));
        Some(Facts {
            app_version: self.app.package_info().version.to_string(),
            build: if cfg!(debug_assertions) { "debug" } else { "release" },
            os_name: system.os_name.to_string(),
            os_version: report::clean_meta(&system.os_version, 64).unwrap_or_else(|| "unknown".to_string()),
            arch: system.arch.to_string(),
            chip: system.chip.and_then(|chip| report::clean_meta(&chip, 128)),
            ram_mb: models_machine::total_ram_bytes().map(|bytes| bytes >> 20),
            gpu_backend: self
                .app
                .try_state::<AsrBackendNote>()
                .and_then(|note| *note.0.lock().unwrap())
                .map(str::to_string),
            model_pack,
            plan,
            ui_lang: match settings.ui_language {
                UiLanguage::En => "en",
                UiLanguage::Vi => "vi",
                UiLanguage::Ja => "ja",
                UiLanguage::Zh => "zh",
                UiLanguage::Ko => "ko",
            }
            .to_string(),
            device_id_hash,
        })
    }

    fn now(&self) -> i64 {
        unix_now()
    }
}

/// Cài báo cáo lỗi lúc khởi động (`setup`, sau khi đã có `AppState`, bản quyền và `Session`): tạo `Reporter`, cài panic hook,
/// phân loại lần chạy trước (báo `crash` nếu cần), đặt dấu "đang chạy" của lần này, và chạy luồng gửi nền.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let dir = app.path().app_local_data_dir()?.join("reports");
    let log_dir = app.path().app_log_dir()?;
    #[cfg(debug_assertions)]
    if dev_reports() {
        log::warn!("{DEV_REPORTS_ENV}=true: bản debug này TỰ GỬI báo cáo lỗi tới production (khi bật ở Cài đặt)");
    }
    let reporter = Arc::new(Reporter::new(
        Box::new(AppHost::new(app.clone(), auto_allowed_in_this_build())),
        Box::new(FileLogs { dir: log_dir }),
        Box::new(HttpReportApi::for_this_build()),
        Params::current(device::label()),
        Queue::new(dir.clone()),
        LOG_FLUSH_DELAY,
    ));
    app.manage(Arc::clone(&reporter));
    app.manage(AsrBackendNote::default());
    let files = RunFiles::new(dir);
    app.manage(files.clone());
    marker::install_panic_dump(files.clone());
    let now = unix_now();
    let previous = files.begin_run(
        now,
        marker::boot_time_secs(now),
        &app.package_info().version.to_string(),
    );
    report_previous_run(&reporter, previous, now);
    spawn_sender(reporter);
    Ok(())
}

/// Sự kiện `crash` của lần chạy trước, nếu có: panic (vị trí và câu panic từ `panic.json`) hay thoát không bình thường.
fn crash_event(previous: PreviousRun, now: i64) -> Option<Event> {
    match previous {
        PreviousRun::Panicked { at, location, message } => Some(Event {
            kind: Kind::Crash,
            code: Some("panic".to_string()),
            location,
            message,
            at,
        }),
        PreviousRun::Unclean { .. } => Some(Event {
            kind: Kind::Crash,
            code: Some("unclean_exit".to_string()),
            location: "unclean".to_string(),
            message: "app thoát không bình thường ở lần chạy trước".to_string(),
            at: now,
        }),
        PreviousRun::Clean | PreviousRun::RebootedSince => None,
    }
}

/// Báo `crash` của lần chạy trước trên luồng nền (đọc log và che mất cỡ chục mili giây, không làm chậm lúc khởi động).
fn report_previous_run(reporter: &Arc<Reporter>, previous: PreviousRun, now: i64) {
    let Some(event) = crash_event(previous, now) else {
        return;
    };
    let reporter = Arc::clone(reporter);
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

/// Luồng gửi nền: đợi `FIRST_SEND_DELAY_SECS` rồi kiểm hàng đợi mỗi `FLUSH_EVERY_SECS`. Lõi chỉ gửi khi tự động bật và app rảnh.
fn spawn_sender(reporter: Arc<Reporter>) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(FIRST_SEND_DELAY_SECS));
        loop {
            reporter.flush();
            std::thread::sleep(Duration::from_secs(FLUSH_EVERY_SECS));
        }
    });
}

fn reporter_of<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<Reporter>> {
    app.try_state::<Arc<Reporter>>().map(|r| Arc::clone(&r))
}

/// Phiên dịch dừng hay không bắt đầu được vì lỗi `code` (`session.rs`). Chỉ mã lỗi của chính app (`REPORTED_CODES`) và khi
/// tự động bật mới tạo luồng dựng báo cáo.
pub fn on_session_error<R: Runtime>(app: &AppHandle<R>, code: &str, message: &str) {
    if !is_reported(code) {
        return;
    }
    let Some(reporter) = reporter_of(app) else {
        return;
    };
    if !reporter.auto_enabled() {
        return;
    }
    let event = Event {
        kind: Kind::SessionError,
        code: Some(code.to_string()),
        location: String::new(),
        message: message.to_string(),
        at: unix_now(),
    };
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

fn which_code(which: Which) -> &'static str {
    match which {
        Which::Asr => "asr",
        Which::Llama => "llama",
    }
}

/// Tiến trình phụ chết và được giám sát khởi động lại (`SidecarEvent::Restarting`). `failures` là số lần lỗi đang tính trong cửa
/// sổ 10 phút: 0 là lần đầu chạy quá giờ chờ (không phải một lần chết), không báo.
pub fn on_sidecar_died<R: Runtime>(app: &AppHandle<R>, which: Which, failures: usize, reason: &str) {
    if failures == 0 {
        return;
    }
    let Some(reporter) = reporter_of(app) else {
        return;
    };
    if !reporter.auto_enabled() {
        return;
    }
    let code = which_code(which);
    let event = Event {
        kind: Kind::SidecarDied,
        code: Some(code.to_string()),
        location: code.to_string(),
        message: reason.to_string(),
        at: unix_now(),
    };
    std::thread::spawn(move || {
        reporter.record(event);
    });
}

/// App thoát bình thường (`RunEvent::Exit`): xóa dấu "đang chạy". Phải làm trước mọi việc có thể thoát tiến trình ngay
/// (`updater::install_on_exit` trên Windows).
pub fn mark_clean_exit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(files) = app.try_state::<RunFiles>() {
        files.end_run();
    }
}

/// Người dùng tắt báo cáo lỗi tự động (`actions::commit_settings`): bỏ các báo cáo đang chờ gửi.
pub fn purge_queue<R: Runtime>(app: &AppHandle<R>) {
    if let Some(reporter) = reporter_of(app) {
        reporter.purge();
    }
}

/// Kết quả của lệnh `send_log_report`: mã báo cáo để người dùng đọc cho bộ phận hỗ trợ.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ReportSent {
    pub id: String,
}

/// Mã lỗi giao diện cho một lỗi gửi tay.
fn manual_error(e: &ManualError) -> CommandError {
    let code = match e {
        ManualError::Send(SendError::RateLimited(_)) => errors::REPORT_RATE_LIMITED,
        ManualError::Send(SendError::Transient(_)) | ManualError::NoFacts => errors::REPORT_FAILED,
        ManualError::Send(SendError::Rejected { .. }) | ManualError::Build(_) => errors::REPORT_REJECTED,
    };
    CommandError::new(code, None, e.to_string())
}

/// Lệnh `send_log_report`: dựng và gửi một báo cáo ngay, kể cả khi tắt tự động và khi đang dịch (người dùng vừa bấm). Đọc log,
/// che và gửi mất vài giây: gọi từ luồng của `spawn_blocking`.
pub fn send_manual<R: Runtime>(app: &AppHandle<R>) -> Result<ReportSent, CommandError> {
    let reporter =
        reporter_of(app).ok_or_else(|| CommandError::new(errors::REPORT_FAILED, None, "chưa cài báo cáo lỗi"))?;
    reporter
        .send_manual()
        .map(|id| ReportSent { id })
        .map_err(|e| manual_error(&e))
}

/// Dựng `Reporter` cho app giả của test: máy thật (mã máy, RAM, chip) nhưng log và máy chủ do test đưa vào, và cho phép gửi tự
/// động dù đang là bản debug.
#[cfg(test)]
pub fn reporter_for_tests<R: Runtime>(
    app: &AppHandle<R>,
    logs: Box<dyn logs::LogSource>,
    api: Box<dyn send::ReportApi>,
    dir: std::path::PathBuf,
) -> Arc<Reporter> {
    Arc::new(Reporter::new(
        Box::new(AppHost::new(app.clone(), true)),
        logs,
        api,
        Params::default(),
        Queue::new(dir),
        Duration::ZERO,
    ))
}
```

- [ ] **Step 5: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib diagnostics:: 2>&1 | tail -15
```
Expected: `test result: ok. 78 passed; 0 failed`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib license:: 2>&1 | tail -4
```
Expected: `test result: ok.`, 0 failed (test của `license::manager` giờ dùng logger chung, kết quả không đổi).

- [ ] **Step 6: fmt, clippy, kiểm code Windows, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ./scripts/check-windows.sh --locked 2>&1 | tail -5
```
Expected: kết thúc không lỗi.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/diagnostics src-tauri/src/test_support.rs src-tauri/src/license/manager.rs && git commit -m "feat(app): phần ghép báo cáo lỗi với app, phân loại mã lỗi gửi hay không gửi" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Nối vào app (`lib.rs`, `session.rs`, `actions.rs`, `commands.rs`) và test đầu-cuối

**Files:**
- Modify: `src-tauri/src/lib.rs`, `src-tauri/src/actions.rs`, `src-tauri/src/session.rs`
- Modify: `src-tauri/src/commands.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/main.json`
- Modify (test): `src-tauri/src/app_tests.rs`, `src-tauri/src/acl_tests.rs`, `src-tauri/src/session.rs`

Mỗi điểm nối chỉ vài dòng:
- `lib.rs`: `diagnostics::install` sau `session::spawn_ticker`; `diagnostics::mark_clean_exit` là dòng **đầu** của `on_exit`.
- `session.rs`: `on_session_error` ở ba chỗ phiên dừng hay không bắt đầu được vì lỗi; `on_sidecar_died` khi nhận `SidecarEvent::Restarting`; `note_asr_backend` khi `asr-worker` sẵn sàng (nhớ backend GPU thật cho báo cáo).
- `actions.rs`: tắt `sendErrorReports` thì `purge_queue` (spec §5: tắt là xóa báo cáo đang chờ).
- `commands.rs`: lệnh `send_log_report` (`async`, chạy việc ở `spawn_blocking` vì đọc log, che và gửi mất vài giây), thêm vào `MAIN_COMMANDS` (chỉ cửa sổ chính được gọi; thanh phụ đề thì không), `build.rs` (quyền `allow-send-log-report`) và `capabilities/main.json`.

- [ ] **Step 1: Viết test trước (đỏ)**

Thêm vào **cuối** `src-tauri/src/app_tests.rs` (năm test đầu-cuối trên app giả: lỗi phiên của app xếp hàng đúng một báo cáo **không chứa chữ chép lời hay bản dịch** (đọc log thật, tìm câu nói giả lập); lỗi không phải lỗi của app và công tắc tắt thì không gửi gì; không gửi khi đang dịch; lệnh gửi tay gửi ngay và báo ba mã lỗi; tắt cài đặt thì xóa hàng đợi):

Trong `src-tauri/src/app_tests.rs`, ngay sau đoạn này (duy nhất trong file):

```rust
        }
        session::stop(app.handle());
    }
```

thêm nguyên văn:

```rust
}

// ---- Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §1, §2, §5) ----

mod reports {
    use super::*;
    use crate::capture::CaptureEvent;
    use crate::diagnostics::report::{Event, Kind};
    use crate::diagnostics::send::SendError;
    use crate::test_support::{enable_error_reports, install_reports};

    fn unix_now() -> i64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |d| d.as_secs() as i64)
    }

    fn sidecar_event() -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some(errors::SIDECAR_FAILED.into()),
            location: String::new(),
            message: "tiến trình phụ không khởi động được".into(),
            at: unix_now(),
        }
    }

    /// Lỗi của chính app làm phiên dừng: báo cáo vào hàng đợi, và không có chữ chép lời hay bản dịch nào của phiên trong đó,
    /// dù phiên vừa dịch xong một câu (spec §2: log không bao giờ chứa nội dung cuộc họp).
    #[test]
    fn a_session_error_of_the_app_queues_one_report_that_holds_no_transcript() {
        let deps = FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        };
        let events = deps.capture_events.clone();
        let app = mock_app_with(deps);
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        let upserts = record(&app, SUBTITLE_UPSERT);
        invoke(&main, "toggle_session", json!({})).unwrap();
        wait_until("một phụ đề dịch xong", || {
            upserts.lock().unwrap().iter().any(|s| s["status"] == "done")
        });
        let failing = events.lock().unwrap().remove(0);
        failing(CaptureEvent::Failed {
            code: errors::CAPTURE_FAILED,
            message: "không mở được nguồn âm thanh".into(),
        });
        wait_until("báo cáo vào hàng đợi", || rig.reporter.pending_count() == 1);

        let report = rig.reporter.pending_reports().remove(0);
        let v: Value = serde_json::from_str(&report).unwrap();
        assert_eq!(
            (v["kind"].as_str(), v["code"].as_str()),
            (Some("session_error"), Some(errors::CAPTURE_FAILED))
        );
        for secret in ["Hello everyone", "Xin chào", "mọi người"] {
            assert!(!report.contains(secret), "báo cáo lộ \"{secret}\":\n{report}");
        }
        // Báo cáo dựng từ log thật của phiên, không rỗng: phiên vừa ghi dòng bắt đầu.
        let app_log = v["logs"]["app"].as_str().unwrap();
        assert!(app_log.contains("bắt đầu phiên dịch"), "{app_log}");
        assert!(app_log.contains("phiên dịch dừng vì lỗi captureFailed"), "{app_log}");
    }

    /// Lỗi do môi trường hay người dùng (quyền ghi âm), và lỗi khi tắt báo cáo tự động: không gửi gì, không tạo luồng nào.
    #[test]
    fn errors_that_are_not_the_apps_fault_and_the_off_switch_send_nothing() {
        let permission = FakeDeps {
            capture_error: Some(errors::AUDIO_PERMISSION),
            ..FakeDeps::default()
        };
        let capture = FakeDeps {
            capture_error: Some(errors::CAPTURE_FAILED),
            ..FakeDeps::default()
        };
        for (deps, enabled) in [(permission, true), (capture, false)] {
            let app = mock_app_with(deps);
            let rig = install_reports(&app);
            if enabled {
                enable_error_reports(&app);
            }
            let main = window(&app, "main");
            invoke(&main, "toggle_session", json!({})).unwrap();
            let state = app.state::<AppState>();
            wait_until("phiên dừng vì lỗi", || {
                state.status().session == SessionStatus::Error
            });
            assert_eq!(rig.reporter.pending_count(), 0);
            assert_eq!(rig.reporter.flush(), 0);
            assert!(rig.api.bodies.lock().unwrap().is_empty());
        }
    }

    /// Không bao giờ gửi lúc đang bắt đầu hay đang dịch (A7); dừng phiên xong thì gửi.
    #[test]
    fn no_report_is_sent_while_a_session_runs() {
        let app = mock_app_with(FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        });
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        rig.reporter.record(sidecar_event()).expect("xếp hàng một báo cáo");
        assert_eq!(
            invoke(&main, "toggle_session", json!({})).unwrap()["session"],
            "running"
        );
        assert_eq!(rig.reporter.flush(), 0);
        assert!(rig.api.bodies.lock().unwrap().is_empty(), "không gửi gì lúc đang dịch");
        assert_eq!(invoke(&main, "toggle_session", json!({})).unwrap()["session"], "idle");
        assert_eq!(rig.reporter.flush(), 1);
        assert_eq!(rig.api.bodies.lock().unwrap().len(), 1);
    }

    /// Nút "Gửi log cho hỗ trợ": gửi ngay, kể cả khi tắt tự động và đang dịch; trả mã báo cáo; lỗi có đúng ba mã.
    #[test]
    fn the_manual_command_sends_at_once_and_reports_its_errors_with_three_codes() {
        let app = mock_app_with(FakeDeps {
            audio: FakeAudio::Tone,
            ..FakeDeps::default()
        });
        let rig = install_reports(&app);
        let main = window(&app, "main");
        invoke(&main, "toggle_session", json!({})).unwrap();
        let sent = invoke(&main, "send_log_report", json!({})).unwrap();
        let id = sent["id"].as_str().unwrap();
        assert!(id.starts_with("R-") && id.len() == 11, "{id}");
        let bodies = rig.api.bodies.lock().unwrap().clone();
        assert_eq!(bodies.len(), 1);
        let v: Value = serde_json::from_str(&bodies[0]).unwrap();
        assert_eq!((v["id"].as_str(), v["kind"].as_str()), (Some(id), Some("manual")));
        assert_eq!(rig.reporter.pending_count(), 0, "gửi tay không vào hàng đợi");

        *rig.api.script.lock().unwrap() = vec![
            Err(SendError::RateLimited(Some(3600))),
            Err(SendError::Transient("mạng rớt".into())),
            Err(SendError::Rejected {
                status: 422,
                code: "rejected_sensitive".into(),
            }),
        ];
        for code in [
            errors::REPORT_RATE_LIMITED,
            errors::REPORT_FAILED,
            errors::REPORT_REJECTED,
        ] {
            let result = invoke(&main, "send_log_report", json!({}));
            assert!(
                matches!(&result, Err(message) if message.contains(code)),
                "{code}: {result:?}"
            );
        }
    }

    /// Tắt báo cáo lỗi tự động ở Cài đặt: các báo cáo đang chờ bị bỏ.
    #[test]
    fn turning_the_setting_off_drops_the_waiting_reports() {
        let app = mock_app();
        let rig = install_reports(&app);
        enable_error_reports(&app);
        let main = window(&app, "main");
        rig.reporter.record(sidecar_event()).expect("xếp hàng");
        assert_eq!(rig.reporter.pending_count(), 1);
        invoke(
            &main,
            "update_settings",
            json!({ "patch": { "sendErrorReports": true } }),
        )
        .unwrap();
        assert_eq!(rig.reporter.pending_count(), 1, "vẫn bật thì giữ");
        invoke(
            &main,
            "update_settings",
            json!({ "patch": { "sendErrorReports": false } }),
        )
        .unwrap();
        assert_eq!(rig.reporter.pending_count(), 0);
        assert_eq!(rig.reporter.flush(), 0);
    }
```

Thêm vào **cuối** `src-tauri/src/acl_tests.rs` (chỉ cửa sổ chính được gửi báo cáo):

Trong `src-tauri/src/acl_tests.rs`, ngay sau đoạn này (duy nhất trong file):

```rust
    assert_eq!(system_calls(&app), expected);
```

thêm nguyên văn:

```rust
}

/// Spec 2026-10-17 §5: nút "Gửi log cho hỗ trợ" chỉ cửa sổ chính gọi được. Lệnh bị chặn không tới máy chủ báo cáo; lệnh được phép
/// tới đúng bản giả của máy chủ (không ra mạng thật).
#[test]
fn only_the_main_window_can_send_a_log_report() {
    let app = mock_app();
    let rig = crate::test_support::install_reports(&app);
    let main = window(&app, "main");
    for other in [window(&app, "overlay"), window(&app, "stranger")] {
        let result = invoke(&other, "send_log_report", json!({}));
        assert!(
            denied(&result),
            "{} không được gọi send_log_report: {result:?}",
            other.label()
        );
    }
    assert!(
        rig.api.bodies.lock().unwrap().is_empty(),
        "lệnh bị chặn không tới máy chủ báo cáo"
    );
    let result = invoke(&main, "send_log_report", json!({}));
    assert!(!denied(&result), "main gọi được: {result:?}");
    assert_eq!(rig.api.bodies.lock().unwrap().len(), 1);
```

Trong `src-tauri/src/session.rs`, thêm vào khối `mod tests` (test `Restarting` báo `sidecar_died` và `Ready` nhớ backend):

Trong `src-tauri/src/session.rs`, ngay sau đoạn này (duy nhất trong file):

```rust
        events.on_event(&ready(Which::Llama));
        assert_eq!(state.status().loading, Some(Loading::Model), "asr-worker vẫn đang nạp");
        events.on_event(&ready(Which::Asr));
        assert_eq!(state.status().loading, None);
```

thêm nguyên văn:

```rust
    }

    /// Spec 2026-10-17 §1: tiến trình phụ chết rồi được khởi động lại thì báo cáo `sidecar_died`; lần đầu chạy quá giờ chờ
    /// (`failures` 0, không phải một lần chết) thì không. `asr-worker` sẵn sàng thì nhớ backend thật cho báo cáo.
    #[test]
    fn a_sidecar_restart_is_reported_and_the_asr_backend_is_remembered() {
        use serde_json::Value;
        let app = crate::test_support::mock_app();
        let rig = crate::test_support::install_reports(&app);
        crate::test_support::enable_error_reports(&app);
        let events = status_events(&app);
        events.on_event(&SidecarEvent::Restarting {
            which: Which::Asr,
            failures: 0,
            after_ms: 100,
            reason: "lần đầu chạy quá thời gian chờ, không tính là lỗi".into(),
        });
        assert_eq!(
            rig.reporter.pending_count(),
            0,
            "lần đầu chạy quá giờ chờ không phải một lần chết"
        );
        events.on_event(&SidecarEvent::Ready {
            which: Which::Asr,
            use_gpu: true,
            backend: Some(asr_protocol::Backend::Metal),
            first_run: false,
        });
        events.on_event(&SidecarEvent::Restarting {
            which: Which::Llama,
            failures: 1,
            after_ms: 100,
            reason: "llama-server thoát: mã 1".into(),
        });
        let started = Instant::now();
        while rig.reporter.pending_count() == 0 {
            assert!(
                started.elapsed() < Duration::from_secs(10),
                "chờ quá lâu: báo cáo sidecar_died"
            );
            std::thread::sleep(Duration::from_millis(20));
        }
        let report: Value = serde_json::from_str(&rig.reporter.pending_reports()[0]).unwrap();
        assert_eq!(
            (report["kind"].as_str(), report["code"].as_str()),
            (Some("sidecar_died"), Some("llama"))
        );
        assert_eq!(report["hw"]["gpu_backend"], "metal");
        assert_eq!(report["message"], "llama-server thoát: mã 1");
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib reports:: 2>&1 | tail -15
```
Expected: FAIL ở đúng ba test: `a_session_error_of_the_app_queues_one_report_that_holds_no_transcript` (hết 10 giây chờ báo cáo vì `session.rs` chưa gọi `on_session_error`), `the_manual_command_sends_at_once_and_reports_its_errors_with_three_codes` (lệnh `send_log_report` chưa đăng ký) và `turning_the_setting_off_drops_the_waiting_reports` (`actions.rs` chưa xóa hàng đợi). Hai test còn lại khẳng định "không gửi gì" nên đã xanh: chưa có đường nào gửi.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib a_sidecar_restart_is_reported 2>&1 | tail -15
```
Expected: FAIL (hết 10 giây chờ báo cáo: `pending_count` vẫn 0 sau `Restarting { failures: 1 }`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib only_the_main_window_can_send_a_log_report 2>&1 | tail -15
```
Expected: FAIL (lệnh chưa đăng ký nên cửa sổ chính không gửi được báo cáo).

- [ ] **Step 3: Nối dây**

Lệnh và quyền (`commands.rs`, `build.rs`, `capabilities/main.json`):

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
    crate::updater::restart_to_update(&app, |app| app.request_restart())
}
```

và thay bằng:

```rust
    crate::updater::restart_to_update(&app, |app| app.request_restart())
}

/// Nút "Gửi log cho hỗ trợ" ở Giới thiệu (spec 2026-10-17 §1, §5): dựng và gửi một báo cáo lỗi ngay, kể cả khi tắt báo cáo tự
/// động. Đọc log, che dữ liệu và gửi mất vài giây, nên lệnh `async` chạy việc trên luồng của `spawn_blocking`. Trả mã báo cáo
/// để người dùng đọc cho bộ phận hỗ trợ; lỗi có mã `reportFailed`, `reportRateLimited` hay `reportRejected`.
#[tauri::command]
pub async fn send_log_report<R: Runtime>(app: AppHandle<R>) -> Result<crate::diagnostics::ReportSent, CommandError> {
    blocking(app, crate::diagnostics::send_manual).await
}
```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
    "restart_to_update",
];
```

và thay bằng:

```rust
    "restart_to_update",
    "send_log_report",
];
```

Trong `src-tauri/src/commands.rs`, tìm đoạn (duy nhất trong file):

```rust
        restart_to_update,
        get_overlay_view,
        hide_overlay,
```

và thay bằng:

```rust
        restart_to_update,
        send_log_report,
        get_overlay_view,
        hide_overlay,
```

Trong `src-tauri/build.rs`, tìm đoạn (duy nhất trong file):

```rust
                "restart_to_update",
                "get_overlay_view",
                "hide_overlay",
```

và thay bằng:

```rust
                "restart_to_update",
                "send_log_report",
                "get_overlay_view",
                "hide_overlay",
```

Trong `src-tauri/capabilities/main.json`, tìm đoạn (duy nhất trong file):

```json
    "allow-restart-to-update",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
```

và thay bằng:

```json
    "allow-restart-to-update",
    "allow-send-log-report",
    "core:event:allow-listen",
    "core:event:allow-unlisten",
```

`session.rs` (ba điểm báo lỗi phiên, `sidecar_died`, nhớ backend GPU):

Trong `src-tauri/src/session.rs`, tìm đoạn (duy nhất trong file):

```rust
        log::error!("không bắt đầu được phiên: {} ({})", e.code, e.message);
        start_failed(app, attempt, &e.code);
        return Err(e);
```

và thay bằng:

```rust
        log::error!("không bắt đầu được phiên: {} ({})", e.code, e.message);
        crate::diagnostics::on_session_error(app, &e.code, &e.message);
        start_failed(app, attempt, &e.code);
        return Err(e);
```

Trong `src-tauri/src/session.rs`, tìm đoạn (duy nhất trong file):

```rust
            log::error!("không chạy được pipeline: {}", e.message);
            start_failed(app, attempt, &e.code);
            return Err(e);
```

và thay bằng:

```rust
            log::error!("không chạy được pipeline: {}", e.message);
            crate::diagnostics::on_session_error(app, &e.code, &e.message);
            start_failed(app, attempt, &e.code);
            return Err(e);
```

Trong `src-tauri/src/session.rs`, tìm đoạn (duy nhất trong file):

```rust
    log::error!("phiên dịch dừng vì lỗi {code}: {message}");
    check_broken_model(app, code);
    app.state::<AppState>().update_status(|s| {
```

và thay bằng:

```rust
    log::error!("phiên dịch dừng vì lỗi {code}: {message}");
    crate::diagnostics::on_session_error(app, code, message);
    check_broken_model(app, code);
    app.state::<AppState>().update_status(|s| {
```

Trong `src-tauri/src/session.rs`, tìm đoạn (duy nhất trong file):

```rust
                    self.set_cpu(*which, !*use_gpu);
                    // `asr-worker` chạy bằng CPU: máy chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5).
                    if *which == Which::Asr && matches!(backend, Some(b) if !b.is_gpu()) {
```

và thay bằng:

```rust
                    self.set_cpu(*which, !*use_gpu);
                    // Backend thật của `asr-worker` cho báo cáo lỗi (spec 2026-10-17 §2).
                    if *which == Which::Asr {
                        crate::diagnostics::note_asr_backend(&self.app, *backend);
                    }
                    // `asr-worker` chạy bằng CPU: máy chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5).
                    if *which == Which::Asr && matches!(backend, Some(b) if !b.is_gpu()) {
```

Trong `src-tauri/src/session.rs`, tìm đoạn (duy nhất trong file):

```rust
            SidecarEvent::Restarting { .. } | SidecarEvent::Stopped { .. } => return,
```

và thay bằng:

```rust
            // Tiến trình phụ chết rồi được khởi động lại: báo cáo `sidecar_died` (spec 2026-10-17 §1). Không đổi trạng thái hiện.
            SidecarEvent::Restarting {
                which,
                failures,
                reason,
                ..
            } => {
                crate::diagnostics::on_sidecar_died(&self.app, *which, *failures, reason);
                return;
            }
            SidecarEvent::Stopped { .. } => return,
```

`actions.rs` (tắt cài đặt thì xóa hàng đợi):

Trong `src-tauri/src/actions.rs`, tìm đoạn (duy nhất trong file):

```rust
use crate::{events, hotkey_registry, login_item, overlay, session, system, tray, updater, window};
```

và thay bằng:

```rust
use crate::{diagnostics, events, hotkey_registry, login_item, overlay, session, system, tray, updater, window};
```

Trong `src-tauri/src/actions.rs`, tìm đoạn (duy nhất trong file):

```rust
        session::set_streaming_enabled(app, next.translate_while_speaking);
    }
    next
```

và thay bằng:

```rust
        session::set_streaming_enabled(app, next.translate_while_speaking);
    }
    // Tắt báo cáo lỗi tự động: bỏ các báo cáo đang chờ gửi (spec 2026-10-17 §5).
    if previous.send_error_reports && !next.send_error_reports {
        diagnostics::purge_queue(app);
    }
    next
```

`lib.rs` (cài lúc khởi động, đánh dấu thoát bình thường):

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất trong file):

```rust
    session::spawn_ticker(&handle);

    #[cfg(target_os = "macos")]
```

và thay bằng:

```rust
    session::spawn_ticker(&handle);
    // Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17): phân loại lần chạy trước, cài panic hook và luồng gửi nền.
    diagnostics::install(&handle)?;

    #[cfg(target_os = "macos")]
```

Trong `src-tauri/src/lib.rs`, tìm đoạn (duy nhất trong file):

```rust
pub(crate) fn on_exit<R: tauri::Runtime>(app: &AppHandle<R>, kill_all: fn()) {
    kill_all();
    session::save_on_exit(app);
```

và thay bằng:

```rust
pub(crate) fn on_exit<R: tauri::Runtime>(app: &AppHandle<R>, kill_all: fn()) {
    // Đầu tiên: xóa dấu "đang chạy" để lần mở sau không báo crash. Trên Windows `updater::install_on_exit` có thể thoát tiến trình
    // ngay (bộ cài), nên không được để sau nó.
    diagnostics::mark_clean_exit(app);
    kill_all();
    session::save_on_exit(app);
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib reports:: 2>&1 | tail -15
```
Expected: `test result: ok. 5 passed; 0 failed`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib 2>&1 | tail -5
```
Expected: `test result: ok.`, 0 failed; số `passed` là **N0 + 87** (68 của Task 1–8, 10 của Task 11, 2 của Task 10, 5 + 1 + 1 của task này), 4 `ignored` như mốc.

- [ ] **Step 5: fmt, clippy, kiểm code Windows, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all
```
```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -5
```
Expected: kết thúc không cảnh báo (`Finished`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ./scripts/check-windows.sh --locked 2>&1 | tail -5
```
Expected: kết thúc không lỗi.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add src-tauri/src/lib.rs src-tauri/src/actions.rs src-tauri/src/session.rs src-tauri/src/commands.rs src-tauri/build.rs src-tauri/capabilities/main.json src-tauri/src/app_tests.rs src-tauri/src/acl_tests.rs && git commit -m "feat(app): nối báo cáo lỗi vào app, lệnh send_log_report và test đầu-cuối" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Công tắc dev `AI_TRANSLATOR_DEV_REPORTS` và CI

**Files:**
- Modify (test): `scripts/dev-env.test.mjs`, `scripts/run-dev-app.test.mjs`, `scripts/release/release-check.test.mjs`, `scripts/release/dev-gate-markers.test.mjs`
- Modify: `scripts/read-dev-env.sh`, `scripts/run-dev-app.sh`, `scripts/release/release-check.mjs`, `.env.example`, `docs/release/phat-hanh.md`, `.github/workflows/ci.yml`

Bản debug nối thẳng production, nên một bản dev tự gửi báo cáo sẽ làm bẩn số liệu thật: mặc định **không** tự gửi. Chủ dự án muốn thử thì đặt `AI_TRANSLATOR_DEV_REPORTS=true` trong `.env` (chỉ `.env`: `run-dev-app.sh` `unset` biến này khỏi môi trường của chính nó trước khi đọc `.env`, nên đặt trong shell không tới được app), rồi bật cài đặt ở Quyền riêng tư. Bản phát hành không có mã đọc biến này và không có cả chuỗi tên biến: `release-check.mjs no-dev-gate` (chạy trong `package-macos.sh` và `package-windows.mjs`) làm job phát hành đỏ nếu chuỗi lọt vào binary.

- [ ] **Step 1: Viết test trước (đỏ)**


Bốn file test:

Trong `scripts/dev-env.test.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
  const r = read(t, "AI_TRANSLATOR_DEV_PRO_X=true\nAI_TRANSLATOR_DEV=true\nXAI_TRANSLATOR_DEV_PRO=true\n");
  assert.equal(r.out, "");
```

thêm nguyên văn:

```js
});

// Công tắc tự gửi báo cáo lỗi của bản dev (spec 2026-10-17).
test("nhận AI_TRANSLATOR_DEV_REPORTS cùng AI_TRANSLATOR_DEV_PRO, bỏ khóa khác", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_PRO=false\nSECRET=x\nAI_TRANSLATOR_DEV_REPORTS=true\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_PRO=false\nAI_TRANSLATOR_DEV_REPORTS=true\n");
  assert.match(r.err, /bỏ qua khóa \.env không được phép: SECRET/);
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=true\n").err, "");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=false\n").err, "");
});

test("giá trị lạ của AI_TRANSLATOR_DEV_REPORTS vẫn được chuyển nguyên văn nhưng có cảnh báo (không in giá trị)", (t) => {
  for (const value of ['"true"', "1", "TRUE", "true ", ""]) {
    const r = read(t, `AI_TRANSLATOR_DEV_REPORTS=${value}\n`);
    assert.equal(r.out, `AI_TRANSLATOR_DEV_REPORTS=${value}\n`);
    assert.match(r.err, /AI_TRANSLATOR_DEV_REPORTS có giá trị lạ/);
    assert.ok(!r.err.includes("TRUE"), "không in giá trị ra stderr");
  }
  // Lần cuối mới tính, như công tắc Pro.
  assert.equal(read(t, "AI_TRANSLATOR_DEV_REPORTS=1\nAI_TRANSLATOR_DEV_REPORTS=true\n").err, "");
});

test("khóa chỉ giống tên công tắc báo cáo lỗi (tiền tố, hậu tố, viết thường) không được nhận", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_REPORTS_X=true\nAI_TRANSLATOR_REPORTS=true\nai_translator_dev_reports=true\n");
  assert.equal(r.out, "");
```

Trong `scripts/run-dev-app.test.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
  assert.ok(unsetLine !== -1 && unsetLine < open, `unset ở dòng ${unsetLine + 1}, open -W ở dòng ${open + 1}`);
```

thêm nguyên văn:

```js
});

// Công tắc tự gửi báo cáo lỗi của bản dev (spec 2026-10-17): cùng cách với công tắc Pro, chỉ `.env` mới bật được.
const unsetReports = lineOf((l) => l.trim() === "unset AI_TRANSLATOR_DEV_REPORTS");

test("script có dòng `unset AI_TRANSLATOR_DEV_REPORTS`, đứng trước khi đọc `.env` và trước `open -W`", () => {
  assert.notEqual(unsetReports, -1);
  const readEnv = lineOf((l) => l.includes("read-dev-env.sh"));
  const open = lineOf((l) => /^\s*open -W\b/.test(l));
  assert.ok(unsetReports < readEnv, `unset ở dòng ${unsetReports + 1}, read-dev-env.sh ở dòng ${readEnv + 1}`);
  assert.ok(unsetReports < open, `unset ở dòng ${unsetReports + 1}, open -W ở dòng ${open + 1}`);
});

test("bật công tắc báo cáo lỗi trong `.env` thì script in biểu ngữ cảnh báo trước `open -W`", () => {
  const banner = lineOf((l) => l.includes("AI_TRANSLATOR_DEV_REPORTS=true. Bản này TỰ GỬI"));
  const open = lineOf((l) => /^\s*open -W\b/.test(l));
  assert.notEqual(banner, -1);
  assert.ok(banner < open);
```

Trong `scripts/release/release-check.test.mjs`, tìm đoạn (duy nhất trong file):

```js
  assert.equal(devGateErrors(Buffer.from("AI_TRANSLATOR_DEV_FREE")).length, 1, "tên biến cũ cũng bị chặn");
  assert.equal(devGateErrors(Buffer.from(DEV_GATE_MARKERS.join(" "))).length, DEV_GATE_MARKERS.length);
  // Windows có thể giữ chuỗi dạng UTF-16LE.
```

và thay bằng:

```js
  assert.equal(devGateErrors(Buffer.from("AI_TRANSLATOR_DEV_FREE")).length, 1, "tên biến cũ cũng bị chặn");
  assert.deepEqual(devGateErrors(Buffer.from("xx AI_TRANSLATOR_DEV_REPORTS yy")), [
    "file chạy của app còn mã dev: có chuỗi AI_TRANSLATOR_DEV_REPORTS",
  ]);
  assert.equal(devGateErrors(Buffer.from(DEV_GATE_MARKERS.join(" "))).length, DEV_GATE_MARKERS.length);
  // Windows có thể giữ chuỗi dạng UTF-16LE.
```

Trong `scripts/release/dev-gate-markers.test.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
  });
}
```

thêm nguyên văn:

```js

// Công tắc tự gửi báo cáo lỗi của dev (spec 2026-10-17): cùng cơ chế, hằng ở diagnostics/mod.rs.
test("DEV_GATE_MARKERS có giá trị của DEV_REPORTS_ENV trong diagnostics/mod.rs", () => {
  const diagnostics = readFileSync(fileURLToPath(new URL("../../src-tauri/src/diagnostics/mod.rs", import.meta.url)), "utf8");
  const m = diagnostics.match(/pub const DEV_REPORTS_ENV: &str = "([^"]*)";/);
  assert.ok(m, 'không tìm thấy `pub const DEV_REPORTS_ENV: &str = "...";` trong src-tauri/src/diagnostics/mod.rs');
  assert.ok(DEV_GATE_MARKERS.includes(m[1]), `DEV_REPORTS_ENV = "${m[1]}" chưa có trong DEV_GATE_MARKERS của release-check.mjs`);
});

test("hằng DEV_REPORTS_ENV chỉ có ở bản debug (đứng sau cfg(debug_assertions))", () => {
  const diagnostics = readFileSync(fileURLToPath(new URL("../../src-tauri/src/diagnostics/mod.rs", import.meta.url)), "utf8");
  const lines = diagnostics.split("\n");
  const at = lines.findIndex((l) => l.startsWith("pub const DEV_REPORTS_ENV"));
  assert.ok(at > 0, "không thấy hằng DEV_REPORTS_ENV");
  assert.equal(lines[at - 1].trim(), "#[cfg(debug_assertions)]", "hằng phải nằm ngay sau #[cfg(debug_assertions)]");
});
```

- [ ] **Step 2: Chạy, thấy test đỏ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail` lớn hơn 0 (script chưa nhận biến mới, `DEV_GATE_MARKERS` chưa có chuỗi).

- [ ] **Step 3: Cài đặt**

Trong `scripts/read-dev-env.sh`, tìm đoạn (duy nhất trong file):

```bash
# - AI_TRANSLATOR_DEV_PRO có giá trị không phải đúng `true`/`false` vẫn được chuyển nguyên văn, kèm cảnh báo ở stderr
#   (không in giá trị).
```

và thay bằng:

```bash
# - AI_TRANSLATOR_DEV_PRO và AI_TRANSLATOR_DEV_REPORTS (bản debug tự gửi báo cáo lỗi, spec 2026-10-17) có giá trị không phải
#   đúng `true`/`false` vẫn được chuyển nguyên văn, kèm cảnh báo ở stderr (không in giá trị).
```

Trong `scripts/read-dev-env.sh`, tìm đoạn (duy nhất trong file):

```bash
allowed="AI_TRANSLATOR_DEV_PRO"
```

và thay bằng:

```bash
allowed="AI_TRANSLATOR_DEV_PRO AI_TRANSLATOR_DEV_REPORTS"
```

Trong `scripts/read-dev-env.sh`, tìm đoạn (duy nhất trong file):

```bash
      echo 'AI_TRANSLATOR_DEV_PRO có giá trị lạ (chỉ đúng "true" mới bật Pro giả lập): coi như tắt' >&2
      ;;
  esac
fi
```

và thay bằng:

```bash
      echo 'AI_TRANSLATOR_DEV_PRO có giá trị lạ (chỉ đúng "true" mới bật Pro giả lập): coi như tắt' >&2
      ;;
  esac
  case "$nl$result$nl" in
    *"${nl}AI_TRANSLATOR_DEV_REPORTS=true$nl"* | *"${nl}AI_TRANSLATOR_DEV_REPORTS=false$nl"*) ;;
    *"${nl}AI_TRANSLATOR_DEV_REPORTS="*)
      echo 'AI_TRANSLATOR_DEV_REPORTS có giá trị lạ (chỉ đúng "true" mới bật tự gửi báo cáo lỗi): coi như tắt' >&2
      ;;
  esac
fi
```

Trong `scripts/run-dev-app.sh`, tìm đoạn (duy nhất trong file):

```bash
# `AI_TRANSLATOR_DEV_PRO` khỏi môi trường của chính nó ngay dưới đây; biến đặt trong shell không tới được app.
set -eu
unset AI_TRANSLATOR_DEV_PRO
```

và thay bằng:

```bash
# `AI_TRANSLATOR_DEV_PRO` khỏi môi trường của chính nó ngay dưới đây; biến đặt trong shell không tới được app.
# Công tắc tự gửi báo cáo lỗi của bản dev (`AI_TRANSLATOR_DEV_REPORTS`, spec 2026-10-17) cũng chỉ đặt trong `.env`, cùng cách.
set -eu
unset AI_TRANSLATOR_DEV_PRO
```

Trong `scripts/run-dev-app.sh`, tìm đoạn (duy nhất trong file):

```bash
unset AI_TRANSLATOR_DEV_PRO
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
```

và thay bằng:

```bash
unset AI_TRANSLATOR_DEV_PRO
unset AI_TRANSLATOR_DEV_REPORTS
identity="${MT_DEV_SIGN_IDENTITY:-AI Translator Dev}"
root=$(cd "$(dirname "$0")/.." && pwd)
```

Trong `scripts/run-dev-app.sh`, tìm đoạn (duy nhất trong file):

```bash
dev_pro=off
pairs=$(sh "$root/scripts/read-dev-env.sh" "$root/.env")
oldifs=$IFS
```

và thay bằng:

```bash
dev_pro=off
dev_reports=off
pairs=$(sh "$root/scripts/read-dev-env.sh" "$root/.env")
oldifs=$IFS
```

Trong `scripts/run-dev-app.sh`, tìm đoạn (duy nhất trong file):

```bash
  if [ "$pair" = "AI_TRANSLATOR_DEV_PRO=true" ]; then dev_pro=on; fi
done
set +f
```

và thay bằng:

```bash
  if [ "$pair" = "AI_TRANSLATOR_DEV_PRO=true" ]; then dev_pro=on; fi
  if [ "$pair" = "AI_TRANSLATOR_DEV_REPORTS=true" ]; then dev_reports=on; fi
done
set +f
```

Trong `scripts/run-dev-app.sh`, tìm đoạn (duy nhất trong file):

```bash
  echo "================================================================" >&2
fi
open -W "$@" "$app"
```

và thay bằng:

```bash
  echo "================================================================" >&2
fi
if [ "$dev_reports" = on ]; then
  echo "================================================================" >&2
  echo "CẢNH BÁO: AI_TRANSLATOR_DEV_REPORTS=true. Bản này TỰ GỬI báo cáo lỗi tới server production (khi bật ở Cài đặt)." >&2
  echo "Chỉ bật để thử tính năng báo cáo lỗi; xóa báo cáo thử ở Web Admin sau đó." >&2
  echo "================================================================" >&2
fi
open -W "$@" "$app"
```

Trong `scripts/release/release-check.mjs`, tìm đoạn (duy nhất trong file):

```js
/** Chuỗi chỉ có trong bản debug (công tắc Pro của dev, `src-tauri/src/pro.rs`): tên biến công tắc, tên biến cũ và chuỗi chim hoàng yến. */
export const DEV_GATE_MARKERS = ["AI_TRANSLATOR_DEV_PRO", "AI_TRANSLATOR_DEV_FREE", "mt-dev-pro-gate-v1"];
```

và thay bằng:

```js
/**
 * Chuỗi chỉ có trong bản debug: công tắc Pro của dev (`src-tauri/src/pro.rs`: tên biến công tắc, tên biến cũ, chuỗi chim hoàng yến)
 * và công tắc tự gửi báo cáo lỗi của dev (`src-tauri/src/diagnostics/mod.rs`, spec 2026-10-17).
 */
export const DEV_GATE_MARKERS = ["AI_TRANSLATOR_DEV_PRO", "AI_TRANSLATOR_DEV_FREE", "mt-dev-pro-gate-v1", "AI_TRANSLATOR_DEV_REPORTS"];
```

`.env.example` (khối mô tả công tắc, dưới dòng `AI_TRANSLATOR_DEV_PRO=false`):

Trong `.env.example`, tìm đoạn (duy nhất trong file):

```bash
AI_TRANSLATOR_DEV_PRO=false
```

và thay bằng:

```bash
AI_TRANSLATOR_DEV_PRO=false
#
# Công tắc BÁO CÁO LỖI TỰ ĐỘNG của BẢN DEV (spec 2026-10-17). Chỉ đúng `true` mới bật; mọi giá trị khác là tắt.
#   false (mặc định): bản debug không tự gửi báo cáo lỗi (bản dev nối production, sẽ làm bẩn số liệu thật).
#   true:  bản debug tự gửi báo cáo lỗi tới server production khi bật ở Cài đặt › Quyền riêng tư. Chỉ để thử tính năng này; xóa báo
#          cáo thử ở Web Admin (trang Báo cáo lỗi) sau đó. Nút "Gửi log cho hỗ trợ" ở Giới thiệu chạy ở mọi bản, không cần công tắc.
# Bản phát hành không có công tắc này (không có cả mã đọc nó).
AI_TRANSLATOR_DEV_REPORTS=false
```

`docs/release/phat-hanh.md` (danh sách chuỗi cổng `no-dev-gate`):

Trong `docs/release/phat-hanh.md`, tìm đoạn (duy nhất trong file):

```markdown
  no-dev-gate <file chạy của app>` trước khi ký (macOS: trước `codesign`; kiểm lại ở cả bước build và bước sign). File có chuỗi `AI_TRANSLATOR_DEV_PRO`, `AI_TRANSLATOR_DEV_FREE`
  hay `mt-dev-pro-gate-v1` thì job đỏ, không ký, không đăng (spec 2026-10-04, §3). Gặp lỗi này thì bản đang build là bản
```

và thay bằng:

```markdown
  no-dev-gate <file chạy của app>` trước khi ký (macOS: trước `codesign`; kiểm lại ở cả bước build và bước sign). File có chuỗi `AI_TRANSLATOR_DEV_PRO`, `AI_TRANSLATOR_DEV_FREE`,
  `mt-dev-pro-gate-v1` hay `AI_TRANSLATOR_DEV_REPORTS` (công tắc tự gửi báo cáo lỗi của bản dev, spec 2026-10-17) thì job đỏ, không ký, không đăng (spec 2026-10-04, §3). Gặp lỗi này thì bản đang build là bản
```

`.github/workflows/ci.yml`: CI chạy test bản quyền ở bản **release** để chắc phần chỉ dành cho debug không lọt vào; thêm test báo cáo lỗi vào cùng bước (test `only_a_debug_build_with_the_switch_on_sends_automatically` kiểm công tắc luôn tắt ở bản release). Tìm đoạn (duy nhất trong file):

```yaml
      - name: Test bản quyền ở bản release (không có phần chỉ dành cho bản debug)
        run: |
          cargo test --release --locked -p meeting-translator --lib -- pro:: license:: --test-threads=1
```

và thay bằng:

```yaml
      - name: Test bản quyền và báo cáo lỗi ở bản release (không có phần chỉ dành cho bản debug)
        run: |
          cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: --test-threads=1
```

- [ ] **Step 4: Chạy, thấy xanh**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: --test-threads=1 2>&1 | tail -4
```
Expected: `test result: ok.`, 0 failed (có 77 test của `diagnostics::` ở bản release, vì test `the_switch_is_on_only_for_the_exact_value_true` chỉ có ở debug, cùng các test `pro::` và `license::` đã có). Lần đầu build release của crate mất vài phút.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add scripts .env.example docs/release/phat-hanh.md .github/workflows/ci.yml && git commit -m "feat(app): công tắc dev AI_TRANSLATOR_DEV_REPORTS, chặn chuỗi trong bản phát hành" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Test Node nối hằng số giữa app và server

**Files:**
- Modify: `server/test/node/app-server-constants.test.mjs`

Server và app cùng nói một hợp đồng; lệch một con số là server trả `400` hay `413` cho mọi báo cáo của app, mà app thì lặng lẽ bỏ báo cáo (lỗi gửi tự động không hiện ra giao diện), nên chỉ một test đọc cả hai nguồn mới bắt được. File này đã làm đúng việc đó cho trang thanh toán và nhịp hỏi đơn; thêm tám test nữa: trần log (24/16/16 KiB) bằng `LOG_LIMITS`; trần báo cáo 64 KB nằm giữa tổng ba trần log và `MAX_BODY_BYTES`; `MAX_MESSAGE_CHARS` và `ZERO_FINGERPRINT`; bảng ký tự mã báo cáo bằng lớp ký tự của `REPORT_ID` và bằng `KEY_ALPHABET` của key bản quyền; các loại báo cáo bằng `REPORT_KINDS`; tên gói bằng `free` cộng `PLAN_CODES` và ngôn ngữ bằng `UI_LANGS`; giới hạn gửi của app (5 báo cáo/ngày, hàng đợi 5, 24 giờ, 3 lần, 10 giây) bằng số đã chốt và nằm trong hạn mức `LIMITS.diag_*` của server; cuối cùng một test cho chính các hàm đọc hằng.

Cần kế hoạch 01 **Task 3 và 4** xong (`server/src/error-reports.ts`, `LIMITS.diag_*` ở `ratelimit.ts`). Nếu chưa, test báo `không đọc được server/src/error-reports.ts`: làm các task đó trước, đừng sửa test cho qua.

- [ ] **Step 1: Thêm test**


Trong `server/test/node/app-server-constants.test.mjs`, ngay sau đoạn này (duy nhất trong file):

```js
    ["a.example", "b.example"],
  );
```

thêm nguyên văn:

```js
});

// ---------------------------------------------------------------------------------------------------------------------
// Báo cáo lỗi gửi về nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §1, §2, §3). App (Rust, src-tauri/src/
// diagnostics/) và server (TypeScript, server/src/error-reports.ts, ratelimit.ts) cùng nói một hợp đồng: trần log, trần báo cáo,
// bảng ký tự mã báo cáo, các loại báo cáo, gói bản quyền, ngôn ngữ giao diện, giới hạn tần suất. Lệch một chỗ là server trả 400
// hay 413 cho mọi báo cáo của app, và app thì lặng lẽ bỏ báo cáo (lỗi gửi tự động không hiện ra giao diện), nên chỉ test này bắt được.
// ---------------------------------------------------------------------------------------------------------------------

const DIAG_REPORT = "src-tauri/src/diagnostics/report.rs";
const DIAG_LOGS = "src-tauri/src/diagnostics/logs.rs";
const DIAG_QUEUE = "src-tauri/src/diagnostics/queue.rs";
const DIAG_MOD = "src-tauri/src/diagnostics/mod.rs";
const ERROR_REPORTS = "server/src/error-reports.ts";
const TOKEN = "server/src/token.ts";

/** Chuỗi `const NAME = "…";` của TypeScript (có hay không `export`). */
function tsString(text, name, file) {
  const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*"([^"]*)"\\s*;`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng chuỗi ${name}`);
  return m[1];
}

/** Chuỗi `const NAME: &str = "…";` của Rust. */
function rustString(text, name, file) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*:\\s*&(?:'static\\s+)?str\\s*=\\s*"([^"]*)"\\s*;`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy hằng chuỗi ${name}`);
  return m[1];
}

/** Giá trị số của một khóa trong `const NAME = { khóa: biểu thức, … }` của TypeScript. */
function tsObjectNumber(text, name, key, file) {
  const object = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*\\{([^}]*)\\}`, "m").exec(text);
  if (!object) throw new Error(`${file}: không thấy hằng đối tượng ${name}`);
  const entry = new RegExp(`\\b${key}\\s*:\\s*([\\d_\\s*+\\-()]+?)\\s*(?:,|$)`).exec(object[1]);
  if (!entry) throw new Error(`${file}: ${name} không có khóa ${key}`);
  return arithmetic(entry[1], `${file}: ${name}.${key}`);
}

/** Các chuỗi trong `const NAME = [ "a", "b" ]` của TypeScript (bỏ phần `...khác` và `as const`). */
function tsStrings(text, name, file) {
  const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy mảng ${name}`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

/** Các chuỗi trong `const NAME: [&str; N] = [ "a", "b" ];` của Rust. */
function rustStrings(text, name, file) {
  const m = new RegExp(`^\\s*(?:pub\\s+)?const\\s+${name}\\s*:\\s*\\[&str;\\s*\\d+\\]\\s*=\\s*\\[([^\\]]*)\\]`, "m").exec(text);
  if (!m) throw new Error(`${file}: không thấy mảng ${name}`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

/** Mọi chuỗi vế phải của các nhánh `Prefix::Biến => "chuỗi"` trong file Rust. */
function rustMatchStrings(text, prefix, file) {
  const found = [...text.matchAll(new RegExp(`${prefix}::\\w+\\s*=>\\s*"([^"]*)"`, "g"))].map((x) => x[1]);
  if (found.length === 0) throw new Error(`${file}: không thấy nhánh ${prefix}::… => "…"`);
  return found;
}

/** Các ký tự của một lớp regex dạng `[0-9A-HJKMNP-TV-Z]` (chỉ khoảng `a-b` và ký tự đơn). */
function classChars(cls) {
  const body = cls.replace(/^\[|\]$/g, "");
  const out = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i + 1] === "-" && i + 2 < body.length) {
      for (let c = body.charCodeAt(i); c <= body.charCodeAt(i + 2); c++) out.push(String.fromCharCode(c));
      i += 2;
    } else out.push(body[i]);
  }
  return out.sort().join("");
}

const sorted = (list) => [...list].sort();

test("trần từng log của app (24, 16, 16 KiB) bằng LOG_LIMITS của server", () => {
  const logs = source(DIAG_LOGS);
  const server = source(ERROR_REPORTS);
  for (const [rust, key] of [["APP_LOG_MAX_BYTES", "app"], ["ASR_LOG_MAX_BYTES", "asr"], ["LLAMA_LOG_MAX_BYTES", "llama"]]) {
    assert.equal(rustConst(logs, rust, DIAG_LOGS), tsObjectNumber(server, "LOG_LIMITS", key, ERROR_REPORTS), `${rust} lệch LOG_LIMITS.${key}`);
  }
  assert.equal(rustConst(logs, "APP_LOG_MAX_BYTES", DIAG_LOGS), 24 * 1024, "spec §2: 24 KiB cho app.log");
});

test("trần báo cáo của app nằm giữa tổng ba trần log và trần thân request của server", () => {
  const caps = ["APP_LOG_MAX_BYTES", "ASR_LOG_MAX_BYTES", "LLAMA_LOG_MAX_BYTES"].map((n) => rustConst(source(DIAG_LOGS), n, DIAG_LOGS));
  const report = rustConst(source(DIAG_REPORT), "MAX_REPORT_BYTES", DIAG_REPORT);
  const body = tsConst(source(ERROR_REPORTS), "MAX_BODY_BYTES", ERROR_REPORTS);
  assert.equal(report, 64 * 1024, "spec §2: báo cáo tối đa 64 KB");
  assert.ok(report > caps.reduce((a, b) => a + b, 0), "phải còn chỗ cho phần thông tin máy ngoài ba log");
  assert.ok(report <= body, `app gửi tới ${report} byte nhưng server chỉ nhận ${body}: báo cáo đầy log bị 413`);
});

test("câu lỗi tối đa và dấu vân tay của báo cáo gửi tay giống nhau ở app và server", () => {
  const rust = source(DIAG_REPORT);
  const server = source(ERROR_REPORTS);
  assert.equal(rustConst(rust, "MAX_MESSAGE_CHARS", DIAG_REPORT), tsConst(server, "MAX_MESSAGE_CHARS", ERROR_REPORTS));
  assert.equal(rustString(rust, "ZERO_FINGERPRINT", DIAG_REPORT), tsString(server, "ZERO_FINGERPRINT", ERROR_REPORTS));
});

test("bảng ký tự mã báo cáo của app (Crockford base32) bằng lớp ký tự của REPORT_ID và của key bản quyền ở server", () => {
  const alphabet = /ID_ALPHABET:\s*&\[u8;\s*32\]\s*=\s*b"([^"]+)"/.exec(source(DIAG_REPORT));
  assert.ok(alphabet, `${DIAG_REPORT}: không thấy ID_ALPHABET`);
  const id = /REPORT_ID\s*=\s*\/\^R-(\[[^\]]+\])\{4\}-(\[[^\]]+\])\{4\}\$\//.exec(source(ERROR_REPORTS));
  assert.ok(id, `${ERROR_REPORTS}: không thấy REPORT_ID dạng /^R-[…]{4}-[…]{4}$/`);
  assert.equal(classChars(id[1]), classChars(id[2]), "hai nhóm của mã báo cáo dùng cùng một lớp ký tự");
  assert.equal(classChars(id[1]), sorted(alphabet[1]).join(""), "app sinh ký tự ngoài lớp mà server nhận (hay ngược lại)");
  assert.equal(sorted(alphabet[1]).join(""), sorted(tsString(source("server/src/license-key.ts"), "KEY_ALPHABET", "server/src/license-key.ts")).join(""));
});

test("các loại báo cáo của app bằng REPORT_KINDS của server", () => {
  const rust = rustMatchStrings(source(DIAG_REPORT), "Kind", DIAG_REPORT);
  assert.deepEqual(sorted(rust), sorted(tsStrings(source(ERROR_REPORTS), "REPORT_KINDS", ERROR_REPORTS)));
});

test("tên gói app gửi là free cộng PLAN_CODES của server; ngôn ngữ giao diện app gửi bằng UI_LANGS của server", () => {
  const server = source(ERROR_REPORTS);
  assert.match(server, /REPORT_PLANS\s*=\s*\["free",\s*\.\.\.PLAN_CODES\]/, `${ERROR_REPORTS}: REPORT_PLANS không còn là ["free", ...PLAN_CODES]`);
  const paid = tsStrings(source(TOKEN), "PLAN_CODES", TOKEN);
  assert.deepEqual(sorted(rustStrings(source(DIAG_MOD), "PLAN_CODES", DIAG_MOD)), sorted(["free", ...paid]));
  assert.deepEqual(sorted(rustMatchStrings(source(DIAG_MOD), "UiLanguage", DIAG_MOD)), sorted(tsStrings(server, "UI_LANGS", ERROR_REPORTS)));
});

test("giới hạn gửi của app (spec §1) đúng số đã chốt và nằm trong hạn mức của server", () => {
  const queue = source(DIAG_QUEUE);
  const ratelimit = source(RATELIMIT);
  assert.equal(rustConst(queue, "MAX_PER_DAY", DIAG_QUEUE), 5, "tối đa 5 báo cáo mỗi ngày");
  assert.equal(rustConst(queue, "QUEUE_CAP", DIAG_QUEUE), 5, "hàng đợi tối đa 5");
  assert.equal(rustConst(queue, "PER_FINGERPRINT_SECONDS", DIAG_QUEUE), 24 * 3600, "1 báo cáo mỗi dấu vân tay mỗi 24 giờ");
  assert.equal(rustConst(queue, "MAX_ATTEMPTS", DIAG_QUEUE), 3, "thử lại tối đa 3 lần");
  assert.equal(rustConst(source(DIAG_MOD), "FIRST_SEND_DELAY_SECS", DIAG_MOD), 10, "gửi nền sau khi app chạy 10 giây");
  const limit = (name) => tsObjectNumber(ratelimit, "LIMITS", name, RATELIMIT);
  assert.equal(limit("diag_ip"), 30);
  assert.equal(limit("diag_device"), 3);
  assert.equal(limit("diag_global"), 120);
  // Một máy xếp hàng tối đa 5 mỗi ngày: không bao giờ làm chạm hạn mức theo IP hay toàn hệ thống của một giờ.
  assert.ok(rustConst(queue, "MAX_PER_DAY", DIAG_QUEUE) <= limit("diag_ip"));
  assert.ok(limit("diag_device") <= limit("diag_ip") && limit("diag_ip") <= limit("diag_global"));
});

test("hàm đọc hằng của báo cáo lỗi báo rõ khi không thấy, và hiểu đúng các dạng khai báo", () => {
  assert.equal(tsString('export const ZERO_FINGERPRINT = "0000";\n', "ZERO_FINGERPRINT", "x.ts"), "0000");
  assert.equal(rustString('pub const ZERO_FINGERPRINT: &str = "0000";\n', "ZERO_FINGERPRINT", "x.rs"), "0000");
  assert.equal(tsObjectNumber("export const LOG_LIMITS = { app: 24 * 1024, asr: 16 * 1024 } as const;", "LOG_LIMITS", "asr", "x.ts"), 16384);
  assert.equal(tsObjectNumber("export const LIMITS = {\n  diag_ip: 30,\n  diag_device: 3,\n} as const;", "LIMITS", "diag_device", "x.ts"), 3);
  assert.deepEqual(tsStrings('export const K = ["a", "b"] as const;', "K", "x.ts"), ["a", "b"]);
  assert.deepEqual(tsStrings('export const K = ["free", ...PLAN_CODES] as const;', "K", "x.ts"), ["free"]);
  assert.deepEqual(rustStrings('const P: [&str; 2] = ["a", "b"];', "P", "x.rs"), ["a", "b"]);
  assert.deepEqual(rustMatchStrings('Kind::A => "a",\n Kind::B => "b",', "Kind", "x.rs"), ["a", "b"]);
  assert.equal(classChars("[0-9A-C]"), "0123456789ABC");
  assert.throws(() => tsString("const X = 1;", "Y", "x.ts"), /x\.ts: không thấy hằng chuỗi Y/);
  assert.throws(() => rustString("const X: u8 = 1;", "Y", "x.rs"), /x\.rs: không thấy hằng chuỗi Y/);
  assert.throws(() => tsObjectNumber("export const O = { a: 1 };", "O", "b", "x.ts"), /không có khóa b/);
  assert.throws(() => tsStrings("const Z = 1;", "K", "x.ts"), /không thấy mảng K/);
  assert.throws(() => rustMatchStrings("nothing", "Kind", "x.rs"), /không thấy nhánh Kind/);
```

- [ ] **Step 2: Chạy**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server test:scripts 2>&1 | tail -12
```
Expected: `# fail 0`, tám test mới có tên bắt đầu bằng `trần từng log`, `trần báo cáo`, `câu lỗi tối đa`, `bảng ký tự mã báo cáo`, `các loại báo cáo`, `tên gói app gửi`, `giới hạn gửi của app`, `hàm đọc hằng của báo cáo lỗi` đều `ok`.

- [ ] **Step 3: Kiểm test thật sự bắt lệch (rồi hoàn lại)**

Đổi tạm hạn mức ngày của app từ 5 lên 6:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && sed -i '' 's/pub const MAX_PER_DAY: u32 = 5;/pub const MAX_PER_DAY: u32 = 6;/' src-tauri/src/diagnostics/queue.rs && git diff --stat
```

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server test:scripts 2>&1 | grep -E 'not ok|tối đa 5 báo cáo' | head -4
```
Expected: có dòng `not ok` của test `giới hạn gửi của app` kèm thông điệp `tối đa 5 báo cáo mỗi ngày`.

Hoàn lại:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git checkout -- src-tauri/src/diagnostics/queue.rs && git status --short
```
Expected: không còn dòng nào của `queue.rs`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server test:scripts 2>&1 | grep -E '^# (pass|fail)'
```
Expected: `# fail 0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git add server/test/node/app-server-constants.test.mjs && git commit -m "test(app,server): nối hằng số báo cáo lỗi giữa app và server" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Kiểm tra toàn bộ và hoàn tất

**Files:** không sửa file (trừ khi bước nào đỏ).

- [ ] **Step 1: Định dạng và clippy như CI**


```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo fmt --all -- --check
```
Expected: không in gì.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo clippy --locked --workspace --all-targets -- -D warnings 2>&1 | tail -3
```
Expected: `Finished`, không cảnh báo.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && ./scripts/check-windows.sh --locked 2>&1 | tail -5
```
Expected: kết thúc không lỗi.

- [ ] **Step 2: Test toàn workspace và test lib so với mốc**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked --workspace 2>&1 | grep -E '^test result|FAILED|failed' | head -20
```
Expected: mọi dòng `test result: ok.`, không `FAILED`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --locked -p meeting-translator --lib 2>&1 | grep '^test result'
```
Expected: `passed` bằng **N0 + 87** (N0 ghi ở Task 0), `0 failed`.

- [ ] **Step 3: Test bản release, script và test Node nối hằng số**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: --test-threads=1 2>&1 | grep '^test result'
```
Expected: `ok`, 0 failed.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && node --test "scripts/release/*.test.mjs" scripts/models/manifest.test.mjs scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"
```
Expected: `# fail 0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm -C server test:scripts 2>&1 | grep -E '^# (pass|fail)'
```
Expected: `# fail 0`.

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && pnpm exec vitest run 2>&1 | tail -6
```
Expected: mọi file test `passed`; số test không đổi so với mốc (kế hoạch này không thêm test TS).

- [ ] **Step 4: Bản phát hành không chứa chuỗi công tắc dev**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && cargo build --release --locked -p meeting-translator 2>&1 | tail -2 && node scripts/release/release-check.mjs no-dev-gate target/release/meeting-translator
```
Expected: `Finished` rồi `meeting-translator: không có mã công tắc dev`. Nếu lệnh thứ hai báo có chuỗi `AI_TRANSLATOR_DEV_REPORTS`, tìm chỗ tên biến nằm ngoài `#[cfg(debug_assertions)]` (chỉ `DEV_REPORTS_ENV`, hàm `switch_on` và dòng `log::warn!` trong `install` được phép nằm trong cfg đó). Lần đầu build release mất vài phút. Bước này **bắt buộc**: CI phát hành chặn binary có chuỗi này.

- [ ] **Step 5: Rà `git` và đối chiếu spec**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git status --short
```
Expected: trống (mọi thứ đã commit).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/diagnostics-reports && git log --oneline -14
```
Expected: mười bốn commit của kế hoạch này (Task 1–14), commit mới nhất ở trên.

Đối chiếu spec mục 1, 2, 5, 7 (mỗi dòng có test hay đã có ở kế hoạch):

| Spec | Ở đâu |
|---|---|
| §1 bốn loại báo cáo, mã gửi / không gửi, không gửi lúc đang dịch | Task 8 (`flush` đòi rảnh), Task 11 (`REPORTED_CODES`, `SKIPPED_CODES`, `translation_idle`), Task 12 (`no_report_is_sent_while_a_session_runs`) |
| §1 1/dấu vân tay/24 giờ, 5/ngày, hàng đợi 5, gửi nền sau 10 giây, thử lại ≤ 3, `4xx` bỏ, gửi tay không vào hàng đợi | Task 5, 8, 11 (`FIRST_SEND_DELAY_SECS`), 14 (giữ số khớp server) |
| §1 bản debug không tự gửi trừ công tắc dev | Task 11 (`auto_allowed_in_this_build`), Task 13 |
| §2 nội dung báo cáo, 300 dòng `app.log`, W/E + 60 dòng log tiến trình phụ, trần 24/16/16 KiB, tổng ≤ 64 KB | Task 2, 3, 14 |
| §2 che dữ liệu, fail closed, không bao giờ có chữ chép lời | Task 1, 3, 12 (`a_session_error_of_the_app_queues_one_report_that_holds_no_transcript`) |
| §5 cài đặt `sendErrorReports`, người dùng cũ giữ bật, tắt thì xóa hàng đợi | Task 10, 12 (`turning_the_setting_off_drops_the_waiting_reports`) |
| §5 lệnh gửi tay, mã lỗi, quyền của cửa sổ chính | Task 9, 11, 12 |
| §7 định danh bằng `device_id_hash` của bản quyền | Task 11 (`AppHost::facts`) |
| §7 chính sách quyền riêng tư | Kế hoạch 05 (pháp lý, website) |

- [ ] **Step 6: Checklist thử tay (làm SAU khi server của kế hoạch 01 đã deploy; không làm trong kế hoạch này)**

Chủ dự án hay người được giao làm trên máy thật, vì cần server production nhận được báo cáo:
1. Trong `.env` đặt `AI_TRANSLATOR_DEV_REPORTS=true`, chạy `scripts/run-dev-app.sh`: banner cảnh báo hiện trước khi app mở; ở Cài đặt › Quyền riêng tư (kế hoạch 04) bật "Gửi báo cáo lỗi tự động".
2. Gây một lỗi của app (ví dụ xóa file model của gói đang chọn rồi bắt đầu dịch để ra `modelBroken`): sau tối đa 40 giây (10 giây đầu + một nhịp 30 giây) báo cáo `session_error` có mặt ở Web Admin, trang Báo cáo lỗi; mở chi tiết thì **không có** đường dẫn thư mục cá nhân, email, key, chữ chép lời.
3. Giả lập crash: `kill -9` tiến trình app đang chạy, mở lại, đợi 40 giây: báo cáo `crash` mã `unclean_exit`. Thoát app bằng menu rồi mở lại: **không** có báo cáo mới. Tắt rồi bật lại công tắc cài đặt: hàng đợi trống sau khi tắt.
4. Nút "Gửi log cho hỗ trợ" ở Giới thiệu (kế hoạch 04): ra mã `R-XXXX-XXXX`, báo cáo `manual` có mặt ở Web Admin.
5. Xóa các báo cáo thử ở Web Admin, bỏ `AI_TRANSLATOR_DEV_REPORTS` khỏi `.env`.

