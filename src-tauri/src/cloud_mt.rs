//! Kết nối nguồn dịch Cloud (ChatGPT / OpenAI API và Gemini / Google API) kèm tự động dự phòng (fallback) tức thì
//! về Model Local (`llama-server`) khi mất mạng, lỗi xác thực, hết hạn mức hoặc đứt luồng giữa chừng
//! (spec `docs/superpowers/specs/2026-11-07-cloud-mt-fallback-design.md`).
//!
//! Nguyên tắc an toàn:
//! - API Key chỉ lưu trong [`Keystore`] của hệ điều hành (`openai-api-key`, `gemini-api-key`), không ghi vào `settings.json`,
//!   không ghi vào log, không trả nguyên văn về giao diện.
//! - Mọi lỗi mạng/HTTP từ Cloud chỉ báo mã trạng thái, không bao giờ dùng `unwrap()`/`expect()` và không dừng phiên dịch:
//!   [`FallbackMt`] tự động chuyển sang `local` ngay trong câu đang dịch và giữ `local` cho đến hết phiên.

use std::io::{BufRead, BufReader, Read};
use std::ops::ControlFlow;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use pipeline::llama::{ChatRequest, StreamEnd};
use pipeline::sse::{SseEvent, parse_sse_line};
use pipeline::translate::{Mt, MtError};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::actions;
use crate::errors::{self, CommandError};
use crate::security::keystore::{Keystore, KeystoreError};
use crate::session::Session;
use crate::settings::TranslationProvider;
use crate::state::AppState;

pub const OPENAI_KEY_ENTRY: &str = "openai-api-key";
pub const GEMINI_KEY_ENTRY: &str = "gemini-api-key";

pub const OPENAI_CHAT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
pub const GEMINI_CHAT_ENDPOINT: &str = "https://generativelanguage.googleapis.com/v1beta/models";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const WARMUP_TTL_SECS: u64 = 45;

/// Trạng thái đã cấu hình API Key của hai nguồn Cloud, trả về cho Cài đặt › Model. Không bao giờ chứa toàn bộ key.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationKeysStatus {
    pub openai_configured: bool,
    pub openai_hint: Option<String>,
    pub gemini_configured: bool,
    pub gemini_hint: Option<String>,
}

/// Chỉ giữ 4 ký tự cuối của API Key để người dùng nhận biết (`••••abcd`); chuỗi ngắn `<= 4` ký tự chỉ hiện `••••`.
pub fn mask_key(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let count = trimmed.chars().count();
    if count <= 4 {
        return Some("••••".to_string());
    }
    let tail: String = trimmed.chars().skip(count - 4).collect();
    Some(format!("••••{tail}"))
}

fn with_keystore<R: Runtime, T>(
    app: &AppHandle<R>,
    f: impl FnOnce(&Keystore) -> Result<T, KeystoreError>,
) -> Result<T, KeystoreError> {
    if let Some(ks) = app.try_state::<Arc<Keystore>>() {
        return f(ks.inner());
    }
    let ks = Keystore::os(&app.config().identifier)?;
    f(&ks)
}

fn read_key_from_store(ks: &Keystore, entry: &str) -> Option<String> {
    let bytes = ks.get(entry).ok()??;
    let raw = String::from_utf8(bytes).ok()?;
    let trimmed = raw.trim().to_string();
    (!trimmed.is_empty()).then_some(trimmed)
}

fn read_provider_key<R: Runtime>(app: &AppHandle<R>, provider: TranslationProvider) -> Option<String> {
    let entry = match provider {
        TranslationProvider::Local => return None,
        TranslationProvider::Openai => OPENAI_KEY_ENTRY,
        TranslationProvider::Gemini => GEMINI_KEY_ENTRY,
    };
    with_keystore(app, |ks| Ok(read_key_from_store(ks, entry)))
        .ok()
        .flatten()
}

