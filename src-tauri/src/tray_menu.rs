//! Nội dung menu khay (F10, spec §4.2, §4.3): các dòng và chữ theo trạng thái và ngôn ngữ giao diện.
//! Phần dựng menu thật của Tauri ở `tray.rs`.

use crate::hotkeys::HotkeyAction;
use crate::i18n::Strings;
use crate::settings::Hotkeys;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayItem {
    HotkeyWarning,
    Session,
    Overlay,
    Lock,
    Compose,
    OpenMain,
    CheckForUpdates,
    RestartToUpdate,
    Quit,
}

impl TrayItem {
    pub const ALL: [TrayItem; 9] = [
        Self::HotkeyWarning,
        Self::Session,
        Self::Overlay,
        Self::Lock,
        Self::Compose,
        Self::OpenMain,
        Self::CheckForUpdates,
        Self::RestartToUpdate,
        Self::Quit,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::HotkeyWarning => "hotkey-warning",
            Self::Session => "session",
            Self::Overlay => "overlay-visible",
            Self::Lock => "overlay-lock",
            Self::Compose => "compose",
            Self::OpenMain => "open-main",
            Self::CheckForUpdates => "check-updates",
            Self::RestartToUpdate => "restart-to-update",
            Self::Quit => "quit",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|item| item.id() == id)
    }

    /// Việc có phím tắt toàn cục ứng với mục này; mục khác không có phím.
    pub fn hotkey_action(self) -> Option<HotkeyAction> {
        match self {
            Self::Session => Some(HotkeyAction::ToggleSession),
            Self::Overlay => Some(HotkeyAction::ToggleOverlay),
            Self::Lock => Some(HotkeyAction::ToggleLock),
            Self::Compose => Some(HotkeyAction::Compose),
            Self::HotkeyWarning | Self::OpenMain | Self::CheckForUpdates | Self::RestartToUpdate | Self::Quit => None,
        }
    }
}

/// Phím tắt hiện bên phải mục (spec 2026-10-20 §2): phím người dùng đang đặt. Không hiện khi mục không có phím, hay khi việc đó
/// không đăng ký được (`failed`): phím đó không chạy, hiện ra chỉ gây hiểu nhầm.
pub fn accelerator<'a>(item: TrayItem, hotkeys: &'a Hotkeys, failed: &[HotkeyAction]) -> Option<&'a str> {
    let action = item.hotkey_action()?;
    (!failed.contains(&action)).then(|| hotkeys.get(action))
}

/// Những gì menu khay cần biết.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrayModel {
    pub running: bool,
    pub overlay_visible: bool,
    pub locked: bool,
    pub hotkeys_failed: bool,
    /// Có bản cập nhật đã tải (kế hoạch 07b). Dòng mời chỉ hiện khi không dịch (§6.11: "app đang rảnh").
    pub update_ready: bool,
    /// Gõ dịch đang bật (`compose.enabled`): phím của nó chỉ đăng ký khi bật, nên mục chỉ hiện khi bật.
    pub compose_enabled: bool,
}

