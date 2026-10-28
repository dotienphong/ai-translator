//! Báo cáo tình trạng bộ đọc tên người nói (spec 2026-10-26-phan-biet-nguoi-noi §7.2; kế hoạch 06): nối `speaker_ops::health` với app.
//!
//! - Mỗi `ReaderState` của worker (qua `TauriSink::reader`) vào [`Health::observe`]; hết phiên thì [`Health::close`]. Sổ (số phút theo ngày,
//!   app họp, phiên bản app họp, tình trạng) lưu trên máy ([`LEDGER_FILE`], JSON) để báo cáo của một ngày gửi được sau khi ngày đó qua.
//! - Gửi qua `POST /v1/diagnostics` (`kind = "speaker_health"`) bằng đúng `HttpReportApi` của báo cáo lỗi, **chỉ khi** công tắc "Gửi báo
//!   cáo lỗi" đang bật (`Host::auto_enabled`, cùng điều kiện với báo cáo lỗi: Cài đặt › Quyền riêng tư) và app đang rảnh (không dịch).
//!   Mỗi ngày tối đa một báo cáo cho mỗi cặp (app họp, phiên bản app họp); tắt công tắc thì sổ bị xóa ([`purge`]).
//! - Không có tên người, không có chữ: `speaker_ops::health::report_json` chỉ nhận chuỗi trong danh sách cho phép, rồi cả chuỗi JSON còn
//!   qua bộ kiểm cuối của báo cáo lỗi (`scrub::find_sensitive`); nghi ngờ thì bỏ báo cáo đó. Log chỉ có số đếm và tên quy tắc.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use pipeline::speaker::ReaderInfo;
use speaker_ops::health::{self as ops, Facts, Ledger, Reading, Tracker};
use tauri::{AppHandle, Manager, Runtime};

use crate::diagnostics::report::Facts as ReportFacts;
use crate::diagnostics::reporter::Host;
use crate::diagnostics::scrub;
use crate::diagnostics::send::{HttpReportApi, ReportApi, SendError};

/// File sổ trong thư mục dữ liệu của app, tách theo loại build (bản dev và bản cài cùng thư mục dữ liệu, như `EUI_MARKER_FILE`).
pub const LEDGER_FILE: &str = ledger_file(cfg!(debug_assertions));

pub const fn ledger_file(debug: bool) -> &'static str {
    if debug {
        "speaker-health-dev.json"
    } else {
        "speaker-health.json"
    }
}

/// Chờ chừng này sau khi mở app rồi mới thử gửi lần đầu; sau đó thử mỗi [`FLUSH_EVERY`].
pub const FIRST_FLUSH_DELAY: Duration = Duration::from_secs(60);
pub const FLUSH_EVERY: Duration = Duration::from_secs(1800);
/// Luồng nền ghi sổ xuống đĩa chừng này một lần nếu có đổi (thoát đột ngột mất tối đa chừng này số liệu).
pub const SAVE_EVERY: Duration = Duration::from_secs(15);

fn unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX))
}

/// Phần của thông tin máy mà báo cáo tình trạng dùng (không có gói, ngôn ngữ, phần cứng).
fn ops_facts(f: &ReportFacts) -> Facts {
    Facts {
        app_version: f.app_version.clone(),
        build: f.build,
        os_name: f.os_name.clone(),
        os_version: f.os_version.clone(),
        arch: f.arch.clone(),
        device_id_hash: f.device_id_hash.clone(),
    }
}

/// Sổ tình trạng của app: bộ gom (`Tracker`) cộng đường dẫn file.
pub struct Health {
    path: PathBuf,
    tracker: Mutex<Tracker>,
    /// Chỉ một luồng ghi file một lúc, và bản ghi sau không bị bản cũ đè ([`Health::save`] lấy khóa này trước khóa `tracker`).
    io: Mutex<()>,
}

