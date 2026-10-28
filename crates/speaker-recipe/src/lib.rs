//! Công thức đọc tên người nói từ app họp (spec 2026-10-26-phan-biet-nguoi-noi §7.1): định dạng, kiểm, biên dịch mẫu chữ. Chỉ mô
//! tả, không mã. App và `speaker-worker` dùng chung; worker kiểm lại mọi công thức app gửi.
//!
//! - Bản build sẵn: `scripts/speaker-recipes/recipes.json`, nhúng vào [`BUILTIN_JSON`].
//! - Giới hạn an toàn: cả file ≤ 256 KB; mỗi mẫu chữ ≤ 256 ký tự, crate `regex` (thời gian tuyến tính); app phải thuộc danh sách
//!   viết cứng (`speaker_protocol::MeetingApp`), không thì bỏ cả mục; mục sai nào bị bỏ riêng mục đó, mục khác vẫn dùng.
//! - Kế hoạch 06 thêm phong bì ký, tải từ xa, chống quay lui ở app, rồi gọi [`parse`] lên phần thân như bản build sẵn.
//! - Công thức không có tên người; lý do bỏ mục (`Recipes::dropped`) không chứa chữ đọc từ app họp. [`Attrs`] có thể chứa chữ của
//!   app họp nên `Debug` chỉ in vai trò.

#![forbid(unsafe_code)]

use std::fmt;

use regex::{Regex, RegexBuilder};
use serde::Deserialize;
use speaker_protocol::MAX_RECIPE_BYTES;
pub use speaker_protocol::MeetingApp;

/// Công thức build sẵn trong app.
pub const BUILTIN_JSON: &str = include_str!("../../../scripts/speaker-recipes/recipes.json");
/// Phiên bản định dạng app này đọc.
pub const SCHEMA: u32 = 1;
pub const MAX_PATTERN_CHARS: usize = 256;
pub const MAX_APPS: usize = 16;
pub const MAX_SIGNALS: usize = 8;
pub const MAX_PATTERNS: usize = 16;
pub const MAX_DELAY_MS: u32 = 5_000;
pub const MAX_ANCHOR_DEPTH: u32 = 8;
/// Tên dài tối đa 40 ký tự (spec §6.3).
pub const MAX_NAME_CHARS: usize = 40;
/// Bộ nhớ tối đa của một mẫu chữ đã biên dịch.
const REGEX_SIZE_LIMIT: usize = 1 << 20;

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Os {
    Macos,
    Windows,
}

impl Os {
    /// Hệ điều hành đang chạy; `None` trên nền tảng không có bộ đọc.
    pub fn current() -> Option<Os> {
        if cfg!(target_os = "macos") {
            Some(Os::Macos)
        } else if cfg!(windows) {
            Some(Os::Windows)
        } else {
            None
        }
    }

    /// Vai trò của phần tử gốc "vùng web" trong cây giao diện của trình duyệt (spec §6.2): bộ đọc chỉ đọc chữ trong vùng web có
    /// tiêu đề khớp công thức. macOS: `AXWebArea`; Windows (UI Automation): `Document`.
    pub fn web_role(self) -> &'static str {
        match self {
            Os::Macos => "AXWebArea",
            Os::Windows => "Document",
        }
    }

    /// Vai trò của chữ tĩnh (tên của ô Meet là chữ tĩnh đầu tiên trong ô, `NameFrom::Text`). macOS: `AXStaticText`; Windows: `Text`.
    pub fn static_text_role(self) -> &'static str {
        match self {
            Os::Macos => "AXStaticText",
            Os::Windows => "Text",
        }
    }

    /// Vai trò và vai trò phụ của dòng cửa sổ trong bản ghi cây định dạng fixture (`reader::extract::dump_lines`).
    pub fn window_role(self) -> (&'static str, &'static str) {
        match self {
            Os::Macos => ("AXWindow", "AXStandardWindow"),
            Os::Windows => ("Window", ""),
        }
    }
}

