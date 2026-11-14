//! Dựng ghi chú từ các dòng của bản chép lời theo kiểu map-reduce (xem `run`). Cùng thuật toán với `run_job` của
//! `bench/2026-11-11-ghi-chu-cuoc-hop/run_notes.py`, là bản đã đo.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use super::chunk::{self, PromptLine};
use super::engine::{Format, Message, NotesEngine, NotesError, NotesRequest, Role, Strategy};
use super::prompt;
use super::schema::{self, ActionItem, Item, MAX_SUMMARY_CHARS, Notes};
use super::verify;
use crate::settings::NotesTemplate;

/// `max_tokens` của một lượt kiểm một việc (cấu hình `c16kx`): phán quyết chỉ vài chục token.
const VERIFY_MAX_TOKENS: u32 = 140;

/// Kết quả một lần dựng ghi chú.
#[derive(Clone, Debug, PartialEq)]
pub struct Outcome {
    pub notes: Notes,
    /// Số đoạn map.
    pub chunks: usize,
    /// Số đoạn map bị bỏ vì model không trả được JSON đúng hình (kể cả sau khi thử lại).
    pub failed_chunks: usize,
    /// Có nhóm reduce phải gộp cơ học vì model không trả được JSON đúng hình.
    pub reduce_fallback: bool,
    /// Số đếm của lượt kiểm việc cần làm (chỉ chiến lược `Verified`; `Standard` để mặc định).
    pub verify: VerifyStats,
}

/// Số đếm của lượt kiểm việc cần làm.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct VerifyStats {
    /// Số việc đã hỏi model.
    pub checked: usize,
    /// Số việc bị bỏ vì model nói không còn là việc cần làm.
    pub dropped: usize,
    /// Số việc được giữ mà `owner` hay `due` đổi so với bản map.
    pub edited: usize,
    /// Số việc giữ nguyên vì không đọc được phán quyết (kể cả sau khi thử lại).
    pub unparsed: usize,
    /// Số việc bị bỏ vì không có `refs`, không hỏi model.
    pub no_refs: usize,
}

/// Một việc cần làm đưa vào prompt kiểm: một dòng JSON, khóa đúng thứ tự mẫu đã đo, `n` luôn là 1 (lô một việc).
#[derive(Serialize)]
struct VerifyItem<'a> {
    n: u32,
    text: &'a str,
    owner: &'a str,
    due: &'a str,
    refs: &'a [u32],
}

/// Một lượt hỏi model (có thử lại một lần): ghi chú đọc được (nếu có) và chuỗi cuối cùng nhận được.
struct Asked {
    notes: Option<Notes>,
    raw: String,
}

fn check_cancel(cancel: &AtomicBool) -> Result<(), NotesError> {
    if cancel.load(Ordering::SeqCst) {
        Err(NotesError::Cancelled)
    } else {
        Ok(())
    }
}

/// Hỏi model một lần; câu trả lời không đọc được (`parse` trả `None`) thì hỏi lại đúng một lần với
/// `[user: prompt, assistant: chuỗi vừa nhận, user: FIX]`. Kiểm `cancel` trước mỗi lần gọi engine. Mọi `Err` của engine
/// trả nguyên. Trả kết quả đọc được (nếu có) và chuỗi cuối cùng nhận được.
fn ask_parsed<T>(
    engine: &dyn NotesEngine,
    cancel: &AtomicBool,
    prompt: String,
    max_tokens: u32,
    format: Format,
    parse: &dyn Fn(&str) -> Option<T>,
) -> Result<(Option<T>, String), NotesError> {
    check_cancel(cancel)?;
    let mut messages = vec![Message {
        role: Role::User,
        content: prompt,
    }];
    let raw = engine.generate(
        &NotesRequest {
            messages: messages.clone(),
            max_tokens,
            format,
        },
        cancel,
    )?;
    if let Some(parsed) = parse(&raw) {
        return Ok((Some(parsed), raw));
    }
    check_cancel(cancel)?;
    messages.push(Message {
        role: Role::Assistant,
        content: raw,
    });
    messages.push(Message {
        role: Role::User,
        content: prompt::FIX.to_string(),
    });
    let raw = engine.generate(
        &NotesRequest {
            messages,
            max_tokens,
            format,
        },
        cancel,
    )?;
    Ok((parse(&raw), raw))
}

/// Hỏi model lấy ghi chú đủ bốn phần (`Format::Notes`), có thử lại một lần.
fn ask(
    engine: &dyn NotesEngine,
    cancel: &AtomicBool,
    lines: &[PromptLine],
    prompt: String,
    max_tokens: u32,
) -> Result<Asked, NotesError> {
    let (notes, raw) = ask_parsed(engine, cancel, prompt, max_tokens, Format::Notes, &|raw| {
        schema::parse(raw, lines).map(|(n, _)| n)
    })?;
    Ok(Asked { notes, raw })
}

/// Dạng JSON của model (khóa `snake_case`, thứ tự như mẫu prompt, không có `raw`).
#[derive(Serialize)]
struct Wire<'a> {
    summary: &'a str,
    decisions: &'a [Item],
    action_items: &'a [ActionItem],
    open_questions: &'a [Item],
}

