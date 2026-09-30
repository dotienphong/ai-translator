# third_party

Bản sao đã vá của hai crate, nối vào qua `[patch.crates-io]` trong `Cargo.toml` ở gốc repo.

| Thư mục | Nguồn | Bản vá |
|---|---|---|
| `whisper-rs-sys/` | crates.io `whisper-rs-sys` 0.15.0 (kèm whisper.cpp 1.8.3) | `patches/0001-whisper-cpp-set-audio-ctx.patch` (whisper.cpp và `src/bindings.rs`) |
| `whisper-rs/` | crates.io `whisper-rs` 0.16.0 | `patches/0002-whisper-rs-set-audio-ctx.patch` |

## Vì sao phải vá (spec §6.4)

whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`, và `whisper-rs` không cho lấy con trỏ thô của state.
Bản vá thêm hàm `whisper_set_audio_ctx_with_state` (C) và `WhisperState::set_audio_ctx` (Rust), để `asr-worker`
dùng chung một lượt encode cho cả nhận diện ngôn ngữ và chép lời (`crates/asr-worker/src/shared.rs`).
Khai báo của hàm C cũng được thêm vào `whisper-rs-sys/src/bindings.rs`: whisper-rs-sys dùng file này khi bindgen
không chạy được (ví dụ thiếu libclang), và thiếu khai báo thì whisper-rs đã vá không biên dịch được.

## Dựng lại từ đầu

```bash
curl -sSfL https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate | tar xz -C third_party
curl -sSfL https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate | tar xz -C third_party
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
```

## Khi nâng phiên bản

1. Làm lại các bước trên với phiên bản mới; nếu bản vá không áp được thì sửa bản vá.
2. Chạy lại `asr-eval` ở cả hai chế độ và so với kết quả cũ (bench/phase0).
3. Gửi bản vá C lên upstream whisper.cpp. Khi upstream đã có API tương đương thì bỏ thư mục này.
