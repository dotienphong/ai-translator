//! Lấy mẫu mã âm thanh (port `OnnxV3LiteEngine._sample`): phạt lặp → nhiệt độ → top-k → softmax → top-p → chọn.
//!
//! Hàm chọn nhận số ngẫu nhiên `u` từ ngoài, nên cùng đầu vào cho cùng kết quả (kiểm thử được); phân phối ứng viên
//! ([`candidates`]) được đối chiếu với SDK Python bằng golden test.

/// Tham số lấy mẫu.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Params {
    /// `<= 0` hoặc NaN: chọn mã lớn nhất (greedy).
    pub temperature: f32,
    /// `0` hoặc `>= V`: không giới hạn top-k.
    pub top_k: usize,
    /// Ngoài khoảng `(0, 1)`: không áp top-p. (SDK: `top_p` rỗng/0 hoặc `>= 1` là tắt.)
    pub top_p: f32,
    /// Gần 1: không phạt.
    pub rep_pen: f32,
}

/// Phân phối ứng viên, đã sắp giảm dần theo logit. `ids` và `probs` cùng độ dài, có thể chứa xác suất 0 sau top-p
/// (giống SDK).
#[derive(Debug, Clone, PartialEq)]
pub struct Candidates {
    pub ids: Vec<usize>,
    pub probs: Vec<f32>,
}

/// Tương đương `math.isclose(rep_pen, 1.0)` (rel_tol = 1e-9, abs_tol = 0).
fn is_close_to_one(rep_pen: f32) -> bool {
    let a = f64::from(rep_pen);
    (a - 1.0).abs() <= 1e-9 * a.abs().max(1.0)
}

/// Phạt các mã đã gặp: logit âm nhân `rep_pen`, logit không âm chia `rep_pen`. Mã ngoài từ vựng bị bỏ qua.
/// `prev` phải không trùng (lấy từ [`crate::rep_history::ChannelWindow::codes`]).
pub fn apply_rep_penalty(logits: &mut [f32], prev: &[usize], rep_pen: f32) {
    if is_close_to_one(rep_pen) || prev.is_empty() {
        return;
    }
    for &i in prev {
        if let Some(x) = logits.get_mut(i) {
            *x = if *x < 0.0 { *x * rep_pen } else { *x / rep_pen };
        }
    }
}

/// Mã có logit lớn nhất, lấy cái đầu tiên khi bằng nhau (giống `numpy.argmax`).
pub fn argmax(logits: &[f32]) -> usize {
    let mut best = 0usize;
    for (i, &x) in logits.iter().enumerate() {
        if x > logits[best] {
            best = i;
        }
    }
    best
}

/// Phân phối ứng viên sau phạt lặp, nhiệt độ, top-k, softmax và top-p. `None` khi chọn greedy.
pub fn candidates(logits: &[f32], params: &Params, prev: &[usize]) -> Option<Candidates> {
    if logits.is_empty() || params.temperature.is_nan() || params.temperature <= 0.0 {
        return None;
    }
    let mut l = logits.to_vec();
    apply_rep_penalty(&mut l, prev, params.rep_pen);
    for x in &mut l {
        *x /= params.temperature;
    }
    let v = l.len();
    // top-k TRƯỚC: sắp xếp và softmax chỉ trên k ứng viên (cùng phân phối, nhanh hơn nhiều so với toàn từ vựng).
    let mut cand: Vec<usize> = (0..v).collect();
    let by_logit_desc = |a: &usize, b: &usize| l[*b].total_cmp(&l[*a]).then(a.cmp(b));
    if params.top_k > 0 && params.top_k < v {
        let k = params.top_k;
        cand.select_nth_unstable_by(k - 1, by_logit_desc);
        cand.truncate(k);
    }
    cand.sort_unstable_by(by_logit_desc);

    let max = l[cand[0]];
    let mut probs: Vec<f32> = cand.iter().map(|&i| (l[i] - max).exp()).collect();
    let sum: f32 = probs.iter().sum();
    for p in &mut probs {
        *p /= sum;
    }
    if params.top_p > 0.0 && params.top_p < 1.0 {
        let mut cum = 0.0f32;
        for p in &mut probs {
            let before = cum;
            cum += *p;
            let keep = before < params.top_p;
            if !keep {
                *p = 0.0;
            }
        }
        let total: f32 = probs.iter().sum();
        for p in &mut probs {
            *p /= total;
        }
    }
    Some(Candidates { ids: cand, probs })
}

