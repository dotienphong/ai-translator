//! Luật bỏ đoạn ở tiến trình chính (spec §6.4, "Lọc lỗi ảo giác"), và giới hạn độ dài của đoạn gửi cho `asr-worker`.
//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật.
//!
//! Đoạn bị bỏ không có phụ đề, không vào prompt của đoạn sau, và không làm đổi ngôn ngữ của đoạn trước (§6.4).

use crate::config::FilterConfig;
use asr_protocol::{MAX_PCM_SAMPLES, MIN_PCM_SAMPLES};

/// Lý do không gửi một đoạn cho `asr-worker`: số mẫu ngoài khoảng worker nhận (0,1 đến 30 giây).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PcmSkip {
    TooShort,
    TooLong,
}

pub fn pcm_skip(n_samples: usize) -> Option<PcmSkip> {
    if n_samples < MIN_PCM_SAMPLES {
        Some(PcmSkip::TooShort)
    } else if n_samples > MAX_PCM_SAMPLES {
        Some(PcmSkip::TooLong)
    } else {
        None
    }
}

/// Đoạn không có tiếng nói theo luật của OpenAI Whisper: `no_speech_prob > 0,6` **và** `avg_logprob < −1` (mặc định),
/// hoặc chữ rỗng.
///
/// `avg_logprob` của worker không tính EOT, cố ý khác OpenAI: âm hơn một chút, nên chặt hơn một chút ở đoạn ngắn. Cần cả
/// hai điều kiện: chỉ dùng `no_speech_prob` thì bỏ nhầm một câu tiếng Hàn đúng (0,62 và −0,25); chỉ dùng `avg_logprob`
/// thì bỏ nhầm một clip tiếng Nhật thật trên A4 (−1,318). Với turbo, `no_speech_prob` luôn cỡ 1e-11 nên luật gần như
/// không bao giờ bỏ đoạn nào.
pub fn is_no_speech(no_speech_prob: f32, avg_logprob: f32, text: &str, cfg: &FilterConfig) -> bool {
    let silent = no_speech_prob > cfg.no_speech_prob_max && avg_logprob < cfg.avg_logprob_min;
    silent || text.trim().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn segments_outside_the_worker_range_are_not_sent() {
        assert_eq!(pcm_skip(0), Some(PcmSkip::TooShort));
        assert_eq!(pcm_skip(MIN_PCM_SAMPLES - 1), Some(PcmSkip::TooShort));
        assert_eq!(pcm_skip(MIN_PCM_SAMPLES), None);
        assert_eq!(pcm_skip(MAX_PCM_SAMPLES), None);
        assert_eq!(pcm_skip(MAX_PCM_SAMPLES + 1), Some(PcmSkip::TooLong));
    }

    #[test]
    fn no_speech_needs_both_a_high_no_speech_prob_and_a_low_avg_logprob() {
        let cfg = FilterConfig::default();
        let drops = |no_speech: f32, logprob: f32| is_no_speech(no_speech, logprob, "안녕", &cfg);
        // Luật của OpenAI Whisper: bỏ khi cả hai điều kiện cùng đúng.
        assert!(drops(0.9, -1.5));
        // `no_speech` cao mà chữ chắc chắn (câu tiếng Hàn đúng có no_speech 0,62 và avg_logprob −0,25): giữ.
        assert!(!drops(0.62, -0.25));
        assert!(!drops(1.0, -0.5));
        // `no_speech` thấp mà chữ kém chắc chắn: giữ (turbo có no_speech khoảng 1e-11 nên không bao giờ bị bỏ).
        assert!(!drops(0.0, -3.0));
        assert!(!drops(1e-11, -3.0));
        // Biên: đúng 0,6 chưa quá ngưỡng, đúng −1,0 chưa dưới ngưỡng.
        assert!(!drops(0.6, -1.5));
        assert!(!drops(0.9, -1.0));
        assert!(drops(0.61, -1.01));
    }

    #[test]
    fn empty_text_is_no_speech() {
        let cfg = FilterConfig::default();
        assert!(is_no_speech(0.0, 0.0, "", &cfg));
        assert!(is_no_speech(0.0, -0.3, " \n", &cfg));
        assert!(!is_no_speech(0.0, -0.3, "Hello", &cfg));
    }

    #[test]
    fn thresholds_come_from_the_config() {
        let loose = FilterConfig {
            no_speech_prob_max: 0.3,
            avg_logprob_min: -0.5,
            ..FilterConfig::default()
        };
        assert!(is_no_speech(0.4, -0.6, "x", &loose));
        assert!(!is_no_speech(0.4, -0.6, "x", &FilterConfig::default()));
    }
}
