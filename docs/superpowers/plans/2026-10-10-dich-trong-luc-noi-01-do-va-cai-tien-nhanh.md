# Dịch trong lúc người nói chưa dừng · 01: Đo đúng và cải tiến nhanh

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Làm bước 1 của spec §9:
- **A1:** đo độ trễ bằng chính `pipeline::Engine` của app (`latency-bench session`), có đủ các chỉ số §10.1, rồi lấy mốc chế độ thường với ngưỡng 50 ms cho cả hai gói trên 6 session S6;
- **A2:** ghép câu không xóa bản dịch đang hiện; cờ hủy được kiểm trước khi gửi request và ở mọi gói stream;
- **A3:** bớt độ trễ thu âm (đọc ngay khi có mẫu; resample theo khối 10 ms);
- **A4:** thanh phụ đề memo theo từng dòng;
- **A5:** flash attention cho whisper với `audio_ctx` là bội của 256, giữ lại chỉ khi qua cổng tất định và A4;
- cuối cùng đo lại để thấy tác dụng của A2–A5 so với mốc.

**Kiến trúc:**
- `latency-bench session` gồm ba file mới, tên theo H9 của kế hoạch 00:
  - `session_metrics.rs`: `Timed`, `Recorded`, `Summary`; các chỉ số §10.1 (`evaluate`, `summarize`). Hàm thuần, test bằng sự kiện tổng hợp.
  - `session_replay.rs`: dựng lại giao diện thấy gì và lúc nào, từ các sự kiện (hàm thuần).
  - `session.rs`: `SessionArgs`, `run`, `Recorder` (`EventSink` có giờ thật). Lệnh chạy `pipeline::Engine` với `SampleSource` phát theo thời gian thực, tiến trình phụ thật qua `SidecarManager` dựng như app.
- Hai script Python (chỉ thư viện chuẩn) chạy 6 session cho một gói và in bảng Markdown.
- A2 làm đúng hai hợp đồng H1 (`Job.cancel`) và H2 (`held`, `fresh` trong `SubState`) của kế hoạch 00. Thêm một chỗ ở giao diện: `lineView` hiện bản dịch đang được giữ khi câu ở `asr_done`.
- A3 sửa `audio-capture` (khối resample, hàm đọc khi có mẫu) và `LiveCapture::read` của app.
- A4 tách `OverlayLine` (memo, H8) khỏi `overlay.tsx`.
- A5 sửa `asr-protocol` (`audio_ctx` lên bội của 256) và `asr-worker` (bật flash attention mặc định trên macOS). Cổng là một test tích hợp có `#[ignore]` chạy với model thật, cộng bốn lượt A4.

**Công nghệ:**
- Rust 1.98.1 (edition 2024): crate `latency-bench`, `pipeline`, `asr-protocol`, `asr-worker`, `audio-capture`, app Tauri `meeting-translator`.
- whisper.cpp 1.8.3 có vá; `llama-server` b11146.
- React 19, TypeScript, Vitest 5 (môi trường `node`, không có DOM).
- Python 3 (chỉ thư viện chuẩn), `uv` để chấm A4 như trước.
- Không thêm thư viện nào; `Cargo.lock` và `pnpm-lock.yaml` không đổi.

**Spec:** `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`: §3 (đơn vị, khóa so khớp), §8 (A1–A5), §9 bước 1, §10.1, §11.

**Tổng quan và hợp đồng khóa:** `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-00-tong-quan.md`: H1, H2, H7, H8, H9; "Nhánh và worktree"; "Quy ước chung".

**Nghiên cứu nền:** `bench/2026-10-10-do-tre/README.md`.

**Spec chính:** `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`: §3.3 (A2, A4), §6.4 (`audio_ctx`, flash attention), §8.

---

## Trạng thái đầu và cách đọc

- **Worktree** `/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi`, nhánh `dich-trong-luc-noi`, đã có spec và kế hoạch 00.
  - Không đụng thư mục chính `/Users/dtphong/Desktop/software_business/ai-translator`: có phiên khác đang làm ở đó.
  - Ngoại lệ duy nhất là Task 0, thêm ba dòng vào `info/exclude` của git (thư mục `.git` dùng chung).
  - Dữ liệu và model của thư mục chính chỉ được **đọc** qua symlink.
  - Mọi thứ do kế hoạch này sinh ra mà không commit đều nằm ở `target/do-tre/` của worktree (gitignore có `/target/`), không bao giờ ở `bench/phase0/data/`.
- **Code đã dựng thử.** Mọi khối code trong kế hoạch đã được áp lên một bản sao của worktree. Ở bản sao đó, các lệnh sau đều đạt:
  - `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`;
  - clippy của `asr-worker` với `metal,shared-encode`, `./scripts/check-windows.sh`, `tsc --noEmit`, `vitest run`;
  - unittest của script Python;
  - `latency-bench session` chạy hết một lượt trên `tests/fixtures/audio/fleurs-en-en-vi.wav`, với `fake_asr_worker` và `fake_llama_server`.

  Chưa chạy với model thật: đó là việc của Task 3, 11 và 12.
- **Khối code.**
  - "`<file>`: thay … bằng …" là thay đúng một chỗ: khối cũ có đủ dòng để chỉ khớp một chỗ trong file lúc làm task đó.
  - "Tạo `<file>`" là chép nguyên khối vào file mới.
  - "Chèn vào đầu `<file>`" là đặt khối lên trước nội dung đang có.
  - Trong một task, làm các khối "viết test" trước, chạy thấy đỏ, rồi mới làm các khối cài đặt.
- **Lệnh** chạy ở gốc worktree; mỗi khối lệnh tự `cd` vào đó, vì shell của agent không giữ thư mục giữa các lần gọi.
  - Không chạy hai bản build Rust lớn cùng lúc.
  - Không `pkill` hay `killall`: app AI Translator đã cài có thể đang chạy `llama-server` của nó (đường dẫn `/Applications/AI Translator.app/...`).
- **Commit:** mỗi task một commit (Task 0 không có).
  - Trước khi commit, `git -C <worktree> branch --show-current` phải in `dich-trong-luc-noi`.
  - Chỉ `git add` đúng các file của task.
  - Dòng cuối commit message là `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`; thay `<model đang chạy>` bằng tên model của agent thực thi.
- **Đo với model thật:** Task 3, 11 và 12 chiếm máy khoảng 45, 40 và 50 phút. Trước khi chạy phải hỏi chủ dự án (qua điều phối viên):
  - thoát app nặng;
  - cắm sạc;
  - tạm dừng việc build nặng của phiên làm việc khác;
  - không dùng máy trong lúc đo.

## Quyết định của kế hoạch này

- **QĐ1. Phát theo lịch tuyệt đối.**
  - `SampleSource` ngủ một khoảng cố định trước mỗi khối, nên trễ cộng dồn. Một session 3 phút có khoảng 5 600 khung; mỗi khung còn tốn thời gian VAD, nên giờ âm thanh tụt lại sau giờ thật vài giây.
  - Vì vậy `session` bọc `SampleSource` (`chunk` 512 mẫu, `pace` 0) trong `Paced`: khung thứ k sẵn sàng lúc `origin + (k + 1) × 32 ms`, đúng cách `latency` (S6 cũ) phát.
  - Silero được nạp trước khi bấm giờ.
  - Mọi sự kiện ghi thời điểm theo giờ thật, cùng mốc `origin`. Nhờ vậy trừ được trực tiếp cho mốc của truth (giờ âm thanh).
- **QĐ2. Ánh xạ của chế độ thường** (H7; spec §10.1). Xem đầu `session_replay.rs` và `session_metrics.rs`.
  - Mỗi `end_ms` mới của một phụ đề là một "phần" chữ nguồn, tức một đoạn VAD đã chép.
  - Phần thuộc câu truth có `start_ms ≤ end_ms của phần ≤ max(end_ms, vad_end_ms) + 300`. Khoảng lặng giữa các câu S6 từ 416 ms trở lên, nên không lấn sang câu sau.
  - Đơn vị của bản chép cuối được chia đều trên `start_ms`–`end_ms` của câu. Đơn vị thứ i nói xong lúc `start + (i + 1) × độ dài / n`, như `stream_sim.py`.
  - **Tầng tạm của một từ:** lần đầu phụ đề chứa phần của từ đó hiện chữ dịch được dịch từ một phiên bản có phần đó (`Shown::tgt_of ≥ end_ms` của phần).
  - **Tầng ổn định:** lúc phụ đề cuối cùng chứa phần đó chốt hẳn (`done` hay `same_lang`, không còn `provisional`).
  - **A2:** ghép như `latency`, câu với phần có mốc cuối gần nhất trong 1 giây.
  - LID nhận nhầm sang ngôn ngữ đích thì không tính, như `latency`.
- **QĐ3. Kết quả.**
  - `summary` có đúng các khóa của H7. Số đo thêm (thời gian phiên, p50 chép lời và dịch, số lần ghép câu, độ trễ phát, số lần khởi động lại tiến trình phụ…) nằm ở khóa `run`; kết quả từng câu ở `utterances`.
  - Bản đầy đủ (có `events`) nằm ở `target/do-tre/sessions/`, không commit, cùng log của tiến trình phụ.
  - Bản rút gọn (bỏ `events`) do `run_sessions.py` ghi vào `bench/2026-10-10-do-tre/results/`, để commit.
  - Lý do: `events` chứa mọi gói chữ dịch (khoảng 0,3 MB mỗi session), và kế hoạch 02 còn chạy cả lưới tham số.
- **QĐ4. A2 ở giao diện.** `lineView` hiện bản dịch khi phụ đề ở `asr_done` mà `tgt_text` khác rỗng.
  - Sau H2, đó chính là lúc câu vừa được ghép và bản cũ đang được giữ.
  - Nếu không sửa, thanh phụ đề và bản chép lời hiện câu gốc trong suốt lúc chờ dịch lại, tức A2 không có tác dụng gì trên màn hình.
  - Xuất file không đổi: `transcript/export.rs` vốn đã lấy `tgt_text` khi trạng thái là `asr_done`.
- **QĐ5. A3.**
  - **Khối resample:** 10 ms âm thanh vào (`block_frames(rate) = rate / 100`), thay cho 1024 khung. Số đo bằng chính hàm test của Task 6:
    - phẳng tới 7 kHz (lệch dưới 0,2 dB) ở 48; 44,1 và 96 kHz;
    - −18 dB ở 7,5 kHz;
    - chặn từ 60 dB trên 8 kHz;
    - trễ của bộ lọc 5 ms (trước 10,7 ms ở 48 kHz, 15 ms ở 44,1 kHz);
    - CPU 60 giây 48 kHz stereo: 12 ms so với 17–19 ms của khối 1024.
  - **Đọc thu âm:** gọi `drain` ngay; chưa có mẫu thì ngủ 5 ms rồi thử lại, tối đa `timeout` (20 ms). Trước đó là ngủ cố định 20 ms rồi mới đọc.
  - Lợi tổng cộng ước khoảng 20–25 ms, khớp ước tính của spec. `latency-bench` phát WAV 16 kHz trực tiếp nên không đo được phần này.
- **QĐ6. A4** (H8). `OverlayLine = memo(function OverlayLine(props))`, so nông, không có hàm so sánh riêng.
  - Props là đối tượng phụ đề cùng hai giá trị nguyên thủy (`showSource`, `uiLanguage`), không truyền hàm `t` (hàm này tạo mới mỗi lần vẽ).
  - So nông nên prop tùy chọn mà kế hoạch 03 thêm (`dimProvisional`) cũng được xét, không phải sửa hàm so sánh.
  - Repo không có Testing Library hay DOM giả, và không thêm thư viện. Vì vậy test ở ba mức:
    - markup tĩnh (`react-dom/server`) giống hệt cách vẽ cũ;
    - component là memo so nông;
    - store giữ nguyên đối tượng của các dòng không đổi.
- **QĐ7. A5.**
  - **Làm tròn ở client:** `audio_ctx_for_samples` làm tròn lên bội của 256 (điều phối viên chọn), nên app, `latency` và `asr-eval` gửi đúng cửa sổ đã dùng. Sàn 512 giữ nguyên.
  - **Làm tròn ở worker:** khi bật flash attention, `asr-worker` làm tròn thêm một lần (`effective_audio_ctx`), để bên gọi gửi số khác (`--min-ctx`) cũng không gặp lỗi #3941.
  - **Chỗ còn đệm:** cửa sổ đầy đủ 1500 (đoạn dài hơn 24,32 giây) vẫn có phần đệm, vì 1536 vượt cửa sổ của model. App không gửi đoạn nào dài như vậy: đoạn dài nhất là đoạn gộp ở hàng đợi, 12 giây. A4 chỉ có 2/548 clip dài hơn 25,6 giây.
  - **Mặc định:** flash attention bật trên macOS (Metal) khi chạy GPU, nơi cổng đo được.
  - **Windows (Vulkan):** giữ tắt cho tới khi đo trên máy Windows. Phép làm tròn vẫn áp ở đó. Lượt A4 "fa-off" của Task 11 đo tác dụng của riêng phép làm tròn.
  - **Biến môi trường:** `ASR_FLASH_ATTN=0` tắt, `=1` bật.
  - **Cổng:**
    - test tất định với flash attention bật và tắt;
    - A4 cho turbo và small;
    - không cổng nào đạt thì quay lại cả hai commit của A5 (Task 11 ghi đủ lệnh).
- **QĐ8. Thứ tự.** Mốc (Task 3) đo trên code chưa có A2–A5, để Task 12 so được tác dụng.

## File sẽ tạo hoặc sửa

| File | Việc |
|---|---|
| `crates/latency-bench/src/session_metrics.rs` (tạo) | H9: `Timed`, `Recorded` (kế hoạch 02 thêm `Live`, `LiveEnd`), `Summary` (khóa của H7); `UtteranceResult`, `evaluate` (từng câu), `summarize` |
| `crates/latency-bench/src/session_replay.rs` (tạo) | Đơn vị và khóa so khớp (`units`, `target_units`), `Replay`: phụ đề, phần, `tgt_of`; truy vấn tầng tạm, A2, tầng ổn định, độ nháy |
| `crates/latency-bench/src/session.rs` (tạo) | H9: `SessionArgs`, `run`. `Recorder` (`EventSink` có giờ thật), tiến trình phụ như app, `Paced`, `TimedAsr`, `TimedMt`, CPU, `RunInfo`, file JSON |
| `crates/latency-bench/src/main.rs` | Khai báo module, lệnh `Session` |
| `crates/latency-bench/src/latency.rs` | `pub(crate)` cho `ProcessUsage`, `spawn_sampler`, `machine_info`, `public_path`, `repo_root`, `read_wav_16k_mono` |
| `crates/latency-bench/src/stats.rs` | `Utterance::text` mặc định rỗng (file mốc của fixture không có trường này) |
| `crates/latency-bench/src/mt_eval.rs` | `Job.cancel: None` |
| `bench/2026-10-10-do-tre/run_sessions.py` (tạo) | Chạy 6 session cho một gói, ghi bản đầy đủ và bản rút gọn |
| `bench/2026-10-10-do-tre/summarize_sessions.py` (tạo) | Bảng Markdown theo file, theo tiếng nguồn, và so hai lượt (`--compare`) |
| `bench/2026-10-10-do-tre/test_session_tools.py` (tạo) | unittest của hai script |
| `bench/2026-10-10-do-tre/results/buoc1-moc-*.json`, `buoc1-moc-che-do-thuong.md` (tạo) | Mốc chế độ thường |
| `crates/pipeline/src/translate.rs` | H1: `Job.cancel`, kiểm trước request và ở mọi gói |
| `crates/pipeline/src/engine.rs` | H1: `mt_loop` truyền cờ; H2: `held`, `fresh`, `grow`, `dispatch`, `MtDelta`, `MtRetry`, `settle`; test |
| `crates/pipeline/tests/real_terms.rs`, `crates/pipeline/tests/lifecycle.rs` | `Job.cancel: None` |
| `src/lib/subtitleView.ts`, `src/lib/subtitleView.test.ts` | `asr_done` có chữ dịch thì hiện chữ dịch (QĐ4) |
| `crates/audio-capture/src/resample.rs` | Khối 10 ms (`block_frames`); test đáp ứng tần số, trễ, CPU |
| `crates/audio-capture/src/preprocess.rs` | `drain_when_ready` và test |
| `src-tauri/src/capture.rs` | `LiveCapture::read` dùng `drain_when_ready` |
| `src/windows/overlay/OverlayLine.tsx`, `OverlayLine.test.ts` (tạo) | H8: dòng của thanh phụ đề, memo so nông |
| `src/windows/overlay/overlay.tsx` | Dùng `OverlayLine` |
| `src/store/overlay.test.ts` | Test giữ nguyên đối tượng của dòng không đổi |
| `crates/asr-protocol/src/lib.rs` | `AUDIO_CTX_ALIGN`, `align_audio_ctx`, `audio_ctx_for_samples` làm tròn lên bội của 256 |
| `crates/asr-worker/src/engine.rs` | `flash_attn_wanted`, `effective_audio_ctx` |
| `crates/asr-worker/tests/flash_attn_determinism.rs` (tạo) | Cổng tất định (`#[ignore]`, model thật) |
| `bench/phase0/results/a4_m4pro-{turbo,small}-{fa,fa-off}.json` (tạo) | Bốn lượt A4 của cổng A5 |
| `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md` (tạo) | Biên bản cổng A5 |
| `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` | §6.4: `audio_ctx`, flash attention, việc cho MVP, theo kết quả A5 |
| `bench/2026-10-10-do-tre/results/buoc1-sau-*.json`, `buoc1-sau-cai-tien.md` (tạo) | Đo lại sau A2–A5 |

## Các task

| Task | Việc | Commit |
|---|---|---|
| 0 | Chuẩn bị worktree, kiểm mốc | không |
| 1 | A1: lệnh `latency-bench session` | `feat(latency-bench): …` |
| 2 | A1: script chạy và tổng hợp | `bench(do-tre): …` |
| 3 | A1: mốc chế độ thường, ngưỡng 50 ms, hai gói | `bench(do-tre): …` |
| 4 | A2: cờ hủy (H1) | `feat(pipeline): …` |
| 5 | A2: ghép câu giữ bản dịch đang hiện (H2) | `feat(pipeline): …` |
| 6 | A3: resample theo khối 10 ms | `perf(audio-capture): …` |
| 7 | A3: đọc thu âm ngay khi có mẫu | `perf(capture): …` |
| 8 | A4: memo từng dòng của thanh phụ đề | `perf(overlay): …` |
| 9 | A5: `audio_ctx` là bội của 256 | `feat(asr-protocol): …` |
| 10 | A5: flash attention trong `asr-worker`, test tất định | `feat(asr-worker): …` |
| 11 | A5: chạy cổng, quyết định, sửa spec chính | `bench(do-tre): …` (và `revert` nếu không đạt) |
| 12 | Kiểm toàn bộ, đo lại sau A2–A5 | `bench(do-tre): …` |

---

## Task 0: Chuẩn bị worktree

Worktree chưa có gì bị gitignore: chưa có model, công cụ, dữ liệu đo, `node_modules`, tiến trình phụ hay bản build.

**Files:**
- Không file nào được git theo dõi.
- Tạo symlink `models`, `tools`, `bench/phase0/data`.
- Thêm ba dòng vào `$(git rev-parse --git-common-dir)/info/exclude`.

- [ ] **Step 1: Kiểm nhánh và trạng thái**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git branch --show-current
git status --short
git log --oneline -3
```

Expected:
- dòng đầu là `dich-trong-luc-noi`;
- `status` trống;
- log có `docs(spec): dịch trong lúc người nói chưa dừng` (và commit của kế hoạch 00, nếu đã có).

- [ ] **Step 2: Symlink model, công cụ và dữ liệu đo của thư mục chính (chỉ để đọc)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
M=/Users/dtphong/Desktop/software_business/ai-translator
ln -s "$M/models" models
ln -s "$M/tools" tools
ln -s "$M/bench/phase0/data" bench/phase0/data
ls models/ggml-large-v3-turbo-q5_0.bin models/ggml-small-q5_1.bin models/Hy-MT2-1.8B-Q8_0.gguf \
  models/Hy-MT2-1.8B-Q4_K_M.gguf models/silero_vad_v6.2.3.onnx
ls tools/llama-b11146/macos-arm64/llama-b11146/llama-server
ls bench/phase0/data/latency/sessions.json bench/phase0/data/latency/en.wav bench/phase0/data/asr/manifest.jsonl
```

Expected: mọi file được liệt kê, không có "No such file".

- [ ] **Step 3: Cho git bỏ qua ba symlink**

`.gitignore` có `/models/`, `/tools/` và `/bench/phase0/data/`. Dấu `/` cuối nghĩa là chỉ khớp thư mục, mà symlink không phải thư mục với git, nên ba symlink sẽ hiện thành file lạ.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
EXCLUDE="$(git rev-parse --path-format=absolute --git-common-dir)/info/exclude"
for p in /models /tools /bench/phase0/data; do grep -qxF "$p" "$EXCLUDE" || printf '%s\n' "$p" >> "$EXCLUDE"; done
tail -n 3 "$EXCLUDE"
git status --short
```

Expected:
- ba dòng cuối của `exclude` là `/models`, `/tools`, `/bench/phase0/data`;
- `git status --short` trống.

Ba dòng này không đổi gì ở thư mục chính, vì ở đó ba đường dẫn vốn là thư mục đã bị bỏ qua.

- [ ] **Step 4: Cài phụ thuộc của giao diện**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm install --frozen-lockfile
git status --short
```

Expected: pnpm kết thúc không lỗi; `git status --short` trống, tức `pnpm-lock.yaml` không đổi.

- [ ] **Step 5: Dựng tiến trình phụ như bản dev của app**

`scripts/copy-sidecars.sh` làm hai việc:
- build `asr-worker` (release, `metal,shared-encode`), lần đầu mất khoảng 5–10 phút vì phải biên dịch whisper.cpp;
- chép nó cùng `llama-server` b11146 và 10 thư viện `.dylib` (lấy từ `tools/`, chỉ đọc) vào `src-tauri/binaries/`.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
scripts/copy-sidecars.sh
```

Expected: dòng cuối liệt kê 12 file, có `asr-worker-aarch64-apple-darwin`, `llama-server-aarch64-apple-darwin`, `libllama-server-impl.dylib` và `libggml-metal.0.dylib`.

- [ ] **Step 6: Build công cụ đo**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo build --release --locked -p latency-bench
ls -la target/release/latency-bench
```

Expected: build xong, file `target/release/latency-bench` có mặt.

