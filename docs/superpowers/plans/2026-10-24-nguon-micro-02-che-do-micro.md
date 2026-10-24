# Nguồn micro, kế hoạch 02: chế độ chỉ micro trong app

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Người dùng chọn "Micro" ở Cài đặt › Âm thanh thì app dịch giọng người nói trong phòng, với cấu hình chống tiếng
ồn đã chốt ở spike (khuếch đại +20 dB, lọc 80 Hz, RNNoise chỉ cho VAD, VAD 0,5 / 400 / 500 ms).

**Architecture:**
- `audio-capture` có chuỗi micro mới (`mic_chain.rs`): một luồng thiết bị ra hai bản 16 kHz thẳng hàng, bản cho whisper
  và bản cho VAD.
- `pipeline` cho `FrameSource` đọc thêm bản VAD, và vòng VAD của engine tính xác suất tiếng nói trên bản đó.
- App thêm `captureMode`, `micDevice`, `micNoiseFilter` vào settings, mở nguồn micro theo `CapturePlan`, kiểm quyền
  micro, có bốn lệnh IPC mới, và giao diện ở Cài đặt › Âm thanh và màn hình chính.

**Tech Stack:** Rust (Core Audio, WASAPI, `rubato`, `nnnoiseless` 0.5.2, `objc2-av-foundation` 0.3.2), Tauri 2,
React 19 + Zustand, Vitest.

---

## Bối cảnh

- **Spec:** `docs/superpowers/specs/2026-10-24-nguon-micro-design.md`. **Mục 16 ghi đè** các mục trước. Đọc mục 3, 4,
  5.6–5.8, 7, 10 và 16 trước khi làm.
- **Kết quả spike:** `bench/2026-10-24-nguon-micro/results/ket-qua.md`.
- **Kế hoạch 01 (spike):** `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`. Đã xong, trừ Task 17 (Windows),
  chuyển sang Task 16 của kế hoạch này.
- **Worktree:** `/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro`, nhánh `nguon-micro`.
  Đặt `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro`.
  - Shell reset thư mục sau mỗi lệnh: **mọi lệnh đều bắt đầu bằng `cd $W &&`** (viết đường dẫn tuyệt đối).
  - Không merge, push, deploy hay đẩy tag khi chủ dự án chưa cho phép.
- **Code đã có từ spike** (dùng lại, không viết lại):
  - `crates/audio-capture/src/highpass.rs`: `HighPass::new(rate, cutoff)`, `process(&mut [f32])`.
  - `crates/audio-capture/src/macos_input.rs`: `MacInputSource`, `mic_permission()`, `request_mic_permission(wait)`.
  - `crates/audio-capture/src/windows.rs`: `InputSource`, `MicEndpoint`, `list_capture_devices`.
  - `crates/audio-capture/src/lib.rs`: `Transport`, `InputDevice`, `MicPermission`, `mic_source`,
    `list_input_devices`, `default_input_signature`.
  - `crates/audio-capture/src/duck.rs`: dùng ở kế hoạch 03, kế hoạch này không đụng.
- **Ngoài phạm vi:**
  - Chế độ `both`, `DuckingMixer` trong app, `micIssue` loại `permission`/`unavailable`: kế hoạch 03.
  - Pháp lý, website, sửa spec chính, phát hành: kế hoạch 04.

## Quyết định của kế hoạch

- **QĐ1, bộ tiền xử lý riêng cho micro.** `MicPreprocessor` mới nằm trong `mic_chain.rs`. `Preprocessor` hiện có không
  đổi. Kế hoạch 03 sẽ ghép hai bộ này với `DuckingMixer`.
- **QĐ2, thứ tự chuỗi giống `mix-eval`**, vì các số đo trong spec mục 16 có được từ đúng thứ tự này:
  - Bản cho whisper: thiết bị → 16 kHz mono → ×10 (+20 dB) rồi `tanh` → lọc 80 Hz.
  - Bản cho VAD: thiết bị → 48 kHz mono → RNNoise → 16 kHz → ×10 rồi `tanh` → lọc 80 Hz.
  - Tắt "Lọc tiếng ồn micro" thì bản cho VAD là bản sao của bản cho whisper.
  - **Đã sửa sau Task 17** (`results/thu-tay-mac.md`, `results/gioi-han-muc.md`):
    - lọc 80 Hz chạy trước khuếch đại;
    - bản cho whisper dùng `Limiter` (tới +20 dB, trần 0,9) thay `tanh`;
    - bản cho VAD giữ `tanh`;
    - tắt lọc ồn thì `min_speech_ms` 250.
    Đo lại bằng `mix-eval`: mọi số bằng hoặc tốt hơn.
- **QĐ3, hai bản lệch nhau vài ms là chấp nhận được.** Bản cho VAD đi qua thêm hai bộ đổi tần số và RNNoise, nên trễ
  hơn chừng 10–20 ms. Đoạn có phần đệm 200 ms (`pad_ms`) nên lệch này không cắt mất chữ. Test chỉ kiểm phần đổi tần số
  (lệch ≤ 20 ms); `MicChain` chỉ trả số mẫu bằng nhau ở hai bản.
- **QĐ4, tham số VAD của micro đặt ở `session::engine_config`**, qua `pipeline.segmenter`. Không thêm trường vào
  `EngineConfig`.
  - Giá trị: `threshold` 0,5, `min_speech_ms` 400, `end_silence_ms` 500. Thay `vadEndSilenceMs` của người dùng.
  - Áp cả khi tắt lọc ồn (spec mục 16).
  - Bước "Nghe thử" luôn dùng âm thanh máy và tham số cũ.
- **QĐ5, quyền micro.**
  - `start_with` thấy quyền đã bị từ chối thì từ chối bắt đầu phiên với `micPermission`, trước khi nạp model.
  - Quyền chưa hỏi: luồng thu xin quyền rồi mới mở micro (spec mục 16: không để Core Audio tự hỏi, vì như thế `start` bị
    chặn suốt lúc hộp thoại mở).
  - Windows: đọc khóa `ConsentStore\microphone` (`Value` và `NonPackaged`). Lỗi WASAPI `E_ACCESSDENIED` (`0x80070005`)
    cũng ánh xạ thành `micPermission`.
- **QĐ6, micro đã chọn không còn thì báo `micUnavailable`**, không tự rơi về micro mặc định. Lỗi mở theo `FailurePolicy`
  như nguồn đơn hiện nay.
- **QĐ7, `micIssue` ở kế hoạch này chỉ có `"suspected"`** (micro trả toàn số 0 suốt 3 giây từ đầu phiên). Hai giá trị
  `"permission"` và `"unavailable"` chỉ có ý nghĩa ở chế độ `both`: kế hoạch 03 thêm.
- **QĐ8, gỡ `ShortUnsure`.** `is_short` chuyển vào `latency-bench/src/mix_eval.rs`, vì `score_mix.py` còn đọc cột
  `short`.
- **QĐ9, luật `Hallucination` thêm danh sách cụm "chứa là bỏ"** (`hallucination_markers`). Chỉ gồm các cụm quảng cáo
  kênh rõ ràng, vì luật áp cho mọi chế độ.
- **QĐ10, `SessionDeps` có thêm `mic_permission` và `request_mic_permission`.** Nhờ vậy test chạy bằng bản giả, không
  bao giờ gọi hộp thoại quyền thật trên máy dev.
- **QĐ11, log ghi chế độ và loại kết nối của micro** (`builtin`, `usb`, `bluetooth`, `virtual`, `other`), không ghi tên.

## Cấu trúc file

| File | Việc |
|---|---|
| `crates/pipeline/src/config.rs`, `filter.rs`, `engine.rs` | Gỡ `ShortUnsure`; thêm `hallucination_markers`; `FrameSource::read_with_vad`; vòng VAD đọc bản VAD |
| `crates/latency-bench/src/mix_eval.rs`, `latency.rs`, `denoise.rs`, `Cargo.toml` | `is_short` cục bộ; bỏ nhánh `ShortUnsure`; `rnnoise` dùng `Denoiser` của `audio-capture` |
| `crates/audio-capture/src/resample.rs` | `MonoResampler::to_rate` (tần số ra tùy ý) |
| `crates/audio-capture/src/mic_chain.rs` (mới) | `Denoiser`, `MicChain`, `MicPreprocessor` |
| `crates/audio-capture/src/lib.rs`, `windows.rs`, `bin/mic-probe.rs`, `Cargo.toml` | `mic_permission()`, `request_mic_permission()` đa nền tảng; `nnnoiseless` |
| `src-tauri/src/settings/mod.rs`, `migrate.rs` | `CaptureMode`, `micDevice`, `micNoiseFilter` |
| `src-tauri/src/errors.rs` | `MIC_PERMISSION`, `MIC_UNAVAILABLE` |
| `src-tauri/src/capture.rs` | `CapturePlan`, nguồn micro trong `capture_loop`, `LiveCapture::read_with_vad`, `CaptureEvent::MicSilent` |
| `src-tauri/src/state.rs` | `AppStatus.mic_issue` |
| `src-tauri/src/session.rs`, `test_support.rs`, `app_tests.rs` | `SessionDeps::capture(plan)`, quyền micro, `engine_config` theo plan |
| `src-tauri/src/system.rs`, `actions.rs`, `commands.rs`, `build.rs`, `capabilities/main.json`, `acl_tests.rs` | Bốn lệnh IPC mới |
| `src-tauri/Info.plist`, `src-tauri/macos/*.lproj/InfoPlist.strings`, `src-tauri/release/entitlements.plist` | Câu hỏi quyền micro |
| `src/lib/ipc.ts`, `src/store/app.ts`, `src/lib/audioSource.ts`, `src/lib/subtitleView.ts` | Kiểu, store, nhãn, ghi chú |
| `src/windows/main/settings/AudioSettings.tsx`, `src/windows/main/screens/Home.tsx` | Giao diện |
| `src/i18n/{en,vi,ja,zh,ko}.ts` | Chuỗi mới |
| Bản giả và fixture: `src/store/app.test.ts`, `scripts/ui-preview/tauri-mock.ts`, `src/lib/subtitleView.test.ts`, `src/store/overlay.test.ts`, `src/store/transcript.test.ts` | Trường mới |

---

### Task 0: Mốc ban đầu

**Files:** không đổi.

- [ ] **Step 1: Chạy toàn bộ test Rust**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace --locked 2>&1 | grep -E "^test result|FAILED|panicked" | sort | uniq -c
```

Expected: mọi dòng `test result: ok`, không có `FAILED`. Ghi lại tổng số test để so ở Task 15.

- [ ] **Step 2: Chạy test JS, build và kiểm Windows**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -3 && sh scripts/check-windows.sh --locked 2>&1 | tail -3
```

Expected: Vitest xanh, `tsc` và `vite build` không lỗi, clippy cho Windows `Finished` không có warning.

Có lỗi thì dừng, báo chủ dự án trước khi làm tiếp.

---

### Task 1: Gỡ `ShortUnsure`, thêm cụm "chứa là bỏ" cho luật `Hallucination`

**Files:**
- Modify: `crates/pipeline/src/config.rs` (trường `short_*`, thêm `hallucination_markers`)
- Modify: `crates/pipeline/src/filter.rs` (`Verdict::ShortUnsure`, `is_short`, `is_short_unsure`, test; `is_hallucination`)
- Modify: `crates/pipeline/src/engine.rs:913-917` (nhánh match)
- Modify: `crates/latency-bench/src/latency.rs:47,550`, `crates/latency-bench/src/mix_eval.rs:16,233,356`

- [ ] **Step 1: Trả `config.rs`, `engine.rs` và phần `ShortUnsure` của `filter.rs` về như `main`**

Trên nhánh này, ba file của `pipeline` chỉ khác `main` ở phần `ShortUnsure` (kiểm bằng
`git diff main --stat -- crates/pipeline`: chỉ `config.rs`, `engine.rs`, `filter.rs`).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git diff main --stat -- crates/pipeline && git checkout main -- crates/pipeline/src/config.rs crates/pipeline/src/engine.rs crates/pipeline/src/filter.rs && git diff main --stat -- crates/pipeline
```

Expected: lệnh `git diff` thứ hai không in gì.

- [ ] **Step 2: Chuyển `is_short` vào `mix_eval.rs`, bỏ nhánh `ShortUnsure` ở `latency.rs`**

Trong `crates/latency-bench/src/mix_eval.rs`, sửa dòng `use`:

```rust
use pipeline::filter::{Evidence, Verdict, pcm_skip, verdict};
```

Thêm ngay sau các dòng `use`:

```rust
/// Chữ Hán, hiragana, katakana: tiếng Trung, Nhật viết liền nên câu ngắn được đếm theo chữ.
fn is_cjk(c: char) -> bool {
    matches!(c, '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}')
}

/// Câu ngắn (cột `short` cho `score_mix.py`): có chữ, tối đa 2 từ và tối đa 4 chữ Hán hay kana. "OK", "Đúng rồi",
/// "好的", "はい", "네" là câu ngắn; "我们明天下午开会" thì không. Luật `ShortUnsure` của spike đã bị gỡ (spec
/// 2026-10-24-nguon-micro mục 16); chỉ còn phép đếm này để chấm.
fn is_short(text: &str) -> bool {
    let words = text
        .split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .count();
    let cjk = text.chars().filter(|&c| is_cjk(c)).count();
    words > 0 && words <= 2 && cjk <= 4
}
```

Sửa dòng 356 thành `row.short = is_short(&text);`. Sửa chú thích dòng 233 thành:
`/// Câu ngắn theo [`is_short`]: `score_mix.py` đếm câu ngắn giữ được mà không chép lời lại.`

Trong `crates/latency-bench/src/latency.rs`, xóa hằng `SKIP_SHORT_UNSURE` (dòng 47) và nhánh
`Verdict::ShortUnsure => return Err(SKIP_SHORT_UNSURE.into()),` (dòng 550).

Thêm test vào `mod tests` của `mix_eval.rs`:

```rust
    #[test]
    fn short_texts_are_one_or_two_words_or_up_to_four_han_or_kana() {
        for text in ["OK", "Đúng rồi.", "好的", "はい", "네", "Got it!"] {
            assert!(is_short(text), "{text}");
        }
        for text in ["我们明天下午开会", "We will meet tomorrow", "내일 회의가 있어요", "...", ""] {
            assert!(!is_short(text), "{text}");
        }
    }
```

- [ ] **Step 3: Viết test cho cụm "chứa là bỏ" (chưa chạy được)**

Thêm vào `mod tests` của `crates/pipeline/src/filter.rs`:

```rust
    /// Spec 2026-10-24-nguon-micro mục 16: câu quảng cáo kênh dài hơn cụm trong danh sách vẫn bị bỏ khi chứa một cụm
    /// "chứa là bỏ". Câu thật có nhắc tới việc đăng ký kênh thì giữ.
    #[test]
    fn channel_promotions_are_dropped_even_inside_longer_text() {
        let cfg = FilterConfig::default();
        for text in [
            "Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ lỡ những video hấp dẫn",
            "Ghiền Mì Gõ!",
            "Don't forget to like and subscribe, see you next time",
        ] {
            assert!(is_hallucination(text, &cfg), "{text:?}");
            assert_eq!(verdict(&CLEAR, text, &cfg), Verdict::Hallucination, "{text:?}");
        }
        for text in [
            "Tôi đã đăng ký kênh của anh ấy hôm qua",
            "We should subscribe to the vendor newsletter",
            "Like I said, the budget is fixed",
        ] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn the_marker_list_comes_from_the_config() {
        let cfg = FilterConfig {
            hallucination_markers: vec!["xin cảm ơn quý vị".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("Vâng, xin cảm ơn quý vị đã lắng nghe", &cfg));
        let none = FilterConfig {
            hallucination_markers: vec![String::new()],
            ..FilterConfig::default()
        };
        assert!(!is_hallucination("Ghiền Mì Gõ", &none), "cụm rỗng không khớp mọi câu");
    }
```

- [ ] **Step 4: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p pipeline --lib filter 2>&1 | tail -5
```

Expected: lỗi `no field hallucination_markers`.

- [ ] **Step 5: Thêm trường và luật**

Trong `crates/pipeline/src/config.rs`, thêm vào `FilterConfig` ngay sau `hallucination_phrases`:

```rust
    /// Cụm quảng cáo kênh mà model hay bịa ra khi âm thanh nhỏ được khuếch đại (spec 2026-10-24-nguon-micro mục 16):
    /// đoạn **chứa** một cụm này thì bị bỏ, kể cả khi còn chữ khác. Chỉ gồm cụm không gặp trong cuộc họp thật, vì luật áp
    /// cho mọi chế độ.
    pub hallucination_markers: Vec<String>,
```

Thêm hằng ngay sau `DEFAULT_HALLUCINATION_PHRASES`:

```rust
/// Cụm "chứa là bỏ" mặc định (`FilterConfig::hallucination_markers`). Câu "Hãy subscribe cho kênh Ghiền Mì Gõ Để không bỏ
/// lỡ những video hấp dẫn" lọt qua hai lần ở spike nguồn micro.
pub const DEFAULT_HALLUCINATION_MARKERS: &[&str] = &[
    "subscribe cho kênh",
    "ghiền mì gõ",
    "để không bỏ lỡ những video hấp dẫn",
    "like and subscribe",
    "구독과 좋아요 부탁",
    "请不吝点赞",
];
```

Trong `impl Default for FilterConfig`, sau dòng `hallucination_phrases: …`:

```rust
            hallucination_markers: DEFAULT_HALLUCINATION_MARKERS.iter().map(|s| s.to_string()).collect(),
