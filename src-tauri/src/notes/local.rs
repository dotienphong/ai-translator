#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
//! Engine ghi chú chạy trên máy: một `llama-server` riêng của ghi chú (không dùng chung với dịch), nạp model ghi chú đã tải
//! và trả lời theo khuôn JSON của từng `Format`. Cấu hình `c16kx` của bench `2026-11-11-ghi-chu-cuoc-hop`: ngữ cảnh 16384,
//! `--cache-ram 0`, không suy nghĩ (`enable_thinking: false`), nhiệt độ 0, đầu ra theo `json_schema`.
//!
//! Server nghe `127.0.0.1` cổng do server chọn (đọc từ stderr của chính tiến trình con), khóa API ngẫu nhiên chỉ nằm trong
//! RAM và được che khỏi log. Phần HTTP tách riêng thành [`Client`] để test bằng server giả, không cần tiến trình thật.

use std::collections::hash_map::RandomState;
use std::fs::File;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, mpsc};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use pipeline::llama::{self, LlamaLaunch};
use pipeline::{logfile, process};
use serde_json::{Value, json};

use super::engine::{Format, Interrupt, Limits, NotesEngine, NotesError, NotesRequest, Role, Strategy};
use crate::sidecar::integrity::sha256_file;

/// Thời gian chờ server nạp model và báo sẵn sàng.
pub const READY_TIMEOUT: Duration = Duration::from_secs(300);
/// Thời gian tối đa của một request (một đoạn dài trên CPU có thể chạy hàng chục phút).
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(1800);
/// Tên file log (stderr của server, đã che khóa) trong thư mục log của app.
pub const LOG_NAME: &str = "notes-llama-server.log";

/// Chu kỳ xem cờ hủy và chu kỳ hỏi `/health`.
const POLL: Duration = Duration::from_millis(200);

/// Cách chạy engine local: `llama-server`, model đã tải (kèm SHA-256 phải khớp), ngữ cảnh và nơi ghi log.
#[derive(Clone, Debug, Default)]
pub struct LocalSpec {
    pub exe: PathBuf,
    pub model: PathBuf,
    pub model_sha256: String,
    pub ctx: u32,
    pub use_gpu: bool,
    pub log: PathBuf,
    /// Biến môi trường của tiến trình (cùng bộ với `llama-server` của dịch, ví dụ tránh lỗi driver Vulkan trên Windows).
    pub env: Vec<(String, String)>,
    /// Handle chỉ-đọc của binary đã kiểm (Windows, `integrity::Verified::locks`): giữ tới khi engine bị bỏ để binary không bị
    /// thay giữa lúc kiểm và lúc chạy.
    pub hold: Arc<Vec<File>>,
}

/// Cổng trong dòng `llama_server: listening on http://127.0.0.1:<cổng>` mà server in ra stderr sau khi nạp xong model. Chỉ
/// nhận đúng host 127.0.0.1 và cổng khác 0.
fn listening_port(line: &str) -> Option<u16> {
    let (_, rest) = line.split_once("listening on http://127.0.0.1:")?;
    let digits = rest
        .find(|c: char| !c.is_ascii_digit())
        .map_or(rest, |end| &rest[..end]);
    digits.parse().ok().filter(|&p| p != 0)
}

/// Khóa ngẫu nhiên 128 bit (hex) cho `LLAMA_API_KEY`: `RandomState` lấy seed từ bộ sinh số ngẫu nhiên của hệ điều hành.
fn random_key() -> String {
    (0..2)
        .map(|i| {
            let mut h = RandomState::new().build_hasher();
            h.write_u64(i);
            format!("{:016x}", h.finish())
        })
        .collect()
}

