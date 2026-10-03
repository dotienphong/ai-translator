//! Client của license server (spec §6.8 "API của license server", "Trong app: interface `LicenseProvider`"; hợp đồng ở
//! mục "Hợp đồng API cho kế hoạch 06" của kế hoạch 05). Gọi từ phía Rust (server không bật CORS), bằng `reqwest` đồng bộ
//! trên luồng nền, TLS và proxy của hệ điều hành.
//!
//! - Chỉ `https`, không theo redirect. Bản debug cho thêm `http://127.0.0.1` và `http://localhost` (chạy `wrangler dev`
//!   cục bộ) qua biến `AI_TRANSLATOR_LICENSE_URL`.
//! - Mọi response (cả lỗi) đưa header `Date` cho nơi gọi, làm mốc "đồng hồ thật" của Free (§6.8).
//! - `429` mang `Retry-After` (giây); app báo "thử lại sau", không thử lại liên tục. `429` ở `activate` không có nghĩa là
//!   key sai (§10.2, CGNAT).
//! - Không ghi key, token hay email vào log.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

/// Địa chỉ license server của từng môi trường. Điền sau khi triển khai (kế hoạch 05, Task 19 cho staging, Task 21 cho
/// production; tên miền chờ T7). Chưa có thì app chỉ dùng được token đã lưu và gói Free.
pub const STAGING_URL: Option<&str> = None;
pub const PRODUCTION_URL: Option<&str> = None;
/// Bản debug: trỏ sang server khác (ví dụ `http://127.0.0.1:8787` của `wrangler dev`).
pub const URL_ENV: &str = "AI_TRANSLATOR_LICENSE_URL";
const USER_AGENT: &str = "AI-Translator";

/// Lỗi của một lần gọi server.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ApiError {
    #[error("chưa cấu hình địa chỉ license server")]
    NotConfigured,
    #[error("lỗi mạng: {0}")]
    Network(String),
    /// Server trả lỗi `{"error": "<mã>", …}`.
    #[error("server trả {0}")]
    Server(ServerError),
    #[error("response sai dạng: {0}")]
    Decode(String),
}

/// Lỗi có mã của server, cùng các trường đi kèm mà app dùng.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ServerError {
    pub status: u16,
    pub code: String,
    /// `429`: số giây phải chờ.
    pub retry_after: Option<u64>,
    /// `409 device_limit`: các máy đang kích hoạt.
    pub devices: Vec<Device>,
    /// `403 license_expired`.
    pub expires_at: Option<i64>,
    /// `400 invalid_request`: trường sai.
    pub field: Option<String>,
}

impl std::fmt::Display for ServerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} {}", self.status, self.code)
    }
}

/// Một máy đã kích hoạt, trong `409 device_limit`. `device_label` có thể là `null` (ví dụ sau khi admin xóa dữ liệu cá
/// nhân): giao diện hiện tên thay thế.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Device {
    pub activation_id: String,
    pub device_label: Option<String>,
    pub last_validated_at: Option<i64>,
}

/// Token server vừa cấp (`activate`, `validate`). App tự đọc mọi trường từ token đã kiểm chữ ký; `quota_fresh` của
/// response này là nơi duy nhất app tin cờ đó (spec §6.8).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Granted {
    pub token: String,
    pub activation_id: String,
    pub quota_fresh: bool,
}

/// Một gói đang bán (`GET /v1/plans`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct PlanOffer {
    pub code: String,
    pub name: String,
    pub quota_minutes_per_cycle: Option<u32>,
    pub days_per_order: u32,
    pub prices: std::collections::BTreeMap<String, i64>,
}

/// Đơn vừa tạo (`POST /v1/checkout`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Checkout {
    pub order_code: i64,
    pub order_token: String,
    pub checkout_url: String,
    pub qr_code: String,
    pub plan: String,
    pub amount: i64,
    pub currency: String,
    pub expires_at: i64,
    pub license_expires_at: Option<i64>,
    pub converted_days: Option<i64>,
}

