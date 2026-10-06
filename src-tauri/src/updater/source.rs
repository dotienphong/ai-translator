//! Nguồn bản cập nhật của bản build này (spec §6.11, §10.2; kế hoạch 07b): URL gốc trên CDN và khóa công khai.
//!
//! - Chỉ URL production (`https`) và khóa `production` (spec 2026-10-04, §2.1). Không còn biến môi trường nào đổi URL.
//!   **Bản debug không tự cập nhật** (`for_this_build` trả `None`): bản phát hành không được ghi đè bản dev đang code.
//! - Thiếu URL hay khóa thì tắt tự cập nhật: không gọi mạng, không hiện gì.
//! - Manifest của mỗi kênh ở `<gốc>/<stable|beta>/latest.json`; bộ cài của mỗi bản ở `<gốc>/<phiên bản>/`
//!   (`scripts/release/update-manifest.mjs`).

use base64::Engine;
use reqwest::Url;

use crate::settings::UpdateChannel;

/// URL gốc production: bucket R2 `ai-translator-releases` trên tên miền riêng (spec 2026-10-06).
pub const PRODUCTION_URL: Option<&str> = Some("https://releases.aitranslator.io.vn");

const KEYS: &str = include_str!("../../keys/updater-public-keys.json");

/// URL gốc và khóa công khai mà bản build này dùng.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Source {
    pub base: Url,
    pub pubkey: String,
}

/// URL gốc từ một chuỗi cấu hình (hàm thuần, để test): chỉ `https`, không có query hay fragment.
pub fn base_from(production: Option<&str>) -> Option<Url> {
    let url = Url::parse(production?).ok()?;
    (url.scheme() == "https" && url.query().is_none() && url.fragment().is_none()).then_some(url)
}

/// Khóa công khai production trong file khóa. Chỉ nhận đúng dạng của
/// `tauri signer generate`: base64 của hai dòng `untrusted comment: …` và khóa minisign Ed25519 (42 byte, bắt đầu
/// `Ed`). Chuỗi rỗng, sai dạng hay thiếu khóa là `None`.
pub fn public_key_from(json: &str) -> Option<String> {
    let keys: serde_json::Value = serde_json::from_str(json).ok()?;
    let key = keys.get("production")?.as_str()?.trim();
    let text = base64::engine::general_purpose::STANDARD.decode(key).ok()?;
    let text = String::from_utf8(text).ok()?;
    let mut lines = text.lines();
    let comment = lines.next()?;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(lines.next()?.trim())
        .ok()?;
    let rest_empty = lines.all(|l| l.trim().is_empty());
    (comment.starts_with("untrusted comment:") && raw.len() == 42 && raw.starts_with(b"Ed") && rest_empty)
        .then(|| key.to_string())
}

/// URL `latest.json` của một kênh.
pub fn endpoint(base: &Url, channel: UpdateChannel) -> Url {
    let name = match channel {
        UpdateChannel::Stable => "stable",
        UpdateChannel::Beta => "beta",
    };
    let text = format!("{}/{name}/latest.json", base.as_str().trim_end_matches('/'));
    Url::parse(&text).expect("URL gốc hợp lệ cộng đường dẫn cố định vẫn hợp lệ")
}