impl Health {
    /// Nạp sổ đã lưu; file hỏng hay không có thì sổ rỗng.
    pub fn load(path: PathBuf) -> Self {
        let ledger = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Ledger>(&b).ok())
            .unwrap_or_default();
        Self {
            path,
            tracker: Mutex::new(Tracker::new(ledger)),
            io: Mutex::new(()),
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Tracker> {
        self.tracker.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Ghi sổ xuống đĩa nếu có đổi (ghi nguyên tử). Lỗi ghi chỉ ghi log: mất sổ chỉ là mất số liệu. Khóa `tracker` chỉ giữ lúc dựng
    /// chuỗi JSON, không giữ lúc ghi file: luồng phụ đề (`observe`) không bao giờ chờ đĩa (rà soát đợt A, A3). Gọi từ luồng nền
    /// ([`install`]), lúc hết phiên và sau mỗi lần gửi; không gọi từ luồng phụ đề.
    pub fn save(&self) {
        let _io = self.io.lock().unwrap_or_else(|e| e.into_inner());
        let json = {
            let mut t = self.lock();
            if !t.take_dirty() {
                return;
            }
            serde_json::to_vec(t.ledger())
        };
        let write = || -> std::io::Result<()> {
            if let Some(dir) = self.path.parent() {
                std::fs::create_dir_all(dir)?;
            }
            let tmp = self.path.with_extension("json.tmp");
            std::fs::write(&tmp, json.map_err(std::io::Error::other)?)?;
            std::fs::rename(&tmp, &self.path)
        };
        if let Err(e) = write() {
            log::warn!("không ghi được sổ tình trạng bộ đọc tên: {e}");
        }
    }

    /// Một `ReaderState` của worker lúc `at_ms`.
    pub fn observe(&self, at_ms: u64, info: &ReaderInfo) {
        let mut t = self.lock();
        t.observe(
            at_ms,
            Reading {
                app: info.app,
                app_version: info.app_version.clone(),
                state: info.state,
                recipe_version: info.recipe_version,
                learned: info.learned,
                patterns: info.patterns.clone(),
            },
        );
    }

    /// Phiên dừng hay worker thoát: đóng khoảng đang mở.
    pub fn close(&self, at_ms: u64) {
        self.lock().close(at_ms);
        self.save();
    }

    /// Gửi các báo cáo đến hạn (ngày đã qua, chưa gửi, đủ một phút), nếu công tắc bật và app rảnh. Trả số báo cáo đã gửi được.
    /// Lỗi tạm hay `429` thì dừng cả lượt (lần sau thử lại); bị từ chối hay không dựng được thì bỏ báo cáo đó (không gửi lại).
    pub fn flush(&self, host: &dyn Host, api: &dyn ReportApi, now_secs: i64) -> usize {
        if !host.auto_enabled() {
            return 0;
        }
        let Some(facts) = host.facts() else {
            return 0;
        };
        let facts = ops_facts(&facts);
        let today = ops::day_of_unix_secs(now_secs);
        let due = {
            let mut t = self.lock();
            t.prune(today);
            t.due(today)
        };
        self.save();
        let mut sent = 0;
        for d in due {
            if !host.translation_idle() {
                break;
            }
            let json = match ops::report_json(&facts, d.day, &d.entry, false) {
                Ok(json) => json,
                Err(e) => {
                    log::warn!("bỏ báo cáo tình trạng bộ đọc tên: {e}");
                    self.finish(d.day, &d.key);
                    continue;
                }
            };
            if let Some(rule) = scrub::find_sensitive(&json) {
                log::warn!("bỏ báo cáo tình trạng bộ đọc tên: còn mẫu nhạy cảm ({})", rule.as_str());
                self.finish(d.day, &d.key);
                continue;
            }
            match api.send(&json) {
                Ok(()) => {
                    self.finish(d.day, &d.key);
                    sent += 1;
                }
                Err(e @ (SendError::Transient(_) | SendError::RateLimited(_))) => {
                    log::info!("chưa gửi được báo cáo tình trạng bộ đọc tên: {e}");
                    break;
                }
                Err(e @ SendError::Rejected { .. }) => {
                    log::warn!("server từ chối báo cáo tình trạng bộ đọc tên: {e}");
                    self.finish(d.day, &d.key);
                }
            }
        }
        sent
    }

    fn finish(&self, day: i64, key: &str) {
        self.lock().mark_sent(day, key);
        self.save();
    }

    /// Người dùng tắt "Gửi báo cáo lỗi": bỏ cả sổ (kể cả file).
    pub fn purge(&self) {
        let _io = self.io.lock().unwrap_or_else(|e| e.into_inner());
        let mut t = self.lock();
        t.clear();
        let _ = std::fs::remove_file(&self.path);
        t.take_dirty();
    }
}

/// Cài sổ lúc khởi động (`setup`, sau `diagnostics::install`): nạp sổ, và chạy luồng gửi nền.
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let health = Arc::new(Health::load(app.path().app_local_data_dir()?.join(LEDGER_FILE)));
    app.manage(Arc::clone(&health));
    let saver = Arc::clone(&health);
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(SAVE_EVERY);
            saver.save();
        }
    });
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_FLUSH_DELAY);
        let api = HttpReportApi::for_this_build();
        loop {
            let host = crate::diagnostics::host_of(&app);
            let sent = health.flush(host.as_ref(), &api, i64::try_from(unix_ms() / 1000).unwrap_or(i64::MAX));
            if sent > 0 {
                log::info!("đã gửi {sent} báo cáo tình trạng bộ đọc tên");
            }
            std::thread::sleep(FLUSH_EVERY);
        }
    });
    Ok(())
}

