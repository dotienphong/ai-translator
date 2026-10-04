//! Phong bì ký của `models.json` (spec §6.7, §10.2): app chỉ đọc phần thân khi chữ ký Ed25519 đúng với một khóa
//! công khai build sẵn. Sửa một byte của phần thân, đổi `kid`, hay ký bằng khóa khác đều bị từ chối.
//!
//! ```json
//! { "format": "ai-translator-models", "version": 1, "kid": "prod-2026-10-1", "body": "<b64url>", "sig": "<b64url>" }
//! ```
//!
//! - `body`: base64url không đệm của các byte JSON phần thân ([`super::manifest::Manifest`]). Ký trên chính chuỗi
//!   này nên không cần chuẩn hóa JSON.
//! - `sig`: chữ ký Ed25519 trên `CONTEXT || body` (chuỗi ASCII của `body`). Tiền tố tách chữ ký manifest khỏi mọi
//!   chữ ký khác (token bản quyền dùng `v1.<payload>`).
//! - Phong bì đọc chặt: khóa lạ, base64url có đệm hay không ở dạng chuẩn, BOM, quá 1 MiB đều là `Malformed`.
//! - Khóa công khai: `src-tauri/keys/manifest-public-keys.json`, khối `production` cho mọi bản build (spec 2026-10-04,
//!   §2.1). Khóa `test-*` chỉ có trong test, không bao giờ build vào app. Script ký và bộ vector: `scripts/models/`.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;

use super::manifest::{Invalid, Manifest};

pub const FORMAT: &str = "ai-translator-models";
pub const VERSION: u32 = 1;
/// Tiền tố của thông điệp được ký.
pub const CONTEXT: &[u8] = b"ai-translator-models.v1.";
/// Manifest lớn hơn chừng này thì không đọc.
pub const MAX_BYTES: usize = 1 << 20;

