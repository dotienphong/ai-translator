//! Đếm tiếng (âm tiết) và trần số khung cho MỘT đoạn âm vị (port `core_utils.py`: `syllable_count`, `is_cue_only`,
//! `max_expected_frames`). Trần này cắt cụt phần "nói thêm" khi model bắn trượt stop token trên đoạn ngắn.
//! Đối chiếu với SDK bằng `tests/golden_text.rs`.

/// Khung/phoneme tối đa hợp lý, đo trên 129.790 mẫu của SDK.
const MAX_FRAMES_PER_PHONE: f64 = 2.0;
/// Trừ hao khung cho lead-in và chi phí cố định.
const FRAME_CAP_SLACK: usize = 24;
/// Trần cho đoạn một tiếng (~1 s ở 12,5 khung/giây).
const SINGLE_WORD_MAX_FRAMES: usize = 13;
/// Cộng thêm mỗi tiếng.
const SYLLABLE_CAP_PER_EXTRA: usize = 5;
/// Đoạn dài hơn số tiếng này dùng công thức theo phoneme.
const SYLLABLE_CAP_MAX_SYL: usize = 4;
/// Số phoneme tối đa hợp lý cho MỘT tiếng.
const SINGLE_WORD_MAX_PHONES: usize = 24;

const IPA_VOWELS: &str = "aeiouyæɐɑɒɔəɘɛɜɤɯɵøœʉʊʌɪɨɚɝᵻᵿ";

/// Bỏ `<|emotion_k|>`, `<en>`, `</en>` (chiếm ký tự nhưng không tốn khung).
pub fn strip_markup(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while !rest.is_empty() {
        if let Some(after) = rest.strip_prefix("<|emotion_") {
            let digits = after.chars().take_while(char::is_ascii_digit).count();
            if digits > 0
                && let Some(tail) = after[digits..].strip_prefix("|>")
            {
                rest = tail;
                continue;
            }
        }
        if let Some(tail) = rest.strip_prefix("<en>").or_else(|| rest.strip_prefix("</en>")) {
            rest = tail;
            continue;
        }
        let mut it = rest.chars();
        if let Some(c) = it.next() {
            out.push(c);
        }
        rest = it.as_str();
    }
    out
}

/// `str.isdigit()` của Python cho các ký tự gặp trong âm vị (chữ số ASCII và chữ số mũ).
fn is_digit(c: char) -> bool {
    c.is_ascii_digit() || matches!(c, '⁰' | '¹' | '²' | '³' | '⁴'..='⁹')
}

/// Đoạn chỉ gồm dấu hiệu cảm xúc, không có tiếng nào.
pub fn is_cue_only(phonemes: &str) -> bool {
    phonemes.contains("<|emotion_") && !strip_markup(phonemes).chars().any(char::is_alphabetic)
}

/// Số tiếng ước lượng từ chuỗi âm vị `sea-g2p`: tiếng Việt mỗi từ một tiếng; từ tiếng Anh đếm theo cụm nguyên âm.
pub fn syllable_count(phonemes: &str) -> usize {
    let stripped = strip_markup(phonemes);
    let mut total = 0;
    for tok in stripped.split_whitespace() {
        let (mut groups, mut in_v, mut consonant_seen) = (0usize, false, true);
        for ch in tok.chars() {
            if IPA_VOWELS.contains(ch) {
                if !in_v && consonant_seen {
                    groups += 1;
                }
                in_v = true;
                consonant_seen = false;
            } else if matches!(ch, 'ː' | 'ˈ' | 'ˌ') || is_digit(ch) {
                if matches!(ch, 'ˈ' | 'ˌ') && groups > 0 {
                    in_v = false;
                    consonant_seen = true;
                } else {
                    in_v = false;
                }
            } else {
                in_v = false;
                consonant_seen = true;
            }
        }
        if tok.chars().any(char::is_alphabetic) {
            total += groups.max(1);
        }
    }
    total
}

/// Số khung tối đa hợp lý cho đoạn có chuỗi âm vị này.
pub fn max_expected_frames(phonemes: &str) -> usize {
    let eff_len = strip_markup(phonemes).chars().count();
    let mut cap = FRAME_CAP_SLACK + (MAX_FRAMES_PER_PHONE * eff_len as f64).ceil() as usize;
    if is_cue_only(phonemes) {
        return cap.min(SINGLE_WORD_MAX_FRAMES);
    }
    if !phonemes.contains("<|emotion_") {
        let syl = syllable_count(phonemes).max(1);
        if syl <= SYLLABLE_CAP_MAX_SYL && eff_len <= SINGLE_WORD_MAX_PHONES * syl {
            cap = cap.min(SINGLE_WORD_MAX_FRAMES + SYLLABLE_CAP_PER_EXTRA * (syl - 1));
        }
    }
    cap
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markup_is_stripped() {
        assert_eq!(strip_markup("a<|emotion_2|>b<en>c</en>d"), "abcd");
        assert_eq!(strip_markup("<|emotion_x|>"), "<|emotion_x|>");
    }

    #[test]
    fn cue_only_and_caps() {
        assert!(is_cue_only("<|emotion_1|>"));
        assert!(!is_cue_only("sˈin <|emotion_1|>"));
        assert_eq!(max_expected_frames("<|emotion_1|>"), 13);
        assert_eq!(max_expected_frames(""), 13); // rỗng coi như 1 tiếng: min(24, 13)
    }
}
