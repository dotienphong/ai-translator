//! Phím tắt toàn cục (F10, spec §3.1): đọc, chuẩn hóa và kiểm trùng ba phím tắt.
//! Phần đăng ký với hệ điều hành nằm ở `hotkey_registry.rs`.

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

/// Ba việc có phím tắt toàn cục.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    /// Bắt đầu hoặc dừng phiên dịch.
    ToggleSession,
    /// Ẩn hoặc hiện thanh phụ đề.
    ToggleOverlay,
    /// Khóa hoặc mở khóa thanh phụ đề (click xuyên qua).
    ToggleLock,
}

impl HotkeyAction {
    pub const ALL: [HotkeyAction; 3] = [Self::ToggleSession, Self::ToggleOverlay, Self::ToggleLock];

    /// Tên khóa con trong `hotkeys` của cài đặt.
    pub fn key(self) -> &'static str {
        match self {
            Self::ToggleSession => "toggleSession",
            Self::ToggleOverlay => "toggleOverlay",
            Self::ToggleLock => "toggleLock",
        }
    }
}

/// Lý do một phím tắt không dùng được.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum HotkeyError {
    #[error("không đọc được phím tắt")]
    Invalid,
    #[error("phím tắt phải có ít nhất một phím bổ trợ (Ctrl, Alt, Shift, Cmd hoặc Win)")]
    NoModifier,
    #[error("phím tắt đang dùng cho việc khác của app")]
    Duplicate,
    #[error("hệ điều hành không cho đăng ký phím tắt này")]
    RegisterFailed,
}

/// Chuỗi phím tắt dài hơn mức này thì coi là không hợp lệ (dữ liệu từ giao diện, spec §10.2).
const MAX_LEN: usize = 64;

/// Đọc chuỗi phím tắt, ví dụ `"Ctrl+Alt+T"` hoặc `"control+alt+KeyT"`.
/// Trả về phím tắt đã đọc và dạng chuẩn để lưu vào cài đặt.
pub fn parse(accelerator: &str) -> Result<(Shortcut, String), HotkeyError> {
    if accelerator.trim().is_empty() || accelerator.len() > MAX_LEN {
        return Err(HotkeyError::Invalid);
    }
    let shortcut: Shortcut = accelerator.parse().map_err(|_| HotkeyError::Invalid)?;
    let modifiers = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT | Modifiers::SUPER;
    if (shortcut.mods & modifiers).is_empty() {
        return Err(HotkeyError::NoModifier);
    }
    Ok((shortcut, canonical(&shortcut)))
}

/// Dạng chuẩn: phím bổ trợ theo thứ tự Ctrl, Alt, Shift, Super, rồi tới phím chính.
/// `KeyT` viết là `T`, `Digit1` viết là `1`; phím khác giữ tên theo W3C (`F10`, `Space`).
fn canonical(shortcut: &Shortcut) -> String {
    let mut parts: Vec<String> = [
        (Modifiers::CONTROL, "Ctrl"),
        (Modifiers::ALT, "Alt"),
        (Modifiers::SHIFT, "Shift"),
        (Modifiers::SUPER, "Super"),
    ]
    .into_iter()
    .filter(|(modifier, _)| shortcut.mods.contains(*modifier))
    .map(|(_, name)| name.to_string())
    .collect();
    let code = shortcut.key.to_string();
    let key = ["Key", "Digit"]
        .iter()
        .find_map(|prefix| code.strip_prefix(prefix).filter(|rest| rest.len() == 1))
        .unwrap_or(&code);
    parts.push(key.to_string());
    parts.join("+")
}

/// Kiểm cả bộ phím tắt: mỗi phím đọc được, có phím bổ trợ, và không trùng phím của việc khác.
/// Lỗi trả về việc gặp lỗi đầu tiên theo thứ tự của `bindings`.
pub fn check_all(bindings: &[(HotkeyAction, &str)]) -> Result<(), (HotkeyAction, HotkeyError)> {
    let mut seen: Vec<String> = Vec::with_capacity(bindings.len());
    for (action, accelerator) in bindings {
        let (_, canonical) = parse(accelerator).map_err(|e| (*action, e))?;
        if seen.contains(&canonical) {
            return Err((*action, HotkeyError::Duplicate));
        }
        seen.push(canonical);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn canonical_of(accelerator: &str) -> Result<String, HotkeyError> {
        parse(accelerator).map(|(_, canonical)| canonical)
    }

    #[test]
    fn canonicalizes_modifier_order_and_key_names() {
        assert_eq!(canonical_of("Ctrl+Alt+T").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("control+alt+KeyT").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("Alt+Ctrl+t").unwrap(), "Ctrl+Alt+T");
        assert_eq!(canonical_of("Shift+Super+Digit1").unwrap(), "Shift+Super+1");
        assert_eq!(canonical_of("Cmd+Shift+F10").unwrap(), "Shift+Super+F10");
        assert_eq!(canonical_of("Ctrl+Alt+Space").unwrap(), "Ctrl+Alt+Space");
    }

    #[test]
    fn canonical_form_parses_back_to_same_shortcut() {
        for accelerator in [
            "Ctrl+Alt+T",
            "Shift+Super+1",
            "Ctrl+Alt+F10",
            "Alt+Shift+ArrowUp",
            "Ctrl+Backquote",
        ] {
            let (shortcut, canonical) = parse(accelerator).unwrap();
            let (again, _) = parse(&canonical).unwrap();
            assert_eq!(shortcut.id(), again.id(), "{accelerator}");
        }
    }

    #[test]
    fn rejects_malformed_accelerators() {
        assert_eq!(canonical_of(""), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("   "), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Alt+"), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Alt+T+Y"), Err(HotkeyError::Invalid));
        assert_eq!(canonical_of("Ctrl+Hyper+T"), Err(HotkeyError::Invalid));
        assert_eq!(
            canonical_of(&format!("Ctrl+{}", "A".repeat(80))),
            Err(HotkeyError::Invalid)
        );
    }

    #[test]
    fn requires_a_modifier() {
        assert_eq!(canonical_of("T"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("F10"), Err(HotkeyError::NoModifier));
    }

    #[test]
    fn check_all_reports_first_duplicate_or_invalid() {
        let ok = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleOverlay, "Ctrl+Alt+H"),
            (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
        ];
        assert_eq!(check_all(&ok), Ok(()));
        let duplicate = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleOverlay, "control+alt+KeyT"),
            (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
        ];
        assert_eq!(
            check_all(&duplicate),
            Err((HotkeyAction::ToggleOverlay, HotkeyError::Duplicate))
        );
        let invalid = [
            (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
            (HotkeyAction::ToggleLock, "L"),
        ];
        assert_eq!(
            check_all(&invalid),
            Err((HotkeyAction::ToggleLock, HotkeyError::NoModifier))
        );
    }

    #[test]
    fn action_keys_match_settings_fields() {
        let keys: Vec<_> = HotkeyAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(keys, ["toggleSession", "toggleOverlay", "toggleLock"]);
        assert_eq!(
            serde_json::to_string(&HotkeyAction::ToggleLock).unwrap(),
            "\"toggleLock\""
        );
    }
}
