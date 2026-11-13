# Ghi chú cuộc họp, kế hoạch 03: engine Local

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** phía Rust tạo được ghi chú bằng model trên máy (gói ghi chú tải riêng), theo đúng quy trình `c16kx` đã đo, mà không ảnh hưởng phiên dịch.

**Architecture:** manifest có khóa gốc mới `notes` (đọc lỏng như `speaker`); `ModelService` tải, kiểm và xóa file model đó. `notes/local.rs` chạy một `llama-server` thứ hai chỉ trong lúc có việc và cài `NotesEngine`. `job::run` có thêm chiến lược `Verified` (map chặt, gộp mục bằng máy, model chỉ viết tóm tắt, kiểm từng việc cần làm với câu gốc). Phiên dịch bắt đầu thì việc Local bị hủy qua một móc trong `ModelService::begin_session`.

**Tech Stack:** Rust (crate `meeting-translator`), `reqwest` blocking, `pipeline::llama::{LlamaLaunch, command}`, `pipeline::{process, logfile}`. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` mục 2 (G2, G4, G8), 3, 4, 6, 10.1, 13. Số đo gốc: `bench/2026-11-11-ghi-chu-cuoc-hop/` (`run_notes.py`, `notes_lib.py`, `prompts/`).

**Quy ước:**
- Lệnh viết cho Git Bash. `W=/d/Dev/WORKSPACE/ai-translator-ghichu` (worktree của nhánh `ghi-chu-cuoc-hop`), `T=$W/src-tauri`.
- Ổ D còn khoảng 4 GB: mọi lệnh cargo đặt `CARGO_TARGET_DIR=/d/Dev/WORKSPACE/ai-translator/target`. Không tạo thư mục `target` thứ hai.
- Test Rust: `cd $W && cargo test --manifest-path src-tauri/Cargo.toml --lib <bộ lọc>`. Test TS: `cd $W && npx vitest run`.
- Không push, không merge, không deploy, không đổi số phiên bản app.

## Global Constraints

- **Không sửa** crate `pipeline`, `src-tauri/src/cloud_mt.rs`, `session.rs`, `capture.rs`. `notes` không dùng `pipeline::translate`. Được dùng (chỉ đọc API công khai) `pipeline::llama::{LlamaLaunch, command, API_KEY_ENV}`, `pipeline::process::{spawn, Killer, release}`, `pipeline::logfile::{RotatingLog, pump_observed, MAX_BYTES, KEEP}`.
- `notes/mod.rs` giữ `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`; test được `allow`.
- Chữ chép lời, prompt, chữ ghi chú, `LLAMA_API_KEY` không vào log, sự kiện hay thông báo lỗi. `NotesError::Engine(mô tả)` chỉ mang mô tả kỹ thuật (mã thoát, "hết giờ chờ /health").
- **Câu gốc chỉ tới engine Local.** `CloudNotes` chỉ nhận chữ do `chunk::render` sinh (bản dịch kèm nhãn người nói, spec §9). Task 3 có test khóa.
- Giá trị đã đo, chép nguyên: context 16384; ngân sách đoạn 12000 token; `max_tokens` map 2000, tóm tắt 800, kiểm một việc 140; kiểm ±1 câu quanh `refs`; `--cache-ram 0`; thân request có `"chat_template_kwargs": {"enable_thinking": false}` và `"temperature": 0`.
- Model: file `Qwen3.5-4B-Q4_K_M.gguf`, 2 740 937 888 byte, SHA-256 `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`, Apache-2.0. Ngưỡng RAM mặc định 15 360 MiB, lấy từ manifest (`notes.min_ram_mib`).
- Tiến trình ghi chú không tự khởi động lại. Chết thì việc đó lỗi `notesEngineFailed` một lần.
- Người dùng cũ không đổi hành vi: manifest chưa có mục `notes` thì mọi thứ của kế hoạch này "ngủ".

## Review Focus

1. Bắt đầu phiên dịch khi việc Local đang ở giữa một request dài: tiến trình ghi chú phải chết trước khi `asr-worker` chạy, việc kết thúc bằng `notesPausedForSession`, không treo (Task 7).
2. Bấm Hủy khi `llama-server` còn đang nạp model (chưa `/health`): tiến trình bị kill, không để lại tiến trình mồ côi (Task 6).
3. Việc cần làm có `refs` trỏ vào câu đầu hay câu cuối bản chép lời: cửa sổ ±1 không tràn chỉ số (Task 3, Task 5).
4. Lượt kiểm trả phán quyết không đọc được: việc được giữ nguyên, không bị bỏ nhầm (Task 5).
5. File model bị đổi sau khi tải (SHA-256 lệch): không chạy, báo `notesLocalPackMissing`, đánh dấu chưa cài để tải lại (Task 2, Task 6).

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `$T/src/models/manifest.rs` | khóa gốc `notes`, `NotesModel`, `Manifest::notes_model` |
| Sửa `$T/src/models/service.rs`, `models/commands.rs` | tải, hủy tải, xóa gói ghi chú; `ModelsView::notes`; móc `before_session` |
| Sửa `$T/src/notes/chunk.rs` | `PromptLine::source`, `render_verify` |
| Sửa `$T/src/notes/engine.rs`, `cloud.rs` | `Format`, `Strategy` |
| Tạo `$T/src/notes/prompts/{map_strict,reduce_summary,verify}.txt`; sửa `prompt.rs` | ba mẫu của `c16kx` |
| Tạo `$T/src/notes/verify.rs` | `owner_known`, `parse_verdict`, `has_cjk`, `merge_items` |
| Sửa `$T/src/notes/job.rs` | chiến lược `Verified` |
| Tạo `$T/src/notes/local.rs` | `LocalSpec`, `LocalServer`, `LocalNotes` |
| Sửa `$T/src/notes/service.rs`, `mod.rs`, `errors.rs`, `diagnostics/mod.rs`, `commands.rs`, `lib.rs`, `build.rs`, `capabilities/main.json`, `acl_tests.rs` | nối Local vào dịch vụ, mã lỗi, hai lệnh IPC |
| Sửa `src/lib/ipc.ts`, `src/i18n/{vi,en,ja,zh,ko}.ts`, `src/lib/fakeModels.ts` | kiểu và câu báo lỗi |

---

### Task 0: Mốc ban đầu

- [ ] **Step 1:** Run: `cd $W && git status --short | wc -l && CARGO_TARGET_DIR=/d/Dev/WORKSPACE/ai-translator/target cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | tail -3 && npx vitest run 2>&1 | tail -4`
Expected: `0`; Rust `1242 passed; 0 failed; 5 ignored`; TS `726 passed`. Số khác thì ghi lại làm mốc. Có test đỏ thì dừng, báo chủ dự án.

---

### Task 1: Khóa `notes` của manifest

**Files:** sửa `$T/src/models/manifest.rs`

**Interfaces (Produces):**
- `Kind::Notes` với `#[serde(skip)]` (như `Kind::Speaker`).
- `Manifest.notes: Option<serde_json::Value>` với `#[serde(default)]`.
- `pub const MAX_NOTES_BYTES: u64 = 4 << 30;`
- `pub struct NotesModel { pub file: FileEntry, pub min_ram_mib: u64, pub ctx: u32 }` (`Clone, Debug, PartialEq, Eq`).
- `pub fn notes_model(&self, app_version: &str) -> Option<NotesModel>`: như `speaker_model`; mục sai thì `log::warn!` và `None`.