- [ ] **Step 7: Bộ kiểm như CI trên nhánh sạch (mốc)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p asr-worker --features shared-encode
pnpm build && pnpm test
./scripts/check-windows.sh --locked
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
uv --version
python3 --version
```

Expected:
- mọi lệnh thoát mã 0;
- `cargo test` không có `FAILED`;
- `uv` có mặt (Task 11 chấm A4 bằng nó);
- Python từ 3.9 (script dùng `str.removesuffix`).

Nếu lệnh nào đỏ trên nhánh sạch: dừng, báo điều phối viên kèm nguyên lỗi (lỗi môi trường), không sửa code.

- [ ] **Step 8: Không có gì để commit**

```sh
git -C /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi status --short
```

Expected: trống. `dist/`, `node_modules/`, `src-tauri/binaries/` và `target/` đều bị gitignore.

---
## Task 1: A1 — lệnh `latency-bench session`

Đúng H7 và H9 của kế hoạch 00:
- chạy `pipeline::Engine` với `SampleSource` phát WAV theo thời gian thực;
- `asr-worker` và `llama-server` thật qua `SidecarManager`, dựng như `src-tauri/src/sidecar/mod.rs` trên macOS;
- ghi mọi sự kiện kèm thời điểm, ms từ lúc bắt đầu phát;
- JSON có `args`, `machine`, `events`, `summary`, cộng:
  - `usage`: RAM và CPU từng tiến trình, như S6;
  - `run`: số đo thêm của lượt chạy;
  - `utterances`: kết quả từng câu.

Tên theo H9:
- `session.rs`: `SessionArgs` (đúng các trường của H9, `pub`), `pub fn run`.
- `session_metrics.rs`:
  - `Timed { t_ms, ev }`, `enum Recorded { Subtitle, Delta, Indicators }`;
  - `pub fn summarize(truth, events) -> Summary`;
  - `Summary` có đúng các khóa của H7, gồm `cpu_percent` (điều phối viên bổ sung): CPU của `asr-worker`, `llama-server` và tiến trình đo, chia thời gian thật và số lõi logic, như S6 (`bench/phase0/latency/summarize.py`).
- `main.rs`: biến thể `Session(session::SessionArgs)`.

Phần dựng lại "giao diện thấy gì" nằm ở module riêng `session_replay.rs`. `summarize` chỉ nhận truth và sự kiện, nên:
- **Ngôn ngữ đích không được truyền vào.**
  - LID nhầm sang tiếng đích được nhận ra bằng ngôn ngữ mà phụ đề `same_lang` mang.
  - Chữ dịch được tách đơn vị theo chữ viết (`target_units`): mỗi chữ Hán hay kana là một đơn vị, phần còn lại tách theo khoảng trắng.
- **Khóa của lượt chạy** (`segments`, `busy_ratio`, `cpu_percent`, `partials`) do `session::run` điền vào `Summary`.

Thêm vài điểm:
- Định nghĩa và ánh xạ ở QĐ1–QĐ3.
- VAD là `models/silero_vad_v6.2.3.onnx` ở gốc repo, như app.
- Log của tiến trình phụ nằm cạnh file kết quả (`x.json` thì có `x.asr-worker.log`), vì H9 không có tham số thư mục log.
- Module mới chỉ được dùng ở test cho tới Step 8, nên ở các bước giữa `cargo test` báo cảnh báo `dead_code`. Đó là bình thường.
- Task chỉ commit một lần, ở cuối.

**Files:**
- Create: `crates/latency-bench/src/session_metrics.rs`
- Create: `crates/latency-bench/src/session_replay.rs`
- Create: `crates/latency-bench/src/session.rs`
- Modify: `crates/latency-bench/src/main.rs` (dòng 1, 3–6, 14–21, 33–37)
- Modify: `crates/latency-bench/src/latency.rs`: `ProcessUsage` (dòng 187–197), `repo_root` (763), `public_path` (787), `read_wav_16k_mono` (817), `spawn_sampler` (846), `machine_info` (908)
- Modify: `crates/latency-bench/src/stats.rs` (dòng 27–30)

- [ ] **Step 1: Viết test cho hai module thuần**

`crates/latency-bench/src/main.rs`: thay

```rust
mod mt_eval;
mod stats;
```

bằng

```rust
mod mt_eval;
mod session_metrics;
mod session_replay;
mod stats;
```

Tạo `crates/latency-bench/src/session_replay.rs` chỉ với khối test.
- Module test là `pub(crate)`, vì test của `session_metrics` dùng lại `upsert` và `merged_sentence`.
- `merged_sentence(true)` là chuỗi sự kiện sau A2: bản cũ được giữ.
- `merged_sentence(false)` là chuỗi sự kiện trước A2: bản cũ bị xóa.

```rust
#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use pipeline::subtitle::Delta;

    /// Một upsert lúc `t_ms`.
    pub(crate) fn upsert(
        t_ms: f64,
        id: u64,
        end_ms: u64,
        src: &str,
        tgt: &str,
        status: Status,
        provisional: bool,
    ) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Subtitle(Subtitle {
                id,
                start_ms: 0,
                end_ms,
                src_lang: "en".into(),
                src_text: src.into(),
                tgt_text: tgt.into(),
                status,
                provisional,
                replaces: Vec::new(),
            }),
        }
    }

    pub(crate) fn delta(t_ms: f64, id: u64, text: &str) -> Timed {
        Timed {
            t_ms,
            ev: Recorded::Delta(Delta { id, text: text.into() }),
        }
    }

    /// Câu "so we went" (đoạn tới 2 500 ms) được dịch, rồi ghép thêm "home." (đoạn tới 5 050 ms). `held`: bản dịch cũ còn
    /// hiện trong lúc dịch lại (A2); không thì bị xóa như trước A2.
    pub(crate) fn merged_sentence(held: bool) -> Vec<Timed> {
        let old = if held { "chúng tôi đã đi" } else { "" };
        let mut events = vec![
            upsert(2_600.0, 1, 2_500, "so we went", "", Status::AsrDone, true),
            upsert(2_610.0, 1, 2_500, "so we went", "", Status::Translating, true),
            delta(2_700.0, 1, "chúng tôi"),
            delta(2_750.0, 1, " đã đi"),
            upsert(2_800.0, 1, 2_500, "so we went", "chúng tôi đã đi", Status::Done, true),
            upsert(5_400.0, 1, 5_050, "so we went home.", old, Status::AsrDone, false),
            upsert(5_410.0, 1, 5_050, "so we went home.", old, Status::Translating, false),
        ];
        if held {
            events.push(upsert(
                5_600.0,
                1,
                5_050,
                "so we went home.",
                "chúng tôi về nhà.",
                Status::Translating,
                false,
            ));
        } else {
            events.push(delta(5_600.0, 1, "chúng tôi về nhà."));
        }
        events.push(upsert(
            5_700.0,
            1,
            5_050,
            "so we went home.",
            "chúng tôi về nhà.",
            Status::Done,
            false,
        ));
        events
    }

    #[test]
    fn units_are_words_or_cjk_characters_without_punctuation() {
        assert_eq!(units("Xin chào, thế giới!", "vi"), ["xin", "chào", "thế", "giới"]);
        assert_eq!(units("你好，世界。", "zh"), ["你", "好", "世", "界"]);
        assert_eq!(units("こんにちは 世界", "ja").len(), 7);
        assert_eq!(units("Hello — world ...", "en"), ["hello", "world"]);
        // Dấu tiếng Việt viết tổ hợp (e + dấu mũ + dấu nặng) cho cùng khóa với chữ dựng sẵn.
        assert_eq!(units("Vie\u{0302}\u{0323}t", "vi"), units("Việt", "vi"));
        assert!(units(" ... ", "en").is_empty());
        assert_eq!(target_units("Xin chào, bạn!"), ["xin", "chào", "bạn"]);
        assert_eq!(target_units("你好，世界"), ["你", "好", "世", "界"]);
        assert_eq!(
            target_units("안녕 하세요"),
            ["안녕", "하세요"],
            "tiếng Hàn tách theo từ"
        );
    }

    #[test]
    fn retraction_counts_only_units_that_disappear() {
        assert_eq!(retracted("", "chúng tôi"), 0);
        assert_eq!(retracted("chúng tô", "chúng tôi về"), 0, "từ cuối đang viết dở");
        assert_eq!(retracted("chúng tôi đã đi", ""), 4, "xóa trắng");
        assert_eq!(retracted("chúng tôi đã đi", "chúng tôi về nhà."), 2);
        assert_eq!(retracted("xin chà", "xin chào bạn"), 0);
        assert_eq!(retracted("a b c", "a b cd e"), 0);
        assert_eq!(retracted("a b c", "a b x"), 1);
        assert_eq!(changed_stable_units("chúng tôi đã", "chúng tôi về nhà"), 1);
    }

    #[test]
    fn a_merged_sentence_is_two_pieces_and_the_held_text_belongs_to_the_old_version() {
        let replay = Replay::new(&merged_sentence(true));
        assert_eq!(
            replay.pieces,
            [
                Piece {
                    end_ms: 2_500,
                    units: 3,
                    owners: vec![1]
                },
                Piece {
                    end_ms: 5_050,
                    units: 1,
                    owners: vec![1]
                },
            ]
        );
        let tgt_of: Vec<Option<u64>> = replay.tracks[&1].shown.iter().map(|s| s.tgt_of).collect();
        assert_eq!(
            tgt_of,
            [
                None,
                None,
                Some(2_500),
                Some(2_500),
                Some(2_500),
                Some(2_500), // ghép câu: bản cũ còn hiện
                Some(2_500),
                Some(5_050), // bản mới thay vào
                Some(5_050),
            ]
        );
        let (p0, p1) = (&replay.pieces[0], &replay.pieces[1]);
        assert_eq!(replay.first_text_ms(p0), Some(2_700.0));
        assert_eq!(replay.first_text_ms(p1), Some(5_600.0));
        assert_eq!(replay.done_ms(p0), Some(2_800.0));
        assert_eq!(replay.done_ms(p1), Some(5_700.0));
        assert_eq!(replay.settled_ms(p0), Some(5_700.0), "câu chỉ chốt hẳn ở lần cuối");
        assert_eq!(replay.final_status(p1), Some(Status::Done));
        assert_eq!(replay.final_translated_units(), 4);
        assert_eq!(replay.retracted_units(), 2, "\"đã đi\" bị thay bằng \"về nhà\"");
        assert_eq!(replay.changed_stable_units(), 0);
    }

    #[test]
    fn before_a2_the_merge_erased_the_shown_translation() {
        let replay = Replay::new(&merged_sentence(false));
        assert_eq!(replay.retracted_units(), 4, "bản cũ bị xóa trắng");
        assert_eq!(replay.first_text_ms(&replay.pieces[1]), Some(5_600.0));
    }

    #[test]
    fn a_sentence_merged_in_the_translation_queue_hands_its_pieces_over() {
        let mut absorbing = upsert(9_000.0, 1, 7_000, "One. Two.", "", Status::AsrDone, false);
        if let Recorded::Subtitle(s) = &mut absorbing.ev {
            s.replaces = vec![2];
        }
        let events = vec![
            upsert(4_000.0, 1, 3_000, "One.", "", Status::AsrDone, false),
            upsert(8_000.0, 2, 7_000, "Two.", "", Status::AsrDone, false),
            absorbing,
            upsert(9_500.0, 1, 7_000, "One. Two.", "Một. Hai.", Status::Done, false),
        ];
        let replay = Replay::new(&events);
        assert!(replay.tracks[&2].absorbed);
        assert_eq!(replay.tracks[&1].pieces, [0, 1]);
        let two = &replay.pieces[1];
        assert_eq!((two.end_ms, two.units, two.owners.clone()), (7_000, 1, vec![2, 1]));
        assert_eq!(replay.first_text_ms(two), Some(9_500.0));
        assert_eq!(replay.settled_ms(two), Some(9_500.0));
        assert_eq!(replay.pieces.len(), 2, "câu gộp không thêm phần nào khác");
    }

    #[test]
    fn same_language_and_dropped_sentences() {
        let mut same = upsert(3_000.0, 4, 2_000, "Xin chào", "", Status::SameLang, false);
        if let Recorded::Subtitle(s) = &mut same.ev {
            s.src_lang = "vi".into();
        }
        let events = vec![same, upsert(6_000.0, 5, 5_000, "", "", Status::Dropped, false)];
        let replay = Replay::new(&events);
        let (vi, dropped) = (&replay.pieces[0], &replay.pieces[1]);
        assert_eq!(
            (vi.units, replay.first_text_ms(vi), replay.done_ms(vi)),
            (2, Some(3_000.0), Some(3_000.0))
        );
        assert_eq!(replay.settled_ms(vi), Some(3_000.0));
        assert_eq!(
            (dropped.units, replay.first_text_ms(dropped), replay.done_ms(dropped)),
            (0, None, None)
        );
        assert_eq!(replay.final_status(dropped), Some(Status::Dropped));
        assert_eq!(replay.final_lang(vi), Some("vi"));
    }
}
```

Tạo `crates/latency-bench/src/session_metrics.rs` chỉ với khối test. Các số trong test được tính tay:
- Câu truth 1 000–5 000 ms, bốn từ nói xong lúc 2 000, 3 000, 4 000, 5 000 ms.
- Chữ dịch của ba từ đầu tới lúc 2 700; của từ cuối lúc 5 600, khi bản mới thay vào.
- Câu chốt hẳn lúc 5 700.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::session_replay::tests::{merged_sentence, upsert};

    fn utt(id: &str, lang: &str, start_ms: u64, end_ms: u64, vad_end_ms: Option<u64>) -> Utterance {
        Utterance {
            id: id.into(),
            lang: lang.into(),
            start_ms,
            end_ms,
            vad_end_ms,
            text: String::new(),
        }
    }

    /// Câu tiếng Anh 1 000–5 000 ms, chép thành hai phần ("so we went" tới 2 500, "home." tới 5 050), xem
    /// `merged_sentence`. Bốn từ được nói xong lúc 2 000, 3 000, 4 000, 5 000 ms.
    #[test]
    fn word_lags_follow_the_pieces_of_a_merged_sentence() {
        let u = &evaluate(&[utt("a", "en", 1_000, 5_000, Some(5_050))], &merged_sentence(true))[0];
        assert_eq!(u.units, 4);
        // Ba từ đầu có chữ dịch lúc 2 700, từ cuối lúc bản mới thay vào (5 600).
        assert_eq!(u.word_lag_tentative_ms, [700.0, -300.0, -1_300.0, 600.0]);
        // Tầng ổn định: câu chốt hẳn lúc 5 700.
        assert_eq!(u.word_lag_stable_ms, [3_700.0, 2_700.0, 1_700.0, 700.0]);
        assert_eq!(u.first_from_start_ms, Some(1_700.0));
        // A2: phần gần mốc cuối câu nhất là phần thứ hai (5 050).
        assert_eq!((u.a2_shown_ms, u.a2_first_ms), (Some(700.0), Some(600.0)));
        assert!(!u.lid_to_target);
    }

    #[test]
    fn same_language_sentences_count_but_a_lid_error_into_the_target_does_not() {
        let mut vi = upsert(3_000.0, 1, 2_000, "Xin chào", "", Status::SameLang, false);
        let mut wrong = upsert(5_600.0, 2, 5_000, "Hello there", "", Status::SameLang, false);
        for e in [&mut vi, &mut wrong] {
            if let Recorded::Subtitle(s) = &mut e.ev {
                s.src_lang = "vi".into();
            }
        }
        let truth = [utt("vi", "vi", 0, 2_000, None), utt("en", "en", 4_000, 5_000, None)];
        let all = evaluate(&truth, &[vi, wrong]);
        assert_eq!((all[0].a2_shown_ms, all[0].a2_first_ms), (Some(1_000.0), Some(1_000.0)));
        assert_eq!(all[0].word_lag_tentative_ms, [2_000.0, 1_000.0]);
        assert_eq!(all[0].word_lag_stable_ms, [2_000.0, 1_000.0]);
        assert!(all[1].lid_to_target);
        assert_eq!((all[1].a2_shown_ms, all[1].first_from_start_ms), (None, None));
        assert_eq!(all[1].units, 2);
        assert!(
            all[1].word_lag_tentative_ms.is_empty(),
            "câu gốc sai ngôn ngữ không phải bản dịch"
        );
    }

    #[test]
    fn an_utterance_without_any_piece_has_no_numbers() {
        let u = &evaluate(&[utt("x", "en", 20_000, 25_000, None)], &merged_sentence(true))[0];
        assert_eq!((u.units, u.a2_shown_ms, u.first_from_start_ms), (0, None, None));
        assert!(u.word_lag_tentative_ms.is_empty());
    }

    #[test]
    fn the_summary_has_the_keys_of_h7() {
        let s = summarize(&[utt("a", "en", 1_000, 5_000, Some(5_050))], &merged_sentence(true));
        assert_eq!(
            (s.a2_p50_ms, s.a2_p90_ms, s.a2_first_p50_ms),
            (Some(700.0), Some(700.0), Some(600.0))
        );
        assert_eq!(
            (s.first_from_start_p50_ms, s.first_from_start_p90_ms),
            (Some(1_700.0), Some(1_700.0))
        );
        // Tạm: −1 300, −300, 600, 700. Ổn định: 700, 1 700, 2 700, 3 700.
        assert_eq!(
            (s.word_lag_tentative_p50_ms, s.word_lag_tentative_p90_ms),
            (Some(150.0), Some(670.0))
        );
        assert_eq!(
            (s.word_lag_stable_p50_ms, s.word_lag_stable_p90_ms),
            (Some(2_200.0), Some(3_400.0))
        );
        assert_eq!(
            (s.stable_flicker_ratio, s.tentative_erasure_ratio),
            (Some(0.0), Some(0.5))
        );
        assert_eq!(s.utterances, Some(1.0));
        // Khóa của lượt chạy do `session::run` điền.
        assert_eq!(
            (s.busy_ratio, s.cpu_percent, s.segments, s.partials),
            (None, None, None, None)
        );
        assert_eq!((s.cadence_p50_ms, s.streaming_auto_off), (None, None));
        let keys: Vec<String> = serde_json::to_value(&s)
            .unwrap()
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        assert_eq!(keys.len(), 18, "{keys:?}");
        // Chưa có câu nào dịch xong: hai tỉ lệ nháy không có mẫu số.
        let empty = summarize(&[], &[]);
        assert_eq!(
            (empty.tentative_erasure_ratio, empty.a2_p50_ms, empty.utterances),
            (None, None, Some(0.0))
        );
    }

    #[test]
    fn events_serialize_with_their_kind() {
        let json = serde_json::to_value(&merged_sentence(true)[..3]).unwrap();
        assert_eq!(
            (json[0]["kind"].as_str(), json[0]["id"].as_u64()),
            (Some("subtitle"), Some(1))
        );
        assert_eq!(
            (json[2]["kind"].as_str(), json[2]["text"].as_str()),
            (Some("delta"), Some("chúng tôi"))
        );
        assert_eq!(json[2]["t_ms"].as_f64(), Some(2_700.0));
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench session_
```

Expected: lỗi biên dịch, vì chưa có `Replay`, `units`, `Timed`, `Recorded`, `evaluate`, `summarize`, `Utterance`…

- [ ] **Step 3: Cài `session_metrics`: kiểu của H9, `evaluate`, `summarize`**

Chèn vào đầu `crates/latency-bench/src/session_metrics.rs`:

```rust
//! Chỉ số của `latency-bench session` (spec 2026-10-10 §10.1; H7, H9 của kế hoạch 00), tính từ các sự kiện mà engine gửi
//! cho giao diện (`Timed`) và mốc thật của từng câu (`*.truth.json`). Toàn hàm thuần, test bằng sự kiện tổng hợp; việc
//! dựng lại giao diện thấy gì nằm ở `session_replay`.
//!
//! - **Thời điểm nói của từ:** chia đều `start_ms`–`end_ms` của câu trong truth cho các đơn vị của bản chép cuối của câu
//!   (các phần có mốc cuối nằm trong câu, `pieces_of`). Đơn vị thứ i (từ 0) được nói xong lúc
//!   `start_ms + (i + 1) × (end_ms − start_ms) / n`, như nghiên cứu (`stream_sim.py`).
//! - **Chế độ thường** (không có dòng đang nói): tầng tạm của một từ là lần đầu một phụ đề phủ tới từ đó có chữ dịch
//!   (`Replay::first_text_ms`); tầng ổn định là lúc phụ đề phủ tới từ đó chốt (`done`, không còn `provisional`) và không
//!   bị thay sau đó (`Replay::settled_ms`).
//! - **A2** tính như `latency`: ghép câu với phần có mốc cuối gần nhất (trong 1 giây), đo từ `end_ms` của câu tới lúc
//!   bản dịch của phiên bản có phần đó hiện đủ (`a2_*`) và hiện chữ đầu tiên (`a2_first_*`). LID nhầm sang ngôn ngữ đích
//!   (`same_lang` mà câu thật là tiếng khác) thì không tính, và các từ của câu đó coi như chưa được dịch.

use crate::session_replay::{Piece, Replay};
use crate::stats::{Utterance, match_segments, percentile};
use pipeline::engine::Indicators;
use pipeline::subtitle::{Delta, Status, Subtitle};
use serde::Serialize;

/// Cửa sổ ghép câu thật với phần có mốc cuối gần nhất, như `latency` (A2).
const MATCH_WINDOW_MS: u64 = 1_000;
/// Phần có mốc cuối trong `[start_ms, max(end_ms, vad_end_ms) + PIECE_TAIL_MS]` của một câu thì thuộc câu đó. Khoảng lặng
/// giữa hai câu của S6 từ 416 ms trở lên, nên 300 ms không lấn sang câu sau.
const PIECE_TAIL_MS: u64 = 300;

/// Một sự kiện engine gửi cho giao diện, đúng như `EventSink` nhận (H9). Kế hoạch 02 thêm `Live`, `LiveEnd`. Trong file
/// JSON, mỗi sự kiện là một object có `t_ms`, `kind` và các trường của sự kiện.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Recorded {
    /// `subtitle://upsert`.
    Subtitle(Subtitle),
    /// `subtitle://delta`.
    Delta(Delta),
    /// Chỉ báo của thanh phụ đề (`app://status`).
    Indicators(Indicators),
}

/// Sự kiện kèm thời điểm, ms từ lúc bắt đầu phát WAV (giờ thật).
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Timed {
    pub t_ms: f64,
    #[serde(flatten)]
    pub ev: Recorded,
}

/// Các khóa `summary` của H7: ms làm tròn 0,1, tỉ lệ làm tròn 4 chữ số, không có số thì `None` (JSON `null`).
/// `summarize` điền các khóa tính từ truth và sự kiện; `session::run` điền các khóa của lượt chạy (`segments`,
/// `busy_ratio`, `cpu_percent`, `partials`; kế hoạch 02 thêm `cadence_p50_ms`, `streaming_auto_off`).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Summary {
    pub a2_p50_ms: Option<f64>,
    pub a2_p90_ms: Option<f64>,
    pub a2_first_p50_ms: Option<f64>,
    pub first_from_start_p50_ms: Option<f64>,
    pub first_from_start_p90_ms: Option<f64>,
    pub word_lag_tentative_p50_ms: Option<f64>,
    pub word_lag_tentative_p90_ms: Option<f64>,
    pub word_lag_stable_p50_ms: Option<f64>,
    pub word_lag_stable_p90_ms: Option<f64>,
    pub stable_flicker_ratio: Option<f64>,
    pub tentative_erasure_ratio: Option<f64>,
    pub busy_ratio: Option<f64>,
    pub cpu_percent: Option<f64>,
    pub utterances: Option<f64>,
    pub segments: Option<f64>,
    pub partials: Option<f64>,
    pub cadence_p50_ms: Option<f64>,
    pub streaming_auto_off: Option<f64>,
}

/// Kết quả của một câu trong truth (khóa `utterances` của file JSON).
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct UtteranceResult {
    pub id: String,
    pub lang: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Số đơn vị của bản chép cuối của câu.
    pub units: usize,
    pub a2_shown_ms: Option<f64>,
    pub a2_first_ms: Option<f64>,
    pub first_from_start_ms: Option<f64>,
    pub word_lag_tentative_ms: Vec<f64>,
    pub word_lag_stable_ms: Vec<f64>,
    pub lid_to_target: bool,
}

/// Làm tròn tới 0,1 ms.
pub fn ms(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

/// Làm tròn tỉ lệ tới 4 chữ số thập phân.
pub fn ratio4(v: f64) -> f64 {
    (v * 1e4).round() / 1e4
}

/// Các phần thuộc câu `u`, theo thứ tự thời gian.
fn pieces_of<'a>(u: &Utterance, pieces: &'a [Piece]) -> Vec<&'a Piece> {
    let last = u.vad_end_ms.unwrap_or(u.end_ms).max(u.end_ms) + PIECE_TAIL_MS;
    let mut mine: Vec<&Piece> = pieces
        .iter()
        .filter(|p| (u.start_ms..=last).contains(&p.end_ms))
        .collect();
    mine.sort_by_key(|p| p.end_ms);
    mine
}

/// Kết quả của từng câu trong truth.
pub fn evaluate(truth: &[Utterance], events: &[Timed]) -> Vec<UtteranceResult> {
    evaluate_replay(truth, &Replay::new(events))
}

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
            let mut i = 0usize;
            for p in &mine {
                let tentative = replay.first_text_ms(p).filter(|_| !wrong_lang(p));
                let stable = replay.settled_ms(p).filter(|_| !wrong_lang(p));
                for _ in 0..p.units {
                    let spoken = u.start_ms as f64 + (i + 1) as f64 * span / n as f64;
                    if let Some(t) = tentative {
                        out.word_lag_tentative_ms.push(ms(t - spoken));
                    }
                    if let Some(t) = stable {
                        out.word_lag_stable_ms.push(ms(t - spoken));
                    }
                    i += 1;
                }
            }
            out.first_from_start_ms = mine
                .iter()
                .filter(|p| !wrong_lang(p))
                .filter_map(|p| replay.first_text_ms(p))
                .min_by(f64::total_cmp)
                .map(|t| ms(t - u.start_ms as f64));
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

/// Các khóa `summary` tính được từ truth và sự kiện (H9). Khóa của lượt chạy để `None`; `session::run` điền.
pub fn summarize(truth: &[Utterance], events: &[Timed]) -> Summary {
    let replay = Replay::new(events);
    let utterances = evaluate_replay(truth, &replay);
    let col = |f: fn(&UtteranceResult) -> Option<f64>| -> Vec<f32> {
        utterances.iter().filter_map(f).map(|v| v as f32).collect()
    };
    let words = |f: fn(&UtteranceResult) -> &Vec<f64>| -> Vec<f32> {
        utterances.iter().flat_map(|u| f(u).iter().map(|&v| v as f32)).collect()
    };
    let (shown, first, from_start) = (
        col(|u| u.a2_shown_ms),
        col(|u| u.a2_first_ms),
        col(|u| u.first_from_start_ms),
    );
    let (tentative, stable) = (words(|u| &u.word_lag_tentative_ms), words(|u| &u.word_lag_stable_ms));
    let pct = |v: &[f32], p: f32| percentile(v, p).map(|x| ms(f64::from(x)));
    let final_units = replay.final_translated_units();
    let ratio = |n: usize| (final_units > 0).then(|| ratio4(n as f64 / final_units as f64));
    Summary {
        a2_p50_ms: pct(&shown, 50.0),
        a2_p90_ms: pct(&shown, 90.0),
        a2_first_p50_ms: pct(&first, 50.0),
        first_from_start_p50_ms: pct(&from_start, 50.0),
        first_from_start_p90_ms: pct(&from_start, 90.0),
        word_lag_tentative_p50_ms: pct(&tentative, 50.0),
        word_lag_tentative_p90_ms: pct(&tentative, 90.0),
        word_lag_stable_p50_ms: pct(&stable, 50.0),
        word_lag_stable_p90_ms: pct(&stable, 90.0),
        stable_flicker_ratio: ratio(replay.changed_stable_units()),
        tentative_erasure_ratio: ratio(replay.retracted_units()),
        utterances: Some(truth.len() as f64),
        ..Summary::default()
    }
}
```

- [ ] **Step 4: Cài `session_replay`: đơn vị, khóa, `Replay`**

Các luật:
- **Đơn vị và khóa của chữ nguồn** theo spec §3, dùng `pipeline::glossary::normalize` (NFC, chữ thường), rồi chỉ giữ chữ và số.
- **Đơn vị của chữ dịch:** `target_units`, xem đầu task.
- **`tgt_of`** theo QĐ2:
  - upsert có chữ dịch y như lần hiện trước (bản đang giữ khi ghép câu, hay chỉ đổi trạng thái) thì giữ phiên bản cũ;
  - delta, upsert có chữ khác, hay trạng thái cuối thì thuộc phiên bản hiện tại.
- **Độ nháy của tầng tạm:** chỉ nối thêm thì không có gì bị rút lại, kể cả khi từ cuối đang viết dở.
- **Độ nháy của tầng ổn định:** ở chế độ thường, tầng này chính là phụ đề đã chốt, nên luôn là 0. Kế hoạch 02 thêm các quan sát của dòng đang nói.

Chèn vào đầu `crates/latency-bench/src/session_replay.rs`:

```rust
//! Dựng lại những gì giao diện thấy từ các sự kiện của engine (`latency-bench session`, spec 2026-10-10 §10.1): mỗi phụ
//! đề hiện gì và lúc nào, bản dịch đang hiện được dịch từ phiên bản câu nào, và chữ nguồn của câu gồm những phần nào.
//!
//! - **Phần (`Piece`)**: mỗi lần một phụ đề có `end_ms` mới (câu mới, câu được ghép thêm đoạn §6.3) là một phần chữ nguồn
//!   mới, mốc cuối là `end_ms` đó. Câu gộp ở hàng đợi dịch (§7, `replaces`) nhận luôn các phần của các câu bị gộp.
//! - **Bản dịch thuộc phiên bản nào (`Shown::tgt_of`)**: upsert đổi `end_ms` mà giữ nguyên chữ dịch là bản dịch cũ đang
//!   được giữ (A2); chữ dịch mới (delta, upsert có chữ khác, trạng thái cuối) là của phiên bản hiện tại.

use crate::session_metrics::{Recorded, Timed};
use pipeline::glossary::normalize;
use pipeline::subtitle::{Status, Subtitle};
use std::collections::BTreeMap;

/// Khóa so khớp của các đơn vị trong `text` (spec 2026-10-10 §3): một chữ với tiếng Trung và tiếng Nhật, một từ (tách theo
/// khoảng trắng) với tiếng khác. Khóa là dạng NFC, chữ thường, chỉ giữ chữ và số; đơn vị không còn gì (chỉ có dấu câu
/// hay ký hiệu) thì bỏ.
pub fn units(text: &str, lang: &str) -> Vec<String> {
    let text = normalize(text);
    let raw: Vec<String> = if matches!(lang, "zh" | "ja") {
        text.chars().filter(|c| !c.is_whitespace()).map(String::from).collect()
    } else {
        text.split_whitespace().map(String::from).collect()
    };
    raw.iter()
        .map(|u| u.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|k| !k.is_empty())
        .collect()
}

/// Chữ Hán và kana: mỗi chữ là một đơn vị (tiếng Trung, tiếng Nhật). Hangul không thuộc nhóm này (tiếng Hàn tách theo từ).
fn is_han_or_kana(c: char) -> bool {
    matches!(c,
        '\u{3005}'..='\u{3007}'
        | '\u{3040}'..='\u{30FF}'
        | '\u{31F0}'..='\u{31FF}'
        | '\u{3400}'..='\u{4DBF}'
        | '\u{4E00}'..='\u{9FFF}'
        | '\u{F900}'..='\u{FAFF}'
        | '\u{FF66}'..='\u{FF9F}'
        | '\u{20000}'..='\u{323AF}'
    )
}

/// Khóa so khớp của chữ dịch, khi không biết ngôn ngữ đích (`summarize` chỉ nhận truth và sự kiện, H9): mỗi chữ Hán hay
/// kana là một đơn vị, phần còn lại tách theo khoảng trắng. Với đích tiếng Việt, tiếng Anh thì ra đúng như `units`.
pub fn target_units(text: &str) -> Vec<String> {
    let mut spaced = String::new();
    for c in normalize(text).chars() {
        if is_han_or_kana(c) {
            spaced.push(' ');
            spaced.push(c);
            spaced.push(' ');
        } else {
            spaced.push(c);
        }
    }
    spaced
        .split_whitespace()
        .map(|u| u.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
        .filter(|k| !k.is_empty())
        .collect()
}

/// Độ dài phần đầu chung của hai dãy khóa.
pub fn lcp(a: &[String], b: &[String]) -> usize {
    a.iter().zip(b).take_while(|(x, y)| x == y).count()
}

/// Số đơn vị của `old` bị rút lại khi chữ đang hiện đổi thành `new` (§10.1, độ nháy của tầng tạm). Chữ chỉ được nối thêm
/// (delta) thì không có gì bị rút lại, kể cả khi từ cuối đang viết dở ("tô" thành "tôi").
pub fn retracted(old: &str, new: &str) -> usize {
    if new.starts_with(old) {
        return 0;
    }
    let (a, b) = (target_units(old), target_units(new));
    let k = lcp(&a, &b);
    let last_grows = k + 1 == a.len() && b.get(k).is_some_and(|u| u.starts_with(a[k].as_str()));
    a.len() - k - usize::from(last_grows)
}

/// Số đơn vị của phần dịch đã ổn định `stable` mà bản cuối `final_text` thay đổi (§10.1, độ nháy của tầng ổn định).
pub fn changed_stable_units(stable: &str, final_text: &str) -> usize {
    let (a, b) = (target_units(stable), target_units(final_text));
    a.len() - lcp(&a, &b)
}

/// Một phần chữ nguồn của câu.
#[derive(Clone, Debug, PartialEq)]
pub struct Piece {
    /// Mốc cuối tiếng nói của phần (giờ âm thanh, ms).
    pub end_ms: u64,
    /// Số đơn vị nguồn phần này thêm vào câu.
    pub units: usize,
    /// Các phụ đề lần lượt chứa phần này: phụ đề đầu tiên, rồi phụ đề đã gộp nó ở hàng đợi dịch.
    pub owners: Vec<u64>,
}

/// Trạng thái hiện của một phụ đề ngay sau một sự kiện.
#[derive(Clone, Debug, PartialEq)]
pub struct Shown {
    pub t_ms: f64,
    pub end_ms: u64,
    pub status: Status,
    pub provisional: bool,
    pub tgt: String,
    /// `end_ms` của phiên bản câu mà chữ dịch đang hiện được dịch từ đó; `None` khi chưa hiện chữ dịch nào.
    pub tgt_of: Option<u64>,
}

/// Lịch sử của một phụ đề.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Track {
    pub src_lang: String,
    pub src_text: String,
    pub shown: Vec<Shown>,
    /// Chỉ số (trong `Replay::pieces`) các phần của câu, theo thứ tự trong chữ nguồn.
    pub pieces: Vec<usize>,
    /// Đã bị gộp vào phụ đề khác (`replaces`): không còn trên màn hình.
    pub absorbed: bool,
}

/// Trạng thái kết thúc phần dịch của một phụ đề.
const FINAL: [Status; 5] = [
    Status::Done,
    Status::Failed,
    Status::Skipped,
    Status::SameLang,
    Status::Dropped,
];

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Replay {
    pub tracks: BTreeMap<u64, Track>,
    /// Mọi phần, theo thứ tự xuất hiện.
    pub pieces: Vec<Piece>,
}

