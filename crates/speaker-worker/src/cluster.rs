//! Phân cụm giọng trực tuyến, nhân quả (spec 2026-10-26-phan-biet-nguoi-noi §5.2–§5.4): mỗi đoạn VAD vào một giọng đã có, mở
//! giọng mới, hay lấy giọng của đoạn trước. Tâm của giọng là tổng nhúng đã chuẩn hóa nhân thời lượng. Có luật gộp hai giọng rất
//! giống nhau khi cả hai đã nói đủ lâu, mặc định tắt (`merge_theta`). Kết quả tất định với cùng chuỗi đoạn. Chốt nhãn muộn
//! (`late_relabel_ms`, xem `late`): đoạn đã gán được so lại với các tâm sau một thời gian, không đổi tâm.

use crate::embed::cosine;
pub use crate::late::LateChange;
use crate::late::LateQueue;

/// Ngưỡng của nhận giọng: định nghĩa ở `speaker-protocol` (app kiểm `speaker_config` của manifest bằng cùng `validate`).
pub use speaker_protocol::SpeakerConfig;

#[derive(Clone, Debug, PartialEq)]
pub struct Assignment {
    /// `None` khi chưa có giọng nào và đoạn quá ngắn để mở giọng; cũng `None` khi nhúng không dùng được (không hữu hạn hay
    /// chuẩn bằng 0) mà chưa có giọng nào.
    pub voice: Option<u32>,
    /// Cosine với giọng được chọn; 1 khi mở giọng mới; 0 khi lấy giọng của đoạn trước.
    pub confidence: f32,
    /// Các cặp (giọng bị gộp, giọng giữ lại) vừa gộp ở lần gọi này, theo thứ tự.
    pub merged: Vec<(u32, u32)>,
    /// Đoạn đã vào tâm của giọng được chọn (mở giọng, hay vào giọng với thời lượng ≥ `min_update_ms`): tách giọng (kế hoạch 04)
    /// trừ đúng các đoạn này khỏi tâm cũ.
    pub updated: bool,
}

struct Voice {
    id: u32,
    /// Tổng các nhúng đã chuẩn hóa, mỗi nhúng nhân thời lượng của đoạn; hướng của nó là tâm của giọng.
    sum: Vec<f32>,
    /// Tổng thời lượng tiếng nói đã vào `sum` (đoạn mở giọng và các đoạn ≥ `min_update_ms`); cộng bão hòa.
    speech_ms: u64,
}

/// Bộ phân cụm giọng cho một phiên; giữ các giọng đang sống và giọng của đoạn trước.
pub struct OnlineClusterer {
    cfg: SpeakerConfig,
    voices: Vec<Voice>,
    next_id: u32,
    prev: Option<u32>,
    late: LateQueue,
}

/// Thời lượng tiếng nói tối đa của một đoạn mà `assign` chấp nhận: đoạn thật ≤ 8 s; chặn để thời lượng vô lý không làm tràn
/// tổng nhúng f32 nhân thời lượng.
const MAX_SPEECH_MS: u64 = 60_000;

/// Chia nhúng cho chuẩn của nó; `None` khi chuẩn bằng 0 hay không hữu hạn (có NaN, vô cùng, hay bình phương tràn).
fn normalized(e: &[f32]) -> Option<Vec<f32>> {
    let norm = e.iter().map(|x| x * x).sum::<f32>().sqrt();
    (norm.is_finite() && norm > 0.0).then(|| e.iter().map(|x| x / norm).collect())
}

impl OnlineClusterer {
    pub fn new(cfg: SpeakerConfig) -> Self {
        Self {
            late: LateQueue::new(cfg.late_relabel_ms),
            cfg,
            voices: Vec::new(),
            next_id: 1,
            prev: None,
        }
    }

    /// Ngưỡng nhận giọng: `confidence` dưới ngưỡng này là đoán, không phải nhận ra.
    pub fn theta(&self) -> f32 {
        self.cfg.theta
    }

    pub fn voice_count(&self) -> usize {
        self.voices.len()
    }

    /// Mã các giọng đang sống, theo thứ tự mở (giọng bị gộp không còn).
    pub fn voice_ids(&self) -> Vec<u32> {
        self.voices.iter().map(|v| v.id).collect()
    }

