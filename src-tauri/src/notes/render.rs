//! Ghi chú thành chữ để sao chép và xuất file (Markdown, TXT). Chuỗi cố định (tiêu đề, tên khối, nhãn) lấy từ `i18n::Strings`
//! theo ngôn ngữ giao diện; nội dung ghi chú giữ nguyên chữ của model hay của người dùng.

use super::schema::{ActionItem, Item, Notes};
use crate::i18n::Strings;
use crate::transcript::export::escape_markdown;

/// Cách viết chữ của một định dạng: Markdown thoát ký tự có nghĩa, TXT giữ nguyên.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Style {
    Markdown,
    Txt,
}

impl Style {
    /// Chữ của một mục (một dòng): xuống dòng thành khoảng trắng để mỗi mục là một dòng.
    fn line(self, text: &str) -> String {
        match self {
            Style::Markdown => escape_markdown(text.trim()),
            Style::Txt => text.trim().replace(['\r', '\n'], " "),
        }
    }

    /// Chữ của phần tóm tắt: giữ các đoạn và dòng, chỉ thoát từng dòng (với Markdown).
    fn block(self, text: &str) -> String {
        let lines: Vec<String> = text
            .trim()
            .lines()
            .map(|l| match self {
                Style::Markdown => escape_markdown(l),
                Style::Txt => l.to_string(),
            })
            .collect();
        lines.join("\n")
    }
}

/// Ghi chú dạng Markdown: `# Tiêu đề`, rồi mỗi khối có nội dung là `## Tên khối`. Khối rỗng không in.
pub fn markdown(n: &Notes, s: &Strings) -> String {
    render(n, s, Style::Markdown)
}

/// Ghi chú dạng chữ thường: cùng bố cục, tiêu đề và tên khối là dòng chữ trơn.
pub fn txt(n: &Notes, s: &Strings) -> String {
    render(n, s, Style::Txt)
}

fn render(n: &Notes, s: &Strings, style: Style) -> String {
    let heading = |text: &str| match style {
        Style::Markdown => format!("## {text}\n\n"),
        Style::Txt => format!("{text}\n"),
    };
    let mut out = match style {
        Style::Markdown => format!("# {}\n", s.notes_title),
        Style::Txt => format!("{}\n", s.notes_title),
    };
    let summary = style.block(&n.summary);
    if !summary.is_empty() {
        out.push('\n');
        out.push_str(&heading(s.notes_summary));
        out.push_str(&summary);
        out.push('\n');
    }
    let decisions = items(&n.decisions, style);
    let actions = action_items(&n.action_items, s, style);
    let questions = items(&n.open_questions, style);
    for (title, body) in [
        (s.notes_decisions, decisions),
        (s.notes_actions, actions),
        (s.notes_questions, questions),
    ] {
        if !body.is_empty() {
            out.push('\n');
            out.push_str(&heading(title));
            out.push_str(&body);
        }
    }
    out
}

/// Danh sách gạch đầu dòng; mục chỉ có khoảng trắng bị bỏ.
fn items(list: &[Item], style: Style) -> String {
    list.iter()
        .map(|i| style.line(&i.text))
        .filter(|t| !t.is_empty())
        .map(|t| format!("- {t}\n"))
        .collect()
}

