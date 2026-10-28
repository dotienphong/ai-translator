//! Thống kê thời gian đọc của bộ đọc (spec 2026-10-26-phan-biet-nguoi-noi §6.2, §11): mỗi [`STATS_EVERY`] một dòng vào log, chỉ có số
//! đếm và thời gian, không có tên người hay chữ của app họp. Cùng nội dung với `Stats` của `reader::macos`, viết lại ở đây dạng thuần
//! để test được (bộ đọc Windows dùng; kế hoạch 05 QĐ 5).

use std::time::{Duration, Instant};

use super::Pass;

/// Một dòng thống kê vào log mỗi chừng này.
pub const STATS_EVERY: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct Stats {
    full: Vec<f32>,
    fast: Vec<f32>,
    elements: Vec<u32>,
    since: Option<Instant>,
}

fn quantile(v: &mut [f32], p: f32) -> f32 {
    v.sort_by(f32::total_cmp);
    v.get(((v.len() as f32 - 1.0) * p).round().max(0.0) as usize)
        .copied()
        .unwrap_or(0.0)
}

impl Stats {
    /// Ghi một lượt (`ms` thời gian, `elements` số lệnh đọc). Trả dòng log khi đủ [`STATS_EVERY`] kể từ lượt đầu của chu kỳ, rồi đếm
    /// lại. Lượt `Idle` không tính.
    pub fn add(&mut self, pass: Pass, ms: f32, elements: u32, now: Instant) -> Option<String> {
        match pass {
            Pass::Full => self.full.push(ms),
            Pass::Fast => self.fast.push(ms),
            Pass::Idle => return None,
        }
        self.elements.push(elements);
        let since = *self.since.get_or_insert(now);
        if now.saturating_duration_since(since) < STATS_EVERY {
            return None;
        }
        self.elements.sort_unstable();
        let over = self.full.iter().chain(&self.fast).filter(|&&ms| ms > 30.0).count();
        let line = format!(
            "speaker-worker: bộ đọc: {} lượt đầy đủ (p50 {:.1} ms, p90 {:.1}, lớn nhất {:.1}), {} lượt nhanh (p50 {:.1} ms, p90 {:.1}, \
             lớn nhất {:.1}), lệnh đọc p90 {}, {over} lượt quá 30 ms",
            self.full.len(),
            quantile(&mut self.full, 0.5),
            quantile(&mut self.full, 0.9),
            quantile(&mut self.full, 1.0),
            self.fast.len(),
            quantile(&mut self.fast, 0.5),
            quantile(&mut self.fast, 0.9),
            quantile(&mut self.fast, 1.0),
            self.elements.get(self.elements.len() * 9 / 10).copied().unwrap_or(0)
        );
        *self = Stats::default();
        Some(line)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_line_comes_out_once_a_minute_and_counts_restart() {
        let (mut s, t0) = (Stats::default(), Instant::now());
        assert_eq!(s.add(Pass::Idle, 1.0, 0, t0), None, "lượt nghỉ không tính");
        assert_eq!(s.add(Pass::Full, 12.0, 80, t0), None);
        assert_eq!(s.add(Pass::Fast, 2.0, 9, t0 + Duration::from_secs(1)), None);
        assert_eq!(s.add(Pass::Fast, 40.0, 9, t0 + Duration::from_secs(30)), None);
        let line = s.add(Pass::Fast, 3.0, 9, t0 + STATS_EVERY).unwrap();
        assert!(line.contains("1 lượt đầy đủ (p50 12.0 ms"), "{line}");
        assert!(
            line.contains("3 lượt nhanh (p50 3.0 ms, p90 40.0, lớn nhất 40.0)"),
            "{line}"
        );
        assert!(line.contains("lệnh đọc p90 80, 1 lượt quá 30 ms"), "{line}");
        assert_eq!(
            s.add(Pass::Fast, 1.0, 1, t0 + STATS_EVERY + Duration::from_secs(1)),
            None,
            "đếm lại"
        );
    }
}
