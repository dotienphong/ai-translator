# Nghe dịch trực tiếp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nút "Nghe dịch" trên overlay: hạ âm lượng riêng của các ứng dụng khác (Windows), đọc thành tiếng bản dịch của tiếng máy (không đọc lời micro), không ảnh hưởng tính năng hiện có và không làm app crash.

**Architecture:** Crate mới `audio-ducking` (hạ/trả âm lượng qua trait `Backend`, sổ khôi phục ra đĩa), bộ bù mức `agc` trong `audio-capture` gắn vào `capture.rs::Pre::drain` sau một cờ nguyên tử, dịch vụ `listen.rs` trong `src-tauri` (luồng riêng, `catch_unwind`, lệnh Tauri), và store `listen` ở overlay (hàng đợi đọc, quy tắc nguồn) dùng lại `ttsStore`.

**Tech Stack:** Rust 2024 (crate `windows` 0.62.2 đã có), Tauri 2, React 19, zustand vanilla, vitest. Không thêm thư viện mới.

**Spec:** `docs/superpowers/specs/2026-11-02-nghe-dich-truc-tiep-design.md` (đọc kèm `2026-11-02-doc-ban-dich-tts-design.md`).

## Global Constraints

- Mặc định tắt; không lưu trạng thái "bật" qua lần mở app (chỉ mức thanh trượt nhớ lại, trong `localStorage` của overlay, bọc try/catch).
- Khi tắt, không mã mới nào được đổi hành vi hay độ trễ của đường thu → nhận dạng → dịch → phụ đề (có test đầu ra bit-bit).
- Mã mới không `unwrap`/`expect`/`panic` trên đường chạy; COM chạy trên một luồng riêng bọc `catch_unwind`; lỗi ⇒ trả âm lượng, tự tắt, mã lỗi `listenFailed`.
- Không đụng micro, thiết bị thu, âm lượng chung. Hạ mọi phiên âm thanh trừ cây tiến trình của app (gồm WebView2 con).
- Mức đặt: `session_scalar(level) = (level/100)²`, mặc định level 10. Hỏi phiên mới mỗi 500 ms. AGC tối đa +20 dB (hệ số ≤ 10).
- Chỉ ngôn ngữ đích `vi`/`en`; câu quá 4000 byte hoặc rỗng bỏ qua (như `tts.rs`).
- macOS: lệnh trả `supported: false`, UI ẩn nút. Không thêm sidecar, không thêm crate ngoài.
- Chuỗi giao diện đủ 5 ngôn ngữ (en/vi/ja/zh/ko), test parity i18n phải pass. Lệnh Tauri mới thêm đủ ba chỗ (handler, `build.rs`, `capabilities/main.json`, và `MAIN_COMMANDS`).
- Commit chỉ khi người dùng đã cho phép commit (các bước "Commit" bên dưới tuân theo điều này). Thư mục `models/` bị gitignore.

## Review Focus

1. Sập/kill app giữa lúc đang hạ âm ⇒ lần mở sau trả đúng âm lượng gốc (Task 1, 4).
2. Người dùng tự kéo âm lượng một ứng dụng trong lúc đang hạ ⇒ không ghi đè mức người dùng vừa đặt khi trả (Task 1).
3. Ứng dụng họp mở/đóng phiên âm thanh giữa chừng, phiên biến mất khi trả ⇒ không lỗi (Task 1).
4. Sổ khôi phục hỏng/cụt/rỗng ⇒ bỏ qua, không crash (Task 1).
5. Câu chưa có nhãn giọng, giọng đổi/gộp sau khi đã xếp hàng, hàng đợi dồn hàng chục câu, tắt nút giữa lúc đang đọc ⇒ đúng quy tắc, không đọc nhầm lời micro, không kẹt (Task 5, 6).

---

### Task 1: Crate `audio-ducking` (lõi, sổ khôi phục, đường cong)

**Files:**
- Create: `crates/audio-ducking/Cargo.toml`, `crates/audio-ducking/src/lib.rs`, `crates/audio-ducking/src/journal.rs`
- Test: trong cùng file (`#[cfg(test)]`) và `crates/audio-ducking/tests/ducker.rs`

