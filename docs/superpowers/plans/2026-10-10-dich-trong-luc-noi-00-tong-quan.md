# Dịch trong lúc người nói chưa dừng · 00: Tổng quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:** Phụ đề dịch hiện ngay trong lúc người nói chưa dừng, theo hai tầng:
- chữ tạm (nhạt) khoảng 1 s sau lời nói;
- phần ổn định 1,5–3 s sau lời nói.

Khi người nói ngừng, lượt cuối chạy y như hiện nay, nên chất lượng bản lưu không đổi.

**Kiến trúc:**
- **Luồng VAD:** trong lúc đoạn VAD còn mở, theo nhịp tự chỉnh, luồng VAD chụp âm thanh của đoạn và đưa một yêu cầu chép từng phần vào hàng đợi nhận dạng. Hàng đợi có một ô riêng cho yêu cầu này: đoạn đóng luôn đi trước, yêu cầu mới thay yêu cầu cũ.
- **Luồng nhận dạng:** chép yêu cầu đó bằng chính `asr-worker` hiện có, không đổi giao thức.
- **Luồng phụ đề:** chốt chữ nguồn và chữ dịch bằng LocalAgreement (module `streaming`), rồi gửi yêu cầu dịch bản tạm cho luồng dịch, kèm prefill là phần dịch đã chốt. Sau đó phát sự kiện `subtitle://live` và `subtitle://live-end`.
- **Lượt cuối:** đường cũ (`subtitle://upsert` và `subtitle://delta`) giữ nguyên.

**Công nghệ:**
- Rust: crate `pipeline`, `latency-bench`, `asr-worker`, app Tauri `meeting-translator`.
- Engine: whisper.cpp 1.8.3 có vá, `llama-server` b11146.
- Giao diện: React 19, TypeScript, Zustand, Vitest.
- Không thêm thư viện mới.

**Spec:** `docs/superpowers/specs/2026-10-10-dich-trong-luc-noi-design.md`, chủ dự án duyệt ngày 2026-10-10.

**Nghiên cứu nền:** `bench/2026-10-10-do-tre/README.md`.

## Nhánh và worktree (bắt buộc)

- **Chỉ làm trên nhánh `dich-trong-luc-noi`**, trong worktree `/Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi`. Chủ dự án dặn: **không merge vào `main` cho tới khi chủ dự án cho phép.**
- **Không đổi nhánh của thư mục chính** `/Users/dtphong/Desktop/software_business/ai-translator`. Thư mục đó luôn ở `main`, và có phiên khác đang mở ở đó.
- **Không** `git merge`, `git rebase main`, `git push`, `git checkout main` trong worktree.
- **Trước mỗi commit**, chạy hai lệnh sau và kiểm kết quả:
  - `git -C <worktree> branch --show-current` phải in ra `dich-trong-luc-noi`;
  - `git -C <worktree> status --short` để biết những gì sắp vào commit.
- Chỉ `git add` đúng các file của nhiệm vụ, **không** `git add -A`.
- Mọi lệnh trong các kế hoạch chạy từ gốc worktree. Dùng đường dẫn tuyệt đối, hoặc `cd /Users/dtphong/Desktop/software_business/meeting-translator-work/dich-trong-luc-noi` ở đầu lệnh.

## Các kế hoạch con và thứ tự

