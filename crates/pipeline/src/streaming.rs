//! Luật thuần của chế độ dịch trong lúc người nói chưa dừng (spec 2026-10-10 §3–§5; H4 của kế hoạch 00): đơn vị và khóa
//! so khớp, chốt dần bằng LocalAgreement (`Stabilizer`), nhịp và tự tắt (`Cadence`), lịch chép từng phần
//! (`PartialScheduler`). Không có luồng, khóa hay giờ thật: luồng VAD và luồng phụ đề của `engine` gọi vào đây.

use crate::glossary::normalize;
use crate::sentence::SENTENCE_END;
use unicode_normalization::UnicodeNormalization;

/// Một đơn vị hiển thị (từ, hay chữ với zh/ja) và khóa so khớp (NFC, chữ thường, bỏ dấu câu) — spec §3.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Unit {
    pub text: String,
    pub key: String,
}

/// Tiếng Trung và tiếng Nhật: mỗi chữ (ký tự không phải khoảng trắng) là một đơn vị, nối không có dấu cách (spec §3).
pub fn uses_char_units(lang: &str) -> bool {
    matches!(lang, "zh" | "ja")
}

/// Chỗ nối hai đơn vị: không có gì với zh/ja, một dấu cách với tiếng khác.
fn separator(lang: &str) -> &'static str {
    if uses_char_units(lang) { "" } else { " " }
}

/// Khóa so khớp: NFC, chữ thường, chỉ giữ chữ và số (bỏ dấu câu và ký hiệu), như `units` của `latency-bench`.
fn key_of(text: &str) -> String {
    normalize(text).chars().filter(|c| c.is_alphanumeric()).collect()
}

/// Mọi đơn vị trả về đều có `key` khác rỗng: phần chỉ gồm dấu câu (ký tự loại P, hay token như "—", "…") không thành
/// đơn vị riêng mà gắn vào `text` của đơn vị đứng trước; nếu ở đầu chuỗi thì gắn vào đơn vị đứng sau. Chuỗi không có
/// đơn vị nào có key thì trả rỗng. Nhờ vậy "你好，世界" và "你好世界" có cùng dãy key [你,好,世,界].
///
/// `text` của đơn vị ở dạng NFC (dấu tiếng Việt tổ hợp thành chữ dựng sẵn), giữ hoa thường và dấu câu để hiện. Với tiếng
/// Trung, tiếng Nhật, khoảng trắng bị bỏ (đơn vị nối không có dấu cách); với tiếng khác, dấu câu gắn vào đơn vị bên cạnh
/// kèm một dấu cách, nên `join_units` trả lại đúng chuỗi đã gộp khoảng trắng.
pub fn split_units(text: &str, lang: &str) -> Vec<Unit> {
    let text: String = text.nfc().collect();
    let sep = separator(lang);
    let pieces: Vec<String> = if uses_char_units(lang) {
        text.chars().filter(|c| !c.is_whitespace()).map(String::from).collect()
    } else {
        text.split_whitespace().map(String::from).collect()
    };
    let mut units: Vec<Unit> = Vec::new();
    // Dấu câu đứng trước đơn vị có khóa đầu tiên: gắn vào đơn vị đó.
    let mut lead = String::new();
    for piece in pieces {
        let key = key_of(&piece);
        if !key.is_empty() {
            units.push(Unit {
                text: format!("{lead}{piece}"),
                key,
            });
            lead.clear();
        } else if let Some(prev) = units.last_mut() {
            prev.text.push_str(sep);
            prev.text.push_str(&piece);
        } else {
            lead.push_str(&piece);
            lead.push_str(sep);
        }
    }
    units
}

/// Nối các đơn vị để hiện: không có gì với zh/ja, một dấu cách với tiếng khác.
pub fn join_units(units: &[Unit], lang: &str) -> String {
    units
        .iter()
        .map(|u| u.text.as_str())
        .collect::<Vec<_>>()
        .join(separator(lang))
}

