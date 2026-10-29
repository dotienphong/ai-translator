//! Bộ đọc tên trên macOS (spec 2026-10-26-phan-biet-nguoi-noi §6.1–§6.2, §6.7–§6.8; kế hoạch 04 Task 12). Quét tiến trình mỗi 2 s
//! tìm app họp trong danh sách viết cứng (bundle id); kiểm quyền Trợ năng (`AXIsProcessTrusted`: tiến trình con hưởng quyền của app,
//! `results/quyen-tro-nang.md`); đọc cây Accessibility của cửa sổ họp qua `ApplicationServices`; bật `AXEnhancedUserInterface` cho
//! Teams suốt phiên, cho Chrome, Edge khi có cửa sổ Meet (trả sau 30 s không còn cửa sổ Meet; spec §6.8; QĐ 8, 28 của kế hoạch 04).
//! Mỗi lệnh chờ tối đa 0,2 s, đặt một lần cho cả tiến trình ([`set_process_timeout`], QĐ 27). Một ngân sách (≤ 3 000 lệnh,
//! ≤ 30 ms) cho cả lượt đọc (QĐ 13). Chỉ đọc: không bấm, không gõ, không đổi gì khác trong app họp. Log chỉ có số đếm, thời gian,
//! trạng thái; không có tên người hay chữ của app họp.

use std::collections::HashMap;
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use core_foundation::array::{CFArray, CFArrayRef};
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::bundle::{CFBundle, CFBundleGetIdentifier, CFBundleGetValueForInfoDictionaryKey};
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
use speaker_protocol::{EuiEntry, MeetingApp, ReaderStatus};
use speaker_recipe::{Attrs, Os, Recipes};

use super::extract::{
    Budget, MAX_ELEMENTS, PASS_BUDGET, TileRef, TileSample, Walk, dump_lines, is_meeting_window, sample_round,
};
use super::stats::Stats;
use super::tree::Tree;
use super::{Control, ControlState, FULL_EVERY, Pass, ReaderSetup, SCAN_EVERY, Sample, SampleSink, eui, next_turn};

type AXError = i32;
const AX_SUCCESS: AXError = 0;
/// `kAXErrorCannotComplete`: app không trả lời trong hạn chờ.
const AX_CANNOT_COMPLETE: AXError = -25204;
/// Mỗi lệnh chờ tối đa chừng này (spec §6.2).
const AX_TIMEOUT_S: f32 = 0.2;
/// Cửa sổ họp nhận theo vai trò phụ (cuộc họp Teams có tên: cửa sổ họp, cửa sổ chính, cửa sổ rời) cần chỗ cho cả cửa sổ không phải
/// họp; chúng chỉ bị đọc một lượt đầy đủ rồi nghỉ [`SUBROLE_REPROBE`] (xem `Window::probed_no_meeting`).
const MAX_WINDOWS: usize = 3;
/// Cửa sổ chỉ nhận theo vai trò phụ mà lượt đầy đủ không thấy `confirm_id` (cửa sổ chính của Teams) được hỏi lại sau chừng này, hay
/// ngay khi tiêu đề đổi (cuộc họp ngay trong cửa sổ chính không đổi tiêu đề).
const SUBROLE_REPROBE: Duration = Duration::from_secs(30);
/// Chừng này lượt liền có lệnh không trả lời thì trạng thái là `Blocked`.
const BLOCKED_AFTER: u32 = 5;
/// Chữ đọc được cắt ở chừng này ký tự (như `axtrace`).
const MAX_TEXT_CHARS: usize = 300;
const SHAPE: [&str; 5] = [
    "AXRole",
    "AXSubrole",
    "AXIdentifier",
    "AXDOMIdentifier",
    "AXDOMClassList",
];
const TEXT: [&str; 3] = ["AXTitle", "AXDescription", "AXValue"];
const EUI: &str = "AXEnhancedUserInterface";
/// Trình duyệt: trả `AXEnhancedUserInterface` sau chừng này không còn cửa sổ Meet (QĐ 28).
const BROWSER_EUI_IDLE: Duration = Duration::from_secs(30);

/// Thông tin một tiến trình đã quét: đường dẫn file chạy, app họp và phiên bản (nếu là app họp).
type ProcInfo = (PathBuf, Option<(MeetingApp, Option<String>)>);

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    /// Header trả `Boolean` (unsigned char), không phải `bool` của Rust (rà soát B-N5).
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateSystemWide() -> CFTypeRef;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: *mut CFTypeRef) -> AXError;
    fn AXUIElementCopyMultipleAttributeValues(
        element: CFTypeRef,
        attributes: CFArrayRef,
        options: u32,
        values: *mut CFArrayRef,
    ) -> AXError;
    fn AXUIElementSetAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: CFTypeRef) -> AXError;
    fn AXUIElementSetMessagingTimeout(element: CFTypeRef, timeout_seconds: f32) -> AXError;
}

