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
    Ja,
    Zh,
    Ko,
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

/// Thu gì (spec 2026-10-24-nguon-micro §3.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureMode {
    /// Âm thanh máy theo `audioSource` (như trước khi có micro).
    Playback,
    /// Chỉ micro (`micDevice`).
    Mic,
    /// Âm thanh máy và micro, trộn có nhường lời (họp lai, spec §5.3, §5.4).
    Both,
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

/// Màu chữ của phụ đề (§4.3, Cài đặt › Phụ đề), chọn từ bảng màu có sẵn. Mã màu nằm ở giao diện
/// (`src/lib/subtitleView.ts`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TextColor {
    #[default]
    White,
    Yellow,
    Green,
    LightBlue,
    Orange,
}

/// Màu nền của thanh phụ đề (§4.3); độ trong suốt của nền là `OverlaySettings::opacity`.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BackgroundColor {
    #[default]
    Black,
    DarkGray,
    Navy,
    DarkBrown,
    DarkPurple,
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
    /// Mặc định chữ trắng trên nền đen (§4.3). File cài đặt của bản trước chưa có hai khóa này thì lấy mặc định.
    #[serde(default)]
    pub text_color: TextColor,
    #[serde(default)]
    pub background: BackgroundColor,
    pub show_source: bool,
    pub locked: bool,
    /// Vị trí đã nhớ theo từng màn hình, khóa là `overlay::placement::screen_key`.
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
    /// Cuộn phụ đề lên và xuống (§4.4). File cài đặt của bản trước chưa có hai khóa này thì lấy mặc định.
    pub scroll_up: String,
    pub scroll_down: String,
    /// Mở ô soạn Gõ dịch (spec 2026-10-17-go-dich §0, §3.5). File của bản trước chưa có khóa này thì nhận mặc định, hay phím
    /// dự phòng khi người dùng đã tự đặt mặc định cho việc khác (bước migrate `v2→v3`).
    pub compose: String,
}

impl Hotkeys {
    pub fn get(&self, action: HotkeyAction) -> &str {
        match action {
            HotkeyAction::ToggleSession => &self.toggle_session,
            HotkeyAction::ToggleOverlay => &self.toggle_overlay,
            HotkeyAction::ToggleLock => &self.toggle_lock,
            HotkeyAction::ScrollUp => &self.scroll_up,
            HotkeyAction::ScrollDown => &self.scroll_down,
            HotkeyAction::Compose => &self.compose,
        }
    }

    pub fn set(&mut self, action: HotkeyAction, accelerator: String) {
        match action {
            HotkeyAction::ToggleSession => self.toggle_session = accelerator,
            HotkeyAction::ToggleOverlay => self.toggle_overlay = accelerator,
            HotkeyAction::ToggleLock => self.toggle_lock = accelerator,
            HotkeyAction::ScrollUp => self.scroll_up = accelerator,
            HotkeyAction::ScrollDown => self.scroll_down = accelerator,
            HotkeyAction::Compose => self.compose = accelerator,
        }
    }