/// Thuộc tính một phần tử giao diện mà bộ đọc dùng. macOS: AXRole, AXSubrole, AXTitle, AXDescription, AXValue, AXIdentifier,
/// AXDOMIdentifier, AXDOMClassList. Windows (UI Automation, kế hoạch 05): `role` là tên loại điều khiển ("Button", "MenuItem",
/// "Group", "Document"…), `subrole` là vai trò ARIA, `title` là `Name` (kèm `value` khi là "Text"), `ident` là `AutomationId`,
/// `classes` là các từ của `ClassName`; `desc` và `dom_id` để trống. Có thể chứa chữ của app họp: không in ra log.
#[derive(Clone, Default, PartialEq, Eq, Hash)]
pub struct Attrs {
    pub role: String,
    pub subrole: String,
    pub title: String,
    pub desc: String,
    pub value: String,
    pub ident: String,
    pub dom_id: String,
    pub classes: Vec<String>,
}

impl Attrs {
    /// Nhãn: mô tả, không có thì tiêu đề.
    pub fn label(&self) -> &str {
        if self.desc.is_empty() { &self.title } else { &self.desc }
    }

    pub fn has_text(&self) -> bool {
        !(self.title.is_empty() && self.desc.is_empty() && self.value.is_empty())
    }
}

impl fmt::Debug for Attrs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "Attrs({}/{}, {} lớp, có chữ: {})",
            self.role,
            self.subrole,
            self.classes.len(),
            self.has_text()
        )
    }
}

/// Điều kiện khớp một phần tử; trường `None` là không xét.
#[derive(Debug, Clone, Default)]
pub struct Matcher {
    pub role: Option<String>,
    pub subrole: Option<String>,
    /// Một lớp trong `AXDOMClassList`.
    pub class_token: Option<String>,
    /// Tiền tố của `AXIdentifier` hay `AXDOMIdentifier`.
    pub id_prefix: Option<String>,
    /// Mẫu chữ trên nhãn ([`Attrs::label`]); nhóm `name`, `muted`, `self`, `speaking` nếu có.
    pub label: Option<Regex>,
}

impl Matcher {
    /// Khớp phần không cần chữ: vai trò, vai trò phụ, lớp, id (QĐ 3 của kế hoạch 04: chữ chỉ đọc khi phần này đã khớp).
    pub fn matches_shape(&self, a: &Attrs) -> bool {
        self.role.as_ref().is_none_or(|r| a.role == *r)
            && self.subrole.as_ref().is_none_or(|r| a.subrole == *r)
            && self
                .class_token
                .as_ref()
                .is_none_or(|c| a.classes.iter().any(|x| x == c))
            && self
                .id_prefix
                .as_ref()
                .is_none_or(|p| a.ident.starts_with(p.as_str()) || a.dom_id.starts_with(p.as_str()))
    }

    /// Cần đọc chữ (nhãn) mới biết có khớp không.
    pub fn needs_text(&self) -> bool {
        self.label.is_some()
    }

    /// Khớp đủ; `a` phải đã có chữ khi [`Matcher::needs_text`].
    pub fn matches(&self, a: &Attrs) -> bool {
        self.matches_shape(a) && self.label.as_ref().is_none_or(|re| re.is_match(a.label()))
    }

    /// Không ràng buộc hình dạng nào: bộ đọc phải đọc chữ của mọi phần tử để khớp.
    pub fn shapeless(&self) -> bool {
        self.role.is_none() && self.subrole.is_none() && self.class_token.is_none() && self.id_prefix.is_none()
    }
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NameFrom {
    /// Nhóm `name` của mẫu nhãn ô (Teams, Zoom).
    Label,
    /// Chữ tĩnh đầu tiên trong ô (Meet).
    Text,
}

/// Trạng thái mic đọc từ nhóm `muted` của nhãn ô (tín hiệu 3, spec §6.4).
#[derive(Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct MicRule {
    pub muted_values: Vec<String>,
    /// Nhãn không có nhóm `muted` nghĩa là mic mở (Teams chỉ ghi "muted" khi tắt).
    #[serde(default)]
    pub absent_means_unmuted: bool,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SignalKind {
    /// Tín hiệu 1: nhóm `speaking` của mẫu nhãn ô không rỗng.
    Label,
    /// Tín hiệu 2: phần tử neo chỉ có mặt khi nói.
    Presence,
    /// Tín hiệu 2: phần tử neo đổi trạng thái ≥ 2 lần trong 1 s.
    Flicker,
    /// Tín hiệu 2: phần tử neo khác trạng thái thường gặp nhất của chính nó.
    Deviation,
}

#[derive(Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    /// Con trực tiếp của ô.
    Child,
    /// Phần tử bên trong ô, sâu tối đa `max_depth`.
    Descendant,
}

