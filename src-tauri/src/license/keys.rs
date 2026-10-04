//! Khóa công khai kiểm token bản quyền (spec §10.2, "Khóa ký token"): hai ô `a`, `b` (khóa đang ký và khóa dự phòng) của
//! production, tra theo `kid`. File `src-tauri/keys/license-public-keys.json` chép nguyên từ `server/keys/public-keys.json`
//! của license server (kế hoạch 05): app chỉ đọc khối `production`, bỏ qua `retired` (khóa đã bỏ), `_note`, mọi khối cũ
//! như `staging` và mọi khóa lạ ở gốc file (spec 2026-10-04: chỉ có một môi trường).

use std::collections::HashMap;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::Value;

/// Khối khóa của file: mọi bản build chỉ tin khóa production.
const BLOCK: &str = "production";

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
    /// Đọc khối `production` của file theo định dạng `server/keys/public-keys.json`:
    /// `{"production": {"a": {"kid", "x"}, "b": …}}`. Khối không có thì rỗng (chưa triển khai production).
    pub fn from_json(text: &str) -> Result<Self, KeysError> {
        let root: Value = serde_json::from_str(text).map_err(|_| KeysError::NotObject)?;
        let root = root.as_object().ok_or(KeysError::NotObject)?;
        let Some(block) = root.get(BLOCK) else {
            return Ok(Self::default());
        };
        let slots = block.as_object().ok_or_else(|| KeysError::BadEnv(BLOCK.into()))?;
        let mut keys = HashMap::new();
        for slot in slots.values() {
            let (Some(kid), Some(x)) = (
                slot.get("kid").and_then(Value::as_str),
                slot.get("x").and_then(Value::as_str),
            ) else {
                return Err(KeysError::BadEnv(BLOCK.into()));
            };
            keys.insert(kid.to_string(), decode_key(kid, x)?);
        }
        Ok(Self(keys))
    }

    /// Khóa production build sẵn trong app.
    pub fn embedded() -> Self {
        Self::from_json(EMBEDDED).unwrap_or_else(|e| {
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
            "a": {"kid": "stg-2026-10-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}
        },
        "production": {
            "a": {"kid": "prod-2026-10-1", "x": "q5ZECmVfbTxWLsBMSfgVBX-QhE6PToK-1TGzmPChkSg"},
            "b": {"kid": "prod-2026-10-2", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}
        },
        "retired": [{"kid": "prod-2026-09-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}],
        "something_new": 1
    }"#;

    #[test]
    fn only_the_production_slots_are_read() {
        let keys = PublicKeys::from_json(SAMPLE).unwrap();
        assert!(keys.get("prod-2026-10-1").is_some() && keys.get("prod-2026-10-2").is_some());
        assert!(
            keys.get("stg-2026-10-1").is_none(),
            "khối `staging` còn sót trong file cũ không bao giờ được tin"
        );
        assert!(
            keys.get("prod-2026-09-1").is_none(),
            "khóa đã bỏ (`retired`) không dùng"
        );
    }

    #[test]
    fn a_missing_block_is_empty_and_bad_keys_are_refused() {
        assert!(PublicKeys::from_json("{}").unwrap().is_empty());
        // Chỉ có khối `staging`: `production` rỗng, không mượn khóa của staging.
        let only_staging =
            r#"{"staging": {"a": {"kid": "stg-1", "x": "7kNBQtTQI5DHL0DK4Rz_T9Syxshmsv2yrg7lNItanys"}}}"#;
        assert!(PublicKeys::from_json(only_staging).unwrap().is_empty());
        assert_eq!(PublicKeys::from_json("[]"), Err(KeysError::NotObject));
        assert_eq!(
            PublicKeys::from_json(r#"{"production": {"a": {"kid": "k", "x": "AAAA"}}}"#),
            Err(KeysError::BadKey("k".into()))
        );
        assert_eq!(
            PublicKeys::from_json(r#"{"production": {"a": {"kid": "k"}}}"#),
            Err(KeysError::BadEnv("production".into()))
        );
    }

    /// File build sẵn đọc được, và chỉ có khối `production` (cùng các khóa ghi chú bắt đầu bằng `_`).
    #[test]
    fn the_embedded_file_parses_and_has_only_the_production_block() {
        PublicKeys::from_json(EMBEDDED).unwrap();
        let root: Value = serde_json::from_str(EMBEDDED).unwrap();
        for (name, _) in root.as_object().unwrap() {
            assert!(name == "production" || name.starts_with('_'), "khối lạ {name}");
        }
    }

    /// Bản chép của app phải khớp `server/keys/public-keys.json` khi file đó đã có (sau kế hoạch 05, Task 21): cùng các
    /// khóa của `production`.
    #[test]
    fn the_app_copy_matches_the_server_file_when_it_exists() {
        let server = concat!(env!("CARGO_MANIFEST_DIR"), "/../server/keys/public-keys.json");
        let Ok(text) = std::fs::read_to_string(server) else {
            return;
        };
        assert_eq!(
            PublicKeys::from_json(EMBEDDED).unwrap(),
            PublicKeys::from_json(&text).unwrap(),
            "chép lại server/keys/public-keys.json vào src-tauri/keys/license-public-keys.json"
        );
    }
}
