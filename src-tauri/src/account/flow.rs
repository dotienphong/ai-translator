//! Luồng đăng nhập Google của app (spec 2026-11-05 §6.1, §6.2): [`AccountService`] giữ phiên tài khoản của máy này, chạy
//! vòng đăng nhập (xin `login_url` của server, mở trang Google bằng trình duyệt hệ thống, hỏi kết quả tới khi xong, hết hạn
//! hay bị hủy), đăng xuất, xóa tài khoản, gắn license; và báo cổng đăng nhập cho `License` qua [`AccountHook`].
//!
//! Luật khóa: trạng thái nằm trong một `Mutex` chỉ giữ để đọc hay đổi vài trường trong bộ nhớ, **không bao giờ** giữ qua một
//! lần gọi mạng, một lần ngủ, một lần đọc ghi kho khóa hay một lần gọi vào `License`. Nhờ vậy `gate`, `bearer` và `view`
//! luôn trả ngay, kể cả khi `sign_in` đang chờ server. Cờ hủy là `AtomicBool`; mỗi lần ngủ được cắt thành lát ngắn để hủy
//! có hiệu lực ngay. Khóa bị hỏng (một luồng panic khi đang giữ) được dùng tiếp, không panic.
//!
//! Không ghi token, email, `login_id`, verifier hay `login_url` vào log: log chỉ có câu cố định và mã lỗi.
//!
//! Cổng: `Open` khi đang giữ token tài khoản hợp lệ cho máy này, hoặc khi server nói rõ `{"login":"off"}`; còn lại
//! `LoginRequired`. Lỗi khi hỏi công tắc không mở cổng (chặn mạng không thành cách lách) và cũng không đóng lại một cổng
//! đã mở: cổng giữ nguyên.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Serialize;
use sha2::{Digest, Sha256};

use super::client::{AccountApi, LoginPoll};
use super::token;
use crate::license::client::ApiError;
use crate::license::keys::PublicKeys;
use crate::license::manager::{AccountGate, AccountHook};
use crate::license::store::{self, ACCOUNT, AccountRecord, StoreError, Vault};

/// Host và đường dẫn duy nhất app chịu mở cho đăng nhập.
const GOOGLE_HOST: &str = "accounts.google.com";
const GOOGLE_AUTH_PATH: &str = "/o/oauth2/v2/auth";

/// Lát ngủ dài nhất giữa hai lần xem cờ hủy.
const SLEEP_SLICE: Duration = Duration::from_millis(20);

/// Nhịp hỏi kết quả và thời gian chờ tối đa của một lần đăng nhập.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Timing {
    pub poll_every: Duration,
    pub timeout: Duration,
}

impl Default for Timing {
    /// Spec §6.1: 3 giây một lần, tối đa 10 phút (bằng hạn của `login_attempts` trên server).
    fn default() -> Self {
        Self {
            poll_every: Duration::from_secs(3),
            timeout: Duration::from_secs(600),
        }
    }
}

/// Thứ giao diện cần: trạng thái, email để hiện, và cổng (`gate == true`: đang đòi đăng nhập). Không có token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView {
    pub state: AccountState,
    pub email: Option<String>,
    pub gate: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AccountState {
    Anonymous,
    SigningIn,
    SignedIn,
}

/// Kết quả của [`AccountService::link_license_outcome`], cho việc gắn license chạy nền: thử lại hay thôi.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LinkOutcome {
    /// Server đã gắn (hay đã gắn từ trước).
    Linked,
    /// Lỗi tạm thời (mạng, `429`, `5xx`, `login_unavailable`): thử lại sau.
    Retry,
    /// Lỗi cuối (`4xx` khác `429`, response sai dạng, chưa cấu hình server, chưa đăng nhập): không thử lại.
    Final,
}

/// Lỗi của các thao tác tài khoản; giao diện chỉ thấy [`AccountError::code`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum AccountError {
    #[error("không kết nối được license server")]
    Network,
    #[error("người dùng từ chối đăng nhập")]
    Denied,
    #[error("đăng nhập không thành")]
    Failed,
    #[error("lượt đăng nhập đã hết hạn")]
    Expired,
    #[error("đã hủy đăng nhập")]
    Cancelled,
    #[error("đang có một lượt đăng nhập")]
    Busy,
    #[error("server tạm tắt đăng nhập")]
    Unavailable,
    #[error("không đọc ghi được kho khóa")]
    Storage,
}

impl AccountError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Network => "accountNetwork",
            Self::Denied => "accountDenied",
            Self::Failed => "accountFailed",
            Self::Expired => "accountExpired",
            Self::Cancelled => "accountCancelled",
            Self::Busy => "accountBusy",
            Self::Unavailable => "accountUnavailable",
            Self::Storage => "accountStorage",
        }
    }
}

/// Phiên trong bộ nhớ. Cố ý không `Debug`: `SignedIn` mang token và email.
enum Session {
    Anonymous,
    SigningIn,
    SignedIn { token: String, email: String },
}

struct Inner {
    session: Session,
    /// Server đã nói rõ `{"login":"off"}` ở lần hỏi thành công gần nhất.
    login_off: bool,
}

pub struct AccountService {
    api: Box<dyn AccountApi>,
    vault: Arc<dyn Vault>,
    keys: PublicKeys,
    device_id_hash: String,
    timing: Timing,
    inner: Mutex<Inner>,
    /// Hủy lượt đăng nhập đang chạy. Chỉ bật khi đang `SigningIn` (dưới khóa), và `sign_in` hạ nó lúc bắt đầu (dưới khóa),
    /// nên một lần hủy cũ không ảnh hưởng lượt sau.
    cancel: AtomicBool,
}

