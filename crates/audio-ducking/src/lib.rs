//! Hạ và trả âm lượng riêng từng ứng dụng khi bật "Nghe dịch" (spec 2026-11-02-nghe-dich-truc-tiep §4).
//!
//! Lõi không biết gì về hệ điều hành: nói chuyện với âm thanh qua [`Backend`] (Windows: WASAPI, `windows.rs`). Mọi lỗi của
//! backend chỉ làm [`Ducker`] trả âm lượng và báo lỗi, không bao giờ panic.

pub mod journal;
#[cfg(windows)]
pub mod windows;

use journal::Entry;
use std::collections::HashSet;
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SessionId(pub String);

#[derive(Clone, Debug, PartialEq)]
pub struct SessionInfo {
    pub id: SessionId,
    pub pid: u32,
    /// Đường dẫn file chạy của tiến trình (rỗng nếu không đọc được).
    pub exe: String,
    pub volume: f32,
    pub muted: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum BackendError {
    /// Phiên đã biến mất.
    Gone,
    /// Lỗi khác (chỉ mã, không có nội dung người dùng).
    Failed(String),
}

impl std::fmt::Display for BackendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Gone => write!(f, "phiên âm thanh đã biến mất"),
            Self::Failed(code) => write!(f, "lỗi âm thanh: {code}"),
        }
    }
}

impl std::error::Error for BackendError {}

pub trait Backend {
    fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError>;
    fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError>;
}

/// Thanh 0–100% (phần trăm tiếng họp còn lại) → hệ số của phiên. Một hàm duy nhất để chỉnh lại sau khi nghe thử.
pub fn session_scalar(level: u8) -> f32 {
    let x = f32::from(level.clamp(MIN_LEVEL, 100)) / 100.0;
    x * x
}

/// Mức thấp nhất của thanh. Đo thật trên Windows: app hạ còn 1% thì loopback còn ≈ −25 dB (bộ bù mức +26 dB còn đủ), còn 0,25% là
/// ≈ −37 dB và 0,04% là im lặng số: dưới mức này nhận dạng không còn gì để dịch (spec 2026-11-02-nghe-dich-truc-tiep §2).
pub const MIN_LEVEL: u8 = 10;

/// Sai lệch cho phép khi so âm lượng đọc lại với mức mình đã đặt (bộ điều khiển âm lượng làm tròn). Nhỏ, để một thay đổi nhỏ của
/// người dùng quanh mức đã hạ vẫn nhận ra là của họ.
const SAME: f32 = 0.004;

/// Công cụ hỗ trợ (đọc màn hình, phóng to): không bao giờ bị hạ, kẻo người dùng mất tiếng đúng lúc cần tắt "Nghe dịch".
const ASSISTIVE: &[&str] = &[
    "nvda.exe",
    "jfw.exe",
    "narrator.exe",
    "zoomtext.exe",
    "zdsr.exe",
    "supernova.exe",
    "magnify.exe",
];

fn is_assistive(exe: &str) -> bool {
    let base = exe.rsplit(['\\', '/']).next().unwrap_or(exe).to_ascii_lowercase();
    ASSISTIVE.contains(&base.as_str())
}

fn near(a: f32, b: f32) -> bool {
    (a - b).abs() < SAME
}

pub struct Ducker<B: Backend> {
    backend: B,
    journal: PathBuf,
    own_pids: Box<dyn FnMut() -> HashSet<u32> + Send>,
    entries: Vec<Entry>,
    /// Mục còn lại từ lần chạy trước (app đã đóng lúc đó); ghi lại cùng `entries` để không mất.
    carried: Vec<Entry>,
    scalar: f32,
    engaged: bool,
}

impl<B: Backend> Ducker<B> {
    pub fn new(backend: B, journal: PathBuf, own_pids: Box<dyn FnMut() -> HashSet<u32> + Send>) -> Self {
        Self {
            backend,
            journal,
            own_pids,
            entries: Vec::new(),
            carried: Vec::new(),
            scalar: 1.0,
            engaged: false,
        }
    }

    pub fn is_engaged(&self) -> bool {
        self.engaged
    }

    /// Bắt đầu hạ (hay đổi mức khi đang hạ). Lỗi ⇒ đã trả lại những gì đã hạ.
    pub fn engage(&mut self, level: u8) -> Result<(), BackendError> {
        let scalar = session_scalar(level);
        let result = if self.engaged {
            self.retarget(scalar)
        } else {
            self.engaged = true;
            self.scalar = scalar;
            self.carried = journal::read(&self.journal);
            self.duck_new()
        };
        if result.is_err() {
            self.release();
        }
        result
    }

    /// Hạ các phiên mới xuất hiện (gọi định kỳ khi đang hạ).
    pub fn tick(&mut self) -> Result<(), BackendError> {
        if !self.engaged {
            return Ok(());
        }
        let r = self.duck_new();
        if r.is_err() {
            self.release();
        }
        r
    }

