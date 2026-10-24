# Nguồn micro, kế hoạch 01: spike đo trước khi làm

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** có đủ công cụ, bản thu thật và số đo để chốt cách xử lý tiếng vọng (B hay C, tham số), cách chống tiếng ồn ở micro (bộ lọc, tham số VAD, luật `ShortUnsure`), và hành vi quyền micro trên hai hệ điều hành.

**Architecture:**
- Phần code dùng lại ở kế hoạch 02 và 03 viết thật, có test:
  - `audio-capture`: lọc 80 Hz, `MicGate` và `DuckingMixer`, nguồn micro macOS và Windows, danh sách micro, quyền micro.
  - `pipeline::filter`: luật `ShortUnsure`, mặc định tắt.
- Phần chỉ để đo:
  - Công cụ `capture` ghi hai file chưa trộn; công cụ `mic-probe` kiểm quyền.
  - Ba lệnh mới của `latency-bench`: `denoise`, `aec`, `mix-eval`.
  - Script Python dựng track, sinh phương án và chấm điểm.
- `mix-eval` chạy đúng `Segmenter`, Silero và luật lọc của app cùng `asr-worker` thật trên các luồng dựng lại offline, nên một bản thu dùng được cho mọi phương án.

**Tech Stack:** Rust 1.98, `objc2-core-audio` 0.3.2, `objc2-av-foundation` 0.3.2, `windows` 0.62.2, `nnnoiseless` 0.5.2, `sonora` 0.2.0, `rubato` 5; Python 3.12 qua `uv` (`numpy==2.5.4`, `jiwer==4.0.0`, `opencc==1.4.2`).

**Spec:** `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` mục 5.1–5.4, 5.7, 6. Kế hoạch 02 (chế độ `mic`), 03 (chế độ `both`), 04 (phát hành) viết sau khi kế hoạch này chốt tham số (Task 20).

**Quy ước:**
- `W=/Users/dtphong/Desktop/software_business/meeting-translator-work/nguon-micro` (worktree, nhánh `nguon-micro`).
- `M=/Users/dtphong/Desktop/software_business/ai-translator` (thư mục chính: có `models/` và `bench/phase0/data/`, cả hai không có trong git).
- Mọi lệnh bắt đầu bằng `cd $W &&`, vì shell trở về thư mục chính sau mỗi lệnh.
- Không push, không merge, không deploy.
- Bước nào phát tiếng ra loa, mở micro hay cần người ngồi máy (Task 8, 16, 17) thì **hỏi chủ dự án trước khi chạy**.

---

## Cấu trúc file

| File | Việc |
|---|---|
| Tạo `crates/audio-capture/src/highpass.rs` | `HighPass`: lọc thông cao biquad (lớp 1) |
| Tạo `crates/audio-capture/src/duck.rs` | `GateParams`, `MicGate`, `DuckingMixer` (spec §5.4) |
| Tạo `crates/audio-capture/src/macos_input.rs` | `MacInputSource`, `list_capture_devices`, `default_input_device`, `mic_permission`, `request_mic_permission` |
| Sửa `crates/audio-capture/src/macos.rs` | mở `IoBlock`, `IoState`, `on_io`, `input_layout`, `get_property`, `check` cho module cùng crate |
| Sửa `crates/audio-capture/src/windows.rs` | `InputSource`, `MicEndpoint`, `list_capture_devices`, `default_capture_endpoint_id` (phần chung `Wasapi`) |
| Sửa `crates/audio-capture/src/lib.rs` | khai báo module; `Transport`, `InputDevice`, `MicPermission`, `mic_source`, `list_input_devices`, `default_input_signature` |
| Sửa `crates/audio-capture/Cargo.toml` | `objc2-av-foundation`, `serde`, `serde_json`, feature `Win32_System_Registry` |
| Sửa `crates/audio-capture/src/bin/capture.rs` | chế độ cảnh: `--mic`, `--mic-only`, `--cues`, ghi `playback.wav`, `mic.wav`, `mic-raw.wav`, `meta.json` |
| Tạo `crates/audio-capture/src/bin/mic-probe.rs` | S-M4: `devices`, `status`, `request`, `listen` |
| Sửa `crates/audio-capture/macos/make-app.sh` | đóng gói `capture` hay `mic-probe`, có `NSMicrophoneUsageDescription` và entitlement của app |
| Sửa `crates/pipeline/src/config.rs`, `crates/pipeline/src/filter.rs` | luật `ShortUnsure` (lớp 5), mặc định tắt |
| Sửa `crates/pipeline/src/engine.rs`, `crates/latency-bench/src/latency.rs` | thêm nhánh `Verdict::ShortUnsure` |
| Tạo `crates/latency-bench/src/wavio.rs` | đọc và ghi WAV, `resample`, `best_lag`, `shift`, lệnh `align` |
| Tạo `crates/latency-bench/src/denoise.rs` | lệnh `denoise` (RNNoise) |
| Tạo `crates/latency-bench/src/aec.rs` | lệnh `aec` (AEC3 của `sonora`) |
| Tạo `crates/latency-bench/src/mix_eval.rs` | lệnh `mix-eval` |
| Sửa `crates/latency-bench/src/main.rs`, `crates/latency-bench/Cargo.toml` | bốn lệnh mới, dependency |
| Tạo `bench/2026-10-24-nguon-micro/README.md` | điều kiện đo, cách chạy lại |
| Tạo `bench/2026-10-24-nguon-micro/build_scene.py` | dựng `online.wav`, `room.wav`, `schedule.json` cho từng cảnh |
| Tạo `bench/2026-10-24-nguon-micro/cues/s6-on.json`, `cues/s7-on.json` | lời nhắc tạo tiếng ồn |
| Tạo `bench/2026-10-24-nguon-micro/run_scene_macos.sh` | phát track và thu một cảnh trên macOS |
| Tạo `bench/2026-10-24-nguon-micro/make_variants.py` | sinh file phương án cho `mix-eval` |
| Tạo `bench/2026-10-24-nguon-micro/score_mix.py`, `test_score_mix.py` | chấm một cảnh |
| Tạo `bench/2026-10-24-nguon-micro/results/*.md` | kết quả S-M4 và bảng điểm |
| Sửa `.gitignore` | bỏ qua `bench/2026-10-24-nguon-micro/data/` |

---

### Task 0: Mốc ban đầu

**Files:** Sửa `.gitignore`

- [ ] **Step 1: Kiểm nhánh và build, test các crate sẽ sửa**

Run: `cd $W && git branch --show-current && cargo test -p audio-capture -p pipeline -p latency-bench 2>&1 | tail -5`
Expected: `nguon-micro`; mọi test `ok` (test `#[ignore]` không chạy). Có test đỏ thì dừng, báo chủ dự án.

- [ ] **Step 2: Kiểm build Windows**

Run: `cd $W && cargo check -p audio-capture --target x86_64-pc-windows-msvc 2>&1 | tail -2`
Expected: `Finished`. Target `x86_64-pc-windows-msvc` đã cài sẵn. `check` không link nên không cần MSVC.

- [ ] **Step 3: Bỏ qua dữ liệu thu của spike**

Thêm vào `.gitignore`, ngay dưới dòng `/bench/phase0/data/`:

```
# Bản thu của spike nguồn micro: có giọng người thật, không commit (spec 2026-10-24-nguon-micro §6)
/bench/2026-10-24-nguon-micro/data/
```

- [ ] **Step 4: Commit**

```bash
cd $W && git add .gitignore && git commit -m "chore(bench): bỏ qua bản thu của spike nguồn micro"
```

---

### Task 1: Lọc thông cao 80 Hz (`HighPass`)

**Files:**
- Tạo: `crates/audio-capture/src/highpass.rs`
- Sửa: `crates/audio-capture/src/lib.rs` (khai báo module)

- [ ] **Step 1: Viết test trước**

Tạo `crates/audio-capture/src/highpass.rs` chỉ với phần test và khai báo kiểu rỗng:

```rust
//! Lọc thông cao 80 Hz cho luồng micro (spec 2026-10-24-nguon-micro §5.7, lớp 1): cắt tiếng thình thịch khi gõ bàn, rung
//! bàn, chạm laptop. Giọng nói hầu như không có năng lượng dưới 80 Hz, nên lớp này không hại nhận dạng.
//!
//! Biquad bậc 2 Butterworth (Q = 1/√2), hệ số theo RBJ Audio EQ Cookbook, dạng trực tiếp I. Không cấp phát.

pub struct HighPass;

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f32, seconds: f32) -> Vec<f32> {
        (0..(16_000.0 * seconds) as usize)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * freq * i as f32 / 16_000.0).sin())
            .collect()
    }

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
    }

    /// Tỉ lệ RMS ra/vào, bỏ 0,5 giây đầu (lúc bộ lọc còn ổn định).
    fn gain_at(freq: f32) -> f32 {
        let input = sine(freq, 2.0);
        let mut output = input.clone();
        HighPass::new(16_000, 80.0).process(&mut output);
        rms(&output[8_000..]) / rms(&input[8_000..])
    }

    #[test]
    fn low_rumble_is_cut_and_speech_band_is_kept() {
        // Bậc 2 Butterworth: thấp hơn tần số cắt một quãng tám thì giảm khoảng 12 dB (hệ số 0,24).
        let rumble = gain_at(40.0);
        assert!(rumble < 0.3, "40 Hz: {rumble}");
        let speech = gain_at(300.0);
        assert!((0.97..=1.01).contains(&speech), "300 Hz: {speech}");
        let high = gain_at(3_000.0);
        assert!((0.99..=1.01).contains(&high), "3 kHz: {high}");
    }

    #[test]
    fn dc_is_removed() {
        let mut x = vec![0.5f32; 16_000];
        HighPass::new(16_000, 80.0).process(&mut x);
        assert!(x[8_000..].iter().all(|v| v.abs() < 1e-3));
    }

    #[test]
    fn chunked_processing_matches_one_pass() {
        let input = sine(150.0, 0.5);
        let mut whole = input.clone();
        HighPass::new(16_000, 80.0).process(&mut whole);
        let mut chunked = input;
        let mut f = HighPass::new(16_000, 80.0);
        for c in chunked.chunks_mut(97) {
            f.process(c);
        }
        assert_eq!(whole, chunked);
    }
}
```

Trong `crates/audio-capture/src/lib.rs`, thêm sau `pub mod gapfill;`:

```rust
pub mod highpass;
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd $W && cargo test -p audio-capture highpass 2>&1 | tail -5`
Expected: lỗi biên dịch `no function or associated item named 'new'`.

- [ ] **Step 3: Viết code**

Thay dòng `pub struct HighPass;` bằng:

```rust
pub struct HighPass {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl HighPass {
    pub fn new(sample_rate: u32, cutoff_hz: f32) -> Self {
        let w0 = 2.0 * std::f32::consts::PI * cutoff_hz / sample_rate as f32;
        let (sin, cos) = w0.sin_cos();
        // alpha = sin / (2Q), Q = 1/√2.
        let alpha = sin * std::f32::consts::FRAC_1_SQRT_2;
        let a0 = 1.0 + alpha;
        let b0 = (1.0 + cos) / 2.0 / a0;
        Self {
            b0,
            b1: -2.0 * b0,
            b2: b0,
            a1: -2.0 * cos / a0,
            a2: (1.0 - alpha) / a0,
            x1: 0.0,
            x2: 0.0,
            y1: 0.0,
            y2: 0.0,
        }
    }

    /// Lọc tại chỗ. Gọi nhiều lần liên tiếp trên các khối nối nhau cho cùng kết quả như lọc một lần.
    pub fn process(&mut self, samples: &mut [f32]) {
        for s in samples {
            let x = *s;
            let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2 - self.a1 * self.y1 - self.a2 * self.y2;
            self.x2 = self.x1;
            self.x1 = x;
            self.y2 = self.y1;
            self.y1 = y;
            *s = y;
        }
    }
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `cd $W && cargo test -p audio-capture highpass 2>&1 | tail -3`
Expected: `test result: ok. 3 passed`.

- [ ] **Step 5: Commit**

```bash
cd $W && git add crates/audio-capture/src/highpass.rs crates/audio-capture/src/lib.rs && git commit -m "feat(audio-capture): lọc thông cao 80 Hz cho micro (HighPass)"
```

---

### Task 2: Cổng nhường lời (`GateParams`, `MicGate`)

**Files:**
- Tạo: `crates/audio-capture/src/duck.rs`
- Sửa: `crates/audio-capture/src/lib.rs`

- [ ] **Step 1: Viết test trước**

Tạo `crates/audio-capture/src/duck.rs`:

```rust
//! Nhường lời ở chế độ âm thanh máy + micro (spec 2026-10-24-nguon-micro §5.4): khi luồng âm thanh máy (Playback) có
//! tiếng, micro bị hạ xuống, để tiếng cuộc họp phát ra loa rồi lọt vào micro không vào luồng trộn lần thứ hai.
//!
//! - [`MicGate`] đo RMS của Playback theo khung 10 ms. Khung vượt ngưỡng thì hạ micro ngay; hết tiếng thì giữ mức hạ thêm
//!   `hold_ms` rồi mở lại dần trong 50 ms. Tiếng vọng luôn tới micro sau tín hiệu số, nên cổng đóng kịp mà không cần đọc
//!   trước.
//! - [`DuckingMixer`] ghép cặp mẫu Playback với mẫu micro như `Mixer2` (phần dư quá `max_skew` phát riêng), nhân micro với
//!   hệ số của cổng rồi cộng. Micro có hai bản thẳng hàng (cho whisper, cho VAD, spec §5.3): cùng một hệ số cho cả hai.
//!
//! Mọi số đều ở 16 kHz.

/// Một khung đo năng lượng: 10 ms.
pub const GATE_FRAME: usize = 160;
/// Thời gian mở lại dần: 50 ms.
const RELEASE_SAMPLES: f32 = 800.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GateParams {
    /// Khung Playback có RMS từ ngưỡng này (dBFS) trở lên là "có tiếng".
    pub threshold_dbfs: f32,
    /// Mức hạ micro (dB, âm). `f32::NEG_INFINITY`: tắt hẳn micro.
    pub duck_db: f32,
    /// Giữ mức hạ thêm chừng này sau khung có tiếng cuối cùng.
    pub hold_ms: u32,
}

impl GateParams {
    /// Không bao giờ hạ: trộn thẳng (phương án A của spike, và C sau khi khử vọng).
    pub const OFF: GateParams = GateParams {
        threshold_dbfs: f32::INFINITY,
        duck_db: 0.0,
        hold_ms: 0,
    };
}

impl Default for GateParams {
    /// Tham số ban đầu của spec §5.4; spike chọn giá trị chốt.
    fn default() -> Self {
        Self {
            threshold_dbfs: -45.0,
            duck_db: -20.0,
            hold_ms: 300,
        }
    }
}

#[derive(Debug)]
pub struct MicGate;

#[cfg(test)]
mod tests {
    use super::*;

    /// Hệ số áp cho từng mẫu micro khi Playback là `playback`.
    fn gains(params: GateParams, playback: &[f32]) -> Vec<f32> {
        let mut gate = MicGate::new(params);
        playback.iter().map(|&p| gate.next(p)).collect()
    }

    /// 100 ms Playback có tiếng (hằng 0,1: −20 dBFS) rồi im lặng, tổng 0,5 giây.
    fn burst() -> Vec<f32> {
        let mut x = vec![0.1f32; 1_600];
        x.resize(8_000, 0.0);
        x
    }