```

Trong `crates/pipeline/src/filter.rs`, sửa `is_hallucination` (chú thích và thân hàm):

```rust
/// Đoạn chỉ gồm câu ảo giác quen thuộc (`FilterConfig::hallucination_phrases`), có thể lặp nhiều lần, hoặc chỉ gồm dấu câu
/// và ký hiệu (như "♪♪", "..."), hoặc chứa một cụm quảng cáo kênh (`FilterConfig::hallucination_markers`). Đoạn có thêm
/// chữ khác thì giữ: "Thank you for watching the demo" là câu thật.
///
/// Nhãn có ngoặc được bỏ trước, trên chữ còn nguyên dấu câu; sau đó mới chuẩn hóa và bỏ các câu còn lại.
pub fn is_hallucination(text: &str, cfg: &FilterConfig) -> bool {
    if text.trim().is_empty() {
        return false;
    }
    let normalized = normalize(text);
    if cfg
        .hallucination_markers
        .iter()
        .map(|m| normalize(m))
        .any(|m| !m.is_empty() && normalized.contains(&m))
    {
        return true;
    }
    let (labels, phrases): (Vec<&String>, Vec<&String>) = cfg.hallucination_phrases.iter().partition(|p| is_label(p));
    let unlabelled = strip_all(compact(text), labels.into_iter().map(|p| compact(p)).collect());
    let rest = normalize(&unlabelled);
    if rest.is_empty() {
        return true;
    }
    strip_all(rest, phrases.into_iter().map(|p| normalize(p)).collect()).is_empty()
}
```

- [ ] **Step 6: Chạy test của `pipeline` và `latency-bench`**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p pipeline -p latency-bench --locked 2>&1 | grep -E "^test result|FAILED|panicked|error"
```

Expected: mọi dòng `test result: ok`.

- [ ] **Step 7: Clippy rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p pipeline -p latency-bench --all-targets --locked -- -D warnings 2>&1 | tail -2 && git add crates/pipeline crates/latency-bench && git commit -m "$(cat <<'EOF'
feat(pipeline): gỡ ShortUnsure, luật Hallucination bắt câu chứa cụm quảng cáo kênh

Spike nguồn micro (spec mục 16): ShortUnsure không giảm chữ ảo mà làm mất câu ngắn;
câu "Hãy subscribe cho kênh Ghiền Mì Gõ…" lọt qua luật cũ vì dài hơn cụm trong danh sách.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Engine tính VAD trên bản riêng (`FrameSource::read_with_vad`)

**Files:**
- Modify: `crates/pipeline/src/engine.rs:84-89` (trait), `:733-821` (`vad_loop`), `mod tests`

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `crates/pipeline/src/engine.rs`, sau hàm `live`:

```rust
    /// Nguồn có bản VAD riêng (spec 2026-10-24-nguon-micro §5.8): bản cho whisper là `samples`, bản cho VAD toàn im lặng
    /// hoặc giống hệt bản whisper.
    struct TwoViews {
        samples: SampleSource,
        vad_silent: bool,
    }

    impl FrameSource for TwoViews {
        fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            self.samples.read(out, timeout)
        }

        fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
            let from = out.len();
            let more = self.samples.read(out, timeout)?;
            if self.vad_silent {
                vad_out.extend(std::iter::repeat_n(0.0, out.len() - from));
            } else {
                vad_out.extend_from_slice(&out[from..]);
            }
            Ok(more)
        }
    }

    /// VAD chỉ nghe bản VAD: bản đó im lặng thì không đoạn nào được mở, dù bản cho whisper có tiếng. Bản VAD có tiếng thì
    /// đoạn được mở và whisper nhận đúng âm thanh của bản whisper.
    #[test]
    fn the_vad_listens_to_its_own_view() {
        for vad_silent in [true, false] {
            let seen = Arc::new(Mutex::new(Vec::new()));
            let source = Box::new(TwoViews {
                samples: SampleSource::new(speech_then_silence(1_500), 1_600, Duration::ZERO),
                vad_silent,
            });
            let (engine, _sink) = start(source, energy(), Box::new(RecordingAsr(seen.clone())), quick_mt(), cfg());
            engine.join();
            let seen = seen.lock().unwrap().clone();
            if vad_silent {
                assert!(seen.is_empty(), "{seen:?}");
            } else {
                assert_eq!(seen.len(), 1, "{seen:?}");
            }
        }
    }

    /// Bản mặc định của `read_with_vad`: bản VAD là bản sao phần mới của `out`.
    #[test]
    fn by_default_the_vad_view_copies_the_new_samples() {
        let mut source = SampleSource::new(vec![0.1, 0.2, 0.3], 2, Duration::ZERO);
        let (mut out, mut vad) = (vec![9.0], Vec::new());
        assert!(source.read_with_vad(&mut out, &mut vad, Duration::ZERO).unwrap());
        assert_eq!((out.as_slice(), vad.as_slice()), (&[9.0, 0.1, 0.2][..], &[0.1, 0.2][..]));
    }
```

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p pipeline --lib the_vad_listens 2>&1 | tail -5
```

Expected: lỗi `read_with_vad is not a member of trait FrameSource`.

- [ ] **Step 3: Thêm phương thức vào trait**

Thay trait `FrameSource` (dòng 84–89):

```rust
/// Nguồn âm thanh 16 kHz mono.
pub trait FrameSource: Send {
    /// Thêm mẫu mới vào `out`, chờ tối đa `timeout` nếu chưa có. `Ok(false)`: hết luồng. `Err`: nguồn hỏng hẳn (app đã
    /// thử mở lại mà không được, 02c); engine báo [`Fatal::Audio`].
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> Result<bool>;

    /// Như `read`, kèm bản cho VAD (spec 2026-10-24-nguon-micro §5.8): `vad_out` nhận cùng số mẫu với phần mới của `out`,
    /// thẳng hàng theo chỉ số. Nguồn micro cho VAD nghe bản đã lọc ồn, còn whisper nghe bản chưa lọc. Bản mặc định chép
    /// phần mới của `out`.
    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> Result<bool> {
        let from = out.len();
        let more = self.read(out, timeout)?;
        vad_out.extend_from_slice(&out[from..]);
        Ok(more)
    }
}
```

- [ ] **Step 4: Vòng VAD đọc và tính xác suất trên bản VAD**

Trong `vad_loop`:

1. Dòng `let (mut buf, mut frames, mut no_audio) = (Vec::new(), 0u64, false);` thành:

```rust
    // `buf`: bản cho whisper (mức âm lượng, `SilenceMonitor`, `Segmenter`); `vad_buf`: bản cho VAD, thẳng hàng theo chỉ số.
    let (mut buf, mut vad_buf, mut frames, mut no_audio) = (Vec::new(), Vec::new(), 0u64, false);
