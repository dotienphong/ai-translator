//! Token dùng thử của Free (spec 2026-10-07 §3.1): license server ký khi máy đăng ký dùng thử (`POST /v1/trial`), cùng
//! định dạng `v1`, cùng khóa và `kid` với token bản quyền ([`super::token`]). Claims:
//! `{"typ": "trial", "kid", "device_id_hash", "started_at", "ends_at", "issued_at"}`.
//!
//! Thứ tự kiểm như token bản quyền: định dạng (đúng `typ`, đủ trường, đúng kiểu), `kid`, chữ ký, máy. Token không có
//! `expires_at` hay `refresh_before`: bên kiểm không xét thời hạn; `manager` so `ends_at` với giờ tin được
//! (`Seen::trusted_now`). Hợp đồng chốt bằng khóa `trial` của `server/test/vectors/token-v1.json`.

use serde_json::Value;

use super::keys::PublicKeys;
use super::token::{self, VerifyError};

/// Giá trị của trường `typ`.
pub const TYP: &str = "trial";

/// Nội dung của token dùng thử. Thời điểm là giây Unix theo giờ của server.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrialClaims {
    pub kid: String,
    pub device_id_hash: String,
    pub started_at: i64,
    pub ends_at: i64,
    pub issued_at: i64,
}

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy ([`verify`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<TrialClaims, VerifyError> {
    let (json, payload, sig) = token::open(token)?;
    let claims = parse(&json).ok_or(VerifyError::Malformed)?;
    token::check_signature(&claims.kid, payload, &sig, keys)?;
    Ok(claims)
}

/// Kiểm đủ: [`decode`] rồi đúng máy này.
pub fn verify(token: &str, keys: &PublicKeys, device_id_hash: &str) -> Result<TrialClaims, VerifyError> {
    let claims = decode(token, keys)?;
    if claims.device_id_hash != device_id_hash {
        return Err(VerifyError::WrongDevice);
    }
    Ok(claims)
}

fn parse(json: &Value) -> Option<TrialClaims> {
    let c = json.as_object()?;
    if c.get("typ")?.as_str()? != TYP {
        return None;
    }
    Some(TrialClaims {
        kid: token::string(c, "kid")?,
        device_id_hash: token::string(c, "device_id_hash")?,
        started_at: token::int(c, "started_at")?,
        ends_at: token::int(c, "ends_at")?,
        issued_at: token::int(c, "issued_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vectors() -> Value {
        serde_json::from_str(include_str!("../../../server/test/vectors/token-v1.json")).unwrap()
    }

    fn keys(v: &Value) -> PublicKeys {
        let pairs = v["public_keys"].as_object().unwrap();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    fn label(e: VerifyError) -> String {
        serde_json::to_value(e).unwrap().as_str().unwrap().to_string()
    }

    /// Mọi vector của khóa `trial` cho đúng kết quả, và token hợp lệ cho đủ mọi trường.
    #[test]
    fn every_trial_vector_gives_the_expected_result() {
        let v = vectors();
        let keys = keys(&v);
        let order: Vec<&str> = v["trial"]["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap())
            .collect();
        let mut checked = 0;
        for t in v["trial"]["tokens"].as_array().unwrap() {
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
                    let got = serde_json::json!({
                        "typ": TYP,
                        "kid": c.kid,
                        "device_id_hash": c.device_id_hash,
                        "started_at": c.started_at,
                        "ends_at": c.ends_at,
                        "issued_at": c.issued_at,
                    });
                    assert_eq!(got, t["claims"], "{name}");
                }
                Err(e) => {
                    assert_eq!(label(e), expected, "{name}");
                    assert!(order.contains(&expected), "{name}");
                }
            }
            checked += 1;
        }
        assert_eq!(checked, 11);
    }

    /// Token dùng thử không dùng thay được token bản quyền, và ngược lại.
    #[test]
    fn a_trial_token_is_not_a_license_token() {
        let v = vectors();
        let keys = keys(&v);
        let trial = v["trial"]["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(token::decode(trial, &keys), Err(VerifyError::Malformed));
        let license = v["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(decode(license, &keys), Err(VerifyError::Malformed));
    }
}
