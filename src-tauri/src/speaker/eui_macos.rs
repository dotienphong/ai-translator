//! Trả `AXEnhancedUserInterface` mà `speaker-worker` đã bật cho Teams, Chrome, Edge nếu lần chạy trước bị giết giữa chừng (spec
//! 2026-10-26-phan-biet-nguoi-noi §6.2 "lần mở app sau"; QĐ 8, 28 của kế hoạch 04): **chỉ khi app có quyền Trợ năng** (chưa có thì
//! không gọi API Trợ năng nào, giữ nguyên file dấu); với mỗi pid còn là đúng app (bundle id) thì đặt lại `false` và đọc lại; chỉ bỏ
//! khỏi dấu mục đã trả được hay mục mà pid không còn là đúng app. Gọi một lần lúc mở app, trên luồng nền. Không đọc cây, không đọc
//! chữ. `AXIsProcessTrusted` chỉ hỏi trạng thái, không hiện hộp hỏi quyền (khác `AXIsProcessTrustedWithOptions` có tùy chọn hỏi).

use std::path::{Path, PathBuf};

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::bundle::{CFBundle, CFBundleGetIdentifier};
use core_foundation::string::{CFString, CFStringRef};
use core_foundation::url::CFURL;
#[cfg(test)]
use speaker_protocol::MeetingApp;
use speaker_protocol::{EuiEntry, EuiMarker};

// `compose/native_macos.rs` khai báo cùng hàm `AXIsProcessTrusted` với kiểu trả về `bool`; ở đây giữ `u8` (đúng `Boolean` của header,
// không giả định giá trị chỉ 0 hay 1), nên tắt lint khai báo extern khác chữ ký.
#[allow(clashing_extern_declarations)]
#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    /// `Boolean` (unsigned char) của header, không phải `bool`.
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: *mut CFTypeRef) -> i32;
    fn AXUIElementSetAttributeValue(element: CFTypeRef, attribute: CFStringRef, value: CFTypeRef) -> i32;
}

/// `…/X.app/Contents/MacOS/X` → `…/X.app` (như `speaker_worker::reader::macos::bundle_dir_of`; app không liên kết worker).
fn bundle_dir_of(exe: &Path) -> Option<&Path> {
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

fn bundle_id_of_pid(pid: i32) -> Option<String> {
    let mut buf = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: bộ đệm đủ `PROC_PIDPATHINFO_MAXSIZE` byte.
    let len = unsafe { libc::proc_pidpath(pid, buf.as_mut_ptr().cast(), buf.len() as u32) };
    if len <= 0 {
        return None;
    }
    buf.truncate(len as usize);
    let path = PathBuf::from(String::from_utf8(buf).ok()?);
    let bundle = CFBundle::new(CFURL::from_path(bundle_dir_of(&path)?, true)?)?;
    // SAFETY: luật get: chuỗi thuộc gói đang giữ.
    let id = unsafe { CFBundleGetIdentifier(bundle.as_concrete_TypeRef()) };
    (!id.is_null()).then(|| unsafe { CFString::wrap_under_get_rule(id) }.to_string())
}

/// Trả các mục còn sót khi app có quyền Trợ năng; trả số app đã đặt lại. Chưa có quyền: không làm gì, giữ file dấu.
pub fn restore(marker: &Path) -> usize {
    // SAFETY: hàm của ApplicationServices, không tham số; chỉ hỏi trạng thái quyền.
    if unsafe { AXIsProcessTrusted() } == 0 {
        return 0;
    }
    restore_with(marker, reset)
}

/// Đọc file dấu, gọi `reset` cho từng mục (`None`: pid không còn là đúng app; `Some(true)`: đã trả; `Some(false)`: trả không được),
/// ghi lại các mục trả không được; không còn mục nào thì xóa file. Trả số app đã đặt lại.
fn restore_with(marker: &Path, reset: impl Fn(EuiEntry) -> Option<bool>) -> usize {
    let entries = std::fs::read(marker)
        .ok()
        .and_then(|b| serde_json::from_slice::<EuiMarker>(&b).ok())
        .map(|m| m.entries)
        .unwrap_or_default();
    let mut restored = 0;
    let mut keep = Vec::new();
    for e in entries {
        match reset(e) {
            Some(true) => restored += 1,
            Some(false) => keep.push(e),
            None => {}
        }
    }
    if keep.is_empty() {
        let _ = std::fs::remove_file(marker);
    } else if let Ok(body) = serde_json::to_vec(&EuiMarker { entries: keep }) {
        let _ = std::fs::write(marker, body);
    }
    restored
}

/// Kết quả đọc `AXEnhancedUserInterface` (cùng luật với `speaker_worker::reader::eui::EuiRead`; app không liên kết worker).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Read {
    /// Đang bật.
    On,
    /// Đọc được mà không phải bật (`false`, hay không có giá trị Boolean).
    NotOn,
    /// Không đọc được (app họp treo quá hạn chờ, lỗi).
    Unknown,
}