```

2. `match source.read(&mut buf, Duration::from_millis(20)) {` thành
   `match source.read_with_vad(&mut buf, &mut vad_buf, Duration::from_millis(20)) {`.

3. Vòng khung:

```rust
        let mut consumed = 0;
        let ready = buf.len().min(vad_buf.len());
        while ready - consumed >= FRAME_SAMPLES {
            let frame = &buf[consumed..consumed + FRAME_SAMPLES];
            let vad_frame = &vad_buf[consumed..consumed + FRAME_SAMPLES];
            consumed += FRAME_SAMPLES;
```

4. `let prob = match vad.prob(frame) {` thành `let prob = match vad.prob(vad_frame) {`.

5. Cuối vòng ngoài, `buf.drain(..consumed);` thành:

```rust
        buf.drain(..consumed);
        vad_buf.drain(..consumed);
```

- [ ] **Step 5: Chạy test của `pipeline`**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p pipeline --locked 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: mọi dòng `ok`, có hai test mới.

- [ ] **Step 6: Clippy rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p pipeline --all-targets --locked -- -D warnings 2>&1 | tail -2 && git add crates/pipeline && git commit -m "$(cat <<'EOF'
feat(pipeline): VAD tính trên bản riêng của nguồn (FrameSource::read_with_vad)

Nguồn micro cho VAD nghe bản đã lọc ồn, whisper nghe bản chưa lọc (spec nguồn micro §5.8).
Bản mặc định chép phần mới của out, nên mọi nguồn hiện có không đổi.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `MonoResampler` ra tần số tùy ý

**Files:**
- Modify: `crates/audio-capture/src/resample.rs:37-66` và test dòng ~220

- [ ] **Step 1: Viết test**

Thêm vào `mod tests` của `resample.rs`:

```rust
    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    /// Chuỗi micro (spec 2026-10-24-nguon-micro §5.7) đưa âm thanh lên 48 kHz cho bộ lọc ồn rồi về 16 kHz: số mẫu đúng tỉ
    /// lệ (trừ phần trễ của bộ lọc, dưới 10 ms) và mức tín hiệu giữ nguyên.
    #[test]
    fn mono_audio_goes_up_to_48k_and_back() {
        let tone: Vec<f32> = (0..16_000)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * 1_000.0 * i as f32 / 16_000.0).sin())
            .collect();
        let mut up = MonoResampler::to_rate(16_000, 1, 48_000).unwrap();
        let mut at48 = Vec::new();
        up.process(&tone, &mut at48).unwrap();
        assert!((47_520..=48_000).contains(&at48.len()), "{}", at48.len());
        let mut down = MonoResampler::to_rate(48_000, 1, 16_000).unwrap();
        let mut back = Vec::new();
        down.process(&at48, &mut back).unwrap();
        assert!((15_680..=16_000).contains(&back.len()), "{}", back.len());
        let (a, b) = (rms(&tone[4_000..12_000]), rms(&back[4_000..12_000]));
        assert!((20.0 * (b / a).log10()).abs() < 0.5, "{a} {b}");
    }

    #[test]
    fn the_same_rate_passes_through() {
        let mut r = MonoResampler::to_rate(48_000, 2, 48_000).unwrap();
        let mut out = Vec::new();
        r.process(&[0.2, 0.4, 0.6, 0.8], &mut out).unwrap();
        assert_eq!(out, [0.3, 0.7]);
    }
```

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --lib resample 2>&1 | tail -5
```

Expected: lỗi `no function or associated item named to_rate`.

- [ ] **Step 3: Thêm `to_rate`, cho `with_block` nhận tần số ra**

Thay `new` và `with_block`:

```rust
    pub fn new(input_rate: u32, channels: u16) -> Result<Self> {
        Self::to_rate(input_rate, channels, TARGET_RATE)
    }

    /// Như `new`, nhưng ra tần số `output_rate`: chuỗi micro đưa âm thanh lên 48 kHz cho bộ lọc ồn rồi về 16 kHz (spec
    /// 2026-10-24-nguon-micro §5.7). Khối vào vẫn là [`block_frames`].
    pub fn to_rate(input_rate: u32, channels: u16, output_rate: u32) -> Result<Self> {
        Self::with_block(input_rate, channels, output_rate, block_frames(input_rate))
    }

    /// Như `to_rate`, với khối `block` khung vào (test so với khối cũ 1024).
    fn with_block(input_rate: u32, channels: u16, output_rate: u32, block: usize) -> Result<Self> {
        let inner = if input_rate == output_rate {
            None
        } else {
            // sub_chunks = 1: khối FFT đủ lớn để bộ lọc chống alias cắt gần tần số Nyquist của đầu ra.
            Some(
                Fft::<f32>::new_custom(
                    input_rate as usize,
                    output_rate as usize,
                    block,
                    1,
                    1,
                    WindowFunction::BlackmanHarris2,
                    FixedSync::Input,
                )
                .map_err(|e| anyhow!("không tạo được bộ resample: {e}"))?,
            )
        };
```

(phần còn lại của `with_block` giữ nguyên). Sửa chú thích đầu file thành
`//! Gộp về mono rồi resample (mặc định xuống 16 kHz) bằng rubato (spec §6.2).`
Sửa test cũ ở dòng ~220: `MonoResampler::with_block(48_000, 2, TARGET_RATE, block)`.

- [ ] **Step 4: Chạy test của `audio-capture`**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --locked 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: mọi dòng `ok`.

- [ ] **Step 5: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p audio-capture --all-targets --locked -- -D warnings 2>&1 | tail -2 && git add crates/audio-capture/src/resample.rs && git commit -m "$(cat <<'EOF'
feat(audio-capture): MonoResampler ra tần số tùy ý (to_rate)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Chuỗi micro (`Denoiser`, `MicChain`, `MicPreprocessor`)

**Files:**
- Create: `crates/audio-capture/src/mic_chain.rs`
- Modify: `crates/audio-capture/src/lib.rs` (`pub mod mic_chain;`), `crates/audio-capture/Cargo.toml`
- Modify: `crates/latency-bench/src/denoise.rs`, `crates/latency-bench/Cargo.toml`

- [ ] **Step 1: Chuyển `nnnoiseless` sang `audio-capture`**

Trong `crates/audio-capture/Cargo.toml`, thêm vào `[dependencies]` (theo thứ tự chữ cái, sau `hound`):

```toml
# Lọc ồn RNNoise cho bản VAD của micro (spec 2026-10-24-nguon-micro §5.7, mục 16). Rust thuần, BSD-3-Clause.
nnnoiseless = { version = "0.5.2", default-features = false }
```

Xóa dòng `nnnoiseless = …` khỏi `crates/latency-bench/Cargo.toml` (latency-bench đã phụ thuộc `audio-capture`).
Bản 0.5.2 đã có trong `Cargo.lock` nên `--locked` vẫn chạy.

- [ ] **Step 2: Viết `mic_chain.rs` với test trước (phần cài đặt để `todo!()`)**

Tạo `crates/audio-capture/src/mic_chain.rs`:

```rust
//! Chuỗi xử lý micro (spec 2026-10-24-nguon-micro §5.7, mục 16): một luồng thiết bị ra hai bản 16 kHz mono thẳng hàng
//! theo chỉ số.
//!
//! - Bản cho whisper: 16 kHz → khuếch đại +20 dB, chặn mềm `tanh` → lọc 80 Hz.
//! - Bản cho VAD: 48 kHz → RNNoise → 16 kHz → khuếch đại, chặn mềm → lọc 80 Hz. Tắt "Lọc tiếng ồn micro" thì bản này là
//!   bản sao của bản cho whisper.
//!
//! Thứ tự các bước giống hệt `latency-bench mix-eval` (nơi đo ra các số của spec mục 16). Bản cho VAD đi qua thêm hai bộ
//! đổi tần số và RNNoise nên trễ hơn bản cho whisper chừng 10–20 ms; đoạn có 200 ms đệm nên lệch này không cắt chữ.

use crate::AudioFormat;
use crate::highpass::HighPass;
use crate::resample::{MonoResampler, TARGET_RATE};
use anyhow::Result;
use nnnoiseless::DenoiseState;

/// Khuếch đại cố định của micro (spec mục 16): micro laptop thu giọng ở 1 m chỉ khoảng −38 dBFS.
pub const MIC_GAIN_DB: f32 = 20.0;
/// Lọc thông cao (lớp 1, §5.7): cắt tiếng thình thịch khi gõ bàn.
pub const MIC_HIGHPASS_HZ: f32 = 80.0;
/// RNNoise chạy ở 48 kHz, khung 10 ms.
const DENOISE_RATE: u32 = 48_000;
const DENOISE_FRAME: usize = DenoiseState::FRAME_SIZE;

/// RNNoise theo luồng: nhận mẫu 48 kHz trong [-1, 1], trả mẫu đã lọc theo từng khung 480 mẫu. Khung đầu tiên ra im lặng
/// (tiếng "fade-in" của mạng, khuyến nghị của `nnnoiseless`).
pub struct Denoiser {
    state: Box<DenoiseState<'static>>,
    pending: Vec<f32>,
    frame_in: [f32; DENOISE_FRAME],
    frame_out: [f32; DENOISE_FRAME],
    first: bool,
}

impl Default for Denoiser {
    fn default() -> Self {
        Self::new()
    }
}

impl Denoiser {
    pub fn new() -> Self {
        todo!()
    }

    /// Ghi thêm vào `out` mọi khung đủ 480 mẫu; phần lẻ giữ cho lần sau.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        todo!()
    }
}

/// Bước lọc ồn của bản VAD. Test dùng `Identity` để đo riêng phần đổi tần số.
enum Stage {
    Rnnoise(Denoiser),
    #[cfg(test)]
    Identity,
}

/// Đường đi của bản VAD: lên 48 kHz, lọc ồn, về 16 kHz.
struct VadPath {
    up: MonoResampler,
    stage: Stage,
    down: MonoResampler,
    at48: Vec<f32>,
    clean48: Vec<f32>,
}

pub struct MicChain {
    to16: MonoResampler,
    vad_path: Option<VadPath>,
    gain: f32,
    highpass: HighPass,
    highpass_vad: HighPass,
    /// Mẫu đã xử lý xong của hai bản, chưa ghép cặp (bản VAD tới chậm hơn).
    asr: Vec<f32>,
    vad: Vec<f32>,
    scratch: Vec<f32>,
}

impl MicChain {
    /// `noise_filter`: công tắc "Lọc tiếng ồn micro" (RNNoise cho bản VAD).
    pub fn new(format: AudioFormat, noise_filter: bool) -> Result<Self> {
        todo!()
    }

    /// `interleaved`: mẫu thô của thiết bị (không cần chia hết cho số kênh). Ghi cùng số mẫu 16 kHz vào `out` (whisper) và
    /// `out_vad` (VAD).
    pub fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        todo!()
    }
}

/// Đọc ring buffer của nguồn micro và chạy [`MicChain`] (chế độ `mic`, QĐ1 của kế hoạch 02).
pub struct MicPreprocessor {
    consumer: rtrb::Consumer<f32>,
    chain: MicChain,
    raw: Vec<f32>,
}

impl MicPreprocessor {
    pub fn new(consumer: rtrb::Consumer<f32>, format: AudioFormat, noise_filter: bool) -> Result<Self> {
        todo!()
    }

    /// Đọc hết mẫu đang có, ghi thêm cùng số mẫu vào `out` (whisper) và `out_vad` (VAD).
    pub fn drain(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        todo!()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    fn format(sample_rate: u32, channels: u16) -> AudioFormat {
        AudioFormat { sample_rate, channels }
    }

    fn sine(rate: u32, hz: f32, amp: f32, seconds: f32) -> Vec<f32> {
        (0..(rate as f32 * seconds) as usize)
            .map(|i| amp * (2.0 * std::f32::consts::PI * hz * i as f32 / rate as f32).sin())
            .collect()
    }

    /// Chạy cả `input` qua chuỗi theo từng khối 10 ms, như luồng thu.
    fn run(chain: &mut MicChain, input: &[f32], rate: u32) -> (Vec<f32>, Vec<f32>) {
        let (mut out, mut vad) = (Vec::new(), Vec::new());
        for block in input.chunks(rate as usize / 100) {
            chain.process(block, &mut out, &mut vad).unwrap();
            assert_eq!(out.len(), vad.len(), "hai bản luôn cùng độ dài");
        }
        (out, vad)
    }

    /// Lệch (mẫu) mà `b` đi sau `a` nhiều nhất về tương quan, trong ±`max`.
    fn lag(a: &[f32], b: &[f32], max: usize) -> isize {
        let n = a.len().min(b.len()) - max;
        (-(max as isize)..=max as isize)
            .max_by(|&x, &y| {
                let corr = |l: isize| -> f32 {
                    (max..n).map(|i| a[i] * b[(i as isize + l) as usize]).sum()
                };
                corr(x).total_cmp(&corr(y))
            })
            .unwrap()
    }

    #[test]
    fn the_denoiser_keeps_whole_frames_and_silences_the_first() {
        let mut d = Denoiser::new();
        let mut out = Vec::new();
        d.process(&vec![0.1; 700], &mut out);
        assert_eq!(out.len(), 480);
        assert!(out.iter().all(|&v| v == 0.0), "khung đầu là im lặng");
        d.process(&vec![0.1; 260], &mut out);
        assert_eq!(out.len(), 960, "phần lẻ 220 + 260 thành một khung");
    }

    /// Không lọc ồn: hai bản giống hệt nhau; giọng nhỏ (−46 dBFS) được đưa lên khoảng +20 dB.
    #[test]
    fn without_the_noise_filter_both_views_are_identical_and_amplified() {
        let mut chain = MicChain::new(format(48_000, 2), false).unwrap();
        let mono = sine(48_000, 440.0, 0.005, 1.0);
        let stereo: Vec<f32> = mono.iter().flat_map(|&v| [v, v]).collect();
        let (out, vad) = run(&mut chain, &stereo, 96_000);
        assert_eq!(out, vad);
        assert!((15_600..=16_000).contains(&out.len()), "{}", out.len());
        let gain = 20.0 * (rms(&out[4_000..12_000]) / rms(&mono[12_000..36_000])).log10();
        assert!((gain - MIC_GAIN_DB).abs() < 0.5, "{gain}");
    }

    /// Chặn mềm: tiếng rất to sau khuếch đại không vượt quá 1, tiếng nhỏ gần như tuyến tính. Lọc 80 Hz chạy sau bước này
    /// (như `mix-eval`), nên đầu ra cuối có thể vượt 1 một chút ở sườn của tiếng bị chặn; whisper vẫn nhận được.
    #[test]
    fn amplification_is_soft_limited() {
        let mut x = [0.9f32, -0.9, 0.001];
        amplify(&mut x, 10.0);
        assert!(x[0] < 1.0 && x[0] > 0.99 && x[1] > -1.0);
        assert!((x[2] - 0.01).abs() < 1e-5);
    }

    /// Lọc 80 Hz: 40 Hz giảm mạnh, 300 Hz gần như giữ nguyên (so với cùng mức đã khuếch đại).
    #[test]
    fn the_highpass_cuts_rumble_but_keeps_voice() {
        let level = |hz: f32| {
            let mut chain = MicChain::new(format(16_000, 1), false).unwrap();
            let (out, _) = run(&mut chain, &sine(16_000, hz, 0.005, 1.0), 16_000);
            20.0 * (rms(&out[8_000..]) / (0.005 * 10.0 / 2f32.sqrt())).log10()
        };
        assert!(level(40.0) < -6.0, "{}", level(40.0));
        assert!(level(300.0).abs() < 1.0, "{}", level(300.0));
    }

    /// Phần đổi tần số của bản VAD (lên 48 kHz rồi về 16 kHz) chỉ làm bản VAD trễ tối đa 20 ms so với bản whisper (QĐ3).
    #[test]
    fn the_vad_view_lags_by_at_most_20_ms() {
        let mut chain = MicChain::new(format(44_100, 1), false).unwrap();
        chain.vad_path = Some(VadPath::new(format(44_100, 1), Stage::Identity).unwrap());
        // Xung vuông 5 Hz biên độ nhỏ: có nhiều sườn để đo tương quan.
        let input: Vec<f32> = (0..44_100).map(|i| if (i / 4_410) % 2 == 0 { 0.003 } else { -0.003 }).collect();
        let (out, vad) = run(&mut chain, &input, 44_100);
        let l = lag(&out, &vad, 480);
        assert!((0..=320).contains(&l), "lệch {l} mẫu");
    }

    /// RNNoise chỉ lọc bản VAD: chuỗi tiếng click làm bản VAD nhỏ hẳn, bản whisper giữ nguyên như khi tắt lọc ồn.
    #[test]
    fn rnnoise_quiets_clicks_in_the_vad_view_only() {
        let mut clicks = vec![0.0f32; 48_000 * 2];
        for start in (4_800..clicks.len()).step_by(7_200) {
            for (k, v) in clicks[start..start + 96].iter_mut().enumerate() {
                *v = if k % 2 == 0 { 0.05 } else { -0.05 };
            }
        }
        let mut filtered = MicChain::new(format(48_000, 1), true).unwrap();
        let (out, vad) = run(&mut filtered, &clicks, 48_000);
        let mut plain = MicChain::new(format(48_000, 1), false).unwrap();
        let (reference, _) = run(&mut plain, &clicks, 48_000);
        let n = out.len().min(reference.len());
        assert_eq!(out[..n], reference[..n], "bản whisper không bị lọc");
        let drop = 20.0 * (rms(&vad[8_000..]) / rms(&out[8_000..])).log10();
        assert!(drop < -6.0, "bản VAD chỉ giảm {drop} dB");
    }

    #[test]
    fn the_preprocessor_drains_the_ring_into_both_views() {
        let (mut producer, consumer) = rtrb::RingBuffer::new(48_000);
        let mut p = MicPreprocessor::new(consumer, format(16_000, 1), false).unwrap();
        for _ in 0..1_600 {
            producer.push(0.001).unwrap();
        }
        let (mut out, mut vad) = (Vec::new(), Vec::new());
        p.drain(&mut out, &mut vad).unwrap();
        assert_eq!(out.len(), 1_600);
        assert_eq!(out, vad);
    }
}
```

Thêm `pub mod mic_chain;` vào `crates/audio-capture/src/lib.rs`, sau `pub mod highpass;`.

- [ ] **Step 3: Chạy để thấy test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --lib mic_chain 2>&1 | grep -E "test |panicked" | head
```

Expected: các test `panicked at 'not yet implemented'`.

- [ ] **Step 4: Cài đặt**

Thay các thân `todo!()`:

```rust
impl Denoiser {
    pub fn new() -> Self {
        Self {
            state: DenoiseState::new(),
            pending: Vec::with_capacity(DENOISE_FRAME * 2),
            frame_in: [0.0; DENOISE_FRAME],
            frame_out: [0.0; DENOISE_FRAME],
            first: true,
        }
    }

    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        self.pending.extend_from_slice(input);
        let whole = self.pending.len() / DENOISE_FRAME * DENOISE_FRAME;
        for chunk in self.pending[..whole].chunks_exact(DENOISE_FRAME) {
            // nnnoiseless nhận mẫu theo thang 16 bit.
            for (d, s) in self.frame_in.iter_mut().zip(chunk) {
                *d = s * 32_768.0;
            }
            self.state.process_frame(&mut self.frame_out, &self.frame_in);
            if std::mem::take(&mut self.first) {
                out.extend(std::iter::repeat_n(0.0, DENOISE_FRAME));
            } else {
                out.extend(self.frame_out.iter().map(|v| (v / 32_768.0).clamp(-1.0, 1.0)));
            }
        }
        self.pending.drain(..whole);
    }
}

impl VadPath {
    fn new(format: AudioFormat, stage: Stage) -> Result<Self> {
        Ok(Self {
            up: MonoResampler::to_rate(format.sample_rate, format.channels, DENOISE_RATE)?,
            stage,
            down: MonoResampler::to_rate(DENOISE_RATE, 1, TARGET_RATE)?,
            at48: Vec::new(),
            clean48: Vec::new(),
        })
    }

    /// Ghi thêm mẫu 16 kHz đã lọc ồn (chưa khuếch đại) vào `out`.
    fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) -> Result<()> {
        self.at48.clear();
        self.up.process(interleaved, &mut self.at48)?;
        self.clean48.clear();
        match &mut self.stage {
            Stage::Rnnoise(d) => d.process(&self.at48, &mut self.clean48),
            #[cfg(test)]
            Stage::Identity => self.clean48.extend_from_slice(&self.at48),
        }
        self.down.process(&self.clean48, out)
    }
}

/// Khuếch đại rồi chặn mềm, tại chỗ.
fn amplify(samples: &mut [f32], gain: f32) {
    for x in samples {
        *x = (*x * gain).tanh();
    }
}

impl MicChain {
    pub fn new(format: AudioFormat, noise_filter: bool) -> Result<Self> {
        let vad_path = if noise_filter {
            Some(VadPath::new(format, Stage::Rnnoise(Denoiser::new()))?)
        } else {
            None
        };
        Ok(Self {
            to16: MonoResampler::new(format.sample_rate, format.channels)?,
            vad_path,
            gain: 10f32.powf(MIC_GAIN_DB / 20.0),
            highpass: HighPass::new(TARGET_RATE, MIC_HIGHPASS_HZ),
            highpass_vad: HighPass::new(TARGET_RATE, MIC_HIGHPASS_HZ),
            asr: Vec::new(),
            vad: Vec::new(),
            scratch: Vec::new(),
        })
    }

    pub fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        let from = self.asr.len();
        self.to16.process(interleaved, &mut self.asr)?;
        amplify(&mut self.asr[from..], self.gain);
        self.highpass.process(&mut self.asr[from..]);
        match &mut self.vad_path {
            None => {
                let new = &self.asr[from..];
                self.vad.extend_from_slice(new);
            }
            Some(path) => {
                self.scratch.clear();
                path.process(interleaved, &mut self.scratch)?;
                amplify(&mut self.scratch, self.gain);
                self.highpass_vad.process(&mut self.scratch);
                self.vad.extend_from_slice(&self.scratch);
            }
        }
        let n = self.asr.len().min(self.vad.len());
        out.extend(self.asr.drain(..n));
        out_vad.extend(self.vad.drain(..n));
        Ok(())
    }
}

impl MicPreprocessor {
    pub fn new(consumer: rtrb::Consumer<f32>, format: AudioFormat, noise_filter: bool) -> Result<Self> {
        Ok(Self {
            consumer,
            chain: MicChain::new(format, noise_filter)?,
            raw: Vec::new(),
        })
    }

