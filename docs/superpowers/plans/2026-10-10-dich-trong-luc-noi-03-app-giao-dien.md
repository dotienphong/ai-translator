# Dịch trong lúc người nói chưa dừng · 03: App và giao diện

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm bước 3 của spec §9: đưa chế độ "dịch trong lúc người nói chưa dừng" (đã có trong crate `pipeline` sau kế hoạch 02) vào app và giao diện.
- Cài đặt `translateWhileSpeaking`, mặc định bật; file cài đặt cũ thiếu khóa thì là bật.
- App quyết "máy đủ sức" lúc bắt đầu phiên và truyền cho engine cùng công tắc của người dùng; đổi công tắc giữa phiên có tác dụng từ đoạn kế tiếp.
- Sự kiện `subtitle://live` và `subtitle://live-end` chỉ tới thanh phụ đề (QĐ5 của spec).
- Thanh phụ đề vẽ dòng đang nói hai tầng, đặt đúng chỗ (sau dòng cuối, hay thay chỗ câu đang ghép), gỡ đúng lúc; phụ đề tạm thôi nhạt cả dòng khi chế độ có hiệu lực.
- Cài đặt › Phụ đề có công tắc, ghi chú "Máy này chưa đủ nhanh…", và khung xem trước hiện mẫu hai tầng; đủ chuỗi vi/en.
- Kiểm giao diện bằng `scripts/ui-preview` và trình duyệt không đầu, rồi thử tay trên bản dev.

**Kiến trúc:**
- **Rust (app):**
  - `settings`: trường `translate_while_speaking` (serde `translateWhileSpeaking`), mặc định `true`; `OverlayView` mang thêm trường này cho thanh phụ đề.
  - `sidecar`: hàm thuần `streaming_supported(windows, probe, asr_backend)` và `probe::too_slow_for_streaming`.
  - `SessionDeps::streaming_supported()`: `LiveDeps` đọc kết quả dò GPU (`GpuProbe`) và thiết bị thật của `asr-worker` (`SidecarManager::asr_backend()`, có sau `prepare`).
  - `session::engine_config` truyền `streaming_supported` và `streaming_enabled` (thay hai giá trị `false` tạm của kế hoạch 02).
  - `AppStatus.streaming_too_slow` (serde `streamingTooSlow`): máy chưa đủ nhanh, giữ tới lần bắt đầu phiên sau.
  - `TauriSink::live/live_end` gửi riêng cho thanh phụ đề; `actions::commit_settings` gọi `session::set_streaming_enabled` khi công tắc đổi.
- **Giao diện:**
  - Kiểu TS `LiveLine`, `LiveEnd` (snake_case như H5) và các trường mới trong `src/lib/ipc.ts`.
  - Store của thanh phụ đề giữ `live` theo id; hàm thuần `applyLive`, `endLive`, `settleLive`, `visibleRows`.
  - `TwoTier` (dùng chung), `LiveLineView` (memo), `OverlayLine` thêm `dimProvisional`.
  - `SubtitlePreview` tách khỏi `SubtitleSettings`; công tắc và ghi chú trong `SubtitleSettings`.
  - `scripts/ui-preview`: tham số mẫu mới và script `check-live.mjs` kiểm DOM, chụp ảnh vi/en.

**Công nghệ:**
- Rust 1.98.1 (edition 2024), app Tauri `meeting-translator` (Tauri 2), `pipeline` và `asr-protocol` của workspace.
- React 19, TypeScript, Zustand 5, Vitest 5 (môi trường `node`, không có DOM: test markup bằng `react-dom/server`, như kế hoạch 01 Task 8).
- Trang xem trước `scripts/ui-preview` (Vite, IPC giả) và Chrome không đầu qua `website/tools/browser/cdp.mjs` (có sẵn trong repo).
- Không thêm thư viện; `Cargo.lock` và `pnpm-lock.yaml` không đổi.

**Spec:** `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`: §5 ("Tắt ngay từ đầu phiên"), §6 (thanh phụ đề, sự kiện, cài đặt, lưu trữ), §9 bước 3, §11 (giao diện), QĐ1, QĐ2, QĐ5.

**Tổng quan và hợp đồng khóa:** `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`: H5 (`LiveLine`, `LiveEnd`), H6 (`EventSink::live/live_end`, `Indicators.streaming_unavailable`, `EngineConfig.streaming_supported/streaming_enabled`, `Engine::set_streaming_enabled`), H8 (`OverlayLine`), "Nhánh và worktree", "Quy ước chung".

**Spec chính:** `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`: §4.3 (Cài đặt › Phụ đề, khung xem trước), §4.4 (thanh phụ đề: cuộn, "Mới nhất", phụ đề tạm), §4.5 (từ điển có kiểu, `en` là nguồn khóa), §6.9 (khóa cài đặt), §6.10 (giao diện, `Field`).

**Kế hoạch trước (phải xong):**
- `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`: Task 5 (`lineView` hiện chữ dịch đang giữ khi `asr_done`), Task 8 (`OverlayLine.tsx` memo so nông, H8).
- `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-02-ban-thu-pipeline.md`: H5, H6 và Task 10 (`engine_config` có `streaming_supported: false`, `streaming_enabled: false`), cổng đã qua (Task 20 là cổng, Task 21 đặt mặc định sau cổng).

---

## Trạng thái đầu và cách đọc

- **Worktree** `/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi`, nhánh `dich-trong-luc-noi`.
  - Không đụng thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator`: phiên khác đang làm ở đó.
  - Không merge, không rebase, không push, không `git checkout main`.
- **Kế hoạch 01 và 02 đã xong, cổng của 02 đã qua.** Kế hoạch này viết trên code sau hai kế hoạch đó. Task 0 kiểm từng điều; thiếu điều nào thì dừng, báo điều phối viên. Cụ thể:
  - `pipeline::subtitle::{LiveLine, LiveEnd}` đúng H5 (snake_case, `extends: Option<u64>`).
  - `pipeline::engine::EventSink` có `fn live(&self, _line: &LiveLine) {}` và `fn live_end(&self, _end: &LiveEnd) {}`.
  - `Indicators` có `pub streaming_unavailable: bool` (serde camelCase nên ra `streamingUnavailable`), vẫn `Default`, `Eq`.
  - `EngineConfig` có đúng hai trường mới `streaming_supported: bool` và `streaming_enabled: bool`; `Engine::set_streaming_enabled(&self, on: bool)`.
  - `src-tauri/src/session.rs` `engine_config` đặt tạm `streaming_supported: false` và `streaming_enabled: false` (kế hoạch 02, Task 10).
  - `src/windows/overlay/OverlayLine.tsx` đúng kế hoạch 01 Task 8: `memo(function OverlayLine({ line, showSource, uiLanguage }))`, so nông; `overlay.tsx` gọi `<OverlayLine key={l.id} … />`.
  - `src/lib/subtitleView.ts` `lineView`: `case "asr_done": return s.tgt_text ? translated("translating") : sourceOnly("pending");` (kế hoạch 01 Task 5).
- **Hành vi của engine mà test của kế hoạch này dựa vào** (đều nằm trong H6 và QĐ của kế hoạch 02):
  - chế độ có hiệu lực thì có `live` cho đoạn có ít nhất `min_partial_speech_ms` tiếng nói;
  - `!streaming_supported` thì không có `live` nào, và `indicators` có `streaming_unavailable = true` ngay đầu phiên;
  - `set_streaming_enabled` có tác dụng từ đoạn kế tiếp (QĐ2 của 02: chế độ chốt theo đoạn);
  - `live_end` của một dòng tới sau upsert chốt phụ đề tương ứng (QĐ5 của 02); engine phát `live_end` cho mọi dòng khi dừng phiên.
- **Khối code.**
  - "`<file>`: thay … bằng …" là thay đúng một chỗ: khối cũ đủ dài để chỉ khớp một chỗ lúc làm task đó.
  - "Tạo `<file>`" là chép nguyên khối vào file mới. "Thay toàn bộ `<file>`" là ghi đè cả file bằng khối đó.
  - Hàm hay file mà kế hoạch 01/02 đã sửa (`engine_config`, test `the_engine_follows_the_language_and_pause_settings`, `OverlayLine.tsx`, `OverlayLine.test.ts`, `overlay.tsx`) được ghi **nguyên bản mới**, đã gồm phần của 01/02. Trước khi thay, đối chiếu bản trong file với bản của kế hoạch trước; khác chỗ nào ngoài phần kế hoạch trước đã làm thì dừng, báo điều phối viên.
  - Trong một task, làm các khối test trước, chạy thấy đỏ, rồi mới cài.
  - Khối Rust viết theo `rustfmt.toml` (`max_width = 120`). Bước nào có `cargo fmt … --check` mà lệnh in khác biệt: chạy `cargo fmt -p meeting-translator`, xem lại diff chỉ là xuống dòng, rồi chạy lại bước đó. Repo không có công cụ định dạng cho TS.
- **Lệnh** chạy ở gốc worktree; mỗi khối lệnh tự `cd` vào đó. Không chạy hai bản build Rust lớn cùng lúc. Không `pkill`/`killall`: tắt tiến trình mình mở bằng PID.
- **Test của app Rust:** `cargo test --locked -p meeting-translator --lib <tên>`. Test chạy app giả (`MockRuntime`) với `FakeDeps` (`src-tauri/src/test_support.rs`): engine thật, tiến trình phụ giả, âm thanh phát nhanh gấp 10 lần.
- **Commit:** mỗi task một commit (Task 0, 11 và 12 không có; Task 11 chỉ commit khi phải sửa giao diện).
  - Trước khi commit: `git -C <worktree> branch --show-current` phải in `dich-trong-luc-noi`, và xem `git -C <worktree> status --short`.
  - Chỉ `git add` đúng các file của task.
  - Dòng cuối commit message là `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`; thay `<model đang chạy>` bằng tên model của agent thực thi.
- **Quyền riêng tư (spec §6.4, spec chính §10.2):** bản tạm chỉ nằm trong bộ nhớ của thanh phụ đề; không vào bản chép lời, lịch sử, xuất file hay log. Log chỉ ghi bật/tắt và số đo.

## Quyết định của kế hoạch này

- **QĐ1. Máy đủ sức** (spec §5, "Tắt ngay từ đầu phiên") là hàm thuần `sidecar::streaming_supported(windows, probe, asr_backend)`:
  - `asr-worker` phải chạy GPU: `asr_backend` là thiết bị thật của worker đang chạy (`SidecarManager::asr_backend()`, đặt ở `Ready` của mỗi lần khởi động). Lúc bắt đầu phiên, `prepare` đã chờ worker `Ready`, nên giá trị luôn có; chưa biết (`None`) thì coi như chưa đủ sức.
  - Windows: lần dò GPU (`GpuProbe`) phải có kết quả, có GPU dùng được, và không chỉ có GPU tích hợp (`probe::only_integrated_gpu`, cũng là lúc `llama-server` chạy `-ngl 0`). Dò quá giờ (chưa có kết quả) thì `prepare` đã cho `asr-worker` chạy CPU, nên kết quả vẫn là chưa đủ sức.
  - macOS: chỉ điều kiện `asr-worker` chạy GPU (Metal); không có lần dò GPU.
  - App hỏi một lần lúc bắt đầu phiên, sau `prepare` (`SessionDeps::streaming_supported`). Giữa phiên `asr-worker` có chuyển sang CPU thì engine tự tắt nếu không theo kịp (§5), app không đổi gì.
- **QĐ2. Trạng thái "máy chưa đủ nhanh"** là `AppStatus.streaming_too_slow` (serde `streamingTooSlow`), không lưu xuống đĩa:
  - **bật** khi: lần dò GPU trên Windows cho kết quả chưa đủ sức (lúc mở app, chưa cần phiên nào); `asr-worker` báo `Ready` bằng CPU hay `CpuFallback` lúc **không** có phiên nào đang bắt đầu hay chạy (chạy sẵn khi mở cửa sổ chính); engine báo `Indicators.streaming_unavailable` (tắt từ đầu hay tự tắt);
  - **đặt lại** = `!streaming_supported` ngay trước `Engine::start` của mỗi phiên (phiên mới trên máy đủ sức thì hết ghi chú của lần tự tắt trước);
  - **không đổi** khi dừng phiên (khác `indicators`, về mặc định khi dừng): ghi chú "vừa tự tắt" còn cho người dùng đọc sau cuộc họp.
- **QĐ3. Chế độ có hiệu lực ở giao diện** = `translateWhileSpeaking && !streamingTooSlow` (`streamingEffective`). Thanh phụ đề biết `translateWhileSpeaking` qua `OverlayView` (cửa sổ `overlay` chỉ đọc phần cài đặt của nó, spec chính §10.2) và `streamingTooSlow` qua `app://status`. Khi có hiệu lực, `OverlayLine` nhận `dimProvisional={false}`.
- **QĐ4. Đổi công tắc giữa phiên:** `actions::commit_settings` (mọi đường đổi cài đặt đều qua đây) gọi `session::set_streaming_enabled(app, on)` khi giá trị đổi; hàm này khóa `Session.engine` rồi gọi `Engine::set_streaming_enabled`. Lúc gắn engine vào phiên, `start_with` đọc lại công tắc **dưới cùng khóa** đó và áp vào engine, nên lần đổi trong lúc phiên đang chuẩn bị (tới 180 giây nạp model) không bị lỡ.
- **QĐ5. Sự kiện** `subtitle://live` (`LiveLine`) và `subtitle://live-end` (`LiveEnd`) gửi bằng `emit_to` cho riêng cửa sổ `overlay`; store của cửa sổ chính không nghe hai sự kiện này; `TauriSink::live/live_end` không chạm `TranscriptStore`. Không cần quyền mới: `core:event:allow-listen` đã có, capability không đổi (`acl_tests` giữ nguyên).
- **QĐ6. Vị trí và vòng đời dòng đang nói trên thanh** (spec §4.5, §6.1; QĐ5 của kế hoạch 02), hàm thuần trong `src/store/overlay.ts`:
  - **Chỗ (neo):** phụ đề `extends` nếu đang có trên thanh; không thì phụ đề cùng `id` (lượt cuối đang chạy); không có nữa thì sau dòng cuối, theo thứ tự id.
  - **Ẩn:** mọi phụ đề có id bằng `id` hay `extends` của một dòng đang nói thì tạm ẩn.
  - **Hai dòng cùng một neo** (dòng X đang chờ lượt cuối và dòng Y nối tiếp câu của X): chỉ dòng có id lớn nhất hiện; nó đã chứa chữ của câu kia.
  - **Gỡ:** `live-end`; phụ đề cùng id (hay có id đó trong `replaces`) tới với trạng thái chốt (`done`, `failed`, `same_lang`, `skipped`, `dropped`); phiên mới bắt đầu; phiên không còn chạy (`idle`, `error`) — hai điều sau là lưới an toàn, vì engine đã gửi `live-end` khi dừng.
  - **Dòng tới muộn:** `subtitle://live` của một id mà phụ đề cùng id đã chốt thì bỏ.
  - Hàm trả nguyên mảng cũ khi không có gì đổi, để thanh không vẽ lại thừa.
- **QĐ7. Vẽ hai tầng:** component `TwoTier` (`src/components/TwoTier.tsx`) vẽ `phần ổn định` rồi `<span class="tail">phần tạm</span>`; phần tạm tự mang khoảng trắng đầu (H4). CSS của từng cửa sổ đặt `.tail` mờ 0,65, đúng bằng `.provisional`. Dòng chưa có chữ dịch (đang chờ bản dịch tạm đầu, câu đã là ngôn ngữ đích, dịch không khả dụng) thì dòng chính là câu gốc hai tầng và không có dòng câu gốc nhỏ, giống `lineView` với phụ đề chưa dịch, nhưng không nghiêng và không nhạt cả dòng.
- **QĐ8. Cài đặt › Phụ đề:**
  - Công tắc đứng đầu thẻ, ngay dưới khung xem trước (khung xem trước đổi theo nó).
  - Ghi chú hiện khi công tắc bật và `streamingTooSlow` (`streamingNote`); tắt công tắc thì người dùng đã chọn dịch sau mỗi câu, không cần giải thích. Ghi chú là `<span class="field-note" role="status">` trong phần mô tả của dòng, không đổi `Field`.
  - Khung xem trước hiện mẫu hai tầng khi chế độ có hiệu lực, câu mẫu cũ khi không. Mẫu hai tầng nằm trong từ điển dạng "cả câu" và "phần tạm" (chuỗi không được có khoảng trắng thừa ở đầu hay cuối, test của `i18n.test.ts`); `splitTail` tách phần ổn định.
- **QĐ9. Kiểm giao diện:** test markup (Vitest) cho từng component và hàm thuần; DOM và ảnh thật trên trang xem trước bằng Chrome không đầu qua `website/tools/browser/cdp.mjs` (script mới `scripts/ui-preview/check-live.mjs`), cổng 1431 như kế hoạch 01 Task 8 (phiên khác có thể dùng 1430). Repo không có gói Playwright và kế hoạch không thêm thư viện; `cdp.mjs` là bộ điều khiển trình duyệt sẵn có của repo. Agent có công cụ Playwright (MCP) thì mở thêm các URL đó bằng WebKit để xem trên engine gần macOS; không bắt buộc.
- **QĐ10. Không chụp lại ảnh website** (`scripts/ui-preview/shoot.mjs`, `website/src/assets/img/app/`) ở kế hoạch này: nhánh chưa được merge, website chỉ được nói điều có thật của bản phát hành. Việc đó để sau khi chủ dự án cho merge.

## File sẽ tạo hoặc sửa

| File | Việc |
|---|---|
| `src-tauri/src/settings/mod.rs` | `Settings.translate_while_speaking`, mặc định `true`; test |
| `src-tauri/src/settings/migrate.rs` | test: file cũ thiếu khóa thì bật, giá trị sai thì về mặc định |
| `src-tauri/src/settings/patch.rs` | test: `update_settings` nhận `translateWhileSpeaking` là bool |
| `src-tauri/src/state.rs` | `OverlayView.translate_while_speaking`; `AppStatus.streaming_too_slow`; `AppStatus::note_machine_too_slow`; test |
| `src-tauri/src/sidecar/probe.rs` | `too_slow_for_streaming`; test |
| `src-tauri/src/sidecar/mod.rs` | `streaming_supported`; `start_gpu_probe` ghi máy chưa đủ nhanh; test |
| `src-tauri/src/session.rs` | `SessionDeps::streaming_supported`; `LiveDeps` cài; `engine_config` nhận `streaming_supported`; `start_with` đặt `streaming_too_slow`, áp công tắc lúc gắn engine; `set_streaming_enabled`; `TauriSink::indicators/live/live_end`; `StatusEvents::on_event`; test |
| `src-tauri/src/events.rs` | `SUBTITLE_LIVE`, `SUBTITLE_LIVE_END`, `subtitle_live`, `subtitle_live_end` |
| `src-tauri/src/actions.rs` | `commit_settings` gọi `session::set_streaming_enabled` |
| `src-tauri/src/test_support.rs` | `FakeDeps.slow_machine`, `FakeAudio::LongTone` |
| `src-tauri/src/app_tests.rs` | test công tắc tới thanh phụ đề, máy chưa đủ nhanh, dòng đang nói chỉ tới thanh phụ đề và đổi công tắc giữa phiên |
| `src/lib/ipc.ts` | `LiveLine`, `LiveEnd`, sự kiện mới, `Indicators.streamingUnavailable`, `AppStatus.streamingTooSlow`, `Settings.translateWhileSpeaking`, `OverlayView.translateWhileSpeaking` |
| `src/lib/subtitleView.ts` | `streamingEffective`, `streamingNote`, `splitTail` |
| `src/lib/subtitleView.test.ts`, `src/store/app.test.ts`, `src/store/transcript.test.ts` | dữ liệu mẫu theo kiểu mới; test hàm mới; cửa sổ chính bỏ qua `subtitle://live` |
| `src/store/overlay.ts`, `src/store/overlay.test.ts` | `live`, `applyLive`, `endLive`, `settleLive`, `visibleRows`, `OverlayRow`; test |
| `src/components/TwoTier.tsx` (tạo) | chữ hai tầng dùng chung |
| `src/windows/overlay/LiveLineView.tsx`, `LiveLineView.test.ts` (tạo) | dòng đang nói, memo so nông |
| `src/windows/overlay/OverlayLine.tsx`, `OverlayLine.test.ts` | `dimProvisional` |
| `src/windows/overlay/overlay.tsx` | vẽ theo `visibleRows`, `dimProvisional`, tự cuộn theo cả dòng đang nói |
| `src/windows/overlay/overlay.css`, `overlay.css.test.ts` | `.overlay .live .tail`; test |
| `src/windows/main/settings/SubtitlePreview.tsx`, `SubtitlePreview.test.ts` (tạo) | khung xem trước, mẫu hai tầng; test markup và CSS |
| `src/windows/main/settings/SubtitleSettings.tsx` | công tắc, ghi chú, dùng `SubtitlePreview` |
| `src/styles/main.css` | `.subtitle-preview .tail`, `.field-text .field-note` |
| `src/i18n/en.ts`, `src/i18n/vi.ts` | 7 khóa mới |
| `scripts/ui-preview/tauri-mock.ts` | kiểu mới; tham số `live=`, `slow=1`, `tws=0`; `window.__livePreview.finish()` |
| `scripts/ui-preview/check-live.mjs` (tạo) | kiểm DOM và chụp ảnh vi/en vào `target/ui-preview/dich-trong-luc-noi/` |

## Các task

| Task | Việc | Commit |
|---|---|---|
| 0 | Kiểm trạng thái đầu (01, 02 xong, cổng đã qua) | không |
| 1 | Cài đặt `translateWhileSpeaking` (Rust), `OverlayView` | `feat(settings): …` |
| 2 | Luật máy đủ sức (`streaming_supported`) | `feat(app): …` |
| 3 | `AppStatus.streaming_too_slow` và các nơi ghi | `feat(app): …` |
| 4 | Nối engine: máy đủ sức, công tắc lúc bắt đầu phiên | `feat(app): …` |
| 5 | Sự kiện dòng đang nói chỉ tới thanh phụ đề; đổi công tắc giữa phiên | `feat(app): …` |
| 6 | Kiểu TS, dữ liệu mẫu, hàm `streamingEffective`/`streamingNote`/`splitTail` | `feat(ui): …` |
| 7 | Store của thanh phụ đề: dòng đang nói | `feat(overlay): …` |
| 8 | `TwoTier`, `LiveLineView`, `OverlayLine.dimProvisional`, CSS | `feat(overlay): …` |
| 9 | `overlay.tsx` vẽ dòng đang nói; mẫu `live=` của `ui-preview`; `check-live.mjs` nhóm `overlay` | `feat(overlay): …` |
| 10 | Cài đặt › Phụ đề: công tắc, ghi chú, khung xem trước hai tầng, chuỗi vi/en; `check-live.mjs` nhóm `settings` | `feat(ui): …` |
| 11 | Xem và duyệt ảnh vi/en, sáng/tối | không (trừ khi phải sửa: `fix(…): …`) |
| 12 | Kiểm toàn bộ; thử tay bản dev | không (chỉ kiểm) |

---

## Task 0: Kiểm trạng thái đầu

**Files:** không sửa file nào.

- [ ] **Step 1: Nhánh, trạng thái, lịch sử**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git branch --show-current
git status --short
git log --oneline -40
```

Expected:
- dòng đầu `dich-trong-luc-noi`; `status` trống;
- log có commit `perf(overlay): memo từng dòng của thanh phụ đề (A4)` của kế hoạch 01, các commit của kế hoạch 02 (Task 1–17, Task 19), và commit của Task 21 kế hoạch 02 (đặt mặc định sau cổng).

- [ ] **Step 2: Kiểm code của kế hoạch 01 và 02 mà kế hoạch này dựa vào**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
grep -n "pub struct LiveLine" crates/pipeline/src/subtitle.rs
grep -n "pub extends: Option<u64>," crates/pipeline/src/subtitle.rs
grep -n "pub struct LiveEnd" crates/pipeline/src/subtitle.rs
grep -n "fn live(&self, _line: &LiveLine) {}" crates/pipeline/src/engine.rs
grep -n "fn live_end(&self, _end: &LiveEnd) {}" crates/pipeline/src/engine.rs
grep -n "pub streaming_unavailable: bool," crates/pipeline/src/engine.rs
grep -n "pub streaming_supported: bool," crates/pipeline/src/engine.rs
grep -n "pub streaming_enabled: bool," crates/pipeline/src/engine.rs
grep -n "pub fn set_streaming_enabled(&self, on: bool)" crates/pipeline/src/engine.rs
grep -n "streaming_supported: false," src-tauri/src/session.rs
grep -n "streaming_enabled: false," src-tauri/src/session.rs
grep -n "export const OverlayLine = memo(function OverlayLine" src/windows/overlay/OverlayLine.tsx
grep -n "<OverlayLine key={l.id}" src/windows/overlay/overlay.tsx
grep -n 'return s.tgt_text ? translated("translating") : sourceOnly("pending");' src/lib/subtitleView.ts
grep -n "pub fn asr_backend(&self) -> Option<Backend>" crates/pipeline/src/supervisor.rs
```

