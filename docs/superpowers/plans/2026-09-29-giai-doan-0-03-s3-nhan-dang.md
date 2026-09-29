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
    /// Âm thanh 16 kHz mono, đã gồm phần đệm: 200 ms làm tròn lên 7 khung (224 ms) mỗi phía. Đầu phiên, cuối phiên
    /// (`flush`) và phía bị cắt cưỡng bức có ít hơn. Đệm cuối của đoạn trước có thể trùng đệm đầu của đoạn sau (đều là khung im lặng),
    /// nên không được ghép `samples` của hai đoạn liền nhau mà coi như không chồng nhau.
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

Không dùng `ort`, vì crate này chỉ có bản 2.0.0-rc.13 mà §6.12 không cho dùng bản rc. Không dùng file `silero_vad_op18_ifless.onnx`, vì candle không chạy được. Mỗi khung 512 mẫu được ghép thêm 64 mẫu cuối của khung trước, giống `OnnxWrapper` của silero-vad.

- [ ] **Step 1: Viết test so sánh trước**

```rust
//! So xác suất VAD của candle-onnx với onnxruntime (bench/phase0/vad/ref_probs.py).
//! Chạy khi có đủ ba biến môi trường, nếu không thì bỏ qua. Đường dẫn phải là tuyệt đối, vì cargo chạy test
//! trong thư mục của crate:
//!   SILERO_VAD_MODEL=$PWD/models/silero_vad_v6.2.3.onnx VAD_TEST_WAV=$PWD/... VAD_REF_JSON=$PWD/... \
//!     cargo test -p pipeline --test vad_reference

use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;

#[test]
fn candle_matches_onnxruntime() {
    let (Ok(model), Ok(wav), Ok(reference)) = (
        std::env::var("SILERO_VAD_MODEL"),
        std::env::var("VAD_TEST_WAV"),
        std::env::var("VAD_REF_JSON"),
    ) else {
        eprintln!("bỏ qua: chưa đặt SILERO_VAD_MODEL, VAD_TEST_WAV, VAD_REF_JSON");
        return;
    };
    let expected: Vec<f32> = serde_json::from_reader(std::fs::File::open(reference).unwrap()).unwrap();
    let mut vad = SileroVad::load(Path::new(&model)).unwrap();
    let mut reader = hound::WavReader::open(wav).unwrap();
    let samples: Vec<f32> = reader.samples::<i16>().map(|s| s.unwrap() as f32 / 32768.0).collect();
    let got: Vec<f32> = samples
        .as_chunks::<FRAME_SAMPLES>()
        .0
        .iter()
        .map(|f| vad.prob(f).unwrap())
        .collect();
    assert_eq!(got.len(), expected.len());
    let max_diff = got
        .iter()
        .zip(&expected)
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    assert!(max_diff <= 1e-4, "chênh lệch lớn nhất {max_diff}");
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
use anyhow::{Context, Result, bail};
use candle_core::{DType, Device, Tensor};
use std::collections::HashMap;
use std::path::Path;

const CONTEXT_SAMPLES: usize = 64;
const SAMPLE_RATE: i64 = 16_000;

pub struct SileroVad {
    model: candle_onnx::onnx::ModelProto,
    input_name: String,
    state_name: String,
    sr_name: String,
    prob_output: String,
    state_output: String,
    state: Tensor,
    context: Vec<f32>,
    device: Device,
}

impl SileroVad {
    pub fn load(path: &Path) -> Result<Self> {
        let model = candle_onnx::read_file(path).with_context(|| format!("không đọc được {}", path.display()))?;
        let graph = model.graph.as_ref().context("model ONNX không có graph")?;
        let find_input = |key: &str| {
            graph
                .input
                .iter()
                .map(|i| i.name.clone())
                .find(|n| n == key || n.contains(key))
                .with_context(|| format!("không thấy input {key}"))
        };
        let input_name = find_input("input")?;
        let state_name = find_input("state")?;
        let sr_name = find_input("sr")?;
        if graph.output.len() < 2 {
            bail!("model Silero phải có 2 output (xác suất, state)");
        }
        let prob_output = graph.output[0].name.clone();
        let state_output = graph.output[1].name.clone();
        let device = Device::Cpu;
        let state = Tensor::zeros((2, 1, 128), DType::F32, &device)?;
        Ok(Self {
            model,
            input_name,
            state_name,
            sr_name,
            prob_output,
            state_output,
            state,
            context: vec![0.0; CONTEXT_SAMPLES],
            device,
        })
    }

    pub fn reset(&mut self) -> Result<()> {
        self.state = Tensor::zeros((2, 1, 128), DType::F32, &self.device)?;
        self.context = vec![0.0; CONTEXT_SAMPLES];
        Ok(())
    }

    /// Xác suất có tiếng nói của một khung 512 mẫu.
    pub fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        if frame.len() != FRAME_SAMPLES {
            bail!("khung VAD phải có {FRAME_SAMPLES} mẫu, nhận {}", frame.len());
        }
        let mut input = Vec::with_capacity(CONTEXT_SAMPLES + FRAME_SAMPLES);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(frame);
        let inputs = HashMap::from([
            (
                self.input_name.clone(),
                Tensor::from_vec(input, (1, CONTEXT_SAMPLES + FRAME_SAMPLES), &self.device)?,
            ),
            (self.state_name.clone(), self.state.clone()),
            (self.sr_name.clone(), Tensor::new(SAMPLE_RATE, &self.device)?),
        ]);
        let mut outputs = candle_onnx::simple_eval(&self.model, inputs)?;
        self.state = outputs.remove(&self.state_output).context("thiếu output state")?;
        self.context.copy_from_slice(&frame[FRAME_SAMPLES - CONTEXT_SAMPLES..]);
        let prob = outputs.remove(&self.prob_output).context("thiếu output xác suất")?;
        Ok(prob.flatten_all()?.to_vec1::<f32>()?[0])
    }
}
```