impl AccountService {
    /// Đọc phiên từ kho khóa. Đọc lỗi, mục hỏng, token hỏng hay của máy khác: `Anonymous` (ghi log một lần), không panic.
    pub fn new(
        api: Box<dyn AccountApi>,
        vault: Arc<dyn Vault>,
        keys: PublicKeys,
        device_id_hash: String,
        timing: Timing,
    ) -> Self {
        let session = load(vault.as_ref(), &keys, &device_id_hash);
        Self {
            api,
            vault,
            keys,
            device_id_hash,
            timing,
            inner: Mutex::new(Inner {
                session,
                login_off: false,
            }),
            cancel: AtomicBool::new(false),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Chỉ đọc bộ nhớ: không I/O, không gọi server.
    pub fn view(&self) -> AccountView {
        view_of(&self.lock())
    }

    /// `GET /v1/auth/status`. Chỉ `"off"` rõ ràng mới mở cổng; `"on"` đóng lại; lỗi giữ nguyên.
    /// Trả `true` khi server trả lời thật (`on` hay `off`), `false` khi lỗi: nơi gọi hỏi lại sớm hơn.
    pub fn refresh_status(&self) -> bool {
        match self.api.status().result {
            Ok(status) => {
                self.lock().login_off = !status.login_on;
                true
            }
            Err(e) => {
                log::info!("không hỏi được công tắc đăng nhập ({}): cổng giữ nguyên", api_label(&e));
                false
            }
        }
    }

    /// Chạy cả lượt đăng nhập (chặn tới khi xong, hết hạn hay bị hủy). Đã đăng nhập thì trả trạng thái hiện tại, không gọi
    /// server; đang có lượt khác thì `Busy`. `open_url` chỉ được gọi với URL qua [`is_google_login_url`].
    pub fn sign_in(
        &self,
        lang: &str,
        open_url: &dyn Fn(&str) -> Result<(), String>,
    ) -> Result<AccountView, AccountError> {
        {
            let mut inner = self.lock();
            match inner.session {
                Session::SigningIn => return Err(AccountError::Busy),
                Session::SignedIn { .. } => return Ok(view_of(&inner)),
                Session::Anonymous => {}
            }
            inner.session = Session::SigningIn;
            self.cancel.store(false, Ordering::SeqCst);
        }
        // Từ đây phiên là `SigningIn` và chỉ lượt này đổi nó (mọi thao tác khác trả `Busy`).
        let outcome = self.run_sign_in(lang, open_url);
        let record = match outcome {
            Ok(record) => record,
            Err(e) => {
                self.lock().session = Session::Anonymous;
                return Err(e);
            }
        };
        let saved = store::write(self.vault.as_ref(), ACCOUNT, &record);
        let mut inner = self.lock();
        inner.session = Session::SignedIn {
            token: record.token,
            email: record.email,
        };
        match saved {
            Ok(()) => Ok(view_of(&inner)),
            Err(_) => {
                log::warn!("không ghi được phiên tài khoản vào kho khóa: chỉ giữ trong bộ nhớ");
                Err(AccountError::Storage)
            }
        }
    }

    /// Phần chạy không giữ khóa của `sign_in`: PKCE, `start`, mở trình duyệt, vòng hỏi.
    fn run_sign_in(
        &self,
        lang: &str,
        open_url: &dyn Fn(&str) -> Result<(), String>,
    ) -> Result<AccountRecord, AccountError> {
        let Some(verifier) = new_verifier() else {
            log::warn!("không lấy được số ngẫu nhiên cho PKCE");
            return Err(AccountError::Failed);
        };
        let challenge = challenge_of(&verifier);
        let started = match self.api.start(&self.device_id_hash, &challenge, lang).result {
            Ok(started) => started,
            Err(e) => {
                log::info!("chưa bắt đầu được đăng nhập ({})", api_label(&e));
                return Err(map_api(&e));
            }
        };
        let Some(url) = google_login_url(&started.login_url) else {
            log::warn!("server trả địa chỉ đăng nhập không phải trang Google: không mở");
            return Err(AccountError::Failed);
        };
        if self.cancelled() {
            return Err(AccountError::Cancelled);
        }
        if open_url(&url).is_err() {
            log::warn!("không mở được trình duyệt cho đăng nhập");
            return Err(AccountError::Failed);
        }
        self.poll_until_done(&started.login_id, &verifier)
    }

    /// Hỏi kết quả mỗi `poll_every` tới `timeout`. Lỗi mạng, `429`, `5xx` được thử lại; hết giờ khi lần cuối là lỗi như vậy
    /// thì `Network`, không thì `Expired`. `404` (token đã giao, login lạ) và thân không đọc được là thất bại cuối: token chỉ
    /// giao một lần, phải đăng nhập lại.
    fn poll_until_done(&self, login_id: &str, verifier: &str) -> Result<AccountRecord, AccountError> {
        let started = Instant::now();
        let mut trouble = false;
        loop {
            if self.cancelled() {
                return Err(AccountError::Cancelled);
            }
            let elapsed = started.elapsed();
            if elapsed >= self.timing.timeout {
                return Err(if trouble {
                    AccountError::Network
                } else {
                    AccountError::Expired
                });
            }
            let wait = self.timing.poll_every.min(self.timing.timeout.saturating_sub(elapsed));
            if !self.sleep(wait) {
                return Err(AccountError::Cancelled);
            }
            match self.api.poll(login_id, verifier).result {
                Ok(LoginPoll::Pending) => trouble = false,
                // Token đã giao (một lần): nhận cả khi vừa có lệnh hủy, để không mất lượt đăng nhập đã xong.
                Ok(LoginPoll::Done { token, email }) => return self.accept(token, email),
                Ok(LoginPoll::Denied) => return Err(AccountError::Denied),
                Ok(LoginPoll::Failed) => return Err(AccountError::Failed),
                Ok(LoginPoll::Expired) => return Err(AccountError::Expired),
                Err(e) if transient(&e) => trouble = true,
                Err(e) => {
                    log::info!("hỏi kết quả đăng nhập không được ({}): dừng", api_label(&e));
                    return Err(match e {
                        ApiError::NotConfigured => AccountError::Unavailable,
                        _ => AccountError::Failed,
                    });
                }
            }
        }
    }

    /// Token server vừa giao phải hợp lệ cho máy này mới nhận.
    fn accept(&self, token: String, email: String) -> Result<AccountRecord, AccountError> {
        match token::verify(&token, &self.keys, &self.device_id_hash) {
            Ok(_) => Ok(AccountRecord { token, email }),
            Err(e) => {
                log::warn!("server giao token tài khoản không dùng được: {e}");
                Err(AccountError::Failed)
            }
        }
    }

    /// Ngủ `duration` theo lát ngắn; `false` nếu bị hủy giữa chừng.
    fn sleep(&self, duration: Duration) -> bool {
        let start = Instant::now();
        loop {
            if self.cancelled() {
                return false;
            }
            let left = duration.saturating_sub(start.elapsed());
            if left.is_zero() {
                return true;
            }
            thread::sleep(left.min(SLEEP_SLICE));
        }
    }

    /// Hủy lượt đăng nhập đang chạy; không có lượt nào thì không làm gì.
    pub fn cancel(&self) {
        let inner = self.lock();
        if matches!(inner.session, Session::SigningIn) {
            self.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Xóa token khỏi kho khóa rồi về `Anonymous` (không cần gọi server). Không xóa được thì `Storage` và giữ phiên, để bộ
    /// nhớ khớp kho khóa và người dùng thử lại được. Đang đăng nhập: `Busy`.
    pub fn sign_out(&self) -> Result<AccountView, AccountError> {
        {
            let inner = self.lock();
            match inner.session {
                Session::SigningIn => return Err(AccountError::Busy),
                Session::Anonymous => return Ok(view_of(&inner)),
                Session::SignedIn { .. } => {}
            }
        }
        if store::delete(self.vault.as_ref(), ACCOUNT).is_err() {
            log::warn!("không xóa được phiên tài khoản khỏi kho khóa: giữ phiên");
            return Err(AccountError::Storage);
        }
        let mut inner = self.lock();
        if matches!(inner.session, Session::SignedIn { .. }) {
            inner.session = Session::Anonymous;
        }
        Ok(view_of(&inner))
    }

    /// Xóa tài khoản trên server trước; lỗi thì giữ nguyên token cục bộ. `401` (đã xóa, token hết hiệu lực) coi như xóa xong.
    /// Chưa đăng nhập: không gọi server. Đang đăng nhập: `Busy`.
    pub fn delete(&self) -> Result<AccountView, AccountError> {
        let token = {
            let inner = self.lock();
            match &inner.session {
                Session::SigningIn => return Err(AccountError::Busy),
                Session::Anonymous => return Ok(view_of(&inner)),
                Session::SignedIn { token, .. } => token.clone(),
            }
        };
        match self.api.delete(&token).result {
            Ok(()) => {}
            Err(ApiError::Server(s)) if s.status == 401 => {
                log::info!("server không còn nhận token tài khoản: coi như đã xóa");
            }
            Err(e) => {
                log::info!("chưa xóa được tài khoản ({}): giữ phiên", api_label(&e));
                return Err(map_api(&e));
            }
        }
        // Tài khoản đã xóa trên server: token không còn giá trị, bỏ khỏi bộ nhớ kể cả khi kho khóa không xóa được.
        let removed = store::delete(self.vault.as_ref(), ACCOUNT);
        let mut inner = self.lock();
        if matches!(&inner.session, Session::SignedIn { token: held, .. } if *held == token) {
            inner.session = Session::Anonymous;
        }
        match removed {
            Ok(()) => Ok(view_of(&inner)),
            Err(_) => {
                log::warn!("tài khoản đã xóa nhưng không xóa được token khỏi kho khóa");
                Err(AccountError::Storage)
            }
        }
    }

    /// `POST /v1/account/link-license` với token đang giữ. Chưa đăng nhập: `Failed`, không gọi server.
    pub fn link_license(&self, key: &str, activation_id: &str) -> Result<(), AccountError> {
        let Some(token) = self.held_token() else {
            return Err(AccountError::Failed);
        };
        self.api.link_license(&token, key, activation_id).result.map_err(|e| {
            log::info!("chưa gắn được license vào tài khoản ({})", api_label(&e));
            map_api(&e)
        })
    }

    /// Như [`AccountService::link_license`], cho việc gắn chạy nền: phân loại thử lại từ lỗi gốc (trước khi gộp thành
    /// [`AccountError`]). Mạng, `429`, mọi `5xx` và `login_unavailable`: [`LinkOutcome::Retry`]; `4xx` khác, response sai dạng,
    /// chưa cấu hình server: [`LinkOutcome::Final`]. Chưa đăng nhập: `Final`, không gọi server.
    pub fn link_license_outcome(&self, key: &str, activation_id: &str) -> LinkOutcome {
        let Some(token) = self.held_token() else {
            return LinkOutcome::Final;
        };
        match self.api.link_license(&token, key, activation_id).result {
            Ok(()) => LinkOutcome::Linked,
            Err(e) => {
                let outcome = match &e {
                    ApiError::Network(_) => LinkOutcome::Retry,
                    ApiError::Server(s) if s.status == 429 || s.status >= 500 || s.code == "login_unavailable" => {
                        LinkOutcome::Retry
                    }
                    ApiError::Server(_) | ApiError::Decode(_) | ApiError::NotConfigured => LinkOutcome::Final,
                };
                let then = if outcome == LinkOutcome::Retry {
                    "thử lại sau"
                } else {
                    "bỏ"
                };
                log::info!("chưa gắn được license vào tài khoản ({}): {then}", api_label(&e));
                outcome
            }
        }
    }

    fn held_token(&self) -> Option<String> {
        match &self.lock().session {
            Session::SignedIn { token, .. } => Some(token.clone()),
            Session::Anonymous | Session::SigningIn => None,
        }
    }
}

impl AccountHook for AccountService {
    /// Chỉ đọc bộ nhớ dưới khóa ngắn.
    fn gate(&self) -> AccountGate {
        gate_of(&self.lock())
    }

    /// Chỉ đọc bộ nhớ dưới khóa ngắn.
    fn bearer(&self) -> Option<String> {
        self.held_token()
    }
}

/// Phiên đọc từ kho khóa lúc dựng.
fn load(vault: &dyn Vault, keys: &PublicKeys, device_id_hash: &str) -> Session {
    match store::read::<AccountRecord>(vault, ACCOUNT) {
        Ok(None) => Session::Anonymous,
        Ok(Some(record)) => match token::verify(&record.token, keys, device_id_hash) {
            Ok(_) => Session::SignedIn {
                token: record.token,
                email: record.email,
            },
            Err(e) => {
                log::warn!("token tài khoản trong kho khóa không dùng được ({e}): coi như chưa đăng nhập");
                Session::Anonymous
            }
        },
        Err(StoreError::Corrupt(_)) => {
            log::warn!("phiên tài khoản trong kho khóa hỏng: coi như chưa đăng nhập");
            Session::Anonymous
        }
        Err(StoreError::Keystore(_)) => {
            log::warn!("không đọc được phiên tài khoản từ kho khóa: coi như chưa đăng nhập");
            Session::Anonymous
        }
    }
}

fn gate_of(inner: &Inner) -> AccountGate {
    if matches!(inner.session, Session::SignedIn { .. }) || inner.login_off {
        AccountGate::Open
    } else {
        AccountGate::LoginRequired
    }
}

fn view_of(inner: &Inner) -> AccountView {
    let (state, email) = match &inner.session {
        Session::Anonymous => (AccountState::Anonymous, None),
        Session::SigningIn => (AccountState::SigningIn, None),
        Session::SignedIn { email, .. } => (AccountState::SignedIn, Some(email.clone())),
    };
    AccountView {
        state,
        email,
        gate: gate_of(inner) == AccountGate::LoginRequired,
    }
}

/// Lỗi tạm thời khi hỏi kết quả: thử lại tới hết giờ.
fn transient(e: &ApiError) -> bool {
    match e {
        ApiError::Network(_) => true,
        ApiError::Server(s) => s.status == 429 || s.status >= 500,
        ApiError::NotConfigured | ApiError::Decode(_) => false,
    }
}

/// Mã lỗi cho giao diện của một lỗi API (ngoài vòng hỏi).
fn map_api(e: &ApiError) -> AccountError {
    match e {
        ApiError::NotConfigured => AccountError::Unavailable,
        ApiError::Network(_) => AccountError::Network,
        ApiError::Server(s) if s.status == 503 || s.code == "login_unavailable" => AccountError::Unavailable,
        ApiError::Server(_) | ApiError::Decode(_) => AccountError::Failed,
    }
}

/// Nhãn ngắn của một lỗi API để ghi log: không chép thông báo lỗi mạng hay nội dung response.
fn api_label(e: &ApiError) -> String {
    match e {
        ApiError::NotConfigured => "not_configured".into(),
        ApiError::Network(_) => "network".into(),
        ApiError::Server(s) => format!("server {} {}", s.status, s.code),
        ApiError::Decode(_) => "decode".into(),
    }
}

/// Verifier PKCE: 32 byte ngẫu nhiên của hệ điều hành, base64url không đệm (43 ký tự).
fn new_verifier() -> Option<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).ok()?;
    Some(URL_SAFE_NO_PAD.encode(bytes))
}

/// `challenge` = SHA-256 của verifier, base64url không đệm (PKCE `S256`).
fn challenge_of(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()).as_slice())
}

