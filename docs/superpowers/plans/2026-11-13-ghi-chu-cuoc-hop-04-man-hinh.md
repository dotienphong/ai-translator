# Ghi chú cuộc họp, kế hoạch 04: màn hình "Ghi chú cuộc họp"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** người dùng mở mục "Ghi chú cuộc họp", chọn một phiên, tạo ghi chú bằng model đang chọn ở Cài đặt > Model, sửa tay, đối chiếu với câu gốc, sao chép và xuất file.

**Architecture:** một màn hình mới theo mẫu sẵn có của app: phần hiển thị thuần (`NotesScreenView`, nhận props, test bằng `renderToStaticMarkup`), một store zustand (`createNotesStore`, nhận `Ipc` giả trong test), và các hàm thuần quyết định bước kế tiếp (`src/lib/notes.ts`). Phía Rust đã có đủ lệnh từ kế hoạch 02 và 03; kế hoạch này chỉ thêm một luật nhỏ ở `settings/patch.rs`.

**Tech Stack:** React 19, zustand (vanilla store), TypeScript, vitest. **Không thêm thư viện nào.**

**Spec:** `docs/superpowers/specs/2026-11-11-ghi-chu-cuoc-hop-design.md` mục 2 (G2, G5, G7), 6, 7, 8, 9.

**Điều kiện trước:** kế hoạch 03 xong (lệnh `download_notes_pack`, `cancel_notes_download`, `delete_notes_pack`, `ModelsView.notes`, tham số `forceLocal` của `generate_notes`, ba mã lỗi mới).

**Quy ước:** như kế hoạch 03 (`W`, `T`, `CARGO_TARGET_DIR`). Test TS: `cd $W && npx vitest run <đường dẫn>`. Không push, không merge, không deploy.

## Global Constraints

- Mọi chuỗi giao diện qua i18n, đủ **vi, en, ja, zh, ko**; test `src/i18n/dictionaries.test.ts` phải xanh. Chữ vi trong kế hoạch này là chữ chốt; bốn ngôn ngữ còn lại dịch theo đúng nghĩa, dùng lại thuật ngữ mà từ điển của ngôn ngữ đó đang dùng ("Model trên máy", "Cài đặt", "Lịch sử", "Pro").
- Giao diện **không nêu tên model Local** (chỉ "Model trên máy"). Tên model cloud lấy từ cài đặt (`openaiModel`, `geminiModel`, `deepseekModel`) như Cài đặt > Model đang hiện.
- Màn hình không tự đổi `translationProvider`. Mọi việc đổi model làm ở Cài đặt > Model; màn hình chỉ dẫn tới đó bằng `navigate("settings", "model")`.
- Không tự chuyển nguồn khi Cloud lỗi (spec §7): chỉ hiện hai nút.
- Chữ ghi chú và chữ chép lời không vào `console.log`, không vào thông báo lỗi.
- Số đo trong cảnh báo Local, chép nguyên: "hơn 20 phút" (đo 1465 s chỉ CPU và 840 s với GPU tích hợp cho cuộc họp 60 phút, một máy).
- Không dùng `style=` nội tuyến cho bố cục mới nếu các màn hình cạnh nó dùng lớp CSS trong `src/styles/main.css`; theo đúng cách của `VoiceScreen.tsx`.

## Review Focus

1. Sự kiện `notes://changed` của một phiên khác với phiên đang chọn: không ghi đè kết quả đang hiện (Task 3).
2. Người dùng đang sửa tay thì việc tạo lại xong: bản nháp sửa tay không bị thay âm thầm; hiện lựa chọn (Task 3, Task 5).
3. `refs` trỏ tới câu không còn trong bản chép lời (phiên Lịch sử bị cắt): nút đối chiếu vẫn mở, chỉ tô các câu tìm thấy (Task 4).
4. Free hết 3 lần hay dùng thử hết hạn: nút tạo mờ kèm lời mời nâng cấp, không gọi `generate_notes` (Task 2, Task 5).
5. macOS (không có mục Giọng đọc): mục Ghi chú nằm ngay dưới Gõ dịch (Task 1).

## Cấu trúc file

