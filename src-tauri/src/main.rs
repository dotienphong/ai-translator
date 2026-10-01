// Bản phát hành trên Windows không mở cửa sổ console.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    meeting_translator_lib::run();
}
