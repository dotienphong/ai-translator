//! Từ điển thuật ngữ khi dịch (spec §6.5 "Thuật ngữ", F5): chỉ những mục **có trong câu** mới vào prompt, tối đa 20 mục
//! mỗi câu, theo mẫu "terminology" của Hy-MT2 (`prompt::terminology_prompt`).
//!
//! So khớp:
//! - Cả câu lẫn thuật ngữ được chuẩn hóa bằng [`normalize`]: Unicode NFC rồi chữ thường, nên "Đà Nẵng" gõ dựng sẵn
//!   (NFC) khớp với chữ chép lời tổ hợp (NFD), và "api" khớp "API".
//! - Chữ Latin (và mọi chữ không phải Trung, Nhật, Hàn) khớp theo ranh giới từ: ở mỗi đầu của thuật ngữ, nếu ký tự ở đầu
//!   đó là chữ hay số thì ký tự kề bên trong câu không được là chữ hay số. Nên "AI" không khớp trong "said", nhưng khớp
//!   trong "AI's" và "使用AI模型".
//! - Chữ Trung, Nhật, Hàn khớp theo chuỗi con (không có khoảng trắng giữa từ; tiếng Hàn có trợ từ dính liền như
//!   "회의를"). Ranh giới chỉ xét theo ký tự ở từng đầu của thuật ngữ, nên thuật ngữ trộn như "AI模型" vẫn đúng luật.
//! - Câu khớp quá 20 mục thì lấy mục dài hơn trước (cụ thể hơn), cùng độ dài thì theo thứ tự trong từ điển.
//!
//! App giữ một [`SharedGlossary`] cho mọi phiên: sửa từ điển giữa phiên thì câu dịch sau dùng ngay bản mới; gói Free thì
//! app đặt từ điển rỗng (kế hoạch 03, `pro.rs`).

use std::sync::{Arc, RwLock};

use unicode_normalization::UnicodeNormalization;

/// Số mục tối đa đưa vào prompt của một câu (spec §6.5).
pub const MAX_TERMS_PER_SENTENCE: usize = 20;

/// Một cặp thuật ngữ: chữ nguồn và bản dịch mong muốn, như người dùng nhập.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Term {
    pub source: String,
    pub target: String,
}

/// Từ điển dùng chung giữa app và luồng dịch của engine.
pub type SharedGlossary = Arc<RwLock<Glossary>>;

/// Chuẩn hóa để so khớp và để so trùng: NFC, chữ thường, NFC lại (vài chữ hoa đổi sang chữ thường thành chuỗi tổ hợp).
pub fn normalize(text: &str) -> String {
    text.nfc().collect::<String>().to_lowercase().nfc().collect()
}

/// Chữ Trung (Hán), Nhật (kana) và Hàn (Hangul): khớp theo chuỗi con, không xét ranh giới từ.
pub fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{1100}'..='\u{11FF}'      // Hangul Jamo
        | '\u{3005}'..='\u{3007}'    // 々 〆 〇
        | '\u{3040}'..='\u{30FF}'    // Hiragana, Katakana
        | '\u{3130}'..='\u{318F}'    // Hangul Compatibility Jamo
        | '\u{31F0}'..='\u{31FF}'    // Katakana Phonetic Extensions
        | '\u{3400}'..='\u{4DBF}'    // CJK Extension A
        | '\u{4E00}'..='\u{9FFF}'    // CJK Unified Ideographs
        | '\u{A960}'..='\u{A97F}'    // Hangul Jamo Extended-A
        | '\u{AC00}'..='\u{D7FF}'    // Hangul Syllables, Jamo Extended-B
        | '\u{F900}'..='\u{FAFF}'    // CJK Compatibility Ideographs
        | '\u{FF66}'..='\u{FF9F}'    // Katakana nửa độ rộng
        | '\u{20000}'..='\u{323AF}'  // CJK Extension B–H, Compatibility Supplement
    )
}

