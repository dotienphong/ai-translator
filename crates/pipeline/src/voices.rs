//! Giọng của từng đoạn và từng phụ đề trong luồng phụ đề (spec 2026-10-26-phan-biet-nguoi-noi §4.3–§4.4).
//!
//! - Giọng của một **nhóm đoạn** (một kết quả nhận dạng; đoạn mà hàng đợi nhận dạng gộp nằm chung một nhóm) là giọng chiếm nhiều
//!   thời lượng nhất trong các đoạn đã biết giọng; hòa thì giọng của đoạn đứng trước trong danh sách (luồng phụ đề đưa đoạn theo
//!   thời gian, nên đó là đoạn sớm hơn); chưa đoạn nào có giọng thì `None` (spec §4.4: "đoạn gộp lấy giọng chiếm nhiều thời
//!   lượng hơn").
//! - Giọng của một **phụ đề** (câu ghép nhiều nhóm, câu mà hàng đợi dịch gộp) là giọng chung của các nhóm đã biết giọng. Hai nhóm
//!   đã biết khác giọng (nhãn tới muộn lộ ra câu đã ghép hai người) thì phụ đề lẫn giọng ([`VoiceBook::is_mixed`]) và không nhãn,
//!   không lấy đa số: thà không nhãn còn hơn sai tên. Worker gộp hai giọng đó làm một ([`VoiceBook::merge_voices`]) thì phụ đề có
//!   nhãn lại. Riêng phụ đề mà hàng đợi dịch gộp từ các câu đã biết khác giọng (dịch quá tải, QĐ 12 của kế hoạch 02) thì luôn
//!   `None` ([`VoiceBook::mark_mixed`]).
//! - Đoạn **không bao giờ có nhãn** (bị bỏ trước khi tới worker, worker chết hay báo lỗi khi đoạn còn chờ, client đã tắt; N1 của
//!   rà soát cuối kế hoạch 02: [`VoiceBook::unlabeled`], [`VoiceBook::close`]) có thể là người khác: trong một nhóm nó tính như
//!   một giọng riêng khi lấy đa số; nhóm mà nó chiếm đa số thì khác mọi giọng đã biết, nên phụ đề ghép nhóm đó với nhóm đã biết
//!   giọng thì lẫn giọng và không nhãn (thà không nhãn còn hơn sai tên). Đoạn chưa có nhãn (nhãn đang tới) và đoạn worker trả
//!   "chưa có giọng nào" (`Assign` với `None`, spec §5.2) thì như trước: không tính.
//!
//! Nhãn tới trước hay sau kết quả nhận dạng đều đúng: hàm trả phụ đề nào có giọng đổi để luồng phụ đề phát `subtitle://speaker`.

use std::collections::{BTreeMap, HashMap, HashSet};

/// Giữ tối đa chừng này đoạn gần nhất (phụ đề cũ hơn đã chốt từ lâu).
pub const KEEP_SEGMENTS: usize = 1_024;
/// `Assign` cho đoạn chưa chốt ở VAD chỉ được giữ khi id không vượt id đoạn mới nhất đã chốt quá chừng này. Nhãn tới trước
/// `queued` (N7 của rà soát) chỉ sớm vài đoạn (kênh nhận giọng 4 đoạn); id xa hơn là nhãn lạ của worker hỏng: bỏ, để nó không
/// làm sổ phình ra hay đẩy đoạn thật ra khỏi sổ (N9).
pub const ASSIGN_AHEAD_MAX: u64 = 256;

/// Nhãn của một đoạn.
#[derive(Clone, Copy, Default, PartialEq)]
enum Label {
    /// Chưa có `Assign`: nhãn đang tới.
    #[default]
    Waiting,
    /// `Assign` của worker; `None`: worker chưa có giọng nào để gán (spec §5.2).
    Assigned(Option<u32>),
    /// Không bao giờ có nhãn (đầu module).
    Never,
}