    pub fn drain(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> Result<()> {
        self.raw.clear();
        let available = self.consumer.slots();
        if available > 0 {
            let chunk = self.consumer.read_chunk(available)?;
            let (a, b) = chunk.as_slices();
            self.raw.extend_from_slice(a);
            self.raw.extend_from_slice(b);
            chunk.commit_all();
        }
        self.chain.process(&self.raw, out, out_vad)
    }
}
```

Ghi chú: `HighPass::process` của Task 1 kế hoạch 01 nhận `&mut [f32]`; `MonoResampler::process` ghi thêm (không xóa) vào
vector đích, nên `from` đánh dấu phần mới.

- [ ] **Step 5: Chạy test của `audio-capture`**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --locked 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: mọi dòng `ok`.

- Test `rnnoise_quiets_clicks_in_the_vad_view_only` không đạt (RNNoise giảm ít hơn 6 dB)? Đo mức giảm thật bằng
  `println!`, rồi đặt ngưỡng thấp hơn mức đo 3 dB (ghi số đo vào chú thích của test). Đừng bỏ test.
- Test `the_vad_view_lags_by_at_most_20_ms` cho lệch âm? Bản VAD đi trước bản whisper là sai hướng: dừng và tìm nguyên
  nhân.

- [ ] **Step 6: `latency-bench denoise` dùng `Denoiser`**

Trong `crates/latency-bench/src/denoise.rs`, thay thân `rnnoise`:

```rust
/// RNNoise trên âm thanh 48 kHz trong [-1, 1], bằng đúng bộ lọc của app (`audio_capture::mic_chain::Denoiser`). Khung đầu
/// là im lặng; phần lẻ cuối (dưới 10 ms) cũng là im lặng. Độ dài ra bằng độ dài vào.
pub fn rnnoise(input: &[f32]) -> Vec<f32> {
    let mut out = Vec::with_capacity(input.len());
    audio_capture::mic_chain::Denoiser::new().process(input, &mut out);
    out.resize(input.len(), 0.0);
    out
}
```

Chạy test của `latency-bench`:

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p latency-bench --locked 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: mọi dòng `ok`.

- [ ] **Step 7: Clippy (cả Windows) rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p audio-capture -p latency-bench --all-targets --locked -- -D warnings 2>&1 | tail -2 && sh scripts/check-windows.sh --locked 2>&1 | tail -2 && git add crates/audio-capture crates/latency-bench Cargo.lock && git commit -m "$(cat <<'EOF'
feat(audio-capture): chuỗi micro hai bản (whisper, VAD) với RNNoise cho VAD

Khuếch đại +20 dB chặn mềm, lọc 80 Hz, RNNoise chỉ cho bản VAD, đúng thứ tự của
mix-eval (spec nguồn micro mục 16). latency-bench denoise dùng chung Denoiser.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Quyền micro đa nền tảng trong `audio-capture`

**Files:**
- Modify: `crates/audio-capture/src/lib.rs` (sau `MicPermission`)
- Modify: `crates/audio-capture/src/windows.rs` (thêm `mic_permission`)
- Modify: `crates/audio-capture/src/bin/mic-probe.rs` (dùng hàm chung)

- [ ] **Step 1: Thêm hàm chung vào `lib.rs`**

Sau `enum MicPermission`:

```rust
/// Trạng thái quyền micro của app (spec 2026-10-24-nguon-micro §3.4). Chỉ đọc, không hỏi người dùng. Windows không có
/// trạng thái "chưa hỏi": công tắc quyền micro cho app desktop chỉ bật hay tắt.
pub fn mic_permission() -> MicPermission {
    #[cfg(target_os = "macos")]
    return macos_input::mic_permission();
    #[cfg(windows)]
    return windows::mic_permission();
    #[allow(unreachable_code)]
    MicPermission::Denied
}

/// Xin quyền micro. macOS: hiện hộp thoại nếu chưa hỏi lần nào, chờ trả lời tối đa `wait`; đã trả lời rồi thì trả ngay kết
/// quả cũ. Windows: không có hộp thoại, trả trạng thái hiện có. Gọi trước khi mở micro (spec mục 16: để Core Audio tự
/// hỏi thì `start` bị chặn suốt lúc hộp thoại mở).
pub fn request_mic_permission(wait: std::time::Duration) -> anyhow::Result<MicPermission> {
    #[cfg(target_os = "macos")]
    return Ok(if macos_input::request_mic_permission(wait)? {
        MicPermission::Granted
    } else {
        MicPermission::Denied
    });
    #[allow(unreachable_code)]
    {
        let _ = wait;
        Ok(mic_permission())
    }
}
```

- [ ] **Step 2: Windows đọc khóa `ConsentStore`**

Chuyển hàm `consent_value` từ `bin/mic-probe.rs` sang `windows.rs` (giữ nguyên thân, đổi thành `fn` riêng của module), và
thêm:

```rust
/// Khóa quyền micro của Windows (Settings › Privacy & security › Microphone). `Value` = "Deny" ở khóa gốc là tắt cho mọi
/// app; ở khóa con `NonPackaged` là tắt "Let desktop apps access your microphone" (spec 2026-10-24-nguon-micro §3.4).
const MIC_CONSENT: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";

/// Trạng thái quyền micro: "Deny" ở một trong hai khóa thì bị từ chối; không đọc được khóa thì coi là được phép (lỗi mở
/// thật sẽ tới từ WASAPI, `E_ACCESSDENIED`).
pub fn mic_permission() -> crate::MicPermission {
    let denied = [MIC_CONSENT.to_string(), format!(r"{MIC_CONSENT}\NonPackaged")]
        .iter()
        .any(|path| consent_value(path).as_deref() == Some("Deny"));
    if denied {
        crate::MicPermission::Denied
    } else {
        crate::MicPermission::Granted
    }
}
```

Trong `bin/mic-probe.rs`, lệnh `status` Windows in thêm `audio_capture::mic_permission()`:

```rust
#[cfg(windows)]
fn status() -> Result<()> {
    println!("{:?}", audio_capture::mic_permission());
    Ok(())
}
```

(xóa `consent_value` và hằng `BASE` khỏi `mic-probe.rs`). Lệnh `status` của macOS đổi sang gọi
`audio_capture::mic_permission()`, lệnh `request` gọi `audio_capture::request_mic_permission(Duration::from_secs(60))`.

- [ ] **Step 3: Kiểm hai nền tảng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p audio-capture --locked 2>&1 | grep -E "^test result|FAILED" && cargo clippy -p audio-capture --all-targets --locked -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -2
```

Expected: test xanh, hai lần clippy không có warning. Không chạy `mic-probe request` (hỏi quyền thật trên máy chủ dự
án).

- [ ] **Step 4: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add crates/audio-capture && git commit -m "$(cat <<'EOF'
feat(audio-capture): mic_permission và request_mic_permission cho cả macOS và Windows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Settings `captureMode`, `micDevice`, `micNoiseFilter`

**Files:**
- Modify: `src-tauri/src/settings/mod.rs` (enum mới, trường, `defaults`, `validate`, test)
- Modify: `src-tauri/src/settings/migrate.rs` (test)

- [ ] **Step 1: Viết test**

Trong `mod tests` của `settings/mod.rs`, thêm ba khóa vào danh sách của `serializes_with_camel_case_keys_of_spec`:
`"captureMode"`, `"micDevice"`, `"micNoiseFilter"`, và sau các `assert_eq!` hiện có:

```rust
        assert_eq!(value["captureMode"], json!("playback"));
        assert_eq!(value["micDevice"], Value::Null);
        assert_eq!(value["micNoiseFilter"], json!(true));
        assert_eq!(serde_json::to_value(CaptureMode::Mic).unwrap(), json!("mic"));
```

(nếu `Value` chưa được `use` trong module test thì dùng `serde_json::Value::Null`). Thêm test:

```rust
    /// Spec 2026-10-24-nguon-micro §4: `micDevice` là ID thiết bị, kiểm như `audioSource`.
    #[test]
    fn mic_device_ids_are_bounded() {
        let mut s = valid();
        s.mic_device = Some(String::new());
        rejects(s, "micDevice", Reason::Empty);
        let mut s = valid();
        s.mic_device = Some("x".repeat(513));
        rejects(s, "micDevice", Reason::TooLong);
        let mut s = valid();
        s.mic_device = Some("BuiltInMicrophoneDevice".into());
        assert_eq!(s.validate(), Ok(()));
    }
```

Trong `mod tests` của `migrate.rs`, sau `an_old_file_without_the_live_switch_keeps_it_off`:

```rust
    /// Spec 2026-10-24-nguon-micro §4: file của bản trước chưa có ba khóa nguồn micro thì người dùng cũ không đổi gì (âm
    /// thanh máy, micro mặc định, lọc ồn bật), không phải ghi lại file. Giá trị lạ thì về mặc định.
    #[test]
    fn an_old_file_without_mic_keys_keeps_the_playback_mode() {
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.capture_mode, CaptureMode::Playback);
        assert_eq!(loaded.settings.mic_device, None);
        assert!(loaded.settings.mic_noise_filter);
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save());
        let raw = object(json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "captureMode": "mic",
            "micDevice": "usb-1",
            "micNoiseFilter": false,
        }));
        let s = load(raw, defaults()).settings;
        assert_eq!(
            (s.capture_mode, s.mic_device.as_deref(), s.mic_noise_filter),
            (CaptureMode::Mic, Some("usb-1"), false)
        );
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "captureMode": "both" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.capture_mode, CaptureMode::Playback);
        assert_eq!(loaded.rejected, ["captureMode"]);
    }
```

(thêm `CaptureMode` vào dòng `use super::…` của module test nếu cần).

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib settings 2>&1 | tail -3
```

Expected: lỗi `cannot find type CaptureMode`.

- [ ] **Step 3: Cài đặt**

Trong `settings/mod.rs`, sau `enum AudioSource`:

```rust
/// Thu gì (spec 2026-10-24-nguon-micro §3.1). Chế độ "Âm thanh máy + Micro" (`both`) tới ở kế hoạch 03 của spec đó.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    /// Âm thanh máy theo `audioSource` (như trước khi có micro).
    Playback,
    /// Chỉ micro (`micDevice`).
    Mic,
}
```

Trong `struct Settings`, sau `audio_source`:

```rust
    /// Thu âm thanh máy hay micro (spec 2026-10-24-nguon-micro §3.1, §4). File của bản trước chưa có khóa này thì lấy
    /// mặc định `playback` (`migrate::load` ghép từng khóa), người dùng cũ không đổi gì.
    pub capture_mode: CaptureMode,
    /// Micro đã chọn: macOS là UID, Windows là ID endpoint. `None` là micro mặc định của hệ thống, tự theo khi người dùng
    /// đổi micro mặc định.
    pub mic_device: Option<String>,
    /// "Lọc tiếng ồn micro" (spec §3.2, mục 16): RNNoise cho bản VAD. Mặc định bật.
    pub mic_noise_filter: bool,
```

Trong `defaults`, sau `audio_source: AudioSource::System,`:

```rust
            capture_mode: CaptureMode::Playback,
            mic_device: None,
            mic_noise_filter: true,
```

Trong `validate`, sau khối `match &self.audio_source { … }`:

```rust
        if let Some(id) = &self.mic_device {
            check_id("micDevice", id)?;
        }
```

- [ ] **Step 4: Sửa mọi chỗ dựng `Settings` bằng tay**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --no-run 2>&1 | grep -E "^error" -A4 | head -30
```

Chỗ nào báo thiếu trường thì thêm ba trường mặc định như ở `defaults`.

- [ ] **Step 5: Chạy test settings**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib settings 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: `ok`.

- [ ] **Step 6: Commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add src-tauri/src/settings && git commit -m "$(cat <<'EOF'
feat(settings): captureMode, micDevice, micNoiseFilter (chế độ micro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Mã lỗi, `CapturePlan` và nguồn micro trong `capture.rs`

**Files:**
- Modify: `src-tauri/src/errors.rs` (hai hằng, danh sách test)
- Modify: `src/i18n/en.ts` (hai khóa `error.*`, để test mã lỗi qua; bốn ngôn ngữ còn lại ở Task 13)
- Modify: `src-tauri/src/capture.rs`

- [ ] **Step 1: Hằng lỗi**

Trong `errors.rs`, sau `APP_NOT_PLAYING`:

```rust
/// Chế độ micro: app chưa được phép dùng micro (spec 2026-10-24-nguon-micro §7).
pub const MIC_PERMISSION: &str = "micPermission";
/// Chế độ micro: không có micro, micro đã chọn không còn, micro bị rút hay bị app khác giữ độc quyền.
pub const MIC_UNAVAILABLE: &str = "micUnavailable";
```

Thêm `MIC_PERMISSION,` và `MIC_UNAVAILABLE,` vào danh sách của test mã lỗi (sau `APP_NOT_PLAYING,`). Trong
`src/i18n/en.ts`, cạnh `"error.audioPermission"`:

```ts
  "error.micPermission": "AI Translator is not allowed to use the microphone.",
  "error.micUnavailable": "Couldn't open the microphone. Check that the selected microphone is connected and not held exclusively by another app.",
```

- [ ] **Step 2: Viết test cho phần thuần của `capture.rs`**

Thêm vào `mod tests` của `capture.rs`:

```rust
    /// Spec 2026-10-24-nguon-micro §7, QĐ5, QĐ6 của kế hoạch 02: lỗi mở micro ánh xạ ra hai mã riêng.
    #[test]
    fn mic_errors_map_to_their_own_codes() {
        let mic = CapturePlan::Mic {
            device: None,
            noise_filter: true,
        };
        let denied = anyhow::anyhow!("{MIC_DENIED}");
        assert_eq!(error_code(&mic, &denied), errors::MIC_PERMISSION);
        let wasapi = anyhow::anyhow!("Initialize: Access is denied. (0x80070005)");
        assert_eq!(error_code(&mic, &wasapi), errors::MIC_PERMISSION);
        let gone = anyhow::anyhow!("không tìm thấy micro usb-1");
        assert_eq!(error_code(&mic, &gone), errors::MIC_UNAVAILABLE);
    }

    /// Micro: số 0 tuyệt đối 3 giây từ đầu phiên thì báo, không cần hỏi có app đang phát (micro thật luôn có tiếng nền).
    #[test]
    fn three_seconds_of_exact_zeros_from_the_mic_are_reported() {
        let t0 = Instant::now();
        let mut z = ZeroWatch::default();
        assert_eq!(z.push(&[0.0; 160], t0, || true), None);
        assert_eq!(z.push(&[0.0; 160], t0 + Duration::from_secs(3), || true), Some(true));
        assert_eq!(z.push(&[0.001; 160], t0 + Duration::from_secs(4), || true), Some(false));
    }

    #[test]
    fn plans_say_whether_they_use_the_mic() {
        let playback = CapturePlan::Playback {
            source: AudioSource::System,
            include_self: false,
        };
        assert!(!playback.has_mic());
        assert!(
            CapturePlan::Mic {
                device: Some("x".into()),
                noise_filter: false
            }
            .has_mic()
        );
    }
```

Test `capture_errors_map_to_ui_codes` hiện có: thay `&app` bằng `&CapturePlan::Playback { source: app.clone(),
include_self: false }` và `&AudioSource::System` bằng `&CapturePlan::Playback { source: AudioSource::System,
include_self: false }` (khai một hàm `fn playback(s: AudioSource) -> CapturePlan` trong module test cho gọn).

- [ ] **Step 3: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib capture 2>&1 | tail -3
```

Expected: lỗi `cannot find type CapturePlan`.

- [ ] **Step 4: `CapturePlan`, `CaptureEvent::MicSilent`, `error_code`**

Trong `capture.rs`:

1. Thêm sau `pub type OnEvent`:

```rust
/// Thu gì trong một phiên (spec 2026-10-24-nguon-micro §5.6): âm thanh máy theo `audioSource`, hay micro.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CapturePlan {
    /// `include_self`: macOS, tap toàn hệ thống thu cả âm thanh của chính app (bước "Nghe thử").
    Playback { source: AudioSource, include_self: bool },
    /// `device`: `None` là micro mặc định. `noise_filter`: RNNoise cho bản VAD.
    Mic { device: Option<String>, noise_filter: bool },
}

impl CapturePlan {
    pub fn has_mic(&self) -> bool {
        matches!(self, CapturePlan::Mic { .. })
    }
}

/// Lỗi khi quyền micro bị từ chối (ánh xạ ra `micPermission`).
const MIC_DENIED: &str = "chưa được phép dùng micro";
/// Lỗi WASAPI khi Windows tắt quyền micro cho app desktop.
const E_ACCESSDENIED: &str = "0x80070005";
/// Chờ người dùng trả lời hộp thoại quyền micro tối đa chừng này.
const MIC_PROMPT_WAIT: Duration = Duration::from_secs(120);
```

2. Thêm biến thể vào `CaptureEvent`:

```rust
    /// Micro trả toàn số 0 tuyệt đối 3 giây từ đầu phiên (`true`), hoặc đã có tín hiệu (`false`): thiếu quyền micro hay
    /// micro đang tắt tiếng bằng phím cứng (spec 2026-10-24-nguon-micro §5.6, §7).
    MicSilent(bool),
```

3. `error_code` nhận plan:

```rust
/// Mã lỗi cho một lần mở nguồn thất bại.
fn error_code(plan: &CapturePlan, err: &anyhow::Error) -> &'static str {
    let text = format!("{err:#}");
    match plan {
        CapturePlan::Mic { .. } if text.contains(MIC_DENIED) || text.contains(E_ACCESSDENIED) => errors::MIC_PERMISSION,
        CapturePlan::Mic { .. } => errors::MIC_UNAVAILABLE,
        CapturePlan::Playback { source, .. } => {
            if matches!(source, AudioSource::App { .. }) && text.contains("không phát âm thanh") {
                errors::APP_NOT_PLAYING
            } else if cfg!(target_os = "macos") && text.contains("AudioHardwareCreateProcessTap") {
                // Tạo tap lỗi: thường là chưa cấp quyền "Ghi âm thanh hệ thống" (§9; chờ C1, dòng 2 của S1).
                errors::AUDIO_PERMISSION
            } else {
                errors::CAPTURE_FAILED
            }
        }
    }
}
```

- [ ] **Step 5: Mở nguồn micro, bộ tiền xử lý chung, `capture_loop` theo plan**

1. Thêm `use audio_capture::mic_chain::MicPreprocessor;` và `use audio_capture::MicPermission;`.

2. Bộ tiền xử lý của một lần mở, sau `struct Opened`:

```rust
/// Bộ tiền xử lý của nguồn đang mở: âm thanh máy (một bản, bản VAD là bản sao) hay micro (hai bản).
enum Pre {
    Playback(Preprocessor),
    Mic(MicPreprocessor),
}

impl Pre {
    fn drain(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) -> anyhow::Result<()> {
        match self {
            Pre::Playback(p) => {
                let from = out.len();
                p.drain(out)?;
                out_vad.extend_from_slice(&out[from..]);
                Ok(())
            }
            Pre::Mic(m) => m.drain(out, out_vad),
        }
    }
}
```

3. Quyền micro, chạy trên luồng thu trước khi mở:

```rust
/// Đã có quyền micro chưa; chưa hỏi thì hỏi (hộp thoại macOS), để Core Audio không tự hỏi trong lúc `start` (spec mục 16).
fn ensure_mic_permission() -> anyhow::Result<()> {
    let permission = match audio_capture::mic_permission() {
        MicPermission::Undetermined => audio_capture::request_mic_permission(MIC_PROMPT_WAIT)?,
        other => other,
    };
    if permission == MicPermission::Granted {
        Ok(())
    } else {
        anyhow::bail!("{MIC_DENIED}")
    }
}

/// Loại kết nối của micro sẽ mở, để ghi log (không ghi tên: tên có thể chứa tên người, spec §4).
fn mic_transport(device: Option<&str>) -> &'static str {
    audio_capture::list_input_devices()
        .ok()
        .and_then(|list| {
            list.into_iter()
                .find(|d| device.map_or(d.is_default, |id| d.id == id))
        })
        .map_or("unknown", |d| d.transport.as_str())
}

/// Mở micro và chạy nó; lỗi thì dừng nguồn.
fn start_mic(device: Option<&str>, noise_filter: bool) -> anyhow::Result<(Opened, Pre)> {
    ensure_mic_permission()?;
    let stats = Arc::new(CaptureStats::default());
    let mut source = audio_capture::mic_source(device.map(str::to_string), stats.clone())?;
    let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    source.start(producer)?;
    let format = source.format();
    match MicPreprocessor::new(consumer, format, noise_filter) {
        Ok(p) => {
            log::info!(
                "đang thu micro: {} Hz, {} kênh, kết nối {}, lọc ồn {noise_filter}",
                format.sample_rate,
                format.channels,
                mic_transport(device)
            );
            Ok((
                Opened {
                    sources: vec![source],
                    stats: vec![stats],
                    tapped: None,
                },
                Pre::Mic(p),
            ))
        }
        Err(e) => {
            source.stop();
            Err(e)
        }
    }
}
```

4. `start_sources` trả `Pre::Playback(p)` thay vì `p` (đổi kiểu trả về thành `anyhow::Result<(Opened, Pre)>`), và thêm
   hàm chọn theo plan:

```rust
fn start_plan(plan: &CapturePlan) -> anyhow::Result<(Opened, Pre)> {
    match plan {
        CapturePlan::Playback { source, include_self } => start_sources(source, *include_self),
        CapturePlan::Mic { device, noise_filter } => start_mic(device.as_deref(), *noise_filter),
    }
}
```

5. `capture_loop(plan: CapturePlan, shared: Arc<Mutex<Option<Pre>>>, stop, on_event)`:
   - `follows_default`: `match &plan { CapturePlan::Playback { source, .. } => !matches!(source, AudioSource::Device
     { .. }), CapturePlan::Mic { device, .. } => device.is_none() }`.
   - Dấu hiệu thiết bị: `let signature_of = |plan: &CapturePlan| if plan.has_mic() {
     audio_capture::default_input_signature() } else { audio_capture::default_output_signature() };`; dùng thay cả hai
     chỗ gọi `default_output_signature()`.
   - `start_sources(&source, include_self)` thành `start_plan(&plan)`; `error_code(&source, &e)` thành
     `error_code(&plan, &e)`.
   - `log::info!("đang thu âm thanh ({} nguồn)", …)` chỉ cho âm thanh máy (micro đã ghi log ở `start_mic`).
   - Phần nguồn một app (`if let (Some(tapped), AudioSource::App { bundle_id }) = (&opened.tapped, &source)`): lấy
     `source` từ `CapturePlan::Playback { source, .. }`; với micro thì `opened.tapped` là `None` nên nhánh không chạy.
     Viết `if let (Some(tapped), CapturePlan::Playback { source: AudioSource::App { bundle_id }, .. }) = (&opened.tapped,
     &plan)`.
   - `check_stall`: `cfg!(target_os = "macos") && !plan.has_mic()` (micro luôn có khung; tap chết chỉ có ở âm thanh máy).
   - `someone_playing(&source)` thành `someone_playing_for(&plan)`:

```rust
/// Như [`someone_playing`], theo plan. Micro: không dùng (micro không có khái niệm "app đang phát").
fn someone_playing_for(plan: &CapturePlan) -> bool {
    match plan {
        CapturePlan::Playback { source, .. } => someone_playing(source),
        CapturePlan::Mic { .. } => false,
    }
}
```

6. `LiveCapture`:

```rust
pub struct LiveCapture {
    plan: CapturePlan,
    shared: Arc<Mutex<Option<Pre>>>,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    filler: ClockFiller,
    zeros: ZeroWatch,
    on_event: Arc<OnEvent>,
    started: Instant,
    buf: Vec<f32>,
    vad_buf: Vec<f32>,
    /// Bản VAD bỏ đi khi engine chỉ gọi `read`.
    unused: Vec<f32>,
}