| File | Việc |
|---|---|
| Sửa `$T/src/settings/patch.rs` | đổi nhà cung cấp dịch thì xóa đồng ý gửi Cloud |
| Sửa `src/lib/ipc.ts`, `src/windows/main/navigation.ts`, `navigation.test.ts`, `src/components/Icon.tsx`, `src/windows/main/Shell.tsx` | màn hình `notes` |
| Tạo `src/lib/notes.ts`, `src/lib/notes.test.ts` | hàm thuần: bước kế tiếp, nhãn nguồn, sửa mục |
| Tạo `src/store/notes.ts`, `src/store/notes.test.ts`; sửa `src/windows/main/dataStores.ts` | store |
| Tạo `src/windows/main/screens/NotesScreen.tsx`, `NotesScreen.test.ts` | màn hình |
| Tạo `src/windows/main/notes/NotesResult.tsx`, `NotesSourcePanel.tsx`, `NotesDialogs.tsx`, `NotesPackPanel.tsx` (+ test cạnh từng file) | các khối của màn hình |
| Sửa `src/i18n/{vi,en,ja,zh,ko}.ts`, `src/styles/main.css` | chuỗi, lớp CSS |
| Sửa `src/lib/fakeIpc.ts`, `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs` | IPC giả và trang xem trước |

---

### Task 0: Mốc ban đầu

- [ ] **Step 1:** Run: `cd $W && git status --short | wc -l && npx tsc --noEmit && npx vitest run 2>&1 | tail -4`
Expected: `0`; tsc không lỗi; mọi test PASS. Ghi số test làm mốc.

---

### Task 1: Luật đồng ý theo nhà cung cấp; mục điều hướng `notes`

**Files:** sửa `$T/src/settings/patch.rs`; `src/lib/ipc.ts`, `src/windows/main/navigation.ts`, `navigation.test.ts`, `src/components/Icon.tsx`, `src/windows/main/Shell.tsx`, năm file i18n

**Interfaces (Produces):**
- Rust: trong `patch::apply`, khi bản vá đổi `translation_provider` sang giá trị khác giá trị cũ **và** bản vá không tự đặt `notesCloudConsent`, kết quả có `notes_cloud_consent = false` (spec §9: hộp đồng ý hiện lại khi đổi nhà cung cấp).
- `Screen` thêm `"notes"`. `SCREENS`: `"notes"` đứng ngay sau `"voice"`. `ICONS.notes = "notes"`; `Icon.tsx` thêm đường vẽ `notes` (tờ giấy có ba dòng kẻ, cùng nét và khung 24×24 với các biểu tượng cạnh nó).
- `Shell.tsx`: `BODIES.notes = NotesScreen` (ở task này `NotesScreen` là thành phần tạm trả `EmptyState` với `t("notes.empty")`).
- i18n: `nav.notes` = "Ghi chú cuộc họp"; `notes.empty` = "Chưa có phiên nào để ghi chú. Dịch một cuộc họp rồi quay lại đây."

- [ ] **Step 1: Test đỏ.** `patch.rs`, cạnh `notes_settings_default_and_patch`:

```rust
#[test]
fn changing_the_translation_provider_withdraws_the_cloud_consent() {
    let mut d = current();
    d.translation_provider = TranslationProvider::Gemini;
    d.notes_cloud_consent = true;
    let s = apply(&d, &json!({ "translationProvider": "deepseek" })).unwrap();
    assert!(!s.notes_cloud_consent);
    let same = apply(&d, &json!({ "translationProvider": "gemini" })).unwrap();
    assert!(same.notes_cloud_consent);
    let both = apply(&d, &json!({ "translationProvider": "openai", "notesCloudConsent": true })).unwrap();
    assert!(both.notes_cloud_consent);
}
```

`navigation.test.ts`:

```ts
it("notes_sits_right_after_voice_on_windows_and_after_compose_on_macos", () => {
  const win = visibleScreens("windows");
  expect(win[win.indexOf("voice") + 1]).toBe("notes");
  const mac = visibleScreens("macos");
  expect(mac.includes("voice")).toBe(false);
  expect(mac[mac.indexOf("compose") + 1]).toBe("notes");
});
```

- [ ] **Step 2:** Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib settings::patch && npx vitest run src/windows/main/navigation.test.ts` → Expected: cả hai FAIL.
- [ ] **Step 3:** Cài. Tìm mọi nơi liệt kê màn hình bằng `git grep -n '"voice"' -- src src-tauri/src scripts/ui-preview` và thêm `"notes"` ở những nơi là danh sách `Screen` (kể cả chú thích tham số `screen=` của `tauri-mock.ts`).
- [ ] **Step 4:** Run: lệnh Step 2 rồi `npx tsc --noEmit && npx vitest run src/i18n` → Expected: PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): muc dieu huong Ghi chu cuoc hop; doi nha cung cap thi hoi lai dong y"`

---

### Task 2: `src/lib/notes.ts`: các quyết định thuần

**Files:** tạo `src/lib/notes.ts`, `src/lib/notes.test.ts`

**Interfaces (Produces):**