Mục `notes` trong manifest: `{ id, version, file, url, bytes, sha256, license_id, min_app_version, min_ram_mib, ctx }`. Luật kiểm: tám trường đầu như `speaker_entry` (thay trần byte bằng `MAX_NOTES_BYTES`; `id` và `file` không trùng mục nào trong `files` hay mục `speaker`); `min_ram_mib` trong `8192..=65536`; `ctx` trong `8192..=32768`.

- [ ] **Step 1: Test đỏ**, đặt cạnh `the_speaker_entry_is_read_when_valid_and_new_enough`, dựng manifest như test đó:

```rust
fn notes_entry(min_app_version: &str) -> Value {
    json!({ "id": "notes-qwen35-4b", "version": "1", "file": "Qwen3.5-4B-Q4_K_M.gguf",
        "url": "notes/00fe7986ff5f/Qwen3.5-4B-Q4_K_M.gguf", "bytes": 2_740_937_888u64,
        "sha256": "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
        "license_id": "Apache-2.0", "min_app_version": min_app_version,
        "min_ram_mib": 15360, "ctx": 16384 })
}

#[test]
fn the_notes_entry_is_read_when_valid_and_new_enough() {
    let mut value = valid();
    value["notes"] = notes_entry("0.3.0");
    let m = parse(&value).unwrap();
    let n = m.notes_model("0.3.0").unwrap();
    assert_eq!((n.file.kind, n.min_ram_mib, n.ctx, n.file.bytes), (Kind::Notes, 15360, 16384, 2_740_937_888));
    assert!(n.file.tier.is_empty());
    assert_eq!(m.notes_model("0.2.9"), None);
}

#[test]
fn a_bad_notes_entry_only_loses_local_notes() {
    for (field, bad) in [("ctx", json!(2048)), ("min_ram_mib", json!(1024)), ("sha256", json!("abc")),
        ("bytes", json!(5u64 << 30)), ("url", json!("https://evil.example/x.gguf"))] {
        let mut value = valid();
        value["notes"] = notes_entry("0.3.0");
        value["notes"][field] = bad;
        let m = parse(&value).unwrap();
        assert_eq!(m.notes_model("9.9.9"), None, "{field}");
        assert!(!m.files.is_empty());
    }
}

#[test]
fn a_notes_kind_inside_files_is_still_refused() {
    let mut value = valid();
    value["files"][0]["kind"] = json!("notes");
    assert!(parse(&value).is_err());
}
```

(`valid()` và `parse` là tên minh họa: dùng đúng hai hàm dựng và đọc manifest mà các test `speaker` cạnh đó đang dùng.)

- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib models::manifest` → Expected: FAIL khi biên dịch (`notes_model` chưa có).
- [ ] **Step 3:** Cài theo Interfaces. Thêm một dòng vào chú thích đầu file mô tả khóa `notes` (cùng kiểu các dòng `speaker`, `tts`).
- [ ] **Step 4:** Run lại lệnh Step 2 → Expected: PASS, không test `manifest` nào đỏ.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): khoa notes cua manifest model"`

---

### Task 2: `ModelService`: tải, hủy tải, xóa gói ghi chú

**Files:** sửa `$T/src/models/service.rs`, `$T/src/models/commands.rs`, `$T/src/lib.rs`, `$T/build.rs`, `$T/capabilities/main.json`, `$T/src/acl_tests.rs`, `src/lib/ipc.ts`, `src/lib/fakeModels.ts`

**Interfaces (Consumes):** `Manifest::notes_model` (Task 1); `Store::{is_installed, path, part, job, mark_installed}`; `download::download`; `Pause`; `Config::machine` (cho `ram_mib`).

