//! Token bản quyền v1 (spec §6.8 "Token bản quyền", §10.2; kế hoạch 05, QĐ4):
//! `v1.<base64url(JSON claims)>.<base64url(chữ ký Ed25519 trên chuỗi ASCII "v1.<payload>")>`, base64url không đệm.
//!
//! Thứ tự kiểm, giống hệt `server/src/token.ts`: định dạng (đủ trường, đúng kiểu), `kid`, chữ ký, máy, `expires_at`, rồi
//! `refresh_before`. Token có nhiều lỗi thì trả lỗi đứng trước. Hợp đồng chốt bằng 32 vector ở
//! `server/test/vectors/token-v1.json`:
//! - mọi số nguyên phải là số nguyên an toàn của JavaScript (|n| ≤ 2^53 − 1), vì server sinh token bằng JavaScript;
//! - thiếu trường là `malformed`, kể cả `quota_minutes_per_cycle` (giá trị `null` mới là không giới hạn);
//! - token bản quyền không có trường `typ`: có `typ` là `malformed`, để token dùng thử (`typ: "trial"`, [`super::trial`])
//!   không dùng thay được token bản quyền (spec 2026-10-07 §3.1);
//! - payload là UTF-8 chặt, không có BOM (`serde_json::from_slice` trên byte đã giải mã);
//! - kiểm đủ định dạng trước khi tra `kid` và kiểm chữ ký.
//!
//! `quota_fresh` chỉ đúng trong response vừa nhận từ server (spec §6.8): token đọc lại từ kho khóa phải coi là `false`
//! (việc của nơi gọi).

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ed25519_dalek::{Signature, VerifyingKey};
use serde::Serialize;
use serde_json::{Map, Value};

use super::keys::PublicKeys;

pub const VERSION: &str = "v1";
/// Số nguyên lớn nhất JavaScript biểu diễn chính xác (`Number.MAX_SAFE_INTEGER`).
const MAX_SAFE: i64 = (1 << 53) - 1;

/// Gói trả phí trong token (spec 2026-10-07 §1): Monthly, Yearly. Free không có token bản quyền.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Plan {
    Monthly,
    Yearly,
}

impl Plan {
    fn parse(code: &str) -> Option<Self> {
        match code {
            "monthly" => Some(Self::Monthly),
            "yearly" => Some(Self::Yearly),
            _ => None,
        }
    }
}

/// Nội dung của token. Thời điểm là giây Unix theo giờ của server.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Claims {
    pub kid: String,
    pub license_id: String,
    pub activation_id: String,
    pub activation_created_at: i64,
    pub device_id_hash: String,
    pub plan: Plan,
    pub expires_at: i64,
    pub cycle_anchor: i64,
    /// Phút mỗi chu kỳ 30 ngày; `None` là không giới hạn (Yearly).
    pub quota_minutes_per_cycle: Option<u32>,
    pub quota_epoch: i64,
    pub quota_fresh: bool,
    pub issued_at: i64,
    pub refresh_before: i64,
}

/// Lỗi khi kiểm token, theo đúng thứ tự kiểm.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, thiserror::Error)]
#[serde(rename_all = "snake_case")]
pub enum VerifyError {
    #[error("token sai định dạng")]
    Malformed,
    #[error("token ký bằng khóa không có trong app")]
    UnknownKid,
    #[error("chữ ký của token không đúng")]
    BadSignature,
    #[error("token của máy khác")]
    WrongDevice,
    #[error("license đã hết hạn")]
    LicenseExpired,
    #[error("token quá hạn làm mới")]
    RefreshExpired,
}