```ts
export type NotesSource = { kind: "local" } | { kind: "cloud"; provider: "openai" | "gemini" | "deepseek"; model: string };
export function sourceOf(s: Pick<Settings, "translationProvider" | "openaiModel" | "geminiModel" | "deepseekModel">): NotesSource;
// "Local", "ChatGPT · gpt-4o-mini", "Gemini · …", "DeepSeek · …"; Local lấy t("notes.source.local").
export function sourceLabel(source: NotesSource, t: Translate): string;

export interface GateInput {
  source: NotesSource;
  pack: NotesPackState;          // ModelsView.notes.state
  localAck: boolean;             // settings.notesLocalAck
  cloudConsent: boolean;         // settings.notesCloudConsent
  hasKey: boolean;               // key của nhà cung cấp đang chọn
  sessionActive: boolean;        // phiên đang starting hay running
  isCurrent: boolean;            // mục tiêu là phiên hiện tại
  lineCount: number;
  pro: boolean;
  freeLeft: number | null;       // NotesView.freeLeft
  existing: "none" | "generated" | "edited";
}
export type Gate =
  | { kind: "blocked"; reason: "empty" | "sessionRunning" | "localSessionActive" | "freeUsedUp" | "localUnavailable" | "packMissing" | "packDownloading" | "keyMissing" }
  | { kind: "ask"; dialog: "localSuggest" | "cloudConsent" | "overwrite" | "overwriteEdited" }
  | { kind: "go" };
export type AskDialog = "localSuggest" | "cloudConsent" | "overwrite" | "overwriteEdited";
export function gate(input: GateInput, confirmed: ReadonlySet<AskDialog>): Gate;

export function canExportFile(pro: boolean): boolean;                 // Markdown, TXT là Pro
export function withItem<K extends "decisions" | "actionItems" | "openQuestions">(notes: Notes, key: K, index: number, patch: Partial<Notes[K][number]> | null): Notes; // null: xóa mục
export function linesForRefs(lines: readonly Subtitle[], refs: readonly number[]): { seq: number; line: Subtitle }[]; // refs là số thứ tự từ 1; bỏ số không có
```

Thứ tự luật của `gate` (luật đầu tiên khớp thì trả):
1. `lineCount === 0` → `blocked/empty`.
2. `isCurrent && sessionActive` → `blocked/sessionRunning`.
3. `!pro && freeLeft === 0` → `blocked/freeUsedUp`.
4. Nguồn Local: `pack` `unavailable | ramTooLow` → `blocked/localUnavailable`; `missing` → `blocked/packMissing`; `downloading` → `blocked/packDownloading`; `sessionActive` → `blocked/localSessionActive`; `!localAck` và chưa xác nhận `localSuggest` → `ask/localSuggest`.
5. Nguồn Cloud: `!hasKey` → `blocked/keyMissing`; `!cloudConsent` và chưa xác nhận `cloudConsent` → `ask/cloudConsent`.
6. `existing === "edited"` và chưa xác nhận → `ask/overwriteEdited`; `existing === "generated"` và chưa xác nhận → `ask/overwrite`.
7. `go`.

- [ ] **Step 1: Test đỏ** (`notes.test.ts`), một `base: GateInput` hợp lệ (Cloud, có key, đã đồng ý, Pro, 3 câu, chưa có ghi chú → `go`) rồi mỗi test đổi một trường:
  - `gate_follows_the_rule_order` (bảng 14 dòng: mỗi luật ở trên một dòng, kèm một dòng hai luật cùng khớp để khóa thứ tự: `lineCount 0` thắng `freeUsedUp`; `keyMissing` thắng `cloudConsent`; `localSuggest` thắng `overwrite`)
  - `a_confirmed_dialog_is_not_asked_again` (`confirmed = new Set(["localSuggest"])` → đi tiếp tới luật 6)
  - `local_with_ack_skips_the_suggestion`
  - `source_of_reads_the_translation_provider` (bốn nhà cung cấp; model lấy đúng trường)
  - `with_item_edits_and_removes_without_mutating`
  - `lines_for_refs_skips_missing_numbers_and_keeps_order` (`refs [3, 99, 1]` trên 3 câu → seq `[3, 1]`)
- [ ] **Step 2:** Run: `npx vitest run src/lib/notes.test.ts` → Expected: FAIL (module chưa có).
- [ ] **Step 3:** Cài. **Step 4:** Run lại → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): luat quyet dinh cua man hinh ghi chu"`

---

### Task 3: Store

**Files:** tạo `src/store/notes.ts`, `src/store/notes.test.ts`; sửa `src/windows/main/dataStores.ts`, `src/lib/fakeIpc.ts`

