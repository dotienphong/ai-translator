//! Đọc từng dòng Server-Sent Events của `/v1/chat/completions` với `stream: true`.

use anyhow::{Context, Result, bail};

#[derive(Debug, PartialEq, Eq)]
pub enum SseEvent {
    /// Phần chữ mới của bản dịch (có thể rỗng), kèm `finish_reason` nếu đây là gói cuối.
    Delta {
        content: String,
        finish_reason: Option<String>,
    },
    Done,
    /// Dòng trống, comment hoặc trường khác `data`.
    Ignore,
}

pub fn parse_sse_line(line: &str) -> Result<SseEvent> {
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(SseEvent::Ignore);
    };
    let data = data.trim();
    if data == "[DONE]" {
        return Ok(SseEvent::Done);
    }
    let value: serde_json::Value =
        serde_json::from_str(data).with_context(|| format!("dòng SSE không phải JSON: {data:.200}"))?;
    if let Some(err) = value.get("error") {
        bail!("llama-server báo lỗi: {err}");
    }
    let choice = &value["choices"][0];
    Ok(SseEvent::Delta {
        content: choice["delta"]["content"].as_str().unwrap_or_default().to_string(),
        finish_reason: choice["finish_reason"].as_str().map(String::from),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_delta() {
        let line = r#"data: {"choices":[{"index":0,"delta":{"content":"Xin"}}]}"#;
        let want = SseEvent::Delta {
            content: "Xin".into(),
            finish_reason: None,
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
    }

    #[test]
    fn finish_chunk_has_empty_delta_and_reason() {
        let line = r#"data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        let want = SseEvent::Delta {
            content: String::new(),
            finish_reason: Some("stop".into()),
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
    }

    #[test]
    fn data_without_space_and_null_content() {
        let line = r#"data:{"choices":[{"delta":{"role":"assistant","content":null}}]}"#;
        let want = SseEvent::Delta {
            content: String::new(),
            finish_reason: None,
        };
        assert_eq!(parse_sse_line(line).unwrap(), want);
        assert_eq!(parse_sse_line("data:[DONE]\r").unwrap(), SseEvent::Done);
    }

    #[test]
    fn parses_done_and_ignores_other_lines() {
        assert_eq!(parse_sse_line("data: [DONE]").unwrap(), SseEvent::Done);
        assert_eq!(parse_sse_line("").unwrap(), SseEvent::Ignore);
        assert_eq!(parse_sse_line(": keep-alive").unwrap(), SseEvent::Ignore);
    }

    #[test]
    fn server_error_and_bad_json_are_errors() {
        assert!(parse_sse_line(r#"data: {"error":{"code":500,"message":"boom"}}"#).is_err());
        assert!(parse_sse_line("data: {\"choices\":[").is_err());
    }
}
