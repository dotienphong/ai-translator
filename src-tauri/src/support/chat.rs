//! Lõi của chat hỗ trợ trong app (spec 2026-10-22-chat-ho-tro-zalo-design.md §4): giữ cuộc chat đang có (token, tin đã biết,
//! chấm đỏ), gọi server qua [`SupportApi`], lưu `support.json` qua [`Store`], và quyết khi nào hỏi tin mới theo [`cadence`].
//! Không phụ thuộc Tauri: giờ, trạng thái dịch, cửa sổ chính và sự kiện cho giao diện đi qua [`Host`].
//!
//! Rust điều khiển nhịp hỏi: luồng nền gọi [`Chat::tick`] rồi ngủ theo kết quả ([`Chat::wait`]); lệnh của giao diện đánh thức
//! nó ([`Chat::wake`]). Giao diện không tự hẹn giờ, chỉ nhận [`SupportView`] (kết quả của lệnh, và sự kiện khi lần hỏi nền có
//! gì mới). Không giữ khóa trong lúc gọi mạng: lấy token, nhả khóa, gọi, rồi khóa lại và chỉ áp kết quả nếu cuộc chat vẫn là
//! cuộc đó (người dùng có thể xóa cuộc chat giữa chừng).

use std::sync::{Condvar, Mutex, MutexGuard};
use std::time::Duration;

use serde::Serialize;

use super::api::{ApiError, Opening, Sender, SupportApi, SupportMessage};
use super::cadence::{self, Inputs, Next};
use super::store::{Saved, Store, token_ok};

/// Số ký tự tối đa của một tin, đếm theo code point (như `Array.from` của server).
pub const MAX_TEXT_CHARS: usize = 1000;
/// Độ dài tối đa của email (như `parseEmail` của server).
pub const MAX_EMAIL_CHARS: usize = 254;
/// Số tin giữ trong bộ nhớ: server trả tối đa 200 tin mỗi lần.
const MAX_MESSAGES: usize = 200;
/// Sau `429` khi hỏi tin, chờ tối đa chừng này giây dù server bảo lâu hơn (lệnh của giao diện vẫn đánh thức sớm được).
const MAX_POLL_WAIT_SECS: u64 = 3600;
const MAX_POLL_WAIT_SECS_I64: i64 = 3600;

/// Những gì lõi cần biết về app, đọc mỗi lần dùng.
pub trait Host: Send + Sync {
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
    /// Có phiên dịch đang bắt đầu hay chạy.
    fn translating(&self) -> bool;
    /// Cửa sổ chính đang hiện (không ẩn xuống khay, không thu nhỏ).
    fn window_visible(&self) -> bool;
    /// Trạng thái vừa đổi ngoài kết quả của một lệnh (lần hỏi nền có tin mới, chấm đỏ, chat tắt, cuộc chat không còn): báo
    /// giao diện.
    fn changed(&self, view: &SupportView);
}

/// Trạng thái chat mà giao diện vẽ (kết quả của các lệnh `support_*` và sự kiện `support://view`). Không có token.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SupportView {
    /// Chat đang bật trên server. Chưa biết (chưa có cuộc chat: app không hỏi server khi chưa nhắn) thì `true`, để hiện ô nhập.
    pub enabled: bool,
    /// Chủ dự án đã chặn cuộc chat này.
    pub closed: bool,
    /// Đã có cuộc chat: ô "Gửi kèm thông tin máy" chỉ hiện khi chưa có.
    pub has_conversation: bool,
    /// Các tin đã biết, `id` tăng dần.
    pub messages: Vec<SupportMessage>,
    /// Có câu trả lời mới chưa xem: chấm đỏ ở mục Hỗ trợ.
    pub unread: bool,
    /// Tăng mỗi lần trạng thái đổi: giao diện bỏ bản có `rev` nhỏ hơn bản đang có.
    pub rev: u64,
}

/// Tin đầu tiên của một cuộc chat mới cần thêm gì (nơi gọi biết ngôn ngữ giao diện, bản build và thông tin máy).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewConversation {
    pub lang: &'static str,
    pub source: &'static str,
    pub context: Option<String>,
}

fn invalid(field: &str) -> ApiError {
    ApiError::Invalid {
        status: 0,
        code: "invalid_request".into(),
        field: Some(field.into()),
    }
}

/// Chữ của một tin theo luật của hợp đồng (khớp `parseText` ở `server/src/support/text.ts`): `\r\n`, `\r`, U+2028 và U+2029 thành
/// `\n`; bỏ ký tự điều khiển hướng chữ (U+202A–U+202E, U+2066–U+2069; giữ U+200D nối emoji ghép) và ký tự điều khiển khác trừ `\n`
/// (tab thành dấu cách); bỏ khoảng trắng hai đầu; còn 1–1000 ký tự.
pub fn clean_text(text: &str) -> Result<String, ApiError> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let kept: String = normalized
        .chars()
        .filter_map(|c| match c {
            '\n' | '\u{2028}' | '\u{2029}' => Some('\n'),
            '\t' => Some(' '),
            '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}' => None,
            c if c.is_control() => None,
            c => Some(c),
        })
        .collect();
    let kept = kept.trim();
    let count = kept.chars().count();
    if count == 0 || count > MAX_TEXT_CHARS {
        return Err(invalid("text"));
    }
    Ok(kept.to_string())
}

/// Email theo dạng của `parseEmail` ở server: bỏ khoảng trắng hai đầu, chữ thường, tối đa 254 ký tự, một `@`, sau `@` có dấu chấm
/// không ở đầu hay cuối, không có khoảng trắng hay `<>()[]\,;:"`.
pub fn clean_email(email: &str) -> Result<String, ApiError> {
    let email = email.trim().to_lowercase();
    let bad = |c: char| c.is_whitespace() || "@<>()[]\\,;:\"".contains(c);
    let ok = email.chars().count() <= MAX_EMAIL_CHARS
        && email.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && !local.chars().any(bad)
                && !domain.chars().any(bad)
                && domain
                    .char_indices()
                    .any(|(i, c)| c == '.' && i > 0 && i + 1 < domain.len())
        });
    if ok { Ok(email) } else { Err(invalid("email")) }
}