**Interfaces (Consumes):** lệnh `get_notes`, `generate_notes`, `cancel_notes`, `save_notes`, `list_notes_sessions`, `notes_text`, `export_notes`, `list_history`, `get_transcript`, `get_history_session`, `update_settings`; sự kiện `NOTES_CHANGED`.

**Interfaces (Produces):**

```ts
export interface NotesTarget { ref: TranscriptRef; startedAt: number | null; hasNotes: boolean }
export interface NotesStoreState {
  targets: NotesTarget[];            // phiên hiện tại đứng đầu (nếu có câu), rồi Lịch sử mới nhất trước
  selected: TranscriptRef | null;
  view: NotesView | null;            // của `selected`
  draft: Notes | null;               // bản đang sửa tay; null khi không sửa
  dialog: "localSuggest" | "localWarning" | "cloudConsent" | "overwrite" | "overwriteEdited" | null;
  source: { ref: TranscriptRef; lines: Subtitle[]; refs: number[] } | null; // khung đối chiếu
  notice: { kind: "copied" } | { kind: "exported"; path: string } | null;
  error: UiError | null;
  init(): Promise<void>;             // nghe NOTES_CHANGED, nạp targets, chọn mục đầu
  select(ref: TranscriptRef): Promise<void>;
  request(input: GateInput, template: NotesTemplate, forceLocal?: boolean): Promise<void>; // chạy `gate`; ask → đặt dialog; go → generate
  confirm(input: GateInput, template: NotesTemplate, remember: boolean): Promise<void>;    // xác nhận dialog đang mở rồi chạy lại `request`
  dismiss(): void;
  cancel(): Promise<void>;
  edit(next: Notes): void;
  saveEdit(): Promise<void>;
  discardEdit(): void;
  openSource(refs: number[]): Promise<void>;
  closeSource(): void;
  copy(): Promise<void>;
  exportFile(format: ExportFormat): Promise<void>;
}
export function createNotesStore(deps: { ipc: Ipc; writeClipboard(text: string): Promise<void> }): StoreApi<NotesStoreState>;
```

Luật:
- `confirm` với `dialog === "localSuggest"` chuyển sang `dialog = "localWarning"` (không tạo); với `"localWarning"`: `remember` thì `update_settings({ notesLocalAck: true })`, rồi tạo; với `"cloudConsent"`: `update_settings({ notesCloudConsent: true })` rồi tạo; hai hộp ghi đè: tạo.
- Sự kiện `NOTES_CHANGED`: khác `selected` thì chỉ cập nhật `hasNotes` của mục tiêu đó khi `status === "idle"`; trùng `selected` thì gọi lại `get_notes`. Khi kết quả mới về mà `draft !== null`: giữ `draft`, không thay.
- `select` trong lúc `draft !== null`: bỏ `draft` (màn hình đã hỏi trước, Task 5).
- `request(…, forceLocal = true)`: người gọi truyền `input.source = { kind: "local" }` để `gate` áp luật của Local; store gửi `forceLocal: true` cho `generate_notes`.
- Lỗi của lệnh: `error = toUiError(e)`; `generate_notes` trả lỗi mã `notes*` thì giữ `view` cũ.
- `openSource`: phiên hiện tại dùng `get_transcript`, Lịch sử dùng `get_history_session`; chỉ nạp lại khi `ref` khác `source.ref`.
- `exportFile`: `utcOffsetMinutes = -new Date().getTimezoneOffset()`; kết quả `null` (người dùng đóng hộp lưu) thì không đặt `notice`.

- [ ] **Step 1: Test đỏ** với `Ipc` giả của `src/lib/fakeIpc.ts` (thêm vào đó các lệnh `notes` trả giá trị cấu hình được và hàm phát sự kiện, theo cách các lệnh `tts` đang làm):
  - `init_lists_the_current_session_first_then_history_newest_first`
  - `request_opens_the_dialog_the_gate_asks_for_and_does_not_generate`
  - `confirming_the_local_suggestion_shows_the_warning_before_generating`
  - `confirming_the_warning_with_remember_saves_the_ack_then_generates`
  - `confirming_cloud_consent_saves_it_then_generates`
  - `force_local_is_passed_to_generate_notes`
  - `a_change_event_for_another_target_does_not_replace_the_view`
  - `a_finished_job_does_not_replace_a_draft_being_edited`
  - `save_edit_sends_the_draft_and_clears_it`
  - `open_source_loads_the_right_transcript_once`
  - `copy_writes_the_markdown_to_the_clipboard_and_sets_the_notice`
  - `a_cancelled_save_dialog_sets_no_notice`
