//! Phần phụ thuộc hệ điều hành của `speaker-worker` (spec 2026-10-26-phan-biet-nguoi-noi §4.1, §10.2). `protocol_stdout` và
//! `harden_dll_search` chép từ `asr_worker::platform` (không dùng chung được: crate đó link whisper.cpp và ggml, mà worker này
//! không được chứa ggml).
//!
//! - `lower_priority`: macOS `setpriority(PRIO_PROCESS, 0, 10)` và QoS `utility` cho luồng gọi; Windows
//!   `BELOW_NORMAL_PRIORITY_CLASS` cho cả tiến trình.
//! - `init_compute_pool`: dựng pool rayon toàn cục một lần, trước mọi phép tính; số luồng theo `RAYON_NUM_THREADS` mà app đặt lúc
//!   chạy worker (rayon đọc biến này lúc tạo pool; candle-core 0.11 đọc nó ở mỗi lần nhân ma trận). Mỗi luồng của pool đặt QoS
//!   `utility` (macOS). Không gọi `Device::with_context`: pool riêng của candle-core tự đặt QoS user-interactive
//!   (results/ram.md, mục "Ghi cho kế hoạch 02").

use std::fs::File;
use std::io;

/// Trả `File` ghi vào stdout gốc (pipe giao thức với app); từ đây mọi thứ in ra stdout, kể cả `println!`, đi sang stderr.
#[cfg(unix)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::fd::FromRawFd;
    // SAFETY: `dup` và `dup2` chỉ thao tác trên bảng fd của tiến trình. `fd` mới thuộc quyền `File` trả về.
    unsafe {
        let fd = libc::dup(libc::STDOUT_FILENO);
        if fd < 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(libc::STDERR_FILENO, libc::STDOUT_FILENO) < 0 {
            let err = io::Error::last_os_error();
            libc::close(fd);
            return Err(err);
        }
        Ok(File::from_raw_fd(fd))
    }
}

#[cfg(windows)]
mod win {
    use std::ffi::c_void;

    pub type Handle = *mut c_void;
    pub const STD_OUTPUT_HANDLE: u32 = -11i32 as u32;
    pub const STD_ERROR_HANDLE: u32 = -12i32 as u32;
    pub const DUPLICATE_SAME_ACCESS: u32 = 0x0000_0002;
    pub const LOAD_LIBRARY_SEARCH_APPLICATION_DIR: u32 = 0x0000_0200;
    pub const LOAD_LIBRARY_SEARCH_SYSTEM32: u32 = 0x0000_0800;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        pub fn GetStdHandle(which: u32) -> Handle;
        pub fn SetStdHandle(which: u32, handle: Handle) -> i32;
        pub fn GetCurrentProcess() -> Handle;
        pub fn DuplicateHandle(
            source_process: Handle,
            source: Handle,
            target_process: Handle,
            target: *mut Handle,
            access: u32,
            inherit: i32,
            options: u32,
        ) -> i32;
        pub fn SetDefaultDllDirectories(flags: u32) -> i32;
    }
}

/// Bản Windows: sao handle của pipe stdout cho giao thức; CRT fd 1 và handle chuẩn của Win32 đều trỏ sang stderr.
#[cfg(windows)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::windows::io::FromRawHandle;
    // SAFETY: chỉ đọc hay đổi bảng handle của chính tiến trình; `copy` là handle mới, thuộc quyền `File` trả về.
    unsafe {
        let original = win::GetStdHandle(win::STD_OUTPUT_HANDLE);
        let process = win::GetCurrentProcess();
        let mut copy: win::Handle = std::ptr::null_mut();
        if win::DuplicateHandle(process, original, process, &mut copy, 0, 0, win::DUPLICATE_SAME_ACCESS) == 0 {
            return Err(io::Error::last_os_error());
        }
        if libc::dup2(2, 1) < 0 {
            return Err(io::Error::last_os_error());
        }
        if win::SetStdHandle(win::STD_OUTPUT_HANDLE, win::GetStdHandle(win::STD_ERROR_HANDLE)) == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(File::from_raw_handle(copy))
    }
}

/// Windows: bỏ thư mục hiện tại và `PATH` khỏi đường tìm DLL (spec §10.2). Gọi đầu tiên trong `main`.
#[cfg(windows)]
pub fn harden_dll_search() -> io::Result<()> {
    // SAFETY: chỉ đổi cờ tìm DLL của tiến trình.
    let ok = unsafe {
        win::SetDefaultDllDirectories(win::LOAD_LIBRARY_SEARCH_APPLICATION_DIR | win::LOAD_LIBRARY_SEARCH_SYSTEM32)
    };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

/// Đặt QoS `utility` cho luồng đang chạy (macOS); nền tảng khác không làm gì.
pub fn utility_qos_for_this_thread() {
    #[cfg(target_os = "macos")]
    // SAFETY: chỉ đổi lớp QoS của chính luồng gọi.
    unsafe {
        libc::pthread_set_qos_class_self_np(libc::qos_class_t::QOS_CLASS_UTILITY, 0);
    }
}

/// Hạ ưu tiên của cả tiến trình (spec §4.1). Lỗi thì chỉ ghi log: worker vẫn chạy được.
pub fn lower_priority() {
    #[cfg(target_os = "macos")]
    {
        // SAFETY: chỉ đổi mức nice của chính tiến trình này.
        if unsafe { libc::setpriority(libc::PRIO_PROCESS, 0, 10) } != 0 {
            eprintln!("speaker-worker: không hạ được ưu tiên: {}", io::Error::last_os_error());
        }
    }
    #[cfg(windows)]
    {
        use windows::Win32::System::Threading::{BELOW_NORMAL_PRIORITY_CLASS, GetCurrentProcess, SetPriorityClass};
        // SAFETY: handle giả của chính tiến trình; chỉ đổi lớp ưu tiên.
        if let Err(e) = unsafe { SetPriorityClass(GetCurrentProcess(), BELOW_NORMAL_PRIORITY_CLASS) } {
            eprintln!("speaker-worker: không hạ được ưu tiên: {e}");
        }
    }
    utility_qos_for_this_thread();
}

/// Dựng pool rayon toàn cục (số luồng theo `RAYON_NUM_THREADS`, QoS `utility`). Gọi một lần, trước mọi phép tính.
pub fn init_compute_pool() -> Result<(), rayon::ThreadPoolBuildError> {
    rayon::ThreadPoolBuilder::new()
        .thread_name(|i| format!("speaker-{i}"))
        .start_handler(|_| utility_qos_for_this_thread())
        .build_global()
}
