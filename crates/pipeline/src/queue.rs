//! Hai hàng đợi chống nghẽn của §7, ở dạng luật thuần (không luồng, không khóa), để test từng trường hợp.
//!
//! - [`AsrQueue`], VAD → nhận dạng: tối đa 3 đoạn chờ; đầy thì gộp hai đoạn chờ lâu nhất nếu tổng không quá 12 giây; chỉ
//!   bỏ đoạn (`dropped`) khi độ trễ vượt 20 giây. Đoạn gộp có `speech_ms` bằng tổng của các đoạn con, không tính khoảng
//!   nghỉ ở giữa (§6.3, hạn mức §6.8).
//! - [`MtQueue`], câu chờ dịch: tối đa 3 câu; đầy thì gộp các câu liên tiếp cùng ngôn ngữ thành một request (phụ đề cũng gộp
//!   thành một, lấy `start_ms` của câu đầu và `end_ms` của câu cuối); câu chờ quá 20 giây thì bỏ bước dịch (`skipped`).
//!   Có nhận giọng: gộp trước các câu không lẫn hai giọng đã biết khác nhau; còn nhiều câu hơn cách gộp lúc tắt để lại thì gộp
//!   tiếp như khi tắt, kể cả câu khác giọng (QĐ 12 của kế hoạch 02 phân biệt người nói). Nên hàng đầy thì câu nào vào request
//!   nào y hệt khi tắt; giọng chỉ quyết câu gộp có lẫn giọng (không nhãn) hay không.
//!
//! "Hiện tại" là giờ âm thanh của phiên (ms), cùng gốc với `start_ms` và `end_ms`.

use crate::config::QueueConfig;
use crate::sentence::joiner;
use asr_protocol::SAMPLE_RATE;
use std::collections::VecDeque;
use std::time::Instant;

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

/// Một lần chép từng phần của đoạn đang mở (spec 2026-10-10 §4.1). Luồng VAD tạo; hàng đợi chỉ giữ yêu cầu mới nhất.
#[derive(Clone, PartialEq)]
pub struct PartialRequest {
    /// Id mà đoạn sẽ nhận khi đóng (`Segmenter::open_snapshot`).
    pub id: u64,
    /// Mốc đầu tiếng nói của đoạn, và giờ âm thanh lúc chụp.
    pub start_ms: u64,
    pub upto_ms: u64,
    pub speech_ms: u64,
    pub mean_prob: f32,
    pub samples: Vec<f32>,
    /// Lúc luồng VAD tạo yêu cầu (giờ thật): mốc đầu của vòng cập nhật (spec §5).
    pub requested: Instant,
}

// Debug viết tay: không in âm thanh.
impl std::fmt::Debug for PartialRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PartialRequest")
            .field("id", &self.id)
            .field("start_ms", &self.start_ms)
            .field("upto_ms", &self.upto_ms)
            .field("speech_ms", &self.speech_ms)
            .field("samples", &format_args!("<{} mẫu>", self.samples.len()))
            .finish()
    }
}

#[derive(Debug, PartialEq)]
pub enum Popped {
    Segment(PendingSegment),
    /// Trễ quá `asr_drop_after_ms`: bỏ, không nhận dạng.
    Dropped(PendingSegment),
    /// Lần chép từng phần: chỉ ra khi không còn đoạn đóng nào chờ (spec 2026-10-10 §4.1).
    Partial(PartialRequest),
}

/// `len`, `is_empty` và luật gộp, bỏ đoạn chỉ xét đoạn đóng; ô chép từng phần nằm riêng.
#[derive(Debug)]
pub struct AsrQueue {
    items: VecDeque<PendingSegment>,
    partial: Option<PartialRequest>,
    cfg: QueueConfig,
}

