//! Hai hàng đợi chống nghẽn của §7, ở dạng luật thuần (không luồng, không khóa), để test từng trường hợp.
//!
//! - [`AsrQueue`], VAD → nhận dạng: tối đa 3 đoạn chờ; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ
//!   bỏ đoạn (`dropped`) khi độ trễ vượt 20 giây. Đoạn gộp có `speech_ms` bằng tổng của các đoạn con, không tính khoảng
//!   nghỉ ở giữa (§6.3, hạn mức §6.8).
//! - [`MtQueue`], câu chờ dịch: tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ thành một request (phụ đề cũng gộp
//!   thành một, lấy `start_ms` của câu đầu và `end_ms` của câu cuối); câu chờ quá 20 giây thì bỏ bước dịch (`skipped`).
//!
//! "Hiện tại" là giờ âm thanh của phiên (ms), cùng gốc với `start_ms` và `end_ms`.

use crate::config::QueueConfig;
use crate::sentence::joiner;
use asr_protocol::SAMPLE_RATE;
use std::collections::VecDeque;

/// Một đoạn chờ nhận dạng. Đoạn gộp mang id của mọi đoạn đã gộp, theo thứ tự.
#[derive(Clone, PartialEq)]
pub struct PendingSegment {
    pub ids: Vec<u64>,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Độ dài tiếng nói, không gồm đệm; đoạn gộp là tổng của các đoạn con (`Segment::speech_ms`).
    pub speech_ms: u64,
    /// Xác suất VAD trung bình và tỉ lệ khung tiếng nói (`Segment::mean_prob`, `Segment::speech_ratio`); đoạn gộp lấy
    /// trung bình theo `speech_ms`. Luật câu đệm (`filter`) dùng `mean_prob`.
    pub mean_prob: f32,
    pub speech_ratio: f32,
    pub samples: Vec<f32>,
}

impl From<crate::segmenter::Segment> for PendingSegment {
    fn from(s: crate::segmenter::Segment) -> Self {
        Self {
            ids: vec![s.id],
            start_ms: s.start_ms,
            end_ms: s.end_ms,
            speech_ms: s.speech_ms,
            mean_prob: s.mean_prob,
            speech_ratio: s.speech_ratio,
            samples: s.samples,
        }
    }
}

impl PendingSegment {
    /// Gộp `next` vào sau đoạn này: thời gian từ đầu đoạn này tới cuối `next`, `speech_ms` cộng lại.
    fn absorb(&mut self, next: PendingSegment) {
        let total = (self.speech_ms + next.speech_ms).max(1) as f32;
        let weigh = |a: f32, wa: u64, b: f32, wb: u64| (a * wa as f32 + b * wb as f32) / total;
        self.mean_prob = weigh(self.mean_prob, self.speech_ms, next.mean_prob, next.speech_ms);
        self.speech_ratio = weigh(self.speech_ratio, self.speech_ms, next.speech_ratio, next.speech_ms);
        self.ids.extend(next.ids);
        self.end_ms = next.end_ms;
        self.speech_ms += next.speech_ms;
        self.samples.extend(next.samples);
    }
}

// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for PendingSegment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PendingSegment")
            .field("ids", &self.ids)
            .field("start_ms", &self.start_ms)
            .field("end_ms", &self.end_ms)
            .field("speech_ms", &self.speech_ms)
            .field("mean_prob", &self.mean_prob)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

#[derive(Debug, PartialEq)]
pub enum Popped {
    Segment(PendingSegment),
    /// Trễ quá `asr_drop_after_ms`: bỏ, không nhận dạng.
    Dropped(PendingSegment),
}

#[derive(Debug)]
pub struct AsrQueue {
    items: VecDeque<PendingSegment>,
    cfg: QueueConfig,
}

