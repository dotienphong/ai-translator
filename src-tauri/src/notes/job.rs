//! Dựng ghi chú từ các dòng của bản chép lời theo kiểu map-reduce (xem `run`). Cùng thuật toán với `run_job` của
//! `bench/2026-11-11-ghi-chu-cuoc-hop/run_notes.py`, là bản đã đo.

use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use super::chunk::{self, PromptLine};
use super::engine::{Message, NotesEngine, NotesError, NotesRequest, Role};
use super::prompt;
use super::schema::{self, ActionItem, Item, MAX_SUMMARY_CHARS, Notes};
use crate::settings::NotesTemplate;

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

/// Hỏi model một lần; JSON sai thì hỏi lại đúng một lần với `[user: prompt, assistant: chuỗi vừa nhận, user: FIX]`.
/// Kiểm `cancel` trước mỗi lần gọi engine. Mọi `Err` của engine trả nguyên.
fn ask(
    engine: &dyn NotesEngine,
    cancel: &AtomicBool,
    lines: &[PromptLine],
    prompt: String,
    max_tokens: u32,
) -> Result<Asked, NotesError> {
    check_cancel(cancel)?;
    let mut messages = vec![Message {
        role: Role::User,
        content: prompt,
    }];
    let raw = engine.generate(
        &NotesRequest {
            messages: messages.clone(),
            max_tokens,
        },
        cancel,
    )?;
    if let Some((notes, _)) = schema::parse(&raw, lines) {
        return Ok(Asked {
            notes: Some(notes),
            raw,
        });
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
    let raw = engine.generate(&NotesRequest { messages, max_tokens }, cancel)?;
    let notes = schema::parse(&raw, lines).map(|(n, _)| n);
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
    };
    if chunks.is_empty() {
        return Ok(out);
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

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use std::cell::RefCell;
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;
    use crate::notes::chunk::PromptLine;
    use crate::notes::engine::{Limits, NotesEngine, NotesError, NotesRequest, Role};
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
        fn generate(&self, req: &NotesRequest, _cancel: &AtomicBool) -> Result<String, NotesError> {
            self.seen.borrow_mut().push(req.clone());
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
        };
        let r = run(lines, "vi", NotesTemplate::Meeting, &engine, cancel, progress);
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
}
