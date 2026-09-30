# Giai đoạn 0 · 03: S3 (asr-worker, VAD, chọn ngôn ngữ) và S7 phần nhận dạng (A4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mục tiêu:**
- Chạy `asr-worker` như tiến trình phụ qua stdin/stdout.
- Chốt cách chạy Silero VAD (§6.3).
- Đưa chi phí nhận diện ngôn ngữ xuống dưới 20% thời gian nhận dạng (§6.4, giả định 9) và đo chi phí truyền qua pipe (giả định 10).
- Kiểm hai bản `asr-worker` Vulkan/CPU và `--probe` trên Windows.
- Ước lượng dung lượng bộ cài (§6.11).
- Dựng bộ clip A4 và lấy mốc WER/CER: turbo so với small, `audio_ctx` rút ngắn so với 30 giây (giả định 8), khóa ngôn ngữ so với tự nhận diện.

**Kiến trúc:**
- `crates/pipeline` (phần 1):
  - bộ cắt đoạn theo VAD (`segmenter`);
  - Silero VAD chạy bằng candle-onnx trong tiến trình chính (`vad`);
  - client nói chuyện với `asr-worker` (`asr_client`).
- `crates/asr-worker`: binary link tĩnh whisper.cpp qua whisper-rs, có hai chế độ giải mã.
  - Chế độ A (`split`): nhận diện ngôn ngữ trên 3 giây đầu bằng một state riêng, rồi `whisper_full`.
  - Chế độ B (`shared`): một lượt encode dùng chung, tự giải mã greedy. Cần vá whisper.cpp và whisper-rs, bản vá nằm trong `third_party/`. B là mặc định khi build với feature `shared-encode`; đặt `ASR_MODE=split` để chạy A.
- `crates/latency-bench asr-eval` chép lời bộ clip; `bench/phase0/asr/score_asr.py` chấm điểm.

**Công nghệ:**
- whisper-rs 0.16.0 / whisper-rs-sys 0.15.0 (whisper.cpp 1.8.3).
- candle-core / candle-onnx 0.11.0.
- ash 0.38.0 (chỉ cho `--probe`).
- clap 4.6.7, hound 3.5.1.
- Python 3.12 qua uv: numpy 2.5.3, scipy 1.18.1, jiwer 4.0.0, onnxruntime 1.30.0.
- FLEURS (CC BY 4.0).

Tổng quan: `docs/superpowers/plans/2026-09-29-giai-doan-0-00-tong-quan.md`. Cần xong kế hoạch 01. Task 1–13 làm trên Mac, Task 14–17 làm trên Windows.

---

### Task 1: Bộ cắt đoạn theo VAD (TDD)

**Files:**
- Create: `crates/pipeline/Cargo.toml`
- Create: `crates/pipeline/src/lib.rs`
- Create: `crates/pipeline/src/segmenter.rs`

Quy tắc theo §6.3:
- Ngưỡng 0,5; tắt khi xác suất xuống dưới 0,35 (trễ 0,15, để không chập chờn quanh ngưỡng).
- Tiếng nói ngắn nhất 250 ms; im lặng 300 ms thì chốt đoạn.
- Đoạn dài tối đa 8 giây. Quá thì cắt tại khung có năng lượng thấp nhất trong 1,5 giây cuối. Phần còn lại là phần nối tiếp của câu, nên được giữ kể cả khi ngắn hơn 250 ms; nếu không, đuôi câu dài sẽ mất mà không ai biết.
- Đệm 200 ms ở hai đầu (làm tròn lên 7 khung 32 ms).
- `start_ms`/`end_ms` là mốc của phần tiếng nói, `samples` gồm cả phần đệm.
- Test kiểm cả nội dung `samples` từng khung (mỗi khung mang dấu riêng), không chỉ độ dài: pre-roll, đệm đuôi, phía cắt cưỡng bức, nói liền 30 giây, `flush`.

- [ ] **Step 1: Tạo `crates/pipeline/Cargo.toml`** (bản của phần 1; `reqwest` thêm ở kế hoạch 06)

```toml
[package]
name = "pipeline"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
anyhow.workspace = true
asr-protocol = { path = "../asr-protocol" }
candle-core = "0.11.0"
candle-onnx = "0.11.0"
serde.workspace = true
serde_json.workspace = true

[dev-dependencies]
hound.workspace = true
```

- [ ] **Step 2: Tạo `crates/pipeline/src/lib.rs`**

```rust
pub mod segmenter;
```

- [ ] **Step 3: Viết test trước.** Tạo `crates/pipeline/src/segmenter.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn frame(value: f32) -> Vec<f32> {
        vec![value; FRAME_SAMPLES]
    }

    /// Chạy một chuỗi (xác suất, biên độ) qua segmenter.
    fn run(seg: &mut Segmenter, pattern: &[(f32, f32, usize)]) -> Vec<Segment> {
        let mut out = Vec::new();
        for &(prob, amp, n) in pattern {
            for _ in 0..n {
                out.extend(seg.push(&frame(amp), prob));
            }
        }
        out
    }

    #[test]
    fn short_blip_is_ignored() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        // 5 khung = 160 ms < 250 ms.
        let out = run(&mut seg, &[(0.0, 0.0, 10), (0.9, 0.5, 5), (0.0, 0.0, 20)]);
        assert!(out.is_empty());
    }

    #[test]
    fn speech_then_silence_gives_one_padded_segment() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        // 20 khung im lặng, 31 khung tiếng nói (992 ms), rồi im lặng.
        let out = run(&mut seg, &[(0.0, 0.0, 20), (0.9, 0.5, 31), (0.0, 0.0, 20)]);
        assert_eq!(out.len(), 1);
        let s = &out[0];
        assert_eq!(s.start_ms, 20 * FRAME_MS);
        assert_eq!(s.end_ms, 51 * FRAME_MS);
        // 7 khung đệm trước + 31 khung tiếng nói + 7 khung đệm sau (200 ms làm tròn lên 7 khung).
        assert_eq!(s.samples.len(), (7 + 31 + 7) * FRAME_SAMPLES);
    }

    #[test]
    fn segment_closes_exactly_after_end_silence() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        run(&mut seg, &[(0.9, 0.5, 10)]);
        // 300 ms = 10 khung: khung im lặng thứ 10 chốt đoạn.
        let out = run(&mut seg, &[(0.0, 0.0, 9)]);
        assert!(out.is_empty());
        let out = run(&mut seg, &[(0.0, 0.0, 1)]);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn longer_end_silence_setting_delays_closing() {
        let cfg = SegmenterConfig {
            end_silence_ms: 800,
            ..Default::default()
        };
        let mut seg = Segmenter::new(cfg);
        let out = run(&mut seg, &[(0.9, 0.5, 10), (0.0, 0.0, 20)]);
        assert!(out.is_empty(), "800 ms = 25 khung, mới có 20");
        let out = run(&mut seg, &[(0.0, 0.0, 5)]);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn hysteresis_zone_does_not_start_silence() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        // Xác suất 0,4 nằm giữa 0,35 và 0,5: vẫn là tiếng nói.
        let out = run(&mut seg, &[(0.9, 0.5, 10), (0.4, 0.3, 30), (0.0, 0.0, 10)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].end_ms, 40 * FRAME_MS);
    }

    #[test]
    fn long_speech_is_cut_at_lowest_energy_frame_near_8_seconds() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        // 8 giây = 250 khung. Khung năng lượng thấp nhất ở khung 230, nằm trong 1,5 giây cuối.
        let mut out = run(&mut seg, &[(0.9, 0.5, 230), (0.9, 0.01, 1), (0.9, 0.5, 18)]);
        assert!(out.is_empty());
        out.extend(run(&mut seg, &[(0.9, 0.5, 1)]));
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].start_ms, 0);
        assert_eq!(out[0].end_ms, 230 * FRAME_MS);
        // Phần còn lại tiếp tục thành đoạn mới, chốt khi im lặng.
        let rest = run(&mut seg, &[(0.9, 0.5, 30), (0.0, 0.0, 10)]);
        assert_eq!(rest.len(), 1);
        assert_eq!(rest[0].start_ms, 230 * FRAME_MS);
    }

    #[test]
    fn flush_emits_pending_speech() {
        let mut seg = Segmenter::new(SegmenterConfig::default());
        run(&mut seg, &[(0.9, 0.5, 20)]);
        let s = seg.flush().expect("còn đoạn đang dở");
        assert_eq!(s.end_ms, 20 * FRAME_MS);
        assert!(seg.flush().is_none());
    }

    // ---- Test bổ sung (review): kiểm NỘI DUNG samples và các ca biên ----

    /// Đưa khung vào segmenter; mỗi khung mang dấu riêng (biên độ + chỉ số · 1e-7)
    /// để so được nội dung `samples`, không chỉ độ dài.
    struct Feed {
        seg: Segmenter,
        stream: Vec<Vec<f32>>,
        out: Vec<Segment>,
    }

    impl Feed {
        fn new() -> Self {
            Self {
                seg: Segmenter::new(SegmenterConfig::default()),
                stream: Vec::new(),
                out: Vec::new(),
            }
        }

        /// Mỗi phần tử: (xác suất, biên độ, số khung).
        fn run(&mut self, pattern: &[(f32, f32, usize)]) -> &mut Self {
            for &(prob, amp, n) in pattern {
                for _ in 0..n {
                    let f = vec![amp + self.stream.len() as f32 * 1e-7; FRAME_SAMPLES];
                    self.out.extend(self.seg.push(&f, prob));
                    self.stream.push(f);
                }
            }
            self
        }

        /// `samples` phải đúng bằng các khung [a, b) của luồng vào (không in cả vector khi sai).
        fn assert_samples(&self, s: &Segment, a: usize, b: usize) {
            assert!(
                s.samples == self.stream[a..b].concat(),
                "samples sai: có {} khung, cần các khung {a}..{b} ({} khung)",
                s.samples.len() / FRAME_SAMPLES,
                b - a
            );
        }
    }

    #[test]
    fn min_speech_boundary_is_8_frames() {
        // 7 khung = 224 ms < 250 ms: bỏ. 8 khung = 256 ms: giữ.
        for (n, expected) in [(7, 0), (8, 1)] {
            let mut f = Feed::new();
            f.run(&[(0.0, 0.0, 12), (0.9, 0.5, n), (0.0, 0.0, 20)]);
            assert_eq!(f.out.len(), expected, "{n} khung tiếng nói");
        }
    }

    #[test]
    fn preroll_and_tail_content_is_exact() {
        let mut f = Feed::new();
        f.run(&[(0.0, 0.0, 20), (0.9, 0.5, 31), (0.0, 0.0, 20)]);
        // 7 khung đệm trước (13..20), 31 khung tiếng nói (20..51), 7 khung đệm sau (51..58).
        f.assert_samples(&f.out[0], 13, 58);
    }

    #[test]
    fn dropped_blip_still_gives_next_segment_a_full_preroll() {
        let mut f = Feed::new();
        // Blip 5 khung (20..25) bị bỏ khi chốt ở khung 34; tiếng nói thật bắt đầu ở khung 37.
        f.run(&[
            (0.0, 0.0, 20),
            (0.9, 0.5, 5),
            (0.0, 0.0, 12),
            (0.9, 0.5, 12),
            (0.0, 0.0, 12),
        ]);
        assert_eq!(f.out.len(), 1);
        assert_eq!(f.out[0].start_ms, 37 * FRAME_MS);
        f.assert_samples(&f.out[0], 30, 56);
    }

    #[test]
    fn speech_resuming_inside_a_pause_keeps_one_segment() {
        let mut f = Feed::new();
        // Im lặng 9 khung (chưa đủ 10) rồi nói tiếp: vẫn một đoạn, đếm im lặng bắt đầu lại từ 0.
        f.run(&[(0.9, 0.5, 10), (0.0, 0.0, 9), (0.9, 0.5, 10), (0.0, 0.0, 10)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!((f.out[0].start_ms, f.out[0].end_ms), (0, 29 * FRAME_MS));
    }

    #[test]
    fn zone_after_silence_started_counts_as_silence() {
        // Đã có 5 khung im lặng thì các khung 0,4 (vùng giữa) không làm đếm lại: đủ 10 khung là chốt.
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 10), (0.0, 0.0, 5), (0.4, 0.3, 4)]);
        assert!(f.out.is_empty());
        f.run(&[(0.4, 0.3, 1)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!(f.out[0].end_ms, 10 * FRAME_MS);
    }

    #[test]
    fn zone_alone_never_starts_a_segment() {
        let mut f = Feed::new();
        f.run(&[(0.4, 0.3, 60), (0.49, 0.3, 60)]);
        assert!(f.out.is_empty());
        assert!(f.seg.flush().is_none());
    }

    #[test]
    fn forced_cut_has_no_padding_on_cut_side_and_pieces_are_contiguous() {
        let mut f = Feed::new();
        // Năng lượng tăng nhẹ theo chỉ số khung nên khung thấp nhất là khung đầu cửa sổ (250 - 47 = 203).
        f.run(&[(0.9, 0.5, 250)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!((f.out[0].start_ms, f.out[0].end_ms), (0, 203 * FRAME_MS));
        f.assert_samples(&f.out[0], 0, 203); // không đệm phía cắt
        f.run(&[(0.9, 0.5, 10), (0.0, 0.0, 12)]);
        assert_eq!(f.out.len(), 2);
        assert_eq!((f.out[1].start_ms, f.out[1].end_ms), (203 * FRAME_MS, 260 * FRAME_MS));
        f.assert_samples(&f.out[1], 203, 260 + 7); // phần dư: không pre-roll, có đệm đuôi
    }

    #[test]
    fn forced_cut_at_current_frame_leaves_a_one_frame_rest() {
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 249), (0.9, 0.001, 1)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!(f.out[0].samples.len(), 249 * FRAME_SAMPLES);
        f.run(&[(0.9, 0.5, 20), (0.0, 0.0, 12)]);
        assert_eq!(f.out.len(), 2);
        assert_eq!(f.out[1].start_ms, 249 * FRAME_MS);
    }

    #[test]
    fn forced_cut_rest_with_less_than_min_speech_is_still_emitted() {
        // Khung 248 thấp nhất nên cắt ở 248; tiếng nói dừng sau khung 252 (5 khung = 160 ms < 250 ms).
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 248), (0.9, 0.001, 1), (0.9, 0.5, 4), (0.0, 0.0, 12)]);
        assert_eq!(f.out.len(), 2, "đuôi của câu dài không được bị min_speech loại");
        assert_eq!((f.out[1].start_ms, f.out[1].end_ms), (248 * FRAME_MS, 253 * FRAME_MS));
    }

    #[test]
    fn forced_cut_rest_that_holds_only_silence_is_dropped() {
        // Cắt rơi vào chuỗi im lặng đang đếm dở (245 khung nói + 5 im lặng), im lặng kéo dài tới 10 khung.
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 245), (0.0, 0.0, 5), (0.0, 0.0, 10)]);
        assert_eq!(f.out.len(), 1);
        assert_eq!(f.out[0].end_ms, 245 * FRAME_MS);
    }

    #[test]
    fn thirty_seconds_of_continuous_speech_gives_contiguous_segments_up_to_8_seconds() {
        let mut f = Feed::new();
        let mut x = 12345u32; // xorshift: biên độ ngẫu nhiên để khung thấp nhất rải khắp cửa sổ
        for _ in 0..938 {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            f.run(&[(0.95, (20 + x % 580) as f32 / 1000.0, 1)]);
        }
        f.run(&[(0.0, 0.0, 12)]);
        assert_eq!(f.out.len(), 5);
        assert_eq!(f.out[0].start_ms, 0);
        assert_eq!(f.out[4].end_ms, 938 * FRAME_MS);
        for w in f.out.windows(2) {
            assert_eq!(w[0].end_ms, w[1].start_ms, "hai đoạn liền nhau phải nối khít");
        }
        assert!(f.out.iter().all(|s| s.end_ms - s.start_ms <= 8_000));
    }

    #[test]
    fn flush_keeps_the_same_tail_padding_as_a_normal_close() {
        let mut f = Feed::new();
        f.run(&[(0.9, 0.5, 20), (0.0, 0.0, 9)]);
        let s = f.seg.flush().expect("còn đoạn đang dở");
        f.assert_samples(&s, 0, 20 + 7); // đệm đuôi 7 khung, không phải 9
    }
}
```

- [ ] **Step 4: Chạy test để thấy lỗi**

Run: `cargo test -p pipeline`
Expected: FAIL, lỗi biên dịch vì chưa có `Segmenter`, `SegmenterConfig`, `Segment`, `FRAME_SAMPLES`, `FRAME_MS`. Lần đầu build candle mất vài phút, và cần `protoc` (kế hoạch 01).

- [ ] **Step 5: Viết phần code** ở đầu `crates/pipeline/src/segmenter.rs`, phía trên `#[cfg(test)]`:

```rust
//! Cắt âm thanh thành đoạn theo xác suất VAD (spec §6.3).
//!
//! Đầu vào là từng khung 512 mẫu (32 ms ở 16 kHz) kèm xác suất có tiếng nói.
//! Thời gian tính theo số khung, nên luồng vào phải liền mạch theo đồng hồ thật
//! (trên Windows, luồng thu đã được chèn im lặng vào khoảng trống, spec §6.1).

use std::collections::VecDeque;

pub const FRAME_SAMPLES: usize = 512;
pub const FRAME_MS: u64 = 32;

#[derive(Clone, Debug)]
pub struct SegmenterConfig {
    pub threshold: f32,
    pub min_speech_ms: u64,
    /// `vadEndSilenceMs` trong cài đặt, 200–800 ms.
    pub end_silence_ms: u64,
    pub max_segment_ms: u64,
    /// Cắt cưỡng bức tại khung năng lượng thấp nhất trong khoảng này ở cuối đoạn.
    pub force_cut_window_ms: u64,
    pub pad_ms: u64,
}

impl Default for SegmenterConfig {
    fn default() -> Self {
        Self {
            threshold: 0.5,
            min_speech_ms: 250,
            end_silence_ms: 300,
            max_segment_ms: 8_000,
            force_cut_window_ms: 1_500,
            pad_ms: 200,
        }
    }
}

#[derive(Clone, PartialEq)]
pub struct Segment {
    pub id: u64,
    /// Ranh giới tiếng nói, tính từ đầu phiên, không gồm phần đệm.
    pub start_ms: u64,
    pub end_ms: u64,
    /// Âm thanh 16 kHz mono, đã gồm phần đệm: 200 ms làm tròn lên 7 khung (224 ms) mỗi phía. Đầu phiên,
    /// cuối phiên (`flush`) và phía bị cắt cưỡng bức có ít hơn. Đệm cuối của đoạn trước có thể trùng đệm đầu
    /// của đoạn sau (đều là khung im lặng), nên không được ghép `samples` của hai đoạn liền nhau mà coi như
    /// không chồng nhau.
    pub samples: Vec<f32>,
}

struct Active {
    start_frame: u64,
    pre_roll: Vec<Vec<f32>>,
    frames: Vec<Vec<f32>>,
    energies: Vec<f32>,
    last_speech_frame: u64,
    silence_run: u64,
    /// Phần dư sau cắt cưỡng bức đang còn tiếng nói: nối tiếp một đoạn dài, không áp `min_speech`.
    continuation: bool,
}

pub struct Segmenter {
    cfg: SegmenterConfig,
    frame_index: u64,
    history: VecDeque<Vec<f32>>,
    active: Option<Active>,
    next_id: u64,
}

fn frames_for(ms: u64) -> u64 {
    ms.div_ceil(FRAME_MS)
}

impl Segmenter {
    pub fn new(cfg: SegmenterConfig) -> Self {
        Self {
            cfg,
            frame_index: 0,
            history: VecDeque::new(),
            active: None,
            next_id: 0,
        }
    }

    /// Đưa một khung vào. Trả các đoạn vừa được chốt ở khung này (thường 0 hoặc 1).
    pub fn push(&mut self, frame: &[f32], prob: f32) -> Vec<Segment> {
        assert_eq!(frame.len(), FRAME_SAMPLES, "mỗi khung phải có {FRAME_SAMPLES} mẫu");
        let index = self.frame_index;
        self.frame_index += 1;
        let pad_frames = frames_for(self.cfg.pad_ms) as usize;
        // Như Silero: ngưỡng tắt không xuống dưới 0,01, nếu không im lặng sẽ không bao giờ bắt đầu.
        let neg_threshold = (self.cfg.threshold - 0.15).max(0.01);
        let mut out = Vec::new();

        let Some(active) = self.active.as_mut() else {
            if prob >= self.cfg.threshold {
                self.active = Some(Active {
                    start_frame: index,
                    pre_roll: self.history.drain(..).collect(),
                    frames: vec![frame.to_vec()],
                    energies: vec![energy(frame)],
                    last_speech_frame: index,
                    silence_run: 0,
                    continuation: false,
                });
            } else {
                self.history.push_back(frame.to_vec());
                while self.history.len() > pad_frames {
                    self.history.pop_front();
                }
            }
            return out;
        };

        active.frames.push(frame.to_vec());
        active.energies.push(energy(frame));
        if prob >= self.cfg.threshold {
            active.last_speech_frame = index;
            active.silence_run = 0;
        } else if prob < neg_threshold || active.silence_run > 0 {
            // Vùng giữa hai ngưỡng giữ nguyên trạng thái trước đó (hysteresis).
            active.silence_run += 1;
        } else {
            active.last_speech_frame = index;
        }

        if active.silence_run >= frames_for(self.cfg.end_silence_ms).max(1) {
            let active = self.active.take().expect("đang có đoạn");
            let speech_end = active.last_speech_frame + 1;
            let speech_frames = speech_end.saturating_sub(active.start_frame);
            let keep = ((speech_frames as usize) + pad_frames).min(active.frames.len());
            if active.continuation || speech_frames * FRAME_MS >= self.cfg.min_speech_ms {
                out.push(self.emit(active.start_frame, speech_end, &active.pre_roll, &active.frames[..keep]));
            }
            let tail_start = active.frames.len().saturating_sub(pad_frames);
            self.history = active.frames[tail_start..].iter().cloned().collect();
            return out;
        }

        let length_frames = index + 1 - active.start_frame;
        if length_frames * FRAME_MS >= self.cfg.max_segment_ms {
            let window = (frames_for(self.cfg.force_cut_window_ms) as usize).min(active.frames.len() - 1);
            let from = active.frames.len() - window;
            let cut = (from..active.frames.len())
                .min_by(|&a, &b| active.energies[a].total_cmp(&active.energies[b]))
                .expect("cửa sổ không rỗng");
            let mut active = self.active.take().expect("đang có đoạn");
            let cut_frame = active.start_frame + cut as u64;
            let rest_frames = active.frames.split_off(cut);
            let rest_energies = active.energies.split_off(cut);
            out.push(self.emit(active.start_frame, cut_frame, &active.pre_roll, &active.frames));
            self.active = Some(Active {
                start_frame: cut_frame,
                pre_roll: Vec::new(),
                frames: rest_frames,
                energies: rest_energies,
                last_speech_frame: active.last_speech_frame,
                silence_run: active.silence_run,
                continuation: active.last_speech_frame >= cut_frame,
            });
        }
        out
    }

    /// Chốt đoạn đang dở khi hết luồng.
    pub fn flush(&mut self) -> Option<Segment> {
        let active = self.active.take()?;
        let pad_frames = frames_for(self.cfg.pad_ms) as usize;
        let speech_end = active.last_speech_frame + 1;
        let speech_frames = speech_end.saturating_sub(active.start_frame);
        let keep = (speech_frames as usize + pad_frames).min(active.frames.len());
        (active.continuation || speech_frames * FRAME_MS >= self.cfg.min_speech_ms)
            .then(|| self.emit(active.start_frame, speech_end, &active.pre_roll, &active.frames[..keep]))
    }

    fn emit(&mut self, start_frame: u64, end_frame: u64, pre_roll: &[Vec<f32>], frames: &[Vec<f32>]) -> Segment {
        let id = self.next_id;
        self.next_id += 1;
        let samples = pre_roll.iter().chain(frames).flatten().copied().collect();
        Segment {
            id,
            start_ms: start_frame * FRAME_MS,
            end_ms: end_frame * FRAME_MS,
            samples,
        }
    }
}

// Debug viết tay: không in hàng trăm nghìn mẫu âm thanh (và âm thanh không vào log, spec §10.1).
impl std::fmt::Debug for Segment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Segment")
            .field("id", &self.id)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

fn energy(frame: &[f32]) -> f32 {
    frame.iter().map(|x| x * x).sum::<f32>() / frame.len() as f32
}
```

- [ ] **Step 6: Chạy lại test**

Run: `cargo test -p pipeline`
Expected: PASS, `test result: ok. 19 passed`

- [ ] **Step 7: Commit**

```bash
git add crates/pipeline Cargo.lock
git commit -m "feat(pipeline): cắt đoạn theo VAD (300 ms im lặng, tối đa 8 giây, đệm 200 ms)"
```

### Task 2: Silero VAD bằng candle-onnx, so với onnxruntime

**Files:**
- Create: `crates/pipeline/tests/vad_reference.rs`
- Create: `crates/pipeline/src/vad.rs`
- Modify: `crates/pipeline/src/lib.rs`
- Create: `crates/pipeline/examples/vad_probe.rs`
- Create: `bench/phase0/vad/ref_probs.py`
- Modify: `deny.toml`

Không dùng `ort`, vì crate này chỉ có bản 2.0.0-rc.13 mà §6.12 không cho dùng bản rc. Không dùng file `silero_vad_op18_ifless.onnx`, vì candle không chạy được. Mỗi khung 512 mẫu được ghép thêm 64 mẫu cuối của khung trước, giống `OnnxWrapper` của silero-vad.

