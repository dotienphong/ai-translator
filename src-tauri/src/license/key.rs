//! License key người dùng gõ (spec §10.2; kế hoạch 05, `server/src/license-key.ts`): 27 ký tự ngẫu nhiên theo bảng
//! Crockford base32 cộng 1 ký tự kiểm tra Luhn mod 32. App kiểm ký tự kiểm tra trước khi gọi server, để báo gõ sai ngay
//! mà không tốn một lần thất bại của luật chặn IP (§10.2). Chuẩn hóa giống hệt server: bỏ khoảng trắng và gạch nối, viết
//! hoa, đổi `O` thành `0`, `I` và `L` thành `1`.

pub const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BODY_LENGTH: usize = 27;
const MAX_INPUT_LENGTH: usize = 64;

fn luhn_check_char(body: &[u8]) -> u8 {
    let n = ALPHABET.len();
    let mut factor = 2;
    let mut sum = 0;
    for &c in body.iter().rev() {
        let value = ALPHABET.iter().position(|&a| a == c).unwrap_or(0);
        let product = factor * value;
        sum += product / n + product % n;
        factor = if factor == 2 { 1 } else { 2 };
    }
    ALPHABET[(n - sum % n) % n]
}

/// Dạng lưu trữ (28 ký tự, không gạch nối) của key người dùng gõ, hoặc `None` nếu sai độ dài, sai ký tự hay sai ký tự kiểm
/// tra.
pub fn normalize(input: &str) -> Option<String> {
    if input.len() > MAX_INPUT_LENGTH {
        return None;
    }
    let key: Vec<u8> = input
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| match c.to_ascii_uppercase() {
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        })
        .map(|c| u8::try_from(c).unwrap_or(0))
        .collect();
    if key.len() != BODY_LENGTH + 1 || !key.iter().all(|c| ALPHABET.contains(c)) {
        return None;
    }
    (luhn_check_char(&key[..BODY_LENGTH]) == key[BODY_LENGTH]).then(|| String::from_utf8(key).expect("ASCII"))
}

/// Dạng hiển thị: 7 nhóm 4 ký tự nối bằng `-`.
pub fn display(key: &str) -> String {
    key.as_bytes()
        .chunks(4)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    const VECTORS: &str = include_str!("../../../server/test/vectors/token-v1.json");

    #[test]
    fn keys_normalize_like_the_server() {
        let v: Value = serde_json::from_str(VECTORS).unwrap();
        let cases = v["license_keys"].as_array().unwrap();
        assert_eq!(cases.len(), 7);
        for case in cases {
            let input = case["input"].as_str().unwrap();
            assert_eq!(normalize(input).as_deref(), case["normalized"].as_str(), "{input:?}");
        }
    }

    #[test]
    fn every_single_character_typo_is_caught() {
        let key = "0123456789ABCDEFGHJKMNPQRST5";
        assert!(normalize(key).is_some());
        for i in 0..key.len() {
            for &c in ALPHABET {
                let mut typo = key.as_bytes().to_vec();
                if typo[i] == c {
                    continue;
                }
                typo[i] = c;
                assert!(
                    normalize(std::str::from_utf8(&typo).unwrap()).is_none(),
                    "{i} {}",
                    c as char
                );
            }
        }
    }

    #[test]
    fn display_groups_by_four_and_long_or_odd_input_is_refused() {
        assert_eq!(
            display("0123456789ABCDEFGHJKMNPQRST5"),
            "0123-4567-89AB-CDEF-GHJK-MNPQ-RST5"
        );
        assert_eq!(normalize(&"0".repeat(65)), None);
        assert_eq!(normalize("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTÀ"), None);
    }
}
