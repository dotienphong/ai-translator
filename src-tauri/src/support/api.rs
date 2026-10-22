//! Gọi các đường `/v1/support/*` của license server (spec 2026-10-22-chat-ho-tro-zalo-design.md §2.2; hợp đồng ở kế hoạch
//! `2026-10-22-chat-ho-tro-00-tong-quan.md`). Cùng host, cùng địa chỉ production với `license::client` và báo cáo lỗi, nên
//! danh sách kết nối của A7 không thêm host nào. App không dùng `GET /v1/support/status`: chưa từng nhắn thì không kết nối gì cho
//! chat, kể cả khi mở màn hình Hỗ trợ; chat tắt thì biết qua `503` của tin đầu hay thân `GET messages`.
//!
//! Không theo redirect. Lỗi không bao giờ kèm URL, token hay nội dung tin. Request ghi luôn có `Content-Type: application/json`
//! và thân là object JSON (kể cả `DELETE`: `{}`). Token của cuộc chat đi trong `Authorization: Bearer`.

use std::time::Duration;

use reqwest::Method;
use serde::de::IgnoredAny;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::license::client::{PRODUCTION_URL, accept_base};

const USER_AGENT: &str = "AI-Translator";

/// Sau `429` chờ tối thiểu chừng này giây (hợp đồng phía khách), kể cả khi server không gửi `Retry-After` hay gửi số nhỏ hơn.
pub const MIN_RETRY_AFTER_SECS: u64 = 15;

/// Người gửi một tin.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Sender {
    Customer,
    Owner,
}

/// Một tin của cuộc chat. Server gửi `created_at`; giao diện nhận `createdAt` như mọi kiểu IPC.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportMessage {
    /// Tăng dần trong toàn hệ thống; dùng làm con trỏ `after`.
    pub id: i64,
    pub sender: Sender,
    pub text: String,
    /// Giây Unix.
    #[serde(alias = "created_at")]
    pub created_at: i64,
}

/// Kết quả của `GET /v1/support/messages`.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Batch {
    pub enabled: bool,
    /// `open`, hay `closed` khi chủ dự án đã chặn cuộc chat.
    pub status: String,
    pub messages: Vec<SupportMessage>,
}

/// Tin đầu tiên của một cuộc chat mới.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Opening {
    pub text: String,
    /// Ngôn ngữ giao diện: `vi`, `en`, `ja`, `zh`, `ko`.
    pub lang: &'static str,
    /// `app`, hay `app-debug` ở bản debug.
    pub source: &'static str,
    /// Dòng thông tin máy (`support::context`), chỉ khi khách để tích "Gửi kèm thông tin máy".
    pub context: Option<String>,
}

/// Cuộc chat vừa tạo: token (chỉ app giữ) và tin đầu tiên server đã lưu.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Started {
    pub token: String,
    pub message: SupportMessage,
}

/// Lỗi của một lần gọi, đã phân loại theo hợp đồng.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ApiError {
    #[error("bản build chưa có địa chỉ server")]
    NotConfigured,
    /// Mạng hỏng, `5xx` (trừ `503 support_disabled`), `404` (server chưa có các đường chat), hay response sai dạng.
    #[error("không gọi được server: {0}")]
    Network(String),
    /// `429 rate_limited`: số giây phải chờ, đã nâng lên tối thiểu [`MIN_RETRY_AFTER_SECS`].
    #[error("gửi quá nhanh, chờ {0} giây")]
    RateLimited(u64),
    /// `429 support_busy`: chạm trần toàn hệ thống.
    #[error("hỗ trợ đang quá tải, chờ {0} giây")]
    Busy(u64),
    /// `503 support_disabled`: chủ dự án đã tắt chat (`/tat`).
    #[error("chat đang tắt")]
    Disabled,
    /// `403 conversation_closed`: chủ dự án đã chặn cuộc chat (`/chan`).
    #[error("cuộc chat đã đóng")]
    Closed,
    /// `401 invalid_token`: token sai, hay cuộc chat đã bị xóa (khách tự xóa, hết 90 ngày).
    #[error("cuộc chat không còn trên server")]
    InvalidToken,
    /// `400`, `413`, `415`, `3xx` hay `4xx` khác: thân sai hay app gọi sai. Kèm `field` nếu server báo; app tự kiểm trước thì
    /// `status` là 0.
    #[error("bị từ chối: {status} {code}")]
    Invalid {
        status: u16,
        code: String,
        field: Option<String>,
    },
}