- [ ] **Step 2:** Run: `npx vitest run src/store/notes.test.ts` → Expected: FAIL (module chưa có).
- [ ] **Step 3:** Cài; `dataStores.ts` thêm `notesStore` và `useNotes` theo mẫu `ttsStore`/`useTts`.
- [ ] **Step 4:** Run lại → PASS; `npx tsc --noEmit` sạch.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): store cua man hinh ghi chu"`

---

### Task 4: Các khối hiển thị

**Files:** tạo `src/windows/main/notes/NotesResult.tsx`, `NotesSourcePanel.tsx`, `NotesDialogs.tsx`, `NotesPackPanel.tsx`, mỗi file một test cạnh nó; sửa năm file i18n, `src/styles/main.css`

Mỗi thành phần là hàm thuần nhận props (không đọc store), test bằng `renderToStaticMarkup` như `VoiceScreen.test.ts`.

**Interfaces (Produces):**
- `NotesResult(p: { notes: Notes; source: NotesProvider; edited: boolean; editing: boolean; onEdit(next: Notes): void; onOpenSource(refs: number[]): void })`: bốn khối theo thứ tự Tóm tắt, Quyết định, Việc cần làm, Câu hỏi mở. Khối rỗng hiện `notes.block.empty`. Mỗi mục có `refs` không rỗng có nút đối chiếu (`aria-label` = `notes.refs.open`, chữ hiện số câu đầu tiên, ví dụ "#12"); mục `refs` rỗng không có nút. Việc cần làm hiện `owner` và `due` khi không rỗng. `source === "local"`: huy hiệu `notes.draft.badge` cạnh tiêu đề và dòng `notes.draft.hint`. Mọi nguồn: dòng `notes.review.hint` dưới kết quả. `notes.raw === true`: chỉ khối Tóm tắt, kèm dòng `notes.raw.hint`. `editing`: mỗi chữ thành `<textarea>`/`<input>` và mỗi mục có nút xóa; sửa gọi `onEdit(withItem(…))`.
- `NotesSourcePanel(p: { lines: Subtitle[]; refs: number[]; onClose(): void })`: khung bên phải; mọi câu theo thứ tự, câu có số thứ tự trong `refs` mang lớp `is-ref` và `aria-current="true"`; mỗi câu hiện nhãn người nói (nếu có), câu gốc, và bản dịch khi khác câu gốc. Không có câu nào khớp: dòng `notes.source.missing`.
- `NotesDialogs(p: { dialog: NotesStoreState["dialog"]; provider: NotesSource; onConfirm(remember: boolean): void; onDismiss(): void; onOpenModelSettings(): void })`: `null` thì không vẽ gì. `localSuggest`: nút chính `notes.local.suggest.switch` (gọi `onOpenModelSettings`), nút phụ `notes.local.suggest.keep` (gọi `onConfirm(false)`). `localWarning`: ba ý cảnh báo, ô chọn `notes.local.warning.remember`, nút `notes.local.warning.go`. `cloudConsent`: nêu đúng tên nhà cung cấp (`OpenAI`, `Google`, `DeepSeek`). Hai hộp ghi đè: `notes.overwrite.*`.
- `NotesPackPanel(p: { pack: NotesPack; freeDiskBytes: number | null; onDownload(): void; onCancel(): void; onDelete(): void })`: theo `pack.state`: `unavailable` không vẽ gì; `ramTooLow` dòng `notes.pack.ramTooLow` (điền `minRamMib / 1024` làm tròn lên, đơn vị GB); `missing` dung lượng và nút tải; `downloading` thanh tiến độ `done / bytes` và nút hủy; `installed` dung lượng và nút xóa.

Chuỗi vi (chốt):