pub fn get_keys_status<R: Runtime>(app: &AppHandle<R>) -> TranslationKeysStatus {
    with_keystore(app, |ks| {
        let openai = read_key_from_store(ks, OPENAI_KEY_ENTRY);
        let gemini = read_key_from_store(ks, GEMINI_KEY_ENTRY);
        Ok(TranslationKeysStatus {
            openai_configured: openai.is_some(),
            openai_hint: openai.as_deref().and_then(mask_key),
            gemini_configured: gemini.is_some(),
            gemini_hint: gemini.as_deref().and_then(mask_key),
        })
    })
    .unwrap_or_default()
}

pub fn set_api_key<R: Runtime>(
    app: &AppHandle<R>,
    provider: TranslationProvider,
    api_key: &str,
) -> Result<TranslationKeysStatus, CommandError> {
    let entry = match provider {
        TranslationProvider::Openai => OPENAI_KEY_ENTRY,
        TranslationProvider::Gemini => GEMINI_KEY_ENTRY,
        TranslationProvider::Local => {
            return Err(CommandError::new(
                errors::UNKNOWN,
                Some("provider"),
                "nguồn local không dùng API key",
            ));
        }
    };
    let trimmed = api_key.trim();
    with_keystore(app, |ks| {
        if trimmed.is_empty() {
            ks.delete(entry).map(drop)
        } else {
            ks.set(entry, trimmed.as_bytes())
        }
    })
    .map_err(|e| CommandError::new(errors::UNKNOWN, Some("apiKey"), e.to_string()))?;
    reset_translation_fallback(app);
    Ok(get_keys_status(app))
}

/// Đánh dấu phiên đang dùng đã dự phòng về Model Local và báo cho các cửa sổ (`main`, `overlay`, `compose`).
pub fn note_translation_fallback<R: Runtime>(app: &AppHandle<R>) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let changed = state.update_status(|s| {
        if s.translation_fallback {
            return false;
        }
        s.translation_fallback = true;
        true
    });
    if changed {
        log::warn!("nguồn dịch Cloud không khả dụng, tự động chuyển sang Model Local");
        actions::status_changed(app);
    }
}

