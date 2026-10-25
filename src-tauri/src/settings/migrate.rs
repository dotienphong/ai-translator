//! Số phiên bản schema và bước migrate của file cài đặt (spec §6.9).
//!
//! File là một object JSON phẳng ở mức trên cùng (mỗi khóa của `Settings` là một mục của store),
//! cộng khóa `schemaVersion`. Bản 0 là file chưa có `schemaVersion`.
//!
//! Khi đọc:
//! 1. Chạy lần lượt các bước migrate từ phiên bản của file lên `CURRENT_SCHEMA_VERSION`.
//! 2. Ghép từng khóa của file vào giá trị mặc định. Khóa nào sai kiểu hay ngoài phạm vi thì giữ
//!    giá trị mặc định và ghi vào `rejected`; không bỏ cả file vì một khóa hỏng.
//! 3. Phím tắt được đưa về dạng chuẩn của `hotkeys::parse` (file sửa tay có thể ghi `control+alt+KeyT`),
//!    ghi vào `normalized`, để giao diện và việc kiểm trùng luôn thấy cùng một dạng.
//! 4. Khóa lạ (ví dụ của bản app mới hơn) bị bỏ qua khi đọc, nhưng vẫn nằm nguyên trong file, vì
//!    `persist::save` chỉ ghi các khóa nó biết.
//! 5. File do bản app mới hơn ghi (`schemaVersion` lớn hơn bản hiện tại): khóa không đọc được có thể
//!    là giá trị hợp lệ của bản mới. App dùng mặc định trong lúc chạy, nhưng giữ nguyên giá trị thô
//!    khi ghi file, trừ khi người dùng đổi chính khóa đó (`FileMeta::preserved`). Khóa con lạ trong
//!    các nhóm (ví dụ `overlay.futureSub`) cũng được ghép lại khi ghi (`FileMeta::unknown`), vì store
//!    ghi cả nhóm một lần.
//!    Hạn chế, chấp nhận cho MVP: người dùng cố ý chọn đúng giá trị mặc định cho một khóa đang được giữ
//!    thì lần ghi sau vẫn ghi lại giá trị thô của file.

use std::collections::BTreeMap;

use serde_json::{Map, Value};

use super::{COMPOSE_HOTKEY, Hotkeys, Settings};
use crate::hotkeys::{self, HotkeyAction};

pub const SCHEMA_VERSION_KEY: &str = "schemaVersion";

/// Một bước migrate: sửa object thô của file từ phiên bản `i` lên `i + 1`.
pub type Migration = fn(&mut Map<String, Value>);

/// `MIGRATIONS[i]` nâng file từ phiên bản `i` lên `i + 1`.
/// Thêm bước mới ở cuối; không sửa bước cũ, vì máy người dùng có thể còn file ở mọi phiên bản.
pub const MIGRATIONS: &[Migration] = &[v0_to_v1, v1_to_v2, v2_to_v3];

pub const CURRENT_SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

/// Bản 1 là bản đầu tiên có số phiên bản, các khóa giữ nguyên tên. Bước này chỉ để file bản 0
/// (chưa có `schemaVersion`) đi qua cùng một đường với mọi bản sau.
fn v0_to_v1(_raw: &mut Map<String, Value>) {}

/// Bản 2 thêm `sendErrorReports` (báo cáo lỗi tự động, spec 2026-10-17 §5). Người dùng đã cài từ trước (file có
/// `onboardingDone = true`) giữ bật, không hỏi và không báo: quyết định của chủ dự án. File của cài mới hay cài dở
/// (`onboardingDone` chưa `true`, hay file rỗng) không đặt gì: mặc định `false` cho tới khi qua bước Điều khoản.
fn v1_to_v2(raw: &mut Map<String, Value>) {
    if raw.get("onboardingDone") == Some(&Value::Bool(true)) {
        raw.entry("sendErrorReports").or_insert(Value::Bool(true));
    }
}

/// Phím dự phòng của Gõ dịch, theo thứ tự, khi người dùng đã tự đặt [`COMPOSE_HOTKEY`] cho việc khác.
const COMPOSE_FALLBACKS: &[&str] = &["Ctrl+Alt+Shift+G", "Ctrl+Alt+Y", "Ctrl+Alt+J"];

