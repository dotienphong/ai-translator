//! Client của license server (spec §6.8 "API của license server", "Trong app: interface `LicenseProvider`"; hợp đồng ở
//! mục "Hợp đồng API cho kế hoạch 06" của kế hoạch 05). Gọi từ phía Rust (server không bật CORS), bằng `reqwest` đồng bộ
//! trên luồng nền, TLS và proxy của hệ điều hành.
//!
//! - Chỉ `https`, không theo redirect. Mọi bản build, kể cả bản debug, chỉ nói chuyện với server production
//!   (`PRODUCTION_URL`); không còn biến môi trường nào đổi địa chỉ (spec 2026-10-04, §1). `accept_base` vẫn nhận `http`
//!   tới máy này, chỉ để test dựng server giả.
//! - Mọi response (cả lỗi) đưa header `Date` cho nơi gọi, làm mốc "đồng hồ thật" của Free (§6.8).
//! - `429` mang `Retry-After` (giây); app báo "thử lại sau", không thử lại liên tục. `429` ở `activate` không có nghĩa là
//!   key sai (§10.2, CGNAT).
//! - Không ghi key, token hay email vào log.

use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};

use super::purchase::PLANS;

/// Địa chỉ license server production (Worker `mt-license` trên tên miền riêng, spec 2026-10-23-ten-mien-aitranslator-vn). Để `None` thì app
/// chỉ dùng được token đã lưu và gói Free.
pub const PRODUCTION_URL: Option<&str> = Some("https://api.aitranslator.vn");
const USER_AGENT: &str = "AI-Translator";

/// Lỗi của một lần gọi server.
#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub enum ApiError {
    #[error("chưa cấu hình địa chỉ license server")]
    NotConfigured,
    #[error("lỗi mạng: {0}")]
    Network(String),
    /// Server trả lỗi `{"error": "<mã>", …}`. Đóng hộp để `Result<_, ApiError>` gọn (clippy `result_large_err`).
    #[error("server trả {0}")]
    Server(Box<ServerError>),
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
    /// `409 key_in_use`: các máy khác đang giữ key; `409 license_conflict`: mọi máy đang kích hoạt (spec 2026-10-07 §4.1).
    pub devices: Vec<Device>,
    /// `409 license_conflict` của `activate`: activation của chính máy vừa gọi (spec 2026-10-07 §4.1).
    pub activation_id: Option<String>,
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

/// Một máy đang kích hoạt, trong `409 key_in_use` hay `409 license_conflict`. `device_label` có thể là `null` (ví dụ sau
/// khi admin xóa dữ liệu cá nhân): giao diện hiện tên thay thế.
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

/// Token dùng thử server vừa cấp (`POST /v1/trial`, spec 2026-10-07 §3.1). App đọc lại các mốc từ token đã kiểm chữ ký;
/// các trường ngoài token chỉ để log và test.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct TrialGrant {
    pub token: String,
    pub started_at: i64,
    pub ends_at: i64,
    pub issued_at: i64,
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

/// Bảng gói (`GET /v1/plans`). Server còn gửi `suggested_currency` (loại tiền gợi ý theo nước, cho app ≤ 0.2.2); app này chọn
/// sẵn cách trả theo ngôn ngữ giao diện (spec 2026-10-22 §3.1) nên không đọc trường đó (serde bỏ qua trường lạ).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct PlansReply {
    pub plans: Vec<PlanOffer>,
}

/// Chuỗi rỗng là không có (`qr_code: ""` là đơn không có mã QR, không phải mã QR rỗng).
fn non_empty<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Ok(Option::<String>::deserialize(d)?.filter(|s| !s.is_empty()))
}

