//! Bộ đọc tên trên Windows (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.8; kế hoạch 05 Task 6). Cứ [`SCAN_EVERY`] liệt kê cửa sổ
//! cấp cao nhất, chỉ đọc tiêu đề cửa sổ của file chạy trong danh sách viết cứng (`winscan`); đọc cây UI Automation của cửa sổ họp
//! qua `uia_tree`; một ngân sách (≤ 3 000 lệnh, ≤ 30 ms) cho cả lượt (QĐ 13 của kế hoạch 04). Mỗi lệnh chờ tối đa 0,2 s. Không cần
//! quyền nào của hệ điều hành và không đặt thuộc tính nào trong app họp (khác macOS: không `AXEnhancedUserInterface`, không file dấu,
//! không bao giờ trả `NoPermission`). Chỉ đọc: không bấm, không gõ, không đổi gì trong app họp. Log chỉ có số đếm, thời gian, trạng
//! thái; không có tên người hay chữ của app họp.

use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use speaker_protocol::{MeetingApp, ReaderStatus};
use speaker_recipe::{Os, Recipes};
use windows::Win32::Foundation::{CloseHandle, ERROR_SUCCESS, HWND, LPARAM};
use windows::Win32::Storage::FileSystem::{
    GetFileVersionInfoSizeW, GetFileVersionInfoW, VS_FIXEDFILEINFO, VerQueryValueW,
};
use windows::Win32::Storage::Packaging::Appx::GetPackageFullName;
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomation2, IUIAutomationCacheRequest, IUIAutomationCondition,
    IUIAutomationElement, TreeScope_Children, TreeScope_Element, UIA_AriaRolePropertyId, UIA_AutomationIdPropertyId,
    UIA_ClassNamePropertyId, UIA_ControlTypePropertyId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows::core::{BOOL, BSTR, Interface, PCWSTR, PWSTR};

use super::extract::{Budget, MAX_ELEMENTS, PASS_BUDGET, dump_lines};
use super::stats::Stats;
use super::uia_tree::{RawShape, UiaBackend, UiaError, UiaNode, UiaTree, classify_hresult};
use super::windowset::{WindowState, health, read_windows, reconcile};
use super::winscan::{Desktop, RawWindow, Scanner, fixed_file_version, package_version};
use super::{Control, ControlState, Pass, ReaderSetup, SCAN_EVERY, Sample, SampleSink, next_turn};

/// Hạn chờ của mỗi lệnh UI Automation (spec §6.2, §10), ms.
const TIMEOUT_MS: u32 = 200;
/// Số con tối đa đọc từ một phần tử trong một lệnh.
const MAX_CHILDREN: i32 = 512;
/// Chữ lấy từ cửa sổ hệ thống cắt ở chừng này ký tự (như `uia_tree::MAX_TEXT_CHARS`).
const WINDOW_TEXT: usize = 300;

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

fn hwnd(id: isize) -> HWND {
    HWND(id as *mut core::ffi::c_void)
}

fn bstr(r: windows::core::Result<BSTR>) -> String {
    r.map(|b| b.to_string()).unwrap_or_default()
}

fn fail(e: &windows::core::Error) -> UiaError {
    classify_hresult(e.code().0 as u32)
}

/// COM của luồng gọi (đa luồng). Luồng đọc và công cụ `uia-record` giữ một bản suốt đời của bộ đọc, và tạo bộ đọc **sau** nó.
pub struct ComGuard(bool);

impl ComGuard {
    pub fn init() -> Self {
        // SAFETY: chỉ khởi tạo COM cho luồng gọi; `Drop` gỡ đúng một lần khi đã khởi tạo được.
        Self(unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_ok())
    }
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.0 {
            // SAFETY: cặp với `CoInitializeEx` thành công ở `init`.
            unsafe { CoUninitialize() };
        }
    }
}

