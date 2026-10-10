# Dịch trong lúc người nói chưa dừng · 02: Bản thử trong pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm bước 2 của spec §9: bản thử của chế độ "dịch trong lúc người nói chưa dừng" nằm trọn trong crate `pipeline`, chưa có giao diện.
- Chép từng phần đoạn VAD đang mở theo nhịp tự chỉnh, và một lần khi vừa hết tiếng nói (§4.1).
- Chốt chữ nguồn và chữ dịch bằng LocalAgreement, dịch bản tạm kèm prefill là phần dịch đã chốt (§4.2–§4.4).
- Lượt cuối giữ nguyên; dòng đang nói được gỡ đúng lúc (§4.5); việc của lượt cuối luôn đi trước (§4.6); ngưỡng ngắt câu riêng (§4.7).
- Nhịp T, tự tắt, tắt từ đầu phiên (§5); sự kiện `live` và `live_end` (§6.2); công tắc giữa phiên (§6.3).
- `latency-bench session` có cờ streaming và tính đủ các chỉ số §10.1 của tầng tạm và tầng ổn định.
- Đo theo lưới tham số trên M4 Pro, viết báo cáo, rồi **dừng ở cổng chờ chủ dự án quyết** (QĐ4 của spec); sau cổng mới đặt mặc định.

**Kiến trúc:**
- Module mới `crates/pipeline/src/streaming.rs` chỉ chứa luật thuần (H4): đơn vị và khóa so khớp, `Stabilizer`, `Cadence`, cộng thêm `PartialScheduler` (lịch chép từng phần).
- `Segmenter` cho đọc đoạn đang mở (`open_progress`, `open_snapshot`) và đổi ngưỡng đóng đoạn giữa phiên.
- `AsrQueue` có một ô cho yêu cầu chép từng phần: đoạn đóng luôn ra trước, yêu cầu mới thay yêu cầu cũ.
- `llama.rs` gửi prefill thành tin nhắn assistant cuối; `translate_live` dịch bản tạm một lần thử, theo cờ hủy H1.
- `engine.rs`: luồng VAD lên lịch chép từng phần và chốt chế độ, ngưỡng cho từng đoạn; luồng nhận dạng chép từng phần bằng đúng `TranscribeRequest`; luồng dịch nhận việc qua `Work::{Final, Live}`; luồng phụ đề giữ các dòng đang nói, chỉ gửi tối đa một việc bản tạm khi không có việc của lượt cuối, tính nhịp và tự tắt.
- `latency-bench session` thêm `--streaming`, `--streaming-end-silence-ms`, `--tgt-agree`, ghi `live` và `live_end`, tính trễ theo từ hai tầng và độ nháy từ dòng đang nói.

**Công nghệ:** Rust 1.98.1 (edition 2024): crate `pipeline`, `latency-bench`, app Tauri `meeting-translator` (chỉ sửa cho biên dịch được). Python 3 (thư viện chuẩn) cho script đo. Không thêm thư viện; `Cargo.lock` không đổi.

**Spec:** `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`: §3–§7, §9 bước 2 và cổng, §10.1, §11, §14.

**Tổng quan và hợp đồng khóa:** `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`: H1–H9, "Điều chỉnh so với spec", "Quy ước chung", "Nhánh và worktree".

**Nghiên cứu nền:** `bench/2026-10-10-do-tre/README.md` (prefill: b11146 stream lại phần prefill; khoảng trắng cuối làm lệch token; `--prefill-assistant` mặc định bật).

**Kế hoạch trước:** `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md` (phải xong hết trước khi bắt đầu kế hoạch này).

---

## Trạng thái đầu và cách đọc

- **Worktree** `/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi`, nhánh `dich-trong-luc-noi`. Không đụng thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator` (có phiên khác đang làm ở đó). Không merge, không rebase, không push.
- **Kế hoạch 01 đã xong.** Kế hoạch này viết trên code sau kế hoạch 01, cụ thể:
  - **H1** (Task 4 của 01): `Job` có `cancel: Option<&'a AtomicBool>`; `translate` kiểm cờ trước `/tokenize`, trước mỗi lần thử và ở mọi gói; `mt_loop` truyền `cancel: Some(job.cancel.as_ref())` và callback không còn tự kiểm cờ. Trong `translate.rs` có struct test `Cancelling` (Task 4 của 01).
  - **H2** (Task 5 của 01): `SubState` có `held: Option<String>` và `fresh: String`; `grow`, `dispatch`, `MtDelta`, `MtRetry`, `settle` theo luật H2. `Sink` của test trong `engine.rs` có `deltas`; `Harness` có `delta(&mut self, job, text)` và `tgt_texts(id)`.
  - **H7/H9** (Task 1–2 của 01): `crates/latency-bench/src/{session.rs, session_replay.rs, session_metrics.rs}` và `bench/2026-10-10-do-tre/{run_sessions.py, summarize_sessions.py, test_session_tools.py}` đúng như khối code trong kế hoạch 01:
    - `session_metrics.rs`: `enum Recorded { Subtitle, Delta, Indicators }` (`#[serde(tag = "kind", rename_all = "snake_case")]`), `Timed { t_ms, ev }`, `Summary` (18 khóa `Option<f64>` của H7), `UtteranceResult`, `ms`, `ratio4`, `evaluate(truth, events)`, `evaluate_replay`, `summarize(truth, events) -> Summary`;
    - `session_replay.rs`: `units(text, lang)`, `target_units(text)`, `lcp`, `retracted(old, new)`, `changed_stable_units(stable, final)`, `Piece`, `Shown`, `Track`, `Replay { tracks, pieces }` với `first_text_ms`, `done_ms`, `settled_ms`, `final_status`, `final_lang`, `final_translated_units()`, `retracted_units()`, `changed_stable_units()`;
    - `session.rs`: `SessionArgs` (trường `pub`, không có thư mục log: log nằm cạnh `--out`), `Recorder` (riêng của module, `take() -> (Vec<Timed>, Vec<String>)`), `RunInfo` (khóa `run` của file JSON: số đo thêm), `Report`, `run`, `print_summary`;
    - `summarize_sessions.py` có `value(report, key)` (đọc `summary`, không có thì `run`); `run_sessions.py` chuyển nguyên mọi tham số sau `--` cho `latency-bench session`.
  - **Mốc đo** của kế hoạch 01: `bench/2026-10-10-do-tre/results/buoc1-moc-*.json` và `buoc1-sau-*.json` (đo lại sau A2–A5, Task 12 của 01). Báo cáo cổng so với `buoc1-sau`.
  - Task 0 dưới đây kiểm từng điều trên. Thiếu điều nào thì dừng, báo điều phối viên.
- **Khối code.**
  - "`<file>`: thay … bằng …" là thay đúng một chỗ: khối cũ đủ dài để chỉ khớp một chỗ lúc làm task đó.
  - "Tạo `<file>`" là chép nguyên khối vào file mới. "Thêm vào cuối …" là đặt khối ở cuối phần được nêu.
  - Hàm mà kế hoạch 01 đã sửa (`grow`, `dispatch`, `settle`, `mt_loop`, `translate`) được ghi **nguyên bản mới**, đã gồm phần của H1/H2. Trước khi thay, đối chiếu bản trong file với bản của kế hoạch 01; khác chỗ nào ngoài phần kế hoạch 01 đã làm thì dừng, báo điều phối viên.
  - Trong một task, làm các khối test trước, chạy thấy đỏ, rồi mới cài.
- **Lệnh** chạy ở gốc worktree; mỗi khối lệnh tự `cd`. Không chạy hai bản build Rust lớn cùng lúc. Không `pkill`/`killall`.
- **Commit:** mỗi task một commit (Task 0, 18 và 20 không có).
  - Trước khi commit: `git -C <worktree> branch --show-current` phải in `dich-trong-luc-noi`, và xem `git -C <worktree> status --short`.
  - Chỉ `git add` đúng các file của task.
  - Dòng cuối commit message là `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`; thay `<model đang chạy>` bằng tên model của agent thực thi.
- **Quyền riêng tư:** log không bao giờ chứa âm thanh, chữ chép hay chữ dịch, kể cả bản tạm. Chỉ ghi id, số đếm và số đo thời gian.

## Quyết định của kế hoạch này

- **QĐ1. Hai loại giờ.**
  - Luồng VAD xét nhịp T và lượng tiếng nói mới theo **giờ âm thanh** (số khung × 32 ms), như mọi luật khác của segmenter. Với thu âm thật và với `latency-bench session` (phát theo lịch), giờ âm thanh bằng giờ thật; test phát nhanh vẫn tất định.
  - **Vòng cập nhật** đo bằng `Instant` (điều chỉnh 4 của tổng quan): từ lúc luồng VAD tạo `PartialRequest` (`requested`) tới lúc luồng dịch xong bản tạm của nó (`finished`, mang trong `Msg::LiveDone`). Test truyền hai thời điểm này vào nên tất định.
- **QĐ2. Chế độ chốt theo đoạn.** Luồng VAD đọc "chế độ đang có hiệu lực" (H6) mỗi khung **không có đoạn mở**, rồi giữ nguyên trong suốt đoạn kế tiếp: ngưỡng đóng đoạn, cửa sổ ghép và việc có chép từng phần hay không đều đổi "từ đoạn kế tiếp" (§6.3). Riêng tự tắt (§5) có tác dụng ngay: luồng VAD thôi lên lịch, luồng phụ đề bỏ mọi kết quả chép từng phần và gỡ mọi dòng.
- **QĐ3. Ngưỡng đi kèm tin nhắn.** Mỗi khi đổi ngưỡng (và một lần lúc bắt đầu), luồng VAD gửi `Msg::Threshold(ms)`; luồng phụ đề tính lại `window_ms = merge_window_ms(ms, …)`. Nhờ đi cùng kênh với các đoạn, cửa sổ ghép luôn khớp ngưỡng đã cắt đoạn.
- **QĐ4. Một kênh việc cho luồng dịch:** `Work::Final(MtJob)` và `Work::Live(LiveJob)`. Luồng phụ đề:
  - gửi tối đa một việc bản tạm; chỉ gửi khi không có việc lượt cuối đang chạy hay đang chờ, và không có phiên đang dừng;
  - có việc lượt cuối cần gửi thì bật cờ hủy của việc bản tạm đang chạy rồi gửi luôn (luồng dịch làm việc lượt cuối ngay khi bản tạm dừng);
  - bản chép từng phần mới tới khi một bản tạm đang dịch thì hủy bản đó; khi nó báo xong, bản mới nhất được gửi (yêu cầu mới thắng).
- **QĐ5. Vòng đời một dòng đang nói** (đoạn X):
  - Bắt đầu ở lần chép từng phần đầu tiên qua bộ lọc.
  - Nhận bản chép từng phần và bản dịch tạm cho tới khi **kết quả nhận dạng lượt cuối** của X tới (kể cả bản chép từng phần tạo lúc vừa hết tiếng nói mà tới sau khi đoạn đã đóng: nhờ vậy chữ cuối câu vẫn hiện sớm).
  - Khi kết quả lượt cuối tới và X thành phụ đề (mới, hay ghép vào câu đang mở), dòng **đóng băng** và được phát lại một lần, với `extends` là phụ đề đã nhận đoạn X (hoặc `None` nếu phụ đề đó có chính id của dòng). Lần phát lại đứng ngay sau upsert tạo ra phần chữ của X, để thanh phụ đề biết đặt dòng ở đâu và để `latency-bench` gắn dòng với đúng phần chữ.
  - `live_end` phát khi phụ đề đó chốt (`done`, `failed`, `skipped`), ngay khi có phụ đề `same_lang` hay `dropped` của đoạn, khi đoạn bị lọc, khi tự tắt, khi hết hạn mức, khi hết hạn dừng và khi luồng phụ đề kết thúc. Câu bị gộp ở hàng đợi dịch (`replaces`) chuyển các dòng đang chờ sang câu gộp.
- **QĐ6. Nội dung `LiveLine` khi nối tiếp câu A** (§4.3, §6.1): dòng thay chỗ A trên màn hình, nên `src_stable` là chữ của A nối với phần ổn định của đoạn (cách nối như khi ghép), `src_tail` là phần tạm của đoạn; bản dịch là bản dịch của cả câu nối. `tgt_src_units` là số đơn vị của **cả chữ nguồn đã đem dịch** (H5).
- **QĐ7. Hiện bản tạm đang stream** theo tinh thần H2: bản tạm mới chỉ thay chữ đang hiện khi phần đã nhận dài ít nhất bằng chữ đang hiện (đếm ký tự), từ đó hiện dần từng gói. Không làm vậy thì mỗi vòng xóa rồi gõ lại đuôi, độ nháy tăng mạnh. Bản tạm bị hủy hay lỗi thì giữ chữ đang hiện (§7).
- **QĐ8. Ngôn ngữ của lần chép từng phần:** lần đầu dùng tập ngôn ngữ cho phép; từ lần **được giữ lại** đầu tiên (qua bộ lọc) thì khóa vào ngôn ngữ của lần đó cho tới hết đoạn. Lần chép từng phần không đổi lịch sử prompt và `prev_lang` (chỉ lượt cuối đổi).
- **QĐ9. Không gửi lại.** Luồng nhận dạng không bao giờ gửi lại lần chép từng phần lỗi (`AsrFailure::Dropped` thì bỏ). Luật của `SidecarManager` (worker chết thì khởi động lại và gửi lại đoạn một lần) giữ nguyên cho mọi yêu cầu (§4.1: "luật khởi động lại … giữ nguyên"); bản chép tới muộn sau khi lượt cuối của đoạn đã có thì luồng phụ đề bỏ.
- **QĐ10. Ánh xạ của `latency-bench`** (spec §10.1) cho dòng đang nói, ở `session_replay.rs`:
  - dòng X gắn với phần chữ (`Piece`) vừa được upsert tạo ra ngay trước lần phát lại lúc đóng băng (QĐ5), và với câu S = `extends` (hay chính id của dòng);
  - từ thứ q của câu S (theo đơn vị của bản chép cuối của S) **được phủ** ở một lần hiện của dòng khi phần đầu chung (theo khóa) giữa `tgt_src_units` đơn vị đầu của chữ nguồn đang hiện và bản chép cuối của S dài hơn q;
  - tầng tạm của từ = min(lần đầu được phủ có chữ dịch, lúc lượt cuối hiện chữ dịch đầu tiên);
  - tầng ổn định của từ thứ q = min(lần đầu một dòng đang hiện thay chỗ S có phần dịch ổn định ít nhất ⌈(q + 1) × số đơn vị bản dịch cuối của S ÷ số đơn vị bản chép cuối của S⌉ đơn vị, lúc lượt cuối chốt hẳn);
  - độ nháy tầng ổn định = tổng (số đơn vị phần dịch ổn định cuối cùng của mỗi dòng không khớp tiền tố bản dịch cuối của S) ÷ số đơn vị của mọi bản dịch cuối;
  - độ nháy tầng tạm = độ nháy của kế hoạch 01 cộng số đơn vị bị rút lại giữa hai lần hiện liên tiếp của mỗi dòng, cộng lúc phụ đề cuối thay dòng.
- **QĐ11. Lưới đo** (bước 2 của §9, khoảng 2,5–3 giờ máy): (a) gói Chuẩn, (n, k) mặc định, `streaming.end_silence_ms` 50/200/400/600; (b) gói Chuẩn, 1–2 ngưỡng tốt nhất × hai bộ (n, k) {thận trọng, mạnh}; (c) gói Nhẹ ở ngưỡng chọn, (n, k) mặc định. Ngưỡng người dùng (`--end-silence-ms`) giữ 50 như app. Nhãn file: `buoc2-es<ngưỡng>[-than-trong|-manh]-<gói>-<session>.json`.

## File sẽ tạo hoặc sửa

| File | Việc |
|---|---|
| `crates/pipeline/src/config.rs` | `LangAgree`, `StreamingConfig` (H3), `PipelineConfig.streaming`, `validate`, test |
| `crates/pipeline/src/streaming.rs` (tạo) | `Unit`, `uses_char_units`, `split_units`, `join_units`, `strip_terminal_punct`, `Split`, `Stabilizer` (thêm `preview`), `Cadence`, `PartialKind`, `PartialScheduler`; test |
| `crates/pipeline/src/lib.rs` | `pub mod streaming;` |
| `crates/pipeline/src/subtitle.rs` | `LiveLine`, `LiveEnd` (H5), test serde |
| `crates/pipeline/src/segmenter.rs` | `OpenProgress`, `OpenSnapshot`, `open_progress`, `open_snapshot`, `set_end_silence_ms`, `end_silence_ms`; test |
| `crates/pipeline/src/queue.rs` | `PartialRequest`, ô chép từng phần, `Popped::Partial`, `set_partial`, `has_waiting_segments`; test |
| `crates/pipeline/src/llama.rs` | `ChatRequest.prefill`, `chat_body`; test |
| `crates/pipeline/src/bin/fake_llama_server.rs` | stream lại prefill như b11146; log `prefill=` |
| `crates/pipeline/src/bin/fake_asr_worker.rs` | lệnh kịch bản `words_per_sec:<n>` (chữ dài theo âm thanh, cho bản chép từng phần) |
| `crates/pipeline/src/translate.rs` | `prefill: None`; tách `prompt_for`, `max_chunks_for`; `translate_live`; test |
| `crates/pipeline/src/metrics.rs` | `partials`, `live_cycle_ms`, `cadence_ms`, `streaming_auto_off`; `summary`; test |
| `crates/pipeline/src/engine.rs` | `EngineConfig` (H6), `Indicators.streaming_unavailable`, `EventSink::live/live_end`, `Streaming`, `Flags::new`, `Engine::set_streaming_enabled`, `end_silence_for`, `Msg::{Threshold, LiveDelta, LiveDone}`, `AsrOutcome::Partial`, `Work`, `LiveJob`, `vad_loop`, `asr_loop`, `transcribe_partial`, `mt_loop`, trạng thái dòng đang nói trong `Composer`; test |
| `crates/pipeline/tests/clients.rs` | test prefill qua `LlamaServer::stream` với server giả |
| `crates/pipeline/tests/engine.rs`, `crates/pipeline/tests/real_sidecars.rs` | `EngineConfig` thêm hai trường |
| `crates/pipeline/tests/streaming.rs` (tạo) | engine đầy đủ với tiến trình phụ giả: bản chép từng phần, dòng đang nói có prefill, lượt cuối thay vào, `live_end` |
| `src-tauri/src/session.rs` | `engine_config`: `streaming_supported: false`, `streaming_enabled: false` (kế hoạch 03 nối giá trị thật) |
| `crates/latency-bench/src/session.rs` | cờ `--streaming`, `--streaming-end-silence-ms`, `--tgt-agree`; `parse_tgt_agree`, `apply_streaming`; `Recorder::live/live_end`; ba khóa `partials`, `cadence_p50_ms`, `streaming_auto_off` của `summary`; `RunInfo` thêm `live_lines`, `final_units`, `stable_changed_units`; test |
| `crates/latency-bench/src/session_metrics.rs` | `Recorded::Live`, `Recorded::LiveEnd`; trễ theo từ hai tầng, `first_from_start` có dòng đang nói; test |
| `crates/latency-bench/src/session_replay.rs` | `LiveObs`, `LiveTrack`, `Replay.lives`, `Replay.piece_keys`, ánh xạ QĐ10, truy vấn của dòng đang nói, độ nháy có dòng đang nói; test |
| `bench/2026-10-10-do-tre/summarize_sessions.py`, `test_session_tools.py` | bảng `--targets` (so §10.2, gộp theo nhóm lượt); test |
| `bench/2026-10-10-do-tre/results/buoc2-*.json`, `buoc2-cong.md` (tạo) | kết quả đo và báo cáo cổng |
| `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`, `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md` | sau cổng: trạng thái, QĐ4, §4.4, §4.7, chú thích H3 |

## Các task

| Task | Việc | Commit |
|---|---|---|
| 0 | Kiểm trạng thái đầu (kế hoạch 01 đã xong) | không |
| 1 | `StreamingConfig`, `LangAgree` | `feat(pipeline): …` |
| 2 | `streaming`: đơn vị, khóa so khớp, dấu kết câu | `feat(pipeline): …` |
| 3 | `streaming`: `Stabilizer` | `feat(pipeline): …` |
| 4 | `streaming`: `Cadence` | `feat(pipeline): …` |
| 5 | `LiveLine`, `LiveEnd` | `feat(pipeline): …` |
| 6 | `Segmenter` đọc đoạn đang mở, đổi ngưỡng; `PartialScheduler` | `feat(pipeline): …` |
| 7 | `AsrQueue`: ô chép từng phần | `feat(pipeline): …` |
| 8 | `llama.rs`: prefill; server giả stream lại prefill | `feat(pipeline): …` |
| 9 | `translate_live` | `feat(pipeline): …` |
| 10 | Engine: cấu hình, sự kiện, cờ dùng chung, công tắc; app vẫn biên dịch | `feat(pipeline): …` |
| 11 | Engine: luồng nhận dạng chép từng phần; dòng đang nói phía chữ nguồn, đóng băng, `live_end` | `feat(pipeline): …` |
| 12 | Engine: luồng VAD lên lịch, ngưỡng theo đoạn, cửa sổ ghép | `feat(pipeline): …` |
| 13 | Engine: dịch bản tạm, prefill, nhịp | `feat(pipeline): …` |
| 14 | Engine: tự tắt, dừng, hạn mức, dịch không khả dụng | `feat(pipeline): …` |
| 15 | Test tích hợp với tiến trình phụ giả | `test(pipeline): …` |
| 16 | `latency-bench session`: cờ streaming, sự kiện mới | `feat(latency-bench): …` |
| 17 | `latency-bench`: chỉ số của dòng đang nói; bảng mục tiêu §10.2 | `feat(latency-bench): …` |
| 18 | Kiểm toàn bộ, chạy thử với tiến trình phụ giả | không (chỉ kiểm) |
| 19 | Đo theo lưới tham số, viết báo cáo cổng | `bench(do-tre): …` |
| 20 | **Cổng: trình chủ dự án, DỪNG** | không |
| 21 | Sau cổng: đặt mặc định, sửa spec và tổng quan | `feat(pipeline): …` |

Thứ tự trong engine được chọn để mỗi commit biên dịch sạch với `clippy -D warnings` (không có trường "never read"): Task 11 làm đường đi của bản chép từng phần tới dòng đang nói (test nạp thẳng tin nhắn), Task 12 mới cho luồng VAD tạo yêu cầu, Task 13 thêm phần dịch.

---

## Task 0: Kiểm trạng thái đầu

**Files:** không sửa file nào.

- [ ] **Step 1: Nhánh, trạng thái, lịch sử**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git branch --show-current
git status --short
git log --oneline -20
```

Expected:
- dòng đầu `dich-trong-luc-noi`; `status` trống;
- log có các commit của kế hoạch 01, gồm `feat(latency-bench): lệnh session …`, `bench(do-tre): script chạy latency-bench session …`, `feat(pipeline): kiểm cờ hủy … (A2, H1)`, `feat(pipeline): ghép câu không xóa bản dịch đang hiện (A2, H2)` và commit đo lại sau A2–A5.

- [ ] **Step 2: Kiểm code của kế hoạch 01 mà kế hoạch này dựa vào**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
grep -n "pub cancel: Option<&'a AtomicBool>" crates/pipeline/src/translate.rs
grep -n "struct Cancelling" crates/pipeline/src/translate.rs
grep -n "held: Option<String>," crates/pipeline/src/engine.rs
grep -n "fn tgt_texts(&self, id: u64)" crates/pipeline/src/engine.rs
grep -n "cancel: Some(job.cancel.as_ref())" crates/pipeline/src/engine.rs
grep -n "pub enum Recorded" crates/latency-bench/src/session_metrics.rs
grep -n "pub fn summarize(truth: &\[Utterance\], events: &\[Timed\]) -> Summary" crates/latency-bench/src/session_metrics.rs
grep -n "^struct RunInfo" crates/latency-bench/src/session.rs
grep -n "pub fn run(args: SessionArgs)" crates/latency-bench/src/session.rs
grep -n "^def value(report, key):" bench/2026-10-10-do-tre/summarize_sessions.py
ls bench/2026-10-10-do-tre/run_sessions.py bench/2026-10-10-do-tre/summarize_sessions.py
ls bench/2026-10-10-do-tre/results/ | grep -c '^buoc1-sau-.*\.json$'
```

Expected: mỗi `grep` in đúng một dòng; hai script có mặt; dòng cuối là `12` (6 session × 2 gói của lượt `buoc1-sau`). Thiếu gì thì dừng, báo điều phối viên: kế hoạch 01 chưa xong.

- [ ] **Step 3: Bộ kiểm như CI trên nhánh hiện tại (mốc)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py'
```

Expected: mọi lệnh thoát mã 0. Lệnh nào đỏ thì dừng, báo điều phối viên kèm nguyên lỗi; không sửa code.

---

## Task 1: `StreamingConfig` và `LangAgree`

Đúng H3. Manifest đổi được mọi khóa (mọi struct đều `#[serde(default)]`); danh sách `tgt_agree` trong manifest thay cả danh sách mặc định, như `mt.ratio_thresholds`, nên tiếng không có trong danh sách mới dùng `tgt_agree_fallback`.

**Files:**
- Modify: `crates/pipeline/src/config.rs` (struct `PipelineConfig` dòng 17–28; cuối các struct, trước `impl PipelineConfig`; `validate` dòng 367–456; thêm test cuối `mod tests`)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/config.rs`: thay

```rust
    /// Mỗi khóa có giới hạn đều báo đúng tên khi sai, kể cả các khóa thêm sau review.
    #[test]
    fn every_bounded_key_is_checked() {
```

bằng

```rust
    /// Ghim số của chế độ dịch trong lúc nói (spec 2026-10-10 §4–§5, H3 của kế hoạch 00). `end_silence_ms` là mặc định tạm
    /// cho tới cổng của kế hoạch 02.
    #[test]
    fn streaming_defaults_are_the_numbers_of_the_spec() {
        let s = StreamingConfig::default();
        assert_eq!(
            (s.min_partial_speech_ms, s.min_new_speech_ms, s.end_silence_ms),
            (1_000, 300, 400)
        );
        assert_eq!((s.src_holdback_words, s.src_holdback_chars), (1, 2));
        let agree: Vec<(&str, usize, usize)> = s.tgt_agree.iter().map(|a| (a.lang.as_str(), a.n, a.k)).collect();
        assert_eq!(
            agree,
            [("en", 2, 1), ("vi", 2, 1), ("zh", 2, 2), ("ja", 3, 2), ("ko", 3, 2)]
        );
        assert_eq!((s.tgt_agree_fallback.lang.as_str(), s.tgt_agree_fallback.n, s.tgt_agree_fallback.k), ("", 2, 1));
        assert_eq!((s.cycle_window, s.cadence_factor), (8, 1.5));
        assert_eq!(
            (s.min_cadence_ms, s.max_cadence_ms, s.initial_cadence_ms),
            (700, 2_000, 1_000)
        );
        assert_eq!((s.warmup_cycles, s.auto_off_cycle_ms), (3, 1_300));
        assert_eq!(PipelineConfig::default().streaming, s);
        assert_eq!(PipelineConfig::default().validate(), Ok(()));
    }

    #[test]
    fn agreement_follows_the_source_language_with_a_fallback() {
        let s = StreamingConfig::default();
        assert_eq!(s.agree_for("en"), (2, 1));
        assert_eq!(s.agree_for("zh"), (2, 2));
        assert_eq!(s.agree_for("ko"), (3, 2));
        assert_eq!(s.agree_for("fr"), (2, 1), "tiếng lạ dùng giá trị dự phòng");
        assert_eq!(s.agree_for(""), (2, 1));
    }

    /// Manifest đổi được các khóa của `streaming`; danh sách `tgt_agree` mới thay cả danh sách mặc định.
    #[test]
    fn a_manifest_can_change_the_streaming_keys() {
        let json = r#"{ "streaming": { "end_silence_ms": 200, "tgt_agree": [{ "lang": "ja", "n": 3, "k": 3 }] } }"#;
        let c: PipelineConfig = serde_json::from_str(json).unwrap();
        assert_eq!(c.streaming.end_silence_ms, 200);
        assert_eq!(c.streaming.agree_for("ja"), (3, 3));
        assert_eq!(c.streaming.agree_for("en"), (2, 1), "không còn trong danh sách: dự phòng");
        assert_eq!(c.streaming.min_partial_speech_ms, 1_000, "khóa thiếu giữ mặc định");
        assert_eq!(c.validate(), Ok(()));
    }

    /// Mỗi khóa của `streaming` báo đúng tên khi sai (bảng của H3), và nhận giá trị đúng ở biên.
    #[test]
    fn streaming_keys_are_checked() {
        type Set = fn(&mut StreamingConfig, bool);
        let cases: [(&str, Set); 16] = [
            ("streaming.min_partial_speech_ms", |s, ok| {
                s.min_partial_speech_ms = if ok { 250 } else { 249 }
            }),
            ("streaming.min_partial_speech_ms", |s, ok| {
                s.min_partial_speech_ms = if ok { 5_000 } else { 5_001 }
            }),
            ("streaming.min_new_speech_ms", |s, ok| {
                s.min_new_speech_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.end_silence_ms", |s, ok| s.end_silence_ms = if ok { 50 } else { 49 }),
            ("streaming.end_silence_ms", |s, ok| {
                s.end_silence_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.src_holdback_words", |s, ok| {
                s.src_holdback_words = if ok { 10 } else { 11 }
            }),
            ("streaming.src_holdback_chars", |s, ok| {
                s.src_holdback_chars = if ok { 10 } else { 11 }
            }),
            ("streaming.tgt_agree", |s, ok| s.tgt_agree[0].n = if ok { 5 } else { 1 }),
            ("streaming.tgt_agree", |s, ok| s.tgt_agree[2].k = if ok { 10 } else { 11 }),
            ("streaming.tgt_agree_fallback", |s, ok| {
                s.tgt_agree_fallback.n = if ok { 2 } else { 6 }
            }),
            ("streaming.cycle_window", |s, ok| s.cycle_window = if ok { 32 } else { 33 }),
            ("streaming.cadence_factor", |s, ok| {
                s.cadence_factor = if ok { 4.0 } else { f32::NAN }
            }),
            ("streaming.min_cadence_ms", |s, ok| s.min_cadence_ms = if ok { 200 } else { 199 }),
            ("streaming.max_cadence_ms", |s, ok| {
                s.max_cadence_ms = if ok { 10_000 } else { 10_001 }
            }),
            ("streaming.initial_cadence_ms", |s, ok| {
                s.initial_cadence_ms = if ok { 2_000 } else { 2_001 }
            }),
            ("streaming.warmup_cycles", |s, ok| s.warmup_cycles = if ok { 8 } else { 9 }),
        ];
        for (key, set) in cases {
            let mut c = PipelineConfig::default();
            set(&mut c.streaming, false);
            assert_eq!(c.validate(), Err(key.to_string()), "{key} ngoài biên");
            let mut c = PipelineConfig::default();
            set(&mut c.streaming, true);
            assert_eq!(c.validate(), Ok(()), "{key} đúng ở biên");
        }
        let mut c = PipelineConfig::default();
        c.streaming.auto_off_cycle_ms = 199;
        assert_eq!(c.validate(), Err("streaming.auto_off_cycle_ms".into()));
        let mut c = PipelineConfig::default();
        c.streaming.max_cadence_ms = 600; // nhỏ hơn min_cadence_ms 700
        assert_eq!(c.validate(), Err("streaming.max_cadence_ms".into()));
    }

    /// Mỗi khóa có giới hạn đều báo đúng tên khi sai, kể cả các khóa thêm sau review.
    #[test]
    fn every_bounded_key_is_checked() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib config
```

Expected: lỗi biên dịch `cannot find struct, variant or union type StreamingConfig` và `no field streaming on type PipelineConfig`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/config.rs`: thay

```rust
    pub supervisor: SupervisorConfig,
    pub audio: AudioConfig,
}

/// Ghép câu và phụ đề tạm (§6.3).
```

bằng

```rust
    pub supervisor: SupervisorConfig,
    pub audio: AudioConfig,
    /// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §4–§5).
    pub streaming: StreamingConfig,
}

/// Ghép câu và phụ đề tạm (§6.3).
```

thay

```rust
impl PipelineConfig {
    /// Kiểm phạm vi, trả tên khóa đầu tiên sai. Dùng khi nạp từ manifest (kế hoạch 04).
```

bằng

```rust
/// Số bản dịch tạm phải trùng phần đầu, và số đơn vị cuối chừa lại, theo tiếng nguồn (spec 2026-10-10 §4.4).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LangAgree {
    pub lang: String,
    /// Số bản dịch tạm liền nhau phải trùng phần đầu (spec §4.4).
    pub n: usize,
    /// Số đơn vị cuối chừa lại, không chốt.
    pub k: usize,
}

impl Default for LangAgree {
    fn default() -> Self {
        Self {
            lang: String::new(),
            n: 2,
            k: 1,
        }
    }
}

impl LangAgree {
    fn new(lang: &str, n: usize, k: usize) -> Self {
        Self {
            lang: lang.to_string(),
            n,
            k,
        }
    }

    /// Bảng của H3: `n` trong 2..=5, `k` ≤ 10.
    fn is_valid(&self) -> bool {
        (2..=5).contains(&self.n) && self.k <= 10
    }
}

/// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §4–§5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StreamingConfig {
    /// Đoạn mở có từ chừng này tiếng nói mới được chép từng phần theo nhịp (§4.1).
    pub min_partial_speech_ms: u64,
    /// Từ lần chép từng phần trước phải có thêm chừng này tiếng nói (§4.1).
    pub min_new_speech_ms: u64,
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). Mặc định tạm 400; chốt ở cổng của kế hoạch 02.
    pub end_silence_ms: u64,
    /// Số đơn vị cuối của bản chép chưa chốt: từ (§4.2) …
    pub src_holdback_words: usize,
    /// … hay chữ, với tiếng Trung và tiếng Nhật.
    pub src_holdback_chars: usize,
    /// (n, k) để chốt phần dịch, theo tiếng nguồn (§4.4).
    pub tgt_agree: Vec<LangAgree>,
    /// (n, k) khi tiếng nguồn không có trong `tgt_agree`.
    pub tgt_agree_fallback: LangAgree,
    /// Số vòng cập nhật gần nhất lấy trung vị (§5).
    pub cycle_window: usize,
    /// T = `cadence_factor` × trung vị, kẹp trong [`min_cadence_ms`, `max_cadence_ms`] (§5).
    pub cadence_factor: f32,
    pub min_cadence_ms: u64,
    pub max_cadence_ms: u64,
    /// T khi chưa đủ `warmup_cycles` vòng.
    pub initial_cadence_ms: u64,
    pub warmup_cycles: usize,
    /// Trung vị của `cycle_window` vòng gần nhất lớn hơn số này thì chế độ này tắt tới hết phiên (§5).
    pub auto_off_cycle_ms: u64,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            min_partial_speech_ms: 1_000,
            min_new_speech_ms: 300,
            end_silence_ms: 400,
            src_holdback_words: 1,
            src_holdback_chars: 2,
            tgt_agree: vec![
                LangAgree::new("en", 2, 1),
                LangAgree::new("vi", 2, 1),
                LangAgree::new("zh", 2, 2),
                LangAgree::new("ja", 3, 2),
                LangAgree::new("ko", 3, 2),
            ],
            tgt_agree_fallback: LangAgree::default(),
            cycle_window: 8,
            cadence_factor: 1.5,
            min_cadence_ms: 700,
            max_cadence_ms: 2_000,
            initial_cadence_ms: 1_000,
            warmup_cycles: 3,
            auto_off_cycle_ms: 1_300,
        }
    }
}

impl StreamingConfig {
    /// (n, k) theo tiếng nguồn; không có trong `tgt_agree` thì dùng `tgt_agree_fallback`.
    pub fn agree_for(&self, src_lang: &str) -> (usize, usize) {
        let a = self
            .tgt_agree
            .iter()
            .find(|a| a.lang == src_lang)
            .unwrap_or(&self.tgt_agree_fallback);
        (a.n, a.k)
    }
}

impl PipelineConfig {
    /// Kiểm phạm vi, trả tên khóa đầu tiên sai. Dùng khi nạp từ manifest (kế hoạch 04).
```

thay

```rust
        let s = &self.segmenter;
        let q = &self.queue;
        let v = &self.supervisor;
        let checks: Vec<(&str, bool)> = vec![
```

bằng

```rust
        let s = &self.segmenter;
        let q = &self.queue;
        let v = &self.supervisor;
        let st = &self.streaming;
        let checks: Vec<(&str, bool)> = vec![
```

và thay

```rust
            ("audio.level_interval_ms", self.audio.level_interval_ms >= 20),
        ];
```

bằng

```rust
            ("audio.level_interval_ms", self.audio.level_interval_ms >= 20),
            // H3 của kế hoạch 00 (spec 2026-10-10 §4–§5).
            (
                "streaming.min_partial_speech_ms",
                (250..=5_000).contains(&st.min_partial_speech_ms),
            ),
            ("streaming.min_new_speech_ms", st.min_new_speech_ms <= 2_000),
            ("streaming.end_silence_ms", (50..=2_000).contains(&st.end_silence_ms)),
            ("streaming.src_holdback_words", st.src_holdback_words <= 10),
            ("streaming.src_holdback_chars", st.src_holdback_chars <= 10),
            ("streaming.tgt_agree", st.tgt_agree.iter().all(LangAgree::is_valid)),
            ("streaming.tgt_agree_fallback", st.tgt_agree_fallback.is_valid()),
            ("streaming.cycle_window", (1..=32).contains(&st.cycle_window)),
            ("streaming.cadence_factor", (1.0..=4.0).contains(&st.cadence_factor)),
            ("streaming.min_cadence_ms", st.min_cadence_ms >= 200),
            (
                "streaming.max_cadence_ms",
                st.max_cadence_ms >= st.min_cadence_ms && st.max_cadence_ms <= 10_000,
            ),
            (
                "streaming.initial_cadence_ms",
                (st.min_cadence_ms..=st.max_cadence_ms).contains(&st.initial_cadence_ms),
            ),
            ("streaming.warmup_cycles", st.warmup_cycles <= st.cycle_window),
            ("streaming.auto_off_cycle_ms", st.auto_off_cycle_ms >= 200),
        ];
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib config
cargo fmt -p pipeline -- --check
```

Expected: mọi test `config::tests::…` đạt, gồm 4 test mới; fmt không in gì (nếu in, chạy `cargo fmt -p pipeline` rồi xem lại diff chỉ là xuống dòng).

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/config.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): cấu hình streaming của chế độ dịch trong lúc nói (H3)

StreamingConfig và LangAgree trong PipelineConfig, đổi được qua manifest; validate kiểm mọi khóa theo bảng H3;
agree_for lấy (n, k) theo tiếng nguồn, tiếng lạ dùng giá trị dự phòng. end_silence_ms mặc định tạm 400 tới cổng.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có đúng một file.

---
## Task 2: `streaming`: đơn vị, khóa so khớp, dấu kết câu

Đúng H4 (spec §3, §4.3). Module mới chỉ dùng ở test cho tới Task 11, nhưng mọi mục đều `pub` trong module `pub`, nên không có cảnh báo `dead_code`.

**Files:**
- Create: `crates/pipeline/src/streaming.rs`
- Modify: `crates/pipeline/src/lib.rs` (sau dòng `pub mod sse;`)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/lib.rs`: thay

```rust
pub mod sse;
pub mod subtitle;
```

bằng

```rust
pub mod sse;
pub mod streaming;
pub mod subtitle;
```

Tạo `crates/pipeline/src/streaming.rs` chỉ với khối test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn keys(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.key.as_str()).collect()
    }

    fn texts(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.text.as_str()).collect()
    }

    /// Đơn vị (spec §3): một từ với tiếng có dấu cách, một chữ với tiếng Trung và tiếng Nhật.
    #[test]
    fn words_and_cjk_characters_are_units() {
        let en = split_units("So, we went HOME!", "en");
        assert_eq!(keys(&en), ["so", "we", "went", "home"]);
        assert_eq!(texts(&en), ["So,", "we", "went", "HOME!"]);
        assert_eq!(keys(&split_units("안녕 하세요", "ko")), ["안녕", "하세요"]);
        let ja = split_units("こんにちは 世界", "ja");
        assert_eq!(ja.len(), 7);
        assert_eq!(join_units(&ja, "ja"), "こんにちは世界");
        assert!(uses_char_units("zh") && uses_char_units("ja"));
        assert!(!uses_char_units("ko") && !uses_char_units("vi") && !uses_char_units("en"));
    }

    /// Dấu tiếng Việt viết tổ hợp cho cùng khóa và cùng chữ hiện (NFC) với chữ dựng sẵn.
    #[test]
    fn vietnamese_diacritics_are_normalized() {
        let composed = split_units("Việt Nam", "vi");
        let decomposed = split_units("Vie\u{0302}\u{0323}t Nam", "vi");
        assert_eq!(composed, decomposed);
        assert_eq!(keys(&composed), ["việt", "nam"]);
        assert_eq!(texts(&decomposed)[0], "Việt");
    }

    /// Dấu câu không thành đơn vị riêng: gắn vào đơn vị đứng trước, hay đứng sau nếu ở đầu chuỗi (H4). Nhờ vậy câu có và
    /// không có dấu phẩy cho cùng dãy khóa.
    #[test]
    fn punctuation_attaches_to_a_neighbour() {
        let zh = split_units("你好，世界。", "zh");
        assert_eq!(keys(&zh), ["你", "好", "世", "界"]);
        assert_eq!(texts(&zh), ["你", "好，", "世", "界。"]);
        assert_eq!(join_units(&zh, "zh"), "你好，世界。");
        assert_eq!(keys(&split_units("你好世界", "zh")), keys(&zh));
        assert_eq!(texts(&split_units("「はい」", "ja")), ["「は", "い」"]);
        let en = split_units("— Hello — world …", "en");
        assert_eq!(texts(&en), ["— Hello —", "world …"]);
        assert_eq!(join_units(&en, "en"), "— Hello — world …");
        assert!(split_units(" … !! ", "en").is_empty());
        assert!(split_units("。、", "ja").is_empty());
        assert!(split_units("", "vi").is_empty());
    }

    /// Dấu kết câu ở cuối bản dịch tạm không hiện (spec §4.3): bỏ đúng một dấu, và khoảng trắng hai bên nó.
    #[test]
    fn terminal_punctuation_is_stripped_once() {
        assert_eq!(strip_terminal_punct("Xin chào."), "Xin chào");
        assert_eq!(strip_terminal_punct("Xong rồi!  "), "Xong rồi");
        assert_eq!(strip_terminal_punct("你好。"), "你好");
        assert_eq!(strip_terminal_punct("本当？"), "本当");
        assert_eq!(strip_terminal_punct("What?!"), "What?");
        assert_eq!(strip_terminal_punct("chúng tôi ."), "chúng tôi");
        assert_eq!(strip_terminal_punct("Mr. Smith"), "Mr. Smith");
        assert_eq!(strip_terminal_punct("còn tiếp,"), "còn tiếp,");
        assert_eq!(strip_terminal_punct("chào "), "chào");
        assert_eq!(strip_terminal_punct(""), "");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
```

Expected: lỗi biên dịch `cannot find function split_units`, `cannot find type Unit`…

- [ ] **Step 3: Cài**

Chèn vào đầu `crates/pipeline/src/streaming.rs`:

```rust
//! Luật thuần của chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §3–§5; H4 của kế hoạch 00): đơn vị và khóa
//! so khớp, chốt dần bằng LocalAgreement (`Stabilizer`), nhịp và tự tắt (`Cadence`), lịch chép từng phần
//! (`PartialScheduler`). Không có luồng, khóa hay giờ thật: luồng VAD và luồng phụ đề của `engine` gọi vào đây.

use crate::glossary::normalize;
use crate::sentence::SENTENCE_END;
use unicode_normalization::UnicodeNormalization;

/// Một đơn vị hiển thị (từ, hay chữ với zh/ja) và khóa so khớp (NFC, chữ thường, bỏ dấu câu) — spec §3.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unit {
    pub text: String,
    pub key: String,
}

/// Tiếng Trung và tiếng Nhật: mỗi chữ (ký tự không phải khoảng trắng) là một đơn vị, nối không có dấu cách (spec §3).
pub fn uses_char_units(lang: &str) -> bool {
    matches!(lang, "zh" | "ja")
}

/// Chỗ nối hai đơn vị: không có gì với zh/ja, một dấu cách với tiếng khác.
fn separator(lang: &str) -> &'static str {
    if uses_char_units(lang) { "" } else { " " }
}

/// Khóa so khớp: NFC, chữ thường, chỉ giữ chữ và số (bỏ dấu câu và ký hiệu), như `units` của `latency-bench`.
fn key_of(text: &str) -> String {
    normalize(text).chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Mọi đơn vị trả về đều có `key` khác rỗng: phần chỉ gồm dấu câu (ký tự loại P, hay token như "—", "…") không thành
/// đơn vị riêng mà gắn vào `text` của đơn vị đứng trước; nếu ở đầu chuỗi thì gắn vào đơn vị đứng sau. Chuỗi không có
/// đơn vị nào có key thì trả rỗng. Nhờ vậy "你好，世界" và "你好世界" có cùng dãy key [你,好,世,界].
///
/// `text` của đơn vị ở dạng NFC (dấu tiếng Việt tổ hợp thành chữ dựng sẵn), giữ hoa thường và dấu câu để hiện. Với tiếng
/// Trung, tiếng Nhật, khoảng trắng bị bỏ (đơn vị nối không có dấu cách); với tiếng khác, dấu câu gắn vào đơn vị bên cạnh
/// kèm một dấu cách, nên `join_units` trả lại đúng chuỗi đã gộp khoảng trắng.
pub fn split_units(text: &str, lang: &str) -> Vec<Unit> {
    let text: String = text.nfc().collect();
    let sep = separator(lang);
    let pieces: Vec<String> = if uses_char_units(lang) {
        text.chars().filter(|c| !c.is_whitespace()).map(String::from).collect()
    } else {
        text.split_whitespace().map(String::from).collect()
    };
    let mut units: Vec<Unit> = Vec::new();
    // Dấu câu đứng trước đơn vị có khóa đầu tiên: gắn vào đơn vị đó.
    let mut lead = String::new();
    for piece in pieces {
        let key = key_of(&piece);
        if !key.is_empty() {
            units.push(Unit {
                text: format!("{lead}{piece}"),
                key,
            });
            lead.clear();
        } else if let Some(prev) = units.last_mut() {
            prev.text.push_str(sep);
            prev.text.push_str(&piece);
        } else {
            lead.push_str(&piece);
            lead.push_str(sep);
        }
    }
    units
}

/// Nối các đơn vị để hiện: không có gì với zh/ja, một dấu cách với tiếng khác.
pub fn join_units(units: &[Unit], lang: &str) -> String {
    units
        .iter()
        .map(|u| u.text.as_str())
        .collect::<Vec<_>>()
        .join(separator(lang))
}

/// Bỏ một dấu kết câu ở cuối (. ? ! 。 ？ ！) và khoảng trắng sau nó (spec §4.3): bản dịch tạm chưa phải câu xong. Kết quả
/// không có khoảng trắng cuối.
pub fn strip_terminal_punct(text: &str) -> &str {
    let text = text.trim_end();
    match text.strip_suffix(SENTENCE_END) {
        Some(rest) => rest.trim_end(),
        None => text,
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 4 test `streaming::tests::…` đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/streaming.rs crates/pipeline/src/lib.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): module streaming: đơn vị, khóa so khớp và dấu kết câu (H4)

split_units tách từ hay chữ (zh, ja), khóa NFC chữ thường bỏ dấu câu; dấu câu gắn vào đơn vị bên cạnh nên mọi đơn vị
đều có khóa; join_units nối lại để hiện; strip_terminal_punct bỏ dấu kết câu ở cuối bản dịch tạm.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có đúng hai file.

---

## Task 3: `streaming`: `Stabilizer`

Đúng luật của H4. Thêm `preview` (ngoài H4): chia một bản đang stream theo phần ổn định hiện có mà không đổi lịch sử, cho QĐ7.

**Files:**
- Modify: `crates/pipeline/src/streaming.rs` (thêm sau `strip_terminal_punct`; thêm test)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/streaming.rs`: thay

```rust
    /// Dấu kết câu ở cuối bản dịch tạm không hiện (spec §4.3): bỏ đúng một dấu, và khoảng trắng hai bên nó.
```

bằng

```rust
    fn split(stable: &str, tail: &str) -> Split {
        Split {
            stable: stable.into(),
            tail: tail.into(),
        }
    }

    /// LocalAgreement-2, giữ lại 1 từ (spec §4.2): phần ổn định là phần chung của hai lần liền nhau trừ từ cuối; phần tạm
    /// tự mang dấu cách đầu.
    #[test]
    fn local_agreement_two_with_one_word_held_back() {
        let mut s = Stabilizer::new("en", 2, 1);
        assert_eq!(s.push("so we"), split("", "so we"));
        assert_eq!(s.push("so we went"), split("so", " we went"));
        assert_eq!(s.push("so we went home"), split("so we", " went home"));
        assert_eq!((s.stable_text().as_str(), s.stable_len()), ("so we", 2));
    }

    /// Phần ổn định chỉ dài thêm: lần mới không khớp thì phần tạm lấy các đơn vị của lần mới từ vị trí bằng độ dài phần ổn
    /// định (§4.2); sai lệch được sửa ở lượt cuối.
    #[test]
    fn the_stable_part_never_shrinks() {
        let mut s = Stabilizer::new("en", 2, 1);
        s.push("so we went");
        s.push("so we went home");
        assert_eq!(s.push("so they went home today"), split("so we", " went home today"));
        assert_eq!(s.stable_text(), "so we");
        s.push("so we went home today");
        assert_eq!(s.push("so we went home today and"), split("so we went home", " today and"));
    }

    /// Các kết quả gần nhất khớp nhau nhưng trái với phần đã chốt: không chốt thêm.
    #[test]
    fn agreement_that_contradicts_the_stable_part_is_ignored() {
        let mut s = Stabilizer::new("en", 2, 0);
        s.push("a b");
        s.push("a b c");
        assert_eq!(s.stable_text(), "a b");
        assert_eq!(s.push("x y z"), split("a b", " z"));
        assert_eq!(s.push("x y z w"), split("a b", " z w"));
        assert_eq!(s.stable_text(), "a b");
    }

    /// Tiếng Trung: giữ lại 2 chữ; không có dấu cách giữa phần ổn định và phần tạm.
    #[test]
    fn chinese_holds_back_two_characters_without_spaces() {
        let mut s = Stabilizer::new("zh", 2, 2);
        s.push("我们今天");
        assert_eq!(s.push("我们今天开会，"), split("我们", "今天开会，"));
        assert_eq!(s.stable_text(), "我们");
    }

    /// LocalAgreement-3 (spec §4.4, ja và ko): cần ba kết quả liền nhau.
    #[test]
    fn three_results_must_agree_when_n_is_three() {
        let mut s = Stabilizer::new("en", 3, 1);
        s.push("we will");
        assert_eq!(s.push("we will meet"), split("", "we will meet"));
        assert_eq!(s.push("we will meet you"), split("we", " will meet you"));
    }

    /// Khóa bỏ hoa thường và dấu câu; phần ổn định lấy chữ của lần mới nhất và không có khoảng trắng cuối (dùng làm
    /// prefill, spec §4.3).
    #[test]
    fn keys_ignore_case_and_punctuation_and_the_stable_text_has_no_trailing_space() {
        let mut s = Stabilizer::new("vi", 2, 1);
        s.push("Chúng tôi, đã đi");
        assert_eq!(s.push("chúng tôi đã đi về"), split("chúng tôi đã", " đi về"));
        assert!(!s.stable_text().ends_with(char::is_whitespace));
    }

    /// `preview` chia một bản đang stream theo phần ổn định hiện có, không đổi lịch sử.
    #[test]
    fn preview_splits_without_changing_the_history() {
        let mut s = Stabilizer::new("en", 2, 1);
        s.push("so we went");
        s.push("so we went home");
        assert_eq!(s.preview("so we"), split("so we", ""));
        assert_eq!(s.preview("so we will"), split("so we", " will"));
        assert_eq!(s.push("so we went home now"), split("so we went", " home now"));
    }

    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
        let mut s = Stabilizer::new("en", 2, 1);
        assert_eq!(s.push(""), Split::default());
        assert_eq!(s.push("..."), Split::default());
        assert_eq!(s.stable_len(), 0);
    }

    /// Dấu kết câu ở cuối bản dịch tạm không hiện (spec §4.3): bỏ đúng một dấu, và khoảng trắng hai bên nó.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
```

Expected: lỗi biên dịch `cannot find type Split`, `Stabilizer`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/streaming.rs`: thay

```rust
use crate::glossary::normalize;
use crate::sentence::SENTENCE_END;
use unicode_normalization::UnicodeNormalization;
```

bằng

```rust
use crate::glossary::normalize;
use crate::sentence::SENTENCE_END;
use std::collections::VecDeque;
use unicode_normalization::UnicodeNormalization;
```

rồi thêm vào sau hàm `strip_terminal_punct` (trước `#[cfg(test)]`):

```rust
/// Kết quả hiển thị: `stable + tail` là cả chuỗi; `tail` tự mang khoảng trắng đầu khi cần.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Split {
    pub stable: String,
    pub tail: String,
}

/// Chốt dần theo LocalAgreement-n, chỉ dài thêm (spec §4.2, §4.4).
///
/// Mỗi `push`: tách đơn vị, giữ `n` kết quả gần nhất; đủ `n` kết quả thì `c` = độ dài phần chung (theo khóa) của cả `n`,
/// `cand = c − holdback`; nếu `cand` dài hơn phần ổn định và kết quả mới nhất khớp phần ổn định ở các vị trí đầu, phần ổn
/// định lấy `cand` đơn vị đầu của kết quả mới nhất. Phần tạm là các đơn vị của kết quả mới nhất từ vị trí `stable_len()`.
#[derive(Clone, Debug)]
pub struct Stabilizer {
    lang: String,
    n: usize,
    holdback: usize,
    history: VecDeque<Vec<Unit>>,
    stable: Vec<Unit>,
}

impl Stabilizer {
    pub fn new(lang: &str, agree_n: usize, holdback: usize) -> Self {
        Self {
            lang: lang.to_string(),
            n: agree_n.max(1),
            holdback,
            history: VecDeque::new(),
            stable: Vec::new(),
        }
    }

    /// Thêm một kết quả mới (bản chép từng phần, hay bản dịch tạm đã xong) và trả phần ổn định / phần tạm.
    pub fn push(&mut self, text: &str) -> Split {
        self.history.push_back(split_units(text, &self.lang));
        while self.history.len() > self.n {
            self.history.pop_front();
        }
        let newest = self.history.back().expect("vừa thêm").clone();
        if self.history.len() == self.n {
            let common = (0..newest.len())
                .take_while(|&i| {
                    self.history
                        .iter()
                        .all(|h| h.get(i).is_some_and(|u| u.key == newest[i].key))
                })
                .count();
            let cand = common.saturating_sub(self.holdback);
            let keeps_stable = self.stable.iter().zip(&newest).all(|(s, u)| s.key == u.key);
            if cand > self.stable.len() && keeps_stable {
                self.stable = newest[..cand].to_vec();
            }
        }
        self.split_of(&newest)
    }

    /// Chia một bản chưa xong (bản dịch tạm đang stream) theo phần ổn định hiện có, không đổi lịch sử.
    pub fn preview(&self, text: &str) -> Split {
        self.split_of(&split_units(text, &self.lang))
    }

    fn split_of(&self, units: &[Unit]) -> Split {
        let stable = join_units(&self.stable, &self.lang);
        let rest = units.get(self.stable.len()..).unwrap_or(&[]);
        let mut tail = join_units(rest, &self.lang);
        if !tail.is_empty() && !stable.is_empty() && !uses_char_units(&self.lang) {
            tail.insert(0, ' ');
        }
        Split { stable, tail }
    }

    /// Phần ổn định dạng chuỗi (không có khoảng trắng cuối): dùng làm prefill.
    pub fn stable_text(&self) -> String {
        join_units(&self.stable, &self.lang)
    }

    pub fn stable_len(&self) -> usize {
        self.stable.len()
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 12 test `streaming::tests::…` đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/streaming.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): Stabilizer chốt dần chữ nguồn và chữ dịch theo LocalAgreement-n (H4)

Phần ổn định là phần chung của n kết quả liền nhau trừ holdback đơn vị cuối, chỉ dài thêm; phần tạm lấy từ kết quả mới
nhất; stable_text không có khoảng trắng cuối để làm prefill; preview chia bản đang stream mà không đổi lịch sử.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---

## Task 4: `streaming`: `Cadence`

Đúng H4 và spec §5: T = `initial_cadence_ms` khi chưa đủ `warmup_cycles` vòng; sau đó `cadence_factor` × trung vị của tối đa `cycle_window` vòng gần nhất, kẹp [`min_cadence_ms`, `max_cadence_ms`]; tự tắt khi đủ `cycle_window` vòng và trung vị lớn hơn `auto_off_cycle_ms`. Trung vị theo `metrics::percentile` (nội suy như numpy).

**Files:**
- Modify: `crates/pipeline/src/streaming.rs` (import; thêm sau `impl Stabilizer`; thêm test)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/streaming.rs`: thay

```rust
    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
```

bằng

```rust
    /// Nhịp T (spec §5): 1 000 ms khi chưa đủ 3 vòng; sau đó 1,5 × trung vị.
    #[test]
    fn the_cadence_starts_at_one_second_then_follows_the_median() {
        let mut c = Cadence::new(&StreamingConfig::default());
        assert_eq!(c.cadence_ms(), 1_000);
        c.record(500.0);
        c.record(700.0);
        assert_eq!(c.cadence_ms(), 1_000, "chưa đủ 3 vòng");
        c.record(600.0);
        assert_eq!(c.cadence_ms(), 900, "1,5 × trung vị 600");
        c.record(800.0);
        assert_eq!(c.cadence_ms(), 975, "1,5 × trung vị 650");
    }

    #[test]
    fn the_cadence_is_clamped_between_700_and_2000_ms() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..3 {
            c.record(100.0);
        }
        assert_eq!(c.cadence_ms(), 700);
        for _ in 0..8 {
            c.record(1_900.0);
        }
        assert_eq!(c.cadence_ms(), 2_000);
    }

    /// Chỉ `cycle_window` (8) vòng gần nhất được tính.
    #[test]
    fn only_the_last_eight_cycles_count() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..8 {
            c.record(3_000.0);
        }
        for _ in 0..5 {
            c.record(400.0);
        }
        // Còn 3 vòng 3 000 ms và 5 vòng 400 ms: trung vị 400, T = 600 kẹp lên 700.
        assert_eq!(c.cadence_ms(), 700);
        assert!(!c.too_slow());
    }

    /// Tự tắt (spec §5): đủ 8 vòng và trung vị lớn hơn 1 300 ms.
    #[test]
    fn the_mode_turns_off_only_with_a_full_window_over_the_limit() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..7 {
            c.record(5_000.0);
        }
        assert!(!c.too_slow(), "mới 7 vòng");
        c.record(5_000.0);
        assert!(c.too_slow());
        let mut c = Cadence::new(&StreamingConfig::default());
        for _ in 0..8 {
            c.record(1_300.0);
        }
        assert!(!c.too_slow(), "đúng 1 300 ms chưa tắt");
        for _ in 0..8 {
            c.record(1_301.0);
        }
        assert!(c.too_slow());
    }

    #[test]
    fn bad_cycle_values_are_ignored() {
        let mut c = Cadence::new(&StreamingConfig::default());
        for bad in [f32::NAN, -1.0, f32::INFINITY] {
            c.record(bad);
        }
        assert_eq!(c.cadence_ms(), 1_000);
        for _ in 0..8 {
            c.record(f32::NAN);
        }
        assert!(!c.too_slow());
    }

    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
```

Expected: lỗi biên dịch `cannot find type Cadence`, `StreamingConfig`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/streaming.rs`: thay

```rust
use crate::glossary::normalize;
use crate::sentence::SENTENCE_END;
use std::collections::VecDeque;
```

bằng

```rust
use crate::config::StreamingConfig;
use crate::glossary::normalize;
use crate::metrics::percentile;
use crate::sentence::SENTENCE_END;
use std::collections::VecDeque;
```

rồi thêm vào sau `impl Stabilizer { … }` (trước `#[cfg(test)]`):

```rust
/// Nhịp T và tự tắt (spec §5): giữ tối đa `cycle_window` vòng cập nhật gần nhất (ms). Một vòng là từ lúc tạo lần chép từng
/// phần tới lúc bản dịch tạm của nó xong; vòng bị hủy không được ghi.
#[derive(Clone, Debug)]
pub struct Cadence {
    cycles: VecDeque<f32>,
    window: usize,
    factor: f32,
    min_ms: u64,
    max_ms: u64,
    initial_ms: u64,
    warmup: usize,
    auto_off_ms: u64,
}

impl Cadence {
    pub fn new(cfg: &StreamingConfig) -> Self {
        Self {
            cycles: VecDeque::new(),
            window: cfg.cycle_window.max(1),
            factor: cfg.cadence_factor,
            min_ms: cfg.min_cadence_ms,
            // `validate` đã bảo đảm max ≥ min; giữ lại ở đây để `clamp` không bao giờ panic.
            max_ms: cfg.max_cadence_ms.max(cfg.min_cadence_ms),
            initial_ms: cfg.initial_cadence_ms,
            warmup: cfg.warmup_cycles,
            auto_off_ms: cfg.auto_off_cycle_ms,
        }
    }

    /// Một vòng cập nhật xong. Số âm hay không hữu hạn thì bỏ.
    pub fn record(&mut self, cycle_ms: f32) {
        if !(cycle_ms.is_finite() && cycle_ms >= 0.0) {
            return;
        }
        self.cycles.push_back(cycle_ms);
        while self.cycles.len() > self.window {
            self.cycles.pop_front();
        }
    }

    fn median(&self) -> Option<f32> {
        let cycles: Vec<f32> = self.cycles.iter().copied().collect();
        percentile(&cycles, 50.0)
    }

    /// T (ms): `initial_cadence_ms` khi chưa đủ `warmup_cycles` vòng; sau đó `cadence_factor` × trung vị, kẹp
    /// [`min_cadence_ms`, `max_cadence_ms`].
    pub fn cadence_ms(&self) -> u64 {
        match self.median() {
            Some(median) if self.cycles.len() >= self.warmup => {
                ((median * self.factor).round() as u64).clamp(self.min_ms, self.max_ms)
            }
            _ => self.initial_ms,
        }
    }

    /// Đủ `cycle_window` vòng và trung vị lớn hơn `auto_off_cycle_ms`: máy không theo kịp (spec §5).
    pub fn too_slow(&self) -> bool {
        self.cycles.len() >= self.window && self.median().is_some_and(|m| m > self.auto_off_ms as f32)
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib streaming
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 17 test `streaming::tests::…` đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/streaming.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): Cadence tính nhịp chép từng phần và điều kiện tự tắt (spec 2026-10-10 §5)

T = 1,5 × trung vị của 8 vòng cập nhật gần nhất, kẹp [700, 2000] ms, 1000 ms khi chưa đủ 3 vòng; tự tắt khi đủ 8 vòng
mà trung vị quá 1300 ms. Số vô lý bị bỏ.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---

## Task 5: `LiveLine` và `LiveEnd`

Đúng H5. Thêm `Default` cho `LiveLine` (ngoài H5) để dựng dòng mới gọn hơn; tên và kiểu các trường giữ nguyên.

**Files:**
- Modify: `crates/pipeline/src/subtitle.rs` (đầu file dòng 1–5; sau `struct Delta`; test)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/subtitle.rs`: thay

```rust
#[cfg(test)]
mod tests {
    use super::*;
```

bằng

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// Sự kiện dòng đang nói (spec 2026-10-10 §6.2, H5): tên trường snake_case như `Subtitle`.
    #[test]
    fn live_events_serialize_with_snake_case_fields() {
        let line = LiveLine {
            id: 12,
            extends: Some(10),
            src_lang: "en".into(),
            src_stable: "so we".into(),
            src_tail: " went".into(),
            tgt_stable: "chúng tôi".into(),
            tgt_tail: " đã đi".into(),
            tgt_src_units: 3,
        };
        assert_eq!(
            serde_json::to_value(&line).unwrap(),
            serde_json::json!({
                "id": 12, "extends": 10, "src_lang": "en", "src_stable": "so we", "src_tail": " went",
                "tgt_stable": "chúng tôi", "tgt_tail": " đã đi", "tgt_src_units": 3
            })
        );
        let fresh = LiveLine::default();
        assert_eq!(serde_json::to_value(&fresh).unwrap()["extends"], serde_json::Value::Null);
        assert_eq!(
            serde_json::to_value(LiveEnd { id: 12 }).unwrap(),
            serde_json::json!({ "id": 12 })
        );
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib subtitle
```

Expected: lỗi biên dịch `cannot find struct LiveLine`, `LiveEnd`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/subtitle.rs`: thay

```rust
//! Hai sự kiện: `subtitle://upsert` gửi cả đối tượng (giao diện thay phụ đề cùng `id`), `subtitle://delta` gửi phần chữ
//! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
//! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.
```

bằng

```rust
//! Hai sự kiện: `subtitle://upsert` gửi cả đối tượng (giao diện thay phụ đề cùng `id`), `subtitle://delta` gửi phần chữ
//! dịch mới trong lúc đang dịch (giao diện nối vào `tgt_text` của phụ đề cùng `id`). Một upsert luôn thay hẳn chữ dịch,
//! nên sau khi dịch lại (ghép câu, thử lại) chữ cũ không còn.
//!
//! Chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.2) thêm `subtitle://live` (`LiveLine`, dòng đang nói, chỉ
//! cho thanh phụ đề) và `subtitle://live-end` (`LiveEnd`, gỡ dòng đó).
```

và thay

```rust
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Delta {
    pub id: u64,
    /// Phần chữ dịch mới, đã qua hậu xử lý.
    pub text: String,
}
```

bằng

```rust
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Delta {
    pub id: u64,
    /// Phần chữ dịch mới, đã qua hậu xử lý.
    pub text: String,
}

/// Dòng đang nói (spec 2026-10-10 §6.2, `subtitle://live`): bản tạm của đoạn VAD đang mở. Phần ổn định và phần tạm là hai
/// chuỗi riêng (`stable + tail` là cả chuỗi, `tail` tự mang khoảng trắng đầu khi cần), không gửi chỉ số, để không lệch
/// giữa UTF-8 và UTF-16.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct LiveLine {
    /// `id_base` + id mà đoạn mở sẽ nhận khi đóng (cùng không gian id với `Subtitle`).
    pub id: u64,
    /// Id phụ đề tạm (đang trong cửa sổ ghép) mà dòng này nối tiếp; thanh phụ đề vẽ dòng thay chỗ phụ đề đó.
    pub extends: Option<u64>,
    pub src_lang: String,
    pub src_stable: String,
    pub src_tail: String,
    pub tgt_stable: String,
    pub tgt_tail: String,
    /// Số đơn vị nguồn mà bản dịch đang hiện được dịch từ đó (chỉ để đo, §10.1; giao diện bỏ qua).
    pub tgt_src_units: u32,
}

/// Gỡ dòng đang nói (`subtitle://live-end`): lượt cuối đã chốt, đoạn bị lọc hay bỏ, chế độ tự tắt, dừng phiên.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct LiveEnd {
    pub id: u64,
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib subtitle
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 2 test `subtitle::tests::…` đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/subtitle.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): sự kiện LiveLine và LiveEnd của dòng đang nói (H5)

Phần ổn định và phần tạm của chữ nguồn và chữ dịch là các chuỗi riêng, extends chỉ phụ đề tạm được nối tiếp,
tgt_src_units chỉ để đo; tên trường snake_case như Subtitle.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---
## Task 6: `Segmenter` đọc đoạn đang mở, đổi ngưỡng; `PartialScheduler`

Spec §4.1:
- `OpenProgress` (id, tiếng nói, im lặng ngay sau tiếng nói) cho luồng VAD xét mỗi khung, không chép âm thanh;
- `OpenSnapshot { id, start_ms, speech_ms, samples, mean_prob }` chỉ dựng khi thật sự chép từng phần;
- `set_end_silence_ms` đổi ngưỡng đóng đoạn (H6: chỉ gọi khi không có đoạn mở).

Id được gán lúc đoạn được giữ (`emit`, `next_id`), và đoạn mở có từ `min_speech_ms` tiếng nói thì luôn được giữ khi đóng (đóng vì im lặng, hết luồng, hay cắt cưỡng bức), với đúng id `next_id` của ảnh chụp. `PartialScheduler` chỉ chép từng phần khi đã có từng ấy tiếng nói; test của task này ghim tính chất đó.

`PartialScheduler` (thêm vào `streaming`, ngoài H4) là luật thuần của §4.1:
- **Theo nhịp:** tiếng nói ≥ max(`min_partial_speech_ms`, `segmenter.min_speech_ms`); từ lần trước của cùng đoạn đã qua ít nhất T (giờ âm thanh, QĐ1) và có thêm ít nhất `min_new_speech_ms` tiếng nói; lần đầu của đoạn không chờ T.
- **Vừa hết tiếng nói:** ngưỡng đóng đoạn đang dùng lớn hơn 2 khung; khung im lặng thứ hai; tiếng nói ≥ max(250, `segmenter.min_speech_ms`); có tiếng nói mới từ lần trước; không chờ T.
- **Cả hai:** không có đoạn đóng nào đang chờ nhận dạng.

**Files:**
- Modify: `crates/pipeline/src/segmenter.rs` (sau `Segment`, dòng 57; sau `open_start_ms`, dòng 191–195; `impl Debug` dòng 241–254; test cuối file)
- Modify: `crates/pipeline/src/streaming.rs` (import; thêm sau `impl Cadence`; test)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/segmenter.rs`: thay

```rust
    #[test]
    fn flush_keeps_the_same_tail_padding_as_a_normal_close() {
```

bằng

```rust
    /// Ảnh chụp đoạn đang mở (spec 2026-10-10 §4.1): id mà đoạn sẽ nhận khi đóng, mốc đầu, tiếng nói, âm thanh từ đầu phần
    /// đệm trước tới khung hiện tại; tiến độ cho biết im lặng ngay sau tiếng nói.
    #[test]
    fn the_open_snapshot_has_the_id_and_audio_the_segment_will_get() {
        let mut f = Feed::new();
        f.run(&[(0.0, 0.0, 20), (0.9, 0.5, 40)]);
        let snap = f.seg.open_snapshot().expect("đang có đoạn mở");
        assert_eq!(
            (snap.id, snap.start_ms, snap.speech_ms),
            (0, 20 * FRAME_MS, 40 * FRAME_MS)
        );
        assert!((snap.mean_prob - 0.9).abs() < 1e-6, "{}", snap.mean_prob);
        assert!(
            snap.samples == f.stream[13..60].concat(),
            "7 khung đệm trước và 40 khung tiếng nói"
        );
        assert_eq!(
            f.seg.open_progress(),
            Some(OpenProgress {
                id: 0,
                speech_ms: 40 * FRAME_MS,
                silence_ms: 0
            })
        );
        f.run(&[(0.0, 0.0, 2)]);
        assert_eq!(
            f.seg.open_progress().map(|p| (p.speech_ms, p.silence_ms)),
            Some((40 * FRAME_MS, 2 * FRAME_MS))
        );
        assert_eq!(
            f.seg.open_snapshot().unwrap().samples.len(),
            (7 + 42) * FRAME_SAMPLES,
            "gồm cả khung im lặng mới"
        );
        f.run(&[(0.0, 0.0, 8)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!((f.out[0].id, f.out[0].start_ms), (snap.id, snap.start_ms));
        assert_eq!(f.seg.open_snapshot(), None);
        assert_eq!(f.seg.open_progress(), None);
        f.run(&[(0.9, 0.5, 10)]);
        assert_eq!(f.seg.open_progress().map(|p| p.id), Some(1));
    }

    /// Đoạn mở có từ `min_speech_ms` tiếng nói luôn được giữ khi đóng, với đúng id của ảnh chụp; ngắn hơn thì có thể bị bỏ
    /// và id đó về tay đoạn sau. Vì vậy chỉ chép từng phần khi đã đủ `min_speech_ms` (`PartialScheduler`).
    #[test]
    fn an_open_segment_with_min_speech_keeps_its_snapshot_id() {
        // Đóng vì im lặng.
        let mut f = Feed::new();
        f.run(&[(0.0, 0.0, 5), (0.9, 0.5, 8)]);
        let open = f.seg.open_progress().unwrap();
        assert_eq!(open.speech_ms, 256);
        f.run(&[(0.0, 0.0, 10)]);
        assert_eq!(f.out.iter().map(|s| s.id).collect::<Vec<_>>(), [open.id]);
        // Hết luồng.
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 8), (0.0, 0.0, 3)]);
        let id = f.seg.open_progress().unwrap().id;
        assert_eq!(f.seg.flush().map(|s| s.id), Some(id));
        // Blip 7 khung (224 ms) bị bỏ: id 0 thuộc về đoạn sau.
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 7)]);
        assert_eq!(f.seg.open_progress().unwrap().id, 0);
        f.run(&[(0.0, 0.0, 10), (0.9, 0.5, 10), (0.0, 0.0, 10)]);
        assert_eq!(
            f.out.iter().map(|s| (s.id, s.start_ms)).collect::<Vec<_>>(),
            [(0, 17 * FRAME_MS)]
        );
    }

    /// Cắt cưỡng bức ở 8 giây: phần đầu nhận id của ảnh chụp, phần còn lại mở tiếp với id kế.
    #[test]
    fn a_forced_cut_moves_the_open_segment_to_the_next_id() {
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 100)]);
        assert_eq!(f.seg.open_progress().unwrap().id, 0);
        f.run(&[(0.9, 0.5, 150)]);
        assert_eq!(f.out.iter().map(|s| s.id).collect::<Vec<_>>(), [0]);
        assert_eq!(f.seg.open_progress().unwrap().id, 1);
    }

    /// Ngưỡng đóng đoạn đổi được giữa phiên (spec 2026-10-10 §4.7, H6).
    #[test]
    fn the_end_silence_can_change_between_segments() {
        let mut seg = Segmenter::new(SegmenterConfig {
            end_silence_ms: 50,
            ..Default::default()
        });
        assert_eq!(
            run(&mut seg, &[(0.9, 0.5, 10), (0.0, 0.0, 2)]).len(),
            1,
            "50 ms = 2 khung"
        );
        seg.set_end_silence_ms(400);
        assert_eq!(seg.end_silence_ms(), 400);
        assert!(
            run(&mut seg, &[(0.9, 0.5, 10), (0.0, 0.0, 12)]).is_empty(),
            "400 ms = 13 khung, mới có 12"
        );
        assert_eq!(run(&mut seg, &[(0.0, 0.0, 1)]).len(), 1);
    }

    #[test]
    fn flush_keeps_the_same_tail_padding_as_a_normal_close() {
```

`crates/pipeline/src/streaming.rs`: thay

```rust
    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
```

bằng

```rust
    fn open(id: u64, speech_ms: u64, silence_ms: u64) -> OpenProgress {
        OpenProgress {
            id,
            speech_ms,
            silence_ms,
        }
    }

    /// Chép theo nhịp (spec §4.1): đủ 1 000 ms tiếng nói, qua T từ lần trước và thêm 300 ms tiếng nói, không có đoạn đóng
    /// nào đang chờ; lần đầu của một đoạn không chờ T.
    #[test]
    fn periodic_partials_need_speech_new_speech_and_the_cadence() {
        let mut s = PartialScheduler::new(&StreamingConfig::default(), 250, 400);
        assert_eq!(s.decide(open(0, 992, 0), 1_000, 1_000, false), None, "chưa đủ 1 000 ms");
        assert_eq!(s.decide(open(0, 1_024, 0), 1_032, 1_000, false), Some(PartialKind::Periodic));
        assert_eq!(
            s.decide(open(0, 1_280, 0), 2_100, 1_000, false),
            None,
            "qua T nhưng mới thêm 256 ms tiếng nói"
        );
        assert_eq!(s.decide(open(0, 1_400, 0), 2_200, 1_000, false), Some(PartialKind::Periodic));
        assert_eq!(
            s.decide(open(0, 1_800, 0), 2_700, 1_000, false),
            None,
            "thêm 400 ms tiếng nói nhưng chưa qua T"
        );
        assert_eq!(
            s.decide(open(0, 2_048, 0), 3_300, 1_000, true),
            None,
            "có đoạn đóng đang chờ"
        );
        assert_eq!(s.decide(open(0, 2_048, 0), 3_300, 1_000, false), Some(PartialKind::Periodic));
        assert_eq!(
            s.decide(open(1, 1_024, 0), 3_400, 1_000, false),
            Some(PartialKind::Periodic),
            "đoạn mới: không chờ T"
        );
    }

    /// Chép khi vừa hết tiếng nói (spec §4.1): ở khung im lặng thứ hai, từ 250 ms tiếng nói, có tiếng nói mới, không chờ T.
    #[test]
    fn a_partial_is_taken_two_frames_after_speech_ends() {
        let mut s = PartialScheduler::new(&StreamingConfig::default(), 250, 400);
        assert_eq!(s.decide(open(0, 224, 64), 300, 1_000, false), None, "dưới 250 ms tiếng nói");
        assert_eq!(s.decide(open(1, 512, 32), 600, 1_000, false), None);
        assert_eq!(s.decide(open(1, 512, 64), 632, 1_000, false), Some(PartialKind::SpeechEnd));
        assert_eq!(s.decide(open(1, 512, 96), 664, 1_000, false), None, "một lần mỗi chỗ ngừng");
        assert_eq!(
            s.decide(open(1, 800, 64), 1_000, 1_000, false),
            Some(PartialKind::SpeechEnd),
            "nói tiếp rồi ngừng lần nữa"
        );
        assert_eq!(
            s.decide(open(1, 800, 64), 1_032, 1_000, false),
            None,
            "không có tiếng nói mới"
        );
        assert_eq!(s.decide(open(2, 512, 64), 2_000, 1_000, true), None, "có đoạn đóng đang chờ");
    }

    /// Ngưỡng đóng đoạn 2 khung (50 ms): đoạn đóng ngay ở khung im lặng thứ hai, không có lần chép khi vừa hết tiếng nói.
    #[test]
    fn no_speech_end_partial_when_the_threshold_is_two_frames() {
        let mut s = PartialScheduler::new(&StreamingConfig::default(), 250, 50);
        assert_eq!(s.decide(open(0, 512, 64), 600, 1_000, false), None);
        s.set_end_silence_ms(200);
        assert_eq!(s.decide(open(0, 512, 64), 632, 1_000, false), Some(PartialKind::SpeechEnd));
    }

    /// `segmenter.min_speech_ms` lớn hơn thì cũng chặn cả hai loại (đoạn ngắn hơn có thể bị bỏ khi đóng).
    #[test]
    fn the_segmenter_minimum_speech_bounds_partials() {
        let mut s = PartialScheduler::new(&StreamingConfig::default(), 1_500, 400);
        assert_eq!(s.decide(open(0, 1_024, 0), 1_100, 1_000, false), None);
        assert_eq!(s.decide(open(0, 1_024, 64), 1_132, 1_000, false), None);
        assert_eq!(s.decide(open(0, 1_504, 0), 1_600, 1_000, false), Some(PartialKind::Periodic));
    }

    #[test]
    fn empty_and_punctuation_only_results_show_nothing() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib segmenter
cargo test --locked -p pipeline --lib streaming
```

Expected: lỗi biên dịch `no method named open_snapshot`, `cannot find struct OpenProgress`, `PartialScheduler`, `PartialKind`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/segmenter.rs`: thay

```rust
    pub samples: Vec<f32>,
}

struct Active {
```

bằng

```rust
    pub samples: Vec<f32>,
}

/// Đoạn đang mở, không kèm âm thanh (spec 2026-10-10 §4.1): luồng VAD xét mỗi khung có nên chép từng phần không.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OpenProgress {
    /// Id mà đoạn sẽ nhận khi đóng.
    pub id: u64,
    /// Tiếng nói từ đầu đoạn tới khung tiếng nói cuối, không gồm đệm.
    pub speech_ms: u64,
    /// Im lặng liên tục ngay sau tiếng nói cuối (0 khi đang nói).
    pub silence_ms: u64,
}

/// Ảnh chụp đoạn đang mở để chép từng phần (spec 2026-10-10 §4.1).
#[derive(Clone, PartialEq)]
pub struct OpenSnapshot {
    /// Id mà đoạn sẽ nhận khi đóng (`next_id`). Đoạn có từ `min_speech_ms` tiếng nói chắc chắn nhận id này.
    pub id: u64,
    pub start_ms: u64,
    pub speech_ms: u64,
    /// Âm thanh từ đầu phần đệm trước tới khung hiện tại (gồm cả các khung im lặng sau tiếng nói, nếu có).
    pub samples: Vec<f32>,
    /// Xác suất VAD trung bình trên các khung tiếng nói, như `Segment::mean_prob`.
    pub mean_prob: f32,
}

struct Active {
```

thay

```rust
    pub fn open_start_ms(&self) -> Option<u64> {
        self.active.as_ref().map(|a| a.start_frame * FRAME_MS)
    }
```

bằng

```rust
    pub fn open_start_ms(&self) -> Option<u64> {
        self.active.as_ref().map(|a| a.start_frame * FRAME_MS)
    }

    /// Tiến độ của đoạn đang mở, nếu có (spec 2026-10-10 §4.1). Rẻ: không chép âm thanh.
    pub fn open_progress(&self) -> Option<OpenProgress> {
        let a = self.active.as_ref()?;
        Some(OpenProgress {
            id: self.next_id,
            speech_ms: (a.last_speech_frame + 1).saturating_sub(a.start_frame) * FRAME_MS,
            silence_ms: a.silence_run * FRAME_MS,
        })
    }

    /// Ảnh chụp đoạn đang mở để chép từng phần (spec 2026-10-10 §4.1).
    pub fn open_snapshot(&self) -> Option<OpenSnapshot> {
        let a = self.active.as_ref()?;
        let speech_frames = (a.last_speech_frame + 1).saturating_sub(a.start_frame);
        let speech = &a.probs[..(speech_frames as usize).min(a.probs.len())];
        Some(OpenSnapshot {
            id: self.next_id,
            start_ms: a.start_frame * FRAME_MS,
            speech_ms: speech_frames * FRAME_MS,
            samples: a.pre_roll.iter().chain(&a.frames).flatten().copied().collect(),
            mean_prob: speech.iter().sum::<f32>() / speech.len().max(1) as f32,
        })
    }

    /// Đổi ngưỡng im lặng đóng đoạn (chế độ dịch trong lúc nói, spec 2026-10-10 §4.7). Engine chỉ gọi khi không có đoạn mở
    /// (H6), để đoạn đang mở giữ ngưỡng lúc nó bắt đầu.
    pub fn set_end_silence_ms(&mut self, ms: u64) {
        self.cfg.end_silence_ms = ms;
    }

    pub fn end_silence_ms(&self) -> u64 {
        self.cfg.end_silence_ms
    }
```

và thay

```rust
fn energy(frame: &[f32]) -> f32 {
```

bằng

```rust
// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for OpenSnapshot {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OpenSnapshot")
            .field("id", &self.id)
            .field("start_ms", &self.start_ms)
            .field("speech_ms", &self.speech_ms)
            .field("mean_prob", &self.mean_prob)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

fn energy(frame: &[f32]) -> f32 {
```

`crates/pipeline/src/streaming.rs`: thay

```rust
use crate::metrics::percentile;
use crate::sentence::SENTENCE_END;
```

bằng

```rust
use crate::metrics::percentile;
use crate::segmenter::{FRAME_MS, OpenProgress};
use crate::sentence::SENTENCE_END;
```

rồi thêm vào sau `impl Cadence { … }` (trước `#[cfg(test)]`):

```rust
/// Loại lần chép từng phần (spec §4.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PartialKind {
    /// Theo nhịp T.
    Periodic,
    /// Vừa hết tiếng nói (khung im lặng thứ hai), không chờ T.
    SpeechEnd,
}

/// Tiếng nói tối thiểu của lần chép khi vừa hết tiếng nói (spec §4.1).
const SPEECH_END_MIN_MS: u64 = 250;
/// Lần chép khi vừa hết tiếng nói diễn ra ở khung im lặng thứ hai (spec §4.1).
const SPEECH_END_SILENCE_MS: u64 = 2 * FRAME_MS;

/// Lịch chép từng phần của đoạn đang mở (spec §4.1). Giờ là giờ âm thanh (ms); luồng VAD gọi `decide` mỗi khung có đoạn
/// mở, khi chế độ này đang có hiệu lực cho đoạn đó.
#[derive(Clone, Debug)]
pub struct PartialScheduler {
    min_partial_speech_ms: u64,
    min_new_speech_ms: u64,
    /// Tiếng nói tối thiểu của lần chép khi vừa hết tiếng nói: 250 ms, và không dưới `segmenter.min_speech_ms`, để đoạn
    /// chắc chắn được giữ (với đúng id) khi đóng.
    min_end_speech_ms: u64,
    /// Ngưỡng đóng đoạn đang dùng lớn hơn 2 khung: mới có lần chép khi vừa hết tiếng nói.
    speech_end: bool,
    /// (id đoạn, giờ, tiếng nói) của lần chép từng phần gần nhất.
    last: Option<(u64, u64, u64)>,
}

impl PartialScheduler {
    /// `min_speech_ms`: `segmenter.min_speech_ms` (đoạn ngắn hơn bị bỏ khi đóng); `end_silence_ms`: ngưỡng đóng đoạn đang
    /// dùng.
    pub fn new(cfg: &StreamingConfig, min_speech_ms: u64, end_silence_ms: u64) -> Self {
        Self {
            min_partial_speech_ms: cfg.min_partial_speech_ms.max(min_speech_ms),
            min_new_speech_ms: cfg.min_new_speech_ms,
            min_end_speech_ms: SPEECH_END_MIN_MS.max(min_speech_ms),
            speech_end: end_silence_ms > SPEECH_END_SILENCE_MS,
            last: None,
        }
    }

    /// Ngưỡng đóng đoạn đổi (chỉ khi không có đoạn mở, H6).
    pub fn set_end_silence_ms(&mut self, end_silence_ms: u64) {
        self.speech_end = end_silence_ms > SPEECH_END_SILENCE_MS;
    }

    /// Có chép từng phần ở khung này không. `now_ms`: giờ âm thanh; `cadence_ms`: T; `closed_waiting`: hàng đợi nhận dạng
    /// còn đoạn đóng chờ. Trả loại lần chép, và ghi nhớ nó.
    pub fn decide(
        &mut self,
        open: OpenProgress,
        now_ms: u64,
        cadence_ms: u64,
        closed_waiting: bool,
    ) -> Option<PartialKind> {
        if closed_waiting {
            return None;
        }
        let (last_at, last_speech) = match self.last {
            Some((id, at, speech)) if id == open.id => (Some(at), speech),
            _ => (None, 0),
        };
        let new_speech = open.speech_ms.saturating_sub(last_speech);
        let kind = if self.speech_end
            && open.silence_ms == SPEECH_END_SILENCE_MS
            && open.speech_ms >= self.min_end_speech_ms
            && new_speech > 0
        {
            PartialKind::SpeechEnd
        } else if open.speech_ms >= self.min_partial_speech_ms
            && new_speech >= self.min_new_speech_ms
            && last_at.is_none_or(|at| now_ms.saturating_sub(at) >= cadence_ms)
        {
            PartialKind::Periodic
        } else {
            return None;
        };
        self.last = Some((open.id, now_ms, open.speech_ms));
        Some(kind)
    }
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib segmenter
cargo test --locked -p pipeline --lib streaming
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: mọi test `segmenter::tests::…` (4 test mới) và `streaming::tests::…` (21 test) đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/segmenter.rs crates/pipeline/src/streaming.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): đọc đoạn VAD đang mở và lịch chép từng phần (spec 2026-10-10 §4.1)

Segmenter cho tiến độ (id sẽ nhận khi đóng, tiếng nói, im lặng sau tiếng nói), ảnh chụp âm thanh từ đầu phần đệm, và
đổi ngưỡng đóng đoạn giữa phiên. PartialScheduler quyết lần chép theo nhịp T và lần chép khi vừa hết tiếng nói, chỉ khi
đoạn đã đủ min_speech_ms nên chắc chắn giữ đúng id.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng hai file.

---

## Task 7: `AsrQueue`: ô chép từng phần

Spec §4.1, "Hàng đợi nhận dạng": đoạn đóng luôn ra trước; chỉ giữ tối đa một yêu cầu chép từng phần, yêu cầu mới thay yêu cầu cũ; luật gộp và bỏ đoạn của §7 spec chính chỉ áp cho đoạn đóng. Thêm: đoạn đóng thì yêu cầu đang chờ của chính nó (hay của đoạn trước) bị bỏ, vì lượt cuối đã thay.

Luồng nhận dạng chưa chép từng phần cho tới Task 11; ở task này nó bỏ qua `Popped::Partial` (chưa ai tạo yêu cầu này: luồng VAD tạo từ Task 12).

**Files:**
- Modify: `crates/pipeline/src/queue.rs` (import dòng 11–14; sau `impl Debug for PendingSegment`; `Popped` dòng 73–78; `AsrQueue` dòng 80–129; test)
- Modify: `crates/pipeline/src/engine.rs` (`asr_loop`, khối `match popped`)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/queue.rs`: thay

```rust
    /// Đoạn gộp lấy trung bình xác suất VAD theo độ dài tiếng nói.
```

bằng

```rust
    fn partial(id: u64, upto_ms: u64) -> PartialRequest {
        PartialRequest {
            id,
            start_ms: 0,
            upto_ms,
            speech_ms: upto_ms,
            mean_prob: 0.9,
            samples: vec![0.0; 16],
            requested: Instant::now(),
        }
    }

    /// Spec 2026-10-10 §4.1: đoạn đóng luôn được nhận dạng trước lần chép từng phần.
    #[test]
    fn closed_segments_always_go_before_the_partial() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.push(seg(3, 0, 1_000, 1));
        q.push(seg(4, 2_000, 3_000, 1));
        assert!(q.has_waiting_segments());
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [3]));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [4]));
        assert!(!q.has_waiting_segments());
        assert!(matches!(q.pop(0), Some(Popped::Partial(p)) if p.id == 5));
        assert!(q.pop(0).is_none());
    }

    #[test]
    fn a_new_partial_replaces_the_waiting_one() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.set_partial(partial(5, 2_000));
        assert!(matches!(q.pop(0), Some(Popped::Partial(p)) if p.upto_ms == 2_000));
        assert!(q.pop(0).is_none(), "chỉ giữ một yêu cầu");
        assert!(q.is_empty() && q.len() == 0, "len chỉ đếm đoạn đóng");
    }

    /// Đoạn đã đóng thì yêu cầu chép từng phần đang chờ của nó (hay của đoạn trước) không còn cần: lượt cuối đã thay.
    #[test]
    fn closing_a_segment_drops_its_waiting_partial() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.push(seg(4, 0, 900, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(_))));
        assert!(
            matches!(q.pop(0), Some(Popped::Partial(_))),
            "đoạn 4 đóng không đụng yêu cầu của đoạn 5"
        );
        q.set_partial(partial(5, 1_500));
        q.push(seg(5, 0, 1_600, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [5]));
        assert!(q.pop(0).is_none());
    }

    #[test]
    fn the_partial_request_debug_has_no_audio() {
        let text = format!("{:?}", partial(5, 1_000));
        assert!(text.contains("<16 mẫu>") && text.contains("id: 5"), "{text}");
    }

    /// Đoạn gộp lấy trung bình xác suất VAD theo độ dài tiếng nói.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib queue
```

Expected: lỗi biên dịch `cannot find struct PartialRequest`, `no method named set_partial`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/queue.rs`: thay

```rust
use crate::config::QueueConfig;
use crate::sentence::joiner;
use asr_protocol::SAMPLE_RATE;
use std::collections::VecDeque;
```

bằng

```rust
use crate::config::QueueConfig;
use crate::sentence::joiner;
use asr_protocol::SAMPLE_RATE;
use std::collections::VecDeque;
use std::time::Instant;
```

thay

```rust
#[derive(Debug, PartialEq)]
pub enum Popped {
    Segment(PendingSegment),
    /// Trễ quá `asr_drop_after_ms`: bỏ, không nhận dạng.
    Dropped(PendingSegment),
}

#[derive(Debug)]
pub struct AsrQueue {
    items: VecDeque<PendingSegment>,
    cfg: QueueConfig,
}

impl AsrQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
        }
    }
```

bằng

```rust
/// Một lần chép từng phần của đoạn đang mở (spec 2026-10-10 §4.1). Luồng VAD tạo; hàng đợi chỉ giữ yêu cầu mới nhất.
#[derive(Clone, PartialEq)]
pub struct PartialRequest {
    /// Id mà đoạn sẽ nhận khi đóng (`Segmenter::open_snapshot`).
    pub id: u64,
    /// Mốc đầu tiếng nói của đoạn, và giờ âm thanh lúc chụp.
    pub start_ms: u64,
    pub upto_ms: u64,
    pub speech_ms: u64,
    pub mean_prob: f32,
    pub samples: Vec<f32>,
    /// Lúc luồng VAD tạo yêu cầu (giờ thật): mốc đầu của vòng cập nhật (spec §5).
    pub requested: Instant,
}

// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for PartialRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PartialRequest")
            .field("id", &self.id)
            .field("start_ms", &self.start_ms)
            .field("upto_ms", &self.upto_ms)
            .field("speech_ms", &self.speech_ms)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

#[derive(Debug, PartialEq)]
pub enum Popped {
    Segment(PendingSegment),
    /// Trễ quá `asr_drop_after_ms`: bỏ, không nhận dạng.
    Dropped(PendingSegment),
    /// Lần chép từng phần: chỉ ra khi không còn đoạn đóng nào chờ (spec 2026-10-10 §4.1).
    Partial(PartialRequest),
}

/// `len`, `is_empty` và luật gộp, bỏ đoạn chỉ xét đoạn đóng; ô chép từng phần nằm riêng.
#[derive(Debug)]
pub struct AsrQueue {
    items: VecDeque<PendingSegment>,
    partial: Option<PartialRequest>,
    cfg: QueueConfig,
}

impl AsrQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            partial: None,
            cfg,
        }
    }

    /// Đặt yêu cầu chép từng phần, thay yêu cầu đang chờ (nếu có).
    pub fn set_partial(&mut self, partial: PartialRequest) {
        self.partial = Some(partial);
    }

    /// Còn đoạn đóng chờ nhận dạng: luồng VAD chưa tạo lần chép từng phần theo nhịp (spec 2026-10-10 §4.1).
    pub fn has_waiting_segments(&self) -> bool {
        !self.items.is_empty()
    }
```

thay

```rust
    pub fn push(&mut self, segment: PendingSegment) {
        if self.items.len() >= self.cfg.asr_max_waiting && self.items.len() >= 2 {
```

bằng

```rust
    pub fn push(&mut self, segment: PendingSegment) {
        // Đoạn đã đóng: lần chép từng phần đang chờ của nó (hay của đoạn trước) không còn cần.
        if let Some(&last) = segment.ids.last()
            && self.partial.as_ref().is_some_and(|p| p.id <= last)
        {
            self.partial = None;
        }
        if self.items.len() >= self.cfg.asr_max_waiting && self.items.len() >= 2 {
```

và thay

```rust
    /// Lấy đoạn kế tiếp. Đoạn đã trễ quá `asr_drop_after_ms` (tính từ `end_ms`) thì trả `Dropped`.
    pub fn pop(&mut self, now_ms: u64) -> Option<Popped> {
        let segment = self.items.pop_front()?;
```

bằng

```rust
    /// Lấy đoạn kế tiếp. Đoạn đã trễ quá `asr_drop_after_ms` (tính từ `end_ms`) thì trả `Dropped`. Hết đoạn đóng thì trả lần
    /// chép từng phần đang chờ, nếu có.
    pub fn pop(&mut self, now_ms: u64) -> Option<Popped> {
        let Some(segment) = self.items.pop_front() else {
            return self.partial.take().map(Popped::Partial);
        };
```

`crates/pipeline/src/engine.rs`, trong `asr_loop`: thay

```rust
            Popped::Dropped(s) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Dropped {
                    ids: s.ids,
                    start_ms: s.start_ms,
                    end_ms: s.end_ms,
                }));
                continue;
            }
        };
```

bằng

```rust
            Popped::Dropped(s) => {
                let _ = tx.send(Msg::Asr(AsrOutcome::Dropped {
                    ids: s.ids,
                    start_ms: s.start_ms,
                    end_ms: s.end_ms,
                }));
                continue;
            }
            // Chép từng phần: Task 11 của kế hoạch 02 thêm đường đi; tới đó luồng VAD chưa tạo yêu cầu này.
            Popped::Partial(_) => continue,
        };
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: mọi test của thư viện đạt, gồm 4 test mới `queue::tests::…`; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/queue.rs crates/pipeline/src/engine.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): ô chép từng phần trong hàng đợi nhận dạng (spec 2026-10-10 §4.1)

AsrQueue giữ tối đa một PartialRequest, yêu cầu mới thay yêu cầu cũ, chỉ ra khi không còn đoạn đóng chờ; đoạn đóng bỏ
yêu cầu đang chờ của chính nó. Luật gộp và bỏ đoạn chỉ áp cho đoạn đóng. Luồng nhận dạng tạm bỏ qua yêu cầu này.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng hai file.

---

## Task 8: Prefill trong `llama.rs`; server giả stream lại prefill như b11146

Spec §4.3, `bench/2026-10-10-do-tre/README.md` §2:
- prefill là tin nhắn `assistant` cuối; `--prefill-assistant` mặc định bật ở b11146 nên không đổi lệnh chạy;
- b11146 stream lại cả phần prefill, nên chữ stream về là cả bản dịch;
- prefill không được kết thúc bằng khoảng trắng: `chat_body` tự cắt, và prefill chỉ có khoảng trắng thì không gửi.

Thân request khi không có prefill giữ đúng như cũ (test ghim).

**Files:**
- Modify: `crates/pipeline/src/llama.rs` (`ChatRequest` dòng 118–124; `stream` dòng 318–335; `translate` dòng 338–351; test)
- Modify: `crates/pipeline/src/translate.rs` (`ChatRequest` trong `translate`, dòng 149–153)
- Modify: `crates/pipeline/src/engine.rs` (`ChatRequest` của lần làm nóng trong `mt_loop`)
- Modify: `crates/pipeline/src/bin/fake_llama_server.rs` (doc đầu file; nhánh `/v1/chat/completions`)
- Modify: `crates/pipeline/tests/clients.rs` (dòng 197–201; test mới)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/llama.rs`, trong `mod tests`: thay

```rust
    #[test]
    fn token_count_is_length_of_tokens_array() {
```

bằng

```rust
    fn chat(prefill: Option<&str>) -> ChatRequest<'_> {
        ChatRequest {
            prompt: "Dịch.\n\nHello",
            max_tokens: 40,
            repeat_penalty: 1.05,
            prefill,
        }
    }

    /// Không có prefill: thân request giữ đúng như trước (§6.5).
    #[test]
    fn the_body_without_prefill_is_unchanged() {
        assert_eq!(
            chat_body(&chat(None)),
            serde_json::json!({
                "messages": [{ "role": "user", "content": "Dịch.\n\nHello" }],
                "stream": true, "temperature": 0.0, "repeat_penalty": 1.05, "max_tokens": 40, "cache_prompt": true,
            })
        );
    }

    /// Prefill (spec 2026-10-10 §4.3) là tin nhắn assistant cuối, không có khoảng trắng cuối; chỉ có khoảng trắng thì không
    /// gửi.
    #[test]
    fn the_prefill_is_the_last_assistant_message_without_trailing_space() {
        let body = chat_body(&chat(Some("Xin chào ")));
        assert_eq!(body["messages"].as_array().unwrap().len(), 2);
        assert_eq!(
            body["messages"][1],
            serde_json::json!({ "role": "assistant", "content": "Xin chào" })
        );
        assert_eq!(chat_body(&chat(Some(" \n"))), chat_body(&chat(None)));
    }

    #[test]
    fn token_count_is_length_of_tokens_array() {
```

`crates/pipeline/tests/clients.rs`: thay

```rust
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
    };
```

bằng

```rust
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
        prefill: None,
    };
```

và thay

```rust
/// API key không lộ ra `Debug`, log của app, `llama-server.log` (kể cả khi server in key ra stderr) hay log sự kiện.
```

bằng

```rust
/// Prefill (spec 2026-10-10 §4.3): server giả làm như `llama-server` b11146, stream lại nguyên phần prefill rồi sinh tiếp
/// sau nó, nên chữ stream về là cả bản dịch.
#[test]
fn llama_server_streams_the_prefill_back_then_continues() {
    let t = Temp::new("llama-prefill");
    let server = LlamaServer::spawn(&llama_launch(&t, &["ok"])).unwrap();
    let mut deltas = Vec::new();
    let req = ChatRequest {
        prompt: "Translate the following text into Vietnamese.\n\nGood morning everyone",
        max_tokens: 64,
        repeat_penalty: 1.05,
        prefill: Some("VI: Good"),
    };
    let end = server
        .stream(&req, &mut |d| {
            deltas.push(d.to_string());
            ControlFlow::Continue(())
        })
        .unwrap();
    assert_eq!(deltas, ["VI: Good", " morning", " everyone"]);
    assert_eq!(end.text, "VI: Good morning everyone");
    drop(server);
    let events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert_eq!(events, "start ngl=auto extra=\nchat 1 repeat=1.05 max=64 prefill=8\n");
}

/// API key không lộ ra `Debug`, log của app, `llama-server.log` (kể cả khi server in key ra stderr) hay log sự kiện.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib llama
```

Expected: lỗi biên dịch `struct ChatRequest has no field named prefill`, `cannot find function chat_body`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/llama.rs`: thay

```rust
/// Một request dịch.
#[derive(Clone, Copy, Debug)]
pub struct ChatRequest<'a> {
    pub prompt: &'a str,
    pub max_tokens: u32,
    pub repeat_penalty: f64,
}
```

bằng

```rust
/// Một request dịch.
#[derive(Clone, Copy, Debug)]
pub struct ChatRequest<'a> {
    pub prompt: &'a str,
    pub max_tokens: u32,
    pub repeat_penalty: f64,
    /// Phần đầu của câu trả lời (bản dịch tạm, spec 2026-10-10 §4.3): phần dịch đã chốt. `None` với lượt cuối.
    pub prefill: Option<&'a str>,
}

/// Thân request `/v1/chat/completions` (§6.5). Có `prefill` thì thêm một tin nhắn assistant cuối: `llama-server` b11146
/// (`--prefill-assistant`, mặc định bật) sinh tiếp sau phần đó và stream lại cả phần đó. Khoảng trắng cuối của prefill bị
/// bỏ, vì làm lệch token (`bench/2026-10-10-do-tre/README.md` §2); prefill chỉ có khoảng trắng thì không gửi.
fn chat_body(req: &ChatRequest) -> serde_json::Value {
    let mut messages = vec![serde_json::json!({ "role": "user", "content": req.prompt })];
    if let Some(prefill) = req.prefill.map(str::trim_end).filter(|p| !p.is_empty()) {
        messages.push(serde_json::json!({ "role": "assistant", "content": prefill }));
    }
    serde_json::json!({
        "messages": messages,
        "stream": true,
        "temperature": 0.0,
        "repeat_penalty": req.repeat_penalty,
        "max_tokens": req.max_tokens,
        "cache_prompt": true,
    })
}
```

thay

```rust
    pub fn stream(&self, req: &ChatRequest, on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd> {
        let body = serde_json::json!({
            "messages": [{ "role": "user", "content": req.prompt }],
            "stream": true,
            "temperature": 0.0,
            "repeat_penalty": req.repeat_penalty,
            "max_tokens": req.max_tokens,
            "cache_prompt": true,
        });
        let started = Instant::now();
```

bằng

```rust
    pub fn stream(&self, req: &ChatRequest, on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd> {
        let body = chat_body(req);
        let started = Instant::now();
```

thay

```rust
        let req = ChatRequest {
            prompt,
            max_tokens,
            repeat_penalty: 1.05,
        };
        let end = self.stream(&req, &mut |_| ControlFlow::Continue(()))?;
```

bằng

```rust
        let req = ChatRequest {
            prompt,
            max_tokens,
            repeat_penalty: 1.05,
            prefill: None,
        };
        let end = self.stream(&req, &mut |_| ControlFlow::Continue(()))?;
```

`crates/pipeline/src/translate.rs`, trong `translate`: thay

```rust
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
        };
```

bằng

```rust
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
            prefill: None,
        };
```

`crates/pipeline/src/engine.rs`, trong `mt_loop`: thay

```rust
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
    };
```

bằng

```rust
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
        prefill: None,
    };
```

`crates/pipeline/src/bin/fake_llama_server.rs`: thay

```rust
//! - `FAKE_LLAMA_LOG`: file ghi nối tiếp các sự kiện (`start ngl=…`, `chat <n> repeat=<p> max=<m>`). Không ghi API key.
```

bằng

```rust
//! - `FAKE_LLAMA_LOG`: file ghi nối tiếp các sự kiện (`start ngl=…`, `chat <n> repeat=<p> max=<m>`, thêm ` prefill=<số ký
//!   tự>` khi request có prefill). Không ghi API key.
//!
//! Prefill (tin nhắn cuối của `messages` có `role` là `assistant`): như `llama-server` b11146 với `--prefill-assistant` (mặc
//! định bật), server stream lại nguyên phần prefill thành gói đầu, rồi sinh tiếp: bản dịch giả bỏ đi chừng ấy từ đầu (đếm
//! theo khoảng trắng) và gửi phần còn lại, mỗi từ một gói.
```

thay

```rust
            "/v1/chat/completions" => {
                chats += 1;
                log(&format!(
                    "chat {chats} repeat={} max={}",
                    body["repeat_penalty"], body["max_tokens"]
                ));
```

bằng

```rust
            "/v1/chat/completions" => {
                chats += 1;
                let prefill = body["messages"]
                    .as_array()
                    .and_then(|m| m.last())
                    .filter(|m| m["role"] == "assistant")
                    .and_then(|m| m["content"].as_str())
                    .unwrap_or("")
                    .to_string();
                let prefill_note = if prefill.is_empty() {
                    String::new()
                } else {
                    format!(" prefill={}", prefill.chars().count())
                };
                log(&format!(
                    "chat {chats} repeat={} max={}{prefill_note}",
                    body["repeat_penalty"], body["max_tokens"]
                ));
```

và thay

```rust
                words.truncate(max);
                let mut sse = String::new();
                for (i, w) in words.iter().enumerate() {
                    let piece = if i == 0 { w.clone() } else { format!(" {w}") };
                    let chunk = serde_json::json!({ "choices": [{ "index": 0, "delta": { "content": piece } }] });
                    sse.push_str(&format!("data: {chunk}\n\n"));
                }
                let last = serde_json::json!({
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": finish }],
                    "timings": { "predicted_n": words.len() },
                });
```

bằng

```rust
                words.truncate(max);
                let mut pieces: Vec<String> = words
                    .iter()
                    .enumerate()
                    .map(|(i, w)| if i == 0 { w.clone() } else { format!(" {w}") })
                    .collect();
                if !prefill.is_empty() {
                    let skip = prefill.split_whitespace().count().min(pieces.len());
                    pieces.splice(..skip, [prefill.clone()]);
                }
                let mut sse = String::new();
                for piece in &pieces {
                    let chunk = serde_json::json!({ "choices": [{ "index": 0, "delta": { "content": piece } }] });
                    sse.push_str(&format!("data: {chunk}\n\n"));
                }
                let last = serde_json::json!({
                    "choices": [{ "index": 0, "delta": {}, "finish_reason": finish }],
                    "timings": { "predicted_n": pieces.len() },
                });
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib llama
cargo test --locked -p pipeline --test clients
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 2 test mới của `llama::tests` và `llama_server_streams_the_prefill_back_then_continues` đạt; `llama_server_streams_deltas_with_the_key_from_the_environment` vẫn đạt (log `chat 1 repeat=1.05 max=64` không đổi); mọi test của crate đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/llama.rs crates/pipeline/src/translate.rs crates/pipeline/src/engine.rs \
  crates/pipeline/src/bin/fake_llama_server.rs crates/pipeline/tests/clients.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): prefill là tin nhắn assistant cuối của request dịch (spec 2026-10-10 §4.3)

ChatRequest có prefill; chat_body cắt khoảng trắng cuối và bỏ prefill rỗng, thân request không prefill giữ nguyên.
Server giả stream lại phần prefill rồi sinh tiếp như llama-server b11146, và ghi độ dài prefill vào log sự kiện.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng năm file.

---
## Task 9: `translate_live`

Spec §4.3, §7 và H1:
- request như lượt cuối: cùng mẫu prompt (thuật ngữ, ngữ cảnh), `max_tokens` theo §6.5 tính trên chữ nguồn đem dịch, temperature 0, repeat penalty 1,05, stream;
- kèm `prefill`;
- hậu xử lý như lượt cuối; vi phạm (quá tỉ lệ, lời giải thích, rỗng), bị cắt ở `max_tokens` hay request lỗi thì `Outcome::Failed`, **không thử lại**;
- cờ hủy `job.cancel` được kiểm trước `/tokenize`, trước khi stream và ở mọi gói (H1).

Để hai hàm dùng chung đúng một luật, phần dựng prompt, tỉ lệ token và vòng stream có kiểm cờ hủy được tách khỏi `translate` (`prompt_for`, `max_chunks_for`, `stream_once`). Hành vi của `translate` không đổi; mọi test cũ của nó (kể cả ba test H1 của kế hoạch 01) phải đạt nguyên.

**Files:**
- Modify: `crates/pipeline/src/translate.rs` (cả hàm `translate`; test trước `context_uses_the_background_template`)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/translate.rs`: thay

```rust
    #[test]
    fn context_uses_the_background_template() {
```

bằng

```rust
    /// Server giả ghi cả prefill của mỗi request (bản tạm, spec 2026-10-10 §4.3).
    struct Prefilled {
        replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>,
        requests: Vec<(String, u32, f64, Option<String>)>,
    }

    impl Prefilled {
        fn new(replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>) -> Self {
            Self {
                replies,
                requests: Vec::new(),
            }
        }
    }

    impl Mt for Prefilled {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests.push((
                req.prompt.to_string(),
                req.max_tokens,
                req.repeat_penalty,
                req.prefill.map(String::from),
            ));
            let (chunks, finish) = self.replies.remove(0)?;
            let mut end = StreamEnd::default();
            for c in chunks {
                end.chunks += 1;
                end.text.push_str(c);
                if on_delta(c).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some(finish.into());
            Ok(end)
        }
    }

    fn live(mt: &mut Prefilled, job: &Job, prefill: Option<&str>) -> (Vec<String>, Outcome) {
        let mut events = Vec::new();
        let outcome = translate_live(mt, job, prefill, &MtConfig::default(), &mut |e| {
            events.push(match e {
                Event::Delta(d) => d.to_string(),
                Event::Retry => "<retry>".into(),
            });
            ControlFlow::Continue(())
        });
        (events, outcome)
    }

    /// Bản tạm (spec 2026-10-10 §4.3): một lần thử; prefill đi kèm request; tham số sinh như lượt cuối (4 token nguồn →
    /// `max_tokens` 48); chữ stream về (gồm phần prefill được stream lại) là cả bản dịch.
    #[test]
    fn a_live_translation_is_one_attempt_with_the_prefill() {
        let mut mt = Prefilled::new(vec![Ok((vec!["chúng tôi", " đi", " về"], "stop"))]);
        let (events, outcome) = live(&mut mt, &job("so we went home"), Some("chúng tôi"));
        assert_eq!(events, ["chúng tôi", " đi", " về"]);
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts), ("chúng tôi đi về", 1));
        assert_eq!(
            mt.requests,
            [(
                translation_prompt("so we went home", Lang::En, Lang::Vi),
                48,
                1.05,
                Some("chúng tôi".to_string())
            )]
        );
    }

    /// Bản tạm vi phạm luật độ dài, bị cắt ở `max_tokens` hay request lỗi: bỏ, không thử lại (spec §4.3, §7).
    #[test]
    fn a_bad_live_translation_fails_without_a_retry() {
        let long: Vec<&str> = std::iter::repeat_n(" x", 60).collect();
        let mut mt = Prefilled::new(vec![Ok((long, "stop"))]);
        let (events, outcome) = live(&mut mt, &job("one two three four five six seven eight nine ten"), None);
        assert!(
            matches!(&outcome, Outcome::Failed { attempts: 1, reason, .. } if reason == "quá ngưỡng tỉ lệ token"),
            "{outcome:?}"
        );
        assert!(!events.iter().any(|e| e == "<retry>"));
        assert_eq!(mt.requests.len(), 1);
        let mut mt = Prefilled::new(vec![Ok((vec!["Chào", " bạn"], "length"))]);
        let (_, outcome) = live(&mut mt, &job("Hello"), None);
        assert!(
            matches!(&outcome, Outcome::Failed { reason, .. } if reason == "bị cắt ở max_tokens"),
            "{outcome:?}"
        );
        let mut mt = Prefilled::new(vec![Err(MtError::Failed("mất kết nối".into()))]);
        let (_, outcome) = live(&mut mt, &job("Hello"), None);
        assert!(matches!(&outcome, Outcome::Failed { attempts: 1, .. }), "{outcome:?}");
        assert_eq!(mt.requests.len(), 1, "không gửi lại");
        let mut mt = Prefilled::new(vec![Err(MtError::Unavailable("quá 5 lần".into()))]);
        assert_eq!(
            live(&mut mt, &job("Hello"), None).1,
            Outcome::Unavailable("quá 5 lần".into())
        );
    }

    /// Cờ hủy (H1) cũng áp cho bản tạm: hủy trước khi bắt đầu thì không gửi request nào; hủy giữa chừng thì dừng ngay ở gói
    /// đó, kể cả khi hậu xử lý còn giữ chữ.
    #[test]
    fn a_live_translation_honours_the_cancel_flag() {
        let flag = AtomicBool::new(true);
        let mut mt = Cancelling::new(vec!["Chào"], usize::MAX, &flag);
        let cancelled = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let outcome = translate_live(&mut mt, &cancelled, None, &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!((mt.tokenized, mt.streams), (0, 0));
        let flag = AtomicBool::new(false);
        let mut mt = Cancelling::new(vec!["Trans", "lation", ":", " Xin"], 1, &flag);
        let running = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let outcome = translate_live(&mut mt, &running, Some("Xin"), &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.sent, 2);
    }

    /// Bản tạm dùng đúng mẫu prompt của lượt cuối (thuật ngữ có trong câu).
    #[test]
    fn a_live_translation_uses_the_same_templates() {
        let terms = [Term {
            source: "sprint".into(),
            target: "đợt chạy".into(),
        }];
        let mut mt = Prefilled::new(vec![Ok((vec!["Đợt"], "stop"))]);
        live(
            &mut mt,
            &Job {
                terms: &terms,
                ..job("The sprint")
            },
            None,
        );
        assert_eq!(
            mt.requests[0].0,
            terminology_prompt("The sprint", &terms, Lang::En, Lang::Vi)
        );
    }

    #[test]
    fn context_uses_the_background_template() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib translate
```

Expected: lỗi biên dịch `cannot find function translate_live`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/translate.rs`: thay **toàn bộ hàm `translate`** (từ dòng `pub fn translate(` tới dấu `}` đóng hàm, ngay trước `#[cfg(test)]`; đây là bản đã có H1 của kế hoạch 01 và `prefill: None` của Task 8) bằng:

```rust
/// Prompt theo §6.5: có thuật ngữ thì mẫu "terminology" (bỏ ngữ cảnh), có ngữ cảnh thì mẫu nền, còn lại mẫu mặc định.
fn prompt_for(job: &Job) -> String {
    match job.context {
        _ if !job.terms.is_empty() => terminology_prompt(job.text, job.terms, job.src, job.tgt),
        Some(context) => context_prompt(job.text, context, job.src, job.tgt),
        None => translation_prompt(job.text, job.src, job.tgt),
    }
}

/// Số gói tối đa trước khi coi là quá dài (ngưỡng tỉ lệ token của cặp, §6.5). Cách 2 của Q4: chỉ áp tỉ lệ khi câu gốc đủ
/// dài; câu ngắn hơn chỉ chịu hạn mức sinh.
fn max_chunks_for(job: &Job, cfg: &MtConfig, source_tokens: usize) -> Option<usize> {
    cfg.ratio_for(job.src.code(), job.tgt.code())
        .filter(|_| source_tokens >= cfg.ratio_min_source_tokens)
        .map(|ratio| (ratio as f64 * source_tokens as f64).floor() as usize)
}

/// Một lần stream qua hậu xử lý (§6.5). Cờ hủy được kiểm ở mọi gói, cả khi hậu xử lý còn giữ chữ (nhãn chưa rõ, ngoặc
/// mở): không chờ gói được hiện tiếp theo (H1). Trả kết quả của stream, vi phạm (nếu có), và việc đã dừng vì bị hủy.
fn stream_once(
    mt: &mut dyn Mt,
    req: &ChatRequest,
    pp: &mut PostProcessor,
    job: &Job,
    started: Instant,
    first_delta_ms: &mut Option<f32>,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> (Result<StreamEnd, MtError>, Option<Violation>, bool) {
    let (mut violation, mut cancelled) = (None, false);
    let result = mt.stream(req, &mut |chunk| {
        if job.cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
            cancelled = true;
            return ControlFlow::Break(());
        }
        match pp.push(chunk) {
            Step::Emit(delta) => {
                first_delta_ms.get_or_insert_with(|| started.elapsed().as_secs_f32() * 1000.0);
                if on_event(Event::Delta(&delta)).is_break() {
                    cancelled = true;
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            }
            Step::Hold => ControlFlow::Continue(()),
            Step::Stop(v) => {
                violation = Some(v);
                ControlFlow::Break(())
            }
        }
    });
    (result, violation, cancelled)
}

pub fn translate(
    mt: &mut dyn Mt,
    job: &Job,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let is_cancelled = || job.cancel.is_some_and(|c| c.load(Ordering::SeqCst));
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let prompt = prompt_for(job);
    let source_tokens = match mt.count_tokens(job.text) {
        Ok(n) => n,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 0,
                source_tokens: 0,
                completion_tokens: None,
            };
        }
    };
    let max_tokens = cfg.max_tokens_for(source_tokens);
    let max_chunks = max_chunks_for(job, cfg, source_tokens);
    let mut reason = String::new();
    let mut completion_tokens = None;
    let mut first_delta_ms = None;
    for (attempt, repeat_penalty) in [(1u8, cfg.repeat_penalty), (2, cfg.retry_repeat_penalty)] {
        if attempt == 2 {
            if on_event(Event::Retry).is_break() {
                return Outcome::Cancelled;
            }
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        if is_cancelled() {
            return Outcome::Cancelled;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
            prefill: None,
        };
        let (result, violation, cancelled) =
            stream_once(mt, &req, &mut pp, job, started, &mut first_delta_ms, on_event);
        let end = match result {
            Ok(end) => end,
            Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
            Err(MtError::Failed(e)) => {
                reason = e;
                continue;
            }
        };
        if cancelled {
            return Outcome::Cancelled;
        }
        completion_tokens = end.completion_tokens.or(Some(end.chunks));
        let finished = match violation {
            Some(v) => Err(v),
            None => pp.finish(end.finish_reason.as_deref()),
        };
        match finished {
            Ok(text) => {
                return Outcome::Done(Translated {
                    text,
                    attempts: attempt,
                    source_tokens,
                    completion_tokens,
                    first_delta_ms,
                    total_ms: started.elapsed().as_secs_f32() * 1000.0,
                });
            }
            Err(v) => reason = describe(v).to_string(),
        }
    }
    Outcome::Failed {
        reason,
        attempts: 2,
        source_tokens,
        completion_tokens,
    }
}

/// Dịch bản tạm của dòng đang nói (spec 2026-10-10 §4.3): như `translate` (mẫu prompt, thuật ngữ, `max_tokens`, hậu xử
/// lý, cờ hủy H1) nhưng chỉ một lần thử, không thử lại với repeat penalty cao hơn, và có thể kèm `prefill` (phần dịch đã
/// chốt, không có khoảng trắng cuối). `llama-server` b11146 stream lại cả phần prefill, nên chữ stream về là cả bản dịch.
/// Vi phạm luật hậu xử lý, bị cắt ở `max_tokens` hay request lỗi: `Outcome::Failed`; bên gọi giữ chữ đang hiện (§7).
pub fn translate_live(
    mt: &mut dyn Mt,
    job: &Job,
    prefill: Option<&str>,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let is_cancelled = || job.cancel.is_some_and(|c| c.load(Ordering::SeqCst));
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let prompt = prompt_for(job);
    let source_tokens = match mt.count_tokens(job.text) {
        Ok(n) => n,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 0,
                source_tokens: 0,
                completion_tokens: None,
            };
        }
    };
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let mut pp = PostProcessor::new(job.text, max_chunks_for(job, cfg, source_tokens));
    let req = ChatRequest {
        prompt: &prompt,
        max_tokens: cfg.max_tokens_for(source_tokens),
        repeat_penalty: cfg.repeat_penalty,
        prefill,
    };
    let mut first_delta_ms = None;
    let (result, violation, cancelled) = stream_once(mt, &req, &mut pp, job, started, &mut first_delta_ms, on_event);
    let end = match result {
        Ok(end) => end,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 1,
                source_tokens,
                completion_tokens: None,
            };
        }
    };
    if cancelled {
        return Outcome::Cancelled;
    }
    let completion_tokens = end.completion_tokens.or(Some(end.chunks));
    let finished = match violation {
        Some(v) => Err(v),
        None => pp.finish(end.finish_reason.as_deref()),
    };
    match finished {
        Ok(text) => Outcome::Done(Translated {
            text,
            attempts: 1,
            source_tokens,
            completion_tokens,
            first_delta_ms,
            total_ms: started.elapsed().as_secs_f32() * 1000.0,
        }),
        Err(v) => Outcome::Failed {
            reason: describe(v).to_string(),
            attempts: 1,
            source_tokens,
            completion_tokens,
        },
    }
}
```

Sửa doc đầu file cho khớp: thay

```rust
//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này.
```

bằng

```rust
//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này. `translate_live` dịch bản tạm của dòng đang nói (spec 2026-10-10 §4.3) bằng
//! cùng luật, một lần thử, có prefill.
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib translate
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: mọi test `translate::tests::…` đạt (test cũ, ba test H1 của kế hoạch 01 và bốn test mới); mọi test của crate đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/translate.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): translate_live dịch bản tạm một lần thử, kèm prefill (spec 2026-10-10 §4.3)

Cùng mẫu prompt, max_tokens, hậu xử lý và cờ hủy H1 với translate (tách prompt_for, max_chunks_for, stream_once);
vi phạm, bị cắt hay request lỗi thì Failed, không thử lại.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---

## Task 10: Engine: cấu hình, sự kiện, cờ dùng chung, công tắc; app vẫn biên dịch

Đúng H6 và H5:
- `EngineConfig.streaming_supported`, `streaming_enabled`;
- `Indicators.streaming_unavailable` (serde `streamingUnavailable`);
- `EventSink::live`, `live_end`, mặc định bỏ qua, nên `TauriSink` và mọi sink khác vẫn biên dịch;
- `Engine::set_streaming_enabled`.

Cờ dùng chung: struct `Streaming` (máy đủ sức, công tắc, tự tắt) nằm trong `Flags`, dựng bằng `Flags::new(&cfg)`. Task 12 thêm nhịp T vào đây.

`!streaming_supported` thì luồng phụ đề phát `indicators` với `streaming_unavailable = true` ngay đầu phiên (H6). Harness của `engine.rs` dùng `streaming_supported: true, streaming_enabled: false`, nên mọi test cũ thấy đúng hành vi như trước. App: `streaming_supported: false, streaming_enabled: false` cho tới kế hoạch 03; chế độ này không chạy, chỉ thêm một sự kiện chỉ báo đầu phiên mà giao diện chưa đọc.

`SessionMetrics` thêm số đo của chế độ này (`partials`, `partial_asr_ms`, `live_cycle_ms`, `cadence_ms`, `streaming_auto_off`); `summary` chỉ nhắc tới khi có lần chép từng phần, nên dòng log của chế độ thường không đổi.

**Files:**
- Modify: `crates/pipeline/src/engine.rs` (import dòng 41; `EngineConfig` dòng 62–75; `Indicators` dòng 147–157; `EventSink` dòng 183–197; `Flags` dòng 348–357; `Engine::start` dòng 378; sau `exhaust_quota`; `Composer::new`; test: `cfg`, `harness_with`, ba test mới)
- Modify: `crates/pipeline/src/metrics.rs` (struct, `summary`, test)
- Modify: `crates/pipeline/tests/engine.rs` (`config`, dòng 200–207), `crates/pipeline/tests/real_sidecars.rs` (dòng 99–106)
- Modify: `src-tauri/src/session.rs` (`engine_config`, dòng 175–182)
- Modify: `crates/latency-bench/src/session.rs` (`run`: khối `let config = EngineConfig { … }`)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/metrics.rs`: thay

```rust
    #[test]
    fn summary_has_counts_and_stages_but_no_text() {
```

bằng

```rust
    /// Chế độ dịch trong lúc nói (spec 2026-10-10 §5): chỉ ghi khi có lần chép từng phần, và chỉ có số.
    #[test]
    fn the_summary_reports_the_live_mode_only_when_it_ran() {
        let m = SessionMetrics {
            partials: 12,
            partial_asr_ms: vec![200.0, 220.0],
            live_cycle_ms: vec![500.0, 700.0],
            cadence_ms: vec![1_000.0],
            streaming_auto_off: true,
            ..Default::default()
        };
        assert!(
            m.summary().ends_with(
                "; 12 lần chép từng phần; chép từng phần p50 210 ms, p90 218 ms; vòng cập nhật p50 600 ms, p90 680 ms; \
                 nhịp p50 1000 ms, p90 1000 ms; đã tự tắt"
            ),
            "{}",
            m.summary()
        );
        assert!(!SessionMetrics::default().summary().contains("chép từng phần"));
    }

    #[test]
    fn summary_has_counts_and_stages_but_no_text() {
```

`crates/pipeline/src/engine.rs`, trong `mod tests`: thay

```rust
    fn cfg() -> EngineConfig {
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: vec!["en".into(), "vi".into()],
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
            glossary: SharedGlossary::default(),
        }
    }
```

bằng

```rust
    /// Máy đủ sức nhưng công tắc tắt: chế độ dịch trong lúc nói không có hiệu lực, engine chạy như chế độ thường.
    fn cfg() -> EngineConfig {
        EngineConfig {
            pipeline: PipelineConfig::default(),
            languages: vec!["en".into(), "vi".into()],
            target: Lang::Vi,
            translation_context: false,
            id_base: 0,
            glossary: SharedGlossary::default(),
            streaming_supported: true,
            streaming_enabled: false,
        }
    }
```

thay

```rust
    fn harness_with(cfg: EngineConfig, sink: Sink) -> Harness {
        let sink = Arc::new(sink);
        let (jobs_tx, jobs) = mpsc::channel();
        let flags = Flags::default();
```

bằng

```rust
    fn harness_with(cfg: EngineConfig, sink: Sink) -> Harness {
        let sink = Arc::new(sink);
        let (jobs_tx, jobs) = mpsc::channel();
        let flags = Flags::new(&cfg);
```

và thay

```rust
    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
```

bằng

```rust
    /// H6: máy chưa đủ sức thì chỉ báo "dịch sau mỗi câu" bật ngay đầu phiên; máy đủ sức thì không có sự kiện nào.
    #[test]
    fn an_unsupported_machine_reports_streaming_unavailable_at_the_start() {
        let h = harness_with(
            EngineConfig {
                streaming_supported: false,
                ..cfg()
            },
            Sink::default(),
        );
        let indicators = h.sink.indicators.lock().unwrap().clone();
        assert_eq!(
            indicators,
            [Indicators {
                streaming_unavailable: true,
                ..Indicators::default()
            }]
        );
        assert!(!h.flags.streaming.active());
        assert!(harness().sink.indicators.lock().unwrap().is_empty());
    }

    /// Spec 2026-10-10 §6.3: công tắc đổi được giữa phiên; tự tắt thì bật lại cũng không có hiệu lực (§5).
    #[test]
    fn the_streaming_switch_can_change_mid_session() {
        let config = EngineConfig {
            streaming_enabled: true,
            ..cfg()
        };
        let (engine, _sink) = start(live(Vec::new()), energy(), Box::new(ConstAsr("x")), quick_mt(), config);
        assert!(engine.flags.streaming.active());
        engine.set_streaming_enabled(false);
        assert!(!engine.flags.streaming.active());
        engine.set_streaming_enabled(true);
        assert!(engine.flags.streaming.active());
        engine.flags.streaming.auto_off.store(true, Ordering::SeqCst);
        assert!(!engine.flags.streaming.active());
        engine.stop();
    }

    #[test]
    fn indicators_name_streaming_unavailable_in_camel_case() {
        let i = Indicators {
            streaming_unavailable: true,
            ..Indicators::default()
        };
        assert_eq!(
            serde_json::to_value(&i).unwrap(),
            serde_json::json!({
                "lagging": false, "noAudio": false, "translationUnavailable": false, "streamingUnavailable": true
            })
        );
    }

    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib
```

Expected: lỗi biên dịch `struct EngineConfig has no field named streaming_supported`, `no field streaming_unavailable`, `no function or associated item named new found for struct Flags`, `no field partials`…

- [ ] **Step 3: Cài**

`crates/pipeline/src/metrics.rs`: thay

```rust
    /// được dịch lại sau khi ghép hay gộp. Không tính `same_lang`, `failed`, `skipped`, `dropped`, đoạn bị lọc.
    pub translated_speech_ms: u64,
}
```

bằng

```rust
    /// được dịch lại sau khi ghép hay gộp. Không tính `same_lang`, `failed`, `skipped`, `dropped`, đoạn bị lọc.
    pub translated_speech_ms: u64,
    /// Chế độ dịch trong lúc nói (spec 2026-10-10 §4–§5): số lần chép từng phần có kết quả, thời gian mỗi lần (`asr_ms` của
    /// worker), các vòng cập nhật đã xong (từ lúc tạo yêu cầu chép từng phần tới lúc bản dịch tạm xong), nhịp T sau mỗi vòng,
    /// và việc chế độ đã tự tắt. Không có chữ nào.
    pub partials: usize,
    pub partial_asr_ms: Vec<f32>,
    pub live_cycle_ms: Vec<f32>,
    pub cadence_ms: Vec<f32>,
    pub streaming_auto_off: bool,
}
```

và thay

```rust
        format!(
            "{} đoạn (lọc {}, bỏ {}), {} câu dịch, {} lỗi, {} bỏ bước dịch, {} cùng ngôn ngữ, {} lần ghép;{}{}{}{} tiếng nói đã dịch {} ms",
```

bằng

```rust
        let mut out = format!(
            "{} đoạn (lọc {}, bỏ {}), {} câu dịch, {} lỗi, {} bỏ bước dịch, {} cùng ngôn ngữ, {} lần ghép;{}{}{}{} tiếng nói đã dịch {} ms",
```

rồi thay phần cuối của hàm

```rust
            stat("tổng", &self.latency_ms),
            self.translated_speech_ms
        )
    }
}
```

bằng

```rust
            stat("tổng", &self.latency_ms),
            self.translated_speech_ms
        );
        if self.partials > 0 {
            out.push_str(&format!(
                "; {} lần chép từng phần;{}{}{}",
                self.partials,
                stat("chép từng phần", &self.partial_asr_ms),
                stat("vòng cập nhật", &self.live_cycle_ms),
                stat("nhịp", &self.cadence_ms)
            ));
            if self.streaming_auto_off {
                out.push_str(" đã tự tắt");
            }
        }
        out
    }
}
```

`crates/pipeline/src/engine.rs`: thay

```rust
use crate::subtitle::{Delta, Status, Subtitle};
```

bằng

```rust
use crate::subtitle::{Delta, LiveEnd, LiveLine, Status, Subtitle};
```

thay

```rust
    /// Từ điển thuật ngữ (F5, §6.5). Luồng dịch đọc bản mới nhất ở mỗi câu, nên app sửa từ điển giữa phiên thì câu sau
    /// dùng ngay. Gói Free: app đưa từ điển rỗng.
    pub glossary: SharedGlossary,
}
```

bằng

```rust
    /// Từ điển thuật ngữ (F5, §6.5). Luồng dịch đọc bản mới nhất ở mỗi câu, nên app sửa từ điển giữa phiên thì câu sau
    /// dùng ngay. Gói Free: app đưa từ điển rỗng.
    pub glossary: SharedGlossary,
    /// Máy đủ sức cho chế độ dịch trong lúc nói (app quyết lúc bắt đầu phiên, spec 2026-10-10 §5 "Tắt ngay từ đầu phiên").
    pub streaming_supported: bool,
    /// Công tắc của người dùng lúc bắt đầu phiên (`translateWhileSpeaking`); đổi giữa phiên bằng `set_streaming_enabled`.
    pub streaming_enabled: bool,
}
```

thay

```rust
    /// `llama-server` không dùng được: phụ đề chỉ hiện câu gốc.
    pub translation_unavailable: bool,
}
```

bằng

```rust
    /// `llama-server` không dùng được: phụ đề chỉ hiện câu gốc.
    pub translation_unavailable: bool,
    /// Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh (bị tắt từ đầu, hay tự tắt) — spec 2026-10-10 §6.3. Serde:
    /// `streamingUnavailable`.
    pub streaming_unavailable: bool,
}
```

thay

```rust
    fn usage(&self, _usage: &Usage) -> ControlFlow<()> {
        ControlFlow::Continue(())
    }
}
```

bằng

```rust
    fn usage(&self, _usage: &Usage) -> ControlFlow<()> {
        ControlFlow::Continue(())
    }
    /// Dòng đang nói đổi (spec 2026-10-10 §6.2). Mặc định bỏ qua.
    fn live(&self, _line: &LiveLine) {}
    /// Gỡ dòng đang nói (lượt cuối đã chốt, đoạn bị lọc hay bỏ, chế độ tự tắt, dừng phiên). Mặc định bỏ qua.
    fn live_end(&self, _end: &LiveEnd) {}
}
```

thay

```rust
/// Cờ dùng chung giữa `Engine` và các luồng.
#[derive(Clone, Default)]
struct Flags {
    /// Luồng VAD ngừng đọc âm thanh.
    stop: Arc<AtomicBool>,
    /// Đã bấm Dừng: hạn `stop_grace_ms` bắt đầu.
    hurry: Arc<AtomicBool>,
    /// Hết hạn mức.
    quota: Arc<AtomicBool>,
}
```

bằng

```rust
/// Chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §5, §6.3; H6): dùng chung giữa `Engine`, luồng VAD và luồng
/// phụ đề.
#[derive(Debug, Default)]
struct Streaming {
    /// Máy đủ sức (`EngineConfig::streaming_supported`).
    supported: AtomicBool,
    /// Công tắc của người dùng (`EngineConfig::streaming_enabled`, `Engine::set_streaming_enabled`).
    enabled: AtomicBool,
    /// Đã tự tắt vì máy không theo kịp (§5), tới hết phiên.
    auto_off: AtomicBool,
}

impl Streaming {
    /// Chế độ đang có hiệu lực (H6) = máy đủ sức, công tắc bật, chưa tự tắt.
    fn active(&self) -> bool {
        self.supported.load(Ordering::SeqCst)
            && self.enabled.load(Ordering::SeqCst)
            && !self.auto_off.load(Ordering::SeqCst)
    }
}

/// Cờ dùng chung giữa `Engine` và các luồng.
#[derive(Clone, Default)]
struct Flags {
    /// Luồng VAD ngừng đọc âm thanh.
    stop: Arc<AtomicBool>,
    /// Đã bấm Dừng: hạn `stop_grace_ms` bắt đầu.
    hurry: Arc<AtomicBool>,
    /// Hết hạn mức.
    quota: Arc<AtomicBool>,
    /// Chế độ dịch trong lúc nói.
    streaming: Arc<Streaming>,
}

impl Flags {
    fn new(cfg: &EngineConfig) -> Self {
        let flags = Self::default();
        flags
            .streaming
            .supported
            .store(cfg.streaming_supported, Ordering::SeqCst);
        flags.streaming.enabled.store(cfg.streaming_enabled, Ordering::SeqCst);
        flags
    }
}
```

thay

```rust
    ) -> Result<Self> {
        let flags = Flags::default();
```

bằng

```rust
    ) -> Result<Self> {
        let flags = Flags::new(&cfg);
```

thay

```rust
    pub fn exhaust_quota(&self) {
        self.flags.quota.store(true, Ordering::SeqCst);
    }
```

bằng

```rust
    pub fn exhaust_quota(&self) {
        self.flags.quota.store(true, Ordering::SeqCst);
    }

    /// Bật/tắt chế độ dịch trong lúc nói giữa phiên (công tắc `translateWhileSpeaking`, spec 2026-10-10 §6.3): có tác dụng
    /// từ đoạn kế tiếp, vì luồng VAD chỉ đọc cờ này khi chưa có đoạn mở (H6). Đã tự tắt (§5) thì bật lại không có tác dụng.
    pub fn set_streaming_enabled(&self, on: bool) {
        self.flags.streaming.enabled.store(on, Ordering::SeqCst);
    }
```

và trong `Composer::new`, thay

```rust
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        Self {
```

bằng

```rust
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        // Máy chưa đủ sức cho chế độ dịch trong lúc nói: báo ngay đầu phiên (H6; spec 2026-10-10 §5, §6.3).
        let indicators = Indicators {
            streaming_unavailable: !cfg.streaming_supported,
            ..Indicators::default()
        };
        if indicators.streaming_unavailable {
            sink.indicators(&indicators);
        }
        // Chỉ ghi chế độ (không có chữ nào), để log của phiên cho biết số đo thuộc chế độ nào.
        log::info!(
            "dịch trong lúc nói: {} lúc bắt đầu phiên (máy đủ sức: {})",
            if flags.streaming.active() { "bật" } else { "tắt" },
            cfg.streaming_supported
        );
        Self {
```

rồi thay

```rust
            mt_unavailable: false,
            indicators: Indicators::default(),
```

bằng

```rust
            mt_unavailable: false,
            indicators,
```

`crates/pipeline/tests/engine.rs`: thay

```rust
        translation_context: false,
        id_base: 1_000,
        glossary: Default::default(),
    }
}
```

bằng

```rust
        translation_context: false,
        id_base: 1_000,
        glossary: Default::default(),
        streaming_supported: false,
        streaming_enabled: false,
    }
}
```

`crates/pipeline/tests/real_sidecars.rs`: thay

```rust
            translation_context: false,
            id_base: 0,
            glossary: Default::default(),
        },
```

bằng

```rust
            translation_context: false,
            id_base: 0,
            glossary: Default::default(),
            streaming_supported: false,
            streaming_enabled: false,
        },
```

`src-tauri/src/session.rs`, trong `engine_config`: thay

```rust
        translation_context: settings.experimental.translation_context,
        id_base,
        glossary,
    }
}
```

bằng

```rust
        translation_context: settings.experimental.translation_context,
        id_base,
        glossary,
        // Dịch trong lúc người nói chưa dừng (spec 2026-10-10): kế hoạch 03 nối cài đặt `translateWhileSpeaking` và việc
        // quyết máy đủ sức. Tới đó chế độ này không chạy trong app.
        streaming_supported: false,
        streaming_enabled: false,
    }
}
```

`crates/latency-bench/src/session.rs`, trong `run`: thay

```rust
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
    };
```

bằng

```rust
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
        // Cờ `--streaming` (Task 16 của kế hoạch 02) nối hai trường này.
        streaming_supported: false,
        streaming_enabled: false,
    };
```

- [ ] **Step 4: Chạy, thấy xanh, kể cả app và Windows**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo test --locked -p latency-bench
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
./scripts/check-windows.sh --locked
```

Expected:
- mọi test của `pipeline` đạt, gồm `an_unsupported_machine_reports_streaming_unavailable_at_the_start`, `the_streaming_switch_can_change_mid_session`, `indicators_name_streaming_unavailable_in_camel_case` và `metrics::tests::the_summary_reports_the_live_mode_only_when_it_ran`;
- `latency-bench` đạt;
- clippy cả workspace (gồm `src-tauri`) sạch; fmt sạch;
- `check-windows.sh` kết thúc không lỗi.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs crates/pipeline/src/metrics.rs crates/pipeline/tests/engine.rs \
  crates/pipeline/tests/real_sidecars.rs src-tauri/src/session.rs crates/latency-bench/src/session.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): cấu hình, sự kiện và công tắc của chế độ dịch trong lúc nói (H5, H6)

EngineConfig có streaming_supported và streaming_enabled; Indicators có streamingUnavailable, bật ngay đầu phiên khi máy
chưa đủ sức; EventSink có live và live_end mặc định bỏ qua; Engine::set_streaming_enabled đổi công tắc giữa phiên.
SessionMetrics có số đo của chế độ này. App và latency-bench tạm để chế độ này tắt.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng sáu file.

---
## Task 11: Engine: luồng nhận dạng chép từng phần; dòng đang nói phía chữ nguồn, đóng băng, `live_end`

**Luồng nhận dạng** (spec §4.1; QĐ8, QĐ9):
- `Popped::Partial` được chép bằng đúng `TranscribeRequest` của lượt cuối: `audio_ctx_for_samples`, `prompt_for(prev_lang, …)`, `prev_lang` như lượt cuối;
- `languages`: lần đầu của đoạn là tập cho phép; từ lần được giữ (qua bộ lọc) đầu tiên thì chỉ ngôn ngữ của lần đó, tới hết đoạn;
- kết quả qua `display_text` và đúng `verdict` của lượt cuối; bị lọc thì gửi `AsrOutcome::Partial` với `text: None`;
- không đổi lịch sử prompt hay `prev_lang`;
- `AsrFailure::Dropped` thì bỏ (chỉ ghi log id), không gửi lại; `Unavailable` như lượt cuối.

**Luồng phụ đề** (spec §4.2, §4.5; QĐ5, QĐ6):
- `on_partial`: chốt chữ nguồn bằng `Stabilizer` (LocalAgreement-2, giữ lại `src_holdback_words` hay `src_holdback_chars`), xét `extends` bằng `OpenSentence::accepts` với ngôn ngữ của lần chép, phát `live` nếu có đổi;
- bỏ bản chép khi bị lọc, khi lượt cuối của đoạn đã có (`last_final_seg`), khi đã tự tắt, đang dừng, hết hạn mức hay hết hạn dừng;
- lượt cuối thành phụ đề: `freeze_lives` ngay sau upsert tạo phần chữ (phụ đề mới hay câu được ghép), phát lại dòng với `extends` mới, đăng ký chờ phụ đề đó;
- `live_end`: khi phụ đề đó chốt (`settle`), ngay với `same_lang`, bị lọc, bị bỏ; câu bị gộp ở hàng đợi dịch chuyển các dòng đang chờ sang câu gộp; luồng phụ đề kết thúc thì gỡ hết.

Chưa có bản dịch tạm (Task 13); luồng VAD chưa tạo yêu cầu chép từng phần (Task 12), nên test nạp thẳng tin nhắn. Thứ tự sự kiện được test bằng một "vết" (`trail`) chung của `Sink`.

Các hàm `on_asr`, `grow`, `settle` được ghi nguyên bản mới; `grow` và `settle` đã gồm phần H2 của kế hoạch 01 (đối chiếu trước khi thay).

**Files:**
- Modify: `crates/pipeline/src/engine.rs`: import; `AsrOutcome`; `asr_loop`; hàm mới `to_pcm`, `transcribe_partial` (trước `mt_loop`); struct mới `Live`; `Composer` (trường, `new`, `finish`, `on_asr`, `grow`, `enqueue`, `settle`, hàm mới); test (`Sink`, `Harness`, `live_harness`, test mới)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/engine.rs`, trong `mod tests`: thay

```rust
    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        deltas: Mutex<Vec<Delta>>,
        indicators: Mutex<Vec<Indicators>>,
```

bằng

```rust
    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        lives: Mutex<Vec<LiveLine>>,
        live_ends: Mutex<Vec<u64>>,
        /// Thứ tự chung của upsert, `live` và `live_end` (`"upsert 1"`, `"live 1"`, `"end 1"`).
        trail: Mutex<Vec<String>>,
        deltas: Mutex<Vec<Delta>>,
        indicators: Mutex<Vec<Indicators>>,
```

thay

```rust
        fn subtitle(&self, s: &Subtitle) {
            self.subs.lock().unwrap().push(s.clone());
        }
```

bằng

```rust
        fn subtitle(&self, s: &Subtitle) {
            self.trail.lock().unwrap().push(format!("upsert {}", s.id));
            self.subs.lock().unwrap().push(s.clone());
        }
```

thay

```rust
        fn fatal(&self, kind: Fatal, reason: &str) {
            self.fatal.lock().unwrap().push((kind, reason.to_string()));
        }
```

bằng

```rust
        fn fatal(&self, kind: Fatal, reason: &str) {
            self.fatal.lock().unwrap().push((kind, reason.to_string()));
        }
        fn live(&self, l: &LiveLine) {
            self.trail.lock().unwrap().push(format!("live {}", l.id));
            self.lives.lock().unwrap().push(l.clone());
        }
        fn live_end(&self, e: &LiveEnd) {
            self.trail.lock().unwrap().push(format!("end {}", e.id));
            self.live_ends.lock().unwrap().push(e.id);
        }
```

thay

```rust
    fn harness() -> Harness {
        harness_with(cfg(), Sink::default())
    }
```

bằng

```rust
    fn harness() -> Harness {
        harness_with(cfg(), Sink::default())
    }

    /// Chế độ dịch trong lúc nói có hiệu lực (máy đủ sức, công tắc bật).
    fn live_harness() -> Harness {
        harness_with(
            EngineConfig {
                streaming_enabled: true,
                ..cfg()
            },
            Sink::default(),
        )
    }
```

thay

```rust
        fn job(&self) -> MtJob {
```

bằng

```rust
        /// Một lần chép từng phần của đoạn `seg` có kết quả (`None`: bị bộ lọc ảo giác loại).
        fn partial(&mut self, seg: u64, start_ms: u64, upto_ms: u64, lang: &str, text: Option<&str>) -> bool {
            self.feed(Msg::Asr(AsrOutcome::Partial(PartialText {
                seg,
                start_ms,
                upto_ms,
                lang: lang.into(),
                text: text.map(String::from),
                asr_ms: 200.0,
            })))
        }

        fn last_live(&self, id: u64) -> LiveLine {
            self.sink
                .lives
                .lock()
                .unwrap()
                .iter()
                .rev()
                .find(|l| l.id == id)
                .cloned()
                .expect("dòng đang nói phải có")
        }

        fn live_count(&self) -> usize {
            self.sink.lives.lock().unwrap().len()
        }

        fn live_ends(&self) -> Vec<u64> {
            self.sink.live_ends.lock().unwrap().clone()
        }

        fn trail(&self) -> Vec<String> {
            self.sink.trail.lock().unwrap().clone()
        }

        fn job(&self) -> MtJob {
```

và thay

```rust
    // ---- Engine đầy đủ với nhận dạng và dịch giả trong tiến trình (không cần tiến trình phụ). ----
```

bằng

```rust
    // ---- Dịch trong lúc người nói chưa dừng (spec 2026-10-10), phía chữ nguồn. ----

    /// Bản chép từng phần thành dòng đang nói (spec 2026-10-10 §4.2): phần ổn định là phần chung của hai lần liền nhau trừ
    /// từ cuối, không rút lại; bị lọc thì không cập nhật; id là id mà đoạn nhận khi đóng.
    #[test]
    fn partials_become_a_live_line_with_a_stable_prefix() {
        let mut h = live_harness();
        h.partial(4, 1_000, 2_000, "en", Some("so we"));
        let l = h.last_live(4);
        assert_eq!(
            (l.id, l.extends, l.src_lang.as_str(), l.src_stable.as_str(), l.src_tail.as_str()),
            (4, None, "en", "", "so we")
        );
        h.partial(4, 1_000, 3_000, "en", Some("so we went"));
        let l = h.last_live(4);
        assert_eq!((l.src_stable.as_str(), l.src_tail.as_str()), ("so", " we went"));
        h.partial(4, 1_000, 4_000, "en", Some("so they went home"));
        let l = h.last_live(4);
        assert_eq!(
            (l.src_stable.as_str(), l.src_tail.as_str()),
            ("so", " they went home"),
            "phần ổn định không rút lại"
        );
        assert_eq!((l.tgt_stable.as_str(), l.tgt_tail.as_str()), ("", ""), "chưa có phần dịch");
        let before = h.live_count();
        h.partial(4, 1_000, 4_500, "en", None);
        assert_eq!(h.live_count(), before, "bị lọc: không cập nhật");
        assert_eq!((h.c.metrics.partials, h.c.metrics.partial_asr_ms.len()), (4, 4));
        h.no_job();
    }

    /// Đoạn mở nối tiếp câu đang mở (cùng tiếng, chưa chốt, trong cửa sổ ghép; §4.3): `extends` là phụ đề đó, và phần nguồn
    /// gồm chữ của câu đó, nối như khi ghép (QĐ6).
    #[test]
    fn a_live_line_extends_the_open_sentence() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let _j1 = h.job();
        h.partial(2, 1_300, 2_300, "en", Some("home and"));
        let l = h.last_live(2);
        assert_eq!(
            (l.extends, l.src_stable.as_str(), l.src_tail.as_str()),
            (Some(1), "so we went", " home and")
        );
        h.partial(2, 1_300, 2_800, "en", Some("home and then"));
        let l = h.last_live(2);
        assert_eq!(
            (l.src_stable.as_str(), l.src_tail.as_str()),
            ("so we went home", " and then")
        );
        h.partial(3, 9_000, 10_000, "en", Some("later"));
        assert_eq!(h.last_live(3).extends, None, "ngoài cửa sổ ghép");
    }

    /// Lượt cuối (§4.5, QĐ5): khi kết quả nhận dạng lượt cuối tới, dòng được phát lại một lần ngay sau upsert tạo phụ đề và
    /// đóng băng (bản chép tới muộn bị bỏ); dòng được gỡ khi phụ đề đó chốt.
    #[test]
    fn the_final_subtitle_replaces_the_live_line_when_it_settles() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let count = h.live_count();
        h.said(1, 0, 1_500, "en", "So we went.");
        let trail = h.trail();
        assert_eq!(
            trail[trail.len() - 3..],
            ["upsert 1", "live 1", "upsert 1"],
            "phát lại ngay sau upsert tạo phụ đề, trước khi gửi đi dịch"
        );
        assert_eq!(h.live_count(), count + 1);
        assert_eq!(h.last_live(1).extends, None, "phụ đề mới có chính id của dòng");
        h.partial(1, 0, 1_400, "en", Some("so we went"));
        assert_eq!(h.live_count(), count + 1, "đóng băng: bỏ bản chép tới muộn");
        assert!(h.live_ends().is_empty(), "lượt cuối chưa dịch xong: dòng vẫn hiện");
        let j1 = h.job();
        h.finish(&j1, done("Chúng tôi đã đi."));
        assert_eq!(h.live_ends(), [1]);
        let trail = h.trail();
        assert_eq!(trail[trail.len() - 2..], ["upsert 1", "end 1"], "gỡ sau upsert chốt phụ đề");
    }

    /// Đoạn được ghép vào câu đang mở: dòng phát lại với `extends` là câu đó ngay sau upsert của câu, và được gỡ khi câu (đã
    /// ghép) chốt, không phải khi bản dịch cũ (bị hủy) báo xong.
    #[test]
    fn a_merged_final_ends_the_live_line_when_the_grown_sentence_settles() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.partial(2, 1_300, 2_000, "en", Some("home"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let trail = h.trail();
        assert_eq!(trail[trail.len() - 2..], ["upsert 1", "live 2"]);
        assert_eq!(h.last_live(2).extends, Some(1));
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert!(h.live_ends().is_empty());
        h.finish(&j2, done("chúng tôi về nhà."));
        assert_eq!(h.live_ends(), [2]);
    }

    /// Câu bị gộp ở hàng đợi dịch (§7 spec chính): dòng đang chờ câu đó chuyển sang câu gộp.
    #[test]
    fn a_sentence_merged_in_the_translation_queue_hands_its_live_lines_over() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "One.");
        let j1 = h.job();
        h.said(2, 2_000, 3_000, "en", "Two.");
        h.partial(3, 4_000, 4_500, "en", Some("Three"));
        h.said(3, 4_000, 5_000, "en", "Three.");
        h.said(4, 6_000, 7_000, "en", "Four.");
        h.said(5, 8_000, 9_000, "en", "Five.");
        assert_eq!(h.last(2).replaces, vec![3, 4], "hàng đầy: 2, 3, 4 gộp thành 2");
        h.finish(&j1, done("Một."));
        let j2 = h.job();
        assert_eq!(j2.sub_id, 2);
        assert!(h.live_ends().is_empty());
        h.finish(&j2, done("Hai. Ba. Bốn."));
        assert_eq!(h.live_ends(), [3]);
    }

    /// Đoạn bị lọc hay bị bỏ ở lượt cuối: gỡ dòng ngay (§4.5, §7). Câu đã là ngôn ngữ đích: dòng chỉ hiện câu gốc, và được
    /// gỡ ngay khi có phụ đề `same_lang`.
    #[test]
    fn filtered_dropped_and_same_language_segments_end_their_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("thank you"));
        h.feed(Msg::Asr(AsrOutcome::Filtered { ids: vec![1] }));
        assert_eq!(h.live_ends(), [1]);
        h.partial(2, 2_000, 3_000, "en", Some("so we"));
        h.feed(Msg::Asr(AsrOutcome::Dropped {
            ids: vec![2],
            start_ms: 2_000,
            end_ms: 3_500,
        }));
        assert_eq!(h.live_ends(), [1, 2]);
        assert_eq!(h.last(2).status, Status::Dropped);
        h.partial(3, 4_000, 5_000, "vi", Some("xin chào"));
        let l = h.last_live(3);
        assert_eq!((l.extends, l.src_tail.as_str(), l.tgt_tail.as_str()), (None, "xin chào", ""));
        h.said(3, 4_000, 5_000, "vi", "Xin chào.");
        assert_eq!(h.live_ends(), [1, 2, 3]);
        h.no_job();
    }

    /// Luồng phụ đề kết thúc (dừng phiên): gỡ mọi dòng còn lại (§6.2).
    #[test]
    fn the_end_of_the_session_ends_every_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        h.partial(2, 2_000, 3_000, "en", Some("and"));
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.live_ends.lock().unwrap().clone(), [1, 2]);
    }

    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----

    /// Mọi yêu cầu đã gửi: (id, số mẫu, ngôn ngữ cho phép, ngôn ngữ đoạn trước, số token prompt).
    type Seen = Arc<Mutex<Vec<(u64, usize, Vec<String>, Option<String>, usize)>>>;

    /// Nhận dạng giả theo kịch bản; ghi mọi yêu cầu vào `seen`.
    struct ScriptedAsr {
        replies: Vec<Result<(&'static str, &'static str), AsrFailure>>,
        seen: Seen,
    }

    impl Asr for ScriptedAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            self.seen.lock().unwrap().push((
                req.segment_id,
                req.pcm.len(),
                req.languages.clone(),
                req.prev_lang.clone(),
                req.prompt_tokens.len(),
            ));
            let (lang, text) = self.replies.remove(0)?;
            Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: lang.into(),
                lang_prob: 1.0,
                text: text.into(),
                tokens: vec![1, 2, 3],
                no_speech_prob: 0.0,
                lid_ms: 1.0,
                asr_ms: 2.0,
                avg_logprob: -0.2,
            })
        }
    }

    /// Yêu cầu chép từng phần của đoạn `id`, `ms` mili giây âm thanh từ mốc 1 000 ms.
    fn partial_request(id: u64, ms: u64) -> PartialRequest {
        PartialRequest {
            id,
            start_ms: 1_000,
            upto_ms: 1_000 + ms,
            speech_ms: ms,
            mean_prob: 0.9,
            samples: vec![0.1; ms as usize * 16],
            requested: Instant::now(),
        }
    }

    fn put_partial(queue: &SharedQueue, p: PartialRequest) {
        queue.lock().0.set_partial(p);
        queue.ready.notify_one();
    }

    /// `asr_loop` trên luồng riêng, ngôn ngữ cho phép en và vi.
    fn asr_thread(asr: ScriptedAsr) -> (Arc<SharedQueue>, Receiver<Msg>, JoinHandle<()>) {
        let queue = Arc::new(SharedQueue::new(AsrQueue::new(
            crate::config::QueueConfig::default(),
        )));
        let (tx, rx) = mpsc::channel::<Msg>();
        let thread = {
            let queue = queue.clone();
            std::thread::spawn(move || {
                asr_loop(
                    Box::new(asr),
                    &queue,
                    &tx,
                    &AtomicU64::new(0),
                    &FilterConfig::default(),
                    vec!["en".into(), "vi".into()],
                    100,
                )
            })
        };
        (queue, rx, thread)
    }

    fn next_asr(rx: &Receiver<Msg>) -> AsrOutcome {
        match rx.recv_timeout(Duration::from_secs(5)).expect("phải có kết quả nhận dạng") {
            Msg::Asr(outcome) => outcome,
            _ => panic!("chỉ có kết quả nhận dạng"),
        }
    }

    /// Chép từng phần (QĐ8 của kế hoạch 02): cùng yêu cầu như lượt cuối; lần đầu của đoạn dùng mọi ngôn ngữ cho phép, từ lần
    /// được giữ đầu tiên thì khóa ngôn ngữ đó; không đổi prompt hay ngôn ngữ của đoạn trước; bị lọc thì không có chữ.
    #[test]
    fn partials_use_the_final_request_and_lock_the_language_per_segment() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (queue, rx, thread) = asr_thread(ScriptedAsr {
            replies: vec![
                Ok(("en", "Thank you for watching")),
                Ok(("en", "so we went")),
                Ok(("en", "so we went home")),
                Ok(("en", "So we went home.")),
                Ok(("en", "and then")),
            ],
            seen: seen.clone(),
        });
        put_partial(&queue, partial_request(7, 1_000));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!((p.seg, p.text), (7, None), "câu ảo giác bị lọc");
        put_partial(&queue, partial_request(7, 1_500));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!(
            (p.seg, p.start_ms, p.upto_ms, p.lang.as_str(), p.text.as_deref(), p.asr_ms),
            (7, 1_000, 2_500, "en", Some("so we went"), 3.0)
        );
        put_partial(&queue, partial_request(7, 2_000));
        let AsrOutcome::Partial(p) = next_asr(&rx) else {
            panic!("phải là chép từng phần")
        };
        assert_eq!(p.text.as_deref(), Some("so we went home"));
        queue.push(PendingSegment {
            ids: vec![7],
            start_ms: 1_000,
            end_ms: 3_200,
            speech_ms: 2_200,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.1; 40_000],
        });
        assert!(matches!(next_asr(&rx), AsrOutcome::Transcribed { ids, .. } if ids == [7]));
        put_partial(&queue, partial_request(8, 1_000));
        assert!(matches!(next_asr(&rx), AsrOutcome::Partial(p) if p.seg == 8));
        queue.close();
        thread.join().unwrap();
        let seen = seen.lock().unwrap();
        assert_eq!((seen[0].0, seen[0].1), (7, 16_000), "id của đoạn mở, âm thanh của ảnh chụp");
        let langs: Vec<Vec<String>> = seen.iter().map(|s| s.2.clone()).collect();
        assert_eq!(
            langs,
            [vec!["en", "vi"], vec!["en", "vi"], vec!["en"], vec!["en", "vi"], vec!["en", "vi"]]
        );
        let prev: Vec<Option<&str>> = seen.iter().map(|s| s.3.as_deref()).collect();
        assert_eq!(prev, [None, None, None, None, Some("en")], "chỉ lượt cuối đổi ngôn ngữ đoạn trước");
        let prompts: Vec<usize> = seen.iter().map(|s| s.4).collect();
        assert_eq!(prompts, [0, 0, 0, 0, 3], "chỉ lượt cuối vào lịch sử prompt");
    }

    /// Lần chép từng phần lỗi thì bỏ, không gửi lại (spec §4.1, §7; QĐ9); lần sau vẫn chép.
    #[test]
    fn a_failed_partial_is_dropped_without_a_resend() {
        let seen = Arc::new(Mutex::new(Vec::new()));
        let (queue, rx, thread) = asr_thread(ScriptedAsr {
            replies: vec![Err(AsrFailure::Dropped("lỗi giả".into())), Ok(("en", "so we went"))],
            seen: seen.clone(),
        });
        put_partial(&queue, partial_request(3, 1_000));
        let deadline = Instant::now() + Duration::from_secs(5);
        while seen.lock().unwrap().is_empty() {
            assert!(Instant::now() < deadline, "lần đầu phải được gửi");
            std::thread::sleep(Duration::from_millis(1));
        }
        put_partial(&queue, partial_request(3, 1_500));
        assert!(
            matches!(next_asr(&rx), AsrOutcome::Partial(p) if p.upto_ms == 2_500),
            "lần lỗi không có kết quả"
        );
        queue.close();
        thread.join().unwrap();
        assert_eq!(seen.lock().unwrap().len(), 2, "không gửi lại");
    }

    // ---- Engine đầy đủ với nhận dạng và dịch giả trong tiến trình (không cần tiến trình phụ). ----
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib engine
```

Expected: lỗi biên dịch `no variant named Partial`, `cannot find struct PartialText`…

- [ ] **Step 3: Cài**

`crates/pipeline/src/engine.rs`: thay

```rust
use crate::queue::{AsrQueue, MtItem, MtQueue, PendingSegment, Popped, Ready};
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter};
use crate::sentence::{OpenSentence, Piece, merge_window_ms};
```

bằng

```rust
use crate::queue::{AsrQueue, MtItem, MtQueue, PartialRequest, PendingSegment, Popped, Ready};
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter};
use crate::sentence::{OpenSentence, Piece, joiner, merge_window_ms};
use crate::streaming::{Split, Stabilizer, uses_char_units};
```

thay

```rust
    Dropped {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
    },
    Unavailable(String),
}
```

bằng

```rust
    Dropped {
        ids: Vec<u64>,
        start_ms: u64,
        end_ms: u64,
    },
    /// Một lần chép từng phần của đoạn đang mở (spec 2026-10-10 §4.1).
    Partial(PartialText),
    Unavailable(String),
}

/// Kết quả một lần chép từng phần (spec 2026-10-10 §4.1).
struct PartialText {
    /// Id đoạn (chưa cộng `id_base`): id mà đoạn nhận khi đóng.
    seg: u64,
    start_ms: u64,
    /// Giờ âm thanh lúc chụp (cuối phần âm thanh đã chép).
    upto_ms: u64,
    lang: String,
    /// `None`: bị bộ lọc ảo giác loại (§4.1), không cập nhật dòng đang nói.
    text: Option<String>,
    /// `asr_ms` + `lid_ms` của worker.
    asr_ms: f32,
}
```

Trong `asr_loop`: thay

```rust
    let mut prev_lang = (languages.len() == 1).then(|| languages[0].clone());
    while let Some(popped) = queue.pop(now_ms) {
```

bằng

```rust
    let mut prev_lang = (languages.len() == 1).then(|| languages[0].clone());
    // Ngôn ngữ của đoạn đang mở, từ lần chép từng phần được giữ đầu tiên (QĐ8 của kế hoạch 02): (id đoạn, ngôn ngữ).
    let mut partial_lang: Option<(u64, String)> = None;
    while let Some(popped) = queue.pop(now_ms) {
```

thay

```rust
            // Chép từng phần: Task 11 của kế hoạch 02 thêm đường đi; tới đó luồng VAD chưa tạo yêu cầu này.
            Popped::Partial(_) => continue,
```

bằng

```rust
            Popped::Partial(p) => {
                let next = transcribe_partial(
                    &mut *asr,
                    p,
                    tx,
                    filter,
                    &languages,
                    &history,
                    prev_lang.as_deref(),
                    &mut partial_lang,
                );
                if next.is_break() {
                    break;
                }
                continue;
            }
```

thay

```rust
        let pcm: Vec<i16> = segment
            .samples
            .iter()
            .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
            .collect();
```

bằng

```rust
        let pcm = to_pcm(&segment.samples);
```

thay

```rust
fn mt_loop(
```

bằng

```rust
/// Âm thanh 16 kHz mono sang PCM 16 bit cho `asr-worker`.
fn to_pcm(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Một lần chép từng phần (spec 2026-10-10 §4.1): đúng `TranscribeRequest` của lượt cuối (`audio_ctx`, `prompt_tokens`,
/// `prev_lang` tính như lượt cuối); ngôn ngữ cho phép ở lần đầu của đoạn, rồi khóa vào ngôn ngữ của lần được giữ đầu tiên
/// (QĐ8 của kế hoạch 02); kết quả qua đúng bộ lọc ảo giác. Không đổi lịch sử prompt hay ngôn ngữ của đoạn trước (chỉ lượt
/// cuối đổi). Lỗi thì bỏ, không gửi lại (QĐ9). `Break` khi `asr-worker` không dùng được nữa. Log chỉ có id.
#[allow(clippy::too_many_arguments)]
fn transcribe_partial(
    asr: &mut dyn Asr,
    p: PartialRequest,
    tx: &Sender<Msg>,
    filter: &FilterConfig,
    languages: &[String],
    history: &PromptHistory,
    prev_lang: Option<&str>,
    partial_lang: &mut Option<(u64, String)>,
) -> ControlFlow<()> {
    if pcm_skip(p.samples.len()).is_some() {
        return ControlFlow::Continue(());
    }
    let pcm = to_pcm(&p.samples);
    let locked = partial_lang
        .as_ref()
        .filter(|(id, _)| *id == p.id)
        .map(|(_, lang)| vec![lang.clone()]);
    let req = TranscribeRequest {
        segment_id: p.id,
        audio_ctx: audio_ctx_for_samples(pcm.len()),
        prompt_tokens: history.prompt_for(prev_lang, pcm.len()),
        pcm,
        languages: locked.unwrap_or_else(|| languages.to_vec()),
        prev_lang: prev_lang.map(str::to_string),
    };
    match asr.transcribe(req) {
        Ok(r) => {
            let text = display_text(&r.lang, &r.text, filter);
            let evidence = Evidence {
                no_speech_prob: r.no_speech_prob,
                avg_logprob: r.avg_logprob,
                vad_mean_prob: p.mean_prob,
                speech_ms: p.speech_ms,
            };
            let kept = verdict(&evidence, &text, filter) == Verdict::Speech;
            if kept && partial_lang.as_ref().is_none_or(|(id, _)| *id != p.id) {
                *partial_lang = Some((p.id, r.lang.clone()));
            }
            let _ = tx.send(Msg::Asr(AsrOutcome::Partial(PartialText {
                seg: p.id,
                start_ms: p.start_ms,
                upto_ms: p.upto_ms,
                lang: r.lang,
                text: kept.then_some(text),
                asr_ms: r.asr_ms + r.lid_ms,
            })));
            ControlFlow::Continue(())
        }
        Err(AsrFailure::Dropped(reason)) => {
            log::warn!("bỏ lần chép từng phần của đoạn {}: {reason}", p.id);
            ControlFlow::Continue(())
        }
        Err(AsrFailure::Unavailable(reason)) => {
            let _ = tx.send(Msg::Asr(AsrOutcome::Unavailable(reason)));
            ControlFlow::Break(())
        }
    }
}

fn mt_loop(
```

thay

```rust
struct Composer {
    cfg: EngineConfig,
```

bằng

```rust
/// Dòng đang nói của một đoạn VAD đang mở (spec 2026-10-10 §4.2–§4.5).
struct Live {
    /// Trạng thái của dòng (id đã cộng `id_base`, `extends`, ngôn ngữ, chữ dịch). Phần nguồn được dựng lúc phát (QĐ6).
    line: LiveLine,
    /// Bản đã phát gần nhất.
    emitted: Option<LiveLine>,
    /// Chốt chữ nguồn của riêng đoạn: LocalAgreement-2, giữ lại `src_holdback_*` đơn vị cuối (§4.2).
    src: Stabilizer,
    src_split: Split,
    /// Chữ của lần chép từng phần mới nhất, và mốc của nó.
    text: String,
    start_ms: u64,
    upto_ms: u64,
    /// Kết quả nhận dạng lượt cuối của đoạn đã tới: không nhận gì thêm, chờ phụ đề chốt (QĐ5).
    frozen: bool,
}

impl Live {
    fn new(id: u64, lang: &str, holdback: usize) -> Self {
        Self {
            line: LiveLine {
                id,
                src_lang: lang.to_string(),
                ..LiveLine::default()
            },
            emitted: None,
            src: Stabilizer::new(lang, 2, holdback),
            src_split: Split::default(),
            text: String::new(),
            start_ms: 0,
            upto_ms: 0,
            frozen: false,
        }
    }
}

struct Composer {
    cfg: EngineConfig,
```

thay

```rust
    /// Hết hạn dừng: luồng phụ đề thoát ngay, không chờ luồng nhận dạng hay luồng dịch.
    abandoned: bool,
}
```

bằng

```rust
    /// Hết hạn dừng: luồng phụ đề thoát ngay, không chờ luồng nhận dạng hay luồng dịch.
    abandoned: bool,
    /// Dòng đang nói theo id đoạn (chưa cộng `id_base`).
    lives: BTreeMap<u64, Live>,
    /// Phụ đề → các đoạn có dòng đang nói chờ phụ đề đó chốt để gỡ (QĐ5 của kế hoạch 02).
    live_waiting: HashMap<u64, Vec<u64>>,
    /// Đoạn lớn nhất đã có kết quả nhận dạng lượt cuối: bản chép từng phần của đoạn không lớn hơn số này tới muộn, bỏ.
    last_final_seg: Option<u64>,
}
```

thay

```rust
            quota_hit: false,
            abandoned: false,
        }
    }
```

bằng

```rust
            quota_hit: false,
            abandoned: false,
            lives: BTreeMap::new(),
            live_waiting: HashMap::new(),
            last_final_seg: None,
        }
    }
```

thay

```rust
    fn finish(mut self) -> SessionMetrics {
        self.finish_open();
```

bằng

```rust
    fn finish(mut self) -> SessionMetrics {
        self.finish_open();
        // Dừng phiên: gỡ mọi dòng đang nói còn lại (spec 2026-10-10 §6.2).
        self.end_all_lives();
```

Thay **toàn bộ hàm `on_asr`** (từ `fn on_asr(&mut self, outcome: AsrOutcome) {` tới dấu `}` đóng hàm, ngay trước doc comment của `grow`) bằng:

```rust
    fn on_asr(&mut self, outcome: AsrOutcome) {
        if self.quota_hit {
            // Hết hạn mức: đoạn chép lời xong muộn không còn được hiện hay dịch.
            if let AsrOutcome::Transcribed { ids, .. }
            | AsrOutcome::Filtered { ids }
            | AsrOutcome::Dropped { ids, .. } = &outcome
            {
                for id in ids {
                    self.pending.remove(id);
                }
            }
            return;
        }
        match outcome {
            AsrOutcome::Transcribed {
                ids,
                start_ms,
                end_ms,
                speech_ms,
                lang,
                text,
                asr_ms,
            } => {
                for id in &ids {
                    self.pending.remove(id);
                }
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
                self.metrics.asr_ms.push(asr_ms);
                let piece = Piece {
                    start_ms,
                    end_ms,
                    lang: &lang,
                    text: &text,
                };
                if lang == self.cfg.target.code() {
                    self.finish_open();
                    self.metrics.same_lang += 1;
                    let sub = Subtitle {
                        id: self.cfg.id_base + ids[0],
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::SameLang,
                        provisional: false,
                        replaces: Vec::new(),
                    };
                    self.sink.subtitle(&sub);
                    // Câu đã là ngôn ngữ đích: phụ đề cuối hiện ngay, gỡ dòng đang nói (spec 2026-10-10 §4.5).
                    self.end_lives(&ids);
                    return;
                }
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let (sub_id, closed, joined) = (*sub_id, open.is_closed(), open.text().to_string());
                    self.metrics.merges += 1;
                    self.grow(sub_id, &ids, &joined, end_ms, speech_ms, closed);
                    if closed {
                        self.finish_open();
                    }
                } else {
                    self.finish_open();
                    let open = OpenSentence::new(&piece, &self.cfg.pipeline.merge);
                    let sub_id = self.cfg.id_base + ids[0];
                    let closed = open.is_closed();
                    let sub = Subtitle {
                        id: sub_id,
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::AsrDone,
                        provisional: !closed,
                        replaces: Vec::new(),
                    };
                    // Ngữ cảnh là câu chốt trước câu này, chụp ngay lúc mở câu (§6.5).
                    let context = self
                        .cfg
                        .translation_context
                        .then(|| self.previous.get(&lang).cloned())
                        .flatten();
                    self.subs.insert(
                        sub_id,
                        SubState {
                            sub,
                            version: 1,
                            closed,
                            speech_ms,
                            counted_ms: 0,
                            context,
                            held: None,
                            fresh: String::new(),
                        },
                    );
                    if let Some(state) = self.subs.get(&sub_id) {
                        self.sink.subtitle(&state.sub);
                    }
                    // Dòng đang nói của các đoạn này giờ thay chỗ phụ đề mới tới khi nó chốt; phát ngay sau upsert (QĐ5).
                    self.freeze_lives(&ids, sub_id);
                    self.enqueue(sub_id, 1, false);
                    if closed {
                        self.remember_previous(&lang, &text);
                    } else {
                        self.open = Some((open, sub_id));
                    }
                }
            }
            AsrOutcome::Filtered { ids } => {
                self.metrics.filtered += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
                self.end_lives(&ids);
            }
            AsrOutcome::Dropped { ids, start_ms, end_ms } => {
                self.metrics.dropped += 1;
                for id in &ids {
                    self.pending.remove(id);
                }
                self.last_final_seg = self.last_final_seg.max(ids.last().copied());
                // Mất âm thanh giữa chừng thì không ghép câu qua chỗ đó.
                self.finish_open();
                self.sink.subtitle(&Subtitle {
                    id: self.cfg.id_base + ids[0],
                    start_ms,
                    end_ms,
                    src_lang: String::new(),
                    src_text: String::new(),
                    tgt_text: String::new(),
                    status: Status::Dropped,
                    provisional: false,
                    replaces: Vec::new(),
                });
                self.end_lives(&ids);
            }
            AsrOutcome::Partial(p) => self.on_partial(p),
            AsrOutcome::Unavailable(reason) => {
                log::error!("asr-worker không dùng được: {reason}");
                self.sink.fatal(Fatal::Asr, &reason);
            }
        }
    }
```

Thay **toàn bộ hàm `grow`** (từ doc comment `/// Câu đang mở vừa được ghép thêm một đoạn` tới dấu `}` đóng hàm, ngay trước `fn enqueue`) bằng:

```rust
    /// Câu đang mở vừa được ghép thêm các đoạn `segs`: gửi lại phụ đề (tạm) mà vẫn giữ bản dịch đang hiện (A2, H2), rồi dịch
    /// lại cả câu. Dòng đang nói của các đoạn đó đóng băng ngay sau upsert, chờ câu chốt (QĐ5 của kế hoạch 02).
    fn grow(&mut self, sub_id: u64, segs: &[u64], text: &str, end_ms: u64, speech_ms: u64, closed: bool) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        state.version += 1;
        state.closed = closed;
        state.speech_ms += speech_ms;
        state.sub.src_text = text.to_string();
        state.sub.end_ms = end_ms;
        // A2: không xóa bản dịch đang hiện; giữ nó tới khi bản dịch của câu mới dài ít nhất bằng nó. Chữ mới của phiên bản
        // cũ (nếu đang giữ) không còn đúng.
        if !state.sub.tgt_text.is_empty() {
            state.held = Some(state.sub.tgt_text.clone());
        }
        state.fresh.clear();
        state.sub.status = Status::AsrDone;
        state.sub.provisional = !closed;
        let (version, total) = (state.version, state.speech_ms);
        self.sink.subtitle(&state.sub);
        self.freeze_lives(segs, sub_id);
        let in_flight = self.in_flight.as_ref().is_some_and(|f| f.sub_id == sub_id);
        if in_flight {
            // Bản dịch của câu cũ không còn đúng: hủy, đưa câu mới lên đầu hàng. Câu đã ghép thêm một lần trong lúc bản cũ
            // còn đang dịch thì đã có trong hàng: chỉ cập nhật mục đó, không thêm mục thứ hai.
            if let Some(f) = &self.in_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            if !self.queue.update(sub_id, text, end_ms, total, version) {
                self.enqueue(sub_id, version, true);
            }
        } else if !self.queue.update(sub_id, text, end_ms, total, version) {
            self.enqueue(sub_id, version, false);
        }
    }
```

Trong `enqueue`: thay

```rust
            for id in &merged.replaces {
                if let Some(absorbed) = self.subs.remove(id) {
                    counted += absorbed.counted_ms;
                }
            }
```

bằng

```rust
            for id in &merged.replaces {
                if let Some(absorbed) = self.subs.remove(id) {
                    counted += absorbed.counted_ms;
                }
                // Dòng đang nói chờ câu bị gộp giờ chờ câu gộp (QĐ5 của kế hoạch 02).
                if let Some(segs) = self.live_waiting.remove(id) {
                    self.live_waiting.entry(merged.sub_id).or_default().extend(segs);
                }
            }
```

Thay **toàn bộ hàm `settle`** (từ doc comment `/// Kết thúc phần dịch của một phụ đề.` tới dấu `}` đóng hàm, là hàm cuối của `impl Composer`) bằng khối dưới; khối gồm `settle` mới và các hàm mới của dòng đang nói:

```rust
    /// Kết thúc phần dịch của một phụ đề. `Done` thì đếm phút cho hạn mức (§6.8). Dòng đang nói chờ phụ đề này được gỡ ngay
    /// sau upsert (spec 2026-10-10 §4.5).
    fn settle(&mut self, sub_id: u64, status: Status, tgt_text: String) {
        let Some(state) = self.subs.get_mut(&sub_id) else {
            return;
        };
        let mut usage = None;
        match status {
            Status::Failed => self.metrics.failed += 1,
            Status::Skipped => self.metrics.skipped += 1,
            Status::Done => {
                self.metrics
                    .latency_ms
                    .push(self.now_ms.saturating_sub(state.sub.end_ms) as f32);
                let new_ms = state.speech_ms.saturating_sub(state.counted_ms);
                state.counted_ms = state.speech_ms;
                if new_ms > 0 {
                    self.metrics.translated_speech_ms += new_ms;
                    usage = Some(Usage {
                        sub_id,
                        speech_ms: new_ms,
                    });
                }
            }
            _ => {}
        }
        state.held = None;
        state.fresh.clear();
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
            self.subs.remove(&sub_id);
        }
        self.end_waiting_lives(sub_id);
        if let Some(usage) = usage
            && self.sink.usage(&usage).is_break()
            && !self.quota_hit
        {
            self.hit_quota();
        }
    }

    /// Một lần chép từng phần có kết quả (spec 2026-10-10 §4.1–§4.3): cập nhật dòng đang nói của đoạn. Bỏ khi bị lọc, khi lượt
    /// cuối của đoạn đã có, khi chế độ đã tự tắt, khi đang dừng, hết hạn mức hay hết hạn dừng.
    fn on_partial(&mut self, p: PartialText) {
        self.metrics.partials += 1;
        self.metrics.partial_asr_ms.push(p.asr_ms);
        let late = self.last_final_seg.is_some_and(|last| p.seg <= last);
        if late
            || self.flags.streaming.auto_off.load(Ordering::SeqCst)
            || self.hurry_since.is_some()
            || self.quota_hit
            || self.abandoned
        {
            return;
        }
        let Some(text) = p.text else { return };
        let streaming = &self.cfg.pipeline.streaming;
        let holdback = if uses_char_units(&p.lang) {
            streaming.src_holdback_chars
        } else {
            streaming.src_holdback_words
        };
        let id = self.cfg.id_base + p.seg;
        let live = self
            .lives
            .entry(p.seg)
            .or_insert_with(|| Live::new(id, &p.lang, holdback));
        if live.frozen {
            return;
        }
        if live.line.src_lang != p.lang {
            // Ngôn ngữ chỉ đổi được khi lần chép trước bị lọc (QĐ8): bắt đầu lại dòng với ngôn ngữ mới.
            *live = Live::new(id, &p.lang, holdback);
        }
        live.src_split = live.src.push(&text);
        live.text = text;
        live.start_ms = p.start_ms;
        live.upto_ms = p.upto_ms;
        self.refresh_extends(p.seg);
        self.emit_live(p.seg, false);
    }

    /// Phụ đề tạm mà dòng `live` nối tiếp (spec §4.3): câu đang mở nhận được đoạn này theo luật ghép §6.3 (cùng ngôn ngữ của
    /// lần chép từng phần, chưa chốt, chưa đạt trần, trong cửa sổ ghép). Dòng đã là ngôn ngữ đích không nối tiếp: lượt cuối
    /// của nó là `same_lang`.
    fn live_extends(&self, live: &Live) -> Option<u64> {
        if live.line.src_lang == self.cfg.target.code() {
            return None;
        }
        let piece = Piece {
            start_ms: live.start_ms,
            end_ms: live.upto_ms,
            lang: &live.line.src_lang,
            text: &live.text,
        };
        self.open
            .as_ref()
            .filter(|(o, _)| o.accepts(&piece, self.window_ms))
            .map(|(_, id)| *id)
    }

    /// Xét lại phụ đề tạm mà dòng của đoạn `seg` nối tiếp (câu đang mở có thể đã chốt, hay vừa được ghép thêm đoạn trước).
    fn refresh_extends(&mut self, seg: u64) {
        let Some(live) = self.lives.get(&seg).filter(|l| !l.frozen) else {
            return;
        };
        let extends = self.live_extends(live);
        if let Some(live) = self.lives.get_mut(&seg)
            && live.line.extends != extends
        {
            live.line.extends = extends;
        }
    }

    /// Phát dòng đang nói của đoạn `seg` nếu có đổi (hay luôn phát, `force`). Nối tiếp câu A thì phần nguồn gồm chữ của A,
    /// nối như khi ghép (QĐ6 của kế hoạch 02).
    fn emit_live(&mut self, seg: u64, force: bool) {
        let Some(live) = self.lives.get(&seg) else { return };
        let mut line = live.line.clone();
        let (stable, tail) = (&live.src_split.stable, &live.src_split.tail);
        match line.extends.and_then(|id| self.subs.get(&id)) {
            Some(state) => {
                let base = state.sub.src_text.trim_end();
                let join = joiner(&line.src_lang);
                if stable.is_empty() {
                    line.src_stable = base.to_string();
                    line.src_tail = if tail.is_empty() {
                        String::new()
                    } else {
                        format!("{join}{tail}")
                    };
                } else {
                    line.src_stable = format!("{base}{join}{stable}");
                    line.src_tail = tail.clone();
                }
            }
            None => {
                line.src_stable = stable.clone();
                line.src_tail = tail.clone();
            }
        }
        if force || live.emitted.as_ref() != Some(&line) {
            self.sink.live(&line);
            if let Some(live) = self.lives.get_mut(&seg) {
                live.emitted = Some(line);
            }
        }
    }

    /// Kết quả nhận dạng lượt cuối của các đoạn `segs` vừa thành phụ đề `sub_id` (phụ đề mới, hay câu được ghép thêm): dòng
    /// đang nói của các đoạn đó đóng băng, được phát lại một lần với `extends` là phụ đề đó (`None` nếu đó chính là id của
    /// dòng), và chờ phụ đề đó chốt để gỡ (QĐ5). Gọi ngay sau upsert tạo ra phần chữ của các đoạn đó.
    fn freeze_lives(&mut self, segs: &[u64], sub_id: u64) {
        for &seg in segs {
            let Some(live) = self.lives.get_mut(&seg) else {
                continue;
            };
            live.frozen = true;
            live.line.extends = (live.line.id != sub_id).then_some(sub_id);
            self.live_waiting.entry(sub_id).or_default().push(seg);
            self.emit_live(seg, true);
        }
    }

    /// Gỡ dòng đang nói của các đoạn `segs`, nếu có (spec §4.5, §6.2).
    fn end_lives(&mut self, segs: &[u64]) {
        for &seg in segs {
            if self.lives.remove(&seg).is_some() {
                self.sink.live_end(&LiveEnd {
                    id: self.cfg.id_base + seg,
                });
            }
        }
    }

    /// Phụ đề `sub_id` vừa chốt: gỡ các dòng đang nói chờ nó.
    fn end_waiting_lives(&mut self, sub_id: u64) {
        if let Some(segs) = self.live_waiting.remove(&sub_id) {
            self.end_lives(&segs);
        }
    }

    /// Gỡ mọi dòng đang nói (tự tắt, hết hạn mức, hết hạn dừng, luồng phụ đề kết thúc).
    fn end_all_lives(&mut self) {
        self.live_waiting.clear();
        let segs: Vec<u64> = self.lives.keys().copied().collect();
        self.end_lives(&segs);
    }
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected:
- 9 test mới đạt: `partials_become_a_live_line_with_a_stable_prefix`, `a_live_line_extends_the_open_sentence`, `the_final_subtitle_replaces_the_live_line_when_it_settles`, `a_merged_final_ends_the_live_line_when_the_grown_sentence_settles`, `a_sentence_merged_in_the_translation_queue_hands_its_live_lines_over`, `filtered_dropped_and_same_language_segments_end_their_live_line`, `the_end_of_the_session_ends_every_live_line`, `partials_use_the_final_request_and_lock_the_language_per_segment`, `a_failed_partial_is_dropped_without_a_resend`;
- mọi test cũ đạt (kể cả bốn test H2 của kế hoạch 01 và test tích hợp `tests/engine.rs`);
- clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): chép từng phần và dòng đang nói phía chữ nguồn (spec 2026-10-10 §4.1, §4.2, §4.5)

Luồng nhận dạng chép yêu cầu chép từng phần bằng đúng TranscribeRequest của lượt cuối, khóa ngôn ngữ theo đoạn sau lần
được giữ đầu tiên, qua đúng bộ lọc, không đổi prompt; lỗi thì bỏ. Luồng phụ đề chốt chữ nguồn bằng LocalAgreement-2,
xét câu được nối tiếp, phát live; lượt cuối đóng băng dòng ngay sau upsert tạo phụ đề và gỡ dòng khi phụ đề chốt, khi
same_lang, bị lọc, bị bỏ hay khi luồng phụ đề kết thúc.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---
## Task 12: Engine: luồng VAD lên lịch chép từng phần, ngưỡng theo đoạn, cửa sổ ghép

Spec §4.1, §4.7, H6, QĐ1–QĐ3:
- mỗi khung **không có đoạn mở**, luồng VAD đọc "chế độ đang có hiệu lực" và tính ngưỡng đóng đoạn `end_silence_for` (giá trị lớn hơn của `segmenter.end_silence_ms` và `streaming.end_silence_ms` khi chế độ có hiệu lực); ngưỡng đổi thì `Segmenter::set_end_silence_ms`, `PartialScheduler::set_end_silence_ms` và gửi `Msg::Threshold`;
- `Msg::Threshold` cũng được gửi một lần lúc bắt đầu; luồng phụ đề tính lại cửa sổ ghép bằng `merge_window_ms`;
- mỗi khung **có đoạn mở**, nếu chế độ có hiệu lực cho đoạn đó và chưa tự tắt: `PartialScheduler::decide(open_progress, giờ âm thanh, T, còn đoạn đóng chờ?)`; quyết chép thì dựng `PartialRequest` từ `open_snapshot` và `SharedQueue::push_partial`;
- T đọc từ `Streaming::cadence_ms` (trường mới; luồng phụ đề cập nhật ở Task 13, tới đó là `initial_cadence_ms`).

**Files:**
- Modify: `crates/pipeline/src/engine.rs`: import; `Msg`; `SharedQueue`; `Streaming`, `Flags::new`; `Engine::start` (luồng VAD); hàm mới `end_silence_for`; `vad_loop` (cả hàm); `Composer::handle`; test

- [ ] **Step 1: Viết test**

`crates/pipeline/src/engine.rs`, trong `mod tests`: thay

```rust
    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

bằng

```rust
    /// Ngưỡng đóng đoạn đang dùng (H6, spec 2026-10-10 §4.7): ở chế độ này là giá trị lớn hơn của ngưỡng người dùng và
    /// `streaming.end_silence_ms`; chế độ thường giữ ngưỡng người dùng.
    #[test]
    fn the_end_silence_follows_the_mode() {
        let mut p = PipelineConfig::default();
        p.segmenter.end_silence_ms = 300;
        // Đặt rõ, không dựa vào mặc định (Task 21 đổi mặc định theo quyết định ở cổng).
        p.streaming.end_silence_ms = 400;
        assert_eq!((end_silence_for(&p, false), end_silence_for(&p, true)), (300, 400));
        p.segmenter.end_silence_ms = 800;
        assert_eq!(end_silence_for(&p, true), 800, "lấy giá trị lớn hơn");
    }

    /// Cửa sổ ghép theo ngưỡng mà luồng VAD báo (H6): ngưỡng 400 ms cho cửa sổ 800 ms, nên đoạn bắt đầu 750 ms sau đoạn trước
    /// vẫn được ghép; ngưỡng 300 ms (cửa sổ 700 ms) thì không.
    #[test]
    fn the_merge_window_follows_the_threshold_of_the_vad_thread() {
        for (threshold, merges) in [(300, 0), (400, 1)] {
            let mut h = harness();
            h.feed(Msg::Threshold(threshold));
            h.said(1, 0, 1_000, "en", "so we went");
            h.said(2, 1_750, 2_500, "en", "home");
            assert_eq!(h.c.metrics.merges, merges, "ngưỡng {threshold} ms");
        }
    }

    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

và thay

```rust
    /// Q5 của review 02b: VAD không nạp được thì báo lỗi, engine kết thúc.
```

bằng

```rust
    /// Chép lời mọi đoạn thành "so we went home"; ghi (id đoạn, số mẫu) của mọi yêu cầu.
    struct RecordingAsr(Arc<Mutex<Vec<(u64, usize)>>>);

    impl Asr for RecordingAsr {
        fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
            self.0.lock().unwrap().push((req.segment_id, req.pcm.len()));
            ConstAsr("so we went home").transcribe(req)
        }
    }

    /// Luồng VAD (spec 2026-10-10 §4.1): chế độ có hiệu lực thì gửi lần chép từng phần của đoạn đang mở (cùng id mà đoạn
    /// nhận khi đóng, âm thanh ngắn hơn) trước lượt cuối, và dòng đang nói được gỡ khi phụ đề chốt; chế độ tắt thì không có
    /// lần nào và không có dòng nào.
    #[test]
    fn the_vad_thread_sends_partials_of_the_open_segment() {
        for enabled in [true, false] {
            let seen = Arc::new(Mutex::new(Vec::new()));
            let config = EngineConfig {
                streaming_enabled: enabled,
                ..cfg()
            };
            // 2 giây tiếng rồi 1,5 giây im lặng, phát nhanh gấp 20 lần thời gian thực.
            let mut samples = speech_then_silence(0);
            samples.extend(speech_then_silence(1_500));
            let source = Box::new(SampleSource::new(samples, 1_600, Duration::from_millis(5)));
            let (engine, sink) = start(source, energy(), Box::new(RecordingAsr(seen.clone())), quick_mt(), config);
            engine.join();
            let seen = seen.lock().unwrap().clone();
            if !enabled {
                assert_eq!(seen.len(), 1, "chỉ lượt cuối: {seen:?}");
                assert!(sink.lives.lock().unwrap().is_empty());
                continue;
            }
            assert!(seen.len() >= 2, "{seen:?}");
            let (id, final_len) = *seen.last().unwrap();
            assert!(seen.iter().all(|&(i, _)| i == id), "{seen:?}");
            assert!(seen[..seen.len() - 1].iter().all(|&(_, n)| n < final_len), "{seen:?}");
            assert!(!sink.lives.lock().unwrap().is_empty());
            assert_eq!(sink.live_ends.lock().unwrap().clone(), [id]);
        }
    }

    /// Q5 của review 02b: VAD không nạp được thì báo lỗi, engine kết thúc.
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib engine
```

Expected: lỗi biên dịch `cannot find function end_silence_for`, `no variant named Threshold`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/engine.rs`: thay

```rust
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter};
use crate::sentence::{OpenSentence, Piece, joiner, merge_window_ms};
use crate::streaming::{Split, Stabilizer, uses_char_units};
```

bằng

```rust
use crate::segmenter::{FRAME_MS, FRAME_SAMPLES, Segmenter, SegmenterConfig};
use crate::sentence::{OpenSentence, Piece, joiner, merge_window_ms};
use crate::streaming::{PartialScheduler, Split, Stabilizer, uses_char_units};
```

thay

```rust
    NoAudio(bool),
    Asr(AsrOutcome),
```

bằng

```rust
    NoAudio(bool),
    /// Ngưỡng im lặng đóng đoạn mà luồng VAD đang dùng: lúc bắt đầu, và mỗi khi đổi (chỉ khi không có đoạn mở; H6).
    Threshold(u64),
    Asr(AsrOutcome),
```

thay

```rust
    fn close(&self) {
        self.lock().1 = true;
        self.ready.notify_all();
    }
```

bằng

```rust
    /// Đặt yêu cầu chép từng phần, thay yêu cầu đang chờ (spec 2026-10-10 §4.1). Hàng đã đóng thì bỏ.
    fn push_partial(&self, partial: PartialRequest) {
        let mut state = self.lock();
        if !state.1 {
            state.0.set_partial(partial);
        }
        drop(state);
        self.ready.notify_one();
    }

    /// Còn đoạn đóng chờ nhận dạng.
    fn has_waiting_segments(&self) -> bool {
        self.lock().0.has_waiting_segments()
    }

    fn close(&self) {
        self.lock().1 = true;
        self.ready.notify_all();
    }
```

thay

```rust
    /// Đã tự tắt vì máy không theo kịp (§5), tới hết phiên.
    auto_off: AtomicBool,
}
```

bằng

```rust
    /// Đã tự tắt vì máy không theo kịp (§5), tới hết phiên.
    auto_off: AtomicBool,
    /// Nhịp T hiện tại (ms): luồng phụ đề tính (`Cadence`), luồng VAD đọc.
    cadence_ms: AtomicU64,
}
```

thay

```rust
        flags.streaming.enabled.store(cfg.streaming_enabled, Ordering::SeqCst);
        flags
    }
```

bằng

```rust
        flags.streaming.enabled.store(cfg.streaming_enabled, Ordering::SeqCst);
        flags
            .streaming
            .cadence_ms
            .store(cfg.pipeline.streaming.initial_cadence_ms, Ordering::SeqCst);
        flags
    }
```

Trong `Engine::start`: thay

```rust
            let (stop, now_ms, queue2, sink) = (flags.stop.clone(), now_ms.clone(), queue.clone(), sink.clone());
```

bằng

```rust
            let (stop, now_ms, queue2, sink) = (flags.stop.clone(), now_ms.clone(), queue.clone(), sink.clone());
            let streaming = flags.streaming.clone();
```

và thay

```rust
                    vad_loop(source, vad, &vad_pipeline, &queue2, &tx, &*sink, &now_ms, &stop)
```

bằng

```rust
                    vad_loop(source, vad, &vad_pipeline, &queue2, &tx, &*sink, &now_ms, &stop, &streaming)
```

Thay **toàn bộ hàm `vad_loop`** (từ `#[allow(clippy::too_many_arguments)]` ngay trên `fn vad_loop(` tới dấu `}` đóng hàm, ngay trước `fn asr_loop(`) bằng:

```rust
/// Ngưỡng im lặng đóng đoạn đang dùng (H6, spec 2026-10-10 §4.7): ở chế độ dịch trong lúc nói là giá trị lớn hơn của
/// `segmenter.end_silence_ms` (`vadEndSilenceMs` của người dùng) và `streaming.end_silence_ms`; chế độ thường giữ nguyên.
fn end_silence_for(cfg: &PipelineConfig, streaming: bool) -> u64 {
    if streaming {
        cfg.segmenter.end_silence_ms.max(cfg.streaming.end_silence_ms)
    } else {
        cfg.segmenter.end_silence_ms
    }
}

#[allow(clippy::too_many_arguments)]
fn vad_loop(
    mut source: Box<dyn FrameSource>,
    vad: VadFactory,
    cfg: &PipelineConfig,
    queue: &SharedQueue,
    tx: &Sender<Msg>,
    sink: &dyn EventSink,
    now_ms: &AtomicU64,
    stop: &AtomicBool,
    streaming: &Streaming,
) {
    let mut vad = match vad() {
        Ok(v) => v,
        Err(e) => {
            log::error!("không nạp được VAD: {e:#}");
            sink.fatal(Fatal::Vad, &format!("không nạp được VAD: {e:#}"));
            return;
        }
    };
    // Chế độ dịch trong lúc nói và ngưỡng đóng đoạn được chốt cho từng đoạn, ở các khung chưa có đoạn mở (H6; QĐ2 của kế
    // hoạch 02): đổi công tắc giữa phiên có tác dụng từ đoạn kế tiếp.
    let mut seg_streaming = streaming.active();
    let mut end_silence = end_silence_for(cfg, seg_streaming);
    let mut segmenter = Segmenter::new(SegmenterConfig {
        end_silence_ms: end_silence,
        ..cfg.segmenter.clone()
    });
    let mut scheduler = PartialScheduler::new(&cfg.streaming, cfg.segmenter.min_speech_ms, end_silence);
    let _ = tx.send(Msg::Threshold(end_silence));
    let mut silence = SilenceMonitor::new(cfg.audio.clone());
    let level_frames = (cfg.audio.level_interval_ms / FRAME_MS).max(1);
    let (mut buf, mut frames, mut no_audio) = (Vec::new(), 0u64, false);
    let mut level_sum = 0.0f32;
    let send_segment = |seg: crate::segmenter::Segment, closed_ms: u64| {
        let _ = tx.send(Msg::Queued {
            id: seg.id,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            closed_ms,
        });
        queue.push(PendingSegment::from(seg));
    };
    'outer: while !stop.load(Ordering::SeqCst) {
        match source.read(&mut buf, Duration::from_millis(20)) {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::error!("nguồn âm thanh lỗi: {e:#}");
                sink.fatal(Fatal::Audio, &format!("nguồn âm thanh lỗi: {e:#}"));
                break;
            }
        }
        let mut consumed = 0;
        while buf.len() - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            consumed += FRAME_SAMPLES;
            frames += 1;
            let now = frames * FRAME_MS;
            now_ms.store(now, Ordering::SeqCst);
            let frame_rms = rms(frame);
            level_sum += frame_rms;
            if frames.is_multiple_of(level_frames) {
                sink.level(level_sum / level_frames as f32);
                level_sum = 0.0;
            }
            let silent = silence.push(frame_rms, FRAME_MS);
            if silent != no_audio {
                no_audio = silent;
                let _ = tx.send(Msg::NoAudio(silent));
            }
            let prob = match vad.prob(frame) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("VAD lỗi: {e:#}");
                    sink.fatal(Fatal::Vad, &format!("VAD lỗi: {e:#}"));
                    break 'outer;
                }
            };
            for seg in segmenter.push(frame, prob) {
                send_segment(seg, now);
            }
            match segmenter.open_progress() {
                None => {
                    seg_streaming = streaming.active();
                    let wanted = end_silence_for(cfg, seg_streaming);
                    if wanted != end_silence {
                        end_silence = wanted;
                        segmenter.set_end_silence_ms(wanted);
                        scheduler.set_end_silence_ms(wanted);
                        let _ = tx.send(Msg::Threshold(wanted));
                    }
                }
                // Chép từng phần đoạn đang mở (spec 2026-10-10 §4.1): theo nhịp T, và khi vừa hết tiếng nói. Tự tắt thì dừng
                // ngay, kể cả giữa đoạn (§5).
                Some(open) if seg_streaming && !streaming.auto_off.load(Ordering::SeqCst) => {
                    let cadence_ms = streaming.cadence_ms.load(Ordering::SeqCst);
                    if scheduler
                        .decide(open, now, cadence_ms, queue.has_waiting_segments())
                        .is_some()
                        && let Some(snap) = segmenter.open_snapshot()
                    {
                        queue.push_partial(PartialRequest {
                            id: snap.id,
                            start_ms: snap.start_ms,
                            upto_ms: now,
                            speech_ms: snap.speech_ms,
                            mean_prob: snap.mean_prob,
                            samples: snap.samples,
                            requested: Instant::now(),
                        });
                    }
                }
                Some(_) => {}
            }
            if frames.is_multiple_of(CLOCK_EVERY_FRAMES) {
                let _ = tx.send(Msg::Clock {
                    now_ms: now,
                    speech_since: segmenter.open_start_ms(),
                });
            }
        }
        buf.drain(..consumed);
    }
    if let Some(seg) = segmenter.flush() {
        send_segment(seg, frames * FRAME_MS);
    }
    let _ = tx.send(Msg::Clock {
        now_ms: frames * FRAME_MS,
        speech_since: None,
    });
}
```

Trong `Composer::handle`: thay

```rust
            Msg::NoAudio(no_audio) => {
                self.indicators.no_audio = no_audio;
                self.sink.indicators(&self.indicators);
            }
```

bằng

```rust
            Msg::NoAudio(no_audio) => {
                self.indicators.no_audio = no_audio;
                self.sink.indicators(&self.indicators);
            }
            Msg::Threshold(end_silence_ms) => {
                // Cửa sổ ghép theo ngưỡng đã cắt các đoạn từ giờ (H6; spec 2026-10-10 §4.7).
                self.window_ms = merge_window_ms(end_silence_ms, &self.cfg.pipeline.merge);
            }
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: `the_end_silence_follows_the_mode`, `the_merge_window_follows_the_threshold_of_the_vad_thread`, `the_vad_thread_sends_partials_of_the_open_segment` đạt; mọi test cũ đạt (chế độ tắt: luồng VAD gửi `Threshold` bằng đúng ngưỡng người dùng, cửa sổ ghép không đổi); clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): luồng VAD chép từng phần đoạn đang mở và chốt ngưỡng theo đoạn (spec 2026-10-10 §4.1, §4.7)

Mỗi khung không có đoạn mở, luồng VAD chốt chế độ và ngưỡng đóng đoạn cho đoạn kế tiếp (max của ngưỡng người dùng và
streaming.end_silence_ms) và báo Threshold để luồng phụ đề tính lại cửa sổ ghép; khi có đoạn mở, PartialScheduler quyết
lần chép theo nhịp T và khi vừa hết tiếng nói, rồi đặt yêu cầu vào ô của hàng đợi nhận dạng.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---
## Task 13: Engine: dịch bản tạm, prefill, nhịp

Spec §4.3, §4.4, §4.6, §5 và QĐ4, QĐ6, QĐ7:
- **Luồng dịch** nhận `Work::Final(MtJob)` (như cũ) hay `Work::Live(LiveJob)`; bản tạm chạy `translate_live` với prefill, gửi `Msg::LiveDelta { job, text }` và `Msg::LiveDone { job, outcome, finished }`.
- **Luồng phụ đề:**
  - mỗi bản chép từng phần mới (khác ngôn ngữ đích, dịch còn dùng được) đặt `live_want` (yêu cầu mới thắng) và hủy bản tạm đang dịch;
  - `dispatch_live` (sau `dispatch` trong `step`) gửi tối đa một bản tạm, chỉ khi không có việc lượt cuối đang chạy hay đang chờ; chữ nguồn là câu được nối tiếp nối với chữ của đoạn; prefill là `Stabilizer::stable_text` của phần dịch; `tgt_src_units` là số đơn vị của chữ nguồn đem dịch;
  - `dispatch` bật cờ hủy của bản tạm đang dịch trước khi gửi việc lượt cuối;
  - bản tạm bị hủy mà chưa có lần chép mới hơn thì được dịch lại khi rảnh;
  - `LiveDelta`: QĐ7 (thay khi đủ dài, rồi hiện dần), bỏ dấu kết câu cuối;
  - `LiveDone(Done)`: chốt phần dịch bằng `Stabilizer` (n, k theo tiếng nguồn), ghi một vòng (`finished − requested`) vào `Cadence`, ghi T vào `Streaming::cadence_ms` cho luồng VAD;
  - `LiveDone(Failed | Cancelled)`: giữ chữ đang hiện, không tính vòng; `Unavailable`: báo chỉ báo, dòng đang nói chỉ còn câu gốc, không gửi bản tạm nữa;
  - đổi câu được nối tiếp thì phần dịch chốt lại từ đầu; kết quả của bản tạm dịch theo câu nối tiếp cũ bị bỏ.
- `PartialText` thêm `requested` (lúc luồng VAD tạo yêu cầu).

Harness: `job()` bỏ qua bản tạm và trả câu kế tiếp của lượt cuối, `no_job()` chỉ xét câu của lượt cuối (test của chế độ thường và Task 11 giữ nguyên ý nghĩa); `live_job()`, `nothing_sent()` cho bản tạm.

Các hàm `mt_loop`, `dispatch` được ghi nguyên bản mới (đã gồm H1 của kế hoạch 01 và `prefill: None` của Task 8).

**Files:**
- Modify: `crates/pipeline/src/engine.rs`: import; `Msg`; `MtJob` (thêm `LiveJob`, `Work` sau nó); `PartialText`; `transcribe_partial`; `Engine::start` (kênh việc); `mt_loop` (cả hàm, thêm `translate_final`, `translate_live_job`); `Live`; `Composer` (trường, `new`, `step`, `handle`, `on_partial`, `refresh_extends`, `freeze_lives`, `end_lives`, `dispatch`, hàm mới); test

- [ ] **Step 1: Viết test**

`crates/pipeline/src/engine.rs`, trong `mod tests`:

Trong `the_translation_thread_puts_matching_terms_into_the_prompt`, thay

```rust
        let glossary: SharedGlossary = Arc::new(RwLock::new(Glossary::new([term("sprint", "đợt chạy")])));
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
```

bằng

```rust
        let glossary: SharedGlossary = Arc::new(RwLock::new(Glossary::new([term("sprint", "đợt chạy")])));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
```

và thay

```rust
            jobs_tx
                .send(MtJob {
                    sub_id,
                    version: 0,
                    src: Lang::En,
                    text: text.into(),
                    context: None,
                    cancel,
                })
                .unwrap();
```

bằng

```rust
            jobs_tx
                .send(Work::Final(MtJob {
                    sub_id,
                    version: 0,
                    src: Lang::En,
                    text: text.into(),
                    context: None,
                    cancel,
                }))
                .unwrap();
```

Trong `the_translation_thread_stops_a_cancelled_job_while_text_is_held` (kế hoạch 01), thay

```rust
        let sent = Arc::new(AtomicU64::new(0));
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
```

bằng

```rust
        let sent = Arc::new(AtomicU64::new(0));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
```

và thay

```rust
        jobs_tx
            .send(MtJob {
                sub_id: 1,
                version: 1,
                src: Lang::En,
                text: "Hello there".into(),
                context: None,
                cancel: cancel.clone(),
            })
            .unwrap();
```

bằng

```rust
        jobs_tx
            .send(Work::Final(MtJob {
                sub_id: 1,
                version: 1,
                src: Lang::En,
                text: "Hello there".into(),
                context: None,
                cancel: cancel.clone(),
            }))
            .unwrap();
```

Thay

```rust
    struct Harness {
        c: Composer,
        jobs: Receiver<MtJob>,
        sink: Arc<Sink>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
    }
```

bằng

```rust
    struct Harness {
        c: Composer,
        jobs: Receiver<Work>,
        sink: Arc<Sink>,
        flags: Flags,
        asr_queue: Arc<SharedQueue>,
        /// Mốc giờ thật của test: lúc "luồng VAD" tạo mọi yêu cầu chép từng phần.
        t0: Instant,
    }
```

thay

```rust
        Harness {
            c,
            jobs,
            sink,
            flags,
            asr_queue,
        }
```

bằng

```rust
        Harness {
            c,
            jobs,
            sink,
            flags,
            asr_queue,
            t0: Instant::now(),
        }
```

thay

```rust
                text: text.map(String::from),
                asr_ms: 200.0,
            })))
        }
```

bằng

```rust
                text: text.map(String::from),
                asr_ms: 200.0,
                requested: self.t0,
            })))
        }
```

thay

```rust
        fn job(&self) -> MtJob {
            self.jobs.try_recv().expect("phải có câu được gửi đi dịch")
        }

        fn no_job(&self) {
            assert!(self.jobs.try_recv().is_err(), "không được gửi thêm câu nào đi dịch");
        }
```

bằng

```rust
        /// Câu kế tiếp của lượt cuối được gửi đi dịch; bản tạm gửi trước nó (nếu có) bị bỏ qua.
        fn job(&self) -> MtJob {
            loop {
                match self.jobs.try_recv() {
                    Ok(Work::Final(j)) => return j,
                    Ok(Work::Live(_)) => continue,
                    Err(_) => panic!("phải có câu được gửi đi dịch"),
                }
            }
        }

        /// Không có câu nào của lượt cuối được gửi đi dịch (bản tạm không tính).
        fn no_job(&self) {
            while let Ok(work) = self.jobs.try_recv() {
                assert!(matches!(work, Work::Live(_)), "không được gửi thêm câu nào đi dịch");
            }
        }

        /// Bản tạm kế tiếp được gửi đi dịch.
        fn live_job(&self) -> LiveJob {
            match self.jobs.try_recv() {
                Ok(Work::Live(j)) => j,
                Ok(Work::Final(j)) => panic!("cần bản tạm, có câu {} của lượt cuối", j.sub_id),
                Err(_) => panic!("phải có bản tạm được gửi đi dịch"),
            }
        }

        /// Không có việc nào (lượt cuối hay bản tạm) được gửi đi dịch.
        fn nothing_sent(&self) {
            assert!(self.jobs.try_recv().is_err(), "không được gửi việc nào đi dịch");
        }

        /// Luồng dịch gửi một gói của bản tạm `job`.
        fn live_delta(&mut self, job: &LiveJob, text: &str) -> bool {
            self.feed(Msg::LiveDelta {
                job: job.job,
                text: text.into(),
            })
        }

        /// Bản tạm `job` kết thúc `after_ms` sau lúc tạo yêu cầu chép từng phần (`t0`).
        fn live_done(&mut self, job: &LiveJob, outcome: Outcome, after_ms: u64) -> bool {
            self.feed(Msg::LiveDone {
                job: job.job,
                outcome,
                finished: self.t0 + Duration::from_millis(after_ms),
            })
        }
```

và thay

```rust
    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

bằng

```rust
    // ---- Dịch trong lúc người nói chưa dừng: bản dịch tạm (spec 2026-10-10 §4.3–§4.6, §5). ----

    /// Bản tạm (§4.3–§4.4): chữ nguồn là lần chép mới nhất; phần dịch ổn định (LocalAgreement-2, giữ lại 1 từ với nguồn
    /// tiếng Anh) là prefill của lần sau; dấu kết câu ở cuối không hiện; `tgt_src_units` là số đơn vị nguồn đã dịch.
    #[test]
    fn live_translations_are_stabilized_and_prefilled() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let j1 = h.live_job();
        assert_eq!(
            (j1.text.as_str(), j1.prefill.as_deref(), j1.src),
            ("so we", None, Lang::En)
        );
        h.live_done(&j1, done("chúng tôi."), 600);
        let l = h.last_live(1);
        assert_eq!(
            (l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            ("", "chúng tôi", 2)
        );
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let j2 = h.live_job();
        assert_eq!(j2.prefill, None, "một bản dịch xong chưa đủ để chốt");
        h.live_done(&j2, done("chúng tôi đã đi"), 700);
        let l = h.last_live(1);
        assert_eq!(
            (l.tgt_stable.as_str(), l.tgt_tail.as_str(), l.tgt_src_units),
            ("chúng", " tôi đã đi", 3)
        );
        h.partial(1, 0, 3_000, "en", Some("so we went home"));
        let j3 = h.live_job();
        assert_eq!(
            (j3.text.as_str(), j3.prefill.as_deref()),
            ("so we went home", Some("chúng"))
        );
    }

    /// Bản tạm đang stream chỉ thay chữ đang hiện khi đã dài ít nhất bằng nó (QĐ7), rồi hiện dần từng gói.
    #[test]
    fn a_streaming_live_translation_takes_over_once_it_is_as_long() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let j1 = h.live_job();
        h.live_done(&j1, done("chúng tôi"), 500);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let j2 = h.live_job();
        h.live_delta(&j2, "chúng");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi", "bản mới còn ngắn hơn");
        h.live_delta(&j2, " tôi");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi");
        h.live_delta(&j2, " đã");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã");
        h.live_delta(&j2, " đi.");
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã đi", "dấu chấm cuối không hiện");
    }

    /// Việc của lượt cuối luôn đi trước (§4.6): bản tạm đang dịch bị hủy; không gửi bản tạm nào khi lượt cuối còn việc; bản
    /// tạm bị hủy được dịch lại (bằng lần chép mới nhất) khi rảnh; vòng bị hủy không tính.
    #[test]
    fn final_translations_go_first() {
        let mut h = live_harness();
        h.partial(2, 3_000, 4_000, "en", Some("and then we"));
        let l1 = h.live_job();
        h.said(1, 0, 1_000, "en", "One.");
        assert!(l1.cancel.load(Ordering::SeqCst), "bản tạm bị hủy");
        let j1 = h.job();
        h.live_done(&l1, Outcome::Cancelled, 100);
        h.nothing_sent();
        h.partial(2, 3_000, 5_000, "en", Some("and then we went"));
        h.nothing_sent();
        h.finish(&j1, done("Một."));
        let l2 = h.live_job();
        assert_eq!(l2.text, "and then we went", "lần chép mới nhất");
        assert!(h.c.metrics.live_cycle_ms.is_empty(), "vòng bị hủy không tính");
    }

    /// Yêu cầu mới thắng (§4.6): lần chép mới tới khi bản tạm đang dịch thì hủy bản đó; xong thì gửi lần mới nhất.
    #[test]
    fn the_newest_partial_wins() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.partial(1, 0, 1_500, "en", Some("so we went"));
        assert!(l1.cancel.load(Ordering::SeqCst));
        h.nothing_sent();
        h.partial(1, 0, 1_800, "en", Some("so we went home"));
        h.live_done(&l1, Outcome::Cancelled, 50);
        assert_eq!(h.live_job().text, "so we went home");
        h.nothing_sent();
    }

    /// Bản tạm lỗi: giữ chữ đang hiện, không thử lại, không tính vòng (§7).
    #[test]
    fn a_failed_live_translation_keeps_the_shown_text() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.live_done(&l1, done("chúng tôi"), 400);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let l2 = h.live_job();
        h.live_delta(&l2, "chúng tôi đã");
        h.live_done(
            &l2,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 1,
                source_tokens: 3,
                completion_tokens: None,
            },
            500,
        );
        assert_eq!(h.last_live(1).tgt_tail, "chúng tôi đã", "giữ chữ đang hiện");
        h.nothing_sent();
        assert_eq!(h.c.metrics.live_cycle_ms, [400.0]);
    }

    /// Nhịp T (§5): sau 3 vòng, T = 1,5 × trung vị, ghi vào cờ dùng chung cho luồng VAD.
    #[test]
    fn completed_cycles_set_the_cadence() {
        let mut h = live_harness();
        assert_eq!(h.flags.streaming.cadence_ms.load(Ordering::SeqCst), 1_000);
        for (i, (text, cycle)) in [("so", 500u64), ("so we", 700), ("so we went", 600)].into_iter().enumerate() {
            h.partial(1, 0, 1_000 + i as u64 * 500, "en", Some(text));
            let job = h.live_job();
            h.live_done(&job, done("chúng tôi"), cycle);
        }
        assert_eq!(h.flags.streaming.cadence_ms.load(Ordering::SeqCst), 900);
        assert_eq!(h.c.metrics.live_cycle_ms, [500.0, 700.0, 600.0]);
        assert_eq!(h.c.metrics.cadence_ms, [1_000.0, 1_000.0, 900.0]);
    }

    /// Dòng nối tiếp câu A (§4.3, QĐ6): chữ nguồn đem dịch là A nối với chữ của đoạn; `tgt_src_units` đếm cả câu nối.
    #[test]
    fn a_live_job_for_an_extended_sentence_translates_the_joined_text() {
        let mut h = live_harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.partial(2, 1_300, 2_000, "en", Some("home and"));
        let l = h.live_job();
        assert_eq!(
            (l.text.as_str(), l.prefill.as_deref(), l.src),
            ("so we went home and", None, Lang::En)
        );
        h.live_done(&l, done("chúng tôi đã về nhà và"), 300);
        let line = h.last_live(2);
        assert_eq!(
            (line.extends, line.tgt_tail.as_str(), line.tgt_src_units),
            (Some(1), "chúng tôi đã về nhà và", 5)
        );
    }

    /// `llama-server` không dùng được (§7): báo chỉ báo, dòng đang nói chỉ còn câu gốc, không gửi bản tạm nào nữa.
    #[test]
    fn an_unavailable_server_leaves_live_lines_with_the_source_only() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.live_done(&l1, done("chúng tôi"), 300);
        h.partial(1, 0, 2_000, "en", Some("so we went"));
        let l2 = h.live_job();
        h.live_done(&l2, Outcome::Unavailable("quá 5 lần".into()), 300);
        let l = h.last_live(1);
        assert_eq!((l.tgt_stable.as_str(), l.tgt_tail.as_str()), ("", ""));
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .translation_unavailable
        );
        h.partial(1, 0, 3_000, "en", Some("so we went home"));
        h.nothing_sent();
    }

    /// Luồng dịch chạy bản tạm bằng `translate_live`: prefill đi kèm request, chữ về bằng `LiveDelta`, kết thúc bằng
    /// `LiveDone` có thời điểm xong.
    #[test]
    fn the_translation_thread_runs_live_jobs_with_the_prefill() {
        struct Echo(Arc<Mutex<Vec<Option<String>>>>);
        impl Mt for Echo {
            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
                Ok(text.split_whitespace().count())
            }
            fn stream(
                &mut self,
                req: &ChatRequest,
                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
            ) -> Result<StreamEnd, MtError> {
                self.0.lock().unwrap().push(req.prefill.map(String::from));
                let mut text = String::new();
                for chunk in [req.prefill.unwrap_or("chúng"), " tôi"] {
                    text.push_str(chunk);
                    if on_delta(chunk).is_break() {
                        return Ok(StreamEnd {
                            text,
                            cancelled: true,
                            ..StreamEnd::default()
                        });
                    }
                }
                Ok(StreamEnd {
                    text,
                    finish_reason: Some("stop".into()),
                    chunks: 2,
                    ..StreamEnd::default()
                })
            }
        }
        let prefills = Arc::new(Mutex::new(Vec::new()));
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let (tx, rx) = mpsc::channel::<Msg>();
        let thread = {
            let mt = Box::new(Echo(prefills.clone()));
            std::thread::spawn(move || {
                mt_loop(
                    mt,
                    jobs_rx,
                    &tx,
                    &MtConfig::default(),
                    Lang::Vi,
                    &AtomicBool::new(false),
                    &SharedGlossary::default(),
                )
            })
        };
        let before = Instant::now();
        jobs_tx
            .send(Work::Live(LiveJob {
                job: 7,
                src: Lang::En,
                text: "so we went".into(),
                context: None,
                prefill: Some("chúng".into()),
                cancel: Arc::default(),
            }))
            .unwrap();
        let mut deltas = Vec::new();
        let (outcome, finished) = loop {
            match rx.recv_timeout(Duration::from_secs(5)).expect("phải có kết quả") {
                Msg::LiveDelta { job: 7, text } => deltas.push(text),
                Msg::LiveDone {
                    job: 7,
                    outcome,
                    finished,
                } => break (outcome, finished),
                _ => {}
            }
        };
        assert_eq!(deltas, ["chúng", " tôi"]);
        assert!(matches!(outcome, Outcome::Done(ref t) if t.text == "chúng tôi"), "{outcome:?}");
        assert!(finished >= before);
        drop(jobs_tx);
        thread.join().unwrap();
        assert_eq!(
            *prefills.lock().unwrap(),
            [None, Some("chúng".to_string())],
            "lần làm nóng rồi bản tạm"
        );
    }

    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib engine
```

Expected: lỗi biên dịch `cannot find type Work`, `LiveJob`, `no variant named LiveDelta`, `struct PartialText has no field named requested`…

- [ ] **Step 3: Cài**

`crates/pipeline/src/engine.rs`: thay

```rust
use crate::streaming::{PartialScheduler, Split, Stabilizer, uses_char_units};
```

bằng

```rust
use crate::streaming::{
    Cadence, PartialScheduler, Split, Stabilizer, split_units, strip_terminal_punct, uses_char_units,
};
```

thay

```rust
use crate::translate::{Event, Job, Mt, MtError, Outcome, translate};
```

bằng

```rust
use crate::translate::{Event, Job, Mt, MtError, Outcome, translate, translate_live};
```

thay

```rust
    /// Luồng dịch dừng bất thường.
    MtGone,
```

bằng

```rust
    /// Một gói chữ của bản tạm `job` (spec 2026-10-10 §4.3), đã qua hậu xử lý.
    LiveDelta {
        job: u64,
        text: String,
    },
    /// Bản tạm `job` kết thúc; `finished`: lúc xong (giờ thật), cho vòng cập nhật (§5).
    LiveDone {
        job: u64,
        outcome: Outcome,
        finished: Instant,
    },
    /// Luồng dịch dừng bất thường.
    MtGone,
```

thay

```rust
struct MtJob {
    sub_id: u64,
    version: u32,
    src: Lang,
    text: String,
    context: Option<String>,
    cancel: Arc<AtomicBool>,
}
```

bằng

```rust
struct MtJob {
    sub_id: u64,
    version: u32,
    src: Lang,
    text: String,
    context: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Bản tạm của dòng đang nói (spec 2026-10-10 §4.3).
struct LiveJob {
    /// Số thứ tự của việc: luồng phụ đề chỉ nhận tin nhắn của việc đang chạy.
    job: u64,
    src: Lang,
    /// Chữ nguồn đem dịch: chữ của lần chép mới nhất, nối sau câu được nối tiếp (nếu có).
    text: String,
    context: Option<String>,
    /// Phần dịch đã chốt (§4.4), không có khoảng trắng cuối.
    prefill: Option<String>,
    cancel: Arc<AtomicBool>,
}

/// Việc cho luồng dịch (QĐ4 của kế hoạch 02): một câu của lượt cuối, hay một bản tạm.
enum Work {
    Final(MtJob),
    Live(LiveJob),
}
```

thay

```rust
    /// `asr_ms` + `lid_ms` của worker.
    asr_ms: f32,
}
```

bằng

```rust
    /// `asr_ms` + `lid_ms` của worker.
    asr_ms: f32,
    /// Lúc luồng VAD tạo yêu cầu (giờ thật): mốc đầu của vòng cập nhật (§5).
    requested: Instant,
}
```

trong `transcribe_partial`, thay

```rust
                asr_ms: r.asr_ms + r.lid_ms,
            })));
```

bằng

```rust
                asr_ms: r.asr_ms + r.lid_ms,
                requested: p.requested,
            })));
```

trong `Engine::start`, thay

```rust
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
        let fail = |e: std::io::Error, flags: &Flags, queue: &SharedQueue| {
```

bằng

```rust
        let (jobs_tx, jobs_rx) = mpsc::channel::<Work>();
        let fail = |e: std::io::Error, flags: &Flags, queue: &SharedQueue| {
```

Thay **toàn bộ hàm `mt_loop`** (từ `fn mt_loop(` tới dấu `}` đóng hàm, ngay trước `struct SubState`) bằng:

```rust
fn mt_loop(
    mut mt: Box<dyn Mt>,
    jobs: Receiver<Work>,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    hurry: &AtomicBool,
    glossary: &SharedGlossary,
) {
    // Làm nóng khi bắt đầu phiên (§6.5); lỗi request ở đây không quan trọng, request thật sẽ báo lỗi của nó. Server không
    // dùng được (khởi động không nổi, §6.5) thì báo ngay để thanh phụ đề hiện "Dịch không khả dụng" từ đầu phiên, thay vì
    // chỉ hiện câu gốc đến khi câu đầu tiên xong. Bấm Dừng thì bỏ ngang lần làm nóng.
    let warmup = translation_prompt("Hello.", Lang::En, target);
    let req = crate::llama::ChatRequest {
        prompt: &warmup,
        max_tokens: 32,
        repeat_penalty: cfg.repeat_penalty,
        prefill: None,
    };
    if !hurry.load(Ordering::SeqCst)
        && let Err(e) = mt.stream(&req, &mut |_| {
            if hurry.load(Ordering::SeqCst) {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        })
    {
        log::warn!("làm nóng llama-server lỗi: {e}");
        if let MtError::Unavailable(reason) = e {
            let _ = tx.send(Msg::MtUnavailable(reason));
        }
    }
    for work in jobs {
        match work {
            Work::Final(job) => translate_final(&mut *mt, &job, tx, cfg, target, glossary),
            Work::Live(job) => translate_live_job(&mut *mt, &job, tx, cfg, target, glossary),
        }
    }
}

/// Một câu của lượt cuối (§6.5): gửi từng phần chữ về luồng phụ đề.
fn translate_final(
    mt: &mut dyn Mt,
    job: &MtJob,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    glossary: &SharedGlossary,
) {
    let (sub_id, version) = (job.sub_id, job.version);
    // Thuật ngữ có trong câu, theo bản từ điển lúc bắt đầu dịch câu này (§6.5).
    let terms = glossary.read().map(|g| g.matches(&job.text)).unwrap_or_default();
    let request = Job {
        text: &job.text,
        src: job.src,
        tgt: target,
        context: job.context.as_deref(),
        terms: &terms,
        // Luồng phụ đề bật cờ khi câu được ghép thêm hay khi hết hạn dừng: `translate` kiểm ở mọi gói (H1).
        cancel: Some(job.cancel.as_ref()),
    };
    let outcome = translate(mt, &request, cfg, &mut |event| {
        let msg = match event {
            Event::Delta(text) => Msg::MtDelta {
                sub_id,
                version,
                text: text.to_string(),
            },
            Event::Retry => Msg::MtRetry { sub_id, version },
        };
        match tx.send(msg) {
            Ok(()) => ControlFlow::Continue(()),
            Err(_) => ControlFlow::Break(()),
        }
    });
    let _ = tx.send(Msg::MtDone {
        sub_id,
        version,
        outcome,
    });
}

/// Bản tạm của dòng đang nói (spec 2026-10-10 §4.3): `translate_live` kèm prefill; gửi từng gói và lúc xong về luồng phụ đề.
/// Luồng phụ đề bật cờ hủy khi có lần chép mới hơn hay khi việc của lượt cuối cần chạy (§4.6).
fn translate_live_job(
    mt: &mut dyn Mt,
    job: &LiveJob,
    tx: &Sender<Msg>,
    cfg: &MtConfig,
    target: Lang,
    glossary: &SharedGlossary,
) {
    let id = job.job;
    let terms = glossary.read().map(|g| g.matches(&job.text)).unwrap_or_default();
    let request = Job {
        text: &job.text,
        src: job.src,
        tgt: target,
        context: job.context.as_deref(),
        terms: &terms,
        cancel: Some(job.cancel.as_ref()),
    };
    let outcome = translate_live(mt, &request, job.prefill.as_deref(), cfg, &mut |event| match event {
        Event::Delta(text) => match tx.send(Msg::LiveDelta {
            job: id,
            text: text.to_string(),
        }) {
            Ok(()) => ControlFlow::Continue(()),
            Err(_) => ControlFlow::Break(()),
        },
        Event::Retry => ControlFlow::Continue(()),
    });
    let _ = tx.send(Msg::LiveDone {
        job: id,
        outcome,
        finished: Instant::now(),
    });
}
```

Thay **toàn bộ `struct Live` và `impl Live`** (của Task 11, từ doc comment `/// Dòng đang nói của một đoạn VAD đang mở` tới dấu `}` đóng `impl Live`) bằng:

```rust
/// Dòng đang nói của một đoạn VAD đang mở (spec 2026-10-10 §4.2–§4.5).
struct Live {
    /// Trạng thái của dòng (id đã cộng `id_base`, `extends`, ngôn ngữ, chữ dịch). Phần nguồn được dựng lúc phát (QĐ6).
    line: LiveLine,
    /// Bản đã phát gần nhất.
    emitted: Option<LiveLine>,
    /// Chốt chữ nguồn của riêng đoạn: LocalAgreement-2, giữ lại `src_holdback_*` đơn vị cuối (§4.2).
    src: Stabilizer,
    src_split: Split,
    /// Chốt phần dịch: LocalAgreement-n, giữ lại k đơn vị cuối, (n, k) theo tiếng nguồn (§4.4).
    tgt: Stabilizer,
    target: &'static str,
    agree: (usize, usize),
    /// Chữ của lần chép từng phần mới nhất, và mốc của nó.
    text: String,
    start_ms: u64,
    upto_ms: u64,
    /// Số lần chép từng phần đã nhận.
    gen: u64,
    /// Bản tạm đang stream: chữ đã nhận (gồm phần prefill được stream lại), và đã thay chữ đang hiện chưa (QĐ7).
    streaming: String,
    switched: bool,
    /// Kết quả nhận dạng lượt cuối của đoạn đã tới: không nhận gì thêm, chờ phụ đề chốt (QĐ5).
    frozen: bool,
}

impl Live {
    fn new(id: u64, lang: &str, holdback: usize, target: &'static str, agree: (usize, usize)) -> Self {
        Self {
            line: LiveLine {
                id,
                src_lang: lang.to_string(),
                ..LiveLine::default()
            },
            emitted: None,
            src: Stabilizer::new(lang, 2, holdback),
            src_split: Split::default(),
            tgt: Stabilizer::new(target, agree.0, agree.1),
            target,
            agree,
            text: String::new(),
            start_ms: 0,
            upto_ms: 0,
            gen: 0,
            streaming: String::new(),
            switched: false,
            frozen: false,
        }
    }

    /// Câu đã là ngôn ngữ đích: không dịch, dòng chỉ hiện câu gốc (§4.3).
    fn same_lang(&self) -> bool {
        self.line.src_lang == self.target
    }

    /// Chữ nguồn đem dịch đã khác hẳn (đổi câu được nối tiếp), hay dịch không còn dùng được: phần dịch chốt lại từ đầu.
    fn reset_target(&mut self) {
        self.tgt = Stabilizer::new(self.target, self.agree.0, self.agree.1);
        self.line.tgt_stable.clear();
        self.line.tgt_tail.clear();
        self.line.tgt_src_units = 0;
        self.streaming.clear();
        self.switched = false;
    }
}

/// Bản tạm đang dịch (tối đa một, spec §4.6).
struct LiveFlight {
    job: u64,
    seg: u64,
    /// Lần chép từng phần (đếm theo đoạn) mà bản tạm này dịch, và câu được nối tiếp lúc gửi.
    gen: u64,
    extends: Option<u64>,
    cancel: Arc<AtomicBool>,
    /// Lúc luồng VAD tạo yêu cầu chép từng phần đó: mốc đầu của vòng cập nhật (§5).
    requested: Instant,
    /// Số đơn vị của chữ nguồn đem dịch (`LiveLine::tgt_src_units`).
    src_units: u32,
}

/// Bản tạm chờ gửi đi dịch: lần chép mới nhất của một đoạn (yêu cầu mới thắng, §4.6).
struct LiveWant {
    seg: u64,
    gen: u64,
    requested: Instant,
}
```

thay

```rust
    jobs: Option<Sender<MtJob>>,
```

bằng

```rust
    jobs: Option<Sender<Work>>,
```

thay

```rust
    /// Đoạn lớn nhất đã có kết quả nhận dạng lượt cuối: bản chép từng phần của đoạn không lớn hơn số này tới muộn, bỏ.
    last_final_seg: Option<u64>,
}
```

bằng

```rust
    /// Đoạn lớn nhất đã có kết quả nhận dạng lượt cuối: bản chép từng phần của đoạn không lớn hơn số này tới muộn, bỏ.
    last_final_seg: Option<u64>,
    live_flight: Option<LiveFlight>,
    live_want: Option<LiveWant>,
    /// Số bản tạm đã gửi (đánh số `LiveJob::job`).
    live_jobs: u64,
    /// Nhịp T và tự tắt (§5).
    cadence: Cadence,
}
```

trong `Composer::new`, thay

```rust
        jobs: Sender<MtJob>,
```

bằng

```rust
        jobs: Sender<Work>,
```

thay

```rust
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
```

bằng

```rust
        let stop_grace = Duration::from_millis(cfg.pipeline.mt.stop_grace_ms);
        let cadence = Cadence::new(&cfg.pipeline.streaming);
```

và thay

```rust
            last_final_seg: None,
        }
    }
```

bằng

```rust
            last_final_seg: None,
            live_flight: None,
            live_want: None,
            live_jobs: 0,
            cadence,
        }
    }
```

trong `step`, thay

```rust
        self.check_flags();
        self.dispatch();
```

bằng

```rust
        self.check_flags();
        self.dispatch();
        self.dispatch_live();
```

trong `handle`, thay

```rust
            } => self.on_mt_done(sub_id, version, outcome),
            Msg::MtGone => {
                log::error!("luồng dịch dừng bất thường");
                self.jobs = None;
```

bằng

```rust
            } => self.on_mt_done(sub_id, version, outcome),
            Msg::LiveDelta { job, text } => self.on_live_delta(job, &text),
            Msg::LiveDone {
                job,
                outcome,
                finished,
            } => self.on_live_done(job, outcome, finished),
            Msg::MtGone => {
                log::error!("luồng dịch dừng bất thường");
                self.jobs = None;
                self.live_flight = None;
```

Thay **toàn bộ hàm `dispatch`** (từ `fn dispatch(&mut self) {` tới dấu `}` đóng hàm, ngay trước `fn on_mt_done`) bằng:

```rust
    fn dispatch(&mut self) {
        while self.in_flight.is_none() && !self.quota_hit && !self.abandoned {
            let item = match self.queue.pop(self.now_ms) {
                None => return,
                Some(Ready::Translate(item)) if !self.mt_unavailable => item,
                Some(Ready::Translate(item)) => {
                    self.settle(item.sub_id, Status::Failed, String::new());
                    continue;
                }
                Some(Ready::Skip(item)) => {
                    self.settle(item.sub_id, Status::Skipped, String::new());
                    continue;
                }
            };
            let Some(state) = self.subs.get_mut(&item.sub_id) else {
                continue;
            };
            if state.version != item.version {
                continue; // mục cũ của một câu đã được ghép thêm: bản mới nằm ở mục khác của hàng
            }
            state.sub.status = Status::Translating;
            if state.held.is_none() {
                state.sub.tgt_text.clear();
            }
            self.sink.subtitle(&state.sub);
            // Việc của lượt cuối luôn đi trước (spec 2026-10-10 §4.6): bản tạm đang dịch dừng ngay, luồng dịch làm câu này
            // ngay sau đó.
            if let Some(f) = &self.live_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            let cancel = Arc::new(AtomicBool::new(false));
            let job = MtJob {
                sub_id: item.sub_id,
                version: item.version,
                src: Lang::from_code(&item.lang).unwrap_or(Lang::En),
                text: item.text,
                context: item.context,
                cancel: cancel.clone(),
            };
            self.in_flight = Some(InFlight {
                sub_id: item.sub_id,
                version: item.version,
                cancel,
            });
            let sent = self.jobs.as_ref().is_some_and(|j| j.send(Work::Final(job)).is_ok());
            if !sent {
                self.in_flight = None;
                self.set_mt_unavailable();
                self.settle(item.sub_id, Status::Failed, String::new());
            }
        }
    }
```

Thay **toàn bộ hàm `on_partial`** (Task 11) bằng:

```rust
    /// Một lần chép từng phần có kết quả (spec 2026-10-10 §4.1–§4.3): cập nhật dòng đang nói của đoạn, rồi xin dịch lần chép
    /// này (yêu cầu mới thắng, §4.6). Bỏ khi bị lọc, khi lượt cuối của đoạn đã có, khi chế độ đã tự tắt, khi đang dừng, hết
    /// hạn mức hay hết hạn dừng.
    fn on_partial(&mut self, p: PartialText) {
        self.metrics.partials += 1;
        self.metrics.partial_asr_ms.push(p.asr_ms);
        let late = self.last_final_seg.is_some_and(|last| p.seg <= last);
        if late
            || self.flags.streaming.auto_off.load(Ordering::SeqCst)
            || self.hurry_since.is_some()
            || self.quota_hit
            || self.abandoned
        {
            return;
        }
        let Some(text) = p.text else { return };
        let streaming = &self.cfg.pipeline.streaming;
        let holdback = if uses_char_units(&p.lang) {
            streaming.src_holdback_chars
        } else {
            streaming.src_holdback_words
        };
        let agree = streaming.agree_for(&p.lang);
        let target = self.cfg.target.code();
        let id = self.cfg.id_base + p.seg;
        let live = self
            .lives
            .entry(p.seg)
            .or_insert_with(|| Live::new(id, &p.lang, holdback, target, agree));
        if live.frozen {
            return;
        }
        if live.line.src_lang != p.lang {
            // Ngôn ngữ chỉ đổi được khi lần chép trước bị lọc (QĐ8): bắt đầu lại dòng với ngôn ngữ mới.
            *live = Live::new(id, &p.lang, holdback, target, agree);
        }
        live.gen += 1;
        live.src_split = live.src.push(&text);
        live.text = text;
        live.start_ms = p.start_ms;
        live.upto_ms = p.upto_ms;
        let (gen, same_lang) = (live.gen, live.same_lang());
        self.refresh_extends(p.seg);
        if !same_lang && !self.mt_unavailable {
            // Yêu cầu mới thắng (§4.6): hủy bản tạm đang dịch; lần chép mới nhất được gửi đi khi rảnh (`dispatch_live`).
            if let Some(f) = &self.live_flight {
                f.cancel.store(true, Ordering::SeqCst);
            }
            self.live_want = Some(LiveWant {
                seg: p.seg,
                gen,
                requested: p.requested,
            });
        }
        self.emit_live(p.seg, false);
    }
```

Thay **toàn bộ hàm `refresh_extends`** (Task 11) bằng:

```rust
    /// Xét lại phụ đề tạm mà dòng của đoạn `seg` nối tiếp (câu đang mở có thể đã chốt, hay vừa được ghép thêm đoạn trước).
    /// Đổi thì chữ nguồn đem dịch đã khác: phần dịch chốt lại từ đầu.
    fn refresh_extends(&mut self, seg: u64) {
        let Some(live) = self.lives.get(&seg).filter(|l| !l.frozen) else {
            return;
        };
        let extends = self.live_extends(live);
        if let Some(live) = self.lives.get_mut(&seg)
            && live.line.extends != extends
        {
            live.line.extends = extends;
            live.reset_target();
        }
    }
```

Thay **toàn bộ hàm `freeze_lives`** và **toàn bộ hàm `end_lives`** (Task 11) bằng:

```rust
    /// Kết quả nhận dạng lượt cuối của các đoạn `segs` vừa thành phụ đề `sub_id` (phụ đề mới, hay câu được ghép thêm): dòng
    /// đang nói của các đoạn đó đóng băng, được phát lại một lần với `extends` là phụ đề đó (`None` nếu đó chính là id của
    /// dòng), và chờ phụ đề đó chốt để gỡ (QĐ5). Bản tạm của các đoạn đó không còn cần. Gọi ngay sau upsert tạo ra phần chữ
    /// của các đoạn đó.
    fn freeze_lives(&mut self, segs: &[u64], sub_id: u64) {
        for &seg in segs {
            self.forget_live_work(seg);
            let Some(live) = self.lives.get_mut(&seg) else {
                continue;
            };
            live.frozen = true;
            live.line.extends = (live.line.id != sub_id).then_some(sub_id);
            self.live_waiting.entry(sub_id).or_default().push(seg);
            self.emit_live(seg, true);
        }
    }

    /// Gỡ dòng đang nói của các đoạn `segs`, nếu có (spec §4.5, §6.2); bản tạm của chúng không còn cần.
    fn end_lives(&mut self, segs: &[u64]) {
        for &seg in segs {
            self.forget_live_work(seg);
            if self.lives.remove(&seg).is_some() {
                self.sink.live_end(&LiveEnd {
                    id: self.cfg.id_base + seg,
                });
            }
        }
    }
```

rồi thay

```rust
    /// Gỡ mọi dòng đang nói (tự tắt, hết hạn mức, hết hạn dừng, luồng phụ đề kết thúc).
    fn end_all_lives(&mut self) {
        self.live_waiting.clear();
        let segs: Vec<u64> = self.lives.keys().copied().collect();
        self.end_lives(&segs);
    }
```

bằng

```rust
    /// Gỡ mọi dòng đang nói (tự tắt, hết hạn mức, hết hạn dừng, luồng phụ đề kết thúc).
    fn end_all_lives(&mut self) {
        self.live_waiting.clear();
        let segs: Vec<u64> = self.lives.keys().copied().collect();
        self.end_lives(&segs);
    }

    /// Đoạn `seg` không còn cần bản tạm: hủy bản tạm đang dịch của nó, bỏ yêu cầu đang chờ.
    fn forget_live_work(&mut self, seg: u64) {
        if let Some(f) = self.live_flight.as_ref().filter(|f| f.seg == seg) {
            f.cancel.store(true, Ordering::SeqCst);
        }
        if self.live_want.as_ref().is_some_and(|w| w.seg == seg) {
            self.live_want = None;
        }
    }

    /// Gửi bản tạm mới nhất đi dịch (spec 2026-10-10 §4.6): tối đa một bản tạm một lúc; chỉ khi không có việc của lượt cuối
    /// đang chạy hay đang chờ; không gửi khi dịch không khả dụng, đang dừng, hết hạn mức hay chế độ đã tự tắt.
    fn dispatch_live(&mut self) {
        if self.live_flight.is_some()
            || self.in_flight.is_some()
            || !self.queue.is_empty()
            || self.mt_unavailable
            || self.quota_hit
            || self.abandoned
            || self.hurry_since.is_some()
            || self.flags.streaming.auto_off.load(Ordering::SeqCst)
        {
            return;
        }
        let Some(want) = self.live_want.take() else { return };
        // Câu được nối tiếp có thể đã đổi từ lần chép đó (đã chốt, hay vừa được ghép thêm đoạn trước).
        self.refresh_extends(want.seg);
        let Some(live) = self
            .lives
            .get(&want.seg)
            .filter(|l| !l.frozen && !l.same_lang())
        else {
            return;
        };
        let lang = live.line.src_lang.clone();
        let extended = live.line.extends.and_then(|id| self.subs.get(&id));
        let text = match extended {
            Some(state) => format!(
                "{}{}{}",
                state.sub.src_text.trim_end(),
                joiner(&lang),
                live.text.trim()
            ),
            None => live.text.trim().to_string(),
        };
        // Ngữ cảnh như lượt cuối (cờ `translationContext`): của câu được nối tiếp, hay câu chốt gần nhất cùng ngôn ngữ.
        let context = match extended {
            Some(state) => state.context.clone(),
            None => self
                .cfg
                .translation_context
                .then(|| self.previous.get(&lang).cloned())
                .flatten(),
        };
        let prefill = Some(live.tgt.stable_text()).filter(|p| !p.is_empty());
        let src_units = split_units(&text, &lang).len() as u32;
        let extends = live.line.extends;
        self.live_jobs += 1;
        let cancel = Arc::new(AtomicBool::new(false));
        let job = LiveJob {
            job: self.live_jobs,
            src: Lang::from_code(&lang).unwrap_or(Lang::En),
            text,
            context,
            prefill,
            cancel: cancel.clone(),
        };
        if self.jobs.as_ref().is_some_and(|j| j.send(Work::Live(job)).is_ok()) {
            self.live_flight = Some(LiveFlight {
                job: self.live_jobs,
                seg: want.seg,
                gen: want.gen,
                extends,
                cancel,
                requested: want.requested,
                src_units,
            });
            self.clear_live_stream(want.seg);
        } else {
            self.set_mt_unavailable();
        }
    }

    /// Một gói của bản tạm đang dịch (QĐ7 của kế hoạch 02): bản mới chỉ thay chữ đang hiện khi phần đã nhận dài ít nhất bằng
    /// chữ đang hiện (đếm ký tự); từ đó hiện dần. Dấu kết câu ở cuối không hiện (§4.3).
    fn on_live_delta(&mut self, job: u64, text: &str) {
        let Some(flight) = self.live_flight.as_ref().filter(|f| f.job == job) else {
            return;
        };
        let (seg, src_units, extends) = (flight.seg, flight.src_units, flight.extends);
        let Some(live) = self
            .lives
            .get_mut(&seg)
            .filter(|l| !l.frozen && l.line.extends == extends)
        else {
            return;
        };
        live.streaming.push_str(text);
        let incoming = strip_terminal_punct(&live.streaming);
        let shown = live.line.tgt_stable.chars().count() + live.line.tgt_tail.chars().count();
        if !live.switched && incoming.chars().count() < shown {
            return;
        }
        let split = live.tgt.preview(incoming);
        live.switched = true;
        live.line.tgt_stable = split.stable;
        live.line.tgt_tail = split.tail;
        live.line.tgt_src_units = src_units;
        self.emit_live(seg, false);
    }

    /// Bản tạm kết thúc. Xong thì chốt phần dịch (LocalAgreement-n, §4.4), hiện, và tính một vòng cập nhật (§5); bị hủy hay
    /// lỗi thì giữ chữ đang hiện và không tính vòng (§7); bị hủy mà chưa có lần chép mới hơn thì dịch lại lần chép đó khi
    /// rảnh. Kết quả dịch theo câu nối tiếp cũ (đã đổi) không được hiện.
    fn on_live_done(&mut self, job: u64, outcome: Outcome, finished: Instant) {
        let Some(flight) = self.live_flight.take_if(|f| f.job == job) else {
            return;
        };
        let current = self
            .lives
            .get(&flight.seg)
            .is_some_and(|l| !l.frozen && l.line.extends == flight.extends);
        match outcome {
            Outcome::Done(t) => {
                if current && let Some(live) = self.lives.get_mut(&flight.seg) {
                    let split = live.tgt.push(strip_terminal_punct(&t.text));
                    live.line.tgt_stable = split.stable;
                    live.line.tgt_tail = split.tail;
                    live.line.tgt_src_units = flight.src_units;
                    live.streaming.clear();
                    live.switched = false;
                    self.emit_live(flight.seg, false);
                }
                // Vòng cập nhật: từ lúc luồng VAD tạo yêu cầu chép từng phần tới lúc bản tạm của nó xong (§5).
                let cycle_ms = finished.saturating_duration_since(flight.requested).as_secs_f32() * 1000.0;
                self.record_cycle(cycle_ms);
            }
            Outcome::Cancelled => {
                let latest = self.lives.get(&flight.seg).is_some_and(|l| l.gen == flight.gen);
                if current && latest && self.live_want.is_none() {
                    self.live_want = Some(LiveWant {
                        seg: flight.seg,
                        gen: flight.gen,
                        requested: flight.requested,
                    });
                }
                self.clear_live_stream(flight.seg);
            }
            Outcome::Failed { .. } => self.clear_live_stream(flight.seg),
            Outcome::Unavailable(reason) => {
                log::error!("llama-server không dùng được: {reason}");
                self.set_mt_unavailable();
                // Dòng đang nói chỉ hiện câu gốc (spec §7).
                let segs: Vec<u64> = self
                    .lives
                    .iter()
                    .filter(|(_, l)| !l.frozen)
                    .map(|(&seg, _)| seg)
                    .collect();
                for seg in segs {
                    if let Some(live) = self.lives.get_mut(&seg) {
                        live.reset_target();
                    }
                    self.emit_live(seg, false);
                }
            }
        }
    }

    /// Bỏ phần đang stream của bản tạm (không thành, hay vừa gửi bản mới), giữ chữ đang hiện (§7).
    fn clear_live_stream(&mut self, seg: u64) {
        if let Some(live) = self.lives.get_mut(&seg) {
            live.streaming.clear();
            live.switched = false;
        }
    }

    /// Một vòng cập nhật xong (spec §5): nhịp T mới cho luồng VAD, ghi số đo.
    fn record_cycle(&mut self, cycle_ms: f32) {
        self.cadence.record(cycle_ms);
        let cadence_ms = self.cadence.cadence_ms();
        self.flags.streaming.cadence_ms.store(cadence_ms, Ordering::SeqCst);
        self.metrics.live_cycle_ms.push(cycle_ms);
        self.metrics.cadence_ms.push(cadence_ms as f32);
    }
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected:
- 9 test mới đạt: `live_translations_are_stabilized_and_prefilled`, `a_streaming_live_translation_takes_over_once_it_is_as_long`, `final_translations_go_first`, `the_newest_partial_wins`, `a_failed_live_translation_keeps_the_shown_text`, `completed_cycles_set_the_cadence`, `a_live_job_for_an_extended_sentence_translates_the_joined_text`, `an_unavailable_server_leaves_live_lines_with_the_source_only`, `the_translation_thread_runs_live_jobs_with_the_prefill`;
- mọi test cũ đạt, kể cả các test của Task 11, 12 và hai test luồng dịch có sẵn;
- clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): dịch bản tạm của dòng đang nói, prefill và nhịp (spec 2026-10-10 §4.3–§4.6, §5)

Luồng dịch nhận Work::Final hay Work::Live; bản tạm chạy translate_live với prefill là phần dịch đã chốt. Luồng phụ đề
gửi tối đa một bản tạm, chỉ khi lượt cuối không còn việc, hủy nó khi có lần chép mới hơn hay việc lượt cuối; chốt phần
dịch theo LocalAgreement-n (n, k theo tiếng nguồn), bản đang stream chỉ thay chữ đang hiện khi đủ dài; mỗi vòng xong
cập nhật nhịp T cho luồng VAD.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---
## Task 14: Engine: tự tắt, dừng, hạn mức, hết hạn dừng

Spec §5, §6.2, §6.3, H6:
- **Tự tắt:** sau mỗi vòng, `Cadence::too_slow()` thì `turn_streaming_off`: bật `Streaming::auto_off` (luồng VAD thôi lên lịch ngay, ngưỡng trở về ngưỡng người dùng từ đoạn kế tiếp), `metrics.streaming_auto_off`, chỉ báo `streaming_unavailable`, `live_end` cho mọi dòng, hủy bản tạm; log chỉ có số;
- **Bấm Dừng** (lần đầu thấy `hurry`): hủy bản tạm, bỏ yêu cầu chờ; bản chép tới sau bị bỏ (đã có ở `on_partial`); các dòng còn lại được gỡ khi phụ đề cuối của chúng chốt trong hạn dừng, hay khi luồng phụ đề kết thúc (`finish`);
- **Hết hạn mức** (`hit_quota`) và **hết hạn dừng** (`abandon`): gỡ mọi dòng ngay.

**Files:**
- Modify: `crates/pipeline/src/engine.rs`: `record_cycle`, `check_flags`, `hit_quota`, `abandon`, hàm mới `turn_streaming_off`, `stop_live_work`; test

- [ ] **Step 1: Viết test**

`crates/pipeline/src/engine.rs`, trong `mod tests`: thay

```rust
    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

bằng

```rust
    /// Tự tắt (spec §5): đủ 8 vòng mà trung vị quá 1 300 ms thì chế độ này tắt tới hết phiên: cờ cho luồng VAD, chỉ báo, gỡ
    /// mọi dòng, bỏ bản chép tới sau, không gửi bản tạm nào nữa.
    #[test]
    fn slow_cycles_turn_the_mode_off_for_the_session() {
        let mut h = live_harness();
        for i in 0..8u64 {
            let text = format!("so we went {i}");
            h.partial(1, 0, 1_000 + i * 300, "en", Some(text.as_str()));
            let job = h.live_job();
            h.live_done(&job, done("chúng tôi"), 1_400);
        }
        assert!(h.flags.streaming.auto_off.load(Ordering::SeqCst));
        assert!(!h.flags.streaming.active());
        assert!(h.c.metrics.streaming_auto_off);
        assert!(
            h.sink
                .indicators
                .lock()
                .unwrap()
                .last()
                .unwrap()
                .streaming_unavailable
        );
        assert_eq!(h.live_ends(), [1]);
        let count = h.live_count();
        h.partial(2, 5_000, 6_000, "en", Some("new words"));
        assert_eq!(h.live_count(), count, "đã tự tắt: bỏ bản chép");
        h.nothing_sent();
    }

    /// Bấm Dừng: bản tạm đang dịch dừng, không gửi bản tạm mới, bỏ bản chép tới sau; dòng còn lại được gỡ khi luồng phụ đề
    /// kết thúc (§6.2).
    #[test]
    fn stopping_cancels_live_work_and_ends_the_lines_at_exit() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(!h.c.step());
        assert!(l1.cancel.load(Ordering::SeqCst));
        h.live_done(&l1, Outcome::Cancelled, 10);
        let count = h.live_count();
        h.partial(1, 0, 1_500, "en", Some("so we went"));
        assert_eq!(h.live_count(), count, "đang dừng: bỏ bản chép");
        h.nothing_sent();
        assert!(h.live_ends().is_empty());
        let Harness { c, sink, .. } = h;
        c.finish();
        assert_eq!(sink.live_ends.lock().unwrap().clone(), [1]);
    }

    /// Hết hạn mức: gỡ mọi dòng ngay, hủy bản tạm.
    #[test]
    fn reaching_the_quota_ends_every_live_line() {
        let mut h = live_harness();
        h.partial(1, 0, 1_000, "en", Some("so we"));
        let l1 = h.live_job();
        h.flags.quota.store(true, Ordering::SeqCst);
        h.c.step();
        assert!(l1.cancel.load(Ordering::SeqCst));
        assert_eq!(h.live_ends(), [1]);
        h.nothing_sent();
    }

    /// Hết hạn dừng: gỡ mọi dòng ngay.
    #[test]
    fn the_end_of_the_stop_grace_ends_every_live_line() {
        let mut config = cfg();
        config.streaming_enabled = true;
        config.pipeline.mt.stop_grace_ms = 0;
        let mut h = harness_with(config, Sink::default());
        h.partial(1, 0, 1_000, "en", Some("so we"));
        h.flags.hurry.store(true, Ordering::SeqCst);
        assert!(h.c.step(), "hết hạn: luồng phụ đề thoát");
        assert_eq!(h.live_ends(), [1]);
    }

    // ---- Luồng nhận dạng: chép từng phần (spec 2026-10-10 §4.1). ----
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib engine
```

Expected: 4 test mới `FAILED`: chế độ không tự tắt; bản tạm không bị hủy khi bấm Dừng; dòng không được gỡ khi hết hạn mức hay hết hạn dừng.

- [ ] **Step 3: Cài**

`crates/pipeline/src/engine.rs`: thay

```rust
    /// Một vòng cập nhật xong (spec §5): nhịp T mới cho luồng VAD, ghi số đo.
    fn record_cycle(&mut self, cycle_ms: f32) {
        self.cadence.record(cycle_ms);
        let cadence_ms = self.cadence.cadence_ms();
        self.flags.streaming.cadence_ms.store(cadence_ms, Ordering::SeqCst);
        self.metrics.live_cycle_ms.push(cycle_ms);
        self.metrics.cadence_ms.push(cadence_ms as f32);
    }
```

bằng

```rust
    /// Một vòng cập nhật xong (spec §5): nhịp T mới cho luồng VAD, ghi số đo; máy không theo kịp thì tự tắt.
    fn record_cycle(&mut self, cycle_ms: f32) {
        self.cadence.record(cycle_ms);
        let cadence_ms = self.cadence.cadence_ms();
        self.flags.streaming.cadence_ms.store(cadence_ms, Ordering::SeqCst);
        self.metrics.live_cycle_ms.push(cycle_ms);
        self.metrics.cadence_ms.push(cadence_ms as f32);
        if self.cadence.too_slow() && !self.flags.streaming.auto_off.load(Ordering::SeqCst) {
            self.turn_streaming_off();
        }
    }

    /// Máy không theo kịp (spec §5): chế độ này tắt tới hết phiên. Luồng VAD thấy cờ ngay (thôi chép từng phần) và trở về
    /// ngưỡng người dùng từ đoạn kế tiếp; mọi dòng đang nói được gỡ; chỉ báo "dịch sau mỗi câu" bật (§6.3). Log chỉ có số.
    fn turn_streaming_off(&mut self) {
        self.flags.streaming.auto_off.store(true, Ordering::SeqCst);
        self.metrics.streaming_auto_off = true;
        log::warn!(
            "dịch trong lúc nói tự tắt tới hết phiên: {} vòng cập nhật, nhịp {} ms",
            self.metrics.live_cycle_ms.len(),
            self.cadence.cadence_ms()
        );
        self.stop_live_work();
        self.end_all_lives();
        if !self.indicators.streaming_unavailable {
            self.indicators.streaming_unavailable = true;
            self.sink.indicators(&self.indicators);
        }
    }

    /// Thôi dịch bản tạm: hủy bản đang dịch, bỏ yêu cầu chờ.
    fn stop_live_work(&mut self) {
        if let Some(f) = &self.live_flight {
            f.cancel.store(true, Ordering::SeqCst);
        }
        self.live_want = None;
    }
```

thay

```rust
        if self.flags.hurry.load(Ordering::SeqCst) && self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
        }
```

bằng

```rust
        if self.flags.hurry.load(Ordering::SeqCst) && self.hurry_since.is_none() {
            self.hurry_since = Some(Instant::now());
            // Bấm Dừng: thôi dịch bản tạm (spec 2026-10-10 §6.2). Dòng đang nói còn lại được gỡ khi phụ đề cuối của nó chốt
            // trong hạn dừng, hay khi luồng phụ đề kết thúc.
            self.stop_live_work();
        }
```

trong `hit_quota`, thay

```rust
        self.asr_queue.clear();
        self.pending.clear();
        self.finish_open();
```

bằng

```rust
        self.asr_queue.clear();
        self.pending.clear();
        self.finish_open();
        self.stop_live_work();
        self.end_all_lives();
```

và trong `abandon`, thay

```rust
    fn abandon(&mut self) {
        self.abandoned = true;
```

bằng

```rust
    fn abandon(&mut self) {
        self.abandoned = true;
        self.stop_live_work();
        self.end_all_lives();
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: 4 test mới đạt; mọi test cũ đạt; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): tự tắt khi máy không theo kịp; dừng, hết hạn mức gỡ dòng đang nói (spec 2026-10-10 §5, §6.2)

Trung vị 8 vòng cập nhật quá 1300 ms thì chế độ này tắt tới hết phiên: luồng VAD thôi chép từng phần, mọi dòng đang nói
được gỡ, chỉ báo streamingUnavailable bật. Bấm Dừng thì thôi dịch bản tạm; hết hạn mức hay hết hạn dừng thì gỡ mọi dòng.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng một file.

---

## Task 15: Test tích hợp với tiến trình phụ giả

Spec §11, "Engine": engine đầy đủ qua `SidecarManager` của app, với `fake_asr_worker` và `fake_llama_server`. Server giả đã stream lại prefill (Task 8). Worker giả thêm lệnh kịch bản `words_per_sec:<n>`: chữ trả về là `n` từ mỗi giây âm thanh của yêu cầu (ít nhất 1), lấy từ đầu dòng của `FAKE_ASR_TEXTS`, nên lần chép từng phần (âm thanh ngắn hơn) ra phần đầu của câu, lượt cuối ra gần đủ câu.

Âm thanh phát đúng thời gian thực (giờ âm thanh của nhịp T và giờ thật của vòng cập nhật phải cùng tốc độ), nên test chạy khoảng 7 giây.

**Files:**
- Modify: `crates/pipeline/src/bin/fake_asr_worker.rs` (doc đầu file; `Plan`; `parse`; nhánh `Transcribe`)
- Create: `crates/pipeline/tests/streaming.rs`

- [ ] **Step 1: Viết test**

Tạo `crates/pipeline/tests/streaming.rs`:

```rust
//! Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §11, "Engine"): engine đầy đủ qua đúng `SidecarManager` của app, với
//! `fake_asr_worker` (chữ dài dần theo âm thanh, `words_per_sec`) và `fake_llama_server` (stream lại phần prefill như
//! `llama-server` b11146). Kiểm: có lần chép từng phần; dòng đang nói có bản dịch và phần dịch ổn định; có bản tạm gửi kèm
//! prefill mà chữ hiện không lặp phần prefill; phụ đề cuối chốt rồi mới có `live_end`; log không có chữ nào.

use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{EnergyVad, Engine, EngineConfig, EventSink, Fatal, Indicators, SampleSource, VadFactory};
use pipeline::prompt::Lang;
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Status, Subtitle};
use pipeline::supervisor::{AsrSpec, LlamaSpec, NoEvents, SidecarManager, SidecarSpec, SystemClock};
use std::path::PathBuf;
use std::sync::{Arc, Mutex, Once};
use std::time::Duration;

const FAKE_ASR: &str = env!("CARGO_BIN_EXE_fake_asr_worker");
const FAKE_LLAMA: &str = env!("CARGO_BIN_EXE_fake_llama_server");
const RATE: usize = 16_000;

/// Log của cả tiến trình test, để kiểm log không chứa chữ chép hay chữ dịch, kể cả bản tạm.
struct CaptureLog(Mutex<Vec<String>>);

impl log::Log for CaptureLog {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        self.0.lock().unwrap().push(format!("{}", record.args()));
    }

    fn flush(&self) {}
}

static LOG: CaptureLog = CaptureLog(Mutex::new(Vec::new()));

fn capture_log() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        log::set_logger(&LOG).unwrap();
        log::set_max_level(log::LevelFilter::Trace);
    });
}

#[derive(Debug, Clone)]
enum Ev {
    Upsert(Subtitle),
    Live(LiveLine),
    End(u64),
    Indicators(Indicators),
    Fatal(Fatal, String),
}

#[derive(Default)]
struct Recorder {
    events: Mutex<Vec<Ev>>,
}

impl EventSink for Recorder {
    fn subtitle(&self, s: &Subtitle) {
        self.events.lock().unwrap().push(Ev::Upsert(s.clone()));
    }
    fn delta(&self, _: &Delta) {}
    fn level(&self, _: f32) {}
    fn indicators(&self, i: &Indicators) {
        self.events.lock().unwrap().push(Ev::Indicators(i.clone()));
    }
    fn fatal(&self, kind: Fatal, reason: &str) {
        self.events.lock().unwrap().push(Ev::Fatal(kind, reason.to_string()));
    }
    fn live(&self, l: &LiveLine) {
        self.events.lock().unwrap().push(Ev::Live(l.clone()));
    }
    fn live_end(&self, e: &LiveEnd) {
        self.events.lock().unwrap().push(Ev::End(e.id));
    }
}

struct Temp(PathBuf);

impl Temp {
    fn new(name: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("pipeline-streaming-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        Self(dir)
    }

    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Temp {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Âm thanh tổng hợp: (có tiếng hay không, ms). Tiếng là sóng sin 440 Hz biên độ 0,3.
fn audio(parts: &[(bool, usize)]) -> Vec<f32> {
    let mut out = Vec::new();
    for &(tone, ms) in parts {
        for _ in 0..ms * RATE / 1000 {
            let t = out.len() as f32 / RATE as f32;
            out.push(if tone {
                0.3 * (2.0 * std::f32::consts::PI * 440.0 * t).sin()
            } else {
                0.0
            });
        }
    }
    out
}

fn manager(t: &Temp) -> Arc<SidecarManager> {
    std::fs::write(
        t.path("texts"),
        "en\tone two three four five six seven eight nine ten eleven twelve",
    )
    .unwrap();
    std::fs::write(t.path("asr-plan"), "words_per_sec:2").unwrap();
    let spec = SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(PathBuf::from(FAKE_ASR)),
            exe_cpu: PathBuf::from(FAKE_ASR),
            model: PathBuf::from("/models/asr.bin"),
            log: t.path("logs/asr-worker.log"),
            first_run: false,
            require_shared: true,
            env: vec![
                ("FAKE_ASR_TEXTS".into(), t.path("texts").display().to_string()),
                ("FAKE_ASR_PLAN".into(), t.path("asr-plan").display().to_string()),
                ("FAKE_ASR_LOG".into(), t.path("asr-events").display().to_string()),
            ],
        },
        llama: LlamaSpec {
            exe: PathBuf::from(FAKE_LLAMA),
            model: PathBuf::from("/models/mt.gguf"),
            log: t.path("logs/llama-server.log"),
            extra_args: Vec::new(),
            first_run: false,
            env: vec![("FAKE_LLAMA_LOG".into(), t.path("llama-events").display().to_string())],
        },
        supervisor: SupervisorConfig {
            ready_timeout_ms: 10_000,
            shutdown_grace_ms: 1_000,
            ..SupervisorConfig::default()
        },
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    };
    SidecarManager::new(spec, Arc::new(SystemClock::default()), Arc::new(NoEvents))
}

#[test]
fn partials_become_live_lines_with_a_prefill_and_the_final_replaces_them() {
    capture_log();
    let t = Temp::new("live");
    let manager = manager(&t);
    manager.ensure_started().unwrap();
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = 50;
    // Đặt rõ, không dựa vào mặc định (Task 21 đổi mặc định theo quyết định ở cổng).
    pipeline.streaming.end_silence_ms = 400;
    pipeline.queue.lag_warn_ms = 600_000;
    let config = EngineConfig {
        pipeline,
        languages: vec!["en".into()],
        target: Lang::Vi,
        translation_context: false,
        id_base: 1_000,
        glossary: Default::default(),
        streaming_supported: true,
        streaming_enabled: true,
    };
    // 0,5 giây im lặng, 4,5 giây tiếng, 1,5 giây im lặng, phát đúng thời gian thực: một đoạn (id 0), ngưỡng đóng đoạn là
    // max(50, 400) = 400 ms.
    let samples = audio(&[(false, 500), (true, 4_500), (false, 1_500)]);
    let source = Box::new(SampleSource::new(samples, 512, Duration::from_millis(32)));
    let vad: VadFactory = Box::new(|| Ok(Box::new(EnergyVad { threshold_rms: 0.01 }) as _));
    let sink = Arc::new(Recorder::default());
    let engine = Engine::start(
        config,
        source,
        vad,
        Box::new(manager.asr()),
        Box::new(manager.mt()),
        sink.clone(),
    )
    .unwrap();
    let metrics = engine.join();
    let events = sink.events.lock().unwrap().clone();
    assert!(!events.iter().any(|e| matches!(e, Ev::Fatal(..))), "{events:?}");
    assert!(
        !events.iter().any(|e| matches!(e, Ev::Indicators(i) if i.streaming_unavailable)),
        "máy đủ sức, không tự tắt"
    );
    assert!(metrics.partials >= 2, "{}", metrics.summary());
    let asr_events = std::fs::read_to_string(t.path("asr-events")).unwrap();
    assert!(
        asr_events.lines().filter(|l| l.starts_with("transcribe 0 ")).count() >= 3,
        "các lần chép từng phần và lượt cuối cùng mang id 0:\n{asr_events}"
    );

    let id = 1_000;
    let lives: Vec<&LiveLine> = events
        .iter()
        .filter_map(|e| match e {
            Ev::Live(l) if l.id == id => Some(l),
            _ => None,
        })
        .collect();
    assert!(lives.iter().any(|l| !l.tgt_stable.is_empty()), "có phần dịch ổn định: {lives:?}");
    // Bản dịch giả là "VI: <chữ nguồn>". Có prefill thì server giả stream lại nó trước: chữ hiện vẫn bắt đầu đúng một lần
    // bằng "VI: one" (client coi chữ stream về là cả bản dịch).
    for l in &lives {
        let tgt = format!("{}{}", l.tgt_stable, l.tgt_tail);
        assert!(
            tgt.is_empty() || (tgt.starts_with("VI: one") && tgt.matches("VI:").count() == 1),
            "{tgt:?}"
        );
        assert!(format!("{}{}", l.src_stable, l.src_tail).starts_with("one"), "{l:?}");
    }
    let llama_events = std::fs::read_to_string(t.path("llama-events")).unwrap();
    assert!(
        llama_events.lines().any(|l| l.contains(" prefill=")),
        "có bản tạm gửi kèm prefill:\n{llama_events}"
    );

    // Phụ đề cuối chốt rồi mới gỡ dòng đang nói; sau đó không còn phát dòng đó.
    let done_at = events
        .iter()
        .position(|e| matches!(e, Ev::Upsert(s) if s.id == id && s.status == Status::Done))
        .expect("phụ đề cuối phải dịch xong");
    let end_at = events
        .iter()
        .position(|e| matches!(e, Ev::End(i) if *i == id))
        .expect("phải gỡ dòng đang nói");
    assert!(done_at < end_at, "{events:?}");
    assert!(!events[end_at..].iter().any(|e| matches!(e, Ev::Live(l) if l.id == id)));
    let Ev::Upsert(fin) = &events[done_at] else {
        unreachable!()
    };
    assert!(fin.tgt_text.starts_with("VI: one"), "{fin:?}");

    // Log của cả phiên không có chữ chép lời hay bản dịch nào, kể cả bản tạm.
    let log = LOG.0.lock().unwrap().join("\n");
    for secret in ["three", "seven", "VI: one"] {
        assert!(!log.contains(secret), "log lộ \"{secret}\":\n{log}");
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --test streaming
```

Expected: worker giả dừng vì kịch bản lạ (`panicked at … lệnh kịch bản lạ: words_per_sec`), nên `ensure_started` hay lần chép đầu lỗi và test `FAILED`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/bin/fake_asr_worker.rs`: thay

```rust
//!   - `load_delay_ms:<ms>`: chờ chừng này trước khi trả lời `Load` (nạp model chậm, như lần đầu chạy trên macOS).
```

bằng

```rust
//!   - `load_delay_ms:<ms>`: chờ chừng này trước khi trả lời `Load` (nạp model chậm, như lần đầu chạy trên macOS);
//!   - `words_per_sec:<n>`: chữ trả về chỉ gồm `n` từ đầu của dòng mỗi giây âm thanh của yêu cầu (ít nhất 1 từ), như bản
//!     chép từng phần của một đoạn đang mở (spec 2026-10-10 §4.1).
```

thay

```rust
    error_kind: ErrorKind,
    load_delay_ms: u64,
}
```

bằng

```rust
    error_kind: ErrorKind,
    load_delay_ms: u64,
    words_per_sec: Option<f32>,
}
```

thay

```rust
        error_kind: ErrorKind::Internal,
        load_delay_ms: 0,
    };
```

bằng

```rust
        error_kind: ErrorKind::Internal,
        load_delay_ms: 0,
        words_per_sec: None,
    };
```

thay

```rust
            "load_delay_ms" => plan.load_delay_ms = value.parse().expect("số ms"),
```

bằng

```rust
            "load_delay_ms" => plan.load_delay_ms = value.parse().expect("số ms"),
            "words_per_sec" => plan.words_per_sec = Some(value.parse().expect("số từ mỗi giây")),
```

và thay

```rust
                    let tokens: Vec<i32> = (1..=text.split_whitespace().count() as i32).collect();
```

bằng

```rust
                    // Chữ dài theo âm thanh: lần chép từng phần (âm thanh ngắn hơn) ra phần đầu của câu.
                    let text = match plan.words_per_sec {
                        Some(rate) => {
                            let seconds = req.pcm.len() as f32 / 16_000.0;
                            let n = ((seconds * rate) as usize).max(1);
                            text.split_whitespace().take(n).collect::<Vec<_>>().join(" ")
                        }
                        None => text,
                    };
                    let tokens: Vec<i32> = (1..=text.split_whitespace().count() as i32).collect();
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --test streaming
cargo test --locked -p pipeline
cargo clippy --locked -p pipeline --all-targets -- -D warnings
cargo fmt -p pipeline -- --check
```

Expected: `partials_become_live_lines_with_a_prefill_and_the_final_replaces_them … ok` (khoảng 7–10 giây); mọi test của crate đạt; clippy và fmt sạch.

Nếu test đỏ ở `có bản tạm gửi kèm prefill`: xem `llama-events` trong thông báo lỗi. Cần ít nhất hai bản tạm xong liền nhau trùng phần đầu để có phần dịch ổn định; nếu chỉ có một hai dòng `chat`, đọc `asr-events` để xem luồng VAD có gửi đủ lần chép từng phần không (nhịp T, `min_partial_speech_ms`). Không nới điều kiện của test.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/bin/fake_asr_worker.rs crates/pipeline/tests/streaming.rs
git -C "$W" commit -m "$(cat <<'EOF'
test(pipeline): engine đầy đủ với tiến trình phụ giả ở chế độ dịch trong lúc nói (spec 2026-10-10 §11)

Worker giả trả chữ dài theo âm thanh (words_per_sec), server giả stream lại prefill như b11146: kiểm có lần chép từng
phần, dòng đang nói có phần dịch ổn định và prefill mà không lặp chữ, phụ đề cuối chốt rồi mới live_end, log không có chữ.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng hai file.

---
## Task 16: `latency-bench session`: cờ streaming, sự kiện mới

H7, H9 (phần của kế hoạch 02), theo đúng code của kế hoạch 01:
- `SessionArgs` thêm `--streaming` (bật `streaming_supported` và `streaming_enabled`), `--streaming-end-silence-ms N` (50–2000; mặc định `StreamingConfig::default()`), `--tgt-agree en:2:1,zh:2:2` (thay mục cùng tiếng của `streaming.tgt_agree`, tiếng chưa có thì thêm). Cấu hình `streaming` sau đó phải hợp lệ theo `validate` (chỉ xét phần `streaming`, vì ngưỡng người dùng 50 ms của app nằm ngoài khoảng manifest của `segmenter.end_silence_ms`).
- `Recorded` thêm `Live(LiveLine)` và `LiveEnd(LiveEnd)` (JSON `kind`: `live`, `live_end`); `Recorder` ghi hai sự kiện này.
- `summary`: `partials` = số lần chép từng phần có kết quả; `cadence_p50_ms` = p50 của nhịp T sau mỗi vòng; `streaming_auto_off` = 1 nếu đã tự tắt, 0 nếu không, `null` khi không chạy `--streaming`.
- `run` (số đo thêm) có `live_lines`, `final_units`, `stable_changed_units` (tử và mẫu của `stable_flicker_ratio`, để gộp nhiều session ở Task 17).
- `args` của file JSON ghi ba cờ mới (giá trị hiệu lực của ngưỡng).

`Replay::new` tạm bỏ qua hai sự kiện mới; Task 17 dùng chúng.

**Files:**
- Modify: `crates/latency-bench/src/session_metrics.rs` (import; `Recorded`; test `events_serialize_with_their_kind`)
- Modify: `crates/latency-bench/src/session_replay.rs` (`Replay::new`)
- Modify: `crates/latency-bench/src/session.rs` (import; `SessionArgs`; `Recorder`; hàm mới `parse_tgt_agree`, `apply_streaming`; `args_map`; `RunInfo`; `run`; test)

- [ ] **Step 1: Viết test**

`crates/latency-bench/src/session.rs`, trong `mod tests`: thay

```rust
    #[test]
    fn the_paced_source_releases_one_frame_every_32_ms() {
```

bằng

```rust
    /// `--tgt-agree en:3:1,zh:2:2` (kế hoạch 02, H9).
    #[test]
    fn tgt_agree_is_parsed_per_language() {
        assert_eq!(
            parse_tgt_agree("en:3:1, zh:2:2").unwrap(),
            [
                LangAgree {
                    lang: "en".into(),
                    n: 3,
                    k: 1
                },
                LangAgree {
                    lang: "zh".into(),
                    n: 2,
                    k: 2
                }
            ]
        );
        assert!(parse_tgt_agree("en:3").is_err());
        assert!(parse_tgt_agree("en:x:1").is_err());
        assert!(parse_tgt_agree("").unwrap().is_empty());
    }

    /// Ba cờ của chế độ dịch trong lúc nói đặt `PipelineConfig.streaming`; ngưỡng người dùng giữ nguyên; giá trị vô lý bị từ
    /// chối; không có cờ thì cấu hình mặc định.
    #[test]
    fn the_streaming_flags_set_the_streaming_config() {
        let a = args(&[
            "--streaming",
            "--streaming-end-silence-ms",
            "200",
            "--tgt-agree",
            "ja:3:3,fr:2:0",
        ]);
        assert!(a.streaming);
        let mut p = PipelineConfig::default();
        p.segmenter.end_silence_ms = a.end_silence_ms;
        apply_streaming(&a, &mut p).unwrap();
        assert_eq!(p.streaming.end_silence_ms, 200);
        assert_eq!(
            (
                p.streaming.agree_for("ja"),
                p.streaming.agree_for("fr"),
                p.streaming.agree_for("en")
            ),
            ((3, 3), (2, 0), (2, 1))
        );
        assert_eq!(p.segmenter.end_silence_ms, 50, "ngưỡng người dùng giữ nguyên");
        let bad = args(&["--tgt-agree", "en:9:1"]);
        assert!(
            apply_streaming(&bad, &mut PipelineConfig::default()).is_err(),
            "n ngoài 2..=5"
        );
        let plain = args(&[]);
        assert!(!plain.streaming);
        let mut p = PipelineConfig::default();
        apply_streaming(&plain, &mut p).unwrap();
        assert_eq!(p.streaming, StreamingConfig::default());
    }

    #[test]
    fn the_recorder_keeps_live_events() {
        let recorder = Recorder::new(Instant::now());
        recorder.live(&LiveLine {
            id: 4,
            tgt_tail: "chúng tôi".into(),
            ..LiveLine::default()
        });
        recorder.live_end(&LiveEnd { id: 4 });
        let (events, _) = recorder.take();
        let json = serde_json::to_value(&events).unwrap();
        assert_eq!(
            (
                json[0]["kind"].as_str(),
                json[0]["id"].as_u64(),
                json[0]["tgt_tail"].as_str()
            ),
            (Some("live"), Some(4), Some("chúng tôi"))
        );
        assert_eq!(
            (json[1]["kind"].as_str(), json[1]["id"].as_u64()),
            (Some("live_end"), Some(4))
        );
    }

    #[test]
    fn the_paced_source_releases_one_frame_every_32_ms() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench session
```

Expected: lỗi biên dịch `cannot find function parse_tgt_agree`, `no field streaming on type SessionArgs`, `no variant Live`…

- [ ] **Step 3: Cài**

`crates/latency-bench/src/session_metrics.rs`: thay

```rust
use pipeline::subtitle::{Delta, Status, Subtitle};
```

bằng

```rust
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Status, Subtitle};
```

và thay

```rust
    /// Chỉ báo của thanh phụ đề (`app://status`).
    Indicators(Indicators),
}
```

bằng

```rust
    /// Chỉ báo của thanh phụ đề (`app://status`).
    Indicators(Indicators),
    /// `subtitle://live`: dòng đang nói (kế hoạch 02).
    Live(LiveLine),
    /// `subtitle://live-end`: gỡ dòng đang nói (kế hoạch 02).
    LiveEnd(LiveEnd),
}
```

`crates/latency-bench/src/session_replay.rs`, trong `Replay::new`: thay

```rust
                Recorded::Indicators(_) => {}
```

bằng

```rust
                // Dòng đang nói: Task 17 của kế hoạch 02 dùng hai sự kiện này.
                Recorded::Indicators(_) | Recorded::Live(_) | Recorded::LiveEnd(_) => {}
```

`crates/latency-bench/src/session.rs`: thay

```rust
use crate::session_metrics::{Recorded, Summary, Timed, UtteranceResult, evaluate, ms, ratio4, summarize};
```

bằng

```rust
use crate::session_metrics::{Recorded, Summary, Timed, UtteranceResult, evaluate, ms, ratio4, summarize};
use crate::session_replay::Replay;
```

thay

```rust
use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
```

bằng

```rust
use pipeline::config::{AsrConfig, LangAgree, MtConfig, PipelineConfig, StreamingConfig, SupervisorConfig};
```

thay

```rust
use pipeline::subtitle::{Delta, Subtitle};
```

bằng

```rust
use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Subtitle};
```

thay

```rust
use std::collections::{BTreeMap, HashMap};
```

bằng

```rust
use std::collections::{BTreeMap, BTreeSet, HashMap};
```

thay

```rust
    /// Ngưỡng im lặng đóng đoạn (`vadEndSilenceMs`; mặc định của app là 50 ms).
    #[arg(long, default_value_t = 50)]
    pub end_silence_ms: u64,
```

bằng

```rust
    /// Ngưỡng im lặng đóng đoạn (`vadEndSilenceMs`; mặc định của app là 50 ms).
    #[arg(long, default_value_t = 50)]
    pub end_silence_ms: u64,
    /// Bật chế độ dịch trong lúc nói (kế hoạch 02): `streaming_supported` và `streaming_enabled` của engine.
    #[arg(long)]
    pub streaming: bool,
    /// `streaming.end_silence_ms` (spec 2026-10-10 §4.7); mặc định theo `StreamingConfig::default()`.
    #[arg(long, value_parser = clap::value_parser!(u64).range(50..=2000))]
    pub streaming_end_silence_ms: Option<u64>,
    /// (n, k) theo tiếng nguồn, dạng `en:2:1,zh:2:2`: thay mục cùng tiếng của `streaming.tgt_agree` (spec §4.4).
    #[arg(long)]
    pub tgt_agree: Option<String>,
```

thay

```rust
    fn indicators(&self, indicators: &Indicators) {
        self.push(Recorded::Indicators(indicators.clone()));
    }
```

bằng

```rust
    fn indicators(&self, indicators: &Indicators) {
        self.push(Recorded::Indicators(indicators.clone()));
    }

    fn live(&self, line: &LiveLine) {
        self.push(Recorded::Live(line.clone()));
    }

    fn live_end(&self, end: &LiveEnd) {
        self.push(Recorded::LiveEnd(*end));
    }
```

thay

```rust
fn vad_model() -> PathBuf {
```

bằng

```rust
/// `--tgt-agree en:2:1,zh:2:2` thành các `LangAgree` (spec 2026-10-10 §4.4).
fn parse_tgt_agree(text: &str) -> Result<Vec<LangAgree>> {
    text.split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(|item| {
            let parts: Vec<&str> = item.split(':').collect();
            let &[lang, n, k] = parts.as_slice() else {
                bail!("--tgt-agree: \"{item}\" phải có dạng <tiếng>:<n>:<k>");
            };
            Ok(LangAgree {
                lang: lang.to_string(),
                n: n.parse().with_context(|| format!("--tgt-agree: n của \"{item}\""))?,
                k: k.parse().with_context(|| format!("--tgt-agree: k của \"{item}\""))?,
            })
        })
        .collect()
}

/// Cấu hình của chế độ dịch trong lúc nói theo các cờ (kế hoạch 02, H9): ngưỡng ngắt câu riêng và (n, k) theo tiếng. Phần
/// `streaming` sau đó phải hợp lệ như khi nạp từ manifest; chỉ xét phần này, vì ngưỡng người dùng 50 ms của app nằm ngoài
/// khoảng manifest của `segmenter.end_silence_ms`.
fn apply_streaming(args: &SessionArgs, pipeline: &mut PipelineConfig) -> Result<()> {
    if let Some(ms) = args.streaming_end_silence_ms {
        pipeline.streaming.end_silence_ms = ms;
    }
    if let Some(text) = &args.tgt_agree {
        for agree in parse_tgt_agree(text)? {
            match pipeline.streaming.tgt_agree.iter_mut().find(|a| a.lang == agree.lang) {
                Some(slot) => *slot = agree,
                None => pipeline.streaming.tgt_agree.push(agree),
            }
        }
    }
    let probe = PipelineConfig {
        streaming: pipeline.streaming.clone(),
        ..PipelineConfig::default()
    };
    probe
        .validate()
        .map_err(|key| anyhow!("cấu hình dịch trong lúc nói không hợp lệ: {key}"))
}

fn vad_model() -> PathBuf {
```

thay

```rust
        ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
    ])
}
```

bằng

```rust
        ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
        ("streaming".to_string(), args.streaming.to_string()),
        (
            "streaming_end_silence_ms".to_string(),
            args.streaming_end_silence_ms
                .unwrap_or(StreamingConfig::default().end_silence_ms)
                .to_string(),
        ),
        (
            "tgt_agree".to_string(),
            args.tgt_agree.clone().unwrap_or_else(|| "mặc định".into()),
        ),
    ])
}
```

thay

```rust
    feed_lag_max_ms: f64,
    sidecar_restarts: usize,
}
```

bằng

```rust
    feed_lag_max_ms: f64,
    sidecar_restarts: usize,
    /// Chế độ dịch trong lúc nói (kế hoạch 02): số dòng đang nói khác nhau; số đơn vị của mọi bản dịch cuối và số đơn vị phần
    /// dịch ổn định mà bản cuối thay đổi (mẫu và tử của `stable_flicker_ratio`, để gộp nhiều session).
    live_lines: usize,
    final_units: usize,
    stable_changed_units: usize,
}
```

thay

```rust
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = args.end_silence_ms;
    let config = EngineConfig {
        pipeline,
        languages: args.languages.clone(),
        target,
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
        // Cờ `--streaming` (Task 16 của kế hoạch 02) nối hai trường này.
        streaming_supported: false,
        streaming_enabled: false,
    };
```

bằng

```rust
    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = args.end_silence_ms;
    apply_streaming(&args, &mut pipeline)?;
    let config = EngineConfig {
        pipeline,
        languages: args.languages.clone(),
        target,
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
        // `--streaming`: máy coi như đủ sức, công tắc bật (kế hoạch 02); không có cờ thì chạy đúng chế độ thường.
        streaming_supported: args.streaming,
        streaming_enabled: args.streaming,
    };
```

thay

```rust
        feed_lag_max_ms: ms(lag_max.load(Ordering::Relaxed) as f64 / 1000.0),
        sidecar_restarts: sidecars.restarts(),
    };
```

bằng

```rust
        feed_lag_max_ms: ms(lag_max.load(Ordering::Relaxed) as f64 / 1000.0),
        sidecar_restarts: sidecars.restarts(),
        live_lines: events
            .iter()
            .filter_map(|e| match &e.ev {
                Recorded::Live(l) => Some(l.id),
                _ => None,
            })
            .collect::<BTreeSet<_>>()
            .len(),
        final_units: replay.final_translated_units(),
        stable_changed_units: replay.changed_stable_units(),
    };
```

thay

```rust
    let (events, fatal) = recorder.take();
    let utterances = evaluate(&truth, &events);
```

bằng

```rust
    let (events, fatal) = recorder.take();
    let utterances = evaluate(&truth, &events);
    let replay = Replay::new(&events);
```

và thay

```rust
    // Chế độ thường không chép từng phần; kế hoạch 02 điền ba khóa này khi bật chế độ dịch trong lúc nói.
    summary.partials = Some(0.0);
```

bằng

```rust
    // Chế độ dịch trong lúc nói (kế hoạch 02): số lần chép từng phần có kết quả, p50 của nhịp T, đã tự tắt chưa (chỉ khi
    // chạy `--streaming`).
    summary.partials = Some(metrics.partials as f64);
    summary.cadence_p50_ms = percentile(&metrics.cadence_ms, 50.0).map(|v| ms(f64::from(v)));
    summary.streaming_auto_off = args
        .streaming
        .then(|| f64::from(u8::from(metrics.streaming_auto_off)));
```

`crates/latency-bench/src/session_metrics.rs`, trong test `events_serialize_with_their_kind`: thay

```rust
        assert_eq!(json[2]["t_ms"].as_f64(), Some(2_700.0));
    }
```

bằng

```rust
        assert_eq!(json[2]["t_ms"].as_f64(), Some(2_700.0));
        let live = serde_json::to_value(Timed {
            t_ms: 1.0,
            ev: Recorded::LiveEnd(LiveEnd { id: 9 }),
        })
        .unwrap();
        assert_eq!(
            (live["kind"].as_str(), live["id"].as_u64()),
            (Some("live_end"), Some(9))
        );
    }
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench
cargo clippy --locked -p latency-bench --all-targets -- -D warnings
cargo fmt -p latency-bench -- --check
```

Expected: mọi test của `latency-bench` đạt, gồm `tgt_agree_is_parsed_per_language`, `the_streaming_flags_set_the_streaming_config`, `the_recorder_keeps_live_events`; clippy và fmt sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/latency-bench/src/session.rs crates/latency-bench/src/session_metrics.rs \
  crates/latency-bench/src/session_replay.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(latency-bench): cờ của chế độ dịch trong lúc nói cho lệnh session (H9)

--streaming, --streaming-end-silence-ms, --tgt-agree đặt cấu hình streaming của engine; sự kiện live và live_end được
ghi; summary có số lần chép từng phần, nhịp p50 và việc tự tắt; run có số dòng đang nói và tử, mẫu của độ nháy ổn định.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng ba file.

---
## Task 17: `latency-bench`: chỉ số của dòng đang nói; bảng mục tiêu §10.2

Spec §10.1 và QĐ10. `session_replay` dựng thêm lịch sử của từng dòng đang nói:
- **gắn dòng với phần chữ:** `just_created` là phần mà upsert ngay trước sự kiện đang xét tạo ra (delta và upsert không tạo phần thì xóa nó); một sự kiện `live` của dòng **đã có lần hiện trước đó**, có câu (`extends`, hay chính id) trùng phụ đề của phần đó, và phần đó chưa gắn với dòng nào, thì dòng gắn với phần đó. Đó đúng là lần phát lại lúc đóng băng (QĐ5): engine phát nó ngay sau upsert tạo phần chữ, và mọi bản chép từng phần của đoạn sau chỉ tới sau lượt cuối của đoạn này;
- **phủ:** ở một lần hiện, `tgt_src_units` đơn vị đầu của chữ nguồn đang hiện khớp tiền tố (theo khóa) của bản chép cuối của câu tới vị trí của từ;
- **tầng tạm** của từ = lúc sớm hơn giữa lần đầu được phủ (có chữ dịch) và `first_text_ms` của kế hoạch 01;
- **tầng ổn định** của từ thứ q trong câu S (chủ đầu tiên của phần) = lúc sớm hơn giữa lần đầu một dòng đang thay chỗ S có phần dịch ổn định ít nhất ⌈(q + 1) × đơn vị bản dịch cuối của S ÷ đơn vị bản chép cuối của S⌉ đơn vị, và `settled_ms` của kế hoạch 01;
- **từ đầu câu tới chữ dịch đầu** = lúc sớm hơn giữa cách tính của kế hoạch 01 và lần phủ sớm nhất của câu;
- **độ nháy tầng ổn định:** cộng thêm, với mỗi dòng, số đơn vị phần dịch ổn định cuối cùng không khớp tiền tố bản dịch cuối của câu mà dòng thay chỗ;
- **độ nháy tầng tạm:** cộng thêm số đơn vị bị rút lại giữa hai lần hiện liên tiếp của mỗi dòng, và lúc phụ đề cuối thay dòng (`live_end`).

Khi không có sự kiện `live` (chế độ thường), mọi số giữ đúng như kế hoạch 01: các test cũ không đổi.

`summarize_sessions.py --targets` in thêm bảng so mục tiêu §10.2 theo nhóm lượt chạy (✓/✗): trễ theo từ gộp theo tiếng nguồn; "đầu câu → chữ dịch" p90 gộp; độ nháy ổn định gộp theo đơn vị (`run.stable_changed_units` ÷ `run.final_units`); A2 và CPU lấy session tệ nhất.

**Files:**
- Modify: `crates/latency-bench/src/session_replay.rs` (import; struct mới `LiveObs`, `LiveTrack`; `Replay`; `Replay::new`; `upsert`; hàm mới; `retracted_units`, `changed_stable_units`; test)
- Modify: `crates/latency-bench/src/session_metrics.rs` (doc đầu file; `evaluate_replay`; hàm mới `earliest`; test)
- Modify: `bench/2026-10-10-do-tre/summarize_sessions.py`, `bench/2026-10-10-do-tre/test_session_tools.py`

- [ ] **Step 1: Viết test**

`crates/latency-bench/src/session_replay.rs`, trong `mod tests`: thay

```rust
    use super::*;
    use pipeline::subtitle::Delta;
```

bằng

```rust
    use super::*;
    use pipeline::subtitle::{Delta, LiveEnd};
```

và thay

```rust
    #[test]
    fn units_are_words_or_cjk_characters_without_punctuation() {
```

bằng

```rust
    /// Một dòng đang nói: chữ nguồn (ổn định, tạm), chữ dịch (ổn định, tạm), `tgt_src_units`.
    pub(crate) fn line(id: u64, extends: Option<u64>, src: (&str, &str), tgt: (&str, &str), units: u32) -> LiveLine {
        LiveLine {
            id,
            extends,
            src_lang: "en".into(),
            src_stable: src.0.into(),
            src_tail: src.1.into(),
            tgt_stable: tgt.0.into(),
            tgt_tail: tgt.1.into(),
            tgt_src_units: units,
        }
    }

    pub(crate) fn live(t_ms: f64, line: LiveLine) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Live(line),
        }
    }

    pub(crate) fn live_end(t_ms: f64, id: u64) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::LiveEnd(LiveEnd { id }),
        }
    }

    /// Câu "so we went home." (một đoạn, tới 5 050 ms) có dòng đang nói: ba lần hiện, lượt cuối, lần phát lại lúc đóng băng
    /// ngay sau upsert tạo phụ đề, dịch xong, gỡ dòng.
    pub(crate) fn live_sentence() -> Vec<Timed> {
        vec![
            live(2_000.0, line(1, None, ("", "so we"), ("", ""), 0)),
            live(2_300.0, line(1, None, ("", "so we"), ("", "chúng tôi"), 2)),
            live(
                3_300.0,
                line(1, None, ("so", " we went"), ("chúng", " tôi đã đi"), 3),
            ),
            upsert(5_400.0, 1, 5_050, "so we went home.", "", Status::AsrDone, false),
            live(
                5_401.0,
                line(1, None, ("so", " we went"), ("chúng", " tôi đã đi"), 3),
            ),
            upsert(5_410.0, 1, 5_050, "so we went home.", "", Status::Translating, false),
            delta(5_600.0, 1, "chúng tôi về nhà."),
            upsert(
                5_700.0,
                1,
                5_050,
                "so we went home.",
                "chúng tôi về nhà.",
                Status::Done,
                false,
            ),
            live_end(5_701.0, 1),
        ]
    }

    /// Câu "so we went" (tới 1 400 ms) đã dịch, còn mở; dòng 2 nối tiếp nó ("home now"), rồi lượt cuối ghép đoạn 2 vào câu
    /// (tới 4 000 ms), dòng phát lại ngay sau upsert đó, câu dịch lại xong, gỡ dòng.
    pub(crate) fn live_extending() -> Vec<Timed> {
        let whole = "so we went home now.";
        let new = "chúng tôi đi về nhà bây giờ.";
        vec![
            upsert(1_500.0, 1, 1_400, "so we went", "", Status::AsrDone, true),
            upsert(1_510.0, 1, 1_400, "so we went", "", Status::Translating, true),
            upsert(1_700.0, 1, 1_400, "so we went", "chúng tôi đi", Status::Done, true),
            live(
                2_800.0,
                line(2, Some(1), ("so we went", " home"), ("", "chúng tôi đi về"), 4),
            ),
            live(
                3_600.0,
                line(
                    2,
                    Some(1),
                    ("so we went home", " now"),
                    ("chúng tôi đi về", " nhà bây giờ"),
                    5,
                ),
            ),
            upsert(4_400.0, 1, 4_000, whole, "chúng tôi đi", Status::AsrDone, false),
            live(
                4_401.0,
                line(
                    2,
                    Some(1),
                    ("so we went home", " now"),
                    ("chúng tôi đi về", " nhà bây giờ"),
                    5,
                ),
            ),
            upsert(4_600.0, 1, 4_000, whole, "chúng tôi đi", Status::Translating, false),
            upsert(4_800.0, 1, 4_000, whole, new, Status::Translating, false),
            upsert(4_900.0, 1, 4_000, whole, new, Status::Done, false),
            live_end(4_901.0, 2),
        ]
    }

    /// QĐ10 của kế hoạch 02: dòng gắn với phần chữ mà lượt cuối của nó tạo ra; tầng tạm theo phần nguồn đã dịch, tầng ổn định
    /// theo tỉ lệ phần dịch ổn định; độ nháy tạm tính cả lúc phụ đề cuối thay dòng.
    #[test]
    fn a_live_line_is_tied_to_the_piece_of_its_final_and_covers_words() {
        let replay = Replay::new(&live_sentence());
        let track = &replay.lives[&1];
        assert_eq!((track.piece, track.sentence), (Some(0), Some(1)));
        assert_eq!(track.obs.len(), 4);
        assert_eq!(track.ended, Some((5_701.0, "chúng tôi về nhà.".to_string())));
        assert_eq!(replay.piece_keys[0], ["so", "we", "went", "home"]);
        let tentative: Vec<Option<f64>> = (0..4).map(|j| replay.live_tentative_ms(0, j)).collect();
        assert_eq!(tentative, [Some(2_300.0), Some(2_300.0), Some(3_300.0), None]);
        let stable: Vec<Option<f64>> = (0..4).map(|j| replay.live_stable_ms(0, j)).collect();
        assert_eq!(stable, [Some(3_300.0), None, None, None]);
        assert_eq!(replay.retracted_units(), 2, "\"đã đi\" của dòng bị bản cuối thay");
        assert_eq!(replay.changed_stable_units(), 0);
        assert_eq!(replay.final_translated_units(), 4);
    }

    /// Dòng nối tiếp câu: phủ phần mới của câu; phần dịch ổn định của nó tính cho cả các từ của phần cũ (theo tỉ lệ trên cả
    /// câu).
    #[test]
    fn a_line_extending_a_sentence_covers_the_new_piece_and_stabilizes_the_whole_sentence() {
        let replay = Replay::new(&live_extending());
        assert_eq!(
            (replay.lives[&2].piece, replay.lives[&2].sentence),
            (Some(1), Some(1))
        );
        assert_eq!(replay.piece_keys[1], ["home", "now"]);
        assert_eq!(
            (replay.live_tentative_ms(1, 0), replay.live_tentative_ms(1, 1)),
            (Some(2_800.0), Some(3_600.0))
        );
        assert_eq!(replay.live_tentative_ms(0, 0), None, "phần đầu không gắn với dòng nào");
        let stable: Vec<Option<f64>> = [(0, 0), (0, 1), (0, 2), (1, 0), (1, 1)]
            .iter()
            .map(|&(p, j)| replay.live_stable_ms(p, j))
            .collect();
        assert_eq!(stable, [Some(3_600.0), Some(3_600.0), None, None, None]);
        assert_eq!((replay.retracted_units(), replay.changed_stable_units()), (0, 0));
    }

    /// Dòng xuất hiện lần đầu ngay sau một upsert tạo phần chữ không phải lần phát lại lúc đóng băng: không gắn với phần đó.
    #[test]
    fn a_new_line_right_after_a_piece_is_not_tied_to_it() {
        let events = vec![
            upsert(1_000.0, 1, 900, "hello", "", Status::AsrDone, true),
            live(1_001.0, line(2, Some(1), ("hello", " there"), ("", "xin chào"), 2)),
        ];
        let replay = Replay::new(&events);
        assert_eq!(replay.lives[&2].piece, None);
    }

    #[test]
    fn units_are_words_or_cjk_characters_without_punctuation() {
```

`crates/latency-bench/src/session_metrics.rs`, trong `mod tests`: thay

```rust
    use crate::session_replay::tests::{merged_sentence, upsert};
```

bằng

```rust
    use crate::session_replay::tests::{live_extending, live_sentence, merged_sentence, upsert};
```

và thay

```rust
    #[test]
    fn an_utterance_without_any_piece_has_no_numbers() {
```

bằng

```rust
    /// Dòng đang nói (QĐ10 của kế hoạch 02): tầng tạm lấy lúc dòng phủ tới từ; tầng ổn định theo tỉ lệ phần dịch ổn định; từ
    /// chưa được phủ lấy lúc của lượt cuối. Bốn từ được nói xong lúc 2 000, 3 000, 4 000, 5 000 ms.
    #[test]
    fn live_lines_bring_the_word_lags_forward() {
        let truth = [utt("a", "en", 1_000, 5_000, Some(5_050))];
        let u = &evaluate(&truth, &live_sentence())[0];
        assert_eq!(u.word_lag_tentative_ms, [300.0, -700.0, -700.0, 600.0]);
        assert_eq!(u.word_lag_stable_ms, [1_300.0, 2_700.0, 1_700.0, 700.0]);
        assert_eq!(u.first_from_start_ms, Some(1_300.0));
        assert_eq!((u.a2_shown_ms, u.a2_first_ms), (Some(700.0), Some(600.0)));
        let s = summarize(&truth, &live_sentence());
        assert_eq!(
            (s.stable_flicker_ratio, s.tentative_erasure_ratio),
            (Some(0.0), Some(0.5))
        );
    }

    /// Dòng nối tiếp câu: từ của phần mới có tầng tạm từ dòng; từ của cả câu có tầng ổn định theo tỉ lệ (7 đơn vị dịch cho 5
    /// đơn vị nguồn). Năm từ được nói xong lúc 800, 1 600, 2 400, 3 200, 4 000 ms.
    #[test]
    fn a_line_extending_a_sentence_counts_for_the_whole_sentence() {
        let u = &evaluate(&[utt("a", "en", 0, 4_000, Some(4_000))], &live_extending())[0];
        assert_eq!(u.units, 5);
        assert_eq!(u.word_lag_tentative_ms, [900.0, 100.0, -700.0, -400.0, -400.0]);
        assert_eq!(u.word_lag_stable_ms, [2_800.0, 2_000.0, 2_500.0, 1_700.0, 900.0]);
        assert_eq!(u.first_from_start_ms, Some(1_700.0));
        assert_eq!((u.a2_shown_ms, u.a2_first_ms), (Some(900.0), Some(800.0)));
    }

    #[test]
    fn an_utterance_without_any_piece_has_no_numbers() {
```

`bench/2026-10-10-do-tre/test_session_tools.py`: thay

```python
if __name__ == "__main__":
    unittest.main()
```

bằng

```python
class TargetsTest(unittest.TestCase):
    """Bảng `--targets` (kế hoạch 02): so mục tiêu §10.2 của spec 2026-10-10 theo nhóm lượt chạy."""

    def test_targets_pool_words_by_language_and_flicker_by_units(self):
        reports = [
            ("buoc2-es400-chuan-en", {
                "summary": {"a2_p50_ms": 900.0, "a2_p90_ms": 1500.0, "a2_first_p50_ms": 500.0, "cpu_percent": 12.0},
                "run": {"stable_changed_units": 5, "final_units": 100},
                "utterances": [{"lang": "en", "word_lag_tentative_ms": [800, 1000, 1400],
                                "word_lag_stable_ms": [1500, 2500], "first_from_start_ms": 1500}],
            }),
            ("buoc2-es400-chuan-ja", {
                "summary": {"a2_p50_ms": 1100.0, "a2_p90_ms": 3100.0, "a2_first_p50_ms": 600.0, "cpu_percent": 14.5},
                "run": {"stable_changed_units": 15, "final_units": 100},
                "utterances": [{"lang": "ja", "word_lag_tentative_ms": [1300], "word_lag_stable_ms": [2900],
                                "first_from_start_ms": 2500}],
            }),
        ]
        lines = S.targets_table(reports)
        self.assertIn("| buoc2-es400-chuan | en | 1000 ✓ | 2000 ✓ (≤ 2000) |", lines)
        self.assertIn("| buoc2-es400-chuan | ja | 1300 ✗ | 2900 ✓ (≤ 3000) |", lines)
        self.assertIn("| buoc2-es400-chuan | 2400 ✗ | 10.0% ✓ | 1100 ✓ | 3100 ✗ | 600 ✓ | 14.5 ✓ |", lines)

    def test_missing_numbers_show_a_dash(self):
        lines = S.targets_table([("buoc2-es50-chuan-en", {"summary": {}, "utterances": []})])
        self.assertIn("| buoc2-es50-chuan | — | — | — | — | — | — |", lines)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench session_
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py'
```

Expected: Rust: lỗi biên dịch `no field lives on type Replay`, `no method named live_tentative_ms`…; Python: `AttributeError: module 'summarize_sessions' has no attribute 'targets_table'`.

- [ ] **Step 3: Cài `session_replay`**

`crates/latency-bench/src/session_replay.rs`: thay

```rust
use pipeline::subtitle::{Status, Subtitle};
```

bằng

```rust
use pipeline::subtitle::{LiveLine, Status, Subtitle};
```

thay

```rust
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Replay {
    pub tracks: BTreeMap<u64, Track>,
    /// Mọi phần, theo thứ tự xuất hiện.
    pub pieces: Vec<Piece>,
}
```

bằng

```rust
/// Một lần hiện của dòng đang nói (kế hoạch 02; spec 2026-10-10 §6.2).
#[derive(Clone, Debug, PartialEq)]
pub struct LiveObs {
    pub t_ms: f64,
    /// Câu mà dòng thay chỗ lúc đó: `extends`, hay chính id của dòng.
    pub sentence: u64,
    /// Khóa của chữ nguồn đang hiện (`src_stable + src_tail`).
    pub src_keys: Vec<String>,
    pub tgt_src_units: usize,
    pub tgt_stable: String,
    /// Số đơn vị (`target_units`) của phần dịch ổn định.
    pub stable_units: usize,
    /// Cả chữ dịch đang hiện (`tgt_stable + tgt_tail`).
    pub tgt: String,
}

/// Lịch sử của một dòng đang nói.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct LiveTrack {
    pub obs: Vec<LiveObs>,
    /// Phần chữ (chỉ số trong `Replay::pieces`) mà lượt cuối của đoạn tạo ra, và câu chứa nó lúc đó (QĐ10 của kế hoạch 02).
    pub piece: Option<usize>,
    pub sentence: Option<u64>,
    /// Lúc gỡ dòng, và chữ dịch của câu lúc đó (phụ đề cuối thay vào).
    pub ended: Option<(f64, String)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Replay {
    pub tracks: BTreeMap<u64, Track>,
    /// Mọi phần, theo thứ tự xuất hiện.
    pub pieces: Vec<Piece>,
    /// Khóa so khớp của chữ nguồn của từng phần (cùng chỉ số với `pieces`).
    pub piece_keys: Vec<Vec<String>>,
    /// Dòng đang nói theo id (kế hoạch 02).
    pub lives: BTreeMap<u64, LiveTrack>,
    /// (phụ đề, chỉ số phần) mà upsert ngay trước sự kiện đang xét tạo ra (QĐ10 của kế hoạch 02).
    just_created: Option<(u64, usize)>,
}
```

thay **toàn bộ hàm `Replay::new`** (bản của Task 16) bằng:

```rust
    pub fn new(events: &[Timed]) -> Self {
        let mut replay = Self::default();
        for e in events {
            match &e.ev {
                Recorded::Subtitle(s) => replay.upsert(e.t_ms, s),
                Recorded::Delta(d) => {
                    replay.just_created = None;
                    replay.delta(e.t_ms, d.id, &d.text);
                }
                Recorded::Indicators(_) => {}
                Recorded::Live(l) => replay.live(e.t_ms, l),
                Recorded::LiveEnd(end) => replay.live_end(e.t_ms, end.id),
            }
        }
        replay
    }
```

thay **toàn bộ hàm `upsert`** (từ `fn upsert(&mut self, t_ms: f64, s: &Subtitle) {` tới dấu `}` đóng hàm, ngay trước `fn delta`) bằng:

```rust
    fn upsert(&mut self, t_ms: f64, s: &Subtitle) {
        for id in &s.replaces {
            let moved = match self.tracks.get_mut(id) {
                Some(t) if !t.absorbed => {
                    t.absorbed = true;
                    t.pieces.clone()
                }
                _ => continue,
            };
            for &i in &moved {
                self.pieces[i].owners.push(s.id);
            }
            self.tracks.entry(s.id).or_default().pieces.extend(moved);
        }
        let track = self.tracks.entry(s.id).or_default();
        let keys = units(&s.src_text, &s.src_lang);
        let n = keys.len();
        let counted: usize = track.pieces.iter().map(|&i| self.pieces[i].units).sum();
        let last_end = track.pieces.last().map(|&i| self.pieces[i].end_ms);
        self.just_created = None;
        if last_end.is_none_or(|e| s.end_ms > e) || n > counted {
            self.pieces.push(Piece {
                end_ms: s.end_ms,
                units: n.saturating_sub(counted),
                owners: vec![s.id],
            });
            self.piece_keys.push(keys.get(counted..).unwrap_or(&[]).to_vec());
            track.pieces.push(self.pieces.len() - 1);
            self.just_created = Some((s.id, self.pieces.len() - 1));
        }
        let tgt_of = if s.tgt_text.is_empty() {
            None
        } else if FINAL.contains(&s.status) {
            Some(s.end_ms)
        } else {
            match track.shown.last() {
                // Cùng chữ: bản đang giữ khi ghép câu (A2), hay chỉ đổi trạng thái.
                Some(prev) if prev.tgt == s.tgt_text => prev.tgt_of,
                _ => Some(s.end_ms),
            }
        };
        track.shown.push(Shown {
            t_ms,
            end_ms: s.end_ms,
            status: s.status,
            provisional: s.provisional,
            tgt: s.tgt_text.clone(),
            tgt_of,
        });
        track.src_lang = s.src_lang.clone();
        track.src_text = s.src_text.clone();
    }
```

thay

```rust
    /// Lần đầu (ms) một phụ đề chứa phần `p` hiện chữ dịch được dịch từ phiên bản có phần đó, hay hiện câu gốc vì câu đã
```

bằng

```rust
    /// Một lần hiện của dòng đang nói. Lần phát lại lúc đóng băng đứng ngay sau upsert tạo phần chữ của đoạn (QĐ5, QĐ10 của
    /// kế hoạch 02), và dòng đã có lần hiện trước đó; dòng mới xuất hiện ngay sau một upsert thì không phải lần đó. Mỗi phần
    /// chỉ gắn với một dòng.
    fn live(&mut self, t_ms: f64, l: &LiveLine) {
        let sentence = l.extends.unwrap_or(l.id);
        let created = self
            .just_created
            .filter(|&(sub, piece)| sub == sentence && !self.lives.values().any(|t| t.piece == Some(piece)));
        let track = self.lives.entry(l.id).or_default();
        if let Some((_, piece)) = created
            && track.piece.is_none()
            && !track.obs.is_empty()
        {
            track.piece = Some(piece);
            track.sentence = Some(sentence);
        }
        track.obs.push(LiveObs {
            t_ms,
            sentence,
            src_keys: units(&format!("{}{}", l.src_stable, l.src_tail), &l.src_lang),
            tgt_src_units: l.tgt_src_units as usize,
            tgt_stable: l.tgt_stable.clone(),
            stable_units: target_units(&l.tgt_stable).len(),
            tgt: format!("{}{}", l.tgt_stable, l.tgt_tail),
        });
    }

    /// Gỡ dòng đang nói: ghi lúc gỡ và chữ dịch của câu mà dòng thay chỗ (phụ đề cuối thay vào; dòng của đoạn bị lọc thì
    /// không có gì thay).
    fn live_end(&mut self, t_ms: f64, id: u64) {
        let Some(track) = self.lives.get_mut(&id) else {
            return;
        };
        let shown = track
            .sentence
            .or_else(|| track.obs.last().map(|o| o.sentence))
            .and_then(|s| self.tracks.get(&s))
            .and_then(|t| t.shown.last())
            .map(|s| s.tgt.clone())
            .unwrap_or_default();
        track.ended = Some((t_ms, shown));
    }

    /// Vị trí đầu của phần `piece` trong chữ nguồn của câu `sentence`, và khóa của chữ nguồn cuối của câu.
    fn place(&self, sentence: u64, piece: usize) -> Option<(usize, Vec<String>)> {
        let track = self.tracks.get(&sentence)?;
        let at = track.pieces.iter().position(|&i| i == piece)?;
        let offset = track.pieces[..at].iter().map(|&i| self.pieces[i].units).sum();
        Some((offset, units(&track.src_text, &track.src_lang)))
    }

    /// Lần đầu (ms) đơn vị thứ `j` của phần `piece` được dòng đang nói của phần đó phủ, có chữ dịch (tầng tạm, QĐ10): phần
    /// đầu chung (theo khóa) giữa `tgt_src_units` đơn vị đầu của chữ nguồn đang hiện và bản chép cuối của câu dài hơn vị trí
    /// của đơn vị trong câu.
    pub fn live_tentative_ms(&self, piece: usize, j: usize) -> Option<f64> {
        let track = self.lives.values().find(|t| t.piece == Some(piece))?;
        let sentence = track.sentence?;
        let (offset, keys) = self.place(sentence, piece)?;
        track
            .obs
            .iter()
            .find(|o| {
                o.sentence == sentence
                    && !o.tgt.trim().is_empty()
                    && lcp(&o.src_keys[..o.tgt_src_units.min(o.src_keys.len())], &keys) > offset + j
            })
            .map(|o| o.t_ms)
    }

    /// Lần đầu (ms) một dòng đang thay chỗ câu chứa phần `piece` (chủ đầu tiên của phần) có phần dịch ổn định đủ dài cho đơn
    /// vị thứ `j` của phần (tầng ổn định, xấp xỉ theo tỉ lệ, spec §10.1): ít nhất ⌈(q + 1) × đơn vị bản dịch cuối ÷ đơn vị
    /// bản chép cuối⌉ đơn vị, với q là vị trí của đơn vị trong câu. Câu không có bản dịch cuối còn trên màn hình thì `None`.
    pub fn live_stable_ms(&self, piece: usize, j: usize) -> Option<f64> {
        let sentence = *self.pieces.get(piece)?.owners.first()?;
        let (offset, keys) = self.place(sentence, piece)?;
        let track = self.tracks.get(&sentence).filter(|t| !t.absorbed)?;
        let last = track.shown.last().filter(|s| s.status == Status::Done)?;
        let need = ((offset + j + 1) * target_units(&last.tgt).len()).div_ceil(keys.len().max(1));
        if need == 0 {
            return None;
        }
        self.lives
            .values()
            .flat_map(|t| &t.obs)
            .filter(|o| o.sentence == sentence && o.stable_units >= need)
            .map(|o| o.t_ms)
            .min_by(f64::total_cmp)
    }

    /// Lần đầu (ms) một phụ đề chứa phần `p` hiện chữ dịch được dịch từ phiên bản có phần đó, hay hiện câu gốc vì câu đã
```

và thay

```rust
    /// Tổng số đơn vị chữ dịch bị rút lại giữa hai lần hiện liên tiếp của cùng một phụ đề.
    pub fn retracted_units(&self) -> usize {
        self.tracks
            .values()
            .flat_map(|t| t.shown.windows(2))
            .map(|w| retracted(&w[0].tgt, &w[1].tgt))
            .sum()
    }

    /// Số đơn vị của phần dịch đã ổn định mà bản cuối thay đổi. Ở chế độ thường, tầng ổn định chính là phụ đề đã chốt và
    /// không bao giờ đổi nữa, nên phần ổn định bằng bản cuối. Kế hoạch 02 thêm các quan sát của dòng đang nói.
    pub fn changed_stable_units(&self) -> usize {
        self.translated().map(|s| changed_stable_units(&s.tgt, &s.tgt)).sum()
    }
```

bằng

```rust
    /// Tổng số đơn vị chữ dịch bị rút lại giữa hai lần hiện liên tiếp: của cùng một phụ đề; của cùng một dòng đang nói; và
    /// lúc phụ đề cuối thay dòng đang nói (QĐ10 của kế hoạch 02).
    pub fn retracted_units(&self) -> usize {
        let subtitles: usize = self
            .tracks
            .values()
            .flat_map(|t| t.shown.windows(2))
            .map(|w| retracted(&w[0].tgt, &w[1].tgt))
            .sum();
        let lives: usize = self
            .lives
            .values()
            .map(|l| {
                let within: usize = l.obs.windows(2).map(|w| retracted(&w[0].tgt, &w[1].tgt)).sum();
                let replaced = match (&l.ended, l.obs.last()) {
                    (Some((_, fin)), Some(last)) => retracted(&last.tgt, fin),
                    _ => 0,
                };
                within + replaced
            })
            .sum();
        subtitles + lives
    }

    /// Số đơn vị của phần dịch đã ổn định mà bản cuối thay đổi (§10.1). Phụ đề đã chốt không đổi nữa, nên phần của nó bằng
    /// 0; với dòng đang nói: phần dịch ổn định cuối cùng của mỗi dòng so với bản dịch cuối của câu mà dòng thay chỗ (QĐ10).
    pub fn changed_stable_units(&self) -> usize {
        let settled: usize = self.translated().map(|s| changed_stable_units(&s.tgt, &s.tgt)).sum();
        let lives: usize = self
            .lives
            .values()
            .filter_map(|l| {
                let last = l.obs.last().filter(|o| !o.tgt_stable.is_empty())?;
                let track = self.tracks.get(&last.sentence).filter(|t| !t.absorbed)?;
                let fin = track.shown.last().filter(|s| s.status == Status::Done)?;
                Some(changed_stable_units(&last.tgt_stable, &fin.tgt))
            })
            .sum();
        settled + lives
    }
```

- [ ] **Step 4: Cài `session_metrics`**

`crates/latency-bench/src/session_metrics.rs`: thay

```rust
//! - **A2** tính như `latency`: ghép câu với phần có mốc cuối gần nhất (trong 1 giây), đo từ `end_ms` của câu tới lúc
```

bằng

```rust
//! - **Chế độ dịch trong lúc nói** (kế hoạch 02, QĐ10): tầng tạm và tầng ổn định của một từ là lúc sớm hơn giữa cách tính
//!   của chế độ thường và cách tính từ dòng đang nói (`Replay::live_tentative_ms`, `Replay::live_stable_ms`); "từ đầu câu
//!   tới chữ dịch đầu" cũng vậy.
//! - **A2** tính như `latency`: ghép câu với phần có mốc cuối gần nhất (trong 1 giây), đo từ `end_ms` của câu tới lúc
```

thay **toàn bộ hàm `evaluate_replay`** (từ `fn evaluate_replay(` tới dấu `}` đóng hàm, ngay trước doc comment của `summarize`) bằng:

```rust
fn evaluate_replay(truth: &[Utterance], replay: &Replay) -> Vec<UtteranceResult> {
    let ends: Vec<u64> = replay.pieces.iter().map(|p| p.end_ms).collect();
    let matched = match_segments(truth, &ends, MATCH_WINDOW_MS);
    truth
        .iter()
        .zip(matched)
        .map(|(u, m)| {
            let mine = pieces_of(u, &replay.pieces);
            // `same_lang` nghĩa là LID chọn đúng ngôn ngữ đích; câu thật là tiếng khác thì chỉ hiện câu gốc sai ngôn ngữ.
            let wrong_lang = |p: &Piece| {
                replay.final_status(p) == Some(Status::SameLang) && replay.final_lang(p) != Some(u.lang.as_str())
            };
            let n: usize = mine.iter().map(|p| p.units).sum();
            let span = u.end_ms.saturating_sub(u.start_ms) as f64;
            let mut out = UtteranceResult {
                id: u.id.clone(),
                lang: u.lang.clone(),
                start_ms: u.start_ms,
                end_ms: u.end_ms,
                units: n,
                ..UtteranceResult::default()
            };
            let mut first_live = None;
            let mut i = 0usize;
            for p in &mine {
                let index = replay
                    .pieces
                    .iter()
                    .position(|x| std::ptr::eq(x, *p))
                    .expect("phần của replay");
                let wrong = wrong_lang(p);
                let tentative = replay.first_text_ms(p).filter(|_| !wrong);
                let stable = replay.settled_ms(p).filter(|_| !wrong);
                for j in 0..p.units {
                    let spoken = u.start_ms as f64 + (i + 1) as f64 * span / n as f64;
                    // Dòng đang nói (kế hoạch 02, QĐ10): lấy lúc sớm hơn giữa dòng đang nói và lượt cuối.
                    let live_tentative = replay.live_tentative_ms(index, j).filter(|_| !wrong);
                    let live_stable = replay.live_stable_ms(index, j).filter(|_| !wrong);
                    if let Some(t) = earliest(tentative, live_tentative) {
                        out.word_lag_tentative_ms.push(ms(t - spoken));
                    }
                    if let Some(t) = earliest(stable, live_stable) {
                        out.word_lag_stable_ms.push(ms(t - spoken));
                    }
                    first_live = earliest(first_live, live_tentative);
                    i += 1;
                }
            }
            let first_final = mine
                .iter()
                .filter(|p| !wrong_lang(p))
                .filter_map(|p| replay.first_text_ms(p))
                .min_by(f64::total_cmp);
            out.first_from_start_ms = earliest(first_final, first_live).map(|t| ms(t - u.start_ms as f64));
            if let Some(p) = m.map(|i| &replay.pieces[i]) {
                out.lid_to_target = wrong_lang(p);
                if !out.lid_to_target {
                    out.a2_shown_ms = replay.done_ms(p).map(|t| ms(t - u.end_ms as f64));
                    out.a2_first_ms = replay.first_text_ms(p).map(|t| ms(t - u.end_ms as f64));
                }
            }
            out
        })
        .collect()
}

/// Lúc sớm hơn trong hai, nếu có.
fn earliest(a: Option<f64>, b: Option<f64>) -> Option<f64> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x.min(y)),
        (x, None) => x,
        (None, y) => y,
    }
}
```

- [ ] **Step 5: Cài bảng `--targets`**

`bench/2026-10-10-do-tre/summarize_sessions.py`: thay

```python
Dùng:  python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare <nhãn cũ> <nhãn mới> <file.json>...
```

bằng

```python
Dùng:  python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare <nhãn cũ> <nhãn mới> <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets [--compare …] <file.json>...
Với `--targets` (kế hoạch 02), in thêm bảng so mục tiêu §10.2 của spec 2026-10-10 theo nhóm lượt chạy (xem `targets_table`).
```

thay

```python
def main(argv):
    compare = None
    if argv[:1] == ["--compare"]:
```

bằng

```python
# Mục tiêu §10.2 của spec 2026-10-10 (M4 Pro, gói Chuẩn, chế độ dịch trong lúc nói bật); A2 và CPU như mốc S6.
TENTATIVE_P50_MS = 1200
STABLE_P50_MS = {"en": 2000, "vi": 2000, "ko": 2000, "zh": 3000, "ja": 3000}
FIRST_P90_MS = 2000
FLICKER_MAX = 0.10
A2_P50_MS, A2_P90_MS, A2_FIRST_P50_MS = 2000, 3000, 1000
CPU_MAX = 30.0


def verdict(text, ok):
    return f"{text} {'✓' if ok else '✗'}"


def ms_verdict(value, goal):
    return "—" if value is None else verdict(f"{value:.0f}", value <= goal)


def targets_table(reports):
    """So từng nhóm lượt chạy với mục tiêu §10.2 của spec 2026-10-10: trễ theo từ gộp theo tiếng nguồn; từ đầu câu tới chữ
    dịch đầu (p90, gộp mọi câu); độ nháy tầng ổn định gộp theo đơn vị (tử và mẫu ở khóa `run`); A2 và CPU của session tệ
    nhất."""
    words, groups = {}, {}
    for name, report in reports:
        g = group_of(name)
        d = groups.setdefault(g, {"start": [], "changed": 0, "final": 0, "a2": [], "a2_90": [], "a2_first": [],
                                  "cpu": []})
        run, summary = report.get("run", {}), report.get("summary", {})
        d["changed"] += run.get("stable_changed_units") or 0
        d["final"] += run.get("final_units") or 0
        for key, col in (("a2_p50_ms", "a2"), ("a2_p90_ms", "a2_90"), ("a2_first_p50_ms", "a2_first"),
                         ("cpu_percent", "cpu")):
            if summary.get(key) is not None:
                d[col].append(summary[key])
        for u in report.get("utterances", []):
            if u.get("first_from_start_ms") is not None:
                d["start"].append(u["first_from_start_ms"])
            w = words.setdefault((g, u["lang"]), {"tentative": [], "stable": []})
            w["tentative"].extend(u.get("word_lag_tentative_ms", []))
            w["stable"].extend(u.get("word_lag_stable_ms", []))
    lines = [
        "| Nhóm | Tiếng nguồn | Theo từ, tạm p50 (≤ 1200) | Theo từ, ổn định p50 (mục tiêu) |",
        "|---|---|---|---|",
    ]
    for (g, lang), w in sorted(words.items()):
        goal = STABLE_P50_MS.get(lang, 2000)
        lines.append(f"| {g} | {lang} | {ms_verdict(percentile(w['tentative'], 50), TENTATIVE_P50_MS)} | "
                     f"{ms_verdict(percentile(w['stable'], 50), goal)} (≤ {goal}) |")
    lines += [
        "",
        "| Nhóm | Đầu câu → chữ dịch p90 (≤ 2000) | Nháy ổn định (≤ 10%) | A2 p50 tệ nhất (≤ 2000) "
        "| A2 p90 tệ nhất (≤ 3000) | A2 chữ đầu p50 tệ nhất (≤ 1000) | CPU % tệ nhất (≤ 30) |",
        "|---|---|---|---|---|---|---|",
    ]
    for g, d in sorted(groups.items()):
        flicker = d["changed"] / d["final"] if d["final"] else None
        cpu = max(d["cpu"], default=None)
        cells = [
            ms_verdict(percentile(d["start"], 90), FIRST_P90_MS),
            "—" if flicker is None else verdict(f"{flicker * 100:.1f}%", flicker <= FLICKER_MAX),
            ms_verdict(max(d["a2"], default=None), A2_P50_MS),
            ms_verdict(max(d["a2_90"], default=None), A2_P90_MS),
            ms_verdict(max(d["a2_first"], default=None), A2_FIRST_P50_MS),
            "—" if cpu is None else verdict(f"{cpu:.1f}", cpu <= CPU_MAX),
        ]
        lines.append(f"| {g} | " + " | ".join(cells) + " |")
    return lines


def main(argv):
    targets = argv[:1] == ["--targets"]
    if targets:
        argv = argv[1:]
    compare = None
    if argv[:1] == ["--compare"]:
```

và thay

```python
    if compare:
        print()
        print("\n".join(compare_table(reports, *compare)))
```

bằng

```python
    if compare:
        print()
        print("\n".join(compare_table(reports, *compare)))
    if targets:
        print()
        print("\n".join(targets_table(reports)))
```

- [ ] **Step 6: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench
cargo clippy --locked -p latency-bench --all-targets -- -D warnings
cargo fmt -p latency-bench -- --check
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
```

Expected:
- Rust: mọi test đạt, gồm 3 test mới của `session_replay` và 2 test mới của `session_metrics`; mọi test của kế hoạch 01 giữ nguyên số;
- clippy và fmt sạch;
- Python: `Ran 9 tests … OK`.

- [ ] **Step 7: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/latency-bench/src/session_replay.rs crates/latency-bench/src/session_metrics.rs \
  bench/2026-10-10-do-tre/summarize_sessions.py bench/2026-10-10-do-tre/test_session_tools.py
git -C "$W" commit -m "$(cat <<'EOF'
feat(latency-bench): chỉ số §10.1 từ dòng đang nói; bảng so mục tiêu §10.2

Dòng đang nói gắn với phần chữ mà lượt cuối của nó tạo ra (lần phát lại lúc đóng băng); tầng tạm theo phần nguồn đã
dịch, tầng ổn định theo tỉ lệ phần dịch ổn định, độ nháy cộng cả dòng đang nói; chế độ thường giữ nguyên số.
summarize_sessions.py --targets so từng nhóm lượt chạy với mục tiêu §10.2.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: commit có đúng bốn file.

---
## Task 18: Kiểm toàn bộ, chạy thử với tiến trình phụ giả

Không commit. Kiểm cả nhánh như CI, rồi chạy `latency-bench session --streaming` một lượt với tiến trình phụ giả để chắc file JSON có đủ khóa và sự kiện mới, trước khi chiếm máy đo thật.

**Files:** không sửa file nào (đầu ra nằm ở `target/do-tre/smoke2/`).

- [ ] **Step 1: Bộ kiểm như CI**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --locked --workspace
pnpm build && pnpm test
./scripts/check-windows.sh --locked
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py'
```

Expected: mọi lệnh thoát mã 0. Lệnh nào đỏ thì sửa ở task đã gây ra lỗi (theo `git log` của nhánh), chạy lại test của task đó, commit sửa riêng (`fix(pipeline): …`), rồi chạy lại cả bước này.

- [ ] **Step 2: Chạy thử `--streaming` với tiến trình phụ giả**

Worker giả trả chữ dài theo âm thanh (`words_per_sec:3`), nên có bản chép từng phần thật sự khác nhau.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo build --locked -p pipeline --bins
cargo build --locked -p latency-bench
mkdir -p target/do-tre/smoke2
printf 'en\tThat did not seem to make sense to me at all today.\nen\tThe result of plotting analysis will be posted soon.\nvi\tCác nhà khoa học cho biết như vậy.\n' > target/do-tre/smoke2/texts
printf 'words_per_sec:3\n' > target/do-tre/smoke2/asr-plan
FAKE_ASR_TEXTS=$PWD/target/do-tre/smoke2/texts FAKE_ASR_PLAN=$PWD/target/do-tre/smoke2/asr-plan \
  target/debug/latency-bench session \
  --wav tests/fixtures/audio/fleurs-en-en-vi.wav --truth tests/fixtures/audio/fleurs-en-en-vi.json \
  --asr-worker target/debug/fake_asr_worker --asr-model models/ggml-small-q5_1.bin \
  --llama-server target/debug/fake_llama_server --mt-model models/Hy-MT2-1.8B-Q4_K_M.gguf \
  --languages en,vi --target vi --out target/do-tre/smoke2/out.json \
  --streaming --streaming-end-silence-ms 400 --tgt-agree en:2:1
python3 - <<'EOF'
import json
r = json.load(open("target/do-tre/smoke2/out.json"))
s, run, a = r["summary"], r["run"], r["args"]
kinds = sorted({e["kind"] for e in r["events"]})
print(kinds)
print(a["streaming"], a["streaming_end_silence_ms"], a["tgt_agree"])
print(s["partials"] > 0, s["cadence_p50_ms"] is not None, s["streaming_auto_off"])
print(run["live_lines"] > 0, run["final_units"] > 0, "stable_changed_units" in run)
EOF
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets target/do-tre/smoke2/out.json | tail -n 8
```

Expected:
- lệnh chạy khoảng 20 giây, in một dòng `out: A2 p50 … ms, …`;
- Python in:
  - `['indicators', 'live', 'live_end', 'subtitle']` (có thể không có `indicators` nếu không có chỉ báo nào đổi; `live` và `live_end` phải có);
  - `true 400 en:2:1`;
  - `True True 0.0`;
  - `True True True`;
- bảng `--targets` có một dòng `| out | …` theo tiếng `en`, `vi` và một dòng tóm của nhóm; số chỉ để xem có đủ cột (tiến trình phụ giả không có ý nghĩa đo).

Nếu `partials` là 0: xem `target/do-tre/smoke2/out.asr-worker.log` có dòng `transcribe` lặp cùng một id đoạn không; không có thì luồng VAD chưa gửi lần chép từng phần (Task 12).

- [ ] **Step 3: Không có gì để commit**

```sh
git -C /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi status --short
```

Expected: trống (đầu ra nằm trong `target/`).

---

## Task 19: Đo theo lưới tham số, viết báo cáo cổng

Bước 2 của spec §9 và QĐ11. Máy chạy khoảng 2,5–3 giờ:
- (a) gói Chuẩn, (n, k) mặc định, `streaming.end_silence_ms` 50, 200, 400, 600: 4 lượt × khoảng 20 phút;
- (b) gói Chuẩn, 1–2 ngưỡng tốt nhất của (a) × hai bộ (n, k): **thận trọng** (en, vi 3/1; zh 3/2; ja, ko 3/3) và **mạnh** (mọi tiếng 2/1): 2–4 lượt;
- (c) gói Nhẹ, ngưỡng chọn ở (a)–(b), (n, k) mặc định: 1 lượt.

Mọi lượt dùng `--end-silence-ms 50` (ngưỡng người dùng mặc định của app); ngưỡng hiệu lực của chế độ này là max(50, `streaming.end_silence_ms`). Mốc so sánh là `buoc1-sau-{chuan,nhe}-*` của kế hoạch 01 (chế độ thường, ngưỡng 50 ms, sau A2–A5). Ghi điều kiện như `bench/phase1/results/s6-a2-2026-10-04.md` và mốc của kế hoạch 01.

**Files:**
- Create: `bench/2026-10-10-do-tre/results/buoc2-es{50,200,400,600}-chuan-{en,zh,ja,ko,vi,mixed}.json` (24 file)
- Create: `bench/2026-10-10-do-tre/results/buoc2-es<T>-{than-trong,manh}-chuan-{…}.json` (12 hay 24 file)
- Create: `bench/2026-10-10-do-tre/results/buoc2-es<T>-nhe-{…}.json` (6 file)
- Create: `bench/2026-10-10-do-tre/results/buoc2-cong.md`

- [ ] **Step 1: Build bản release và tiến trình phụ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
target/release/latency-bench session --help | grep -E -- '--streaming|--tgt-agree'
git log -1 --format=%h
```

Expected: `copy-sidecars.sh` liệt kê 12 file; build xong; `--help` có `--streaming`, `--streaming-end-silence-ms`, `--tgt-agree`; ghi lại hash commit (dùng ở Step 13).

- [ ] **Step 2: Hỏi chủ dự án và chờ trả lời**

Gửi điều phối viên để chuyển cho chủ dự án:

> Sắp đo bản thử "dịch trong lúc người nói chưa dừng" (bước 2 của spec), khoảng 2,5–3 giờ, máy chạy model liên tục. Nhờ anh:
> - thoát Chrome, Teams, Slack, VS Code và bản dev hay bản cài của AI Translator;
> - cắm sạc;
> - tạm dừng build nặng ở phiên Claude khác;
> - không dùng máy trong lúc đo.
>
> Xong thì báo em.

Chưa có trả lời thì không chạy Step 3.

- [ ] **Step 3: Ghi điều kiện trước khi đo**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
mkdir -p target/do-tre
printf '[TRUOC %s] %s | %s | %s\n' "$(date '+%F %T')" "$(sysctl -n vm.swapusage)" "$(pmset -g batt | tail -n 1)" \
  "$(top -l 1 | grep 'CPU usage')" | tee target/do-tre/buoc2-dieu-kien.txt
```

Expected: một dòng `[TRUOC …]`; CPU rảnh trên khoảng 90%, máy đang sạc. Thấp hơn thì hỏi lại chủ dự án.

- [ ] **Step 4: (a) Bốn ngưỡng, gói Chuẩn**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
for es in 50 200 400 600; do
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label "buoc2-es$es" \
    -- --streaming --streaming-end-silence-ms "$es" || break
done
```

Expected: 24 khối `== buoc2-es<ngưỡng>-chuan-<session> (… giây, … câu)`, mỗi khối một dòng tóm tắt; không có dòng `CẢNH BÁO`; vòng lặp không dừng giữa chừng. Có `CẢNH BÁO: phát lại chậm hơn…` thì hỏi chủ dự án, rồi chạy lại đúng session đó bằng `--sessions <tên>` với cùng nhãn và cờ.

- [ ] **Step 5: Kiểm lượt đo đáng tin**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 - <<'EOF'
import glob, json
index = json.load(open("bench/phase0/data/latency/sessions.json", encoding="utf-8"))
for path in sorted(glob.glob("bench/2026-10-10-do-tre/results/buoc2-*.json")):
    r = json.load(open(path, encoding="utf-8"))
    s, run, a, name = r["summary"], r["run"], r["args"], path.rsplit("/", 1)[1][:-5]
    session = name.rsplit("-", 1)[1]
    print(name, "| câu", int(s["utterances"]), "/", index[session]["utterances"],
          "| A2 đo được", run["measured"], "| phát trễ", run["feed_lag_max_ms"], "| khởi động lại", run["sidecar_restarts"],
          "| streaming", a["streaming"], a["streaming_end_silence_ms"], a["tgt_agree"],
          "| chép từng phần", int(s["partials"]), "| tự tắt", s["streaming_auto_off"], "|", r["machine"]["asr_backend"])
EOF
```

Expected cho mọi dòng:
- số câu bằng `sessions.json`; "A2 đo được" gần bằng số câu;
- "phát trễ" dưới 100; "khởi động lại" bằng 0; `metal`;
- `streaming true <ngưỡng của nhãn> <mặc định hay bộ (n, k) của nhãn>`;
- "chép từng phần" lớn hơn 0;
- "tự tắt" là `0.0`. Có `1.0` thì đó là một kết quả (máy không theo kịp ở cấu hình đó), **không** chạy lại; ghi vào báo cáo.

Dòng nào không đạt ba điều đầu thì chạy lại session đó.

- [ ] **Step 6: Bảng của (a)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
R=bench/2026-10-10-do-tre/results
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets $R/buoc1-sau-chuan-*.json \
  $R/buoc2-es50-chuan-*.json $R/buoc2-es200-chuan-*.json $R/buoc2-es400-chuan-*.json $R/buoc2-es600-chuan-*.json \
  | tee target/do-tre/buoc2-a-bang.md
for es in 50 200 400 600; do
  python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-sau "buoc2-es$es" \
    $R/buoc1-sau-chuan-*.json $R/buoc2-es$es-chuan-*.json | tail -n 8 | tee -a target/do-tre/buoc2-a-so-sanh.md
done
```

Expected: `buoc2-a-bang.md` có bảng theo file, bảng theo tiếng và hai bảng mục tiêu, với các nhóm `buoc1-sau-chuan`, `buoc2-es50-chuan` … `buoc2-es600-chuan`; `buoc2-a-so-sanh.md` có bốn bảng so (mỗi bảng 6 dòng session).

- [ ] **Step 7: Chọn ngưỡng cho (b) và (c)**

Theo bảng mục tiêu của Step 6, xét từng ngưỡng theo thứ tự:
1. Loại ngưỡng có A2 (p50, p90 hay chữ đầu) không đạt, hay độ nháy ổn định quá 10%, hay CPU quá 30%, hay có session tự tắt.
2. Trong các ngưỡng còn lại, chọn ngưỡng có nhiều dấu ✓ nhất ở bảng theo tiếng (tạm và ổn định) cộng ô "đầu câu → chữ dịch p90".
3. Bằng nhau thì lấy ngưỡng có trung vị của các ô "ổn định p50" (5 tiếng) nhỏ hơn; vẫn bằng thì lấy ngưỡng nhỏ hơn.
4. Ngưỡng thứ hai được đo ở (b) nếu trung vị "ổn định p50" của nó không lớn hơn của ngưỡng thứ nhất quá 10%; không thì (b) chỉ đo một ngưỡng.

Không ngưỡng nào qua bước 1 thì vẫn chọn theo bước 2–3 trên cả bốn ngưỡng, và ghi rõ trong báo cáo là chưa đạt.

Ghi lựa chọn và lý do (một dòng mỗi ngưỡng) vào `target/do-tre/buoc2-chon.txt`. Dưới đây `T1` là ngưỡng thứ nhất, `T2` là ngưỡng thứ hai (nếu có).

- [ ] **Step 8: (b) Hai bộ (n, k), gói Chuẩn**

Thay `T1` (và `T2`) bằng số đã chọn ở Step 7:

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
for es in T1 T2; do
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label "buoc2-es$es-than-trong" \
    -- --streaming --streaming-end-silence-ms "$es" --tgt-agree en:3:1,vi:3:1,zh:3:2,ja:3:3,ko:3:3 || break
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label "buoc2-es$es-manh" \
    -- --streaming --streaming-end-silence-ms "$es" --tgt-agree en:2:1,vi:2:1,zh:2:1,ja:2:1,ko:2:1 || break
done
```

Chỉ có một ngưỡng thì bỏ `T2` khỏi vòng lặp. Expected như Step 4, với nhãn `buoc2-es<T>-than-trong` và `buoc2-es<T>-manh`.

- [ ] **Step 9: (c) Gói Nhẹ**

`T` là ngưỡng sẽ đề xuất: `T1`, trừ khi (b) cho thấy `T2` với một bộ (n, k) tốt hơn rõ (nhiều ✓ hơn ở bảng mục tiêu).

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label "buoc2-esT" -- --streaming --streaming-end-silence-ms T
```

Expected: 6 khối `== buoc2-es<T>-nhe-<session>`, không có `CẢNH BÁO`.

- [ ] **Step 10: Ghi điều kiện sau khi đo, kiểm lại**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
printf '[SAU %s] %s | %s | %s\n' "$(date '+%F %T')" "$(sysctl -n vm.swapusage)" "$(pmset -g batt | tail -n 1)" \
  "$(top -l 1 | grep 'CPU usage')" | tee -a target/do-tre/buoc2-dieu-kien.txt
```

Rồi chạy lại khối Python của Step 5 cho mọi file `buoc2-*`; điều kiện như Step 5.

- [ ] **Step 11: Bảng của (b) và (c)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
R=bench/2026-10-10-do-tre/results
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets $R/buoc2-es*-chuan-*.json | tee target/do-tre/buoc2-b-bang.md
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets --compare buoc1-sau buoc2-esT \
  $R/buoc1-sau-nhe-*.json $R/buoc2-esT-nhe-*.json | tee target/do-tre/buoc2-c-bang.md
```

(thay `T` như Step 9). Expected: `buoc2-b-bang.md` có mọi nhóm gói Chuẩn của bước này; `buoc2-c-bang.md` có hai nhóm gói Nhẹ và bảng so từng session.

- [ ] **Step 12: Xem vài dòng đang nói để kiểm cảm quan**

Số đo không thấy được chữ sai nghĩa (spec §14, rủi ro "chốt sớm làm sai nghĩa"). Lấy 3 câu tiếng Nhật và 3 câu tiếng Trung trong bản đầy đủ của ngưỡng `T`, (n, k) mặc định, so phần dịch ổn định cuối cùng của dòng đang nói với bản dịch cuối:

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 - <<'EOF'
import json
for session in ("ja", "zh"):
    r = json.load(open(f"target/do-tre/sessions/buoc2-esT-chuan-{session}.json", encoding="utf-8"))
    last, finals = {}, {}
    for e in r["events"]:
        if e["kind"] == "live" and e["tgt_stable"]:
            last[e["id"]] = (e.get("extends"), e["tgt_stable"])
        if e["kind"] == "subtitle" and e["status"] == "done":
            finals[e["id"]] = e["tgt_text"]
    shown = 0
    for line_id, (extends, stable) in sorted(last.items()):
        final = finals.get(extends if extends is not None else line_id)
        if final and shown < 3:
            print(session, "| ổn định:", stable, "\n   | bản cuối:", final)
            shown += 1
EOF
```

(thay `T`). Ghi vào báo cáo (mục "Kiểm cảm quan") có câu nào phần ổn định sai nghĩa so với bản cuối không. Chữ dịch chỉ được chép vào báo cáo dưới dạng nhận xét ngắn, không dán nguyên đoạn (dữ liệu là câu đọc FLEURS, không phải nội dung người dùng, nhưng báo cáo chỉ cần nhận xét).

- [ ] **Step 13: Viết báo cáo cổng**

Tạo `bench/2026-10-10-do-tre/results/buoc2-cong.md` theo khung dưới. Mỗi chỗ trong `‹…›` điền đúng số hay nội dung nêu trong đó, lấy từ đầu ra của các bước trên; không để sót chỗ nào.

````markdown
# Bước 2: bản thử "dịch trong lúc người nói chưa dừng", số đo cho cổng (‹ngày đo, YYYY-MM-DD›)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-02-ban-thu-pipeline.md`, Task 19; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §9 bước 2, §10. Cổng: chủ dự án chốt ngưỡng ngắt câu
(QĐ4) và (n, k) theo số đo này.

## Điều kiện đo

- Máy: ‹`machine.cpu`›, ‹`machine.ram_gb`› GB, ‹`machine.os`›.
- Code: nhánh `dich-trong-luc-noi`, commit ‹hash ở Step 1›; `asr-worker` ‹dòng `machine.asr_worker`›; `llama-server` b11146.
- Cấu hình: ngưỡng người dùng 50 ms (`--end-silence-ms 50`); ngưỡng của chế độ này theo nhãn; (n, k) mặc định là en, vi 2/1;
  zh 2/2; ja, ko 3/2; thận trọng là en, vi 3/1; zh 3/2; ja, ko 3/3; mạnh là 2/1 cho mọi tiếng; mọi ngưỡng khác là
  `PipelineConfig::default()`.
- Mốc: `buoc1-sau-*` của kế hoạch 01 (chế độ thường, 50 ms, sau A2–A5).
- Chủ dự án đã ‹ghi những gì đã tắt, như lời chủ dự án›; máy cắm sạc. Trước và sau lượt đo:

  ```
  ‹hai dòng của target/do-tre/buoc2-dieu-kien.txt›
  ```

## Cách chạy

```
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<N> -- --streaming --streaming-end-silence-ms <N>
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<T>-than-trong -- --streaming \
  --streaming-end-silence-ms <T> --tgt-agree en:3:1,vi:3:1,zh:3:2,ja:3:3,ko:3:3
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc2-es<T>-manh -- --streaming \
  --streaming-end-silence-ms <T> --tgt-agree en:2:1,vi:2:1,zh:2:1,ja:2:1,ko:2:1
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc2-es<T> -- --streaming --streaming-end-silence-ms <T>
python3 bench/2026-10-10-do-tre/summarize_sessions.py --targets <file.json>...
```

## Kết quả

### (a) Ngưỡng ngắt câu, gói Chuẩn, (n, k) mặc định

‹dán bảng theo tiếng và hai bảng mục tiêu của target/do-tre/buoc2-a-bang.md (bỏ bảng theo file, đã có trong các JSON)›

So với mốc `buoc1-sau-chuan` (mỗi ô "mốc → bản thử (chênh)"):

‹dán target/do-tre/buoc2-a-so-sanh.md›

Ngưỡng chọn cho (b) và lý do: ‹nội dung target/do-tre/buoc2-chon.txt›.

### (b) (n, k), gói Chuẩn, ngưỡng ‹T1› (và ‹T2›)

‹dán hai bảng mục tiêu của target/do-tre/buoc2-b-bang.md, chỉ các nhóm của (b) và nhóm (n, k) mặc định cùng ngưỡng›

### (c) Gói Nhẹ, ngưỡng ‹T›

‹dán hai bảng mục tiêu và bảng so của target/do-tre/buoc2-c-bang.md›

### Kiểm cảm quan

‹nhận xét của Step 12: có hay không câu nào phần dịch ổn định sai nghĩa so với bản cuối; nếu có, ở tiếng nào, bộ (n, k) nào›

## So với mục tiêu §10.2 (gói Chuẩn, cấu hình đề xuất)

| Chỉ số | Mục tiêu | Số đo | Đạt |
|---|---|---|---|
| Trễ của chữ tạm, theo từ, p50 | ≤ 1 200 ms mọi tiếng | ‹5 số theo tiếng› | ‹đạt / không, tiếng nào› |
| Trễ của chữ ổn định, theo từ, p50 | ≤ 2 000 ms en, vi, ko; ≤ 3 000 ms zh, ja | ‹5 số› | ‹…› |
| Từ lúc bắt đầu nói tới chữ dịch đầu tiên, p90 | ≤ 2 000 ms | ‹số› | ‹…› |
| Độ nháy tầng ổn định | ≤ 10% | ‹số› | ‹…› |
| A2 (p50, p90, chữ đầu p50), session tệ nhất | ≤ 2 000, 3 000, 1 000 ms | ‹3 số› | ‹…› |
| CPU cả máy, session tệ nhất | ≤ 30% | ‹số› | ‹…› |
| Tự tắt trên M4 Pro | không xảy ra | ‹số session tự tắt› | ‹…› |
| Gói Nhẹ (chỉ báo cáo) | — | ‹tạm p50, ổn định p50 gộp, A2 p50 tệ nhất› | — |

## Đề xuất cho cổng

- **QĐ4, ngưỡng ngắt câu của chế độ này:** ‹T› ms, vì ‹so sánh ngắn với các ngưỡng còn lại: trễ ổn định, số đoạn, A2, độ nháy›.
- **(n, k) theo tiếng nguồn:** ‹giữ mặc định / đổi tiếng nào thành bao nhiêu›, vì ‹độ nháy, trễ ổn định, kiểm cảm quan›.
- **Mục tiêu §10.2:** ‹đạt hết / chưa đạt mục nào›. ‹Nếu chưa đạt mục trễ nào: theo spec §9 phải quay lại thiết kế trước bước 3;
  nêu mục chưa đạt, nguyên nhân thấy được từ số đo (nhịp T, mức bận, thời gian chép từng phần), và hướng sửa đề xuất.›

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
- Tầng ổn định của dòng đang nói tính theo tỉ lệ (spec §10.1); tầng tạm dựa vào việc gắn dòng với phần chữ của lượt cuối
  (QĐ10 của kế hoạch 02).
- `latency-bench` phát WAV 16 kHz thẳng vào engine, nên không gồm phần thu âm và resample (A3), và không có thanh phụ đề
  (vẽ dòng là việc của kế hoạch 03).
````

- [ ] **Step 14: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/2026-10-10-do-tre/results/buoc2-*.json bench/2026-10-10-do-tre/results/buoc2-cong.md
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): số đo bản thử dịch trong lúc nói theo lưới tham số, báo cáo cổng (bước 2)

Gói Chuẩn với bốn ngưỡng ngắt câu 50, 200, 400, 600 ms; hai bộ (n, k) ở ngưỡng tốt nhất; gói Nhẹ ở ngưỡng chọn. Báo cáo
so với mốc chế độ thường và mục tiêu §10.2, kèm đề xuất cho QĐ4 và (n, k).

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `status --short` trước khi add chỉ có các file `buoc2-*.json` và `buoc2-cong.md`; commit có đúng các file đó (42–54 JSON và một `.md`).

---

## Task 20: CỔNG — trình chủ dự án, DỪNG

Spec §9 bước 2: "chủ dự án chốt ngưỡng ngắt câu và các tham số theo số đo. Nếu không đạt các mục tiêu trễ ở §10.2 thì quay lại thiết kế trước khi sang bước 3." Tổng quan: "02 (dừng ở cổng, chờ chủ dự án)".

**Files:** không sửa file nào.

- [ ] **Step 1: Gửi báo cáo cho chủ dự án**

Gửi điều phối viên để chuyển cho chủ dự án (điền `‹…›` từ `buoc2-cong.md`):

> Bản thử "dịch trong lúc người nói chưa dừng" đã đo xong (báo cáo: `bench/2026-10-10-do-tre/results/buoc2-cong.md`, commit ‹hash›).
>
> Tóm tắt, gói Chuẩn, cấu hình đề xuất (ngưỡng ‹T› ms, (n, k) ‹…›):
> - chữ tạm theo từ p50: ‹…›; chữ ổn định theo từ p50: ‹…›; đầu câu → chữ dịch p90: ‹…›;
> - độ nháy ổn định: ‹…›; A2 tệ nhất: ‹…›; CPU tệ nhất: ‹…›;
> - mục tiêu §10.2: ‹đạt hết / chưa đạt: …›.
>
> Cần anh quyết:
> 1. **QĐ4:** ngưỡng ngắt câu của chế độ này: 50, 200, 400 hay 600 ms? Em đề xuất ‹T› ms.
> 2. **(n, k) theo tiếng nguồn:** giữ mặc định (en, vi 2/1; zh 2/2; ja, ko 3/2), dùng bộ thận trọng, bộ mạnh, hay số khác? Em đề xuất ‹…›.
> 3. ‹Chỉ khi chưa đạt mục tiêu trễ:› quay lại thiết kế (theo §9), hay chấp nhận số hiện có để sang bước 3?

- [ ] **Step 2: DỪNG**

- **Không** làm Task 21, **không** bắt đầu kế hoạch 03, cho tới khi có trả lời của chủ dự án cho cả ba câu (câu 3 chỉ khi có hỏi).
- Ghi nguyên văn trả lời vào `target/do-tre/buoc2-quyet-dinh.txt` (không commit), kèm ngày.
- Chủ dự án chọn quay lại thiết kế: dừng hẳn kế hoạch này ở đây và báo điều phối viên; spec phải sửa trước, rồi mới lập kế hoạch mới.
- Chủ dự án hỏi thêm số đo: trả lời từ các file JSON đầy đủ ở `target/do-tre/sessions/`; cần đo thêm cấu hình nào thì làm như Task 19 (Step 2–5, nhãn mới `buoc2-…`), bổ sung báo cáo, commit, rồi hỏi lại.

---

## Task 21: Sau cổng: đặt mặc định, sửa spec và tổng quan

Chỉ làm khi `target/do-tre/buoc2-quyet-dinh.txt` có quyết định của chủ dự án cho QĐ4 và (n, k), và quyết định đó không phải "quay lại thiết kế".

Ký hiệu trong task này (thay bằng đúng số của quyết định trước khi làm):
- `ES`: ngưỡng của QĐ4 (một trong 50, 200, 400, 600);
- `EN`, `VI`, `ZH`, `JA`, `KO`: cặp `(n, k)` đã chốt cho từng tiếng nguồn;
- `NGAY`: ngày chủ dự án quyết (YYYY-MM-DD).

Ví dụ: chủ dự án chốt 400 ms và giữ (n, k) mặc định thì `ES` = 400, `EN` = `VI` = (2, 1), `ZH` = (2, 2), `JA` = `KO` = (3, 2); code của Step 3 chỉ đổi chú thích.

**Files:**
- Modify: `crates/pipeline/src/config.rs` (`StreamingConfig`: doc của `end_silence_ms`, `Default`; test `streaming_defaults_are_the_numbers_of_the_spec`)
- Modify: `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` (dòng 6; bảng §2 hàng QĐ4; §4.4; §4.7)
- Modify: `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md` (H3; mục 3 của "Điều chỉnh so với spec")

- [ ] **Step 1: Kiểm quyết định đã có**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cat target/do-tre/buoc2-quyet-dinh.txt
```

Expected: có ngày, QĐ4 và (n, k). Không có thì quay lại Task 20 Step 2.

- [ ] **Step 2: Sửa test ghim mặc định (thấy đỏ nếu số đổi)**

`crates/pipeline/src/config.rs`, trong `streaming_defaults_are_the_numbers_of_the_spec`: thay

```rust
        assert_eq!(
            (s.min_partial_speech_ms, s.min_new_speech_ms, s.end_silence_ms),
            (1_000, 300, 400)
        );
```

bằng (thay `ES`)

```rust
        // QĐ4, chốt ở cổng của kế hoạch 02 (`bench/2026-10-10-do-tre/results/buoc2-cong.md`).
        assert_eq!(
            (s.min_partial_speech_ms, s.min_new_speech_ms, s.end_silence_ms),
            (1_000, 300, ES)
        );
```

và thay

```rust
        assert_eq!(
            agree,
            [("en", 2, 1), ("vi", 2, 1), ("zh", 2, 2), ("ja", 3, 2), ("ko", 3, 2)]
        );
```

bằng (thay từng cặp bằng số đã chốt)

```rust
        assert_eq!(
            agree,
            [("en", EN.n, EN.k), ("vi", VI.n, VI.k), ("zh", ZH.n, ZH.k), ("ja", JA.n, JA.k), ("ko", KO.n, KO.k)]
        );
```

(ví dụ giữ mặc định: `[("en", 2, 1), ("vi", 2, 1), ("zh", 2, 2), ("ja", 3, 2), ("ko", 3, 2)]`, tức khối không đổi).

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib config::tests::streaming_defaults_are_the_numbers_of_the_spec
```

Expected: `FAILED` nếu `ES` khác 400 hay (n, k) khác mặc định; `ok` nếu quyết định trùng mặc định tạm (khi đó Step 3 chỉ đổi chú thích).

- [ ] **Step 3: Đặt mặc định**

`crates/pipeline/src/config.rs`: thay

```rust
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). Mặc định tạm 400; chốt ở cổng của kế hoạch 02.
    pub end_silence_ms: u64,
```

bằng (thay `ES`, `NGAY`)

```rust
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). ES ms: QĐ4, chủ dự án chốt ở cổng của kế hoạch 02 ngày
    /// NGAY (`bench/2026-10-10-do-tre/results/buoc2-cong.md`).
    pub end_silence_ms: u64,
```

thay

```rust
            end_silence_ms: 400,
```

bằng

```rust
            end_silence_ms: ES,
```

và thay

```rust
            tgt_agree: vec![
                LangAgree::new("en", 2, 1),
                LangAgree::new("vi", 2, 1),
                LangAgree::new("zh", 2, 2),
                LangAgree::new("ja", 3, 2),
                LangAgree::new("ko", 3, 2),
            ],
```

bằng (thay từng cặp; giữ thứ tự en, vi, zh, ja, ko)

```rust
            // Chốt ở cổng của kế hoạch 02 (spec 2026-10-10 §4.4).
            tgt_agree: vec![
                LangAgree::new("en", EN.n, EN.k),
                LangAgree::new("vi", VI.n, VI.k),
                LangAgree::new("zh", ZH.n, ZH.k),
                LangAgree::new("ja", JA.n, JA.k),
                LangAgree::new("ko", KO.n, KO.k),
            ],
```

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo test --locked -p latency-bench
cargo clippy --locked -p pipeline -p latency-bench --all-targets -- -D warnings
cargo fmt --all -- --check
```

Expected: mọi test đạt (test của engine và test tích hợp đặt ngưỡng rõ, không dựa vào mặc định); clippy và fmt sạch.

- [ ] **Step 4: Sửa spec**

`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`: thay

```markdown
- Ngưỡng ngắt câu của chế độ mới chưa chốt; chốt ở cổng sau bước 2 (§9).
```

bằng

```markdown
- Ngưỡng ngắt câu của chế độ mới và (n, k) chốt ở cổng sau bước 2 ngày NGAY (QĐ4; số đo:
  `bench/2026-10-10-do-tre/results/buoc2-cong.md`).
```

thay

```markdown
| QĐ4 | Ngắt câu ở chế độ này | Chốt sau khi đo các ngưỡng 50, 200, 400 và 600 ms ở bước 2 (§9). |
```

bằng

```markdown
| QĐ4 | Ngắt câu ở chế độ này | ES ms, chốt ở cổng sau bước 2 (NGAY) sau khi đo các ngưỡng 50, 200, 400 và 600 ms (`bench/2026-10-10-do-tre/results/buoc2-cong.md`). |
```

trong §4.4, thay bảng

```markdown
  | Tiếng nguồn | n | k |
  |---|---|---|
  | en, vi | 2 | 1 |
  | zh | 2 | 2 |
  | ja, ko | 3 | 2 |
```

bằng bảng đúng số đã chốt (một hàng mỗi tiếng nếu các tiếng trong một hàng cũ không còn cùng số), và thay câu

```markdown
- Các giá trị trên chỉ là điểm xuất phát. Bước 2 (§9) chỉnh lại theo số đo trễ và độ nháy, vì chốt sớm có thể làm sai nghĩa. Nghiên cứu §2 đã thấy điều này với câu tiếng Nhật và tiếng Trung.
```

bằng

```markdown
- Các giá trị trên chốt ở cổng sau bước 2 (NGAY), theo số đo trễ và độ nháy, và kiểm cảm quan câu tiếng Nhật, tiếng Trung
  (`bench/2026-10-10-do-tre/results/buoc2-cong.md`), vì chốt sớm có thể làm sai nghĩa (nghiên cứu §2).
```

trong §4.7, thay

```markdown
- `streaming.end_silence_ms` được chốt ở cổng sau bước 2, chọn một trong 50, 200, 400 và 600 ms (QĐ4).
```

bằng

```markdown
- `streaming.end_silence_ms` = ES ms (QĐ4, chốt ở cổng sau bước 2 ngày NGAY). Với ngưỡng người dùng mặc định 50 ms, chế độ
  này đóng đoạn sau ES ms im lặng.
```

- [ ] **Step 5: Sửa tổng quan**

`docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`: trong H3, thay

```rust
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). Mặc định tạm 400; chốt ở cổng của kế hoạch 02.
    pub end_silence_ms: u64,        // 400
```

bằng

```rust
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). QĐ4, chốt ở cổng của kế hoạch 02 (NGAY).
    pub end_silence_ms: u64,        // ES
```

và (nếu (n, k) đổi) thay

```rust
    pub tgt_agree: Vec<LangAgree>,  // en 2/1, vi 2/1, zh 2/2, ja 3/2, ko 3/2
```

bằng dòng có đúng số đã chốt, cùng dạng chú thích; rồi trong "Điều chỉnh so với spec", thay

```markdown
3. **Mặc định tạm `streaming.end_silence_ms = 400`** cho tới cổng của kế hoạch 02. Nhiệm vụ cuối của kế hoạch 02 đặt lại theo quyết định của chủ dự án (QĐ4), và sửa spec theo.
```

bằng

```markdown
3. **`streaming.end_silence_ms = ES`**, chủ dự án chốt ở cổng của kế hoạch 02 ngày NGAY (QĐ4); spec đã sửa theo (Task 21 của kế hoạch 02).
```

- [ ] **Step 6: Kiểm và commit**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
grep -n "chưa chốt\|Mặc định tạm 400" docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md \
  docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md crates/pipeline/src/config.rs
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/config.rs docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md \
  docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): đặt mặc định của chế độ dịch trong lúc nói theo quyết định ở cổng (QĐ4)

streaming.end_silence_ms và (n, k) theo tiếng nguồn đặt theo số đo của bước 2 (buoc2-cong.md) và quyết định của chủ dự
án; test ghim mặc định, spec (trạng thái, QĐ4, §4.4, §4.7) và H3 của tổng quan sửa theo.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `grep` không in gì; `branch --show-current` in `dich-trong-luc-noi`; commit có đúng ba file. Sau commit này mới được bắt đầu kế hoạch 03.

---
## Tự rà

### Phủ spec

| Yêu cầu (spec 2026-10-10) | Task |
|---|---|
| §3 Đơn vị (chữ với zh, ja; từ với tiếng khác), khóa so khớp NFC, chữ thường, bỏ dấu câu | 2 |
| §4.1 Ảnh chụp đoạn mở: id sẽ nhận khi đóng, `start_ms`, âm thanh từ đầu phần đệm, tiếng nói | 6 |
| §4.1 Chép theo nhịp: chế độ bật và chưa tự tắt, ≥ `min_partial_speech_ms`, qua T, thêm ≥ `min_new_speech_ms`, không có đoạn đóng chờ | 6, 12 |
| §4.1 Chép khi vừa hết tiếng nói: ngưỡng > 2 khung, khung im lặng thứ hai, có tiếng nói mới, ≥ 250 ms, không chờ T | 6, 12 |
| §4.1 Đúng `Transcribe` bản 2; ngôn ngữ cho phép ở lần đầu rồi khóa; `prompt_tokens`, `prev_lang`, `audio_ctx` như lượt cuối | 11 |
| §4.1 Hàng đợi: đoạn đóng trước, một yêu cầu chép từng phần, mới thay cũ; luật gộp, bỏ chỉ cho đoạn đóng | 7 |
| §4.1 Lọc như §6.4 spec chính; bị lọc thì không cập nhật; lỗi thì không gửi lại | 11 (QĐ9) |
| §4.2 LocalAgreement-2 cho chữ nguồn, giữ lại 1 từ hay 2 chữ, hiện chữ mới nhất, chỉ dài thêm | 3, 11 |
| §4.3 Chữ nguồn đem dịch; nối tiếp câu trong cửa sổ ghép (cùng ngôn ngữ, chưa chốt, chưa đạt trần) | 11, 13 (QĐ6) |
| §4.3 Request như lượt cuối (mẫu, thuật ngữ, stream, temperature 0, repeat 1,05, `max_tokens`) | 9, 13 |
| §4.3 Prefill là tin nhắn assistant cuối, không có khoảng trắng cuối; b11146 stream lại prefill | 3, 8, 13, 15 |
| §4.3 Hậu xử lý; vi phạm thì bỏ, không thử lại; dấu kết câu ở cuối không hiện; câu đã là ngôn ngữ đích không dịch | 2, 9, 11, 13 |
| §4.4 Đơn vị theo ngôn ngữ đích; LocalAgreement-n trừ k; (n, k) theo tiếng nguồn; bản bị hủy không tính; chỉ dài thêm | 1, 3, 13 |
| §4.5 Lượt cuối như cũ; dòng giữ chữ tới khi phụ đề tương ứng chốt; gỡ khi chốt, bị lọc, bị bỏ | 11 (QĐ5) |
| §4.6 Đoạn đóng trước ở `asr-worker`; tối đa một bản tạm, mới hủy cũ; lượt cuối ưu tiên và hủy bản tạm; không gửi bản tạm khi lượt cuối còn việc; cờ hủy ở mỗi gói và trước request | 7, 9, 13 (H1 của kế hoạch 01) |
| §4.7 Ngưỡng = max(ngưỡng người dùng, `streaming.end_silence_ms`); cửa sổ ghép theo ngưỡng đang dùng; chế độ thường giữ nguyên | 12 (QĐ2, QĐ3) |
| §5 Vòng cập nhật; T = 1,5 × trung vị, kẹp [700, 2000], 1000 ms khi chưa đủ 3 vòng | 4, 13 |
| §5 Tự tắt tới hết phiên, ngưỡng về ngưỡng người dùng từ đoạn kế tiếp, báo giao diện, log không có chữ | 4, 14 |
| §5 Tắt ngay từ đầu phiên: engine báo chỉ báo khi `!streaming_supported` (app quyết máy đủ sức ở kế hoạch 03) | 10 |
| §5 Mọi ngưỡng trong `PipelineConfig.streaming`, đổi được qua manifest, giá trị vô lý bị `validate` từ chối | 1 |
| §6.2 `subtitle://live` (`LiveLine`), `subtitle://live-end` (`LiveEnd`); chỉ luồng phụ đề phát | 5, 10, 11 |
| §6.3 Công tắc đổi giữa phiên, có tác dụng từ đoạn kế tiếp; chỉ báo khi tắt từ đầu hay tự tắt | 10, 12, 14 |
| §6.4 Bản tạm chỉ trong bộ nhớ, không vào log; hạn mức theo lượt cuối | 11–15 (test log ở 15) |
| §7 Lỗi: chép từng phần lỗi, bản tạm lỗi hay bị cắt, `llama-server` không dùng được, máy không theo kịp, đoạn bị lọc hay bỏ | 11, 13, 14 |
| §9 bước 2: đo 50, 200, 400, 600 ms và vài bộ (n, k) trên 6 session S6, hai gói; cổng; đặt mặc định | 18, 19, 20, 21 |
| §10.1 Trễ theo từ hai tầng, đầu câu → chữ dịch đầu, độ nháy hai tầng, mức bận, A2 như cũ | 16, 17 (mức bận và A2 của kế hoạch 01) |
| §10.2 Bảng so mục tiêu | 17 (`--targets`), 19 |
| §11 Unit test: chốt chữ nguồn và chữ dịch (từ, chữ CJK, dấu tiếng Việt, dấu câu, giữ lại đuôi, chỉ dài thêm); prefill không có khoảng trắng cuối; nhịp và tự tắt; ưu tiên và hủy; chuyển từ dòng đang nói sang phụ đề cuối khi ghép câu, bị lọc, bị bỏ, dừng phiên (harness `Composer`) | 2, 3, 4, 8, 11, 13, 14 |
| §11 Engine với `fake_asr_worker` và `fake_llama_server`, gồm việc stream lại prefill | 15 |
| §11 Giao diện | kế hoạch 03 |
| §14 Phần mới đặt ở module riêng (`streaming`), `Composer` chỉ thêm phần nối | 2–4, 6 |

### Khớp hợp đồng của kế hoạch 00

- **H1:** `translate_live` và mọi việc dịch truyền `cancel: Some(&job.cancel)`; `translate` giữ đúng hành vi của kế hoạch 01 sau khi tách `stream_once` (Task 9 chạy lại cả ba test H1).
- **H2:** `grow`, `dispatch`, `settle` ghi nguyên bản mới có `held`, `fresh` đúng như kế hoạch 01; `MtDelta`, `MtRetry` không đổi.
- **H3:** tên, kiểu, mặc định và bảng `validate` đúng từng khóa (Task 1); mặc định cuối theo cổng (Task 21).
- **H4:** mọi tên của H4 có mặt; thêm `Stabilizer::preview`, `PartialKind`, `PartialScheduler` (ngoài H4, cùng module, chỉ luật thuần).
- **H5:** `LiveLine`, `LiveEnd` đúng tên trường và serde; thêm `Default` cho `LiveLine`.
- **H6:** `EventSink::live/live_end` mặc định bỏ qua; `Indicators.streaming_unavailable`; `EngineConfig.streaming_supported/streaming_enabled`; `Engine::set_streaming_enabled`; chế độ có hiệu lực, ngưỡng, cửa sổ ghép và chỉ báo đúng luật.
- **H7, H9:** cờ `--streaming`, `--streaming-end-silence-ms`, `--tgt-agree`; tên thật của kế hoạch 01 (`Recorded`, `Timed { t_ms, ev }`, `Summary`, `RunInfo` ở khóa `run`) được giữ, `Recorded` thêm `Live`, `LiveEnd`.

### Kiểm placeholder và kiểu

- Mọi bước code có khối code đầy đủ; các chỗ `‹…›` chỉ nằm trong khung báo cáo đo (Task 19) và lời nhắn gửi chủ dự án (Task 20), điền từ đầu ra đo; ký hiệu `ES`, `EN`… của Task 21 là số do chủ dự án quyết ở cổng, có ví dụ cụ thể.
- Kiểu và hàm dùng trong kế hoạch đều có sẵn trong code sau kế hoạch 01 (đã đối chiếu: `OpenSentence::accepts`, `joiner`, `merge_window_ms`, `display_text`, `verdict`, `Evidence`, `pcm_skip`, `audio_ctx_for_samples`, `PromptHistory::prompt_for`, `metrics::percentile`, `glossary::normalize`, `sentence::SENTENCE_END`, `Option::take_if`, `is_none_or`), hoặc được định nghĩa trong kế hoạch này.
