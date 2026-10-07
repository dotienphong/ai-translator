//! Luật bỏ đoạn ở tiến trình chính (spec §6.4, "Lọc lỗi ảo giác"), và giới hạn độ dài của đoạn gửi cho `asr-worker`.
//! Chuyển từ `latency-bench` (Đ3 của kế hoạch 00): app và công cụ đo S6 dùng đúng một bản luật. Bộ lọc câu ảo giác quen
//! thuộc là luật mới của Phase 1 ("Việc cho MVP" của §6.4).
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

/// Số liệu của một đoạn mà luật bỏ đoạn cần, ngoài chữ.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Evidence {
    pub no_speech_prob: f32,
    pub avg_logprob: f32,
    /// Xác suất tiếng nói trung bình của VAD (`Segment::mean_prob`). Không có số này (bản ghi cũ) thì truyền 1,0: dấu hiệu
    /// VAD không bao giờ bật.
    pub vad_mean_prob: f32,
    /// Độ dài tiếng nói, không gồm đệm (`Segment::speech_ms`).
    pub speech_ms: u64,
}

/// Kết quả của luật bỏ đoạn cho một đoạn đã chép lời.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Verdict {
    Speech,
    /// Luật `no_speech_prob` và `avg_logprob`, hoặc chữ rỗng.
    NoSpeech,
    /// Chỉ gồm câu ảo giác quen thuộc, hoặc chỉ có dấu câu và ký hiệu.
    Hallucination,
    /// Tỉ lệ nén quá `compression_ratio_max`: chuỗi lặp.
    Repetition,
    /// Chỉ là một câu đệm ("you", "thank you", "谢谢"…) và có dấu hiệu đoạn không phải tiếng nói thật.
    Filler,
}

/// Áp mọi luật, theo thứ tự: `NoSpeech`, `Hallucination`, `Repetition`, `Filler`. `text` là chữ đã qua
/// `text::display_text`.
pub fn verdict(ev: &Evidence, text: &str, cfg: &FilterConfig) -> Verdict {
    if is_no_speech(ev.no_speech_prob, ev.avg_logprob, text, cfg) {
        Verdict::NoSpeech
    } else if is_hallucination(text, cfg) {
        Verdict::Hallucination
    } else if compression_ratio(text) > cfg.compression_ratio_max {
        Verdict::Repetition
    } else if is_suspect_filler(ev, text, cfg) {
        Verdict::Filler
    } else {
        Verdict::Speech
    }
}