/// Khuôn JSON (`response_format.json_schema.schema`) của từng dạng câu trả lời: `additionalProperties: false`, mọi trường
/// đều `required`. Cùng hình với `schema.json` và `VERIFY_SCHEMA` của bench.
fn schema_of(format: Format) -> Value {
    let refs = json!({ "type": "array", "items": { "type": "integer" } });
    let text_refs = json!({
        "type": "object", "additionalProperties": false, "required": ["text", "refs"],
        "properties": { "text": { "type": "string" }, "refs": refs.clone() }
    });
    match format {
        Format::Notes => json!({
            "type": "object", "additionalProperties": false,
            "required": ["summary", "decisions", "action_items", "open_questions"],
            "properties": {
                "summary": { "type": "string" },
                "decisions": { "type": "array", "items": text_refs.clone() },
                "action_items": { "type": "array", "items": {
                    "type": "object", "additionalProperties": false,
                    "required": ["text", "owner", "due", "refs"],
                    "properties": {
                        "text": { "type": "string" }, "owner": { "type": "string" },
                        "due": { "type": "string" }, "refs": refs
                    }
                } },
                "open_questions": { "type": "array", "items": text_refs }
            }
        }),
        Format::Summary => json!({
            "type": "object", "additionalProperties": false, "required": ["summary"],
            "properties": { "summary": { "type": "string" } }
        }),
        Format::Verdict => json!({
            "type": "object", "additionalProperties": false, "required": ["items"],
            "properties": { "items": { "type": "array", "items": {
                "type": "object", "additionalProperties": false,
                "required": ["n", "keep", "owner", "due"],
                "properties": {
                    "n": { "type": "integer" }, "keep": { "type": "boolean" },
                    "owner": { "type": "string" }, "due": { "type": "string" }
                }
            } } }
        }),
    }
}

/// Phần HTTP của engine: gọi một `llama-server` đã chạy ở `base` với khóa `key`.
struct Client {
    base: String,
    key: String,
    http: reqwest::blocking::Client,
}

impl Client {
    /// Chỉ gọi 127.0.0.1: tắt proxy tường minh (reqwest vẫn đọc `HTTP_PROXY`). Không giữ kết nối dùng lại: server đóng
    /// kết nối sau mỗi response nên một kết nối cũ sẽ báo lỗi ở request kế tiếp.
    fn new(base: &str, key: &str, timeout: Duration) -> Result<Self, NotesError> {
        let http = reqwest::blocking::Client::builder()
            .no_proxy()
            .pool_max_idle_per_host(0)
            .timeout(timeout)
            .build()
            .map_err(|_| NotesError::Engine("không dựng được client HTTP".into()))?;
        Ok(Self {
            base: base.to_string(),
            key: key.to_string(),
            http,
        })
    }

    /// `GET /health` trả 200.
    fn healthy(&self) -> bool {
        self.http
            .get(format!("{}/health", self.base))
            .bearer_auth(&self.key)
            .timeout(Duration::from_secs(2))
            .send()
            .is_ok_and(|r| r.status().as_u16() == 200)
    }

    /// `POST /v1/chat/completions` với khuôn của `req.format`; trả `choices[0].message.content`. Lỗi không bao giờ kèm thân
    /// của response (có thể chứa chữ của cuộc họp).
    fn chat(&self, req: &NotesRequest) -> Result<String, NotesError> {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| {
                let role = match m.role {
                    Role::User => "user",
                    Role::Assistant => "assistant",
                };
                json!({ "role": role, "content": m.content })
            })
            .collect();
        let body = json!({
            "messages": messages,
            "temperature": 0,
            "max_tokens": req.max_tokens,
            "chat_template_kwargs": { "enable_thinking": false },
            "response_format": {
                "type": "json_schema",
                "json_schema": { "name": "notes", "schema": schema_of(req.format) }
            }
        });
        let resp = self
            .http
            .post(format!("{}/v1/chat/completions", self.base))
            .bearer_auth(&self.key)
            .json(&body)
            .send()
            .map_err(|_| NotesError::Engine("llama-server: mất kết nối".into()))?;
        let code = resp.status().as_u16();
        if code != 200 {
            return Err(NotesError::Engine(format!("llama-server: {code}")));
        }
        let value: Value = resp.json().map_err(|_| NotesError::BadResponse)?;
        value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or(NotesError::BadResponse)
    }

    /// Số token của `text` theo tokenizer của model (`POST /tokenize`); lỗi thì ước bằng `chars / 2` (tối thiểu 1).
    fn count_tokens(&self, text: &str) -> usize {
        let counted = self
            .http
            .post(format!("{}/tokenize", self.base))
            .bearer_auth(&self.key)
            .json(&json!({ "content": text }))
            .send()
            .ok()
            .filter(|r| r.status().as_u16() == 200)
            .and_then(|r| r.json::<Value>().ok())
            .and_then(|v| v.get("tokens").and_then(Value::as_array).map(Vec::len));
        counted.unwrap_or_else(|| (text.chars().count() / 2).max(1))
    }
}