    #[test]
    fn silence_never_ducks() {
        assert!(gains(GateParams::default(), &[0.0; 8_000]).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn noise_below_the_threshold_never_ducks() {
        // RMS 0,001 = −60 dBFS, dưới ngưỡng −45 dBFS.
        let quiet: Vec<f32> = (0..8_000).map(|i| if i % 2 == 0 { 0.001 } else { -0.001 }).collect();
        assert!(gains(GateParams::default(), &quiet).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn a_burst_ducks_after_one_frame_holds_then_releases() {
        let g = gains(GateParams::default(), &burst());
        let duck = 10f32.powf(-20.0 / 20.0);
        // Khung đầu chưa đo xong: chưa hạ.
        assert_eq!(g[100], 1.0);
        // Từ mẫu thứ 160: đã hạ.
        assert!((g[200] - duck).abs() < 1e-6);
        // Khung cuối có tiếng kết thúc ở mẫu 1600; giữ 300 ms (30 khung) tới mẫu 6400.
        assert!((g[6_000] - duck).abs() < 1e-6);
        // Đang mở lại dần.
        assert!(g[6_800] > duck && g[6_800] < 1.0, "{}", g[6_800]);
        // Mở lại xong sau 50 ms (800 mẫu).
        assert_eq!(g[7_300], 1.0);
    }

    #[test]
    fn negative_infinity_mutes_the_mic() {
        let g = gains(
            GateParams {
                duck_db: f32::NEG_INFINITY,
                ..GateParams::default()
            },
            &burst(),
        );
        assert_eq!(g[200], 0.0);
    }

    #[test]
    fn off_never_ducks() {
        assert!(gains(GateParams::OFF, &[0.9; 8_000]).iter().all(|&g| g == 1.0));
    }

    #[test]
    fn zero_hold_releases_right_after_the_sound() {
        let g = gains(
            GateParams {
                hold_ms: 0,
                ..GateParams::default()
            },
            &burst(),
        );
        // Khung im lặng đầu tiên kết thúc ở mẫu 1760, mở lại xong trước mẫu 1760 + 800 + 1.
        assert_eq!(g[2_600], 1.0);
    }
}
```

Trong `crates/audio-capture/src/lib.rs`, thêm trên `pub mod gapfill;`:

```rust
pub mod duck;
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd $W && cargo test -p audio-capture duck 2>&1 | tail -5`
Expected: lỗi biên dịch `no function or associated item named 'new' found for struct 'MicGate'`.

- [ ] **Step 3: Viết code**

Thay dòng `pub struct MicGate;` bằng:

```rust
pub struct MicGate {
    threshold_sq: f32,
    duck: f32,
    hold_frames: u32,
    release_step: f32,
    acc: f32,
    count: usize,
    holding: u32,
    gain: f32,
}

impl MicGate {
    pub fn new(p: GateParams) -> Self {
        let threshold = 10f32.powf(p.threshold_dbfs / 20.0);
        let duck = if p.duck_db == f32::NEG_INFINITY {
            0.0
        } else {
            10f32.powf(p.duck_db / 20.0)
        };
        Self {
            threshold_sq: threshold * threshold,
            duck,
            hold_frames: p.hold_ms.div_ceil(10),
            release_step: (1.0 - duck) / RELEASE_SAMPLES,
            acc: 0.0,
            count: 0,
            holding: 0,
            gain: 1.0,
        }
    }

    /// Một mẫu Playback; trả hệ số nhân cho mẫu micro cùng vị trí. Không cấp phát.
    pub fn next(&mut self, playback: f32) -> f32 {
        let applied = self.gain;
        self.acc += playback * playback;
        self.count += 1;
        let mut loud = false;
        if self.count == GATE_FRAME {
            loud = self.acc / GATE_FRAME as f32 >= self.threshold_sq;
            self.acc = 0.0;
            self.count = 0;
            if loud {
                self.holding = self.hold_frames;
                self.gain = self.duck;
            } else {
                self.holding = self.holding.saturating_sub(1);
            }
        }
        if !loud && self.holding == 0 && self.gain < 1.0 {
            self.gain = (self.gain + self.release_step).min(1.0);
        }
        applied
    }
}
```

- [ ] **Step 4: Chạy test, thấy qua**

Run: `cd $W && cargo test -p audio-capture duck 2>&1 | tail -3`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Commit**

```bash
cd $W && git add crates/audio-capture/src/duck.rs crates/audio-capture/src/lib.rs && git commit -m "feat(audio-capture): cổng nhường lời MicGate"
```

---

### Task 3: Bộ trộn có nhường lời (`DuckingMixer`)

**Files:** Sửa `crates/audio-capture/src/duck.rs`

- [ ] **Step 1: Viết test trước**

Thêm vào cuối `mod tests` trong `duck.rs`:

```rust
    fn mix(params: GateParams, max_skew: usize, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
        let mut m = DuckingMixer::new(params, max_skew);
        m.push_playback(playback);
        m.push_mic(mic, mic_vad);
        let (mut out, mut out_vad) = (Vec::new(), Vec::new());
        m.flush_into(&mut out, &mut out_vad);
        (out, out_vad)
    }

    #[test]
    fn quiet_playback_passes_both_mic_views_unchanged() {
        let (out, out_vad) = mix(GateParams::default(), 1_600, &[0.0; 1_600], &[0.3; 1_600], &[0.2; 1_600]);
        assert!(out.iter().all(|&v| (v - 0.3).abs() < 1e-6));
        assert!(out_vad.iter().all(|&v| (v - 0.2).abs() < 1e-6));
    }

    #[test]
    fn loud_playback_ducks_both_mic_views_by_the_same_gain() {
        let (out, out_vad) = mix(GateParams::default(), 1_600, &[0.1; 1_600], &[0.5; 1_600], &[0.4; 1_600]);
        // Khung đầu chưa hạ.
        assert!((out[0] - 0.6).abs() < 1e-6);
        // Sau đó micro nhân 0,1.
        assert!((out[1_000] - 0.15).abs() < 1e-5, "{}", out[1_000]);
        assert!((out_vad[1_000] - 0.14).abs() < 1e-5, "{}", out_vad[1_000]);
    }

    #[test]
    fn excess_beyond_the_skew_is_emitted_alone() {
        let mut m = DuckingMixer::new(GateParams::OFF, 100);
        m.push_playback(&[0.2; 300]);
        let (mut out, mut out_vad) = (Vec::new(), Vec::new());
        m.drain_into(&mut out, &mut out_vad);
        assert_eq!(out.len(), 200);
        assert_eq!(out_vad.len(), 200);
        m.push_mic(&[0.1; 100], &[0.1; 100]);
        m.drain_into(&mut out, &mut out_vad);
        assert_eq!(out.len(), 300);
        assert!((out[250] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn flush_emits_everything_that_is_left() {
        let (out, _) = mix(GateParams::OFF, 10_000, &[0.1; 50], &[0.2; 80], &[0.2; 80]);
        assert_eq!(out.len(), 80);
        assert!((out[10] - 0.3).abs() < 1e-6);
        assert!((out[70] - 0.2).abs() < 1e-6);
    }

    #[test]
    fn the_sum_is_clamped() {
        let (out, _) = mix(GateParams::OFF, 100, &[0.9; 10], &[0.9; 10], &[0.9; 10]);
        assert!(out.iter().all(|&v| v == 1.0));
    }

    #[test]
    #[should_panic(expected = "hai bản micro phải dài bằng nhau")]
    fn mic_views_must_have_the_same_length() {
        DuckingMixer::new(GateParams::OFF, 100).push_mic(&[0.0; 3], &[0.0; 2]);
    }

    #[test]
    fn ducked_ratio_counts_mic_samples_under_the_gate() {
        let mut m = DuckingMixer::new(GateParams::default(), 1_600);
        m.push_playback(&[0.1; 1_600]);
        m.push_mic(&[0.0; 1_600], &[0.0; 1_600]);
        m.flush_into(&mut Vec::new(), &mut Vec::new());
        assert!((m.ducked_ratio() - 0.9).abs() < 0.01, "{}", m.ducked_ratio());
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd $W && cargo test -p audio-capture duck 2>&1 | tail -5`
Expected: lỗi biên dịch `cannot find type 'DuckingMixer'`.

- [ ] **Step 3: Viết code**

Thêm vào đầu `duck.rs`, ngay dưới phần chú thích của module:

```rust
use std::collections::VecDeque;
```

Thêm sau `impl MicGate { ... }`:

```rust
pub struct DuckingMixer {
    playback: VecDeque<f32>,
    mic: VecDeque<f32>,
    mic_vad: VecDeque<f32>,
    gate: MicGate,
    max_skew: usize,
    mic_samples: u64,
    ducked_samples: u64,
}

impl DuckingMixer {
    /// `max_skew_samples`: lệch tối đa giữa hai luồng trước khi phần dư được phát riêng (app: 100 ms, như `Mixer2`;
    /// đo offline trên hai file thì `usize::MAX`, ghép theo chỉ số).
    pub fn new(params: GateParams, max_skew_samples: usize) -> Self {
        Self {
            playback: VecDeque::new(),
            mic: VecDeque::new(),
            mic_vad: VecDeque::new(),
            gate: MicGate::new(params),
            max_skew: max_skew_samples,
            mic_samples: 0,
            ducked_samples: 0,
        }
    }

    pub fn push_playback(&mut self, samples: &[f32]) {
        self.playback.extend(samples);
    }

    /// Hai bản micro (cho whisper, cho VAD) phải dài bằng nhau: thẳng hàng từng mẫu (spec §5.3).
    pub fn push_mic(&mut self, asr: &[f32], vad: &[f32]) {
        assert_eq!(asr.len(), vad.len(), "hai bản micro phải dài bằng nhau");
        self.mic.extend(asr);
        self.mic_vad.extend(vad);
    }

    /// Ghi phần ghép được vào `out` (cho whisper) và `out_vad` (cho VAD); phần dư quá `max_skew` phát riêng.
    pub fn drain_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        let paired = self.playback.len().min(self.mic.len());
        for ((p, m), v) in self
            .playback
            .drain(..paired)
            .zip(self.mic.drain(..paired))
            .zip(self.mic_vad.drain(..paired))
        {
            let g = self.gate.next(p);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((p + g * m).clamp(-1.0, 1.0));
            out_vad.push((p + g * v).clamp(-1.0, 1.0));
        }
        let extra = self.playback.len().saturating_sub(self.max_skew);
        self.flush_playback(extra, out, out_vad);
        let extra = self.mic.len().saturating_sub(self.max_skew);
        self.flush_mic(extra, out, out_vad);
    }

    /// Phát hết phần còn lại (khi dừng, hay cuối file).
    pub fn flush_into(&mut self, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        self.drain_into(out, out_vad);
        self.flush_playback(self.playback.len(), out, out_vad);
        self.flush_mic(self.mic.len(), out, out_vad);
    }

    /// Tỉ lệ mẫu micro bị hạ (kể cả lúc giữ và lúc mở lại), để ghi log (spec §5.6).
    pub fn ducked_ratio(&self) -> f32 {
        if self.mic_samples == 0 {
            0.0
        } else {
            self.ducked_samples as f32 / self.mic_samples as f32
        }
    }

    fn flush_playback(&mut self, n: usize, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        for p in self.playback.drain(..n) {
            self.gate.next(p);
            let p = p.clamp(-1.0, 1.0);
            out.push(p);
            out_vad.push(p);
        }
    }

    fn flush_mic(&mut self, n: usize, out: &mut Vec<f32>, out_vad: &mut Vec<f32>) {
        for (m, v) in self.mic.drain(..n).zip(self.mic_vad.drain(..n)) {
            // Không có Playback ở vị trí này: cổng nhận im lặng, nên vẫn giữ rồi mở lại đúng nhịp.
            let g = self.gate.next(0.0);
            self.mic_samples += 1;
            if g < 1.0 {
                self.ducked_samples += 1;
            }
            out.push((g * m).clamp(-1.0, 1.0));
            out_vad.push((g * v).clamp(-1.0, 1.0));
        }
    }
}
```

- [ ] **Step 4: Chạy test, thấy qua; clippy sạch**

Run: `cd $W && cargo test -p audio-capture duck 2>&1 | tail -3 && cargo clippy -p audio-capture --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `13 passed`; clippy `Finished`, không cảnh báo.

- [ ] **Step 5: Commit**

```bash
cd $W && git add crates/audio-capture/src/duck.rs && git commit -m "feat(audio-capture): DuckingMixer trộn Playback với hai bản micro qua cổng nhường lời"
```

---

### Task 4: Luật câu ngắn không chắc (`ShortUnsure`, lớp 5)

**Files:**
- Sửa: `crates/pipeline/src/config.rs` (struct `FilterConfig` dòng 59–81, `impl Default` dòng 138–153)
- Sửa: `crates/pipeline/src/filter.rs`
- Sửa: `crates/pipeline/src/engine.rs:913`, `crates/latency-bench/src/latency.rs:544-548`

- [ ] **Step 1: Viết test trước**

Thêm vào cuối `mod tests` của `crates/pipeline/src/filter.rs`:

```rust
    fn short_cfg() -> FilterConfig {
        FilterConfig {
            short_unsure: true,
            ..FilterConfig::default()
        }
    }

    #[test]
    fn short_texts_are_one_or_two_words_or_up_to_four_han_or_kana() {
        let cfg = FilterConfig::default();
        for text in ["OK", "Đúng rồi.", "好的", "はい", "네", "Got it!"] {
            assert!(is_short(text, &cfg), "{text}");
        }
        for text in ["我们明天下午开会", "We will meet tomorrow", "내일 회의가 있어요", "...", ""] {
            assert!(!is_short(text, &cfg), "{text}");
        }
    }

    #[test]
    fn short_unsure_is_off_by_default() {
        let unsure = Evidence {
            vad_mean_prob: 0.5,
            speech_ms: 200,
            ..CLEAR
        };
        assert!(!is_short_unsure(&unsure, "Đúng rồi", &FilterConfig::default()));
        assert_eq!(verdict(&unsure, "Đúng rồi", &FilterConfig::default()), Verdict::Speech);
    }

    #[test]
    fn short_unsure_drops_short_text_when_the_vad_is_not_sure() {
        let cfg = short_cfg();
        let low_prob = Evidence {
            vad_mean_prob: 0.6,
            ..CLEAR
        };
        let too_brief = Evidence {
            speech_ms: 300,
            ..CLEAR
        };
        assert!(is_short_unsure(&low_prob, "Đúng rồi", &cfg));
        assert!(is_short_unsure(&too_brief, "Đúng rồi", &cfg));
        assert_eq!(verdict(&low_prob, "Đúng rồi", &cfg), Verdict::ShortUnsure);
        // VAD chắc chắn và đủ dài: giữ.
        assert!(!is_short_unsure(&CLEAR, "Đúng rồi", &cfg));
        // Câu dài: giữ dù VAD không chắc.
        assert!(!is_short_unsure(&low_prob, "We will meet tomorrow at nine", &cfg));
    }
```

- [ ] **Step 2: Chạy test, thấy lỗi**

Run: `cd $W && cargo test -p pipeline --lib filter 2>&1 | tail -5`
Expected: lỗi biên dịch (`no field 'short_unsure'`, `cannot find function 'is_short'`).

- [ ] **Step 3: Thêm cấu hình**

Trong `crates/pipeline/src/config.rs`, thêm vào cuối `pub struct FilterConfig` (sau `pub simplify_chinese: bool,`):

```rust
    /// Luật câu ngắn không chắc (spec 2026-10-24-nguon-micro §5.7, lớp 5): chỉ bật ở chế độ có micro. Mặc định tắt.
    pub short_unsure: bool,
    /// Câu ngắn: có chữ, tối đa chừng này từ (đếm theo khoảng trắng)…
    pub short_max_words: usize,
    /// …và tối đa chừng này chữ Hán hay kana (tiếng Trung, Nhật viết liền).
    pub short_max_cjk_chars: usize,
    /// Câu ngắn bị bỏ khi `vad_mean_prob` dưới ngưỡng này…
    pub short_vad_prob_min: f32,
    /// …hoặc khi `speech_ms` dưới ngưỡng này. Hai ngưỡng do spike chọn (kế hoạch nguồn micro 01, Task 19).
    pub short_speech_ms_min: u64,
```

Trong `impl Default for FilterConfig`, thêm sau `simplify_chinese: true,`:

```rust
            short_unsure: false,
            short_max_words: 2,
            short_max_cjk_chars: 4,
            short_vad_prob_min: 0.8,
            short_speech_ms_min: 400,
```

- [ ] **Step 4: Thêm luật**

Trong `crates/pipeline/src/filter.rs`:

Thêm biến thể vào `enum Verdict`, sau `Filler,`:

```rust
    /// Câu ngắn (một–hai từ) mà VAD không chắc là tiếng nói; chỉ ở chế độ có micro (`FilterConfig::short_unsure`).
    ShortUnsure,
```

Sửa doc và thân `verdict`:

```rust
/// Áp mọi luật, theo thứ tự: `NoSpeech`, `Hallucination`, `Repetition`, `Filler`, `ShortUnsure`. `text` là chữ đã qua
/// `text::display_text`.
pub fn verdict(ev: &Evidence, text: &str, cfg: &FilterConfig) -> Verdict {
    if is_no_speech(ev.no_speech_prob, ev.avg_logprob, text, cfg) {
        Verdict::NoSpeech
    } else if is_hallucination(text, cfg) {
        Verdict::Hallucination
    } else if compression_ratio(text) > cfg.compression_ratio_max {
        Verdict::Repetition
    } else if is_suspect_filler(ev, text, cfg) {
        Verdict::Filler
    } else if is_short_unsure(ev, text, cfg) {
        Verdict::ShortUnsure
    } else {
        Verdict::Speech
    }
}
```

Thêm sau `is_suspect_filler`:

```rust
/// Chữ Hán, hiragana, katakana: tiếng Trung, Nhật viết liền nên câu ngắn được đếm theo chữ.
fn is_cjk(c: char) -> bool {
    matches!(c, '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}')
}

/// Câu ngắn (lớp 5): có chữ, tối đa `short_max_words` từ và tối đa `short_max_cjk_chars` chữ Hán hay kana. "OK",
/// "Đúng rồi", "好的", "はい", "네" là câu ngắn; "我们明天下午开会" thì không.
pub fn is_short(text: &str, cfg: &FilterConfig) -> bool {
    let words = text
        .split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .count();
    let cjk = text.chars().filter(|&c| is_cjk(c)).count();
    words > 0 && words <= cfg.short_max_words && cjk <= cfg.short_max_cjk_chars
}

/// Câu ngắn mà VAD không chắc là tiếng nói (lớp 5): tiếng gõ phím, tiếng bút lọt qua VAD hay sinh ra các chữ ngắn như
/// thế. Chỉ áp khi `short_unsure` bật.
pub fn is_short_unsure(ev: &Evidence, text: &str, cfg: &FilterConfig) -> bool {
    cfg.short_unsure
        && is_short(text, cfg)
        && (ev.vad_mean_prob < cfg.short_vad_prob_min || ev.speech_ms < cfg.short_speech_ms_min)
}
```

- [ ] **Step 5: Thêm nhánh mới ở hai chỗ `match`**

`crates/pipeline/src/engine.rs:913`, đổi dòng:

```rust
                    Verdict::NoSpeech | Verdict::Hallucination | Verdict::Repetition | Verdict::Filler => {
```

thành:

```rust
                    Verdict::NoSpeech
                    | Verdict::Hallucination
                    | Verdict::Repetition
                    | Verdict::Filler
                    | Verdict::ShortUnsure => {
```

`crates/latency-bench/src/latency.rs`: thêm hằng sau `const SKIP_FILLER: &str = "filler";`:

```rust
/// Câu ngắn mà VAD không chắc (`pipeline::filter`, chỉ bật ở chế độ có micro).
const SKIP_SHORT_UNSURE: &str = "short_unsure";
```

và trong `fn route`, thêm sau `Verdict::Filler => return Err(SKIP_FILLER.into()),`:

```rust
        Verdict::ShortUnsure => return Err(SKIP_SHORT_UNSURE.into()),
```

- [ ] **Step 6: Chạy test, thấy qua**

Run: `cd $W && cargo test -p pipeline -p latency-bench 2>&1 | grep -E "test result|error" | head`
Expected: mọi dòng `test result: ok`, không có `error`.

- [ ] **Step 7: Commit**

```bash
cd $W && git add crates/pipeline/src/config.rs crates/pipeline/src/filter.rs crates/pipeline/src/engine.rs crates/latency-bench/src/latency.rs && git commit -m "feat(pipeline): luật ShortUnsure cho câu ngắn mà VAD không chắc (mặc định tắt)"
```

---

### Task 5: Nguồn micro trên macOS

**Files:**
- Tạo: `crates/audio-capture/src/macos_input.rs`
- Sửa: `crates/audio-capture/src/macos.rs`, `crates/audio-capture/src/lib.rs`, `crates/audio-capture/Cargo.toml`

- [ ] **Step 1: Mở các phần dùng chung trong `macos.rs`**

Đổi khả kiến của các mục sau trong `crates/audio-capture/src/macos.rs` (không đổi thân hàm):

- `type IoBlock = RcBlock<` → `pub(crate) type IoBlock = RcBlock<`
- `struct IoState {` → `pub(crate) struct IoState {`, và từng trường của nó thêm `pub(crate)` (`producer`, `non_interleaved`, `channels`, `per_buffer`, `buffers`, `stats`)
- `unsafe fn on_io(` → `pub(crate) unsafe fn on_io(`
- `fn input_layout(` → `pub(crate) fn input_layout(`
- `fn get_property<T>(` → `pub(crate) fn get_property<T>(`
- `fn check(` → `pub(crate) fn check(`

- [ ] **Step 2: Thêm dependency**

Trong `crates/audio-capture/Cargo.toml`, mục `[target.'cfg(target_os = "macos")'.dependencies]`, thêm sau dòng `objc2-app-kit`:

```toml
# Trạng thái và lời xin quyền Micro (`AVCaptureDevice`, spec 2026-10-24-nguon-micro §3.4). Cùng dòng 0.3 với các crate objc2-*.
objc2-av-foundation = { version = "0.3.2", default-features = false, features = ["std", "block2", "AVCaptureDevice", "AVMediaFormat"] }
```

- [ ] **Step 3: Thêm kiểu dùng chung vào `lib.rs`**

Trong `crates/audio-capture/src/lib.rs`:

- Thêm sau `pub mod macos;` (cùng `#[cfg(target_os = "macos")]`):

```rust
#[cfg(target_os = "macos")]
pub mod macos_input;
```

- Đổi `use std::sync::atomic::{AtomicU64, Ordering};` thành:

```rust
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
```

- Thêm trước `/// Số liệu chẩn đoán, cập nhật từ luồng thu.`:

```rust
/// Cách micro nối với máy. Log và báo cáo lỗi chỉ ghi loại này, không ghi tên micro, vì tên có thể chứa tên người
/// (spec 2026-10-24-nguon-micro §4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Transport {
    BuiltIn,
    Usb,
    Bluetooth,
    Virtual,
    Other,
}

impl Transport {
    pub fn as_str(self) -> &'static str {
        match self {
            Transport::BuiltIn => "builtin",
            Transport::Usb => "usb",
            Transport::Bluetooth => "bluetooth",
            Transport::Virtual => "virtual",
            Transport::Other => "other",
        }
    }
}

/// Một micro (thiết bị có luồng vào), cho bộ chọn ở Cài đặt › Âm thanh.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InputDevice {
    /// macOS: UID của thiết bị; Windows: id endpoint.
    pub id: String,
    pub name: String,
    pub transport: Transport,
    pub is_default: bool,
}

/// Quyền dùng micro của app (spec 2026-10-24-nguon-micro §3.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MicPermission {
    Granted,
    Denied,
    Undetermined,
}

/// Nguồn micro (spec 2026-10-24-nguon-micro §5.1, §5.2). `id`: `None` là micro mặc định.
pub fn mic_source(id: Option<String>, stats: Arc<CaptureStats>) -> anyhow::Result<Box<dyn AudioSource>> {
    #[cfg(target_os = "macos")]
    return Ok(Box::new(macos_input::MacInputSource::new(
        id.map_or(macos_input::MicTarget::Default, macos_input::MicTarget::Uid),
        stats,
    )));
    #[cfg(windows)]
    return Ok(Box::new(windows::InputSource::new(
        id.map_or(windows::MicEndpoint::Default, windows::MicEndpoint::Device),
        stats,
    )));
    #[allow(unreachable_code)]
    {
        let _ = (id, stats);
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Các micro đang dùng được.
pub fn list_input_devices() -> anyhow::Result<Vec<InputDevice>> {
    #[cfg(target_os = "macos")]
    return macos_input::list_capture_devices();
    #[cfg(windows)]
    return windows::list_capture_devices();
    #[allow(unreachable_code)]
    {
        anyhow::bail!("chỉ hỗ trợ macOS và Windows")
    }
}

/// Dấu hiệu của micro mặc định: đổi thì mở lại nguồn micro (spec §5.6). `None` nếu không đọc được hay máy không có micro.
pub fn default_input_signature() -> Option<String> {
    #[cfg(target_os = "macos")]
    return macos_input::default_input_device().ok().map(|id| {
        let rate = macos::nominal_sample_rate(id).unwrap_or(0.0);
        format!("{id}@{rate:.0}")
    });
    #[cfg(windows)]
    return windows::default_capture_endpoint_id().ok();
    #[allow(unreachable_code)]
    None
}
```

Lưu ý: dòng `return windows::...` trong `mic_source` và `list_input_devices` sẽ chỉ biên dịch được sau Task 6. Task này chỉ build và test trên macOS; Task 6 kiểm build Windows.

- [ ] **Step 4: Viết test trước cho phần thuần**

Tạo `crates/audio-capture/src/macos_input.rs` với phần đầu và test:

```rust
//! Thu micro trên macOS (spec 2026-10-24-nguon-micro §5.1). IO proc chạy thẳng trên thiết bị vào: cùng cách đọc mẫu với
//! aggregate device của tap (`macos::on_io`), nhưng không có tap, nên code tap không đổi.
//!
//! Quyền: lần đầu `AudioDeviceStart` trên micro, macOS hỏi quyền Micro theo `NSMicrophoneUsageDescription`. App ký với
//! hardened runtime phải có entitlement `com.apple.security.device.audio-input` (app đã có). Trạng thái quyền đọc qua
//! `AVCaptureDevice` ([`mic_permission`]).

use anyhow::{Result, bail};

/// Cách đọc buffer của IO proc từ bố cục luồng vào (`input_layout`): `(tách kênh, số kênh, số kênh mỗi buffer, số
/// buffer)`. Hỗ trợ một luồng nhiều kênh xen kẽ, hay nhiều luồng mỗi luồng một kênh; bố cục khác thì báo lỗi.
pub(crate) fn mic_layout(layout: &[u32]) -> Result<(bool, usize, u32, usize)> {
    let _ = layout;
    bail!("chưa viết")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_interleaved_stream() {
        assert_eq!(mic_layout(&[2]).unwrap(), (false, 2, 2, 1));
        assert_eq!(mic_layout(&[1]).unwrap(), (false, 1, 1, 1));
    }

    #[test]
    fn several_mono_streams_are_read_as_separate_channels() {
        assert_eq!(mic_layout(&[1, 1, 1]).unwrap(), (true, 3, 1, 3));
    }

    #[test]
    fn no_input_or_mixed_layouts_are_rejected() {
        assert!(mic_layout(&[]).is_err());
        assert!(mic_layout(&[0]).is_err());
        assert!(mic_layout(&[2, 1]).is_err());
    }
}
```

Run: `cd $W && cargo test -p audio-capture macos_input 2>&1 | tail -4`
Expected: lỗi biên dịch ở `lib.rs` (`MacInputSource`, `MicTarget` chưa có), hoặc test FAIL ("chưa viết").

- [ ] **Step 5: Viết module**

Thay toàn bộ phần trên test (từ `use anyhow::{Result, bail};` tới hết `mic_layout`) bằng:

```rust
use crate::macos::{IoBlock, IoState, check, get_property, input_layout, nominal_sample_rate, on_io};
use crate::{AudioFormat, AudioSource, CaptureStats, InputDevice, MicPermission, Transport};
use anyhow::{Result, anyhow, bail};
use block2::RcBlock;
use objc2_core_audio::{
    AudioDeviceCreateIOProcIDWithBlock, AudioDeviceDestroyIOProcID, AudioDeviceIOProcID, AudioDeviceStart,
    AudioDeviceStop, AudioObjectGetPropertyData, AudioObjectGetPropertyDataSize, AudioObjectID,
    AudioObjectPropertyAddress, kAudioDevicePropertyDeviceIsAlive, kAudioDevicePropertyDeviceUID,
    kAudioDevicePropertyTransportType, kAudioDeviceTransportTypeBluetooth, kAudioDeviceTransportTypeBluetoothLE,
    kAudioDeviceTransportTypeBuiltIn, kAudioDeviceTransportTypeUSB, kAudioDeviceTransportTypeVirtual,
    kAudioHardwarePropertyDefaultInputDevice, kAudioHardwarePropertyDevices, kAudioObjectPropertyElementMain,
    kAudioObjectPropertyName, kAudioObjectPropertyScopeGlobal, kAudioObjectSystemObject,
};
use objc2_core_audio_types::{AudioBufferList, AudioTimeStamp};
use objc2_core_foundation::{CFRetained, CFString};
use std::cell::UnsafeCell;
use std::ptr::NonNull;
use std::sync::Arc;
use std::time::Duration;

/// Micro cần thu.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MicTarget {
    /// Micro mặc định của hệ thống, đọc lúc `start`.
    Default,
    /// Micro theo UID (`kAudioDevicePropertyDeviceUID`).
    Uid(String),
}

pub struct MacInputSource {
    target: MicTarget,
    device: AudioObjectID,
    proc_id: AudioDeviceIOProcID,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    block: Option<IoBlock>,
}

impl MacInputSource {
    pub fn new(target: MicTarget, stats: Arc<CaptureStats>) -> Self {
        Self {
            target,
            device: 0,
            proc_id: None,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            block: None,
        }
    }
}

impl AudioSource for MacInputSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let device = match &self.target {
            MicTarget::Default => default_input_device()?,
            MicTarget::Uid(uid) => device_by_uid(uid)?,
        };
        let rate = nominal_sample_rate(device)?;
        let (non_interleaved, channels, per_buffer, buffers) = mic_layout(&input_layout(device)?)?;
        let io = Arc::new(IoState {
            producer: UnsafeCell::new(sink),
            non_interleaved,
            channels,
            per_buffer,
            buffers,
            stats: self.stats.clone(),
        });
        let block: IoBlock = RcBlock::new(
            move |_now: NonNull<AudioTimeStamp>,
                  input: NonNull<AudioBufferList>,
                  _input_time: NonNull<AudioTimeStamp>,
                  _output: NonNull<AudioBufferList>,
                  _output_time: NonNull<AudioTimeStamp>| {
                // SAFETY: chỉ luồng IO của Core Audio gọi khối này.
                unsafe { on_io(&io, input) };
            },
        );
        let mut proc_id: AudioDeviceIOProcID = None;
        check(
            unsafe {
                AudioDeviceCreateIOProcIDWithBlock(NonNull::from(&mut proc_id), device, None, RcBlock::as_ptr(&block))
            },
            "AudioDeviceCreateIOProcIDWithBlock",
        )?;
        self.device = device;
        self.proc_id = proc_id;
        self.block = Some(block);
        self.format = AudioFormat {
            sample_rate: rate.round() as u32,
            channels: channels as u16,
        };
        check(unsafe { AudioDeviceStart(device, self.proc_id) }, "AudioDeviceStart")
    }

    fn stop(&mut self) {
        if self.device != 0 {
            unsafe {
                AudioDeviceStop(self.device, self.proc_id);
                AudioDeviceDestroyIOProcID(self.device, self.proc_id);
            }
        }
        self.device = 0;
        self.proc_id = None;
        self.block = None;
    }

    fn format(&self) -> AudioFormat {
        self.format
    }

    /// Micro bị rút (USB, Bluetooth): thiết bị không còn "sống", app phải mở lại nguồn (spec §5.6).
    fn failed(&self) -> bool {
        if self.device == 0 {
            return false;
        }
        let mut alive: u32 = 1;
        get_property(self.device, kAudioDevicePropertyDeviceIsAlive, std::ptr::null(), 0, &mut alive).is_err()
            || alive == 0
    }
}

impl Drop for MacInputSource {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Cách đọc buffer của IO proc từ bố cục luồng vào (`input_layout`): `(tách kênh, số kênh, số kênh mỗi buffer, số
/// buffer)`. Hỗ trợ một luồng nhiều kênh xen kẽ, hay nhiều luồng mỗi luồng một kênh; bố cục khác thì báo lỗi.
pub(crate) fn mic_layout(layout: &[u32]) -> Result<(bool, usize, u32, usize)> {
    match layout {
        [] | [0] => bail!("thiết bị không có luồng vào"),
        [n] => Ok((false, *n as usize, *n, 1)),
        many if many.iter().all(|&c| c == 1) => Ok((true, many.len(), 1, many.len())),
        other => bail!("bố cục luồng vào chưa hỗ trợ: {other:?}"),
    }
}

/// Micro mặc định của hệ thống.
pub fn default_input_device() -> Result<AudioObjectID> {
    let mut id: AudioObjectID = 0;
    get_property(
        kAudioObjectSystemObject as AudioObjectID,
        kAudioHardwarePropertyDefaultInputDevice,
        std::ptr::null(),
        0,
        &mut id,
    )?;
    if id == 0 {
        bail!("máy không có micro mặc định");
    }
    Ok(id)
}

/// Mọi thiết bị âm thanh (cả thiết bị chỉ phát).
fn all_devices() -> Result<Vec<AudioObjectID>> {
    let system = kAudioObjectSystemObject as AudioObjectID;
    let mut address = AudioObjectPropertyAddress {
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain,
    };
    let mut size = 0u32;
    check(
        unsafe {
            AudioObjectGetPropertyDataSize(
                system,
                NonNull::from(&mut address),
                0,
                std::ptr::null(),
                NonNull::from(&mut size),
            )
        },
        "AudioObjectGetPropertyDataSize",
    )?;
    let mut ids = vec![0 as AudioObjectID; size as usize / size_of::<AudioObjectID>()];
    if !ids.is_empty() {
        check(
            unsafe {
                AudioObjectGetPropertyData(
                    system,
                    NonNull::from(&mut address),
                    0,
                    std::ptr::null(),
                    NonNull::from(&mut size),
                    NonNull::from(ids.as_mut_slice()).cast(),
                )
            },
            "AudioObjectGetPropertyData",
        )?;
        ids.truncate(size as usize / size_of::<AudioObjectID>());
    }
    Ok(ids)
}

/// Thuộc tính kiểu CFString của một đối tượng Core Audio.
fn string_property(object: AudioObjectID, selector: u32) -> Option<String> {
    let mut value: *const CFString = std::ptr::null();
    get_property(object, selector, std::ptr::null(), 0, &mut value).ok()?;
    // SAFETY: Core Audio trả một CFString đã retain (+1); `CFRetained` nhận quyền sở hữu và release khi xong.
    NonNull::new(value.cast_mut()).map(|p| unsafe { CFRetained::from_raw(p) }.to_string())
}

fn transport(device: AudioObjectID) -> Transport {
    let mut kind: u32 = 0;
    if get_property(device, kAudioDevicePropertyTransportType, std::ptr::null(), 0, &mut kind).is_err() {
        return Transport::Other;
    }
    match kind {
        kAudioDeviceTransportTypeBuiltIn => Transport::BuiltIn,
        kAudioDeviceTransportTypeUSB => Transport::Usb,
        kAudioDeviceTransportTypeBluetooth | kAudioDeviceTransportTypeBluetoothLE => Transport::Bluetooth,
        kAudioDeviceTransportTypeVirtual => Transport::Virtual,
        _ => Transport::Other,
    }
}

/// Các thiết bị có luồng vào, kèm tên và loại kết nối.
pub fn list_capture_devices() -> Result<Vec<InputDevice>> {
    objc2::rc::autoreleasepool(|_| {
        let default = default_input_device().ok();
        let mut out = Vec::new();
        for id in all_devices()? {
            let channels: u32 = input_layout(id).unwrap_or_default().iter().sum();
            if channels == 0 {
                continue;
            }
            let Some(uid) = string_property(id, kAudioDevicePropertyDeviceUID) else {
                continue;
            };
            out.push(InputDevice {
                id: uid,
                name: string_property(id, kAudioObjectPropertyName).unwrap_or_default(),
                transport: transport(id),
                is_default: Some(id) == default,
            });
        }
        Ok(out)
    })
}

fn device_by_uid(uid: &str) -> Result<AudioObjectID> {
    for id in all_devices()? {
        if string_property(id, kAudioDevicePropertyDeviceUID).as_deref() == Some(uid) {
            return Ok(id);
        }
    }
    bail!("không tìm thấy micro {uid}")
}

/// Trạng thái quyền micro của app. Chỉ đọc, không hỏi người dùng.
pub fn mic_permission() -> MicPermission {
    use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
    // SAFETY: hằng của AVFoundation, framework được liên kết lúc build.
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        return MicPermission::Undetermined;
    };
    match unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) } {
        AVAuthorizationStatus::Authorized => MicPermission::Granted,
        AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => MicPermission::Denied,
        _ => MicPermission::Undetermined,
    }
}

/// Xin quyền micro: macOS hiện hộp thoại nếu chưa hỏi lần nào; đã trả lời rồi thì trả ngay kết quả cũ. Chờ tối đa `wait`.
pub fn request_mic_permission(wait: Duration) -> Result<bool> {
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};
    // SAFETY: như `mic_permission`.
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        bail!("không đọc được AVMediaTypeAudio");
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let handler = RcBlock::new(move |granted: Bool| {
        let _ = tx.send(granted.as_bool());
    });
    // SAFETY: AVFoundation giữ (copy) khối tới khi gọi xong; khối chỉ gửi qua kênh, gọi từ hàng đợi nào cũng được.
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler) };
    rx.recv_timeout(wait).map_err(|_| anyhow!("không có trả lời sau {wait:?}"))
}
```

Thêm vào cuối `mod tests` một test đọc máy thật (bỏ qua mặc định, như `macos::hal`):

```rust
    /// Đọc danh sách micro của máy thật; không mở micro nên không hỏi quyền.
    #[test]
    #[ignore = "đọc thiết bị âm thanh của máy thật"]
    fn the_default_mic_is_listed() {
        let devices = list_capture_devices().unwrap();
        assert!(devices.iter().filter(|d| d.is_default).count() <= 1, "{devices:?}");
        if default_input_device().is_ok() {
            assert!(devices.iter().any(|d| d.is_default), "{devices:?}");
        }
        assert!(crate::default_input_signature().is_some_and(|s| s.contains('@')));
        println!("{devices:?}");
    }
