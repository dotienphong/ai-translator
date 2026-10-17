//! Gửi báo cáo lỗi tới `POST /v1/diagnostics` của license server (spec 2026-10-17-diagnostics-reports-design.md §3, §5). Cùng một
//! host với `license::client` (`api.`), cùng địa chỉ production, nên danh sách kết nối của A7 không thêm host nào.
//!
//! Không cần token. Không theo redirect. Lỗi không bao giờ kèm URL hay thân báo cáo. Phân loại kết quả cho nơi gọi:
//! - `Transient`: mạng hay `5xx`: thử lại ở lần mở sau (hàng đợi);
//! - `RateLimited`: `429`;
//! - `Rejected`: mọi `4xx` còn lại (và `3xx`): vĩnh viễn, bỏ báo cáo.

use std::time::Duration;

use serde_json::Value;

use crate::license::client::{PRODUCTION_URL, accept_base};

const USER_AGENT: &str = "AI-Translator";

/// Lỗi của một lần gửi.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum SendError {
    #[error("không gửi được (mạng hay server lỗi tạm): {0}")]
    Transient(String),
    /// `429`; số giây phải chờ nếu server báo.
    #[error("server bảo thử lại sau")]
    RateLimited(Option<u64>),
    #[error("server từ chối báo cáo: {status} {code}")]
    Rejected { status: u16, code: String },
}

/// Nơi nhận báo cáo. App thật là [`HttpReportApi`]; test dùng bản giả.
pub trait ReportApi: Send + Sync {
    /// Gửi thân JSON của một báo cáo nguyên văn.
    fn send(&self, body: &str) -> Result<(), SendError>;
}

pub struct HttpReportApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

impl HttpReportApi {
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
}

impl ReportApi for HttpReportApi {
    fn send(&self, body: &str) -> Result<(), SendError> {
        let Some(base) = &self.base else {
            return Err(SendError::Rejected {
                status: 0,
                code: "not_configured".into(),
            });
        };
        let response = self
            .client
            .post(format!("{base}/v1/diagnostics"))
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(body.to_string())
            .send()
            // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn.
            .map_err(|e| SendError::Transient(e.without_url().to_string()))?;
        let status = response.status().as_u16();
        let retry_after = response
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        if (200..300).contains(&status) {
            return Ok(());
        }
        if status == 429 {
            return Err(SendError::RateLimited(retry_after));
        }
        if status >= 500 {
            return Err(SendError::Transient(format!("server trả {status}")));
        }
        let code = response
            .bytes()
            .ok()
            .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
            .and_then(|v| v.get("error").and_then(Value::as_str).map(String::from))
            .unwrap_or_else(|| format!("http_{status}"));
        Err(SendError::Rejected { status, code })
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        content_type: Option<String>,
        body: String,
    }

    /// Một response của server giả: mã, header thêm, thân.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server giả: trả lần lượt các response cho các request tới.
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
                    match name.to_ascii_lowercase().as_str() {
                        "content-length" => length = value.trim().parse().unwrap(),
                        "content-type" => req.content_type = Some(value.trim().into()),
                        _ => {}
                    }
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
    fn a_report_is_posted_verbatim_as_json_to_the_diagnostics_route() {
        let (base, seen) = serve(vec![(202, vec![], r#"{"id":"R-7F3K-92QD"}"#)]);
        let body = r#"{"v":1,"id":"R-7F3K-92QD","message":"có dấu ế"}"#;
        assert_eq!(HttpReportApi::new(Some(base)).send(body), Ok(()));
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(
            (seen[0].method.as_str(), seen[0].path.as_str()),
            ("POST", "/v1/diagnostics")
        );
        assert_eq!(seen[0].content_type.as_deref(), Some("application/json"));
        assert_eq!(seen[0].body, body);
    }

    #[test]
    fn server_answers_map_to_the_three_outcomes() {
        let (base, _) = serve(vec![
            (429, vec![("Retry-After", "3600")], r#"{"error":"rate_limited"}"#),
            (429, vec![], r#"{"error":"rate_limited"}"#),
            (500, vec![], ""),
            (503, vec![], ""),
            (400, vec![], r#"{"error":"invalid_request","field":"logs"}"#),
            (413, vec![], r#"{"error":"invalid_request"}"#),
            (415, vec![], r#"{"error":"unsupported_media_type"}"#),
            (422, vec![], r#"{"error":"rejected_sensitive","rule":"home_path"}"#),
            (404, vec![], "không phải json"),
            (302, vec![("Location", "https://nơi.khác/")], ""),
        ]);
        let api = HttpReportApi::new(Some(base));
        assert_eq!(api.send("{}"), Err(SendError::RateLimited(Some(3600))));
        assert_eq!(api.send("{}"), Err(SendError::RateLimited(None)));
        assert!(matches!(api.send("{}"), Err(SendError::Transient(_))));
        assert!(matches!(api.send("{}"), Err(SendError::Transient(_))));
        let rejected = |status: u16, code: &str| {
            Err(SendError::Rejected {
                status,
                code: code.into(),
            })
        };
        assert_eq!(api.send("{}"), rejected(400, "invalid_request"));
        assert_eq!(api.send("{}"), rejected(413, "invalid_request"));
        assert_eq!(api.send("{}"), rejected(415, "unsupported_media_type"));
        assert_eq!(api.send("{}"), rejected(422, "rejected_sensitive"));
        assert_eq!(api.send("{}"), rejected(404, "http_404"));
        assert_eq!(api.send("{}"), rejected(302, "http_302"));
    }

    #[test]
    fn no_network_is_a_transient_error_without_the_url() {
        // Cổng vừa đóng: kết nối bị từ chối.
        let port = TcpListener::bind("127.0.0.1:0").unwrap().local_addr().unwrap().port();
        let err = HttpReportApi::new(Some(format!("http://127.0.0.1:{port}")))
            .send("{}")
            .unwrap_err();
        let SendError::Transient(message) = err else {
            panic!("{err:?}")
        };
        assert!(!message.contains("127.0.0.1"), "lỗi không kèm URL: {message}");
    }

    #[test]
    fn an_unconfigured_server_is_a_permanent_rejection() {
        assert_eq!(
            HttpReportApi::new(None).send("{}"),
            Err(SendError::Rejected {
                status: 0,
                code: "not_configured".into()
            })
        );
    }

    #[test]
    fn the_real_build_talks_only_to_the_production_api_host() {
        assert_eq!(PRODUCTION_URL, Some("https://api.aitranslator.io.vn"));
    }
}