/// Một bản thành phần thành một dòng JSON gọn cho prompt reduce.
fn json_line(n: &Notes) -> String {
    serde_json::to_string(&Wire {
        summary: &n.summary,
        decisions: &n.decisions,
        action_items: &n.action_items,
        open_questions: &n.open_questions,
    })
    .unwrap_or_default()
}

/// Gộp cơ học: `summary` nối bằng `\n`, ba mảng nối theo thứ tự. Kết quả đi qua `schema::parse` (trên toàn bộ
/// `lines`) để giới hạn và `refs` được chuẩn hóa như mọi ghi chú khác; không đọc được thì giữ phần tóm tắt dạng thô.
fn merge_mechanically(group: &[Notes], lines: &[PromptLine]) -> Notes {
    let mut merged = Notes {
        summary: group.iter().map(|n| n.summary.as_str()).collect::<Vec<_>>().join("\n"),
        ..Notes::default()
    };
    for n in group {
        merged.decisions.extend(n.decisions.iter().cloned());
        merged.action_items.extend(n.action_items.iter().cloned());
        merged.open_questions.extend(n.open_questions.iter().cloned());
    }
    normalized(merged, lines)
}

/// Đưa ghi chú đã gộp qua `schema::parse` (trên toàn bộ `lines`) để giới hạn và `refs` được chuẩn hóa; không đọc được thì
/// giữ phần tóm tắt dạng thô.
fn normalized(merged: Notes, lines: &[PromptLine]) -> Notes {
    match schema::parse(&json_line(&merged), lines) {
        Some((notes, _)) => notes,
        None => raw_notes(merged.summary),
    }
}

/// Ghi chú thô: chữ của model nằm hết trong `summary` (cắt theo giới hạn của `summary`).
fn raw_notes(text: String) -> Notes {
    Notes {
        summary: text.chars().take(MAX_SUMMARY_CHARS).collect(),
        raw: true,
        ..Notes::default()
    }
}

/// Dựng ghi chú: chia `lines` thành đoạn vừa `limits().budget`, map từng đoạn, rồi gộp theo tầng tới khi còn một bản.
///
/// - Kiểm `cancel` trước mỗi lần gọi engine; mọi lỗi của engine dừng cả việc và trả nguyên lỗi đó.
/// - Đoạn map vẫn sai sau khi thử lại: bỏ đoạn (`failed_chunks`); nếu không còn bản nào thì ghi chú thô.
/// - Nhóm reduce vẫn sai sau khi thử lại: gộp cơ học và đặt `reduce_fallback`.
/// - `progress(done, total)`: `total` là số đoạn, cộng 1 khi có nhiều hơn một đoạn (giai đoạn reduce); gọi sau mỗi
///   đoạn và sau mỗi nhóm reduce xong, `done` không vượt `total`.
pub fn run(
    lines: &[PromptLine],
    target_lang: &str,
    template: NotesTemplate,
    engine: &dyn NotesEngine,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(usize, usize),
) -> Result<Outcome, NotesError> {
    let limits = engine.limits();
    let count = |s: &str| engine.count_tokens(s);
    let chunks = chunk::chunk(lines, limits.budget, &count);
    let mut out = Outcome {
        notes: Notes::default(),
        chunks: chunks.len(),
        failed_chunks: 0,
        reduce_fallback: false,
        verify: VerifyStats::default(),
    };
    if chunks.is_empty() {
        return Ok(out);
    }
    if engine.strategy() == Strategy::Verified {
        return run_verified(lines, target_lang, template, engine, cancel, progress, &chunks, out);
    }
    let total = if chunks.len() > 1 {
        chunks.len().saturating_add(1)
    } else {
        1
    };
    let mut done = 0usize;
    let mut tick = |done: &mut usize| {
        *done = done.saturating_add(1);
        progress((*done).min(total), total);
    };

    let mut parts: Vec<Notes> = Vec::new();
    let mut last_raw = String::new();
    for c in &chunks {
        let p = prompt::map(template, target_lang, &chunk::render(c));
        let asked = ask(engine, cancel, lines, p, limits.max_map)?;
        match asked.notes {
            Some(n) => parts.push(n),
            None => out.failed_chunks = out.failed_chunks.saturating_add(1),
        }
        last_raw = asked.raw;
        tick(&mut done);
    }
    if parts.is_empty() {
        out.notes = raw_notes(last_raw);
        return Ok(out);
    }

    while parts.len() > 1 {
        let texts: Vec<String> = parts.iter().map(json_line).collect();
        let mut next: Vec<Notes> = Vec::new();
        let mut i = 0usize;
        while i < parts.len() {
            // Nhóm tham lam các bản liền nhau, tối thiểu hai bản (để mỗi tầng luôn rút gọn được).
            let mut end = i.saturating_add(2).min(parts.len());
            if end.saturating_sub(i) < 2 {
                // Một bản lẻ cuối tầng đi thẳng lên tầng sau.
                next.extend(parts.get(i..).unwrap_or_default().iter().cloned());
                break;
            }
            let mut joined = texts.get(i..end).unwrap_or_default().join("\n");
            while let Some(more) = texts.get(end) {
                let candidate = format!("{joined}\n{more}");
                if engine.count_tokens(&candidate) > limits.budget {
                    break;
                }
                joined = candidate;
                end = end.saturating_add(1);
            }
            let group = parts.get(i..end).unwrap_or_default();
            i = end;
            let asked = ask(
                engine,
                cancel,
                lines,
                prompt::reduce(target_lang, &joined),
                limits.max_reduce,
            )?;
            let merged = match asked.notes {
                Some(n) => n,
                None => {
                    out.reduce_fallback = true;
                    merge_mechanically(group, lines)
                }
            };
            next.push(merged);
            tick(&mut done);
        }
        parts = next;
    }
    out.notes = parts.into_iter().next().unwrap_or_default();
    Ok(out)
}

