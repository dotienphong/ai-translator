//! Mẫu prompt ghi chú. Mẫu nhúng bằng `include_str!`; chỗ trống `{language}`, `{transcript}`, `{parts}` thay bằng
//! `str::replace` (không dùng `format!`: mẫu có ngoặc nhọn của JSON).

use crate::settings::NotesTemplate;

const MAP_MEETING: &str = include_str!("prompts/map.txt");
const MAP_LECTURE: &str = include_str!("prompts/map_lecture.txt");
const MAP_BRIEF: &str = include_str!("prompts/map_brief.txt");
const REDUCE: &str = include_str!("prompts/reduce.txt");

/// Lời nhắc gửi lại khi câu trả lời trước không phải JSON đúng hình.
pub const FIX: &str = include_str!("prompts/fix.txt");

/// Tên ngôn ngữ (tiếng Anh) để ghi vào prompt; mã lạ thì tiếng Anh.
pub fn language_name(code: &str) -> &'static str {
    match code {
        "vi" => "Vietnamese",
        "en" => "English",
        "zh" => "Chinese",
        "ja" => "Japanese",
        "ko" => "Korean",
        _ => "English",
    }
}

/// Prompt của một đoạn (giai đoạn map). `{language}` thay trước, `{transcript}` thay sau cùng để chữ của bản chép
/// lời có chứa đúng chuỗi `{language}` cũng không bị thay lần nữa.
pub fn map(template: NotesTemplate, language: &str, transcript: &str) -> String {
    let base = match template {
        NotesTemplate::Meeting => MAP_MEETING,
        NotesTemplate::Lecture => MAP_LECTURE,
        NotesTemplate::Brief => MAP_BRIEF,
    };
    base.replace("{language}", language_name(language))
        .replace("{transcript}", transcript)
}

/// Prompt gộp các bản thành phần (giai đoạn reduce); `parts` là mỗi bản một dòng JSON.
pub fn reduce(language: &str, parts: &str) -> String {
    REDUCE
        .replace("{language}", language_name(language))
        .replace("{parts}", parts)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    #[test]
    fn language_names() {
        let got: Vec<_> = ["vi", "en", "zh", "ja", "ko", "fr", ""]
            .iter()
            .map(|c| language_name(c))
            .collect();
        assert_eq!(
            got,
            [
                "Vietnamese",
                "English",
                "Chinese",
                "Japanese",
                "Korean",
                "English",
                "English"
            ]
        );
    }

    #[test]
    fn map_fills_language_and_transcript() {
        let p = map(NotesTemplate::Meeting, "vi", "T");
        assert!(p.contains("Write the notes in Vietnamese"));
        assert!(p.ends_with("Transcript:\nT\n"));
        for t in [NotesTemplate::Meeting, NotesTemplate::Lecture, NotesTemplate::Brief] {
            let p = map(t, "ja", "[1] hello");
            assert!(!p.contains("{language}") && !p.contains("{transcript}"), "{t:?}");
            assert!(p.contains("Japanese") && p.contains("[1] hello"), "{t:?}");
        }
        assert!(map(NotesTemplate::Lecture, "en", "T").starts_with("You write study notes"));
        assert!(map(NotesTemplate::Brief, "en", "T").contains("\"open_questions\": always []."));
    }

    #[test]
    fn transcript_text_is_not_substituted_again() {
        let p = map(NotesTemplate::Meeting, "vi", "[1] say {language} and {transcript}");
        assert!(p.contains("[1] say {language} and {transcript}"));
    }

    #[test]
    fn reduce_fills_language_and_parts() {
        let p = reduce("en", "{\"a\":1}\n{\"b\":2}");
        assert!(!p.contains("{language}") && !p.contains("{parts}"));
        assert!(p.contains("Write in English.") && p.ends_with("Parts:\n{\"a\":1}\n{\"b\":2}\n"));
    }

    #[test]
    fn fix_is_nonempty() {
        assert!(FIX.starts_with("Your reply was not a valid JSON object"));
    }
}
