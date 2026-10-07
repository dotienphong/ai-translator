# third_party

Bản sao đã vá của hai crate, nối vào qua `[patch.crates-io]` trong `Cargo.toml` ở gốc repo.

| Thư mục | Nguồn | Bản vá |
|---|---|---|
| `whisper-rs-sys/` | crates.io `whisper-rs-sys` 0.15.0 (kèm whisper.cpp 1.8.3) | `patches/0001-whisper-cpp-set-audio-ctx.patch` (whisper.cpp và `src/bindings.rs`), `patches/0003-whisper-rs-sys-msvc-optimization-flags.patch` (`build.rs`) |
| `whisper-rs/` | crates.io `whisper-rs` 0.16.0 | `patches/0002-whisper-rs-set-audio-ctx.patch` |

## Vì sao phải vá (spec §6.4)

whisper.cpp chỉ đặt `audio_ctx` bên trong `whisper_full`, và `whisper-rs` không cho lấy con trỏ thô của state.
Bản vá thêm hàm `whisper_set_audio_ctx_with_state` (C) và `WhisperState::set_audio_ctx` (Rust), để `asr-worker`
dùng chung một lượt encode cho cả nhận diện ngôn ngữ và chép lời (`crates/asr-worker/src/shared.rs`).
Khai báo của hàm C cũng được thêm vào `whisper-rs-sys/src/bindings.rs`: whisper-rs-sys dùng file này khi bindgen
không chạy được (ví dụ thiếu libclang), và thiếu khai báo thì whisper-rs đã vá không biên dịch được.

## Vì sao có bản vá 0003 (cờ tối ưu trên MSVC)

Trên Windows (MSVC), crate `cmake` bỏ mọi cờ `/O*` do `cc` sinh ra rồi đặt `CMAKE_<LANG>_FLAGS_RELEASE` bằng phần còn lại.
Việc đó ghi đè mặc định `/O2 /Ob2 /DNDEBUG` của CMake, nên ggml-cpu bị biên dịch không tối ưu. Đo ở Giai đoạn 0 trên
i5-1345U: `asr-worker-cpu` chép một clip 11,5 giây mất khoảng 26 giây (small) thay vì khoảng 1,9 giây sau khi sửa.
Bản Vulkan cũng dính, vì nhận diện ngôn ngữ, tính mel và các phần chạy trên CPU vẫn dùng ggml-cpu. Bản vá thêm
`/O2 /Ob2 /DNDEBUG` qua `cflag`/`cxxflag`, là đường mà crate `cmake` giữ nguyên. Kiểm sau khi build bằng
`CMAKE_C_FLAGS_RELEASE` trong `CMakeCache.txt` của thư mục `out/build`: phải có `/O2`.

## Dựng lại từ đầu

```bash
curl -sSfL -o third_party/whisper-rs-sys-0.15.0.crate https://static.crates.io/crates/whisper-rs-sys/whisper-rs-sys-0.15.0.crate
curl -sSfL -o third_party/whisper-rs-0.16.0.crate https://static.crates.io/crates/whisper-rs/whisper-rs-0.16.0.crate
shasum -a 256 -c - <<'EOF'
6986c0fe081241d391f09b9a071fbcbb59720c3563628c3c829057cf69f2a56f  third_party/whisper-rs-sys-0.15.0.crate
2088172d00f936c348d6a72f488dc2660ab3f507263a195df308a3c2383229f6  third_party/whisper-rs-0.16.0.crate
EOF
tar xzf third_party/whisper-rs-sys-0.15.0.crate -C third_party
tar xzf third_party/whisper-rs-0.16.0.crate -C third_party
rm third_party/whisper-rs-sys-0.15.0.crate third_party/whisper-rs-0.16.0.crate
mv third_party/whisper-rs-sys-0.15.0 third_party/whisper-rs-sys
mv third_party/whisper-rs-0.16.0 third_party/whisper-rs
rm third_party/whisper-rs-sys/.cargo_vcs_info.json third_party/whisper-rs/.cargo_vcs_info.json
git apply --directory=third_party third_party/patches/0001-whisper-cpp-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0002-whisper-rs-set-audio-ctx.patch
git apply --directory=third_party third_party/patches/0003-whisper-rs-sys-msvc-optimization-flags.patch
```

## Khi sửa bản vá hoặc nâng phiên bản

1. Làm lại các bước ở mục trên với phiên bản mới, kể cả hai mã sha256. Bản vá không áp được thì sửa bản vá.
2. Xóa bản build cũ của whisper-rs-sys ở cả hai profile: `cargo clean -p whisper-rs-sys && cargo clean -p whisper-rs-sys --release`.
   build.rs chỉ theo dõi `wrapper.h` và chỉ chép whisper.cpp vào OUT_DIR khi chưa có. `cargo clean -p` không kèm `--release`
   chỉ xóa profile dev, nên binary release (bản dùng để đo) vẫn link whisper.cpp cũ.
3. Chạy lại `asr-eval` ở cả hai chế độ và so với kết quả cũ (bench/phase0).
4. Commit bằng `git add -f third_party`, vì .gitignore của whisper-rs chặn Cargo.lock của nó.
5. Gửi bản vá C lên upstream whisper.cpp. Khi upstream đã có API tương đương thì bỏ thư mục này.
