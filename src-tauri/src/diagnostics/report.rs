//! Dựng báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §2): chọn log, che dữ liệu, kiểm lần cuối (fail closed), ghép JSON
//! đúng hợp đồng của `POST /v1/diagnostics` (kế hoạch bao-cao-loi-01, mục "Hợp đồng") và giữ trong 64 KB.
//!
//! Không bao giờ có trong báo cáo: âm thanh, chữ chép lời, bản dịch, key, token, email, tên tài khoản, tên máy, đường dẫn thư mục
//! cá nhân. Ngoài việc che, mỗi chuỗi tự do còn qua `scrub::find_sensitive`: còn mẫu nhạy cảm thì bỏ cả báo cáo.

use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::logs::{APP_LOG_MAX_BYTES, ASR_LOG_MAX_BYTES, LLAMA_LOG_MAX_BYTES, app_lines, fit_tail, sidecar_lines};
use super::scrub::{self, Params};

/// Trần cả báo cáo (JSON), byte. Server nhận tới 80 KB (`MAX_BODY_BYTES`), phần dư cho cách escape.
pub const MAX_REPORT_BYTES: usize = 64 * 1024;
/// Trần câu lỗi, ký tự (cùng `MAX_MESSAGE_CHARS` của server).
pub const MAX_MESSAGE_CHARS: usize = 500;
/// Dấu vân tay của báo cáo gửi tay: không thuộc nhóm lỗi nào.
pub const ZERO_FINGERPRINT: &str = "0000000000000000";
const ID_ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Loại báo cáo (`kind` của server).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Crash,
    SessionError,
    SidecarDied,
    Manual,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Crash => "crash",
            Kind::SessionError => "session_error",
            Kind::SidecarDied => "sidecar_died",
            Kind::Manual => "manual",
        }
    }
}

/// Điều vừa xảy ra.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub kind: Kind,
    /// Mã lỗi (`sidecarFailed`, `panic`, `unclean_exit`, `asr`…); `None` với báo cáo gửi tay.
    pub code: Option<String>,
    /// Vị trí để nhóm lỗi: `file:line` của panic, `which` của tiến trình phụ, `unclean`; rỗng nếu không có.
    pub location: String,
    pub message: String,
    /// Giờ Unix (giây) lúc xảy ra.
    pub at: i64,
}

/// Thông tin máy và app, đã đọc sẵn (xem `machine.rs` và `mod.rs`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Facts {
    pub app_version: String,
    /// `release` hay `debug`.
    pub build: &'static str,
    pub os_name: String,
    pub os_version: String,
    pub arch: String,
    pub chip: Option<String>,
    pub ram_mb: Option<u64>,
    /// `metal`, `vulkan` hay `cpu`; `None` nếu `asr-worker` chưa chạy lần nào.
    pub gpu_backend: Option<String>,
    pub model_pack: Option<String>,
    /// `free`, `monthly`, `six_months`, `yearly` (không có key).
    pub plan: Option<String>,
    pub ui_lang: String,
    pub device_id_hash: String,
}

/// Nội dung thô của ba file log (chưa chọn dòng, chưa che).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RawLogs {
    pub app: String,
    pub asr: String,
    pub llama: String,
}