/// Bản 3 thêm phím tắt Gõ dịch (`hotkeys.compose`, mặc định `Ctrl+Alt+G`; spec 2026-10-17-go-dich §3.5). File thiếu khóa thì
/// nhận mặc định khi ghép, không cần làm gì; riêng khi người dùng đã tự đặt `Ctrl+Alt+G` cho một việc khác, mặc định đó sẽ
/// trùng và việc ghép cả nhóm thất bại, nên khóa của người dùng có thể bị kéo về mặc định. Bước này giữ phím của người dùng: Gõ
/// dịch nhận phím dự phòng đầu tiên còn trống.
fn v2_to_v3(raw: &mut Map<String, Value>) {
    let Some(Value::Object(keys)) = raw.get_mut("hotkeys") else {
        return;
    };
    if keys.contains_key("compose") {
        return;
    }
    let used: Vec<String> = keys
        .values()
        .filter_map(Value::as_str)
        .filter_map(|accelerator| hotkeys::parse(accelerator).ok())
        .map(|(_, canonical)| canonical)
        .collect();
    if !used.iter().any(|u| u == COMPOSE_HOTKEY) {
        return;
    }
    if let Some(free) = COMPOSE_FALLBACKS.iter().find(|f| !used.iter().any(|u| u == *f)) {
        keys.insert("compose".into(), Value::String((*free).into()));
    }
}

/// Khóa chỉ có lúc chạy, không đọc từ file và không ghi vào file (`Settings::revision`).
pub const RUNTIME_KEYS: &[&str] = &["revision"];

/// Khóa là object con: ghép theo từng khóa con, để một khóa con hỏng không kéo cả nhóm về mặc định.
const NESTED: &[&str] = &["overlay", "hotkeys", "experimental", "compose"];

/// Giá trị thô của một khóa không đọc được trong file của bản app mới hơn.
#[derive(Clone, Debug, PartialEq)]
pub struct Preserved {
    /// Giá trị trong file.
    pub raw: Value,
    /// Giá trị app dùng thay (mặc định). Lúc ghi, nếu khóa vẫn giữ giá trị này thì ghi lại `raw`.
    pub fallback: Value,
}

/// Những gì cần nhớ về file để ghi lại cho đúng.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct FileMeta {
    /// Phiên bản ghi trong file (0 nếu chưa có). Lớn hơn `CURRENT_SCHEMA_VERSION` khi file do bản app
    /// mới hơn ghi; khi đó giữ nguyên số này lúc lưu, không hạ phiên bản.
    pub version: u32,
    /// Chỉ có khi file mới hơn bản hiện tại. Khóa dạng `theme` hoặc `overlay.lines`.
    pub preserved: BTreeMap<String, Preserved>,
    /// Chỉ có khi file mới hơn bản hiện tại: khóa con bản này không biết, theo từng nhóm (`overlay`,
    /// `hotkeys`, `experimental`).
    pub unknown: BTreeMap<String, Map<String, Value>>,
}

impl FileMeta {
    /// File vừa tạo bởi bản hiện tại.
    pub fn current() -> Self {
        Self {
            version: CURRENT_SCHEMA_VERSION,
            ..Self::default()
        }
    }
}

/// Kết quả đọc file cài đặt.
#[derive(Debug, PartialEq)]
pub struct Loaded {
    pub settings: Settings,
    pub meta: FileMeta,
    /// Các khóa trong file bị bỏ vì sai kiểu hoặc ngoài phạm vi, dạng `overlay.lines`.
    pub rejected: Vec<String>,
    /// Các phím tắt trong file đã được đưa về dạng chuẩn, dạng `hotkeys.toggleSession`.
    pub normalized: Vec<String>,
}

impl Loaded {
    /// Có cần ghi lại file không: file cũ hơn bản hiện tại; hoặc file cùng bản có khóa hỏng (ghi lại
    /// giá trị mặc định) hay phím tắt chưa ở dạng chuẩn. File của bản mới hơn thì không ghi chỉ vì vậy.
    pub fn needs_save(&self) -> bool {
        self.meta.version < CURRENT_SCHEMA_VERSION
            || (self.meta.version == CURRENT_SCHEMA_VERSION
                && (!self.rejected.is_empty() || !self.normalized.is_empty()))
    }
}

/// Đọc object thô của file cài đặt.
pub fn load(raw: Map<String, Value>, defaults: Settings) -> Loaded {
    load_with(raw, defaults, MIGRATIONS)
}