```

- [ ] **Step 6: Chạy test (cả test máy thật), clippy**

Run: `cd $W && cargo test -p audio-capture macos_input 2>&1 | tail -3 && cargo test -p audio-capture macos_input -- --ignored --nocapture 2>&1 | grep -E "InputDevice|test result" && cargo clippy -p audio-capture --all-targets -- -D warnings 2>&1 | tail -2`
Expected: `3 passed`; test máy thật `1 passed` và in danh sách có micro MacBook (`BuiltIn`, `is_default: true`); clippy `Finished`.

- [ ] **Step 7: Commit**

```bash
cd $W && git add crates/audio-capture && git commit -m "feat(audio-capture): nguồn micro macOS, danh sách micro, quyền Micro qua AVCaptureDevice"
```

---

### Task 6: Nguồn micro trên Windows

**Files:** Sửa `crates/audio-capture/src/windows.rs`

- [ ] **Step 1: Thêm import**

Trong `windows.rs`:

- Đổi `use crate::{AudioFormat, AudioSource, CaptureStats};` thành `use crate::{AudioFormat, AudioSource, CaptureStats, InputDevice, Transport};`
- Trong khối `use windows::Win32::Media::Audio::{...}` thêm `EDataFlow, eCapture,` (giữ các mục cũ).

- [ ] **Step 2: Thêm kiểu đích và phần chung `Wasapi`**

Thêm sau `pub struct RenderDevice { ... }`:

```rust
/// Micro để thu (spec 2026-10-24-nguon-micro §5.2).
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MicEndpoint {
    /// Micro mặc định (vai trò Console: thiết bị Settings › Sound › Input đang chọn).
    Default,
    /// Một micro người dùng chọn, theo id endpoint.
    Device(String),
}

/// Thiết bị mà luồng thu WASAPI mở: loopback của một thiết bị phát, hay một micro.
#[derive(Clone, Debug, PartialEq, Eq)]
enum Target {
    Loopback(Endpoint),
    Mic(MicEndpoint),
}
```

Thay `pub struct LoopbackSource { ... }`, `impl LoopbackSource { ... }`, `impl AudioSource for LoopbackSource { ... }` và `impl Drop for LoopbackSource { ... }` bằng:

```rust
/// Phần chung của nguồn loopback và nguồn micro: luồng thu WASAPI chạy nền.
struct Wasapi {
    target: Target,
    format: AudioFormat,
    stats: Arc<CaptureStats>,
    stop: Arc<AtomicBool>,
    failed: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Wasapi {
    fn new(target: Target, stats: Arc<CaptureStats>) -> Self {
        Self {
            target,
            format: AudioFormat {
                sample_rate: 0,
                channels: 0,
            },
            stats,
            stop: Arc::new(AtomicBool::new(false)),
            failed: Arc::new(AtomicBool::new(false)),
            thread: None,
        }
    }

    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<AudioFormat, String>>();
        let target = self.target.clone();
        let (stop, failed, stats) = (self.stop.clone(), self.failed.clone(), self.stats.clone());
        self.thread = Some(std::thread::spawn(move || {
            if let Err(e) = capture_thread(&target, sink, stop, stats, &ready_tx) {
                failed.store(true, Ordering::SeqCst);
                let _ = ready_tx.send(Err(format!("{e:#}")));
            }
        }));
        self.format = ready_rx
            .recv_timeout(Duration::from_secs(5))
            .context("luồng thu không phản hồi")?
            .map_err(|e| anyhow!(e))?;
        Ok(())
    }

    fn stop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

impl Drop for Wasapi {
    fn drop(&mut self) {
        self.stop();
    }
}

pub struct LoopbackSource(Wasapi);

impl LoopbackSource {
    pub fn new(endpoint: Endpoint, stats: Arc<CaptureStats>) -> Self {
        Self(Wasapi::new(Target::Loopback(endpoint), stats))
    }
}

impl AudioSource for LoopbackSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        self.0.start(sink)
    }

    fn stop(&mut self) {
        self.0.stop();
    }

    fn format(&self) -> AudioFormat {
        self.0.format
    }

    fn failed(&self) -> bool {
        self.0.failed.load(Ordering::SeqCst)
    }
}

/// Nguồn micro (spec 2026-10-24-nguon-micro §5.2): WASAPI shared mode trên endpoint thu, không cờ loopback.
pub struct InputSource(Wasapi);

impl InputSource {
    pub fn new(endpoint: MicEndpoint, stats: Arc<CaptureStats>) -> Self {
        Self(Wasapi::new(Target::Mic(endpoint), stats))
    }
}

impl AudioSource for InputSource {
    fn start(&mut self, sink: rtrb::Producer<f32>) -> Result<()> {
        self.0.start(sink)
    }

    fn stop(&mut self) {
        self.0.stop();
    }

    fn format(&self) -> AudioFormat {
        self.0.format
    }

    fn failed(&self) -> bool {
        self.0.failed.load(Ordering::SeqCst)
    }
}
```

- [ ] **Step 3: Liệt kê và chọn thiết bị**

Thay `pub fn list_render_devices()` bằng bản dùng hàm chung, và thêm các hàm cho micro:

```rust
/// Các endpoint đang hoạt động theo chiều `flow`: (id, tên hiển thị).
fn active_endpoints(flow: EDataFlow) -> Result<Vec<(String, String)>> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let collection = unsafe { enumerator.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE)? };
        let mut devices = Vec::new();
        for i in 0..unsafe { collection.GetCount()? } {
            let device = unsafe { collection.Item(i)? };
            let id = pwstr_to_string(unsafe { device.GetId()? })?;
            let store = unsafe { device.OpenPropertyStore(STGM_READ)? };
            let name = unsafe { store.GetValue(&PKEY_Device_FriendlyName)? }.to_string();
            devices.push((id, name));
        }
        Ok(devices)
    })
}

/// Các thiết bị phát đang hoạt động, kèm tên hiển thị.
pub fn list_render_devices() -> Result<Vec<RenderDevice>> {
    Ok(active_endpoints(eRender)?
        .into_iter()
        .map(|(id, name)| RenderDevice { id, name })
        .collect())
}

/// Id của micro mặc định (vai trò Console). App hỏi định kỳ để biết micro mặc định đã đổi (spec §5.6).
pub fn default_capture_endpoint_id() -> Result<String> {
    with_com(|| {
        let enumerator: IMMDeviceEnumerator = unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)? };
        let device = unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)? };
        pwstr_to_string(unsafe { device.GetId()? })
    })
}

/// Các micro đang hoạt động. Loại kết nối chưa đọc trên Windows (kế hoạch 02 quyết có cần không).
pub fn list_capture_devices() -> Result<Vec<InputDevice>> {
    let default = default_capture_endpoint_id().ok();
    Ok(active_endpoints(eCapture)?
        .into_iter()
        .map(|(id, name)| InputDevice {
            is_default: default.as_deref() == Some(id.as_str()),
            id,
            name,
            transport: Transport::Other,
        })
        .collect())
}

fn open_target(enumerator: &IMMDeviceEnumerator, target: &Target) -> Result<IMMDevice> {
    Ok(match target {
        Target::Loopback(endpoint) => open_device(enumerator, endpoint)?,
        Target::Mic(MicEndpoint::Default) => unsafe { enumerator.GetDefaultAudioEndpoint(eCapture, eConsole)? },
        Target::Mic(MicEndpoint::Device(id)) => unsafe { enumerator.GetDevice(&HSTRING::from(id.as_str()))? },
    })
}
```

- [ ] **Step 4: Cho `capture_thread` nhận `Target`**

Trong `fn capture_thread`:
- đổi tham số đầu `endpoint: &Endpoint,` thành `target: &Target,`;
- đổi `let device = open_device(&enumerator, endpoint)?;` thành `let device = open_target(&enumerator, target)?;`;
- thay khối `let flags = AUDCLNT_STREAMFLAGS_LOOPBACK | ...;` bằng:

```rust
        let mut flags = AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
        if matches!(target, Target::Loopback(_)) {
            flags |= AUDCLNT_STREAMFLAGS_LOOPBACK;
        }
```

Sửa chú thích đầu file: thêm dòng cuối

```rust
//! Cũng thu micro (spec 2026-10-24-nguon-micro §5.2): cùng luồng thu, mở endpoint `eCapture` và bỏ cờ loopback.
```

- [ ] **Step 5: Kiểm build Windows và macOS, clippy**

Run: `cd $W && cargo check -p audio-capture --target x86_64-pc-windows-msvc --all-targets 2>&1 | tail -3 && cargo clippy -p audio-capture --target x86_64-pc-windows-msvc --all-targets -- -D warnings 2>&1 | tail -2 && cargo test -p audio-capture 2>&1 | grep "test result"`
Expected: cả hai lệnh Windows `Finished`; test macOS `ok`. Có lỗi kiểu ở API `windows` thì sửa theo thông báo của trình biên dịch (giữ hành vi như trên). Không chạy được trên Windows ở bước này: Task 17 chạy thật.

- [ ] **Step 6: Commit**

```bash
cd $W && git add crates/audio-capture/src/windows.rs && git commit -m "feat(audio-capture): nguồn micro Windows (WASAPI eCapture), danh sách micro"
```

---

### Task 7: Công cụ `mic-probe` và đóng gói app để thử quyền

**Files:**
- Tạo: `crates/audio-capture/src/bin/mic-probe.rs`
- Sửa: `crates/audio-capture/Cargo.toml`, `crates/audio-capture/macos/make-app.sh`

- [ ] **Step 1: Dependency**

Trong `crates/audio-capture/Cargo.toml`:
- mục `[dependencies]` thêm `serde.workspace = true` và `serde_json.workspace = true` (cho `capture` ở Task 9);
- mục `windows` thêm feature `"Win32_System_Registry",` vào danh sách `features` (giữ thứ tự chữ cái).

- [ ] **Step 2: Viết `mic-probe`**

Tạo `crates/audio-capture/src/bin/mic-probe.rs`:

```rust
//! Spike S-M4 (spec 2026-10-24-nguon-micro §6.4): kiểm hành vi quyền micro và nguồn micro trên máy thật.
//!
//! macOS: chạy qua `MicProbe.app` (`crates/audio-capture/macos/make-app.sh mic-probe`), vì quyền Micro tính theo app đang
//! chạy; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
//!
//! - `devices`: liệt kê micro (tên, loại kết nối, mặc định).
//! - `status`: trạng thái quyền micro (macOS: `AVCaptureDevice`; Windows: khóa `ConsentStore\microphone`).
//! - `request`: macOS, xin quyền (hiện hộp thoại nếu chưa hỏi), chờ trả lời tối đa 60 giây.
//! - `listen [--seconds N] [--id ID]`: mở micro N giây, in mỗi giây RMS và tỉ lệ mẫu bằng 0 tuyệt đối; mở lỗi thì in
//!   nguyên văn lỗi (mã HRESULT hay OSStatus).

use anyhow::Result;
use audio_capture::CaptureStats;
use audio_capture::preprocess::RING_SAMPLES;
use clap::{Parser, Subcommand};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Parser)]
struct Args {
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    Devices,
    Status,
    Request,
    Listen {
        #[arg(long, default_value_t = 5)]
        seconds: u64,
        #[arg(long)]
        id: Option<String>,
    },
}

fn main() -> Result<()> {
    match Args::parse().cmd {
        Cmd::Devices => devices(),
        Cmd::Status => status(),
        Cmd::Request => request(),
        Cmd::Listen { seconds, id } => listen(seconds, id),
    }
}

fn devices() -> Result<()> {
    for d in audio_capture::list_input_devices()? {
        println!(
            "{}{} [{}] id={}",
            if d.is_default { "* " } else { "  " },
            d.name,
            d.transport.as_str(),
            d.id
        );
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn status() -> Result<()> {
    println!("quyền micro: {:?}", audio_capture::macos_input::mic_permission());
    Ok(())
}

#[cfg(windows)]
fn status() -> Result<()> {
    const BASE: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
    for path in [BASE.to_string(), format!(r"{BASE}\NonPackaged")] {
        println!("HKCU\\{path} Value = {:?}", consent_value(&path));
    }
    Ok(())
}

/// Giá trị `Value` (REG_SZ, "Allow" hay "Deny") của một khóa dưới HKCU; `None` nếu không đọc được.
#[cfg(windows)]
fn consent_value(path: &str) -> Option<String> {
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_SZ, RegGetValueW};
    use windows::core::{HSTRING, w};
    let mut buf = [0u16; 64];
    let mut size = std::mem::size_of_val(&buf) as u32;
    let rc = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            &HSTRING::from(path),
            w!("Value"),
            RRF_RT_REG_SZ,
            None,
            Some(buf.as_mut_ptr().cast()),
            Some(&mut size),
        )
    };
    if rc != ERROR_SUCCESS {
        return None;
    }
    let len = (size as usize / 2).saturating_sub(1);
    Some(String::from_utf16_lossy(&buf[..len]))
}

#[cfg(not(any(target_os = "macos", windows)))]
fn status() -> Result<()> {
    anyhow::bail!("chỉ hỗ trợ macOS và Windows")
}

#[cfg(target_os = "macos")]
fn request() -> Result<()> {
    let granted = audio_capture::macos_input::request_mic_permission(Duration::from_secs(60))?;
    println!("trả lời: {}", if granted { "cho phép" } else { "từ chối" });
    status()
}

#[cfg(not(target_os = "macos"))]
fn request() -> Result<()> {
    anyhow::bail!("chỉ có trên macOS")
}

fn listen(seconds: u64, id: Option<String>) -> Result<()> {
    let stats = Arc::new(CaptureStats::default());
    let mut source = audio_capture::mic_source(id, stats.clone())?;
    let (producer, mut consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    let started = Instant::now();
    if let Err(e) = source.start(producer) {
        println!("mở micro lỗi sau {} ms: {e:#}", started.elapsed().as_millis());
        return Ok(());
    }
    let format = source.format();
    println!(
        "micro: {} Hz, {} kênh (mở mất {} ms)",
        format.sample_rate,
        format.channels,
        started.elapsed().as_millis()
    );
    let per_second = format.sample_rate as usize * format.channels.max(1) as usize;
    let mut pending = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(seconds);
    let mut n = 0;
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
        let available = consumer.slots();
        if available > 0 {
            let chunk = consumer.read_chunk(available)?;
            let (a, b) = chunk.as_slices();
            pending.extend_from_slice(a);
            pending.extend_from_slice(b);
            chunk.commit_all();
        }
        while pending.len() >= per_second {
            let second: Vec<f32> = pending.drain(..per_second).collect();
            n += 1;
            let rms = (second.iter().map(|x| x * x).sum::<f32>() / second.len() as f32).sqrt();
            let zeros = second.iter().filter(|&&x| x == 0.0).count() as f32 / second.len() as f32;
            println!(
                "giây {n}: rms = {rms:.5} ({:.1} dBFS), mẫu bằng 0: {:.1}%",
                20.0 * rms.max(1e-9).log10(),
                zeros * 100.0
            );
        }
    }
    let failed = source.failed();
    source.stop();
    let [frames, inserted, _, dropped, rejected] = stats.snapshot();
    println!(
        "xong: {frames} khung, {inserted} khung im lặng chèn, {dropped} mẫu rơi, {rejected} lượt IO bị từ chối, failed = {failed}"
    );
    Ok(())
}
```

- [ ] **Step 3: `make-app.sh` đóng gói được cả hai công cụ**

Thay toàn bộ `crates/audio-capture/macos/make-app.sh` bằng:

```bash
#!/usr/bin/env bash
# Đóng gói một công cụ của audio-capture thành app có Info.plist, ký với hardened runtime và đúng entitlement của app
# thật (src-tauri/release/entitlements.plist), để quyền "Ghi âm thanh hệ thống" và quyền Micro tính cho app này.
# S1 (2026-10-04) dùng cho capture; spike nguồn micro (spec 2026-10-24-nguon-micro §6.4) dùng thêm cho mic-probe.
# Dùng: crates/audio-capture/macos/make-app.sh [capture|mic-probe]  (SIGN_IDENTITY="Developer ID Application: …" để ký thật)
set -euo pipefail
cd "$(dirname "$0")/../../.."
tool=${1:-capture}
case "$tool" in
  capture) name=Capture; bundle=dev.meetingtranslator.capture ;;
  mic-probe) name=MicProbe; bundle=dev.meetingtranslator.micprobe ;;
  *) echo "công cụ không hợp lệ: $tool (capture hay mic-probe)"; exit 1 ;;
esac
APP=target/$name.app
cargo build --release -p audio-capture --bin "$tool"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "target/release/$tool" "$APP/Contents/MacOS/$tool"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$bundle</string>
  <key>CFBundleName</key><string>$name</string>
  <key>CFBundleExecutable</key><string>$tool</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSMinimumSystemVersion</key><string>14.2</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>Meeting Translator thu âm thanh máy đang phát để hiện phụ đề dịch. Âm thanh không rời khỏi máy.</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>Spike nguồn micro: thu micro để đo. Âm thanh không rời khỏi máy.</string>
