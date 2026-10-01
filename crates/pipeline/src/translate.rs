//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này.

use crate::config::MtConfig;
use crate::llama::{ChatRequest, LlamaServer, StreamEnd};
use crate::postprocess::{PostProcessor, Step, Violation};
use crate::prompt::{Lang, context_prompt, translation_prompt};
use std::ops::ControlFlow;
use std::time::Instant;

/// Lỗi phía server dịch.
#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MtError {
    /// Server không dùng được nữa (đã khởi động lại quá giới hạn, §6.5): phụ đề chỉ hiện câu gốc.
    #[error("llama-server không dùng được: {0}")]
    Unavailable(String),
    /// Request này lỗi (mất kết nối, stream cụt…); bên giám sát đã lo khởi động lại nếu cần.
    #[error("request dịch lỗi: {0}")]
    Failed(String),
}

/// Server dịch. `LlamaServer` là bản thật; `supervisor` bọc nó để tự khởi động lại; test dùng bản giả.
pub trait Mt: Send {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError>;
    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError>;
}

impl Mt for LlamaServer {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        LlamaServer::count_tokens(self, text).map_err(|e| MtError::Failed(format!("{e:#}")))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        LlamaServer::stream(self, req, on_delta).map_err(|e| MtError::Failed(format!("{e:#}")))
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Job<'a> {
    pub text: &'a str,
    pub src: Lang,
    pub tgt: Lang,
    /// Câu trước, khi bật cờ thử nghiệm `experimental.translationContext` (§6.5).
    pub context: Option<&'a str>,
}

/// Sự kiện trong lúc dịch, cho luồng phụ đề.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event<'a> {
    /// Phần chữ mới đã qua hậu xử lý.
    Delta(&'a str),
    /// Lần đầu lỗi, sắp thử lại: phần chữ đã hiện không còn đúng.
    Retry,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Translated {
    pub text: String,
    /// 1, hoặc 2 nếu phải thử lại.
    pub attempts: u8,
    pub source_tokens: usize,
    pub completion_tokens: Option<usize>,
    /// Từ lúc bắt đầu tới chữ đầu tiên được hiện, và tới lúc xong (cả hai lần thử nếu có).
    pub first_delta_ms: Option<f32>,
    pub total_ms: f32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Done(Translated),
    /// Cả hai lần đều lỗi: hiện câu gốc, đánh dấu "chưa dịch được".
    Failed {
        reason: String,
        attempts: u8,
        source_tokens: usize,
        completion_tokens: Option<usize>,
    },
    /// Bên gọi dừng giữa chừng (câu đã được ghép thêm, sẽ dịch lại).
    Cancelled,
    Unavailable(String),
}

fn describe(v: Violation) -> &'static str {
    match v {
        Violation::TooLong => "quá ngưỡng tỉ lệ token",
        Violation::Explanation => "có lời giải thích",
        Violation::Truncated => "bị cắt ở max_tokens",
        Violation::Empty => "rỗng",
    }
}