fn unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Tiến trình này (hay app cha mà nó hưởng quyền) có quyền Trợ năng.
pub fn trusted() -> bool {
    // SAFETY: hàm của ApplicationServices, không tham số.
    unsafe { AXIsProcessTrusted() != 0 }
}

/// Hạn chờ 0,2 s cho mọi lệnh Accessibility của cả tiến trình (spec §6.2, §10; QĐ 27): đặt trên phần tử hệ thống. Đặt trên phần tử
/// app chỉ áp cho chính phần tử đó, không cho cửa sổ và phần tử con (`AXUIElement.h`, rà soát B-Q1). Gọi một lần ở đầu luồng đọc và
/// đầu `ax-record`.
pub fn set_process_timeout() {
    // SAFETY: hàm tạo theo luật create; NULL khi lỗi.
    let r = unsafe { AXUIElementCreateSystemWide() };
    if r.is_null() {
        return;
    }
    // SAFETY: `r` là tham chiếu +1 vừa tạo; bọc để nhả khi ra khỏi hàm.
    let system = unsafe { CFType::wrap_under_create_rule(r) };
    // SAFETY: phần tử còn sống tới hết lời gọi.
    unsafe { AXUIElementSetMessagingTimeout(system.as_CFTypeRef(), AX_TIMEOUT_S) };
}

/// Một phần tử Accessibility (giữ tham chiếu).
#[derive(Clone)]
pub struct AxNode(CFType);

impl AxNode {
    fn app(pid: i32) -> Option<Self> {
        // SAFETY: hàm tạo theo luật create; NULL khi lỗi.
        let r = unsafe { AXUIElementCreateApplication(pid) };
        if r.is_null() {
            return None;
        }
        // SAFETY: `r` là tham chiếu +1 vừa tạo.
        let el = AxNode(unsafe { CFType::wrap_under_create_rule(r) });
        // SAFETY: phần tử còn sống; đặt thêm cho chính phần tử app (hạn chờ của cả tiến trình: `set_process_timeout`).
        unsafe { AXUIElementSetMessagingTimeout(el.0.as_CFTypeRef(), AX_TIMEOUT_S) };
        Some(el)
    }

    fn copy(&self, name: &'static str) -> Result<Option<CFType>, AXError> {
        let attr = CFString::from_static_string(name);
        let mut v: CFTypeRef = std::ptr::null();
        // SAFETY: phần tử và tên thuộc tính sống tới hết lời gọi; `v` theo luật copy (+1).
        let err = unsafe { AXUIElementCopyAttributeValue(self.0.as_CFTypeRef(), attr.as_concrete_TypeRef(), &mut v) };
        if err != AX_SUCCESS {
            return Err(err);
        }
        // SAFETY: `v` là tham chiếu +1 hay NULL.
        Ok((!v.is_null()).then(|| unsafe { CFType::wrap_under_create_rule(v) }))
    }

    fn string(&self, name: &'static str) -> Option<String> {
        self.copy(name).ok().flatten().map(|v| text_of(&Some(v)))
    }

    fn elements(&self, name: &'static str) -> Vec<AxNode> {
        let Some(v) = self.copy(name).ok().flatten() else {
            return Vec::new();
        };
        let Some(arr) = v.downcast::<CFArray<*const c_void>>() else {
            return Vec::new();
        };
        arr.get_all_values()
            .into_iter()
            .filter(|p| !p.is_null())
            // SAFETY: phần tử của mảng còn sống trong lúc giữ `arr`; bọc theo luật get (+1).
            .map(|p| AxNode(unsafe { CFType::wrap_under_get_rule(p) }))
            .collect()
    }