</dict>
</plist>
PLIST
codesign --force --options runtime --entitlements src-tauri/release/entitlements.plist --sign "${SIGN_IDENTITY:--}" "$APP"
codesign --verify --verbose=2 "$APP"
codesign -d --entitlements - "$APP" 2>/dev/null | grep -q audio-input && echo "entitlement audio-input: có"
# Mở qua `open` để app tự xin quyền theo Info.plist của nó; chạy thẳng binary từ Terminal thì quyền lại tính cho Terminal.
echo "Chạy thử: open -W --stdout \"$PWD/target/$tool.log\" --stderr \"$PWD/target/$tool.err\" $APP --args <tham số>"
```

- [ ] **Step 4: Build, đóng gói**

Run: `cd $W && cargo clippy -p audio-capture --all-targets -- -D warnings 2>&1 | tail -1 && cargo check -p audio-capture --target x86_64-pc-windows-msvc --all-targets 2>&1 | tail -1 && crates/audio-capture/macos/make-app.sh mic-probe 2>&1 | tail -3`
Expected: hai lệnh đầu `Finished`; lệnh cuối in `valid on disk`, `entitlement audio-input: có` và dòng "Chạy thử".

- [ ] **Step 5: Chạy `devices` (không mở micro, không hỏi quyền)**

Run: `cd $W && ./target/release/mic-probe devices`
Expected: có ít nhất một dòng bắt đầu bằng `* ` (micro mặc định).

- [ ] **Step 6: Commit**

```bash
cd $W && git add crates/audio-capture && git commit -m "feat(audio-capture): công cụ mic-probe (S-M4) và make-app.sh cho capture, mic-probe"
```

---

### Task 8: S-M4 trên macOS (cần chủ dự án)

**Files:** Tạo `bench/2026-10-24-nguon-micro/results/s-m4-macos.md`

Mỗi bước dưới đây mở micro hay hiện hộp thoại quyền trên máy của chủ dự án. **Hỏi trước khi chạy** và nói rõ sẽ hiện hộp thoại gì. Gọi app bằng:

`open -W --stdout $W/target/mp.log --stderr $W/target/mp.err $W/target/MicProbe.app --args <lệnh>`

Đọc kết quả bằng `cat $W/target/mp.log $W/target/mp.err`.

- [ ] **Step 1: Trạng thái ban đầu.** Lệnh `status`. Ghi kết quả (kỳ vọng `Undetermined` với bundle id mới).
- [ ] **Step 2: Xin quyền qua AVFoundation.** Lệnh `request`. Chủ dự án bấm **Cho phép**. Ghi: hộp thoại có hiện không, câu chữ trong hộp thoại, kết quả trả về.
- [ ] **Step 3: Nghe 5 giây.** Lệnh `listen --seconds 5`. Chủ dự án nói vài câu. Ghi tần số, số kênh, RMS từng giây, tỉ lệ mẫu bằng 0.
- [ ] **Step 4: Bị từ chối thì sao.** Chủ dự án tắt MicProbe ở System Settings › Privacy & Security › Microphone, rồi chạy lại `status` và `listen --seconds 5`. Ghi: `start` lỗi (mã OSStatus) hay chạy mà toàn số 0. Kết quả này quyết cách phát hiện thiếu quyền ở kế hoạch 02.
- [ ] **Step 5: Ký lại (giả lập cập nhật).** Chạy `crates/audio-capture/macos/make-app.sh mic-probe` (binary mới, cdhash mới), bật lại quyền nếu đã tắt, rồi chạy `status` và `listen --seconds 3`. Ghi: có bị hỏi lại không. Kỳ vọng theo memory "TCC vẫn hỏi lại sau cập nhật": có hỏi lại.
- [ ] **Step 6: Mở micro mà chưa xin quyền trước.** `tccutil reset Microphone dev.meetingtranslator.micprobe`, rồi chạy thẳng `listen --seconds 5`, bỏ qua `request`. Ghi: Core Audio có tự hiện hộp thoại không, và `start` chờ hay trả ngay.
- [ ] **Step 7: Dùng chung với app họp.** Chủ dự án mở Zoom hay Meet trong Chrome và vào phòng thử (mic bật). Chạy `listen --seconds 10` trong lúc nói. Ghi: MicProbe có tín hiệu không, và phía app họp có báo lỗi micro không.
- [ ] **Step 8: AirPods (nếu có).** Chạy `devices`, rồi `listen --seconds 10 --id <UID của AirPods>` trong lúc đang phát nhạc qua AirPods. Ghi: tần số mẫu (kỳ vọng 16 hay 24 kHz), chất lượng nhạc có tụt không, mở mất bao lâu.
- [ ] **Step 9: Ghi kết quả**

Tạo `bench/2026-10-24-nguon-micro/results/s-m4-macos.md`, mỗi bước một mục, ghi nguyên văn đầu ra, kèm ngày, macOS và máy. Cuối file có mục "Kết luận cho kế hoạch 02" trả lời ba câu:
- Phát hiện thiếu quyền bằng lỗi hay bằng số 0?
- Có cần gọi `request` trước khi `start` không?
- Cập nhật app có làm mất quyền không?

- [ ] **Step 10: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/s-m4-macos.md && git commit -m "docs(bench): kết quả S-M4 trên macOS (quyền micro, dùng chung với app họp, AirPods)"
```

---

### Task 9: `capture` ở chế độ cảnh (S-M1)

**Files:** Sửa `crates/audio-capture/src/bin/capture.rs`

- [ ] **Step 1: Viết lại công cụ**

Thay toàn bộ `crates/audio-capture/src/bin/capture.rs` bằng:

```rust
//! Công cụ cho spike S1 (macOS), S2 (Windows) và S-M1 (spec 2026-10-24-nguon-micro §6.1).
//!
//! - Không có `--mic`, `--mic-only`: thu âm thanh hệ thống N giây, ghi ra WAV 16 kHz mono, in RMS từng giây (như S1, S2).
//! - Có `--mic` hay `--mic-only`: `--out` là thư mục cảnh. Ghi riêng, chưa trộn: `playback.wav` (âm thanh máy, 16 kHz
//!   mono), `mic.wav` (micro, 16 kHz mono), `mic-raw.wav` (micro ở tần số của thiết bị, mono float32, cho lệnh
//!   `latency-bench denoise`) và `meta.json` (định dạng, số liệu, lệch giữa hai luồng, giờ thật của lời nhắc `--cues`).

use anyhow::Result;
use audio_capture::mix::Mixer2;
use audio_capture::preprocess::RING_SAMPLES;
use audio_capture::resample::{MonoResampler, TARGET_RATE};
use audio_capture::{AudioSource, CaptureStats};
use clap::Parser;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

const SILENT_RMS: f32 = 0.000_5;

#[derive(Parser)]
struct Args {
    #[arg(long, default_value_t = 20)]
    seconds: u64,
    /// File WAV (chỉ âm thanh máy), hoặc thư mục cảnh khi có `--mic` hay `--mic-only`.
    #[arg(long)]
    out: PathBuf,
    /// macOS: chỉ thu một app theo pid. Mặc định thu toàn hệ thống, trừ chính công cụ này.
    #[arg(long)]
    pid: Option<i32>,
    /// Windows: console, communications, hoặc both (chế độ tự động của §6.1: thu thêm thiết bị
    /// Communications khi nó khác thiết bị Console).
    #[arg(long, default_value = "console")]
    role: String,
    /// Thu thêm micro: `--mic` (micro mặc định, hay giá trị rỗng) hoặc `--mic <id>` (UID trên macOS, id endpoint trên
    /// Windows; xem `mic-probe devices`).
    #[arg(long, num_args = 0..=1, default_missing_value = "")]
    mic: Option<String>,
    /// Chỉ thu micro, không thu âm thanh máy.
    #[arg(long)]
    mic_only: bool,
    /// Lời nhắc theo giờ (JSON: `[{"at_s": 0, "label": "go-phim", "say": "Gõ phím laptop"}]`): in đúng giờ, ghi giờ thật
    /// (theo đồng hồ của `mic.wav`) vào `meta.json`.
    #[arg(long)]
    cues: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    if args.mic.is_some() || args.mic_only {
        scene(&args)
    } else {
        playback_only(&args)
    }
}

type Source = (Box<dyn AudioSource>, Arc<CaptureStats>);

/// Đọc hết mẫu đang có trong ring buffer vào `out` (xóa `out` trước).
fn read_all(consumer: &mut rtrb::Consumer<f32>, out: &mut Vec<f32>) -> Result<()> {
    out.clear();
    let available = consumer.slots();
    if available > 0 {
        let chunk = consumer.read_chunk(available)?;
        let (a, b) = chunk.as_slices();
        out.extend_from_slice(a);
        out.extend_from_slice(b);
        chunk.commit_all();
    }
    Ok(())
}

fn write16<W: std::io::Write + std::io::Seek>(w: &mut hound::WavWriter<W>, samples: &[f32]) -> Result<()> {
    for &s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    Ok(())
}

fn spec16() -> hound::WavSpec {
    hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    }
}

/// S1, S2: chỉ âm thanh máy, trộn hai thiết bị nếu có, một file WAV.
fn playback_only(args: &Args) -> Result<()> {
    let mut sources = make_sources(args)?;
    let stats: Vec<Arc<CaptureStats>> = sources.iter().map(|(_, s)| s.clone()).collect();
    let mut inputs = Vec::new();
    for (source, _) in sources.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        // start() có thể chờ lâu: macOS hiện hộp thoại xin quyền ở lần đầu, và với tapautostart
        // AudioDeviceStart chờ tới khi có app phát tiếng. In trước để biết đang kẹt ở đâu.
        println!("đang khởi động nguồn (macOS: có thể đang chờ trả lời hộp thoại quyền, hoặc chờ app phát tiếng)...");
        source.start(producer)?;
        let format = source.format();
        println!("nguồn: {} Hz, {} kênh", format.sample_rate, format.channels);
        inputs.push((consumer, MonoResampler::new(format.sample_rate, format.channels)?, Vec::new()));
    }
    let mut wav = hound::WavWriter::create(&args.out, spec16())?;
    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let mut second = Vec::with_capacity(TARGET_RATE as usize);
    let (mut seconds_done, mut silent_seconds) = (0u64, 0u64);
    let started = Instant::now();
    let (mut raw, mut mixed) = (Vec::new(), Vec::new());
    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (consumer, resampler, mono) in inputs.iter_mut() {
            read_all(consumer, &mut raw)?;
            resampler.process(&raw, mono)?;
        }
        mix_playback(&mut inputs, &mut mixer, &mut mixed);
        write16(&mut wav, &mixed)?;
        for &s in &mixed {
            second.push(s);
            if second.len() == TARGET_RATE as usize {
                let rms = (second.iter().map(|x| x * x).sum::<f32>() / second.len() as f32).sqrt();
                seconds_done += 1;
                if rms < SILENT_RMS {
                    silent_seconds += 1;
                }
                println!(
                    "giây {seconds_done:>3}: rms = {rms:.4}{}",
                    if rms < SILENT_RMS { "  (im lặng)" } else { "" }
                );
                second.clear();
            }
        }
    }
    for (source, _) in sources.iter_mut() {
        source.stop();
    }
    wav.finalize()?;
    println!(
        "xong: {seconds_done} giây, {silent_seconds} giây im lặng, file {}",
        args.out.display()
    );
    let elapsed = started.elapsed().as_secs_f64();
    for (i, s) in stats.iter().enumerate() {
        let [frames, inserted, skipped, dropped, rejected] = s.snapshot();
        println!(
            "nguồn {i}: {frames} khung nhận (≈ {:.0} khung/giây, so với tần số ở dòng `nguồn:`), {inserted} khung im lặng chèn thêm, {skipped} khung bỏ, {dropped} mẫu rơi, {rejected} lượt IO bị từ chối",
            frames as f64 / elapsed
        );
    }
    Ok(())
}

/// Trộn các luồng âm thanh máy (một hay hai thiết bị) vào `out` (xóa `out` trước).
fn mix_playback(inputs: &mut [(rtrb::Consumer<f32>, MonoResampler, Vec<f32>)], mixer: &mut Mixer2, out: &mut Vec<f32>) {
    out.clear();
    match inputs {
        [] => {}
        [(_, _, only)] => out.append(only),
        [(_, _, a), (_, _, b)] => {
            mixer.push_a(a);
            mixer.push_b(b);
            a.clear();
            b.clear();
            mixer.drain_into(out);
        }
        _ => unreachable!("tối đa hai thiết bị phát"),
    }
}

/// Gộp mẫu xen kẽ về mono, giữ khung dở dang cho lần sau.
struct Downmix {
    channels: usize,
    partial: Vec<f32>,
}

impl Downmix {
    fn process(&mut self, interleaved: &[f32], out: &mut Vec<f32>) {
        self.partial.extend_from_slice(interleaved);
        let whole = self.partial.len() / self.channels * self.channels;
        out.extend(
            self.partial[..whole]
                .chunks_exact(self.channels)
                .map(|f| f.iter().sum::<f32>() / self.channels as f32),
        );
        self.partial.drain(..whole);
    }
}

#[derive(Deserialize)]
struct Cue {
    at_s: f64,
    label: String,
    say: String,
}

#[derive(Serialize)]
struct CueAt {
    label: String,
    say: String,
    /// Giờ thật, tính theo số mẫu đã ghi vào `mic.wav`.
    at_ms: u64,
}

#[derive(Serialize)]
struct Format {
    sample_rate: u32,
    channels: u16,
}

#[derive(Serialize)]
struct SourceStats {
    role: &'static str,
    frames: u64,
    silence_inserted: u64,
    skipped: u64,
    dropped: u64,
    rejected_cycles: u64,
}

#[derive(Serialize)]
struct Meta {
    seconds: u64,
    mic: Format,
    playback: Option<Format>,
    /// Số mẫu 16 kHz đã ghi của mỗi file.
    playback_samples: u64,
    mic_samples: u64,
    /// Mỗi giây một cặp `[giây, số mẫu playback − số mẫu mic]`: lệch đồng hồ giữa hai luồng (spec §5.1, §6.4).
    drift: Vec<[i64; 2]>,
    cues: Vec<CueAt>,
    stats: Vec<SourceStats>,
}

fn source_stats(role: &'static str, s: &CaptureStats) -> SourceStats {
    let [frames, silence_inserted, skipped, dropped, rejected_cycles] = s.snapshot();
    SourceStats {
        role,
        frames,
        silence_inserted,
        skipped,
        dropped,
        rejected_cycles,
    }
}

/// S-M1: âm thanh máy (trừ khi `--mic-only`) và micro, mỗi luồng một file, chưa trộn.
fn scene(args: &Args) -> Result<()> {
    std::fs::create_dir_all(&args.out)?;
    let cues: Vec<Cue> = match &args.cues {
        Some(p) => serde_json::from_reader(std::fs::File::open(p)?)?,
        None => Vec::new(),
    };
    let mut playback: Vec<Source> = if args.mic_only { Vec::new() } else { make_sources(args)? };
    let mic_stats = Arc::new(CaptureStats::default());
    let mut mic = audio_capture::mic_source(args.mic.clone().filter(|s| !s.is_empty()), mic_stats.clone())?;

    let mut inputs = Vec::new();
    let mut playback_format = None;
    for (source, _) in playback.iter_mut() {
        let (producer, consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
        println!("đang khởi động âm thanh máy (macOS: có thể đang chờ app phát tiếng)...");
        source.start(producer)?;
        let f = source.format();
        println!("âm thanh máy: {} Hz, {} kênh", f.sample_rate, f.channels);
        playback_format = Some(Format {
            sample_rate: f.sample_rate,
            channels: f.channels,
        });
        inputs.push((consumer, MonoResampler::new(f.sample_rate, f.channels)?, Vec::new()));
    }
    let (producer, mut mic_consumer) = rtrb::RingBuffer::new(RING_SAMPLES);
    println!("đang mở micro (macOS: lần đầu có thể hỏi quyền Micro)...");
    mic.start(producer)?;
    let mf = mic.format();
    println!("micro: {} Hz, {} kênh", mf.sample_rate, mf.channels);
    let mut mic_resampler = MonoResampler::new(mf.sample_rate, mf.channels)?;
    let mut downmix = Downmix {
        channels: mf.channels.max(1) as usize,
        partial: Vec::new(),
    };

    let raw_spec = hound::WavSpec {
        channels: 1,
        sample_rate: mf.sample_rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut playback_wav = if inputs.is_empty() {
        None
    } else {
        Some(hound::WavWriter::create(args.out.join("playback.wav"), spec16())?)
    };
    let mut mic_wav = hound::WavWriter::create(args.out.join("mic.wav"), spec16())?;
    let mut raw_wav = hound::WavWriter::create(args.out.join("mic-raw.wav"), raw_spec)?;

    let mut mixer = Mixer2::new(TARGET_RATE as usize / 10);
    let (mut raw, mut mixed, mut mic_mono, mut mic16) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    let (mut playback_samples, mut mic_samples) = (0u64, 0u64);
    let (mut next_cue, mut cues_at) = (0usize, Vec::new());
    let (mut drift, mut next_drift) = (Vec::new(), 1u64);
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(args.seconds) {
        std::thread::sleep(Duration::from_millis(20));
        for (consumer, resampler, mono) in inputs.iter_mut() {
            read_all(consumer, &mut raw)?;
            resampler.process(&raw, mono)?;
        }
        mix_playback(&mut inputs, &mut mixer, &mut mixed);
        if let Some(w) = playback_wav.as_mut() {
            write16(w, &mixed)?;
        }
        playback_samples += mixed.len() as u64;

        read_all(&mut mic_consumer, &mut raw)?;
        mic_mono.clear();
        downmix.process(&raw, &mut mic_mono);
        for &s in &mic_mono {
            raw_wav.write_sample(s)?;
        }
        mic16.clear();
        mic_resampler.process(&raw, &mut mic16)?;
        write16(&mut mic_wav, &mic16)?;
        mic_samples += mic16.len() as u64;

        let elapsed = started.elapsed().as_secs_f64();
        while next_cue < cues.len() && elapsed >= cues[next_cue].at_s {
            let c = &cues[next_cue];
            println!("\n▶▶ {}\n", c.say);
            cues_at.push(CueAt {
                label: c.label.clone(),
                say: c.say.clone(),
                at_ms: mic_samples * 1000 / TARGET_RATE as u64,
            });
            next_cue += 1;
        }
        if !inputs.is_empty() && elapsed >= next_drift as f64 {
            drift.push([next_drift as i64, playback_samples as i64 - mic_samples as i64]);
            next_drift += 1;
        }
    }
    for (source, _) in playback.iter_mut() {
        source.stop();
    }
    mic.stop();
    if let Some(w) = playback_wav {
        w.finalize()?;
    }
    mic_wav.finalize()?;
    raw_wav.finalize()?;
    let mut stats: Vec<SourceStats> = playback.iter().map(|(_, s)| source_stats("playback", s)).collect();
    stats.push(source_stats("mic", &mic_stats));
    let meta = Meta {
        seconds: args.seconds,
        mic: Format {
            sample_rate: mf.sample_rate,
            channels: mf.channels,
        },
        playback: playback_format,
        playback_samples,
        mic_samples,
        drift,
        cues: cues_at,
        stats,
    };
    std::fs::write(args.out.join("meta.json"), serde_json::to_string_pretty(&meta)?)?;
    println!(
        "xong: {} giây micro, {} giây âm thanh máy, thư mục {}",
        mic_samples / TARGET_RATE as u64,
        playback_samples / TARGET_RATE as u64,
        args.out.display()
    );
    Ok(())
}

#[cfg(target_os = "macos")]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::macos::{MacTapSource, TapTarget};
    let target = args
        .pid
        .map_or(TapTarget::SystemExceptSelf, |pid| TapTarget::Processes(vec![pid]));
    let stats = Arc::new(CaptureStats::default());
    Ok(vec![(Box::new(MacTapSource::new(target, stats.clone())), stats)])
}

#[cfg(windows)]
fn make_sources(args: &Args) -> Result<Vec<Source>> {
    use audio_capture::windows::{Endpoint, LoopbackSource, Role, default_endpoint_id};
    let roles = match args.role.as_str() {
        "console" => vec![Role::Console],
        "communications" => vec![Role::Communications],
        "both" if default_endpoint_id(Role::Console)? == default_endpoint_id(Role::Communications)? => {
            println!("Console và Communications là cùng một thiết bị, chỉ thu một lần");
            vec![Role::Console]
        }
        "both" => vec![Role::Console, Role::Communications],
        other => anyhow::bail!("role không hợp lệ: {other}"),
    };
    Ok(roles
        .into_iter()
        .map(|role| {
            let stats = Arc::new(CaptureStats::default());
            (
                Box::new(LoopbackSource::new(Endpoint::Default(role), stats.clone())) as Box<dyn AudioSource>,
                stats,
            )
        })
        .collect())
}

#[cfg(not(any(target_os = "macos", windows)))]
fn make_sources(_args: &Args) -> Result<Vec<Source>> {
    anyhow::bail!("chỉ hỗ trợ macOS và Windows")
}
```

- [ ] **Step 2: Build cả hai nền tảng, clippy**

Run: `cd $W && cargo clippy -p audio-capture --all-targets -- -D warnings 2>&1 | tail -1 && cargo clippy -p audio-capture --target x86_64-pc-windows-msvc --all-targets -- -D warnings 2>&1 | tail -1`
Expected: hai dòng `Finished`.

- [ ] **Step 3: Thử nhanh không cần quyền mới**

Run: `cd $W && ./target/debug/capture --help | grep -E "mic|cues"`
Expected: có `--mic`, `--mic-only`, `--cues`. Chưa thu thật ở bước này: Task 16 thu qua `Capture.app`.

- [ ] **Step 4: Commit**

```bash
cd $W && git add crates/audio-capture/src/bin/capture.rs && git commit -m "feat(audio-capture): capture ghi cảnh hai luồng chưa trộn, mic-raw, meta.json, lời nhắc"
```

---

### Task 10: Dựng track, lời nhắc, script thu trên macOS

**Files:**
- Tạo: `bench/2026-10-24-nguon-micro/build_scene.py`
- Tạo: `bench/2026-10-24-nguon-micro/cues/s6-on.json`, `bench/2026-10-24-nguon-micro/cues/s7-on.json`
- Tạo: `bench/2026-10-24-nguon-micro/run_scene_macos.sh`

- [ ] **Step 1: `build_scene.py`**