    /// Gán một đoạn có `speech_ms` tiếng nói (chặn ở `MAX_SPEECH_MS`); `embedding` là `None` khi đoạn không được nhúng.
    ///
    /// Đoạn ngắn hơn `min_embed_ms`, nhúng `None` và nhúng không dùng được (không hữu hạn hay chuẩn bằng 0) đi cùng một đường:
    /// lấy giọng của đoạn trước, `confidence` 0, không đụng đến giọng nào (nhúng hỏng không được tạo giọng "chết" hút các đoạn
    /// sau).
    ///
    /// `SpeakerConfig::max_voices` tính theo số giọng đang sống: sau khi gộp có chỗ trống thì đoạn mới có thể mở giọng mới, và
    /// mã giọng (không bao giờ dùng lại) có thể lớn hơn `max_voices`.
    pub fn assign(&mut self, speech_ms: u64, embedding: Option<&[f32]>) -> Assignment {
        let speech_ms = speech_ms.min(MAX_SPEECH_MS);
        let Some(e) = embedding
            .filter(|_| speech_ms >= self.cfg.min_embed_ms)
            .and_then(normalized)
        else {
            return Assignment {
                voice: self.prev,
                confidence: 0.0,
                merged: Vec::new(),
                updated: false,
            };
        };
        let best = self
            .voices
            .iter()
            .enumerate()
            .map(|(i, v)| (i, cosine(&v.sum, &e)))
            // Bằng điểm thì giữ giọng đứng trước (tất định: giọng mở sớm hơn thắng). Đổi sang `max_by` sẽ lấy giọng CUỐI cùng
            // bằng điểm và đổi kết quả.
            .fold(None, |acc: Option<(usize, f32)>, x| match acc {
                Some(a) if a.1 >= x.1 => Some(a),
                _ => Some(x),
            });
        let (voice, confidence, updated) = match best {
            Some((i, sim)) if sim >= self.cfg.theta => {
                let updated = speech_ms >= self.cfg.min_update_ms;
                if updated {
                    let v = &mut self.voices[i];
                    for (s, x) in v.sum.iter_mut().zip(&e) {
                        *s += x * speech_ms as f32;
                    }
                    v.speech_ms = v.speech_ms.saturating_add(speech_ms);
                }
                (Some(self.voices[i].id), sim, updated)
            }
            _ if speech_ms >= self.cfg.min_new_ms && self.voices.len() < self.cfg.max_voices => {
                let id = self.next_id;
                self.next_id += 1;
                self.voices.push(Voice {
                    id,
                    sum: e.iter().map(|x| x * speech_ms as f32).collect(),
                    speech_ms,
                });
                (Some(id), 1.0, true)
            }
            Some((i, sim)) if speech_ms >= self.cfg.min_new_ms => (Some(self.voices[i].id), sim, false),
            _ => (self.prev, 0.0, false),
        };
        let merged = self.merge();
        for &(from, into) in &merged {
            self.late.merged(from, into);
        }
        let voice = voice.map(|v| {
            merged
                .iter()
                .fold(v, |v, &(from, into)| if v == from { into } else { v })
        });
        self.prev = voice;
        Assignment {
            voice,
            confidence,
            merged,
            updated,
        }
    }

    /// Nhớ đoạn vừa gán (`voice` là kết quả của `assign` ngay trước) để chốt nhãn muộn. Không nhớ gì khi chốt muộn tắt, đoạn
    /// không nhúng được (ngắn hơn `min_embed_ms`, nhúng hỏng) hay chưa có giọng (đoạn nhúng được mà chưa có giọng nào vẫn nhớ, để nhận giọng về sau). `duration_ms` và `mic` chỉ để trả lại trong
    /// `LateChange`.
    pub fn register(
        &mut self,
        segment_id: u64,
        end_ms: u64,
        duration_ms: u64,
        mic: bool,
        embedding: Option<&[f32]>,
        voice: Option<u32>,
    ) {
        if !self.late.enabled() || duration_ms.min(MAX_SPEECH_MS) < self.cfg.min_embed_ms {
            return;
        }
        if let Some(e) = embedding.and_then(normalized) {
            self.late.push(segment_id, end_ms, e, voice, duration_ms, mic);
        }
    }

    /// Các đoạn đã tới hạn chốt (thời gian âm thanh `now_ms` ≥ `end_ms` + `late_relabel_ms`) mà giọng gần nhất với tâm hiện có
    /// khác giọng đang gán; các đoạn này (và đoạn tới hạn không đổi) ra khỏi hàng đợi. Tâm không đổi.
    pub fn take_late(&mut self, now_ms: u64) -> Vec<LateChange> {
        let voices = &self.voices;
        self.late.take_due(now_ms, |e| {
            voices
                .iter()
                .map(|v| (v.id, cosine(&v.sum, e)))
                // Như `assign`: bằng điểm thì giọng mở sớm hơn thắng.
                .fold(None, |acc: Option<(u32, f32)>, x| match acc {
                    Some(a) if a.1 >= x.1 => Some(a),
                    _ => Some(x),
                })
                // Không đặt ngưỡng `theta` ở đây: đo (results/09-chot-nhan-muon.md, mục "Ngưỡng theta") cho thấy lọc theo `theta` làm
                // kém đi bộ cuộc gọi và Common Voice (−0,9 và −1,5 điểm) mà chỉ nhích AMI (+0,4).
                .map(|(id, _)| id)
        })
    }