Ba điểm phải có trong code:
- State trả về phải `detach()`. candle-onnx dựng trọng số LSTM bằng `Var`, nên nếu không detach thì state kéo theo đồ thị tính của mọi khung trước. Review lúc thực thi đo được RSS tăng khoảng 1 GB mỗi phút, và tràn stack khi `reset()` hoặc drop sau vài phút. Một `debug_assert!` kiểm điều này ở mỗi khung.
- Tên input/output so khớp chính xác (`input`, `state`, `sr`, `output`, `stateN`).
- Lúc nạp model chạy thử một khung im lặng, để lỗi định dạng lộ ra ngay.

Test tham chiếu mặc định bị `#[ignore]`, vì cần model và file thử. Test so từng khung nên bắt được cả NaN, chạy thêm 4.000 khung rồi `reset()` để bắt rò bộ nhớ, và kiểm kết quả sau `reset()` giống hệt lúc mới nạp.

- [ ] **Step 1: Viết test so sánh trước**

```rust
//! So xác suất VAD của candle-onnx với onnxruntime (bench/phase0/vad/ref_probs.py), rồi chạy dài để bắt rò bộ nhớ.
//! Cần model và file tham chiếu nên mặc định bị bỏ qua. Chạy lại mỗi khi nâng candle-core hoặc candle-onnx.
//! Đường dẫn phải là tuyệt đối, vì cargo chạy test trong thư mục của crate:
//!   SILERO_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx VAD_TEST_WAV=$PWD/... VAD_REF_JSON=$PWD/... \
//!     cargo test -p pipeline --test vad_reference -- --include-ignored

use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| panic!("chưa đặt {name} (xem doc đầu file)"))
}

#[test]
#[ignore = "cần SILERO_VAD_MODEL, VAD_TEST_WAV, VAD_REF_JSON"]
fn candle_matches_onnxruntime() {
    let expected: Vec<f32> = serde_json::from_reader(std::fs::File::open(env("VAD_REF_JSON")).unwrap()).unwrap();
    let mut vad = SileroVad::load(Path::new(&env("SILERO_VAD_MODEL"))).unwrap();
    let mut reader = hound::WavReader::open(env("VAD_TEST_WAV")).unwrap();
    let spec = reader.spec();
    assert!(
        spec.sample_rate == 16_000 && spec.channels == 1 && spec.bits_per_sample == 16,
        "cần WAV 16 kHz mono 16-bit"
    );
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
    let frames = samples.as_chunks::<FRAME_SAMPLES>().0;
    let got: Vec<f32> = frames.iter().map(|f| vad.prob(f).unwrap()).collect();
    assert_eq!(got.len(), expected.len());
    // So từng khung: `NaN <= x` là false nên NaN cũng bị bắt.
    for (i, (g, e)) in got.iter().zip(&expected).enumerate() {
        assert!((g - e).abs() <= 1e-4, "khung {i}: candle {g}, onnxruntime {e}");
    }

    // Chạy thêm 4.000 khung (khoảng 2 phút) rồi reset: nếu state còn giữ đồ thị tính của các khung trước thì bộ nhớ
    // phình to, và việc hủy chuỗi đó làm tràn stack của luồng test (2 MiB).
    for f in frames.iter().cycle().take(4_000) {
        assert!(vad.prob(f).unwrap().is_finite());
    }
    vad.reset().unwrap();

    // Sau reset phải ra kết quả giống hệt lúc mới nạp.
    let again: Vec<f32> = frames.iter().map(|f| vad.prob(f).unwrap()).collect();
    assert!(again == got, "sau reset kết quả khác lúc mới nạp");
}
```

- [ ] **Step 2: Chạy để thấy lỗi**

Run: `cargo test -p pipeline --test vad_reference`
Expected: FAIL, lỗi biên dịch `unresolved import pipeline::vad`.

- [ ] **Step 3: Thêm module vào `crates/pipeline/src/lib.rs`**

```rust
pub mod segmenter;
pub mod vad;
```

- [ ] **Step 4: Tạo `crates/pipeline/src/vad.rs`**

```rust
//! Silero VAD chạy bằng candle-onnx trong tiến trình chính (spec §6.3).
//! Mỗi lần gọi nhận 512 mẫu 16 kHz, ghép thêm 64 mẫu cuối của khung trước làm ngữ cảnh.

use crate::segmenter::FRAME_SAMPLES;
use anyhow::{Context, Result, ensure};
use candle_core::{DType, Device, Tensor};
use std::collections::HashMap;
use std::path::Path;

const CONTEXT_SAMPLES: usize = 64;
const SAMPLE_RATE: i64 = 16_000;
// Tên input và output của silero_vad.onnx v6.2.3.
const INPUT: &str = "input";
const STATE: &str = "state";
const SR: &str = "sr";
const OUTPUT: &str = "output";
const STATE_OUT: &str = "stateN";

/// Bản debug cần khoảng 1 MiB stack cho mỗi lần suy luận, kể cả lần chạy thử trong `load()`, mà luồng chính của Windows
/// chỉ có 1 MiB. Vì vậy tạo và dùng `SileroVad` trên luồng riêng, đặt `std::thread::Builder::stack_size` từ 4 MiB.
pub struct SileroVad {
    model: candle_onnx::onnx::ModelProto,
    state: Tensor,
    context: Vec<f32>,
    device: Device,
}

impl SileroVad {
    pub fn load(path: &Path) -> Result<Self> {
        let model = candle_onnx::read_file(path).with_context(|| format!("không đọc được {}", path.display()))?;
        let graph = model.graph.as_ref().context("model ONNX không có graph")?;
        for name in [INPUT, STATE, SR] {
            ensure!(
                graph.input.iter().any(|i| i.name == name),
                "model không có input `{name}`"
            );
        }
        for name in [OUTPUT, STATE_OUT] {
            ensure!(
                graph.output.iter().any(|o| o.name == name),
                "model không có output `{name}`"
            );
        }
        let device = Device::Cpu;
        let mut vad = Self {
            model,
            state: Tensor::zeros((2, 1, 128), DType::F32, &device)?,
            context: vec![0.0; CONTEXT_SAMPLES],
            device,
        };
        // Chạy thử một khung im lặng, để model sai định dạng hay op không được hỗ trợ lộ ra ngay lúc nạp.
        let p = vad
            .prob(&[0.0; FRAME_SAMPLES])
            .context("chạy thử model Silero lúc nạp thất bại")?;
        ensure!((0.0..=1.0).contains(&p), "xác suất ngoài khoảng [0, 1]: {p}");
        ensure!(
            vad.state.dims() == [2, 1, 128],
            "state có kích thước lạ: {:?}",
            vad.state.dims()
        );
        vad.reset()?;
        Ok(vad)
    }

    /// Xóa state và ngữ cảnh. Gọi khi bắt đầu phiên, và khi luồng khung bị đứt (dừng rồi tiếp tục, đổi thiết bị),
    /// cùng lúc với việc tạo `Segmenter` mới. Không cần gọi sau khoảng im lặng dài: state tự hội tụ.
    pub fn reset(&mut self) -> Result<()> {
        self.state = Tensor::zeros((2, 1, 128), DType::F32, &self.device)?;
        self.context = vec![0.0; CONTEXT_SAMPLES];
        Ok(())
    }

    /// Xác suất có tiếng nói của một khung 512 mẫu. Khung cuối thiếu mẫu thì đệm 0 cho đủ rồi mới gọi.
    pub fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        ensure!(
            frame.len() == FRAME_SAMPLES,
            "khung VAD phải có {FRAME_SAMPLES} mẫu, nhận {}",
            frame.len()
        );
        let mut input = Vec::with_capacity(CONTEXT_SAMPLES + FRAME_SAMPLES);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(frame);
        let inputs = HashMap::from([
            (
                INPUT.to_string(),
                Tensor::from_vec(input, (1, CONTEXT_SAMPLES + FRAME_SAMPLES), &self.device)?,
            ),
            (STATE.to_string(), self.state.clone()),
            (SR.to_string(), Tensor::new(SAMPLE_RATE, &self.device)?),
        ]);
        let mut outputs = candle_onnx::simple_eval(&self.model, inputs)?;
        // candle-onnx dựng trọng số LSTM bằng `Var`, nên state trả về còn kéo theo đồ thị tính của mọi khung trước.
        // Không `detach` thì mỗi khung giữ thêm khoảng 0,5 MB, và việc hủy chuỗi đó làm tràn stack sau vài phút.
        self.state = outputs.remove(STATE_OUT).context("thiếu output state")?.detach();
        debug_assert!(!self.state.track_op(), "state còn kéo theo đồ thị tính");
        self.context.copy_from_slice(&frame[FRAME_SAMPLES - CONTEXT_SAMPLES..]);
        let prob = outputs.remove(OUTPUT).context("thiếu output xác suất")?;
        prob.flatten_all()?
            .to_vec1::<f32>()?
            .first()
            .copied()
            .context("output xác suất rỗng")
    }
}
```

- [ ] **Step 5: Tạo script tham chiếu `bench/phase0/vad/ref_probs.py`**

```python
"""S3: xác suất Silero VAD tham chiếu bằng onnxruntime, để so với bản candle-onnx trong crate `pipeline`.

Ghép 64 mẫu cuối của khung trước làm ngữ cảnh, giống OnnxWrapper trong utils_vad.py của silero-vad.

Dùng:  uv run --no-project --python 3.12 --with "onnxruntime==1.30.0" --with "numpy==2.5.3" \
         python bench/phase0/vad/ref_probs.py <model.onnx> <audio.wav> > ref.json

File thử `bench/phase0/data/vad/en.wav` (không commit) tạo bằng lệnh `say` của macOS, theo Task 2 Step 6 của
docs/superpowers/plans/2026-09-29-giai-doan-0-03-s3-nhan-dang.md. Máy Windows chép `en.wav` và `en.ref.json` từ Mac.
"""
import json
import sys
import wave

import numpy as np
import onnxruntime as ort


def main():
    model, wav_path = sys.argv[1], sys.argv[2]
    with wave.open(wav_path) as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise SystemExit("cần WAV 16 kHz, mono, 16-bit")
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    state = np.zeros((2, 1, 128), dtype=np.float32)
    context = np.zeros((1, 64), dtype=np.float32)
    sr = np.array(16000, dtype=np.int64)
    probs = []
    for i in range(len(x) // 512):
        chunk = x[i * 512:(i + 1) * 512][None, :]
        out, state = sess.run(None, {"input": np.concatenate([context, chunk], axis=1), "state": state, "sr": sr})
        context = chunk[:, -64:]
        probs.append(float(out.reshape(-1)[0]))
    print(json.dumps(probs))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Tạo file âm thanh thử** (giọng đọc của macOS, thêm 1 giây im lặng ở hai đầu để có cả đoạn chuyển giữa im lặng và tiếng nói)

```bash
mkdir -p bench/phase0/data/vad
say --file-format=WAVE --data-format=LEI16@16000 -o bench/phase0/data/vad/raw.wav \
  "Good morning everyone. Let's review the quarterly results before we move on to the product roadmap."
python3 - <<'EOF'
import wave
src = wave.open("bench/phase0/data/vad/raw.wav")
rate, data = src.getframerate(), src.readframes(src.getnframes())
silence = b"\x00\x00" * rate
with wave.open("bench/phase0/data/vad/en.wav", "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(rate)
    out.writeframes(silence + data + silence)
EOF
uv run --no-project --python 3.12 --with "onnxruntime==1.30.0" --with "numpy==2.5.3" \
  python bench/phase0/vad/ref_probs.py models/silero_vad_v6.2.3.onnx bench/phase0/data/vad/en.wav \
  > bench/phase0/data/vad/en.ref.json
python3 -c "import json; p = json.load(open('bench/phase0/data/vad/en.ref.json')); print(len(p), sum(x > 0.5 for x in p))"
```
Expected: dòng cuối là `219 148` (219 khung, 148 khung có tiếng nói). Nếu giọng đọc mặc định của máy khác thì số có thể lệch một chút.

- [ ] **Step 7: Chạy test so sánh với dữ liệu thật** (đường dẫn phải tuyệt đối, vì cargo chạy test trong thư mục của crate)

Run:
```bash
SILERO_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx VAD_TEST_WAV=$PWD/bench/phase0/data/vad/en.wav \
  VAD_REF_JSON=$PWD/bench/phase0/data/vad/en.ref.json cargo test -p pipeline --test vad_reference -- --include-ignored
```
Expected:
- PASS, `test result: ok. 1 passed`, khoảng 20 giây ở bản debug; phần lớn thời gian là đoạn chạy dài.
- Lúc thực thi, sai khác lớn nhất là 5,4e-7 (sai số làm tròn f32), thấp hơn ngưỡng 1e-4 của test khoảng 200 lần.
- Không đặt biến môi trường thì `cargo test` báo `1 ignored`.
- Đã thử bỏ `.detach()`: `debug_assert!` báo `state còn kéo theo đồ thị tính` ngay ở khung đầu (lúc `load` chạy thử), test FAIL. Bỏ cả `debug_assert!` thì đoạn chạy dài tràn stack, test vẫn FAIL.

- [ ] **Step 8: Tạo `crates/pipeline/examples/vad_probe.rs` và đo tốc độ**

```rust
//! In xác suất VAD của từng khung 32 ms cho một file WAV 16 kHz mono, dạng JSON, và thời gian chạy mỗi khung.
//! Dùng: cargo run --release -p pipeline --example vad_probe -- <model.onnx> <audio.wav> [--paced]
//! `--paced`: gọi đúng nhịp 32 ms như luồng thật, ngủ giữa các khung. Chạy liên tục cho số đo thấp hơn thực tế vài lần,
//! vì CPU luôn ở tần số cao và cache luôn nóng.
use pipeline::segmenter::{FRAME_MS, FRAME_SAMPLES};
use pipeline::vad::SileroVad;
use std::path::Path;
use std::time::{Duration, Instant};

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let paced = args.iter().any(|a| a == "--paced");
    let files: Vec<&String> = args.iter().filter(|a| !a.starts_with("--")).collect();
    let [model, wav] = files.as_slice() else {
        anyhow::bail!("dùng: vad_probe <model.onnx> <audio.wav> [--paced]");
    };
    let mut vad = SileroVad::load(Path::new(model))?;
    let mut reader = hound::WavReader::open(wav)?;
    anyhow::ensure!(
        reader.spec().sample_rate == 16_000 && reader.spec().channels == 1,
        "cần WAV 16 kHz mono"
    );
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?;
    let frames = samples.as_chunks::<FRAME_SAMPLES>().0;
    anyhow::ensure!(!frames.is_empty(), "file ngắn hơn một khung ({FRAME_SAMPLES} mẫu)");
    let mut probs = Vec::with_capacity(frames.len());
    let mut times_ms = Vec::with_capacity(frames.len());
    let origin = Instant::now();
    for (i, frame) in frames.iter().enumerate() {
        if paced {
            let due = origin + Duration::from_millis(i as u64 * FRAME_MS);
            if let Some(wait) = due.checked_duration_since(Instant::now()) {
                std::thread::sleep(wait);
            }
        }
        let started = Instant::now();
        probs.push(vad.prob(frame)?);
        times_ms.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    let mean = times_ms.iter().sum::<f64>() / times_ms.len() as f64;
    times_ms.sort_by(f64::total_cmp);
    let at = |p: f64| times_ms[((times_ms.len() - 1) as f64 * p).round() as usize];
    eprintln!(
        "{} khung{}, trung bình {mean:.2} ms, p50 {:.2}, p99 {:.2}, lớn nhất {:.2} ms/khung",
        frames.len(),
        if paced { " (đúng nhịp 32 ms)" } else { "" },
        at(0.5),
        at(0.99),
        at(1.0)
    );
    println!("{}", serde_json::to_string(&probs)?);
    Ok(())
}
```

Run:
```bash
cargo run --release -p pipeline --example vad_probe -- models/silero_vad_v6.2.3.onnx bench/phase0/data/vad/en.wav > /dev/null
cargo run --release -p pipeline --example vad_probe -- models/silero_vad_v6.2.3.onnx bench/phase0/data/vad/en.wav --paced > /dev/null
```
Expected (stderr, M4 Pro lúc thực thi):
- Chạy liên tục: `219 khung, trung bình 0.23 ms, …`.
- Đúng nhịp 32 ms, như luồng thật: `219 khung (đúng nhịp 32 ms), trung bình 1.17 ms, p50 1.20, p99 1.79, lớn nhất 1.86 ms/khung`, tức khoảng 4% ngân sách 32 ms.
- Ghi số đúng nhịp vào kết luận S3, vì số chạy liên tục thấp hơn thực tế khoảng 5 lần: CPU luôn ở tần số cao và cache luôn nóng.

- [ ] **Step 9: Kiểm tra phụ thuộc sau khi thêm candle**

Run: `cargo deny check`
Expected: FAIL, dòng cuối là `advisories FAILED, bans ok, licenses ok, sources ok`. Lỗi duy nhất là `error[unmaintained]: paste - no longer maintained` (`RUSTSEC-2024-0436`), do candle kéo vào qua `gemm`.

Ghi nhận ngoại lệ trong `deny.toml`: thay khối `[advisories]` bằng

```toml
[advisories]
yanked = "deny"
unsound = "all"
ignore = [
    { id = "RUSTSEC-2024-0436", reason = "paste chỉ là macro lúc biên dịch, do candle (gemm) kéo vào; candle 0.11 chưa bỏ" },
]
```

Run lại: `cargo deny check && cargo audit`
Expected: `advisories ok, bans ok, licenses ok, sources ok`. `cargo audit` không báo lỗ hổng; nó vẫn in cảnh báo `paste` (unmaintained), vì `cargo audit` không đọc `deny.toml`.

- [ ] **Step 10: Commit**

```bash
git add crates/pipeline bench/phase0/vad Cargo.lock deny.toml
git commit -m "feat(pipeline): Silero VAD v6.2.3 chạy bằng candle-onnx, khớp onnxruntime"
```

### Task 3: `asr-worker`, chọn ngôn ngữ (TDD)

**Files:**
- Create: `crates/asr-worker/Cargo.toml`
- Create: `crates/asr-worker/src/lib.rs`
- Create: `crates/asr-worker/src/lid.rs`

Quy tắc theo §6.4:
- Chuẩn hóa lại xác suất trong tập ngôn ngữ cho phép, rồi chọn ngôn ngữ cao nhất.
- Dưới 0,5 thì giữ ngôn ngữ của đoạn trước, nếu ngôn ngữ đó nằm trong tập cho phép.

- [ ] **Step 1: Tạo `crates/asr-worker/Cargo.toml`**

Có ba feature:
- `metal`: chỉ dùng trên macOS.
- `vulkan`: chỉ dùng trên Windows, kéo thêm `ash` cho `--probe`.
- `shared-encode`: chế độ B, cần bản vá ở Task 9.

Các feature chưa bật thì không ảnh hưởng gì.

```toml
[package]
name = "asr-worker"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[features]
default = []
metal = ["whisper-rs/metal"]
vulkan = ["whisper-rs/vulkan", "dep:ash"]
# Cần whisper-rs và whisper-rs-sys đã vá trong third_party/ (spec §6.4).
shared-encode = []

[dependencies]
anyhow.workspace = true
asr-protocol = { path = "../asr-protocol" }
ash = { version = "0.38.0", optional = true, default-features = false, features = ["loaded", "std"] }
serde.workspace = true
serde_json.workspace = true
whisper-rs = "0.16.0"
```

- [ ] **Step 2: Tạo `crates/asr-worker/src/lib.rs`**

```rust
pub mod lid;
```

- [ ] **Step 3: Viết test trước.** Tạo `crates/asr-worker/src/lid.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // lang id của Whisper: en=0, zh=1, ko=5, ja=7, vi=19 (ms=23).
    fn probs(pairs: &[(usize, f32)]) -> Vec<f32> {
        let mut v = vec![0.0; 100];
        for &(i, p) in pairs {
            v[i] = p;
        }
        v
    }

    #[test]
    fn picks_highest_inside_allowed_and_renormalizes() {
        // "ms" (id 23) cao nhất nhưng không được phép.
        let p = probs(&[(23, 0.5), (19, 0.3), (0, 0.1)]);
        let (id, prob) = pick_language(&p, &[0, 19], None, 0.5);
        assert_eq!(id, 19);
        assert!((prob - 0.75).abs() < 1e-6);
    }

    #[test]
    fn keeps_previous_language_when_unsure() {
        let p = probs(&[(0, 0.2), (19, 0.25), (1, 0.2)]);
        let (id, prob) = pick_language(&p, &[0, 1, 19], Some(0), 0.5);
        assert_eq!(id, 0);
        // Xác suất trả về là của ngôn ngữ được giữ, đã chuẩn hóa trong tập cho phép.
        assert!((prob - 0.2 / 0.65).abs() < 1e-6);
    }

    #[test]
    fn ignores_previous_language_outside_allowed_set() {
        let p = probs(&[(0, 0.2), (19, 0.25), (1, 0.2)]);
        let (id, _) = pick_language(&p, &[0, 1, 19], Some(7), 0.5);
        assert_eq!(id, 19);
    }

    #[test]
    fn confident_detection_overrides_previous_language() {
        let p = probs(&[(0, 0.05), (19, 0.9)]);
        let (id, _) = pick_language(&p, &[0, 19], Some(0), 0.5);
        assert_eq!(id, 19);
    }

    #[test]
    fn all_zero_falls_back_to_previous_or_first() {
        let p = probs(&[]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), 0.5).0, 19);
        assert_eq!(pick_language(&p, &[0, 19], None, 0.5).0, 0);
    }

    #[test]
    fn short_segments_use_a_stricter_threshold() {
        assert_eq!(SHORT_LID_SAMPLES, 24_000); // 1,5 giây
        assert_eq!(MIN_LANG_PROB, 0.5);
        assert_eq!(MIN_LANG_PROB_SHORT, 0.9);
        assert_eq!(min_prob_for(0), 0.9);
        assert_eq!(min_prob_for(16_000), 0.9); // 1 giây
        assert_eq!(min_prob_for(SHORT_LID_SAMPLES - 1), 0.9);
        assert_eq!(min_prob_for(SHORT_LID_SAMPLES), 0.5); // đúng 1,5 giây đã là đoạn thường
        assert_eq!(min_prob_for(16_000 * 30), 0.5);
    }

    #[test]
    fn short_threshold_keeps_previous_language_unless_very_confident() {
        // en 0,8 / vi 0,2: đoạn thường (ngưỡng 0,5) đổi sang en; đoạn ngắn (ngưỡng 0,9) giữ vi của đoạn trước.
        let p = probs(&[(0, 0.8), (19, 0.2)]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), min_prob_for(48_000)).0, 0);
        let (id, prob) = pick_language(&p, &[0, 19], Some(19), min_prob_for(16_000));
        assert_eq!(id, 19);
        assert!((prob - 0.2).abs() < 1e-6); // xác suất trả về là của ngôn ngữ được giữ
        // Từ 0,9 trở lên thì đoạn ngắn vẫn đổi ngôn ngữ.
        let p = probs(&[(0, 0.95), (19, 0.05)]);
        assert_eq!(pick_language(&p, &[0, 19], Some(19), min_prob_for(16_000)).0, 0);
        // Chưa có ngôn ngữ trước thì không có gì để giữ, kể cả khi ngưỡng cao.
        assert_eq!(pick_language(&probs(&[(0, 0.8), (19, 0.2)]), &[0, 19], None, 0.9).0, 0);
    }
}
```

- [ ] **Step 4: Chạy test để thấy lỗi**

Run: `cargo test -p asr-worker`
Expected: FAIL, lỗi biên dịch vì chưa có `pick_language`. Lần đầu build whisper.cpp bằng cmake mất vài phút.

- [ ] **Step 5: Viết phần code** ở đầu `crates/asr-worker/src/lid.rs`:

```rust
//! Chọn ngôn ngữ trong tập người dùng cho phép (spec §6.4).

use asr_protocol::SAMPLE_RATE;

/// Ngưỡng thường: xác suất cao nhất (đã chuẩn hóa trong tập cho phép) dưới mức này thì giữ ngôn ngữ của đoạn trước.
pub const MIN_LANG_PROB: f32 = 0.5;

/// Đoạn ngắn hơn mức này (1,5 giây) dùng ngưỡng [`MIN_LANG_PROB_SHORT`].
pub const SHORT_LID_SAMPLES: usize = 24_000;
const _: () = assert!(SHORT_LID_SAMPLES == SAMPLE_RATE as usize * 3 / 2);

/// Ngưỡng cho đoạn ngắn hơn [`SHORT_LID_SAMPLES`]. Ở S6, turbo nhận thành tiếng Anh các đoạn tiếng Việt dưới 1,3 giây
/// (xác suất từ 0,57 đến 0,99): đoạn quá ngắn không đủ bằng chứng để đổi ngôn ngữ, nên chỉ đổi khi xác suất từ 0,9.
/// Đề xuất cho §6.4 (xem kế hoạch 00, Task 2); spec hiện chỉ có ngưỡng 0,5.
pub const MIN_LANG_PROB_SHORT: f32 = 0.9;

/// Ngưỡng `min_prob` cho `pick_language` theo độ dài đoạn (số mẫu 16 kHz): [`MIN_LANG_PROB_SHORT`] nếu đoạn ngắn hơn
/// [`SHORT_LID_SAMPLES`], còn không [`MIN_LANG_PROB`]. Cả hai chế độ giải mã dùng hàm này.
pub fn min_prob_for(n_samples: usize) -> f32 {
    if n_samples < SHORT_LID_SAMPLES {
        MIN_LANG_PROB_SHORT
    } else {
        MIN_LANG_PROB
    }
}