impl LiveCapture {
    pub fn open(plan: CapturePlan, on_event: OnEvent) -> Self {
        let shared = Arc::new(Mutex::new(None));
        let stop = Arc::new(AtomicBool::new(false));
        let on_event = Arc::new(on_event);
        let thread = {
            let (shared, stop, on_event, plan) = (shared.clone(), stop.clone(), on_event.clone(), plan.clone());
            std::thread::Builder::new()
                .name("capture".into())
                .spawn(move || capture_loop(plan, shared, stop, on_event))
                .ok()
        };
        Self {
            plan,
            shared,
            stop,
            thread,
            filler: ClockFiller::new(200),
            zeros: ZeroWatch::default(),
            on_event,
            started: Instant::now(),
            buf: Vec::new(),
            vad_buf: Vec::new(),
            unused: Vec::new(),
        }
    }
}

impl FrameSource for LiveCapture {
    fn read(&mut self, out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        let mut unused = std::mem::take(&mut self.unused);
        unused.clear();
        let more = self.read_with_vad(out, &mut unused, timeout);
        self.unused = unused;
        more
    }

    fn read_with_vad(&mut self, out: &mut Vec<f32>, vad_out: &mut Vec<f32>, timeout: Duration) -> anyhow::Result<bool> {
        self.buf.clear();
        self.vad_buf.clear();
        let (shared, vad_buf) = (&self.shared, &mut self.vad_buf);
        drain_when_ready(&mut self.buf, timeout, POLL_STEP, |buf| {
            match shared.lock().unwrap_or_else(|e| e.into_inner()).as_mut() {
                Some(p) => p.drain(buf, vad_buf),
                None => Ok(()),
            }
        })?;
        let now = Instant::now();
        match &self.plan {
            CapturePlan::Mic { .. } => {
                if let Some(silent) = self.zeros.push(&self.buf, now, || true) {
                    (self.on_event)(CaptureEvent::MicSilent(silent));
                }
            }
            CapturePlan::Playback { source, .. } => {
                if cfg!(target_os = "macos")
                    && let Some(suspected) = self.zeros.push(&self.buf, now, || someone_playing(source))
                {
                    (self.on_event)(CaptureEvent::PermissionSuspected(suspected));
                }
            }
        }
        let silence = self.filler.silence_before(self.started.elapsed(), self.buf.len());
        out.extend(std::iter::repeat_n(0.0, silence));
        out.extend_from_slice(&self.buf);
        vad_out.extend(std::iter::repeat_n(0.0, silence));
        vad_out.extend_from_slice(&self.vad_buf);
        Ok(!self.stop.load(Ordering::SeqCst))
    }
}
```

Sửa chú thích đầu file: thêm một gạch đầu dòng "Chế độ micro (spec 2026-10-24-nguon-micro §5.6): xin quyền trước khi
mở, mở lại khi micro mặc định đổi, `ZeroWatch` báo `MicSilent`, không kiểm tap chết."

- [ ] **Step 6: Biên dịch và chạy test của `capture.rs`**

`session.rs` và `test_support.rs` còn gọi `LiveCapture::open(source, include_self, …)`: tạm sửa chỗ gọi ở
`session.rs:1121` thành `LiveCapture::open(CapturePlan::Playback { source: source.clone(), include_self }, on_event)`
để biên dịch được (Task 8 sửa hẳn).

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib capture 2>&1 | grep -E "^test result|FAILED|panicked|^error"
```

Expected: `ok`. Lỗi `non-exhaustive patterns: CaptureEvent::MicSilent` ở `session.rs::capture_events`: tạm thêm nhánh
`CaptureEvent::MicSilent(_) => {}` (Task 8 nối vào trạng thái).

- [ ] **Step 7: Clippy hai nền tảng rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings 2>&1 | tail -2 && sh scripts/check-windows.sh --locked 2>&1 | tail -2 && git add src-tauri/src src/i18n/en.ts && git commit -m "$(cat <<'EOF'
feat(capture): CapturePlan và nguồn micro (quyền, hai bản, MicSilent, mã lỗi micro)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Phiên dịch theo `CapturePlan`, quyền micro qua `SessionDeps`, `micIssue`

**Files:**
- Modify: `src-tauri/src/session.rs` (trait, `engine_config`, `start_with`, `capture_events`, `stop`, test)
- Modify: `src-tauri/src/state.rs:77-80,181-182` (`mic_issue`)
- Modify: `src-tauri/src/test_support.rs:365-380,513-530` (bản giả)
- Modify: `src-tauri/src/app_tests.rs` (test mới)

- [ ] **Step 1: Viết test**

Trong `mod tests` của `session.rs`, thêm (cạnh `the_engine_follows_the_language_and_pause_settings`):

```rust
    /// Spec 2026-10-24-nguon-micro mục 16 (lớp 4), QĐ4 của kế hoạch 02: nguồn micro dùng VAD riêng, thay
    /// `vadEndSilenceMs` của người dùng; âm thanh máy giữ như cũ.
    #[test]
    fn a_mic_plan_uses_the_mic_vad_parameters() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.vad_end_silence_ms = 100;
        let mic = CapturePlan::Mic {
            device: None,
            noise_filter: false,
        };
        let cfg = engine_config(&settings, &mic, PipelineConfig::default(), 0, SharedGlossary::default(), true);
        let seg = &cfg.pipeline.segmenter;
        assert_eq!((seg.threshold, seg.min_speech_ms, seg.end_silence_ms), (0.5, 400, 500));
        let playback = plan_for(&settings, StartOptions::default());
        let cfg = engine_config(&settings, &playback, PipelineConfig::default(), 0, SharedGlossary::default(), true);
        let seg = &cfg.pipeline.segmenter;
        assert_eq!((seg.min_speech_ms, seg.end_silence_ms), (250, 100));
    }

    /// Chế độ micro trong cài đặt cho plan micro; bước "Nghe thử" luôn thu âm thanh máy.
    #[test]
    fn the_plan_follows_the_settings_except_for_the_listening_test() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.capture_mode = CaptureMode::Mic;
        settings.mic_device = Some("usb-1".into());
        settings.mic_noise_filter = false;
        assert_eq!(
            plan_for(&settings, StartOptions::default()),
            CapturePlan::Mic {
                device: Some("usb-1".into()),
                noise_filter: false
            }
        );
        assert_eq!(
            plan_for(&settings, StartOptions::LISTEN_TEST),
            CapturePlan::Playback {
                source: AudioSource::System,
                include_self: true
            }
        );
    }
```

Các lời gọi `engine_config(&settings, X, …)` hiện có trong test: thêm `&CapturePlan::Playback { source:
AudioSource::System, include_self: false }` làm tham số thứ hai (khai một hằng hàm `fn system() -> CapturePlan` trong
module test).

Trong `src-tauri/src/app_tests.rs`, sau `the_listening_test_captures_the_whole_system_and_the_overlay_hears_the_level`:

```rust
/// Spec 2026-10-24-nguon-micro §7, QĐ5 của kế hoạch 02: chế độ micro mà quyền đã bị từ chối thì không bắt đầu phiên, không
/// nạp model, không mở nguồn; có quyền thì mở nguồn micro theo cài đặt.
#[test]
fn the_mic_mode_needs_the_mic_permission() {
    use crate::capture::CapturePlan;
    use audio_capture::MicPermission;
    let deps = FakeDeps::default();
    let (plans, prepares, permission) = (deps.capture_plans.clone(), deps.prepares.clone(), deps.mic_permission.clone());
    *permission.lock().unwrap() = Some(MicPermission::Denied);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    invoke(&main, "update_settings", json!({ "patch": { "captureMode": "mic" } })).unwrap();
    let err = session::toggle(app.handle()).unwrap_err();
    assert_eq!(err.code, errors::MIC_PERMISSION);
    let status = app.state::<AppState>().status();
    assert_eq!(
        (status.session, status.session_error.as_deref()),
        (SessionStatus::Error, Some(errors::MIC_PERMISSION))
    );
    assert!(plans.lock().unwrap().is_empty());
    assert_eq!(*prepares.lock().unwrap(), 0, "không nạp model");
    *permission.lock().unwrap() = Some(MicPermission::Granted);
    let status = invoke(&main, "toggle_session", json!({})).unwrap();
    assert_eq!(status["session"], "running");
    assert_eq!(
        *plans.lock().unwrap(),
        [CapturePlan::Mic {
            device: None,
            noise_filter: true
        }]
    );
}

/// Micro không có tín hiệu (spec §5.6, §7): phiên chạy tiếp, `micIssue` là `suspected`; có tín hiệu lại hay bắt đầu phiên
/// mới thì xóa.
#[test]
fn a_silent_mic_shows_a_mic_issue() {
    use crate::capture::CaptureEvent;
    use crate::state::MicIssue;
    let deps = FakeDeps::default();
    let events = deps.capture_events.clone();
    let app = mock_app_with(deps);
    let _main = window(&app, "main");
    session::start(app.handle()).unwrap();
    let current = events.lock().unwrap().remove(0);
    current(CaptureEvent::MicSilent(true));
    assert_eq!(app.state::<AppState>().status().mic_issue, Some(MicIssue::Suspected));
    current(CaptureEvent::MicSilent(false));
    assert_eq!(app.state::<AppState>().status().mic_issue, None);
    current(CaptureEvent::MicSilent(true));
    session::stop(app.handle());
    assert_eq!(app.state::<AppState>().status().mic_issue, None);
}
```

Mẫu đọc lỗi khi bắt đầu phiên: `an_exhausted_quota_refuses_to_start` (`session::toggle(…).unwrap_err().code`, đếm
`prepares`).

- [ ] **Step 2: Chạy để thấy lỗi biên dịch**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --no-run 2>&1 | grep -E "^error" | head
```

Expected: lỗi về `plan_for`, `capture_plans`, `mic_permission`, `MicIssue`.

- [ ] **Step 3: `state.rs`**

Sau `waiting_for_app`:

```rust
    /// Vấn đề của micro trong phiên đang chạy (spec 2026-10-24-nguon-micro §4, §7); `None` khi không có. Kế hoạch 03 của
    /// spec đó thêm `permission`, `unavailable` cho chế độ âm thanh máy + micro.
    pub mic_issue: Option<MicIssue>,
```

Thêm enum (cạnh các enum khác của `state.rs`; dùng cùng derive với các enum được serialize trong `AppStatus`):

```rust
/// Vấn đề của micro (`AppStatus::mic_issue`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MicIssue {
    /// Micro trả toàn số 0 từ đầu phiên: thiếu quyền micro hoặc micro đang tắt tiếng bằng phím cứng.
    Suspected,
}
```

Ở chỗ dựng `AppStatus` mặc định (dòng ~181): `mic_issue: None,`.

- [ ] **Step 4: `session.rs`**

1. Thêm `use crate::capture::CapturePlan;` (cạnh `use crate::capture::{CaptureEvent, LiveCapture, OnEvent};`),
   `use crate::settings::CaptureMode;`, `use audio_capture::MicPermission;`, `use crate::state::MicIssue;`.

2. Trait `SessionDeps`: thay `fn capture(…)` bằng

```rust
    /// Mở nguồn âm thanh theo `plan`. Việc của nguồn tới sau (nguồn chạy trên luồng riêng) đi qua `on_event`.
    fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource>;
    /// Quyền micro lúc này (chỉ đọc). Bản giả của test trả giá trị đặt trước, để test không chạm quyền thật của máy.
    fn mic_permission(&self) -> MicPermission {
        audio_capture::mic_permission()
    }
    /// Xin quyền micro (macOS: hộp thoại nếu chưa hỏi). Chặn tới khi người dùng trả lời: gọi từ luồng nền.
    fn request_mic_permission(&self) -> MicPermission {
        audio_capture::request_mic_permission(Duration::from_secs(120)).unwrap_or_else(|e| {
            log::warn!("không xin được quyền micro: {e:#}");
            audio_capture::mic_permission()
        })
    }
```

   Bản thật (dòng ~1120): `fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource> {
   Box::new(LiveCapture::open(plan.clone(), on_event)) }`.

3. Hằng và hàm, đặt trên `engine_config`:

```rust
/// VAD khi nguồn là micro (spec 2026-10-24-nguon-micro mục 16, lớp 4): ngưỡng xác suất, độ dài tiếng nói ngắn nhất, im lặng
/// trước khi đóng đoạn. Thay `vadEndSilenceMs` của người dùng: phụ đề chậm hơn khoảng 0,45 giây nhưng ít câu bị cắt.
const MIC_VAD_THRESHOLD: f32 = 0.5;
const MIC_MIN_SPEECH_MS: u64 = 400;
const MIC_END_SILENCE_MS: u64 = 500;

/// Thu gì trong phiên: theo cài đặt, trừ bước "Nghe thử" (luôn âm thanh máy toàn hệ thống, `options.system_source`).
pub fn plan_for(settings: &Settings, options: StartOptions) -> CapturePlan {
    if options.system_source {
        return CapturePlan::Playback {
            source: AudioSource::System,
            include_self: options.include_self,
        };
    }
    match settings.capture_mode {
        CaptureMode::Playback => CapturePlan::Playback {
            source: settings.audio_source.clone(),
            include_self: options.include_self,
        },
        CaptureMode::Mic => CapturePlan::Mic {
            device: settings.mic_device.clone(),
            noise_filter: settings.mic_noise_filter,
        },
    }
}
```

4. `engine_config(settings: &Settings, plan: &CapturePlan, mut pipeline: PipelineConfig, …)`: sau dòng
   `pipeline.segmenter.end_silence_ms = …`:

```rust
    if plan.has_mic() {
        pipeline.segmenter.threshold = MIC_VAD_THRESHOLD;
        pipeline.segmenter.min_speech_ms = MIC_MIN_SPEECH_MS;
        pipeline.segmenter.end_silence_ms = MIC_END_SILENCE_MS;
    }
```

   Sửa chú thích của hàm: thêm "nguồn micro dùng VAD riêng (spec 2026-10-24-nguon-micro mục 16)".

5. `start_with`:
   - Ngay sau `let settings = state.settings();` (trước `let mut begin`):

```rust
    let plan = plan_for(&settings, options);
    // Chế độ micro mà quyền đã bị từ chối: không nạp model, báo ngay (spec 2026-10-24-nguon-micro §7). Quyền chưa hỏi thì
    // luồng thu hỏi trước khi mở micro.
    if plan.has_mic() && session.deps.mic_permission() == MicPermission::Denied {
        return refuse(CommandError::new(errors::MIC_PERMISSION, None, "chưa được phép dùng micro"));
    }
```

   - Trong `begin`: thêm `s.mic_issue = None;` cạnh `s.waiting_for_app = false;`.
   - Thay khối `let audio_source = …; let source = session.deps.capture(&audio_source, options.include_self, …);` bằng:

```rust
    let source = session.deps.capture(&plan, capture_events(app, n));
    log::info!("phiên dịch {n}: nguồn {}", if plan.has_mic() { "micro" } else { "âm thanh máy" });
```

   - `engine_config(&settings, session.deps.pipeline_config(), …)` thành `engine_config(&settings, &plan,
     session.deps.pipeline_config(), …)`.

6. `capture_events`: thay nhánh tạm `CaptureEvent::MicSilent(_) => {}` bằng

```rust
        CaptureEvent::MicSilent(silent) => {
            let current = app.state::<Session>().sessions.load(Ordering::SeqCst) == n;
            if current {
                app.state::<AppState>()
                    .update_status(|s| s.mic_issue = silent.then_some(MicIssue::Suspected));
                changed(&app);
            }
        }
