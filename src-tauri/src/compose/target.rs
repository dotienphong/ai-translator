//! Ngôn ngữ đích của Gõ dịch (spec 2026-10-17-go-dich §2.1).

use crate::settings::{Lang, Settings};

/// "Tiếng người bên kia", tính từ cài đặt phụ đề. Phụ đề dịch lời người khác sang tiếng của người dùng, nên ngôn ngữ nguồn
/// của phụ đề là tiếng người bên kia:
/// 1. Lấy tập ngôn ngữ nguồn của phụ đề (`{lock}` nếu đang khóa, không thì `sources`), bỏ ngôn ngữ đích của phụ đề. Còn
///    đúng một ngôn ngữ thì dịch sang ngôn ngữ đó.
/// 2. Không thì English; riêng khi phụ đề đang dịch sang English thì Tiếng Việt.
pub fn auto_target(subtitle_target: Lang, sources: &[Lang], lock: Option<Lang>) -> Lang {
    let candidates = match lock {
        Some(lang) => vec![lang],
        None => sources.to_vec(),
    };
    let others: Vec<Lang> = candidates.into_iter().filter(|l| *l != subtitle_target).collect();
    match others.as_slice() {
        [only] => *only,
        _ if subtitle_target == Lang::En => Lang::Vi,
        _ => Lang::En,
    }
}

/// Ngôn ngữ đích đang dùng: ngôn ngữ người dùng đã chọn riêng, hay [`auto_target`] khi là "Tự động".
pub fn resolve(settings: &Settings) -> Lang {
    settings.compose.target.lang().unwrap_or_else(|| {
        auto_target(
            settings.target_language,
            &settings.source_languages,
            settings.source_lock,
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{ComposeTarget, UiLanguage};

    const ALL: &[Lang] = &Lang::ALL;

    #[test]
    fn the_other_side_speaks_english_unless_the_subtitles_say_otherwise() {
        // Người dùng Việt, phụ đề tự nhận cả năm tiếng: không biết người bên kia nói gì, nên English.
        assert_eq!(auto_target(Lang::Vi, ALL, None), Lang::En);
        // Khóa nguồn tiếng Nhật: người bên kia nói tiếng Nhật.
        assert_eq!(auto_target(Lang::Vi, ALL, Some(Lang::Ja)), Lang::Ja);
        // Tập nguồn bỏ ngôn ngữ đích còn đúng một ngôn ngữ: ngôn ngữ đó.
        assert_eq!(auto_target(Lang::Vi, &[Lang::Vi, Lang::Ko], None), Lang::Ko);
        assert_eq!(auto_target(Lang::Vi, &[Lang::Zh], None), Lang::Zh);
        // Còn hai ngôn ngữ trở lên: English.
        assert_eq!(auto_target(Lang::Vi, &[Lang::En, Lang::Ja], None), Lang::En);
        // Khóa đúng ngôn ngữ đích của phụ đề: không có tiếng nào khác, nên theo luật 2.
        assert_eq!(auto_target(Lang::Vi, ALL, Some(Lang::Vi)), Lang::En);
    }

    #[test]
    fn subtitles_into_english_mean_the_other_side_is_vietnamese() {
        assert_eq!(auto_target(Lang::En, ALL, None), Lang::Vi);
        assert_eq!(auto_target(Lang::En, &[Lang::En, Lang::Ja, Lang::Vi], None), Lang::Vi);
        assert_eq!(auto_target(Lang::En, ALL, Some(Lang::Zh)), Lang::Zh);
        assert_eq!(auto_target(Lang::Ja, ALL, None), Lang::En);
    }

    #[test]
    fn a_chosen_target_wins_over_the_subtitle_settings() {
        let mut s = Settings::defaults(UiLanguage::Vi);
        assert_eq!(resolve(&s), Lang::En, "mặc định: Tự động");
        s.source_lock = Some(Lang::Ko);
        assert_eq!(resolve(&s), Lang::Ko, "Tự động đi theo phụ đề");
        s.compose.target = ComposeTarget::Ja;
        assert_eq!(resolve(&s), Lang::Ja, "đã chọn riêng thì thôi đi theo phụ đề");
    }
}