fn seconds(secs: i64) -> Duration {
    Duration::from_secs(u64::try_from(secs).unwrap_or(0).max(1))
}

struct Inner {
    saved: Saved,
    enabled: bool,
    closed: bool,
    messages: Vec<SupportMessage>,
    /// Màn hình Hỗ trợ đang mở (giao diện báo qua `support_screen`).
    screen_open: bool,
    /// Lần cuối có tin mới, khách gửi tin hay mở màn hình (giây): mốc của luật "2 phút không có tin mới".
    active_at: i64,
    /// Lần hỏi server gần nhất, thành công hay không (giây).
    polled_at: i64,
    /// Không hỏi lại trước lúc này (giây): sau `429` hay lỗi mạng.
    not_before: i64,
    /// Số lần lỗi mạng liền khi hỏi tin.
    failures: u32,
    rev: u64,
    /// Tăng mỗi lần một lệnh đánh thức luồng hỏi.
    wakes: u64,
}

impl Inner {
    fn view(&self) -> SupportView {
        SupportView {
            enabled: self.enabled,
            closed: self.closed,
            has_conversation: self.saved.token.is_some(),
            messages: self.messages.clone(),
            unread: self.saved.unread,
            rev: self.rev,
        }
    }

    /// Có thay đổi: tăng `rev` và trả bản chụp (báo giao diện sau khi nhả khóa).
    fn bump(&mut self) -> SupportView {
        self.rev += 1;
        self.view()
    }

    /// Thêm các tin chưa có (theo `id`), giữ `id` tăng dần và tối đa [`MAX_MESSAGES`] tin mới nhất. Trả các tin vừa thêm.
    fn merge(&mut self, incoming: Vec<SupportMessage>) -> Vec<SupportMessage> {
        let mut added = Vec::new();
        for m in incoming {
            if !self.messages.iter().any(|known| known.id == m.id) {
                added.push(m.clone());
                self.messages.push(m);
            }
        }
        if !added.is_empty() {
            self.messages.sort_by_key(|m| m.id);
            let extra = self.messages.len().saturating_sub(MAX_MESSAGES);
            self.messages.drain(..extra);
        }
        added
    }

    /// Tin cuối là của chủ dự án thì hết chờ trả lời.
    fn settle_waiting(&mut self) {
        if self.messages.last().is_some_and(|m| m.sender == Sender::Owner) {
            self.saved.waiting_since = None;
        }
    }

    /// Bỏ cuộc chat hiện tại (đã xóa, hay server không còn nó).
    fn forget(&mut self) {
        self.saved = Saved::default();
        self.messages.clear();
        self.closed = false;
        self.failures = 0;
        self.not_before = 0;
    }

    fn is(&self, token: &str) -> bool {
        self.saved.token.as_deref() == Some(token)
    }

    /// Ghi nhận lỗi của một lần hỏi: giãn nhịp sau `429` và lỗi mạng; chat tắt hay cuộc chat bị chặn thì đổi trạng thái. Trả
    /// `true` nếu trạng thái hiện cho giao diện đã đổi.
    fn note_poll_error(&mut self, e: &ApiError, now: i64) -> bool {
        match e {
            ApiError::RateLimited(wait) | ApiError::Busy(wait) => {
                self.not_before = now + i64::try_from((*wait).min(MAX_POLL_WAIT_SECS)).unwrap_or(0);
                false
            }
            ApiError::Network(_) | ApiError::NotConfigured => {
                self.failures += 1;
                self.not_before = now + cadence::network_backoff(self.failures);
                false
            }
            ApiError::Disabled => !std::mem::replace(&mut self.enabled, false),
            ApiError::Closed => !std::mem::replace(&mut self.closed, true),
            ApiError::InvalidToken | ApiError::Invalid { .. } => false,
        }
    }
}

pub struct Chat {
    host: Box<dyn Host>,
    api: Box<dyn SupportApi>,
    store: Store,
    inner: Mutex<Inner>,
    wake: Condvar,
    /// Giữ suốt một lần gửi tin (khác `inner`, vốn không bao giờ giữ lúc gọi mạng): hai tin đầu bấm liên tiếp không tạo hai cuộc chat.
    sending: Mutex<()>,
}

