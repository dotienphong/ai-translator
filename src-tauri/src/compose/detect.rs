//! Nhận diện ngôn ngữ của chữ gõ theo chữ viết (spec 2026-10-17-go-dich §2.2). Câu gõ không qua nhận dạng giọng nói nên
//! không có ngôn ngữ do whisper báo. Kết quả chỉ dùng để: bỏ qua bước dịch khi câu chắc chắn đã là ngôn ngữ đích, chọn mẫu
//! prompt (mẫu tiếng Trung khi có tiếng Trung ở một phía) và ngưỡng "bản dịch quá dài" của cặp ngôn ngữ (§6.5).

use crate::settings::Lang;

/// Kết quả nhận diện.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Detected {
    /// Chắc chắn là ngôn ngữ này.
    Sure(Lang),
    /// Chữ Latin không dấu, số, ký hiệu: có thể là tiếng Anh, cũng có thể là tiếng Việt gõ không dấu.
    Unsure,
}

/// Chữ cái riêng của tiếng Việt (ngoài khối Latin Extended Additional).
const VIETNAMESE_LETTERS: &str = "ăâđêôơưĂÂĐÊÔƠƯ";

/// Nhận diện theo thứ tự: có kana là tiếng Nhật; có Hangul là tiếng Hàn; có chữ Hán (không có kana) là tiếng Trung; có chữ
/// mang dấu đặc trưng tiếng Việt là tiếng Việt; còn lại là không chắc.
///
/// Dấu đặc trưng tiếng Việt: các chữ ă â đ ê ô ơ ư; mọi chữ của khối U+1EA0–U+1EF9 (khối Latin Extended Additional chỉ có chữ
/// tiếng Việt ở đoạn này: chữ mang dấu hỏi, dấu nặng, và mọi chữ mang dấu của ă â ê ô ơ ư); và dấu rời của chuỗi chưa ghép
/// (NFD): dấu hỏi U+0309, dấu nặng U+0323, dấu móc của ơ ư U+031B. Như vậy không cần chuẩn hóa NFD trước khi xét.
pub fn detect(text: &str) -> Detected {
    let (mut kana, mut hangul, mut han, mut vietnamese) = (false, false, false, false);
    for c in text.chars() {
        match u32::from(c) {
            0x3040..=0x30FF | 0x31F0..=0x31FF | 0xFF66..=0xFF9F => kana = true,
            0xAC00..=0xD7A3 | 0x1100..=0x11FF | 0x3130..=0x318F | 0xA960..=0xA97F | 0xD7B0..=0xD7FF => hangul = true,
            0x3400..=0x4DBF | 0x4E00..=0x9FFF | 0xF900..=0xFAFF | 0x20000..=0x2FA1F => han = true,
            0x1EA0..=0x1EF9 | 0x0309 | 0x0323 | 0x031B => vietnamese = true,
            _ if VIETNAMESE_LETTERS.contains(c) => vietnamese = true,
            _ => {}
        }
    }
    if kana {
        Detected::Sure(Lang::Ja)
    } else if hangul {
        Detected::Sure(Lang::Ko)
    } else if han {
        Detected::Sure(Lang::Zh)
    } else if vietnamese {
        Detected::Sure(Lang::Vi)
    } else {
        Detected::Unsure
    }
}

/// Ngôn ngữ nguồn đưa vào `Job.src`: ngôn ngữ đã chắc chắn; không chắc thì `vi` (người Việt hay gõ không dấu), trừ khi
/// đích là `vi` (thì `en`). Câu tiếng Anh gửi đi dịch sang English thì model trả gần như nguyên văn.
pub fn job_source(detected: Detected, target: Lang) -> Lang {
    match detected {
        Detected::Sure(lang) => lang,
        Detected::Unsure if target == Lang::Vi => Lang::En,
        Detected::Unsure => Lang::Vi,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sure(lang: Lang) -> Detected {
        Detected::Sure(lang)
    }

    #[test]
    fn each_script_is_recognized() {
        assert_eq!(detect("Mai mình gửi báo cáo nhé"), sure(Lang::Vi));
        assert_eq!(detect("明日レポートを送ります"), sure(Lang::Ja));
        assert_eq!(detect("내일 보고서를 보낼게요"), sure(Lang::Ko));
        assert_eq!(detect("我明天发报告"), sure(Lang::Zh));
        assert_eq!(detect("I'll send the report tomorrow."), Detected::Unsure);
    }

    #[test]
    fn mixed_text_follows_the_order_of_the_rules() {
        // Tiếng Nhật có cả chữ Hán lẫn kana: tiếng Nhật, không phải tiếng Trung.
        assert_eq!(detect("会議は明日です"), sure(Lang::Ja));
        // Tiếng Việt có tên riêng tiếng Anh: tiếng Việt.
        assert_eq!(detect("Gửi file cho team Marketing nhé"), sure(Lang::Vi));
        // Katakana nửa độ rộng.
        assert_eq!(detect("ﾃｽﾄ"), sure(Lang::Ja));
    }

    #[test]
    fn vietnamese_needs_a_mark_of_its_own() {
        // Không dấu: không chắc (có thể là tiếng Anh).
        assert_eq!(detect("mai minh gui bao cao nhe"), Detected::Unsure);
        // Chỉ có dấu sắc, dấu huyền (có ở nhiều tiếng khác): không chắc.
        assert_eq!(detect("cái bàn"), Detected::Unsure);
        // Một chữ riêng của tiếng Việt là đủ.
        assert_eq!(detect("đi"), sure(Lang::Vi));
        assert_eq!(detect("ĐI"), sure(Lang::Vi));
        assert_eq!(detect("ổn"), sure(Lang::Vi));
        assert_eq!(detect("bạn"), sure(Lang::Vi), "dấu nặng");
        assert_eq!(detect("bản"), sure(Lang::Vi), "dấu hỏi");
        assert_eq!(detect("nghĩ"), Detected::Unsure, "dấu ngã trên i có ở tiếng khác");
        assert_eq!(detect("mẽ"), sure(Lang::Vi), "ẽ nằm trong khối riêng của tiếng Việt");
    }

    #[test]
    fn decomposed_marks_count_without_normalizing() {
        // "bản" và "bạn" viết rời dấu (NFD), "ở" viết rời cả dấu móc lẫn dấu hỏi.
        assert_eq!(detect("ba\u{0309}n"), sure(Lang::Vi));
        assert_eq!(detect("ba\u{0323}n"), sure(Lang::Vi));
        assert_eq!(detect("o\u{031B}\u{0309}"), sure(Lang::Vi));
    }

    #[test]
    fn numbers_symbols_and_empty_text_are_unsure() {
        assert_eq!(detect(""), Detected::Unsure);
        assert_eq!(detect("12:30 :)"), Detected::Unsure);
        assert_eq!(detect("https://example.com/a?b=c"), Detected::Unsure);
    }

    #[test]
    fn the_job_source_falls_back_by_target() {
        assert_eq!(job_source(sure(Lang::Ko), Lang::En), Lang::Ko);
        assert_eq!(job_source(Detected::Unsure, Lang::En), Lang::Vi);
        assert_eq!(job_source(Detected::Unsure, Lang::Ja), Lang::Vi);
        assert_eq!(job_source(Detected::Unsure, Lang::Vi), Lang::En);
    }
}
