//! Token tài khoản (spec 2026-11-05 §5.2): license server ký khi người dùng đăng nhập Google xong, cùng định dạng `v1`,
//! cùng khóa và `kid` với token bản quyền ([`crate::license::token`]) và token dùng thử. Claims:
//! `{"typ": "account", "kid", "account_id", "device_id_hash", "issued_at"}`.
//!
//! Thứ tự kiểm như server (`server/src/token.ts`): định dạng (đúng `typ`, đủ trường, đúng kiểu), `kid`, chữ ký, máy. Token
//! không có hạn dùng: bên kiểm không xét thời gian (vì vậy không cần giờ tin được). Trường lạ trong payload được bỏ qua,
//! như server. Token dùng thử (`typ: "trial"`) và token bản quyền (không có `typ`) là `Malformed`. Hợp đồng chốt bằng
//! `server/test/vectors/token-account-v1.json`. Không panic: mọi sai sót là một [`VerifyError`].

use serde_json::Value;

use crate::license::keys::PublicKeys;
use crate::license::token::{self, VerifyError};

/// Giá trị của trường `typ`.
pub const TYP: &str = "account";

/// Nội dung của token tài khoản. `issued_at` là giây Unix theo giờ của server.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccountClaims {
    pub account_id: String,
    pub device_id_hash: String,
    pub issued_at: i64,
}

/// Kiểm đủ: định dạng, `kid`, chữ ký, rồi đúng máy này.
pub fn verify(token: &str, keys: &PublicKeys, device_id_hash: &str) -> Result<AccountClaims, VerifyError> {
    let (json, payload, sig) = token::open(token)?;
    let (kid, claims) = parse(&json).ok_or(VerifyError::Malformed)?;
    token::check_signature(&kid, payload, &sig, keys)?;
    if claims.device_id_hash != device_id_hash {
        return Err(VerifyError::WrongDevice);
    }
    Ok(claims)
}

/// `kid` (để tra khóa) và claims; `None` nếu sai định dạng.
fn parse(json: &Value) -> Option<(String, AccountClaims)> {
    let c = json.as_object()?;
    if c.get("typ")?.as_str()? != TYP {
        return None;
    }
    Some((
        token::string(c, "kid")?,
        AccountClaims {
            account_id: token::string(c, "account_id")?,
            device_id_hash: token::string(c, "device_id_hash")?,
            issued_at: token::int(c, "issued_at")?,
        },
    ))
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]
mod tests {
    use super::*;

    const VECTORS: &str = include_str!("../../../server/test/vectors/token-account-v1.json");

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).unwrap()
    }

    fn keys(v: &Value) -> PublicKeys {
        let pairs = v["public_keys"].as_object().unwrap();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    fn label(e: VerifyError) -> String {
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    fn token_of(v: &Value, name: &str) -> (String, String) {
        let t = v["tokens"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == name)
            .unwrap();
        (
            t["token"].as_str().unwrap().into(),
            t["device_id_hash"].as_str().unwrap().into(),
        )
    }

    /// Mọi vector của `token-account-v1.json` cho đúng kết quả (cùng tên lỗi với server), token hợp lệ cho đủ mọi trường.
    #[test]
    fn every_account_vector_gives_the_expected_result() {
        let v = vectors();
        let keys = keys(&v);
        let order: Vec<&str> = v["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap())
            .collect();
        let mut checked = 0;
        for t in v["tokens"].as_array().unwrap() {
            let name = t["name"].as_str().unwrap();
            let got = verify(
                t["token"].as_str().unwrap(),
                &keys,
                t["device_id_hash"].as_str().unwrap(),
            );
            let expected = t["expected"].as_str().unwrap();
            match got {
                Ok(c) => {
                    assert_eq!(expected, "ok", "{name}");
                    assert_eq!(t["claims"]["typ"], TYP, "{name}");
                    assert_eq!(t["claims"]["account_id"], c.account_id.as_str(), "{name}");
                    assert_eq!(t["claims"]["device_id_hash"], c.device_id_hash.as_str(), "{name}");
                    assert_eq!(t["claims"]["issued_at"], c.issued_at, "{name}");
                }
                Err(e) => {
                    assert_eq!(label(e), expected, "{name}");
                    assert!(order.contains(&expected), "{name}");
                }
            }
            checked += 1;
        }
        assert_eq!(checked, 27);
    }

    /// Token dùng thử (`typ: "trial"`) bị từ chối: `malformed`.
    #[test]
    fn a_trial_token_is_refused() {
        let v = vectors();
        let (token, device) = token_of(&v, "trial_token");
        assert_eq!(verify(&token, &keys(&v), &device), Err(VerifyError::Malformed));
    }

    /// Token bản quyền (không có `typ`) bị từ chối: `malformed`.
    #[test]
    fn a_license_token_is_refused() {
        let v = vectors();
        let (token, device) = token_of(&v, "license_token");
        assert_eq!(verify(&token, &keys(&v), &device), Err(VerifyError::Malformed));
    }

    /// Token của máy khác bị từ chối: `wrong_device`.
    #[test]
    fn a_token_of_another_device_is_refused() {
        let v = vectors();
        let keys = keys(&v);
        let (token, device) = token_of(&v, "valid");
        assert!(verify(&token, &keys, &device).is_ok());
        assert_eq!(verify(&token, &keys, "may-khac"), Err(VerifyError::WrongDevice));
        assert_eq!(verify(&token, &keys, ""), Err(VerifyError::WrongDevice));
    }

    /// `kid` lạ là `unknown_kid`; chữ ký sai (kể cả `kid` đúng nhưng ký bằng khóa khác) là `bad_signature`.
    #[test]
    fn an_unknown_kid_and_a_bad_signature_are_refused() {
        let v = vectors();
        let keys = keys(&v);
        for (name, expected) in [
            ("unknown_kid", VerifyError::UnknownKid),
            ("bad_signature", VerifyError::BadSignature),
            ("kid_signed_by_other_key", VerifyError::BadSignature),
        ] {
            let (token, device) = token_of(&v, name);
            assert_eq!(verify(&token, &keys, &device), Err(expected), "{name}");
        }
        // Không có khóa nào (môi trường chưa triển khai): token hợp lệ cũng là `unknown_kid`.
        let (token, device) = token_of(&v, "valid");
        assert_eq!(
            verify(&token, &PublicKeys::default(), &device),
            Err(VerifyError::UnknownKid)
        );
    }
}
