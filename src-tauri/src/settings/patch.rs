//! Sửa một phần cài đặt theo yêu cầu từ giao diện (lệnh `update_settings`).
//!
//! Khác với lúc đọc file (`migrate::load`), ở đây mọi lỗi đều bị từ chối: khóa lạ, sai kiểu, ngoài
//! phạm vi. Một số khóa chỉ đổi qua lệnh riêng, vì đổi chúng cần làm thêm việc khác.

use serde_json::{Map, Value};

use super::migrate::to_object;
use super::{Invalid, Reason, Settings};

/// Khóa không đổi được qua `update_settings`, kèm lý do:
/// - `hotkeys`: phải đăng ký lại với hệ điều hành (lệnh `set_hotkey`);
/// - `overlay.locked`: phải đổi cửa sổ sang click xuyên qua (lệnh `set_overlay_locked`);
/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển.
const READ_ONLY: &[&str] = &["hotkeys", "overlay.locked", "overlay.positions", "overlay.lastMonitor"];

/// Khóa là object con: bản sửa gửi object con thì ghép theo từng khóa con.
const NESTED: &[&str] = &["overlay", "experimental"];

/// Áp bản sửa `patch` lên `current`. Trả về cài đặt mới đã kiểm phạm vi, hoặc lỗi của khóa đầu tiên sai.
pub fn apply(current: &Settings, patch: &Value) -> Result<Settings, Invalid> {
    let Value::Object(patch) = patch else {
        return Err(Invalid::new("", Reason::NotObject));
    };
    let mut merged = to_object(current);
    for (key, value) in patch {
        set(&mut merged, key, value)?;
    }
    let settings: Settings =
        serde_json::from_value(Value::Object(merged)).map_err(|_| first_wrong_type(current, patch))?;
    settings.validate()?;
    Ok(settings)
}

fn set(merged: &mut Map<String, Value>, key: &str, value: &Value) -> Result<(), Invalid> {
    if READ_ONLY.contains(&key) {
        return Err(Invalid::new(key, Reason::ReadOnly));
    }
    let Some(slot) = merged.get_mut(key) else {
        return Err(Invalid::new(key, Reason::UnknownKey));
    };
    if !NESTED.contains(&key) {
        *slot = value.clone();
        return Ok(());
    }
    let (Value::Object(group), Value::Object(sub)) = (slot, value) else {
        return Err(Invalid::new(key, Reason::WrongType));
    };
    for (sub_key, sub_value) in sub {
        let field = format!("{key}.{sub_key}");
        if READ_ONLY.contains(&field.as_str()) {
            return Err(Invalid::new(field, Reason::ReadOnly));
        }
        let Some(slot) = group.get_mut(sub_key) else {
            return Err(Invalid::new(field, Reason::UnknownKey));
        };
        *slot = sub_value.clone();
    }
    Ok(())
}

/// Tìm khóa làm hỏng kiểu dữ liệu, bằng cách áp riêng từng khóa của bản sửa.
fn first_wrong_type(current: &Settings, patch: &Map<String, Value>) -> Invalid {
    for (key, value) in patch {
        let mut merged = to_object(current);
        if set(&mut merged, key, value).is_ok() && serde_json::from_value::<Settings>(Value::Object(merged)).is_err() {
            return Invalid::new(key.as_str(), Reason::WrongType);
        }
    }
    Invalid::new("", Reason::WrongType)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Lang, Theme, UiLanguage};
    use serde_json::json;

    fn current() -> Settings {
        Settings::defaults(UiLanguage::Vi)
    }

    #[test]
    fn applies_top_level_and_nested_keys() {
        let patch = json!({
            "uiLanguage": "en",
            "theme": "dark",
            "sourceLanguages": ["en", "ja"],
            "sourceLock": "ja",
            "overlay": { "fontSize": 30, "showSource": true },
            "experimental": { "translationContext": true },
        });
        let s = apply(&current(), &patch).unwrap();
        assert_eq!(s.ui_language, UiLanguage::En);
        assert_eq!(s.theme, Theme::Dark);
        assert_eq!(s.source_languages, vec![Lang::En, Lang::Ja]);
        assert_eq!(s.source_lock, Some(Lang::Ja));
        assert_eq!(s.overlay.font_size, 30);
        assert!(s.overlay.show_source);
        assert_eq!(s.overlay.lines, 2, "khóa con không có trong bản sửa giữ nguyên");
        assert!(s.experimental.translation_context);
        let unlocked = apply(&s, &json!({ "sourceLock": null })).unwrap();
        assert_eq!(unlocked.source_lock, None);
    }

    #[test]
    fn rejects_out_of_range_values() {
        assert_eq!(
            apply(&current(), &json!({ "vadEndSilenceMs": 900 })),
            Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "lines": 0 } })),
            Err(Invalid::new("overlay.lines", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "sourceLanguages": [] })),
            Err(Invalid::new("sourceLanguages", Reason::Empty))
        );
    }

    #[test]
    fn rejects_wrong_types() {
        assert_eq!(
            apply(&current(), &json!({ "theme": "dark", "vadEndSilenceMs": "300" })),
            Err(Invalid::new("vadEndSilenceMs", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "uiLanguage": "fr" })),
            Err(Invalid::new("uiLanguage", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": 3 })),
            Err(Invalid::new("overlay", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!([1, 2])),
            Err(Invalid::new("", Reason::NotObject))
        );
    }

    #[test]
    fn rejects_unknown_and_read_only_keys() {
        assert_eq!(
            apply(&current(), &json!({ "licenseKey": "x" })),
            Err(Invalid::new("licenseKey", Reason::UnknownKey))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "color": "red" } })),
            Err(Invalid::new("overlay.color", Reason::UnknownKey))
        );
        assert_eq!(
            apply(&current(), &json!({ "hotkeys": { "toggleLock": "Ctrl+Alt+K" } })),
            Err(Invalid::new("hotkeys", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "locked": true } })),
            Err(Invalid::new("overlay.locked", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "positions": {} } })),
            Err(Invalid::new("overlay.positions", Reason::ReadOnly))
        );
    }

    #[test]
    fn failed_patch_leaves_current_untouched() {
        let before = current();
        let _ = apply(&before, &json!({ "theme": "dark", "vadEndSilenceMs": 5 }));
        assert_eq!(before, current());
    }
}