| # | File | Phạm vi |
|---|---|---|
| 01 | `2026-10-10-dich-trong-luc-noi-01-do-va-cai-tien-nhanh.md` | Bước 1 của spec §9. Chuẩn bị worktree (Task 0). A1: `latency-bench session` đo bằng `pipeline::Engine` thật, có các chỉ số §10.1 và mốc chế độ thường với ngưỡng 50 ms. A2: ghép câu không xóa bản dịch đang hiện, kiểm cờ hủy ở mỗi gói. A3: bớt độ trễ thu âm. A4: memo từng dòng của thanh phụ đề. A5: flash attention cho whisper với `audio_ctx` là bội của 256, có cổng test tất định. |
| 02 | `2026-10-10-dich-trong-luc-noi-02-ban-thu-pipeline.md` | Bước 2. Module `streaming`, `StreamingConfig`, ảnh chụp đoạn mở, ô chép từng phần trong hàng đợi, prefill trong `llama.rs` và `translate_live`, trạng thái dòng đang nói trong `Composer`, nhịp và tự tắt, sự kiện `live` và `live_end` của `EventSink`, `Engine::set_streaming_enabled`. Thêm cờ streaming cho `latency-bench session`. Đo theo lưới tham số, rồi **cổng duyệt của chủ dự án**, rồi đặt mặc định theo quyết định. |
| 03 | `2026-10-10-dich-trong-luc-noi-03-app-giao-dien.md` | Bước 3. Cài đặt `translateWhileSpeaking`; quyết định máy đủ sức; nối `TauriSink` (chỉ gửi cho thanh phụ đề); đổi công tắc giữa phiên; kiểu TS; store và dòng hai tầng của thanh phụ đề (ẩn câu được nối tiếp); công tắc và ghi chú trong Cài đặt › Phụ đề; khung xem trước hai tầng; chuỗi vi/en; `ui-preview` và Playwright. |
| 04 | `2026-10-10-dich-trong-luc-noi-04-nghiem-thu.md` | Bước 4. Nghiệm thu theo §10.2 trên M4 Pro (hai gói) và hướng dẫn chủ dự án đo trên máy Windows i5; sửa spec chính theo §12; biên bản; hỏi chủ dự án trước khi merge. |

**Thứ tự bắt buộc:** 01 → 02 (dừng ở cổng, chờ chủ dự án) → 03 → 04.
- Không chạy hai kế hoạch song song, vì chúng dùng chung một cây làm việc.
- Kế hoạch 03 dựng trên dòng đã memo của 01 (A4), và trên kiểu, API của 02.

## Hợp đồng dùng chung (khóa lại; kế hoạch con phải khớp từng tên)

### H1. `Job` có cờ hủy (kế hoạch 01, A2)

`crates/pipeline/src/translate.rs`:

```rust
#[derive(Clone, Copy, Debug)]
pub struct Job<'a> {
    pub text: &'a str,
    pub src: Lang,
    pub tgt: Lang,
    pub context: Option<&'a str>,
    pub terms: &'a [Term],
    /// Cờ hủy (spec 2026-10-10 §4.6, A2): `translate` kiểm trước khi gửi request và ở mỗi gói chữ stream về, kể cả gói
    /// đang bị hậu xử lý giữ lại. Bật thì trả `Outcome::Cancelled`.
    pub cancel: Option<&'a AtomicBool>,
}
```

Mọi chỗ dựng `Job` (`engine.rs` `mt_loop`, `latency-bench` `mt_eval.rs`, test) thêm `cancel`.

### H2. Ghép câu giữ bản dịch đang hiện (kế hoạch 01, A2)

`SubState` trong `engine.rs` có thêm hai trường:

```rust
/// Bản dịch của phiên bản trước, vẫn đang hiện trên màn hình trong lúc phiên bản mới (sau khi ghép câu) đang dịch.
held: Option<String>,
/// Chữ của bản dịch mới nhận được trong lúc `held` còn hiện.
fresh: String,
```

Luật:
- **`grow`** không xóa `tgt_text`. Nếu `tgt_text` khác rỗng thì chuyển nó sang `held`. Upsert vẫn mang chữ cũ.
- **`dispatch`** của câu có `held` cũng không xóa `tgt_text`.
- **`MtDelta`**, khi `held` là `Some`: cộng chữ vào `fresh` và không phát delta. Khi `fresh` có ít nhất bằng số ký tự (`chars().count()`) của `held`, thì làm lần lượt:
  - bỏ `held`;
  - gán `tgt_text = fresh`;
  - phát upsert;
  - xóa `fresh`;
  - từ gói sau phát delta như thường.