Expected: mỗi `grep` in đúng một dòng. Thiếu dòng nào thì dừng, báo điều phối viên: kế hoạch 01 hay 02 chưa xong, hay tên khác hợp đồng.

- [ ] **Step 3: Kiểm `EngineConfig` không có trường nào ngoài hợp đồng**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
awk '/^pub struct EngineConfig/,/^}/' crates/pipeline/src/engine.rs | grep -E '^\s+pub [a-z_]+:' | sed -E 's/^\s+pub ([a-z_]+):.*/\1/'
```

Expected: đúng 8 tên, theo thứ tự: `pipeline`, `languages`, `target`, `translation_context`, `id_base`, `glossary`, `streaming_supported`, `streaming_enabled`. Có tên khác thì dừng, báo điều phối viên (Task 4 ghi nguyên bản mới của `engine_config` theo đúng 8 trường này).

- [ ] **Step 4: Bộ kiểm như CI (mốc)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
pnpm build && pnpm test
```

Expected: mọi lệnh thoát mã 0. Lệnh nào đỏ thì dừng, báo điều phối viên kèm nguyên lỗi; không sửa code.

---

## Task 1: Cài đặt `translateWhileSpeaking` và `OverlayView`

Spec §6.3: Cài đặt › Phụ đề thêm công tắc "Dịch trong lúc người nói chưa dừng" (`translateWhileSpeaking`), mặc định bật. Khóa mới hoàn toàn, nên không cần bước migrate: `migrate::load` ghép từng khóa của file vào giá trị mặc định, khóa thiếu thì lấy mặc định, giá trị sai kiểu thì về mặc định và ghi vào `rejected`. `update_settings` nhận khóa mới mà không cần sửa `patch.rs` (khóa cấp trên cùng, không chỉ đọc).

Thanh phụ đề cần biết công tắc (QĐ3) nên `OverlayView` mang thêm trường này; `commit_settings` đã gửi `overlay://view` khi `OverlayView` đổi.

**Files:**
- Modify: `src-tauri/src/settings/mod.rs` (struct `Settings`, `Settings::defaults`, `mod tests`)
- Modify: `src-tauri/src/settings/migrate.rs` (`mod tests`)
- Modify: `src-tauri/src/settings/patch.rs` (`mod tests`)
- Modify: `src-tauri/src/state.rs` (struct `OverlayView`, `OverlayView::from_settings`)
- Modify: `src-tauri/src/app_tests.rs` (thêm test sau `subtitle_colors_reach_the_overlay_at_once`)

- [ ] **Step 1: Viết test**

`src-tauri/src/settings/mod.rs`: thay

```rust
        assert_eq!(vi.update_channel, UpdateChannel::Stable);
```

bằng

```rust
        assert_eq!(vi.update_channel, UpdateChannel::Stable);
        assert!(
            vi.translate_while_speaking,
            "dịch trong lúc người nói chưa dừng mặc định bật (spec 2026-10-10 §6.3)"
        );
```

và thay

```rust
            "experimental",
            "onboardingDone",
            "revision",
        ] {
```

bằng

```rust
            "experimental",
            "onboardingDone",
            "revision",
            "translateWhileSpeaking",
        ] {
```

`src-tauri/src/settings/migrate.rs`: thay

```rust
    /// Bản trước chỉ có ba phím tắt: hai phím cuộn phụ đề lấy mặc định, và không bị coi là khóa hỏng.
```

bằng

```rust
    /// Spec 2026-10-10 §6.3: file của bản trước chưa có công tắc "Dịch trong lúc người nói chưa dừng" thì công tắc bật, và
    /// khóa thiếu không bị coi là khóa hỏng. Giá trị đã lưu được giữ; giá trị sai kiểu thì về mặc định.
    #[test]
    fn an_old_file_without_the_live_switch_turns_it_on() {
        let raw = object(json!({ "schemaVersion": 1, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert!(loaded.settings.translate_while_speaking);
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save(), "khóa thiếu thì không phải ghi lại file");
        let raw = object(json!({ "schemaVersion": 1, "translateWhileSpeaking": false }));
        assert!(!load(raw, defaults()).settings.translate_while_speaking);
        let raw = object(json!({ "schemaVersion": 1, "translateWhileSpeaking": "yes" }));
        let loaded = load(raw, defaults());
        assert!(loaded.settings.translate_while_speaking);
        assert_eq!(loaded.rejected, ["translateWhileSpeaking"]);
    }

    /// Bản trước chỉ có ba phím tắt: hai phím cuộn phụ đề lấy mặc định, và không bị coi là khóa hỏng.
```

`src-tauri/src/settings/patch.rs`: thay

```rust
    #[test]
    fn rejects_wrong_types() {
```

bằng

```rust
    /// Spec 2026-10-10 §6.3: công tắc "Dịch trong lúc người nói chưa dừng" đổi được từ giao diện, chỉ nhận bool.
    #[test]
    fn the_live_switch_is_a_boolean() {
        let off = apply(&current(), &json!({ "translateWhileSpeaking": false })).unwrap();
        assert!(!off.translate_while_speaking);
        assert!(apply(&off, &json!({ "translateWhileSpeaking": true })).unwrap().translate_while_speaking);
        assert_eq!(
            apply(&current(), &json!({ "translateWhileSpeaking": "yes" })),
            Err(Invalid::new("translateWhileSpeaking", Reason::WrongType))
        );
    }

    #[test]
    fn rejects_wrong_types() {
```

`src-tauri/src/app_tests.rs`: thay

```rust
/// Kéo cạnh trên macOS (§4.4): app tự đặt khung theo con trỏ, không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước
```

bằng

```rust
/// Spec 2026-10-10 §6.1, §6.3: công tắc "Dịch trong lúc người nói chưa dừng" mặc định bật, được ghi vào file, và thanh phụ
/// đề biết ngay qua `overlay://view` (để thôi làm nhạt cả dòng phụ đề tạm khi chế độ có hiệu lực).
#[test]
fn the_live_switch_is_on_by_default_and_reaches_the_overlay() {
    let app = mock_app();
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let settings = invoke(&main, "get_settings", json!({})).unwrap();
    assert_eq!(settings["translateWhileSpeaking"], true);
    let view = invoke(&overlay, "get_overlay_view", json!({})).unwrap();
    assert_eq!(view["translateWhileSpeaking"], true);
    let views = record(&app, crate::events::OVERLAY_VIEW);
    let settings = invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": false } }),
    )
    .unwrap();
    assert_eq!(settings["translateWhileSpeaking"], false);
    let last = views.lock().unwrap().last().cloned().unwrap();
    assert_eq!(last["translateWhileSpeaking"], false);
    assert_eq!(last_saved(&app, "translateWhileSpeaking"), Some(json!(false)));
}

/// Kéo cạnh trên macOS (§4.4): app tự đặt khung theo con trỏ, không nhỏ hơn 320 × 80 điểm; nhả chuột thì nhớ kích thước
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib settings 2>&1 | tail -n 20
```

Expected: lỗi biên dịch `no field translate_while_speaking on type Settings` (hay `…on type settings::Settings`).

- [ ] **Step 3: Cài**

`src-tauri/src/settings/mod.rs`: thay

```rust
    pub vad_end_silence_ms: u32,
    pub overlay: OverlaySettings,
    /// Gói model đang dùng (§6.7): mã gói trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest, Đ7).
```

bằng

```rust
    pub vad_end_silence_ms: u32,
    pub overlay: OverlaySettings,
    /// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.3, Cài đặt › Phụ đề), mặc định bật. Đổi khi đang dịch thì có
    /// tác dụng từ đoạn kế tiếp (`session::set_streaming_enabled`). File của bản trước chưa có khóa này thì lấy mặc định
    /// (`migrate::load` ghép từng khóa vào giá trị mặc định), không cần bước migrate.
    pub translate_while_speaking: bool,
    /// Gói model đang dùng (§6.7): mã gói trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest, Đ7).
```

và thay

```rust
                positions: BTreeMap::new(),
                last_monitor: None,
            },
            model_tier: None,
```

bằng

```rust
                positions: BTreeMap::new(),
                last_monitor: None,
            },
            translate_while_speaking: true,
            model_tier: None,
```

`src-tauri/src/state.rs`: thay

```rust
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
            text_color: o.text_color,
            background: o.background,
            show_source: o.show_source,
            locked: o.locked,
        }
    }
}
```

bằng

```rust
    pub show_source: bool,
    pub locked: bool,
    /// Công tắc "Dịch trong lúc người nói chưa dừng" (spec 2026-10-10 §6.1, §6.3). Cùng `AppStatus::streaming_too_slow`,
    /// thanh phụ đề biết chế độ có hiệu lực không, để thôi làm nhạt cả dòng phụ đề tạm.
    pub translate_while_speaking: bool,
}

impl OverlayView {
    pub fn from_settings(settings: &Settings) -> Self {
        let o = &settings.overlay;
        Self {
            ui_language: settings.ui_language,
            font_size: o.font_size,
            lines: o.lines,
            opacity: o.opacity,
            text_color: o.text_color,
            background: o.background,
            show_source: o.show_source,
            locked: o.locked,
            translate_while_speaking: settings.translate_while_speaking,
        }
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib settings
cargo test --locked -p meeting-translator --lib app_tests::the_live_switch_is_on_by_default_and_reaches_the_overlay
cargo test --locked -p meeting-translator --lib acl_tests
cargo fmt -p meeting-translator -- --check
```

Expected:
- mọi test `settings::…` đạt, gồm `an_old_file_without_the_live_switch_turns_it_on` và `the_live_switch_is_a_boolean`;
- test app mới đạt; ba test `acl_tests` vẫn đạt (`get_overlay_view` có thêm một khóa, vẫn không có `hotkeys`);
- fmt không in gì (nếu in, chạy `cargo fmt -p meeting-translator` rồi xem lại diff chỉ là xuống dòng).

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src-tauri/src/settings/mod.rs src-tauri/src/settings/migrate.rs src-tauri/src/settings/patch.rs \
  src-tauri/src/state.rs src-tauri/src/app_tests.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(settings): công tắc dịch trong lúc người nói chưa dừng

Settings.translate_while_speaking (translateWhileSpeaking), mặc định bật; file cũ thiếu khóa thì bật, không cần
migrate. OverlayView mang thêm công tắc để thanh phụ đề biết chế độ có hiệu lực. Test mặc định, file cũ, patch, và
overlay://view.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có năm file.

---

## Task 2: Luật "máy đủ sức"

QĐ1. Hai hàm thuần, chưa nối vào đâu (Task 3 và Task 4 dùng):
- `probe::too_slow_for_streaming(&ProbeOutcome)`: kết quả dò GPU trên Windows nói máy chưa đủ sức;
- `sidecar::streaming_supported(windows, probed, asr_backend)`: luật đầy đủ lúc bắt đầu phiên.

**Files:**
- Modify: `src-tauri/src/sidecar/probe.rs` (sau `only_integrated_gpu`; `mod tests`)
- Modify: `src-tauri/src/sidecar/mod.rs` (khai báo `use`; sau `give_up_code`; `mod tests`)

- [ ] **Step 1: Viết test**

`src-tauri/src/sidecar/probe.rs`: thay

```rust
    #[test]
    fn discrete_or_integrated_gpus_are_usable() {
```

bằng

```rust
    /// Spec 2026-10-10 §5: trên Windows chỉ máy có card rời mới dịch trong lúc người nói chưa dừng; chỉ có GPU tích hợp hay
    /// không có GPU dùng được thì dịch sau mỗi câu.
    #[test]
    fn only_a_discrete_gpu_is_fast_enough_to_translate_while_speaking() {
        let of = |json: &str| ProbeOutcome {
            usable: usable_gpu(json),
            gpus: parse_gpus(json),
        };
        let discrete = r#"[{"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
        let integrated = r#"[{"name":"Intel(R) Iris(R) Xe","device_type":"integrated","device_local_bytes":16999974912,"vendor_id":32902}]"#;
        let both = r#"[{"name":"Intel(R) UHD","device_type":"integrated","device_local_bytes":268435456,"vendor_id":32902},
            {"name":"NVIDIA GeForce RTX 4050 Laptop GPU","device_type":"discrete","device_local_bytes":6425673728,"vendor_id":4318}]"#;
        assert!(!too_slow_for_streaming(&of(discrete)));
        assert!(!too_slow_for_streaming(&of(both)), "có cả card rời");
        assert!(too_slow_for_streaming(&of(integrated)), "i5-1345U, Iris Xe");
        assert!(too_slow_for_streaming(&of("[]")), "không có GPU: asr-worker chạy CPU");
        assert!(too_slow_for_streaming(&ProbeOutcome::default()), "dò lỗi");
    }

    #[test]
    fn discrete_or_integrated_gpus_are_usable() {
```

`src-tauri/src/sidecar/mod.rs`: thay

```rust
    /// Q7 của review 02c: dò quá giờ thì không nhớ (lần sau dò lại); có kết quả thì nhớ, và lần dò đang chạy được dùng chung.
```

bằng

```rust
    /// QĐ1 của kế hoạch 03 (spec 2026-10-10 §5): dịch trong lúc người nói chưa dừng chỉ khi `asr-worker` chạy GPU; trên
    /// Windows còn phải có kết quả dò GPU, và không chỉ có GPU tích hợp.
    #[test]
    fn translating_while_speaking_needs_a_gpu_asr_worker_and_no_integrated_only_windows() {
        let gpu = |device_type: &str| probe::GpuInfo {
            name: "GPU".into(),
            device_type: device_type.into(),
            device_local_bytes: 1 << 30,
            vendor_id: 1,
        };
        let discrete = probe::ProbeOutcome {
            usable: true,
            gpus: vec![gpu("discrete")],
        };
        let integrated = probe::ProbeOutcome {
            usable: true,
            gpus: vec![gpu("integrated")],
        };
        assert!(streaming_supported(false, None, Some(Backend::Metal)), "macOS: Metal");
        assert!(
            !streaming_supported(false, None, Some(Backend::Cpu)),
            "macOS: asr-worker chạy CPU"
        );
        assert!(!streaming_supported(false, None, None), "chưa biết thiết bị");
        assert!(
            streaming_supported(true, Some(&discrete), Some(Backend::Vulkan)),
            "Windows: card rời"
        );
        assert!(
            !streaming_supported(true, Some(&integrated), Some(Backend::Vulkan)),
            "Windows: chỉ GPU tích hợp"
        );
        assert!(
            !streaming_supported(true, Some(&discrete), Some(Backend::Cpu)),
            "asr-worker đã chuyển sang CPU"
        );
        assert!(
            !streaming_supported(true, None, Some(Backend::Vulkan)),
            "chưa có kết quả dò"
        );
    }

    /// Q7 của review 02c: dò quá giờ thì không nhớ (lần sau dò lại); có kết quả thì nhớ, và lần dò đang chạy được dùng chung.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib sidecar 2>&1 | tail -n 20
```

Expected: lỗi biên dịch `cannot find function too_slow_for_streaming`, `cannot find function streaming_supported` và `failed to resolve: use of undeclared type Backend`.

- [ ] **Step 3: Cài**

`src-tauri/src/sidecar/probe.rs`: thay

```rust
/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp.
```

bằng

```rust
/// Máy Windows chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, "Tắt ngay từ đầu phiên"): không có GPU
/// dùng được (`asr-worker` chạy CPU), hay chỉ có GPU tích hợp (`llama-server` chạy `-ngl 0`, hai engine tranh nhau một
/// iGPU). S6 trên Windows đo riêng lượt cuối đã mất 1,3–4 giây.
pub fn too_slow_for_streaming(outcome: &ProbeOutcome) -> bool {
    !outcome.usable || only_integrated_gpu(&outcome.gpus)
}

/// Có GPU chạy được Vulkan không: card rời hoặc GPU tích hợp.
```

`src-tauri/src/sidecar/mod.rs`: thay

```rust
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
```

bằng

```rust
use asr_protocol::Backend;
use pipeline::config::{AsrConfig, MtConfig, SupervisorConfig};
```

và thay

```rust
/// Kết quả dò GPU trên Windows (`asr-worker-vulkan --probe`), dùng chung giữa luồng dò lúc mở app và lần chuẩn bị đầu
```

bằng

```rust
/// Máy đủ sức cho chế độ dịch trong lúc người nói chưa dừng không, lúc bắt đầu phiên (spec 2026-10-10 §5, "Tắt ngay từ
/// đầu phiên"; QĐ1 của kế hoạch 03):
/// - `asr-worker` phải chạy GPU: `asr_backend` là thiết bị thật của worker đang chạy (`SidecarManager::asr_backend`, đặt ở
///   `Ready`); chưa biết thì coi như chưa đủ sức.
/// - Windows: lần dò GPU phải có kết quả (`probed`) và không bị `probe::too_slow_for_streaming`. Dò quá giờ thì `prepare`
///   đã cho `asr-worker` chạy CPU, nên kết quả vẫn là chưa đủ sức.
pub fn streaming_supported(windows: bool, probed: Option<&probe::ProbeOutcome>, asr_backend: Option<Backend>) -> bool {
    let asr_on_gpu = asr_backend.is_some_and(Backend::is_gpu);
    let gpu_ok = !windows || probed.is_some_and(|o| !probe::too_slow_for_streaming(o));
    asr_on_gpu && gpu_ok
}

/// Kết quả dò GPU trên Windows (`asr-worker-vulkan --probe`), dùng chung giữa luồng dò lúc mở app và lần chuẩn bị đầu
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib sidecar
cargo clippy --locked -p meeting-translator --all-targets -- -D warnings
cargo fmt -p meeting-translator -- --check
```

Expected: mọi test `sidecar::…` đạt, gồm hai test mới; clippy sạch (hai hàm mới đã `pub` nên không bị báo `dead_code`); fmt không in gì.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src-tauri/src/sidecar/probe.rs src-tauri/src/sidecar/mod.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(app): luật máy đủ sức dịch trong lúc người nói chưa dừng

streaming_supported: asr-worker phải chạy GPU (thiết bị thật); Windows còn phải có kết quả dò GPU, có GPU dùng được và
không chỉ có GPU tích hợp (too_slow_for_streaming). Hàm thuần, có test; nối vào phiên ở task sau.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có hai file.

---

## Task 3: Trạng thái "máy chưa đủ nhanh" (`AppStatus.streaming_too_slow`)

QĐ2. Cài đặt › Phụ đề phải ghi chú cả khi chưa có phiên nào (máy Windows chỉ có GPU tích hợp, biết ngay sau lần dò GPU lúc mở app) và sau khi phiên tự tắt rồi dừng. `indicators` về mặc định khi dừng phiên, nên cần một trường riêng, giữ qua lúc dừng.

Task này làm các nơi **bật** trường; nơi **đặt lại** (lúc bắt đầu phiên) ở Task 4.

**Files:**
- Modify: `src-tauri/src/state.rs` (struct `AppStatus`, `AppState::new`; thêm `impl AppStatus` và `mod tests` ở cuối file)
- Modify: `src-tauri/src/session.rs` (`TauriSink::indicators`; `impl SidecarEvents for StatusEvents`; `mod tests`)
- Modify: `src-tauri/src/sidecar/mod.rs` (`start_gpu_probe`)

- [ ] **Step 1: Viết test**

`src-tauri/src/state.rs`: thêm vào cuối file

```rust

#[cfg(test)]
mod tests {
    use super::*;

    /// QĐ2 của kế hoạch 03: máy chưa đủ sức biết được khi chưa có phiên nào (dò GPU, `asr-worker` chạy sẵn bằng CPU) thì
    /// ghi ngay; đang có phiên bắt đầu hay chạy thì không đổi (lần bắt đầu tự quyết, phiên đang chạy thì engine tự tắt).
    #[test]
    fn a_slow_machine_is_noted_only_when_no_session_starts_or_runs() {
        let state = AppState::new(Settings::defaults(UiLanguage::Vi), FileMeta::current(), false);
        assert!(!state.status().streaming_too_slow, "mở app: chưa biết gì");
        for (session, noted) in [
            (SessionStatus::Idle, true),
            (SessionStatus::Error, true),
            (SessionStatus::Starting, false),
            (SessionStatus::Running, false),
        ] {
            let mut status = state.status();
            status.session = session;
            status.note_machine_too_slow();
            assert_eq!(status.streaming_too_slow, noted, "{session:?}");
        }
    }
}
```

`src-tauri/src/session.rs`: thay

```rust
    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
```

bằng

```rust
    /// QĐ2 của kế hoạch 03 (spec 2026-10-10 §5, §6.3): `asr-worker` chạy bằng CPU lúc chưa có phiên (chạy sẵn khi mở cửa sổ
    /// chính) thì ghi máy chưa đủ nhanh ngay; đang có phiên thì không đổi. `llama-server` không quyết.
    #[test]
    fn an_asr_worker_on_the_cpu_notes_a_slow_machine_only_outside_a_session() {
        use asr_protocol::Backend;
        let ready = |which, backend: Option<Backend>| SidecarEvent::Ready {
            which,
            use_gpu: backend.is_some_and(Backend::is_gpu),
            backend,
            first_run: false,
        };
        let app = crate::test_support::mock_app();
        let events = status_events(&app);
        let state = app.state::<AppState>();
        events.on_event(&ready(Which::Llama, None));
        events.on_event(&ready(Which::Asr, Some(Backend::Metal)));
        assert!(!state.status().streaming_too_slow);
        state.update_status(|s| s.session = SessionStatus::Running);
        events.on_event(&ready(Which::Asr, Some(Backend::Cpu)));
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Asr });
        assert!(!state.status().streaming_too_slow, "đang dịch: engine tự quyết");
        state.update_status(|s| s.session = SessionStatus::Idle);
        events.on_event(&ready(Which::Asr, Some(Backend::Cpu)));
        assert!(state.status().streaming_too_slow, "chạy sẵn bằng CPU");
        let app = crate::test_support::mock_app();
        let events = status_events(&app);
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Llama });
        assert!(!app.state::<AppState>().status().streaming_too_slow, "llama-server không quyết");
        events.on_event(&SidecarEvent::CpuFallback { which: Which::Asr });
        assert!(app.state::<AppState>().status().streaming_too_slow, "chuyển sang CPU lúc chạy sẵn");
    }

    /// QĐ2 của kế hoạch 03 (spec 2026-10-10 §6.3): engine báo phiên dịch sau mỗi câu (tắt từ đầu hay tự tắt) thì ghi máy
    /// chưa đủ nhanh, và giữ cả sau khi dừng phiên; chỉ báo của phiên thì về mặc định.
    #[test]
    fn an_auto_off_is_kept_after_the_session_stops() {
        let app = crate::test_support::mock_app();
        let sink = TauriSink {
            app: app.handle().clone(),
            session: 1,
            asr_code: Arc::new(crate::test_support::FakeDeps::default()),
        };
        sink.indicators(&Indicators {
            lagging: true,
            ..Indicators::default()
        });
        assert!(!app.state::<AppState>().status().streaming_too_slow);
        sink.indicators(&Indicators {
            streaming_unavailable: true,
            ..Indicators::default()
        });
        let status = app.state::<AppState>().status();
        assert!(status.streaming_too_slow && status.indicators.streaming_unavailable);
        stop(app.handle());
        let status = app.state::<AppState>().status();
        assert!(status.streaming_too_slow, "ghi chú còn sau khi dừng");
        assert!(!status.indicators.streaming_unavailable, "chỉ báo của phiên về mặc định");
    }

    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib state 2>&1 | tail -n 20
```

Expected: lỗi biên dịch `no field streaming_too_slow on type AppStatus` và `no method named note_machine_too_slow found`.

- [ ] **Step 3: Cài**

`src-tauri/src/state.rs`: thay

```rust
    /// Đang trễ, không có âm thanh, dịch không dùng được (§4.4, §9).
    pub indicators: Indicators,
