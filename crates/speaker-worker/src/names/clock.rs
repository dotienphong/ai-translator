//! Mốc giờ chung giữa đoạn âm thanh (ms từ đầu phiên, theo đồng hồ âm thanh) và lượt đọc của bộ đọc tên (giờ hệ thống), QĐ 12 của
//! kế hoạch 04: `SessionStart.unix_ms` (client tính một lần mỗi phiên), hiệu chỉnh bằng giờ nhận `Speech`: mốc = nhỏ nhất của
//! (giờ nhận − `end_ms`) trên [`CLOCK_WINDOW`] `Speech` gần nhất (luồng VAD gửi ngay khi thấy, nên trễ nhỏ nhất gần 0; đồng hồ âm
//! thanh trôi thì mốc trôi theo).

use std::collections::VecDeque;

pub const CLOCK_WINDOW: usize = 64;

#[derive(Default)]
pub struct Clock {
    session_unix_ms: Option<u64>,
    receipts: VecDeque<i64>,
}

impl Clock {
    /// Phiên mới (`SessionStart`): quên mọi mẫu.
    pub fn start(&mut self, unix_ms: u64) {
        self.session_unix_ms = Some(unix_ms);
        self.receipts.clear();
    }

    /// Một `Speech` kết thúc ở `end_ms` của phiên, tới lúc `recv_unix_ms`.
    pub fn speech(&mut self, end_ms: u64, recv_unix_ms: u64) {
        self.receipts.push_back(recv_unix_ms as i64 - end_ms as i64);
        while self.receipts.len() > CLOCK_WINDOW {
            self.receipts.pop_front();
        }
    }

    /// Giờ Unix của mốc 0 của phiên.
    pub fn zero_unix_ms(&self) -> Option<i64> {
        self.receipts
            .iter()
            .min()
            .copied()
            .or(self.session_unix_ms.map(|v| v as i64))
    }

    /// Giờ hệ thống sang ms của phiên.
    pub fn to_session_ms(&self, unix_ms: u64) -> Option<i64> {
        self.zero_unix_ms().map(|z| unix_ms as i64 - z)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn without_speech_the_session_start_is_zero() {
        let mut c = Clock::default();
        assert_eq!(c.to_session_ms(5_000), None);
        c.start(1_000);
        assert_eq!(c.to_session_ms(5_000), Some(4_000));
    }

    /// QĐ 12: mốc là giờ nhận `Speech` sớm nhất so với `end_ms` của nó (luồng VAD gửi ngay khi thấy).
    #[test]
    fn the_earliest_speech_receipt_sets_zero() {
        let mut c = Clock::default();
        c.start(1_000);
        c.speech(500, 1_700);
        assert_eq!(c.zero_unix_ms(), Some(1_200));
        c.speech(1_000, 2_050);
        assert_eq!(c.zero_unix_ms(), Some(1_050));
        c.speech(1_500, 2_900);
        assert_eq!(c.zero_unix_ms(), Some(1_050), "nhận muộn không đổi mốc");
    }

    #[test]
    fn the_window_forgets_old_receipts_so_the_zero_can_drift() {
        let mut c = Clock::default();
        c.start(0);
        c.speech(1_000, 1_010);
        for i in 0..CLOCK_WINDOW as u64 {
            c.speech(2_000 + i * 500, 2_000 + i * 500 + 40);
        }
        assert_eq!(c.zero_unix_ms(), Some(40), "mẫu 10 ms đã ra khỏi cửa sổ 64 mẫu");
        c.start(9_999);
        assert_eq!(c.zero_unix_ms(), Some(9_999), "phiên mới quên mọi mẫu");
    }
}