#[derive(Clone, Copy, Default)]
struct SegVoice {
    dur_ms: u64,
    label: Label,
    sub: Option<u64>,
}

/// Giọng của một nhóm đoạn.
#[derive(Clone, Copy, PartialEq)]
enum Group {
    /// Chưa đoạn nào có giọng.
    Unknown,
    Voice(u32),
    /// Đoạn không bao giờ có nhãn chiếm đa số: khác mọi giọng đã biết.
    Unlabeled,
}

#[derive(Default)]
struct SubVoices {
    /// Các nhóm đoạn của phụ đề, mỗi nhóm là một kết quả nhận dạng (`attach`).
    pieces: Vec<Vec<u64>>,
    /// Giọng đang hiện.
    voice: Option<u32>,
}

#[derive(Default)]
pub struct VoiceBook {
    segs: BTreeMap<u64, SegVoice>,
    /// Phụ đề (id đã cộng `id_base`) → các nhóm đoạn của nó và giọng đang hiện.
    subs: HashMap<u64, SubVoices>,
    /// Phụ đề gộp từ các câu đã biết khác giọng: không nhãn.
    mixed: HashSet<u64>,
    /// Id đoạn lớn nhất đã chốt ở VAD.
    newest: Option<u64>,
    /// Kênh nhãn đã đóng (client tắt): đoạn chưa có nhãn và đoạn chốt sau đó không bao giờ có nhãn.
    closed: bool,
}

impl VoiceBook {
    /// Đoạn vừa chốt ở VAD, với thời lượng tiếng nói thật.
    pub fn queued(&mut self, seg: u64, dur_ms: u64) {
        self.seg_mut(seg).dur_ms = dur_ms;
        self.newest = self.newest.max(Some(seg));
        self.prune();
    }

    /// Id đoạn lớn nhất đã chốt ở VAD (`queued`).
    pub fn newest(&self) -> Option<u64> {
        self.newest
    }

    /// `Assign` của đoạn `seg`. Trả (phụ đề, giọng mới) khi giọng của phụ đề chứa đoạn đó đổi. Đoạn lạ (id vượt đoạn mới nhất đã
    /// chốt quá [`ASSIGN_AHEAD_MAX`]) thì bỏ qua.
    pub fn assign(&mut self, seg: u64, voice: Option<u32>) -> Option<(u64, Option<u32>)> {
        if self.is_stray(seg) {
            return None;
        }
        let entry = self.seg_mut(seg);
        entry.label = Label::Assigned(voice);
        let sub = entry.sub;
        self.prune();
        self.refresh(sub?)
    }

    /// Đoạn `seg` sẽ không bao giờ có nhãn (bị bỏ trước khi tới worker, worker chết hay báo lỗi khi đoạn còn chờ; N1 của rà soát
    /// cuối). Trả (phụ đề, giọng mới) khi giọng của phụ đề chứa đoạn đó đổi. Đoạn đã có nhãn hay đoạn lạ thì bỏ qua.
    pub fn unlabeled(&mut self, seg: u64) -> Option<(u64, Option<u32>)> {
        if self.is_stray(seg) {
            return None;
        }
        let entry = self.seg_mut(seg);
        if entry.label != Label::Waiting {
            return None;
        }
        entry.label = Label::Never;
        let sub = entry.sub;
        self.prune();
        self.refresh(sub?)
    }

    /// Kênh nhãn đã đóng (client tắt: quá tải, chết 3 lần, hết phiên): mọi đoạn đang chờ nhãn và mọi đoạn chốt sau đó không bao
    /// giờ có nhãn. Trả các phụ đề có giọng đổi.
    pub fn close(&mut self) -> Vec<(u64, Option<u32>)> {
        self.closed = true;
        let mut touched: Vec<u64> = Vec::new();
        for s in self.segs.values_mut().filter(|s| s.label == Label::Waiting) {
            s.label = Label::Never;
            if let Some(sub) = s.sub
                && !touched.contains(&sub)
            {
                touched.push(sub);
            }
        }
        touched.sort_unstable();
        touched.into_iter().filter_map(|sub| self.refresh(sub)).collect()
    }