#[derive(Debug, Clone)]
pub struct Anchor {
    pub scope: Scope,
    pub matcher: Matcher,
    pub max_depth: u32,
}

#[derive(Debug, Clone)]
pub struct Signal {
    pub kind: SignalKind,
    pub anchor: Option<Anchor>,
}

/// Công thức của một app trên một hệ điều hành.
#[derive(Debug, Clone)]
pub struct AppRecipe {
    pub app: MeetingApp,
    pub os: Os,
    /// Cửa sổ họp: tiêu đề khớp một mẫu, hay id cửa sổ khớp `window_id`.
    pub window_title: Vec<Regex>,
    pub window_id: Option<Regex>,
    /// Chỉ đọc trong vùng web (`AXWebArea`) có tiêu đề khớp `window_title` (trình duyệt).
    pub web_only: bool,
    /// Đặt `AXEnhancedUserInterface` khi gặp cửa sổ họp (spec §6.2).
    pub enhanced_ui: bool,
    /// Id phải có trong cửa sổ (Teams: nút rời cuộc gọi); không có thì không phải cửa sổ họp.
    pub confirm_id: Option<String>,
    pub tile: Matcher,
    pub name_from: NameFrom,
    pub name_suffixes: Vec<Regex>,
    /// Tên thô khớp mẫu này là chính người dùng.
    pub self_name: Option<Regex>,
    pub mic: Option<MicRule>,
    /// Theo thứ tự ưu tiên (spec §6.4).
    pub speaking: Vec<Signal>,
    /// Độ trễ của chỉ báo so với lúc nói (spec §6.6), ms.
    pub delay_ms: u32,
}

#[derive(Debug, Clone)]
pub struct Recipes {
    pub version: u32,
    pub min_app_version: String,
    pub apps: Vec<AppRecipe>,
    /// Lý do bỏ từng mục (cho log), không có chữ của app họp.
    pub dropped: Vec<String>,
}

impl Recipes {
    pub fn app(&self, os: Os, app: MeetingApp) -> Option<&AppRecipe> {
        self.apps.iter().find(|a| a.os == os && a.app == app)
    }