/// Đặt lại trạng thái dự phòng về `false` khi bắt đầu phiên mới hoặc khi người dùng đổi nguồn dịch / model / API Key.
pub fn reset_translation_fallback<R: Runtime>(app: &AppHandle<R>) {
    if let Some(session) = app.try_state::<Session>() {
        session.mt_fell_back.store(false, Ordering::SeqCst);
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let changed = state.update_status(|s| {
        if !s.translation_fallback {
            return false;
        }
        s.translation_fallback = false;
        true
    });
    if changed {
        actions::status_changed(app);
    }
}

/// Bọc bộ dịch `local` trong [`FallbackMt`] khi người dùng đang chọn ChatGPT hoặc Gemini. Khi chọn `Local`, trả nguyên `local`.
pub fn wrap_mt<R: Runtime>(app: &AppHandle<R>, local: Box<dyn Mt>, fell_back: Arc<AtomicBool>) -> Box<dyn Mt> {
    let Some(state) = app.try_state::<AppState>() else {
        return local;
    };
    let settings = state.settings();
    let (endpoint, model) = match settings.translation_provider {
        TranslationProvider::Local => return local,
        TranslationProvider::Openai => (OPENAI_CHAT_ENDPOINT, settings.openai_model),
        TranslationProvider::Gemini => (GEMINI_CHAT_ENDPOINT, settings.gemini_model),
    };
    let cloud = read_provider_key(app, settings.translation_provider)
        .and_then(|key| CloudMt::new(endpoint, model, key).ok())
        .map(|c| Box::new(c) as Box<dyn Mt>);
    let app_handle = app.clone();
    Box::new(FallbackMt::new(
        cloud,
        local,
        fell_back,
        Arc::new(move || note_translation_fallback(&app_handle)),
    ))
}

static SHARED_HTTP: std::sync::OnceLock<reqwest::blocking::Client> = std::sync::OnceLock::new();
static LAST_OPENAI_WARMUP_SECS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static LAST_GEMINI_WARMUP_SECS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn shared_http_client() -> reqwest::blocking::Client {
    SHARED_HTTP
        .get_or_init(|| {
            reqwest::blocking::Client::builder()
                .connect_timeout(CONNECT_TIMEOUT)
                .timeout(REQUEST_TIMEOUT)
                .tcp_nodelay(true)
                .pool_idle_timeout(Some(Duration::from_secs(120)))
                .pool_max_idle_per_host(8)
                .build()
                .expect("không khởi tạo được HTTP client cho Cloud MT")
        })
        .clone()
}

fn now_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Làm ấm trước kết nối TCP + TLS 1.3 trên luồng nền để câu nói đầu tiên không mất ~600–800 ms bắt tay TLS.
fn prewarm_connection_in_background(endpoint: &str, api_key: &str) {
    let is_gemini = is_gemini_endpoint(endpoint);
    let is_openai = endpoint == OPENAI_CHAT_ENDPOINT;
    if !is_gemini && !is_openai {
        return;
    }
    let now = now_epoch_secs();
    let slot = if is_gemini {
        &LAST_GEMINI_WARMUP_SECS
    } else {
        &LAST_OPENAI_WARMUP_SECS
    };
    let prev = slot.load(Ordering::Relaxed);
    if now.saturating_sub(prev) < WARMUP_TTL_SECS {
        return;
    }
    slot.store(now, Ordering::Relaxed);
    let key = api_key.to_string();
    std::thread::spawn(move || {
        let http = shared_http_client();
        let req = if is_gemini {
            http.get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1")
                .header("x-goog-api-key", key)
        } else {
            http.head("https://api.openai.com/v1/models").bearer_auth(key)
        };
        if let Ok(resp) = req.send() {
            let _ = std::io::copy(&mut resp.take(512), &mut std::io::sink());
        }
    });
}

fn is_gemini_endpoint(endpoint: &str) -> bool {
    endpoint.contains("generativelanguage.googleapis.com")
}

/// Dựng thân JSON cho Native Gemini REST API (`:streamGenerateContent?alt=sse`), tắt hoặc giảm tối đa bước suy luận ngầm
/// (`thinkingConfig`) theo từng dòng model để đạt TTFT ~600–800 ms và tránh lỗi timeout 10 giây của lớp tương thích OpenAI.
fn build_gemini_native_body(model: &str, prompt: &str, max_tokens: u32) -> serde_json::Value {
    let max_output = max_tokens.max(512);
    let gen_config = if model.contains("3.1") || model.contains("3.5") {
        serde_json::json!({
            "temperature": 0.0,
            "maxOutputTokens": max_output,
            "thinkingConfig": {
                "thinkingLevel": "MINIMAL"
            }
        })
    } else {
        // `gemini-flash-lite-latest` mặc định đã tắt thinking; không gửi `thinkingConfig` để đạt tốc độ nhanh nhất (~640 ms).
        serde_json::json!({
            "temperature": 0.0,
            "maxOutputTokens": max_output
        })
    };
    serde_json::json!({
        "contents": [
            {
                "role": "user",
                "parts": [{ "text": prompt }]
            }
        ],
        "generationConfig": gen_config
    })
}

fn gemini_stream_url(endpoint: &str, model: &str) -> String {
    let base = endpoint.trim_end_matches('/');
    if base.ends_with("/v1beta/models") {
        format!("{base}/{model}:streamGenerateContent?alt=sse")
    } else if base.contains(":streamGenerateContent") {
        endpoint.to_string()
    } else {
        format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse")
    }
}

/// Bộ dịch gọi trực tiếp Gemini (Native `:streamGenerateContent?alt=sse`) hoặc OpenAI (`/v1/chat/completions`).
pub struct CloudMt {
    endpoint: String,
    model: String,
    api_key: String,
    http: reqwest::blocking::Client,
}

impl CloudMt {
    pub fn new(
        endpoint: impl Into<String>,
        model: impl Into<String>,
        api_key: impl Into<String>,
    ) -> Result<Self, MtError> {
        let endpoint = endpoint.into();
        let model = model.into();
        let api_key = api_key.into();
        prewarm_connection_in_background(&endpoint, &api_key);
        Ok(Self {
            endpoint,
            model,
            api_key,
            http: shared_http_client(),
        })
    }
}

impl Mt for CloudMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        Ok(text.chars().count().div_ceil(2).max(1))
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        let started = Instant::now();
        let resp = if is_gemini_endpoint(&self.endpoint) {
            let url = gemini_stream_url(&self.endpoint, &self.model);
            let body = build_gemini_native_body(&self.model, req.prompt, req.max_tokens);
            self.http
                .post(&url)
                .header("x-goog-api-key", &self.api_key)
                .json(&body)
                .send()
                .map_err(|_| MtError::Failed("không kết nối được tới máy chủ Cloud MT".into()))?
        } else {
            let body = serde_json::json!({
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": "Output only the raw translation without explanations or quotes."
                    },
                    { "role": "user", "content": req.prompt }
                ],
                "stream": true,
                "temperature": 0.0,
                "max_tokens": req.max_tokens.max(256),
            });
            self.http
                .post(&self.endpoint)
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .map_err(|_| MtError::Failed("không kết nối được tới máy chủ Cloud MT".into()))?
        };
        let status = resp.status();
        if !status.is_success() {
            // Không đọc hay ghi thân lỗi ra ngoài vì phản hồi của server có thể lặp lại API Key.
            return Err(MtError::Failed(format!("cloud HTTP {}", status.as_u16())));
        }
        read_cloud_stream(BufReader::new(resp), started, on_delta)
    }
}

