//! Cắt chữ thành câu (port `core_utils._scan_sentences`/`split_into_sentences`) và cắt câu quá dài theo dấu phụ.
//! Cắt trên chữ THÔ (trước chuẩn hóa), không cắt bên trong ngoặc hay trích dẫn.

const SENT_END: &[char] = &['.', '!', '?', '…'];

fn closer_of(c: char) -> Option<char> {
    Some(match c {
        '(' => ')',
        '[' => ']',
        '{' => '}',
        '“' => '”',
        '‘' => '’',
        '«' => '»',
        '‹' => '›',
        '「' => '」',
        '『' => '』',
        _ => return None,
    })
}

fn is_opener(c: char) -> bool {
    closer_of(c).is_some()
}

fn is_closer(c: char) -> bool {
    matches!(c, ')' | ']' | '}' | '”' | '’' | '»' | '›' | '」' | '』')
}

fn is_trailing_close(c: char) -> bool {
    is_closer(c) || matches!(c, '"' | '\'' | '’' | '”')
}

fn scan(chars: &[char], quote_aware: bool) -> (Vec<String>, bool) {
    let n = chars.len();
    let mut out: Vec<String> = Vec::new();
    let (mut start, mut i, mut depth, mut in_quote) = (0usize, 0usize, 0usize, false);
    while i < n {
        let ch = chars[i];
        if quote_aware && ch == '"' {
            in_quote = !in_quote;
        } else if quote_aware && is_opener(ch) {
            depth += 1;
        } else if quote_aware && is_closer(ch) {
            depth = depth.saturating_sub(1);
        } else if SENT_END.contains(&ch) && depth == 0 && !in_quote {
            let mut j = i + 1;
            while j < n && SENT_END.contains(&chars[j]) {
                j += 1;
            }
            while j < n && is_trailing_close(chars[j]) {
                j += 1;
            }
            // Chỉ là ranh giới câu khi theo sau là khoảng trắng hoặc hết chữ: "3.5 triệu", "8.30 sáng" không bị cắt.
            if j >= n || chars[j].is_whitespace() {
                out.push(chars[start..j].iter().collect());
                start = j;
                i = j;
                continue;
            }
            i = j;
            continue;
        }
        i += 1;
    }
    if start < n {
        out.push(chars[start..].iter().collect());
    }
    let out = out
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    (out, depth == 0 && !in_quote)
}

/// Tách chữ thành câu. Ngoặc/nháy lệch thì quét lại bỏ qua ngoặc, để một dấu nháy lạc không nuốt cả phần còn lại.
pub fn split_into_sentences(text: &str) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = text.chars().collect();
    let (s, balanced) = scan(&chars, true);
    if balanced { s } else { scan(&chars, false).0 }
}

/// Câu dài hơn `max_chars` ký tự thì cắt ở dấu phụ (`, ; : - – —`) gần giữa nhất cho cân; hết dấu phụ thì cắt ở dấu
/// cách. Mỗi mảnh giữ nguyên dấu cuối của nó. Câu ngắn trả nguyên. (Thiết kế riêng, không port từ SDK.)
pub fn split_long(sentence: &str, max_chars: usize) -> Vec<String> {
    let chars: Vec<char> = sentence.chars().collect();
    if chars.len() <= max_chars || max_chars < 8 {
        return vec![sentence.to_string()];
    }
    let target = chars.len() / 2;
    let near = |cands: Vec<usize>| cands.into_iter().min_by_key(|&p| p.abs_diff(target));
    // Vị trí cắt = chỉ số ngay sau dấu phụ hoặc tại dấu cách.
    let minor: Vec<usize> = (0..chars.len())
        .filter(|&i| {
            matches!(chars[i], ',' | ';' | ':' | '–' | '—') && chars.get(i + 1).is_some_and(|c| c.is_whitespace())
        })
        .map(|i| i + 1)
        .filter(|&p| p >= 4 && chars.len() - p >= 4)
        .collect();
    let cut = near(minor).or_else(|| {
        near(
            (0..chars.len())
                .filter(|&i| chars[i] == ' ')
                .filter(|&p| p >= 4 && chars.len() - p >= 4)
                .collect(),
        )
    });
    match cut {
        None => vec![sentence.to_string()],
        Some(p) => {
            let left: String = chars[..p].iter().collect::<String>().trim().to_string();
            let right: String = chars[p..].iter().collect::<String>().trim().to_string();
            let mut out = split_long(&left, max_chars);
            out.extend(split_long(&right, max_chars));
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_basic_and_keeps_decimals() {
        assert_eq!(
            split_into_sentences("Xin chào. Tôi là A! Giá 3.5 triệu?"),
            ["Xin chào.", "Tôi là A!", "Giá 3.5 triệu?"]
        );
        assert!(split_into_sentences("").is_empty());
    }

    #[test]
    fn quotes_and_brackets_protect_inner_ends() {
        let s = split_into_sentences("Anh hỏi: \"Rồi sao? Đến bao giờ?\", đúng không?");
        assert_eq!(s.len(), 1, "{s:?}");
    }

    #[test]
    fn unbalanced_quote_does_not_swallow_the_rest() {
        let s = split_into_sentences("Một \"câu lệch. Câu hai. Câu ba.");
        assert_eq!(s.len(), 3, "{s:?}");
    }

    #[test]
    fn long_sentences_split_near_the_middle_at_minor_punctuation() {
        let long =
            "Cuộc họp sẽ bắt đầu vào lúc ba giờ chiều, vui lòng tham gia đúng giờ và chuẩn bị sẵn tài liệu cần thiết.";
        let parts = split_long(long, 60);
        assert!(parts.len() >= 2 && parts.iter().all(|p| !p.is_empty()));
        assert_eq!(
            parts.join(" ").split_whitespace().collect::<Vec<_>>(),
            long.split_whitespace().collect::<Vec<_>>()
        );
        assert_eq!(split_long("ngắn thôi", 60), ["ngắn thôi"]);
    }
}
