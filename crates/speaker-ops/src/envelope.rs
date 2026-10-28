//! Phong bì ký của công thức đọc tên (spec 2026-10-26-phan-biet-nguoi-noi §7.1): app chỉ đọc phần thân khi chữ ký Ed25519 đúng với
//! một khóa công khai build sẵn. Cùng cấu trúc với `models.json` (`src-tauri/src/models/signed.rs`) và cùng khóa ký trong CI, nhưng
//! `format` khác và **tiền tố ký riêng**: chữ ký của manifest model không dùng được cho công thức, và ngược lại.
//!
//! ```json
//! { "format": "ai-translator-speaker-recipes", "version": 1, "kid": "prod-2026-10-1", "body": "<b64url>", "sig": "<b64url>" }
//! ```
//!
//! - `body`: base64url không đệm của các byte JSON phần thân (công thức, `speaker_recipe::parse`). Ký trên chính chuỗi này nên không
//!   cần chuẩn hóa JSON.
//! - `sig`: chữ ký Ed25519 trên `CONTEXT || body` (chuỗi ASCII của `body`).
//! - Phong bì đọc chặt: khóa lạ, base64url có đệm hay không ở dạng chuẩn, BOM, phần thân không phải UTF-8, quá cỡ đều là
//!   `Malformed`. Thông báo lỗi không nhắc lại `kid` hay nội dung nhận được.
//! - Bộ vector `testdata/recipe-vectors.json` sinh bằng `scripts/speaker-recipes/gen-recipe-vectors.mjs` (Node, WebCrypto): Rust
//!   kiểm đúng như script ký.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use speaker_protocol::MAX_RECIPE_BYTES;

pub const FORMAT: &str = "ai-translator-speaker-recipes";
pub const VERSION: u32 = 1;
/// Tiền tố của thông điệp được ký.
pub const CONTEXT: &[u8] = b"ai-translator-speaker-recipes.v1.";
/// Phong bì lớn hơn chừng này thì không đọc: phần thân tối đa 256 KB (`MAX_RECIPE_BYTES`) nở 4/3 lần khi mã hóa base64url.
pub const MAX_ENVELOPE_BYTES: usize = 360 * 1024;

/// Khóa công khai tin cậy: `kid` và khóa Ed25519. App dựng từ khối `production` của `manifest-public-keys.json`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustedKey {
    pub kid: String,
    pub key: VerifyingKey,
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum EnvelopeError {
    #[error("phong bì công thức sai định dạng: {0}")]
    Malformed(&'static str),
    #[error("công thức ký bằng khóa lạ")]
    UnknownKey,
    #[error("chữ ký công thức không đúng")]
    BadSignature,
}

/// Phong bì đã kiểm chữ ký: khóa đã ký và phần thân (chuỗi JSON, chưa qua `speaker_recipe::parse`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opened {
    pub kid: String,
    pub body: String,
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

/// Kiểm phong bì, rồi chữ ký. Phần thân trả về chưa được hiểu: người gọi chuyển cho `recipes::judge`.
pub fn open(bytes: &[u8], keys: &[TrustedKey]) -> Result<Opened, EnvelopeError> {
    if bytes.len() > MAX_ENVELOPE_BYTES {
        return Err(EnvelopeError::Malformed("quá lớn"));
    }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| EnvelopeError::Malformed("json"))?;
    if envelope.format != FORMAT {
        return Err(EnvelopeError::Malformed("format"));
    }
    if envelope.version != VERSION {
        return Err(EnvelopeError::Malformed("version"));
    }
    if !kid_ok(&envelope.kid) {
        return Err(EnvelopeError::Malformed("kid"));
    }
    let body = URL_SAFE_NO_PAD
        .decode(&envelope.body)
        .map_err(|_| EnvelopeError::Malformed("body"))?;
    let sig: [u8; 64] = URL_SAFE_NO_PAD
        .decode(&envelope.sig)
        .ok()
        .and_then(|s| s.try_into().ok())
        .ok_or(EnvelopeError::Malformed("sig"))?;
    let key = keys
        .iter()
        .find(|k| k.kid == envelope.kid)
        .ok_or(EnvelopeError::UnknownKey)?;
    key.key
        .verify_strict(&message(&envelope.body), &Signature::from_bytes(&sig))
        .map_err(|_| EnvelopeError::BadSignature)?;
    if body.len() > MAX_RECIPE_BYTES {
        return Err(EnvelopeError::Malformed("body quá lớn"));
    }
    let body = String::from_utf8(body).map_err(|_| EnvelopeError::Malformed("body không phải UTF-8"))?;
    Ok(Opened {
        kid: envelope.kid,
        body,
    })
}