    /// Nhiều thuộc tính một lần (spec §6.2: `AXUIElementCopyMultipleAttributeValues`). Thuộc tính không có: giá trị lỗi, đọc ra rỗng.
    fn many(&self, names: &CFArray<CFString>) -> Result<Vec<Option<CFType>>, AXError> {
        let mut out: CFArrayRef = std::ptr::null();
        // SAFETY: như `copy`; `out` theo luật copy.
        let err = unsafe {
            AXUIElementCopyMultipleAttributeValues(self.0.as_CFTypeRef(), names.as_concrete_TypeRef(), 0, &mut out)
        };
        if err != AX_SUCCESS || out.is_null() {
            return Err(err);
        }
        // SAFETY: mảng +1 vừa nhận.
        let values: CFArray<*const c_void> = unsafe { CFArray::wrap_under_create_rule(out) };
        Ok(values
            .get_all_values()
            .into_iter()
            // SAFETY: như `elements`.
            .map(|p| (!p.is_null()).then(|| unsafe { CFType::wrap_under_get_rule(p) }))
            .collect())
    }

    /// Đọc `AXEnhancedUserInterface`, phân biệt ba kết quả (rà soát lần 3): lỗi (gồm quá hạn chờ -25204 khi app họp treo) là
    /// `Unknown`, không gộp với "không phải bật".
    fn read_eui(&self) -> eui::EuiRead {
        match self.copy(EUI) {
            Ok(v) => eui::EuiRead::from_value(v.and_then(|v| v.downcast::<CFBoolean>()).map(bool::from)),
            Err(_) => eui::EuiRead::Unknown,
        }
    }

    fn set_bool(&self, name: &'static str, on: bool) {
        let attr = CFString::from_static_string(name);
        let v = if on {
            CFBoolean::true_value()
        } else {
            CFBoolean::false_value()
        };
        // SAFETY: phần tử, tên, giá trị sống tới hết lời gọi. Mã trả về không dùng: đặt `AXEnhancedUserInterface` trả -25208 dù giá
        // trị đã đổi (`results/teams-chrome.md`).
        unsafe { AXUIElementSetAttributeValue(self.0.as_CFTypeRef(), attr.as_concrete_TypeRef(), v.as_CFTypeRef()) };
    }
}

fn text_of(v: &Option<CFType>) -> String {
    v.as_ref()
        .and_then(|v| v.downcast::<CFString>())
        .map(|s| s.to_string().chars().take(MAX_TEXT_CHARS).collect())
        .unwrap_or_default()
}

fn classes_of(v: &Option<CFType>) -> Vec<String> {
    let Some(arr) = v.as_ref().and_then(|v| v.downcast::<CFArray<*const c_void>>()) else {
        return Vec::new();
    };
    arr.get_all_values()
        .into_iter()
        .take(32)
        .filter(|p| !p.is_null())
        // SAFETY: như `AxNode::elements`.
        .map(|p| unsafe { CFType::wrap_under_get_rule(p) })
        .filter_map(|v| v.downcast::<CFString>().map(|s| s.to_string()))
        .collect()
}

/// Cây Accessibility thật, qua trait [`Tree`] (cùng mã duyệt với fixture).
pub struct AxTree {
    shape_names: CFArray<CFString>,
    text_names: CFArray<CFString>,
    /// Số lần đọc trong lượt hiện tại (log, `Sample::elements`).
    pub reads: u32,
    /// Số lệnh không trả lời trong lượt hiện tại.
    pub timeouts: u32,
}

impl AxTree {
    pub fn new() -> Self {
        let names = |list: &[&'static str]| {
            CFArray::from_CFTypes(&list.iter().map(|s| CFString::from_static_string(s)).collect::<Vec<_>>())
        };
        Self {
            shape_names: names(&SHAPE),
            text_names: names(&TEXT),
            reads: 0,
            timeouts: 0,
        }
    }

    fn note<T>(&mut self, r: Result<T, AXError>) -> Option<T> {
        if r.as_ref().err() == Some(&AX_CANNOT_COMPLETE) {
            self.timeouts += 1;
        }
        r.ok()
    }
}

impl Default for AxTree {
    fn default() -> Self {
        Self::new()
    }
}

impl Tree for AxTree {
    type Node = AxNode;

    fn role(&mut self, n: &AxNode) -> Option<String> {
        self.reads += 1;
        let r = n.copy("AXRole");
        self.note(r).flatten().map(|v| text_of(&Some(v)))
    }

    fn shape(&mut self, n: &AxNode) -> Option<Attrs> {
        self.reads += 1;
        let r = n.many(&self.shape_names);
        let v = self.note(r)?;
        // Mảng ngắn hơn số thuộc tính (app trả sai) thì đọc ra rỗng, không đánh chỉ số ngoài mảng (rà soát B-N6).
        let at = |i: usize| v.get(i).cloned().flatten();
        Some(Attrs {
            role: text_of(&at(0)),
            subrole: text_of(&at(1)),
            ident: text_of(&at(2)),
            dom_id: text_of(&at(3)),
            classes: classes_of(&at(4)),
            ..Attrs::default()
        })
    }