/// Trạng thái đơn (`GET /v1/orders/{order_code}`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct OrderStatus {
    pub order_code: i64,
    pub status: String,
    pub plan: String,
    pub expires_at: i64,
    pub license_key: Option<String>,
    pub license_plan: Option<String>,
    pub license_expires_at: Option<i64>,
    pub grant_kind: Option<String>,
}

/// Một response: kết quả, cùng header `Date` (giây Unix) nếu đọc được.
pub struct Reply<T> {
    pub result: Result<T, ApiError>,
    pub date: Option<i64>,
}

/// Các lệnh của license server mà app dùng (spec §6.8). App thật là [`HttpApi`]; test dùng bản giả.
pub trait LicenseApi: Send + Sync {
    fn plans(&self) -> Reply<Vec<PlanOffer>>;
    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout>;
    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus>;
    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted>;
    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted>;
    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()>;
    fn recover(&self, email: &str) -> Reply<()>;
}

/// Client HTTP thật.
pub struct HttpApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

/// URL gốc được nhận: `https://…`, hay (`allow_http`) `http://127.0.0.1…`, `http://localhost…`.
pub fn accept_base(url: &str, allow_http: bool) -> Option<String> {
    let url = url.trim_end_matches('/');
    let parsed = reqwest::Url::parse(url).ok()?;
    let ok = match parsed.scheme() {
        "https" => true,
        "http" => allow_http && matches!(parsed.host_str(), Some("127.0.0.1" | "localhost")),
        _ => false,
    };
    (ok && parsed.query().is_none()).then(|| url.to_string())
}

impl HttpApi {
    /// Server của bản build này: debug là staging (hay `AI_TRANSLATOR_LICENSE_URL`), phát hành là production.
    pub fn for_this_build() -> Self {
        let base = if cfg!(debug_assertions) {
            std::env::var(URL_ENV)
                .ok()
                .and_then(|u| accept_base(&u, true))
                .or_else(|| STAGING_URL.and_then(|u| accept_base(u, false)))
        } else {
            PRODUCTION_URL.and_then(|u| accept_base(u, false))
        };
        Self::new(base)
    }

    pub fn new(base: Option<String>) -> Self {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(20))
            .build()
            .unwrap_or_else(|_| reqwest::blocking::Client::new());
        Self { base, client }
    }

    pub fn configured(&self) -> bool {
        self.base.is_some()
    }

    fn call<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        path: &str,
        body: Option<Value>,
        bearer: Option<&str>,
    ) -> Reply<T> {
        let Some(base) = &self.base else {
            return Reply {
                result: Err(ApiError::NotConfigured),
                date: None,
            };
        };
        let url = format!("{base}{path}");
        let mut req = match method {
            "GET" => self.client.get(&url),
            _ => self.client.post(&url),
        };
        if let Some(body) = body {
            req = req
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body.to_string());
        }
        if let Some(token) = bearer {
            req = req.bearer_auth(token);
        }
        let resp = match req.send() {
            Ok(r) => r,
            Err(e) => {
                return Reply {
                    // Không kèm URL: lỗi của reqwest có thể chứa đường dẫn có `order_code`.
                    result: Err(ApiError::Network(e.without_url().to_string())),
                    date: None,
                };
            }
        };
        let date = resp
            .headers()
            .get(reqwest::header::DATE)
            .and_then(|v| v.to_str().ok())
            .and_then(parse_http_date);
        let status = resp.status().as_u16();
        let retry_after = resp
            .headers()
            .get(reqwest::header::RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.trim().parse::<u64>().ok());
        let bytes = match resp.bytes() {
            Ok(b) => b,
            Err(e) => {
                return Reply {
                    result: Err(ApiError::Network(e.without_url().to_string())),
                    date,
                };
            }
        };
        let result = if (200..300).contains(&status) {
            serde_json::from_slice::<T>(&bytes).map_err(|e| ApiError::Decode(e.to_string()))
        } else {
            Err(ApiError::Server(server_error(status, retry_after, &bytes)))
        };
        Reply { result, date }
    }
}