**Interfaces (Produces):**
- `pub enum NotesPackState { Unavailable, RamTooLow, Missing, Downloading, Installed }` (`Serialize`, `camelCase`).
- `pub struct NotesPack { pub state: NotesPackState, pub bytes: u64, pub done: u64, pub min_ram_mib: u64 }` (`Serialize`, `camelCase`); `ModelsView.notes: NotesPack`.
- `pub struct NotesReady { pub path: PathBuf, pub sha256: String, pub ctx: u32 }`.
- `pub fn notes_pack(&self) -> NotesPack`
- `pub fn notes_ready(&self) -> Option<NotesReady>`: chỉ `Some` khi `state == Installed`.
- `pub fn download_notes_pack<R: Runtime>(self: &Arc<Self>, app: &AppHandle<R>) -> Result<ModelsView, CommandError>`: trả ngay, tải trên luồng nền.
- `pub fn cancel_notes_download(&self)`; `pub fn delete_notes_pack<R: Runtime>(&self, app: &AppHandle<R>) -> Result<ModelsView, CommandError>`; `pub fn discard_notes_pack(&self)` (bỏ dấu đã cài và xóa file; Task 6 gọi khi SHA-256 lệch).
- `pub fn set_before_session(&self, hook: Box<dyn Fn() + Send + Sync>)`; `begin_session` gọi `hook` trước mọi việc khác của nó.
- Lệnh IPC (chỉ cửa sổ `main`): `download_notes_pack`, `cancel_notes_download`, `delete_notes_pack`, mỗi lệnh trả `ModelsView`.
- `ipc.ts`: `NotesPackState = "unavailable" | "ramTooLow" | "missing" | "downloading" | "installed"`, `NotesPack`, trường `notes` của `ModelsView`, ba lệnh.

Luật trạng thái, theo thứ tự: manifest không có mục dùng được → `Unavailable`; `machine().ram_mib < min_ram_mib` → `RamTooLow`; đang tải → `Downloading` (`done` đọc từ `AtomicU64`); `store.is_installed` → `Installed`; còn lại `Missing`.

Luật tải: từ chối bằng `modelsBusy` khi `begin_work` bận; bằng mã có sẵn của "không đủ chỗ trống" khi ổ còn ít hơn `bytes` còn thiếu cộng 512 MiB (dùng đúng phép kiểm và mã mà `download` của gói ASR đang dùng); bằng `notesLocalUnavailable` khi `Unavailable` hay `RamTooLow`. `keep_part = true` để tải tiếp sau khi hủy. Tải xong: đổi tên `.part`, `mark_installed`, gọi `self.changed(app)`. Trong lúc tải, gọi `self.changed(app)` tối đa một lần mỗi giây.

- [ ] **Step 1: Test đỏ** trong `service.rs`, dùng bộ dựng dịch vụ giả và server HTTP giả mà các test `speaker`/`tts` đang dùng (`test_http`):
  - `the_notes_pack_is_unavailable_without_the_manifest_entry`
  - `the_notes_pack_is_ram_too_low_below_the_manifest_threshold` (máy giả 8192 MiB, manifest 15360 → `RamTooLow`; `download_notes_pack` trả `Err` mã `notesLocalUnavailable`, không có request nào tới server giả)
  - `downloading_the_notes_pack_installs_it_and_reports_progress` (sau khi xong: `Installed`, `notes_ready()` có `ctx == 16384`, file đúng SHA-256)
  - `a_notes_pack_with_the_wrong_sha256_is_not_installed`
  - `cancelling_keeps_the_part_and_a_second_download_resumes` (server giả đếm header `Range`)
  - `deleting_the_notes_pack_returns_to_missing`
  - `the_before_session_hook_runs_before_the_session_begins` (hook đẩy `"hook"`, `begin` đẩy `"begin"` vào cùng một `Mutex<Vec<_>>`; kết quả `["hook", "begin"]`)
- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib models::service` → Expected: FAIL khi biên dịch.
- [ ] **Step 3:** Cài theo Interfaces, theo mẫu `download_speaker_model` (khóa bảo trì) và `TtsDownloading` (cờ và bộ đếm nguyên tử, thả ở mọi lối ra).
- [ ] **Step 4:** Thêm ba lệnh vào `commands.rs`, `lib.rs` (`generate_handler!`), `build.rs`, `capabilities/main.json`; thêm vào bảng lệnh của `acl_tests.rs` (chỉ `main`). Thêm kiểu vào `ipc.ts`; `fakeModels.ts` trả `notes: { state: "unavailable", bytes: 0, done: 0, minRamMib: 0 }`.
- [ ] **Step 5:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib models:: && cargo test --manifest-path src-tauri/Cargo.toml --lib acl_tests && npx tsc --noEmit && npx vitest run 2>&1 | tail -3` → Expected: tất cả PASS.
- [ ] **Step 6:** `git add -A && git commit -m "feat(ghi-chu): tai, huy va xoa goi ghi chu; moc truoc phien"`

---

### Task 3: Câu gốc cho lượt kiểm

**Files:** sửa `$T/src/notes/chunk.rs`

**Interfaces (Produces):**
- `PromptLine` thêm `pub source: Option<String>`: câu gốc đã `trim`, chỉ `Some` khi khác `text` và không rỗng. `lines_of` điền; mọi chỗ dựng `PromptLine` trong test thêm `source: None`.
- `pub fn render_verify(lines: &[PromptLine], refs: &[u32], around: u32) -> String`: các câu có `seq` trong `r - around ..= r + around` của một `r` nào đó, theo thứ tự, mỗi câu `"[seq] Người nói: <câu gốc>\n"` rồi, khi có bản dịch khác câu gốc, `"    → <bản dịch>\n"`. Câu gốc là `source` nếu có, không thì `text`; bản dịch là `text` khi `source` có. Dùng `saturating_sub`/`saturating_add`.