```

bằng

```rust
    /// Đang trễ, không có âm thanh, dịch không dùng được (§4.4, §9).
    pub indicators: Indicators,
    /// Máy chưa đủ nhanh cho chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, §6.3; QĐ2 của kế hoạch 03): bị
    /// tắt từ đầu (biết từ lần dò GPU trên Windows, `asr-worker` chạy CPU, hay lúc bắt đầu phiên), hoặc phiên hiện tại hay
    /// phiên gần nhất tự tắt. Giữ cả sau khi dừng, tới lần bắt đầu phiên sau. Cài đặt › Phụ đề ghi chú; thanh phụ đề làm
    /// nhạt phụ đề tạm như chế độ thường.
    pub streaming_too_slow: bool,
```

thay

```rust
                indicators: Indicators::default(),
                permission_suspected: false,
```

bằng

```rust
                indicators: Indicators::default(),
                streaming_too_slow: false,
                permission_suspected: false,
```

và thay

```rust
/// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
```

bằng

```rust
impl AppStatus {
    /// Máy chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5), biết được khi chưa có phiên nào: lần dò GPU
    /// trên Windows, hay `asr-worker` chạy sẵn bằng CPU. Cài đặt › Phụ đề ghi chú ngay (§6.3). Đang có phiên bắt đầu hay
    /// chạy thì không đổi: lần bắt đầu tự quyết theo `SessionDeps::streaming_supported`, còn phiên đang chạy thì engine tự
    /// tắt nếu không theo kịp (báo qua `Indicators::streaming_unavailable`).
    pub fn note_machine_too_slow(&mut self) {
        if !matches!(self.session, SessionStatus::Starting | SessionStatus::Running) {
            self.streaming_too_slow = true;
        }
    }
}

/// Phần cài đặt mà thanh phụ đề cần. Cửa sổ `overlay` chỉ đọc được phần này (§10.2).
```

`src-tauri/src/session.rs`: thay

```rust
    fn indicators(&self, indicators: &Indicators) {
        self.app
            .state::<AppState>()
            .update_status(|s| s.indicators = indicators.clone());
        changed(&self.app);
    }
```

bằng

```rust
    fn indicators(&self, indicators: &Indicators) {
        self.app.state::<AppState>().update_status(|s| {
            s.indicators = indicators.clone();
            // Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh (tắt từ đầu, hay vừa tự tắt): Cài đặt › Phụ đề ghi chú, giữ
            // tới lần bắt đầu phiên sau (spec 2026-10-10 §6.3; QĐ2 của kế hoạch 03).
            if indicators.streaming_unavailable {
                s.streaming_too_slow = true;
            }
        });
        changed(&self.app);
    }
```

thay

```rust
                self.set_loading(*which, None);
                // Chỉ báo CPU theo từng tiến trình phụ: tiến trình này chạy lại bằng GPU (bấm thử lại sau khi bỏ cuộc, Q4-2 của
                // review 02 lần 4) chỉ tắt cờ của chính nó (Q5-1 của review 02 lần 5).
                if let SidecarEvent::Ready { use_gpu, .. } = event {
                    self.set_cpu(*which, !*use_gpu);
                }
            }
            SidecarEvent::CpuFallback { which } => self.set_cpu(*which, true),
```

bằng

```rust
                self.set_loading(*which, None);
                // Chỉ báo CPU theo từng tiến trình phụ: tiến trình này chạy lại bằng GPU (bấm thử lại sau khi bỏ cuộc, Q4-2 của
                // review 02 lần 4) chỉ tắt cờ của chính nó (Q5-1 của review 02 lần 5).
                if let SidecarEvent::Ready { use_gpu, backend, .. } = event {
                    self.set_cpu(*which, !*use_gpu);
                    // `asr-worker` chạy bằng CPU: máy chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5).
                    if *which == Which::Asr && matches!(backend, Some(b) if !b.is_gpu()) {
                        state.update_status(AppStatus::note_machine_too_slow);
                    }
                }
            }
            SidecarEvent::CpuFallback { which } => {
                self.set_cpu(*which, true);
                if *which == Which::Asr {
                    state.update_status(AppStatus::note_machine_too_slow);
                }
            }
```

`src-tauri/src/sidecar/mod.rs`: thay

```rust
        app.state::<GpuProbe>()
            .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
        // Đề xuất gói theo VRAM của card rời (kế hoạch 04) đổi theo kết quả dò.
        crate::models::service::changed(&app);
    });
}
```

bằng

```rust
        let outcome = app
            .state::<GpuProbe>()
            .run(|| probe::run_probe(&files.asr_gpu, probe::probe_timeout(first)));
        // Đề xuất gói theo VRAM của card rời (kế hoạch 04) đổi theo kết quả dò.
        crate::models::service::changed(&app);
        // Chỉ có GPU tích hợp hay không có GPU dùng được: chưa đủ sức dịch trong lúc người nói chưa dừng (spec 2026-10-10
        // §5). Cài đặt › Phụ đề ghi chú ngay, chưa cần bắt đầu phiên (§6.3).
        if outcome.as_ref().is_some_and(probe::too_slow_for_streaming) {
            app.state::<crate::state::AppState>()
                .update_status(crate::state::AppStatus::note_machine_too_slow);
            crate::actions::status_changed(&app);
        }
    });
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib state
cargo test --locked -p meeting-translator --lib session
cargo clippy --locked -p meeting-translator --all-targets -- -D warnings
./scripts/check-windows.sh --locked
cargo fmt -p meeting-translator -- --check
```

Expected:
- test `state::tests::a_slow_machine_is_noted_only_when_no_session_starts_or_runs` đạt;
- mọi test `session::…` đạt, gồm `an_asr_worker_on_the_cpu_notes_a_slow_machine_only_outside_a_session` và `an_auto_off_is_kept_after_the_session_stops`; `a_gpu_ready_clears_the_cpu_fallback_note` vẫn đạt;
- clippy (macOS và Windows) sạch: `start_gpu_probe` vẫn biên dịch trên cả hai (nhánh Windows chỉ chạy khi `cfg!(windows)`);
- fmt không in gì.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src-tauri/src/state.rs src-tauri/src/session.rs src-tauri/src/sidecar/mod.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(app): trạng thái máy chưa đủ nhanh cho chế độ dịch trong lúc nói

AppStatus.streaming_too_slow (streamingTooSlow), giữ qua lúc dừng phiên. Bật khi lần dò GPU trên Windows chưa đủ sức,
khi asr-worker chạy bằng CPU lúc chưa có phiên, và khi engine báo streaming_unavailable (tắt từ đầu hay tự tắt).

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có ba file.

---

## Task 4: Nối engine: máy đủ sức và công tắc lúc bắt đầu phiên

QĐ1, QĐ2. Thay hai giá trị `false` tạm của kế hoạch 02 trong `engine_config`:
- `streaming_supported`: `SessionDeps::streaming_supported()`, hỏi sau `prepare` (đã biết thiết bị thật của `asr-worker`);
- `streaming_enabled`: `settings.translate_while_speaking`.

Ngay trước `Engine::start`, `start_with` đặt `streaming_too_slow = !streaming_supported` (đặt lại ghi chú theo máy của phiên này).

`FakeDeps` có `slow_machine` (đổi được giữa hai phiên) để test đường máy chưa đủ sức.

Từ task này, mọi test app chạy phiên với `FakeDeps` đều chạy chế độ dịch trong lúc nói (mặc định bật, máy giả đủ sức). Các test cũ phải vẫn đạt: chúng chỉ kiểm bản cuối (§4.5: lượt cuối giữ nguyên).

**Files:**
- Modify: `src-tauri/src/session.rs` (trait `SessionDeps`; `engine_config`; `start_with`; `impl SessionDeps for LiveDeps`; `mod tests`)
- Modify: `src-tauri/src/test_support.rs` (struct `FakeDeps`; `impl SessionDeps for FakeDeps`)
- Modify: `src-tauri/src/app_tests.rs` (thêm test cuối file)

- [ ] **Step 1: Viết test**

`src-tauri/src/session.rs`: thay **cả hàm test** `the_engine_follows_the_language_and_pause_settings` (bản sau kế hoạch 02; có thể đã có thêm dòng kiểm `streaming_supported`, `streaming_enabled`) bằng hai hàm dưới đây:

```rust
    #[test]
    fn the_engine_follows_the_language_and_pause_settings() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.vad_end_silence_ms = 500;
        let cfg = engine_config(
            &settings,
            PipelineConfig::default(),
            3_000_000,
            SharedGlossary::default(),
            true,
        );
        assert_eq!(cfg.languages, ["en", "zh", "ja", "ko", "vi"]);
        assert_eq!(cfg.target, MtLang::Vi);
        assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 500);
        assert!(!cfg.translation_context);
        assert_eq!(cfg.id_base, 3_000_000);
        settings.source_lock = Some(Lang::Ja);
        settings.target_language = Lang::En;
        settings.experimental.translation_context = true;
        let mut from_manifest = PipelineConfig::default();
        from_manifest.queue.lag_warn_ms = 8_000;
        from_manifest.segmenter.end_silence_ms = 900;
        let cfg = engine_config(&settings, from_manifest, 0, SharedGlossary::default(), true);
        assert_eq!(cfg.languages, ["ja"], "khóa ngôn ngữ nguồn thì bỏ nhận diện (§6.4)");
        assert_eq!(cfg.target, MtLang::En);
        assert!(cfg.translation_context);
        assert_eq!(cfg.pipeline.queue.lag_warn_ms, 8_000, "ngưỡng theo manifest");
        assert_eq!(
            cfg.pipeline.segmenter.end_silence_ms, 500,
            "vadEndSilenceMs của người dùng đè manifest"
        );
    }

    /// Spec 2026-10-10 §5, §6.3 (QĐ1 của kế hoạch 03): engine nhận máy có đủ sức không (app quyết lúc bắt đầu phiên) và
    /// công tắc của người dùng. Ngưỡng ngắt câu của chế độ này do engine tính (H6); app vẫn chỉ ghi `vadEndSilenceMs`.
    #[test]
    fn the_engine_gets_the_machine_and_the_live_switch() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        let cfg = engine_config(&settings, PipelineConfig::default(), 0, SharedGlossary::default(), true);
        assert!(cfg.streaming_supported && cfg.streaming_enabled, "mặc định: bật, máy đủ sức");
        assert_eq!(cfg.pipeline.segmenter.end_silence_ms, 50);
        let cfg = engine_config(&settings, PipelineConfig::default(), 0, SharedGlossary::default(), false);
        assert!(
            !cfg.streaming_supported && cfg.streaming_enabled,
            "máy chưa đủ sức: công tắc giữ nguyên"
        );
        settings.translate_while_speaking = false;
        let cfg = engine_config(&settings, PipelineConfig::default(), 0, SharedGlossary::default(), true);
        assert!(cfg.streaming_supported && !cfg.streaming_enabled, "người dùng tắt");
    }
```

`src-tauri/src/app_tests.rs`: thêm vào cuối file

```rust

/// Spec 2026-10-10 §5, §6.3 (QĐ1, QĐ2 của kế hoạch 03): máy chưa đủ sức thì phiên dịch sau mỗi câu ngay từ đầu, và trạng
/// thái báo để Cài đặt › Phụ đề ghi chú. Ghi chú còn sau khi dừng; phiên sau trên máy đủ sức thì hết.
#[test]
fn a_slow_machine_translates_after_each_sentence_from_the_start() {
    use std::sync::atomic::Ordering;
    let deps = FakeDeps {
        audio: FakeAudio::Tone,
        ..FakeDeps::default()
    };
    let slow = deps.slow_machine.clone();
    slow.store(true, Ordering::SeqCst);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    let state = app.state::<AppState>();
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    assert_eq!(status["streamingTooSlow"], true, "biết ngay lúc bắt đầu phiên");
    wait_until("engine báo phiên dịch sau mỗi câu", || {
        state.status().indicators.streaming_unavailable
    });
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "idle");
    assert_eq!(status["streamingTooSlow"], true, "ghi chú còn sau khi dừng");
    assert_eq!(status["indicators"]["streamingUnavailable"], false);
    slow.store(false, Ordering::SeqCst);
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(
        status["streamingTooSlow"], false,
        "phiên mới trên máy đủ sức thì hết ghi chú"
    );
    invoke(&main, "toggle_session", json!({})).unwrap();
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib session::tests::the_engine 2>&1 | tail -n 20
```

Expected: lỗi biên dịch `this function takes 4 arguments but 5 arguments were supplied` (`engine_config`) và `no field slow_machine on type FakeDeps`.

- [ ] **Step 3: Cài**

`src-tauri/src/session.rs`: thay

```rust
    /// Ngưỡng của pipeline: mặc định, hay theo manifest model đã ký (kế hoạch 04, 02a QĐ21).
    fn pipeline_config(&self) -> PipelineConfig {
        PipelineConfig::default()
    }
}
```

bằng

```rust
    /// Ngưỡng của pipeline: mặc định, hay theo manifest model đã ký (kế hoạch 04, 02a QĐ21).
    fn pipeline_config(&self) -> PipelineConfig {
        PipelineConfig::default()
    }
    /// Máy đủ sức cho chế độ dịch trong lúc người nói chưa dừng không (spec 2026-10-10 §5, "Tắt ngay từ đầu phiên"; QĐ1
    /// của kế hoạch 03). Gọi sau `prepare`, khi đã biết thiết bị thật của `asr-worker`. Mặc định đủ sức; engine vẫn tự tắt
    /// nếu máy không theo kịp.
    fn streaming_supported(&self) -> bool {
        true
    }
}
```

thay **cả hàm** `engine_config` (từ dòng `/// Cấu hình của engine từ cài đặt` tới dấu `}` đóng hàm; bản sau kế hoạch 02 có hai dòng `streaming_supported: false,` và `streaming_enabled: false,`) bằng

```rust
/// Cấu hình của engine từ cài đặt (§6.9): ngôn ngữ, độ nhạy ngắt câu, cờ ngữ cảnh, công tắc "Dịch trong lúc người nói chưa
/// dừng" (spec 2026-10-10 §6.3); từ điển thuật ngữ dùng chung; máy có đủ sức cho chế độ đó không (`streaming_supported`,
/// app quyết lúc bắt đầu phiên, §5); các ngưỡng khác theo `pipeline`.
pub fn engine_config(
    settings: &Settings,
    mut pipeline: PipelineConfig,
    id_base: u64,
    glossary: SharedGlossary,
    streaming_supported: bool,
) -> EngineConfig {
    pipeline.segmenter.end_silence_ms = u64::from(settings.vad_end_silence_ms);
    let languages = match settings.source_lock {
        Some(lang) => vec![code_of(lang).to_string()],
        None => settings
            .source_languages
            .iter()
            .map(|l| code_of(*l).to_string())
            .collect(),
    };
    EngineConfig {
        pipeline,
        languages,
        target: MtLang::from_code(code_of(settings.target_language)).expect("năm ngôn ngữ của F2"),
        translation_context: settings.experimental.translation_context,
        id_base,
        glossary,
        streaming_supported,
        streaming_enabled: settings.translate_while_speaking,
    }
}
```

thay

```rust
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        session: n,
        asr_code: session.deps.clone(),
    });
    let engine = match Engine::start(
        engine_config(&settings, session.deps.pipeline_config(), n * ID_STRIDE, glossary),
```

bằng

```rust
    let sink = Arc::new(TauriSink {
        app: app.clone(),
        session: n,
        asr_code: session.deps.clone(),
    });
    // Máy đủ sức cho chế độ dịch trong lúc người nói chưa dừng không (spec 2026-10-10 §5; QĐ1, QĐ2 của kế hoạch 03): hỏi
    // sau `prepare`, khi đã biết thiết bị thật của `asr-worker`. Ghi chú ở Cài đặt › Phụ đề theo máy của phiên này; lần tự
    // tắt của phiên trước không còn.
    let streaming_supported = session.deps.streaming_supported();
    state.update_status(|s| s.streaming_too_slow = !streaming_supported);
    log::info!("phiên dịch {n}: máy đủ sức dịch trong lúc nói: {streaming_supported}");
    let engine = match Engine::start(
        engine_config(
            &settings,
            session.deps.pipeline_config(),
            n * ID_STRIDE,
            glossary,
            streaming_supported,
        ),
```

và thay

```rust
    fn pipeline_config(&self) -> PipelineConfig {
        self.app
            .try_state::<Arc<crate::models::service::ModelService>>()
            .map(|models| models.pipeline_config())
            .unwrap_or_default()
    }
}
```

bằng

```rust
    fn pipeline_config(&self) -> PipelineConfig {
        self.app
            .try_state::<Arc<crate::models::service::ModelService>>()
            .map(|models| models.pipeline_config())
            .unwrap_or_default()
    }

    /// QĐ1 của kế hoạch 03: kết quả dò GPU (Windows; đã có sau `prepare`, không chờ) và thiết bị thật của `asr-worker` đang
    /// chạy (`Ready` của lần khởi động gần nhất).
    fn streaming_supported(&self) -> bool {
        let probed = self
            .app
            .try_state::<sidecar::GpuProbe>()
            .and_then(|p| p.get(Duration::ZERO));
        let backend = self.current().and_then(|m| m.asr_backend());
        sidecar::streaming_supported(cfg!(windows), probed.as_ref(), backend)
    }
}
```

`src-tauri/src/test_support.rs`: thay

```rust
    /// Prompt của từng request dịch, kể cả lần làm nóng.
    pub prompts: Arc<Mutex<Vec<String>>>,
}
```

bằng

```rust
    /// Prompt của từng request dịch, kể cả lần làm nóng.
    pub prompts: Arc<Mutex<Vec<String>>>,
    /// Máy chưa đủ sức dịch trong lúc người nói chưa dừng (`streaming_supported` trả `false`, spec 2026-10-10 §5); test đổi
    /// được giữa hai phiên.
    pub slow_machine: Arc<AtomicBool>,
}
```

và thay

```rust
    fn kill_all(&self) {
        self.shutdowns.lock().unwrap().push("kill_all");
    }
}
```

bằng

```rust
    fn kill_all(&self) {
        self.shutdowns.lock().unwrap().push("kill_all");
    }

    fn streaming_supported(&self) -> bool {
        !self.slow_machine.load(Ordering::SeqCst)
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib session
cargo test --locked -p meeting-translator --lib app_tests::a_slow_machine_translates_after_each_sentence_from_the_start
cargo test --locked -p meeting-translator --lib
cargo clippy --locked -p meeting-translator --all-targets -- -D warnings
cargo fmt -p meeting-translator -- --check
```

Expected:
- hai test `session::tests::the_engine_…` và test app mới đạt;
- **mọi** test của app đạt (`test result: ok`), kể cả các test cũ chạy phiên với `FakeAudio::Tone` (giờ chạy chế độ dịch trong lúc nói). Test cũ nào đỏ thì dừng, báo điều phối viên kèm tên test và nguyên lỗi; không sửa test cũ cho qua;
- clippy sạch; fmt không in gì.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src-tauri/src/session.rs src-tauri/src/test_support.rs src-tauri/src/app_tests.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(app): engine nhận máy đủ sức và công tắc dịch trong lúc nói

SessionDeps::streaming_supported (LiveDeps: kết quả dò GPU và thiết bị thật của asr-worker sau prepare);
engine_config truyền streaming_supported và streaming_enabled thay hai giá trị tạm của kế hoạch 02; lúc bắt đầu phiên
đặt lại streamingTooSlow theo máy. FakeDeps.slow_machine; test máy chưa đủ sức.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có ba file.

---

## Task 5: Dòng đang nói chỉ tới thanh phụ đề; đổi công tắc giữa phiên

QĐ4, QĐ5.
- `events.rs`: `SUBTITLE_LIVE = "subtitle://live"`, `SUBTITLE_LIVE_END = "subtitle://live-end"`, gửi riêng cho cửa sổ `overlay`.
- `TauriSink::live/live_end` chỉ gửi sự kiện, không chạm `TranscriptStore` (spec §6.4).
- `session::set_streaming_enabled`, gọi từ `actions::commit_settings` khi công tắc đổi; `start_with` áp công tắc lúc gắn engine, dưới cùng khóa.
- `FakeAudio::LongTone` (3 giây tiếng, 1 giây im lặng): đoạn đủ dài để có lần chép từng phần theo nhịp, bất kể ngưỡng ngắt câu chốt ở cổng của kế hoạch 02 (§4.1: lần chép khi vừa hết tiếng nói chỉ có khi ngưỡng lớn hơn 64 ms).

Capability không đổi: `core:event:allow-listen` đã cho thanh phụ đề nghe mọi sự kiện; `acl_tests` giữ nguyên.

**Files:**
- Modify: `src-tauri/src/events.rs`
- Modify: `src-tauri/src/session.rs` (`use pipeline::subtitle`; `start_with`; thêm `set_streaming_enabled` sau `stop`; `impl EventSink for TauriSink`; `mod tests`)
- Modify: `src-tauri/src/actions.rs` (`commit_settings`)
- Modify: `src-tauri/src/test_support.rs` (enum `FakeAudio`; `FakeCapture::read`)
- Modify: `src-tauri/src/app_tests.rs` (`use crate::events`; thêm hai hàm phụ và hai test cuối file)

- [ ] **Step 1: Viết test**

`src-tauri/src/session.rs`: thay

```rust
    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
```

bằng

```rust
    /// QĐ5 của spec 2026-10-10: dòng đang nói và lệnh gỡ nó chỉ tới thanh phụ đề, không tới cửa sổ chính, và không vào bản
    /// chép lời (§6.4). Payload giữ tên trường snake_case của H5.
    #[test]
    fn live_lines_reach_only_the_overlay() {
        use tauri::Listener;
        let app = crate::test_support::mock_app();
        let heard = |label: &str| {
            let got = Arc::new(Mutex::new(Vec::<String>::new()));
            let w = crate::test_support::window(&app, label);
            for event in [events::SUBTITLE_LIVE, events::SUBTITLE_LIVE_END] {
                let sink = got.clone();
                w.listen(event, move |e| {
                    sink.lock().unwrap().push(format!("{event} {}", e.payload()))
                });
            }
            got
        };
        let (to_overlay, to_main) = (heard(overlay::LABEL), heard(window::MAIN));
        let sink = TauriSink {
            app: app.handle().clone(),
            session: 1,
            asr_code: Arc::new(crate::test_support::FakeDeps::default()),
        };
        sink.live(&LiveLine {
            id: 1_000_007,
            extends: Some(1_000_006),
            src_lang: "en".into(),
            src_stable: "Hello".into(),
            src_tail: " every".into(),
            tgt_stable: "Xin chào".into(),
            tgt_tail: " mọi".into(),
            tgt_src_units: 1,
        });
        sink.live_end(&LiveEnd { id: 1_000_007 });
        let since = Instant::now();
        while to_overlay.lock().unwrap().len() < 2 {
            assert!(
                since.elapsed() < Duration::from_secs(10),
                "thanh phụ đề chưa nhận đủ"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        let got = to_overlay.lock().unwrap().clone();
        assert!(got[0].starts_with("subtitle://live {"), "{got:?}");
        assert!(
            got[0].contains(r#""extends":1000006"#) && got[0].contains(r#""tgt_tail":" mọi""#),
            "{got:?}"
        );
        assert_eq!(got[1], r#"subtitle://live-end {"id":1000007}"#);
        assert!(to_main.lock().unwrap().is_empty(), "cửa sổ chính không nhận (QĐ5)");
        assert!(
            app.state::<TranscriptStore>().snapshot().lines.is_empty(),
            "không vào bản chép lời"
        );
    }

    /// N-6 của review 02 lần 2: bấm Bắt đầu thì quên lý do bỏ cuộc cũ, mã lỗi giữa phiên về mặc định.
```

`src-tauri/src/app_tests.rs`: thay

```rust
use crate::events::{AUDIO_LEVEL, NOTICE, OVERLAY_SCROLL, SUBTITLE_DELTA, SUBTITLE_UPSERT};
```

bằng

```rust
use crate::events::{
    AUDIO_LEVEL, NOTICE, OVERLAY_SCROLL, SUBTITLE_DELTA, SUBTITLE_LIVE, SUBTITLE_LIVE_END, SUBTITLE_UPSERT,
};
```

và thêm vào cuối file

