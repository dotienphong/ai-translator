//! App giả cho `tests/windows_real.rs`: một tiến trình Windows thật có cửa sổ cấp cao nhất hiện với tiêu đề cho trước, và tùy chọn sinh một
//! tiến trình con (không cửa sổ). Test chép file này thành `ms-teams.exe`, `Zoom.exe`, `chrome.exe`… rồi chạy, để kiểm bằng cửa sổ, tiến
//! trình và cây tiến trình **thật** của Windows (không dùng bàn làm việc giả).
//!
//!     fake_app <tiêu đề, hay - nếu không có cửa sổ> [<đường dẫn app con>]

#[cfg(not(windows))]
fn main() {
    eprintln!("chỉ chạy trên Windows");
}

#[cfg(windows)]
fn main() {
    use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, MSG, RegisterClassW, TranslateMessage,
        WINDOW_EX_STYLE, WNDCLASSW, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
    };
    use windows::core::{PCWSTR, w};

    unsafe extern "system" fn wndproc(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        // SAFETY: chuyển nguyên các tham số cho xử lý mặc định.
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }

    let args: Vec<String> = std::env::args().collect();
    let title = args.get(1).cloned().unwrap_or_else(|| "-".into());
    // Tiến trình con: một bản của chính file này, không cửa sổ; cha giữ nó sống tới khi bị giết.
    let _child = args
        .get(2)
        .and_then(|path| std::process::Command::new(path).arg("-").spawn().ok());
    if title == "-" {
        // Không cửa sổ: ngủ tới khi bị giết.
        loop {
            std::thread::sleep(std::time::Duration::from_secs(3600));
        }
    }
    // SAFETY: các lệnh Win32 tạo và bơm tin nhắn cho một cửa sổ của chính tiến trình này; chuỗi tiêu đề sống hơn lệnh gọi.
    unsafe {
        let module = match GetModuleHandleW(PCWSTR::null()) {
            Ok(m) => m,
            Err(_) => std::process::exit(2),
        };
        let instance = HINSTANCE(module.0);
        let class = w!("FakeMeetingApp");
        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: instance,
            lpszClassName: class,
            ..Default::default()
        };
        if RegisterClassW(&wc) == 0 {
            std::process::exit(3);
        }
        let title16: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        if CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class,
            PCWSTR(title16.as_ptr()),
            WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            100,
            100,
            480,
            320,
            None,
            None,
            Some(instance),
            None,
        )
        .is_err()
        {
            std::process::exit(4);
        }
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}