- [ ] **Step 5: Tạo script tham chiếu `bench/phase0/vad/ref_probs.py`**

```python
"""S3: xác suất Silero VAD tham chiếu bằng onnxruntime, để so với bản candle-onnx trong crate `pipeline`.

Ghép 64 mẫu cuối của khung trước làm ngữ cảnh, giống OnnxWrapper trong utils_vad.py của silero-vad.

Dùng:  uv run --no-project --python 3.12 --with "onnxruntime==1.30.0" --with "numpy==2.5.3" \
         python bench/phase0/vad/ref_probs.py <model.onnx> <audio.wav> > ref.json
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
  VAD_REF_JSON=$PWD/bench/phase0/data/vad/en.ref.json cargo test -p pipeline --test vad_reference
```
Expected: PASS, `test result: ok. 1 passed`. Lúc lập kế hoạch, sai khác lớn nhất là 0,0.

- [ ] **Step 8: Tạo `crates/pipeline/examples/vad_probe.rs` và đo tốc độ**

```rust
//! In xác suất VAD của từng khung 32 ms cho một file WAV 16 kHz mono, dạng JSON.
//! Dùng: cargo run -p pipeline --example vad_probe -- <model.onnx> <audio.wav>
use pipeline::segmenter::FRAME_SAMPLES;
use pipeline::vad::SileroVad;
use std::path::Path;
use std::time::Instant;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let mut vad = SileroVad::load(Path::new(&args[1]))?;
    let mut reader = hound::WavReader::open(&args[2])?;
    anyhow::ensure!(
        reader.spec().sample_rate == 16_000 && reader.spec().channels == 1,
        "cần WAV 16 kHz mono"
    );
    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / 32768.0))
        .collect::<Result<_, _>>()?;
    let started = Instant::now();
    let probs: Vec<f32> = samples
        .as_chunks::<FRAME_SAMPLES>()
        .0
        .iter()
        .map(|f| vad.prob(f))
        .collect::<anyhow::Result<_>>()?;
    eprintln!(
        "{} khung, trung bình {:.2} ms/khung",
        probs.len(),
        started.elapsed().as_secs_f64() * 1000.0 / probs.len() as f64
    );
    println!("{}", serde_json::to_string(&probs)?);
    Ok(())
}
```

Run: `cargo run --release -p pipeline --example vad_probe -- models/silero_vad_v6.2.3.onnx bench/phase0/data/vad/en.wav > /dev/null`
Expected: stderr in `219 khung, trung bình 0.27 ms/khung` (M4 Pro), tức dưới 1% của 32 ms thời gian thật.

- [ ] **Step 9: Commit**

```bash
git add crates/pipeline bench/phase0/vad Cargo.lock
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

    // lang id của Whisper: en=0, zh=1, ja=11, ko=16, vi=46.
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
        let p = probs(&[(23, 0.5), (46, 0.3), (0, 0.1)]);
        let (id, prob) = pick_language(&p, &[0, 46], None, 0.5);
        assert_eq!(id, 46);
        assert!((prob - 0.75).abs() < 1e-6);
    }

    #[test]
    fn keeps_previous_language_when_unsure() {
        let p = probs(&[(0, 0.2), (46, 0.25), (1, 0.2)]);
        let (id, _) = pick_language(&p, &[0, 1, 46], Some(0), 0.5);
        assert_eq!(id, 0);
    }

    #[test]
    fn ignores_previous_language_outside_allowed_set() {
        let p = probs(&[(0, 0.2), (46, 0.25), (1, 0.2)]);
        let (id, _) = pick_language(&p, &[0, 1, 46], Some(11), 0.5);
        assert_eq!(id, 46);
    }

    #[test]
    fn confident_detection_overrides_previous_language() {
        let p = probs(&[(0, 0.05), (46, 0.9)]);
        let (id, _) = pick_language(&p, &[0, 46], Some(0), 0.5);
        assert_eq!(id, 46);
    }

    #[test]
    fn all_zero_falls_back_to_previous_or_first() {
        let p = probs(&[]);
        assert_eq!(pick_language(&p, &[0, 46], Some(46), 0.5).0, 46);
        assert_eq!(pick_language(&p, &[0, 46], None, 0.5).0, 0);
    }
}
```

- [ ] **Step 4: Chạy test để thấy lỗi**

Run: `cargo test -p asr-worker`
Expected: FAIL, lỗi biên dịch vì chưa có `pick_language`. Lần đầu build whisper.cpp bằng cmake mất vài phút.

- [ ] **Step 5: Viết phần code** ở đầu `crates/asr-worker/src/lid.rs`:

```rust
//! Chọn ngôn ngữ trong tập người dùng cho phép (spec §6.4).

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
Expected: PASS, `test result: ok. 5 passed`

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

Phần code gắn `#[cfg(feature = "shared-encode")]` và `#[cfg(feature = "vulkan")]` chỉ được biên dịch khi bật feature đó, nên chưa cần `shared.rs` và `probe.rs`. stdout chỉ dùng cho khung giao thức; log của whisper.cpp đi ra stderr (`install_logging_hooks`).

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
//!   `whisper_full`, nên state này được `whisper_full` một lần lúc làm nóng rồi không chạy `whisper_full` nữa.
//! - Chế độ B (`shared`, xem `shared.rs`): một lượt encode dùng chung cho cả hai việc. Là mặc định khi build
//!   với feature `shared-encode`; đặt `ASR_MODE=split` để chạy chế độ A khi cần so sánh.