/// Đơn vừa tạo (`POST /v1/checkout`).
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, serde::Serialize)]
pub struct Checkout {
    pub order_code: i64,
    pub order_token: String,
    /// Cổng thanh toán của đơn (`payos`, `creem`). Server cũ (≤ 0.1.9) không có trường này.
    #[serde(default)]
    pub provider: Option<String>,
    pub checkout_url: String,
    /// Chuỗi VietQR của PayOS. `null` với đơn của cổng không có mã QR (Creem): khách trả ở `checkout_url`. Chuỗi rỗng cũng
    /// là không có mã QR.
    #[serde(default, deserialize_with = "non_empty")]
    pub qr_code: Option<String>,
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
    fn plans(&self) -> Reply<PlansReply>;
    /// `currency`: `VND` (VietQR qua PayOS) hay `USD` (thẻ qua Creem; spec 2026-10-14 D4). `lang`: mã ngôn ngữ giao diện (`vi`,
    /// `en`, `ja`, `zh`, `ko`), server lưu vào đơn để viết thư gửi key bằng ngôn ngữ đó (spec 2026-10-23).
    fn checkout(
        &self,
        plan: &str,
        email: &str,
        license_key: Option<&str>,
        currency: &str,
        lang: &str,
    ) -> Reply<Checkout>;
    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus>;
    /// `allow_conflict`: người dùng đã chọn "Vẫn kích hoạt" khi key đang dùng ở máy khác (spec 2026-10-07 §4.2).
    fn activate(
        &self,
        key: &str,
        device_id_hash: &str,
        device_label: Option<&str>,
        allow_conflict: bool,
    ) -> Reply<Granted>;
    fn validate(&self, key: &str, activation_id: &str) -> Reply<Granted>;
    fn deactivate(&self, key: &str, activation_id: &str) -> Reply<()>;
    /// `lang`: như ở `checkout`; server chỉ dùng để chọn ngôn ngữ thư, không lưu.
    fn recover(&self, email: &str, lang: &str) -> Reply<()>;
    /// Đăng ký dùng thử của máy này, hay lấy lại token của lần đăng ký trước (spec 2026-10-07 §3.1).
    fn trial(&self, device_id_hash: &str) -> Reply<TrialGrant>;
}

/// Client HTTP thật.
pub struct HttpApi {
    base: Option<String>,
    client: reqwest::blocking::Client,
}

/// URL gốc được nhận: `https://…` không có query; `http://127.0.0.1…` và `http://localhost…` chỉ khi `allow_http`
/// (test dựng server giả; `for_this_build` luôn truyền `false`).
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
    /// Server của mọi bản build, debug lẫn phát hành: production.
    pub fn for_this_build() -> Self {
        Self::new(PRODUCTION_URL.and_then(|u| accept_base(u, false)))
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
            Err(ApiError::Server(Box::new(server_error(status, retry_after, &bytes))))
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
        .get("devices")
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
        activation_id: v.get("activation_id").and_then(Value::as_str).map(String::from),
        expires_at: v.get("expires_at").and_then(Value::as_i64),
        field: v.get("field").and_then(Value::as_str).map(String::from),
    }
}

#[derive(Deserialize)]
struct Ok200 {}

fn unit<T>(reply: Reply<T>) -> Reply<()> {
    Reply {
        result: reply.result.map(|_| ()),
        date: reply.date,
    }
}

impl LicenseApi for HttpApi {
    fn plans(&self) -> Reply<PlansReply> {
        // Khai báo các gói app này bán được (spec 2026-10-13 §2.3): server chỉ đưa gói mới cho app có khai báo, để bản app
        // cũ không thấy gói mà nó không bán được.
        let path = format!("/v1/plans?plans={}", PLANS.join(","));
        self.call("GET", &path, None, None)
    }

    fn checkout(
        &self,
        plan: &str,
        email: &str,
        license_key: Option<&str>,
        currency: &str,
        lang: &str,
    ) -> Reply<Checkout> {
        let mut body = json!({ "plan": plan, "email": email, "consent": true, "currency": currency, "lang": lang });
        if let Some(key) = license_key {
            body["license_key"] = json!(key);
        }
        self.call("POST", "/v1/checkout", Some(body), None)
    }

    fn order(&self, order_code: i64, order_token: &str) -> Reply<OrderStatus> {
        self.call("GET", &format!("/v1/orders/{order_code}"), None, Some(order_token))
    }