    /// Các đoạn `segs` (một kết quả nhận dạng) thuộc phụ đề `sub` (phụ đề mới, hay câu được ghép thêm). Trả giọng của phụ đề.
    pub fn attach(&mut self, sub: u64, segs: &[u64]) -> Option<u32> {
        for &seg in segs {
            self.seg_mut(seg).sub = Some(sub);
        }
        let entry = self.subs.entry(sub).or_default();
        let piece: Vec<u64> = segs
            .iter()
            .copied()
            .filter(|seg| !entry.pieces.iter().any(|p| p.contains(seg)))
            .collect();
        if !piece.is_empty() {
            entry.pieces.push(piece);
        }
        self.refresh(sub);
        self.voice(sub)
    }

    /// Hàng đợi dịch gộp phụ đề `from` vào `into`. Trả giọng của `into`.
    pub fn absorb(&mut self, into: u64, from: u64) -> Option<u32> {
        let pieces = self.subs.remove(&from).map(|s| s.pieces).unwrap_or_default();
        if self.mixed.remove(&from) {
            self.mixed.insert(into);
        }
        for seg in pieces.iter().flatten() {
            if let Some(s) = self.segs.get_mut(seg) {
                s.sub = Some(into);
            }
        }
        self.subs.entry(into).or_default().pieces.extend(pieces);
        self.refresh(into);
        self.voice(into)
    }

    /// Hàng đợi dịch gộp vào `sub` các câu đã biết khác giọng: từ giờ phụ đề này không nhãn. Trả `Some` khi giọng đổi.
    pub fn mark_mixed(&mut self, sub: u64) -> Option<(u64, Option<u32>)> {
        self.mixed.insert(sub);
        self.subs.entry(sub).or_default();
        self.refresh(sub)
    }

    /// Worker gộp giọng `from` vào `into`. Trả các phụ đề có giọng đổi.
    pub fn merge_voices(&mut self, from: u32, into: u32) -> Vec<(u64, Option<u32>)> {
        let mut touched: Vec<u64> = Vec::new();
        for s in self
            .segs
            .values_mut()
            .filter(|s| s.label == Label::Assigned(Some(from)))
        {
            s.label = Label::Assigned(Some(into));
            if let Some(sub) = s.sub
                && !touched.contains(&sub)
            {
                touched.push(sub);
            }
        }
        touched.sort_unstable();
        touched.into_iter().filter_map(|sub| self.refresh(sub)).collect()
    }

    /// Giọng của một nhóm đoạn (xem đầu module); `None` cả khi đoạn không bao giờ có nhãn chiếm đa số.
    pub fn voice_of(&self, segs: &[u64]) -> Option<u32> {
        match self.group_of(segs) {
            Group::Voice(v) => Some(v),
            Group::Unknown | Group::Unlabeled => None,
        }
    }

    fn group_of(&self, segs: &[u64]) -> Group {
        let mut totals: Vec<(Group, u64)> = Vec::new();
        for s in segs.iter().filter_map(|seg| self.segs.get(seg)) {
            let group = match s.label {
                Label::Assigned(Some(voice)) => Group::Voice(voice),
                Label::Never => Group::Unlabeled,
                Label::Waiting | Label::Assigned(None) => continue,
            };
            match totals.iter_mut().find(|(g, _)| *g == group) {
                Some((_, ms)) => *ms += s.dur_ms,
                None => totals.push((group, s.dur_ms)),
            }
        }
        // Lần lượt theo thứ tự đoạn: chỉ thay khi nhiều hơn hẳn, nên hòa thì giữ giọng gặp trước.
        let mut best: Option<(Group, u64)> = None;
        for (g, ms) in totals {
            if best.is_none_or(|(_, b)| ms > b) {
                best = Some((g, ms));
            }
        }
        best.map_or(Group::Unknown, |(g, _)| g)
    }