/// Đọc một dòng SSE từ cả định dạng OpenAI (`choices[0].delta.content`) lẫn Gemini Native (`candidates[0].content.parts[0].text`).
fn parse_cloud_sse_line(line: &str) -> Result<SseEvent, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with(':') {
        return Ok(SseEvent::Ignore);
    }
    if let Some(data) = trimmed.strip_prefix("data:") {
        let payload = data.trim();
        if payload == "[DONE]" {
            return Ok(SseEvent::Done);
        }
        if payload.contains("\"candidates\"") {
            let v: serde_json::Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
            let cand = v.get("candidates").and_then(|c| c.get(0));
            let mut content = String::new();
            if let Some(parts) = cand
                .and_then(|c| c.get("content"))
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
            {
                for part in parts {
                    // Bỏ qua các phần suy luận ngầm (`thought: true`) nếu có, chỉ lấy chữ bản dịch thật.
                    if part.get("thought").and_then(|t| t.as_bool()).unwrap_or(false) {
                        continue;
                    }
                    if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
                        content.push_str(t);
                    }
                }
            }
            let finish_reason = cand
                .and_then(|c| c.get("finishReason"))
                .and_then(|f| f.as_str())
                .map(|r| match r {
                    "STOP" => "stop".to_string(),
                    "MAX_TOKENS" => "length".to_string(),
                    other => other.to_lowercase(),
                });
            let completion_tokens = v
                .get("usageMetadata")
                .and_then(|u| u.get("candidatesTokenCount"))
                .and_then(|n| n.as_u64())
                .map(|n| n as usize);
            return Ok(SseEvent::Delta {
                content,
                finish_reason,
                completion_tokens,
            });
        }
    }
    parse_sse_line(line).map_err(|e| e.to_string())
}