/// Tiến trình `llama-server` và luồng chép log của nó. Bỏ đi thì kill, chờ thoát, nhả pid và chờ luồng log.
struct Proc {
    child: Arc<Mutex<Child>>,
    pid: u32,
    pump: Option<JoinHandle<()>>,
}

impl Proc {
    fn child(&self) -> MutexGuard<'_, Child> {
        self.child.lock().unwrap_or_else(|e| e.into_inner())
    }
}

impl Drop for Proc {
    fn drop(&mut self) {
        {
            let mut child = self.child();
            let _ = child.kill();
            let _ = child.wait();
        }
        process::release(self.pid);
        if let Some(pump) = self.pump.take() {
            let _ = pump.join();
        }
    }
}

/// Engine ghi chú trên máy: nối tới một `llama-server` do chính nó chạy; bỏ đi thì server dừng.
pub struct LocalNotes {
    client: Client,
    proc: Proc,
    /// Sống lâu hơn `proc` (khai báo sau): binary vẫn bị khóa tới khi tiến trình đã dừng.
    _hold: Arc<Vec<File>>,
}

impl std::fmt::Debug for LocalNotes {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LocalNotes")
            .field("pid", &self.proc.pid)
            .field("base", &self.client.base)
            .field("key", &"<ẩn>")
            .finish()
    }
}

impl LocalNotes {
    /// Băm model (lệch `model_sha256` thì dừng, chưa chạy gì), chạy `llama-server` rồi chờ `/health` trả 200 trong
    /// [`READY_TIMEOUT`]. `cancel` bật trong lúc chờ thì dừng server và trả `Cancelled`.
    pub fn start(spec: &LocalSpec, cancel: &AtomicBool) -> Result<Self, NotesError> {
        let actual = sha256_file(&spec.model).map_err(|_| NotesError::Engine("không đọc được model ghi chú".into()))?;
        if !actual.eq_ignore_ascii_case(spec.model_sha256.trim()) {
            return Err(NotesError::ModelCorrupt);
        }
        let mut launch = LlamaLaunch::new(&spec.exe, &spec.model, &spec.log);
        launch.use_gpu = spec.use_gpu;
        launch.env = spec.env.clone();
        // Đứng sau `-c 2048` của `llama::command`: llama.cpp lấy giá trị cuối.
        launch.extra_args = vec![
            "-c".into(),
            spec.ctx.to_string(),
            "--cache-ram".into(),
            "0".into(),
        ];
        let key = random_key();
        let log = logfile::RotatingLog::open(&spec.log, logfile::MAX_BYTES, logfile::KEEP)
            .map_err(|_| NotesError::Engine("không mở được log llama-server".into()))?;
        let mut child = process::spawn(&mut llama::command(&launch, 0, &key), &spec.exe)
            .map_err(|_| NotesError::Engine("không chạy được llama-server".into()))?;
        let pid = child.id();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));
        let Some(stderr) = stderr else {
            drop(Proc {
                child,
                pid,
                pump: None,
            });
            return Err(NotesError::Engine("llama-server không có stderr".into()));
        };
        // Cổng chỉ lấy từ stderr của chính tiến trình con (pipe riêng), không dò qua mạng.
        let (port_tx, port_rx) = mpsc::channel();
        let mut port_tx = Some(port_tx);
        let (pump, _tail) = logfile::pump_observed(stderr, log, vec![key.clone()], move |line| {
            if let Some(port) = listening_port(line)
                && let Some(tx) = port_tx.take()
            {
                let _ = tx.send(port);
            }
        });
        // Từ đây mọi đường thoát đều bỏ `proc`: kill, wait, nhả pid, chờ luồng log.
        let proc = Proc {
            child,
            pid,
            pump: Some(pump),
        };
        let started = Instant::now();
        let mut client: Option<Client> = None;
        while started.elapsed() < READY_TIMEOUT {
            if cancel.load(Ordering::SeqCst) {
                return Err(NotesError::Cancelled);
            }
            if proc.child().try_wait().ok().flatten().is_some() {
                return Err(NotesError::Engine("llama-server thoát sớm".into()));
            }
            match client.take() {
                None => match port_rx.recv_timeout(POLL) {
                    Ok(port) => client = Some(Client::new(&format!("http://127.0.0.1:{port}"), &key, REQUEST_TIMEOUT)?),
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    // Luồng log đã dừng mà chưa thấy cổng: vòng sau sẽ thấy tiến trình đã thoát.
                    Err(mpsc::RecvTimeoutError::Disconnected) => std::thread::sleep(POLL),
                },
                Some(c) => {
                    if c.healthy() {
                        return Ok(Self {
                            client: c,
                            proc,
                            _hold: spec.hold.clone(),
                        });
                    }
                    client = Some(c);
                    std::thread::sleep(POLL);
                }
            }
        }
        Err(NotesError::Engine("llama-server không sẵn sàng".into()))
    }

    /// Cách kill server từ luồng khác, kể cả khi một luồng đang chặn giữa request.
    pub fn killer(&self) -> process::Killer {
        process::Killer::new(self.proc.child.clone())
    }
}

