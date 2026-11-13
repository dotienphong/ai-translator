//! Engine ghi chú chạy trên cloud (ChatGPT hoặc Gemini) bằng khóa API của người dùng. Gọi chặn, không stream.
//! Bản chép lời và câu trả lời chỉ đi qua đây tới nhà cung cấp người dùng đã chọn; không ghi vào log hay giá trị lỗi.

use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::{Value, json};

use super::engine::{Limits, NotesEngine, NotesError, NotesRequest, Role};
use crate::settings::NotesProvider;

const OPENAI_BASE: &str = "https://api.openai.com";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com";
const DEEPSEEK_BASE: &str = "https://api.deepseek.com";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(120);
/// Chặn trên cỡ phản hồi đọc vào bộ nhớ: máy chủ không đáng tin tới mức cho phép nó đẩy dữ liệu vô hạn.
const MAX_REPLY_BYTES: u64 = 8 * 1024 * 1024;
/// Chỉ đọc đầu thân phản hồi lỗi 400 của Gemini tới chừng này để nhận ra khóa sai; không bao giờ đọc hết.
const MAX_ERROR_PROBE_BYTES: u64 = 4 * 1024;
/// Lý do Gemini ghi trong `error.details` khi khóa API sai hay đã bị thu hồi (kèm HTTP 400, không phải 401/403).
const GEMINI_KEY_INVALID_REASON: &[u8] = b"API_KEY_INVALID";

/// Engine ghi chú qua cloud. Không `derive(Debug)`: `Debug` viết tay và che khóa API.
pub struct CloudNotes {
    provider: NotesProvider,
    model: String,
    api_key: String,
    base: String,
    http: reqwest::blocking::Client,
}

impl std::fmt::Debug for CloudNotes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CloudNotes")
            .field("provider", &self.provider)
            .field("model", &self.model)
            .field("api_key", &"<đã che>")
            .field("base", &self.base)
            .finish()
    }
}

impl CloudNotes {
    /// `Local` không phải cloud nên trả `Engine`; khóa rỗng trả `KeyMissing`.
    pub fn new(provider: NotesProvider, model: &str, api_key: String) -> Result<Self, NotesError> {
        let base = match provider {
            NotesProvider::Local => return Err(NotesError::Engine("nhà cung cấp cloud không hợp lệ".into())),
            NotesProvider::Openai => OPENAI_BASE,
            NotesProvider::Gemini => GEMINI_BASE,
            NotesProvider::Deepseek => DEEPSEEK_BASE,
        };
        if api_key.trim().is_empty() {
            return Err(NotesError::KeyMissing);
        }
        // Không theo chuyển hướng: khóa API nằm trong header, không được gửi sang địa chỉ khác.
        let http = reqwest::blocking::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| NotesError::Engine("không khởi tạo được HTTP client".into()))?;
        Ok(Self {
            provider,
            model: model.into(),
            api_key,
            base: base.into(),
            http,
        })
    }

    /// Đổi địa chỉ gốc (chỉ test dùng, để trỏ vào server giả).
    #[cfg(test)]
    pub fn with_base(mut self, base: &str) -> Self {
        self.base = base.trim_end_matches('/').into();
        self
    }

    fn openai_request(&self, req: &NotesRequest) -> reqwest::blocking::RequestBuilder {
        // Như `cloud_mt`: tên hiển thị `chatgpt-4o-mini` gửi đi là `gpt-4o-mini`.
        let model = if self.model == "chatgpt-4o-mini" {
            "gpt-4o-mini"
        } else {
            self.model.as_str()
        };
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| json!({ "role": role_name(m.role, "assistant"), "content": m.content }))
            .collect();
        let body = json!({
            "model": model,
            "messages": messages,
            "temperature": 0.0,
            "max_tokens": req.max_tokens,
            "response_format": { "type": "json_object" },
        });
        self.http
            .post(format!("{}/v1/chat/completions", self.base))
            .bearer_auth(&self.api_key)
            .json(&body)
    }

    /// DeepSeek nhận kiểu OpenAI; mặc định nó bật chế độ suy luận (chậm và ăn `max_tokens`), nên luôn tắt như `cloud_mt`.
    fn deepseek_request(&self, req: &NotesRequest) -> reqwest::blocking::RequestBuilder {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| json!({ "role": role_name(m.role, "assistant"), "content": m.content }))
            .collect();
        let body = json!({
            "model": self.model,
            "messages": messages,
            "temperature": 0.0,
            "max_tokens": req.max_tokens,
            "response_format": { "type": "json_object" },
            "thinking": { "type": "disabled" },
        });
        self.http
            .post(format!("{}/chat/completions", self.base))
            .bearer_auth(&self.api_key)
            .json(&body)
    }

    fn gemini_request(&self, req: &NotesRequest) -> reqwest::blocking::RequestBuilder {
        let contents: Vec<Value> = req
            .messages
            .iter()
            .map(|m| json!({ "role": role_name(m.role, "model"), "parts": [{ "text": m.content }] }))
            .collect();
        let mut generation = json!({
            "temperature": 0.0,
            "maxOutputTokens": req.max_tokens,
            "responseMimeType": "application/json",
        });
        // Gemini 3.x: token suy nghĩ tính vào `maxOutputTokens` và làm cụt JSON, nên hạ mức suy nghĩ xuống thấp nhất
        // (cùng phép thử tên model với `cloud_mt`). Model khác không gửi `thinkingConfig`.
        if (self.model.contains("3.1") || self.model.contains("3.5"))
            && let Some(obj) = generation.as_object_mut()
        {
            obj.insert("thinkingConfig".into(), json!({ "thinkingLevel": "MINIMAL" }));
        }
        let body = json!({ "contents": contents, "generationConfig": generation });
        self.http
            .post(format!("{}/v1beta/models/{}:generateContent", self.base, self.model))
            .header("x-goog-api-key", &self.api_key)
            .json(&body)
    }
}

