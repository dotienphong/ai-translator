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
    /// Đoạn `segment_id` sẽ không bao giờ có nhãn: client bỏ nó (tới trước `Ready`, lúc worker chạy lại, kênh tới worker đầy),
    /// worker chết khi nó còn chờ, hay worker báo lỗi cho nó (N1 của rà soát cuối kế hoạch 02).
    Unlabeled {
        segment_id: u64,
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
        // `match` chứ không `t as usize`: giao thức thêm biến thể `Source` thì đây là lỗi biên dịch, không phải panic vượt mảng
        // trên luồng VAD (N5 của rà soát).
        let i = match t {
            Source::System => 0,
            Source::Mic => 1,
            Source::Mixed => 2,
        };
        count[i] += 1;
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

    /// Đưa đoạn cho client bằng `try_send`: đầy thì bỏ; client đã tắt thì thôi hẳn. Không bao giờ chờ. Trả `false` khi đoạn
    /// không tới client (nên không bao giờ có nhãn; luồng VAD báo luồng phụ đề, N1 của rà soát cuối kế hoạch 02).
    pub fn send(&mut self, audio: SegmentAudio) -> bool {
        self.offered_end_ms.fetch_max(audio.end_ms, Ordering::SeqCst);
        match self.tx.try_send(audio) {
            Ok(()) => {
                self.sent += 1;
                true
            }
            Err(TrySendError::Full(_)) => {
                self.dropped += 1;
                false
            }
            Err(TrySendError::Disconnected(_)) => {
                self.closed = true;
                false
            }
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
            assert_eq!(tap.send(audio), id < SEGMENT_CHANNEL_CAP as u64);
            // `try_send` mất cỡ micro giây; 5 ms bắt cả một lần chờ ngắn (`send_timeout`) khi kênh đầy.
            assert!(t0.elapsed() < std::time::Duration::from_millis(5), "{:?}", t0.elapsed());
        }
        assert_eq!(
            (tap.sent(), tap.dropped()),
            (SEGMENT_CHANNEL_CAP as u64, 10 - SEGMENT_CHANNEL_CAP as u64)
        );
        assert_eq!(
            link.offered_end_ms.load(Ordering::SeqCst),
            9 * 2_000 + 1_000,
            "đoạn bị bỏ vẫn tính là đã đưa"
        );
        assert_eq!(ends.segments.try_iter().count(), SEGMENT_CHANNEL_CAP);
    }

    /// Client đã tắt (thả đầu kia): luồng VAD thôi chép âm thanh.
    #[test]
    fn a_closed_channel_stops_the_tap() {
        let (link, ends) = SpeakerLink::pair();
        let mut tap = SpeakerTap::new(link.segments, link.offered_end_ms);
        drop(ends);
        assert!(!tap.send(tap.prepare(SpeakerTap::copy_speech(&segment(0, 0, 1_000, 0)))));
        assert!(tap.is_closed());
    }
}