impl Replay {
    pub fn new(events: &[Timed]) -> Self {
        let mut replay = Self::default();
        for e in events {
            match &e.ev {
                Recorded::Subtitle(s) => replay.upsert(e.t_ms, s),
                Recorded::Delta(d) => replay.delta(e.t_ms, d.id, &d.text),
                Recorded::Indicators(_) => {}
            }
        }
        replay
    }

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
        let n = units(&s.src_text, &s.src_lang).len();
        let counted: usize = track.pieces.iter().map(|&i| self.pieces[i].units).sum();
        let last_end = track.pieces.last().map(|&i| self.pieces[i].end_ms);
        if last_end.is_none_or(|e| s.end_ms > e) || n > counted {
            self.pieces.push(Piece {
                end_ms: s.end_ms,
                units: n.saturating_sub(counted),
                owners: vec![s.id],
            });
            track.pieces.push(self.pieces.len() - 1);
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

    fn delta(&mut self, t_ms: f64, id: u64, text: &str) {
        let Some(track) = self.tracks.get_mut(&id) else { return };
        let Some(last) = track.shown.last().cloned() else {
            return;
        };
        track.shown.push(Shown {
            t_ms,
            tgt: format!("{}{text}", last.tgt),
            tgt_of: Some(last.end_ms),
            ..last
        });
    }

    /// Lần đầu (ms) một phụ đề chứa phần `p` hiện chữ dịch được dịch từ phiên bản có phần đó, hay hiện câu gốc vì câu đã
    /// là ngôn ngữ đích. Đây là tầng tạm ở chế độ thường.
    pub fn first_text_ms(&self, p: &Piece) -> Option<f64> {
        self.earliest(p, |s| {
            s.status == Status::SameLang || s.tgt_of.is_some_and(|v| v >= p.end_ms)
        })
    }

    /// Lần đầu (ms) bản dịch của một phiên bản có phần `p` hiện đủ (`done`), hay câu gốc hiện vì câu đã là ngôn ngữ đích
    /// (A2).
    pub fn done_ms(&self, p: &Piece) -> Option<f64> {
        self.earliest(p, |s| matches!(s.status, Status::Done | Status::SameLang))
    }

    fn earliest(&self, p: &Piece, hit: impl Fn(&Shown) -> bool) -> Option<f64> {
        p.owners
            .iter()
            .filter_map(|id| self.tracks.get(id))
            .filter_map(|t| t.shown.iter().find(|s| s.end_ms >= p.end_ms && hit(s)).map(|s| s.t_ms))
            .min_by(f64::total_cmp)
    }

    /// Lúc phụ đề cuối cùng chứa phần `p` chốt hẳn: `done` hay `same_lang`, không còn `provisional`, và không đổi gì sau
    /// đó. Đây là tầng ổn định ở chế độ thường. `None` nếu câu kết thúc mà không có bản dịch hay câu gốc để hiện.
    pub fn settled_ms(&self, p: &Piece) -> Option<f64> {
        let track = self.tracks.get(p.owners.last()?)?;
        let last = track.shown.last()?;
        (!track.absorbed && !last.provisional && matches!(last.status, Status::Done | Status::SameLang))
            .then_some(last.t_ms)
    }

    /// Trạng thái cuối của phụ đề cuối cùng chứa phần `p`.
    pub fn final_status(&self, p: &Piece) -> Option<Status> {
        self.tracks.get(p.owners.last()?)?.shown.last().map(|s| s.status)
    }

    /// Ngôn ngữ nguồn (LID chọn) của phụ đề cuối cùng chứa phần `p`.
    pub fn final_lang(&self, p: &Piece) -> Option<&str> {
        self.tracks.get(p.owners.last()?).map(|t| t.src_lang.as_str())
    }

    /// Phụ đề còn trên màn hình lúc kết thúc mà có bản dịch xong.
    fn translated(&self) -> impl Iterator<Item = &Shown> {
        self.tracks
            .values()
            .filter(|t| !t.absorbed)
            .filter_map(|t| t.shown.last())
            .filter(|s| s.status == Status::Done)
    }

    /// Số đơn vị của mọi bản dịch cuối: mẫu số của hai tỉ lệ nháy (§10.1).
    pub fn final_translated_units(&self) -> usize {
        self.translated().map(|s| target_units(&s.tgt).len()).sum()
    }

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
}
```

- [ ] **Step 5: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench session_
```

Expected: 11 test (`session_replay` 6, `session_metrics` 5) đều `ok`. Có cảnh báo `dead_code` (xem đầu task).

- [ ] **Step 6: Viết test cho lệnh `session`**

`crates/latency-bench/src/main.rs`: thay

```rust
//! Công cụ đo: `latency` (S6), `asr-eval` (S7, A4), `mt-eval` (A3, qua đúng code dịch của app).

mod asr_eval;
mod latency;
mod mt_eval;
mod session_metrics;
```

bằng

```rust
//! Công cụ đo: `latency` (S6), `asr-eval` (S7, A4), `mt-eval` (A3, qua đúng code dịch của app), `session` (đo bằng
//! `pipeline::Engine` thật, spec 2026-10-10 §10.1).

mod asr_eval;
mod latency;
mod mt_eval;
mod session;
mod session_metrics;
```

thay

```rust
    /// Dịch bộ test A3 bằng code dịch của app, để score_mt.py chấm COMET.
    MtEval(mt_eval::MtEvalArgs),
}
```

bằng

```rust
    /// Dịch bộ test A3 bằng code dịch của app, để score_mt.py chấm COMET.
    MtEval(mt_eval::MtEvalArgs),
    /// Đo độ trễ bằng `pipeline::Engine` thật trên một session phát lại theo thời gian thực (spec 2026-10-10 §10.1).
    Session(session::SessionArgs),
}
```

và thay

```rust
            Command::MtEval(args) => mt_eval::run(args),
```

bằng

```rust
            Command::MtEval(args) => mt_eval::run(args),
            Command::Session(args) => session::run(args),
```

Tạo `crates/latency-bench/src/session.rs` chỉ với khối test. Test đầu tiên giữ đúng cách dựng tiến trình phụ của app:
- chỉ nhận chế độ giải mã B;
- một bản `asr-worker` cho cả GPU lẫn CPU;
- đường dẫn tuyệt đối, vì tiến trình phụ chạy trong thư mục chứa binary của nó (`current_dir` trong `asr_client::command` và `llama::command`), nên đường dẫn tương đối hỏng (đã gặp khi dựng thử kế hoạch);
- log cạnh file kết quả;
- ngưỡng mặc định 50 ms như app.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use clap::Parser;

    #[derive(Parser)]
    struct Cli {
        #[command(flatten)]
        args: SessionArgs,
    }

    fn args(extra: &[&str]) -> SessionArgs {
        let base = [
            "latency-bench",
            "--wav",
            "s.wav",
            "--truth",
            "s.truth.json",
            "--asr-worker",
            "bin/asr-worker",
            "--asr-model",
            "models/a.bin",
            "--llama-server",
            "bin/llama-server",
            "--mt-model",
            "models/m.gguf",
            "--out",
            "out/x.json",
        ];
        Cli::parse_from(base.iter().chain(extra)).args
    }

    /// Dựng như app trên macOS: chỉ nhận chế độ giải mã B, một bản `asr-worker` cho cả GPU và CPU, đường dẫn tuyệt đối (tiến
    /// trình phụ chạy trong thư mục chứa binary), log theo tên file kết quả. Mặc định: ngưỡng 50 ms như app.
    #[test]
    fn the_sidecars_are_set_up_like_the_app() {
        let a = args(&[]);
        assert_eq!(a.end_silence_ms, 50);
        assert_eq!(a.languages, ["en", "zh", "ja", "ko", "vi"]);
        let spec = sidecar_spec(&a);
        assert!(spec.asr.require_shared);
        assert_eq!(spec.asr.exe_gpu.as_ref(), Some(&spec.asr.exe_cpu));
        for p in [
            &spec.asr.exe_cpu,
            &spec.asr.model,
            &spec.llama.exe,
            &spec.llama.model,
            &spec.asr.log,
        ] {
            assert!(p.is_absolute(), "{}", p.display());
        }
        assert!(spec.asr.log.ends_with("out/x.asr-worker.log"));
        assert!(spec.llama.log.ends_with("out/x.llama-server.log"));
        assert!(spec.llama.extra_args.is_empty());
        assert_eq!(spec.mt_config, MtConfig::default());
        assert_eq!(args(&["--end-silence-ms", "400"]).end_silence_ms, 400);
    }

    #[test]
    fn the_recorder_keeps_events_in_order_and_fatal_errors_apart() {
        let recorder = Recorder::new(Instant::now());
        recorder.delta(&Delta {
            id: 3,
            text: "Xin".into(),
        });
        recorder.level(0.5);
        recorder.indicators(&Indicators::default());
        recorder.fatal(Fatal::Asr, "hỏng");
        let (events, fatal) = recorder.take();
        assert_eq!(events.len(), 2, "mức âm lượng không được ghi");
        assert!(matches!(events[0].ev, Recorded::Delta(_)));
        assert!(matches!(events[1].ev, Recorded::Indicators(_)));
        assert!(events[0].t_ms <= events[1].t_ms);
        assert_eq!(fatal, ["Asr: hỏng"]);
    }

    #[test]
    fn the_paced_source_releases_one_frame_every_32_ms() {
        let lag = Arc::new(AtomicU64::new(0));
        let origin = Instant::now();
        let mut source = Paced::new(vec![0.1; FRAME_SAMPLES * 3], origin, lag.clone());
        let mut out = Vec::new();
        for _ in 0..3 {
            assert!(source.read(&mut out, Duration::from_millis(20)).unwrap());
        }
        let elapsed = origin.elapsed();
        assert_eq!(out.len(), FRAME_SAMPLES * 3);
        assert!(elapsed >= Duration::from_millis(96), "{elapsed:?}");
        assert!(elapsed < Duration::from_secs(2), "{elapsed:?}");
        assert!(!source.read(&mut out, Duration::from_millis(20)).unwrap(), "hết mẫu");
    }

    #[test]
    fn machine_cpu_is_the_sum_over_the_logical_cores() {
        let usage = HashMap::from([
            (
                "asr-worker".to_string(),
                ProcessUsage {
                    avg_cpu_percent: 30.0,
                    ..ProcessUsage::default()
                },
            ),
            (
                "llama-server".to_string(),
                ProcessUsage {
                    avg_cpu_percent: 10.0,
                    ..ProcessUsage::default()
                },
            ),
        ]);
        assert_eq!(machine_cpu_percent(&usage, 8), Some(5.0));
        assert_eq!(machine_cpu_percent(&usage, 0), None);
        assert_eq!(machine_cpu_percent(&HashMap::new(), 8), None);
    }