    /// Giọng đang hiện của phụ đề `sub`.
    pub fn voice(&self, sub: u64) -> Option<u32> {
        self.subs.get(&sub).and_then(|s| s.voice)
    }

    /// Phụ đề lẫn giọng: hàng đợi dịch đã gộp nó từ các câu khác giọng (`mark_mixed`), hay hai nhóm đoạn của nó đã biết khác giọng
    /// (kể cả nhóm không bao giờ có nhãn cạnh nhóm đã biết giọng).
    /// Luồng phụ đề không ghép thêm đoạn đã biết giọng vào câu đang mở lẫn giọng, và hàng đợi dịch coi câu đó khác mọi giọng.
    pub fn is_mixed(&self, sub: u64) -> bool {
        self.mixed.contains(&sub) || self.common_voice(sub).is_err()
    }

    pub fn len(&self) -> usize {
        self.segs.len()
    }

    pub fn is_empty(&self) -> bool {
        self.segs.is_empty()
    }

    /// Giọng chung của các nhóm đoạn đã biết giọng của phụ đề `sub` (chưa nhóm nào biết: `None`); `Err` khi hai nhóm khác giọng,
    /// hay một nhóm không bao giờ có nhãn nằm cạnh nhóm đã biết giọng.
    fn common_voice(&self, sub: u64) -> Result<Option<u32>, ()> {
        let (mut common, mut unlabeled) = (None, false);
        for piece in self.subs.get(&sub).map(|s| s.pieces.as_slice()).unwrap_or_default() {
            match (common, self.group_of(piece)) {
                (Some(a), Group::Voice(b)) if a != b => return Err(()),
                (None, Group::Voice(b)) => common = Some(b),
                (_, Group::Unlabeled) => unlabeled = true,
                _ => {}
            }
        }
        if unlabeled && common.is_some() {
            return Err(());
        }
        Ok(common)
    }

    /// Đoạn lạ: id vượt đoạn mới nhất đã chốt quá [`ASSIGN_AHEAD_MAX`] và chưa có trong sổ.
    fn is_stray(&self, seg: u64) -> bool {
        let limit = self
            .newest
            .map_or(ASSIGN_AHEAD_MAX, |n| n.saturating_add(ASSIGN_AHEAD_MAX));
        seg > limit && !self.segs.contains_key(&seg)
    }

    /// Mục của đoạn `seg`; đoạn mới sau khi kênh nhãn đóng thì không bao giờ có nhãn.
    fn seg_mut(&mut self, seg: u64) -> &mut SegVoice {
        let closed = self.closed;
        self.segs.entry(seg).or_insert_with(|| SegVoice {
            label: if closed { Label::Never } else { Label::Waiting },
            ..SegVoice::default()
        })
    }

    /// Tính lại giọng của phụ đề `sub`; trả `Some` khi đổi.
    fn refresh(&mut self, sub: u64) -> Option<(u64, Option<u32>)> {
        let voice = if self.mixed.contains(&sub) {
            None
        } else {
            self.common_voice(sub).unwrap_or(None)
        };
        let entry = self.subs.get_mut(&sub)?;
        (entry.voice != voice).then(|| {
            entry.voice = voice;
            (sub, voice)
        })
    }

