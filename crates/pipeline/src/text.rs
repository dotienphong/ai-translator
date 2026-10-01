//! Chữ chép lời trước khi hiện, ghép câu và dịch (spec §6.4, "Việc cho MVP"): `small` hay ra chữ phồn thể, app đổi sang
//! giản thể cho đoạn tiếng Trung.

use crate::config::FilterConfig;
use ferrous_opencc::OpenCC;
use ferrous_opencc::config::BuiltinConfig;
use std::sync::OnceLock;

/// Bộ đổi phồn thể sang giản thể của OpenCC (bảng Apache-2.0, crate `ferrous-opencc`), dựng một lần.
fn t2s() -> Option<&'static OpenCC> {
    static T2S: OnceLock<Option<OpenCC>> = OnceLock::new();
    T2S.get_or_init(|| match OpenCC::from_config(BuiltinConfig::T2s) {
        Ok(cc) => Some(cc),
        Err(e) => {
            log::error!("không dựng được bộ đổi phồn thể sang giản thể: {e}");
            None
        }
    })
    .as_ref()
}

/// Chữ để hiện, để dịch và để ghép câu. Tiếng Trung được đổi sang giản thể nếu bật `simplify_chinese`; ngôn ngữ khác giữ
/// nguyên. Khoảng trắng ở hai đầu bị cắt.
pub fn display_text(lang: &str, text: &str, cfg: &FilterConfig) -> String {
    let text = text.trim();
    if lang == "zh"
        && cfg.simplify_chinese
        && let Some(cc) = t2s()
    {
        return cc.convert(text);
    }
    text.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn traditional_chinese_becomes_simplified() {
        let cfg = FilterConfig::default();
        assert_eq!(
            display_text("zh", " 我們下週需要完成測試。 ", &cfg),
            "我们下周需要完成测试。"
        );
        assert_eq!(display_text("zh", "这个问题很复杂", &cfg), "这个问题很复杂");
    }

    #[test]
    fn only_chinese_is_converted_and_it_can_be_turned_off() {
        let cfg = FilterConfig::default();
        // Tiếng Nhật dùng kanji giống phồn thể: không được đổi.
        assert_eq!(display_text("ja", "會議を始めます", &cfg), "會議を始めます");
        let off = FilterConfig {
            simplify_chinese: false,
            ..FilterConfig::default()
        };
        assert_eq!(display_text("zh", "我們", &off), "我們");
    }
}