```

7. Ở chỗ dừng phiên (dòng ~530, nơi đặt `s.waiting_for_app = false;`): thêm `s.mic_issue = None;`.

8. Hàm công khai cho lệnh IPC (Task 9), cuối phần hàm công khai của `session.rs`:

```rust
/// Quyền micro lúc này, qua `SessionDeps` (bản giả trong test).
pub fn mic_permission<R: Runtime>(app: &AppHandle<R>) -> MicPermission {
    app.state::<Session>().deps.mic_permission()
}

/// Xin quyền micro, qua `SessionDeps`. Chặn tới khi người dùng trả lời hộp thoại: gọi từ luồng nền.
pub fn request_mic_permission<R: Runtime>(app: &AppHandle<R>) -> MicPermission {
    app.state::<Session>().deps.request_mic_permission()
}
```

- [ ] **Step 5: `test_support.rs`**

Trong `FakeDeps` (`#[derive(Clone, Default)]`), thêm trường:

```rust
    /// Plan của từng lần mở nguồn, theo thứ tự.
    pub capture_plans: Arc<Mutex<Vec<CapturePlan>>>,
    /// Quyền micro mà `mic_permission` trả (`None`: `Granted`; `MicPermission` không có `Default`);
    /// `request_mic_permission` cũng trả giá trị này và đếm số lần gọi.
    pub mic_permission: Arc<Mutex<Option<MicPermission>>>,
    pub mic_requests: Arc<Mutex<usize>>,
```

Thay `fn capture`:

```rust
    fn capture(&self, plan: &CapturePlan, on_event: OnEvent) -> Box<dyn FrameSource> {
        self.capture_plans.lock().unwrap().push(plan.clone());
        if let CapturePlan::Playback { source, include_self } = plan {
            self.captures.lock().unwrap().push(*include_self);
            self.capture_sources.lock().unwrap().push(source.clone());
        }
        if let Some(code) = self.capture_error {
            on_event(crate::capture::CaptureEvent::Failed {
                code,
                message: "lỗi giả".into(),
            });
        }
        self.capture_events.lock().unwrap().push(on_event);
        Box::new(FakeCapture {
            audio: self.audio,
            pos: 0,
        })
    }

    fn mic_permission(&self) -> MicPermission {
        self.mic_permission.lock().unwrap().unwrap_or(MicPermission::Granted)
    }

    fn request_mic_permission(&self) -> MicPermission {
        *self.mic_requests.lock().unwrap() += 1;
        self.mic_permission.lock().unwrap().unwrap_or(MicPermission::Granted)
    }
```

- [ ] **Step 6: Chạy toàn bộ test của app**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --locked 2>&1 | grep -E "^test result|FAILED|panicked"
```

Expected: mọi dòng `ok`, có bốn test mới.

- [ ] **Step 7: Clippy hai nền tảng rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings 2>&1 | tail -2 && sh scripts/check-windows.sh --locked 2>&1 | tail -2 && git add src-tauri/src && git commit -m "$(cat <<'EOF'
feat(session): phiên dịch theo CapturePlan, VAD riêng cho micro, quyền micro và micIssue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Bốn lệnh IPC

**Files:**
- Modify: `src-tauri/src/system.rs` (hằng URL, phương thức trait, bản thật, bản ghi lại trong test)
- Modify: `src-tauri/src/test_support.rs:136` (bản giả `FakeSystem`)
- Modify: `src-tauri/src/actions.rs` (`InputDeviceOption`, `list_input_devices`, `open_mic_settings`)
- Modify: `src-tauri/src/commands.rs` (bốn lệnh, `MAIN_COMMANDS`, `generate_handler`)
- Modify: `src-tauri/build.rs`, `src-tauri/capabilities/main.json`, `src-tauri/src/acl_tests.rs`

- [ ] **Step 1: Viết test**

Trong `system.rs`, test `the_audio_permission_page_is_a_fixed_system_settings_url` thêm:

```rust
        let url = Url::parse(MIC_PERMISSION_URL).unwrap();
        assert_eq!(url.scheme(), "x-apple.systempreferences");
        assert!(url.as_str().ends_with("?Privacy_Microphone"));
        assert!(https_only(MIC_PERMISSION_URL).is_err());
        assert!(https_only(WINDOWS_MIC_PERMISSION_URL).is_err());
```

Thêm `open_mic_settings` vào hai test `nothing_opens_until_an_opener_is_installed` (`assert!(open_mic_settings(app)
.is_err());`) và `calls_go_to_the_installed_opener` (gọi sau `open_accessibility_settings`, kỳ vọng thêm
`"open_mic_settings"` cuối danh sách), và vào `Recorder`:

```rust
        fn open_mic_settings(&self) -> Result<(), String> {
            self.push("open_mic_settings")
        }
```

Trong `acl_tests.rs`: thêm `"open_mic_settings"` vào `OPENER_COMMANDS`; danh sách kỳ vọng theo hệ điều hành thêm
`"open_mic_settings"` ở **cả hai** nhánh (cuối danh sách macOS, cuối danh sách Windows).

Trong `app_tests.rs`:

```rust
/// Spec 2026-10-24-nguon-micro §4: cửa sổ chính đọc và xin quyền micro qua `SessionDeps` (bản giả, không hỏi quyền thật).
#[test]
fn the_main_window_reads_and_requests_the_mic_permission() {
    use audio_capture::MicPermission;
    let deps = FakeDeps::default();
    let (permission, requests) = (deps.mic_permission.clone(), deps.mic_requests.clone());
    *permission.lock().unwrap() = Some(MicPermission::Undetermined);
    let app = mock_app_with(deps);
    let main = window(&app, "main");
    assert_eq!(invoke(&main, "get_mic_permission", json!({})).unwrap(), json!("undetermined"));
    *permission.lock().unwrap() = Some(MicPermission::Granted);
    assert_eq!(invoke(&main, "request_mic_permission", json!({})).unwrap(), json!("granted"));
    assert_eq!(*requests.lock().unwrap(), 1);
    let overlay = window(&app, "overlay");
    assert!(denied(&invoke(&overlay, "request_mic_permission", json!({}))));
}
```

(`denied` là hàm của `test_support.rs`.)

- [ ] **Step 2: Chạy để thấy lỗi**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --no-run 2>&1 | grep -E "^error" | head
```

- [ ] **Step 3: `system.rs`**

Sau `ACCESSIBILITY_URL`:

```rust
/// macOS: trang "Microphone" của System Settings (spec 2026-10-24-nguon-micro §3.4).
pub const MIC_PERMISSION_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
/// Windows: Settings › Privacy & security › Microphone.
pub const WINDOWS_MIC_PERMISSION_URL: &str = "ms-settings:privacy-microphone";
```

Trait thêm:

```rust
    /// Trang quyền micro: System Settings (macOS) hay Settings (Windows) (spec 2026-10-24-nguon-micro §3.4).
    fn open_mic_settings(&self) -> Result<(), String>;
```

Bản thật:

```rust
    fn open_mic_settings(&self) -> Result<(), String> {
        let url = if cfg!(target_os = "macos") {
            MIC_PERMISSION_URL
        } else {
            WINDOWS_MIC_PERMISSION_URL
        };
        self.0.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
```

Hàm công khai cạnh `open_accessibility_settings`:

```rust
pub fn open_mic_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    with(app, |s| s.open_mic_settings())
}
```

`FakeSystem` trong `test_support.rs`:

```rust
    fn open_mic_settings(&self) -> Result<(), String> {
        self.push("open_mic_settings".into())
    }
```

- [ ] **Step 4: `actions.rs`**

Sau `list_audio_sources`:

```rust
/// Một micro ở Cài đặt › Âm thanh (spec 2026-10-24-nguon-micro §4). Không gửi loại kết nối: giao diện không cần.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceOption {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

/// Các micro đang dùng được. Chỉ đọc danh sách thiết bị, không mở micro nên không hỏi quyền.
pub fn list_input_devices() -> Result<Vec<InputDeviceOption>, CommandError> {
    audio_capture::list_input_devices()
        .map(|list| {
            list.into_iter()
                .map(|d| InputDeviceOption {
                    id: d.id,
                    name: d.name,
                    is_default: d.is_default,
                })
                .collect()
        })
        .map_err(|e| CommandError::new(errors::MIC_UNAVAILABLE, None, format!("{e:#}")))
}

/// Mở trang quyền micro của hệ điều hành, qua `SystemOpener`.
pub fn open_mic_settings<R: Runtime>(app: &AppHandle<R>) -> Result<(), CommandError> {
    system::open_mic_settings(app).map_err(|e| CommandError::new(errors::OPEN_FAILED, None, e))
}

/// Tên trạng thái quyền micro cho giao diện.
pub fn mic_permission_name(p: audio_capture::MicPermission) -> &'static str {
    match p {
        audio_capture::MicPermission::Granted => "granted",
        audio_capture::MicPermission::Denied => "denied",
        audio_capture::MicPermission::Undetermined => "undetermined",
    }
}
```

- [ ] **Step 5: `commands.rs`, `build.rs`, capability**

Sau `open_audio_permission_settings` trong `commands.rs`:

```rust
/// Các micro (spec 2026-10-24-nguon-micro §4). Hỏi Core Audio hay WASAPI có thể chậm: `async`.
#[tauri::command]
pub async fn list_input_devices() -> Result<Vec<InputDeviceOption>, CommandError> {
    tauri::async_runtime::spawn_blocking(actions::list_input_devices)
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))?
}

/// Quyền micro: `granted`, `denied` hay `undetermined` (Windows không có `undetermined`).
#[tauri::command]
pub fn get_mic_permission<R: Runtime>(app: AppHandle<R>) -> &'static str {
    actions::mic_permission_name(session::mic_permission(&app))
}

/// Xin quyền micro (macOS: hộp thoại nếu chưa hỏi; Windows: trả trạng thái hiện có). Chờ người dùng trả lời: `async`.
#[tauri::command]
pub async fn request_mic_permission<R: Runtime>(app: AppHandle<R>) -> Result<&'static str, CommandError> {
    tauri::async_runtime::spawn_blocking(move || actions::mic_permission_name(session::request_mic_permission(&app)))
        .await
        .map_err(|e| CommandError::new(errors::UNKNOWN, None, e.to_string()))
}

#[tauri::command]
pub fn open_mic_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    actions::open_mic_settings(&app)
}
```

(thêm `InputDeviceOption` vào dòng `use crate::actions::…` và `session` vào `use crate::…` nếu chưa có). Thêm bốn tên
lệnh vào `MAIN_COMMANDS` (sau `"open_audio_permission_settings"`), vào `generate_handler!` (cùng chỗ), vào danh sách lệnh
của `src-tauri/build.rs` (sau `"open_audio_permission_settings"`), và vào `src-tauri/capabilities/main.json` (sau
`"allow-open-audio-permission-settings"`):

```json
    "allow-list-input-devices",
    "allow-get-mic-permission",
    "allow-request-mic-permission",
    "allow-open-mic-settings",
```

- [ ] **Step 6: Chạy test, clippy, commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --locked 2>&1 | grep -E "^test result|FAILED|panicked" && cargo clippy -p meeting-translator --all-targets --locked -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -1 && git add src-tauri && git commit -m "$(cat <<'EOF'
feat(ipc): list_input_devices, get/request_mic_permission, open_mic_settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: test xanh (kể cả test ACL so khớp capability với `MAIN_COMMANDS`).

---

### Task 10: Câu hỏi quyền micro của macOS

**Files:**
- Modify: `src-tauri/Info.plist`, `src-tauri/macos/{en,vi,ja,zh-Hans,ko}.lproj/InfoPlist.strings`
- Modify: `src-tauri/release/entitlements.plist` (chú thích)
- Modify: `src-tauri/src/app_tests.rs:1428` (test)

- [ ] **Step 1: Mở rộng test**

Trong `the_audio_permission_prompt_is_localized`, đổi thành kiểm hai khóa:

```rust
    const KEYS: [&str; 2] = ["NSAudioCaptureUsageDescription", "NSMicrophoneUsageDescription"];
    let plist = include_str!("../Info.plist");
    for key in KEYS {
        assert!(plist.contains(key), "Info.plist thiếu {key}");
    }
    assert!(plist.contains("AI Translator"), "Info.plist");
```

và trong vòng `for (name, text) in prompts`:

```rust
        for key in KEYS {
            assert!(text.contains(key), "{name} thiếu {key}");
        }
        assert!(text.contains("AI Translator"), "{name}");
```

thêm sau `assert!(prompts[1].1.contains("thu âm thanh máy đang phát"));`:

```rust
    assert!(prompts[1].1.contains("nghe micro khi bạn chọn nguồn micro"));
```

Đổi tên test thành `the_audio_and_mic_permission_prompts_are_localized` và sửa chú thích: "câu hỏi quyền ghi âm thanh hệ
thống và quyền micro (spec 2026-10-24-nguon-micro §3.4)…".

- [ ] **Step 2: Chạy để thấy test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib permission_prompts 2>&1 | grep -E "panicked|test result"
```

Expected: `Info.plist thiếu NSMicrophoneUsageDescription`.

- [ ] **Step 3: Thêm câu hỏi**

`Info.plist`, sau cặp `NSAudioCaptureUsageDescription`:

```xml
  <key>NSMicrophoneUsageDescription</key>
  <string>AI Translator listens to the microphone when you choose a microphone source, to show translated subtitles of people speaking near you. The audio never leaves your Mac.</string>
```

Thêm vào cuối mỗi `InfoPlist.strings`:

- `en.lproj`:
```
/* Câu hỏi quyền Micro của macOS (NSMicrophoneUsageDescription), tiếng Anh. */
"NSMicrophoneUsageDescription" = "AI Translator listens to the microphone when you choose a microphone source, to show translated subtitles of people speaking near you. The audio never leaves your Mac.";
```
- `vi.lproj`:
```
/* Câu hỏi quyền Micro của macOS (NSMicrophoneUsageDescription), tiếng Việt. */
"NSMicrophoneUsageDescription" = "AI Translator nghe micro khi bạn chọn nguồn micro, để hiện phụ đề dịch lời người nói gần bạn. Âm thanh không rời khỏi máy.";
```
- `ja.lproj`:
```
/* Câu hỏi quyền Micro của macOS (NSMicrophoneUsageDescription), tiếng Nhật. */
"NSMicrophoneUsageDescription" = "AI Translator は、マイクを入力元に選んだときにマイクの音声を取得し、近くで話す人の翻訳字幕を表示します。音声が Mac の外に送信されることはありません。";
```
- `zh-Hans.lproj`:
```
/* Câu hỏi quyền Micro của macOS (NSMicrophoneUsageDescription), tiếng Trung giản thể. */
"NSMicrophoneUsageDescription" = "当你选择麦克风作为来源时，AI Translator 会采集麦克风音频，用于显示你身边说话人的翻译字幕。音频不会离开你的 Mac。";
```
- `ko.lproj`:
```
/* Câu hỏi quyền Micro của macOS (NSMicrophoneUsageDescription), tiếng Hàn. */
"NSMicrophoneUsageDescription" = "AI Translator는 마이크를 입력으로 선택한 경우 주변에서 말하는 사람의 번역 자막을 표시하기 위해 마이크 오디오를 수집합니다. 오디오는 Mac 밖으로 전송되지 않습니다.";
```

`src-tauri/release/entitlements.plist`: sửa câu "App không mở micro; quyền "Ghi âm thanh hệ thống" vẫn do macOS hỏi theo
NSAudioCaptureUsageDescription." thành "Entitlement này cũng cho phép mở micro khi người dùng chọn nguồn micro (spec
2026-10-24-nguon-micro); quyền "Ghi âm thanh hệ thống" và quyền Micro vẫn do macOS hỏi theo
NSAudioCaptureUsageDescription và NSMicrophoneUsageDescription." Không đổi entitlement.

- [ ] **Step 4: Chạy test rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test -p meeting-translator --lib permission_prompts 2>&1 | grep "test result" && plutil -lint src-tauri/Info.plist && for l in en vi ja zh-Hans ko; do plutil -lint src-tauri/macos/$l.lproj/InfoPlist.strings; done && git add src-tauri && git commit -m "$(cat <<'EOF'
feat(macos): câu hỏi quyền Micro năm ngôn ngữ (NSMicrophoneUsageDescription)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Expected: test `ok`, `plutil` in `OK` cho cả sáu file.

---

### Task 11: Kiểu và store ở frontend

**Files:**
- Modify: `src/lib/ipc.ts` (`Settings`, `AppStatus`, kiểu mới, bảng lệnh dòng ~495)
- Modify: `src/store/app.ts` (trạng thái, hành động)
- Modify: `src/store/app.test.ts`, `scripts/ui-preview/tauri-mock.ts`, `src/lib/subtitleView.test.ts`,
  `src/store/overlay.test.ts`, `src/store/transcript.test.ts` (fixture)

- [ ] **Step 1: `ipc.ts`**

Sau `export type AudioSource = …`:

```ts
// Thu gì (`settings::CaptureMode`, spec 2026-10-24-nguon-micro §3.1).
export type CaptureMode = "playback" | "mic";

// Một micro ở Cài đặt › Âm thanh (`actions::InputDeviceOption`).
export type InputDevice = { id: string; name: string; isDefault: boolean };

// Quyền micro (`get_mic_permission`); Windows không có "undetermined".
export type MicPermission = "granted" | "denied" | "undetermined";

// Vấn đề của micro trong phiên đang chạy (`state::MicIssue`).
export type MicIssue = "suspected";
```

Trong `Settings`, sau `audioSource: AudioSource;`:

```ts
  captureMode: CaptureMode;
  micDevice: string | null;
  micNoiseFilter: boolean;