- [ ] **Step 1: Test đỏ:**

```rust
fn line(seq: u32, who: Option<&str>, text: &str, source: Option<&str>) -> PromptLine {
    PromptLine { seq, speaker: who.map(str::to_string), text: text.into(), source: source.map(str::to_string) }
}

#[test]
fn render_verify_shows_the_original_then_the_translation_around_the_refs() {
    let lines = vec![
        line(1, Some("Lan"), "Chào", Some("Hello")),
        line(2, None, "Same", None),
        line(3, Some("Minh"), "Tôi gửi thứ Sáu", Some("I'll send it Friday")),
        line(5, None, "Xa", Some("Far")),
    ];
    assert_eq!(render_verify(&lines, &[3], 1), "[2] Same\n[3] Minh: I'll send it Friday\n    → Tôi gửi thứ Sáu\n");
    assert_eq!(render_verify(&lines, &[1], 1), "[1] Lan: Hello\n    → Chào\n[2] Same\n");
    assert_eq!(render_verify(&lines, &[u32::MAX, 0], 1), "[1] Lan: Hello\n    → Chào\n");
    assert_eq!(render_verify(&lines, &[], 1), "");
}

#[test]
fn render_never_contains_the_original_words() {
    let lines = vec![line(1, Some("Lan"), "Chào", Some("Hello-ORIGINAL"))];
    assert!(!render(&lines).contains("ORIGINAL"));
}
```

Thêm vào test `lines_of` đang có: câu `Done` có `src_text` "Hello", `tgt_text` "Chào" cho `source == Some("Hello")`; câu `SameLang` cho `source == None`.

- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::chunk` → Expected: FAIL khi biên dịch.
- [ ] **Step 3:** Cài. **Step 4:** Run lại → PASS; `cargo test … --lib notes::` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): cau goc cho luot kiem viec can lam"`

---

### Task 4: `Format`, `Strategy`, ba mẫu prompt, `verify.rs`

**Files:** sửa `$T/src/notes/engine.rs`, `cloud.rs`, `prompt.rs`, `mod.rs`; tạo `$T/src/notes/prompts/{map_strict,reduce_summary,verify}.txt`, `$T/src/notes/verify.rs`

**Interfaces (Produces):**
- `engine.rs`: `pub enum Format { Notes, Summary, Verdict }` (`Clone, Copy, Debug, PartialEq, Eq`); `NotesRequest` thêm `pub format: Format`. `pub enum Strategy { Standard, Verified }`; trait thêm `fn strategy(&self) -> Strategy { Strategy::Standard }`. `CloudNotes` không đọc `format` và giữ `Standard`.
- `prompt.rs`: `pub fn map_strict(template, language, transcript) -> String` (mẫu `Meeting` dùng `map_strict.txt`; `Lecture` và `Brief` dùng mẫu sẵn có như `map`); `pub fn reduce_summary(language, parts) -> String`; `pub fn verify(language, lines, items) -> String`.
- `verify.rs`:
  - `pub struct Verdict { pub keep: bool, pub owner: String, pub due: String }`
  - `pub fn parse_verdict(raw: &str) -> Option<Verdict>`: đối tượng JSON đầu tiên trong `raw` (bỏ khối `<think>…</think>` nếu có), dạng `{"items": [{"n": 1, "keep": bool, "owner": string, "due": string}]}`; lấy phần tử có `n == 1`; không có `items`, không có phần tử đó, hay `keep` không phải bool thì `None`; `owner`, `due` không phải chuỗi thì chuỗi rỗng.
  - `pub fn parse_summary(raw: &str) -> Option<String>`: `{"summary": string}`, đã `trim`, rỗng thì `None`.
  - `pub fn owner_known(name: &str, lines: &[PromptLine]) -> bool`: tên (đã `trim`, không phân biệt hoa thường) trùng một nhãn người nói, hay là chuỗi con của `text` hay `source` của một câu; tên rỗng thì `false`.
  - `pub fn has_cjk(text: &str) -> bool`: có ký tự trong U+3040–U+30FF, U+3400–U+4DBF, U+4E00–U+9FFF, U+AC00–U+D7AF.
  - `pub fn merge_items(parts: &[Notes]) -> Notes`: nối ba mảng theo thứ tự; mục trùng chữ (so sau khi hạ chữ thường và gộp khoảng trắng) thì gộp `refs` (sắp tăng, bỏ trùng) và, với việc cần làm, giữ `owner`/`due` đầu tiên không rỗng; `summary` nối bằng `\n`.

Ba file mẫu chép **nguyên văn** từ `bench/2026-11-11-ghi-chu-cuoc-hop/prompts/` (đây là chữ đã đo, không sửa một ký tự): `map_v2.txt` thành `map_strict.txt`, `reduce_summary.txt`, `verify.txt`. Mẫu `verify.txt` nhận một lô việc; app luôn gửi lô **một việc** (cấu hình `c16kx`: `verify_budget 1`), nên `{items}` là đúng một dòng JSON `{"n": 1, "text", "owner", "due", "refs"}` và câu trả lời có dạng `{"items": [{"n": 1, "keep", "owner", "due"}]}`. Thứ tự thay chỗ trống của `verify`: `{language}`, `{items}`, cuối cùng `{lines}`.

