//! Tìm cửa sổ họp trên Windows (spec 2026-10-26-phan-biet-nguoi-noi §6.1; kế hoạch 05 QĐ 4). Phần này thuần Rust, test trên mọi nền
//! tảng; hàm Win32 thật nằm sau trait [`Desktop`] (Windows: `reader::uia::Win32Desktop`).
//!
//! Thứ tự đọc là bảo vệ quyền riêng tư (QĐ 3 của kế hoạch 04): trước hết chỉ hỏi cửa sổ thuộc **tiến trình nào** và tiến trình đó
//! là **file chạy nào**; tiêu đề cửa sổ chỉ được đọc khi file chạy nằm trong danh sách viết cứng ([`MeetingApp::windows_exe`]) và
//! có công thức cho Windows. Cửa sổ của mọi app khác không bao giờ bị đọc tiêu đề.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::time::{Duration, Instant};

use speaker_protocol::MeetingApp;
use speaker_recipe::{Os, Recipes};

use crate::is_meeting_window;

/// Hai cửa sổ họp mỗi app là đủ (spec §6.1).
pub const MAX_WINDOWS: usize = 2;
/// Số cửa sổ cấp cao nhất xét mỗi lần quét.
pub const MAX_TOP_WINDOWS: usize = 1_024;
/// File chạy của một tiến trình được nhớ chừng này (tiến trình thoát, số hiệu dùng lại cho app khác thì tự hết hạn).
pub const EXE_TTL: Duration = Duration::from_secs(30);

/// Một cửa sổ cấp cao nhất đang hiện: số hiệu (HWND) và tiến trình sở hữu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RawWindow {
    pub id: isize,
    pub pid: u32,
}

/// Hàm hệ thống mà bộ quét dùng.
pub trait Desktop {
    /// Cửa sổ cấp cao nhất đang hiện, theo thứ tự trên xuống dưới. Không đọc tiêu đề.
    fn top_windows(&mut self) -> Vec<RawWindow>;
    /// Đường dẫn hay tên file chạy của tiến trình.
    fn exe_path(&mut self, pid: u32) -> Option<String>;
    fn title(&mut self, id: isize) -> String;
    /// Tên lớp cửa sổ Win32 (công thức dùng làm `window_id`).
    fn class_name(&mut self, id: isize) -> String;
    /// Phiên bản của app họp đang chạy ở tiến trình `pid` (file chạy `exe_path`), cho báo cáo tình trạng (kế hoạch 06, spec §7.2).
    /// Mặc định không biết. Chỉ gọi cho tiến trình của app trong danh sách viết cứng.
    fn app_version(&mut self, pid: u32, exe_path: &str) -> Option<String> {
        let _ = (pid, exe_path);
        None
    }
}

/// App họp của một file chạy (danh sách viết cứng, không phân biệt hoa thường, chỉ xét tên file không xét thư mục).
pub fn app_of_exe(path: &str) -> Option<MeetingApp> {
    let file = path.rsplit(['\\', '/']).next()?;
    MeetingApp::ALL
        .into_iter()
        .find(|a| a.windows_exe().eq_ignore_ascii_case(file))
}

/// Phiên bản trong tên đầy đủ của một gói MSIX (`Tên_Phiên.bản.số.nữa_Kiến-trúc_Mã-tài-nguyên_Mã-nhà-phát-hành`, ví dụ
/// `MSTeams_26032.1100.4129.1234_x64__8wekyb3d8bbwe`): Teams mới là gói trong `WindowsApps`, đọc file phiên bản của file chạy ở đó
/// thường bị từ chối, còn tên gói thì tiến trình nào cũng hỏi được. `None` nếu không đúng dạng (chỉ số và dấu chấm, ≤ 32 ký tự).
pub fn package_version(full_name: &str) -> Option<String> {
    let mut parts = full_name.split('_');
    let (_name, version) = (parts.next()?, parts.next()?);
    let ok = !version.is_empty()
        && version.len() <= speaker_protocol::MAX_APP_VERSION_BYTES
        && version
            .split('.')
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()));
    (ok && parts.next().is_some()).then(|| version.to_string())
}

