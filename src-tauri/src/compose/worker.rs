//! Dịch chữ của ô soạn (spec 2026-10-17-go-dich §3.3) bằng đúng hàm dịch của phụ đề (`pipeline::translate::translate`): cùng
//! mẫu prompt, tham số sinh, hậu xử lý, ngưỡng "bản dịch quá dài" và lần thử lại (§6.5 của spec gốc). Không có ngữ cảnh, không
//! có thuật ngữ (spec §0: từ điển thuật ngữ hiện chỉ có một chiều, cho phụ đề).

use std::ops::ControlFlow;
use std::sync::atomic::{AtomicBool, Ordering};

use pipeline::config::MtConfig;
use pipeline::prompt::Lang as MtLang;
use pipeline::translate::{self, Event, Job, Mt, MtError, Outcome};

use crate::errors;

/// Số token tối đa của một dòng (spec §1.2): prompt, dòng gốc và bản dịch (`max_tokens` tối đa 512) phải nằm gọn trong ngữ
/// cảnh 2048 token của `llama-server` (§6.5).
pub const MAX_LINE_TOKENS: usize = 400;

/// Dịch dừng giữa chừng.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Stop {
    /// Có yêu cầu mới hơn, hay ô soạn đã đóng: không báo gì cho giao diện.
    Cancelled,
    /// Mã lỗi cho giao diện (`error.<mã>`).
    Failed(&'static str),
}

/// Việc trong lúc dịch, cho sự kiện `compose://delta`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Piece<'a> {
    /// Phần chữ dịch mới của dòng `line` (đánh số theo mọi dòng của chữ gõ, kể cả dòng trống).
    Delta { line: usize, text: &'a str },
    /// Lần dịch đầu của dòng `line` lỗi, sắp thử lại: bỏ phần chữ đã hiện của dòng đó.
    Retry { line: usize },
}

/// Dịch `text` từ `src` sang `tgt`. Tách theo `\n`: dòng chỉ có khoảng trắng giữ nguyên; dòng có chữ được dịch riêng (bỏ khoảng
/// trắng đầu và cuối dòng), lần lượt; kết quả ghép lại bằng đúng các dấu xuống dòng gốc. Mọi dòng được đếm token trước khi dịch
/// dòng nào: có dòng quá [`MAX_LINE_TOKENS`] thì báo `composeTooLong` ngay, không dịch dở.
///
/// Cờ `cancel` được kiểm trước mỗi request và ở mỗi gói chữ (cách hủy của bản dịch tạm, §6.5).
pub fn translate_text(
    mt: &mut dyn Mt,
    cfg: &MtConfig,
    text: &str,
    src: MtLang,
    tgt: MtLang,
    cancel: &AtomicBool,
    on_piece: &mut dyn FnMut(Piece),
) -> Result<String, Stop> {
    let lines: Vec<&str> = text.split('\n').collect();
    for line in lines.iter().map(|l| l.trim()).filter(|l| !l.is_empty()) {
        if cancel.load(Ordering::SeqCst) {
            return Err(Stop::Cancelled);
        }
        match mt.count_tokens(line) {
            Ok(n) if n > MAX_LINE_TOKENS => return Err(Stop::Failed(errors::COMPOSE_TOO_LONG)),
            Ok(_) => {}
            Err(MtError::Unavailable(_)) => return Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)),
            Err(MtError::Failed(_)) => return Err(Stop::Failed(errors::COMPOSE_FAILED)),
        }
    }
    let mut out = Vec::with_capacity(lines.len());
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push((*line).to_string());
            continue;
        }
        let job = Job {
            text: trimmed,
            src,
            tgt,
            context: None,
            terms: &[],
            cancel: Some(cancel),
        };
        let outcome = translate::translate(mt, &job, cfg, &mut |event| {
            on_piece(match event {
                Event::Delta(text) => Piece::Delta { line: i, text },
                Event::Retry => Piece::Retry { line: i },
            });
            ControlFlow::Continue(())
        });
        match outcome {
            Outcome::Done(t) => out.push(t.text),
            Outcome::Cancelled => return Err(Stop::Cancelled),
            Outcome::Failed { .. } => return Err(Stop::Failed(errors::COMPOSE_FAILED)),
            Outcome::Unavailable(_) => return Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)),
        }
    }
    Ok(out.join("\n"))
}

#[cfg(test)]
mod tests {
    use pipeline::llama::{ChatRequest, StreamEnd};

    use super::*;

    /// Bộ dịch giả: "dịch" bằng cách viết hoa phần chữ sau dòng trống cuối của prompt (mẫu prompt kết thúc bằng `\n\n{text}`),
    /// stream từng từ. Dòng có chữ `HONG` thì mọi lần thử đều ra rỗng (hậu xử lý báo lỗi); dòng có chữ `SAP` thì server không
    /// dùng được nữa; `cancel_after` bật cờ hủy sau chừng ấy request.
    struct UpperMt<'a> {
        requests: usize,
        cancel_after: Option<(usize, &'a AtomicBool)>,
        counted: Vec<String>,
    }

