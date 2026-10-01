//! Phần phụ thuộc hệ điều hành của `asr-worker`.
//!
//! - `protocol_stdout`: stdout chỉ dành cho khung giao thức (spec §6.4, "Việc cho MVP"). whisper.cpp, ggml hay driver GPU
//!   có thể in ra fd 1 và làm hỏng kênh giao thức, nên worker giữ một bản sao của stdout cho giao thức rồi trỏ fd 1 sang
//!   stderr (log).
//! - `harden_dll_search` (Windows): chỉ nạp DLL từ thư mục của chính worker và System32 (spec §10.2, "Thay tiến trình phụ,
//!   hoặc chèn thư viện giả").

use std::fs::File;
use std::io;

/// Trả `File` ghi vào stdout gốc (pipe giao thức với app), và từ đây mọi thứ in ra stdout, kể cả `println!`, đi sang
/// stderr. Gọi một lần, trước khi nạp model.
#[cfg(unix)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::fd::FromRawFd;
    // SAFETY: `dup` và `dup2` chỉ thao tác trên bảng fd của tiến trình. `fd` mới thuộc quyền `File` trả về, không nơi
    // nào khác đóng nó.
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

/// Bản Windows: sao handle của pipe stdout cho giao thức; CRT fd 1 (nơi `printf` của whisper.cpp ghi) và handle chuẩn
/// của Win32 (nơi `println!` ghi) đều trỏ sang stderr.
#[cfg(windows)]
pub fn protocol_stdout() -> io::Result<File> {
    use std::os::windows::io::FromRawHandle;
    // SAFETY: các hàm Win32 và CRT ở đây chỉ đọc hay đổi bảng handle của chính tiến trình. `copy` là handle mới, thuộc
    // quyền `File` trả về; handle gốc vẫn do CRT giữ và đóng khi `dup2` trỏ fd 1 sang stderr.
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