```python
"""Dựng track cho các cảnh thu của spike nguồn micro (spec 2026-10-24-nguon-micro §6.1, §6.2).

Dùng (từ gốc worktree):
  uv run --no-project --python 3.12 --with "numpy==2.5.4" python bench/2026-10-24-nguon-micro/build_scene.py \
    --fleurs /Users/dtphong/Desktop/software_business/ai-translator/bench/phase0/data/asr/manifest.jsonl \
    --out bench/2026-10-24-nguon-micro/data/tracks

Mỗi cảnh một thư mục con:
- `online.wav`: tiếng "người online" (phát bằng một tiến trình mà tap thu), 16 kHz mono 16-bit;
- `room.wav`: tiếng "người trong phòng" (phát ra loa mà tap không thu, hay từ điện thoại), cùng độ dài;
- `schedule.json`: `{lead_ms, track_ms, items: [{source, id, lang, ref, start_ms, end_ms, short}]}`, giờ tính từ đầu track.

Cảnh (mỗi track có 2 giây im lặng ở đầu):
- `s1-luot`: online và room nói lần lượt, nghỉ 1,5–3 giây (cảnh 1, và cảnh 3 với tai nghe).
- `s2-chong`: mỗi câu room bắt đầu khi câu online trước còn một nửa: khoảng 30% thời gian nói chồng (cảnh 2).
- `s1w-online`: chỉ online, cho Windows và để đo độ trễ vọng.
- `s4-phong`: chỉ room (cảnh 4: điện thoại ở 1 m, rồi 3 m).
- `s7-phong-ngan`: room gồm câu FLEURS xen câu trả lời rất ngắn dựng bằng `say` (cảnh 7).
Clip FLEURS: băng rộng, dài 4–12 giây, chọn cố định theo seed. Năm tiếng: en, zh, ja, ko, vi.
"""
import argparse
import json
import os
import random
import subprocess
import tempfile
import wave

import numpy as np

RATE = 16_000
LEAD_MS = 2_000
LANGS = ["en", "zh", "ja", "ko", "vi"]
# Locale của giọng `say` cho từng tiếng.
LOCALES = {"en": "en_US", "vi": "vi_VN", "zh": "zh_CN", "ja": "ja_JP", "ko": "ko_KR"}
SHORT = {
    "en": ["OK.", "Yes.", "No.", "Sure.", "Right.", "Got it.", "Agreed.", "Exactly."],
    "vi": ["Vâng.", "Đúng rồi.", "Được.", "Không.", "Ừ.", "Đồng ý.", "Chuẩn.", "Có."],
    "zh": ["好的。", "对。", "是的。", "没问题。", "可以。", "不是。", "明白。", "同意。"],
    "ja": ["はい。", "そうです。", "いいえ。", "了解です。", "大丈夫です。", "なるほど。", "賛成です。", "分かりました。"],
    "ko": ["네.", "맞아요.", "아니요.", "좋아요.", "알겠습니다.", "그래요.", "동의해요.", "괜찮아요."],
}


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE and w.getnchannels() == 1 and w.getsampwidth() == 2, path
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)


def write_wav(path, samples):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(samples.astype(np.int16).tobytes())


def load_fleurs(manifest):
    base = os.path.dirname(manifest)
    clips = {lang: [] for lang in LANGS}
    with open(manifest, encoding="utf-8") as f:
        for line in f:
            c = json.loads(line)
            if c["lang"] in clips and not c.get("narrowband") and 4.0 <= c["duration_s"] <= 12.0:
                clips[c["lang"]].append({**c, "path": os.path.join(base, c["path"])})
    return clips


def pick(clips, rng, per_lang):
    out = []
    for lang in LANGS:
        out += rng.sample(clips[lang], per_lang)
    rng.shuffle(out)
    return out


def voice_for(lang):
    listing = subprocess.run(["say", "-v", "?"], capture_output=True, text=True, check=True).stdout
    for line in listing.splitlines():
        if LOCALES[lang] in line:
            return line.split("  ")[0].strip()
    raise SystemExit(f"máy không có giọng `say` cho {LOCALES[lang]}")


def synth(text, lang, tmp):
    aiff = os.path.join(tmp, "s.aiff")
    out = os.path.join(tmp, "s.wav")
    subprocess.run(["say", "-v", voice_for(lang), "-o", aiff, text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, out], check=True)
    return read_wav(out)


class Track:
    """Hai track cùng độ dài và lịch của mọi clip."""

    def __init__(self):
        self.parts = {"online": [], "room": []}
        self.items = []

    def place(self, source, audio, start_ms, meta):
        self.parts[source].append((start_ms, audio))
        end_ms = start_ms + len(audio) * 1000 // RATE
        self.items.append({"source": source, **meta, "start_ms": start_ms, "end_ms": end_ms})
        return end_ms

    def write(self, folder):
        os.makedirs(folder, exist_ok=True)
        track_ms = max(i["end_ms"] for i in self.items) + 2_000
        for source in ("online", "room"):
            buf = np.zeros(track_ms * RATE // 1000, dtype=np.int32)
            for start_ms, audio in self.parts[source]:
                s = start_ms * RATE // 1000
                buf[s : s + len(audio)] += audio
            write_wav(os.path.join(folder, f"{source}.wav"), np.clip(buf, -32768, 32767))
        with open(os.path.join(folder, "schedule.json"), "w", encoding="utf-8") as f:
            json.dump({"lead_ms": LEAD_MS, "track_ms": track_ms, "items": self.items}, f, ensure_ascii=False, indent=1)
        print(f"{folder}: {track_ms / 1000:.0f} giây, {len(self.items)} clip")


def fleurs_meta(c):
    return {"id": c["id"], "lang": c["lang"], "ref": c["ref"], "short": False}


def turn_taking(online, room, rng, overlap):
    t = Track()
    now = LEAD_MS
    for a, b in zip(online, room):
        audio_a = read_wav(a["path"])
        end_a = t.place("online", audio_a, now, fleurs_meta(a))
        len_a = end_a - now
        start_b = end_a - len_a // 2 if overlap else end_a + rng.randint(1_500, 3_000)
        end_b = t.place("room", read_wav(b["path"]), start_b, fleurs_meta(b))
        now = max(end_a, end_b) + rng.randint(1_500, 3_000)
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fleurs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20261024)
    args = ap.parse_args()
    clips = load_fleurs(args.fleurs)
    rng = random.Random(args.seed)

    online, room = pick(clips, rng, 3), pick(clips, rng, 3)
    turn_taking(online, room, rng, overlap=False).write(os.path.join(args.out, "s1-luot"))
    online2, room2 = pick(clips, rng, 3), pick(clips, rng, 3)
    turn_taking(online2, room2, rng, overlap=True).write(os.path.join(args.out, "s2-chong"))

    t = Track()
    now = LEAD_MS
    for c in pick(clips, rng, 5):
        now = t.place("online", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 3_000)
    t.write(os.path.join(args.out, "s1w-online"))

    t = Track()
    now = LEAD_MS
    for c in pick(clips, rng, 5):
        now = t.place("room", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 3_000)
    t.write(os.path.join(args.out, "s4-phong"))

    with tempfile.TemporaryDirectory() as tmp:
        shorts = [(lang, text) for lang in LANGS for text in SHORT[lang]]
        rng.shuffle(shorts)
        long_clips = [c for c in pick(clips, rng, 2) if c["lang"] != "vi"]
        t = Track()
        now = LEAD_MS
        for i, (lang, text) in enumerate(shorts):
            audio = synth(text, lang, tmp)
            now = t.place("room", audio, now, {"id": f"short-{i}", "lang": lang, "ref": text, "short": True})
            now += rng.randint(1_500, 2_500)
            if i % 5 == 4 and long_clips:
                c = long_clips.pop()
                now = t.place("room", read_wav(c["path"]), now, fleurs_meta(c)) + rng.randint(1_500, 2_500)
        t.write(os.path.join(args.out, "s7-phong-ngan"))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy và kiểm**

Run: `cd $W && uv run --no-project --python 3.12 --with "numpy==2.5.4" python bench/2026-10-24-nguon-micro/build_scene.py --fleurs $M/bench/phase0/data/asr/manifest.jsonl --out bench/2026-10-24-nguon-micro/data/tracks`
Expected: năm dòng `…: N giây, K clip`. `s1-luot` và `s2-chong` khoảng 4–6 phút, 30 clip; `s7-phong-ngan` có 48 clip. Nghe thử vài giây đầu của `s7-phong-ngan/room.wav` (`afplay`) để chắc giọng `say` đúng tiếng.

- [ ] **Step 3: Lời nhắc**

`bench/2026-10-24-nguon-micro/cues/s6-on.json` (cảnh 6, 1100 giây, không ai nói):

```json
[
  {"at_s": 0, "label": "yen-lang", "say": "Chuẩn bị. Giữ phòng yên lặng 10 giây."},
  {"at_s": 10, "label": "go-phim-laptop", "say": "Gõ phím laptop liên tục như đang soạn văn bản (2 phút)."},
  {"at_s": 130, "label": "ban-phim-co", "say": "Gõ bàn phím cơ; không có thì gõ mạnh phím laptop (2 phút)."},
  {"at_s": 250, "label": "bam-but", "say": "Bấm bút bi tách tách, không nói (2 phút)."},
  {"at_s": 370, "label": "viet-but", "say": "Viết bút trên giấy, gạch, chấm câu (2 phút)."},
  {"at_s": 490, "label": "go-ban", "say": "Gõ ngón tay, gõ bút xuống bàn (2 phút)."},
  {"at_s": 610, "label": "lat-giay", "say": "Lật giấy, vò giấy, xếp giấy (2 phút)."},
  {"at_s": 730, "label": "dat-coc", "say": "Đặt cốc, đặt điện thoại, đặt đồ xuống bàn (2 phút)."},
  {"at_s": 850, "label": "keo-ghe", "say": "Kéo ghế, đứng lên ngồi xuống, bước chân (2 phút)."},
  {"at_s": 970, "label": "quat", "say": "Bật quạt hay điều hòa, không làm gì khác (2 phút)."},
  {"at_s": 1090, "label": "het", "say": "Xong. Chờ công cụ tự dừng."}
]
```

`bench/2026-10-24-nguon-micro/cues/s7-on.json` (cảnh 7, đổi loại tiếng ồn mỗi phút trong lúc điện thoại phát track):

```json
[
  {"at_s": 0, "label": "bat-dau", "say": "Bấm phát room.wav trên điện thoại (đặt cách laptop 1 m)."},
  {"at_s": 5, "label": "go-phim-laptop", "say": "Vừa nghe vừa gõ phím laptop liên tục."},
  {"at_s": 65, "label": "bam-but", "say": "Đổi sang bấm bút bi."},
  {"at_s": 125, "label": "go-ban", "say": "Đổi sang gõ ngón tay, gõ bút xuống bàn."},
  {"at_s": 185, "label": "go-phim-laptop", "say": "Đổi lại gõ phím laptop."},
  {"at_s": 245, "label": "bam-but", "say": "Đổi sang bấm bút bi."},
  {"at_s": 305, "label": "go-ban", "say": "Đổi sang gõ bàn tới hết."}
]
```

- [ ] **Step 4: `run_scene_macos.sh`**

```bash
#!/usr/bin/env bash
# Thu một cảnh của spike nguồn micro trên macOS (spec 2026-10-24-nguon-micro §6.1, §6.2) bằng target/Capture.app.
# - Có --tracks: phát online.wav và room.wav bằng hai tiến trình afplay; tap CHỈ thu tiến trình phát online (--pid), nên
#   tiếng room chỉ vào micro qua loa. --room-from-phone: không phát room.wav (chủ dự án phát từ điện thoại).
# - --mic-only: không thu âm thanh máy (cảnh 4, 6, 7); khi đó online.wav không được phát.
# - Thời lượng: theo schedule.json (+6 giây), hay theo --seconds.
# Sau khi thu: chép schedule.json, online.wav, room.wav vào thư mục cảnh để score_mix.py căn và chấm.
# Dùng: bench/2026-10-24-nguon-micro/run_scene_macos.sh <thư mục cảnh ra> [--tracks DIR] [--cues FILE] [--mic ID]
#         [--room-from-phone] [--mic-only] [--seconds N]
set -euo pipefail
cd "$(dirname "$0")/../.."
out=$1; shift
tracks=""; cues=""; mic=""; room_phone=0; mic_only=0; seconds=""
while [ $# -gt 0 ]; do
  case "$1" in
    --tracks) tracks=$2; shift 2 ;;
    --cues) cues=$2; shift 2 ;;
    --mic) mic=$2; shift 2 ;;
    --room-from-phone) room_phone=1; shift ;;
    --mic-only) mic_only=1; shift ;;
    --seconds) seconds=$2; shift 2 ;;
    *) echo "tham số lạ: $1"; exit 1 ;;
  esac
done
app=target/Capture.app
[ -d "$app" ] || { echo "chưa có $app: chạy crates/audio-capture/macos/make-app.sh capture"; exit 1; }
if [ -z "$seconds" ]; then
  [ -n "$tracks" ] || { echo "cần --tracks hay --seconds"; exit 1; }
  seconds=$(python3 -c "import json,sys; print(int(json.load(open(sys.argv[1]))['track_ms']/1000)+6)" "$tracks/schedule.json")
fi
mkdir -p "$out"
args=(--seconds "$seconds" --out "$PWD/$out" --mic "$mic")
pids=()
if [ -n "$tracks" ] && [ "$mic_only" = 0 ]; then
  afplay "$tracks/online.wav" & online=$!; pids+=("$online")
  args+=(--pid "$online")
fi
if [ "$mic_only" = 1 ]; then args+=(--mic-only); fi
if [ -n "$tracks" ] && [ "$room_phone" = 0 ]; then
  afplay "$tracks/room.wav" & pids+=("$!")
fi
[ -n "$cues" ] && args+=(--cues "$PWD/$cues")
# afplay phải đã mở đường ra âm thanh thì Core Audio mới có process object để tap theo pid.
sleep 0.5
echo "đang thu $seconds giây vào $out (Ctrl+C để hủy)"
open -W --stdout "$PWD/$out/capture.log" --stderr "$PWD/$out/capture.err" "$app" --args "${args[@]}"
for p in "${pids[@]}"; do wait "$p" || true; done
if [ -n "$tracks" ]; then cp "$tracks/schedule.json" "$tracks/online.wav" "$tracks/room.wav" "$out/"; fi
tail -3 "$out/capture.log"
```

Run: `cd $W && chmod +x bench/2026-10-24-nguon-micro/run_scene_macos.sh && bash -n bench/2026-10-24-nguon-micro/run_scene_macos.sh && python3 -m json.tool bench/2026-10-24-nguon-micro/cues/s6-on.json >/dev/null && python3 -m json.tool bench/2026-10-24-nguon-micro/cues/s7-on.json >/dev/null && echo ok`
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro && git commit -m "feat(bench): dựng track, lời nhắc tiếng ồn và script thu cảnh cho spike nguồn micro"
```

---

### Task 11: Tiện ích WAV của `latency-bench` và lệnh `align`

**Files:**
- Tạo: `crates/latency-bench/src/wavio.rs`
- Sửa: `crates/latency-bench/src/main.rs`, `crates/latency-bench/Cargo.toml`

- [ ] **Step 1: Dependency (theo §6.12)**

Trong `crates/latency-bench/Cargo.toml`, mục `[dependencies]` thêm (giữ thứ tự chữ cái):

```toml
audio-capture = { path = "../audio-capture" }
# RNNoise bằng Rust (BSD-3-Clause), chỉ để đo lớp 2 của spike nguồn micro; tắt feature mặc định (công cụ dòng lệnh).
nnnoiseless = { version = "0.5.2", default-features = false }
rubato.workspace = true
# AEC3 của WebRTC bằng Rust (BSD-3-Clause), chỉ để đo phương án C của spike nguồn micro.
sonora = "0.2.0"
```

Run: `cd $W && cargo build -p latency-bench 2>&1 | tail -2 && cargo tree -p latency-bench -d 2>&1 | head -20`
Expected: build `Finished`. Đọc danh sách trùng phiên bản: không được có hai bản `ggml` hay hai bản của cùng crate có mã native. `rustfft` hai bản (`rubato` và `nnnoiseless`) chấp nhận được vì `latency-bench` không vào app; ghi nhận ở README (Task 15).

- [ ] **Step 2: Viết test trước**

Tạo `crates/latency-bench/src/wavio.rs`:

```rust
//! Đọc, ghi WAV và căn thẳng hàng hai bản thu cho các lệnh đo của spike nguồn micro (spec 2026-10-24-nguon-micro §6.3).

use anyhow::{Context, Result, anyhow, bail};
use std::path::{Path, PathBuf};

#[cfg(test)]
mod tests {
    use super::*;

    /// Tín hiệu giả ngẫu nhiên có đường bao thay đổi (các đợt tiếng ồn), tất định.
    fn bursts(n: usize) -> Vec<f32> {
        let mut state = 12345u32;
        (0..n)
            .map(|i| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                let noise = (state >> 8) as f32 / (1u32 << 24) as f32 - 0.5;
                if (i / 2_000) % 3 == 0 { noise * 0.6 } else { noise * 0.02 }
            })
            .collect()
    }

    #[test]
    fn best_lag_finds_a_delay_and_an_advance() {
        let reference = bursts(160_000);
        let mut delayed = vec![0.0; 320];
        delayed.extend_from_slice(&reference);
        assert_eq!(best_lag(&reference, &delayed, 8_000), 320);
        assert_eq!(best_lag(&delayed, &reference, 8_000), -320);
    }

    #[test]
    fn shift_undoes_the_lag() {
        let x: Vec<f32> = (0..10).map(|i| i as f32).collect();
        assert_eq!(shift(x.clone(), 2, 10), vec![2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 0.0, 0.0]);
        assert_eq!(shift(x, -2, 5), vec![0.0, 0.0, 0.0, 1.0, 2.0]);
    }

    #[test]
    fn resample_keeps_pitch_level_and_length() {
        let input: Vec<f32> = (0..48_000)
            .map(|i| 0.5 * (2.0 * std::f32::consts::PI * 1_000.0 * i as f32 / 48_000.0).sin())
            .collect();
        let out = resample(&input, 48_000, 16_000).unwrap();
        assert_eq!(out.len(), 16_000);
        let rms = |x: &[f32]| (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt();
        let ratio = rms(&out[1_000..15_000]) / rms(&input);
        assert!((0.98..=1.02).contains(&ratio), "{ratio}");
        assert_eq!(resample(&input, 48_000, 48_000).unwrap(), input);
    }

    #[test]
    fn wav16_round_trip() {
        let dir = std::env::temp_dir().join(format!("wavio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("x.wav");
        write_wav16(&path, &[0.0, 0.5, -0.5]).unwrap();
        let (x, rate) = read_wav_mono(&path).unwrap();
        assert_eq!(rate, 16_000);
        assert!((x[1] - 0.5).abs() < 1e-3 && (x[2] + 0.5).abs() < 1e-3);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
```

Trong `crates/latency-bench/src/main.rs`, thêm khai báo module cạnh các `mod` hiện có:

```rust
mod wavio;
```

Run: `cd $W && cargo test -p latency-bench wavio 2>&1 | tail -4`
Expected: lỗi biên dịch (`cannot find function 'best_lag'`).

- [ ] **Step 3: Viết code**

Thêm vào `wavio.rs`, trên `#[cfg(test)]`:

```rust
/// Đọc WAV bất kỳ tần số (16 hay 24 bit nguyên, hay 32 bit thực), gộp các kênh về mono. Trả mẫu trong [-1, 1] và tần số.
pub fn read_wav_mono(path: &Path) -> Result<(Vec<f32>, u32)> {
    let mut reader = hound::WavReader::open(path).with_context(|| format!("không mở được {}", path.display()))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let interleaved: Vec<f32> = match (spec.sample_format, spec.bits_per_sample) {
        (hound::SampleFormat::Float, 32) => reader.samples::<f32>().collect::<Result<_, _>>()?,
        (hound::SampleFormat::Int, 16) => reader
            .samples::<i16>()
            .map(|s| s.map(|v| v as f32 / 32_768.0))
            .collect::<Result<_, _>>()?,
        (hound::SampleFormat::Int, 24) => reader
            .samples::<i32>()
            .map(|s| s.map(|v| v as f32 / 8_388_608.0))
            .collect::<Result<_, _>>()?,
        (format, bits) => bail!("{}: định dạng {format:?} {bits} bit chưa hỗ trợ", path.display()),
    };
    let mono = interleaved
        .chunks_exact(channels)
        .map(|f| f.iter().sum::<f32>() / channels as f32)
        .collect();
    Ok((mono, spec.sample_rate))
}

/// Ghi WAV 16 kHz mono 16-bit (định dạng của `mic.wav`, `playback.wav`).
pub fn write_wav16(path: &Path, samples: &[f32]) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut w = hound::WavWriter::create(path, spec).with_context(|| format!("không tạo được {}", path.display()))?;
    for &s in samples {
        w.write_sample((s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)?;
    }
    w.finalize()?;
    Ok(())
}

/// Ghi WAV mono float32 ở tần số `rate` (đầu vào 48 kHz cho DeepFilterNet).
pub fn write_wav_f32(path: &Path, samples: &[f32], rate: u32) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: rate,
        bits_per_sample: 32,
        sample_format: hound::SampleFormat::Float,
    };
    let mut w = hound::WavWriter::create(path, spec).with_context(|| format!("không tạo được {}", path.display()))?;
    for &s in samples {
        w.write_sample(s)?;
    }
    w.finalize()?;
    Ok(())
}

/// Resample cả một đoạn mono (bộ lọc FFT của `rubato`, như app). Bù độ trễ của bộ lọc; độ dài ra = độ dài vào × to / from.
pub fn resample(input: &[f32], from: u32, to: u32) -> Result<Vec<f32>> {
    use rubato::audioadapter_buffers::direct::InterleavedSlice;
    use rubato::{Fft, FixedSync, Resampler, WindowFunction};
    if from == to {
        return Ok(input.to_vec());
    }
    let block = (from / 100) as usize;
    let mut r = Fft::<f32>::new_custom(
        from as usize,
        to as usize,
        block,
        1,
        1,
        WindowFunction::BlackmanHarris2,
        FixedSync::Input,
    )
    .map_err(|e| anyhow!("không tạo được bộ resample: {e}"))?;
    let delay = r.output_delay();
    let mut padded = input.to_vec();
    padded.resize(input.len().div_ceil(block) * block + 2 * block, 0.0);
    let mut out = Vec::with_capacity(padded.len() * to as usize / from as usize + block);
    let mut scratch = vec![0f32; r.output_frames_max()];
    for chunk in padded.chunks_exact(block) {
        let inp = InterleavedSlice::new(chunk, 1, block).map_err(|e| anyhow!("{e}"))?;
        let cap = scratch.len();
        let mut outp = InterleavedSlice::new_mut(&mut scratch, 1, cap).map_err(|e| anyhow!("{e}"))?;
        let (_, written) = r
            .process_into_buffer(&inp, &mut outp, None)
            .map_err(|e| anyhow!("resample lỗi: {e}"))?;
        out.extend_from_slice(&scratch[..written]);
    }
    let want = input.len() * to as usize / from as usize;
    Ok(out.into_iter().skip(delay).take(want).collect())
}

/// Độ lệch (mẫu, bội của 16) của `signal` so với `reference`: `signal[n + lag] ≈ reference[n]`. Tìm trong
/// [−max_lag, max_lag] trên đường bao biên độ (trung bình |x| mỗi 1 ms) của 60 giây đầu.
pub fn best_lag(reference: &[f32], signal: &[f32], max_lag: usize) -> isize {
    const HOP: usize = 16;
    let envelope = |x: &[f32]| -> Vec<f32> {
        x.chunks(HOP)
            .take(60_000)
            .map(|c| c.iter().map(|v| v.abs()).sum::<f32>() / c.len() as f32)
            .collect()
    };
    let (r, s) = (envelope(reference), envelope(signal));
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len().max(1) as f32;
    let (mr, ms) = (mean(&r), mean(&s));
    let max = (max_lag / HOP) as isize;
    let mut best = (0isize, f32::MIN);
    for lag in -max..=max {
        let (r0, s0) = if lag >= 0 { (0, lag as usize) } else { ((-lag) as usize, 0) };
        let n = r.len().saturating_sub(r0).min(s.len().saturating_sub(s0));
        if n == 0 {
            continue;
        }
        let score = (0..n).map(|i| (r[r0 + i] - mr) * (s[s0 + i] - ms)).sum::<f32>() / n as f32;
        if score > best.1 {
            best = (lag, score);
        }
    }
    best.0 * HOP as isize
}

/// Bù độ lệch tìm bằng [`best_lag`] rồi cắt hay đệm số 0 cho đủ `len` mẫu.
pub fn shift(signal: Vec<f32>, lag: isize, len: usize) -> Vec<f32> {
    let mut out: Vec<f32> = if lag >= 0 {
        signal.into_iter().skip(lag as usize).collect()
    } else {
        std::iter::repeat_n(0.0, (-lag) as usize).chain(signal).collect()
    };
    out.resize(len, 0.0);
    out
}

/// `latency-bench align`: căn một bản đã xử lý ngoài (ví dụ đầu ra của DeepFilterNet) thẳng hàng với `mic.wav`.
#[derive(clap::Args)]
pub struct AlignArgs {
    /// WAV chuẩn 16 kHz mono (`mic.wav` của cảnh).
    #[arg(long)]
    reference: PathBuf,
    /// WAV cần căn, tần số bất kỳ.
    #[arg(long)]
    input: PathBuf,
    /// WAV 16 kHz mono 16-bit, dài bằng `--reference`.
    #[arg(long)]
    out: PathBuf,
    #[arg(long, default_value_t = 500)]
    max_lag_ms: usize,
}

pub fn run_align(args: AlignArgs) -> Result<()> {
    let (reference, rate) = read_wav_mono(&args.reference)?;
    if rate != 16_000 {
        bail!("{} phải là 16 kHz", args.reference.display());
    }
    let (input, input_rate) = read_wav_mono(&args.input)?;
    let input = resample(&input, input_rate, 16_000)?;
    let lag = best_lag(&reference, &input, args.max_lag_ms * 16);
    println!("lệch {lag} mẫu ({} ms), đã bù", lag / 16);
    write_wav16(&args.out, &shift(input, lag, reference.len()))
}
```

