//! Ghi chú cuộc họp: các kiểu dữ liệu, đọc JSON model trả về (nội dung không đáng tin: có thể sai hình, thừa chữ bao
//! quanh, trích dẫn sai số câu, tên người không có trong cuộc họp) và kiểm bản sửa tay từ giao diện.

use std::collections::{BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::chunk::PromptLine;
use crate::settings::{Invalid, Reason};

/// Số ký tự tối đa của phần tóm tắt.
pub const MAX_SUMMARY_CHARS: usize = 20_000;
/// Số mục tối đa của mỗi danh sách (quyết định, việc cần làm, câu hỏi mở).
pub const MAX_ITEMS: usize = 200;
/// Số ký tự tối đa của `text`, `owner`, `due` trong một mục.
pub const MAX_TEXT_CHARS: usize = 2_000;

/// Ghi chú của một cuộc họp.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notes {
    pub summary: String,
    pub decisions: Vec<Item>,
    pub action_items: Vec<ActionItem>,
    pub open_questions: Vec<Item>,
    /// Model không trả được JSON đúng hình nên `summary` là chữ thô của model.
    #[serde(default)]
    pub raw: bool,
}

/// Một quyết định hay câu hỏi mở; `refs` là số câu (`PromptLine::seq`) làm căn cứ.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub text: String,
    pub refs: Vec<u32>,
}

/// Một việc cần làm; `owner` và `due` để chuỗi rỗng khi chưa rõ.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionItem {
    pub text: String,
    pub owner: String,
    pub due: String,
    pub refs: Vec<u32>,
}

/// Số đếm khi chuẩn hóa JSON của model.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Stats {
    /// Mọi phần tử `refs` của các mục được giữ lại.
    pub refs_total: u32,
    /// Phần tử `refs` không phải số câu hợp lệ (trùng với phần tử đã có thì không tính).
    pub refs_invalid: u32,
    /// Số `owner` bị xóa vì không khớp người nói hay chữ nào của cuộc họp.
    pub owners_cleared: u32,
}

/// Bỏ mọi khối `<think>…</think>`; khối mở mà không đóng (model bị cắt giữa lúc suy nghĩ) thì bỏ từ chỗ mở tới hết.
fn strip_think(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some((before, after)) = rest.split_once("<think>") {
        out.push_str(before);
        match after.split_once("</think>") {
            Some((_, tail)) => rest = tail,
            None => return out,
        }
    }
    out.push_str(rest);
    out
}

/// Đoạn từ `{` đầu tiên tới `}` khớp ngoặc của nó; ngoặc trong chuỗi JSON (có xét `\"`) không tính.
fn extract_object(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    for (i, c) in s.get(start..)?.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            continue;
        }
        match c {
            '"' => in_string = true,
            '{' => depth = depth.saturating_add(1),
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return s.get(start..start.saturating_add(i).saturating_add(c.len_utf8()));
                }
            }
            _ => {}
        }
    }
    None
}

/// Dữ liệu của cuộc họp dùng để kiểm `refs` và `owner`, cùng số đếm đang cộng dồn.
struct Checker {
    seqs: HashSet<u32>,
    speakers: Vec<String>,
    texts: Vec<String>,
    stats: Stats,
}

impl Checker {
    fn new(lines: &[PromptLine]) -> Self {
        Self {
            seqs: lines.iter().map(|l| l.seq).collect(),
            speakers: lines
                .iter()
                .filter_map(|l| l.speaker.as_deref())
                .map(str::to_lowercase)
                .collect(),
            texts: lines.iter().map(|l| l.text.to_lowercase()).collect(),
            stats: Stats::default(),
        }
    }