| Khóa | Chữ |
|---|---|
| `notes.source.using` | Đang dùng: {source} |
| `notes.source.local` | Model trên máy |
| `notes.source.change` | Đổi ở Cài đặt > Model |
| `notes.template.label` | Mẫu |
| `notes.template.meeting` / `.lecture` / `.brief` | Cuộc họp / Bài giảng / Tóm tắt ngắn |
| `notes.generate` / `notes.regenerate` | Tạo ghi chú / Tạo lại |
| `notes.cancel` | Hủy |
| `notes.progress` | Đang tạo ghi chú… {done}/{total} |
| `notes.block.summary` / `.decisions` / `.actions` / `.questions` | Tóm tắt / Quyết định / Việc cần làm / Câu hỏi mở |
| `notes.block.empty` | Không có mục nào. |
| `notes.action.owner` / `notes.action.due` | Người nhận: {owner} / Hạn: {due} |
| `notes.refs.open` | Xem câu gốc |
| `notes.source.title` | Câu gốc |
| `notes.source.missing` | Không tìm thấy câu gốc của mục này. |
| `notes.draft.badge` | Bản nháp |
| `notes.draft.hint` | Ghi chú này do model trên máy tạo, có thể sai người nhận, hạn hay thiếu ý. |
| `notes.review.hint` | Kiểm lại ghi chú trước khi gửi cho người khác. |
| `notes.raw.hint` | Model không trả đúng định dạng nên đây là chữ thô. Thử tạo lại. |
| `notes.edit` / `notes.edit.save` / `notes.edit.discard` | Sửa / Lưu / Bỏ thay đổi |
| `notes.item.remove` | Xóa mục này |
| `notes.copy` / `notes.copied` | Sao chép / Đã sao chép ghi chú. |
| `notes.export.md` / `notes.export.txt` | Xuất Markdown / Xuất TXT |
| `notes.exported` | Đã lưu: {path} |
| `notes.unsaved` | Phiên này chưa lưu vào Lịch sử nên ghi chú sẽ mất khi đóng app. Hãy sao chép hoặc xuất file. |
| `notes.free.left` | Còn {n} lần tạo ghi chú trong thời gian dùng thử. |
| `notes.free.usedUp` | Bạn đã dùng hết 3 lần tạo ghi chú của bản dùng thử. |
| `notes.blocked.sessionRunning` | Dừng phiên dịch rồi tạo ghi chú. |
| `notes.blocked.keyMissing` | Chưa có API key cho {provider}. Nhập key ở Cài đặt > Model. |
| `notes.local.suggest.title` | Dùng model cloud để ghi chú nhanh và chính xác hơn? |
| `notes.local.suggest.body` | Model dịch đang chọn là Model trên máy. Với ghi chú cuộc họp, model cloud (ChatGPT, Gemini, DeepSeek) nhanh hơn nhiều và ít sai hơn. |
| `notes.local.suggest.switch` | Chuyển sang model cloud |
| `notes.local.suggest.keep` | Vẫn dùng model trên máy |
| `notes.local.warning.title` | Trước khi dùng model trên máy |
| `notes.local.warning.resources` | Máy sẽ dùng nhiều CPU và RAM trong lúc tạo ghi chú. |
| `notes.local.warning.slow` | Tạo ghi chú chậm: có thể mất hơn 20 phút với cuộc họp dài khi máy không có GPU. |
| `notes.local.warning.errors` | Ghi chú có thể có sai sót, nhất là người nhận việc, hạn và câu hỏi mở. |
| `notes.local.warning.remember` | Không hỏi lại |
| `notes.local.warning.go` | Tạo ghi chú |
| `notes.consent.title` | Gửi bản dịch của phiên này tới {company}? |
| `notes.consent.body` | Để tạo ghi chú, app gửi bản dịch của phiên đã chọn, kèm nhãn người nói, tới {company} bằng API key của bạn. Âm thanh và câu gốc không được gửi. Không gì đi qua máy chủ của AI Translator. |
| `notes.consent.accept` | Đồng ý và tạo ghi chú |
| `notes.overwrite.title` | Ghi đè ghi chú hiện có? |
| `notes.overwrite.body` | Ghi chú hiện có của phiên này sẽ bị thay. |
| `notes.overwrite.edited` | Bạn đã sửa tay ghi chú này. Tạo lại sẽ mất các chỗ đã sửa. |
| `notes.overwrite.accept` | Tạo lại |
| `notes.error.retry` | Thử lại |
| `notes.error.useLocal` | Dùng model trên máy |
| `notes.pack.title` | Gói ghi chú trên máy |
| `notes.pack.size` | Dung lượng: {size} |
| `notes.pack.download` / `.cancel` / `.delete` | Tải gói / Hủy tải / Xóa gói |
| `notes.pack.ramTooLow` | Máy cần từ {gb} GB RAM để tạo ghi chú bằng model trên máy. Hãy chọn một model cloud ở Cài đặt > Model. |
| `notes.auto` | Tự tạo ghi chú khi phiên dịch dừng |
| `notes.settings.title` | Thiết lập |

