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
    /// Mở ô soạn Gõ dịch; chỉ hiện khi Gõ dịch đang bật (spec 2026-10-20-tray-menu-shortcuts §2).
    pub tray_compose: &'static str,
    pub tray_open_main: &'static str,
    pub tray_quit: &'static str,
    /// Có bản cập nhật đã tải và app rảnh (kế hoạch 07b).
    pub tray_restart_to_update: &'static str,
    /// Gói model đang dùng có bản mới và app rảnh (spec 2026-10-23-cap-nhat-model-tu-dong §6.1): mở cửa sổ chính ở Home.
    pub tray_model_update: &'static str,
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
    /// Nhãn tự động của một giọng chưa có tên (spec 2026-10-26-phan-biet-nguoi-noi §9): `{n}` là thứ tự xuất hiện trong phiên.
    pub speaker_voice: &'static str,
    /// Một tên khớp nhiều giọng (máy chung phòng họp, spec 2026-10-26-phan-biet-nguoi-noi §6.6): `{name}` là tên, `{k}` thứ tự giọng.
    pub speaker_room_voice: &'static str,
}

pub const EN: Strings = Strings {
    tray_start: "Start translating",
    tray_stop: "Stop translating",
    tray_show_overlay: "Show subtitles",
    tray_hide_overlay: "Hide subtitles",
    tray_lock_overlay: "Lock subtitles (click-through)",
    tray_unlock_overlay: "Unlock subtitles",
    tray_compose: "Open Type & Translate",
    tray_open_main: "Open main window",
    tray_quit: "Quit",
    tray_restart_to_update: "Restart to update",
    tray_model_update: "Model pack update available",
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
    speaker_voice: "Speaker {n}",
    speaker_room_voice: "{name} · voice {k}",
};

pub const VI: Strings = Strings {
    tray_start: "Bắt đầu dịch",
    tray_stop: "Dừng dịch",
    tray_show_overlay: "Hiện phụ đề",
    tray_hide_overlay: "Ẩn phụ đề",
    tray_lock_overlay: "Khóa phụ đề (click xuyên qua)",
    tray_unlock_overlay: "Mở khóa phụ đề",
    tray_compose: "Mở Gõ dịch",
    tray_open_main: "Mở cửa sổ chính",
    tray_quit: "Thoát",
    tray_restart_to_update: "Khởi động lại để cập nhật",
    tray_model_update: "Có bản cập nhật gói model",
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
    speaker_voice: "Người {n}",
    speaker_room_voice: "{name} · giọng {k}",
};

pub const JA: Strings = Strings {
    tray_start: "翻訳を開始",
    tray_stop: "翻訳を停止",
    tray_show_overlay: "字幕を表示",
    tray_hide_overlay: "字幕を非表示",
    tray_lock_overlay: "字幕をロック（クリックを通過）",
    tray_unlock_overlay: "字幕のロックを解除",
    tray_compose: "入力翻訳を開く",
    tray_open_main: "メインウィンドウを開く",
    tray_quit: "終了",
    tray_restart_to_update: "再起動して更新",
    tray_model_update: "モデルパックの更新があります",
    tray_check_updates: "アップデートを確認…",
    tray_hotkey_failed: "登録できなかったショートカットがあります",
    tray_tooltip: "{app}: {status}",
    status_idle: "待機中",
    status_running: "翻訳中",
    overlay_title: "字幕",
    export_title: "文字起こし",
    export_time: "時刻",
    export_source: "原文",
    export_translation: "翻訳",
    export_dropped: "[区間をスキップ]",
    export_failed: "（未翻訳）",
    speaker_voice: "話者{n}",
    speaker_room_voice: "{name} · 声{k}",
};

pub const ZH: Strings = Strings {
    tray_start: "开始翻译",
    tray_stop: "停止翻译",
    tray_show_overlay: "显示字幕",
    tray_hide_overlay: "隐藏字幕",
    tray_lock_overlay: "锁定字幕（点击穿透）",
    tray_unlock_overlay: "解锁字幕",
    tray_compose: "打开输入翻译",
    tray_open_main: "打开主窗口",
    tray_quit: "退出",
    tray_restart_to_update: "重启以更新",
    tray_model_update: "模型包有可用更新",
    tray_check_updates: "检查更新…",
    tray_hotkey_failed: "有快捷键未能注册",
    tray_tooltip: "{app}: {status}",
    status_idle: "就绪",
    status_running: "翻译中",
    overlay_title: "字幕",
    export_title: "转写记录",
    export_time: "时间",
    export_source: "原文",
    export_translation: "翻译",
    export_dropped: "[已跳过片段]",
    export_failed: "（未翻译）",
    speaker_voice: "说话人{n}",
    speaker_room_voice: "{name} · 声音{k}",
};