impl Chat {
    pub fn new(host: Box<dyn Host>, api: Box<dyn SupportApi>, store: Store) -> Self {
        let now = host.now();
        let saved = store.load();
        Self {
            host,
            api,
            store,
            inner: Mutex::new(Inner {
                saved,
                enabled: true,
                closed: false,
                messages: Vec::new(),
                screen_open: false,
                active_at: now,
                // Lần hỏi đầu tiên của nhịp chờ trả lời là một nhịp sau khi mở app, không phải ngay lúc mở.
                polled_at: now,
                not_before: 0,
                failures: 0,
                rev: 0,
                wakes: 0,
            }),
            wake: Condvar::new(),
            sending: Mutex::new(()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ghi `support.json`; lỗi chỉ ghi log (cuộc chat vẫn dùng được trong lần mở này).
    fn persist(&self, inner: &Inner) {
        if let Err(e) = self.store.save(&inner.saved) {
            log::warn!("không ghi được support.json: {e}");
        }
    }

    pub fn view(&self) -> SupportView {
        self.lock().view()
    }

    pub fn has_conversation(&self) -> bool {
        self.lock().saved.token.is_some()
    }

    /// Đánh thức luồng hỏi để nó xét lại ngay (màn hình vừa mở, vừa gửi tin, vừa xóa cuộc chat).
    pub fn wake(&self) {
        self.lock().wakes += 1;
        self.wake.notify_all();
    }

    /// Số lệnh đánh thức tới giờ. Luồng hỏi chụp con số này **trước** khi `tick` quyết định, rồi đưa cho [`Chat::wait`]: lệnh nào
    /// tới sau lúc chụp (kể cả trong khe giữa `tick` và `wait`) làm `wait` trả về ngay, không bao giờ bị mất.
    fn seen(&self) -> u64 {
        self.lock().wakes
    }

    /// Ngủ tới hết `timeout` (`None`: tới khi bị đánh thức), hay tới khi có lệnh đánh thức sau lúc chụp `seen` ([`Chat::seen`]).
    pub fn wait(&self, seen: u64, timeout: Option<Duration>) {
        let inner = self.lock();
        if let Some(timeout) = timeout {
            let _woken = self.wake.wait_timeout_while(inner, timeout, |i| i.wakes == seen);
        } else {
            let _woken = self.wake.wait_while(inner, |i| i.wakes == seen);
        }
    }

    /// Một vòng của luồng hỏi: chụp con trỏ đánh thức, hỏi server nếu tới hạn ([`Chat::tick`]), rồi ngủ tới nhịp sau hay tới khi
    /// có lệnh đánh thức. Chụp trước `tick` nên không có khe nào để mất lệnh.
    pub fn step(&self) {
        let seen = self.seen();
        let sleep = self.tick();
        self.wait(seen, sleep);
    }

    /// Màn hình Hỗ trợ mở hay đóng. Mở thì bỏ chấm đỏ và về nhịp 3 giây. Không gọi mạng, kể cả khi chưa có cuộc chat.
    pub fn screen(&self, open: bool) -> SupportView {
        let now = self.host.now();
        let view = {
            let mut inner = self.lock();
            inner.screen_open = open;
            if open {
                inner.active_at = now;
                if inner.saved.token.is_some() {
                    // Giao diện sắp gọi `fetch` (after=0): luồng nền không hỏi song song thêm một lần.
                    inner.polled_at = now;
                } else {
                    // Chưa có cuộc chat: không hỏi server chat có bật không (chưa nhắn thì không kết nối), coi như chưa biết và
                    // hiện ô nhập. Tin đầu bị `503` lần trước thì lần mở này cho gửi lại.
                    inner.enabled = true;
                    inner.closed = false;
                }
                if inner.saved.unread {
                    inner.saved.unread = false;
                    self.persist(&inner);
                }
            }
            inner.bump()
        };
        self.wake();
        view
    }

    /// Lấy lại toàn bộ cuộc chat (`after=0`) khi mở màn hình. Chưa có cuộc chat thì không gọi mạng. Server không còn cuộc chat
    /// (`401`) thì bỏ bản lưu và trả trạng thái mới, không phải lỗi.
    pub fn fetch(&self) -> Result<SupportView, ApiError> {
        let Some(token) = self.lock().saved.token.clone() else {
            return Ok(self.view());
        };
        let now = self.host.now();
        let result = self.api.messages(&token, 0);
        let mut inner = self.lock();
        if !inner.is(&token) {
            return Ok(inner.view());
        }
        inner.polled_at = now;
        match result {
            Ok(batch) => {
                inner.failures = 0;
                inner.not_before = 0;
                inner.enabled = batch.enabled;
                inner.closed = batch.status == "closed";
                inner.messages.clear();
                if let Some(max) = batch.messages.iter().map(|m| m.id).max() {
                    inner.saved.last_id = inner.saved.last_id.max(max);
                }
                inner.merge(batch.messages);
                inner.settle_waiting();
                self.persist(&inner);
                Ok(inner.bump())
            }
            Err(ApiError::InvalidToken) => {
                inner.forget();
                self.persist(&inner);
                Ok(inner.bump())
            }
            Err(e) => {
                inner.note_poll_error(&e, now);
                Err(e)
            }
        }
    }

    /// Gửi một tin. Chưa có cuộc chat thì tạo cuộc mới bằng `first` (ngôn ngữ, nguồn, thông tin máy nếu khách để tích); đã có thì
    /// chỉ gửi chữ. Trả trạng thái mới, đã có tin vừa gửi.
    pub fn send(&self, text: &str, first: &NewConversation) -> Result<SupportView, ApiError> {
        let text = clean_text(text)?;
        let _sending = self.sending.lock().unwrap_or_else(|e| e.into_inner());
        let token = self.lock().saved.token.clone();
        let now = self.host.now();
        let result = match &token {
            Some(token) => self.api.send(token, &text).map(|message| (None, message)),
            None => {
                let opening = Opening {
                    text: text.clone(),
                    lang: first.lang,
                    source: first.source,
                    context: first.context.clone(),
                };
                match self.api.start(&opening) {
                    Ok(started) if token_ok(&started.token) => Ok((Some(started.token), started.message)),
                    Ok(_) => Err(ApiError::Network("token sai dạng".into())),
                    Err(e) => Err(e),
                }
            }
        };
        let (new_token, message) = match result {
            Ok(sent) => sent,
            Err(e) => {
                self.after_error(token.as_deref(), &e);
                return Err(e);
            }
        };
        let view = {
            let mut inner = self.lock();
            if let Some(new_token) = new_token {
                inner.forget();
                inner.saved.token = Some(new_token);
            } else if inner.saved.token != token {
                // Cuộc chat bị xóa trong lúc gửi: không còn cuộc nào để hiện tin này.
                return Ok(inner.view());
            }
            inner.merge(vec![message]);
            inner.saved.waiting_since = Some(now);
            inner.active_at = now;
            inner.enabled = true;
            inner.closed = false;
            self.persist(&inner);
            inner.bump()
        };
        self.wake();
        Ok(view)
    }

    /// Để lại email (hay `None` để bỏ) cho cuộc chat hiện tại.
    pub fn set_email(&self, email: Option<&str>) -> Result<(), ApiError> {
        let email = email.map(clean_email).transpose()?;
        let Some(token) = self.lock().saved.token.clone() else {
            return Err(ApiError::InvalidToken);
        };
        let result = self.api.set_email(&token, email.as_deref());
        if let Err(e) = &result {
            self.after_error(Some(&token), e);
        }
        result
    }

    /// Xóa cuộc chat trên server rồi bỏ bản lưu. Server đã không còn cuộc chat (`401`) cũng coi như xóa xong.
    pub fn delete(&self) -> Result<SupportView, ApiError> {
        let token = self.lock().saved.token.clone();
        if let Some(token) = &token {
            match self.api.delete(token) {
                Ok(()) | Err(ApiError::InvalidToken) => {}
                Err(e) => return Err(e),
            }
        }
        let view = {
            let mut inner = self.lock();
            inner.forget();
            self.persist(&inner);
            inner.bump()
        };
        self.wake();
        Ok(view)
    }

    /// Lỗi của một lệnh làm đổi trạng thái (cuộc chat không còn, bị chặn, chat tắt): áp vào và báo giao diện, vì lệnh trả lỗi chứ
    /// không trả trạng thái.
    fn after_error(&self, token: Option<&str>, e: &ApiError) {
        let view = {
            let mut inner = self.lock();
            if inner.saved.token.as_deref() != token {
                return;
            }
            match e {
                ApiError::InvalidToken if token.is_some() => {
                    inner.forget();
                    self.persist(&inner);
                }
                ApiError::Disabled => inner.enabled = false,
                ApiError::Closed => inner.closed = true,
                _ => return,
            }
            inner.bump()
        };
        self.host.changed(&view);
    }

    /// Một nhịp của luồng hỏi: hỏi server nếu tới hạn; trả thời gian ngủ trước nhịp sau (`None`: ngủ tới khi bị đánh thức).
    pub fn tick(&self) -> Option<Duration> {
        let now = self.host.now();
        let translating = self.host.translating();
        let window_visible = self.host.window_visible();
        let (next, due, cleared) = {
            let mut inner = self.lock();
            // Màn hình đang mở và cửa sổ hiện lại sau khi có câu trả lời: người dùng đang thấy tin, bỏ chấm đỏ.
            let cleared = if inner.screen_open && window_visible && inner.saved.unread {
                inner.saved.unread = false;
                self.persist(&inner);
                Some(inner.bump())
            } else {
                None
            };
            let next = cadence::next(&Inputs {
                has_conversation: inner.saved.token.is_some(),
                screen_open: inner.screen_open,
                window_visible,
                translating,
                waiting_since: inner.saved.waiting_since,
                active_at: inner.active_at,
                now,
            });
            // Đồng hồ lùi (đồng bộ lại giờ, người dùng chỉnh giờ) không được làm luồng im lặng hàng giờ: mốc lần hỏi không thể ở
            // sau hiện tại (kẹp và ghi lại, để các nhịp sau không đẩy mốc theo), và thời gian chờ sau `429` không quá trần của
            // chính nó.
            inner.polled_at = inner.polled_at.min(now);
            inner.not_before = inner.not_before.min(now + MAX_POLL_WAIT_SECS_I64);
            let due = match next {
                Next::Poll(every) => (inner.polled_at + every).max(inner.not_before),
                Next::Recheck(_) | Next::Idle => now,
            };
            (next, due, cleared)
        };
        if let Some(view) = cleared {
            self.host.changed(&view);
        }
        match next {
            Next::Idle => None,
            Next::Recheck(secs) => Some(seconds(secs)),
            Next::Poll(every) => {
                if now < due {
                    return Some(seconds(due - now));
                }
                self.poll(now, window_visible);
                Some(seconds(every))
            }
        }
    }

    /// Hỏi các tin sau con trỏ và áp kết quả. Không có gì mới thì không ghi file và không báo giao diện.
    fn poll(&self, now: i64, window_visible: bool) {
        let (token, after) = {
            let inner = self.lock();
            let Some(token) = inner.saved.token.clone() else {
                return;
            };
            (token, inner.saved.last_id)
        };
        let result = self.api.messages(&token, after);
        let view = {
            let mut inner = self.lock();
            if !inner.is(&token) {
                return;
            }
            inner.polled_at = now;
            match result {
                Ok(batch) => {
                    inner.failures = 0;
                    inner.not_before = 0;
                    let closed = batch.status == "closed";
                    let mut changed = inner.enabled != batch.enabled || inner.closed != closed;
                    inner.enabled = batch.enabled;
                    inner.closed = closed;
                    let mut dirty = false;
                    if let Some(max) = batch.messages.iter().map(|m| m.id).max()
                        && max > inner.saved.last_id
                    {
                        inner.saved.last_id = max;
                        dirty = true;
                    }
                    let added = inner.merge(batch.messages);
                    if !added.is_empty() {
                        changed = true;
                        inner.active_at = now;
                        let seen = inner.screen_open && window_visible;
                        if !seen && added.iter().any(|m| m.sender == Sender::Owner) {
                            inner.saved.unread = true;
                        }
                        inner.settle_waiting();
                    }
                    if dirty || changed {
                        self.persist(&inner);
                    }
                    if !changed {
                        return;
                    }
                    inner.bump()
                }
                Err(ApiError::InvalidToken) => {
                    inner.forget();
                    self.persist(&inner);
                    inner.bump()
                }
                Err(e) => {
                    // Lỗi không bao giờ kèm URL, token hay nội dung tin (`api.rs`).
                    log::info!("hỏi tin hỗ trợ lỗi: {e}");
                    if !inner.note_poll_error(&e, now) {
                        return;
                    }
                    inner.bump()
                }
            }
        };
        self.host.changed(&view);
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::OnceLock;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

    use super::*;
    use crate::support::api::{Batch, Started};
    use crate::test_support::FakeSupportApi;

    const T: i64 = 1_800_000_000;

    /// App giả của lõi: đồng hồ, trạng thái dịch và cửa sổ do test đặt; giữ lại mọi lần báo giao diện.
    #[derive(Default)]
    struct FakeHost {
        now: AtomicI64,
        translating: AtomicBool,
        hidden: AtomicBool,
        changes: Mutex<Vec<SupportView>>,
    }

    impl Host for Arc<FakeHost> {
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
        fn translating(&self) -> bool {
            self.translating.load(Ordering::SeqCst)
        }
        fn window_visible(&self) -> bool {
            !self.hidden.load(Ordering::SeqCst)
        }
        fn changed(&self, view: &SupportView) {
            self.changes.lock().unwrap().push(view.clone());
        }
    }

    struct Rig {
        chat: Chat,
        host: Arc<FakeHost>,
        api: FakeSupportApi,
        path: PathBuf,
    }

    impl Rig {
        fn at(&self, now: i64) {
            self.host.now.store(now, Ordering::SeqCst);
        }
        /// Số lần hỏi tin (`messages <after>`) server giả đã nhận.
        fn polls(&self) -> usize {
            self.api.calls().iter().filter(|c| c.starts_with("messages")).count()
        }
        fn saved(&self) -> Saved {
            Store::new(self.path.clone()).load()
        }
    }

    fn rig(name: &str) -> Rig {
        let path = std::env::temp_dir()
            .join(format!("mt-support-chat-{name}-{}", std::process::id()))
            .join("support.json");
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
        let host = Arc::new(FakeHost::default());
        host.now.store(T, Ordering::SeqCst);
        let api = FakeSupportApi::default();
        let chat = Chat::new(Box::new(host.clone()), Box::new(api.clone()), Store::new(path.clone()));
        Rig { chat, host, api, path }
    }

    fn first(context: Option<&str>) -> NewConversation {
        NewConversation {
            lang: "vi",
            source: "app-debug",
            context: context.map(String::from),
        }
    }

    /// Chạy luồng hỏi từ giờ hiện tại tới `until` (mỗi giây một nhịp), trả các giây có hỏi server (tính từ `T`).
    fn run_until(r: &Rig, until: i64) -> Vec<i64> {
        let mut at = Vec::new();
        let mut now = r.host.now.load(Ordering::SeqCst);
        while now <= until {
            r.at(now);
            let before = r.polls();
            r.chat.tick();
            if r.polls() > before {
                at.push(now - T);
            }
            now += 1;
        }
        at
    }

    /// Chưa từng nhắn: mở màn hình (như `open()` của giao diện: `support_screen`, rồi `support_fetch`) và để luồng hỏi chạy 5 phút
    /// cũng không có request nào.
    #[test]
    fn without_a_conversation_nothing_connects_even_with_the_screen_open() {
        let r = rig("idle");
        assert_eq!(r.chat.tick(), None);
        r.chat.screen(true);
        assert_eq!(run_until(&r, T + 300), Vec::<i64>::new());
        assert!(!r.chat.fetch().unwrap().has_conversation);
        assert!(r.api.calls().is_empty(), "không gọi mạng: {:?}", r.api.calls());
        assert!(!r.path.exists(), "không có file khi chưa có cuộc chat");
    }

    #[test]
    fn the_first_message_opens_a_conversation_and_later_ones_reuse_it() {
        let r = rig("send");
        let view = r
            .chat
            .send(
                "  Phụ đề không hiện\r\nkhi họp Teams\t ",
                &first(Some("AI Translator 0.2.4 · macOS 15.6")),
            )
            .unwrap();
        assert!(view.has_conversation);
        assert_eq!(view.messages.len(), 1);
        assert_eq!(view.messages[0].text, "Phụ đề không hiện\nkhi họp Teams");
        let openings = r.api.openings();
        assert_eq!(openings.len(), 1);
        assert_eq!(
            (openings[0].lang, openings[0].source, openings[0].context.as_deref()),
            ("vi", "app-debug", Some("AI Translator 0.2.4 · macOS 15.6"))
        );
        let saved = r.saved();
        assert_eq!(saved.token.as_deref(), Some(FakeSupportApi::TOKEN));
        assert_eq!(saved.waiting_since, Some(T), "đang chờ trả lời");
        r.at(T + 5);
        let view = r.chat.send("Thêm một câu", &first(Some("không dùng nữa"))).unwrap();
        assert_eq!(view.messages.len(), 2);
        assert_eq!(
            r.api.openings().len(),
            1,
            "tin sau không tạo cuộc mới, không gửi lại thông tin máy"
        );
        assert_eq!(r.api.calls(), ["start", "send"]);
        assert_eq!(r.saved().waiting_since, Some(T + 5));
    }

    #[test]
    fn text_and_email_are_checked_before_any_request() {
        let r = rig("validate");
        let invalid = |field: &str| ApiError::Invalid {
            status: 0,
            code: "invalid_request".into(),
            field: Some(field.into()),
        };
        assert_eq!(r.chat.send(" \n\t ", &first(None)), Err(invalid("text")));
        assert_eq!(r.chat.send(&"a".repeat(1001), &first(None)), Err(invalid("text")));
        assert!(r.api.calls().is_empty());
        assert_eq!(clean_text(&"ế".repeat(1000)).map(|t| t.chars().count()), Ok(1000));
        assert_eq!(clean_text("a\u{7}b\u{0}c"), Ok("abc".into()));
        // Khớp `parseText` của server: U+2028/U+2029 thành xuống dòng, bỏ ký tự điều khiển hướng chữ, giữ U+200D (nối emoji ghép).
        assert_eq!(clean_text("a\u{2028}b\u{2029}c"), Ok("a\nb\nc".into()));
        assert_eq!(clean_text("a\u{202a}b\u{202e}c\u{2066}d\u{2069}e"), Ok("abcde".into()));
        assert_eq!(clean_text("👨\u{200d}👩"), Ok("👨\u{200d}👩".into()));
        r.chat.send("Chào", &first(None)).unwrap();
        assert_eq!(r.chat.set_email(Some("không phải email")), Err(invalid("email")));
        assert_eq!(clean_email(" Khach@Example.COM "), Ok("khach@example.com".into()));
        for bad in ["a@b", "a@.b", "a@b.", "@b.vn", "a b@c.vn", "a@b@c.vn", "a<b@c.vn"] {
            assert_eq!(clean_email(bad), Err(invalid("email")), "{bad}");
        }
        r.chat.set_email(Some("Khach@Example.com")).unwrap();
        r.chat.set_email(None).unwrap();
        assert_eq!(r.api.calls(), ["start", "email khach@example.com", "email null"]);
    }

    #[test]
    fn an_open_screen_polls_every_3_seconds_then_every_15_after_two_quiet_minutes() {
        let r = rig("fast");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        let at = run_until(&r, T + 200);
        let mut expected: Vec<i64> = (1..=39).map(|n| n * 3).collect();
        expected.extend([132, 147, 162, 177, 192]);
        assert_eq!(at, expected);
        assert_eq!(r.api.calls()[1], "messages 0", "lần hỏi đầu: con trỏ 0");
        assert!(
            r.api.calls().iter().skip(2).all(|c| c == "messages 1"),
            "sau đó: sau tin đã nhận"
        );
    }

    #[test]
    fn a_new_reply_brings_the_open_screen_back_to_3_seconds() {
        let r = rig("reply-fast");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        run_until(&r, T + 140);
        r.api.owner_reply("Chào bạn", T + 141);
        let at = run_until(&r, T + 175);
        // Lần hỏi 15 giây kế tiếp (147) nhận câu trả lời, rồi về 3 giây.
        assert_eq!(at, [147, 150, 153, 156, 159, 162, 165, 168, 171, 174]);
        let view = r.chat.view();
        assert_eq!(view.messages.last().map(|m| m.sender), Some(Sender::Owner));
        assert!(!view.unread, "đang xem màn hình thì không có chấm đỏ");
        assert_eq!(r.saved().waiting_since, None, "đã có trả lời");
    }

    #[test]
    fn waiting_for_a_reply_polls_every_minute_and_stops_while_translating() {
        let r = rig("waiting");
        r.chat.send("Chào", &first(None)).unwrap();
        assert_eq!(run_until(&r, T + 130), [60, 120]);
        r.host.translating.store(true, Ordering::SeqCst);
        assert_eq!(run_until(&r, T + 400), Vec::<i64>::new(), "đang dịch: không hỏi");
        r.host.translating.store(false, Ordering::SeqCst);
        assert_eq!(run_until(&r, T + 470), [400, 460]);
    }

    #[test]
    fn a_reply_while_the_screen_is_closed_lights_the_red_dot_until_the_screen_opens() {
        let r = rig("unread");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.owner_reply("Chào bạn", T + 10);
        assert_eq!(run_until(&r, T + 60), [60]);
        let changed = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(changed.unread, "báo giao diện có chấm đỏ");
        assert_eq!(changed.messages.len(), 2);
        assert!(r.saved().unread, "chấm đỏ còn sau khi mở lại app");
        assert_eq!(r.saved().waiting_since, None);
        assert_eq!(
            run_until(&r, T + 400),
            Vec::<i64>::new(),
            "hết chờ trả lời, màn hình đóng: không hỏi nữa"
        );
        let view = r.chat.screen(true);
        assert!(!view.unread);
        assert!(!r.saved().unread);
    }

    #[test]
    fn a_hidden_window_makes_no_background_request_even_when_waiting_for_a_reply() {
        let r = rig("hidden");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.host.hidden.store(true, Ordering::SeqCst);
        r.api.owner_reply("Chào bạn", T + 62);
        // Cửa sổ ẩn xuống khay: không hỏi nền. Lần hỏi nền trả về câu trả lời làm server coi khách đã nhận (không gửi email cho
        // câu đó), mà khách không thấy chấm đỏ vì không nhìn thấy cửa sổ.
        assert_eq!(run_until(&r, T + 200), Vec::<i64>::new());
        assert_eq!(r.polls(), 0);
        assert!(!r.chat.view().unread, "chưa hỏi nên chưa biết có câu trả lời");
        r.host.hidden.store(false, Ordering::SeqCst);
        // Cửa sổ hiện lại đúng màn hình Hỗ trợ: hỏi ngay, và vì đang xem nên không có chấm đỏ.
        assert_eq!(run_until(&r, T + 202), [200]);
        let view = r.chat.view();
        assert_eq!(view.messages.last().map(|m| m.sender), Some(Sender::Owner));
        assert!(!view.unread);
    }

    #[test]
    fn a_rate_limit_waits_retry_after_and_network_errors_back_off() {
        let r = rig("backoff");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.api.fail_next(ApiError::RateLimited(30));
        assert_eq!(run_until(&r, T + 40), [3, 33, 36, 39]);
        r.api.fail_next(ApiError::Network("x".into()));
        r.api.fail_next(ApiError::Network("x".into()));
        r.api.fail_next(ApiError::Network("x".into()));
        // 42 lỗi (chờ 3), 45 lỗi (chờ 15), 60 lỗi (chờ 60), 120 thành công; đã 2 phút không có tin mới nên tiếp theo là 15 giây.
        assert_eq!(run_until(&r, T + 136), [42, 45, 60, 120, 135]);
    }

    #[test]
    fn a_conversation_gone_from_the_server_is_forgotten() {
        let r = rig("gone");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.api.fail_next(ApiError::InvalidToken);
        assert_eq!(run_until(&r, T + 3), [3]);
        let view = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(!view.has_conversation && view.messages.is_empty());
        assert!(!r.path.exists(), "bỏ support.json");
        assert_eq!(
            run_until(&r, T + 100),
            Vec::<i64>::new(),
            "không còn cuộc chat: không hỏi nữa"
        );
    }

    #[test]
    fn sending_into_a_deleted_conversation_forgets_it_and_reports_the_error() {
        let r = rig("send-gone");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::InvalidToken);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::InvalidToken));
        assert!(!r.chat.view().has_conversation);
        assert!(
            !r.host.changes.lock().unwrap().last().unwrap().has_conversation,
            "giao diện biết để hiện lại ô thông tin máy"
        );
        let view = r.chat.send("Còn đó không?", &first(Some("máy"))).unwrap();
        assert!(view.has_conversation);
        assert_eq!(r.api.openings().len(), 2, "gửi lại là tin đầu của cuộc mới");
    }

    #[test]
    fn opening_the_screen_reloads_the_whole_conversation() {
        let r = rig("fetch");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.owner_reply("Chào bạn", T + 1);
        // Mở lại app: trong bộ nhớ chưa có tin nào.
        let reopened = Chat::new(
            Box::new(r.host.clone()),
            Box::new(r.api.clone()),
            Store::new(r.path.clone()),
        );
        assert!(reopened.view().messages.is_empty());
        let view = reopened.fetch().unwrap();
        assert_eq!(view.messages.len(), 2);
        assert_eq!(r.api.calls().last().map(String::as_str), Some("messages 0"));
        assert_eq!(Store::new(r.path.clone()).load().last_id, 2);
        r.api.set_server(false, true);
        let view = reopened.fetch().unwrap();
        assert!(!view.enabled && view.closed, "chat tắt, cuộc chat bị chặn");
    }

    #[test]
    fn a_disabled_chat_or_a_closed_conversation_shows_up_after_a_failed_send() {
        let r = rig("modes");
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::Disabled);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::Disabled));
        assert!(!r.chat.view().enabled);
        r.api.fail_next(ApiError::Closed);
        assert_eq!(r.chat.send("Còn đó không?", &first(None)), Err(ApiError::Closed));
        assert!(r.chat.view().closed);
        assert!(r.chat.view().has_conversation, "lịch sử cũ vẫn còn");
    }

    /// Chưa từng nhắn thì không hỏi server chat có bật không; tin đầu nhận `503` thì màn hình chuyển sang dòng chat tắt, không lưu
    /// gì; mở lại màn hình thì hiện lại ô nhập (vẫn không gọi mạng) để gửi lại.
    #[test]
    fn a_first_message_into_a_disabled_chat_shows_the_disabled_line_and_saves_nothing() {
        let r = rig("disabled-first");
        assert!(r.chat.screen(true).enabled, "chưa biết: hiện ô nhập");
        r.api.fail_next(ApiError::Disabled);
        assert_eq!(r.chat.send("Chào", &first(Some("máy"))), Err(ApiError::Disabled));
        let changed = r.host.changes.lock().unwrap().last().cloned().unwrap();
        assert!(
            !changed.enabled && !changed.has_conversation,
            "giao diện chuyển sang dòng chat tắt"
        );
        assert!(!r.path.exists(), "không có token nên không có support.json");
        r.chat.screen(false);
        assert!(r.chat.screen(true).enabled, "mở lại: hiện ô nhập để gửi lại");
        assert!(!r.chat.fetch().unwrap().has_conversation);
        assert_eq!(r.api.calls(), ["start"], "chỉ lần gửi chạm server");
    }

    #[test]
    fn deleting_removes_the_conversation_everywhere() {
        let r = rig("delete");
        r.chat.send("Chào", &first(None)).unwrap();
        let view = r.chat.delete().unwrap();
        assert!(!view.has_conversation && view.messages.is_empty());
        assert!(!r.path.exists());
        assert_eq!(r.api.calls(), ["start", "delete"]);
        // Server đã xóa trước (hết 90 ngày): vẫn coi như xóa xong.
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::InvalidToken);
        assert!(!r.chat.delete().unwrap().has_conversation);
        // Lỗi mạng: giữ cuộc chat.
        r.chat.send("Chào", &first(None)).unwrap();
        r.api.fail_next(ApiError::Network("x".into()));
        assert!(r.chat.delete().is_err());
        assert!(r.chat.view().has_conversation);
        // Chưa có cuộc chat: không gọi mạng.
        let r = rig("delete-empty");
        assert!(!r.chat.delete().unwrap().has_conversation);
        assert!(r.api.calls().is_empty());
    }

    #[test]
    fn every_change_raises_the_revision() {
        let r = rig("rev");
        let a = r.chat.screen(true).rev;
        let b = r.chat.send("Chào", &first(None)).unwrap().rev;
        let c = r.chat.screen(false).rev;
        assert!(a < b && b < c, "{a} {b} {c}");
    }

    // ---- Sau rà (2026-10-22) ----

    /// Server giả chậm ở `start` để hai lần gửi tin đầu chồng lên nhau thật.
    struct SlowStart(FakeSupportApi);

    impl SupportApi for SlowStart {
        fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
            std::thread::sleep(Duration::from_millis(150));
            self.0.start(opening)
        }
        fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError> {
            self.0.send(token, text)
        }
        fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError> {
            self.0.messages(token, after)
        }
        fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError> {
            self.0.set_email(token, email)
        }
        fn delete(&self, token: &str) -> Result<(), ApiError> {
            self.0.delete(token)
        }
    }

    /// Server giả xóa cuộc chat ngay sau khi trả lời một lần hỏi tin (người dùng bấm xóa giữa lúc đang hỏi).
    struct DeleteMidway {
        api: FakeSupportApi,
        chat: Arc<OnceLock<Arc<Chat>>>,
        armed: Arc<AtomicBool>,
    }

    impl SupportApi for DeleteMidway {
        fn start(&self, opening: &Opening) -> Result<Started, ApiError> {
            self.api.start(opening)
        }
        fn send(&self, token: &str, text: &str) -> Result<SupportMessage, ApiError> {
            self.api.send(token, text)
        }
        fn messages(&self, token: &str, after: i64) -> Result<Batch, ApiError> {
            let batch = self.api.messages(token, after);
            if self.armed.swap(false, Ordering::SeqCst)
                && let Some(chat) = self.chat.get()
            {
                chat.delete().unwrap();
            }
            batch
        }
        fn set_email(&self, token: &str, email: Option<&str>) -> Result<(), ApiError> {
            self.api.set_email(token, email)
        }
        fn delete(&self, token: &str) -> Result<(), ApiError> {
            self.api.delete(token)
        }
    }

    /// Lệnh đánh thức tới đúng khe giữa lúc `tick` quyết định và lúc luồng ngủ không được mất: `wait` nhận con trỏ chụp từ trước
    /// `tick`, thấy đã có lệnh thì trả về ngay (kể cả khi `tick` vừa trả `None`, ngủ vô hạn).
    #[test]
    fn a_wake_between_the_decision_and_the_sleep_is_not_lost() {
        let r = rig("wake-gap");
        let chat = Arc::new(Chat::new(
            Box::new(r.host.clone()),
            Box::new(r.api.clone()),
            Store::new(r.path.clone()),
        ));
        let seen = chat.seen();
        assert_eq!(chat.tick(), None, "chưa có cuộc chat: ngủ vô hạn");
        chat.wake();
        let (done, finished) = std::sync::mpsc::channel();
        let sleeper = {
            let chat = Arc::clone(&chat);
            std::thread::spawn(move || {
                chat.wait(seen, None);
                let _ = done.send(());
            })
        };
        let returned = finished.recv_timeout(Duration::from_secs(5)).is_ok();
        chat.wake(); // nếu hỏng thì thả luồng ra để test không treo
        sleeper.join().unwrap();
        assert!(returned, "wait phải trả về ngay vì đã có lệnh sau khi chụp con trỏ");
    }

    #[test]
    fn a_wake_after_the_sleep_started_ends_it() {
        let r = rig("wake-after");
        let chat = Arc::new(Chat::new(
            Box::new(r.host.clone()),
            Box::new(r.api.clone()),
            Store::new(r.path.clone()),
        ));
        let seen = chat.seen();
        let (done, finished) = std::sync::mpsc::channel();
        let sleeper = {
            let chat = Arc::clone(&chat);
            std::thread::spawn(move || {
                chat.wait(seen, None);
                let _ = done.send(());
            })
        };
        assert!(
            finished.recv_timeout(Duration::from_millis(100)).is_err(),
            "chưa có lệnh: vẫn ngủ"
        );
        chat.wake();
        let returned = finished.recv_timeout(Duration::from_secs(5)).is_ok();
        chat.wake();
        sleeper.join().unwrap();
        assert!(returned);
    }

    /// Mở màn hình khi đã có cuộc chat: giao diện gọi `fetch` (after=0); luồng nền không được hỏi thêm một lần song song.
    #[test]
    fn opening_the_screen_with_a_conversation_makes_exactly_one_request() {
        let r = rig("one-get");
        r.chat.send("Chào", &first(None)).unwrap();
        r.at(T + 100);
        r.chat.screen(true);
        assert_eq!(
            r.chat.tick(),
            Some(Duration::from_secs(3)),
            "luồng nền chờ, không hỏi ngay"
        );
        r.chat.fetch().unwrap();
        assert_eq!(r.polls(), 1, "{:?}", r.api.calls());
        assert_eq!(r.api.calls().last().map(String::as_str), Some("messages 0"));
    }

    /// Đồng hồ hệ thống lùi (đồng bộ lại giờ, người dùng chỉnh giờ): vẫn hỏi theo nhịp, không im một giờ.
    #[test]
    fn a_clock_that_goes_back_does_not_silence_the_polling() {
        let r = rig("clock-back");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        assert_eq!(run_until(&r, T + 10), [3, 6, 9]);
        r.at(T - 3600);
        assert_eq!(run_until(&r, T - 3600 + 10), [-3597, -3594, -3591]);
    }

    /// Hai tin đầu bấm liên tiếp không tạo hai cuộc chat: tin thứ hai đợi tin đầu xong rồi đi theo token.
    #[test]
    fn two_first_messages_at_once_open_one_conversation() {
        let r = rig("concurrent");
        let fake = FakeSupportApi::default();
        let chat = Arc::new(Chat::new(
            Box::new(r.host.clone()),
            Box::new(SlowStart(fake.clone())),
            Store::new(r.path.clone()),
        ));
        let senders: Vec<_> = ["một", "hai"]
            .into_iter()
            .map(|text| {
                let chat = Arc::clone(&chat);
                std::thread::spawn(move || chat.send(text, &first(None)).unwrap())
            })
            .collect();
        for sender in senders {
            sender.join().unwrap();
        }
        assert_eq!(fake.calls(), ["start", "send"]);
        assert_eq!(fake.openings().len(), 1);
        assert_eq!(chat.view().messages.len(), 2);
    }

    /// Cuộc chat bị xóa giữa lúc đang hỏi tin: kết quả của lần hỏi bị bỏ, không ghi lại `support.json`, không báo giao diện.
    #[test]
    fn a_poll_that_finds_the_conversation_deleted_meanwhile_is_dropped() {
        let r = rig("poll-deleted");
        let slot = Arc::new(OnceLock::new());
        let armed = Arc::new(AtomicBool::new(false));
        let chat = Arc::new(Chat::new(
            Box::new(r.host.clone()),
            Box::new(DeleteMidway {
                api: r.api.clone(),
                chat: Arc::clone(&slot),
                armed: Arc::clone(&armed),
            }),
            Store::new(r.path.clone()),
        ));
        slot.set(Arc::clone(&chat)).ok();
        chat.send("Chào", &first(None)).unwrap();
        r.api.owner_reply("Chào bạn", T + 1);
        chat.screen(true);
        let changes = r.host.changes.lock().unwrap().len();
        armed.store(true, Ordering::SeqCst);
        r.at(T + 3);
        chat.tick();
        let view = chat.view();
        assert!(!view.has_conversation && view.messages.is_empty(), "{view:?}");
        assert!(!r.path.exists(), "không ghi lại support.json của cuộc chat đã xóa");
        assert_eq!(
            r.host.changes.lock().unwrap().len(),
            changes,
            "lần hỏi bị bỏ không báo gì"
        );
        // Cùng tình huống với `fetch` lúc mở màn hình.
        chat.send("Chào lại", &first(None)).unwrap();
        armed.store(true, Ordering::SeqCst);
        let view = chat.fetch().unwrap();
        assert!(!view.has_conversation && view.messages.is_empty(), "{view:?}");
        assert!(!r.path.exists());
    }

    /// Nhánh phòng thủ của `tick`: màn hình đang mở, cửa sổ hiện mà vẫn còn chấm đỏ thì bỏ chấm đỏ và báo giao diện.
    #[test]
    fn a_tick_with_the_screen_open_and_the_window_visible_clears_a_stale_red_dot() {
        let r = rig("cleared");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        {
            let mut inner = r.chat.lock();
            inner.saved.unread = true;
        }
        r.chat.tick();
        assert!(!r.chat.view().unread);
        assert!(!r.saved().unread);
        assert!(
            !r.host.changes.lock().unwrap().last().unwrap().unread,
            "báo giao diện bỏ chấm đỏ"
        );
    }

    /// `429` khi mở màn hình (`fetch`): trả lỗi, và luồng nền chờ đúng `Retry-After` rồi mới hỏi lại.
    #[test]
    fn a_rate_limited_fetch_makes_the_poller_wait() {
        let r = rig("fetch-429");
        r.chat.send("Chào", &first(None)).unwrap();
        r.chat.screen(true);
        r.api.fail_next(ApiError::RateLimited(30));
        assert_eq!(r.chat.fetch(), Err(ApiError::RateLimited(30)));
        assert_eq!(run_until(&r, T + 35), [30, 33]);
    }
}
