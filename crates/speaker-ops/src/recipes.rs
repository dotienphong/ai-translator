//! Nhận hay từ chối một công thức đọc tên tải về (spec 2026-10-26-phan-biet-nguoi-noi §7.1) và lưu nó trên máy.
//!
//! Luật nhận (`judge`), áp lên phần thân đã qua [`crate::envelope::open`]:
//! 1. `speaker_recipe::parse` đọc được (đúng schema, trong 256 KB). Mục sai hay app ngoài danh sách viết cứng thì bị bỏ riêng mục
//!    đó, như bản build sẵn; công thức không còn mục nào vẫn nhận được (cách tắt từ xa bộ đọc của một app là đăng công thức không có
//!    mục của app đó).
//! 2. `min_app_version` có mặt, đúng dạng `x.y.z` và không lớn hơn bản app này.
//! 3. `version` ≥ 1 và **không nhỏ hơn bản đang có** (chống quay lui: kẻ gian phát lại công thức cũ có chữ ký đúng). Cùng `version` mà
//!    khác nội dung là xung đột và bị từ chối; đúng bản đang có thì không đổi gì.
//!
//! "Bản đang có" là bản lớn hơn trong bản build sẵn và bản đã lưu ([`choose`]). Lỗi gì cũng giữ bản đang có.

use std::fs::File;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};

use crate::envelope::{self, EnvelopeError, MAX_ENVELOPE_BYTES, TrustedKey};

/// Một công thức đang dùng hay có thể dùng: số phiên bản định dạng (`version` của phần thân) và chính phần thân.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Active {
    pub version: u32,
    pub body: String,
}