/// Đọc và kiểm định dạng, rồi `kid` và chữ ký. Không kiểm máy và thời hạn ([`check`]).
pub fn decode(token: &str, keys: &PublicKeys) -> Result<Claims, VerifyError> {
    let mut parts = token.split('.');
    let (Some(version), Some(payload), Some(sig), None) = (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return Err(VerifyError::Malformed);
    };
    if version != VERSION {
        return Err(VerifyError::Malformed);
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).map_err(|_| VerifyError::Malformed)?;
    let json: Value = serde_json::from_slice(&bytes).map_err(|_| VerifyError::Malformed)?;
    let claims = parse_claims(&json).ok_or(VerifyError::Malformed)?;
    let sig = URL_SAFE_NO_PAD
        .decode(sig)
        .ok()
        .and_then(|b| <[u8; 64]>::try_from(b).ok())
        .ok_or(VerifyError::Malformed)?;
    let key = keys.get(&claims.kid).ok_or(VerifyError::UnknownKid)?;
    let key = VerifyingKey::from_bytes(key).map_err(|_| VerifyError::BadSignature)?;
    let signing_input = format!("{VERSION}.{payload}");
    key.verify_strict(signing_input.as_bytes(), &Signature::from_bytes(&sig))
        .map_err(|_| VerifyError::BadSignature)?;
    Ok(claims)
}

/// Kiểm máy và thời hạn của claims đã kiểm chữ ký. Hết hạn khi `now >= expires_at` hoặc `now >= refresh_before`.
pub fn check(claims: &Claims, now: i64, device_id_hash: &str) -> Result<(), VerifyError> {
    if claims.device_id_hash != device_id_hash {
        return Err(VerifyError::WrongDevice);
    }
    if now >= claims.expires_at {
        return Err(VerifyError::LicenseExpired);
    }
    if now >= claims.refresh_before {
        return Err(VerifyError::RefreshExpired);
    }
    Ok(())
}

/// Kiểm đủ: [`decode`] rồi [`check`].
pub fn verify(token: &str, keys: &PublicKeys, now: i64, device_id_hash: &str) -> Result<Claims, VerifyError> {
    let claims = decode(token, keys)?;
    check(&claims, now, device_id_hash)?;
    Ok(claims)
}

fn int(c: &Map<String, Value>, key: &str) -> Option<i64> {
    let n = c.get(key)?.as_i64()?;
    (-MAX_SAFE..=MAX_SAFE).contains(&n).then_some(n)
}

fn string(c: &Map<String, Value>, key: &str) -> Option<String> {
    c.get(key)?.as_str().map(String::from)
}