**Interfaces:**
- Produces:
  - `pub struct SessionId(pub String);` (`Clone, PartialEq, Eq, Hash, Debug`)
  - `pub struct SessionInfo { pub id: SessionId, pub pid: u32, pub exe: String, pub volume: f32, pub muted: bool }`
  - `pub enum BackendError { Gone, Failed(String) }`
  - `pub trait Backend: Send { fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError>; fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError>; }`
  - `pub fn session_scalar(level: u8) -> f32`
  - `pub struct Ducker<B: Backend>` với `new(backend: B, journal: PathBuf, own_pids: Box<dyn FnMut() -> HashSet<u32> + Send>) -> Self`, `engage(&mut self, level: u8) -> Result<(), BackendError>`, `tick(&mut self) -> Result<(), BackendError>`, `release(&mut self)`, `restore_stale(&mut self)`, `is_engaged(&self) -> bool`
  - Journal: `journal::Entry { id: String, pid: u32, exe: String, original: f32, applied: f32 }`, `journal::write(path: &Path, entries: &[Entry]) -> std::io::Result<()>` (ghi tạm + đổi tên), `journal::read(path: &Path) -> Vec<Entry>` (hỏng/không có ⇒ rỗng)

- [ ] **Step 1: Tests (fake backend `FakeBackend` trong test, giữ danh sách phiên và nhật ký lệnh)**
  - `session_scalar_curve`: `0→0.0`, `100→1.0`, `50→0.25`, `10→0.01`, `255→1.0` (kẹp).
  - `engage_ducks_all_but_own`: phiên pid 1 (app), 2 (con của app, có trong `own_pids`), 3, 4 ⇒ chỉ 3 và 4 được `set_volume(session_scalar(10))`; sổ ghi đúng `original`.
  - `tick_ducks_new_session`: sau `engage`, thêm phiên 5 vào backend, `tick()` ⇒ phiên 5 bị hạ và vào sổ; phiên cũ không bị đặt lại lần hai.
  - `release_restores_original`: sau `release()`, phiên 3, 4 về `original`; sổ bị xóa; `is_engaged() == false`.
  - `release_skips_if_user_changed`: người dùng đổi volume phiên 3 thành 0.7 trong lúc hạ ⇒ `release()` không đụng phiên 3 (volume còn 0.7), vẫn trả phiên 4.
  - `release_ignores_gone_session`: phiên 4 biến mất ⇒ `release()` không lỗi, trả phiên 3.
  - `restore_stale_from_journal`: sổ có 2 mục, backend còn một phiên đúng `id`+`pid`+`exe` với `volume == applied` ⇒ `restore_stale()` trả về `original`; phiên khác pid/exe thì không đụng.
  - `corrupt_journal_is_empty`: file rác, cụt, rỗng ⇒ `journal::read` trả `[]` và `restore_stale()` không panic.
  - `backend_error_during_engage_releases`: `set_volume` trả `Failed` ở phiên thứ hai ⇒ `engage` trả `Err` và đã trả phiên thứ nhất.
- [ ] **Step 2: Run** `cargo test -p audio-ducking` — Expected: FAIL (crate chưa có).
- [ ] **Step 3: Implement** theo Interfaces. `engage`: đọc phiên, loại `own_pids()` (gọi lại mỗi lần `engage`/`tick`), ghi sổ **trước** khi `set_volume`, rồi đặt; `release`: với mỗi mục sổ còn phiên tương ứng và `|volume − applied| < 0.02` thì `set_volume(original)`; xóa sổ. Phiên muted gốc giữ nguyên cờ (không đổi muted). Không `unwrap`; lỗi `Gone` bỏ qua.
- [ ] **Step 4: Run** `cargo test -p audio-ducking` — Expected: PASS; `cargo clippy -p audio-ducking --all-targets -- -D warnings` sạch.
- [ ] **Step 5: Commit** `feat(audio-ducking): lõi hạ và trả âm lượng từng ứng dụng, sổ khôi phục`

### Task 2: Backend WASAPI và cây tiến trình (Windows)

**Files:**
- Create: `crates/audio-ducking/src/windows.rs` (`#[cfg(windows)]`, khai báo ở `lib.rs`)
- Modify: `crates/audio-ducking/Cargo.toml` (phụ thuộc `windows` 0.62.2 cùng feature như `audio-capture` cộng `Win32_System_Diagnostics_ToolHelp`, `Win32_System_Threading`)