/// Như `load`, với danh sách bước migrate tùy chọn (để test cơ chế migrate).
pub fn load_with(mut raw: Map<String, Value>, defaults: Settings, migrations: &[Migration]) -> Loaded {
    let file_version = raw
        .get(SCHEMA_VERSION_KEY)
        .and_then(Value::as_u64)
        .map_or(0, |v| u32::try_from(v).unwrap_or(u32::MAX));
    for migration in migrations.iter().skip(file_version as usize) {
        migration(&mut raw);
    }
    let newer = file_version > CURRENT_SCHEMA_VERSION;
    let mut merged = to_object(&defaults);
    let mut rejected = Vec::new();
    let mut unknown = BTreeMap::new();
    for (key, value) in &raw {
        if RUNTIME_KEYS.contains(&key.as_str()) {
            continue;
        }
        let Some(current) = merged.get(key).cloned() else {
            continue;
        };
        match (NESTED.contains(&key.as_str()), current, value) {
            (true, Value::Object(mut group), Value::Object(sub)) => {
                let (known, extra): (Vec<_>, Vec<_>) = sub.iter().partition(|(k, _)| group.contains_key(*k));
                if newer && !extra.is_empty() {
                    let extra: Map<String, Value> = extra.into_iter().map(|(k, v)| (k.clone(), v.clone())).collect();
                    unknown.insert(key.clone(), extra);
                }
                // Thử cả nhóm trước, để giữ được các thay đổi chỉ hợp lệ khi đi cùng nhau
                // (ví dụ đổi chỗ hai phím tắt); không được thì ghép từng khóa con.
                for (sub_key, sub_value) in &known {
                    group.insert((*sub_key).clone(), (*sub_value).clone());
                }
                if !try_set(&mut merged, key, None, Value::Object(group)) {
                    for (sub_key, sub_value) in known {
                        if !try_set(&mut merged, key, Some(sub_key), sub_value.clone()) {
                            rejected.push(format!("{key}.{sub_key}"));
                        }
                    }
                }
            }
            _ => {
                if !try_set(&mut merged, key, None, value.clone()) {
                    rejected.push(key.clone());
                }
            }
        }
    }
    let mut preserved = BTreeMap::new();
    if newer {
        for path in &rejected {
            if let (Some(raw), Some(fallback)) = (at_path(&raw, path), at_path(&merged, path)) {
                preserved.insert(
                    path.clone(),
                    Preserved {
                        raw: raw.clone(),
                        fallback: fallback.clone(),
                    },
                );
            }
        }
    }
    let mut settings: Settings = serde_json::from_value(Value::Object(merged)).expect("giá trị đã ghép luôn đọc được");
    let normalized = canonicalize_hotkeys(&mut settings.hotkeys);
    Loaded {
        settings,
        meta: FileMeta {
            version: file_version,
            preserved,
            unknown,
        },
        rejected,
        normalized,
    }
}

/// Đưa phím tắt về dạng chuẩn. Trả về các khóa đã đổi, dạng `hotkeys.toggleSession`. Phím tắt ở đây
/// đã qua `validate` nên luôn đọc được; đổi sang dạng chuẩn không làm đổi kết quả kiểm trùng.
fn canonicalize_hotkeys(bindings: &mut Hotkeys) -> Vec<String> {
    let mut changed = Vec::new();
    for action in HotkeyAction::ALL {
        if let Ok((_, canonical)) = hotkeys::parse(bindings.get(action))
            && canonical != bindings.get(action)
        {
            bindings.set(action, canonical);
            changed.push(format!("hotkeys.{}", action.key()));
        }
    }
    changed
}

fn at_path<'a>(map: &'a Map<String, Value>, path: &str) -> Option<&'a Value> {
    match path.split_once('.') {
        None => map.get(path),
        Some((key, sub_key)) => map.get(key)?.get(sub_key),
    }
}

/// Đặt `merged[key]` (hoặc `merged[key][sub_key]`) bằng `value` nếu kết quả vẫn là cài đặt hợp lệ.
fn try_set(merged: &mut Map<String, Value>, key: &str, sub_key: Option<&str>, value: Value) -> bool {
    let mut candidate = merged.clone();
    match sub_key {
        None => {
            candidate.insert(key.to_string(), value);
        }
        Some(sub_key) => {
            let Some(Value::Object(group)) = candidate.get_mut(key) else {
                return false;
            };
            group.insert(sub_key.to_string(), value);
        }
    }
    let valid = serde_json::from_value::<Settings>(Value::Object(candidate.clone()))
        .is_ok_and(|settings| settings.validate().is_ok());
    if valid {
        *merged = candidate;
    }
    valid
}

pub(crate) fn to_object(settings: &Settings) -> Map<String, Value> {
    match serde_json::to_value(settings).expect("Settings luôn ghi được ra JSON") {
        Value::Object(map) => map,
        _ => unreachable!("Settings là struct nên luôn ra object"),
    }
}