/// Giá trị `AXEnhancedUserInterface` của phần tử, ba kết quả.
fn read_eui(el: &CFType, attr: &CFString) -> Read {
    let mut v: CFTypeRef = std::ptr::null();
    // SAFETY: phần tử và tên sống tới hết lời gọi; `v` theo luật copy (+1) hay NULL.
    let err = unsafe { AXUIElementCopyAttributeValue(el.as_CFTypeRef(), attr.as_concrete_TypeRef(), &mut v) };
    if err != 0 {
        return Read::Unknown;
    }
    if v.is_null() {
        return Read::NotOn;
    }
    // SAFETY: `v` là tham chiếu +1 vừa nhận.
    let on = unsafe { CFType::wrap_under_create_rule(v) }
        .downcast::<CFBoolean>()
        .map(bool::from)
        == Some(true);
    if on { Read::On } else { Read::NotOn }
}

/// Việc với một mục theo lần đọc trước khi trả (kết quả cho `restore_with`): không phải bật thì xong, bỏ mục (`None`), không đặt gì;
/// không đọc được (app treo) thì giữ mục, thử lại lần sau (`Some(false)`); đang bật thì `Some(true)`: cần đặt lại.
fn before_reset(read: Read) -> Option<bool> {
    match read {
        Read::On => Some(true),
        Read::NotOn => None,
        Read::Unknown => Some(false),
    }
}

/// Đặt lại `AXEnhancedUserInterface = false` cho một mục rồi đọc lại, chỉ khi đang bật (cùng luật với worker; rà soát lần 2 B-N-D,
/// lần 3): đọc được mà không phải bật thì mục xong việc (`None`, bỏ khỏi dấu), không đặt `false` lặp lại mỗi lần mở app; không đọc
/// được (app treo quá hạn chờ) thì giữ mục (`Some(false)`).
fn reset(e: EuiEntry) -> Option<bool> {
    if bundle_id_of_pid(e.pid).as_deref() != Some(e.app.macos_bundle_id()) {
        return None;
    }
    // SAFETY: luật create; NULL khi lỗi.
    let el = unsafe { AXUIElementCreateApplication(e.pid) };
    if el.is_null() {
        return Some(false);
    }
    // SAFETY: `el` là tham chiếu +1 vừa tạo.
    let el = unsafe { CFType::wrap_under_create_rule(el) };
    let attr = CFString::from_static_string("AXEnhancedUserInterface");
    let before = before_reset(read_eui(&el, &attr));
    if before != Some(true) {
        return before;
    }
    // SAFETY: phần tử, tên, giá trị sống tới hết lời gọi. Mã trả về không dùng (−25208 dù đã đặt, `results/teams-chrome.md`): đọc
    // lại để biết.
    unsafe {
        AXUIElementSetAttributeValue(
            el.as_CFTypeRef(),
            attr.as_concrete_TypeRef(),
            CFBoolean::false_value().as_CFTypeRef(),
        )
    };
    Some(read_eui(&el, &attr) == Read::NotOn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_main_process_points_at_its_bundle() {
        let p = Path::new("/Applications/zoom.us.app/Contents/MacOS/zoom.us");
        assert_eq!(bundle_dir_of(p), Some(Path::new("/Applications/zoom.us.app")));
        assert_eq!(bundle_dir_of(Path::new("/usr/bin/true")), None);
    }

    fn write_marker(dir: &Path, pids: &[i32]) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let marker = dir.join("speaker-eui.json");
        let entries = pids
            .iter()
            .map(|&pid| EuiEntry {
                pid,
                app: MeetingApp::Teams,
            })
            .collect();
        std::fs::write(&marker, serde_json::to_vec(&EuiMarker { entries }).unwrap()).unwrap();
        marker
    }

    /// QĐ 28 (rà soát B-Q6): chỉ bỏ khỏi dấu mục đã trả được (pid 1) hay mục mà pid không còn là đúng app (pid 3); mục trả không được
    /// (pid 2: mất quyền giữa chừng) giữ cho lần sau.
    #[test]
    fn restore_keeps_entries_it_could_not_reset() {
        let dir = std::env::temp_dir().join(format!("eui-app-keep-{}", std::process::id()));
        let marker = write_marker(&dir, &[1, 2, 3]);
        let n = restore_with(&marker, |e| match e.pid {
            1 => Some(true),
            2 => Some(false),
            _ => None,
        });
        assert_eq!(n, 1);
        let left = serde_json::from_slice::<EuiMarker>(&std::fs::read(&marker).unwrap())
            .unwrap()
            .entries;
        assert_eq!(left.iter().map(|e| e.pid).collect::<Vec<_>>(), [2]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Rà soát lần 3: ba kết quả đọc trước khi trả; app họp treo quá hạn chờ thì giữ mục để thử lại lần sau.
    #[test]
    fn reads_decide_drop_keep_or_reset() {
        assert_eq!(before_reset(Read::On), Some(true), "đang bật: đặt lại");
        assert_eq!(before_reset(Read::NotOn), None, "không phải bật: bỏ mục, không đặt gì");
        assert_eq!(before_reset(Read::Unknown), Some(false), "không đọc được: giữ mục");
    }

    #[test]
    fn restore_removes_the_marker_when_nothing_is_left() {
        let dir = std::env::temp_dir().join(format!("eui-app-gone-{}", std::process::id()));
        let marker = write_marker(&dir, &[std::process::id() as i32]);
        assert_eq!(restore_with(&marker, |_| None), 0);
        assert!(!marker.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