- [ ] **Step 1: Test đỏ** trong `verify.rs`:

```rust
#[test]
fn verdicts_are_read_strictly() {
    let v = parse_verdict(r#"<think>x</think> ok {"items": [{"n": 1, "keep": true, "owner": "Minh", "due": 5}]}"#).unwrap();
    assert_eq!((v.keep, v.owner.as_str(), v.due.as_str()), (true, "Minh", ""));
    assert!(!parse_verdict(r#"{"items": [{"n": 1, "keep": false, "owner": "", "due": ""}]}"#).unwrap().keep);
    for bad in ["", "không phải JSON", r#"{"items": [{"n": 1, "keep": "yes"}]}"#, r#"{"items": [{"n": 2, "keep": true}]}"#,
        r#"{"keep": true}"#, r#"{"items": []}"#, "[1,2]"] {
        assert!(parse_verdict(bad).is_none(), "{bad}");
    }
}

#[test]
fn owner_must_be_a_speaker_or_appear_in_the_words() {
    let lines = vec![
        PromptLine { seq: 1, speaker: Some("Lan".into()), text: "Minh gửi báo cáo".into(), source: Some("Minh sends the report".into()) },
    ];
    assert!(owner_known(" lan ", &lines) && owner_known("Minh", &lines) && owner_known("report", &lines));
    assert!(!owner_known("Hoa", &lines) && !owner_known("  ", &lines));
}

#[test]
fn cjk_is_detected() {
    assert!(has_cjk("金曜日") && has_cjk("금요일") && has_cjk("thứ 六"));
    assert!(!has_cjk("thứ Sáu, Friday 15/12"));
}

#[test]
fn merge_items_joins_duplicates_and_keeps_the_first_owner() {
    let part = |owner: &str, refs: Vec<u32>| Notes {
        summary: "s".into(),
        action_items: vec![ActionItem { text: " Gửi  BÁO cáo".into(), owner: owner.into(), due: String::new(), refs }],
        ..Notes::default()
    };
    let m = merge_items(&[part("", vec![4, 2]), part("Minh", vec![2, 9])]);
    assert_eq!(m.action_items.len(), 1);
    assert_eq!((m.action_items[0].owner.as_str(), m.action_items[0].refs.clone()), ("Minh", vec![2, 4, 9]));
    assert_eq!(m.summary, "s\ns");
}
```

Trong `prompt.rs`: `verify("ja", "L", "I")` chứa `"written in Japanese"`, kết thúc bằng `"Transcript lines:\nL\nItems:\nI"` (bỏ khoảng trắng cuối), và chữ `{language}` nằm trong `lines` không bị thay.

- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::` → Expected: FAIL khi biên dịch.
- [ ] **Step 3:** Cài. Mọi chỗ dựng `NotesRequest` (trong `job.rs`, test của `cloud.rs`) thêm `format: Format::Notes`.
- [ ] **Step 4:** Run lại → Expected: PASS toàn bộ `notes::`.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): mau prompt va bo doc cua luot kiem"`

---

### Task 5: Chiến lược `Verified` trong `job::run`

**Files:** sửa `$T/src/notes/job.rs`

**Interfaces (Consumes):** Task 3, Task 4. **Produces:** `Outcome` thêm `pub verify: VerifyStats` với `pub struct VerifyStats { pub checked: usize, pub dropped: usize, pub edited: usize, pub unparsed: usize, pub no_refs: usize }` (`Default, Clone, Debug, PartialEq`). Chữ ký `run` không đổi.

`run` rẽ nhánh theo `engine.strategy()`. `Standard` giữ nguyên từng dòng. `Verified`:
1. Chia đoạn như cũ. Map từng đoạn bằng `prompt::map_strict`, `max_tokens = limits.max_map`, `Format::Notes`, thử lại một lần bằng `FIX` như `ask`.
2. Không còn bản nào: ghi chú thô như cũ. Một bản: dùng luôn. Nhiều bản: `verify::merge_items` rồi qua `schema::parse` trên toàn bộ `lines` (như `merge_mechanically`); hỏi model một lần `prompt::reduce_summary(language, parts)` với `parts` là mỗi tóm tắt một dòng chuỗi JSON, `max_tokens = limits.max_reduce`, `Format::Summary`, thử lại một lần bằng `FIX`; đọc bằng `verify::parse_summary`; không đọc được thì giữ tóm tắt nối và đặt `reduce_fallback`.
3. Kiểm từng việc cần làm, theo thứ tự: việc không có `refs` bị bỏ (`no_refs`). Việc còn lại: `prompt::verify(language, &chunk::render_verify(lines, &item.refs, 1), <dòng JSON của việc, có "n": 1>)`, `max_tokens = 140`, `Format::Verdict`, thử lại một lần bằng `FIX`. Không đọc được: giữ nguyên (`unparsed`). `keep == false`: bỏ (`dropped`). `keep == true`: `owner` mới là `verdict.owner` nếu `owner_known`, không thì rỗng; `due` mới là `verdict.due`, trừ khi ngôn ngữ đích không thuộc `zh`, `ja`, `ko` mà `verdict.due` có chữ CJK thì giữ `due` cũ; khác bản cũ thì `edited`. Nội dung `text` không bao giờ đổi.
4. Kiểm `cancel` trước mỗi lần gọi engine. Lỗi của engine dừng cả việc và trả nguyên lỗi.
5. Tiến độ: `total = số đoạn + (1 nếu nhiều hơn một đoạn) + số việc có refs` (tính lại sau bước 2); mỗi lần gọi xong một đoạn, một lượt tóm tắt, một việc thì `done += 1` và gọi `progress(min(done, total), total)`.