    /// Đoạn `segment_id` đã sang giọng khác ngoài phân cụm (tách giọng theo tên): thôi chốt muộn cho đoạn đó.
    pub fn note_moved(&mut self, segment_id: u64) {
        self.late.forget(segment_id);
    }

    /// Tách giọng `from` (spec §5.3, kế hoạch 04): mở giọng mới từ `members` (thời lượng thật, nhúng, đoạn đã vào tâm của `from`
    /// chưa) và trừ khỏi tâm của `from` đúng các đoạn đã vào tâm. `None` (không đổi gì) khi đã đủ `max_voices`, `from` không còn,
    /// hay không nhúng nào dùng được. Mã giọng mới như giọng mở bình thường (tăng dần, không dùng lại).
    pub fn split(&mut self, from: u32, members: &[(u64, &[f32], bool)]) -> Option<u32> {
        if self.voices.len() >= self.cfg.max_voices {
            return None;
        }
        let i = self.voices.iter().position(|v| v.id == from)?;
        let dim = self.voices[i].sum.len();
        let usable: Vec<(u64, Vec<f32>, bool)> = members
            .iter()
            .filter_map(|&(ms, e, contributed)| {
                normalized(e)
                    .filter(|e| e.len() == dim)
                    .map(|e| (ms.min(MAX_SPEECH_MS), e, contributed))
            })
            .collect();
        if usable.is_empty() {
            return None;
        }
        let mut sum = vec![0.0f32; dim];
        let mut speech = 0u64;
        for (ms, e, contributed) in &usable {
            for (s, x) in sum.iter_mut().zip(e) {
                *s += x * *ms as f32;
            }
            speech = speech.saturating_add(*ms);
            if *contributed {
                let v = &mut self.voices[i];
                for (s, x) in v.sum.iter_mut().zip(e) {
                    *s -= x * *ms as f32;
                }
                v.speech_ms = v.speech_ms.saturating_sub(*ms);
            }
        }
        let id = self.next_id;
        self.next_id += 1;
        self.voices.push(Voice {
            id,
            sum,
            speech_ms: speech,
        });
        Some(id)
    }

    fn merge(&mut self) -> Vec<(u32, u32)> {
        let mut out = Vec::new();
        loop {
            let mut best: Option<(usize, usize, f32)> = None;
            for i in 0..self.voices.len() {
                for j in i + 1..self.voices.len() {
                    let (a, b) = (&self.voices[i], &self.voices[j]);
                    if a.speech_ms < self.cfg.merge_min_ms || b.speech_ms < self.cfg.merge_min_ms {
                        continue;
                    }
                    let s = cosine(&a.sum, &b.sum);
                    if s >= self.cfg.merge_theta && best.is_none_or(|(_, _, bs)| s > bs) {
                        best = Some((i, j, s));
                    }
                }
            }
            let Some((i, j, _)) = best else { break };
            let (keep, drop) = if self.voices[i].speech_ms >= self.voices[j].speech_ms {
                (i, j)
            } else {
                (j, i)
            };
            let dropped = self.voices.remove(drop);
            let keep = if drop < keep { keep - 1 } else { keep };
            for (s, x) in self.voices[keep].sum.iter_mut().zip(&dropped.sum) {
                *s += x;
            }
            self.voices[keep].speech_ms = self.voices[keep].speech_ms.saturating_add(dropped.speech_ms);
            out.push((dropped.id, self.voices[keep].id));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const A: [f32; 3] = [1.0, 0.0, 0.0];
    const B: [f32; 3] = [0.0, 1.0, 0.0];
    const NEAR_A: [f32; 3] = [0.95, 0.1, 0.0];

    fn run(cfg: SpeakerConfig, steps: &[(u64, Option<&[f32]>)]) -> Vec<Assignment> {
        let mut c = OnlineClusterer::new(cfg);
        steps.iter().map(|(ms, e)| c.assign(*ms, *e)).collect()
    }

    #[test]
    fn first_long_segment_opens_voice_1() {
        let a = run(SpeakerConfig::default(), &[(2000, Some(&A))]);
        assert_eq!(a[0].voice, Some(1));
    }

    #[test]
    fn similar_joins_and_different_long_opens_a_new_voice() {
        let a = run(
            SpeakerConfig::default(),
            &[(2000, Some(&A)), (2000, Some(&NEAR_A)), (2000, Some(&B))],
        );
        let voices: Vec<_> = a.iter().map(|x| x.voice).collect();
        assert_eq!(voices, [Some(1), Some(1), Some(2)]);
    }

    #[test]
    fn short_segment_takes_the_previous_voice_even_with_an_embedding() {
        let a = run(
            SpeakerConfig::default(),
            &[(2000, Some(&A)), (2000, Some(&B)), (300, None), (300, Some(&A))],
        );
        assert_eq!(a[2].voice, Some(2));
        assert_eq!(a[3].voice, Some(2));
        assert_eq!(a[3].confidence, 0.0);
    }

    #[test]
    fn mid_length_unlike_anyone_takes_the_previous_voice_and_opens_none() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        c.assign(2000, Some(&A));
        assert_eq!(c.assign(1000, Some(&B)).voice, Some(1));
        assert_eq!(c.voice_count(), 1);
    }

    #[test]
    fn mid_length_like_an_existing_voice_joins_it() {
        let a = run(
            SpeakerConfig::default(),
            &[(2000, Some(&A)), (2000, Some(&B)), (1000, Some(&A))],
        );
        assert_eq!(a[2].voice, Some(1));
    }

    #[test]
    fn nothing_yet_and_too_short_to_open_gives_none() {
        let a = run(SpeakerConfig::default(), &[(1000, Some(&A))]);
        assert_eq!(a[0].voice, None);
    }

    #[test]
    fn at_the_voice_limit_a_new_speaker_goes_to_the_nearest_voice() {
        let cfg = SpeakerConfig {
            max_voices: 2,
            ..SpeakerConfig::default()
        };
        let c2 = [0.3, 0.0, 0.954];
        let a = run(cfg, &[(2000, Some(&A)), (2000, Some(&B)), (2000, Some(&c2))]);
        assert_eq!(a[2].voice, Some(1));
    }

    #[test]
    fn similar_voices_merge_once_both_have_enough_speech() {
        let cfg = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        };
        let d = [0.8, 0.6, 0.0];
        let a = run(cfg, &[(4000, Some(&A)), (4000, Some(&d))]);
        assert_eq!(a[1].merged, vec![(2, 1)]);
        assert_eq!(a[1].voice, Some(1));
    }

