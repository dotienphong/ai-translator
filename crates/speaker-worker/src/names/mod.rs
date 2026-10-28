//! Phần thuần của đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §5.3, §6.4–§6.6): tín hiệu "đang nói" theo thời gian (`track`),
//! mốc giờ (`clock`), ghép tên vào giọng (`matcher`), tách giọng bị gộp (`split`), tự hiệu chỉnh (`calibrate`). Chạy trên luồng
//! chính của worker, tất định, test bằng fixture và dòng thời gian giả. Chỉ trong RAM, xóa khi phiên mới (§5.6). Tên không vào log.

use std::collections::VecDeque;
use std::fmt;

pub mod calibrate;
pub mod clock;
pub mod matcher;
pub mod split;
pub mod track;

/// Người tham dự đang "nói" theo tín hiệu nào (spec §6.4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Via {
    None,
    /// Tín hiệu 1, 2 của công thức.
    Indicator,
    /// Tín hiệu 3: người ở xa duy nhất đang mở mic (chỉ tính khi máy có tiếng).
    Mic,
    /// Chỉ báo tự học (6.5).
    Learned,
}

/// Một người tham dự ở một lượt đọc (spec §6.3: tên, mic, mức nói, có phải chính người dùng).
#[derive(Clone, PartialEq)]
pub struct ParticipantNow {
    pub name: String,
    pub is_self: bool,
    pub muted: Option<bool>,
    /// 1 khi đang nói theo `via`, 0 khi không.
    pub speaking: f32,
    pub via: Via,
}

// Debug viết tay: tên không vào log.
impl fmt::Debug for ParticipantNow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "ParticipantNow(<{} ký tự>, tôi: {}, mic tắt: {:?}, nói: {} qua {:?})",
            self.name.chars().count(),
            self.is_self,
            self.muted,
            self.speaking,
            self.via
        )
    }
}

/// Các khoảng thời gian [đầu, cuối) theo ms của phiên, tăng dần, đã gộp chỗ chồng và chỗ chạm nhau.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Spans(VecDeque<(i64, i64)>);

impl Spans {
    pub fn add(&mut self, start: i64, end: i64) {
        if end <= start {
            return;
        }
        let at = self.0.partition_point(|&(s, _)| s < start);
        self.0.insert(at, (start, end));
        let mut merged: VecDeque<(i64, i64)> = VecDeque::with_capacity(self.0.len());
        for &(s, e) in &self.0 {
            match merged.back_mut() {
                Some(last) if s <= last.1 => last.1 = last.1.max(e),
                _ => merged.push_back((s, e)),
            }
        }
        self.0 = merged;
    }

    /// Thời gian chung với [start, end).
    pub fn overlap(&self, start: i64, end: i64) -> i64 {
        self.0.iter().map(|&(s, e)| (e.min(end) - s.max(start)).max(0)).sum()
    }

    /// Thời gian có ở cả hai, trong [start, end).
    pub fn intersect(&self, other: &Spans, start: i64, end: i64) -> i64 {
        let mut total = 0;
        for &(a0, a1) in &self.0 {
            for &(b0, b1) in &other.0 {
                total += (a1.min(b1).min(end) - a0.max(b0).max(start)).max(0);
            }
        }
        total
    }

    pub fn covers(&self, t: i64) -> bool {
        self.0.iter().any(|&(s, e)| s <= t && t < e)
    }

    pub fn last_end(&self) -> Option<i64> {
        self.0.back().map(|&(_, e)| e)
    }

    /// Bỏ các khoảng kết thúc trước `before`.
    pub fn prune(&mut self, before: i64) {
        while self.0.front().is_some_and(|&(_, e)| e <= before) {
            self.0.pop_front();
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = &(i64, i64)> {
        self.0.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_merge_overlapping_and_touching_pieces() {
        let mut s = Spans::default();
        s.add(1_000, 2_000);
        s.add(3_000, 4_000);
        s.add(1_500, 3_000);
        s.add(5_000, 5_000);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(1_000, 4_000)]);
        s.add(500, 600);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(500, 600), (1_000, 4_000)]);
        assert_eq!(s.overlap(550, 1_500), 50 + 500);
        assert!(s.covers(1_000) && !s.covers(4_000) && !s.covers(700));
        assert_eq!(s.last_end(), Some(4_000));
        s.prune(1_000);
        assert_eq!(s.iter().copied().collect::<Vec<_>>(), [(1_000, 4_000)]);
    }

    #[test]
    fn intersections_count_only_time_in_both_and_in_the_window() {
        let mut a = Spans::default();
        a.add(0, 10_000);
        let mut b = Spans::default();
        b.add(2_000, 3_000);
        b.add(8_000, 12_000);
        assert_eq!(a.intersect(&b, 0, 20_000), 1_000 + 2_000);
        assert_eq!(a.intersect(&b, 2_500, 9_000), 500 + 1_000);
    }
}
