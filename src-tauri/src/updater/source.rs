//! Nguồn bản cập nhật của bản build này (spec §6.11, §10.2; kế hoạch 07b): URL gốc trên CDN và khóa công khai.
//!
//! - Bản dev: URL staging ([`URL_ENV`] đè được, cho phép `http` tới `127.0.0.1` hay `localhost` để thử với server trên
//!   máy) và khóa `staging`. Bản phát hành: chỉ URL production (`https`) và khóa `production`.
//! - Thiếu URL hay khóa thì tắt tự cập nhật: không gọi mạng, không hiện gì.
//! - Manifest của mỗi kênh ở `<gốc>/<stable|beta>/latest.json`; bộ cài của mỗi bản ở `<gốc>/<phiên bản>/`
//!   (`scripts/release/update-manifest.mjs`).

use base64::Engine;
use reqwest::Url;

use crate::models::download::is_loopback;
use crate::settings::UpdateChannel;

/// URL gốc của bucket bản cập nhật staging. Task 12 của kế hoạch 07b (cần người) điền.
pub const STAGING_URL: Option<&str> = None;
/// URL gốc production: Task 12 của kế hoạch 07b điền khi có tên miền (T7) hay URL công khai của bucket production.
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản dev: biến môi trường này đè URL staging.
pub const URL_ENV: &str = "AI_TRANSLATOR_UPDATE_URL";

const KEYS: &str = include_str!("../../keys/updater-public-keys.json");

/// URL gốc và khóa công khai mà bản build này dùng.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Source {
    pub base: Url,
    pub pubkey: String,
}

/// URL gốc theo loại bản (hàm thuần, để test). Không có query hay fragment.
pub fn base_from(dev: bool, env: Option<String>, staging: Option<&str>, production: Option<&str>) -> Option<Url> {
    let text = if dev {
        env.or_else(|| staging.map(String::from))
    } else {
        production.map(String::from)
    }?;
    let url = Url::parse(&text).ok()?;
    let scheme_ok = url.scheme() == "https" || (dev && url.scheme() == "http" && is_loopback(&url));
    (scheme_ok && url.query().is_none() && url.fragment().is_none()).then_some(url)
}

/// Khóa công khai của một môi trường trong file khóa (`staging` hay `production`). Chỉ nhận đúng dạng của
/// `tauri signer generate`: base64 của hai dòng `untrusted comment: …` và khóa minisign Ed25519 (42 byte, bắt đầu
/// `Ed`). Chuỗi rỗng, sai dạng hay thiếu khóa là `None`.
pub fn public_key_from(json: &str, dev: bool) -> Option<String> {
    let keys: serde_json::Value = serde_json::from_str(json).ok()?;
    let key = keys.get(if dev { "staging" } else { "production" })?.as_str()?.trim();
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

/// Nguồn của bản đang chạy; `None` thì tự cập nhật tắt.
pub fn for_this_build() -> Option<Source> {
    let dev = cfg!(debug_assertions);
    let base = base_from(dev, std::env::var(URL_ENV).ok(), STAGING_URL, PRODUCTION_URL)?;
    let pubkey = public_key_from(KEYS, dev)?;
    Some(Source { base, pubkey })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    /// Khóa công khai của khóa thử trong `testdata/` (Task 3 tạo, khóa riêng đã xóa ngay sau khi ký).
    pub const TEST_PUBKEY: &str = include_str!("testdata/test.key.pub");

    fn keys(staging: &str, production: &str) -> String {
        serde_json::json!({ "_note": "x", "staging": staging, "production": production }).to_string()
    }

    #[test]
    fn dev_builds_read_staging_or_the_env_and_release_builds_only_production() {
        let staging = Some("https://staging.example.com/releases");
        let production = Some("https://releases.example.com/desktop/");
        let env = Some("http://127.0.0.1:8788/r".to_string());
        assert_eq!(
            base_from(true, None, staging, production).unwrap().as_str(),
            "https://staging.example.com/releases"
        );
        assert_eq!(
            base_from(true, env.clone(), staging, production).unwrap().as_str(),
            "http://127.0.0.1:8788/r"
        );
        assert_eq!(
            base_from(false, env, staging, production).unwrap().as_str(),
            "https://releases.example.com/desktop/"
        );
        assert_eq!(base_from(false, None, staging, None), None);
        assert_eq!(base_from(true, None, None, production), None);
    }

    #[test]
    fn only_https_except_loopback_http_in_dev() {
        let at = |dev, url: &str| base_from(dev, Some(url.into()), Some(url), Some(url)).is_some();
        assert!(at(false, "https://r.example.com"));
        assert!(!at(false, "http://r.example.com"));
        assert!(!at(false, "http://127.0.0.1:8788"));
        assert!(at(true, "http://localhost:8788"));
        assert!(!at(true, "http://r.example.com"));
        assert!(!at(true, "file:///tmp/x"));
        assert!(!at(false, "https://r.example.com/?a=1"));
        assert!(!at(false, "https://r.example.com/#x"));
        assert!(!at(false, "không phải URL"));
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
    fn public_key_per_environment_and_only_the_tauri_format() {
        let key = TEST_PUBKEY.trim();
        assert_eq!(public_key_from(&keys(key, ""), true).as_deref(), Some(key));
        assert_eq!(
            public_key_from(&keys(key, ""), false),
            None,
            "bản phát hành không mượn khóa staging"
        );
        assert_eq!(public_key_from(&keys("", key), false).as_deref(), Some(key));
        assert_eq!(
            public_key_from(&keys("", key), true),
            None,
            "bản dev không nhận khóa production"
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
            assert_eq!(public_key_from(&keys(&bad, &bad), true), None, "{bad}");
        }
        assert_eq!(public_key_from("{}", true), None);
        assert_eq!(public_key_from("không phải JSON", true), None);
    }

    #[test]
    fn the_shipped_key_file_has_no_private_key() {
        let keys: serde_json::Value = serde_json::from_str(KEYS).unwrap();
        let names: Vec<_> = keys.as_object().unwrap().keys().cloned().collect();
        assert_eq!(names, ["_note", "production", "staging"]);
        for env in ["staging", "production"] {
            let value = keys[env].as_str().unwrap();
            assert!(
                value.is_empty() || public_key_from(KEYS, env == "staging").is_some(),
                "{env}"
            );
        }
        assert!(
            !KEYS.contains("secret key"),
            "khóa riêng của minisign không bao giờ nằm trong app"
        );
    }
}