/// Ký tự làm nên một từ, cho luật ranh giới: chữ hay số, trừ chữ Trung, Nhật, Hàn.
fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() && !is_cjk(c)
}

#[derive(Clone, Debug)]
struct Entry {
    key: String,
    /// Đầu trái, đầu phải của thuật ngữ là ký tự của một từ: phải kiểm ranh giới ở đầu đó.
    bound_left: bool,
    bound_right: bool,
    term: Term,
}

#[derive(Clone, Debug, Default)]
pub struct Glossary {
    /// Xếp theo độ dài khóa giảm dần, cùng độ dài thì theo thứ tự đưa vào.
    entries: Vec<Entry>,
}

impl Glossary {
    /// Bỏ mục có chữ nguồn rỗng sau khi chuẩn hóa; hai mục trùng khóa thì giữ mục đầu.
    pub fn new(terms: impl IntoIterator<Item = Term>) -> Self {
        let mut entries: Vec<Entry> = Vec::new();
        for term in terms {
            let key = normalize(term.source.trim());
            let (Some(first), Some(last)) = (key.chars().next(), key.chars().next_back()) else {
                continue;
            };
            if entries.iter().any(|e| e.key == key) {
                continue;
            }
            entries.push(Entry {
                bound_left: is_word_char(first),
                bound_right: is_word_char(last),
                key,
                term,
            });
        }
        // Sắp ổn định: các mục cùng độ dài giữ thứ tự cũ.
        entries.sort_by_key(|e| std::cmp::Reverse(e.key.chars().count()));
        Self { entries }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Các mục có trong câu `text`, tối đa [`MAX_TERMS_PER_SENTENCE`], mục dài trước.
    pub fn matches(&self, text: &str) -> Vec<Term> {
        if self.entries.is_empty() {
            return Vec::new();
        }
        let hay = normalize(text);
        self.entries
            .iter()
            .filter(|e| occurs(&hay, e))
            .take(MAX_TERMS_PER_SENTENCE)
            .map(|e| e.term.clone())
            .collect()
    }
}

/// `entry.key` có xuất hiện trong `hay` (đã chuẩn hóa), đúng luật ranh giới ở hai đầu.
fn occurs(hay: &str, entry: &Entry) -> bool {
    hay.match_indices(entry.key.as_str()).any(|(i, found)| {
        let before = hay[..i].chars().next_back();
        let after = hay[i + found.len()..].chars().next();
        let left_ok = !entry.bound_left || !before.is_some_and(is_word_char);
        let right_ok = !entry.bound_right || !after.is_some_and(is_word_char);
        left_ok && right_ok
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn term(source: &str, target: &str) -> Term {
        Term {
            source: source.into(),
            target: target.into(),
        }
    }

    fn sources(g: &Glossary, text: &str) -> Vec<String> {
        g.matches(text).into_iter().map(|t| t.source).collect()
    }

    #[test]
    fn latin_terms_match_whole_words_only_and_ignore_case() {
        let g = Glossary::new([term("AI", "trí tuệ nhân tạo"), term("sprint", "đợt chạy")]);
        assert_eq!(sources(&g, "Our ai team said hello."), ["AI"]);
        assert!(
            sources(&g, "She said it was fair.").is_empty(),
            "\"ai\" trong \"said\", \"fair\""
        );
        assert_eq!(sources(&g, "The AI's answer, then the Sprint."), ["sprint", "AI"]);
        assert!(sources(&g, "sprints are long").is_empty());
        assert_eq!(sources(&g, "AI"), ["AI"], "cả câu là thuật ngữ");
    }

    #[test]
    fn vietnamese_with_diacritics_matches_in_any_unicode_form() {
        let g = Glossary::new([term("Đà Nẵng", "Da Nang"), term("họp", "meeting")]);
        // Chữ chép lời ở dạng tổ hợp (NFD): "Đà Nẵng" sau khi tách dấu.
        let nfd: String = "Chúng ta gặp ở ĐÀ NẴNG".nfd().collect();
        assert_ne!(nfd, "Chúng ta gặp ở ĐÀ NẴNG");
        assert_eq!(sources(&g, &nfd), ["Đà Nẵng"]);
        assert_eq!(sources(&g, "Cuộc họp bắt đầu"), ["họp"]);
        assert!(sources(&g, "Cuộc hợp tác").is_empty(), "\"hợp\" khác \"họp\" ở dấu");
        assert!(sources(&g, "hopp").is_empty());
    }

    #[test]
    fn chinese_japanese_korean_terms_match_as_substrings() {
        let g = Glossary::new([
            term("模型", "mô hình"),
            term("会議", "cuộc họp"),
            term("회의", "cuộc họp"),
            term("AI模型", "mô hình AI"),
        ]);
        assert_eq!(sources(&g, "我们需要训练这个模型。"), ["模型"]);
        assert_eq!(sources(&g, "明日の会議は十時からです"), ["会議"]);
        assert_eq!(sources(&g, "내일 회의를 시작합니다"), ["회의"], "trợ từ dính liền");
        assert_eq!(sources(&g, "使用AI模型"), ["AI模型", "模型"]);
        assert!(sources(&g, "使用 MAI模型").contains(&"模型".to_string()));
        assert!(
            !sources(&g, "使用 MAI模型").contains(&"AI模型".to_string()),
            "đầu Latin của AI模型 vẫn xét ranh giới"
        );
    }

    #[test]
    fn latin_terms_next_to_cjk_text_still_match() {
        let g = Glossary::new([term("API", "giao diện lập trình")]);
        assert_eq!(sources(&g, "这个API很好"), ["API"]);
        assert_eq!(sources(&g, "APIを使います"), ["API"]);
    }

    #[test]
    fn edges_that_are_not_letters_need_no_boundary() {
        let g = Glossary::new([term("C++", "C++"), term(".NET", "dot net")]);
        assert_eq!(sources(&g, "We use C++ and ASP.NET"), [".NET", "C++"]);
        assert_eq!(
            sources(&g, "We use C++11"),
            ["C++"],
            "đầu phải là dấu +: không xét ranh giới ở đầu đó"
        );
    }

    #[test]
    fn at_most_twenty_terms_longest_first() {
        let words: Vec<String> = (0..30).map(|i| format!("w{i:02}")).collect();
        let mut terms: Vec<Term> = words.iter().map(|w| term(w, "x")).collect();
        terms.push(term("w05 w06", "cụm"));
        let g = Glossary::new(terms);
        let text = words.join(" ");
        let found = sources(&g, &text);
        assert_eq!(found.len(), MAX_TERMS_PER_SENTENCE);
        assert_eq!(found[0], "w05 w06", "mục dài hơn trước");
        assert_eq!(
            found[1..4],
            ["w00", "w01", "w02"],
            "cùng độ dài thì theo thứ tự từ điển"
        );
    }

    #[test]
    fn duplicates_and_empty_sources_are_dropped() {
        let g = Glossary::new([
            term("API", "một"),
            term("api", "hai"),
            term("  ", "ba"),
            term("", "bốn"),
        ]);
        assert_eq!(g.len(), 1);
        assert_eq!(g.matches("the API").first().map(|t| t.target.as_str()), Some("một"));
        assert!(Glossary::default().matches("anything").is_empty());
        assert!(Glossary::default().is_empty());
    }

    #[test]
    fn normalize_composes_and_lowercases() {
        let nfd: String = "Tiếng Việt".nfd().collect();
        assert_eq!(normalize(&nfd), "tiếng việt");
        assert_eq!(normalize("ÉCOLE"), "école");
        assert!(is_cjk('模') && is_cjk('の') && is_cjk('회') && is_cjk('ｱ') && is_cjk('𠀀'));
        assert!(!is_cjk('a') && !is_cjk('đ') && !is_cjk('。'));
    }
}