    pub fn has_os(&self, os: Os) -> bool {
        self.apps.iter().any(|a| a.os == os)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RecipeError {
    #[error("công thức dài {0} byte, vượt 256 KB")]
    TooBig(usize),
    #[error("công thức không đúng dạng JSON: {0}")]
    Json(String),
    #[error("công thức có schema {0}, bản này đọc schema {SCHEMA}")]
    Schema(u32),
}

#[derive(Deserialize)]
struct RawRecipes {
    schema: u32,
    version: u32,
    #[serde(default)]
    min_app_version: String,
    apps: Vec<serde_json::Value>,
}

#[derive(Deserialize, Default)]
struct RawMatcher {
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    subrole: Option<String>,
    #[serde(default)]
    class_token: Option<String>,
    #[serde(default)]
    id_prefix: Option<String>,
    #[serde(default)]
    label: Option<String>,
}

fn one() -> u32 {
    1
}

#[derive(Deserialize)]
struct RawAnchor {
    scope: Scope,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    subrole: Option<String>,
    #[serde(default)]
    class_token: Option<String>,
    #[serde(default)]
    id_prefix: Option<String>,
    #[serde(default = "one")]
    max_depth: u32,
}

#[derive(Deserialize)]
struct RawSignal {
    kind: SignalKind,
    #[serde(default)]
    anchor: Option<RawAnchor>,
}

#[derive(Deserialize)]
struct RawApp {
    app: MeetingApp,
    os: Os,
    #[serde(default)]
    window_title: Vec<String>,
    #[serde(default)]
    window_id: Option<String>,
    #[serde(default)]
    web_only: bool,
    #[serde(default)]
    enhanced_ui: bool,
    #[serde(default)]
    confirm_id: Option<String>,
    tile: RawMatcher,
    name_from: NameFrom,
    #[serde(default)]
    name_suffixes: Vec<String>,
    #[serde(default)]
    self_name: Option<String>,
    #[serde(default)]
    mic: Option<MicRule>,
    speaking: Vec<RawSignal>,
    delay_ms: u32,
}

/// Đọc và kiểm một công thức (phần thân; kế hoạch 06 kiểm chữ ký trước). Lỗi cả file (quá lớn, không phải JSON, schema khác) thì
/// `Err`; mục sai thì bỏ riêng mục đó (`Recipes::dropped`).
pub fn parse(json: &str) -> Result<Recipes, RecipeError> {
    if json.len() > MAX_RECIPE_BYTES {
        return Err(RecipeError::TooBig(json.len()));
    }
    let raw: RawRecipes = serde_json::from_str(json).map_err(|e| RecipeError::Json(e.to_string()))?;
    if raw.schema != SCHEMA {
        return Err(RecipeError::Schema(raw.schema));
    }
    let mut apps: Vec<AppRecipe> = Vec::new();
    let mut dropped = Vec::new();
    for (i, value) in raw.apps.into_iter().enumerate() {
        if i >= MAX_APPS {
            dropped.push(format!("mục {i}: quá {MAX_APPS} mục"));
            continue;
        }
        let compiled = serde_json::from_value::<RawApp>(value)
            .map_err(|e| format!("sai dạng ({e})"))
            .and_then(compile_app);
        match compiled {
            Ok(a) if apps.iter().any(|b| b.app == a.app && b.os == a.os) => dropped.push(format!("mục {i}: trùng app")),
            Ok(a) => apps.push(a),
            Err(why) => dropped.push(format!("mục {i}: {why}")),
        }
    }
    Ok(Recipes {
        version: raw.version,
        min_app_version: raw.min_app_version,
        apps,
        dropped,
    })
}

fn pattern(s: &str) -> Result<Regex, String> {
    if s.chars().count() > MAX_PATTERN_CHARS {
        return Err(format!("mẫu chữ dài quá {MAX_PATTERN_CHARS} ký tự"));
    }
    RegexBuilder::new(s)
        .size_limit(REGEX_SIZE_LIMIT)
        .build()
        .map_err(|_| "mẫu chữ sai".to_string())
}

fn patterns(list: &[String]) -> Result<Vec<Regex>, String> {
    if list.len() > MAX_PATTERNS {
        return Err(format!("quá {MAX_PATTERNS} mẫu chữ"));
    }
    list.iter().map(|s| pattern(s)).collect()
}

fn has_group(re: &Option<Regex>, name: &str) -> bool {
    re.as_ref()
        .is_some_and(|re| re.capture_names().flatten().any(|n| n == name))
}

fn compile_app(r: RawApp) -> Result<AppRecipe, String> {
    let tile = Matcher {
        role: r.tile.role,
        subrole: r.tile.subrole,
        class_token: r.tile.class_token,
        id_prefix: r.tile.id_prefix,
        label: r.tile.label.as_deref().map(pattern).transpose()?,
    };
    if r.name_from == NameFrom::Label && !has_group(&tile.label, "name") {
        return Err("lấy tên từ nhãn mà mẫu nhãn không có nhóm `name`".into());
    }
    if r.speaking.is_empty() || r.speaking.len() > MAX_SIGNALS {
        return Err(format!("cần 1–{MAX_SIGNALS} tín hiệu đang nói"));
    }
    if r.delay_ms > MAX_DELAY_MS {
        return Err(format!("độ trễ quá {MAX_DELAY_MS} ms"));
    }
    if r.window_title.is_empty() && r.window_id.is_none() {
        return Err("không có quy tắc nhận cửa sổ họp".into());
    }
    if tile.shapeless() {
        // QĐ 3 của kế hoạch 04 (rà soát A-Q11): ô không ràng buộc vai trò, lớp hay id thì bộ đọc phải đọc chữ (hay coi là ô) mọi
        // phần tử của cửa sổ họp, kể cả khung chat.
        return Err("ô phải có vai trò, vai trò phụ, lớp hay id".into());
    }
    let mut speaking = Vec::new();
    for s in r.speaking {
        let anchor = match (s.kind, s.anchor) {
            (SignalKind::Label, _) => {
                if !has_group(&tile.label, "speaking") {
                    return Err("tín hiệu chữ mà mẫu nhãn không có nhóm `speaking`".into());
                }
                None
            }
            (_, None) => return Err("tín hiệu hành vi cần phần tử neo".into()),
            (_, Some(a)) => {
                if a.role.is_none() && a.subrole.is_none() && a.class_token.is_none() && a.id_prefix.is_none() {
                    return Err("phần tử neo phải có vai trò, lớp hay id".into());
                }
                if a.max_depth == 0 || a.max_depth > MAX_ANCHOR_DEPTH {
                    return Err(format!("độ sâu của neo phải trong 1–{MAX_ANCHOR_DEPTH}"));
                }
                Some(Anchor {
                    scope: a.scope,
                    max_depth: if a.scope == Scope::Child { 1 } else { a.max_depth },
                    matcher: Matcher {
                        role: a.role,
                        subrole: a.subrole,
                        class_token: a.class_token,
                        id_prefix: a.id_prefix,
                        label: None,
                    },
                })
            }
        };
        speaking.push(Signal { kind: s.kind, anchor });
    }
    Ok(AppRecipe {
        app: r.app,
        os: r.os,
        window_title: patterns(&r.window_title)?,
        window_id: r.window_id.as_deref().map(pattern).transpose()?,
        web_only: r.web_only,
        enhanced_ui: r.enhanced_ui,
        confirm_id: r.confirm_id,
        tile,
        name_from: r.name_from,
        name_suffixes: patterns(&r.name_suffixes)?,
        self_name: r.self_name.as_deref().map(pattern).transpose()?,
        mic: r.mic,
        speaking,
        delay_ms: r.delay_ms,
    })
}

/// Làm gọn tên đọc từ ô (spec §6.3): ký tự điều khiển thành khoảng trắng, bỏ hậu tố theo công thức, gộp khoảng trắng, tối đa 40
/// ký tự. App còn làm sạch lần nữa bằng `clean_name` (ký tự định dạng vô hình) trước khi hiện.
pub fn tidy_name(raw: &str, app: &AppRecipe) -> Option<String> {
    let mut name: String = raw.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    name = name.trim().to_string();
    for re in &app.name_suffixes {
        name = re.replace(&name, "").into_owned();
    }
    let joined = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let cut: String = joined.chars().take(MAX_NAME_CHARS).collect();
    let cut = cut.trim_end().to_string();
    (!cut.is_empty()).then_some(cut)
}

/// Tên thô là chính người dùng (spec §6.6: "(me)" của Zoom, "Bạn"/"You" của Meet; Teams dùng nhóm `self` của nhãn).
pub fn is_self_name(raw: &str, app: &AppRecipe) -> bool {
    app.self_name.as_ref().is_some_and(|re| re.is_match(raw.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn teams() -> AppRecipe {
        parse(BUILTIN_JSON)
            .unwrap()
            .app(Os::Macos, MeetingApp::Teams)
            .unwrap()
            .clone()
    }

    /// Một mục Teams tối thiểu hợp lệ, cộng các mục `extra` (chuỗi JSON bắt đầu bằng dấu phẩy).
    fn with_apps(extra: &str) -> String {
        format!(
            r#"{{"schema":1,"version":3,"min_app_version":"0.3.2","apps":[{{"app":"teams","os":"macos","window_title":["^M"],"tile":{{"role":"AXMenuItem","label":"^(?P<name>.+)$"}},"name_from":"label","speaking":[{{"kind":"presence","anchor":{{"scope":"child","class_token":"x"}}}}],"delay_ms":900}}{extra}]}}"#
        )
    }

    /// QĐ 16, 32 của kế hoạch 04: bản build sẵn chỉ có Teams. Zoom chưa có bản ghi thật (rà soát A-Q11); Meet không có chỉ báo ở cửa
    /// sổ người nghe (rà soát lần 2 A-Q1). Task 21 thêm lại khi đạt tiêu chí và chủ dự án đồng ý.
    #[test]
    fn the_builtin_recipes_cover_only_teams_on_macos() {
        let r = parse(BUILTIN_JSON).unwrap();
        assert!(r.dropped.is_empty(), "{:?}", r.dropped);
        assert!(r.version >= 1);
        assert!(r.app(Os::Macos, MeetingApp::Teams).is_some());
        for app in [MeetingApp::Zoom, MeetingApp::MeetChrome, MeetingApp::MeetEdge] {
            assert!(r.app(Os::Macos, app).is_none(), "{app:?} tắt mặc định");
        }
        assert!(!r.has_os(Os::Windows), "kế hoạch 05 thêm Windows");
    }

    /// Spec §7.1: app trong công thức phải thuộc danh sách viết cứng, không thì bỏ cả mục đó; mục khác vẫn dùng.
    #[test]
    fn an_app_outside_the_list_drops_only_its_entry() {
        let json = with_apps(
            r#",{"app":"webex","os":"macos","window_title":["^W"],"tile":{"role":"AXGroup"},"name_from":"text","speaking":[{"kind":"presence","anchor":{"scope":"child","role":"AXGroup"}}],"delay_ms":500}"#,
        );
        let r = parse(&json).unwrap();
        assert_eq!(r.apps.len(), 1);
        assert_eq!(r.dropped.len(), 1, "{:?}", r.dropped);
        assert_eq!(r.version, 3);
        let teams_entry = r#"{"app":"teams","os":"macos","window_title":["^M"],"tile":{"role":"AXMenuItem","label":"^(?P<name>.+)$"},"name_from":"label","speaking":[{"kind":"presence","anchor":{"scope":"child","class_token":"x"}}],"delay_ms":900}"#;
        let r = parse(&with_apps(&format!(",{teams_entry}"))).unwrap();
        assert_eq!((r.apps.len(), r.dropped.len()), (1, 1), "mục trùng app bị bỏ");
    }

    #[test]
    fn size_schema_and_pattern_limits_are_enforced() {
        // `Recipes` chứa `Regex` (không có `PartialEq`): so lỗi, không so cả `Result` (rà soát A-C2.1, lỗi E0369).
        assert_eq!(
            parse(&" ".repeat(speaker_protocol::MAX_RECIPE_BYTES + 1)).unwrap_err(),
            RecipeError::TooBig(speaker_protocol::MAX_RECIPE_BYTES + 1)
        );
        assert_eq!(
            parse(&with_apps("").replace("\"schema\":1", "\"schema\":2")).unwrap_err(),
            RecipeError::Schema(2)
        );
        assert!(matches!(parse("{"), Err(RecipeError::Json(_))));
        let long = with_apps("").replace("^M", &format!("^{}", "a".repeat(MAX_PATTERN_CHARS)));
        let r = parse(&long).unwrap();
        assert!(r.apps.is_empty() && r.dropped[0].contains("256"), "{:?}", r.dropped);
        let slow = with_apps("").replace("\"delay_ms\":900", "\"delay_ms\":9000");
        assert!(parse(&slow).unwrap().apps.is_empty());
    }

    #[test]
    fn signals_need_what_they_read() {
        let no_group = with_apps("").replace(
            r#"{"kind":"presence","anchor":{"scope":"child","class_token":"x"}}"#,
            r#"{"kind":"label"}"#,
        );
        assert!(
            parse(&no_group).unwrap().apps.is_empty(),
            "chữ đang nói cần nhóm `speaking`"
        );
        let no_anchor = with_apps("").replace(r#","anchor":{"scope":"child","class_token":"x"}"#, "");
        assert!(
            parse(&no_anchor).unwrap().apps.is_empty(),
            "tín hiệu hành vi cần phần tử neo"
        );
        let shapeless = with_apps("").replace(r#""class_token":"x""#, r#""max_depth":2"#);
        assert!(
            parse(&shapeless).unwrap().apps.is_empty(),
            "neo không ràng buộc gì thì khớp mọi phần tử"
        );
        let no_name = with_apps("").replace("(?P<name>.+)", "(.+)");
        assert!(
            parse(&no_name).unwrap().apps.is_empty(),
            "lấy tên từ nhãn cần nhóm `name`"
        );
        let shapeless_tile = with_apps("").replace(r#""role":"AXMenuItem","label""#, r#""label""#);
        assert!(
            parse(&shapeless_tile).unwrap().apps.is_empty(),
            "ô không ràng buộc hình dạng thì bộ đọc phải đọc chữ mọi phần tử (QĐ 3): bỏ"
        );
    }

    /// Spec §6.3: bỏ hậu tố theo công thức, tối đa 40 ký tự; không còn gì thì không có tên.
    #[test]
    fn names_are_tidied_by_the_recipe() {
        let t = teams();
        assert_eq!(tidy_name("Minh (Guest)", &t).as_deref(), Some("Minh"));
        assert_eq!(tidy_name("  Lan \n Nguyễn  (Khách)", &t).as_deref(), Some("Lan Nguyễn"));
        assert_eq!(
            tidy_name(&"ạ".repeat(60), &t).map(|n| n.chars().count()),
            Some(MAX_NAME_CHARS)
        );
        assert_eq!(tidy_name(" (Guest)", &t), None);
    }

    /// Ba dạng nhãn ô video của Teams trong bản ghi của kế hoạch 01 (`results/teams-chrome.md`).
    #[test]
    fn teams_tile_labels_give_name_mute_and_self() {
        let t = teams();
        let re = t.tile.label.as_ref().unwrap();
        let c = re.captures("Minh (Guest), Context menu is available").unwrap();
        assert_eq!(
            (&c["name"], c.name("muted").is_none(), c.name("self").is_none()),
            ("Minh (Guest)", true, true)
        );
        let c = re.captures("Lan (Guest), muted, Context menu is available").unwrap();
        assert_eq!((&c["name"], &c["muted"]), ("Lan (Guest)", "muted"));
        let c = re.captures("Myself video, Hoa Phạm, Muted, Has context menu").unwrap();
        assert_eq!(
            (&c["name"], &c["muted"], &c["self"]),
            ("Hoa Phạm", "Muted", "Myself video")
        );
        assert!(re.captures("Chat, 3 unread").is_none());
    }

    /// Kế hoạch 05: vai trò của vùng web và của cửa sổ theo hệ điều hành.
    #[test]
    fn web_and_window_roles_follow_the_os() {
        assert_eq!(Os::Macos.web_role(), "AXWebArea");
        assert_eq!(Os::Windows.web_role(), "Document");
        assert_eq!(Os::Macos.static_text_role(), "AXStaticText");
        assert_eq!(Os::Windows.static_text_role(), "Text");
        assert_eq!(Os::Macos.window_role(), ("AXWindow", "AXStandardWindow"));
        assert_eq!(Os::Windows.window_role(), ("Window", ""));
    }

    #[test]
    fn matchers_check_every_given_field() {
        let m = Matcher {
            role: Some("AXGroup".into()),
            class_token: Some("oZRSLe".into()),
            ..Matcher::default()
        };
        let mut a = Attrs {
            role: "AXGroup".into(),
            classes: vec!["x".into(), "oZRSLe".into()],
            ..Attrs::default()
        };
        assert!(m.matches_shape(&a) && m.matches(&a) && !m.needs_text() && !m.shapeless());
        a.classes.pop();
        assert!(!m.matches_shape(&a));
        assert!(Matcher::default().shapeless());
        assert!(!teams().tile.shapeless(), "ô Teams ràng buộc vai trò");
        assert!(format!("{a:?}").starts_with("Attrs(AXGroup/"), "Debug không có chữ");
    }
}
