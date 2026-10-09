//! Chuỗi phía Rust (spec §4.5): menu khay, chú thích icon khay, tiêu đề cửa sổ, chữ trong file xuất bản chép lời.
//! Giao diện React có từ điển riêng ở `src/i18n/`. MVP không dùng thông báo hệ thống (Q13):
//! lỗi và lời nhắc hiện ngay trong app (cửa sổ chính, menu khay, thanh phụ đề).
//!
//! Mỗi ngôn ngữ là một hằng `Strings`: thiếu trường nào thì không biên dịch được.

use crate::settings::UiLanguage;

#[derive(Debug)]
pub struct Strings {
    pub tray_start: &'static str,
    pub tray_stop: &'static str,
    pub tray_show_overlay: &'static str,
    pub tray_hide_overlay: &'static str,
    pub tray_lock_overlay: &'static str,
    pub tray_unlock_overlay: &'static str,
    pub tray_open_main: &'static str,
    pub tray_quit: &'static str,
    /// Có bản cập nhật đã tải và app rảnh (kế hoạch 07b).
    pub tray_restart_to_update: &'static str,
    /// Kiểm tra cập nhật ngay: mở Cài đặt › Chung, nơi hiện kết quả.
    pub tray_check_updates: &'static str,
    /// Dòng báo trong menu khay khi có phím tắt không đăng ký được.
    pub tray_hotkey_failed: &'static str,
    /// Chú thích icon khay: `{app}` là tên app, `{status}` là trạng thái.
    pub tray_tooltip: &'static str,
    pub status_idle: &'static str,
    pub status_running: &'static str,
    pub overlay_title: &'static str,
    /// File xuất bản chép lời (`transcript/export.rs`): tiêu đề, tên cột, đoạn bị bỏ, câu dịch lỗi.
    pub export_title: &'static str,
    pub export_time: &'static str,
    pub export_source: &'static str,
    pub export_translation: &'static str,
    pub export_dropped: &'static str,
    pub export_failed: &'static str,
}

pub const EN: Strings = Strings {
    tray_start: "Start translating",
    tray_stop: "Stop translating",
    tray_show_overlay: "Show subtitles",
    tray_hide_overlay: "Hide subtitles",
    tray_lock_overlay: "Lock subtitles (click-through)",
    tray_unlock_overlay: "Unlock subtitles",
    tray_open_main: "Open main window",
    tray_quit: "Quit",
    tray_restart_to_update: "Restart to update",
    tray_check_updates: "Check for updates…",
    tray_hotkey_failed: "Some shortcuts could not be registered",
    tray_tooltip: "{app}: {status}",
    status_idle: "Ready",
    status_running: "Translating",
    overlay_title: "Subtitles",
    export_title: "Transcript",
    export_time: "Time",
    export_source: "Original",
    export_translation: "Translation",
    export_dropped: "[segment skipped]",
    export_failed: "(not translated)",
};

pub const VI: Strings = Strings {
    tray_start: "Bắt đầu dịch",
    tray_stop: "Dừng dịch",
    tray_show_overlay: "Hiện phụ đề",
    tray_hide_overlay: "Ẩn phụ đề",
    tray_lock_overlay: "Khóa phụ đề (click xuyên qua)",
    tray_unlock_overlay: "Mở khóa phụ đề",
    tray_open_main: "Mở cửa sổ chính",
    tray_quit: "Thoát",
    tray_restart_to_update: "Khởi động lại để cập nhật",
    tray_check_updates: "Kiểm tra cập nhật…",
    tray_hotkey_failed: "Có phím tắt không đăng ký được",
    tray_tooltip: "{app}: {status}",
    status_idle: "Sẵn sàng",
    status_running: "Đang dịch",
    overlay_title: "Phụ đề",
    export_title: "Bản chép lời",
    export_time: "Giờ",
    export_source: "Câu gốc",
    export_translation: "Bản dịch",
    export_dropped: "[bỏ qua đoạn]",
    export_failed: "(chưa dịch được)",
};