pub const KO: Strings = Strings {
    tray_start: "번역 시작",
    tray_stop: "번역 중지",
    tray_show_overlay: "자막 표시",
    tray_hide_overlay: "자막 숨기기",
    tray_lock_overlay: "자막 잠금(클릭 통과)",
    tray_unlock_overlay: "자막 잠금 해제",
    tray_compose: "입력 번역 열기",
    tray_open_main: "메인 창 열기",
    tray_quit: "종료",
    tray_restart_to_update: "다시 시작하여 업데이트",
    tray_model_update: "모델 팩 업데이트가 있습니다",
    tray_check_updates: "업데이트 확인…",
    tray_hotkey_failed: "등록하지 못한 단축키가 있습니다",
    tray_tooltip: "{app}: {status}",
    status_idle: "준비됨",
    status_running: "번역 중",
    overlay_title: "자막",
    export_title: "대본",
    export_time: "시간",
    export_source: "원문",
    export_translation: "번역",
    export_dropped: "[구간 건너뜀]",
    export_failed: "(번역 안 됨)",
    speaker_voice: "화자 {n}",
    speaker_room_voice: "{name} · 목소리 {k}",
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
            tray_compose,
            tray_open_main,
            tray_quit,
            tray_restart_to_update,
            tray_model_update,
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
            speaker_voice,
            speaker_room_voice,
        } = *self;
        vec![
            ("tray_start", tray_start),
            ("tray_stop", tray_stop),
            ("tray_show_overlay", tray_show_overlay),
            ("tray_hide_overlay", tray_hide_overlay),
            ("tray_lock_overlay", tray_lock_overlay),
            ("tray_unlock_overlay", tray_unlock_overlay),
            ("tray_compose", tray_compose),
            ("tray_open_main", tray_open_main),
            ("tray_quit", tray_quit),
            ("tray_restart_to_update", tray_restart_to_update),
            ("tray_model_update", tray_model_update),
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
            ("speaker_voice", speaker_voice),
            ("speaker_room_voice", speaker_room_voice),
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
        UiLanguage::Ja => &JA,
        UiLanguage::Zh => &ZH,
        UiLanguage::Ko => &KO,
    }
}

/// Ngôn ngữ giao diện mặc định theo locale của hệ điều hành (§4.1, bước 1), xét phần ngôn ngữ chính của locale:
/// `vi`, `ja`, `ko` ra đúng ngôn ngữ đó; mọi locale tiếng Trung (`zh-CN`, `zh-Hant-TW`, …) ra `zh`, giao diện chữ giản
/// thể (spec 2026-10-12 Q1), cùng `yue` (macOS báo `yue-Hant-HK` cho tiếng Quảng Đông); còn lại là English.
/// `detectUiLanguage` ở `src/i18n/index.ts` dùng cùng bảng.
pub fn ui_language_from_locale(locale: Option<&str>) -> UiLanguage {
    let primary = locale.and_then(|l| l.split(['-', '_']).next()).unwrap_or("");
    match primary.to_ascii_lowercase().as_str() {
        "vi" => UiLanguage::Vi,
        "ja" => UiLanguage::Ja,
        "ko" => UiLanguage::Ko,
        "zh" | "yue" => UiLanguage::Zh,
        _ => UiLanguage::En,
    }
}

