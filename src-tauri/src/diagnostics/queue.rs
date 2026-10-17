//! Hàng đợi báo cáo lỗi trên đĩa và giới hạn gửi của app (spec 2026-10-17-diagnostics-reports-design.md §1).
//!
//! - Mỗi máy: tối đa 1 báo cáo cho mỗi dấu vân tay trong 24 giờ, tối đa 5 báo cáo mỗi ngày (ngày UTC). Tính lúc xếp hàng.
//! - Hàng đợi tối đa 5 báo cáo, đầy thì bỏ cái cũ nhất.
//! - Báo cáo gửi lỗi tạm (mạng, 5xx) được thử lại ở lần mở sau, tối đa 3 lần rồi bỏ.
//! - File là JSON trong thư mục báo cáo của app: `pending/<số thứ tự>-<mã>.json` và `state.json` (bộ đếm). Người gọi giữ
//!   khóa của `Reporter` quanh mọi lời gọi, nên ở đây không khóa riêng.

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::report::Report;

/// Số báo cáo tối đa trong hàng đợi.
pub const QUEUE_CAP: usize = 5;
/// Một dấu vân tay chỉ được xếp hàng một lần trong chừng này giây.
pub const PER_FINGERPRINT_SECONDS: i64 = 24 * 3600;
/// Số báo cáo tối đa xếp hàng mỗi ngày UTC.
pub const MAX_PER_DAY: u32 = 5;
/// Số lần gửi lỗi tạm tối đa của một báo cáo.
pub const MAX_ATTEMPTS: u32 = 3;
const DAY_SECONDS: i64 = 86_400;

#[derive(Default, Serialize, Deserialize)]
struct State {
    /// Ngày UTC (số ngày từ 1970-01-01) của bộ đếm `count`.
    day: i64,
    count: u32,
    /// Dấu vân tay → giờ Unix lần xếp hàng gần nhất.
    fingerprints: BTreeMap<String, i64>,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    id: String,
    queued_at: i64,
    attempts: u32,
    /// Thân báo cáo, gửi nguyên văn.
    report: String,
}

/// Một báo cáo đang chờ gửi.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pending {
    pub id: String,
    pub attempts: u32,
    pub report: String,
}

pub struct Queue {
    dir: PathBuf,
}

impl Queue {
    /// `dir`: thư mục báo cáo của app (tạo khi cần).
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn pending_dir(&self) -> PathBuf {
        self.dir.join("pending")
    }

    fn state_path(&self) -> PathBuf {
        self.dir.join("state.json")
    }

