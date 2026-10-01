//! Cài đặt của app (spec §6.9): kiểu, giá trị mặc định và luật kiểm phạm vi.
//! - `migrate.rs`: số phiên bản schema, các bước migrate, đọc file cũ.
//! - `patch.rs`: sửa một phần cài đặt theo yêu cầu từ giao diện.
//! - `persist.rs`: đọc ghi file bằng `tauri-plugin-store`.
//!
//! Kế hoạch sau thêm khóa thì thêm trường ở đây, thêm luật vào `validate`, và thêm một bước migrate
//! nếu khóa cũ đổi tên hay đổi nghĩa (khóa mới hoàn toàn thì chỉ cần giá trị mặc định).

pub mod migrate;
pub mod patch;
pub mod persist;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::hotkeys::{self, HotkeyAction, HotkeyError};

/// Ngôn ngữ giao diện (§4.5).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UiLanguage {
    En,
    Vi,
}

/// Năm ngôn ngữ của F2, dùng cho ngôn ngữ đích và tập ngôn ngữ nguồn.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    En,
    Zh,
    Ja,
    Ko,
    Vi,
}

impl Lang {
    pub const ALL: [Lang; 5] = [Lang::En, Lang::Zh, Lang::Ja, Lang::Ko, Lang::Vi];
}

/// Nguồn âm thanh (§4.3, §6.1). Kế hoạch 02 dùng giá trị này để chọn cách thu.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum AudioSource {
    /// Windows: chế độ tự động (thiết bị Console và Communications). macOS: toàn hệ thống, trừ chính app.
    System,
    /// Windows: một thiết bị phát chọn tay, theo ID endpoint.
    Device { id: String },
    /// macOS: chỉ tap một app, theo bundle ID.
    App { bundle_id: String },
}

/// Gói model (§6.7). `None` là chưa chọn; kế hoạch 04 đặt giá trị này.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    Standard,
    Lite,
}

/// Giao diện sáng/tối (§4.3, nhóm Chung).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// Kênh cập nhật (§6.11). Kế hoạch 07 đọc giá trị này.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Stable,
    Beta,
}

/// Vị trí và kích thước thanh phụ đề trên một màn hình, tính bằng điểm logic so với góc trên
/// bên trái vùng làm việc của màn hình đó.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// Lần cuối thanh phụ đề nằm trên màn hình này (giây Unix), để bỏ màn hình lâu không dùng nhất.
    #[serde(default)]
    pub last_used: u64,
}

/// Cài đặt của thanh phụ đề (§4.4). Kế hoạch 03 làm nhóm Cài đặt "Phụ đề" trên các khóa này.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub font_size: u32,
    pub lines: u32,
    /// Độ mờ của nền, 0 là trong suốt hẳn.
    pub opacity: f64,
    pub show_source: bool,
    pub locked: bool,
    /// Vị trí đã nhớ theo từng màn hình, khóa là `overlay::placement::monitor_key`.
    pub positions: BTreeMap<String, OverlayRect>,
    /// Màn hình của lần đặt thanh phụ đề gần nhất.
    pub last_monitor: Option<String>,
}

/// Phím tắt toàn cục (F10), lưu ở dạng chuẩn của `hotkeys::parse`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hotkeys {
    pub toggle_session: String,
    pub toggle_overlay: String,
    pub toggle_lock: String,
}

impl Hotkeys {
    pub fn get(&self, action: HotkeyAction) -> &str {
        match action {
            HotkeyAction::ToggleSession => &self.toggle_session,
            HotkeyAction::ToggleOverlay => &self.toggle_overlay,
            HotkeyAction::ToggleLock => &self.toggle_lock,
        }
    }

    pub fn set(&mut self, action: HotkeyAction, accelerator: String) {
        match action {
            HotkeyAction::ToggleSession => self.toggle_session = accelerator,
            HotkeyAction::ToggleOverlay => self.toggle_overlay = accelerator,
            HotkeyAction::ToggleLock => self.toggle_lock = accelerator,
        }
    }