/// Header `Date` (IMF-fixdate, cũng là dạng RFC 2822) ra giây Unix.
pub fn parse_http_date(value: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc2822(value.trim())
        .ok()
        .map(|d| d.timestamp())
}

fn server_error(status: u16, retry_after: Option<u64>, body: &[u8]) -> ServerError {
    let v: Value = serde_json::from_slice(body).unwrap_or(Value::Null);
    let devices = v
        .get("activations")
        .cloned()
        .and_then(|a| serde_json::from_value::<Vec<Device>>(a).ok())
        .unwrap_or_default();
    ServerError {
        status,
        code: v
            .get("error")
            .and_then(Value::as_str)
            .map_or_else(|| format!("http_{status}"), String::from),
        retry_after,
        devices,
        expires_at: v.get("expires_at").and_then(Value::as_i64),
        field: v.get("field").and_then(Value::as_str).map(String::from),
    }
}

#[derive(Deserialize)]
struct Ok200 {}

#[derive(Deserialize)]
struct PlansBody {
    plans: Vec<PlanOffer>,
}

fn unit<T>(reply: Reply<T>) -> Reply<()> {
    Reply {
        result: reply.result.map(|_| ()),
        date: reply.date,
    }
}

impl LicenseApi for HttpApi {
    fn plans(&self) -> Reply<Vec<PlanOffer>> {
        let r: Reply<PlansBody> = self.call("GET", "/v1/plans", None, None);
        Reply {
            result: r.result.map(|b| b.plans),
            date: r.date,
        }
    }

    fn checkout(&self, plan: &str, email: &str, license_key: Option<&str>) -> Reply<Checkout> {
        let mut body = json!({ "plan": plan, "email": email, "consent": true });
        if let Some(key) = license_key {
            body["license_key"] = json!(key);
        }
        self.call("POST", "/v1/checkout", Some(body), None)
    }

    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus> {
        self.call("GET", &format!("/v1/orders/{order_code}"), None, Some(order_token))
    }

    fn activate(&self, key: &str, device_id_hash: &str, device_label: Option<&str>) -> Reply<Granted> {
        let body = json!({ "key": key, "device_id_hash": device_id_hash, "device_label": device_label });
        self.call("POST", "/v1/licenses/activate", Some(body), None)
    }

    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted> {
        let body = json!({ "key": key, "activation_id": activation_id });
        self.call("POST", "/v1/licenses/validate", Some(body), None)
    }

    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()> {
        let body = json!({ "key": key, "activation_id": activation_id });
        unit(self.call::<Ok200>("POST", "/v1/licenses/deactivate", Some(body), None))
    }

    fn recover(&self, email: &str) -> Reply<()> {
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(json!({ "email": email })), None))
    }
}

#[cfg(test)]
mod tests {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    use super::*;

    /// Một request server giả nhận được.
    #[derive(Clone, Debug, Default)]
    struct Seen {
        method: String,
        path: String,
        authorization: Option<String>,
        body: Value,
    }