fn parse_claims(json: &Value) -> Option<Claims> {
    let c = json.as_object()?;
    if c.contains_key("typ") {
        return None;
    }
    let quota = match c.get("quota_minutes_per_cycle")? {
        Value::Null => None,
        v => {
            let n = v.as_i64().filter(|n| (1..=MAX_SAFE).contains(n))?;
            Some(u32::try_from(n).ok()?)
        }
    };
    let quota_epoch = int(c, "quota_epoch").filter(|&e| e >= 0)?;
    Some(Claims {
        kid: string(c, "kid")?,
        license_id: string(c, "license_id")?,
        activation_id: string(c, "activation_id")?,
        activation_created_at: int(c, "activation_created_at")?,
        device_id_hash: string(c, "device_id_hash")?,
        plan: Plan::parse(c.get("plan")?.as_str()?)?,
        expires_at: int(c, "expires_at")?,
        cycle_anchor: int(c, "cycle_anchor")?,
        quota_minutes_per_cycle: quota,
        quota_epoch,
        quota_fresh: c.get("quota_fresh")?.as_bool()?,
        issued_at: int(c, "issued_at")?,
        refresh_before: int(c, "refresh_before")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    /// Bộ vector dùng chung với license server (kế hoạch 05, Task 6; Đ9 của kế hoạch 00).
    const VECTORS: &str = include_str!("../../../server/test/vectors/token-v1.json");

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

    /// Đúng bản vector đã chốt với server (kế hoạch 2026-10-07 ba gói · 01 Task 1: mã gói `monthly`, `yearly`, khóa
    /// `trial`).
    #[test]
    fn the_vector_file_is_the_agreed_one() {
        let hash = hex(&Sha256::digest(VECTORS.as_bytes()));
        assert_eq!(hash, "b18e7b9e961181a2a8ed94bfd2178a54d8cb921116834367c5268f9bc538faa2");
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[test]
    fn every_vector_gives_the_expected_result() {
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
                t["now"].as_i64().unwrap(),
                t["device_id_hash"].as_str().unwrap(),
            );
            let expected = t["expected"].as_str().unwrap();
            match got {
                Ok(claims) => {
                    assert_eq!(expected, "ok", "{name}");
                    // So đủ mọi trường với `claims` của vector (N3 của review 06 lần 1).
                    let plan = match claims.plan {
                        Plan::Monthly => "monthly",
                        Plan::Yearly => "yearly",
                    };
                    let got = serde_json::json!({
                        "kid": claims.kid,
                        "license_id": claims.license_id,
                        "activation_id": claims.activation_id,
                        "activation_created_at": claims.activation_created_at,
                        "device_id_hash": claims.device_id_hash,
                        "plan": plan,
                        "expires_at": claims.expires_at,
                        "cycle_anchor": claims.cycle_anchor,
                        "quota_minutes_per_cycle": claims.quota_minutes_per_cycle,
                        "quota_epoch": claims.quota_epoch,
                        "quota_fresh": claims.quota_fresh,
                        "issued_at": claims.issued_at,
                        "refresh_before": claims.refresh_before,
                    });
                    assert_eq!(got, t["claims"], "{name}");
                }
                Err(e) => {
                    assert_eq!(label(e), expected, "{name}");
                    assert!(order.contains(&expected));
                }
            }
            checked += 1;
        }
        assert_eq!(checked, 32);
    }

    /// Thứ tự lỗi của `VerifyError` đúng `checks_order` của vector.
    #[test]
    fn errors_are_ordered_like_the_contract() {
        let v = vectors();
        let order: Vec<String> = v["checks_order"]
            .as_array()
            .unwrap()
            .iter()
            .map(|x| x.as_str().unwrap().into())
            .collect();
        let ours = [
            VerifyError::Malformed,
            VerifyError::UnknownKid,
            VerifyError::BadSignature,
            VerifyError::WrongDevice,
            VerifyError::LicenseExpired,
            VerifyError::RefreshExpired,
        ];
        assert_eq!(ours.map(label).to_vec(), order);
    }

    /// Không có khóa nào (môi trường chưa triển khai): token hợp lệ cũng là `unknown_kid`, tức gói Free.
    #[test]
    fn without_keys_every_token_is_unknown() {
        let v = vectors();
        let valid = v["tokens"][0]["token"].as_str().unwrap();
        assert_eq!(decode(valid, &PublicKeys::default()), Err(VerifyError::UnknownKid));
    }

    /// `verify_strict`: khóa yếu (điểm bậc nhỏ) bị từ chối. Với khóa là điểm đơn vị, chữ ký (R = điểm đơn vị, s = 0)
    /// qua phép kiểm thường với mọi thông điệp; phép kiểm chặt phải từ chối.
    #[test]
    fn a_weak_key_and_a_trivial_signature_are_refused() {
        let v = vectors();
        let valid = v["tokens"][0]["token"].as_str().unwrap();
        let payload = valid.split('.').nth(1).unwrap();
        let mut claims: Value = serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).unwrap()).unwrap();
        claims["kid"] = Value::from("weak");
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        let mut identity = [0u8; 32];
        identity[0] = 1;
        let keys = PublicKeys::from_pairs([("weak", URL_SAFE_NO_PAD.encode(identity).as_str())]).unwrap();
        let mut sig = [0u8; 64];
        sig[0] = 1;
        let token = format!("v1.{payload}.{}", URL_SAFE_NO_PAD.encode(sig));
        assert_eq!(decode(&token, &keys), Err(VerifyError::BadSignature));
    }
}
