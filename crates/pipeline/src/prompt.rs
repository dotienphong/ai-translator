//! Mẫu prompt lấy nguyên văn từ model card của Hy-MT2 (spec §6.5).

use crate::glossary::Term;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lang {
    En,
    Zh,
    Ja,
    Ko,
    Vi,
}

impl Lang {
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "en" => Some(Self::En),
            "zh" => Some(Self::Zh),
            "ja" => Some(Self::Ja),
            "ko" => Some(Self::Ko),
            "vi" => Some(Self::Vi),
            _ => None,
        }
    }

    pub fn code(self) -> &'static str {
        match self {
            Self::En => "en",
            Self::Zh => "zh",
            Self::Ja => "ja",
            Self::Ko => "ko",
            Self::Vi => "vi",
        }
    }

    /// Tên dùng trong mẫu tiếng Anh.
    fn english_name(self) -> &'static str {
        match self {
            Self::En => "English",
            Self::Zh => "Chinese",
            Self::Ja => "Japanese",
            Self::Ko => "Korean",
            Self::Vi => "Vietnamese",
        }
    }

    /// Tên dùng trong mẫu tiếng Trung, giống `run_mt.py` của benchmark 2026-09-29.
    fn chinese_name(self) -> &'static str {
        match self {
            Self::En => "英语",
            Self::Zh => "中文",
            Self::Ja => "日语",
            Self::Ko => "韩语",
            Self::Vi => "越南语",
        }
    }
}

fn uses_chinese_template(src: Lang, tgt: Lang) -> bool {
    src == Lang::Zh || tgt == Lang::Zh
}

/// Mẫu mặc định: có tiếng Trung ở một trong hai phía thì dùng mẫu tiếng Trung.
pub fn translation_prompt(text: &str, src: Lang, tgt: Lang) -> String {
    if uses_chinese_template(src, tgt) {
        format!(
            "将以下文本翻译为{}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}",
            tgt.chinese_name()
        )
    } else {
        format!(
            "Translate the following text into {}. Note that you should only output the translated result \
             without any additional explanation:\n\n{text}",
            tgt.english_name()
        )
    }
}

/// Mẫu "terminology" của model card Hy-MT2 (spec §6.5 "Thuật ngữ"; README của `tencent/Hy-MT2-1.8B`, commit `9a341cd`,
/// mục "Hy-MT2 Translation Task Instruction Examples"): mỗi cặp một dòng, rồi câu lệnh dịch. Chọn mẫu tiếng Trung hay tiếng
/// Anh theo cùng luật với mẫu mặc định. Mẫu tiếng Anh có dòng trống trước câu lệnh và viết "must ONLY", mẫu tiếng Trung
/// không có dòng trống: đúng như model card.
pub fn terminology_prompt(text: &str, terms: &[Term], src: Lang, tgt: Lang) -> String {
    if uses_chinese_template(src, tgt) {
        let mut prompt = String::from("参考下面的翻译：\n");
        for t in terms {
            prompt.push_str(&format!("{} 翻译成 {}\n", t.source, t.target));
        }
        prompt.push_str(&format!(
            "将以下文本翻译为{}，注意只需要输出翻译后的结果，不要额外解释：\n\n{text}",
            tgt.chinese_name()
        ));
        prompt
    } else {
        let mut prompt = String::from("Reference the following translations:\n");
        for t in terms {
            prompt.push_str(&format!("{} translates to {}\n", t.source, t.target));
        }
        prompt.push_str(&format!(
            "\nTranslate the following text into {}. Note that you must ONLY output the translated result without any \
             additional explanation:\n\n{text}",
            tgt.english_name()
        ));
        prompt
    }
}

/// Mẫu "background information" của model card, dùng cho cờ thử nghiệm ngữ cảnh câu trước (spec §6.5).
pub fn context_prompt(text: &str, context: &str, src: Lang, tgt: Lang) -> String {
    if uses_chinese_template(src, tgt) {
        format!(
            "【背景信息】\n{context}\n\n请结合背景信息将以下文本翻译为{}。\n\n【待翻译文本】\n{text}",
            tgt.chinese_name()
        )
    } else {
        format!(
            "[Background Information]\n{context}\n\nPlease translate the following text into {}, taking the \
             provided background information into consideration.\n\n[Source Text]\n{text}",
            tgt.english_name()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_template_for_non_chinese_pairs() {
        assert_eq!(
            translation_prompt("Hello", Lang::En, Lang::Vi),
            "Translate the following text into Vietnamese. Note that you should only output the translated \
             result without any additional explanation:\n\nHello"
        );
    }

    #[test]
    fn chinese_template_when_source_is_chinese() {
        assert_eq!(
            translation_prompt("你好", Lang::Zh, Lang::Vi),
            "将以下文本翻译为越南语，注意只需要输出翻译后的结果，不要额外解释：\n\n你好"
        );
    }

    #[test]
    fn chinese_template_when_target_is_chinese() {
        assert!(translation_prompt("Xin chào", Lang::Vi, Lang::Zh).starts_with("将以下文本翻译为中文，"));
    }

    #[test]
    fn context_template_english() {
        let p = context_prompt("B", "A", Lang::Ja, Lang::Vi);
        assert!(p.starts_with("[Background Information]\nA\n\nPlease translate the following text into Vietnamese,"));
        assert!(p.ends_with("[Source Text]\nB"));
    }

    fn terms() -> Vec<Term> {
        vec![
            Term {
                source: "sprint".into(),
                target: "đợt chạy".into(),
            },
            Term {
                source: "API".into(),
                target: "giao diện lập trình".into(),
            },
        ]
    }

    #[test]
    fn terminology_template_english() {
        assert_eq!(
            terminology_prompt("The sprint API", &terms(), Lang::En, Lang::Vi),
            "Reference the following translations:\nsprint translates to đợt chạy\nAPI translates to giao diện lập trình\n\n\
             Translate the following text into Vietnamese. Note that you must ONLY output the translated result without \
             any additional explanation:\n\nThe sprint API"
        );
    }

    #[test]
    fn terminology_template_chinese() {
        assert_eq!(
            terminology_prompt("这个API", &terms()[1..], Lang::Zh, Lang::Vi),
            "参考下面的翻译：\nAPI 翻译成 giao diện lập trình\n将以下文本翻译为越南语，注意只需要输出翻译后的结果，不要额外解释：\n\n这个API"
        );
    }

    #[test]
    fn lang_codes_roundtrip() {
        for code in ["en", "zh", "ja", "ko", "vi"] {
            assert_eq!(Lang::from_code(code).unwrap().code(), code);
        }
        assert!(Lang::from_code("fr").is_none());
    }
}