    fn prune(&mut self) {
        while self.segs.len() > KEEP_SEGMENTS {
            let Some((_, old)) = self.segs.pop_first() else { break };
            let Some(sub) = old.sub else { continue };
            let orphan = self
                .subs
                .get(&sub)
                .is_some_and(|s| s.pieces.iter().flatten().all(|seg| !self.segs.contains_key(seg)));
            if orphan {
                self.subs.remove(&sub);
                self.mixed.remove(&sub);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_voice_of_segments_is_the_one_with_most_time() {
        let mut b = VoiceBook::default();
        for (seg, ms, voice) in [
            (0, 1_000, Some(1)),
            (1, 3_000, Some(2)),
            (2, 2_500, Some(1)),
            (3, 9_000, None),
        ] {
            b.queued(seg, ms);
            b.assign(seg, voice);
        }
        assert_eq!(
            b.voice_of(&[0, 1, 2, 3]),
            Some(1),
            "giọng 1: 3,5 s; giọng 2: 3 s; chưa biết thì không tính"
        );
        assert_eq!(b.voice_of(&[0, 1]), Some(2));
        assert_eq!(b.voice_of(&[3]), None);
        // Hòa: giọng của đoạn đứng trước trong danh sách (luồng phụ đề luôn đưa đoạn theo thời gian, nên đó là đoạn sớm hơn).
        b.queued(4, 3_000);
        b.assign(4, Some(3));
        assert_eq!(b.voice_of(&[4, 1]), Some(3));
        assert_eq!(b.voice_of(&[1, 4]), Some(2));
    }

    /// Dịch quá tải thì hàng đợi dịch gộp cả câu khác giọng (QĐ 12 của kế hoạch 02): phụ đề gộp không nhãn, kể cả khi nhãn tới
    /// muộn hay gộp thêm câu khác.
    #[test]
    fn a_mixed_subtitle_never_gets_a_label() {
        let mut b = VoiceBook::default();
        for (seg, voice) in [(0, Some(1)), (1, Some(2)), (2, None)] {
            b.queued(seg, 1_000);
            b.assign(seg, voice);
        }
        assert_eq!(b.attach(10, &[0]), Some(1));
        assert_eq!(b.attach(11, &[1]), Some(2));
        assert_eq!(b.attach(12, &[2]), None);
        assert_eq!(b.mark_mixed(10), Some((10, None)));
        assert_eq!(b.absorb(10, 11), None);
        assert_eq!(
            b.assign(2, Some(1)),
            Some((12, Some(1))),
            "phụ đề 12 chưa gộp: nhận nhãn như thường"
        );
        assert_eq!(b.absorb(10, 12), None);
        assert_eq!(b.assign(0, Some(3)), None, "phụ đề 10 đã lẫn giọng: không đổi nhãn");
    }

    #[test]
    fn a_late_assign_reports_the_subtitle_whose_voice_changed() {
        let mut b = VoiceBook::default();
        b.queued(0, 2_000);
        b.queued(1, 1_000);
        assert_eq!(b.attach(100, &[0, 1]), None);
        assert_eq!(b.assign(1, Some(4)), Some((100, Some(4))));
        // Đoạn 0 dài hơn, khác giọng: giọng của phụ đề đổi.
        assert_eq!(b.assign(0, Some(5)), Some((100, Some(5))));
        // Không đổi gì: không báo.
        assert_eq!(b.assign(1, Some(4)), None);
        // Đoạn chưa thuộc phụ đề nào: chỉ ghi lại.
        assert_eq!(b.assign(7, Some(1)), None);
    }

    #[test]
    fn an_assign_before_queued_is_kept() {
        let mut b = VoiceBook::default();
        b.assign(0, Some(2));
        b.queued(0, 1_500);
        assert_eq!(b.attach(0, &[0]), Some(2));
    }

    /// Hàng đợi dịch gộp câu chưa biết giọng hay cùng giọng: phụ đề giữ giọng chung. Gộp hai giọng đã biết khác nhau thì không
    /// nhãn (không lấy đa số: thà không nhãn còn hơn sai tên); worker gộp hai giọng đó làm một thì phụ đề có nhãn lại.
    #[test]
    fn absorbing_and_merging_recompute_the_voices() {
        let mut b = VoiceBook::default();
        for (seg, ms, voice) in [
            (0, 1_000, Some(1)),
            (1, 4_000, Some(2)),
            (2, 1_000, Some(3)),
            (3, 1_000, None),
            (4, 1_000, Some(3)),
        ] {
            b.queued(seg, ms);
            b.assign(seg, voice);
        }
        assert_eq!(b.attach(10, &[0]), Some(1));
        assert_eq!(b.attach(11, &[1]), Some(2));
        assert_eq!(b.attach(12, &[2]), Some(3));
        assert_eq!(b.attach(13, &[3]), None);
        assert_eq!(b.attach(14, &[4]), Some(3));
        assert_eq!(b.absorb(12, 13), Some(3), "chưa biết giọng: giữ giọng của câu kia");
        assert_eq!(b.absorb(12, 14), Some(3));
        assert_eq!(
            b.absorb(10, 11),
            None,
            "giọng 1 và giọng 2: không nhãn dù giọng 2 dài hơn"
        );
        assert!(b.is_mixed(10));
        // Worker gộp giọng 3 vào giọng 1: phụ đề 12 đổi; phụ đề 10 (giọng 1 và 2) vẫn không nhãn.
        assert_eq!(b.merge_voices(3, 1), vec![(12, Some(1))]);
        assert_eq!(
            b.merge_voices(2, 1),
            vec![(10, Some(1))],
            "hai giọng hóa ra là một người"
        );
        assert!(!b.is_mixed(10));
    }

    /// N4 của rà soát: câu ghép đoạn A (chưa nhãn) với đoạn B (giọng 2); nhãn của A tới muộn là giọng 1, tức câu đã ghép hai người.
    /// Câu thành không nhãn, không lấy đa số. Đoạn mà hàng đợi nhận dạng gộp (một kết quả nhận dạng) vẫn lấy giọng nhiều thời lượng
    /// hơn (spec §4.4).
    #[test]
    fn a_late_label_revealing_two_voices_in_one_sentence_clears_the_label() {
        let mut b = VoiceBook::default();
        b.queued(0, 1_000);
        b.queued(1, 2_000);
        b.assign(1, Some(2));
        assert_eq!(b.attach(10, &[0]), None);
        assert_eq!(b.attach(10, &[1]), Some(2));
        assert!(!b.is_mixed(10));
        assert_eq!(b.assign(0, Some(1)), Some((10, None)));
        assert!(b.is_mixed(10));
        // Một kết quả nhận dạng gồm hai đoạn khác giọng: giọng nhiều thời lượng hơn.
        b.queued(2, 1_000);
        b.queued(3, 3_000);
        b.assign(2, Some(1));
        b.assign(3, Some(2));
        assert_eq!(b.attach(20, &[2, 3]), Some(2));
        assert!(!b.is_mixed(20));
    }

    /// N9 của rà soát: `Assign` cho đoạn lạ (worker hỏng) không làm sổ phình ra, và không đẩy đoạn thật ra khỏi sổ. `Assign` tới
    /// trước `queued` của đoạn sắp chốt vẫn được giữ.
    #[test]
    fn labels_for_unknown_segments_never_push_out_real_ones() {
        let mut b = VoiceBook::default();
        for seg in 0..10 {
            b.queued(seg, 1_000);
            b.assign(seg, Some(1));
            b.attach(100 + seg, &[seg]);
        }
        for seg in 0..(2 * KEEP_SEGMENTS as u64) {
            assert_eq!(b.assign(1_000_000 + seg, Some(9)), None);
        }
        assert_eq!(b.len(), 10, "nhãn lạ không vào sổ");
        b.assign(10, Some(4));
        b.queued(10, 1_000);
        b.queued(11, 1_000);
        assert_eq!(b.attach(110, &[10]), Some(4), "nhãn tới trước queued");
        assert_eq!(b.voice_of(&[0]), Some(1), "đoạn thật vẫn còn");
    }

    /// N1 của rà soát cuối kế hoạch 02 (ưu tiên 2: thà không nhãn còn hơn sai tên): đoạn không bao giờ có nhãn (bị bỏ trước khi
    /// tới worker, worker chết hay báo lỗi) có thể là người khác, nên phụ đề ghép nó với đoạn đã biết giọng thì không nhãn. Đoạn
    /// chưa có nhãn (nhãn đang tới) và đoạn worker trả "chưa có giọng nào" (`Assign` với `None`, spec §5.2) giữ luật cũ.
    #[test]
    fn a_segment_that_will_never_be_labeled_clears_the_label_of_its_subtitle() {
        let mut b = VoiceBook::default();
        b.queued(0, 1_000);
        b.assign(0, Some(1));
        b.queued(1, 1_000);
        assert_eq!(b.attach(10, &[0]), Some(1));
        assert_eq!(b.attach(10, &[1]), Some(1), "đoạn 1 chưa có nhãn: nhãn đang tới");
        assert_eq!(b.unlabeled(1), Some((10, None)));
        assert!(b.is_mixed(10));
        assert_eq!(b.voice_of(&[1]), None);
        assert_eq!(b.unlabeled(0), None, "đoạn đã có nhãn: không đổi gì");
        assert_eq!(
            b.assign(1, Some(1)),
            Some((10, Some(1))),
            "nhãn thật tới sau cùng thì thắng"
        );
        // Một mình đoạn không nhãn: phụ đề không nhãn, không lẫn giọng.
        b.queued(2, 1_000);
        assert_eq!(b.unlabeled(2), None);
        assert_eq!(b.attach(20, &[2]), None);
        assert!(!b.is_mixed(20));
        // Worker trả "chưa có giọng nào": như trước, không chặn nhãn của phụ đề.
        b.queued(3, 1_000);
        b.assign(3, None);
        b.queued(4, 1_000);
        b.assign(4, Some(2));
        assert_eq!(b.attach(30, &[3]), None);
        assert_eq!(b.attach(30, &[4]), Some(2));
        // Trong một nhóm đoạn (hàng đợi nhận dạng gộp) vẫn lấy đa số thời lượng (spec §4.4).
        b.queued(5, 3_000);
        b.assign(5, Some(2));
        b.queued(6, 500);
        b.unlabeled(6);
        assert_eq!(b.attach(40, &[5, 6]), Some(2));
        b.queued(7, 500);
        b.assign(7, Some(2));
        b.queued(8, 3_000);
        b.unlabeled(8);
        assert_eq!(b.attach(50, &[7, 8]), None);
        assert_eq!(b.attach(50, &[9]), None);
        // Id lạ (worker hỏng báo lỗi cho đoạn không có): không vào sổ.
        let len = b.len();
        assert_eq!(b.unlabeled(1_000_000), None);
        assert_eq!(b.len(), len);
    }

    /// N1 của rà soát cuối: client tắt (kênh nhãn đóng) thì mọi đoạn đang chờ nhãn và mọi đoạn sau đó không bao giờ có nhãn.
    #[test]
    fn closing_the_label_channel_leaves_every_waiting_segment_unlabeled() {
        let mut b = VoiceBook::default();
        b.queued(0, 1_000);
        b.assign(0, Some(1));
        b.queued(1, 1_000);
        b.attach(10, &[0]);
        assert_eq!(b.attach(10, &[1]), Some(1));
        b.queued(2, 1_000);
        b.assign(2, Some(1));
        assert_eq!(b.attach(20, &[2]), Some(1));
        assert_eq!(b.close(), vec![(10, None)]);
        b.queued(3, 1_000);
        assert_eq!(b.attach(20, &[3]), None, "đoạn chốt sau khi client tắt");
        assert!(b.is_mixed(20));
    }

    #[test]
    fn old_segments_are_forgotten() {
        let mut b = VoiceBook::default();
        for seg in 0..(KEEP_SEGMENTS as u64 + 5) {
            b.queued(seg, 1_000);
            b.assign(seg, Some(1));
            b.attach(seg, &[seg]);
        }
        assert_eq!(b.voice_of(&[0]), None, "đoạn 0 đã bị quên");
        assert_eq!(b.voice_of(&[KEEP_SEGMENTS as u64]), Some(1));
        assert!(b.len() <= KEEP_SEGMENTS);
    }
}