    pub fn bindings(&self) -> [(HotkeyAction, &str); 3] {
        HotkeyAction::ALL.map(|action| (action, self.get(action)))
    }
}

/// Cờ thử nghiệm (§6.5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Experimental {
    /// Đưa câu trước vào làm ngữ cảnh khi dịch. Mặc định tắt (S7).
    pub translation_context: bool,
}

/// Toàn bộ cài đặt. Tên khóa trong file JSON là tên trường dạng camelCase.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub ui_language: UiLanguage,
    pub target_language: Lang,
    pub source_languages: Vec<Lang>,
    /// Khóa cố định một ngôn ngữ nguồn; `None` là tự nhận diện trong `source_languages`.
    pub source_lock: Option<Lang>,
    pub audio_source: AudioSource,
    /// Im lặng bao lâu thì chốt đoạn (§6.3, "Độ nhạy ngắt câu").
    pub vad_end_silence_ms: u32,
    pub overlay: OverlaySettings,
    pub model_tier: Option<ModelTier>,
    pub hotkeys: Hotkeys,
    pub save_history: bool,
    pub launch_at_login: bool,
    pub theme: Theme,
    pub update_channel: UpdateChannel,
    pub experimental: Experimental,
    /// Đã đi hết các bước lần đầu mở app (§4.1).
    pub onboarding_done: bool,
}

pub const VAD_END_SILENCE_MS: std::ops::RangeInclusive<u32> = 200..=800;
pub const OVERLAY_FONT_SIZE: std::ops::RangeInclusive<u32> = 14..=48;
pub const OVERLAY_LINES: std::ops::RangeInclusive<u32> = 1..=3;
pub const OVERLAY_WIDTH: std::ops::RangeInclusive<f64> = 200.0..=10_000.0;
pub const OVERLAY_HEIGHT: std::ops::RangeInclusive<f64> = 40.0..=4_000.0;
/// Số màn hình nhớ vị trí tối đa, để file cài đặt không phình ra.
pub const MAX_OVERLAY_POSITIONS: usize = 16;
const MAX_ID_LEN: usize = 512;

impl Settings {
    /// Giá trị mặc định. Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (§4.1, bước 5).
    pub fn defaults(ui_language: UiLanguage) -> Self {
        let target_language = match ui_language {
            UiLanguage::En => Lang::En,
            UiLanguage::Vi => Lang::Vi,
        };
        Self {
            ui_language,
            target_language,
            source_languages: Lang::ALL.to_vec(),
            source_lock: None,
            audio_source: AudioSource::System,
            vad_end_silence_ms: 300,
            overlay: OverlaySettings {
                font_size: 22,
                lines: 2,
                opacity: 0.6,
                show_source: false,
                locked: false,
                positions: BTreeMap::new(),
                last_monitor: None,
            },
            model_tier: None,
            hotkeys: Hotkeys {
                toggle_session: "Ctrl+Alt+T".into(),
                toggle_overlay: "Ctrl+Alt+H".into(),
                toggle_lock: "Ctrl+Alt+L".into(),
            },
            save_history: false,
            launch_at_login: false,
            theme: Theme::System,
            update_channel: UpdateChannel::Stable,
            experimental: Experimental {
                translation_context: false,
            },
            onboarding_done: false,
        }
    }