/// Chiến lược `Verified` (model local, cấu hình `c16kx` của bench): map chặt từng đoạn, gộp cơ học các bản, một lượt chỉ để
/// viết tóm tắt chung, rồi kiểm từng việc cần làm với các câu quanh `refs` của nó.
///
/// - Việc không có `refs` bị bỏ, không hỏi model. Phán quyết không đọc được thì giữ việc. `text` của việc không bao giờ đổi.
/// - `owner` mới chỉ nhận khi có thật trong cuộc họp; `due` mới có chữ CJK trong ghi chú không viết bằng zh/ja/ko thì giữ
///   `due` cũ.
/// - `progress`: `total` là số đoạn, cộng 1 nếu có lượt tóm tắt, cộng số việc có `refs` (tính lại sau khi gộp xong).
#[allow(clippy::too_many_arguments)]
fn run_verified(
    lines: &[PromptLine],
    target_lang: &str,
    template: NotesTemplate,
    engine: &dyn NotesEngine,
    cancel: &AtomicBool,
    progress: &mut dyn FnMut(usize, usize),
    chunks: &[Vec<PromptLine>],
    mut out: Outcome,
) -> Result<Outcome, NotesError> {
    let limits = engine.limits();
    let mut total = chunks.len().saturating_add(usize::from(chunks.len() > 1));
    let mut done = 0usize;
    let mut tick = |done: &mut usize, total: usize| {
        *done = done.saturating_add(1);
        progress((*done).min(total), total);
    };

    let mut parts: Vec<Notes> = Vec::new();
    let mut last_raw = String::new();
    for c in chunks {
        let p = prompt::map_strict(template, target_lang, &chunk::render(c));
        let asked = ask(engine, cancel, lines, p, limits.max_map)?;
        match asked.notes {
            Some(n) => parts.push(n),
            None => out.failed_chunks = out.failed_chunks.saturating_add(1),
        }
        last_raw = asked.raw;
        tick(&mut done, total);
    }
    if parts.is_empty() {
        out.notes = raw_notes(last_raw);
        return Ok(out);
    }

    // Gộp: một bản dùng luôn; nhiều bản thì gộp cơ học rồi để model chỉ viết lại phần tóm tắt.
    let summarize = parts.len() > 1;
    let mut notes = if summarize {
        normalized(verify::merge_items(&parts), lines)
    } else {
        parts.swap_remove(0)
    };
    if notes.raw {
        out.notes = notes;
        return Ok(out);
    }
    let with_refs = notes.action_items.iter().filter(|a| !a.refs.is_empty()).count();
    total = chunks
        .len()
        .saturating_add(usize::from(summarize))
        .saturating_add(with_refs);
    if summarize {
        let summaries: Vec<String> = parts
            .iter()
            .map(|n| serde_json::to_string(&n.summary).unwrap_or_default())
            .collect();
        let (summary, _) = ask_parsed(
            engine,
            cancel,
            prompt::reduce_summary(target_lang, &summaries.join("\n")),
            limits.max_reduce,
            Format::Summary,
            &verify::parse_summary,
        )?;
        match summary {
            Some(s) => notes.summary = s.chars().take(MAX_SUMMARY_CHARS).collect(),
            None => out.reduce_fallback = true,
        }
        tick(&mut done, total);
    }

    // Kiểm từng việc cần làm.
    let cjk_target = matches!(target_lang, "zh" | "ja" | "ko");
    let mut kept: Vec<ActionItem> = Vec::new();
    for item in std::mem::take(&mut notes.action_items) {
        if item.refs.is_empty() {
            out.verify.no_refs = out.verify.no_refs.saturating_add(1);
            continue;
        }
        out.verify.checked = out.verify.checked.saturating_add(1);
        let item_json = serde_json::to_string(&VerifyItem {
            n: 1,
            text: &item.text,
            owner: &item.owner,
            due: &item.due,
            refs: &item.refs,
        })
        .unwrap_or_default();
        let ask_text = prompt::verify(target_lang, &chunk::render_verify(lines, &item.refs, 1), &item_json);
        let (verdict, _) = ask_parsed(
            engine,
            cancel,
            ask_text,
            VERIFY_MAX_TOKENS,
            Format::Verdict,
            &verify::parse_verdict,
        )?;
        tick(&mut done, total);
        match verdict {
            None => {
                out.verify.unparsed = out.verify.unparsed.saturating_add(1);
                kept.push(item);
            }
            Some(v) if !v.keep => out.verify.dropped = out.verify.dropped.saturating_add(1),
            Some(v) => {
                let owner = if verify::owner_known(&v.owner, lines) {
                    v.owner.trim().to_string()
                } else {
                    String::new()
                };
                let due = if !cjk_target && verify::has_cjk(&v.due) {
                    item.due.clone()
                } else {
                    v.due.trim().to_string()
                };
                if owner != item.owner || due != item.due {
                    out.verify.edited = out.verify.edited.saturating_add(1);
                }
                kept.push(ActionItem { owner, due, ..item });
            }
        }
    }
    notes.action_items = kept;
    out.notes = notes;
    Ok(out)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use std::cell::RefCell;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;
    use crate::notes::chunk::PromptLine;
    use crate::notes::engine::{Format, Limits, NotesEngine, NotesError, NotesRequest, Role, Strategy};
    use crate::notes::schema::Notes;
    use crate::settings::NotesTemplate;

    fn count(s: &str) -> usize {
        s.split_whitespace().count() // "[1] w w w w" = 5
    }
    fn pl(seq: u32, n: usize) -> PromptLine {
        PromptLine {
            seq,
            speaker: None,
            text: vec!["w"; n].join(" "),
            source: None,
        }
    }

    /// Engine giả: trả lần lượt các câu trả lời trong hàng đợi và ghi lại mọi yêu cầu.
    struct Scripted {
        budget: usize,
        replies: RefCell<VecDeque<Result<String, NotesError>>>,
        seen: RefCell<Vec<NotesRequest>>,
        strategy: Strategy,
        /// Bật cờ hủy ngay trong lần gọi `generate` thứ n (đếm từ 1).
        cancel_on_call: Option<usize>,
    }
    impl NotesEngine for Scripted {
        fn limits(&self) -> Limits {
            Limits {
                budget: self.budget,
                max_map: 800,
                max_reduce: 1500,
            }
        }
        fn count_tokens(&self, text: &str) -> usize {
            count(text)
        }
        fn strategy(&self) -> Strategy {
            self.strategy
        }
        fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError> {
            self.seen.borrow_mut().push(req.clone());
            if self.cancel_on_call == Some(self.seen.borrow().len()) {
                cancel.store(true, Ordering::SeqCst);
            }
            self.replies
                .borrow_mut()
                .pop_front()
                .unwrap_or(Err(NotesError::BadResponse))
        }
    }
    // `NotesEngine: Send` nhưng `RefCell` thì không `Sync`; chỉ cần `Send`, mà `RefCell<T: Send>` là `Send`.

    const OK1: &str =
        r#"{"summary":"s1","decisions":[{"text":"d1","refs":[1]}],"action_items":[],"open_questions":[]}"#;
    const OK2: &str =
        r#"{"summary":"s2","decisions":[{"text":"d2","refs":[3]}],"action_items":[],"open_questions":[]}"#;
    const ALL: &str =
        r#"{"summary":"all","decisions":[{"text":"d","refs":[1,3]}],"action_items":[],"open_questions":[]}"#;

    fn go_budget(
        budget: usize,
        lines: &[PromptLine],
        replies: &[Result<&str, NotesError>],
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(usize, usize),
    ) -> (Result<Outcome, NotesError>, Vec<NotesRequest>) {
        let engine = Scripted {
            budget,
            replies: RefCell::new(replies.iter().map(|r| r.clone().map(str::to_string)).collect()),
            seen: RefCell::new(Vec::new()),
            strategy: Strategy::Standard,
            cancel_on_call: None,
        };
        let r = run(lines, "vi", NotesTemplate::Meeting, &engine, cancel, progress);
        (r, engine.seen.into_inner())
    }

    /// Chạy chiến lược `Verified` với ngôn ngữ đích `lang`; `cancel_on_call` bật cờ hủy trong lần gọi engine thứ n.
    fn go_verified(
        lang: &str,
        budget: usize,
        lines: &[PromptLine],
        replies: &[Result<&str, NotesError>],
        cancel_on_call: Option<usize>,
        progress: &mut dyn FnMut(usize, usize),
    ) -> (Result<Outcome, NotesError>, Vec<NotesRequest>) {
        let engine = Scripted {
            budget,
            replies: RefCell::new(replies.iter().map(|r| r.clone().map(str::to_string)).collect()),
            seen: RefCell::new(Vec::new()),
            strategy: Strategy::Verified,
            cancel_on_call,
        };
        let r = run(
            lines,
            lang,
            NotesTemplate::Meeting,
            &engine,
            &AtomicBool::new(false),
            progress,
        );
        (r, engine.seen.into_inner())
    }
    fn go_with(
        lines: &[PromptLine],
        replies: &[Result<&str, NotesError>],
        cancel: &AtomicBool,
        progress: &mut dyn FnMut(usize, usize),
    ) -> (Result<Outcome, NotesError>, Vec<NotesRequest>) {
        go_budget(10, lines, replies, cancel, progress)
    }
    fn go(
        lines: &[PromptLine],
        replies: &[Result<&str, NotesError>],
    ) -> (Result<Outcome, NotesError>, Vec<NotesRequest>) {
        go_with(lines, replies, &AtomicBool::new(false), &mut |_, _| {})
    }

    #[test]
    fn single_chunk() {
        let (r, seen) = go(&[pl(1, 4)], &[Ok(OK1)]);
        let r = r.unwrap();
        assert_eq!(
            (r.notes.summary.as_str(), r.chunks, seen.len(), seen[0].max_tokens),
            ("s1", 1, 1, 800)
        );
        assert!(seen[0].messages[0].content.contains("Write the notes in Vietnamese"));
    }

    #[test]
    fn retry_then_raw_text_in_summary() {
        let (r, seen) = go(&[pl(1, 4)], &[Ok("oops"), Ok("still bad")]);
        let n = r.unwrap().notes;
        assert_eq!((n.summary.as_str(), n.raw, n.decisions.len()), ("still bad", true, 0));
        assert_eq!(seen[1].messages.len(), 3); // user, assistant ("oops"), user (FIX)
        assert_eq!(seen[1].messages[1].content, "oops");
        assert_eq!(seen[1].messages[1].role, Role::Assistant);
        assert_eq!(seen[1].messages[2].content, crate::notes::prompt::FIX);
    }

    #[test]
    fn map_reduce_keeps_refs() {
        let (r, seen) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok(OK1), Ok(OK2), Ok(ALL)]);
        let r = r.unwrap();
        assert_eq!(
            (
                r.chunks,
                seen.len(),
                r.notes.decisions[0].refs.clone(),
                seen[2].max_tokens
            ),
            (2, 3, vec![1, 3], 1500)
        );
    }

    #[test]
    fn reduce_fails_merges_mechanically() {
        let (r, seen) = go(
            &[pl(1, 4), pl(2, 4), pl(3, 4)],
            &[Ok(OK1), Ok(OK2), Ok("bad"), Ok("bad")],
        );
        let r = r.unwrap();
        assert_eq!(seen.len(), 4); // 2 map + reduce và một lần thử lại; không gọi thừa
        assert!(r.reduce_fallback);
        assert_eq!((r.notes.summary.as_str(), r.notes.decisions.len()), ("s1\ns2", 2));
    }

    #[test]
    fn failed_chunk_is_skipped() {
        let (r, seen) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok("bad"), Ok("bad"), Ok(OK2)]);
        let r = r.unwrap();
        assert_eq!((r.failed_chunks, r.notes.summary.as_str(), seen.len()), (1, "s2", 3));
    }

    #[test]
    fn engine_errors_and_cancel_stop_the_job() {
        let three = [pl(1, 4), pl(2, 4), pl(3, 4)];
        assert_eq!(
            go(&three, &[Ok(OK1), Err(NotesError::Offline)]).0.unwrap_err(),
            NotesError::Offline
        );
        // cờ hủy bật sẵn: Err(Cancelled), không gọi engine lần nào
        let cancel = AtomicBool::new(true);
        let (r, seen) = go_with(&three, &[Ok(OK1)], &cancel, &mut |_, _| {});
        assert_eq!(r.unwrap_err(), NotesError::Cancelled);
        assert_eq!(seen.len(), 0);
    }

    #[test]
    fn empty_transcript_calls_nothing() {
        let mut calls = 0;
        let (r, seen) = go_with(&[], &[], &AtomicBool::new(false), &mut |_, _| calls += 1);
        let r = r.unwrap();
        assert_eq!(
            (r.notes, r.chunks, r.failed_chunks, r.reduce_fallback),
            (Notes::default(), 0, 0, false)
        );
        assert_eq!((seen.len(), calls), (0, 0));
    }

    #[test]
    fn progress_counts_chunks_plus_reduce() {
        let mut got = Vec::new();
        let (r, _) = go_with(
            &[pl(1, 4), pl(2, 4), pl(3, 4)],
            &[Ok(OK1), Ok(OK2), Ok(ALL)],
            &AtomicBool::new(false),
            &mut |d, t| got.push((d, t)),
        );
        r.unwrap();
        assert_eq!(got, [(1, 3), (2, 3), (3, 3)]);
    }

    #[test]
    fn cancel_flag_set_midway_stops_before_next_call() {
        let cancel = AtomicBool::new(false);
        let (r, seen) = go_with(
            &[pl(1, 4), pl(2, 4), pl(3, 4)],
            &[Ok(OK1), Ok(OK2), Ok(ALL)],
            &cancel,
            &mut |done, _| {
                if done == 1 {
                    cancel.store(true, Ordering::SeqCst);
                }
            },
        );
        assert_eq!(r.unwrap_err(), NotesError::Cancelled);
        assert_eq!(seen.len(), 1);
    }

    #[test]
    fn all_chunks_failing_gives_raw_text() {
        let (r, _) = go(
            &[pl(1, 4), pl(2, 4), pl(3, 4)],
            &[Ok("a"), Ok("b"), Ok("c"), Ok("last")],
        );
        let r = r.unwrap();
        assert_eq!(
            (r.notes.summary.as_str(), r.notes.raw, r.failed_chunks, r.chunks),
            ("last", true, 2, 2)
        );
    }

    /// Một bản ghi chú đủ ba loại mục, đúng dạng dòng JSON gọn mà `job` đưa vào prompt reduce (khóa của model, thứ tự
    /// summary/decisions/action_items/open_questions, không có `raw`); `refs` đưa vào phải tăng dần, không trùng.
    fn part(tag: &str, refs: &[u32]) -> String {
        let r = format!("{refs:?}").replace(' ', "");
        format!(
            r#"{{"summary":"{tag}","decisions":[{{"text":"d{tag}","refs":{r}}}],"action_items":[{{"text":"a{tag}","owner":"","due":"","refs":{r}}}],"open_questions":[{{"text":"q{tag}","refs":{r}}}]}}"#
        )
    }
    /// Phần chữ của prompt reduce cho các dòng JSON đưa vào.
    fn parts_block(parts: &[&str]) -> String {
        format!("Parts:\n{}\n", parts.join("\n"))
    }

    #[test]
    fn three_partials_share_one_reduce_group_with_compact_model_json() {
        // budget 5: mỗi dòng "[n] w w w w" (5 từ) đứng một đoạn; mỗi bản thành phần là 1 "từ" (JSON gọn không có khoảng
        // trắng) nên ba bản (3 <= 5) vào chung một nhóm reduce.
        let lines = [pl(1, 4), pl(2, 4), pl(3, 4)];
        let (p1, p2, p3) = (part("s1", &[1]), part("s2", &[2]), part("s3", &[3]));
        let fin = part("all", &[1, 2, 3]);
        let (r, seen) = go_budget(
            5,
            &lines,
            &[Ok(&p1), Ok(&p2), Ok(&p3), Ok(&fin)],
            &AtomicBool::new(false),
            &mut |_, _| {},
        );
        let r = r.unwrap();
        assert_eq!(
            (r.chunks, seen.len(), r.failed_chunks, r.reduce_fallback),
            (3, 4, 0, false)
        );
        let reduce = &seen[3];
        assert_eq!(reduce.max_tokens, 1500);
        assert_eq!(reduce.messages.len(), 1);
        let content = &reduce.messages[0].content;
        assert!(content.ends_with(&parts_block(&[&p1, &p2, &p3])), "{content}");
        // đúng khóa model, không `raw`, không camelCase
        assert!(content.contains("\"action_items\"") && content.contains("\"open_questions\""));
        assert!(!content.contains("\"raw\"") && !content.contains("actionItems") && !content.contains("openQuestions"));
        let block = content.rsplit("Parts:\n").next().unwrap();
        assert_eq!((block.lines().count(), block.matches("\"summary\"").count()), (3, 3)); // một dòng mỗi bản
        assert_eq!(
            (r.notes.summary.as_str(), r.notes.decisions[0].refs.clone()),
            ("all", vec![1, 2, 3])
        );
    }

    #[test]
    fn tiered_reduce_carries_the_lone_partial_up_and_runs_extra_levels() {
        // budget 2: mỗi dòng (5 từ) vẫn đứng một đoạn riêng -> 5 đoạn; ba bản thành phần (3 từ) vượt 2 nên nhóm chỉ có 2.
        // Tầng 1: [P1 P2] [P3 P4], P5 lẻ đi lên. Tầng 2: [R12 R34], P5 lẻ đi lên. Tầng 3: [R1234 P5].
        let lines = [pl(1, 4), pl(2, 4), pl(3, 4), pl(4, 4), pl(5, 4)];
        let p: Vec<String> = (1..=5u32).map(|n| part(&format!("s{n}"), &[n])).collect();
        let (r12, r34) = (part("r12", &[1, 2]), part("r34", &[3, 4]));
        let r1234 = part("r1234", &[1, 2, 3, 4]);
        let fin = part("final", &[1, 2, 3, 4, 5, 99]); // 99 không phải số câu: phải bị bỏ
        let replies: Vec<Result<&str, NotesError>> = p
            .iter()
            .map(|s| Ok(s.as_str()))
            .chain([Ok(r12.as_str()), Ok(r34.as_str()), Ok(r1234.as_str()), Ok(fin.as_str())])
            .collect();
        let mut progress = Vec::new();
        let (r, seen) = go_budget(2, &lines, &replies, &AtomicBool::new(false), &mut |d, t| {
            progress.push((d, t))
        });
        let r = r.unwrap();
        assert_eq!((r.chunks, r.failed_chunks, r.reduce_fallback), (5, 0, false));
        assert_eq!(seen.len(), 9); // 5 map + 4 reduce
        assert!(seen[..5].iter().all(|q| q.max_tokens == 800));
        assert!(seen[5..].iter().all(|q| q.max_tokens == 1500));
        let content = |k: usize| seen[k].messages[0].content.clone();
        assert!(content(5).ends_with(&parts_block(&[&p[0], &p[1]])));
        assert!(content(6).ends_with(&parts_block(&[&p[2], &p[3]])));
        assert!(content(7).ends_with(&parts_block(&[&r12, &r34])));
        assert!(!content(7).contains(p[4].as_str())); // P5 chưa vào nhóm ở tầng 2: được mang lên
        assert!(content(8).ends_with(&parts_block(&[&r1234, &p[4]]))); // P5 không bị mất
        assert_eq!(
            (r.notes.summary.as_str(), r.notes.decisions[0].refs.clone(), r.notes.raw),
            ("final", vec![1, 2, 3, 4, 5], false)
        );
        // 5 đoạn + 1 giai đoạn reduce; `done` không vượt `total`
        assert_eq!(progress.len(), 9);
        assert!(progress.iter().all(|&(d, t)| t == 6 && d <= t));
        assert_eq!(progress.last(), Some(&(6, 6)));
    }

    // ---- Chiến lược `Verified` (model local) ----

    fn ln(seq: u32, who: Option<&str>, text: &str, source: Option<&str>) -> PromptLine {
        PromptLine {
            seq,
            speaker: who.map(str::to_string),
            text: text.into(),
            source: source.map(str::to_string),
        }
    }
    /// Một bản map có đúng các việc cần làm cho trước: mỗi việc là `(text, due, refs)`.
    fn map_with(actions: &[(&str, &str, &[u32])]) -> String {
        let items: Vec<String> = actions
            .iter()
            .map(|(text, due, refs)| {
                let r = format!("{refs:?}").replace(' ', "");
                format!(r#"{{"text":"{text}","owner":"","due":"{due}","refs":{r}}}"#)
            })
            .collect();
        format!(
            r#"{{"summary":"s","decisions":[],"action_items":[{}],"open_questions":[]}}"#,
            items.join(",")
        )
    }
    const KEEP_MINH: &str = r#"{"items":[{"n":1,"keep":true,"owner":"Minh","due":"thứ Sáu"}]}"#;
    const DROP: &str = r#"{"items":[{"n":1,"keep":false,"owner":"","due":""}]}"#;
    const KEEP_PLAIN: &str = r#"{"items":[{"n":1,"keep":true,"owner":"","due":""}]}"#;

    fn four_lines() -> Vec<PromptLine> {
        vec![
            ln(1, Some("Minh"), "Tôi gửi báo cáo", Some("I'll send the report")),
            ln(2, Some("Lan"), "Đặt phòng giúp tôi", None),
            ln(3, None, "Được", None),
            ln(4, None, "UNIQUE4", None),
        ]
    }

    #[test]
    fn verified_single_chunk_checks_each_action_item() {
        let map = map_with(&[("gửi báo cáo", "", &[1]), ("đặt phòng", "", &[2])]);
        let (r, seen) = go_verified(
            "vi",
            1000,
            &four_lines(),
            &[Ok(&map), Ok(KEEP_MINH), Ok(DROP)],
            None,
            &mut |_, _| {},
        );
        let r = r.unwrap();
        assert_eq!(r.notes.action_items.len(), 1);
        assert_eq!(
            (
                r.notes.action_items[0].owner.as_str(),
                r.notes.action_items[0].due.as_str()
            ),
            ("Minh", "thứ Sáu")
        );
        assert_eq!(r.notes.action_items[0].text, "gửi báo cáo");
        assert_eq!(
            r.verify,
            VerifyStats {
                checked: 2,
                dropped: 1,
                edited: 1,
                unparsed: 0,
                no_refs: 0
            }
        );
        assert_eq!(
            seen.iter().map(|q| q.format).collect::<Vec<_>>(),
            [Format::Notes, Format::Verdict, Format::Verdict]
        );
        assert_eq!(seen[1].max_tokens, 140);
        let ask = &seen[1].messages[0].content;
        assert!(ask.contains("[1] ") && !ask.contains("UNIQUE4"), "{ask}");
    }

    #[test]
    fn verified_keeps_an_item_when_the_verdict_is_unreadable() {
        let map = map_with(&[("gửi báo cáo", "", &[1])]);
        let (r, seen) = go_verified(
            "vi",
            1000,
            &four_lines(),
            &[Ok(&map), Ok("rác"), Ok("rác")],
            None,
            &mut |_, _| {},
        );
        let r = r.unwrap();
        assert_eq!(r.notes.action_items.len(), 1);
        assert_eq!((r.verify.unparsed, r.verify.checked, r.verify.dropped), (1, 1, 0));
        assert_eq!(seen.len(), 3);
    }

    #[test]
    fn verified_drops_items_without_refs_without_asking() {
        let map = map_with(&[("việc mồ côi", "", &[])]);
        let (r, seen) = go_verified("vi", 1000, &four_lines(), &[Ok(&map)], None, &mut |_, _| {});
        let r = r.unwrap();
        assert!(r.notes.action_items.is_empty());
        assert_eq!((r.verify.no_refs, r.verify.checked), (1, 0));
        assert_eq!(seen.len(), 1);
    }

    #[test]
    fn verified_clears_an_unknown_owner_and_ignores_a_cjk_due_for_vi() {
        let map = map_with(&[("gửi báo cáo", "thứ 6", &[1])]);
        let ghost = r#"{"items":[{"n":1,"keep":true,"owner":"Ghost","due":"金曜日"}]}"#;
        let (r, _) = go_verified("vi", 1000, &four_lines(), &[Ok(&map), Ok(ghost)], None, &mut |_, _| {});
        let item = &r.unwrap().notes.action_items[0];
        assert_eq!((item.owner.as_str(), item.due.as_str()), ("", "thứ 6"));
        let (r, _) = go_verified("ja", 1000, &four_lines(), &[Ok(&map), Ok(ghost)], None, &mut |_, _| {});
        let item = &r.unwrap().notes.action_items[0];
        assert_eq!((item.owner.as_str(), item.due.as_str()), ("", "金曜日"));
    }

    #[test]
    fn verified_many_chunks_merges_mechanically_and_only_writes_a_summary() {
        let p1 = r#"{"summary":"s1","decisions":[{"text":"d","refs":[1]}],"action_items":[],"open_questions":[]}"#;
        let p2 = r#"{"summary":"s2","decisions":[{"text":" D ","refs":[2]}],"action_items":[],"open_questions":[]}"#;
        let (r, seen) = go_verified(
            "vi",
            5,
            &[pl(1, 4), pl(2, 4)],
            &[Ok(p1), Ok(p2), Ok("bad"), Ok("bad")],
            None,
            &mut |_, _| {},
        );
        let r = r.unwrap();
        assert_eq!(r.notes.decisions.len(), 1);
        assert_eq!(r.notes.decisions[0].refs, vec![1, 2]);
        assert!(r.reduce_fallback);
        assert_eq!(r.notes.summary, "s1\ns2");
        assert_eq!(
            seen.iter().map(|q| q.format).collect::<Vec<_>>(),
            [Format::Notes, Format::Notes, Format::Summary, Format::Summary]
        );
        assert_eq!(seen[2].max_tokens, 1500);
        // lượt tóm tắt chỉ nhận chuỗi tóm tắt của từng bản, mỗi bản một dòng
        assert!(
            seen[2].messages[0].content.ends_with("Parts:\n\"s1\"\n\"s2\""),
            "{}",
            seen[2].messages[0].content
        );
    }

    #[test]
    fn verified_uses_the_model_summary_when_it_is_readable() {
        let p1 = r#"{"summary":"s1","decisions":[],"action_items":[],"open_questions":[]}"#;
        let p2 = r#"{"summary":"s2","decisions":[],"action_items":[],"open_questions":[]}"#;
        let (r, _) = go_verified(
            "vi",
            5,
            &[pl(1, 4), pl(2, 4)],
            &[Ok(p1), Ok(p2), Ok(r#"{"summary": " Tóm tắt chung. "}"#)],
            None,
            &mut |_, _| {},
        );
        let r = r.unwrap();
        assert_eq!((r.notes.summary.as_str(), r.reduce_fallback), ("Tóm tắt chung.", false));
    }

    #[test]
    fn verified_progress_counts_chunks_summary_and_items() {
        let a = map_with(&[("việc A", "", &[1]), ("việc B", "", &[1])]);
        let b = map_with(&[("việc C", "", &[2])]);
        let mut got: Vec<(usize, usize)> = Vec::new();
        let (r, _) = go_verified(
            "vi",
            5,
            &[pl(1, 4), pl(2, 4)],
            &[
                Ok(&a),
                Ok(&b),
                Ok(r#"{"summary":"chung"}"#),
                Ok(KEEP_PLAIN),
                Ok(KEEP_PLAIN),
                Ok(KEEP_PLAIN),
            ],
            None,
            &mut |d, t| got.push((d, t)),
        );
        r.unwrap();
        assert_eq!(got.last(), Some(&(6, 6)), "{got:?}");
        assert!(got.windows(2).all(|w| w[0].0 <= w[1].0), "done không giảm: {got:?}");
        assert!(got.iter().all(|&(d, t)| d <= t), "done không vượt total: {got:?}");
    }

    #[test]
    fn verified_stops_on_cancel_between_items() {
        let map = map_with(&[("việc A", "", &[1]), ("việc B", "", &[2])]);
        let (r, seen) = go_verified(
            "vi",
            1000,
            &four_lines(),
            &[Ok(&map), Ok(KEEP_PLAIN), Ok(KEEP_PLAIN)],
            Some(2),
            &mut |_, _| {},
        );
        assert_eq!(r.unwrap_err(), NotesError::Cancelled);
        assert_eq!(seen.len(), 2);
    }

    #[test]
    fn verified_engine_errors_stop_the_job() {
        let map = map_with(&[("việc A", "", &[1])]);
        let (r, _) = go_verified(
            "vi",
            1000,
            &four_lines(),
            &[Ok(&map), Err(NotesError::Engine("hỏng".into()))],
            None,
            &mut |_, _| {},
        );
        assert_eq!(r.unwrap_err(), NotesError::Engine("hỏng".into()));
    }

    #[test]
    fn standard_strategy_is_unchanged() {
        let (r, seen) = go(&[pl(1, 4), pl(2, 4), pl(3, 4)], &[Ok(OK1), Ok(OK2), Ok(ALL)]);
        let r = r.unwrap();
        assert!(seen.iter().all(|q| q.format == Format::Notes));
        assert_eq!(r.verify, VerifyStats::default());
        assert_eq!(seen.len(), 3);
    }
}