**Interfaces:**
- Consumes: `Backend`, `SessionInfo`, `SessionId`, `BackendError` (Task 1).
- Produces: `pub struct WasapiBackend`; `WasapiBackend::new() -> Result<WasapiBackend, BackendError>` (khởi tạo COM `COINIT_MULTITHREADED` trên luồng gọi, lấy thiết bị phát **Console và Communications**); `impl Backend for WasapiBackend`; `pub fn own_process_tree() -> HashSet<u32>` (pid của app và mọi hậu duệ, qua `CreateToolhelp32Snapshot`).

- [ ] **Step 1: Test** (`#[cfg(windows)]`, đánh dấu `#[ignore]` vì cần thiết bị âm thanh): `own_process_tree_contains_self_and_child` (spawn `cmd /c timeout 2`, kiểm pid con có trong tập); `wasapi_lists_sessions` (không lỗi, trả `Vec`).
- [ ] **Step 2: Run** `cargo test -p audio-ducking --release -- --ignored` trên máy Windows (`.cmd` + log, như `run-test.cmd`) — Expected: FAIL (chưa có).
- [ ] **Step 3: Implement** `WasapiBackend`: `sessions()` liệt kê qua `IAudioSessionManager2::GetSessionEnumerator` của cả hai thiết bị, `SessionId` = chuỗi `GetSessionInstanceIdentifier`, `exe` từ `QueryFullProcessImageNameW` (rỗng nếu không mở được), bỏ phiên hệ thống (`IsSystemSoundsSession`); `set_volume` qua `ISimpleAudioVolume::SetMasterVolume(scalar, null)`; phiên không còn ⇒ `Gone`. Không giữ callback COM. Mọi `windows::core::Error` đổi thành `BackendError::Failed(String)` chỉ chứa mã HRESULT.
- [ ] **Step 4: Run** như Step 2 — Expected: PASS; `cargo clippy -p audio-ducking --all-targets -- -D warnings` sạch (Windows).
- [ ] **Step 5: Commit** `feat(audio-ducking): backend WASAPI và cây tiến trình của app`

### Task 3: Bộ bù mức thu (AGC) và cờ trong `capture.rs`

**Files:**
- Create: `crates/audio-capture/src/agc.rs` (khai báo `pub mod agc;` ở `lib.rs`)
- Modify: `src-tauri/src/capture.rs` (`Pre::drain`, cạnh nhánh `tts::is_playing()`)
- Test: trong `agc.rs`; `src-tauri/src/capture.rs` (mô-đun test sẵn có)

**Interfaces:**
- Produces: `pub struct Agc` với `Agc::new() -> Agc`, `pub fn process(&mut self, samples: &mut [f32], engaged: bool)` (16 kHz, khung bất kỳ), `pub const MAX_GAIN: f32 = 10.0`; `pub fn gain(&self) -> f32`.
- Consumes (Task 4): `crate::listen::is_engaged() -> bool`.

- [ ] **Step 1: Tests (`agc.rs`)**
  - `off_is_bit_exact`: `engaged=false`, tín hiệu ngẫu nhiên cố định ⇒ đầu ra bằng đầu vào bit-bit, `gain()==1.0`.
  - `learns_baseline_then_restores_level`: 10 s sin biên độ 0.2 với `engaged=false` rồi sin 0.02 với `engaged=true` ⇒ sau 3 s RMS đầu ra ∈ [0.17, 0.23] (≈ 0.2).
  - `gain_capped`: biên độ còn 0.001 so với baseline 0.2 ⇒ `gain() <= 10.0`.
  - `no_clipping`: đầu ra luôn trong [-1, 1].
  - `silence_keeps_gain`: im lặng (RMS < 1e-4) không làm hệ số tăng vọt.
  - `release_resets`: `engaged` về false ⇒ `gain()` về 1.0 ngay và mẫu không bị sửa.