fn health_of<R: Runtime>(app: &AppHandle<R>) -> Option<Arc<Health>> {
    app.try_state::<Arc<Health>>().map(|h| Arc::clone(&h))
}

/// `ReaderState` mới của phiên (`TauriSink::reader`).
pub fn note_reader<R: Runtime>(app: &AppHandle<R>, info: &ReaderInfo) {
    if let Some(health) = health_of(app) {
        health.observe(unix_ms(), info);
    }
}

/// Phiên dừng (`speaker::session_ended`).
pub fn note_session_ended<R: Runtime>(app: &AppHandle<R>) {
    if let Some(health) = health_of(app) {
        health.close(unix_ms());
    }
}

/// Người dùng tắt báo cáo lỗi tự động (`diagnostics::purge_queue`): bỏ sổ tình trạng.
pub fn purge<R: Runtime>(app: &AppHandle<R>) {
    if let Some(health) = health_of(app) {
        health.purge();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use speaker_protocol::{LearnedPattern, MeetingApp, PatternState, ReaderStatus};

    const DAY: i64 = 20_752; // 2026-10-26
    const T0: u64 = DAY as u64 * ops::DAY_MS + 10 * 3_600_000;
    const MIN: u64 = 60_000;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-health-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(LEDGER_FILE)
    }

    fn info(state: ReaderStatus, learned: u32, patterns: Vec<LearnedPattern>) -> ReaderInfo {
        ReaderInfo {
            app: Some(MeetingApp::Teams),
            app_version: Some("26032.1100".into()),
            state,
            recipe_version: 2,
            learned,
            patterns,
        }
    }

    /// `idle`: các câu trả lời lần lượt của `translation_idle` (câu cuối lặp lại mãi).
    struct FakeHost {
        auto: bool,
        idle: Mutex<Vec<bool>>,
    }

    impl Host for FakeHost {
        fn auto_enabled(&self) -> bool {
            self.auto
        }
        fn translation_idle(&self) -> bool {
            let mut idle = self.idle.lock().unwrap();
            if idle.len() > 1 {
                idle.remove(0)
            } else {
                idle.first().copied().unwrap_or(true)
            }
        }
        fn facts(&self) -> Option<ReportFacts> {
            Some(ReportFacts {
                app_version: "0.3.2".into(),
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
            })
        }
        fn now(&self) -> i64 {
            0
        }
    }

    fn host(auto: bool) -> FakeHost {
        FakeHost {
            auto,
            idle: Mutex::new(vec![true]),
        }
    }

    #[derive(Default)]
    struct FakeApi {
        sent: Mutex<Vec<String>>,
        fail: Mutex<Vec<SendError>>,
    }

    impl ReportApi for FakeApi {
        fn send(&self, body: &str) -> Result<(), SendError> {
            if let Some(e) = self.fail.lock().unwrap().pop() {
                return Err(e);
            }
            self.sent.lock().unwrap().push(body.to_string());
            Ok(())
        }
    }

    /// Một phiên Teams 20 phút hôm 26/10: 5 phút không thấy tên, rồi 15 phút đọc được, có một chỉ báo tự học.
    fn session(h: &Health) {
        h.observe(T0, &info(ReaderStatus::NoNames, 0, vec![]));
        h.observe(
            T0 + 5 * MIN,
            &info(
                ReaderStatus::Ok,
                1,
                vec![LearnedPattern {
                    role: "AXGroup".into(),
                    path: vec![2, 0],
                    states: vec![PatternState {
                        subrole: String::new(),
                        classes: vec!["vdi-frame-occlusion".into()],
                    }],
                }],
            ),
        );
        h.close(T0 + 20 * MIN);
    }

    #[test]
    fn a_finished_day_is_sent_once_with_the_agreed_fields_and_no_names() {
        let path = temp("send");
        let h = Health::load(path.clone());
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        assert_eq!(
            h.flush(&host(true), &api, DAY * 86_400 + 40_000),
            0,
            "ngày hôm nay chưa gửi"
        );
        assert_eq!(h.flush(&host(true), &api, next_day), 1);
        assert_eq!(h.flush(&host(true), &api, next_day + 100), 0, "không gửi lại");
        let sent = api.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        let v: Value = serde_json::from_str(&sent[0]).unwrap();
        assert_eq!(v["kind"], "speaker_health");
        assert_eq!(v["day"], "2026-10-26");
        assert_eq!(v["state"], "ok");
        assert_eq!(v["minutes"], serde_json::json!({"ok": 15, "total": 20}));
        assert_eq!(
            v["meeting"],
            serde_json::json!({"app": "teams", "version": "26032.1100"})
        );
        assert_eq!(v["recipe_version"], 2);
        assert_eq!(v["learned"], 1);
        assert_eq!(v["canary"], false);
        assert_eq!(v["device_id_hash"], "a".repeat(64));
        assert!(v.get("plan").is_none() && v.get("ui_lang").is_none() && v.get("hw").is_none());
        assert!(scrub::find_sensitive(&sent[0]).is_none());
    }

    #[test]
    fn nothing_is_sent_when_reports_are_off_or_a_session_is_running_and_the_ledger_is_kept() {
        let h = Health::load(temp("gates"));
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        assert_eq!(h.flush(&host(false), &api, next_day), 0, "công tắc tắt");
        let busy = FakeHost {
            auto: true,
            idle: Mutex::new(vec![false]),
        };
        assert_eq!(h.flush(&busy, &api, next_day), 0, "đang dịch");
        assert!(api.sent.lock().unwrap().is_empty());
        assert_eq!(h.flush(&host(true), &api, next_day), 1, "rảnh và bật thì gửi");
    }

    #[test]
    fn transient_errors_stop_the_round_and_retry_later_rejections_drop_the_report() {
        let h = Health::load(temp("errors"));
        session(&h);
        let api = FakeApi::default();
        let next_day = (DAY + 1) * 86_400;
        api.fail.lock().unwrap().push(SendError::Transient("mạng".into()));
        assert_eq!(h.flush(&host(true), &api, next_day), 0);
        api.fail.lock().unwrap().push(SendError::RateLimited(Some(60)));
        assert_eq!(h.flush(&host(true), &api, next_day), 0);
        api.fail.lock().unwrap().push(SendError::Rejected {
            status: 422,
            code: "rejected_sensitive".into(),
        });
        assert_eq!(h.flush(&host(true), &api, next_day), 0, "bị từ chối: bỏ");
        assert_eq!(h.flush(&host(true), &api, next_day), 0, "và không gửi lại");
        assert!(api.sent.lock().unwrap().is_empty());
    }

    /// App thoát giữa chừng rồi mở lại: sổ đã lưu nên báo cáo của ngày hôm trước vẫn gửi được.
    #[test]
    fn the_ledger_survives_a_restart_and_garbage_files_are_ignored() {
        let path = temp("restart");
        session(&Health::load(path.clone()));
        let api = FakeApi::default();
        assert_eq!(
            Health::load(path.clone()).flush(&host(true), &api, (DAY + 1) * 86_400),
            1
        );
        std::fs::write(&path, b"not json").unwrap();
        assert_eq!(Health::load(path).flush(&host(true), &api, (DAY + 1) * 86_400), 0);
    }

    #[test]
    fn turning_reports_off_forgets_everything_including_the_file() {
        let path = temp("purge");
        let h = Health::load(path.clone());
        session(&h);
        assert!(path.exists());
        h.purge();
        assert!(!path.exists());
        assert_eq!(h.flush(&host(true), &FakeApi::default(), (DAY + 1) * 86_400), 0);
        h.close(T0 + 30 * MIN);
        assert!(!path.exists(), "khoảng đang mở cũng đã bỏ");
    }

    /// Đường nối của app: `ReaderState` và hết phiên đi vào sổ; tắt "Gửi báo cáo lỗi" (`diagnostics::purge_queue`) xóa sổ và file.
    #[test]
    fn the_app_feeds_the_ledger_and_turning_reports_off_purges_it() {
        let app = crate::test_support::mock_app();
        let path = temp("wiring");
        app.manage(Arc::new(Health::load(path.clone())));
        note_reader(app.handle(), &info(ReaderStatus::Ok, 0, vec![]));
        assert!(!path.exists(), "khoảng còn mở: chưa có gì để ghi");
        note_session_ended(app.handle());
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("teams|26032.1100"), "{saved}");
        assert!(!saved.contains("Lan"));
        crate::diagnostics::purge_queue(app.handle());
        assert!(!path.exists());
    }

    /// Rà soát đợt A (A3): `observe` chạy trên luồng phụ đề, không được ghi đĩa ngay; luồng nền (`save`) ghi sau, `close` ghi ngay.
    #[test]
    fn observing_does_not_write_the_ledger_on_the_calling_thread() {
        let path = temp("lazy");
        let h = Health::load(path.clone());
        h.observe(T0, &info(ReaderStatus::NoNames, 0, vec![]));
        h.observe(T0 + 5 * MIN, &info(ReaderStatus::Ok, 0, vec![]));
        assert!(!path.exists(), "đổi trạng thái đóng một khoảng nhưng chưa ghi file");
        h.save();
        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("teams|26032.1100"), "{saved}");
        std::fs::remove_file(&path).unwrap();
        h.save();
        assert!(!path.exists(), "không có gì đổi thì không ghi lại");
    }

    #[test]
    fn debug_and_release_builds_keep_separate_ledgers() {
        assert_ne!(ledger_file(true), ledger_file(false));
        assert_eq!(LEDGER_FILE, ledger_file(cfg!(debug_assertions)));
    }
}