/// `probs`: xác suất của mọi ngôn ngữ Whisper, index là lang id.
/// `allowed`: các lang id được phép, không được rỗng.
/// `prev`: ngôn ngữ của đoạn trước.
///
/// Xác suất được chuẩn hóa lại trong tập `allowed`. Nếu ngôn ngữ cao nhất vẫn dưới
/// `min_prob` thì giữ ngôn ngữ của đoạn trước (nếu nó thuộc tập cho phép).
pub fn pick_language(probs: &[f32], allowed: &[i32], prev: Option<i32>, min_prob: f32) -> (i32, f32) {
    assert!(!allowed.is_empty(), "tập ngôn ngữ cho phép không được rỗng");
    let prob_of = |id: i32| probs.get(id as usize).copied().unwrap_or(0.0).max(0.0);
    let total: f32 = allowed.iter().map(|&id| prob_of(id)).sum();
    let normalized = |id: i32| if total > 0.0 { prob_of(id) / total } else { 0.0 };

    let mut best = (allowed[0], normalized(allowed[0]));
    for &id in &allowed[1..] {
        let p = normalized(id);
        if p > best.1 {
            best = (id, p);
        }
    }
    if best.1 < min_prob
        && let Some(prev) = prev.filter(|p| allowed.contains(p))
    {
        return (prev, normalized(prev));
    }
    best
}
```

- [ ] **Step 6: Chạy lại test**

Run: `cargo test -p asr-worker`
Expected: PASS, `test result: ok. 7 passed`

- [ ] **Step 7: Commit**

```bash
git add crates/asr-worker Cargo.lock
git commit -m "feat(asr-worker): chọn ngôn ngữ trong tập cho phép, giữ ngôn ngữ trước khi không chắc"
```

### Task 4: `asr-worker`, engine và vòng lặp giao thức (chế độ A)

**Files:**
- Modify: `crates/asr-worker/src/lib.rs`
- Create: `crates/asr-worker/src/engine.rs`
- Create: `crates/asr-worker/src/main.rs`

Phần code gắn `#[cfg(feature = "shared-encode")]` và `#[cfg(feature = "vulkan")]` chỉ được biên dịch khi bật feature đó, nên chưa cần `shared.rs` và `probe.rs`. stdout chỉ dùng cho khung giao thức. Log của whisper.cpp tự đi ra stderr, nên không gọi `install_logging_hooks`.

Các điểm rút ra lúc thực thi. Ba điểm đầu từ review Task 4; các điểm sau từ đợt xử lý vấn đề mở sau S6, xem kế hoạch 00 Task 2:
- **LID đoạn ngắn:** đoạn ngắn hơn 1,5 giây chỉ đổi ngôn ngữ khi xác suất ≥ 0,9 (`min_prob_for` trong `lid.rs`). Ở S6, turbo nhận đoạn tiếng Việt dưới 1,3 giây thành tiếng Anh.
- **`avg_logprob`:** trung bình log-xác suất của các token văn bản, không tính EOT, trả trong `TranscribeResult`. App dùng nó cho luật bỏ đoạn: `no_speech > 0,6` và `avg_logprob < −1`.
- **Mồi dấu câu zh/ja:** có sẵn trong code nhưng **tắt mặc định**, `ASR_PRIMER=1` mới bật.
  - Với zh, dấu `。` hiện cả ở giữa câu, nên mồi không giúp §6.3.
  - Trên đoạn không có tiếng nói, model chép lại chính câu mồi.
- **Flash attention mặc định tắt.** whisper.cpp 1.8.3 có lỗi, và v1.9.4 cùng master vẫn còn: khi bật flash attention, encoder và cross-attention đọc K/V tới `GGML_PAD(audio_ctx, 256)` mà không có mask. Với `audio_ctx` rút ngắn, kết quả sai (lặp câu, mất dấu câu) và thay đổi theo các đoạn đã chép trước đó. Reviewer đã tái hiện trên Metal. PR sửa lỗi (ggml-org/whisper.cpp#3941) chưa được merge. Chỉ đặt `ASR_FLASH_ATTN=1` để thử khi whisper.cpp đã có bản vá đó.
- **`transcribe` kiểm đầu vào trước khi gọi whisper.cpp.** Các đầu vào dưới đây làm worker chết (crash trong whisper.cpp, hoặc whisper-rs panic, mà bản release đặt `panic = "abort"`), đọc lố bộ đệm, hoặc lặng lẽ bỏ phần đuôi của đoạn:
  - đoạn dưới 100 ms;
  - mã ngôn ngữ có ký tự NUL;
  - prompt token ngoài khoảng;
  - `audio_ctx` ngoài khoảng [0, 1500], hoặc không phủ hết đoạn. `audio_ctx` = 0 nghĩa là cửa sổ 30 giây.
- **State nhận diện ngôn ngữ được đặt `audio_ctx` 3 giây ngay lúc nạp.** whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`, còn giao thức không bắt buộc gửi Warmup. Chế độ B (Task 9) không dùng state này nên không tạo, để tiết kiệm khoảng 260 MB bộ nhớ GPU.

- [ ] **Step 1: Sửa `crates/asr-worker/src/lib.rs`**

```rust
pub mod engine;
pub mod lid;
```

- [ ] **Step 2: Tạo `crates/asr-worker/src/engine.rs`**

```rust
//! Chạy whisper.cpp qua whisper-rs (spec §6.4).
//!
//! Có hai chế độ giải mã:
//! - Chế độ A (`split`): nhận diện ngôn ngữ dùng một `WhisperState` riêng, luôn mã hóa 3 giây đầu của đoạn
//!   với `audio_ctx` cố định, rồi `whisper_full` chép lời. whisper.cpp chỉ đặt `audio_ctx` bên trong
//!   `whisper_full`, nên state này được `whisper_full` một lần ngay trong `Engine::load` (không đợi `Warmup`)
//!   rồi không chạy `whisper_full` nữa.
//! - Chế độ B (`shared`, xem `shared.rs`): một lượt encode dùng chung cho cả hai việc, nên chỉ có một state (state
//!   chép lời) và không tạo state nhận diện ngôn ngữ. Là mặc định khi build với feature `shared-encode`; đặt
//!   `ASR_MODE=split` để chạy chế độ A khi cần so sánh.
//!
//! Cả hai chế độ dùng chung: ngưỡng giữ ngôn ngữ trước theo độ dài đoạn (`lid::min_prob_for`), câu mồi cho zh và ja
//! (`Primers`, mặc định tắt), và trả `avg_logprob`.

use crate::lid::{min_prob_for, pick_language};
use anyhow::{Context, Result, bail};
use asr_protocol::{
    MAX_PCM_SAMPLES, MAX_PROMPT_TOKENS, MIN_PCM_SAMPLES, SAMPLE_RATE, TranscribeRequest, TranscribeResult,
    audio_ctx_for_samples,
};
use std::time::Instant;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// Nhận diện ngôn ngữ trên tối đa 3 giây đầu của đoạn (spec §6.4).
pub const LID_SAMPLES: usize = SAMPLE_RATE as usize * 3;
/// Cửa sổ mã hóa tối đa của Whisper: 1500 vị trí, tức 30 giây.
const MAX_AUDIO_CTX: i32 = 1500;
/// Số mẫu 16 kHz mà một vị trí của `audio_ctx` phủ (20 ms).
const SAMPLES_PER_CTX: usize = SAMPLE_RATE as usize / 50;
/// `audio_ctx` của state nhận diện ngôn ngữ ở chế độ A: cửa sổ 3 giây theo công thức `50 × số giây + 64` (214). Cố ý
/// không qua sàn `MIN_AUDIO_CTX` của `audio_ctx_for_samples`, để chế độ A (nay chỉ dùng để so sánh) giữ nguyên hành
/// vi đã đo ở S3.
const LID_AUDIO_CTX: i32 = (LID_SAMPLES / SAMPLES_PER_CTX) as i32 + 64;
// Cửa sổ tối đa phủ đúng đoạn dài nhất mà `asr-protocol` cho phép.
const _: () = assert!(MAX_AUDIO_CTX as usize * SAMPLES_PER_CTX == MAX_PCM_SAMPLES);

/// Câu mồi cho tiếng Trung: chữ giản thể, có dấu câu kết thúc.
const PRIMER_ZH: &str = "以下是普通话的句子。";
/// Câu mồi cho tiếng Nhật: có dấu câu kết thúc.
const PRIMER_JA: &str = "以下は日本語の文です。";

/// Prompt mồi cho zh và ja (`<|startofprev|>` rồi các token này, như prompt của client). **Mặc định TẮT**; đặt
/// `ASR_PRIMER=1` để bật (khi đó `asr-worker` in `primer=on`).
///
/// Ý định ban đầu là cho Whisper đặt dấu câu kết thúc ở zh và ja, để luật ghép câu §6.3 (câu không kết thúc bằng dấu câu
/// thì ghép với câu sau) không nối cả những câu khác nhau. Đo ở S3 và S6 (small và turbo, 216 clip zh+ja của A4 và các
/// đoạn VAD thật của S6) cho thấy mồi không đáng bật:
/// - zh: dấu `。` hiện cả ở đoạn giữa câu (small 16/20, turbo 15/20; đoạn cuối câu 21/23 và 20/23), nên không giúp
///   §6.3: ghép câu chuyển từ "nối nhầm" (4 đến 5 nhóm) sang "cắt vụn" (11 đến 12 trong 23 câu bị cắt), số câu nguyên
///   vẹn không hơn. Dùng prompt là token các đoạn trước thì zh vẫn `。` ở 18/20 đoạn giữa câu, kể cả turbo không mồi. ja
///   thì dấu kết thúc hầu như chỉ ra ở cuối câu, có ích nhẹ.
/// - Trên đoạn không có tiếng nói (im lặng, nhiễu, nhạc, click) mà ngôn ngữ là zh hoặc ja, model chép lại chính câu mồi:
///   small ở 4/5 clip thử cho mỗi ngôn ngữ, turbo ja ở 3/5 (`日本語の文です。`).
/// - CER của small tăng 2,9% tổng lỗi zh+ja (băng rộng); turbo giảm 2,2%. ASR p50 của zh, ja tăng 1% đến 9%.
///
/// Lợi ích duy nhất còn lại: `small` ra chữ giản thể (clip zh có chữ phồn thể từ 66% xuống 16%, ký tự phồn thể từ 18,1%
/// xuống 2,0%). MVP xử lý việc này bằng chuyển t2s ở tầng app.
///
/// Khi bật: chỉ dùng khi client không gửi prompt (đoạn đầu, hoặc sau khi đổi ngôn ngữ); prompt của client là ngữ cảnh
/// thật nên thắng. Token hóa một lần lúc nạp model. Tắt thì các danh sách rỗng.
#[derive(Default)]
pub struct Primers {
    zh: Vec<i32>,
    ja: Vec<i32>,
}

/// Mồi chỉ bật khi biến môi trường `ASR_PRIMER` đúng bằng "1" (giống `ASR_FLASH_ATTN`).
fn primer_requested(value: Option<&str>) -> bool {
    value == Some("1")
}

impl Primers {
    fn new(ctx: &WhisperContext) -> Result<Self> {
        if !primer_requested(std::env::var("ASR_PRIMER").ok().as_deref()) {
            return Ok(Self::default());
        }
        let eot = ctx.token_eot();
        let tokenize = |text: &str| -> Result<Vec<i32>> {
            // Mỗi token phủ ít nhất một byte, nên `text.len()` đủ lớn để không gặp mã âm (whisper-rs 0.16 chỉ coi -1 là
            // lỗi, còn mã âm khác bị nó đổi thành độ dài Vec khổng lồ).
            let tokens = ctx
                .tokenize(text, text.len())
                .with_context(|| format!("token hóa câu mồi {text:?}"))?;
            if tokens.is_empty() || tokens.len() > MAX_PROMPT_TOKENS || tokens.iter().any(|t| !(0..eot).contains(t)) {
                bail!("câu mồi {text:?} token hóa ra {tokens:?}, không hợp lệ");
            }
            Ok(tokens)
        };
        Ok(Self {
            zh: tokenize(PRIMER_ZH)?,
            ja: tokenize(PRIMER_JA)?,
        })
    }

    /// Có câu mồi nào đang bật không (`true` chỉ khi đặt `ASR_PRIMER=1`).
    pub fn enabled(&self) -> bool {
        !self.zh.is_empty() || !self.ja.is_empty()
    }

    /// Prompt dùng cho đoạn có ngôn ngữ `lang`: prompt của client nếu có, không thì câu mồi của `lang` (zh, ja), không
    /// thì rỗng. Độ dài luôn không quá `MAX_PROMPT_TOKENS` khi `client` không quá (engine đã kiểm).
    pub fn context_for<'a>(&'a self, lang: &str, client: &'a [i32]) -> &'a [i32] {
        if !client.is_empty() {
            return client;
        }
        match lang {
            "zh" => &self.zh,
            "ja" => &self.ja,
            _ => &[],
        }
    }
}

/// Trung bình log-xác suất của các token văn bản; 0,0 nếu không có token nào (xem `TranscribeResult::avg_logprob`).
/// Cộng bằng f64 để đoạn dài không mất độ chính xác.
pub fn mean_logprob(logprobs: &[f32]) -> f32 {
    if logprobs.is_empty() {
        return 0.0;
    }
    (logprobs.iter().map(|&l| l as f64).sum::<f64>() / logprobs.len() as f64) as f32
}

pub struct Engine {
    ctx: WhisperContext,
    asr_state: WhisperState,
    /// Chỉ có khi chạy chế độ A; chế độ B nhận diện ngôn ngữ ngay trên `asr_state`.
    lid_state: Option<WhisperState>,
    n_threads: usize,
    flash_attn: bool,
    prev_lang: Option<i32>,
    primers: Primers,
    /// Có giá trị khi chạy chế độ B.
    #[cfg(feature = "shared-encode")]
    shared: Option<crate::shared::Decoder>,
}

impl Engine {
    pub fn load(model_path: &str, use_gpu: bool, n_threads: u32) -> Result<Self> {
        // Flash attention mặc định TẮT: whisper.cpp 1.8.3 đọc K/V của encoder và cross-attention tới GGML_PAD(audio_ctx, 256)
        // mà không có mask, nên với audio_ctx rút ngắn kết quả sai và phụ thuộc các đoạn trước (ggml-org/whisper.cpp#3941).
        // Chỉ đặt `ASR_FLASH_ATTN=1` khi whisper.cpp đã có bản vá đó.
        let flash_attn = use_gpu && std::env::var("ASR_FLASH_ATTN").as_deref() == Ok("1");
        let n_threads = clamp_threads(n_threads);
        let params = WhisperContextParameters {
            use_gpu,
            flash_attn,
            ..Default::default()
        };
        let ctx = WhisperContext::new_with_params(model_path, params)
            .with_context(|| format!("không nạp được model {model_path}"))?;
        let asr_state = ctx.create_state().context("tạo state chép lời")?;
        let primers = Primers::new(&ctx)?;
        #[cfg(feature = "shared-encode")]
        let shared = (std::env::var("ASR_MODE").as_deref() != Ok("split")).then(|| crate::shared::Decoder::new(&ctx));
        // Chỉ chế độ A cần state nhận diện ngôn ngữ riêng: không có feature `shared-encode`, hoặc có mà `ASR_MODE=split`.
        #[cfg(feature = "shared-encode")]
        let split_mode = shared.is_none();
        #[cfg(not(feature = "shared-encode"))]
        let split_mode = true;
        let lid_state = if split_mode {
            Some(create_lid_state(&ctx, n_threads)?)
        } else {
            None
        };
        Ok(Self {
            ctx,
            asr_state,
            lid_state,
            n_threads,
            flash_attn,
            prev_lang: None,
            primers,
            #[cfg(feature = "shared-encode")]
            shared,
        })
    }

    /// `shared` (chế độ B) hoặc `split` (chế độ A).
    pub fn decode_mode(&self) -> &'static str {
        #[cfg(feature = "shared-encode")]
        if self.shared.is_some() {
            return "shared";
        }
        "split"
    }

    /// Flash attention có đang bật không. Mặc định tắt, xem `load`.
    pub fn flash_attn(&self) -> bool {
        self.flash_attn
    }

    /// Câu mồi cho zh và ja có đang bật không. Mặc định tắt, xem [`Primers`].
    pub fn primer_enabled(&self) -> bool {
        self.primers.enabled()
    }

    /// Chạy thử trên 3 giây im lặng để nạp sẵn kernel GPU cho state chép lời. Ở chế độ A, state nhận diện ngôn ngữ
    /// đã được làm nóng và đặt `audio_ctx` ngay trong `load`; chế độ B không có state đó.
    pub fn warmup(&mut self) -> Result<f32> {
        let silence = vec![0.0f32; LID_SAMPLES];
        let started = Instant::now();
        let params = full_params(self.n_threads, "en", audio_ctx_for_samples(silence.len()));
        self.asr_state
            .full(params, &silence)
            .context("làm nóng state chép lời")?;
        Ok(started.elapsed().as_secs_f32() * 1000.0)
    }

    pub fn transcribe(&mut self, req: &TranscribeRequest) -> Result<TranscribeResult> {
        // Kiểm đầu vào trước mọi lệnh gọi whisper, cho cả hai chế độ: đầu vào sai trả `Error` qua giao thức chứ không
        // làm worker chết (whisper-rs panic khi mã ngôn ngữ chứa NUL, mà bản release đặt panic = abort).
        if req.languages.is_empty() {
            bail!("danh sách ngôn ngữ rỗng");
        }
        if let Some(l) = req.languages.iter().find(|l| l.contains('\0')) {
            bail!("mã ngôn ngữ chứa ký tự NUL: {l:?}");
        }
        if req.pcm.len() < MIN_PCM_SAMPLES {
            bail!("đoạn quá ngắn: {} mẫu (tối thiểu {MIN_PCM_SAMPLES})", req.pcm.len());
        }
        if req.pcm.len() > MAX_PCM_SAMPLES {
            bail!("đoạn quá dài: {} mẫu (tối đa {MAX_PCM_SAMPLES})", req.pcm.len());
        }
        if req.prompt_tokens.len() > MAX_PROMPT_TOKENS {
            bail!(
                "prompt quá dài: {} token (tối đa {MAX_PROMPT_TOKENS})",
                req.prompt_tokens.len()
            );
        }
        let eot = self.ctx.token_eot();
        if let Some(t) = req.prompt_tokens.iter().find(|&&t| !(0..eot).contains(&t)) {
            bail!("prompt_tokens có token {t} ngoài khoảng [0, {eot})");
        }
        if !(0..=MAX_AUDIO_CTX).contains(&req.audio_ctx) {
            bail!("audio_ctx {} ngoài khoảng [0, {MAX_AUDIO_CTX}]", req.audio_ctx);
        }
        // 0 là cửa sổ đầy đủ 30 giây. Cửa sổ nào ngắn hơn đoạn thì whisper.cpp lặng lẽ bỏ phần đuôi (chế độ B chỉ ra
        // phần đầu), nên `audio_ctx` phải phủ hết đoạn. Đoạn dài hơn 30 giây đã bị từ chối ở trên, kể cả khi
        // `audio_ctx` là 0.
        let window = if req.audio_ctx == 0 {
            MAX_AUDIO_CTX
        } else {
            req.audio_ctx
        };
        if window as usize * SAMPLES_PER_CTX < req.pcm.len() {
            bail!(
                "audio_ctx {} chỉ phủ {} mẫu, ngắn hơn đoạn ({} mẫu)",
                req.audio_ctx,
                window as usize * SAMPLES_PER_CTX,
                req.pcm.len()
            );
        }
        let allowed = req
            .languages
            .iter()
            .map(|l| whisper_rs::get_lang_id(l).with_context(|| format!("mã ngôn ngữ không hợp lệ: {l}")))
            .collect::<Result<Vec<i32>>>()?;
        let pcm: Vec<f32> = req.pcm.iter().map(|&s| s as f32 / 32768.0).collect();

        #[cfg(feature = "shared-encode")]
        if let Some(decoder) = &self.shared {
            let started = Instant::now();
            let d = decoder.transcribe(
                &self.ctx,
                &mut self.asr_state,
                &pcm,
                req.audio_ctx,
                &allowed,
                self.prev_lang,
                &req.prompt_tokens,
                &self.primers,
                self.n_threads,
            )?;
            let total_ms = started.elapsed().as_secs_f32() * 1000.0;
            self.prev_lang = Some(d.lang_id);
            return Ok(TranscribeResult {
                segment_id: req.segment_id,
                lang: whisper_rs::get_lang_str(d.lang_id)
                    .context("lang id không hợp lệ")?
                    .to_string(),
                lang_prob: d.lang_prob,
                text: d.text,
                tokens: d.tokens,
                no_speech_prob: d.no_speech_prob,
                lid_ms: d.lid_ms,
                asr_ms: total_ms - d.lid_ms,
                avg_logprob: d.avg_logprob,
            });
        }

        let lid_started = Instant::now();
        let (lang_id, lang_prob) = if allowed.len() == 1 {
            (allowed[0], 1.0)
        } else {
            let head = &pcm[..pcm.len().min(LID_SAMPLES)];
            let lid_state = self.lid_state.as_mut().context("thiếu state nhận diện ngôn ngữ")?;
            lid_state
                .pcm_to_mel(head, self.n_threads)
                .context("tính mel cho nhận diện ngôn ngữ")?;
            let (_, probs) = lid_state.lang_detect(0, self.n_threads).context("nhận diện ngôn ngữ")?;
            pick_language(&probs, &allowed, self.prev_lang, min_prob_for(pcm.len()))
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;

        let asr_started = Instant::now();
        let mut params = full_params(self.n_threads, lang, req.audio_ctx);
        let context = self.primers.context_for(lang, &req.prompt_tokens);
        if !context.is_empty() {
            params.set_tokens(context);
        }
        self.asr_state.full(params, &pcm).context("chép lời")?;
        let asr_ms = asr_started.elapsed().as_secs_f32() * 1000.0;

        let mut text = String::new();
        let mut tokens = Vec::new();
        let mut logprobs = Vec::new();
        let mut no_speech_prob = 0.0f32;
        for segment in self.asr_state.as_iter() {
            text.push_str(&segment.to_str_lossy()?);
            no_speech_prob = no_speech_prob.max(segment.no_speech_probability());
            for i in 0..segment.n_tokens() {
                if let Some(token) = segment.get_token(i) {
                    let id = token.token_id();
                    if id < eot {
                        tokens.push(id);
                        // whisper.cpp tính `plog` bằng log-softmax trên logit đã chặn token, giống chế độ B.
                        logprobs.push(token.token_data().plog);
                    }
                }
            }
        }
        self.prev_lang = Some(lang_id);
        Ok(TranscribeResult {
            segment_id: req.segment_id,
            lang: lang.to_string(),
            lang_prob,
            text: text.trim().to_string(),
            tokens,
            no_speech_prob,
            lid_ms,
            asr_ms,
            avg_logprob: mean_logprob(&logprobs),
        })
    }
}

/// State nhận diện ngôn ngữ của chế độ A. `lang_detect` dùng lại `audio_ctx` mà lần `whisper_full` gần nhất đã đặt cho
/// state. Giao thức không bắt buộc gửi `Warmup`, nên chạy `whisper_full` một lần ngay lúc nạp, trên 3 giây im lặng. Nếu
/// bỏ qua, đoạn đầu tiên sẽ nhận diện ngôn ngữ trên cửa sổ 30 giây đầy đủ: chậm hơn nhiều và cho xác suất khác.
fn create_lid_state(ctx: &WhisperContext, n_threads: usize) -> Result<WhisperState> {
    let mut state = ctx.create_state().context("tạo state nhận diện ngôn ngữ")?;
    let silence = vec![0.0f32; LID_SAMPLES];
    let params = full_params(n_threads, "en", LID_AUDIO_CTX);
    state
        .full(params, &silence)
        .context("đặt audio_ctx cho state nhận diện ngôn ngữ")?;
    Ok(state)
}

/// Kẹp số luồng yêu cầu về số CPU logic (`available_parallelism`) của máy. Yêu cầu 0 vẫn lên 1 như trước; nếu không
/// hỏi được số CPU logic thì giữ nguyên giá trị yêu cầu.
fn clamp_threads(requested: u32) -> usize {
    let requested = requested.max(1) as usize;
    match std::thread::available_parallelism() {
        Ok(cpus) => requested.min(cpus.get()),
        Err(_) => requested,
    }
}

/// Tham số giải mã theo spec §6.4: greedy, không temperature fallback, chặn token không phải
/// tiếng nói, không dùng ngữ cảnh nội bộ của whisper.cpp (prompt được truyền rõ ràng).
fn full_params<'a, 'b>(n_threads: usize, lang: &'a str, audio_ctx: i32) -> FullParams<'a, 'b> {
    let mut p = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    p.set_n_threads(n_threads as i32);
    p.set_language(Some(lang));
    p.set_audio_ctx(audio_ctx);
    p.set_no_context(true);
    p.set_single_segment(true);
    p.set_no_timestamps(true);
    p.set_suppress_nst(true);
    p.set_temperature(0.0);
    p.set_temperature_inc(0.0);
    p.set_print_special(false);
    p.set_print_progress(false);
    p.set_print_realtime(false);
    p.set_print_timestamps(false);
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    fn primers() -> Primers {
        Primers {
            zh: vec![11, 12],
            ja: vec![21],
        }
    }

    #[test]
    fn primer_is_used_only_for_zh_and_ja_without_a_client_prompt() {
        let p = primers();
        assert_eq!(p.context_for("zh", &[]), [11, 12]);
        assert_eq!(p.context_for("ja", &[]), [21]);
        for lang in ["en", "ko", "vi", "", "zh-TW"] {
            assert!(p.context_for(lang, &[]).is_empty(), "{lang}");
        }
    }

    #[test]
    fn client_prompt_wins_over_the_primer() {
        let p = primers();
        assert_eq!(p.context_for("zh", &[7, 8, 9]), [7, 8, 9]);
        assert_eq!(p.context_for("ja", &[7]), [7]);
        assert_eq!(p.context_for("en", &[7]), [7]);
    }

    #[test]
    fn primer_is_off_unless_asked() {
        assert!(!primer_requested(None));
        assert!(primer_requested(Some("1")));
        for v in ["", "0", "true", "on", "yes", " 1"] {
            assert!(!primer_requested(Some(v)), "{v:?}");
        }
    }

    #[test]
    fn disabled_primers_give_no_context() {
        let p = Primers::default();
        assert!(p.context_for("zh", &[]).is_empty());
        assert!(p.context_for("ja", &[]).is_empty());
        assert_eq!(p.context_for("zh", &[5]), [5]);
    }

    #[test]
    fn primer_texts_fit_the_prompt_budget_and_use_simplified_zh() {
        // Mỗi token phủ ít nhất một byte, nên số byte là cận trên của số token.
        for text in [PRIMER_ZH, PRIMER_JA] {
            assert!(text.len() < MAX_PROMPT_TOKENS, "{text}");
            // Có dấu câu kết thúc, để Whisper bắt chước và luật ghép câu §6.3 thấy được câu kết thúc.
            assert!(text.ends_with('。'), "{text}");
        }
        // Chữ giản thể ("话" chứ không phải "話"), để kéo `small` về giản thể.
        assert!(PRIMER_ZH.contains('话') && !PRIMER_ZH.contains('話'));
    }

    #[test]
    fn mean_logprob_is_zero_without_tokens() {
        assert_eq!(mean_logprob(&[]), 0.0);
        assert!((mean_logprob(&[-1.0, -2.0, -3.0]) + 2.0).abs() < 1e-6);
        assert_eq!(mean_logprob(&[-0.25]), -0.25);
    }

    #[test]
    fn lid_window_of_mode_a_stays_the_three_second_formula() {
        // Không qua sàn MIN_AUDIO_CTX: nhận diện ngôn ngữ ở chế độ A vẫn mã hóa cửa sổ 3 giây (150 khung + 64), còn
        // `audio_ctx_for_samples` cho cùng độ dài đó ra 512.
        assert_eq!(LID_AUDIO_CTX, 214);
        assert_eq!(audio_ctx_for_samples(LID_SAMPLES), 512);
    }
}
```

- [ ] **Step 3: Tạo `crates/asr-worker/src/main.rs`**

```rust
//! Tiến trình phụ `asr-worker`: đọc `Request` từ stdin, ghi `Response` ra stdout (spec §6.4).
//! stdout chỉ dùng cho khung giao thức; mọi log đều ra stderr. whisper.cpp và ggml tự ghi log ra stderr, nên không
//! gọi `whisper_rs::install_logging_hooks`: khi không bật feature `log_backend`, hàm đó nuốt mất log (kể cả lỗi GPU).

use anyhow::Result;
use asr_protocol::{Request, Response, read_frame, write_frame};
use asr_worker::engine::Engine;
use std::io::{BufReader, BufWriter};

/// Vòng lặp giao thức. Mọi lỗi đọc khung (I/O, khung quá lớn, `Codec`, `TrailingBytes`) đều làm worker thoát ngay với
/// mã 1, kể cả khi luồng vẫn còn đồng bộ (`Codec`, `TrailingBytes`). App tự khởi động lại worker, nên không cố đọc tiếp.
fn main() -> Result<()> {
    if std::env::args().any(|a| a == "--probe") {
        return probe();
    }
    let mut input = BufReader::new(std::io::stdin().lock());
    let mut output = BufWriter::new(std::io::stdout().lock());
    let mut engine: Option<Engine> = None;

    while let Some(request) = read_frame::<_, Request>(&mut input)? {
        let response = match request {
            Request::Load {
                model_path,
                use_gpu,
                n_threads,
            } => match Engine::load(&model_path, use_gpu, n_threads) {
                Ok(e) => {
                    let backend = backend_name(use_gpu);
                    eprintln!(
                        "asr-worker: backend={backend} flash_attn={} decode_mode={}",
                        if e.flash_attn() { "on" } else { "off" },
                        e.decode_mode()
                    );
                    // Dòng riêng, để dòng trên giữ nguyên định dạng cũ (các phép kiểm log tìm đúng dòng đó).
                    eprintln!("asr-worker: primer={}", if e.primer_enabled() { "on" } else { "off" });
                    let ready = Response::Ready {
                        backend: backend.to_string(),
                        decode_mode: e.decode_mode().to_string(),
                        whisper_version: whisper_rs::WHISPER_CPP_VERSION.to_string(),
                        system_info: whisper_rs::print_system_info().to_string(),
                    };
                    engine = Some(e);
                    ready
                }
                Err(e) => Response::Error {
                    segment_id: None,
                    message: format!("{e:#}"),
                },
            },
            Request::Warmup => match engine.as_mut() {
                Some(e) => match e.warmup() {
                    Ok(millis) => Response::WarmupDone { millis },
                    Err(err) => Response::Error {
                        segment_id: None,
                        message: format!("{err:#}"),
                    },
                },
                None => not_loaded(None),
            },
            Request::Transcribe(req) => match engine.as_mut() {
                Some(e) => match e.transcribe(&req) {
                    Ok(result) => Response::Result(result),
                    Err(err) => Response::Error {
                        segment_id: Some(req.segment_id),
                        message: format!("{err:#}"),
                    },
                },
                None => not_loaded(Some(req.segment_id)),
            },
            Request::Shutdown => break,
        };
        write_frame(&mut output, &response)?;
    }
    Ok(())
}

fn not_loaded(segment_id: Option<u64>) -> Response {
    Response::Error {
        segment_id,
        message: "chưa nạp model".into(),
    }
}

fn backend_name(use_gpu: bool) -> &'static str {
    match (use_gpu, cfg!(feature = "metal"), cfg!(feature = "vulkan")) {
        (true, true, _) => "metal",
        (true, _, true) => "vulkan",
        _ => "cpu",
    }
}

