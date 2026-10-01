//! Luồng tiền xử lý (spec §6.1, §6.2): đọc ring buffer của một hoặc hai nguồn, gộp về mono và resample từng nguồn về
//! 16 kHz, rồi trộn hai nguồn (Windows, chế độ tự động: thiết bị Console và Communications) bằng `Mixer2`, bù lệch đồng
//! hồ bằng cách phát riêng phần dư.

use crate::AudioFormat;
use crate::mix::Mixer2;
use crate::resample::{MonoResampler, TARGET_RATE};
use anyhow::{Result, bail};

/// Ring buffer của mỗi nguồn chứa được 30 giây âm thanh 48 kHz stereo (spec §6.1). Thiết bị có tần số hay số kênh lớn
/// hơn thì ring chứa được ít giây hơn; luồng tiền xử lý đọc ring mỗi 20 ms nên vẫn dư nhiều.
pub const RING_SAMPLES: usize = 48_000 * 2 * 30;

/// Lệch tối đa giữa hai nguồn trước khi phần dư được phát riêng: 100 ms ở 16 kHz (như công cụ `capture`).
pub const MAX_SKEW_SAMPLES: usize = TARGET_RATE as usize / 10;

struct Input {
    consumer: rtrb::Consumer<f32>,
    resampler: MonoResampler,
    mono: Vec<f32>,
}

pub struct Preprocessor {
    inputs: Vec<Input>,
    mixer: Mixer2,
    raw: Vec<f32>,
}

