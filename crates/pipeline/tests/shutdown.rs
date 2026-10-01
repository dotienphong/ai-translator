//! `process::begin_shutdown` bật một cờ toàn cục của tiến trình, nên test nằm ở binary riêng: test khác không bị ảnh hưởng.

#![cfg(unix)]

use pipeline::process::{begin_shutdown, configure, kill_all, live, shutting_down, spawn};
use std::path::Path;
use std::process::Command;
use std::time::{Duration, Instant};

fn sleep_cmd() -> Command {
    let mut cmd = Command::new("/bin/sleep");
    cmd.arg("30");
    configure(&mut cmd);
    cmd
}

/// Lúc app thoát: sau `begin_shutdown`, giám sát đang khởi động lại không chạy thêm được tiến trình nào, và `kill_all`
/// dọn hết tiến trình đã chạy.
#[test]
fn after_begin_shutdown_nothing_starts_and_kill_all_cleans_up() {
    let exe = Path::new("/bin/sleep");
    let mut child = spawn(&mut sleep_cmd(), exe).unwrap();
    assert!(!shutting_down());
    begin_shutdown();
    assert!(shutting_down());
    let err = spawn(&mut sleep_cmd(), exe).unwrap_err();
    assert!(err.to_string().contains("đang thoát"), "{err}");
    assert_eq!(live(), [child.id()], "lần chạy bị từ chối không được ghi nhận");
    kill_all();
    let deadline = Instant::now() + Duration::from_secs(5);
    while child.try_wait().unwrap().is_none() {
        assert!(Instant::now() < deadline, "kill_all phải giết tiến trình phụ");
        std::thread::sleep(Duration::from_millis(10));
    }
}
