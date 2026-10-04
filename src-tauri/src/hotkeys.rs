//! Phím tắt toàn cục (F10, spec §3.1): đọc, chuẩn hóa và kiểm trùng các phím tắt; đăng ký và đổi phím
//! tắt qua một `Registrar`. Bản `Registrar` thật bọc `tauri-plugin-global-shortcut` (`hotkey_registry.rs`).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use tauri_plugin_global_shortcut::{Modifiers, Shortcut};

/// Các việc có phím tắt toàn cục.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HotkeyAction {
    /// Bắt đầu hoặc dừng phiên dịch.
    ToggleSession,
    /// Ẩn hoặc hiện thanh phụ đề.
    ToggleOverlay,
    /// Khóa hoặc mở khóa thanh phụ đề (click xuyên qua).
    ToggleLock,
    /// Cuộn phụ đề lên xem câu cũ; dùng được cả khi thanh khóa (§4.4).
    ScrollUp,
    /// Cuộn phụ đề xuống câu mới hơn.
    ScrollDown,
}

impl HotkeyAction {
    pub const ALL: [HotkeyAction; 5] = [
        Self::ToggleSession,
        Self::ToggleOverlay,
        Self::ToggleLock,
        Self::ScrollUp,
        Self::ScrollDown,
    ];

    /// Tên khóa con trong `hotkeys` của cài đặt.
    pub fn key(self) -> &'static str {
        match self {
            Self::ToggleSession => "toggleSession",
            Self::ToggleOverlay => "toggleOverlay",
            Self::ToggleLock => "toggleLock",
            Self::ScrollUp => "scrollUp",
            Self::ScrollDown => "scrollDown",
        }
    }
}

/// Lý do một phím tắt không dùng được.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum HotkeyError {
    #[error("không đọc được phím tắt")]
    Invalid,
    #[error("phím tắt phải có ít nhất một trong các phím Ctrl, Alt, Cmd hoặc Win (chỉ Shift thì chưa đủ)")]
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
    // Shift không tính: Shift+chữ là cách gõ chữ hoa, đăng ký làm phím tắt toàn cục thì người dùng không
    // gõ được chữ đó ở mọi app.
    let modifiers = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER;
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

/// Kiểm cả bộ phím tắt: mỗi phím đọc được, có Ctrl, Alt hoặc Super, và không trùng phím của việc khác.
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

/// Nơi đăng ký phím tắt với hệ điều hành. Test dùng bản giả.
pub trait Registrar {
    /// Đăng ký; `false` nếu hệ điều hành từ chối (ví dụ app khác đang giữ tổ hợp này trên Windows).
    fn register(&self, shortcut: Shortcut) -> bool;
    fn unregister(&self, shortcut: Shortcut);
}

/// Phím tắt đang đăng ký thành công, theo từng việc.
#[derive(Debug, Default)]
pub struct Bound(BTreeMap<HotkeyAction, Shortcut>);

impl Bound {
    /// Việc ứng với phím tắt vừa được bấm (`Shortcut::id()`).
    pub fn action_for(&self, id: u32) -> Option<HotkeyAction> {
        self.0.iter().find(|(_, s)| s.id() == id).map(|(a, _)| *a)
    }

    pub fn get(&self, action: HotkeyAction) -> Option<Shortcut> {
        self.0.get(&action).copied()
    }
}

/// Đăng ký cả bộ phím tắt lúc khởi động. Trả về các việc không đăng ký được.
pub fn register_all(
    registrar: &impl Registrar,
    bound: &mut Bound,
    bindings: &[(HotkeyAction, &str)],
) -> Vec<HotkeyAction> {
    let mut failures = Vec::new();
    for (action, accelerator) in bindings {
        match parse(accelerator) {
            Ok((shortcut, _)) if registrar.register(shortcut) => {
                bound.0.insert(*action, shortcut);
            }
            _ => failures.push(*action),
        }
    }
    failures
}

/// Đổi phím tắt thất bại.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RebindError {
    pub error: HotkeyError,
    /// Phím cũ của việc này còn đăng ký với hệ điều hành. `false` thì việc này đang không có phím tắt
    /// nào, và phải báo cho người dùng như lỗi lúc khởi động.
    pub old_active: bool,
}