- [ ] **Step 2: Run** `cargo test -p audio-capture agc` — Expected: FAIL.
- [ ] **Step 3: Implement** `Agc`: khi `!engaged` cập nhật baseline = EMA của RMS khung 10 ms có tiếng (RMS ≥ 1e-3), hằng số ~10 s, không sửa mẫu, `gain=1`; khi `engaged` ước lượng RMS hiện tại cũng bằng EMA trên khung có tiếng, hệ số đích = `clamp(baseline/current, 1.0, MAX_GAIN)`, làm mượt tối đa 0.5 dB mỗi khung 10 ms, nhân mẫu rồi kẹp [-1, 1].
- [ ] **Step 4: Gắn vào `capture.rs`**: thêm `agc_asr: Agc`, `agc_vad: Agc` vào `Pre`; trong `drain`, **sau** nhánh `is_playing()`: `let eng = crate::listen::is_engaged(); self.agc_asr.process(&mut f.asr[asr_from..], eng); self.agc_vad.process(&mut f.vad[vad_from..], eng);`. Test: `drain_unchanged_when_listen_off` (dùng khung tổng hợp; đầu ra bằng đầu ra khi chưa có AGC, bit-bit) và `drain_boosts_when_engaged` (đặt cờ giả qua hàm test của `listen`).
- [ ] **Step 5: Run** `cargo test -p audio-capture` và, trên Windows (`CARGO_TARGET_DIR=C:\mt-check-target`), `cargo test -p meeting-translator --lib capture` — Expected: PASS, test capture cũ không đổi.
- [ ] **Step 6: Commit** `feat(capture): bù mức thu khi đang hạ âm lượng họp, sau cờ nguyên tử`

### Task 4: Dịch vụ `listen.rs`, lệnh Tauri, khôi phục lúc khởi động và thoát

**Files:**
- Create: `src-tauri/src/listen.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod listen;`, `app.manage(listen::ListenService::default())`, gọi `listen::restore_on_start(&app)` và, ở `on_exit`, `listen::release_on_exit(&app)`), `src-tauri/src/commands.rs` (hai lệnh, `MAIN_COMMANDS`, `handler()`), `src-tauri/build.rs`, `src-tauri/capabilities/main.json` (`allow-listen-set`, `allow-listen-status`; **cả overlay cũng phải được phép**, xem `capabilities/overlay.json`), `src-tauri/Cargo.toml` (`audio-ducking = { path = "../crates/audio-ducking" }`), `src-tauri/src/state.rs` (`OverlayView.capture_mode: CaptureMode`, điền trong `from_settings`)
- Test: `src-tauri/src/listen.rs` (`#[cfg(test)]`, backend giả), `acl_tests`

**Interfaces:**
- Consumes: `Ducker`, `Backend`, `WasapiBackend`, `own_process_tree` (Task 1–2).
- Produces:
  - `#[derive(Serialize, Clone)] #[serde(rename_all = "camelCase")] pub struct ListenStatus { pub supported: bool, pub active: bool }`
  - `pub fn is_engaged() -> bool` (cờ `AtomicBool`, Task 3 dùng)
  - lệnh `listen_set(enabled: bool, level: u8) -> Result<ListenStatus, CommandError>`, `listen_status() -> ListenStatus`
  - sự kiện `listen://state`: `{ active: bool, error: string | null }` (`error` ∈ `listenFailed`, `listenUnsupported`)
  - `pub fn restore_on_start<R: Runtime>(app: &AppHandle<R>)`, `pub fn release_on_exit<R: Runtime>(app: &AppHandle<R>)`