/// Ký và khóa test của bộ vector (`test-r1`, `test-r2`). Chỉ cho test của crate này và của app (`features = ["testing"]`).
#[cfg(any(test, feature = "testing"))]
pub mod testing {
    use super::*;
    use ed25519_dalek::Signer;
    use serde_json::Value;

    /// Bộ vector dùng chung với script Node.
    pub const VECTORS: &str = include_str!("../testdata/recipe-vectors.json");

    /// Khóa công khai của hai khóa test.
    pub fn test_keys() -> Vec<TrustedKey> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        v["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|k| {
                let x: [u8; 32] = URL_SAFE_NO_PAD
                    .decode(k["x"].as_str().unwrap())
                    .unwrap()
                    .try_into()
                    .unwrap();
                TrustedKey {
                    kid: k["kid"].as_str().unwrap().to_string(),
                    key: VerifyingKey::from_bytes(&x).unwrap(),
                }
            })
            .collect()
    }

    /// Phong bì hợp lệ của `body`, ký bằng khóa test số `which` (0 là `test-r1`).
    pub fn sign(which: usize, body: &str) -> Vec<u8> {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let key = &v["keys"][which];
        let seed: [u8; 32] = URL_SAFE_NO_PAD
            .decode(key["seed"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let signing = ed25519_dalek::SigningKey::from_bytes(&seed);
        let body_b64 = URL_SAFE_NO_PAD.encode(body.as_bytes());
        let sig = signing.sign(&message(&body_b64));
        serde_json::to_vec(&serde_json::json!({
            "format": FORMAT, "version": VERSION, "kid": key["kid"], "body": body_b64,
            "sig": URL_SAFE_NO_PAD.encode(sig.to_bytes())
        }))
        .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::{VECTORS, sign, test_keys};
    use super::*;
    use serde_json::Value;

    fn kind(result: &Result<Opened, EnvelopeError>) -> &'static str {
        match result {
            Ok(_) => "ok",
            Err(EnvelopeError::Malformed(_)) => "malformed",
            Err(EnvelopeError::UnknownKey) => "unknown_key",
            Err(EnvelopeError::BadSignature) => "bad_signature",
        }
    }

    /// Bộ vector do Node sinh: Rust kiểm đúng như script ký (và từ chối chữ ký manifest model).
    #[test]
    fn vectors_verify_as_expected() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let keys = test_keys();
        assert_eq!(keys.len(), 2);
        let cases = v["cases"].as_array().unwrap();
        assert!(cases.len() >= 16);
        for case in cases {
            let name = case["name"].as_str().unwrap();
            let bytes = match &case["raw"] {
                Value::String(raw) => raw.as_bytes().to_vec(),
                _ => serde_json::to_vec(&case["envelope"]).unwrap(),
            };
            let result = open(&bytes, &keys);
            assert_eq!(kind(&result), case["expect"].as_str().unwrap(), "{name}: {result:?}");
        }
        let valid = cases.iter().find(|c| c["name"] == "valid").unwrap();
        let opened = open(&serde_json::to_vec(&valid["envelope"]).unwrap(), &keys).unwrap();
        assert_eq!(opened.kid, "test-r1");
        assert_eq!(serde_json::from_str::<Value>(&opened.body).unwrap(), v["body"]);
    }

    #[test]
    fn an_envelope_signed_in_rust_verifies_and_other_keys_do_not() {
        let bytes = sign(0, r#"{"schema":1}"#);
        assert_eq!(open(&bytes, &test_keys()).unwrap().body, r#"{"schema":1}"#);
        assert_eq!(kind(&open(&bytes, &test_keys()[1..])), "unknown_key");
        assert_eq!(kind(&open(&bytes, &[])), "unknown_key");
    }

    #[test]
    fn size_limits_are_enforced_before_and_after_decoding() {
        let mut big = sign(0, "{}");
        big.resize(MAX_ENVELOPE_BYTES + 1, b' ');
        assert_eq!(kind(&open(&big, &test_keys())), "malformed");
        // Chữ ký đúng nhưng phần thân vượt 256 KB: vẫn bị từ chối (phong bì còn trong 360 KB).
        let body = format!("{{\"pad\":\"{}\"}}", "a".repeat(MAX_RECIPE_BYTES));
        let bytes = sign(0, &body);
        assert!(bytes.len() <= MAX_ENVELOPE_BYTES);
        let result = open(&bytes, &test_keys());
        assert_eq!(result, Err(EnvelopeError::Malformed("body quá lớn")));
    }

    /// Lỗi không nhắc lại `kid` hay nội dung nhận được.
    #[test]
    fn errors_do_not_echo_the_input() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let unknown = v["cases"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["name"] == "unknown_kid")
            .unwrap();
        let err = open(&serde_json::to_vec(&unknown["envelope"]).unwrap(), &test_keys()).unwrap_err();
        assert!(!err.to_string().contains("test-r9"), "{err}");
    }
}