```

Trong `AppStatus`, sau `waitingForApp: boolean;`:

```ts
  micIssue: MicIssue | null;
```

Bảng lệnh, sau `open_audio_permission_settings`:

```ts
  list_input_devices: { args: undefined; result: InputDevice[] };
  get_mic_permission: { args: undefined; result: MicPermission };
  request_mic_permission: { args: undefined; result: MicPermission };
  open_mic_settings: { args: undefined; result: null };
```

- [ ] **Step 2: Sửa fixture để `tsc` qua**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec tsc --noEmit 2>&1 | head -20
```

Mỗi fixture `AppStatus` báo thiếu `micIssue` (`src/store/app.test.ts:54`, `src/lib/subtitleView.test.ts:39`,
`src/store/overlay.test.ts:134`, `src/store/transcript.test.ts:28`, `scripts/ui-preview/tauri-mock.ts:133`): thêm
`micIssue: null,` ngay sau `waitingForApp`. Mỗi fixture `Settings` báo thiếu khóa: thêm
`captureMode: "playback", micDevice: null, micNoiseFilter: true,` ngay sau `audioSource`.

- [ ] **Step 3: Viết test cho store**

Thêm vào `src/store/app.test.ts` (theo mẫu của test `loadAudioSources` hiện có ở dòng ~300; bảng lệnh giả ở dòng ~109
thêm bốn lệnh):

```ts
// trong bảng lệnh giả mặc định:
    list_input_devices: () => [{ id: "BuiltIn", name: "MacBook Pro Microphone", isDefault: true }],
    get_mic_permission: () => "undetermined",
    request_mic_permission: () => "granted",
    open_mic_settings: () => null,
```

```ts
  it("đọc danh sách micro và quyền micro, xin quyền thì cập nhật trạng thái", async () => {
    const { store } = setup();
    await store.getState().loadInputDevices();
    expect(store.getState().inputDevices).toEqual([{ id: "BuiltIn", name: "MacBook Pro Microphone", isDefault: true }]);
    await store.getState().loadMicPermission();
    expect(store.getState().micPermission).toBe("undetermined");
    await store.getState().requestMicPermission();
    expect(store.getState().micPermission).toBe("granted");
  });
```

(`setup()` ở dòng ~81 của file dựng IPC giả từ bảng lệnh mặc định và trả `{ fake, store }`.)

- [ ] **Step 4: Chạy để thấy test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/store/app.test.ts 2>&1 | tail -8
```

Expected: `loadInputDevices is not a function`.

- [ ] **Step 5: Store**

Trong `src/store/app.ts`, kiểu trạng thái (cạnh `audioSources: AudioSourceOption[] | null;`):

```ts
  inputDevices: InputDevice[] | null;
  micPermission: MicPermission | null;
  loadInputDevices(): Promise<void>;
  loadMicPermission(): Promise<void>;
  requestMicPermission(): Promise<void>;
  openMicSettings(): Promise<void>;
```

Giá trị ban đầu (cạnh `audioSources: null,`): `inputDevices: null, micPermission: null,`. Hành động (sau
`loadAudioSources`):

```ts
      async loadInputDevices() {
        await run(
          () => ipc.invoke("list_input_devices"),
          (inputDevices) => set({ inputDevices }),
        );
      },

      async loadMicPermission() {
        try {
          set({ micPermission: await ipc.invoke("get_mic_permission") });
        } catch {
          // Giữ trạng thái cũ; Cài đặt › Âm thanh vẫn có nút mở trang quyền micro.
        }
      },

      // Hỏi quyền micro (spec 2026-10-24-nguon-micro §3.4): lúc chọn chế độ có micro, khi quyền chưa hỏi.
      async requestMicPermission() {
        await run(
          () => ipc.invoke("request_mic_permission"),
          (micPermission) => set({ micPermission }),
        );
      },

      async openMicSettings() {
        await run(
          () => ipc.invoke("open_mic_settings"),
          () => {},
        );
      },
```

(thêm `InputDevice`, `MicPermission` vào dòng import kiểu từ `../lib/ipc`). Trong `scripts/ui-preview/tauri-mock.ts`,
cạnh `list_audio_sources`:

```ts
  list_input_devices: () => [
    { id: "BuiltInMicrophoneDevice", name: platform === "macos" ? "MacBook Pro Microphone" : "Microphone Array", isDefault: true },
    { id: "usb-1", name: "Jabra Speak 510", isDefault: false },
  ],
  get_mic_permission: () => "granted",
  request_mic_permission: () => "granted",
  open_mic_settings: () => null,
```

- [ ] **Step 6: Chạy test JS rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm test 2>&1 | tail -4 && pnpm exec tsc --noEmit && git add src scripts/ui-preview && git commit -m "$(cat <<'EOF'
feat(ui): kiểu và store cho nguồn micro (danh sách micro, quyền micro, micIssue)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Cài đặt › Âm thanh

**Files:**
- Modify: `src/windows/main/settings/AudioSettings.tsx`
- Modify: `src/lib/audioSource.ts` (hàm nhãn micro)
- Create hoặc Modify: `src/lib/audioSource.test.ts` (nếu chưa có thì tạo)

- [ ] **Step 1: Viết test cho nhãn micro**

Thêm vào test của `audioSource.ts`:

```ts
import { describe, expect, it } from "vitest";
import { micLabel } from "./audioSource";

const t = (key: string, params?: Record<string, string>) => `${key}${params ? JSON.stringify(params) : ""}`;
const devices = [
  { id: "a", name: "MacBook Pro Microphone", isDefault: true },
  { id: "b", name: "Jabra", isDefault: false },
];

describe("micLabel", () => {
  it("micro mặc định: tên micro mặc định lúc này nếu biết", () => {
    expect(micLabel(null, devices, t)).toBe('home.audioSource.mic{"name":"MacBook Pro Microphone"}');
    expect(micLabel(null, null, t)).toBe('home.audioSource.mic{"name":"settings.audio.mic.default"}');
  });
  it("micro đã chọn: tên của nó, không thì id", () => {
    expect(micLabel("b", devices, t)).toBe('home.audioSource.mic{"name":"Jabra"}');
    expect(micLabel("gone", devices, t)).toBe('home.audioSource.mic{"name":"gone"}');
  });
});
```

(kiểu của `t` trong test phải khớp chữ ký `(key: MessageKey, params?) => string`: ép kiểu `t as never` khi gọi nếu
`tsc` phàn nàn, như các test khác của `audioSource` nếu có).

- [ ] **Step 2: Chạy để thấy test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/lib/audioSource 2>&1 | tail -5
```

- [ ] **Step 3: `micLabel` trong `audioSource.ts`**

```ts
// Nhãn của nguồn micro ở màn hình chính (spec 2026-10-24-nguon-micro §3.3): "Micro: {tên}". Micro mặc định: tên của micro
// mặc định lúc này nếu danh sách đã đọc; micro đã chọn mà không còn trong danh sách thì hiện id.
export function micLabel(
  micDevice: string | null,
  devices: readonly InputDevice[] | null,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  const found = devices?.find((d) => (micDevice === null ? d.isDefault : d.id === micDevice));
  const name = found?.name ?? micDevice ?? t("settings.audio.mic.default");
  return t("home.audioSource.mic", { name });
}
```

(thêm `InputDevice` vào dòng import kiểu).

- [ ] **Step 4: `AudioSettings.tsx`**

Viết lại component:

```tsx
import { useEffect, useState } from "react";
import { sourceChoices, sourceFromKey, sourceKey, sourceLabel } from "../../../lib/audioSource";
import type { CaptureMode } from "../../../lib/ipc";
import { Field } from "../../../components/Field";
import { Icon } from "../../../components/Icon";
import { appStore, useApp, useT } from "../appStore";

// Giá trị của bộ chọn micro cho micro mặc định (`micDevice: null`).
const DEFAULT_MIC = "";

// Nhóm Cài đặt "Âm thanh" (§4.3): chế độ thu (spec 2026-10-24-nguon-micro §3.2), nguồn âm thanh máy (§6.1) hay micro,
// lọc ồn micro, quyền micro, và độ nhạy ngắt câu (50–800 ms, §6.3).
export function AudioSettings() {
  const t = useT();
  const settings = useApp((s) => s.settings);
  const info = useApp((s) => s.info);
  const options = useApp((s) => s.audioSources);
  const load = useApp((s) => s.loadAudioSources);
  const devices = useApp((s) => s.inputDevices);
  const loadDevices = useApp((s) => s.loadInputDevices);
  const permission = useApp((s) => s.micPermission);
  const loadPermission = useApp((s) => s.loadMicPermission);
  const requestPermission = useApp((s) => s.requestMicPermission);
  const openMicSettings = useApp((s) => s.openMicSettings);
  const update = useApp((s) => s.updateSettings);
  const [pause, setPause] = useState<number | null>(null);
  const mic = settings?.captureMode === "mic";
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!mic) return;
    void loadDevices();
    void loadPermission();
  }, [mic, loadDevices, loadPermission]);
  if (!settings || !info) return null;
  const pauseMs = pause ?? settings.vadEndSilenceMs;
  const commitPause = () => {
    if (pause !== null && pause !== settings.vadEndSilenceMs) void update({ vadEndSilenceMs: pause });
    setPause(null);
  };
  // Chọn chế độ có micro: hỏi quyền ngay nếu chưa hỏi (spec §3.4), không đợi tới lúc bắt đầu phiên.
  const chooseMode = async (captureMode: CaptureMode) => {
    if (!(await update({ captureMode })) || captureMode !== "mic") return;
    await loadPermission();
    if (appStore.getState().micPermission === "undetermined") await requestPermission();
  };
  const micKnown = devices?.some((d) => d.id === settings.micDevice) ?? false;
  return (
    <div className="card list">
      <Field label={t("settings.audio.mode")} htmlFor="capture-mode" hint={t("settings.audio.mode.hint")} wide>
        <select
          id="capture-mode"
          value={settings.captureMode}
          onChange={(e) => void chooseMode(e.target.value as CaptureMode)}
        >
          <option value="playback">{t("settings.audio.mode.playback")}</option>
          <option value="mic">{t("settings.audio.mode.mic")}</option>
        </select>
      </Field>
      {!mic && (
        <Field
          label={t("settings.audio.source")}
          htmlFor="audio-source"
          hint={t(info.platform === "macos" ? "settings.audio.hint.macos" : "settings.audio.hint.windows")}
          wide
        >
          <select
            id="audio-source"
            value={sourceKey(settings.audioSource)}
            onChange={(e) => void update({ audioSource: sourceFromKey(e.target.value) })}
          >
            {sourceChoices(settings.audioSource, options).map((o) => (
              <option key={sourceKey(o)} value={sourceKey(o)}>
                {sourceLabel(o, info.platform, options, t)}
              </option>
            ))}
          </select>
          <button onClick={() => void load()}>
            <Icon name="refresh" size={16} />
            {t("settings.audio.refresh")}
          </button>
        </Field>
      )}
      {mic && (
        <>
          <Field label={t("settings.audio.mic")} htmlFor="mic-device" hint={t("settings.audio.mic.hint")} wide>
            <select
              id="mic-device"
              value={settings.micDevice ?? DEFAULT_MIC}
              onChange={(e) => void update({ micDevice: e.target.value === DEFAULT_MIC ? null : e.target.value })}
            >
              <option value={DEFAULT_MIC}>{t("settings.audio.mic.default")}</option>
              {(devices ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
              {settings.micDevice !== null && !micKnown && (
                <option value={settings.micDevice}>{settings.micDevice}</option>
              )}
            </select>
            <button onClick={() => void loadDevices()}>
              <Icon name="refresh" size={16} />
              {t("settings.audio.refresh")}
            </button>
          </Field>
          {(permission === "denied" || permission === "undetermined") && (
            <p className="note error" role="status">
              <Icon name="alert" size={16} />
              <span>
                {t(permission === "denied" ? "settings.audio.micPermission.denied" : "settings.audio.micPermission.undetermined")}
              </span>
              {permission === "denied" ? (
                <button onClick={() => void openMicSettings()}>{t("common.openMicSettings")}</button>
              ) : (
                <button onClick={() => void requestPermission()}>{t("settings.audio.micPermission.allow")}</button>
              )}
            </p>
          )}
          <Field label={t("settings.audio.noiseFilter")} htmlFor="mic-noise-filter" hint={t("settings.audio.noiseFilter.hint")}>
            <input
              id="mic-noise-filter"
              className="switch"
              type="checkbox"
              checked={settings.micNoiseFilter}
              onChange={(e) => void update({ micNoiseFilter: e.target.checked })}
            />
          </Field>
        </>
      )}
      <Field
        label={t("settings.audio.pause")}
        htmlFor="vad-end-silence"
        hint={t(mic ? "settings.audio.pause.micNote" : "settings.audio.pause.hint")}
        wide
      >
        <span className="range">
          <input
            id="vad-end-silence"
            type="range"
            min={50}
            max={800}
            step={50}
            value={pauseMs}
            disabled={mic}
            onChange={(e) => setPause(Number(e.target.value))}
            onPointerUp={commitPause}
            onKeyUp={commitPause}
            onBlur={commitPause}
          />
          <span className="value">{pauseMs} ms</span>
        </span>
      </Field>
    </div>
  );
}
```

Đã kiểm khi viết kế hoạch:
- `updateSettings` trả `Promise<boolean>` (`src/store/app.ts:82`).
- `appStore` là store Zustand mà `useApp` đọc (`src/windows/main/appStore.ts`), có `getState()`.
- Lớp CSS `note error` và component `Icon name="alert"` đã dùng ở `Home.tsx`.

Nếu `MessageKey` không nhận chuỗi ghép từ biểu thức điều kiện, tách thành hai lời gọi `t(...)` trong hai nhánh.