- **`MtRetry`** khi có `held`: chỉ xóa `fresh`.
- **`settle`** luôn bỏ `held`, xóa `fresh`, rồi ghi chữ cuối.

### H3. Cấu hình `streaming` (kế hoạch 02)

`crates/pipeline/src/config.rs`:

```rust
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct LangAgree {
    pub lang: String,
    /// Số bản dịch tạm liền nhau phải trùng phần đầu (spec §4.4).
    pub n: usize,
    /// Số đơn vị cuối chừa lại, không chốt.
    pub k: usize,
}

/// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §4–§5).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct StreamingConfig {
    pub min_partial_speech_ms: u64, // 1000
    pub min_new_speech_ms: u64,     // 300
    /// Ngưỡng im lặng tối thiểu để đóng đoạn ở chế độ này (§4.7). Mặc định tạm 400; chốt ở cổng của kế hoạch 02.
    pub end_silence_ms: u64,        // 400
    pub src_holdback_words: usize,  // 1
    pub src_holdback_chars: usize,  // 2 (zh, ja)
    pub tgt_agree: Vec<LangAgree>,  // en 2/1, vi 2/1, zh 2/2, ja 3/2, ko 3/2
    pub tgt_agree_fallback: LangAgree, // lang "", n 2, k 1 (tiếng nguồn không có trong danh sách)
    pub cycle_window: usize,        // 8
    pub cadence_factor: f32,        // 1.5
    pub min_cadence_ms: u64,        // 700
    pub max_cadence_ms: u64,        // 2000
    pub initial_cadence_ms: u64,    // 1000
    pub warmup_cycles: usize,       // 3
    pub auto_off_cycle_ms: u64,     // 1300
}

impl StreamingConfig {
    /// (n, k) theo tiếng nguồn; không có trong `tgt_agree` thì dùng `tgt_agree_fallback`.
    pub fn agree_for(&self, src_lang: &str) -> (usize, usize);
}
```

`PipelineConfig` có thêm `pub streaming: StreamingConfig`. Manifest đổi được giá trị như mọi khóa khác. `validate()` kiểm các khóa sau:

| Khóa | Giá trị hợp lệ |
|---|---|
| `streaming.min_partial_speech_ms` | 250..=5000 |
| `streaming.min_new_speech_ms` | ≤ 2000 |
| `streaming.end_silence_ms` | 50..=2000 |
| `streaming.src_holdback_words` | ≤ 10 |
| `streaming.src_holdback_chars` | ≤ 10 |
| `streaming.tgt_agree` | mọi mục có `n` trong 2..=5 và `k` ≤ 10 |
| `streaming.tgt_agree_fallback` | `n` trong 2..=5 và `k` ≤ 10 |
| `streaming.cycle_window` | 1..=32 |
| `streaming.cadence_factor` | 1.0..=4.0 |
| `streaming.min_cadence_ms` | ≥ 200 |
| `streaming.max_cadence_ms` | ≥ `min_cadence_ms` và ≤ 10000 |
| `streaming.initial_cadence_ms` | trong [`min_cadence_ms`, `max_cadence_ms`] |
| `streaming.warmup_cycles` | ≤ `cycle_window` |
| `streaming.auto_off_cycle_ms` | ≥ 200 |

### H4. Module `streaming` (kế hoạch 02)

File mới `crates/pipeline/src/streaming.rs`, khai báo `pub mod streaming;` trong `lib.rs`. Module này chỉ chứa luật thuần, không có luồng hay khóa:

```rust
/// Một đơn vị hiển thị (từ, hay chữ với zh/ja) và khóa so khớp (NFC, chữ thường, bỏ dấu câu) — spec §3.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unit { pub text: String, pub key: String }

pub fn uses_char_units(lang: &str) -> bool;                 // "zh" | "ja"
/// Mọi đơn vị trả về đều có `key` khác rỗng: phần chỉ gồm dấu câu (ký tự loại P, hay token như "—", "…") không thành
/// đơn vị riêng mà gắn vào `text` của đơn vị đứng trước; nếu ở đầu chuỗi thì gắn vào đơn vị đứng sau. Chuỗi không có
/// đơn vị nào có key thì trả rỗng. Nhờ vậy "你好，世界" và "你好世界" có cùng dãy key [你,好,世,界].
pub fn split_units(text: &str, lang: &str) -> Vec<Unit>;
pub fn join_units(units: &[Unit], lang: &str) -> String;    // "" với zh/ja, " " với tiếng khác
/// Bỏ một dấu kết câu ở cuối (. ? ! 。 ？ ！) và khoảng trắng sau nó (spec §4.3).
pub fn strip_terminal_punct(text: &str) -> &str;

/// Kết quả hiển thị: `stable + tail` là cả chuỗi; `tail` tự mang khoảng trắng đầu khi cần.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Split { pub stable: String, pub tail: String }

/// Chốt dần theo LocalAgreement-n, chỉ dài thêm (spec §4.2, §4.4).
pub struct Stabilizer { /* lang, n, holdback, history: VecDeque<Vec<Unit>>, stable: Vec<Unit> */ }
impl Stabilizer {
    pub fn new(lang: &str, agree_n: usize, holdback: usize) -> Self;
    /// Thêm một kết quả mới (bản chép từng phần, hay bản dịch tạm đã xong) và trả phần ổn định / phần tạm.
    pub fn push(&mut self, text: &str) -> Split;
    /// Phần ổn định dạng chuỗi (không có khoảng trắng cuối): dùng làm prefill.
    pub fn stable_text(&self) -> String;
    pub fn stable_len(&self) -> usize;
}

/// Nhịp T và tự tắt (spec §5).
pub struct Cadence { /* cửa sổ các vòng gần nhất */ }
impl Cadence {
    pub fn new(cfg: &StreamingConfig) -> Self;
    pub fn record(&mut self, cycle_ms: f32);
    pub fn cadence_ms(&self) -> u64;   // initial khi < warmup_cycles vòng; sau đó factor × trung vị, kẹp [min, max]
    pub fn too_slow(&self) -> bool;    // đủ cycle_window vòng và trung vị > auto_off_cycle_ms
}
```

Luật của `Stabilizer::push`:
- Tách đơn vị, rồi giữ `n` kết quả gần nhất.
- Khi đã đủ `n` kết quả, tính `c` = độ dài phần chung (theo `key`) của cả `n` kết quả, rồi `cand = c − holdback` (không âm).
- Nếu `cand > stable_len`, và kết quả mới nhất khớp `stable` ở các vị trí đầu, thì `stable` lấy `cand` đơn vị đầu của kết quả mới nhất.
- `tail` là các đơn vị của kết quả mới nhất, tính từ vị trí `stable_len()` trở đi.

### H5. Sự kiện dòng đang nói (kế hoạch 02)

`crates/pipeline/src/subtitle.rs`. Tên trường giữ kiểu snake_case như `Subtitle`:

```rust
#[derive(Clone, Debug, PartialEq, Serialize)]
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct LiveEnd { pub id: u64 }
```

### H6. API của engine cho app (kế hoạch 02)

`crates/pipeline/src/engine.rs`:

```rust
pub trait EventSink: Send + Sync {
    // … các hàm cũ giữ nguyên …
    /// Dòng đang nói đổi (spec §6.2). Mặc định bỏ qua.
    fn live(&self, _line: &LiveLine) {}
    /// Gỡ dòng đang nói (lượt cuối đã chốt, đoạn bị lọc hay bỏ, chế độ tự tắt, dừng phiên). Mặc định bỏ qua.
    fn live_end(&self, _end: &LiveEnd) {}
}

pub struct Indicators {
    pub lagging: bool,
    pub no_audio: bool,
    pub translation_unavailable: bool,
    /// Phiên này dịch sau mỗi câu vì máy chưa đủ nhanh (bị tắt từ đầu, hay tự tắt) — spec §6.3. Serde: `streamingUnavailable`.
    pub streaming_unavailable: bool,
}

pub struct EngineConfig {
    // … các trường cũ …
    /// Máy đủ sức cho chế độ này (app quyết lúc bắt đầu phiên, spec §5 "Tắt ngay từ đầu phiên").
    pub streaming_supported: bool,
    /// Công tắc của người dùng lúc bắt đầu phiên (`translateWhileSpeaking`); đổi giữa phiên bằng `set_streaming_enabled`.
    pub streaming_enabled: bool,
}

impl Engine {
    /// Bật/tắt chế độ này giữa phiên; có tác dụng từ đoạn kế tiếp (spec §6.3).
    pub fn set_streaming_enabled(&self, on: bool);
}
```

Luật bắt buộc:
- **Chế độ đang có hiệu lực** = `streaming_supported && công tắc && !tự_tắt`.
- **Khi chế độ có hiệu lực:**
  - ngưỡng đóng đoạn = max(`segmenter.end_silence_ms` (giá trị người dùng chỉnh, app đã ghi vào đây), `streaming.end_silence_ms`);
  - cửa sổ ghép tính lại bằng `merge_window_ms` với ngưỡng đó.
- **Đổi ngưỡng** chỉ áp khi không có đoạn mở (từ đoạn kế tiếp).
- **`!streaming_supported`:** engine phát `indicators` với `streaming_unavailable = true` ngay đầu phiên. Tự tắt cũng bật cờ này, và phát `live_end` cho mọi dòng đang nói.
- **Chế độ không có hiệu lực:** engine chạy đúng như sau kế hoạch 01, không phát `live`.

### H7. `latency-bench session` (kế hoạch 01 dựng, 02 thêm cờ streaming)

Lệnh mẫu:

```
latency-bench session --wav <session.wav> --truth <session.truth.json> \
  --asr-worker <asr-worker> --asr-model <ggml.bin> --llama-server <llama-server> --mt-model <gguf> \
  --languages en,zh,ja,ko,vi --target vi --end-silence-ms 50 --out <file.json> \
  [--streaming] [--streaming-end-silence-ms N] [--tgt-agree en:2:1,zh:2:2,…]   # ba cờ cuối: kế hoạch 02
```

- Lệnh chạy `pipeline::Engine` với `SampleSource`, phát WAV theo thời gian thực. ASR và dịch là tiến trình phụ thật, dựng giống app (`supervisor`).
- `EventSink` ghi mọi sự kiện (`subtitle`, `delta`, `live`, `live_end`, `indicators`) kèm thời điểm, tính bằng ms từ lúc bắt đầu phát.
- Session truyền `--target vi`, riêng session tiếng Việt truyền `--target en`, giống `run_matrix.py` cũ.

File JSON ra có các khóa `args`, `machine`, `events`, `summary`. `summary` có ít nhất các khóa sau, tên giữ nguyên (ms, số thực, không có thì `null`):