impl AsrQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
        }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Mốc `end_ms` của đoạn chờ lâu nhất, để tính độ trễ.
    pub fn oldest_end_ms(&self) -> Option<u64> {
        self.items.front().map(|s| s.end_ms)
    }

    /// Thêm một đoạn. Hàng đợi đã đủ `asr_max_waiting` đoạn thì trước đó gộp hai đoạn chờ lâu nhất, nếu tổng âm thanh
    /// (gồm đệm) không quá `asr_merge_max_ms`. Không gộp được thì vẫn thêm: chỉ độ trễ mới làm bỏ đoạn.
    pub fn push(&mut self, segment: PendingSegment) {
        if self.items.len() >= self.cfg.asr_max_waiting && self.items.len() >= 2 {
            let max_samples = self.cfg.asr_merge_max_ms as usize * SAMPLE_RATE as usize / 1000;
            if self.items[0].samples.len() + self.items[1].samples.len() <= max_samples {
                let second = self.items.remove(1).expect("có ít nhất hai đoạn");
                self.items[0].absorb(second);
            }
        }
        self.items.push_back(segment);
    }

    /// Lấy đoạn kế tiếp. Đoạn đã trễ quá `asr_drop_after_ms` (tính từ `end_ms`) thì trả `Dropped`.
    pub fn pop(&mut self, now_ms: u64) -> Option<Popped> {
        let segment = self.items.pop_front()?;
        Some(if now_ms.saturating_sub(segment.end_ms) > self.cfg.asr_drop_after_ms {
            Popped::Dropped(segment)
        } else {
            Popped::Segment(segment)
        })
    }
}

/// Một câu chờ dịch.
#[derive(Clone, Debug, PartialEq)]
pub struct MtItem {
    /// Id của phụ đề (id đoạn đầu của câu, cộng `id_base`).
    pub sub_id: u64,
    /// Tăng mỗi khi chữ của câu đổi (ghép thêm đoạn, gộp câu): bản dịch của phiên bản cũ bị bỏ.
    pub version: u32,
    pub lang: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    /// Độ dài tiếng nói của câu, không gồm đệm; câu gộp là tổng của các câu con.
    pub speech_ms: u64,
    /// Câu gốc trước đó cùng ngôn ngữ, chụp lúc câu được mở (cờ `experimental.translationContext`, §6.5). Câu gộp giữ
    /// ngữ cảnh của câu đầu.
    pub context: Option<String>,
    /// Lúc câu vào hàng đợi (giờ âm thanh). Câu gộp lấy mốc của câu vào sớm nhất.
    pub enqueued_ms: u64,
    /// Câu đang mở (còn có thể ghép thêm đoạn, §6.3): chưa được gộp với câu khác.
    pub open: bool,
    pub replaces: Vec<u64>,
}

#[derive(Debug, PartialEq)]
pub enum Ready {
    Translate(MtItem),
    /// Chờ quá `mt_skip_after_ms`: chỉ hiện câu gốc.
    Skip(MtItem),
}

#[derive(Debug)]
pub struct MtQueue {
    items: VecDeque<MtItem>,
    cfg: QueueConfig,
}

