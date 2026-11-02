//! Backend WASAPI (Windows) cho [`crate::Ducker`] và cây tiến trình của app (spec 2026-11-02-nghe-dich-truc-tiep §4).
//!
//! - [`WasapiBackend`] liệt kê phiên âm thanh của **cả hai** thiết bị phát mặc định (Console và Communications, như chế độ thu
//!   tự động §6.1) và đổi âm lượng riêng từng phiên (`ISimpleAudioVolume`). Không giữ callback COM nào: mỗi lần hỏi là một lần
//!   liệt kê mới, nên đổi thiết bị phát giữa chừng không để lại giao diện cũ.
//! - COM phải được khởi tạo trên **luồng gọi** (`WasapiBackend::new` gọi `CoInitializeEx`); `Ducker` chạy trọn trên một luồng riêng.
//! - Không `unwrap`/`panic`: mọi lỗi COM thành [`BackendError`] chỉ mang mã HRESULT. Đổi âm lượng một phiên lỗi thì coi như phiên
//!   đã biến mất (`Gone`), không làm hỏng cả đợt.

use crate::{Backend, BackendError, SessionId, SessionInfo};
use std::collections::{HashMap, HashSet};
use windows::Win32::Foundation::{CloseHandle, S_OK};
use windows::Win32::Media::Audio::{
    IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
    eCommunications, eConsole, eRender,
};
use windows::Win32::System::Com::{CLSCTX_ALL, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoTaskMemFree};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::core::{Interface, PWSTR};

fn failed(e: &windows::core::Error) -> BackendError {
    BackendError::Failed(format!("{:#010x}", e.code().0))
}

pub struct WasapiBackend {
    enumerator: IMMDeviceEnumerator,
    volumes: HashMap<SessionId, ISimpleAudioVolume>,
}

impl WasapiBackend {
    /// Khởi tạo COM trên luồng gọi (đã khởi tạo kiểu khác thì dùng nguyên, không coi là lỗi) và mở bộ liệt kê thiết bị.
    pub fn new() -> Result<Self, BackendError> {
        // SAFETY: gọi COM thông thường trên luồng hiện tại; kết quả RPC_E_CHANGED_MODE (luồng đã ở apartment khác) vẫn dùng được.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).map_err(|e| failed(&e))?;
            Ok(Self {
                enumerator,
                volumes: HashMap::new(),
            })
        }
    }

    fn collect(&mut self, role_comms: bool, out: &mut Vec<SessionInfo>, seen: &mut HashSet<String>) {
        // SAFETY: các lời gọi COM dưới đây chỉ đọc; mọi lỗi (thiết bị biến mất giữa chừng) bỏ qua phiên/thiết bị đó.
        unsafe {
            let role = if role_comms { eCommunications } else { eConsole };
            let Ok(device) = self.enumerator.GetDefaultAudioEndpoint(eRender, role) else {
                return;
            };
            let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
                return;
            };
            let Ok(list) = manager.GetSessionEnumerator() else {
                return;
            };
            let Ok(count) = list.GetCount() else { return };
            for i in 0..count {
                let Ok(control) = list.GetSession(i) else { continue };
                let Ok(control2) = control.cast::<IAudioSessionControl2>() else {
                    continue;
                };
                if control2.IsSystemSoundsSession() == S_OK {
                    continue;
                }
                let Ok(raw_id) = control2.GetSessionInstanceIdentifier() else {
                    continue;
                };
                let id = raw_id.to_string().unwrap_or_default();
                CoTaskMemFree(Some(raw_id.0 as *const _));
                if id.is_empty() || !seen.insert(id.clone()) {
                    continue;
                }
                let Ok(pid) = control2.GetProcessId() else { continue };
                let Ok(volume) = control.cast::<ISimpleAudioVolume>() else {
                    continue;
                };
                let (Ok(level), Ok(muted)) = (volume.GetMasterVolume(), volume.GetMute()) else {
                    continue;
                };
                let sid = SessionId(id);
                self.volumes.insert(sid.clone(), volume);
                out.push(SessionInfo {
                    id: sid,
                    pid,
                    exe: exe_of(pid),
                    volume: level,
                    muted: muted.as_bool(),
                });
            }
        }
    }
}