/// Nguồn của bản đang chạy; `None` thì tự cập nhật tắt (bản debug luôn tắt, hay thiếu URL hoặc khóa production).
pub fn for_this_build() -> Option<Source> {
    if cfg!(debug_assertions) {
        return None;
    }
    let base = base_from(PRODUCTION_URL)?;
    let pubkey = public_key_from(KEYS)?;
    Some(Source { base, pubkey })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Khóa công khai của khóa thử trong `testdata/` (Task 3 tạo, khóa riêng đã xóa ngay sau khi ký).
    pub const TEST_PUBKEY: &str = include_str!("testdata/test.key.pub");

    fn keys(production: &str) -> String {
        serde_json::json!({ "_note": "x", "production": production }).to_string()
    }

    #[test]
    fn the_base_url_is_the_production_one() {
        assert_eq!(
            base_from(Some("https://releases.example.com/desktop/"))
                .unwrap()
                .as_str(),
            "https://releases.example.com/desktop/"
        );
        assert_eq!(base_from(None), None);
    }

    #[test]
    fn only_https_without_query_or_fragment() {
        let at = |url: &str| base_from(Some(url)).is_some();
        assert!(at("https://r.example.com"));
        assert!(!at("http://r.example.com"));
        assert!(!at("http://127.0.0.1:8788"), "không còn ngoại lệ cho máy này");
        assert!(!at("http://localhost:8788"));
        assert!(!at("file:///tmp/x"));
        assert!(!at("https://r.example.com/?a=1"));
        assert!(!at("https://r.example.com/#x"));
        assert!(!at("không phải URL"));
    }

    /// Bản debug không tự cập nhật: bản phát hành không được ghi đè bản dev đang code (spec 2026-10-04, §2.1).
    #[test]
    fn debug_builds_never_self_update() {
        if cfg!(debug_assertions) {
            assert_eq!(for_this_build(), None);
        }
    }

    #[test]
    fn endpoint_per_channel() {
        for base in ["https://r.example.com/desktop", "https://r.example.com/desktop/"] {
            let base = Url::parse(base).unwrap();
            assert_eq!(
                endpoint(&base, UpdateChannel::Stable).as_str(),
                "https://r.example.com/desktop/stable/latest.json"
            );
            assert_eq!(
                endpoint(&base, UpdateChannel::Beta).as_str(),
                "https://r.example.com/desktop/beta/latest.json"
            );
        }
    }

    #[test]
    fn public_key_comes_from_production_and_only_the_tauri_format() {
        let key = TEST_PUBKEY.trim();
        assert_eq!(public_key_from(&keys(key)).as_deref(), Some(key));
        let leftover = serde_json::json!({ "staging": key, "production": "" }).to_string();
        assert_eq!(
            public_key_from(&leftover),
            None,
            "khối `staging` còn sót không bao giờ được tin"
        );
        let b64 = |s: &str| base64::engine::general_purpose::STANDARD.encode(s);
        let raw = base64::engine::general_purpose::STANDARD.decode(
            String::from_utf8(base64::engine::general_purpose::STANDARD.decode(key).unwrap())
                .unwrap()
                .lines()
                .nth(1)
                .unwrap(),
        );
        let raw = raw.unwrap();
        let good_line = base64::engine::general_purpose::STANDARD.encode(&raw);
        let mut short = raw.clone();
        short.pop();
        let mut not_ed = raw.clone();
        not_ed[0] = b'X';
        for bad in [
            "".to_string(),
            "không phải base64".to_string(),
            b64(&format!(
                "untrusted comment: x\n{}",
                base64::engine::general_purpose::STANDARD.encode(&short)
            )),
            b64(&format!(
                "untrusted comment: x\n{}",
                base64::engine::general_purpose::STANDARD.encode(&not_ed)
            )),
            b64(&format!("comment: x\n{good_line}")),
            b64(&format!("untrusted comment: x\n{good_line}\nthừa")),
        ] {
            assert_eq!(public_key_from(&keys(&bad)), None, "{bad}");
        }
        assert_eq!(public_key_from("{}"), None);
        assert_eq!(public_key_from("không phải JSON"), None);
    }

    #[test]
    fn the_shipped_key_file_has_no_private_key() {
        let keys: serde_json::Value = serde_json::from_str(KEYS).unwrap();
        let names: Vec<_> = keys.as_object().unwrap().keys().cloned().collect();
        assert_eq!(names, ["_note", "production"]);
        let value = keys["production"].as_str().unwrap();
        assert!(value.is_empty() || public_key_from(KEYS).is_some());
        assert!(
            !KEYS.contains("secret key"),
            "khóa riêng của minisign không bao giờ nằm trong app"
        );
    }
}