/// URL đã chuẩn hóa nếu là trang đăng nhập Google: `https`, không có tên hay mật khẩu, host đúng `accounts.google.com`,
/// cổng mặc định, đường dẫn đúng `/o/oauth2/v2/auth`. App mở bản chuẩn hóa này, đúng thứ đã kiểm.
fn google_login_url(url: &str) -> Option<String> {
    let parsed = reqwest::Url::parse(url).ok()?;
    let ok = parsed.scheme() == "https"
        && parsed.username().is_empty()
        && parsed.password().is_none()
        && parsed.host_str() == Some(GOOGLE_HOST)
        && parsed.port().is_none()
        && parsed.path() == GOOGLE_AUTH_PATH;
    ok.then(|| parsed.into())
}

/// `true` chỉ với trang đăng nhập Google qua `https` (xem [`google_login_url`]).
pub fn is_google_login_url(url: &str) -> bool {
    google_login_url(url).is_some()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::indexing_slicing)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::atomic::AtomicUsize;
    use std::sync::mpsc;
    use std::thread;

    use serde_json::{Value, json};

    use super::*;
    use crate::account::client::{LoginStart, LoginStatus};
    use crate::license::client::{Reply, ServerError};
    use crate::license::store::tests::FakeVault;

    const VECTORS: &str = include_str!("../../../server/test/vectors/token-account-v1.json");
    const GOOGLE_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth?client_id=c&scope=openid%20email&state=s";
    const EMAIL: &str = "nguoi.dung@example.com";

    fn vectors() -> Value {
        serde_json::from_str(VECTORS).unwrap()
    }

    fn keys() -> PublicKeys {
        let v = vectors();
        let pairs = v["public_keys"].as_object().unwrap();
        PublicKeys::from_pairs(pairs.iter().map(|(k, x)| (k.as_str(), x.as_str().unwrap()))).unwrap()
    }

    /// Token hợp lệ của vector `valid` và `device_id_hash` của nó.
    fn valid() -> (String, String) {
        let v = vectors();
        let t = v["tokens"]
            .as_array()
            .unwrap()
            .iter()
            .find(|t| t["name"] == "valid")
            .unwrap()
            .clone();
        (
            t["token"].as_str().unwrap().into(),
            t["device_id_hash"].as_str().unwrap().into(),
        )
    }

    fn token() -> String {
        valid().0
    }

    fn device() -> String {
        valid().1
    }

    fn server(status: u16, code: &str) -> ApiError {
        ApiError::Server(Box::new(ServerError {
            status,
            code: code.into(),
            ..Default::default()
        }))
    }

    fn done() -> LoginPoll {
        LoginPoll::Done {
            token: token(),
            email: EMAIL.into(),
        }
    }

    fn record() -> AccountRecord {
        AccountRecord {
            token: token(),
            email: EMAIL.into(),
        }
    }

    fn reply<T>(result: Result<T, ApiError>) -> Reply<T> {
        Reply { result, date: None }
    }

    /// Lần `poll` kế tiếp báo "đã tới", rồi chờ tín hiệu mới trả kết quả.
    type PollHold = (mpsc::Sender<()>, mpsc::Receiver<()>);

    /// API giả theo kịch bản, đếm số lần gọi từng lệnh. Hết kịch bản: `status` lỗi mạng, `start` trả URL Google, `poll`
    /// trả `Pending` (hoặc lỗi mạng nếu `poll_network_when_empty`), `delete`/`link_license` thành công.
    #[derive(Default)]
    struct FakeAccountApi {
        statuses: Mutex<VecDeque<Result<LoginStatus, ApiError>>>,
        starts: Mutex<VecDeque<Result<LoginStart, ApiError>>>,
        polls: Mutex<VecDeque<Result<LoginPoll, ApiError>>>,
        poll_network_when_empty: AtomicBool,
        deletes: Mutex<VecDeque<Result<(), ApiError>>>,
        links: Mutex<VecDeque<Result<(), ApiError>>>,
        hold_poll: Mutex<Option<PollHold>>,
        status_calls: AtomicUsize,
        start_calls: AtomicUsize,
        poll_calls: AtomicUsize,
        delete_calls: AtomicUsize,
        link_calls: AtomicUsize,
        /// `(device_id_hash, challenge, lang)` của mỗi lần `start`.
        started_with: Mutex<Vec<(String, String, String)>>,
        /// `verifier` của mỗi lần `poll`.
        verifiers: Mutex<Vec<String>>,
        /// Token gửi kèm `delete`/`link_license`.
        bearers: Mutex<Vec<String>>,
    }

    impl FakeAccountApi {
        fn total_calls(&self) -> usize {
            [
                &self.status_calls,
                &self.start_calls,
                &self.poll_calls,
                &self.delete_calls,
                &self.link_calls,
            ]
            .iter()
            .map(|c| c.load(Ordering::SeqCst))
            .sum()
        }

        fn polls(&self) -> usize {
            self.poll_calls.load(Ordering::SeqCst)
        }

        fn with_url(url: &str) -> Arc<Self> {
            let api = Arc::new(Self::default());
            api.starts.lock().unwrap().push_back(Ok(LoginStart {
                login_id: "login-1".into(),
                login_url: url.into(),
                expires_at: 1,
            }));
            api
        }

        fn script_polls(&self, polls: Vec<Result<LoginPoll, ApiError>>) {
            self.polls.lock().unwrap().extend(polls);
        }

        /// Lần `poll` kế tiếp dừng lại: trả kênh "đã tới" và kênh "đi tiếp".
        fn hold_next_poll(&self) -> (mpsc::Receiver<()>, mpsc::Sender<()>) {
            let (reached_tx, reached_rx) = mpsc::channel();
            let (release_tx, release_rx) = mpsc::channel();
            *self.hold_poll.lock().unwrap() = Some((reached_tx, release_rx));
            (reached_rx, release_tx)
        }
    }

    impl AccountApi for Arc<FakeAccountApi> {
        fn status(&self) -> Reply<LoginStatus> {
            self.status_calls.fetch_add(1, Ordering::SeqCst);
            let next = self.statuses.lock().unwrap().pop_front();
            reply(next.unwrap_or_else(|| Err(ApiError::Network("mất mạng".into()))))
        }

        fn start(&self, device_id_hash: &str, challenge: &str, lang: &str) -> Reply<LoginStart> {
            self.start_calls.fetch_add(1, Ordering::SeqCst);
            self.started_with
                .lock()
                .unwrap()
                .push((device_id_hash.into(), challenge.into(), lang.into()));
            let next = self.starts.lock().unwrap().pop_front();
            reply(next.unwrap_or_else(|| {
                Ok(LoginStart {
                    login_id: "login-1".into(),
                    login_url: GOOGLE_URL.into(),
                    expires_at: 1,
                })
            }))
        }

        fn poll(&self, _login_id: &str, verifier: &str) -> Reply<LoginPoll> {
            self.poll_calls.fetch_add(1, Ordering::SeqCst);
            self.verifiers.lock().unwrap().push(verifier.into());
            let hold = self.hold_poll.lock().unwrap().take();
            if let Some((reached, release)) = hold {
                let _ = reached.send(());
                let _ = release.recv();
            }
            let next = self.polls.lock().unwrap().pop_front();
            reply(next.unwrap_or_else(|| {
                if self.poll_network_when_empty.load(Ordering::SeqCst) {
                    Err(ApiError::Network("mất mạng".into()))
                } else {
                    Ok(LoginPoll::Pending)
                }
            }))
        }

        fn link_license(&self, token: &str, _key: &str, _activation_id: &str) -> Reply<()> {
            self.link_calls.fetch_add(1, Ordering::SeqCst);
            self.bearers.lock().unwrap().push(token.into());
            reply(self.links.lock().unwrap().pop_front().unwrap_or(Ok(())))
        }

        fn delete(&self, token: &str) -> Reply<()> {
            self.delete_calls.fetch_add(1, Ordering::SeqCst);
            self.bearers.lock().unwrap().push(token.into());
            reply(self.deletes.lock().unwrap().pop_front().unwrap_or(Ok(())))
        }
    }

    fn ms(n: u64) -> Duration {
        Duration::from_millis(n)
    }

    /// Hỏi mỗi 2 ms, hết hạn sau `timeout_ms`.
    fn timing(timeout_ms: u64) -> Timing {
        Timing {
            poll_every: ms(2),
            timeout: ms(timeout_ms),
        }
    }

    fn service_for(api: &Arc<FakeAccountApi>, vault: &Arc<FakeVault>, device: &str, t: Timing) -> AccountService {
        AccountService::new(Box::new(api.clone()), vault.clone(), keys(), device.into(), t)
    }

    fn service(api: &Arc<FakeAccountApi>, vault: &Arc<FakeVault>) -> AccountService {
        service_for(api, vault, &device(), timing(5_000))
    }

    fn vault_with(rec: &AccountRecord) -> Arc<FakeVault> {
        let vault = Arc::new(FakeVault::default());
        store::write(vault.as_ref(), ACCOUNT, rec).unwrap();
        vault.writes.lock().unwrap().clear();
        vault
    }

    fn stored(vault: &Arc<FakeVault>) -> Option<AccountRecord> {
        vault
            .items
            .lock()
            .unwrap()
            .get(ACCOUNT)
            .map(|b| serde_json::from_slice(b).unwrap())
    }

    /// Hàm mở trình duyệt giả: ghi lại các URL đã mở.
    fn opener(opened: &Arc<Mutex<Vec<String>>>) -> impl Fn(&str) -> Result<(), String> {
        let opened = opened.clone();
        move |url: &str| {
            opened.lock().unwrap().push(url.into());
            Ok(())
        }
    }

    fn no_open(url: &str) -> Result<(), String> {
        panic!("không được mở {url}")
    }

    fn ok_open(_: &str) -> Result<(), String> {
        Ok(())
    }

    /// Chờ tối đa 5 giây cho điều kiện thành đúng.
    fn wait_until(what: &str, cond: impl Fn() -> bool) {
        let start = Instant::now();
        while !cond() {
            assert!(start.elapsed() < Duration::from_secs(5), "chờ quá lâu: {what}");
            thread::sleep(ms(1));
        }
    }

    // ---------- Mã lỗi, PKCE, kiểm URL ----------

    #[test]
    fn error_codes_are_exactly_the_documented_strings() {
        let pairs = [
            (AccountError::Network, "accountNetwork"),
            (AccountError::Denied, "accountDenied"),
            (AccountError::Failed, "accountFailed"),
            (AccountError::Expired, "accountExpired"),
            (AccountError::Cancelled, "accountCancelled"),
            (AccountError::Busy, "accountBusy"),
            (AccountError::Unavailable, "accountUnavailable"),
            (AccountError::Storage, "accountStorage"),
        ];
        for (e, code) in pairs {
            assert_eq!(e.code(), code);
        }
    }

    /// `challenge` = SHA-256 của verifier, base64url không đệm (vector của RFC 7636 phụ lục B).
    #[test]
    fn the_pkce_challenge_matches_rfc_7636() {
        assert_eq!(
            challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn is_google_login_url_accepts_only_the_google_auth_page_over_https() {
        for good in [
            GOOGLE_URL,
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://accounts.google.com:443/o/oauth2/v2/auth?x=1",
            "HTTPS://ACCOUNTS.GOOGLE.COM/o/oauth2/v2/auth?state=s",
        ] {
            assert!(is_google_login_url(good), "{good}");
        }
        for bad in [
            "",
            "không phải URL",
            "http://accounts.google.com/o/oauth2/v2/auth",
            "https://evil.com/o/oauth2/v2/auth",
            "https://accounts.google.com.evil.com/o/oauth2/v2/auth",
            "https://evil.com/accounts.google.com/o/oauth2/v2/auth",
            "https://accounts.google.com@evil.com/o/oauth2/v2/auth",
            "https://user:pw@accounts.google.com/o/oauth2/v2/auth",
            "https://user@accounts.google.com/o/oauth2/v2/auth",
            "https://accounts.google.com./o/oauth2/v2/auth",
            "https://xaccounts.google.com/o/oauth2/v2/auth",
            "https://google.com/o/oauth2/v2/auth",
            "https://accounts.google.com:8443/o/oauth2/v2/auth",
            "https://accounts.google.com/o/oauth2/v2/auth/",
            "https://accounts.google.com/o/oauth2/auth",
            "https://accounts.google.com/",
            "https://accounts.google.com/o/oauth2/v2/authx",
            "https://accounts.google.com\\@evil.com/o/oauth2/v2/auth",
            "javascript:alert(1)//accounts.google.com/o/oauth2/v2/auth",
            "file:///o/oauth2/v2/auth",
            "//accounts.google.com/o/oauth2/v2/auth",
        ] {
            assert!(!is_google_login_url(bad), "{bad}");
        }
    }

    // ---------- Dựng từ kho khóa ----------

    #[test]
    fn a_valid_stored_token_for_this_device_starts_signed_in_and_opens_the_gate() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &vault_with(&record()));
        let view = svc.view();
        assert_eq!(view.state, AccountState::SignedIn);
        assert_eq!(view.email.as_deref(), Some(EMAIL));
        assert!(!view.gate);
        assert_eq!(svc.gate(), AccountGate::Open);
        assert_eq!(svc.bearer(), Some(token()));
        assert_eq!(api.total_calls(), 0);
    }

    #[test]
    fn an_unreadable_vault_is_anonymous_without_panicking() {
        let vault = vault_with(&record());
        *vault.fail_reads.lock().unwrap() = true;
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &vault);
        let view = svc.view();
        assert_eq!(view.state, AccountState::Anonymous);
        assert_eq!(view.email, None);
        assert!(view.gate);
        assert_eq!(svc.gate(), AccountGate::LoginRequired);
        assert_eq!(svc.bearer(), None);
    }

    #[test]
    fn a_token_of_another_device_is_anonymous() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service_for(&api, &vault_with(&record()), "may-khac", timing(5_000));
        assert_eq!(svc.view().state, AccountState::Anonymous);
        assert_eq!(svc.gate(), AccountGate::LoginRequired);
        assert_eq!(svc.bearer(), None);
    }

    #[test]
    fn a_broken_token_or_a_corrupt_item_is_anonymous() {
        let api = Arc::new(FakeAccountApi::default());
        let broken = AccountRecord {
            token: "v1.hong.hong".into(),
            email: EMAIL.into(),
        };
        let svc = service(&api, &vault_with(&broken));
        assert_eq!(svc.view().state, AccountState::Anonymous);
        assert_eq!(svc.bearer(), None);

        for raw in [&b"khong-phai-json"[..], b"", b"{}", b"{\"token\":1}"] {
            let vault = Arc::new(FakeVault::default());
            vault.items.lock().unwrap().insert(ACCOUNT.into(), raw.to_vec());
            let svc = service(&api, &vault);
            assert_eq!(svc.view().state, AccountState::Anonymous, "{raw:?}");
            assert_eq!(svc.bearer(), None);
        }
        assert_eq!(api.total_calls(), 0);
    }

    #[test]
    fn view_never_calls_the_api() {
        let api = Arc::new(FakeAccountApi::default());
        let anon = service(&api, &Arc::new(FakeVault::default()));
        let signed = service(&api, &vault_with(&record()));
        for _ in 0..10 {
            let _ = anon.view();
            let _ = signed.view();
            let _ = anon.gate();
            let _ = signed.bearer();
        }
        assert_eq!(api.total_calls(), 0);
    }

    #[test]
    fn the_view_serializes_in_camel_case_without_the_token() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &vault_with(&record()));
        let v = serde_json::to_value(svc.view()).unwrap();
        assert_eq!(v, json!({ "state": "signedIn", "email": EMAIL, "gate": false }));
        let anon = service(&api, &Arc::new(FakeVault::default()));
        let v = serde_json::to_value(anon.view()).unwrap();
        assert_eq!(v, json!({ "state": "anonymous", "email": null, "gate": true }));
    }

    // ---------- Đăng nhập ----------

    #[test]
    fn a_successful_sign_in_stores_the_token_and_returns_signed_in() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(LoginPoll::Pending), Ok(done())]);
        let vault = Arc::new(FakeVault::default());
        let svc = service(&api, &vault);
        let opened = Arc::new(Mutex::new(Vec::new()));
        let view = svc.sign_in("ja", &opener(&opened)).unwrap();
        assert_eq!(view.state, AccountState::SignedIn);
        assert_eq!(view.email.as_deref(), Some(EMAIL));
        assert!(!view.gate);
        assert_eq!(svc.view(), view);
        assert_eq!(stored(&vault), Some(record()));
        assert_eq!(*opened.lock().unwrap(), [GOOGLE_URL]);
        assert_eq!(svc.gate(), AccountGate::Open);
        assert_eq!(svc.bearer(), Some(token()));
        // PKCE: challenge gửi lúc `start` là SHA-256 của verifier gửi lúc `poll`; verifier 32 byte base64url (43 ký tự).
        let (dev, challenge, lang) = api.started_with.lock().unwrap()[0].clone();
        assert_eq!((dev.as_str(), lang.as_str()), (device().as_str(), "ja"));
        let verifiers = api.verifiers.lock().unwrap().clone();
        assert_eq!(verifiers.len(), 2);
        assert_eq!(verifiers[0].len(), 43);
        assert!(verifiers.iter().all(|v| v == &verifiers[0]));
        assert_eq!(challenge_of(&verifiers[0]), challenge);
        assert_eq!(api.polls(), 2);
    }

    #[test]
    fn each_sign_in_uses_a_fresh_verifier() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(LoginPoll::Denied), Ok(LoginPoll::Denied)]);
        let svc = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Denied));
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Denied));
        let v = api.verifiers.lock().unwrap().clone();
        assert_ne!(v[0], v[1]);
    }

    #[test]
    fn only_a_google_url_is_opened_any_other_is_failed_and_not_opened() {
        for url in [
            "https://evil.com/o/oauth2/v2/auth",
            "http://accounts.google.com/o/oauth2/v2/auth",
            "https://accounts.google.com.evil.com/o/oauth2/v2/auth",
            "https://accounts.google.com@evil.com/o/oauth2/v2/auth",
            "https://accounts.google.com/other",
        ] {
            let api = FakeAccountApi::with_url(url);
            let vault = Arc::new(FakeVault::default());
            let svc = service(&api, &vault);
            assert_eq!(svc.sign_in("vi", &no_open), Err(AccountError::Failed), "{url}");
            assert_eq!(api.polls(), 0, "{url}");
            assert_eq!(svc.view().state, AccountState::Anonymous);
            assert_eq!(stored(&vault), None);
        }
    }

    #[test]
    fn a_browser_that_cannot_open_is_failed_without_polling() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        let result = svc.sign_in("vi", &|_: &str| Err("không có trình duyệt".to_string()));
        assert_eq!(result, Err(AccountError::Failed));
        assert_eq!(api.polls(), 0);
        assert_eq!(svc.view().state, AccountState::Anonymous);
    }

    #[test]
    fn start_errors_map_to_codes_and_never_open() {
        for (err, expected) in [
            (ApiError::Network("x".into()), AccountError::Network),
            (ApiError::NotConfigured, AccountError::Unavailable),
            (server(503, "login_unavailable"), AccountError::Unavailable),
            (server(429, "rate_limited"), AccountError::Failed),
            (server(400, "invalid_request"), AccountError::Failed),
            (ApiError::Decode("x".into()), AccountError::Failed),
        ] {
            let api = Arc::new(FakeAccountApi::default());
            api.starts.lock().unwrap().push_back(Err(err));
            let svc = service(&api, &Arc::new(FakeVault::default()));
            assert_eq!(svc.sign_in("vi", &no_open), Err(expected));
            assert_eq!(api.polls(), 0);
            assert_eq!(svc.view().state, AccountState::Anonymous);
        }
    }

    #[test]
    fn denied_failed_and_expired_polls_map_to_their_codes() {
        for (poll, expected) in [
            (LoginPoll::Denied, AccountError::Denied),
            (LoginPoll::Failed, AccountError::Failed),
            (LoginPoll::Expired, AccountError::Expired),
        ] {
            let api = Arc::new(FakeAccountApi::default());
            api.script_polls(vec![Ok(LoginPoll::Pending), Ok(poll)]);
            let vault = Arc::new(FakeVault::default());
            let svc = service(&api, &vault);
            assert_eq!(svc.sign_in("vi", &ok_open), Err(expected));
            assert_eq!(api.polls(), 2);
            assert_eq!(svc.view().state, AccountState::Anonymous);
            assert_eq!(svc.gate(), AccountGate::LoginRequired);
            assert_eq!(stored(&vault), None);
        }
    }

    /// Token chỉ giao một lần: `404` (đã giao, login lạ) hay thân không đọc được là thất bại cuối, không hỏi tiếp.
    #[test]
    fn a_poll_404_or_decode_error_is_final() {
        for err in [
            server(404, "not_found"),
            ApiError::Decode("poll: sai dạng".into()),
            server(400, "invalid_request"),
        ] {
            let api = Arc::new(FakeAccountApi::default());
            api.script_polls(vec![Err(err)]);
            let svc = service(&api, &Arc::new(FakeVault::default()));
            assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Failed));
            assert_eq!(api.polls(), 1);
            assert_eq!(svc.view().state, AccountState::Anonymous);
        }
    }

    #[test]
    fn a_done_token_for_another_device_is_failed_and_not_stored() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(done())]);
        let vault = Arc::new(FakeVault::default());
        let svc = service_for(&api, &vault, "may-khac", timing(5_000));
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Failed));
        assert_eq!(stored(&vault), None);
        assert_eq!(svc.bearer(), None);
        api.script_polls(vec![Ok(LoginPoll::Done {
            token: "v1.hong.hong".into(),
            email: EMAIL.into(),
        })]);
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Failed));
        assert_eq!(stored(&vault), None);
    }

    #[test]
    fn network_errors_while_polling_are_retried_until_the_timeout_then_network() {
        let api = Arc::new(FakeAccountApi::default());
        api.poll_network_when_empty.store(true, Ordering::SeqCst);
        let svc = service_for(&api, &Arc::new(FakeVault::default()), &device(), timing(60));
        let started = Instant::now();
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Network));
        assert!(api.polls() >= 2, "{}", api.polls());
        assert!(started.elapsed() < Duration::from_secs(3));
        assert_eq!(svc.view().state, AccountState::Anonymous);
    }

    #[test]
    fn transient_server_errors_are_retried_and_a_later_done_succeeds() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![
            Err(ApiError::Network("x".into())),
            Err(server(503, "unavailable")),
            Err(server(429, "rate_limited")),
            Ok(done()),
        ]);
        let svc = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(svc.sign_in("vi", &ok_open).unwrap().state, AccountState::SignedIn);
        assert_eq!(api.polls(), 4);
    }

    #[test]
    fn pending_until_the_timeout_is_expired() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service_for(&api, &Arc::new(FakeVault::default()), &device(), timing(40));
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Expired));
        assert!(api.polls() >= 1);
        assert_eq!(svc.view().state, AccountState::Anonymous);
    }

    #[test]
    fn a_failed_token_write_is_storage_but_the_session_is_signed_in_in_memory() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(done())]);
        let vault = Arc::new(FakeVault::default());
        *vault.fail_writes_of.lock().unwrap() = Some(ACCOUNT.into());
        let svc = service(&api, &vault);
        assert_eq!(svc.sign_in("vi", &ok_open), Err(AccountError::Storage));
        assert_eq!(svc.view().state, AccountState::SignedIn);
        assert_eq!(svc.view().email.as_deref(), Some(EMAIL));
        assert_eq!(svc.gate(), AccountGate::Open);
        assert_eq!(svc.bearer(), Some(token()));
        assert_eq!(stored(&vault), None);
    }

    #[test]
    fn sign_in_when_already_signed_in_returns_the_view_without_calling_the_server() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &vault_with(&record()));
        let view = svc.sign_in("vi", &no_open).unwrap();
        assert_eq!(view.state, AccountState::SignedIn);
        assert_eq!(api.total_calls(), 0);
    }

    /// Hủy lúc đang chờ: vòng hỏi dừng ngay (không đợi hết `timeout`), trả `Cancelled`, về `Anonymous`.
    #[test]
    fn cancel_stops_the_poll_loop_and_returns_cancelled() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = Arc::new(service_for(
            &api,
            &Arc::new(FakeVault::default()),
            &device(),
            timing(60_000),
        ));
        let worker = {
            let svc = svc.clone();
            thread::spawn(move || svc.sign_in("vi", &ok_open))
        };
        wait_until("đang hỏi", || api.polls() >= 2);
        assert_eq!(svc.view().state, AccountState::SigningIn);
        let cancelled_at = Instant::now();
        svc.cancel();
        assert_eq!(worker.join().unwrap(), Err(AccountError::Cancelled));
        assert!(cancelled_at.elapsed() < Duration::from_secs(2));
        assert_eq!(svc.view().state, AccountState::Anonymous);
        let polls = api.polls();
        thread::sleep(ms(20));
        assert_eq!(api.polls(), polls, "vẫn còn hỏi sau khi hủy");
    }

    #[test]
    fn cancel_before_any_sign_in_is_a_no_op() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(done())]);
        let svc = service(&api, &Arc::new(FakeVault::default()));
        svc.cancel();
        svc.cancel();
        assert_eq!(svc.view().state, AccountState::Anonymous);
        assert_eq!(api.total_calls(), 0);
        // Lần hủy cũ không làm hỏng lần đăng nhập sau.
        assert_eq!(svc.sign_in("vi", &ok_open).unwrap().state, AccountState::SignedIn);
    }

    /// `sign_in` thứ hai khi lần đầu còn chạy là `Busy` ngay, không gọi `start` lần nữa.
    #[test]
    fn a_second_sign_in_while_one_is_running_is_busy() {
        let api = Arc::new(FakeAccountApi::default());
        let (reached, release) = api.hold_next_poll();
        let svc = Arc::new(service(&api, &Arc::new(FakeVault::default())));
        let worker = {
            let svc = svc.clone();
            thread::spawn(move || svc.sign_in("vi", &ok_open))
        };
        reached.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(svc.sign_in("vi", &no_open), Err(AccountError::Busy));
        assert_eq!(api.start_calls.load(Ordering::SeqCst), 1);
        assert_eq!(svc.sign_out(), Err(AccountError::Busy));
        assert_eq!(svc.delete(), Err(AccountError::Busy));
        svc.cancel();
        release.send(()).unwrap();
        assert_eq!(worker.join().unwrap(), Err(AccountError::Cancelled));
        assert_eq!(svc.view().state, AccountState::Anonymous);
    }

    /// Trong lúc `sign_in` đang kẹt giữa một lần hỏi (mạng chậm), `gate`, `bearer`, `view` vẫn trả ngay: không có khóa nào
    /// bị giữ qua lần gọi mạng.
    #[test]
    fn gate_bearer_and_view_answer_while_sign_in_is_blocked_mid_poll() {
        let api = Arc::new(FakeAccountApi::default());
        let (reached, release) = api.hold_next_poll();
        let svc = Arc::new(service(&api, &Arc::new(FakeVault::default())));
        let worker = {
            let svc = svc.clone();
            thread::spawn(move || svc.sign_in("vi", &ok_open))
        };
        reached.recv_timeout(Duration::from_secs(5)).unwrap();
        let (tx, rx) = mpsc::channel();
        {
            let svc = svc.clone();
            thread::spawn(move || {
                let answer = (svc.gate(), svc.bearer(), svc.view().state);
                let _ = tx.send(answer);
            });
        }
        let answer = rx
            .recv_timeout(Duration::from_secs(2))
            .expect("gate/bearer/view bị chặn");
        assert_eq!(answer, (AccountGate::LoginRequired, None, AccountState::SigningIn));
        svc.cancel();
        release.send(()).unwrap();
        assert_eq!(worker.join().unwrap(), Err(AccountError::Cancelled));
    }

    // ---------- Đăng xuất ----------

    #[test]
    fn sign_out_removes_the_token_and_closes_the_gate_without_calling_the_server() {
        let api = Arc::new(FakeAccountApi::default());
        let vault = vault_with(&record());
        let svc = service(&api, &vault);
        assert_eq!(svc.gate(), AccountGate::Open);
        let view = svc.sign_out().unwrap();
        assert_eq!(view.state, AccountState::Anonymous);
        assert_eq!(view.email, None);
        assert!(view.gate);
        assert_eq!(svc.gate(), AccountGate::LoginRequired);
        assert_eq!(svc.bearer(), None);
        assert_eq!(stored(&vault), None);
        assert_eq!(api.total_calls(), 0);
    }

    #[test]
    fn sign_out_when_anonymous_is_a_no_op() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(svc.sign_out().unwrap().state, AccountState::Anonymous);
        assert_eq!(api.total_calls(), 0);
    }

    /// Không xóa được khỏi kho khóa: báo `Storage` và giữ phiên (bộ nhớ khớp kho khóa; người dùng thử lại được).
    #[test]
    fn sign_out_with_a_failing_vault_delete_is_storage_and_keeps_the_session() {
        let api = Arc::new(FakeAccountApi::default());
        let vault = vault_with(&record());
        *vault.fail_deletes.lock().unwrap() = true;
        let svc = service(&api, &vault);
        assert_eq!(svc.sign_out(), Err(AccountError::Storage));
        assert_eq!(svc.view().state, AccountState::SignedIn);
        assert_eq!(svc.bearer(), Some(token()));
    }

    // ---------- Công tắc của server ----------

    #[test]
    fn the_gate_opens_only_on_an_explicit_off_and_errors_keep_it_as_it_was() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        // Chưa hỏi: đóng.
        assert_eq!(svc.gate(), AccountGate::LoginRequired);
        for err in [
            ApiError::Network("x".into()),
            server(503, "x"),
            server(500, "internal"),
            ApiError::Decode("status".into()),
            ApiError::NotConfigured,
        ] {
            api.statuses.lock().unwrap().push_back(Err(err));
            svc.refresh_status();
            assert_eq!(svc.gate(), AccountGate::LoginRequired);
            assert!(svc.view().gate);
        }
        api.statuses
            .lock()
            .unwrap()
            .push_back(Ok(LoginStatus { login_on: true }));
        svc.refresh_status();
        assert_eq!(svc.gate(), AccountGate::LoginRequired);

        api.statuses
            .lock()
            .unwrap()
            .push_back(Ok(LoginStatus { login_on: false }));
        svc.refresh_status();
        assert_eq!(svc.gate(), AccountGate::Open);
        assert!(!svc.view().gate);
        assert_eq!(svc.view().state, AccountState::Anonymous);
        assert_eq!(svc.bearer(), None);

        // Mất mạng sau đó: cổng giữ nguyên (mở).
        api.statuses
            .lock()
            .unwrap()
            .push_back(Err(ApiError::Network("x".into())));
        svc.refresh_status();
        assert_eq!(svc.gate(), AccountGate::Open);

        // Server bật lại: đóng.
        api.statuses
            .lock()
            .unwrap()
            .push_back(Ok(LoginStatus { login_on: true }));
        svc.refresh_status();
        assert_eq!(svc.gate(), AccountGate::LoginRequired);
        assert_eq!(api.status_calls.load(Ordering::SeqCst), 9);
    }

    // ---------- Xóa tài khoản ----------

    #[test]
    fn delete_with_a_server_error_keeps_the_token() {
        for (err, expected) in [
            (ApiError::Network("x".into()), AccountError::Network),
            (server(500, "internal"), AccountError::Failed),
            (server(503, "login_unavailable"), AccountError::Unavailable),
            (ApiError::Decode("delete".into()), AccountError::Failed),
        ] {
            let api = Arc::new(FakeAccountApi::default());
            api.deletes.lock().unwrap().push_back(Err(err));
            let vault = vault_with(&record());
            let svc = service(&api, &vault);
            assert_eq!(svc.delete(), Err(expected));
            assert_eq!(stored(&vault), Some(record()));
            assert_eq!(svc.view().state, AccountState::SignedIn);
            assert_eq!(svc.bearer(), Some(token()));
        }
    }

    #[test]
    fn a_successful_delete_removes_the_token() {
        let api = Arc::new(FakeAccountApi::default());
        let vault = vault_with(&record());
        let svc = service(&api, &vault);
        let view = svc.delete().unwrap();
        assert_eq!(view.state, AccountState::Anonymous);
        assert!(view.gate);
        assert_eq!(stored(&vault), None);
        assert_eq!(svc.bearer(), None);
        assert_eq!(*api.bearers.lock().unwrap(), [token()]);
    }

    /// Lần thử lại nhận `401`: tài khoản đã xóa (hay token không còn hiệu lực), coi như xóa xong.
    #[test]
    fn a_delete_answered_401_counts_as_deleted() {
        let api = Arc::new(FakeAccountApi::default());
        api.deletes.lock().unwrap().push_back(Err(server(401, "invalid_token")));
        let vault = vault_with(&record());
        let svc = service(&api, &vault);
        assert_eq!(svc.delete().unwrap().state, AccountState::Anonymous);
        assert_eq!(stored(&vault), None);
    }

    #[test]
    fn delete_when_anonymous_does_not_call_the_server() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(svc.delete().unwrap().state, AccountState::Anonymous);
        assert_eq!(api.total_calls(), 0);
    }

    // ---------- Gắn license ----------

    #[test]
    fn link_license_sends_the_held_token_and_maps_errors() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &vault_with(&record()));
        assert_eq!(svc.link_license("KEY", "act-1"), Ok(()));
        assert_eq!(*api.bearers.lock().unwrap(), [token()]);
        api.links
            .lock()
            .unwrap()
            .push_back(Err(server(409, "license_linked_other_account")));
        assert_eq!(svc.link_license("KEY", "act-1"), Err(AccountError::Failed));
        api.links.lock().unwrap().push_back(Err(ApiError::Network("x".into())));
        assert_eq!(svc.link_license("KEY", "act-1"), Err(AccountError::Network));
        // Lỗi gắn license không đụng tới phiên.
        assert_eq!(svc.view().state, AccountState::SignedIn);
    }

    #[test]
    fn link_license_without_a_session_does_not_call_the_server() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(svc.link_license("KEY", "act-1"), Err(AccountError::Failed));
        assert_eq!(api.total_calls(), 0);
    }

    // ---------- Khóa hỏng ----------

    /// Khóa trạng thái bị hỏng (một luồng panic khi đang giữ): mọi hàm vẫn chạy, không panic.
    #[test]
    fn a_poisoned_lock_never_panics() {
        let api = Arc::new(FakeAccountApi::default());
        api.script_polls(vec![Ok(done())]);
        let vault = vault_with(&record());
        let svc = Arc::new(service(&api, &vault));
        {
            let svc = svc.clone();
            let _ = thread::spawn(move || {
                let _guard = svc.inner.lock().unwrap();
                panic!("làm hỏng khóa");
            })
            .join();
        }
        assert!(svc.inner.is_poisoned());
        assert_eq!(svc.view().state, AccountState::SignedIn);
        assert_eq!(svc.gate(), AccountGate::Open);
        assert_eq!(svc.bearer(), Some(token()));
        svc.cancel();
        svc.refresh_status();
        assert_eq!(svc.sign_out().unwrap().state, AccountState::Anonymous);
        assert_eq!(svc.sign_in("vi", &ok_open).unwrap().state, AccountState::SignedIn);
        assert_eq!(svc.delete().unwrap().state, AccountState::Anonymous);
    }

    /// `refresh_status` cho biết có câu trả lời thật của server không (`on` hay `off`), để nơi gọi biết khi nào hỏi lại sớm.
    #[test]
    fn refresh_status_says_whether_the_server_answered() {
        let api = Arc::new(FakeAccountApi::default());
        let svc = service(&api, &Arc::new(FakeVault::default()));
        for err in [
            ApiError::Network("x".into()),
            server(503, "x"),
            ApiError::Decode("status".into()),
            ApiError::NotConfigured,
        ] {
            api.statuses.lock().unwrap().push_back(Err(err));
            assert!(!svc.refresh_status());
        }
        for login_on in [true, false] {
            api.statuses.lock().unwrap().push_back(Ok(LoginStatus { login_on }));
            assert!(svc.refresh_status(), "login_on={login_on}");
        }
    }

    /// Gắn license chạy nền: phân loại thử lại từ lỗi gốc, trước khi gộp thành mã cho giao diện. Mạng, `429`, mọi `5xx` và
    /// `login_unavailable` thử lại; `4xx` khác, response sai dạng, chưa cấu hình và chưa đăng nhập thì thôi.
    #[test]
    fn link_license_outcome_classifies_retry_from_the_raw_error() {
        let api = Arc::new(FakeAccountApi::default());
        let vault = vault_with(&record());
        let svc = service(&api, &vault);
        api.links.lock().unwrap().push_back(Ok(()));
        assert_eq!(svc.link_license_outcome("K", "A"), LinkOutcome::Linked);
        for (err, expected) in [
            (ApiError::Network("x".into()), LinkOutcome::Retry),
            (server(429, "rate_limited"), LinkOutcome::Retry),
            (server(500, "internal"), LinkOutcome::Retry),
            (server(502, "bad_gateway"), LinkOutcome::Retry),
            (server(503, "unavailable"), LinkOutcome::Retry),
            (server(504, "timeout"), LinkOutcome::Retry),
            (server(400, "login_unavailable"), LinkOutcome::Retry),
            (server(400, "invalid_request"), LinkOutcome::Final),
            (server(401, "invalid_token"), LinkOutcome::Final),
            (server(403, "forbidden"), LinkOutcome::Final),
            (server(404, "activation_not_found"), LinkOutcome::Final),
            (server(409, "license_linked_other_account"), LinkOutcome::Final),
            (ApiError::Decode("x".into()), LinkOutcome::Final),
            (ApiError::NotConfigured, LinkOutcome::Final),
        ] {
            let label = format!("{err:?}");
            api.links.lock().unwrap().push_back(Err(err));
            assert_eq!(svc.link_license_outcome("K", "A"), expected, "{label}");
        }
        // Chưa đăng nhập: thôi, không gọi server.
        let calls = api.link_calls.load(Ordering::SeqCst);
        let anonymous = service(&api, &Arc::new(FakeVault::default()));
        assert_eq!(anonymous.link_license_outcome("K", "A"), LinkOutcome::Final);
        assert_eq!(api.link_calls.load(Ordering::SeqCst), calls);
    }
}
