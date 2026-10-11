//! Dịch một câu theo §6.5: dựng prompt, tính số token tối đa, stream qua hậu xử lý, thử lại một lần với repeat penalty
//! cao hơn khi bản dịch lỗi, rồi mới báo "chưa dịch được". App (luồng dịch của `engine`) và `latency-bench mt-eval` (A3,
//! Đ4 của kế hoạch 00) dùng đúng hàm này. `translate_live` dịch bản tạm của dòng đang nói (spec 2026-10-10 §4.3) bằng
//! cùng luật, một lần thử, có prefill.

use crate::config::MtConfig;
use crate::glossary::Term;
use crate::llama::{ChatRequest, LlamaServer, StreamEnd};
use crate::postprocess::{PostProcessor, Step, Violation};
use crate::prompt::{Lang, context_prompt, terminology_prompt, translation_prompt};
use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};
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
    /// Thuật ngữ có trong câu (`Glossary::matches`, §6.5). Có thuật ngữ thì dùng mẫu "terminology" và bỏ ngữ cảnh: model
    /// card không có mẫu gộp hai thứ, và cờ ngữ cảnh chỉ là thử nghiệm, mặc định tắt.
    pub terms: &'a [Term],
    /// Cờ hủy (spec 2026-10-10 §4.6, A2): `translate` và `translate_live` đều kiểm trước khi gửi request và ở mỗi gói
    /// chữ stream về, kể cả gói đang bị hậu xử lý giữ lại. Đây là hủy hợp tác, chỉ xem cờ ở các điểm đó, không ngắt
    /// request đang chờ hồi đáp:
    /// cờ bật ngay sau gói cuối vẫn có thể nhận `Outcome::Done`/`Failed` như bình thường — bên gọi tự bỏ kết quả của
    /// việc đã hủy (ví dụ qua phiên bản câu, `is_current`).
    pub cancel: Option<&'a AtomicBool>,
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
    /// Hết số lần thử mà vẫn lỗi (2 lần với `translate`, 1 lần với `translate_live`): hiện câu gốc, đánh dấu "chưa dịch
    /// được".
    Failed {
        reason: String,
        attempts: u8,
        source_tokens: usize,
        completion_tokens: Option<usize>,
    },
    /// Bên gọi hủy qua cờ `Job.cancel` hay callback trả `Break`, trước khi gửi request hoặc giữa lúc dịch. Câu có được
    /// dịch lại hay không tùy nơi gọi (ghép thêm đoạn thì dịch lại; hết hạn dừng, qua `abandon`, thì không).
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

/// Prompt theo §6.5: có thuật ngữ thì mẫu "terminology" (bỏ ngữ cảnh), có ngữ cảnh thì mẫu nền, còn lại mẫu mặc định.
fn prompt_for(job: &Job) -> String {
    match job.context {
        _ if !job.terms.is_empty() => terminology_prompt(job.text, job.terms, job.src, job.tgt),
        Some(context) => context_prompt(job.text, context, job.src, job.tgt),
        None => translation_prompt(job.text, job.src, job.tgt),
    }
}

/// Số gói tối đa trước khi coi là quá dài (ngưỡng tỉ lệ token của cặp, §6.5). Cách 2 của Q4: chỉ áp tỉ lệ khi câu gốc đủ
/// dài; câu ngắn hơn chỉ chịu hạn mức sinh.
fn max_chunks_for(job: &Job, cfg: &MtConfig, source_tokens: usize) -> Option<usize> {
    cfg.ratio_for(job.src.code(), job.tgt.code())
        .filter(|_| source_tokens >= cfg.ratio_min_source_tokens)
        .map(|ratio| (ratio as f64 * source_tokens as f64).floor() as usize)
}