| Khóa | Ý nghĩa |
|---|---|
| `a2_p50_ms`, `a2_p90_ms`, `a2_first_p50_ms` | A2 như cũ: từ hết câu (truth) tới lúc bản dịch hiện đủ / chữ đầu tiên |
| `first_from_start_p50_ms`, `first_from_start_p90_ms` | Từ đầu câu tới chữ dịch đầu tiên, ở tầng nào cũng được (§10.1) |
| `word_lag_tentative_p50_ms`, `word_lag_tentative_p90_ms` | Trễ theo từ, tầng tạm (§10.1) |
| `word_lag_stable_p50_ms`, `word_lag_stable_p90_ms` | Trễ theo từ, tầng ổn định (§10.1) |
| `stable_flicker_ratio` | Độ nháy tầng ổn định (§10.1) |
| `tentative_erasure_ratio` | Độ nháy tầng tạm (§10.1) |
| `busy_ratio` | Mức bận (§10.1) |
| `cpu_percent` | CPU của `asr-worker`, `llama-server` và tiến trình đo, chia cho thời gian thật và số lõi. Cách tính như S6: `cpu_percent` trong `latency.rs` cũ. Dùng cho tiêu chí CPU ≤ 30% ở §10.2 |
| `utterances`, `segments`, `partials`, `cadence_p50_ms`, `streaming_auto_off` | Đếm và trạng thái |

Ánh xạ cho chế độ thường, khi không có `live`:
- tầng tạm là lần đầu một phụ đề phủ tới từ đó có chữ dịch;
- tầng ổn định là lúc phụ đề phủ tới từ đó chốt (`done`, không còn `provisional`) và không bị thay sau đó.

Tổng hợp nhiều file: `python3 bench/2026-10-10-do-tre/summarize_sessions.py <file.json>…` in bảng Markdown (kế hoạch 01 viết).

### H8. Dòng phụ đề đã memo (kế hoạch 01, A4; kế hoạch 03 dựng tiếp)

File mới `src/windows/overlay/OverlayLine.tsx`. Component này vẽ đúng DOM mà `overlay.tsx` đang vẽ cho mỗi dòng:
- `div.line.<kind>[.provisional]`;
- trong đó `div.source` (nếu có) và `div.main`, kèm `span.tag` khi `failed`.

```tsx
export interface OverlayLineProps {
  line: Subtitle;
  showSource: boolean;
  uiLanguage: UiLanguage; // đúng kiểu mà `translate()` của src/i18n nhận
}
export const OverlayLine = memo(function OverlayLine(props: OverlayLineProps) { /* … */ });
```

- `overlay.tsx` gọi `<OverlayLine key={l.id} line={l} showSource={view.showSource} uiLanguage={view.uiLanguage} />`.
- Dòng không đổi giữ nguyên tham chiếu object, nhờ `appendDelta`/`upsertLine` hiện có, nên không vẽ lại.
- Kế hoạch 03 thêm prop tùy chọn `dimProvisional?: boolean` (mặc định `true`), và file `src/windows/overlay/LiveLineView.tsx` cho dòng đang nói.

### H9. Bên trong `latency-bench session` (kế hoạch 01 dựng, 02 mở rộng)

**`crates/latency-bench/src/session.rs`:**

```rust
#[derive(clap::Args, Debug)]
pub struct SessionArgs {
    #[arg(long)] pub wav: PathBuf,
    #[arg(long)] pub truth: PathBuf,
    #[arg(long)] pub asr_worker: PathBuf,
    #[arg(long)] pub asr_model: PathBuf,
    #[arg(long)] pub llama_server: PathBuf,
    #[arg(long)] pub mt_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")] pub languages: Vec<String>,
    #[arg(long, default_value = "vi")] pub target: String,
    #[arg(long, default_value_t = 50)] pub end_silence_ms: u64,
    #[arg(long)] pub out: PathBuf,
    // kế hoạch 02 thêm: #[arg(long)] streaming: bool; #[arg(long)] streaming_end_silence_ms: Option<u64>;
    //                   #[arg(long)] tgt_agree: Option<String>  (dạng "en:2:1,zh:2:2")
}
pub fn run(args: SessionArgs) -> anyhow::Result<()>;
```

**`crates/latency-bench/src/session_metrics.rs`** (hàm thuần, có unit test):