pub fn system_ui_language() -> UiLanguage {
    ui_language_from_locale(sys_locale::get_locale().as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LANGUAGES: [(&str, &Strings); 5] = [("en", &EN), ("vi", &VI), ("ja", &JA), ("zh", &ZH), ("ko", &KO)];

    fn placeholders(s: &str) -> Vec<&str> {
        s.match_indices('{')
            .filter_map(|(i, _)| s[i..].find('}').map(|j| &s[i..=i + j]))
            .collect()
    }

    fn is_kana(c: char) -> bool {
        ('\u{3040}'..='\u{30ff}').contains(&c)
    }

    fn is_han(c: char) -> bool {
        ('\u{3400}'..='\u{9fff}').contains(&c)
    }

    fn is_hangul(c: char) -> bool {
        ('\u{ac00}'..='\u{d7af}').contains(&c)
    }

    #[test]
    fn every_string_is_filled_in_every_language() {
        for (lang, strings) in LANGUAGES {
            for (name, text) in strings.all() {
                assert!(!text.trim().is_empty(), "{lang}: {name} rỗng");
                assert_eq!(text, text.trim(), "{lang}: {name} thừa khoảng trắng");
            }
        }
    }

    #[test]
    fn placeholders_match_english() {
        for (lang, strings) in LANGUAGES {
            for ((name, en), (_, text)) in EN.all().into_iter().zip(strings.all()) {
                assert_eq!(placeholders(en), placeholders(text), "{lang}: {name}");
            }
        }
    }

    #[test]
    fn other_languages_are_actually_translated() {
        for (lang, strings) in &LANGUAGES[1..] {
            let same: Vec<_> = EN
                .all()
                .into_iter()
                .zip(strings.all())
                .filter(|((_, en), (_, text))| en == text)
                .map(|((n, _), _)| n)
                .collect();
            assert_eq!(same, ["tray_tooltip"], "{lang}: chỉ mẫu chú thích là giống English");
        }
    }

    #[test]
    fn cjk_strings_are_written_in_their_own_script() {
        for (name, text) in JA.all().into_iter().filter(|(n, _)| *n != "tray_tooltip") {
            assert!(text.chars().any(|c| is_kana(c) || is_han(c)), "ja: {name}");
            assert!(!text.chars().any(is_hangul), "ja: {name} lẫn Hangul");
        }
        for (name, text) in ZH.all().into_iter().filter(|(n, _)| *n != "tray_tooltip") {
            assert!(text.chars().any(is_han), "zh: {name}");
            assert!(
                !text.chars().any(|c| is_kana(c) || is_hangul(c)),
                "zh: {name} lẫn kana hay Hangul"
            );
        }
        for (name, text) in KO.all().into_iter().filter(|(n, _)| *n != "tray_tooltip") {
            assert!(text.chars().any(is_hangul), "ko: {name}");
            assert!(!text.chars().any(is_kana), "ko: {name} lẫn kana");
        }
    }

    #[test]
    fn strings_picks_the_table_of_each_language() {
        for (lang, expected) in [
            (UiLanguage::En, &EN),
            (UiLanguage::Vi, &VI),
            (UiLanguage::Ja, &JA),
            (UiLanguage::Zh, &ZH),
            (UiLanguage::Ko, &KO),
        ] {
            // So nội dung, không so địa chỉ: mỗi chỗ viết `&EN` có thể ra một địa chỉ tĩnh khác nhau.
            assert_eq!(strings(lang).all(), expected.all(), "{lang:?}");
        }
    }

    #[test]
    fn tooltip_fills_app_name_and_status() {
        assert_eq!(VI.tooltip("AI Translator", false), "AI Translator: Sẵn sàng");
        assert_eq!(EN.tooltip("AI Translator", true), "AI Translator: Translating");
        assert_eq!(JA.tooltip("AI Translator", false), "AI Translator: 待機中");
        assert_eq!(ZH.tooltip("AI Translator", true), "AI Translator: 翻译中");
        assert_eq!(KO.tooltip("AI Translator", false), "AI Translator: 준비됨");
    }

    #[test]
    fn default_ui_language_from_os_locale() {
        // Cùng bảng với `LOCALE_CASES` trong src/i18n/i18n.test.ts: sửa một nơi thì sửa nơi kia.
        use UiLanguage::{En, Ja, Ko, Vi, Zh};
        let cases = [
            ("vi-VN", Vi),
            ("vi_VN", Vi),
            ("vi", Vi),
            ("VI-vn", Vi),
            ("ja-JP", Ja),
            ("ja", Ja),
            ("ko-KR", Ko),
            ("ko_KR", Ko),
            ("zh-CN", Zh),
            ("zh-Hans-CN", Zh),
            ("zh-Hant-TW", Zh),
            ("zh_TW", Zh),
            ("zh-HK", Zh),
            ("zh", Zh),
            ("yue-Hant-HK", Zh),
            ("en-US", En),
            ("fr-FR", En),
            ("video", En),
            ("jam", En),
            ("korean", En),
            ("", En),
        ];
        for (locale, expected) in cases {
            assert_eq!(ui_language_from_locale(Some(locale)), expected, "{locale}");
        }
        assert_eq!(ui_language_from_locale(None), En);
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §9: nhãn tự động "Người N" theo ngôn ngữ giao diện. Cùng nhãn với lời giải thích của
    /// "Lấy tên" ở `src/i18n/speakers.test.ts`.
    #[test]
    fn the_automatic_speaker_label_has_its_number() {
        let got: Vec<String> = LANGUAGES
            .iter()
            .map(|(_, s)| s.speaker_voice.replace("{n}", "3"))
            .collect();
        assert_eq!(got, ["Speaker 3", "Người 3", "話者3", "说话人3", "화자 3"]);
    }
}