    /// Số của một phần tử `refs`: số nguyên không âm hay chuỗi toàn chữ số vừa `u32`; không thì `None`.
    fn ref_number(v: &Value) -> Option<u32> {
        match v {
            Value::Number(n) => n.as_u64().and_then(|n| u32::try_from(n).ok()),
            Value::String(s) if !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()) => s.parse().ok(),
            _ => None,
        }
    }

    /// `refs` đã chuẩn hóa: chỉ số câu có thật, không trùng, xếp tăng. Không phải mảng thì coi như không có.
    fn refs(&mut self, v: Option<&Value>) -> Vec<u32> {
        let mut kept = BTreeSet::new();
        for r in v.and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default() {
            self.stats.refs_total = self.stats.refs_total.saturating_add(1);
            match Self::ref_number(r) {
                Some(n) if self.seqs.contains(&n) => {
                    kept.insert(n);
                }
                _ => self.stats.refs_invalid = self.stats.refs_invalid.saturating_add(1),
            }
        }
        kept.into_iter().collect()
    }

    /// Giữ `owner` khi trùng một người nói hay nằm trong chữ của một câu (không phân biệt hoa thường); không thì xóa.
    fn owner(&mut self, v: Option<&Value>) -> String {
        let Some(owner) = v.and_then(Value::as_str) else {
            return String::new();
        };
        let needle = owner.trim().to_lowercase();
        if needle.is_empty() {
            return String::new();
        }
        if self.speakers.contains(&needle) || self.texts.iter().any(|t| t.contains(&needle)) {
            return owner.to_string();
        }
        self.stats.owners_cleared = self.stats.owners_cleared.saturating_add(1);
        String::new()
    }
}

