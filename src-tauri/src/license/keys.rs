//! Khóa công khai kiểm token bản quyền (spec §10.2, "Khóa ký token"): mỗi môi trường hai ô `a`, `b` (khóa đang ký và khóa
//! dự phòng), tra theo `kid`. File `src-tauri/keys/license-public-keys.json` chép nguyên từ `server/keys/public-keys.json`
//! của license server (kế hoạch 05): app chỉ đọc khối của môi trường mình, bỏ qua `retired` (khóa đã bỏ), `_note` và mọi
//! khóa lạ ở gốc file.

use std::collections::HashMap;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Value;

/// Môi trường của license server mà bản build này nói chuyện: bản debug là `staging`, bản phát hành là `production`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LicenseEnv {
    Staging,
    Production,
}

impl LicenseEnv {
    pub fn current() -> Self {
        if cfg!(debug_assertions) {
            Self::Staging
        } else {
            Self::Production
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }
}

/// File khóa công khai build sẵn vào app.
pub const EMBEDDED: &str = include_str!("../../keys/license-public-keys.json");

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum KeysError {
    #[error("file khóa công khai không phải JSON object")]
    NotObject,
    #[error("khối `{0}` của file khóa công khai sai dạng")]
    BadEnv(String),
    #[error("khóa `{0}` không phải khóa công khai Ed25519 32 byte dạng base64url")]
    BadKey(String),
}

/// Khóa công khai theo `kid` (32 byte Ed25519).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PublicKeys(HashMap<String, [u8; 32]>);

impl PublicKeys {
    /// Đọc khối `env` của file theo định dạng `server/keys/public-keys.json`: `{"<env>": {"a": {"kid", "x"}, "b": …}}`.
    /// Khối không có thì rỗng (chưa triển khai môi trường đó).
    pub fn from_json(text: &str, env: LicenseEnv) -> Result<Self, KeysError> {
        let root: Value = serde_json::from_str(text).map_err(|_| KeysError::NotObject)?;
        let root = root.as_object().ok_or(KeysError::NotObject)?;
        let Some(block) = root.get(env.key()) else {
            return Ok(Self::default());
        };
        let slots = block.as_object().ok_or_else(|| KeysError::BadEnv(env.key().into()))?;
        let mut keys = HashMap::new();
        for slot in slots.values() {
            let (Some(kid), Some(x)) = (
                slot.get("kid").and_then(Value::as_str),
                slot.get("x").and_then(Value::as_str),
            ) else {
                return Err(KeysError::BadEnv(env.key().into()));
            };
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    /// Khóa của môi trường mà bản build này dùng ([`LicenseEnv::current`]).
    pub fn embedded() -> Self {
        Self::from_json(EMBEDDED, LicenseEnv::current()).unwrap_or_else(|e| {
            log::error!("file khóa công khai build sẵn hỏng: {e}");
            Self::default()
        })
    }

    /// Từ cặp (`kid`, khóa base64url), cho test và bộ vector.
    pub fn from_pairs<'a>(pairs: impl IntoIterator<Item = (&'a str, &'a str)>) -> Result<Self, KeysError> {
        let mut keys = HashMap::new();
        for (kid, x) in pairs {
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    pub fn get(&self, kid: &str) -> Option<&[u8; 32]> {
        self.0.get(kid)
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

fn decode_key(kid: &str, x: &str) -> Result<[u8; 32], KeysError> {
    URL_SAFE_NO_PAD
        .decode(x)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b).ok())
        .ok_or_else(|| KeysError::BadKey(kid.into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "_note": "ghi chú",
        "staging": {
            "a": {"kid": "stg-2026-10-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"},
            "b": {"kid": "stg-2026-10-2", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"}
        },
        "production": {
            "a": {"kid": "prod-2026-10-1", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"}
        },
        "retired": [{"kid": "stg-2026-09-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}],
        "something_new": 1
    }"#;

    #[test]
    fn each_environment_reads_only_its_own_slots() {
        let staging = PublicKeys::from_json(SAMPLE, LicenseEnv::Staging).unwrap();
        assert!(staging.get("stg-2026-10-1").is_some() && staging.get("stg-2026-10-2").is_some());
        assert!(staging.get("prod-2026-10-1").is_none());
        assert!(
            staging.get("stg-2026-09-1").is_none(),
            "khóa đã bỏ (`retired`) không dùng"
        );
        let production = PublicKeys::from_json(SAMPLE, LicenseEnv::Production).unwrap();
        assert!(production.get("prod-2026-10-1").is_some());
        assert!(production.get("stg-2026-10-1").is_none());
    }

    #[test]
    fn a_missing_environment_is_empty_and_bad_keys_are_refused() {
        assert!(
            PublicKeys::from_json(r#"{"staging": {}}"#, LicenseEnv::Production)
                .unwrap()
                .is_empty()
        );
        // Chỉ có khối `staging`: `production` rỗng, không mượn khóa của staging.
        let only_staging =
            r#"{"staging": {"a": {"kid": "stg-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}}}"#;
        assert!(
            PublicKeys::from_json(only_staging, LicenseEnv::Production)
                .unwrap()
                .is_empty()
        );
        assert!(
            !PublicKeys::from_json(only_staging, LicenseEnv::Staging)
                .unwrap()
                .is_empty()
        );
        assert_eq!(
            PublicKeys::from_json("[]", LicenseEnv::Staging),
            Err(KeysError::NotObject)
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"staging": {"a": {"kid": "k", "x": "AAAA"}}}"#, LicenseEnv::Staging),
            Err(KeysError::BadKey("k".into()))
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"staging": {"a": {"kid": "k"}}}"#, LicenseEnv::Staging),
            Err(KeysError::BadEnv("staging".into()))
        );
    }

    /// File build sẵn đọc được ở cả hai môi trường; bản debug dùng staging, bản phát hành dùng production.
    #[test]
    fn the_embedded_file_parses_for_both_environments() {
        PublicKeys::from_json(EMBEDDED, LicenseEnv::Staging).unwrap();
        PublicKeys::from_json(EMBEDDED, LicenseEnv::Production).unwrap();
        assert_eq!(LicenseEnv::current() == LicenseEnv::Staging, cfg!(debug_assertions));
    }

    /// Bản chép của app phải khớp `server/keys/public-keys.json` khi file đó đã có (sau kế hoạch 05, Task 19): cùng các
    /// khóa của `staging` và `production`.
    #[test]
    fn the_app_copy_matches_the_server_file_when_it_exists() {
        let server = concat!(env!("CARGO_MANIFEST_DIR"), "/../server/keys/public-keys.json");
        let Ok(text) = std::fs::read_to_string(server) else {
            return;
        };
        for env in [LicenseEnv::Staging, LicenseEnv::Production] {
            assert_eq!(
                PublicKeys::from_json(EMBEDDED, env).unwrap(),
                PublicKeys::from_json(&text, env).unwrap(),
                "{env:?}: chép lại server/keys/public-keys.json vào src-tauri/keys/license-public-keys.json"
            );
        }
    }
}