/// Chọn một mã. `u` thuộc `[0, 1)` (số ngẫu nhiên từ ngoài).
pub fn sample(logits: &[f32], params: &Params, prev: &[usize], u: f32) -> usize {
    let Some(c) = candidates(logits, params, prev) else {
        let mut l = logits.to_vec();
        apply_rep_penalty(&mut l, prev, params.rep_pen);
        return argmax(&l);
    };
    let target = u.clamp(0.0, 1.0 - f32::EPSILON);
    let mut cum = 0.0f32;
    let mut last = c.ids[0];
    for (&id, &p) in c.ids.iter().zip(&c.probs) {
        if p > 0.0 {
            last = id;
            cum += p;
            if target < cum {
                return id;
            }
        }
    }
    last // sai số làm tròn: rơi về mã có xác suất dương cuối cùng
}

/// Bộ sinh số giả ngẫu nhiên nhỏ (xorshift64*): đủ cho lấy mẫu giọng, hạt giống cố định thì lặp lại được.
#[derive(Debug, Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self(if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed })
    }

    /// Số thực trong `[0, 1)`.
    pub fn next_f32(&mut self) -> f32 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        let r = self.0.wrapping_mul(0x2545_F491_4F6C_DD1D);
        ((r >> 40) as f32) / ((1u64 << 24) as f32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const P: Params = Params {
        temperature: 1.0,
        top_k: 0,
        top_p: 1.0,
        rep_pen: 1.0,
    };

    #[test]
    fn greedy_when_temperature_not_positive() {
        let l = [0.1, 3.0, 2.0, 3.0];
        for t in [0.0, -1.0, f32::NAN] {
            let p = Params { temperature: t, ..P };
            assert!(candidates(&l, &p, &[]).is_none());
            assert_eq!(sample(&l, &p, &[], 0.99), 1); // bằng nhau lấy cái đầu
        }
    }

    #[test]
    fn rep_penalty_flips_the_winner() {
        let mut l = [1.0, 2.0, -3.0];
        apply_rep_penalty(&mut l, &[1, 2], 2.0);
        assert_eq!(l, [1.0, 1.0, -6.0]);
        let p = Params {
            temperature: 0.0,
            rep_pen: 2.0,
            ..P
        };
        assert_eq!(sample(&[1.0, 1.5, 0.0], &p, &[1], 0.0), 0); // 1.5/2 = 0.75 < 1.0
    }

    #[test]
    fn rep_penalty_off_near_one_or_empty_prev() {
        let mut l = [1.0, 2.0];
        apply_rep_penalty(&mut l, &[0, 1], 1.0);
        apply_rep_penalty(&mut l, &[], 3.0);
        assert_eq!(l, [1.0, 2.0]);
    }

    #[test]
    fn out_of_vocab_penalty_ids_are_ignored() {
        let mut l = [1.0, 2.0];
        apply_rep_penalty(&mut l, &[99], 2.0);
        assert_eq!(l, [1.0, 2.0]);
    }

    #[test]
    fn probs_sum_to_one_and_are_sorted() {
        let l: Vec<f32> = (0..50).map(|i| (i as f32 * 0.37).sin() * 4.0).collect();
        let p = Params {
            temperature: 0.8,
            top_k: 10,
            top_p: 0.9,
            rep_pen: 1.1,
        };
        let c = candidates(&l, &p, &[3, 7]).unwrap();
        assert!(c.ids.len() <= 10);
        assert!((c.probs.iter().sum::<f32>() - 1.0).abs() < 1e-5);
        assert!(c.probs.windows(2).all(|w| w[0] >= w[1] || w[1] == 0.0));
    }

    #[test]
    fn sample_follows_inverse_cdf_and_never_picks_zero_prob() {
        let l = [5.0, 4.0, 0.0, -5.0];
        let p = Params {
            temperature: 1.0,
            top_k: 0,
            top_p: 0.5,
            rep_pen: 1.0,
        };
        let c = candidates(&l, &p, &[]).unwrap();
        assert!(c.probs[1..].iter().all(|&x| x == 0.0)); // top-p 0,5 chỉ giữ mã đầu
        for u in [0.0, 0.3, 0.999_999] {
            assert_eq!(sample(&l, &p, &[], u), 0);
        }
    }

    #[test]
    fn top_k_one_is_greedy() {
        let l = [0.0, 9.0, 1.0];
        let p = Params {
            temperature: 2.0,
            top_k: 1,
            ..P
        };
        assert_eq!(sample(&l, &p, &[], 0.7), 1);
    }

    #[test]
    fn rng_is_deterministic_and_in_range() {
        let mut a = Rng::new(42);
        let mut b = Rng::new(42);
        for _ in 0..1000 {
            let (x, y) = (a.next_f32(), b.next_f32());
            assert_eq!(x, y);
            assert!((0.0..1.0).contains(&x));
        }
        assert!(Rng::new(0).next_f32() >= 0.0);
    }
}