    /// Kiểm phạm vi mọi khóa. Phía Rust là nơi quyết định: giao diện gửi gì cũng qua đây (§10.2).
    pub fn validate(&self) -> Result<(), Invalid> {
        if !VAD_END_SILENCE_MS.contains(&self.vad_end_silence_ms) {
            return Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange));
        }
        if self.source_languages.is_empty() {
            return Err(Invalid::new("sourceLanguages", Reason::Empty));
        }
        let mut seen = Vec::with_capacity(self.source_languages.len());
        for lang in &self.source_languages {
            if seen.contains(lang) {
                return Err(Invalid::new("sourceLanguages", Reason::Duplicate));
            }
            seen.push(*lang);
        }
        match &self.audio_source {
            AudioSource::System => {}
            AudioSource::Device { id } => check_id("audioSource", id)?,
            AudioSource::App { bundle_id } => check_id("audioSource", bundle_id)?,
        }
        let overlay = &self.overlay;
        if !OVERLAY_FONT_SIZE.contains(&overlay.font_size) {
            return Err(Invalid::new("overlay.fontSize", Reason::OutOfRange));
        }
        if !OVERLAY_LINES.contains(&overlay.lines) {
            return Err(Invalid::new("overlay.lines", Reason::OutOfRange));
        }
        if !(0.0..=1.0).contains(&overlay.opacity) {
            return Err(Invalid::new("overlay.opacity", Reason::OutOfRange));
        }
        if overlay.positions.len() > MAX_OVERLAY_POSITIONS {
            return Err(Invalid::new("overlay.positions", Reason::TooLong));
        }
        for (key, rect) in &overlay.positions {
            check_id("overlay.positions", key)?;
            let finite = [rect.x, rect.y, rect.width, rect.height].iter().all(|v| v.is_finite());
            if !finite || !OVERLAY_WIDTH.contains(&rect.width) || !OVERLAY_HEIGHT.contains(&rect.height) {
                return Err(Invalid::new("overlay.positions", Reason::OutOfRange));
            }
        }
        if let Some(key) = &overlay.last_monitor {
            check_id("overlay.lastMonitor", key)?;
        }
        hotkeys::check_all(&self.hotkeys.bindings()).map_err(|(action, error)| {
            let reason = match error {
                HotkeyError::Duplicate => Reason::Duplicate,
                _ => Reason::InvalidHotkey,
            };
            Invalid::new(format!("hotkeys.{}", action.key()), reason)
        })?;
        Ok(())
    }
}

fn check_id(field: &str, value: &str) -> Result<(), Invalid> {
    if value.is_empty() {
        return Err(Invalid::new(field, Reason::Empty));
    }
    if value.len() > MAX_ID_LEN {
        return Err(Invalid::new(field, Reason::TooLong));
    }
    Ok(())
}

/// Lý do một khóa cài đặt bị từ chối. Giao diện dịch mã này thành câu báo lỗi.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Reason {
    OutOfRange,
    Empty,
    Duplicate,
    TooLong,
    InvalidHotkey,
    WrongType,
    UnknownKey,
    ReadOnly,
    NotObject,
}

/// Một khóa cài đặt không hợp lệ.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
#[error("cài đặt `{field}` không hợp lệ ({reason:?})")]
pub struct Invalid {
    pub field: String,
    pub reason: Reason,
}

