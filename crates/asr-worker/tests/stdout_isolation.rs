//! `platform::protocol_stdout` (spec §6.4, "Việc cho MVP"): sau khi gọi, mọi thứ in ra stdout đi sang stderr, chỉ khung
//! giao thức còn đi ra stdout gốc.
//!
//! Chạy không qua harness của libtest (`harness = false` trong Cargo.toml), vì test phải đổi fd 1 của chính tiến trình.
//! Tiến trình cha chạy lại chính binary này làm tiến trình con (biến `STDOUT_ISOLATION_CHILD`), rồi kiểm hai luồng ra.

use std::io::Write;
use std::process::Command;

const NOISE: &str = "tiếng ồn của thư viện C";

fn main() {
    if std::env::var_os("STDOUT_ISOLATION_CHILD").is_some() {
        let mut protocol = asr_worker::platform::protocol_stdout().expect("tách được stdout");
        println!("{NOISE}");
        protocol.write_all(b"KHUNG").unwrap();
        protocol.flush().unwrap();
        return;
    }
    let out = Command::new(std::env::current_exe().unwrap())
        .env("STDOUT_ISOLATION_CHILD", "1")
        .output()
        .unwrap();
    assert!(out.status.success(), "tiến trình con lỗi: {out:?}");
    assert_eq!(out.stdout, b"KHUNG", "stdout chỉ còn khung giao thức");
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains(NOISE), "println! phải sang stderr: {stderr:?}");
    println!("test stdout_isolation ... ok");
}