/// Báo cáo đã dựng, sẵn sàng gửi hay xếp hàng.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Report {
    pub id: String,
    pub kind: Kind,
    pub fingerprint: String,
    pub json: String,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum BuildError {
    #[error("còn dữ liệu nhạy cảm ({0}) sau khi che: bỏ báo cáo")]
    Sensitive(&'static str),
    #[error("báo cáo vẫn quá lớn ({0} byte) sau khi cắt log")]
    TooLarge(usize),
}

/// Mã báo cáo ngẫu nhiên `R-XXXX-XXXX` (40 bit, bảng Crockford base32): người dùng đọc nó cho bộ phận hỗ trợ.
pub fn new_id() -> String {
    let mut bytes = [0u8; 5];
    getrandom::fill(&mut bytes).expect("hệ điều hành có nguồn ngẫu nhiên");
    id_from_bytes(bytes)
}

fn id_from_bytes(bytes: [u8; 5]) -> String {
    let bits = bytes.iter().fold(0u64, |acc, b| (acc << 8) | u64::from(*b));
    let symbol = |i: u32| ID_ALPHABET[((bits >> (35 - 5 * i)) & 31) as usize] as char;
    let first: String = (0..4).map(symbol).collect();
    let second: String = (4..8).map(symbol).collect();
    format!("R-{first}-{second}")
}

/// Dấu vân tay của lỗi: 16 hex đầu của SHA-256 trên `loại|mã|vị trí` (không gồm phiên bản app, để một lỗi qua nhiều bản vẫn
/// là một nhóm). Báo cáo gửi tay không có dấu vân tay.
pub fn fingerprint(kind: Kind, code: Option<&str>, location: &str) -> String {
    if kind == Kind::Manual {
        return ZERO_FINGERPRINT.to_string();
    }
    let input = format!("{}|{}|{}", kind.as_str(), code.unwrap_or(""), location);
    Sha256::digest(input.as_bytes())
        .iter()
        .take(8)
        .map(|b| format!("{b:02x}"))
        .collect()
}

/// Vị trí panic để nhóm lỗi: bỏ phần đường dẫn của máy build, giữ từ thư mục `src-tauri` hay `crates` trở đi (không thì hai
/// thành phần cuối), dùng `/`; kèm số dòng.
pub fn location_key(file: &str, line: u32) -> String {
    let parts: Vec<&str> = file.split(['/', '\\']).filter(|p| !p.is_empty()).collect();
    let start = parts
        .iter()
        .rposition(|p| *p == "src-tauri" || *p == "crates")
        .unwrap_or_else(|| parts.len().saturating_sub(2));
    format!("{}:{line}", parts[start..].join("/"))
}

/// Chuỗi thông tin máy hợp lệ với server: bỏ ký tự điều khiển, cắt còn `max` ký tự; rỗng thì `None`.
pub fn clean_meta(value: &str, max: usize) -> Option<String> {
    let cleaned: String = value.chars().filter(|c| !c.is_control()).take(max).collect();
    let cleaned = cleaned.trim().to_string();
    (!cleaned.is_empty()).then_some(cleaned)
}

fn truncate_chars(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// Các dòng log đã chọn và che, chưa cắt theo byte.
struct Scrubbed {
    app: Vec<String>,
    asr: Vec<String>,
    llama: Vec<String>,
}

fn select_and_scrub(logs: &RawLogs, params: &Params) -> Scrubbed {
    let each = |lines: Vec<String>| -> Vec<String> { lines.iter().map(|l| scrub::scrub(l, params)).collect() };
    Scrubbed {
        app: each(app_lines(&logs.app)),
        asr: each(sidecar_lines(&logs.asr)),
        llama: each(sidecar_lines(&logs.llama)),
    }
}

fn assemble(id: &str, event: &Event, facts: &Facts, message: &str, logs: [&str; 3]) -> String {
    let value: Value = json!({
        "v": 1,
        "id": id,
        "kind": event.kind.as_str(),
        "code": event.code,
        "fingerprint": fingerprint(event.kind, event.code.as_deref(), &event.location),
        "at": event.at,
        "message": message,
        "build": facts.build,
        "app": { "version": facts.app_version },
        "os": { "name": facts.os_name, "version": facts.os_version, "arch": facts.arch },
        "hw": { "chip": facts.chip, "ram_mb": facts.ram_mb, "gpu_backend": facts.gpu_backend },
        "model_pack": facts.model_pack,
        "plan": facts.plan,
        "ui_lang": facts.ui_lang,
        "device_id_hash": facts.device_id_hash,
        "logs": { "app": logs[0], "asr": logs[1], "llama": logs[2] },
    });
    value.to_string()
}

/// Dựng báo cáo `id` cho `event`. Che dữ liệu bằng `params`; còn mẫu nhạy cảm ở bất kỳ chuỗi tự do nào (câu lỗi, log, thông tin
/// máy) thì trả `BuildError::Sensitive` và không có báo cáo nào (fail closed). Quá 64 KB thì cắt dần phần cũ nhất của mỗi log.
pub fn build(event: &Event, facts: &Facts, raw: &RawLogs, params: &Params, id: String) -> Result<Report, BuildError> {
    let message = truncate_chars(&scrub::scrub(&event.message, params), MAX_MESSAGE_CHARS);
    let scrubbed = select_and_scrub(raw, params);

    let free_strings = [
        Some(message.as_str()),
        facts.chip.as_deref(),
        facts.model_pack.as_deref(),
        Some(facts.os_version.as_str()),
        Some(facts.app_version.as_str()),
    ];
    let log_lines = scrubbed
        .app
        .iter()
        .chain(&scrubbed.asr)
        .chain(&scrubbed.llama)
        .map(String::as_str);
    for text in free_strings.into_iter().flatten().chain(log_lines) {
        if let Some(rule) = scrub::find_sensitive(text) {
            return Err(BuildError::Sensitive(rule.as_str()));
        }
    }

    let mut caps = [APP_LOG_MAX_BYTES, ASR_LOG_MAX_BYTES, LLAMA_LOG_MAX_BYTES];
    let mut size = 0;
    for _ in 0..8 {
        let logs = [
            fit_tail(&scrubbed.app, caps[0]),
            fit_tail(&scrubbed.asr, caps[1]),
            fit_tail(&scrubbed.llama, caps[2]),
        ];
        let json = assemble(&id, event, facts, &message, [&logs[0], &logs[1], &logs[2]]);
        if json.len() <= MAX_REPORT_BYTES {
            let fingerprint = fingerprint(event.kind, event.code.as_deref(), &event.location);
            return Ok(Report {
                id,
                kind: event.kind,
                fingerprint,
                json,
            });
        }
        size = json.len();
        caps = caps.map(|c| c * 3 / 4);
    }
    Err(BuildError::TooLarge(size))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts() -> Facts {
        Facts {
            app_version: "0.1.10".into(),
            build: "release",
            os_name: "macos".into(),
            os_version: "15.6.1".into(),
            arch: "aarch64".into(),
            chip: Some("Apple M4 Pro".into()),
            ram_mb: Some(24_576),
            gpu_backend: Some("metal".into()),
            model_pack: Some("standard".into()),
            plan: Some("monthly".into()),
            ui_lang: "vi".into(),
            device_id_hash: "a".repeat(64),
        }
    }

    fn event() -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some("sidecarFailed".into()),
            location: String::new(),
            message: "tiến trình phụ không khởi động được".into(),
            at: 1_790_812_740,
        }
    }

    fn params() -> Params {
        Params {
            home: "/Users/alice".into(),
            user: "alice".into(),
            host: "alice-mbp".into(),
        }
    }

    fn parsed(report: &Report) -> Value {
        serde_json::from_str(&report.json).unwrap()
    }

    #[test]
    fn ids_have_the_shape_the_server_wants() {
        let valid = regex::Regex::new(r"^R-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$").unwrap();
        for _ in 0..200 {
            let id = new_id();
            assert!(valid.is_match(&id), "{id}");
        }
        assert_eq!(id_from_bytes([0, 0, 0, 0, 0]), "R-0000-0000");
        assert_eq!(id_from_bytes([0xFF; 5]), "R-ZZZZ-ZZZZ");
        assert_ne!(new_id(), new_id());
    }

    #[test]
    fn fingerprints_group_the_same_error_and_split_different_ones() {
        let a = fingerprint(Kind::SessionError, Some("sidecarFailed"), "");
        assert_eq!(a.len(), 16);
        assert!(a.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_eq!(a, fingerprint(Kind::SessionError, Some("sidecarFailed"), ""));
        assert_ne!(a, fingerprint(Kind::SessionError, Some("modelBroken"), ""));
        assert_ne!(a, fingerprint(Kind::SidecarDied, Some("sidecarFailed"), ""));
        assert_ne!(
            fingerprint(Kind::Crash, Some("panic"), "src-tauri/src/a.rs:1"),
            fingerprint(Kind::Crash, Some("panic"), "src-tauri/src/a.rs:2")
        );
        assert_eq!(fingerprint(Kind::Manual, None, "x"), ZERO_FINGERPRINT);
        assert_ne!(
            fingerprint(Kind::Crash, Some("unclean_exit"), "unclean"),
            ZERO_FINGERPRINT
        );
    }

    #[test]
    fn panic_locations_drop_the_build_machines_path() {
        assert_eq!(
            location_key("/Users/runner/work/ai-translator/src-tauri/src/session.rs", 12),
            "src-tauri/src/session.rs:12"
        );
        assert_eq!(
            location_key(r"C:\a\ai-translator\crates\pipeline\src\engine.rs", 7),
            "crates/pipeline/src/engine.rs:7"
        );
        assert_eq!(
            location_key("/rustc/abc/library/core/src/option.rs", 3),
            "src/option.rs:3"
        );
        assert_eq!(location_key("main.rs", 1), "main.rs:1");
    }

    #[test]
    fn meta_strings_lose_control_characters_and_are_capped() {
        assert_eq!(clean_meta("Apple M4\n Pro\t", 128).as_deref(), Some("Apple M4 Pro"));
        assert_eq!(clean_meta("abcdef", 3).as_deref(), Some("abc"));
        assert_eq!(clean_meta("\n\t ", 10), None);
    }

    #[test]
    fn a_built_report_has_exactly_the_contract_shape() {
        let logs = RawLogs {
            app: "[2026-10-17][05:07:12][INFO][x] a\n".into(),
            asr: "ggml: error: boom\n".into(),
            llama: "0.00.1.2 W load: w\n".into(),
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert_eq!(report.id, "R-7F3K-92QD");
        assert_eq!(
            report.fingerprint,
            fingerprint(Kind::SessionError, Some("sidecarFailed"), "")
        );
        let v = parsed(&report);
        let mut keys: Vec<&str> = v.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(
            keys,
            [
                "app",
                "at",
                "build",
                "code",
                "device_id_hash",
                "fingerprint",
                "hw",
                "id",
                "kind",
                "logs",
                "message",
                "model_pack",
                "os",
                "plan",
                "ui_lang",
                "v"
            ]
        );
        assert_eq!(v["v"], 1);
        assert_eq!(v["kind"], "session_error");
        assert_eq!(v["code"], "sidecarFailed");
        assert_eq!(v["app"], json!({ "version": "0.1.10" }));
        assert_eq!(
            v["os"],
            json!({ "name": "macos", "version": "15.6.1", "arch": "aarch64" })
        );
        assert_eq!(
            v["hw"],
            json!({ "chip": "Apple M4 Pro", "ram_mb": 24576, "gpu_backend": "metal" })
        );
        assert_eq!(v["logs"]["asr"], "ggml: error: boom\n");
        assert_eq!(v["at"], 1_790_812_740_i64);
    }

    #[test]
    fn a_manual_report_has_no_code_and_the_zero_fingerprint() {
        let manual = Event {
            kind: Kind::Manual,
            code: None,
            location: String::new(),
            message: String::new(),
            at: 1,
        };
        let report = build(&manual, &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        let v = parsed(&report);
        assert_eq!(v["code"], Value::Null);
        assert_eq!(v["fingerprint"], ZERO_FINGERPRINT);
        assert_eq!(v["kind"], "manual");
    }

    #[test]
    fn personal_data_is_scrubbed_from_the_message_and_every_log() {
        let logs = RawLogs {
            app: "mở /Users/alice/Library/Application Support/x.db cho alice\n".into(),
            asr: "model '/Users/alice/models/w.bin' máy alice-mbp\n".into(),
            llama: "liên hệ an@example.com key 7Q2K-9XMB-R3TV-HW4Y-5ZJ6-8NPA-CDEF\n".into(),
        };
        let mut e = event();
        e.message = "không mở được /Users/alice/x".into();
        let report = build(&e, &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        let v = parsed(&report);
        assert_eq!(v["message"], "không mở được ~/x");
        assert_eq!(v["logs"]["app"], "mở ~/Library/Application Support/x.db cho <user>\n");
        assert_eq!(v["logs"]["asr"], "model '~/models/w.bin' máy <host>\n");
        assert_eq!(v["logs"]["llama"], "liên hệ <email> key <key>\n");
        assert!(!report.json.contains("alice"));
    }

    #[test]
    fn leftover_sensitive_data_cancels_the_whole_report() {
        // Thư mục home của NGƯỜI KHÁC: `scrub` chỉ che home của máy này, nên mẫu này còn lại và bị phát hiện.
        let logs = RawLogs {
            app: "đọc /Users/bob/Library/x\n".into(),
            ..RawLogs::default()
        };
        assert_eq!(
            build(&event(), &facts(), &logs, &params(), "R-0000-0001".into()),
            Err(BuildError::Sensitive("home_path"))
        );
        // Cả thông tin máy cũng bị kiểm.
        let mut f = facts();
        f.chip = Some("a@b.co".into());
        assert_eq!(
            build(&event(), &f, &RawLogs::default(), &params(), "R-0000-0001".into()),
            Err(BuildError::Sensitive("email"))
        );
    }

    #[test]
    fn the_message_is_capped_at_500_chars() {
        let mut e = event();
        e.message = "ế".repeat(900);
        let report = build(&e, &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        assert_eq!(
            parsed(&report)["message"].as_str().unwrap().chars().count(),
            MAX_MESSAGE_CHARS
        );
    }

    #[test]
    fn full_logs_still_fit_in_64_kb_and_keep_the_newest_lines() {
        let big = |tag: &str| {
            (0..3_000)
                .map(|i| format!("{tag} dòng số {i} có chữ có dấu ế ế ế\n"))
                .collect::<String>()
        };
        let logs = RawLogs {
            app: big("app"),
            asr: big("asr"),
            llama: big("llama"),
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert!(report.json.len() <= MAX_REPORT_BYTES, "{}", report.json.len());
        let v = parsed(&report);
        assert!(v["logs"]["app"].as_str().unwrap().len() <= APP_LOG_MAX_BYTES);
        assert!(
            v["logs"]["app"]
                .as_str()
                .unwrap()
                .ends_with("app dòng số 2999 có chữ có dấu ế ế ế\n")
        );
        assert!(v["logs"]["asr"].as_str().unwrap().len() <= ASR_LOG_MAX_BYTES);
    }

    #[test]
    fn json_escaping_is_accounted_for_when_the_logs_are_full_of_quotes() {
        // Mỗi `"` thành `\"` trong JSON: 16 KiB log đầy dấu nháy gần gấp đôi khi escape.
        let quoted = "\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\"\n".repeat(900);
        let logs = RawLogs {
            app: quoted.clone(),
            asr: quoted.clone(),
            llama: quoted,
        };
        let report = build(&event(), &facts(), &logs, &params(), "R-7F3K-92QD".into()).unwrap();
        assert!(report.json.len() <= MAX_REPORT_BYTES, "{}", report.json.len());
    }

    #[test]
    fn a_distinctive_transcript_in_the_inputs_is_not_invented_by_the_builder() {
        // Người gọi không bao giờ đưa chữ chép lời vào: builder chỉ chép những gì nó được đưa, nên kiểm ở bước tích hợp
        // (test_app) rằng log của một phiên thật không có chữ đó. Ở đây chỉ khẳng định builder không thêm gì ngoài đầu vào.
        let report = build(&event(), &facts(), &RawLogs::default(), &params(), "R-0000-0001".into()).unwrap();
        assert!(!report.json.contains("Hello everyone"));
    }
}