    /// Trả âm lượng gốc, trừ phiên mà người dùng đã tự đổi. Khớp phiên theo id + pid; app mở lại bằng tiến trình mới (Windows nhớ
    /// âm lượng theo app) thì khớp theo exe. Mục chưa khớp được (app đã đóng) giữ lại trong sổ tối đa một tuần.
    pub fn release(&mut self) {
        self.engaged = false;
        let mut all = std::mem::take(&mut self.carried);
        all.append(&mut self.entries);
        if all.is_empty() {
            journal::remove(&self.journal);
            return;
        }
        // Không đọc được danh sách phiên thì để nguyên sổ cho lần sau.
        if let Ok(left) = self.restore(all) {
            self.persist(&left);
        }
    }

    /// Lúc khởi động: trả những gì lần chạy trước (đã sập) còn bỏ lại trong sổ.
    pub fn restore_stale(&mut self) {
        if self.engaged {
            return;
        }
        let entries = journal::read(&self.journal);
        if entries.is_empty() {
            journal::remove(&self.journal);
        } else if let Ok(left) = self.restore(entries) {
            self.persist(&left);
        }
    }

    fn persist(&self, left: &[Entry]) {
        if left.is_empty() {
            journal::remove(&self.journal);
        } else {
            let _ = journal::write(&self.journal, left);
        }
    }

    fn all_entries(&self) -> Vec<Entry> {
        self.carried.iter().chain(&self.entries).cloned().collect()
    }

    /// Trả các mục; trả về những mục chưa khớp (còn hạn) để giữ trong sổ.
    fn restore(&mut self, entries: Vec<Entry>) -> Result<Vec<Entry>, BackendError> {
        let sessions = self.backend.sessions()?;
        let now = journal::now_secs();
        let mut used: HashSet<String> = HashSet::new();
        let mut left = Vec::new();
        for e in entries {
            let exact = sessions.iter().find(|s| {
                s.id.0 == e.id && s.pid == e.pid && (e.exe.is_empty() || s.exe == e.exe) && !used.contains(&s.id.0)
            });
            let found = exact.or_else(|| {
                if e.exe.is_empty() {
                    return None;
                }
                sessions
                    .iter()
                    .find(|s| s.exe == e.exe && !used.contains(&s.id.0) && near(s.volume, e.applied))
            });
            match found {
                Some(s) => {
                    used.insert(s.id.0.clone());
                    if near(s.volume, e.applied) {
                        let _ = self.backend.set_volume(&s.id, e.original);
                    }
                }
                None if !journal::is_expired(&e, now) => left.push(e),
                None => {}
            }
        }
        Ok(left)
    }

    fn duck_new(&mut self) -> Result<(), BackendError> {
        let sessions = self.backend.sessions()?;
        let own = (self.own_pids)();
        for s in sessions {
            if own.contains(&s.pid)
                || s.pid == 0
                || is_assistive(&s.exe)
                || self.entries.iter().any(|e| e.id == s.id.0 && e.pid == s.pid)
            {
                continue;
            }
            if s.volume <= self.scalar {
                // Phiên mới của app đã bị hạ (Windows nhớ âm lượng theo app) tự mở ở mức đã hạ: ghi nhận kèm mức gốc của app đó, để
                // lúc trả nó cũng được trả. Phiên vốn nhỏ sẵn thì không đụng (không bao giờ kéo lên).
                let inherited = if s.exe.is_empty() {
                    None
                } else {
                    self.all_entries()
                        .into_iter()
                        .find(|e| e.exe == s.exe && near(s.volume, e.applied))
                };
                if let Some(known) = inherited {
                    self.entries.push(Entry {
                        id: s.id.0.clone(),
                        pid: s.pid,
                        exe: s.exe.clone(),
                        original: known.original,
                        applied: s.volume,
                        since: journal::now_secs(),
                    });
                    let _ = journal::write(&self.journal, &self.all_entries());
                }
                continue;
            }
            self.entries.push(Entry {
                id: s.id.0.clone(),
                pid: s.pid,
                exe: s.exe.clone(),
                original: s.volume,
                applied: self.scalar,
                since: journal::now_secs(),
            });
            // Ghi sổ trước khi đổi.
            let _ = journal::write(&self.journal, &self.all_entries());
            match self.backend.set_volume(&s.id, self.scalar) {
                Ok(()) | Err(BackendError::Gone) => {}
                Err(e) => return Err(e),
            }
        }
        Ok(())
    }

    fn retarget(&mut self, scalar: f32) -> Result<(), BackendError> {
        let sessions = self.backend.sessions()?;
        let old = self.scalar;
        self.scalar = scalar;
        for e in &mut self.entries {
            let Some(s) = sessions.iter().find(|s| s.id.0 == e.id && s.pid == e.pid) else {
                continue;
            };
            if near(s.volume, old) || near(s.volume, e.applied) {
                let target = scalar.min(e.original);
                e.applied = target;
                match self.backend.set_volume(&s.id, target) {
                    Ok(()) | Err(BackendError::Gone) => {}
                    Err(err) => return Err(err),
                }
            }
        }
        let _ = journal::write(&self.journal, &self.all_entries());
        self.duck_new()
    }
}