```rust

/// Ghi lại payload của một sự kiện tới đúng cửa sổ `window` (sự kiện gửi riêng cho cửa sổ khác thì không có ở đây).
fn heard(window: &tauri::WebviewWindow<tauri::test::MockRuntime>, event: &str) -> Arc<Mutex<Vec<Value>>> {
    let received = Arc::new(Mutex::new(Vec::new()));
    let sink = received.clone();
    window.listen(event, move |e| {
        sink.lock().unwrap().push(serde_json::from_str(e.payload()).unwrap())
    });
    received
}

/// Id lớn nhất trong các payload có trường `id`; 0 khi chưa có.
fn max_id(values: &[Value]) -> u64 {
    values.iter().filter_map(|v| v["id"].as_u64()).max().unwrap_or(0)
}

/// Spec 2026-10-10 §6.2, §6.3, QĐ5 (QĐ4, QĐ5 của kế hoạch 03): qua engine thật, dòng đang nói và lệnh gỡ nó chỉ tới thanh
/// phụ đề. Tắt công tắc giữa phiên thì từ đoạn kế tiếp không còn dòng đang nói (đoạn đang mở lúc tắt thì còn được); bật lại
/// thì có lại.
#[test]
fn live_lines_reach_only_the_overlay_and_follow_the_switch_mid_session() {
    let app = mock_app_with(FakeDeps {
        audio: FakeAudio::LongTone,
        ..FakeDeps::default()
    });
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let lives = heard(&overlay, SUBTITLE_LIVE);
    let ends = heard(&overlay, SUBTITLE_LIVE_END);
    let (lives_to_main, ends_to_main) = (heard(&main, SUBTITLE_LIVE), heard(&main, SUBTITLE_LIVE_END));
    let upserts = record(&app, SUBTITLE_UPSERT);
    invoke(&main, "toggle_session", json!({})).unwrap();
    wait_until("có dòng đang nói", || !lives.lock().unwrap().is_empty());
    wait_until("có lệnh gỡ dòng đang nói", || !ends.lock().unwrap().is_empty());
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": false } }),
    )
    .unwrap();
    let cutoff = max_id(&upserts.lock().unwrap()).max(max_id(&lives.lock().unwrap())) + 1;
    wait_until("hai câu sau mốc tắt đã dịch xong", || {
        upserts
            .lock()
            .unwrap()
            .iter()
            .any(|s| s["status"] == "done" && s["id"].as_u64().unwrap_or(0) > cutoff + 1)
    });
    let late: Vec<u64> = lives
        .lock()
        .unwrap()
        .iter()
        .filter_map(|v| v["id"].as_u64())
        .filter(|id| *id > cutoff)
        .collect();
    assert!(late.is_empty(), "đã tắt mà đoạn sau vẫn có dòng đang nói: {late:?}");
    invoke(
        &main,
        "update_settings",
        json!({ "patch": { "translateWhileSpeaking": true } }),
    )
    .unwrap();
    let resumed = max_id(&upserts.lock().unwrap());
    wait_until("bật lại thì đoạn mới có dòng đang nói", || {
        lives
            .lock()
            .unwrap()
            .iter()
            .any(|v| v["id"].as_u64().unwrap_or(0) > resumed)
    });
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert!(lives_to_main.lock().unwrap().is_empty(), "cửa sổ chính không nhận (QĐ5)");
    assert!(ends_to_main.lock().unwrap().is_empty());
    let line = lives.lock().unwrap()[0].clone();
    for key in [
        "id",
        "extends",
        "src_lang",
        "src_stable",
        "src_tail",
        "tgt_stable",
        "tgt_tail",
        "tgt_src_units",
    ] {
        assert!(line.get(key).is_some(), "LiveLine thiếu {key}: {line}");
    }
}

/// Spec 2026-10-10 §5: máy chưa đủ sức thì không có dòng đang nói nào, chỉ bản cuối.
#[test]
fn a_slow_machine_sends_no_live_lines() {
    let deps = FakeDeps {
        audio: FakeAudio::LongTone,
        ..FakeDeps::default()
    };
    deps.slow_machine.store(true, std::sync::atomic::Ordering::SeqCst);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    let overlay = window(&app, "overlay");
    let lives = heard(&overlay, SUBTITLE_LIVE);
    let upserts = record(&app, SUBTITLE_UPSERT);
    invoke(&main, "toggle_session", json!({})).unwrap();
    wait_until("hai câu dịch xong", || {
        upserts
            .lock()
            .unwrap()
            .iter()
            .filter(|s| s["status"] == "done")
            .count()
            >= 2
    });
    invoke(&main, "toggle_session", json!({})).unwrap();
    assert!(lives.lock().unwrap().is_empty(), "máy chưa đủ sức: dịch sau mỗi câu");
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib live_lines 2>&1 | tail -n 20
```

Expected: lỗi biên dịch `cannot find value SUBTITLE_LIVE in module events` (và `…SUBTITLE_LIVE_END…`), `no variant or associated item named LongTone found for enum FakeAudio`.

- [ ] **Step 3: Cài**

`src-tauri/src/events.rs`: thay

```rust
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};
```

bằng

```rust
use pipeline::subtitle::{LiveEnd, LiveLine};
use serde::Serialize;
use tauri::{AppHandle, Emitter, EventTarget, Runtime};
```

thay

```rust
/// Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
pub const AUDIO_LEVEL: &str = "audio://level";
```

bằng

```rust
/// Dòng đang nói (spec 2026-10-10 §6.2, `pipeline::subtitle::LiveLine`). Chỉ gửi cho thanh phụ đề: cửa sổ chính, bản chép
/// lời, lịch sử và xuất file chỉ có bản cuối (QĐ5 của spec 2026-10-10).
pub const SUBTITLE_LIVE: &str = "subtitle://live";
/// Gỡ dòng đang nói (`pipeline::subtitle::LiveEnd`); chỉ gửi cho thanh phụ đề.
pub const SUBTITLE_LIVE_END: &str = "subtitle://live-end";
/// Mức âm lượng vào (RMS 0–1), khoảng 10 lần mỗi giây trong lúc dịch.
pub const AUDIO_LEVEL: &str = "audio://level";
```

và thay

```rust
pub fn overlay_view<R: Runtime>(app: &AppHandle<R>, view: &OverlayView) {
    emit(app, overlay::LABEL, OVERLAY_VIEW, view);
}
```

bằng

```rust
pub fn overlay_view<R: Runtime>(app: &AppHandle<R>, view: &OverlayView) {
    emit(app, overlay::LABEL, OVERLAY_VIEW, view);
}

/// Dòng đang nói: chỉ thanh phụ đề vẽ (QĐ5 của spec 2026-10-10).
pub fn subtitle_live<R: Runtime>(app: &AppHandle<R>, line: &LiveLine) {
    emit(app, overlay::LABEL, SUBTITLE_LIVE, line);
}

/// Gỡ dòng đang nói trên thanh phụ đề.
pub fn subtitle_live_end<R: Runtime>(app: &AppHandle<R>, end: &LiveEnd) {
    emit(app, overlay::LABEL, SUBTITLE_LIVE_END, end);
}
```

`src-tauri/src/session.rs`: thay

```rust
use pipeline::subtitle::{Delta, Subtitle};
```

bằng

```rust
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Subtitle};
```

thay

```rust
    *session.engine.lock().unwrap() = Some(engine);
    session.deps.begin_session();
```

bằng

```rust
    {
        let mut slot = session.engine.lock().unwrap();
        // Công tắc "Dịch trong lúc người nói chưa dừng" có thể vừa đổi trong lúc chuẩn bị (tới 180 giây nạp model): áp giá
        // trị lúc này, dưới cùng khóa với `set_streaming_enabled`, nên không lần đổi nào bị lỡ (QĐ4 của kế hoạch 03).
        engine.set_streaming_enabled(state.settings().translate_while_speaking);
        *slot = Some(engine);
    }
    session.deps.begin_session();
```

thay

```rust
/// Dừng phiên `n` vì lỗi (§9). Gọi từ luồng riêng, không từ luồng của engine. Phiên đó đã dừng (người dùng bấm Dừng,
```

bằng

```rust
/// Công tắc "Dịch trong lúc người nói chưa dừng" vừa đổi (spec 2026-10-10 §6.3; QĐ4 của kế hoạch 03): phiên đang chạy áp
/// dụng từ đoạn kế tiếp (`Engine::set_streaming_enabled`). Không có phiên thì thôi: phiên sau đọc cài đặt lúc gắn engine,
/// dưới cùng khóa `engine`.
pub fn set_streaming_enabled<R: Runtime>(app: &AppHandle<R>, on: bool) {
    let Some(session) = app.try_state::<Session>() else {
        return;
    };
    let slot = session.engine.lock().unwrap();
    if let Some(engine) = slot.as_ref() {
        engine.set_streaming_enabled(on);
        log::info!("dịch trong lúc người nói chưa dừng: {}", if on { "bật" } else { "tắt" });
    }
}

/// Dừng phiên `n` vì lỗi (§9). Gọi từ luồng riêng, không từ luồng của engine. Phiên đó đã dừng (người dùng bấm Dừng,
```

và thay

```rust
    /// Đếm phút cho hạn mức (§6.8): `Break` khi chạm hạn mức, engine dừng phiên với `quotaExhausted`.
```

bằng

```rust
    /// Dòng đang nói (spec 2026-10-10 §6.2): chỉ tới thanh phụ đề (QĐ5). Không vào bản chép lời, lịch sử hay log (§6.4).
    fn live(&self, line: &LiveLine) {
        events::subtitle_live(&self.app, line);
    }

    fn live_end(&self, end: &LiveEnd) {
        events::subtitle_live_end(&self.app, end);
    }

    /// Đếm phút cho hạn mức (§6.8): `Break` khi chạm hạn mức, engine dừng phiên với `quotaExhausted`.
```

`src-tauri/src/actions.rs`: thay

```rust
    if previous.update_channel != next.update_channel {
        updater::channel_changed(app);
    }
    next
}
```

bằng

```rust
    if previous.update_channel != next.update_channel {
        updater::channel_changed(app);
    }
    // Phiên đang chạy áp dụng từ đoạn kế tiếp (spec 2026-10-10 §6.3).
    if previous.translate_while_speaking != next.translate_while_speaking {
        session::set_streaming_enabled(app, next.translate_while_speaking);
    }
    next
}
```

`src-tauri/src/test_support.rs`: thay

```rust
    /// 1 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật.
    Tone,
}
```

bằng

```rust
    /// 1 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật.
    Tone,
    /// 3 giây tiếng, 1 giây im lặng, lặp lại; phát nhanh gấp 10 lần thời gian thật. Đoạn đủ dài cho lần chép từng phần
    /// theo nhịp (`streaming.min_partial_speech_ms` 1000, spec 2026-10-10 §4.1), với mọi ngưỡng ngắt câu của chế độ này.
    LongTone,
}
```

và thay

```rust
            let speaking = self.audio == FakeAudio::Tone && (self.pos / 16_000).is_multiple_of(2);
```

bằng

```rust
            let speaking = match self.audio {
                FakeAudio::Silence => false,
                FakeAudio::Tone => (self.pos / 16_000).is_multiple_of(2),
                FakeAudio::LongTone => self.pos % 64_000 < 48_000,
            };
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p meeting-translator --lib session::tests::live_lines_reach_only_the_overlay
cargo test --locked -p meeting-translator --lib app_tests::live_lines_reach_only_the_overlay_and_follow_the_switch_mid_session
cargo test --locked -p meeting-translator --lib app_tests::a_slow_machine_sends_no_live_lines
cargo test --locked -p meeting-translator --lib
cargo clippy --locked -p meeting-translator --all-targets -- -D warnings
cargo fmt -p meeting-translator -- --check
```

Expected:
- ba test mới đạt; chạy lại test giữa phiên thêm hai lần (`for i in 1 2; do cargo test --locked -p meeting-translator --lib app_tests::live_lines_reach_only_the_overlay_and_follow_the_switch_mid_session; done`) vẫn đạt, tức không chập chờn;
- mọi test của app đạt, gồm ba test `acl_tests` (capability không đổi);
- clippy sạch; fmt không in gì.

Nếu `live_lines_reach_only_the_overlay_and_follow_the_switch_mid_session` dừng ở "có dòng đang nói" (quá 10 giây): engine không phát `live` với `FakeDeps`, tức hành vi của kế hoạch 02 khác hợp đồng H6; dừng, báo điều phối viên kèm log test, không nới test.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src-tauri/src/events.rs src-tauri/src/session.rs src-tauri/src/actions.rs \
  src-tauri/src/test_support.rs src-tauri/src/app_tests.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(app): sự kiện dòng đang nói chỉ tới thanh phụ đề, đổi công tắc giữa phiên

subtitle://live và subtitle://live-end gửi riêng cho cửa sổ overlay (QĐ5), không vào bản chép lời. Đổi công tắc thì
phiên đang chạy áp dụng từ đoạn kế tiếp (Engine::set_streaming_enabled); lúc gắn engine áp giá trị lúc đó dưới cùng
khóa. FakeAudio::LongTone; test qua engine thật, máy chưa đủ sức không có dòng đang nói.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có năm file.

---

## Task 6: Kiểu TS, dữ liệu mẫu và ba hàm thuần

Kiểu trong `src/lib/ipc.ts` phải khớp phía Rust (đầu file ghi vậy):
- `LiveLine`, `LiveEnd`: tên trường snake_case đúng H5 (như `Subtitle`);
- `Indicators.streamingUnavailable`, `AppStatus.streamingTooSlow`, `Settings.translateWhileSpeaking`, `OverlayView.translateWhileSpeaking`: camelCase như phía Rust gửi;
- `Events` thêm `subtitle://live` và `subtitle://live-end`.

Ba hàm thuần ở `src/lib/subtitleView.ts` (QĐ3, QĐ8): `streamingEffective`, `streamingNote`, `splitTail`.

Mọi chỗ dựng đủ một `AppStatus`, `Settings` hay `OverlayView` trong test (và trong IPC giả của `scripts/ui-preview`, chỉ bundle chứ không qua `tsc`) thêm trường mới. Store của cửa sổ chính không nghe `subtitle://live` (QĐ5): thêm test giữ điều đó.

**Files:**
- Modify: `src/lib/ipc.ts`
- Modify: `src/lib/subtitleView.ts` (cuối file)
- Modify: `src/lib/subtitleView.test.ts`
- Modify: `src/store/app.test.ts`, `src/store/overlay.test.ts`, `src/store/transcript.test.ts` (dữ liệu mẫu; một test mới ở `transcript.test.ts`)
- Modify: `scripts/ui-preview/tauri-mock.ts` (dữ liệu mẫu; tham số `slow=1`, `tws=0`)

- [ ] **Step 1: Viết test và sửa dữ liệu mẫu**

`src/lib/subtitleView.test.ts`: thay

```ts
  overlayBackground,
  overlayNotes,
} from "./subtitleView";
```

bằng

```ts
  overlayBackground,
  overlayNotes,
  splitTail,
  streamingEffective,
  streamingNote,
} from "./subtitleView";
```

thay

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
```

bằng

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: false,
```

thay

```ts
          indicators: { lagging: true, noAudio: true, translationUnavailable: true },
```

bằng

```ts
          indicators: { lagging: true, noAudio: true, translationUnavailable: true, streamingUnavailable: true },
```

thay

```ts
    expect(overlayNotes(status({ session: "idle", indicators: { lagging: true, noAudio: true, translationUnavailable: false } }))).toEqual([]);
```

bằng

```ts
    expect(
      overlayNotes(
        status({
          session: "idle",
          indicators: { lagging: true, noAudio: true, translationUnavailable: false, streamingUnavailable: false },
        }),
      ),
    ).toEqual([]);
```

và thêm vào cuối file

```ts

describe("dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6)", () => {
  it("chế độ có hiệu lực khi công tắc bật và máy chưa bị coi là chưa đủ nhanh", () => {
    expect(streamingEffective(true, status({}))).toBe(true);
    expect(streamingEffective(true, null)).toBe(true);
    expect(streamingEffective(false, status({}))).toBe(false);
    expect(streamingEffective(true, status({ streamingTooSlow: true }))).toBe(false);
  });

  it("ghi chú máy chưa đủ nhanh chỉ khi công tắc bật", () => {
    expect(streamingNote(true, status({ streamingTooSlow: true }))).toBe(true);
    expect(streamingNote(false, status({ streamingTooSlow: true }))).toBe(false);
    expect(streamingNote(true, status({}))).toBe(false);
    expect(streamingNote(true, null)).toBe(false);
  });

  it("tách câu mẫu thành phần ổn định và phần tạm", () => {
    expect(splitTail("Bạn có thể gửi bản dự toán", "bản dự toán")).toEqual({
      stable: "Bạn có thể gửi ",
      tail: "bản dự toán",
    });
    expect(splitTail("金曜日までに予算の見積もりを共有", "見積もりを共有")).toEqual({
      stable: "金曜日までに予算の",
      tail: "見積もりを共有",
    });
    expect(splitTail("Hello", "")).toEqual({ stable: "Hello", tail: "" });
    expect(splitTail("Hello", "world")).toEqual({ stable: "Hello", tail: "" });
  });
});
```

`src/store/app.test.ts`: thay

```ts
    lastMonitor: null,
  },
  modelTier: null,
```

bằng

```ts
    lastMonitor: null,
  },
  translateWhileSpeaking: true,
  modelTier: null,
```

và thay

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
```

bằng

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: false,
```

`src/store/overlay.test.ts`: thay

```ts
  showSource: false,
  locked: false,
};
```

bằng

```ts
  showSource: false,
  locked: false,
  translateWhileSpeaking: true,
};
```

và thay

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
```

bằng

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: false,
```

`src/store/transcript.test.ts`: thay

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
```

bằng

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: false,
```

và thay

```ts
  it("phiên mới thì bắt đầu rỗng; chạy rồi thì đọc lại giờ bắt đầu, không thêm lại dòng đã gộp", async () => {
```

bằng

```ts
  // Spec 2026-10-10 QĐ5: dòng đang nói chỉ có trên thanh phụ đề; bản chép lời của cửa sổ chính không nghe hai sự kiện đó.
  it("không nghe dòng đang nói", async () => {
    const { fake, store } = setup(transcript([sub(1, "một")]));
    await store.getState().init();
    expect(fake.listenerCount("subtitle://live")).toBe(0);
    expect(fake.listenerCount("subtitle://live-end")).toBe(0);
    fake.emit("subtitle://live", {
      id: 2,
      extends: null,
      src_lang: "en",
      src_stable: "Hel",
      src_tail: "lo",
      tgt_stable: "Xin",
      tgt_tail: " chào",
      tgt_src_units: 1,
    });
    expect(store.getState().transcript?.lines.map((l) => l.id)).toEqual([1]);
  });

  it("phiên mới thì bắt đầu rỗng; chạy rồi thì đọc lại giờ bắt đầu, không thêm lại dòng đã gộp", async () => {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm test 2>&1 | tail -n 30
```

Expected: `src/lib/subtitleView.test.ts` đỏ, vì `streamingEffective`, `streamingNote`, `splitTail` chưa có (`is not a function`); các file test khác vẫn đạt (Vitest không kiểm kiểu).

- [ ] **Step 3: Cài**

`src/lib/ipc.ts`: thay

```ts
    positions: Record<string, OverlayRect>;
    lastMonitor: string | null;
  };
  modelTier: ModelTier | null;
```

bằng

```ts
    positions: Record<string, OverlayRect>;
    lastMonitor: string | null;
  };
  // Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.3, Cài đặt › Phụ đề), mặc định bật. Đổi khi đang dịch thì có tác
  // dụng từ đoạn kế tiếp.
  translateWhileSpeaking: boolean;
  modelTier: ModelTier | null;
```

thay

```ts
export interface Indicators {
  lagging: boolean;
  noAudio: boolean;
  translationUnavailable: boolean;
}
```

bằng

```ts
export interface Indicators {
  lagging: boolean;
  noAudio: boolean;
  translationUnavailable: boolean;
  // Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh: bị tắt từ đầu hay vừa tự tắt (spec 2026-10-10 §5, §6.3).
  streamingUnavailable: boolean;
}
```

thay

```ts
  indicators: Indicators;
  // macOS: âm thanh vào toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền (§9).
```

bằng

```ts
  indicators: Indicators;
  // Máy chưa đủ nhanh cho chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, §6.3): bị tắt từ đầu, hay phiên
  // hiện tại hoặc phiên gần nhất tự tắt. Còn sau khi dừng, tới lần bắt đầu phiên sau. Cài đặt › Phụ đề ghi chú.
  streamingTooSlow: boolean;
  // macOS: âm thanh vào toàn im lặng tuyệt đối trong khi có app đang phát: nghi chưa được cấp quyền (§9).
```

thay

```ts
  showSource: boolean;
  locked: boolean;
}

// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
```

bằng

```ts
  showSource: boolean;
  locked: boolean;
  // Công tắc "Dịch trong lúc người nói chưa dừng": cùng `AppStatus.streamingTooSlow`, thanh phụ đề biết chế độ có hiệu lực
  // không (spec 2026-10-10 §6.1).
  translateWhileSpeaking: boolean;
}

// Phụ đề (spec §6.6, `pipeline::subtitle::Subtitle`).
```

thay

```ts
// Phần chữ dịch mới trong lúc đang dịch: nối vào `tgt_text` của phụ đề cùng `id`.
export interface SubtitleDelta {
  id: number;
  text: string;
}
```

bằng

```ts
// Phần chữ dịch mới trong lúc đang dịch: nối vào `tgt_text` của phụ đề cùng `id`.
export interface SubtitleDelta {
  id: number;
  text: string;
}

// Dòng đang nói (spec 2026-10-10 §6.1–§6.2, `pipeline::subtitle::LiveLine`): chỉ thanh phụ đề nhận (QĐ5). Câu gốc và bản
// dịch đều chia hai tầng: phần ổn định (`*_stable`) và phần tạm (`*_tail`, tự mang khoảng trắng đầu khi cần). `id` là id
// mà đoạn sẽ nhận khi đóng (cùng không gian id với `Subtitle`); `extends` là id của phụ đề tạm mà dòng này nối tiếp: dòng
// hiện thay chỗ phụ đề đó.
export interface LiveLine {
  id: number;
  extends: number | null;
  src_lang: string;
  src_stable: string;
  src_tail: string;
  tgt_stable: string;
  tgt_tail: string;
  // Chỉ để đo (spec 2026-10-10 §10.1); giao diện bỏ qua.
  tgt_src_units: number;
}

// Gỡ dòng đang nói có `id` này.
export interface LiveEnd {
  id: number;
}
```

và thay

```ts
  "subtitle://upsert": Subtitle;
  "subtitle://delta": SubtitleDelta;
```

bằng

```ts
  "subtitle://upsert": Subtitle;
  "subtitle://delta": SubtitleDelta;
  // Dòng đang nói và lệnh gỡ nó (spec 2026-10-10 §6.2): chỉ tới thanh phụ đề; cửa sổ chính không nghe (QĐ5).
  "subtitle://live": LiveLine;
  "subtitle://live-end": LiveEnd;
```

`src/lib/subtitleView.ts`: thêm vào cuối file

```ts

// Chế độ dịch trong lúc người nói chưa dừng có hiệu lực không (spec 2026-10-10 §5, §6; QĐ3 của kế hoạch 03): công tắc bật
// và máy chưa bị coi là chưa đủ nhanh (tắt từ đầu phiên, hay phiên này hoặc phiên gần nhất tự tắt). Thanh phụ đề dùng để
// thôi làm nhạt cả dòng phụ đề tạm (§6.1); khung xem trước dùng để hiện mẫu hai tầng (§6.3).
export function streamingEffective(translateWhileSpeaking: boolean, status: AppStatus | null): boolean {
  return translateWhileSpeaking && !status?.streamingTooSlow;
}

// Ghi chú "Máy này chưa đủ nhanh…" dưới công tắc ở Cài đặt › Phụ đề (spec 2026-10-10 §6.3; QĐ8 của kế hoạch 03): công tắc
// bật mà máy chưa đủ nhanh. Tắt công tắc thì người dùng đã chọn dịch sau mỗi câu, không cần ghi chú.
export function streamingNote(translateWhileSpeaking: boolean, status: AppStatus | null): boolean {
  return translateWhileSpeaking && status?.streamingTooSlow === true;
}

// Tách câu mẫu hai tầng của khung xem trước: `full` là cả câu, `tail` là phần cuối (phần tạm). Phần ổn định giữ khoảng
// trắng ở cuối (nếu có) để hai phần nối lại đúng như câu. `full` không kết thúc bằng `tail` thì cả câu là phần ổn định.
export function splitTail(full: string, tail: string): { stable: string; tail: string } {
  if (tail === "" || !full.endsWith(tail)) return { stable: full, tail: "" };
  return { stable: full.slice(0, full.length - tail.length), tail };
}
```

