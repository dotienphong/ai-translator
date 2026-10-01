//! Nội dung menu khay (F10, spec §4.2, §4.3): các dòng và chữ theo trạng thái và ngôn ngữ giao diện.
//! Phần dựng menu thật của Tauri ở `tray.rs`.

use crate::i18n::Strings;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrayItem {
    HotkeyWarning,
    Session,
    Overlay,
    Lock,
    OpenMain,
    Quit,
}

impl TrayItem {
    pub const ALL: [TrayItem; 6] = [
        Self::HotkeyWarning,
        Self::Session,
        Self::Overlay,
        Self::Lock,
        Self::OpenMain,
        Self::Quit,
    ];

    pub fn id(self) -> &'static str {
        match self {
            Self::HotkeyWarning => "hotkey-warning",
            Self::Session => "session",
            Self::Overlay => "overlay-visible",
            Self::Lock => "overlay-lock",
            Self::OpenMain => "open-main",
            Self::Quit => "quit",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|item| item.id() == id)
    }
}

/// Những gì menu khay cần biết.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrayModel {
    pub running: bool,
    pub overlay_visible: bool,
    pub locked: bool,
    pub hotkeys_failed: bool,
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
    lines.push(None);
    lines.push(Some((TrayItem::OpenMain, strings.tray_open_main)));
    lines.push(None);
    lines.push(Some((TrayItem::Quit, strings.tray_quit)));
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::i18n;

    fn texts(lines: &[Option<(TrayItem, &'static str)>]) -> Vec<&'static str> {
        lines.iter().map(|l| l.map_or("---", |(_, text)| text)).collect()
    }

    #[test]
    fn idle_menu_in_vietnamese() {
        let model = TrayModel {
            running: false,
            overlay_visible: true,
            locked: false,
            hotkeys_failed: false,
        };
        assert_eq!(
            texts(&menu_lines(&i18n::VI, model)),
            [
                "Bắt đầu dịch",
                "Ẩn phụ đề",
                "Khóa phụ đề (click xuyên qua)",
                "---",
                "Mở cửa sổ chính",
                "---",
                "Thoát"
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
        };
        assert_eq!(
            texts(&menu_lines(&i18n::EN, model)),
            [
                "Some shortcuts could not be registered",
                "---",
                "Stop translating",
                "Show subtitles",
                "Unlock subtitles",
                "---",
                "Open main window",
                "---",
                "Quit"
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
}