use crate::lid::pick_language;
use anyhow::{Context, Result, bail};
use asr_protocol::{SAMPLE_RATE, TranscribeRequest, TranscribeResult, audio_ctx_for_samples};
use std::time::Instant;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperState};

/// Nhận diện ngôn ngữ trên tối đa 3 giây đầu của đoạn (spec §6.4).
pub const LID_SAMPLES: usize = SAMPLE_RATE as usize * 3;
pub(crate) const MIN_LANG_PROB: f32 = 0.5;

pub struct Engine {
    ctx: WhisperContext,
    asr_state: WhisperState,
    lid_state: WhisperState,
    n_threads: usize,
    prev_lang: Option<i32>,
    /// Có giá trị khi chạy chế độ B.
    #[cfg(feature = "shared-encode")]
    shared: Option<crate::shared::Decoder>,
}

impl Engine {
    pub fn load(model_path: &str, use_gpu: bool, n_threads: u32) -> Result<Self> {
        let params = WhisperContextParameters {
            use_gpu,
            flash_attn: use_gpu,
            ..Default::default()
        };
        let ctx = WhisperContext::new_with_params(model_path, params)
            .with_context(|| format!("không nạp được model {model_path}"))?;
        let asr_state = ctx.create_state().context("tạo state chép lời")?;
        let lid_state = ctx.create_state().context("tạo state nhận diện ngôn ngữ")?;
        #[cfg(feature = "shared-encode")]
        let shared = (std::env::var("ASR_MODE").as_deref() != Ok("split")).then(|| crate::shared::Decoder::new(&ctx));
        Ok(Self {
            ctx,
            asr_state,
            lid_state,
            n_threads: n_threads.max(1) as usize,
            prev_lang: None,
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

    /// Chạy thử trên 3 giây im lặng. Nạp sẵn kernel GPU cho cả hai state, và đặt
    /// `audio_ctx` của state nhận diện ngôn ngữ về đúng 3 giây.
    pub fn warmup(&mut self) -> Result<f32> {
        let silence = vec![0.0f32; LID_SAMPLES];
        let started = Instant::now();
        let audio_ctx = audio_ctx_for_samples(silence.len());
        let params = full_params(self.n_threads, "en", audio_ctx);
        self.lid_state
            .full(params, &silence)
            .context("làm nóng state nhận diện ngôn ngữ")?;
        let params = full_params(self.n_threads, "en", audio_ctx);
        self.asr_state
            .full(params, &silence)
            .context("làm nóng state chép lời")?;
        Ok(started.elapsed().as_secs_f32() * 1000.0)
    }

    pub fn transcribe(&mut self, req: &TranscribeRequest) -> Result<TranscribeResult> {
        if req.languages.is_empty() {
            bail!("danh sách ngôn ngữ rỗng");
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
            });
        }

        let lid_started = Instant::now();
        let (lang_id, lang_prob) = if allowed.len() == 1 {
            (allowed[0], 1.0)
        } else {
            let head = &pcm[..pcm.len().min(LID_SAMPLES)];
            self.lid_state
                .pcm_to_mel(head, self.n_threads)
                .context("tính mel cho nhận diện ngôn ngữ")?;
            let (_, probs) = self
                .lid_state
                .lang_detect(0, self.n_threads)
                .context("nhận diện ngôn ngữ")?;
            pick_language(&probs, &allowed, self.prev_lang, MIN_LANG_PROB)
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };
        let lang = whisper_rs::get_lang_str(lang_id).context("lang id không hợp lệ")?;

        let asr_started = Instant::now();
        let mut params = full_params(self.n_threads, lang, req.audio_ctx);
        if !req.prompt_tokens.is_empty() {
            params.set_tokens(&req.prompt_tokens);
        }
        self.asr_state.full(params, &pcm).context("chép lời")?;
        let asr_ms = asr_started.elapsed().as_secs_f32() * 1000.0;

        let eot = self.ctx.token_eot();
        let mut text = String::new();
        let mut tokens = Vec::new();
        let mut no_speech_prob = 0.0f32;
        for segment in self.asr_state.as_iter() {
            text.push_str(&segment.to_str_lossy()?);
            no_speech_prob = no_speech_prob.max(segment.no_speech_probability());
            for i in 0..segment.n_tokens() {
                if let Some(token) = segment.get_token(i) {
                    let id = token.token_id();
                    if id < eot {
                        tokens.push(id);
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
        })
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
                    let ready = Response::Ready {
                        backend: backend_name(use_gpu).to_string(),
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
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;
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
}

impl AsrWorker {
    /// `stderr_log`: nơi ghi log của whisper.cpp, để log không lẫn vào kênh giao thức.
    pub fn spawn(
        exe: &Path,
        model: &Path,
        use_gpu: bool,
        n_threads: u32,
        stderr_log: &Path,
    ) -> Result<(Self, ReadyInfo)> {
        let mut child = Command::new(exe)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(File::create(stderr_log)?))
            .spawn()
            .with_context(|| format!("không chạy được {}", exe.display()))?;
        let stdin = BufWriter::new(child.stdin.take().context("thiếu stdin")?);
        let stdout = BufReader::new(child.stdout.take().context("thiếu stdout")?);
        let mut worker = Self { child, stdin, stdout };
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
        match self.call(&Request::Transcribe(req))? {
            Response::Result(r) => Ok(r),
            Response::Error { message, .. } => bail!("chép lời lỗi: {message}"),
            other => bail!("phản hồi không mong đợi: {other:?}"),
        }
    }

    fn call(&mut self, req: &Request) -> Result<Response> {
        write_frame(&mut self.stdin, req)?;
        read_frame(&mut self.stdout)?.context("asr-worker đã thoát")
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
Expected: `test result: ok. 19 passed` cho unit test, và `1 passed` cho `vad_reference`: không đặt biến môi trường thì test bỏ qua phần so sánh.

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
- Mỗi câu chỉ lấy một bản ghi, và bỏ clip dài hơn 30 giây.
- Cứ 4 clip thì tạo thêm một bản băng hẹp (hạ xuống 8 kHz rồi nâng lại 16 kHz), để mô phỏng tai nghe Bluetooth ở chế độ HFP.
- Clip tự thu (nếu có) khai trong `bench/phase0/data/asr/extra_clips.jsonl`, cùng định dạng với manifest.
- FLEURS được ghim theo commit `70bb2e8…` của dataset, kèm kích thước và SHA-256 của từng file. Script tải bằng hàm `ensure()` của `fetch.py` (tải tiếp, thử lại, kiểm băm), nên phải có `bench/phase0/fetch.py` ở kế hoạch 01.

- [ ] **Step 1: Tạo `bench/phase0/asr/build_clips.py`**

```python
"""Dựng bộ clip cho A4 từ FLEURS (CC BY 4.0), tập dev: mỗi ngôn ngữ ít nhất 15 phút.

- Mỗi câu của FLEURS có nhiều người đọc; lấy một bản ghi cho mỗi câu, theo thứ tự trong file TSV.
- Bỏ clip dài hơn 30 giây (cửa sổ tối đa của Whisper).
- Cứ 4 clip lấy 1 clip làm thêm bản băng hẹp: hạ xuống 8 kHz rồi nâng lại 16 kHz,
  mô phỏng tai nghe Bluetooth ở chế độ đàm thoại (HFP).
- Clip tự thu (nếu có) khai báo trong data/asr/extra_clips.jsonl, cùng định dạng với manifest.
- FLEURS ghim theo commit, kích thước và SHA-256 của từng file; tải qua hàm của fetch.py (tải tiếp, thử lại, kiểm băm).

Dùng:  uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "scipy==1.18.1" \
         python bench/phase0/asr/build_clips.py [--langs en_us,vi_vn]
Kết quả: bench/phase0/data/asr/manifest.jsonl và các file WAV 16 kHz mono trong data/asr/clips/.
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
from scipy.signal import resample_poly

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
MAX_CLIP_SECONDS = 30


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


def narrowband(x):
    y = resample_poly(resample_poly(x.astype(np.float32), 1, 2), 2, 1)
    return y.clip(-32768, 32767).astype(np.int16)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(WHISPER_CODE))
    args = ap.parse_args()
    rows_out = []
    for fleurs in args.langs.split(","):
        lang = WHISPER_CODE[fleurs]
        tsv_pin, tar_pin = PINNED[fleurs]
        tsv = fetch(fleurs, "dev.tsv", tsv_pin)
        tar_path = fetch(fleurs, "audio/dev.tar.gz", tar_pin)
        wanted, seen_sentences, total = {}, set(), 0.0
        with open(tsv, encoding="utf-8") as f:
            for r in csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE):
                sentence_id, file_name, raw_text, n_samples = r[0], r[1], r[2], int(r[5])
                seconds = n_samples / 16000
                if sentence_id in seen_sentences or seconds > MAX_CLIP_SECONDS:
                    continue
                seen_sentences.add(sentence_id)
                wanted[file_name] = raw_text
                total += seconds
                if total >= MIN_SECONDS:
                    break
        with tarfile.open(tar_path) as tar:
            members = {os.path.basename(m.name): m for m in tar.getmembers() if m.isfile()}
            for i, (file_name, text) in enumerate(wanted.items()):
                x = read_pcm16(tar.extractfile(members[file_name]).read())
                clip_id = f"{lang}-{os.path.splitext(file_name)[0]}"
                rel = os.path.join("clips", lang, clip_id + ".wav")
                write_wav(os.path.join(DATA, rel), x)
                base = {"lang": lang, "ref": text, "duration_s": round(len(x) / 16000, 2), "source": "fleurs"}
                rows_out.append({"id": clip_id, "path": rel, "narrowband": False, **base})
                if i % 4 == 0:
                    rel_nb = os.path.join("clips", lang, clip_id + "_nb.wav")
                    write_wav(os.path.join(DATA, rel_nb), narrowband(x))
                    rows_out.append({"id": clip_id + "_nb", "path": rel_nb, "narrowband": True, **base})
        print(f"{fleurs}: {len(wanted)} clip, {total / 60:.1f} phút")
    extra = os.path.join(DATA, "extra_clips.jsonl")
    if os.path.exists(extra):
        rows_out += [json.loads(line) for line in open(extra, encoding="utf-8")]
    with open(os.path.join(DATA, "manifest.jsonl"), "w", encoding="utf-8") as f:
        for r in rows_out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("manifest:", len(rows_out), "dòng ->", os.path.join(DATA, "manifest.jsonl"))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Chạy** (tải khoảng 910 MB, mỗi ngôn ngữ một file `dev.tar.gz` từ 126 tới 217 MB)

Run:
```bash
uv run --no-project --python 3.12 --with "numpy==2.5.3" --with "scipy==1.18.1" python bench/phase0/asr/build_clips.py
```
Expected:
```
en_us: 98 clip, 15.1 phút
vi_vn: 78 clip, 15.1 phút
cmn_hans_cn: 79 clip, 15.1 phút
ja_jp: 68 clip, 15.2 phút
ko_kr: 68 clip, 15.1 phút
manifest: 490 dòng -> …/bench/phase0/data/asr/manifest.jsonl
```

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
- `decode_mode`.

`score_asr.py` tính WER cho tiếng Anh và tiếng Việt, CER cho tiếng Trung, Nhật và Hàn (A4). Mỗi ngôn ngữ được tách thêm thành hai nhóm băng rộng (`wb`) và băng hẹp (`nb`).

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
use asr_protocol::{TranscribeRequest, audio_ctx_for_samples};
use pipeline::asr_client::AsrWorker;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
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
    #[arg(long, default_value_t = true, action = clap::ArgAction::Set)]
    use_gpu: bool,
    #[arg(long, default_value_t = 4)]
    threads: u32,
    #[arg(long)]
    out: PathBuf,
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
    /// Đoạn có giá trị > 0,6 sẽ bị app bỏ (§6.4); trên clip có tiếng nói thì phải hiếm.
    no_speech_prob: f32,
    lid_ms: f32,
    asr_ms: f32,
    /// Thời gian ngoài whisper: mã hóa khung, truyền qua pipe, giải mã khung (giả định 10, §14).
    ipc_ms: f32,
    audio_ms: u64,
    decode_mode: String,
}

pub fn run(args: AsrEvalArgs) -> Result<()> {
    std::fs::create_dir_all(&args.log_dir)?;
    let base = args
        .manifest
        .parent()
        .context("manifest không có thư mục cha")?
        .to_path_buf();
    let (mut worker, ready) = AsrWorker::spawn(
        &args.asr_worker,
        &args.asr_model,
        args.use_gpu,
        args.threads,
        &args.log_dir.join("asr-eval.log"),
    )?;
    worker.warmup()?;
    println!(
        "asr: {} ({}), chế độ giải mã {}\n{}",
        ready.backend, ready.whisper_version, ready.decode_mode, ready.system_info
    );
    let mut out = std::fs::File::create(&args.out)?;
    for (i, line) in BufReader::new(std::fs::File::open(&args.manifest)?).lines().enumerate() {
        let clip: Clip = serde_json::from_str(&line?)?;
        let mut reader = hound::WavReader::open(base.join(&clip.path))?;
        let spec = reader.spec();
        if spec.sample_rate != 16_000 || spec.channels != 1 || spec.bits_per_sample != 16 {
            bail!("{} phải là WAV 16 kHz, mono, 16-bit", clip.path);
        }
        let pcm: Vec<i16> = reader.samples::<i16>().collect::<Result<_, _>>()?;
        let audio_ms = pcm.len() as u64 * 1000 / 16_000;
        let audio_ctx = if args.full_ctx {
            1500
        } else {
            audio_ctx_for_samples(pcm.len())
        };
        let languages = if args.lock_language {
            vec![clip.lang.clone()]
        } else {
            args.languages.clone()
        };
        let started = Instant::now();
        let r = worker.transcribe(TranscribeRequest {
            segment_id: i as u64,
            pcm,
            languages,
            prompt_tokens: Vec::new(),
            audio_ctx,
        })?;
        let ipc_ms = started.elapsed().as_secs_f32() * 1000.0 - r.lid_ms - r.asr_ms;
        let row = Output {
            id: clip.id,
            lang_ref: clip.lang,
            lang_hyp: r.lang,
            lang_prob: r.lang_prob,
            hyp: r.text,
            no_speech_prob: r.no_speech_prob,
            lid_ms: r.lid_ms,
            asr_ms: r.asr_ms,
            ipc_ms,
            audio_ms,
            decode_mode: ready.decode_mode.clone(),
        };
        writeln!(out, "{}", serde_json::to_string(&row)?)?;
        if (i + 1) % 20 == 0 {
            println!("{} clip", i + 1);
        }
    }
    Ok(())
}
```

- [ ] **Step 4: Tạo `bench/phase0/asr/score_asr.py`**

```python
"""A4: tính WER (Anh, Việt) và CER (Trung, Nhật, Hàn) từ kết quả `latency-bench asr-eval`.

Dùng:  uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
         bench/phase0/data/asr/out-<nhãn>.jsonl [...]
In bảng Markdown và ghi bench/phase0/results/a4_<nhãn>.json.
"""
import json
import math
import os
import sys
import unicodedata
from collections import defaultdict

import jiwer

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data", "asr"))
RESULTS = os.path.abspath(os.path.join(HERE, "..", "results"))
CER_LANGS = {"zh", "ja", "ko"}
NO_SPEECH_MAX = 0.6  # app bỏ đoạn có no_speech_prob lớn hơn (§6.4)


def normalize(text, lang):
    text = unicodedata.normalize("NFC", text).lower()
    text = "".join(" " if unicodedata.category(c).startswith(("P", "S")) else c for c in text)
    text = " ".join(text.split())
    return text.replace(" ", "") if lang in CER_LANGS else text


def p50(values):
    v = sorted(values)
    k = (len(v) - 1) / 2
    return (v[math.floor(k)] + v[math.ceil(k)]) / 2 if v else float("nan")


def score(path, manifest):
    rows = [json.loads(line) for line in open(path, encoding="utf-8")]
    groups = defaultdict(lambda: {"ref": [], "hyp": [], "lid_ok": 0, "n": 0, "nospeech": 0, "lid_ms": [], "asr_ms": [],
                                  "ipc_ms": []})
    for r in rows:
        clip = manifest[r["id"]]
        # Nhóm theo ngôn ngữ, và tách riêng băng rộng (wb) với băng hẹp (nb).
        for key in (clip["lang"], f"{clip['lang']}-{'nb' if clip['narrowband'] else 'wb'}"):
            g = groups[key]
            g["ref"].append(normalize(clip["ref"], clip["lang"]))
            g["hyp"].append(normalize(r["hyp"], clip["lang"]))
            g["lid_ok"] += r["lang_hyp"] == clip["lang"]
            g["nospeech"] += r["no_speech_prob"] > NO_SPEECH_MAX
            g["n"] += 1
            g["lid_ms"].append(r["lid_ms"])
            g["asr_ms"].append(r["asr_ms"])
            g["ipc_ms"].append(r["ipc_ms"])
    mode = ",".join(sorted({r.get("decode_mode", "?") for r in rows}))
    out = {}
    for key, g in sorted(groups.items()):
        lang = key.split("-")[0]
        metric = "cer" if lang in CER_LANGS else "wer"
        value = (jiwer.cer if metric == "cer" else jiwer.wer)(g["ref"], g["hyp"])
        out[key] = {"n": g["n"], metric: value, "lid_accuracy": g["lid_ok"] / g["n"],
                    "lid_ms_p50": p50(g["lid_ms"]), "asr_ms_p50": p50(g["asr_ms"]),
                    "lid_overhead": p50(g["lid_ms"]) / max(p50(g["asr_ms"]), 1e-6),
                    "ipc_ms_p50": p50(g["ipc_ms"]), "ipc_ms_max": max(g["ipc_ms"]),
                    "nospeech_rate": g["nospeech"] / g["n"], "decode_mode": mode}
    return out


def main():
    manifest = {r["id"]: r for r in map(json.loads, open(os.path.join(DATA, "manifest.jsonl"), encoding="utf-8"))}
    os.makedirs(RESULTS, exist_ok=True)
    print("| Kết quả | Chế độ | Nhóm | Số clip | WER/CER | Nhận đúng ngôn ngữ | LID p50 (ms) | ASR p50 (ms) | LID/ASR "
          "| IPC p50/max (ms) | no_speech > 0,6 |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    for path in sys.argv[1:]:
        label = os.path.basename(path).removesuffix(".jsonl").removeprefix("out-")
        result = score(path, manifest)
        with open(os.path.join(RESULTS, f"a4_{label}.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        for key, r in result.items():
            metric = "cer" if "cer" in r else "wer"
            print(f"| {label} | {r['decode_mode']} | {key} | {r['n']} | {metric.upper()} {r[metric]:.3f} | {r['lid_accuracy']:.0%} | "
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
uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-thu-ko.jsonl
```
Expected:
- Dòng đầu là `asr: metal (1.8.3), chế độ giải mã split`.
- Dòng sau là `WHISPER : COREML = 0 | OPENVINO = 0 | Metal : EMBED_LIBRARY = 1 | CPU : NEON = 1 | ARM_FMA = 1 | FP16_VA = 1 | DOTPROD = 1 | ACCELERATE = 1 | REPACK = 1 |`. Không được có `MATMUL_INT8` hay `SME`; nếu có thì `.cargo/config.toml` chưa có tác dụng và bản build có thể crash trên M1.
- Bảng có ba nhóm: `ko`, `ko-nb`, `ko-wb`.
- Lúc lập kế hoạch, chế độ A trên 68 clip băng rộng cho CER khoảng 0,58, nhận đúng ngôn ngữ 87%; các clip dài trên 20 giây bị lặp chữ. Task 10 sẽ so với chế độ B.

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
curl -sSfL https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate | tar xz -C third_party
curl -sSfL https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate | tar xz -C third_party
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
```

## Khi nâng phiên bản

1. Làm lại các bước trên với phiên bản mới; nếu bản vá không áp được thì sửa bản vá.
2. Chạy lại `asr-eval` ở cả hai chế độ và so với kết quả cũ (bench/phase0).
3. Gửi bản vá C lên upstream whisper.cpp. Khi upstream đã có API tương đương thì bỏ thư mục này.
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
curl -sSfL https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate | tar xz -C third_party
curl -sSfL https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate | tar xz -C third_party
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
grep -c whisper_set_audio_ctx_with_state third_party/whisper-rs-sys/whisper.cpp/src/whisper.cpp \
  third_party/whisper-rs-sys/whisper.cpp/include/whisper.h third_party/whisper-rs-sys/src/bindings.rs \
  third_party/whisper-rs/src/whisper_state/mod.rs
```
Expected: `git apply` không báo lỗi, và `grep -c` ra `1` cho cả bốn file.

- [ ] **Step 4: Nối bản vá vào workspace.** Thêm vào cuối `Cargo.toml` ở gốc repo:

```toml
# whisper-rs và whisper-rs-sys đã vá để dùng chung một lượt encode (spec §6.4). Xem third_party/README.md.
[patch.crates-io]
whisper-rs = { path = "third_party/whisper-rs" }
whisper-rs-sys = { path = "third_party/whisper-rs-sys" }
```

- [ ] **Step 5: Build lại và chạy test** (chế độ A không đổi hành vi)

Run: `cargo build --release -p asr-worker --features metal && cargo test -p asr-worker`
Expected: build xong; `test result: ok. 5 passed`. `Cargo.lock` giờ trỏ whisper-rs và whisper-rs-sys về đường dẫn trong `third_party/`.

- [ ] **Step 6: Commit** (khoảng 13 MB mã nguồn whisper.cpp)

```bash
git add third_party Cargo.toml Cargo.lock
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
   - Dừng khi gặp EOT, hoặc khi một mẫu 1–8 token lặp lại 4 lần.

- [ ] **Step 1: Viết test trước.** Tạo `crates/asr-worker/src/shared.rs` chỉ gồm phần test:

```rust
#[cfg(test)]
mod tests {
    use super::is_looping;

    #[test]
    fn detects_repeated_pattern() {
        assert!(is_looping(&[1, 2, 1, 2, 1, 2, 1], 2));
        assert!(is_looping(&[5, 5, 5], 5));
        assert!(!is_looping(&[1, 2, 3, 4, 5], 6));
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
Expected: FAIL, lỗi biên dịch vì chưa có `is_looping` và `Decoder`.

- [ ] **Step 4: Viết phần code** ở đầu `crates/asr-worker/src/shared.rs`:

```rust
//! Chế độ dùng chung một lượt encode cho nhận diện ngôn ngữ và chép lời (spec §6.4).
//!
//! Cần bản vá `whisper_set_audio_ctx_with_state` trong `third_party/` (feature `shared-encode`).
//! Giải mã greedy, không timestamp, không temperature fallback, giống cấu hình của `engine.rs`.

use crate::lid::pick_language;
use anyhow::Result;
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
        let single = |s: &str| ctx.tokenize(s, 4).ok().filter(|t| t.len() == 1).map(|t| t[0]);
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

    fn pick(&self, logits: &[f32], first_step: bool) -> WhisperTokenId {
        let mut best = (self.eot, f32::NEG_INFINITY);
        for (id, &logit) in logits.iter().enumerate() {
            let token = id as WhisperTokenId;
            if self.suppressed[id] || (first_step && self.blank.contains(&token)) {
                continue;
            }
            if logit > best.1 {
                best = (token, logit);
            }
        }
        best.0
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
            pick_language(&probs, allowed, prev_lang, crate::engine::MIN_LANG_PROB)
        };
        let lid_ms = if allowed.len() == 1 {
            0.0
        } else {
            lid_started.elapsed().as_secs_f32() * 1000.0
        };

        let mut prompt = Vec::with_capacity(prompt_tokens.len() + 5);
        if !prompt_tokens.is_empty() {
            prompt.push(ctx.token_prev());
            prompt.extend_from_slice(&prompt_tokens[prompt_tokens.len().saturating_sub(100)..]);
        }
        prompt.extend([sot, ctx.token_lang(lang_id), ctx.token_transcribe(), ctx.token_not()]);
        // whisper.cpp ghi logits của token cuối vào hàng `n_tokens - 1`, còn `get_logits()` chỉ đọc
        // hàng 0. Vì vậy decode phần đầu prompt thành một batch, rồi decode riêng token cuối.
        let (head, last) = prompt.split_at(prompt.len() - 1);
        state.decode(head, 0, n_threads)?;
        state.decode(last, head.len(), n_threads)?;
        let max_new = (ctx.n_text_ctx() as usize / 2).saturating_sub(prompt.len()).max(1);
        let mut tokens = Vec::new();
        for (step, n_past) in (0..max_new).zip(prompt.len()..) {
            let next = self.pick(state.get_logits()?, step == 0);
            if next == self.eot || is_looping(&tokens, next) {
                break;
            }
            tokens.push(next);
            state.decode(&[next], n_past, n_threads)?;
        }
        let mut bytes = Vec::new();
        for &t in &tokens {
            bytes.extend_from_slice(ctx.token_to_bytes(t)?);
        }
        Ok(Decoded {
            lang_id,
            lang_prob,
            no_speech_prob,
            text: String::from_utf8_lossy(&bytes).trim().to_string(),
            tokens,
            lid_ms,
        })
    }
}

fn softmax_at(logits: &[f32], index: usize) -> f32 {
    let max = logits.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let sum: f32 = logits.iter().map(|&l| (l - max).exp()).sum();
    (logits[index] - max).exp() / sum
}

/// Dừng khi một mẫu 1–8 token lặp lại 4 lần liên tiếp (lỗi lặp của Whisper).
fn is_looping(tokens: &[WhisperTokenId], next: WhisperTokenId) -> bool {
    let mut seq = tokens.to_vec();
    seq.push(next);
    (1..=8).any(|n| {
        seq.len() >= n * 4 && {
            let tail = &seq[seq.len() - n..];
            (1..4).all(|k| &seq[seq.len() - n * (k + 1)..seq.len() - n * k] == tail)
        }
    })
}
```

- [ ] **Step 5: Chạy lại test và clippy**

Run:
```bash
cargo test -p asr-worker --features shared-encode
cargo clippy -p asr-worker --features metal,shared-encode --all-targets -- -D warnings
```
Expected: `test result: ok. 6 passed`, clippy không có cảnh báo.

- [ ] **Step 6: Build bản dùng cho các bước sau và chạy thử**

Run:
```bash
cargo build --release -p asr-worker --features metal,shared-encode
target/release/latency-bench asr-eval --manifest bench/phase0/data/asr/manifest-ko.jsonl \
  --asr-worker target/release/asr-worker --asr-model models/ggml-small-q5_1.bin \
  --out bench/phase0/data/asr/out-thu-ko-b.jsonl --log-dir bench/phase0/data/asr/logs
uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-thu-ko-b.jsonl
rm bench/phase0/results/a4_thu-ko-b.json
```
Expected:
- Dòng đầu là `asr: metal (1.8.3), chế độ giải mã shared`.
- Lúc lập kế hoạch, nhóm `ko-wb` cho CER khoảng 0,14, nhận đúng ngôn ngữ 100%, và LID/ASR khoảng 1–2%.

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
Expected: mỗi lượt in dòng `asr: metal (1.8.3), chế độ giải mã <split|shared>` đúng với `ASR_MODE`, rồi cứ 20 clip in tiến độ một lần, tới `480 clip`.

- [ ] **Step 2: Chấm điểm và lưu bảng**

Run:
```bash
uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-m4pro-{small,turbo}-{split,shared}.jsonl | tee bench/phase0/results/s3_ab.md
```
Expected: bảng có 60 dòng (4 lượt × 15 nhóm). Cột "Chế độ" khớp với tên lượt chạy.

- [ ] **Step 3: Commit**

```bash
git add bench/phase0/results/s3_ab.md bench/phase0/results/a4_m4pro-*.json
git commit -m "test(bench): S3 so sánh chế độ A và B trên bộ clip A4"
```

### Task 11: Mốc A4 và thí nghiệm `audio_ctx`, khóa ngôn ngữ

**Files:**
- Create: `bench/phase0/results/s7_asr.md`

Mốc A4 dùng cấu hình mặc định của app: chế độ B, tự nhận diện ngôn ngữ, `audio_ctx` rút ngắn. Hai lượt `m4pro-small-shared` và `m4pro-turbo-shared` ở Task 10 chính là mốc này. Task này chạy thêm hai biến thể:
- `--full-ctx`: cửa sổ 30 giây, để kiểm giả định 8.
- `--lock-language`: khóa ngôn ngữ đúng theo nhãn của clip, để biết lỗi nhận diện ngôn ngữ làm WER/CER tăng bao nhiêu.

- [ ] **Step 1: Chạy bốn lượt** (khoảng 15 phút; `--full-ctx` chậm hơn vì luôn mã hóa 30 giây)

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
done
uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench/phase0/asr/score_asr.py \
  bench/phase0/data/asr/out-m4pro-{small,turbo}-{shared,fullctx,lock}.jsonl > bench/phase0/data/asr/a4_table.md
cat bench/phase0/data/asr/a4_table.md
```
Expected:
- Bảng có 90 dòng (6 lượt × 15 nhóm).
- Các lượt `lock` có "Nhận đúng ngôn ngữ" 100% và LID p50 bằng 0.

- [ ] **Step 2: Tạo `bench/phase0/results/s7_asr.md`**, dán bảng vào và điền kết luận theo mẫu

```markdown
# S7 phần nhận dạng (A4): mốc và quyết định

Máy: <máy>, ngày <YYYY-MM-DD>. whisper.cpp 1.8.3 (có vá), chế độ B, bộ clip FLEURS dev (490 clip, 15 phút mỗi ngôn ngữ).

## Mốc A4 (cấu hình mặc định của app)

| Ngôn ngữ | Chỉ số | Gói Chuẩn (turbo) | Gói Nhẹ (small) |
|---|---|---|---|
| en | WER | | |
| vi | WER | | |
| zh | CER | | |
| ja | CER | | |
| ko | CER | | |

Băng hẹp (nhóm `-nb`) so với băng rộng: <nhận xét, ví dụ WER tăng bao nhiêu phần trăm>.

## Giả định 8: rút ngắn `audio_ctx` làm WER/CER tăng không quá 10% (tương đối)

Quy tắc: với từng ngôn ngữ và từng model, (mặc định − fullctx) / fullctx ≤ 10%.
- Kết quả: <đạt / không đạt, ngôn ngữ nào vượt>

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

### Task 13: Kiểm tra phụ thuộc sau khi thêm thư viện

**Files:**
- Modify: `deny.toml`

- [ ] **Step 1: Chạy kiểm tra**

Run: `cargo deny check`
Expected: FAIL ở phần advisories. Lỗi là `RUSTSEC-2024-0436`: crate `paste` không còn được bảo trì, do candle (`gemm`) kéo vào.

- [ ] **Step 2: Ghi nhận ngoại lệ** trong `deny.toml`, thay khối `[advisories]` bằng:

```toml
[advisories]
yanked = "deny"
unsound = "all"
ignore = [
    { id = "RUSTSEC-2024-0436", reason = "paste chỉ là macro lúc biên dịch, do candle (gemm) kéo vào; candle 0.11 chưa bỏ" },
]
```

Và thêm luật "tiến trình chính không link ggml" (§5, §6.12) vào cuối khối `[bans]`, ngay dưới `wildcards = "allow"`:

```toml
# Bất biến kiến trúc (spec §5, §6.12): chỉ asr-worker được link whisper.cpp (ggml); tiến trình chính thì không.
deny = [
    { crate = "whisper-rs-sys", wrappers = ["whisper-rs"], reason = "ggml chỉ được vào qua whisper-rs" },
    { crate = "whisper-rs", wrappers = ["asr-worker"], reason = "chỉ asr-worker được link whisper.cpp" },
]
```

Lúc lập kế hoạch đã thử: cho `pipeline` phụ thuộc `whisper-rs` thì `cargo deny check bans` báo `error[banned]: crate 'whisper-rs = 0.16.0' is explicitly banned`.

- [ ] **Step 3: Chạy lại**

Run: `cargo deny check && cargo audit`
Expected:
- `advisories ok, bans ok, licenses ok, sources ok`.
- `cargo audit` không báo lỗ hổng. Nó vẫn in cảnh báo `paste` (unmaintained), vì `cargo audit` không đọc `deny.toml`.

- [ ] **Step 4: Commit**

```bash
git add deny.toml
git commit -m "build: ghi nhận advisory paste (candle), cấm link whisper.cpp ngoài asr-worker"
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
uv run --no-project --python 3.12 --with "jiwer==4.0.0" python bench\phase0\asr\score_asr.py `
  bench\phase0\data\asr\out-win-turbo-vulkan.jsonl bench\phase0\data\asr\out-win-turbo-cpu.jsonl
```
Expected:
- Lượt Vulkan in `asr: vulkan (1.8.3), chế độ giải mã shared`. Lượt CPU in `asr: cpu (1.8.3), …` và chậm hơn nhiều.
- Dòng `system_info` có `AVX2 = 1`, `FMA = 1`, `F16C = 1` và không có `AVX512` (mức CPU cố định ở `.cargo/config.toml`).
- WER/CER gần với lượt `m4pro-turbo-shared` trên Mac, chênh không quá vài phần trăm tương đối.

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
- Tốc độ: <số> ms mỗi khung 32 ms.
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