- [ ] **Step 1: Tests** (với `Backend` giả, hàm lõi `run_loop` tách khỏi Tauri để test): `enable_sets_flag_and_ducks`; `disable_releases_and_clears_flag`; `backend_error_turns_off_and_emits_listen_failed`; `panic_in_backend_is_caught_and_releases` (backend giả `panic!` ⇒ không lan ra ngoài, cờ về false, âm lượng trả); `tick_runs_every_500ms` (đồng hồ giả); `set_while_active_changes_level_without_restoring_original` (đổi mức giữa chừng: `original` trong sổ không bị ghi đè bằng mức đang hạ); `restore_on_start_uses_journal`; `non_windows_reports_unsupported`. `acl_tests` đã đòi mọi lệnh có trong ba nơi: thêm tên vào `MAIN_COMMANDS`.
- [ ] **Step 2: Run** `cargo test -p meeting-translator --lib listen` (Windows, `.cmd` + log) — Expected: FAIL.
- [ ] **Step 3: Implement** `ListenService { tx: Mutex<Option<Sender<Cmd>>> }`: `listen_set(true, level)` tạo (lười) một luồng `std::thread` tên `listen`; luồng tạo `Ducker<WasapiBackend>` (Windows) bên trong luồng, vòng `recv_timeout(500ms)` ⇒ `tick`; toàn bộ thân bọc `std::panic::catch_unwind(AssertUnwindSafe(..))`; lỗi/panic ⇒ `release`, `ENGAGED=false`, phát `listen://state` với `error`. `release` luôn chạy khi luồng thoát (`Drop` của một guard). Sổ ở `app_local_data_dir()/listen-duck.json`. Không Windows ⇒ `listen_set` trả `Ok(ListenStatus{supported:false,active:false})` và phát `listenUnsupported`. Thêm `capture_mode` vào `OverlayView` (và test `OverlayView::from_settings`).
- [ ] **Step 4: Run** như Step 2 và `cargo test -p meeting-translator --lib acl` — Expected: PASS; `cargo check -p meeting-translator --lib --tests` sạch.
- [ ] **Step 5: Commit** `feat(app): dịch vụ Nghe dịch (hạ âm lượng, khôi phục lúc khởi động và thoát)`

### Task 5: Quy tắc nguồn và hàng đợi (hàm thuần, TypeScript)

**Files:**
- Create: `src/lib/listenSource.ts`, `src/lib/listenSource.test.ts`, `src/lib/listenQueue.ts`, `src/lib/listenQueue.test.ts`

**Interfaces:**
- Produces:
  - `export const LABEL_WAIT_MS = 1500;`
  - `export type Decision = "read" | "skip" | "wait";`
  - `export function decide(line: Subtitle, voices: VoiceMap, captureMode: CaptureMode, ageMs: number): Decision` — `playback` ⇒ `read`; `mic` ⇒ `skip`; `both`: `speaker==null` và `ageMs < LABEL_WAIT_MS` ⇒ `wait`, `speaker==null` quá hạn ⇒ `read`, giọng `room` ⇒ `skip`, còn lại `read` (theo `mergedInto` nếu giọng đã gộp)
  - `export function isReadable(line: Subtitle, targetLang: string): boolean` — `status === "done"`, `!provisional`, `tgt_text.trim()` không rỗng và ≤ 4000 byte UTF-8, `canSpeakLang(targetLang)`
  - `export interface Queue { items: QueuedLine[]; seen: ReadonlySet<number> }`, `QueuedLine { id: number; text: string; since: number }`
  - `export function enqueue(q: Queue, line: Subtitle, now: number): Queue` (bỏ qua id đã `seen`), `export function dequeue(q: Queue): [QueuedLine | null, Queue]`, `export function skipToLatest(q: Queue): Queue` (giữ đúng câu mới nhất), `export function clear(q: Queue): Queue` (giữ `seen`)

- [ ] **Step 1: Tests (`listenSource.test.ts`)**: `playback_reads_everything`; `mic_mode_skips_everything`; `both_room_voice_skipped`; `both_non_room_voice_read`; `both_unlabelled_waits_then_reads` (`ageMs` 1499 ⇒ `wait`, 1500 ⇒ `read`); `merged_voice_uses_target_room_flag`; `readable_requires_done_final_nonempty` (provisional/`translating`/`failed`/rỗng/4001 byte đều false; `vi` và `en` true, `ko` false). **Tests (`listenQueue.test.ts`)**: `keeps_order`; `ignores_duplicate_id`; `skip_keeps_only_latest`; `clear_keeps_seen_so_old_lines_dont_replay`; `dequeue_empty_returns_null`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/listenSource.test.ts src/lib/listenQueue.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** theo Interfaces (dùng `VoiceMap`, `canSpeakLang` đã có ở `src/lib/speakers.ts`, `src/lib/tts.ts`).
- [ ] **Step 4: Run** như Step 2 — Expected: PASS.
- [ ] **Step 5: Commit** `feat(overlay): quy tắc nguồn và hàng đợi cho Nghe dịch`

### Task 6: Store `listen`, kiểu IPC, nối `ttsStore`