`scripts/ui-preview/tauri-mock.ts`: thay

```ts
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
```

bằng

```ts
//   overlay (overlay.html): locked=1  source=0  text=<màu>  bg=<màu>  opacity=<0–1>  size=<px>  latest=1  notes=<note,…>
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
```

thay

```ts
    lastMonitor: null,
  },
  modelTier: "standard",
```

bằng

```ts
    lastMonitor: null,
  },
  translateWhileSpeaking: param("tws") !== "0",
  modelTier: "standard",
```

thay

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false },
```

bằng

```ts
  indicators: { lagging: false, noAudio: false, translationUnavailable: false, streamingUnavailable: false },
  streamingTooSlow: param("slow") === "1",
```

thay

```ts
    showSource: o.showSource,
    locked: o.locked,
  };
}
```

bằng

```ts
    showSource: o.showSource,
    locked: o.locked,
    translateWhileSpeaking: settings.translateWhileSpeaking,
  };
}
```

và thay

```ts
        indicators: { lagging: n.includes("lagging"), noAudio: n.includes("noAudio"), translationUnavailable: n.includes("translationUnavailable") },
```

bằng

```ts
        indicators: {
          lagging: n.includes("lagging"),
          noAudio: n.includes("noAudio"),
          translationUnavailable: n.includes("translationUnavailable"),
          streamingUnavailable: false,
        },
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm build && pnpm test
```

Expected:
- `tsc --noEmit` không lỗi (mọi chỗ dựng `AppStatus`, `Settings`, `OverlayView` trong `src/` đã đủ trường) và `vite build` dựng xong `dist/index.html`, `dist/overlay.html`;
- Vitest đạt hết, gồm ba test mới của `subtitleView.test.ts` và `transcript store › không nghe dòng đang nói`.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/lib/ipc.ts src/lib/subtitleView.ts src/lib/subtitleView.test.ts src/store/app.test.ts \
  src/store/overlay.test.ts src/store/transcript.test.ts scripts/ui-preview/tauri-mock.ts
git -C "$W" commit -m "$(cat <<'EOF'
feat(ui): kiểu của dòng đang nói và chế độ dịch trong lúc nói

LiveLine, LiveEnd (snake_case như H5), sự kiện subtitle://live và subtitle://live-end, Indicators.streamingUnavailable,
AppStatus.streamingTooSlow, translateWhileSpeaking trong Settings và OverlayView. streamingEffective, streamingNote,
splitTail. Bản chép lời của cửa sổ chính không nghe dòng đang nói (QĐ5). IPC giả của ui-preview: tws=0, slow=1.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có bảy file.

---

## Task 7: Store của thanh phụ đề: dòng đang nói

QĐ6. Bốn hàm thuần trong `src/store/overlay.ts`, cùng kiểu với `upsertLine`/`appendDelta`:
- `applyLive(live, lines, line)`: thay theo `id`, dòng mới xếp theo `id`; dòng tới sau khi lượt cuối của đoạn đã chốt thì bỏ;
- `endLive(live, id)`: gỡ;
- `settleLive(live, subtitle)`: phụ đề chốt gỡ dòng cùng `id` (hay có `id` đó trong `replaces`);
- `visibleRows(lines, live)`: các dòng thanh phụ đề vẽ, theo thứ tự và chỗ của QĐ6.

Không có gì đổi thì ba hàm đầu trả nguyên mảng cũ (Zustand so tham chiếu, thanh không vẽ lại). Store giữ `live`; phiên mới, phiên dừng hay lỗi thì bỏ hết (lưới an toàn; engine đã gửi `live-end`).

**Files:**
- Modify: `src/store/overlay.ts`
- Modify: `src/store/overlay.test.ts`

- [ ] **Step 1: Viết test**

`src/store/overlay.test.ts`: thay

```ts
import type { AppStatus, OverlayView, Subtitle } from "../lib/ipc";
import { MAX_LINES, appendDelta, createOverlayStore, createResizeDrag, upsertLine } from "./overlay";
```

bằng

```ts
import type { AppStatus, LiveLine, OverlayView, Subtitle } from "../lib/ipc";
import {
  MAX_LINES,
  type OverlayRow,
  appendDelta,
  applyLive,
  createOverlayStore,
  createResizeDrag,
  endLive,
  settleLive,
  upsertLine,
  visibleRows,
} from "./overlay";
```

thay

```ts
describe("kéo cạnh để đổi kích thước (§4.4)", () => {
```

bằng

```ts
const live = (id: number, patch: Partial<LiveLine> = {}): LiveLine => ({
  id,
  extends: null,
  src_lang: "en",
  src_stable: `src ${id}`,
  src_tail: " tạm",
  tgt_stable: `dịch ${id}`,
  tgt_tail: " tạm",
  tgt_src_units: 2,
  ...patch,
});

const at = (status: Subtitle["status"], s: Subtitle): Subtitle => ({ ...s, status });

describe("dòng đang nói (spec 2026-10-10 §6.1)", () => {
  it("cập nhật theo id, dòng mới xếp theo id; live-end gỡ đúng dòng", () => {
    let l = applyLive([], [], live(7));
    l = applyLive(l, [], live(5));
    l = applyLive(l, [], live(7, { tgt_tail: " mới" }));
    expect(l.map((x) => [x.id, x.tgt_tail])).toEqual([
      [5, " tạm"],
      [7, " mới"],
    ]);
    expect(endLive(l, 5).map((x) => x.id)).toEqual([7]);
    expect(endLive(l, 9)).toBe(l);
  });

  it("dòng tới sau khi lượt cuối của đoạn đã chốt thì bỏ", () => {
    const lines = [sub(6, "sáu"), at("translating", sub(7, ""))];
    const none: LiveLine[] = [];
    expect(applyLive(none, lines, live(6))).toBe(none);
    expect(applyLive(none, lines, live(7)).map((x) => x.id)).toEqual([7]);
  });

  it("phụ đề chốt gỡ dòng cùng id hay dòng đã gộp vào nó; chưa chốt thì giữ", () => {
    const l = [live(7)];
    expect(settleLive(l, at("asr_done", sub(7, "")))).toBe(l);
    expect(settleLive(l, at("translating", sub(7, "bảy")))).toBe(l);
    for (const status of ["done", "failed", "same_lang", "skipped", "dropped"] as const) {
      expect(settleLive(l, at(status, sub(7, "bảy")))).toEqual([]);
    }
    expect(settleLive(l, { ...sub(5, "năm gộp"), replaces: [6, 7] })).toEqual([]);
    expect(settleLive(l, sub(8, "tám"))).toBe(l);
    // Dòng nối tiếp phụ đề 6: phụ đề 6 đã `done` (tạm) từ trước, chỉ `live-end` mới gỡ (QĐ5 của kế hoạch 02).
    const extending = [live(7, { extends: 6 })];
    expect(settleLive(extending, sub(6, "sáu", true))).toBe(extending);
  });
});

describe("visibleRows (spec 2026-10-10 §6.1)", () => {
  const ids = (rows: OverlayRow[]) => rows.map((r) => (r.kind === "live" ? `live ${r.live.id}` : r.line.id));

  it("không có dòng đang nói thì là các phụ đề, giữ nguyên đối tượng", () => {
    const lines = [sub(1, "a"), sub(2, "b")];
    const rows = visibleRows(lines, []);
    expect(ids(rows)).toEqual([1, 2]);
    expect(rows[0]?.kind === "line" && rows[0].line).toBe(lines[0]);
  });

  it("dòng đang nói nằm sau dòng cuối", () => {
    expect(ids(visibleRows([sub(1, "a"), sub(2, "b")], [live(3)]))).toEqual([1, 2, "live 3"]);
  });

  it("dòng nối tiếp một phụ đề tạm nằm đúng chỗ phụ đề đó (không về cuối), phụ đề đó tạm ẩn", () => {
    expect(ids(visibleRows([sub(1, "a"), sub(2, "b", true)], [live(3, { extends: 2 })]))).toEqual([1, "live 3"]);
    expect(ids(visibleRows([sub(1, "a"), sub(2, "b", true), sub(3, "c")], [live(4, { extends: 2 })]))).toEqual([
      1,
      "live 4",
      3,
    ]);
  });

  it("lượt cuối đang chạy: dòng đang nói thay chỗ phụ đề cùng id tới khi gỡ", () => {
    const lines = [sub(1, "a"), at("asr_done", sub(2, ""))];
    expect(ids(visibleRows(lines, [live(2)]))).toEqual([1, "live 2"]);
    expect(ids(visibleRows(lines, []))).toEqual([1, 2]);
  });

  it("hai dòng cùng một chỗ: dòng mới nhất hiện, dòng cũ và phụ đề đều ẩn", () => {
    const lines = [sub(1, "a"), { ...at("asr_done", sub(2, "")), provisional: true }];
    expect(ids(visibleRows(lines, [live(2), live(3, { extends: 2 })]))).toEqual([1, "live 3"]);
  });

  it("phụ đề được nối tiếp đã trôi khỏi thanh: dòng đang nói về sau dòng cuối", () => {
    expect(ids(visibleRows([sub(5, "e")], [live(7, { extends: 4 })]))).toEqual([5, "live 7"]);
  });
});

describe("store: dòng đang nói", () => {
  it("nhận live và live-end, phụ đề chốt gỡ dòng cùng id; phiên dừng, lỗi hay phiên mới thì bỏ hết", async () => {
    const fake = fakeIpc({ get_overlay_view: () => view });
    const store = createOverlayStore(fake.ipc);
    await store.getState().init();
    fake.emit("app://status", status("starting", 1));
    fake.emit("app://status", status("running", 2));
    fake.emit("subtitle://upsert", sub(1, "một"));
    fake.emit("subtitle://live", live(2));
    fake.emit("subtitle://live", live(2, { tgt_tail: " nữa" }));
    expect(store.getState().live.map((x) => x.tgt_tail)).toEqual([" nữa"]);
    fake.emit("subtitle://upsert", { ...sub(2, ""), status: "asr_done" });
    expect(store.getState().live.map((x) => x.id)).toEqual([2]);
    fake.emit("subtitle://upsert", sub(2, "hai"));
    expect(store.getState().live).toEqual([]);
    fake.emit("subtitle://live", live(3));
    const before = store.getState().live;
    fake.emit("app://status", status("running", 3));
    expect(store.getState().live).toBe(before);
    fake.emit("subtitle://live-end", { id: 3 });
    expect(store.getState().live).toEqual([]);
    fake.emit("subtitle://live", live(4));
    fake.emit("app://status", status("idle", 4));
    expect(store.getState().live).toEqual([]);
    expect(store.getState().lines.map((l) => l.id)).toEqual([1, 2]);
    fake.emit("app://status", status("starting", 5));
    fake.emit("app://status", status("running", 6));
    fake.emit("subtitle://live", live(1_000_001));
    fake.emit("app://status", status("error", 7));
    expect(store.getState().live).toEqual([]);
  });
});

describe("kéo cạnh để đổi kích thước (§4.4)", () => {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm test 2>&1 | tail -n 30
```

Expected: `src/store/overlay.test.ts` đỏ: `applyLive`, `endLive`, `settleLive`, `visibleRows` chưa có (`is not a function`); các file khác đạt.

- [ ] **Step 3: Cài**

`src/store/overlay.ts`: thay

```ts
import type { AppStatus, Ipc, OverlayView, ResizeEdge, Subtitle, SubtitleDelta } from "../lib/ipc";
```

bằng

```ts
import type { AppStatus, Ipc, LiveLine, OverlayView, ResizeEdge, Subtitle, SubtitleDelta } from "../lib/ipc";
```

thay

```ts
// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
}
```

bằng

```ts
// Nối phần chữ dịch mới vào phụ đề cùng `id`. Phụ đề đã trôi khỏi thanh thì bỏ qua.
export function appendDelta(lines: readonly Subtitle[], delta: SubtitleDelta): Subtitle[] {
  return lines.map((l) => (l.id === delta.id ? { ...l, tgt_text: l.tgt_text + delta.text } : l));
}

// Trạng thái chốt: lượt cuối của đoạn đã xong (spec 2026-10-10 §4.5), dòng đang nói của đoạn đó hết chỗ.
const SETTLED: ReadonlySet<Subtitle["status"]> = new Set(["done", "failed", "same_lang", "skipped", "dropped"]);

// Dòng đang nói mới hay cập nhật (`subtitle://live`, spec 2026-10-10 §6.2): thay dòng cùng `id`, dòng mới xếp theo `id`.
// Phụ đề cùng `id` đang trên thanh ở trạng thái chốt thì lượt cuối của đoạn đã xong: dòng tới muộn, bỏ.
export function applyLive(live: LiveLine[], lines: readonly Subtitle[], line: LiveLine): LiveLine[] {
  if (lines.some((l) => l.id === line.id && SETTLED.has(l.status))) return live;
  const i = live.findIndex((x) => x.id === line.id);
  if (i >= 0) return live.map((x, j) => (j === i ? line : x));
  return [...live, line].sort((a, b) => a.id - b.id);
}

// Gỡ dòng đang nói (`subtitle://live-end`). Không có dòng đó thì giữ nguyên mảng.
export function endLive(live: LiveLine[], id: number): LiveLine[] {
  return live.some((x) => x.id === id) ? live.filter((x) => x.id !== id) : live;
}

// Phụ đề vừa tới chốt lượt cuối của một dòng đang nói (cùng `id`, hay gộp dòng đó qua `replaces`): gỡ dòng đó ngay, bản cuối
// hiện đúng chỗ (spec 2026-10-10 §4.5, §6.1). `live-end` của engine tới ngay sau; đây là lưới an toàn. Phụ đề mà dòng chỉ
// nối tiếp (`extends`) thì không gỡ: phụ đề đó đã `done` (tạm) từ trước khi dòng nối tiếp nó.
export function settleLive(live: LiveLine[], subtitle: Subtitle): LiveLine[] {
  if (live.length === 0 || !SETTLED.has(subtitle.status)) return live;
  const settled = (id: number) => id === subtitle.id || subtitle.replaces.includes(id);
  return live.some((x) => settled(x.id)) ? live.filter((x) => !settled(x.id)) : live;
}

// Một dòng trên thanh: phụ đề, hay dòng đang nói.
export type OverlayRow = { kind: "line"; line: Subtitle } | { kind: "live"; live: LiveLine };

// Các dòng thanh phụ đề vẽ, theo thứ tự (spec 2026-10-10 §6.1; QĐ6 của kế hoạch 03):
// - dòng đang nói ở chỗ của phụ đề nó nối tiếp (`extends`); không có thì ở chỗ phụ đề cùng `id` (lượt cuối đang chạy); không
//   có nữa thì sau dòng cuối, theo `id`;
// - phụ đề có `id` bằng `id` hay `extends` của một dòng đang nói thì tạm ẩn;
// - hai dòng đang nói cùng một chỗ thì chỉ dòng mới nhất (id lớn nhất) hiện: nó nối tiếp câu của dòng kia nên đã có chữ của
//   câu đó.
// Đối tượng phụ đề và dòng đang nói giữ nguyên tham chiếu, để `OverlayLine` và `LiveLineView` (memo) không vẽ lại thừa.
export function visibleRows(lines: readonly Subtitle[], live: readonly LiveLine[]): OverlayRow[] {
  if (live.length === 0) return lines.map((line): OverlayRow => ({ kind: "line", line }));
  const ids = new Set(lines.map((l) => l.id));
  const anchored = new Map<number, LiveLine>();
  const after: LiveLine[] = [];
  for (const x of [...live].sort((a, b) => a.id - b.id)) {
    const anchor = x.extends !== null && ids.has(x.extends) ? x.extends : ids.has(x.id) ? x.id : null;
    if (anchor === null) after.push(x);
    else anchored.set(anchor, x);
  }
  const hidden = new Set(live.flatMap((x) => (x.extends === null ? [x.id] : [x.id, x.extends])));
  const rows: OverlayRow[] = [];
  for (const line of lines) {
    const x = anchored.get(line.id);
    if (x) rows.push({ kind: "live", live: x });
    else if (!hidden.has(line.id)) rows.push({ kind: "line", line });
  }
  for (const x of after) rows.push({ kind: "live", live: x });
  return rows;
}
```

thay

```ts
export interface OverlayStoreState {
  view: OverlayView | null;
  status: AppStatus | null;
  lines: Subtitle[];
```

bằng

```ts
export interface OverlayStoreState {
  view: OverlayView | null;
  status: AppStatus | null;
  lines: Subtitle[];
  // Dòng đang nói (spec 2026-10-10 §6.1), xếp theo `id`; chỉ thanh phụ đề có (QĐ5).
  live: LiveLine[];
```

thay

```ts
    status: null,
    lines: [],
    level: 0,
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view })),
        ipc.listen("subtitle://upsert", (subtitle) => set({ lines: upsertLine(get().lines, subtitle) })),
        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
        ipc.listen("audio://level", (level) => set({ level })),
        // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ.
        ipc.listen("app://status", (status) => {
          const prev = get().status;
          if (prev && status.rev < prev.rev) return;
          const fresh = status.session === "starting" && prev?.session !== "starting";
          const level = status.session === "running" ? get().level : 0;
          set(fresh ? { status, lines: [], level } : { status, level });
        }),
      ]);
```

bằng

```ts
    status: null,
    lines: [],
    live: [],
    level: 0,
    async init() {
      const offs = await Promise.all([
        ipc.listen("overlay://view", (view) => set({ view })),
        ipc.listen("subtitle://upsert", (subtitle) =>
          set({ lines: upsertLine(get().lines, subtitle), live: settleLive(get().live, subtitle) }),
        ),
        ipc.listen("subtitle://delta", (delta) => set({ lines: appendDelta(get().lines, delta) })),
        ipc.listen("subtitle://live", (line) => set({ live: applyLive(get().live, get().lines, line) })),
        ipc.listen("subtitle://live-end", (end) => set({ live: endLive(get().live, end.id) })),
        ipc.listen("audio://level", (level) => set({ level })),
        // Trạng thái app (cùng `rev` như cửa sổ chính): bỏ trạng thái cũ tới muộn; phiên mới bắt đầu thì xóa phụ đề cũ. Dòng
        // đang nói chỉ có khi phiên đang chạy: phiên mới, phiên dừng hay lỗi thì bỏ hết (engine đã gửi `live-end` khi dừng;
        // đây là lưới an toàn, spec 2026-10-10 §6.2).
        ipc.listen("app://status", (status) => {
          const prev = get().status;
          if (prev && status.rev < prev.rev) return;
          const fresh = status.session === "starting" && prev?.session !== "starting";
          const level = status.session === "running" ? get().level : 0;
          const live = status.session === "running" || get().live.length === 0 ? get().live : [];
          set(fresh ? { status, lines: [], live, level } : { status, live, level });
        }),
      ]);
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm build && pnpm test
```

Expected: `tsc` và `vite build` không lỗi; Vitest đạt hết, gồm 10 test mới của `src/store/overlay.test.ts` và các test cũ của store (kể cả test giữ nguyên đối tượng của kế hoạch 01 Task 8).

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/store/overlay.ts src/store/overlay.test.ts
git -C "$W" commit -m "$(cat <<'EOF'
feat(overlay): store giữ dòng đang nói và chỗ của nó trên thanh

applyLive, endLive, settleLive, visibleRows: dòng đang nói sau dòng cuối, hay đúng chỗ câu nó nối tiếp (câu đó tạm ẩn),
hay chỗ phụ đề cùng id khi lượt cuối đang chạy; dòng tới muộn thì bỏ; phụ đề chốt gỡ dòng cùng id. Phiên mới, dừng hay
lỗi thì bỏ hết. Không đổi gì thì giữ nguyên mảng.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có hai file.

---

## Task 8: Chữ hai tầng, `LiveLineView`, `OverlayLine.dimProvisional`, CSS

QĐ7 và H8.
- `src/components/TwoTier.tsx`: phần ổn định, rồi `<span class="tail">` cho phần tạm. Dùng chung cho thanh phụ đề và khung xem trước (Task 10).
- `LiveLineView` (memo so nông như `OverlayLine` của kế hoạch 01): `div.line.live`, trong đó `div.source` (khi bật câu gốc và đã có chữ dịch) và `div.main`.
- `OverlayLine` thêm prop tùy chọn `dimProvisional` (mặc định `true`): `false` thì không gắn lớp `provisional`. Lớp `pending` (câu chờ dịch) giữ nguyên: đó không phải phụ đề tạm.
- `overlay.css`: `.overlay .live .tail { opacity: 0.65; }`, bằng `.provisional`.

Repo không có DOM giả và không thêm thư viện, nên test markup bằng `react-dom/server` trong file `.test.ts` (như kế hoạch 01 Task 8).

**Files:**
- Create: `src/components/TwoTier.tsx`
- Create: `src/windows/overlay/LiveLineView.tsx`, `src/windows/overlay/LiveLineView.test.ts`
- Modify: `src/windows/overlay/OverlayLine.tsx`, `src/windows/overlay/OverlayLine.test.ts` (thay toàn bộ)
- Modify: `src/windows/overlay/overlay.css`, `src/windows/overlay/overlay.css.test.ts`

- [ ] **Step 1: Viết test**

Tạo `src/windows/overlay/LiveLineView.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LiveLine } from "../../lib/ipc";
import { LiveLineView, type LiveLineViewProps } from "./LiveLineView";

const live = (patch: Partial<LiveLine> = {}): LiveLine => ({
  id: 7,
  extends: null,
  src_lang: "en",
  src_stable: "Can you share",
  src_tail: " the budget",
  tgt_stable: "Bạn có thể gửi",
  tgt_tail: " ngân sách",
  tgt_src_units: 3,
  ...patch,
});

const html = (props: LiveLineViewProps) => renderToStaticMarkup(createElement(LiveLineView, props));