/// Lệnh UI Automation thật. Hình dạng đọc kèm một bộ nhớ đệm bốn thuộc tính (loại điều khiển, vai trò ARIA, `AutomationId`,
/// `ClassName`); `Name` không nằm trong bộ nhớ đệm, chỉ đọc khi bộ duyệt hỏi (QĐ 3 của kế hoạch 04).
pub struct ComBackend {
    auto: IUIAutomation,
    cache: IUIAutomationCacheRequest,
    all: IUIAutomationCondition,
}

impl ComBackend {
    /// Cần COM đã khởi tạo trên luồng gọi ([`ComGuard`]).
    pub fn new() -> windows::core::Result<Self> {
        // SAFETY: lệnh COM trên luồng đã khởi tạo; mọi giá trị trả về là đối tượng COM do `windows` giữ và nhả.
        unsafe {
            let auto: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
            if let Ok(a2) = auto.cast::<IUIAutomation2>() {
                // Không có (Windows cũ) thì dùng hạn chờ mặc định của hệ thống; vẫn chạy được.
                let _ = a2.SetConnectionTimeout(TIMEOUT_MS);
                let _ = a2.SetTransactionTimeout(TIMEOUT_MS);
            }
            let cache = auto.CreateCacheRequest()?;
            for p in [
                UIA_ControlTypePropertyId,
                UIA_AriaRolePropertyId,
                UIA_AutomationIdPropertyId,
                UIA_ClassNamePropertyId,
            ] {
                cache.AddProperty(p)?;
            }
            cache.SetTreeScope(TreeScope_Element)?;
            let all = auto.CreateTrueCondition()?;
            Ok(Self { auto, cache, all })
        }
    }

    /// Phần tử UI Automation của một cửa sổ (số hiệu từ `Desktop::top_windows`); `None` khi cửa sổ đã đóng.
    pub fn element_from_hwnd(&self, id: isize) -> Option<IUIAutomationElement> {
        // SAFETY: lệnh COM; HWND không còn thì trả lỗi.
        unsafe { self.auto.ElementFromHandle(hwnd(id)) }.ok()
    }

    fn raw(el: &IUIAutomationElement) -> RawShape {
        // SAFETY: đọc thuộc tính đã nằm trong bộ nhớ đệm của phần tử (dựng bằng `self.cache`), không gọi sang tiến trình khác.
        unsafe {
            RawShape {
                control_type: el.CachedControlType().map_or(0, |c| c.0),
                aria_role: bstr(el.CachedAriaRole()),
                automation_id: bstr(el.CachedAutomationId()),
                class_name: bstr(el.CachedClassName()),
            }
        }
    }
}

impl UiaBackend for ComBackend {
    type El = IUIAutomationElement;

    fn shape(&mut self, el: &IUIAutomationElement) -> Result<RawShape, UiaError> {
        // SAFETY: lệnh COM; một lệnh qua tiến trình, hạn chờ `TIMEOUT_MS`.
        let fresh = unsafe { el.BuildUpdatedCache(&self.cache) }.map_err(|e| fail(&e))?;
        Ok(Self::raw(&fresh))
    }

    fn name(&mut self, el: &IUIAutomationElement) -> Result<String, UiaError> {
        // SAFETY: lệnh COM như trên.
        unsafe { el.CurrentName() }.map(|b| b.to_string()).map_err(|e| fail(&e))
    }

    fn children(&mut self, el: &IUIAutomationElement) -> Result<Vec<(IUIAutomationElement, RawShape)>, UiaError> {
        // SAFETY: lệnh COM như trên; một lệnh lấy cả danh sách con kèm bộ nhớ đệm.
        unsafe {
            let array = el
                .FindAllBuildCache(TreeScope_Children, &self.all, &self.cache)
                .map_err(|e| fail(&e))?;
            let n = array.Length().map_err(|e| fail(&e))?.clamp(0, MAX_CHILDREN);
            let mut out = Vec::with_capacity(n as usize);
            for i in 0..n {
                let child = array.GetElement(i).map_err(|e| fail(&e))?;
                let raw = Self::raw(&child);
                out.push((child, raw));
            }
            Ok(out)
        }
    }
}