    impl<'a> UpperMt<'a> {
        fn new() -> Self {
            Self {
                requests: 0,
                cancel_after: None,
                counted: Vec::new(),
            }
        }
    }

    impl Mt for UpperMt<'_> {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            self.counted.push(text.to_string());
            if text.contains("SAP") {
                return Err(MtError::Unavailable("sập".into()));
            }
            Ok(text.split_whitespace().count())
        }

        fn stream(
            &mut self,
            req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.requests += 1;
            if let Some((after, flag)) = self.cancel_after
                && self.requests > after
            {
                flag.store(true, Ordering::SeqCst);
            }
            let source = req.prompt.rsplit("\n\n").next().unwrap_or_default();
            let text = if source.contains("HONG") {
                String::new()
            } else {
                source.to_uppercase()
            };
            let words: Vec<String> = text.split_inclusive(' ').map(str::to_string).collect();
            for w in &words {
                if on_delta(w).is_break() {
                    break;
                }
            }
            Ok(StreamEnd {
                text: text.clone(),
                first_token_ms: 1.0,
                total_ms: 2.0,
                finish_reason: Some("stop".into()),
                completion_tokens: Some(words.len()),
                chunks: words.len(),
                cancelled: false,
            })
        }
    }

    fn run(mt: &mut UpperMt, text: &str, cancel: &AtomicBool) -> (Result<String, Stop>, Vec<String>) {
        let mut pieces = Vec::new();
        let result = translate_text(
            mt,
            &MtConfig::default(),
            text,
            MtLang::Vi,
            MtLang::En,
            cancel,
            &mut |piece| {
                pieces.push(match piece {
                    Piece::Delta { line, text } => format!("{line}:{text}"),
                    Piece::Retry { line } => format!("{line}:retry"),
                })
            },
        );
        (result, pieces)
    }

    #[test]
    fn each_line_is_translated_alone_and_blank_lines_are_kept() {
        let mut mt = UpperMt::new();
        let (result, pieces) = run(&mut mt, "xin chào\n\n  hẹn gặp lại  \n", &AtomicBool::new(false));
        assert_eq!(result, Ok("XIN CHÀO\n\nHẸN GẶP LẠI\n".to_string()));
        // Hậu xử lý giữ khoảng trắng cuối gói lại, tới gói sau mới hiện (§6.5: không để khoảng trắng thừa ở cuối).
        assert_eq!(pieces, ["0:XIN", "0: CHÀO", "2:HẸN", "2: GẶP", "2: LẠI"]);
        assert_eq!(mt.requests, 2, "dòng trống không gửi request");
    }

    #[test]
    fn every_line_is_counted_before_any_is_translated() {
        let mut mt = UpperMt::new();
        let long = vec!["từ"; MAX_LINE_TOKENS + 1].join(" ");
        let (result, pieces) = run(&mut mt, &format!("dòng đầu\n{long}"), &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_TOO_LONG)));
        assert!(pieces.is_empty(), "không dịch dở dòng nào");
        assert_eq!(mt.requests, 0);
        let exact = vec!["từ"; MAX_LINE_TOKENS].join(" ");
        assert!(run(&mut UpperMt::new(), &exact, &AtomicBool::new(false)).0.is_ok());
    }

    #[test]
    fn a_failed_line_fails_the_whole_text_without_the_source() {
        let (result, pieces) = run(&mut UpperMt::new(), "ổn\nHONG", &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_FAILED)));
        assert_eq!(
            pieces,
            ["0:ỔN", "1:retry"],
            "lần đầu hỏng thì báo thử lại cho đúng dòng"
        );
        let (result, _) = run(&mut UpperMt::new(), "SAP", &AtomicBool::new(false));
        assert_eq!(result, Err(Stop::Failed(errors::COMPOSE_UNAVAILABLE)));
    }

    #[test]
    fn a_cancel_stops_before_the_next_request() {
        let cancel = AtomicBool::new(true);
        let mut mt = UpperMt::new();
        assert_eq!(run(&mut mt, "một\nhai", &cancel).0, Err(Stop::Cancelled));
        assert_eq!(mt.requests, 0);
        let cancel = AtomicBool::new(false);
        let mut mt = UpperMt::new();
        mt.cancel_after = Some((1, &cancel));
        let (result, pieces) = run(&mut mt, "một\nhai", &cancel);
        assert_eq!(result, Err(Stop::Cancelled));
        assert_eq!(pieces, ["0:MỘT"], "dòng hai không hiện chữ nào");
    }

    #[test]
    fn whitespace_only_text_needs_no_request() {
        let mut mt = UpperMt::new();
        assert_eq!(
            run(&mut mt, " \n\t", &AtomicBool::new(false)).0,
            Ok(" \n\t".to_string())
        );
        assert!(mt.counted.is_empty() && mt.requests == 0);
    }
}