Trong `main.rs`, thêm vào `enum Command`:

```rust
    /// Căn một bản thu đã xử lý ngoài thẳng hàng với `mic.wav` (spike nguồn micro).
    Align(wavio::AlignArgs),
```

và nhánh tương ứng trong `match` chạy lệnh (cạnh các nhánh hiện có):

```rust
        Command::Align(a) => wavio::run_align(a),
```

- [ ] **Step 4: Chạy test, clippy**

Run: `cd $W && cargo test -p latency-bench wavio 2>&1 | tail -3 && cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `4 passed`; clippy `Finished`. Nếu `rubato` báo khác API (ví dụ không có `output_delay`), đối chiếu `crates/audio-capture/src/resample.rs` (cùng bản `rubato`) và sửa cho khớp, giữ hành vi.

- [ ] **Step 5: Commit**

```bash
cd $W && git add crates/latency-bench Cargo.lock && git commit -m "feat(latency-bench): tiện ích WAV, resample, căn thẳng hàng và lệnh align"
```

---

### Task 12: Lệnh `denoise` (RNNoise, lớp 2)

**Files:**
- Tạo: `crates/latency-bench/src/denoise.rs`
- Sửa: `crates/latency-bench/src/main.rs`

- [ ] **Step 1: Viết test trước**

Tạo `crates/latency-bench/src/denoise.rs`:

```rust
//! `latency-bench denoise` (spec 2026-10-24-nguon-micro §5.7 lớp 2, §6.3): lọc ồn micro bằng RNNoise (`nnnoiseless`) cho
//! bản VAD. Đọc `mic-raw.wav` (tần số của thiết bị, do `capture --mic` ghi), đưa về 48 kHz, lọc từng khung 10 ms, đưa về
//! 16 kHz, căn thẳng hàng với `mic.wav` và ghi WAV 16 kHz mono 16-bit dài bằng `mic.wav`. In thêm chi phí CPU (thời gian xử
//! lý chia thời lượng âm thanh).

use crate::wavio::{best_lag, read_wav_mono, resample, shift, write_wav16, write_wav_f32};
use anyhow::Result;
use std::path::PathBuf;
use std::time::Instant;

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn output_has_the_input_length_and_the_first_frame_is_silent() {
        let input = vec![0.1f32; 48_000];
        let out = rnnoise(&input);
        assert_eq!(out.len(), input.len());
        assert!(out[..480].iter().all(|&v| v == 0.0));
    }

    #[test]
    fn steady_noise_is_reduced() {
        // Tiếng ồn trắng đều 4 giây: RNNoise phải hạ rõ sau khi thích nghi.
        let mut state = 7u32;
        let noise: Vec<f32> = (0..192_000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((state >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.2
            })
            .collect();
        let out = rnnoise(&noise);
        let tail = 96_000..192_000;
        assert!(rms(&out[tail.clone()]) < 0.5 * rms(&noise[tail]), "{} / {}", rms(&out[96_000..]), rms(&noise[96_000..]));
    }
}
```

Trong `main.rs` thêm `mod denoise;`.

Run: `cd $W && cargo test -p latency-bench denoise 2>&1 | tail -4`
Expected: lỗi biên dịch `cannot find function 'rnnoise'`.

- [ ] **Step 2: Viết code**

Thêm vào `denoise.rs`, trên `#[cfg(test)]`:

```rust
#[derive(clap::Args)]
pub struct DenoiseArgs {
    /// `mic-raw.wav` của cảnh.
    #[arg(long)]
    input: PathBuf,
    /// `mic.wav` của cảnh: đầu ra được căn thẳng hàng với file này và dài bằng nó.
    #[arg(long)]
    reference: PathBuf,
    /// WAV kết quả, ví dụ `mic-rnnoise.wav`.
    #[arg(long)]
    out: PathBuf,
    /// Ghi thêm bản 48 kHz chưa lọc (đầu vào cho DeepFilterNet), để hai bộ lọc nhận cùng một đầu vào.
    #[arg(long)]
    write_48k: Option<PathBuf>,
}

/// RNNoise trên âm thanh 48 kHz trong [-1, 1]. Khung đầu có tiếng "fade-in" của mạng nên được thay bằng im lặng (khuyến
/// nghị của `nnnoiseless`). Độ dài ra bằng độ dài vào.
pub fn rnnoise(input: &[f32]) -> Vec<f32> {
    use nnnoiseless::DenoiseState;
    const N: usize = DenoiseState::FRAME_SIZE;
    let mut state = DenoiseState::new();
    let mut out = Vec::with_capacity(input.len() + N);
    let (mut frame_in, mut frame_out) = ([0f32; N], [0f32; N]);
    for (i, chunk) in input.chunks(N).enumerate() {
        frame_in.fill(0.0);
        // nnnoiseless nhận mẫu theo thang 16 bit.
        for (d, s) in frame_in.iter_mut().zip(chunk) {
            *d = s * 32_768.0;
        }
        state.process_frame(&mut frame_out, &frame_in);
        if i == 0 {
            out.extend(std::iter::repeat_n(0.0, N));
        } else {
            out.extend(frame_out.iter().map(|v| (v / 32_768.0).clamp(-1.0, 1.0)));
        }
    }
    out.truncate(input.len());
    out
}

pub fn run(args: DenoiseArgs) -> Result<()> {
    let (raw, rate) = read_wav_mono(&args.input)?;
    let at48 = resample(&raw, rate, 48_000)?;
    if let Some(path) = &args.write_48k {
        write_wav_f32(path, &at48, 48_000)?;
    }
    let started = Instant::now();
    let denoised = rnnoise(&at48);
    let cost = started.elapsed().as_secs_f64() / (at48.len() as f64 / 48_000.0);
    println!("RNNoise: {:.2}% một nhân (thời gian xử lý / thời lượng âm thanh)", cost * 100.0);
    let (reference, _) = read_wav_mono(&args.reference)?;
    let at16 = resample(&denoised, 48_000, 16_000)?;
    let lag = best_lag(&reference, &at16, 8_000);
    println!("lệch so với {}: {lag} mẫu, đã bù", args.reference.display());
    write_wav16(&args.out, &shift(at16, lag, reference.len()))
}
```

Trong `main.rs`, thêm vào `enum Command`:

```rust
    /// Lọc ồn micro bằng RNNoise cho bản VAD (spike nguồn micro).
    Denoise(denoise::DenoiseArgs),
```

và nhánh `Command::Denoise(a) => denoise::run(a),`.

- [ ] **Step 3: Chạy test, clippy**

Run: `cd $W && cargo test -p latency-bench denoise 2>&1 | tail -3 && cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `2 passed`; clippy `Finished`. Nếu `steady_noise_is_reduced` không qua (RNNoise giữ nhiều hơn 50% tiếng ồn trắng), in hai số RMS ra, ghi vào README ở Task 15 và nới mức về 0,7: mục đích chỉ là xác nhận bộ lọc chạy, mức thật đo ở Task 19.

- [ ] **Step 4: Commit**

```bash
cd $W && git add crates/latency-bench Cargo.lock && git commit -m "feat(latency-bench): lệnh denoise (RNNoise) cho bản VAD của micro"
```

---

### Task 13: Lệnh `aec` (AEC3 của `sonora`, phương án C)

**Files:**
- Tạo: `crates/latency-bench/src/aec.rs`
- Sửa: `crates/latency-bench/src/main.rs`

- [ ] **Step 1: Viết test trước**

Tạo `crates/latency-bench/src/aec.rs`:

```rust
//! `latency-bench aec` (spec 2026-10-24-nguon-micro §6.3, phương án C): khử vọng micro bằng AEC3 của `sonora`, dùng
//! `playback.wav` làm tham chiếu. Cả hai ở 16 kHz, khung 10 ms; mỗi khung xử lý render trước rồi capture, như hướng dẫn
//! của `sonora`. Ghi `mic-aec.wav` dài bằng `mic.wav`.

use crate::wavio::{read_wav_mono, write_wav16};
use anyhow::{Result, anyhow, bail};
use std::path::PathBuf;
use std::time::Instant;

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(x: &[f32]) -> f32 {
        (x.iter().map(|v| v * v).sum::<f32>() / x.len().max(1) as f32).sqrt()
    }

    #[test]
    fn a_pure_echo_is_strongly_reduced() {
        // Tham chiếu: tiếng ồn 6 giây. Micro: tiếng vọng = tham chiếu trễ 40 ms, nhỏ đi một nửa; không có giọng gần.
        let mut state = 99u32;
        let playback: Vec<f32> = (0..96_000)
            .map(|_| {
                state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                ((state >> 8) as f32 / (1u32 << 24) as f32 - 0.5) * 0.4
            })
            .collect();
        let mut mic = vec![0.0f32; 640];
        mic.extend(playback.iter().map(|v| v * 0.5));
        mic.truncate(playback.len());
        let out = cancel(&playback, &mic, 40).unwrap();
        assert_eq!(out.len(), mic.len());
        let tail = 64_000..96_000;
        assert!(rms(&out[tail.clone()]) < 0.3 * rms(&mic[tail]), "{} / {}", rms(&out[64_000..]), rms(&mic[64_000..]));
    }
}
```

Trong `main.rs` thêm `mod aec;`.

Run: `cd $W && cargo test -p latency-bench aec 2>&1 | tail -4`
Expected: lỗi biên dịch `cannot find function 'cancel'`.

- [ ] **Step 2: Viết code**

Thêm vào `aec.rs`, trên `#[cfg(test)]`:

```rust
#[derive(clap::Args)]
pub struct AecArgs {
    /// `playback.wav` của cảnh (tham chiếu).
    #[arg(long)]
    playback: PathBuf,
    /// `mic.wav` của cảnh.
    #[arg(long)]
    mic: PathBuf,
    /// WAV kết quả, ví dụ `mic-aec.wav`.
    #[arg(long)]
    out: PathBuf,
    /// Độ trễ ước lượng giữa phát và thu (ms, 0–500); lấy từ đo độ trễ vọng ở `score_mix.py --echo-delay`.
    #[arg(long, default_value_t = 0)]
    delay_ms: i32,
}

/// Khử vọng `mic` theo tham chiếu `playback` (cùng 16 kHz). Độ dài ra bằng `mic`.
pub fn cancel(playback: &[f32], mic: &[f32], delay_ms: i32) -> Result<Vec<f32>> {
    use sonora::config::EchoCanceller;
    use sonora::{AudioProcessing, Config, StreamConfig};
    const N: usize = 160;
    let config = Config {
        echo_canceller: Some(EchoCanceller::default()),
        ..Default::default()
    };
    let mut apm = AudioProcessing::builder()
        .config(config)
        .capture_config(StreamConfig::new(16_000, 1))
        .render_config(StreamConfig::new(16_000, 1))
        .build();
    let mut out = Vec::with_capacity(mic.len() + N);
    let (mut render_out, mut capture_out) = ([0f32; N], [0f32; N]);
    for i in 0..mic.len().div_ceil(N) {
        let mut render = [0f32; N];
        let mut capture = [0f32; N];
        for j in 0..N {
            render[j] = playback.get(i * N + j).copied().unwrap_or(0.0);
            capture[j] = mic.get(i * N + j).copied().unwrap_or(0.0);
        }
        apm.process_render_f32(&[&render], &mut [&mut render_out])
            .map_err(|e| anyhow!("render: {e:?}"))?;
        // Bị kẹp vào [0, 500] thì sonora báo lỗi nhưng vẫn xử lý: bỏ qua lỗi này.
        let _ = apm.set_stream_delay_ms(delay_ms);
        apm.process_capture_f32(&[&capture], &mut [&mut capture_out])
            .map_err(|e| anyhow!("capture: {e:?}"))?;
        out.extend_from_slice(&capture_out);
    }
    out.truncate(mic.len());
    Ok(out)
}

pub fn run(args: AecArgs) -> Result<()> {
    let (playback, p_rate) = read_wav_mono(&args.playback)?;
    let (mic, m_rate) = read_wav_mono(&args.mic)?;
    if p_rate != 16_000 || m_rate != 16_000 {
        bail!("playback và mic phải là 16 kHz");
    }
    let started = Instant::now();
    let out = cancel(&playback, &mic, args.delay_ms)?;
    let cost = started.elapsed().as_secs_f64() / (mic.len() as f64 / 16_000.0);
    println!("AEC3: {:.2}% một nhân (thời gian xử lý / thời lượng âm thanh)", cost * 100.0);
    write_wav16(&args.out, &out)
}
```

Trong `main.rs`, thêm vào `enum Command`:

```rust
    /// Khử vọng micro bằng AEC3 (phương án C của spike nguồn micro).
    Aec(aec::AecArgs),
```

và nhánh `Command::Aec(a) => aec::run(a),`.

- [ ] **Step 3: Chạy test, clippy**

Run: `cd $W && cargo test -p latency-bench aec 2>&1 | tail -3 && cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1`
Expected: `1 passed`; clippy `Finished`. Nếu `sonora` khác API (tên module `config`, kiểu lỗi), đọc mã nguồn bản 0.2.0 (`src/config.rs`, `src/audio_processing.rs`) và sửa cho khớp, giữ hành vi. Nếu tiếng vọng chỉ giảm dưới mức (tỉ lệ > 0,3), in số ra, thử `delay_ms` 0 và 40, rồi ghi kết quả vào README. Phương án C vẫn được đo thật ở Task 18.

- [ ] **Step 4: Commit**

```bash
cd $W && git add crates/latency-bench Cargo.lock && git commit -m "feat(latency-bench): lệnh aec (AEC3 của sonora) cho phương án C"
```

---

### Task 14: Lệnh `mix-eval`

**Files:**
- Tạo: `crates/latency-bench/src/mix_eval.rs`
- Sửa: `crates/latency-bench/src/main.rs`

- [ ] **Step 1: Viết test trước cho phần thuần**

Tạo `crates/latency-bench/src/mix_eval.rs`:

```rust
//! `latency-bench mix-eval` (spec 2026-10-24-nguon-micro §6.3): với mỗi phương án, dựng luồng cho whisper và luồng cho VAD
//! từ bản thu hai file của một cảnh (trộn thẳng, nhường lời, khử vọng, lọc ồn, lọc 80 Hz), cắt đoạn bằng đúng `Segmenter`
//! và Silero của app (VAD nghe luồng VAD, đoạn lấy âm thanh từ luồng whisper), chép lời bằng `asr-worker`, áp luật lọc
//! của app, rồi ghi mỗi đoạn một dòng JSONL để `score_mix.py` chấm.
//!
//! Không chạy hàng đợi, ghép câu hay bước dịch của engine: chỉ đo chữ, nên chạy nhanh hơn thời gian thực. Không dùng
//! prompt của đoạn trước (như `asr-eval`); giữ ngôn ngữ đoạn trước như app.

use anyhow::{Context, Result};
use audio_capture::duck::{DuckingMixer, GateParams};
use audio_capture::highpass::HighPass;
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Playback,
    Mic,
    Both,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct GateSpec {
    pub threshold_dbfs: f32,
    /// `null`: tắt hẳn micro khi hạ.
    pub duck_db: Option<f32>,
    pub hold_ms: u32,
}

#[derive(Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct VadSpec {
    pub threshold: f32,
    pub min_speech_ms: u64,
}

impl Default for VadSpec {
    fn default() -> Self {
        Self {
            threshold: 0.5,
            min_speech_ms: 250,
        }
    }
}

fn default_mic() -> String {
    "mic.wav".into()
}

fn yes() -> bool {
    true
}

/// Một phương án. File của micro tính trong thư mục cảnh.
#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Variant {
    pub name: String,
    pub mode: Mode,
    /// Micro cho whisper (ví dụ `mic.wav`, `mic-aec.wav`).
    #[serde(default = "default_mic")]
    pub mic: String,
    /// Micro cho VAD (ví dụ `mic-rnnoise.wav`); không có thì dùng `mic`.
    #[serde(default)]
    pub mic_vad: Option<String>,
    /// Whisper cũng nghe bản của VAD (lớp 3: "cả hai cùng nghe bản đã lọc").
    #[serde(default)]
    pub whisper_hears_vad: bool,
    /// Lọc 80 Hz trên micro (lớp 1).
    #[serde(default = "yes")]
    pub highpass: bool,
    /// Nhường lời; không có thì trộn thẳng.
    #[serde(default)]
    pub gate: Option<GateSpec>,
    #[serde(default)]
    pub vad: VadSpec,
}

/// Luồng cho whisper và luồng cho VAD của một phương án, cùng độ dài.
pub fn build_views(v: &Variant, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let _ = (v, playback, mic, mic_vad);
    unimplemented!()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn variant(json: &str) -> Variant {
        serde_json::from_str(json).unwrap()
    }

    #[test]
    fn defaults() {
        let v = variant(r#"{"name": "x", "mode": "mic"}"#);
        assert_eq!(v.mic, "mic.wav");
        assert!(v.highpass && v.gate.is_none() && v.mic_vad.is_none() && !v.whisper_hears_vad);
        assert_eq!(v.vad, VadSpec::default());
    }

    #[test]
    fn mic_mode_gives_the_vad_file_to_the_vad_only() {
        let v = variant(r#"{"name": "x", "mode": "mic", "highpass": false}"#);
        let (asr, vad) = build_views(&v, &[], &[0.1; 100], &[0.0; 100]);
        assert!(asr.iter().all(|&s| s == 0.1));
        assert!(vad.iter().all(|&s| s == 0.0));
        let v = variant(r#"{"name": "x", "mode": "mic", "highpass": false, "whisper_hears_vad": true}"#);
        let (asr, _) = build_views(&v, &[], &[0.1; 100], &[0.0; 100]);
        assert!(asr.iter().all(|&s| s == 0.0));
    }

    #[test]
    fn both_without_a_gate_is_a_plain_sum_over_the_longer_file() {
        let v = variant(r#"{"name": "x", "mode": "both", "highpass": false}"#);
        let (asr, vad) = build_views(&v, &[0.2; 100], &[0.1; 120], &[0.1; 120]);
        assert_eq!(asr.len(), 120);
        assert_eq!(vad.len(), 120);
        assert!((asr[50] - 0.3).abs() < 1e-6);
        assert!((asr[110] - 0.1).abs() < 1e-6);
    }

    #[test]
    fn both_with_a_gate_ducks_the_mic() {
        let v = variant(
            r#"{"name": "x", "mode": "both", "highpass": false,
                "gate": {"threshold_dbfs": -45, "duck_db": -20, "hold_ms": 300}}"#,
        );
        let (asr, _) = build_views(&v, &[0.1; 1_600], &[0.5; 1_600], &[0.5; 1_600]);
        assert!((asr[1_000] - 0.15).abs() < 1e-5, "{}", asr[1_000]);
    }

    #[test]
    fn playback_mode_ignores_the_mic() {
        let v = variant(r#"{"name": "x", "mode": "playback"}"#);
        let (asr, vad) = build_views(&v, &[0.2; 10], &[0.9; 10], &[0.9; 10]);
        assert_eq!(asr, vec![0.2; 10]);
        assert_eq!(vad, vec![0.2; 10]);
    }
}
```

Trong `main.rs` thêm `mod mix_eval;`.

Run: `cd $W && cargo test -p latency-bench mix_eval 2>&1 | tail -4`
Expected: 4 test FAIL (`not implemented`), `defaults` qua.

- [ ] **Step 2: Viết `build_views`**

Thay thân `build_views`:

```rust
pub fn build_views(v: &Variant, playback: &[f32], mic: &[f32], mic_vad: &[f32]) -> (Vec<f32>, Vec<f32>) {
    let mut mic = mic.to_vec();
    let mut mic_vad = mic_vad.to_vec();
    let len = mic.len().min(mic_vad.len());
    mic.truncate(len);
    mic_vad.truncate(len);
    if v.highpass {
        HighPass::new(16_000, 80.0).process(&mut mic);
        HighPass::new(16_000, 80.0).process(&mut mic_vad);
    }
    if v.whisper_hears_vad {
        mic.clone_from(&mic_vad);
    }
    match v.mode {
        Mode::Playback => (playback.to_vec(), playback.to_vec()),
        Mode::Mic => (mic, mic_vad),
        Mode::Both => {
            let params = v.gate.map_or(GateParams::OFF, |g| GateParams {
                threshold_dbfs: g.threshold_dbfs,
                duck_db: g.duck_db.unwrap_or(f32::NEG_INFINITY),
                hold_ms: g.hold_ms,
            });
            // Offline: ghép theo chỉ số, không phát riêng phần dư giữa chừng.
            let mut mixer = DuckingMixer::new(params, usize::MAX);
            mixer.push_playback(playback);
            mixer.push_mic(&mic, &mic_vad);
            let (mut asr, mut vad) = (Vec::new(), Vec::new());
            mixer.flush_into(&mut asr, &mut vad);
            (asr, vad)
        }
    }
}
```

Run: `cd $W && cargo test -p latency-bench mix_eval 2>&1 | tail -3`
Expected: `5 passed`.

- [ ] **Step 3: Viết phần chạy**

Đổi dòng `use anyhow::{Context, Result};` thành `use anyhow::{Context, Result, bail};`. Thêm các `use` sau vào đầu file, dưới các `use` hiện có:

```rust
use crate::wavio::{read_wav_mono, write_wav16};
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::{AsrLaunch, AsrWorker};
use pipeline::config::PipelineConfig;
use pipeline::filter::{Evidence, is_short, pcm_skip, verdict};
use pipeline::segmenter::{FRAME_SAMPLES, Segmenter, SegmenterConfig};
use pipeline::text::display_text;
use pipeline::vad::SileroVad;
use serde::Serialize;
use std::io::Write;
use std::path::Path;
```

Thêm sau `build_views`:

```rust
#[derive(clap::Args)]
pub struct MixEvalArgs {
    /// Thư mục cảnh: `mic.wav`, có thể có `playback.wav` và các file do `denoise`, `aec`, `align` sinh ra.
    #[arg(long)]
    scene: PathBuf,
    /// File JSON: mảng phương án (`make_variants.py`).
    #[arg(long)]
    variants: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    /// `silero_vad_v6.2.3.onnx` (thư mục `models/` của thư mục chính).
    #[arg(long)]
    vad_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    /// Thư mục kết quả: mỗi phương án một `<name>.jsonl`. Phương án đã có file thì bỏ qua, nên chạy tiếp được.
    #[arg(long)]
    out: PathBuf,
    /// Ghi thêm `<name>.asr.wav`, `<name>.vad.wav` để nghe lại.
    #[arg(long)]
    save_wav: bool,
}

#[derive(Serialize)]
struct Row<'a> {
    variant: &'a str,
    seg: u64,
    start_ms: u64,
    end_ms: u64,
    speech_ms: u64,
    mean_prob: f32,
    speech_ratio: f32,
    lang: String,
    lang_prob: f32,
    text: String,
    /// `Speech`, `NoSpeech`, `Hallucination`, `Repetition`, `Filler`, hay `TooShort` (không gửi worker).
    verdict: String,
    /// Câu ngắn theo `filter::is_short`: `score_mix.py` dò ngưỡng `ShortUnsure` trên các dòng này mà không chép lời lại.
    short: bool,
    no_speech_prob: f32,
    avg_logprob: f32,
    asr_ms: f32,
}

fn load(scene: &Path, name: &str) -> Result<Vec<f32>> {
    let path = scene.join(name);
    let (x, rate) = read_wav_mono(&path)?;
    if rate != 16_000 {
        bail!("{} phải là 16 kHz", path.display());
    }
    Ok(x)
}

pub fn run(args: MixEvalArgs) -> Result<()> {
    let variants: Vec<Variant> = serde_json::from_reader(
        std::fs::File::open(&args.variants).with_context(|| format!("không mở được {}", args.variants.display()))?,
    )?;
    std::fs::create_dir_all(&args.out)?;
    let base = PipelineConfig::default();
    let log = args.out.join("asr-worker.log");
    let launch = AsrLaunch {
        request_timeout: crate::latency::TOOL_REQUEST_TIMEOUT,
        ..AsrLaunch::new(&args.asr_worker, &args.asr_model, &log)
    };
    let (mut worker, ready) = AsrWorker::spawn(&launch)?;
    worker.warmup()?;
    println!("asr: {} ({})", ready.backend.as_str(), ready.whisper_version);
    for v in &variants {
        let out_path = args.out.join(format!("{}.jsonl", v.name));
        if out_path.exists() {
            println!("{}: đã có, bỏ qua", v.name);
            continue;
        }
        let playback = if v.mode == Mode::Mic {
            Vec::new()
        } else {
            load(&args.scene, "playback.wav")?
        };
        let (mic, mic_vad) = if v.mode == Mode::Playback {
            (Vec::new(), Vec::new())
        } else {
            let mic = load(&args.scene, &v.mic)?;
            let mic_vad = match &v.mic_vad {
                Some(name) => load(&args.scene, name)?,
                None => mic.clone(),
            };
            (mic, mic_vad)
        };
        let (asr_view, vad_view) = build_views(v, &playback, &mic, &mic_vad);
        if args.save_wav {
            write_wav16(&args.out.join(format!("{}.asr.wav", v.name)), &asr_view)?;
            write_wav16(&args.out.join(format!("{}.vad.wav", v.name)), &vad_view)?;
        }
        let mut vad = SileroVad::load(&args.vad_model)?;
        let mut segmenter = Segmenter::new(SegmenterConfig {
            threshold: v.vad.threshold,
            min_speech_ms: v.vad.min_speech_ms,
            end_silence_ms: 50,
            ..base.segmenter.clone()
        });
        let mut segments = Vec::new();
        for i in 0..asr_view.len().min(vad_view.len()) / FRAME_SAMPLES {
            let frame = i * FRAME_SAMPLES..(i + 1) * FRAME_SAMPLES;
            let prob = vad.prob(&vad_view[frame.clone()])?;
            segments.extend(segmenter.push(&asr_view[frame], prob));
        }
        segments.extend(segmenter.flush());

        let mut part = out_path.clone().into_os_string();
        part.push(".part");
        let part = PathBuf::from(part);
        let mut file = std::io::BufWriter::new(std::fs::File::create(&part)?);
        let mut prev_lang: Option<String> = None;
        let (mut kept, total) = (0usize, segments.len());
        for s in segments {
            let mut row = Row {
                variant: &v.name,
                seg: s.id,
                start_ms: s.start_ms,
                end_ms: s.end_ms,
                speech_ms: s.speech_ms,
                mean_prob: s.mean_prob,
                speech_ratio: s.speech_ratio,
                lang: String::new(),
                lang_prob: 0.0,
                text: String::new(),
                verdict: "TooShort".into(),
                short: false,
                no_speech_prob: 0.0,
                avg_logprob: 0.0,
                asr_ms: 0.0,
            };
            if pcm_skip(s.samples.len()).is_none() {
                let pcm: Vec<i16> = s.samples.iter().map(|&x| (x.clamp(-1.0, 1.0) * 32_767.0) as i16).collect();
                let r = worker.transcribe(TranscribeRequest {
                    segment_id: s.id,
                    audio_ctx: audio_ctx_for_samples(pcm.len()),
                    pcm,
                    languages: args.languages.clone(),
                    prompt_tokens: Vec::new(),
                    prev_lang: prev_lang.clone(),
                })?;
                let text = display_text(&r.lang, &r.text, &base.filter);
                let ev = Evidence {
                    no_speech_prob: r.no_speech_prob,
                    avg_logprob: r.avg_logprob,
                    vad_mean_prob: s.mean_prob,
                    speech_ms: s.speech_ms,
                };
                let v_ = verdict(&ev, &text, &base.filter);
                if v_ == pipeline::filter::Verdict::Speech {
                    prev_lang = Some(r.lang.clone());
                    kept += 1;
                }
                row.short = is_short(&text, &base.filter);
                row.verdict = format!("{v_:?}");
                row.lang = r.lang;
                row.lang_prob = r.lang_prob;
                row.text = text;
                row.no_speech_prob = r.no_speech_prob;
                row.avg_logprob = r.avg_logprob;
                row.asr_ms = r.asr_ms + r.lid_ms;
            }
            writeln!(file, "{}", serde_json::to_string(&row)?)?;
        }
        file.flush()?;
        drop(file);
        std::fs::rename(&part, &out_path)?;
        println!("{}: {total} đoạn, giữ {kept}", v.name);
    }
    Ok(())
}
```

Trong `main.rs`, thêm vào `enum Command`:

```rust
    /// Chấm các phương án trộn và chống ồn trên bản thu của một cảnh (spike nguồn micro).
    MixEval(mix_eval::MixEvalArgs),
```

và nhánh `Command::MixEval(a) => mix_eval::run(a),`.

Kiểm tên trường: `TranscribeResult` có `lang`, `lang_prob`, `text`, `no_speech_prob`, `avg_logprob`, `asr_ms`, `lid_ms` (xem `crates/asr-protocol/src/lib.rs:166`); `Segment` có `id`, `start_ms`, `end_ms`, `speech_ms`, `mean_prob`, `speech_ratio`, `samples` (`crates/pipeline/src/segmenter.rs:41`); `AsrWorker::transcribe` và `warmup` như trong `asr_eval.rs`. Sai tên ở đâu thì sửa theo các file đó.

- [ ] **Step 4: Test, clippy, chạy thử nhỏ**

Run: `cd $W && cargo test -p latency-bench mix_eval 2>&1 | tail -2 && cargo clippy -p latency-bench --all-targets -- -D warnings 2>&1 | tail -1 && cargo build --release -p latency-bench -p asr-worker 2>&1 | tail -1`
Expected: `5 passed`; clippy và build `Finished`.

Thử trên một clip FLEURS, giả làm cảnh chỉ micro:

```bash
cd $W && T=$(mktemp -d) && cp "$M/bench/phase0/data/asr/clips/en/en-15158676295442294624.wav" "$T/mic.wav" \
 && echo '[{"name":"thu","mode":"mic"}]' > "$T/v.json" \
 && ./target/release/latency-bench mix-eval --scene "$T" --variants "$T/v.json" --asr-worker target/release/asr-worker \
    --asr-model "$M/models/ggml-large-v3-turbo-q5_0.bin" --vad-model "$M/models/silero_vad_v6.2.3.onnx" --out "$T/out" \
 && cat "$T/out/thu.jsonl"
```

Expected: ít nhất một dòng có `"verdict":"Speech"` và chữ gần với "The main local beer is 'Number One'…" (clip FLEURS vốn là WAV 16 kHz mono 16-bit, chép thẳng được).

- [ ] **Step 5: Commit**

```bash
cd $W && git add crates/latency-bench && git commit -m "feat(latency-bench): lệnh mix-eval chấm phương án trộn và chống ồn bằng Segmenter, Silero, asr-worker của app"
```

---

### Task 15: Sinh phương án, chấm điểm, README

**Files:**
- Tạo: `bench/2026-10-24-nguon-micro/make_variants.py`, `score_mix.py`, `test_score_mix.py`, `README.md`

- [ ] **Step 1: `make_variants.py`**

```python
"""Sinh file phương án cho `latency-bench mix-eval` (spec 2026-10-24-nguon-micro §6.3).

  python3 bench/2026-10-24-nguon-micro/make_variants.py echo > bench/2026-10-24-nguon-micro/variants/echo.json
  python3 bench/2026-10-24-nguon-micro/make_variants.py noise > bench/2026-10-24-nguon-micro/variants/noise.json
  python3 bench/2026-10-24-nguon-micro/make_variants.py both-vad --gate=-45,-20,300 > bench/2026-10-24-nguon-micro/variants/both-vad.json

- `echo` (cảnh 1, 2, 3): đối chứng chỉ-Playback và chỉ-micro, A (trộn thẳng), B (lưới 3 × 4 × 4), C (micro đã khử vọng).
- `noise` (cảnh 4, 6, 7, chỉ micro): bộ lọc {không, RNNoise, DeepFilterNet} × whisper nghe {bản thường, bản đã lọc} ×
  VAD {0,5; 0,6; 0,7} × {250, 400, 600} ms. Luật ShortUnsure được dò ở `score_mix.py`, không cần chép lời lại.
- `both-vad` (cảnh 1): B với tham số đã chọn × lưới VAD, để kiểm VAD chặt hơn không hại tiếng online.
"""
import argparse
import json

VAD_GRID = [(t, m) for t in (0.5, 0.6, 0.7) for m in (250, 400, 600)]


def vad(t, m):
    return {"threshold": t, "min_speech_ms": m}


def echo():
    out = [
        {"name": "doi-chung-playback", "mode": "playback"},
        {"name": "doi-chung-mic", "mode": "mic"},
        {"name": "A", "mode": "both"},
        {"name": "C", "mode": "both", "mic": "mic-aec.wav"},
    ]
    for t in (-55, -45, -35):
        for d in (-12, -20, -30, None):
            for h in (150, 300, 500, 800):
                dname = "tat" if d is None else str(-d)
                out.append({
                    "name": f"B-t{-t}-d{dname}-h{h}",
                    "mode": "both",
                    "gate": {"threshold_dbfs": t, "duck_db": d, "hold_ms": h},
                })
    return out


def noise():
    out = []
    filters = [("khong", None, False), ("rnn", "mic-rnnoise.wav", False), ("rnn-ca-hai", "mic-rnnoise.wav", True),
               ("dfn", "mic-dfn.wav", False), ("dfn-ca-hai", "mic-dfn.wav", True)]
    for fname, file, both in filters:
        for t, m in VAD_GRID:
            v = {"name": f"N-{fname}-v{int(t * 10)}-m{m}", "mode": "mic", "vad": vad(t, m)}
            if file:
                v["mic_vad"] = file
                v["whisper_hears_vad"] = both
            out.append(v)
    return out


def both_vad(gate):
    t, d, h = gate
    return [{
        "name": f"BV-v{int(vt * 10)}-m{m}",
        "mode": "both",
        "gate": {"threshold_dbfs": t, "duck_db": d, "hold_ms": h},
        "vad": vad(vt, m),
    } for vt, m in VAD_GRID]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["echo", "noise", "both-vad"])
    ap.add_argument("--gate", help="ngưỡng,mức hạ,thời gian giữ của B đã chọn, ví dụ -45,-20,300 (mức hạ 'tat' là tắt hẳn)")
    args = ap.parse_args()
    if args.kind == "echo":
        variants = echo()
    elif args.kind == "noise":
        variants = noise()
    else:
        t, d, h = args.gate.split(",")
        variants = both_vad((float(t), None if d == "tat" else float(d), int(h)))
    print(json.dumps(variants, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: `score_mix.py`**

```python
"""Chấm kết quả `latency-bench mix-eval` của một cảnh (spec 2026-10-24-nguon-micro §6.3).

Dùng:
  uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" \
    python bench/2026-10-24-nguon-micro/score_mix.py --scene <thư mục cảnh> --results <thư mục kết quả mix-eval>
  ... score_mix.py --scene <thư mục cảnh> --echo-delay      # chỉ đo độ trễ vọng (playback.wav so với mic.wav)

Thư mục cảnh có `meta.json` (do `capture` ghi), `mic.wav`, có thể có `playback.wav`; nếu cảnh phát track thì có thêm
`schedule.json`, `online.wav`, `room.wav`. In bảng Markdown, ghi `<results>/score.json` và `<results>/score.md`.

Cách chấm:
- Căn track với bản thu bằng tương quan đường bao 10 ms: online.wav với playback.wav (không có thì với mic.wav),
  room.wav với mic.wav.
- Đoạn được giữ: `verdict` = Speech; phương án có hậu tố `+su<p>-<s>` bỏ thêm theo luật ShortUnsure: `short` và
  (`mean_prob` < p hoặc `speech_ms` < s).
- Gán mỗi đoạn được giữ cho clip trùng thời gian nhiều nhất (clip nới 300 ms mỗi phía). Không trùng clip nào là câu ảo,
  ghi kèm lời nhắc (`cues` trong meta.json) đang chạy lúc đó.
- Lỗi mỗi clip: WER (en, vi) hay CER (zh, ja, ko) trên chữ chuẩn hóa như `score_asr.py`; clip không có đoạn nào thì lỗi
  bằng độ dài ref. Tỉ lệ lỗi một nguồn là trung bình các ngôn ngữ (mỗi ngôn ngữ: tổng lỗi / tổng độ dài ref).
- Câu trong phòng "giữ được": có chữ và lỗi của clip ≤ 50%. Câu ngắn "giữ được": có chữ.
"""
import argparse
import json
import os
import sys
import wave

import jiwer
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phase0", "asr"))
from score_asr import CER_LANGS, normalize  # noqa: E402

PAD_MS = 300
SHORT_GRID = [None] + [(p, s) for p in (0.6, 0.7, 0.8, 0.9) for s in (250, 400, 600)]


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getsampwidth() == 2 and w.getnchannels() == 1, path
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
        return data, w.getframerate()


def envelope(x, rate, hop_ms=10):
    hop = rate * hop_ms // 1000
    n = len(x) // hop
    return np.abs(x[: n * hop]).reshape(n, hop).mean(axis=1)