- [ ] **Step 1: Test đỏ**, dùng engine `Scripted` có sẵn, thêm cho nó trường `strategy` (mặc định `Standard`) và ghi lại `format` của từng request. Các test:
  - `verified_single_chunk_checks_each_action_item`: trả lời lần lượt: map có hai việc (refs `[1]`, `[2]`), phán quyết `{"items":[{"n":1,"keep":true,"owner":"Minh","due":"thứ Sáu"}]}`, phán quyết `{"items":[{"n":1,"keep":false,"owner":"","due":""}]}`. Kết quả: một việc, `owner == "Minh"` (dòng 1 có người nói "Minh"), `verify == { checked: 2, dropped: 1, edited: 1, unparsed: 0, no_refs: 0 }`; `format` của ba request là `[Notes, Verdict, Verdict]`; request kiểm đầu tiên chứa `"[1] "` và không chứa chữ của dòng 4.
  - `verified_keeps_an_item_when_the_verdict_is_unreadable`: hai trả lời rác cho một việc → việc còn nguyên, `unparsed == 1`, có đúng 3 request.
  - `verified_drops_items_without_refs_without_asking`: việc `refs: []` → bị bỏ, `no_refs == 1`, chỉ 1 request.
  - `verified_clears_an_unknown_owner_and_ignores_a_cjk_due_for_vi`: phán quyết `owner: "Ghost"`, `due: "金曜日"` → `owner == ""`, `due` giữ giá trị của map. Cùng trả lời với ngôn ngữ đích `ja` → `due == "金曜日"`.
  - `verified_many_chunks_merges_mechanically_and_only_writes_a_summary`: hai đoạn, cả hai có cùng một quyết định → kết quả có một quyết định với `refs` gộp; request thứ ba có `format == Summary` và `max_tokens == limits.max_reduce`; trả lời tóm tắt rác hai lần → `reduce_fallback == true`, tóm tắt là hai tóm tắt nối bằng `\n`.
  - `verified_progress_counts_chunks_summary_and_items`: hai đoạn, ba việc có refs → lần gọi `progress` cuối là `(6, 6)`, `done` không giảm và không vượt `total`.
  - `verified_stops_on_cancel_between_items`: bật `cancel` trong lần gọi engine thứ hai → `Err(Cancelled)`.
  - `standard_strategy_is_unchanged`: chạy lại một test `Standard` có sẵn và khẳng định mọi request có `format == Notes`.
- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::job` → Expected: FAIL (các test `verified_*`).
- [ ] **Step 3:** Cài. **Step 4:** Run lại → PASS; mọi test `notes::job` cũ vẫn PASS không sửa khẳng định nào.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): quy trinh c16kx (gop may, tom tat, kiem tung viec)"`

---

### Task 6: `local.rs`: `llama-server` của ghi chú và `LocalNotes`

**Files:** tạo `$T/src/notes/local.rs`; sửa `$T/src/notes/mod.rs`

**Interfaces (Produces):**
- `pub struct LocalSpec { pub exe: PathBuf, pub model: PathBuf, pub model_sha256: String, pub ctx: u32, pub use_gpu: bool, pub log: PathBuf }`
- `pub struct LocalNotes` với `pub fn start(spec: &LocalSpec, cancel: &AtomicBool) -> Result<Self, NotesError>` và `impl NotesEngine`: `limits()` = `{ budget: 12_000, max_map: 2_000, max_reduce: 800 }`; `strategy()` = `Verified`.
- `pub fn killer(&self) -> pipeline::process::Killer`.
- Hằng: `READY_TIMEOUT = 300 s`, `REQUEST_TIMEOUT = 1800 s`, `LOG_NAME = "notes-llama-server.log"`.

Cách chạy:
- `start`: băm `spec.model` (`sidecar::integrity::sha256_file`), lệch `model_sha256` thì `Err(Engine("model ghi chú sai SHA-256"))`. Dựng `LlamaLaunch::new(exe, model, log)` với `use_gpu = spec.use_gpu`, `extra_args = ["-c", "<ctx>", "--cache-ram", "0"]` (đứng sau `-c 2048` của `llama::command`; llama.cpp lấy giá trị cuối). Khóa ngẫu nhiên 128 bit (cách của `llama::random_key`: hai lần `RandomState`). `process::spawn(&mut llama::command(&launch, 0, &key), &exe)`. Chép stderr vào log bằng `logfile::pump_observed` với `secrets = [key]`; đọc cổng từ dòng có `listening on http://127.0.0.1:<cổng>` (cùng luật với `llama::listening_port`, viết lại vì hàm đó riêng tư). Chờ `GET /health` (header `Authorization: Bearer <key>`) trả 200 trong `READY_TIMEOUT`, mỗi 200 ms một lần; trong lúc chờ, `cancel` bật thì kill và trả `Cancelled`; tiến trình thoát thì `Engine("llama-server thoát sớm")`.
- HTTP client: `no_proxy()`, `pool_max_idle_per_host(0)`, timeout `REQUEST_TIMEOUT`.
- `generate`: thân `{"messages", "temperature": 0, "max_tokens", "chat_template_kwargs": {"enable_thinking": false}, "response_format": {"type": "json_schema", "json_schema": {"name": "notes", "schema": <theo format>}}}` gửi `POST /v1/chat/completions`. Ba schema (`additionalProperties: false`, mọi trường `required`): `Notes` = hình của `schema::Notes` không có `raw`; `Summary` = `{summary: string}`; `Verdict` = `{items: [{n: integer, keep: boolean, owner: string, due: string}]}` (như `VERIFY_SCHEMA` của `run_notes.py`). Trong lúc request chạy, một luồng trong `std::thread::scope` xem `cancel` mỗi 200 ms và gọi `killer().kill()` khi bật. Sau request: `cancel` bật → `Cancelled`; lỗi gửi hay mã khác 200 → `Engine("llama-server: <mã hay 'mất kết nối'>")`; thân không có `choices[0].message.content` → `BadResponse`.
- `count_tokens`: `POST /tokenize {"content": text}` → độ dài mảng `tokens`; lỗi thì `chars / 2` (tối thiểu 1).
- `Drop`: kill, `wait`, `process::release(pid)`, chờ luồng chép log.

