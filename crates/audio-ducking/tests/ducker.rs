use audio_ducking::journal::{self, Entry};
use audio_ducking::{Backend, BackendError, Ducker, SessionId, SessionInfo, session_scalar};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

#[derive(Default)]
struct World {
    sessions: Vec<SessionInfo>,
    fail_on: Option<String>,
}

#[derive(Clone, Default)]
struct Fake(Arc<Mutex<World>>);

impl Backend for Fake {
    fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError> {
        Ok(self.0.lock().unwrap().sessions.clone())
    }
    fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError> {
        let mut w = self.0.lock().unwrap();
        if w.fail_on.as_deref() == Some(id.0.as_str()) {
            return Err(BackendError::Failed("giả".into()));
        }
        match w.sessions.iter().position(|s| &s.id == id) {
            Some(i) => {
                w.sessions[i].volume = scalar;
                Ok(())
            }
            None => Err(BackendError::Gone),
        }
    }
}

impl Fake {
    fn add(&self, id: &str, pid: u32, volume: f32) {
        self.0.lock().unwrap().sessions.push(SessionInfo {
            id: SessionId(id.into()),
            pid,
            exe: format!("c:\\app{pid}.exe"),
            volume,
            muted: false,
        });
    }
    fn add_exe(&self, id: &str, pid: u32, exe: &str, volume: f32) {
        self.0.lock().unwrap().sessions.push(SessionInfo {
            id: SessionId(id.into()),
            pid,
            exe: exe.into(),
            volume,
            muted: false,
        });
    }
    fn volume(&self, id: &str) -> Option<f32> {
        self.0
            .lock()
            .unwrap()
            .sessions
            .iter()
            .find(|s| s.id.0 == id)
            .map(|s| s.volume)
    }
    fn set_user_volume(&self, id: &str, v: f32) {
        let mut w = self.0.lock().unwrap();
        if let Some(s) = w.sessions.iter_mut().find(|s| s.id.0 == id) {
            s.volume = v;
        }
    }
    fn remove(&self, id: &str) {
        self.0.lock().unwrap().sessions.retain(|s| s.id.0 != id);
    }
    fn fail_on(&self, id: &str) {
        self.0.lock().unwrap().fail_on = Some(id.into());
    }
}

fn temp_journal() -> PathBuf {
    static N: AtomicU32 = AtomicU32::new(0);
    std::env::temp_dir().join(format!(
        "audio-ducking-test-{}-{}.json",
        std::process::id(),
        N.fetch_add(1, Ordering::SeqCst)
    ))
}

fn own(pids: &[u32]) -> Box<dyn FnMut() -> HashSet<u32> + Send> {
    let set: HashSet<u32> = pids.iter().copied().collect();
    Box::new(move || set.clone())
}

fn world() -> (Fake, Ducker<Fake>, PathBuf) {
    let fake = Fake::default();
    fake.add("a1", 1, 1.0);
    fake.add("a2", 2, 1.0);
    fake.add("a3", 3, 0.8);
    fake.add("a4", 4, 0.5);
    let path = temp_journal();
    let ducker = Ducker::new(fake.clone(), path.clone(), own(&[1, 2]));
    (fake, ducker, path)
}

#[test]
fn session_scalar_curve() {
    // Dưới mức thấp nhất (10%) thì nhận dạng không còn tiếng để dịch: kẹp lên 0,01.
    assert!((session_scalar(0) - 0.01).abs() < 1e-6);
    assert!((session_scalar(9) - 0.01).abs() < 1e-6);
    assert_eq!(session_scalar(100), 1.0);
    assert!((session_scalar(50) - 0.25).abs() < 1e-6);
    assert!((session_scalar(10) - 0.01).abs() < 1e-6);
    assert_eq!(session_scalar(255), 1.0);
}

#[test]
fn engage_ducks_all_but_own() {
    let (fake, mut d, path) = world();
    d.engage(10).unwrap();
    assert!(d.is_engaged());
    assert_eq!(fake.volume("a1"), Some(1.0));
    assert_eq!(fake.volume("a2"), Some(1.0));
    assert!((fake.volume("a3").unwrap() - 0.01).abs() < 1e-6);
    assert!((fake.volume("a4").unwrap() - 0.01).abs() < 1e-6);
    let entries = journal::read(&path);
    assert_eq!(entries.len(), 2);
    let a3 = entries.iter().find(|e| e.id == "a3").unwrap();
    assert_eq!(a3.pid, 3);
    assert!((a3.original - 0.8).abs() < 1e-6);
    assert!((a3.applied - 0.01).abs() < 1e-6);
}

