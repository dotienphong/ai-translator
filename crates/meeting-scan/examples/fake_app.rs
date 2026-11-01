//! App giả cho `tests/windows_real.rs`: một tiến trình Windows thật có cửa sổ cấp cao nhất hiện với tiêu đề cho trước, và tùy chọn sinh một
//! tiến trình con (không cửa sổ). Test chép file này thành `ms-teams.exe`, `Zoom.exe`, `chrome.exe`… rồi chạy, để kiểm bằng cửa sổ, tiến
//! trình và cây tiến trình **thật** của Windows (không dùng bàn làm việc giả).
//!
//!     fake_app <tiêu đề, hay - nếu không có cửa sổ> [<đường dẫn app con> | tone]
//!
//! `tone` (ở vị trí thứ hai, cho tiến trình không cửa sổ): phát một âm 440 Hz lặp lại ra thiết bị phát mặc định, để có phiên âm thanh thật
//! của chính tiến trình này.

#[cfg(not(windows))]
fn main() {
    eprintln!("chỉ chạy trên Windows");
}

/// Phát âm 440 Hz lặp lại ra thiết bị phát mặc định (winmm `PlaySoundW`), từ file WAV tạm do chính tiến trình tạo.
#[cfg(windows)]
fn play_tone() {
    use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_FILENAME, SND_LOOP};
    use windows::core::PCWSTR;

    const RATE: u32 = 44_100;
    const SECONDS: u32 = 4;
    let samples = RATE * SECONDS;
    let mut wav = Vec::with_capacity(44 + samples as usize * 2);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + samples * 2).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&RATE.to_le_bytes());
    wav.extend_from_slice(&(RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(samples * 2).to_le_bytes());
    for i in 0..samples {
        // 440 Hz, biên độ ~ 0,5 (đỉnh thấy được ở đồng hồ đo).
        let x = (i as f32 * 440.0 * std::f32::consts::TAU / RATE as f32).sin() * 0.5;
        wav.extend_from_slice(&((x * i16::MAX as f32) as i16).to_le_bytes());
    }
    let path = std::env::temp_dir().join(format!("fake-app-tone-{}.wav", std::process::id()));
    if std::fs::write(&path, &wav).is_err() {
        return;
    }
    let path16: Vec<u16> = path
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    // SAFETY: đường dẫn kết thúc bằng NUL và sống hơn lệnh gọi (`SND_ASYNC` đọc file bằng luồng riêng, file còn nguyên).
    let played = unsafe { PlaySoundW(PCWSTR(path16.as_ptr()), None, SND_FILENAME | SND_ASYNC | SND_LOOP) };
    // Ghi kết quả ra file để test in khi cần chẩn đoán.
    let note = format!(
        "PlaySoundW={} file={} bytes={}\n",
        played.as_bool(),
        path.display(),
        wav.len()
    );
    let _ = std::fs::write(
        std::env::temp_dir().join(format!("fake-app-tone-{}.log", std::process::id())),
        note,
    );
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