impl MtQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
        }
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn iter(&self) -> impl Iterator<Item = &MtItem> {
        self.items.iter()
    }

    /// Thêm một câu. Đầy (`mt_max_waiting`) thì trước đó gộp mọi dãy câu liên tiếp cùng ngôn ngữ đã chốt. Trả các câu vừa
    /// được gộp (đã có `replaces` và `version` mới), để phụ đề của chúng được gửi lại.
    pub fn push(&mut self, item: MtItem) -> Vec<MtItem> {
        let merged = if self.items.len() >= self.cfg.mt_max_waiting {
            self.merge_runs()
        } else {
            Vec::new()
        };
        self.items.push_back(item);
        merged
    }

    /// Đưa lại lên đầu hàng một câu đang dịch dở mà vừa được ghép thêm đoạn (bản dịch cũ đã bị hủy).
    pub fn push_front(&mut self, item: MtItem) {
        self.items.push_front(item);
    }

    /// Câu đang chờ vừa được ghép thêm đoạn: cập nhật chữ, mốc cuối, tiếng nói và phiên bản. Trả `false` nếu câu không
    /// còn trong hàng.
    pub fn update(&mut self, sub_id: u64, text: &str, end_ms: u64, speech_ms: u64, version: u32) -> bool {
        match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            Some(item) => {
                item.text = text.to_string();
                item.end_ms = end_ms;
                item.speech_ms = speech_ms;
                item.version = version;
                true
            }
            None => false,
        }
    }

    /// Câu đã chốt: từ giờ được gộp với câu khác.
    pub fn close(&mut self, sub_id: u64) {
        if let Some(item) = self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            item.open = false;
        }
    }

    /// Lấy câu kế tiếp để dịch; câu đã chờ quá `mt_skip_after_ms` thì trả `Skip`.
    pub fn pop(&mut self, now_ms: u64) -> Option<Ready> {
        let item = self.items.pop_front()?;
        Some(if now_ms.saturating_sub(item.enqueued_ms) > self.cfg.mt_skip_after_ms {
            Ready::Skip(item)
        } else {
            Ready::Translate(item)
        })
    }

    fn merge_runs(&mut self) -> Vec<MtItem> {
        let mut out: VecDeque<MtItem> = VecDeque::new();
        let mut merged_ids = Vec::new();
        for item in self.items.drain(..) {
            match out.back_mut() {
                Some(last) if !last.open && !item.open && last.lang == item.lang => {
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
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: usize = SAMPLE_RATE as usize;

    fn seg(id: u64, start_ms: u64, end_ms: u64, seconds: usize) -> PendingSegment {
        PendingSegment {
            ids: vec![id],
            start_ms,
            end_ms,
            speech_ms: end_ms - start_ms,
            mean_prob: 0.9,
            speech_ratio: 1.0,
            samples: vec![0.0; seconds * SECOND],
        }
    }

    fn ids(q: &mut AsrQueue) -> Vec<Vec<u64>> {
        let mut out = Vec::new();
        while let Some(Popped::Segment(s)) = q.pop(0) {
            out.push(s.ids);
        }
        out
    }

    #[test]
    fn up_to_three_segments_wait_without_merging() {
        let mut q = AsrQueue::new(QueueConfig::default());
        for i in 0..3 {
            q.push(seg(i, i * 5_000, i * 5_000 + 3_000, 3));
        }
        assert_eq!(ids(&mut q), [vec![0], vec![1], vec![2]]);
    }

    #[test]
    fn a_full_queue_merges_the_two_oldest_segments() {
        let mut q = AsrQueue::new(QueueConfig::default());
        for i in 0..4 {
            q.push(seg(i, i * 5_000, i * 5_000 + 3_000, 3));
        }
        let first = match q.pop(0).unwrap() {
            Popped::Segment(s) => s,
            other => panic!("{other:?}"),
        };
        assert_eq!((first.ids, first.start_ms, first.end_ms), (vec![0, 1], 0, 8_000));
        assert_eq!(first.samples.len(), 6 * SECOND);
        // 3 giây tiếng nói mỗi đoạn; khoảng nghỉ 2 giây ở giữa (3 000–5 000 ms) không tính (§6.3, §6.8).
        assert_eq!(first.speech_ms, 6_000);
        assert_eq!(ids(&mut q), [vec![2], vec![3]]);
    }

    #[test]
    fn segments_longer_than_12_seconds_together_are_not_merged() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(seg(0, 0, 7_000, 7));
        q.push(seg(1, 8_000, 14_000, 6));
        q.push(seg(2, 15_000, 16_000, 1));
        q.push(seg(3, 17_000, 18_000, 1)); // 7 + 6 = 13 giây > 12: không gộp, hàng dài 4
        assert_eq!(q.len(), 4);
        assert_eq!(ids(&mut q), [vec![0], vec![1], vec![2], vec![3]]);
    }

    #[test]
    fn only_segments_later_than_20_seconds_are_dropped() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(seg(0, 0, 3_000, 3));
        q.push(seg(1, 4_000, 6_000, 2));
        assert_eq!(q.oldest_end_ms(), Some(3_000));
        assert!(matches!(q.pop(23_001), Some(Popped::Dropped(s)) if s.ids == [0]));
        assert!(
            matches!(q.pop(23_001), Some(Popped::Segment(s)) if s.ids == [1]),
            "trễ 17 giây: vẫn nhận dạng"
        );
        assert!(q.pop(0).is_none());
    }

    fn item(sub_id: u64, lang: &str, text: &str, enqueued_ms: u64) -> MtItem {
        MtItem {
            sub_id,
            version: 1,
            lang: lang.into(),
            text: text.into(),
            start_ms: sub_id * 1_000,
            end_ms: sub_id * 1_000 + 800,
            speech_ms: 800,
            context: Some(format!("trước {sub_id}")),
            enqueued_ms,
            open: false,
            replaces: Vec::new(),
        }
    }

    #[test]
    fn a_full_translation_queue_merges_consecutive_sentences_of_the_same_language() {
        let mut q = MtQueue::new(QueueConfig::default());
        assert!(q.push(item(1, "en", "One.", 0)).is_empty());
        assert!(q.push(item(2, "en", "Two.", 100)).is_empty());
        assert!(q.push(item(3, "ja", "三。", 200)).is_empty());
        let merged = q.push(item(4, "ja", "四。", 300));
        assert_eq!(merged.len(), 1);
        let m = &merged[0];
        assert_eq!(
            (m.sub_id, m.text.as_str(), m.start_ms, m.end_ms),
            (1, "One. Two.", 1_000, 2_800)
        );
        assert_eq!((m.replaces.clone(), m.version, m.enqueued_ms), (vec![2], 2, 0));
        // Câu gộp: tiếng nói cộng lại, giữ ngữ cảnh của câu đầu.
        assert_eq!((m.speech_ms, m.context.as_deref()), (1_600, Some("trước 1")));
        let order: Vec<u64> = q.iter().map(|i| i.sub_id).collect();
        assert_eq!(order, [1, 3, 4]);
    }

    #[test]
    fn japanese_and_chinese_sentences_are_joined_without_a_space() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "ja", "一。", 0));
        q.push(item(2, "ja", "二。", 0));
        q.push(item(3, "ja", "三。", 0));
        let merged = q.push(item(4, "en", "Four.", 0));
        assert_eq!(merged[0].text, "一。二。三。");
        assert_eq!(merged[0].replaces, [2, 3]);
    }

    #[test]
    fn the_open_sentence_is_never_merged() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 0));
        q.push(item(2, "en", "Two.", 0));
        q.push(MtItem {
            open: true,
            ..item(3, "en", "and three", 0)
        });
        let merged = q.push(item(4, "en", "Four.", 0));
        assert_eq!(merged[0].replaces, [2]);
        assert_eq!(q.iter().map(|i| i.sub_id).collect::<Vec<_>>(), [1, 3, 4]);
        assert!(q.update(3, "and three more", 3_900, 1_700, 2));
        q.close(3);
        let merged = q.push(item(5, "en", "Five.", 0));
        assert_eq!(merged[0].text, "One. Two. and three more Four.");
        assert_eq!(merged[0].speech_ms, 800 + 800 + 1_700 + 800);
    }

    #[test]
    fn sentences_waiting_more_than_20_seconds_are_skipped() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 1_000));
        q.push(item(2, "en", "Two.", 5_000));
        assert!(matches!(q.pop(21_001), Some(Ready::Skip(i)) if i.sub_id == 1));
        assert!(matches!(q.pop(21_001), Some(Ready::Translate(i)) if i.sub_id == 2));
    }

    /// Đoạn gộp lấy trung bình xác suất VAD theo độ dài tiếng nói.
    #[test]
    fn merged_segments_weigh_the_vad_statistics_by_speech_length() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(PendingSegment {
            mean_prob: 0.5,
            speech_ratio: 0.5,
            ..seg(0, 0, 1_000, 1)
        });
        q.push(PendingSegment {
            mean_prob: 0.9,
            speech_ratio: 1.0,
            ..seg(1, 2_000, 5_000, 3)
        });
        q.push(seg(2, 6_000, 7_000, 1));
        q.push(seg(3, 8_000, 9_000, 1));
        let Some(Popped::Segment(first)) = q.pop(0) else {
            panic!("phải có đoạn gộp")
        };
        assert_eq!((first.ids, first.speech_ms), (vec![0, 1], 4_000));
        assert!((first.mean_prob - 0.8).abs() < 1e-6, "{}", first.mean_prob);
        assert!((first.speech_ratio - 0.875).abs() < 1e-6, "{}", first.speech_ratio);
    }
}