/// Nơi nhận tin. App thật là [`HttpSupportApi`]; test dùng bản giả (`test_support::FakeSupportApi`).
pub trait SupportApi: Send + Sync {
    /// `POST /v1/support/messages` không có token: tạo cuộc chat mới.
    fn start(&self, opening: &Opening) -> Result<Started, ApiError>;
    /// `POST /v1/support/messages` có token: thêm một tin vào cuộc chat.
    fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError>;
    /// `GET /v1/support/messages?after=<after>`: các tin có `id > after`.
    fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError>;
    /// `PUT /v1/support/email`: để lại email, hay `None` để bỏ.
    fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError>;
    /// `DELETE /v1/support/conversation`: xóa cuộc chat và mọi tin.
    fn delete(&self, token: &str) -> Result<(), ApiError>;
}

pub struct HttpSupportApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

#[derive(Deserialize)]
struct MessageBody {
    message: SupportMessage,
}

impl HttpSupportApi {
    /// Server của mọi bản build, debug lẫn phát hành: production.
    pub fn for_this_build() -> Self {
        Self::new(PRODUCTION_URL.and_then(|u| accept_base(u, false)))
    }

    pub fn new(base: Option<String>) -> Self {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        Self { base, client }
    }

    fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: Method,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> Result<T, ApiError> {
        let base = self.base.as_ref().ok_or(ApiError::NotConfigured)?;
        let mut req = self.client.request(method, format!("{base}{path}"));
        if let Some(token) = token {
            req = req.bearer_auth(token);
        }
        if let Some(body) = body {
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }
        // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn.
        let resp = req.send().map_err(|e| ApiError::Network(e.without_url().to_string()))?;
        let status = resp.status().as_u16();
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let bytes = resp
            .bytes()
            .map_err(|e| ApiError::Network(e.without_url().to_string()))?;
        if (200..300).contains(&status) {
            return serde_json::from_slice(&bytes).map_err(|e| ApiError::Network(format!("response sai dạng: {e}")));
        }
        Err(error_of(status, retry_after, &bytes))
    }
}

/// Phân loại một response lỗi theo mã trạng thái và `error` của thân (hợp đồng, bảng mã lỗi).
fn error_of(status: u16, retry_after: Option<u64>, body: &[u8]) -> ApiError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let code = v
        .get("error")
        .and_then(Value::as_str)
        .map_or_else(|| format!("http_{status}"), String::from);
    let wait = retry_after.unwrap_or(0).max(MIN_RETRY_AFTER_SECS);
    match (status, code.as_str()) {
        (429, "support_busy") => ApiError::Busy(wait),
        (429, _) => ApiError::RateLimited(wait),
        (503, "support_disabled") => ApiError::Disabled,
        (401, _) => ApiError::InvalidToken,
        (403, "conversation_closed") => ApiError::Closed,
        // Server chưa có các đường chat (chưa deploy bản có chat): với khách, như không gọi được.
        (404, _) => ApiError::Network("server trả 404".into()),
        (s, _) if s >= 500 => ApiError::Network(format!("server trả {s}")),
        _ => ApiError::Invalid {
            status,
            field: v.get("field").and_then(Value::as_str).map(String::from),
            code,
        },
    }
}