impl Invalid {
    pub fn new(field: impl Into<String>, reason: Reason) -> Self {
        Self {
            field: field.into(),
            reason,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid() -> Settings {
        Settings::defaults(UiLanguage::Vi)
    }

    fn rejects(settings: Settings, field: &str, reason: Reason) {
        assert_eq!(settings.validate(), Err(Invalid::new(field, reason)));
    }

    #[test]
    fn defaults_follow_spec() {
        let vi = Settings::defaults(UiLanguage::Vi);
        assert_eq!(vi.validate(), Ok(()));
        assert_eq!(vi.target_language, Lang::Vi);
        assert_eq!(vi.source_languages, Lang::ALL.to_vec());
        assert_eq!(vi.vad_end_silence_ms, 300);
        assert!(!vi.save_history, "lưu lịch sử mặc định tắt (F4)");
        assert!(
            !vi.experimental.translation_context,
            "ngữ cảnh câu trước mặc định tắt (§6.5)"
        );
        assert_eq!(vi.update_channel, UpdateChannel::Stable);
        assert_eq!(
            vi.hotkeys.bindings().map(|(_, a)| a.to_string()),
            ["Ctrl+Alt+T", "Ctrl+Alt+H", "Ctrl+Alt+L"]
        );
        assert_eq!(Settings::defaults(UiLanguage::En).target_language, Lang::En);
    }

    #[test]
    fn serializes_with_camel_case_keys_of_spec() {
        let value = serde_json::to_value(valid()).unwrap();
        let keys: Vec<_> = value.as_object().unwrap().keys().cloned().collect();
        for key in [
            "uiLanguage",
            "targetLanguage",
            "sourceLanguages",
            "sourceLock",
            "audioSource",
            "vadEndSilenceMs",
            "overlay",
            "modelTier",
            "hotkeys",
            "saveHistory",
            "launchAtLogin",
            "theme",
            "updateChannel",
            "experimental",
            "onboardingDone",
        ] {
            assert!(keys.contains(&key.to_string()), "thiếu khóa {key}");
        }
        assert_eq!(value["overlay"]["fontSize"], json!(22));
        assert_eq!(value["audioSource"], json!({ "kind": "system" }));
        assert_eq!(value["experimental"], json!({ "translationContext": false }));
        let app = AudioSource::App {
            bundle_id: "us.zoom.xos".into(),
        };
        assert_eq!(
            serde_json::to_value(app).unwrap(),
            json!({ "kind": "app", "bundleId": "us.zoom.xos" })
        );
    }

    #[test]
    fn rejects_out_of_range_values() {
        let mut s = valid();
        s.vad_end_silence_ms = 199;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.vad_end_silence_ms = 801;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.lines = 4;
        rejects(s, "overlay.lines", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.font_size = 13;
        rejects(s, "overlay.fontSize", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.opacity = 1.5;
        rejects(s, "overlay.opacity", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.opacity = f64::NAN;
        rejects(s, "overlay.opacity", Reason::OutOfRange);
    }

    #[test]
    fn accepts_range_bounds() {
        let mut s = valid();
        s.vad_end_silence_ms = 200;
        s.overlay.lines = 3;
        s.overlay.font_size = 48;
        s.overlay.opacity = 0.0;
        assert_eq!(s.validate(), Ok(()));
        s.vad_end_silence_ms = 800;
        s.overlay.lines = 1;
        s.overlay.opacity = 1.0;
        assert_eq!(s.validate(), Ok(()));
    }

    #[test]
    fn source_languages_must_be_non_empty_and_unique() {
        let mut s = valid();
        s.source_languages.clear();
        rejects(s, "sourceLanguages", Reason::Empty);
        let mut s = valid();
        s.source_languages = vec![Lang::En, Lang::Vi, Lang::En];
        rejects(s, "sourceLanguages", Reason::Duplicate);
    }

    #[test]
    fn audio_source_ids_are_bounded() {
        let mut s = valid();
        s.audio_source = AudioSource::Device { id: String::new() };
        rejects(s, "audioSource", Reason::Empty);
        let mut s = valid();
        s.audio_source = AudioSource::App {
            bundle_id: "x".repeat(513),
        };
        rejects(s, "audioSource", Reason::TooLong);
    }

    #[test]
    fn overlay_positions_are_bounded() {
        let rect = OverlayRect {
            x: 10.0,
            y: 10.0,
            width: 900.0,
            height: 160.0,
            last_used: 0,
        };
        let mut s = valid();
        s.overlay.positions.insert("Built-in 3024x1964".into(), rect);
        assert_eq!(s.validate(), Ok(()));
        let mut s = valid();
        s.overlay
            .positions
            .insert("m".into(), OverlayRect { width: 50.0, ..rect });
        rejects(s, "overlay.positions", Reason::OutOfRange);
        let mut s = valid();
        s.overlay.positions.insert(
            "m".into(),
            OverlayRect {
                x: f64::INFINITY,
                ..rect
            },
        );
        rejects(s, "overlay.positions", Reason::OutOfRange);
        let mut s = valid();
        for i in 0..=MAX_OVERLAY_POSITIONS {
            s.overlay.positions.insert(format!("m{i}"), rect);
        }
        rejects(s, "overlay.positions", Reason::TooLong);
    }

    #[test]
    fn hotkeys_must_be_valid_and_distinct() {
        let mut s = valid();
        s.hotkeys.toggle_lock = "L".into();
        rejects(s, "hotkeys.toggleLock", Reason::InvalidHotkey);
        let mut s = valid();
        s.hotkeys.toggle_overlay = "Ctrl+Alt+T".into();
        rejects(s, "hotkeys.toggleOverlay", Reason::Duplicate);
    }
}
