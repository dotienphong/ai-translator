//! Client HTTP của các route tài khoản trên license server (spec 2026-11-05 §3, §5.1, §6.1): `GET /v1/auth/status`,
//! `POST /v1/auth/google/start`, `POST /v1/auth/poll`, `POST /v1/account/link-license`, `POST /v1/account/delete`.
//!
//! Dựng trên [`HttpApi::call`] của `license::client` nên giữ nguyên mọi quy tắc ở đó: chỉ `https` tới `PRODUCTION_URL`, không
//! theo redirect, mọi response (cả lỗi) đưa header `Date`, lỗi server giữ mã và `Retry-After` (`429`, `5xx`).
//!
//! - Token tài khoản chỉ đi trong header `Authorization: Bearer`, không bao giờ trong URL.
//! - Không ghi token, email, `login_id`, `verifier` hay `login_url` vào log hay thông báo lỗi: response được đọc thành
//!   [`Value`] rồi trích từng trường, nên lỗi giải mã chỉ có câu cố định, không chép lại nội dung response; các kiểu mang
//!   dữ liệu nhạy cảm có `Debug` che giá trị.
//! - Không panic: thân hỏng, thiếu trường hay kiểu sai đều thành [`ApiError::Decode`]. Trường lạ được bỏ qua.

use std::fmt;

use serde_json::{Value, json};

use crate::license::client::{ApiError, HttpApi, Reply};

/// Công tắc đăng nhập của server (`GET /v1/auth/status`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LoginStatus {
    /// `false` chỉ khi server nói đúng `"off"` (công tắc khẩn cấp: app mở cổng). Mọi thân không đọc được là lỗi, không phải `false`.
    pub login_on: bool,
}

/// Một lần đăng nhập vừa bắt đầu (`POST /v1/auth/google/start`).
#[derive(Clone, PartialEq, Eq)]
pub struct LoginStart {
    pub login_id: String,
    /// Địa chỉ trang Google để mở bằng trình duyệt hệ thống (nơi gọi tự kiểm host và đường dẫn trước khi mở).
    pub login_url: String,
    /// Giây Unix theo giờ server.
    pub expires_at: i64,
}

impl fmt::Debug for LoginStart {
    // `login_id` và `login_url` (có `state`) không được vào log.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("LoginStart")
            .field("expires_at", &self.expires_at)
            .finish_non_exhaustive()
    }
}

/// Kết quả một lần hỏi (`POST /v1/auth/poll`). Server giao `token` đúng một lần ở `Done`.
#[derive(Clone, PartialEq, Eq)]
pub enum LoginPoll {
    Pending,
    Done { token: String, email: String },
    Denied,
    Failed,
    Expired,
}

impl fmt::Debug for LoginPoll {
    // `token` và `email` không được vào log.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Pending => f.write_str("Pending"),
            Self::Done { .. } => f.write_str("Done { .. }"),
            Self::Denied => f.write_str("Denied"),
            Self::Failed => f.write_str("Failed"),
            Self::Expired => f.write_str("Expired"),
        }
    }
}

/// Các lệnh tài khoản của license server mà app dùng. App thật là [`HttpAccountApi`]; test dùng bản giả.
pub trait AccountApi: Send + Sync {
    /// `GET /v1/auth/status`. Lỗi (mạng, server, thân không đọc được) KHÔNG có nghĩa là "tắt": nơi gọi giữ cổng đóng.
    fn status(&self) -> Reply<LoginStatus>;
    /// `POST /v1/auth/google/start`. `challenge`: SHA-256 của verifier PKCE, base64url. Người dùng đã đồng ý trước khi bấm
    /// Đăng nhập nên `consent` luôn là `true`. `lang` rỗng thì không gửi.
    fn start(&self, device_id_hash: &str, challenge: &str, lang: &str) -> Reply<LoginStart>;
    /// `POST /v1/auth/poll`. `404 not_found` (login lạ, sai verifier hay token đã giao) là lỗi server giữ nguyên mã, không đoán
    /// thành một trạng thái.
    fn poll(&self, login_id: &str, verifier: &str) -> Reply<LoginPoll>;
    /// `POST /v1/account/link-license`, token tài khoản trong `Authorization: Bearer`.
    fn link_license(&self, token: &str, key: &str, activation_id: &str) -> Reply<()>;
    /// `POST /v1/account/delete`, token tài khoản trong `Authorization: Bearer`.
    fn delete(&self, token: &str) -> Reply<()>;
}