impl AsrQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            partial: None,
            cfg,
        }
    }

    /// Đặt yêu cầu chép từng phần, thay yêu cầu đang chờ (nếu có).
    pub fn set_partial(&mut self, partial: PartialRequest) {
        self.partial = Some(partial);
    }

    /// Còn đoạn đóng chờ nhận dạng: luồng VAD chưa tạo lần chép từng phần theo nhịp (spec 2026-10-10 §4.1).
    pub fn has_waiting_segments(&self) -> bool {
        !self.items.is_empty()
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
        // Đoạn đã đóng: lần chép từng phần đang chờ của nó (hay của đoạn trước) không còn cần.
        if let Some(&last) = segment.ids.last()
            && self.partial.as_ref().is_some_and(|p| p.id <= last)
        {
            self.partial = None;
        }
        if self.items.len() >= self.cfg.asr_max_waiting && self.items.len() >= 2 {
            let max_samples = self.cfg.asr_merge_max_ms as usize * SAMPLE_RATE as usize / 1000;
            if self.items[0].samples.len() + self.items[1].samples.len() <= max_samples {
                let second = self.items.remove(1).expect("có ít nhất hai đoạn");
                self.items[0].absorb(second);
            }
        }
        self.items.push_back(segment);
    }

    /// Lấy đoạn kế tiếp. Đoạn đã trễ quá `asr_drop_after_ms` (tính từ `end_ms`) thì trả `Dropped`. Hết đoạn đóng thì trả lần
    /// chép từng phần đang chờ, nếu có.
    pub fn pop(&mut self, now_ms: u64) -> Option<Popped> {
        let Some(segment) = self.items.pop_front() else {
            return self.partial.take().map(Popped::Partial);
        };
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
    /// Giọng của câu (spec 2026-10-26-phan-biet-nguoi-noi §4.4): hai câu đã biết khác giọng chỉ được gộp khi gộp các câu cùng
    /// giọng xong mà hàng còn dài hơn khi tắt (QĐ 12 của kế hoạch 02). Luồng phụ đề giữ trường này bằng giọng đang hiện của phụ
    /// đề (`set_voice`, `mark_mixed`).
    pub voice: Option<u32>,
    /// Câu lẫn hai giọng đã biết (hàng đợi gộp câu khác giọng, QĐ 12 của kế hoạch 02; hay nhãn tới muộn): luôn không nhãn.
    pub mixed: bool,
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
    /// Số lần `merge_runs` gộp hai câu đã biết khác giọng (lượt 2: hàng còn dài hơn khi tắt).
    merged_across_voices: usize,
}

/// Gộp `b` vào `a` có lẫn hai giọng đã biết khác nhau không. Câu đã lẫn giọng coi như khác mọi giọng đã biết.
fn mixes_voices(a: &MtItem, b: &MtItem) -> bool {
    match (a.voice, b.voice) {
        (Some(x), Some(y)) => x != y,
        (Some(_), None) => b.mixed,
        (None, Some(_)) => a.mixed,
        (None, None) => false,
    }
}

