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
    /// Âm thanh 16 kHz mono, đã gồm phần đệm: 200 ms làm tròn lên 7 khung (224 ms) mỗi phía. Đầu phiên và phía bị
    /// cắt cưỡng bức có ít hơn. Đệm cuối của đoạn trước có thể trùng đệm đầu của đoạn sau (đều là khung im lặng),
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