/// Tên vai gửi nhà cung cấp: `assistant_name` là tên vai của model ("assistant" ở OpenAI, "model" ở Gemini).
fn role_name(role: Role, assistant_name: &'static str) -> &'static str {
    match role {
        Role::User => "user",
        Role::Assistant => assistant_name,
    }
}

/// Mã HTTP lỗi thành `NotesError`. Chỉ nhìn mã; ngoại lệ duy nhất là 400 của Gemini, xem `gemini_rejects_key`.
fn error_for_status(status: u16) -> NotesError {
    match status {
        401 | 403 => NotesError::AuthFailed,
        402 => NotesError::NoBalance,
        429 => NotesError::RateLimited,
        other => NotesError::Cloud(other),
    }
}

/// Gemini trả 400 (không phải 401/403) cho khóa sai: lý do nằm trong thân. Chỉ đọc tối đa `MAX_ERROR_PROBE_BYTES` đầu
/// và chỉ tìm dấu hiệu `API_KEY_INVALID`; nội dung thân không được giữ, ghi log hay đưa vào lỗi. Lỗi đọc thì coi như không thấy.
fn gemini_rejects_key(resp: reqwest::blocking::Response) -> bool {
    let mut head = Vec::new();
    if resp.take(MAX_ERROR_PROBE_BYTES).read_to_end(&mut head).is_err() {
        return false;
    }
    head.windows(GEMINI_KEY_INVALID_REASON.len())
        .any(|w| w == GEMINI_KEY_INVALID_REASON)
}

/// Chữ của câu trả lời OpenAI: `choices[0].message.content`.
fn openai_text(v: &Value) -> Option<String> {
    let content = v.get("choices")?.get(0)?.get("message")?.get("content")?;
    content.as_str().map(str::to_owned)
}

/// Chữ của câu trả lời Gemini: nối mọi `candidates[0].content.parts[].text`.
fn gemini_text(v: &Value) -> Option<String> {
    let parts = v.get("candidates")?.get(0)?.get("content")?.get("parts")?.as_array()?;
    let mut text = String::new();
    for part in parts {
        if let Some(t) = part.get("text").and_then(Value::as_str) {
            text.push_str(t);
        }
    }
    Some(text)
}

impl NotesEngine for CloudNotes {
    fn limits(&self) -> Limits {
        Limits {
            budget: 60_000,
            max_map: 4_000,
            max_reduce: 4_000,
        }
    }

    /// Ước lượng thô, không cần tokenizer của nhà cung cấp: hai ký tự một token, ít nhất một.
    fn count_tokens(&self, text: &str) -> usize {
        text.chars().count().div_ceil(2).max(1)
    }

    fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError> {
        if cancel.load(Ordering::Relaxed) {
            return Err(NotesError::Cancelled);
        }
        let builder = match self.provider {
            NotesProvider::Openai => self.openai_request(req),
            NotesProvider::Gemini => self.gemini_request(req),
            NotesProvider::Deepseek => self.deepseek_request(req),
            NotesProvider::Local => return Err(NotesError::Engine("nhà cung cấp cloud không hợp lệ".into())),
        };
        // Lỗi gửi hay quá hạn: không ghi nội dung lỗi (có thể chứa địa chỉ).
        let resp = builder.send().map_err(|_| NotesError::Offline)?;
        let status = resp.status();
        if !status.is_success() {
            if status.as_u16() == 400 && self.provider == NotesProvider::Gemini && gemini_rejects_key(resp) {
                return Err(NotesError::AuthFailed);
            }
            return Err(error_for_status(status.as_u16()));
        }
        let mut raw = Vec::new();
        resp.take(MAX_REPLY_BYTES)
            .read_to_end(&mut raw)
            .map_err(|_| NotesError::Offline)?;
        let value: Value = serde_json::from_slice(&raw).map_err(|_| NotesError::BadResponse)?;
        let text = match self.provider {
            NotesProvider::Gemini => gemini_text(&value),
            _ => openai_text(&value),
        };
        match text {
            Some(t) if !t.trim().is_empty() => Ok(t),
            _ => Err(NotesError::BadResponse),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::license::client::tests::serve;
    use crate::notes::engine::Message;

    fn req() -> NotesRequest {
        let m = |role, content: &str| Message {
            role,
            content: content.into(),
        };
        NotesRequest {
            messages: vec![m(Role::User, "p"), m(Role::Assistant, "a"), m(Role::User, "f")],
            max_tokens: 800,
        }
    }

    fn openai(base: &str) -> CloudNotes {
        CloudNotes::new(NotesProvider::Openai, "gpt-4o-mini", "sk-test".into())
            .unwrap()
            .with_base(base)
    }

    fn gemini(model: &str, base: &str) -> CloudNotes {
        CloudNotes::new(NotesProvider::Gemini, model, "g-test".into())
            .unwrap()
            .with_base(base)
    }

    #[test]
    fn openai_request_and_reply() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"choices":[{"message":{"content":"{\"summary\":\"s\"}"}}]}"#,
        )]);
        let e = CloudNotes::new(NotesProvider::Openai, "chatgpt-4o-mini", "sk-test".into())
            .unwrap()
            .with_base(&base);
        assert_eq!(
            e.generate(&req(), &AtomicBool::new(false)).unwrap(),
            r#"{"summary":"s"}"#
        );
        let s = &seen.lock().unwrap()[0];
        assert_eq!(
            (s.method.as_str(), s.path.as_str(), s.authorization.as_deref()),
            ("POST", "/v1/chat/completions", Some("Bearer sk-test"))
        );
        assert_eq!(
            (
                &s.body["model"],
                &s.body["temperature"],
                &s.body["max_tokens"],
                &s.body["response_format"]["type"]
            ),
            (&json!("gpt-4o-mini"), &json!(0.0), &json!(800), &json!("json_object"))
        );
        assert_eq!(s.body["messages"][1], json!({ "role": "assistant", "content": "a" }));
        assert!(s.body.get("stream").is_none());
    }

    #[test]
    fn deepseek_request_disables_thinking_and_reply_is_read_like_openai() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"choices":[{"message":{"content":"{\"summary\":\"s\"}"}}]}"#,
        )]);
        let e = CloudNotes::new(NotesProvider::Deepseek, "deepseek-flash", "ds-test".into())
            .unwrap()
            .with_base(&base);
        assert_eq!(
            e.generate(&req(), &AtomicBool::new(false)).unwrap(),
            r#"{"summary":"s"}"#
        );
        let s = &seen.lock().unwrap()[0];
        assert_eq!(
            (s.method.as_str(), s.path.as_str(), s.authorization.as_deref()),
            ("POST", "/chat/completions", Some("Bearer ds-test"))
        );
        assert_eq!(
            (&s.body["model"], &s.body["thinking"]["type"], &s.body["response_format"]["type"]),
            (&json!("deepseek-flash"), &json!("disabled"), &json!("json_object"))
        );
        assert_eq!(s.body["messages"][1], json!({ "role": "assistant", "content": "a" }));
        assert!(s.body.get("stream").is_none());
    }

    #[test]
    fn openai_request_never_carries_the_deepseek_thinking_field() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"choices":[{"message":{"content":"x"}}]}"#,
        )]);
        assert_eq!(openai(&base).generate(&req(), &AtomicBool::new(false)).unwrap(), "x");
        assert!(seen.lock().unwrap()[0].body.get("thinking").is_none());
    }

    #[test]
    fn gemini_request_and_reply() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"candidates":[{"content":{"parts":[{"text":"{\"a\""},{"text":":1}"}]}}]}"#,
        )]);
        let e = gemini("gemini-3.1-flash-lite", &base);
        assert_eq!(e.generate(&req(), &AtomicBool::new(false)).unwrap(), r#"{"a":1}"#);
        let s = &seen.lock().unwrap()[0];
        assert_eq!(s.path, "/v1beta/models/gemini-3.1-flash-lite:generateContent");
        assert_eq!(
            (
                &s.body["contents"][1]["role"],
                &s.body["contents"][1]["parts"][0]["text"]
            ),
            (&json!("model"), &json!("a"))
        );
        assert_eq!(
            (
                &s.body["generationConfig"]["responseMimeType"],
                &s.body["generationConfig"]["maxOutputTokens"]
            ),
            (&json!("application/json"), &json!(800))
        );
        // Gemini 3.x: token suy nghĩ tính vào maxOutputTokens nên phải hạ mức suy nghĩ xuống thấp nhất.
        assert_eq!(
            s.body["generationConfig"]["thinkingConfig"]["thinkingLevel"],
            json!("MINIMAL")
        );
    }

    #[test]
    fn gemini_non_3x_model_sends_no_thinking_config() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"candidates":[{"content":{"parts":[{"text":"x"}]}}]}"#,
        )]);
        let e = gemini("gemini-2.5-flash", &base);
        assert_eq!(e.generate(&req(), &AtomicBool::new(false)).unwrap(), "x");
        let s = &seen.lock().unwrap()[0];
        assert_eq!(s.path, "/v1beta/models/gemini-2.5-flash:generateContent");
        assert!(s.body["generationConfig"].get("thinkingConfig").is_none());
    }

    #[test]
    fn statuses_map_to_errors_without_reading_the_body() {
        for (status, want) in [
            (401, NotesError::AuthFailed),
            (403, NotesError::AuthFailed),
            (402, NotesError::NoBalance),
            (429, NotesError::RateLimited),
            (500, NotesError::Cloud(500)),
            (200, NotesError::BadResponse),
        ] {
            let (base, _) = serve(vec![(status, vec![], r#"{"error":"echo sk-test"}"#)]);
            let e = CloudNotes::new(NotesProvider::Openai, "gpt-4o-mini", "sk-test".into())
                .unwrap()
                .with_base(&base);
            let err = e.generate(&req(), &AtomicBool::new(false)).unwrap_err();
            assert_eq!(err, want);
            assert!(!format!("{err:?}").contains("sk-test"));
        }
    }

    /// Phản hồi 400 mẫu của Gemini khi khóa sai hay đã bị thu hồi.
    const GEMINI_BAD_KEY: &str = r#"{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"API_KEY_INVALID","domain":"googleapis.com"}]}}"#;

    fn gemini_err(status: u16, body: &'static str) -> NotesError {
        let (base, _) = serve(vec![(status, vec![], body)]);
        gemini("gemini-2.5-flash", &base)
            .generate(&req(), &AtomicBool::new(false))
            .unwrap_err()
    }

    #[test]
    fn gemini_400_with_api_key_invalid_is_auth_failed() {
        let err = gemini_err(400, GEMINI_BAD_KEY);
        assert_eq!(err, NotesError::AuthFailed);
        assert!(!format!("{err:?}").contains("g-test"));
    }

    #[test]
    fn gemini_other_400_keeps_the_cloud_status() {
        let body = r#"{"error":{"code":400,"message":"Invalid JSON payload","status":"INVALID_ARGUMENT"}}"#;
        assert_eq!(gemini_err(400, body), NotesError::Cloud(400));
        assert_eq!(gemini_err(400, ""), NotesError::Cloud(400));
    }

    #[test]
    fn gemini_non_400_never_reads_the_marker() {
        assert_eq!(gemini_err(500, GEMINI_BAD_KEY), NotesError::Cloud(500));
    }

    #[test]
    fn gemini_400_body_is_read_only_up_to_the_cap() {
        // Dấu hiệu nằm trong 4 KiB đầu của một thân lớn: vẫn nhận ra.
        let inside: &'static str = Box::leak(format!("{GEMINI_BAD_KEY}{}", " ".repeat(64 * 1024)).into_boxed_str());
        assert_eq!(gemini_err(400, inside), NotesError::AuthFailed);
        // Dấu hiệu nằm sau 4 KiB: không được đọc tới, giữ ánh xạ cũ.
        let beyond: &'static str = Box::leak(format!("{}{GEMINI_BAD_KEY}", " ".repeat(8 * 1024)).into_boxed_str());
        assert_eq!(gemini_err(400, beyond), NotesError::Cloud(400));
    }

    #[test]
    fn openai_400_is_unchanged_even_with_the_marker() {
        let (base, _) = serve(vec![(400, vec![], GEMINI_BAD_KEY)]);
        let err = openai(&base).generate(&req(), &AtomicBool::new(false)).unwrap_err();
        assert_eq!(err, NotesError::Cloud(400));
    }

    #[test]
    fn redirect_is_not_followed_and_maps_to_cloud_status() {
        let (base, seen) = serve(vec![(302, vec![("Location", "http://127.0.0.1:9/x")], "")]);
        let err = openai(&base).generate(&req(), &AtomicBool::new(false)).unwrap_err();
        assert_eq!(err, NotesError::Cloud(302));
        assert_eq!(seen.lock().unwrap().len(), 1);
    }

    #[test]
    fn openai_200_without_text_is_bad_response() {
        for body in [
            "{}",
            r#"{"choices":[]}"#,
            r#"{"choices":[{}]}"#,
            r#"{"choices":[{"message":{"content":""}}]}"#,
        ] {
            let (base, _) = serve(vec![(200, vec![], body)]);
            let err = openai(&base).generate(&req(), &AtomicBool::new(false)).unwrap_err();
            assert_eq!(err, NotesError::BadResponse, "{body}");
        }
    }

    #[test]
    fn gemini_200_without_text_is_bad_response() {
        for body in [
            r#"{"candidates":[]}"#,
            r#"{"candidates":[{}]}"#,
            r#"{"candidates":[{"content":{"parts":[{}]}}]}"#,
            "{}",
        ] {
            let (base, _) = serve(vec![(200, vec![], body)]);
            let err = gemini("gemini-2.5-flash", &base)
                .generate(&req(), &AtomicBool::new(false))
                .unwrap_err();
            assert_eq!(err, NotesError::BadResponse, "{body}");
        }
    }

    #[test]
    fn offline_and_cancelled() {
        let e = CloudNotes::new(NotesProvider::Openai, "gpt-4o-mini", "k".into())
            .unwrap()
            .with_base("http://127.0.0.1:9");
        assert_eq!(
            e.generate(&req(), &AtomicBool::new(false)).unwrap_err(),
            NotesError::Offline
        );
        assert_eq!(
            e.generate(&req(), &AtomicBool::new(true)).unwrap_err(),
            NotesError::Cancelled
        );
    }

    #[test]
    fn new_rejects_local_and_empty_key_and_debug_hides_key() {
        let err = CloudNotes::new(NotesProvider::Local, "m", "k".into()).err().unwrap();
        assert!(matches!(err, NotesError::Engine(_)));
        let err = CloudNotes::new(NotesProvider::Openai, "m", String::new())
            .err()
            .unwrap();
        assert_eq!(err, NotesError::KeyMissing);
        assert!(!format!("{:?}", openai("http://x")).contains("sk-test"));
    }

    #[test]
    fn limits_and_token_count() {
        let e = openai("http://x");
        assert_eq!(
            e.limits(),
            Limits {
                budget: 60_000,
                max_map: 4_000,
                max_reduce: 4_000
            }
        );
        assert_eq!(e.count_tokens(""), 1);
        assert_eq!(e.count_tokens("abc"), 2);
        assert_eq!(e.count_tokens("điều"), 2);
    }
}