    pub fn bindings(&self) -> [(HotkeyAction, &str); 6] {
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

/// Ngôn ngữ đích của Gõ dịch (spec 2026-10-17-go-dich §2.1). `Auto` là "tiếng người bên kia", tính theo cài đặt phụ đề
/// (`compose::target::resolve`); chọn một ngôn ngữ thì thôi đi theo phụ đề.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ComposeTarget {
    #[default]
    Auto,
    En,
    Zh,
    Ja,
    Ko,
    Vi,
}

impl ComposeTarget {
    /// Ngôn ngữ đã chọn riêng; `None` khi là `Auto`.
    pub fn lang(self) -> Option<Lang> {
        match self {
            Self::Auto => None,
            Self::En => Some(Lang::En),
            Self::Zh => Some(Lang::Zh),
            Self::Ja => Some(Lang::Ja),
            Self::Ko => Some(Lang::Ko),
            Self::Vi => Some(Lang::Vi),
        }
    }
}

/// Gõ dịch: ô soạn nổi dịch tin nhắn rồi dán vào ô nhập của app khác (spec 2026-10-17-go-dich §1.4, §3.5).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComposeSettings {
    /// Tắt thì gỡ đăng ký phím tắt của ô soạn; phím đã chọn vẫn giữ trong cài đặt phím tắt.
    pub enabled: bool,
    pub target: ComposeTarget,
    /// macOS: tự dán vào ô đang gõ (cần quyền Trợ năng); tắt thì chỉ chép vào clipboard. Windows luôn tự dán.
    pub auto_paste: bool,
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
    /// Thu âm thanh máy hay micro (spec 2026-10-24-nguon-micro §3.1, §4). File của bản trước chưa có khóa này thì lấy
    /// mặc định `playback` (`migrate::load` ghép từng khóa), người dùng cũ không đổi gì.
    pub capture_mode: CaptureMode,
    /// Micro đã chọn: macOS là UID, Windows là ID endpoint. `None` là micro mặc định của hệ thống, tự theo khi người dùng
    /// đổi micro mặc định.
    pub mic_device: Option<String>,
    /// "Lọc tiếng ồn micro" (spec §3.2, mục 16): RNNoise cho bản VAD. Mặc định bật.
    pub mic_noise_filter: bool,
    /// Im lặng bao lâu thì chốt đoạn (§6.3, "Độ nhạy ngắt câu"). Dùng khi thu từ âm thanh máy. Mặc định 100 ms (chủ dự án chốt
    /// 2026-10-25, trước đó 50 ms); người dùng đã lưu giá trị khác thì giữ nguyên.
    pub vad_end_silence_ms: u32,
    /// Như `vad_end_silence_ms`, riêng cho chế độ có micro (micro, âm thanh máy + micro). Mặc định cũng 100 ms (chủ dự án
    /// chốt 2026-10-25: mọi chế độ cùng một mặc định, phụ đề nhanh). Giọng người thật có nhiều quãng nghỉ ngắn nên mức cao hơn
    /// (300–500 ms) ít cắt vụn hơn, nhận chính xác hơn, đổi lại phụ đề chậm hơn (spec 2026-10-24-nguon-micro mục 18). File của
    /// bản trước chưa có khóa này thì lấy mặc định.
    pub mic_end_silence_ms: u32,
    pub overlay: OverlaySettings,
    /// Dịch trong lúc người nói chưa dừng (spec 2026-10-10 §6.3, Cài đặt › Phụ đề), mặc định bật. Đổi khi đang dịch thì có
    /// tác dụng từ đoạn kế tiếp (`session::set_streaming_enabled`). File của bản trước chưa có khóa này thì lấy mặc định
    /// (`migrate::load` ghép từng khóa vào giá trị mặc định), không cần bước migrate.
    pub translate_while_speaking: bool,
    /// Gõ dịch (spec 2026-10-17-go-dich §3.5). File của bản trước chưa có nhóm này thì lấy mặc định (`migrate::load` ghép
    /// từng khóa vào giá trị mặc định), không cần bước migrate.
    pub compose: ComposeSettings,
    /// Gói model đang dùng (§6.7): mã gói trong manifest (`standard`, `lite`, hay gói thêm sau bằng manifest, Đ7).
    /// `None` là chưa có gói nào. Chỉ đổi qua lệnh của kế hoạch 04 (gói phải đã tải xong).
    pub model_tier: Option<String>,
    pub hotkeys: Hotkeys,
    pub save_history: bool,
    /// Gửi báo cáo lỗi tự động cho nhà phát triển (spec 2026-10-17-diagnostics-reports-design.md §5). Cài mới: `false` cho tới
    /// khi người dùng qua bước Điều khoản (ô tích sẵn, bỏ tích được); file cài đặt của người dùng đã cài từ trước: bước migrate
    /// `v1→v2` đặt `true` (quyết định của chủ dự án 2026-10-17). Bản debug vẫn không tự gửi trừ khi bật công tắc dev.
    pub send_error_reports: bool,
    pub launch_at_login: bool,
    pub theme: Theme,
    pub update_channel: UpdateChannel,
    pub experimental: Experimental,
    /// Đã đi hết các bước lần đầu mở app (§4.1).
    pub onboarding_done: bool,
    /// Số thứ tự của bản cài đặt trong lần chạy này của app (điểm cần quyết 10 của kế hoạch 02a): tăng mỗi lần cài đặt
    /// đổi (`AppState::replace_settings`). Giao diện bỏ bản có số nhỏ hơn bản đang có, vì kết quả của một lệnh có thể tới
    /// sau sự kiện `settings://changed` mới hơn. Không ghi vào file (`migrate::RUNTIME_KEYS`), không sửa được qua
    /// `update_settings`.
    #[serde(default)]
    pub revision: u64,
}