    fn text(&mut self, n: &AxNode, a: &mut Attrs) -> bool {
        self.reads += 1;
        let r = n.many(&self.text_names);
        let Some(v) = self.note(r) else { return false };
        let at = |i: usize| v.get(i).cloned().flatten();
        a.title = text_of(&at(0));
        a.desc = text_of(&at(1));
        a.value = text_of(&at(2));
        true
    }

    fn children(&mut self, n: &AxNode) -> Vec<AxNode> {
        n.elements("AXChildren")
    }
}

/// `…/X.app/Contents/MacOS/X` → `…/X.app` (gói của tiến trình chính của app).
pub fn bundle_dir_of(exe: &Path) -> Option<&Path> {
    let macos = exe.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos.parent()?;
    if contents.file_name()? != "Contents" {
        return None;
    }
    let app = contents.parent()?;
    (app.extension()? == "app").then_some(app)
}

/// App họp của một bundle id (danh sách viết cứng, spec §6.1).
pub fn app_of_bundle_id(id: &str) -> Option<MeetingApp> {
    MeetingApp::ALL.into_iter().find(|a| a.macos_bundle_id() == id)
}

/// Bundle id và phiên bản (`CFBundleShortVersionString`, ≤ 32 ký tự) của một gói.
fn bundle_info(dir: &Path) -> Option<(String, Option<String>)> {
    let bundle = CFBundle::new(CFURL::from_path(dir, true)?)?;
    // SAFETY: luật get: chuỗi thuộc gói đang giữ; bọc thì giữ thêm một tham chiếu.
    let id = unsafe { CFBundleGetIdentifier(bundle.as_concrete_TypeRef()) };
    if id.is_null() {
        return None;
    }
    let id = unsafe { CFString::wrap_under_get_rule(id) }.to_string();
    let key = CFString::from_static_string("CFBundleShortVersionString");
    // SAFETY: như trên.
    let v = unsafe { CFBundleGetValueForInfoDictionaryKey(bundle.as_concrete_TypeRef(), key.as_concrete_TypeRef()) };
    let version = (!v.is_null())
        .then(|| unsafe { CFType::wrap_under_get_rule(v) })
        .and_then(|v| v.downcast::<CFString>())
        .map(|s| s.to_string().chars().take(32).collect());
    Some((id, version))
}

fn list_pids() -> Vec<i32> {
    // SAFETY: hỏi số tiến trình (bộ đệm rỗng).
    let n = unsafe { libc::proc_listallpids(std::ptr::null_mut(), 0) };
    if n <= 0 {
        return Vec::new();
    }
    let mut pids = vec![0i32; n as usize + 64];
    // SAFETY: bộ đệm đủ chỗ cho `pids.len()` số `pid_t`.
    let got = unsafe { libc::proc_listallpids(pids.as_mut_ptr().cast(), (pids.len() * size_of::<i32>()) as i32) };
    pids.truncate(got.max(0) as usize);
    pids.retain(|&p| p > 0);
    pids
}

fn pid_path(pid: i32) -> Option<PathBuf> {
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: bộ đệm đủ `PROC_PIDPATHINFO_MAXSIZE` byte.
    let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        return None;
    }
    buf.truncate(len as usize);
    String::from_utf8(buf).ok().map(PathBuf::from)
}

/// App họp và phiên bản của tiến trình `pid` (chỉ tiến trình chính của gói).
fn identify(path: &Path) -> Option<(MeetingApp, Option<String>)> {
    let (id, version) = bundle_info(bundle_dir_of(path)?)?;
    Some((app_of_bundle_id(&id)?, version))
}

struct Window {
    node: AxNode,
    title: String,
    /// AXSubrole (rỗng khi công thức không có luật `window_subrole`), chỉ để ghi bản ghi cây.
    subrole: String,
    /// Nhận cửa sổ chỉ nhờ `window_subrole` (tiêu đề, id không khớp): có thể là cửa sổ chính của app, không phải cửa sổ họp.
    subrole_only: bool,
    /// Lúc lượt đầy đủ xong mà không thấy `confirm_id`, và tiêu đề lúc đó: cửa sổ này không phải cửa sổ họp, nghỉ đọc tới hạn hay
    /// tới khi tiêu đề đổi (CPU: cửa sổ chính của Teams to, không quét mỗi 3 s).
    probed_no_meeting: Option<(Instant, String)>,
    /// Cửa sổ này từng có `confirm_id`: nó là cửa sổ họp, nên một lượt thấy thiếu nút (Teams dựng lại cây) không được làm nó nghỉ.
    ever_confirmed: bool,
    walk: Option<Walk<AxNode>>,
    tiles: Vec<TileRef<AxNode>>,
    last_full: Option<Instant>,
    stale: bool,
    /// Ô bắt đầu của lượt nhanh kế (xoay vòng khi hết ngân sách giữa chừng).
    next: usize,
}