    #[test]
    fn the_default_merge_threshold_never_merges() {
        // Như test trên (hai giọng cosine 0,8, đều đủ thời lượng) nhưng giữ ngưỡng gộp mặc định: gộp tắt.
        let cfg = SpeakerConfig {
            theta: 0.9,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        };
        let d = [0.8, 0.6, 0.0];
        let a = run(
            cfg,
            &[(4000, Some(&A)), (4000, Some(&d)), (4000, Some(&A)), (4000, Some(&d))],
        );
        assert!(a.iter().all(|x| x.merged.is_empty()));
        assert_eq!(a[3].voice, Some(2));
    }

    #[test]
    fn short_voices_do_not_merge() {
        let cfg = SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 10_000,
            ..SpeakerConfig::default()
        };
        let d = [0.8, 0.6, 0.0];
        let a = run(cfg, &[(4000, Some(&A)), (4000, Some(&d))]);
        assert!(a[1].merged.is_empty());
        assert_eq!(a[1].voice, Some(2));
    }

    #[test]
    fn same_input_gives_same_output() {
        let steps: Vec<(u64, Option<&[f32]>)> = vec![
            (2000, Some(&A)),
            (800, Some(&B)),
            (2500, Some(&B)),
            (300, None),
            (1600, Some(&NEAR_A)),
        ];
        assert_eq!(
            run(SpeakerConfig::default(), &steps),
            run(SpeakerConfig::default(), &steps)
        );
    }

    #[test]
    fn config_reads_partial_json_and_keeps_defaults() {
        let cfg: SpeakerConfig = serde_json::from_str(r#"{"theta": 0.45}"#).unwrap();
        assert_eq!(cfg.theta, 0.45);
        assert_eq!(cfg.max_voices, SpeakerConfig::default().max_voices);
    }

    /// Hai giọng giống nhau (cosine 0,8) và tách khỏi nhau khi vào (theta 0,9) nhưng gộp được (merge_theta 0,7) khi đủ 3 s.
    fn merge_cfg() -> SpeakerConfig {
        SpeakerConfig {
            theta: 0.9,
            merge_theta: 0.7,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        }
    }

    /// Cosine với `A` là 0,8.
    const D: [f32; 3] = [0.8, 0.6, 0.0];

    #[test]
    fn unusable_embeddings_are_treated_as_missing() {
        let unusable: [(&str, [f32; 3]); 6] = [
            ("NaN", [f32::NAN, 0.0, 0.0]),
            ("NaN in the middle", [1.0, f32::NAN, 0.0]),
            ("infinite", [f32::INFINITY, 0.0, 0.0]),
            ("norm overflowing to infinity", [3.0e30, 0.0, 0.0]),
            ("all zeros", [0.0, 0.0, 0.0]),
            ("norm underflowing to zero", [1.0e-30, 0.0, 0.0]),
        ];
        for (name, bad) in unusable {
            let mut c = OnlineClusterer::new(SpeakerConfig::default());
            assert_eq!(c.assign(2000, Some(&A)).voice, Some(1), "{name}");
            // Đi đường "không có nhúng": lấy giọng của đoạn trước, không đụng đến giọng nào.
            let r = c.assign(2000, Some(&bad));
            assert_eq!(r.voice, Some(1), "{name}");
            assert_eq!(r.confidence, 0.0, "{name}");
            assert!(r.merged.is_empty(), "{name}");
            assert_eq!(c.voice_count(), 1, "{name}");
            // Đoạn sau có nhúng tốt vẫn bình thường: mở giọng 2 (mã không bị nhúng hỏng tiêu mất) rồi vào đúng giọng.
            let r = c.assign(2000, Some(&B));
            assert_eq!((r.voice, r.confidence), (Some(2), 1.0), "{name}");
            assert_eq!(c.assign(2000, Some(&A)).voice, Some(1), "{name}");
            assert_eq!(c.voice_count(), 2, "{name}");
        }
    }

    #[test]
    fn unusable_embedding_before_any_voice_gives_none_and_opens_none() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        let r = c.assign(2000, Some(&[f32::NAN, 0.0, 0.0]));
        assert_eq!((r.voice, r.confidence), (None, 0.0));
        assert_eq!(c.voice_count(), 0);
        assert_eq!(c.assign(2000, Some(&A)).voice, Some(1));
    }

    #[test]
    fn unusable_embedding_does_not_take_the_last_voice_slot() {
        let cfg = SpeakerConfig {
            max_voices: 2,
            ..SpeakerConfig::default()
        };
        let mut c = OnlineClusterer::new(cfg);
        c.assign(2000, Some(&A));
        // Còn đúng một chỗ trống: nhúng hỏng không được chiếm chỗ bằng một giọng "chết" rồi hút các đoạn sau.
        assert_eq!(c.assign(2000, Some(&[f32::NAN, 0.0, 0.0])).voice, Some(1));
        let r = c.assign(2000, Some(&B));
        assert_eq!((r.voice, r.confidence), (Some(2), 1.0));
        assert_eq!(c.assign(2000, Some(&A)).voice, Some(1));
        assert_eq!(c.assign(2000, Some(&B)).voice, Some(2));
        assert_eq!(c.voice_count(), 2);
    }

    #[test]
    fn unusable_embedding_at_the_voice_limit_changes_nothing() {
        let cfg = SpeakerConfig {
            max_voices: 2,
            ..SpeakerConfig::default()
        };
        let mut c = OnlineClusterer::new(cfg);
        c.assign(2000, Some(&A));
        c.assign(2000, Some(&B));
        assert_eq!(c.assign(2000, Some(&A)).voice, Some(1));
        let r = c.assign(2000, Some(&[f32::NAN, 0.0, 0.0]));
        assert_eq!((r.voice, r.confidence), (Some(1), 0.0));
        assert_eq!(c.assign(2000, Some(&B)).voice, Some(2));
        assert_eq!(c.assign(2000, Some(&A)).voice, Some(1));
        assert_eq!(c.voice_count(), 2);
    }

    #[test]
    fn segments_shorter_than_min_update_ms_do_not_add_to_voice_speech() {
        // Giọng 1 mở với 1500 ms; năm đoạn 700 ms (< min_update_ms = 1000) vào giọng 1. Nếu bị cộng thì giọng 1 có 5000 ms,
        // thực tế vẫn 1500 ms; merge_min_ms = 3000 nằm giữa hai số đó. Giọng 2 (4000 ms, cosine 0,8 với giọng 1) xuất hiện
        // thì giọng 1 chưa đủ điều kiện gộp.
        let mut c = OnlineClusterer::new(merge_cfg());
        c.assign(1500, Some(&A));
        for _ in 0..5 {
            assert_eq!(c.assign(700, Some(&A)).voice, Some(1));
        }
        let r = c.assign(4000, Some(&D));
        assert!(r.merged.is_empty());
        assert_eq!(r.voice, Some(2));
        assert_eq!(c.voice_count(), 2);
    }

    #[test]
    fn segments_from_min_update_ms_add_to_voice_speech() {
        // Như trên nhưng hai đoạn 1000 ms (đúng min_update_ms): giọng 1 có 1500 + 2 × 1000 = 3500 ms ≥ merge_min_ms, nên khi
        // giọng 2 (4000 ms) xuất hiện thì hai giọng gộp; giọng 1 ít thời lượng hơn nên gộp vào giọng 2.
        let mut c = OnlineClusterer::new(merge_cfg());
        c.assign(1500, Some(&A));
        c.assign(1000, Some(&A));
        c.assign(1000, Some(&A));
        let r = c.assign(4000, Some(&D));
        assert_eq!(r.merged, vec![(1, 2)]);
        assert_eq!(r.voice, Some(2));
        assert_eq!(c.voice_count(), 1);
    }

    /// Gộp dây chuyền, tính tay. Các vector nằm trong mặt phẳng (x, y), chiều thứ ba bằng 0:
    /// A = (1, 0), B = (0,8; 0,6), C = (0, 1), nên cosine(A, B) = 0,8, cosine(B, C) = 0,6, cosine(A, C) = 0.
    /// Cấu hình: theta = 0,85 (ba giọng mở riêng), merge_theta = 0,5, merge_min_ms = 3000.
    /// 1. (3000 ms, A) mở giọng 1; đủ 3000 ms.
    /// 2. (2000 ms, B) mở giọng 2; chưa đủ 3000 ms nên chưa được gộp.
    /// 3. (40 000 ms, C) mở giọng 3; cặp (1, 3) có cosine 0 < 0,5, giọng 2 còn thiếu thời lượng nên không gộp.
    /// 4. (28 000 ms, B) vào giọng 2 (cosine 1 so với 0,8 và 0,6); giọng 2 có 30 000 ms, cả ba giọng đều đủ điều kiện:
    ///    - Vòng 1: cặp giống nhất là (1, 2) với 0,8 (cặp (2, 3) chỉ 0,6, cặp (1, 3) là 0 < 0,5). Giọng 1 (3000 ms) ít hơn
    ///      giọng 2 (30 000 ms) nên 1 gộp vào 2: tâm mới = 30 000·(0,8; 0,6) + 3000·(1; 0) = (27 000; 18 000), 33 000 ms.
    ///    - Vòng 2: cosine giữa tâm đó và C = 18 000 / √(27 000² + 18 000²) = 2 / √13 ≈ 0,555 ≥ 0,5. Giọng 2 (33 000 ms) ít
    ///      hơn giọng 3 (40 000 ms) nên 2 gộp vào 3.
    ///    - Còn một giọng nên dừng.
    ///
    /// Mã giọng của chính đoạn này (2) được đổi theo thành 3.
    #[test]
    fn merges_chain_a_into_b_then_b_into_c() {
        let cfg = SpeakerConfig {
            theta: 0.85,
            merge_theta: 0.5,
            merge_min_ms: 3000,
            ..SpeakerConfig::default()
        };
        let (a, b, c3) = ([1.0, 0.0, 0.0], [0.8, 0.6, 0.0], [0.0, 1.0, 0.0]);
        let mut c = OnlineClusterer::new(cfg);
        for (ms, e, voice) in [(3000, a, 1), (2000, b, 2), (40_000, c3, 3)] {
            let r = c.assign(ms, Some(&e));
            assert_eq!((r.voice, r.confidence), (Some(voice), 1.0));
            assert!(r.merged.is_empty());
        }
        assert_eq!(c.voice_count(), 3);
        let r = c.assign(28_000, Some(&b));
        assert_eq!(r.merged, vec![(1, 2), (2, 3)]);
        assert_eq!(r.voice, Some(3));
        assert_eq!(c.voice_count(), 1);
        assert_eq!(c.assign(2000, Some(&c3)).voice, Some(3));
    }

    #[test]
    fn after_a_merge_a_new_voice_may_open_with_an_id_above_max_voices() {
        // `max_voices` tính theo số giọng đang sống; mã giọng không bao giờ dùng lại nên có thể vượt max_voices.
        let cfg = SpeakerConfig {
            max_voices: 2,
            ..merge_cfg()
        };
        let mut c = OnlineClusterer::new(cfg);
        c.assign(4000, Some(&A));
        let r = c.assign(4000, Some(&D));
        assert_eq!(r.merged, vec![(2, 1)]);
        assert_eq!(c.voice_count(), 1);
        let r = c.assign(2000, Some(&B));
        assert_eq!((r.voice, r.confidence), (Some(3), 1.0));
        assert_eq!(c.voice_count(), 2);
    }

    #[test]
    fn absurd_durations_are_clamped() {
        // Thời lượng vô lý bị chặn ở MAX_SPEECH_MS. Nếu không chặn, tổng nhúng f32 nhân thời lượng tràn (ở đây sau hai lần
        // cộng: 2^64 bình phương không vừa f32), cosine với giọng 1 thành 0 và đoạn thứ ba mở giọng mới.
        let huge = u64::MAX / 2;
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        for lan in 1..=3 {
            assert_eq!(c.assign(huge, Some(&A)).voice, Some(1), "lần gọi thứ {lan}");
        }
        assert_eq!(c.voice_count(), 1);
        // Hai giọng khác nhau với thời lượng khổng lồ vẫn gộp bình thường.
        let mut c = OnlineClusterer::new(merge_cfg());
        c.assign(huge, Some(&A));
        let r = c.assign(huge, Some(&D));
        assert_eq!(r.merged.len(), 1);
        assert_eq!(c.voice_count(), 1);
    }

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

    /// Kế hoạch 04 (spec §5.3): tách các đoạn D khỏi giọng 1 (A và D, cosine 0,8, cùng vào giọng 1 ở θ 0,35): đoạn D mới vào giọng
    /// mới, đoạn A ở lại giọng 1.
    #[test]
    fn split_moves_members_out_of_the_old_centroid_into_a_new_voice() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        for e in [&A, &D, &A, &D] {
            let r = c.assign(2_000, Some(e));
            assert_eq!((r.voice, r.updated), (Some(1), true));
        }
        assert_eq!(c.split(1, &[(2_000, &D, true), (2_000, &D, true)]), Some(2));
        assert_eq!(c.voice_ids(), [1, 2]);
        assert_eq!(c.assign(2_000, Some(&D)).voice, Some(2));
        assert_eq!(c.assign(2_000, Some(&A)).voice, Some(1));
    }

    #[test]
    fn split_respects_the_voice_limit_and_needs_usable_embeddings() {
        let cfg = SpeakerConfig {
            max_voices: 1,
            ..SpeakerConfig::default()
        };
        let mut c = OnlineClusterer::new(cfg);
        c.assign(2_000, Some(&A));
        assert_eq!(c.split(1, &[(2_000, &D, true)]), None, "đã đủ giọng");
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        c.assign(2_000, Some(&A));
        assert_eq!(
            c.split(1, &[(2_000, &[f32::NAN, 0.0, 0.0], true)]),
            None,
            "không nhúng nào dùng được"
        );
        assert_eq!(c.split(9, &[(2_000, &D, true)]), None, "giọng không có");
        assert_eq!(c.voice_count(), 1);
    }

    #[test]
    fn only_segments_that_reach_the_centroid_say_so() {
        let mut c = OnlineClusterer::new(SpeakerConfig::default());
        assert!(c.assign(2_000, Some(&A)).updated, "mở giọng");
        assert!(!c.assign(800, Some(&A)).updated, "dưới min_update_ms");
        assert!(!c.assign(300, None).updated, "không nhúng");
    }

    /// Cấu hình có chốt muộn 30 s (mặc định) cho các test chốt muộn.
    fn late_cfg() -> SpeakerConfig {
        SpeakerConfig::default()
    }

    /// Gán và đăng ký một đoạn như `Worker::segment_with`; trả giọng đã gán.
    fn feed(c: &mut OnlineClusterer, id: u64, end_ms: u64, ms: u64, e: &[f32]) -> Option<u32> {
        let a = c.assign(ms, Some(e));
        c.register(id, end_ms, ms, false, Some(e), a.voice);
        a.voice
    }

    /// Đoạn 2 (B, 1000 ms, ngắn hơn min_new_ms) không giống ai nên lấy giọng của đoạn trước (1, sai); sau đó B mở giọng 2.
    fn early_mistake(c: &mut OnlineClusterer) {
        assert_eq!(feed(c, 1, 2_000, 2_000, &A), Some(1));
        assert_eq!(feed(c, 2, 3_000, 1_000, &B), Some(1));
        assert_eq!(feed(c, 3, 5_000, 2_000, &B), Some(2));
    }

    #[test]
    fn late_relabel_moves_an_early_mistake_to_the_nearest_voice_only_when_due() {
        let mut c = OnlineClusterer::new(late_cfg());
        early_mistake(&mut c);
        assert!(c.take_late(32_999).is_empty(), "đoạn 2 chưa tới hạn (3000 + 30 000)");
        let ch = c.take_late(33_000);
        assert_eq!(
            ch,
            vec![LateChange {
                segment_id: 2,
                from: Some(1),
                to: 2,
                duration_ms: 1_000,
                mic: false
            }]
        );
        assert!(
            c.take_late(1_000_000).is_empty(),
            "đoạn 1 và 3 tới hạn nhưng giọng không đổi; không báo lại"
        );
    }

    #[test]
    fn late_relabel_does_not_touch_the_centres() {
        let mut c = OnlineClusterer::new(late_cfg());
        early_mistake(&mut c);
        let before = c.voice_ids();
        c.take_late(1_000_000);
        assert_eq!(c.voice_ids(), before);
        // Tâm không đổi: đoạn kế tiếp giống A vẫn vào giọng 1 với cosine 1.
        let a = c.assign(2_000, Some(&A));
        assert_eq!((a.voice, a.confidence), (Some(1), 1.0));
    }

    #[test]
    fn late_relabel_off_registers_nothing() {
        let mut c = OnlineClusterer::new(SpeakerConfig {
            late_relabel_ms: 0,
            ..SpeakerConfig::default()
        });
        early_mistake(&mut c);
        assert_eq!(c.late.len(), 0);
        assert!(c.take_late(u64::MAX).is_empty());
    }

    #[test]
    fn late_relabel_gives_a_voice_to_an_early_segment_that_had_none() {
        let mut c = OnlineClusterer::new(late_cfg());
        // Đoạn 1 (1000 ms, nhúng được) tới trước mọi giọng: chưa có nhãn. Đoạn 2 mở giọng 1.
        assert_eq!(feed(&mut c, 1, 1_000, 1_000, &A), None);
        assert_eq!(feed(&mut c, 2, 3_000, 2_000, &A), Some(1));
        let ch = c.take_late(31_000);
        assert_eq!(
            ch.iter().map(|x| (x.segment_id, x.from, x.to)).collect::<Vec<_>>(),
            [(1, None, 1)]
        );
    }

    #[test]
    fn late_relabel_skips_segments_without_a_usable_embedding() {
        let mut c = OnlineClusterer::new(late_cfg());
        assert_eq!(feed(&mut c, 1, 2_000, 2_000, &A), Some(1));
        for (id, ms, e) in [
            (2, 300, Some(&B[..])),
            (3, 2_000, Some(&[f32::NAN, 0.0, 0.0][..])),
            (4, 2_000, None),
        ] {
            let a = c.assign(ms, e);
            c.register(id, 10_000, ms, false, e, a.voice);
        }
        assert_eq!(c.late.len(), 1, "chỉ đoạn 1");
    }

    #[test]
    fn late_relabel_follows_a_merge() {
        // Giọng 1 (A, 3000 ms) gộp vào giọng 2 (D, 4000 ms): đoạn 1 phải được tính là của giọng 2, nên không có gì để đổi.
        let mut c = OnlineClusterer::new(merge_cfg());
        assert_eq!(feed(&mut c, 1, 3_000, 3_000, &A), Some(1));
        let a = c.assign(4_000, Some(&D));
        assert_eq!(a.merged, vec![(1, 2)]);
        c.register(2, 7_000, 4_000, false, Some(&D), a.voice);
        assert!(c.take_late(1_000_000).is_empty());
    }

    #[test]
    fn late_relabel_leaves_a_split_segment_alone() {
        let mut c = OnlineClusterer::new(late_cfg());
        for (id, e) in [(1, &A), (2, &D), (3, &A), (4, &D)] {
            assert_eq!(feed(&mut c, id, id * 2_000, 2_000, e), Some(1));
        }
        let new = c.split(1, &[(2_000, &D, true), (2_000, &D, true)]).unwrap();
        // Nếu session không báo đã tách (`note_moved`), đoạn D còn mang giọng cũ trong hàng đợi và giọng gần nhất giờ là giọng mới:
        // chúng bị báo đổi lần hai (và thời gian nói bị tính hai lần). `c` là bản không báo, `with` là bản có báo.
        let mut with = OnlineClusterer::new(late_cfg());
        for (id, e) in [(1, &A), (2, &D), (3, &A), (4, &D)] {
            feed(&mut with, id, id * 2_000, 2_000, e);
        }
        with.split(1, &[(2_000, &D, true), (2_000, &D, true)]).unwrap();
        with.note_moved(2);
        with.note_moved(4);
        assert_eq!(
            with.take_late(1_000_000),
            vec![],
            "đoạn đã tách không bị chốt muộn đụng tới"
        );
        let without = c.take_late(1_000_000);
        assert_eq!(
            without.iter().map(|x| (x.segment_id, x.from, x.to)).collect::<Vec<_>>(),
            [(2, Some(1), new), (4, Some(1), new)]
        );
    }

    #[test]
    fn late_queue_is_bounded() {
        let mut c = OnlineClusterer::new(late_cfg());
        for id in 0..(crate::late::MAX_PENDING as u64 + 100) {
            feed(&mut c, id, 2_000 + id, 2_000, &A);
        }
        assert_eq!(c.late.len(), crate::late::MAX_PENDING);
    }

    #[test]
    fn late_relabel_changes_at_most_a_bounded_batch_per_call() {
        let mut c = OnlineClusterer::new(late_cfg());
        assert_eq!(feed(&mut c, 1, 2_000, 2_000, &A), Some(1));
        assert_eq!(feed(&mut c, 2, 5_000, 2_000, &B), Some(2));
        // 100 đoạn B đang mang nhãn giọng 1 (sai): đều tới hạn cùng lúc.
        let b = normalized(&B).unwrap();
        for id in 10..110u64 {
            c.late.push(id, 6_000, b.clone(), Some(1), 1_000, false);
        }
        let cap = crate::late::MAX_CHANGES_PER_CALL;
        let mut sizes = Vec::new();
        loop {
            let batch = c.take_late(1_000_000);
            if batch.is_empty() {
                break;
            }
            assert!(batch.iter().all(|x| x.to == 2 && x.from == Some(1)));
            sizes.push(batch.len());
        }
        assert_eq!(sizes, [cap, cap, cap, 100 - 3 * cap]);
        assert_eq!(c.late.len(), 0);
    }

    #[test]
    fn late_relabel_is_deterministic() {
        let run = || {
            let mut c = OnlineClusterer::new(late_cfg());
            early_mistake(&mut c);
            let mut all = Vec::new();
            for t in [10_000, 33_000, 40_000, 90_000] {
                all.push(c.take_late(t));
            }
            all
        };
        assert_eq!(run(), run());
    }
}