- [ ] **Step 1: Test đỏ**, mỗi thành phần:
  - `NotesResult`: `local_results_carry_the_draft_badge_and_cloud_results_do_not`; `every_result_shows_the_review_hint`; `an_item_without_refs_has_no_source_button`; `raw_notes_show_only_the_summary`; `editing_turns_text_into_inputs_and_adds_remove_buttons`; `empty_blocks_say_so`.
  - `NotesSourcePanel`: `only_the_referenced_lines_are_marked`; `no_matching_line_shows_the_missing_note`; `the_translation_is_hidden_when_it_equals_the_original`.
  - `NotesDialogs`: `no_dialog_renders_nothing`; `the_local_suggestion_offers_switch_first_and_keep_second` (thứ tự hai nút trong markup); `the_local_warning_states_resources_speed_and_errors_and_has_remember`; `the_consent_names_the_selected_provider` (ba nhà cung cấp → "OpenAI", "Google", "DeepSeek"; không chứa hai tên còn lại); `the_edited_overwrite_warns_about_losing_edits`.
  - `NotesPackPanel`: năm trạng thái; `ramTooLow` với `minRamMib 15360` hiện "15 GB"; `downloading` với `done 1_370_468_944`, `bytes 2_740_937_888` có thanh `value="50"`.
- [ ] **Step 2:** Run: `npx vitest run src/windows/main/notes` → Expected: FAIL (module chưa có).
- [ ] **Step 3:** Cài bốn thành phần, thêm chuỗi vào năm từ điển, thêm lớp CSS (`.notes-*`) vào `main.css` theo biến trong `tokens.css`.
- [ ] **Step 4:** Run: `npx vitest run src/windows/main/notes src/i18n` → Expected: PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): cac khoi cua man hinh ghi chu, chuoi nam ngon ngu"`

---

### Task 5: `NotesScreen`

**Files:** tạo `src/windows/main/screens/NotesScreen.tsx`, `NotesScreen.test.ts`; sửa `src/windows/main/Shell.tsx`

**Interfaces (Produces):**
- `NotesScreenView(p: NotesScreenViewProps)`: phần hiển thị thuần. Props: `targets`, `selected`, `view`, `draft`, `dialog`, `sourcePanel`, `notice`, `error`, `source: NotesSource`, `gate: Gate` (đã tính từ `gate(input, ∅)`), `template`, `pack`, `freeDiskBytes`, `auto`, `pro`, `localUsable: boolean` (gói `installed`), và các hàm `on*`.
- `NotesScreen()`: nối `useNotes`, `useApp` (cài đặt, trạng thái phiên, `navigate`), store model (`ModelsView.notes`, `freeDiskBytes`), store license (`pro`), trạng thái key (lệnh có sẵn mà `ModelSettings.tsx` dùng để biết key đã nhập). Trong lúc `pack.state === "downloading"`: hỏi lại `get_models_state` mỗi 1 giây.

Bố cục, từ trên xuống (spec §7):
1. **Chọn phiên:** danh sách `targets`; mục đang chọn có `aria-current`; mục có ghi chú có dấu. Free: chỉ phiên hiện tại; các phiên Lịch sử không hiện. Đổi phiên khi `draft !== null`: hỏi `notes.edit.discard` trước.
2. **Thanh tạo:** chọn mẫu; dòng `notes.source.using` kèm liên kết `notes.source.change` (gọi `navigate("settings", "model")`); nút `notes.generate` (đã có ghi chú thì `notes.regenerate`). `gate.kind === "blocked"`: nút `disabled` và hiện lý do (`notes.blocked.*`, hay câu `error.notes*` cùng nghĩa đã có); `freeUsedUp` kèm nút tới màn hình Nâng cấp; `packMissing`, `packDownloading` mở sẵn khối Thiết lập. Đang chạy: `notes.progress` và nút `notes.cancel`. Free còn lượt: `notes.free.left`.
3. **Kết quả:** `NotesResult`; nút Sửa/Lưu/Bỏ; `view.persisted === false` và có ghi chú: dòng `notes.unsaved`. Khung `NotesSourcePanel` bên phải khi mở.
4. **Xuất:** Sao chép (mọi gói); Markdown, TXT: không Pro thì bọc bằng `ProLocked` như màn hình Bản chép lời.
5. **Thiết lập** (`<details>`): `NotesPackPanel`; công tắc `notes.auto` (`update_settings({ notesAuto })`).
6. **Lỗi của việc** (`view.status === "failed"`): câu `error.<mã>`; mã thuộc `notesOffline`, `notesAuthFailed`, `notesRateLimited`, `notesNoBalance`, `notesCloudFailed`, `notesKeyMissing` thì hai nút: `notes.error.retry` và, chỉ khi `localUsable`, `notes.error.useLocal` (gọi `request(…, forceLocal = true)`). `notesPausedForSession`: chỉ nút tạo lại.

