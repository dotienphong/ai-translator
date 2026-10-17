//! Gõ dịch (spec 2026-10-17-go-dich-design.md): ô soạn nổi, người dùng gõ tin nhắn bằng tiếng của mình, app dịch rồi dán bản
//! dịch vào ô nhập của app đang dùng.
//!
//! - `target`: ngôn ngữ đích tự động, "tiếng người bên kia" (spec §2.1).
//! - `detect`: nhận diện ngôn ngữ của chữ gõ theo chữ viết (spec §2.2).

pub mod detect;
pub mod target;