struct Target {
    pid: i32,
    app: MeetingApp,
    version: Option<String>,
    windows: Vec<Window>,
}

/// Bộ đọc của một lần chạy worker (hay của `ax-record`).
pub struct LiveReader {
    recipes: Arc<Recipes>,
    marker: Option<PathBuf>,
    /// `ax-record`: chỉ đọc app này.
    only: Option<MeetingApp>,
    procs: HashMap<i32, ProcInfo>,
    /// App họp đang chạy (có công thức), theo thứ tự ưu tiên.
    running: Vec<(i32, MeetingApp, Option<String>)>,
    last_scan: Option<Instant>,
    target: Option<Target>,
    /// App mà chính bộ đọc đã bật `AXEnhancedUserInterface`.
    enhanced: Vec<EuiEntry>,
    /// Lần cuối thấy cửa sổ họp của từng pid (trả EUI của trình duyệt khi hết cửa sổ Meet, QĐ 28).
    meeting_seen: HashMap<i32, Instant>,
    /// Đã trả EUI còn sót của lần chạy trước (làm ở lượt đầu tiên có quyền, QĐ 28).
    restored: bool,
    tree: AxTree,
    failures: u32,
    stats: Stats,
}

impl LiveReader {
    pub fn new(recipes: Arc<Recipes>, marker: Option<PathBuf>, only: Option<MeetingApp>) -> Self {
        Self {
            recipes,
            marker,
            only,
            procs: HashMap::new(),
            running: Vec::new(),
            last_scan: None,
            target: None,
            enhanced: Vec::new(),
            meeting_seen: HashMap::new(),
            restored: false,
            tree: AxTree::new(),
            failures: 0,
            stats: Stats::default(),
        }
    }

    /// Trả `AXEnhancedUserInterface` còn sót từ lần chạy trước bị giết (file dấu, QĐ 8, 28). Chỉ khi có quyền Trợ năng (không có
    /// quyền thì lệnh đặt thất bại: giữ nguyên file dấu); chỉ bỏ khỏi dấu mục đã trả được hay mục mà pid không còn là đúng app.
    pub fn restore_leftovers(&mut self) {
        let Some(marker) = self.marker.clone() else { return };
        if !trusted() {
            return;
        }
        for entry in eui::read(&marker) {
            if !self.enhanced.contains(&entry) && reset_enhanced(entry) {
                let _ = eui::remove(&marker, entry.pid);
            }
        }
    }

    /// Trả mọi `AXEnhancedUserInterface` chính bộ đọc đã bật (tắt "Lấy tên", tạm dừng, dừng phiên, worker thoát). Mục trả không được
    /// (mất quyền giữa chừng) giữ trong file dấu cho lần sau.
    pub fn release_all(&mut self) {
        for entry in std::mem::take(&mut self.enhanced) {
            if reset_enhanced(entry)
                && let Some(m) = &self.marker
            {
                let _ = eui::remove(m, entry.pid);
            }
        }
        self.meeting_seen.clear();
        self.target = None;
    }

    /// Trình duyệt (Chrome, Edge): trả EUI sau [`BROWSER_EUI_IDLE`] không còn cửa sổ Meet (QĐ 28; Teams giữ tới hết phiên).
    fn release_idle_browsers(&mut self) {
        let now = Instant::now();
        let idle = |e: &EuiEntry, seen: &HashMap<i32, Instant>| {
            matches!(e.app, MeetingApp::MeetChrome | MeetingApp::MeetEdge)
                && seen
                    .get(&e.pid)
                    .is_none_or(|t| now.duration_since(*t) >= BROWSER_EUI_IDLE)
        };
        let (gone, keep): (Vec<EuiEntry>, Vec<EuiEntry>) = std::mem::take(&mut self.enhanced)
            .into_iter()
            .partition(|e| idle(e, &self.meeting_seen));
        self.enhanced = keep;
        for entry in gone {
            self.meeting_seen.remove(&entry.pid);
            if reset_enhanced(entry)
                && let Some(m) = &self.marker
            {
                let _ = eui::remove(m, entry.pid);
            }
        }
    }

