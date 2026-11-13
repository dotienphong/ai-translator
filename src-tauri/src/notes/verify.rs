#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
//! Bộ đọc và gộp của chiến lược `Verified` (model local): đọc kết luận của lượt kiểm từng việc cần làm, đọc bản tóm tắt
//! của lượt reduce, và gộp cơ học các bản thành phần.

use serde_json::Value;

use super::chunk::PromptLine;
use super::schema::{self, ActionItem, Item, Notes};

/// Kết luận của lượt kiểm một việc cần làm: có giữ không, và người nhận, hạn do model đọc lại từ câu gốc.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Verdict {
    pub keep: bool,
    pub owner: String,
    pub due: String,
}

/// Đối tượng JSON đầu tiên của câu trả lời (sau khi bỏ khối `<think>…</think>`), đọc thành `Value`.
fn object_of(raw: &str) -> Option<Value> {
    let cleaned = schema::strip_think(raw);
    serde_json::from_str(schema::extract_object(&cleaned)?).ok()
}

/// Kết luận của lượt kiểm một việc: `{"items": [{"n": 1, "keep": bool, "owner": string, "due": string}]}`, lấy phần tử
/// `n == 1` (app luôn gửi lô một việc). Không có `items`, không có phần tử đó, hay `keep` không phải bool thì `None`;
/// `owner` và `due` không phải chuỗi thì thành chuỗi rỗng.
pub fn parse_verdict(raw: &str) -> Option<Verdict> {
    let value = object_of(raw)?;
    let entry = value
        .get("items")?
        .as_array()?
        .iter()
        .find(|e| e.get("n").and_then(Value::as_u64) == Some(1))?;
    let text = |key: &str| entry.get(key).and_then(Value::as_str).unwrap_or_default().to_string();
    Some(Verdict {
        keep: entry.get("keep")?.as_bool()?,
        owner: text("owner"),
        due: text("due"),
    })
}

/// Bản tóm tắt của lượt reduce: `{"summary": string}`, đã `trim`; rỗng hay không phải chuỗi thì `None`.
pub fn parse_summary(raw: &str) -> Option<String> {
    let value = object_of(raw)?;
    let summary = value.get("summary")?.as_str()?.trim();
    (!summary.is_empty()).then(|| summary.to_string())
}

/// Tên người nhận có thật trong cuộc họp: trùng một nhãn người nói (không phân biệt hoa thường), hay là chuỗi con của chữ
/// hay câu gốc của một câu. Tên rỗng thì `false`.
pub fn owner_known(name: &str, lines: &[PromptLine]) -> bool {
    let name = name.trim().to_lowercase();
    if name.is_empty() {
        return false;
    }
    lines.iter().any(|l| {
        l.speaker.as_deref().is_some_and(|s| s.trim().to_lowercase() == name)
            || l.text.to_lowercase().contains(&name)
            || l.source.as_deref().is_some_and(|s| s.to_lowercase().contains(&name))
    })
}

/// Có chữ Hán, Kana hay Hangul (U+3040–U+30FF, U+3400–U+4DBF, U+4E00–U+9FFF, U+AC00–U+D7AF). Dùng để bắt `due` còn nguyên
/// tiếng gốc khi ghi chú viết bằng ngôn ngữ khác.
pub fn has_cjk(text: &str) -> bool {
    text.chars().any(|c| {
        matches!(c, '\u{3040}'..='\u{30FF}' | '\u{3400}'..='\u{4DBF}' | '\u{4E00}'..='\u{9FFF}' | '\u{AC00}'..='\u{D7AF}')
    })
}