fn read_cloud_stream(
    reader: impl BufRead,
    started: Instant,
    on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
) -> Result<StreamEnd, MtError> {
    let mut end = StreamEnd::default();
    let mut first_token_ms = None;
    let mut done = false;
    for line in reader.lines() {
        let line = line.map_err(|_| MtError::Failed("đứt kết nối khi đang đọc stream Cloud MT".into()))?;
        match parse_cloud_sse_line(&line).map_err(|_| MtError::Failed("dữ liệu SSE từ Cloud MT không hợp lệ".into()))?
        {
            SseEvent::Delta {
                content,
                finish_reason,
                completion_tokens,
            } => {
                if first_token_ms.is_none() && !content.trim().is_empty() {
                    first_token_ms = Some(started.elapsed().as_secs_f32() * 1000.0);
                }
                end.finish_reason = finish_reason.or(end.finish_reason);
                end.completion_tokens = completion_tokens.or(end.completion_tokens);
                if !content.is_empty() {
                    end.chunks += 1;
                    end.text.push_str(&content);
                    if on_delta(&content).is_break() {
                        end.cancelled = true;
                        done = true;
                        break;
                    }
                }
            }
            SseEvent::Done => {
                done = true;
                break;
            }
            SseEvent::Ignore => {}
        }
    }
    if !done && end.finish_reason.is_none() {
        return Err(MtError::Failed("stream Cloud MT kết thúc sớm".into()));
    }
    end.total_ms = started.elapsed().as_secs_f32() * 1000.0;
    end.first_token_ms = first_token_ms.unwrap_or(end.total_ms);
    Ok(end)
}

/// Bộ dịch bọc ưu tiên Cloud, tự động chuyển sang `local` đến hết phiên ngay khi Cloud lỗi hoặc thiếu API Key.
pub struct FallbackMt {
    cloud: Option<Box<dyn Mt>>,
    local: Box<dyn Mt>,
    fell_back: Arc<AtomicBool>,
    on_fallback: Arc<dyn Fn() + Send + Sync>,
}

impl FallbackMt {
    pub fn new(
        cloud: Option<Box<dyn Mt>>,
        local: Box<dyn Mt>,
        fell_back: Arc<AtomicBool>,
        on_fallback: Arc<dyn Fn() + Send + Sync>,
    ) -> Self {
        Self {
            cloud,
            local,
            fell_back,
            on_fallback,
        }
    }

    fn trigger_fallback(&self) {
        if !self.fell_back.swap(true, Ordering::SeqCst) {
            (self.on_fallback)();
        }
    }
}