/// Các dòng của menu theo thứ tự; `None` là đường kẻ ngang.
pub fn menu_lines(strings: &Strings, model: TrayModel) -> Vec<Option<(TrayItem, &'static str)>> {
    let mut lines = Vec::new();
    if model.hotkeys_failed {
        lines.push(Some((TrayItem::HotkeyWarning, strings.tray_hotkey_failed)));
        lines.push(None);
    }
    lines.push(Some((
        TrayItem::Session,
        if model.running {
            strings.tray_stop
        } else {
            strings.tray_start
        },
    )));
    let overlay = if model.overlay_visible {
        strings.tray_hide_overlay
    } else {
        strings.tray_show_overlay
    };
    lines.push(Some((TrayItem::Overlay, overlay)));
    let lock = if model.locked {
        strings.tray_unlock_overlay
    } else {
        strings.tray_lock_overlay
    };
    lines.push(Some((TrayItem::Lock, lock)));
    if model.compose_enabled {
        lines.push(Some((TrayItem::Compose, strings.tray_compose)));
    }
    lines.push(None);
    lines.push(Some((TrayItem::OpenMain, strings.tray_open_main)));
    lines.push(Some((TrayItem::CheckForUpdates, strings.tray_check_updates)));
    lines.push(None);
    if model.update_ready && !model.running {
        lines.push(Some((TrayItem::RestartToUpdate, strings.tray_restart_to_update)));
    }
    lines.push(Some((TrayItem::Quit, strings.tray_quit)));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n;

    /// Mỗi dòng là `(id, chữ)`, để chữ đúng mà gắn nhầm việc cũng bị bắt; đường kẻ là `("---", "---")`.
    fn lines(lines: &[Option<(TrayItem, &'static str)>]) -> Vec<(&'static str, &'static str)> {
        lines
            .iter()
            .map(|l| l.map_or(("---", "---"), |(item, text)| (item.id(), text)))
            .collect()
    }

    #[test]
    fn idle_menu_in_vietnamese() {
        let model = TrayModel {
            running: false,
            overlay_visible: true,
            locked: false,
            hotkeys_failed: false,
            update_ready: false,
            compose_enabled: false,
        };
        assert_eq!(
            lines(&menu_lines(&i18n::VI, model)),
            [
                ("session", "Bắt đầu dịch"),
                ("overlay-visible", "Ẩn phụ đề"),
                ("overlay-lock", "Khóa phụ đề (click xuyên qua)"),
                ("---", "---"),
                ("open-main", "Mở cửa sổ chính"),
                ("check-updates", "Kiểm tra cập nhật…"),
                ("---", "---"),
                ("quit", "Thoát")
            ]
        );
    }

    #[test]
    fn labels_follow_state_in_english() {
        let model = TrayModel {
            running: true,
            overlay_visible: false,
            locked: true,
            hotkeys_failed: true,
            update_ready: true,
            compose_enabled: false,
        };
        assert_eq!(
            lines(&menu_lines(&i18n::EN, model)),
            [
                ("hotkey-warning", "Some shortcuts could not be registered"),
                ("---", "---"),
                ("session", "Stop translating"),
                ("overlay-visible", "Show subtitles"),
                ("overlay-lock", "Unlock subtitles"),
                ("---", "---"),
                ("open-main", "Open main window"),
                ("check-updates", "Check for updates…"),
                ("---", "---"),
                ("quit", "Quit")
            ]
        );
    }

    #[test]
    fn item_ids_roundtrip() {
        for item in TrayItem::ALL {
            assert_eq!(TrayItem::from_id(item.id()), Some(item));
        }
        assert_eq!(TrayItem::from_id("khac"), None);
    }

    #[test]
    fn all_lists_every_item_in_menu_order() {
        for (index, item) in TrayItem::ALL.into_iter().enumerate() {
            // Không dùng `_`: thêm biến thể mới thì không biên dịch được cho tới khi thêm nhánh ở đây, kèm
            // vị trí của biến thể đó trong `ALL`.
            let position = match item {
                TrayItem::HotkeyWarning => 0,
                TrayItem::Session => 1,
                TrayItem::Overlay => 2,
                TrayItem::Lock => 3,
                TrayItem::Compose => 4,
                TrayItem::OpenMain => 5,
                TrayItem::CheckForUpdates => 6,
                TrayItem::RestartToUpdate => 7,
                TrayItem::Quit => 8,
            };
            assert_eq!(position, index, "{item:?}");
        }
        assert_eq!(TrayItem::ALL.len(), 9);
    }

    #[test]
    fn restart_to_update_only_when_idle() {
        let model = |running| TrayModel {
            running,
            overlay_visible: false,
            locked: false,
            hotkeys_failed: false,
            update_ready: true,
            compose_enabled: false,
        };
        assert_eq!(
            lines(&menu_lines(&i18n::VI, model(false)))[4..],
            [
                ("open-main", "Mở cửa sổ chính"),
                ("check-updates", "Kiểm tra cập nhật…"),
                ("---", "---"),
                ("restart-to-update", "Khởi động lại để cập nhật"),
                ("quit", "Thoát")
            ]
        );
        assert!(
            !lines(&menu_lines(&i18n::EN, model(true)))
                .iter()
                .any(|(id, _)| *id == "restart-to-update"),
            "đang dịch thì không mời"
        );
    }

    #[test]
    fn compose_item_follows_the_setting() {
        let model = |compose_enabled| TrayModel {
            running: false,
            overlay_visible: true,
            locked: false,
            hotkeys_failed: false,
            update_ready: false,
            compose_enabled,
        };
        let on = lines(&menu_lines(&i18n::VI, model(true)));
        assert_eq!(
            on[..4],
            [
                ("session", "Bắt đầu dịch"),
                ("overlay-visible", "Ẩn phụ đề"),
                ("overlay-lock", "Khóa phụ đề (click xuyên qua)"),
                ("compose", "Mở Gõ dịch"),
            ]
        );
        let off = lines(&menu_lines(&i18n::VI, model(false)));
        assert!(
            !off.iter().any(|(id, _)| *id == "compose"),
            "tắt Gõ dịch thì không có mục"
        );
    }

    #[test]
    fn shortcuts_follow_the_bindings_and_skip_what_failed() {
        let mut hotkeys = crate::settings::Settings::defaults(crate::settings::UiLanguage::Vi).hotkeys;
        hotkeys.set(HotkeyAction::ToggleOverlay, "Ctrl+Alt+J".into());
        let key = |item, failed: &[HotkeyAction]| accelerator(item, &hotkeys, failed);
        assert_eq!(key(TrayItem::Session, &[]), Some("Ctrl+Alt+T"));
        assert_eq!(
            key(TrayItem::Overlay, &[]),
            Some("Ctrl+Alt+J"),
            "phím người dùng đã đổi"
        );
        assert_eq!(key(TrayItem::Lock, &[]), Some("Ctrl+Alt+L"));
        assert_eq!(key(TrayItem::Compose, &[]), Some("Ctrl+Alt+G"));
        assert_eq!(
            key(TrayItem::Lock, &[HotkeyAction::ToggleLock]),
            None,
            "phím không đăng ký được thì không hiện"
        );
        assert_eq!(key(TrayItem::Session, &[HotkeyAction::ToggleLock]), Some("Ctrl+Alt+T"));
        for item in [
            TrayItem::HotkeyWarning,
            TrayItem::OpenMain,
            TrayItem::CheckForUpdates,
            TrayItem::RestartToUpdate,
            TrayItem::Quit,
        ] {
            assert_eq!(key(item, &[]), None, "{item:?}");
        }
    }
}