    /// Đọc tên tắt: trả EUI, không đọc gì.
    pub fn idle(&mut self) -> Sample {
        self.release_all();
        empty(ReaderStatus::Off, None, Pass::Idle)
    }

    fn scan(&mut self) {
        self.last_scan = Some(Instant::now());
        let pids = list_pids();
        let alive: std::collections::HashSet<i32> = pids.iter().copied().collect();
        self.procs.retain(|pid, _| alive.contains(pid));
        let mut running = Vec::new();
        for pid in pids {
            let Some(path) = pid_path(pid) else { continue };
            let entry = self.procs.entry(pid).or_insert_with(|| (PathBuf::new(), None));
            if entry.0 != path {
                *entry = (path.clone(), identify(&path));
            }
            if let Some((app, version)) = &entry.1
                && self.only.is_none_or(|o| o == *app)
                && self.recipes.app(Os::Macos, *app).is_some()
            {
                running.push((pid, *app, version.clone()));
            }
        }
        running.sort_by_key(|r| MeetingApp::ALL.iter().position(|a| *a == r.1));
        self.running = running;
    }

    /// Cửa sổ họp của app đầu tiên (theo ưu tiên) có cửa sổ họp; giữ trạng thái của cửa sổ còn đó.
    fn refresh_target(&mut self) {
        let previous = self.target.take();
        let mut old_windows = Vec::new();
        let mut old_pid = None;
        if let Some(t) = previous {
            old_pid = Some(t.pid);
            old_windows = t.windows;
        }
        let recipes = self.recipes.clone();
        for (pid, app, version) in self.running.clone() {
            let Some(recipe) = recipes.app(Os::Macos, app) else {
                continue;
            };
            let Some(element) = AxNode::app(pid) else { continue };
            let mut nodes: Vec<(AxNode, String, String, bool)> = element
                .elements("AXWindows")
                .into_iter()
                .filter_map(|w| {
                    let title = w.string("AXTitle").unwrap_or_default();
                    let ident = w.string("AXIdentifier").unwrap_or_default();
                    // Chỉ đọc AXSubrole khi công thức có luật vai trò phụ (không thêm lệnh Accessibility cho app khác).
                    let subrole = if recipe.window_subrole.is_empty() {
                        String::new()
                    } else {
                        w.string("AXSubrole").unwrap_or_default()
                    };
                    let subrole_only = !is_meeting_window(recipe, &title, &ident, "");
                    is_meeting_window(recipe, &title, &ident, &subrole).then_some((w, title, subrole, subrole_only))
                })
                .collect();
            // Cửa sổ khớp tiêu đề hay id đứng trước cửa sổ chỉ khớp vai trò phụ: hạn mức `MAX_WINDOWS` không được cắt mất cửa sổ họp
            // "Meeting with…" vì cửa sổ chính hay cửa sổ chat rời đứng trước nó trong `AXWindows` (sắp xếp ổn định).
            nodes.sort_by_key(|n| n.3);
            nodes.truncate(MAX_WINDOWS);
            if nodes.is_empty() {
                continue;
            }
            if recipe.enhanced_ui {
                self.enable_enhanced(pid, app, &element);
            }
            let windows = nodes
                .into_iter()
                .map(|(node, title, subrole, subrole_only)| {
                    let kept = (old_pid == Some(pid))
                        .then(|| old_windows.iter().position(|w| w.node.0 == node.0))
                        .flatten();
                    match kept {
                        Some(i) => Window {
                            title,
                            subrole,
                            subrole_only,
                            ..old_windows.swap_remove(i)
                        },
                        None => Window {
                            node,
                            title,
                            subrole,
                            subrole_only,
                            probed_no_meeting: None,
                            ever_confirmed: false,
                            walk: None,
                            tiles: Vec::new(),
                            last_full: None,
                            stale: true,
                            next: 0,
                        },
                    }
                })
                .collect();
            self.target = Some(Target {
                pid,
                app,
                version,
                windows,
            });
            return;
        }
    }