/// Một lần stream qua hậu xử lý (§6.5). Cờ hủy được kiểm ở mọi gói, cả khi hậu xử lý còn giữ chữ (nhãn chưa rõ, ngoặc
/// mở): không chờ gói được hiện tiếp theo (H1). Trả kết quả của stream, vi phạm (nếu có), và việc đã dừng vì bị hủy.
fn stream_once(
    mt: &mut dyn Mt,
    req: &ChatRequest,
    pp: &mut PostProcessor,
    job: &Job,
    started: Instant,
    first_delta_ms: &mut Option<f32>,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> (Result<StreamEnd, MtError>, Option<Violation>, bool) {
    let (mut violation, mut cancelled) = (None, false);
    let result = mt.stream(req, &mut |chunk| {
        if job.cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
            cancelled = true;
            return ControlFlow::Break(());
        }
        match pp.push(chunk) {
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
        }
    });
    (result, violation, cancelled)
}

pub fn translate(
    mt: &mut dyn Mt,
    job: &Job,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let is_cancelled = || job.cancel.is_some_and(|c| c.load(Ordering::SeqCst));
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let prompt = prompt_for(job);
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
    let max_chunks = max_chunks_for(job, cfg, source_tokens);
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
        if is_cancelled() {
            return Outcome::Cancelled;
        }
        let mut pp = PostProcessor::new(job.text, max_chunks);
        let req = ChatRequest {
            prompt: &prompt,
            max_tokens,
            repeat_penalty,
            prefill: None,
        };
        let (result, violation, cancelled) =
            stream_once(mt, &req, &mut pp, job, started, &mut first_delta_ms, on_event);
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

/// Dịch bản tạm của dòng đang nói (spec 2026-10-10 §4.3): như `translate` (mẫu prompt, thuật ngữ, `max_tokens`, hậu xử
/// lý, cờ hủy H1) nhưng chỉ một lần thử, không thử lại với repeat penalty cao hơn, và có thể kèm `prefill` (phần dịch đã
/// chốt, không có khoảng trắng cuối). `llama-server` b11146 stream lại cả phần prefill, nên chữ stream về là cả bản dịch.
/// Vi phạm luật hậu xử lý, bị cắt ở `max_tokens` hay request lỗi: `Outcome::Failed`; bên gọi giữ chữ đang hiện (§7).
pub fn translate_live(
    mt: &mut dyn Mt,
    job: &Job,
    prefill: Option<&str>,
    cfg: &MtConfig,
    on_event: &mut dyn FnMut(Event) -> ControlFlow<()>,
) -> Outcome {
    let started = Instant::now();
    let is_cancelled = || job.cancel.is_some_and(|c| c.load(Ordering::SeqCst));
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let prompt = prompt_for(job);
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
    if is_cancelled() {
        return Outcome::Cancelled;
    }
    let mut pp = PostProcessor::new(job.text, max_chunks_for(job, cfg, source_tokens));
    let req = ChatRequest {
        prompt: &prompt,
        max_tokens: cfg.max_tokens_for(source_tokens),
        repeat_penalty: cfg.repeat_penalty,
        prefill,
    };
    let mut first_delta_ms = None;
    let (result, violation, cancelled) = stream_once(mt, &req, &mut pp, job, started, &mut first_delta_ms, on_event);
    let end = match result {
        Ok(end) => end,
        Err(MtError::Unavailable(e)) => return Outcome::Unavailable(e),
        Err(MtError::Failed(e)) => {
            return Outcome::Failed {
                reason: e,
                attempts: 1,
                source_tokens,
                completion_tokens: None,
            };
        }
    };
    if cancelled {
        return Outcome::Cancelled;
    }
    let completion_tokens = end.completion_tokens.or(Some(end.chunks));
    let finished = match violation {
        Some(v) => Err(v),
        None => pp.finish(end.finish_reason.as_deref()),
    };
    match finished {
        Ok(text) => Outcome::Done(Translated {
            text,
            attempts: 1,
            source_tokens,
            completion_tokens,
            first_delta_ms,
            total_ms: started.elapsed().as_secs_f32() * 1000.0,
        }),
        Err(v) => Outcome::Failed {
            reason: describe(v).to_string(),
            attempts: 1,
            source_tokens,
            completion_tokens,
        },
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
            terms: &[],
            cancel: None,
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

    /// Server giả cho test hủy: đếm số lần gọi `/tokenize` và request dịch; mỗi request trả `chunks`, và bật `flag` ngay
    /// trước khi gửi gói thứ `cancel_at` (đếm từ 0), như luồng phụ đề hủy câu trong lúc đang stream. `sent`: số gói đã gửi.
    struct Cancelling<'a> {
        chunks: Vec<&'static str>,
        cancel_at: usize,
        flag: &'a AtomicBool,
        tokenized: usize,
        streams: usize,
        sent: usize,
    }

    impl<'a> Cancelling<'a> {
        fn new(chunks: Vec<&'static str>, cancel_at: usize, flag: &'a AtomicBool) -> Self {
            Self {
                chunks,
                cancel_at,
                flag,
                tokenized: 0,
                streams: 0,
                sent: 0,
            }
        }
    }

    impl Mt for Cancelling<'_> {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            self.tokenized += 1;
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.streams += 1;
            let mut end = StreamEnd::default();
            for (i, chunk) in self.chunks.iter().enumerate() {
                if i == self.cancel_at {
                    self.flag.store(true, Ordering::SeqCst);
                }
                self.sent += 1;
                end.chunks += 1;
                if on_delta(chunk).is_break() {
                    end.cancelled = true;
                    return Ok(end);
                }
            }
            end.finish_reason = Some("stop".into());
            Ok(end)
        }
    }

    /// H1 của kế hoạch 00 (A2): câu đã bị hủy trước khi dịch thì không gửi request nào, kể cả `/tokenize`.
    #[test]
    fn a_job_cancelled_before_it_starts_sends_no_request() {
        let flag = AtomicBool::new(true);
        let mut mt = Cancelling::new(vec!["Chào"], usize::MAX, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let mut events = 0;
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |_| {
            events += 1;
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!((mt.tokenized, mt.streams, events), (0, 0, 0));
    }

    /// Cờ hủy được kiểm ở mỗi gói, kể cả khi hậu xử lý đang giữ chữ (chưa biết "Trans…" có phải nhãn không): dừng ngay, không
    /// chờ tới gói chữ được hiện tiếp theo.
    #[test]
    fn a_cancel_is_seen_while_the_postprocessor_holds_the_text() {
        let flag = AtomicBool::new(false);
        let mut mt = Cancelling::new(vec!["Trans", "lation", ":", " Xin", " chào"], 1, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let mut events = Vec::new();
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |e| {
            events.push(format!("{e:?}"));
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.sent, 2, "dừng ở gói thứ hai, lúc chữ còn bị giữ");
        assert!(events.is_empty(), "{events:?}");
    }

    /// Hủy giữa hai lần thử (lần đầu quá dài): lần thử lại không được gửi.
    #[test]
    fn a_cancel_between_attempts_skips_the_retry() {
        let flag = AtomicBool::new(false);
        // 10 token nguồn, Anh→Việt 4,4: tối đa 44 gói; 60 gói là quá dài.
        let mut mt = Cancelling::new(std::iter::repeat_n(" x", 60).collect(), usize::MAX, &flag);
        let job = Job {
            cancel: Some(&flag),
            ..job("one two three four five six seven eight nine ten")
        };
        let outcome = translate(&mut mt, &job, &MtConfig::default(), &mut |e| {
            if e == Event::Retry {
                flag.store(true, Ordering::SeqCst);
            }
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.streams, 1);
    }

    /// Server giả ghi cả prefill của mỗi request (bản tạm, spec 2026-10-10 §4.3).
    struct Prefilled {
        replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>,
        requests: Vec<(String, u32, f64, Option<String>)>,
    }

    impl Prefilled {
        fn new(replies: Vec<Result<(Vec<&'static str>, &'static str), MtError>>) -> Self {
            Self {
                replies,
                requests: Vec::new(),
            }
        }
    }

    impl Mt for Prefilled {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests.push((
                req.prompt.to_string(),
                req.max_tokens,
                req.repeat_penalty,
                req.prefill.map(String::from),
            ));
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

    fn live(mt: &mut Prefilled, job: &Job, prefill: Option<&str>) -> (Vec<String>, Outcome) {
        let mut events = Vec::new();
        let outcome = translate_live(mt, job, prefill, &MtConfig::default(), &mut |e| {
            events.push(match e {
                Event::Delta(d) => d.to_string(),
                Event::Retry => "<retry>".into(),
            });
            ControlFlow::Continue(())
        });
        (events, outcome)
    }

    /// Bản tạm (spec 2026-10-10 §4.3): một lần thử; prefill đi kèm request; tham số sinh như lượt cuối (4 token nguồn →
    /// `max_tokens` 48); chữ stream về (gồm phần prefill được stream lại) là cả bản dịch.
    #[test]
    fn a_live_translation_is_one_attempt_with_the_prefill() {
        let mut mt = Prefilled::new(vec![Ok((vec!["chúng tôi", " đi", " về"], "stop"))]);
        let (events, outcome) = live(&mut mt, &job("so we went home"), Some("chúng tôi"));
        assert_eq!(events, ["chúng tôi", " đi", " về"]);
        let Outcome::Done(t) = outcome else {
            panic!("{outcome:?}")
        };
        assert_eq!((t.text.as_str(), t.attempts), ("chúng tôi đi về", 1));
        assert_eq!(
            mt.requests,
            [(
                translation_prompt("so we went home", Lang::En, Lang::Vi),
                48,
                1.05,
                Some("chúng tôi".to_string())
            )]
        );
    }

    /// Bản tạm vi phạm luật độ dài, bị cắt ở `max_tokens` hay request lỗi: bỏ, không thử lại (spec §4.3, §7).
    #[test]
    fn a_bad_live_translation_fails_without_a_retry() {
        let long: Vec<&str> = std::iter::repeat_n(" x", 60).collect();
        let mut mt = Prefilled::new(vec![Ok((long, "stop"))]);
        let (events, outcome) = live(&mut mt, &job("one two three four five six seven eight nine ten"), None);
        assert!(
            matches!(&outcome, Outcome::Failed { attempts: 1, reason, .. } if reason == "quá ngưỡng tỉ lệ token"),
            "{outcome:?}"
        );
        assert!(!events.iter().any(|e| e == "<retry>"));
        assert_eq!(mt.requests.len(), 1);
        let mut mt = Prefilled::new(vec![Ok((vec!["Chào", " bạn"], "length"))]);
        let (_, outcome) = live(&mut mt, &job("Hello"), None);
        assert!(
            matches!(&outcome, Outcome::Failed { reason, .. } if reason == "bị cắt ở max_tokens"),
            "{outcome:?}"
        );
        let mut mt = Prefilled::new(vec![Err(MtError::Failed("mất kết nối".into()))]);
        let (_, outcome) = live(&mut mt, &job("Hello"), None);
        assert!(matches!(&outcome, Outcome::Failed { attempts: 1, .. }), "{outcome:?}");
        assert_eq!(mt.requests.len(), 1, "không gửi lại");
        let mut mt = Prefilled::new(vec![Err(MtError::Unavailable("quá 5 lần".into()))]);
        assert_eq!(
            live(&mut mt, &job("Hello"), None).1,
            Outcome::Unavailable("quá 5 lần".into())
        );
    }

    /// Cờ hủy (H1) cũng áp cho bản tạm: hủy trước khi bắt đầu thì không gửi request nào; hủy giữa chừng thì dừng ngay ở gói
    /// đó, kể cả khi hậu xử lý còn giữ chữ.
    #[test]
    fn a_live_translation_honours_the_cancel_flag() {
        let flag = AtomicBool::new(true);
        let mut mt = Cancelling::new(vec!["Chào"], usize::MAX, &flag);
        let cancelled = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let outcome = translate_live(&mut mt, &cancelled, None, &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!((mt.tokenized, mt.streams), (0, 0));
        let flag = AtomicBool::new(false);
        let mut mt = Cancelling::new(vec!["Trans", "lation", ":", " Xin"], 1, &flag);
        let running = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let outcome = translate_live(&mut mt, &running, Some("Xin"), &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!(outcome, Outcome::Cancelled);
        assert_eq!(mt.sent, 2);
    }

    /// Bản tạm dùng đúng mẫu prompt của lượt cuối (thuật ngữ có trong câu).
    #[test]
    fn a_live_translation_uses_the_same_templates() {
        let terms = [Term {
            source: "sprint".into(),
            target: "đợt chạy".into(),
        }];
        let mut mt = Prefilled::new(vec![Ok((vec!["Đợt"], "stop"))]);
        live(
            &mut mt,
            &Job {
                terms: &terms,
                ..job("The sprint")
            },
            None,
        );
        assert_eq!(
            mt.requests[0].0,
            terminology_prompt("The sprint", &terms, Lang::En, Lang::Vi)
        );
    }

    /// Server giả bật cờ hủy trong lúc `/tokenize` đang chạy (luồng phụ đề hủy đúng lúc đó); đếm số request dịch.
    struct CancelOnTokenize<'a> {
        flag: &'a AtomicBool,
        streams: usize,
    }

    impl Mt for CancelOnTokenize<'_> {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            self.flag.store(true, Ordering::SeqCst);
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            _: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.streams += 1;
            Ok(StreamEnd::default())
        }
    }

    /// H1: cờ bật trong lúc `/tokenize` thì không gửi request dịch, ở lượt cuối lẫn bản tạm.
    #[test]
    fn a_cancel_during_tokenize_sends_no_translation_request() {
        let flag = AtomicBool::new(false);
        let cancellable = Job {
            cancel: Some(&flag),
            ..job("Hello")
        };
        let mut mt = CancelOnTokenize {
            flag: &flag,
            streams: 0,
        };
        let outcome = translate(&mut mt, &cancellable, &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!((outcome, mt.streams), (Outcome::Cancelled, 0));
        flag.store(false, Ordering::SeqCst);
        let mut mt = CancelOnTokenize {
            flag: &flag,
            streams: 0,
        };
        let outcome = translate_live(&mut mt, &cancellable, Some("Xin"), &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert_eq!((outcome, mt.streams), (Outcome::Cancelled, 0));
    }

    /// Server giả: `/tokenize` lỗi; đếm số request dịch.
    struct TokenizeFails {
        error: MtError,
        streams: usize,
    }

    impl Mt for TokenizeFails {
        fn count_tokens(&mut self, _: &str) -> Result<usize, MtError> {
            Err(self.error.clone())
        }

        fn stream(
            &mut self,
            _: &ChatRequest,
            _: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.streams += 1;
            Ok(StreamEnd::default())
        }
    }

    /// `/tokenize` lỗi thì không gửi request dịch: request hỏng là `Failed` chưa thử lần nào, server không dùng được là
    /// `Unavailable` (luồng phụ đề tắt dịch khi gặp nó, nên không được lẫn hai loại). Như nhau ở lượt cuối và bản tạm.
    #[test]
    fn a_tokenize_error_sends_no_translation_request() {
        let cfg = MtConfig::default();
        for (error, expected) in [
            (
                MtError::Failed("mất kết nối".into()),
                Outcome::Failed {
                    reason: "mất kết nối".into(),
                    attempts: 0,
                    source_tokens: 0,
                    completion_tokens: None,
                },
            ),
            (
                MtError::Unavailable("quá 5 lần".into()),
                Outcome::Unavailable("quá 5 lần".into()),
            ),
        ] {
            let mut mt = TokenizeFails {
                error: error.clone(),
                streams: 0,
            };
            let outcome = translate(&mut mt, &job("Hello"), &cfg, &mut |_| ControlFlow::Continue(()));
            assert_eq!((&outcome, mt.streams), (&expected, 0));
            let mut mt = TokenizeFails { error, streams: 0 };
            let outcome = translate_live(&mut mt, &job("Hello"), Some("Xin"), &cfg, &mut |_| {
                ControlFlow::Continue(())
            });
            assert_eq!((&outcome, mt.streams), (&expected, 0));
        }
    }

    /// Bản tạm chọn mẫu như lượt cuối: có ngữ cảnh thì mẫu nền; có cả thuật ngữ thì mẫu "terminology", bỏ ngữ cảnh.
    #[test]
    fn a_live_translation_picks_the_template_like_the_final_pass() {
        let terms = [Term {
            source: "sprint".into(),
            target: "đợt chạy".into(),
        }];
        let mut mt = Prefilled::new(vec![Ok((vec!["B"], "stop")), Ok((vec!["Đợt"], "stop"))]);
        live(
            &mut mt,
            &Job {
                context: Some("câu trước"),
                ..job("next")
            },
            None,
        );
        live(
            &mut mt,
            &Job {
                context: Some("câu trước"),
                terms: &terms,
                ..job("The sprint")
            },
            None,
        );
        assert_eq!(
            mt.requests[0].0,
            context_prompt("next", "câu trước", Lang::En, Lang::Vi)
        );
        assert_eq!(
            mt.requests[1].0,
            terminology_prompt("The sprint", &terms, Lang::En, Lang::Vi)
        );
    }

    /// Vi phạm thì dừng stream ngay ở gói vi phạm (gói thứ 45 khi tối đa 44 gói), không đọc tiếp: với `-np 1`, bản tạm
    /// lan man mà chạy tới `max_tokens` sẽ giữ `llama-server` và làm chậm lượt cuối. 44 gói thì vẫn được.
    #[test]
    fn a_live_violation_stops_the_stream_at_the_offending_chunk() {
        let flag = AtomicBool::new(false);
        let source = job("one two three four five six seven eight nine ten");
        let mut mt = Cancelling::new(std::iter::repeat_n(" x", 60).collect(), usize::MAX, &flag);
        let outcome = translate_live(&mut mt, &source, None, &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert!(
            matches!(&outcome, Outcome::Failed { attempts: 1, reason, .. } if reason == "quá ngưỡng tỉ lệ token"),
            "{outcome:?}"
        );
        assert_eq!(mt.sent, 45);
        let mut mt = Cancelling::new(std::iter::repeat_n(" x", 44).collect(), usize::MAX, &flag);
        let outcome = translate_live(&mut mt, &source, None, &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert!(matches!(&outcome, Outcome::Done(t) if t.attempts == 1), "{outcome:?}");
    }

    /// Số đo của bản tạm: số token nguồn, và số token sinh lấy theo server (dự phòng là số gói).
    #[test]
    fn a_live_translation_reports_its_token_counts() {
        let mut mt = Prefilled::new(vec![Ok((vec!["chúng tôi", " đi", " về"], "stop"))]);
        let (_, outcome) = live(&mut mt, &job("so we went home"), Some("chúng tôi"));
        assert!(
            matches!(&outcome, Outcome::Done(t) if (t.source_tokens, t.completion_tokens) == (4, Some(3))),
            "{outcome:?}"
        );
    }

    /// Đủ ba loại vi phạm spec §4.3 liệt kê cho bản tạm: lời giải thích và rỗng cũng là `Failed` một lần thử, đúng lý do.
    #[test]
    fn a_live_explanation_or_empty_reply_fails_with_its_reason() {
        for (chunks, why) in [
            (vec!["Chào", "\n", "Giải thích"], "có lời giải thích"),
            (vec!["  ", " "], "rỗng"),
        ] {
            let mut mt = Prefilled::new(vec![Ok((chunks, "stop"))]);
            let (_, outcome) = live(&mut mt, &job("Hello"), None);
            assert!(
                matches!(&outcome, Outcome::Failed { attempts: 1, reason, .. } if reason == why),
                "{outcome:?}"
            );
            assert_eq!(mt.requests.len(), 1);
        }
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

    #[test]
    fn terms_use_the_terminology_template_and_drop_the_context() {
        let mut mt = Scripted {
            replies: vec![Ok((vec!["Đợt", " chạy"], "stop"))],
            requests: vec![],
        };
        let terms = [Term {
            source: "sprint".into(),
            target: "đợt chạy".into(),
        }];
        let with_terms = Job {
            context: Some("câu trước"),
            terms: &terms,
            ..job("The sprint")
        };
        run(&mut mt, &with_terms);
        assert_eq!(
            mt.requests[0].0,
            terminology_prompt("The sprint", &terms, Lang::En, Lang::Vi)
        );
    }
}
