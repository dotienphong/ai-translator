//! Lõi của báo cáo lỗi (spec 2026-10-17-diagnostics-reports-design.md §1, §5): nhận sự kiện, xếp hàng có giới hạn, gửi nền khi
//! app rảnh, và gửi tay. Không phụ thuộc Tauri: mọi thứ của app đi qua [`Host`], log qua `LogSource`, mạng qua `ReportApi`.
//!
//! - **Tự động** (`record` rồi `flush`): chỉ khi `Host::auto_enabled`. Không bao giờ gửi lúc đang dịch (`Host::translation_idle`).
//! - **Gửi tay** (`send_manual`): ngay lập tức, kể cả khi tắt tự động và khi đang dịch (người dùng vừa bấm); không vào hàng đợi,
//!   không tính vào giới hạn.
//! - Lỗi tạm: mỗi báo cáo chỉ thử một lần mỗi lần chạy app (mạng hỏng thì cả lượt dừng); đủ 3 lần qua các lần mở thì bỏ.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use super::logs::{LogFile, LogSource};
use super::queue::Queue;
use super::report::{self, BuildError, Event, Facts, Kind, RawLogs};
use super::scrub::{self, Params};
use super::send::{ReportApi, SendError};

/// Báo cáo ghi giờ xảy ra không quá cũ so với server (7 ngày): kẹp lại để không bị `400`.
const MAX_AGE_SECONDS: i64 = 6 * 86_400;

/// Những gì lõi cần biết về app, đọc mỗi lần dùng.
pub trait Host: Send + Sync {
    /// Báo cáo tự động bật: cài đặt `sendErrorReports` và (bản debug) công tắc dev.
    fn auto_enabled(&self) -> bool;
    /// Không có phiên dịch nào đang bắt đầu, chạy hay dừng.
    fn translation_idle(&self) -> bool;
    /// Thông tin app và máy; `None` nếu chưa đọc được (ví dụ mã máy).
    fn facts(&self) -> Option<Facts>;
    /// Giờ Unix, giây.
    fn now(&self) -> i64;
    /// Tên người tham dự đang có trong bảng người nói (spec 2026-10-26-phan-biet-nguoi-noi §10): bị che trong câu lỗi và log của mọi báo
    /// cáo lỗi, kể cả khi một dòng log lỡ in tên. Mặc định không có.
    fn known_names(&self) -> Vec<String> {
        Vec::new()
    }
}

