//! Trộn hai luồng 16 kHz mono từ hai thiết bị (Console và Communications, spec §6.1).
//!
//! Hai thiết bị có đồng hồ riêng, nên lệch dần. Mẫu của hai phía được cộng từng cặp; nếu một phía
//! dư quá `max_skew` mẫu so với phía kia thì phần dư được phát riêng, để độ trễ không tăng mãi.

use std::collections::VecDeque;

pub struct Mixer2 {
    a: VecDeque<f32>,
    b: VecDeque<f32>,
    max_skew: usize,
}

impl Mixer2 {
    pub fn new(max_skew_samples: usize) -> Self {
        Self {
            a: VecDeque::new(),
            b: VecDeque::new(),
            max_skew: max_skew_samples,
        }
    }

    pub fn push_a(&mut self, samples: &[f32]) {
        self.a.extend(samples);
    }

    pub fn push_b(&mut self, samples: &[f32]) {
        self.b.extend(samples);
    }

    pub fn drain_into(&mut self, out: &mut Vec<f32>) {
        let paired = self.a.len().min(self.b.len());
        out.extend(
            self.a
                .drain(..paired)
                .zip(self.b.drain(..paired))
                .map(|(x, y)| (x + y).clamp(-1.0, 1.0)),
        );
        if self.a.len() > self.max_skew {
            let excess = self.a.len() - self.max_skew;
            out.extend(self.a.drain(..excess).map(|x| x.clamp(-1.0, 1.0)));
        }
        if self.b.len() > self.max_skew {
            let excess = self.b.len() - self.max_skew;
            out.extend(self.b.drain(..excess).map(|x| x.clamp(-1.0, 1.0)));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pairs_are_summed() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1, 0.2]);
        m.push_b(&[0.3, 0.4, 0.5]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out.len(), 2);
        assert!((out[0] - 0.4).abs() < 1e-6 && (out[1] - 0.6).abs() < 1e-6);
    }

    #[test]
    fn waits_for_the_other_side_within_skew() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1; 50]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert!(out.is_empty());
    }

    #[test]
    fn excess_beyond_skew_is_emitted_alone() {
        let mut m = Mixer2::new(100);
        m.push_a(&[0.1; 150]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out.len(), 50);
    }

    #[test]
    fn sum_is_clamped() {
        let mut m = Mixer2::new(10);
        m.push_a(&[0.9]);
        m.push_b(&[0.9]);
        let mut out = Vec::new();
        m.drain_into(&mut out);
        assert_eq!(out, vec![1.0]);
    }
}