#[cfg(feature = "vulkan")]
fn probe() -> Result<()> {
    println!("{}", serde_json::to_string(&asr_worker::probe::list_gpus()?)?);
    Ok(())
}

#[cfg(not(feature = "vulkan"))]
fn probe() -> Result<()> {
    println!("[]");
    Ok(())
}
```

- [ ] **Step 4: Build bản Metal**

Run: `cargo build --release -p asr-worker --features metal`
Expected: `Finished release profile`.

- [ ] **Step 5: Kiểm tra nhanh**

Run: `target/release/asr-worker --probe; target/release/asr-worker < /dev/null; echo "exit=$?"`
Expected:
- `[]`: bản macOS không có Vulkan.
- `exit=0`: stdin đóng đúng ranh giới khung thì thoát sạch.

- [ ] **Step 6: Kiểm tra link tĩnh (§6.12)**

Run: `otool -L target/release/asr-worker`
Expected: chỉ có `/usr/lib/libc++.1.dylib`, `/usr/lib/libSystem.B.dylib`, `/usr/lib/libobjc.A.dylib` và các framework hệ thống (Accelerate, Foundation, Metal, MetalKit, CoreFoundation). Không có `libggml*` hay `libwhisper*`. File khoảng 2,1 MB.

- [ ] **Step 7: Chạy clippy rồi commit**

Run: `cargo clippy -p asr-worker --features metal --all-targets -- -D warnings`
Expected: không có cảnh báo.

```bash
git add crates/asr-worker
git commit -m "feat(asr-worker): tiến trình phụ whisper.cpp qua stdin/stdout, chế độ nhận diện ngôn ngữ riêng (A)"
```

### Task 5: `pipeline`, client cho `asr-worker`

**Files:**
- Create: `crates/pipeline/src/asr_client.rs`
- Modify: `crates/pipeline/src/lib.rs`

- [ ] **Step 1: Tạo `crates/pipeline/src/asr_client.rs`**

```rust
//! Chạy và nói chuyện với tiến trình phụ `asr-worker` qua stdin/stdout (spec §6.4).

use anyhow::{Context, Result, bail};
use asr_protocol::{Request, Response, TranscribeRequest, TranscribeResult, read_frame, write_frame};
use std::fs::OpenOptions;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};

/// Thời gian chờ `asr-worker` thoát sau `Shutdown` trước khi kill.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);

pub struct ReadyInfo {
    pub backend: String,
    /// `shared` (chế độ B) hoặc `split` (chế độ A), spec §6.4.
    pub decode_mode: String,
    pub whisper_version: String,
    pub system_info: String,
}

pub struct AsrWorker {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: BufReader<ChildStdout>,
    /// Đường dẫn file log của worker, để thông báo lỗi chỉ chỗ xem log.
    log: PathBuf,
}

