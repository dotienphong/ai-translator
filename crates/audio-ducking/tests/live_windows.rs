//! Kiểm thử thật trên WASAPI (Windows), chỉ đụng tới **một tiến trình do chính test dựng** (PowerShell phát âm sin vòng lặp ở mức
//! rất nhỏ), không đụng ứng dụng nào của người dùng. Chạy: `cargo test -p audio-ducking --test live_windows -- --ignored
//! --test-threads=1`. Phủ: hạ và trả bằng WASAPI thật, và khôi phục từ sổ khi tiến trình "sập" giữa lúc đang hạ (spec 2026-11-02-nghe-dich-truc-tiep §4, §7).
#![cfg(windows)]

use audio_ducking::journal;
use audio_ducking::windows::WasapiBackend;
use audio_ducking::{Backend, BackendError, Ducker, SessionId, SessionInfo};
use std::collections::HashSet;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::time::{Duration, Instant};

/// Chỉ cho thấy các phiên của một pid.
struct Only(WasapiBackend, u32);

impl Backend for Only {
    fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError> {
        Ok(self.0.sessions()?.into_iter().filter(|s| s.pid == self.1).collect())
    }
    fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError> {
        self.0.set_volume(id, scalar)
    }
}

struct Player {
    child: Child,
    journal: PathBuf,
}

impl Player {
    fn start(tag: &str) -> Player {
        let tone = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../models/tts/tone.wav");
        assert!(tone.is_file(), "thiếu {}", tone.display());
        let script = format!(
            "$p=New-Object Media.SoundPlayer '{}'; $p.PlayLooping(); Start-Sleep 30",
            tone.display()
        );
        let child = Command::new("powershell")
            .args(["-NoProfile", "-Command", &script])
            .spawn()
            .expect("chạy được powershell");
        let journal = std::env::temp_dir().join(format!("audio-ducking-live-{tag}-{}.json", std::process::id()));
        Player { child, journal }
    }

    fn pid(&self) -> u32 {
        self.child.id()
    }

    fn backend(&self) -> Only {
        Only(WasapiBackend::new().expect("mở WASAPI"), self.pid())
    }

    /// Chờ phiên âm thanh của tiến trình xuất hiện, rồi đặt âm lượng gốc nhỏ (để test gần như im lặng).
    fn wait_session(&self, quiet: f32) -> SessionInfo {
        let mut b = self.backend();
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(10) {
            if let Some(s) = b.sessions().unwrap().into_iter().next() {
                b.set_volume(&s.id, quiet).unwrap();
                return b.sessions().unwrap().into_iter().next().unwrap();
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        panic!("không thấy phiên âm thanh của tiến trình thử");
    }

    fn volume(&self) -> f32 {
        self.backend()
            .sessions()
            .unwrap()
            .first()
            .map(|s| s.volume)
            .expect("còn phiên")
    }

    fn ducker(&self) -> Ducker<Only> {
        Ducker::new(
            self.backend(),
            self.journal.clone(),
            Box::new(|| HashSet::from([std::process::id()])),
        )
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        // Dù test lỗi giữa chừng: trả âm lượng theo sổ rồi dừng tiến trình thử.
        let mut d = Ducker::new(self.backend(), self.journal.clone(), Box::new(HashSet::new));
        d.restore_stale();
        let _ = self.child.kill();
        let _ = self.child.wait();
        journal::remove(&self.journal);
    }
}

fn close(a: f32, b: f32) -> bool {
    (a - b).abs() < 0.02
}

#[test]
#[ignore = "cần thiết bị âm thanh; phát âm sin rất nhỏ ~10 giây"]
fn ducks_and_releases_a_real_session() {
    let p = Player::start("duck");
    let session = p.wait_session(0.3);
    assert!(close(session.volume, 0.3), "đặt âm lượng gốc: {}", session.volume);
    let mut d = p.ducker();
    d.engage(10).expect("hạ được");
    assert!(close(p.volume(), 0.01), "đang hạ: {}", p.volume());
    d.release();
    assert!(close(p.volume(), 0.3), "đã trả: {}", p.volume());
    assert!(!p.journal.exists(), "sổ đã xóa");
}

#[test]
#[ignore = "cần thiết bị âm thanh; phát âm sin rất nhỏ ~10 giây"]
fn restores_from_the_journal_after_a_simulated_crash() {
    let p = Player::start("crash");
    p.wait_session(0.3);
    let mut d = p.ducker();
    d.engage(10).expect("hạ được");
    assert!(close(p.volume(), 0.01));
    // "Sập": không `release`, không chạy hàm dọn nào của đối tượng.
    std::mem::forget(d);
    assert!(p.journal.exists(), "sổ phải còn lại sau khi sập");
    assert!(close(p.volume(), 0.01), "vẫn đang bị hạ");
    // Lần mở sau: khôi phục từ sổ.
    let mut next_run = p.ducker();
    next_run.restore_stale();
    assert!(close(p.volume(), 0.3), "khôi phục từ sổ: {}", p.volume());
    assert!(!p.journal.exists(), "sổ đã xóa sau khi khôi phục");
}

#[test]
#[ignore = "cần thiết bị âm thanh; phát âm sin rất nhỏ ~10 giây"]
fn does_not_overwrite_a_volume_the_user_changed_while_ducked() {
    let p = Player::start("user");
    p.wait_session(0.3);
    let mut d = p.ducker();
    d.engage(10).expect("hạ được");
    // Người dùng tự kéo âm lượng của app này lên 0.6 trong lúc đang hạ.
    let mut other = p.backend();
    let id = other.sessions().unwrap()[0].id.clone();
    other.set_volume(&id, 0.6).unwrap();
    d.release();
    assert!(
        close(p.volume(), 0.6),
        "không được ghi đè mức người dùng vừa đặt: {}",
        p.volume()
    );
}