impl MtQueue {
    pub fn new(cfg: QueueConfig) -> Self {
        Self {
            items: VecDeque::new(),
            cfg,
            merged_across_voices: 0,
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

    /// Thêm một câu. Đầy (`mt_max_waiting`) thì trước đó gộp các dãy câu liên tiếp cùng ngôn ngữ đã chốt (`merge_runs`). Trả các
    /// câu vừa được gộp (đã có `replaces` và `version` mới), để phụ đề của chúng được gửi lại.
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

    /// Nhãn tới muộn cho một câu đang chờ dịch; câu lẫn giọng giữ không nhãn. Trả `false` nếu câu không còn trong hàng.
    pub fn set_voice(&mut self, sub_id: u64, voice: Option<u32>) -> bool {
        match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            Some(item) => {
                if !item.mixed {
                    item.voice = voice;
                }
                true
            }
            None => false,
        }
    }

    /// Câu đang chờ dịch hóa ra lẫn hai giọng đã biết (nhãn tới muộn, `VoiceBook::is_mixed`): từ giờ không nhãn, và lượt 1 của
    /// `merge_runs` coi nó khác mọi giọng đã biết. Trả `false` nếu câu không còn trong hàng.
    pub fn mark_mixed(&mut self, sub_id: u64) -> bool {
        match self.items.iter_mut().find(|i| i.sub_id == sub_id) {
            Some(item) => {
                item.mixed = true;
                item.voice = None;
                true
            }
            None => false,
        }
    }

    /// Số lần hàng đợi gộp hai câu đã biết khác giọng (lượt 2 của `merge_runs`) từ đầu phiên.
    pub fn merges_across_voices(&self) -> usize {
        self.merged_across_voices
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

    /// Hàng đầy. Lượt 1 gộp mọi dãy câu liên tiếp cùng ngôn ngữ đã chốt mà không lẫn hai giọng đã biết khác nhau (spec
    /// 2026-10-26-phan-biet-nguoi-noi §4.4). Sau lượt 1 hàng còn nhiều câu hơn cách gộp lúc tắt nhận giọng để lại
    /// ([`MtQueue::runs_when_off`]) thì lượt 2 gộp như khi tắt, kể cả câu khác giọng: đuổi kịp quan trọng hơn nhãn (ưu tiên 1;
    /// QĐ 12 của kế hoạch 02, sửa theo Q1 của rà soát cuối). Lượt 1 chỉ gộp bên trong các dãy mà cách gộp lúc tắt gộp, nên sau
    /// hai lượt câu nào vào request nào y hệt khi tắt, với mọi kiểu lượt nói: hàng không bao giờ dài hơn và câu không chờ lâu hơn
    /// khi tắt. Câu gộp lẫn giọng thì không nhãn. Khi mọi câu chưa biết giọng, lượt 1 đã gộp như khi tắt và lượt 2 không chạy.
    fn merge_runs(&mut self) -> Vec<MtItem> {
        let off_len = self.runs_when_off();
        let mut merged_ids = Vec::new();
        self.merge_pass(false, &mut merged_ids);
        if self.items.len() > off_len {
            self.merge_pass(true, &mut merged_ids);
        }
        self.items
            .iter()
            .filter(|i| merged_ids.contains(&i.sub_id))
            .cloned()
            .collect()
    }

    /// Số câu còn lại nếu gộp như khi tắt nhận giọng (`merge_pass(true)`, không sửa gì): mỗi dãy câu liền nhau đã chốt cùng
    /// ngôn ngữ thành một.
    fn runs_when_off(&self) -> usize {
        let mut prev: Option<&MtItem> = None;
        let mut runs = 0;
        for item in &self.items {
            if !prev.is_some_and(|p| !p.open && !item.open && p.lang == item.lang) {
                runs += 1;
            }
            prev = Some(item);
        }
        runs
    }

    /// Một lượt gộp; `allow_across`: được gộp hai câu đã biết khác giọng. Ghi id của các câu vừa nhận câu khác vào `merged_ids`.
    fn merge_pass(&mut self, allow_across: bool, merged_ids: &mut Vec<u64>) {
        let mut out: VecDeque<MtItem> = VecDeque::new();
        for item in self.items.drain(..) {
            let across = out.back().is_some_and(|last| mixes_voices(last, &item));
            match out.back_mut() {
                Some(last) if !last.open && !item.open && last.lang == item.lang && (allow_across || !across) => {
                    if across {
                        self.merged_across_voices += 1;
                    }
                    last.mixed = last.mixed || item.mixed || across;
                    last.voice = if last.mixed { None } else { last.voice.or(item.voice) };
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
            voice: None,
            mixed: false,
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

    fn partial(id: u64, upto_ms: u64) -> PartialRequest {
        PartialRequest {
            id,
            start_ms: 0,
            upto_ms,
            speech_ms: upto_ms,
            mean_prob: 0.9,
            samples: vec![0.0; 16],
            requested: Instant::now(),
        }
    }

    /// Spec 2026-10-10 §4.1: đoạn đóng luôn được nhận dạng trước lần chép từng phần.
    #[test]
    fn closed_segments_always_go_before_the_partial() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.push(seg(3, 0, 1_000, 1));
        q.push(seg(4, 2_000, 3_000, 1));
        assert!(q.has_waiting_segments());
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [3]));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [4]));
        assert!(!q.has_waiting_segments());
        assert!(matches!(q.pop(0), Some(Popped::Partial(p)) if p.id == 5));
        assert!(q.pop(0).is_none());
    }

    #[test]
    fn a_new_partial_replaces_the_waiting_one() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.set_partial(partial(5, 2_000));
        // Xét lúc yêu cầu còn chờ: `len`, `is_empty` và `has_waiting_segments` chỉ đếm đoạn đóng.
        assert!(q.is_empty());
        assert_eq!(q.len(), 0, "len chỉ đếm đoạn đóng");
        assert!(!q.has_waiting_segments());
        assert!(matches!(q.pop(0), Some(Popped::Partial(p)) if p.upto_ms == 2_000));
        assert!(q.pop(0).is_none(), "chỉ giữ một yêu cầu");
    }