- [ ] **Step 1: Test đỏ** với server giả: dựng một `TcpListener` 127.0.0.1 trong test trả lời HTTP theo kịch bản (mẫu `license::client::tests::serve`), và tách phần HTTP của `LocalNotes` thành `struct Client { base: String, key: String, http }` để test không cần tiến trình thật:
  - `the_request_carries_the_schema_of_its_format_and_disables_thinking` (ba format; `Authorization: Bearer k`; `temperature == 0`; `chat_template_kwargs.enable_thinking == false`; tên các trường `required` của từng schema)
  - `a_non_200_reply_is_an_engine_error_without_the_body` (500 với thân chứa `"SECRET"` → `Engine(msg)` và `msg` không chứa `SECRET`)
  - `a_reply_without_content_is_a_bad_response`
  - `count_tokens_reads_the_token_array_and_falls_back`
  - `listening_port_reads_only_the_loopback_line` (`"llama_server: listening on http://127.0.0.1:51234"` → `Some(51234)`; host khác, cổng 0, dòng khác → `None`)
  - `a_model_with_the_wrong_sha256_does_not_start` (file tạm, `exe` không tồn tại; lỗi phải là SHA-256, tức chưa chạy gì)
- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::local` → Expected: FAIL khi biên dịch.
- [ ] **Step 3:** Cài. **Step 4:** Run lại → PASS.
- [ ] **Step 5: Bài chạy thật** (`#[ignore = "cần NOTES_LLAMA_EXE và NOTES_MODEL"]`), `live_local_builds_valid_notes_from_a_short_meeting`: sáu câu của `live_deepseek_builds_valid_notes_from_a_short_meeting` (`cloud.rs`), thêm `source: None`; `LocalSpec` từ hai biến môi trường, `ctx 16384`, `use_gpu` theo `NOTES_USE_GPU == "1"`; trước khi chạy job, `GET /props` phải có `default_generation_settings.n_ctx == 16384`. Khẳng định như bài DeepSeek, trừ khẳng định số mục không rỗng của câu hỏi mở. In thời gian và `VerifyStats`.

Run: `NOTES_LLAMA_EXE=/d/Dev/WORKSPACE/ai-translator/tools/llama-b11146/win-vulkan-x64/llama-server.exe NOTES_MODEL=/d/Dev/WORKSPACE/ai-translator-data/ghi-chu/models/Qwen3.5-4B-Q4_K_M.gguf NOTES_USE_GPU=1 cargo test --manifest-path src-tauri/Cargo.toml --lib live_local -- --ignored --nocapture`
Expected: `1 passed`; dòng in có `n_ctx 16384`. Sau khi test xong: `tasklist | grep -i llama-server` không còn dòng nào.
- [ ] **Step 6:** `git add -A && git commit -m "feat(ghi-chu): engine Local chay llama-server rieng"`

---

### Task 7: Nối Local vào dịch vụ

**Files:** sửa `$T/src/notes/service.rs`, `mod.rs`, `$T/src/errors.rs`, `$T/src/diagnostics/mod.rs`, `$T/src/commands.rs`, `src/lib/ipc.ts`, năm file `src/i18n/*.ts`

**Interfaces (Consumes):** `ModelService::{notes_pack, notes_ready, discard_notes_pack, set_before_session}` (Task 2); `LocalNotes`, `LocalSpec` (Task 6); `session::release_models`; `sidecar::paths` (đường dẫn `llama-server`), `sidecar::integrity::verify`, `sidecar::GpuProbe`.

**Interfaces (Produces):**
- Mã lỗi mới: `NOTES_LOCAL_PACK_MISSING = "notesLocalPackMissing"`, `NOTES_LOCAL_SESSION_ACTIVE = "notesLocalSessionActive"`, `NOTES_PAUSED_FOR_SESSION = "notesPausedForSession"`. Thêm vào hai bảng của `errors.rs` (số mã `notes*` thành 17), `diagnostics/mod.rs`, và năm ngôn ngữ:
  - vi `error.notesLocalPackMissing`: "Chưa tải gói ghi chú trên máy. Tải gói rồi thử lại."
  - vi `error.notesLocalSessionActive`: "Đang dịch nên chưa tạo ghi chú bằng model trên máy được. Dừng phiên rồi thử lại."
  - vi `error.notesPausedForSession`: "Đã tạm dừng tạo ghi chú vì phiên dịch bắt đầu. Tạo lại sau khi họp xong."
  - Sửa vi `error.notesLocalUnavailable` thành: "Máy này không dùng được model trên máy cho ghi chú. Chọn một model cloud ở Cài đặt > Model."