describe("LiveLineView (spec 2026-10-10 §6.1)", () => {
  it("câu gốc và bản dịch đều hai tầng: phần tạm trong span.tail", () => {
    expect(html({ live: live(), showSource: true })).toBe(
      '<div class="line live"><div class="source">Can you share<span class="tail"> the budget</span></div>' +
        '<div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
    expect(html({ live: live(), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi<span class="tail"> ngân sách</span></div></div>',
    );
  });

  it("chưa có phần ổn định thì cả dòng là phần tạm; không có phần tạm thì không có span", () => {
    expect(html({ live: live({ tgt_stable: "", tgt_tail: "Bạn" }), showSource: false })).toBe(
      '<div class="line live"><div class="main"><span class="tail">Bạn</span></div></div>',
    );
    expect(html({ live: live({ tgt_tail: "" }), showSource: false })).toBe(
      '<div class="line live"><div class="main">Bạn có thể gửi</div></div>',
    );
  });

  it("chưa có chữ dịch: dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ", () => {
    expect(html({ live: live({ tgt_stable: "", tgt_tail: "" }), showSource: true })).toBe(
      '<div class="line live"><div class="main">Can you share<span class="tail"> the budget</span></div></div>',
    );
  });

  // Như `OverlayLine` (kế hoạch 01 Task 8): mỗi `subtitle://live` chỉ thay đối tượng của đúng một dòng.
  it("là component memo so nông", () => {
    const m = LiveLineView as unknown as { $$typeof: symbol; compare: unknown };
    expect(m.$$typeof).toBe(Symbol.for("react.memo"));
    expect(m.compare).toBeNull();
  });
});
```

Thay toàn bộ `src/windows/overlay/OverlayLine.test.ts` (bản của kế hoạch 01 Task 8, thêm hai test cuối) bằng:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Subtitle } from "../../lib/ipc";
import { OverlayLine, type OverlayLineProps } from "./OverlayLine";

const sub = (patch: Partial<Subtitle>): Subtitle => ({
  id: 1,
  start_ms: 0,
  end_ms: 1000,
  src_lang: "en",
  src_text: "Hello",
  tgt_text: "",
  status: "done",
  provisional: false,
  replaces: [],
  ...patch,
});

const html = (props: OverlayLineProps) => renderToStaticMarkup(createElement(OverlayLine, props));

describe("OverlayLine", () => {
  it("vẽ đúng như thanh phụ đề trước khi tách component", () => {
    expect(html({ line: sub({ tgt_text: "Xin chào" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line translated"><div class="source">Hello</div><div class="main">Xin chào</div></div>',
    );
    expect(
      html({ line: sub({ status: "translating", tgt_text: "Xin", provisional: true }), showSource: false, uiLanguage: "vi" }),
    ).toBe('<div class="line translating provisional"><div class="main">Xin</div></div>');
    expect(html({ line: sub({ status: "asr_done" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line pending"><div class="main">Hello</div></div>',
    );
    expect(html({ line: sub({ status: "failed" }), showSource: true, uiLanguage: "en" })).toBe(
      '<div class="line failed"><div class="main">Hello<span class="tag">not translated</span></div></div>',
    );
    expect(html({ line: sub({ status: "dropped", src_text: "" }), showSource: true, uiLanguage: "vi" })).toBe(
      '<div class="line dropped"><div class="main">[bỏ qua đoạn]</div></div>',
    );
  });

  // React bỏ qua việc vẽ lại một component memo khi mọi prop bằng nhau theo `Object.is` (so nông, không có hàm so sánh
  // riêng): dòng không đổi giữ nguyên đối tượng phụ đề (test của store), nên không vẽ lại.
  it("là component memo so nông", () => {
    const memo = OverlayLine as unknown as { $$typeof: symbol; compare: unknown };
    expect(memo.$$typeof).toBe(Symbol.for("react.memo"));
    expect(memo.compare).toBeNull();
  });

  // Spec 2026-10-10 §6.1: đang dịch trong lúc người nói chưa dừng thì phụ đề tạm không nhạt cả dòng.
  it("dimProvisional false: phụ đề tạm không còn lớp provisional", () => {
    const line = sub({ tgt_text: "Xin chào", provisional: true });
    expect(html({ line, showSource: false, uiLanguage: "vi" })).toBe(
      '<div class="line translated provisional"><div class="main">Xin chào</div></div>',
    );
    expect(html({ line, showSource: false, uiLanguage: "vi", dimProvisional: true })).toBe(
      '<div class="line translated provisional"><div class="main">Xin chào</div></div>',
    );
    expect(html({ line, showSource: false, uiLanguage: "vi", dimProvisional: false })).toBe(
      '<div class="line translated"><div class="main">Xin chào</div></div>',
    );
  });

  it("câu chờ dịch vẫn nhạt dù dimProvisional false: đó không phải phụ đề tạm", () => {
    expect(
      html({ line: sub({ status: "asr_done", provisional: true }), showSource: false, uiLanguage: "vi", dimProvisional: false }),
    ).toBe('<div class="line pending"><div class="main">Hello</div></div>');
  });
});
```

`src/windows/overlay/overlay.css.test.ts`: thay

```ts
  // Các câu dính sát nhau thì khó đọc khi họp: giữa hai câu phải có khoảng cách theo cỡ chữ (em), và câu gốc tách khỏi
```

bằng

```ts
  // Spec 2026-10-10 §6.1: phần tạm của dòng đang nói nhạt đúng như phụ đề tạm (0,65); phần ổn định và cả dòng giữ độ đậm
  // bình thường.
  it("phần tạm của dòng đang nói nhạt như phụ đề tạm, cả dòng thì không", async () => {
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("./overlay.css", import.meta.url), "utf8");
    const tail = /\.overlay\s+\.live\s+\.tail\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(tail).toMatch(/opacity:\s*0\.65/);
    const provisional = /\.overlay\s+\.provisional,\s*\.overlay\s+\.pending\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(provisional).toMatch(/opacity:\s*0\.65/);
    expect(css).not.toMatch(/\.overlay\s+\.live\s*\{[^}]*opacity/);
  });

  // Các câu dính sát nhau thì khó đọc khi họp: giữa hai câu phải có khoảng cách theo cỡ chữ (em), và câu gốc tách khỏi
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm test 2>&1 | tail -n 30
```

Expected:
- `LiveLineView.test.ts` lỗi `Failed to resolve import "./LiveLineView"`;
- `OverlayLine.test.ts`: hai test mới đỏ (`OverlayLine` chưa biết `dimProvisional`, nên dòng còn lớp `provisional`); hai test cũ đạt;
- `overlay.css.test.ts`: test mới đỏ (chưa có `.overlay .live .tail`).

- [ ] **Step 3: Cài**

Tạo `src/components/TwoTier.tsx`:

```tsx
// Chữ hai tầng của dòng đang nói (spec 2026-10-10 §6.1, §6.3): phần ổn định như thường, phần tạm trong `span.tail` (nhạt;
// CSS của từng cửa sổ đặt độ mờ, bằng `.provisional`). `tail` tự mang khoảng trắng đầu khi cần (H4 của kế hoạch 00), nên
// hai phần nối thẳng vào nhau.
export function TwoTier({ stable, tail }: { stable: string; tail: string }) {
  return (
    <>
      {stable}
      {tail && <span className="tail">{tail}</span>}
    </>
  );
}
```

Tạo `src/windows/overlay/LiveLineView.tsx`:

```tsx
import { memo } from "react";
import { TwoTier } from "../../components/TwoTier";
import type { LiveLine } from "../../lib/ipc";

// Dòng đang nói của thanh phụ đề (spec 2026-10-10 §6.1; H8 của kế hoạch 00): cùng cấu trúc `.line`, `.source`, `.main` với
// `OverlayLine`, thêm lớp `live`. Câu gốc (khi bật "hiện câu gốc") và bản dịch đều hai tầng (`TwoTier`): phần ổn định giữ
// độ đậm bình thường, phần tạm nhạt. Chưa có chữ dịch (đang chờ bản dịch tạm đầu, câu đã là ngôn ngữ đích, dịch không khả
// dụng) thì dòng chính là câu gốc hai tầng, không có dòng câu gốc nhỏ. Memo so nông như `OverlayLine`: mỗi lần
// `subtitle://live` chỉ đổi đối tượng của đúng một dòng.
export interface LiveLineViewProps {
  live: LiveLine;
  showSource: boolean;
}

export const LiveLineView = memo(function LiveLineView({ live, showSource }: LiveLineViewProps) {
  const translated = live.tgt_stable !== "" || live.tgt_tail !== "";
  return (
    <div className="line live">
      {translated && showSource && (
        <div className="source">
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        </div>
      )}
      <div className="main">
        {translated ? (
          <TwoTier stable={live.tgt_stable} tail={live.tgt_tail} />
        ) : (
          <TwoTier stable={live.src_stable} tail={live.src_tail} />
        )}
      </div>
    </div>
  );
});
```

Thay toàn bộ `src/windows/overlay/OverlayLine.tsx` bằng:

```tsx
import { memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { Subtitle } from "../../lib/ipc";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề và các giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), nên các
// dòng khác không vẽ lại. Dòng đang nói vẽ ở `LiveLineView.tsx`, cùng cấu trúc `.line`, `.source`, `.main`.
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
  // Phụ đề tạm (§6.3 spec chính) nhạt cả dòng. Khi đang dịch trong lúc người nói chưa dừng thì không (spec 2026-10-10 §6.1):
  // chỉ phần tạm của dòng đang nói nhạt. Mặc định `true`.
  dimProvisional?: boolean;
}

export const OverlayLine = memo(function OverlayLine({
  line,
  showSource,
  uiLanguage,
  dimProvisional = true,
}: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, dimProvisional && v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      {v.source && <div className="source">{v.source}</div>}
      <div className="main">
        {v.kind === "dropped" ? translate(uiLanguage, "subtitle.dropped") : v.main}
        {v.kind === "failed" && <span className="tag">{translate(uiLanguage, "subtitle.failed")}</span>}
      </div>
    </div>
  );
});
```

`src/windows/overlay/overlay.css`: thay

```css
/* Câu chưa dịch xong hay phụ đề tạm: nhạt hơn (§4.4). */
.overlay .provisional,
.overlay .pending {
  opacity: 0.65;
}
```

bằng

```css
/* Câu chưa dịch xong hay phụ đề tạm: nhạt hơn (§4.4). */
.overlay .provisional,
.overlay .pending {
  opacity: 0.65;
}

/* Dòng đang nói (spec 2026-10-10 §6.1): phần tạm nhạt đúng như phụ đề tạm; phần ổn định giữ độ đậm bình thường. */
.overlay .live .tail {
  opacity: 0.65;
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm build && pnpm test
```

Expected: `tsc` và `vite build` không lỗi; Vitest đạt hết: 4 test của `LiveLineView.test.ts`, 4 test của `OverlayLine.test.ts`, 5 test của `overlay.css.test.ts`.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/components/TwoTier.tsx src/windows/overlay/LiveLineView.tsx src/windows/overlay/LiveLineView.test.ts \
  src/windows/overlay/OverlayLine.tsx src/windows/overlay/OverlayLine.test.ts src/windows/overlay/overlay.css \
  src/windows/overlay/overlay.css.test.ts
git -C "$W" commit -m "$(cat <<'EOF'
feat(overlay): dòng đang nói hai tầng, phụ đề tạm thôi nhạt khi dịch trong lúc nói

TwoTier (phần tạm trong span.tail, mờ 0,65 như .provisional), LiveLineView memo so nông, cùng cấu trúc .line/.source/
.main; chưa có chữ dịch thì dòng chính là câu gốc hai tầng. OverlayLine thêm dimProvisional (mặc định true). Test
markup, memo và CSS.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có bảy file.

---

## Task 9: Thanh phụ đề vẽ dòng đang nói; mẫu và kiểm trên trang xem trước

`overlay.tsx` không test được bằng Vitest (file tự gắn React vào trang khi được nạp). Vì vậy task này viết **kiểm DOM trên trang xem trước** trước (QĐ9), thấy đỏ, rồi mới sửa `overlay.tsx`:
- `scripts/ui-preview/tauri-mock.ts` thêm tham số `live=alone|extends|final|provisional` cho `overlay.html`, và `window.__livePreview.finish()` gửi bản cuối rồi `live-end` (đúng thứ tự engine phát, §6.2);
- `scripts/ui-preview/check-live.mjs` mở trang trong Chrome không đầu (`website/tools/browser/cdp.mjs`), kiểm DOM và độ mờ thật (`getComputedStyle`), chụp PNG vào `target/ui-preview/dich-trong-luc-noi/` (không commit). Task này làm nhóm `overlay`; Task 10 thêm nhóm `settings`.

Trang xem trước chạy ở cổng 1431 như kế hoạch 01 Task 8 (phiên khác có thể dùng cổng 1430). Vite chạy nền từ Step 1 tới Step 5, ghi PID vào `target/ui-preview/vite.pid`; Step 5 tắt đúng PID đó.

**Files:**
- Modify: `scripts/ui-preview/tauri-mock.ts`
- Create: `scripts/ui-preview/check-live.mjs`
- Modify: `src/windows/overlay/overlay.tsx` (thay toàn bộ)

- [ ] **Step 1: Chạy trang xem trước**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
lsof -nP -iTCP:1431 -sTCP:LISTEN
mkdir -p target/ui-preview
node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > target/ui-preview/vite.log 2>&1 &
echo $! > target/ui-preview/vite.pid
curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:1431/overlay.html && echo "trang xem trước sẵn sàng"
```

Expected: `lsof` không in gì (cổng 1431 rảnh; có tiến trình đang nghe thì dừng, hỏi điều phối viên, không kill); dòng cuối `trang xem trước sẵn sàng`.

- [ ] **Step 2: Viết mẫu và kiểm (test)**

`scripts/ui-preview/tauri-mock.ts`: thay

```ts
import type { AppInfo, AppStatus, LicenseView, Settings, Subtitle } from "../../src/lib/ipc";
```

bằng

```ts
import type { AppInfo, AppStatus, LicenseView, LiveLine, Settings, Subtitle } from "../../src/lib/ipc";
```

thay

```ts
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
```

bằng

```ts
//   dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6): tws=0 (tắt công tắc)  slow=1 (máy chưa đủ nhanh)
//     overlay.html: live=alone|extends|final|provisional (mẫu dòng đang nói, xem `LIVE_SAMPLE`; cần session=running)
```

thay

```ts
let glossary = empty
```

bằng

```ts
// Dòng đang nói cho thanh phụ đề (spec 2026-10-10 §6.1), theo tham số `live=`:
// - `alone`: dòng đang nói số 6, sau dòng cuối;
// - `extends`: phụ đề tạm số 6, và dòng đang nói số 7 nối tiếp nó (phụ đề 6 tạm ẩn; chữ nguồn của dòng là câu 6 nối với
//   chữ của đoạn đang mở, QĐ6 của kế hoạch 02);
// - `final`: như `alone`; `window.__livePreview.finish()` gửi bản cuối số 6 rồi `live-end`, đúng thứ tự engine phát (§6.2);
// - `provisional`: chỉ phụ đề tạm số 6, không có dòng đang nói (phụ đề tạm nhạt hay không theo chế độ, §6.1).
// Câu mẫu theo ngôn ngữ giao diện: tiếng Anh dịch sang tiếng Việt, hay tiếng Trung dịch sang tiếng Anh.
const LIVE_SAMPLE = vi
  ? {
      lang: "en",
      alone: { src: ["We should also invite the design team", " to the"], tgt: ["Chúng ta cũng nên mời nhóm thiết kế", " tham dự"] },
      final: { src: "We should also invite the design team to the review.", tgt: "Chúng ta cũng nên mời nhóm thiết kế tham dự buổi duyệt." },
      provisional: { src: "The vendor quote came in", tgt: "Báo giá của nhà cung cấp đã tới" },
      extends: { src: ["The vendor quote came in higher", " than expected"], tgt: ["Báo giá của nhà cung cấp cao hơn", " dự kiến"] },
    }
  : {
      lang: "zh",
      alone: { src: ["我们也应该邀请设计团队", "参加"], tgt: ["We should also invite the design team", " to join"] },
      final: { src: "我们也应该邀请设计团队参加评审。", tgt: "We should also invite the design team to the review." },
      provisional: { src: "供应商的报价已经到了", tgt: "The vendor's quote has arrived" },
      extends: { src: ["供应商的报价已经到了，比预期", "高一些"], tgt: ["The vendor's quote has arrived,", " a bit higher than expected"] },
    };

function liveLine(id: number, ext: number | null, src: string[], tgt: string[]): LiveLine {
  return {
    id,
    extends: ext,
    src_lang: LIVE_SAMPLE.lang,
    src_stable: src[0] ?? "",
    src_tail: src[1] ?? "",
    tgt_stable: tgt[0] ?? "",
    tgt_tail: tgt[1] ?? "",
    tgt_src_units: 0,
  };
}

function liveSubtitle(id: number, src: string, tgt: string, provisional: boolean): Subtitle {
  return {
    id,
    start_ms: 240_000,
    end_ms: 243_000,
    src_lang: LIVE_SAMPLE.lang,
    src_text: src,
    tgt_text: tgt,
    status: "done",
    provisional,
    replaces: [],
  };
}

let glossary = empty
```

và thay

```ts
    const notes = q.get("notes");
    if (notes) {
```

bằng

```ts
    const live = q.get("live");
    const s = LIVE_SAMPLE;
    if (live === "alone" || live === "final") emit("subtitle://live", liveLine(6, null, s.alone.src, s.alone.tgt));
    if (live === "extends" || live === "provisional") {
      emit("subtitle://upsert", liveSubtitle(6, s.provisional.src, s.provisional.tgt, true));
    }
    if (live === "extends") emit("subtitle://live", liveLine(7, 6, s.extends.src, s.extends.tgt));
    (window as unknown as { __livePreview: { finish(): void } }).__livePreview = {
      finish() {
        emit("subtitle://upsert", liveSubtitle(6, s.final.src, s.final.tgt, false));
        emit("subtitle://live-end", { id: 6 });
      },
    };
    const notes = q.get("notes");
    if (notes) {
```

Tạo `scripts/ui-preview/check-live.mjs`:

```js
// Kiểm giao diện của "Dịch trong lúc người nói chưa dừng" (spec 2026-10-10 §6, §11; kế hoạch 03, QĐ9) trên trang xem trước
// (vite.config.ts, IPC giả): DOM thật trong Chrome không đầu (qua website/tools/browser/cdp.mjs, không thêm thư viện), cả
// tiếng Việt lẫn tiếng Anh, và ảnh PNG cho người kiểm xem ở target/ui-preview/dich-trong-luc-noi/ (không commit). Điều kiện
// nào sai thì in ra và thoát mã 1.
//
//   node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 &   # trang xem trước, cổng 1431
//   node scripts/ui-preview/check-live.mjs [tên nhóm]                                 # không có tên: mọi nhóm
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../website/tools/browser/cdp.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../target/ui-preview/dich-trong-luc-noi");
const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:1431";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];

// Chữ của tauri-mock.ts (`LIVE_SAMPLE`): bản dịch của phụ đề tạm số 6 và của bản cuối số 6.
const PROVISIONAL = { vi: "Báo giá của nhà cung cấp đã tới", en: "The vendor's quote has arrived" };
const FINAL = {
  vi: "Chúng ta cũng nên mời nhóm thiết kế tham dự buổi duyệt.",
  en: "We should also invite the design team to the review.",
};

// Biểu thức chạy trong trang: các dòng của thanh phụ đề; độ mờ thật của phần tử đầu tiên khớp `selector`.
const ROWS = `[...document.querySelectorAll(".overlay .lines > .line")]`;
const opacity = (selector) => `getComputedStyle(document.querySelector(${JSON.stringify(selector)})).opacity`;

async function open(browser, url, { width, height, dpr, dark = false, transparent = false }) {
  const page = await browser.newPage({ width, height, dpr, dark });
  if (transparent) {
    await page.s.send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  }
  await page.goto(url);
  await sleep(900);
  return page;
}

// Biểu thức `expression` (chạy trong trang) phải ra đúng `true`.
async function check(name, page, expression, what) {
  const value = await page.eval(expression).catch((e) => `lỗi: ${e.message}`);
  if (value !== true) failures.push(`${name}: ${what} (được ${JSON.stringify(value)})`);
}

async function shot(name, page) {
  const r = await page.s.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(out, `${name}.png`);
  writeFileSync(file, Buffer.from(r.data, "base64"));
  // Chrome tự xin /favicon.ico (trang xem trước không có): bỏ qua lỗi 404 đó.
  failures.push(...page.errors.filter((e) => !e.includes("status of 404")).map((e) => `${name}: ${e}`));
  page.errors.length = 0;
  console.log(file);
}

const SUITES = {
  // Thanh phụ đề (spec 2026-10-10 §6.1): dòng đang nói sau dòng cuối, nối tiếp câu đang ghép, bản cuối thay vào, phụ đề tạm.
  async overlay(browser, lang) {
    const url = (q) => `${BASE}/overlay.html?session=running&${q}&lang=${lang}`;
    const size = { width: 900, height: 300, dpr: 2, transparent: true };

    let page = await open(browser, url("live=alone"), size);
    let name = `overlay-alone.${lang}`;
    await check(name, page, `${ROWS}.length === 6`, "5 câu mẫu và 1 dòng đang nói");
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "dòng đang nói nằm sau dòng cuối");
    await check(name, page, `${opacity(".overlay .live .main .tail")} === "0.65"`, "phần tạm của bản dịch nhạt 0,65");
    await check(name, page, `${opacity(".overlay .live .main")} === "1"`, "phần ổn định giữ độ đậm bình thường");
    await check(name, page, `document.querySelector(".overlay .live .source .tail") !== null`, "câu gốc cũng hai tầng");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("live=extends"), size);
    name = `overlay-extends.${lang}`;
    await check(name, page, `document.querySelectorAll(".overlay .live").length === 1`, "một dòng đang nói");
    await check(name, page, `${ROWS}.length === 6`, "dòng đang nói thay chỗ phụ đề tạm số 6, không thêm dòng");
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "dòng đang nói ở chỗ của phụ đề số 6");
    await check(
      name,
      page,
      `${ROWS}.every((r) => r.querySelector(".main").textContent !== ${JSON.stringify(PROVISIONAL[lang])})`,
      "phụ đề tạm số 6 tạm ẩn",
    );
    await shot(name, page);
    await page.close();

    page = await open(browser, url("live=final"), size);
    name = `overlay-final.${lang}`;
    await check(name, page, `${ROWS}.at(-1).classList.contains("live")`, "trước: dòng đang nói");
    await shot(`overlay-final-truoc.${lang}`, page);
    await page.eval("window.__livePreview.finish()");
    await sleep(200);
    await check(name, page, `document.querySelector(".overlay .live") === null`, "sau: dòng đang nói đã gỡ");
    await check(name, page, `${ROWS}.length === 6`, "bản cuối nằm đúng chỗ dòng đang nói, không thêm dòng");
    await check(
      name,
      page,
      `${ROWS}.at(-1).querySelector(".main").textContent === ${JSON.stringify(FINAL[lang])}`,
      "bản cuối thay vào",
    );
    await shot(`overlay-final-sau.${lang}`, page);
    await page.close();

    for (const slow of [false, true]) {
      page = await open(browser, url(`live=provisional${slow ? "&slow=1" : ""}`), size);
      name = `overlay-provisional${slow ? "-slow" : ""}.${lang}`;
      const last = `${ROWS}.at(-1)`;
      await check(
        name,
        page,
        `${last}.classList.contains("provisional") === ${slow}`,
        slow ? "máy chưa đủ nhanh: phụ đề tạm nhạt cả dòng" : "đang dịch trong lúc nói: phụ đề tạm không nhạt cả dòng",
      );
      await check(name, page, `getComputedStyle(${last}).opacity === ${JSON.stringify(slow ? "0.65" : "1")}`, "độ mờ của dòng");
      await shot(name, page);
      await page.close();
    }
  },
};

const only = process.argv[2];
const suites = Object.entries(SUITES).filter(([n]) => !only || n === only);
if (suites.length === 0) throw new Error(`không có nhóm kiểm ${only}`);
mkdirSync(out, { recursive: true });
const browser = await launch();
if (!browser) throw new Error("không thấy Google Chrome (đặt CHROME=<đường dẫn>)");
try {
  for (const lang of ["vi", "en"]) for (const [, run] of suites) await run(browser, lang);
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("check-live: đạt");
}
```

- [ ] **Step 3: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
node scripts/ui-preview/check-live.mjs overlay; echo "mã thoát $?"
```

Expected: dòng cuối `mã thoát 1`. Store đã giữ dòng đang nói (Task 7) nhưng `overlay.tsx` chưa vẽ nó và vẫn làm nhạt phụ đề tạm, nên với mỗi ngôn ngữ có các lỗi:
- `overlay-alone.<lang>`: `5 câu mẫu và 1 dòng đang nói (được false)`, `dòng đang nói nằm sau dòng cuối (được false)`, hai lỗi độ mờ (`lỗi: …`, vì chưa có `.live`), `câu gốc cũng hai tầng (được false)`;
- `overlay-extends.<lang>`: `một dòng đang nói`, `dòng đang nói ở chỗ của phụ đề số 6`, `phụ đề tạm số 6 tạm ẩn` (đều `được false`);
- `overlay-final.<lang>`: `trước: dòng đang nói (được false)`;
- `overlay-provisional.<lang>`: `đang dịch trong lúc nói: phụ đề tạm không nhạt cả dòng (được false)` và `độ mờ của dòng (được false)`.

Không có lỗi JS (`Uncaught …`, `console.error: …`) nào; có thì sửa mẫu ở Step 2 trước.

- [ ] **Step 4: Cài**

Thay toàn bộ `src/windows/overlay/overlay.tsx` (bản sau kế hoạch 01 Task 8) bằng:

```tsx
import "./overlay.css";
import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useStore } from "zustand";
import { translate } from "../../i18n";
import { type ResizeEdge, tauriIpc as ipc } from "../../lib/ipc";
import { atBottom, pagedScrollTop } from "../../lib/overlayScroll";
import {
  HEARING_RMS,
  TEXT_COLORS,
  dateTime,
  localOffsetMinutes,
  overlayBackground,
  overlayNotes,
  streamingEffective,
} from "../../lib/subtitleView";
import { createOverlayStore, createResizeDrag, visibleRows } from "../../store/overlay";
import { LiveLineView } from "./LiveLineView";
import { OverlayLine } from "./OverlayLine";

const store = createOverlayStore(ipc);
// Thuộc tính `lang` của trang theo ngôn ngữ giao diện, để trình đọc màn hình đọc đúng giọng.
store.subscribe((state) => {
  if (state.view) document.documentElement.lang = state.view.uiLanguage;
});
void store.getState().init();

// Vùng kéo cạnh và góc để đổi kích thước (§4.4, cả macOS lẫn Windows), chỉ khi chưa khóa. Bấm giữ thì phía Rust đổi kích
// thước theo con trỏ (`createResizeDrag`). Vùng này không phải vùng kéo di chuyển (`data-tauri-drag-region="false"`).
const EDGES: readonly [string, ResizeEdge][] = [
  ["n", "north"],
  ["s", "south"],
  ["e", "east"],
  ["w", "west"],
  ["ne", "northEast"],
  ["nw", "northWest"],
  ["se", "southEast"],
  ["sw", "southWest"],
];

const drag = createResizeDrag(ipc);

function ResizeEdges() {
  return (
    <>
      {EDGES.map(([cls, edge]) => (
        <div
          key={cls}
          className={`edge ${cls}`}
          data-tauri-drag-region="false"
          aria-hidden="true"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.begin(edge);
          }}
          onPointerMove={() => drag.move()}
          onPointerUp={() => drag.end()}
          onPointerCancel={() => drag.end()}
          onLostPointerCapture={() => drag.end()}
        />
      ))}
    </>
  );
}