unsafe extern "system" fn collect(window: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` là con trỏ `Vec<RawWindow>` do `top_windows` truyền và còn sống suốt lệnh `EnumWindows`.
    let list = unsafe { &mut *(lparam.0 as *mut Vec<RawWindow>) };
    // SAFETY: các lệnh chỉ đọc thuộc tính của cửa sổ; cửa sổ đã đóng thì trả giá trị rỗng.
    if unsafe { IsWindowVisible(window) }.as_bool() {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
        list.push(RawWindow {
            id: window.0 as isize,
            pid,
        });
    }
    true.into()
}

/// Hàm Win32 thật cho [`Desktop`].
pub struct Win32Desktop;

impl Desktop for Win32Desktop {
    fn top_windows(&mut self) -> Vec<RawWindow> {
        let mut list: Vec<RawWindow> = Vec::new();
        // SAFETY: `collect` chỉ dùng `lparam` như `Vec<RawWindow>`, và `list` sống hơn lệnh gọi.
        unsafe {
            let _ = EnumWindows(Some(collect), LPARAM(&mut list as *mut Vec<RawWindow> as isize));
        }
        list
    }

    fn exe_path(&mut self, pid: u32) -> Option<String> {
        // SAFETY: mở tiến trình chỉ để hỏi đường dẫn file chạy (quyền hạn chế nhất), đóng handle ngay sau đó.
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let mut buf = [0u16; 1024];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(handle);
            ok.then(|| String::from_utf16_lossy(&buf[..len as usize]))
        }
    }

    fn title(&mut self, id: isize) -> String {
        let mut buf = [0u16; 512];
        // SAFETY: bộ đệm đủ chỗ; cửa sổ không còn thì trả 0.
        let n = unsafe { GetWindowTextW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
            .chars()
            .take(WINDOW_TEXT)
            .collect()
    }

    fn class_name(&mut self, id: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY: như `title`.
        let n = unsafe { GetClassNameW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    fn app_version(&mut self, pid: u32, exe_path: &str) -> Option<String> {
        package_version_of_process(pid).or_else(|| file_version(exe_path))
    }
}

/// Phiên bản của gói MSIX mà tiến trình thuộc về (Teams mới), từ tên đầy đủ của gói; `None` nếu tiến trình không phải app đóng gói
/// hay không hỏi được. Không đọc file nào trong `WindowsApps`.
fn package_version_of_process(pid: u32) -> Option<String> {
    // SAFETY: mở tiến trình chỉ để hỏi tên gói (quyền hạn chế nhất), đóng handle ngay sau đó; bộ đệm 256 ký tự lớn hơn
    // `PACKAGE_FULL_NAME_MAX_LENGTH` (127) nên không bao giờ thiếu chỗ.
    let name = unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut buf = [0u16; 256];
        let mut len = buf.len() as u32;
        let rc = GetPackageFullName(handle, &mut len, Some(PWSTR(buf.as_mut_ptr())));
        let _ = CloseHandle(handle);
        (rc == ERROR_SUCCESS)
            .then(|| String::from_utf16_lossy(&buf[..(len as usize).saturating_sub(1).min(buf.len())]))?
    };
    package_version(&name)
}

/// Phiên bản trong tài nguyên phiên bản của file chạy (Chrome, Edge, Zoom: file nằm ở thư mục đọc được). `None` nếu không đọc được.
fn file_version(path: &str) -> Option<String> {
    let file: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    let root: Vec<u16> = "\\".encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: cả hai chuỗi kết thúc bằng NUL và sống hơn các lệnh gọi; bộ đệm đúng cỡ `GetFileVersionInfoSizeW` trả (≤ 1 MiB);
    // `VerQueryValueW` trả con trỏ vào chính bộ đệm đó, và ta chỉ đọc (không căn) khi đủ chỗ cho một `VS_FIXEDFILEINFO`.
    unsafe {
        let size = GetFileVersionInfoSizeW(PCWSTR(file.as_ptr()), None);
        if size == 0 || size > (1 << 20) {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(PCWSTR(file.as_ptr()), None, size, data.as_mut_ptr().cast()).ok()?;
        let mut info: *mut core::ffi::c_void = std::ptr::null_mut();
        let mut len = 0u32;
        let found = VerQueryValueW(data.as_ptr().cast(), PCWSTR(root.as_ptr()), &mut info, &mut len);
        if !found.as_bool() || info.is_null() || (len as usize) < std::mem::size_of::<VS_FIXEDFILEINFO>() {
            return None;
        }
        // Bộ đệm là `Vec<u8>` (căn 1 byte) nên con trỏ có thể lệch căn: đọc không cần căn, không tạo tham chiếu.
        let fixed = std::ptr::read_unaligned(info as *const VS_FIXEDFILEINFO);
        Some(fixed_file_version(fixed.dwFileVersionMS, fixed.dwFileVersionLS))
    }
}

fn empty(status: ReaderStatus, app: Option<MeetingApp>, pass: Pass) -> Sample {
    Sample {
        at_unix_ms: 0,
        period_ms: 0,
        status,
        app,
        app_version: None,
        tiles: Vec::new(),
        pass,
        pass_ms: 0.0,
        elements: 0,
    }
}

type Node = UiaNode<IUIAutomationElement>;

/// Bộ đọc của một lần chạy worker (hay của `uia-record`). Tạo trên luồng đã có [`ComGuard`].
pub struct LiveReader {
    recipes: Arc<Recipes>,
    /// `uia-record`: chỉ đọc app này.
    only: Option<MeetingApp>,
    desktop: Win32Desktop,
    scanner: Scanner,
    last_scan: Option<Instant>,
    app: Option<MeetingApp>,
    /// Phiên bản của app họp đang đọc (`ReaderState.app_version`), nếu hỏi được.
    version: Option<String>,
    /// Trạng thái đọc các cửa sổ họp, theo từng nguồn (mục công thức) của app: `windows[v]` là của `Recipes::variants(..)[v]`.
    windows: Vec<Vec<WindowState<Node>>>,
    tree: UiaTree<ComBackend>,
    failures: u32,
    stats: Stats,
}

impl LiveReader {
    pub fn new(recipes: Arc<Recipes>, only: Option<MeetingApp>) -> windows::core::Result<Self> {
        Ok(Self {
            recipes,
            only,
            desktop: Win32Desktop,
            scanner: Scanner::default(),
            last_scan: None,
            app: None,
            version: None,
            windows: Vec::new(),
            tree: UiaTree::new(ComBackend::new()?),
            failures: 0,
            stats: Stats::default(),
        })
    }

    /// Quét cửa sổ họp khi tới hạn: cửa sổ còn đó giữ trạng thái đọc, cửa sổ mới dựng phần tử UI Automation.
    fn rescan(&mut self, now: Instant) {
        self.last_scan = Some(now);
        let found = self.scanner.scan(&mut self.desktop, &self.recipes, self.only, now);
        let Some(found) = found else {
            self.app = None;
            self.version = None;
            self.windows.clear();
            return;
        };
        let list: Vec<(isize, String)> = found.windows.into_iter().map(|w| (w.id, w.title)).collect();
        let sources = self.recipes.variants(Os::Windows, found.app).len().max(1);
        let mut old = if self.app == Some(found.app) {
            std::mem::take(&mut self.windows)
        } else {
            Vec::new()
        };
        old.resize_with(sources, Vec::new);
        let backend = self.tree.backend();
        self.windows = old
            .into_iter()
            .map(|per_source| reconcile(per_source, &list, |id| backend.element_from_hwnd(id).map(UiaNode::new)))
            .collect();
        self.app = Some(found.app);
        self.version = found.version;
    }

    /// Đọc tên tắt: không đọc gì.
    pub fn idle(&mut self) -> Sample {
        self.release_all();
        empty(ReaderStatus::Off, None, Pass::Idle)
    }

    /// Bỏ trạng thái đọc (tắt "Lấy tên", tạm dừng, dừng phiên, worker thoát). Không có gì phải trả trong app họp.
    pub fn release_all(&mut self) {
        self.app = None;
        self.version = None;
        self.windows.clear();
        self.last_scan = None;
    }

    /// Một lượt đọc. Một ngân sách cho cả lượt (QĐ 13 của kế hoạch 04); hết thì lượt sau đọc tiếp.
    pub fn tick(&mut self, calibrate: bool) -> Sample {
        let started = Instant::now();
        let at = unix_ms();
        self.tree.begin_pass();
        if self.last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY) {
            self.rescan(started);
        }
        let recipes = self.recipes.clone();
        let Some((app, variants)) = self
            .app
            .map(|a| (a, recipes.variants(Os::Windows, a)))
            .filter(|(_, v)| !v.is_empty())
        else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let mut budget = Budget::new(MAX_ELEMENTS, PASS_BUDGET);
        let (mut tiles, mut full) = (Vec::new(), false);
        for (v, recipe) in variants.into_iter().enumerate() {
            let Some(windows) = self.windows.get_mut(v) else {
                continue;
            };
            let (t, f) = read_windows(&mut self.tree, windows, recipe, v as u8, calibrate, &mut budget);
            tiles.extend(t);
            full |= f;
        }
        let broken = self.tree.timeouts() + self.tree.denied() > 0;
        let (failures, status) = health(self.failures, broken);
        self.failures = failures;
        let sample = Sample {
            tiles,
            app_version: self.version.clone(),
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
        self.finish(sample, at, started)
    }

    fn finish(&mut self, mut s: Sample, at: u64, started: Instant) -> Sample {
        s.at_unix_ms = at;
        s.pass_ms = started.elapsed().as_secs_f32() * 1000.0;
        s.elements = self.tree.reads();
        if let Some(line) = self.stats.add(s.pass, s.pass_ms, s.elements, Instant::now()) {
            eprintln!("{line}");
        }
        s
    }

    /// Số lệnh quá hạn chờ ở lượt vừa đọc (`uia-record stats`).
    pub fn timeouts(&self) -> u32 {
        self.tree.timeouts()
    }

    /// Số lệnh bị chặn ở lượt vừa đọc (`uia-record stats`).
    pub fn denied(&self) -> u32 {
        self.tree.denied()
    }

    /// Cây của các cửa sổ họp đang đọc, định dạng fixture (`uia-record fixture`; có chữ của app họp).
    pub fn dump_windows(&mut self) -> Vec<String> {
        let recipes = self.recipes.clone();
        let Some(recipe) = self.app.and_then(|a| recipes.app(Os::Windows, a)) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for w in self.windows.first().into_iter().flatten() {
            out.extend(dump_lines(&mut self.tree, &w.node, &w.title, "", recipe));
        }
        out
    }
}

/// Chạy bộ đọc trên luồng riêng. Nhịp theo `Control` (QĐ 13 của kế hoạch 04); giữa hai lượt luồng ngủ bằng `next_turn`. "Lấy tên" tắt
/// hay tạm dừng: gửi một mẫu `Off` rồi ngủ không hạn tới khi trạng thái đổi. Dừng khi `stop` hay khi luồng chính thôi nhận mẫu.
/// Không tạo được UI Automation thì ghi log và thôi (phụ đề vẫn chạy, tên không có).
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, mut sink: SampleSink) -> Option<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("speaker-reader".into())
        .spawn(move || {
            let _com = ComGuard::init();
            let mut reader = match LiveReader::new(setup.recipes, None) {
                Ok(r) => r,
                Err(e) => {
                    eprintln!(
                        "speaker-worker: không khởi tạo được UI Automation (0x{:08X})",
                        e.code().0 as u32
                    );
                    return;
                }
            };
            let mut last = Instant::now();
            let mut c: ControlState = control.get();
            loop {
                let started = Instant::now();
                let mut sample = if c.enabled {
                    reader.tick(c.calibrate)
                } else {
                    reader.idle()
                };
                sample.period_ms = started.duration_since(last).as_millis().min(u128::from(u32::MAX)) as u32;
                last = started;
                if !sink(sample) {
                    break;
                }
                match next_turn(&control, c, started) {
                    Some(next) => c = next,
                    None => break,
                }
            }
            reader.release_all();
        })
        .ok()
}