impl Mt for FallbackMt {
    fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
        if !self.fell_back.load(Ordering::SeqCst)
            && let Some(cloud) = self.cloud.as_mut()
        {
            return cloud.count_tokens(text);
        }
        self.local.count_tokens(text)
    }

    fn stream(
        &mut self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
    ) -> Result<StreamEnd, MtError> {
        if !self.fell_back.load(Ordering::SeqCst) {
            if let Some(cloud) = self.cloud.as_mut() {
                let mut emitted = false;
                match cloud.stream(req, &mut |chunk| {
                    if !chunk.is_empty() {
                        emitted = true;
                    }
                    on_delta(chunk)
                }) {
                    Ok(end) => return Ok(end),
                    Err(err) => {
                        self.trigger_fallback();
                        if !emitted {
                            // Lỗi trước khi phát bất kỳ chữ nào: chuyển sang Local ngay trong cùng lượt gọi.
                            return self.local.stream(req, on_delta);
                        }
                        // Lỗi giữa chừng sau khi đã phát vài chữ: trả lỗi để `pipeline::translate::translate`
                        // phát `Event::Retry` xóa chữ dở rồi dùng `local` ở lượt thử thứ 2.
                        return Err(err);
                    }
                }
            } else {
                // Người dùng chọn Cloud nhưng chưa lưu API Key: chuyển sang Local ngay câu đầu tiên.
                self.trigger_fallback();
            }
        }
        self.local.stream(req, on_delta)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{mock_app, window};
    use pipeline::config::MtConfig;
    use pipeline::prompt::Lang as MtLang;
    use pipeline::translate::{Event, Job, Outcome, translate};
    use std::sync::Mutex;
    use std::sync::atomic::AtomicUsize;

    type StreamStep = Box<dyn FnMut(&mut dyn FnMut(&str) -> ControlFlow<()>) -> Result<StreamEnd, MtError> + Send>;

    struct ScriptedMt {
        calls: Arc<AtomicUsize>,
        steps: Mutex<Vec<StreamStep>>,
    }

    impl ScriptedMt {
        fn new(calls: Arc<AtomicUsize>, steps: Vec<StreamStep>) -> Self {
            Self {
                calls,
                steps: Mutex::new(steps),
            }
        }
    }

    impl Mt for ScriptedMt {
        fn count_tokens(&mut self, text: &str) -> Result<usize, MtError> {
            Ok(text.split_whitespace().count().max(1))
        }

        fn stream(
            &mut self,
            _req: &ChatRequest,
            on_delta: &mut dyn FnMut(&str) -> ControlFlow<()>,
        ) -> Result<StreamEnd, MtError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let mut steps = self.steps.lock().unwrap();
            let mut step = steps.remove(0);
            step(on_delta)
        }
    }

    fn ok_stream(text: &'static str) -> StreamStep {
        Box::new(move |on_delta| {
            let _ = on_delta(text);
            Ok(StreamEnd {
                text: text.to_string(),
                finish_reason: Some("stop".into()),
                chunks: 1,
                ..StreamEnd::default()
            })
        })
    }

    fn job(text: &str) -> Job<'_> {
        Job {
            text,
            src: MtLang::En,
            tgt: MtLang::Vi,
            context: None,
            terms: &[],
            cancel: None,
        }
    }

    #[test]
    fn cloud_success_streams_without_touching_local() {
        let cloud_calls = Arc::new(AtomicUsize::new(0));
        let local_calls = Arc::new(AtomicUsize::new(0));
        let fell_back = Arc::new(AtomicBool::new(false));
        let fallback_notified = Arc::new(AtomicUsize::new(0));
        let notify = fallback_notified.clone();

        let mut mt = FallbackMt::new(
            Some(Box::new(ScriptedMt::new(
                cloud_calls.clone(),
                vec![ok_stream("Xin chào từ Cloud")],
            ))),
            Box::new(ScriptedMt::new(local_calls.clone(), vec![])),
            fell_back.clone(),
            Arc::new(move || {
                notify.fetch_add(1, Ordering::SeqCst);
            }),
        );

        let mut events = Vec::new();
        let out = translate(&mut mt, &job("Hello world"), &MtConfig::default(), &mut |ev| {
            if let Event::Delta(d) = ev {
                events.push(d.to_string());
            }
            ControlFlow::Continue(())
        });

        assert!(matches!(out, Outcome::Done(ref t) if t.text == "Xin chào từ Cloud"));
        assert_eq!(cloud_calls.load(Ordering::SeqCst), 1);
        assert_eq!(local_calls.load(Ordering::SeqCst), 0);
        assert!(!fell_back.load(Ordering::SeqCst));
        assert_eq!(fallback_notified.load(Ordering::SeqCst), 0);
    }

    #[test]
    fn cloud_error_before_any_delta_falls_back_immediately_in_same_call() {
        let cloud_calls = Arc::new(AtomicUsize::new(0));
        let local_calls = Arc::new(AtomicUsize::new(0));
        let fell_back = Arc::new(AtomicBool::new(false));
        let fallback_notified = Arc::new(AtomicUsize::new(0));
        let notify = fallback_notified.clone();

        let mut mt = FallbackMt::new(
            Some(Box::new(ScriptedMt::new(
                cloud_calls.clone(),
                vec![Box::new(|_| Err(MtError::Failed("cloud HTTP 401".into())))],
            ))),
            Box::new(ScriptedMt::new(
                local_calls.clone(),
                vec![ok_stream("Bản dịch Local câu 1"), ok_stream("Bản dịch Local câu 2")],
            )),
            fell_back.clone(),
            Arc::new(move || {
                notify.fetch_add(1, Ordering::SeqCst);
            }),
        );

        let mut retries = 0;
        let out1 = translate(&mut mt, &job("First sentence"), &MtConfig::default(), &mut |ev| {
            if matches!(ev, Event::Retry) {
                retries += 1;
            }
            ControlFlow::Continue(())
        });
        assert!(matches!(out1, Outcome::Done(ref t) if t.text == "Bản dịch Local câu 1" && t.attempts == 1));
        assert_eq!(retries, 0, "chuyển sang Local ngay trong lượt 1 mà không cần Retry");
        assert!(fell_back.load(Ordering::SeqCst));
        assert_eq!(fallback_notified.load(Ordering::SeqCst), 1);

        // Câu thứ hai đi thẳng vào Local, không gọi Cloud nữa.
        let out2 = translate(&mut mt, &job("Second sentence"), &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert!(matches!(out2, Outcome::Done(ref t) if t.text == "Bản dịch Local câu 2"));
        assert_eq!(cloud_calls.load(Ordering::SeqCst), 1);
        assert_eq!(local_calls.load(Ordering::SeqCst), 2);
        assert_eq!(fallback_notified.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn cloud_error_mid_stream_triggers_retry_then_uses_local() {
        let cloud_calls = Arc::new(AtomicUsize::new(0));
        let local_calls = Arc::new(AtomicUsize::new(0));
        let fell_back = Arc::new(AtomicBool::new(false));
        let fallback_notified = Arc::new(AtomicUsize::new(0));
        let notify = fallback_notified.clone();

        let mut mt = FallbackMt::new(
            Some(Box::new(ScriptedMt::new(
                cloud_calls.clone(),
                vec![Box::new(|on_delta| {
                    let _ = on_delta("Xin chào dở dang");
                    Err(MtError::Failed("đứt kết nối".into()))
                })],
            ))),
            Box::new(ScriptedMt::new(
                local_calls.clone(),
                vec![ok_stream("Xin chào hoàn chỉnh từ Local")],
            )),
            fell_back.clone(),
            Arc::new(move || {
                notify.fetch_add(1, Ordering::SeqCst);
            }),
        );

        let mut retries = 0;
        let out = translate(&mut mt, &job("Hello complete"), &MtConfig::default(), &mut |ev| {
            if matches!(ev, Event::Retry) {
                retries += 1;
            }
            ControlFlow::Continue(())
        });

        assert!(matches!(out, Outcome::Done(ref t) if t.text == "Xin chào hoàn chỉnh từ Local" && t.attempts == 2));
        assert_eq!(retries, 1, "phải phát Event::Retry để giao diện xóa phần chữ dở");
        assert_eq!(cloud_calls.load(Ordering::SeqCst), 1);
        assert_eq!(local_calls.load(Ordering::SeqCst), 1);
        assert!(fell_back.load(Ordering::SeqCst));
        assert_eq!(fallback_notified.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn missing_api_key_falls_back_to_local_on_first_sentence() {
        let local_calls = Arc::new(AtomicUsize::new(0));
        let fell_back = Arc::new(AtomicBool::new(false));
        let fallback_notified = Arc::new(AtomicUsize::new(0));
        let notify = fallback_notified.clone();

        let mut mt = FallbackMt::new(
            None,
            Box::new(ScriptedMt::new(
                local_calls.clone(),
                vec![ok_stream("Dịch bằng Local khi chưa có key")],
            )),
            fell_back.clone(),
            Arc::new(move || {
                notify.fetch_add(1, Ordering::SeqCst);
            }),
        );

        let out = translate(&mut mt, &job("Hello"), &MtConfig::default(), &mut |_| {
            ControlFlow::Continue(())
        });
        assert!(matches!(out, Outcome::Done(ref t) if t.text == "Dịch bằng Local khi chưa có key"));
        assert_eq!(local_calls.load(Ordering::SeqCst), 1);
        assert!(fell_back.load(Ordering::SeqCst));
        assert_eq!(fallback_notified.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn mask_key_only_exposes_last_four_chars_and_never_logs_secret() {
        assert_eq!(mask_key(""), None);
        assert_eq!(mask_key("   "), None);
        assert_eq!(mask_key("abcd"), Some("••••".to_string()));
        assert_eq!(mask_key("sk-proj-1234567890abcd"), Some("••••abcd".to_string()));

        let app = mock_app();
        app.manage(Arc::new(Keystore::mock(&app.config().identifier)));
        let status = set_api_key(app.handle(), TranslationProvider::Openai, "  sk-proj-9999xyz1  ").unwrap();
        assert!(status.openai_configured);
        assert_eq!(status.openai_hint.as_deref(), Some("••••xyz1"));
        assert!(!status.gemini_configured);
        assert_eq!(status.gemini_hint, None);

        let status = set_api_key(app.handle(), TranslationProvider::Gemini, "AIzaSyGeminiKey7890").unwrap();
        assert!(status.gemini_configured);
        assert_eq!(status.gemini_hint.as_deref(), Some("••••7890"));

        let cleared = set_api_key(app.handle(), TranslationProvider::Openai, "").unwrap();
        assert!(!cleared.openai_configured);
        assert_eq!(cleared.openai_hint, None);
        assert!(cleared.gemini_configured);
    }

    #[test]
    fn note_and_reset_translation_fallback_update_app_status_and_views() {
        let app = mock_app();
        let main = window(&app, "main");
        crate::test_support::invoke(
            &main,
            "update_settings",
            serde_json::json!({
                "patch": {
                    "translationProvider": "gemini",
                    "geminiModel": "gemini-3.5-flash-lite"
                }
            }),
        )
        .unwrap();

        let s = app.state::<AppState>().settings();
        let ov = crate::state::OverlayView::from_settings(&s);
        assert_eq!(ov.translation_provider, TranslationProvider::Gemini);
        assert_eq!(ov.gemini_model, "gemini-3.5-flash-lite");

        assert!(!app.state::<AppState>().status().translation_fallback);
        note_translation_fallback(app.handle());
        assert!(app.state::<AppState>().status().translation_fallback);
        assert!(crate::compose::view(app.handle()).translation_fallback);

        // Khi người dùng đổi lại nguồn dịch hoặc model trong cài đặt, cờ fallback tự động được xóa.
        crate::test_support::invoke(
            &main,
            "update_settings",
            serde_json::json!({
                "patch": {
                    "openaiModel": "gpt-4.1-mini"
                }
            }),
        )
        .unwrap();
        assert!(!app.state::<AppState>().status().translation_fallback);
    }

    #[test]
    fn gemini_native_body_and_sse_parser_handle_all_models_and_thoughts() {
        let b_lite = build_gemini_native_body("gemini-flash-lite-latest", "Hi", 48);
        assert_eq!(b_lite["generationConfig"]["maxOutputTokens"], 512);
        assert!(b_lite["generationConfig"].get("thinkingConfig").is_none());

        let b_31 = build_gemini_native_body("gemini-3.1-flash-lite", "Hi", 48);
        assert_eq!(b_31["generationConfig"]["thinkingConfig"]["thinkingLevel"], "MINIMAL");

        let b_35 = build_gemini_native_body("gemini-3.5-flash-lite", "Hi", 48);
        assert_eq!(b_35["generationConfig"]["thinkingConfig"]["thinkingLevel"], "MINIMAL");

        assert_eq!(
            gemini_stream_url(GEMINI_CHAT_ENDPOINT, "gemini-3.1-flash-lite"),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:streamGenerateContent?alt=sse"
        );

        let sse_stream = concat!(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"thought\":true,\"text\":\"suy nghĩ ngầm\"},{\"text\":\"Xin chào \"}]}}]}\n\n",
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"thế giới\"}]},\"finishReason\":\"STOP\"}],\"usageMetadata\":{\"candidatesTokenCount\":4}}\n\n"
        );
        let mut deltas = Vec::new();
        let end = read_cloud_stream(
            std::io::Cursor::new(sse_stream.as_bytes()),
            Instant::now(),
            &mut |chunk| {
                deltas.push(chunk.to_string());
                ControlFlow::Continue(())
            },
        )
        .unwrap();
        assert_eq!(deltas, vec!["Xin chào ", "thế giới"]);
        assert_eq!(end.text, "Xin chào thế giới");
        assert_eq!(end.finish_reason.as_deref(), Some("stop"));
        assert_eq!(end.completion_tokens, Some(4));
    }
}