pub fn translate(
    mt: &mut dyn Mt,
    job: &Job,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let prompt = match job.context {
        Some(context) => context_prompt(job.text, context, job.src, job.tgt),
        None => translation_prompt(job.text, job.src, job.tgt),
    };
    let source_tokens = match mt.count_tokens(job.text) {
        Ok(n) => n,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 0,
                source_tokens: 0,
                completion_tokens: None,
            };
        }
    };
    let max_tokens = cfg.max_tokens_for(source_tokens);
    // Cách 2 của Q4: chỉ áp tỉ lệ khi câu gốc đủ dài; câu ngắn hơn chỉ chịu hạn mức sinh.
    let max_chunks = cfg
        .ratio_for(job.src.code(), job.tgt.code())
        .filter(|_| source_tokens >= cfg.ratio_min_source_tokens)
        .map(|ratio| (ratio as f64 * source_tokens as f64).floor() as usize);
    let mut reason = String::new();
    let mut completion_tokens = None;
    let mut first_delta_ms = None;
    for (attempt, repeat_penalty) in [(1u8, cfg.repeat_penalty), (2, cfg.retry_repeat_penalty)] {
        if attempt == 2 {
            if on_event(Event::Retry).is_break() {
                return Outcome::Cancelled;
            }
            // Phần đã hiện ở lần đầu bị bỏ: "chữ đầu tiên" tính lại theo lần thử này.
            first_delta_ms = None;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
        let mut violation = None;
        let mut cancelled = false;
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
        };
        let result = mt.stream(&req, &mut |chunk| match pp.push(chunk) {
            Step::Emit(delta) => {
                first_delta_ms.get_or_insert_with(|| started.elapsed().as_secs_f32() * 1000.0);
                if on_event(Event::Delta(&delta)).is_break() {
                    cancelled = true;
                    ControlFlow::Break(())
                } else {
                    ControlFlow::Continue(())
                }
            }
            Step::Hold => ControlFlow::Continue(()),
            Step::Stop(v) => {
                violation = Some(v);
                ControlFlow::Break(())
            }
        });
        let end = match result {
            Ok(end) => end,
            Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
            Err(MtError::Failed(e)) => {
                reason = e;
                continue;
            }
        };
        if cancelled {
            return Outcome::Cancelled;
        }
        completion_tokens = end.completion_tokens.or(Some(end.chunks));
        let finished = match violation {
            Some(v) => Err(v),
            None => pp.finish(end.finish_reason.as_deref()),
        };
        match finished {
            Ok(text) => {
                return Outcome::Done(Translated {
                    text,
                    attempts: attempt,
                    source_tokens,
                    completion_tokens,
                    first_delta_ms,
                    total_ms: started.elapsed().as_secs_f32() * 1000.0,
                });
            }
            Err(v) => reason = describe(v).to_string(),
        }
    }
    Outcome::Failed {
        reason,
        attempts: 2,
        source_tokens,
        completion_tokens,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Server giả: mỗi request trả một danh sách gói định sẵn, và ghi lại tham số đã nhận.
    struct Scripted {
        replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>,
        requests: Vec<(String, u32, f64)>,
    }

    impl Mt for Scripted {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests
                .push((req.prompt.to_string(), req.max_tokens, req.repeat_penalty));
            let (chunks, finish) = self.replies.remove(0)?;
            let mut end = StreamEnd::default();
            for c in chunks {
                end.chunks += 1;
                end.text.push_str(c);
                if on_delta(c).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some(finish.into());
            Ok(end)
        }
    }

    fn job(text: &str) -> Job<'_> {
        Job {
            text,
            src: Lang::En,
            tgt: Lang::Vi,
            context: None,
        }
    }

    fn run(mt: &mut Scripted, job: &Job) -> (Vec<String>, Outcome) {
        let mut events = Vec::new();
        let outcome = translate(mt, job, &MtConfig::default(), &mut |e| {
            events.push(match e {
                Event::Delta(d) => d.to_string(),
                Event::Retry => "<retry>".into(),
            });
            ControlFlow::Continue(())
        });
        (events, outcome)
    }

    #[test]
    fn a_good_translation_is_streamed_and_done() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job("Good morning"));
        assert_eq!(events, ["Chào", " buổi", " sáng"]);
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts, t.source_tokens), ("Chào buổi sáng", 1, 2));
        // Prompt của app và tham số sinh của §6.5: 2 token nguồn → max_tokens 40, repeat penalty 1,05.
        assert_eq!(
            mt.requests,
            [(translation_prompt("Good morning", Lang::En, Lang::Vi), 40, 1.05)]
        );
    }

    #[test]
    fn a_rambling_translation_is_cut_and_retried_with_a_higher_penalty() {
        // 10 token nguồn, Anh→Việt 4,4: tối đa 44 gói.
        let source = "one two three four five six seven eight nine ten";
        let long: Vec<&str> = std::iter::repeat_n(" x", 60).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop")), Ok((vec!["một", " hai"], "stop"))],
            requests: vec![],
        };
        let (events, outcome) = run(&mut mt, &job(source));
        assert_eq!(events.iter().filter(|e| *e == "<retry>").count(), 1);
        assert_eq!(events.last().map(String::as_str), Some(" hai"));
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts), ("một hai", 2));
        let penalties: Vec<f64> = mt.requests.iter().map(|r| r.2).collect();
        assert_eq!(penalties, [1.05, 1.15]);
    }

    #[test]
    fn short_sources_are_not_held_to_the_ratio() {
        // 2 token nguồn (< 10): 60 gói vẫn được, chỉ chịu hạn mức sinh 40 token của server.
        let long: Vec<&str> = std::iter::repeat_n(" x", 30).collect();
        let mut mt = Scripted {
            replies: vec![Ok((long, "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hi there"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 1),
            "{outcome:?}"
        );
    }

    #[test]
    fn two_failures_give_failed_and_the_source_is_shown() {
        let mut mt = Scripted {
            replies: vec![
                Ok((vec!["Chào", "\n", "Giải thích"], "stop")),
                Ok((vec!["Chào", " bạn"], "length")),
            ],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        match outcome {
            Outcome::Failed { reason, attempts, .. } => {
                assert_eq!(attempts, 2);
                assert_eq!(reason, "bị cắt ở max_tokens");
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_request_error_is_retried_once_and_unavailable_stops_at_once() {
        let mut mt = Scripted {
            replies: vec![Err(MtError::Failed("mất kết nối".into())), Ok((vec!["Chào"], "stop"))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert!(
            matches!(outcome, Outcome::Done(ref t) if t.attempts == 2),
            "{outcome:?}"
        );
        let mut mt = Scripted {
            replies: vec![Err(MtError::Unavailable("quá 5 lần".into()))],
            requests: vec![],
        };
        let (_, outcome) = run(&mut mt, &job("Hello"));
        assert_eq!(outcome, Outcome::Unavailable("quá 5 lần".into()));
    }

    #[test]
    fn the_caller_can_cancel() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Chào", " buổi", " sáng"], "stop"))],
            requests: vec![],
        };
        let outcome = translate(&mut mt, &job("Good morning"), &MtConfig::default(), &mut |_| {
            ControlFlow::Break(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
    }

    #[test]
    fn context_uses_the_background_template() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["B"], "stop"))],
            requests: vec![],
        };
        let with_context = Job {
            context: Some("câu trước"),
            ..job("next")
        };
        run(&mut mt, &with_context);
        assert!(mt.requests[0].0.starts_with("[Background Information]\ncâu trước"));
    }
}