    #[test]
    fn the_worker_flags_are_the_last_line_written() {
        let dir = std::env::temp_dir().join(format!("latency-bench-session-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let log = dir.join("x.asr-worker.log");
        std::fs::write(
            &log,
            "whisper_init_state: …\nasr-worker: backend=metal flash_attn=off decode_mode=shared\nasr-worker: \
             primer=off\nasr-worker: backend=metal flash_attn=on decode_mode=shared\nggml_metal_free: deallocating\n",
        )
        .unwrap();
        assert_eq!(
            worker_flags(&log).as_deref(),
            Some("asr-worker: backend=metal flash_attn=on decode_mode=shared")
        );
        assert_eq!(worker_flags(&dir.join("khong-co.log")), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
```

- [ ] **Step 7: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench session::
```

Expected: lỗi biên dịch, vì chưa có `SessionArgs`, `session::run`, `sidecar_spec`, `Recorder`, `Paced`…

- [ ] **Step 8: Cài lệnh `session`**

`crates/latency-bench/src/latency.rs`: mở các hàm và kiểu mà `session` dùng chung. Thay

```rust
#[derive(Serialize, Default)]
struct ProcessUsage {
    peak_rss_mb: f64,
```

bằng

```rust
#[derive(Serialize, Default)]
pub(crate) struct ProcessUsage {
    pub(crate) peak_rss_mb: f64,
```

thay

```rust
    peak_footprint_mb: f64,
    /// CPU trung bình trong lúc phát lại, phần trăm của một lõi: thời gian CPU tích lũy chia thời gian thực.
    avg_cpu_percent: f64,
    samples: usize,
}
```

bằng

```rust
    pub(crate) peak_footprint_mb: f64,
    /// CPU trung bình trong lúc phát lại, phần trăm của một lõi: thời gian CPU tích lũy chia thời gian thực.
    pub(crate) avg_cpu_percent: f64,
    pub(crate) samples: usize,
}
```

rồi thay năm dòng khai báo hàm sau, mỗi dòng bằng chính nó có thêm `pub(crate) ` ở đầu:

| Dòng cũ | Dòng mới |
|---|---|
| `fn repo_root() -> Option<PathBuf> {` | `pub(crate) fn repo_root() -> Option<PathBuf> {` |
| `fn public_path(path: &Path) -> String {` | `pub(crate) fn public_path(path: &Path) -> String {` |
| `fn read_wav_16k_mono(path: &PathBuf) -> Result<Vec<f32>> {` | `pub(crate) fn read_wav_16k_mono(path: &PathBuf) -> Result<Vec<f32>> {` |
| `fn spawn_sampler(` | `pub(crate) fn spawn_sampler(` |
| `fn machine_info() -> HashMap<String, String> {` | `pub(crate) fn machine_info() -> HashMap<String, String> {` |

`crates/latency-bench/src/stats.rs`: file mốc của `tests/fixtures/audio/` dùng trường `ref`, không có `text`; công cụ đo không dùng chữ này. Thay

```rust
    #[serde(default)]
    pub vad_end_ms: Option<u64>,
    pub text: String,
}
```

bằng

```rust
    #[serde(default)]
    pub vad_end_ms: Option<u64>,
    /// Chữ của câu. Không có trong file mốc của `tests/fixtures/audio/` (trường `ref`), nên mặc định rỗng: công cụ đo không
    /// dùng chữ này.
    #[serde(default)]
    pub text: String,
}
```

Chèn vào đầu `crates/latency-bench/src/session.rs`:

```rust
//! `latency-bench session` (spec 2026-10-10 §8 A1, §10.1; H7 của kế hoạch 00): chạy đúng `pipeline::Engine` của app trên
//! một session S6, phát WAV theo thời gian thực, với `asr-worker` và `llama-server` thật qua `SidecarManager` (dựng như
//! `src-tauri/src/sidecar/mod.rs` trên macOS: chế độ giải mã B bắt buộc, cấu hình mặc định), ghi mọi sự kiện kèm giờ thật
//! rồi tính các chỉ số của §10.1.
//!
//! Khác `latency` (S6 cũ): không mô phỏng luồng nào, mọi luật (cắt đoạn, ghép câu, hàng đợi, hủy, hậu xử lý) là code của
//! app. Đầu ra là JSON có `args`, `machine`, `usage`, `summary`, `run`, `utterances`, `events`. Log của hai tiến trình phụ
//! nằm cạnh file kết quả: `<tên>.asr-worker.log`, `<tên>.llama-server.log`.

use crate::latency::{ProcessUsage, machine_info, public_path, read_wav_16k_mono, repo_root, spawn_sampler};
use crate::session_metrics::{Recorded, Summary, Timed, UtteranceResult, evaluate, ms, ratio4, summarize};
use crate::stats::{Utterance, percentile};
use anyhow::{Context, Result, anyhow, bail};
use asr_protocol::{TranscribeRequest, TranscribeResult};
use pipeline::config::{AsrConfig, MtConfig, PipelineConfig, SupervisorConfig};
use pipeline::engine::{Engine, EngineConfig, EventSink, Fatal, FrameSource, Indicators, SampleSource, VadModel};
use pipeline::llama::{ChatRequest, StreamEnd};
use pipeline::prompt::Lang;
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES};
use pipeline::subtitle::{Delta, Subtitle};
use pipeline::supervisor::{
    Asr, AsrFailure, AsrSpec, LlamaSpec, SidecarEvent, SidecarEvents, SidecarManager, SidecarSpec, SystemClock, Which,
};
use pipeline::translate::{Mt, MtError};
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::collections::{BTreeMap, HashMap};
use std::ops::ControlFlow;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Phát lại chậm hơn lịch quá ngưỡng này (ms) thì số đo lệch cùng cỡ: báo cho người chạy (như `latency`).
const FEED_LAG_WARN_MS: f64 = 100.0;

/// Tham số của `latency-bench session` (H9). VAD là `models/silero_vad_v6.2.3.onnx` ở gốc repo, như app.
#[derive(clap::Args, Debug)]
pub struct SessionArgs {
    /// WAV 16 kHz mono của session (`bench/phase0/data/latency/<tên>.wav`).
    #[arg(long)]
    pub wav: PathBuf,
    /// Mốc thật của session (`<tên>.truth.json`).
    #[arg(long)]
    pub truth: PathBuf,
    #[arg(long)]
    pub asr_worker: PathBuf,
    #[arg(long)]
    pub asr_model: PathBuf,
    #[arg(long)]
    pub llama_server: PathBuf,
    #[arg(long)]
    pub mt_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    pub languages: Vec<String>,
    #[arg(long, default_value = "vi")]
    pub target: String,
    /// Ngưỡng im lặng đóng đoạn (`vadEndSilenceMs`; mặc định của app là 50 ms).
    #[arg(long, default_value_t = 50)]
    pub end_silence_ms: u64,
    /// File JSON kết quả.
    #[arg(long)]
    pub out: PathBuf,
}

/// `EventSink` ghi mọi sự kiện kèm giờ thật (ms từ `origin`, làm tròn 0,1 ms). Mức âm lượng bỏ qua; lỗi làm phiên dừng ghi
/// riêng (`fatal`), vì không phải sự kiện của giao diện.
struct Recorder {
    origin: Instant,
    events: Mutex<Vec<Timed>>,
    fatal: Mutex<Vec<String>>,
}

impl Recorder {
    fn new(origin: Instant) -> Self {
        Self {
            origin,
            events: Mutex::new(Vec::new()),
            fatal: Mutex::new(Vec::new()),
        }
    }

    fn push(&self, ev: Recorded) {
        let mut events = self.events.lock().unwrap_or_else(|e| e.into_inner());
        // Lấy giờ khi đã giữ khóa, để thứ tự trong danh sách cũng là thứ tự thời gian.
        let t_ms = (self.origin.elapsed().as_micros() as f64 / 100.0).round() / 10.0;
        events.push(Timed { t_ms, ev });
    }

    fn take(&self) -> (Vec<Timed>, Vec<String>) {
        (
            std::mem::take(&mut *self.events.lock().unwrap_or_else(|e| e.into_inner())),
            std::mem::take(&mut *self.fatal.lock().unwrap_or_else(|e| e.into_inner())),
        )
    }
}

impl EventSink for Recorder {
    fn subtitle(&self, subtitle: &Subtitle) {
        self.push(Recorded::Subtitle(subtitle.clone()));
    }

    fn delta(&self, delta: &Delta) {
        self.push(Recorded::Delta(delta.clone()));
    }

    fn level(&self, _rms: f32) {}

    fn indicators(&self, indicators: &Indicators) {
        self.push(Recorded::Indicators(indicators.clone()));
    }

    fn fatal(&self, kind: Fatal, reason: &str) {
        self.fatal
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push(format!("{kind:?}: {reason}"));
    }
}

/// Bọc `Asr` của app: cộng thời gian chép lời mà worker báo (`asr_ms` + `lid_ms`), cho mức bận (§10.1).
struct TimedAsr {
    inner: Box<dyn Asr>,
    busy_us: Arc<AtomicU64>,
}

impl Asr for TimedAsr {
    fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult, AsrFailure> {
        let result = self.inner.transcribe(req);
        if let Ok(r) = &result {
            self.busy_us
                .fetch_add(((r.asr_ms + r.lid_ms) * 1000.0) as u64, Ordering::Relaxed);
        }
        result
    }
}

/// Bọc `Mt` của app: cộng thời gian thật của mỗi lần stream bản dịch (kể cả lần làm nóng đầu phiên), cho mức bận (§10.1).
struct TimedMt {
    inner: Box<dyn Mt>,
    busy_us: Arc<AtomicU64>,
}

impl Mt for TimedMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        self.inner.count_tokens(text)
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        let started = Instant::now();
        let result = self.inner.stream(req, on_delta);
        self.busy_us
            .fetch_add(started.elapsed().as_micros() as u64, Ordering::Relaxed);
        result
    }
}

/// Phát `SampleSource` đúng thời gian thực: khung thứ k (32 ms) sẵn sàng lúc `origin + (k + 1) × 32 ms`, như khi thu
/// thật và như `latency`. Theo lịch tuyệt đối nên không trôi dần (ngủ một khoảng cố định sau mỗi khung thì trễ cộng dồn).
/// Ghi độ trễ lớn nhất so với lịch.
struct Paced {
    inner: SampleSource,
    origin: Instant,
    frames: u64,
    lag_max_us: Arc<AtomicU64>,
}

impl Paced {
    fn new(samples: Vec<f32>, origin: Instant, lag_max_us: Arc<AtomicU64>) -> Self {
        Self {
            inner: SampleSource::new(samples, FRAME_SAMPLES, Duration::ZERO),
            origin,
            frames: 0,
            lag_max_us,
        }
    }
}

impl FrameSource for Paced {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
        let due = self.origin + Duration::from_millis((self.frames + 1) * FRAME_MS);
        if let Some(wait) = due.checked_duration_since(Instant::now()) {
            std::thread::sleep(wait);
        }
        let lag = Instant::now().saturating_duration_since(due).as_micros() as u64;
        self.lag_max_us.fetch_max(lag, Ordering::Relaxed);
        self.frames += 1;
        self.inner.read(out, timeout)
    }
}

/// Sự kiện của giám sát tiến trình phụ: thiết bị thật của `asr-worker`, số lần khởi động lại.
#[derive(Default)]
struct SidecarLog(Mutex<Vec<SidecarEvent>>);

impl SidecarEvents for SidecarLog {
    fn on_event(&self, event: &SidecarEvent) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(event.clone());
    }
}

impl SidecarLog {
    fn asr_backend(&self) -> String {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .find_map(|e| match e {
                SidecarEvent::Ready {
                    which: Which::Asr,
                    backend: Some(b),
                    ..
                } => Some(b.as_str().to_string()),
                _ => None,
            })
            .unwrap_or_default()
    }

    fn restarts(&self) -> usize {
        self.0
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .iter()
            .filter(|e| matches!(e, SidecarEvent::Restarting { .. }))
            .count()
    }
}

/// Đường dẫn tuyệt đối: tiến trình phụ chạy với thư mục làm việc là thư mục chứa binary của nó (`asr_client::command`,
/// `llama::command`), nên đường dẫn tương đối không dùng được.
fn absolute(path: &Path) -> PathBuf {
    std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf())
}

/// Log của một tiến trình phụ, cạnh file kết quả: `x.json` thành `x.asr-worker.log`.
fn log_path(out: &Path, which: &str) -> PathBuf {
    absolute(out).with_extension(format!("{which}.log"))
}

/// Cách chạy hai tiến trình phụ, như `sidecar::prepare` của app trên macOS: một bản `asr-worker` cho cả GPU và CPU, chỉ
/// nhận chế độ giải mã B, `llama-server` không có tham số thêm, ngưỡng mặc định.
fn sidecar_spec(args: &SessionArgs) -> SidecarSpec {
    SidecarSpec {
        asr: AsrSpec {
            exe_gpu: Some(absolute(&args.asr_worker)),
            exe_cpu: absolute(&args.asr_worker),
            model: absolute(&args.asr_model),
            log: log_path(&args.out, "asr-worker"),
            first_run: false,
            require_shared: true,
            env: Vec::new(),
        },
        llama: LlamaSpec {
            exe: absolute(&args.llama_server),
            model: absolute(&args.mt_model),
            log: log_path(&args.out, "llama-server"),
            extra_args: Vec::new(),
            first_run: false,
            env: Vec::new(),
        },
        supervisor: SupervisorConfig::default(),
        asr_config: AsrConfig::default(),
        mt_config: MtConfig::default(),
    }
}

/// Pid của tiến trình đo và hai tiến trình phụ đang chạy (theo danh sách tiến trình phụ của `pipeline::process`).
fn sidecar_pids() -> HashMap<String, u32> {
    let mut pids = HashMap::from([("latency-bench".to_string(), std::process::id())]);
    for pid in pipeline::process::live() {
        let Some(entry) = pipeline::process::entry(pid) else {
            continue;
        };
        let name = entry
            .exe
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        for sidecar in ["asr-worker", "llama-server"] {
            if name.starts_with(sidecar) {
                pids.insert(sidecar.to_string(), pid);
            }
        }
    }
    pids
}

/// Dòng `asr-worker: backend=… flash_attn=… decode_mode=…` cuối cùng trong log của worker (lượt đo có bật flash attention
/// không, A5).
fn worker_flags(log: &Path) -> Option<String> {
    let text = std::fs::read_to_string(log).ok()?;
    let line = text.lines().rev().find(|l| l.contains("asr-worker: backend="))?;
    Some(line[line.find("asr-worker: backend=")?..].trim().to_string())
}

/// CPU cả máy, phần trăm, như S6 (`bench/phase0/latency/summarize.py`): tổng CPU trung bình của các tiến trình đo (mỗi
/// số là phần trăm của một lõi) chia số lõi logic.
fn machine_cpu_percent(usage: &HashMap<String, ProcessUsage>, logical_cores: usize) -> Option<f64> {
    (logical_cores > 0 && !usage.is_empty())
        .then(|| usage.values().map(|u| u.avg_cpu_percent).sum::<f64>() / logical_cores as f64)
}

fn vad_model() -> PathBuf {
    repo_root()
        .unwrap_or_default()
        .join("models")
        .join("silero_vad_v6.2.3.onnx")
}

fn args_map(args: &SessionArgs, vad_model: &Path) -> BTreeMap<String, String> {
    BTreeMap::from([
        ("wav".to_string(), public_path(&args.wav)),
        ("truth".to_string(), public_path(&args.truth)),
        ("asr_worker".to_string(), public_path(&args.asr_worker)),
        ("asr_model".to_string(), public_path(&args.asr_model)),
        ("llama_server".to_string(), public_path(&args.llama_server)),
        ("mt_model".to_string(), public_path(&args.mt_model)),
        ("vad_model".to_string(), public_path(vad_model)),
        ("languages".to_string(), args.languages.join(",")),
        ("target".to_string(), args.target.clone()),
        ("end_silence_ms".to_string(), args.end_silence_ms.to_string()),
    ])
}

/// Số đo thêm của lượt chạy, ngoài các khóa của H7 (khóa `run` của file JSON).
#[derive(Debug, Default, Serialize)]
struct RunInfo {
    session_ms: f64,
    /// Tổng `asr_ms` + `lid_ms` của mọi lần chép lời, và tổng thời gian stream bản dịch: tử số của `busy_ratio`.
    asr_busy_ms: f64,
    mt_busy_ms: f64,
    /// p50 của thời gian chép lời một đoạn và dịch một câu (`SessionMetrics::asr_ms`, `mt_ms`).
    asr_p50_ms: Option<f64>,
    mt_p50_ms: Option<f64>,
    merges: usize,
    /// Số câu có A2, số đơn vị của các bản chép cuối, số đơn vị không bao giờ có chữ dịch.
    measured: usize,
    words: usize,
    words_untranslated: usize,
    feed_lag_max_ms: f64,
    sidecar_restarts: usize,
}

#[derive(Serialize)]
struct Report {
    args: BTreeMap<String, String>,
    machine: BTreeMap<String, String>,
    usage: HashMap<String, ProcessUsage>,
    summary: Summary,
    run: RunInfo,
    utterances: Vec<UtteranceResult>,
    events: Vec<Timed>,
}

pub fn run(args: SessionArgs) -> Result<()> {
    if let Some(dir) = args.out.parent().filter(|d| !d.as_os_str().is_empty()) {
        std::fs::create_dir_all(dir)?;
    }
    let target = Lang::from_code(&args.target).context("--target không hợp lệ")?;
    let truth: Vec<Utterance> = serde_json::from_reader(
        std::fs::File::open(&args.truth).with_context(|| format!("không mở được {}", args.truth.display()))?,
    )?;
    let samples = read_wav_16k_mono(&args.wav)?;
    let vad_path = vad_model();
    // Nạp VAD trước khi chạy tiến trình phụ, như `latency`: đường dẫn sai thì báo ngay, và việc nạp không chiếm giờ phát.
    let vad = SileroVad::load(&vad_path)?;
    // Bản release đặt `panic = "abort"`: hook này kill tiến trình phụ trước khi abort, như app.
    pipeline::process::install_panic_hook();
    let sidecars = Arc::new(SidecarLog::default());
    let manager = SidecarManager::new(sidecar_spec(&args), Arc::new(SystemClock::default()), sidecars.clone());
    manager
        .ensure_started()
        .map_err(|e| anyhow!("không chạy được tiến trình phụ: {e}"))?;
    manager.begin_session();
    let stop_sampler = Arc::new(AtomicBool::new(false));
    let sampler = spawn_sampler(sidecar_pids(), stop_sampler.clone());

    let mut pipeline = PipelineConfig::default();
    pipeline.segmenter.end_silence_ms = args.end_silence_ms;
    let config = EngineConfig {
        pipeline,
        languages: args.languages.clone(),
        target,
        translation_context: false,
        id_base: 0,
        glossary: Default::default(),
    };
    let asr_busy = Arc::new(AtomicU64::new(0));
    let mt_busy = Arc::new(AtomicU64::new(0));
    let lag_max = Arc::new(AtomicU64::new(0));
    let origin = Instant::now();
    let recorder = Arc::new(Recorder::new(origin));
    let engine = Engine::start(
        config,
        Box::new(Paced::new(samples, origin, lag_max.clone())),
        Box::new(move || Ok(Box::new(vad) as Box<dyn VadModel>)),
        Box::new(TimedAsr {
            inner: Box::new(manager.asr()),
            busy_us: asr_busy.clone(),
        }),
        Box::new(TimedMt {
            inner: Box::new(manager.mt()),
            busy_us: mt_busy.clone(),
        }),
        recorder.clone(),
    )?;
    let metrics = engine.join();
    let session_ms = origin.elapsed().as_secs_f64() * 1000.0;
    manager.end_session();
    stop_sampler.store(true, Ordering::Relaxed);
    let usage = sampler.join().map_err(|_| anyhow!("luồng đo tài nguyên panic"))?;
    drop(manager); // tắt hai tiến trình phụ

    let (events, fatal) = recorder.take();
    let utterances = evaluate(&truth, &events);
    let machine_map = machine_info();
    let cores = machine_map
        .get("logical_cores")
        .and_then(|c| c.parse().ok())
        .unwrap_or(0);
    let run = RunInfo {
        session_ms: ms(session_ms),
        asr_busy_ms: ms(asr_busy.load(Ordering::Relaxed) as f64 / 1000.0),
        mt_busy_ms: ms(mt_busy.load(Ordering::Relaxed) as f64 / 1000.0),
        asr_p50_ms: percentile(&metrics.asr_ms, 50.0).map(|v| ms(f64::from(v))),
        mt_p50_ms: percentile(&metrics.mt_ms, 50.0).map(|v| ms(f64::from(v))),
        merges: metrics.merges,
        measured: utterances.iter().filter(|u| u.a2_shown_ms.is_some()).count(),
        words: utterances.iter().map(|u| u.units).sum(),
        words_untranslated: utterances.iter().map(|u| u.units - u.word_lag_tentative_ms.len()).sum(),
        feed_lag_max_ms: ms(lag_max.load(Ordering::Relaxed) as f64 / 1000.0),
        sidecar_restarts: sidecars.restarts(),
    };
    let mut summary = summarize(&truth, &events);
    summary.segments = Some(metrics.segments as f64);
    summary.busy_ratio = (session_ms > 0.0).then(|| ratio4((run.asr_busy_ms + run.mt_busy_ms) / session_ms));
    summary.cpu_percent = machine_cpu_percent(&usage, cores).map(ms);
    // Chế độ thường không chép từng phần; kế hoạch 02 điền ba khóa này khi bật chế độ dịch trong lúc nói.
    summary.partials = Some(0.0);
    let mut machine: BTreeMap<String, String> = machine_map.into_iter().collect();
    machine.insert("asr_backend".into(), sidecars.asr_backend());
    machine.insert(
        "asr_worker".into(),
        worker_flags(&log_path(&args.out, "asr-worker")).unwrap_or_default(),
    );
    let report = Report {
        args: args_map(&args, &vad_path),
        machine,
        usage,
        summary,
        run,
        utterances,
        events,
    };
    // Ghi file trước khi báo lỗi: lượt đo hỏng vẫn còn sự kiện để xem.
    let file = std::fs::File::create(&args.out).with_context(|| format!("không tạo được {}", args.out.display()))?;
    serde_json::to_writer(std::io::BufWriter::new(file), &report)?;
    let name = args.out.file_stem().unwrap_or_default().to_string_lossy();
    print_summary(&name, &report.summary);
    if report.run.feed_lag_max_ms > FEED_LAG_WARN_MS {
        println!(
            "  CẢNH BÁO: phát lại chậm hơn thời gian thực tới {:.0} ms (máy đang bận?); số đo lệch cùng cỡ",
            report.run.feed_lag_max_ms
        );
    }
    if report.run.sidecar_restarts > 0 {
        println!(
            "  CẢNH BÁO: tiến trình phụ khởi động lại {} lần trong lượt đo",
            report.run.sidecar_restarts
        );
    }
    if !fatal.is_empty() {
        bail!("engine dừng vì lỗi: {}", fatal.join("; "));
    }
    Ok(())
}

fn print_summary(name: &str, s: &Summary) {
    let v = |x: Option<f64>| x.map_or("—".to_string(), |x| format!("{x:.0}"));
    println!(
        "{name}: A2 p50 {} ms, p90 {} ms; đầu câu → chữ dịch p50 {} ms, p90 {} ms; trễ theo từ: tạm p50 {} ms, ổn \
         định p50 {} ms; {} câu, {} đoạn",
        v(s.a2_p50_ms),
        v(s.a2_p90_ms),
        v(s.first_from_start_p50_ms),
        v(s.first_from_start_p90_ms),
        v(s.word_lag_tentative_p50_ms),
        v(s.word_lag_stable_p50_ms),
        v(s.utterances),
        v(s.segments),
    );
}
```

- [ ] **Step 9: Chạy toàn bộ test, fmt và clippy của crate**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p latency-bench
cargo fmt -p latency-bench -- --check
cargo clippy --locked -p latency-bench --all-targets -- -D warnings
```

Expected:
- `test result: ok. 49 passed; 0 failed; 1 ignored`, gồm 33 test cũ và 16 test mới;
- fmt không in gì;
- clippy không có cảnh báo.

- [ ] **Step 10: Chạy thử một lượt với tiến trình phụ giả (không cần GPU)**

Dùng `fake_asr_worker` và `fake_llama_server` của `pipeline`, cùng clip 19 giây của `tests/fixtures/audio/`:
- mỗi đoạn được trả chữ theo `FAKE_ASR_TEXTS`, theo id đoạn, xoay vòng;
- bản dịch là `VI: <chữ nguồn>`.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo build --locked -p pipeline --bins
cargo build --locked -p latency-bench
mkdir -p target/do-tre/smoke
printf 'en\tThat did not seem to make sense to me.\nen\tThe result of plotting analysis will be posted.\nvi\tCác nhà khoa học cho biết.\n' > target/do-tre/smoke/texts
FAKE_ASR_TEXTS=$PWD/target/do-tre/smoke/texts target/debug/latency-bench session \
  --wav tests/fixtures/audio/fleurs-en-en-vi.wav --truth tests/fixtures/audio/fleurs-en-en-vi.json \
  --asr-worker target/debug/fake_asr_worker --asr-model models/ggml-small-q5_1.bin \
  --llama-server target/debug/fake_llama_server --mt-model models/Hy-MT2-1.8B-Q4_K_M.gguf \
  --languages en,vi --target vi --out target/do-tre/smoke/out.json
ls target/do-tre/smoke
python3 -c "
import json
r = json.load(open('target/do-tre/smoke/out.json'))
print(sorted(r))
s = r['summary']
print(len(s), s['utterances'], s['segments'], s['partials'], s['cadence_p50_ms'])
print(r['events'][0]['kind'], r['machine']['asr_backend'], r['run']['sidecar_restarts'])
"
```

Expected:
- Lệnh chạy khoảng 20 giây, in một dòng `out: A2 p50 … ms, …; 3 câu, 5 đoạn`.
- `ls` có `out.json`, `out.asr-worker.log`, `out.llama-server.log`, `texts`.
- Python in ba dòng:
  - `['args', 'events', 'machine', 'run', 'summary', 'usage', 'utterances']`;
  - `18 3.0 5.0 0.0 None`;
  - `subtitle metal 0`.
- Số đoạn có thể lệch một hai đoạn tùy VAD.
- A2 ở đây âm: mốc `end_ms` của file fixture tính cả khoảng lặng cuối clip, không phải mốc VAD như truth của S6. Đó là đặc điểm của fixture, không phải lỗi.

- [ ] **Step 11: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/latency-bench/src/main.rs crates/latency-bench/src/latency.rs crates/latency-bench/src/stats.rs \
  crates/latency-bench/src/session.rs crates/latency-bench/src/session_metrics.rs crates/latency-bench/src/session_replay.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(latency-bench): lệnh session đo bằng pipeline::Engine thật (A1)

Phát WAV theo lịch tuyệt đối qua SampleSource, tiến trình phụ thật qua SidecarManager dựng như app, ghi mọi sự kiện
kèm giờ thật; tính các chỉ số §10.1 (trễ theo từ hai tầng, từ đầu câu tới chữ dịch đầu, độ nháy, mức bận, CPU) và A2
như S6. Tên theo H9, ánh xạ chế độ thường theo H7 của kế hoạch 00.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected:
- `branch --show-current` in `dich-trong-luc-noi`;
- `status --short` trước khi add chỉ có sáu file trên;
- commit tạo được.

---

## Task 2: A1 — script chạy 6 session và tổng hợp

**Files:**
- Create: `bench/2026-10-10-do-tre/test_session_tools.py`
- Create: `bench/2026-10-10-do-tre/summarize_sessions.py`
- Create: `bench/2026-10-10-do-tre/run_sessions.py`

`run_sessions.py` làm như `bench/phase0/latency/run_matrix.py`:
- ngôn ngữ và ngôn ngữ đích lấy từ `sessions.json` (tiếng Việt dịch sang tiếng Anh, các session khác sang tiếng Việt);
- dừng nếu còn tiến trình phụ sót của lượt trước.

Chỗ khác `run_matrix.py`:
- chỉ xét tiến trình có đường dẫn trong worktree, vì app đã cài có `llama-server` riêng;
- ghi bản đầy đủ vào `target/do-tre/sessions/` và bản rút gọn vào `results/` (QĐ3).

- [ ] **Step 1: Viết test**

Tạo `bench/2026-10-10-do-tre/test_session_tools.py`:

```python
"""Test của `run_sessions.py` và `summarize_sessions.py` (kế hoạch 01 của "dịch trong lúc người nói chưa dừng").

Chạy:  python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
"""
import unittest

import run_sessions
import summarize_sessions as S


class RunSessionsTest(unittest.TestCase):
    def test_only_sidecars_started_from_the_worktree_count_as_strays(self):
        ps = "\n".join([
            "  101 /w/src-tauri/binaries/asr-worker-aarch64-apple-darwin",
            "  102 /Applications/AI Translator.app/Contents/MacOS/llama-server -m x.gguf",
            "  103 /w/target/release/latency-bench session --asr-worker /w/src-tauri/binaries/asr-worker",
            "  104 /w/src-tauri/binaries/llama-server-aarch64-apple-darwin -m /w/models/m.gguf",
            "  105 /other/src-tauri/binaries/asr-worker-aarch64-apple-darwin",
            "dòng hỏng",
        ])
        self.assertEqual([pid for pid, _ in run_sessions.strays(ps, {"/w"})], [101, 104])

    def test_the_committed_copy_drops_only_the_events(self):
        report = {"args": {}, "machine": {}, "summary": {"a2_p50_ms": 1.0}, "utterances": [], "events": [{"t_ms": 1}]}
        self.assertEqual(sorted(run_sessions.slim(report)), ["args", "machine", "summary", "utterances"])


class SummarizeSessionsTest(unittest.TestCase):
    def test_cells(self):
        self.assertEqual(S.cell("a2_p50_ms", 1234.6), "1235")
        self.assertEqual(S.cell("busy_ratio", 0.1234), "12.3%")
        self.assertEqual(S.cell("cpu_percent", 2.345), "2.3")
        self.assertEqual(S.cell("cadence_p50_ms", None), "—")

    def test_percentile_matches_numpy(self):
        self.assertEqual(S.percentile([1, 2, 3, 4], 50), 2.5)
        self.assertAlmostEqual(S.percentile([15, 20, 35, 40, 50], 40), 29.0)
        self.assertEqual(S.percentile([7], 90), 7)
        self.assertIsNone(S.percentile([], 50))

    def test_one_row_per_file(self):
        lines = S.session_table([("buoc1-moc-chuan-en", {"summary": {"a2_p50_ms": 1000.4, "busy_ratio": 0.25}})])
        self.assertEqual(len(lines), 3)
        self.assertTrue(lines[2].startswith("| buoc1-moc-chuan-en | 1000 | — | — |"), lines[2])
        self.assertIn("| 25.0% |", lines[2])

    def test_words_are_pooled_by_run_group_and_source_language(self):
        reports = [
            ("buoc1-moc-chuan-en", {"utterances": [
                {"lang": "en", "word_lag_tentative_ms": [100, 300], "word_lag_stable_ms": [900],
                 "first_from_start_ms": 1500},
            ]}),
            ("buoc1-moc-chuan-mixed", {"utterances": [
                {"lang": "en", "word_lag_tentative_ms": [200], "word_lag_stable_ms": [],
                 "first_from_start_ms": None},
                {"lang": "ja", "word_lag_tentative_ms": [], "word_lag_stable_ms": [], "first_from_start_ms": None},
            ]}),
        ]
        lines = S.language_table(reports)
        self.assertIn("| buoc1-moc-chuan | en | 3 | 200 | 280 | 900 | 900 | 1500 | 1500 |", lines)
        self.assertIn("| buoc1-moc-chuan | ja | 0 | — | — | — | — | — | — |", lines)

    def test_two_runs_are_compared_session_by_session(self):
        reports = [
            ("buoc1-moc-chuan-en", {"summary": {"a2_p50_ms": 1000.0, "busy_ratio": 0.2}, "run": {"asr_p50_ms": None}}),
            ("buoc1-sau-chuan-en", {"summary": {"a2_p50_ms": 950.4, "busy_ratio": 0.18}, "run": {"asr_p50_ms": 230.0}}),
            ("buoc1-moc-nhe-en", {"summary": {"a2_p50_ms": 800.0}}),
        ]
        lines = S.compare_table(reports, "buoc1-moc", "buoc1-sau")
        self.assertEqual(len(lines), 3, "chỉ session có ở cả hai lượt")
        self.assertTrue(lines[2].startswith("| chuan-en | 1000 → 950 (-50) |"), lines[2])
        self.assertIn("| 20.0% → 18.0% (-2.0) |", lines[2])
        self.assertIn("| — → 230 |", lines[2])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
```

Expected: `ModuleNotFoundError: No module named 'run_sessions'` (lỗi khi nạp test).

- [ ] **Step 3: Viết hai script**

Tạo `bench/2026-10-10-do-tre/summarize_sessions.py`:

```python
"""Bảng Markdown từ kết quả của `latency-bench session` (spec 2026-10-10 §10.1; H7 của kế hoạch 00).

Dùng:  python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>...
       python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare <nhãn cũ> <nhãn mới> <file.json>...

In hai bảng:
1. mỗi file một dòng, các khóa của `summary` (ms; tỉ lệ in bằng %; không có số thì "—");
2. trễ theo từ và "từ đầu câu tới chữ dịch đầu tiên", gộp mọi câu cùng tiếng nguồn trong cùng một nhóm lượt chạy (tên file
   bỏ phần session ở cuối, ví dụ `buoc1-moc-chuan`), để so với ngưỡng theo tiếng ở spec §10.2.
Với `--compare`, in thêm bảng so hai lượt chạy: mỗi gói và session có ở cả hai nhãn (`<nhãn>-<gói>-<session>.json`) một
dòng, mỗi ô là "cũ → mới (chênh)". Hai cột cuối (chép lời, dịch p50) lấy ở khóa `run` của file.

Đọc được cả file đầy đủ (có `events`) lẫn bản rút gọn mà `run_sessions.py` ghi vào `results/`. Chỉ dùng thư viện chuẩn.
"""
import json
import os
import sys

# (khóa của `summary`, tiêu đề cột)
COLUMNS = [
    ("a2_p50_ms", "A2 p50"),
    ("a2_p90_ms", "A2 p90"),
    ("a2_first_p50_ms", "A2 chữ đầu p50"),
    ("first_from_start_p50_ms", "Đầu câu → chữ dịch p50"),
    ("first_from_start_p90_ms", "p90"),
    ("word_lag_tentative_p50_ms", "Theo từ, tạm p50"),
    ("word_lag_tentative_p90_ms", "p90"),
    ("word_lag_stable_p50_ms", "Theo từ, ổn định p50"),
    ("word_lag_stable_p90_ms", "p90"),
    ("stable_flicker_ratio", "Nháy ổn định"),
    ("tentative_erasure_ratio", "Nháy tạm"),
    ("busy_ratio", "Bận"),
    ("cpu_percent", "CPU %"),
    ("utterances", "Câu"),
    ("segments", "Đoạn"),
    ("partials", "Chép từng phần"),
    ("cadence_p50_ms", "Nhịp p50"),
    ("streaming_auto_off", "Tự tắt"),
]
RATIOS = {"stable_flicker_ratio", "tentative_erasure_ratio", "busy_ratio"}
# Khóa so ở bảng `--compare`: khóa của `summary`, hay của `run` (`asr_p50_ms`, `mt_p50_ms`).
COMPARED = [
    ("a2_p50_ms", "A2 p50"),
    ("a2_first_p50_ms", "A2 chữ đầu p50"),
    ("first_from_start_p50_ms", "Đầu câu → chữ dịch p50"),
    ("first_from_start_p90_ms", "p90"),
    ("word_lag_tentative_p50_ms", "Theo từ, tạm p50"),
    ("word_lag_stable_p50_ms", "Theo từ, ổn định p50"),
    ("tentative_erasure_ratio", "Nháy tạm"),
    ("busy_ratio", "Bận"),
    ("cpu_percent", "CPU %"),
    ("asr_p50_ms", "Chép lời p50"),
    ("mt_p50_ms", "Dịch p50"),
]


def cell(key, value):
    """Một ô: tỉ lệ in bằng %, CPU một chữ số thập phân, còn lại làm tròn tới đơn vị; không có số thì "—"."""
    if value is None:
        return "—"
    if key in RATIOS:
        return f"{value * 100:.1f}%"
    if key == "cpu_percent":
        return f"{value:.1f}"
    return f"{value:.0f}"


def percentile(values, p):
    """Phân vị nội suy tuyến tính như `numpy.percentile` (và `stats::percentile` của latency-bench); rỗng thì None."""
    if not values:
        return None
    v = sorted(values)
    rank = p / 100 * (len(v) - 1)
    lo = int(rank)
    hi = min(lo + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (rank - lo)


def name_of(path):
    return os.path.basename(path).removesuffix(".json")


def group_of(name):
    """Nhóm lượt chạy: tên file bỏ phần session ở cuối (`buoc1-moc-chuan-en` thành `buoc1-moc-chuan`)."""
    return name.rsplit("-", 1)[0]


def session_table(reports):
    lines = [
        "| Lượt | " + " | ".join(title for _, title in COLUMNS) + " |",
        "|" + "---|" * (len(COLUMNS) + 1),
    ]
    for name, report in reports:
        summary = report.get("summary", {})
        lines.append(f"| {name} | " + " | ".join(cell(k, summary.get(k)) for k, _ in COLUMNS) + " |")
    return lines


def language_table(reports):
    pooled = {}
    for name, report in reports:
        for u in report.get("utterances", []):
            d = pooled.setdefault((group_of(name), u["lang"]), {"tentative": [], "stable": [], "start": []})
            d["tentative"].extend(u.get("word_lag_tentative_ms", []))
            d["stable"].extend(u.get("word_lag_stable_ms", []))
            if u.get("first_from_start_ms") is not None:
                d["start"].append(u["first_from_start_ms"])

    def ms(v):
        return "—" if v is None else f"{v:.0f}"

    lines = [
        "| Nhóm | Tiếng nguồn | Từ có chữ dịch | Tạm p50 | Tạm p90 | Ổn định p50 | Ổn định p90 "
        "| Đầu câu → chữ dịch p50 | p90 |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for (group, lang), d in sorted(pooled.items()):
        t, s, f = d["tentative"], d["stable"], d["start"]
        lines.append(
            f"| {group} | {lang} | {len(t)} | {ms(percentile(t, 50))} | {ms(percentile(t, 90))} | "
            f"{ms(percentile(s, 50))} | {ms(percentile(s, 90))} | {ms(percentile(f, 50))} | {ms(percentile(f, 90))} |"
        )
    return lines


def compare_cell(key, old, new):
    """Một ô "cũ → mới (chênh)"; thiếu một bên thì không có chênh."""
    if old is None or new is None:
        return f"{cell(key, old)} → {cell(key, new)}"
    diff = new - old
    if key in RATIOS:
        return f"{cell(key, old)} → {cell(key, new)} ({diff * 100:+.1f})"
    if key == "cpu_percent":
        return f"{cell(key, old)} → {cell(key, new)} ({diff:+.1f})"
    return f"{cell(key, old)} → {cell(key, new)} ({diff:+.0f})"


def value(report, key):
    """Số của khóa `key` trong `summary`, không có thì trong `run`."""
    summary = report.get("summary", {})
    return summary[key] if key in summary else report.get("run", {}).get(key)


def compare_table(reports, old_label, new_label):
    """So hai lượt chạy: mỗi `<gói>-<session>` có ở cả hai nhãn một dòng."""
    by_name = dict(reports)
    lines = ["| Gói-session | " + " | ".join(title for _, title in COMPARED) + " |", "|" + "---|" * (len(COMPARED) + 1)]
    keys = sorted(n.removeprefix(old_label + "-") for n in by_name if n.startswith(old_label + "-"))
    for key in keys:
        old, new = by_name.get(f"{old_label}-{key}"), by_name.get(f"{new_label}-{key}")
        if new is None:
            continue
        cells = [compare_cell(k, value(old, k), value(new, k)) for k, _ in COMPARED]
        lines.append(f"| {key} | " + " | ".join(cells) + " |")
    return lines


def main(argv):
    compare = None
    if argv[:1] == ["--compare"]:
        if len(argv) < 4:
            raise SystemExit(__doc__)
        compare, argv = (argv[1], argv[2]), argv[3:]
    reports = []
    for path in argv:
        with open(path, encoding="utf-8") as f:
            reports.append((name_of(path), json.load(f)))
    reports.sort(key=lambda r: r[0])
    print("\n".join(session_table(reports)))
    print()
    print("\n".join(language_table(reports)))
    if compare:
        print()
        print("\n".join(compare_table(reports, *compare)))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    main(sys.argv[1:])
```

Tạo `bench/2026-10-10-do-tre/run_sessions.py`:

```python
"""Chạy `latency-bench session` trên 6 session S6 với một gói model (spec 2026-10-10 §9, §10.1; H7 của kế hoạch 00).

Dùng (từ gốc worktree, sau Task 0 của kế hoạch 01: `cargo build --release -p latency-bench` và `scripts/copy-sidecars.sh`):
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-moc
  python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label thu --sessions en,vi -- --streaming
Tham số sau `--` được chuyển nguyên cho `latency-bench session` (kế hoạch 02 thêm các cờ của chế độ dịch trong lúc nói).

Gói: `chuan` = whisper turbo q5_0 + Hy-MT2 Q8_0; `nhe` = whisper small q5_1 + Hy-MT2 Q4_K_M. Tiến trình phụ là bản app dùng
(`src-tauri/binaries/`, do `scripts/copy-sidecars.sh` dựng). Ngôn ngữ và ngôn ngữ đích lấy từ
`bench/phase0/data/latency/sessions.json`, như `bench/phase0/latency/run_matrix.py`: session tiếng Việt dịch sang tiếng Anh,
các session khác sang tiếng Việt.

Mỗi session ghi:
- bản đầy đủ (có `events`) vào `target/do-tre/sessions/<label>-<pack>-<session>.json`, không commit; log của hai tiến
  trình phụ nằm cạnh đó (`<…>.asr-worker.log`, `<…>.llama-server.log`);
- bản rút gọn (bỏ `events`) vào `bench/2026-10-10-do-tre/results/<label>-<pack>-<session>.json`, để commit.

Trước mỗi session, dừng nếu còn `asr-worker` hay `llama-server` chạy từ thư mục này (lượt trước chết mà chưa dọn, vì bản
release đặt `panic = "abort"`). Chỉ xét tiến trình có đường dẫn nằm trong worktree: app AI Translator đã cài có thể đang
chạy tiến trình phụ của nó, không được đụng tới.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "bench", "phase0", "data", "latency")
FULL = os.path.join(ROOT, "target", "do-tre", "sessions")
RESULTS = os.path.join(HERE, "results")
PACKS = {
    "chuan": ("ggml-large-v3-turbo-q5_0.bin", "Hy-MT2-1.8B-Q8_0.gguf"),
    "nhe": ("ggml-small-q5_1.bin", "Hy-MT2-1.8B-Q4_K_M.gguf"),
}
SIDECARS = ("asr-worker", "llama-server")


def strays(ps_output, roots):
    """[(pid, lệnh)] của `asr-worker`, `llama-server` chạy từ một thư mục trong `roots`, từ đầu ra của
    `ps -axo pid=,command=`."""
    found = []
    for line in ps_output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        exe = parts[1].split()[0]
        if os.path.basename(exe).startswith(SIDECARS) and any(exe.startswith(r + os.sep) for r in roots):
            found.append((int(parts[0]), parts[1]))
    return found


def running_strays():
    ps = subprocess.run(["ps", "-axo", "pid=,command="], capture_output=True, text=True, check=True).stdout
    return strays(ps, {ROOT, os.path.realpath(ROOT)})


def slim(report):
    """Bản để commit: bỏ `events` (bản đầy đủ nằm ở `target/do-tre/sessions/`)."""
    return {k: v for k, v in report.items() if k != "events"}


def main(argv):
    extra = argv[argv.index("--") + 1:] if "--" in argv else []
    argv = argv[:argv.index("--")] if "--" in argv else argv
    ap = argparse.ArgumentParser(description="Chạy latency-bench session trên các session S6.")
    ap.add_argument("--pack", required=True, choices=list(PACKS))
    ap.add_argument("--label", required=True, help="tên lượt, ví dụ buoc1-moc; file là <label>-<pack>-<session>.json")
    ap.add_argument("--sessions", default="", help="danh sách cách nhau bằng dấu phẩy; mặc định cả 6 session")
    ap.add_argument("--end-silence-ms", type=int, default=50)
    ap.add_argument("--asr-worker", default=os.path.join("src-tauri", "binaries", "asr-worker-aarch64-apple-darwin"))
    ap.add_argument("--llama-server", default=os.path.join("src-tauri", "binaries", "llama-server-aarch64-apple-darwin"))
    args = ap.parse_args(argv)

    with open(os.path.join(DATA, "sessions.json"), encoding="utf-8") as f:
        index = json.load(f)
    names = [n.strip() for n in args.sessions.split(",") if n.strip()] or list(index)
    unknown = [n for n in names if n not in index]
    if unknown:
        ap.error(f"không có session {', '.join(unknown)}; có: {', '.join(index)}")
    bench = os.path.join(ROOT, "target", "release", "latency-bench")
    asr_model, mt_model = PACKS[args.pack]
    paths = [bench, os.path.join(ROOT, args.asr_worker), os.path.join(ROOT, args.llama_server),
             os.path.join(ROOT, "models", asr_model), os.path.join(ROOT, "models", mt_model)]
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        raise SystemExit(f"thiếu {', '.join(missing)} (xem Task 0 của kế hoạch 01)")
    for d in (FULL, RESULTS):
        os.makedirs(d, exist_ok=True)
    for name in names:
        left = running_strays()
        if left:
            listing = ", ".join(f"pid {pid} ({cmd.split()[0]})" for pid, cmd in left)
            raise SystemExit(f"dừng trước session {name}: còn tiến trình phụ của lượt trước: {listing}. "
                             "Tắt đúng các pid này bằng `kill <pid>` rồi chạy lại.")
        info = index[name]
        out_name = f"{args.label}-{args.pack}-{name}"
        full = os.path.join(FULL, out_name + ".json")
        cmd = [bench, "session",
               "--wav", os.path.join(DATA, f"{name}.wav"),
               "--truth", os.path.join(DATA, f"{name}.truth.json"),
               "--asr-worker", os.path.join(ROOT, args.asr_worker),
               "--asr-model", os.path.join(ROOT, "models", asr_model),
               "--llama-server", os.path.join(ROOT, args.llama_server),
               "--mt-model", os.path.join(ROOT, "models", mt_model),
               "--languages", info["languages"], "--target", info["target"],
               "--end-silence-ms", str(args.end_silence_ms),
               "--out", full, *extra]
        print(f"== {out_name} ({info['seconds']} giây, {info['utterances']} câu)", flush=True)
        code = subprocess.run(cmd, cwd=ROOT).returncode
        if code != 0:
            left = running_strays()
            more = f" Còn tiến trình phụ: {', '.join(str(pid) for pid, _ in left)}." if left else ""
            raise SystemExit(f"{out_name}: latency-bench thoát với mã {code}.{more}")
        with open(full, encoding="utf-8") as f:
            report = json.load(f)
        with open(os.path.join(RESULTS, out_name + ".json"), "w", encoding="utf-8") as f:
            json.dump(slim(report), f, ensure_ascii=False, indent=1)
            f.write("\n")


if __name__ == "__main__":
    main(sys.argv[1:])
```

- [ ] **Step 4: Chạy, thấy xanh, và thử trên kết quả chạy thử của Task 1**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py' -v
python3 bench/2026-10-10-do-tre/summarize_sessions.py target/do-tre/smoke/out.json
python3 bench/2026-10-10-do-tre/run_sessions.py --help
```

Expected:
- `Ran 7 tests … OK`;
- hai bảng Markdown, một dòng `| out | … |` và dòng tiếng `en`, `vi`;
- phần trợ giúp có `--pack {chuan,nhe}` và `--label`.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/2026-10-10-do-tre/run_sessions.py bench/2026-10-10-do-tre/summarize_sessions.py \
  bench/2026-10-10-do-tre/test_session_tools.py
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): script chạy latency-bench session trên 6 session S6 và tổng hợp

run_sessions.py chạy một gói (chuan, nhe), ghi bản đầy đủ vào target/do-tre/sessions/ và bản bỏ events vào results/;
summarize_sessions.py in bảng theo file, theo tiếng nguồn và so hai lượt (--compare).

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có đúng ba file.

---
## Task 3: A1 — mốc chế độ thường, ngưỡng 50 ms, hai gói

Đo trên code **chưa có A2–A5**, để Task 12 so được tác dụng. Mỗi gói chạy khoảng 20 phút (6 session, mỗi session khoảng 3 phút cộng thời gian nạp model).

Cách ghi điều kiện đo theo `bench/phase1/results/s6-a2-2026-10-04.md`.

**Files:**
- Create: `bench/2026-10-10-do-tre/results/buoc1-moc-chuan-{en,zh,ja,ko,vi,mixed}.json` (6 file)
- Create: `bench/2026-10-10-do-tre/results/buoc1-moc-nhe-{en,zh,ja,ko,vi,mixed}.json` (6 file)
- Create: `bench/2026-10-10-do-tre/results/buoc1-moc-che-do-thuong.md`

- [ ] **Step 1: Build bản release có lệnh `session`**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo build --release --locked -p latency-bench
target/release/latency-bench session --help | head -n 3
git log -1 --format=%h
```

Expected:
- build xong;
- phần trợ giúp mở đầu bằng dòng mô tả lệnh `session`;
- ghi lại hash commit (dùng ở Step 9).

- [ ] **Step 2: Hỏi chủ dự án và chờ trả lời**

Gửi điều phối viên để chuyển cho chủ dự án:

> Sắp đo mốc độ trễ (khoảng 45 phút, máy chạy model liên tục). Nhờ anh:
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
  "$(top -l 1 | grep 'CPU usage')" | tee target/do-tre/buoc1-moc-dieu-kien.txt
```

Expected: một dòng `[TRUOC …] total = … | -InternalBattery-0 … charged … | CPU usage: …% idle`. CPU rảnh phải trên khoảng 90%; thấp hơn thì hỏi lại chủ dự án.

- [ ] **Step 4: Đo gói Chuẩn**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-moc
```

Expected:
- 6 khối `== buoc1-moc-chuan-<session> (… giây, … câu)`, mỗi khối có một dòng `buoc1-moc-chuan-<session>: A2 p50 … ms, …`;
- không có dòng `CẢNH BÁO`;
- lệnh thoát mã 0.

Nếu có `CẢNH BÁO: phát lại chậm hơn…` thì máy đang bận: hỏi chủ dự án rồi chạy lại đúng session đó, bằng `--sessions <tên>`.

- [ ] **Step 5: Đo gói Nhẹ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-moc
```

Expected: như Step 4, với `buoc1-moc-nhe-<session>`.

- [ ] **Step 6: Ghi điều kiện sau khi đo, và kiểm lượt đo đáng tin**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
printf '[SAU %s] %s | %s | %s\n' "$(date '+%F %T')" "$(sysctl -n vm.swapusage)" "$(pmset -g batt | tail -n 1)" \
  "$(top -l 1 | grep 'CPU usage')" | tee -a target/do-tre/buoc1-moc-dieu-kien.txt
python3 - <<'EOF'
import glob, json
index = json.load(open("bench/phase0/data/latency/sessions.json", encoding="utf-8"))
for path in sorted(glob.glob("bench/2026-10-10-do-tre/results/buoc1-moc-*.json")):
    r = json.load(open(path, encoding="utf-8"))
    s, run, name = r["summary"], r["run"], path.rsplit("/", 1)[1][:-5]
    print(name, "câu", int(s["utterances"]), "/", index[name.rsplit("-", 1)[1]]["utterances"], "| A2 đo được",
          run["measured"], "| phát trễ", run["feed_lag_max_ms"], "| khởi động lại", run["sidecar_restarts"], "|",
          r["machine"]["asr_backend"], "|", r["machine"]["asr_worker"])
EOF
```

Expected cho cả 12 dòng:
- số câu bằng số câu của `sessions.json`;
- "A2 đo được" gần bằng số câu: thiếu vài câu là do LID nhận nhầm sang tiếng đích hay đoạn bị bỏ, xem `utterances[].lid_to_target` trong file;
- "phát trễ" dưới 100;
- "khởi động lại" bằng 0;
- `metal | asr-worker: backend=metal flash_attn=off decode_mode=shared`.

Dòng nào không đạt thì chạy lại session đó, bằng `--sessions <tên>`.

- [ ] **Step 7: Tổng hợp**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/summarize_sessions.py bench/2026-10-10-do-tre/results/buoc1-moc-*.json \
  | tee target/do-tre/buoc1-moc-bang.md
```

Expected:
- bảng thứ nhất có 12 dòng (`buoc1-moc-chuan-…`, `buoc1-moc-nhe-…`);
- bảng thứ hai có các dòng theo tiếng (`buoc1-moc-chuan | en | …`…);
- cột "Chép từng phần" là 0, "Nhịp p50" và "Tự tắt" là "—" (chế độ thường).

- [ ] **Step 8: Viết biên bản**

Tạo `bench/2026-10-10-do-tre/results/buoc1-moc-che-do-thuong.md` theo khung dưới. Mỗi chỗ trong `‹…›` điền đúng số hay dòng nêu trong đó, lấy từ đầu ra của các bước trên; không để sót chỗ nào.

````markdown
# Bước 1: mốc chế độ thường, đo bằng engine thật (‹ngày đo, YYYY-MM-DD›)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 3; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §9 bước 1 và §10.1. Đây là mốc mà các bước sau so với.

## Điều kiện đo

- Máy: ‹`machine.cpu`›, ‹`machine.ram_gb`› GB, ‹`machine.os`› (lấy từ một file kết quả).
- Code: nhánh `dich-trong-luc-noi`, commit ‹hash ở Step 1›, **chưa có A2–A5**.
  - `asr-worker` là sidecar do `scripts/copy-sidecars.sh` dựng (Metal, chế độ B, `flash_attn=off`, sàn `audio_ctx` 512).
  - `llama-server` b11146.
- Cấu hình:
  - ngưỡng ngắt câu 50 ms, là mặc định của app (`--end-silence-ms 50`);
  - ghép câu §6.3;
  - mọi ngưỡng khác là `PipelineConfig::default()`.
- Ngôn ngữ theo `bench/phase0/data/latency/sessions.json`: session `vi` dịch sang tiếng Anh, các session khác sang tiếng Việt.
- Chủ dự án đã ‹ghi những gì đã tắt, như lời chủ dự án›; máy cắm sạc. Trước và sau lượt đo:

  ```
  ‹hai dòng của target/do-tre/buoc1-moc-dieu-kien.txt›
  ```

## Cách chạy

```
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-moc
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-moc
python3 bench/2026-10-10-do-tre/summarize_sessions.py bench/2026-10-10-do-tre/results/buoc1-moc-*.json
```

Bản đầy đủ (có `events`) nằm ở `target/do-tre/sessions/`, không commit. File trong thư mục này đã bỏ `events`.

## Kết quả

‹dán nguyên hai bảng của target/do-tre/buoc1-moc-bang.md›

## Nhận xét

- **So với mô phỏng của nghiên cứu** (README §0, cùng ngưỡng 50 ms, gói Chuẩn):
  - chữ dịch đầu tiên sau chỗ ngừng là 0,42–0,46 s; ở đây `A2 chữ đầu p50` là ‹khoảng của 6 session gói Chuẩn› ms;
  - từ đầu câu tới lúc đoạn đầu đóng là p50 3 072 / p90 5 824 ms, chưa gồm ASR và dịch; ở đây "Đầu câu → chữ dịch" là ‹p50 / p90 gộp, lấy từ bảng theo tiếng› ms.
- **A2:** ngưỡng là p50 ≤ 2 000 ms, p90 ≤ 3 000 ms, chữ đầu p50 ≤ 1 000 ms. ‹đạt hay không đạt, session nào lớn nhất›.
  - Mốc S6 cũ đo với ngưỡng 300 ms (`bench/phase1/results/s6-a2-2026-10-04.md`); ở đây là 50 ms, nên câu vụn hơn và ghép nhiều hơn.
- **Độ nháy của tầng tạm** (`Nháy tạm`): ‹khoảng›. Chủ yếu do ghép câu xóa bản dịch đang hiện; A2 (Task 5) nhắm vào chỗ này.
- **CPU cả máy:** ‹khoảng›% (ngưỡng 30%, spec chính §8). **Mức bận** (thời gian chép lời và dịch chia thời gian phiên): ‹khoảng›.

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec 2026-10-10 §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
- `latency-bench` phát WAV 16 kHz thẳng vào engine, nên không gồm phần thu âm và resample (A3).
````

- [ ] **Step 9: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/2026-10-10-do-tre/results/buoc1-moc-*.json bench/2026-10-10-do-tre/results/buoc1-moc-che-do-thuong.md
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): mốc chế độ thường đo bằng engine thật, ngưỡng 50 ms, hai gói (bước 1)

12 lượt latency-bench session trên 6 session S6, code chưa có A2–A5; biên bản ghi điều kiện đo, bảng các chỉ số §10.1
và so với mô phỏng của nghiên cứu.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected:
- `branch --show-current` in `dich-trong-luc-noi`;
- `status --short` trước khi add chỉ có 12 file JSON và file `.md` trong `bench/2026-10-10-do-tre/results/`;
- commit có đúng 13 file.

---
## Task 4: A2 — cờ hủy trong `translate` (H1)

Đúng H1 của kế hoạch 00:
- `Job.cancel: Option<&AtomicBool>`;
- `translate` kiểm cờ trước request đầu tiên (`/tokenize`), trước mỗi lần thử (stream), và ở mọi gói stream về, kể cả gói hậu xử lý còn đang giữ;
- `mt_loop` truyền cờ của câu.

Callback của `mt_loop` thôi kiểm cờ, vì `translate` đã kiểm ở mọi gói, trước khi gọi callback.

**Files:**
- Modify: `crates/pipeline/src/translate.rs` (dòng 10–11, 57–58, 111–112, 143–146, 154–169, 245–253 trong test, và thêm test trước `context_uses_the_background_template`)
- Modify: `crates/pipeline/src/engine.rs` (`mt_loop`, dòng 767–777; thêm một test trước `the_lag_indicator_follows_the_oldest_unfinished_segment`)
- Modify: `crates/latency-bench/src/mt_eval.rs` (dòng 325–328)
- Modify: `crates/pipeline/tests/real_terms.rs` (dòng 31–37)
- Modify: `crates/pipeline/tests/lifecycle.rs` (dòng 407–413)

- [ ] **Step 1: Viết test**

`crates/pipeline/src/translate.rs`: thay

```rust
    #[test]
    fn context_uses_the_background_template() {
```

bằng

```rust
    /// Server giả cho test hủy: đếm số lần gọi `/tokenize` và request dịch; mỗi request trả `chunks`, và bật `flag` ngay
    /// trước khi gửi gói thứ `cancel_at` (đếm từ 0), như luồng phụ đề hủy câu trong lúc đang stream. `sent`: số gói đã gửi.
    struct Cancelling<'a> {
        chunks: Vec<&'static str>,
        cancel_at: usize,
        flag: &'a AtomicBool,
        tokenized: usize,
        streams: usize,
        sent: usize,
    }

    impl<'a> Cancelling<'a> {
        fn new(chunks: Vec<&'static str>, cancel_at: usize, flag: &'a AtomicBool) -> Self {
            Self {
                chunks,
                cancel_at,
                flag,
                tokenized: 0,
                streams: 0,
                sent: 0,
            }
        }
    }

    impl Mt for Cancelling<'_> {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            self.tokenized += 1;
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.streams += 1;
            let mut end = StreamEnd::default();
            for (i, chunk) in self.chunks.iter().enumerate() {
                if i == self.cancel_at {
                    self.flag.store(true, Ordering::SeqCst);
                }
                self.sent += 1;
                end.chunks += 1;
                if on_delta(chunk).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some("stop".into());
            Ok(end)
        }
    }

    /// H1 của kế hoạch 00 (A2): câu đã bị hủy trước khi dịch thì không gửi request nào, kể cả `/tokenize`.
    #[test]
    fn a_job_cancelled_before_it_starts_sends_no_request() {
        let flag = AtomicBool::new(true);
        let mut mt = Cancelling::new(vec!["Chào"], usize::MAX, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let mut events = 0;
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |_| {
            events += 1;
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!((mt.tokenized, mt.streams, events), (0, 0, 0));
    }

    /// Cờ hủy được kiểm ở mỗi gói, kể cả khi hậu xử lý đang giữ chữ (chưa biết "Trans…" có phải nhãn không): dừng ngay, không
    /// chờ tới gói chữ được hiện tiếp theo.
    #[test]
    fn a_cancel_is_seen_while_the_postprocessor_holds_the_text() {
        let flag = AtomicBool::new(false);
        let mut mt = Cancelling::new(vec!["Trans", "lation", ":", " Xin", " chào"], 1, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let mut events = Vec::new();
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |e| {
            events.push(format!("{e:?}"));
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.sent, 2, "dừng ở gói thứ hai, lúc chữ còn bị giữ");
        assert!(events.is_empty(), "{events:?}");
    }

    /// Hủy giữa hai lần thử (lần đầu quá dài): lần thử lại không được gửi.
    #[test]
    fn a_cancel_between_attempts_skips_the_retry() {
        let flag = AtomicBool::new(false);
        // 10 token nguồn, Anh→Việt 4,4: tối đa 44 gói; 60 gói là quá dài.
        let mut mt = Cancelling::new(std::iter::repeat_n(" x", 60).collect(), usize::MAX, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("one two three four five six seven eight nine ten")
        };
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |e| {
            if e == Event::Retry {
                flag.store(true, Ordering::SeqCst);
            }
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.streams, 1);
    }

    #[test]
    fn context_uses_the_background_template() {
```

`crates/pipeline/src/engine.rs`: thay

```rust
    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
```

bằng

```rust
    /// H1: luồng dịch truyền cờ hủy của câu cho `translate`, nên câu bị hủy dừng ngay cả khi hậu xử lý chưa hiện chữ nào
    /// (server chỉ trả khoảng trắng).
    #[test]
    fn the_translation_thread_stops_a_cancelled_job_while_text_is_held() {
        struct Blank {
            calls: usize,
            sent: Arc<AtomicU64>,
        }
        impl Mt for Blank {
            fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
                Ok(text.split_whitespace().count())
            }
            fn stream(
                &mut self,
                _: &ChatRequest,
                on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
            ) -> Result<StreamEnd, MtError> {
                self.calls += 1;
                if self.calls == 1 {
                    return Ok(StreamEnd::default()); // lần làm nóng
                }
                for _ in 0..10_000 {
                    self.sent.fetch_add(1, Ordering::SeqCst);
                    std::thread::sleep(Duration::from_millis(1));
                    if on_delta(" ").is_break() {
                        return Ok(StreamEnd {
                            cancelled: true,
                            ..StreamEnd::default()
                        });
                    }
                }
                Ok(StreamEnd::default())
            }
        }
        let sent = Arc::new(AtomicU64::new(0));
        let (jobs_tx, jobs_rx) = mpsc::channel::<MtJob>();
        let (tx, rx) = mpsc::channel::<Msg>();
        let mt = Box::new(Blank {
            calls: 0,
            sent: sent.clone(),
        });
        let thread = std::thread::spawn(move || {
            mt_loop(
                mt,
                jobs_rx,
                &tx,
                &MtConfig::default(),
                Lang::Vi,
                &AtomicBool::new(false),
                &SharedGlossary::default(),
            )
        });
        let cancel = Arc::new(AtomicBool::new(false));
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
        let deadline = Instant::now() + Duration::from_secs(5);
        while sent.load(Ordering::SeqCst) < 5 {
            assert!(Instant::now() < deadline, "stream phải bắt đầu");
            std::thread::sleep(Duration::from_millis(1));
        }
        cancel.store(true, Ordering::SeqCst);
        let outcome = loop {
            match rx
                .recv_timeout(Duration::from_secs(2))
                .expect("câu bị hủy phải xong trong 2 giây")
            {
                Msg::MtDone { outcome, .. } => break outcome,
                _ => continue,
            }
        };
        assert_eq!(outcome, Outcome::Cancelled);
        assert!(sent.load(Ordering::SeqCst) < 10_000);
        drop(jobs_tx);
        thread.join().unwrap();
    }

    /// "Đang trễ" khi đoạn cũ nhất còn đang xử lý trễ quá 6 giây, tắt khi bắt kịp (§7).
    #[test]
    fn the_lag_indicator_follows_the_oldest_unfinished_segment() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib translate
```

Expected: lỗi biên dịch `struct Job<'_> has no field named cancel`.

Test của `mt_loop` đỏ theo cách khác: khi đã có trường `cancel` mà `mt_loop` chưa truyền cờ, nó hết giờ, báo "câu bị hủy phải xong trong 2 giây". Lúc dựng thử kế hoạch đã kiểm đúng như vậy.

- [ ] **Step 3: Cài**

`crates/pipeline/src/translate.rs`: thay

```rust
use std::ops::ControlFlow;
use std::time::Instant;
```

bằng

```rust
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
```

thay

```rust
    /// card không có mẫu gộp hai thứ, và cờ ngữ cảnh chỉ là thử nghiệm, mặc định tắt.
    pub terms: &'a [Term],
}
```

bằng

```rust
    /// card không có mẫu gộp hai thứ, và cờ ngữ cảnh chỉ là thử nghiệm, mặc định tắt.
    pub terms: &'a [Term],
    /// Cờ hủy (spec 2026-10-10 §4.6, A2): `translate` kiểm trước khi gửi request và ở mỗi gói chữ stream về, kể cả gói
    /// đang bị hậu xử lý giữ lại. Bật thì trả `Outcome::Cancelled`.
    pub cancel: Option<&'a AtomicBool>,
}
```

thay

```rust
    let started = Instant::now();
    let prompt = match job.context {
```

bằng

```rust
    let started = Instant::now();
    let is_cancelled = || job.cancel.is_some_and(|c| c.load(Ordering::SeqCst));
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let prompt = match job.context {
```

thay

```rust
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
```

bằng

```rust
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        if is_cancelled() {
            return Outcome::Cancelled;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
```

thay

```rust
        let result = mt.stream(&req, &mut |chunk| match pp.push(chunk) {
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
        });
```

bằng

```rust
        let result = mt.stream(&req, &mut |chunk| {
            // Kiểm ở mọi gói, cả khi hậu xử lý còn giữ chữ (nhãn chưa rõ, ngoặc mở): không chờ gói được hiện tiếp theo.
            if is_cancelled() {
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
```

và trong khối test, thay

```rust
            context: None,
            terms: &[],
        }
    }
```

bằng

```rust
            context: None,
            terms: &[],
            cancel: None,
        }
    }
```

`crates/pipeline/src/engine.rs`: thay

```rust
            context: job.context.as_deref(),
            terms: &terms,
        };
        let outcome = translate(&mut *mt, &request, cfg, &mut |event| {
            if job.cancel.load(Ordering::SeqCst) {
                return ControlFlow::Break(());
            }
            let msg = match event {
```

bằng

```rust
            context: job.context.as_deref(),
            terms: &terms,
            // Luồng phụ đề bật cờ khi câu được ghép thêm hay khi hết hạn dừng: `translate` kiểm ở mọi gói (H1).
            cancel: Some(job.cancel.as_ref()),
        };
        let outcome = translate(&mut *mt, &request, cfg, &mut |event| {
            let msg = match event {
```

`crates/latency-bench/src/mt_eval.rs`: thay

```rust
            // A3 chấm prompt mặc định, không có từ điển.
            terms: &[],
        };
```

bằng

```rust
            // A3 chấm prompt mặc định, không có từ điển.
            terms: &[],
            cancel: None,
        };
```

`crates/pipeline/tests/real_terms.rs`: thay

```rust
        context: None,
        terms,
    };
```

bằng

```rust
        context: None,
        terms,
        cancel: None,
    };
```

`crates/pipeline/tests/lifecycle.rs`: thay

```rust
        context: None,
        terms: &[],
    };
    let mut mt = s.manager.mt();
```

bằng

```rust
        context: None,
        terms: &[],
        cancel: None,
    };
    let mut mt = s.manager.mt();
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo test --locked -p latency-bench
cargo fmt --all -- --check
cargo clippy --locked -p pipeline -p latency-bench --all-targets -- -D warnings
```

Expected:
- mọi test đạt; có `a_job_cancelled_before_it_starts_sends_no_request`, `a_cancel_is_seen_while_the_postprocessor_holds_the_text`, `a_cancel_between_attempts_skips_the_retry` và `the_translation_thread_stops_a_cancelled_job_while_text_is_held`;
- fmt không in gì;
- clippy không cảnh báo.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/translate.rs crates/pipeline/src/engine.rs crates/pipeline/tests/real_terms.rs \
  crates/pipeline/tests/lifecycle.rs crates/latency-bench/src/mt_eval.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): kiểm cờ hủy trước request và ở mọi gói stream (A2, H1)

Job có cancel; translate trả Cancelled trước /tokenize, trước mỗi lần thử và ở mọi gói, kể cả khi hậu xử lý còn giữ
chữ. mt_loop truyền cờ của câu; trước đây cờ chỉ được xem khi có chữ được hiện.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có đúng năm file.

---

## Task 5: A2 — ghép câu giữ bản dịch đang hiện (H2)

Đúng H2 của kế hoạch 00:
- **`grow`** không xóa `tgt_text`. Chữ đang hiện chuyển sang `held`, upsert vẫn mang chữ cũ, và `fresh` được xóa.
- **`dispatch`** của câu có `held` không xóa `tgt_text`.
- **`MtDelta`**, khi đang có `held`: cộng chữ vào `fresh` và không phát delta. Khi `fresh` có ít nhất bằng số ký tự của `held`:
  - bỏ `held`;
  - gán `tgt_text = fresh`;
  - phát upsert;
  - xóa `fresh`;
  - từ gói sau, phát delta như thường.
- **`MtRetry`** khi có `held`: chỉ xóa `fresh`.
- **`settle`** luôn bỏ `held`, xóa `fresh`, rồi ghi chữ cuối.

Cộng QĐ4: `lineView` hiện chữ dịch khi câu ở `asr_done` mà có `tgt_text`. Sink của test thêm danh sách delta để kiểm delta.

**Files:**
- Modify: `crates/pipeline/src/engine.rs`:
  - `SubState` (dòng 799–809);
  - `Msg::MtDelta` và `Msg::MtRetry` trong `handle` (dòng 943–958);
  - `SubState` mới trong `on_asr` (dòng 1069–1079);
  - `grow` (dòng 1128–1131);
  - `dispatch` (dòng 1314–1316);
  - `settle` (dòng 1396–1398);
  - test: `Sink`, `Harness` và bốn test mới.
- Modify: `src/lib/subtitleView.ts` (dòng 6 và 36–37)
- Modify: `src/lib/subtitleView.test.ts`

- [ ] **Step 1: Viết test**

`crates/pipeline/src/engine.rs`, trong `mod tests`: thay

```rust
    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        indicators: Mutex<Vec<Indicators>>,
```

bằng

```rust
    #[derive(Default)]
    struct Sink {
        subs: Mutex<Vec<Subtitle>>,
        deltas: Mutex<Vec<Delta>>,
        indicators: Mutex<Vec<Indicators>>,
```

thay

```rust
        fn delta(&self, _: &Delta) {}
```

bằng

```rust
        fn delta(&self, d: &Delta) {
            self.deltas.lock().unwrap().push(d.clone());
        }
```

thay

```rust
        fn finish(&mut self, job: &MtJob, outcome: Outcome) -> bool {
```

bằng

```rust
        /// Luồng dịch gửi một phần chữ của `job`.
        fn delta(&mut self, job: &MtJob, text: &str) -> bool {
            self.feed(Msg::MtDelta {
                sub_id: job.sub_id,
                version: job.version,
                text: text.into(),
            })
        }

        /// Chữ dịch của mọi upsert của phụ đề `id`, theo thứ tự.
        fn tgt_texts(&self, id: u64) -> Vec<String> {
            self.sink
                .subs
                .lock()
                .unwrap()
                .iter()
                .filter(|s| s.id == id)
                .map(|s| s.tgt_text.clone())
                .collect()
        }

        fn finish(&mut self, job: &MtJob, outcome: Outcome) -> bool {
```

thay

```rust
    /// H1: luồng dịch truyền cờ hủy của câu cho `translate`, nên câu bị hủy dừng ngay cả khi hậu xử lý chưa hiện chữ nào
```

bằng

```rust
    /// A2 (spec 2026-10-10 §8; H2 của kế hoạch 00): câu được ghép thêm đoạn thì bản dịch đang hiện không bị xóa; bản dịch
    /// mới chỉ thay vào khi đã dài ít nhất bằng nó (đếm ký tự), bằng một upsert; từ đó chữ mới tới bằng delta như thường.
    #[test]
    fn a_merge_keeps_the_shown_translation_until_the_new_one_is_as_long() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.delta(&j1, "chúng tôi");
        h.delta(&j1, " đã đi");
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        assert_eq!((j2.version, j2.text.as_str()), (2, "so we went home."));
        let grown = h.last(1);
        assert_eq!(
            (grown.status, grown.tgt_text.as_str()),
            (Status::Translating, "chúng tôi đã đi"),
            "bản cũ vẫn hiện"
        );
        let deltas_before = h.sink.deltas.lock().unwrap().len();
        h.delta(&j2, "chúng tôi");
        h.delta(&j2, " về");
        assert_eq!(
            h.last(1).tgt_text,
            "chúng tôi đã đi",
            "bản mới (12 ký tự) còn ngắn hơn bản cũ (15)"
        );
        h.delta(&j2, " nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.", "đủ dài: thay vào bằng upsert");
        assert_eq!(
            h.sink.deltas.lock().unwrap().len(),
            deltas_before,
            "chữ của bản mới chưa đi bằng delta"
        );
        h.delta(&j2, " Xong");
        let last_delta = h.sink.deltas.lock().unwrap().last().cloned().unwrap();
        assert_eq!(
            (last_delta.id, last_delta.text.as_str()),
            (1, " Xong"),
            "sau khi thay: delta như thường"
        );
        h.finish(&j2, done("chúng tôi về nhà. Xong"));
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà. Xong");
        let tgts = h.tgt_texts(1);
        let first = tgts.iter().position(|t| !t.is_empty()).unwrap();
        assert!(
            tgts[first..].iter().all(|t| !t.is_empty()),
            "không lúc nào xóa trắng: {tgts:?}"
        );
    }

    /// A2: câu được ghép thêm khi bản dịch đầu còn đang tới: phần đã hiện được giữ, cả lúc câu chờ luồng dịch trả bản cũ
    /// (đã hủy) lẫn lúc gửi đi dịch lại.
    #[test]
    fn a_sentence_growing_mid_translation_keeps_the_partial_text() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.delta(&j1, "chúng tôi");
        h.said(2, 1_300, 2_000, "en", "home.");
        assert!(j1.cancel.load(Ordering::SeqCst));
        let waiting = h.last(1);
        assert_eq!(
            (waiting.status, waiting.tgt_text.as_str()),
            (Status::AsrDone, "chúng tôi")
        );
        h.finish(&j1, Outcome::Cancelled);
        let j2 = h.job();
        assert_eq!(h.last(1).tgt_text, "chúng tôi", "gửi đi dịch không xóa bản đang giữ");
        h.delta(&j2, "chúng tôi về nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.");
    }

    /// A2: lần dịch đầu của câu mới hỏng (thử lại) trong lúc đang giữ bản cũ: chỉ bỏ chữ mới, bản cũ vẫn hiện; lần thử lại
    /// đếm lại từ đầu.
    #[test]
    fn a_retry_while_holding_drops_only_the_fresh_text() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home.");
        let j2 = h.job();
        h.delta(&j2, "rác rác rác");
        h.feed(Msg::MtRetry {
            sub_id: 1,
            version: j2.version,
        });
        assert_eq!(h.last(1).tgt_text, "chúng tôi đã đi");
        h.delta(&j2, "chúng tôi về nhà.");
        assert_eq!(h.last(1).tgt_text, "chúng tôi về nhà.");
    }

    /// A2: trạng thái cuối không bao giờ mang bản đang giữ: dịch hỏng thì chữ dịch rỗng, bản mới ngắn hơn thì là bản mới.
    #[test]
    fn settling_drops_the_held_translation() {
        let mut h = harness();
        h.said(1, 0, 1_000, "en", "so we went");
        let j1 = h.job();
        h.finish(&j1, done("chúng tôi đã đi"));
        h.said(2, 1_300, 2_000, "en", "home");
        let j2 = h.job();
        h.finish(
            &j2,
            Outcome::Failed {
                reason: "x".into(),
                attempts: 2,
                source_tokens: 1,
                completion_tokens: None,
            },
        );
        let failed = h.last(1);
        assert_eq!((failed.status, failed.tgt_text.as_str()), (Status::Failed, ""));
        h.said(3, 2_300, 3_000, "en", "now.");
        let j3 = h.job();
        h.finish(&j3, done("về"));
        let last = h.last(1);
        assert_eq!((last.status, last.tgt_text.as_str()), (Status::Done, "về"));
    }

    /// H1: luồng dịch truyền cờ hủy của câu cho `translate`, nên câu bị hủy dừng ngay cả khi hậu xử lý chưa hiện chữ nào
```

`src/lib/subtitleView.test.ts`: thay

```ts
  it("phụ đề tạm giữ cờ provisional", () => {
```

bằng

```ts
  it("câu vừa được ghép thêm đoạn vẫn hiện bản dịch cũ trong lúc chờ dịch lại (A2)", () => {
    expect(lineView(sub("asr_done", "Xin chào", true), true)).toEqual({
      kind: "translating",
      main: "Xin chào",
      source: "Hello",
      provisional: true,
    });
  });

  it("phụ đề tạm giữ cờ provisional", () => {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline --lib engine
pnpm test
```

Expected:
- Ba test Rust `FAILED`:
  - `a_merge_keeps_the_shown_translation_until_the_new_one_is_as_long`, vì bản cũ bị xóa thành `""`;
  - `a_sentence_growing_mid_translation_keeps_the_partial_text`;
  - `a_retry_while_holding_drops_only_the_fresh_text`.
- `settling_drops_the_held_translation` đạt ngay; nó giữ luật `settle`.
- Vitest báo một test đỏ ở `subtitleView.test.ts`: kind `pending` thay vì `translating`.

- [ ] **Step 3: Cài**

`crates/pipeline/src/engine.rs`: thay

```rust
    /// Ngữ cảnh chụp lúc mở câu (cờ `translationContext`).
    context: Option<String>,
}

struct InFlight {
```

bằng

```rust
    /// Ngữ cảnh chụp lúc mở câu (cờ `translationContext`).
    context: Option<String>,
    /// Bản dịch của phiên bản trước, vẫn đang hiện trên màn hình trong lúc phiên bản mới (sau khi ghép câu) đang dịch.
    held: Option<String>,
    /// Chữ của bản dịch mới nhận được trong lúc `held` còn hiện.
    fresh: String,
}

struct InFlight {
```

thay

```rust
            Msg::MtDelta { sub_id, version, text } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.push_str(&text);
                    self.sink.delta(&Delta { id: sub_id, text });
                }
            }
            Msg::MtRetry { sub_id, version } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    state.sub.tgt_text.clear();
                    self.sink.subtitle(&state.sub);
                }
            }
```

bằng

```rust
            Msg::MtDelta { sub_id, version, text } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    if let Some(held_chars) = state.held.as_ref().map(|h| h.chars().count()) {
                        // Bản cũ còn hiện (A2): bản mới chỉ thay vào khi đã dài ít nhất bằng nó.
                        state.fresh.push_str(&text);
                        if state.fresh.chars().count() >= held_chars {
                            state.held = None;
                            state.sub.tgt_text = std::mem::take(&mut state.fresh);
                            self.sink.subtitle(&state.sub);
                        }
                    } else {
                        state.sub.tgt_text.push_str(&text);
                        self.sink.delta(&Delta { id: sub_id, text });
                    }
                }
            }
            Msg::MtRetry { sub_id, version } => {
                if self.is_current(sub_id, version)
                    && let Some(state) = self.subs.get_mut(&sub_id)
                {
                    if state.held.is_some() {
                        // Chữ mới chưa từng hiện: bỏ nó, bản cũ vẫn hiện.
                        state.fresh.clear();
                    } else {
                        state.sub.tgt_text.clear();
                        self.sink.subtitle(&state.sub);
                    }
                }
            }
```

thay

```rust
                            speech_ms,
                            counted_ms: 0,
                            context,
                        },
```

bằng

```rust
                            speech_ms,
                            counted_ms: 0,
                            context,
                            held: None,
                            fresh: String::new(),
                        },
```

thay

```rust
        state.sub.end_ms = end_ms;
        state.sub.tgt_text.clear();
        state.sub.status = Status::AsrDone;
```

bằng

```rust
        state.sub.end_ms = end_ms;
        // A2: không xóa bản dịch đang hiện; giữ nó tới khi bản dịch của câu mới dài ít nhất bằng nó. Chữ mới của phiên bản
        // cũ (nếu đang giữ) không còn đúng.
        if !state.sub.tgt_text.is_empty() {
            state.held = Some(state.sub.tgt_text.clone());
        }
        state.fresh.clear();
        state.sub.status = Status::AsrDone;
```

thay

```rust
            state.sub.status = Status::Translating;
            state.sub.tgt_text.clear();
            self.sink.subtitle(&state.sub);
```

bằng

```rust
            state.sub.status = Status::Translating;
            if state.held.is_none() {
                state.sub.tgt_text.clear();
            }
            self.sink.subtitle(&state.sub);
```

thay

```rust
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
```

bằng

```rust
        state.held = None;
        state.fresh.clear();
        state.sub.status = status;
        state.sub.tgt_text = tgt_text;
        self.sink.subtitle(&state.sub);
        if state.closed {
```

`src/lib/subtitleView.ts`: thay

```ts
// - `asr_done`: đã có câu gốc, chờ dịch: câu gốc màu nhạt.
```

bằng

```ts
// - `asr_done`: đã có câu gốc, chờ dịch: câu gốc màu nhạt. Câu vừa được ghép thêm đoạn mà bản dịch cũ còn được giữ (spec
//   2026-10-10 §8, A2) thì vẫn hiện bản dịch cũ, như `translating`.
```

thay

```ts
    case "asr_done":
      return sourceOnly("pending");
```

bằng

```ts
    case "asr_done":
      return s.tgt_text ? translated("translating") : sourceOnly("pending");
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p pipeline
cargo fmt --all -- --check
cargo clippy --locked -p pipeline --all-targets -- -D warnings
pnpm build && pnpm test
```

Expected:
- mọi test Rust đạt, kể cả test tích hợp `tests/engine.rs` (phụ đề ghép câu với server giả vẫn ra đúng chữ cuối);
- fmt và clippy sạch;
- `pnpm build` không lỗi; Vitest đạt hết.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/pipeline/src/engine.rs src/lib/subtitleView.ts src/lib/subtitleView.test.ts
git -C "$W" commit -m "$(cat <<'EOF'
feat(pipeline): ghép câu không xóa bản dịch đang hiện (A2, H2)

SubState có held và fresh: bản dịch cũ còn hiện tới khi bản mới dài ít nhất bằng nó (đếm ký tự), rồi thay bằng một
upsert; MtRetry chỉ bỏ chữ mới; settle bỏ held. lineView hiện chữ dịch đang giữ khi câu ở asr_done, để thanh phụ đề và
bản chép lời không quay về câu gốc trong lúc dịch lại.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có đúng ba file.

---
## Task 6: A3 — resample theo khối 10 ms

Khối 1024 khung (21,3 ms ở 48 kHz) gây trễ hai lần:
- chờ đủ khối;
- trễ của bộ lọc FFT (`output_delay` = `fft_size_out / 2`: 171 mẫu 16 kHz = 10,7 ms ở 48 kHz, 240 mẫu = 15 ms ở 44,1 kHz).

Khối 10 ms âm thanh vào (`rate / 100`) cho khối FFT ra 160 mẫu ở 48, 44,1 và 96 kHz, nên bộ lọc như nhau ở các tần số đó. Số đo của QĐ5 lấy từ chính các test dưới đây; test cũ (`stereo_48k_becomes_mono_16k_with_same_pitch_and_level`, `mono_16k_passes_through`) giữ nguyên.

**Files:**
- Modify: `crates/audio-capture/src/resample.rs` (dòng 9, 21–22, 30, thêm test trước `mono_16k_passes_through`)

- [ ] **Step 1: Viết test**

`crates/audio-capture/src/resample.rs`: thay

```rust
    #[test]
    fn mono_16k_passes_through() {
```

bằng

```rust
    /// Mức (dB) của sóng sin `freq` sau khi resample từ `rate` stereo, so với mức vào; bỏ phần khởi động của bộ lọc.
    fn gain_db(rate: u32, freq: f32) -> f32 {
        let mut r = MonoResampler::new(rate, 2).unwrap();
        let mut out = Vec::new();
        r.process(&sine(rate, 2, freq, 1.0), &mut out).unwrap();
        let steady = &out[4_000..out.len() - 100];
        20.0 * (rms(steady) / (0.5 / 2f32.sqrt())).log10()
    }

    #[test]
    fn blocks_are_10_ms_of_input() {
        assert_eq!(block_frames(48_000), 480);
        assert_eq!(block_frames(44_100), 441);
        assert_eq!(block_frames(96_000), 960);
        assert_eq!(block_frames(8_000), 80);
        assert_eq!(block_frames(50), 1);
    }

    /// A3: khối 10 ms vẫn giữ nguyên dải tiếng nói và chặn alias, ở các tần số vào thường gặp.
    #[test]
    fn speech_band_is_flat_and_aliases_are_rejected() {
        for rate in [48_000, 44_100, 96_000] {
            for freq in [1_000.0, 6_000.0, 7_000.0] {
                let db = gain_db(rate, freq);
                assert!(db.abs() < 0.3, "{rate} Hz, {freq} Hz: {db:.2} dB");
            }
            for freq in [9_000.0, 12_000.0] {
                let db = gain_db(rate, freq);
                assert!(db < -55.0, "{rate} Hz, {freq} Hz: {db:.2} dB");
            }
        }
    }

    /// A3: trễ của bộ lọc khoảng 5 ms (đỉnh xung lệch 80 mẫu 16 kHz), trước là 171 mẫu (10,7 ms) ở 48 kHz.
    #[test]
    fn the_filter_delay_is_about_5_ms() {
        for rate in [48_000u32, 44_100] {
            let mut r = MonoResampler::new(rate, 1).unwrap();
            let mut input = vec![0.0f32; rate as usize];
            input[rate as usize / 2] = 1.0;
            let mut out = Vec::new();
            r.process(&input, &mut out).unwrap();
            let peak = out
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.abs().total_cmp(&b.1.abs()))
                .unwrap()
                .0;
            let delay = peak as i64 - 8_000;
            assert!((76..=84).contains(&delay), "{rate} Hz: trễ {delay} mẫu");
        }
    }

    /// A3, điều kiện "CPU không tăng đáng kể": in thời gian resample 60 giây 48 kHz stereo với khối 10 ms và khối cũ
    /// 1024, theo các lần đọc 10 ms như thiết bị. Chạy tay ở bản release:
    /// `cargo test --release -p audio-capture cpu_cost_of_10_ms_blocks -- --ignored --nocapture`.
    #[test]
    #[ignore = "đo thời gian, chạy tay ở bản release"]
    fn cpu_cost_of_10_ms_blocks() {
        let input = sine(48_000, 2, 440.0, 60.0);
        let time = |block: usize| {
            let mut r = MonoResampler::with_block(48_000, 2, block).unwrap();
            let mut out = Vec::new();
            let started = std::time::Instant::now();
            for piece in input.chunks(960) {
                r.process(piece, &mut out).unwrap();
            }
            started.elapsed()
        };
        let (new, old) = (time(block_frames(48_000)), time(1024));
        println!("60 giây 48 kHz stereo: khối 10 ms {new:?}, khối 1024 {old:?}");
        assert!(new < old * 2, "khối 10 ms tốn hơn gấp đôi khối 1024");
    }

    #[test]
    fn mono_16k_passes_through() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p audio-capture resample
```

Expected: lỗi biên dịch, vì chưa có `block_frames` và `MonoResampler::with_block`.

Khi đã có hai hàm này mà khối vẫn 1024, `the_filter_delay_is_about_5_ms` đỏ với "trễ 171 mẫu".

- [ ] **Step 3: Cài**

`crates/audio-capture/src/resample.rs`: thay

```rust
pub const TARGET_RATE: u32 = 16_000;
const CHUNK: usize = 1024;
```

bằng

```rust
pub const TARGET_RATE: u32 = 16_000;

/// Số khung vào của mỗi khối resample: 10 ms âm thanh vào (spec 2026-10-10 §8, A3; trước là 1024 khung, khoảng 21 ms ở
/// 48 kHz).
/// - Khối 10 ms khớp chu kỳ thường gặp của thiết bị (CoreAudio, WASAPI), nên mỗi lần đọc là ra mẫu ngay, không chờ đủ
///   khối 21 ms.
/// - Khối FFT ra 160 mẫu ở mọi tần số vào thường gặp (48; 44,1; 96 kHz), nên bộ lọc chống alias như nhau: phẳng tới
///   7 kHz (lệch dưới 0,2 dB), −18 dB ở 7,5 kHz, chặn từ 60 dB trên 8 kHz (test bên dưới). Trước đó phẳng tới 7,5 kHz.
/// - Trễ của bộ lọc còn 5 ms (trước 10,7 ms ở 48 kHz, 15 ms ở 44,1 kHz).
/// - Tốn CPU không hơn: 60 giây 48 kHz stereo hết khoảng 12 ms, khối 1024 hết 17–19 ms (`cpu_cost_of_10_ms_blocks`).
pub fn block_frames(input_rate: u32) -> usize {
    (input_rate as usize / 100).max(1)
}
```

thay

```rust
    pub fn new(input_rate: u32, channels: u16) -> Result<Self> {
        let inner = if input_rate == TARGET_RATE {
```

bằng

```rust
    pub fn new(input_rate: u32, channels: u16) -> Result<Self> {
        Self::with_block(input_rate, channels, block_frames(input_rate))
    }

    /// Như `new`, với khối `block` khung vào (test so với khối cũ 1024).
    fn with_block(input_rate: u32, channels: u16, block: usize) -> Result<Self> {
        let inner = if input_rate == TARGET_RATE {
```

thay

```rust
                    TARGET_RATE as usize,
                    CHUNK,
                    1,
```

bằng

```rust
                    TARGET_RATE as usize,
                    block,
                    1,
```

- [ ] **Step 4: Chạy, thấy xanh; đo CPU**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p audio-capture
cargo test --release --locked -p audio-capture cpu_cost_of_10_ms_blocks -- --ignored --nocapture
cargo fmt --all -- --check
cargo clippy --locked -p audio-capture --all-targets -- -D warnings
```

Expected:
- test của crate đạt hết, kể cả `two_sources_at_different_rates_are_resampled_then_mixed` (48 kHz và 44,1 kHz qua `Preprocessor`);
- lệnh thứ hai in `60 giây 48 kHz stereo: khối 10 ms …ms, khối 1024 …ms`, khối 10 ms không chậm hơn (dựng thử: 11,9 ms so với 16,9 ms), và test đạt;
- fmt và clippy sạch.

Ghi số đo CPU vào ghi chú của Task 12.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/audio-capture/src/resample.rs
git -C "$W" commit -m "$(cat <<'EOF'
perf(audio-capture): resample theo khối 10 ms thay cho 1024 khung (A3)

Khối 10 ms âm thanh vào: không chờ đủ 21 ms, trễ của bộ lọc 5 ms thay cho 10,7–15 ms; vẫn phẳng tới 7 kHz và chặn từ
60 dB trên 8 kHz ở 48; 44,1 và 96 kHz; CPU không tăng. Test đáp ứng tần số, trễ và CPU.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có một file.

---

## Task 7: A3 — đọc thu âm ngay khi có mẫu

`LiveCapture::read` (`src-tauri/src/capture.rs`, dòng 595) ngủ cố định `timeout.min(20 ms)` rồi mới đọc. Mẫu tới ngay sau lần đọc trước phải chờ thêm tới 20 ms, trung bình khoảng 10 ms.

Hàm mới `drain_when_ready` (`audio-capture`, hàm thuần, test được không cần thiết bị):
- đọc ngay;
- chưa có mẫu thì ngủ 5 ms rồi thử lại, tới khi có mẫu hoặc hết `timeout`.

Lúc không có âm thanh (nguồn chưa chạy, hay macOS không có app nào phát), hành vi như cũ: hết 20 ms thì trả rỗng, `ClockFiller` chèn im lặng theo đồng hồ thật.

**Files:**
- Modify: `crates/audio-capture/src/preprocess.rs` (dòng 10–11, thêm hàm trước `ClockFiller`, thêm test trước `zero_or_three_sources_are_refused`)
- Modify: `src-tauri/src/capture.rs` (dòng 32, 59, 594–599)

- [ ] **Step 1: Viết test**

`crates/audio-capture/src/preprocess.rs`: thay

```rust
    #[test]
    fn zero_or_three_sources_are_refused() {
```

bằng

```rust
    #[test]
    fn reading_returns_as_soon_as_samples_arrive() {
        use std::time::{Duration, Instant};
        let mut calls = 0;
        let mut buf = Vec::new();
        let started = Instant::now();
        drain_when_ready(&mut buf, Duration::from_secs(5), Duration::from_millis(1), |b| {
            calls += 1;
            if calls == 3 {
                b.extend_from_slice(&[0.1; 160]);
            }
            Ok(())
        })
        .unwrap();
        assert_eq!((calls, buf.len()), (3, 160));
        assert!(started.elapsed() < Duration::from_secs(1), "{:?}", started.elapsed());
    }

    #[test]
    fn samples_already_waiting_are_read_without_sleeping() {
        use std::time::{Duration, Instant};
        let mut buf = Vec::new();
        let started = Instant::now();
        drain_when_ready(&mut buf, Duration::from_secs(5), Duration::from_secs(5), |b| {
            b.push(0.5);
            Ok(())
        })
        .unwrap();
        assert_eq!(buf, [0.5]);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn without_samples_the_read_waits_at_most_the_timeout() {
        use std::time::{Duration, Instant};
        let mut buf = Vec::new();
        let started = Instant::now();
        drain_when_ready(
            &mut buf,
            Duration::from_millis(30),
            Duration::from_millis(5),
            |_| Ok(()),
        )
        .unwrap();
        let waited = started.elapsed();
        assert!(buf.is_empty());
        assert!(
            waited >= Duration::from_millis(30) && waited < Duration::from_secs(1),
            "{waited:?}"
        );
    }

    #[test]
    fn a_drain_error_is_returned() {
        use std::time::Duration;
        let mut buf = Vec::new();
        let err = drain_when_ready(&mut buf, Duration::from_secs(1), Duration::from_millis(1), |_| {
            anyhow::bail!("ring hỏng")
        });
        assert_eq!(err.unwrap_err().to_string(), "ring hỏng");
    }

    #[test]
    fn zero_or_three_sources_are_refused() {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p audio-capture preprocess
```

Expected: lỗi biên dịch `cannot find function drain_when_ready`.

- [ ] **Step 3: Cài**

`crates/audio-capture/src/preprocess.rs`: thay

```rust
/// Ring buffer của mỗi nguồn chứa được 30 giây âm thanh 48 kHz stereo (spec §6.1). Thiết bị có tần số hay số kênh lớn
/// hơn thì ring chứa được ít giây hơn; luồng tiền xử lý đọc ring mỗi 20 ms nên vẫn dư nhiều.
```

bằng

```rust
/// Ring buffer của mỗi nguồn chứa được 30 giây âm thanh 48 kHz stereo (spec §6.1). Thiết bị có tần số hay số kênh lớn
/// hơn thì ring chứa được ít giây hơn; luồng đọc lấy mẫu ngay khi có (`drain_when_ready`, tối đa mỗi 20 ms) nên vẫn dư
/// nhiều.
```

thay

```rust
/// Giữ luồng 16 kHz đi đúng đồng hồ thật khi nguồn không trả mẫu (macOS: tap chưa chạy vì đang chờ app phát tiếng, hoặc
```

bằng

```rust
/// Đọc mẫu ngay khi có (spec 2026-10-10 §8, A3), thay cho ngủ cố định 20 ms trước mỗi lần đọc: gọi `drain` (ghi thêm mẫu
/// vào `buf`); chưa có mẫu nào thì ngủ `step` rồi thử lại, tới khi có mẫu hoặc hết `timeout`. Trả lỗi đầu tiên của `drain`.
pub fn drain_when_ready(
    buf: &mut Vec<f32>,
    timeout: std::time::Duration,
    step: std::time::Duration,
    mut drain: impl FnMut(&mut Vec<f32>) -> Result<()>,
) -> Result<()> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        drain(buf)?;
        let now = std::time::Instant::now();
        if !buf.is_empty() || now >= deadline {
            return Ok(());
        }
        std::thread::sleep(step.min(deadline - now));
    }
}

/// Giữ luồng 16 kHz đi đúng đồng hồ thật khi nguồn không trả mẫu (macOS: tap chưa chạy vì đang chờ app phát tiếng, hoặc
```

`src-tauri/src/capture.rs`: thay

```rust
use audio_capture::preprocess::{ClockFiller, Preprocessor, RING_SAMPLES};
```

bằng

```rust
use audio_capture::preprocess::{ClockFiller, Preprocessor, RING_SAMPLES, drain_when_ready};
```

thay

```rust
/// `LiveCapture` bị hủy thì chờ luồng thu tối đa chừng này, để tap cũ không còn chạy song song với phiên mới.
const JOIN_WITHIN: Duration = Duration::from_millis(500);
```

bằng

```rust
/// `LiveCapture` bị hủy thì chờ luồng thu tối đa chừng này, để tap cũ không còn chạy song song với phiên mới.
const JOIN_WITHIN: Duration = Duration::from_millis(500);
/// Bước chờ giữa hai lần xem luồng thu đã có mẫu chưa (spec 2026-10-10 §8, A3). Thiết bị thường trả mẫu mỗi 10 ms: chờ
/// 5 ms mỗi bước thì mẫu được đọc trễ trung bình khoảng 2,5 ms (trước là ngủ cố định 20 ms trước mỗi lần đọc, trễ trung
/// bình khoảng 10 ms), và lúc không có mẫu nào thì chỉ thức dậy 200 lần mỗi giây.
const POLL_STEP: Duration = Duration::from_millis(5);
```

thay

```rust
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        std::thread::sleep(timeout.min(Duration::from_millis(20)));
        self.buf.clear();
        if let Some(p) = self.shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
            p.drain(&mut self.buf)?;
        }
```

bằng

```rust
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        self.buf.clear();
        let shared = &self.shared;
        drain_when_ready(&mut self.buf, timeout, POLL_STEP, |buf| {
            match shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                Some(p) => p.drain(buf),
                None => Ok(()),
            }
        })?;
```

- [ ] **Step 4: Chạy, thấy xanh; kiểm biên dịch Windows**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p audio-capture
cargo test --locked -p meeting-translator --lib capture::
cargo fmt --all -- --check
cargo clippy --locked -p audio-capture -p meeting-translator --all-targets -- -D warnings
./scripts/check-windows.sh --locked
```

Expected:
- test đạt, gồm 4 test mới của `preprocess` và 10 test `capture::` của app;
- fmt và clippy sạch;
- `check-windows.sh` thoát mã 0 (`LiveCapture` dùng chung cho WASAPI).

Hành vi thật trên thiết bị (macOS tap, WASAPI loopback) được thử tay ở nghiệm thu của kế hoạch 04. Chạy app dev ở worktree này dễ đụng phiên ở thư mục chính: cổng Vite 1420, và cùng bundle id nên dùng chung dữ liệu app.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/audio-capture/src/preprocess.rs src-tauri/src/capture.rs
git -C "$W" commit -m "$(cat <<'EOF'
perf(capture): đọc thu âm ngay khi có mẫu thay cho ngủ cố định 20 ms (A3)

drain_when_ready đọc ngay, chưa có mẫu thì ngủ 5 ms rồi thử lại tới hết timeout; LiveCapture::read dùng hàm này. Lúc
không có âm thanh vẫn trả rỗng sau 20 ms như trước để ClockFiller chèn im lặng.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có hai file.

---

## Task 8: A4 — memo từng dòng của thanh phụ đề

Hiện nay mỗi gói chữ dịch (`subtitle://delta`) làm `Overlay` vẽ lại và chạy `lineView` cho mọi dòng (tối đa `MAX_LINES` = 1000).

Store đã giữ nguyên đối tượng của các dòng không đổi:
- `appendDelta` chỉ tạo đối tượng mới cho dòng cùng `id`;
- `upsertLine` cũng vậy.

Vì vậy tách dòng thành `OverlayLine`, đúng H8: `memo(function OverlayLine({ line, showSource, uiLanguage }))`, so nông. Dòng có cùng đối tượng phụ đề và cùng cài đặt thì không vẽ lại.

Kế hoạch 03 dựng tiếp trên component này:
- prop tùy chọn `dimProvisional`;
- `LiveLineView.tsx` cho dòng đang nói, cùng cấu trúc `.line`, `.source`, `.main`.

**Files:**
- Create: `src/windows/overlay/OverlayLine.test.ts`
- Create: `src/windows/overlay/OverlayLine.tsx`
- Modify: `src/windows/overlay/overlay.tsx` (dòng 9–17, 164–177)
- Modify: `src/store/overlay.test.ts` (thêm test trước "delta nối vào chữ dịch của đúng phụ đề…")

- [ ] **Step 1: Viết test**

Tạo `src/windows/overlay/OverlayLine.test.ts`. Markup mong đợi chính là markup mà `overlay.tsx` hiện vẽ cho từng loại dòng (bản dịch có câu gốc, đang dịch tạm, chờ dịch, dịch lỗi, đoạn bị bỏ):

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
});
```

`src/store/overlay.test.ts`: thay

```ts
  it("delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua", () => {
```

bằng

```ts
  // A4 (spec 2026-10-10 §8): dòng nào không đổi thì giữ nguyên đối tượng, để `OverlayLine` (memo) không vẽ lại nó.
  it("delta và upsert chỉ thay đối tượng của đúng một dòng", () => {
    const lines = [sub(1, "a"), sub(2, "b"), sub(3, "c")];
    const afterDelta = appendDelta(lines, { id: 2, text: " nữa" });
    expect(afterDelta[0]).toBe(lines[0]);
    expect(afterDelta[1]).not.toBe(lines[1]);
    expect(afterDelta[2]).toBe(lines[2]);
    const afterUpsert = upsertLine(lines, sub(3, "c đã xong"), 3);
    expect(afterUpsert[0]).toBe(lines[0]);
    expect(afterUpsert[1]).toBe(lines[1]);
    expect(afterUpsert[2]).not.toBe(lines[2]);
  });

  it("delta nối vào chữ dịch của đúng phụ đề, phụ đề đã trôi khỏi thanh thì bỏ qua", () => {
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm test
```

Expected:
- `src/windows/overlay/OverlayLine.test.ts` lỗi, vì không tìm được `./OverlayLine` (`Failed to resolve import`);
- test mới của store đạt ngay: nó giữ điều kiện mà memo dựa vào.

- [ ] **Step 3: Cài**

Tạo `src/windows/overlay/OverlayLine.tsx`:

```tsx
import { memo } from "react";
import { type UiLanguage, translate } from "../../i18n";
import type { Subtitle } from "../../lib/ipc";
import { lineView } from "../../lib/subtitleView";

// Một dòng của thanh phụ đề (§4.4; H8 của kế hoạch 00 "dịch trong lúc người nói chưa dừng"). Memo theo từng dòng (spec
// 2026-10-10 §8, A4): props là đối tượng phụ đề và hai giá trị nguyên thủy, so nông là đủ. Mỗi gói chữ dịch
// (`subtitle://delta`) chỉ đổi đối tượng của đúng một dòng (`appendDelta`, `upsertLine` giữ nguyên các dòng khác), nên các
// dòng khác không vẽ lại. Kế hoạch 03 thêm prop tùy chọn `dimProvisional` và dòng đang nói (`LiveLineView.tsx`).
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage;
}

export const OverlayLine = memo(function OverlayLine({ line, showSource, uiLanguage }: OverlayLineProps) {
  const v = lineView(line, showSource);
  const classes = ["line", v.kind, v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
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

`src/windows/overlay/overlay.tsx`: thay

```tsx
import {
  HEARING_RMS,
  TEXT_COLORS,
  dateTime,
  lineView,
  localOffsetMinutes,
  overlayBackground,
  overlayNotes,
} from "../../lib/subtitleView";
import { createOverlayStore, createResizeDrag } from "../../store/overlay";
```

bằng

```tsx
import {
  HEARING_RMS,
  TEXT_COLORS,
  dateTime,
  localOffsetMinutes,
  overlayBackground,
  overlayNotes,
} from "../../lib/subtitleView";
import { createOverlayStore, createResizeDrag } from "../../store/overlay";
import { OverlayLine } from "./OverlayLine";
```

thay

```tsx
        {lines.map((l) => {
          const v = lineView(l, view.showSource);
          const classes = ["line", v.kind, v.provisional ? "provisional" : ""].filter(Boolean).join(" ");
          return (
            <div key={l.id} className={classes}>
              {v.source && <div className="source">{v.source}</div>}
              <div className="main">
                {v.kind === "dropped" ? t("subtitle.dropped") : v.main}
                {v.kind === "failed" && <span className="tag">{t("subtitle.failed")}</span>}
              </div>
            </div>
          );
        })}
```

bằng

```tsx
        {lines.map((l) => (
          <OverlayLine key={l.id} line={l} showSource={view.showSource} uiLanguage={view.uiLanguage} />
        ))}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
pnpm build && pnpm test
```

Expected:
- `tsc --noEmit` và `vite build` không lỗi (`dist/overlay.html` vẫn được dựng);
- Vitest đạt hết, có hai test của `OverlayLine.test.ts` (markup; memo so nông) và test mới của store.

- [ ] **Step 5: Xem thanh phụ đề trên trang xem trước**

Trang xem trước (`scripts/ui-preview`) chạy đúng code của `src/` với IPC giả có phụ đề mẫu. Ảnh đối chiếu là `website/src/assets/img/app/overlay-default.vi.webp`, chụp từ cùng trang trên code trước khi tách (commit `74aa727`), cùng cỡ 900×224, tỉ lệ 2.

Chạy ở cổng 1431, vì phiên khác có thể đang dùng cổng 1430 mặc định. Lệnh tự tắt Vite theo PID của nó.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
mkdir -p target/do-tre
node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > target/do-tre/ui-preview.log 2>&1 &
VITE=$!
curl -s -o /dev/null --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:1431/overlay.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=900,224 --force-device-scale-factor=2 --virtual-time-budget=5000 \
  --screenshot="$PWD/target/do-tre/a4-overlay-sau.png" "http://127.0.0.1:1431/overlay.html?session=running&lang=vi"
kill "$VITE"
sips -s format png website/src/assets/img/app/overlay-default.vi.webp --out target/do-tre/a4-overlay-truoc.png
```

Expected:
- Chrome in `… bytes written to file …/a4-overlay-sau.png`;
- mở hai ảnh `target/do-tre/a4-overlay-truoc.png` và `a4-overlay-sau.png` (công cụ đọc ảnh của agent): cùng các dòng phụ đề mẫu, cùng thứ tự, cùng câu gốc ở trên chữ dịch, dòng tạm vẫn mờ, cùng cỡ chữ;
- nền khác nhau là bình thường: ảnh đối chiếu có nền trong suốt, ảnh mới có nền trắng sau lớp nền mờ của thanh.

Ảnh mới không có dòng nào thì chạy lại với `--virtual-time-budget=15000`. Hai ảnh khác nhau ở chữ hay bố cục thì `OverlayLine` vẽ sai: so lại với khối cũ của `overlay.tsx` ở Step 3 trước khi commit.

- [ ] **Step 6: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add src/windows/overlay/OverlayLine.tsx src/windows/overlay/OverlayLine.test.ts \
  src/windows/overlay/overlay.tsx src/store/overlay.test.ts
git -C "$W" commit -m "$(cat <<'EOF'
perf(overlay): memo từng dòng của thanh phụ đề (A4)

Tách OverlayLine (H8), memo so nông theo đối tượng phụ đề và cài đặt hiện; mỗi gói chữ dịch chỉ vẽ lại đúng dòng của
nó. Test markup giống cách vẽ cũ, component là memo so nông, và store giữ nguyên đối tượng của các dòng không đổi.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có bốn file.

---
## Task 9: A5 — `audio_ctx` là bội của 256

Đúng QĐ7:
- `audio_ctx_for_samples` làm tròn kết quả của công thức cũ lên bội của 256, chặn ở 1500; sàn `MIN_AUDIO_CTX` 512 giữ nguyên;
- giao thức (các kiểu, `PROTOCOL_VERSION`) không đổi;
- worker vẫn kiểm `audio_ctx` trong `[0, 1500]` và phủ hết đoạn (`asr_worker::engine::validate`); làm tròn lên chỉ làm cửa sổ rộng hơn, nên vẫn hợp lệ.

Đoạn thường của app (tối đa 8 giây cộng đệm) vẫn là 512. Chỉ đoạn gộp ở hàng đợi (tới 12 giây) đổi, từ 513–687 thành 768.

**Files:**
- Modify: `crates/asr-protocol/src/lib.rs` (sau dòng 35; dòng 285–290; test dòng 372–379)

- [ ] **Step 1: Viết test**

`crates/asr-protocol/src/lib.rs`: thay

```rust
    #[test]
    fn audio_ctx_matches_spec_formula() {
        // Trên sàn: 50 × số giây + 64, làm tròn lên.
        assert_eq!(audio_ctx_for_samples(143_361), 513); // vừa quá 8,96 giây: 449 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 12), 664); // 12 giây: 600 + 64
        assert_eq!(audio_ctx_for_samples(16_000 * 30 - 1), 1500); // sát 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây
    }
```

bằng

```rust
    #[test]
    fn audio_ctx_matches_spec_formula() {
        // Trên sàn: 50 × số giây + 64, làm tròn lên, rồi lên bội của 256 (A5).
        assert_eq!(audio_ctx_for_samples(143_361), 768); // vừa quá 8,96 giây: 449 + 64 = 513
        assert_eq!(audio_ctx_for_samples(16_000 * 12), 768); // 12 giây: 600 + 64 = 664
        assert_eq!(audio_ctx_for_samples(225_280), 768); // 14,08 giây: 704 + 64, đúng bội của 256
        assert_eq!(audio_ctx_for_samples(225_281), 1024);
        assert_eq!(audio_ctx_for_samples(389_120), 1280); // 24,32 giây
        assert_eq!(audio_ctx_for_samples(389_121), 1500); // dài hơn: cửa sổ đầy đủ
        assert_eq!(audio_ctx_for_samples(16_000 * 30 - 1), 1500); // sát 30 giây, bị chặn ở 1500
        assert_eq!(audio_ctx_for_samples(16_000 * 30), 1500); // 30 giây
    }

    /// A5: dưới cửa sổ đầy đủ, `audio_ctx` luôn là bội của 256 và vẫn phủ hết đoạn.
    #[test]
    fn audio_ctx_is_a_multiple_of_256_below_the_full_window() {
        for n in (0..=MAX_PCM_SAMPLES).step_by(997) {
            let ctx = audio_ctx_for_samples(n);
            assert!(ctx == 1500 || ctx % AUDIO_CTX_ALIGN == 0, "{n} mẫu: {ctx}");
            assert!(ctx as usize * 320 >= n, "{n} mẫu: {ctx} không phủ hết đoạn");
        }
    }

    #[test]
    fn align_rounds_up_and_keeps_the_full_window_marker() {
        assert_eq!(align_audio_ctx(0), 0);
        assert_eq!(align_audio_ctx(1), 256);
        assert_eq!(align_audio_ctx(512), 512);
        assert_eq!(align_audio_ctx(513), 768);
        assert_eq!(align_audio_ctx(1281), 1500);
        assert_eq!(align_audio_ctx(1500), 1500);
        assert_eq!(align_audio_ctx(-5), -5);
        assert_eq!(align_audio_ctx(i32::MAX), 1500);
    }
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p asr-protocol
```

Expected: lỗi biên dịch, vì chưa có `AUDIO_CTX_ALIGN` và `align_audio_ctx`.

- [ ] **Step 3: Cài**

`crates/asr-protocol/src/lib.rs`: thay

```rust
pub const MIN_AUDIO_CTX: i32 = 512;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
```

bằng

```rust
pub const MIN_AUDIO_CTX: i32 = 512;

/// Bội số mà [`audio_ctx_for_samples`] làm tròn lên (spec 2026-10-10 §8, A5). whisper.cpp 1.8.3 với flash attention đọc
/// K/V của encoder và cross-attention tới `GGML_PAD(audio_ctx, 256)` mà không có mask (ggml-org/whisper.cpp#3941): phần
/// đệm chứa dữ liệu của đoạn chép trước, nên kết quả sai và đổi theo đoạn trước. `audio_ctx` là bội của 256 thì không có
/// phần đệm. Cửa sổ đầy đủ 1500 (đoạn dài hơn 24,32 giây) vẫn có đệm, nhưng app không gửi đoạn nào dài như vậy (đoạn
/// dài nhất là đoạn gộp ở hàng đợi, 12 giây).
pub const AUDIO_CTX_ALIGN: i32 = 256;

/// Một đoạn 8 giây ở dạng int16 chỉ khoảng 256 KB; 16 MiB là dư nhiều.
```

thay

```rust
/// `audio_ctx = min(1500, max(MIN_AUDIO_CTX, ceil(50 × số giây của đoạn) + 64))`. Làm tròn lên (spec §6.4, "Rút ngắn cửa
/// sổ mã hóa"). Lý do của sàn [`MIN_AUDIO_CTX`] ở hằng đó.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64).saturating_mul(50).div_ceil(SAMPLE_RATE as u64);
    frames.saturating_add(64).max(MIN_AUDIO_CTX as u64).min(1500) as i32
}
```

bằng

```rust
/// `audio_ctx = min(1500, max(MIN_AUDIO_CTX, ceil(50 × số giây của đoạn) + 64))`, làm tròn lên (spec §6.4, "Rút ngắn cửa
/// sổ mã hóa"), rồi lên bội của [`AUDIO_CTX_ALIGN`] ([`align_audio_ctx`]). Kết quả: 512 tới 8,96 giây, 768 tới 14,08 giây,
/// 1024 tới 19,2 giây, 1280 tới 24,32 giây, 1500 khi dài hơn. Lý do của sàn [`MIN_AUDIO_CTX`] ở hằng đó.
pub fn audio_ctx_for_samples(n_samples: usize) -> i32 {
    let frames = (n_samples as u64).saturating_mul(50).div_ceil(SAMPLE_RATE as u64);
    align_audio_ctx(frames.saturating_add(64).max(MIN_AUDIO_CTX as u64).min(1500) as i32)
}

/// `audio_ctx` làm tròn lên bội của [`AUDIO_CTX_ALIGN`], chặn ở 1500 (cửa sổ đầy đủ). 0 (cũng là cửa sổ đầy đủ) và số âm
/// (worker từ chối) giữ nguyên.
pub fn align_audio_ctx(audio_ctx: i32) -> i32 {
    if audio_ctx <= 0 {
        return audio_ctx;
    }
    (audio_ctx.saturating_add(AUDIO_CTX_ALIGN - 1) / AUDIO_CTX_ALIGN * AUDIO_CTX_ALIGN).min(1500)
}
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p asr-protocol
cargo test --locked -p asr-worker --features shared-encode
cargo test --locked -p pipeline -p latency-bench
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
```

Expected:
- mọi test đạt; `audio_ctx_has_a_floor` (sàn 512) và `lid_window_of_mode_a_stays_the_three_second_formula` của `asr-worker` vẫn đạt;
- fmt và clippy sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/asr-protocol/src/lib.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(asr-protocol): audio_ctx làm tròn lên bội của 256 (A5)

audio_ctx_for_samples làm tròn kết quả của công thức (sàn 512) lên bội của 256, chặn ở 1500, để flash attention của
whisper.cpp không đọc phần đệm chứa dữ liệu của đoạn trước (ggml-org/whisper.cpp#3941). Đoạn thường của app vẫn 512;
giao thức không đổi.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có một file. **Ghi lại hash của commit này** (Task 11 cần nếu phải quay lại).

---

## Task 10: A5 — flash attention trong `asr-worker`, test tất định

Theo QĐ7:
- flash attention bật mặc định khi chạy GPU trên macOS (Metal);
- Windows (Vulkan) giữ tắt;
- `ASR_FLASH_ATTN=0` tắt, `=1` bật;
- khi bật, worker làm tròn `audio_ctx` lên bội của 256 trước khi mã hóa (`effective_audio_ctx`), ở cả chế độ B (`shared.rs`) lẫn chế độ A (`full_params`).

Test tất định chạy với model thật, nên có `#[ignore]`. Task 11 chạy nó:
- 5 đoạn cắt từ clip FLEURS của `tests/fixtures/audio/`, `audio_ctx` 512, 768 và 1024;
- chép 12 lần theo thứ tự xen kẽ, để mỗi đoạn đứng sau các đoạn dài ngắn khác nhau;
- chạy cả khi flash attention bật và khi tắt.

Đọc WAV bằng tay (tìm chunk `data`), để không thêm phụ thuộc cho `asr-worker`.

**Files:**
- Modify: `crates/asr-worker/src/engine.rs`: import (dòng 17–20), `primer_requested` (dòng 69–72), `load` (dòng 140–143), `flash_attn` (dòng 187), `run` (dòng 219–235, 272), test (trước `disabled_primers_give_no_context`)
- Create: `crates/asr-worker/tests/flash_attn_determinism.rs`

- [ ] **Step 1: Viết test**

`crates/asr-worker/src/engine.rs`: thay

```rust
    #[test]
    fn disabled_primers_give_no_context() {
```

bằng

```rust
    #[test]
    fn flash_attention_is_on_by_default_only_where_it_was_gated() {
        assert!(flash_attn_wanted(true, None, true), "macOS, GPU: bật");
        assert!(
            !flash_attn_wanted(true, None, false),
            "Windows: tắt tới khi đo trên máy Windows"
        );
        assert!(!flash_attn_wanted(false, None, true), "CPU: luôn tắt");
        assert!(!flash_attn_wanted(true, Some("0"), true));
        assert!(flash_attn_wanted(true, Some("1"), false));
        assert!(!flash_attn_wanted(false, Some("1"), true));
        assert!(flash_attn_wanted(true, Some("yes"), true), "giá trị lạ: theo mặc định");
    }

    #[test]
    fn with_flash_attention_the_window_is_a_multiple_of_256() {
        assert_eq!(effective_audio_ctx(true, 600), 768);
        assert_eq!(effective_audio_ctx(true, 512), 512);
        assert_eq!(effective_audio_ctx(true, 0), 0, "0 là cửa sổ đầy đủ");
        assert_eq!(effective_audio_ctx(false, 600), 600);
    }

    #[test]
    fn disabled_primers_give_no_context() {
```

Tạo `crates/asr-worker/tests/flash_attn_determinism.rs`:

```rust
//! Cổng tất định của flash attention (spec 2026-10-10 §8, A5; spec §6.4 "Flash attention"): cùng một đoạn, chép sau các
//! đoạn khác nhau (dài ngắn khác nhau nên `audio_ctx` khác nhau), phải ra cùng token. Chạy worker hai lần, flash attention
//! bật (`ASR_FLASH_ATTN=1`) rồi tắt (`=0`); cả hai lần phải tất định. In thêm số đoạn mà hai lần cho cùng token, để ghi vào
//! biên bản (không phải điều kiện của cổng: chất lượng do A4 quyết định).
//!
//! Cần model thật và bản build Metal nên bị bỏ qua mặc định. Chạy từ gốc repo, với từng model:
//!
//! ```text
//! WHISPER_TEST_MODEL=models/ggml-large-v3-turbo-q5_0.bin cargo test --release -p asr-worker \
//!   --features metal,shared-encode --test flash_attn_determinism -- --include-ignored --nocapture
//! ```

use asr_protocol::{Request, Response, TranscribeRequest, audio_ctx_for_samples, read_frame, write_frame};
use std::io::{BufReader, BufWriter};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

/// Các đoạn cắt từ `tests/fixtures/audio/fleurs-en-en-vi.wav` (19,08 giây; câu ở 1,00–4,96, 6,46–10,84 và 12,34–17,58
/// giây): (tên, từ ms, tới ms). `audio_ctx` lần lượt là 512, 768 (công thức cũ 614), 1024 (cũ 1018), 768 (cũ 718), 512.
const CUTS: [(&str, u64, u64); 5] = [
    ("a-4s", 800, 5_200),
    ("b-11s", 0, 11_000),
    ("c-19s", 0, 19_080),
    ("d-13s", 6_000, 19_080),
    ("e-6s-vi", 12_000, 17_800),
];
/// Thứ tự chép: mỗi đoạn đứng sau nhiều đoạn khác nhau, dài hơn và ngắn hơn nó.
const ORDER: [usize; 12] = [1, 0, 2, 1, 3, 1, 4, 2, 0, 3, 2, 4];

/// Mẫu của file WAV PCM 16-bit mono (chunk `data`).
fn read_wav(path: &Path) -> Vec<i16> {
    let bytes = std::fs::read(path).unwrap();
    assert_eq!(&bytes[..4], b"RIFF");
    let mut at = 12;
    while at + 8 <= bytes.len() {
        let size = u32::from_le_bytes(bytes[at + 4..at + 8].try_into().unwrap()) as usize;
        if &bytes[at..at + 4] == b"data" {
            return bytes[at + 8..at + 8 + size]
                .as_chunks::<2>()
                .0
                .iter()
                .map(|&b| i16::from_le_bytes(b))
                .collect();
        }
        at += 8 + size + size % 2;
    }
    panic!("{} không có chunk data", path.display());
}

struct Worker {
    child: Child,
    input: BufWriter<ChildStdin>,
    output: BufReader<ChildStdout>,
}

impl Worker {
    fn start(model: &str, flash_attn: &str) -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_asr-worker"))
            .env("ASR_FLASH_ATTN", flash_attn)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .unwrap();
        let mut worker = Self {
            input: BufWriter::new(child.stdin.take().unwrap()),
            output: BufReader::new(child.stdout.take().unwrap()),
            child,
        };
        let load = Request::Load {
            model_path: model.into(),
            use_gpu: true,
            n_threads: 4,
        };
        match worker.call(&load) {
            Response::Ready { .. } => {}
            other => panic!("Load: {other:?}"),
        }
        assert!(matches!(worker.call(&Request::Warmup), Response::WarmupDone { .. }));
        worker
    }

    fn call(&mut self, req: &Request) -> Response {
        write_frame(&mut self.input, req).unwrap();
        read_frame::<_, Response>(&mut self.output).unwrap().unwrap()
    }

    /// (chữ, token) của một đoạn. Không có prompt hay ngôn ngữ của đoạn trước: chỉ trạng thái bên trong whisper.cpp nối
    /// các lần chép với nhau.
    fn transcribe(&mut self, id: u64, pcm: &[i16]) -> (String, Vec<i32>) {
        let req = TranscribeRequest {
            segment_id: id,
            pcm: pcm.to_vec(),
            languages: vec!["en".into(), "vi".into()],
            prompt_tokens: Vec::new(),
            audio_ctx: audio_ctx_for_samples(pcm.len()),
            prev_lang: None,
        };
        match self.call(&Request::Transcribe(req)) {
            Response::Result(r) => (r.text, r.tokens),
            other => panic!("đoạn {id}: {other:?}"),
        }
    }
}

impl Drop for Worker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.input, &Request::Shutdown);
        let _ = self.child.wait();
    }
}

#[test]
#[ignore = "cần WHISPER_TEST_MODEL và bản build metal, shared-encode"]
fn the_same_segment_gives_the_same_tokens_whatever_came_before() {
    let model = std::env::var("WHISPER_TEST_MODEL").expect("đặt WHISPER_TEST_MODEL");
    let samples =
        read_wav(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/audio/fleurs-en-en-vi.wav"));
    let segments: Vec<(&str, Vec<i16>)> = CUTS
        .iter()
        .map(|&(name, from, to)| {
            let (a, b) = (from as usize * 16, (to as usize * 16).min(samples.len()));
            (name, samples[a..b].to_vec())
        })
        .collect();
    let ctx: Vec<i32> = segments
        .iter()
        .map(|(_, pcm)| audio_ctx_for_samples(pcm.len()))
        .collect();
    assert_eq!(ctx, [512, 768, 1024, 768, 512]);
    let mut by_mode = Vec::new();
    for flash_attn in ["1", "0"] {
        let mut worker = Worker::start(&model, flash_attn);
        let mut first: Vec<Option<(String, Vec<i32>)>> = vec![None; segments.len()];
        let mut differ = Vec::new();
        for (step, &i) in ORDER.iter().enumerate() {
            let got = worker.transcribe(step as u64, &segments[i].1);
            match &first[i] {
                None => first[i] = Some(got),
                Some(seen) if *seen != got => {
                    differ.push(format!("{} (bước {step}): {:?} ≠ {:?}", segments[i].0, seen.0, got.0))
                }
                Some(_) => {}
            }
        }
        assert!(
            differ.is_empty(),
            "ASR_FLASH_ATTN={flash_attn}: cùng đoạn mà khác token:\n{}",
            differ.join("\n")
        );
        by_mode.push(first.into_iter().map(Option::unwrap).collect::<Vec<_>>());
    }
    let same = (0..segments.len())
        .filter(|&i| by_mode[0][i].1 == by_mode[1][i].1)
        .count();
    println!(
        "flash attention bật và tắt cho cùng token ở {same}/{} đoạn",
        segments.len()
    );
    for (i, (name, _)) in segments.iter().enumerate() {
        if by_mode[0][i].1 != by_mode[1][i].1 {
            println!("  {name}: bật {:?} | tắt {:?}", by_mode[0][i].0, by_mode[1][i].0);
        }
    }
}
```

- [ ] **Step 2: Chạy, thấy đỏ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p asr-worker --features shared-encode
```

Expected: lỗi biên dịch, vì chưa có `flash_attn_wanted` và `effective_audio_ctx`. Test tích hợp mới vẫn biên dịch được, vì chỉ dùng `asr_protocol` của Task 9.

- [ ] **Step 3: Cài**

`crates/asr-worker/src/engine.rs`: thay

```rust
    TranscribeResult, audio_ctx_for_samples,
};
```

bằng

```rust
    TranscribeResult, align_audio_ctx, audio_ctx_for_samples,
};
```

thay

```rust
/// Mồi chỉ bật khi biến môi trường `ASR_PRIMER` đúng bằng "1" (giống `ASR_FLASH_ATTN`).
fn primer_requested(value: Option<&str>) -> bool {
    value == Some("1")
}
```

bằng

```rust
/// Mồi chỉ bật khi biến môi trường `ASR_PRIMER` đúng bằng "1".
fn primer_requested(value: Option<&str>) -> bool {
    value == Some("1")
}

/// Flash attention của whisper.cpp (spec §6.4; spec 2026-10-10 §8, A5). `audio_ctx` luôn là bội của 256
/// ([`effective_audio_ctx`]), nên whisper.cpp không còn đọc phần đệm chứa dữ liệu của đoạn trước (ggml-org/whisper.cpp#3941).
/// Bật mặc định trên macOS (Metal) khi chạy GPU (`default_on`), nơi đã qua cổng tất định và A4; Windows (Vulkan) giữ tắt
/// tới khi đo trên máy Windows. Biến môi trường `ASR_FLASH_ATTN`: `0` tắt, `1` bật (để so sánh). Chạy CPU thì luôn tắt.
fn flash_attn_wanted(use_gpu: bool, env: Option<&str>, default_on: bool) -> bool {
    use_gpu
        && match env {
            Some("0") => false,
            Some("1") => true,
            _ => default_on,
        }
}

/// `audio_ctx` thật sự dùng. Bật flash attention thì làm tròn lên bội của 256 (`asr_protocol::align_audio_ctx`): app đã
/// gửi bội của 256 (`audio_ctx_for_samples`), nhưng bên gọi khác có thể gửi số khác (`latency-bench --min-ctx`).
fn effective_audio_ctx(flash_attn: bool, requested: i32) -> i32 {
    if flash_attn {
        align_audio_ctx(requested)
    } else {
        requested
    }
}
```

thay

```rust
        // Flash attention mặc định TẮT: whisper.cpp 1.8.3 đọc K/V của encoder và cross-attention tới GGML_PAD(audio_ctx, 256)
        // mà không có mask, nên với audio_ctx rút ngắn kết quả sai và phụ thuộc các đoạn trước (ggml-org/whisper.cpp#3941).
        // Chỉ đặt `ASR_FLASH_ATTN=1` khi whisper.cpp đã có bản vá đó (spec §6.4, "Flash attention: tắt").
        let flash_attn = use_gpu && std::env::var("ASR_FLASH_ATTN").as_deref() == Ok("1");
```

bằng

```rust
        let flash_attn = flash_attn_wanted(
            use_gpu,
            std::env::var("ASR_FLASH_ATTN").ok().as_deref(),
            cfg!(target_os = "macos"),
        );
```

thay

```rust
    /// Flash attention có đang bật không. Mặc định tắt, xem `load`.
```

bằng

```rust
    /// Flash attention có đang bật không, xem [`flash_attn_wanted`].
```

thay

```rust
        let pcm: Vec<f32> = req.pcm.iter().map(|&s| s as f32 / 32768.0).collect();

```

bằng

```rust
        let pcm: Vec<f32> = req.pcm.iter().map(|&s| s as f32 / 32768.0).collect();
        let audio_ctx = effective_audio_ctx(self.flash_attn, req.audio_ctx);

```

thay

```rust
                &pcm,
                req.audio_ctx,
                allowed,
```

bằng

```rust
                &pcm,
                audio_ctx,
                allowed,
```

thay

```rust
        let mut params = full_params(self.n_threads, lang, req.audio_ctx);
```

bằng

```rust
        let mut params = full_params(self.n_threads, lang, audio_ctx);
```

- [ ] **Step 4: Chạy, thấy xanh**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo test --locked -p asr-worker --features shared-encode
cargo test --locked -p asr-worker
cargo fmt --all -- --check
cargo clippy --locked -p asr-worker --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
```

Expected:
- test đạt, có 2 test mới của `engine`; `flash_attn_determinism` báo `1 ignored`;
- fmt sạch;
- hai lần clippy sạch.

- [ ] **Step 5: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add crates/asr-worker/src/engine.rs crates/asr-worker/tests/flash_attn_determinism.rs
git -C "$W" commit -m "$(cat <<'EOF'
feat(asr-worker): bật flash attention trên macOS với audio_ctx là bội của 256 (A5)

Flash attention bật mặc định khi chạy GPU trên macOS, Windows giữ tắt tới khi đo; ASR_FLASH_ATTN=0/1 để so sánh. Khi
bật, worker làm tròn audio_ctx lên bội của 256 cho mọi bên gọi. Test tất định (bỏ qua mặc định, cần model thật): cùng một
đoạn, chép sau các đoạn khác nhau, phải ra cùng token, cả khi bật lẫn khi tắt.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có hai file. **Ghi lại hash của commit này** (Task 11).

---

## Task 11: A5 — chạy cổng, quyết định, sửa spec chính

Cổng của spec §8 A5 (QĐ7). A5 **đạt** khi đủ cả hai điều kiện:
1. **Tất định:** `flash_attn_determinism` đạt với turbo và với small.
2. **A4:** cả bốn lượt (`turbo-fa`, `small-fa`, `turbo-fa-off`, `small-fa-off`) không có nhóm nào xấu hơn mốc của gói quá 10% tương đối (`gates.py a4`).
   - Lượt `-fa-off` (tắt flash attention, vẫn làm tròn) cũng phải đạt, vì phép làm tròn áp cả ở Windows, nơi flash attention tắt.

Không đạt thì quay lại cả Task 10 và Task 9 (Step 8B).

Mọi đầu ra không commit đều ở `target/do-tre/`. `score_asr.py` ghi `bench/phase0/results/a4_<nhãn>.json`: bốn file này được commit, vì là nhãn mới, không ghi đè mốc.

Máy chạy khoảng 40 phút: hỏi chủ dự án như Task 3 Step 2 trước khi làm Step 2.

**Files:**
- Create: `bench/phase0/results/a4_m4pro-turbo-fa.json`, `a4_m4pro-small-fa.json`, `a4_m4pro-turbo-fa-off.json`, `a4_m4pro-small-fa-off.json`
- Create: `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md`
- Modify: `docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md` (§6.4: dòng 427, 437–439, 457)

- [ ] **Step 1: Dựng lại tiến trình phụ và công cụ đo theo code mới**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
mkdir -p target/do-tre/asr target/do-tre/logs
```

Expected:
- `copy-sidecars.sh` liệt kê 12 file;
- `latency-bench` build xong.

- [ ] **Step 2: Cổng tất định, turbo và small**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
for m in ggml-large-v3-turbo-q5_0 ggml-small-q5_1; do
  WHISPER_TEST_MODEL="$PWD/models/$m.bin" cargo test --release --locked -p asr-worker --features metal,shared-encode \
    --test flash_attn_determinism -- --include-ignored --nocapture 2>&1 | tee "target/do-tre/a5-tat-dinh-$m.txt"
done
grep -h "test the_same_segment\|flash attention bật và tắt" target/do-tre/a5-tat-dinh-*.txt
```

Expected, với mỗi model:
- dòng `test the_same_segment_gives_the_same_tokens_whatever_came_before ... ok`;
- dòng `flash attention bật và tắt cho cùng token ở N/5 đoạn`.

`FAILED` thì cổng tất định không đạt. Test in đoạn nào khác token: chép nguyên vào biên bản, rồi làm Step 8B.

`WHISPER_TEST_MODEL` phải là đường dẫn tuyệt đối, vì test chạy trong thư mục `crates/asr-worker`.

- [ ] **Step 3: Bốn lượt A4**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
for pair in turbo:large-v3-turbo-q5_0 small:small-q5_1; do
  name=${pair%%:*}; file=${pair#*:}
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker src-tauri/binaries/asr-worker-aarch64-apple-darwin --asr-model models/ggml-$file.bin \
    --out target/do-tre/asr/out-m4pro-$name-fa.jsonl --log-dir target/do-tre/logs || break
  ASR_FLASH_ATTN=0 target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker src-tauri/binaries/asr-worker-aarch64-apple-darwin --asr-model models/ggml-$file.bin \
    --out target/do-tre/asr/out-m4pro-$name-fa-off.jsonl --log-dir target/do-tre/logs || break
done
grep -h "asr-worker: backend=" target/do-tre/logs/out-m4pro-*-fa*.log | sort | uniq -c
wc -l target/do-tre/asr/out-m4pro-*-fa*.jsonl
```

Expected:
- mỗi lượt in `asr: metal (1.8.3), chế độ giải mã shared`, rồi tiến độ tới `540 clip`;
- `grep` có `backend=metal flash_attn=on decode_mode=shared` (lượt `-fa`) và `flash_attn=off` (lượt `-fa-off`);
- mỗi file `.jsonl` có 548 dòng.

`asr-eval` tự đọc `audio_ctx_for_samples`, nên mọi lượt đều làm tròn lên bội của 256. Worker được chạy với biến môi trường của lệnh, nên `ASR_FLASH_ATTN=0` tới được worker.

- [ ] **Step 4: Chấm và chạy cổng A4**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  target/do-tre/asr/out-m4pro-turbo-fa.jsonl target/do-tre/asr/out-m4pro-turbo-fa-off.jsonl \
  target/do-tre/asr/out-m4pro-small-fa.jsonl target/do-tre/asr/out-m4pro-small-fa-off.jsonl \
  > target/do-tre/asr/a4_table.md 2> target/do-tre/asr/a4_gloss.txt
ls bench/phase0/results/a4_m4pro-*-fa*.json
for run in turbo-fa turbo-fa-off small-fa small-fa-off; do
  echo "--- $run"
  python3 bench/phase1/acceptance/gates.py a4 --result bench/phase0/results/a4_m4pro-$run.json \
    --baseline-turbo bench/phase0/results/a4_m4pro-turbo-final.json \
    --baseline-small bench/phase0/results/a4_m4pro-small-final.json --out target/do-tre/asr/gate-$run.json
  echo "mã thoát $?"
done | tee target/do-tre/asr/gates.txt
```

Expected:
- bốn file `bench/phase0/results/a4_m4pro-{turbo,small}-{fa,fa-off}.json` được tạo;
- mỗi lượt in `Gói (suy từ số đo): turbo` (hay `small`), rồi bảng các nhóm;
- `mã thoát 0` là đạt, `1` là có nhóm xấu hơn mốc quá 10%.

- [ ] **Step 5: Đo tốc độ chép lời**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 - <<'EOF' | tee target/do-tre/asr/toc-do.txt
import json, statistics
for name in ("turbo", "small"):
    rows = {}
    for run in ("fa", "fa-off"):
        with open(f"target/do-tre/asr/out-m4pro-{name}-{run}.jsonl", encoding="utf-8") as f:
            rows[run] = [json.loads(line) for line in f]
    for label, keep in (("clip ≤ 8,96 giây (audio_ctx 512, như đoạn thường của app)", lambda r: r["audio_ms"] <= 8960),
                        ("mọi clip", lambda r: True)):
        on = statistics.median(r["asr_ms"] for r in rows["fa"] if keep(r))
        off = statistics.median(r["asr_ms"] for r in rows["fa-off"] if keep(r))
        print(f"{name}, {label}: p50 bật {on:.0f} ms, tắt {off:.0f} ms, nhanh hơn {(off - on) / off * 100:.1f}%")
EOF
```

Expected: bốn dòng. Spec dự kiến flash attention nhanh hơn 5–13%; ghi đúng số đo được.

- [ ] **Step 6: Quyết định**

| Tất định (Step 2) | A4, cả 4 lượt (Step 4) | Quyết định | Làm tiếp |
|---|---|---|---|
| đạt cả turbo và small | đạt cả 4 | **Giữ** flash attention trên macOS và phép làm tròn | Step 7A, 8A |
| còn lại | | **Quay lại** cả Task 10 và Task 9 | Step 7B, 8B |

Trường hợp tốc độ (Step 5) không nhanh hơn: vẫn giữ nếu qua cổng, vì không có hại. Ghi rõ trong biên bản.

- [ ] **Step 7A: (giữ) Viết biên bản**

Tạo `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md` theo khung dưới. Mỗi `‹…›` điền từ file nêu trong đó:

````markdown
# A5: flash attention của whisper với `audio_ctx` là bội của 256 (‹ngày›)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 9–11; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §8 A5.

**Kết luận: GIỮ.** Flash attention bật trên macOS (Metal); Windows giữ tắt tới khi đo trên máy Windows.

## Thay đổi

- `asr_protocol::audio_ctx_for_samples` làm tròn lên bội của 256 (512, 768, 1024, 1280; 1500 khi đoạn dài hơn
  24,32 giây). Commit ‹hash Task 9›.
- `asr-worker` bật flash attention mặc định khi chạy GPU trên macOS; khi bật thì làm tròn `audio_ctx` của mọi bên gọi.
  `ASR_FLASH_ATTN=0` tắt, `=1` bật. Commit ‹hash Task 10›.

## Cổng tất định

`crates/asr-worker/tests/flash_attn_determinism.rs`: 5 đoạn (`audio_ctx` 512, 768, 1024), chép 12 lần xen kẽ.

| Model | Bật flash attention | Tắt | Bật và tắt cùng token |
|---|---|---|---|
| turbo q5_0 | ‹đạt/không, từ target/do-tre/a5-tat-dinh-ggml-large-v3-turbo-q5_0.txt› | ‹…› | ‹N›/5 |
| small q5_1 | ‹…› | ‹…› | ‹N›/5 |

‹Đoạn nào bật và tắt khác token: chép nguyên dòng test in ra.›

## A4

Bốn lượt trên 548 clip của A4 (`latency-bench asr-eval`, `score_asr.py`), so mốc `a4_m4pro-{turbo,small}-final.json`
bằng `bench/phase1/acceptance/gates.py a4` (không nhóm nào xấu hơn quá 10% tương đối):

‹dán nguyên target/do-tre/asr/gates.txt›

## Tốc độ chép lời

‹dán nguyên target/do-tre/asr/toc-do.txt›

## Giới hạn

- Chỉ đo trên M4 Pro (Metal). Windows (Vulkan) chưa đo nên giữ tắt.
- Cửa sổ đầy đủ 1500 vẫn có phần đệm; app không gửi đoạn dài hơn 12 giây. A4 có 2/548 clip dài hơn 25,6 giây.
````

- [ ] **Step 8A: (giữ) Sửa spec chính và commit**

`docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`.

Câu đầu của mục "Rút ngắn cửa sổ mã hóa": thay

```markdown
App đặt **`audio_ctx = min(1500, max(512, 50 × số giây của đoạn + 64))`**, làm tròn lên; mỗi giây tương ứng 50 khung.
```

bằng

```markdown
App đặt **`audio_ctx = min(1500, max(512, 50 × số giây của đoạn + 64))`**, làm tròn lên, rồi lên bội của 256 để bật được flash attention (xem dưới): 512 tới 8,96 giây, 768 tới 14,08 giây, 1024 tới 19,2 giây, 1280 tới 24,32 giây, 1500 khi dài hơn; mỗi giây tương ứng 50 khung.
```

Ba dòng của mục "Flash attention" (dòng 437–439): thay

```markdown
- **Flash attention: tắt** (kiểm lại ngày 2026-10-01: ggml-org/whisper.cpp#3941 vẫn mở; giữ tắt, kế hoạch 08 kiểm lại trước khi phát hành). whisper.cpp 1.8.3, cả v1.9.4 và master, sai khi bật flash attention cùng `audio_ctx` rút ngắn: phần đệm tới bội 256 không có mask. Kết quả là lặp câu, và thay đổi theo đoạn chép trước (ggml-org/whisper.cpp#3941, bản vá chưa được merge). `ASR_FLASH_ATTN=1` chỉ dùng để thử.
  - Bản vá mask cho kết quả trùng hệt bản tắt flash. Trên M4 Pro, nó giúp chép lời nhanh hơn 5–13% và giảm 91–149 MB bộ nhớ đệm mỗi state (đo lúc review, `phase0_review_notes.md`). Trên M4 Pro, mức lợi này không đổi quyết định nào (p50 và p90 dư khoảng gấp đôi). Máy tham chiếu chưa đo: nếu M1 cơ bản hay máy chỉ có CPU sát ngưỡng A2 thì xem lại.
  - Chỉ bật lại khi whisper.cpp có mask cho phần đệm, và phải kèm test tất định: cùng một đoạn, chép sau các đoạn khác nhau, phải ra cùng token.
```

bằng (điền ‹…› từ biên bản Step 7A)

```markdown
- **Flash attention: bật trên macOS** (từ ‹ngày›; spec 2026-10-10 §8 A5; `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md`).
  - Lỗi gốc: whisper.cpp 1.8.3, cả v1.9.4 và master, đọc K/V tới bội 256 của `audio_ctx` mà không có mask (ggml-org/whisper.cpp#3941, bản vá chưa được merge). Với `audio_ctx` không phải bội của 256, kết quả sai và đổi theo đoạn chép trước.
  - Cách né: app luôn dùng `audio_ctx` là bội của 256 (`audio_ctx_for_samples`). `asr-worker` làm tròn thêm một lần khi bật flash attention, cho bên gọi gửi số khác. Cửa sổ đầy đủ 1500 (đoạn dài hơn 24,32 giây) vẫn có phần đệm, nhưng app không gửi đoạn nào dài như vậy: đoạn dài nhất là đoạn gộp ở hàng đợi, 12 giây.
  - Cổng tất định đã qua trên M4 Pro, với turbo và small: cùng một đoạn, chép sau các đoạn khác nhau, ra cùng token (`crates/asr-worker/tests/flash_attn_determinism.rs`). Flash attention bật và tắt cho cùng token ở ‹N›/5 đoạn với turbo, ‹N›/5 với small.
  - A4 không nhóm nào xấu hơn mốc quá 10% (`a4_m4pro-{turbo,small}-fa.json`). Lượt tắt flash attention mà vẫn làm tròn (`-fa-off`) cũng đạt.
  - Chép lời nhanh hơn ‹x›% (turbo) và ‹y›% (small) ở clip ngắn hơn 9 giây, tức cỡ đoạn thường của app.
  - Windows (Vulkan) giữ tắt tới khi đo trên máy Windows. `ASR_FLASH_ATTN=0` tắt, `=1` bật, để so sánh.
```

Dòng "Việc cho MVP" (dòng 457): thay

```markdown
  - Xem lại flash attention khi upstream có mask cho phần đệm: tự vá, hoặc chờ upstream.
```

bằng

```markdown
  - Đo flash attention trên Windows (Vulkan) rồi quyết định bật. Khi upstream có mask cho phần đệm thì bỏ việc làm tròn `audio_ctx` lên bội của 256.
```

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/phase0/results/a4_m4pro-turbo-fa.json bench/phase0/results/a4_m4pro-turbo-fa-off.json \
  bench/phase0/results/a4_m4pro-small-fa.json bench/phase0/results/a4_m4pro-small-fa-off.json \
  bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): flash attention qua cổng tất định và A4, giữ bật trên macOS (A5)

Bốn lượt A4 (bật, tắt; turbo, small) với audio_ctx là bội của 256 đều không xấu hơn mốc quá 10%; test tất định đạt
với cả hai model. Spec chính §6.4 ghi lại cách né lỗi #3941 và kết quả.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có sáu file.

- [ ] **Step 7B: (quay lại) Revert hai commit của A5**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git branch --show-current
git log --oneline -12
git revert --no-edit ‹hash Task 10› ‹hash Task 9›
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
cargo test --locked -p asr-protocol -p asr-worker
grep -n "Flash attention mặc định TẮT" crates/asr-worker/src/engine.rs
```

Hash lấy từ hai commit đã ghi ở Task 9 và Task 10: `feat(asr-protocol): audio_ctx làm tròn lên bội của 256 (A5)` và `feat(asr-worker): bật flash attention trên macOS…`. Revert commit mới hơn trước.

Expected:
- hai commit `Revert "…"` được tạo, không xung đột;
- test đạt;
- `grep` thấy lại dòng chú thích cũ của `load`;
- `src-tauri/binaries/` lại là bản không bật flash attention.

`bench/phase0/results/a4_m4pro-*-fa*.json` (chưa commit) vẫn còn, để làm bằng chứng.

- [ ] **Step 8B: (quay lại) Biên bản, sửa spec chính và commit**

Tạo `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md` cùng khung Step 7A, với ba chỗ khác:
- dòng kết luận là `**Kết luận: KHÔNG GIỮ** (‹cổng nào không đạt, nhóm nào, số bao nhiêu›). Hai commit của A5 đã được revert (‹hash hai commit revert›); flash attention giữ tắt.`;
- mục "Thay đổi" ghi thêm hai commit revert;
- mục "Giới hạn" giữ nguyên.

`docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md`: thay

```markdown
- **Flash attention: tắt** (kiểm lại ngày 2026-10-01: ggml-org/whisper.cpp#3941 vẫn mở; giữ tắt, kế hoạch 08 kiểm lại trước khi phát hành).
```

bằng

```markdown
- **Flash attention: tắt** (kiểm lại ngày 2026-10-01: ggml-org/whisper.cpp#3941 vẫn mở; thử lại ngày ‹ngày› theo spec 2026-10-10 §8 A5, với `audio_ctx` làm tròn lên bội của 256: không qua cổng ‹tất định, hay A4 nhóm … của …›, xem `bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md`; giữ tắt).
```

Hai chỗ còn lại của §6.4 (công thức `audio_ctx`, "Việc cho MVP") giữ nguyên.

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/phase0/results/a4_m4pro-turbo-fa.json bench/phase0/results/a4_m4pro-turbo-fa-off.json \
  bench/phase0/results/a4_m4pro-small-fa.json bench/phase0/results/a4_m4pro-small-fa-off.json \
  bench/2026-10-10-do-tre/results/buoc1-a5-flash-attention.md docs/superpowers/specs/2026-09-29-desktop-meeting-translator-design.md
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): flash attention không qua cổng A5, giữ tắt

Ghi kết quả cổng tất định và bốn lượt A4; hai commit của A5 đã được revert. Spec chính §6.4 ghi lần thử này.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
```

Expected: `branch --show-current` in `dich-trong-luc-noi`; commit có sáu file.

---
## Task 12: Kiểm toàn bộ, đo lại sau A2–A5

Kiểm cả nhánh như CI, rồi đo lại 12 lượt đúng như mốc (Task 3), trên code đã có A2–A5 (A5 theo quyết định của Task 11).

`latency-bench` phát WAV 16 kHz thẳng vào engine và không có giao diện, nên lượt đo này thấy được A2 và A5, không thấy A3 và A4. Biên bản ghi số của test A3 (Task 6) và nói rõ A4 chỉ được kiểm bằng test.

Máy chạy khoảng 50 phút: Step 2 khoảng 10 phút, Step 7–8 khoảng 40 phút. Hỏi chủ dự án (Step 5) trước khi đo.

**Files:**
- Create: `bench/2026-10-10-do-tre/results/buoc1-sau-chuan-{en,zh,ja,ko,vi,mixed}.json` (6 file)
- Create: `bench/2026-10-10-do-tre/results/buoc1-sau-nhe-{en,zh,ja,ko,vi,mixed}.json` (6 file)
- Create: `bench/2026-10-10-do-tre/results/buoc1-sau-cai-tien.md`

- [ ] **Step 1: Kiểm nhánh và lịch sử**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git branch --show-current
git status --short
git log --oneline -16
```

Expected:
- dòng đầu là `dich-trong-luc-noi`;
- `status` trống;
- log có commit của Task 1–11, mới nhất trên cùng: `bench(do-tre): flash attention …` (Task 11), trước đó (nếu Step 7B của Task 11 đã chạy) hai commit `Revert "…"`, rồi `feat(asr-worker): …`, `feat(asr-protocol): …`, `perf(overlay): …`, `perf(capture): …`, `perf(audio-capture): …`, hai commit `feat(pipeline): …`, `bench(do-tre): mốc chế độ thường …`, `bench(do-tre): …` (script), `feat(latency-bench): …`.

Thiếu commit nào thì dừng, báo điều phối viên.

- [ ] **Step 2: Bộ kiểm như CI**

Cùng bộ lệnh với Task 0 Step 7, thêm unittest của script đo.

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
cargo fmt --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked -p asr-worker --features shared-encode
pnpm build && pnpm test
./scripts/check-windows.sh --locked
python3 -m unittest discover -s bench/phase1/acceptance -p 'test_*.py'
python3 -m unittest discover -s bench/2026-10-10-do-tre -p 'test_*.py'
git status --short
```

Expected:
- mọi lệnh thoát mã 0, `cargo test` không có `FAILED`;
- trong đầu ra của `cargo test --workspace` có các test mới của kế hoạch này, đều `ok`:
  - `pipeline`: `a_job_cancelled_before_it_starts_sends_no_request`, `a_cancel_is_seen_while_the_postprocessor_holds_the_text`, `a_cancel_between_attempts_skips_the_retry`, `a_merge_keeps_the_shown_translation_until_the_new_one_is_as_long`, `a_sentence_growing_mid_translation_keeps_the_partial_text`, `a_retry_while_holding_drops_only_the_fresh_text`, `settling_drops_the_held_translation`, `the_translation_thread_stops_a_cancelled_job_while_text_is_held`;
  - `audio-capture`: `blocks_are_10_ms_of_input`, `speech_band_is_flat_and_aliases_are_rejected`, `the_filter_delay_is_about_5_ms`, `reading_returns_as_soon_as_samples_arrive`;
  - `latency-bench`: `the_summary_has_the_keys_of_h7`, `the_sidecars_are_set_up_like_the_app`;
  - `asr-protocol` và `asr-worker` (chỉ khi Task 11 giữ A5): `align_rounds_up_and_keeps_the_full_window_marker`, `flash_attention_is_on_by_default_only_where_it_was_gated`;
- `git status --short` trống.

Lệnh nào đỏ thì dừng: sửa trong đúng task gây lỗi (commit mới, kiểu `fix(…): …`), rồi chạy lại cả bước này.

- [ ] **Step 3: Số đo CPU của khối resample (A3)**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
mkdir -p target/do-tre
cargo test --release --locked -p audio-capture cpu_cost_of_10_ms_blocks -- --ignored --nocapture 2>&1 \
  | grep "60 giây" | tee target/do-tre/buoc1-sau-a3-cpu.txt
```

Expected: một dòng `60 giây 48 kHz stereo: khối 10 ms …ms, khối 1024 …ms`. Khối 10 ms không chậm hơn khối 1024 quá vài ms (Task 6 đo được khoảng 12 ms so với 17–19 ms).

- [ ] **Step 4: Dựng lại tiến trình phụ và công cụ đo theo code mới**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
git log -1 --format=%h
grep -c "fn flash_attn_wanted" crates/asr-worker/src/engine.rs
```

Expected:
- `copy-sidecars.sh` liệt kê 12 file;
- `latency-bench` build xong;
- ghi lại hash commit (dùng ở Step 11);
- `grep -c` in `1` nếu Task 11 giữ A5, `0` nếu đã quay lại. Ghi lại để so ở Step 9.

- [ ] **Step 5: Hỏi chủ dự án và chờ trả lời**

Gửi điều phối viên để chuyển cho chủ dự án:

> Sắp đo lại độ trễ sau các cải tiến nhanh (khoảng 40 phút, máy chạy model liên tục). Nhờ anh:
> - thoát Chrome, Teams, Slack, VS Code và bản dev hay bản cài của AI Translator;
> - cắm sạc;
> - tạm dừng build nặng ở phiên Claude khác;
> - không dùng máy trong lúc đo.
>
> Xong thì báo em.

Chưa có trả lời thì không chạy Step 6.

- [ ] **Step 6: Ghi điều kiện trước khi đo**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
printf '[TRUOC %s] %s | %s | %s\n' "$(date '+%F %T')" "$(sysctl -n vm.swapusage)" "$(pmset -g batt | tail -n 1)" \
  "$(top -l 1 | grep 'CPU usage')" | tee target/do-tre/buoc1-sau-dieu-kien.txt
```

Expected: một dòng `[TRUOC …] total = … | -InternalBattery-0 … | CPU usage: …% idle`. CPU rảnh phải trên khoảng 90%; thấp hơn thì hỏi lại chủ dự án.

- [ ] **Step 7: Đo gói Chuẩn**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-sau
```

Expected:
- 6 khối `== buoc1-sau-chuan-<session> (… giây, … câu)`, mỗi khối có một dòng `buoc1-sau-chuan-<session>: A2 p50 … ms, …`;
- không có dòng `CẢNH BÁO`;
- lệnh thoát mã 0.

Nếu có `CẢNH BÁO: phát lại chậm hơn…` thì máy đang bận: hỏi chủ dự án rồi chạy lại đúng session đó, bằng `--sessions <tên>`.

- [ ] **Step 8: Đo gói Nhẹ**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-sau
```

Expected: như Step 7, với `buoc1-sau-nhe-<session>`.

- [ ] **Step 9: Ghi điều kiện sau khi đo, và kiểm lượt đo đáng tin**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
printf '[SAU %s] %s | %s | %s\n' "$(date '+%F %T')" "$(sysctl -n vm.swapusage)" "$(pmset -g batt | tail -n 1)" \
  "$(top -l 1 | grep 'CPU usage')" | tee -a target/do-tre/buoc1-sau-dieu-kien.txt
python3 - <<'EOF'
import glob, json
index = json.load(open("bench/phase0/data/latency/sessions.json", encoding="utf-8"))
for path in sorted(glob.glob("bench/2026-10-10-do-tre/results/buoc1-sau-*.json")):
    r = json.load(open(path, encoding="utf-8"))
    s, run, name = r["summary"], r["run"], path.rsplit("/", 1)[1][:-5]
    print(name, "câu", int(s["utterances"]), "/", index[name.rsplit("-", 1)[1]]["utterances"], "| A2 đo được",
          run["measured"], "| phát trễ", run["feed_lag_max_ms"], "| khởi động lại", run["sidecar_restarts"], "|",
          r["machine"]["asr_backend"], "|", r["machine"]["asr_worker"])
EOF
```

Expected cho cả 12 dòng:
- số câu bằng số câu của `sessions.json`;
- "A2 đo được" gần bằng số câu, như mốc;
- "phát trễ" dưới 100;
- "khởi động lại" bằng 0;
- cột cuối là `metal | asr-worker: backend=metal flash_attn=on decode_mode=shared` nếu Step 4 in `1` (giữ A5), `flash_attn=off` nếu in `0`.

Dòng nào không đạt thì chạy lại session đó, bằng `--sessions <tên>`.

- [ ] **Step 10: Tổng hợp và so với mốc**

```sh
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-moc buoc1-sau \
  bench/2026-10-10-do-tre/results/buoc1-moc-*.json bench/2026-10-10-do-tre/results/buoc1-sau-*.json \
  | tee target/do-tre/buoc1-sau-bang.md
```

Expected:
- bảng thứ nhất có 24 dòng (12 `buoc1-moc-…`, 12 `buoc1-sau-…`);
- bảng thứ hai có bốn nhóm (`buoc1-moc-chuan`, `buoc1-moc-nhe`, `buoc1-sau-chuan`, `buoc1-sau-nhe`), mỗi nhóm một dòng cho mỗi tiếng nguồn;
- bảng thứ ba có 12 dòng (`chuan-en` … `nhe-vi`), mỗi ô dạng `cũ → mới (chênh)`, hai cột cuối là "Chép lời p50" và "Dịch p50".

- [ ] **Step 11: Viết biên bản**

Tạo `bench/2026-10-10-do-tre/results/buoc1-sau-cai-tien.md` theo khung dưới. Mỗi chỗ trong `‹…›` điền đúng số hay dòng nêu trong đó, lấy từ đầu ra của các bước trên và từ biên bản `buoc1-moc-che-do-thuong.md`, `buoc1-a5-flash-attention.md`; không để sót chỗ nào.

````markdown
# Bước 1: đo lại sau các cải tiến nhanh A2–A5 (‹ngày đo, YYYY-MM-DD›)

Kế hoạch `docs/superpowers/plans/2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md`, Task 12; spec
`docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md` §8, §9 bước 1 và §10.1. So với mốc
`buoc1-moc-che-do-thuong.md` (cùng máy, cùng cách chạy, code chưa có A2–A5).

## Điều kiện đo

- Máy: ‹`machine.cpu`›, ‹`machine.ram_gb`› GB, ‹`machine.os`› (lấy từ một file kết quả).
- Code: nhánh `dich-trong-luc-noi`, commit ‹hash ở Step 4›, có A2, A3, A4 và ‹"A5 (flash attention bật trên macOS)" hay "không có A5 (đã quay lại ở Task 11)"›.
  - `asr-worker` là sidecar do `scripts/copy-sidecars.sh` dựng lại từ code này (Metal, chế độ B, `flash_attn=‹on/off›`).
  - `llama-server` b11146.
- Cấu hình như mốc: ngưỡng ngắt câu 50 ms, ghép câu §6.3, mọi ngưỡng khác là `PipelineConfig::default()`.
- Chủ dự án đã ‹ghi những gì đã tắt, như lời chủ dự án›; máy cắm sạc. Trước và sau lượt đo:

  ```
  ‹hai dòng của target/do-tre/buoc1-sau-dieu-kien.txt›
  ```

## Cách chạy

```
scripts/copy-sidecars.sh
cargo build --release --locked -p latency-bench
python3 bench/2026-10-10-do-tre/run_sessions.py --pack chuan --label buoc1-sau
python3 bench/2026-10-10-do-tre/run_sessions.py --pack nhe --label buoc1-sau
python3 bench/2026-10-10-do-tre/summarize_sessions.py --compare buoc1-moc buoc1-sau \
  bench/2026-10-10-do-tre/results/buoc1-moc-*.json bench/2026-10-10-do-tre/results/buoc1-sau-*.json
```

## Kết quả

‹dán nguyên ba bảng của target/do-tre/buoc1-sau-bang.md›

## Nhận xét

- **A2** (ghép câu giữ bản dịch đang hiện; cờ hủy kiểm trước request và ở mọi gói):
  - `Nháy tạm` gói Chuẩn: ‹khoảng cũ → khoảng mới›. Chỗ giảm là phần bản dịch không còn bị xóa khi ghép câu.
  - A2 p50 và "A2 chữ đầu p50": ‹chênh lớn nhất và nhỏ nhất, gói Chuẩn›. Spec ước nhanh hơn 10–40 ms mỗi lần ghép.
- **A5:** ‹nếu giữ: "Chép lời p50" gói Chuẩn ‹khoảng cũ → mới› ms, gói Nhẹ ‹…› ms; so với số của `buoc1-a5-flash-attention.md`. Nếu không giữ: "A5 đã quay lại ở Task 11, cột Chép lời p50 chỉ là nhiễu giữa hai lượt"›.
- **CPU cả máy:** ‹khoảng cũ → mới›% (ngưỡng 30%, spec chính §8). **Mức bận:** ‹khoảng cũ → mới›.
- **A3** không đo được ở đây (WAV 16 kHz phát thẳng vào engine). Theo test của Task 6 và Task 7:
  - trễ của bộ lọc resample 5 ms, trước là 10,7 ms ở 48 kHz và 15 ms ở 44,1 kHz;
  - đọc thu âm ngay khi có mẫu thay cho ngủ cố định 20 ms trước mỗi lần đọc;
  - CPU: ‹dòng của target/do-tre/buoc1-sau-a3-cpu.txt›.
  Kiểm trên thiết bị thật là việc của kế hoạch 04.
- **A4** không đo được ở đây (không có giao diện). Test của Task 8 giữ nguyên markup của từng loại dòng; mỗi gói chữ dịch chỉ vẽ lại đúng dòng của nó. Spec ước lợi 1–10 ms mỗi gói chữ ở phiên dài.
- Mỗi bên chỉ một lượt cho mỗi session, nên chênh nhỏ có thể là nhiễu giữa hai lượt. ‹Nếu có session chênh bất thường: đã chạy lại bằng `--sessions <tên>` và ghi cả hai số›.

## Kết luận của bước 1 (spec §8, cột "Điều kiện giữ")

| # | Kết quả | Bằng chứng |
|---|---|---|
| A1 | Xong: `latency-bench session`, script chạy và tổng hợp, mốc chế độ thường | `buoc1-moc-che-do-thuong.md` |
| A2 | Giữ: test engine đạt | Task 12 Step 2; bảng so ở trên |
| A3 | Giữ: test resample đạt; CPU ‹không tăng / tăng bao nhiêu› | Task 12 Step 2, Step 3 |
| A4 | Giữ: test giao diện đạt | Task 12 Step 2 |
| A5 | ‹Giữ / Không giữ› | `buoc1-a5-flash-attention.md` |

## Giới hạn

- Một máy (M4 Pro). Câu đọc của FLEURS, không phải hội thoại thật (spec 2026-10-10 §14).
- Thời điểm nói của từng từ là xấp xỉ: chia đều độ dài câu cho số đơn vị của bản chép cuối (spec §10.1).
````

- [ ] **Step 12: Commit**

```sh
W=/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi
git -C "$W" branch --show-current
git -C "$W" status --short
git -C "$W" add bench/2026-10-10-do-tre/results/buoc1-sau-*.json bench/2026-10-10-do-tre/results/buoc1-sau-cai-tien.md
git -C "$W" commit -m "$(cat <<'EOF'
bench(do-tre): đo lại sau A2–A5, so với mốc chế độ thường (bước 1)

12 lượt latency-bench session trên 6 session S6, hai gói, cùng điều kiện với mốc; biên bản so từng session, ghi số của
test A3, và kết luận giữ hay bỏ từng cải tiến theo spec §8.

Co-Authored-By: <model đang chạy> <noreply@anthropic.com>
EOF
)"
git -C "$W" log --oneline -1
```

Expected:
- `branch --show-current` in `dich-trong-luc-noi`;
- `status --short` trước khi add chỉ có 12 file JSON và file `.md` trong `bench/2026-10-10-do-tre/results/`;
- commit có đúng 13 file.

Báo điều phối viên: kế hoạch 01 xong, kèm đường dẫn hai biên bản đo và kết luận A5.

---

## Tự rà

**Spec 2026-10-10 §8 và §9 bước 1:**

| Mục | Task |
|---|---|
| A1: chạy `pipeline::Engine` với `SampleSource` phát WAV theo thời gian thực, `EventSink` ghi mọi sự kiện kèm thời điểm | 1 (`session.rs`: `Paced`, `Recorder`) |
| A1: các chỉ số §10.1 | 1 (`session_replay.rs`, `session_metrics.rs`) |
| A1: mốc chế độ thường, ngưỡng 50 ms, hai gói, 6 session S6 | 2 (script), 3 (đo, biên bản) |
| A2: ghép câu không xóa bản dịch đang hiện, giữ tới khi bản mới dài bằng | 5 (H2), cùng `lineView` ở giao diện (QĐ4) |
| A2: kiểm cờ hủy ở mỗi gói stream, kể cả khi hậu xử lý giữ chữ, và trước khi gửi request | 4 (H1) |
| A2, điều kiện giữ: test engine đạt | 4, 5; 12 Step 2 |
| A3: bỏ ngủ cố định 20 ms trước mỗi lần đọc | 7 |
| A3: resample theo khối nhỏ hơn 1024 mẫu; điều kiện giữ: test resample đạt, CPU không tăng đáng kể | 6; 12 Step 3 |
| A4: memo theo từng dòng; điều kiện giữ: test giao diện đạt | 8 |
| A5: `audio_ctx` lên bội của 256 | 9 |
| A5: bật flash attention | 10 |
| A5, điều kiện giữ: test tất định, A4 không xấu quá mốc, không đạt thì giữ tắt; sửa §6.4 spec chính | 10 (test), 11 (cổng, quyết định, cả hai nhánh của §6.4) |
| §9 bước 1: kết quả là mốc chế độ thường đo bằng engine thật | 3; 12 đo lại sau A2–A5 |

**Spec §10.1, khóa `summary` của H7:**

| Chỉ số | Khóa | Ở đâu |
|---|---|---|
| Thời điểm nói của từng từ (chia đều) | — | `session_metrics.rs` (`evaluate`) |
| Trễ của chữ tạm, theo từ | `word_lag_tentative_p50_ms`, `_p90_ms` | QĐ2; `Replay::first_text_ms` |
| Trễ của chữ ổn định, theo từ | `word_lag_stable_p50_ms`, `_p90_ms` | QĐ2; `Replay::settled_ms` |
| Từ lúc bắt đầu nói tới chữ dịch đầu tiên | `first_from_start_p50_ms`, `_p90_ms` | `evaluate` |
| Độ nháy tầng ổn định | `stable_flicker_ratio` | `Replay::changed_stable_units` |
| Độ nháy tầng tạm | `tentative_erasure_ratio` | `Replay::retracted_units` |
| Mức bận | `busy_ratio` | `session.rs` (`RunInfo.asr_busy_ms`, `mt_busy_ms`) |
| A2 như cũ | `a2_p50_ms`, `a2_p90_ms`, `a2_first_p50_ms` | `evaluate` (ghép trong 1 giây, như `latency`) |
| CPU cả máy (§10.2: ≤ 30%) | `cpu_percent` | `session.rs` (`machine_cpu_percent`, như S6) |
| Đếm và trạng thái | `utterances`, `segments`, `partials` (0), `cadence_p50_ms`, `streaming_auto_off` (`null` ở chế độ thường) | `summarize`, `run` |

Test `the_summary_has_the_keys_of_h7` khóa đúng 18 khóa này. Cột "CPU %" có trong bảng của `summarize_sessions.py` và trong bảng so (`--compare`).

**Spec §11 (phần thuộc bước 1):**
- unit test `pipeline`, phần ưu tiên và hủy: ba test cờ hủy ở `translate.rs`, test `mt_loop` ở `engine.rs` (Task 4);
- chuyển phụ đề khi ghép câu, bằng harness `Composer`: bốn test H2 (Task 5);
- engine với `fake_asr_worker` và `fake_llama_server`: `latency-bench session` chạy hết một lượt với hai tiến trình giả (Task 1 Step 10);
- giao diện: test markup của `OverlayLine`, ảnh thanh phụ đề qua `scripts/ui-preview` (Task 8); dòng hai tầng và các phần còn lại của §11 là việc của kế hoạch 03;
- đo bằng A1: Task 3 và Task 12.

**Hợp đồng của kế hoạch 00:**
- **H1:** `Job.cancel: Option<&AtomicBool>`; `translate` kiểm cờ trước mỗi request và ở mọi gói; `mt_loop` truyền cờ; nơi gọi khác (`mt_eval.rs`, `tests/real_terms.rs`, `tests/lifecycle.rs`) truyền `None` (Task 4).
- **H2:** `held`, `fresh` trong `SubState`; `MtDelta` chuyển sang bản mới khi `fresh` đủ dài; `MtRetry` chỉ bỏ `fresh`; `settle` xóa cả hai (Task 5).
- **H7:** lệnh mẫu, các khóa của file JSON (`args`, `machine`, `events`, `summary`, thêm `usage`, `run`, `utterances`), 18 khóa của `summary`; `summarize_sessions.py` (Task 1, 2).
- **H8:** `src/windows/overlay/OverlayLine.tsx`, `memo`, props `{ line, showSource, uiLanguage }`, cách `overlay.tsx` gọi (Task 8).
- **H9:** `SessionArgs` đúng các trường liệt kê, `pub fn run`; `Timed { t_ms, ev }`, `Recorded { Subtitle, Delta, Indicators }`, `pub fn summarize(truth: &[Utterance], events: &[Timed]) -> Summary`; biến thể `Session(session::SessionArgs)` (Task 1).

**Không còn chỗ trống:** `‹…›` chỉ có ở khung biên bản (Task 3, 11, 12), đoạn sửa spec chính (Task 11 Step 8A, 8B) và hash của lệnh revert (Task 11 Step 7B). Đó là số đo hay hash chỉ có lúc chạy; mỗi chỗ ghi rõ lấy từ đâu. `<model đang chạy>` theo quy ước của kế hoạch 00.

**Tên dùng giữa các task:**
- `Summary` mọi trường là `Option<f64>`; `session::run` điền các khóa của lượt chạy (`segments`, `busy_ratio`, `cpu_percent`, `partials`).
- Khóa của `run` dùng ở Task 3 Step 6, Task 12 Step 9 (`measured`, `feed_lag_max_ms`, `sidecar_restarts`) và ở `summarize_sessions.py --compare` (`asr_p50_ms`, `mt_p50_ms`) đều có trong `RunInfo`.
- `block_frames` (Task 6), `drain_when_ready` (Task 7), `AUDIO_CTX_ALIGN`, `align_audio_ctx` (Task 9), `flash_attn_wanted`, `effective_audio_ctx` (Task 10) được định nghĩa ở task trước khi task sau dùng.
- Nhãn lượt đo `buoc1-moc` (Task 3) và `buoc1-sau` (Task 12) khớp với `--compare` ở Task 12 Step 10.

**Để lại cho kế hoạch sau:**
- kế hoạch 02: cờ `--streaming`, `--streaming-end-silence-ms`, `--tgt-agree` của `SessionArgs`; biến thể `Live`, `LiveEnd` của `Recorded`; `partials`, `cadence_p50_ms`, `streaming_auto_off` có số;
- kế hoạch 03: prop `dimProvisional`, `LiveLineView.tsx`;
- kế hoạch 04: kiểm A3 trên thiết bị thu âm thật;
- sau này: đo flash attention trên Windows (Vulkan) rồi mới bật.