    /// Đặt `AXEnhancedUserInterface` (spec §6.2): chỉ khi đang `false`; ghi dấu trước (QĐ 8).
    fn enable_enhanced(&mut self, pid: i32, app: MeetingApp, element: &AxNode) {
        self.meeting_seen.insert(pid, Instant::now());
        if self.enhanced.iter().any(|e| e.pid == pid) {
            return;
        }
        if !eui::should_enable(element.read_eui()) {
            // Đã bật bởi công nghệ trợ năng khác (VoiceOver…), hay không đọc được (treo, lỗi, quá hạn chờ): không giành, không đặt,
            // không ghi dấu, không trả (rà soát đợt A, A6).
            return;
        }
        let entry = EuiEntry { pid, app };
        if let Some(m) = &self.marker
            && let Err(e) = eui::add(m, entry)
        {
            eprintln!(
                "speaker-worker: không ghi được dấu chế độ trợ năng ({:?}), không bật",
                e.kind()
            );
            return;
        }
        element.set_bool(EUI, true);
        self.enhanced.push(entry);
    }

    /// Một lượt đọc. Một ngân sách (≤ [`MAX_ELEMENTS`] lệnh, ≤ [`PASS_BUDGET`]) cho cả lượt: duyệt cửa sổ, lấy mẫu mọi ô, ứng viên
    /// (QĐ 13); hết thì lượt sau đọc tiếp (lượt đầy đủ từ phần tử chưa duyệt, lượt nhanh từ ô chưa đọc).
    pub fn tick(&mut self, calibrate: bool) -> Sample {
        let started = Instant::now();
        let at = unix_ms();
        self.tree.reads = 0;
        self.tree.timeouts = 0;
        let rescan = self.last_scan.is_none_or(|t| t.elapsed() >= SCAN_EVERY);
        if rescan {
            self.scan();
        }
        let Some(&(_, first_app, _)) = self.running.first() else {
            self.target = None;
            self.release_idle_browsers();
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        // Chỉ gọi khi có app họp đang chạy.
        if !trusted() {
            self.target = None;
            return self.finish(
                empty(ReaderStatus::NoPermission, Some(first_app), Pass::Idle),
                at,
                started,
            );
        }
        if !self.restored {
            self.restored = true;
            self.restore_leftovers();
        }
        if rescan || self.target.is_none() {
            self.refresh_target();
        }
        if let Some(t) = &self.target {
            self.meeting_seen.insert(t.pid, Instant::now());
        }
        self.release_idle_browsers();
        let recipes = self.recipes.clone();
        let Some(target) = self.target.as_mut() else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let Some(recipe) = recipes.app(Os::Macos, target.app) else {
            return self.finish(empty(ReaderStatus::NoMeeting, None, Pass::Idle), at, started);
        };
        let mut budget = Budget::new(MAX_ELEMENTS, PASS_BUDGET);
        let mut tiles: Vec<TileSample> = Vec::new();
        let mut full = false;
        for (k, w) in target.windows.iter_mut().enumerate() {
            if w.subrole_only
                && w.walk.is_none()
                && w.probed_no_meeting
                    .as_ref()
                    .is_some_and(|(at, title)| at.elapsed() < SUBROLE_REPROBE && *title == w.title)
            {
                continue;
            }
            let due = w.stale || w.walk.is_some() || w.last_full.is_none_or(|t| t.elapsed() >= FULL_EVERY);
            if due && !budget.exhausted() {
                full = true;
                let walk = w
                    .walk
                    .get_or_insert_with(|| Walk::new(w.node.clone(), k as u32, recipe.web_only));
                if let Some(found) = walk.step(&mut self.tree, recipe, &mut budget) {
                    w.ever_confirmed |= walk.confirmed();
                    w.probed_no_meeting = (w.subrole_only && recipe.confirm_id.is_some() && !w.ever_confirmed)
                        .then(|| (Instant::now(), w.title.clone()));
                    w.tiles = found;
                    w.walk = None;
                    w.last_full = Some(Instant::now());
                    w.stale = false;
                    w.next = 0;
                }
            }
            let round = sample_round(&mut self.tree, &w.tiles, recipe, w.next, calibrate, &mut budget);
            w.next = round.next;
            w.stale |= round.gone;
            tiles.extend(round.samples);
        }
        let (app, version) = (target.app, target.version.clone());
        self.failures = if self.tree.timeouts > 0 { self.failures + 1 } else { 0 };
        let status = if self.failures >= BLOCKED_AFTER {
            ReaderStatus::Blocked
        } else {
            ReaderStatus::Ok
        };
        let sample = Sample {
            app_version: version,
            tiles,
            ..empty(status, Some(app), if full { Pass::Full } else { Pass::Fast })
        };
        self.finish(sample, at, started)
    }

    fn finish(&mut self, mut s: Sample, at: u64, started: Instant) -> Sample {
        s.at_unix_ms = at;
        s.pass_ms = started.elapsed().as_secs_f32() * 1000.0;
        s.elements = self.tree.reads;
        if let Some(line) = self.stats.add(s.pass, s.pass_ms, s.elements, Instant::now()) {
            eprintln!("{line}");
        }
        s
    }

    /// Số lệnh quá hạn chờ 0,2 s ở lượt vừa đọc (`ax-record stats`, Task 20).
    pub fn timeouts(&self) -> u32 {
        self.tree.timeouts
    }

    /// Cây của các cửa sổ họp đang đọc, định dạng fixture (`ax-record fixture`; có chữ của app họp).
    pub fn dump_windows(&mut self) -> Vec<String> {
        let recipes = self.recipes.clone();
        let Some(target) = &self.target else { return Vec::new() };
        let Some(recipe) = recipes.app(Os::Macos, target.app) else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for w in &target.windows {
            out.extend(dump_lines(&mut self.tree, &w.node, &w.title, &w.subrole, recipe));
        }
        out
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

/// Đặt lại `AXEnhancedUserInterface = false` nếu pid còn là đúng app đó (không đụng tiến trình khác dùng lại pid) và giá trị đang
/// bật (`eui::step_for`). `true` khi mục này xong việc (đọc được mà không phải bật, đã trả được, hay pid không còn là app đó) và được
/// bỏ khỏi file dấu; `false` khi không đọc được (app họp treo quá hạn chờ) hay đặt không được: giữ dấu, lần sau thử lại.
fn reset_enhanced(entry: EuiEntry) -> bool {
    let same = pid_path(entry.pid)
        .and_then(|p| identify(&p))
        .is_some_and(|(app, _)| app == entry.app);
    if !same {
        return true;
    }
    let Some(el) = AxNode::app(entry.pid) else { return false };
    match eui::step_for(el.read_eui()) {
        eui::EuiStep::Drop => true,
        eui::EuiStep::Keep => false,
        eui::EuiStep::Reset => {
            el.set_bool(EUI, false);
            eui::reset_done(el.read_eui())
        }
    }
}

/// Chạy bộ đọc trên luồng riêng, QoS `utility`. Nhịp theo `Control` (QĐ 13); giữa hai lượt luồng ngủ bằng `next_turn` (thức khi tới
/// lượt, khi bật hay tắt "Lấy tên", khi dừng; đổi nhịp chỉ tính lại hạn; QĐ 27). "Lấy tên" tắt hay tạm dừng: trả `AXEnhancedUserInterface`, gửi một mẫu `Off`,
/// rồi ngủ không hạn tới khi trạng thái đổi. Dừng khi `stop` hay khi luồng chính thôi nhận mẫu, trả EUI trước khi dừng.
pub fn spawn(setup: ReaderSetup, control: Arc<Control>, mut sink: SampleSink) -> Option<JoinHandle<()>> {
    std::thread::Builder::new()
        .name("speaker-reader".into())
        .spawn(move || {
            crate::platform::utility_qos_for_this_thread();
            set_process_timeout();
            let mut reader = LiveReader::new(setup.recipes, setup.eui_marker, None);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_process_of_an_app_points_at_its_bundle() {
        let teams = Path::new("/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams");
        assert_eq!(
            bundle_dir_of(teams),
            Some(Path::new("/Applications/Microsoft Teams.app"))
        );
        let helper = Path::new(
            "/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/1/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)",
        );
        assert!(
            bundle_dir_of(helper)
                .unwrap()
                .ends_with("Google Chrome Helper (Renderer).app"),
            "tiến trình phụ ra gói của nó (bundle id khác, bị bỏ)"
        );
        assert_eq!(bundle_dir_of(Path::new("/usr/bin/say")), None);
        assert_eq!(bundle_dir_of(Path::new("/x/Tool.app/Contents/Resources/tool")), None);
    }

    /// Spec §6.1: chỉ app trong danh sách viết cứng (bundle id), không phụ thuộc tên thư mục.
    #[test]
    fn only_hard_coded_bundle_ids_are_meeting_apps() {
        assert_eq!(app_of_bundle_id("com.microsoft.teams2"), Some(MeetingApp::Teams));
        assert_eq!(app_of_bundle_id("com.google.Chrome"), Some(MeetingApp::MeetChrome));
        assert_eq!(app_of_bundle_id("com.google.Chrome.helper.renderer"), None);
        assert_eq!(app_of_bundle_id("com.apple.Safari"), None);
    }
}