    /// Đoạn đã đóng thì yêu cầu chép từng phần đang chờ của nó (hay của đoạn trước) không còn cần: lượt cuối đã thay.
    #[test]
    fn closing_a_segment_drops_its_waiting_partial() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(5, 1_000));
        q.push(seg(4, 0, 900, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(_))));
        assert!(
            matches!(q.pop(0), Some(Popped::Partial(_))),
            "đoạn 4 đóng không đụng yêu cầu của đoạn 5"
        );
        q.set_partial(partial(5, 1_500));
        q.push(seg(5, 0, 1_600, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [5]));
        assert!(q.pop(0).is_none());
    }

    /// Đoạn đóng bỏ yêu cầu mang id không lớn hơn id cuối của nó: của chính nó (kể cả khi còn đoạn khác chờ), của đoạn
    /// trước; đoạn mang nhiều id thì xét id cuối.
    #[test]
    fn closing_a_segment_drops_partials_up_to_its_last_id() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.push(seg(3, 0, 900, 1));
        assert!(q.has_waiting_segments(), "một đoạn đóng chờ");
        q.set_partial(partial(4, 1_000));
        q.push(seg(4, 1_000, 2_000, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [3]));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [4]));
        assert!(q.pop(0).is_none(), "yêu cầu của đoạn 4 bị bỏ dù đoạn 3 còn chờ");

        q.set_partial(partial(5, 1_000));
        q.push(seg(6, 3_000, 4_000, 1));
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [6]));
        assert!(q.pop(0).is_none(), "yêu cầu của đoạn trước (5) bị bỏ khi đoạn 6 đóng");

        q.set_partial(partial(8, 1_000));
        q.push(PendingSegment {
            ids: vec![7, 8],
            ..seg(7, 5_000, 6_000, 1)
        });
        assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [7, 8]));
        assert!(q.pop(0).is_none(), "đoạn mang id 7 và 8: yêu cầu của đoạn 8 bị bỏ");
    }

    /// Spec 2026-10-10 §4.1: luật gộp và bỏ đoạn chỉ áp cho đoạn đóng. Yêu cầu đang chờ không làm hàng đầy sớm, và trễ bao
    /// nhiêu cũng không bị bỏ.
    #[test]
    fn the_merge_and_drop_rules_ignore_the_partial() {
        let mut q = AsrQueue::new(QueueConfig::default());
        q.set_partial(partial(9, 1_000));
        for i in 0..3 {
            q.push(seg(i, i * 5_000, i * 5_000 + 3_000, 3));
        }
        assert_eq!(q.len(), 3, "ba đoạn đóng chờ, chưa gộp");
        for want in 0..3 {
            assert!(matches!(q.pop(0), Some(Popped::Segment(s)) if s.ids == [want]));
        }
        assert!(matches!(q.pop(60_000), Some(Popped::Partial(p)) if p.id == 9));
    }

    #[test]
    fn the_partial_request_debug_has_no_audio() {
        let p = PartialRequest {
            samples: vec![0.123; 16],
            ..partial(5, 1_000)
        };
        let text = format!("{p:?}");
        assert!(text.contains("<16 mẫu>") && text.contains("id: 5"), "{text}");
        assert!(!text.contains("0.123"), "không in mẫu âm thanh: {text}");
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

    fn voiced(id: u64, voice: Option<u32>) -> MtItem {
        MtItem {
            voice,
            ..item(id, "en", "x.", 0)
        }
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §4.4, QĐ 12 của kế hoạch 02 (sửa theo Q1 của rà soát cuối): hàng chưa đầy (dịch kịp)
    /// thì không gộp gì; hàng đầy mà gộp các câu cùng giọng (lượt 1) đã gộp được như lúc tắt (mỗi dãy câu gộp được chỉ có một
    /// giọng) thì không gộp hai câu đã biết khác giọng.
    #[test]
    fn different_known_voices_stay_apart_while_same_voice_merges_match_merging_when_off() {
        let mut q = MtQueue::new(QueueConfig::default());
        assert!(q.push(voiced(1, Some(1))).is_empty());
        assert!(q.push(voiced(2, Some(2))).is_empty(), "hàng chưa đầy: không gộp gì");
        // Câu 3 (giọng 2) còn mở: lúc tắt cũng chỉ gộp được câu 1 và câu 2.
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        q.push(voiced(2, Some(1)));
        q.push(MtItem {
            open: true,
            ..voiced(3, Some(2))
        });
        let merged = q.push(voiced(4, Some(2)));
        assert_eq!(merged.len(), 1);
        assert_eq!((merged[0].sub_id, merged[0].replaces.clone()), (1, vec![2]));
        assert_eq!((merged[0].voice, merged[0].mixed), (Some(1), false));
        assert_eq!(q.iter().map(|i| i.sub_id).collect::<Vec<_>>(), [1, 3, 4]);
        assert_eq!(q.merges_across_voices(), 0);
        // Chưa biết giọng thì gộp như cũ, và câu gộp lấy giọng đã biết.
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        q.push(voiced(2, None));
        q.push(voiced(3, Some(1)));
        let merged = q.push(voiced(4, None));
        assert_eq!(merged[0].replaces, [2, 3]);
        assert_eq!(merged[0].voice, Some(1));
        assert_eq!(q.merges_across_voices(), 0);
    }

    /// QĐ 12 của kế hoạch 02 (ưu tiên 1: tốc độ hơn đúng tên; sửa theo Q1 của rà soát cuối): gộp các câu cùng giọng (lượt 1) xong
    /// mà hàng còn nhiều câu hơn cách gộp lúc tắt để lại thì gộp ngay cả câu khác giọng (lượt 2), như khi tắt nhận giọng; câu gộp
    /// lẫn giọng (`mixed`), không nhãn, nhãn tới muộn cũng không gắn lại. Hai kiểu: xen kẽ 2-1-2 (lượt 1 không gộp được gì) và
    /// 1-1-2-2 (lượt 1 gộp được, hàng hết đầy nhưng vẫn dài hơn khi tắt: luật cũ "hàng vẫn đầy" bỏ sót kiểu này).
    #[test]
    fn a_queue_longer_than_when_off_after_same_voice_merges_merges_different_voices_without_a_label() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        q.push(voiced(2, Some(1)));
        q.push(voiced(3, Some(2)));
        let merged = q.push(voiced(4, Some(2)));
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].replaces, [2, 3]);
        assert_eq!((merged[0].voice, merged[0].mixed), (None, true));
        assert_eq!(q.len(), 2, "1-1-2-2 như khi tắt: một câu gộp và câu mới");
        assert_eq!(q.merges_across_voices(), 1, "một chỗ đổi giọng");

        let mut q = MtQueue::new(QueueConfig::default());
        for id in 1..=3 {
            assert!(q.push(voiced(id, Some(id as u32 % 2 + 1))).is_empty());
        }
        let merged = q.push(voiced(4, Some(1)));
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].replaces, [2, 3]);
        assert_eq!((merged[0].voice, merged[0].mixed), (None, true));
        assert_eq!(q.len(), 2, "như khi tắt: một câu gộp và câu mới");
        assert_eq!(q.merges_across_voices(), 2);
        q.set_voice(1, Some(2));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice.is_none() && i.mixed));
        // Câu 4 không lẫn giọng: nhận nhãn như thường.
        q.set_voice(4, Some(2));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice == Some(2)));
    }

    /// Câu lẫn giọng vì nhãn tới muộn (N4 của rà soát): không nhãn, và lượt 1 không gộp nó với câu đã biết giọng (chỉ lượt 2 gộp,
    /// vì lúc tắt cả ba câu gộp làm một: một lần gộp khác giọng).
    #[test]
    fn a_sentence_marked_mixed_keeps_no_label_and_stays_apart_from_known_voices() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(voiced(1, Some(1)));
        assert!(q.mark_mixed(1));
        assert!(!q.mark_mixed(9), "câu không còn trong hàng");
        q.set_voice(1, Some(1));
        assert_eq!(q.iter().next().map(|i| (i.voice, i.mixed)), Some((None, true)));
        q.push(voiced(2, Some(1)));
        q.push(voiced(3, Some(1)));
        let merged = q.push(voiced(4, Some(1)));
        assert_eq!((merged[0].sub_id, merged[0].replaces.clone()), (1, vec![2, 3]));
        assert_eq!((merged[0].voice, merged[0].mixed), (None, true));
        assert_eq!(
            q.merges_across_voices(),
            1,
            "lượt 1 gộp 2 với 3, lượt 2 gộp câu lẫn giọng với chúng"
        );
    }

    /// Dịch chậm hơn lời nói (mỗi giây một câu, dịch xong một câu mỗi 2 s), hai người nói xen kẽ: hàng đợi dịch không bao giờ dài
    /// hơn `mt_max_waiting`, câu chờ lâu nhất và số câu bỏ bước dịch không hơn khi tắt nhận giọng (QĐ 12, ưu tiên 1). Dịch kịp thì
    /// không có lần gộp khác giọng nào.
    #[test]
    fn overload_with_two_alternating_speakers_queues_no_longer_than_when_off() {
        /// (hàng dài nhất, câu chờ lâu nhất ms, số câu `Skip`, số lần gộp khác giọng).
        fn run(voices: bool, mt_ms: u64) -> (usize, u64, usize, usize) {
            let cfg = QueueConfig::default();
            let mut q = MtQueue::new(cfg);
            let (mut longest, mut waited, mut skipped) = (0, 0, 0);
            let mut busy_until = 0;
            for now in (0..=120_000u64).step_by(100) {
                if now % 1_000 == 0 && now < 60_000 {
                    let id = now / 1_000;
                    let voice = voices.then_some(id as u32 % 2 + 1);
                    q.push(MtItem {
                        voice,
                        enqueued_ms: now,
                        ..item(id, "en", "x.", now)
                    });
                    longest = longest.max(q.len());
                }
                if now >= busy_until {
                    match q.pop(now) {
                        Some(Ready::Translate(i)) => {
                            waited = waited.max(now - i.enqueued_ms);
                            busy_until = now + mt_ms;
                        }
                        Some(Ready::Skip(i)) => {
                            waited = waited.max(now - i.enqueued_ms);
                            skipped += 1;
                        }
                        None => {}
                    }
                }
            }
            (longest, waited, skipped, q.merges_across_voices())
        }
        let max = QueueConfig::default().mt_max_waiting;
        let off = run(false, 2_000);
        let on = run(true, 2_000);
        assert!(on.0 <= max, "bật: hàng dài nhất {} > {max}", on.0);
        assert!(
            on.0 <= off.0 && on.1 <= off.1 && on.2 <= off.2,
            "bật {on:?}, tắt {off:?}"
        );
        assert!(on.3 > 0, "quá tải và người nói xen kẽ: phải gộp khác giọng");
        assert_eq!(run(true, 500).3, 0, "dịch kịp: không gộp khác giọng");
    }

    /// Kết quả một lần mô phỏng dịch quá tải ([`overload`]).
    struct Overload {
        /// Số câu chờ dịch nhiều nhất (ngay sau `push`).
        longest: usize,
        /// Độ chờ (ms giờ âm thanh) của từng request ra khỏi hàng, theo thứ tự.
        waits: Vec<u64>,
        /// Số câu (kể cả câu đã gộp) bị `Skip`.
        skipped: usize,
        /// Số lần gộp hai câu đã biết khác giọng.
        across: usize,
    }

    /// Mô phỏng hàng đợi dịch bằng `MtQueue` thật (như `mtqueue_sim.py` của rà soát cuối kế hoạch 02, Q1): mỗi giây một câu đã
    /// chốt mang giọng `voices[i]` (`None` hết: tắt nhận giọng); luồng dịch rảnh thì lấy câu đầu hàng, dịch mất `base_ms` +
    /// `per_ms` × số câu trong request.
    fn overload(voices: &[Option<u32>], base_ms: u64, per_ms: u64) -> Overload {
        let mut q = MtQueue::new(QueueConfig::default());
        let mut out = Overload {
            longest: 0,
            waits: Vec::new(),
            skipped: 0,
            across: 0,
        };
        let (n, mut now, mut busy_until) = (voices.len() as u64, 0u64, 0u64);
        while now < n * 1_000 || !q.is_empty() {
            if now % 1_000 == 0 && now < n * 1_000 {
                let id = now / 1_000;
                q.push(MtItem {
                    voice: voices[id as usize],
                    ..item(id, "en", "x.", now)
                });
                out.longest = out.longest.max(q.len());
            }
            if now >= busy_until {
                match q.pop(now) {
                    Some(Ready::Translate(i)) => {
                        out.waits.push(now - i.enqueued_ms);
                        busy_until = now + base_ms + per_ms * (1 + i.replaces.len() as u64);
                    }
                    Some(Ready::Skip(i)) => {
                        out.waits.push(now - i.enqueued_ms);
                        out.skipped += 1 + i.replaces.len();
                    }
                    None => {}
                }
            }
            now += 100;
        }
        out.across = q.merges_across_voices();
        out
    }

    /// Bật chậm hơn tắt: hàng dài hơn, câu chờ lâu nhất lâu hơn, tổng độ chờ lớn hơn, hay nhiều câu `Skip` hơn.
    fn slower(on: &Overload, off: &Overload) -> bool {
        on.longest > off.longest
            || on.waits.iter().max() > off.waits.iter().max()
            || on.waits.iter().sum::<u64>() > off.waits.iter().sum::<u64>()
            || on.skipped > off.skipped
    }

    /// xorshift64: sinh kịch bản tất định, không cần crate `rand`.
    fn xorshift(mut seed: u64) -> impl FnMut(u64) -> u64 {
        move |n| {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed % n
        }
    }

    /// Q1 của rà soát cuối kế hoạch 02 (ưu tiên 1, QĐ 12): với MỌI kiểu lượt nói, không chỉ xen kẽ 1-2-1-2, bật nhận giọng không
    /// bao giờ làm hàng đợi dịch dài hơn, câu chờ lâu hơn hay nhiều câu `Skip` hơn khi tắt. Luật cũ ("hàng vẫn đầy sau lượt 1 mới
    /// gộp khác giọng") cho kiểu 1-1-2-2, 1-1-2-3, 1-1-1-2 câu chờ lâu nhất 5 000 ms so với 3 000 ms khi tắt.
    #[test]
    fn overload_is_never_slower_than_when_off_whatever_the_turns() {
        for pattern in [&[1u32, 2][..], &[1, 1, 2, 2], &[1, 1, 2, 3], &[1, 1, 1, 2]] {
            for (base_ms, per_ms) in [(2_000, 0), (1_200, 400), (1_500, 300)] {
                let voices: Vec<Option<u32>> = (0..60).map(|i| Some(pattern[i % pattern.len()])).collect();
                let off = overload(&[None; 60], base_ms, per_ms);
                let on = overload(&voices, base_ms, per_ms);
                assert!(
                    !slower(&on, &off),
                    "{pattern:?}, dịch {base_ms} + {per_ms}/câu: bật (hàng {}, chờ lâu nhất {:?}, Skip {}), tắt (hàng {}, chờ lâu \
                     nhất {:?}, Skip {})",
                    on.longest,
                    on.waits.iter().max(),
                    on.skipped,
                    off.longest,
                    off.waits.iter().max(),
                    off.skipped
                );
                assert!(
                    on.across > 0,
                    "{pattern:?}: quá tải, nhiều người nói: phải gộp khác giọng"
                );
            }
        }
    }

    /// Q1 của rà soát cuối: 300 cuộc họp ngẫu nhiên (3 người, mỗi lượt nói 1–3 câu, 120 câu, dịch 2 s mỗi request). Bật không
    /// chậm hơn tắt ở cuộc nào (luật cũ: gần như mọi cuộc có câu chờ lâu nhất khi bật lâu hơn khi tắt).
    #[test]
    fn three_hundred_random_meetings_are_never_slower_with_voices_on() {
        let mut next = xorshift(7);
        let off = overload(&[None; 120], 2_000, 0);
        let mean = |o: &Overload| o.waits.iter().sum::<u64>() as i64 / o.waits.len() as i64;
        let (mut worse, mut longer_max_wait, mut mean_delta_max) = (0, 0, 0i64);
        for _ in 0..300 {
            let mut voices = Vec::new();
            while voices.len() < 120 {
                let voice = next(3) as u32 + 1;
                for _ in 0..=next(3) {
                    voices.push(Some(voice));
                }
            }
            voices.truncate(120);
            let on = overload(&voices, 2_000, 0);
            worse += usize::from(slower(&on, &off));
            longer_max_wait += usize::from(on.waits.iter().max() > off.waits.iter().max());
            mean_delta_max = mean_delta_max.max(mean(&on) - mean(&off));
        }
        assert_eq!(
            worse, 0,
            "{worse}/300 cuộc họp bật chậm hơn tắt ({longer_max_wait}/300 có câu chờ lâu nhất lâu hơn); chờ trung bình lệch nhiều \
             nhất {mean_delta_max:+} ms"
        );
    }

    /// Hệ quả của luật hai lượt đã sửa (Q1 của rà soát cuối): hàng đầy thì cách gộp (câu nào vào request nào) y hệt khi tắt, với
    /// mọi giọng, ngôn ngữ và câu đang mở; giọng chỉ quyết câu gộp có lẫn giọng (không nhãn) hay không.
    #[test]
    fn a_full_queue_groups_sentences_exactly_as_when_off() {
        let mut next = xorshift(11);
        let groups = |q: &MtQueue| q.iter().map(|i| (i.sub_id, i.replaces.clone())).collect::<Vec<_>>();
        let popped = |r: Option<Ready>| {
            r.map(|r| match r {
                Ready::Translate(i) | Ready::Skip(i) => (i.sub_id, i.replaces),
            })
        };
        for _ in 0..300 {
            let (mut on, mut off) = (
                MtQueue::new(QueueConfig::default()),
                MtQueue::new(QueueConfig::default()),
            );
            let mut open: Option<u64> = None;
            for id in 0..40u64 {
                if let Some(sub) = open.take() {
                    on.close(sub);
                    off.close(sub);
                }
                let lang = if next(5) == 0 { "ja" } else { "en" };
                let base = MtItem {
                    open: next(5) == 0,
                    ..item(id, lang, "x.", id * 1_000)
                };
                if base.open {
                    open = Some(id);
                }
                on.push(MtItem {
                    voice: [None, Some(1), Some(2), Some(3)][next(4) as usize],
                    ..base.clone()
                });
                off.push(base);
                assert_eq!(groups(&on), groups(&off), "sau câu {id}");
                if next(3) == 0 {
                    assert_eq!(popped(on.pop(id * 1_000)), popped(off.pop(id * 1_000)));
                }
            }
        }
    }

    #[test]
    fn a_late_voice_reaches_the_waiting_sentence() {
        let mut q = MtQueue::new(QueueConfig::default());
        q.push(item(1, "en", "One.", 0));
        q.set_voice(1, Some(5));
        assert!(matches!(q.pop(0), Some(Ready::Translate(i)) if i.voice == Some(5)));
    }
}