/// `a.b.c.d` của hai nửa `VS_FIXEDFILEINFO::dwFileVersionMS` và `dwFileVersionLS`.
pub fn fixed_file_version(ms: u32, ls: u32) -> String {
    format!("{}.{}.{}.{}", ms >> 16, ms & 0xFFFF, ls >> 16, ls & 0xFFFF)
}

/// Cửa sổ họp tìm được. `title` có chữ của app họp: không in ra log.
#[derive(Clone, PartialEq, Eq)]
pub struct MeetingWindow {
    pub id: isize,
    pub title: String,
}

impl fmt::Debug for MeetingWindow {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "MeetingWindow({}, tiêu đề {} ký tự)",
            self.id,
            self.title.chars().count()
        )
    }
}

/// App họp đầu tiên (theo ưu tiên của [`MeetingApp::ALL`]) có cửa sổ họp, và các cửa sổ họp của nó.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Found {
    pub app: MeetingApp,
    pub windows: Vec<MeetingWindow>,
    /// Phiên bản app họp (từ tiến trình của cửa sổ họp đầu tiên), nếu hỏi được.
    pub version: Option<String>,
}

/// Bộ quét, nhớ file chạy của từng tiến trình giữa các lần quét.
#[derive(Default)]
pub struct Scanner {
    exes: HashMap<u32, (Instant, Option<MeetingApp>, Option<String>)>,
}

impl Scanner {
    /// `only`: chỉ xét app này (công cụ `uia-record`). Chỉ app có công thức Windows mới vào danh sách (như macOS).
    pub fn scan<D: Desktop>(
        &mut self,
        d: &mut D,
        recipes: &Recipes,
        only: Option<MeetingApp>,
        now: Instant,
    ) -> Option<Found> {
        let mut seen = HashSet::new();
        let mut per_app: Vec<Vec<MeetingWindow>> = vec![Vec::new(); MeetingApp::ALL.len()];
        let mut versions: Vec<Option<String>> = vec![None; MeetingApp::ALL.len()];
        for w in d.top_windows().into_iter().take(MAX_TOP_WINDOWS) {
            seen.insert(w.pid);
            let (app, version) = match self.exes.get(&w.pid) {
                Some((at, app, version)) if now.saturating_duration_since(*at) < EXE_TTL => (*app, version.clone()),
                _ => {
                    let path = d.exe_path(w.pid);
                    let app = path.as_deref().and_then(app_of_exe);
                    // Phiên bản chỉ hỏi cho app trong danh sách viết cứng.
                    let version = app.and_then(|_| path.as_deref().and_then(|p| d.app_version(w.pid, p)));
                    self.exes.insert(w.pid, (now, app, version.clone()));
                    (app, version)
                }
            };
            let Some(app) = app.filter(|a| only.is_none_or(|o| o == *a)) else {
                continue;
            };
            let Some(recipe) = recipes.app(Os::Windows, app) else {
                continue;
            };
            let title = d.title(w.id);
            let class = if recipe.window_id.is_some() {
                d.class_name(w.id)
            } else {
                String::new()
            };
            if is_meeting_window(recipe, &title, &class, "") {
                let slot = MeetingApp::ALL.iter().position(|a| *a == app).unwrap_or(0);
                // `per_app` và `versions` đúng cỡ `MeetingApp::ALL`, nên `get_mut` luôn có; dùng nó thay chỉ số để không có đường panic.
                if let Some(list) = per_app.get_mut(slot) {
                    if list.is_empty()
                        && let Some(v) = versions.get_mut(slot)
                    {
                        *v = version;
                    }
                    list.push(MeetingWindow { id: w.id, title });
                }
            }
        }
        self.exes.retain(|pid, _| seen.contains(pid));
        MeetingApp::ALL
            .into_iter()
            .zip(per_app)
            .zip(versions)
            .find(|((_, windows), _)| !windows.is_empty())
            .map(|((app, mut windows), version)| {
                windows.truncate(MAX_WINDOWS);
                Found { app, windows, version }
            })
    }
}

#[cfg(test)]
#[path = "winscan_tests.rs"]
mod tests;