/// Dạng so khớp: chữ thường, chỉ giữ chữ và số (bỏ dấu câu, ký hiệu, khoảng trắng).
fn normalize(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Nhãn là cụm có ngoặc, như `[music]` hay `(âm nhạc)`: so khớp cả ngoặc, chỉ bỏ khoảng trắng và hoa thường.
fn is_label(phrase: &str) -> bool {
    phrase.contains(['[', ']', '(', ')', '（', '）', '［', '］', '【', '】', '〔', '〕'])
}

/// Dạng so khớp của nhãn: chữ thường, bỏ khoảng trắng, giữ dấu. Mọi kiểu ngoặc (ngoặc vuông, ngoặc toàn khổ `（）［］`,
/// `【】`, `〔〕` hay gặp trong phụ đề tiếng Nhật và tiếng Trung) đổi về `()`, nên `[音乐]`, `（音楽）` và `【음악】` khớp cùng
/// một nhãn (N2 của review 02 lần 3).
fn compact(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .filter(|c| !c.is_whitespace())
        .map(|c| match c {
            '[' | '（' | '［' | '【' | '〔' => '(',
            ']' | '）' | '］' | '】' | '〕' => ')',
            c => c,
        })
        .collect()
}

/// Bỏ lần lượt các cụm khỏi `rest`, cụm dài trước, để một cụm ngắn nằm trong cụm dài không cắt cụm dài thành hai mẩu.
fn strip_all(mut rest: String, mut phrases: Vec<String>) -> String {
    phrases.retain(|p| !p.is_empty());
    phrases.sort_by_key(|p| std::cmp::Reverse(p.len()));
    for phrase in &phrases {
        rest = rest.replace(phrase.as_str(), "");
    }
    rest
}

/// Đoạn chỉ gồm câu ảo giác quen thuộc (`FilterConfig::hallucination_phrases`), có thể lặp nhiều lần, hoặc chỉ gồm dấu câu
/// và ký hiệu (như "♪♪", "..."). Đoạn có thêm chữ khác thì giữ: "Thank you for watching the demo" là câu thật.
///
/// Nhãn có ngoặc được bỏ trước, trên chữ còn nguyên dấu câu; sau đó mới chuẩn hóa và bỏ các câu còn lại.
pub fn is_hallucination(text: &str, cfg: &FilterConfig) -> bool {
    if text.trim().is_empty() {
        return false;
    }
    let (labels, phrases): (Vec<&String>, Vec<&String>) = cfg.hallucination_phrases.iter().partition(|p| is_label(p));
    let unlabelled = strip_all(compact(text), labels.into_iter().map(|p| compact(p)).collect());
    let rest = normalize(&unlabelled);
    if rest.is_empty() {
        return true;
    }
    strip_all(rest, phrases.into_iter().map(|p| normalize(p)).collect()).is_empty()
}

/// Tỉ lệ nén zlib (mức 6, như `zlib.compress` mà OpenAI Whisper dùng): số byte UTF-8 của chữ chia số byte sau nén. Chữ
/// thường cỡ 1–1,6; chuỗi lặp dài thì lớn hơn 2,4. Chữ rỗng có tỉ lệ 0.
pub fn compression_ratio(text: &str) -> f32 {
    let bytes = text.as_bytes();
    if bytes.is_empty() {
        return 0.0;
    }
    let packed = miniz_oxide::deflate::compress_to_vec_zlib(bytes, 6);
    bytes.len() as f32 / packed.len().max(1) as f32
}

/// Câu đệm đáng ngờ: chữ (đã chuẩn hóa) đúng bằng một câu trong `filler_phrases`, **và** có ít nhất một dấu hiệu:
/// `avg_logprob` thấp, VAD không chắc là tiếng nói, hoặc đoạn dài mà gần như không có từ nào.
///
/// Số từ đếm theo khoảng trắng, nên một câu tiếng Nhật, Trung, Hàn không cách chữ luôn là một từ.
pub fn is_suspect_filler(ev: &Evidence, text: &str, cfg: &FilterConfig) -> bool {
    let norm = normalize(text);
    if norm.is_empty() || !cfg.filler_phrases.iter().any(|p| normalize(p) == norm) {
        return false;
    }
    let words = text
        .split_whitespace()
        .filter(|w| w.chars().any(char::is_alphanumeric))
        .count();
    ev.avg_logprob < cfg.filler_logprob_max
        || ev.vad_mean_prob < cfg.filler_vad_prob_max
        || (ev.speech_ms >= cfg.filler_long_ms && words <= cfg.filler_long_max_words)
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

    #[test]
    fn known_hallucinations_are_recognised() {
        let cfg = FilterConfig::default();
        for text in [
            "Thank you for watching!",
            "Thanks for watching. Thanks for watching.",
            "Hãy subscribe cho kênh",
            "[Music]",
            "♪♪",
            "...",
            "ご視聴ありがとうございました",
            "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
            "시청해 주셔서 감사합니다.",
        ] {
            assert!(is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn real_sentences_are_kept() {
        let cfg = FilterConfig::default();
        for text in [
            "Thank you.",
            "Cảm ơn.",
            "Thank you for watching the demo",
            "Let's review the music budget",
            "",
            "   ",
        ] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn the_phrase_list_comes_from_the_config() {
        let cfg = FilterConfig {
            hallucination_phrases: vec!["xin chào các bạn".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("Xin chào các bạn!", &cfg));
        assert!(!is_hallucination("Thank you for watching", &cfg));
    }

    /// Đoạn chắc chắn là tiếng nói: chỉ chữ quyết định.
    const CLEAR: Evidence = Evidence {
        no_speech_prob: 0.0,
        avg_logprob: -0.2,
        vad_mean_prob: 0.95,
        speech_ms: 800,
    };

    #[test]
    fn verdict_applies_the_rules_in_order() {
        let cfg = FilterConfig::default();
        let silent = Evidence {
            no_speech_prob: 0.9,
            avg_logprob: -1.5,
            ..CLEAR
        };
        assert_eq!(verdict(&silent, "Thank you for watching", &cfg), Verdict::NoSpeech);
        assert_eq!(verdict(&CLEAR, "Thank you for watching", &cfg), Verdict::Hallucination);
        assert_eq!(verdict(&CLEAR, "Thank you.", &cfg), Verdict::Speech);
        assert_eq!(verdict(&CLEAR, "", &cfg), Verdict::NoSpeech);
        let unsure = Evidence {
            avg_logprob: -0.9,
            ..CLEAR
        };
        assert_eq!(verdict(&unsure, "Thank you.", &cfg), Verdict::Filler);
        assert_eq!(verdict(&CLEAR, &"no no no ".repeat(20), &cfg), Verdict::Repetition);
    }

    /// Nhãn có ngoặc chỉ khớp khi còn ngoặc: câu thật "Music." không bị bỏ.
    #[test]
    fn bracketed_labels_match_only_with_their_brackets() {
        let cfg = FilterConfig::default();
        for text in [
            "[Music]",
            "[ Âm nhạc ]",
            "(music) ♪",
            "[MUSIC] [Music]",
            "(Âm nhạc)",
            "(音楽)",
            "[音乐]",
            "[음악]",
            "（音楽）",
            "【音楽】",
            "[音楽]",
            "(音乐)",
            "［音乐］",
            "(음악)",
            "【음악】",
            "〔音楽〕",
        ] {
            assert!(is_hallucination(text, &cfg), "{text:?}");
        }
        for text in [
            "Music.",
            "Âm nhạc",
            "Music [music]",
            "[Music] OK",
            "音楽",
            "음악",
            "（音楽）が好き",
        ] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
        // Nhãn trong manifest (04) có thể viết bằng ngoặc toàn khổ: vẫn là nhãn, và khớp mọi kiểu ngoặc.
        let manifest = FilterConfig {
            hallucination_phrases: vec!["〔BGM〕".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("(bgm)", &manifest));
        assert!(!is_hallucination("BGM", &manifest), "nhãn chỉ khớp khi có ngoặc");
    }

    /// Cụm ngắn nằm trong cụm dài: phải bỏ cụm dài trước, dù danh sách ghi cụm ngắn trước.
    #[test]
    fn longer_phrases_are_removed_first() {
        let cfg = FilterConfig {
            hallucination_phrases: vec!["for watching".into(), "thank you for watching everyone".into()],
            ..FilterConfig::default()
        };
        assert!(is_hallucination("Thank you for watching, everyone!", &cfg));
    }

    /// Còn dư dù chỉ một hai ký tự thì vẫn là câu thật.
    #[test]
    fn a_short_remainder_keeps_the_segment() {
        let cfg = FilterConfig::default();
        for text in ["Thank you for watching. Hi", "Thanks for watching, A", "[Music] 好"] {
            assert!(!is_hallucination(text, &cfg), "{text:?}");
        }
    }

    #[test]
    fn repeated_strings_have_a_high_compression_ratio() {
        assert_eq!(compression_ratio(""), 0.0);
        let real = "Scientists think that ocelots follow and find animals to eat prey by smell sniffing for where \
                    they've been on the ground.";
        assert!(compression_ratio(real) < 1.6, "{}", compression_ratio(real));
        assert!(compression_ratio("Thank you.") < 1.0);
        let looped = "I'm going to go to the store. ".repeat(12);
        assert!(compression_ratio(&looped) > 2.4, "{}", compression_ratio(&looped));
    }

    /// Câu đệm chỉ bị bỏ khi có thêm ít nhất một dấu hiệu, mỗi dấu hiệu đủ một mình.
    #[test]
    fn a_filler_phrase_needs_one_more_signal() {
        let cfg = FilterConfig::default();
        let suspect = |ev: Evidence, text: &str| is_suspect_filler(&ev, text, &cfg);
        for text in [
            "you",
            "I",
            "Thank you.",
            "Cảm ơn",
            "谢谢",
            "ありがとうございました",
            "감사합니다",
            "Okay!",
        ] {
            assert!(!suspect(CLEAR, text), "không có dấu hiệu: {text:?}");
            let low_logprob = Evidence {
                avg_logprob: -0.71,
                ..CLEAR
            };
            assert!(suspect(low_logprob, text), "avg_logprob: {text:?}");
            let weak_vad = Evidence {
                vad_mean_prob: 0.69,
                ..CLEAR
            };
            assert!(suspect(weak_vad, text), "VAD: {text:?}");
        }
        // Biên: đúng −0,7 và đúng 0,7 chưa là dấu hiệu.
        let edge = Evidence {
            avg_logprob: -0.7,
            vad_mean_prob: 0.7,
            ..CLEAR
        };
        assert!(!suspect(edge, "you"));
        // Dấu hiệu 3: từ 2 giây tiếng nói mà chỉ một từ.
        let long = Evidence {
            speech_ms: 2_000,
            ..CLEAR
        };
        assert!(suspect(long, "You."));
        assert!(!suspect(long, "Thank you."), "hai từ");
        assert!(!suspect(
            Evidence {
                speech_ms: 1_999,
                ..CLEAR
            },
            "You."
        ));
        // Câu khác câu đệm thì không xét, dù dấu hiệu nào cũng bật.
        let worst = Evidence {
            avg_logprob: -2.0,
            vad_mean_prob: 0.1,
            speech_ms: 5_000,
            ..CLEAR
        };
        for text in ["Thank you all", "So what", "Cảm ơn anh", ""] {
            assert!(!suspect(worst, text), "{text:?}");
        }
    }
}
