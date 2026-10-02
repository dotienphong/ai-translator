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
/// - `overlay.positions`, `overlay.lastMonitor`: chỉ phía Rust ghi, khi thanh phụ đề di chuyển;
/// - `revision`: số thứ tự do `AppState` đặt;
/// - `modelTier`: gói phải đã tải xong (lệnh `select_model_pack`, `download_models` của kế hoạch 04).
const READ_ONLY: &[&str] = &[
    "hotkeys",
    "overlay.locked",
    "overlay.positions",
    "overlay.lastMonitor",
    "revision",
    "modelTier",
];

/// Khóa là object con: bản sửa gửi object con thì ghép theo từng khóa con.
const NESTED: &[&str] = &["overlay", "experimental"];

/// Áp bản sửa `patch` lên `current`. Trả về cài đặt mới đã kiểm phạm vi, hoặc lỗi của một khóa sai.
///
/// Thứ tự kiểm: khóa lạ và khóa chỉ đọc trước, rồi sai kiểu (`WrongType`, hoặc `OutOfRange` cho số
/// âm hay số tràn kiểu), cuối cùng là phạm vi theo thứ tự của `Settings::validate`. Trong hai bước
/// đầu, khóa được xét theo thứ tự chữ cái của tên khóa, không theo thứ tự trong bản sửa (`Map` của
/// `serde_json` không bật `preserve_order` nên luôn sắp theo tên).
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

/// Tìm khóa làm hỏng kiểu dữ liệu, bằng cách áp riêng từng khóa của bản sửa. Ở nhóm con thì áp riêng
/// từng khóa con, để báo đúng tên khóa con (`overlay.fontSize`), không báo tên nhóm.
fn first_wrong_type(current: &Settings, patch: &Map<String, Value>) -> Invalid {
    let original = to_object(current);
    for (key, value) in patch {
        // (tên báo lỗi, giá trị đang có, giá trị mới, bản sửa chỉ chứa khóa hay khóa con này)
        let parts: Vec<(String, Option<&Value>, &Value, Value)> = match value {
            Value::Object(sub) if NESTED.contains(&key.as_str()) => sub
                .iter()
                .map(|(sub_key, sub_value)| {
                    let single = Map::from_iter([(sub_key.clone(), sub_value.clone())]);
                    let old = original.get(key).and_then(|group| group.get(sub_key));
                    (format!("{key}.{sub_key}"), old, sub_value, Value::Object(single))
                })
                .collect(),
            _ => vec![(key.clone(), original.get(key), value, value.clone())],
        };
        for (field, old, new, part) in parts {
            let mut merged = original.clone();
            if set(&mut merged, key, &part).is_ok()
                && serde_json::from_value::<Settings>(Value::Object(merged)).is_err()
            {
                return Invalid::new(field, reason_for(old, new));
            }
        }
    }
    Invalid::new("", Reason::WrongType)
}

/// Khóa số nguyên nhận một số nguyên mà không đọc được: số âm hay tràn kiểu, nên là `OutOfRange`.
fn reason_for(old: Option<&Value>, new: &Value) -> Reason {
    let integer = |v: &Value| v.is_i64() || v.is_u64();
    if old.is_some_and(integer) && integer(new) {
        Reason::OutOfRange
    } else {
        Reason::WrongType
    }
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

    /// Màu chữ và màu nền của phụ đề (§4.3): chỉ nhận màu trong bảng màu có sẵn.
    #[test]
    fn subtitle_colors_come_from_the_palette() {
        use crate::settings::{BackgroundColor, TextColor};
        let s = apply(
            &current(),
            &json!({ "overlay": { "textColor": "lightBlue", "background": "darkPurple" } }),
        )
        .unwrap();
        assert_eq!(
            (s.overlay.text_color, s.overlay.background),
            (TextColor::LightBlue, BackgroundColor::DarkPurple)
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "textColor": "#ff00ff" } })),
            Err(Invalid::new("overlay.textColor", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "background": "white" } })),
            Err(Invalid::new("overlay.background", Reason::WrongType))
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
        assert_eq!(
            apply(
                &current(),
                &json!({ "overlay": { "lastMonitor": "DELL U2723QE 2560x1440" } })
            ),
            Err(Invalid::new("overlay.lastMonitor", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "experimental": { "newFlag": true } })),
            Err(Invalid::new("experimental.newFlag", Reason::UnknownKey))
        );
        assert_eq!(
            apply(&current(), &json!({ "revision": 99 })),
            Err(Invalid::new("revision", Reason::ReadOnly))
        );
        assert_eq!(
            apply(&current(), &json!({ "modelTier": "lite" })),
            Err(Invalid::new("modelTier", Reason::ReadOnly))
        );
    }

    #[test]
    fn wrong_type_in_a_group_names_the_sub_key() {
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "lines": 2, "fontSize": "to" } })),
            Err(Invalid::new("overlay.fontSize", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "experimental": { "translationContext": "yes" } })),
            Err(Invalid::new("experimental.translationContext", Reason::WrongType))
        );
    }

    #[test]
    fn negative_or_overflowing_numbers_are_out_of_range() {
        assert_eq!(
            apply(&current(), &json!({ "vadEndSilenceMs": -300 })),
            Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "vadEndSilenceMs": u64::from(u32::MAX) + 1 })),
            Err(Invalid::new("vadEndSilenceMs", Reason::OutOfRange))
        );
        assert_eq!(
            apply(&current(), &json!({ "overlay": { "lines": -1 } })),
            Err(Invalid::new("overlay.lines", Reason::OutOfRange))
        );
        // Số lẻ cho khóa số nguyên, hay số cho khóa không phải số: sai kiểu.
        assert_eq!(
            apply(&current(), &json!({ "vadEndSilenceMs": 300.5 })),
            Err(Invalid::new("vadEndSilenceMs", Reason::WrongType))
        );
        assert_eq!(
            apply(&current(), &json!({ "theme": 2 })),
            Err(Invalid::new("theme", Reason::WrongType))
        );
    }

    #[test]
    fn failed_patch_leaves_current_untouched() {
        let before = current();
        let _ = apply(&before, &json!({ "theme": "dark", "vadEndSilenceMs": 5 }));
        assert_eq!(before, current());
    }
}