**Files:**
- Create: `src/store/listen.ts`, `src/store/listen.test.ts`
- Modify: `src/lib/ipc.ts` (kiểu `ListenStatus`, `ListenState`, hai lệnh, sự kiện `listen://state`, trường `captureMode` của `OverlayView`), `src/lib/fakeIpc.ts` (nếu lệnh phải có handler mặc định), `src/windows/overlay/overlay.tsx` (khởi tạo store)
- Modify: `src-tauri/capabilities/overlay.json` (thêm `allow-tts-status`, `allow-tts-warmup`, `allow-tts-speak`, `allow-tts-cancel`, `allow-tts-mark-playing`, `allow-tts-stop`; hiện chỉ `main.json` có), kèm kiểm tra `acl_tests` cho cửa sổ overlay
- Create: `src/windows/overlay/ttsStore.ts` (một `createTtsStore` riêng của cửa sổ overlay, dựng như `ttsStore` ở `src/windows/main/dataStores.ts`: `TtsPlayer` + `Channel`; cửa sổ overlay là WebView riêng nên không dùng chung store với cửa sổ chính)

**Interfaces:**
- Consumes: `decide`, `isReadable`, queue (Task 5); `ttsStore` (`speak(lineId, text, lang)`, `stop()`, trạng thái `speaking`, `error`), `createOverlayStore` state (`lines`, `voices`, `view.captureMode`, `view` ngôn ngữ đích), lệnh `listen_set`, `listen_status` (Task 4).
- Produces: `createListenStore(deps: { ipc: Ipc; tts: StoreApi<TtsStoreState>; overlay: StoreApi<OverlayState>; now: () => number; storage: Pick<Storage, "getItem" | "setItem"> })`; state `{ supported: boolean; active: boolean; level: number; pending: number; error: string | null; unresolved: boolean }`; actions `init(): Promise<void>`, `toggle(): Promise<void>`, `setLevel(level: number): Promise<void>`, `skip(): void`, `dismiss(): void`.

- [ ] **Step 1: Tests (`listen.test.ts`, `fakeIpc`, store giả)**:
  - `toggle_on_calls_listen_set_and_starts_reading_new_lines` (chỉ câu **mới** sau khi bật; câu cũ không phát lại).
  - `reads_one_at_a_time_in_order`: ba câu `done` ⇒ `tts.speak` gọi lần lượt, câu sau chỉ sau khi `speaking` về `null`.
  - `mic_line_not_read`: `captureMode=both`, giọng `room` ⇒ không gọi `speak`.
  - `unlabelled_line_waits_then_reads` (đồng hồ giả 1500 ms).
  - `skip_clears_pending_and_continues_with_latest`.
  - `toggle_off_stops_tts_clears_queue_and_calls_listen_set_false`.
  - `listen_failed_event_turns_off_and_sets_error`.
  - `tts_error_does_not_block_queue`: lỗi `ttsFailed` ở một câu ⇒ vẫn đọc câu sau, `error` được hiện.
  - `level_persists_in_storage_and_survives_storage_throwing` (`storage.setItem` ném ⇒ không lỗi).
  - `unsupported_platform_hides_active` (`listen_status` trả `supported:false`).
  - `unresolved_note_when_both_mode_without_any_speaker_labels` (`unresolved === true` sau 3 câu `both` không nhãn).