impl NotesEngine for LocalNotes {
    fn limits(&self) -> Limits {
        Limits {
            budget: 12_000,
            max_map: 2_000,
            max_reduce: 800,
        }
    }

    fn count_tokens(&self, text: &str) -> usize {
        self.client.count_tokens(text)
    }

    fn strategy(&self) -> Strategy {
        Strategy::Verified
    }

    fn interrupter(&self) -> Option<Interrupt> {
        let killer = self.killer();
        Some(Arc::new(move || killer.kill()))
    }

    /// Một luồng trong `thread::scope` xem `cancel` mỗi 200 ms và kill server khi bật, để request đang chặn thoát ngay.
    fn generate(&self, req: &NotesRequest, cancel: &AtomicBool) -> Result<String, NotesError> {
        if cancel.load(Ordering::SeqCst) {
            return Err(NotesError::Cancelled);
        }
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let killer = self.killer();
        let result = std::thread::scope(|scope| {
            scope.spawn(move || {
                while let Err(mpsc::RecvTimeoutError::Timeout) = stop_rx.recv_timeout(POLL) {
                    if cancel.load(Ordering::SeqCst) {
                        killer.kill();
                        break;
                    }
                }
            });
            let result = self.client.chat(req);
            drop(stop_tx);
            result
        });
        if cancel.load(Ordering::SeqCst) {
            return Err(NotesError::Cancelled);
        }
        result
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::license::client::tests::serve;
    use crate::notes::engine::Message;

    fn req(format: Format) -> NotesRequest {
        NotesRequest {
            messages: vec![
                Message {
                    role: Role::User,
                    content: "p".into(),
                },
                Message {
                    role: Role::Assistant,
                    content: "a".into(),
                },
            ],
            max_tokens: 77,
            format,
        }
    }
    fn client(base: &str) -> Client {
        Client::new(base, "k", Duration::from_secs(10)).unwrap()
    }

    #[test]
    fn the_request_carries_the_schema_of_its_format_and_disables_thinking() {
        let cases = [
            (
                Format::Notes,
                vec!["summary", "decisions", "action_items", "open_questions"],
            ),
            (Format::Summary, vec!["summary"]),
            (Format::Verdict, vec!["items"]),
        ];
        for (format, required) in cases {
            let (base, seen) = serve(vec![(200, vec![], r#"{"choices":[{"message":{"content":"ok"}}]}"#)]);
            assert_eq!(client(&base).chat(&req(format)).unwrap(), "ok");
            let sent = seen.lock().unwrap()[0].clone();
            assert_eq!((sent.method.as_str(), sent.path.as_str()), ("POST", "/v1/chat/completions"));
            assert_eq!(sent.authorization.as_deref(), Some("Bearer k"));
            let body = &sent.body;
            assert_eq!(body["temperature"], 0);
            assert_eq!(body["max_tokens"], 77);
            assert_eq!(body["chat_template_kwargs"]["enable_thinking"], false);
            assert_eq!(body["messages"][1]["role"], "assistant");
            assert_eq!(body["response_format"]["type"], "json_schema");
            assert_eq!(body["response_format"]["json_schema"]["name"], "notes");
            let schema = &body["response_format"]["json_schema"]["schema"];
            assert_eq!(schema["additionalProperties"], false);
            let got: Vec<&str> = schema["required"].as_array().unwrap().iter().map(|v| v.as_str().unwrap()).collect();
            assert_eq!(got, required, "{format:?}");
        }
    }

    #[test]
    fn a_non_200_reply_is_an_engine_error_without_the_body() {
        let (base, _) = serve(vec![(500, vec![], "SECRET meeting words")]);
        match client(&base).chat(&req(Format::Notes)) {
            Err(NotesError::Engine(msg)) => assert!(msg.contains("500") && !msg.contains("SECRET"), "{msg}"),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn a_reply_without_content_is_a_bad_response() {
        for body in [r#"{"choices":[]}"#, r#"{"choices":[{"message":{}}]}"#, "không phải JSON"] {
            let (base, _) = serve(vec![(200, vec![], body)]);
            assert_eq!(client(&base).chat(&req(Format::Notes)).unwrap_err(), NotesError::BadResponse, "{body}");
        }
    }

    #[test]
    fn count_tokens_reads_the_token_array_and_falls_back() {
        let (base, seen) = serve(vec![
            (200, vec![], r#"{"tokens":[1,2,3]}"#),
            (500, vec![], "lỗi"),
            (500, vec![], "lỗi"),
        ]);
        let c = client(&base);
        assert_eq!(c.count_tokens("xin chào"), 3);
        assert_eq!(seen.lock().unwrap()[0].path, "/tokenize");
        assert_eq!(seen.lock().unwrap()[0].body["content"], "xin chào");
        assert_eq!(c.count_tokens("abcdefgh"), 4); // lỗi: chars / 2
        assert_eq!(c.count_tokens(""), 1); // tối thiểu 1
    }

    #[test]
    fn listening_port_reads_only_the_loopback_line() {
        assert_eq!(listening_port("llama_server: listening on http://127.0.0.1:51234"), Some(51234));
        assert_eq!(listening_port("main: server is listening on http://127.0.0.1:8080 - starting"), Some(8080));
        for bad in [
            "llama_server: listening on http://0.0.0.0:51234",
            "listening on http://192.168.1.2:80",
            "listening on http://127.0.0.1:0",
            "listening on http://127.0.0.1:",
            "model loaded",
            "",
        ] {
            assert_eq!(listening_port(bad), None, "{bad}");
        }
    }

    fn temp_model(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("notes-local-{tag}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("model.gguf");
        std::fs::write(&path, b"not a real model").unwrap();
        path
    }

    #[test]
    fn a_model_with_the_wrong_sha256_does_not_start() {
        let model = temp_model("sha");
        let spec = LocalSpec {
            exe: PathBuf::from("khong-co-llama-server.exe"),
            model: model.clone(),
            model_sha256: "ab".repeat(32),
            ctx: 16_384,
            use_gpu: false,
            log: model.with_file_name(LOG_NAME),
            ..LocalSpec::default()
        };
        match LocalNotes::start(&spec, &AtomicBool::new(false)) {
            Err(NotesError::ModelCorrupt) => {}
            other => panic!("{other:?}"),
        }
        // Đúng SHA-256 thì qua bước băm và mới lỗi ở chỗ chạy `exe` không tồn tại: chứng tỏ băm đi trước.
        let spec = LocalSpec {
            model_sha256: sha256_file(&model).unwrap().to_uppercase(),
            ..spec
        };
        match LocalNotes::start(&spec, &AtomicBool::new(false)) {
            Err(NotesError::Engine(msg)) => assert!(!msg.contains("SHA-256"), "{msg}"),
            other => panic!("{other:?}"),
        }
        let _ = std::fs::remove_dir_all(model.parent().unwrap());
    }

    #[test]
    fn random_keys_are_128_bit_hex_and_differ() {
        let (a, b) = (random_key(), random_key());
        assert!(a.len() == 32 && a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    /// Chạy `llama-server` thật. Cần `NOTES_LLAMA_EXE`, `NOTES_MODEL` (và `NOTES_USE_GPU=1` nếu muốn GPU); không in chữ cuộc họp.
    #[test]
    #[ignore = "chạy llama-server thật, cần NOTES_LLAMA_EXE và NOTES_MODEL"]
    fn live_local_builds_valid_notes_from_a_short_meeting() {
        use crate::notes::chunk::PromptLine;
        let exe = PathBuf::from(std::env::var("NOTES_LLAMA_EXE").expect("đặt NOTES_LLAMA_EXE"));
        let model = PathBuf::from(std::env::var("NOTES_MODEL").expect("đặt NOTES_MODEL"));
        let dir = std::env::temp_dir().join(format!("notes-local-live-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let spec = LocalSpec {
            model_sha256: sha256_file(&model).unwrap(),
            exe,
            model,
            ctx: 16_384,
            use_gpu: std::env::var("NOTES_USE_GPU").is_ok_and(|v| v == "1"),
            log: dir.join(LOG_NAME),
            ..LocalSpec::default()
        };
        let say = |seq: u32, who: &str, text: &str| PromptLine {
            seq,
            speaker: Some(who.into()),
            text: text.into(),
            source: None,
        };
        let lines = vec![
            say(1, "Lan", "Chào mọi người, hôm nay ta chốt kế hoạch ra mắt bản 2.0."),
            say(2, "Minh", "Mình đề nghị ra mắt vào ngày 15 tháng 12, và để kiểm thử cần thêm hai tuần."),
            say(3, "Lan", "Được, chốt ngày 15 tháng 12. Minh, bạn gửi bản kiểm thử cho tôi trước thứ Sáu nhé."),
            say(4, "Minh", "Vâng, tôi sẽ gửi bản kiểm thử trước thứ Sáu."),
            say(5, "Hoa", "Còn ngân sách quảng cáo thì sao? Chúng ta chưa có con số."),
            say(6, "Lan", "Đó là câu hỏi còn mở, Hoa tìm hiểu rồi báo lại trong cuộc họp tuần sau."),
        ];
        let started = Instant::now();
        let engine = LocalNotes::start(&spec, &AtomicBool::new(false)).unwrap();
        println!("live local: server sẵn sàng sau {} ms", started.elapsed().as_millis());
        let props: Value = engine
            .client
            .http
            .get(format!("{}/props", engine.client.base))
            .bearer_auth(&engine.client.key)
            .send()
            .unwrap()
            .json()
            .unwrap();
        assert_eq!(props["default_generation_settings"]["n_ctx"], 16_384, "server phải chạy đúng ngữ cảnh đã yêu cầu");
        let mut last = (0, 0);
        let out = crate::notes::job::run(
            &lines,
            "vi",
            crate::settings::NotesTemplate::Meeting,
            &engine,
            &AtomicBool::new(false),
            &mut |done, total| last = (done, total),
        )
        .unwrap();
        let n = &out.notes;
        println!(
            "live local: {} ms, chunks {}, failed {}, raw {}, decisions {}, actions {}, questions {}, verify {:?}, progress {:?}",
            started.elapsed().as_millis(),
            out.chunks,
            out.failed_chunks,
            n.raw,
            n.decisions.len(),
            n.action_items.len(),
            n.open_questions.len(),
            out.verify,
            last
        );
        assert!(!n.raw && out.failed_chunks == 0 && !n.summary.trim().is_empty());
        assert!(!n.decisions.is_empty() && !n.action_items.is_empty());
        let valid = |refs: &[u32]| refs.iter().all(|r| (1..=6).contains(r));
        assert!(n.decisions.iter().all(|d| valid(&d.refs)));
        assert!(n.action_items.iter().all(|a| valid(&a.refs)));
        assert!(
            n.action_items.iter().any(|a| a.owner == "Minh"),
            "việc gửi bản kiểm thử phải có người nhận là Minh"
        );
        drop(engine);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