/// Bỏ một dấu kết câu ở cuối (. ? ! 。 ？ ！) và khoảng trắng sau nó (spec §4.3): bản dịch tạm chưa phải câu xong. Kết quả
/// không có khoảng trắng cuối.
pub fn strip_terminal_punct(text: &str) -> &str {
    let text = text.trim_end();
    match text.strip_suffix(SENTENCE_END) {
        Some(rest) => rest.trim_end(),
        None => text,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.key.as_str()).collect()
    }

    fn texts(units: &[Unit]) -> Vec<&str> {
        units.iter().map(|u| u.text.as_str()).collect()
    }

    /// Đơn vị (spec §3): một từ với tiếng có dấu cách, một chữ với tiếng Trung và tiếng Nhật.
    #[test]
    fn words_and_cjk_characters_are_units() {
        let en = split_units("So, we went HOME!", "en");
        assert_eq!(keys(&en), ["so", "we", "went", "home"]);
        assert_eq!(texts(&en), ["So,", "we", "went", "HOME!"]);
        assert_eq!(keys(&split_units("안녕 하세요", "ko")), ["안녕", "하세요"]);
        let ja = split_units("こんにちは 世界", "ja");
        assert_eq!(ja.len(), 7);
        assert_eq!(join_units(&ja, "ja"), "こんにちは世界");
        assert!(uses_char_units("zh") && uses_char_units("ja"));
        assert!(!uses_char_units("ko") && !uses_char_units("vi") && !uses_char_units("en"));
    }

    /// Dấu tiếng Việt viết tổ hợp cho cùng khóa và cùng chữ hiện (NFC) với chữ dựng sẵn.
    #[test]
    fn vietnamese_diacritics_are_normalized() {
        let composed = split_units("Việt Nam", "vi");
        let decomposed = split_units("Vie\u{0302}\u{0323}t Nam", "vi");
        assert_eq!(composed, decomposed);
        assert_eq!(keys(&composed), ["việt", "nam"]);
        assert_eq!(texts(&decomposed)[0], "Việt");
    }

    /// Dấu câu không thành đơn vị riêng: gắn vào đơn vị đứng trước, hay đứng sau nếu ở đầu chuỗi (H4). Nhờ vậy câu có và
    /// không có dấu phẩy cho cùng dãy khóa.
    #[test]
    fn punctuation_attaches_to_a_neighbour() {
        let zh = split_units("你好，世界。", "zh");
        assert_eq!(keys(&zh), ["你", "好", "世", "界"]);
        assert_eq!(texts(&zh), ["你", "好，", "世", "界。"]);
        assert_eq!(join_units(&zh, "zh"), "你好，世界。");
        assert_eq!(keys(&split_units("你好世界", "zh")), keys(&zh));
        assert_eq!(texts(&split_units("「はい」", "ja")), ["「は", "い」"]);
        let en = split_units("— Hello — world …", "en");
        assert_eq!(texts(&en), ["— Hello —", "world …"]);
        assert_eq!(join_units(&en, "en"), "— Hello — world …");
        assert!(split_units(" … !! ", "en").is_empty());
        assert!(split_units("。、", "ja").is_empty());
        assert!(split_units("", "vi").is_empty());
    }

    /// Dấu kết câu ở cuối bản dịch tạm không hiện (spec §4.3): bỏ đúng một dấu, và khoảng trắng hai bên nó.
    #[test]
    fn terminal_punctuation_is_stripped_once() {
        assert_eq!(strip_terminal_punct("Xin chào."), "Xin chào");
        assert_eq!(strip_terminal_punct("Xong rồi!  "), "Xong rồi");
        assert_eq!(strip_terminal_punct("你好。"), "你好");
        assert_eq!(strip_terminal_punct("本当？"), "本当");
        assert_eq!(strip_terminal_punct("What?!"), "What?");
        assert_eq!(strip_terminal_punct("chúng tôi ."), "chúng tôi");
        assert_eq!(strip_terminal_punct("Mr. Smith"), "Mr. Smith");
        assert_eq!(strip_terminal_punct("còn tiếp,"), "còn tiếp,");
        assert_eq!(strip_terminal_punct("chào "), "chào");
        assert_eq!(strip_terminal_punct(""), "");
    }
}