```rust
pub struct Timed { pub t_ms: f64, pub ev: Recorded }
pub enum Recorded {
    Subtitle(pipeline::subtitle::Subtitle),
    Delta(pipeline::subtitle::Delta),
    Indicators(pipeline::engine::Indicators),
    // kế hoạch 02 thêm: Live(pipeline::subtitle::LiveLine), LiveEnd(pipeline::subtitle::LiveEnd),
}
/// `truth`: các câu của `*.truth.json` (kiểu dùng chung với `latency.rs`); trả các khóa `summary` của H7.
pub fn summarize(truth: &[Utterance], events: &[Timed]) -> Summary;
#[derive(serde::Serialize)] pub struct Summary { /* đúng các khóa của H7 */ }
```

`main.rs` có thêm biến thể `Session(session::SessionArgs)` trong `enum Command`.

## Điều chỉnh so với spec (đã cân nhắc, không đổi ý của spec)

1. **Hủy dịch bằng `Job.cancel` (H1)** thay vì kiểm cờ trong callback. Callback hiện chỉ được gọi khi có chữ được phát, nên không bắt được lúc hậu xử lý giữ chữ hay lúc trước khi gửi request (spec §4.6).
2. **`tgt_agree_fallback`:** spec chỉ nêu (n, k) cho năm tiếng nguồn; giá trị dự phòng tránh panic khi gặp mã lạ.
3. **Mặc định tạm `streaming.end_silence_ms = 400`** cho tới cổng của kế hoạch 02. Nhiệm vụ cuối của kế hoạch 02 đặt lại theo quyết định của chủ dự án (QĐ4), và sửa spec theo.
4. **Đo vòng cập nhật bằng giờ thật** (`Instant`), từ lúc luồng VAD tạo yêu cầu chép từng phần tới lúc bản dịch tạm của nó xong. Trong test, thời điểm được truyền vào nên chạy tất định.
5. **Cửa sổ ghép** tính lại theo ngưỡng đang có hiệu lực (H6), vì spec §4.7 giữ công thức max(700, ngưỡng + 400).

## Quy ước chung

- **Commit:** tiếng Việt, theo kiểu đang dùng: `feat(pipeline): …`, `fix(overlay): …`, `test(pipeline): …`, `bench(do-tre): …`, `docs(spec): …`. Kết thúc bằng dòng `Co-Authored-By: <model đang chạy> <noreply@anthropic.com>`.
- **Không push, không merge** (xem "Nhánh và worktree").
- **Không** `pkill` hay `killall` theo tên. App AI Translator bản cài đặt có thể đang chạy `llama-server` của nó. Tự ghi PID của tiến trình mình mở và chỉ `kill <PID>` đó.
- **Lệnh kiểm**, đúng như CI (`.github/workflows/ci.yml`):

  ```sh
  cargo fmt --all -- --check
  cargo clippy --locked --workspace --all-targets -- -D warnings
  cargo clippy --locked -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
  cargo test --locked --workspace
  pnpm build && pnpm test
  ./scripts/check-windows.sh --locked     # khi đụng code của app hay audio-capture
  ```

  Chạy riêng một crate: `cargo test --locked -p pipeline <tên test>`.
- **Quyền riêng tư (spec chính §10.2):** log không bao giờ chứa âm thanh, chữ chép hay chữ dịch, kể cả bản tạm. Chỉ ghi số đo thời gian và số đếm.
- **Thư viện:** không thêm thư viện mới. Nếu buộc phải thêm thì theo spec chính §6.12 (bản ổn định mới nhất, kiểm tương thích, build lại toàn bộ, chạy test).
- **Shell:** dùng zsh, không viết `echo ====` (zsh hiểu `=cmd` là lệnh), hãy đặt chuỗi trong dấu nháy.
- **Dữ liệu đo không commit** nằm ở `bench/phase0/data/` (worktree trỏ symlink sang thư mục chính, Task 0 của kế hoạch 01). Kết quả nhỏ (JSON, Markdown) commit vào `bench/2026-10-10-do-tre/results/`.