/// Đổi phím tắt của `action`. `current` là cả bộ phím tắt hiện tại (dạng chuẩn).
/// Thành công thì trả về dạng chuẩn của phím mới. Hệ điều hành từ chối phím mới thì đăng ký lại phím cũ.
pub fn rebind(
    registrar: &impl Registrar,
    bound: &mut Bound,
    current: &[(HotkeyAction, &str)],
    action: HotkeyAction,
    accelerator: &str,
) -> Result<String, RebindError> {
    let fail = |error, bound: &Bound| RebindError {
        error,
        old_active: bound.get(action).is_some(),
    };
    let (shortcut, canonical) = parse(accelerator).map_err(|e| fail(e, bound))?;
    let next: Vec<(HotkeyAction, &str)> = current
        .iter()
        .map(|&(a, s)| if a == action { (a, canonical.as_str()) } else { (a, s) })
        .collect();
    check_all(&next).map_err(|(_, e)| fail(e, bound))?;
    if bound.get(action) == Some(shortcut) {
        return Ok(canonical);
    }
    let old = bound.0.remove(&action);
    if let Some(old) = old {
        registrar.unregister(old);
    }
    if registrar.register(shortcut) {
        bound.0.insert(action, shortcut);
        return Ok(canonical);
    }
    let restored = old.filter(|old| registrar.register(*old));
    if let Some(old) = restored {
        bound.0.insert(action, old);
    }
    Err(RebindError {
        error: HotkeyError::RegisterFailed,
        old_active: restored.is_some(),
    })
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
    fn rejects_accelerators_longer_than_max_len_even_if_parsable() {
        // Bộ đọc của plugin bỏ khoảng trắng quanh từng phím, nên chuỗi này đọc được nếu không giới hạn độ dài.
        let padded = format!("Ctrl+{}Alt+T", " ".repeat(70));
        assert!(padded.len() > MAX_LEN);
        assert!(
            padded.parse::<Shortcut>().is_ok(),
            "chuỗi phải đọc được để test đúng giới hạn"
        );
        assert_eq!(canonical_of(&padded), Err(HotkeyError::Invalid));
    }

    #[test]
    fn requires_a_modifier() {
        assert_eq!(canonical_of("T"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("F10"), Err(HotkeyError::NoModifier));
    }

    #[test]
    fn shift_alone_is_not_enough() {
        // Shift+chữ là cách gõ chữ hoa: đăng ký làm phím tắt toàn cục thì không gõ được chữ đó ở mọi app.
        assert_eq!(canonical_of("Shift+T"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("Shift+F10"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("Shift+Digit1"), Err(HotkeyError::NoModifier));
        assert_eq!(canonical_of("Ctrl+Shift+T").unwrap(), "Ctrl+Shift+T");
        assert_eq!(canonical_of("Alt+Shift+T").unwrap(), "Alt+Shift+T");
        assert_eq!(canonical_of("Shift+Super+T").unwrap(), "Shift+Super+T");
        assert_eq!(canonical_of("Alt+T").unwrap(), "Alt+T");
        assert_eq!(canonical_of("Super+T").unwrap(), "Super+T");
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

    /// Phím mặc định của hai việc cuộn phải đọc được và đã ở dạng chuẩn (cài đặt lưu dạng chuẩn), không trùng ba phím cũ.
    /// Không dùng Ctrl+Alt+mũi tên: driver Intel trên Windows dùng tổ hợp đó để xoay màn hình.
    #[test]
    fn scroll_defaults_are_canonical_and_distinct() {
        assert_eq!(canonical_of("Ctrl+Alt+PageUp").unwrap(), "Ctrl+Alt+PageUp");
        assert_eq!(canonical_of("Ctrl+Alt+PageDown").unwrap(), "Ctrl+Alt+PageDown");
        assert_eq!(check_all(&DEFAULTS), Ok(()));
    }

    #[test]
    fn action_keys_match_settings_fields() {
        let keys: Vec<_> = HotkeyAction::ALL.iter().map(|a| a.key()).collect();
        assert_eq!(
            keys,
            ["toggleSession", "toggleOverlay", "toggleLock", "scrollUp", "scrollDown"]
        );
        assert_eq!(
            serde_json::to_string(&HotkeyAction::ToggleLock).unwrap(),
            "\"toggleLock\""
        );
    }

    /// Bộ đăng ký giả: từ chối các tổ hợp trong `refused`, ghi lại các lần gọi.
    #[derive(Default)]
    struct FakeRegistrar {
        refused: std::cell::RefCell<Vec<String>>,
        calls: std::cell::RefCell<Vec<String>>,
    }

    impl FakeRegistrar {
        fn refuse(&self, accelerator: &str) {
            self.refused.borrow_mut().push(canonical_of(accelerator).unwrap());
        }
    }

    impl Registrar for FakeRegistrar {
        fn register(&self, shortcut: Shortcut) -> bool {
            let name = canonical(&shortcut);
            self.calls.borrow_mut().push(format!("+{name}"));
            !self.refused.borrow().contains(&name)
        }

        fn unregister(&self, shortcut: Shortcut) {
            self.calls.borrow_mut().push(format!("-{}", canonical(&shortcut)));
        }
    }

    const DEFAULTS: [(HotkeyAction, &str); 5] = [
        (HotkeyAction::ToggleSession, "Ctrl+Alt+T"),
        (HotkeyAction::ToggleOverlay, "Ctrl+Alt+H"),
        (HotkeyAction::ToggleLock, "Ctrl+Alt+L"),
        (HotkeyAction::ScrollUp, "Ctrl+Alt+PageUp"),
        (HotkeyAction::ScrollDown, "Ctrl+Alt+PageDown"),
    ];

    fn started(registrar: &FakeRegistrar) -> Bound {
        let mut bound = Bound::default();
        register_all(registrar, &mut bound, &DEFAULTS);
        registrar.calls.borrow_mut().clear();
        bound
    }

    #[test]
    fn register_all_reports_refused_shortcuts() {
        let registrar = FakeRegistrar::default();
        registrar.refuse("Ctrl+Alt+H");
        let mut bound = Bound::default();
        assert_eq!(
            register_all(&registrar, &mut bound, &DEFAULTS),
            [HotkeyAction::ToggleOverlay]
        );
        let t = parse("Ctrl+Alt+T").unwrap().0;
        assert_eq!(bound.action_for(t.id()), Some(HotkeyAction::ToggleSession));
        assert_eq!(bound.get(HotkeyAction::ToggleOverlay), None);
    }

    #[test]
    fn rebind_swaps_registration() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "control+alt+KeyK",
        );
        assert_eq!(result, Ok("Ctrl+Alt+K".to_string()));
        assert_eq!(*registrar.calls.borrow(), ["-Ctrl+Alt+T", "+Ctrl+Alt+K"]);
        let k = parse("Ctrl+Alt+K").unwrap().0;
        assert_eq!(bound.action_for(k.id()), Some(HotkeyAction::ToggleSession));
    }

    #[test]
    fn refused_shortcut_keeps_the_old_one() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        registrar.refuse("Ctrl+Alt+K");
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "Ctrl+Alt+K",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::RegisterFailed,
                old_active: true
            })
        );
        assert_eq!(*registrar.calls.borrow(), ["-Ctrl+Alt+T", "+Ctrl+Alt+K", "+Ctrl+Alt+T"]);
        assert_eq!(
            bound.get(HotkeyAction::ToggleSession),
            Some(parse("Ctrl+Alt+T").unwrap().0)
        );
    }

    #[test]
    fn losing_the_old_shortcut_too_is_reported() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        registrar.refuse("Ctrl+Alt+K");
        registrar.refuse("Ctrl+Alt+T");
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleSession,
            "Ctrl+Alt+K",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::RegisterFailed,
                old_active: false
            })
        );
        assert_eq!(bound.get(HotkeyAction::ToggleSession), None);
    }

    #[test]
    fn invalid_or_duplicate_shortcut_never_reaches_the_os() {
        let registrar = FakeRegistrar::default();
        let mut bound = started(&registrar);
        let result = rebind(
            &registrar,
            &mut bound,
            &DEFAULTS,
            HotkeyAction::ToggleLock,
            "Ctrl+Alt+H",
        );
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::Duplicate,
                old_active: true
            })
        );
        let result = rebind(&registrar, &mut bound, &DEFAULTS, HotkeyAction::ToggleLock, "L");
        assert_eq!(
            result,
            Err(RebindError {
                error: HotkeyError::NoModifier,
                old_active: true
            })
        );
        assert!(registrar.calls.borrow().is_empty());
    }

    #[test]
    fn same_shortcut_or_retry_after_startup_failure() {
        let registrar = FakeRegistrar::default();
        registrar.refuse("Ctrl+Alt+L");
        let mut bound = Bound::default();
        register_all(&registrar, &mut bound, &DEFAULTS);
        registrar.calls.borrow_mut().clear();
        // Đặt lại đúng phím đang có: không gọi hệ điều hành.
        assert_eq!(
            rebind(
                &registrar,
                &mut bound,
                &DEFAULTS,
                HotkeyAction::ToggleSession,
                "Ctrl+Alt+T"
            ),
            Ok("Ctrl+Alt+T".into())
        );
        assert!(registrar.calls.borrow().is_empty());
        // Việc chưa đăng ký được lúc khởi động: đổi sang phím khác thì đăng ký luôn.
        assert_eq!(
            rebind(
                &registrar,
                &mut bound,
                &DEFAULTS,
                HotkeyAction::ToggleLock,
                "Ctrl+Alt+K"
            ),
            Ok("Ctrl+Alt+K".into())
        );
        assert_eq!(*registrar.calls.borrow(), ["+Ctrl+Alt+K"]);
    }

    #[test]
    fn invalid_shortcut_for_an_action_without_one_reports_it_inactive() {
        let registrar = FakeRegistrar::default();
        registrar.refuse("Ctrl+Alt+L");
        let mut bound = Bound::default();
        register_all(&registrar, &mut bound, &DEFAULTS);
        registrar.calls.borrow_mut().clear();
        // Việc chưa có phím tắt nào (hệ điều hành từ chối lúc khởi động), người dùng nhập phím sai.
        for (accelerator, error) in [
            ("L", HotkeyError::NoModifier),
            ("Ctrl+Alt+", HotkeyError::Invalid),
            ("Ctrl+Alt+T", HotkeyError::Duplicate),
        ] {
            assert_eq!(
                rebind(&registrar, &mut bound, &DEFAULTS, HotkeyAction::ToggleLock, accelerator),
                Err(RebindError {
                    error,
                    old_active: false
                }),
                "{accelerator}"
            );
        }
        assert!(registrar.calls.borrow().is_empty());
        assert_eq!(bound.get(HotkeyAction::ToggleLock), None);
    }
}
