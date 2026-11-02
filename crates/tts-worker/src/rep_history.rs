//! Lịch sử phạt lặp theo cửa sổ trượt, mỗi codebook một cửa sổ (port `rep_history.py`).
//!
//! Codebook chỉ có 1024 mã mỗi kênh, nên tập tích lũy không giới hạn sẽ phạt gần nửa codebook sau vài trăm khung và làm
//! giọng trôi về cuối chunk dài. Mục tiêu của phạt lặp là bẻ vòng lặp CỤC BỘ: chỉ mã xuất hiện trong `window` khung gần
//! nhất mới bị phạt. `window == 0` giữ hành vi cũ (phạt vĩnh viễn, không giới hạn).

use std::collections::{HashMap, VecDeque};

/// ~2,5 s âm thanh ở 25 khung/s (cùng giá trị SDK).
pub const DEFAULT_REP_WINDOW: usize = 64;

/// Lịch sử một codebook.
#[derive(Debug, Clone)]
pub struct ChannelWindow {
    counts: HashMap<u32, u32>,
    order: VecDeque<u32>,
    window: usize,
}

impl ChannelWindow {
    pub fn new(window: usize) -> Self {
        Self {
            counts: HashMap::new(),
            order: VecDeque::new(),
            window,
        }
    }

    /// Ghi một mã mới; quá cửa sổ thì trục xuất mã cũ nhất (FIFO).
    pub fn add(&mut self, code: u32) {
        *self.counts.entry(code).or_insert(0) += 1;
        if self.window > 0 {
            self.order.push_back(code);
            if self.order.len() > self.window
                && let Some(old) = self.order.pop_front()
            {
                match self.counts.get_mut(&old) {
                    Some(c) if *c > 1 => *c -= 1,
                    _ => {
                        self.counts.remove(&old);
                    }
                }
            }
        }
    }

    /// Số mã khác nhau đang bị phạt.
    pub fn len(&self) -> usize {
        self.counts.len()
    }

    pub fn is_empty(&self) -> bool {
        self.counts.is_empty()
    }

    /// Các mã đang bị phạt, tăng dần (thứ tự cố định để kết quả lặp lại được).
    pub fn codes(&self) -> Vec<usize> {
        let mut v: Vec<usize> = self.counts.keys().map(|&c| c as usize).collect();
        v.sort_unstable();
        v
    }
}

/// Lịch sử theo từng codebook.
#[derive(Debug, Clone)]
pub struct RepetitionHistory {
    channels: Vec<ChannelWindow>,
}

impl RepetitionHistory {
    pub fn new(n_channels: usize, window: usize) -> Self {
        Self {
            channels: (0..n_channels).map(|_| ChannelWindow::new(window)).collect(),
        }
    }

    pub fn channel(&self, ch: usize) -> &ChannelWindow {
        &self.channels[ch]
    }

    pub fn channel_mut(&mut self, ch: usize) -> &mut ChannelWindow {
        &mut self.channels[ch]
    }

    pub fn len(&self) -> usize {
        self.channels.len()
    }

    pub fn is_empty(&self) -> bool {
        self.channels.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_evicts_oldest_but_keeps_codes_still_in_window() {
        let mut w = ChannelWindow::new(3);
        for c in [1, 2, 1, 3] {
            w.add(c);
        }
        // cửa sổ cuối: [2, 1, 3]; mã 1 lần đầu bị trục xuất nhưng còn một lần
        assert_eq!(w.codes(), vec![1, 2, 3]);
        w.add(4); // cửa sổ: [1, 3, 4]
        assert_eq!(w.codes(), vec![1, 3, 4]);
    }

    #[test]
    fn zero_window_is_unbounded() {
        let mut w = ChannelWindow::new(0);
        for c in 0..500u32 {
            w.add(c % 300);
        }
        assert_eq!(w.len(), 300);
    }

    #[test]
    fn channels_are_independent() {
        let mut h = RepetitionHistory::new(2, 4);
        h.channel_mut(0).add(5);
        assert!(h.channel(1).is_empty());
        assert_eq!(h.len(), 2);
    }
}