- [ ] **Step 1: Test đỏ** (`NotesScreen.test.ts`, bộ `props()` như `VoiceScreen.test.ts`):
  - `shows_the_model_in_use_with_a_link_to_model_settings` (Cloud DeepSeek → chứa "Đang dùng: DeepSeek · deepseek-flash" và "Đổi ở Cài đặt > Model")
  - `local_source_never_shows_a_model_file_name` (markup không chứa "gguf", "Qwen")
  - `a_blocked_gate_disables_generate_and_says_why` (bảng: tám lý do → nút `disabled` và câu tương ứng)
  - `free_used_up_offers_the_upgrade_screen`
  - `free_users_only_see_the_current_session`
  - `running_shows_progress_and_cancel_instead_of_generate`
  - `a_cloud_failure_offers_retry_and_local_only_when_the_pack_is_installed` (hai trường hợp `localUsable`)
  - `a_pause_for_session_failure_offers_only_regenerate`
  - `unsaved_session_notes_carry_the_warning`
  - `file_export_is_pro_and_copy_is_not`
  - `the_source_panel_renders_beside_the_result_when_open`
- [ ] **Step 2:** Run: `npx vitest run src/windows/main/screens/NotesScreen.test.ts` → Expected: FAIL.
- [ ] **Step 3:** Cài; `Shell.tsx` dùng `NotesScreen` thật.
- [ ] **Step 4:** Run: `npx tsc --noEmit && npx vitest run 2>&1 | tail -4` → Expected: PASS toàn bộ.
- [ ] **Step 5:** `git add -A && git commit -m "feat(ghi-chu): man hinh Ghi chu cuoc hop"`

---

### Task 6: Trang xem trước và kiểm chuỗi tràn

**Files:** sửa `scripts/ui-preview/tauri-mock.ts`, `scripts/ui-preview/check-i18n.mjs`

- [ ] **Step 1:** `tauri-mock.ts`: thêm các lệnh `notes` và ba lệnh gói ghi chú; tham số URL `notes=empty|ready|draft|running|failed|consent|localWarning` chọn cảnh (ghi chú mẫu bốn khối, ba việc cần làm, một việc không có `refs`); `ModelsView.notes` theo `pack=installed|missing|downloading|ramTooLow`.
- [ ] **Step 2:** `check-i18n.mjs`: thêm các cảnh `["notes", "screen=notes&notes=ready"]`, `["notes-draft", "screen=notes&notes=draft&provider=local&pack=installed"]`, `["notes-local-warning", "screen=notes&notes=localWarning&provider=local&pack=installed"]`, `["notes-consent", "screen=notes&notes=consent&provider=deepseek"]`, `["notes-pack", "screen=notes&notes=empty&provider=local&pack=downloading"]`, theo đúng dạng các cảnh `voice`.
- [ ] **Step 3:** Run: `pnpm exec vite --config scripts/ui-preview/vite.config.ts` (nền) rồi `node scripts/ui-preview/check-i18n.mjs notes notes-draft notes-local-warning notes-consent notes-pack`
Expected: năm cảnh × năm ngôn ngữ không báo chữ tràn, không báo khóa thiếu. Máy không có Chrome cho script: ghi lại là chưa chạy được và báo chủ dự án, không bỏ qua trong im lặng.
- [ ] **Step 4:** `git add -A && git commit -m "test(ghi-chu): canh xem truoc cua man hinh ghi chu"`

---

### Task 7: Kiểm cuối và thử tay

- [ ] **Step 1:** Run: `cd $W && cargo test --manifest-path src-tauri/Cargo.toml --lib 2>&1 | tail -3 && cargo clippy --manifest-path src-tauri/Cargo.toml --lib --tests 2>&1 | tail -3 && npx tsc --noEmit && npx vitest run 2>&1 | tail -4` → Expected: 0 failed; clippy sạch.
- [ ] **Step 2: Thử tay bản debug** (`pnpm tauri dev`, cần chủ dự án hay một phiên có màn hình). Danh sách:
  1. Chọn DeepSeek ở Cài đặt > Model, dịch một đoạn 2 phút, dừng, mở Ghi chú cuộc họp: thấy "Đang dùng: DeepSeek · …"; bấm Tạo → hộp đồng ý nêu "DeepSeek" → ghi chú hiện trong vài giây.
  2. Bấm số câu ở một việc cần làm: khung Câu gốc mở, câu được tô.
  3. Sửa một mục, Lưu, mở lại app (phiên đã lưu Lịch sử): bản sửa còn.
  4. Đổi sang Gemini rồi bấm Tạo lại: hộp đồng ý hiện lại, nêu "Google".
  5. Chọn Model trên máy: bấm Tạo → hộp gợi ý → "Vẫn dùng model trên máy" → cảnh báo ba ý.
  6. Sao chép, Xuất Markdown.
  Mục nào không thử được thì ghi rõ lý do; không đánh dấu xong.