impl Preprocessor {
    /// `inputs`: ring buffer và định dạng của từng nguồn (một hoặc hai nguồn).
    pub fn new(inputs: Vec<(rtrb::Consumer<f32>, AudioFormat)>) -> Result<Self> {
        if !(1..=2).contains(&inputs.len()) {
            bail!("cần một hoặc hai nguồn, nhận {}", inputs.len());
        }
        let inputs = inputs
            .into_iter()
            .map(|(consumer, format)| {
                Ok(Input {
                    consumer,
                    resampler: MonoResampler::new(format.sample_rate, format.channels)?,
                    mono: Vec::new(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            inputs,
            mixer: Mixer2::new(MAX_SKEW_SAMPLES),
            raw: Vec::new(),
        })
    }

    /// Đọc hết mẫu đang có ở mọi nguồn, ghi thêm mẫu 16 kHz mono vào `out`.
    pub fn drain(&mut self, out: &mut Vec<f32>) -> Result<()> {
        for input in &mut self.inputs {
            self.raw.clear();
            let available = input.consumer.slots();
            if available > 0 {
                let chunk = input.consumer.read_chunk(available)?;
                let (a, b) = chunk.as_slices();
                self.raw.extend_from_slice(a);
                self.raw.extend_from_slice(b);
                chunk.commit_all();
            }
            input.resampler.process(&self.raw, &mut input.mono)?;
        }
        match self.inputs.as_mut_slice() {
            [only] => out.append(&mut only.mono),
            [a, b] => {
                self.mixer.push_a(&a.mono);
                self.mixer.push_b(&b.mono);
                a.mono.clear();
                b.mono.clear();
                self.mixer.drain_into(out);
            }
            _ => unreachable!("đã kiểm ở `new`"),
        }
        Ok(())
    }
}

/// Giữ luồng 16 kHz đi đúng đồng hồ thật khi nguồn không trả mẫu (macOS: tap chưa chạy vì đang chờ app phát tiếng, hoặc
/// đang khởi tạo lại sau khi đổi thiết bị): chèn im lặng bù phần thiếu, như `GapFiller` làm trên Windows (§6.1). Nhờ vậy
/// thời gian của phụ đề không lệch, và "không có âm thanh" (§9) vẫn được phát hiện.
///
/// - Chỉ chèn khi nguồn không trả mẫu nào (`new_samples == 0`). Khi nguồn đang chạy, phần thiếu so với đồng hồ thật chỉ là
///   đồng hồ thiết bị lệch vài chục ppm: không chèn im lặng vào giữa tiếng nói, chỉ kéo mốc về đồng hồ thật.
/// - Mỗi lần chèn tối đa `max_fill_ms` (2 giây). Thiếu nhiều hơn (máy ngủ, tiến trình bị treo lâu) thì chỉ đồng bộ lại
///   mốc, không chèn: tránh đẩy hàng giờ im lặng (hàng GB mẫu) vào pipeline.
#[derive(Debug)]
pub struct ClockFiller {
    produced: u64,
    tolerance: u64,
    max_fill: u64,
}

impl ClockFiller {
    /// `tolerance_ms`: thiếu dưới mức này thì coi là trễ của bộ đệm, không chèn. Mỗi lần chèn tối đa 2 giây.
    pub fn new(tolerance_ms: u64) -> Self {
        Self::with_max_fill(tolerance_ms, 2_000)
    }

    pub fn with_max_fill(tolerance_ms: u64, max_fill_ms: u64) -> Self {
        Self {
            produced: 0,
            tolerance: tolerance_ms * TARGET_RATE as u64 / 1000,
            max_fill: max_fill_ms * TARGET_RATE as u64 / 1000,
        }
    }

    /// `elapsed`: thời gian thật từ lúc bắt đầu; `new_samples`: số mẫu nguồn vừa trả. Trả số mẫu im lặng cần chèn trước
    /// các mẫu đó.
    pub fn silence_before(&mut self, elapsed: std::time::Duration, new_samples: usize) -> usize {
        let expected = (elapsed.as_micros() as u64) * TARGET_RATE as u64 / 1_000_000;
        if new_samples > 0 {
            // Nguồn đang chạy: không chèn. Đồng hồ thiết bị chậm hơn đồng hồ thật thì kéo mốc về, để phần thiếu không
            // cộng dồn rồi bị chèn một lần vào giữa câu.
            self.produced = (self.produced + new_samples as u64).max(expected.saturating_sub(self.tolerance));
            return 0;
        }
        let deficit = expected.saturating_sub(self.produced);
        if deficit <= self.tolerance {
            return 0;
        }
        if deficit > self.max_fill {
            log_resync(deficit);
            self.produced = expected;
            return 0;
        }
        self.produced = expected;
        deficit as usize
    }
}

fn log_resync(deficit: u64) {
    eprintln!(
        "audio-capture: nguồn im {} giây (máy ngủ?), đồng bộ lại đồng hồ, không chèn im lặng",
        deficit / TARGET_RATE as u64
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ring(samples: &[f32]) -> rtrb::Consumer<f32> {
        let (mut p, c) = rtrb::RingBuffer::new(samples.len().max(1));
        for &s in samples {
            p.push(s).unwrap();
        }
        c
    }

    fn format(sample_rate: u32, channels: u16) -> AudioFormat {
        AudioFormat { sample_rate, channels }
    }

    #[test]
    fn a_16k_mono_source_passes_through() {
        let input: Vec<f32> = (0..1_600).map(|i| (i as f32 / 1_600.0) - 0.5).collect();
        let mut p = Preprocessor::new(vec![(ring(&input), format(16_000, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert_eq!(out, input);
    }

    #[test]
    fn two_sources_at_different_rates_are_resampled_then_mixed() {
        // 1 giây stereo 48 kHz giá trị 0,2 và 1 giây mono 44,1 kHz giá trị 0,1: trộn ra khoảng 0,3.
        let a = vec![0.2f32; 48_000 * 2];
        let b = vec![0.1f32; 44_100];
        let mut p = Preprocessor::new(vec![(ring(&a), format(48_000, 2)), (ring(&b), format(44_100, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert!(out.len() > 15_000 && out.len() <= 16_000, "{}", out.len());
        let steady = &out[4_000..out.len() - 4_000];
        let mean = steady.iter().sum::<f32>() / steady.len() as f32;
        assert!((mean - 0.3).abs() < 0.01, "{mean}");
    }

    #[test]
    fn one_source_going_quiet_does_not_stall_the_other() {
        // Nguồn b không có mẫu nào: sau lệch 100 ms, phần của nguồn a vẫn được phát (§6.1).
        let a = vec![0.2f32; 16_000];
        let mut p = Preprocessor::new(vec![(ring(&a), format(16_000, 1)), (ring(&[]), format(16_000, 1))]).unwrap();
        let mut out = Vec::new();
        p.drain(&mut out).unwrap();
        assert_eq!(out.len(), 16_000 - MAX_SKEW_SAMPLES);
    }

    #[test]
    fn the_clock_filler_inserts_silence_only_when_the_source_stalls() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        // Nguồn đều: 100 ms mỗi lần, đúng giờ (và trễ 150 ms, dưới dung sai).
        assert_eq!(f.silence_before(Duration::from_millis(100), 1_600), 0);
        assert_eq!(f.silence_before(Duration::from_millis(350), 1_600), 0);
        // Nguồn tắt 1,5 giây: bù đúng phần thiếu tới "bây giờ" (1,85 giây − 0,2 giây đã có).
        assert_eq!(f.silence_before(Duration::from_millis(1_850), 0), 26_400);
        // Nguồn chạy lại: không bù hai lần.
        assert_eq!(f.silence_before(Duration::from_millis(1_950), 1_600), 0);
    }

    /// N2 của review 02b: đồng hồ thiết bị chậm 50 ppm suốt một giờ thì không chèn im lặng vào giữa tiếng nói.
    #[test]
    fn a_slow_device_clock_never_inserts_silence_while_running() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        let mut inserted = 0;
        // Mỗi 20 ms thật, thiết bị trả 320 mẫu trừ 50 ppm (cộng dồn bằng số thực).
        let mut owed = 0.0f64;
        for tick in 1..=180_000u64 {
            owed += 320.0 * (1.0 - 50e-6);
            let n = owed.floor() as usize;
            owed -= n as f64;
            inserted += f.silence_before(Duration::from_millis(tick * 20), n);
        }
        assert_eq!(inserted, 0);
    }

    /// Q5 của review 02c: máy ngủ một giờ thì không chèn một giờ im lặng; sau đó vẫn bù khoảng trống ngắn như thường.
    #[test]
    fn a_long_gap_resyncs_instead_of_inserting_silence() {
        use std::time::Duration;
        let mut f = ClockFiller::new(200);
        assert_eq!(f.silence_before(Duration::from_millis(1_000), 16_000), 0);
        assert_eq!(
            f.silence_before(Duration::from_secs(3_601), 0),
            0,
            "thiếu một giờ: không chèn"
        );
        assert_eq!(f.silence_before(Duration::from_millis(3_601_100), 1_600), 0);
        // Khoảng trống 2 giây ngay sau đó vẫn được bù (đúng trần 2 giây).
        assert_eq!(f.silence_before(Duration::from_millis(3_603_100), 0), 32_000);
        assert_eq!(
            f.silence_before(Duration::from_millis(3_605_200), 0),
            0,
            "2,1 giây: quá trần, đồng bộ lại"
        );
    }

    #[test]
    fn zero_or_three_sources_are_refused() {
        assert!(Preprocessor::new(vec![]).is_err());
        let three = (0..3).map(|_| (ring(&[]), format(16_000, 1))).collect();
        assert!(Preprocessor::new(three).is_err());
    }
}
