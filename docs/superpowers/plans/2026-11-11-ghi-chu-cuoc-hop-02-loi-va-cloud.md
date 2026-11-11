# Ghi chú cuộc họp, kế hoạch 02: lõi `notes/` và nguồn Cloud

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** phía Rust tạo, lưu, sửa và xuất được ghi chú cuộc họp bằng ChatGPT hay Gemini qua lệnh IPC của cửa sổ chính, chưa có màn hình và chưa có model trên máy.

**Architecture:** module mới `src-tauri/src/notes/` chỉ đọc bản chép lời (`data::load`), chạy map-reduce qua trait `NotesEngine` trên luồng riêng, lưu vào bảng `notes` mới của SQLite mã hóa (hay trong bộ nhớ khi phiên không có trong Lịch sử). Bản cài duy nhất của trait ở kế hoạch này là `CloudNotes`; kế hoạch 03 thêm `LocalNotes`. Giao diện là kế hoạch 04, nên sau kế hoạch này người dùng chưa thấy gì đổi.

**Tech Stack:** Rust (crate `meeting-translator`), `reqwest` 0.13.5 blocking, `rusqlite` 0.41.0 (SQLCipher), `serde_json`; TypeScript chỉ cho kiểu và chuỗi lỗi. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` mục 3–9, 13.

**Quy ước:**
- Lệnh viết cho Git Bash. `W=/d/Dev/WORKSPACE/ai-translator`, nhánh `ghi-chu-cuoc-hop`. `T=$W/src-tauri`.
- Test Rust: `cd $W && cargo test -p meeting-translator --lib <bộ lọc>`. Test TS: `cd $W && pnpm test`.
- Không push, không merge, không deploy, không đổi số phiên bản app.

## Global Constraints

- **Không sửa** crate `pipeline`, `src-tauri/src/cloud_mt.rs`, `session.rs`, `capture.rs`. Module `notes` không dùng `pipeline::translate` và không gọi hàm ghi của `TranscriptStore` (Task 9 có test khóa).
- Điểm chạm với mã cũ, chỉ có chừng này: `settings/mod.rs` (bốn trường), `db.rs` (một bước migration), `errors.rs`, `events.rs`, `commands.rs`, `lib.rs`, `build.rs`, `capabilities/main.json`, `data.rs` (`Serialize` cho `TranscriptRef`, một dòng trong `clear_all_data`), `i18n.rs`, `acl_tests.rs`, `src/lib/ipc.ts`, năm file `src/i18n/*.ts`.
- Đầu file `notes/mod.rs`: `#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]`; phần test được `allow`.
- Mọi lỗi ra giao diện là `CommandError` với mã `notes*`. Không đọc thân phản hồi lỗi của cloud, không ghi API key, chữ chép lời, prompt hay chữ ghi chú vào log, sự kiện hay thông báo lỗi.
- Người dùng cũ không đổi hành vi: bốn cài đặt mới có `#[serde(default)]`; không gì chạy cho tới khi có lệnh `generate_notes` (hay `notes_auto` do người dùng bật).
- Giá trị của spec: nguồn mặc định `local`; Free 3 lần, chỉ khi dùng thử còn hạn, tính khi việc hoàn tất; Cloud cần `notes_cloud_consent`; timeout kết nối 10 s, mỗi request 120 s; thử lại JSON một lần.
- `refs` là số thứ tự từ 1 của câu trong `Transcript.lines` (câu thứ `r` là `lines[r - 1]`), giống nhau cho phiên trong bộ nhớ và phiên trong Lịch sử.

## Review Focus

1. Bấm tạo ghi chú khi phiên còn đang chạy: từ chối bằng `notesSessionRunning`, không tóm tắt bản dở (Task 8).
2. Phiên bị xóa (hay "Xóa toàn bộ dữ liệu") trong lúc đang tạo ghi chú cho nó: kết quả bị bỏ, không ghi vào DB, không lỗi (Task 6, Task 8).
3. Cloud trả 200 nhưng thân không có chữ (thiếu `choices`, `candidates` rỗng): lỗi `notesCloudFailed`, không panic (Task 5).
4. Câu có bản dịch rỗng, câu `Failed`, `SameLang`, `Skipped`: lấy câu gốc; câu `Dropped`: bỏ nhưng vẫn giữ số thứ tự (Task 2).
5. `save_notes` nhận dữ liệu từ webview: `refs` ngoài phạm vi, chuỗi quá dài, quá nhiều mục phải bị từ chối hay chuẩn hóa, không ghi nguyên vào DB (Task 3, Task 8).

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `$T/src/settings/mod.rs`, test ở `patch.rs`, `migrate.rs` | `NotesProvider`, `NotesTemplate`, bốn trường |
| Sửa `$T/src/errors.rs`, `src/i18n/{vi,en,ja,zh,ko}.ts` | mã lỗi `notes*` và câu báo |
| Tạo `$T/src/notes/mod.rs` | khai báo module, `install`, `forget`, test ranh giới |
| Tạo `$T/src/notes/chunk.rs` | `PromptLine`, `lines_of`, `render`, `chunk` |
| Tạo `$T/src/notes/schema.rs` | `Notes`, `Item`, `ActionItem`, `parse`, `validate_edit` |
| Tạo `$T/src/notes/prompts/{map,map_lecture,map_brief,reduce,fix}.txt`, `prompt.rs` | mẫu prompt |
| Tạo `$T/src/notes/engine.rs` | `NotesEngine`, `NotesRequest`, `Message`, `Limits`, `NotesError` |
| Tạo `$T/src/notes/job.rs` | `run`: map-reduce, thử lại, gộp |
| Tạo `$T/src/notes/cloud.rs` | `CloudNotes` |
| Tạo `$T/src/notes/store.rs`; sửa `$T/src/db.rs` | bảng `notes`, đọc ghi |
| Tạo `$T/src/notes/quota.rs`, `keys.rs` | bộ đếm Free; đọc API key từ Keystore |
| Tạo `$T/src/notes/service.rs` | `NotesService`, `decide`, `NotesView`, tự tạo khi phiên dừng |
| Tạo `$T/src/notes/render.rs`; sửa `$T/src/i18n.rs` | ghi chú thành Markdown, TXT |
| Sửa `commands.rs`, `lib.rs`, `build.rs`, `capabilities/main.json`, `acl_tests.rs`, `events.rs`, `data.rs`, `src/lib/ipc.ts` | bảy lệnh IPC, một sự kiện |

---

### Task 0: Mốc ban đầu

- [ ] **Step 1:** Run: `cd $W && git switch ghi-chu-cuoc-hop 2>/dev/null || git switch -c ghi-chu-cuoc-hop; cargo test -p meeting-translator --lib 2>&1 | tail -3 && pnpm test 2>&1 | tail -4`
Expected: mọi test `ok`. Ghi số test Rust và TS vào ghi chú làm việc để so ở Task 10. Có test đỏ thì dừng, báo chủ dự án.

---

### Task 1: Bốn cài đặt mới

**Files:** sửa `$T/src/settings/mod.rs`; test ở `$T/src/settings/patch.rs`, `migrate.rs`; sửa `src/lib/ipc.ts`

**Interfaces (Produces):**
- `pub enum NotesProvider { #[default] Local, Openai, Gemini }` và `pub enum NotesTemplate { #[default] Meeting, Lecture, Brief }`, cùng bộ derive và `#[serde(rename_all = "lowercase")]` như `TranslationProvider`.
- `Settings`: `notes_provider: NotesProvider`, `notes_auto: bool`, `notes_template: NotesTemplate`, `notes_cloud_consent: bool`, mỗi trường `#[serde(default)]`, đặt ngay sau `gemini_model`.
- `ipc.ts`: `export type NotesProvider = "local" | "openai" | "gemini"`, `export type NotesTemplate = "meeting" | "lecture" | "brief"`; thêm `notesProvider?`, `notesAuto?`, `notesTemplate?`, `notesCloudConsent?` vào ba kiểu đang có `translationProvider?`.

- [ ] **Step 1: Test đỏ**, đặt cạnh `translation_provider_and_cloud_models_are_validated` trong `patch.rs` và dựng `d` như test đó:

```rust
#[test]
fn notes_settings_default_and_patch() {
    assert_eq!((d.notes_provider, d.notes_auto, d.notes_template, d.notes_cloud_consent),
               (NotesProvider::Local, false, NotesTemplate::Meeting, false));
    let s = apply(&d, &json!({ "notesProvider": "gemini", "notesAuto": true,
                               "notesTemplate": "brief", "notesCloudConsent": true })).unwrap();
    assert_eq!((s.notes_provider, s.notes_auto, s.notes_template, s.notes_cloud_consent),
               (NotesProvider::Gemini, true, NotesTemplate::Brief, true));
    assert_eq!(apply(&d, &json!({ "notesProvider": "claude" })),
               Err(Invalid::new("notesProvider", Reason::WrongType)));
    assert_eq!(apply(&d, &json!({ "notesAuto": "yes" })), Err(Invalid::new("notesAuto", Reason::WrongType)));
}
```
Trong `migrate.rs`, cạnh test `translateWhileSpeaking`: file `{ "schemaVersion": 1 }` nạp ra `notes_provider == NotesProvider::Local` và `rejected` rỗng; `{ "schemaVersion": 1, "notesTemplate": "essay" }` nạp ra `NotesTemplate::Meeting` và `rejected == ["notesTemplate"]`.

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib settings:: 2>&1 | tail -5`. Expected: lỗi biên dịch `NotesProvider` chưa có.
- [ ] **Step 3:** Thêm hai enum, bốn trường, giá trị mặc định ở chỗ dựng `Settings` mặc định (cạnh `translation_provider: TranslationProvider::Local`). Sửa `ipc.ts`.
- [ ] **Step 4:** Run lại lệnh Step 2, rồi `pnpm build 2>&1 | tail -3`. Expected: `ok`; `tsc` không lỗi.
- [ ] **Step 5: Commit** `git commit -am "feat(notes): cài đặt nguồn, mẫu, tự tạo và đồng ý Cloud của ghi chú"`

---

### Task 2: `chunk.rs`: bản chép lời thành dòng prompt, chia đoạn

**Files:** tạo `$T/src/notes/mod.rs`, `$T/src/notes/chunk.rs`; sửa `$T/src/lib.rs` (`pub mod notes;`)

**Interfaces (Produces):**
```rust
pub struct PromptLine { pub seq: u32, pub speaker: Option<String>, pub text: String }   // Clone, Debug, PartialEq
pub fn lines_of(t: &Transcript) -> Vec<PromptLine>;
pub fn render(lines: &[PromptLine]) -> String;                 // "[seq] Speaker: text\n", không có "Speaker: " khi None
pub fn chunk(lines: &[PromptLine], budget: usize, count: &dyn Fn(&str) -> usize) -> Vec<Vec<PromptLine>>;
```

- [ ] **Step 1: Test đỏ** (dựng `Subtitle` như hàm `line` trong test của `transcript/history.rs`; `speakers` dùng `VoiceView::saved`)

```rust
fn words(n: usize) -> String { vec!["w"; n].join(" ") }
fn count(s: &str) -> usize { s.split_whitespace().count() }          // "[1] w w w w" = 5
fn pl(seq: u32, n: usize) -> PromptLine { PromptLine { seq, speaker: None, text: words(n) } }
fn seqs(c: &[Vec<PromptLine>]) -> Vec<Vec<u32>> { c.iter().map(|x| x.iter().map(|l| l.seq).collect()).collect() }

#[test]
fn lines_of_picks_translation_then_source_and_keeps_numbering() {
    // 1 Done có dịch, người nói "Lan"; 2 Done dịch rỗng; 3 Dropped; 4 Failed; 5 SameLang; 6 Skipped; 7 gốc và dịch đều rỗng
    let got = lines_of(&t);
    assert_eq!(got.iter().map(|l| l.seq).collect::<Vec<_>>(), [1, 2, 4, 5, 6]);
    assert_eq!((got[0].speaker.as_deref(), got[0].text.as_str()), (Some("Lan"), "Chào buổi sáng."));
    assert_eq!(got[1].text, "Second source.");                        // dịch rỗng: lấy câu gốc
    assert!(got[2..].iter().all(|l| l.text.ends_with("source.")));    // Failed, SameLang, Skipped: câu gốc
    assert_eq!(render(&got[..2]), "[1] Lan: Chào buổi sáng.\n[2] Second source.\n");
}
#[test]
fn chunk_is_greedy_and_always_advances() {
    assert_eq!(seqs(&chunk(&[pl(1, 4), pl(2, 4), pl(3, 4)], 10, &count)), [vec![1, 2], vec![3]]);
    assert_eq!(seqs(&chunk(&[pl(1, 50), pl(2, 2)], 10, &count)), [vec![1], vec![2]]);
    assert!(chunk(&[], 10, &count).is_empty());
}
```

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib notes::chunk 2>&1 | tail -5`. Expected: lỗi biên dịch.
- [ ] **Step 3: Viết.** `seq` là vị trí trong `t.lines` cộng 1. Chữ của câu theo đúng luật của `transcript::export::translation`: lấy `tgt_text.trim()` khi `status` là `AsrDone`, `Translating` hay `Done` và chuỗi không rỗng; không thì `src_text.trim()`. Bỏ câu `Dropped` và câu có chữ rỗng. `speaker` là `t.speaker_label(line)`. `chunk` gom tham lam, không chồng lấn; chi phí một câu là `count` của dòng đã dựng; câu vượt ngân sách đứng một mình.
- [ ] **Step 4:** Run lại. Expected: 2 test `ok`.
- [ ] **Step 5: Commit** `git add src-tauri/src/notes src-tauri/src/lib.rs && git commit -m "feat(notes): dòng prompt và chia đoạn"`

---

### Task 3: `schema.rs`: kiểu `Notes`, đọc JSON của model, kiểm bản sửa tay

**Files:** tạo `$T/src/notes/schema.rs`

**Interfaces (Produces):**
```rust
#[serde(rename_all = "camelCase")]                                    // Clone, Debug, Default, PartialEq, Serialize, Deserialize
pub struct Notes { pub summary: String, pub decisions: Vec<Item>, pub action_items: Vec<ActionItem>,
                   pub open_questions: Vec<Item>, #[serde(default)] pub raw: bool }
pub struct Item { pub text: String, pub refs: Vec<u32> }
pub struct ActionItem { pub text: String, pub owner: String, pub due: String, pub refs: Vec<u32> }
pub struct Stats { pub refs_total: u32, pub refs_invalid: u32, pub owners_cleared: u32 }       // Default, PartialEq, Debug
pub fn parse(raw: &str, lines: &[PromptLine]) -> Option<(Notes, Stats)>;
pub fn validate_edit(notes: Notes, line_count: usize) -> Result<Notes, Invalid>;
pub const MAX_SUMMARY_CHARS: usize = 20_000;  pub const MAX_ITEMS: usize = 200;  pub const MAX_TEXT_CHARS: usize = 2_000;
```

- [ ] **Step 1: Test đỏ**

```rust
fn lines() -> Vec<PromptLine> {
    vec![PromptLine { seq: 1, speaker: Some("Lan".into()), text: "Minh gửi báo cáo thứ Sáu".into() },
         PromptLine { seq: 2, speaker: None, text: "y".into() }]            // câu 3 đã bị bỏ (Dropped)
}
const GOOD: &str = r#"{"summary":"S","decisions":[{"text":"D","refs":[1,"2",99,"1-2",1,3]}],
  "action_items":[{"text":"A","owner":"minh","due":"thứ Sáu","refs":[1]},{"text":"B","owner":"Bob","due":null,"refs":[]},
                  {"text":"  ","owner":"","due":"","refs":[1]}],"open_questions":[]}"#;

#[test]
fn parse_normalizes() {
    let (n, stats) = parse(GOOD, &lines()).unwrap();
    assert_eq!(n.decisions, [Item { text: "D".into(), refs: vec![1, 2] }]);
    assert_eq!(n.action_items.len(), 2);
    assert_eq!((n.action_items[0].owner.as_str(), n.action_items[1].owner.as_str(), n.action_items[1].due.as_str()), ("minh", "", ""));
    assert_eq!(stats, Stats { refs_total: 7, refs_invalid: 3, owners_cleared: 1 });
    assert!(!n.raw);
}
#[test]
fn parse_reads_through_wrappers() {
    for raw in [format!("```json\n{GOOD}\n```"), format!("<think>hmm {{}}</think>\n{GOOD}"), format!("Here:\n{GOOD}\nDone.")] {
        assert_eq!(parse(&raw, &lines()).unwrap().0.summary, "S");
    }
}
#[test]
fn parse_rejects_wrong_shapes() {
    for bad in ["not json", "[]", r#"{"summary":5,"decisions":[],"action_items":[],"open_questions":[]}"#,
                r#"{"decisions":[],"action_items":[],"open_questions":[]}"#,
                r#"{"summary":"s","decisions":"none","action_items":[],"open_questions":[]}"#, "{\"summary\":\"s\""] {
        assert!(parse(bad, &lines()).is_none(), "{bad}");
    }
}
#[test]
fn validate_edit_caps_and_cleans() {
    let mut n = parse(GOOD, &lines()).unwrap().0;
    n.decisions[0].refs = vec![2, 0, 9, 2];
    assert_eq!(validate_edit(n.clone(), 3).unwrap().decisions[0].refs, [2]);
    n.summary = "x".repeat(MAX_SUMMARY_CHARS + 1);
    assert_eq!(validate_edit(n.clone(), 3), Err(Invalid::new("notes.summary", Reason::OutOfRange)));
    n.summary.clear();
    n.open_questions = vec![Item { text: "q".into(), refs: vec![] }; MAX_ITEMS + 1];
    assert_eq!(validate_edit(n, 3), Err(Invalid::new("notes.openQuestions", Reason::OutOfRange)));
}
```

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib notes::schema 2>&1 | tail -5`. Expected: lỗi biên dịch.
- [ ] **Step 3: Viết.** `parse` đọc bằng `serde_json::Value` (khóa của model là `action_items`, `open_questions`), theo luật:
  - Bỏ mọi khối `<think>…</think>`; lấy đoạn từ `{` đầu tiên tới `}` khớp ngoặc của nó (đếm ngoặc, bỏ qua ngoặc trong chuỗi JSON, có xét `\"`). Không khớp được → `None`.
  - Hợp lệ khi là object, `summary` là chuỗi, ba mảng đều có và đều là mảng.
  - Bỏ mục không phải object hay `text` rỗng sau `trim`; mục bị bỏ không tính vào `Stats`. `owner`, `due` không phải chuỗi → `""`.
  - `refs`: nhận số nguyên không âm và chuỗi toàn chữ số; giữ số là `seq` của một phần tử trong `lines`; bỏ trùng, xếp tăng. `refs_total` đếm mọi phần tử nhận vào; `refs_invalid` đếm phần tử không phải `seq` hợp lệ (trùng không tính).
  - `owner` giữ nguyên khi (không phân biệt hoa thường) trùng một `speaker` hay nằm trong `text` của một câu; không thì `""` và `owners_cleared += 1`.
  - `validate_edit`: `summary` quá `MAX_SUMMARY_CHARS` → `notes.summary`; mảng quá `MAX_ITEMS` → `notes.decisions` / `notes.actionItems` / `notes.openQuestions`; `text`, `owner`, `due` quá `MAX_TEXT_CHARS` → `notes.text`; đều `Reason::OutOfRange`. `refs` chỉ giữ số trong `1..=line_count`, bỏ trùng, xếp tăng. Bỏ mục có `text` rỗng. Giữ nguyên `raw`.
- [ ] **Step 4:** Run lại. Expected: 4 test `ok`.
- [ ] **Step 5: Commit** `git commit -am "feat(notes): kiểu Notes, đọc JSON của model, kiểm bản sửa tay"`

---

### Task 4: Mẫu prompt, trait `NotesEngine`, `job::run`

**Files:** tạo `$T/src/notes/prompts/*.txt`, `prompt.rs`, `engine.rs`, `job.rs`

**Interfaces (Produces):**
```rust
// engine.rs
pub enum Role { User, Assistant }
pub struct Message { pub role: Role, pub content: String }
pub struct NotesRequest { pub messages: Vec<Message>, pub max_tokens: u32 }
pub struct Limits { pub budget: usize, pub max_map: u32, pub max_reduce: u32 }
pub enum NotesError { KeyMissing, Offline, AuthFailed, RateLimited, Cloud(u16), BadResponse, Cancelled, Engine(String) }   // Clone, Debug, PartialEq, Eq
// `NotesError::code()` thêm ở Task 7, cùng lúc với các hằng mã lỗi.
pub trait NotesEngine: Send {
    fn limits(&self) -> Limits;
    fn count_tokens(&self, text: &str) -> usize;
    fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError>;
}
// prompt.rs
pub fn language_name(code: &str) -> &'static str;                      // vi Vietnamese, en English, zh Chinese, ja Japanese, ko Korean; mã lạ: English
pub fn map(template: NotesTemplate, language: &str, transcript: &str) -> String;
pub fn reduce(language: &str, parts: &str) -> String;
pub const FIX: &str;
// job.rs
pub struct Outcome { pub notes: Notes, pub chunks: usize, pub failed_chunks: usize, pub reduce_fallback: bool }
pub fn run(lines: &[PromptLine], target_lang: &str, template: NotesTemplate, engine: &dyn NotesEngine,
           cancel: &AtomicBool, progress: &mut dyn FnMut(usize, usize)) -> Result<Outcome, NotesError>;
```

- [ ] **Step 1: Ghi mẫu prompt.** `map.txt`, `reduce.txt`, `fix.txt`: **nguyên văn** ba khối ở Task 3 Step 1 của kế hoạch 01 (`docs/superpowers/plans/2026-11-11-ghi-chu-cuoc-hop-01-do-model-local.md`). Hai mẫu còn lại là `map.txt` với phần thay sau:
  - `map_lecture.txt`: câu đầu thành `You write study notes from the transcript of a lecture or class.`; bốn dòng luật đầu thành:
    ```
    - "summary": 4 to 8 sentences on the topics covered.
    - "decisions": the key points and conclusions the speaker made.
    - "action_items": homework, exercises or things the audience was told to do. "owner" is "" unless a person was named. "due" is the deadline as said in the transcript, or "".
    - "open_questions": questions raised and left unanswered.
    ```
  - `map_brief.txt`: bốn dòng luật đầu thành:
    ```
    - "summary": 2 or 3 sentences.
    - "decisions": at most 3, the most important ones.
    - "action_items": at most 5. "owner" is the person's name exactly as it appears in the transcript, or "" if nobody was named. "due" is the deadline as said in the transcript, or "".
    - "open_questions": always [].
    ```
  `prompt.rs` nhúng bằng `include_str!` và thay `{language}`, `{transcript}`, `{parts}` bằng `str::replace`.

- [ ] **Step 2: Test đỏ** (`Scripted` cài `NotesEngine`: `limits` trả `{ budget: 10, max_map: 800, max_reduce: 1500 }`, `count_tokens` đếm từ, `generate` lấy lần lượt từ hàng đợi `Result<String, NotesError>` và ghi lại `NotesRequest`; `pl`, `seqs` như Task 2)

```rust
const OK1: &str = r#"{"summary":"s1","decisions":[{"text":"d1","refs":[1]}],"action_items":[],"open_questions":[]}"#;
const OK2: &str = r#"{"summary":"s2","decisions":[{"text":"d2","refs":[3]}],"action_items":[],"open_questions":[]}"#;
const ALL: &str = r#"{"summary":"all","decisions":[{"text":"d","refs":[1,3]}],"action_items":[],"open_questions":[]}"#;
fn go(lines: &[PromptLine], replies: &[Result<&str, NotesError>]) -> (Result<Outcome, NotesError>, Vec<NotesRequest>);

#[test] fn single_chunk() {
    let (r, seen) = go(&[pl(1, 4)], &[Ok(OK1)]);
    let r = r.unwrap();
    assert_eq!((r.notes.summary.as_str(), r.chunks, seen.len(), seen[0].max_tokens), ("s1", 1, 1, 800));
    assert!(seen[0].messages[0].content.contains("Write the notes in Vietnamese"));
}
#[test] fn retry_then_raw_text_in_summary() {
    let (r, seen) = go(&[pl(1, 4)], &[Ok("oops"), Ok("still bad")]);
    let n = r.unwrap().notes;
    assert_eq!((n.summary.as_str(), n.raw, n.decisions.len()), ("still bad", true, 0));
    assert_eq!(seen[1].messages.len(), 3);                               // user, assistant ("oops"), user (FIX)
    assert_eq!(seen[1].messages[1].content, "oops");
}
#[test] fn map_reduce_keeps_refs() {
    let (r, seen) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok(OK1), Ok(OK2), Ok(ALL)]);
    let r = r.unwrap();
    assert_eq!((r.chunks, seen.len(), r.notes.decisions[0].refs.clone(), seen[2].max_tokens), (2, 3, vec![1, 3], 1500));
}
#[test] fn reduce_fails_merges_mechanically() {
    let (r, _) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok(OK1), Ok(OK2), Ok("bad"), Ok("bad")]);
    let r = r.unwrap();
    assert!(r.reduce_fallback);
    assert_eq!((r.notes.summary.as_str(), r.notes.decisions.len()), ("s1\ns2", 2));
}
#[test] fn failed_chunk_is_skipped() {
    let (r, seen) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok("bad"), Ok("bad"), Ok(OK2)]);
    let r = r.unwrap();
    assert_eq!((r.failed_chunks, r.notes.summary.as_str(), seen.len()), (1, "s2", 3));
}
#[test] fn engine_errors_and_cancel_stop_the_job() {
    assert_eq!(go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok(OK1), Err(NotesError::Offline)]).0.unwrap_err(), NotesError::Offline);
    // cờ hủy bật sẵn: Err(Cancelled), không gọi engine lần nào
}
#[test] fn empty_transcript_calls_nothing() {
    let (r, seen) = go(&[], &[]);
    assert_eq!((r.unwrap().notes, seen.len()), (Notes::default(), 0));
}
```

- [ ] **Step 3:** Run: `cargo test -p meeting-translator --lib notes::job 2>&1 | tail -5`. Expected: lỗi biên dịch.
- [ ] **Step 4: Viết `run`.** Cùng thuật toán với `run_job` của kế hoạch 01 (Task 3 Step 5 ở đó), với các điểm riêng của app:
  1. Kiểm `cancel` trước mỗi lần gọi engine; đang bật → `Err(Cancelled)`. Lỗi của engine (mọi `Err`) dừng cả việc và trả nguyên lỗi đó; chỉ JSON sai mới đi vào nhánh thử lại.
  2. Thử lại một lần với `[user: prompt, assistant: chuỗi vừa nhận, user: FIX]`.
  3. Cả phiên một đoạn mà vẫn sai: `Notes { summary: <chuỗi lần hai>, raw: true, ..Default::default() }`. Nhiều đoạn: bỏ đoạn sai, `failed_chunks += 1`; mọi đoạn đều sai thì dùng chuỗi cuối cùng làm bản thô như trên.
  4. Gộp theo tầng: mỗi bản thành phần là một dòng JSON gọn với khóa của model (`action_items`, `open_questions`; không có `raw`); nhóm tham lam các dòng liền nhau có `count_tokens` ≤ `budget`, nhóm tối thiểu hai bản; `max_reduce`; lặp tới khi còn một bản. Nhóm vẫn sai sau thử lại: gộp cơ học (`summary` nối bằng `\n`, ba mảng nối theo thứ tự), `reduce_fallback = true`.
  5. `parse` luôn kiểm `refs` trên toàn bộ `lines`. `progress(done, total)` gọi sau mỗi lần gọi engine xong; `total` là số đoạn, cộng 1 khi có hơn một đoạn.
- [ ] **Step 5:** Run lại. Expected: 7 test `ok`.
- [ ] **Step 6: Commit** `git commit -am "feat(notes): mẫu prompt, NotesEngine, map-reduce"`

---

### Task 5: `cloud.rs`: `CloudNotes`

**Files:** tạo `$T/src/notes/cloud.rs`

**Interfaces (Produces):**
```rust
pub struct CloudNotes { /* provider, model, api_key, base, http */ }
impl CloudNotes {
    pub fn new(provider: NotesProvider, model: &str, api_key: String) -> Result<Self, NotesError>;   // Local → Engine(..)
    pub fn with_base(self, base: &str) -> Self;                                                     // chỉ test dùng
}
impl NotesEngine for CloudNotes   // limits: budget 60_000, max_map 4_000, max_reduce 4_000; count_tokens: chars().count().div_ceil(2).max(1)
```

- [ ] **Step 1: Test đỏ** (server giả: `crate::license::client::tests::serve`)

```rust
fn req() -> NotesRequest { /* [User "p", Assistant "a", User "f"], max_tokens 800 */ }
#[test] fn openai_request_and_reply() {
    let (base, seen) = serve(vec![(200, vec![], r#"{"choices":[{"message":{"content":"{\"summary\":\"s\"}"}}]}"#)]);
    let e = CloudNotes::new(NotesProvider::Openai, "chatgpt-4o-mini", "sk-test".into()).unwrap().with_base(&base);
    assert_eq!(e.generate(&req(), &AtomicBool::new(false)).unwrap(), r#"{"summary":"s"}"#);
    let s = &seen.lock().unwrap()[0];
    assert_eq!((s.method.as_str(), s.path.as_str(), s.authorization.as_deref()), ("POST", "/v1/chat/completions", Some("Bearer sk-test")));
    assert_eq!((&s.body["model"], &s.body["temperature"], &s.body["max_tokens"], &s.body["response_format"]["type"]),
               (&json!("gpt-4o-mini"), &json!(0.0), &json!(800), &json!("json_object")));
    assert_eq!(s.body["messages"][1], json!({ "role": "assistant", "content": "a" }));
    assert!(s.body.get("stream").is_none());
}
#[test] fn gemini_request_and_reply() {
    let (base, seen) = serve(vec![(200, vec![], r#"{"candidates":[{"content":{"parts":[{"text":"{\"a\""},{"text":":1}"}]}}]}"#)]);
    let e = CloudNotes::new(NotesProvider::Gemini, "gemini-3.1-flash-lite", "g-test".into()).unwrap().with_base(&base);
    assert_eq!(e.generate(&req(), &AtomicBool::new(false)).unwrap(), r#"{"a":1}"#);
    let s = &seen.lock().unwrap()[0];
    assert_eq!(s.path, "/v1beta/models/gemini-3.1-flash-lite:generateContent");
    assert_eq!((&s.body["contents"][1]["role"], &s.body["contents"][1]["parts"][0]["text"]), (&json!("model"), &json!("a")));
    assert_eq!((&s.body["generationConfig"]["responseMimeType"], &s.body["generationConfig"]["maxOutputTokens"]),
               (&json!("application/json"), &json!(800)));
}
#[test] fn statuses_map_to_errors_without_reading_the_body() {
    for (status, want) in [(401, NotesError::AuthFailed), (403, NotesError::AuthFailed), (429, NotesError::RateLimited),
                           (500, NotesError::Cloud(500)), (200, NotesError::BadResponse)] {
        let (base, _) = serve(vec![(status, vec![], r#"{"error":"echo sk-test"}"#)]);
        let e = CloudNotes::new(NotesProvider::Openai, "gpt-4o-mini", "sk-test".into()).unwrap().with_base(&base);
        let err = e.generate(&req(), &AtomicBool::new(false)).unwrap_err();
        assert_eq!(err, want);
        assert!(!format!("{err:?}").contains("sk-test"));
    }
}
#[test] fn offline_and_cancelled() {
    let e = CloudNotes::new(NotesProvider::Openai, "gpt-4o-mini", "k".into()).unwrap().with_base("http://127.0.0.1:9");
    assert_eq!(e.generate(&req(), &AtomicBool::new(false)).unwrap_err(), NotesError::Offline);
    assert_eq!(e.generate(&req(), &AtomicBool::new(true)).unwrap_err(), NotesError::Cancelled);
}
```

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib notes::cloud 2>&1 | tail -5`. Expected: lỗi biên dịch.
- [ ] **Step 3: Viết.**
  - Client riêng của module: `reqwest::blocking::Client`, `connect_timeout` 10 s, `timeout` 120 s. Dựng lỗi thì `Engine(..)`, không `expect`.
  - Địa chỉ gốc: `https://api.openai.com` và `https://generativelanguage.googleapis.com`.
  - OpenAI: `POST {base}/v1/chat/completions`, `bearer_auth`, thân `{ model, messages, temperature: 0.0, max_tokens, response_format: { type: "json_object" } }`; tên `chatgpt-4o-mini` gửi đi là `gpt-4o-mini` (như `cloud_mt`). Chữ trả về: `choices[0].message.content`.
  - Gemini: `POST {base}/v1beta/models/{model}:generateContent`, header `x-goog-api-key`, thân `{ contents: [{ role: "user" | "model", parts: [{ text }] }], generationConfig: { temperature: 0.0, maxOutputTokens, responseMimeType: "application/json" } }`. Chữ trả về: nối mọi `candidates[0].content.parts[].text`.
  - Lỗi gửi hay timeout → `Offline`. Mã khác 2xx → theo bảng của test, **không đọc thân**. 2xx mà không lấy được chữ, hay chữ rỗng → `BadResponse`.
  - Kiểm `cancel` trước khi gửi.
- [ ] **Step 4:** Run lại. Expected: 4 test `ok`.
- [ ] **Step 5: Commit** `git commit -am "feat(notes): CloudNotes cho ChatGPT và Gemini"`

---

### Task 6: Bảng `notes` và `store.rs`

**Files:** sửa `$T/src/db.rs`; tạo `$T/src/notes/store.rs`

**Interfaces (Produces):**
```rust
#[serde(rename_all = "camelCase")]                                    // Clone, Debug, PartialEq, Serialize
pub struct Stored { pub created_at: u64, pub source: NotesProvider, pub model: String, pub lang: String,
                    pub template: NotesTemplate, pub body: Notes, pub edited: bool }
pub fn put(conn: &Connection, session_id: i64, s: &Stored) -> Result<bool, DbError>;   // false: phiên không còn
pub fn get(conn: &Connection, session_id: i64) -> Result<Option<Stored>, DbError>;
pub fn session_for(conn: &Connection, started_at: u64) -> Result<Option<i64>, DbError>;
pub fn sessions_with_notes(conn: &Connection) -> Result<Vec<i64>, DbError>;
```

- [ ] **Step 1: Test đỏ.** Trong `store.rs` (mở DB như `conn()` trong test của `transcript/history.rs`; lưu phiên bằng `history::save`):

```rust
#[test] fn put_get_replace() {
    let id = history::save(&mut c, &transcript()).unwrap().unwrap();
    assert_eq!(get(&c, id).unwrap(), None);
    assert!(put(&c, id, &stored("s1")).unwrap());
    assert!(put(&c, id, &Stored { edited: true, ..stored("s2") }).unwrap());
    let got = get(&c, id).unwrap().unwrap();
    assert_eq!((got.body.summary.as_str(), got.edited, got.source, got.template), ("s2", true, NotesProvider::Gemini, NotesTemplate::Meeting));
    assert_eq!(sessions_with_notes(&c).unwrap(), [id]);
    assert_eq!(session_for(&c, transcript().started_at).unwrap(), Some(id));
    assert_eq!(session_for(&c, 1).unwrap(), None);
}
#[test] fn deleting_the_session_deletes_its_note_and_put_on_a_missing_session_is_false() {
    let id = history::save(&mut c, &transcript()).unwrap().unwrap();
    put(&c, id, &stored("s")).unwrap();
    history::delete(&c, id).unwrap();
    assert_eq!(get(&c, id).unwrap(), None);
    assert!(!put(&c, id, &stored("late")).unwrap());
    assert_eq!(get(&c, id).unwrap(), None);
}
```
Trong `db.rs`: test nâng bản cũ đang khẳng định `version == 2` ở mỗi lần mở; đổi thành `SCHEMA_VERSION` và thêm khẳng định bảng `notes` có sau khi nâng và rỗng (`SELECT count(*) FROM notes` = 0), dữ liệu cũ còn nguyên như test đang kiểm.

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib notes::store db:: 2>&1 | tail -6`. Expected: lỗi biên dịch.
- [ ] **Step 3: Viết.** Thêm vào cuối `MIGRATIONS` đúng câu `CREATE TABLE notes (…)` ở spec §5 (bước `2 → 3`, kèm chú thích theo kiểu hai bước trước). `put` là `INSERT … ON CONFLICT(session_id) DO UPDATE`; trước đó kiểm phiên còn tồn tại và trả `false` nếu không (không dựa vào lỗi khóa ngoại). `body_json` là `serde_json` của `Notes`; đọc lại mà hỏng JSON thì coi như không có ghi chú (`None`) và `log::warn!` không kèm nội dung. `source`, `template` lưu dạng chữ thường như serde.
- [ ] **Step 4:** Run lại. Expected: `ok`. Nếu test xóa phiên đỏ vì ghi chú còn lại: khóa ngoại chưa bật trên kết nối; dừng, báo chủ dự án (cùng cơ chế mà bảng `lines` đang dựa vào).
- [ ] **Step 5: Commit** `git commit -am "feat(notes): bảng notes (migration 3) và đọc ghi"`

---

### Task 7: Mã lỗi, câu báo, bộ đếm Free, đọc key

**Files:** sửa `$T/src/errors.rs`, `src/i18n/{vi,en,ja,zh,ko}.ts`; tạo `$T/src/notes/quota.rs`, `keys.rs`

**Interfaces (Produces):**
- Hằng trong `errors.rs` và `NotesError::code()`:

| Hằng | Mã | `NotesError` | Câu tiếng Việt | Câu tiếng Anh |
|---|---|---|---|---|
| `NOTES_BUSY` | `notesBusy` | — | Đang tạo một bản ghi chú khác. Chờ xong hay hủy rồi thử lại. | Another set of notes is being created. Wait for it or cancel it, then try again. |
| `NOTES_SESSION_RUNNING` | `notesSessionRunning` | — | Dừng dịch rồi mới tạo ghi chú cho phiên này. | Stop translating before creating notes for this session. |
| `NOTES_EMPTY` | `notesEmpty` | — | Phiên này chưa có câu nào để ghi chú. | This session has nothing to take notes from. |
| `NOTES_FREE_USED_UP` | `notesFreeUsedUp` | — | Bạn đã dùng hết 3 lần tạo ghi chú của bản dùng thử. Nâng cấp để dùng tiếp. | You have used the 3 notes included in the trial. Upgrade to keep using it. |
| `NOTES_LOCAL_UNAVAILABLE` | `notesLocalUnavailable` | — | Chưa có model ghi chú trên máy. Chọn ChatGPT hay Gemini, hoặc tải gói ghi chú. | The on-device notes model is not available. Choose ChatGPT or Gemini, or download the notes pack. |
| `NOTES_CONSENT_REQUIRED` | `notesConsentRequired` | — | Cần bạn đồng ý gửi nội dung phiên tới nhà cung cấp đã chọn. | Your consent is needed to send this session's text to the chosen provider. |
| `NOTES_KEY_MISSING` | `notesKeyMissing` | `KeyMissing` | Chưa có API key cho nguồn đã chọn. | No API key is saved for the chosen provider. |
| `NOTES_OFFLINE` | `notesOffline` | `Offline` | Không kết nối được tới nhà cung cấp. Kiểm tra mạng rồi thử lại. | Could not reach the provider. Check your connection and try again. |
| `NOTES_AUTH_FAILED` | `notesAuthFailed` | `AuthFailed` | Nhà cung cấp từ chối API key. Kiểm tra lại key. | The provider rejected the API key. Check the key. |
| `NOTES_RATE_LIMITED` | `notesRateLimited` | `RateLimited` | Key đã chạm giới hạn của nhà cung cấp. Thử lại sau. | The key hit the provider's limit. Try again later. |
| `NOTES_CLOUD_FAILED` | `notesCloudFailed` | `Cloud(_)`, `BadResponse` | Nhà cung cấp trả lỗi. Thử lại sau. | The provider returned an error. Try again later. |
| `NOTES_ENGINE_FAILED` | `notesEngineFailed` | `Engine(_)` | Không tạo được ghi chú. Thử lại. | Could not create the notes. Try again. |
| `NOTES_CANCELLED` | `notesCancelled` | `Cancelled` | Đã hủy. | Cancelled. |

  ja, zh, ko: dịch từ câu tiếng Anh, cùng giọng với các câu `error.*` đứng cạnh trong từng file.
- `quota.rs`: `pub const FREE_NOTES: u32 = 3; pub const FREE_ENTRY: &str = "notes-free-used"; pub fn check(pro: bool, trial: TrialStatus, used: u32) -> Result<(), &'static str>; pub fn used(ks: &Keystore) -> u32; pub fn bump(ks: &Keystore) -> Result<u32, KeystoreError>;`
- `keys.rs`: `pub fn with_keystore<R: Runtime, T>(app: &AppHandle<R>, f: impl FnOnce(&Keystore) -> T) -> Option<T>; pub fn api_key<R: Runtime>(app: &AppHandle<R>, provider: NotesProvider) -> Option<String>;`

- [ ] **Step 1: Test đỏ**

```rust
#[test] fn free_rule() {
    assert_eq!(check(true, TrialStatus::Ended, 99), Ok(()));
    assert_eq!(check(false, TrialStatus::Active, 2), Ok(()));
    assert_eq!(check(false, TrialStatus::Active, 3), Err(errors::NOTES_FREE_USED_UP));
    assert_eq!(check(false, TrialStatus::Ended, 0), Err(errors::PRO_REQUIRED));
    assert_eq!(check(false, TrialStatus::None, 0), Err(errors::PRO_REQUIRED));
}
#[test] fn counter_lives_in_the_keystore_and_fails_closed() {
    let ks = Keystore::mock("t");
    assert_eq!(used(&ks), 0);
    assert_eq!((bump(&ks).unwrap(), bump(&ks).unwrap(), used(&ks)), (1, 2, 2));
    ks.set(FREE_ENTRY, b"garbage").unwrap();
    assert_eq!(used(&ks), FREE_NOTES);
}
#[test] fn api_key_reads_the_entries_cloud_translation_uses() {
    // mock_app; set cloud_mt::OPENAI_KEY_ENTRY = " sk-1 " → api_key(Openai) == Some("sk-1"); Gemini và Local → None
}
```
Thêm 13 hằng vào danh sách của test trong `errors.rs` đang kiểm `src/i18n/en.ts` có `error.<mã>`.

- [ ] **Step 2:** Run: `cargo test -p meeting-translator --lib notes::quota notes::keys errors:: 2>&1 | tail -6`. Expected: lỗi biên dịch.
- [ ] **Step 3: Viết.** Bộ đếm lưu số dạng chữ số ASCII; không có mục → 0; không đọc được hay không phải số → `FREE_NOTES`. `with_keystore` làm như hàm cùng tên (riêng tư) trong `cloud_mt.rs`: lấy `Arc<Keystore>` đã `manage`, không có thì `Keystore::os(&app.config().identifier)`. `api_key` cắt khoảng trắng, chuỗi rỗng là `None`. Thêm 13 khóa `error.notes*` vào cả năm file i18n.
- [ ] **Step 4:** Run lại, rồi `pnpm test 2>&1 | tail -4`. Expected: `ok` (test từ điển kiểm năm file cùng bộ khóa).
- [ ] **Step 5: Commit** `git commit -am "feat(notes): mã lỗi, bộ đếm Free, đọc API key"`

---

### Task 8: `service.rs`: một việc tại một thời điểm

**Files:** tạo `$T/src/notes/service.rs`; sửa `$T/src/notes/mod.rs`, `$T/src/events.rs`, `$T/src/data.rs`, `$T/src/lib.rs`

**Interfaces (Produces):**
```rust
pub struct Facts { pub busy: bool, pub is_current: bool, pub session: SessionStatus, pub usable_lines: usize,
                   pub pro: bool, pub trial: TrialStatus, pub free_used: u32,
                   pub provider: NotesProvider, pub consent: bool, pub has_key: bool }
pub fn decide(f: &Facts) -> Result<(), &'static str>;
pub type EngineFactory = Arc<dyn Fn(NotesProvider, &str, Option<String>) -> Result<Box<dyn NotesEngine>, NotesError> + Send + Sync>;
pub fn live_factory() -> EngineFactory;                                 // CloudNotes::new
#[serde(rename_all = "camelCase")]
pub struct NotesView { pub target: TranscriptRef, pub status: JobStatus /* idle | running | failed */,
                       pub progress: Option<(usize, usize)>, pub error: Option<String>,
                       pub notes: Option<Stored>, pub persisted: bool, pub free_left: Option<u32> }
pub struct NotesService;                                                // new(factory)
impl NotesService {
    pub fn view<R: Runtime>(&self, app: &AppHandle<R>, target: TranscriptRef) -> Result<NotesView, CommandError>;
    pub fn start<R: Runtime>(&self, app: &AppHandle<R>, target: TranscriptRef, template: Option<NotesTemplate>) -> Result<NotesView, CommandError>;
    pub fn cancel<R: Runtime>(&self, app: &AppHandle<R>);
    pub fn save_edit<R: Runtime>(&self, app: &AppHandle<R>, target: TranscriptRef, notes: Notes) -> Result<NotesView, CommandError>;
    pub fn forget(&self);
}
// mod.rs
pub fn install<R: Runtime>(app: &AppHandle<R>);                         // manage(NotesService) + nghe app://status
pub fn forget<R: Runtime>(app: &AppHandle<R>);
// events.rs
pub const NOTES_CHANGED: &str = "notes://changed";                      // chỉ cửa sổ chính; nội dung: NotesChanged { target, status, progress, error }
```
`data::TranscriptRef` thêm derive `Serialize`.

- [ ] **Step 1: Test đỏ cho `decide`**

```rust
fn ok() -> Facts { Facts { busy: false, is_current: true, session: SessionStatus::Idle, usable_lines: 5, pro: true,
    trial: TrialStatus::Ended, free_used: 0, provider: NotesProvider::Gemini, consent: true, has_key: true } }
#[test] fn decide_checks_in_order() {
    assert_eq!(decide(&ok()), Ok(()));
    let all_wrong = Facts { busy: true, session: SessionStatus::Running, usable_lines: 0, pro: false,
                            provider: NotesProvider::Local, consent: false, has_key: false, ..ok() };
    assert_eq!(decide(&all_wrong), Err(errors::NOTES_BUSY));
    assert_eq!(decide(&Facts { busy: false, ..all_wrong }), Err(errors::NOTES_SESSION_RUNNING));
    assert_eq!(decide(&Facts { session: SessionStatus::Starting, ..ok() }), Err(errors::NOTES_SESSION_RUNNING));
    assert_eq!(decide(&Facts { session: SessionStatus::Running, is_current: false, ..ok() }), Ok(()));   // phiên trong Lịch sử
    assert_eq!(decide(&Facts { usable_lines: 0, ..ok() }), Err(errors::NOTES_EMPTY));
    assert_eq!(decide(&Facts { pro: false, ..ok() }), Err(errors::PRO_REQUIRED));
    assert_eq!(decide(&Facts { pro: false, trial: TrialStatus::Active, free_used: 3, ..ok() }), Err(errors::NOTES_FREE_USED_UP));
    assert_eq!(decide(&Facts { provider: NotesProvider::Local, ..ok() }), Err(errors::NOTES_LOCAL_UNAVAILABLE));
    assert_eq!(decide(&Facts { consent: false, ..ok() }), Err(errors::NOTES_CONSENT_REQUIRED));
    assert_eq!(decide(&Facts { has_key: false, ..ok() }), Err(errors::NOTES_KEY_MISSING));
}
```

- [ ] **Step 2: Test đỏ cho dịch vụ** (dùng `mock_app()`; cài đặt `notes_provider = gemini`, `notes_cloud_consent = true`, có key Gemini trong Keystore giả; engine giả có cổng chặn bằng kênh để giữ việc ở trạng thái đang chạy; Pro bật theo cách các test Pro của `app_tests.rs`; nạp câu vào `TranscriptStore` bằng `begin`/`upsert`/`end` từ **mã test**, không từ module). Mỗi test một hàm:
  1. `generate_stores_in_memory_for_an_unsaved_session`: `start(Current)` trả `status == running`; mở cổng; chờ tới khi `view(Current).notes` có `body.summary == "s1"`, `persisted == false`, `source == Gemini`, `model == "gemini-3.1-flash-lite"`; sự kiện `notes://changed` đã phát ít nhất hai lần và không lần nào có chữ `s1` trong nội dung.
  2. `generate_persists_when_the_session_is_in_history`: lưu phiên bằng `history::save` trước; xong việc thì `persisted == true` và `store::get` trả đúng bản đó; `view(History { id })` cũng thấy.
  3. `second_start_is_busy_and_cancel_discards`: việc đang chạy, `start` lần hai → `notesBusy`; `cancel`; `view` ngay sau đó `status == idle`; mở cổng; chờ 200 ms; `view(Current).notes == None`.
  4. `deleting_the_session_mid_job_drops_the_result`: việc chạy cho `History { id }`, `history::delete`, mở cổng → `status == idle`, không có ghi chú, không panic.
  5. `engine_error_becomes_failed_with_code`: engine trả `Err(RateLimited)` → `view.status == failed`, `view.error == Some("notesRateLimited")`.
  6. `free_counts_only_on_success`: không Pro, dùng thử `Active`: việc lỗi không tăng `quota::used`; việc xong tăng 1 và `free_left == Some(2)`.
  7. `save_edit_validates_and_marks_edited`: sau khi có ghi chú, `save_edit` với `refs` ngoài phạm vi → lưu bản đã lọc, `edited == true`; với `summary` quá dài → lỗi `outOfRange`, bản cũ còn nguyên; đang có việc chạy → `notesBusy`.
  8. `auto_starts_when_a_session_stops`: `notes_auto` bật; `events::status_changed` với `Running` rồi `Idle` → engine nhận một request. `notes_auto` tắt → không request nào. `Running` rồi `Error` → không request nào.
  9. `forget_cancels_and_clears`: `notes::forget` giữa việc → `status == idle`, bộ nhớ rỗng.

- [ ] **Step 3:** Run: `cargo test -p meeting-translator --lib notes::service 2>&1 | tail -6`. Expected: lỗi biên dịch.
- [ ] **Step 4: Viết.**
  - `decide` theo đúng thứ tự của test: bận → phiên hiện tại đang `Starting`/`Running` → không có câu → `quota::check` → nguồn `Local` → chưa đồng ý → thiếu key.
  - `start`: nạp bản chép lời bằng `data::load` (phiên Lịch sử tự đòi Pro); dựng `Facts` (Pro: `pro::is_pro`; dùng thử: `license::app::view(app)` rồi `.trial.status`, không có view thì `TrialStatus::None`; key: `keys::api_key`); `decide`; model là `openai_model` hay `gemini_model` của cài đặt; `template` không truyền thì lấy `notes_template`. Chạy `job::run` trên `std::thread` riêng (tên `notes-job`), không trên luồng chính hay runtime của Tauri.
  - Xong việc: cờ hủy đã bật → bỏ kết quả. Không thì dựng `Stored` (`created_at` giờ Unix ms, `lang` là `target_lang` của phiên). Nơi lưu: mục tiêu `History { id }` → `store::put`; mục tiêu `Current` → nếu Pro và `store::session_for(started_at)` có id → `store::put`, không thì giữ trong bộ nhớ kèm số `session` của bản chép lời. `put` trả `false` → bỏ kết quả. Không Pro và việc xong → `quota::bump`.
  - `view(Current)`: ghi chú trong bộ nhớ chỉ trả khi số `session` trùng bản chép lời hiện tại; không có thì thử `session_for` rồi `store::get` (chỉ khi Pro). `free_left`: `None` khi Pro, không thì `FREE_NOTES - used` (không âm).
  - `cancel`: bật cờ, trạng thái về `idle` ngay, phát sự kiện. `forget`: `cancel` rồi xóa bộ nhớ.
  - Trạng thái `failed` giữ mã lỗi tới lần `start` kế tiếp.
  - Sự kiện `notes://changed` phát khi bắt đầu, sau mỗi bước tiến độ, khi xong, lỗi, hủy; **không mang chữ ghi chú**.
  - Log chỉ có số: số đoạn, số đoạn hỏng, thời gian, nguồn, mã lỗi.
  - `install`: `manage(NotesService::new(live_factory()))`; `app.listen_any(events::STATUS_CHANGED, …)` đọc trường `session` của nội dung, nhớ giá trị trước, và khi chuyển từ `running` sang `idle` mà `notes_auto` bật thì `start(Current, None)`, lỗi chỉ ghi mã vào log. Gọi `notes::install(&handle)` trong `lib.rs` ngay sau `support::install`.
  - `data::clear_all_data`: thêm `crate::notes::forget(app);` ngay sau `transcript.clear()`.
- [ ] **Step 5:** Run lại, rồi `cargo test -p meeting-translator --lib data:: 2>&1 | tail -3`. Expected: 10 test của `notes::service` `ok`; test của `data` không đổi.
- [ ] **Step 6: Commit** `git commit -am "feat(notes): NotesService, tự tạo khi phiên dừng"`

---

### Task 9: Lệnh IPC, quyền, xuất ghi chú, test ranh giới

**Files:** tạo `$T/src/notes/render.rs`; sửa `$T/src/i18n.rs`, `commands.rs`, `build.rs`, `capabilities/main.json`, `acl_tests.rs`, `$T/src/notes/mod.rs`, `src/lib/ipc.ts`

**Interfaces (Produces):** bảy lệnh, chỉ cửa sổ `main`:

| Lệnh | Tham số | Trả về | Ghi chú |
|---|---|---|---|
| `get_notes` | `target: TranscriptRef` | `NotesView` | async, `blocking` |
| `generate_notes` | `target`, `template: Option<NotesTemplate>` | `NotesView` | async; trả ngay sau khi việc bắt đầu |
| `cancel_notes` | — | `()` | |
| `save_notes` | `target`, `notes: Notes` | `NotesView` | async |
| `list_notes_sessions` | — | `Vec<i64>` | Pro; async |
| `notes_text` | `target` | `String` | Markdown, để sao chép; mọi gói |
| `export_notes` | `target`, `format: Format`, `utc_offset_minutes: i32` | `Option<String>` | Pro; `Format::Srt` → `Invalid::new("format", Reason::OutOfRange)` |

`render.rs`: `pub fn markdown(n: &Notes, s: &Strings) -> String; pub fn txt(n: &Notes, s: &Strings) -> String;`
`i18n::Strings` thêm: `notes_title` (vi "Ghi chú cuộc họp", en "Meeting notes"), `notes_summary` ("Tóm tắt", "Summary"), `notes_decisions` ("Quyết định", "Decisions"), `notes_actions` ("Việc cần làm", "Action items"), `notes_questions` ("Câu hỏi còn mở", "Open questions"), `notes_owner` ("Phụ trách", "Owner"), `notes_due` ("Hạn", "Due"); ja, zh, ko dịch từ tiếng Anh.

- [ ] **Step 1: Test đỏ cho `render`**

```rust
#[test] fn markdown_and_txt() {
    let n = Notes { summary: "Tổng *kết*".into(),
        decisions: vec![Item { text: "Lùi hạn".into(), refs: vec![1] }],
        action_items: vec![ActionItem { text: "Gửi báo cáo".into(), owner: "Minh".into(), due: "thứ Sáu".into(), refs: vec![] },
                           ActionItem { text: "Đặt phòng".into(), owner: "".into(), due: "".into(), refs: vec![] }],
        open_questions: vec![], raw: false };
    assert_eq!(markdown(&n, &VI),
        "# Ghi chú cuộc họp\n\n## Tóm tắt\n\nTổng \\*kết\\*\n\n## Quyết định\n\n- Lùi hạn\n\n\
         ## Việc cần làm\n\n- Gửi báo cáo (Phụ trách: Minh; Hạn: thứ Sáu)\n- Đặt phòng\n");
    assert_eq!(txt(&n, &VI),
        "Ghi chú cuộc họp\n\nTóm tắt\nTổng *kết*\n\nQuyết định\n- Lùi hạn\n\n\
         Việc cần làm\n- Gửi báo cáo (Phụ trách: Minh; Hạn: thứ Sáu)\n- Đặt phòng\n");
    assert_eq!(markdown(&Notes::default(), &VI), "# Ghi chú cuộc họp\n");
}
```
Khối rỗng không in tiêu đề. Chỉ có `owner` hay chỉ có `due` thì ngoặc chỉ chứa phần có. Markdown thoát chữ bằng `transcript::export::escape_markdown`.

- [ ] **Step 2: Test đỏ cho quyền và ranh giới.** Trong `acl_tests.rs`, theo mẫu `the_account_commands_belong_to_the_main_window_only` và `only_the_main_window_reaches_the_account_commands`: hằng `NOTES_COMMANDS` gồm bảy tên trên; test `the_notes_commands_belong_to_the_main_window_only`; test `only_the_main_window_reaches_the_notes_commands` (overlay, compose, hint gọi `get_notes` với `{ "target": { "kind": "current" } }` bị `denied`; `main` thì không). Trong `notes/mod.rs`:

```rust
#[test] fn the_module_stays_inside_its_boundary() {
    for (name, src) in SOURCES {        // (tên file, include_str!) của mọi file .rs trong src/notes, bỏ phần sau "#[cfg(test)]"
        for banned in ["pipeline::translate", "cloud_mt::CloudMt", "cloud_mt::FallbackMt", "crate::session::", "crate::capture::",
                       ".upsert(", ".begin(", ".delta(", ".set_speaker(", ".rename_speaker(", ".merge_speakers("] {
            assert!(!src.contains(banned), "{name} có `{banned}`");
        }
    }
}
```

- [ ] **Step 3:** Run: `cargo test -p meeting-translator --lib notes:: acl_tests 2>&1 | tail -8`. Expected: đỏ (thiếu `render`, thiếu lệnh).
- [ ] **Step 4: Viết.** `render.rs`; bảy hàm lệnh trong `commands.rs` (mỏng: gọi `NotesService` qua `app.state`, việc chặn đi qua `blocking`); thêm bảy tên vào `MAIN_COMMANDS`, `handler()`, danh sách `commands(&[…])` của `build.rs`, và bảy quyền `allow-<tên-gạch-nối>` vào `capabilities/main.json`. `export_notes`: `pro::require`, lấy ghi chú qua `view`, không có ghi chú → `notesEmpty`; tên file là `export::file_name` của phiên với tiền tố `transcript` đổi thành `notes`; ghi bằng `files::save_as`. `ipc.ts`: kiểu `Notes`, `NotesItem`, `NotesActionItem`, `StoredNotes`, `NotesView`, `NotesChanged`, bảy hàm gọi lệnh, hằng sự kiện `notes://changed`, theo cách các lệnh lịch sử đang khai.
- [ ] **Step 5:** Run lại lệnh Step 3, rồi `cargo test -p meeting-translator --lib i18n:: 2>&1 | tail -3 && pnpm build 2>&1 | tail -3`. Expected: `ok`; `tsc` không lỗi.
- [ ] **Step 6: Commit** `git commit -am "feat(notes): lệnh IPC, quyền cửa sổ chính, xuất ghi chú"`

---

### Task 10: Kiểm cuối

- [ ] **Step 1: Cả bộ test.** Run: `cd $W && cargo test --workspace 2>&1 | tail -6 && pnpm test 2>&1 | tail -4`
Expected: mọi test `ok`; số test cũ không giảm so với Task 0.
- [ ] **Step 2: Clippy và định dạng.** Run: `cargo fmt --check && cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -3`
Expected: không cảnh báo.
- [ ] **Step 3: Ranh giới ở mức git.** Run: `git diff --stat main -- crates src-tauri/src/cloud_mt.rs src-tauri/src/session.rs src-tauri/src/capture.rs Cargo.lock`
Expected: không có dòng nào (không đụng đường dịch, không thêm thư viện).
- [ ] **Step 4: Chạy thật một lần (cần chủ dự án).** Bản dev, có API key Gemini trong Cài đặt › Model, dịch thử 2 phút rồi dừng. Trong DevTools của cửa sổ chính, bật `notesProvider: "gemini"` và `notesCloudConsent: true` qua `update_settings`, gọi `generate_notes` với `{ target: { kind: "current" } }`, rồi `get_notes`. Expected: ghi chú đúng ngôn ngữ đích, `refs` trỏ vào câu có thật; log của app không có chữ của cuộc họp (`grep` một cụm từ trong ghi chú trên file log, không thấy).
- [ ] **Step 5:** Báo chủ dự án kết quả và các việc còn lại: kế hoạch 03 (Local, sau kết quả kế hoạch 01), 04 (màn hình), 05 (pháp lý, website, phát hành). Đo lại độ trễ A2 (spec §13) nằm ở kế hoạch 03, nơi lần đầu có tiến trình phụ mới.