    /// Một response của server giả: mã, header thêm, body.
    type Canned = (u16, Vec<(&'static str, &'static str)>, &'static str);

    /// Server HTTP giả: trả lần lượt các response cho các request tới.
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
                        "authorization" => req.authorization = Some(value.trim().into()),
                        _ => {}
                    }
                }
                let mut buf = vec![0; length];
                reader.read_exact(&mut buf).unwrap();
                req.body = serde_json::from_slice(&buf).unwrap_or(Value::Null);
                log.lock().unwrap().push(req);
                let extra: String = headers.iter().map(|(k, v)| format!("{k}: {v}\r\n")).collect();
                let reply = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nDate: Thu, 01 Oct 2026 00:00:00 GMT\r\n{extra}Connection: close\r\n\r\n{body}",
                    body.len()
                );
                stream.write_all(reply.as_bytes()).unwrap();
            }
        });
        (base, seen)
    }

    #[test]
    fn activate_sends_the_device_and_reads_the_token_and_the_server_date() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"pro","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"));
        let granted = reply.result.unwrap();
        assert_eq!(
            (
                granted.token.as_str(),
                granted.activation_id.as_str(),
                granted.quota_fresh
            ),
            ("v1.a.b", "act", true)
        );
        assert_eq!(
            reply.date,
            Some(1_790_812_800),
            "header Date làm mốc đồng hồ thật của Free"
        );
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(
            (req.method.as_str(), req.path.as_str()),
            ("POST", "/v1/licenses/activate")
        );
        assert_eq!(
            req.body,
            json!({ "key": "KEY", "device_id_hash": "ab12", "device_label": "Máy của Phong" })
        );
    }

    #[test]
    fn errors_keep_their_code_and_the_fields_the_app_shows() {
        let (base, _) = serve(vec![
            (
                409,
                vec![],
                r#"{"error":"device_limit","activations":[{"activation_id":"a1","device_label":null,"last_validated_at":5},{"activation_id":"a2","device_label":"Mac","last_validated_at":null}]}"#,
            ),
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (403, vec![], r#"{"error":"license_expired","expires_at":1790000000}"#),
            (502, vec![], "not json"),
        ]);
        let api = HttpApi::new(accept_base(&base, true));
        let Err(ApiError::Server(e)) = api.activate("K", "d", None).result else {
            panic!()
        };
        assert_eq!((e.status, e.code.as_str()), (409, "device_limit"));
        assert_eq!(e.devices.len(), 2);
        assert_eq!(e.devices[0].device_label, None, "`device_label` có thể là null");
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
        assert_eq!((e.code.as_str(), e.retry_after), ("rate_limited", Some(120)));
        let Err(ApiError::Server(e)) = api.validate("K", "a").result else {
            panic!()
        };
        assert_eq!(
            (e.code.as_str(), e.expires_at),
            ("license_expired", Some(1_790_000_000))
        );
        let Err(ApiError::Server(e)) = api.recover("a@b.vn").result else {
            panic!()
        };
        assert_eq!(e.code, "http_502");
    }

    /// `order_token` đi trong header `Authorization`, không trong URL (§6.8).
    #[test]
    fn the_order_token_goes_in_the_authorization_header() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"order_code":12,"status":"paid","plan":"pro","amount":50000,"currency":"VND","expires_at":9,"license_key":"0123-4567-89AB-CDEF-GHJK-MNPQ-RST5","license_plan":"pro","license_expires_at":99,"grant_kind":"new"}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.order(12, "tok-1").result.unwrap();
        assert_eq!(
            (order.status.as_str(), order.grant_kind.as_deref()),
            ("paid", Some("new"))
        );
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(req.path, "/v1/orders/12");
        assert_eq!(req.authorization.as_deref(), Some("Bearer tok-1"));
    }

    #[test]
    fn checkout_sends_consent_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"pro","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        assert_eq!(api.checkout("pro", "a@b.vn", None).result.unwrap().order_code, 7);
        api.checkout("pro", "a@b.vn", Some("KEY")).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "pro", "email": "a@b.vn", "consent": true })
        );
        assert_eq!(reqs[1].body["license_key"], "KEY");
    }

    #[test]
    fn only_https_is_accepted_and_http_only_for_this_machine_in_debug() {
        assert_eq!(
            accept_base("https://api.example.vn/", false).as_deref(),
            Some("https://api.example.vn")
        );
        assert_eq!(accept_base("http://api.example.vn", true), None);
        assert_eq!(accept_base("http://127.0.0.1:8787", false), None);
        assert!(accept_base("http://127.0.0.1:8787", true).is_some());
        assert_eq!(accept_base("https://x.vn/?k=1", false), None);
        assert_eq!(accept_base("ftp://x.vn", true), None);
        let none = HttpApi::new(None);
        assert!(!none.configured());
        assert_eq!(none.plans().result, Err(ApiError::NotConfigured));
    }

    #[test]
    fn http_dates_parse_and_bad_ones_are_ignored() {
        assert_eq!(parse_http_date("Thu, 01 Oct 2026 00:00:00 GMT"), Some(1_790_812_800));
        assert_eq!(parse_http_date("hôm qua"), None);
    }
}