impl AsrWorker {
    /// `stderr_log`: nơi ghi log của whisper.cpp, để log không lẫn vào kênh giao thức. File được mở ở chế độ append,
    /// nên khởi động lại worker không làm mất log của lần chạy trước (log crash).
    pub fn spawn(
        exe: &Path,
        model: &Path,
        use_gpu: bool,
        n_threads: u32,
        stderr_log: &Path,
    ) -> Result<(Self, ReadyInfo)> {
        let log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(stderr_log)
            .with_context(|| format!("không mở được log {}", stderr_log.display()))?;
        let mut child = Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(log))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let stdin = BufWriter::new(child.stdin.take().context("thiếu stdin")?);
        let stdout = BufReader::new(child.stdout.take().context("thiếu stdout")?);
        let mut worker = Self {
            child,
            stdin,
            stdout,
            log: stderr_log.to_path_buf(),
        };
        let load = Request::Load {
            model_path: model.display().to_string(),
            use_gpu,
            n_threads,
        };
        match worker.call(&load)? {
            Response::Ready {
                backend,
                decode_mode,
                whisper_version,
                system_info,
            } => Ok((
                worker,
                ReadyInfo {
                    backend,
                    decode_mode,
                    whisper_version,
                    system_info,
                },
            )),
            Response::Error { message, .. } => bail!("asr-worker không nạp được model: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn warmup(&mut self) -> Result<f32> {
        match self.call(&Request::Warmup)? {
            Response::WarmupDone { millis } => Ok(millis),
            Response::Error { message, .. } => bail!("làm nóng lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    pub fn transcribe(&mut self, req: TranscribeRequest) -> Result<TranscribeResult> {
        let id = req.segment_id;
        match self.call(&Request::Transcribe(req))? {
            Response::Result(r) if r.segment_id == id => Ok(r),
            Response::Result(r) => bail!("asr-worker trả kết quả đoạn {} khi đang chờ đoạn {id}", r.segment_id),
            Response::Error { message, .. } => bail!("chép lời đoạn {id} lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    fn call(&mut self, req: &Request) -> Result<Response> {
        let res = write_frame(&mut self.stdin, req)
            .context("gửi yêu cầu cho asr-worker")
            .and_then(|()| read_frame(&mut self.stdout).context("đọc phản hồi của asr-worker"))
            .and_then(|r| r.context("asr-worker đóng stdout"));
        if res.is_err() {
            // Lỗi pipe thường là do worker vừa chết: chờ ngắn để lấy mã thoát (tiến trình có thể chưa kịp thành zombie).
            let deadline = Instant::now() + Duration::from_millis(200);
            while Instant::now() < deadline {
                if let Ok(Some(status)) = self.child.try_wait() {
                    return res.with_context(|| format!("asr-worker đã thoát ({status}), xem {}", self.log.display()));
                }
                std::thread::sleep(Duration::from_millis(10));
            }
        }
        res
    }
}

impl Drop for AsrWorker {
    fn drop(&mut self) {
        let _ = write_frame(&mut self.stdin, &Request::Shutdown);
        // Worker treo (ví dụ driver GPU lỗi) thì không chờ mãi: sau SHUTDOWN_TIMEOUT thì kill.
        let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = self.child.try_wait() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
```

- [ ] **Step 2: Sửa `crates/pipeline/src/lib.rs`**

```rust
pub mod asr_client;
pub mod segmenter;
pub mod vad;
```

- [ ] **Step 3: Build và chạy lại test**

Run: `cargo test -p pipeline`
Expected: `test result: ok. 19 passed` cho unit test, và `1 ignored` cho `vad_reference` (test này cần biến môi trường, xem Task 2).

- [ ] **Step 4: Commit**

```bash
git add crates/pipeline
git commit -m "feat(pipeline): client chạy và gọi asr-worker"
```

### Task 6: Bộ clip A4 từ FLEURS

**Files:**
- Create: `bench/phase0/asr/build_clips.py`
- Create: `bench/phase0/data/asr/manifest.jsonl` và `bench/phase0/data/asr/clips/` (script sinh ra, không commit)

Theo A4, mỗi ngôn ngữ nguồn có ít nhất 15 phút âm thanh, lấy từ tập dev của FLEURS (CC BY 4.0).
- Mỗi câu chỉ lấy một bản ghi.
- **Cắt lặng đầu và cuối** (khung 20 ms dưới −35 dB so với khung to nhất), giữ 200 ms mỗi bên, giống phần đệm của đoạn do VAD cắt.
  - Review lúc thực thi thấy khoảng lặng dài ở đầu clip FLEURS làm chế độ A nhận sai ngôn ngữ, vì chế độ này chỉ nhìn 3 giây đầu. Chế độ A với small nhận đúng tiếng Hàn 98% trên bộ clip mới (đã cắt lặng), so với 85% trên bộ cũ. Hai bộ khác nhau về số clip; thí nghiệm có đối chứng của reviewer (cùng bộ zh, chỉ khác việc cắt lặng) cho 81% lên 91%.
  - Clip được chọn theo độ dài sau khi cắt.
- Bỏ clip có số mẫu thật ngoài khoảng [1600, 480000] (0,1 đến 30 giây), là khoảng `asr-worker` chấp nhận (`MIN_PCM_SAMPLES`, `MAX_PCM_SAMPLES` trong `asr-protocol`). Không tin cột `n_samples` của TSV.
- **Băng hẹp:** cứ 4 clip thì tạo thêm một bản, để mô phỏng tai nghe Bluetooth ở chế độ HFP: hạ xuống 8 kHz, lọc dải thoại 300–3400 Hz, lượng tử µ-law 8-bit, rồi nâng lại 16 kHz.
  - Mỗi ngôn ngữ đặt các bản nb sau mọi clip wb. Lý do: khi không chắc, worker giữ ngôn ngữ của đoạn trước, nên bản nb không được đứng ngay sau bản wb của chính nó.
- Clip tự thu (nếu có) khai trong `bench/phase0/data/asr/extra_clips.jsonl`, cùng định dạng với manifest, và cũng được lọc theo độ dài.
- Chạy với `--langs` thì ghi ra `manifest-<langs>.jsonl`, không ghi đè `manifest.jsonl`.
- FLEURS được ghim theo commit `70bb2e8…` của dataset, kèm kích thước và SHA-256 của từng file. Script tải bằng hàm `ensure()` của `fetch.py` (tải tiếp, thử lại, kiểm băm), nên phải có `bench/phase0/fetch.py` ở kế hoạch 01.

- [ ] **Step 1: Tạo `bench/phase0/asr/build_clips.py`**

```python
"""Dựng bộ clip cho A4 từ FLEURS (CC BY 4.0), tập dev: mỗi ngôn ngữ ít nhất 15 phút.

- Mỗi câu của FLEURS có nhiều người đọc; lấy một bản ghi cho mỗi câu, theo thứ tự trong file TSV.
- Cắt lặng đầu và cuối mỗi clip (`trim_silence`: khung 20 ms, ngưỡng -35 dB so với khung to nhất, giữ 200 ms mỗi bên).
  Đoạn do VAD cắt (§6.3) chỉ có 200 ms đệm, còn clip FLEURS có lặng đầu tới vài giây. Giữ nguyên thì chế độ A, vốn chỉ
  nhận diện ngôn ngữ trên 3 giây đầu của đoạn, nhận sai ngôn ngữ nhiều hơn trong app thật.
- Độ dài tính sau khi cắt: clip có số mẫu 16 kHz ngoài [1600, 480000] (0,1 tới 30 giây, khoảng `asr-worker` nhận;
  ngoài khoảng đó `transcribe` trả lỗi và làm hỏng cả lượt `asr-eval`) bị bỏ, số clip bị bỏ được in ra. Chọn clip theo
  thứ tự TSV cho tới khi tổng số mẫu đã giữ đủ 15 phút; cột n_samples của TSV không dùng.
- Cứ 4 clip lấy 1 clip làm thêm bản băng hẹp, mô phỏng tai nghe Bluetooth ở chế độ đàm thoại (HFP): dải 300-3400 Hz
  ở 8 kHz, lượng tử µ-law 8-bit, rồi nâng lại 16 kHz. Chỉ là mô phỏng: A4 vẫn cần clip thu thật qua tai nghe.
- Mỗi ngôn ngữ đặt các dòng nb sau mọi clip wb trong manifest, vì worker giữ ngôn ngữ của đoạn trước khi không chắc
  (asr-worker/src/lid.rs), nên bản nb không được đứng ngay sau bản wb của chính nó.
- Clip tự thu (nếu có) khai báo trong data/asr/extra_clips.jsonl, cùng định dạng với manifest. Đường dẫn tính từ
  data/asr/. Mỗi file được đọc để đếm mẫu: không phải WAV 16 kHz mono 16-bit (như `asr-eval` đòi) hoặc có độ dài
  ngoài khoảng trên thì bị bỏ. Không cắt lặng clip tự thu.
- FLEURS ghim theo commit, kích thước và SHA-256 của từng file; tải qua hàm của fetch.py (tải tiếp, thử lại, kiểm băm).

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "scipy==1.18.1" \
         python bench/phase0/asr/build_clips.py [--langs en_us,vi_vn]
Kết quả: các file WAV 16 kHz mono trong data/asr/clips/, và manifest:
- chạy đủ năm ngôn ngữ: bench/phase0/data/asr/manifest.jsonl;
- chạy một phần (`--langs`): bench/phase0/data/asr/manifest-<langs>.jsonl, không ghi đè manifest.jsonl.
"""
import argparse
import csv
import io
import json
import os
import sys
import tarfile
import wave

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfiltfilt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from fetch import ensure  # noqa: E402  (bench/phase0/fetch.py)

DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
REV = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"  # commit của dataset google/fleurs
BASE = f"https://huggingface.co/datasets/google/fleurs/resolve/{REV}/data"
# (kích thước, SHA-256) của dev.tsv và của audio/dev.tar.gz cho từng ngôn ngữ, khoảng 910 MB tất cả.
PINNED = {
    "en_us": ((213065, "9d57ee7e91e9d4c92edb39f6bbea668ef8dc2a3ff96eb510d5580b2ad05d17ec"),
              (171250900, "2658fda72f199e12676ecac9415094667a4e14e149b146e568ea00b2a2f0954c")),
    "vi_vn": ((247001, "c9bc17cede9765b1c75cb7a608f7066cb6bb6f8245cc75d721a5217a5dffb414"),
              (214500592, "8821a394c99069409b3ce7bb5cd14b10b709f2ee2fea16f42b4701e1cc9ef673")),
    "cmn_hans_cn": ((205248, "6b4efd804b543048feb278db06f3b58b5ea171cdd4ba072e328ad630ca25384b"),
                    (217347747, "3bc33212d5974eef7feb04bc4792458d6cd7e14ff10a1a24772f3c45ea87a822")),
    "ja_jp": ((142341, "92beded0999347ad5b8599fe70940e2e7b9232c67c426defb258e596ade94f48"),
              (179387192, "2547f19203e1272aeba99c2235326fea525d6cfb9348bafbea2c3a7929e8e441")),
    "ko_kr": ((124920, "6b236de107c6a1672233f6d710d26adfdb55570a3e6e35aca9dc4ff2be01cea4"),
              (126162634, "496edcb5323e75b4a2830f5b5623684a0baf86d3728101853fd4fe503372157c")),
}
WHISPER_CODE = {"en_us": "en", "vi_vn": "vi", "cmn_hans_cn": "zh", "ja_jp": "ja", "ko_kr": "ko"}
MIN_SECONDS = 15 * 60
# Khoảng số mẫu 16 kHz mà asr-worker nhận: khớp MIN_PCM_SAMPLES và MAX_PCM_SAMPLES trong crates/asr-protocol/src/lib.rs
# (0,1 tới 30 giây). Ngoài khoảng này `transcribe` trả Error.
MIN_CLIP_SAMPLES = 1600
MAX_CLIP_SAMPLES = 480000
TRIM_FRAME = 320  # 20 ms
TRIM_FLOOR_DB = -35.0  # khung thấp hơn mức này so với khung to nhất là lặng
TRIM_PAD = 3200  # 200 ms, như phần đệm của đoạn do VAD cắt
MU = 255.0  # µ-law
# Bộ lọc dải thoại 300-3400 Hz của HFP, ở tần số lấy mẫu 8 kHz.
NB_SOS = butter(4, [300, 3400], btype="band", fs=8000, output="sos")


def fetch(fleurs, rel, pin):
    """Tải `data/<fleurs>/<rel>` của FLEURS nếu chưa có; file đã có thì kiểm lại kích thước và SHA-256."""
    dest = os.path.join(DATA, "fleurs", fleurs, os.path.basename(rel))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    ensure(f"{BASE}/{fleurs}/{rel}", dest, *pin)
    return dest


def read_pcm16(raw):
    """FLEURS lưu WAV float32 (định dạng 3), module `wave` không đọc được nên dùng scipy."""
    rate, x = wavfile.read(io.BytesIO(raw))
    if x.ndim > 1:
        x = x.mean(axis=1)
    if x.dtype.kind == "f":
        x = x * 32767.0
    x = x.astype(np.float32)
    if rate != 16000:
        x = resample_poly(x, 16000, rate)
    return x.clip(-32768, 32767).astype(np.int16)


def write_wav(path, x):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(x.astype(np.int16).tobytes())


def trim_silence(x):
    """Cắt lặng đầu và cuối: bỏ các khung 20 ms thấp hơn -35 dB so với khung to nhất, giữ 200 ms mỗi bên."""
    n = len(x) // TRIM_FRAME
    if n == 0:
        return x
    e = np.sqrt((x[: n * TRIM_FRAME].astype(np.float64).reshape(n, TRIM_FRAME) ** 2).mean(axis=1)) + 1e-9
    active = np.nonzero(20 * np.log10(e / e.max()) > TRIM_FLOOR_DB)[0]
    if active.size == 0:
        return x
    return x[max(0, active[0] * TRIM_FRAME - TRIM_PAD): min(len(x), (active[-1] + 1) * TRIM_FRAME + TRIM_PAD)]


def narrowband(x):
    """Mô phỏng HFP: 8 kHz, dải thoại 300-3400 Hz, lượng tử µ-law 8-bit, rồi nâng lại 16 kHz. Dài bằng bản gốc."""
    y = resample_poly(x.astype(np.float64), 1, 2)
    y = sosfiltfilt(NB_SOS, y)
    u = np.clip(y / 32768.0, -1.0, 1.0)
    c = np.round(np.sign(u) * np.log1p(MU * np.abs(u)) / np.log1p(MU) * 127) / 127
    y = np.sign(c) * np.expm1(np.abs(c) * np.log1p(MU)) / MU * 32768.0
    return resample_poly(y, 2, 1)[: len(x)].clip(-32768, 32767).astype(np.int16)


def wav_samples(path):
    """Số mẫu của WAV tự thu. Ném ValueError nếu file không đọc được hoặc không phải 16 kHz, mono, 16-bit."""
    try:
        with wave.open(path, "rb") as w:
            fmt = (w.getframerate(), w.getnchannels(), w.getsampwidth())
            if fmt != (16000, 1, 2):
                raise ValueError(f"cần WAV 16 kHz, mono, 16-bit; file là {fmt[0]} Hz, {fmt[1]} kênh, {8 * fmt[2]}-bit")
            n = w.getnframes()
            if n <= MAX_CLIP_SAMPLES and len(w.readframes(n)) != 2 * n:  # header khai nhiều mẫu hơn số có thật
                raise ValueError("file bị cụt: thiếu dữ liệu so với header")
            return n
    except (OSError, EOFError, wave.Error) as e:
        raise ValueError(f"không đọc được WAV: {str(e) or type(e).__name__}") from e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(WHISPER_CODE))
    args = ap.parse_args()
    fleurs_langs = args.langs.split(",")
    partial = set(fleurs_langs) != set(WHISPER_CODE)
    rows_out = []
    for fleurs in fleurs_langs:
        lang = WHISPER_CODE[fleurs]
        tsv_pin, tar_pin = PINNED[fleurs]
        tsv = fetch(fleurs, "dev.tsv", tsv_pin)
        tar_path = fetch(fleurs, "audio/dev.tar.gz", tar_pin)
        seen_sentences, nb_rows = set(), []
        kept, kept_samples, trimmed_samples, bad_length = 0, 0, 0, 0
        with tarfile.open(tar_path) as tar, open(tsv, encoding="utf-8") as f:
            members = {os.path.basename(m.name): m for m in tar.getmembers() if m.isfile()}
            for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                sentence_id, file_name, text = r[0], r[1], r[2]
                if sentence_id in seen_sentences:
                    continue
                x = read_pcm16(tar.extractfile(members[file_name]).read())
                y = trim_silence(x)  # độ dài tính sau khi cắt, không tin cột n_samples của TSV
                if not MIN_CLIP_SAMPLES <= len(y) <= MAX_CLIP_SAMPLES:
                    print(f"  bỏ {file_name}: {len(y)} mẫu sau khi cắt lặng (gốc {len(x)}), ngoài "
                          f"[{MIN_CLIP_SAMPLES}, {MAX_CLIP_SAMPLES}]")
                    bad_length += 1
                    continue
                seen_sentences.add(sentence_id)
                clip_id = f"{lang}-{os.path.splitext(file_name)[0]}"
                rel = os.path.join("clips", lang, clip_id + ".wav")
                write_wav(os.path.join(DATA, rel), y)
                base = {"lang": lang, "ref": text, "duration_s": round(len(y) / 16000, 2), "source": "fleurs"}
                rows_out.append({"id": clip_id, "path": rel, "narrowband": False, **base})
                if kept % 4 == 0:
                    rel_nb = os.path.join("clips", lang, clip_id + "_nb.wav")
                    write_wav(os.path.join(DATA, rel_nb), narrowband(y))
                    nb_rows.append({"id": clip_id + "_nb", "path": rel_nb, "narrowband": True, **base})
                kept += 1
                kept_samples += len(y)
                trimmed_samples += len(x) - len(y)
                if kept_samples >= MIN_SECONDS * 16000:
                    break
        # worker giữ ngôn ngữ của đoạn trước khi không chắc (asr-worker/src/lid.rs): đặt nb sau mọi clip wb,
        # để bản nb không thừa hưởng kết quả nhận diện của chính bản wb.
        rows_out.extend(nb_rows)
        print(f"{fleurs}: {kept} clip wb + {len(nb_rows)} nb, {kept_samples / 16000 / 60:.1f} phút, "
              f"cắt {trimmed_samples / 16000:.1f} giây lặng, bỏ {bad_length} clip vì độ dài")
        if kept_samples < MIN_SECONDS * 16000:
            print(f"CẢNH BÁO: {fleurs} chỉ còn {kept_samples / 16000 / 60:.1f} phút, thiếu so với "
                  f"{MIN_SECONDS // 60} phút của A4", file=sys.stderr)
    extra = os.path.join(DATA, "extra_clips.jsonl")
    if os.path.exists(extra):
        run_langs = {WHISPER_CODE[k] for k in fleurs_langs}
        kept, bad_length, bad_format, other_lang = 0, 0, 0, 0
        with open(extra, encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                row = json.loads(line)
                if partial and row.get("lang") not in run_langs:  # manifest chạy một phần chỉ có ngôn ngữ của lượt này
                    other_lang += 1
                    continue
                try:
                    if "path" not in row:
                        raise ValueError("thiếu trường path")
                    n = wav_samples(os.path.join(DATA, row["path"]))
                except ValueError as e:
                    print(f"  bỏ clip tự thu {row.get('id', '?')}: {e}")
                    bad_format += 1
                    continue
                if not MIN_CLIP_SAMPLES <= n <= MAX_CLIP_SAMPLES:
                    print(f"  bỏ clip tự thu {row.get('id', '?')}: {n} mẫu, ngoài "
                          f"[{MIN_CLIP_SAMPLES}, {MAX_CLIP_SAMPLES}]")
                    bad_length += 1
                    continue
                rows_out.append(row)
                kept += 1
        print(f"clip tự thu: {kept} clip, bỏ {bad_length} clip vì độ dài, bỏ {bad_format} clip vì sai định dạng"
              + (f", bỏ qua {other_lang} clip của ngôn ngữ ngoài lượt này" if other_lang else ""))
    name = "manifest-" + "-".join(fleurs_langs) + ".jsonl" if partial else "manifest.jsonl"
    manifest = os.path.join(DATA, name)
    with open(manifest, "w", encoding="utf-8") as f:
        for r in rows_out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("manifest:", len(rows_out), "dòng ->", manifest)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy** (tải khoảng 910 MB, mỗi ngôn ngữ một file `dev.tar.gz` từ 126 tới 217 MB)

Run:
```bash
uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "scipy==1.18.1" python bench/phase0/asr/build_clips.py
```
Expected: mỗi ngôn ngữ in một dòng, dạng `en_us: 102 clip wb + 26 nb, 15.1 phút, cắt 30.9 giây lặng, bỏ 0 clip vì độ dài`. Lúc thực thi:

| Ngôn ngữ | wb | nb | Lặng đã cắt | Bỏ vì độ dài |
|---|---|---|---|---|
| en | 102 | 26 | 30,9 giây | 0 |
| vi | 79 | 20 | 15,3 giây | 1 (31,4 giây, không có gì để cắt) |
| zh | 102 | 26 | 244,3 giây | 0 |
| ja | 70 | 18 | 23,8 giây | 0 |
| ko | 84 | 21 | 191,8 giây | 0 |

Mỗi ngôn ngữ khoảng 15,0 tới 15,2 phút. Dòng cuối là `manifest: 548 dòng -> …/bench/phase0/data/asr/manifest.jsonl`.

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/asr/build_clips.py
git commit -m "feat(bench): bộ clip A4 từ FLEURS, 15 phút mỗi ngôn ngữ, kèm bản băng hẹp"
```

### Task 7: `latency-bench asr-eval` và chấm WER/CER

**Files:**
- Create: `crates/latency-bench/Cargo.toml`
- Create: `crates/latency-bench/src/main.rs`
- Create: `crates/latency-bench/src/asr_eval.rs`
- Create: `bench/phase0/asr/score_asr.py`

`asr-eval` ghi mỗi clip một dòng:
- ngôn ngữ nhận được và bản chép;
- `no_speech_prob`;
- thời gian nhận diện ngôn ngữ và chép lời;
- `ipc_ms`: thời gian ngoài whisper, tức mã hóa khung, truyền qua pipe và giải mã khung;
- `decode_mode`;
- `audio_ctx` đã gửi và số token (`n_tokens`).

`score_asr.py` tính WER cho tiếng Anh và tiếng Việt, CER cho tiếng Trung, Nhật và Hàn (A4).
- Mỗi ngôn ngữ có một nhóm gộp (ví dụ `ko`) và ba nhóm con:
  - `wb`: băng rộng, mỗi câu một lần; mốc A4 lấy nhóm này.
  - `nb`: băng hẹp.
  - `wbp`: bản wb của đúng các câu có bản nb. So `nb` với `wbp`, vì nb chỉ có ở 1/4 số câu; review lúc thực thi thấy so với `wb` làm kết quả đổi dấu.
- Chuẩn hóa tiếng Trung:
  - Đổi chữ phồn thể về giản thể bằng `opencc`: model small ra phồn thể ở khoảng một nửa số clip, còn FLEURS là giản thể.
  - Bỏ chú thích Latin trong ngoặc, như `(Moldova)`: người đọc không đọc phần này. Danh sách id in ra stderr.
- Các cột thêm:
  - `…_capped`: lỗi mỗi clip chặn ở độ dài ref.
  - `long_hyp`: số clip lặp câu hoặc ra sai ngôn ngữ.
  - `lid_fallback`: số clip nhận diện không chắc (xác suất dưới 0,5). Khi đó worker lấy ngôn ngữ của đoạn trước, nếu có.

  Một clip lặp câu có thể xê dịch con số tới 20–30%, nên cần các cột này để đọc số cho đúng.
- Lượt chạy thiếu clip so với manifest bị từ chối, trừ khi có `--allow-partial`.

- [ ] **Step 1: Tạo `crates/latency-bench/Cargo.toml`** (bản của phần này; `sysinfo` thêm ở kế hoạch 06)

```toml
[package]
name = "latency-bench"
version = "0.1.0"
edition.workspace = true
rust-version.workspace = true
publish.workspace = true

[dependencies]
anyhow.workspace = true
asr-protocol = { path = "../asr-protocol" }
clap.workspace = true
hound.workspace = true
pipeline = { path = "../pipeline" }
serde.workspace = true
serde_json.workspace = true
```

- [ ] **Step 2: Tạo `crates/latency-bench/src/main.rs`**

```rust
//! Công cụ đo cho Giai đoạn 0. Bước này mới có `asr-eval` (A4); `latency` (S6) thêm ở kế hoạch 06.

mod asr_eval;

use clap::Parser;

#[derive(Parser)]
enum Command {
    /// Chép lời bộ clip A4 để tính WER/CER.
    AsrEval(asr_eval::AsrEvalArgs),
}

fn main() -> anyhow::Result<()> {
    match Command::parse() {
        Command::AsrEval(args) => asr_eval::run(args),
    }
}
```

- [ ] **Step 3: Tạo `crates/latency-bench/src/asr_eval.rs`**

```rust
//! Chép lời từng clip của bộ A4 qua `asr-worker`, ghi kết quả để `score_asr.py` tính WER/CER.

use anyhow::{Context, Result, bail};
use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES, TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, BufWriter, Write};
use std::path::PathBuf;
use std::time::Instant;

#[derive(clap::Args)]
pub struct AsrEvalArgs {
    /// JSONL do `build_clips.py` tạo: mỗi dòng có id, lang, path (tương đối với file manifest), ref.
    #[arg(long)]
    manifest: PathBuf,
    #[arg(long)]
    asr_worker: PathBuf,
    #[arg(long)]
    asr_model: PathBuf,
    #[arg(long, value_delimiter = ',', default_value = "en,zh,ja,ko,vi")]
    languages: Vec<String>,
    /// Khóa ngôn ngữ theo nhãn của clip thay vì tự nhận diện.
    #[arg(long)]
    lock_language: bool,
    /// Dùng cửa sổ mã hóa 30 giây đầy đủ (audio_ctx = 1500), để so với cách rút ngắn.
    #[arg(long)]
    full_ctx: bool,
    /// Sàn thêm cho audio_ctx, từ 0 đến 1500: audio_ctx = max(audio_ctx_for_samples, N). Công thức đã có sàn
    /// `MIN_AUDIO_CTX` (512), nên N ≤ 512 không có tác dụng. Muốn so với mốc không sàn thì dùng kết quả đã lưu,
    /// hoặc build lại từ commit trước af5b41a. Không dùng chung với `--full-ctx`.
    #[arg(
        long,
        default_value_t = 0,
        value_parser = clap::value_parser!(i32).range(0..=1500),
        conflicts_with = "full_ctx"
    )]
    min_ctx: i32,
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    threads: u32,
    /// File kết quả JSONL. Ghi ra `<out>.part` rồi mới đổi tên khi chạy xong, nên lượt chạy dở không ghi đè file cũ.
    #[arg(long)]
    out: PathBuf,
    /// Thư mục log của worker. Mỗi lượt ghi vào `<tên file --out bỏ đuôi>.log`, ví dụ `out-thu-ko.jsonl` thành
    /// `out-thu-ko.log`, nên các lượt chạy với `--out` khác nhau không ghi đè log của nhau. Chạy lại với cùng
    /// `--out` thì log cũ bị xóa.
    #[arg(long, default_value = "logs")]
    log_dir: PathBuf,
}

#[derive(Deserialize)]
struct Clip {
    id: String,
    lang: String,
    path: String,
}

#[derive(Serialize)]
struct Output {
    id: String,
    lang_ref: String,
    lang_hyp: String,
    lang_prob: f32,
    hyp: String,
    /// Đoạn có giá trị > 0,6 bị bỏ theo spec §6.4 (luật đề xuất thêm điều kiện `avg_logprob`, xem bên dưới); trên clip có
    /// tiếng nói thì phải hiếm.
    no_speech_prob: f32,
    /// Trung bình log-xác suất của các token văn bản, không tính EOT (0 nếu không có token); xem
    /// `TranscribeResult::avg_logprob`.
    avg_logprob: f32,
    lid_ms: f32,
    asr_ms: f32,
    /// Thời gian ngoài whisper: mã hóa khung, truyền qua pipe, giải mã khung (giả định 10, §14).
    ipc_ms: f32,
    audio_ms: u64,
    /// `audio_ctx` đã gửi cho worker, để phân tích lỗi lặp câu theo cửa sổ mã hóa.
    audio_ctx: i32,
    /// Số token worker trả về.
    n_tokens: usize,
    decode_mode: String,
}

pub fn run(args: AsrEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let base = args
        .manifest
        .parent()
        .context("manifest không có thư mục cha")?
        .to_path_buf();
    let stem = args.out.file_stem().context("--out phải là đường dẫn tới một file")?;
    let log = args.log_dir.join(format!("{}.log", stem.to_string_lossy()));
    let mut part = args.out.clone().into_os_string();
    part.push(".part");
    let part = PathBuf::from(part);
    // Log theo lượt: bắt đầu lượt mới thì xóa log cũ cùng tên. Client vẫn mở append để giữ log khi worker khởi động lại.
    std::fs::File::create(&log).with_context(|| format!("không tạo được log {}", log.display()))?;
    let (mut worker, ready) = AsrWorker::spawn(&args.asr_worker, &args.asr_model, args.use_gpu, args.threads, &log)?;
    worker.warmup()?;
    println!(
        "asr: {} ({}), chế độ giải mã {}\n{}",
        ready.backend, ready.whisper_version, ready.decode_mode, ready.system_info
    );
    let manifest = std::fs::File::open(&args.manifest)
        .with_context(|| format!("không mở được manifest {}", args.manifest.display()))?;
    let mut out =
        BufWriter::new(std::fs::File::create(&part).with_context(|| format!("không tạo được {}", part.display()))?);
    for (i, line) in BufReader::new(manifest).lines().enumerate() {
        let n = i + 1; // số dòng trong manifest
        let line = line.with_context(|| format!("manifest dòng {n}"))?;
        let clip: Clip = serde_json::from_str(&line).with_context(|| format!("manifest dòng {n}"))?;
        let path = base.join(&clip.path);
        let mut reader = hound::WavReader::open(&path)
            .with_context(|| format!("clip {} (dòng {n}): không đọc được {}", clip.id, path.display()))?;
        let spec = reader.spec();
        if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
            bail!(
                "clip {} (dòng {n}): {} phải là WAV 16 kHz, mono, 16-bit",
                clip.id,
                clip.path
            );
        }
        let pcm: Vec<i16> = reader
            .samples::<i16>()
            .collect::<Result<_, _>>()
            .with_context(|| format!("clip {} (dòng {n}): lỗi đọc mẫu từ {}", clip.id, path.display()))?;
        // Kiểm trước khi gửi: worker từ chối đoạn ngoài khoảng này, và một lỗi làm dừng cả lượt.
        if !(MIN_PCM_SAMPLES..=MAX_PCM_SAMPLES).contains(&pcm.len()) {
            bail!(
                "clip {} (dòng {n}): {} mẫu, ngoài khoảng worker nhận [{MIN_PCM_SAMPLES}, {MAX_PCM_SAMPLES}]",
                clip.id,
                pcm.len()
            );
        }
        let audio_ms = pcm.len() as u64 * 1000 / 16_000;
        let audio_ctx = if args.full_ctx {
            1500
        } else {
            audio_ctx_for_samples(pcm.len()).max(args.min_ctx).min(1500)
        };
        let languages = if args.lock_language {
            vec![clip.lang.clone()]
        } else {
            args.languages.clone()
        };
        let started = Instant::now();
        let r = worker
            .transcribe(TranscribeRequest {
                segment_id: i as u64,
                pcm,
                languages,
                prompt_tokens: Vec::new(),
                audio_ctx,
            })
            .with_context(|| format!("clip {} (dòng {n})", clip.id))?;
        let ipc_ms = started.elapsed().as_secs_f32() * 1000.0 - r.lid_ms - r.asr_ms;
        let row = Output {
            id: clip.id,
            lang_ref: clip.lang,
            lang_hyp: r.lang,
            lang_prob: r.lang_prob,
            hyp: r.text,
            no_speech_prob: r.no_speech_prob,
            avg_logprob: r.avg_logprob,
            lid_ms: r.lid_ms,
            asr_ms: r.asr_ms,
            ipc_ms,
            audio_ms,
            audio_ctx,
            n_tokens: r.tokens.len(),
            decode_mode: ready.decode_mode.clone(),
        };
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        if n % 20 == 0 {
            println!("{n} clip");
        }
    }
    out.flush()?;
    drop(out);
    std::fs::rename(&part, &args.out)
        .with_context(|| format!("không đổi tên {} thành {}", part.display(), args.out.display()))?;
    Ok(())
}
```

- [ ] **Step 4: Tạo `bench/phase0/asr/score_asr.py`**

```python
"""A4: tính WER (Anh, Việt) và CER (Trung, Nhật, Hàn) từ kết quả `latency-bench asr-eval`.

Dùng:  uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" \
         python bench/phase0/asr/score_asr.py [--allow-partial] bench/phase0/data/asr/out-<nhãn>.jsonl [...]
In bảng Markdown và ghi bench/phase0/results/a4_<nhãn>.json.

Nhóm trong bảng (mỗi ngôn ngữ có bốn nhóm):
- `<ngôn ngữ>`: gộp cả hai băng. Một phần tư số câu có bản nb nên bị đếm hai lần: không lấy làm mốc.
- `<ngôn ngữ>-wb`: băng rộng, mọi câu. Đây là mốc A4.
- `<ngôn ngữ>-nb`: băng hẹp, chỉ có ở một phần tư số câu.
- `<ngôn ngữ>-wbp`: bản băng rộng của đúng các câu có bản nb. So `-nb` với `-wbp`, không so với `-wb`,
  vì `-nb` và `-wb` gồm các câu khác nhau.

Cột thêm ngoài WER/CER thô:
- `capped`: WER/CER khi lỗi của mỗi clip bị chặn ở độ dài ref, để một clip lặp câu không quyết định cả con số.
- `long_hyp`: số clip có số chèn lớn hơn độ dài ref (lặp câu, hoặc ra sai ngôn ngữ).
- `lid_fallback`: số clip có lang_prob < 0,5, tức nhận diện không chắc. Worker giữ ngôn ngữ của clip trước (nếu có)
  cho các clip này, nên kết quả của chúng phụ thuộc thứ tự clip trong manifest.
- Cột cuối (`nospeech_rate` trong JSON): tỉ lệ clip bị bỏ theo luật "không có tiếng nói". Dòng kết quả có `avg_logprob`
  (worker từ af5b41a trở đi) dùng luật đề xuất cho §6.4: `no_speech_prob > 0,6` **và** `avg_logprob < −1`. Dòng cũ không
  có trường này dùng luật của spec, chỉ `no_speech_prob > 0,6`. Số dòng theo từng luật được in ra stderr.

Chuẩn hóa: NFC, chữ thường, bỏ dấu câu và ký hiệu; tiếng Trung, Nhật, Hàn bỏ cả khoảng trắng. Riêng tiếng Trung:
- small hay ra chữ phồn thể còn FLEURS cmn_hans_cn là giản thể, nên đổi cả ref và hyp về giản thể bằng OpenCC (t2s);
- bỏ chú thích Latin trong ngoặc, ví dụ `摩尔多瓦 (Moldova)`, `(Las Cañitas)`, ở cả ref và hyp: người đọc FLEURS
  thường không đọc phần này. Ngoại lệ là các chú thích có được đọc (model chép ra) trong SPOKEN_GLOSS: `人工智能 (AI)`,
  `委员会 (CEP)`. Đây là quy tắc máy móc, chưa nghe lại từng clip; cập nhật SPOKEN_GLOSS khi nghe lại. Không áp cho
  tiếng Nhật vì ở đó phần trong ngoặc có khi được đọc. Id các clip có ref bị bỏ phần này được in ra stderr.

Kiểm đầu vào: dừng nếu một clip xuất hiện hai lần, hoặc file thiếu clip của một ngôn ngữ có mặt trong file so với
manifest (lượt chạy dở). `--allow-partial` bỏ phép kiểm thiếu clip, để cố ý chấm một tập con.
"""
import argparse
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict

import jiwer
import opencc

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
CER_LANGS = {"zh", "ja", "ko"}
NO_SPEECH_MAX = 0.6  # luật của spec §6.4: bỏ đoạn có no_speech_prob lớn hơn
AVG_LOGPROB_MIN = -1.0  # luật đề xuất cho §6.4 (kế hoạch 00, Task 2): thêm điều kiện avg_logprob nhỏ hơn, giống latency.rs
MIN_LANG_PROB = 0.5  # dưới mức này worker giữ ngôn ngữ của đoạn trước (asr-worker/src/lid.rs)
# small hay ra chữ phồn thể, FLEURS cmn_hans_cn là giản thể: đổi về giản thể trước khi so.
T2S = opencc.OpenCC("t2s")
# Chú thích Latin trong ngoặc của ref tiếng Trung, ví dụ `摩尔多瓦 (Moldova)`, `(NHK)`, `(Las Cañitas)`.
LATIN_GLOSS = re.compile(r"\s*[(（]\s*([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ0-9 .,'&/-]*)[)）]")
# Chú thích có được đọc (model chép ra), nên giữ: `人工智能 (AI)`, `委员会 (CEP)`. Cập nhật khi nghe lại clip.
SPOKEN_GLOSS = {"ai", "cep"}


def strip_latin_gloss(text):
    return LATIN_GLOSS.sub(lambda m: m.group(0) if m.group(1).strip().lower() in SPOKEN_GLOSS else "", text)


def normalize(text, lang):
    text = unicodedata.normalize("NFC", text).lower()
    if lang == "zh":
        text = T2S.convert(strip_latin_gloss(text))
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    text = " ".join(text.split())
    return text.replace(" ", "") if lang in CER_LANGS else text


def no_speech_dropped(row):
    """Đoạn bị bỏ theo luật "không có tiếng nói": no_speech_prob > 0,6, và nếu dòng có avg_logprob thì thêm avg_logprob < −1."""
    if row["no_speech_prob"] <= NO_SPEECH_MAX:
        return False
    return row["avg_logprob"] < AVG_LOGPROB_MIN if "avg_logprob" in row else True


def p50(values):
    v = sorted(values)
    k = (len(v) - 1) / 2
    return (v[math.floor(k)] + v[math.ceil(k)]) / 2 if v else float("nan")


def score(path, manifest, allow_partial):
    with open(path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f]
    ids = [r["id"] for r in rows]
    seen = set(ids)
    if len(seen) != len(ids):
        sys.exit(f"{path}: có clip bị ghi hai lần")
    unknown = [i for i in ids if i not in manifest]
    if unknown:
        sys.exit(f"{path}: {len(unknown)} id không có trong manifest.jsonl, ví dụ {unknown[:3]}")
    for lang in sorted({manifest[i]["lang"] for i in ids}):
        missing = [k for k, c in manifest.items() if c["lang"] == lang and k not in seen]
        if missing:
            msg = f"{path}: thiếu {len(missing)} clip {lang} so với manifest (lượt chạy dở?), ví dụ {missing[:3]}"
            if not allow_partial:
                sys.exit(msg + "; thêm --allow-partial nếu cố ý chấm một tập con")
            print("CẢNH BÁO: " + msg, file=sys.stderr)
    refs = {i: unicodedata.normalize("NFC", manifest[i]["ref"]) for i in ids if manifest[i]["lang"] == "zh"}
    stripped = [i for i, ref in refs.items() if strip_latin_gloss(ref) != ref]
    if stripped:
        print(f"{path}: zh: bỏ chú thích Latin trong ngoặc ở ref của {len(stripped)} clip "
              f"(theo quy tắc, chưa nghe lại): {', '.join(stripped)}", file=sys.stderr)
    has_nb = {i.removesuffix("_nb") for i in ids if manifest[i]["narrowband"]}
    groups = defaultdict(lambda: {"ref": [], "hyp": [], "lid_ok": 0, "n": 0, "nospeech": 0, "lid_ms": [], "asr_ms": [],
                                  "ipc_ms": [], "fallback": 0, "long_hyp": 0, "capped_err": 0, "ref_len": 0})
    for r in rows:
        clip = manifest[r["id"]]
        lang = clip["lang"]
        ref, hyp = normalize(clip["ref"], lang), normalize(r["hyp"], lang)
        if not ref:
            sys.exit(f"{path}: ref của clip {r['id']} rỗng sau khi chuẩn hóa")
        o = (jiwer.process_characters if lang in CER_LANGS else jiwer.process_words)(ref, hyp)
        n_ref = o.hits + o.substitutions + o.deletions
        err = o.substitutions + o.deletions + o.insertions
        # Nhóm theo ngôn ngữ, tách băng rộng (wb) với băng hẹp (nb). `wbp`: bản wb của đúng các câu có bản nb.
        # nb chỉ có ở 1/4 số câu, nên so nb với wbp chứ không với wb.
        keys = [lang, f"{lang}-{'nb' if clip['narrowband'] else 'wb'}"]
        if not clip["narrowband"] and r["id"] in has_nb:
            keys.append(f"{lang}-wbp")
        for key in keys:
            g = groups[key]
            g["ref"].append(ref)
            g["hyp"].append(hyp)
            g["fallback"] += r["lang_prob"] < MIN_LANG_PROB
            g["long_hyp"] += o.insertions > n_ref  # lặp câu hoặc ra sai ngôn ngữ
            g["capped_err"] += min(err, n_ref)
            g["ref_len"] += n_ref
            g["lid_ok"] += r["lang_hyp"] == clip["lang"]
            g["nospeech"] += no_speech_dropped(r)
            g["n"] += 1
            g["lid_ms"].append(r["lid_ms"])
            g["asr_ms"].append(r["asr_ms"])
            g["ipc_ms"].append(r["ipc_ms"])
    mode = ",".join(sorted({r.get("decode_mode", "?") for r in rows}))
    n_new = sum("avg_logprob" in r for r in rows)
    print(f"{path}: luật no_speech: {n_new} dòng có avg_logprob (no_speech_prob > {NO_SPEECH_MAX} và avg_logprob < "
          f"{AVG_LOGPROB_MIN}), {len(rows) - n_new} dòng không có (chỉ no_speech_prob > {NO_SPEECH_MAX})", file=sys.stderr)
    out = {}
    for key, g in sorted(groups.items()):
        lang = key.split("-")[0]
        metric = "cer" if lang in CER_LANGS else "wer"
        value = (jiwer.cer if metric == "cer" else jiwer.wer)(g["ref"], g["hyp"])
        out[key] = {"n": g["n"], metric: value, f"{metric}_capped": g["capped_err"] / g["ref_len"],
                    "long_hyp": g["long_hyp"], "lid_accuracy": g["lid_ok"] / g["n"], "lid_fallback": g["fallback"],
                    "lid_ms_p50": p50(g["lid_ms"]), "asr_ms_p50": p50(g["asr_ms"]),
                    "lid_overhead": p50(g["lid_ms"]) / max(p50(g["asr_ms"]), 1e-6),
                    "ipc_ms_p50": p50(g["ipc_ms"]), "ipc_ms_max": max(g["ipc_ms"]),
                    "nospeech_rate": g["nospeech"] / g["n"], "decode_mode": mode}
    return out


def main():
    ap = argparse.ArgumentParser(description="Chấm WER/CER cho A4 từ kết quả của `latency-bench asr-eval`.")
    ap.add_argument("files", nargs="+", help="out-<nhãn>.jsonl")
    ap.add_argument("--allow-partial", action="store_true",
                    help="không đòi file có đủ mọi clip của các ngôn ngữ có mặt (chấm một tập con)")
    args = ap.parse_args()
    with open(os.path.join(DATA, "manifest.jsonl"), encoding="utf-8") as f:
        manifest = {r["id"]: r for r in map(json.loads, f)}
    # Chấm hết mọi file trước, rồi mới ghi JSON và in bảng: một file bị từ chối thì không có kết quả nửa vời.
    scored = []
    for path in args.files:
        label = os.path.basename(path).removesuffix(".jsonl").removeprefix("out-")
        scored.append((label, score(path, manifest, args.allow_partial)))
    os.makedirs(RESULTS, exist_ok=True)
    print("| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | capped | long_hyp | Nhận đúng ngôn ngữ | lid_fallback "
          "| LID p50 (ms) | ASR p50 (ms) | LID/ASR | IPC p50/max (ms) | bị bỏ (no_speech > 0,6 và avg_logprob < −1) |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for label, result in scored:
        with open(os.path.join(RESULTS, f"a4_{label}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        for key, r in result.items():
            metric = "cer" if "cer" in r else "wer"
            print(f"| {label} | {r['decode_mode']} | {key} | {r['n']} | {metric.upper()} {r[metric]:.3f} | "
                  f"{r[metric + '_capped']:.3f} | {r['long_hyp']} | {r['lid_accuracy']:.0%} | {r['lid_fallback']} | "
                  f"{r['lid_ms_p50']:.0f} | {r['asr_ms_p50']:.0f} | {r['lid_overhead']:.0%} | "
                  f"{r['ipc_ms_p50']:.1f}/{r['ipc_ms_max']:.1f} | {r['nospeech_rate']:.0%} |")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Build và chạy thử trên tiếng Hàn** (chế độ A, model small)

Run:
```bash
cargo build --release -p latency-bench
grep '"lang": "ko"' bench/phase0/data/asr/manifest.jsonl > bench/phase0/data/asr/manifest-ko.jsonl
mkdir -p bench/phase0/data/asr/logs
target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest-ko.jsonl \
  --asr-worker target/release/asr-worker --asr-model models/ggml-small-q5_1.bin \
  --out bench/phase0/data/asr/out-thu-ko.jsonl --log-dir bench/phase0/data/asr/logs
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-thu-ko.jsonl
```
Expected:
- Dòng đầu là `asr: metal (1.8.3), chế độ giải mã split`.
- Dòng sau là `WHISPER : COREML = 0 | OPENVINO = 0 | Metal : EMBED_LIBRARY = 1 | CPU : NEON = 1 | ARM_FMA = 1 | FP16_VA = 1 | DOTPROD = 1 | ACCELERATE = 1 | REPACK = 1 |`. Không được có `MATMUL_INT8` hay `SME`; nếu có thì `.cargo/config.toml` chưa có tác dụng và bản build có thể crash trên M1.
- Bảng có bốn nhóm: `ko`, `ko-nb`, `ko-wb`, `ko-wbp`.
- Log của lượt này là `bench/phase0/data/asr/logs/out-thu-ko.log` (tên log theo `--out`), có dòng `asr-worker: backend=metal flash_attn=off decode_mode=split`.
- Lúc thực thi (flash attention tắt, clip đã cắt lặng):
  - `ko-wb`: CER 0,235 (chặn 0,102), nhận đúng ngôn ngữ 98%;
  - `ko-nb` 0,232 so với `ko-wbp` 0,186;
  - LID/ASR khoảng 12%.

  Task 10 sẽ so với chế độ B.
- Trên bộ clip cũ (chưa cắt lặng, 68 clip wb), lượt này cho CER 0,449 và nhận đúng ngôn ngữ 85%. Chế độ A chỉ nhận diện trên 3 giây đầu, nên khoảng lặng dài ở đầu clip làm nó nhận sai. Đó là lý do Task 6 cắt lặng.

- [ ] **Step 6: Xóa file thử rồi commit**

```bash
rm bench/phase0/results/a4_thu-ko.json
git add crates/latency-bench bench/phase0/asr/score_asr.py Cargo.lock
git commit -m "feat(bench): latency-bench asr-eval và chấm WER/CER cho A4"
```

### Task 8: Vá whisper.cpp và whisper-rs để dùng chung một lượt encode

**Files:**
- Create: `third_party/README.md`
- Create: `third_party/patches/0001-whisper-cpp-set-audio-ctx.patch`
- Create: `third_party/patches/0002-whisper-rs-set-audio-ctx.patch`
- Create: `third_party/whisper-rs-sys/` và `third_party/whisper-rs/` (mã nguồn từ crates.io, đã vá)
- Modify: `Cargo.toml` (thêm `[patch.crates-io]`)

Lý do phải vá:
- whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`. Vì vậy lượt nhận diện ngôn ngữ luôn mã hóa đủ cửa sổ 30 giây, và không thể encode một lần rồi dùng kết quả cho cả hai việc.
- Bản vá thêm `whisper_set_audio_ctx_with_state` (C) và `WhisperState::set_audio_ctx` (Rust).
- Bản vá C cũng thêm khai báo vào `bindings.rs` có sẵn của whisper-rs-sys, để build vẫn chạy khi bindgen không chạy được (lúc đó whisper-rs-sys dùng file này).

- [ ] **Step 1: Tạo `third_party/README.md`**

````markdown
# third_party

Bản sao đã vá của hai crate, nối vào qua `[patch.crates-io]` trong `Cargo.toml` ở gốc repo.

| Thư mục | Nguồn | Bản vá |
|---|---|---|
| `whisper-rs-sys/` | crates.io `whisper-rs-sys` 0.15.0 (kèm whisper.cpp 1.8.3) | `patches/0001-whisper-cpp-set-audio-ctx.patch` (whisper.cpp và `src/bindings.rs`) |
| `whisper-rs/` | crates.io `whisper-rs` 0.16.0 | `patches/0002-whisper-rs-set-audio-ctx.patch` |

## Vì sao phải vá (spec §6.4)

whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`, và `whisper-rs` không cho lấy con trỏ thô của state.
Bản vá thêm hàm `whisper_set_audio_ctx_with_state` (C) và `WhisperState::set_audio_ctx` (Rust), để `asr-worker`
dùng chung một lượt encode cho cả nhận diện ngôn ngữ và chép lời (`crates/asr-worker/src/shared.rs`).
Khai báo của hàm C cũng được thêm vào `whisper-rs-sys/src/bindings.rs`: whisper-rs-sys dùng file này khi bindgen
không chạy được (ví dụ thiếu libclang), và thiếu khai báo thì whisper-rs đã vá không biên dịch được.

## Dựng lại từ đầu

```bash
curl -sSfL -o third_party/whisper-rs-sys-0.15.0.crate https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate
curl -sSfL -o third_party/whisper-rs-0.16.0.crate https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate
shasum -a 256 -c - <<'EOF'
6986c0fe081241d391f09b9a071fbcbb59720c3563628c3c829057cf69f2a56f  third_party/whisper-rs-sys-0.15.0.crate
2088172d00f936c348d6a72f488dc2660ab3f507263a195df308a3c2383229f6  third_party/whisper-rs-0.16.0.crate
EOF
tar xzf third_party/whisper-rs-sys-0.15.0.crate -C third_party
tar xzf third_party/whisper-rs-0.16.0.crate -C third_party
rm third_party/whisper-rs-sys-0.15.0.crate third_party/whisper-rs-0.16.0.crate
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
```

## Khi sửa bản vá hoặc nâng phiên bản

1. Làm lại các bước ở mục trên với phiên bản mới, kể cả hai mã sha256. Bản vá không áp được thì sửa bản vá.
2. Xóa bản build cũ của whisper-rs-sys ở cả hai profile: `cargo clean -p whisper-rs-sys && cargo clean -p whisper-rs-sys --release`.
   build.rs chỉ theo dõi `wrapper.h` và chỉ chép whisper.cpp vào OUT_DIR khi chưa có. `cargo clean -p` không kèm `--release`
   chỉ xóa profile dev, nên binary release (bản dùng để đo) vẫn link whisper.cpp cũ.
3. Chạy lại `asr-eval` ở cả hai chế độ và so với kết quả cũ (bench/phase0).
4. Commit bằng `git add -f third_party`, vì .gitignore của whisper-rs chặn Cargo.lock của nó.
5. Gửi bản vá C lên upstream whisper.cpp. Khi upstream đã có API tương đương thì bỏ thư mục này.
````

- [ ] **Step 2: Tạo hai file vá**

`third_party/patches/0001-whisper-cpp-set-audio-ctx.patch`:

```diff
diff --git a/whisper-rs-sys/src/bindings.rs b/whisper-rs-sys/src/bindings.rs
index ecaf862..8d04c0b 100644
--- a/whisper-rs-sys/src/bindings.rs
+++ b/whisper-rs-sys/src/bindings.rs
@@ -5243,6 +5243,9 @@ unsafe extern "C" {
         lang_probs: *mut f32,
     ) -> ::std::os::raw::c_int;
 }
+unsafe extern "C" {
+    pub fn whisper_set_audio_ctx_with_state(state: *mut whisper_state, audio_ctx: ::std::os::raw::c_int);
+}
 unsafe extern "C" {
     pub fn whisper_lang_auto_detect_with_state(
         ctx: *mut whisper_context,
diff --git a/whisper-rs-sys/whisper.cpp/include/whisper.h b/whisper-rs-sys/whisper.cpp/include/whisper.h
index f4cc6bf..bb4d850 100644
--- a/whisper-rs-sys/whisper.cpp/include/whisper.h
+++ b/whisper-rs-sys/whisper.cpp/include/whisper.h
@@ -381,6 +381,11 @@ extern "C" {
                                int   n_threads,
                              float * lang_probs);
 
+    // meeting-translator patch: set the audio context used by subsequent
+    // whisper_encode_with_state / whisper_lang_auto_detect_with_state calls on this state
+    // (0 = model default). Upstream only sets it inside whisper_full_with_state.
+    WHISPER_API void whisper_set_audio_ctx_with_state(struct whisper_state * state, int audio_ctx);
+
     WHISPER_API int whisper_lang_auto_detect_with_state(
             struct whisper_context * ctx,
               struct whisper_state * state,
diff --git a/whisper-rs-sys/whisper.cpp/src/whisper.cpp b/whisper-rs-sys/whisper.cpp/src/whisper.cpp
index 5b6e4b4..cee1adc 100644
--- a/whisper-rs-sys/whisper.cpp/src/whisper.cpp
+++ b/whisper-rs-sys/whisper.cpp/src/whisper.cpp
@@ -4018,6 +4018,10 @@ const char * whisper_lang_str_full(int id) {
     return nullptr;
 }
 
+void whisper_set_audio_ctx_with_state(struct whisper_state * state, int audio_ctx) {
+    state->exp_n_audio_ctx = audio_ctx;
+}
+
 int whisper_lang_auto_detect_with_state(
         struct whisper_context * ctx,
           struct whisper_state * state,
```

`third_party/patches/0002-whisper-rs-set-audio-ctx.patch`:

```diff
--- a/whisper-rs/src/whisper_state/mod.rs
+++ b/whisper-rs/src/whisper_state/mod.rs
@@ -143,6 +143,12 @@
         } else {
             Err(WhisperError::GenericError(ret))
         }
+    }
+
+    /// meeting-translator patch: set `audio_ctx` for subsequent [WhisperState::encode] and
+    /// [WhisperState::lang_detect] calls (0 = model default).
+    pub fn set_audio_ctx(&mut self, audio_ctx: c_int) {
+        unsafe { whisper_rs_sys::whisper_set_audio_ctx_with_state(self.ptr, audio_ctx) }
     }
 
     /// Run the Whisper decoder to obtain the logits and probabilities for the next token.
```

- [ ] **Step 3: Tải mã nguồn crate và áp bản vá** (đúng các lệnh trong README)

```bash
curl -sSfL -o third_party/whisper-rs-sys-0.15.0.crate https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate
curl -sSfL -o third_party/whisper-rs-0.16.0.crate https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate
shasum -a 256 -c - <<'EOF'
6986c0fe081241d391f09b9a071fbcbb59720c3563628c3c829057cf69f2a56f  third_party/whisper-rs-sys-0.15.0.crate
2088172d00f936c348d6a72f488dc2660ab3f507263a195df308a3c2383229f6  third_party/whisper-rs-0.16.0.crate
EOF
tar xzf third_party/whisper-rs-sys-0.15.0.crate -C third_party
tar xzf third_party/whisper-rs-0.16.0.crate -C third_party
rm third_party/whisper-rs-sys-0.15.0.crate third_party/whisper-rs-0.16.0.crate
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
grep -c whisper_set_audio_ctx_with_state third_party/whisper-rs-sys/whisper.cpp/src/whisper.cpp \
  third_party/whisper-rs-sys/whisper.cpp/include/whisper.h third_party/whisper-rs-sys/src/bindings.rs \
  third_party/whisper-rs/src/whisper_state/mod.rs
```
Expected: `shasum` in `OK` cho hai file, `git apply` không báo lỗi, và `grep -c` ra `1` cho cả bốn file.

- [ ] **Step 4: Nối bản vá vào workspace.** Thêm vào cuối `Cargo.toml` ở gốc repo:

```toml
# whisper-rs và whisper-rs-sys đã vá để dùng chung một lượt encode (spec §6.4). Xem third_party/README.md.
[patch.crates-io]
whisper-rs = { path = "third_party/whisper-rs" }
whisper-rs-sys = { path = "third_party/whisper-rs-sys" }
```

- [ ] **Step 5: Build lại và chạy test** (chế độ A không đổi hành vi)

Run: `cargo build --release -p asr-worker --features metal && cargo test -p asr-worker`
Expected: build xong; `test result: ok. 14 passed`. `Cargo.lock` giờ trỏ whisper-rs và whisper-rs-sys về đường dẫn trong `third_party/`.

- [ ] **Step 6: Commit** (khoảng 13 MB mã nguồn whisper.cpp)

```bash
# -f: .gitignore của whisper-rs chặn Cargo.lock của nó; giữ nguyên nội dung crate như trên crates.io (820 file)
git add -f third_party Cargo.toml Cargo.lock
git commit -m "build(third_party): vá whisper.cpp 1.8.3 và whisper-rs 0.16 để đặt audio_ctx trước khi encode"
```

### Task 9: Chế độ B, dùng chung một lượt encode (TDD)

**Files:**
- Create: `crates/asr-worker/src/shared.rs`
- Modify: `crates/asr-worker/src/lib.rs`

Cách làm:
1. `pcm_to_mel`, rồi `set_audio_ctx`, rồi `encode` một lần.
2. Giải mã token SOT, rồi lấy từ logits:
   - xác suất của token `<|nospeech|>`: đây là `no_speech_prob` thật. `whisper_full` với tham số của app luôn trả 0 cho giá trị này.
   - xác suất các token ngôn ngữ trong tập cho phép.
3. Giải mã greedy với prompt gồm `[<|startofprev|> + tối đa 100 token trước] + SOT + ngôn ngữ + transcribe + notimestamps`.
   - Token cuối của prompt phải giải mã riêng, vì whisper.cpp ghi logits của token cuối vào hàng `n_tokens − 1`, còn `get_logits()` chỉ đọc hàng 0.
   - Chặn các token không phải tiếng nói giống whisper.cpp.
   - Dừng khi gặp EOT, hoặc khi gặp vòng lặp: mẫu 1–8 token lặp 4 lần, 9–15 token lặp 3 lần, hoặc 16–112 token lặp 2 lần (câu bị chép hai lần; đợt xử lý vấn đề mở sau S6). Khi đó gom câu lặp về đúng một bản (§6.4, "bỏ các câu lặp n-gram"), nên chế độ B khác chế độ A ở các clip lặp.
   - Số token tối đa là min(224 − độ dài prompt, 16 + 20 × số giây của đoạn).
   - Prompt tối đa `MAX_PROMPT_TOKENS` (100) token; dài hơn thì worker trả lỗi, ở cả hai chế độ.

Vì sao có luật lặp và trần token: review lúc thực thi chạy small, chế độ B trên 548 clip.
- 14 clip lặp câu (en 2, zh 12), với mẫu lặp dài 12–48 token. Luật cũ (1–8 token × 4) bắt được 0 clip, và 10 clip chạy tới trần 220 token (khoảng 557 ms, so với 136 ms ở clip thường).
- Trên FLEURS (giọng đọc), luật mới không cắt oan clip hợp lệ nào. Lời nói thật có nhiều nhất 7,75 token/giây (zh), p99 6,35. Lời nói tự nhiên sẽ xem lại ở S6.
- Kết quả của luật mới:
  - zh-wb CER từ 0,402 xuống 0,104, en-wb WER từ 0,185 xuống 0,066;
  - p99 thời gian chép lời từ 556 xuống 378 ms;
  - turbo với đoạn ngắn 3–4 giây từ khoảng 400 ms xuống khoảng 150 ms.

- [ ] **Step 1: Viết test trước.** Tạo `crates/asr-worker/src/shared.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    /// `prefix` rồi `reps` bản của `pattern`; token cuối tách ra làm `next`, như vòng giải mã.
    fn looped(prefix: &[i32], pattern: &[i32], reps: usize) -> (Vec<i32>, i32) {
        let mut seq = prefix.to_vec();
        for _ in 0..reps {
            seq.extend_from_slice(pattern);
        }
        let next = seq.pop().unwrap();
        (seq, next)
    }

    /// Mẫu `n` token khác nhau, không trùng với tiền tố [1, 2, 3].
    fn pattern(n: usize) -> Vec<i32> {
        (100..100 + n as i32).collect()
    }

    #[test]
    fn loop_repeats_by_pattern_length() {
        for n in 1..=8 {
            assert_eq!(loop_repeats(n), 4, "n = {n}");
        }
        for n in 9..=15 {
            assert_eq!(loop_repeats(n), 3, "n = {n}");
        }
        for n in 16..=112 {
            assert_eq!(loop_repeats(n), 2, "n = {n}");
        }
    }

    #[test]
    fn short_patterns_need_four_copies() {
        for n in 1..=8 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 4);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 4 bản");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 3);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 3 bản chưa là vòng lặp");
        }
    }

    #[test]
    fn medium_patterns_need_three_copies() {
        for n in 9..=15 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 3);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 3 bản");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 2);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 2 bản chưa là vòng lặp");
        }
    }

    #[test]
    fn long_patterns_need_two_copies() {
        // Ghim cận trên bằng số, không dùng lại hằng: đổi MAX_LOOP_PERIOD thì test phải đỏ.
        for n in 16..=112 {
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 2);
            assert_eq!(loop_period(&t, next), Some(n), "n = {n}, 2 bản (cả câu chép hai lần)");
            let (t, next) = looped(&[1, 2, 3], &pattern(n), 1);
            assert_eq!(loop_period(&t, next), None, "n = {n}, 1 bản chưa là vòng lặp");
        }
        // Dài hơn 112 token (nửa trần 224 token) thì để trần token lo, dù lặp bao nhiêu bản.
        for reps in [2, 3, 10] {
            let (t, next) = looped(&[], &pattern(113), reps);
            assert_eq!(loop_period(&t, next), None, "mẫu 113 token, {reps} bản");
        }
    }

    #[test]
    fn loop_must_end_with_next() {
        assert_eq!(loop_period(&[], 7), None);
        assert_eq!(loop_period(&[7, 7, 7], 8), None);
        assert_eq!(loop_period(&[7, 7, 7, 7], 8), None);
        // Vòng lặp 2 token đang lệch pha: token kế tiếp phải khớp đúng vị trí trong mẫu.
        assert_eq!(loop_period(&[5, 6, 5, 6, 5, 6, 5], 5), None);
        assert_eq!(loop_period(&[5, 6, 5, 6, 5, 6, 5], 6), Some(2));
    }

    #[test]
    fn cut_loop_keeps_one_copy() {
        // Mẫu 2 token × 4 bản.
        let (mut t, next) = looped(&[1, 2], &[5, 6], 4);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [1, 2, 5, 6]);

        // Mẫu 12 token × 3 bản.
        let p = pattern(12);
        let (mut t, next) = looped(&[1, 2], &p, 3);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Mẫu 20 token × 2 bản: cả câu chép hai lần.
        let p = pattern(20);
        let (mut t, next) = looped(&[1, 2], &p, 2);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Mẫu 70 token × 2 bản: câu tiếng Hàn dài nhất bị chép hai lần ở S7 (`ko-13932034022230918300`, 140 token).
        let p = pattern(70);
        let (mut t, next) = looped(&[1, 2], &p, 2);
        assert_eq!(t.len() + 1, 142);
        assert!(cut_loop(&mut t, next));
        assert_eq!(t, [&[1, 2][..], &p].concat());

        // Một bản thì không đụng vào `tokens`.
        let (mut t, next) = looped(&[1, 2], &p, 1);
        let before = t.clone();
        assert!(!cut_loop(&mut t, next));
        assert_eq!(t, before);
    }

    #[test]
    fn token_cap_follows_audio_length_and_prompt() {
        let secs = |s: usize| s * SAMPLE_RATE as usize;
        assert_eq!(max_new_tokens(448, 4, secs(30)), 220); // như whisper_full khi không có prompt
        assert_eq!(max_new_tokens(448, 4, secs(8)), 176);
        assert_eq!(max_new_tokens(448, 4, secs(2)), 56);
        assert_eq!(max_new_tokens(448, 4, 1_600), 18); // 0,1 giây
        assert_eq!(max_new_tokens(448, 105, secs(8)), 119); // prompt đủ 100 token
        assert_eq!(max_new_tokens(448, 300, secs(30)), 1);
    }

    // Từ vựng thử: 0, 1, 2 là chữ; 3 là khoảng trắng; 4 là EOT; 5 là token đặc biệt (sau EOT) luôn bị chặn.
    const EOT: WhisperTokenId = 4;
    const SUPPRESSED: [bool; 6] = [false, false, false, false, false, true];
    const BLANK: [WhisperTokenId; 2] = [3, EOT];

    /// log-softmax tại `at` trên các chỉ số `over`, tính bằng f64.
    fn exact_logprob(logits: &[f32], over: impl Iterator<Item = usize>, at: usize) -> f64 {
        let z: f64 = over.map(|i| (logits[i] as f64).exp()).sum();
        logits[at] as f64 - z.ln()
    }

    #[test]
    fn pick_token_normalizes_over_unsuppressed_tokens() {
        // Token 5 (đặc biệt, logit 100) bị chặn: không được chọn, và không vào mẫu số.
        let logits = [1.0, 2.0, 3.0, 0.0, 2.5, 100.0];
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 2);
        let want = exact_logprob(&logits, 0..5, 2);
        assert!((logprob as f64 - want).abs() < 1e-5, "{logprob} so với {want}");
    }

    #[test]
    fn pick_token_first_step_leaves_out_blank_and_eot() {
        let logits = [0.5, 0.5, 0.25, 5.0, 9.0, 100.0];
        // Bước đầu: khoảng trắng (3) và EOT (4) bị chặn cả khi chọn lẫn khi chuẩn hóa. Hòa thì lấy token đứng trước.
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, true);
        assert_eq!(token, 0);
        assert!((logprob as f64 - exact_logprob(&logits, 0..3, 0)).abs() < 1e-5);
        // Các bước sau: EOT được phép, và ở đây thắng.
        let (token, logprob) = pick_token(&logits, &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, EOT);
        assert!((logprob as f64 - exact_logprob(&logits, 0..5, 4)).abs() < 1e-5);
    }

    #[test]
    fn pick_token_logprob_is_at_most_zero_and_ignores_far_below_logits() {
        // Một token áp đảo: log-xác suất gần 0, không bao giờ dương.
        let (token, logprob) = pick_token(&[50.0, 0.0, 0.0, 0.0, 0.0, 0.0], &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 0);
        assert!((-1e-6..=0.0).contains(&logprob), "{logprob}");

        // 998 token thấp hơn cực đại 40 nat, cộng −∞: kết quả vẫn khớp tổng chính xác, không ra NaN.
        let mut logits = vec![-40.0f32; 1000];
        logits[7] = 0.0;
        logits[8] = -1.0;
        logits[9] = f32::NEG_INFINITY;
        let suppressed = vec![false; 1000];
        let (token, logprob) = pick_token(&logits, &suppressed, &[], 999, false);
        assert_eq!(token, 7);
        let want = exact_logprob(&logits, 0..1000, 7);
        assert!((logprob as f64 - want).abs() < 1e-6, "{logprob} so với {want}");

        // Mọi logit bằng nhau: xác suất đều, log(1/n).
        let (token, logprob) = pick_token(&[0.0; 6], &SUPPRESSED, &BLANK, EOT, false);
        assert_eq!(token, 0);
        assert!((logprob as f64 + 5f64.ln()).abs() < 1e-6, "{logprob}");
    }

    #[test]
    fn pick_token_skips_only_negligible_logits() {
        // Trường hợp xấu nhất của mốc cắt (20 nat): 59 999 token nằm ngay dưới mốc, bị bỏ khỏi mẫu số. Mỗi token đóng góp
        // e^-20,5 ≈ 1,3e-9, cả nhóm cộng lại dưới 1e-4 nên log-xác suất lệch dưới 1e-4 so với tổng chính xác.
        let mut logits = vec![-20.5f32; 60_000];
        logits[42] = 0.0;
        let (token, logprob) = pick_token(&logits, &vec![false; 60_000], &[], 59_999, false);
        assert_eq!(token, 42);
        let want = exact_logprob(&logits, 0..60_000, 42);
        assert!((logprob as f64 - want).abs() < 1e-4, "{logprob} so với {want}");
        // Ngay trong mốc (−19,5) thì được cộng vào: khớp tổng chính xác.
        let mut logits = vec![-19.5f32; 60_000];
        logits[42] = 0.0;
        let (_, logprob) = pick_token(&logits, &vec![false; 60_000], &[], 59_999, false);
        let want = exact_logprob(&logits, 0..60_000, 42);
        assert!((logprob as f64 - want).abs() < 1e-5, "{logprob} so với {want}");
    }

    #[test]
    fn pick_token_without_an_allowed_token_gives_eot_and_minus_infinity() {
        // Không token nào được phép (không xảy ra với logit thật): trả EOT, không ra NaN hay dương vô cực.
        let (token, logprob) = pick_token(&[1.0, 2.0, 3.0], &[true; 3], &[], 7, false);
        assert_eq!((token, logprob), (7, f32::NEG_INFINITY));
        let (token, logprob) = pick_token(&[f32::NEG_INFINITY; 3], &[false; 3], &[], 7, false);
        assert_eq!((token, logprob), (7, f32::NEG_INFINITY));
    }

    #[test]
    fn generated_averages_logprobs_of_kept_tokens() {
        let mut g = Generated::default();
        assert_eq!(g.avg_logprob(), 0.0); // chưa có token nào
        assert!(g.push(10, -0.5));
        assert!(g.push(11, -1.5));
        assert_eq!(g.tokens, [10, 11]);
        assert!((g.avg_logprob() + 1.0).abs() < 1e-6);
    }

    #[test]
    fn generated_drops_logprobs_of_a_cut_loop() {
        // Tiền tố 9, rồi mẫu [5, 6] lặp 4 bản: bản đầu có log-xác suất cao, các bản sau thấp (chữ bịa ra).
        let mut g = Generated::default();
        assert!(g.push(9, -1.0));
        for (token, logprob) in [(5, -0.5), (6, -0.5)] {
            assert!(g.push(token, logprob));
        }
        for (token, logprob) in [(5, -10.0), (6, -10.0), (5, -10.0), (6, -10.0), (5, -10.0)] {
            assert!(g.push(token, logprob)); // bản 2, bản 3 và token đầu của bản 4: chưa đủ 4 bản
        }
        assert_eq!(g.tokens.len(), 8);
        assert!(!g.push(6, -10.0)); // token cuối của bản thứ tư: cắt và dừng
        assert_eq!(g.tokens, [9, 5, 6]); // đúng một bản, token gây cắt không được giữ
        assert_eq!(g.logprobs, [-1.0, -0.5, -0.5]); // log-xác suất của phần bị bỏ cũng bỏ theo
        assert!((g.avg_logprob() as f64 + 2.0 / 3.0).abs() < 1e-6);
    }
}
```

- [ ] **Step 2: Sửa `crates/asr-worker/src/lib.rs`**

```rust
pub mod engine;
pub mod lid;
#[cfg(feature = "shared-encode")]
pub mod shared;
```

- [ ] **Step 3: Chạy test để thấy lỗi**

Run: `cargo test -p asr-worker --features shared-encode`
Expected: FAIL, lỗi biên dịch vì chưa có `loop_period`, `cut_loop`, `max_new_tokens` và `SAMPLE_RATE`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/asr-worker/src/shared.rs`:

```rust
//! Chế độ dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời (spec §6.4).
//!
//! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
//! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.

use crate::engine::{Primers, mean_logprob};
use crate::lid::{min_prob_for, pick_language};
use anyhow::{Context, Result};
use asr_protocol::{MAX_PROMPT_TOKENS, SAMPLE_RATE};
use std::time::Instant;
use whisper_rs::{WhisperContext, WhisperState, WhisperTokenId};

/// Danh sách token không phải tiếng nói, chép từ `whisper_process_logits` của whisper.cpp.
const NON_SPEECH: &[&str] = &[
    "\"",
    "#",
    "(",
    ")",
    "*",
    "+",
    "/",
    ":",
    ";",
    "<",
    "=",
    ">",
    "@",
    "[",
    "\\",
    "]",
    "^",
    "_",
    "`",
    "{",
    "|",
    "}",
    "~",
    "「",
    "」",
    "『",
    "』",
    "<<",
    ">>",
    "<<<",
    ">>>",
    "--",
    "---",
    "-(",
    "-[",
    "('",
    "(\"",
    "((",
    "))",
    "(((",
    ")))",
    "[[",
    "]]",
    "{{",
    "}}",
    "♪♪",
    "♪♪♪",
    "♩",
    "♪",
    "♫",
    "♬",
    "♭",
    "♮",
    "♯",
];

pub struct Decoded {
    pub lang_id: i32,
    pub lang_prob: f32,
    pub no_speech_prob: f32,
    pub tokens: Vec<WhisperTokenId>,
    pub text: String,
    pub lid_ms: f32,
    /// Trung bình log-xác suất của các token văn bản giữ lại (xem `TranscribeResult::avg_logprob`).
    pub avg_logprob: f32,
}

pub struct Decoder {
    eot: WhisperTokenId,
    /// `true` nếu token bị chặn ở mọi bước.
    suppressed: Vec<bool>,
    /// Chặn thêm ở bước đầu (tránh câu rỗng).
    blank: Vec<WhisperTokenId>,
}

impl Decoder {
    pub fn new(ctx: &WhisperContext) -> Self {
        let n_vocab = ctx.n_vocab() as usize;
        let eot = ctx.token_eot();
        // Giới hạn phải lớn hơn số token dài nhất có thể ra (" ♪♪♪" là 10 byte): whisper-rs 0.16 chỉ coi -1 là lỗi,
        // còn giá trị âm khác (chuỗi ra nhiều token hơn giới hạn) bị nó đổi thành độ dài Vec khổng lồ.
        let single = |s: &str| ctx.tokenize(s, 16).ok().filter(|t| t.len() == 1).map(|t| t[0]);
        let mut suppressed = vec![false; n_vocab];
        // Mọi token đặc biệt sau EOT: SOT, ngôn ngữ, task, timestamp...
        for flag in suppressed.iter_mut().skip(eot as usize + 1) {
            *flag = true;
        }
        let mut non_speech = Vec::new();
        for s in NON_SPEECH {
            non_speech.extend(single(s));
            non_speech.extend(single(&format!(" {s}")));
        }
        non_speech.extend(single(" -"));
        non_speech.extend(single(" '"));
        for id in non_speech {
            suppressed[id as usize] = true;
        }
        let blank = [single(" "), Some(eot)].into_iter().flatten().collect();
        Self { eot, suppressed, blank }
    }

    fn pick(&self, logits: &[f32], first_step: bool) -> (WhisperTokenId, f32) {
        pick_token(logits, &self.suppressed, &self.blank, self.eot, first_step)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn transcribe(
        &self,
        ctx: &WhisperContext,
        state: &mut WhisperState,
        pcm: &[f32],
        audio_ctx: i32,
        allowed: &[i32],
        prev_lang: Option<i32>,
        prompt_tokens: &[i32],
        primers: &Primers,
        n_threads: usize,
    ) -> Result<Decoded> {
        state.pcm_to_mel(pcm, n_threads)?;
        state.set_audio_ctx(audio_ctx);
        state.encode(0, n_threads)?;

        // Một bước decoder sau [SOT] cho cả xác suất ngôn ngữ lẫn xác suất "không có tiếng nói".
        let lid_started = Instant::now();
        let sot = ctx.token_sot();
        state.decode(&[sot], 0, n_threads)?;
        let logits = state.get_logits()?;
        let no_speech_prob = softmax_at(logits, ctx.token_nosp() as usize);
        let (lang_id, lang_prob) = if allowed.len() == 1 {
            (allowed[0], 1.0)
        } else {
            let lang_logit = |id: i32| logits[ctx.token_lang(id) as usize];
            let max = allowed
                .iter()
                .map(|&id| lang_logit(id))
                .fold(f32::NEG_INFINITY, f32::max);
            let mut probs = vec![0.0f32; whisper_rs::get_lang_max_id() as usize + 1];
            for &id in allowed {
                probs[id as usize] = (lang_logit(id) - max).exp();
            }
            pick_language(&probs, allowed, prev_lang, min_prob_for(pcm.len()))
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };

        // Prompt của client nếu có, không thì câu mồi của ngôn ngữ vừa chọn (zh, ja): xem `Primers`.
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;
        let context = primers.context_for(lang, prompt_tokens);
        let mut prompt = Vec::with_capacity(context.len().min(MAX_PROMPT_TOKENS) + 5);
        if !context.is_empty() {
            prompt.push(ctx.token_prev());
            prompt.extend_from_slice(&context[context.len().saturating_sub(MAX_PROMPT_TOKENS)..]);
        }
        prompt.extend([sot, ctx.token_lang(lang_id), ctx.token_transcribe(), ctx.token_not()]);
        // whisper.cpp ghi logits của token cuối vào hàng `n_tokens - 1`, còn `get_logits()` chỉ đọc
        // hàng 0. Vì vậy decode phần đầu prompt thành một batch, rồi decode riêng token cuối.
        let (head, last) = prompt.split_at(prompt.len() - 1);
        state.decode(head, 0, n_threads)?;
        state.decode(last, head.len(), n_threads)?;
        let max_new = max_new_tokens(ctx.n_text_ctx() as usize, prompt.len(), pcm.len());
        let mut out = Generated::with_capacity(max_new);
        for (step, n_past) in (0..max_new).zip(prompt.len()..) {
            let (next, logprob) = self.pick(state.get_logits()?, step == 0);
            if next == self.eot || !out.push(next, logprob) {
                break;
            }
            // Không cần logits sau token cuối cùng được phép.
            if out.tokens.len() < max_new {
                state.decode(&[next], n_past, n_threads)?;
            }
        }
        let mut bytes = Vec::new();
        for &t in &out.tokens {
            bytes.extend_from_slice(ctx.token_to_bytes(t)?);
        }
        let avg_logprob = out.avg_logprob();
        Ok(Decoded {
            lang_id,
            lang_prob,
            no_speech_prob,
            text: String::from_utf8_lossy(&bytes).trim().to_string(),
            tokens: out.tokens,
            lid_ms,
            avg_logprob,
        })
    }
}

fn softmax_at(logits: &[f32], index: usize) -> f32 {
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum: f32 = logits.iter().map(|&l| (l - max).exp()).sum();
    (logits[index] - max).exp() / sum
}

/// Token thấp hơn cực đại quá mức này (nat) không được cộng vào mẫu số của softmax trong `pick_token`. Mỗi token như vậy
/// đóng góp dưới e^-20 ≈ 2e-9 vào một tổng ≥ 1, nên cả 51 865 token cộng lại cũng làm log-xác suất lệch khoảng 1e-4 (cận trên). Ở
/// logit thật, phần lớn token chữ nằm 15 đến 21 nat dưới cực đại, nên mốc này bỏ được khoảng 0 đến 75% số `exp`.
const LOGSUMEXP_CUTOFF: f32 = 20.0;

/// Chọn token có logit lớn nhất trong các token không bị chặn (`suppressed`, và ở bước đầu cả `blank`), kèm log-xác
/// suất của nó. Log-xác suất là log-softmax trên đúng tập token được phép, giống `whisper_process_logits` của
/// whisper.cpp (token bị chặn có logit −∞ nên không vào mẫu số) và giống `plog` mà chế độ A đọc từ `whisper_full`.
///
/// Hai vòng lặp viết dạng `continue` như bản chỉ chọn token: viết gộp bằng closure hay `filter` làm vòng chọn chậm gấp 6
/// lần (181 µs so với 27 µs trên 51 865 logit) và đội thời gian chép lời thêm khoảng 7%.
fn pick_token(
    logits: &[f32],
    suppressed: &[bool],
    blank: &[WhisperTokenId],
    eot: WhisperTokenId,
    first_step: bool,
) -> (WhisperTokenId, f32) {
    let mut best = (eot, f32::NEG_INFINITY);
    for (id, &logit) in logits.iter().enumerate() {
        let token = id as WhisperTokenId;
        if suppressed[id] || (first_step && blank.contains(&token)) {
            continue;
        }
        if logit > best.1 {
            best = (token, logit);
        }
    }
    if best.1 == f32::NEG_INFINITY {
        // Không token nào được phép (không xảy ra với logit thật): không có xác suất nào để tính.
        return (best.0, f32::NEG_INFINITY);
    }
    // Mẫu số của softmax, trừ cực đại cho ổn định số; token được chọn đóng góp 1 nên tổng ≥ 1. Cộng bằng f64: cộng f32
    // nối tiếp làm mất mọi số hạng dưới 6e-8 một khi tổng đã gần 1. whisper.cpp cộng f32 nối tiếp nên `plog` của chế độ A
    // cao hơn giá trị chính xác này khoảng 2e-4 (1e-4 đến 3e-4 trên 29 clip thử), và hai chế độ lệch nhau cỡ đó.
    let mut sum = 0.0f64;
    for (id, &logit) in logits.iter().enumerate() {
        if logit - best.1 <= -LOGSUMEXP_CUTOFF
            || suppressed[id]
            || (first_step && blank.contains(&(id as WhisperTokenId)))
        {
            continue;
        }
        sum += (logit - best.1).exp() as f64;
    }
    (best.0, -sum.ln() as f32)
}

/// Các token đã sinh và log-xác suất của từng token. Hai vec luôn cùng độ dài.
#[derive(Default)]
struct Generated {
    tokens: Vec<WhisperTokenId>,
    logprobs: Vec<f32>,
}

impl Generated {
    fn with_capacity(n: usize) -> Self {
        Self {
            tokens: Vec::with_capacity(n),
            logprobs: Vec::with_capacity(n),
        }
    }

    /// Thêm `next`. Nếu `next` làm thành vòng lặp (xem `cut_loop`) thì `tokens` được gom về một bản, log-xác suất của
    /// phần bị bỏ cũng bỏ theo (không tính vào `avg_logprob`), `next` không được giữ, và trả `false`: phải dừng giải mã.
    fn push(&mut self, next: WhisperTokenId, logprob: f32) -> bool {
        if cut_loop(&mut self.tokens, next) {
            self.logprobs.truncate(self.tokens.len());
            return false;
        }
        self.tokens.push(next);
        self.logprobs.push(logprob);
        true
    }

    fn avg_logprob(&self) -> f32 {
        mean_logprob(&self.logprobs)
    }
}

/// Mẫu dài nhất (token) mà `loop_period` tìm: nửa trần 224 token của Whisper, vì mẫu lặp hai lần dài hơn thế không thể
/// nằm gọn trong một lượt giải mã. Câu bị lặp trong bộ clip FLEURS dài 12 đến 70 token (`ko-13932034022230918300`
/// chép cả câu 70 token hai lần, 140 token).
const MAX_LOOP_PERIOD: usize = 112;

/// Số bản liên tiếp của một mẫu `n` token ở cuối dãy thì coi là lỗi lặp của Whisper (đề xuất cho §6.4, xem kế hoạch 00,
/// Task 2; spec chỉ có bộ lọc câu lặp n-gram ở tầng app):
/// - 1–8 token: 4 bản, để không cắt nhầm lời nói thật ("no, no, no");
/// - 9–15 token: 3 bản;
/// - 16–112 token (thường là cả câu): 2 bản, vì Whisper có khi chép cả câu hai lần rồi mới dừng (S7: 8 clip, 6 của turbo
///   và 2 của small), mà 3 bản thì không bắt được.
///
/// Đánh đổi: người nói nhắc lại nguyên một câu dài hai lần liền thì bản thứ hai cũng bị gom.
fn loop_repeats(n: usize) -> usize {
    debug_assert!(n > 0, "mẫu lặp phải có ít nhất 1 token");
    match n {
        1..=8 => 4,
        9..=15 => 3,
        _ => 2,
    }
}

/// Độ dài `n` của mẫu nếu `tokens` nối thêm `next` kết thúc bằng `loop_repeats(n)` bản liên tiếp của cùng một mẫu
/// `n` token, với 1 ≤ n ≤ `MAX_LOOP_PERIOD`. Có nhiều `n` thì lấy `n` nhỏ nhất. Không cấp phát.
fn loop_period(tokens: &[WhisperTokenId], next: WhisperTokenId) -> Option<usize> {
    let len = tokens.len() + 1;
    let at = |i: usize| tokens.get(i).copied().unwrap_or(next);
    (1..=MAX_LOOP_PERIOD).find(|&n| {
        let span = n * loop_repeats(n);
        span <= len && (len - span..len - n).all(|i| at(i) == at(i + n))
    })
}

/// Nếu `next` làm thành vòng lặp (xem `loop_period`) thì cắt `tokens` về đúng một bản của mẫu và trả `true`:
/// các bản sau là chữ Whisper bịa ra, bản cuối lại còn dở (có thể cắt giữa một ký tự UTF-8 nhiều byte).
fn cut_loop(tokens: &mut Vec<WhisperTokenId>, next: WhisperTokenId) -> bool {
    match loop_period(tokens, next) {
        Some(n) => {
            tokens.truncate(tokens.len() + 1 - (loop_repeats(n) - 1) * n);
            true
        }
        None => false,
    }
}

/// Trần số token mới của một đoạn: nửa ngữ cảnh văn bản của Whisper (224) trừ độ dài prompt, và không quá
/// `16 + 20 × số giây` của đoạn. Trên bộ clip FLEURS, lời nói không lặp có nhiều nhất 7,75 token/giây (p99 6,35), nên
/// trần theo độ dài chỉ chặn vòng lặp mà `loop_period` không bắt được (các bản không giống hệt nhau), nhất là ở đoạn
/// ngắn. Hệ số 20 khoảng 3 lần p99, để `loop_period` (cần 2 đến 4 bản) thường kịp gom vòng lặp trước khi chạm trần.
/// Khác `whisper_full`: whisper.cpp luôn cho 220 token, không trừ độ dài prompt.
fn max_new_tokens(n_text_ctx: usize, prompt_len: usize, n_samples: usize) -> usize {
    let by_audio = 16 + n_samples * 20 / SAMPLE_RATE as usize;
    (n_text_ctx / 2).saturating_sub(prompt_len).min(by_audio).max(1)
}
```

- [ ] **Step 5: Chạy lại test và clippy**

Run:
```bash
cargo test -p asr-worker --features shared-encode
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
```
Expected: `test result: ok. 28 passed` (7 test chọn ngôn ngữ, 7 test engine, 14 test của `shared.rs`), clippy không có cảnh báo.

- [ ] **Step 6: Build bản dùng cho các bước sau và chạy thử**

Run:
```bash
cargo build --release -p asr-worker --features metal,shared-encode
target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest-ko.jsonl \
  --asr-worker target/release/asr-worker --asr-model models/ggml-small-q5_1.bin \
  --out bench/phase0/data/asr/out-thu-ko-b.jsonl --log-dir bench/phase0/data/asr/logs
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-thu-ko-b.jsonl
rm bench/phase0/results/a4_thu-ko-b.json
```
Expected:
- Dòng đầu là `asr: metal (1.8.3), chế độ giải mã shared`.
- Lúc thực thi (flash attention tắt, clip đã cắt lặng):
  - `ko-wb` CER 0,082 (chặn 0,082), `long_hyp` 0, nhận đúng ngôn ngữ 100%, LID/ASR 2%.
  - Cùng bộ clip, chế độ A cho 0,235.
  - Văn bản của B trùng A ở 102/105 clip. Ba clip khác nhau là ba clip mà LID 3 giây đầu của A chọn sai ngôn ngữ (một clip lặp tới 220 token).
- `lang_prob` của hai chế độ cùng nghĩa: đều chuẩn hóa trong tập cho phép qua `pick_language`. B dùng encode của cả đoạn nên xác suất cao hơn: trung vị 0,996, so với 0,973 ở A.
- `no_speech_prob` chỉ có nghĩa ở chế độ B, vì B lấy giá trị thật ngay sau SOT (trung vị 0,046 trên clip có tiếng nói). Ở chế độ A, giá trị này luôn gần 0.

- [ ] **Step 7: Commit**

```bash
git add crates/asr-worker
git commit -m "feat(asr-worker): chế độ B dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời"
```

### Task 10: So sánh chế độ A và B trên cả bộ clip

**Files:**
- Create: `bench/phase0/results/s3_ab.md` (bảng của `score_asr.py`)
- Create: `bench/phase0/results/a4_m4pro-*.json` (script sinh ra)

- [ ] **Step 1: Chạy bốn lượt: hai model × hai chế độ** (khoảng 10 phút trên M4 Pro)

Run:
```bash
for pair in small:small-q5_1 turbo:large-v3-turbo-q5_0; do
  name=${pair%%:*}; file=${pair#*:}
  for mode in split shared; do
    ASR_MODE=$mode target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
      --asr-worker target/release/asr-worker --asr-model models/ggml-$file.bin \
      --out bench/phase0/data/asr/out-m4pro-$name-$mode.jsonl --log-dir bench/phase0/data/asr/logs || break 2
  done
done
```
Expected: mỗi lượt in dòng `asr: metal (1.8.3), chế độ giải mã <split|shared>` đúng với `ASR_MODE`, rồi cứ 20 clip in tiến độ một lần, tới `540 clip` (bộ clip có 548 clip).

- [ ] **Step 2: Chấm điểm và lưu bảng**

Run:
```bash
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-m4pro-{small,turbo}-{split,shared}.jsonl | tee bench/phase0/results/s3_ab.md
```
Expected: bảng có 80 dòng (4 lượt × 20 nhóm). Cột "Chế độ" khớp với tên lượt chạy.

Cột `no_speech > 0,6` chỉ có nghĩa với chế độ B (xem Task 9). Chế độ B gom câu lặp về một bản, còn chế độ A không kiểm lặp và chạy tới 220 token. Vì vậy ở các clip lặp, chênh lệch A/B gồm cả hiệu ứng này; ghi rõ trong `s3_ab.md`, và xem cột `long_hyp`.

Khi đọc số, lưu ý tiếng Nhật: bản ghi ja có nền nhiễu cao, nên ngưỡng cắt lặng −35 dB gần như không cắt được gì, và chế độ A vẫn hay nhận sai ngôn ngữ (small nhận đúng khoảng 76%). Reviewer đã thử ngưỡng theo nền nhiễu: nó cắt vào tiếng nói, nên không dùng. Vì vậy trong `s3_ab.md`, số ja cần đọc kèm lượt `--lock-language` ở Task 11.

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s3_ab.md bench/phase0/results/a4_m4pro-*.json
git commit -m "test(bench): S3 so sánh chế độ A và B trên bộ clip A4"
```

### Task 11: Mốc A4 và thí nghiệm `audio_ctx`, khóa ngôn ngữ

**Files:**
- Create: `bench/phase0/results/s7_asr.md`

Mốc A4 dùng cấu hình mặc định của app: chế độ B, tự nhận diện ngôn ngữ, `audio_ctx` rút ngắn. Hai lượt `m4pro-small-shared` và `m4pro-turbo-shared` ở Task 10 chính là mốc này. Task này chạy thêm ba biến thể:
- `--full-ctx`: cửa sổ 30 giây, để kiểm giả định 8.
- `--lock-language`: khóa ngôn ngữ đúng theo nhãn của clip, để biết lỗi nhận diện ngôn ngữ làm WER/CER tăng bao nhiêu.
- `--min-ctx 512`: đặt mức sàn 512 cho `audio_ctx`. Review Task 4 thấy turbo lặp câu ở đoạn 1,7–4,4 giây khi dùng công thức, kể cả khi tắt flash attention, và cần `audio_ctx` từ 320 tới 512 mới ra đúng. FLEURS có ít clip ngắn, nên tác động lên đoạn do VAD cắt (thường ngắn hơn) còn phải xem ở S6.

- [ ] **Step 1: Chạy sáu lượt** (khoảng 20 phút; `--full-ctx` chậm hơn vì luôn mã hóa 30 giây)

Run:
```bash
for pair in small:small-q5_1 turbo:large-v3-turbo-q5_0; do
  name=${pair%%:*}; file=${pair#*:}
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker target/release/asr-worker --asr-model models/ggml-$file.bin --full-ctx \
    --out bench/phase0/data/asr/out-m4pro-$name-fullctx.jsonl --log-dir bench/phase0/data/asr/logs || break
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker target/release/asr-worker --asr-model models/ggml-$file.bin --lock-language \
    --out bench/phase0/data/asr/out-m4pro-$name-lock.jsonl --log-dir bench/phase0/data/asr/logs || break
  target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest.jsonl \
    --asr-worker target/release/asr-worker --asr-model models/ggml-$file.bin --min-ctx 512 \
    --out bench/phase0/data/asr/out-m4pro-$name-minctx512.jsonl --log-dir bench/phase0/data/asr/logs || break
done
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-m4pro-{small,turbo}-{shared,fullctx,lock,minctx512}.jsonl > bench/phase0/data/asr/a4_table.md \
  2> bench/phase0/data/asr/a4_gloss.txt
cat bench/phase0/data/asr/a4_table.md
```
Expected:
- Bảng có 160 dòng (8 lượt × 20 nhóm).
- Các lượt `lock` có "Nhận đúng ngôn ngữ" 100% và LID p50 bằng 0.

- [ ] **Step 2: Tạo `bench/phase0/results/s7_asr.md`**, dán bảng vào và điền kết luận theo mẫu

```markdown
# S7 phần nhận dạng (A4): mốc và quyết định

Máy: <máy>, ngày <YYYY-MM-DD>. whisper.cpp 1.8.3 (có vá), chế độ B, bộ clip FLEURS dev (548 clip: 437 wb và 111 nb, khoảng 15 phút mỗi ngôn ngữ, đã cắt lặng đầu cuối).

## Mốc A4 (cấu hình mặc định của app)

Số lấy từ nhóm `-wb`, tức mỗi câu một lần.
- Quyết định theo số thô.
- Cột `_capped` và `long_hyp` cho biết bao nhiêu lỗi đến từ clip lặp câu. Nếu số thô và số chặn cho kết luận khác nhau thì ghi rõ, kèm id các clip lặp.

| Ngôn ngữ | Chỉ số | Gói Chuẩn (turbo) | Gói Nhẹ (small) |
|---|---|---|---|
| en | WER | | |
| vi | WER | | |
| zh | CER | | |
| ja | CER | | |
| ko | CER | | |

Băng hẹp: so nhóm `-nb` với `-wbp` (cùng tập câu), không so với `-wb`: <WER/CER tăng bao nhiêu phần trăm, theo ngôn ngữ>.

Reference:
- zh đã bỏ chú thích Latin trong ngoặc ở <N> clip, theo quy tắc. Danh sách id nằm trong `bench/phase0/data/asr/a4_gloss.txt`. Quy tắc giữ `AI` và `CEP`, vì model chép ra, tức người đọc có đọc.
- Việc cho người dùng: nghe lại 24 clip có chú thích Latin (zh 16, ja 3, ko 5) và sửa ref nếu cần. A4 đòi bản chép đã được người kiểm.

## Giả định 8: rút ngắn `audio_ctx` làm WER/CER tăng không quá 10% (tương đối)

Quy tắc: với từng ngôn ngữ và từng model, (mặc định − fullctx) / fullctx ≤ 10%.
- Kết quả: <đạt / không đạt, ngôn ngữ nào vượt>

## Mức sàn `audio_ctx` 512 so với công thức

- Chênh WER/CER theo ngôn ngữ và model: <…>
- ASR p50 tăng bao nhiêu: <…>
- Đề xuất cho §6.4: <giữ công thức / thêm mức sàn>. Nếu thêm mức sàn thì S6 (kế hoạch 06) đo với mức sàn đó.

## Khóa ngôn ngữ so với tự nhận diện

- Chênh WER/CER do nhận diện sai ngôn ngữ: <theo ngôn ngữ>

## Turbo so với small

- <ngôn ngữ nào small kém rõ rệt, có cần ghi chú cho gói Nhẹ không>

## Bảng đầy đủ

<dán nội dung bench/phase0/data/asr/a4_table.md>
```

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s7_asr.md bench/phase0/results/a4_m4pro-*.json
git commit -m "test(bench): mốc A4 cho turbo và small, thí nghiệm audio_ctx và khóa ngôn ngữ"
```

**Sau Task 11:** mức sàn 512 được đưa vào công thức mặc định (`MIN_AUDIO_CTX` trong `asr-protocol`), cùng luật lặp 2 bản và LID đoạn ngắn. Mốc A4 với cấu hình chốt nằm ở `results/a4_m4pro-{small,turbo}-final.json`:

| Model | Thay đổi so với lượt `--min-ctx 512` |
|---|---|
| turbo | tổng lỗi nhóm wb 918 → 832 (−9,4%); riêng ko 0,062 → 0,041, vì luật 2 bản bắt được câu chép hai lần |
| small | không đổi |

Chỉ 3/1096 lượt clip đổi, và cả ba đều là câu chép hai lần.

### Task 12: Ước lượng dung lượng bộ cài trên macOS

**Files:**
- Create: `bench/phase0/size/sidecar_size.py`
- Create: `bench/phase0/results/s3_size_macos-arm64.json` (script sinh ra)

Mục tiêu của §6.11 là cả bộ cài ≤ 60 MB. Phần chưa rõ nhất là các tiến trình phụ, nên đo phần đó trước; app Tauri và WebView2 bootstrapper cộng thêm sau. Bản `llama-server` chính thức của macOS link động: nó cần `libllama-server-impl`, `libllama-common`, `libmtmd`, `libllama` và các `libggml*` nằm cùng thư mục (`otool -L` để xem).

- [ ] **Step 1: Tạo `bench/phase0/size/sidecar_size.py`**

```python
"""S3: ước lượng phần dung lượng bộ cài do các tiến trình phụ chiếm (§6.11, mục tiêu cả bộ cài ≤ 60 MB).

Gom các file sẽ đi kèm bộ cài (asr-worker, llama-server và thư viện của nó) rồi nén thử:
- LZMA (xz -9e): gần với cách NSIS nén bộ cài Windows.
- zlib -9: gần với ảnh .dmg của macOS.
Chưa tính app Tauri và WebView2 bootstrapper.

Dùng:  python3 bench/phase0/size/sidecar_size.py --label <tên> <file hoặc mẫu glob> [...]
Kết quả: bench/phase0/results/s3_size_<tên>.json.
"""
import argparse
import glob
import io
import json
import lzma
import os
import tarfile
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
MB = 1e6


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("paths", nargs="+", help="file hoặc mẫu glob; PowerShell không tự mở rộng glob nên script tự làm")
    args = ap.parse_args()
    files = []
    for pattern in args.paths:
        hits = sorted(glob.glob(pattern)) or [pattern]
        files += [h for h in hits if os.path.isfile(h) and h not in files]
    missing = [p for p in args.paths if not glob.glob(p)]
    if missing:
        raise SystemExit(f"không thấy: {missing}")
    names = [os.path.basename(f) for f in files]
    if len(set(names)) != len(names):
        raise SystemExit("có hai file trùng tên; đổi tên trước (ví dụ asr-worker-vulkan.exe, asr-worker-cpu.exe)")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for f in files:
            tar.add(f, arcname=os.path.basename(f))
    raw = buf.getvalue()
    xz = len(lzma.compress(raw, preset=9 | lzma.PRESET_EXTREME))
    zl = len(zlib.compress(raw, 9))

    sizes = {os.path.basename(f): os.path.getsize(f) for f in files}
    for name, size in sizes.items():
        print(f"{size / MB:8.1f} MB  {name}")
    total = sum(sizes.values())
    print(f"{total / MB:8.1f} MB  tổng, chưa nén")
    print(f"{xz / MB:8.1f} MB  nén LZMA (gần NSIS)")
    print(f"{zl / MB:8.1f} MB  nén zlib (gần .dmg)")
    os.makedirs(RESULTS, exist_ok=True)
    out = os.path.join(RESULTS, f"s3_size_{args.label}.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"files": sizes, "total_bytes": total, "lzma_bytes": xz, "zlib_bytes": zl}, f, indent=1)
    print("->", out)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy**

Run:
```bash
L=tools/llama-b11146/macos-arm64/llama-b11146
python3 bench/phase0/size/sidecar_size.py --label macos-arm64 target/release/asr-worker "$L/llama-server" \
  "$L/libllama-server-impl.dylib" "$L/libllama-common.0.5.0.dylib" "$L/libmtmd.0.5.0.dylib" \
  "$L/libllama.0.5.0.dylib" "$L/libggml*.0.25.1.dylib"
```
Expected (M4 Pro, lúc lập kế hoạch):
```
    27.5 MB  tổng, chưa nén
     7.7 MB  nén LZMA (gần NSIS)
    11.3 MB  nén zlib (gần .dmg)
```

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/size/sidecar_size.py bench/phase0/results/s3_size_macos-arm64.json
git commit -m "test(bench): ước lượng dung lượng các tiến trình phụ trong bộ cài macOS"
```

### Task 13: Chặn link whisper.cpp ngoài asr-worker trong cargo-deny

**Files:**
- Modify: `deny.toml`

Ngoại lệ `paste` đã được ghi nhận ở Task 2. Task này thêm luật "tiến trình chính không link ggml" (§5, §6.12) vào cuối khối `[bans]`, ngay dưới `wildcards = "allow"`.

- [ ] **Step 1: Thêm luật**

```toml
# Bất biến kiến trúc (spec §5, §6.12): chỉ asr-worker được link whisper.cpp (ggml); tiến trình chính thì không.
deny = [
    { crate = "whisper-rs-sys", wrappers = ["whisper-rs"], reason = "ggml chỉ được vào qua whisper-rs" },
    { crate = "whisper-rs", wrappers = ["asr-worker"], reason = "chỉ asr-worker được link whisper.cpp" },
]
```

Lúc lập kế hoạch đã thử: cho `pipeline` phụ thuộc `whisper-rs` thì `cargo deny check bans` báo `error[banned]: crate 'whisper-rs = 0.16.0' is explicitly banned`. Luật chỉ bắt phụ thuộc trực tiếp; vì vậy không crate nào được phụ thuộc thư viện `asr-worker`.

- [ ] **Step 2: Kiểm tra**

Run: `cargo deny check && cargo audit`
Expected: `advisories ok, bans ok, licenses ok, sources ok`; `cargo audit` không báo lỗ hổng (vẫn có cảnh báo `paste`).

- [ ] **Step 3: Commit**

```bash
git add deny.toml
git commit -m "build: cấm link whisper.cpp ngoài asr-worker trong cargo-deny"
```

### Task 14: Windows, build hai bản `asr-worker` và `--probe`

Máy: laptop Windows có card rời (kế hoạch 00). Máy này đã làm Task 2 của kế hoạch 01 (cài công cụ, lấy repo về), đã chạy `fetch.py`, và đã `git pull` bản mới nhất từ Mac.

**Files:**
- Create: `crates/asr-worker/src/probe.rs`
- Modify: `crates/asr-worker/src/lib.rs`

- [ ] **Step 1: Tạo `crates/asr-worker/src/probe.rs`**

```rust
//! `asr-worker-vulkan --probe`: liệt kê GPU qua Vulkan để đề xuất gói model (spec §6.4, §6.7).

use anyhow::Result;
use ash::vk;
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct GpuInfo {
    pub name: String,
    /// `discrete`, `integrated`, `virtual`, `cpu` hoặc `other`.
    pub device_type: String,
    /// Heap `DEVICE_LOCAL` lớn nhất, tính bằng byte.
    pub device_local_bytes: u64,
    pub vendor_id: u32,
}

pub fn list_gpus() -> Result<Vec<GpuInfo>> {
    let entry = unsafe { ash::Entry::load()? };
    let app = vk::ApplicationInfo::default().api_version(vk::make_api_version(0, 1, 2, 0));
    let create_info = vk::InstanceCreateInfo::default().application_info(&app);
    let instance = unsafe { entry.create_instance(&create_info, None)? };
    let mut gpus = Vec::new();
    for device in unsafe { instance.enumerate_physical_devices()? } {
        let props = unsafe { instance.get_physical_device_properties(device) };
        let memory = unsafe { instance.get_physical_device_memory_properties(device) };
        let device_local_bytes = memory.memory_heaps[..memory.memory_heap_count as usize]
            .iter()
            .filter(|heap| heap.flags.contains(vk::MemoryHeapFlags::DEVICE_LOCAL))
            .map(|heap| heap.size)
            .max()
            .unwrap_or(0);
        let device_type = match props.device_type {
            vk::PhysicalDeviceType::DISCRETE_GPU => "discrete",
            vk::PhysicalDeviceType::INTEGRATED_GPU => "integrated",
            vk::PhysicalDeviceType::VIRTUAL_GPU => "virtual",
            vk::PhysicalDeviceType::CPU => "cpu",
            _ => "other",
        };
        gpus.push(GpuInfo {
            name: props
                .device_name_as_c_str()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default(),
            device_type: device_type.to_string(),
            device_local_bytes,
            vendor_id: props.vendor_id,
        });
    }
    unsafe { instance.destroy_instance(None) };
    Ok(gpus)
}
```

- [ ] **Step 2: Sửa `crates/asr-worker/src/lib.rs`** thành bản cuối:

```rust
pub mod engine;
pub mod lid;
#[cfg(feature = "vulkan")]
pub mod probe;
#[cfg(feature = "shared-encode")]
pub mod shared;
```

- [ ] **Step 3: Build hai bản và `latency-bench`** (PowerShell; mỗi bản một thư mục target riêng để không build lại whisper.cpp mỗi lần đổi feature)

```powershell
cargo build --release -p asr-worker --features vulkan,shared-encode --target-dir target\vulkan
cargo build --release -p asr-worker --features shared-encode --target-dir target\cpu
cargo build --release -p latency-bench
Copy-Item target\vulkan\release\asr-worker.exe target\asr-worker-vulkan.exe
Copy-Item target\cpu\release\asr-worker.exe target\asr-worker-cpu.exe
cargo clippy -p asr-worker --features vulkan,shared-encode --all-targets --target-dir target\vulkan -- -D warnings
```
Expected: cả ba lệnh build xong, clippy không có cảnh báo. Nếu bindgen báo không tìm thấy libclang thì kiểm tra `LIBCLANG_PATH` (kế hoạch 01, Task 2).

- [ ] **Step 4: Kiểm tra thư viện được nạp** (mở "Developer PowerShell for VS")

```powershell
dumpbin /dependents target\asr-worker-vulkan.exe
dumpbin /dependents target\asr-worker-cpu.exe
dumpbin /dependents tools\llama-b11146\win-vulkan-x64\llama-server.exe
```
Expected:
- `asr-worker-vulkan.exe` có `vulkan-1.dll`; `asr-worker-cpu.exe` thì không.
- Cả hai không có `ggml*.dll` hay `whisper*.dll`, vì whisper.cpp được link tĩnh (§6.12).
- Ghi lại danh sách vào `bench/phase0/results/s3_windows.md`. Nếu có `VCRUNTIME140.dll`:
  - cài "Microsoft Visual C++ Redistributable" (x64) trên máy ảo ở Task 16 trước khi thử;
  - ghi vào mục việc phát sinh: MVP phải chọn giữa link tĩnh CRT (`-C target-feature=+crt-static`) và kèm bộ cài VC++ Redistributable.

- [ ] **Step 5: Dò GPU**

```powershell
target\asr-worker-vulkan.exe --probe
target\asr-worker-cpu.exe --probe
```
Expected:
- Bản Vulkan in mảng JSON, mỗi GPU một phần tử `{"name": …, "device_type": "discrete"|"integrated"|…, "device_local_bytes": …, "vendor_id": …}`. Card rời có `device_local_bytes` gần đúng dung lượng VRAM, ví dụ khoảng 6,4e9 với card 6 GB.
- Bản CPU in `[]`.

Kiểm thêm: khi stdin đóng (app chết), worker phải tự thoát.

```powershell
cmd /c "exit 3"; "exit=$LASTEXITCODE"
cmd /c "target\asr-worker-cpu.exe < NUL"; "exit=$LASTEXITCODE"
```
Expected: dòng đầu là `exit=3`, xác nhận cách đọc mã thoát này dùng được. Dòng sau là `exit=0`.

- [ ] **Step 6: Commit**

```powershell
git add crates/asr-worker
git commit -m "feat(asr-worker): --probe liệt kê GPU và heap DEVICE_LOCAL qua Vulkan"
```

### Task 15: Windows, chép lời bằng Vulkan và CPU

**Files:**
- Create: `bench/phase0/results/s3_windows.md`

- [ ] **Step 1: Chép bộ clip từ Mac** (thư mục `bench/phase0/data/asr/` gồm `manifest.jsonl` và `clips/`), hoặc chạy lại `build_clips.py` như Task 6.

- [ ] **Step 2: Chạy trên GPU và trên CPU** (model turbo, chế độ B mặc định)

```powershell
New-Item -ItemType Directory -Force bench\phase0\data\asr\logs | Out-Null
target\release\latency-bench.exe asr-eval --manifest bench\phase0\data\asr\manifest.jsonl `
  --asr-worker target\asr-worker-vulkan.exe --asr-model models\ggml-large-v3-turbo-q5_0.bin `
  --out bench\phase0\data\asr\out-win-turbo-vulkan.jsonl --log-dir bench\phase0\data\asr\logs
target\release\latency-bench.exe asr-eval --manifest bench\phase0\data\asr\manifest.jsonl `
  --asr-worker target\asr-worker-cpu.exe --asr-model models\ggml-large-v3-turbo-q5_0.bin --use-gpu false `
  --out bench\phase0\data\asr\out-win-turbo-cpu.jsonl --log-dir bench\phase0\data\asr\logs
uv run --no-project --python 3.12 --with "jiwer==4.0.0" --with "opencc==1.4.2" python bench\phase0\asr\score_asr.py `
  bench\phase0\data\asr\out-win-turbo-vulkan.jsonl bench\phase0\data\asr\out-win-turbo-cpu.jsonl
```
Expected:
- Lượt Vulkan in `asr: vulkan (1.8.3), chế độ giải mã shared`. Lượt CPU in `asr: cpu (1.8.3), …` và chậm hơn nhiều.
- Dòng `system_info` có `AVX2 = 1`, `FMA = 1`, `F16C = 1` và không có `AVX512` (mức CPU cố định ở `.cargo/config.toml`).
- WER/CER gần với lượt `m4pro-turbo-shared` trên Mac, chênh không quá vài phần trăm tương đối.
- Log của lượt Vulkan (`bench\phase0\data\asr\logs\out-win-turbo-vulkan.log`) có dòng `asr-worker: backend=vulkan flash_attn=off decode_mode=shared`.
- Flash attention mặc định tắt (xem Task 4). Không bật `ASR_FLASH_ATTN=1` trong Giai đoạn 0: lỗi thiếu mask nằm trong graph của whisper.cpp, nên Vulkan cũng sai.

Đo thêm VAD đúng nhịp trên máy này (cần `bench\phase0\data\vad\en.wav`, chép từ Mac):

```powershell
cargo run --release -p pipeline --example vad_probe -- models\silero_vad_v6.2.3.onnx bench\phase0\data\vad\en.wav --paced > $null
```
Expected: dòng `219 khung (đúng nhịp 32 ms), trung bình … ms, p50 …, p99 …, lớn nhất … ms/khung`. Ghi vào `s3_windows.md`. Đạt khi p99 dưới 8 ms, tức 25% chu kỳ 32 ms.

- [ ] **Step 3: Ước lượng dung lượng bộ cài Windows**

```powershell
python bench\phase0\size\sidecar_size.py --label windows-x64 target\asr-worker-vulkan.exe target\asr-worker-cpu.exe `
  tools\llama-b11146\win-vulkan-x64\llama-server.exe tools\llama-b11146\win-vulkan-x64\llama-server-impl.dll `
  tools\llama-b11146\win-vulkan-x64\llama-common.dll tools\llama-b11146\win-vulkan-x64\llama.dll `
  tools\llama-b11146\win-vulkan-x64\mtmd.dll "tools\llama-b11146\win-vulkan-x64\ggml*.dll" `
  tools\llama-b11146\win-vulkan-x64\libomp.dll
```
Expected:
- Lúc lập kế hoạch, riêng phần `llama-server` và các DLL của nó là 86,2 MB chưa nén, 13,7 MB sau khi nén LZMA. `ggml-vulkan.dll` chiếm 44 MB nhưng nén rất tốt.
- Cộng hai bản `asr-worker`, app Tauri và WebView2 bootstrapper, rồi so với mục tiêu 60 MB.

- [ ] **Step 4: Ghi `bench/phase0/results/s3_windows.md`**: máy, GPU, kết quả `--probe`, danh sách `dumpbin`, bảng WER/CER, dung lượng.

- [ ] **Step 5: Commit**

```powershell
git add bench/phase0/results/s3_windows.md bench/phase0/results/s3_size_windows-x64.json bench/phase0/results/a4_win-*.json
git commit -m "test(bench): S3 trên Windows (Vulkan, CPU, probe, dung lượng)"
```

### Task 16: Windows không có Vulkan (máy ảo)

- [ ] **Step 1: Chép `target\asr-worker-vulkan.exe`, `target\asr-worker-cpu.exe`, `target\release\latency-bench.exe`, `models\ggml-small-q5_1.bin` và vài clip sang máy ảo.** Nếu Task 14 thấy cần VC++ Redistributable thì cài trước.

- [ ] **Step 2: Chạy bản Vulkan**

```powershell
.\asr-worker-vulkan.exe --probe; "exit=$LASTEXITCODE"
```
Expected: không chạy được vì thiếu `vulkan-1.dll`, mã thoát `-1073741515` (0xC0000135). Đây là tín hiệu để app chuyển sang bản CPU (§6.4, §9).

- [ ] **Step 3: Chạy bản CPU**

```powershell
.\asr-worker-cpu.exe --probe
.\latency-bench.exe asr-eval --manifest manifest-thu.jsonl --asr-worker .\asr-worker-cpu.exe `
  --asr-model ggml-small-q5_1.bin --use-gpu false --out out-vm-cpu.jsonl --log-dir logs
```
Trong đó `manifest-thu.jsonl` là vài dòng đầu của `manifest.jsonl`. Chép kèm các clip tương ứng và giữ nguyên thư mục `clips\`, vì đường dẫn trong manifest tính từ thư mục chứa manifest.

Expected: `--probe` in `[]`; `asr-eval` in `asr: cpu (1.8.3), chế độ giải mã shared` và chép lời xong.

- [ ] **Step 4: Ghi kết quả vào `bench/phase0/results/s3_windows.md` rồi commit** (trên máy Windows có repo)

```powershell
git add bench/phase0/results/s3_windows.md
git commit -m "test(bench): S3 trên máy Windows không có Vulkan"
```

### Task 17: Kết luận S3

**Files:**
- Create: `bench/phase0/results/s3_lid.md`

- [ ] **Step 1: Tạo file theo mẫu, điền số từ `s3_ab.md`, `s3_windows.md` và `s3_size_*.json`**

```markdown
# S3: kết luận

## Cách chạy Silero VAD (§6.3)

Chọn: candle-onnx 0.11 trong tiến trình chính, model `silero_vad.onnx` v6.2.3.
- Khớp onnxruntime: sai khác lớn nhất <số> trên file thử (Task 2).
- Tốc độ, đo đúng nhịp 32 ms: Mac trung bình <số> ms, p99 <số> ms; Windows trung bình <số> ms, p99 <số> ms.
- Đã sửa rò bộ nhớ: state của LSTM phải `detach()`.
- Không dùng `ort` vì chỉ có bản rc. Không dùng VAD của whisper.cpp vì VAD sẽ dừng mỗi khi `asr-worker` khởi động lại.
- Ghi chú: candle-core 0.11 kéo theo `tokenizers` và oniguruma (mã C), làm build lâu hơn.

## Chế độ giải mã (§6.4)

Quy tắc chọn B làm mặc định:
- Với cả turbo và small, B nhận đúng ngôn ngữ không kém A ở mọi ngôn ngữ.
- WER/CER của B không xấu hơn A quá 2% (tương đối) ở mọi ngôn ngữ.
- LID/ASR của B dưới 20%.

| Model | Ngôn ngữ | A: WER/CER | B: WER/CER | A: nhận đúng | B: nhận đúng | A: LID/ASR | B: LID/ASR |
|---|---|---|---|---|---|---|---|

Kết luận: <B là mặc định / giữ A, lý do>.

## Giả định 9: chi phí nhận diện ngôn ngữ < 20% thời gian nhận dạng

<cột LID/ASR của chế độ đã chọn, nhóm băng rộng>

## Giả định 10: truyền qua stdin/stdout thêm ≤ 10 ms mỗi đoạn

<cột IPC p50/max>

## `no_speech_prob`

Tỉ lệ clip có tiếng nói bị lọc nhầm (> 0,6): <số> ở chế độ B. Chế độ A luôn cho 0, nên bộ lọc ở §6.4 chỉ có tác dụng với chế độ B.

## Windows

- `--probe`: <kết quả>
- Máy không có Vulkan: <kết quả>
- Thư viện nạp lúc chạy: <kết quả dumpbin>

## Dung lượng bộ cài (§6.11)

| Nền tảng | Tiến trình phụ, nén | Ước lượng cả bộ cài | Mục tiêu |
|---|---|---|---|
| macOS arm64 | | | ≤ 60 MB |
| Windows x64 | | | ≤ 60 MB |
```

- [ ] **Step 2: Commit** (sau khi đã lấy các commit từ Windows về)

```bash
git add bench/phase0/results/s3_lid.md
git commit -m "docs(bench): kết luận S3 (VAD, chế độ giải mã, Windows, dung lượng bộ cài)"
```