    fn load_state(&self) -> State {
        std::fs::read(self.state_path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    /// Có được xếp hàng báo cáo của dấu vân tay này lúc `now` không. Được thì ghi nhận ngay (bộ đếm ngày và lần gần nhất của dấu
    /// vân tay). Không ghi được file thì từ chối: thà bỏ báo cáo còn hơn gửi không giới hạn.
    pub fn admit(&self, fingerprint: &str, now: i64) -> bool {
        let mut state = self.load_state();
        let today = now.div_euclid(DAY_SECONDS);
        if state.day != today {
            state.day = today;
            state.count = 0;
        }
        state.fingerprints.retain(|_, at| now - *at < PER_FINGERPRINT_SECONDS);
        if state.count >= MAX_PER_DAY || state.fingerprints.contains_key(fingerprint) {
            return false;
        }
        state.count += 1;
        state.fingerprints.insert(fingerprint.to_string(), now);
        match serde_json::to_vec(&state) {
            Ok(bytes) => write_atomic(&self.state_path(), &bytes).is_ok(),
            Err(_) => false,
        }
    }

    /// Xếp hàng một báo cáo; vượt `QUEUE_CAP` thì bỏ các báo cáo cũ nhất. Tên file bắt đầu bằng số thứ tự tăng dần (không theo giờ:
    /// hai báo cáo cùng một giây vẫn giữ đúng thứ tự xếp hàng).
    pub fn push(&self, report: &Report, now: i64) -> io::Result<()> {
        let dir = self.pending_dir();
        std::fs::create_dir_all(&dir)?;
        let next = self
            .pending_files()
            .iter()
            .filter_map(|p| sequence_of(p))
            .max()
            .map_or(0, |last| last + 1);
        let stored = Stored {
            id: report.id.clone(),
            queued_at: now,
            attempts: 0,
            report: report.json.clone(),
        };
        let bytes = serde_json::to_vec(&stored).map_err(io::Error::other)?;
        write_atomic(&dir.join(format!("{next:08}-{}.json", report.id)), &bytes)?;
        let mut files = self.pending_files();
        while files.len() > QUEUE_CAP {
            let oldest = files.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
        Ok(())
    }

    /// Tên các file chờ, cũ nhất trước.
    fn pending_files(&self) -> Vec<PathBuf> {
        let Ok(read) = std::fs::read_dir(self.pending_dir()) else {
            return Vec::new();
        };
        let mut files: Vec<PathBuf> = read
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|e| e == "json"))
            .collect();
        files.sort();
        files
    }

    /// Các báo cáo đang chờ, cũ nhất trước. File hỏng bị xóa.
    pub fn pending(&self) -> Vec<Pending> {
        let mut out = Vec::new();
        for path in self.pending_files() {
            match std::fs::read(&path)
                .ok()
                .and_then(|b| serde_json::from_slice::<Stored>(&b).ok())
            {
                Some(s) => out.push(Pending {
                    id: s.id,
                    attempts: s.attempts,
                    report: s.report,
                }),
                None => {
                    let _ = std::fs::remove_file(path);
                }
            }
        }
        out
    }

    fn path_of(&self, id: &str) -> Option<PathBuf> {
        let suffix = format!("-{id}.json");
        self.pending_files()
            .into_iter()
            .find(|p| p.file_name().is_some_and(|n| n.to_string_lossy().ends_with(&suffix)))
    }

    /// Gửi xong (hay bỏ hẳn): xóa khỏi hàng đợi.
    pub fn remove(&self, id: &str) {
        if let Some(path) = self.path_of(id) {
            let _ = std::fs::remove_file(path);
        }
    }

    /// Một lần gửi lỗi tạm: tăng số lần thử. Đủ `MAX_ATTEMPTS` thì bỏ báo cáo và trả `false`; còn thì `true`.
    pub fn record_failure(&self, id: &str) -> bool {
        let Some(path) = self.path_of(id) else {
            return false;
        };
        let Some(mut stored) = std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<Stored>(&b).ok())
        else {
            let _ = std::fs::remove_file(path);
            return false;
        };
        stored.attempts += 1;
        if stored.attempts >= MAX_ATTEMPTS {
            let _ = std::fs::remove_file(path);
            return false;
        }
        match serde_json::to_vec(&stored) {
            Ok(bytes) => write_atomic(&path, &bytes).is_ok(),
            Err(_) => false,
        }
    }