pub const VAD_END_SILENCE_MS: std::ops::RangeInclusive<u32> = 50..=800;
pub const OVERLAY_FONT_SIZE: std::ops::RangeInclusive<u32> = 14..=48;
pub const OVERLAY_LINES: std::ops::RangeInclusive<u32> = 1..=3;
pub const OVERLAY_WIDTH: std::ops::RangeInclusive<f64> = 200.0..=10_000.0;
pub const OVERLAY_HEIGHT: std::ops::RangeInclusive<f64> = 40.0..=4_000.0;
/// Số màn hình nhớ vị trí tối đa, để file cài đặt không phình ra.
pub const MAX_OVERLAY_POSITIONS: usize = 16;
/// Độ dài tối đa của ID thiết bị, bundle ID và khóa màn hình, tính theo ký tự (không theo byte).
const MAX_ID_LEN: usize = 512;
/// Phím tắt mặc định của Gõ dịch: ⌃⌥G trên macOS, Ctrl+Alt+G trên Windows (spec 2026-10-17-go-dich §0). Cùng nhóm ⌃⌥ với
/// các phím tắt có sẵn của app, rất ít app khác dùng.
pub const COMPOSE_HOTKEY: &str = "Ctrl+Alt+G";

impl Settings {
    /// Giá trị mặc định. Ngôn ngữ đích mặc định theo ngôn ngữ giao diện (§4.1, bước 5).
    pub fn defaults(ui_language: UiLanguage) -> Self {
        let target_language = match ui_language {
            UiLanguage::En => Lang::En,
            UiLanguage::Vi => Lang::Vi,
            UiLanguage::Ja => Lang::Ja,
            UiLanguage::Zh => Lang::Zh,
            UiLanguage::Ko => Lang::Ko,
        };
        Self {
            ui_language,
            target_language,
            source_languages: Lang::ALL.to_vec(),
            source_lock: None,
            audio_source: AudioSource::System,
            capture_mode: CaptureMode::Playback,
            mic_device: None,
            mic_noise_filter: true,
            vad_end_silence_ms: 100,
            mic_end_silence_ms: 100,
            overlay: OverlaySettings {
                font_size: 20,
                lines: 2,
                opacity: 0.6,
                text_color: TextColor::White,
                background: BackgroundColor::Black,
                show_source: true,
                locked: false,
                positions: BTreeMap::new(),
                last_monitor: None,
            },
            translate_while_speaking: false,
            compose: ComposeSettings {
                enabled: true,
                target: ComposeTarget::Auto,
                auto_paste: true,
            },
            model_tier: None,
            hotkeys: Hotkeys {
                toggle_session: "Ctrl+Alt+T".into(),
                toggle_overlay: "Ctrl+Alt+H".into(),
                toggle_lock: "Ctrl+Alt+L".into(),
                // Không dùng Ctrl+Alt+mũi tên: driver Intel trên Windows dùng tổ hợp đó để xoay màn hình.
                scroll_up: "Ctrl+Alt+PageUp".into(),
                scroll_down: "Ctrl+Alt+PageDown".into(),
                compose: COMPOSE_HOTKEY.into(),
            },
            save_history: false,
            send_error_reports: false,
            launch_at_login: true,
            theme: Theme::System,
            update_channel: UpdateChannel::Stable,
            experimental: Experimental {
                translation_context: false,
            },
            onboarding_done: false,
            revision: 0,
        }
    }

    /// Phím tắt cần đăng ký với hệ điều hành: mọi việc, trừ Gõ dịch khi đang tắt (spec 2026-10-17-go-dich §1.4).
    pub fn active_hotkeys(&self) -> Vec<(HotkeyAction, &str)> {
        self.hotkeys
            .bindings()
            .into_iter()
            .filter(|(action, _)| *action != HotkeyAction::Compose || self.compose.enabled)
            .collect()
    }