impl Backend for WasapiBackend {
    fn sessions(&mut self) -> Result<Vec<SessionInfo>, BackendError> {
        self.volumes.clear();
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        self.collect(false, &mut out, &mut seen);
        self.collect(true, &mut out, &mut seen);
        Ok(out)
    }

    fn set_volume(&mut self, id: &SessionId, scalar: f32) -> Result<(), BackendError> {
        let Some(volume) = self.volumes.get(id) else {
            return Err(BackendError::Gone);
        };
        // SAFETY: giao diện còn sống (giữ trong `volumes`); phiên đã đóng thì lỗi, coi như đã biến mất.
        unsafe { volume.SetMasterVolume(scalar.clamp(0.0, 1.0), std::ptr::null()) }.map_err(|_| BackendError::Gone)
    }
}

/// Đường dẫn file chạy của tiến trình; rỗng nếu không mở được (tiến trình bảo vệ, đã thoát).
fn exe_of(pid: u32) -> String {
    // SAFETY: tay cầm chỉ để truy vấn tên, đóng ngay; bộ đệm có độ dài khai báo đúng.
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else {
            return String::new();
        };
        let mut buf = vec![0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
        let _ = CloseHandle(handle);
        if ok {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        }
    }
}

/// Pid của tiến trình hiện tại và mọi hậu duệ (WebView2 phát tiếng đọc nằm ở tiến trình con). Không chụp được danh sách tiến
/// trình thì chỉ có pid của chính nó (vẫn an toàn: không hạ nhầm app mình).
pub fn own_process_tree() -> HashSet<u32> {
    let me = std::process::id();
    let mut tree = HashSet::from([me]);
    let mut edges: Vec<(u32, u32)> = Vec::new();
    // SAFETY: duyệt ảnh chụp tiến trình theo đúng giao thức Process32First/Next; tay cầm đóng cuối hàm.
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return tree;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                edges.push((entry.th32ProcessID, entry.th32ParentProcessID));
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    let mut grew = true;
    while grew {
        grew = false;
        for &(pid, parent) in &edges {
            if tree.contains(&parent) && tree.insert(pid) {
                grew = true;
            }
        }
    }
    tree
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Backend;

    #[test]
    fn own_process_tree_contains_self_and_child() {
        let mut child = std::process::Command::new("cmd")
            .args(["/c", "ping -n 6 127.0.0.1 >nul"])
            .spawn()
            .unwrap();
        let tree = own_process_tree();
        let _ = child.kill();
        let _ = child.wait();
        assert!(tree.contains(&std::process::id()));
        assert!(tree.contains(&child.id()));
    }

    #[test]
    fn own_process_tree_excludes_unrelated_pid() {
        // pid 4 (System) không phải hậu duệ của tiến trình test.
        assert!(!own_process_tree().contains(&4));
    }

    #[test]
    #[ignore = "cần thiết bị âm thanh"]
    fn wasapi_lists_sessions_without_error() {
        let mut backend = WasapiBackend::new().unwrap();
        let sessions = backend.sessions().unwrap();
        for s in &sessions {
            assert!((0.0..=1.0).contains(&s.volume), "âm lượng ngoài [0,1]: {}", s.volume);
        }
    }

    #[test]
    #[ignore = "cần thiết bị âm thanh"]
    fn set_volume_on_unknown_session_is_gone() {
        let mut backend = WasapiBackend::new().unwrap();
        let _ = backend.sessions().unwrap();
        assert_eq!(
            backend.set_volume(&crate::SessionId("không-có".into()), 0.5),
            Err(crate::BackendError::Gone)
        );
    }
}
