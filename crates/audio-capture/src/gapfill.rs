//! Chèn im lặng khi WASAPI loopback không trả gói dữ liệu (spec §6.1).
//!
//! Khi không có âm thanh nào đang phát, Windows không gửi gói nào. Nếu tính thời gian theo số mẫu
//! thì dòng thời gian sẽ bị co lại, và VAD không bao giờ thấy đủ khoảng im lặng để chốt đoạn.
//! `GapFiller` giữ dòng thời gian theo đồng hồ QPC (đơn vị 100 ns, lấy từ `GetBuffer`).

const HNS_PER_SEC: u64 = 10_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PacketAction {
    /// Số khung im lặng cần ghi trước gói này.
    pub silence_before: u32,
    /// Số khung đầu gói cần bỏ, vì trùng với phần im lặng đã chèn.
    pub skip: u32,
}

pub struct GapFiller {
    rate: u64,
    next: Option<u64>,
    /// Lệch trong khoảng này coi là liền mạch (jitter).
    tolerance: u64,
    /// Khi rảnh, chỉ chèn im lặng tới `now - idle_lag`, để chừa chỗ cho gói tới muộn.
    idle_lag: u64,
}

impl GapFiller {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            rate: sample_rate as u64,
            next: None,
            tolerance: 200_000,
            idle_lag: 300_000,
        }
    }

    fn to_hns(&self, frames: u64) -> u64 {
        frames * HNS_PER_SEC / self.rate
    }

    fn to_frames(&self, hns: u64) -> u64 {
        hns * self.rate / HNS_PER_SEC
    }

    /// Gọi cho mỗi gói nhận được. `qpc`: vị trí QPC của khung đầu gói (100 ns).
    pub fn on_packet(&mut self, qpc: u64, frames: u32) -> PacketAction {
        let duration = self.to_hns(frames as u64);
        let Some(next) = self.next else {
            self.next = Some(qpc + duration);
            return PacketAction {
                silence_before: 0,
                skip: 0,
            };
        };
        if qpc > next + self.tolerance {
            self.next = Some(qpc + duration);
            PacketAction {
                silence_before: self.to_frames(qpc - next) as u32,
                skip: 0,
            }
        } else if qpc + self.tolerance < next {
            let skip = self.to_frames(next - qpc).min(frames as u64) as u32;
            self.next = Some(next.max(qpc + duration));
            PacketAction {
                silence_before: 0,
                skip,
            }
        } else {
            // Liền mạch: giữ đồng hồ của mình để jitter không cộng dồn.
            self.next = Some(next + duration);
            PacketAction {
                silence_before: 0,
                skip: 0,
            }
        }
    }

    /// Gọi định kỳ khi không có gói nào. Trả số khung im lặng cần ghi.
    pub fn on_idle(&mut self, now: u64) -> u32 {
        let Some(next) = self.next else {
            self.next = Some(now);
            return 0;
        };
        if now <= next + self.idle_lag {
            return 0;
        }
        let frames = self.to_frames(now - self.idle_lag - next);
        self.next = Some(next + self.to_hns(frames));
        frames as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RATE: u32 = 48_000;
    const TEN_MS: u64 = 100_000; // 100 ns

    #[test]
    fn contiguous_packets_need_no_fill() {
        let mut g = GapFiller::new(RATE);
        for i in 0..10 {
            assert_eq!(
                g.on_packet(i * TEN_MS, 480),
                PacketAction {
                    silence_before: 0,
                    skip: 0
                }
            );
        }
    }

    #[test]
    fn gap_between_packets_is_filled_with_silence() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480); // 0–10 ms
        let a = g.on_packet(10 * TEN_MS, 480); // gói tiếp theo ở 100 ms
        assert_eq!(a.silence_before, 4_320); // 90 ms ở 48 kHz
    }

    #[test]
    fn small_jitter_is_ignored() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480);
        assert_eq!(g.on_packet(TEN_MS + 50_000, 480).silence_before, 0); // trễ 5 ms
    }

    #[test]
    fn idle_time_becomes_silence_and_late_packet_is_trimmed() {
        let mut g = GapFiller::new(RATE);
        g.on_packet(0, 480); // next = 10 ms
        assert_eq!(g.on_idle(10 * TEN_MS), 2_880); // tới 100 − 30 = 70 ms: 60 ms im lặng
        // Gói tới muộn, bắt đầu ở 40 ms, trùng 30 ms (vượt dung sai 20 ms) với phần im lặng đã chèn.
        let a = g.on_packet(4 * TEN_MS, 480);
        assert_eq!(
            a,
            PacketAction {
                silence_before: 0,
                skip: 480
            }
        );
    }

    #[test]
    fn stream_that_never_plays_still_advances_with_the_clock() {
        let mut g = GapFiller::new(RATE);
        assert_eq!(g.on_idle(1_000), 0);
        assert_eq!(g.on_idle(1_000 + 10 * TEN_MS), 3_360); // 100 − 30 = 70 ms
    }
}