def best_offset_ms(track, recording, rate, max_ms=30_000, min_ms=0):
    """Độ lệch (ms, bội của 10) để track[t] ≈ recording[t + offset], trong [min_ms, max_ms]."""
    a = envelope(track, rate)
    b = envelope(recording, rate)
    a = a - a.mean()
    b = b - b.mean()
    n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
    corr = np.fft.irfft(np.fft.rfft(b, n) * np.conj(np.fft.rfft(a, n)), n)
    lags = np.arange(n)
    lags[lags > n // 2] -= n
    mask = (lags >= min_ms // 10) & (lags <= max_ms // 10)
    return int(lags[mask][np.argmax(corr[mask])]) * 10


def load_rows(path):
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def kept(rows, short):
    out = []
    for r in rows:
        if r["verdict"] != "Speech":
            continue
        if short and r["short"] and (r["mean_prob"] < short[0] or r["speech_ms"] < short[1]):
            continue
        out.append(r)
    return out


def assign(rows, items):
    """(đoạn của từng clip theo chỉ số, các đoạn ảo)."""
    by_clip = {i: [] for i in range(len(items))}
    phantoms = []
    for r in rows:
        best, best_ov = None, 0
        for i, it in enumerate(items):
            ov = min(r["end_ms"], it["end_ms"] + PAD_MS) - max(r["start_ms"], it["start_ms"] - PAD_MS)
            if ov > best_ov:
                best, best_ov = i, ov
        if best is None:
            phantoms.append(r)
        else:
            by_clip[best].append(r)
    return by_clip, phantoms


def clip_errors(item, segs):
    """(số lỗi, độ dài ref) theo từ hay theo chữ."""
    lang = item["lang"]
    ref = normalize(item["ref"], lang)
    hyp = normalize(" ".join(s["text"] for s in sorted(segs, key=lambda s: s["start_ms"])), lang)
    if lang in CER_LANGS:
        n = len(ref)
        if not hyp:
            return n, n
        o = jiwer.process_characters(ref, hyp)
    else:
        n = len(ref.split())
        if not hyp:
            return n, n
        o = jiwer.process_words(ref, hyp)
    return o.substitutions + o.deletions + o.insertions, n


def cue_at(cues, ms):
    label = None
    for c in cues:
        if c["at_ms"] <= ms:
            label = c["label"]
    return label


def score_variant(rows, items, cues, minutes, short):
    by_clip, phantoms = assign(kept(rows, short), items)
    per = {}
    room_total = room_kept = short_total = short_kept = 0
    for i, it in enumerate(items):
        segs = by_clip[i]
        if it["short"]:
            short_total += 1
            short_kept += int(any(s["text"].strip() for s in segs))
            continue
        err, n = clip_errors(it, segs)
        acc = per.setdefault((it["source"], it["lang"]), [0, 0])
        acc[0] += err
        acc[1] += n
        if it["source"] == "room":
            room_total += 1
            room_kept += int(bool(segs) and n > 0 and err / n <= 0.5)

    def rate(source):
        langs = [v for (s, _), v in per.items() if s == source and v[1] > 0]
        return None if not langs else sum(e / n for e, n in langs) / len(langs)

    by_cue = {}
    for p in phantoms:
        k = cue_at(cues, p["start_ms"]) or "-"
        by_cue[k] = by_cue.get(k, 0) + 1
    return {
        "online_err": rate("online"),
        "room_err": rate("room"),
        "per_lang": {f"{s}-{lang}": (v[0] / v[1] if v[1] else None) for (s, lang), v in per.items()},
        "room_kept": room_kept / room_total if room_total else None,
        "short_recall": short_kept / short_total if short_total else None,
        "phantoms": len(phantoms),
        "phantoms_per_10min": len(phantoms) / minutes * 10 if minutes else None,
        "phantoms_by_cue": by_cue,
        "phantom_texts": [p["text"] for p in phantoms][:20],
    }


def scene_items(scene, rate):
    path = os.path.join(scene, "schedule.json")
    if not os.path.exists(path):
        return [], {}
    with open(path, encoding="utf-8") as f:
        sched = json.load(f)
    offsets = {}
    for source in ("online", "room"):
        if not any(it["source"] == source for it in sched["items"]):
            continue
        rec = "playback.wav" if source == "online" and os.path.exists(os.path.join(scene, "playback.wav")) else "mic.wav"
        track, _ = read_wav(os.path.join(scene, f"{source}.wav"))
        recording, _ = read_wav(os.path.join(scene, rec))
        offsets[source] = best_offset_ms(track, recording, rate)
    items = [{**it, "start_ms": it["start_ms"] + offsets[it["source"]], "end_ms": it["end_ms"] + offsets[it["source"]]}
             for it in sched["items"]]
    return items, offsets


def fmt(x, pct=True):
    if x is None:
        return "-"
    return f"{x * 100:.1f}%" if pct else f"{x:.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", required=True)
    ap.add_argument("--results")
    ap.add_argument("--echo-delay", action="store_true")
    args = ap.parse_args()
    mic, rate = read_wav(os.path.join(args.scene, "mic.wav"))
    if args.echo_delay:
        playback, _ = read_wav(os.path.join(args.scene, "playback.wav"))
        print(f"độ trễ vọng (micro so với âm thanh máy): {best_offset_ms(playback, mic, rate, max_ms=1_000, min_ms=-200)} ms")
        return
    with open(os.path.join(args.scene, "meta.json"), encoding="utf-8") as f:
        cues = json.load(f).get("cues", [])
    minutes = len(mic) / rate / 60
    items, offsets = scene_items(args.scene, rate)
    print(f"độ lệch track: {offsets} ms; {len(items)} clip; {minutes:.1f} phút")
    results = {}
    for name in sorted(os.listdir(args.results)):
        if not name.endswith(".jsonl"):
            continue
        rows = load_rows(os.path.join(args.results, name))
        for short in SHORT_GRID:
            key = name[:-6] if short is None else f"{name[:-6]}+su{short[0]}-{short[1]}"
            results[key] = score_variant(rows, items, cues, minutes, short)
    with open(os.path.join(args.results, "score.json"), "w", encoding="utf-8") as f:
        json.dump({"offsets_ms": offsets, "minutes": minutes, "variants": results}, f, ensure_ascii=False, indent=1)
    lines = ["| Phương án | Lỗi online | Lỗi trong phòng | Giữ câu trong phòng | Giữ câu ngắn | Câu ảo | Ảo/10 phút |",
             "|---|---|---|---|---|---|---|"]
    for key, r in results.items():
        lines.append(f"| {key} | {fmt(r['online_err'])} | {fmt(r['room_err'])} | {fmt(r['room_kept'])} | "
                     f"{fmt(r['short_recall'])} | {r['phantoms']} | {fmt(r['phantoms_per_10min'], pct=False)} |")
    table = "\n".join(lines)
    with open(os.path.join(args.results, "score.md"), "w", encoding="utf-8") as f:
        f.write(table + "\n")
    print(table)


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Test của `score_mix.py`**

`bench/2026-10-24-nguon-micro/test_score_mix.py`:

```python
"""Test của score_mix.py: uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" \
--with "opencc==1.4.2" python -m unittest bench/2026-10-24-nguon-micro/test_score_mix.py"""
import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from score_mix import assign, best_offset_ms, kept, score_variant  # noqa: E402

ITEMS = [
    {"source": "online", "lang": "en", "ref": "hello world", "start_ms": 1000, "end_ms": 2000, "short": False},
    {"source": "room", "lang": "vi", "ref": "Đúng rồi.", "start_ms": 3000, "end_ms": 3500, "short": True},
]


def row(start, end, text, short=False, prob=0.9, speech=900, verdict="Speech"):
    return {"verdict": verdict, "short": short, "mean_prob": prob, "speech_ms": speech,
            "start_ms": start, "end_ms": end, "text": text}


class ScoreMix(unittest.TestCase):
    def test_segments_go_to_the_overlapping_clip_and_the_rest_are_phantoms(self):
        rows = [row(1100, 1900, "hello world"), row(5000, 5200, "you", short=True, prob=0.5, speech=200)]
        by, ph = assign(kept(rows, None), ITEMS)
        self.assertEqual(len(by[0]), 1)
        self.assertEqual([p["text"] for p in ph], ["you"])

    def test_short_unsure_drops_short_unsure_rows_only(self):
        rows = [row(5000, 5200, "you", short=True, prob=0.5, speech=200), row(1100, 1900, "hello world")]
        self.assertEqual([r["text"] for r in kept(rows, (0.7, 400))], ["hello world"])

    def test_filtered_rows_are_not_kept(self):
        self.assertEqual(kept([row(0, 100, "x", verdict="Filler")], None), [])

    def test_score(self):
        rows = [row(1100, 1900, "hello world"), row(3050, 3450, "Đúng rồi", short=True)]
        r = score_variant(rows, ITEMS, [], 1.0, None)
        self.assertEqual(r["online_err"], 0.0)
        self.assertEqual(r["short_recall"], 1.0)
        self.assertEqual(r["phantoms"], 0)

    def test_offset(self):
        rng = np.random.default_rng(1)
        track = np.repeat(rng.random(300) > 0.7, 1600).astype(np.float32) * 0.5
        recording = np.concatenate([np.zeros(16000 * 2, dtype=np.float32), track])
        self.assertEqual(best_offset_ms(track, recording, 16000), 2000)


if __name__ == "__main__":
    unittest.main()
```

Run: `cd $W && uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" python -m unittest bench/2026-10-24-nguon-micro/test_score_mix.py 2>&1 | tail -3`
Expected: `Ran 5 tests` … `OK`.

Run: `cd $W && mkdir -p bench/2026-10-24-nguon-micro/variants && for k in echo noise; do python3 bench/2026-10-24-nguon-micro/make_variants.py $k > bench/2026-10-24-nguon-micro/variants/$k.json; done && python3 -c "import json; print(len(json.load(open('bench/2026-10-24-nguon-micro/variants/echo.json'))), len(json.load(open('bench/2026-10-24-nguon-micro/variants/noise.json'))))"`
Expected: `52 45`.

- [ ] **Step 4: README**

`bench/2026-10-24-nguon-micro/README.md`:

````markdown
# Spike nguồn micro (2026-10-24)

Căn cứ của `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` §6. Kế hoạch: `docs/superpowers/plans/2026-10-24-nguon-micro-01-spike.md`.

## Thư mục

- `build_scene.py`: dựng track (`online.wav`, `room.wav`, `schedule.json`) từ clip FLEURS và câu ngắn dựng bằng `say`.
- `cues/`: lời nhắc tạo tiếng ồn cho cảnh 6 và 7.
- `run_scene_macos.sh`: phát track và thu một cảnh bằng `target/Capture.app`.
- `make_variants.py`, `variants/`: phương án cho `latency-bench mix-eval`.
- `score_mix.py`, `test_score_mix.py`: chấm một cảnh.
- `results/`: kết quả S-M4, bảng điểm, kết luận (`ket-qua.md`).
- `data/` (không có trong git): track, bản thu (có giọng người thật), kết quả `mix-eval`.

## Chạy lại

```bash
W=<worktree>; M=<thư mục chính có models/ và bench/phase0/data/>
B=$W/bench/2026-10-24-nguon-micro; D=$B/data
cd $W && cargo build --release -p latency-bench -p asr-worker && crates/audio-capture/macos/make-app.sh capture
uv run --no-project --python 3.12 --with "numpy==2.5.4" python $B/build_scene.py --fleurs $M/bench/phase0/data/asr/manifest.jsonl --out $D/tracks
$B/run_scene_macos.sh bench/2026-10-24-nguon-micro/data/scenes/s1-loa --tracks bench/2026-10-24-nguon-micro/data/tracks/s1-luot
./target/release/latency-bench denoise --input $D/scenes/<cảnh>/mic-raw.wav --reference $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-rnnoise.wav
./target/release/latency-bench aec --playback $D/scenes/<cảnh>/playback.wav --mic $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-aec.wav --delay-ms <đo bằng score_mix.py --echo-delay>
./target/release/latency-bench mix-eval --scene $D/scenes/<cảnh> --variants $B/variants/echo.json --asr-worker target/release/asr-worker \
  --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --vad-model $M/models/silero_vad_v6.2.3.onnx --out $D/results/<cảnh>/echo
uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" \
  python $B/score_mix.py --scene $D/scenes/<cảnh> --results $D/results/<cảnh>/echo
```

## Ghi chú

- `mix-eval` không chạy hàng đợi, ghép câu, bước dịch hay prompt của đoạn trước: chỉ đo chữ của từng đoạn.
- `latency-bench` có hai bản `rustfft` (của `rubato` và của `nnnoiseless`). Chấp nhận được vì công cụ này không vào app.
````

- [ ] **Step 5: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro && git commit -m "feat(bench): sinh phương án, chấm điểm và README cho spike nguồn micro"
```

---

### Task 16: Thu các cảnh trên macOS (cần chủ dự án)

**Files:** Tạo `bench/2026-10-24-nguon-micro/results/thu-macos.md`

Mỗi cảnh phát tiếng ra loa và mở micro trong vài phút. **Hỏi chủ dự án trước mỗi cảnh**, nói rõ:
- cảnh kéo dài bao lâu;
- cần làm gì (đeo tai nghe, cầm điện thoại phát track, tạo tiếng ồn theo lời nhắc);
- phòng cần yên tĩnh.

Bước chuẩn bị: `cd $W && crates/audio-capture/macos/make-app.sh capture`. Lần chạy đầu, `Capture.app` hỏi quyền "Ghi âm thanh hệ thống" và quyền Micro. Đặt `S=bench/2026-10-24-nguon-micro/data/scenes`, `TR=bench/2026-10-24-nguon-micro/data/tracks`.

- [ ] **Step 1: Cảnh 1, loa laptop, nói lần lượt.** Âm lượng loa khoảng 60%, không cắm tai nghe. `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s1-loa --tracks $TR/s1-luot`
- [ ] **Step 2: Cảnh 2, loa laptop, nói chồng.** `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s2-loa --tracks $TR/s2-chong`
- [ ] **Step 3: Cảnh 3, tai nghe có dây.** Chủ dự án cắm tai nghe có dây và chép `$TR/s1-luot/room.wav` sang điện thoại. Điện thoại đặt cách laptop 1 m, bấm phát khi script in "đang thu". `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s3-tai-nghe --tracks $TR/s1-luot --room-from-phone`
- [ ] **Step 4: Cảnh 4, chỉ micro, 1 m và 3 m.** Điện thoại phát `$TR/s4-phong/room.wav`:
  - `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s4-1m --tracks $TR/s4-phong --mic-only --room-from-phone`
  - lặp lại với `$S/s4-3m` ở 3 m;
  - nếu có AirPods, lặp lại ở 1 m với `--mic <UID AirPods>` vào `$S/s4-1m-airpods` (UID lấy bằng `./target/release/mic-probe devices`).
- [ ] **Step 5: Cảnh 6, chỉ tiếng ồn.** Chủ dự án làm theo lời nhắc in ra trong 18 phút. `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s6-on --mic-only --cues bench/2026-10-24-nguon-micro/cues/s6-on.json --seconds 1100`
- [ ] **Step 6: Cảnh 7, có người nói kèm tiếng ồn.** Điện thoại ở 1 m phát `$TR/s7-phong-ngan/room.wav`; chủ dự án tạo tiếng ồn theo lời nhắc. `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s7-on --tracks $TR/s7-phong-ngan --mic-only --room-from-phone --cues bench/2026-10-24-nguon-micro/cues/s7-on.json`
- [ ] **Step 7: Cảnh 5, buổi thật (tùy chủ dự án).** Một cuộc Zoom hay Meet qua loa với một người thật ở đầu kia, cộng một người đọc trong phòng, 5 phút. `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/s5-that --seconds 300`. Cảnh này không có bản chép chuẩn: Task 18 chỉ nghe lại và đếm câu trùng, câu sót bằng tay.
- [ ] **Step 8: Lệch đồng hồ 30 phút (S-M4).** Chủ dự án mở một video dài trên YouTube (phát qua loa hay tai nghe đều được), để máy chạy, không cần ngồi cạnh. `cd $W && bench/2026-10-24-nguon-micro/run_scene_macos.sh $S/lech-30p --seconds 1800`. Đọc `drift` trong `meta.json`: lệch tăng đều bao nhiêu mẫu mỗi phút, và có vượt 1600 mẫu (100 ms, ngưỡng `Mixer2` phát riêng phần dư) không.
- [ ] **Step 9: Kiểm từng bản thu.** Với mỗi thư mục cảnh: `cat $S/<cảnh>/meta.json | python3 -c "import json,sys; m=json.load(sys.stdin); print(m['mic'], m['playback_samples']//16000, m['mic_samples']//16000, m['drift'][-1:] if m['drift'] else '', [s['dropped'] for s in m['stats']])"`. Kỳ vọng: số giây hai file gần bằng nhau, không có mẫu rơi.
- [ ] **Step 10: Ghi nhật ký thu**

`bench/2026-10-24-nguon-micro/results/thu-macos.md`: mỗi cảnh một dòng gồm ngày, máy, macOS, thiết bị phát và thu, âm lượng, khoảng cách, lỗi gặp, và đầu ra của Step 9; thêm một mục cho kết quả lệch đồng hồ của Step 8.

- [ ] **Step 11: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/thu-macos.md && git commit -m "docs(bench): nhật ký thu các cảnh spike nguồn micro trên macOS"
```

---

### Task 17: Windows: binary, S-M4, thu cảnh (cần chủ dự án)

**Files:** Tạo `bench/2026-10-24-nguon-micro/results/s-m4-windows.md`, `bench/2026-10-24-nguon-micro/results/thu-windows.md`

- [ ] **Step 1: Hỏi chủ dự án cách có binary Windows**

Cần ba binary: `capture.exe` và `mic-probe.exe` (crate `audio-capture`), cộng `latency-bench.exe` để đo CPU của lớp 2 trên máy i5. Hỏi chủ dự án chọn một trong ba cách:
- **(a)** Máy Windows đã có Rust: chủ dự án checkout nhánh `nguon-micro` (cần push nhánh, phải được cho phép) rồi chạy `cargo build --release -p audio-capture -p latency-bench`.
- **(b)** Build chéo trên Mac bằng `cargo-xwin`. Cách này tải CRT và SDK của Microsoft, nên chủ dự án phải đồng ý điều khoản của Microsoft. Lệnh: `cargo xwin build --release --target x86_64-pc-windows-msvc -p audio-capture -p latency-bench`.
- **(c)** Đẩy nhánh để CI build: cần cho phép push và một job CI tạm.

Làm theo cách được chọn, rồi chép ba file `.exe`, `bench/2026-10-24-nguon-micro/data/tracks/` và `models/silero_vad_v6.2.3.onnx` sang máy Windows.

- [ ] **Step 2: S-M4 trên Windows.** Chủ dự án chạy trong PowerShell, gửi lại đầu ra:
  - `.\mic-probe.exe devices`
  - `.\mic-probe.exe status`
  - `.\mic-probe.exe listen --seconds 5` (nói vài câu)
  - tắt Settings › Privacy & security › Microphone › "Let desktop apps access your microphone", rồi chạy lại `status` và `listen --seconds 5` (ghi mã lỗi hay số 0)
  - bật lại công tắc
  - mở Teams hay Zoom (mic bật), chạy `listen --seconds 10` trong lúc nói

  Ghi vào `results/s-m4-windows.md`. Cuối file trả lời: Windows báo thiếu quyền bằng mã lỗi nào; khóa `ConsentStore` có phản ánh đúng công tắc không.

- [ ] **Step 3: Cảnh 1 trên Windows (chỉ online, đo độ trễ vọng).** Loa laptop, không tai nghe. PowerShell:

```powershell
$p = New-Object Media.SoundPlayer "$PWD\tracks\s1w-online\online.wav"; $p.Play()
.\capture.exe --mic --seconds 330 --out scenes\s1w-loa
Copy-Item tracks\s1w-online\* scenes\s1w-loa\
```

- [ ] **Step 4: Cảnh 4, 6, 7 trên Windows.** Như Task 16 Step 4–6, thay script bằng:
  - `.\capture.exe --mic-only --seconds <N> --out scenes\<cảnh> [--cues cues\<file>]`;
  - với cảnh có track, sau khi thu thì `Copy-Item tracks\<track>\* scenes\<cảnh>\`.

  `N` lấy theo `schedule.json` (track_ms/1000 + 6) hay 1100 cho cảnh 6.

- [ ] **Step 5: CPU của lớp 2 trên i5.** `.\latency-bench.exe denoise --input scenes\s4-1m\mic-raw.wav --reference scenes\s4-1m\mic.wav --out scenes\s4-1m\mic-rnnoise.wav` và ghi dòng `RNNoise: x% một nhân`. Nếu Task 19 chọn DeepFilterNet thì đo thêm theo hướng dẫn ở đó.

- [ ] **Step 6: Chép bản thu về Mac** vào `bench/2026-10-24-nguon-micro/data/scenes/` (tên thư mục có hậu tố `-win`), ghi `results/thu-windows.md` như Task 16 Step 9.

- [ ] **Step 7: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/s-m4-windows.md bench/2026-10-24-nguon-micro/results/thu-windows.md && git commit -m "docs(bench): S-M4 và nhật ký thu trên Windows"
```

---

### Task 18: Đo tiếng vọng (cảnh 1, 2, 3)

**Files:** Tạo `bench/2026-10-24-nguon-micro/results/tieng-vong.md`

Build `asr-worker` có Metal như bản phát hành (không có feature thì chạy CPU, chậm khoảng 4 lần): `cd $W && MACOSX_DEPLOYMENT_TARGET=14.2 cargo build --release --locked -p asr-worker --features metal,shared-encode`.

Đặt `D=$W/bench/2026-10-24-nguon-micro/data`, `B=$W/bench/2026-10-24-nguon-micro`, `LB=$W/target/release/latency-bench`, và `ASR="--asr-worker $W/target/release/asr-worker --asr-model $M/models/ggml-large-v3-turbo-q5_0.bin --vad-model $M/models/silero_vad_v6.2.3.onnx"`. Hàm chấm: `score() { uv run --no-project --python 3.12 --with "numpy==2.5.4" --with "jiwer==4.0.0" --with "opencc==1.4.2" python $B/score_mix.py "$@"; }`.

- [ ] **Step 1: Độ trễ vọng.** Với `s1-loa`, `s2-loa`, `s1w-loa-win`: `score --scene $D/scenes/<cảnh> --echo-delay`. Ghi số ms; đây là căn cứ cho thời gian giữ của B và `--delay-ms` của C.
- [ ] **Step 2: Khử vọng cho phương án C.** Với `s1-loa`, `s2-loa`, `s3-tai-nghe`: `$LB aec --playback $D/scenes/<cảnh>/playback.wav --mic $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-aec.wav --delay-ms <số ở Step 1>`. Ghi dòng `AEC3: x% một nhân`.
- [ ] **Step 3: Chạy `mix-eval`** (chạy nền được; mỗi cảnh 52 phương án, vài chục phút trên M4 Pro): `for s in s1-loa s2-loa s3-tai-nghe; do $LB mix-eval --scene $D/scenes/$s --variants $B/variants/echo.json $ASR --out $D/results/$s/echo; done`
- [ ] **Step 4: Chấm.** `for s in s1-loa s2-loa s3-tai-nghe; do score --scene $D/scenes/$s --results $D/results/$s/echo; done`
- [ ] **Step 5: Áp luật chốt của spec §6.3** và ghi vào `results/tieng-vong.md`:
  - bảng A, C, mọi B của cảnh 1 và 2, đối chứng cảnh 3;
  - **mức đạt của B:** cảnh 1, lỗi online của B ≤ lỗi online cảnh 3 × 1,10; giữ câu trong phòng của B ≥ 0,95 × giữ câu trong phòng của cảnh 4 ở 1 m (lấy ở Task 19, Step 3, phương án `N-khong-v5-m250`);
  - **chọn B:** bộ tham số tốt nhất trên cảnh 1 và 2 cộng lại, ưu tiên lỗi online rồi tới giữ câu trong phòng;
  - **có nâng lên C không:** đủ bốn điều kiện của §6.3 (cảnh 2 lỗi trong phòng của C tốt hơn B ≥ 20% tương đối; các cảnh khác không kém quá 2%; CPU AEC3 ≤ 5% một nhân trên i5, đo bằng `latency-bench aec` trên Windows nếu C còn ứng viên; chạy liền 30 phút không mất hội tụ: chạy `aec` trên bản thu 30 phút nếu có, so lỗi nửa đầu và nửa sau);
  - cảnh 5 (nếu có): nghe `mix-eval --save-wav` của B đã chọn, đếm câu trùng và câu sót bằng tay.
- [ ] **Step 6: Kiểm VAD chặt hơn không hại tiếng online.** Đợi Task 19 chọn xong lớp 4, rồi chạy `python3 $B/make_variants.py both-vad --gate=<B đã chọn> > $B/variants/both-vad.json`, `mix-eval` trên `s1-loa` vào `$D/results/s1-loa/both-vad`, chấm, và kiểm lỗi online không tệ thêm quá 5% (tương đối) so với B cùng VAD mặc định.
- [ ] **Step 7: Không bộ B nào đạt mức:** dừng, báo chủ dự án kèm bảng, không làm Task 20.
- [ ] **Step 8: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/tieng-vong.md bench/2026-10-24-nguon-micro/variants && git commit -m "docs(bench): kết quả đo tiếng vọng, chọn tham số nhường lời"
```

---

### Task 19: Đo chống tiếng ồn (cảnh 4, 6, 7)

**Files:** Tạo `bench/2026-10-24-nguon-micro/results/chong-on.md`

Dùng cùng biến `D`, `B`, `LB`, `ASR` và hàm `score` như Task 18. Các cảnh: `s4-1m`, `s4-3m`, `s6-on`, `s7-on` (và bản `-win` nếu có).

- [ ] **Step 1: RNNoise.** Với mỗi cảnh: `$LB denoise --input $D/scenes/<cảnh>/mic-raw.wav --reference $D/scenes/<cảnh>/mic.wav --out $D/scenes/<cảnh>/mic-rnnoise.wav --write-48k $D/scenes/<cảnh>/mic-48k.wav`
- [ ] **Step 2: DeepFilterNet3 (hỏi chủ dự án trước khi tải và chạy binary ngoài).**
  - Liệt kê bản phát hành bằng `gh release view v0.5.6 -R Rikorose/DeepFilterNet --json assets -q '.assets[].name'`, chọn binary `deep-filter` cho macOS arm64.
  - Tải vào một thư mục mới trống (`$D/tools/deep-filter/`), ghi SHA-256 vào `results/chong-on.md`, `chmod +x`.
  - Chạy: `$D/tools/deep-filter/<binary> -o $D/scenes/<cảnh>/dfn $D/scenes/<cảnh>/mic-48k.wav`, rồi `$LB align --reference $D/scenes/<cảnh>/mic.wav --input $D/scenes/<cảnh>/dfn/mic-48k.wav --out $D/scenes/<cảnh>/mic-dfn.wav`.
  - Tham số dòng lệnh thật của `deep-filter` xem bằng `--help`. Không chạy được thì ghi lý do, bỏ các phương án `dfn` (xóa khỏi `noise.json`), báo chủ dự án.
- [ ] **Step 3: `mix-eval` và chấm.** `for s in s4-1m s4-3m s6-on s7-on; do $LB mix-eval --scene $D/scenes/$s --variants $B/variants/noise.json $ASR --out $D/results/$s/noise && score --scene $D/scenes/$s --results $D/results/$s/noise; done`
- [ ] **Step 4: Áp luật chốt của spec §6.3** và ghi vào `results/chong-on.md`:
  - **chữ ảo:** `s6-on`, ≤ 1 câu ảo mỗi 10 phút (cột "Ảo/10 phút" ≤ 1,0, tức tối đa 1 câu trên 18 phút); kèm bảng câu ảo theo loại tiếng (`phantoms_by_cue`) và nguyên văn chữ ảo của tổ hợp được chọn;
  - **câu ngắn:** `s7-on`, giữ câu ngắn ≥ 80%;
  - **câu thường có ồn:** lỗi trong phòng của `s7-on` ≤ lỗi trong phòng của `s4-1m` (cùng tổ hợp) × 1,15;
  - **không hại khi yên tĩnh:** `s4-1m` của tổ hợp được chọn ≤ `N-khong-v5-m250` × 1,05;
  - **CPU:** dòng `RNNoise:` (và DeepFilterNet nếu chọn) trên i5 ≤ 10% một nhân (Task 17 Step 5);
  - **chọn:** tổ hợp nhẹ nhất đạt đủ, theo thứ tự không lọc ồn → RNNoise → DeepFilterNet. Trong cùng bộ lọc, chọn VAD (lớp 4) và `+su` (lớp 5) lỏng nhất mà vẫn đạt mức chữ ảo. "Whisper nghe bản đã lọc" chỉ chọn khi lỗi `s7-on` tốt hơn mà `s4-1m` không tệ hơn;
  - **độ nhạy micro:** `s4-3m` so với `s4-1m`, giữ câu trong phòng; bỏ sót trên 10% thì ghi "cân nhắc AGC" cho chủ dự án;
  - nếu chọn DeepFilterNet: ghi rõ phải lấy thư viện từ đâu (crates.io `deep_filter` 0.2.5 năm 2022, hay git), và việc này **cần chủ dự án quyết** theo §6.12.
- [ ] **Step 5: Không tổ hợp nào đạt mức chữ ảo:** dừng, báo chủ dự án kèm bảng theo từng loại tiếng.
- [ ] **Step 6: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/chong-on.md bench/2026-10-24-nguon-micro/variants && git commit -m "docs(bench): kết quả đo chống tiếng ồn ở micro, chọn bộ lọc và tham số"
```

---

### Task 20: Tổng hợp, ghi tham số chốt vào spec, xin duyệt

**Files:**
- Tạo: `bench/2026-10-24-nguon-micro/results/ket-qua.md`
- Sửa: `docs/superpowers/specs/2026-10-24-nguon-micro-design.md` (thêm mục 16 "Kết quả spike")

- [ ] **Step 1: Mốc A4-mic.** Chạy phương án tốt nhất của Task 19 trên `s4-1m` và `s4-3m` với gói Nhẹ (`--asr-model $M/models/ggml-small-q5_1.bin`, out `$D/results/<cảnh>/nhe`), rồi chấm. Ghi lỗi theo từng ngôn ngữ cho cả gói Chuẩn và gói Nhẹ: đây là mốc A4-mic (spec §11).
- [ ] **Step 2: Viết `results/ket-qua.md`**, gồm:
  - điều kiện đo (máy, hệ điều hành, phiên bản các binary, model);
  - kết luận S-M4 của hai hệ điều hành;
  - tham số B đã chọn (hay C), kèm bảng rút gọn;
  - bộ lọc ồn và tham số lớp 4, 5 đã chọn, kèm bảng rút gọn;
  - mốc A4-mic;
  - CPU;
  - lệch đồng hồ, kèm kết luận có cần phương án dự phòng của §5.1 không;
  - các việc phải quyết thêm (AGC, DeepFilterNet nếu có).
- [ ] **Step 3: Thêm vào cuối spec, trước `## Tham khảo`:**

```markdown
## 16. Kết quả spike (kế hoạch 01)

Số liệu và bảng đầy đủ: `bench/2026-10-24-nguon-micro/results/ket-qua.md`.

- Tiếng vọng: <B với ngưỡng … dBFS, mức hạ … dB, giữ … ms | C>; lý do: <…>.
- Chống tiếng ồn: lớp 2 <không | RNNoise | DeepFilterNet>; whisper nghe <bản chỉ lọc 80 Hz | bản đã lọc>; VAD khi có micro
  `threshold` <…>, `min_speech_ms` <…>; `ShortUnsure`: `short_vad_prob_min` <…>, `short_speech_ms_min` <…>.
- Quyền micro: <macOS: … ; Windows: …>.
- Lệch đồng hồ micro và Playback: <…>; phương án dự phòng §5.1: <cần | không cần>.
```

Điền mọi chỗ `<…>` bằng số và lựa chọn thật. Không để sót chỗ nào.

- [ ] **Step 4: Commit**

```bash
cd $W && git add bench/2026-10-24-nguon-micro/results/ket-qua.md docs/superpowers/specs/2026-10-24-nguon-micro-design.md && git commit -m "docs: kết quả spike nguồn micro và tham số chốt"
```

- [ ] **Step 5: Dừng, xin duyệt.** Báo chủ dự án bằng bản tóm tắt `ket-qua.md`. Chủ dự án duyệt thì mới viết kế hoạch 02 (chế độ `mic`), 03 (chế độ `both`), 04 (phát hành) bằng skill writing-plans, dùng tham số đã chốt.

---

## Ghi chú cho kế hoạch sau

- `objc2-av-foundation` vào app từ kế hoạch 02: chạy lại công cụ sinh `THIRD_PARTY_NOTICES.txt` (`about.toml`) khi phát hành.
- `nnnoiseless` hay `sonora` chỉ vào app nếu spike chọn. Khi đó chuyển code từ `latency-bench` sang `audio-capture`, theo §6.12.
- Windows chưa đọc loại kết nối của micro (`Transport::Other`). Kế hoạch 02 quyết có cần cho log hay không.