/// Client HTTP thật.
pub struct HttpAccountApi {
    http: HttpApi,
}

impl HttpAccountApi {
    /// Server của mọi bản build, debug lẫn phát hành: production (như [`HttpApi::for_this_build`]).
    pub fn for_this_build() -> Self {
        Self {
            http: HttpApi::for_this_build(),
        }
    }

    /// Chỉ cho test dựng server giả (địa chỉ đã qua `accept_base`).
    #[cfg(test)]
    fn new(base: Option<String>) -> Self {
        Self {
            http: HttpApi::new(base),
        }
    }

    pub fn configured(&self) -> bool {
        self.http.configured()
    }
}

/// Đọc thân JSON bằng `read`; `None` là sai dạng. Thông báo lỗi là câu cố định, không chép nội dung response.
fn decode<T>(reply: Reply<Value>, what: &str, read: impl FnOnce(&Value) -> Option<T>) -> Reply<T> {
    Reply {
        result: reply
            .result
            .and_then(|v| read(&v).ok_or_else(|| ApiError::Decode(format!("{what}: sai dạng")))),
        date: reply.date,
    }
}

/// Chuỗi không rỗng của trường `name`.
fn text(v: &Value, name: &str) -> Option<String> {
    v.get(name)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn read_status(v: &Value) -> Option<LoginStatus> {
    // Chỉ đúng "on" và "off"; giá trị khác (kể cả "OFF") không đoán, để nơi gọi coi là lỗi và giữ cổng đóng.
    match v.get("login")?.as_str()? {
        "on" => Some(LoginStatus { login_on: true }),
        "off" => Some(LoginStatus { login_on: false }),
        _ => None,
    }
}

fn read_start(v: &Value) -> Option<LoginStart> {
    Some(LoginStart {
        login_id: text(v, "login_id")?,
        login_url: text(v, "login_url")?,
        expires_at: v.get("expires_at")?.as_i64()?,
    })
}

fn read_poll(v: &Value) -> Option<LoginPoll> {
    match v.get("status")?.as_str()? {
        "pending" => Some(LoginPoll::Pending),
        "done" => Some(LoginPoll::Done {
            token: text(v, "token")?,
            email: text(v, "email")?,
        }),
        "denied" => Some(LoginPoll::Denied),
        "failed" => Some(LoginPoll::Failed),
        "expired" => Some(LoginPoll::Expired),
        _ => None,
    }
}

/// Thành công của `link-license`/`delete` là một object JSON (`{"ok":true}`); nội dung không cần.
fn read_ok(v: &Value) -> Option<()> {
    v.is_object().then_some(())
}

impl AccountApi for HttpAccountApi {
    fn status(&self) -> Reply<LoginStatus> {
        decode(
            self.http.call("GET", "/v1/auth/status", None, None),
            "status",
            read_status,
        )
    }

    fn start(&self, device_id_hash: &str, challenge: &str, lang: &str) -> Reply<LoginStart> {
        let mut fields = serde_json::Map::new();
        fields.insert("device_id_hash".into(), json!(device_id_hash));
        fields.insert("challenge".into(), json!(challenge));
        fields.insert("consent".into(), json!(true));
        if !lang.is_empty() {
            fields.insert("lang".into(), json!(lang));
        }
        let body = Value::Object(fields);
        decode(
            self.http.call("POST", "/v1/auth/google/start", Some(body), None),
            "start",
            read_start,
        )
    }

    fn poll(&self, login_id: &str, verifier: &str) -> Reply<LoginPoll> {
        let body = json!({ "login_id": login_id, "verifier": verifier });
        decode(
            self.http.call("POST", "/v1/auth/poll", Some(body), None),
            "poll",
            read_poll,
        )
    }

    fn link_license(&self, token: &str, key: &str, activation_id: &str) -> Reply<()> {
        let body = json!({ "key": key, "activation_id": activation_id });
        decode(
            self.http
                .call("POST", "/v1/account/link-license", Some(body), Some(token)),
            "link-license",
            read_ok,
        )
    }

    fn delete(&self, token: &str) -> Reply<()> {
        // Thân `{}`: server không bắt buộc trường nào (không gửi `device_id_hash` thì chấp nhận máy ghi trong token).
        decode(
            self.http
                .call("POST", "/v1/account/delete", Some(json!({})), Some(token)),
            "delete",
            read_ok,
        )
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::license::client::tests::serve;
    use crate::license::client::{ApiError, PRODUCTION_URL, ServerError, accept_base};

    const CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    const VERIFIER: &str = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const LOGIN_ID: &str = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const TOKEN: &str = "v1.SECRETPAYLOAD.SECRETSIG";
    const START_BODY: &str = r#"{"login_id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","login_url":"https://accounts.google.com/o/oauth2/v2/auth?state=s","expires_at":1793491800,"extra":{"x":1}}"#;

    fn api_for(base: &str) -> HttpAccountApi {
        HttpAccountApi::new(accept_base(base, true))
    }

    fn server_err(e: ApiError) -> ServerError {
        match e {
            ApiError::Server(s) => *s,
            other => panic!("expected a server error, got {other:?}"),
        }
    }

    /// `start` gửi `device_id_hash`, `challenge`, `consent: true` và `lang`; đọc `login_id`, `login_url`, `expires_at`
    /// và bỏ qua trường lạ.
    #[test]
    fn start_sends_device_hash_challenge_consent_true_and_lang() {
        let (base, seen) = serve(vec![(200, vec![], START_BODY)]);
        let started = api_for(&base).start("ab12", CHALLENGE, "ja").result.unwrap();
        assert_eq!(started.login_id, LOGIN_ID);
        assert_eq!(
            started.login_url,
            "https://accounts.google.com/o/oauth2/v2/auth?state=s"
        );
        assert_eq!(started.expires_at, 1_793_491_800);
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            (reqs[0].method.as_str(), reqs[0].path.as_str()),
            ("POST", "/v1/auth/google/start")
        );
        assert_eq!(
            reqs[0].body,
            json!({ "device_id_hash": "ab12", "challenge": CHALLENGE, "consent": true, "lang": "ja" })
        );
        assert_eq!(reqs[0].authorization, None);
    }

    /// `lang` rỗng thì không gửi (server để NULL); `consent` vẫn luôn `true`.
    #[test]
    fn start_omits_lang_when_empty_but_consent_stays_true() {
        let (base, seen) = serve(vec![(200, vec![], START_BODY)]);
        api_for(&base).start("ab12", CHALLENGE, "").result.unwrap();
        let body = seen.lock().unwrap()[0].body.clone();
        assert!(body.get("lang").is_none(), "{body}");
        assert_eq!(body["consent"], json!(true));
    }

    /// `poll` gửi `login_id` và `verifier`; đọc đủ năm trạng thái, `done` mang `token` và `email`.
    #[test]
    fn poll_reads_pending_done_denied_failed_and_expired() {
        let done = format!(r#"{{"status":"done","token":"{TOKEN}","email":"a@b.vn","more":true}}"#);
        let done: &'static str = Box::leak(done.into_boxed_str());
        let (base, seen) = serve(vec![
            (200, vec![], r#"{"status":"pending"}"#),
            (200, vec![], done),
            (200, vec![], r#"{"status":"denied"}"#),
            (200, vec![], r#"{"status":"failed"}"#),
            (200, vec![], r#"{"status":"expired"}"#),
        ]);
        let api = api_for(&base);
        let polls: Vec<LoginPoll> = (0..5).map(|_| api.poll(LOGIN_ID, VERIFIER).result.unwrap()).collect();
        assert_eq!(
            polls,
            vec![
                LoginPoll::Pending,
                LoginPoll::Done {
                    token: TOKEN.into(),
                    email: "a@b.vn".into()
                },
                LoginPoll::Denied,
                LoginPoll::Failed,
                LoginPoll::Expired,
            ]
        );
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            (reqs[0].method.as_str(), reqs[0].path.as_str()),
            ("POST", "/v1/auth/poll")
        );
        assert_eq!(reqs[0].body, json!({ "login_id": LOGIN_ID, "verifier": VERIFIER }));
        assert_eq!(reqs[0].authorization, None);
    }

    /// Trạng thái lạ, `done` thiếu hay rỗng `token`/`email`, hoặc thân sai dạng là lỗi giải mã, không phải một trạng thái.
    #[test]
    fn poll_with_an_unreadable_body_is_a_decode_error() {
        let bodies = [
            r#"{"status":"approved"}"#,
            r#"{"status":"done"}"#,
            r#"{"status":"done","token":"t"}"#,
            r#"{"status":"done","email":"a@b.vn"}"#,
            r#"{"status":"done","token":"","email":"a@b.vn"}"#,
            r#"{"status":"done","token":"t","email":""}"#,
            r#"{"status":"done","token":7,"email":"a@b.vn"}"#,
            r#"{"status":null}"#,
            r#"{}"#,
            r#"[]"#,
            "không phải JSON",
            "",
        ];
        let (base, _) = serve(bodies.iter().map(|b| (200, vec![], *b)).collect());
        let api = api_for(&base);
        for body in bodies {
            let result = api.poll(LOGIN_ID, VERIFIER).result;
            assert!(matches!(result, Err(ApiError::Decode(_))), "{body:?} -> {result:?}");
        }
    }

    /// Thông báo lỗi giải mã không chép lại nội dung response (token, email có thể nằm trong đó).
    #[test]
    fn decode_errors_never_echo_the_response_content() {
        let leaky = r#"{"status":"done","token":12345678,"email":"nguoi.dung@example.com"}"#;
        let broken = r#"{"status":"done","token":"v1.SECRETPAYLOAD.SECRETSIG","email":"nguoi.dung@example.com""#;
        let (base, _) = serve(vec![(200, vec![], leaky), (200, vec![], broken)]);
        let api = api_for(&base);
        for _ in 0..2 {
            let Err(ApiError::Decode(text)) = api.poll(LOGIN_ID, VERIFIER).result else {
                panic!("expected a decode error");
            };
            for secret in ["SECRET", "nguoi.dung", "example.com", "12345678"] {
                assert!(!text.contains(secret), "{text}");
            }
        }
    }

    /// `status`: `{"login":"off"}` là cổng mở (`login_on == false`), `"on"` là đang bật; trường lạ bị bỏ qua.
    #[test]
    fn status_off_means_login_off_and_on_means_on() {
        let (base, seen) = serve(vec![
            (200, vec![], r#"{"login":"off"}"#),
            (200, vec![], r#"{"login":"on","note":"x"}"#),
        ]);
        let api = api_for(&base);
        assert_eq!(api.status().result.unwrap(), LoginStatus { login_on: false });
        assert_eq!(api.status().result.unwrap(), LoginStatus { login_on: true });
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            (reqs[0].method.as_str(), reqs[0].path.as_str()),
            ("GET", "/v1/auth/status")
        );
        assert_eq!(reqs[0].authorization, None);
    }

    /// Chỉ chữ `"off"` đúng nguyên văn mới là "tắt". Mọi thứ không đọc được là lỗi (nơi gọi giữ cổng đóng), không bao giờ là
    /// `login_on == false`, và không panic.
    #[test]
    fn status_that_cannot_be_read_is_an_error_and_never_off() {
        let bodies = [
            "",
            "không phải JSON",
            "<html>502 Bad Gateway</html>",
            "{}",
            "[]",
            "null",
            r#"{"login":null}"#,
            r#"{"login":false}"#,
            r#"{"login":0}"#,
            r#"{"login":"OFF"}"#,
            r#"{"login":" off"}"#,
            r#"{"login":"maybe"}"#,
            r#"{"login":""}"#,
            r#"{"login":["off"]}"#,
            r#"{"login":"off""#,
        ];
        let (base, _) = serve(bodies.iter().map(|b| (200, vec![], *b)).collect());
        let api = api_for(&base);
        for body in bodies {
            let result = api.status().result;
            assert!(matches!(result, Err(ApiError::Decode(_))), "{body:?} -> {result:?}");
        }
    }

    /// `link_license` và `delete` gửi `Authorization: Bearer <token>`; token không có trong đường dẫn hay thân request.
    #[test]
    fn link_license_and_delete_send_the_bearer_token_in_the_header_only() {
        let (base, seen) = serve(vec![(200, vec![], r#"{"ok":true}"#), (200, vec![], r#"{"ok":true}"#)]);
        let api = api_for(&base);
        api.link_license(TOKEN, "KEY-1234", LOGIN_ID).result.unwrap();
        api.delete(TOKEN).result.unwrap();
        let reqs = seen.lock().unwrap().clone();
        assert_eq!(
            (reqs[0].method.as_str(), reqs[0].path.as_str()),
            ("POST", "/v1/account/link-license")
        );
        assert_eq!(reqs[0].body, json!({ "key": "KEY-1234", "activation_id": LOGIN_ID }));
        assert_eq!(
            (reqs[1].method.as_str(), reqs[1].path.as_str()),
            ("POST", "/v1/account/delete")
        );
        let bearer = format!("Bearer {TOKEN}");
        for r in &reqs {
            assert_eq!(r.authorization.as_deref(), Some(bearer.as_str()));
            assert!(!r.path.contains("SECRET"), "{}", r.path);
            assert!(!r.body.to_string().contains("SECRET"), "{}", r.body);
        }
    }

    /// Thân thành công của `link_license`/`delete` hỏng thì là lỗi giải mã (không panic); thân có trường lạ vẫn được.
    #[test]
    fn link_license_and_delete_reject_a_malformed_success_body() {
        let (base, _) = serve(vec![
            (200, vec![], "không phải JSON"),
            (200, vec![], ""),
            (200, vec![], r#"{"ok":true,"extra":1}"#),
        ]);
        let api = api_for(&base);
        assert!(matches!(api.delete(TOKEN).result, Err(ApiError::Decode(_))));
        assert!(matches!(
            api.link_license(TOKEN, "K", "a").result,
            Err(ApiError::Decode(_))
        ));
        api.delete(TOKEN).result.unwrap();
    }

    /// Lỗi giữ mã của server, `status` HTTP và `Retry-After`; thân không phải JSON thì mã là `http_<status>`.
    #[test]
    fn server_errors_keep_the_code_status_and_retry_after() {
        let (base, _) = serve(vec![
            (429, vec![("Retry-After", "60")], r#"{"error":"rate_limited"}"#),
            (503, vec![], r#"{"error":"login_unavailable"}"#),
            (404, vec![], r#"{"error":"not_found"}"#),
            (401, vec![], r#"{"error":"invalid_token","reason":"wrong_device"}"#),
            (409, vec![], r#"{"error":"license_linked_other_account"}"#),
            (400, vec![], r#"{"error":"invalid_request","field":"consent"}"#),
            (502, vec![], "<html>Bad Gateway</html>"),
            (500, vec![("Retry-After", "7")], r#"{"error":"internal"}"#),
        ]);
        let api = api_for(&base);
        let e = server_err(api.start("ab12", CHALLENGE, "vi").result.unwrap_err());
        assert_eq!(
            (e.status, e.code.as_str(), e.retry_after),
            (429, "rate_limited", Some(60))
        );
        let e = server_err(api.start("ab12", CHALLENGE, "vi").result.unwrap_err());
        assert_eq!(
            (e.status, e.code.as_str(), e.retry_after),
            (503, "login_unavailable", None)
        );
        let e = server_err(api.poll(LOGIN_ID, VERIFIER).result.unwrap_err());
        assert_eq!((e.status, e.code.as_str()), (404, "not_found"));
        let e = server_err(api.link_license(TOKEN, "K", LOGIN_ID).result.unwrap_err());
        assert_eq!((e.status, e.code.as_str()), (401, "invalid_token"));
        let e = server_err(api.link_license(TOKEN, "K", LOGIN_ID).result.unwrap_err());
        assert_eq!((e.status, e.code.as_str()), (409, "license_linked_other_account"));
        let e = server_err(api.start("ab12", CHALLENGE, "vi").result.unwrap_err());
        assert_eq!(
            (e.status, e.code.as_str(), e.field.as_deref()),
            (400, "invalid_request", Some("consent"))
        );
        let e = server_err(api.status().result.unwrap_err());
        assert_eq!((e.status, e.code.as_str()), (502, "http_502"));
        let e = server_err(api.delete(TOKEN).result.unwrap_err());
        assert_eq!((e.status, e.code.as_str(), e.retry_after), (500, "internal", Some(7)));
    }

    /// Mọi response (cả lỗi) mang header `Date` cho nơi gọi, như `license::client`.
    #[test]
    fn replies_carry_the_server_date_even_on_errors() {
        let (base, _) = serve(vec![
            (200, vec![], r#"{"login":"on"}"#),
            (503, vec![], r#"{"error":"x"}"#),
        ]);
        let api = api_for(&base);
        assert_eq!(api.status().date, Some(1_790_812_800));
        assert_eq!(api.status().date, Some(1_790_812_800));
    }

    /// Chưa cấu hình địa chỉ (hay địa chỉ không phải https) thì mọi lệnh trả `NotConfigured`, không gọi mạng.
    #[test]
    fn an_unconfigured_or_non_https_base_never_calls_out() {
        assert_eq!(accept_base("http://api.example.vn", true), None);
        assert_eq!(accept_base("http://127.0.0.1:8787", false), None);
        for api in [
            HttpAccountApi::new(None),
            HttpAccountApi::new(accept_base("http://127.0.0.1:1", false)),
        ] {
            assert_eq!(api.status().result.unwrap_err(), ApiError::NotConfigured);
            assert_eq!(api.start("h", "c", "vi").result.unwrap_err(), ApiError::NotConfigured);
            assert_eq!(api.poll("l", "v").result.unwrap_err(), ApiError::NotConfigured);
            assert_eq!(
                api.link_license("t", "k", "a").result.unwrap_err(),
                ApiError::NotConfigured
            );
            assert_eq!(api.delete("t").result.unwrap_err(), ApiError::NotConfigured);
        }
    }

    /// Mọi bản build chỉ nói chuyện với `PRODUCTION_URL` (https, `api.aitranslator.vn`), không có biến ghi đè.
    #[test]
    fn every_build_talks_to_the_production_url_only() {
        assert_eq!(PRODUCTION_URL, Some("https://api.aitranslator.vn"));
        assert_eq!(
            HttpAccountApi::for_this_build().configured(),
            PRODUCTION_URL.and_then(|u| accept_base(u, false)).is_some()
        );
    }

    /// Kiểu mang token, email hay `login_url` không bao giờ in ra giá trị qua `Debug`.
    #[test]
    fn debug_output_redacts_tokens_emails_and_login_urls() {
        let done = LoginPoll::Done {
            token: TOKEN.into(),
            email: "nguoi.dung@example.com".into(),
        };
        let start = LoginStart {
            login_id: LOGIN_ID.into(),
            login_url: "https://accounts.google.com/o/oauth2/v2/auth?state=SECRETSTATE".into(),
            expires_at: 1,
        };
        let text = format!(
            "{done:?} {start:?} {:?} {:?}",
            LoginPoll::Pending,
            LoginStatus { login_on: true }
        );
        for secret in ["SECRET", "nguoi.dung", "example.com", LOGIN_ID, "accounts.google.com"] {
            assert!(!text.contains(secret), "{text}");
        }
    }
}