// Thanh phụ đề (§4.4): mọi câu của phiên (tối đa `MAX_LINES`) trong một vùng cuộn, bản dịch hiện dần, phụ đề tạm màu nhạt hơn,
// câu gốc chữ nhỏ ở trên nếu bật. Đang dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.1) thì có thêm dòng đang nói hai
// tầng (`LiveLineView`), đặt đúng chỗ theo `visibleRows`, và phụ đề tạm không nhạt cả dòng (`dimProvisional`). Đang ở đáy thì
// tự theo câu mới, dòng đang nói tính như một dòng; cuộn lên xem câu cũ thì dừng theo, hiện nút "Mới nhất" để về đáy. Cuộn
// bằng con lăn hay trackpad (chỉ khi chưa khóa, vì khóa thì chuột xuyên qua) hoặc bằng hai phím tắt cuộn lên xuống
// (`overlay://scroll`, dùng được cả khi khóa).
// Chỉ báo nhỏ ở góc trên: chấm "đang nghe" (sáng khi có tiếng), và các lời nhắc (đang nạp model, không có âm thanh,
// đang trễ, dịch không khả dụng, hết hạn mức, lỗi). Màu chữ, màu nền và độ mờ nền theo Cài đặt › Phụ đề (§4.3).
// Khi chưa khóa: kéo được cả thanh (`data-tauri-drag-region="deep"`), kéo cạnh để đổi kích thước, và rê chuột vào thì hiện
// nút ✕ ở góc trên bên phải (ẩn thanh và dừng phiên dịch). Khi khóa thì click xuyên qua (phía Rust đặt),
// không có nút nào (§4.4). Nâng gói, xem lỗi ở cửa sổ chính.
function Overlay() {
  const view = useStore(store, (s) => s.view);
  const lines = useStore(store, (s) => s.lines);
  const live = useStore(store, (s) => s.live);
  const status = useStore(store, (s) => s.status);
  const level = useStore(store, (s) => s.level);
  // Phụ đề và dòng đang nói theo đúng chỗ; chỉ tính lại khi một trong hai đổi.
  const rows = useMemo(() => visibleRows(lines, live), [lines, live]);
  const scroller = useRef<HTMLDivElement>(null);
  // `follow` (ref) để các hàm cuộn đọc ngay; `following` (state) để vẽ nút "Mới nhất".
  const follow = useRef(true);
  const [following, setFollowing] = useState(true);
  const syncFollow = () => {
    const el = scroller.current;
    if (!el) return;
    follow.current = atBottom(el);
    setFollowing(follow.current);
  };
  // Có câu mới, dòng đang nói đổi, hay cỡ chữ đổi mà đang theo thì giữ ở đáy. Ghi `scrollTop` đồng bộ trước khi vẽ, để không
  // thấy giật.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [rows, view?.fontSize, view?.showSource]);
  // Kéo cạnh đổi chiều cao thanh: vẫn giữ ở đáy nếu đang theo.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [view !== null]);
  // Phím tắt cuộn từ phía Rust.
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void ipc.listen("overlay://scroll", (direction) => {
      const el = scroller.current;
      if (el) el.scrollTo({ top: pagedScrollTop(el, direction), behavior: "smooth" });
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);
  if (!view) return null;
  const t = (key: Parameters<typeof translate>[1]) => translate(view.uiLanguage, key);
  const notes = overlayNotes(status);
  const running = status?.session === "running";
  const hearing = running && level >= HEARING_RMS;
  // Đang dịch trong lúc người nói chưa dừng: phụ đề tạm không nhạt cả dòng, chỉ phần tạm của dòng đang nói nhạt (§6.1).
  const dimProvisional = !streamingEffective(view.translateWhileSpeaking, status);
  return (
    <div
      className={view.locked ? "overlay" : "overlay unlocked"}
      data-tauri-drag-region={view.locked ? undefined : "deep"}
      style={{
        fontSize: view.fontSize,
        color: TEXT_COLORS[view.textColor] ?? TEXT_COLORS.white,
        background: overlayBackground(view.background, view.opacity),
      }}
    >
      {!view.locked && (
        <button
          type="button"
          className="hide"
          data-tauri-drag-region="false"
          aria-label={t("overlay.hide")}
          title={t("overlay.hide")}
          onClick={() => void ipc.invoke("hide_overlay").catch(() => {})}
        >
          ✕
        </button>
      )}
      <div className="indicators" role="status">
        {running && (
          <span
            className={hearing ? "dot hearing" : "dot"}
            role="img"
            aria-label={t(hearing ? "overlay.hearing" : "overlay.listening")}
          />
        )}
        {notes.map((n) => (
          <span key={n} className={`note ${n}`}>
            {n === "quotaExhausted" && status?.quotaResetAt != null
              ? translate(view.uiLanguage, "overlay.note.quotaExhausted.reset", {
                  time: dateTime(status.quotaResetAt * 1000, localOffsetMinutes(status.quotaResetAt * 1000)),
                })
              : t(`overlay.note.${n}`)}
          </span>
        ))}
      </div>
      <div className="lines" ref={scroller} onScroll={syncFollow}>
        {rows.length === 0 && notes.length === 0 && <div className="waiting">{t("overlay.waiting")}</div>}
        {rows.map((r) =>
          r.kind === "live" ? (
            <LiveLineView key={`live-${r.live.id}`} live={r.live} showSource={view.showSource} />
          ) : (
            <OverlayLine
              key={r.line.id}
              line={r.line}
              showSource={view.showSource}
              uiLanguage={view.uiLanguage}
              dimProvisional={dimProvisional}
            />
          ),
        )}
      </div>
      {!following && (
        <button
          type="button"
          className="latest"
          data-tauri-drag-region="false"
          onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })}
        >
          ↓ {t("overlay.latest")}
        </button>
      )}
      {!view.locked && <ResizeEdges />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);
```

- [ ] **Step 5: Chạy, thấy xanh, rồi tắt trang xem trước**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
node scripts/ui-preview/check-live.mjs overlay; echo "mã thoát $?"
pnpm build && pnpm test
kill "$(cat target/ui-preview/vite.pid)"
lsof -nP -iTCP:1431 -sTCP:LISTEN
```

Expected:
- `check-live: đạt`, `mã thoát 0`; 12 ảnh `overlay-*.{vi,en}.png` được liệt kê (alone, extends, final-truoc, final-sau, provisional, provisional-slow);
- `pnpm build && pnpm test` không lỗi;
- `lsof` không in gì (Vite đã tắt).

Mở ba ảnh `target/ui-preview/dich-trong-luc-noi/overlay-alone.vi.png`, `overlay-extends.vi.png`, `overlay-final-sau.vi.png` (công cụ đọc ảnh của agent): dòng cuối có phần đầu đậm như các dòng trên, phần cuối nhạt hơn; câu gốc chữ nhỏ cũng vậy; không có dòng thừa hay chữ chồng nhau. Task 11 xem kỹ đủ bộ ảnh.

- [ ] **Step 6: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/windows/overlay/overlay.tsx scripts/ui-preview/tauri-mock.ts scripts/ui-preview/check-live.mjs
git -C "$W" commit -m "$(cat <<'EOF'
feat(overlay): thanh phụ đề vẽ dòng đang nói hai tầng

overlay.tsx vẽ theo visibleRows (dòng đang nói sau dòng cuối hay đúng chỗ câu nó nối tiếp), tự cuộn theo cả dòng đang
nói, phụ đề tạm không nhạt cả dòng khi chế độ có hiệu lực. ui-preview: mẫu live=alone|extends|final|provisional và
check-live.mjs kiểm DOM, độ mờ thật và chụp ảnh vi/en trong Chrome không đầu.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có ba file; `target/` không có trong commit (gitignore).

---

## Task 10: Cài đặt › Phụ đề: công tắc, ghi chú, khung xem trước hai tầng

Spec §6.3, QĐ8.
- Công tắc **"Dịch trong lúc người nói chưa dừng"** (`#translate-while-speaking`, lớp `switch` như các công tắc khác) đứng đầu thẻ, ngay dưới khung xem trước. Đổi là gửi `update_settings` (`translateWhileSpeaking`), phía Rust áp cho phiên đang chạy từ đoạn kế tiếp (Task 5).
- Ghi chú dưới mô tả, khi công tắc bật mà `streamingTooSlow`, đúng chữ của spec:
  - vi: "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu."
  - en: "This computer isn't fast enough, so the app translates after each sentence."
- Khung xem trước tách thành `SubtitlePreview` (test markup được, vì không đọc store) và hiện mẫu hai tầng khi chế độ có hiệu lực.
- 7 khóa mới trong từ điển; `en` là nguồn khóa, `vi` có kiểu `Record<MessageKey, string>` nên thiếu khóa là lỗi biên dịch (spec chính §4.5); `i18n.test.ts` sẵn có kiểm hai bên cùng khóa, không chuỗi rỗng hay thừa khoảng trắng, chuỗi tiếng Việt đã dịch.

`SubtitleSettings` đọc store của cửa sổ chính (`useApp`), mà Zustand khi vẽ bằng `react-dom/server` chỉ đọc trạng thái ban đầu (rỗng), nên phần này kiểm bằng nhóm `settings` của `check-live.mjs` trên trang xem trước.

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/vi.ts`
- Create: `src/windows/main/settings/SubtitlePreview.tsx`, `src/windows/main/settings/SubtitlePreview.test.ts`
- Modify: `src/windows/main/settings/SubtitleSettings.tsx` (thay toàn bộ)
- Modify: `src/styles/main.css`
- Modify: `scripts/ui-preview/check-live.mjs` (thêm nhóm `settings`)

- [ ] **Step 1: Viết test**

Tạo `src/windows/main/settings/SubtitlePreview.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { en, vi } from "../../../i18n";
import { splitTail } from "../../../lib/subtitleView";
import { SubtitlePreview, type SubtitlePreviewProps } from "./SubtitlePreview";

const props = (patch: Partial<SubtitlePreviewProps> = {}): SubtitlePreviewProps => ({
  uiLanguage: "vi",
  fontSize: 20,
  opacity: 0.6,
  textColor: "white",
  background: "black",
  showSource: true,
  live: false,
  ...patch,
});

const html = (p: SubtitlePreviewProps) => renderToStaticMarkup(createElement(SubtitlePreview, p));

describe("SubtitlePreview", () => {
  it("chế độ thường: câu mẫu như trước, không có phần tạm", () => {
    const markup = html(props());
    expect(markup).toContain(
      '<div class="src">Can you share the budget estimate by Friday?</div>' +
        '<div class="main">Bạn có thể gửi bản dự toán ngân sách trước thứ Sáu không?</div>',
    );
    expect(markup).not.toContain('class="tail"');
    expect(markup).toContain('role="img" aria-label="Xem trước"');
  });

  it("đang dịch trong lúc người nói chưa dừng: mẫu hai tầng ở câu gốc và bản dịch (spec 2026-10-10 §6.3)", () => {
    expect(html(props({ live: true }))).toContain(
      '<div class="src">Can you share the budget <span class="tail">estimate by</span></div>' +
        '<div class="main">Bạn có thể gửi <span class="tail">bản dự toán ngân sách</span></div>',
    );
    expect(html(props({ live: true, uiLanguage: "en", showSource: false }))).toContain(
      '<div class="main">By Friday, can you <span class="tail">share the budget</span></div>',
    );
    expect(html(props({ live: true, showSource: false }))).not.toContain('class="src"');
  });

  it("cỡ chữ tối đa 34 px, màu chữ và nền theo cài đặt", () => {
    const markup = html(props({ fontSize: 48, textColor: "yellow", background: "navy", opacity: 0.8 }));
    expect(markup).toContain("font-size:34px");
    expect(markup).toContain("color:#ffd60a");
    expect(markup).toContain("background:rgba(12, 27, 58, 0.8)");
  });

  it("câu mẫu hai tầng của cả hai ngôn ngữ: phần tạm là đuôi thật của cả câu", () => {
    for (const dict of [en, vi]) {
      const pairs = [
        [dict["settings.subtitles.preview.live.source"], dict["settings.subtitles.preview.live.sourceTail"]],
        [dict["settings.subtitles.preview.live.text"], dict["settings.subtitles.preview.live.textTail"]],
      ];
      for (const [full, tail] of pairs) {
        const split = splitTail(full ?? "", tail ?? "");
        expect(split.tail, full).toBe(tail);
        expect(split.stable.trim(), full).not.toBe("");
      }
    }
  });

  it("phần tạm nhạt 0,65 như trên thanh phụ đề; ghi chú màu cảnh báo", async () => {
    type Fs = { readFileSync(path: URL, encoding: "utf8"): string };
    const fs = (await import("node:fs" as string)) as Fs;
    const css = fs.readFileSync(new URL("../../../styles/main.css", import.meta.url), "utf8");
    expect(/\.subtitle-preview\s+\.tail\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/opacity:\s*0\.65/);
    expect(/\.field-text\s+\.field-note\s*\{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/color:\s*var\(--warning\)/);
  });
});
```

`scripts/ui-preview/check-live.mjs`: thay

```js
      await check(name, page, `getComputedStyle(${last}).opacity === ${JSON.stringify(slow ? "0.65" : "1")}`, "độ mờ của dòng");
      await shot(name, page);
      await page.close();
    }
  },
};
```

bằng

```js
      await check(name, page, `getComputedStyle(${last}).opacity === ${JSON.stringify(slow ? "0.65" : "1")}`, "độ mờ của dòng");
      await shot(name, page);
      await page.close();
    }
  },

  // Cài đặt › Phụ đề (spec 2026-10-10 §6.3): công tắc, ghi chú máy chưa đủ nhanh, khung xem trước hai tầng.
  async settings(browser, lang) {
    const NOTE = {
      vi: "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu.",
      en: "This computer isn't fast enough, so the app translates after each sentence.",
    };
    const url = (q) => `${BASE}/?screen=settings&group=subtitles${q}&lang=${lang}`;
    const size = { width: 960, height: 640, dpr: 1.5 };
    const SWITCH = `document.querySelector("#translate-while-speaking")`;
    const TAILS = `document.querySelectorAll(".subtitle-preview .tail").length`;
    const NOTE_TEXT = `(document.querySelector(".field-note")?.textContent ?? null)`;

    let page = await open(browser, url(""), size);
    let name = `settings-on.${lang}`;
    await check(name, page, `${SWITCH}.checked === true`, "công tắc mặc định bật");
    await check(name, page, `${TAILS} === 2`, "khung xem trước: câu gốc và bản dịch đều hai tầng");
    await check(name, page, `${opacity(".subtitle-preview .tail")} === "0.65"`, "phần tạm nhạt 0,65");
    await check(name, page, `${NOTE_TEXT} === null`, "máy đủ nhanh: không có ghi chú");
    await shot(name, page);
    await page.click("#translate-while-speaking");
    await sleep(300);
    name = `settings-off.${lang}`;
    await check(name, page, `${SWITCH}.checked === false`, "bấm công tắc thì tắt");
    await check(name, page, `${TAILS} === 0`, "tắt thì khung xem trước là câu mẫu thường");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1"), size);
    name = `settings-slow.${lang}`;
    await check(name, page, `${NOTE_TEXT} === ${JSON.stringify(NOTE[lang])}`, "ghi chú máy chưa đủ nhanh, đúng chữ của spec");
    await check(name, page, `${TAILS} === 0`, "máy chưa đủ nhanh: khung xem trước là câu mẫu thường");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1&tws=0"), size);
    name = `settings-slow-off.${lang}`;
    await check(name, page, `${SWITCH}.checked === false && ${NOTE_TEXT} === null`, "tắt công tắc thì không ghi chú");
    await page.close();

    page = await open(browser, url("&theme=dark"), { ...size, dark: true });
    name = `settings-on.dark.${lang}`;
    await check(name, page, `${TAILS} === 2`, "giao diện tối: mẫu hai tầng");
    await shot(name, page);
    await page.close();

    page = await open(browser, url("&slow=1&theme=dark"), { ...size, dark: true });
    name = `settings-slow.dark.${lang}`;
    await check(name, page, `${NOTE_TEXT} === ${JSON.stringify(NOTE[lang])}`, "giao diện tối: ghi chú");
    await shot(name, page);
    await page.close();
  },
};
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
lsof -nP -iTCP:1431 -sTCP:LISTEN
mkdir -p target/ui-preview
node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > target/ui-preview/vite.log 2>&1 &
echo $! > target/ui-preview/vite.pid
curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:1431/ && echo "trang xem trước sẵn sàng"
pnpm test 2>&1 | tail -n 20
node scripts/ui-preview/check-live.mjs settings; echo "mã thoát $?"
```

Expected:
- `lsof` không in gì; `trang xem trước sẵn sàng`;
- Vitest: `SubtitlePreview.test.ts` lỗi `Failed to resolve import "./SubtitlePreview"`;
- `check-live`: `mã thoát 1`, với `settings-on.<lang>: công tắc mặc định bật (được "lỗi: …")` (chưa có công tắc), `… khung xem trước: câu gốc và bản dịch đều hai tầng (được false)`, `settings-slow.<lang>: ghi chú máy chưa đủ nhanh … (được null)`. Vite để chạy tiếp cho Step 4.

- [ ] **Step 3: Cài**

`src/i18n/en.ts`: thay

```ts
  "settings.subtitles.hint": "Changes show on the subtitle bar at once. Drag the bar to move it and drag an edge or corner to resize it; its place and size are remembered for each screen. Hover over the bar to see the ✕ button that hides it.",
```

bằng

```ts
  "settings.subtitles.hint": "Changes show on the subtitle bar at once. Drag the bar to move it and drag an edge or corner to resize it; its place and size are remembered for each screen. Hover over the bar to see the ✕ button that hides it.",
  "settings.subtitles.whileSpeaking": "Translate while the speaker is still talking",
  "settings.subtitles.whileSpeaking.hint": "Translations appear while the speaker is still talking; the faded part may still change. A change during a session applies from the next sentence.",
  "settings.subtitles.whileSpeaking.slow": "This computer isn't fast enough, so the app translates after each sentence.",
  "settings.subtitles.preview.live.source": "金曜日までに予算の見積もりを共有",
  "settings.subtitles.preview.live.sourceTail": "見積もりを共有",
  "settings.subtitles.preview.live.text": "By Friday, can you share the budget",
  "settings.subtitles.preview.live.textTail": "share the budget",
```

`src/i18n/vi.ts`: thay

```ts
  "settings.subtitles.hint": "Thanh phụ đề đổi ngay theo. Kéo thanh để di chuyển, kéo cạnh hoặc góc để đổi kích thước; vị trí và kích thước được nhớ riêng cho từng màn hình. Rê chuột vào thanh để thấy nút ✕ ẩn thanh.",
```

bằng

```ts
  "settings.subtitles.hint": "Thanh phụ đề đổi ngay theo. Kéo thanh để di chuyển, kéo cạnh hoặc góc để đổi kích thước; vị trí và kích thước được nhớ riêng cho từng màn hình. Rê chuột vào thanh để thấy nút ✕ ẩn thanh.",
  "settings.subtitles.whileSpeaking": "Dịch trong lúc người nói chưa dừng",
  "settings.subtitles.whileSpeaking.hint": "Bản dịch hiện ngay trong lúc người nói chưa dừng; phần chữ nhạt có thể còn đổi. Đổi khi đang dịch thì áp dụng từ câu sau.",
  "settings.subtitles.whileSpeaking.slow": "Máy này chưa đủ nhanh, app đang dịch sau mỗi câu.",
  "settings.subtitles.preview.live.source": "Can you share the budget estimate by",
  "settings.subtitles.preview.live.sourceTail": "estimate by",
  "settings.subtitles.preview.live.text": "Bạn có thể gửi bản dự toán ngân sách",
  "settings.subtitles.preview.live.textTail": "bản dự toán ngân sách",
```

Tạo `src/windows/main/settings/SubtitlePreview.tsx`:

```tsx
import { TwoTier } from "../../../components/TwoTier";
import { type MessageKey, type UiLanguage, translate } from "../../../i18n";
import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { TEXT_COLORS, overlayBackground, splitTail } from "../../../lib/subtitleView";

// Khung xem trước ở đầu nhóm Cài đặt › Phụ đề (§4.3): một câu mẫu vẽ theo đúng cài đặt (cả lúc đang kéo thanh trượt). Khi
// chế độ dịch trong lúc người nói chưa dừng có hiệu lực (spec 2026-10-10 §6.3), câu mẫu là một dòng đang nói hai tầng
// (`TwoTier`): phần ổn định như thường, phần tạm nhạt như trên thanh phụ đề. Câu mẫu hai tầng nằm trong từ điển dạng cả câu
// và phần tạm (`splitTail`), vì chuỗi giao diện không được có khoảng trắng ở đầu hay cuối.
export interface SubtitlePreviewProps {
  uiLanguage: UiLanguage;
  fontSize: number;
  opacity: number;
  textColor: TextColor;
  background: BackgroundColor;
  showSource: boolean;
  live: boolean;
}

export function SubtitlePreview({
  uiLanguage,
  fontSize,
  opacity,
  textColor,
  background,
  showSource,
  live,
}: SubtitlePreviewProps) {
  const t = (key: MessageKey) => translate(uiLanguage, key);
  const source = live
    ? splitTail(t("settings.subtitles.preview.live.source"), t("settings.subtitles.preview.live.sourceTail"))
    : { stable: t("settings.subtitles.preview.source"), tail: "" };
  const text = live
    ? splitTail(t("settings.subtitles.preview.live.text"), t("settings.subtitles.preview.live.textTail"))
    : { stable: t("settings.subtitles.preview.text"), tail: "" };
  return (
    <div className="subtitle-preview" role="img" aria-label={t("settings.subtitles.preview")}>
      <div
        className="bar"
        style={{
          fontSize: Math.min(fontSize, 34),
          color: TEXT_COLORS[textColor],
          background: overlayBackground(background, opacity),
        }}
      >
        {showSource && (
          <div className="src">
            <TwoTier {...source} />
          </div>
        )}
        <div className="main">
          <TwoTier {...text} />
        </div>
      </div>
    </div>
  );
}
```

Thay toàn bộ `src/windows/main/settings/SubtitleSettings.tsx` bằng:

```tsx
import { useState } from "react";
import { Field, FieldSet } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import type { BackgroundColor, TextColor } from "../../../lib/ipc";
import { BACKGROUND_COLORS, TEXT_COLORS, streamingEffective, streamingNote } from "../../../lib/subtitleView";
import { useApp, useT } from "../appStore";
import { CommitRange } from "./CommitRange";
import { SubtitlePreview } from "./SubtitlePreview";

