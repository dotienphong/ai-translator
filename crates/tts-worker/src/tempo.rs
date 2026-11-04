//! Đổi nhịp đọc mà không đổi cao độ (spec 2026-11-04-giong-doc-design §5): WSOLA thuần Rust, chạy dần trên từng nhóm PCM.
//!
//! Mỗi khung tổng hợp dài [`WINDOW_S`] (cửa sổ Hann), đặt cách nhau [`HOP_S`] ở đầu ra (chồng 50%, tổng hai cửa sổ chồng nhau
//! luôn bằng 1 nên biên độ không vượt đầu vào). Ở đầu vào, khung thứ `k` lấy quanh vị trí danh nghĩa `k × HOP × speed`, xê
//! dịch trong ±[`SEARCH_S`] tới chỗ tương quan chéo lớn nhất với phần đuôi của khung trước (nửa sau khung trước, tức phần
//! sẽ chồng lên khung này), nên sóng nối liền pha và không đổi cao độ. Khung chỉ được ghép khi đã có đủ đầu vào cho mọi vị
//! trí thử, nên kết quả không phụ thuộc cách cắt nhóm PCM; độ trễ thêm là `SEARCH + WINDOW − HOP` ≈ 22,5 ms (quy về trục
//! đầu vào, cộng tối đa 2,5 ms khi `speed = 0,8`). `flush` đệm số 0 sau đuôi để ghép nốt các khung còn lại rồi cắt đầu ra
//! đúng `round(tổng_vào / speed)` mẫu.

/// Độ dài cửa sổ phân tích/tổng hợp (giây).
pub const WINDOW_S: f32 = 0.025;
/// Bước tổng hợp ở đầu ra (giây), bằng nửa cửa sổ.
pub const HOP_S: f32 = WINDOW_S / 2.0;
/// Khoảng tìm vị trí khớp quanh vị trí danh nghĩa (giây, mỗi phía).
pub const SEARCH_S: f32 = 0.010;
/// Khoảng tốc độ chấp nhận; ngoài khoảng thì kẹp, `NaN`/vô cực coi như 1,0 (phòng gọi sai, giao thức đã kẹp chặt hơn).
const SPEED_LIMITS: (f32, f32) = (0.5, 2.0);

/// Bộ co/giãn thời gian. `speed > 1` đọc nhanh hơn (ít mẫu hơn), `speed < 1` chậm hơn; cao độ giữ nguyên.
/// Dùng cho một dòng PCM liên tục: `process` nhiều lần, `flush` một lần ở cuối; sau `flush` dùng lại được như mới.
pub struct Tempo {
    speed: f32,
    bypass: bool,
    /// Bước tổng hợp, độ dài cửa sổ (= 2 × hop) và khoảng tìm, tính bằng mẫu.
    hop: usize,
    win: usize,
    tol: usize,
    /// Bước phân tích danh nghĩa = hop × speed.
    hop_in: f64,
    /// Cửa sổ Hann tuần hoàn dài `win`.
    window: Vec<f32>,
    /// Đầu vào còn cần; `buf[0]` là mẫu thứ `buf_start` (đếm tuyệt đối từ đầu dòng).
    buf: Vec<f32>,
    buf_start: usize,
    /// Tổng số mẫu đầu vào thật đã nhận.
    in_total: usize,
    /// Chỉ số khung kế tiếp và vị trí (tuyệt đối, ở đầu vào) của khung vừa ghép.
    k: usize,
    prev: usize,
    /// Đầu ra đang cộng chồng; `ola[0]` là mẫu ra thứ `ola_start` (= số mẫu đã trả ra).
    ola: Vec<f32>,
    ola_start: usize,
}