    /// Kiểm phạm vi mọi khóa. Phía Rust là nơi quyết định: giao diện gửi gì cũng qua đây (§10.2).
    pub fn validate(&self) -> Result<(), Invalid> {
        if !VAD_END_SILENCE_MS.contains(&self.vad_end_silence_ms) {
            return Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange));
        }
        if !VAD_END_SILENCE_MS.contains(&self.mic_end_silence_ms) {
            return Err(Invalid::new("micEndSilenceMs", Reason::OutOfRange));
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
        if let Some(id) = &self.mic_device {
            check_id("micDevice", id)?;
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
        if let Some(pack) = &self.model_tier {
            check_id("modelTier", pack)?;
            if pack.chars().count() > 32 {
                return Err(Invalid::new("modelTier", Reason::TooLong));
            }
            if !crate::models::manifest::is_id(pack, 32) {
                return Err(Invalid::new("modelTier", Reason::WrongType));
            }
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
    if value.chars().count() > MAX_ID_LEN {
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
        assert_eq!(vi.vad_end_silence_ms, 100);
        assert_eq!(vi.mic_end_silence_ms, 100, "chế độ có micro: ngắt câu riêng, cùng mặc định 100 ms");
        assert_eq!(
            (vi.capture_mode, vi.audio_source.clone()),
            (CaptureMode::Playback, AudioSource::System),
            "mặc định \"Thu từ\" là Âm thanh máy (toàn hệ thống)"
        );
        assert!(!vi.save_history, "lưu lịch sử mặc định tắt (F4)");
        assert!(
            !vi.send_error_reports,
            "báo cáo lỗi tự động: cài mới chưa gửi gì cho tới khi qua bước Điều khoản (spec 2026-10-17 §5)"
        );
        assert!(
            !vi.experimental.translation_context,
            "ngữ cảnh câu trước mặc định tắt (§6.5)"
        );
        assert_eq!(vi.update_channel, UpdateChannel::Stable);
        assert!(
            !vi.translate_while_speaking,
            "dịch trong lúc người nói chưa dừng mặc định tắt (spec 2026-10-10 §6.3)"
        );
        assert_eq!(
            vi.hotkeys.bindings().map(|(_, a)| a.to_string()),
            [
                "Ctrl+Alt+T",
                "Ctrl+Alt+H",
                "Ctrl+Alt+L",
                "Ctrl+Alt+PageUp",
                "Ctrl+Alt+PageDown",
                "Ctrl+Alt+G"
            ]
        );
        assert_eq!(Settings::defaults(UiLanguage::En).target_language, Lang::En);
    }

    /// Spec 2026-10-17-go-dich §1.4: tắt Gõ dịch thì phím của nó không đăng ký (vẫn giữ trong cài đặt).
    #[test]
    fn the_compose_hotkey_is_active_only_while_compose_is_on() {
        let mut s = valid();
        let active = |s: &Settings| s.active_hotkeys().into_iter().map(|(a, _)| a).collect::<Vec<_>>();
        assert_eq!(active(&s), HotkeyAction::ALL);
        s.compose.enabled = false;
        assert_eq!(active(&s), &HotkeyAction::ALL[..5]);
        assert_eq!(s.hotkeys.compose, "Ctrl+Alt+G", "phím vẫn giữ");
        assert_eq!(s.validate(), Ok(()));
        s.hotkeys.compose = "Ctrl+Alt+T".into();
        rejects(s, "hotkeys.compose", Reason::Duplicate);
    }

    #[test]
    fn default_target_language_follows_every_ui_language() {
        for (ui, target) in [
            (UiLanguage::En, Lang::En),
            (UiLanguage::Vi, Lang::Vi),
            (UiLanguage::Ja, Lang::Ja),
            (UiLanguage::Zh, Lang::Zh),
            (UiLanguage::Ko, Lang::Ko),
        ] {
            let settings = Settings::defaults(ui);
            assert_eq!(settings.target_language, target);
            assert_eq!(settings.validate(), Ok(()));
            let back: Settings = serde_json::from_value(serde_json::to_value(&settings).unwrap()).unwrap();
            assert_eq!(back.ui_language, ui, "ghi rồi đọc lại");
        }
    }

    #[test]
    fn ui_language_is_stored_as_its_lowercase_code() {
        for (ui, code) in [
            (UiLanguage::En, "en"),
            (UiLanguage::Vi, "vi"),
            (UiLanguage::Ja, "ja"),
            (UiLanguage::Zh, "zh"),
            (UiLanguage::Ko, "ko"),
        ] {
            assert_eq!(serde_json::to_value(ui).unwrap(), json!(code));
            assert_eq!(serde_json::from_value::<UiLanguage>(json!(code)).unwrap(), ui);
        }
        assert!(serde_json::from_value::<UiLanguage>(json!("fr")).is_err());
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
            "sendErrorReports",
            "launchAtLogin",
            "theme",
            "updateChannel",
            "experimental",
            "onboardingDone",
            "revision",
            "translateWhileSpeaking",
            "compose",
            "captureMode",
            "micDevice",
            "micNoiseFilter",
            "micEndSilenceMs",
        ] {
            assert!(keys.contains(&key.to_string()), "thiếu khóa {key}");
        }
        assert_eq!(value["captureMode"], json!("playback"));
        assert_eq!(value["micDevice"], serde_json::Value::Null);
        assert_eq!(value["micNoiseFilter"], json!(true));
        assert_eq!(serde_json::to_value(CaptureMode::Mic).unwrap(), json!("mic"));
        assert_eq!(serde_json::to_value(CaptureMode::Both).unwrap(), json!("both"));
        assert_eq!(value["overlay"]["fontSize"], json!(20));
        assert_eq!(value["overlay"]["showSource"], json!(true));
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
        s.vad_end_silence_ms = 49;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.vad_end_silence_ms = 801;
        rejects(s, "vadEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.mic_end_silence_ms = 49;
        rejects(s, "micEndSilenceMs", Reason::OutOfRange);
        let mut s = valid();
        s.mic_end_silence_ms = 801;
        rejects(s, "micEndSilenceMs", Reason::OutOfRange);
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
        s.vad_end_silence_ms = 50;
        s.mic_end_silence_ms = 50;
        s.overlay.lines = 3;
        s.overlay.font_size = 48;
        s.overlay.opacity = 0.0;
        assert_eq!(s.validate(), Ok(()));
        s.vad_end_silence_ms = 800;
        s.mic_end_silence_ms = 800;
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

    /// Spec 2026-10-24-nguon-micro §4: `micDevice` là ID thiết bị, kiểm như `audioSource`.
    #[test]
    fn mic_device_ids_are_bounded() {
        let mut s = valid();
        s.mic_device = Some(String::new());
        rejects(s, "micDevice", Reason::Empty);
        let mut s = valid();
        s.mic_device = Some("x".repeat(513));
        rejects(s, "micDevice", Reason::TooLong);
        let mut s = valid();
        s.mic_device = Some("BuiltInMicrophoneDevice".into());
        assert_eq!(s.validate(), Ok(()));
    }

    #[test]
    fn id_length_counts_characters_not_bytes() {
        // 512 ký tự có dấu là 1536 byte: vẫn hợp lệ; 513 ký tự thì quá dài.
        let mut s = valid();
        s.audio_source = AudioSource::Device { id: "ế".repeat(512) };
        assert_eq!(s.validate(), Ok(()));
        s.overlay.last_monitor = Some("ế".repeat(512));
        assert_eq!(s.validate(), Ok(()));
        let mut s = valid();
        s.audio_source = AudioSource::Device { id: "ế".repeat(513) };
        rejects(s, "audioSource", Reason::TooLong);
        let mut s = valid();
        s.overlay.last_monitor = Some("x".repeat(513));
        rejects(s, "overlay.lastMonitor", Reason::TooLong);
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

    /// Gói model là mã gói của manifest (Đ7): chữ thường, số, `.`, `_`, `-`, tối đa 32 ký tự.
    #[test]
    fn model_tier_is_a_pack_id() {
        let mut s = valid();
        for pack in ["standard", "lite", "hybrid-m1"] {
            s.model_tier = Some(pack.into());
            assert_eq!(s.validate(), Ok(()), "{pack}");
        }
        let mut s = valid();
        s.model_tier = Some(String::new());
        rejects(s, "modelTier", Reason::Empty);
        let mut s = valid();
        s.model_tier = Some("x".repeat(33));
        rejects(s, "modelTier", Reason::TooLong);
        let mut s = valid();
        s.model_tier = Some("../Standard".into());
        rejects(s, "modelTier", Reason::WrongType);
        let value = serde_json::to_value(Settings {
            model_tier: Some("lite".into()),
            ..valid()
        })
        .unwrap();
        assert_eq!(value["modelTier"], json!("lite"), "file cài đặt cũ vẫn đọc được");
    }

    /// Spec 2026-10-17-go-dich §1.4, §2.1: Gõ dịch bật sẵn, ngôn ngữ đích "Tự động", tự dán; ngôn ngữ đích lưu bằng mã hai
    /// chữ hay `auto`.
    #[test]
    fn compose_defaults_and_target_codes() {
        let s = valid();
        assert_eq!(
            s.compose,
            ComposeSettings {
                enabled: true,
                target: ComposeTarget::Auto,
                auto_paste: true,
            }
        );
        let value = serde_json::to_value(&s).unwrap();
        assert_eq!(
            value["compose"],
            json!({ "enabled": true, "target": "auto", "autoPaste": true })
        );
        for (target, code, lang) in [
            (ComposeTarget::Auto, "auto", None),
            (ComposeTarget::En, "en", Some(Lang::En)),
            (ComposeTarget::Zh, "zh", Some(Lang::Zh)),
            (ComposeTarget::Ja, "ja", Some(Lang::Ja)),
            (ComposeTarget::Ko, "ko", Some(Lang::Ko)),
            (ComposeTarget::Vi, "vi", Some(Lang::Vi)),
        ] {
            assert_eq!(serde_json::to_value(target).unwrap(), json!(code));
            assert_eq!(serde_json::from_value::<ComposeTarget>(json!(code)).unwrap(), target);
            assert_eq!(target.lang(), lang, "{code}");
        }
        assert!(serde_json::from_value::<ComposeTarget>(json!("fr")).is_err());
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
