# Phân biệt người nói, kế hoạch 02: worker và pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **KHÔNG commit, KHÔNG push.** Chủ dự án chưa cho phép commit cho tính năng này. Mọi thay đổi để ở working tree; mỗi Task kết thúc bằng bước "Mốc kiểm" (chạy đúng test, clippy, fmt liên quan; `git status --short` chỉ để đối chiếu). Không chạy `git add/commit/push/stash/reset/checkout/clean/rebase`. Chỉ commit khi chủ dự án nói rõ.

**Goal:** có `speaker-worker` nhận giọng hoàn chỉnh (B' + A2, giao thức, ưu tiên thấp, kiểm toàn vẹn), client trong app, cờ nguồn ở bộ trộn, luật ghép câu và hàng đợi biết giọng, `Subtitle.speaker` và sự kiện tới giao diện, model nhận giọng đọc từ manifest; tính năng **tắt với người dùng cuối** (chỉ bật được ở bản debug bằng cờ nội bộ).

**Architecture:** Crate mới `speaker-protocol` (kiểu thông điệp, khung postcard ≤ 4 MiB, `SpeakerConfig`) dùng chung cho app, `audio-capture`, `pipeline` và worker. `speaker-worker` thêm binary: vòng đọc/ghi khung, `Worker` (trạng thái phân cụm, không I/O), `onnx_steps` (chạy đồ thị từng nút, cách B'), A2 (chỉ nhúng 4 s đầu). Trong `pipeline`: luồng VAD chép tối đa 4 s đầu phần tiếng nói của mỗi đoạn vào kênh 4 đoạn bằng `try_send` (không bao giờ chờ); `speaker_client` chạy và giám sát worker trên luồng riêng; luồng phụ đề nhận `Assign`/`Voices`/`Merged`, gắn giọng cho phụ đề và áp luật "không ghép hai giọng đã biết khác nhau". App (`src-tauri/src/speaker/`) quyết bật, tìm binary và model, kiểm SHA-256 trước mỗi lần chạy, phát sự kiện.

**Tech Stack:** Rust 1.98 (edition 2024), `candle-core`/`candle-onnx` 0.11.0 (giữ nguyên, cùng bản với `pipeline`), `postcard` 1.1.3, `serde` 1.0.229, `thiserror` 2.0.21 (đều đã có trong workspace), `rayon` 1.12.0 và `prost` 0.14.4 (đã có trong `Cargo.lock` qua candle; là bản ổn định mới nhất, kiểm crates.io ngày 2026-10-26), `libc` 0.2.189 và `sha2` 0.11.0 (bản workspace đang khóa; bản ổn định mới nhất là 0.2.191 và 0.11.1, xem mục "Điều cần chủ dự án quyết" ở cuối file), `windows` 0.62.2 (mới nhất).

**Spec:** `docs/superpowers/specs/2026-10-26-phan-biet-nguoi-noi-design.md` §4 (kiến trúc, giao thức, luồng dữ liệu, luật ghép câu, model), §5 (nhận giọng), §9 (dữ liệu, phần sự kiện), §10 (bảo mật), §11 (hiệu năng), §13 mục 2. Kết quả spike: `bench/2026-10-26-nguoi-noi/results/tong-hop.md` (mục "Ghi cho kế hoạch 02"), `results/ram.md` (mục "Ghi cho kế hoạch 02").

**Kế hoạch đi kèm:** `2026-10-26-phan-biet-nguoi-noi-02b-do-nghiem-thu.md` (đo A-spk1/2/4/5 qua worker thật, soak test, đóng gói, CI bảo mật, Windows, tổng kết). File 02b chạy **sau** khi xong mọi Task của file này: nó dùng `speaker_client`, binary `speaker-worker` và các cờ của `latency-bench` mà file này tạo.

**Quy ước:**
- `W` = gốc worktree nhánh `phan-biet-nguoi-noi` (thư mục `meeting-translator-work/phan-biet-nguoi-noi`, cạnh thư mục chính); `M` = thư mục chính của repo (chỉ đọc; có `models/` không nằm trong git); `DATA` = `$W/../data-nguoi-noi` (ngoài mọi repo: venv, model nhúng giọng, AMI, Common Voice); `B` = `$W/bench/2026-10-26-nguoi-noi`. Đặt bốn biến này theo máy của bạn trước khi chạy lệnh.
- Shell trở về thư mục chính sau mỗi lệnh: **mọi lệnh bắt đầu bằng `cd $W &&`** (hay đường dẫn tuyệt đối tương ứng).
- **Mọi lệnh cargo đặt `CARGO_TARGET_DIR=$W/target`.** Không `cargo clean`, không xóa gì trong `target/`.
- **Mọi lệnh `--release` (build hay test) đặt thêm `MACOSX_DEPLOYMENT_TARGET=14.2`**, như `scripts/release/build-sidecars-macos.sh`: binary đo và binary phát hành dựng cùng một cách (macOS tối thiểu 14.2), và không phải build lại `target/release` vì đổi biến giữa các lần.
- **Đĩa:** trước mỗi bước build nặng (Task có ghi "build nặng", và mọi lệnh `--release`) chạy `cd $W && df -h . | tail -1`; cột còn trống dưới 22 GB thì **dừng và báo chủ dự án** (không tự dọn). Ưu tiên `cargo test -p <crate>` hẹp; chỉ build release khi cần đo (file 02b).
- Build chéo Windows (chỉ kiểm kiểu, không link): đặt `PKG_CONFIG_x86_64_pc_windows_msvc="$W/scripts/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1` như kế hoạch 01 Task 13 (không có thì `onig_sys` cố biên dịch oniguruma cho Windows). Không dùng `cargo-xwin` (đòi đồng ý điều khoản của Microsoft).
- Không mở hay đụng Teams, Chrome, System Settings, âm lượng, micro của máy. Bước nào cần chạy app thật thì ghi **(cần chủ dự án)**.
- Repo GitHub công khai: không ghi đường dẫn cá nhân hay tên người vào file nào của repo.

---

## Quyết định thiết kế của kế hoạch này (ngoài chữ của spec)

1. **Giao thức tối thiểu ở 02** (`PROTOCOL_VERSION = 1`). App gửi `Load {model_path, config}`, `SessionStart {unix_ms}`, `Segment(SegmentAudio)`, `Shutdown`; worker trả `Ready {protocol_version, model_ok}`, `Assign {segment_id, voice, confidence}`, `Voices {voices: [VoiceInfo {voice, speech_ms, mic}]}`, `Merged {from, into}`, `Error {segment_id, kind, message}`; `Load` có thêm `model_sha256` (xem mục 5). **Để kế hoạch 04:** `Speech`, `SetNames`, `ReaderState`, trường `names_enabled`, `recipe_json` của `Load`, `reader_platform` của `Ready`, `name`, `name_source`, `room_index` của `VoiceInfo`, `participants`. Lý do: ở 02 không có bên tạo hay bên dùng chúng, và hình dạng của chúng phụ thuộc bộ đọc của 04; thêm biến thể ở cuối enum và trường mới (kèm tăng `PROTOCOL_VERSION`) không đổi kiến trúc vì app và worker luôn build cùng nhau. `SessionStart` có ngay ở 02: nó định nghĩa ranh giới phiên (xóa mọi giọng) và mốc giờ mà 04 cần. Khác chữ của spec: `Load` mang `config: SpeakerConfig` (spec không nói ngưỡng `speaker_config` của manifest tới worker bằng đường nào) và `model_sha256: Option<String>`; `VoiceInfo` thêm `speech_ms`; `Error` thêm `segment_id: Option<u64>` (như `asr-protocol`) để app biết đoạn nào lỗi mà không phải chờ hết giờ.
2. **`SpeakerConfig` chuyển từ `speaker-worker` sang `speaker-protocol`** (kèm `validate()`), để app kiểm `speaker_config` của manifest bằng đúng luật worker dùng mà không link `speaker-worker`. `speaker_worker::cluster` giữ `pub use` nên mã cũ (`latency-bench`) không đổi. Ngưỡng 0,5 s có một nguồn: `speaker_protocol::MIN_EMBED_MS`; `embed::MIN_SAMPLES` tính từ đó.
3. **Cờ nguồn** (spec §5.5): bộ trộn gắn cờ cho **từng mẫu** ra (quyết theo khung 10 ms của cổng nhường lời, áp từ khung sau như cổng), luồng VAD gộp thành cờ của từng khung 32 ms (đa số), đoạn lấy đa số khung. Lý do: bộ trộn không biết ranh giới khung VAD. "Micro có tiếng" dùng ngưỡng riêng −50 dBFS; "âm thanh máy có tiếng" dùng ngưỡng nhường lời (−55 dBFS trong app). Chế độ chỉ âm thanh máy: mọi mẫu `System`; chỉ micro: `Mic`.
4. **Cờ bật nội bộ:** tính năng chạy khi và chỉ khi bản **debug** có `AI_TRANSLATOR_DEV_SPEAKER=true` trong `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế `AI_TRANSLATOR_DEV_PRO`). Mã đọc biến nằm sau `cfg(debug_assertions)`; chuỗi tên biến thêm vào `DEV_GATE_MARKERS` nên cổng `no-dev-gate` chặn nếu nó lọt vào bản phát hành. **Bản phát hành: luôn tắt.** Không thêm khóa cài đặt ở 02: khóa mặc định `false` sẽ được ghi vào file cài đặt của mọi người dùng, rồi kế hoạch 03 không "bật sẵn" được nữa. Kế hoạch 03 thay cờ này bằng `speakerDiarization` (mặc định `true`).
5. **Model nhận giọng:** `Manifest` đọc khóa gốc `speaker`, `speaker_config` dạng thô và kiểm **lỏng**: mục sai hay cần app mới hơn thì chỉ bỏ phần nhận giọng, manifest và các gói vẫn dùng được (hai test của kế hoạch 01 giữ nguyên). File tải vào kho model như file khác (`installed.json`), không thuộc gói nào; tải nền khi bắt đầu một phiên có bật cờ mà máy chưa có file (02 chưa có giao diện tiến độ; kế hoạch 03 thêm "đang tải" ở Cài đặt). SHA-256 của model kiểm đầy đủ trước mỗi lần chạy worker (model là đầu vào của bộ đọc protobuf trong worker); **worker tự băm lại đúng các byte nó đọc và dựng đồ thị từ chính các byte đó** (`Load.model_sha256`, `Embedder::load_checked`), nên file bị thay giữa lúc app kiểm và lúc worker đọc cũng bị từ chối (`Ready {model_ok: false}`). Binary: trước mỗi lần chạy, app kiểm cả thư mục `binaries/` bằng `integrity::verify` như `asr-worker` (mọi file trong bảng SHA-256 build sẵn, không có thư viện lạ). Bản dev chưa có model trong kho thì dùng `models/eres2net-sv-en-voxceleb-16k.onnx` của thư mục model dev (không kiểm SHA-256, như model Phase 0). **Đăng model lên R2 và mục `speaker` của `models.json` để kế hoạch 07** (cần khóa của chủ dự án; `min_app_version` phải là bản phát hành đầu tiên có tính năng); `pnpm models:update` cũng sửa ở 07.
6. **Khởi động lại và quá tải** (spec §4.1, §11): chết thì chạy lại sau 1, 2, 5 s; chết lần thứ 3 trong phiên thì tắt tới hết phiên. Đọc theo chữ "chết 3 lần thì tắt" của spec: chỉ có hai lần chạy lại (sau 1 s và 2 s); mức 5 s chỉ dùng nếu `max_deaths` được nâng (xem "Điều cần chủ dự án quyết"). Mã giọng của lần chạy sau được cộng mã lớn nhất đã thấy, để "Người N" không trùng. **Quá tải** = còn đoạn chưa có `Assign` (hay luồng VAD vừa phải bỏ đoạn) liên tục 30 s, kể cả worker treo: kill worker, tắt tới hết phiên, không chạy lại. Bậc "tạm dừng đọc tên trước" để kế hoạch 04 (02 chưa có đọc tên).
7. **Giọng của phụ đề** = giọng chiếm nhiều thời lượng nhất trong các đoạn đã biết giọng của nó (hòa thì giọng của đoạn đứng trước trong danh sách; luồng phụ đề luôn đưa đoạn theo thời gian, nên đó là đoạn sớm hơn). Đa số thời lượng chỉ áp trong MỘT nhóm đoạn (đoạn âm thanh mà hàng đợi nhận dạng gộp, spec §4.4: "lấy giọng chiếm nhiều thời lượng hơn"; mỗi lần `attach` là một nhóm). Phụ đề có từ hai nhóm đã biết khác giọng (câu ghép, câu mà hàng đợi dịch gộp) thì KHÔNG nhãn, trừ khi worker gộp hai giọng đó làm một (sau rà soát đường nóng 2026-10-26, `VoiceBook` ghi theo nhóm; thà không nhãn còn hơn sai tên). Composer giữ giọng từng đoạn (`VoiceBook`); `OpenSentence` giữ giọng của câu để `accepts` so. Hàng đợi nhận dạng (`AsrQueue`) không đổi: lúc gộp đoạn, nhãn thường chưa có.
8. **Sự kiện tới giao diện:** `subtitle://speaker {id, speaker}` và `speaker://roster {voices: [{id, room}]}`; trường `speaker` trong `subtitle://upsert` và `subtitle://live`. `label`, `color`, `source`, `participants` của spec §9 (cần 5 ngôn ngữ và hai bảng màu) để kế hoạch 03. "Người N" lấy N = mã giọng (mã tăng theo thứ tự xuất hiện, không dùng lại, có thể > 8).
9. **`Embedder::embed_windowed` và `window_bounds` giữ lại** (đánh dấu "chỉ để chạy lại số đo cách A của kế hoạch 01, `results/ram.md`"); worker không dùng. Bỏ chúng thì các lệnh "Chạy lại" của `ram.md` không chạy được nữa.
10. **Kết quả đo của kế hoạch 02** nằm ở `$B/results/02-*.md` (cùng thư mục với kết quả kế hoạch 01, một README).
11. **Đóng gói, CI kiểm không có mã mạng, đo đạc:** file 02b.
12. **Dịch quá tải thì hàng đợi dịch gộp như khi tắt, kể cả câu khác giọng, ngay** (ưu tiên 1: tốc độ hơn đúng tên; chốt lại ngày 2026-10-26 sau rà soát độc lập mã Task 7–12, mục Q2; sửa luật ngày 2026-10-26 theo rà soát độc lập cuối, mục Q1). Bình thường hàng đợi dịch không gộp hai câu đã biết khác giọng (spec §4.4). Nhưng khi người nói xen kẽ, các câu liền nhau đều khác giọng, nên chỉ gộp câu cùng giọng thì `merge_runs` (cách duy nhất hàng đợi rút ngắn khi dịch chậm hơn lời nói) không gộp được gì, tồn đọng kéo dài và nhiều câu thành `Skip` (chỉ hiện câu gốc sau 20 s). Vì vậy `merge_runs` (chạy khi hàng đầy, `mt_max_waiting` câu) gộp **hai lượt**: lượt 1 gộp các dãy câu liên tiếp cùng ngôn ngữ đã chốt mà không lẫn hai giọng đã biết khác nhau; nếu sau lượt 1 hàng còn **nhiều câu hơn số câu mà cách gộp lúc tắt** (bỏ qua giọng) để lại (`MtQueue::runs_when_off`) thì lượt 2 gộp ngay như trước khi có nhận giọng, kể cả câu khác giọng. Lượt 1 chỉ gộp bên trong các dãy mà cách gộp lúc tắt gộp, nên sau hai lượt câu nào vào request nào **y hệt khi tắt**, với mọi kiểu hội thoại: hàng đợi dịch không bao giờ dài hơn, câu không chờ lâu hơn và không thêm câu `Skip` so với khi tắt tính năng; giọng chỉ quyết câu gộp có lẫn giọng (không nhãn) hay không, và số lần gộp khác giọng. Hệ quả: spec §4.4 "hàng đợi dịch không gộp hai câu đã biết khác giọng" chỉ còn đúng khi dịch kịp (hàng chưa đầy), hay khi mỗi dãy gộp được chỉ có một giọng; dịch quá tải thì câu khác giọng bị gộp (không nhãn) thường hơn luật trước (ưu tiên 1 > 2). Luật trước (lượt 2 chỉ khi sau lượt 1 hàng **vẫn đầy**, ≥ `mt_max_waiting` câu) chỉ giữ được lời hứa với kiểu xen kẽ tuyệt đối 1-2-1-2: lượt 1 gộp được một cặp thì hàng hết đầy, lượt 2 không chạy, hàng còn 3 câu thay vì 2. Mô phỏng bằng `MtQueue` thật (mỗi giây một câu, dịch mỗi request 2 s; test `overload_is_never_slower_than_when_off_whatever_the_turns`, `three_hundred_random_meetings_are_never_slower_with_voices_on`, `a_full_queue_groups_sentences_exactly_as_when_off`): kiểu 1-1-2-2, 1-1-2-3, 1-1-1-2 luật trước cho câu chờ lâu nhất 5 000 ms so với 3 000 ms khi tắt, luật mới 3 000 ms; 300 cuộc họp ngẫu nhiên (3 người, mỗi lượt nói 1–3 câu, 120 câu) luật trước 300/300 cuộc bật chậm hơn tắt (chờ trung bình lệch tới +580 ms), luật mới 0/300 (lệch 0 ms); hai người xen kẽ 1-2 cả hai luật đều có hàng dài nhất 3 câu, câu chờ lâu nhất 3 000 ms, 0 câu `Skip` (luật đầu tiên "tồn ≥ 2 × `mt_max_waiting` mới gộp khác giọng" cho 6 câu, 6 000 ms). Câu gộp từ hai giọng đã biết khác nhau mang cờ `mixed` và **không có nhãn** (`voice: None`, thà không nhãn còn hơn sai tên hay chậm), nhãn tới muộn cũng không gắn lại cho nó. Luồng phụ đề giữ `MtItem.voice` bằng giọng đang hiện của phụ đề (sau khi ghép thêm đoạn, sau khi gộp, khi nhãn tới muộn), để lượt 1 so đúng giọng và câu gộp lẫn giọng không mang nhãn. Ghép câu ở `OpenSentence::accepts` giữ luật "không ghép hai giọng đã biết khác nhau" (không có hàng chờ ở bước đó; đuổi kịp là việc của hàng đợi dịch). Số câu bị gộp, số lần gộp khác giọng, số câu chờ dịch nhiều nhất cùng lúc và câu chờ lâu nhất đếm ở `SessionMetrics::{mt_merges, mt_merges_across_voices, mt_queue_max, mt_wait_max_ms}`; 02b đo khi bật so với tắt, cả kịch bản dịch quá tải. (Mã mẫu của Task 10 và Task 12 trong file này là bản trước khi chốt lại; mã trong repo đã theo luật hai lượt đã sửa, test `overload_with_two_alternating_speakers_queues_no_longer_than_when_off` và ba test mô phỏng kể trên.)
13. **Thử quyền Trợ năng với binary `speaker-worker` thật dời sang kế hoạch 04.** Spec §6.2 ghi "kế hoạch 02 thử lại một lần với binary thật"; 02 chưa có mã đọc cây giao diện (bộ đọc là kế hoạch 04) nên chưa có gì để thử. Câu §6.2 của spec (và `results/tong-hop.md`, `results/quyen-tro-nang.md`) đã được sửa ngày 2026-10-26, ngoài kế hoạch này. Chủ dự án duyệt điều này cùng các quyết định khác (02b Task 9).
14. **Kênh nhãn từ worker tới luồng phụ đề có giới hạn** (`UPDATE_CHANNEL_CAP` = 256): worker đúng chỉ gửi vài cập nhật mỗi đoạn; kênh đầy nghĩa là worker gửi dồn (hỏng hay bị chiếm), client coi như worker đã chết (chạy lại, tính vào số lần chết). Luồng phụ đề xử lý tối đa `SPEAKER_DRAIN_MAX` = 64 cập nhật mỗi vòng, mọi `Voices` đều được áp (hai `Voices` của hai lần chạy worker tới cùng một vòng không được làm mất giọng mới của lần trước) và bảng giọng chỉ phát một lần mỗi vòng: worker gửi dồn không làm phụ đề chậm.
15. **Cờ nguồn thiếu không bao giờ làm kẹt âm thanh:** sau mỗi lần đọc, luồng VAD ép số cờ bằng số mẫu (thiếu thì đệm `System`, ghi log một lần mỗi phiên). Lỗi của tính năng phụ không được làm hỏng đường nóng.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `crates/speaker-protocol/{Cargo.toml, src/lib.rs}` | kiểu thông điệp, khung, `SpeakerConfig` + `validate`, chuyển PCM |
| Sửa `crates/speaker-worker/Cargo.toml` | thêm `speaker-protocol` (Task 2), `prost`, `sha2` (Task 4), `rayon`, `libc` (Task 6) |
| Sửa `crates/speaker-worker/src/cluster.rs` | `SpeakerConfig` lấy từ giao thức; `OnlineClusterer::voice_ids` |
| Tạo `crates/speaker-worker/src/onnx_steps.rs` | `StepGraph`: chạy đồ thị từng nút (B') |
| Sửa `crates/speaker-worker/src/embed.rs` | `Embedder` chạy qua `StepGraph`; `from_model`; `load_checked` (tự băm byte đã đọc); test giống từng bit |
| Tạo `crates/speaker-worker/src/session.rs` | `Worker`: xử lý yêu cầu (A2, thời lượng thật, giọng trong phòng), không I/O |
| Tạo `crates/speaker-worker/src/platform.rs` | stdout riêng cho giao thức, DLL (Windows), ưu tiên thấp, pool rayon QoS utility |
| Tạo `crates/speaker-worker/src/main.rs` | binary `speaker-worker`: vòng đọc/ghi khung |
| Tạo `crates/speaker-worker/tests/worker_process.rs` | chạy binary thật với model tổng hợp, khung hỏng, ưu tiên |
| Sửa `crates/audio-capture/{Cargo.toml, src/duck.rs}` | cờ nguồn cho từng mẫu ra của bộ trộn |
| Sửa `crates/pipeline/Cargo.toml`, `src/lib.rs` | thêm `speaker-protocol`; khai module mới |
| Sửa `crates/pipeline/src/segmenter.rs` | `Segment::lead_samples` (độ dài phần đệm trước) |
| Tạo `crates/pipeline/src/speaker.rs` | `SpeakerLink`, `SpeakerUpdate`, `SourceTrack`, `SpeakerTap` (phía luồng VAD) |
| Tạo `crates/pipeline/src/voices.rs` | `VoiceBook`: giọng từng đoạn, từng phụ đề |
| Sửa `crates/pipeline/src/sentence.rs` | `Piece::voice`; `OpenSentence` không ghép hai giọng đã biết khác nhau |
| Sửa `crates/pipeline/src/queue.rs` | `MtItem::{voice, mixed}`; hàng đợi dịch gộp hai lượt: lượt 1 không gộp hai giọng khác nhau, hàng còn dài hơn cách gộp lúc tắt thì lượt 2 gộp cả khác giọng (câu gộp không nhãn, QĐ 12); đếm số lần gộp khác giọng |
| Sửa `crates/pipeline/src/subtitle.rs` | `Subtitle::speaker`, `LiveLine::speaker`, `SpeakerLabel`, `Roster` |
| Sửa `crates/pipeline/src/metrics.rs` | đếm nhãn đúng lúc, muộn; số câu hàng đợi dịch gộp, số lần gộp khác giọng |
| Sửa `crates/pipeline/src/engine.rs` | `FrameSource::read_tagged`, `EventSink::{speaker, roster}`, `Engine::start_with_speaker`, luồng VAD, luồng phụ đề |
| Tạo `crates/pipeline/src/speaker_client.rs` | chạy, giám sát, khởi động lại worker; quá tải |
| Tạo `crates/pipeline/src/bin/fake_speaker_worker.rs`, `crates/pipeline/tests/speaker_client.rs` | worker giả và test client |
| Sửa `crates/latency-bench/src/{latency.rs, session_replay.rs}` | trường mới của `Piece`, `Subtitle`, `LiveLine` |
| Sửa `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` | thêm `speaker-protocol`; khai `mod speaker` |
| Sửa `src-tauri/src/capture.rs` | cờ nguồn qua `Frames`, `LiveCapture::read_tagged` |
| Sửa `src-tauri/src/models/manifest.rs` | khóa `speaker`, `speaker_config`; `Kind::Speaker` nội bộ |
| Sửa `src-tauri/src/models/service.rs` | `speaker_model`, `speaker_config`, tải model nhận giọng |
| Sửa `src-tauri/src/sidecar/paths.rs` | tên `speaker-worker` (kiểm toàn vẹn dùng `integrity::verify` có sẵn) |
| Tạo `src-tauri/src/speaker/mod.rs` | cờ dev, tìm binary và model, kiểm trước khi chạy, `start_for_session` |
| Sửa `src-tauri/src/{session.rs, events.rs}` | nối vào phiên; `subtitle://speaker`, `speaker://roster` |
| Sửa `src-tauri/src/transcript/{export.rs, history.rs, store.rs}` (phần test và đọc DB) | trường `speaker` của `Subtitle` |
| Sửa `scripts/{read-dev-env.sh, run-dev-app.sh, dev-env.test.mjs, run-dev-app.test.mjs}`, `.env.example`, `scripts/release/{release-check.mjs, dev-gate-markers.test.mjs}`, `.github/workflows/ci.yml` (bước test bản release) | cờ dev `AI_TRANSLATOR_DEV_SPEAKER`, cổng chống lọt, test bản release luôn tắt |

---

### Task 0: Mốc ban đầu

**Files:** không

- [ ] **Step 1: Nhánh, đĩa, model**

Run: `cd $W && git branch --show-current && df -h . | tail -1 && shasum -a 256 $DATA/models/eres2net-sv-en-voxceleb-16k.onnx && ls $M/models/silero_vad_v6.2.3.onnx`
Expected: `phan-biet-nguoi-noi`; còn trống ≥ 22 GB (dưới thì dừng, báo chủ dự án); SHA-256 `beffe43e7027d0c76752fcc4cace5c8473eedf30d3237da30ec2c668078a043e` (`results/ram.md`); file Silero có.

- [ ] **Step 2: Test các crate sẽ sửa**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker -p latency-bench -p pipeline -p audio-capture 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: mọi dòng `test result: ok`. Ghi lại số đạt/bỏ qua từng crate vào ghi chú làm việc (không vào repo); mốc đã biết: `speaker-worker` 39 đạt, 2 bỏ qua; `latency-bench` 105 đạt, 1 bỏ qua. Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 3: Test của app**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok` (ghi số đạt/bỏ qua). `models::manifest` có hai test của kế hoạch 01 (`a_speaker_entry_at_the_root_does_not_break_this_app`, `an_unknown_kind_in_files_breaks_this_app`): suốt kế hoạch này chúng phải giữ nguyên và đạt.

- [ ] **Step 4: Kiểm kiểu Windows**

Run: `cd $W && CARGO_TARGET_DIR=$W/target ./scripts/check-windows.sh 2>&1 | tail -2 && CARGO_TARGET_DIR=$W/target PKG_CONFIG_x86_64_pc_windows_msvc="$W/scripts/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 cargo clippy -p speaker-worker --all-targets --target x86_64-pc-windows-msvc -- -D warnings 2>&1 | tail -2`
Expected: `Finished` hai lần, không cảnh báo.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short | head -40`
Expected: chỉ các thay đổi chưa commit của kế hoạch 01 (danh sách ở đầu phiên làm việc: `.gitignore`, `Cargo.lock`, `crates/latency-bench/…`, `crates/speaker-worker/`, `bench/2026-10-26-nguoi-noi/…`, spec, kế hoạch 01, `src-tauri/src/models/manifest.rs`) cộng file kế hoạch này. Không commit.

---

### Task 1: Crate `speaker-protocol`

**Files:**
- Tạo: `crates/speaker-protocol/Cargo.toml`, `crates/speaker-protocol/src/lib.rs`

Workspace đã có `members = ["crates/*", ...]` nên crate mới tự vào workspace; không sửa `Cargo.toml` gốc.

- [ ] **Step 1: Tạo `Cargo.toml` và viết test trước**

`crates/speaker-protocol/Cargo.toml`:

```toml
[package]
name = "speaker-protocol"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

# Giao thức giữa app và `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.2): chỉ kiểu dữ liệu và mã hóa khung.
# Không I/O mạng, không luồng. `audio-capture`, `pipeline`, `speaker-worker` và app cùng dùng.
[dependencies]
postcard.workspace = true
serde.workspace = true
thiserror.workspace = true
```

`crates/speaker-protocol/src/lib.rs` (tạm thời chỉ có khối test; Step 3 thêm phần thân **phía trên** khối này):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn sample_segment() -> SegmentAudio {
        SegmentAudio {
            segment_id: 7,
            start_ms: 1_000,
            end_ms: 3_500,
            source: Source::Mic,
            pcm: vec![0, 1, -1, i16::MAX, i16::MIN],
        }
    }

    fn requests() -> Vec<Request> {
        vec![
            Request::Load {
                model_path: "/m/eres2net.onnx".into(),
                model_sha256: Some("ab".repeat(32)),
                config: SpeakerConfig::default(),
            },
            Request::SessionStart {
                unix_ms: 1_793_000_000_000,
            },
            Request::Segment(sample_segment()),
            Request::Shutdown,
        ]
    }

    fn responses() -> Vec<Response> {
        vec![
            Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: true,
            },
            Response::Assign {
                segment_id: 7,
                voice: Some(9),
                confidence: 0.5,
            },
            Response::Voices {
                voices: vec![VoiceInfo {
                    voice: 9,
                    speech_ms: 2_500,
                    mic: true,
                }],
            },
            Response::Merged { from: 2, into: 1 },
            Response::Error {
                segment_id: Some(7),
                kind: ErrorKind::InvalidRequest,
                message: "đoạn sai".into(),
            },
        ]
    }

    #[test]
    fn requests_and_responses_roundtrip() {
        let mut buf = Vec::new();
        for r in requests() {
            write_frame(&mut buf, &r).unwrap();
        }
        for r in responses() {
            write_frame(&mut buf, &r).unwrap();
        }
        let mut cur = Cursor::new(buf);
        for r in requests() {
            assert_eq!(read_frame::<_, Request>(&mut cur).unwrap().unwrap(), r);
        }
        for r in responses() {
            assert_eq!(read_frame::<_, Response>(&mut cur).unwrap().unwrap(), r);
        }
        assert!(read_frame::<_, Request>(&mut cur).unwrap().is_none());
    }

    /// postcard mã hóa enum theo thứ tự khai báo: đổi thứ tự là đổi định dạng trên dây.
    #[test]
    fn variant_indices_are_pinned() {
        fn index<T: Serialize>(v: &T) -> u8 {
            postcard::to_stdvec(v).unwrap()[0]
        }
        assert_eq!(requests().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3]);
        assert_eq!(responses().iter().map(index).collect::<Vec<_>>(), [0, 1, 2, 3, 4]);
        assert_eq!([Source::System, Source::Mic, Source::Mixed].map(|s| index(&s)), [0, 1, 2]);
        assert_eq!(
            [ErrorKind::NotLoaded, ErrorKind::InvalidRequest, ErrorKind::Internal].map(|k| index(&k)),
            [0, 1, 2]
        );
    }

    /// `protocol_version` là trường đầu của `Ready`: app đọc được số này trước mọi trường khác.
    #[test]
    fn protocol_version_comes_first_in_ready() {
        let ready = Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false,
        };
        let bytes = postcard::to_stdvec(&ready).unwrap();
        assert_eq!(bytes[..2], [0, PROTOCOL_VERSION as u8]);
    }

    #[test]
    fn oversized_truncated_and_unknown_frames_are_errors() {
        let mut big = (MAX_FRAME_BYTES + 1).to_le_bytes().to_vec();
        big.extend([0; 8]);
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(big)),
            Err(FrameError::TooLarge(_))
        ));
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3u8, 0])),
            Err(FrameError::Io(_))
        ));
        // `Shutdown` (chỉ số 3) kèm 2 byte thừa.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![3, 0, 0, 0, 3, 0xAA, 0xBB])),
            Err(FrameError::TrailingBytes(2))
        ));
        // Chỉ số biến thể lạ.
        assert!(matches!(
            read_frame::<_, Request>(&mut Cursor::new(vec![1, 0, 0, 0, 9])),
            Err(FrameError::Codec(_))
        ));
    }

    #[test]
    fn a_frame_larger_than_the_limit_is_not_written_but_four_seconds_fit_easily() {
        let big = Request::Segment(SegmentAudio {
            pcm: vec![i16::MAX; MAX_FRAME_BYTES as usize / 2],
            ..sample_segment()
        });
        let mut out = Vec::new();
        assert!(matches!(write_frame(&mut out, &big), Err(FrameError::TooLarge(_))));
        assert!(out.is_empty());
        let four = Request::Segment(SegmentAudio {
            pcm: vec![i16::MIN; MAX_EMBED_SAMPLES],
            ..sample_segment()
        });
        write_frame(&mut out, &four).unwrap();
        assert!(out.len() < MAX_FRAME_BYTES as usize / 10, "{} byte", out.len());
    }

    #[test]
    fn debug_output_never_contains_audio() {
        let s = format!(
            "{:?}",
            Request::Segment(SegmentAudio {
                pcm: vec![12345; 100],
                ..sample_segment()
            })
        );
        assert!(s.contains("<100 mẫu>") && !s.contains("12345"), "{s}");
    }

    /// Ngưỡng chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md): θ 0,35, gộp tắt (1,10).
    #[test]
    fn the_default_config_is_the_one_chosen_in_plan_01_and_is_valid() {
        let c = SpeakerConfig::default();
        assert_eq!(
            (c.theta, c.min_embed_ms, c.min_new_ms, c.min_update_ms, c.max_voices, c.merge_theta, c.merge_min_ms),
            (0.35, 500, 1_500, 1_000, 8, 1.10, 10_000)
        );
        assert_eq!(c.validate(), Ok(()));
    }

    #[test]
    fn validate_names_the_first_bad_field() {
        let bad = |change: fn(&mut SpeakerConfig)| {
            let mut c = SpeakerConfig::default();
            change(&mut c);
            c.validate().unwrap_err()
        };
        assert_eq!(bad(|c| c.theta = f32::NAN), "theta");
        assert_eq!(bad(|c| c.theta = -0.1), "theta");
        assert_eq!(bad(|c| c.theta = 0.0), "theta");
        assert_eq!(bad(|c| c.theta = 1.5), "theta");
        // Ngắn hơn 0,5 s thì `Embedder::embed` từ chối: hai nguồn sự thật phải khớp (MIN_EMBED_MS).
        assert_eq!(bad(|c| c.min_embed_ms = 499), "min_embed_ms");
        assert_eq!(bad(|c| c.min_new_ms = 400), "min_new_ms");
        assert_eq!(bad(|c| c.min_update_ms = 499), "min_update_ms");
        assert_eq!(bad(|c| c.max_voices = 0), "max_voices");
        assert_eq!(bad(|c| c.max_voices = MAX_VOICES + 1), "max_voices");
        assert_eq!(bad(|c| c.merge_theta = f32::INFINITY), "merge_theta");
        assert_eq!(bad(|c| c.merge_min_ms = u64::MAX), "merge_min_ms");
    }

    #[test]
    fn pcm_conversion_roundtrips_within_one_step() {
        let x = [0.0f32, 0.5, -0.5, 1.0, -1.0, 2.0, -2.0];
        let back = f32_from_pcm(&pcm_from_f32(&x));
        for (a, b) in x.iter().map(|v| v.clamp(-1.0, 1.0)).zip(&back) {
            assert!((a - b).abs() <= 1.0 / i16::MAX as f32, "{a} {b}");
        }
        assert_eq!(f32_from_pcm(&[i16::MIN]), [-1.0]);
    }

    #[test]
    fn the_a2_cap_is_four_seconds_and_the_embedding_floor_half_a_second() {
        assert_eq!(MAX_EMBED_SAMPLES, 64_000);
        assert_eq!(MIN_EMBED_MS, 500);
    }
}
```

- [ ] **Step 2: Chạy test, thấy lỗi biên dịch**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-protocol 2>&1 | grep -E "^error" | head -5`
Expected: `error[E0433]`/`error[E0412]`: không tìm thấy `SegmentAudio`, `Request`, … (chưa có phần thân).

- [ ] **Step 3: Viết phần thân (đặt phía trên khối test)**

```rust
//! Giao thức giữa app và tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.2), cùng kiểu với
//! `asr-protocol`: mỗi khung là độ dài `u32` little-endian rồi nội dung postcard, tối đa [`MAX_FRAME_BYTES`].
//!
//! - postcard mã hóa enum theo chỉ số biến thể: chỉ thêm biến thể ở CUỐI (test `variant_indices_are_pinned`). Thêm hay bỏ
//!   trường cũng đổi định dạng: app và worker luôn build cùng nhau, và [`PROTOCOL_VERSION`] tăng mỗi lần đổi bất kỳ kiểu nào.
//! - Kế hoạch 02 chỉ có phần nhận giọng. Kế hoạch 04 thêm `Speech`, `SetNames`, `ReaderState`, trường tên của [`VoiceInfo`]
//!   và người tham dự (spec §4.2) ở cuối các enum, và tăng [`PROTOCOL_VERSION`].
//! - Log không bao giờ chứa âm thanh hay tên người: `Debug` của [`SegmentAudio`] viết tay.
//! - Mô hình đe dọa của kênh: worker đọc khung của app (tiến trình cha); app đọc khung của worker, tiến trình chạy bộ đọc
//!   protobuf và (kế hoạch 04) đọc giao diện app khác, nên app coi khung của worker là dữ liệu chưa tin: giới hạn kích thước
//!   khung, từ chối khung hỏng hay lạ (bỏ worker, chạy lại), giới hạn độ dài danh sách ([`MAX_VOICES_ON_WIRE`]).

#![forbid(unsafe_code)]

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::io::{self, Read, Write};

/// Âm thanh gửi cho worker luôn là 16 kHz mono.
pub const SAMPLE_RATE: u32 = 16_000;
/// Chỉ nhúng tối đa 4 s đầu phần tiếng nói của mỗi đoạn (cách A2, spec §5.2). App gửi tối đa chừng này mẫu; worker từ chối
/// đoạn dài hơn.
pub const MAX_EMBED_SAMPLES: usize = SAMPLE_RATE as usize * 4;
/// Ngắn hơn thì không nhúng (spec §5.2). Nguồn sự thật duy nhất của ngưỡng 0,5 s: `speaker_worker::embed::MIN_SAMPLES` và
/// [`SpeakerConfig::validate`] dùng số này.
pub const MIN_EMBED_MS: u64 = 500;
/// Thời lượng tối đa của một đoạn (`end_ms − start_ms`): `PipelineConfig` cho `segmenter.max_segment_ms` tới 28 s (mặc định 8 s).
pub const MAX_SEGMENT_MS: u64 = 30_000;
/// Một đoạn 4 s dạng `i16` sau postcard khoảng 200 KB; 4 MiB là dư nhiều (spec §4.2).
pub const MAX_FRAME_BYTES: u32 = 4 * 1024 * 1024;
/// Số giọng đang sống tối đa mà [`SpeakerConfig::validate`] nhận.
pub const MAX_VOICES: usize = 32;
/// App coi `Voices` có nhiều giọng hơn chừng này là khung hỏng.
pub const MAX_VOICES_ON_WIRE: usize = 64;
/// Phiên bản giao thức, trường đầu của `Response::Ready`. App tắt nhận giọng nếu worker báo số khác.
pub const PROTOCOL_VERSION: u32 = 1;

/// Nguồn của âm thanh (spec §5.5): `System` khi micro bị hạ hay im, `Mic` khi âm thanh máy dưới ngưỡng nhường lời và micro có
/// tiếng, `Mixed` khi cả hai có tiếng. Đoạn lấy nguồn chiếm đa số khung.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Source {
    #[default]
    System,
    Mic,
    Mixed,
}

/// Một đoạn VAD gửi cho worker (spec §4.2).
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub struct SegmentAudio {
    /// Id đoạn của `Segmenter` (chưa cộng `id_base` của phiên).
    pub segment_id: u64,
    /// Ranh giới tiếng nói, tính từ đầu phiên, không gồm đệm. `end_ms − start_ms` là thời lượng thật dùng cho phân cụm.
    pub start_ms: u64,
    pub end_ms: u64,
    pub source: Source,
    /// PCM 16 kHz `i16`: tối đa [`MAX_EMBED_SAMPLES`] mẫu đầu của phần tiếng nói `[start_ms, end_ms)`, không đệm (A2).
    pub pcm: Vec<i16>,
}

// Debug viết tay: âm thanh không bao giờ vào log (spec §5.6, §10).
impl fmt::Debug for SegmentAudio {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SegmentAudio")
            .field("segment_id", &self.segment_id)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("source", &self.source)
            .field("pcm", &format_args!("<{} mẫu>", self.pcm.len()))
            .finish()
    }
}

/// Ngưỡng của nhận giọng (spec §5.2–§5.4); đổi được qua khóa `speaker_config` của manifest (§4.5). Thiếu khóa nào thì dùng
/// mặc định.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SpeakerConfig {
    /// Cosine tối thiểu để vào một giọng đã có.
    pub theta: f32,
    /// Ngắn hơn thì không dùng nhúng, lấy giọng của đoạn trước.
    pub min_embed_ms: u64,
    /// Từ độ dài này mới được mở giọng mới.
    pub min_new_ms: u64,
    /// Từ độ dài này mới cập nhật tâm của giọng.
    pub min_update_ms: u64,
    /// Số giọng đang sống tối đa; đủ rồi thì đoạn không giống giọng nào vào giọng gần nhất. Mã giọng không bao giờ dùng lại nên
    /// có thể lớn hơn số này.
    pub max_voices: usize,
    /// Cosine giữa hai tâm để tự gộp; lớn hơn 1 là không bao giờ gộp (mặc định 1,10: kế hoạch 01 không thấy gộp giúp gì).
    pub merge_theta: f32,
    /// Mỗi giọng phải có ít nhất chừng này tiếng nói mới được tự gộp.
    pub merge_min_ms: u64,
}

impl Default for SpeakerConfig {
    fn default() -> Self {
        // Chốt ở kế hoạch 01 (results/nhan-giong-ami.md, nhan-giong-tieng-viet.md).
        Self {
            theta: 0.35,
            min_embed_ms: MIN_EMBED_MS,
            min_new_ms: 1_500,
            min_update_ms: 1_000,
            max_voices: 8,
            merge_theta: 1.10,
            merge_min_ms: 10_000,
        }
    }
}

impl SpeakerConfig {
    /// Trả tên trường đầu tiên vô lý. App (manifest) và worker (`Load`) cùng gọi; sai thì dùng [`SpeakerConfig::default`].
    pub fn validate(&self) -> Result<(), String> {
        let checks = [
            ("theta", self.theta.is_finite() && self.theta > 0.0 && self.theta <= 1.0),
            ("min_embed_ms", (MIN_EMBED_MS..=MAX_SEGMENT_MS).contains(&self.min_embed_ms)),
            ("min_new_ms", (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_new_ms)),
            ("min_update_ms", (self.min_embed_ms..=MAX_SEGMENT_MS).contains(&self.min_update_ms)),
            ("max_voices", (1..=MAX_VOICES).contains(&self.max_voices)),
            (
                "merge_theta",
                self.merge_theta.is_finite() && self.merge_theta > 0.0 && self.merge_theta <= 2.0,
            ),
            ("merge_min_ms", self.merge_min_ms <= 3_600_000),
        ];
        match checks.iter().find(|(_, ok)| !ok) {
            Some((name, _)) => Err((*name).to_string()),
            None => Ok(()),
        }
    }
}

/// Yêu cầu từ app. Thứ tự: `Load` → `Ready`; `SessionStart` (không trả lời); mỗi `Segment` → `Assign` hay `Error`, có thể kèm
/// `Merged`, `Voices`; `Shutdown`: worker thoát, không trả lời.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Request {
    Load {
        model_path: String,
        /// SHA-256 (hex chữ thường) mà app đã kiểm cho file model; worker băm đúng các byte nó đọc và dựng đồ thị từ chính các
        /// byte đó, khác thì `Ready { model_ok: false }` (file bị thay sau lúc app kiểm, spec §10). `None`: model của bản dev,
        /// không kiểm.
        model_sha256: Option<String>,
        config: SpeakerConfig,
    },
    /// Giờ hệ thống (ms Unix) lúc bắt đầu phiên; worker xóa mọi giọng. Kế hoạch 04 dùng làm mốc chung với dấu "đang nói".
    SessionStart { unix_ms: u64 },
    Segment(SegmentAudio),
    Shutdown,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// `Segment` khi model chưa nạp được.
    NotLoaded,
    /// Yêu cầu sai (thời lượng âm, đoạn quá dài, PCM quá 4 s): lỗi của app.
    InvalidRequest,
    Internal,
}

/// Một giọng đang sống (spec §4.2; kế hoạch 04 thêm trường tên ở cuối).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct VoiceInfo {
    pub voice: u32,
    /// Tổng thời lượng tiếng nói đã gán cho giọng này.
    pub speech_ms: u64,
    /// Giọng trong phòng: ≥ 60% thời lượng từ micro (spec §5.5).
    pub mic: bool,
}

/// Phản hồi của worker. Cùng luật chỉ-thêm-ở-cuối như [`Request`].
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum Response {
    Ready {
        /// Trường đầu tiên (test `protocol_version_comes_first_in_ready`).
        protocol_version: u32,
        /// `false`: model không nạp được; worker vẫn sống nhưng trả `Error { NotLoaded }` cho mọi đoạn.
        model_ok: bool,
    },
    /// `voice` là `None` khi đoạn quá ngắn (hay nhúng không dùng được) mà chưa có giọng nào.
    Assign {
        segment_id: u64,
        voice: Option<u32>,
        confidence: f32,
    },
    /// Danh sách giọng đang sống, gửi khi có giọng mới, gộp, hay cờ trong phòng đổi.
    Voices { voices: Vec<VoiceInfo> },
    Merged { from: u32, into: u32 },
    Error {
        segment_id: Option<u64>,
        kind: ErrorKind,
        message: String,
    },
}

#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    #[error("lỗi I/O: {0}")]
    Io(#[from] io::Error),
    #[error("khung dài {0} byte, vượt giới hạn {MAX_FRAME_BYTES}")]
    TooLarge(u64),
    #[error("lỗi mã hóa: {0}")]
    Codec(#[from] postcard::Error),
    #[error("khung còn {0} byte thừa sau thông điệp")]
    TrailingBytes(usize),
}

/// Ghi một khung rồi `flush`. Khung quá [`MAX_FRAME_BYTES`] thì không ghi gì.
pub fn write_frame<W: Write, T: Serialize>(w: &mut W, msg: &T) -> Result<(), FrameError> {
    let bytes = postcard::to_stdvec(msg)?;
    if bytes.len() as u64 > MAX_FRAME_BYTES as u64 {
        return Err(FrameError::TooLarge(bytes.len() as u64));
    }
    w.write_all(&(bytes.len() as u32).to_le_bytes())?;
    w.write_all(&bytes)?;
    w.flush()?;
    Ok(())
}

/// Đọc một khung. `Ok(None)` khi luồng đóng đúng ở ranh giới giữa hai khung. Mọi lỗi khác: bên đọc bỏ luồng (worker thoát; app
/// coi worker đã chết).
pub fn read_frame<R: Read, T: DeserializeOwned>(r: &mut R) -> Result<Option<T>, FrameError> {
    let mut len_buf = [0u8; 4];
    let mut filled = 0;
    while filled < len_buf.len() {
        match r.read(&mut len_buf[filled..]) {
            Ok(0) => break,
            Ok(n) => filled += n,
            Err(e) if e.kind() == io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e.into()),
        }
    }
    if filled == 0 {
        return Ok(None);
    }
    if filled < len_buf.len() {
        return Err(io::Error::from(io::ErrorKind::UnexpectedEof).into());
    }
    let len = u32::from_le_bytes(len_buf);
    if len > MAX_FRAME_BYTES {
        return Err(FrameError::TooLarge(len as u64));
    }
    let mut buf = vec![0u8; len as usize];
    r.read_exact(&mut buf)?;
    let (msg, rest) = postcard::take_from_bytes::<T>(&buf)?;
    if !rest.is_empty() {
        return Err(FrameError::TrailingBytes(rest.len()));
    }
    Ok(Some(msg))
}

/// Mẫu f32 trong [-1, 1] sang PCM 16 bit, cùng công thức `pipeline::engine` dùng cho `asr-worker` (nhân `i16::MAX`, chặn biên).
pub fn pcm_from_f32(samples: &[f32]) -> Vec<i16> {
    samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
        .collect()
}

/// Ngược lại của [`pcm_from_f32`]: chia `i16::MAX`, chặn ở -1 (`i16::MIN` hơi vượt).
pub fn f32_from_pcm(pcm: &[i16]) -> Vec<f32> {
    pcm.iter().map(|&v| (v as f32 / i16::MAX as f32).max(-1.0)).collect()
}
```

- [ ] **Step 4: Chạy test, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-protocol 2>&1 | grep -E "^test result|FAILED"`
Expected: `test result: ok. 10 passed; 0 failed`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-protocol && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-protocol --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/speaker-protocol Cargo.lock`
Expected: `Finished`, không cảnh báo; `?? crates/speaker-protocol/`, ` M Cargo.lock`. Không commit.

---

### Task 2: `speaker-worker` dùng `SpeakerConfig` của giao thức; `voice_ids`

**Files:**
- Sửa: `crates/speaker-worker/Cargo.toml` (mục `[dependencies]`)
- Sửa: `crates/speaker-worker/src/cluster.rs` (bỏ `struct SpeakerConfig` và `impl Default` ở dòng 9–45; thêm `voice_ids`)
- Sửa: `crates/speaker-worker/src/embed.rs` (hằng `MIN_SAMPLES`, dòng 26–27)

- [ ] **Step 1: Viết test**

Thêm vào cuối `mod tests` của `cluster.rs`:

```rust
    /// Giọng đang sống theo thứ tự mở; giọng bị gộp mất khỏi danh sách. A, B, D như các test trên (cos(A, D) = 0,8).
    #[test]
    fn voice_ids_lists_the_living_voices_in_opening_order() {
        let mut c = OnlineClusterer::new(merge_cfg());
        c.assign(4000, Some(&A));
        c.assign(2000, Some(&B));
        assert_eq!(c.voice_ids(), [1, 2]);
        // D mở giọng 3 (0,8 < θ 0,9) rồi gộp với giọng 1 (0,8 ≥ 0,7, cả hai 4000 ms ≥ 3000): bằng thời lượng thì giữ giọng 1.
        let r = c.assign(4000, Some(&D));
        assert_eq!(r.merged, vec![(3, 1)]);
        assert_eq!(c.voice_ids(), [1, 2]);
    }

    #[test]
    fn the_config_is_the_one_of_the_protocol() {
        let c: SpeakerConfig = speaker_protocol::SpeakerConfig::default();
        assert_eq!(c.theta, 0.35);
    }
```

Thêm vào `mod tests` của `embed.rs`:

```rust
    #[test]
    fn min_samples_follows_the_protocol() {
        assert_eq!(MIN_SAMPLES, speaker_protocol::MIN_EMBED_MS as usize * 16);
        assert_eq!(MIN_SAMPLES, 8_000);
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker 2>&1 | grep -E "^error" | head -3`
Expected: `error[E0433]: failed to resolve: use of unresolved module or unlinked crate speaker_protocol` và `no method named voice_ids`.

- [ ] **Step 3: Sửa mã**

`crates/speaker-worker/Cargo.toml`, thêm vào `[dependencies]` (giữ thứ tự chữ cái):

```toml
speaker-protocol = { path = "../speaker-protocol" }
```

`cluster.rs`: xóa nguyên khối `/// Ngưỡng của nhận giọng; …` tới hết `impl Default for SpeakerConfig { … }` (dòng 9–45) và `use serde::{Deserialize, Serialize};` (dòng 5), thay bằng:

```rust
/// Ngưỡng của nhận giọng: định nghĩa ở `speaker-protocol` (app kiểm `speaker_config` của manifest bằng cùng `validate`).
pub use speaker_protocol::SpeakerConfig;
```

và thêm vào `impl OnlineClusterer`, ngay sau `voice_count`:

```rust
    /// Mã các giọng đang sống, theo thứ tự mở (giọng bị gộp không còn).
    pub fn voice_ids(&self) -> Vec<u32> {
        self.voices.iter().map(|v| v.id).collect()
    }
```

`embed.rs`, thay hai dòng của `MIN_SAMPLES`:

```rust
/// Ngắn hơn 0,5 s thì không nhúng (spec §5.2); một nguồn sự thật với `SpeakerConfig::validate` (`speaker_protocol::MIN_EMBED_MS`).
pub const MIN_SAMPLES: usize = speaker_protocol::MIN_EMBED_MS as usize * 16;
```

Test `config_reads_partial_json_and_keeps_defaults` của `cluster.rs` vẫn dùng `serde_json` (đã là phụ thuộc của crate) và vẫn đúng: `SpeakerConfig` giữ `#[serde(default)]`.

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker -p latency-bench 2>&1 | grep -E "^test result|FAILED"`
Expected: `speaker-worker` 42 đạt, 2 bỏ qua (39 + 3 test mới); `latency-bench` như mốc (dùng `speaker_worker::cluster::SpeakerConfig` qua `pub use`).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-worker && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-worker -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/speaker-worker`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 3: `onnx_steps`: chạy đồ thị từng nút (cách B')

**Files:**
- Tạo: `crates/speaker-worker/src/onnx_steps.rs`
- Sửa: `crates/speaker-worker/src/lib.rs` (thêm `pub mod onnx_steps;`)

Mã chuyển từ thí nghiệm `Chunked` (khúc 1 nút) của `$DATA/ram-probe-registry/src/main.rs` (đã đo: giống từng bit, RSS chạy lâu với A2 4 s 198–208 MB; `results/ram.md`), thêm các phép kiểm lúc nạp mà `ram.md` mục "Ghi cho kế hoạch 02" đòi.

- [ ] **Step 1: Viết test (đồ thị nhỏ tự dựng)**

Tạo `onnx_steps.rs` chỉ với khối test (Step 3 thêm phần thân phía trên):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use candle_core::Device;
    use candle_onnx::onnx::attribute_proto::AttributeType;
    use candle_onnx::onnx::tensor_shape_proto::Dimension;
    use candle_onnx::onnx::{AttributeProto, NodeProto, TensorProto, TensorShapeProto, TypeProto, type_proto};

    /// Đầu vào `x` kiểu f32, hình `[N, T, last]`.
    fn x_info(elem_type: DataType, last: i64, rank: usize) -> ValueInfoProto {
        let dims = [
            Dim::DimParam("N".into()),
            Dim::DimParam("T".into()),
            Dim::DimValue(last),
        ];
        ValueInfoProto {
            name: "x".into(),
            r#type: Some(TypeProto {
                value: Some(TypeValue::TensorType(type_proto::Tensor {
                    elem_type: elem_type as i32,
                    shape: Some(TensorShapeProto {
                        dim: dims[3 - rank..]
                            .iter()
                            .map(|d| Dimension {
                                value: Some(d.clone()),
                                ..Default::default()
                            })
                            .collect(),
                    }),
                })),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn node(op: &str, inputs: &[&str], outputs: &[&str]) -> NodeProto {
        NodeProto {
            op_type: op.into(),
            name: format!("{op}_{}", outputs[0]),
            input: inputs.iter().map(|s| s.to_string()).collect(),
            output: outputs.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    fn floats(name: &str, dims: &[i64], data: &[f32]) -> TensorProto {
        TensorProto {
            name: name.into(),
            dims: dims.to_vec(),
            data_type: DataType::Float as i32,
            float_data: data.to_vec(),
            ..Default::default()
        }
    }

    fn int_attr(name: &str, i: i64) -> AttributeProto {
        AttributeProto {
            name: name.into(),
            r#type: AttributeType::Int as i32,
            i,
            ..Default::default()
        }
    }

    /// Đồ thị gồm các ca biên của `ram.md` (mục "Ghi cho kế hoạch 02"):
    /// - `Constant` `c` dùng ở ba nút xa nhau (n1, n5, n6);
    /// - `Split` có đầu ra `s2` không ai dùng;
    /// - `Mul(s1, s1)` (một tên hai lần);
    /// - `Clip` có đầu vào `""` (min bỏ trống) và max là trọng số;
    /// - đầu ra đồ thị `out` bị nút sau (n6) dùng; đầu ra `z` của n6 không ai dùng.
    fn edge_model() -> ModelProto {
        let mut constant = node("Constant", &[], &["c"]);
        constant.attribute.push(AttributeProto {
            name: "value".into(),
            r#type: AttributeType::Tensor as i32,
            t: Some(floats("c", &[1], &[2.0])),
            ..Default::default()
        });
        let mut split = node("Split", &["a"], &["s1", "s2"]);
        split.attribute.push(int_attr("axis", 2));
        ModelProto {
            graph: Some(GraphProto {
                node: vec![
                    constant,
                    node("Mul", &["x", "c"], &["a"]),
                    split,
                    node("Mul", &["s1", "s1"], &["sq"]),
                    node("Clip", &["sq", "", "hi"], &["cl"]),
                    node("Add", &["cl", "c"], &["out"]),
                    node("Add", &["out", "c"], &["z"]),
                ],
                initializer: vec![floats("hi", &[1], &[1.5])],
                input: vec![x_info(DataType::Float, 4, 3)],
                output: vec![ValueInfoProto {
                    name: "out".into(),
                    ..Default::default()
                }],
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    fn x(frames: usize) -> Tensor {
        let data: Vec<f32> = (0..frames * 4).map(|i| i as f32 * 0.1 - 0.7).collect();
        Tensor::from_vec(data, (1, frames, 4), &Device::Cpu).unwrap()
    }

    fn bits(t: &Tensor) -> Vec<u32> {
        t.flatten_all()
            .unwrap()
            .to_vec1::<f32>()
            .unwrap()
            .iter()
            .map(|v| v.to_bits())
            .collect()
    }

    /// Cả đồ thị một lượt bằng `simple_eval` (cách cũ), để so.
    fn whole(model: &ModelProto, x: Tensor) -> Tensor {
        candle_onnx::simple_eval(model, HashMap::from([("x".to_string(), x)]))
            .unwrap()
            .remove("out")
            .unwrap()
    }

    #[test]
    fn steps_give_the_same_bits_as_the_whole_graph() {
        let steps = StepGraph::from_model(edge_model(), "x", "out", 4).unwrap();
        // Hai lượt liền nhau, độ dài khác nhau: không giữ trạng thái giữa hai lượt.
        for frames in [3, 5, 3] {
            assert_eq!(bits(&steps.run(x(frames)).unwrap()), bits(&whole(&edge_model(), x(frames))), "{frames}");
        }
    }

    /// Bỏ sót một giá trị không đổi kết quả (test trên vẫn đạt) mà chỉ làm RAM tăng: đếm số giá trị còn giữ sau mỗi nút.
    /// Tính tay: {x} → n0 {x, c} → n1 bỏ x {c, a} → n2 bỏ a, s2 không giữ {c, s1} → n3 bỏ s1 {c, sq} → n4 bỏ sq {c, cl}
    /// → n5 bỏ cl {c, out} → n6 bỏ c, giữ out (đầu ra đồ thị), z không giữ {out}.
    #[test]
    fn values_are_dropped_right_after_their_last_use() {
        let steps = StepGraph::from_model(edge_model(), "x", "out", 4).unwrap();
        let mut live = Vec::new();
        steps.run_with(x(3), &mut |n| live.push(n)).unwrap();
        assert_eq!(live, [2, 2, 2, 2, 2, 2, 1]);
    }

    fn rejects(model: ModelProto, last: usize, needle: &str) {
        let err = StepGraph::from_model(model, "x", "out", last).err().expect("phải từ chối");
        assert!(format!("{err:#}").contains(needle), "{err:#}");
    }

    #[test]
    fn a_nested_graph_is_rejected() {
        let mut m = edge_model();
        let mut branch = node("If", &["x"], &["y"]);
        branch.attribute.push(AttributeProto {
            name: "then_branch".into(),
            r#type: AttributeType::Graph as i32,
            g: Some(GraphProto::default()),
            ..Default::default()
        });
        m.graph.as_mut().unwrap().node.insert(0, branch);
        rejects(m, 4, "graph lồng");
    }

    #[test]
    fn a_node_out_of_topological_order_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().node.swap(1, 2);
        rejects(m, 4, "chưa nút nào trước đó");
    }

    #[test]
    fn a_duplicate_name_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().node[3].output = vec!["a".into()];
        rejects(m, 4, "trùng tên");
    }

    #[test]
    fn a_wrong_main_input_is_rejected() {
        rejects(edge_model(), 80, "chiều cuối");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input = vec![x_info(DataType::Float, 4, 2)];
        rejects(m, 4, "hạng 2");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input = vec![x_info(DataType::Int64, 4, 3)];
        rejects(m, 4, "không phải f32");
        let mut m = edge_model();
        m.graph.as_mut().unwrap().input.clear();
        rejects(m, 4, "không có input `x`");
    }

    #[test]
    fn a_missing_output_is_rejected() {
        let mut m = edge_model();
        m.graph.as_mut().unwrap().output[0].name = "khong_co".into();
        let err = StepGraph::from_model(m, "x", "khong_co", 4).err().unwrap();
        assert!(format!("{err:#}").contains("không có nút nào tạo ra"), "{err:#}");
    }
}
```

Thêm `pub mod onnx_steps;` vào `crates/speaker-worker/src/lib.rs` (sau `pub mod fbank;`).

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker onnx_steps 2>&1 | grep -E "^error" | head -3`
Expected: lỗi biên dịch: không tìm thấy `StepGraph`, `Dim`, `TypeValue`, `DataType`.

- [ ] **Step 3: Viết phần thân (phía trên khối test)**

```rust
//! Chạy đồ thị ONNX từng nút (cách B', spec 2026-10-26-phan-biet-nguoi-noi §4.1; bench/2026-10-26-nguoi-noi/results/ram.md).
//!
//! `candle_onnx::simple_eval` giữ mọi tensor trung gian tới hết lượt chạy, nên RSS chạy lâu của ERes2Net lên 1,5 GB. Ở đây đồ thị
//! được tách lúc nạp thành các graph con một nút; mỗi lượt gọi `simple_eval` cho từng nút và bỏ mỗi giá trị ngay sau lần dùng
//! cuối. Trọng số (initializer) chuyển thành tensor một lần lúc nạp, truyền vào từng nút như đầu vào (chép `Arc`, không chép dữ
//! liệu). Kết quả giống hệt từng bit `simple_eval` cả đồ thị (test ở đây với đồ thị nhỏ; test `#[ignore]` với model thật ở
//! `embed.rs`).
//!
//! Dựa vào một hành vi chưa ghi thành tài liệu của candle-onnx 0.11.0: graph con không khai `input` vẫn chạy (`simple_eval` chỉ
//! kiểm các đầu vào được khai). Vì vậy lúc nạp module này tự kiểm điều `simple_eval` không còn kiểm: đầu vào chính (f32, hạng 3,
//! chiều cuối đúng), mọi đầu vào của nút đã có trước nút đó (thứ tự topo), tên không trùng, không có graph lồng (`If`, `Loop`,
//! `Scan`). **Nâng candle-onnx thì chạy lại test giống từng bit** (`embed::tests::steps_match_simple_eval_on_the_real_model`).

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result, bail, ensure};
use candle_core::Tensor;
use candle_onnx::onnx::tensor_proto::DataType;
use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
use candle_onnx::onnx::type_proto::Value as TypeValue;
use candle_onnx::onnx::{GraphProto, ModelProto, NodeProto, ValueInfoProto};

/// Một nút, dưới dạng graph con chạy được bằng `simple_eval`.
struct Step {
    model: ModelProto,
    /// Tên các đầu vào (không rỗng, không trùng), theo thứ tự xuất hiện.
    inputs: Vec<String>,
    /// Giá trị trung gian hết lần dùng sau nút này.
    drop_after: Vec<String>,
    /// Để báo lỗi: số thứ tự, loại và tên nút.
    label: String,
}

pub struct StepGraph {
    steps: Vec<Step>,
    weights: HashMap<String, Tensor>,
    input: String,
    output: String,
}

fn node_label(i: usize, node: &NodeProto) -> String {
    format!("nút {i} ({} `{}`)", node.op_type, node.name)
}

/// Đầu vào chính phải được khai: tensor f32, hạng 3, chiều cuối `last_dim` (fbank 80 dải với ERes2Net).
fn check_input(graph: &GraphProto, input: &str, last_dim: usize) -> Result<()> {
    let info = graph
        .input
        .iter()
        .find(|i| i.name == input)
        .with_context(|| format!("model không có input `{input}`"))?;
    let Some(TypeValue::TensorType(t)) = info.r#type.as_ref().and_then(|t| t.value.as_ref()) else {
        bail!("input `{input}` không phải tensor");
    };
    ensure!(t.elem_type == DataType::Float as i32, "input `{input}` không phải f32");
    let dims = &t
        .shape
        .as_ref()
        .with_context(|| format!("input `{input}` không khai hình dạng"))?
        .dim;
    ensure!(dims.len() == 3, "input `{input}` có hạng {}, cần 3", dims.len());
    ensure!(
        matches!(dims[2].value, Some(Dim::DimValue(v)) if v == last_dim as i64),
        "chiều cuối của input `{input}` phải là {last_dim}"
    );
    Ok(())
}

impl StepGraph {
    /// Tách `model` thành từng nút. `input`: tên đầu vào chính (tensor f32 hạng 3, chiều cuối `last_dim`); `output`: tên đầu
    /// ra cần lấy.
    pub fn from_model(model: ModelProto, input: &str, output: &str, last_dim: usize) -> Result<Self> {
        // Graph con mang cùng `ir_version`, `opset_import` với model gốc (`results/ram.md`, "Ghi cho kế hoạch 02"): candle-onnx
        // 0.11.0 chưa đọc hai trường này, nhưng bản sau có thể chọn cách chạy op theo opset.
        let (ir_version, opset_import) = (model.ir_version, model.opset_import.clone());
        let mut graph = model.graph.context("model ONNX không có graph")?;
        check_input(&graph, input, last_dim)?;
        let weights: HashMap<String, Tensor> = std::mem::take(&mut graph.initializer)
            .iter()
            .map(|t| Ok((t.name.clone(), candle_onnx::eval::get_tensor(t, &t.name)?)))
            .collect::<Result<_>>()?;
        ensure!(!weights.contains_key(input), "initializer trùng tên đầu vào `{input}`");
        let mut known: HashSet<String> = weights.keys().cloned().collect();
        known.insert(input.to_string());
        let mut produced: HashSet<&str> = HashSet::new();
        for (i, node) in graph.node.iter().enumerate() {
            let label = node_label(i, node);
            ensure!(
                !node.attribute.iter().any(|a| a.g.is_some() || !a.graphs.is_empty()),
                "{label}: có graph lồng (If, Loop, Scan), chưa hỗ trợ"
            );
            for name in node.input.iter().filter(|n| !n.is_empty()) {
                ensure!(
                    known.contains(name),
                    "{label}: cần `{name}` mà chưa nút nào trước đó tạo ra (đồ thị không theo thứ tự topo?)"
                );
            }
            for name in node.output.iter().filter(|n| !n.is_empty()) {
                ensure!(known.insert(name.clone()), "{label}: đầu ra `{name}` trùng tên một giá trị đã có");
                produced.insert(name);
            }
        }
        ensure!(produced.contains(output), "không có nút nào tạo ra output `{output}`");
        let mut last_use: HashMap<&str, usize> = HashMap::new();
        for (i, node) in graph.node.iter().enumerate() {
            for name in node.input.iter().filter(|n| !n.is_empty()) {
                last_use.insert(name, i);
            }
        }
        ensure!(last_use.contains_key(input), "không nút nào dùng input `{input}`");
        let steps = graph
            .node
            .iter()
            .enumerate()
            .map(|(i, node)| {
                let mut inputs: Vec<String> = Vec::new();
                for name in node.input.iter().filter(|n| !n.is_empty()) {
                    if !inputs.contains(name) {
                        inputs.push(name.clone());
                    }
                }
                // Chỉ khai đầu ra còn được dùng sau nút này hay là đầu ra đồ thị: `simple_eval` không trả đầu ra không khai,
                // nên giá trị không ai dùng (ví dụ một nhánh của `Split`) bị bỏ ngay khi nút chạy xong.
                let outputs = node
                    .output
                    .iter()
                    .filter(|o| !o.is_empty() && (o.as_str() == output || last_use.get(o.as_str()).is_some_and(|&l| l > i)))
                    .map(|o| ValueInfoProto {
                        name: o.clone(),
                        ..Default::default()
                    })
                    .collect();
                let drop_after = inputs
                    .iter()
                    .filter(|n| !weights.contains_key(*n) && n.as_str() != output && last_use[n.as_str()] == i)
                    .cloned()
                    .collect();
                Step {
                    model: ModelProto {
                        ir_version,
                        opset_import: opset_import.clone(),
                        graph: Some(GraphProto {
                            node: vec![node.clone()],
                            output: outputs,
                            ..Default::default()
                        }),
                        ..Default::default()
                    },
                    inputs,
                    drop_after,
                    label: node_label(i, node),
                }
            })
            .collect();
        Ok(Self {
            steps,
            weights,
            input: input.to_string(),
            output: output.to_string(),
        })
    }

    /// Chạy một lượt với đầu vào chính `x`; trả đầu ra.
    pub fn run(&self, x: Tensor) -> Result<Tensor> {
        self.run_with(x, &mut |_| {})
    }

    /// Như [`Self::run`]; `after_step` nhận số giá trị trung gian còn giữ sau mỗi nút (test đếm giá trị còn sống).
    fn run_with(&self, x: Tensor, after_step: &mut dyn FnMut(usize)) -> Result<Tensor> {
        let mut live: HashMap<String, Tensor> = HashMap::from([(self.input.clone(), x)]);
        for step in &self.steps {
            let mut inputs = HashMap::with_capacity(step.inputs.len());
            for name in &step.inputs {
                let t = live
                    .get(name)
                    .or_else(|| self.weights.get(name))
                    .with_context(|| format!("{}: thiếu `{name}`", step.label))?;
                inputs.insert(name.clone(), t.clone());
            }
            let out = candle_onnx::simple_eval(&step.model, inputs).with_context(|| step.label.clone())?;
            for name in &step.drop_after {
                live.remove(name);
            }
            live.extend(out);
            after_step(live.len());
        }
        let out = live.remove(&self.output).context("thiếu đầu ra sau lượt chạy")?;
        debug_assert!(live.is_empty(), "còn giá trị trung gian chưa bỏ: {:?}", live.keys().collect::<Vec<_>>());
        Ok(out)
    }
}
```

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker onnx_steps 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 7 passed`. Nếu `steps_give_the_same_bits_as_the_whole_graph` lỗi ở op (`unsupported op_type`, hình dạng `Split`) thì in lỗi của `whole()` trước: đồ thị test sai thì sửa đồ thị test, không sửa `StepGraph`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-worker && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/speaker-worker`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 4: `Embedder` chạy qua `StepGraph`

**Files:**
- Sửa: `crates/speaker-worker/Cargo.toml` (thêm `prost`, `sha2`)
- Sửa: `crates/speaker-worker/src/embed.rs` (chú thích đầu file dòng 1–14, chú thích `MAX_SAMPLES` dòng 28–29, `struct Embedder` dòng 34–41, `impl Embedder` dòng 43–124, helper test `synthetic_embedder` dòng 157–210; thêm test `#[ignore]` và test SHA-256)

- [ ] **Step 1: Viết test giống từng bit với model thật (`#[ignore]`) và sửa helper test**

Trong `mod tests` của `embed.rs`, thêm vào phần `use`:

```rust
    use crate::onnx_steps::StepGraph;
    use candle_onnx::onnx::tensor_shape_proto::Dimension;
    use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
    use candle_onnx::onnx::{TensorShapeProto, TypeProto, type_proto};
```

Thay `fn synthetic_embedder` bằng bản dựng qua `Embedder::from_model` (đầu vào `x` phải khai kiểu f32, hình `[N, T, 80]`):

```rust
    /// Đầu vào `x` của model giả: f32, hình `[N, T, 80]` như ERes2Net.
    fn x_value_info() -> ValueInfoProto {
        let dim = |d: Dim| Dimension {
            value: Some(d),
            ..Default::default()
        };
        ValueInfoProto {
            name: INPUT.to_string(),
            r#type: Some(TypeProto {
                value: Some(type_proto::Value::TensorType(type_proto::Tensor {
                    elem_type: DataType::Float as i32,
                    shape: Some(TensorShapeProto {
                        dim: vec![
                            dim(Dim::DimParam("N".into())),
                            dim(Dim::DimParam("T".into())),
                            dim(Dim::DimValue(NUM_BINS as i64)),
                        ],
                    }),
                })),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    /// Model giả không cần file: `x (1, T, 80)` nhân `w (80, DIM)`, rồi lấy `reduce_op` (ReduceMax hay ReduceMean) theo thời
    /// gian ra `embedding (1, DIM)`. Dựng qua `from_model` (không chạy thử), để test với trọng số NaN vẫn dựng được.
    fn synthetic_embedder(weights: Vec<f32>, reduce_op: &str) -> Embedder {
        assert_eq!(weights.len(), NUM_BINS * DIM);
        let int_attr = |name: &str, kind: AttributeType, i: i64, ints: Vec<i64>| AttributeProto {
            name: name.to_string(),
            r#type: kind as i32,
            i,
            ints,
            ..Default::default()
        };
        let graph = GraphProto {
            node: vec![
                NodeProto {
                    op_type: "MatMul".to_string(),
                    input: vec![INPUT.to_string(), "w".to_string()],
                    output: vec!["h".to_string()],
                    ..Default::default()
                },
                NodeProto {
                    op_type: reduce_op.to_string(),
                    input: vec!["h".to_string()],
                    output: vec![OUTPUT.to_string()],
                    attribute: vec![
                        int_attr("axes", AttributeType::Ints, 0, vec![1]),
                        int_attr("keepdims", AttributeType::Int, 0, Vec::new()),
                    ],
                    ..Default::default()
                },
            ],
            initializer: vec![TensorProto {
                name: "w".to_string(),
                dims: vec![NUM_BINS as i64, DIM as i64],
                data_type: DataType::Float as i32,
                float_data: weights,
                ..Default::default()
            }],
            input: vec![x_value_info()],
            output: vec![ValueInfoProto {
                name: OUTPUT.to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        Embedder::from_model(ModelProto {
            graph: Some(graph),
            ..Default::default()
        })
        .unwrap()
    }
```

Thêm test cần model thật:

```rust
    /// Cần model thật: `SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx cargo test -p speaker-worker --release --
    /// --ignored steps_match`. Cách B' (từng nút) cho nhúng giống hệt từng bit `simple_eval` cả đồ thị ở 1, 2, 4, 8 s (spec §4.1).
    /// Chạy lại mỗi lần nâng candle-onnx (B' dựa vào hành vi chưa ghi thành tài liệu, xem `onnx_steps`).
    #[test]
    #[ignore]
    fn steps_match_simple_eval_on_the_real_model() {
        let path = std::env::var("SPEAKER_MODEL").expect("đặt SPEAKER_MODEL");
        std::thread::Builder::new()
            .stack_size(16 << 20)
            .spawn(move || {
                let model = candle_onnx::read_file(&path).unwrap();
                let steps = StepGraph::from_model(model.clone(), INPUT, OUTPUT, NUM_BINS).unwrap();
                let fbank = Fbank::new();
                let signal = read_f32("signal.f32");
                for seconds in [1usize, 2, 4, 8] {
                    let samples: Vec<f32> = signal.iter().copied().cycle().take(16_000 * seconds).collect();
                    let feats = fbank.compute(&samples);
                    let frames = feats.len() / NUM_BINS;
                    let x = Tensor::from_vec(feats, (1, frames, NUM_BINS), &Device::Cpu).unwrap();
                    let whole = candle_onnx::simple_eval(&model, HashMap::from([(INPUT.to_string(), x.clone())]))
                        .unwrap()
                        .remove(OUTPUT)
                        .unwrap();
                    let ours = steps.run(x).unwrap();
                    let bits = |t: &Tensor| -> Vec<u32> {
                        t.flatten_all().unwrap().to_vec1::<f32>().unwrap().iter().map(|v| v.to_bits()).collect()
                    };
                    assert_eq!(bits(&ours), bits(&whole), "{seconds} s");
                }
            })
            .unwrap()
            .join()
            .unwrap();
    }
```

và test SHA-256 (không cần model):

```rust
    /// Worker băm đúng các byte nó đọc rồi mới đưa chúng vào bộ đọc protobuf (spec 2026-10-26-phan-biet-nguoi-noi §10): file bị
    /// thay sau lúc app kiểm thì bị từ chối.
    #[test]
    fn a_model_that_does_not_match_the_checked_sha256_is_refused() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let path = std::env::temp_dir().join(format!("speaker-worker-sha-{}.onnx", std::process::id()));
        std::fs::write(&path, b"khong phai onnx").unwrap();
        let wrong = "0".repeat(64);
        let err = Embedder::load_checked(&path, Some(&wrong)).err().expect("SHA-256 khác phải lỗi");
        assert!(format!("{err:#}").contains("SHA-256"), "{err:#}");
        // Đúng SHA-256 thì qua bước băm, rồi lỗi ở bước đọc model (byte không phải ONNX có graph).
        let right = sha256_hex(b"khong phai onnx");
        let err = Embedder::load_checked(&path, Some(&right)).err().expect("byte không phải ONNX phải lỗi");
        assert!(!format!("{err:#}").contains("SHA-256"), "{err:#}");
        let _ = std::fs::remove_file(&path);
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker embed 2>&1 | grep -E "^error" | head -3`
Expected: `no function or associated item named from_model found for struct Embedder` (và `load_checked`, `sha256_hex`).

- [ ] **Step 3: Sửa `Embedder`**

`crates/speaker-worker/Cargo.toml`, thêm vào `[dependencies]`:

```toml
# Đọc ModelProto từ byte đã băm (`Embedder::load_checked`). Cùng bản candle-onnx 0.11 dùng; mới nhất trên crates.io.
prost = "0.14.4"
# SHA-256 của model đúng các byte worker đọc (spec §10). Cùng bản app đang khóa (0.11.0); bản mới nhất 0.11.1: xem
# "Điều cần chủ dự án quyết".
sha2 = "0.11.0"
```

(Không thêm crate mới vào `Cargo.lock`: `prost` 0.14.4 đã có qua candle-onnx, `sha2` 0.11.0 đã có qua app.)

Thay chú thích đầu file (dòng 1–14) bằng:

```rust
//! Nhúng giọng ERes2Net (3D-Speaker, Apache-2.0) bằng candle-onnx (spec 2026-10-26-phan-biet-nguoi-noi §5.1): fbank đã trừ
//! trung bình → model → vector 192 chiều. Model là bản ONNX của sherpa-onnx đã rút gọn bằng onnxsim (bench/…/prepare_model.py):
//! bản chưa rút gọn có op `ReduceProd`, candle-onnx không chạy được.
//!
//! Bộ nhớ: model chạy từng nút (`onnx_steps`, cách B'), mỗi tensor trung gian bỏ ngay sau lần dùng cuối, trọng số chuyển một lần
//! lúc nạp. Đo trên M4 Pro (results/ram.md): một lần nhúng 8 s ≈ 181–196 MB RSS cả tiến trình; chạy lâu một cuộc họp với A2 4 s
//! (worker chỉ nhúng 4 s đầu mỗi đoạn, spec §5.2) 198–208 MB. Nhúng giống hệt từng bit `simple_eval` cả đồ thị (test
//! `steps_match_simple_eval_on_the_real_model`). `MAX_SAMPLES` (8 s) là lưới an toàn của chính `embed`; giới hạn A2 nằm ở
//! worker và giao thức (`speaker_protocol::MAX_EMBED_SAMPLES`).
//!
//! Stack: nên tạo và dùng `Embedder` trên luồng có stack lớn (worker và test dùng 16 MiB) để phòng xa cho Windows, nơi luồng
//! chính chỉ có 1 MiB.
```

Thay `use` của module (giữ `Range`, `Path`, `HashMap` chỉ trong test):

```rust
use std::fmt::Write as _;
use std::ops::Range;
use std::path::Path;

use anyhow::{Context, Result, ensure};
use candle_core::{Device, Tensor};
use candle_onnx::onnx::ModelProto;
use prost::Message;
use sha2::{Digest, Sha256};

use crate::fbank::{Fbank, NUM_BINS};
use crate::onnx_steps::StepGraph;
```

Thay `pub struct Embedder { … }` và toàn bộ `impl Embedder { … }` (từ `/// Bộ nhúng giọng` tới hết `embed_windowed`) bằng:

```rust
/// Bộ nhúng giọng: đồ thị ERes2Net đã tách từng nút cùng bộ tính fbank. Gọi `embed` lần lượt, không song song.
pub struct Embedder {
    steps: StepGraph,
    fbank: Fbank,
}

impl Embedder {
    /// Đọc file, dựng và chạy thử 1 s, để model sai hay op không được hỗ trợ lộ ra ngay lúc nạp. Không kiểm SHA-256 (công cụ đo,
    /// model dev); worker dùng [`Embedder::load_checked`].
    pub fn load(path: &Path) -> Result<Self> {
        Self::load_checked(path, None)
    }

    /// Như [`Embedder::load`], nhưng khi có `sha256` thì băm đúng các byte vừa đọc và dựng đồ thị từ chính các byte đó: file bị
    /// thay sau lúc app kiểm (spec 2026-10-26-phan-biet-nguoi-noi §10) bị từ chối trước khi tới bộ đọc protobuf.
    pub fn load_checked(path: &Path, sha256: Option<&str>) -> Result<Self> {
        let bytes = std::fs::read(path).with_context(|| format!("không đọc được {}", path.display()))?;
        if let Some(expected) = sha256 {
            ensure!(
                sha256_hex(&bytes).eq_ignore_ascii_case(expected),
                "SHA-256 của model khác bản app đã kiểm"
            );
        }
        let model = ModelProto::decode(bytes.as_slice()).context("model nhúng giọng không phải ONNX hợp lệ")?;
        drop(bytes);
        let embedder = Self::from_model(model)?;
        let probe: Vec<f32> = (0..16_000).map(|i| 0.1 * (i as f32 * 0.05).sin()).collect();
        let v = embedder
            .embed(&probe)
            .context("chạy thử model nhúng giọng lúc nạp thất bại")?;
        ensure!(
            v.iter().all(|x| x.is_finite()),
            "nhúng chạy thử có giá trị không hữu hạn"
        );
        Ok(embedder)
    }

    /// Dựng từ model đã đọc: tách đồ thị từng nút (kiểm đầu vào `x` f32 hạng 3 chiều cuối 80, thứ tự topo, tên trùng, graph
    /// lồng), chuyển trọng số thành tensor một lần. Không chạy thử.
    pub fn from_model(model: ModelProto) -> Result<Self> {
        Ok(Self {
            steps: StepGraph::from_model(model, INPUT, OUTPUT, NUM_BINS)?,
            fbank: Fbank::new(),
        })
    }

    /// Nhúng phần tiếng nói của một đoạn (16 kHz, [-1, 1]); từ `MIN_SAMPLES` mẫu, chỉ dùng `MAX_SAMPLES` mẫu đầu. Lỗi khi đoạn
    /// quá ngắn, khi đầu ra không đủ `DIM` chiều hay có giá trị không hữu hạn (NaN, vô cùng).
    pub fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        ensure!(
            samples.len() >= MIN_SAMPLES,
            "đoạn quá ngắn để nhúng: {} mẫu",
            samples.len()
        );
        let samples = &samples[..samples.len().min(MAX_SAMPLES)];
        let feats = self.fbank.compute(samples);
        let frames = feats.len() / NUM_BINS;
        let x = Tensor::from_vec(feats, (1, frames, NUM_BINS), &Device::Cpu)?;
        let v = self.steps.run(x)?.flatten_all()?.to_vec1::<f32>()?;
        ensure!(v.len() == DIM, "nhúng có {} chiều, cần {DIM}", v.len());
        ensure!(
            v.iter().all(|x| x.is_finite()),
            "nhúng có giá trị không hữu hạn (NaN hay vô cùng)"
        );
        Ok(v)
    }

    /// Nhúng theo cửa sổ (cách A của kế hoạch 01). **Chỉ để chạy lại số đo của `results/ram.md`** (`latency-bench embed-probe
    /// --window-s`, `speaker-eval --window-s`); worker không dùng. Chia `MAX_SAMPLES` mẫu đầu thành các cửa sổ `window_samples`
    /// mẫu (phần dư ngắn hơn `MIN_SAMPLES` gộp vào cửa sổ trước), nhúng từng cửa sổ, chuẩn hóa L2 rồi lấy trung bình. Đoạn
    /// không dài hơn một cửa sổ thì cho đúng kết quả của `embed`.
    pub fn embed_windowed(&self, samples: &[f32], window_samples: usize) -> Result<Vec<f32>> {
        ensure!(
            window_samples >= MIN_SAMPLES,
            "cửa sổ {window_samples} mẫu ngắn hơn MIN_SAMPLES ({MIN_SAMPLES})"
        );
        let samples = &samples[..samples.len().min(MAX_SAMPLES)];
        let bounds = window_bounds(samples.len(), window_samples);
        if bounds.len() <= 1 {
            return self.embed(samples);
        }
        let mut sum = vec![0.0f32; DIM];
        for r in &bounds {
            let v = self.embed(&samples[r.clone()])?;
            let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            ensure!(norm.is_finite() && norm > 0.0, "nhúng của cửa sổ {r:?} có chuẩn {norm}");
            for (s, x) in sum.iter_mut().zip(&v) {
                *s += x / norm;
            }
        }
        let n = bounds.len() as f32;
        Ok(sum.into_iter().map(|s| s / n).collect())
    }
}
```

Thêm hàm (sau `impl Embedder`):

```rust
/// SHA-256 dạng hex chữ thường (như `integrity::sha256_file` của app).
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().fold(String::with_capacity(64), |mut s, b| {
        let _ = write!(s, "{b:02x}");
        s
    })
}
```

Giữ nguyên `const INPUT`, `const OUTPUT`, `DIM`, `MIN_SAMPLES` (đã sửa ở Task 2), `MAX_SAMPLES`, `window_bounds`, `cosine`; riêng chú thích của `MAX_SAMPLES` (dòng 28–29, còn ghi "8 s ≈ 1,1–1,3 GB, 30 s ≈ 3,8 GB", không còn đúng với B') thay bằng:

```rust
/// Đoạn dài hơn chỉ lấy 8 s đầu: lưới an toàn của chính `embed` (worker chỉ gửi tối đa 4 s, `speaker_protocol::MAX_EMBED_SAMPLES`).
```

Thêm `use std::collections::HashMap;` vào đầu `mod tests` (test `steps_match_…` dùng). Test `loading_a_missing_file_fails_and_names_the_path` giữ nguyên (thông báo vẫn có đường dẫn).

- [ ] **Step 4: Chạy, thấy đạt (cả test cần model)**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, 50 đạt (42 + 7 của `onnx_steps` + 1 test SHA-256), 3 bỏ qua.

Build nặng (bản release của test): `cd $W && df -h . | tail -1` trước (≥ 22 GB). Rồi:

Run: `cd $W && SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker --release -- --ignored 2>&1 | grep -E "^test |^test result"`
Expected: `steps_match_simple_eval_on_the_real_model ... ok`, `embedding_matches_onnxruntime ... ok`, `windowed_embedding_against_the_whole_segment ... ok`. Test so onnxruntime vẫn đạt (cosine ≥ 0,999) là bằng chứng B' không đổi nhúng.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-worker && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-worker -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench 2>&1 | grep -E "^test result"`
Expected: `Finished`; `latency-bench` như mốc (`embed-probe`, `speaker-eval` dùng `Embedder::load`, `embed`, `embed_windowed`: chữ ký không đổi; `load` giờ gọi `load_checked(path, None)`). Không commit.

---

### Task 5: `Worker`: xử lý yêu cầu, không I/O

**Files:**
- Tạo: `crates/speaker-worker/src/session.rs`
- Sửa: `crates/speaker-worker/src/lib.rs` (thêm `pub mod session;`, sửa chú thích đầu file)

- [ ] **Step 1: Viết test với bộ nhúng giả**

Tạo `session.rs` chỉ với khối test:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    /// Bộ nhúng giả: dấu của mẫu đầu chọn vector (dương → A, âm → B, 0 → vector 0 không dùng được); ghi số mẫu mỗi lần gọi.
    struct Fake(Arc<Mutex<Vec<usize>>>);

    impl Embed for Fake {
        fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
            self.0.lock().unwrap().push(samples.len());
            Ok(match samples[0] {
                // Giá trị PCM 50: vector D, cosine 0,8 với A (test gộp).
                v if (v - 50.0 / i16::MAX as f32).abs() < 1e-6 => vec![0.8, 0.6, 0.0],
                v if v > 0.0 => vec![1.0, 0.0, 0.0],
                v if v < 0.0 => vec![0.0, 1.0, 0.0],
                _ => vec![0.0, 0.0, 0.0],
            })
        }
    }

    fn worker() -> (Worker<Fake>, Arc<Mutex<Vec<usize>>>) {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let c = calls.clone();
        let w = Worker::new(move |path: &Path, sha256: Option<&str>| {
            // `sai`: như bộ nạp thật khi byte đọc được khác SHA-256 app đã kiểm (`Embedder::load_checked`).
            if path.ends_with("hong.onnx") || sha256 == Some("sai") {
                anyhow::bail!("model hỏng")
            }
            Ok(Fake(c.clone()))
        });
        (w, calls)
    }

    fn load(w: &mut Worker<Fake>, path: &str, config: SpeakerConfig) -> Step {
        w.handle(Request::Load {
            model_path: path.into(),
            model_sha256: None,
            config,
        })
    }

    /// Đoạn `id` dài `ms` (thời lượng thật), PCM `pcm_len` mẫu toàn giá trị `value`.
    fn seg(id: u64, ms: u64, pcm_len: usize, value: i16, source: Source) -> Request {
        Request::Segment(SegmentAudio {
            segment_id: id,
            start_ms: 10_000,
            end_ms: 10_000 + ms,
            source,
            pcm: vec![value; pcm_len],
        })
    }

    fn replies(step: Step) -> Vec<Response> {
        match step {
            Step::Reply(r) => r,
            Step::Exit => panic!("không mong đợi Exit"),
        }
    }

    fn voices(list: &[(u32, bool)]) -> Response {
        Response::Voices {
            voices: list
                .iter()
                .map(|&(voice, mic)| VoiceInfo {
                    voice,
                    speech_ms: 0,
                    mic,
                })
                .collect(),
        }
    }

    /// So `Voices` bỏ qua `speech_ms` (thay đổi theo từng đoạn).
    fn strip(rs: Vec<Response>) -> Vec<Response> {
        rs.into_iter()
            .map(|r| match r {
                Response::Voices { voices } => Response::Voices {
                    voices: voices.into_iter().map(|v| VoiceInfo { speech_ms: 0, ..v }).collect(),
                },
                other => other,
            })
            .collect()
    }

    fn assign(id: u64, voice: Option<u32>, confidence: f32) -> Response {
        Response::Assign {
            segment_id: id,
            voice,
            confidence,
        }
    }

    #[test]
    fn load_reports_whether_the_model_is_usable() {
        let (mut w, _) = worker();
        let ready = |ok| {
            vec![Response::Ready {
                protocol_version: PROTOCOL_VERSION,
                model_ok: ok,
            }]
        };
        assert_eq!(replies(load(&mut w, "/m/hong.onnx", SpeakerConfig::default())), ready(false));
        assert_eq!(
            replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))),
            [Response::Error {
                segment_id: Some(1),
                kind: ErrorKind::NotLoaded,
                message: "chưa nạp model".into()
            }]
        );
        assert_eq!(replies(load(&mut w, "/m/tot.onnx", SpeakerConfig::default())), ready(true));
        // SHA-256 của `Load` tới bộ nạp; bộ nạp từ chối thì model không dùng được.
        let checked = Request::Load {
            model_path: "/m/tot.onnx".into(),
            model_sha256: Some("sai".into()),
            config: SpeakerConfig::default(),
        };
        assert_eq!(replies(w.handle(checked)), ready(false));
    }

    #[test]
    fn a_bad_config_falls_back_to_the_defaults() {
        let (mut w, _) = worker();
        let bad = SpeakerConfig {
            theta: f32::NAN,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", bad);
        assert_eq!(w.config(), &SpeakerConfig::default());
        let good = SpeakerConfig {
            theta: 0.5,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", good.clone());
        assert_eq!(w.config(), &good);
    }

    /// A2 (spec §5.2): chỉ nhúng tối đa 4 s đầu; thời lượng cho phân cụm là `end_ms − start_ms`, không phải số mẫu PCM.
    #[test]
    fn only_four_seconds_are_embedded_but_the_real_duration_clusters() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        // PCM 0,6 s nhưng đoạn thật dài 1,0 s: dưới `min_new_ms` (1,5 s) nên chưa mở giọng.
        assert_eq!(strip(replies(w.handle(seg(0, 1_000, 9_600, 100, Source::System)))), [assign(0, None, 0.0)]);
        // Cùng PCM nhưng đoạn thật dài 2,0 s: mở giọng 1.
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 9_600, 100, Source::System)))),
            [assign(1, Some(1), 1.0), voices(&[(1, false)])]
        );
        // Đoạn 6 s: app chỉ gửi 4 s đầu, worker nhúng đúng 4 s.
        replies(w.handle(seg(2, 6_000, MAX_EMBED_SAMPLES, 100, Source::System)));
        assert_eq!(*calls.lock().unwrap(), [9_600, 9_600, MAX_EMBED_SAMPLES]);
        // PCM dài hơn 4 s là lỗi của app.
        assert!(matches!(
            replies(w.handle(seg(3, 6_000, MAX_EMBED_SAMPLES + 1, 100, Source::System)))[..],
            [Response::Error { kind: ErrorKind::InvalidRequest, .. }]
        ));
    }

    #[test]
    fn short_segments_are_not_embedded_and_take_the_previous_voice() {
        let (mut w, calls) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        // 0,4 s < `min_embed_ms`: không gọi nhúng, lấy giọng trước, độ tin 0.
        assert_eq!(strip(replies(w.handle(seg(1, 400, 6_400, -100, Source::System)))), [assign(1, Some(1), 0.0)]);
        // 0,6 s nhưng PCM thiếu (dưới `MIN_SAMPLES`): cũng không nhúng.
        assert_eq!(strip(replies(w.handle(seg(2, 600, 7_000, -100, Source::System)))), [assign(2, Some(1), 0.0)]);
        assert_eq!(calls.lock().unwrap().len(), 1);
    }

    /// `Assign` trước, rồi `Voices` khi danh sách giọng đổi; không đổi thì chỉ `Assign`.
    #[test]
    fn voices_are_sent_only_when_the_list_changes() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)))),
            [assign(0, Some(1), 1.0), voices(&[(1, false)])]
        );
        assert_eq!(
            strip(replies(w.handle(seg(1, 2_000, 32_000, -100, Source::System)))),
            [assign(1, Some(2), 1.0), voices(&[(1, false), (2, false)])]
        );
        assert_eq!(strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::System)))), [assign(2, Some(1), 1.0)]);
    }

    #[test]
    fn an_unusable_embedding_opens_no_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(strip(replies(w.handle(seg(0, 2_000, 32_000, 0, Source::System)))), [assign(0, None, 0.0)]);
    }

    /// Giọng có ≥ 60% thời lượng từ micro là giọng trong phòng (spec §5.5); cờ đổi thì gửi lại `Voices`.
    #[test]
    fn a_voice_mostly_from_the_mic_is_in_the_room() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        assert_eq!(
            strip(replies(w.handle(seg(0, 2_000, 32_000, 100, Source::Mic)))),
            [assign(0, Some(1), 1.0), voices(&[(1, true)])]
        );
        // 2 s micro, rồi 2 s âm thanh máy: 50% < 60%, không còn là giọng trong phòng.
        let r = strip(replies(w.handle(seg(1, 2_000, 32_000, 100, Source::System))));
        assert_eq!(r[1], voices(&[(1, false)]));
        // `Mixed` không tính là micro.
        let r = strip(replies(w.handle(seg(2, 2_000, 32_000, 100, Source::Mixed))));
        assert_eq!(r.len(), 1, "{r:?}");
    }

    /// Gộp (mặc định tắt, bật lại được qua `speaker_config`): `merged` của bộ phân cụm thành `Merged`, thời lượng cộng sang giọng
    /// giữ lại. A = (1,0,0), D = (0,8; 0,6; 0): cosine 0,8. θ 0,9 nên D mở giọng 2; gộp 0,7 khi cả hai ≥ 3 s nên giọng 2 gộp
    /// ngay vào giọng 1 (bằng thời lượng thì giữ giọng mở trước), mã của chính đoạn đổi theo thành 1. Danh sách giọng trước và sau
    /// đều là [1] nên không có `Voices`; app bỏ giọng 2 nhờ `Merged`.
    #[test]
    fn merges_are_reported() {
        let (mut w, _) = worker();
        let config = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3_000,
            ..SpeakerConfig::default()
        };
        load(&mut w, "/m/tot.onnx", config);
        replies(w.handle(seg(0, 4_000, 32_000, 100, Source::System)));
        let r = strip(replies(w.handle(seg(1, 4_000, 32_000, 50, Source::System))));
        assert_eq!(r, [assign(1, Some(1), 1.0), Response::Merged { from: 2, into: 1 }]);
    }

    #[test]
    fn session_start_forgets_every_voice() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        assert!(replies(w.handle(Request::SessionStart { unix_ms: 1 })).is_empty());
        // Giọng cũ đã xóa: đoạn ngắn đầu tiên không có giọng nào để lấy.
        assert_eq!(strip(replies(w.handle(seg(1, 400, 6_400, 100, Source::System)))), [assign(1, None, 0.0)]);
    }

    #[test]
    fn bad_segments_are_rejected_without_panicking() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        let reversed = Request::Segment(SegmentAudio {
            segment_id: 9,
            start_ms: 5_000,
            end_ms: 4_000,
            source: Source::System,
            pcm: vec![1; 100],
        });
        assert!(matches!(
            replies(w.handle(reversed))[..],
            [Response::Error { segment_id: Some(9), kind: ErrorKind::InvalidRequest, .. }]
        ));
        assert!(matches!(
            replies(w.handle(seg(10, MAX_SEGMENT_MS + 1, 100, 1, Source::System)))[..],
            [Response::Error { kind: ErrorKind::InvalidRequest, .. }]
        ));
        assert_eq!(w.handle(Request::Shutdown), Step::Exit);
    }

    #[test]
    fn the_summary_has_only_counts() {
        let (mut w, _) = worker();
        load(&mut w, "/m/tot.onnx", SpeakerConfig::default());
        replies(w.handle(seg(0, 2_000, 32_000, 100, Source::System)));
        let s = w.summary();
        assert!(s.contains("1 đoạn") && s.contains("1 lần nhúng"), "{s}");
        assert!(!s.contains("100"), "không có mẫu âm thanh: {s}");
    }
}
```

Thêm `pub mod session;` vào `lib.rs` và thay chú thích đầu `lib.rs`:

```rust
//! Nhận giọng người nói (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §5): đặc trưng fbank, nhúng giọng ERes2Net chạy từng nút,
//! phân cụm trực tuyến, trạng thái của worker (`session`), phần phụ thuộc hệ điều hành (`platform`). Binary `speaker-worker`
//! (`main.rs`) nói giao thức `speaker-protocol` qua stdin/stdout. Không chứa ggml, không có mã mạng. Kế hoạch 04 thêm đọc tên.
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker session 2>&1 | grep -E "^error" | head -3`
Expected: không tìm thấy `Worker`, `Embed`, `Step`.

- [ ] **Step 3: Viết phần thân (phía trên khối test)**

```rust
//! Trạng thái của `speaker-worker` trong một lần chạy (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §4.2, §5): nhận yêu cầu, trả
//! phản hồi. Không I/O: `main.rs` đọc và ghi khung, test gọi thẳng [`Worker::handle`] với bộ nhúng giả.
//!
//! - `Load`: kiểm cấu hình (sai thì dùng mặc định), nạp model; model hỏng thì `Ready { model_ok: false }`, worker vẫn sống.
//! - `SessionStart`: xóa mọi giọng.
//! - `Segment`: thời lượng cho phân cụm là `end_ms − start_ms` (thời lượng thật); worker nhúng PCM app gửi (tối đa
//!   `MAX_EMBED_SAMPLES`, A2 §5.2); đoạn ngắn hơn `min_embed_ms` hay PCM ít hơn `MIN_SAMPLES` mẫu thì không nhúng. Trả `Assign`,
//!   rồi `Merged` (nếu có), rồi `Voices` khi danh sách giọng (mã, cờ trong phòng) đổi.
//! - Nhúng và tâm giọng chỉ nằm trong RAM, mất khi `SessionStart` hay khi worker thoát (§5.6). Log (stderr) chỉ có số đếm,
//!   thời gian và loại lỗi; không có âm thanh hay tên người.

use std::collections::BTreeMap;
use std::path::Path;
use std::time::Instant;

use anyhow::Result;
use speaker_protocol::{
    ErrorKind, MAX_EMBED_SAMPLES, MAX_SEGMENT_MS, PROTOCOL_VERSION, Request, Response, SegmentAudio, Source, SpeakerConfig,
    VoiceInfo, f32_from_pcm,
};

use crate::cluster::OnlineClusterer;
use crate::embed::{Embedder, MIN_SAMPLES};

/// Phần trăm thời lượng từ micro để một giọng là giọng trong phòng (spec §5.5).
pub const ROOM_MIC_PERCENT: u64 = 60;

/// Bộ nhúng mà [`Worker`] dùng: `Embedder` thật, hay bản giả trong test.
pub trait Embed {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>>;
}

impl Embed for Embedder {
    fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        Embedder::embed(self, samples)
    }
}

/// Thời lượng đã gán cho một giọng, và phần đến từ micro.
#[derive(Clone, Copy, Default)]
struct Tally {
    speech_ms: u64,
    mic_ms: u64,
}

impl Tally {
    fn room(&self) -> bool {
        self.speech_ms > 0 && self.mic_ms * 100 >= self.speech_ms * ROOM_MIC_PERCENT
    }
}

#[derive(Debug, PartialEq)]
pub enum Step {
    Reply(Vec<Response>),
    Exit,
}

/// Bộ nạp model: đường dẫn và SHA-256 app đã kiểm (`None`: không kiểm).
type Loader<E> = Box<dyn Fn(&Path, Option<&str>) -> Result<E>>;

pub struct Worker<E> {
    load: Loader<E>,
    embedder: Option<E>,
    config: SpeakerConfig,
    clusterer: OnlineClusterer,
    tally: BTreeMap<u32, Tally>,
    segments: u64,
    embedded: u64,
    embed_errors: u64,
    embed_ms: f64,
}

impl<E: Embed> Worker<E> {
    pub fn new(load: impl Fn(&Path, Option<&str>) -> Result<E> + 'static) -> Self {
        Self {
            load: Box::new(load),
            embedder: None,
            config: SpeakerConfig::default(),
            clusterer: OnlineClusterer::new(SpeakerConfig::default()),
            tally: BTreeMap::new(),
            segments: 0,
            embedded: 0,
            embed_errors: 0,
            embed_ms: 0.0,
        }
    }

    pub fn config(&self) -> &SpeakerConfig {
        &self.config
    }

    pub fn handle(&mut self, request: Request) -> Step {
        match request {
            Request::Load {
                model_path,
                model_sha256,
                config,
            } => Step::Reply(vec![self.load(&model_path, model_sha256.as_deref(), config)]),
            Request::SessionStart { .. } => {
                self.reset();
                Step::Reply(Vec::new())
            }
            Request::Segment(seg) => Step::Reply(self.segment(seg)),
            Request::Shutdown => Step::Exit,
        }
    }

    /// Một dòng cho log khi thoát: chỉ số đếm và thời gian.
    pub fn summary(&self) -> String {
        let avg = if self.embedded > 0 {
            self.embed_ms / self.embedded as f64
        } else {
            0.0
        };
        format!(
            "speaker-worker: {} đoạn, {} lần nhúng (lỗi {}), nhúng trung bình {avg:.1} ms, {} giọng còn sống",
            self.segments,
            self.embedded,
            self.embed_errors,
            self.clusterer.voice_count()
        )
    }

    fn load(&mut self, model_path: &str, model_sha256: Option<&str>, config: SpeakerConfig) -> Response {
        self.config = match config.validate() {
            Ok(()) => config,
            Err(field) => {
                eprintln!("speaker-worker: cấu hình nhận giọng sai ở `{field}`, dùng mặc định");
                SpeakerConfig::default()
            }
        };
        let t0 = Instant::now();
        self.embedder = match (self.load)(Path::new(model_path), model_sha256) {
            Ok(e) => {
                eprintln!("speaker-worker: nạp model xong trong {} ms", t0.elapsed().as_millis());
                Some(e)
            }
            Err(e) => {
                // Chỉ nguyên nhân gốc (không có đường dẫn, có thể chứa tên thư mục người dùng).
                eprintln!("speaker-worker: model nhúng giọng không dùng được: {}", e.root_cause());
                None
            }
        };
        self.reset();
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: self.embedder.is_some(),
        }
    }

    fn reset(&mut self) {
        self.clusterer = OnlineClusterer::new(self.config.clone());
        self.tally.clear();
    }

    /// Giọng đang sống kèm cờ trong phòng: thứ để so xem có phải gửi `Voices` không.
    fn voice_key(&self) -> Vec<(u32, bool)> {
        self.clusterer
            .voice_ids()
            .into_iter()
            .map(|v| (v, self.tally.get(&v).is_some_and(Tally::room)))
            .collect()
    }

    fn voices(&self) -> Vec<VoiceInfo> {
        self.clusterer
            .voice_ids()
            .into_iter()
            .map(|voice| {
                let t = self.tally.get(&voice).copied().unwrap_or_default();
                VoiceInfo {
                    voice,
                    speech_ms: t.speech_ms,
                    mic: t.room(),
                }
            })
            .collect()
    }

    fn segment(&mut self, seg: SegmentAudio) -> Vec<Response> {
        let error = |kind, message: &str| {
            vec![Response::Error {
                segment_id: Some(seg.segment_id),
                kind,
                message: message.into(),
            }]
        };
        if self.embedder.is_none() {
            return error(ErrorKind::NotLoaded, "chưa nạp model");
        }
        if seg.end_ms < seg.start_ms || seg.end_ms - seg.start_ms > MAX_SEGMENT_MS || seg.pcm.len() > MAX_EMBED_SAMPLES {
            return error(ErrorKind::InvalidRequest, "đoạn sai (thời lượng hay số mẫu)");
        }
        self.segments += 1;
        let duration = seg.end_ms - seg.start_ms;
        let embedding = if duration >= self.config.min_embed_ms && seg.pcm.len() >= MIN_SAMPLES {
            let t0 = Instant::now();
            let result = self.embedder.as_ref().map(|e| e.embed(&f32_from_pcm(&seg.pcm)));
            match result {
                Some(Ok(v)) => {
                    self.embedded += 1;
                    self.embed_ms += t0.elapsed().as_secs_f64() * 1000.0;
                    Some(v)
                }
                Some(Err(e)) => {
                    self.embed_errors += 1;
                    if self.embed_errors <= 3 {
                        eprintln!("speaker-worker: nhúng lỗi: {}", e.root_cause());
                    }
                    None
                }
                None => None,
            }
        } else {
            None
        };
        let before = self.voice_key();
        let a = self.clusterer.assign(duration, embedding.as_deref());
        for &(from, into) in &a.merged {
            if let Some(t) = self.tally.remove(&from) {
                let k = self.tally.entry(into).or_default();
                k.speech_ms = k.speech_ms.saturating_add(t.speech_ms);
                k.mic_ms = k.mic_ms.saturating_add(t.mic_ms);
            }
        }
        if let Some(v) = a.voice {
            let t = self.tally.entry(v).or_default();
            t.speech_ms = t.speech_ms.saturating_add(duration);
            if seg.source == Source::Mic {
                t.mic_ms = t.mic_ms.saturating_add(duration);
            }
        }
        let mut out = vec![Response::Assign {
            segment_id: seg.segment_id,
            voice: a.voice,
            confidence: a.confidence,
        }];
        out.extend(a.merged.iter().map(|&(from, into)| Response::Merged { from, into }));
        if self.voice_key() != before {
            out.push(Response::Voices { voices: self.voices() });
        }
        out
    }
}
```

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker session 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 11 passed`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-worker && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 6: Binary `speaker-worker`: ưu tiên thấp, pool rayon, vòng khung

**Files:**
- Sửa: `crates/speaker-worker/Cargo.toml`
- Tạo: `crates/speaker-worker/src/platform.rs`, `crates/speaker-worker/src/main.rs`, `crates/speaker-worker/tests/worker_process.rs`
- Sửa: `crates/speaker-worker/src/lib.rs` (thêm `pub mod platform;`)

- [ ] **Step 1: Thêm phụ thuộc và viết test chạy binary thật**

`crates/speaker-worker/Cargo.toml`, thêm vào `[dependencies]`:

```toml
# Hạ ưu tiên (setpriority), QoS của luồng, stdout riêng cho giao thức (spec §4.1). Cùng bản với asr-worker và pipeline
# (0.2.189 đang khóa cho cả workspace; bản mới nhất 0.2.191: xem "Điều cần chủ dự án quyết").
libc = "0.2.189"
# Pool tính toán toàn cục (QoS utility cho từng luồng). Bản candle-core 0.11 đang dùng; mới nhất trên crates.io.
rayon = "1.12.0"
```

(`prost`, `sha2` đã là phụ thuộc thường từ Task 4: test dưới đây dùng `prost::Message::encode_to_vec` để ghi model tổng hợp và `sha2` để băm nó.)

Tạo `crates/speaker-worker/tests/worker_process.rs`:

```rust
//! Chạy binary `speaker-worker` thật qua stdin/stdout (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §4.2, §10): model tổng hợp nhỏ
//! (không cần model thật), SHA-256 của model, khung hỏng, số luồng mặc định, ưu tiên thấp.

use std::io::{BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use candle_onnx::onnx::attribute_proto::AttributeType;
use candle_onnx::onnx::tensor_proto::DataType;
use candle_onnx::onnx::tensor_shape_proto::Dimension;
use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
use candle_onnx::onnx::{
    AttributeProto, GraphProto, ModelProto, NodeProto, TensorProto, TensorShapeProto, TypeProto, ValueInfoProto, type_proto,
};
use prost::Message;
use speaker_protocol::{
    ErrorKind, PROTOCOL_VERSION, Request, Response, SegmentAudio, Source, SpeakerConfig, read_frame, write_frame,
};

const EXE: &str = env!("CARGO_BIN_EXE_speaker-worker");

/// SHA-256 hex chữ thường của một file, như app gửi trong `Load`.
fn sha256_hex(path: &Path) -> String {
    use sha2::{Digest, Sha256};
    use std::fmt::Write as _;
    Sha256::digest(std::fs::read(path).unwrap())
        .iter()
        .fold(String::new(), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("speaker-worker-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

/// Model tổng hợp: `x (1, T, 80)` nhân `w (80, 192)` rồi ReduceMax theo thời gian ra `embedding (1, 192)`.
fn synthetic_model(dir: &Path) -> PathBuf {
    let dim = |d: Dim| Dimension {
        value: Some(d),
        ..Default::default()
    };
    let attr = |name: &str, kind: AttributeType, i: i64, ints: Vec<i64>| AttributeProto {
        name: name.into(),
        r#type: kind as i32,
        i,
        ints,
        ..Default::default()
    };
    let model = ModelProto {
        graph: Some(GraphProto {
            node: vec![
                NodeProto {
                    op_type: "MatMul".into(),
                    input: vec!["x".into(), "w".into()],
                    output: vec!["h".into()],
                    ..Default::default()
                },
                NodeProto {
                    op_type: "ReduceMax".into(),
                    input: vec!["h".into()],
                    output: vec!["embedding".into()],
                    attribute: vec![
                        attr("axes", AttributeType::Ints, 0, vec![1]),
                        attr("keepdims", AttributeType::Int, 0, Vec::new()),
                    ],
                    ..Default::default()
                },
            ],
            initializer: vec![TensorProto {
                name: "w".into(),
                dims: vec![80, 192],
                data_type: DataType::Float as i32,
                float_data: (0..80 * 192).map(|i| ((i % 7) as f32 - 3.0) * 0.01).collect(),
                ..Default::default()
            }],
            input: vec![ValueInfoProto {
                name: "x".into(),
                r#type: Some(TypeProto {
                    value: Some(type_proto::Value::TensorType(type_proto::Tensor {
                        elem_type: DataType::Float as i32,
                        shape: Some(TensorShapeProto {
                            dim: vec![dim(Dim::DimParam("N".into())), dim(Dim::DimParam("T".into())), dim(Dim::DimValue(80))],
                        }),
                    })),
                    ..Default::default()
                }),
                ..Default::default()
            }],
            output: vec![ValueInfoProto {
                name: "embedding".into(),
                ..Default::default()
            }],
            ..Default::default()
        }),
        ..Default::default()
    };
    let path = dir.join("model.onnx");
    std::fs::write(&path, model.encode_to_vec()).unwrap();
    path
}

struct Worker {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
}

impl Worker {
    fn spawn() -> Self {
        let mut child = Command::new(EXE)
            .env("RAYON_NUM_THREADS", "2")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .unwrap();
        let stdin = child.stdin.take().unwrap();
        let stdout = BufReader::new(child.stdout.take().unwrap());
        Self { child, stdin, stdout }
    }

    fn send(&mut self, req: &Request) {
        write_frame(&mut self.stdin, req).unwrap();
    }

    fn recv(&mut self) -> Response {
        read_frame::<_, Response>(&mut self.stdout).unwrap().unwrap()
    }

    /// Chờ tiến trình thoát; trả (thoát thành công, stderr).
    fn finish(self) -> (bool, String) {
        drop(self.stdin);
        let out = self.child.wait_with_output().unwrap();
        (out.status.success(), String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

fn chirp(len: usize) -> Vec<i16> {
    (0..len)
        .map(|i| (0.3 * (i as f32 * (0.02 + i as f32 * 1e-6)).sin() * i16::MAX as f32) as i16)
        .collect()
}

#[test]
fn a_synthetic_model_loads_and_segments_get_voices() {
    let dir = temp_dir("synthetic");
    let mut w = Worker::spawn();
    let model = synthetic_model(&dir);
    w.send(&Request::Load {
        model_path: model.display().to_string(),
        model_sha256: Some(sha256_hex(&model)),
        config: SpeakerConfig::default(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: true
        }
    );
    w.send(&Request::SessionStart { unix_ms: 1 });
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 4,
        start_ms: 0,
        end_ms: 2_000,
        source: Source::System,
        pcm: chirp(32_000),
    }));
    assert!(matches!(w.recv(), Response::Assign { segment_id: 4, voice: Some(1), .. }));
    assert!(matches!(w.recv(), Response::Voices { voices } if voices.len() == 1));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains("1 đoạn"), "{stderr}");
}

#[test]
fn a_missing_model_is_reported_not_fatal() {
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: "/khong/co/model.onnx".into(),
        model_sha256: None,
        config: SpeakerConfig::default(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false
        }
    );
    w.send(&Request::Segment(SegmentAudio {
        segment_id: 1,
        start_ms: 0,
        end_ms: 1_000,
        source: Source::System,
        pcm: vec![0; 100],
    }));
    assert!(matches!(w.recv(), Response::Error { kind: ErrorKind::NotLoaded, .. }));
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(!stderr.contains("/khong/co"), "log không chứa đường dẫn: {stderr}");
}

#[test]
fn a_broken_frame_ends_the_worker_without_a_panic() {
    for bytes in [
        (u32::MAX).to_le_bytes().to_vec(),       // khung quá 4 MiB
        vec![3, 0, 0, 0, 0xFF, 0xFF, 0xFF],      // nội dung không giải mã được
        vec![2, 0, 0],                           // độ dài cụt
    ] {
        let mut w = Worker::spawn();
        w.stdin.write_all(&bytes).unwrap();
        let (ok, stderr) = w.finish();
        assert!(!ok, "khung hỏng phải làm worker thoát lỗi");
        assert!(!stderr.contains("panicked"), "{stderr}");
    }
}

/// Spec §10: byte của model khác SHA-256 app đã kiểm thì worker không dùng model; log không có đường dẫn.
#[test]
fn a_model_with_another_sha256_is_not_used() {
    let dir = temp_dir("sha");
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: synthetic_model(&dir).display().to_string(),
        model_sha256: Some("0".repeat(64)),
        config: SpeakerConfig::default(),
    });
    assert_eq!(
        w.recv(),
        Response::Ready {
            protocol_version: PROTOCOL_VERSION,
            model_ok: false
        }
    );
    w.send(&Request::Shutdown);
    let (ok, stderr) = w.finish();
    assert!(ok, "{stderr}");
    assert!(stderr.contains("SHA-256 của model khác"), "{stderr}");
    assert!(!stderr.contains(&dir.display().to_string()), "log không có đường dẫn: {stderr}");
    let _ = std::fs::remove_dir_all(&dir);
}

/// Thiếu `RAYON_NUM_THREADS` (chạy tay, lỗi ở app): worker tự dùng 2 luồng, không chiếm mọi lõi (spec §4.1, §11).
#[test]
fn without_the_thread_variable_the_worker_still_uses_two_threads() {
    let mut child = Command::new(EXE)
        .env_remove("RAYON_NUM_THREADS")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    write_frame(&mut stdin, &Request::Shutdown).unwrap();
    drop(stdin);
    let out = child.wait_with_output().unwrap();
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(out.status.success(), "{stderr}");
    assert!(stderr.contains("speaker-worker: 2 luồng tính toán"), "{stderr}");
}

/// Spec §4.1: macOS `setpriority(PRIO_PROCESS, 0, 10)`.
#[cfg(target_os = "macos")]
#[test]
fn the_worker_lowers_its_priority() {
    let mut w = Worker::spawn();
    w.send(&Request::Load {
        model_path: "/khong/co/model.onnx".into(),
        model_sha256: None,
        config: SpeakerConfig::default(),
    });
    w.recv();
    // SAFETY: chỉ đọc mức nice của tiến trình con.
    let nice = unsafe { libc::getpriority(libc::PRIO_PROCESS, w.child.id()) };
    // `setpriority(…, 10)` đặt giá trị tuyệt đối: chạy dưới tiến trình cha đã có nice > 10 thì worker giữ nice của cha.
    assert!(nice >= 10, "nice {nice}");
    w.send(&Request::Shutdown);
    assert!(w.finish().0);
}
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker --test worker_process 2>&1 | grep -E "^error" | head -3`
Expected: `environment variable CARGO_BIN_EXE_speaker-worker not defined` (chưa có binary).

- [ ] **Step 3: Viết `platform.rs` và `main.rs`**

`crates/speaker-worker/src/platform.rs`:

```rust
//! Phần phụ thuộc hệ điều hành của `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §10.2). `protocol_stdout` và
//! `harden_dll_search` chép từ `asr_worker::platform` (không dùng chung được: crate đó link whisper.cpp và ggml, mà worker này
//! không được chứa ggml).
//!
//! - `lower_priority`: macOS `setpriority(PRIO_PROCESS, 0, 10)` và QoS `utility` cho luồng gọi; Windows
//!   `BELOW_NORMAL_PRIORITY_CLASS` cho cả tiến trình.
//! - `init_compute_pool`: dựng pool rayon toàn cục một lần, trước mọi phép tính; số luồng theo `RAYON_NUM_THREADS` mà app đặt lúc
//!   chạy worker (rayon đọc biến này lúc tạo pool; candle-core 0.11 đọc nó ở mỗi lần nhân ma trận). Mỗi luồng của pool đặt QoS
//!   `utility` (macOS). Không gọi `Device::with_context`: pool riêng của candle-core tự đặt QoS user-interactive
//!   (results/ram.md, mục "Ghi cho kế hoạch 02").

use std::fs::File;
use std::io;

/// Trả `File` ghi vào stdout gốc (pipe giao thức với app); từ đây mọi thứ in ra stdout, kể cả `println!`, đi sang stderr.
#[cfg(unix)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::fd::FromRawFd;
    // SAFETY: `dup` và `dup2` chỉ thao tác trên bảng fd của tiến trình. `fd` mới thuộc quyền `File` trả về.
    unsafe {
        let fd = libc::dup(libc::STDOUT_FILENO);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(libc::STDERR_FILENO, libc::STDOUT_FILENO) < 0 {
            let err = io::Error::last_os_error();
            libc::close(fd);
            return Err(err);
        }
        Ok(File::from_raw_fd(fd))
    }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Handle = *mut c_void;
    pub const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    pub const STD_ERROR_HANDLE: u32 = -12i32 as u32;
    pub const DUPLICATE_SAME_ACCESS: u32 = 0x0000_0002;
    pub const LOAD_LIBRARY_SEARCH_APPLICATION_DIR: u32 = 0x0000_0200;
    pub const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn GetStdHandle(which: u32) -> Handle;
        pub fn SetStdHandle(which: u32, handle: Handle) -> i32;
        pub fn GetCurrentProcess() -> Handle;
        pub fn DuplicateHandle(
            source_process: Handle,
            source: Handle,
            target_process: Handle,
            target: *mut Handle,
            access: u32,
            inherit: i32,
            options: u32,
        ) -> i32;
        pub fn SetDefaultDllDirectories(flags: u32) -> i32;
    }
}

/// Bản Windows: sao handle của pipe stdout cho giao thức; CRT fd 1 và handle chuẩn của Win32 đều trỏ sang stderr.
#[cfg(windows)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::windows::io::FromRawHandle;
    // SAFETY: chỉ đọc hay đổi bảng handle của chính tiến trình; `copy` là handle mới, thuộc quyền `File` trả về.
    unsafe {
        let original = win::GetStdHandle(win::STD_OUTPUT_HANDLE);
        let process = win::GetCurrentProcess();
        let mut copy: win::Handle = std::ptr::null_mut();
        if win::DuplicateHandle(process, original, process, &mut copy, 0, 0, win::DUPLICATE_SAME_ACCESS) == 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(2, 1) < 0 {
            return Err(io::Error::last_os_error());
        }
        if win::SetStdHandle(win::STD_OUTPUT_HANDLE, win::GetStdHandle(win::STD_ERROR_HANDLE)) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(File::from_raw_handle(copy))
    }
}

/// Windows: bỏ thư mục hiện tại và `PATH` khỏi đường tìm DLL (spec §10.2). Gọi đầu tiên trong `main`.
#[cfg(windows)]
pub fn harden_dll_search() -> io::Result<()> {
    // SAFETY: chỉ đổi cờ tìm DLL của tiến trình.
    let ok = unsafe {
        win::SetDefaultDllDirectories(win::LOAD_LIBRARY_SEARCH_APPLICATION_DIR | win::LOAD_LIBRARY_SEARCH_SYSTEM32)
    };
    if ok == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}

/// Đặt QoS `utility` cho luồng đang chạy (macOS); nền tảng khác không làm gì.
pub fn utility_qos_for_this_thread() {
    #[cfg(target_os = "macos")]
    // SAFETY: chỉ đổi lớp QoS của chính luồng gọi.
    unsafe {
        libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0);
    }
}

/// Hạ ưu tiên của cả tiến trình (spec §4.1). Lỗi thì chỉ ghi log: worker vẫn chạy được.
pub fn lower_priority() {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: chỉ đổi mức nice của chính tiến trình này.
        if unsafe { libc::setpriority(libc::PRIO_PROCESS, 0, 10) } != 0 {
            eprintln!("speaker-worker: không hạ được ưu tiên: {}", io::Error::last_os_error());
        }
    }
    #[cfg(windows)]
    {
        use windows::Win32::System::Threading::{BELOW_NORMAL_PRIORITY_CLASS, GetCurrentProcess, SetPriorityClass};
        // SAFETY: handle giả của chính tiến trình; chỉ đổi lớp ưu tiên.
        if let Err(e) = unsafe { SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS) } {
            eprintln!("speaker-worker: không hạ được ưu tiên: {e}");
        }
    }
    utility_qos_for_this_thread();
}

/// Dựng pool rayon toàn cục (số luồng theo `RAYON_NUM_THREADS`, QoS `utility`). Gọi một lần, trước mọi phép tính.
pub fn init_compute_pool() -> Result<(), rayon::ThreadPoolBuildError> {
    rayon::ThreadPoolBuilder::new()
        .thread_name(|i| format!("speaker-{i}"))
        .start_handler(|_| utility_qos_for_this_thread())
        .build_global()
}
```

`crates/speaker-worker/src/main.rs`:

```rust
//! Tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1): đọc `Request` từ stdin, ghi `Response` ra stdout.
//! stdout chỉ dùng cho khung giao thức (`platform::protocol_stdout`). Mọi lỗi đọc hay ghi khung làm worker thoát với mã 1;
//! app tự khởi động lại. Không có mã mạng (CI kiểm cây phụ thuộc, kế hoạch 02b).

use std::io::{BufReader, BufWriter};
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use speaker_protocol::{Request, read_frame, write_frame};
use speaker_worker::embed::Embedder;
use speaker_worker::platform;
use speaker_worker::session::{Step, Worker};

/// Stack của luồng chạy vòng khung (nhúng giọng chạy trên luồng này): phòng xa cho Windows, nơi luồng chính chỉ có 1 MiB.
const STACK_BYTES: usize = 16 << 20;

fn main() -> Result<()> {
    // Việc đầu tiên trên Windows: chỉ nạp DLL từ thư mục app và System32.
    #[cfg(windows)]
    platform::harden_dll_search()?;
    // App luôn đặt `RAYON_NUM_THREADS=2` (spec §4.1). Thiếu biến (chạy tay, lỗi ở app) thì rayon và candle-core (đọc biến này
    // mỗi lần nhân ma trận) dùng mọi lõi, trái ngân sách CPU (§11): đặt mặc định 2.
    if std::env::var_os("RAYON_NUM_THREADS").is_none() {
        // SAFETY: đầu `main`, chưa có luồng nào khác đọc hay ghi môi trường.
        unsafe { std::env::set_var("RAYON_NUM_THREADS", "2") };
    }
    let protocol = platform::protocol_stdout()?;
    platform::lower_priority();
    platform::init_compute_pool().context("không dựng được bộ luồng tính toán")?;
    // Số luồng thật vào log (02b, soak test đọc được).
    eprintln!("speaker-worker: {} luồng tính toán", rayon::current_num_threads());
    std::thread::Builder::new()
        .name("speaker-worker".into())
        .stack_size(STACK_BYTES)
        .spawn(move || serve(protocol))?
        .join()
        .map_err(|_| anyhow!("luồng chính của worker dừng bất thường"))?
}

fn serve(protocol: std::fs::File) -> Result<()> {
    platform::utility_qos_for_this_thread();
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(protocol);
    let mut worker = Worker::new(|path: &Path, sha256: Option<&str>| Embedder::load_checked(path, sha256));
    while let Some(request) = read_frame::<_, Request>(&mut input)? {
        match worker.handle(request) {
            Step::Exit => break,
            Step::Reply(responses) => {
                for r in &responses {
                    write_frame(&mut output, r)?;
                }
            }
        }
    }
    eprintln!("{}", worker.summary());
    Ok(())
}
```

Thêm `pub mod platform;` vào `lib.rs`.

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p speaker-worker 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: mọi dòng `ok`; `worker_process`: 6 đạt (5 trên nền khác macOS).

- [ ] **Step 5: Kiểm kiểu Windows và mốc kiểm**

Run: `cd $W && cargo fmt -p speaker-worker && CARGO_TARGET_DIR=$W/target cargo clippy -p speaker-worker --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target PKG_CONFIG_x86_64_pc_windows_msvc="$W/scripts/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 cargo clippy -p speaker-worker --all-targets --target x86_64-pc-windows-msvc -- -D warnings 2>&1 | tail -2 && git status --short crates/speaker-worker`
Expected: `Finished` hai lần, không cảnh báo. Lỗi kiểu của `windows` (`SetPriorityClass`) thì đối chiếu `~/.cargo/registry/src/*/windows-0.62.2/src/Windows/Win32/System/Threading/mod.rs` (dòng `pub unsafe fn SetPriorityClass`). Không commit.

---

### Task 7: Cờ nguồn của từng mẫu ở bộ trộn (`audio-capture`)

**Files:**
- Sửa: `crates/audio-capture/Cargo.toml` (`[dependencies]`)
- Sửa: `crates/audio-capture/src/duck.rs` (chú thích đầu file; `struct DuckingMixer` dòng 158–176; `DuckingMixer::new` dòng 181–197; vòng ghép trong `drain_into_with` dòng 225–238; `flush_playback` dòng 328–345; `flush_mic` dòng 347–358; thêm `Tagger`)

- [ ] **Step 1: Viết test**

Thêm vào cuối `mod tests` của `duck.rs`:

```rust
    /// Mẫu 300 Hz biên độ `amp` (micro hay âm thanh máy có tiếng).
    fn tone(len: usize, amp: f32) -> Vec<f32> {
        (0..len)
            .map(|i| amp * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
            .collect()
    }

    /// Trộn `playback` với micro `mic`, bật cờ nguồn; trả (mẫu ra, cờ).
    fn tagged(params: GateParams, playback: &[f32], mic: &[f32]) -> (Vec<f32>, Vec<Source>) {
        let mut m = DuckingMixer::new(params, usize::MAX);
        m.set_tagging(true);
        m.push_playback(playback);
        m.push_mic(mic, mic);
        let (mut out, mut vad, mut tags) = (Vec::new(), Vec::new(), Vec::new());
        m.flush_into(&mut out, &mut vad);
        m.take_tags(&mut tags);
        (out, tags)
    }

    #[test]
    fn tags_are_off_by_default() {
        let mut m = DuckingMixer::new(GateParams::default(), usize::MAX);
        m.push_playback(&[0.1; 1_600]);
        m.push_mic(&[0.1; 1_600], &[0.1; 1_600]);
        let (mut out, mut vad, mut tags) = (Vec::new(), Vec::new(), Vec::new());
        m.drain_into(&mut out, &mut vad);
        m.take_tags(&mut tags);
        assert!(tags.is_empty());
    }

    /// Âm thanh máy im, micro có tiếng: `Mic` từ khung 10 ms thứ hai (cờ áp từ khung sau, như cổng).
    #[test]
    fn a_speaking_mic_over_silent_playback_is_mic() {
        let (out, tags) = tagged(GateParams::default(), &[0.0; 3_200], &tone(3_200, 0.1));
        assert_eq!(tags.len(), out.len());
        assert!(tags[..GATE_FRAME].iter().all(|&t| t == Source::System));
        assert!(tags[GATE_FRAME..].iter().all(|&t| t == Source::Mic), "{:?}", &tags[GATE_FRAME..GATE_FRAME + 4]);
    }

    /// Âm thanh máy to: cổng hạ micro, mẫu là `System`. Khung 10 ms đầu cổng chưa kịp hạ (cổng áp từ khung sau) nên khung thứ
    /// hai mang `Mixed`; từ khung thứ ba micro đã bị hạ.
    #[test]
    fn a_loud_playback_ducks_the_mic_and_is_system() {
        let (_, tags) = tagged(GateParams::default(), &tone(3_200, 0.1), &tone(3_200, 0.1));
        assert!(tags[GATE_FRAME..2 * GATE_FRAME].iter().all(|&t| t == Source::Mixed));
        assert!(tags[2 * GATE_FRAME..].iter().all(|&t| t == Source::System));
    }

    /// Cổng không hạ (`duck_db` 0) mà cả hai có tiếng: `Mixed`.
    #[test]
    fn both_speaking_without_ducking_is_mixed() {
        let params = GateParams {
            duck_db: 0.0,
            ..GateParams::default()
        };
        let (_, tags) = tagged(params, &tone(3_200, 0.1), &tone(3_200, 0.1));
        assert!(tags[GATE_FRAME..].iter().all(|&t| t == Source::Mixed));
    }

    /// Phần chỉ có một luồng: âm thanh máy dư ra là `System`; micro được xả khi âm thanh máy im (`release_mic`) là `Mic` nếu có
    /// tiếng.
    #[test]
    fn unpaired_samples_are_tagged_by_their_stream() {
        let mut m = DuckingMixer::new(GateParams::default(), 0);
        m.set_tagging(true);
        m.push_playback(&[0.0; 800]);
        let (mut out, mut vad, mut tags) = (Vec::new(), Vec::new(), Vec::new());
        m.drain_into(&mut out, &mut vad);
        m.push_mic(&tone(1_600, 0.1), &tone(1_600, 0.1));
        m.release_mic(&mut out, &mut vad);
        m.take_tags(&mut tags);
        assert_eq!(tags.len(), out.len());
        assert!(tags[..800].iter().all(|&t| t == Source::System));
        assert!(tags[800 + GATE_FRAME..].iter().all(|&t| t == Source::Mic));
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p audio-capture duck 2>&1 | grep -E "^error" | head -3`
Expected: không tìm thấy `Source`, `set_tagging`, `take_tags`.

- [ ] **Step 3: Viết mã**

`crates/audio-capture/Cargo.toml`, thêm vào `[dependencies]`:

```toml
# Kiểu cờ nguồn của khung (spec 2026-10-26-phan-biet-nguoi-noi §5.5), dùng chung với pipeline và speaker-worker.
speaker-protocol = { path = "../speaker-protocol" }
```

Trong `duck.rs`, thêm một gạch đầu dòng vào chú thích đầu file (sau gạch "Cổng kép"):

```rust
//! - Cờ nguồn (spec 2026-10-26-phan-biet-nguoi-noi §5.5), bật bằng [`DuckingMixer::set_tagging`]: mỗi mẫu ra mang `System`
//!   (micro bị hạ hay im), `Mic` (âm thanh máy dưới ngưỡng nhường lời, micro có tiếng) hay `Mixed` (cả hai có tiếng), quyết theo
//!   khung 10 ms như cổng và áp từ khung sau. Lấy ra bằng [`DuckingMixer::take_tags`], thẳng hàng với `out`.
```

thêm `use speaker_protocol::Source;` dưới `use std::collections::VecDeque;`, và hằng cùng kiểu `Tagger` ngay trên `pub struct DuckingMixer`:

```rust
/// Micro "có tiếng" cho cờ nguồn: mức của khung 10 ms (sau hệ số cổng) từ chừng này trở lên.
pub const MIC_ACTIVE_DBFS: f32 = -50.0;

/// Cờ nguồn cho từng mẫu ra (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
struct Tagger {
    on: bool,
    /// Cờ của khung đang chạy (quyết ở cuối khung trước).
    tag: Source,
    pb_sq: f32,
    mic_sq: f32,
    ducked: bool,
    n: usize,
    /// Ngưỡng "âm thanh máy có tiếng" của cổng (bình phương trung bình).
    loud_sq: f32,
    mic_active_sq: f32,
    out: Vec<Source>,
}

impl Tagger {
    fn new(loud_sq: f32) -> Self {
        Self {
            on: false,
            tag: Source::System,
            pb_sq: 0.0,
            mic_sq: 0.0,
            ducked: false,
            n: 0,
            loud_sq,
            mic_active_sq: 10f32.powf(MIC_ACTIVE_DBFS / 10.0),
            out: Vec::new(),
        }
    }

    /// Một mẫu ra: Playback `playback`, hệ số cổng `gain`, micro `mic` (0 khi không có micro ở vị trí này).
    fn sample(&mut self, playback: f32, gain: f32, mic: f32) {
        if !self.on {
            return;
        }
        self.out.push(self.tag);
        let m = gain * mic;
        self.pb_sq += playback * playback;
        self.mic_sq += m * m;
        self.ducked |= gain < 1.0;
        self.n += 1;
        if self.n == GATE_FRAME {
            let n = GATE_FRAME as f32;
            self.tag = if self.ducked || self.mic_sq / n < self.mic_active_sq {
                Source::System
            } else if self.pb_sq / n >= self.loud_sq {
                Source::Mixed
            } else {
                Source::Mic
            };
            self.pb_sq = 0.0;
            self.mic_sq = 0.0;
            self.ducked = false;
            self.n = 0;
        }
    }
}
```

Thêm trường `tagger: Tagger,` vào cuối `struct DuckingMixer`. Trong `DuckingMixer::new`, dựng cổng trước rồi dùng ngưỡng của nó:

```rust
    pub fn new(params: GateParams, max_skew_samples: usize) -> Self {
        let gate = MicGate::new(params);
        let tagger = Tagger::new(gate.loud_sq());
        Self {
            playback: VecDeque::new(),
            mic: VecDeque::new(),
            mic_vad: VecDeque::new(),
            gate,
            max_skew: max_skew_samples,
            mic_samples: 0,
            ducked_samples: 0,
            speech_buf: Vec::with_capacity(SPEECH_FRAME),
            speech_started: false,
            speech_calls: 0,
            speech_skips: 0,
            speech_failed: false,
            speech_error: None,
            tagger,
        }
    }

    /// Bật hay tắt cờ nguồn cho từng mẫu ra. Tắt (mặc định) thì không ghi gì.
    pub fn set_tagging(&mut self, on: bool) {
        self.tagger.on = on;
    }

    /// Chuyển cờ của các mẫu đã ra từ lần lấy trước vào `tags`: thẳng hàng với `out` của `drain_into*`, `flush_into*`,
    /// `release_mic`. Gọi sau mỗi lần xả, để bộ nhớ không lớn dần.
    pub fn take_tags(&mut self, tags: &mut Vec<Source>) {
        tags.append(&mut self.tagger.out);
    }
```

Trong vòng ghép của `drain_into_with`, ngay sau `self.listen(p, &mut speech);` thêm `self.tagger.sample(p, g, m);`. Trong `flush_playback`, sau `self.listen(p, speech);` thêm `self.tagger.sample(p, 1.0, 0.0);`. Trong `flush_mic`, sau dòng `out_vad.push(...)` thêm `self.tagger.sample(0.0, g, m);`.

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p audio-capture 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 5 test so với mốc.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p audio-capture && CARGO_TARGET_DIR=$W/target cargo clippy -p audio-capture -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/audio-capture`
Expected: `Finished`, không cảnh báo (`latency-bench mix-eval` dùng `DuckingMixer::new`, chữ ký không đổi). Không commit.

---

### Task 8: Phía luồng VAD: `lead_samples`, `read_tagged`, `SpeakerTap`

**Files:**
- Sửa: `crates/pipeline/Cargo.toml`, `crates/pipeline/src/lib.rs`
- Sửa: `crates/pipeline/src/segmenter.rs` (`struct Segment` dòng 40–57, `emit` dòng 274–297, `Debug for Segment`)
- Sửa: `crates/pipeline/src/engine.rs` (trait `FrameSource` dòng 85–100; test; literal `crate::segmenter::Segment { … }` trong test `no_partial_is_scheduled_while_a_closed_segment_waits`, dòng ~4917)
- Tạo: `crates/pipeline/src/speaker.rs`

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `segmenter.rs` (cuối khối):

```rust
    /// `lead_samples`: số mẫu đệm trước tiếng nói (spec 2026-10-26-phan-biet-nguoi-noi §4.2: worker nhận phần tiếng nói, không đệm).
    #[test]
    fn lead_samples_mark_where_the_speech_starts() {
        let quiet = [0.0f32; FRAME_SAMPLES];
        let loud = [0.5f32; FRAME_SAMPLES];
        let run = |silent_before: usize| {
            let mut s = Segmenter::new(SegmenterConfig::default());
            for _ in 0..silent_before {
                assert!(s.push(&quiet, 0.0).is_empty());
            }
            let mut out = Vec::new();
            for _ in 0..20 {
                out.extend(s.push(&loud, 0.9));
            }
            for _ in 0..20 {
                out.extend(s.push(&quiet, 0.0));
            }
            out.remove(0)
        };
        // Đệm 200 ms làm tròn lên 7 khung.
        let seg = run(10);
        assert_eq!(seg.lead_samples, 7 * FRAME_SAMPLES);
        assert!(seg.samples[..seg.lead_samples].iter().all(|&v| v == 0.0));
        assert!(seg.samples[seg.lead_samples..seg.lead_samples + FRAME_SAMPLES].iter().all(|&v| v == 0.5));
        // Đầu phiên chỉ có 2 khung trước tiếng nói: đệm trước ngắn hơn.
        assert_eq!(run(2).lead_samples, 2 * FRAME_SAMPLES);
    }
```

Tạo `crates/pipeline/src/speaker.rs` chỉ với khối test (Step 3 thêm phần thân phía trên):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn majority_prefers_system_then_mic_on_ties() {
        use Source::*;
        assert_eq!(majority([Mic, Mic, System].into_iter()), Mic);
        assert_eq!(majority([Mic, System].into_iter()), System);
        assert_eq!(majority([Mixed, Mic].into_iter()), Mic);
        assert_eq!(majority(std::iter::empty()), System);
    }

    #[test]
    fn the_track_gives_the_source_of_most_frames_in_a_range() {
        let mut t = SourceTrack::default();
        for frame in 0..10u64 {
            t.push(frame, if frame < 7 { Source::Mic } else { Source::System });
        }
        // Khung 32 ms: [0, 224) ms là khung 0..7, toàn `Mic`; [160, 320) ms là khung 5..10: 2 `Mic`, 3 `System`.
        assert_eq!(t.majority_between(0, 224), Source::Mic);
        assert_eq!(t.majority_between(160, 320), Source::System);
    }

    #[test]
    fn the_track_forgets_old_frames_and_restarts_after_a_gap() {
        let mut t = SourceTrack::default();
        for frame in 0..(TRACK_FRAMES as u64 + 10) {
            t.push(frame, Source::Mic);
        }
        // Khung 0..10 đã bị quên: không còn khung nào trong khoảng đó.
        assert_eq!(t.majority_between(0, 10 * 32), Source::System);
        // Nhảy cóc (khung không liền mạch): bắt đầu lại từ khung mới.
        t.push(5_000, Source::Mixed);
        assert_eq!(t.majority_between(5_000 * 32, 5_001 * 32), Source::Mixed);
    }

    fn segment(id: u64, start_ms: u64, speech_ms: u64, lead: usize) -> Segment {
        let speech = (speech_ms * 16) as usize;
        let mut samples = vec![0.0f32; lead];
        samples.extend((0..speech).map(|i| if i % 2 == 0 { 0.25 } else { -0.25 }));
        samples.extend([0.0; 3_584]);
        Segment {
            id,
            start_ms,
            end_ms: start_ms + speech_ms,
            speech_ms,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples,
            lead_samples: lead,
        }
    }

    #[test]
    fn prepare_takes_at_most_four_seconds_of_speech_without_padding() {
        let (link, _ends) = SpeakerLink::pair();
        let mut tap = SpeakerTap::new(link.segments, link.offered_end_ms);
        for frame in 0..400u64 {
            tap.push_frame(frame, &[Source::Mic; 512]);
        }
        let short = tap.prepare(SpeakerTap::copy_speech(&segment(3, 1_000, 1_500, 3_584)));
        assert_eq!((short.segment_id, short.start_ms, short.end_ms), (3, 1_000, 2_500));
        assert_eq!(short.pcm.len(), 24_000);
        assert_eq!(short.pcm[0], (0.25 * i16::MAX as f32) as i16, "bỏ phần đệm trước");
        assert_eq!(short.source, Source::Mic);
        let long = tap.prepare(SpeakerTap::copy_speech(&segment(4, 2_000, 7_000, 3_584)));
        assert_eq!(long.pcm.len(), MAX_EMBED_SAMPLES);
        assert_eq!(long.end_ms - long.start_ms, 7_000, "thời lượng thật giữ nguyên");
    }

    #[test]
    fn send_never_blocks_and_counts_drops() {
        let (link, ends) = SpeakerLink::pair();
        let mut tap = SpeakerTap::new(link.segments, link.offered_end_ms.clone());
        for id in 0..10 {
            let audio = tap.prepare(SpeakerTap::copy_speech(&segment(id, id * 2_000, 1_000, 0)));
            let t0 = std::time::Instant::now();
            tap.send(audio);
            assert!(t0.elapsed() < std::time::Duration::from_millis(50));
        }
        assert_eq!((tap.sent(), tap.dropped()), (SEGMENT_CHANNEL_CAP as u64, 10 - SEGMENT_CHANNEL_CAP as u64));
        assert_eq!(link.offered_end_ms.load(Ordering::SeqCst), 9 * 2_000 + 1_000, "đoạn bị bỏ vẫn tính là đã đưa");
        assert_eq!(ends.segments.try_iter().count(), SEGMENT_CHANNEL_CAP);
    }

    /// Client đã tắt (thả đầu kia): luồng VAD thôi chép âm thanh.
    #[test]
    fn a_closed_channel_stops_the_tap() {
        let (link, ends) = SpeakerLink::pair();
        let mut tap = SpeakerTap::new(link.segments, link.offered_end_ms);
        drop(ends);
        tap.send(tap.prepare(SpeakerTap::copy_speech(&segment(0, 0, 1_000, 0))));
        assert!(tap.is_closed());
    }
}
```

Thêm vào `mod tests` của `engine.rs` (cạnh test `by_default_the_vad_view_copies_the_new_samples`):

```rust
    /// Bản mặc định của `read_tagged`: mọi mẫu mới là `System` (nguồn âm thanh máy, test, `latency-bench`).
    #[test]
    fn by_default_every_new_sample_is_tagged_system() {
        let mut source = SampleSource::new(vec![0.1, 0.2, 0.3], 2, Duration::ZERO);
        let (mut out, mut vad, mut tags) = (vec![9.0], Vec::new(), vec![Source::Mic]);
        assert!(source.read_tagged(&mut out, &mut vad, &mut tags, Duration::ZERO).unwrap());
        assert_eq!(tags, [Source::Mic, Source::System, Source::System]);
        assert_eq!(vad.len(), 2);
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib 2>&1 | grep -E "^error" | head -3`
Expected: không tìm thấy `lead_samples`, `SpeakerTap`, `read_tagged`, `speaker_protocol`.

- [ ] **Step 3: Viết mã**

`crates/pipeline/Cargo.toml`, thêm vào `[dependencies]`:

```toml
# Giao thức với speaker-worker (spec 2026-10-26-phan-biet-nguoi-noi §4.2): kiểu dữ liệu và khung, không I/O mạng.
speaker-protocol = { path = "../speaker-protocol" }
```

`crates/pipeline/src/lib.rs`: thêm `pub mod speaker;` (sau `pub mod sentence;`), `pub mod speaker_client;` và `pub mod voices;` (theo thứ tự chữ cái). `voices` tạo ở Task 9, `speaker_client` ở Task 13: ở Task này chỉ thêm `pub mod speaker;`; hai dòng kia thêm ở Task tạo file tương ứng.

`segmenter.rs`: thêm trường cuối vào `pub struct Segment`:

```rust
    /// Số mẫu đệm đứng trước tiếng nói trong `samples` (0 ở phần dư sau cắt cưỡng bức). Phần tiếng nói là
    /// `samples[lead_samples..lead_samples + speech_ms × 16]` (spec 2026-10-26-phan-biet-nguoi-noi §4.2).
    pub lead_samples: usize,
```

trong `emit`, thêm vào literal `Segment { … }`: `lead_samples: pre_roll.iter().map(Vec::len).sum(),` (tính trước khi `samples` mượn `pre_roll` cũng được: `pre_roll` là `&[Vec<f32>]`); trong `Debug for Segment` thêm `.field("lead_samples", &self.lead_samples)`.

`engine.rs`, test `no_partial_is_scheduled_while_a_closed_segment_waits` (dòng ~4917): literal `crate::segmenter::Segment { … }` không có `..`, nên thêm `lead_samples: 0,` sau `samples: vec![0.0; FRAME_SAMPLES],` (không có trường này thì `cargo test -p pipeline` không biên dịch, E0063). `grep -rn "Segment {" crates src-tauri/src` không còn literal `Segment` nào khác (`PendingSegment::from` ở `queue.rs` chỉ đọc trường).

`engine.rs`: thêm `use speaker_protocol::Source;` và phương thức mặc định vào `trait FrameSource` (sau `read_with_vad`):

```rust
    /// Như `read_with_vad`, kèm cờ nguồn cho từng mẫu mới (spec 2026-10-26-phan-biet-nguoi-noi §5.5): `tags` nhận đúng số mẫu
    /// mới của `out`, thẳng hàng theo chỉ số. Luồng VAD chỉ gọi hàm này khi phiên có nhận giọng. Bản mặc định gắn `System` cho
    /// mọi mẫu (nguồn âm thanh máy); nguồn của app (`LiveCapture`) lấy cờ từ bộ trộn.
    fn read_tagged(
        &mut self,
        out: &mut Vec<f32>,
        vad_out: &mut Vec<f32>,
        tags: &mut Vec<Source>,
        timeout: Duration,
    ) -> Result<bool> {
        let from = out.len();
        let more = self.read_with_vad(out, vad_out, timeout)?;
        tags.resize(tags.len() + (out.len() - from), Source::System);
        Ok(more)
    }
```

Phần thân của `crates/pipeline/src/speaker.rs` (phía trên khối test):

```rust
//! Phía pipeline của nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3): kênh giữa luồng VAD, client của `speaker-worker`
//! và luồng phụ đề, cùng phần chạy trên luồng VAD.
//!
//! - [`SpeakerLink`]: đầu của engine. Luồng VAD đưa đoạn vào `segments` (kênh giới hạn [`SEGMENT_CHANNEL_CAP`] đoạn) bằng
//!   `try_send`: đầy thì bỏ đoạn đó, **không bao giờ chờ**. Luồng phụ đề đọc nhãn từ `updates` (kênh giới hạn
//!   [`UPDATE_CHANNEL_CAP`]: worker gửi dồn không làm luồng phụ đề phải xử lý vô hạn). [`LinkEnds`] là đầu kia (client).
//! - [`SpeakerTap`]: chạy trên luồng VAD. Giữ cờ nguồn của các khung gần đây ([`SourceTrack`]); chép tối đa
//!   `MAX_EMBED_SAMPLES` mẫu đầu phần tiếng nói của đoạn (không đệm) trước khi đoạn chuyển vào hàng đợi nhận dạng (chỉ chép),
//!   rồi sau đó mới đổi sang PCM 16 bit, tính nguồn và `try_send`.

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, SyncSender, TrySendError};

use speaker_protocol::{MAX_EMBED_SAMPLES, SegmentAudio, Source, VoiceInfo, pcm_from_f32};

use crate::segmenter::{FRAME_MS, Segment};

/// Kênh giữa luồng VAD và client: 4 đoạn (spec §4.3).
pub const SEGMENT_CHANNEL_CAP: usize = 4;
/// Số khung 32 ms mà [`SourceTrack`] giữ: 32,8 s, dài hơn đoạn dài nhất (28 s, `PipelineConfig::validate`).
pub const TRACK_FRAMES: usize = 1_024;
/// Kênh nhãn từ client tới luồng phụ đề. Worker đúng chỉ gửi vài cập nhật mỗi đoạn (`Assign`, có thể kèm `Voices`, `Merged`);
/// kênh đầy nghĩa là worker gửi dồn (hỏng hay bị chiếm): client coi như worker đã chết (`speaker_client`).
pub const UPDATE_CHANNEL_CAP: usize = 256;

/// Nhãn từ worker, mã giọng đã đổi sang mã của phiên (client cộng phần bù sau mỗi lần chạy lại).
#[derive(Clone, Debug, PartialEq)]
pub enum SpeakerUpdate {
    Assign {
        segment_id: u64,
        voice: Option<u32>,
        confidence: f32,
    },
    Voices(Vec<VoiceInfo>),
    Merged {
        from: u32,
        into: u32,
    },
}

/// Đầu của engine (`Engine::start_with_speaker`).
pub struct SpeakerLink {
    pub segments: SyncSender<SegmentAudio>,
    pub updates: Receiver<SpeakerUpdate>,
    /// `end_ms` của đoạn mới nhất luồng VAD đã đưa, kể cả đoạn bị bỏ vì kênh đầy: client dùng để biết worker có theo kịp không.
    pub offered_end_ms: Arc<AtomicU64>,
    /// Giữ client sống tới khi engine dừng; thả ra thì client tắt worker. `Sync` để `Engine` giữ được tính `Sync`.
    pub keep: Option<Box<dyn Send + Sync>>,
}

/// Đầu của client.
pub struct LinkEnds {
    pub segments: Receiver<SegmentAudio>,
    pub updates: SyncSender<SpeakerUpdate>,
    pub offered_end_ms: Arc<AtomicU64>,
}

impl SpeakerLink {
    /// Hai đầu của một kênh mới (client thật: `speaker_client::start`; test dùng thẳng).
    pub fn pair() -> (SpeakerLink, LinkEnds) {
        let (seg_tx, seg_rx) = mpsc::sync_channel(SEGMENT_CHANNEL_CAP);
        let (upd_tx, upd_rx) = mpsc::sync_channel(UPDATE_CHANNEL_CAP);
        let offered = Arc::new(AtomicU64::new(0));
        (
            SpeakerLink {
                segments: seg_tx,
                updates: upd_rx,
                offered_end_ms: offered.clone(),
                keep: None,
            },
            LinkEnds {
                segments: seg_rx,
                updates: upd_tx,
                offered_end_ms: offered,
            },
        )
    }
}

/// Nguồn chiếm đa số; hòa thì theo thứ tự `System`, `Mic`, `Mixed` (tất định). Rỗng thì `System`.
pub fn majority(tags: impl Iterator<Item = Source>) -> Source {
    let mut count = [0usize; 3];
    for t in tags {
        count[t as usize] += 1;
    }
    let best = (1..3).fold(0, |best, i| if count[i] > count[best] { i } else { best });
    [Source::System, Source::Mic, Source::Mixed][best]
}

/// Cờ nguồn của các khung 32 ms gần đây, theo số thứ tự khung từ đầu phiên.
#[derive(Default)]
pub struct SourceTrack {
    first: u64,
    tags: VecDeque<Source>,
}

impl SourceTrack {
    /// Cờ của khung `frame`. Khung phải liền sau khung trước; không thì bắt đầu lại từ khung này.
    pub fn push(&mut self, frame: u64, tag: Source) {
        if self.tags.is_empty() || frame != self.first + self.tags.len() as u64 {
            self.tags.clear();
            self.first = frame;
        }
        self.tags.push_back(tag);
        if self.tags.len() > TRACK_FRAMES {
            self.tags.pop_front();
            self.first += 1;
        }
    }

    /// Nguồn chiếm đa số các khung trong `[start_ms, end_ms)`; khung đã quên thì bỏ qua.
    pub fn majority_between(&self, start_ms: u64, end_ms: u64) -> Source {
        let (from, to) = (start_ms / FRAME_MS, end_ms.div_ceil(FRAME_MS));
        majority(
            (from.max(self.first)..to.min(self.first + self.tags.len() as u64))
                .map(|f| self.tags[(f - self.first) as usize]),
        )
    }
}

/// Phần tiếng nói của một đoạn, chép ra trước khi đoạn chuyển vào hàng đợi nhận dạng ([`SpeakerTap::copy_speech`]).
pub struct SpeechCopy {
    pub segment_id: u64,
    pub start_ms: u64,
    pub end_ms: u64,
    pub samples: Vec<f32>,
}

/// Phần nhận giọng của luồng VAD.
pub struct SpeakerTap {
    tx: SyncSender<SegmentAudio>,
    offered_end_ms: Arc<AtomicU64>,
    track: SourceTrack,
    sent: u64,
    dropped: u64,
    closed: bool,
}

impl SpeakerTap {
    pub fn new(tx: SyncSender<SegmentAudio>, offered_end_ms: Arc<AtomicU64>) -> Self {
        Self {
            tx,
            offered_end_ms,
            track: SourceTrack::default(),
            sent: 0,
            dropped: 0,
            closed: false,
        }
    }

    /// Cờ của các mẫu một khung VAD (số thứ tự `frame` từ 0, như `Segmenter`).
    pub fn push_frame(&mut self, frame: u64, tags: &[Source]) {
        self.track.push(frame, majority(tags.iter().copied()));
    }

    /// Chép tối đa `MAX_EMBED_SAMPLES` mẫu đầu phần tiếng nói (bỏ đệm). Chỉ chép (≤ 256 KB): gọi ngay trước khi đoạn chuyển vào
    /// hàng đợi nhận dạng, phần còn lại ([`SpeakerTap::prepare`]) làm sau khi đẩy (spec §4.3: đưa vào hàng đợi trước).
    pub fn copy_speech(seg: &Segment) -> SpeechCopy {
        let lead = seg.lead_samples.min(seg.samples.len());
        let speech = (seg.speech_ms as usize * 16).min(seg.samples.len() - lead);
        SpeechCopy {
            segment_id: seg.id,
            start_ms: seg.start_ms,
            end_ms: seg.end_ms,
            samples: seg.samples[lead..lead + speech.min(MAX_EMBED_SAMPLES)].to_vec(),
        }
    }

    /// Bản gửi worker: PCM 16 bit, thời lượng thật, nguồn đa số của các khung trong đoạn.
    pub fn prepare(&self, copy: SpeechCopy) -> SegmentAudio {
        SegmentAudio {
            segment_id: copy.segment_id,
            start_ms: copy.start_ms,
            end_ms: copy.end_ms,
            source: self.track.majority_between(copy.start_ms, copy.end_ms),
            pcm: pcm_from_f32(&copy.samples),
        }
    }

    /// Đưa đoạn cho client bằng `try_send`: đầy thì bỏ; client đã tắt thì thôi hẳn. Không bao giờ chờ.
    pub fn send(&mut self, audio: SegmentAudio) {
        self.offered_end_ms.fetch_max(audio.end_ms, Ordering::SeqCst);
        match self.tx.try_send(audio) {
            Ok(()) => self.sent += 1,
            Err(TrySendError::Full(_)) => self.dropped += 1,
            Err(TrySendError::Disconnected(_)) => self.closed = true,
        }
    }

    pub fn is_closed(&self) -> bool {
        self.closed
    }

    pub fn sent(&self) -> u64 {
        self.sent
    }

    pub fn dropped(&self) -> u64 {
        self.dropped
    }
}
```

`Source as usize`: `Source` không khai `#[repr]` nhưng là enum không trường, ép kiểu bằng `as` dùng thứ tự khai báo (System 0, Mic 1, Mixed 2), khớp mảng `[System, Mic, Mixed]` trong `majority`.

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 8 test (1 segmenter, 6 speaker, 1 engine).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/pipeline`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 9: `VoiceBook`: giọng từng đoạn và từng phụ đề

**Files:**
- Tạo: `crates/pipeline/src/voices.rs`
- Sửa: `crates/pipeline/src/lib.rs` (thêm `pub mod voices;`)

- [ ] **Step 1: Viết test**

Tạo `voices.rs` chỉ với khối test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_voice_of_segments_is_the_one_with_most_time() {
        let mut b = VoiceBook::default();
        for (seg, ms, voice) in [(0, 1_000, Some(1)), (1, 3_000, Some(2)), (2, 2_500, Some(1)), (3, 9_000, None)] {
            b.queued(seg, ms);
            b.assign(seg, voice);
        }
        assert_eq!(b.voice_of(&[0, 1, 2, 3]), Some(1), "giọng 1: 3,5 s; giọng 2: 3 s; chưa biết thì không tính");
        assert_eq!(b.voice_of(&[0, 1]), Some(2));
        assert_eq!(b.voice_of(&[3]), None);
        // Hòa: giọng của đoạn đứng trước trong danh sách (luồng phụ đề luôn đưa đoạn theo thời gian, nên đó là đoạn sớm hơn).
        b.queued(4, 3_000);
        b.assign(4, Some(3));
        assert_eq!(b.voice_of(&[4, 1]), Some(3));
        assert_eq!(b.voice_of(&[1, 4]), Some(2));
    }

    /// Hàng đợi dịch tồn đọng gộp câu khác giọng (QĐ 12 của kế hoạch 02): phụ đề gộp không nhãn, kể cả khi nhãn tới muộn hay
    /// gộp thêm câu khác.
    #[test]
    fn a_mixed_subtitle_never_gets_a_label() {
        let mut b = VoiceBook::default();
        for (seg, voice) in [(0, Some(1)), (1, Some(2)), (2, None)] {
            b.queued(seg, 1_000);
            b.assign(seg, voice);
        }
        assert_eq!(b.attach(10, &[0]), Some(1));
        assert_eq!(b.attach(11, &[1]), Some(2));
        assert_eq!(b.attach(12, &[2]), None);
        assert_eq!(b.mark_mixed(10), Some((10, None)));
        assert_eq!(b.absorb(10, 11), None);
        assert_eq!(b.assign(2, Some(1)), Some((12, Some(1))), "phụ đề 12 chưa gộp: nhận nhãn như thường");
        assert_eq!(b.absorb(10, 12), None);
        assert_eq!(b.assign(0, Some(3)), None, "phụ đề 10 đã lẫn giọng: không đổi nhãn");
    }

    #[test]
    fn a_late_assign_reports_the_subtitle_whose_voice_changed() {
        let mut b = VoiceBook::default();
        b.queued(0, 2_000);
        b.queued(1, 1_000);
        assert_eq!(b.attach(100, &[0, 1]), None);
        assert_eq!(b.assign(1, Some(4)), Some((100, Some(4))));
        // Đoạn 0 dài hơn, khác giọng: giọng của phụ đề đổi.
        assert_eq!(b.assign(0, Some(5)), Some((100, Some(5))));
        // Không đổi gì: không báo.
        assert_eq!(b.assign(1, Some(4)), None);
        // Đoạn chưa thuộc phụ đề nào: chỉ ghi lại.
        assert_eq!(b.assign(7, Some(1)), None);
    }

    #[test]
    fn an_assign_before_queued_is_kept() {
        let mut b = VoiceBook::default();
        b.assign(0, Some(2));
        b.queued(0, 1_500);
        assert_eq!(b.attach(0, &[0]), Some(2));
    }

    #[test]
    fn absorbing_and_merging_recompute_the_voices() {
        let mut b = VoiceBook::default();
        for (seg, ms, voice) in [(0, 1_000, Some(1)), (1, 4_000, Some(2)), (2, 1_000, Some(3))] {
            b.queued(seg, ms);
            b.assign(seg, voice);
        }
        assert_eq!(b.attach(10, &[0]), Some(1));
        assert_eq!(b.attach(11, &[1]), Some(2));
        assert_eq!(b.attach(12, &[2]), Some(3));
        // Hàng đợi dịch gộp phụ đề 11 vào 10: giọng 2 nhiều thời gian hơn.
        assert_eq!(b.absorb(10, 11), Some(2));
        // Worker gộp giọng 3 vào giọng 1: phụ đề 12 đổi; phụ đề 10 (giọng 2) không đổi.
        assert_eq!(b.merge_voices(3, 1), vec![(12, Some(1))]);
    }

    #[test]
    fn old_segments_are_forgotten() {
        let mut b = VoiceBook::default();
        for seg in 0..(KEEP_SEGMENTS as u64 + 5) {
            b.queued(seg, 1_000);
            b.assign(seg, Some(1));
            b.attach(seg, &[seg]);
        }
        assert_eq!(b.voice_of(&[0]), None, "đoạn 0 đã bị quên");
        assert_eq!(b.voice_of(&[KEEP_SEGMENTS as u64]), Some(1));
        assert!(b.len() <= KEEP_SEGMENTS);
    }
}
```

- [ ] **Step 2: Chạy, thấy lỗi**

Thêm `pub mod voices;` vào `lib.rs` rồi chạy:

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib voices 2>&1 | grep -E "^error" | head -3`
Expected: không tìm thấy `VoiceBook`, `KEEP_SEGMENTS`, `mark_mixed`.

- [ ] **Step 3: Viết phần thân**

```rust
//! Giọng của từng đoạn và từng phụ đề trong luồng phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §4.3–§4.4).
//!
//! Một luật cho mọi chỗ gộp: giọng của một nhóm đoạn là giọng chiếm nhiều thời lượng nhất trong các đoạn đã biết giọng; hòa thì
//! giọng của đoạn đứng trước trong danh sách (luồng phụ đề đưa đoạn theo thời gian, nên đó là đoạn sớm hơn); chưa đoạn nào có
//! giọng thì `None`. Riêng phụ đề mà hàng đợi dịch gộp từ các câu đã biết khác giọng (tồn đọng, QĐ 12 của kế hoạch 02) thì
//! luôn `None` ([`VoiceBook::mark_mixed`]). Dùng cho câu ghép nhiều đoạn, đoạn âm thanh mà hàng đợi nhận dạng
//! gộp, câu mà hàng đợi dịch gộp. Nhãn tới trước hay sau kết quả nhận dạng đều đúng: hàm trả phụ đề nào có giọng đổi để luồng
//! phụ đề phát `subtitle://speaker`.

use std::collections::{BTreeMap, HashMap, HashSet};

/// Giữ tối đa chừng này đoạn gần nhất (phụ đề cũ hơn đã chốt từ lâu).
pub const KEEP_SEGMENTS: usize = 1_024;

#[derive(Clone, Copy, Default)]
struct SegVoice {
    dur_ms: u64,
    voice: Option<u32>,
    sub: Option<u64>,
}

#[derive(Default)]
pub struct VoiceBook {
    segs: BTreeMap<u64, SegVoice>,
    /// Phụ đề (id đã cộng `id_base`) → các đoạn của nó và giọng đang hiện.
    subs: HashMap<u64, (Vec<u64>, Option<u32>)>,
    /// Phụ đề gộp từ các câu đã biết khác giọng: không nhãn.
    mixed: HashSet<u64>,
}

impl VoiceBook {
    /// Đoạn vừa chốt ở VAD, với thời lượng tiếng nói thật.
    pub fn queued(&mut self, seg: u64, dur_ms: u64) {
        self.segs.entry(seg).or_default().dur_ms = dur_ms;
        self.prune();
    }

    /// `Assign` của đoạn `seg`. Trả (phụ đề, giọng mới) khi giọng của phụ đề chứa đoạn đó đổi.
    pub fn assign(&mut self, seg: u64, voice: Option<u32>) -> Option<(u64, Option<u32>)> {
        let entry = self.segs.entry(seg).or_default();
        entry.voice = voice;
        let sub = entry.sub?;
        self.prune();
        self.refresh(sub)
    }

    /// Các đoạn `segs` thuộc phụ đề `sub` (phụ đề mới, hay câu được ghép thêm). Trả giọng của phụ đề.
    pub fn attach(&mut self, sub: u64, segs: &[u64]) -> Option<u32> {
        for &seg in segs {
            self.segs.entry(seg).or_default().sub = Some(sub);
        }
        let entry = self.subs.entry(sub).or_default();
        for &seg in segs {
            if !entry.0.contains(&seg) {
                entry.0.push(seg);
            }
        }
        self.refresh(sub);
        self.subs.get(&sub).and_then(|(_, v)| *v)
    }

    /// Hàng đợi dịch gộp phụ đề `from` vào `into`. Trả giọng của `into`.
    pub fn absorb(&mut self, into: u64, from: u64) -> Option<u32> {
        let segs = self.subs.remove(&from).map(|(s, _)| s).unwrap_or_default();
        if self.mixed.remove(&from) {
            self.mixed.insert(into);
        }
        self.attach(into, &segs)
    }

    /// Hàng đợi dịch gộp vào `sub` các câu đã biết khác giọng: từ giờ phụ đề này không nhãn. Trả `Some` khi giọng đổi.
    pub fn mark_mixed(&mut self, sub: u64) -> Option<(u64, Option<u32>)> {
        self.mixed.insert(sub);
        self.subs.entry(sub).or_default();
        self.refresh(sub)
    }

    /// Worker gộp giọng `from` vào `into`. Trả các phụ đề có giọng đổi.
    pub fn merge_voices(&mut self, from: u32, into: u32) -> Vec<(u64, Option<u32>)> {
        let mut touched: Vec<u64> = Vec::new();
        for s in self.segs.values_mut().filter(|s| s.voice == Some(from)) {
            s.voice = Some(into);
            if let Some(sub) = s.sub
                && !touched.contains(&sub)
            {
                touched.push(sub);
            }
        }
        touched.sort_unstable();
        touched.into_iter().filter_map(|sub| self.refresh(sub)).collect()
    }

    /// Giọng của một nhóm đoạn (xem đầu module).
    pub fn voice_of(&self, segs: &[u64]) -> Option<u32> {
        let mut totals: Vec<(u32, u64)> = Vec::new();
        for s in segs.iter().filter_map(|seg| self.segs.get(seg)) {
            let Some(voice) = s.voice else { continue };
            match totals.iter_mut().find(|(v, _)| *v == voice) {
                Some((_, ms)) => *ms += s.dur_ms,
                None => totals.push((voice, s.dur_ms)),
            }
        }
        // Lần lượt theo thứ tự đoạn: chỉ thay khi nhiều hơn hẳn, nên hòa thì giữ giọng gặp trước.
        let mut best: Option<(u32, u64)> = None;
        for (v, ms) in totals {
            if best.is_none_or(|(_, b)| ms > b) {
                best = Some((v, ms));
            }
        }
        best.map(|(v, _)| v)
    }

    pub fn len(&self) -> usize {
        self.segs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.segs.is_empty()
    }

    /// Tính lại giọng của phụ đề `sub`; trả `Some` khi đổi.
    fn refresh(&mut self, sub: u64) -> Option<(u64, Option<u32>)> {
        let segs = self.subs.get(&sub)?.0.clone();
        let voice = if self.mixed.contains(&sub) { None } else { self.voice_of(&segs) };
        let entry = self.subs.get_mut(&sub)?;
        (entry.1 != voice).then(|| {
            entry.1 = voice;
            (sub, voice)
        })
    }

    fn prune(&mut self) {
        while self.segs.len() > KEEP_SEGMENTS {
            let Some((_, old)) = self.segs.pop_first() else { break };
            let Some(sub) = old.sub else { continue };
            let orphan = self
                .subs
                .get(&sub)
                .is_some_and(|(segs, _)| segs.iter().all(|s| !self.segs.contains_key(s)));
            if orphan {
                self.subs.remove(&sub);
                self.mixed.remove(&sub);
            }
        }
    }
}
```

Lưu ý `attach` trả giọng **sau** `refresh`; `refresh` chỉ báo khi đổi, nên lần đầu gắn phụ đề (giọng `None` → có giọng) cũng được ghi vào `subs` để lần `assign` sau so đúng.

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib voices 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `test result: ok. 6 passed`.

Kiểm tay ca `a_late_assign_reports_the_subtitle_whose_voice_changed` nếu đỏ: `attach(100, &[0, 1])` với hai đoạn chưa có giọng phải để `subs[100] = ([0, 1], None)`; `assign(1, Some(4))` → giọng của [0, 1] là 4 (đoạn 0 chưa biết) → báo `(100, Some(4))`; `assign(0, Some(5))` → 5 có 2 s, 4 có 1 s → `(100, Some(5))`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 10: Ghép câu và hàng đợi dịch biết giọng

**Files:**
- Sửa: `crates/pipeline/src/sentence.rs` (`struct Piece` dòng 13–20, `struct OpenSentence` dòng 37–53, `new`, `accepts`, `push`; helper test `piece` dòng 139–147)
- Sửa: `crates/pipeline/src/queue.rs` (`struct MtItem` dòng 184–205, `struct MtQueue` dòng 215–218, `MtQueue::new` dòng 221–226, `merge_runs` dòng 289–315; thêm `set_voice`, `merges_across_voices`, hàm `mixes_voices`; helper test `item` dòng 395–409)
- Sửa: `crates/pipeline/src/engine.rs` (hai literal `Piece` dòng 1536 và 2035, literal `MtItem` dòng 1695: thêm trường để biên dịch được; logic ở Task 12)
- Sửa: `crates/latency-bench/src/latency.rs` (`piece_of` dòng 532–539)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `sentence.rs`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.4: hai đoạn đều đã biết giọng và khác giọng thì không ghép; chưa biết thì luật cũ.
    #[test]
    fn two_known_different_voices_never_merge() {
        let with = |voice| Piece {
            voice,
            ..piece(2_100, 3_000, "and more")
        };
        let mut open = OpenSentence::new(&piece(0, 2_000, "so we went"), &cfg());
        assert!(open.accepts(&with(Some(2)), 700), "câu chưa biết giọng: luật cũ");
        open.set_voice(Some(1));
        assert!(!open.accepts(&with(Some(2)), 700));
        assert!(open.accepts(&with(Some(1)), 700));
        assert!(open.accepts(&with(None), 700), "đoạn chưa có nhãn: luật cũ");
        open.push(&with(None));
        assert_eq!(open.voice(), Some(1));
    }

    #[test]
    fn a_new_sentence_takes_the_voice_of_its_first_piece() {
        let first = Piece {
            voice: Some(3),
            ..piece(0, 1_000, "hi")
        };
        assert_eq!(OpenSentence::new(&first, &cfg()).voice(), Some(3));
        let mut open = OpenSentence::new(&piece(0, 1_000, "hi"), &cfg());
        open.push(&first);
        assert_eq!(open.voice(), Some(3), "câu chưa có giọng nhận giọng của đoạn ghép thêm");
    }
```

Thêm vào `mod tests` của `queue.rs`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.4: tồn ít (dưới 2 × `mt_max_waiting`), hàng đợi dịch không gộp hai câu đã biết
    /// khác giọng.
    #[test]
    fn sentences_of_different_known_voices_are_not_merged() {
        let voiced = |id, voice| MtItem {
            voice,
            ..item(id, "en", "x.", 0)
        };
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        q.push(voiced(2, Some(2)));
        q.push(voiced(3, Some(1)));
        assert!(q.push(voiced(4, Some(1))).is_empty());
        assert_eq!(q.len(), 4);
        // Chưa biết giọng thì gộp như cũ, và câu gộp lấy giọng đã biết.
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        q.push(voiced(2, None));
        q.push(voiced(3, Some(1)));
        let merged = q.push(voiced(4, None));
        assert_eq!(merged[0].replaces, [2, 3]);
        assert_eq!(merged[0].voice, Some(1));
        assert_eq!(q.merges_across_voices(), 0);
    }

    /// QĐ 12 của kế hoạch 02 (ưu tiên 1: tốc độ hơn đúng tên): tồn ≥ 2 × `mt_max_waiting` (6 câu) thì gộp cả câu khác giọng;
    /// câu gộp lẫn giọng (`mixed`), không nhãn, nhãn tới muộn cũng không gắn lại.
    #[test]
    fn a_long_backlog_merges_different_voices_without_a_label() {
        let voiced = |id: u64, voice| MtItem {
            voice,
            ..item(id, "en", "x.", 0)
        };
        let mut q = MtQueue::new(QueueConfig::default());
        for id in 1..=6 {
            assert!(q.push(voiced(id, Some(id as u32 % 2 + 1))).is_empty(), "tồn {id} câu xen kẽ: chưa gộp");
        }
        assert_eq!(q.len(), 6);
        let merged = q.push(voiced(7, Some(1)));
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].replaces, [2, 3, 4, 5, 6]);
        assert_eq!((merged[0].voice, merged[0].mixed), (None, true));
        assert_eq!(q.len(), 2);
        assert_eq!(q.merges_across_voices(), 5);
        q.set_voice(1, Some(2));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice.is_none() && i.mixed));
        // Câu 7 không lẫn giọng: nhận nhãn như thường.
        q.set_voice(7, Some(2));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice == Some(2)));
    }

    #[test]
    fn a_late_voice_reaches_the_waiting_sentence() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 0));
        q.set_voice(1, Some(5));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice == Some(5)));
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib 2>&1 | grep -E "^error" | head -3`
Expected: `struct Piece has no field named voice`, `no method named set_voice`, `merges_across_voices`.

- [ ] **Step 3: Viết mã**

`sentence.rs`:
- `struct Piece`: thêm trường cuối
  ```rust
      /// Giọng của đoạn (spec 2026-10-26-phan-biet-nguoi-noi §4.4): `Assign` đã nhận tới lúc kết quả nhận dạng của đoạn về;
      /// `None` khi chưa có, khi đó luật cũ áp dụng.
      pub voice: Option<u32>,
  ```
- `struct OpenSentence`: thêm trường `/// Giọng của câu (giọng chiếm nhiều thời lượng nhất trong các đoạn đã biết, do luồng phụ đề tính).` `voice: Option<u32>,`; trong `new` thêm `voice: first.voice,`.
- `accepts`: thêm điều kiện cuối (không nới khi tồn đọng: ghép câu không có hàng chờ; đuổi kịp là việc của hàng đợi dịch, QĐ 12)
  ```rust
              && !matches!((self.voice, next.voice), (Some(a), Some(b)) if a != b)
  ```
- `push`: thêm `self.voice = self.voice.or(next.voice);` cuối hàm.
- Thêm hai phương thức sau `is_closed`:
  ```rust
      pub fn voice(&self) -> Option<u32> {
          self.voice
      }

      /// Luồng phụ đề đặt lại giọng của câu khi nhãn của một đoạn trong câu tới muộn hay giọng bị gộp.
      pub fn set_voice(&mut self, voice: Option<u32>) {
          self.voice = voice;
      }
  ```
- Helper test `piece`: thêm `voice: None,` vào literal.

`queue.rs`:
- `struct MtItem`: thêm hai trường cuối
  ```rust
      /// Giọng của câu (spec 2026-10-26-phan-biet-nguoi-noi §4.4): hai câu đã biết khác giọng chỉ được gộp khi tồn đọng.
      pub voice: Option<u32>,
      /// Câu gộp từ các câu đã biết khác giọng (tồn đọng, QĐ 12 của kế hoạch 02): luôn không nhãn.
      pub mixed: bool,
  ```
- `struct MtQueue`: thêm trường cuối
  ```rust
      /// Số lần `merge_runs` gộp hai câu đã biết khác giọng (tồn đọng).
      merged_across_voices: usize,
  ```
  và trong `MtQueue::new` thêm `merged_across_voices: 0,`.
- Thêm hàm tự do (trước `impl MtQueue`):
  ```rust
  /// Gộp `b` vào `a` có lẫn hai giọng đã biết khác nhau không. Câu đã lẫn giọng coi như khác mọi giọng đã biết.
  fn mixes_voices(a: &MtItem, b: &MtItem) -> bool {
      match (a.voice, b.voice) {
          (Some(x), Some(y)) => x != y,
          (Some(_), None) => b.mixed,
          (None, Some(_)) => a.mixed,
          (None, None) => false,
      }
  }
  ```
- Thay toàn bộ `fn merge_runs` bằng:
  ```rust
      fn merge_runs(&mut self) -> Vec<MtItem> {
          // Tồn đọng nhiều: đuổi kịp quan trọng hơn nhãn (ưu tiên 1; QĐ 12 của kế hoạch 02), nên gộp cả câu khác giọng; câu gộp
          // lẫn giọng thì không nhãn. Tồn ít: không gộp hai câu đã biết khác giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.4).
          let backlog = self.items.len() >= 2 * self.cfg.mt_max_waiting;
          let mut out: VecDeque<MtItem> = VecDeque::new();
          let mut merged_ids = Vec::new();
          for item in self.items.drain(..) {
              let across = out.back().is_some_and(|last| mixes_voices(last, &item));
              match out.back_mut() {
                  Some(last) if !last.open && !item.open && last.lang == item.lang && (backlog || !across) => {
                      if across {
                          self.merged_across_voices += 1;
                      }
                      last.mixed = last.mixed || item.mixed || across;
                      last.voice = if last.mixed { None } else { last.voice.or(item.voice) };
                      last.text = format!("{}{}{}", last.text.trim_end(), joiner(&last.lang), item.text.trim());
                      last.end_ms = item.end_ms;
                      last.speech_ms += item.speech_ms;
                      last.enqueued_ms = last.enqueued_ms.min(item.enqueued_ms);
                      last.replaces.push(item.sub_id);
                      last.replaces.extend(item.replaces);
                      last.version += 1;
                      if !merged_ids.contains(&last.sub_id) {
                          merged_ids.push(last.sub_id);
                      }
                  }
                  _ => out.push_back(item),
              }
          }
          self.items = out;
          self.items
              .iter()
              .filter(|i| merged_ids.contains(&i.sub_id))
              .cloned()
              .collect()
      }
  ```
  (`self.items.drain(..)` và `self.merged_across_voices` là hai trường khác nhau: mượn tách được.)
- Thêm sau `close`:
  ```rust
      /// Nhãn tới muộn cho một câu đang chờ dịch; câu lẫn giọng giữ không nhãn. Trả `false` nếu câu không còn trong hàng.
      pub fn set_voice(&mut self, sub_id: u64, voice: Option<u32>) -> bool {
          match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
              Some(item) => {
                  if !item.mixed {
                      item.voice = voice;
                  }
                  true
              }
              None => false,
          }
      }

      /// Số lần hàng đợi gộp hai câu đã biết khác giọng (tồn đọng) từ đầu phiên.
      pub fn merges_across_voices(&self) -> usize {
          self.merged_across_voices
      }
  ```
- Helper test `item`: thêm `voice: None,` và `mixed: false,`.

`engine.rs` (chỉ để biên dịch; Task 12 thay bằng giọng thật): literal `Piece` ở dòng 1536 và 2035 thêm `voice: None,`; literal `MtItem` trong `enqueue` thêm `voice: None,` và `mixed: false,`.

`latency-bench/src/latency.rs`, `piece_of`: thêm `voice: None,` (S6 cũ không có nhận giọng).

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target cargo test -p latency-bench 2>&1 | grep -E "^test result"`
Expected: `ok` (thêm 5 test); `latency-bench` như mốc.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline -p latency-bench && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 11: `Subtitle.speaker`, `LiveLine.speaker`, sự kiện, số đo

**Files:**
- Sửa: `crates/pipeline/src/subtitle.rs` (`struct Subtitle` dòng 30–45, `struct LiveLine` dòng 57–72; thêm `SpeakerLabel`, `Roster`, `RosterVoice`; test dòng 80–160)
- Sửa: `crates/pipeline/src/engine.rs` (trait `EventSink` dòng 204–222; ba literal `Subtitle` dòng 1545, 1575, 1634; `struct Sink` của test dòng 2493–2538)
- Sửa: `crates/pipeline/src/metrics.rs` (`struct SessionMetrics`, cuối `summary`, test)
- Sửa: `crates/latency-bench/src/session_replay.rs` (literal `Subtitle` dòng 460, `LiveLine` dòng 521)
- Sửa: `src-tauri/src/transcript/export.rs` (dòng 225), `src-tauri/src/transcript/history.rs` (dòng 145, 205), `src-tauri/src/transcript/store.rs` (dòng 118), `src-tauri/src/session.rs` (literal `LiveLine` trong test dòng 1737)

- [ ] **Step 1: Viết test**

Trong `subtitle.rs`, sửa test `serializes_with_the_field_names_of_the_ui`: literal `Subtitle` thêm `speaker: Some(3),` và JSON mong đợi thêm `"speaker": 3`. Sửa test `live_events_serialize_with_snake_case_fields`: literal `LiveLine` thêm `speaker: Some(2),`, JSON thứ nhất thêm `"speaker": 2`, JSON của `LiveLine::default()` thêm `"speaker": null`. Thêm test:

```rust
    /// Sự kiện của nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3, §9): `subtitle://speaker`, `speaker://roster`.
    #[test]
    fn speaker_events_serialize_with_snake_case_fields() {
        assert_eq!(
            serde_json::to_value(SpeakerLabel { id: 7, speaker: Some(2) }).unwrap(),
            serde_json::json!({ "id": 7, "speaker": 2 })
        );
        assert_eq!(
            serde_json::to_value(SpeakerLabel { id: 7, speaker: None }).unwrap(),
            serde_json::json!({ "id": 7, "speaker": null })
        );
        let roster = Roster {
            voices: vec![RosterVoice { id: 1, room: false }, RosterVoice { id: 9, room: true }],
        };
        assert_eq!(
            serde_json::to_value(&roster).unwrap(),
            serde_json::json!({ "voices": [{ "id": 1, "room": false }, { "id": 9, "room": true }] })
        );
    }
```

Trong `metrics.rs`, thêm test:

```rust
    /// Nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3): chỉ ghi khi có nhãn, chỉ có số.
    #[test]
    fn the_summary_reports_speaker_labels_only_when_there_were_some() {
        let m = SessionMetrics {
            speaker_assigns: 10,
            speaker_on_time: 9,
            speaker_late: 1,
            ..Default::default()
        };
        assert!(
            m.summary().ends_with("; nhận giọng: 10 nhãn (9 trước khi có chữ, 1 muộn)"),
            "{}",
            m.summary()
        );
        assert!(!SessionMetrics::default().summary().contains("nhận giọng"));
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib -- subtitle:: metrics:: 2>&1 | grep -E "^error" | head -3`
Expected: `no field speaker`, không tìm thấy `SpeakerLabel`, `speaker_assigns`.

- [ ] **Step 3: Viết mã**

`subtitle.rs`, thêm trường cuối vào `pub struct Subtitle`:

```rust
    /// Mã giọng (spec 2026-10-26-phan-biet-nguoi-noi §9): `None` khi chưa biết hay phiên không có nhận giọng. Tên và màu không
    /// nằm ở đây (kế hoạch 03 tính từ `speaker://roster`).
    pub speaker: Option<u32>,
```

thêm trường cuối vào `pub struct LiveLine`:

```rust
    /// Giọng của câu đang mở mà dòng này nối tiếp (`extends`); lượt nói mới chưa có nhãn cho tới khi đoạn đóng và có `Assign`
    /// (spec 2026-10-26-phan-biet-nguoi-noi §4.4).
    pub speaker: Option<u32>,
```

và thêm sau `struct LiveEnd`:

```rust
/// Giọng của một phụ đề đã phát vừa đổi (`subtitle://speaker`, spec 2026-10-26-phan-biet-nguoi-noi §4.3): nhãn tới muộn, giọng bị
/// gộp. Giao diện đổi nhãn tại chỗ.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct SpeakerLabel {
    pub id: u64,
    pub speaker: Option<u32>,
}

/// Một giọng của phiên (`speaker://roster`). Kế hoạch 03 thêm nhãn, màu, nguồn tên; kế hoạch 04 thêm người tham dự.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct RosterVoice {
    /// Mã giọng; "Người N" lấy N = mã (mã tăng theo thứ tự xuất hiện, không dùng lại, có thể > 8).
    pub id: u32,
    /// Giọng trong phòng (≥ 60% thời lượng từ micro, spec §5.5).
    pub room: bool,
}

/// Bảng giọng của phiên: mọi giọng đã thấy, trừ giọng đã bị gộp.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Roster {
    pub voices: Vec<RosterVoice>,
}
```

`engine.rs`: sửa dòng `use crate::subtitle::…` thành `use crate::subtitle::{Delta, LiveEnd, LiveLine, Roster, SpeakerLabel, Status, Subtitle};` (`RosterVoice` thêm ở Task 12, khi có chỗ dùng) và thêm vào cuối `trait EventSink`:

```rust
    /// Giọng của một phụ đề đã phát vừa đổi (spec 2026-10-26-phan-biet-nguoi-noi §4.3). Mặc định bỏ qua.
    fn speaker(&self, _label: &SpeakerLabel) {}
    /// Bảng giọng của phiên đổi. Mặc định bỏ qua.
    fn roster(&self, _roster: &Roster) {}
```

Ba literal `Subtitle` trong `on_asr` (nhánh cùng ngôn ngữ, câu mới, `Dropped`) thêm `speaker: None,` (Task 12 thay hai chỗ đầu bằng giọng thật). Trong `mod tests`, `struct Sink` thêm hai trường và `impl EventSink for Sink` thêm hai hàm:

```rust
        speakers: Mutex<Vec<SpeakerLabel>>,
        rosters: Mutex<Vec<Roster>>,
```

```rust
        fn speaker(&self, l: &SpeakerLabel) {
            self.trail.lock().unwrap().push(format!("speaker {}", l.id));
            self.speakers.lock().unwrap().push(*l);
        }
        fn roster(&self, r: &Roster) {
            self.rosters.lock().unwrap().push(r.clone());
        }
```

`metrics.rs`, thêm vào cuối `struct SessionMetrics`:

```rust
    /// Nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3): số `Assign` đã nhận; trong đó số tới khi đoạn còn chờ nhận dạng
    /// (phụ đề mang nhãn ngay lần phát đầu) và số tới muộn (phát `subtitle://speaker`).
    pub speaker_assigns: usize,
    pub speaker_on_time: usize,
    pub speaker_late: usize,
    /// Hàng đợi dịch (spec §4.4, QĐ 12 của kế hoạch 02): số câu bị gộp vào câu khác khi hàng đầy, và trong đó số lần gộp hai câu
    /// đã biết khác giọng (chỉ khi tồn đọng). 02b so khi bật và tắt nhận giọng.
    pub mt_merges: usize,
    pub mt_merges_across_voices: usize,
```

và trong `summary`, ngay trước dòng `out` cuối hàm:

```rust
        if self.speaker_assigns > 0 {
            out.push_str(&format!(
                "; nhận giọng: {} nhãn ({} trước khi có chữ, {} muộn)",
                self.speaker_assigns, self.speaker_on_time, self.speaker_late
            ));
        }
```

Các literal còn lại thêm `speaker: None,`: `latency-bench/src/session_replay.rs` (`Subtitle` trong `upsert`, `LiveLine` trong `line`); `src-tauri/src/transcript/export.rs` (`line`), `history.rs` (đọc DB dòng 145: Lịch sử chưa lưu người nói, kế hoạch 03 thêm cột; và helper `line` của test), `store.rs` (helper `sub` của test); `src-tauri/src/session.rs` (test `live_lines_reach_only_the_overlay`).

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline -p latency-bench 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib -- transcript:: session:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: mọi dòng `ok`.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline -p latency-bench -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline -p latency-bench -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 12: Nối nhận giọng vào engine (luồng VAD, luồng phụ đề)

**Files:**
- Sửa: `crates/pipeline/src/engine.rs` (`enum Msg` dòng 287–332; `struct Engine` dòng 489–495; `Engine::start` dòng 500–589; `vad_loop` dòng 712–848; `struct Composer` dòng 1279–1318; `Composer::new` dòng 1321–1377; `run` dòng 1379–1391; `handle` dòng 1415–1499; nhánh `Transcribed` và `Dropped` của `on_asr` dòng 1523–1648; `enqueue` dòng 1693–1734; `emit_live` dòng 2065–2092; test)

- [ ] **Step 1: Viết test**

Trong `mod tests` của `engine.rs`, thêm vào phần `use`:

```rust
    use crate::speaker::{SEGMENT_CHANNEL_CAP, UPDATE_CHANNEL_CAP};
    use speaker_protocol::{MAX_EMBED_SAMPLES, SegmentAudio, VoiceInfo};
    use std::collections::BTreeSet;
```

thêm hai helper vào `impl Harness`:

```rust
        /// Luồng VAD vừa chốt đoạn `id` (tiếng nói `start..end`).
        fn queued(&mut self, id: u64, start_ms: u64, end_ms: u64) -> bool {
            self.feed(Msg::Queued {
                id,
                start_ms,
                end_ms,
                closed_ms: end_ms,
            })
        }

        /// `Assign` của đoạn `seg` từ worker.
        fn voice(&mut self, seg: u64, voice: Option<u32>) -> bool {
            self.feed(Msg::Speaker(SpeakerUpdate::Assign {
                segment_id: seg,
                voice,
                confidence: 0.9,
            }))
        }
```

và các test (luồng phụ đề nạp thẳng tin nhắn, rồi engine đầy đủ):

```rust
    // ---- Nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.3–§4.4). ----

    #[test]
    fn an_assign_that_comes_first_labels_the_first_upsert() {
        let mut h = harness();
        h.queued(0, 0, 2_000);
        h.voice(0, Some(3));
        h.said(0, 0, 2_000, "en", "Hello.");
        assert_eq!(h.last(0).speaker, Some(3));
        assert!(h.sink.speakers.lock().unwrap().is_empty());
        assert_eq!((h.c.metrics.speaker_on_time, h.c.metrics.speaker_late), (1, 0));
    }

    #[test]
    fn a_late_assign_sends_a_speaker_event_and_later_upserts_keep_it() {
        let mut h = harness();
        h.queued(0, 0, 2_000);
        h.said(0, 0, 2_000, "en", "so we went");
        assert_eq!(h.last(0).speaker, None);
        h.voice(0, Some(2));
        assert_eq!(
            *h.sink.speakers.lock().unwrap(),
            [SpeakerLabel {
                id: 0,
                speaker: Some(2)
            }]
        );
        let job = h.job();
        h.finish(&job, done("chúng tôi đi"));
        assert_eq!(h.last(0).speaker, Some(2));
        assert_eq!(h.c.metrics.speaker_late, 1);
    }

    #[test]
    fn two_known_different_voices_are_never_merged_into_one_line() {
        for (second, merges) in [(Some(2), 0), (Some(1), 1), (None, 1)] {
            let mut h = harness();
            h.voice(0, Some(1));
            h.voice(1, second);
            h.said(0, 0, 1_000, "en", "so we went");
            h.said(1, 1_300, 2_500, "en", "to the market");
            assert_eq!(h.c.metrics.merges, merges, "{second:?}");
            assert_eq!(h.last(0).speaker, Some(1));
        }
    }

    #[test]
    fn the_translation_queue_keeps_different_voices_apart() {
        for (voices, merged) in [([1u32, 2, 1, 2], false), ([1, 1, 1, 1], true)] {
            let mut h = harness();
            h.said(0, 0, 500, "en", "Zero.");
            for (i, v) in voices.iter().enumerate() {
                let id = i as u64 + 1;
                h.voice(id, Some(*v));
                h.said(id, id * 1_000, id * 1_000 + 500, "en", "One.");
            }
            let replaced = h.sink.subs.lock().unwrap().iter().any(|s| !s.replaces.is_empty());
            assert_eq!(replaced, merged, "{voices:?}");
        }
    }

    /// QĐ 12 của kế hoạch 02: tồn ≥ 2 × `mt_max_waiting` (6 câu) thì hàng đợi dịch gộp cả câu khác giọng; phụ đề gộp không nhãn.
    #[test]
    fn a_long_translation_backlog_merges_different_voices_without_a_label() {
        let mut h = harness();
        h.said(0, 0, 500, "en", "Zero.");
        for id in 1..=7u64 {
            h.voice(id, Some(id as u32 % 2 + 1));
            h.said(id, id * 1_000, id * 1_000 + 500, "en", "One.");
        }
        let merged = h
            .sink
            .subs
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|s| !s.replaces.is_empty())
            .cloned()
            .expect("có câu gộp");
        assert_eq!((merged.id, merged.speaker), (1, None));
        assert_eq!(merged.replaces, [2, 3, 4, 5, 6]);
        assert_eq!((h.c.metrics.mt_merges, h.c.metrics.mt_merges_across_voices), (5, 5));
        // Nhãn tới muộn cho đoạn của phụ đề gộp: vẫn không nhãn.
        h.voice(1, Some(2));
        assert_eq!(h.last(1).speaker, None);
    }

    /// Worker gửi dồn (QĐ 14 của kế hoạch 02, ưu tiên 1): kênh nhãn có giới hạn, luồng phụ đề lấy tối đa `SPEAKER_DRAIN_MAX` nhãn
    /// mỗi vòng, `Voices` liền nhau chỉ phát bảng giọng một lần; kết quả nhận dạng vẫn ra phụ đề ngay.
    #[test]
    fn a_flood_of_speaker_updates_is_handled_in_bounded_rounds() {
        let mut h = harness();
        let (link, ends) = SpeakerLink::pair();
        h.c.speaker_rx = Some(link.updates);
        let voices = || {
            SpeakerUpdate::Voices(vec![VoiceInfo {
                voice: 1,
                speech_ms: 1_000,
                mic: false,
            }])
        };
        let mut sent = 0;
        while ends.updates.try_send(voices()).is_ok() {
            sent += 1;
        }
        assert_eq!(sent, UPDATE_CHANNEL_CAP, "kênh nhãn có giới hạn");
        h.c.drain_speaker();
        assert_eq!(h.sink.rosters.lock().unwrap().len(), 1, "một bảng giọng mỗi vòng");
        let mut room = 0;
        while ends.updates.try_send(voices()).is_ok() {
            room += 1;
        }
        assert_eq!(room, SPEAKER_DRAIN_MAX, "mỗi vòng chỉ lấy SPEAKER_DRAIN_MAX nhãn");
        h.said(0, 0, 1_000, "en", "Hello.");
        assert_eq!(h.last(0).src_text, "Hello.");
    }

    #[test]
    fn worker_merges_relabel_subtitles_and_the_roster() {
        let mut h = harness();
        let info = |voice, mic| VoiceInfo {
            voice,
            speech_ms: 1_000,
            mic,
        };
        h.feed(Msg::Speaker(SpeakerUpdate::Voices(vec![info(1, false), info(2, true)])));
        assert_eq!(
            h.sink.rosters.lock().unwrap().last().unwrap().voices,
            [RosterVoice { id: 1, room: false }, RosterVoice { id: 2, room: true }]
        );
        h.voice(0, Some(2));
        h.said(0, 0, 2_000, "en", "Hello.");
        h.feed(Msg::Speaker(SpeakerUpdate::Merged { from: 2, into: 1 }));
        assert_eq!(
            h.sink.speakers.lock().unwrap().last(),
            Some(&SpeakerLabel {
                id: 0,
                speaker: Some(1)
            })
        );
        assert_eq!(
            h.sink.rosters.lock().unwrap().last().unwrap().voices,
            [RosterVoice { id: 1, room: false }]
        );
    }

    #[test]
    fn the_live_line_carries_the_voice_of_the_sentence_it_extends() {
        let mut h = live_harness();
        h.voice(0, Some(4));
        h.said(0, 0, 1_000, "en", "so we went");
        h.partial(1, 1_200, 1_800, "en", Some("to the market"));
        let line = h.last_live(1);
        assert_eq!((line.extends, line.speaker), (Some(0), Some(4)));
        // Lượt nói mới, không nối tiếp câu nào: chưa có nhãn.
        h.partial(5, 9_000, 9_600, "en", Some("hello"));
        assert_eq!(h.last_live(5).speaker, None);
    }

    /// Spec §4.3, ưu tiên 1: luồng VAD không bao giờ chờ nhận giọng. Không ai đọc kênh (như client treo): phụ đề ra đủ và không
    /// chậm hơn lượt đối chứng không có nhận giọng; kênh giữ đúng 4 đoạn, phần còn lại bị bỏ.
    ///
    /// Engine chạy trên luồng riêng, test chờ có hạn (10 s, mỗi lượt không nhịp chỉ mất dưới 1 s): ai đổi `try_send` thành `send`
    /// thì luồng VAD chặn ở đoạn thứ 5 và test ĐỎ thay vì treo. Biên 500 ms so với đối chứng: đủ rộng cho máy CI bận, đủ chặt để
    /// bắt mức chậm thêm 50 ms mỗi đoạn (10 đoạn).
    #[test]
    fn a_stuck_speaker_never_slows_the_subtitles() {
        fn run(speaker: Option<SpeakerLink>) -> (Duration, BTreeSet<u64>) {
            let mut samples = Vec::new();
            for _ in 0..10 {
                samples.extend(speech_then_silence(600));
            }
            let sink = Arc::new(Sink::default());
            let (done_tx, done_rx) = mpsc::channel();
            let engine_sink = sink.clone();
            let t0 = Instant::now();
            std::thread::spawn(move || {
                let engine = Engine::start_with_speaker(
                    cfg(),
                    Box::new(SampleSource::new(samples, 1_600, Duration::ZERO)),
                    energy(),
                    Box::new(ConstAsr("Hello.")),
                    quick_mt(),
                    engine_sink,
                    speaker,
                )
                .unwrap();
                engine.join();
                let _ = done_tx.send(());
            });
            done_rx
                .recv_timeout(Duration::from_secs(10))
                .expect("engine không xong trong 10 s: luồng VAD đang chờ kênh nhận giọng?");
            let elapsed = t0.elapsed();
            let ids = sink.subs.lock().unwrap().iter().map(|s| s.id).collect();
            (elapsed, ids)
        }
        let (plain, plain_ids) = run(None);
        let (link, ends) = SpeakerLink::pair();
        let (stuck, stuck_ids) = run(Some(link));
        assert_eq!(plain_ids.len(), 10);
        assert_eq!(stuck_ids, plain_ids);
        assert!(stuck <= plain + Duration::from_millis(500), "kênh kẹt {stuck:?}, đối chứng {plain:?}");
        assert_eq!(ends.segments.try_iter().count(), SEGMENT_CHANNEL_CAP);
    }

    /// QĐ 15 của kế hoạch 02: nguồn ra thiếu cờ (lỗi của một đường trong bộ trộn) thì luồng VAD đệm `System`; âm thanh không dồn
    /// lại, phụ đề vẫn ra đủ.
    #[test]
    fn missing_source_tags_never_stall_the_audio() {
        struct NoTags(SampleSource);
        impl FrameSource for NoTags {
            fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
                self.0.read(out, timeout)
            }
            fn read_tagged(
                &mut self,
                out: &mut Vec<f32>,
                vad_out: &mut Vec<f32>,
                _tags: &mut Vec<Source>,
                timeout: Duration,
            ) -> Result<bool> {
                self.read_with_vad(out, vad_out, timeout)
            }
        }
        let mut samples = Vec::new();
        for _ in 0..3 {
            samples.extend(speech_then_silence(600));
        }
        let (link, ends) = SpeakerLink::pair();
        let sink = Arc::new(Sink::default());
        let engine = Engine::start_with_speaker(
            cfg(),
            Box::new(NoTags(SampleSource::new(samples, 1_600, Duration::ZERO))),
            energy(),
            Box::new(ConstAsr("Hello.")),
            quick_mt(),
            sink.clone(),
            Some(link),
        )
        .unwrap();
        engine.join();
        let ids: BTreeSet<u64> = sink.subs.lock().unwrap().iter().map(|s| s.id).collect();
        assert_eq!(ids.len(), 3);
        let got: Vec<SegmentAudio> = ends.segments.try_iter().collect();
        assert_eq!(got.len(), 3);
        assert!(got.iter().all(|s| s.source == Source::System));
    }

    /// Luồng VAD gửi tối đa 4 s đầu phần tiếng nói (không đệm), thời lượng thật, nguồn đa số của các khung trong đoạn.
    #[test]
    fn the_vad_thread_sends_up_to_four_seconds_of_speech_with_its_source() {
        struct MicOnly(SampleSource);
        impl FrameSource for MicOnly {
            fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
                self.0.read(out, timeout)
            }
            fn read_tagged(
                &mut self,
                out: &mut Vec<f32>,
                vad_out: &mut Vec<f32>,
                tags: &mut Vec<Source>,
                timeout: Duration,
            ) -> Result<bool> {
                let from = out.len();
                let more = self.read_with_vad(out, vad_out, timeout)?;
                tags.resize(tags.len() + (out.len() - from), Source::Mic);
                Ok(more)
            }
        }
        let square = |n: usize| -> Vec<f32> { (0..n).map(|i| if i % 40 < 20 { 0.3 } else { -0.3 }).collect() };
        let mut samples = square(16_000);
        samples.extend(vec![0.0; 16_000]);
        samples.extend(square(16_000 * 6));
        samples.extend(vec![0.0; 16_000]);
        let (link, ends) = SpeakerLink::pair();
        let offered = link.offered_end_ms.clone();
        let engine = Engine::start_with_speaker(
            cfg(),
            Box::new(MicOnly(SampleSource::new(samples, 1_600, Duration::ZERO))),
            energy(),
            Box::new(ConstAsr("Hello.")),
            quick_mt(),
            Arc::new(Sink::default()),
            Some(link),
        )
        .unwrap();
        engine.join();
        let got: Vec<SegmentAudio> = ends.segments.try_iter().collect();
        assert_eq!(got.len(), 2, "{got:?}");
        assert_eq!(got[0].pcm.len() as u64, (got[0].end_ms - got[0].start_ms) * 16);
        assert_eq!(got[1].pcm.len(), MAX_EMBED_SAMPLES);
        assert!(got[1].end_ms - got[1].start_ms >= 5_900);
        assert!(got.iter().all(|s| s.source == Source::Mic));
        assert_eq!(offered.load(Ordering::SeqCst), got[1].end_ms);
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib engine 2>&1 | grep -E "^error" | head -3`
Expected: không có biến thể `Msg::Speaker`, không có `Engine::start_with_speaker`.

- [ ] **Step 3: Viết mã**

**3a. `use`, `Msg`, `Engine`.** Thêm vào đầu `engine.rs`:

```rust
use crate::speaker::{SpeakerLink, SpeakerTap, SpeakerUpdate};
use crate::voices::VoiceBook;
```

(`speaker_protocol::Source` đã thêm ở Task 8.) Thêm `RosterVoice` vào dòng `use crate::subtitle::{…}`. Sửa `use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};` thành `use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, TryRecvError};`. Thêm biến thể cuối vào `enum Msg`:

```rust
    /// Nhãn từ `speaker-worker` (qua client); luồng phụ đề chuyển vào bằng `drain_speaker`.
    Speaker(SpeakerUpdate),
```

Thêm trường cuối vào `pub struct Engine`:

```rust
    /// Giữ client của `speaker-worker` sống tới khi engine dừng (thả ra thì client tắt worker).
    speaker_keep: Option<Box<dyn Send + Sync>>,
```

và hằng (cạnh `CLOCK_EVERY_FRAMES`):

```rust
/// Số nhãn từ worker tối đa luồng phụ đề xử lý mỗi vòng (QĐ 14 của kế hoạch 02): worker gửi dồn không làm phụ đề chậm; phần
/// còn lại để vòng sau (vòng lặp 50 ms, nên vẫn hơn 1 000 nhãn mỗi giây).
const SPEAKER_DRAIN_MAX: usize = 64;
```

**3b. `Engine::start` và `start_with_speaker`.** Đổi tên hàm `start` hiện có thành `start_with_speaker`, thêm tham số cuối `speaker: Option<SpeakerLink>`, sửa chú thích, và thêm `start` mới gọi nó:

```rust
    /// Chạy các luồng của một phiên (không có nhận giọng). Xem [`Engine::start_with_speaker`].
    pub fn start(
        cfg: EngineConfig,
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        sink: Arc<dyn EventSink>,
    ) -> Result<Self> {
        Self::start_with_speaker(cfg, source, vad, asr, mt, sink, None)
    }

    /// Chạy các luồng của một phiên. Luồng VAD (luồng duy nhất tự đọc âm thanh mãi) chạy sau cùng: nếu không tạo được một luồng,
    /// các luồng đã chạy thấy đầu vào của chúng đóng lại và tự kết thúc. `speaker`: đầu engine của kênh tới client
    /// `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.3); `None` thì phiên như trước (không chép âm thanh, không đọc cờ
    /// nguồn).
    pub fn start_with_speaker(
        cfg: EngineConfig,
        source: Box<dyn FrameSource>,
        vad: VadFactory,
        asr: Box<dyn Asr>,
        mt: Box<dyn Mt>,
        sink: Arc<dyn EventSink>,
        speaker: Option<SpeakerLink>,
    ) -> Result<Self> {
        let (tap, updates, speaker_keep) = match speaker {
            Some(link) => (
                Some(SpeakerTap::new(link.segments, link.offered_end_ms)),
                Some(link.updates),
                link.keep,
            ),
            None => (None, None, None),
        };
        // … phần thân cũ của `start`, với ba chỗ sửa dưới đây …
    }
```

Ba chỗ sửa trong phần thân: (1) luồng phụ đề dựng `Composer::new(cfg, sink, jobs_tx, composer_flags, asr_queue).with_speaker(updates).run(rx)`; (2) luồng VAD gọi `vad_loop(source, vad, &vad_pipeline, &queue2, &tx, &*sink, &now_ms, &stop, &streaming, tap)`; (3) giá trị trả về thêm `speaker_keep,` vào `Ok(Self { flags, vad: Some(vad_thread), workers: vec![asr_thread, mt_thread], composer: Some(composer), speaker_keep })`.

**3c. Luồng VAD.** Thay toàn bộ `fn vad_loop` bằng:

```rust
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
    mut speaker: Option<SpeakerTap>,
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
    // `buf`: bản cho whisper (mức âm lượng, `SilenceMonitor`, `Segmenter`); `vad_buf`: bản cho VAD, thẳng hàng theo chỉ số;
    // `tags`: cờ nguồn của từng mẫu của `buf`, chỉ khi có nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
    let (mut buf, mut vad_buf, mut tags, mut frames, mut no_audio) = (Vec::new(), Vec::new(), Vec::new(), 0u64, false);
    let mut level_sum = 0.0f32;
    let mut tags_warned = false;
    'outer: while !stop.load(Ordering::SeqCst) {
        let tagging = speaker.as_ref().is_some_and(|t| !t.is_closed());
        let read = if tagging {
            source.read_tagged(&mut buf, &mut vad_buf, &mut tags, Duration::from_millis(20))
        } else {
            source.read_with_vad(&mut buf, &mut vad_buf, Duration::from_millis(20))
        };
        match read {
            Ok(true) => {}
            Ok(false) => break,
            Err(e) => {
                log::error!("nguồn âm thanh lỗi: {e:#}");
                sink.fatal(Fatal::Audio, &format!("nguồn âm thanh lỗi: {e:#}"));
                break;
            }
        }
        if tagging && tags.len() != buf.len() {
            // Nguồn ra thiếu hay thừa cờ (lỗi của một đường trong bộ trộn): ép thẳng hàng, không bao giờ để âm thanh dồn lại vì
            // tính năng phụ (QĐ 15 của kế hoạch 02).
            if !tags_warned {
                log::warn!("nhận giọng: nguồn âm thanh ra {} cờ cho {} mẫu, đệm System", tags.len(), buf.len());
                tags_warned = true;
            }
            tags.resize(buf.len(), Source::System);
        }
        let mut consumed = 0;
        let ready = buf.len().min(vad_buf.len());
        while ready - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            let vad_frame = &vad_buf[consumed..consumed + FRAME_SAMPLES];
            if tagging && let Some(tap) = speaker.as_mut() {
                tap.push_frame(frames, &tags[consumed..consumed + FRAME_SAMPLES]);
            }
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
            let prob = match vad.prob(vad_frame) {
                Ok(p) => p,
                Err(e) => {
                    log::error!("VAD lỗi: {e:#}");
                    sink.fatal(Fatal::Vad, &format!("VAD lỗi: {e:#}"));
                    break 'outer;
                }
            };
            for seg in segmenter.push(frame, prob) {
                send_segment(seg, now, tx, queue, &mut speaker);
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
        vad_buf.drain(..consumed);
        if tagging {
            tags.drain(..consumed);
        } else {
            tags.clear();
        }
    }
    if let Some(seg) = segmenter.flush() {
        send_segment(seg, frames * FRAME_MS, tx, queue, &mut speaker);
    }
    if let Some(tap) = &speaker {
        log::info!(
            "nhận giọng: luồng VAD gửi {} đoạn, bỏ {} đoạn vì kênh đầy",
            tap.sent(),
            tap.dropped()
        );
    }
    let _ = tx.send(Msg::Clock {
        now_ms: frames * FRAME_MS,
        speech_since: None,
    });
}

/// Đoạn vừa chốt: báo luồng phụ đề, đưa vào hàng đợi nhận dạng như cũ, rồi gửi bản sao (tối đa 4 s tiếng nói) cho nhận giọng bằng
/// `try_send` (spec 2026-10-26-phan-biet-nguoi-noi §4.3: không bao giờ chờ). Đoạn chuyển quyền sở hữu vào hàng đợi nên phần
/// tiếng nói phải chép trước, nhưng chỉ chép (≤ 256 KB); đổi PCM, tính nguồn và gửi làm sau khi đẩy.
fn send_segment(
    seg: crate::segmenter::Segment,
    closed_ms: u64,
    tx: &Sender<Msg>,
    queue: &SharedQueue,
    speaker: &mut Option<SpeakerTap>,
) {
    let _ = tx.send(Msg::Queued {
        id: seg.id,
        start_ms: seg.start_ms,
        end_ms: seg.end_ms,
        closed_ms,
    });
    let copy = speaker
        .as_ref()
        .filter(|t| !t.is_closed())
        .map(|_| SpeakerTap::copy_speech(&seg));
    queue.push(PendingSegment::from(seg));
    if let (Some(tap), Some(copy)) = (speaker.as_mut(), copy) {
        let audio = tap.prepare(copy);
        tap.send(audio);
    }
}
```

(`push_frame(frames, …)` gọi trước `frames += 1`, nên số thứ tự khung bắt đầu từ 0 như `Segmenter`.)

**3d. Composer: trường, `with_speaker`, `run`.** Thêm vào cuối `struct Composer`:

```rust
    /// Giọng từng đoạn và từng phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §4.3–§4.4).
    book: VoiceBook,
    /// Nhãn từ `speaker-worker` (qua client); `None` khi phiên không có nhận giọng hay client đã tắt.
    speaker_rx: Option<Receiver<SpeakerUpdate>>,
    /// Bảng giọng của phiên: mọi giọng đã thấy (kể cả của lần chạy worker trước), trừ giọng đã bị gộp.
    roster: BTreeMap<u32, RosterVoice>,
```

trong `Composer::new` thêm `book: VoiceBook::default(), speaker_rx: None, roster: BTreeMap::new(),` vào literal `Self { … }`. Thêm các phương thức vào `impl Composer` (sau `new`), và thay `run`:

```rust
    fn with_speaker(mut self, updates: Option<Receiver<SpeakerUpdate>>) -> Self {
        self.speaker_rx = updates;
        self
    }

    fn run(mut self, rx: Receiver<Msg>) -> SessionMetrics {
        loop {
            let msg = rx.recv_timeout(Duration::from_millis(50));
            // Nhãn đã tới thì áp trước khi xử lý kết quả nhận dạng, để phụ đề mới mang nhãn ngay lần phát đầu (spec §4.3).
            self.drain_speaker();
            match msg {
                Ok(msg) => self.handle(msg),
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
            if self.step() {
                break;
            }
        }
        self.finish()
    }

    /// Lấy tối đa `SPEAKER_DRAIN_MAX` nhãn đang chờ, không chặn (QĐ 14 của kế hoạch 02: worker gửi dồn không làm phụ đề chậm,
    /// phần còn lại để vòng sau). `Voices` liền nhau chỉ giữ bản cuối; bảng giọng phát một lần mỗi vòng. Client đã tắt thì thôi đọc.
    fn drain_speaker(&mut self) {
        let mut got = Vec::new();
        let mut gone = false;
        if let Some(rx) = &self.speaker_rx {
            while got.len() < SPEAKER_DRAIN_MAX {
                match rx.try_recv() {
                    Ok(update) => got.push(update),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => {
                        gone = true;
                        break;
                    }
                }
            }
        }
        if gone {
            self.speaker_rx = None;
        }
        let mut roster_changed = false;
        let mut updates = got.into_iter().peekable();
        while let Some(update) = updates.next() {
            // `Voices` mang cả bảng giọng của worker: bản sau thay hẳn bản trước.
            if matches!(update, SpeakerUpdate::Voices(_)) && matches!(updates.peek(), Some(SpeakerUpdate::Voices(_))) {
                continue;
            }
            roster_changed |= self.on_speaker(update);
        }
        if roster_changed {
            self.emit_roster();
        }
    }
```

**3e. `handle`.** Trong nhánh `Msg::Queued { … }` thêm `self.book.queued(id, end_ms.saturating_sub(start_ms));`. Thêm nhánh:

```rust
            Msg::Speaker(update) => {
                if self.on_speaker(update) {
                    self.emit_roster();
                }
            }
```

và các phương thức (đặt sau `on_asr`):

```rust
    /// Nhãn từ worker (spec 2026-10-26-phan-biet-nguoi-noi §4.3). Trả `true` khi bảng giọng đổi (bên gọi phát `speaker://roster`
    /// một lần cho cả loạt).
    fn on_speaker(&mut self, update: SpeakerUpdate) -> bool {
        match update {
            SpeakerUpdate::Assign { segment_id, voice, .. } => {
                self.metrics.speaker_assigns += 1;
                if self.pending.contains_key(&segment_id) {
                    self.metrics.speaker_on_time += 1;
                } else {
                    self.metrics.speaker_late += 1;
                }
                if let Some((sub_id, voice)) = self.book.assign(segment_id, voice) {
                    self.set_speaker(sub_id, voice);
                }
                false
            }
            SpeakerUpdate::Voices(voices) => {
                for v in voices {
                    self.roster.insert(v.voice, RosterVoice { id: v.voice, room: v.mic });
                }
                true
            }
            SpeakerUpdate::Merged { from, into } => {
                self.roster.remove(&from);
                for (sub_id, voice) in self.book.merge_voices(from, into) {
                    self.set_speaker(sub_id, voice);
                }
                true
            }
        }
    }

    /// Giọng của phụ đề `sub_id` vừa đổi: cập nhật trạng thái (các upsert sau mang giọng mới), câu đang mở, câu đang chờ dịch;
    /// phát `subtitle://speaker`; phát lại dòng đang nói nối tiếp phụ đề đó.
    fn set_speaker(&mut self, sub_id: u64, voice: Option<u32>) {
        if let Some(state) = self.subs.get_mut(&sub_id) {
            state.sub.speaker = voice;
        }
        if let Some((open, id)) = self.open.as_mut()
            && *id == sub_id
        {
            open.set_voice(voice);
        }
        self.queue.set_voice(sub_id, voice);
        self.sink.speaker(&SpeakerLabel {
            id: sub_id,
            speaker: voice,
        });
        let lines: Vec<u64> = self
            .lives
            .iter()
            .filter(|(_, l)| l.line.extends == Some(sub_id) || (l.frozen && l.line.id == sub_id))
            .map(|(seg, _)| *seg)
            .collect();
        for seg in lines {
            self.emit_live(seg, false);
        }
    }

    fn emit_roster(&self) {
        self.sink.roster(&Roster {
            voices: self.roster.values().copied().collect(),
        });
    }
```

**3f. `on_asr`.** Trong nhánh `AsrOutcome::Transcribed`, thay đoạn từ `let piece = Piece {` tới hết nhánh (trước `AsrOutcome::Filtered { ids } =>`) bằng:

```rust
                let voice = self.book.voice_of(&ids);
                let piece = Piece {
                    start_ms,
                    end_ms,
                    lang: &lang,
                    text: &text,
                    voice,
                };
                if lang == self.cfg.target.code() {
                    self.finish_open();
                    self.metrics.same_lang += 1;
                    let sub_id = self.cfg.id_base + ids[0];
                    let speaker = self.book.attach(sub_id, &ids);
                    let sub = Subtitle {
                        id: sub_id,
                        start_ms,
                        end_ms,
                        src_lang: lang.clone(),
                        src_text: text.clone(),
                        tgt_text: String::new(),
                        status: Status::SameLang,
                        provisional: false,
                        replaces: Vec::new(),
                        speaker,
                    };
                    self.sink.subtitle(&sub);
                    // Câu đã là ngôn ngữ đích: phụ đề cuối hiện ngay, gỡ dòng đang nói (spec 2026-10-10 §4.5).
                    self.end_lives(&ids);
                    return;
                }
                let window = self.window_ms;
                if let Some((open, sub_id)) = self.open.as_mut().filter(|(o, _)| o.accepts(&piece, window)) {
                    open.push(&piece);
                    let sub_id = *sub_id;
                    // Giọng của câu tính lại trên mọi đoạn của nó (spec 2026-10-26 §4.4).
                    let speaker = self.book.attach(sub_id, &ids);
                    open.set_voice(speaker);
                    let (closed, joined) = (open.is_closed(), open.text().to_string());
                    if let Some(state) = self.subs.get_mut(&sub_id) {
                        state.sub.speaker = speaker;
                    }
                    self.metrics.merges += 1;
                    self.grow(sub_id, &ids, &joined, end_ms, speech_ms, closed);
                    if closed {
                        self.finish_open();
                    }
                } else {
                    self.finish_open();
                    let mut open = OpenSentence::new(&piece, &self.cfg.pipeline.merge);
                    let sub_id = self.cfg.id_base + ids[0];
                    let speaker = self.book.attach(sub_id, &ids);
                    open.set_voice(speaker);
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
                        speaker,
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
                    self.freeze_lives(&ids, sub_id, None);
                    self.enqueue(sub_id, 1, false);
                    if closed {
                        self.remember_previous(&lang, &text);
                    } else {
                        self.open = Some((open, sub_id));
                    }
                }
            }
```

(Literal `Subtitle` của nhánh `Dropped` giữ `speaker: None` từ Task 11.)

**3g. `enqueue`.** Trong literal `MtItem` đổi `voice: None,` (Task 10) thành `voice: state.sub.speaker,`. Thay vòng `for merged in self.queue.push(item) { … }` bằng:

```rust
        for merged in self.queue.push(item) {
            let mut counted = 0;
            let mut speaker = None;
            // Câu gộp lẫn giọng (tồn đọng, QĐ 12 của kế hoạch 02): từ giờ không nhãn.
            if merged.mixed
                && let Some((sub_id, voice)) = self.book.mark_mixed(merged.sub_id)
            {
                self.set_speaker(sub_id, voice);
            }
            for id in &merged.replaces {
                if let Some(absorbed) = self.subs.remove(id) {
                    counted += absorbed.counted_ms;
                    self.metrics.mt_merges += 1;
                }
                speaker = self.book.absorb(merged.sub_id, *id);
                // Dòng đang nói chờ câu bị gộp giờ chờ câu gộp (QĐ5 của kế hoạch 02).
                if let Some(segs) = self.live_waiting.remove(id) {
                    self.live_waiting.entry(merged.sub_id).or_default().extend(segs);
                }
            }
            if let Some(state) = self.subs.get_mut(&merged.sub_id) {
                state.version = merged.version;
                state.speech_ms = merged.speech_ms;
                state.counted_ms += counted;
                state.sub.src_text = merged.text.clone();
                state.sub.end_ms = merged.end_ms;
                state.sub.replaces = merged.replaces.clone();
                state.sub.speaker = if merged.mixed { None } else { speaker.or(state.sub.speaker) };
                self.sink.subtitle(&state.sub);
            }
        }
        self.metrics.mt_merges_across_voices = self.queue.merges_across_voices();
```

**3h. `emit_live`.** Ngay trước `if force || live.emitted.as_ref() != Some(&line) {` thêm:

```rust
        // Giọng của câu mà dòng nối tiếp; dòng đã đóng băng mà không nối tiếp câu nào thì chính nó là phụ đề `line.id`.
        let shown = if live.frozen { line.extends.or(Some(line.id)) } else { line.extends };
        line.speaker = shown.and_then(|id| self.subs.get(&id)).and_then(|s| s.sub.speaker);
```

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: mọi dòng `ok` (thêm 11 test; mọi test cũ của engine, `tests/engine.rs`, `tests/streaming.rs` vẫn đạt vì `Engine::start` giữ nguyên chữ ký).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline -p latency-bench -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && git status --short crates/pipeline`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 13: Client của `speaker-worker`: chạy, giám sát, khởi động lại, quá tải

**Files:**
- Tạo: `crates/pipeline/src/speaker_client.rs`, `crates/pipeline/src/bin/fake_speaker_worker.rs`, `crates/pipeline/tests/speaker_client.rs`
- Sửa: `crates/pipeline/src/lib.rs` (thêm `pub mod speaker_client;`)

- [ ] **Step 1: Viết worker giả**

`crates/pipeline/src/bin/fake_speaker_worker.rs`:

```rust
//! `speaker-worker` giả, chỉ dùng trong test của `pipeline` (`speaker_client`): nói đúng giao thức `speaker-protocol`, không cần
//! model.
//!
//! - `FAKE_SPEAKER_PLAN`: file kịch bản; mỗi lần chạy lấy dòng đầu (rồi bỏ dòng đó), hết dòng thì `ok`. Các lệnh cách nhau bằng
//!   dấu cách: `ok`; `exit_at_start:<mã>`; `version:<n>` (`Ready` báo phiên bản n); `model_bad` (`Ready` báo model hỏng);
//!   `load_delay_ms:<ms>`; `voices:<k>` (đoạn có id `i` vào giọng `i % k + 1`, mặc định 1); `crash_on:<n>` (thoát mã 3, không
//!   trả lời, ở `Segment` thứ n của lần chạy này); `hang_on:<n>` (treo ở `Segment` thứ n); `big_voices` (trả `Voices` 100 giọng
//!   ở `Segment` đầu); `flood_voices:<n>` (trả thêm n khung `Voices` ở `Segment` đầu: worker gửi dồn).
//! - `FAKE_SPEAKER_LOG`: file ghi nối tiếp: `start threads=<RAYON_NUM_THREADS>`, `load model=<tên file> sha=<có|không> theta=<θ>`, `session`,
//!   `segment <id> pcm=<số mẫu> dur=<ms> source=<nguồn>`, `shutdown`.

use speaker_protocol::{PROTOCOL_VERSION, Request, Response, VoiceInfo, read_frame, write_frame};
use std::collections::BTreeSet;
use std::io::{BufReader, BufWriter, Write};
use std::time::Duration;

#[derive(Default)]
struct Plan {
    exit_at_start: Option<i32>,
    version: Option<u32>,
    model_bad: bool,
    load_delay_ms: u64,
    voices: u64,
    crash_on: Option<u64>,
    hang_on: Option<u64>,
    big_voices: bool,
    flood_voices: u64,
}

fn next_plan_line() -> String {
    let Some(path) = std::env::var_os("FAKE_SPEAKER_PLAN") else {
        return "ok".into();
    };
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines = text.lines();
    let first = lines.next().unwrap_or("ok").to_string();
    let rest: Vec<&str> = lines.collect();
    std::fs::write(&path, rest.join("\n")).expect("ghi lại kịch bản");
    first
}

fn parse(line: &str) -> Plan {
    let mut p = Plan {
        voices: 1,
        ..Plan::default()
    };
    for word in line.split_whitespace() {
        let (key, value) = word.split_once(':').unwrap_or((word, ""));
        match key {
            "ok" => {}
            "exit_at_start" => p.exit_at_start = value.parse().ok(),
            "version" => p.version = value.parse().ok(),
            "model_bad" => p.model_bad = true,
            "load_delay_ms" => p.load_delay_ms = value.parse().unwrap_or(0),
            "voices" => p.voices = value.parse::<u64>().unwrap_or(1).max(1),
            "crash_on" => p.crash_on = value.parse().ok(),
            "hang_on" => p.hang_on = value.parse().ok(),
            "big_voices" => p.big_voices = true,
            "flood_voices" => p.flood_voices = value.parse().unwrap_or(0),
            other => panic!("lệnh kịch bản lạ: {other}"),
        }
    }
    p
}

fn log(line: &str) {
    if let Some(path) = std::env::var_os("FAKE_SPEAKER_LOG") {
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
            .expect("mở log");
        writeln!(f, "{line}").expect("ghi log");
    }
}

fn main() {
    let plan = parse(&next_plan_line());
    if let Some(code) = plan.exit_at_start {
        std::process::exit(code);
    }
    log(&format!("start threads={}", std::env::var("RAYON_NUM_THREADS").unwrap_or_default()));
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let (mut segments, mut seen) = (0u64, BTreeSet::new());
    while let Ok(Some(request)) = read_frame::<_, Request>(&mut input) {
        let replies = match request {
            Request::Load {
                model_path,
                model_sha256,
                config,
            } => {
                std::thread::sleep(Duration::from_millis(plan.load_delay_ms));
                let name = std::path::Path::new(&model_path)
                    .file_name()
                    .map(|n| n.to_string_lossy().into_owned())
                    .unwrap_or_default();
                let sha = if model_sha256.is_some() { "có" } else { "không" };
                log(&format!("load model={name} sha={sha} theta={}", config.theta));
                vec![Response::Ready {
                    protocol_version: plan.version.unwrap_or(PROTOCOL_VERSION),
                    model_ok: !plan.model_bad,
                }]
            }
            Request::SessionStart { .. } => {
                log("session");
                Vec::new()
            }
            Request::Segment(s) => {
                segments += 1;
                log(&format!(
                    "segment {} pcm={} dur={} source={:?}",
                    s.segment_id,
                    s.pcm.len(),
                    s.end_ms.saturating_sub(s.start_ms),
                    s.source
                ));
                if plan.crash_on == Some(segments) {
                    std::process::exit(3);
                }
                if plan.hang_on == Some(segments) {
                    loop {
                        std::thread::sleep(Duration::from_secs(3_600));
                    }
                }
                let voice = (s.segment_id % plan.voices) as u32 + 1;
                let mut out = vec![Response::Assign {
                    segment_id: s.segment_id,
                    voice: Some(voice),
                    confidence: 0.9,
                }];
                if plan.big_voices && segments == 1 {
                    out.push(Response::Voices {
                        voices: (1..=100)
                            .map(|voice| VoiceInfo {
                                voice,
                                speech_ms: 1,
                                mic: false,
                            })
                            .collect(),
                    });
                } else if plan.flood_voices > 0 && segments == 1 {
                    let one = VoiceInfo {
                        voice,
                        speech_ms: 1,
                        mic: false,
                    };
                    out.extend((0..plan.flood_voices).map(|_| Response::Voices { voices: vec![one.clone()] }));
                } else if seen.insert(voice) {
                    out.push(Response::Voices {
                        voices: seen
                            .iter()
                            .map(|&voice| VoiceInfo {
                                voice,
                                speech_ms: 1_000,
                                mic: false,
                            })
                            .collect(),
                    });
                }
                out
            }
            Request::Shutdown => {
                log("shutdown");
                break;
            }
        };
        for r in &replies {
            write_frame(&mut output, r).expect("ghi khung");
        }
    }
}
```

- [ ] **Step 2: Viết test tích hợp**

`crates/pipeline/tests/speaker_client.rs`:

```rust
//! Client của `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1–§4.3, §11) với worker giả
//! (`src/bin/fake_speaker_worker.rs`): không cần model.

use pipeline::speaker::{SpeakerLink, SpeakerUpdate, UPDATE_CHANNEL_CAP};
use pipeline::speaker_client::{self, BeforeSpawn, Disabled, SpeakerHandle, SpeakerLaunch};
use speaker_protocol::{SegmentAudio, Source, SpeakerConfig};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{Receiver, TrySendError};
use std::time::{Duration, Instant};

const FAKE: &str = env!("CARGO_BIN_EXE_fake_speaker_worker");

struct Fixture {
    dir: PathBuf,
}

impl Fixture {
    fn new(name: &str, plan: &[&str]) -> Self {
        let dir = std::env::temp_dir().join(format!("speaker-client-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("plan.txt"), plan.join("\n")).unwrap();
        Self { dir }
    }

    fn launch(&self) -> SpeakerLaunch {
        let mut l = SpeakerLaunch::new(
            Path::new(FAKE),
            &self.dir.join("model.onnx"),
            &self.dir.join("worker.log"),
            SpeakerConfig::default(),
        );
        l.backoff = vec![Duration::from_millis(10), Duration::from_millis(20), Duration::from_millis(50)];
        l.ready_timeout = Duration::from_secs(5);
        l.overload_after = Duration::from_secs(2);
        l.shutdown_grace = Duration::from_secs(1);
        l.env = vec![
            ("FAKE_SPEAKER_PLAN".into(), self.dir.join("plan.txt").display().to_string()),
            ("FAKE_SPEAKER_LOG".into(), self.dir.join("events.log").display().to_string()),
        ];
        l.model_sha256 = Some("ab".repeat(32));
        l
    }

    fn events(&self) -> String {
        std::fs::read_to_string(self.dir.join("events.log")).unwrap_or_default()
    }
}

fn allow() -> BeforeSpawn {
    Box::new(|_| Ok(()))
}

fn segment(id: u64, start_ms: u64, end_ms: u64) -> SegmentAudio {
    SegmentAudio {
        segment_id: id,
        start_ms,
        end_ms,
        source: Source::System,
        pcm: vec![100; 16_000],
    }
}

/// Chờ `Assign` của đoạn `id`, bỏ qua cập nhật khác.
fn wait_assign(updates: &Receiver<SpeakerUpdate>, id: u64) -> Option<u32> {
    loop {
        match updates.recv_timeout(Duration::from_secs(5)) {
            Ok(SpeakerUpdate::Assign { segment_id, voice, .. }) if segment_id == id => return voice,
            Ok(_) => continue,
            Err(e) => panic!("không có Assign của đoạn {id}: {e}"),
        }
    }
}

fn wait_until(what: &str, done: impl Fn() -> bool) {
    let t0 = Instant::now();
    while !done() {
        assert!(t0.elapsed() < Duration::from_secs(10), "chờ quá lâu: {what}");
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_disabled(h: &SpeakerHandle) -> Disabled {
    wait_until("client tắt", || h.disabled().is_some());
    h.disabled().unwrap()
}

#[test]
fn labels_come_back_and_the_worker_gets_two_threads() {
    let f = Fixture::new("labels", &["voices:2"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    assert_eq!(wait_assign(&link.updates, 0), Some(1));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    assert_eq!(wait_assign(&link.updates, 1), Some(2));
    let events = f.events();
    for line in [
        "start threads=2",
        "load model=model.onnx sha=có theta=0.35",
        "session",
        "segment 0 pcm=16000 dur=1000 source=System",
    ] {
        assert!(events.contains(line), "{line}: {events}");
    }
    // Thời gian khứ hồi của từng đoạn (gửi `Segment` → nhận `Assign`), cho 02b đo mốc 230 ms khi chạy cùng hai tiến trình phụ.
    wait_until("đo khứ hồi", || handle.round_trip_ms().len() == 2);
    assert!(handle.round_trip_ms().iter().all(|&ms| ms > 0.0 && ms < 5_000.0));
}

/// QĐ 14 của kế hoạch 02: worker gửi dồn cập nhật (hỏng hay bị chiếm). Kênh tới luồng phụ đề có giới hạn; đầy thì client coi
/// worker đã chết và chạy lại; không bao giờ chặn.
#[test]
fn a_worker_flooding_updates_is_treated_as_broken() {
    let f = Fixture::new("flood", &["flood_voices:10000", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2);
    assert!(link.updates.try_iter().count() <= UPDATE_CHANNEL_CAP);
    assert_eq!(handle.disabled(), None);
}

#[test]
fn a_crashed_worker_restarts_and_voice_ids_keep_growing() {
    let f = Fixture::new("restart", &["voices:2 crash_on:2", "voices:2"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    assert_eq!(wait_assign(&link.updates, 0), Some(1));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2 && handle.wait_ready(Duration::ZERO));
    link.segments.send(segment(2, 3_000, 4_000)).unwrap();
    // Lần chạy sau: giọng 1 của worker thành giọng 2 của phiên (cộng mã lớn nhất đã thấy).
    assert_eq!(wait_assign(&link.updates, 2), Some(2));
    assert_eq!(handle.disabled(), None);
}

#[test]
fn three_deaths_turn_speaker_off_for_the_session() {
    let f = Fixture::new("deaths", &["exit_at_start:3", "exit_at_start:3", "exit_at_start:3"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::Deaths(3));
    wait_until("kênh đóng", || {
        matches!(
            link.segments.try_send(segment(9, 0, 1_000)),
            Err(TrySendError::Disconnected(_))
        )
    });
}

#[test]
fn a_bad_model_turns_speaker_off_without_restarting() {
    let f = Fixture::new("model", &["model_bad", "ok"]);
    let (_link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::ModelBad);
    assert_eq!(handle.starts(), 1);
}

#[test]
fn a_protocol_mismatch_turns_speaker_off() {
    let f = Fixture::new("version", &["version:99"]);
    let (_link, handle) = speaker_client::start(f.launch(), allow());
    assert_eq!(wait_disabled(&handle), Disabled::Version(99));
}

#[test]
fn a_refused_binary_never_runs() {
    let f = Fixture::new("refused", &["ok"]);
    let refuse: BeforeSpawn = Box::new(|_| Err("speaker-worker khác bản build sẵn".into()));
    let (_link, handle) = speaker_client::start(f.launch(), refuse);
    assert_eq!(
        wait_disabled(&handle),
        Disabled::Refused("speaker-worker khác bản build sẵn".into())
    );
    assert!(!f.events().contains("start"));
}

#[test]
fn too_many_voices_in_one_frame_count_as_a_broken_worker() {
    let f = Fixture::new("big", &["big_voices", "ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(0, 0, 1_000)).unwrap();
    wait_until("chạy lại", || handle.starts() == 2);
}

/// Worker treo: không bao giờ chặn bên gửi; quá `overload_after` thì tắt tới hết phiên và kill worker.
#[test]
fn a_hung_worker_is_dropped_as_overloaded_and_never_blocks_the_sender() {
    let f = Fixture::new("hang", &["hang_on:1"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    for id in 0..10 {
        let t0 = Instant::now();
        let _ = link.segments.try_send(segment(id, id * 1_000, id * 1_000 + 900));
        assert!(t0.elapsed() < Duration::from_millis(50));
    }
    assert_eq!(wait_disabled(&handle), Disabled::Overload);
    wait_until("worker bị kill", || handle.pid().is_none());
}

#[test]
fn segments_before_ready_are_dropped() {
    let f = Fixture::new("early", &["load_delay_ms:500"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    link.segments.try_send(segment(0, 0, 1_000)).unwrap();
    assert!(handle.wait_ready(Duration::from_secs(5)));
    link.segments.send(segment(1, 1_500, 2_500)).unwrap();
    assert_eq!(wait_assign(&link.updates, 1), Some(1));
    assert!(!f.events().contains("segment 0 "));
}

#[test]
fn dropping_the_link_shuts_the_worker_down() {
    let f = Fixture::new("stop", &["ok"]);
    let (link, handle) = speaker_client::start(f.launch(), allow());
    assert!(handle.wait_ready(Duration::from_secs(5)));
    let pid = handle.pid().unwrap();
    drop::<SpeakerLink>(link);
    wait_until("worker thoát", || {
        f.events().contains("shutdown") && !pipeline::process::live().contains(&pid)
    });
}
```

- [ ] **Step 3: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^error" | head -3`
Expected: `unresolved import pipeline::speaker_client`.

- [ ] **Step 4: Viết `speaker_client.rs`**

Thêm `pub mod speaker_client;` vào `lib.rs`. Tạo `crates/pipeline/src/speaker_client.rs`:

```rust
//! Client của tiến trình phụ `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1–§4.3, §11). Không bao giờ chặn
//! pipeline: luồng VAD chỉ `try_send` vào kênh 4 đoạn của [`SpeakerLink`]; mọi việc với worker nằm trên các luồng riêng.
//!
//! Một luồng giám sát cho cả phiên ("speaker-client"), và cho mỗi lần chạy worker một luồng ghi, một luồng đọc, một luồng chép
//! stderr vào log:
//! - giám sát: chạy worker, chuyển đoạn từ kênh của luồng VAD sang luồng ghi (`try_send`, đầy thì bỏ), theo dõi chết và quá tải,
//!   khởi động lại;
//! - ghi: ghi khung xuống stdin của worker (có thể chặn khi worker chậm; chỉ chặn chính nó);
//! - đọc: đọc khung từ stdout, chuyển `Assign`, `Voices`, `Merged` cho luồng phụ đề bằng `try_send` vào kênh giới hạn
//!   (`UPDATE_CHANNEL_CAP`; đầy nghĩa là worker gửi dồn: coi như worker chết), báo giám sát.
//!
//! Luật:
//! - Kiểm binary và model trước mỗi lần chạy (`before_spawn`: app kiểm SHA-256, §10.2); từ chối thì tắt tới hết phiên. `Load`
//!   mang SHA-256 của model để worker băm lại đúng các byte nó đọc.
//! - Đường dẫn của binary, model, log đổi sang tuyệt đối ngay ở [`SpeakerLaunch::new`]: worker chạy với thư mục làm việc là thư
//!   mục của binary.
//! - `RAYON_NUM_THREADS=2` đặt trong môi trường của worker, không qua giao thức (§4.1).
//! - Chưa `Ready` thì đoạn tới bị bỏ. `Ready { model_ok: false }` hay lệch phiên bản giao thức: tắt tới hết phiên, không thử lại.
//! - Worker chết (thoát, khung hỏng, khung quá giới hạn, gửi dồn): chạy lại sau 1, 2, 5 s; chết lần thứ 3 trong phiên thì tắt
//!   tới hết phiên (nên với `max_deaths` 3 chỉ dùng 1 s và 2 s; QĐ 6 của kế hoạch 02). Mã giọng của lần chạy sau được cộng mã lớn
//!   nhất đã thấy, để "Người N" không trùng.
//! - Ghi thời gian khứ hồi của từng đoạn (gửi `Segment` tới lúc có trả lời) vào [`SpeakerHandle::round_trip_ms`] cho công cụ đo.
//! - Quá tải (§11): còn đoạn chưa có trả lời, hay luồng VAD vừa phải bỏ đoạn, liên tục 30 s (kể cả worker treo): kill worker,
//!   tắt tới hết phiên. Kế hoạch 04 thêm bậc "tạm dừng đọc tên" trước bước này.
//! - Tắt (kể cả khi hết phiên): kênh của luồng VAD đóng, luồng VAD thấy `Disconnected` và thôi chép âm thanh. Phụ đề chạy bình
//!   thường.
//! - Log chỉ có số đếm, mã lỗi, lý do; không có âm thanh hay tên người.

use crate::logfile;
use crate::process;
use crate::speaker::{LinkEnds, SpeakerLink, SpeakerUpdate, UPDATE_CHANNEL_CAP};
use speaker_protocol::{
    MAX_VOICES_ON_WIRE, PROTOCOL_VERSION, Request, Response, SegmentAudio, SpeakerConfig, VoiceInfo, read_frame,
    write_frame,
};
use std::collections::HashMap;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender, SyncSender, TryRecvError, TrySendError};
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Số luồng tính toán của worker (spec §4.1; 1 luồng chỉ 69% đoạn nhúng xong trước 230 ms, `results/toc-do.md`).
pub const WORKER_THREADS: &str = "2";
/// Nhịp của luồng giám sát.
const TICK: Duration = Duration::from_millis(20);

/// Kiểm trước mỗi lần chạy worker (app: SHA-256 của binary và model). `Err` thì không chạy, tắt tới hết phiên.
pub type BeforeSpawn = Box<dyn Fn(&SpeakerLaunch) -> Result<(), String> + Send + Sync>;

/// Cách chạy `speaker-worker` cho một phiên.
#[derive(Clone, Debug)]
pub struct SpeakerLaunch {
    pub exe: PathBuf,
    pub model: PathBuf,
    /// SHA-256 của model mà app đã kiểm, gửi trong `Load` để worker băm lại byte nó đọc. `None`: model của bản dev, không kiểm.
    pub model_sha256: Option<String>,
    /// stderr của worker; mở nối tiếp và xoay vòng (`logfile`).
    pub log: PathBuf,
    pub config: SpeakerConfig,
    /// Chờ `Ready` sau `Load`; quá thì coi như worker chết.
    pub ready_timeout: Duration,
    /// Chờ trước lần chạy lại thứ 1, 2, 3… (lấy phần tử cuối cho các lần sau).
    pub backoff: Vec<Duration>,
    /// Chết chừng này lần trong phiên thì tắt tới hết phiên.
    pub max_deaths: usize,
    /// Chậm hơn thời gian thực liên tục chừng này thì tắt tới hết phiên.
    pub overload_after: Duration,
    /// Chờ worker tự thoát sau `Shutdown` trước khi kill.
    pub shutdown_grace: Duration,
    /// Biến môi trường thêm (test điều khiển worker giả).
    pub env: Vec<(String, String)>,
}

impl SpeakerLaunch {
    /// Đường dẫn tương đối đổi sang tuyệt đối theo thư mục làm việc hiện tại: worker chạy trong thư mục của binary (`command`), nên
    /// đường dẫn tương đối sẽ bị tìm theo thư mục đó (như `absolute` của `latency-bench session`).
    pub fn new(exe: &Path, model: &Path, log: &Path, config: SpeakerConfig) -> Self {
        let absolute = |p: &Path| std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
        Self {
            exe: absolute(exe),
            model: absolute(model),
            model_sha256: None,
            log: absolute(log),
            config,
            ready_timeout: Duration::from_secs(30),
            backoff: vec![Duration::from_secs(1), Duration::from_secs(2), Duration::from_secs(5)],
            max_deaths: 3,
            overload_after: Duration::from_secs(30),
            shutdown_grace: Duration::from_secs(2),
            env: Vec::new(),
        }
    }
}

/// Vì sao nhận giọng tắt tới hết phiên (ghi log; không có tên hay âm thanh).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Disabled {
    Refused(String),
    Spawn(String),
    ModelBad,
    Version(u32),
    Deaths(usize),
    Overload,
}

#[derive(Default)]
struct State {
    ready: bool,
    disabled: Option<Disabled>,
    pid: Option<u32>,
    starts: usize,
    round_ms: Vec<f32>,
}

/// Nhìn trạng thái của client từ ngoài (test, `latency-bench`). App không cần nó.
#[derive(Clone, Default)]
pub struct SpeakerHandle(Arc<(Mutex<State>, Condvar)>);

impl SpeakerHandle {
    fn update(&self, f: impl FnOnce(&mut State)) {
        let (m, cv) = &*self.0;
        f(&mut m.lock().unwrap_or_else(|e| e.into_inner()));
        cv.notify_all();
    }

    fn get<T>(&self, f: impl FnOnce(&State) -> T) -> T {
        f(&self.0.0.lock().unwrap_or_else(|e| e.into_inner()))
    }

    /// Chờ worker sẵn sàng (hay client tắt) tối đa `timeout`; `true` khi đang sẵn sàng.
    pub fn wait_ready(&self, timeout: Duration) -> bool {
        let (m, cv) = &*self.0;
        let guard = m.lock().unwrap_or_else(|e| e.into_inner());
        let (guard, _) = cv
            .wait_timeout_while(guard, timeout, |s| !s.ready && s.disabled.is_none())
            .unwrap_or_else(|e| e.into_inner());
        guard.ready && guard.disabled.is_none()
    }

    pub fn disabled(&self) -> Option<Disabled> {
        self.get(|s| s.disabled.clone())
    }

    pub fn pid(&self) -> Option<u32> {
        self.get(|s| s.pid)
    }

    /// Số lần đã chạy worker trong phiên.
    pub fn starts(&self) -> usize {
        self.get(|s| s.starts)
    }

    /// Thời gian khứ hồi (ms) của từng đoạn đã có trả lời: từ lúc giám sát chuyển `Segment` cho luồng ghi tới lúc luồng đọc nhận
    /// `Assign` hay `Error` của đoạn đó (gồm chờ ghi, nhúng, phân cụm). Cho công cụ đo; app không dùng.
    pub fn round_trip_ms(&self) -> Vec<f32> {
        self.get(|s| s.round_ms.clone())
    }
}

/// Thả ra thì luồng giám sát tắt worker (không chờ ở đây).
struct StopOnDrop(Arc<AtomicBool>);

impl Drop for StopOnDrop {
    fn drop(&mut self) {
        self.0.store(true, Ordering::SeqCst);
    }
}

/// Chạy nhận giọng cho một phiên. Trả ngay (không chờ worker): [`SpeakerLink`] cho `Engine::start_with_speaker` (giữ client sống
/// qua `keep`), [`SpeakerHandle`] để nhìn trạng thái.
pub fn start(launch: SpeakerLaunch, before_spawn: BeforeSpawn) -> (SpeakerLink, SpeakerHandle) {
    let (mut link, ends) = SpeakerLink::pair();
    let stop = Arc::new(AtomicBool::new(false));
    let handle = SpeakerHandle::default();
    let spawned = {
        let (stop, handle) = (stop.clone(), handle.clone());
        std::thread::Builder::new()
            .name("speaker-client".into())
            .spawn(move || supervise(&launch, &before_spawn, ends, &stop, &handle))
    };
    if let Err(e) = spawned {
        // Closure (cùng `ends`) đã bị thả: luồng VAD thấy `Disconnected`.
        log::warn!("nhận giọng: không tạo được luồng client: {e}");
        handle.update(|s| s.disabled = Some(Disabled::Spawn(e.to_string())));
    }
    link.keep = Some(Box::new(StopOnDrop(stop)));
    (link, handle)
}

/// Lệnh chạy worker: thư mục làm việc là thư mục của binary, `RAYON_NUM_THREADS=2`, không tham số.
pub fn command(launch: &SpeakerLaunch) -> Command {
    let mut cmd = Command::new(&launch.exe);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("RAYON_NUM_THREADS", WORKER_THREADS)
        .envs(launch.env.iter().map(|(k, v)| (k, v)));
    if let Some(dir) = launch.exe.parent().filter(|d| !d.as_os_str().is_empty()) {
        cmd.current_dir(dir);
    }
    process::configure(&mut cmd);
    cmd
}

fn supervise(
    launch: &SpeakerLaunch,
    before_spawn: &BeforeSpawn,
    ends: LinkEnds,
    stop: &AtomicBool,
    handle: &SpeakerHandle,
) {
    let LinkEnds {
        segments,
        updates,
        offered_end_ms,
    } = ends;
    let max_voice = Arc::new(AtomicU32::new(0));
    let mut deaths = 0usize;
    let disabled = loop {
        if stop.load(Ordering::SeqCst) {
            break None;
        }
        if let Err(reason) = before_spawn(launch) {
            break Some(Disabled::Refused(reason));
        }
        let offset = max_voice.load(Ordering::SeqCst);
        let mut run = match Run::spawn(launch, updates.clone(), offset, max_voice.clone()) {
            Ok(run) => run,
            Err(e) => break Some(Disabled::Spawn(e)),
        };
        handle.update(|s| {
            s.pid = Some(run.pid);
            s.starts += 1;
        });
        let outcome = run.serve(launch, &segments, &offered_end_ms, stop, handle);
        run.shutdown(launch.shutdown_grace);
        handle.update(|s| {
            s.ready = false;
            s.pid = None;
        });
        match outcome {
            Outcome::Stopped => break None,
            Outcome::Disable(d) => break Some(d),
            Outcome::Died(why) => {
                deaths += 1;
                log::warn!("nhận giọng: speaker-worker chết lần {deaths}: {why}");
                if deaths >= launch.max_deaths {
                    break Some(Disabled::Deaths(deaths));
                }
                let wait = launch
                    .backoff
                    .get(deaths - 1)
                    .or(launch.backoff.last())
                    .copied()
                    .unwrap_or_default();
                if !wait_dropping(&segments, wait, stop) {
                    break None;
                }
            }
        }
    };
    if let Some(d) = disabled {
        log::warn!("nhận giọng: tắt tới hết phiên ({d:?})");
        handle.update(|s| s.disabled = Some(d));
    }
    // `segments` bị thả ở đây: luồng VAD thấy `Disconnected`.
}

/// Chờ `wait`, bỏ mọi đoạn tới trong lúc đó. `false` khi bị dừng hay engine đã đóng kênh.
fn wait_dropping(segments: &Receiver<SegmentAudio>, wait: Duration, stop: &AtomicBool) -> bool {
    let until = Instant::now() + wait;
    loop {
        if stop.load(Ordering::SeqCst) {
            return false;
        }
        let left = until.saturating_duration_since(Instant::now());
        if left.is_zero() {
            return true;
        }
        if let Err(RecvTimeoutError::Disconnected) = segments.recv_timeout(left.min(TICK)) {
            return false;
        }
    }
}

/// Luồng đọc và luồng ghi báo luồng giám sát.
enum Ctl {
    Ready { version: u32, model_ok: bool },
    Answered(u64),
    Gone(String),
}

enum Outcome {
    Stopped,
    Disable(Disabled),
    Died(String),
}

/// Một lần chạy worker.
struct Run {
    child: Arc<Mutex<Child>>,
    pid: u32,
    to_writer: Option<SyncSender<Request>>,
    ctl: Receiver<Ctl>,
    threads: Vec<JoinHandle<()>>,
}

impl Run {
    fn spawn(
        launch: &SpeakerLaunch,
        updates: SyncSender<SpeakerUpdate>,
        offset: u32,
        max_voice: Arc<AtomicU32>,
    ) -> Result<Self, String> {
        let log = logfile::RotatingLog::open(&launch.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|e| format!("không mở được log {}: {e}", launch.log.display()))?;
        let mut cmd = command(launch);
        let mut child =
            process::spawn(&mut cmd, &launch.exe).map_err(|e| format!("không chạy được {}: {e}", launch.exe.display()))?;
        let pid = child.id();
        let stdin = BufWriter::new(child.stdin.take().expect("stdin là pipe"));
        let stdout = BufReader::new(child.stdout.take().expect("stdout là pipe"));
        let (pump, _tail) = logfile::pump(child.stderr.take().expect("stderr là pipe"), log, Vec::new());
        let child = Arc::new(Mutex::new(child));
        let (to_writer, requests) = mpsc::sync_channel::<Request>(2);
        let (ctl_tx, ctl) = mpsc::channel::<Ctl>();
        let writer = {
            let ctl_tx = ctl_tx.clone();
            std::thread::Builder::new()
                .name("speaker-write".into())
                .spawn(move || write_loop(stdin, requests, ctl_tx))
        };
        let reader = std::thread::Builder::new()
            .name("speaker-read".into())
            .spawn(move || read_loop(stdout, updates, ctl_tx, offset, max_voice));
        let (writer, reader) = match (writer, reader) {
            (Ok(w), Ok(r)) => (w, r),
            (w, r) => {
                kill_and_release(&child, pid);
                drop(to_writer);
                for t in [w.ok(), r.ok(), Some(pump)].into_iter().flatten() {
                    let _ = t.join();
                }
                return Err("không tạo được luồng đọc hay ghi của speaker-worker".into());
            }
        };
        let run = Self {
            child,
            pid,
            to_writer: Some(to_writer),
            ctl,
            threads: vec![pump, writer, reader],
        };
        let start = Request::Load {
            model_path: launch.model.display().to_string(),
            model_sha256: launch.model_sha256.clone(),
            config: launch.config.clone(),
        };
        let session = Request::SessionStart {
            unix_ms: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |d| d.as_millis() as u64),
        };
        if let Some(w) = &run.to_writer {
            // Kênh 2 chỗ, luồng ghi chưa nhận gì: hai lần gửi này không chờ.
            let _ = w.try_send(start);
            let _ = w.try_send(session);
        }
        Ok(run)
    }

    fn serve(
        &mut self,
        launch: &SpeakerLaunch,
        segments: &Receiver<SegmentAudio>,
        offered_end_ms: &AtomicU64,
        stop: &AtomicBool,
        handle: &SpeakerHandle,
    ) -> Outcome {
        let started = Instant::now();
        let mut ready = false;
        // Đoạn đã gửi, chưa có trả lời: id → lúc gửi.
        let mut waiting: HashMap<u64, Instant> = HashMap::new();
        let mut received_end = offered_end_ms.load(Ordering::SeqCst);
        let mut behind_since: Option<Instant> = None;
        let (mut sent, mut dropped) = (0u64, 0u64);
        loop {
            if stop.load(Ordering::SeqCst) {
                return Outcome::Stopped;
            }
            loop {
                match self.ctl.try_recv() {
                    Ok(Ctl::Ready { version, .. }) if version != PROTOCOL_VERSION => {
                        return Outcome::Disable(Disabled::Version(version));
                    }
                    Ok(Ctl::Ready { model_ok: false, .. }) => return Outcome::Disable(Disabled::ModelBad),
                    Ok(Ctl::Ready { .. }) => {
                        ready = true;
                        received_end = offered_end_ms.load(Ordering::SeqCst);
                        handle.update(|s| s.ready = true);
                        log::info!("nhận giọng: speaker-worker sẵn sàng sau {} ms", started.elapsed().as_millis());
                    }
                    Ok(Ctl::Answered(id)) => {
                        if let Some(at) = waiting.remove(&id) {
                            let ms = at.elapsed().as_secs_f32() * 1000.0;
                            handle.update(|s| s.round_ms.push(ms));
                        }
                    }
                    Ok(Ctl::Gone(why)) => return Outcome::Died(why),
                    Err(TryRecvError::Empty) => break,
                    Err(TryRecvError::Disconnected) => return Outcome::Died("mất luồng đọc".into()),
                }
            }
            if !ready && started.elapsed() >= launch.ready_timeout {
                return Outcome::Died(format!("không có Ready sau {:?}", launch.ready_timeout));
            }
            match segments.recv_timeout(TICK) {
                Ok(seg) => {
                    received_end = received_end.max(seg.end_ms);
                    if !ready {
                        dropped += 1;
                    } else {
                        let id = seg.segment_id;
                        match self.to_writer.as_ref().map(|w| w.try_send(Request::Segment(seg))) {
                            Some(Ok(())) => {
                                waiting.insert(id, Instant::now());
                                sent += 1;
                            }
                            Some(Err(TrySendError::Full(_))) => dropped += 1,
                            Some(Err(TrySendError::Disconnected(_))) | None => {
                                return Outcome::Died("mất luồng ghi".into());
                            }
                        }
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                // Engine đã dừng: không còn đoạn nào.
                Err(RecvTimeoutError::Disconnected) => return Outcome::Stopped,
            }
            if ready {
                let behind = !waiting.is_empty() || offered_end_ms.load(Ordering::SeqCst) > received_end;
                behind_since = match (behind, behind_since) {
                    (false, _) => None,
                    (true, None) => Some(Instant::now()),
                    (true, since) => since,
                };
                if behind_since.is_some_and(|t| t.elapsed() >= launch.overload_after) {
                    log::warn!(
                        "nhận giọng: speaker-worker chậm hơn thời gian thực {:?} liền ({} đoạn chờ, đã gửi {sent}, bỏ {dropped})",
                        launch.overload_after,
                        waiting.len()
                    );
                    return Outcome::Disable(Disabled::Overload);
                }
            }
        }
    }

    /// Gửi `Shutdown`, chờ worker thoát tối đa `grace` rồi kill; chờ các luồng của lần chạy này kết thúc.
    fn shutdown(mut self, grace: Duration) {
        if let Some(w) = self.to_writer.take() {
            let _ = w.try_send(Request::Shutdown);
        }
        let deadline = Instant::now() + grace;
        let mut exited = false;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.lock().unwrap_or_else(|e| e.into_inner()).try_wait() {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        if exited {
            process::release(self.pid);
        } else {
            kill_and_release(&self.child, self.pid);
        }
        for t in self.threads.drain(..) {
            let _ = t.join();
        }
    }
}

fn kill_and_release(child: &Mutex<Child>, pid: u32) {
    let mut c = child.lock().unwrap_or_else(|e| e.into_inner());
    let _ = c.kill();
    let _ = c.wait();
    process::release(pid);
}

fn write_loop(mut stdin: BufWriter<ChildStdin>, requests: Receiver<Request>, ctl: Sender<Ctl>) {
    for request in requests {
        if let Err(e) = write_frame(&mut stdin, &request) {
            let _ = ctl.send(Ctl::Gone(format!("ghi cho speaker-worker lỗi: {e}")));
            return;
        }
    }
}

fn read_loop(
    mut stdout: BufReader<ChildStdout>,
    updates: SyncSender<SpeakerUpdate>,
    ctl: Sender<Ctl>,
    offset: u32,
    max_voice: Arc<AtomicU32>,
) {
    let map = |v: u32| -> u32 {
        let id = v.saturating_add(offset);
        max_voice.fetch_max(id, Ordering::SeqCst);
        id
    };
    // Kênh tới luồng phụ đề có giới hạn: đầy nghĩa là worker gửi dồn (worker đúng chỉ gửi vài cập nhật mỗi đoạn), coi như worker
    // chết. Engine đã dừng (`Disconnected`) thì bỏ qua như trước. Không bao giờ chặn.
    let forward = |update: SpeakerUpdate| -> bool { !matches!(updates.try_send(update), Err(TrySendError::Full(_))) };
    let flooded = || {
        let _ = ctl.send(Ctl::Gone(format!(
            "speaker-worker gửi cập nhật dồn dập (kênh tới luồng phụ đề đầy {UPDATE_CHANNEL_CAP})"
        )));
    };
    let mut ready = false;
    loop {
        let response = match read_frame::<_, Response>(&mut stdout) {
            Ok(Some(r)) => r,
            Ok(None) => {
                let _ = ctl.send(Ctl::Gone("speaker-worker đóng stdout".into()));
                return;
            }
            Err(e) => {
                let _ = ctl.send(Ctl::Gone(format!("khung từ speaker-worker hỏng: {e}")));
                return;
            }
        };
        match response {
            Response::Ready {
                protocol_version,
                model_ok,
            } => {
                ready = protocol_version == PROTOCOL_VERSION && model_ok;
                let _ = ctl.send(Ctl::Ready {
                    version: protocol_version,
                    model_ok,
                });
            }
            _ if !ready => {
                let _ = ctl.send(Ctl::Gone("khung trước Ready".into()));
                return;
            }
            Response::Assign {
                segment_id,
                voice,
                confidence,
            } => {
                if !forward(SpeakerUpdate::Assign {
                    segment_id,
                    voice: voice.map(map),
                    confidence,
                }) {
                    flooded();
                    return;
                }
                let _ = ctl.send(Ctl::Answered(segment_id));
            }
            Response::Voices { voices } if voices.len() > MAX_VOICES_ON_WIRE => {
                let _ = ctl.send(Ctl::Gone(format!("Voices có {} giọng", voices.len())));
                return;
            }
            Response::Voices { voices } => {
                let voices = voices
                    .into_iter()
                    .map(|v| VoiceInfo {
                        voice: map(v.voice),
                        ..v
                    })
                    .collect();
                if !forward(SpeakerUpdate::Voices(voices)) {
                    flooded();
                    return;
                }
            }
            Response::Merged { from, into } => {
                if !forward(SpeakerUpdate::Merged {
                    from: map(from),
                    into: map(into),
                }) {
                    flooded();
                    return;
                }
            }
            Response::Error { segment_id, kind, .. } => {
                log::warn!("nhận giọng: speaker-worker báo {kind:?} cho đoạn {segment_id:?}");
                if let Some(id) = segment_id {
                    let _ = ctl.send(Ctl::Answered(id));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_worker_gets_two_threads_and_runs_in_its_folder() {
        let launch = SpeakerLaunch::new(
            Path::new("/app/binaries/speaker-worker"),
            Path::new("/m/eres2net.onnx"),
            Path::new("/l/speaker-worker.log"),
            SpeakerConfig::default(),
        );
        let cmd = command(&launch);
        // So với `exe.parent()` để đúng cả trên Windows (`absolute` thêm ổ đĩa).
        assert_eq!(cmd.get_current_dir(), launch.exe.parent());
        assert!(launch.exe.ends_with("app/binaries/speaker-worker"));
        assert_eq!(cmd.get_args().count(), 0, "mọi tham số đi qua `Load`");
        assert!(
            cmd.get_envs()
                .any(|(k, v)| k == "RAYON_NUM_THREADS" && v == Some(std::ffi::OsStr::new("2")))
        );
    }

    /// Worker chạy trong thư mục của binary: đường dẫn tương đối (như `target/release/speaker-worker` của công cụ đo) phải thành
    /// tuyệt đối trước, không thì hệ điều hành tìm theo thư mục mới và không chạy được.
    #[test]
    fn relative_paths_become_absolute_before_the_folder_changes() {
        let launch = SpeakerLaunch::new(
            Path::new("target/release/speaker-worker"),
            Path::new("models/eres2net.onnx"),
            Path::new("speaker-worker.log"),
            SpeakerConfig::default(),
        );
        let cmd = command(&launch);
        assert!(Path::new(cmd.get_program()).is_absolute(), "{:?}", cmd.get_program());
        assert!(cmd.get_current_dir().is_some_and(Path::is_absolute));
        assert!(launch.model.is_absolute() && launch.log.is_absolute());
        assert!(launch.exe.ends_with("target/release/speaker-worker"));
    }
}
```

(Test `too_many_voices_in_one_frame_count_as_a_broken_worker`: lần chạy đầu trả `Voices` 100 giọng nên luồng đọc báo `Gone`, giám sát chạy lại; lần sau `ok`. Test `a_worker_flooding_updates_is_treated_as_broken`: test không đọc `link.updates`, worker giả gửi 10 000 `Voices`; kênh đầy ở cập nhật thứ 257, luồng đọc báo `Gone` và thôi đọc; worker giả kẹt khi ghi stdout nên bị kill sau `shutdown_grace`, giám sát chạy lần hai.)

- [ ] **Step 5: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --test speaker_client 2>&1 | grep -E "^test |^test result" && CARGO_TARGET_DIR=$W/target cargo test -p pipeline --lib speaker_client 2>&1 | grep -E "^test result"`
Expected: 11 test tích hợp `ok`, 2 test đơn vị `ok`. Test treo hay đỏ do thời gian (máy bận): chạy lại một lần với `-- --test-threads=1`; vẫn đỏ thì điều tra (superpowers:systematic-debugging), không nới thời gian chờ trước khi biết nguyên nhân.

- [ ] **Step 6: Mốc kiểm**

Run: `cd $W && cargo fmt -p pipeline && CARGO_TARGET_DIR=$W/target cargo clippy -p pipeline --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target cargo test -p pipeline 2>&1 | grep -E "^test result|FAILED"`
Expected: `Finished`, không cảnh báo; mọi dòng `ok`. Không commit.

---

### Task 14: Cờ nguồn trong nguồn âm thanh của app (`capture.rs`)

**Files:**
- Sửa: `src-tauri/Cargo.toml` (`[dependencies]`)
- Sửa: `src-tauri/src/capture.rs` (`struct Frames` dòng 580–594, `Pre::drain` dòng 604–624, `struct BothPre`/`impl BothPre` dòng 627–720, `impl FrameSource for LiveCapture` dòng 1136–1185; test)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `capture.rs`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §5.5: mỗi mẫu của bản cho whisper có đúng một cờ nguồn. Âm thanh máy đi thẳng là
    /// `System`; micro là `Mic`; micro bị hạ dưới âm thanh máy to là `System`.
    #[test]
    fn every_drained_sample_has_one_source_tag() {
        use speaker_protocol::Source;
        let format = AudioFormat {
            sample_rate: 16_000,
            channels: 1,
        };
        let (mut producer, consumer) = rtrb::RingBuffer::new(16_000);
        let mut pre = Pre::Both(Box::new(BothPre::new(Preprocessor::new(vec![(consumer, format)]).unwrap())));
        for _ in 0..1_600 {
            producer.push(0.25).unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags.iter().all(|&t| t == Source::System));

        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let mut pre = Pre::Mic(Box::new(MicPreprocessor::new(mic_out, format, false).unwrap()));
        for i in 0..8_000 {
            mic_in
                .push(0.1 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                .unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags.iter().all(|&t| t == Source::Mic));

        let (mut pb_in, pb_out) = rtrb::RingBuffer::new(16_000);
        let (mut mic_in, mic_out) = rtrb::RingBuffer::new(16_000);
        let mut both = BothPre::new(Preprocessor::new(vec![(pb_out, format)]).unwrap());
        both.attach_mic(MicPreprocessor::new(mic_out, format, false).unwrap());
        let mut pre = Pre::Both(Box::new(both));
        for i in 0..8_000 {
            pb_in.push(if i % 2 == 0 { 0.1 } else { -0.1 }).unwrap();
            mic_in
                .push(0.1 * (2.0 * std::f32::consts::PI * 300.0 * i as f32 / 16_000.0).sin())
                .unwrap();
        }
        let mut f = Frames::default();
        pre.drain(&mut f, None).unwrap();
        assert_eq!(f.tags.len(), f.asr.len());
        assert!(f.tags[1_600..].iter().all(|&t| t == Source::System));
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^error" | head -3`
Expected: `unresolved import speaker_protocol`, `no field tags`.

- [ ] **Step 3: Viết mã**

`src-tauri/Cargo.toml`, thêm vào `[dependencies]` (cạnh `pipeline`):

```toml
# Giao thức nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.2): cờ nguồn, `SpeakerConfig` của manifest.
speaker-protocol = { path = "../crates/speaker-protocol" }
```

`capture.rs`: thêm `use speaker_protocol::Source;`. `struct Frames` thêm trường cuối:

```rust
    /// Cờ nguồn của từng mẫu của `asr` (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
    tags: Vec<Source>,
```

và `clear` thêm `self.tags.clear();`. `Pre::drain`:

```rust
            Pre::Playback(p) => {
                let from = f.asr.len();
                p.drain(&mut f.asr)?;
                f.vad.extend_from_slice(&f.asr[from..]);
                f.playback.extend_from_slice(&f.asr[from..]);
                f.tags.resize(f.tags.len() + (f.asr.len() - from), Source::System);
                Ok(())
            }
            Pre::Mic(m) => {
                let from = f.asr.len();
                m.drain(&mut f.asr, &mut f.vad)?;
                f.mic.extend_from_slice(&f.asr[from..]);
                f.tags.resize(f.tags.len() + (f.asr.len() - from), Source::Mic);
                Ok(())
            }
```

`struct BothPre` thêm trường `pending_tags: Vec<Source>,` (cạnh `pending_vad`). Thêm hàm tự do ngay trên `impl BothPre`:

```rust
/// Bộ trộn của chế độ âm thanh máy + micro, có cờ nguồn (spec 2026-10-26-phan-biet-nguoi-noi §5.5).
fn tagging_mixer() -> DuckingMixer {
    let mut mixer = DuckingMixer::new(GATE, MAX_SKEW_SAMPLES);
    mixer.set_tagging(true);
    mixer
}
```

Trong `BothPre::new` và `attach_mic`, đổi `DuckingMixer::new(GATE, MAX_SKEW_SAMPLES)` thành `tagging_mixer()`; `new` thêm `pending_tags: Vec::new(),`. `detach_mic` thêm sau `flush_into`: `self.mixer.take_tags(&mut self.pending_tags);`. `BothPre::drain`:
- sau `f.vad.append(&mut self.pending_vad);` thêm `f.tags.append(&mut self.pending_tags);`;
- nhánh chưa có micro: sau `f.vad.extend_from_slice(&self.pb);` thêm `f.tags.resize(f.tags.len() + self.pb.len(), Source::System);`;
- sau khối `if self.last_pb.elapsed() >= self.idle_after { self.mixer.release_mic(…) }` thêm `self.mixer.take_tags(&mut f.tags);`.

`impl FrameSource for LiveCapture`: đổi tên phần thân của `read_with_vad` thành phương thức riêng `read_into` (trong `impl LiveCapture`) có thêm tham số `tags: Option<&mut Vec<Source>>`, và ở cuối, ngay trước `Ok(!self.stop.load(Ordering::SeqCst))`, thêm:

```rust
        if let Some(tags) = tags {
            tags.resize(tags.len() + silence, Source::System);
            tags.extend_from_slice(&self.frames.tags);
        }
```

Rồi trong `impl FrameSource for LiveCapture`:

```rust
    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        self.read_into(out, vad_out, None, timeout)
    }

    fn read_tagged(
        &mut self,
        out: &mut Vec<f32>,
        vad_out: &mut Vec<f32>,
        tags: &mut Vec<Source>,
        timeout: Duration,
    ) -> anyhow::Result<bool> {
        self.read_into(out, vad_out, Some(tags), timeout)
    }
```

(`read` giữ nguyên: nó gọi `read_with_vad`.)

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 1 test; các test cũ của `capture` đạt.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target ./scripts/check-windows.sh 2>&1 | tail -1`
Expected: `Finished` hai lần, không cảnh báo. Không commit.

---

### Task 15: Manifest: khóa gốc `speaker`, `speaker_config`

**Files:**
- Sửa: `src-tauri/src/models/manifest.rs` (chú thích đầu file; `enum Kind` dòng 29–37; `struct Manifest` dòng 122–133; `impl Manifest`; test `check_manifest_body` dòng 620–645; test mới)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` (giữ nguyên hai test của kế hoạch 01):

```rust
    /// Mục `speaker` hợp lệ, `bytes` và `sha256` tùy ý.
    fn speaker_entry(min_app_version: &str) -> Value {
        json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net-sv-en-voxceleb-16k.onnx",
            "url": "files/eres2net-sv-en-voxceleb-16k.onnx", "bytes": 26_496_496, "sha256": "be".repeat(32),
            "license_id": "Apache-2.0", "min_app_version": min_app_version
        })
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.5: model nhúng giọng ở khóa gốc `speaker`, chỉ dùng khi app đủ mới.
    #[test]
    fn the_speaker_entry_is_read_when_valid_and_new_enough() {
        let mut value = sample();
        value["speaker"] = speaker_entry("0.4.0");
        let m = parse(&value).unwrap();
        assert_eq!(m.speaker_model("0.3.1"), None, "app cũ hơn min_app_version");
        let e = m.speaker_model("0.4.0").unwrap();
        assert_eq!((e.id.as_str(), e.kind, e.bytes), ("eres2net-voxceleb", Kind::Speaker, 26_496_496));
        assert!(e.tier.is_empty(), "không thuộc gói nào");
        assert!(m.files_of("standard").iter().all(|f| f.kind != Kind::Speaker));
        assert_eq!(parse(&sample()).unwrap().speaker_model("9.0.0"), None, "manifest không có khóa");
    }

    /// Mục sai chỉ làm mất phần nhận giọng; manifest và các gói vẫn dùng được.
    #[test]
    fn a_bad_speaker_entry_is_ignored_without_breaking_the_manifest() {
        for (field, bad) in [
            ("sha256", json!("xyz")),
            ("file", json!("../thoat.onnx")),
            ("file", json!("SILERO_VAD_V6.2.3.ONNX")),
            ("id", json!("silero-vad")),
            ("bytes", json!(0)),
            ("url", json!("http://khong-an-toan/x.onnx")),
            ("min_app_version", json!("moi")),
        ] {
            let mut value = sample();
            value["speaker"] = speaker_entry("0.1.0");
            value["speaker"][field] = bad;
            let m = parse(&value).unwrap();
            assert_eq!(m.speaker_model("9.0.0"), None, "{field}");
            assert_eq!(m.files_of("standard").len(), 4);
        }
        let mut value = sample();
        value["speaker"] = json!("không phải object");
        assert_eq!(parse(&value).unwrap().speaker_model("9.0.0"), None);
    }

    #[test]
    fn speaker_config_comes_from_the_manifest_when_sane() {
        let with = |config: Value| {
            let mut value = sample();
            value["speaker_config"] = config;
            parse(&value).unwrap().speaker_config()
        };
        assert_eq!(with(json!({ "theta": 0.4 })).theta, 0.4);
        assert_eq!(with(json!({ "theta": 0.4 })).max_voices, 8, "khóa thiếu giữ mặc định");
        assert_eq!(with(json!({ "theta": -1.0 })), SpeakerConfig::default());
        assert_eq!(with(json!({ "theta": "cao" })), SpeakerConfig::default());
        assert_eq!(with(json!({ "min_embed_ms": 100 })), SpeakerConfig::default());
        assert_eq!(parse(&sample()).unwrap().speaker_config(), SpeakerConfig::default());
    }
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib models::manifest 2>&1 | grep -E "^error" | head -3`
Expected: `no variant Kind::Speaker`, `no method speaker_model`.

- [ ] **Step 3: Viết mã**

Chú thích đầu file, thêm gạch đầu dòng sau gạch `pipeline`:

```rust
//! - `speaker`, `speaker_config` (spec 2026-10-26-phan-biet-nguoi-noi §4.5): model nhúng giọng ở khóa gốc (một mục file, không
//!   thuộc gói nào; app ≤ 0.3.1 bỏ qua khóa lạ ở gốc, còn `kind` lạ trong `files` làm nó từ chối cả manifest) và ngưỡng của nhận
//!   giọng. Đọc lỏng: mục sai, hay cần app mới hơn, thì chỉ mất phần nhận giọng ([`Manifest::speaker_model`],
//!   [`Manifest::speaker_config`]).
```

Thêm `use speaker_protocol::SpeakerConfig;` dưới `use pipeline::prompt::PromptFamily;`. `enum Kind` thêm biến thể cuối:

```rust
    /// Model nhúng giọng (khóa gốc `speaker`). Chỉ dùng trong app; không bao giờ đọc từ `files` (`skip`), để manifest có `kind`
    /// này trong `files` vẫn bị từ chối như với app cũ (test `an_unknown_kind_in_files_breaks_this_app`).
    #[serde(skip)]
    Speaker,
```

`struct Manifest` thêm hai trường cuối:

```rust
    /// Mục model nhúng giọng, thô; đọc qua [`Manifest::speaker_model`].
    #[serde(default)]
    pub speaker: Option<serde_json::Value>,
    /// Ngưỡng của nhận giọng, thô; đọc qua [`Manifest::speaker_config`].
    #[serde(default)]
    pub speaker_config: Option<serde_json::Value>,
```

Thêm hằng và kiểu riêng (trên `impl Manifest`):

```rust
/// Model nhúng giọng không lớn hơn chừng này (ERes2Net sau onnxsim: 26,5 MB).
pub const MAX_SPEAKER_BYTES: u64 = 200 << 20;

/// Mục `speaker` của manifest (spec 2026-10-26-phan-biet-nguoi-noi §4.5).
#[derive(Deserialize)]
struct SpeakerEntry {
    id: String,
    version: String,
    file: String,
    url: String,
    bytes: u64,
    sha256: String,
    license_id: String,
    min_app_version: String,
}
```

và trong `impl Manifest`, sau `pipeline_config`:

```rust
    /// Model nhúng giọng cho app bản `app_version`, dạng `FileEntry` (`kind` `Speaker`, không thuộc gói nào) để kho tải và kiểm
    /// như file khác. `None` khi không có khóa, mục sai (ghi log), hay cần app mới hơn.
    pub fn speaker_model(&self, app_version: &str) -> Option<FileEntry> {
        let value = self.speaker.as_ref()?;
        let entry = match self.speaker_entry(value) {
            Ok(entry) => entry,
            Err(field) => {
                log::warn!("manifest: mục `speaker.{field}` không hợp lệ, bỏ qua nhận giọng");
                return None;
            }
        };
        (version(&entry.min_app_version)? <= version(app_version)?).then_some(entry)
    }

    fn speaker_entry(&self, value: &serde_json::Value) -> Result<FileEntry, String> {
        let e: SpeakerEntry = serde_json::from_value(value.clone()).map_err(|_| "json".to_string())?;
        let checks = [
            ("id", is_id(&e.id, 64) && !self.files.iter().any(|f| f.id == e.id)),
            ("version", !e.version.is_empty() && e.version.len() <= 32),
            (
                "file",
                is_safe_file_name(&e.file) && !self.files.iter().any(|f| f.file.eq_ignore_ascii_case(&e.file)),
            ),
            ("url", is_model_url(&e.url)),
            ("bytes", e.bytes > 0 && e.bytes <= MAX_SPEAKER_BYTES),
            ("sha256", is_sha256(&e.sha256)),
            ("license_id", !e.license_id.trim().is_empty() && e.license_id.len() <= 64),
            ("min_app_version", version(&e.min_app_version).is_some()),
        ];
        if let Some((field, _)) = checks.iter().find(|(_, ok)| !ok) {
            return Err((*field).to_string());
        }
        Ok(FileEntry {
            id: e.id,
            tier: Vec::new(),
            kind: Kind::Speaker,
            version: e.version,
            file: e.file,
            url: e.url,
            bytes: e.bytes,
            sha256: e.sha256,
            license_id: e.license_id,
            min_app_version: e.min_app_version,
            prompt: None,
        })
    }

    /// Ngưỡng của nhận giọng: mặc định, đè bằng `speaker_config` nếu đọc được và hợp lệ (`SpeakerConfig::validate`, cùng luật
    /// worker dùng).
    pub fn speaker_config(&self) -> SpeakerConfig {
        let Some(value) = &self.speaker_config else {
            return SpeakerConfig::default();
        };
        match serde_json::from_value::<SpeakerConfig>(value.clone()) {
            Ok(config) => match config.validate() {
                Ok(()) => config,
                Err(field) => {
                    log::warn!("manifest: ngưỡng nhận giọng `{field}` vô lý, dùng mặc định");
                    SpeakerConfig::default()
                }
            },
            Err(e) => {
                log::warn!("manifest: không đọc được speaker_config ({e}), dùng mặc định");
                SpeakerConfig::default()
            }
        }
    }
```

Test chạy tay `check_manifest_body` (dùng trước khi ký manifest), thêm sau `assert!(late.is_empty(), "{late:?}");`:

```rust
        if m.speaker.is_some() {
            assert!(m.speaker_model("999.0.0").is_some(), "mục `speaker` không hợp lệ");
        }
        if let Some(config) = &m.speaker_config {
            let config: speaker_protocol::SpeakerConfig =
                serde_json::from_value(config.clone()).expect("speaker_config đọc được");
            config.validate().expect("speaker_config hợp lệ");
        }
```

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib models::manifest 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, 19 đạt (16 + 3), 1 bỏ qua; hai test của kế hoạch 01 vẫn đạt.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 16: Tải và tìm model nhận giọng (`ModelService`)

**Files:**
- Sửa: `src-tauri/src/models/service.rs` (`impl ModelService`, sau `pipeline_config` dòng 838–843; test)
- Sửa: `src-tauri/src/models/store.rs` (`cleanup` dòng 334–355: giữ phần dở của model nhận giọng)

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `service.rs`:

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.5: model nhận giọng tải vào kho như file khác (kiểm SHA-256), không thuộc gói nào;
    /// đã có thì không tải lại; ngưỡng đọc từ `speaker_config`.
    #[test]
    fn the_speaker_model_is_downloaded_once() {
        let h = harness(|_| {});
        let bytes = 64u64;
        let sha: String = Sha256::digest(content("eres2net-voxceleb", bytes))
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let mut body = real_sample();
        body["speaker"] = json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net.onnx", "url": "files/eres2net.onnx",
            "bytes": bytes, "sha256": sha, "license_id": "Apache-2.0", "min_app_version": "0.1.0"
        });
        body["speaker_config"] = json!({ "theta": 0.4 });
        publish(&h.server, &body);
        h.server.put("files/eres2net.onnx", &content("eres2net-voxceleb", bytes));
        h.call("load_models", json!({})).unwrap();
        let service = h.service();
        assert_eq!(service.speaker_model(), None);
        assert!(service.download_speaker_model(h.app.handle()));
        let (path, got) = service.speaker_model().unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), content("eres2net-voxceleb", bytes));
        assert_eq!(got, sha);
        assert_eq!(service.speaker_config().theta, 0.4);
        let before = h.server.requests().len();
        assert!(service.download_speaker_model(h.app.handle()), "đã có thì không tải lại");
        assert_eq!(h.server.requests().len(), before);
        // Không thuộc gói nào: trạng thái các gói như cũ.
        let view = h.call("get_models_state", json!({})).unwrap();
        assert_eq!(view["packs"][0]["usable"], false);
    }

    #[test]
    fn a_wrong_speaker_model_is_not_installed() {
        let h = harness(|_| {});
        let mut body = real_sample();
        body["speaker"] = json!({
            "id": "eres2net-voxceleb", "version": "1", "file": "eres2net.onnx", "url": "files/eres2net.onnx",
            "bytes": 64, "sha256": "ab".repeat(32), "license_id": "Apache-2.0", "min_app_version": "0.1.0"
        });
        publish(&h.server, &body);
        h.server.put("files/eres2net.onnx", &content("eres2net-voxceleb", 64));
        h.call("load_models", json!({})).unwrap();
        assert!(!h.service().download_speaker_model(h.app.handle()));
        assert_eq!(h.service().speaker_model(), None);
    }
```

(`Sha256` lấy từ `use sha2::Digest;` đã có trong test: đổi thành `use sha2::{Digest, Sha256};` nếu `Sha256` chưa được import.)

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib models::service 2>&1 | grep -E "^error" | head -3`
Expected: `no method named speaker_model`, `download_speaker_model`.

- [ ] **Step 3: Viết mã**

`service.rs`: thêm `use speaker_protocol::SpeakerConfig;` và các phương thức vào `impl ModelService` (sau `pipeline_config`):

```rust
    /// Model nhận giọng đã tải và đúng kích thước (spec 2026-10-26-phan-biet-nguoi-noi §4.5): đường dẫn và SHA-256 theo manifest
    /// (worker chỉ chạy sau khi SHA-256 đầy đủ khớp, `speaker::check_before_spawn`). `None` khi manifest không có mục dùng được
    /// hay file chưa tải.
    pub fn speaker_model(&self) -> Option<(PathBuf, String)> {
        let manifest = self.manifest()?;
        let entry = manifest.manifest.speaker_model(&self.cfg.app_version)?;
        self.store
            .is_installed(&entry)
            .then(|| (self.store.path(&entry.file), entry.sha256.clone()))
    }

    /// Ngưỡng nhận giọng theo manifest (`speaker_config`), sai thì mặc định.
    pub fn speaker_config(&self) -> SpeakerConfig {
        self.manifest()
            .map(|s| s.manifest.speaker_config())
            .unwrap_or_default()
    }

    /// Tải model nhận giọng nếu manifest có mà máy chưa có. Là một việc bảo trì: không chạy cùng lúc với việc tải, xóa hay kiểm
    /// gói (`begin_work`); đang bận thì bỏ, lần bắt đầu phiên sau thử lại. Kế hoạch 02 chưa có giao diện tiến độ. Trả `true` khi
    /// file đã có (sẵn hay vừa tải xong và đúng SHA-256).
    pub fn download_speaker_model<R: Runtime>(&self, app: &AppHandle<R>) -> bool {
        let Some(manifest) = self.manifest() else {
            return false;
        };
        let Some(entry) = manifest.manifest.speaker_model(&self.cfg.app_version) else {
            return false;
        };
        if self.store.is_installed(&entry) {
            return true;
        }
        let Some(url) = self.cfg.source.as_ref().and_then(|u| source::file_url(u, &entry)) else {
            return false;
        };
        let Some(client) = self.client() else {
            return false;
        };
        let work = match self.begin_work(app, Some(&manifest.manifest), |_| false) {
            Ok((work, _)) => work,
            Err(e) => {
                log::info!("chưa tải model nhận giọng: {}", e.message);
                return false;
            }
        };
        if std::fs::create_dir_all(self.store.dir()).is_err() {
            return false;
        }
        let mut job = self.store.job(&entry, url);
        job.keep_part = true;
        let pause = Pause::default();
        let result = download::download(
            client,
            &job,
            &pause,
            &self.cfg.retry,
            &mut |wait| {
                std::thread::sleep(wait);
                true
            },
            &mut |_| {},
        );
        let installed = match result {
            Ok(()) => {
                std::fs::rename(self.store.part(&entry), self.store.path(&entry.file)).is_ok()
                    && self.store.mark_installed(&entry).is_ok()
            }
            Err(e) => {
                log::warn!("không tải được model nhận giọng: {e}");
                false
            }
        };
        drop(work);
        installed
    }

    /// Như [`Self::download_speaker_model`], trên luồng nền.
    pub fn download_speaker_model_in_background<R: Runtime>(self: &Arc<Self>, app: &AppHandle<R>) {
        let (service, app) = (self.clone(), app.clone());
        std::thread::spawn(move || {
            if service.download_speaker_model(&app) {
                log::info!("đã có model nhận giọng");
            }
        });
    }
```

`store.rs`, trong `cleanup`, sau vòng `for entry in &manifest.files { … }` thêm (để phần dở của model nhận giọng không bị dọn giữa hai lần thử):

```rust
        if let Some(entry) = manifest.speaker_model("999.0.0")
            && let Some(name) = self.part(&entry).file_name()
        {
            keep.insert(name.to_string_lossy().into_owned());
        }
```

(`"999.0.0"`: chỉ để lấy mục bất kể `min_app_version`; giữ phần dở không hại gì.)

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib models 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 2 test.

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 17: Kiểm toàn vẹn và module `speaker` của app

**Files:**
- Sửa: `src-tauri/src/sidecar/paths.rs` (hằng `SPEAKER_WORKER`; test `bundled_names_match_the_release_file_names` dòng 136–148)
- Dùng (không sửa): `src-tauri/src/sidecar/integrity.rs` (`verify`, `sha256_file`, `SIDECAR_HASHES`), như `before_spawn` của `asr-worker` (`src-tauri/src/session.rs` dòng ~1113)
- Tạo: `src-tauri/src/speaker/mod.rs`
- Sửa: `src-tauri/src/lib.rs` (thêm `pub mod speaker;` sau `pub mod settings;`)

- [ ] **Step 1: Viết test**

`paths.rs`, trong test `bundled_names_match_the_release_file_names` đổi danh sách thành `["asr-worker", "asr-worker-vulkan", "asr-worker-cpu", "llama-server", SPEAKER_WORKER]`.

Tạo `src-tauri/src/speaker/mod.rs` chỉ với khối test (Step 3 thêm phần thân phía trên):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-speaker-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Kế hoạch 02: bản phát hành không bao giờ bật nhận giọng (CI chạy test này ở bản release, bước "Test … ở bản release").
    #[cfg(not(debug_assertions))]
    #[test]
    fn release_builds_never_enable_speaker() {
        assert!(!enabled());
    }

    #[cfg(debug_assertions)]
    #[test]
    fn the_dev_switch_needs_exactly_true() {
        assert!(switch_on(Some("true")));
        for off in [None, Some("1"), Some("TRUE"), Some("true "), Some("")] {
            assert!(!switch_on(off), "{off:?}");
        }
    }

    #[test]
    fn the_repo_model_is_used_only_by_dev_builds() {
        let dir = temp("dev-model");
        assert_eq!(dev_model(true, &dir), None, "chưa có file");
        std::fs::write(dir.join(DEV_MODEL_FILE), b"onnx").unwrap();
        assert_eq!(dev_model(true, &dir), Some(dir.join(DEV_MODEL_FILE)));
        assert_eq!(dev_model(false, &dir), None, "bản phát hành chỉ dùng kho model");
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Spec §4.1, §10.2: không chạy binary lạ, thư viện lạ cạnh binary, hay model khác bản manifest. Kiểm như `before_spawn` của
    /// `asr-worker` (cả thư mục, trước mỗi lần chạy).
    #[test]
    fn the_binary_and_the_model_are_checked_before_each_run() {
        let dir = temp("check");
        let (exe, model) = (dir.join("speaker-worker"), dir.join("eres2net.onnx"));
        std::fs::write(&exe, b"worker").unwrap();
        std::fs::write(&model, b"model").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            // `integrity::verify` từ chối file nhóm hay người khác ghi được: không phụ thuộc umask của máy chạy test.
            std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let table_owned = [("speaker-worker".to_string(), integrity::sha256_file(&exe).unwrap())];
        let table: Vec<(&str, &str)> = table_owned.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
        let model_sha = integrity::sha256_file(&model).unwrap();
        let launch = SpeakerLaunch::new(&exe, &model, &dir.join("w.log"), speaker_protocol::SpeakerConfig::default());
        let locks = Mutex::new(Vec::new());
        assert_eq!(check_before_spawn(&launch, Some(&model_sha), &table, &locks), Ok(()));
        assert_eq!(check_before_spawn(&launch, None, &table, &locks), Ok(()), "model dev: không kiểm SHA-256");
        let wrong = "00".repeat(32);
        assert!(check_before_spawn(&launch, Some(&wrong), &table, &locks).unwrap_err().contains("khác bản trong manifest"));
        assert!(check_before_spawn(&launch, Some(&model_sha), &[], &locks).unwrap_err().contains("không có trong danh sách"));
        // Thư viện lạ cạnh binary (có thể bị nạp thay thư viện thật): từ chối, như `asr-worker`.
        std::fs::write(dir.join("libggml-la.dylib"), b"x").unwrap();
        assert!(check_before_spawn(&launch, Some(&model_sha), &table, &locks).unwrap_err().contains("libggml-la.dylib"));
        std::fs::remove_file(dir.join("libggml-la.dylib")).unwrap();
        std::fs::write(&exe, b"da sua").unwrap();
        assert!(check_before_spawn(&launch, Some(&model_sha), &table, &locks).unwrap_err().contains("khác bản build sẵn"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 2: Chạy, thấy lỗi**

Thêm `pub mod speaker;` vào `lib.rs` rồi:

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib -- speaker:: sidecar:: 2>&1 | grep -E "^error" | head -3`
Expected: không tìm thấy `SPEAKER_WORKER`, `dev_model`, `check_before_spawn`.

- [ ] **Step 3: Viết mã**

`paths.rs`, sau `pub const TARGET`:

```rust
/// Tên của tiến trình phụ nhận giọng (spec 2026-10-26-phan-biet-nguoi-noi §4.1); file theo quy ước `file_name`.
pub const SPEAKER_WORKER: &str = "speaker-worker";
```

Phần thân của `src-tauri/src/speaker/mod.rs`:

```rust
//! Nhận giọng người nói trong app (spec 2026-10-26-phan-biet-nguoi-noi §4; kế hoạch 02): bật cho phiên nào, tìm `speaker-worker`
//! và model, kiểm SHA-256 trước mỗi lần chạy (§10.2), rồi chạy `pipeline::speaker_client` cho phiên. Phiên không chờ worker.
//!
//! **Kế hoạch 02: tính năng TẮT với người dùng cuối.** Chỉ bản debug bật được, bằng `AI_TRANSLATOR_DEV_SPEAKER=true` trong
//! `.env` (đọc qua `scripts/run-dev-app.sh`, cùng cơ chế `AI_TRANSLATOR_DEV_PRO`, spec 2026-10-04 §2). Mã đọc biến nằm sau
//! `cfg(debug_assertions)`; bản phát hành không có chuỗi tên biến (`release-check.mjs no-dev-gate` chặn). Kế hoạch 03 thay cờ này
//! bằng cài đặt `speakerDiarization` (mặc định bật).

use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use pipeline::speaker::SpeakerLink;
use pipeline::speaker_client::{self, BeforeSpawn, SpeakerLaunch};
use tauri::{AppHandle, Manager, Runtime};

use crate::models::service::ModelService;
use crate::sidecar::{integrity, paths};

/// Biến môi trường của cờ dev: đúng `true` thì bản debug chạy nhận giọng. Chỉ bản debug có biến này.
#[cfg(debug_assertions)]
pub const DEV_SPEAKER_ENV: &str = "AI_TRANSLATOR_DEV_SPEAKER";

/// Tên file model trong thư mục model của bản dev (`MT_MODELS_DIR` hay `<repo>/models`), dùng khi kho chưa có.
pub const DEV_MODEL_FILE: &str = "eres2net-sv-en-voxceleb-16k.onnx";

/// Nhận giọng có bật cho phiên mới không. Bản phát hành: luôn `false` ở kế hoạch 02.
pub fn enabled() -> bool {
    #[cfg(debug_assertions)]
    {
        switch_on(std::env::var(DEV_SPEAKER_ENV).ok().as_deref())
    }
    #[cfg(not(debug_assertions))]
    {
        false
    }
}

/// Chỉ giá trị đúng `true` (phân biệt hoa thường) là bật.
#[cfg(debug_assertions)]
fn switch_on(value: Option<&str>) -> bool {
    value == Some("true")
}

/// Chạy nhận giọng cho phiên vừa bắt đầu nếu bật; không chờ worker. Chưa có model trong kho thì tải nền (bản dev dùng model của
/// thư mục model dev nếu có). Lỗi gì cũng chỉ ghi log: phụ đề chạy như thường.
pub fn start_for_session<R: Runtime>(app: &AppHandle<R>) -> Option<SpeakerLink> {
    if !enabled() {
        return None;
    }
    let models = app.try_state::<Arc<ModelService>>()?.inner().clone();
    let (model, sha256) = match models.speaker_model() {
        Some((path, sha)) => (path, Some(sha)),
        None => {
            models.download_speaker_model_in_background(app);
            match dev_model(tauri::is_dev(), &paths::dev_models_dir()) {
                Some(path) => (path, None),
                None => {
                    log::info!("nhận giọng: chưa có model, phiên này không bật");
                    return None;
                }
            }
        }
    };
    let dir = paths::binaries_dir().ok()?;
    let exe = dir.join(paths::file_name(paths::SPEAKER_WORKER, paths::TARGET, tauri::is_dev(), cfg!(windows)));
    let log = app.path().app_log_dir().ok()?.join("speaker-worker.log");
    let mut launch = SpeakerLaunch::new(&exe, &model, &log, models.speaker_config());
    // Worker băm lại đúng các byte nó đọc (`Load.model_sha256`): file bị thay sau lần kiểm dưới đây cũng bị từ chối.
    launch.model_sha256 = sha256;
    let locks: Arc<Mutex<Vec<File>>> = Arc::default();
    let before_spawn: BeforeSpawn = Box::new(move |launch: &SpeakerLaunch| {
        check_before_spawn(launch, launch.model_sha256.as_deref(), integrity::SIDECAR_HASHES, &locks)
    });
    let (link, _handle) = speaker_client::start(launch, before_spawn);
    log::info!("nhận giọng: bật cho phiên này");
    Some(link)
}

/// Model của thư mục model dev, chỉ ở bản dev.
fn dev_model(dev: bool, dir: &Path) -> Option<PathBuf> {
    let path = dir.join(DEV_MODEL_FILE);
    (dev && path.is_file()).then_some(path)
}

/// Kiểm trước mỗi lần chạy worker (spec §4.1, §10.2), như `before_spawn` của `asr-worker`: cả thư mục của binary bằng
/// [`integrity::verify`] (mọi file trong bảng SHA-256 build sẵn khớp, không để người khác ghi, binary có trong bảng, không có
/// thư viện lạ); model khớp SHA-256 của manifest (`None`: model dev, không kiểm). Windows giữ handle chỉ cho đọc của các file
/// tới lần kiểm sau (`locks`, thay bản cũ).
fn check_before_spawn(
    launch: &SpeakerLaunch,
    model_sha256: Option<&str>,
    table: &[(&str, &str)],
    locks: &Mutex<Vec<File>>,
) -> Result<(), String> {
    let dir = launch.exe.parent().ok_or("speaker-worker không có thư mục")?;
    let verified = integrity::verify(dir, &[launch.exe.as_path()], table).map_err(|e| e.to_string())?;
    if !verified.locks.is_empty() {
        *locks.lock().unwrap_or_else(|e| e.into_inner()) = verified.locks;
    }
    if let Some(expected) = model_sha256 {
        let actual =
            integrity::sha256_file(&launch.model).map_err(|e| format!("không đọc được model nhận giọng: {e}"))?;
        if actual != expected {
            return Err("model nhận giọng khác bản trong manifest".into());
        }
    }
    Ok(())
}
```

(Thông báo lỗi của `IntegrityError` chỉ có tên file, không có đường dẫn: "thiếu …", "… không có trong danh sách build sẵn", "… khác bản build sẵn".)

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib -- speaker:: sidecar:: 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `ok`, thêm 3 test (bản debug: cờ dev, model dev, kiểm trước khi chạy; bản release: `release_builds_never_enable_speaker` thay cho test cờ dev).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target ./scripts/check-windows.sh 2>&1 | tail -1`
Expected: `Finished` hai lần, không cảnh báo. Không commit.

---

### Task 18: Nối vào phiên, sự kiện, cờ dev và cổng chống lọt

**Files:**
- Sửa: `src-tauri/src/session.rs` (`use` dòng 23–30; `trait SessionDeps` dòng 60–121; `start_with` dòng 481–490; `impl EventSink for TauriSink` dòng 941–997; `impl SessionDeps for LiveDeps`; test)
- Sửa: `src-tauri/src/events.rs`
- Sửa: `scripts/read-dev-env.sh`, `scripts/run-dev-app.sh`, `scripts/dev-env.test.mjs`, `scripts/run-dev-app.test.mjs`, `.env.example`
- Sửa: `scripts/release/release-check.mjs` (`DEV_GATE_MARKERS` dòng 113), `scripts/release/dev-gate-markers.test.mjs`
- Sửa: `.github/workflows/ci.yml` (job `macos`, bước "Test bản quyền và báo cáo lỗi ở bản release", dòng 64–66)

- [ ] **Step 1: Viết test**

`session.rs`, thêm vào `mod tests` (cạnh `live_lines_reach_only_the_overlay`):

```rust
    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.3, §8.4: nhãn đổi muộn và bảng giọng tới cả cửa sổ chính lẫn thanh phụ đề.
    #[test]
    fn speaker_events_reach_both_windows() {
        use pipeline::subtitle::{Roster, RosterVoice, SpeakerLabel};
        use tauri::Listener;
        let app = crate::test_support::mock_app();
        let heard = |label: &str| {
            let got = Arc::new(Mutex::new(Vec::<String>::new()));
            let w = crate::test_support::window(&app, label);
            for event in [events::SUBTITLE_SPEAKER, events::SPEAKER_ROSTER] {
                let sink = got.clone();
                w.listen(event, move |e| sink.lock().unwrap().push(format!("{event} {}", e.payload())));
            }
            got
        };
        let (to_overlay, to_main) = (heard(overlay::LABEL), heard(window::MAIN));
        let sink = TauriSink {
            app: app.handle().clone(),
            session: 1,
            asr_code: Arc::new(crate::test_support::FakeDeps::default()),
        };
        sink.speaker(&SpeakerLabel {
            id: 1_000_007,
            speaker: Some(2),
        });
        sink.roster(&Roster {
            voices: vec![RosterVoice { id: 2, room: false }],
        });
        let since = Instant::now();
        while to_overlay.lock().unwrap().len() < 2 || to_main.lock().unwrap().len() < 2 {
            assert!(since.elapsed() < Duration::from_secs(10), "chưa nhận đủ");
            std::thread::sleep(Duration::from_millis(5));
        }
        for got in [to_overlay, to_main] {
            let got = got.lock().unwrap().clone();
            assert_eq!(got[0], r#"subtitle://speaker {"id":1000007,"speaker":2}"#);
            assert_eq!(got[1], r#"speaker://roster {"voices":[{"id":2,"room":false}]}"#);
        }
    }
```

`dev-env.test.mjs`, thêm cuối file:

```js
// Cờ bật nhận giọng của bản dev (spec 2026-10-26-phan-biet-nguoi-noi, kế hoạch 02).
test("nhận AI_TRANSLATOR_DEV_SPEAKER, giá trị lạ có cảnh báo không in giá trị", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_SPEAKER=true\nSECRET=x\n");
  assert.equal(r.out, "AI_TRANSLATOR_DEV_SPEAKER=true\n");
  assert.equal(read(t, "AI_TRANSLATOR_DEV_SPEAKER=false\n").err, "");
  for (const value of ["1", "TRUE", "true ", ""]) {
    const odd = read(t, `AI_TRANSLATOR_DEV_SPEAKER=${value}\n`);
    assert.equal(odd.out, `AI_TRANSLATOR_DEV_SPEAKER=${value}\n`);
    assert.match(odd.err, /AI_TRANSLATOR_DEV_SPEAKER có giá trị lạ/);
    assert.ok(!odd.err.includes("TRUE"), "không in giá trị ra stderr");
  }
});

test("khóa chỉ giống tên cờ nhận giọng không được nhận", (t) => {
  const r = read(t, "AI_TRANSLATOR_DEV_SPEAKER_X=true\nAI_TRANSLATOR_SPEAKER=true\nai_translator_dev_speaker=true\n");
  assert.equal(r.out, "");
});
```

`run-dev-app.test.mjs`, thêm cuối file (cùng mẫu với `AI_TRANSLATOR_DEV_REPORTS`):

```js
// Cờ bật nhận giọng của bản dev (spec 2026-10-26-phan-biet-nguoi-noi, kế hoạch 02): cùng cách với công tắc Pro, chỉ `.env` mới bật.
const unsetSpeaker = lineOf((l) => l.trim() === "unset AI_TRANSLATOR_DEV_SPEAKER");

test("script có dòng `unset AI_TRANSLATOR_DEV_SPEAKER`, đứng trước khi đọc `.env` và trước `open -W`", () => {
  assert.notEqual(unsetSpeaker, -1);
  const readEnv = lineOf((l) => l.includes("read-dev-env.sh"));
  const open = lineOf((l) => /^\s*open -W\b/.test(l));
  assert.ok(unsetSpeaker < readEnv, `unset ở dòng ${unsetSpeaker + 1}, read-dev-env.sh ở dòng ${readEnv + 1}`);
  assert.ok(unsetSpeaker < open, `unset ở dòng ${unsetSpeaker + 1}, open -W ở dòng ${open + 1}`);
});

test("bật nhận giọng trong `.env` thì script in biểu ngữ cảnh báo trước `open -W`", () => {
  const banner = lineOf((l) => l.includes("AI_TRANSLATOR_DEV_SPEAKER=true. Bản này BẬT"));
  const open = lineOf((l) => /^\s*open -W\b/.test(l));
  assert.notEqual(banner, -1);
  assert.ok(banner < open);
});
```

`dev-gate-markers.test.mjs`, thêm cuối file:

```js
// Cờ bật nhận giọng của bản dev (spec 2026-10-26-phan-biet-nguoi-noi, kế hoạch 02): cùng cơ chế, hằng ở speaker/mod.rs.
test("DEV_GATE_MARKERS có giá trị của DEV_SPEAKER_ENV, và hằng chỉ có ở bản debug", () => {
  const source = readFileSync(fileURLToPath(new URL("../../src-tauri/src/speaker/mod.rs", import.meta.url)), "utf8");
  const m = source.match(/pub const DEV_SPEAKER_ENV: &str = "([^"]*)";/);
  assert.ok(m, 'không tìm thấy `pub const DEV_SPEAKER_ENV: &str = "...";` trong src-tauri/src/speaker/mod.rs');
  assert.ok(DEV_GATE_MARKERS.includes(m[1]), `DEV_SPEAKER_ENV = "${m[1]}" chưa có trong DEV_GATE_MARKERS`);
  const lines = source.split("\n");
  const at = lines.findIndex((l) => l.startsWith("pub const DEV_SPEAKER_ENV"));
  assert.equal(lines[at - 1].trim(), "#[cfg(debug_assertions)]", "hằng phải nằm ngay sau #[cfg(debug_assertions)]");
});
```

- [ ] **Step 2: Chạy, thấy lỗi**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib session::tests::speaker_events 2>&1 | grep -E "^error" | head -2; node --test scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs scripts/release/dev-gate-markers.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: lỗi biên dịch (`SUBTITLE_SPEAKER`, `speaker` của `TauriSink`); node: `# fail 4` (hay hơn).

- [ ] **Step 3: Viết mã**

`events.rs`: sửa `use pipeline::subtitle::{LiveEnd, LiveLine};` thành `use pipeline::subtitle::{LiveEnd, LiveLine, Roster, SpeakerLabel};`, thêm hằng sau `SUBTITLE_LIVE_END`:

```rust
/// Giọng của một phụ đề đã phát vừa đổi (spec 2026-10-26-phan-biet-nguoi-noi §4.3, `pipeline::subtitle::SpeakerLabel`). Cửa sổ
/// chính và thanh phụ đề.
pub const SUBTITLE_SPEAKER: &str = "subtitle://speaker";
/// Bảng giọng của phiên (`pipeline::subtitle::Roster`). Cửa sổ chính và thanh phụ đề.
pub const SPEAKER_ROSTER: &str = "speaker://roster";
```

và hàm sau `subtitle_live_end`:

```rust
pub fn subtitle_speaker<R: Runtime>(app: &AppHandle<R>, label: &SpeakerLabel) {
    emit(app, window::MAIN, SUBTITLE_SPEAKER, label);
    emit(app, overlay::LABEL, SUBTITLE_SPEAKER, label);
}

pub fn speaker_roster<R: Runtime>(app: &AppHandle<R>, roster: &Roster) {
    emit(app, window::MAIN, SPEAKER_ROSTER, roster);
    emit(app, overlay::LABEL, SPEAKER_ROSTER, roster);
}
```

`session.rs`:
- `use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Subtitle};` → `use pipeline::subtitle::{Delta, LiveEnd, LiveLine, Roster, SpeakerLabel, Subtitle};`; thêm `use pipeline::speaker::SpeakerLink;`.
- `trait SessionDeps`, thêm sau `vad`:
  ```rust
      /// Nhận giọng cho phiên vừa bắt đầu (spec 2026-10-26-phan-biet-nguoi-noi §4.1): `None` khi tắt hay chưa đủ điều kiện. Không
      /// chờ worker. Bản giả của test: `None`.
      fn speaker(&self) -> Option<SpeakerLink> {
          None
      }
  ```
- `impl SessionDeps for LiveDeps`, thêm:
  ```rust
      fn speaker(&self) -> Option<SpeakerLink> {
          crate::speaker::start_for_session(&self.app)
      }
  ```
- `start_with`: `Engine::start(` → `Engine::start_with_speaker(`, thêm đối số cuối `session.deps.speaker(),` sau `sink,`. (Engine giữ client; `stop_engine` thả engine thì worker tắt; hủy lúc bắt đầu thì `engine.stop()` cũng vậy.)
- `impl EventSink for TauriSink`, thêm:
  ```rust
      /// Nhãn đổi muộn (spec 2026-10-26-phan-biet-nguoi-noi §4.3). Kế hoạch 03 cập nhật cả bản chép lời trong bộ nhớ.
      fn speaker(&self, label: &SpeakerLabel) {
          events::subtitle_speaker(&self.app, label);
      }

      fn roster(&self, roster: &Roster) {
          events::speaker_roster(&self.app, roster);
      }
  ```

`scripts/read-dev-env.sh`: dòng chú thích thứ 9 đổi thành "- AI_TRANSLATOR_DEV_PRO, AI_TRANSLATOR_DEV_REPORTS (spec 2026-10-17) và AI_TRANSLATOR_DEV_SPEAKER (nhận giọng, spec 2026-10-26) có giá trị không phải"; `allowed="AI_TRANSLATOR_DEV_PRO AI_TRANSLATOR_DEV_REPORTS AI_TRANSLATOR_DEV_SPEAKER"`; thêm khối cảnh báo sau khối của `AI_TRANSLATOR_DEV_REPORTS`:

```sh
  case "$nl$result$nl" in
    *"${nl}AI_TRANSLATOR_DEV_SPEAKER=true$nl"* | *"${nl}AI_TRANSLATOR_DEV_SPEAKER=false$nl"*) ;;
    *"${nl}AI_TRANSLATOR_DEV_SPEAKER="*)
      echo 'AI_TRANSLATOR_DEV_SPEAKER có giá trị lạ (chỉ đúng "true" mới bật nhận giọng): coi như tắt' >&2
      ;;
  esac
```

`scripts/run-dev-app.sh`: thêm dòng chú thích sau dòng nói về `AI_TRANSLATOR_DEV_REPORTS`: `# Cờ bật nhận giọng của bản dev (AI_TRANSLATOR_DEV_SPEAKER, spec 2026-10-26, kế hoạch 02) cũng chỉ đặt trong .env.`; thêm `unset AI_TRANSLATOR_DEV_SPEAKER` sau `unset AI_TRANSLATOR_DEV_REPORTS`; `dev_speaker=off` cạnh `dev_reports=off`; trong vòng `for pair in $pairs` thêm `if [ "$pair" = "AI_TRANSLATOR_DEV_SPEAKER=true" ]; then dev_speaker=on; fi`; và trước `open -W "$@" "$app"`:

```sh
if [ "$dev_speaker" = on ]; then
  echo "================================================================" >&2
  echo "CẢNH BÁO: AI_TRANSLATOR_DEV_SPEAKER=true. Bản này BẬT phân biệt người nói (chưa phát hành, kế hoạch 02)." >&2
  echo "Cần speaker-worker trong src-tauri/binaries/ (scripts/copy-sidecars.sh) và model nhận giọng." >&2
  echo "================================================================" >&2
fi
```

`.env.example`, thêm cuối file:

```sh
#
# Cờ bật PHÂN BIỆT NGƯỜI NÓI của BẢN DEV (spec 2026-10-26, kế hoạch 02). Chỉ đúng `true` mới bật; mọi giá trị khác là tắt.
#   false (mặc định): như bản phát hành, không có nhận giọng.
#   true:  bản debug chạy speaker-worker cho mỗi phiên (cần speaker-worker trong src-tauri/binaries/, chép bằng
#          scripts/copy-sidecars.sh, và model eres2net-sv-en-voxceleb-16k.onnx trong kho model hay thư mục models/ của bản dev).
# Bản phát hành không có cờ này (không có cả mã đọc nó).
AI_TRANSLATOR_DEV_SPEAKER=false
```

`scripts/release/release-check.mjs`: `DEV_GATE_MARKERS` thêm `"AI_TRANSLATOR_DEV_SPEAKER"` vào cuối mảng (dòng chú thích phía trên mảng, nếu liệt kê tên biến, thêm tên này).

`.github/workflows/ci.yml`, job `macos`: bước "Test bản quyền và báo cáo lỗi ở bản release (không có phần chỉ dành cho bản debug)" đổi tên thành "Test bản quyền, báo cáo lỗi và nhận giọng ở bản release (không có phần chỉ dành cho bản debug)" và lệnh thành `cargo test --release --locked -p meeting-translator --lib -- pro:: license:: diagnostics:: speaker:: --test-threads=1` (chạy `speaker::tests::release_builds_never_enable_speaker` của Task 17: hành vi "bản phát hành luôn tắt" được khóa bằng test, không chỉ bằng cổng quét chuỗi).

- [ ] **Step 4: Chạy, thấy đạt**

Run: `cd $W && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib session 2>&1 | grep -E "^test result|FAILED|panicked" && node --test scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs scripts/release/dev-gate-markers.test.mjs scripts/release/release-check.test.mjs scripts/release/workflow.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `ok`; node `# fail 0`. Bước test bản release của CI (`speaker::` ở bản release) không chạy cục bộ: phải build release cả app, quá nặng với đĩa hiện có; CI chạy nó.

Không dựng bản release của app ở đây (rất nặng với đĩa hiện có): test `dev-gate-markers` bảo đảm tên biến nằm sau `cfg(debug_assertions)` và có trong `DEV_GATE_MARKERS`; cổng `no-dev-gate` kiểm binary app thật khi đóng gói (`package-macos.sh`, `package-windows.mjs`, CI phát hành).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && cargo fmt -p meeting-translator && CARGO_TARGET_DIR=$W/target cargo clippy -p meeting-translator --all-targets -- -D warnings 2>&1 | tail -1 && git status --short src-tauri scripts .env.example .github`
Expected: `Finished`, không cảnh báo. Không commit.

---

### Task 19: Mốc kiểm tổng của phần worker và pipeline

**Files:** không (chỉ kiểm). Build nặng: `cd $W && df -h . | tail -1` trước (≥ 22 GB).

- [ ] **Step 1: fmt, clippy, test toàn bộ crate đã sửa**

Run: `cd $W && cargo fmt --all -- --check && CARGO_TARGET_DIR=$W/target cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target cargo test -p speaker-protocol -p speaker-worker -p audio-capture -p pipeline -p latency-bench 2>&1 | grep -E "^test result|FAILED|panicked" && CARGO_TARGET_DIR=$W/target cargo test -p meeting-translator --lib 2>&1 | grep -E "^test result|FAILED|panicked"`
Expected: `fmt` không in gì; `Finished`; mọi dòng `ok`. So số test với mốc ở Task 0: chỉ tăng, không test cũ nào mất hay đỏ.

- [ ] **Step 2: Kiểm kiểu Windows**

Run: `cd $W && CARGO_TARGET_DIR=$W/target ./scripts/check-windows.sh 2>&1 | tail -1 && CARGO_TARGET_DIR=$W/target PKG_CONFIG_x86_64_pc_windows_msvc="$W/scripts/fake-pkg-config" PKG_CONFIG_ALLOW_CROSS=1 RUSTONIG_DYNAMIC_LIBONIG=1 cargo clippy -p speaker-worker -p speaker-protocol --all-targets --target x86_64-pc-windows-msvc -- -D warnings 2>&1 | tail -1`
Expected: `Finished` hai lần. (02b Task 7 thêm hai crate này vào `check-windows.sh`.)

- [ ] **Step 3: Script của repo**

Run: `cd $W && node --test "scripts/release/*.test.mjs" scripts/dev-env.test.mjs scripts/run-dev-app.test.mjs 2>&1 | grep -E "^# (pass|fail)"`
Expected: `# fail 0`.

- [ ] **Step 4: Chạy thử app bản dev có nhận giọng (cần chủ dự án)**

Hỏi chủ dự án trước: bước này cần mạng (`pnpm install`), vài GB đĩa (build debug của app, `node_modules`), mở app dev và thu âm thanh máy (macOS có thể hỏi lại quyền "Ghi âm thanh hệ thống" cho bản dev vừa dựng). Không đụng Teams, Chrome, âm lượng. App dev của thư mục chính không được chạy cùng lúc (cùng bundle id: `run-dev-app.sh` từ chối), cổng 1420 phải trống.

Điều kiện, đã đối chiếu với mã ngày 2026-10-26: worktree `$W` chưa có `src-tauri/binaries/` (bị gitignore), `node_modules/`, `models/`, `tools/`, `.env`. Bản dev đọc tiến trình phụ ở `src-tauri/binaries/` của chính `$W` (`paths::binaries_dir`, `CARGO_MANIFEST_DIR/binaries`), và `build.rs` băm thư mục đó lúc build (thiếu `asr-worker`, `llama-server` thì phiên không bắt đầu được); model của bản dev ở `MT_MODELS_DIR`, không đặt thì `$W/models` (`paths::dev_models_dir`), không phải `$M/models`; `run-dev-app.sh` chạy `pnpm dev` (cần `node_modules`) và chuyển các biến `MT_*` cho app qua `open --env`. `scripts/copy-sidecars.sh` chưa biết `speaker-worker` (02b Task 6) và cần `tools/` mà `$W` không có, nên ở đây chép tay.
1. Đĩa: `cd $W && df -h . | tail -1` (≥ 22 GB, dưới thì dừng).
2. Tiến trình phụ (chép trước khi build app): `mkdir -p $W/src-tauri/binaries && cp -p $M/src-tauri/binaries/* $W/src-tauri/binaries/` (asr-worker, llama-server và các `.dylib` của bản đang dùng; chỉ đọc `$M`), rồi `cd $W && MACOSX_DEPLOYMENT_TARGET=14.2 CARGO_TARGET_DIR=$W/target cargo build --release -p speaker-worker && cp target/release/speaker-worker src-tauri/binaries/speaker-worker-aarch64-apple-darwin` (build nặng).
3. Model, ở thư mục ngoài repo (không chép vào `$M/models`): `mkdir -p $DATA/dev-models && ln -sf $M/models/* $DATA/dev-models/ && cp $DATA/models/eres2net-sv-en-voxceleb-16k.onnx $DATA/dev-models/`.
4. Giao diện: `cd $W && pnpm install --frozen-lockfile` (cần mạng).
5. `.env` (bị gitignore): `printf 'AI_TRANSLATOR_DEV_SPEAKER=true\n' > $W/.env`; chủ dự án muốn giống `.env` của thư mục chính (ví dụ `AI_TRANSLATOR_DEV_PRO`) thì thêm các dòng đó.
6. Chạy (build debug của app: nặng): `cd $W && MT_MODELS_DIR=$DATA/dev-models CARGO_TARGET_DIR=$W/target scripts/run-dev-app.sh` (`MT_MODELS_DIR` là đường dẫn tuyệt đối). Chủ dự án phát một đoạn hội thoại hai người (ví dụ một bản ghi AMI) và bấm Bắt đầu.
Expected: log của app có "nhận giọng: bật cho phiên này", "nhận giọng: speaker-worker sẵn sàng sau … ms"; `speaker-worker.log` (thư mục log của app) có dòng "nạp model xong"; khi dừng phiên log có "nhận giọng: luồng VAD gửi … đoạn" và dòng tóm tắt của engine có "nhận giọng: N nhãn (… trước khi có chữ, … muộn)". Phụ đề hiện như cũ (giao diện chưa vẽ nhãn: kế hoạch 03). Ghi kết quả vào `$B/results/02-tong-hop.md` (02b Task 9).

- [ ] **Step 5: Mốc kiểm**

Run: `cd $W && git status --short`
Expected: các file của Task 1–18 (mới: `crates/speaker-protocol/`, `crates/speaker-worker/src/{onnx_steps,session,platform,main}.rs`, `crates/speaker-worker/tests/`, `crates/pipeline/src/{speaker,voices,speaker_client}.rs`, `crates/pipeline/src/bin/fake_speaker_worker.rs`, `crates/pipeline/tests/speaker_client.rs`, `src-tauri/src/speaker/`; sửa: các file trong bảng "Cấu trúc file"). Không file nào ngoài bảng đó. Không commit; báo chủ dự án kết quả và chuyển sang file 02b.

---

## Phủ spec (cả kế hoạch 02 và 02b)

"02 T5" là Task 5 của file này; "02b T2" là Task 2 của `…-02b-do-nghiem-thu.md`.

| Mục spec | Nội dung | Task |
|---|---|---|
| §4.1 | crate, binary `speaker-worker`, không ggml | 02 T2–T6 |
| §4.1 | cách B' (từng nút, bỏ tensor sau lần dùng cuối, trọng số một lần), test giống từng bit | 02 T3, T4 |
| §4.1 | ưu tiên thấp (`setpriority`, QoS utility qua `start_handler`, `BELOW_NORMAL`), `RAYON_NUM_THREADS=2` lúc chạy, không `with_context` | 02 T6, T13 |
| §4.1 | kiểm SHA-256 trước khi chạy, ký cùng app, DLL hạn chế | 02 T4, T5 (worker tự băm byte model đã đọc), T6 (DLL), T17 (cả thư mục `binaries/` như `asr-worker`, model), 02b T6 (ký, đóng gói) |
| §4.1 | không mã mạng, CI kiểm `cargo tree` | 02b T7 (cây phụ thuộc, feature Windows, mã nguồn, ký hiệu nhập của binary) |
| §4.1 | phiên không chờ worker; chưa sẵn sàng thì bỏ đoạn; dừng khi hết phiên, xóa giọng | 02 T5 (`SessionStart`), T13, T18 |
| §4.1 | khởi động lại 1, 2, 5 s; chết 3 lần thì tắt tới hết phiên | 02 T13 |
| §4.2 | khung 4 byte + postcard ≤ 4 MiB, biến thể ghim, `PROTOCOL_VERSION`, log không âm thanh | 02 T1 |
| §4.2 | `Load`, `SessionStart`, `Segment`, `Shutdown`; `Ready`, `Assign`, `Voices`, `Merged`, `Error` | 02 T1, T5 |
| §4.2 | `Speech`, `SetNames`, `ReaderState`, tên trong `VoiceInfo`, `participants` | để kế hoạch 04 (xem "Quyết định" mục 1) |
| §4.3 | kênh 4 đoạn, `try_send`, đầy thì bỏ, VAD không bao giờ chờ | 02 T8, T12 (test `a_stuck_speaker_never_slows_the_subtitles` so với lượt đối chứng, `missing_source_tags_never_stall_the_audio`) |
| §4.3 | nhãn từ worker không làm phụ đề chậm (kênh nhãn có giới hạn, xử lý có giới hạn mỗi vòng) | 02 T8, T12 (`a_flood_of_speaker_updates_is_handled_in_bounded_rounds`), T13 (`a_worker_flooding_updates_is_treated_as_broken`); QĐ 14 |
| §4.3 | `Assign` trước thì gắn trước khi phát; sau thì `subtitle://speaker`; `Voices`/`Merged` → `speaker://roster` | 02 T11, T12, T18 |
| §4.4 | `OpenSentence` không ghép hai giọng đã biết khác nhau | 02 T10, T12 |
| §4.4 | hàng đợi dịch không gộp khác giọng; đoạn gộp lấy giọng nhiều thời lượng hơn | 02 T9, T10, T12; ngoại lệ khi dịch quá tải: gộp câu cùng giọng xong mà hàng còn dài hơn cách gộp lúc tắt thì gộp ngay như khi tắt, không nhãn (QĐ 12), đo ở 02b T4 |
| §4.4 | dòng đang nói mang giọng của câu mở (`extends`) | 02 T12 |
| §4.4, §11 | mốc 230 ms khi chạy cùng `asr-worker`, `llama-server` | 02 T13 (`SpeakerHandle::round_trip_ms`); 02b T2 (khứ hồi khi worker chạy riêng), T3–T4 (khứ hồi p50/p90, số đoạn ≤ 230 ms, nhãn đúng lúc / muộn khi chạy cùng hai tiến trình phụ) |
| §4.5 | khóa gốc `speaker`, `speaker_config`; tải, kiểm SHA-256, lưu cạnh model khác; chưa có thì tắt lặng lẽ | 02 T15, T16, T17 |
| §4.5 | đăng model lên R2 | để kế hoạch 07 |
| §5.1 | fbank, ERes2Net, so onnxruntime | kế hoạch 01 (giữ test); 02 T4 chạy lại |
| §5.2 | < 0,5 s không nhúng; 0,5–1,5 s; ≥ 1,5 s; A2 4 s, thời lượng thật | 02 T1 (`MAX_EMBED_SAMPLES`, `MIN_EMBED_MS`), T5, T8 |
| §5.3 | θ 0,35, tối đa 8 giọng, mã tăng dần (có thể > 8), tất định | kế hoạch 01 (`cluster.rs`); 02 T1 (`SpeakerConfig::validate`), T2 |
| §5.3 | tách giọng bị gộp theo tên | để kế hoạch 04 |
| §5.4 | gộp tắt mặc định (1,10), giữ mã, `Merged` | 02 T1, T5, T12 |
| §5.5 | cờ nguồn `System`/`Mic`/`Mixed` ở bộ trộn; giọng ≥ 60% micro là giọng trong phòng | 02 T7, T8, T14, T5 |
| §5.6 | nhúng chỉ trong RAM, xóa khi dừng; không log | 02 T5, T6 |
| §9 | `Subtitle.speaker`, `subtitle://speaker`, `speaker://roster` (phần dữ liệu) | 02 T11, T18; `label`, `color`, Lịch sử, xuất file: kế hoạch 03 |
| §10 | bí mật, thay worker, gửi ra ngoài, dấu vân giọng, phụ thuộc mới | 02 T17 (SHA-256), 02b T7 (`cargo deny`, `cargo audit`, mạng, log, mô hình đe dọa) |
| §11 | A-spk4: xen kẽ bật/tắt, A2 p50 ≤ +20 ms, p90 ≤ +50 ms, chữ đầu ≤ +20 ms | 02b T3 (`session --speaker-worker`), T4 |
| §11 | RAM ≤ 250 MB, CPU ≤ 8% một lõi (M4 Pro); soak test ≥ 1 giờ có vết RSS | 02b T1, T2 (RSS, CPU khi nhúng), T3 (`--rss-trace`), T5 (soak) |
| §11 | quá tải: chậm 30 s liền thì tắt tới hết phiên | 02 T13 |
| §11, §14 | Windows i5: CPU ≤ 10% một lõi, RAM của B' | 02b T8 (cần chủ dự án) |
| §12 | A-spk1, A-spk2 trên code thật (qua worker) | 02b T1 (`speaker-eval --worker`), T2 |
| §12 | test giao thức (ghim, khung hỏng, giới hạn) | 02 T1, T6, T13 |
| §12 | A-spk7 phần thuộc 02 | 02b T7 |
| §6.2 | thử quyền Trợ năng với binary `speaker-worker` thật | để kế hoạch 04 (khi có bộ đọc); QĐ 13, chủ dự án duyệt ở 02b T9 |

## Để kế hoạch sau

- **Kế hoạch 03 (giao diện, dữ liệu):** vẽ nhãn và vạch màu trên thanh phụ đề và bản chép lời; `label`, `color`, `source` của `speaker://roster` và chữ "Người N" ở 5 ngôn ngữ; cài đặt `speakerDiarization`, `speakerNames` (thay cờ dev `AI_TRANSLATOR_DEV_SPEAKER`); "đang tải" model ở Cài đặt; cập nhật bản chép lời trong bộ nhớ khi có `subtitle://speaker`; Lịch sử (cột `speaker`), xuất file; kiểu TypeScript trong `src/lib/ipc.ts`; capability `open_speaker_settings`. Thêm hai việc về tải model: (1) `download_speaker_model` của 02 giữ khóa bảo trì (`begin_work`) suốt lúc tải, nên trong lúc đó người dùng bấm tải gói model sẽ gặp `modelsBusy` (`src-tauri/src/models/service.rs`, dòng ~560); không sao khi chỉ bản dev bật, nhưng phải xét lại khi bật sẵn cho mọi người; (2) spec §4.5 "tải cùng gói model đang dùng" chưa có Task nào ở 02 (02 chỉ tải nền khi phiên bắt đầu mà máy chưa có file).
- **Kế hoạch 04 (đọc tên macOS):** bộ đọc, `Speech`, `SetNames`, `ReaderState`, tên trong `VoiceInfo`, `participants`, tách giọng bị gộp theo tên, bậc "tạm dừng đọc tên" khi quá tải, thử quyền Trợ năng với binary `speaker-worker` thật (spec §6.2: "kế hoạch 02 thử lại" nay dời sang 04 vì 02 chưa có bộ đọc để thử).
- **Kế hoạch 05 (Windows):** bộ đọc UI Automation.
- **Kế hoạch 06:** công thức ký số, báo cáo `speaker_health`, kiểm tra hằng ngày.
- **Kế hoạch 07:** đăng model và mục `speaker` của `models.json` (cần khóa của chủ dự án), `pnpm models:update` cho khóa `speaker`, LICENSE/NOTICE của model trong THIRD_PARTY_NOTICES, chính sách quyền riêng tư, website, nghiệm thu A-spk1–7 trên bản phát hành, phát hành.

## Rủi ro và điều chưa biết

| Rủi ro | Cách xử lý trong kế hoạch |
|---|---|
| B' dựa vào hành vi chưa ghi thành tài liệu của candle-onnx 0.11.0 (graph con không khai `input` vẫn chạy) | `onnx_steps` tự kiểm những gì `simple_eval` bỏ qua; test giống từng bit với model thật (02 T4) chạy lại mỗi lần nâng candle-onnx; dự phòng là vá candle-onnx (cách B, `ram.md`) |
| Chi phí gọi `simple_eval` 349 lần mỗi lần nhúng trên Windows chưa đo | 02b T8 đo trên i5 (cần chủ dự án); chậm thì cân nhắc khúc nhiều nút (`ram.md`: khúc 8 nút tốn RAM hơn) |
| Allocator Windows giữ bộ nhớ khác macOS | 02b T8 đo RSS chạy lâu trên i5 (soak trên macOS: 02b T5) |
| `libc::pthread_set_qos_class_self_np` và `qos_class_t` của libc 0.2.189 (đọc mã nguồn: có, candle-core dùng cùng đường) | biên dịch ở 02 T6; lỗi thì đối chiếu `~/.cargo/registry/src/*/libc-0.2.189/src/new/apple/libpthread/`. Nâng lên 0.2.191: xem "Điều cần chủ dự án quyết" |
| Hàng đợi dịch gộp ít hơn khi người nói xen kẽ (hai câu liền nhau khác giọng không gộp được) → tồn đọng lâu hơn, nhiều câu `Skip` hơn khi dịch chậm hơn lời nói | QĐ 12: gộp câu cùng giọng xong mà hàng còn dài hơn cách gộp lúc tắt thì gộp ngay cả câu khác giọng, câu gộp không nhãn, nên hàng đầy thì gộp y hệt khi tắt, với mọi kiểu lượt nói (test 02 T10, T12, `overload_with_two_alternating_speakers_queues_no_longer_than_when_off`, `overload_is_never_slower_than_when_off_whatever_the_turns`, `three_hundred_random_meetings_are_never_slower_with_voices_on`); 02b T4 đo số câu gộp, số lần gộp khác giọng, số câu `Skip` khi bật so với tắt trên một đoạn hai người nói xen kẽ, và kịch bản dịch quá tải (hàng dài nhất, câu chờ lâu nhất) |
| Worker hỏng hay bị chiếm gửi dồn nhãn làm luồng phụ đề chậm | QĐ 14: kênh nhãn 256, đầy thì coi worker chết; luồng phụ đề lấy tối đa 64 nhãn mỗi vòng, gộp `Voices` (test 02 T12, T13) |
| Một đường của bộ trộn ra thiếu cờ nguồn làm âm thanh dồn lại, phụ đề đứng | QĐ 15: luồng VAD ép số cờ bằng số mẫu, log một lần (test 02 T12 `missing_source_tags_never_stall_the_audio`) |
| Model bị thay giữa lúc app kiểm SHA-256 và lúc worker đọc (TOCTOU; Windows không giữ handle khóa model như binary) | Đóng ở 02: `Load.model_sha256`, worker băm đúng các byte nó đọc rồi dựng đồ thị từ chính các byte đó (`Embedder::load_checked`, test 02 T4, T6). Còn lại: model của bản dev không kiểm (chỉ bản debug) |
| A-spk4 (độ trễ bật/tắt) chỉ đo trên M4 Pro; máy yếu nhất là Windows i5 4 lõi | 02b T8 chỉ đo `speaker-eval` trên i5; ghi vào "Còn mở" của `02-tong-hop.md` (02b T9), nghiệm thu độ trễ trên i5 ở kế hoạch 05/07 |
| Nhãn tới muộn hơn kết quả nhận dạng khi chạy cùng `asr-worker`, `llama-server` | luật đúng cả khi nhãn muộn (02 T12); 02b T4 đo tỉ lệ đúng lúc / muộn |
| Mixed hiếm khi xuất hiện (cổng hạ micro ngay khi âm thanh máy có tiếng) | đúng theo chữ của spec §5.5; chỉ ảnh hưởng cờ "giọng trong phòng" (đếm `Mic`) |
| Kích thước gói cài đặt tăng (binary `speaker-worker` có candle) so với giới hạn 60 MB của `.dmg` | 02b T6 Step 4 đo kích thước binary và `.dmg` của 0.3.1; vượt thì dừng, báo chủ dự án |
| Test thời gian của client (`tests/speaker_client.rs`) chập chờn khi máy bận | thời gian chờ rộng (5–10 s); chạy lại với `--test-threads=1` trước khi kết luận |

## Điều cần chủ dự án quyết

Mặc định ghi ở mỗi mục là cách kế hoạch này làm nếu chủ dự án không nói khác. Các điều cần quyết của phần đo, đóng gói ở file 02b Task 9.

1. **Phiên bản `libc` (lệch quy tắc "bản ổn định mới nhất" của CLAUDE.md).** crates.io (kiểm ngày 2026-10-26, `max_stable_version`): `libc` mới nhất là **0.2.191**; cả workspace đang khóa **0.2.189** (`Cargo.lock`; Cargo gộp mọi yêu cầu `0.2.x` về một bản cho `asr-worker`, `pipeline`, `audio-capture`, app). **Mặc định: GIỮ 0.2.189 ở kế hoạch 02.** Lý do: nâng là đổi phụ thuộc của mọi binary phát hành, phải build và test lại cả workspace (CLAUDE.md), trong khi đĩa chỉ còn khoảng 24 GB; kế hoạch này chỉ cần các API đã có ở 0.2.189 (`setpriority`, `getpriority`, `pthread_set_qos_class_self_np`, `qos_class_t`). Lệnh phụ thuộc vào `libc`: 02 Task 6 (`platform.rs`, `crates/speaker-worker/Cargo.toml` ghi `libc = "0.2.189"`, test `the_worker_lowers_its_priority`). **Đề xuất:** nâng bằng `cargo update -p libc --precise 0.2.191` ở đợt cập nhật phụ thuộc trước phát hành (kế hoạch 07), rồi build và test toàn workspace; hoặc ngay trước 02 Task 6 nếu chủ dự án muốn (khi đó sửa dòng `libc = "0.2.189"` thành `"0.2.191"`, chạy `cargo test --workspace` và `scripts/check-windows.sh` trước khi đi tiếp).
2. **Phiên bản `sha2`** (cùng loại với mục 1): crates.io mới nhất **0.11.1**; app đang khóa **0.11.0**. `speaker-worker` (02 Task 4) dùng `sha2 = "0.11.0"` để không đổi phụ thuộc của app. **Mặc định: GIỮ 0.11.0**; đề xuất nâng cùng đợt với `libc` (`cargo update -p sha2 --precise 0.11.1`, build và test lại toàn bộ).
3. **Số lần chạy lại `speaker-worker`.** Spec §4.1 vừa nói "khởi động lại sau 1, 2, 5 s như `asr-worker`" vừa nói "chết 3 lần thì tắt tới hết phiên". **Mặc định:** tắt ở lần chết thứ 3 (`max_deaths = 3`), tức chỉ hai lần chạy lại sau 1 s và 2 s; mức 5 s nằm sẵn trong `backoff` nhưng không dùng tới. Muốn đủ ba lần chạy lại (1, 2, 5 s) thì đặt `max_deaths = 4` trong `SpeakerLaunch::new` (02 Task 13) và sửa test `three_deaths_turn_speaker_off_for_the_session` thành bốn lần chết. Không ảnh hưởng phụ đề (worker chết không làm phụ đề chậm).