// Nhóm Cài đặt "Phụ đề" (§4.3, §6.9): công tắc "Dịch trong lúc người nói chưa dừng" (spec 2026-10-10 §6.3: mặc định bật, đổi
// khi đang dịch thì áp dụng từ đoạn kế tiếp, kèm ghi chú khi máy chưa đủ nhanh), cỡ chữ (14–48), màu chữ, màu nền (bảng màu
// có sẵn, mặc định chữ trắng trên nền đen), độ mờ nền (0–100%), hiện câu gốc. Thanh phụ đề đổi ngay theo (`overlay://view`);
// nút "Hiện thanh phụ đề" để xem thử khi chưa dịch. Mỗi ô màu là một nút radio, xem trước chữ "A" với màu chữ và màu nền sẽ
// ra. Khung xem trước ở đầu nhóm (`SubtitlePreview`) vẽ một câu mẫu theo đúng cài đặt (cả lúc đang kéo thanh trượt, trước khi
// gửi), hai tầng khi chế độ dịch trong lúc nói có hiệu lực.
export function SubtitleSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const status = useApp((s) => s.status);
  const update = useApp((s) => s.updateSettings);
  const setVisible = useApp((s) => s.setOverlayVisible);
  const [draftSize, setDraftSize] = useState<number | null>(null);
  const [draftOpacity, setDraftOpacity] = useState<number | null>(null);
  if (!settings || !status) return null;
  const o = settings.overlay;
  const slow = streamingNote(settings.translateWhileSpeaking, status);
  return (
    <>
      <SubtitlePreview
        uiLanguage={settings.uiLanguage}
        fontSize={draftSize ?? o.fontSize}
        opacity={draftOpacity ?? o.opacity}
        textColor={o.textColor}
        background={o.background}
        showSource={o.showSource}
        live={streamingEffective(settings.translateWhileSpeaking, status)}
      />
      <div className="card list">
        <Field
          label={t("settings.subtitles.whileSpeaking")}
          htmlFor="translate-while-speaking"
          hint={
            <>
              {t("settings.subtitles.whileSpeaking.hint")}
              {slow && (
                <span className="field-note" role="status">
                  {t("settings.subtitles.whileSpeaking.slow")}
                </span>
              )}
            </>
          }
        >
          <input
            id="translate-while-speaking"
            className="switch"
            type="checkbox"
            checked={settings.translateWhileSpeaking}
            onChange={(e) => void update({ translateWhileSpeaking: e.target.checked })}
          />
        </Field>
        <Field label={t("settings.subtitles.fontSize")} htmlFor="font-size">
          <CommitRange
            id="font-size"
            min={14}
            max={48}
            step={1}
            value={o.fontSize}
            format={(v) => `${v} px`}
            onCommit={(fontSize) => void update({ overlay: { fontSize } })}
            onDraft={setDraftSize}
          />
        </Field>
        <FieldSet legend={t("settings.subtitles.textColor")} wide={false} className="swatches">
          {(Object.keys(TEXT_COLORS) as TextColor[]).map((c) => (
            <label key={c} className="swatch" title={t(`subtitleColor.${c}`)}>
              <input
                type="radio"
                name="text-color"
                checked={o.textColor === c}
                onChange={() => void update({ overlay: { textColor: c } })}
              />
              <span style={{ color: TEXT_COLORS[c], background: BACKGROUND_COLORS[o.background] }}>A</span>
              <span className="sr-only">{t(`subtitleColor.${c}`)}</span>
            </label>
          ))}
        </FieldSet>
        <FieldSet legend={t("settings.subtitles.background")} wide={false} className="swatches">
          {(Object.keys(BACKGROUND_COLORS) as BackgroundColor[]).map((c) => (
            <label key={c} className="swatch" title={t(`subtitleBackground.${c}`)}>
              <input
                type="radio"
                name="background-color"
                checked={o.background === c}
                onChange={() => void update({ overlay: { background: c } })}
              />
              <span style={{ color: TEXT_COLORS[o.textColor], background: BACKGROUND_COLORS[c] }}>A</span>
              <span className="sr-only">{t(`subtitleBackground.${c}`)}</span>
            </label>
          ))}
        </FieldSet>
        <Field label={t("settings.subtitles.opacity")} htmlFor="opacity">
          <CommitRange
            id="opacity"
            min={0}
            max={1}
            step={0.05}
            value={o.opacity}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={(opacity) => void update({ overlay: { opacity } })}
            onDraft={setDraftOpacity}
          />
        </Field>
        <Field label={t("settings.subtitles.showSource")} htmlFor="show-source">
          <input
            id="show-source"
            className="switch"
            type="checkbox"
            checked={o.showSource}
            onChange={(e) => void update({ overlay: { showSource: e.target.checked } })}
          />
        </Field>
        <Field label={t("home.overlay")} hint={t("settings.subtitles.hint")}>
          <button onClick={() => void setVisible(!status.overlayVisible)}>
            <Icon name={status.overlayVisible ? "eyeOff" : "eye"} size={16} />
            {t(status.overlayVisible ? "home.overlay.hide" : "home.overlay.show")}
          </button>
        </Field>
      </div>
    </>
  );
}
```

`src/styles/main.css`: thay

```css
.subtitle-preview .main {
  font-weight: 500;
}
```

bằng

```css
.subtitle-preview .main {
  font-weight: 500;
}

/* Mẫu dòng đang nói (spec 2026-10-10 §6.3): phần tạm nhạt như trên thanh phụ đề. */
.subtitle-preview .tail {
  opacity: 0.65;
}
```

và thay

```css
.field-text .hint {
  margin: 0.15rem 0 0;
  font-size: 0.89rem;
}
```

bằng

```css
.field-text .hint {
  margin: 0.15rem 0 0;
  font-size: 0.89rem;
}

/* Ghi chú dưới mô tả của một dòng cài đặt, ví dụ máy chưa đủ nhanh cho chế độ dịch trong lúc nói (spec 2026-10-10 §6.3). */
.field-text .field-note {
  display: block;
  margin-top: 0.3rem;
  color: var(--warning);
}
```

- [ ] **Step 4: Chạy, thấy xanh, rồi tắt trang xem trước**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm build && pnpm test
node scripts/ui-preview/check-live.mjs; echo "mã thoát $?"
kill "$(cat target/ui-preview/vite.pid)"
lsof -nP -iTCP:1431 -sTCP:LISTEN
```

Expected:
- `tsc`, `vite build` không lỗi; Vitest đạt hết: 5 test của `SubtitlePreview.test.ts`, và `i18n.test.ts` vẫn đạt (7 khóa mới có ở cả hai từ điển, không rỗng, không thừa khoảng trắng, tiếng Việt khác tiếng Anh);
- `check-live: đạt`, `mã thoát 0` (cả hai nhóm, hai ngôn ngữ); thêm ảnh `settings-on`, `settings-off`, `settings-slow`, `settings-on.dark`, `settings-slow.dark` cho vi và en;
- `lsof` không in gì.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/i18n/en.ts src/i18n/vi.ts src/windows/main/settings/SubtitlePreview.tsx \
  src/windows/main/settings/SubtitlePreview.test.ts src/windows/main/settings/SubtitleSettings.tsx src/styles/main.css \
  scripts/ui-preview/check-live.mjs
git -C "$W" commit -m "$(cat <<'EOF'
feat(ui): công tắc dịch trong lúc người nói chưa dừng ở Cài đặt › Phụ đề

Công tắc đầu thẻ (mặc định bật, áp dụng từ đoạn kế tiếp), ghi chú "Máy này chưa đủ nhanh…" khi công tắc bật mà máy chưa
đủ nhanh, khung xem trước tách thành SubtitlePreview và hiện mẫu hai tầng khi chế độ có hiệu lực. Chuỗi vi/en. Test markup,
CSS, và nhóm settings của check-live.mjs.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có bảy file.

---

## Task 11: Xem và duyệt ảnh vi/en, sáng/tối

Spec §11 (giao diện): dòng hai tầng; dòng nối tiếp một câu đang ghép; bản cuối thay vào; khung xem trước; công tắc và ghi chú. `check-live.mjs` đã kiểm DOM và độ mờ; task này nhìn tận mắt từng ảnh, vì Vitest không vẽ bố cục và DOM đúng chưa chắc đã dễ đọc (ví dụ phần tạm quá nhạt trên chữ vàng nền navy).

**Files:** không sửa file nào, trừ khi Step 3 thấy lỗi.

- [ ] **Step 1: Chụp lại toàn bộ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
lsof -nP -iTCP:1431 -sTCP:LISTEN
rm -rf target/ui-preview/dich-trong-luc-noi
node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > target/ui-preview/vite.log 2>&1 &
echo $! > target/ui-preview/vite.pid
curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:1431/ && echo "trang xem trước sẵn sàng"
node scripts/ui-preview/check-live.mjs; echo "mã thoát $?"
ls target/ui-preview/dich-trong-luc-noi | wc -l
```

Expected: `check-live: đạt`, `mã thoát 0`; 22 ảnh (thanh phụ đề 6 × 2 ngôn ngữ, Cài đặt 5 × 2).

- [ ] **Step 2: Xem từng ảnh**

Mở từng ảnh trong `target/ui-preview/dich-trong-luc-noi/` bằng công cụ đọc ảnh của agent và đối chiếu:

| Ảnh (`.vi.png` và `.en.png`) | Phải thấy |
|---|---|
| `overlay-alone` | Dòng cuối là dòng đang nói: phần đầu đậm như các dòng trên, phần cuối nhạt rõ nhưng vẫn đọc được; câu gốc chữ nhỏ phía trên cũng nhạt đúng phần cuối; khoảng cách giữa các dòng như cũ; tiếng Trung (ảnh `.en`) không có khoảng trắng thừa giữa hai phần. |
| `overlay-extends` | Câu về báo giá chỉ xuất hiện **một lần**, ở dạng dài (đã nối tiếp), ở cuối thanh; không còn dòng ngắn "…đã tới" / "…has arrived". |
| `overlay-final-truoc`, `overlay-final-sau` | Cùng vị trí; ảnh sau: cả câu đậm bình thường, có dấu chấm cuối; không có dòng nào nhảy chỗ. |
| `overlay-provisional`, `overlay-provisional-slow` | Ảnh thường: dòng cuối (phụ đề tạm) đậm như các dòng khác. Ảnh `-slow`: dòng cuối nhạt cả dòng như trước khi có tính năng. |
| `settings-on` | Dòng đầu thẻ: nhãn "Dịch trong lúc người nói chưa dừng" / "Translate while the speaker is still talking", mô tả ngắn, công tắc bật ở bên phải; khung xem trước: phần cuối của câu gốc và bản dịch nhạt hơn. |
| `settings-off` | Công tắc tắt; khung xem trước là câu mẫu cũ, không phần nào nhạt. |
| `settings-slow`, `settings-slow.dark` | Ghi chú đúng chữ của spec, màu cảnh báo (nâu cam ở giao diện sáng, cam nhạt ở giao diện tối), nằm dưới mô tả, đọc rõ trên cả hai nền; khung xem trước là câu mẫu cũ. |
| `settings-on.dark` | Như `settings-on`, chữ và phần nhạt đọc rõ trên nền tối. |

Thêm một lượt với màu khó nhất (chữ vàng, nền navy, độ mờ 0,8, cỡ 26), chỉ để xem:

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=900,300 --force-device-scale-factor=2 --virtual-time-budget=5000 \
  --screenshot="$PWD/target/ui-preview/dich-trong-luc-noi/overlay-alone-vang.vi.png" \
  "http://127.0.0.1:1431/overlay.html?session=running&live=alone&text=yellow&bg=navy&opacity=0.8&size=26&lang=vi"
```

Expected: Chrome in `… bytes written to file …`; trong ảnh, phần nhạt của dòng đang nói vẫn đọc được trên nền navy.

- [ ] **Step 3: Nếu thấy lỗi**

- Lỗi bố cục hay độ đọc được (ví dụ phần tạm quá nhạt, chữ chồng nhau, dòng nhảy chỗ): sửa ở đúng file của Task 8–10, thêm hay sửa test tương ứng (markup, CSS, hay điều kiện trong `check-live.mjs`), chạy lại `pnpm build && pnpm test` và `node scripts/ui-preview/check-live.mjs`, rồi commit riêng `fix(overlay): …` hay `fix(ui): …` (chỉ `git add` các file đã sửa; kiểm nhánh như mọi commit). Đổi độ mờ 0,65 là đổi điều spec đã chốt (§6.1 "giống `.provisional`"): không tự đổi, báo điều phối viên kèm ảnh.
- Không thấy lỗi: không commit gì.

- [ ] **Step 4 (không bắt buộc): Xem bằng WebKit**

Agent có công cụ Playwright (MCP) thì mở thêm `http://127.0.0.1:1431/overlay.html?session=running&live=alone&lang=vi` và `http://127.0.0.1:1431/?screen=settings&group=subtitles&slow=1&lang=vi` bằng WebKit (gần WKWebView của macOS), chụp và xem như Step 2. Không có công cụ đó thì bỏ qua; repo không có gói Playwright và kế hoạch không thêm.

- [ ] **Step 5: Tắt trang xem trước, báo ảnh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
kill "$(cat target/ui-preview/vite.pid)"
lsof -nP -iTCP:1431 -sTCP:LISTEN
ls target/ui-preview/dich-trong-luc-noi/
```

Expected: `lsof` không in gì. Báo điều phối viên đường dẫn thư mục ảnh và kết quả đối chiếu từng dòng của bảng ở Step 2, để chủ dự án xem nếu muốn.

---

## Task 12: Kiểm toàn bộ; thử tay bản dev

**Files:** không sửa file nào.

- [ ] **Step 1: Bộ kiểm như CI**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --locked --workspace
pnpm build && pnpm test
./scripts/check-windows.sh --locked
git -C /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi status --short
```

Expected: mọi lệnh thoát mã 0; `cargo test` không có `FAILED`; `status --short` trống. Lệnh nào đỏ thì sửa ở task tương ứng (commit `fix(…): …` riêng) hay báo điều phối viên nếu lỗi nằm ngoài phạm vi kế hoạch này.

- [ ] **Step 2: Rà log và quyền riêng tư trong code**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
BASE=$(git log --format=%H --grep='feat(settings): công tắc dịch trong lúc người nói chưa dừng' -n 1)^
git diff "$BASE"..HEAD -- src-tauri | grep -E '^\+.*log::(info|warn|error|debug)!'
git diff "$BASE"..HEAD -- src-tauri/src/session.rs | grep -nE '^\+.*(TranscriptStore|transcript\.)'
```

Expected:
- lệnh `grep` đầu in đúng hai dòng, là đầu của `log::info!("phiên dịch {n}: máy đủ sức dịch trong lúc nói: {streaming_supported}")` (Task 4) và `log::info!("dịch trong lúc người nói chưa dừng: {}", …)` (Task 5); `cargo fmt` có thể đã xuống dòng phần tham số. Không lệnh log nào ghi chữ chép hay chữ dịch (spec §6.4);
- lệnh thứ hai chỉ in dòng của test `live_lines_reach_only_the_overlay` (`app.state::<TranscriptStore>().snapshot()…`): `TauriSink::live/live_end` không chạm bản chép lời (QĐ5).

- [ ] **Step 3: Báo trước, rồi thử tay trên bản dev**

Chủ dự án đang dùng máy. Trước khi chạy, nhờ điều phối viên báo chủ dự án và chờ đồng ý:
- app sẽ mở cửa sổ "AI Translator Dev" và thanh phụ đề, phát âm thanh mẫu ra loa khoảng 60 giây;
- cổng 1420 phải rảnh (không có bản dev nào khác của thư mục chính đang chạy); máy cần cắm sạc;
- việc bấm trong app (Bắt đầu, công tắc trong Cài đặt) do chủ dự án làm, hay chủ dự án cho phép agent làm.

Sau khi được đồng ý:

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
lsof -nP -iTCP:1420 -sTCP:LISTEN
ls src-tauri/binaries/ | head -n 3
scripts/run-dev-app.sh > target/ui-preview/dev-app.log 2>&1 &
echo $! > target/ui-preview/dev-app.pid
```

Expected: `lsof` không in gì; `src-tauri/binaries/` có tiến trình phụ (kế hoạch 01 Task 0 đã chép; thiếu thì chạy `scripts/copy-sidecars.sh` trước); vài phút sau (build xong) cửa sổ "AI Translator Dev" hiện.

Thử theo thứ tự, ghi lại kết quả từng dòng:

1. Cài đặt › Âm thanh: nguồn "Toàn hệ thống". Cài đặt › Phụ đề: công tắc "Dịch trong lúc người nói chưa dừng" bật, **không** có ghi chú (M4 Pro đủ sức); khung xem trước hai tầng.
2. Bấm Bắt đầu, chờ thanh phụ đề hiện chấm "đang nghe", rồi phát mẫu:

   ```sh
   cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
   afplay -t 60 bench/phase0/data/latency/en.wav
   ```

3. Trong 30 giây đầu: chữ dịch xuất hiện khi câu đang nói (khoảng 1 giây sau tiếng), phần cuối nhạt, phần đầu đậm dần lên; khi câu xong, bản dịch cả câu thay vào đúng chỗ, không nhảy dòng; câu bị ngắt rồi nói tiếp thì dòng đang nói nằm ở chỗ câu đó, không thành hai dòng.
4. Mở màn hình Bản chép lời của cửa sổ chính: chỉ có các câu cuối, không có chữ tạm (QĐ5).
5. Khoảng giây 30: Cài đặt › Phụ đề, tắt công tắc. Từ câu kế tiếp: không còn dòng đang nói; câu chưa có dấu kết câu lại nhạt cả dòng như trước. Bật lại: dòng đang nói có lại từ câu sau.
6. Hết mẫu: bấm Dừng; thanh phụ đề không còn dòng đang nói nào.
7. Thoát bằng biểu tượng trên menu bar › Thoát; script tự kết thúc.

Chụp màn hình chỉ khi chủ dự án cho phép (ảnh toàn màn hình có thể chứa nội dung riêng của chủ dự án): `screencapture -x target/ui-preview/dich-trong-luc-noi/dev-1.png`, xem xong thì xóa.

Sau khi thoát:

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
ps -p "$(cat target/ui-preview/dev-app.pid)" >/dev/null && echo "script còn chạy" || echo "script đã kết thúc"
lsof -nP -iTCP:1420 -sTCP:LISTEN
grep -c "dịch trong lúc người nói chưa dừng" ~/Library/Logs/com.aitranslator.desktop/app.log
grep -c "ocelots" ~/Library/Logs/com.aitranslator.desktop/app.log
```

Expected:
- `script đã kết thúc`; `lsof` không in gì (script tự tắt Vite và app khi app thoát). Script còn chạy thì `kill "$(cat target/ui-preview/dev-app.pid)"` (đúng PID đó, không `pkill`);
- dòng `grep` thứ nhất ít nhất `2` (tắt rồi bật lại ở bước 5);
- dòng `grep` thứ hai là `0`: log không có chữ chép lời ("ocelots" là từ của câu đầu trong `en.truth.json`; spec §6.4).

Bước nào sai thì ghi lại (bước, điều thấy, ảnh nếu có), báo điều phối viên; không tự sửa ngoài phạm vi các task trên.

- [ ] **Step 4: Báo cáo**

Báo điều phối viên: kết quả Step 1–3, đường dẫn ảnh của Task 11, các điểm cần chủ dự án quyết (nếu có). Kế hoạch 04 (nghiệm thu) làm tiếp; không merge vào `main`.

---

## Tự rà

Đối chiếu từng mục của spec với task:

| Mục của spec | Nội dung | Task |
|---|---|---|
| §5 "Tắt ngay từ đầu phiên" | Windows chỉ có GPU tích hợp (`probe::only_integrated_gpu`) hay không có GPU dùng được | 2 (`too_slow_for_streaming`, `streaming_supported`), 3 (dò GPU lúc mở app ghi `streamingTooSlow`), 4 (`LiveDeps::streaming_supported`, `engine_config`) |
| §5 "Tắt ngay từ đầu phiên" | `asr-worker` báo backend `Cpu` | 2 (luật), 3 (`Ready`/`CpuFallback` bằng CPU lúc chưa có phiên), 4 (`SidecarManager::asr_backend` lúc bắt đầu phiên) |
| §5 tự tắt | App báo cho giao diện | 3 (`TauriSink::indicators` ghi `streamingTooSlow` khi `streaming_unavailable`, giữ qua lúc dừng), 10 (ghi chú) |
| §6.1 vị trí | Sau dòng cuối; nối tiếp câu đang ghép thì đúng chỗ câu đó, câu đó tạm ẩn | 7 (`visibleRows`), 9 (`overlay.tsx`; kiểm `overlay-alone`, `overlay-extends`) |
| §6.1 hai tầng | Câu gốc và bản dịch chia hai phần; phần tạm mờ 0,65 như `.provisional`; chữ tạm hiện dần (engine gửi từng lần, store thay theo `id`) | 7 (`applyLive`), 8 (`TwoTier`, `LiveLineView`, CSS và test CSS), 9 (kiểm độ mờ thật) |
| §6.1 phụ đề tạm | Ở chế độ này không nhạt cả dòng | 8 (`dimProvisional`), 9 (`streamingEffective`; kiểm `overlay-provisional` và `-slow`) |
| §6.1 lượt cuối xong | Gỡ dòng đang nói, phụ đề cuối hiện đúng chỗ, không hiệu ứng | 7 (`endLive`, `settleLive`, `visibleRows` theo id), 9 (kiểm `overlay-final`) |
| §6.1 cuộn và khóa | Tự cuộn, "Mới nhất", khóa; dòng đang nói tính như một dòng | 9 (`useLayoutEffect` theo `rows`; `.line` chung cấu trúc nên `atBottom`, `pagedScrollTop`, khoảng cách dòng giữ nguyên) |
| §6.1 hiệu năng | Chỉ vẽ lại dòng có thay đổi | 7 (giữ nguyên mảng khi không đổi), 8 (`LiveLineView` memo so nông; `OverlayLine` của 01 vẫn memo), 9 (`useMemo`) |
| §6.2 sự kiện | `subtitle://live` (`LiveLine` đủ trường), `subtitle://live-end` | 5 (`events.rs`, `TauriSink`; test payload), 6 (kiểu TS) |
| §6.2 | Cửa sổ chính bỏ qua `subtitle://live` | 5 (`emit_to` overlay; test cửa sổ chính không nhận), 6 (bản chép lời không nghe) |
| §6.2 `live-end` khi dừng phiên, tự tắt | Engine gửi (kế hoạch 02); giao diện thêm lưới an toàn | 7 (bỏ hết khi phiên không còn chạy) |
| §6.3 công tắc | `translateWhileSpeaking`, mặc định bật, file cũ thì bật | 1 |
| §6.3 đổi khi đang dịch | Có tác dụng từ đoạn kế tiếp | 5 (`commit_settings` → `set_streaming_enabled`; áp lúc gắn engine; test qua engine thật) |
| §6.3 ghi chú | Chữ vi/en đúng spec; khi tắt từ đầu hay vừa tự tắt | 3, 4 (trạng thái), 10 (`streamingNote`, `.field-note`; `check-live` so đúng chữ) |
| §6.3 khung xem trước | Mẫu hai tầng | 10 (`SubtitlePreview`, `splitTail`; test markup; `check-live`) |
| §6.3 chuỗi | Đủ vi và en (spec chính §4.5) | 10 (7 khóa; `i18n.test.ts`) |
| §6.4 | Bản tạm chỉ trong bộ nhớ; không vào bản chép lời, lịch sử, xuất file, log | 5 (`TauriSink::live` không chạm `TranscriptStore`; test), 6 (store bản chép lời không nghe), 12 (rà log, grep log bản dev) |
| QĐ1 | Phần tạm nhạt, phần ổn định bình thường, bản cuối thay vào | 8, 9 |
| QĐ2 | Công tắc mặc định bật; máy yếu tự về cách cũ | 1, 2, 3, 4 |
| QĐ5 | Dòng đang nói chỉ trên thanh phụ đề | 5, 6 |
| §11 giao diện | Dòng hai tầng | 8 (markup), 9 (`overlay-alone`), 11 (xem ảnh) |
| §11 giao diện | Dòng nối tiếp một câu đang ghép | 7 (`visibleRows`), 9 (`overlay-extends`), 11 |
| §11 giao diện | Bản cuối thay vào | 7, 9 (`overlay-final-truoc/-sau`), 11 |
| §11 giao diện | Khung xem trước | 10 (markup, `settings-on/-off`), 11 |
| §11 giao diện | Công tắc và ghi chú | 10 (`settings-on`, `settings-off`, `settings-slow`, `settings-slow-off`), 11 |
| §11 "qua `scripts/ui-preview` và Playwright" | Trang xem trước, trình duyệt không đầu | 9–11 (Chrome qua `cdp.mjs`; WebKit qua Playwright MCP nếu agent có, QĐ9) |
| §9 bước 3 | "tự chỉnh nhịp và tự tắt", "`PipelineConfig.streaming` đọc từ manifest" | Kế hoạch 02 (engine, `StreamingConfig` trong `PipelineConfig`, manifest đọc qua `SessionDeps::pipeline_config` sẵn có); kế hoạch này chỉ báo kết quả tự tắt lên giao diện (Task 3) |

Kiểm tên theo hợp đồng: `LiveLine`/`LiveEnd` và các trường snake_case (H5) ở Task 5, 6; `EventSink::live/live_end`, `Indicators.streaming_unavailable`, `EngineConfig.streaming_supported/streaming_enabled`, `Engine::set_streaming_enabled` (H6) ở Task 3, 4, 5; `OverlayLine` thêm `dimProvisional?: boolean` mặc định `true`, `LiveLineView.tsx` (H8) ở Task 8.