impl Active {
    /// Bản build sẵn trong app (`speaker_recipe::BUILTIN_JSON`).
    pub fn builtin() -> Self {
        let body = speaker_recipe::BUILTIN_JSON.to_string();
        let version = speaker_recipe::parse(&body).map_or(0, |r| r.version);
        Self { version, body }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Accept {
    /// Mới hơn bản đang có: nhận.
    Newer,
    /// Đúng bản đang có: không đổi gì.
    Same,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum Reject {
    #[error("công thức cũ hơn bản đang có ({got} < {have})")]
    Rollback { have: u32, got: u32 },
    #[error("công thức cùng số {0} nhưng khác nội dung")]
    Conflict(u32),
    #[error("công thức cần app bản mới hơn")]
    NeedsNewerApp,
    #[error("công thức không dùng được: {0}")]
    Invalid(&'static str),
}

/// `x.y.z` (bỏ hậu tố `-…`, `+…`) thành bộ ba số; `None` nếu sai dạng. Cùng cách đọc của `models::manifest::version`.
pub fn version(text: &str) -> Option<(u64, u64, u64)> {
    let core = text.split(['-', '+']).next()?;
    let mut parts = core.split('.');
    let mut next = || parts.next()?.parse::<u64>().ok();
    let v = (next()?, next()?, next()?);
    parts.next().is_none().then_some(v)
}

/// Có nhận `body` thay cho `current` không (luật ở đầu module). `app_version`: bản app đang chạy.
pub fn judge(current: &Active, body: &str, app_version: &str) -> Result<Accept, Reject> {
    let recipes = speaker_recipe::parse(body).map_err(|_| Reject::Invalid("parse"))?;
    let min = version(&recipes.min_app_version).ok_or(Reject::Invalid("min_app_version"))?;
    let app = version(app_version).ok_or(Reject::Invalid("app_version"))?;
    if min > app {
        return Err(Reject::NeedsNewerApp);
    }
    let got = recipes.version;
    if got == 0 {
        return Err(Reject::Invalid("version"));
    }
    match got.cmp(&current.version) {
        std::cmp::Ordering::Greater => Ok(Accept::Newer),
        std::cmp::Ordering::Less => Err(Reject::Rollback {
            have: current.version,
            got,
        }),
        std::cmp::Ordering::Equal if same_json(body, &current.body) => Ok(Accept::Same),
        std::cmp::Ordering::Equal => Err(Reject::Conflict(got)),
    }
}

/// Hai chuỗi JSON cùng nội dung (khác cách xuống dòng và khoảng trắng): bản build sẵn là file viết tay, bản tải về là JSON gọn.
fn same_json(a: &str, b: &str) -> bool {
    match (
        serde_json::from_str::<serde_json::Value>(a),
        serde_json::from_str::<serde_json::Value>(b),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Bản đang có: bản đã lưu nếu `version` lớn hơn bản build sẵn, không thì bản build sẵn.
pub fn choose(builtin: Active, stored: Option<Active>) -> Active {
    match stored {
        Some(s) if s.version > builtin.version => s,
        _ => builtin,
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ConsiderError {
    #[error(transparent)]
    Envelope(#[from] EnvelopeError),
    #[error(transparent)]
    Reject(#[from] Reject),
    #[error("không lưu được công thức: {0}")]
    Io(#[from] io::Error),
}

/// Công thức đã tải trên máy: file phong bì nguyên văn (`speaker-recipes.json` trong thư mục dữ liệu của app). Đọc lại và kiểm lại
/// chữ ký mỗi lần nạp, nên file bị sửa trên đĩa thì bị bỏ.
pub struct RecipeStore {
    path: PathBuf,
}

impl RecipeStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn read(&self) -> Option<Vec<u8>> {
        let mut raw = Vec::new();
        File::open(&self.path)
            .ok()?
            .take(MAX_ENVELOPE_BYTES as u64 + 1)
            .read_to_end(&mut raw)
            .ok()?;
        Some(raw)
    }

    /// Công thức đã lưu, nếu còn hợp lệ so với `builtin` (chữ ký đúng, mới hơn bản build sẵn, hợp với app này).
    pub fn load(&self, keys: &[TrustedKey], app_version: &str, builtin: &Active) -> Option<Active> {
        let opened = envelope::open(&self.read()?, keys).ok()?;
        match judge(builtin, &opened.body, app_version) {
            Ok(Accept::Newer) => speaker_recipe::parse(&opened.body).ok().map(|r| Active {
                version: r.version,
                body: opened.body,
            }),
            _ => None,
        }
    }

    /// Xét một phong bì vừa tải về. `Ok(Some(_))`: bản mới hơn `current`, đã lưu (ghi nguyên tử); `Ok(None)`: đúng bản đang có.
    pub fn consider(
        &self,
        raw: &[u8],
        keys: &[TrustedKey],
        app_version: &str,
        current: &Active,
    ) -> Result<Option<Active>, ConsiderError> {
        let opened = envelope::open(raw, keys)?;
        match judge(current, &opened.body, app_version)? {
            Accept::Same => Ok(None),
            Accept::Newer => {
                self.save(raw)?;
                let version = speaker_recipe::parse(&opened.body).map_or(0, |r| r.version);
                Ok(Some(Active {
                    version,
                    body: opened.body,
                }))
            }
        }
    }

    fn save(&self, raw: &[u8]) -> io::Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        {
            let mut file = File::create(&tmp)?;
            file.write_all(raw)?;
            file.sync_all()?;
        }
        std::fs::rename(&tmp, &self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::envelope::testing::{sign, test_keys};

    const APP: &str = "0.3.2";

    /// Công thức tối thiểu hợp lệ có số phiên bản `v` và `min_app_version` cho trước.
    fn body(v: u32, min: &str) -> String {
        format!(
            r#"{{"schema":1,"version":{v},"min_app_version":"{min}","apps":[{{"app":"teams","os":"macos","window_title":["^M"],"tile":{{"role":"AXMenuItem","label":"^(?P<name>.+)$"}},"name_from":"label","speaking":[{{"kind":"presence","anchor":{{"scope":"child","class_token":"x"}}}}],"delay_ms":900}}]}}"#
        )
    }

    fn active(v: u32) -> Active {
        Active {
            version: v,
            body: body(v, "0.3.2"),
        }
    }

    #[test]
    fn the_builtin_recipe_is_active_version_one_or_more() {
        let b = Active::builtin();
        assert!(b.version >= 1, "{}", b.version);
        assert_eq!(speaker_recipe::parse(&b.body).unwrap().version, b.version);
    }

    #[test]
    fn a_newer_version_is_accepted_the_same_one_is_not_a_change() {
        assert_eq!(judge(&active(3), &body(4, "0.3.2"), APP), Ok(Accept::Newer));
        assert_eq!(judge(&active(3), &body(3, "0.3.2"), APP), Ok(Accept::Same));
    }

    /// Bản build sẵn là file viết tay (xuống dòng, thụt lề), bản tải về là JSON gọn: cùng nội dung thì vẫn là đúng bản đang có, không
    /// phải xung đột (không thì mỗi lần tải lại ghi một cảnh báo vô nghĩa).
    #[test]
    fn the_same_content_in_another_layout_is_the_same_recipe() {
        let value: serde_json::Value = serde_json::from_str(&body(3, "0.3.2")).unwrap();
        let pretty = serde_json::to_string_pretty(&value).unwrap();
        assert_ne!(pretty, body(3, "0.3.2"));
        let current = Active {
            version: 3,
            body: pretty,
        };
        assert_eq!(judge(&current, &body(3, "0.3.2"), APP), Ok(Accept::Same));
    }

    /// Chống quay lui: kể cả khi chữ ký đúng, số cũ hơn bị từ chối; cùng số khác nội dung là xung đột.
    #[test]
    fn older_versions_and_conflicts_are_refused() {
        assert_eq!(
            judge(&active(3), &body(2, "0.3.2"), APP),
            Err(Reject::Rollback { have: 3, got: 2 })
        );
        let other = body(3, "0.3.2").replace("^M", "^N");
        assert_eq!(judge(&active(3), &other, APP), Err(Reject::Conflict(3)));
        assert_eq!(
            judge(&active(3), &body(0, "0.3.2"), APP),
            Err(Reject::Invalid("version"))
        );
    }

    #[test]
    fn min_app_version_must_be_present_well_formed_and_not_above_the_app() {
        assert_eq!(judge(&active(1), &body(2, "0.4.0"), APP), Err(Reject::NeedsNewerApp));
        assert_eq!(
            judge(&active(1), &body(2, "0.3.2"), "0.3.1"),
            Err(Reject::NeedsNewerApp)
        );
        assert_eq!(judge(&active(1), &body(2, "0.3.2"), "0.3.2-beta.1"), Ok(Accept::Newer));
        assert_eq!(
            judge(&active(1), &body(2, "bậy"), APP),
            Err(Reject::Invalid("min_app_version"))
        );
        let none = body(2, "0.3.2").replace(r#""min_app_version":"0.3.2","#, "");
        assert_eq!(judge(&active(1), &none, APP), Err(Reject::Invalid("min_app_version")));
        assert_eq!(
            judge(&active(1), &body(2, "0.3.2"), "x"),
            Err(Reject::Invalid("app_version"))
        );
    }

    #[test]
    fn a_body_that_does_not_parse_is_invalid() {
        assert_eq!(judge(&active(1), "{", APP), Err(Reject::Invalid("parse")));
        let schema = body(2, "0.3.2").replace("\"schema\":1", "\"schema\":9");
        assert_eq!(judge(&active(1), &schema, APP), Err(Reject::Invalid("parse")));
        let big = " ".repeat(speaker_protocol::MAX_RECIPE_BYTES + 1);
        assert_eq!(judge(&active(1), &big, APP), Err(Reject::Invalid("parse")));
    }

    /// Công thức không còn mục nào (hay mục của app ngoài danh sách bị bỏ) vẫn nhận được: đó là cách tắt từ xa một bộ đọc.
    #[test]
    fn a_recipe_with_no_usable_app_is_still_accepted_as_a_kill_switch() {
        let none = r#"{"schema":1,"version":2,"min_app_version":"0.3.2","apps":[]}"#;
        assert_eq!(judge(&active(1), none, APP), Ok(Accept::Newer));
        let webex = body(2, "0.3.2").replace("\"teams\"", "\"webex\"");
        assert_eq!(judge(&active(1), &webex, APP), Ok(Accept::Newer));
        assert!(speaker_recipe::parse(&webex).unwrap().apps.is_empty());
    }

    #[test]
    fn the_greater_of_builtin_and_stored_wins() {
        assert_eq!(choose(active(3), None), active(3));
        assert_eq!(choose(active(3), Some(active(5))), active(5));
        assert_eq!(choose(active(3), Some(active(3))), active(3));
        assert_eq!(
            choose(active(3), Some(active(2))),
            active(3),
            "app mới có bản build sẵn mới hơn bản đã lưu"
        );
    }

    #[test]
    fn a_considered_envelope_is_saved_and_reloaded() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("speaker-recipes.json"));
        let keys = test_keys();
        let builtin = active(1);
        assert_eq!(store.load(&keys, APP, &builtin), None, "chưa có file");
        let raw = sign(0, &body(2, "0.3.2"));
        let got = store.consider(&raw, &keys, APP, &builtin).unwrap().unwrap();
        assert_eq!(got.version, 2);
        assert_eq!(store.load(&keys, APP, &builtin), Some(got.clone()));
        // Lần tải lại đúng bản đang có: không đổi, không lỗi.
        assert!(store.consider(&raw, &keys, APP, &got).unwrap().is_none());
        // App mới có bản build sẵn mới hơn: bản đã lưu không còn dùng.
        assert_eq!(store.load(&keys, APP, &active(2)), None);
        assert_eq!(store.load(&keys, APP, &active(3)), None);
    }

    #[test]
    fn a_refused_envelope_leaves_the_stored_one_alone() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("sub").join("speaker-recipes.json"));
        let keys = test_keys();
        let two = sign(0, &body(2, "0.3.2"));
        let current = store.consider(&two, &keys, APP, &active(1)).unwrap().unwrap();
        let one = sign(0, &body(1, "0.3.2"));
        let err = store.consider(&one, &keys, APP, &current).unwrap_err();
        assert!(
            matches!(err, ConsiderError::Reject(Reject::Rollback { have: 2, got: 1 })),
            "{err}"
        );
        assert!(matches!(
            store.consider(b"khong phai json", &keys, APP, &current),
            Err(ConsiderError::Envelope(EnvelopeError::Malformed(_)))
        ));
        assert!(matches!(
            store.consider(&two, &[], APP, &current),
            Err(ConsiderError::Envelope(EnvelopeError::UnknownKey))
        ));
        assert_eq!(
            store.load(&keys, APP, &active(1)),
            Some(current),
            "bản đã lưu vẫn như cũ"
        );
    }

    /// File đã lưu bị sửa trên đĩa (một byte của phần thân) thì không dùng.
    #[test]
    fn a_tampered_stored_file_is_ignored() {
        let dir = tempfile::tempdir().unwrap();
        let store = RecipeStore::new(dir.path().join("speaker-recipes.json"));
        let keys = test_keys();
        store
            .consider(&sign(0, &body(2, "0.3.2")), &keys, APP, &active(1))
            .unwrap();
        let mut text = std::fs::read_to_string(store.path()).unwrap();
        let at = text.find("\"body\":\"").unwrap() + 8;
        let flipped = if &text[at..=at] == "A" { "B" } else { "A" };
        text.replace_range(at..=at, flipped);
        std::fs::write(store.path(), text).unwrap();
        assert_eq!(store.load(&keys, APP, &active(1)), None);
    }

    /// Cổng kiểm của `pnpm recipes:update` và job `check` của `sign-recipes.yml` (không có khóa ký): `RECIPES_BODY` là phần thân mới,
    /// `RECIPES_PREVIOUS` là phần thân đang phát hành (bỏ trống ở lần đăng đầu tiên). Phần thân phải được app nhận (`judge` ra `Newer`
    /// với bản app rất mới) và mọi mục phải hợp lệ (không mục nào bị bỏ).
    #[test]
    #[ignore = "chạy bằng: RECIPES_BODY=<file> cargo test -p speaker-ops check_recipes_body -- --ignored"]
    fn check_recipes_body() {
        let read = |var: &str| {
            std::env::var(var)
                .ok()
                .filter(|p| !p.is_empty())
                .map(|p| std::fs::read_to_string(p).unwrap())
        };
        let body = read("RECIPES_BODY").expect("thiếu RECIPES_BODY");
        let current = match read("RECIPES_PREVIOUS") {
            Some(previous) => Active {
                version: speaker_recipe::parse(&previous).unwrap().version,
                body: previous,
            },
            None => Active {
                version: 0,
                body: String::new(),
            },
        };
        assert_eq!(
            judge(&current, &body, "9999.0.0"),
            Ok(Accept::Newer),
            "phần thân phải có `version` lớn hơn bản đang phát hành"
        );
        let recipes = speaker_recipe::parse(&body).unwrap();
        assert!(recipes.dropped.is_empty(), "mục bị bỏ: {:?}", recipes.dropped);
    }
}