impl SupportApi for HttpSupportApi {
    fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
        let body = json!({
            "text": opening.text,
            "lang": opening.lang,
            "source": opening.source,
            "context": opening.context,
        });
        self.call(Method::POST, "/v1/support/messages", None, Some(body))
    }

    fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError> {
        self.call::<MessageBody>(
            Method::POST,
            "/v1/support/messages",
            Some(token),
            Some(json!({ "text": text })),
        )
        .map(|b| b.message)
    }

    fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError> {
        let path = format!("/v1/support/messages?after={}", after.max(0));
        self.call(Method::GET, &path, Some(token), None)
    }

    fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError> {
        self.call::<IgnoredAny>(
            Method::PUT,
            "/v1/support/email",
            Some(token),
            Some(json!({ "email": email })),
        )
        .map(drop)
    }

    fn delete(&self, token: &str) -> Result<(), ApiError> {
        self.call::<IgnoredAny>(Method::DELETE, "/v1/support/conversation", Some(token), Some(json!({})))
            .map(drop)
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    const TOKEN: &str = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456";

    /// Một request server giả đã nhận.
    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        /// Header, tên viết thường.
        headers: Vec<(String, String)>,
        body: String,
    }

    impl Seen {
        fn header(&self, name: &str) -> Option<&str> {
            self.headers.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
        }
        fn json(&self) -> Value {
            serde_json::from_str(&self.body).unwrap()
        }
    }

    /// Một response của server giả: mã, header thêm, thân.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server giả: trả lần lượt các response cho các request tới, giữ lại mọi request.
    fn serve(responses: Vec<Canned>) -> (String, Arc<Mutex<Vec<Seen>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = Arc::new(Mutex::new(Vec::new()));
        let log = seen.clone();
        std::thread::spawn(move || {
            for (status, headers, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let mut parts = line.split_whitespace();
                let mut req = Seen {
                    method: parts.next().unwrap_or_default().into(),
                    path: parts.next().unwrap_or_default().into(),
                    ..Seen::default()
                };
                let mut length = 0;
                loop {
                    let mut h = String::new();
                    reader.read_line(&mut h).unwrap();
                    let h = h.trim_end();
                    if h.is_empty() {
                        break;
                    }
                    let (name, value) = h.split_once(':').unwrap();
                    let name = name.to_ascii_lowercase();
                    if name == "content-length" {
                        length = value.trim().parse().unwrap();
                    }
                    req.headers.push((name, value.trim().to_string()));
                }
                let mut buf = vec![0; length];
                reader.read_exact(&mut buf).unwrap();
                req.body = String::from_utf8(buf).unwrap();
                log.lock().unwrap().push(req);
                let extra: String = headers.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    #[test]
    fn the_first_message_opens_a_conversation_without_token() {
        let (base, seen) = serve(vec![(
            201,
            vec![],
            r#"{"token":"abcdefghijklmnopqrstuvwxyzABCDEFGHIJ0123456","message":{"id":7,"sender":"customer","text":"Chào","created_at":1800000000}}"#,
        )]);
        let opening = Opening {
            text: "Chào".into(),
            lang: "vi",
            source: "app-debug",
            context: Some("AI Translator 0.2.4 · macOS 15.6".into()),
        };
        let started = HttpSupportApi::new(Some(base)).start(&opening).unwrap();
        assert_eq!(started.token, TOKEN);
        assert_eq!(
            started.message,
            SupportMessage {
                id: 7,
                sender: Sender::Customer,
                text: "Chào".into(),
                created_at: 1_800_000_000
            }
        );
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("POST", "/v1/support/messages")
        );
        assert_eq!(
            seen[0].header("authorization"),
            None,
            "chưa có cuộc chat thì không có token"
        );
        assert_eq!(seen[0].header("content-type"), Some("application/json"));
        assert_eq!(
            seen[0].json(),
            json!({ "text": "Chào", "lang": "vi", "source": "app-debug", "context": "AI Translator 0.2.4 · macOS 15.6" })
        );
    }

    #[test]
    fn later_messages_carry_the_token_and_only_the_text() {
        let (base, seen) = serve(vec![(
            201,
            vec![],
            r#"{"message":{"id":9,"sender":"customer","text":"Thêm","created_at":1800000100}}"#,
        )]);
        let message = HttpSupportApi::new(Some(base)).send(TOKEN, "Thêm").unwrap();
        assert_eq!(message.id, 9);
        let seen = seen.lock().unwrap();
        assert_eq!(
            seen[0].header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
        assert_eq!(seen[0].json(), json!({ "text": "Thêm" }));
    }

    #[test]
    fn polling_asks_for_messages_after_the_cursor() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"enabled":true,"status":"open","messages":[{"id":43,"sender":"owner","text":"Xin chào","created_at":1800000200}]}"#,
        )]);
        let batch = HttpSupportApi::new(Some(base)).messages(TOKEN, 42).unwrap();
        assert!(batch.enabled);
        assert_eq!(batch.status, "open");
        assert_eq!(batch.messages[0].sender, Sender::Owner);
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("GET", "/v1/support/messages?after=42")
        );
        assert_eq!(
            seen[0].header("authorization"),
            Some(format!("Bearer {TOKEN}").as_str())
        );
    }

    #[test]
    fn email_and_delete_send_json_objects() {
        let ok = (200, vec![], r#"{"ok":true}"#);
        let (base, seen) = serve(vec![ok.clone(), ok.clone(), ok]);
        let api = HttpSupportApi::new(Some(base));
        assert_eq!(api.set_email(TOKEN, Some("khach@example.com")), Ok(()));
        assert_eq!(api.set_email(TOKEN, None), Ok(()));
        assert_eq!(api.delete(TOKEN), Ok(()));
        let seen = seen.lock().unwrap();
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("PUT", "/v1/support/email")
        );
        assert_eq!(seen[0].json(), json!({ "email": "khach@example.com" }));
        assert_eq!(seen[1].json(), json!({ "email": null }));
        assert_eq!(
            (seen[2].method.as_str(), seen[2].path.as_str()),
            ("DELETE", "/v1/support/conversation")
        );
        assert_eq!(seen[2].header("content-type"), Some("application/json"));
        assert_eq!(seen[2].json(), json!({}));
        assert!(
            seen.iter()
                .all(|s| s.header("authorization") == Some(format!("Bearer {TOKEN}").as_str()))
        );
    }

    #[test]
    fn server_answers_map_to_the_contract_errors() {
        let (base, _) = serve(vec![
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (429, vec![("Retry-After", "3")], r#"{"error":"rate_limited"}"#),
            (429, vec![], r#"{"error":"support_busy"}"#),
            (503, vec![], r#"{"error":"support_disabled"}"#),
            (503, vec![], ""),
            (500, vec![], ""),
            (401, vec![], r#"{"error":"invalid_token"}"#),
            (403, vec![], r#"{"error":"conversation_closed"}"#),
            (400, vec![], r#"{"error":"invalid_request","field":"text"}"#),
            (415, vec![], r#"{"error":"unsupported_media_type"}"#),
            (404, vec![], "Not Found"),
            (302, vec![("Location", "https://nơi.khác/")], ""),
            (200, vec![], "không phải json"),
        ]);
        let api = HttpSupportApi::new(Some(base));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::RateLimited(120)));
        assert_eq!(
            api.send(TOKEN, "a"),
            Err(ApiError::RateLimited(15)),
            "tối thiểu 15 giây"
        );
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Busy(15)));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Disabled));
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "503 khác là lỗi tạm"
        );
        assert!(matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::InvalidToken));
        assert_eq!(api.send(TOKEN, "a"), Err(ApiError::Closed));
        assert_eq!(
            api.send(TOKEN, "a"),
            Err(ApiError::Invalid {
                status: 400,
                code: "invalid_request".into(),
                field: Some("text".into())
            })
        );
        assert!(matches!(
            api.send(TOKEN, "a"),
            Err(ApiError::Invalid { status: 415, .. })
        ));
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "404: server chưa có chat"
        );
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Invalid { status: 302, .. })),
            "không theo redirect"
        );
        assert!(
            matches!(api.send(TOKEN, "a"), Err(ApiError::Network(_))),
            "thân sai dạng"
        );
    }

    #[test]
    fn no_network_is_an_error_without_the_url_or_the_token() {
        // Cổng vừa đóng: kết nối bị từ chối.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let err = HttpSupportApi::new(Some(format!("http://127.0.0.1:{port}")))
            .send(TOKEN, "a")
            .unwrap_err();
        let ApiError::Network(message) = err else {
            panic!("{err:?}")
        };
        assert!(!message.contains("127.0.0.1") && !message.contains(TOKEN), "{message}");
    }

    #[test]
    fn an_unconfigured_build_never_calls() {
        assert_eq!(
            HttpSupportApi::new(None).messages(TOKEN, 0),
            Err(ApiError::NotConfigured)
        );
    }

    #[test]
    fn the_ui_receives_messages_in_camel_case() {
        let m = SupportMessage {
            id: 1,
            sender: Sender::Owner,
            text: "Chào".into(),
            created_at: 5,
        };
        assert_eq!(
            serde_json::to_value(&m).unwrap(),
            json!({ "id": 1, "sender": "owner", "text": "Chào", "createdAt": 5 })
        );
    }
}