    /// Xóa mọi báo cáo đang chờ (người dùng tắt báo cáo lỗi tự động). Không đụng bộ đếm.
    pub fn clear(&self) {
        for path in self.pending_files() {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Số thứ tự ở đầu tên file chờ (`00000003-R-….json`).
fn sequence_of(path: &Path) -> Option<u64> {
    path.file_name()?.to_str()?.split('-').next()?.parse().ok()
}

/// Ghi qua file tạm rồi đổi tên: file không bao giờ nằm dở dang.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::diagnostics::report::Kind;

    const T0: i64 = 1_790_812_800; // 2026-10-01T00:00:00Z, đầu một ngày UTC

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mt-queue-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn report(n: u32) -> Report {
        Report {
            id: format!("R-0000-{n:04}"),
            kind: Kind::SessionError,
            fingerprint: format!("{n:016x}"),
            json: format!("{{\"n\":{n}}}"),
        }
    }

    #[test]
    fn the_same_fingerprint_is_admitted_once_per_24_hours() {
        let dir = temp("fp");
        let q = Queue::new(dir.clone());
        assert!(q.admit("aaaa", T0));
        assert!(!q.admit("aaaa", T0 + 60));
        assert!(!q.admit("aaaa", T0 + PER_FINGERPRINT_SECONDS - 1));
        assert!(q.admit("bbbb", T0 + 60), "dấu vân tay khác thì được");
        assert!(q.admit("aaaa", T0 + PER_FINGERPRINT_SECONDS), "đủ 24 giờ thì được lại");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn at_most_five_reports_a_utc_day() {
        let dir = temp("day");
        let q = Queue::new(dir.clone());
        for i in 0..MAX_PER_DAY {
            assert!(q.admit(&format!("fp{i}"), T0 + i64::from(i)), "{i}");
        }
        assert!(!q.admit("fp-khác", T0 + 100), "báo cáo thứ 6 trong ngày");
        // Ngày UTC kế tiếp: bộ đếm về 0, và các dấu vân tay đã quá 24 giờ thì được lại.
        assert!(q.admit("fp-khác", T0 + DAY_SECONDS));
        assert!(q.admit("fp0", T0 + DAY_SECONDS + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_new_utc_day_resets_the_counter_but_not_the_24_hour_rule_of_a_fingerprint() {
        let dir = temp("midnight");
        let q = Queue::new(dir.clone());
        let late = T0 + DAY_SECONDS - 100;
        assert!(q.admit("late", late));
        let early_next_day = T0 + DAY_SECONDS + 10;
        assert!(
            !q.admit("late", early_next_day),
            "mới 110 giây, chưa đủ 24 giờ dù đã sang ngày mới"
        );
        for i in 0..MAX_PER_DAY {
            assert!(
                q.admit(&format!("new{i}"), early_next_day + i64::from(i)),
                "bộ đếm ngày mới bắt đầu từ 0: {i}"
            );
        }
        assert!(!q.admit("new-nữa", early_next_day + 50));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_state_file_starts_over_instead_of_blocking_forever() {
        let dir = temp("corrupt-state");
        let q = Queue::new(dir.clone());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("state.json"), b"khong phai json").unwrap();
        assert!(q.admit("aaaa", T0));
        assert!(!q.admit("aaaa", T0 + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn admission_is_refused_when_the_state_cannot_be_written() {
        let dir = temp("readonly");
        // `state.json` là một thư mục: không ghi được.
        std::fs::create_dir_all(dir.join("state.json")).unwrap();
        assert!(!Queue::new(dir.clone()).admit("aaaa", T0));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn the_queue_keeps_the_five_newest_reports_oldest_first() {
        let dir = temp("cap");
        let q = Queue::new(dir.clone());
        for n in 1..=7 {
            q.push(&report(n), T0 + i64::from(n)).unwrap();
        }
        let ids: Vec<String> = q.pending().into_iter().map(|p| p.id).collect();
        assert_eq!(
            ids,
            [
                "R-0000-0003",
                "R-0000-0004",
                "R-0000-0005",
                "R-0000-0006",
                "R-0000-0007"
            ]
        );
        assert_eq!(q.pending()[0].report, "{\"n\":3}");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reports_queued_in_the_same_second_keep_their_order() {
        let dir = temp("same-second");
        let q = Queue::new(dir.clone());
        // Mã báo cáo ngẫu nhiên: nếu thứ tự lấy theo tên mã thì có lúc ra ngược.
        for n in [9, 3, 7, 1, 5] {
            q.push(&report(n), T0).unwrap();
        }
        let ids: Vec<String> = q.pending().into_iter().map(|p| p.id).collect();
        assert_eq!(
            ids,
            [
                "R-0000-0009",
                "R-0000-0003",
                "R-0000-0007",
                "R-0000-0001",
                "R-0000-0005"
            ]
        );
        // Sau khi xóa bớt, báo cáo mới vẫn nằm sau cùng.
        q.remove("R-0000-0003");
        q.push(&report(2), T0).unwrap();
        assert_eq!(q.pending().last().map(|p| p.id.as_str()), Some("R-0000-0002"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_report_is_dropped_after_three_failed_attempts() {
        let dir = temp("attempts");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        assert!(q.record_failure("R-0000-0001"));
        assert_eq!(q.pending()[0].attempts, 1);
        assert!(q.record_failure("R-0000-0001"));
        assert!(!q.record_failure("R-0000-0001"), "lần thứ 3 thì bỏ");
        assert!(q.pending().is_empty());
        assert!(!q.record_failure("R-0000-0001"), "không còn thì không làm gì");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn remove_and_clear() {
        let dir = temp("remove");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        q.push(&report(2), T0 + 1).unwrap();
        q.remove("R-0000-0001");
        assert_eq!(q.pending().len(), 1);
        q.clear();
        assert!(q.pending().is_empty());
        // Không đụng bộ đếm.
        assert!(q.admit("x", T0));
        q.clear();
        assert!(!q.admit("x", T0 + 1));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_corrupt_pending_file_is_deleted_and_skipped() {
        let dir = temp("corrupt-pending");
        let q = Queue::new(dir.clone());
        q.push(&report(1), T0).unwrap();
        std::fs::write(dir.join("pending").join("000000000001-bad.json"), b"hong").unwrap();
        assert_eq!(q.pending().len(), 1);
        assert_eq!(
            std::fs::read_dir(dir.join("pending")).unwrap().count(),
            1,
            "file hỏng đã bị xóa"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_empty_or_missing_queue_is_empty() {
        let dir = temp("empty");
        assert!(Queue::new(dir).pending().is_empty());
    }
}