impl Strings {
    /// Mọi chuỗi, để test. Liệt kê đủ trường, không dùng `..`, nên thêm trường mà quên ở đây thì
    /// không biên dịch được.
    pub fn all(&self) -> Vec<(&'static str, &'static str)> {
        let Strings {
            tray_start,
            tray_stop,
            tray_show_overlay,
            tray_hide_overlay,
            tray_lock_overlay,
            tray_unlock_overlay,
            tray_open_main,
            tray_quit,
            tray_restart_to_update,
            tray_check_updates,
            tray_hotkey_failed,
            tray_tooltip,
            status_idle,
            status_running,
            overlay_title,
            export_title,
            export_time,
            export_source,
            export_translation,
            export_dropped,
            export_failed,
        } = *self;
        vec![
            ("tray_start", tray_start),
            ("tray_stop", tray_stop),
            ("tray_show_overlay", tray_show_overlay),
            ("tray_hide_overlay", tray_hide_overlay),
            ("tray_lock_overlay", tray_lock_overlay),
            ("tray_unlock_overlay", tray_unlock_overlay),
            ("tray_open_main", tray_open_main),
            ("tray_quit", tray_quit),
            ("tray_restart_to_update", tray_restart_to_update),
            ("tray_check_updates", tray_check_updates),
            ("tray_hotkey_failed", tray_hotkey_failed),
            ("tray_tooltip", tray_tooltip),
            ("status_idle", status_idle),
            ("status_running", status_running),
            ("overlay_title", overlay_title),
            ("export_title", export_title),
            ("export_time", export_time),
            ("export_source", export_source),
            ("export_translation", export_translation),
            ("export_dropped", export_dropped),
            ("export_failed", export_failed),
        ]
    }

    pub fn tooltip(&self, app: &str, running: bool) -> String {
        let status = if running { self.status_running } else { self.status_idle };
        self.tray_tooltip.replace("{app}", app).replace("{status}", status)
    }
}

pub fn strings(lang: UiLanguage) -> &'static Strings {
    match lang {
        UiLanguage::En => &EN,
        UiLanguage::Vi => &VI,
    }
}

/// Ngôn ngữ giao diện mặc định theo locale của hệ điều hành (§4.1, bước 1):
/// tiếng Việt nếu locale là tiếng Việt, còn lại là English.
pub fn ui_language_from_locale(locale: Option<&str>) -> UiLanguage {
    let primary = locale.and_then(|l| l.split(['-', '_']).next()).unwrap_or("");
    if primary.eq_ignore_ascii_case("vi") {
        UiLanguage::Vi
    } else {
        UiLanguage::En
    }
}

pub fn system_ui_language() -> UiLanguage {
    ui_language_from_locale(sys_locale::get_locale().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholders(s: &str) -> Vec<&str> {
        s.match_indices('{')
            .filter_map(|(i, _)| s[i..].find('}').map(|j| &s[i..=i + j]))
            .collect()
    }

    #[test]
    fn every_string_is_filled_in_both_languages() {
        for (name, text) in EN.all().into_iter().chain(VI.all()) {
            assert!(!text.trim().is_empty(), "{name} rỗng");
            assert_eq!(text, text.trim(), "{name} thừa khoảng trắng");
        }
    }

    #[test]
    fn placeholders_match_between_languages() {
        for ((name, en), (_, vi)) in EN.all().into_iter().zip(VI.all()) {
            assert_eq!(placeholders(en), placeholders(vi), "{name}");
        }
    }

    #[test]
    fn vietnamese_is_actually_translated() {
        let same: Vec<_> = EN
            .all()
            .into_iter()
            .zip(VI.all())
            .filter(|((_, en), (_, vi))| en == vi)
            .map(|((n, _), _)| n)
            .collect();
        assert_eq!(same, ["tray_tooltip"], "chỉ mẫu chú thích là giống nhau");
    }

    #[test]
    fn tooltip_fills_app_name_and_status() {
        assert_eq!(VI.tooltip("AI Translator", false), "AI Translator: Sẵn sàng");
        assert_eq!(EN.tooltip("AI Translator", true), "AI Translator: Translating");
    }

    #[test]
    fn default_ui_language_from_os_locale() {
        assert_eq!(ui_language_from_locale(Some("vi-VN")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("vi_VN")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("vi")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("VI-vn")), UiLanguage::Vi);
        assert_eq!(ui_language_from_locale(Some("en-US")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(Some("fr-FR")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(Some("video")), UiLanguage::En);
        assert_eq!(ui_language_from_locale(None), UiLanguage::En);
    }
}