/// Việc cần làm: `- việc (Phụ trách: A; Hạn: B)`; chỉ có một trong hai thì ngoặc chỉ chứa phần đó, không có thì không ngoặc.
fn action_items(list: &[ActionItem], s: &Strings, style: Style) -> String {
    list.iter()
        .filter_map(|a| {
            let text = style.line(&a.text);
            if text.is_empty() {
                return None;
            }
            let owner = style.line(&a.owner);
            let due = style.line(&a.due);
            let mut parts = Vec::new();
            if !owner.is_empty() {
                parts.push(format!("{}: {owner}", s.notes_owner));
            }
            if !due.is_empty() {
                parts.push(format!("{}: {due}", s.notes_due));
            }
            Some(if parts.is_empty() {
                format!("- {text}\n")
            } else {
                format!("- {text} ({})\n", parts.join("; "))
            })
        })
        .collect()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::i18n::{EN, VI};
    use crate::notes::schema::{ActionItem, Item, Notes};

    fn sample() -> Notes {
        Notes {
            summary: "Tổng *kết*".into(),
            decisions: vec![Item {
                text: "Lùi hạn".into(),
                refs: vec![1],
            }],
            action_items: vec![
                ActionItem {
                    text: "Gửi báo cáo".into(),
                    owner: "Minh".into(),
                    due: "thứ Sáu".into(),
                    refs: vec![],
                },
                ActionItem {
                    text: "Đặt phòng".into(),
                    owner: "".into(),
                    due: "".into(),
                    refs: vec![],
                },
            ],
            open_questions: vec![],
            raw: false,
        }
    }

    #[test]
    fn markdown_and_txt() {
        let n = sample();
        assert_eq!(
            markdown(&n, &VI),
            "# Ghi chú cuộc họp\n\n## Tóm tắt\n\nTổng \\*kết\\*\n\n## Quyết định\n\n- Lùi hạn\n\n\
             ## Việc cần làm\n\n- Gửi báo cáo (Phụ trách: Minh; Hạn: thứ Sáu)\n- Đặt phòng\n"
        );
        assert_eq!(
            txt(&n, &VI),
            "Ghi chú cuộc họp\n\nTóm tắt\nTổng *kết*\n\nQuyết định\n- Lùi hạn\n\n\
             Việc cần làm\n- Gửi báo cáo (Phụ trách: Minh; Hạn: thứ Sáu)\n- Đặt phòng\n"
        );
        assert_eq!(markdown(&Notes::default(), &VI), "# Ghi chú cuộc họp\n");
        assert_eq!(txt(&Notes::default(), &VI), "Ghi chú cuộc họp\n");
    }

    #[test]
    fn owner_or_due_alone_fills_the_parentheses_with_only_that_part() {
        let item = |owner: &str, due: &str| Notes {
            action_items: vec![ActionItem {
                text: "Việc".into(),
                owner: owner.into(),
                due: due.into(),
                refs: vec![],
            }],
            ..Notes::default()
        };
        assert!(markdown(&item("Minh", ""), &VI).ends_with("- Việc (Phụ trách: Minh)\n"));
        assert!(markdown(&item("", "mai"), &VI).ends_with("- Việc (Hạn: mai)\n"));
        assert!(txt(&item("  ", " mai "), &VI).ends_with("- Việc (Hạn: mai)\n"));
        assert!(txt(&item("Minh", ""), &EN).ends_with("- Việc (Owner: Minh)\n"));
    }

    #[test]
    fn open_questions_use_the_language_of_the_interface() {
        let n = Notes {
            open_questions: vec![Item {
                text: "Ai duyệt?".into(),
                refs: vec![],
            }],
            ..Notes::default()
        };
        assert_eq!(
            markdown(&n, &EN),
            "# Meeting notes\n\n## Open questions\n\n- Ai duyệt?\n"
        );
        assert_eq!(txt(&n, &VI), "Ghi chú cuộc họp\n\nCâu hỏi còn mở\n- Ai duyệt?\n");
    }

    #[test]
    fn markdown_escapes_every_text_but_keeps_the_summary_paragraphs() {
        let n = Notes {
            summary: "Dòng *một*\n\nDòng [hai]\r\nba".into(),
            decisions: vec![Item {
                text: "Chọn `A` | B\nvà C".into(),
                refs: vec![],
            }],
            action_items: vec![ActionItem {
                text: "<b>x</b>".into(),
                owner: "Lan_1".into(),
                due: "#5".into(),
                refs: vec![],
            }],
            ..Notes::default()
        };
        let md = markdown(&n, &EN);
        assert!(md.contains("\n\nDòng \\*một\\*\n\nDòng \\[hai\\]\nba\n"), "{md}");
        assert!(md.contains("- Chọn \\`A\\` \\| B và C\n"), "{md}");
        assert!(md.contains("- \\<b\\>x\\</b\\> (Owner: Lan\\_1; Due: \\#5)\n"), "{md}");
        // TXT giữ chữ nguyên, chỉ gộp xuống dòng trong một mục để mỗi mục là một dòng.
        let t = txt(&n, &EN);
        assert!(t.contains("\nDòng *một*\n\nDòng [hai]\nba\n"), "{t}");
        assert!(t.contains("- Chọn `A` | B và C\n"), "{t}");
    }

    #[test]
    fn a_blank_summary_prints_no_heading() {
        let n = Notes {
            summary: " \n ".into(),
            ..Notes::default()
        };
        assert_eq!(markdown(&n, &VI), "# Ghi chú cuộc họp\n");
    }
}