/// Các mục cần ghi vào store: mọi khóa của `settings`, cộng `schemaVersion`.
/// Không hạ phiên bản của file do bản app mới hơn ghi; khóa trong `meta.preserved` mà người dùng
/// chưa đổi thì ghi lại giá trị thô của file; khóa con lạ trong `meta.unknown` được ghép lại vào nhóm.
pub fn to_entries(settings: &Settings, meta: &FileMeta) -> Vec<(String, Value)> {
    let mut object = to_object(settings);
    object.retain(|key, _| !RUNTIME_KEYS.contains(&key.as_str()));
    for (key, extra) in &meta.unknown {
        if let Some(Value::Object(group)) = object.get_mut(key) {
            for (sub_key, value) in extra {
                group.entry(sub_key.clone()).or_insert_with(|| value.clone());
            }
        }
    }
    for (path, p) in &meta.preserved {
        let slot = match path.split_once('.') {
            None => object.get_mut(path),
            Some((key, sub_key)) => object.get_mut(key).and_then(|group| group.get_mut(sub_key)),
        };
        if let Some(slot) = slot.filter(|v| **v == p.fallback) {
            *slot = p.raw.clone();
        }
    }
    let mut entries: Vec<(String, Value)> = object.into_iter().collect();
    entries.push((
        SCHEMA_VERSION_KEY.to_string(),
        Value::from(meta.version.max(CURRENT_SCHEMA_VERSION)),
    ));
    entries
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{Lang, Theme, UiLanguage};
    use serde_json::json;

    fn defaults() -> Settings {
        Settings::defaults(UiLanguage::En)
    }

    fn object(value: Value) -> Map<String, Value> {
        value.as_object().cloned().unwrap()
    }

    #[test]
    fn empty_file_gives_defaults_and_needs_save() {
        let loaded = load(Map::new(), defaults());
        assert_eq!(loaded.settings, defaults());
        assert_eq!(loaded.meta.version, 0);
        assert!(loaded.rejected.is_empty());
        assert!(loaded.needs_save());
    }

    #[test]
    fn saved_entries_load_back_unchanged() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.theme = Theme::Dark;
        settings.vad_end_silence_ms = 450;
        settings.overlay.lines = 3;
        settings.source_lock = Some(Lang::Ja);
        let raw: Map<String, Value> = to_entries(&settings, &FileMeta::current()).into_iter().collect();
        assert_eq!(raw[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings, settings);
        assert!(!loaded.needs_save());
    }

    #[test]
    fn the_runtime_revision_is_neither_saved_nor_loaded() {
        let mut settings = Settings::defaults(UiLanguage::Vi);
        settings.revision = 7;
        let raw: Map<String, Value> = to_entries(&settings, &FileMeta::current()).into_iter().collect();
        assert!(!raw.contains_key("revision"), "số thứ tự không vào file");
        let mut raw = raw;
        raw.insert("revision".into(), json!(9));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.revision, 0, "số thứ tự trong file (sửa tay) bị bỏ qua");
        assert!(loaded.rejected.is_empty());
    }

    #[test]
    fn unversioned_file_is_migrated_to_current_version() {
        let raw = object(json!({ "uiLanguage": "vi", "theme": "light" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.meta.version, 0);
        assert_eq!(loaded.settings.ui_language, UiLanguage::Vi);
        assert_eq!(loaded.settings.theme, Theme::Light);
        assert!(loaded.needs_save());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
    }

    /// Mặc định đổi từ 300 xuống 150, 50, 100 rồi lại 50 ms: người dùng đã lưu 300 hay 100 thì giữ nguyên, chỉ khóa thiếu hay
    /// hỏng mới về 50.
    #[test]
    fn a_saved_pause_is_kept_when_the_default_changes() {
        let raw = object(json!({ "schemaVersion": 1, "vadEndSilenceMs": 300 }));
        assert_eq!(load(raw, defaults()).settings.vad_end_silence_ms, 300);
        let raw = object(json!({ "schemaVersion": 1, "vadEndSilenceMs": 100 }));
        assert_eq!(load(raw, defaults()).settings.vad_end_silence_ms, 100);
    }

    #[test]
    fn migrations_run_in_order_from_file_version() {
        // Giả lập một schema cũ: bản 0 gọi khóa là `vadSilence`, bản 1 đổi thành `vadEndSilenceMs`,
        // bản 2 đổi đơn vị theme từ số sang chữ.
        fn rename_vad(raw: &mut Map<String, Value>) {
            if let Some(v) = raw.remove("vadSilence") {
                raw.insert("vadEndSilenceMs".into(), v);
            }
        }
        fn theme_from_number(raw: &mut Map<String, Value>) {
            if let Some(n) = raw.get("theme").and_then(Value::as_u64) {
                raw.insert("theme".into(), json!(if n == 2 { "dark" } else { "light" }));
            }
        }
        let steps: &[Migration] = &[rename_vad, theme_from_number];
        let v0 = object(json!({ "vadSilence": 500, "theme": 2 }));
        let loaded = load_with(v0, defaults(), steps);
        assert_eq!(loaded.settings.vad_end_silence_ms, 500);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        // File đã ở bản 1 thì chỉ chạy bước thứ hai.
        let v1 = object(json!({ "schemaVersion": 1, "vadSilence": 500, "theme": 2 }));
        let loaded = load_with(v1, defaults(), steps);
        assert_eq!(loaded.settings.vad_end_silence_ms, 50, "bước 0→1 không chạy lại");
        assert_eq!(loaded.settings.theme, Theme::Dark);
    }

    #[test]
    fn invalid_keys_fall_back_to_defaults_one_by_one() {
        let raw = object(json!({
            "schemaVersion": 1,
            "uiLanguage": "fr",
            "vadEndSilenceMs": 5000,
            "theme": "dark",
            "overlay": { "lines": 9, "fontSize": 30, "opacity": "đậm" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.ui_language, UiLanguage::En);
        assert_eq!(loaded.settings.vad_end_silence_ms, 50);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        assert_eq!(loaded.settings.overlay.font_size, 30, "khóa con hợp lệ vẫn được giữ");
        assert_eq!(loaded.settings.overlay.lines, 2);
        assert_eq!(loaded.settings.overlay.opacity, 0.6);
        let mut rejected = loaded.rejected.clone();
        rejected.sort();
        assert_eq!(
            rejected,
            ["overlay.lines", "overlay.opacity", "uiLanguage", "vadEndSilenceMs"]
        );
        assert!(loaded.needs_save());
    }

    /// File của bản trước chưa có màu phụ đề: chữ trắng trên nền đen (§4.3), các khóa khác của nhóm giữ nguyên. Màu
    /// không có trong bảng màu thì về mặc định.
    #[test]
    fn subtitle_colors_default_to_white_on_black() {
        use crate::settings::{BackgroundColor, TextColor};
        let raw = object(json!({ "schemaVersion": 1, "overlay": { "fontSize": 30 } }));
        let loaded = load(raw, defaults());
        let o = &loaded.settings.overlay;
        assert_eq!(
            (o.text_color, o.background, o.font_size),
            (TextColor::White, BackgroundColor::Black, 30)
        );
        let raw = object(json!({
            "schemaVersion": 1,
            "overlay": { "textColor": "yellow", "background": "pink" },
        }));
        let loaded = load(raw, defaults());
        let o = &loaded.settings.overlay;
        assert_eq!(
            (o.text_color, o.background),
            (TextColor::Yellow, BackgroundColor::Black)
        );
        assert_eq!(loaded.rejected, ["overlay.background"]);
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["overlay"]["textColor"], "yellow");
        assert_eq!(entries["overlay"]["background"], "black");
    }

    /// Spec 2026-10-10 §6.3: file của bản trước chưa có công tắc "Dịch trong lúc người nói chưa dừng" thì công tắc tắt, và
    /// khóa thiếu không bị coi là khóa hỏng. Giá trị đã lưu được giữ; giá trị sai kiểu thì về mặc định.
    #[test]
    fn an_old_file_without_the_live_switch_keeps_it_off() {
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert!(!loaded.settings.translate_while_speaking);
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save(), "khóa thiếu thì không phải ghi lại file");
        let raw = object(json!({ "schemaVersion": 1, "translateWhileSpeaking": true }));
        assert!(load(raw, defaults()).settings.translate_while_speaking);
        let raw = object(json!({ "schemaVersion": 1, "translateWhileSpeaking": "yes" }));
        let loaded = load(raw, defaults());
        assert!(!loaded.settings.translate_while_speaking);
        assert_eq!(loaded.rejected, ["translateWhileSpeaking"]);
    }

    /// Spec 2026-10-24-nguon-micro §4: file của bản trước chưa có ba khóa nguồn micro thì người dùng cũ không đổi gì (âm
    /// thanh máy, micro mặc định, lọc ồn bật), không phải ghi lại file. Giá trị lạ thì về mặc định.
    #[test]
    fn an_old_file_without_mic_keys_keeps_the_playback_mode() {
        use crate::settings::CaptureMode;
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.capture_mode, CaptureMode::Playback);
        assert_eq!(loaded.settings.mic_device, None);
        assert!(loaded.settings.mic_noise_filter);
        assert_eq!(
            loaded.settings.mic_end_silence_ms, 50,
            "ngắt câu riêng của chế độ có micro: mặc định 50 ms"
        );
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save());
        let raw = object(json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "captureMode": "mic",
            "micDevice": "usb-1",
            "micNoiseFilter": false,
        }));
        let s = load(raw, defaults()).settings;
        assert_eq!(
            (s.capture_mode, s.mic_device.as_deref(), s.mic_noise_filter),
            (CaptureMode::Mic, Some("usb-1"), false)
        );
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "captureMode": "both" }));
        assert_eq!(load(raw, defaults()).settings.capture_mode, CaptureMode::Both);
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "micEndSilenceMs": 200 }));
        assert_eq!(load(raw, defaults()).settings.mic_end_silence_ms, 200);
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "micEndSilenceMs": 5000 }));
        let loaded = load(raw, defaults());
        assert_eq!(
            (loaded.settings.mic_end_silence_ms, loaded.rejected),
            (50, vec!["micEndSilenceMs".to_string()])
        );
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "captureMode": "stereo" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.capture_mode, CaptureMode::Playback);
        assert_eq!(loaded.rejected, ["captureMode"]);
    }

    /// Spec 2026-10-17-go-dich §3.5: file của bản trước chưa có nhóm `compose` thì nhận mặc định mà không phải ghi lại; một
    /// khóa con hỏng chỉ kéo khóa con đó về mặc định.
    #[test]
    fn an_old_file_without_compose_gets_the_defaults_and_bad_sub_keys_fall_back_alone() {
        use crate::settings::ComposeTarget;
        let raw = object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "theme": "dark" }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.compose, defaults().compose);
        assert!(loaded.rejected.is_empty());
        assert!(!loaded.needs_save(), "nhóm thiếu thì không phải ghi lại file");
        let raw = object(json!({
            "schemaVersion": CURRENT_SCHEMA_VERSION,
            "compose": { "enabled": false, "target": "fr", "autoPaste": false },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(
            (
                loaded.settings.compose.enabled,
                loaded.settings.compose.target,
                loaded.settings.compose.auto_paste
            ),
            (false, ComposeTarget::Auto, false)
        );
        assert_eq!(loaded.rejected, ["compose.target"]);
    }

    /// Bản trước chỉ có ba phím tắt: hai phím cuộn phụ đề lấy mặc định, và không bị coi là khóa hỏng.
    #[test]
    fn a_file_with_only_the_first_three_hotkeys_gets_the_scroll_defaults() {
        let raw = object(json!({
            "schemaVersion": 1,
            "hotkeys": { "toggleSession": "Ctrl+Alt+K", "toggleOverlay": "Ctrl+Alt+H", "toggleLock": "Ctrl+Alt+L" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+K");
        assert_eq!(loaded.settings.hotkeys.scroll_up, "Ctrl+Alt+PageUp");
        assert_eq!(loaded.settings.hotkeys.scroll_down, "Ctrl+Alt+PageDown");
        assert!(loaded.rejected.is_empty());
    }

    #[test]
    fn swapped_hotkeys_are_kept_together() {
        let raw = object(json!({
            "schemaVersion": 1,
            "hotkeys": { "toggleSession": "Ctrl+Alt+H", "toggleOverlay": "Ctrl+Alt+T" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+H");
        assert_eq!(loaded.settings.hotkeys.toggle_overlay, "Ctrl+Alt+T");
        assert!(loaded.rejected.is_empty());
    }

    #[test]
    fn newer_file_keeps_its_version_and_unknown_keys_are_ignored() {
        let raw = object(json!({ "schemaVersion": 7, "theme": "dark", "futureKey": { "a": 1 } }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.meta.version, 7);
        assert_eq!(loaded.settings.theme, Theme::Dark);
        assert!(!loaded.needs_save());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(7), "không hạ phiên bản của file");
        assert!(
            !entries.contains_key("futureKey"),
            "chỉ ghi khóa đã biết; khóa lạ trong file giữ nguyên"
        );
    }

    #[test]
    fn newer_file_keeps_values_this_version_cannot_read() {
        // Bản app mới hơn (schema 7) ghi `theme: 2` và `overlay.lines: 9`; bản này không đọc được.
        let raw = object(json!({
            "schemaVersion": 7,
            "theme": 2,
            "overlay": { "lines": 9, "fontSize": 30 },
        }));
        let loaded = load(raw, defaults());
        let mut rejected = loaded.rejected.clone();
        rejected.sort();
        assert_eq!(rejected, ["overlay.lines", "theme"]);
        assert_eq!(loaded.settings.theme, Theme::System, "lúc chạy dùng mặc định");
        assert!(!loaded.needs_save(), "không ghi đè file chỉ vì đọc không được");
        // Ghi lại (ví dụ người dùng đổi khóa khác): giữ giá trị thô của file.
        let mut settings = loaded.settings.clone();
        settings.vad_end_silence_ms = 500;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!(2));
        assert_eq!(entries["overlay"]["lines"], json!(9));
        assert_eq!(entries["overlay"]["fontSize"], json!(30));
        assert_eq!(entries["vadEndSilenceMs"], json!(500));
        // Người dùng tự đổi chính khóa đó: ghi giá trị mới.
        settings.theme = Theme::Dark;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!("dark"));
    }

    #[test]
    fn newer_file_keeps_unknown_sub_keys_of_groups() {
        let raw = object(json!({
            "schemaVersion": 7,
            "overlay": { "fontSize": 30, "futureSub": 1 },
            "experimental": { "newFlag": true },
        }));
        let loaded = load(raw, defaults());
        assert!(loaded.rejected.is_empty());
        assert_eq!(loaded.settings.overlay.font_size, 30);
        assert!(!loaded.needs_save());
        // Ghi lại sau khi người dùng đổi một khóa con của chính nhóm đó.
        let mut settings = loaded.settings.clone();
        settings.overlay.lines = 3;
        let entries: Map<String, Value> = to_entries(&settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["overlay"]["futureSub"], json!(1));
        assert_eq!(entries["overlay"]["fontSize"], json!(30));
        assert_eq!(entries["overlay"]["lines"], json!(3));
        assert_eq!(entries["experimental"]["newFlag"], json!(true));
        assert_eq!(entries["experimental"]["translationContext"], json!(false));
        // File cùng phiên bản: khóa con lạ không phải của bản nào cả, không giữ.
        let raw = object(json!({ "schemaVersion": 1, "overlay": { "futureSub": 1 } }));
        let loaded = load(raw, defaults());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert!(entries["overlay"].get("futureSub").is_none());
    }

    #[test]
    fn schema_version_beyond_u32_counts_as_newer() {
        let raw = object(json!({ "schemaVersion": u64::from(u32::MAX) + 1, "theme": 2 }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.meta.version, u32::MAX);
        assert!(!loaded.needs_save(), "file của bản mới hơn, không ghi đè");
        assert!(
            loaded.meta.preserved.contains_key("theme"),
            "giữ giá trị bản này không đọc được"
        );
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(u32::MAX));
        assert_eq!(entries["theme"], json!(2));
    }

    #[test]
    fn hotkeys_are_canonicalized_on_load() {
        let raw = object(json!({
            "schemaVersion": 1,
            "hotkeys": { "toggleSession": "control+alt+KeyK", "toggleLock": "Alt+Ctrl+l" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+K");
        assert_eq!(loaded.settings.hotkeys.toggle_overlay, "Ctrl+Alt+H");
        assert_eq!(loaded.settings.hotkeys.toggle_lock, "Ctrl+Alt+L");
        assert!(loaded.rejected.is_empty());
        assert_eq!(loaded.normalized, ["hotkeys.toggleSession", "hotkeys.toggleLock"]);
        assert!(loaded.needs_save(), "ghi lại dạng chuẩn");
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["hotkeys"]["toggleSession"], json!("Ctrl+Alt+K"));
        // Đã ở dạng chuẩn: không có gì để ghi lại.
        let raw =
            object(json!({ "schemaVersion": CURRENT_SCHEMA_VERSION, "hotkeys": { "toggleSession": "Ctrl+Alt+K" } }));
        let loaded = load(raw, defaults());
        assert!(loaded.normalized.is_empty());
        assert!(!loaded.needs_save());
        // File của bản mới hơn: chuẩn hóa lúc chạy, nhưng không ghi đè file chỉ vì vậy.
        let raw = object(json!({ "schemaVersion": 7, "hotkeys": { "toggleSession": "control+alt+KeyK" } }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+K");
        assert!(!loaded.needs_save());
    }

    #[test]
    fn current_version_file_with_bad_keys_is_repaired() {
        let raw = object(json!({ "schemaVersion": 1, "theme": 2 }));
        let loaded = load(raw, defaults());
        assert!(loaded.needs_save());
        assert!(loaded.meta.preserved.is_empty());
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries["theme"], json!("system"));
    }

    /// Spec 2026-10-17 §5: người dùng đã cài từ trước (đã xong onboarding) giữ báo cáo lỗi bật mà không hỏi; mọi trường hợp
    /// khác bắt đầu tắt.
    #[test]
    fn existing_users_keep_error_reports_on_and_new_installs_start_off() {
        let migrated = |raw: Value| load(object(raw), defaults()).settings.send_error_reports;
        assert!(
            migrated(json!({ "schemaVersion": 1, "onboardingDone": true })),
            "file bản 1, đã xong onboarding"
        );
        assert!(
            migrated(json!({ "onboardingDone": true })),
            "file chưa có schemaVersion (bản 0), đã xong onboarding"
        );
        assert!(
            !migrated(json!({ "schemaVersion": 1, "onboardingDone": false })),
            "cài dở: chờ bước Điều khoản"
        );
        assert!(!migrated(json!({ "schemaVersion": 1 })), "chưa từng xong onboarding");
        assert!(!migrated(json!({})), "cài mới (không có file)");
        // Đã ở bản 2 thì bước migrate không chạy lại: người dùng đã tắt thì vẫn tắt.
        assert!(!migrated(json!({ "schemaVersion": 2, "onboardingDone": true })));
        assert!(!migrated(
            json!({ "schemaVersion": 2, "onboardingDone": true, "sendErrorReports": false })
        ));
        assert!(migrated(
            json!({ "schemaVersion": 2, "onboardingDone": true, "sendErrorReports": true })
        ));
        // Giá trị người dùng đã có (không thể có ở bản 1 thật, nhưng file sửa tay) không bị ghi đè.
        assert!(!migrated(
            json!({ "schemaVersion": 1, "onboardingDone": true, "sendErrorReports": false })
        ));
    }

    #[test]
    fn migrating_an_existing_file_asks_to_save_it_with_the_new_version() {
        let loaded = load(
            object(json!({ "schemaVersion": 1, "onboardingDone": true })),
            defaults(),
        );
        assert!(loaded.needs_save(), "file bản 1 phải được ghi lại ở bản hiện tại");
        let entries: Map<String, Value> = to_entries(&loaded.settings, &loaded.meta).into_iter().collect();
        assert_eq!(entries[SCHEMA_VERSION_KEY], json!(CURRENT_SCHEMA_VERSION));
        assert_eq!(entries["sendErrorReports"], json!(true));
        // Cài mới: sau lần ghi đầu, khóa là false.
        let fresh = load(Map::new(), defaults());
        let entries: Map<String, Value> = to_entries(&fresh.settings, &fresh.meta).into_iter().collect();
        assert_eq!(entries["sendErrorReports"], json!(false));
    }

    /// Spec 2026-10-17-go-dich §3.5: file bản 2 chưa có phím Gõ dịch thì nhận `Ctrl+Alt+G`, không bị coi là khóa hỏng.
    #[test]
    fn a_version_2_file_gets_the_compose_hotkey() {
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleSession": "Ctrl+Alt+K", "scrollUp": "Ctrl+Alt+PageUp" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+G");
        assert_eq!(loaded.settings.hotkeys.toggle_session, "Ctrl+Alt+K");
        assert!(loaded.rejected.is_empty());
        assert!(loaded.needs_save(), "ghi lại ở bản 3");
    }

    /// Người dùng đã tự đặt `Ctrl+Alt+G` (viết kiểu nào cũng vậy) cho việc khác: giữ phím của họ, Gõ dịch nhận phím dự phòng
    /// đầu tiên còn trống. File bản 3 thì bước này không chạy lại.
    #[test]
    fn a_user_shortcut_on_ctrl_alt_g_is_kept() {
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleLock": "control+alt+KeyG" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.toggle_lock, "Ctrl+Alt+G");
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+Shift+G");
        assert!(loaded.rejected.is_empty());
        let raw = object(json!({
            "schemaVersion": 2,
            "hotkeys": { "toggleLock": "Ctrl+Alt+G", "toggleOverlay": "Ctrl+Alt+Shift+G" },
        }));
        let loaded = load(raw, defaults());
        assert_eq!(loaded.settings.hotkeys.compose, "Ctrl+Alt+Y");
        assert_eq!(
            (
                loaded.settings.hotkeys.toggle_lock.as_str(),
                loaded.settings.hotkeys.toggle_overlay.as_str()
            ),
            ("Ctrl+Alt+G", "Ctrl+Alt+Shift+G")
        );
        let raw = object(json!({
            "schemaVersion": 3,
            "hotkeys": { "toggleLock": "Ctrl+Alt+J", "compose": "Ctrl+Alt+Q" },
        }));
        assert_eq!(load(raw, defaults()).settings.hotkeys.compose, "Ctrl+Alt+Q");
    }
}