/// Cắt còn tối đa `max` ký tự (đếm ký tự, không cắt giữa một ký tự).
fn clamp(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

/// Tối đa `MAX_ITEMS` phần tử là object có `text` không rỗng (sau `trim`); mục khác bị bỏ và không tính vào `Stats`,
/// mục vượt `MAX_ITEMS` không được đọc nên cũng không tính.
fn entries(v: &Value) -> impl Iterator<Item = (&str, &serde_json::Map<String, Value>)> {
    v.as_array()
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(|e| {
            let obj = e.as_object()?;
            let text = obj.get("text")?.as_str()?;
            (!text.trim().is_empty()).then_some((text, obj))
        })
        .take(MAX_ITEMS)
}

fn read_items(v: &Value, ck: &mut Checker) -> Vec<Item> {
    entries(v)
        .map(|(text, obj)| Item {
            text: clamp(text, MAX_TEXT_CHARS),
            refs: ck.refs(obj.get("refs")),
        })
        .collect()
}

fn read_action_items(v: &Value, ck: &mut Checker) -> Vec<ActionItem> {
    entries(v)
        .map(|(text, obj)| ActionItem {
            text: clamp(text, MAX_TEXT_CHARS),
            owner: clamp(&ck.owner(obj.get("owner")), MAX_TEXT_CHARS),
            due: clamp(
                obj.get("due").and_then(Value::as_str).unwrap_or_default(),
                MAX_TEXT_CHARS,
            ),
            refs: ck.refs(obj.get("refs")),
        })
        .collect()
}

/// Đọc câu trả lời của model thành `Notes`. Chịu được chữ bao quanh (khối ```, `<think>`, lời dẫn); trả `None` khi
/// không tìm được một object JSON đúng hình (`summary` là chuỗi, `decisions`, `action_items`, `open_questions` đều là
/// mảng). `refs` và `owner` được đối chiếu với `lines`; `Stats` ghi số phần tử bị loại. Kết quả luôn nằm trong giới hạn
/// của `validate_edit`: mỗi danh sách giữ tối đa `MAX_ITEMS` mục, chữ dài quá được cắt (không trả `None`).
pub fn parse(raw: &str, lines: &[PromptLine]) -> Option<(Notes, Stats)> {
    let cleaned = strip_think(raw);
    let value: Value = serde_json::from_str(extract_object(&cleaned)?).ok()?;
    let obj = value.as_object()?;
    let summary = clamp(obj.get("summary")?.as_str()?, MAX_SUMMARY_CHARS);
    let decisions = obj.get("decisions").filter(|v| v.is_array())?;
    let action_items = obj.get("action_items").filter(|v| v.is_array())?;
    let open_questions = obj.get("open_questions").filter(|v| v.is_array())?;

    let mut ck = Checker::new(lines);
    let notes = Notes {
        summary,
        decisions: read_items(decisions, &mut ck),
        action_items: read_action_items(action_items, &mut ck),
        open_questions: read_items(open_questions, &mut ck),
        raw: false,
    };
    Some((notes, ck.stats))
}

/// Dài hơn `max` ký tự (đếm ký tự, không đếm byte; không duyệt quá `max + 1` ký tự).
fn too_long(s: &str, max: usize) -> bool {
    s.chars().nth(max).is_some()
}

fn out_of_range(field: &str) -> Invalid {
    Invalid::new(field, Reason::OutOfRange)
}

/// `refs` chỉ giữ số trong `1..=line_count`, không trùng, xếp tăng.
fn clean_refs(refs: &[u32], line_count: usize) -> Vec<u32> {
    let kept: BTreeSet<u32> = refs
        .iter()
        .copied()
        .filter(|r| usize::try_from(*r).is_ok_and(|r| (1..=line_count).contains(&r)))
        .collect();
    kept.into_iter().collect()
}

/// Kiểm và làm sạch ghi chú do giao diện gửi lên (không đáng tin): giới hạn độ dài và số mục, bỏ mục có `text` rỗng,
/// chuẩn hóa `refs` theo `line_count` (số câu của bản chép lời). Giữ nguyên `raw`.
pub fn validate_edit(notes: Notes, line_count: usize) -> Result<Notes, Invalid> {
    if too_long(&notes.summary, MAX_SUMMARY_CHARS) {
        return Err(out_of_range("notes.summary"));
    }
    if notes.decisions.len() > MAX_ITEMS {
        return Err(out_of_range("notes.decisions"));
    }
    if notes.action_items.len() > MAX_ITEMS {
        return Err(out_of_range("notes.actionItems"));
    }
    if notes.open_questions.len() > MAX_ITEMS {
        return Err(out_of_range("notes.openQuestions"));
    }
    let fields_ok = |fields: &[&str]| !fields.iter().any(|f| too_long(f, MAX_TEXT_CHARS));
    let items_ok = |items: &[Item]| items.iter().all(|i| fields_ok(&[&i.text]));
    let actions_ok = notes
        .action_items
        .iter()
        .all(|a| fields_ok(&[&a.text, &a.owner, &a.due]));
    if !items_ok(&notes.decisions) || !items_ok(&notes.open_questions) || !actions_ok {
        return Err(out_of_range("notes.text"));
    }

    let clean_items = |items: Vec<Item>| -> Vec<Item> {
        items
            .into_iter()
            .filter(|i| !i.text.trim().is_empty())
            .map(|i| Item {
                refs: clean_refs(&i.refs, line_count),
                text: i.text,
            })
            .collect()
    };
    let action_items = notes
        .action_items
        .into_iter()
        .filter(|a| !a.text.trim().is_empty())
        .map(|a| ActionItem {
            refs: clean_refs(&a.refs, line_count),
            ..a
        })
        .collect();
    Ok(Notes {
        summary: notes.summary,
        decisions: clean_items(notes.decisions),
        action_items,
        open_questions: clean_items(notes.open_questions),
        raw: notes.raw,
    })
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;

    fn lines() -> Vec<PromptLine> {
        vec![
            PromptLine {
                seq: 1,
                speaker: Some("Lan".into()),
                text: "Minh gửi báo cáo thứ Sáu".into(),
                source: None,
            },
            PromptLine {
                seq: 2,
                speaker: None,
                text: "y".into(),
                source: None,
            }, // câu 3 đã bị bỏ (Dropped)
        ]
    }

    const GOOD: &str = r#"{"summary":"S","decisions":[{"text":"D","refs":[1,"2",99,"1-2",1,3]}],
  "action_items":[{"text":"A","owner":"minh","due":"thứ Sáu","refs":[1]},{"text":"B","owner":"Bob","due":null,"refs":[]},
                  {"text":"  ","owner":"","due":"","refs":[1]}],"open_questions":[]}"#;

    #[test]
    fn parse_normalizes() {
        let (n, stats) = parse(GOOD, &lines()).unwrap();
        assert_eq!(
            n.decisions,
            [Item {
                text: "D".into(),
                refs: vec![1, 2]
            }]
        );
        assert_eq!(n.action_items.len(), 2);
        assert_eq!(
            (
                n.action_items[0].owner.as_str(),
                n.action_items[1].owner.as_str(),
                n.action_items[1].due.as_str()
            ),
            ("minh", "", "")
        );
        assert_eq!(
            stats,
            Stats {
                refs_total: 7,
                refs_invalid: 3,
                owners_cleared: 1
            }
        );
        assert!(!n.raw);
    }

    #[test]
    fn parse_reads_through_wrappers() {
        for raw in [
            format!("```json\n{GOOD}\n```"),
            format!("<think>hmm {{}}</think>\n{GOOD}"),
            format!("Here:\n{GOOD}\nDone."),
        ] {
            assert_eq!(parse(&raw, &lines()).unwrap().0.summary, "S");
        }
    }

    #[test]
    fn parse_rejects_wrong_shapes() {
        for bad in [
            "not json",
            "[]",
            r#"{"summary":5,"decisions":[],"action_items":[],"open_questions":[]}"#,
            r#"{"decisions":[],"action_items":[],"open_questions":[]}"#,
            r#"{"summary":"s","decisions":"none","action_items":[],"open_questions":[]}"#,
            "{\"summary\":\"s\"",
        ] {
            assert!(parse(bad, &lines()).is_none(), "{bad}");
        }
    }

    #[test]
    fn validate_edit_caps_and_cleans() {
        let mut n = parse(GOOD, &lines()).unwrap().0;
        n.decisions[0].refs = vec![2, 0, 9, 2];
        assert_eq!(validate_edit(n.clone(), 3).unwrap().decisions[0].refs, [2]);
        n.summary = "x".repeat(MAX_SUMMARY_CHARS + 1);
        assert_eq!(
            validate_edit(n.clone(), 3),
            Err(Invalid::new("notes.summary", Reason::OutOfRange))
        );
        n.summary.clear();
        n.open_questions = vec![
            Item {
                text: "q".into(),
                refs: vec![]
            };
            MAX_ITEMS + 1
        ];
        assert_eq!(
            validate_edit(n, 3),
            Err(Invalid::new("notes.openQuestions", Reason::OutOfRange))
        );
    }

    fn notes_with(text: &str, owner: &str, due: &str) -> Notes {
        Notes {
            summary: "s".into(),
            action_items: vec![ActionItem {
                text: text.into(),
                owner: owner.into(),
                due: due.into(),
                refs: vec![],
            }],
            ..Notes::default()
        }
    }

    #[test]
    fn validate_edit_drops_blank_items() {
        let blank = || Item {
            text: " \t\n".into(),
            refs: vec![1],
        };
        let ok = || Item {
            text: "ok".into(),
            refs: vec![1],
        };
        let mut n = Notes {
            summary: "s".into(),
            decisions: vec![blank(), ok()],
            open_questions: vec![ok(), blank()],
            ..Notes::default()
        };
        n.action_items = vec![
            ActionItem {
                text: "".into(),
                owner: "a".into(),
                due: "b".into(),
                refs: vec![1],
            },
            ActionItem {
                text: "việc".into(),
                owner: "a".into(),
                due: "b".into(),
                refs: vec![1],
            },
        ];
        n.raw = true;
        let out = validate_edit(n, 3).unwrap();
        assert_eq!(out.decisions, [ok()]);
        assert_eq!(out.open_questions, [ok()]);
        assert_eq!(out.action_items.len(), 1);
        assert_eq!(out.action_items[0].text, "việc");
        assert!(out.raw);
    }

    #[test]
    fn validate_edit_removes_refs_out_of_range() {
        let n = Notes {
            decisions: vec![Item {
                text: "d".into(),
                refs: vec![0, 3, 4, u32::MAX, 1, 3],
            }],
            action_items: vec![ActionItem {
                text: "a".into(),
                refs: vec![4, 0, 2],
                ..ActionItem::default()
            }],
            ..Notes::default()
        };
        let out = validate_edit(n, 3).unwrap();
        assert_eq!(out.decisions[0].refs, [1, 3]);
        assert_eq!(out.action_items[0].refs, [2]);
        let n = Notes {
            decisions: vec![Item {
                text: "d".into(),
                refs: vec![1],
            }],
            ..Notes::default()
        };
        assert_eq!(validate_edit(n, 0).unwrap().decisions[0].refs, Vec::<u32>::new());
    }

    #[test]
    fn validate_edit_counts_chars_not_bytes() {
        // Ký tự tiếng Việt nhiều byte: đúng MAX_TEXT_CHARS ký tự (nhiều hơn MAX_TEXT_CHARS byte) vẫn hợp lệ.
        let at_max = "ệ".repeat(MAX_TEXT_CHARS);
        let over = "ệ".repeat(MAX_TEXT_CHARS + 1);
        let err = Err(Invalid::new("notes.text", Reason::OutOfRange));
        assert!(validate_edit(notes_with(&at_max, &at_max, &at_max), 3).is_ok());
        assert_eq!(validate_edit(notes_with(&over, "", ""), 3), err);
        assert_eq!(validate_edit(notes_with("t", &over, ""), 3), err);
        assert_eq!(validate_edit(notes_with("t", "", &over), 3), err);
        let n = Notes {
            decisions: vec![Item {
                text: over.clone(),
                refs: vec![],
            }],
            ..Notes::default()
        };
        assert_eq!(validate_edit(n, 3), err);
        let n = Notes {
            open_questions: vec![Item {
                text: over,
                refs: vec![],
            }],
            ..Notes::default()
        };
        assert_eq!(validate_edit(n, 3), err);
        let n = Notes {
            summary: "ệ".repeat(MAX_SUMMARY_CHARS),
            ..Notes::default()
        };
        assert!(validate_edit(n, 3).is_ok());
    }

    #[test]
    fn validate_edit_caps_decisions_and_action_items() {
        let n = Notes {
            decisions: vec![Item::default(); MAX_ITEMS + 1],
            ..Notes::default()
        };
        assert_eq!(
            validate_edit(n, 3),
            Err(Invalid::new("notes.decisions", Reason::OutOfRange))
        );
        let n = Notes {
            action_items: vec![ActionItem::default(); MAX_ITEMS + 1],
            ..Notes::default()
        };
        assert_eq!(
            validate_edit(n, 3),
            Err(Invalid::new("notes.actionItems", Reason::OutOfRange))
        );
    }

    #[test]
    fn parse_counts_untrusted_refs_as_invalid_without_panicking() {
        let raw = r#"{"summary":"s","decisions":[{"text":"d","refs":[99999999999999999999,-1,1.5,null,
            "99999999999999999999","",{"a":1},[1],4294967296,1]}],"action_items":[],"open_questions":[]}"#;
        let (n, stats) = parse(raw, &lines()).unwrap();
        assert_eq!(n.decisions[0].refs, [1]);
        assert_eq!(
            stats,
            Stats {
                refs_total: 10,
                refs_invalid: 9,
                owners_cleared: 0
            }
        );
    }

    #[test]
    fn parse_handles_braces_inside_strings_and_multibyte_text() {
        let raw = "Đây là kết quả: {\"summary\":\"ệ } { \\\" } ệ\",\"decisions\":[],\"action_items\":[],\"open_questions\":[]} xong ệ}";
        assert_eq!(parse(raw, &lines()).unwrap().0.summary, "ệ } { \" } ệ");
        // Ngoặc trong chuỗi không đóng được object: thiếu `}` thật nên không đọc được, và không panic.
        for bad in [
            r#"{"summary":"}""#,
            r#"{"summary":"{{{"#,
            "{",
            "}",
            "ệ{ệ",
            "{\"s\\",
            "{\"a\":\"\\",
        ] {
            assert!(parse(bad, &lines()).is_none(), "{bad}");
        }
    }

    #[test]
    fn parse_survives_deep_nesting_and_unclosed_think() {
        let deep = format!("{{\"summary\":{}1{}}}", "[".repeat(100_000), "]".repeat(100_000));
        assert!(parse(&deep, &lines()).is_none());
        assert!(parse(&"{".repeat(100_000), &lines()).is_none());
        assert!(parse(&format!("<think>{GOOD}"), &lines()).is_none());
        assert!(parse("", &[]).is_none());
        // Không có câu nào: mọi refs đều không hợp lệ, mọi owner bị xóa; không panic.
        let (n, stats) = parse(GOOD, &[]).unwrap();
        assert!(n.decisions[0].refs.is_empty());
        assert_eq!(
            stats,
            Stats {
                refs_total: 7,
                refs_invalid: 7,
                owners_cleared: 2
            }
        );
    }

    fn json_with(summary: &str, decisions: &str, actions: &str) -> String {
        format!(r#"{{"summary":"{summary}","decisions":[{decisions}],"action_items":[{actions}],"open_questions":[]}}"#)
    }

    #[test]
    fn parse_keeps_at_most_max_items_and_ignores_the_rest_in_stats() {
        let mut ds = vec![r#"{"text":"d","refs":[]}"#.to_string(); MAX_ITEMS];
        ds.push(r#"{"text":"d201","refs":[1,99]}"#.to_string());
        let mut acts = vec![r#"{"text":"a","owner":"","due":"","refs":[]}"#.to_string(); MAX_ITEMS];
        acts.push(r#"{"text":"a201","owner":"Zed","due":"","refs":[2,98]}"#.to_string());
        let (n, stats) = parse(&json_with("s", &ds.join(","), &acts.join(",")), &lines()).unwrap();
        assert_eq!((n.decisions.len(), n.action_items.len()), (MAX_ITEMS, MAX_ITEMS));
        assert_eq!(stats, Stats::default());
        // Mục rỗng/không hợp lệ bị bỏ trước khi đếm: 10 mục rỗng đứng đầu không chiếm chỗ.
        let mut ds = vec![r#"{"text":" ","refs":[]}"#.to_string(); 10];
        ds.extend(vec![r#"{"text":"d","refs":[1]}"#.to_string(); MAX_ITEMS + 1]);
        let (n, stats) = parse(&json_with("s", &ds.join(","), ""), &lines()).unwrap();
        assert_eq!(n.decisions.len(), MAX_ITEMS);
        assert_eq!(stats.refs_total, MAX_ITEMS as u32);
    }

    #[test]
    fn parse_clamps_text_owner_due_and_summary_by_chars() {
        let long = "ả".repeat(3000);
        let ls = vec![PromptLine {
            seq: 1,
            speaker: None,
            text: long.clone(),
            source: None,
        }];
        let item = format!(r#"{{"text":"{long}","owner":"{long}","due":"{long}","refs":[1]}}"#);
        let summary = "ế".repeat(MAX_SUMMARY_CHARS + 5);
        let (n, stats) = parse(&json_with(&summary, &item, &item), &ls).unwrap();
        assert_eq!(n.summary, "ế".repeat(MAX_SUMMARY_CHARS));
        assert_eq!(n.decisions[0].text, "ả".repeat(MAX_TEXT_CHARS));
        let a = &n.action_items[0];
        assert_eq!(a.text, "ả".repeat(MAX_TEXT_CHARS));
        // `owner` được đối chiếu ở dạng model đưa ra (khớp chữ của câu), rồi mới cắt.
        assert_eq!(a.owner, "ả".repeat(MAX_TEXT_CHARS));
        assert_eq!(a.due, "ả".repeat(MAX_TEXT_CHARS));
        assert_eq!(stats.owners_cleared, 0);
    }

    #[test]
    fn parse_output_of_oversized_input_passes_validate_edit_unchanged() {
        let long = "ả".repeat(3000);
        let ds = vec![format!(r#"{{"text":"{long}","refs":[1,2]}}"#); MAX_ITEMS + 3].join(",");
        let acts =
            vec![format!(r#"{{"text":"{long}","owner":"{long}","due":"{long}","refs":[1]}}"#); MAX_ITEMS + 3].join(",");
        let summary = "x".repeat(MAX_SUMMARY_CHARS + 5);
        let ls = lines();
        let (n, _) = parse(&json_with(&summary, &ds, &acts), &ls).unwrap();
        assert_eq!(validate_edit(n.clone(), ls.len()), Ok(n));
    }
}