- [ ] **Step 2: Run** `pnpm exec vitest run src/store/listen.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement**: đăng ký `overlay.subscribe` để lấy câu mới đủ điều kiện (`isReadable`) và hỏi `decide` mỗi lần `lines`/`voices` đổi và mỗi 250 ms khi còn câu `wait`; bơm hàng đợi vào `tts.speak` khi `tts.getState().speaking === null`. Mọi `ipc.invoke` bọc `.catch` ⇒ đặt `error: "listenFailed"`; không ném ra ngoài store. Mức `level` lưu `localStorage["listen.level"]` (mặc định 10).
- [ ] **Step 4: Run** `pnpm exec tsc --noEmit` và `pnpm test` — Expected: PASS, toàn bộ test cũ vẫn pass.
- [ ] **Step 5: Commit** `feat(overlay): store Nghe dịch nối hàng đợi với giọng đọc`

### Task 7: Giao diện overlay, i18n, CSS

**Files:**
- Create: `src/windows/overlay/ListenControls.tsx`, `src/windows/overlay/ListenControls.test.ts`
- Modify: `src/windows/overlay/overlay.tsx` (đặt `ListenControls` trên thanh, chỉ khi `supported`), `src/windows/overlay/overlay.css` (+ `overlay.css.test.ts` nếu test đòi quy tắc), `src/i18n/{en,vi,ja,zh,ko}.ts`

**Interfaces:**
- Consumes: `listenStore` (Task 6), `canSpeakLang`, `ttsStore.status`.
- Produces: component `ListenControls({ store, targetLang, ttsAvailable, t })`; khóa i18n `overlay.listen.toggle`, `overlay.listen.level`, `overlay.listen.pending` (`{n}`), `overlay.listen.skip`, `overlay.listen.noTts`, `overlay.listen.unsupportedLang`, `overlay.listen.unresolved`, `error.listenFailed`.

- [ ] **Step 1: Tests (`ListenControls.test.ts`, kiểu như `SpeakerAsk.test.ts`)**: nút mờ kèm lý do khi `!ttsAvailable`, khi ngôn ngữ đích không phải vi/en, khi `captureMode=mic`; bật ⇒ hiện thanh mức, "còn N câu" và nút Bỏ qua chỉ khi `pending > 0`; lỗi ⇒ thông báo và nút về tắt; thanh mức gọi `setLevel`; ẩn hoàn toàn khi `supported=false`.
- [ ] **Step 2: Run** `pnpm exec vitest run src/windows/overlay/ListenControls.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** component (nút `aria-pressed`, thanh `<input type="range" min=0 max=100>`), CSS (không che nội dung phụ đề, theo biến màu có sẵn), chuỗi đủ 5 ngôn ngữ.
- [ ] **Step 4: Run** `pnpm exec tsc --noEmit` và `pnpm test` (gồm parity i18n) — Expected: PASS.
- [ ] **Step 5: Commit** `feat(overlay): nút Nghe dịch, thanh mức tiếng họp, chỉ báo hàng đợi`

### Task 8: Kiểm chứng trên máy thật, hồi quy, dọn dẹp

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-nghe-dich-truc-tiep-design.md` (ghi kết quả đo, chỉnh `session_scalar` nếu cần), `models/tts/run-test.cmd`
- Remove (cần quyền xóa của người dùng): `crates/audio-capture/src/bin/duck-spike.rs`, `models/tts/tone.wav`, `models/tts/run-duck-spike.cmd`, `models/tts/run-port.cmd`, các `*.log`

- [ ] **Step 1: Hồi quy tự động** trên Windows: `pnpm exec tsc --noEmit`, `pnpm test`, `cargo test` (crates), `cargo test -p meeting-translator --lib`, `cargo clippy --workspace --all-targets -- -D warnings`. Expected: toàn bộ PASS, số test không giảm so với trước (466 vitest, 955 app).
- [ ] **Step 2: Kịch bản tay** (`run-dev.cmd`), ghi kết quả vào spec: (a) bật/tắt 10 lần liên tiếp, âm lượng từng app về đúng; (b) bật rồi kill `meeting-translator.exe` bằng Task Manager, mở lại ⇒ âm lượng trả về; (c) mở Teams/Zoom/Meet thật, kiểm giọng khách nhỏ và chữ dịch vẫn ra, so độ chính xác có/không hạ âm trên cùng đoạn; (d) chế độ `both`: nói vào micro ⇒ không đọc, khách nói ⇒ đọc; (e) khách nói nhanh 60 giây ⇒ hàng đợi, nút Bỏ qua; (f) tắt nút giữa lúc đang đọc; (g) tai nghe Bluetooth và đổi thiết bị phát giữa phiên; (h) tính năng cũ (phụ đề, lưu bản chép lời, nút Nghe ở bản chép lời) hoạt động như trước.
- [ ] **Step 3: Chỉnh** `session_scalar` và hằng AGC nếu nghe thử thấy chưa hợp, cập nhật test tương ứng.
- [ ] **Step 4: Dọn** các file thử (xin quyền xóa bằng `device_request_delete_permission`, nếu bị từ chối thì chuyển vào `_to_delete/`).
- [ ] **Step 5: Commit** `docs: kết quả kiểm chứng Nghe dịch trực tiếp` (khi người dùng cho phép).