/// Khóa công khai build sẵn.
const KEYS_JSON: &str = include_str!("../../keys/manifest-public-keys.json");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustedKey {
    pub kid: String,
    pub key: VerifyingKey,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SignedError {
    #[error("manifest sai định dạng: {0}")]
    Malformed(String),
    #[error("manifest ký bằng khóa lạ `{0}`")]
    UnknownKey(String),
    #[error("chữ ký manifest không đúng")]
    BadSignature,
    #[error(transparent)]
    Invalid(#[from] Invalid),
}

/// Manifest đã kiểm chữ ký và phần thân.
#[derive(Clone, Debug, PartialEq)]
pub struct Signed {
    pub kid: String,
    pub manifest: Manifest,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    format: String,
    version: u32,
    kid: String,
    body: String,
    sig: String,
}

fn kid_ok(kid: &str) -> bool {
    !kid.is_empty()
        && kid.len() <= 32
        && kid
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Thông điệp được ký của một phần thân đã mã hóa base64url.
pub fn message(body_b64: &str) -> Vec<u8> {
    [CONTEXT, body_b64.as_bytes()].concat()
}

/// Kiểm phong bì, chữ ký, rồi phần thân.
pub fn verify(bytes: &[u8], keys: &[TrustedKey]) -> Result<Signed, SignedError> {
    let malformed = |what: &str| SignedError::Malformed(what.to_string());
    if bytes.len() > MAX_BYTES {
        return Err(malformed("quá lớn"));
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|e| SignedError::Malformed(e.to_string()))?;
    if envelope.format != FORMAT {
        return Err(malformed("format"));
    }
    if envelope.version != VERSION {
        return Err(malformed("version"));
    }
    if !kid_ok(&envelope.kid) {
        return Err(malformed("kid"));
    }
    let body = URL_SAFE_NO_PAD.decode(&envelope.body).map_err(|_| malformed("body"))?;
    let sig: [u8; 64] = URL_SAFE_NO_PAD
        .decode(&envelope.sig)
        .ok()
        .and_then(|s| s.try_into().ok())
        .ok_or_else(|| malformed("sig"))?;
    let key = keys
        .iter()
        .find(|k| k.kid == envelope.kid)
        .ok_or_else(|| SignedError::UnknownKey(envelope.kid.clone()))?;
    key.key
        .verify_strict(&message(&envelope.body), &Signature::from_bytes(&sig))
        .map_err(|_| SignedError::BadSignature)?;
    let manifest = Manifest::parse(&body)?;
    Ok(Signed {
        kid: envelope.kid,
        manifest,
    })
}

/// Đọc khóa công khai production từ file JSON dạng `{ "production": [{ "kid", "x" }] }`. Khóa bắt đầu bằng `_` (ghi
/// chú) và các khối khác (kể cả `staging` còn sót) bị bỏ qua.
pub fn keys_from_json(text: &str) -> Result<Vec<TrustedKey>, String> {
    #[derive(Deserialize)]
    #[serde(deny_unknown_fields)]
    struct Entry {
        kid: String,
        x: String,
    }
    let root: serde_json::Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let list = root
        .get("production")
        .cloned()
        .unwrap_or(serde_json::Value::Array(Vec::new()));
    let entries: Vec<Entry> = serde_json::from_value(list).map_err(|e| e.to_string())?;
    entries
        .into_iter()
        .map(|e| {
            if !kid_ok(&e.kid) {
                return Err(format!("kid `{}`", e.kid));
            }
            let bytes: [u8; 32] = URL_SAFE_NO_PAD
                .decode(&e.x)
                .ok()
                .and_then(|b| b.try_into().ok())
                .ok_or_else(|| format!("khóa của `{}`", e.kid))?;
            let key = VerifyingKey::from_bytes(&bytes).map_err(|_| format!("khóa của `{}`", e.kid))?;
            Ok(TrustedKey { kid: e.kid, key })
        })
        .collect()
}

/// Khóa build sẵn của môi trường đang chạy.
pub fn trusted_keys() -> Vec<TrustedKey> {
    keys_from_json(KEYS_JSON).unwrap_or_else(|e| {
        log::error!("manifest-public-keys.json hỏng ({e}): không nhận manifest nào");
        Vec::new()
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("testdata/manifest-vectors.json");

    /// Khóa test của bộ vector (`test-m1`, `test-m2`). Test của module khác dùng lại để ký manifest giả.
    pub(crate) fn test_keys() -> Vec<TrustedKey> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let public: Vec<Value> = v["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|k| serde_json::json!({ "kid": k["kid"], "x": k["x"] }))
            .collect();
        let wrapped = serde_json::json!({ "production": public });
        keys_from_json(&wrapped.to_string()).unwrap()
    }

    /// Một manifest hợp lệ đã ký bằng `test-m1`, với phần thân cho trước, dạng bytes của `models.json`.
    pub(crate) fn signed_with_test_key(body: &Value) -> Vec<u8> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let seed = URL_SAFE_NO_PAD.decode(v["keys"][0]["seed"].as_str().unwrap()).unwrap();
        let signing = ed25519_dalek::SigningKey::from_bytes(&seed.try_into().unwrap());
        let body_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_vec(body).unwrap());
        use ed25519_dalek::Signer;
        let sig = signing.sign(&message(&body_b64));
        serde_json::to_vec(&serde_json::json!({
            "format": FORMAT, "version": VERSION, "kid": "test-m1", "body": body_b64,
            "sig": URL_SAFE_NO_PAD.encode(sig.to_bytes())
        }))
        .unwrap()
    }

    fn kind(result: &Result<Signed, SignedError>) -> &'static str {
        match result {
            Ok(_) => "ok",
            Err(SignedError::Malformed(_)) => "malformed",
            Err(SignedError::UnknownKey(_)) => "unknown_key",
            Err(SignedError::BadSignature) => "bad_signature",
            Err(SignedError::Invalid(_)) => "invalid",
        }
    }

    /// Bộ vector sinh bằng `scripts/models/gen-manifest-vectors.mjs` (Node, WebCrypto): Rust kiểm đúng như script ký.
    #[test]
    fn vectors_verify_as_expected() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let keys = test_keys();
        assert_eq!(keys.len(), 2);
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 12);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let bytes = match &case["raw"] {
                Value::String(raw) => raw.as_bytes().to_vec(),
                _ => serde_json::to_vec(&case["manifest"]).unwrap(),
            };
            let result = verify(&bytes, &keys);
            assert_eq!(kind(&result), case["expect"].as_str().unwrap(), "{name}: {result:?}");
        }
        let valid = cases.iter().find(|c| c["name"] == "valid").unwrap();
        let signed = verify(&serde_json::to_vec(&valid["manifest"]).unwrap(), &keys).unwrap();
        assert_eq!(signed.kid, "test-m1");
        assert_eq!(signed.manifest.sequence, 1);
        assert_eq!(signed.manifest.packs.len(), 2);
    }

    #[test]
    fn a_manifest_signed_in_rust_verifies() {
        let bytes = signed_with_test_key(&super::super::manifest::tests::sample());
        assert_eq!(verify(&bytes, &test_keys()).unwrap().manifest.sequence, 3);
        assert_eq!(kind(&verify(&bytes, &test_keys()[1..])), "unknown_key");
        assert_eq!(kind(&verify(&bytes, &[])), "unknown_key");
        let mut big = bytes.clone();
        big.resize(MAX_BYTES + 1, b' ');
        assert_eq!(kind(&verify(&big, &test_keys())), "malformed");
    }

    /// Khóa build sẵn đọc được và không có khóa test nào; file chỉ có khối `production` (cùng các khóa ghi chú `_…`).
    #[test]
    fn built_in_keys_parse_and_contain_no_test_key() {
        let keys = keys_from_json(KEYS_JSON).unwrap();
        assert!(keys.iter().all(|k| !k.kid.starts_with("test-")));
        let root: Value = serde_json::from_str(KEYS_JSON).unwrap();
        for (name, _) in root.as_object().unwrap() {
            assert!(name == "production" || name.starts_with('_'), "khối lạ {name}");
        }
        assert!(!KEYS_JSON.contains("\"d\""), "không có khóa riêng");
    }

    #[test]
    fn bad_key_files_are_rejected() {
        let one = |x: &str| format!(r#"{{ "production": [{{ "kid": "prod-1", "x": "{x}" }}] }}"#);
        assert!(keys_from_json(&one("AAAA")).is_err(), "khóa ngắn");
        assert!(keys_from_json(r#"{ "production": [{ "kid": "PROD", "x": "" }] }"#).is_err());
        assert!(keys_from_json(r#"{ "production": [{ "kid": "a", "x": "b", "d": "c" }] }"#).is_err());
        assert_eq!(keys_from_json(r#"{ "_note": "x" }"#), Ok(Vec::new()));
    }

    /// Khối `staging` còn sót trong file cũ bị bỏ qua, không bao giờ được tin (spec 2026-10-04, §2.1).
    #[test]
    fn a_leftover_staging_block_is_never_trusted() {
        let text = r#"{ "staging": [{ "kid": "stg-1", "x": "ElNgklAMnOnhixubC1wYADxWSLwlk4AaNgNzRhIvWm4" }], "production": [] }"#;
        assert_eq!(keys_from_json(text), Ok(Vec::new()));
    }

    /// N-2 của review 04 lần 2: khóa bậc nhỏ (ở đây là điểm đơn vị) cùng chữ ký `R` = đơn vị, `S` = 0 qua được `verify`
    /// thường với mọi thông điệp, nhưng không qua `verify_strict`. App chỉ dùng `verify_strict`, nên manifest ký kiểu đó
    /// bị từ chối.
    #[test]
    fn a_small_order_key_never_verifies() {
        use ed25519_dalek::Verifier;
        let mut identity = [0u8; 32];
        identity[0] = 1;
        let keys = vec![TrustedKey {
            kid: "test-weak".into(),
            key: VerifyingKey::from_bytes(&identity).unwrap(),
        }];
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&crate::models::manifest::tests::sample()).unwrap());
        let mut sig = [0u8; 64];
        sig[0] = 1;
        assert!(
            keys[0]
                .key
                .verify(&message(&body), &Signature::from_bytes(&sig))
                .is_ok(),
            "ca này phân biệt được verify với verify_strict"
        );
        let envelope = serde_json::json!({
            "format": FORMAT, "version": VERSION, "kid": "test-weak", "body": body, "sig": URL_SAFE_NO_PAD.encode(sig)
        });
        assert_eq!(
            verify(&serde_json::to_vec(&envelope).unwrap(), &keys).err(),
            Some(SignedError::BadSignature)
        );
    }
}