/// Chữ để so trùng: hạ chữ thường và gộp mọi khoảng trắng thành một dấu cách.
fn key_of(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Thêm `refs` mới vào `into`, sắp tăng, bỏ trùng.
fn union_refs(into: &mut Vec<u32>, more: &[u32]) {
    into.extend_from_slice(more);
    into.sort_unstable();
    into.dedup();
}

/// Gộp một mục vào danh sách theo chữ; trùng chữ thì gộp `refs`, chưa có thì thêm cuối. Trả chỉ số của mục.
fn push_item(list: &mut Vec<Item>, item: &Item) {
    let key = key_of(&item.text);
    match list.iter_mut().find(|i| key_of(&i.text) == key) {
        Some(found) => union_refs(&mut found.refs, &item.refs),
        None => {
            let mut added = item.clone();
            union_refs(&mut added.refs, &[]);
            list.push(added);
        }
    }
}

/// Gộp cơ học các bản thành phần: ba mảng nối theo thứ tự; mục trùng chữ thì gộp `refs` và, với việc cần làm, giữ `owner`,
/// `due` đầu tiên không rỗng; `summary` nối bằng `\n`.
pub fn merge_items(parts: &[Notes]) -> Notes {
    let mut merged = Notes {
        summary: parts.iter().map(|n| n.summary.as_str()).collect::<Vec<_>>().join("\n"),
        ..Notes::default()
    };
    for part in parts {
        for d in &part.decisions {
            push_item(&mut merged.decisions, d);
        }
        for q in &part.open_questions {
            push_item(&mut merged.open_questions, q);
        }
        for a in &part.action_items {
            let key = key_of(&a.text);
            match merged.action_items.iter_mut().find(|i| key_of(&i.text) == key) {
                Some(found) => {
                    union_refs(&mut found.refs, &a.refs);
                    if found.owner.trim().is_empty() {
                        found.owner.clone_from(&a.owner);
                    }
                    if found.due.trim().is_empty() {
                        found.due.clone_from(&a.due);
                    }
                }
                None => {
                    let mut added: ActionItem = a.clone();
                    union_refs(&mut added.refs, &[]);
                    merged.action_items.push(added);
                }
            }
        }
    }
    merged
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::notes::chunk::PromptLine;
    use crate::notes::schema::{ActionItem, Notes};

    #[test]
    fn verdicts_are_read_strictly() {
        let v = parse_verdict(
            r#"<think>x</think> ok {"items": [{"n": 1, "keep": true, "owner": "Minh", "due": 5}]}"#,
        )
        .unwrap();
        assert_eq!((v.keep, v.owner.as_str(), v.due.as_str()), (true, "Minh", ""));
        assert!(
            !parse_verdict(r#"{"items": [{"n": 1, "keep": false, "owner": "", "due": ""}]}"#)
                .unwrap()
                .keep
        );
        for bad in [
            "",
            "không phải JSON",
            r#"{"items": [{"n": 1, "keep": "yes"}]}"#,
            r#"{"items": [{"n": 2, "keep": true}]}"#,
            r#"{"keep": true}"#,
            r#"{"items": []}"#,
            "[1,2]",
        ] {
            assert!(parse_verdict(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn summaries_are_read_trimmed_and_never_empty() {
        assert_eq!(parse_summary(r#"<think>x</think>{"summary": "  Tóm tắt.  "}"#).as_deref(), Some("Tóm tắt."));
        for bad in ["", "chữ thô", r#"{"summary": "   "}"#, r#"{"summary": 3}"#, r#"{"khac": "x"}"#] {
            assert!(parse_summary(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn owner_must_be_a_speaker_or_appear_in_the_words() {
        let lines = vec![PromptLine {
            seq: 1,
            speaker: Some("Lan".into()),
            text: "Minh gửi báo cáo".into(),
            source: Some("Minh sends the report".into()),
        }];
        assert!(owner_known(" lan ", &lines) && owner_known("Minh", &lines) && owner_known("report", &lines));
        assert!(!owner_known("Hoa", &lines) && !owner_known("  ", &lines));
    }

    #[test]
    fn cjk_is_detected() {
        assert!(has_cjk("金曜日") && has_cjk("금요일") && has_cjk("thứ 六"));
        assert!(!has_cjk("thứ Sáu, Friday 15/12"));
    }

    #[test]
    fn merge_items_joins_duplicates_and_keeps_the_first_owner() {
        let part = |owner: &str, refs: Vec<u32>| Notes {
            summary: "s".into(),
            action_items: vec![ActionItem {
                text: " Gửi  BÁO cáo".into(),
                owner: owner.into(),
                due: String::new(),
                refs,
            }],
            ..Notes::default()
        };
        let m = merge_items(&[part("", vec![4, 2]), part("Minh", vec![2, 9])]);
        assert_eq!(m.action_items.len(), 1);
        assert_eq!(
            (m.action_items[0].owner.as_str(), m.action_items[0].refs.clone()),
            ("Minh", vec![2, 4, 9])
        );
        assert_eq!(m.summary, "s\ns");
    }
}