/// Lỗi của lần gửi tay (giao diện hiện câu theo loại).
#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum ManualError {
    #[error("không dựng được báo cáo: {0}")]
    Build(#[from] BuildError),
    #[error("chưa đọc được thông tin máy")]
    NoFacts,
    #[error(transparent)]
    Send(#[from] SendError),
}

pub struct Reporter {
    host: Box<dyn Host>,
    logs: Box<dyn LogSource>,
    api: Box<dyn ReportApi>,
    params: Params,
    /// Hàng đợi trên đĩa; khóa giữ quanh mọi thao tác (`Queue` không tự khóa).
    queue: Mutex<Queue>,
    /// Mã các báo cáo đã thử gửi trong lần chạy này.
    tried: Mutex<HashSet<String>>,
    /// Chờ trước khi đọc log của một sự kiện, để dòng log của chính lỗi đó kịp ghi xuống file.
    log_delay: Duration,
}

impl Reporter {
    pub fn new(
        host: Box<dyn Host>,
        logs: Box<dyn LogSource>,
        api: Box<dyn ReportApi>,
        params: Params,
        queue: Queue,
        log_delay: Duration,
    ) -> Self {
        Self {
            host,
            logs,
            api,
            params,
            queue: Mutex::new(queue),
            tried: Mutex::new(HashSet::new()),
            log_delay,
        }
    }

    fn raw_logs(&self) -> RawLogs {
        RawLogs {
            app: self.logs.read(LogFile::App),
            asr: self.logs.read(LogFile::Asr),
            llama: self.logs.read(LogFile::Llama),
        }
    }

    /// Có sự kiện đáng báo. Tắt tự động, quá giới hạn, hay không dựng được (fail closed) thì không làm gì. Trả mã báo cáo đã xếp
    /// hàng. Chặn trong lúc đọc log và che (cỡ chục mili giây, sau `log_delay`): gọi từ luồng nền.
    pub fn record(&self, mut event: Event) -> Option<String> {
        if !self.host.auto_enabled() {
            return None;
        }
        let now = self.host.now();
        event.at = event.at.clamp(now - MAX_AGE_SECONDS, now);
        let names = self.host.known_names();
        event.message = scrub::redact_names(&event.message, &names);
        let fingerprint = report::fingerprint(event.kind, event.code.as_deref(), &event.location);
        // Kiểm giới hạn trước khi tốn công dựng báo cáo.
        if !self.queue.lock().unwrap().admit(&fingerprint, now) {
            log::info!(
                "bỏ báo cáo lỗi vì quá giới hạn gửi của máy này: {}",
                event.kind.as_str()
            );
            return None;
        }
        if !self.log_delay.is_zero() {
            std::thread::sleep(self.log_delay);
        }
        let Some(facts) = self.host.facts() else {
            log::warn!("bỏ báo cáo lỗi: chưa đọc được thông tin máy");
            return None;
        };
        let built = report::build(
            &event,
            &facts,
            &self.raw_logs().redact_names(&names),
            &self.params,
            report::new_id(),
        );
        let report = match built {
            Ok(report) => report,
            Err(e) => {
                // Chỉ ghi lý do (tên quy tắc), không bao giờ ghi nội dung.
                log::warn!("bỏ báo cáo lỗi: {e}");
                return None;
            }
        };
        match self.queue.lock().unwrap().push(&report, now) {
            Ok(()) => {
                log::info!("xếp hàng báo cáo lỗi {} ({})", report.id, event.kind.as_str());
                Some(report.id)
            }
            Err(e) => {
                log::warn!("không ghi được hàng đợi báo cáo lỗi: {e}");
                None
            }
        }
    }

    /// Gửi các báo cáo đang chờ, nếu tự động bật và app rảnh. Mỗi báo cáo thử tối đa một lần mỗi lần chạy: lỗi tạm hay `429` thì
    /// ghi một lần thất bại và dừng cả lượt (mạng hỏng thì thử tiếp chỉ vô ích); bị từ chối (`4xx` khác) thì bỏ báo cáo đó và đi
    /// tiếp. Trả số báo cáo đã gửi được.
    pub fn flush(&self) -> usize {
        if !self.host.auto_enabled() {
            return 0;
        }
        let pending = self.queue.lock().unwrap().pending();
        let mut sent = 0;
        for p in pending {
            // Mỗi lần gửi kiểm lại: phiên có thể vừa bắt đầu.
            if !self.host.translation_idle() {
                break;
            }
            if !self.tried.lock().unwrap().insert(p.id.clone()) {
                continue;
            }
            match self.api.send(&p.report) {
                Ok(()) => {
                    self.queue.lock().unwrap().remove(&p.id);
                    sent += 1;
                }
                Err(e @ (SendError::Transient(_) | SendError::RateLimited(_))) => {
                    log::info!("chưa gửi được báo cáo lỗi {}: {e}", p.id);
                    self.queue.lock().unwrap().record_failure(&p.id);
                    break;
                }
                Err(e @ SendError::Rejected { .. }) => {
                    log::warn!("server từ chối báo cáo lỗi {}: {e}", p.id);
                    self.queue.lock().unwrap().remove(&p.id);
                }
            }
        }
        sent
    }

    /// Người dùng bấm "Gửi log cho hỗ trợ": dựng và gửi ngay, trả mã báo cáo.
    pub fn send_manual(&self) -> Result<String, ManualError> {
        let facts = self.host.facts().ok_or(ManualError::NoFacts)?;
        let event = Event {
            kind: Kind::Manual,
            code: None,
            location: String::new(),
            message: String::new(),
            at: self.host.now(),
        };
        let names = self.host.known_names();
        let report = report::build(
            &event,
            &facts,
            &self.raw_logs().redact_names(&names),
            &self.params,
            report::new_id(),
        )?;
        self.api.send(&report.json)?;
        Ok(report.id)
    }

    /// Người dùng tắt báo cáo lỗi tự động: bỏ mọi báo cáo đang chờ.
    pub fn purge(&self) {
        self.queue.lock().unwrap().clear();
    }

    /// Số báo cáo đang chờ.
    pub fn pending_count(&self) -> usize {
        self.queue.lock().unwrap().pending().len()
    }

    /// Thân các báo cáo đang chờ, cũ nhất trước (cho test).
    pub fn pending_reports(&self) -> Vec<String> {
        self.queue
            .lock()
            .unwrap()
            .pending()
            .into_iter()
            .map(|p| p.report)
            .collect()
    }

    /// Báo cáo tự động đang bật không (cài đặt và bản build). Người gọi kiểm trước khi tốn công tạo luồng.
    pub fn auto_enabled(&self) -> bool {
        self.host.auto_enabled()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};

    use super::*;

    const T0: i64 = 1_790_812_800;

    #[derive(Clone)]
    struct FakeHost {
        enabled: Arc<AtomicBool>,
        idle: Arc<AtomicBool>,
        now: Arc<AtomicI64>,
        facts: Arc<Mutex<Option<Facts>>>,
        names: Arc<Mutex<Vec<String>>>,
    }

    impl FakeHost {
        fn new() -> Self {
            Self {
                enabled: Arc::new(AtomicBool::new(true)),
                idle: Arc::new(AtomicBool::new(true)),
                now: Arc::new(AtomicI64::new(T0)),
                facts: Arc::new(Mutex::new(Some(facts()))),
                names: Arc::default(),
            }
        }
    }

    impl Host for FakeHost {
        fn auto_enabled(&self) -> bool {
            self.enabled.load(Ordering::SeqCst)
        }
        fn translation_idle(&self) -> bool {
            self.idle.load(Ordering::SeqCst)
        }
        fn facts(&self) -> Option<Facts> {
            self.facts.lock().unwrap().clone()
        }
        fn now(&self) -> i64 {
            self.now.load(Ordering::SeqCst)
        }
        fn known_names(&self) -> Vec<String> {
            self.names.lock().unwrap().clone()
        }
    }

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

    #[derive(Clone, Default)]
    struct MemLogs(Arc<Mutex<[String; 3]>>);

    impl LogSource for MemLogs {
        fn read(&self, file: LogFile) -> String {
            let logs = self.0.lock().unwrap();
            match file {
                LogFile::App => logs[0].clone(),
                LogFile::Asr => logs[1].clone(),
                LogFile::Llama => logs[2].clone(),
            }
        }
    }

    /// Server giả: trả lần lượt các kết quả đã đặt (hết thì `Ok`), ghi lại thân đã nhận.
    #[derive(Clone, Default)]
    struct FakeApi {
        script: Arc<Mutex<Vec<Result<(), SendError>>>>,
        bodies: Arc<Mutex<Vec<String>>>,
    }

    impl ReportApi for FakeApi {
        fn send(&self, body: &str) -> Result<(), SendError> {
            self.bodies.lock().unwrap().push(body.to_string());
            let mut script = self.script.lock().unwrap();
            if script.is_empty() { Ok(()) } else { script.remove(0) }
        }
    }

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-reporter-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    struct Rig {
        host: FakeHost,
        logs: MemLogs,
        api: FakeApi,
        reporter: Reporter,
        dir: std::path::PathBuf,
    }

    fn rig(name: &str) -> Rig {
        let dir = temp(name);
        rig_in(dir, FakeHost::new(), FakeApi::default())
    }

    /// Một lần chạy app mới trên cùng thư mục (hàng đợi và bộ đếm còn trên đĩa).
    fn rig_in(dir: std::path::PathBuf, host: FakeHost, api: FakeApi) -> Rig {
        let logs = MemLogs::default();
        let params = Params {
            home: "/Users/alice".into(),
            user: "alice".into(),
            host: "alice-mbp".into(),
        };
        let reporter = Reporter::new(
            Box::new(host.clone()),
            Box::new(logs.clone()),
            Box::new(api.clone()),
            params,
            Queue::new(dir.clone()),
            Duration::ZERO,
        );
        Rig {
            host,
            logs,
            api,
            reporter,
            dir,
        }
    }

    /// Spec 2026-10-26-phan-biet-nguoi-noi §10: tên người tham dự đang có bị che khỏi câu lỗi và log của cả báo cáo tự động lẫn báo cáo
    /// gửi tay, kể cả khi một dòng log lỡ in tên.
    #[test]
    fn participant_names_never_reach_a_report() {
        let r = rig("names");
        *r.host.names.lock().unwrap() = vec!["Lan Nguyễn".into(), "Minh Trần".into()];
        r.logs.0.lock().unwrap()[0] = "[2026-10-27][10:00:00][WARN][x] gán tên Lan Nguyễn cho giọng 2\n".into();
        r.logs.0.lock().unwrap()[2] = "Minh Trần đang nói\n".into();
        let mut event = session_error("sidecarFailed");
        event.message = "worker chết khi đọc ô của lan nguyễn".into();
        assert!(r.reporter.record(event).is_some());
        let queued = r.reporter.pending_reports().remove(0);
        let lower = queued.to_lowercase();
        assert!(!lower.contains("nguyễn") && !lower.contains("minh trần"), "{queued}");
        assert!(queued.contains("<tên>"), "{queued}");
        r.reporter.send_manual().unwrap();
        let sent = r.api.bodies.lock().unwrap().last().unwrap().clone();
        let lower = sent.to_lowercase();
        assert!(!lower.contains("nguyễn") && !lower.contains("minh trần"), "{sent}");
    }

    fn session_error(code: &str) -> Event {
        Event {
            kind: Kind::SessionError,
            code: Some(code.into()),
            location: String::new(),
            message: format!("lỗi {code}"),
            at: T0 - 5,
        }
    }

    #[test]
    fn nothing_is_recorded_while_automatic_reports_are_off() {
        let r = rig("off");
        r.host.enabled.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        assert_eq!(r.reporter.pending_count(), 0);
        // Tắt không tiêu bộ đếm: bật lại thì báo cáo đầu tiên vẫn được nhận.
        r.host.enabled.store(true, Ordering::SeqCst);
        assert!(r.reporter.record(session_error("sidecarFailed")).is_some());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_recorded_event_becomes_a_queued_report_with_the_clamped_time() {
        let r = rig("record");
        *r.logs.0.lock().unwrap() = ["dòng app\n".into(), "asr error: x\n".into(), String::new()];
        let mut event = session_error("modelBroken");
        event.at = T0 - 30 * 86_400; // quá cũ so với server: kẹp lại
        let id = r.reporter.record(event).expect("xếp hàng");
        let pending = r.reporter.pending_reports();
        assert_eq!(pending.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&pending[0]).unwrap();
        assert_eq!(v["id"], id.as_str());
        assert_eq!(
            (v["kind"].as_str(), v["code"].as_str()),
            (Some("session_error"), Some("modelBroken"))
        );
        assert_eq!(v["at"], T0 - 6 * 86_400);
        assert_eq!(v["logs"]["app"], "dòng app\n");
        assert_eq!(v["logs"]["asr"], "asr error: x\n");
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn the_same_error_is_recorded_once_a_day_and_at_most_five_a_day() {
        let r = rig("limits");
        assert!(r.reporter.record(session_error("sidecarFailed")).is_some());
        assert!(
            r.reporter.record(session_error("sidecarFailed")).is_none(),
            "cùng dấu vân tay trong 24 giờ"
        );
        for code in ["a", "b", "c", "d"] {
            assert!(r.reporter.record(session_error(code)).is_some(), "{code}");
        }
        assert!(
            r.reporter.record(session_error("e")).is_none(),
            "báo cáo thứ 6 trong ngày"
        );
        assert_eq!(r.reporter.pending_count(), 5);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn an_event_whose_report_would_leak_something_is_dropped() {
        let r = rig("leak");
        *r.logs.0.lock().unwrap() = ["đọc /Users/bob/Library/x\n".into(), String::new(), String::new()];
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn an_event_without_machine_facts_is_dropped() {
        let r = rig("nofacts");
        *r.host.facts.lock().unwrap() = None;
        assert_eq!(r.reporter.record(session_error("sidecarFailed")), None);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn flush_sends_queued_reports_only_when_idle() {
        let r = rig("idle");
        r.reporter.record(session_error("a")).unwrap();
        r.host.idle.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 0);
        assert!(r.api.bodies.lock().unwrap().is_empty(), "không gửi gì lúc đang dịch");
        r.host.idle.store(true, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 1);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 1);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_session_starting_mid_flush_stops_the_rest() {
        struct StartsAfterFirst {
            inner: FakeHost,
            sent: Arc<std::sync::atomic::AtomicUsize>,
        }
        impl ReportApi for StartsAfterFirst {
            fn send(&self, _: &str) -> Result<(), SendError> {
                if self.sent.fetch_add(1, Ordering::SeqCst) == 0 {
                    self.inner.idle.store(false, Ordering::SeqCst);
                }
                Ok(())
            }
        }
        let dir = temp("mid");
        let host = FakeHost::new();
        let sent = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let reporter = Reporter::new(
            Box::new(host.clone()),
            Box::new(MemLogs::default()),
            Box::new(StartsAfterFirst {
                inner: host.clone(),
                sent: sent.clone(),
            }),
            Params::default(),
            Queue::new(dir.clone()),
            Duration::ZERO,
        );
        reporter.record(session_error("a")).unwrap();
        reporter.record(session_error("b")).unwrap();
        assert_eq!(reporter.flush(), 1);
        assert_eq!(
            sent.load(Ordering::SeqCst),
            1,
            "phiên vừa bắt đầu thì không gửi cái thứ hai"
        );
        assert_eq!(reporter.pending_count(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn flush_does_nothing_when_automatic_reports_are_off() {
        let r = rig("flush-off");
        r.reporter.record(session_error("a")).unwrap();
        r.host.enabled.store(false, Ordering::SeqCst);
        assert_eq!(r.reporter.flush(), 0);
        assert!(r.api.bodies.lock().unwrap().is_empty());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_transient_failure_stops_the_pass_and_is_retried_only_on_the_next_run_three_times_at_most() {
        let dir = temp("retry");
        let api = FakeApi::default();
        let first = rig_in(dir.clone(), FakeHost::new(), api.clone());
        first.reporter.record(session_error("a")).unwrap();
        first.reporter.record(session_error("b")).unwrap();
        let failing = || {
            *api.script.lock().unwrap() = vec![Err(SendError::Transient("mạng rớt".into()))];
        };
        failing();
        assert_eq!(first.reporter.flush(), 0);
        assert_eq!(
            api.bodies.lock().unwrap().len(),
            1,
            "mạng hỏng thì dừng cả lượt, không thử cái thứ hai"
        );
        assert_eq!(
            first.reporter.flush(),
            1,
            "lần flush kế trong cùng lần chạy: báo cáo đã thử bị bỏ qua, cái còn lại được gửi"
        );
        assert_eq!(first.reporter.pending_count(), 1);

        // Lần mở thứ hai và thứ ba: báo cáo còn lại lỗi tạm tiếp.
        for run in 2..=3 {
            let next = rig_in(dir.clone(), FakeHost::new(), api.clone());
            failing();
            assert_eq!(next.reporter.flush(), 0, "lần chạy {run}");
        }
        let fourth = rig_in(dir.clone(), FakeHost::new(), api.clone());
        assert_eq!(fourth.reporter.pending_count(), 0, "đủ 3 lần lỗi thì đã bỏ");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_rate_limited_answer_counts_as_a_failed_attempt_and_stops_the_pass() {
        let r = rig("429");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.record(session_error("b")).unwrap();
        *r.api.script.lock().unwrap() = vec![Err(SendError::RateLimited(Some(3600)))];
        assert_eq!(r.reporter.flush(), 0);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 1);
        assert_eq!(r.reporter.pending_count(), 2);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_rejected_report_is_dropped_and_the_next_one_is_still_sent() {
        let r = rig("rejected");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.record(session_error("b")).unwrap();
        *r.api.script.lock().unwrap() = vec![Err(SendError::Rejected {
            status: 422,
            code: "rejected_sensitive".into(),
        })];
        assert_eq!(r.reporter.flush(), 1);
        assert_eq!(r.api.bodies.lock().unwrap().len(), 2);
        assert_eq!(r.reporter.pending_count(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn purge_removes_everything_waiting() {
        let r = rig("purge");
        r.reporter.record(session_error("a")).unwrap();
        r.reporter.purge();
        assert_eq!(r.reporter.pending_count(), 0);
        assert_eq!(r.reporter.flush(), 0);
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn a_manual_report_is_sent_at_once_even_with_automatic_reports_off_and_a_session_running() {
        let r = rig("manual");
        r.host.enabled.store(false, Ordering::SeqCst);
        r.host.idle.store(false, Ordering::SeqCst);
        let id = r.reporter.send_manual().unwrap();
        let bodies = r.api.bodies.lock().unwrap();
        assert_eq!(bodies.len(), 1);
        let v: serde_json::Value = serde_json::from_str(&bodies[0]).unwrap();
        assert_eq!(v["id"], id.as_str());
        assert_eq!(
            (v["kind"].as_str(), v["code"].is_null(), v["fingerprint"].as_str()),
            (Some("manual"), true, Some("0000000000000000"))
        );
        drop(bodies);
        assert_eq!(r.reporter.pending_count(), 0, "không vào hàng đợi");
        // Không tính vào giới hạn: bấm hai lần đều gửi.
        assert!(r.reporter.send_manual().is_ok());
        let _ = std::fs::remove_dir_all(r.dir);
    }

    #[test]
    fn manual_errors_say_what_went_wrong() {
        let r = rig("manual-errors");
        *r.api.script.lock().unwrap() = vec![Err(SendError::RateLimited(None)), Err(SendError::Transient("x".into()))];
        assert_eq!(
            r.reporter.send_manual(),
            Err(ManualError::Send(SendError::RateLimited(None)))
        );
        assert!(matches!(
            r.reporter.send_manual(),
            Err(ManualError::Send(SendError::Transient(_)))
        ));
        *r.logs.0.lock().unwrap() = ["đọc /Users/bob/x\n".into(), String::new(), String::new()];
        assert_eq!(
            r.reporter.send_manual(),
            Err(ManualError::Build(BuildError::Sensitive("home_path")))
        );
        *r.host.facts.lock().unwrap() = None;
        assert_eq!(r.reporter.send_manual(), Err(ManualError::NoFacts));
        let _ = std::fs::remove_dir_all(r.dir);
    }
}
