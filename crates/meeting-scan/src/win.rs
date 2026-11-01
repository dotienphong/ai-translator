//! Hàm Win32 thật cho bộ quét cửa sổ họp và bảng tiến trình (spec 2026-11-01-goi-y-bat-dich-khi-hop §3). Chỉ đọc: liệt kê cửa sổ
//! cấp cao nhất, hỏi tiến trình sở hữu và file chạy, đọc tiêu đề (chỉ khi `winscan` cho phép: file chạy trong danh sách viết cứng).
//! Bảng tiến trình chỉ có số hiệu, số hiệu cha và tên file; không đường dẫn, không dòng lệnh.

use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
};
use windows::core::{BOOL, PWSTR};

use crate::procmap::ProcTable;
use crate::winscan::{Desktop, RawWindow};

/// Chữ lấy từ cửa sổ hệ thống cắt ở chừng này ký tự.
const WINDOW_TEXT: usize = 300;
/// Số cửa sổ cấp cao nhất tối đa thu mỗi lần.
const MAX_WINDOWS: usize = crate::winscan::MAX_TOP_WINDOWS;

fn hwnd(id: isize) -> HWND {
    HWND(id as *mut core::ffi::c_void)
}

unsafe extern "system" fn collect(window: HWND, lparam: LPARAM) -> BOOL {
    // SAFETY: `lparam` là con trỏ `Vec<RawWindow>` do `top_windows` truyền và còn sống suốt lệnh `EnumWindows`.
    let list = unsafe { &mut *(lparam.0 as *mut Vec<RawWindow>) };
    if list.len() >= MAX_WINDOWS {
        return false.into();
    }
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

/// Hàm Win32 thật cho [`Desktop`]. Không hỏi phiên bản app (gợi ý bật dịch không cần).
pub struct Win32Desktop;

impl Desktop for Win32Desktop {
    fn top_windows(&mut self) -> Vec<RawWindow> {
        let mut list: Vec<RawWindow> = Vec::new();
        // SAFETY: `collect` chỉ dùng `lparam` như `Vec<RawWindow>`, và `list` sống hơn lệnh gọi. `EnumWindows` trả lỗi khi `collect` dừng
        // sớm (đủ `MAX_WINDOWS`); bỏ qua lỗi đó.
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
            ok.then(|| String::from_utf16_lossy(buf.get(..len as usize).unwrap_or(&[])))
        }
    }

    fn title(&mut self, id: isize) -> String {
        let mut buf = [0u16; 512];
        // SAFETY: bộ đệm đủ chỗ; cửa sổ không còn thì trả 0.
        let n = unsafe { GetWindowTextW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(buf.get(..n).unwrap_or(&[]))
            .chars()
            .take(WINDOW_TEXT)
            .collect()
    }

    fn class_name(&mut self, id: isize) -> String {
        let mut buf = [0u16; 256];
        // SAFETY: như `title`.
        let n = unsafe { GetClassNameW(hwnd(id), &mut buf) }.max(0) as usize;
        String::from_utf16_lossy(buf.get(..n).unwrap_or(&[]))
    }
}

/// Bảng tiến trình đang chạy: số hiệu → (số hiệu cha, tên file chạy). Lỗi thì trả bảng rỗng (không gán được phiên nào; gợi ý rơi về
/// dự phòng của Teams và Zoom).
pub fn process_table() -> ProcTable {
    let mut table = ProcTable::default();
    // SAFETY: ảnh chụp chỉ đọc; `PROCESSENTRY32W::dwSize` đặt đúng cỡ như API yêu cầu; handle đóng ở cuối.
    unsafe {
        let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
            return table;
        };
        let mut entry = PROCESSENTRY32W {
            dwSize: size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                let len = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                table.insert(
                    entry.th32ProcessID,
                    entry.th32ParentProcessID,
                    String::from_utf16_lossy(entry.szExeFile.get(..len).unwrap_or(&[])),
                );
                // Hết danh sách thì trả lỗi `ERROR_NO_MORE_FILES`.
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);
    }
    table
}