    fn activate(
        &self,
        key: &str,
        device_id_hash: &str,
        device_label: Option<&str>,
        allow_conflict: bool,
    ) -> Reply<Granted> {
        let mut body = json!({ "key": key, "device_id_hash": device_id_hash, "device_label": device_label });
        if allow_conflict {
            body["allow_conflict"] = json!(true);
        }
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

    fn recover(&self, email: &str, lang: &str) -> Reply<()> {
        let body = json!({ "email": email, "lang": lang });
        unit(self.call::<Ok200>("POST", "/v1/licenses/recover", Some(body), None))
    }

    fn trial(&self, device_id_hash: &str) -> Reply<TrialGrant> {
        self.call(
            "POST",
            "/v1/trial",
            Some(json!({ "device_id_hash": device_id_hash })),
            None,
        )
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

    /// `allow_conflict` chỉ gửi khi người dùng chọn "Vẫn kích hoạt" (spec 2026-10-07 §4.2).
    #[test]
    fn activate_sends_allow_conflict_only_when_asked() {
        let body = r#"{"token":"v1.a.b","activation_id":"act","quota_fresh":false}"#;
        let (base, seen) = serve(vec![(200, vec![], body), (200, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        api.activate("KEY", "ab12", None, false).result.unwrap();
        api.activate("KEY", "ab12", None, true).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "key": "KEY", "device_id_hash": "ab12", "device_label": null })
        );
        assert_eq!(reqs[1].body["allow_conflict"], true);
    }

    /// Bảng gói (spec 2026-10-13 §2.3): app khai báo đúng các gói nó bán được, rồi đọc đủ ba gói theo thứ tự server trả.
    #[test]
    fn plans_declares_the_plans_this_app_can_sell_and_reads_all_of_them() {
        let body = r#"{"plans":[
            {"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000}},
            {"code":"six_months","name":"6 Months","quota_minutes_per_cycle":6000,"days_per_order":180,"prices":{"VND":269000}},
            {"code":"yearly","name":"Yearly","quota_minutes_per_cycle":null,"days_per_order":365,"prices":{"VND":500000}}]}"#;
        let (base, seen) = serve(vec![(200, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.plans().result.unwrap();
        let plans = reply.plans;
        assert_eq!(
            plans.iter().map(|p| p.code.as_str()).collect::<Vec<_>>(),
            ["monthly", "six_months", "yearly"]
        );
        assert_eq!(
            (
                plans[1].name.as_str(),
                plans[1].quota_minutes_per_cycle,
                plans[1].days_per_order
            ),
            ("6 Months", Some(6000), 180)
        );
        assert_eq!(plans[1].prices["VND"], 269_000);
        assert_eq!(plans[2].quota_minutes_per_cycle, None);
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(
            (req.method.as_str(), req.path.as_str()),
            ("GET", "/v1/plans?plans=monthly,six_months,yearly")
        );
    }

    /// Giá USD (spec 2026-10-14 §3): đọc cả giá VND lẫn USD. Server còn gửi `suggested_currency` cho app cũ (≤ 0.2.2); app này
    /// chọn sẵn cách trả theo ngôn ngữ giao diện (spec 2026-10-22 §3.1) nên bỏ qua trường đó mà vẫn đọc đủ bảng gói, với mọi
    /// kiểu giá trị.
    #[test]
    fn plans_reads_the_usd_prices_and_ignores_the_suggested_currency() {
        let body = r#"{"suggested_currency":"USD","plans":[
            {"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000,"USD":399}}]}"#;
        let (base, _) = serve(vec![(200, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.plans().result.unwrap();
        assert_eq!(
            (reply.plans[0].prices["VND"], reply.plans[0].prices["USD"]),
            (50_000, 399)
        );
        let plans = r#"[{"code":"monthly","name":"Monthly","quota_minutes_per_cycle":3000,"days_per_order":30,"prices":{"VND":50000}}]"#;
        for suggested in ["5", r#""EUR""#, r#""VND""#, "null", r#"{"code":"USD"}"#, r#"["USD"]"#] {
            let body = format!(r#"{{"suggested_currency":{suggested},"plans":{plans}}}"#);
            let reply: PlansReply = serde_json::from_str(&body).unwrap_or_else(|e| panic!("{suggested}: {e}"));
            assert_eq!(reply.plans.len(), 1, "{suggested}");
        }
    }

    /// `qr_code: ""` (server hay cổng trả sai) là đơn không có mã QR, không phải mã QR rỗng (KH03-T1-a); `null` và khóa vắng
    /// cũng vậy; chuỗi thật giữ nguyên.
    #[test]
    fn an_empty_qr_code_means_no_qr_code() {
        let checkout = |qr: &str| -> Checkout {
            let body = format!(
                r#"{{"order_code":8,"order_token":"t","provider":"payos","checkout_url":"https://pay.payos.vn/web/x",{qr}"plan":"monthly","amount":50000,"currency":"VND","expires_at":9}}"#
            );
            serde_json::from_str(&body).unwrap_or_else(|e| panic!("{qr}: {e}"))
        };
        assert_eq!(checkout(r#""qr_code":"","#).qr_code, None);
        assert_eq!(checkout(r#""qr_code":null,"#).qr_code, None);
        assert_eq!(checkout("").qr_code, None);
        assert_eq!(checkout(r#""qr_code":"000201","#).qr_code.as_deref(), Some("000201"));
    }

    /// Đăng ký dùng thử (spec 2026-10-07 §3.1): gửi `device_id_hash`, đọc token và các mốc.
    #[test]
    fn trial_sends_the_device_and_reads_the_token() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.t.s","started_at":10,"ends_at":20,"issued_at":11}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.trial("ab12");
        assert_eq!(
            reply.result.unwrap(),
            TrialGrant {
                token: "v1.t.s".into(),
                started_at: 10,
                ends_at: 20,
                issued_at: 11,
            }
        );
        assert_eq!(reply.date, Some(1_790_812_800));
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!((req.method.as_str(), req.path.as_str()), ("POST", "/v1/trial"));
        assert_eq!(req.body, json!({ "device_id_hash": "ab12" }));
    }

    #[test]
    fn activate_sends_the_device_and_reads_the_token_and_the_server_date() {
        let (base, seen) = serve(vec![(
            200,
            vec![],
            r#"{"token":"v1.a.b","activation_id":"act","activation_created_at":1,"plan":"monthly","expires_at":2,"cycle_anchor":1,"quota_minutes_per_cycle":1800,"quota_epoch":0,"quota_fresh":true,"refresh_before":3}"#,
        )]);
        let api = HttpApi::new(accept_base(&base, true));
        let reply = api.activate("KEY", "ab12", Some("Máy của Phong"), false);
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
                r#"{"error":"key_in_use","devices":[{"activation_id":"a1","device_label":null,"last_validated_at":5}]}"#,
            ),
            (
                409,
                vec![],
                r#"{"error":"license_conflict","activation_id":"a2","devices":[{"activation_id":"a1","device_label":null,"last_validated_at":5},{"activation_id":"a2","device_label":"Mac","last_validated_at":null}]}"#,
            ),
            (429, vec![("Retry-After", "120")], r#"{"error":"rate_limited"}"#),
            (403, vec![], r#"{"error":"license_expired","expires_at":1790000000}"#),
            (502, vec![], "not json"),
        ]);
        let api = HttpApi::new(accept_base(&base, true));
        let Err(ApiError::Server(e)) = api.activate("K", "d", None, false).result else {
            panic!()
        };
        assert_eq!((e.status, e.code.as_str(), e.devices.len()), (409, "key_in_use", 1));
        assert_eq!(e.devices[0].device_label, None, "`device_label` có thể là null");
        let Err(ApiError::Server(e)) = api.activate("K", "d", None, true).result else {
            panic!()
        };
        assert_eq!((e.code.as_str(), e.devices.len()), ("license_conflict", 2));
        assert_eq!(e.devices[1].device_label.as_deref(), Some("Mac"));
        assert_eq!(e.activation_id.as_deref(), Some("a2"), "activation của chính máy gọi");
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
        let Err(ApiError::Server(e)) = api.recover("a@b.vn", "vi").result else {
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
            r#"{"order_code":12,"status":"paid","plan":"monthly","amount":50000,"currency":"VND","expires_at":9,"license_key":"0123-4567-89AB-CDEF-GHJK-MNPQ-RST5","license_plan":"monthly","license_expires_at":99,"grant_kind":"new"}"#,
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

    /// Ngôn ngữ giao diện đi kèm đơn (spec 2026-10-23 §4) để server viết thư gửi key bằng ngôn ngữ đó.
    #[test]
    fn checkout_sends_consent_the_currency_the_ui_language_and_the_key_only_when_renewing() {
        let body = r#"{"order_code":7,"order_token":"t","checkout_url":"https://pay.payos.vn/web/x","qr_code":"000201","plan":"monthly","amount":50000,"currency":"VND","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body), (201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.checkout("monthly", "a@b.vn", None, "VND", "ja").result.unwrap();
        assert_eq!(order.order_code, 7);
        // Server cũ (≤ 0.1.9) không có `provider`: không đoán, để nơi dùng coi là PayOS.
        assert_eq!((order.qr_code.as_deref(), order.provider), (Some("000201"), None));
        api.checkout("monthly", "a@b.vn", Some("KEY"), "VND", "vi")
            .result
            .unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            reqs[0].body,
            json!({ "plan": "monthly", "email": "a@b.vn", "consent": true, "currency": "VND", "lang": "ja" })
        );
        assert_eq!(
            (reqs[1].body["license_key"].as_str(), reqs[1].body["lang"].as_str()),
            (Some("KEY"), Some("vi"))
        );
    }

    /// Lấy lại key gửi kèm ngôn ngữ giao diện (spec 2026-10-23 §4); server chỉ dùng để chọn ngôn ngữ thư.
    #[test]
    fn recover_sends_the_email_and_the_ui_language() {
        let (base, seen) = serve(vec![(200, vec![], r#"{"ok":true}"#)]);
        let api = HttpApi::new(accept_base(&base, true));
        api.recover("a@b.vn", "ko").result.unwrap();
        let req = seen.lock().unwrap()[0].clone();
        assert_eq!(req.path, "/v1/licenses/recover");
        assert_eq!(req.body, json!({ "email": "a@b.vn", "lang": "ko" }));
    }

    /// Đơn thẻ quốc tế (Creem, spec 2026-10-14 §3): `qr_code` là `null`, có `provider`; app gửi `currency: "USD"`.
    #[test]
    fn a_card_checkout_has_no_qr_code_and_names_its_provider() {
        let body = r#"{"order_code":8,"order_token":"t","provider":"creem","checkout_url":"https://checkout.creem.io/ch_1","qr_code":null,"plan":"monthly","amount":399,"currency":"USD","expires_at":9}"#;
        let (base, seen) = serve(vec![(201, vec![], body)]);
        let api = HttpApi::new(accept_base(&base, true));
        let order = api.checkout("monthly", "a@b.vn", None, "USD", "en").result.unwrap();
        assert_eq!(
            (
                order.qr_code,
                order.provider.as_deref(),
                order.amount,
                order.currency.as_str()
            ),
            (None, Some("creem"), 399, "USD")
        );
        assert_eq!(seen.lock().unwrap()[0].body["currency"], "USD");
    }

    /// `accept_base`: chỉ `https` không query; `http` tới máy này chỉ khi `allow_http` (dành cho test, không phải bản
    /// build).
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

    /// Mọi bản build (debug lẫn phát hành) chỉ dùng `PRODUCTION_URL` (spec 2026-10-04, §2.1). Test này chỉ bảo đảm
    /// `PRODUCTION_URL` đã cấu hình thì `accept_base` nhận (https, không query), nên `configured()` khớp; nó không phát
    /// hiện được biến môi trường ghi đè bị thêm lại khi `PRODUCTION_URL` còn là `None`.
    #[test]
    fn every_build_talks_to_the_production_url_only() {
        assert_eq!(HttpApi::for_this_build().configured(), PRODUCTION_URL.is_some());
    }

    #[test]
    fn http_dates_parse_and_bad_ones_are_ignored() {
        assert_eq!(parse_http_date("Thu, 01 Oct 2026 00:00:00 GMT"), Some(1_790_812_800));
        assert_eq!(parse_http_date("hôm qua"), None);
    }
}