- `enum EngineSpec { Cloud { provider: NotesProvider, model: String, key: Option<String> }, Local(LocalSpec) }`; `EngineFactory = Arc<dyn Fn(EngineSpec, &AtomicBool) -> Result<Box<dyn NotesEngine>, NotesError> + Send + Sync>`. `live_factory`: `Cloud` như cũ, `Local` gọi `LocalNotes::start`.
- `Facts` thêm `local: NotesPackState` và `session_active: bool` (phiên `Starting` hay `Running`, bất kể mục tiêu). `decide` với `provider == Local`: `Unavailable | RamTooLow` → `notesLocalUnavailable`; `Missing | Downloading` → `notesLocalPackMissing`; `session_active` → `notesLocalSessionActive`; không cần đồng ý hay key. Thứ tự các luật trước đó (bận, phiên hiện tại đang chạy, không có câu, hạn mức) giữ nguyên.
- `NotesService::start(app, target, template, force_local: bool)`: `force_local` thay nguồn bằng `Local` cho lần này. Lệnh `generate_notes` thêm tham số `force_local: Option<bool>` (`ipc.ts`: `forceLocal?: boolean`).
- `NotesService::pause_for_session(&self)`: nếu việc đang chạy dùng nguồn `Local`: bật `cancel`, gọi `Killer` của engine, và đánh dấu để việc kết thúc với mã `notesPausedForSession` (trạng thái `Failed`) thay vì `notesCancelled`. Việc Cloud không bị đụng.
- `notes::install_with` gọi `ModelService::set_before_session(…)` với closure gọi `pause_for_session` (bỏ qua khi app chưa `manage` `ModelService`).

Trình tự của việc Local trên luồng việc, trước khi gọi factory: `session::release_models(app)`; kiểm `llama-server` bằng `integrity::verify` như `sidecar::prepare` (lỗi → `notesEngineFailed`); `use_gpu`: macOS `true`, Windows theo `GpuProbe::get(…)` `usable` (GPU tích hợp vẫn dùng: đo 840 s so với 1465 s chỉ CPU); `log` trong `app_log_dir()`. Factory trả lỗi SHA-256 thì gọi `discard_notes_pack` và kết thúc với `notesLocalPackMissing`. Ghi chú Local lưu `source = Local`, `model` = `id` của mục manifest.

- [ ] **Step 1: Test đỏ** trong `service.rs` (engine giả qua factory):
  - `decide_local_rules` (bảng: bốn trạng thái gói × `session_active`, mã trả về đúng như trên; Local không đòi `consent` hay `has_key`)
  - `force_local_uses_the_local_engine_even_with_a_cloud_provider` (factory ghi lại biến thể `EngineSpec` nhận được)
  - `a_session_start_pauses_a_running_local_job` (engine giả chặn tới khi `cancel` bật; gọi `pause_for_session`; trạng thái cuối `Failed` với `notesPausedForSession`; không ghi chú nào được lưu; hạn mức Free không bị trừ)
  - `a_session_start_leaves_a_cloud_job_running`
  - `a_wrong_sha256_discards_the_pack_and_reports_it_missing`
- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::service` → Expected: FAIL khi biên dịch.
- [ ] **Step 3:** Cài; sửa mọi chỗ gọi `start` và mọi factory của test (`app_tests.rs`, `service.rs`) theo chữ ký mới.
- [ ] **Step 4:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes:: && cargo test --manifest-path src-tauri/Cargo.toml --lib errors:: && npx tsc --noEmit && npx vitest run 2>&1 | tail -3` → Expected: PASS (test i18n của frontend đòi đủ khóa ở năm ngôn ngữ).
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): noi engine Local vao dich vu, phien dich luon thang"`

---

### Task 8: Kiểm cuối

- [ ] **Step 1:** Run: `cd $W && cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | tail -3 && cargo clippy --manifest-path src-tauri/Cargo.toml --lib --tests 2>&1 | tail -3 && npx tsc --noEmit && npx vitest run 2>&1 | tail -4`
Expected: Rust 0 failed, số test lớn hơn mốc Task 0; clippy không cảnh báo; TS PASS.
- [ ] **Step 2:** Run test ranh giới: `cargo test --manifest-path src-tauri/Cargo.toml --lib notes::tests` → PASS (`notes` không dùng `pipeline::translate`, không gọi hàm ghi của `TranscriptStore`). Nếu test ranh giới chặn cả `pipeline::llama`: nới đúng cho ba module nêu ở Global Constraints, giữ chặn `pipeline::translate`.
- [ ] **Step 3:** Run: `git diff --stat $(git merge-base HEAD 9b2337e8) -- crates/pipeline src-tauri/src/cloud_mt.rs src-tauri/src/session.rs src-tauri/src/capture.rs` → Expected: không dòng nào.
- [ ] **Step 4: Hồi quy độ trễ (spec §13).** Đọc `crates/latency-bench/README.md` (hay phần đầu `src/main.rs` nếu không có README) để lấy lệnh của lượt đo A2; chạy một lần ở commit `9b2337e8` và một lần ở HEAD, cùng máy, không chạy việc khác. Expected: trung vị độ trễ lệch không quá sai số giữa hai lần chạy liên tiếp của cùng một commit (đo sai số đó bằng cách chạy HEAD hai lần). Không chạy được (thiếu model, thiếu file âm thanh mẫu) thì ghi rõ lý do vào sổ và báo chủ dự án; không đánh dấu xong.
- [ ] **Step 5:** Chạy lại bài thật của Task 6 Step 5 và bài `live_deepseek` (khóa đọc từ `.env` vào biến môi trường của tiến trình, như `logs/live_deepseek.ps1`) → cả hai `1 passed`.