- [ ] **Step 5: Chạy test, tsc rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm test 2>&1 | tail -4 && pnpm exec tsc --noEmit 2>&1 | head
```

Expected: Vitest xanh. `tsc` có thể báo thiếu khóa i18n (`settings.audio.mode` …): làm Task 13 rồi chạy lại, commit chung
với Task 13.

---

### Task 13: Chuỗi năm ngôn ngữ

**Files:**
- Modify: `src/i18n/en.ts`, `vi.ts`, `ja.ts`, `zh.ts`, `ko.ts`

Thêm các khóa sau vào cả năm file, đặt cạnh nhóm khóa cùng tiền tố (`settings.audio.*` cạnh `settings.audio.pause.hint`,
`home.*` cạnh `home.waitingForApp`, `overlay.note.micSilent` cạnh `overlay.note.waitingForApp`, `error.*` cạnh
`error.audioPermission`, `common.openMicSettings` cạnh `common.openPermissionSettings`). `en.ts` đã có hai khóa `error.*`
từ Task 7.

| Khóa | vi | en | ja | zh | ko |
|---|---|---|---|---|---|
| `settings.audio.mode` | Thu từ | Capture from | 入力元 | 采集来源 | 입력 소스 |
| `settings.audio.mode.playback` | Âm thanh máy | Computer audio | コンピューターの音声 | 电脑音频 | 컴퓨터 오디오 |
| `settings.audio.mode.mic` | Micro | Microphone | マイク | 麦克风 | 마이크 |
| `settings.audio.mode.hint` | Âm thanh máy: họp online, video. Micro: người nói trong phòng (họp tại chỗ, nghe giảng). Đổi có tác dụng từ phiên dịch sau. | Computer audio: online meetings, videos. Microphone: people speaking in the room (in-person meetings, lectures). Changes apply from the next session. | コンピューターの音声：オンライン会議や動画。マイク：その場で話す人（対面の会議、講義）。変更は次の翻訳セッションから反映されます。 | 电脑音频：线上会议、视频。麦克风：房间里说话的人（线下会议、讲座）。更改从下一次翻译会话起生效。 | 컴퓨터 오디오: 온라인 회의, 동영상. 마이크: 같은 공간에서 말하는 사람(대면 회의, 강의). 변경 사항은 다음 번역 세션부터 적용됩니다. |
| `settings.audio.mic` | Micro | Microphone | マイク | 麦克风 | 마이크 |
| `settings.audio.mic.default` | Micro mặc định của hệ thống | System default microphone | システムの既定のマイク | 系统默认麦克风 | 시스템 기본 마이크 |
| `settings.audio.mic.hint` | Micro của laptop nghe rõ nhất người nói gần (khoảng 1 m) trong phòng yên tĩnh; phòng lớn nên dùng micro rời. Dùng micro của tai nghe Bluetooth làm tai nghe chuyển sang chế độ gọi: tiếng nghe kém đi. | A laptop microphone works best for people speaking nearby (about 1 m) in a quiet room; use an external microphone for larger rooms. Using a Bluetooth headset's microphone switches the headset to call mode, which lowers audio quality. | ノートパソコンのマイクは、静かな部屋で近く（約 1 m）で話す人の声に最適です。広い部屋では外付けマイクをお使いください。Bluetooth ヘッドセットのマイクを使うと、ヘッドセットが通話モードに切り替わり音質が下がります。 | 笔记本电脑的麦克风最适合安静房间里近距离（约 1 米）说话的人；大房间请使用外接麦克风。使用蓝牙耳机的麦克风会让耳机切换到通话模式，音质会变差。 | 노트북 마이크는 조용한 방에서 가까이(약 1m) 말하는 사람에게 가장 적합합니다. 넓은 방에서는 외장 마이크를 사용하세요. 블루투스 헤드셋의 마이크를 사용하면 헤드셋이 통화 모드로 전환되어 음질이 떨어집니다. |
| `settings.audio.noiseFilter` | Lọc tiếng ồn micro | Filter microphone noise | マイクのノイズを除去 | 过滤麦克风噪音 | 마이크 잡음 필터 |
| `settings.audio.noiseFilter.hint` | Bỏ qua tiếng gõ phím, tiếng bút, tiếng gõ bàn. Một số câu rất ngắn như "OK" có thể bị bỏ qua khi phòng ồn; tắt nếu phòng yên tĩnh mà câu ngắn hay bị mất. | Ignores typing, pen clicks and desk taps. Some very short phrases like "OK" may be missed in a noisy room; turn this off if the room is quiet and short phrases keep getting lost. | キーボードの打鍵音、ペンの音、机をたたく音を無視します。騒がしい部屋では「OK」のようなごく短い言葉が拾われないことがあります。静かな部屋で短い言葉がよく抜ける場合はオフにしてください。 | 忽略打字声、按笔声和敲桌声。在嘈杂的房间里，像"OK"这样很短的话可能会被忽略；如果房间安静但短句经常丢失，请关闭此项。 | 키보드 타자 소리, 펜 딸깍 소리, 책상 두드리는 소리를 무시합니다. 시끄러운 방에서는 "OK" 같은 아주 짧은 말이 누락될 수 있습니다. 조용한 방인데 짧은 말이 자주 빠지면 이 옵션을 끄세요. |
| `settings.audio.micPermission.denied` | AI Translator chưa được phép dùng micro. | AI Translator is not allowed to use the microphone. | AI Translator にマイクの使用が許可されていません。 | AI Translator 未获准使用麦克风。 | AI Translator에 마이크 사용 권한이 없습니다. |
| `settings.audio.micPermission.undetermined` | AI Translator cần quyền dùng micro. | AI Translator needs permission to use the microphone. | AI Translator にはマイクの使用許可が必要です。 | AI Translator 需要使用麦克风的权限。 | AI Translator에 마이크 사용 권한이 필요합니다. |
| `settings.audio.micPermission.allow` | Cho phép dùng micro | Allow microphone | マイクを許可 | 允许使用麦克风 | 마이크 허용 |
| `settings.audio.pause.micNote` | Khi thu từ micro, app dùng mức ngắt câu riêng cho micro (500 ms) để ít câu bị cắt. | When capturing from the microphone, the app uses its own pause setting for the microphone (500 ms) so fewer sentences are cut off. | マイクから取得するときは、文が途中で切れにくいよう、マイク専用の区切り設定（500 ms）を使います。 | 从麦克风采集时，应用会使用麦克风专用的断句设置（500 毫秒），减少句子被截断。 | 마이크에서 가져올 때는 문장이 덜 끊기도록 마이크 전용 끊기 설정(500ms)을 사용합니다. |
| `home.audioSource.mic` | Micro: {name} | Microphone: {name} | マイク：{name} | 麦克风：{name} | 마이크: {name} |
| `home.micSilent` | Micro không có tín hiệu: kiểm tra quyền micro hoặc phím tắt tiếng của micro. | The microphone has no signal: check the microphone permission or the microphone's mute key. | マイクの信号がありません。マイクの許可、またはマイクのミュートキーを確認してください。 | 麦克风没有信号：请检查麦克风权限或麦克风的静音键。 | 마이크 신호가 없습니다. 마이크 권한이나 마이크 음소거 키를 확인하세요. |
| `overlay.note.micSilent` | Micro không có tín hiệu | Microphone has no signal | マイクの信号なし | 麦克风没有信号 | 마이크 신호 없음 |
| `error.micPermission` | AI Translator chưa được phép dùng micro. | (Task 7) | AI Translator にマイクの使用が許可されていません。 | AI Translator 未获准使用麦克风。 | AI Translator에 마이크 사용 권한이 없습니다. |
| `error.micUnavailable` | Không mở được micro. Kiểm tra micro đã chọn còn cắm và không bị app khác giữ riêng. | (Task 7) | マイクを開けませんでした。選択したマイクが接続されていて、ほかのアプリに占有されていないか確認してください。 | 无法打开麦克风。请检查所选麦克风是否已连接，且未被其他应用独占。 | 마이크를 열 수 없습니다. 선택한 마이크가 연결되어 있고 다른 앱이 독점하고 있지 않은지 확인하세요. |
| `common.openMicSettings` | Mở cài đặt quyền micro | Open microphone settings | マイクの設定を開く | 打开麦克风设置 | 마이크 설정 열기 |

Ngoặc kép bên trong chuỗi dùng ngoặc cong như các chuỗi hiện có (`“OK”`, xem `settings.compose.permission.missing`);
tiếng Trung dùng `“OK”`, tiếng Nhật dùng `「OK」`.

- [ ] **Step 1: Thêm khóa vào năm file**

- [ ] **Step 2: Chạy test i18n, tsc và toàn bộ test JS**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/i18n 2>&1 | tail -4 && pnpm exec tsc --noEmit && pnpm test 2>&1 | tail -4
```

Expected: `dictionaries.test.ts` và `i18n.test.ts` xanh (năm bộ khóa giống nhau), `tsc` không lỗi.

- [ ] **Step 3: Commit (gộp Task 12)**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && git add src && git commit -m "$(cat <<'EOF'
feat(ui): Cài đặt › Âm thanh chọn Âm thanh máy hay Micro, micro, lọc ồn, quyền micro

Năm ngôn ngữ giao diện.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Màn hình chính và thanh phụ đề

**Files:**
- Modify: `src/windows/main/screens/Home.tsx:40-72,121-127`
- Modify: `src/lib/subtitleView.ts:97-130`, `src/lib/subtitleView.test.ts`

- [ ] **Step 1: Viết test cho ghi chú thanh phụ đề**

Trong `src/lib/subtitleView.test.ts`, theo mẫu test `waitingForApp` hiện có:

```ts
  it("micro không có tín hiệu thì có ghi chú micSilent khi phiên đang chạy", () => {
    expect(overlayNotes({ ...status, session: "running", micIssue: "suspected" })).toContain("micSilent");
    expect(overlayNotes({ ...status, session: "idle", micIssue: "suspected" })).not.toContain("micSilent");
  });
```

(`status` là fixture `AppStatus` của file; đặt tên đúng như file đang dùng).

- [ ] **Step 2: Chạy để thấy test hỏng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm exec vitest run src/lib/subtitleView 2>&1 | tail -5
```

- [ ] **Step 3: `subtitleView.ts`**

Thêm `| "micSilent"` vào `OverlayNote`, ngay sau `| "waitingForApp"`. Trong `overlayNotes`, sau dòng `waitingForApp`:

```ts
    if (status.micIssue === "suspected") notes.push("micSilent");
```

- [ ] **Step 4: `Home.tsx`**

1. Thêm selector và nạp tên micro:

```tsx
  const inputDevices = useApp((s) => s.inputDevices);
  const loadInputDevices = useApp((s) => s.loadInputDevices);
  const openMicSettings = useApp((s) => s.openMicSettings);
```

   Sau `useEffect` của `needsNames`:

```tsx
  // Chế độ micro: tên micro nằm trong danh sách micro; đọc một lần khi chưa có.
  const needsMicNames = settings?.captureMode === "mic" && inputDevices === null;
  useEffect(() => {
    if (needsMicNames) void loadInputDevices();
  }, [needsMicNames, loadInputDevices]);
```

   `needsNames` chỉ đúng ở chế độ âm thanh máy: thêm `settings.captureMode === "playback" &&` vào biểu thức.

2. Nhãn nguồn:

```tsx
  const source =
    settings.captureMode === "mic"
      ? micLabel(settings.micDevice, inputDevices, t)
      : sourceLabel(settings.audioSource, info.platform, audioSources, t);
```

   (import `micLabel` từ `../../../lib/audioSource`).

3. Ghi chú, sau `if (status.waitingForApp) notes.push("home.waitingForApp");`:

```tsx
    if (status.micIssue === "suspected") notes.push("home.micSilent");
```

4. Lỗi phiên `micPermission`: trong khối `hero-alert` của lỗi, sau nút cho `audioPermission`:

```tsx
            {status.sessionError === "micPermission" && (
              <button onClick={() => void openMicSettings()}>{t("common.openMicSettings")}</button>
            )}
```

5. Micro không có tín hiệu cũng cần nút mở trang quyền: sau khối `permissionSuspected`:

```tsx
        {session === "running" && status.micIssue === "suspected" && (
          <div className="hero-alert" role="alert">
            <Icon name="alert" />
            <span>{t("home.micSilent")}</span>
            <button onClick={() => void openMicSettings()}>{t("common.openMicSettings")}</button>
          </div>
        )}
```

   Có khối này thì bỏ dòng `notes.push("home.micSilent")` ở bước 3, để câu không hiện hai lần.

- [ ] **Step 5: Chạy test, tsc rồi commit**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm test 2>&1 | tail -4 && pnpm exec tsc --noEmit && git add src && git commit -m "$(cat <<'EOF'
feat(ui): màn hình chính và thanh phụ đề cho nguồn micro (nhãn, micro không có tín hiệu, lỗi quyền)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: Kiểm toàn bộ và ảnh giao diện

**Files:** không đổi (trừ khi có lỗi phải sửa).

- [ ] **Step 1: Toàn bộ test Rust, clippy hai nền tảng**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && cargo test --workspace --locked 2>&1 | grep -E "^test result|FAILED|panicked" | sort | uniq -c && cargo clippy --workspace --all-targets --locked -- -D warnings 2>&1 | tail -1 && sh scripts/check-windows.sh --locked 2>&1 | tail -1
```

Expected: không có `FAILED`; tổng số test lớn hơn mốc Task 0; hai lần clippy `Finished`, không warning.

- [ ] **Step 2: JS, build**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && pnpm test 2>&1 | tail -4 && pnpm build 2>&1 | tail -3
```

- [ ] **Step 3: `asr-worker` vẫn build được cho macOS 14** (Task 4 đổi `audio-capture`, không đụng `asr-worker`, nhưng
  workspace dùng chung `Cargo.lock`)

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode 2>&1 | tail -1
```

- [ ] **Step 4: `check-i18n` năm ngôn ngữ**

```bash
cd /Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro && (node_modules/.bin/vite --config scripts/ui-preview/vite.config.ts --port 1431 > /dev/null 2>&1 &) && sleep 3 && node scripts/ui-preview/check-i18n.mjs vi en ja zh ko 2>&1 | tail -15
```

Expected: không có dòng lỗi mới so với lần chạy trên `main` (chạy cùng lệnh ở thư mục chính trước nếu có lỗi, để biết lỗi
có sẵn). Tắt Vite cổng 1431 khi xong (`lsof -ti tcp:1431 | xargs kill`).

- [ ] **Step 5: Ảnh giao diện bằng `scripts/ui-preview`**

Xem phần đầu `scripts/ui-preview/shoot.mjs` để chạy bản xem trước (IPC giả, cổng 1430). Chụp:
1. Cài đặt › Âm thanh, chế độ Âm thanh máy (không đổi so với trước).
2. Cài đặt › Âm thanh, chế độ Micro (bộ chọn micro, công tắc lọc ồn, ghi chú thanh trượt bị khóa).
3. Như 2 với `get_mic_permission` giả trả `"denied"` (dòng báo kèm nút).
4. Màn hình chính chế độ Micro, đang chạy, `micIssue: "suspected"`.
5. Thanh phụ đề với ghi chú `micSilent`.

Chụp ở tiếng Việt và tiếng Anh, sáng và tối cho ảnh 2. Xem từng ảnh: chữ không tràn, nút thẳng hàng. Tắt Vite (cổng
1430) khi xong.

- [ ] **Step 6: Commit nếu có sửa**

---

### Task 16: Windows (Task 17 của kế hoạch 01 cộng chế độ micro)

**Cần chủ dự án.** Hỏi trước cách lấy binary Windows, đưa ba lựa chọn:
1. Chủ dự án build trên máy Windows (`pnpm tauri build` theo `docs/release/phat-hanh.md`, phần Windows).
2. Build chéo trên Mac bằng `cargo-xwin` (phải đồng ý điều khoản của Microsoft cho bộ SDK tải về).
3. Đẩy nhánh `nguon-micro` để CI build (cần chủ dự án cho phép push).

- [ ] **Step 1: Quyền micro (S-M4 Windows)**
  - `mic-probe status` lúc công tắc "Let desktop apps access your microphone" bật và tắt: in `Granted` / `Denied`.
  - `mic-probe listen --seconds 5` lúc công tắc tắt: ghi nguyên văn lỗi (kỳ vọng HRESULT `0x80070005`), hay toàn số 0.
    Nếu là toàn số 0 mà không lỗi, `ZeroWatch` vẫn báo `micSilent`; ghi vào `results/s-m4-windows.md`.
- [ ] **Step 2: Mức micro và CPU**
  - `mic-probe listen` ở 1 m với giọng thật: ghi RMS (so với −38 dBFS của Mac để biết +20 dB có hợp không).
  - Chạy app chế độ Micro 5 phút trên máy i5: ghi CPU của tiến trình app trong Task Manager (RNNoise kỳ vọng dưới 1%
    một nhân).
- [ ] **Step 3: Chế độ Micro trong app**: các bước 1–6 của Task 17 dưới đây, trên Windows.
- [ ] **Step 4: Ghi kết quả** vào `bench/2026-10-24-nguon-micro/results/windows.md` và commit.

---

### Task 17: Thử tay chế độ micro trên Mac

**Cần chủ dự án** (mở micro trên máy của chủ dự án; hỏi trước khi bắt đầu). Chạy bản dev đã ký
(`scripts/run-dev-signed.sh`) để quyền micro được tính cho app, không cho Terminal.

- [ ] **Step 1:** Cài đặt › Âm thanh → chọn Micro: macOS hiện hộp thoại quyền Micro với câu đúng ngôn ngữ giao diện.
  Chọn "Allow".
- [ ] **Step 2:** Bắt đầu phiên, nói tiếng Việt ở khoảng 1 m: phụ đề hiện, nhãn màn hình chính "Micro: MacBook Pro
  Microphone". Gõ phím, bấm bút trong 1 phút: không có câu ảo.
- [ ] **Step 3:** Tắt "Lọc tiếng ồn micro", bắt đầu lại, nói vài câu ngắn ("OK", "Đúng rồi"): vẫn có phụ đề.
- [ ] **Step 4:** Rút hay đổi micro mặc định trong lúc chạy (nếu có tai nghe có micro): app mở lại micro trong ≤ 2 giây.
- [ ] **Step 5:** System Settings › Privacy & Security › Microphone → tắt AI Translator: Cài đặt › Âm thanh hiện dòng
  "chưa được phép" kèm nút mở đúng trang; bấm Bắt đầu thì báo lỗi `micPermission` ngay, không nạp model. Bật lại quyền.
- [ ] **Step 6:** Bước "Nghe thử" (hay phiên ở chế độ Âm thanh máy) vẫn chạy như cũ.
- [ ] **Step 7:** Log của phiên có dòng "đang thu micro: … kết nối builtin …", **không** có tên micro.
- [ ] **Step 8:** Ghi kết quả vào `bench/2026-10-24-nguon-micro/results/thu-tay-mac.md`, commit, cập nhật memory.

---

## Tự rà kế hoạch

- **Spec mục 16:** khuếch đại +20 dB (Task 4), RNNoise chỉ cho VAD (Task 4), whisper nghe bản không lọc (Task 4), VAD
  0,5/400/500 (Task 8), gỡ `ShortUnsure` (Task 1), luật cụm "chứa là bỏ" (Task 1), công tắc lọc ồn (Task 4, 6, 12),
  `request` trước `start` (Task 7). Phương án dự phòng §5.1 không làm.
- **Spec §3.2–3.4, §4, §7 phần chế độ `mic`:** settings (Task 6), lệnh IPC (Task 9), quyền và hai nền tảng (Task 5, 7,
  8, 10), giao diện (Task 12–14), mã lỗi (Task 7), `micIssue` loại `suspected` (Task 8, 14). Hai loại còn lại: kế hoạch 03.
- **Spec §5.6 phần micro:** mở lại khi micro mặc định đổi, `ZeroWatch` không hỏi app đang phát, không kiểm tap chết, log
  loại kết nối (Task 7).
- **Spec §10:** test lọc 80 Hz, RNNoise, hai bản thẳng hàng (Task 4); `read_with_vad`, engine với bản VAD im lặng (Task 2);
  tham số VAD theo chế độ (Task 8); settings cũ (Task 6). Test `ShortUnsure` không còn (luật đã gỡ).
- **Còn cho kế hoạch 03:** chế độ `both`, `DuckingMixer` trong app, bộ canh tách theo nguồn, `micIssue` loại
  `permission`/`unavailable`, A2 của chế độ trộn.
- **Còn cho kế hoạch 04:** pháp lý 1.8/1.5, website, `THIRD_PARTY_NOTICES` (thêm `nnnoiseless`, BSD-3-Clause), sửa spec
  chính, A7, phát hành.