impl Tempo {
    pub fn new(speed: f32, sample_rate: u32) -> Self {
        let speed = if speed.is_finite() {
            speed.clamp(SPEED_LIMITS.0, SPEED_LIMITS.1)
        } else {
            1.0
        };
        let sr = sample_rate as f32;
        let hop = ((HOP_S * sr).round() as usize).max(1);
        let win = 2 * hop;
        let tol = (SEARCH_S * sr).round() as usize;
        let window = (0..win)
            .map(|i| 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / win as f64).cos())
            .map(|w| w as f32)
            .collect();
        Self {
            speed,
            bypass: (speed - 1.0).abs() < 1e-3,
            hop,
            win,
            tol,
            hop_in: hop as f64 * f64::from(speed),
            window,
            buf: Vec::new(),
            buf_start: 0,
            in_total: 0,
            k: 0,
            prev: 0,
            ola: Vec::new(),
            ola_start: 0,
        }
    }

    /// Đúng khi tốc độ coi như 1,0: `process` chép nguyên đầu vào, `flush` không thêm gì (đầu ra giống hệt từng bit).
    pub fn is_bypass(&self) -> bool {
        self.bypass
    }

    /// Nạp thêm `input`; nối vào `out` phần đầu ra đã chốt.
    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        if self.bypass {
            out.extend_from_slice(input);
            return;
        }
        self.buf.extend_from_slice(input);
        self.in_total += input.len();
        while self.try_frame(false) {
            self.emit_until(self.k * self.hop, out);
        }
        self.trim();
    }

    /// Xả hết phần còn lại (đầu ra tổng cộng `round(tổng_vào / speed)` mẫu) rồi đặt lại trạng thái để dùng cho dòng mới.
    pub fn flush(&mut self, out: &mut Vec<f32>) {
        if self.bypass {
            return;
        }
        let target = (self.in_total as f64 / f64::from(self.speed)).round() as usize;
        while self.k * self.hop < target {
            if !self.try_frame(true) {
                break;
            }
        }
        if self.ola_start < target {
            let n = target - self.ola_start;
            if self.ola.len() < n {
                self.ola.resize(n, 0.0);
            }
            out.extend_from_slice(&self.ola[..n]);
        }
        self.reset();
    }

    /// Về trạng thái trống (giữ tốc độ, kích thước và cửa sổ).
    fn reset(&mut self) {
        self.buf.clear();
        self.buf_start = 0;
        self.in_total = 0;
        self.k = 0;
        self.prev = 0;
        self.ola.clear();
        self.ola_start = 0;
    }

    /// Vị trí danh nghĩa (đầu vào) của khung `k`.
    fn nominal(&self, k: usize) -> usize {
        (k as f64 * self.hop_in).round() as usize
    }

    /// Ghép khung `self.k` nếu đủ đầu vào. `padded`: đang xả, coi sau đuôi là số 0 và không tìm khớp vào vùng toàn số 0.
    fn try_frame(&mut self, padded: bool) -> bool {
        let (hop, win) = (self.hop, self.win);
        let nominal = self.nominal(self.k);
        let start = if self.k == 0 {
            if !padded && self.in_total < win {
                return false;
            }
            0
        } else {
            let lo = nominal.saturating_sub(self.tol).max(self.buf_start);
            let mut hi = nominal + self.tol;
            if padded {
                // Chỉ thử các vị trí mà phần đem so (nửa đầu khung) còn nằm trong đầu vào thật, nếu được.
                hi = hi.min(self.in_total.saturating_sub(hop).max(lo));
            } else if self.in_total < hi + win {
                return false;
            }
            self.ensure_buf(hi + win);
            self.best_match(lo, hi, nominal.clamp(lo, hi))
        };
        self.ensure_buf(start + win);
        let at = self.k * hop - self.ola_start;
        if self.ola.len() < at + win {
            self.ola.resize(at + win, 0.0);
        }
        let src = &self.buf[start - self.buf_start..start - self.buf_start + win];
        let dst = &mut self.ola[at..at + win];
        for (i, ((d, &x), &w)) in dst.iter_mut().zip(src).zip(&self.window).enumerate() {
            // Khung đầu không có khung trước để chồng: giữ nguyên nửa đầu thay vì để cửa sổ làm mờ dần từ 0.
            let w = if self.k == 0 && i < hop { 1.0 } else { w };
            *d += w * x;
        }
        self.prev = start;
        self.k += 1;
        true
    }

    /// Vị trí trong `lo..=hi` (tìm thô rồi tinh) có tương quan chéo lớn nhất giữa nửa đầu khung thử và nửa sau khung trước. Hòa thì giữ `pref`
    /// (vị trí danh nghĩa), nên đoạn lặng không bị xê dịch.
    fn best_match(&self, lo: usize, hi: usize, pref: usize) -> usize {
        let hop = self.hop;
        let off = |abs: usize| abs - self.buf_start;
        let r = &self.buf[off(self.prev + hop)..off(self.prev + 2 * hop)];
        let score = |c: usize| -> f32 { r.iter().zip(&self.buf[off(c)..off(c) + hop]).map(|(a, b)| a * b).sum() };
        let (mut best, mut best_score) = (pref, score(pref));
        // Tìm thô bước COARSE rồi tinh quanh chỗ tốt nhất: đỉnh tương quan của tiếng nói rộng cỡ ¼ chu kỳ cao độ (≥ 0,5 ms),
        // nên bước 4 mẫu (0,08 ms ở 48 kHz) không lỡ đỉnh mà nhanh gấp ~4 lần.
        const COARSE: usize = 4;
        for c in (lo..=hi).step_by(COARSE) {
            let s = score(c);
            if s > best_score {
                (best, best_score) = (c, s);
            }
        }
        let centre = best;
        for c in centre.saturating_sub(COARSE - 1).max(lo)..=(centre + COARSE - 1).min(hi) {
            let s = score(c);
            if s > best_score {
                (best, best_score) = (c, s);
            }
        }
        best
    }

    /// Đệm số 0 để `buf` phủ tới mẫu tuyệt đối `end` (chỉ chạm tới khi đang xả; lúc `process` đầu vào đã đủ).
    fn ensure_buf(&mut self, end: usize) {
        let need = end - self.buf_start;
        if self.buf.len() < need {
            self.buf.resize(need, 0.0);
        }
    }

    /// Trả ra `out` các mẫu đầu ra trước vị trí `until` (đã đủ hai khung chồng nên không còn thay đổi).
    fn emit_until(&mut self, until: usize, out: &mut Vec<f32>) {
        let n = until.saturating_sub(self.ola_start).min(self.ola.len());
        out.extend(self.ola.drain(..n));
        self.ola_start += n;
    }

    /// Bỏ phần đầu vào không còn cần: khung sau chỉ đọc từ `min(danh nghĩa − tol, nửa sau khung trước)` trở đi.
    fn trim(&mut self) {
        if self.k == 0 {
            return;
        }
        let keep = self.nominal(self.k).saturating_sub(self.tol).min(self.prev + self.hop);
        let n = keep.saturating_sub(self.buf_start).min(self.buf.len());
        self.buf.drain(..n);
        self.buf_start += n;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: u32 = 48_000;

    fn sine(n: usize) -> Vec<f32> {
        (0..n)
            .map(|i| 0.9 * (2.0 * std::f32::consts::PI * 220.0 * i as f32 / SR as f32).sin())
            .collect()
    }

    /// Chạy cả tín hiệu qua `Tempo`, cắt đầu vào thành từng mẩu `chunk` mẫu.
    fn run(t: &mut Tempo, input: &[f32], chunk: usize) -> Vec<f32> {
        let mut out = Vec::new();
        for c in input.chunks(chunk.max(1)) {
            t.process(c, &mut out);
        }
        t.flush(&mut out);
        out
    }

    #[test]
    fn bypass_is_identity() {
        let x = sine(2 * SR as usize);
        let mut t = Tempo::new(1.0, SR);
        assert!(t.is_bypass());
        let y = run(&mut t, &x, 4800);
        assert_eq!(y.len(), x.len());
        assert!(x.iter().zip(&y).all(|(a, b)| a.to_bits() == b.to_bits()));
        assert!(!Tempo::new(1.15, SR).is_bypass());
    }

    #[test]
    fn output_length_tracks_speed() {
        let x = sine(2 * SR as usize);
        for speed in [0.8f32, 1.15, 1.3] {
            let y = run(&mut Tempo::new(speed, SR), &x, x.len());
            let want = x.len() as f32 / speed;
            assert!(
                (y.len() as f32 - want).abs() <= want * 0.02,
                "speed {speed}: {} mẫu, cần ~{want}",
                y.len()
            );
        }
    }

    #[test]
    fn chunking_does_not_change_length() {
        let x = sine(2 * SR as usize);
        for speed in [0.8f32, 1.15, 1.3] {
            let whole = run(&mut Tempo::new(speed, SR), &x, x.len()).len() as f32;
            assert!(whole > 0.0);
            for chunk in [480, 1000, 4800] {
                let n = run(&mut Tempo::new(speed, SR), &x, chunk).len() as f32;
                assert!(
                    (n - whole).abs() <= whole * 0.01,
                    "speed {speed}, mẩu {chunk}: {n} so với {whole}"
                );
            }
        }
    }

    #[test]
    fn chunking_gives_identical_samples() {
        let x = sine(SR as usize);
        let whole = run(&mut Tempo::new(1.15, SR), &x, x.len());
        for chunk in [1, 333, 4800] {
            assert_eq!(run(&mut Tempo::new(1.15, SR), &x, chunk), whole, "mẩu {chunk}");
        }
    }

    #[test]
    fn pitch_is_preserved() {
        // Số lần đổi dấu mỗi giây ≈ 2 × 220 dù đọc nhanh hay chậm (đổi nhịp, không đổi cao độ).
        let x = sine(2 * SR as usize);
        for speed in [0.8f32, 1.15, 1.3] {
            let y = run(&mut Tempo::new(speed, SR), &x, 4800);
            let body = &y[2400..y.len() - 2400];
            let zc = body.windows(2).filter(|w| (w[0] < 0.0) != (w[1] < 0.0)).count() as f32;
            let hz = zc / 2.0 / (body.len() as f32 / SR as f32);
            assert!((hz - 220.0).abs() < 220.0 * 0.03, "speed {speed}: {hz} Hz");
        }
    }

    #[test]
    fn output_is_finite_and_bounded() {
        let mut x = sine(2 * SR as usize);
        // Thêm đoạn biên độ tối đa và đoạn lặng để thử cả chỗ chuyển đột ngột.
        x.extend((0..4800).map(|i| if i % 2 == 0 { 1.0 } else { -1.0 }));
        x.extend(std::iter::repeat_n(0.0, 4800));
        for speed in [0.8f32, 1.15, 1.3] {
            let y = run(&mut Tempo::new(speed, SR), &x, 1000);
            assert!(!y.is_empty());
            assert!(
                y.iter().all(|v| v.is_finite() && v.abs() <= 1.0 + 1e-3),
                "speed {speed}"
            );
        }
    }

    #[test]
    fn tiny_inputs_do_not_panic() {
        for speed in [0.8f32, 1.0, 1.15, 1.3] {
            let mut out = Vec::new();
            let mut t = Tempo::new(speed, SR);
            t.process(&[], &mut out);
            t.flush(&mut out);
            assert!(out.is_empty(), "đầu vào rỗng phải ra rỗng");
            for n in [1usize, 100] {
                let x = sine(n);
                let y = run(&mut Tempo::new(speed, SR), &x, n);
                let want = (n as f32 / speed).round() as usize;
                assert!(y.len().abs_diff(want) <= 1, "speed {speed}, {n} mẫu → {}", y.len());
                assert!(y.iter().all(|v| v.is_finite()));
            }
        }
    }

    #[test]
    fn added_latency_is_at_most_30ms() {
        let x = sine(SR as usize);
        const CHUNK: usize = 480;
        // 30 ms của thuật toán cộng độ hạt của mẩu nạp vào (mẩu chưa đủ thì chờ mẩu sau).
        let max_lag = (0.030 * SR as f32) as usize + CHUNK;
        for speed in [0.8f32, 1.15, 1.3] {
            let (mut t, mut out, mut fed) = (Tempo::new(speed, SR), Vec::new(), 0usize);
            for c in x.chunks(CHUNK) {
                t.process(c, &mut out);
                fed += c.len();
                // Phần đầu vào đã "có mặt" ở đầu ra (quy về trục đầu vào) không được tụt quá 30 ms so với phần đã nạp.
                let covered = (out.len() as f32 * speed) as usize;
                assert!(
                    fed.saturating_sub(covered) <= max_lag,
                    "speed {speed}: nạp {fed}, ra tương ứng {covered}"
                );
            }
        }
    }

    #[test]
    fn reuse_after_flush() {
        let a = sine(SR as usize / 2);
        let b: Vec<f32> = sine(SR as usize).iter().map(|v| v * 0.5).collect();
        for speed in [0.8f32, 1.0, 1.3] {
            let mut t = Tempo::new(speed, SR);
            let _ = run(&mut t, &a, 1000);
            let again = run(&mut t, &b, 1000);
            let fresh = run(&mut Tempo::new(speed, SR), &b, 1000);
            assert!(!fresh.is_empty());
            assert_eq!(again, fresh, "speed {speed}");
        }
    }
}