#[test]
fn tick_ducks_new_session() {
    let (fake, mut d, path) = world();
    d.engage(10).unwrap();
    fake.add("a5", 5, 0.9);
    d.tick().unwrap();
    assert!((fake.volume("a5").unwrap() - 0.01).abs() < 1e-6);
    assert_eq!(journal::read(&path).len(), 3);
    // Phiên cũ không bị đặt lại lần hai: người dùng kéo lên thì tick không kéo xuống.
    fake.set_user_volume("a3", 0.5);
    d.tick().unwrap();
    assert_eq!(fake.volume("a3"), Some(0.5));
}

#[test]
fn release_restores_original() {
    let (fake, mut d, path) = world();
    d.engage(10).unwrap();
    d.release();
    assert!(!d.is_engaged());
    assert!((fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
    assert!((fake.volume("a4").unwrap() - 0.5).abs() < 1e-6);
    assert!(journal::read(&path).is_empty());
    assert!(!path.exists());
}

#[test]
fn release_skips_if_user_changed() {
    let (fake, mut d, _) = world();
    d.engage(10).unwrap();
    fake.set_user_volume("a3", 0.7);
    d.release();
    assert_eq!(fake.volume("a3"), Some(0.7));
    assert!((fake.volume("a4").unwrap() - 0.5).abs() < 1e-6);
}

#[test]
fn release_ignores_gone_session() {
    let (fake, mut d, _) = world();
    d.engage(10).unwrap();
    fake.remove("a4");
    d.release();
    assert!((fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
}

#[test]
fn restore_stale_from_journal() {
    let fake = Fake::default();
    fake.add("x", 3, 0.01);
    fake.add("y", 9, 0.01);
    let path = temp_journal();
    let entries = [
        Entry {
            id: "x".into(),
            pid: 3,
            exe: "c:\\app3.exe".into(),
            original: 0.8,
            applied: 0.01,
            since: 0,
        },
        // Cùng exe nhưng pid khác (app mở lại bằng tiến trình mới, Windows nhớ âm lượng đã hạ): khớp theo exe và trả về.
        Entry {
            id: "y".into(),
            pid: 8,
            exe: "c:\\app9.exe".into(),
            original: 0.6,
            applied: 0.01,
            since: 0,
        },
    ];
    journal::write(&path, &entries).unwrap();
    let mut d = Ducker::new(fake.clone(), path.clone(), own(&[1]));
    d.restore_stale();
    assert!((fake.volume("x").unwrap() - 0.8).abs() < 1e-6);
    assert!((fake.volume("y").unwrap() - 0.6).abs() < 1e-6);
    assert!(!path.exists());
}

#[test]
fn corrupt_journal_is_empty() {
    let path = temp_journal();
    for bytes in [
        &b"\x00\xffgarbage"[..],
        &b"{\"version\":1,\"entries\":[{\"id\":\"a\""[..],
        &b""[..],
    ] {
        std::fs::write(&path, bytes).unwrap();
        assert!(journal::read(&path).is_empty());
        let fake = Fake::default();
        let mut d = Ducker::new(fake, path.clone(), own(&[]));
        d.restore_stale();
    }
    let _ = std::fs::remove_file(&path);
    assert!(journal::read(&path).is_empty());
}

#[test]
fn backend_error_during_engage_releases() {
    let (fake, mut d, _) = world();
    fake.fail_on("a4");
    assert!(d.engage(10).is_err());
    assert!(!d.is_engaged());
    assert!((fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
}

#[test]
fn engage_twice_changes_level_without_overwriting_original() {
    let (fake, mut d, _) = world();
    d.engage(10).unwrap();
    d.engage(50).unwrap();
    assert!((fake.volume("a3").unwrap() - 0.25).abs() < 1e-6);
    d.release();
    assert!((fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

#[test]
fn restore_matches_a_new_process_of_the_same_exe() {
    // Windows nhớ âm lượng theo ứng dụng: app họp mở lại bằng tiến trình mới vẫn ở mức đã bị hạ.
    let (fake, mut d, path) = world();
    d.engage(10).unwrap();
    fake.remove("a3");
    fake.add_exe("b3", 33, "c:\\app3.exe", 0.01);
    d.release();
    assert!(
        (fake.volume("b3").unwrap() - 0.8).abs() < 1e-6,
        "tiến trình mới phải được trả về mức gốc"
    );
    assert!(!path.exists());
}

#[test]
fn entries_that_cannot_be_matched_stay_in_the_journal_until_their_app_returns() {
    let (fake, mut d, path) = world();
    d.engage(10).unwrap();
    fake.remove("a4");
    d.release();
    assert!((fake.volume("a3").unwrap() - 0.8).abs() < 1e-6);
    let left = journal::read(&path);
    assert_eq!(left.len(), 1, "mục của app đã đóng phải còn trong sổ");
    assert_eq!(left[0].exe, "c:\\app4.exe");
    // Lần mở sau: app 4 mở lại ở mức 0.01 (Windows nhớ), được trả về 0.5.
    let fresh = Fake::default();
    fresh.add_exe("z4", 400, "c:\\app4.exe", 0.01);
    let mut next_run = Ducker::new(fresh.clone(), path.clone(), own(&[1]));
    next_run.restore_stale();
    assert!((fresh.volume("z4").unwrap() - 0.5).abs() < 1e-6);
    assert!(!path.exists());
}

#[test]
fn a_session_that_inherits_the_ducked_volume_is_journaled_and_restored() {
    let (fake, mut d, _) = world();
    d.engage(10).unwrap();
    // Tiến trình mới của app 4 (gốc 0.5) mở ra đã ở 0.01 vì Windows nhớ mức đã hạ.
    fake.add_exe("n4", 44, "c:\\app4.exe", 0.01);
    d.tick().unwrap();
    d.release();
    assert!(
        (fake.volume("n4").unwrap() - 0.5).abs() < 1e-6,
        "mức gốc phải lấy từ mục cùng exe"
    );
    assert!((fake.volume("a4").unwrap() - 0.5).abs() < 1e-6);
}

#[test]
fn stale_unmatched_entries_expire_after_a_week_but_fresh_ones_stay() {
    let path = temp_journal();
    let old = Entry {
        id: "o".into(),
        pid: 1,
        exe: "c:\\old.exe".into(),
        original: 0.5,
        applied: 0.01,
        since: now_secs() - 8 * 86_400,
    };
    let fresh = Entry {
        id: "f".into(),
        pid: 2,
        exe: "c:\\fresh.exe".into(),
        original: 0.5,
        applied: 0.01,
        since: now_secs(),
    };
    journal::write(&path, &[old, fresh]).unwrap();
    let mut d = Ducker::new(Fake::default(), path.clone(), own(&[]));
    d.restore_stale();
    let left = journal::read(&path);
    assert_eq!(left.len(), 1);
    assert_eq!(left[0].id, "f");
}

#[test]
fn a_journal_from_the_first_version_without_since_still_loads() {
    let path = temp_journal();
    std::fs::write(
        &path,
        br#"{"version":1,"entries":[{"id":"a","pid":3,"exe":"x.exe","original":0.8,"applied":0.01}]}"#,
    )
    .unwrap();
    let e = journal::read(&path);
    assert_eq!(e.len(), 1);
    assert_eq!(e[0].since, 0);
}

#[test]
fn assistive_technology_is_never_ducked() {
    let fake = Fake::default();
    fake.add_exe("sr1", 10, "C:\\Program Files\\NVDA\\nvda.exe", 1.0);
    fake.add_exe("sr2", 11, "c:\\windows\\system32\\Narrator.exe", 1.0);
    fake.add_exe("sr3", 12, "C:\\JAWS\\jfw.exe", 1.0);
    fake.add_exe("app", 13, "c:\\teams.exe", 1.0);
    let mut d = Ducker::new(fake.clone(), temp_journal(), own(&[1]));
    d.engage(10).unwrap();
    for id in ["sr1", "sr2", "sr3"] {
        assert_eq!(fake.volume(id), Some(1.0), "{id} bị hạ");
    }
    assert!((fake.volume("app").unwrap() - 0.01).abs() < 1e-6);
    d.release();
}

#[test]
fn a_small_user_change_near_the_ducked_level_is_not_overwritten() {
    let (fake, mut d, _) = world();
    d.engage(10).unwrap();
    // Người dùng kéo app 3 từ 0.01 lên 0.03: vẫn là thay đổi của họ.
    fake.set_user_volume("a3", 0.03);
    d.release();
    assert_eq!(fake.volume("a3"), Some(0.03));
}
