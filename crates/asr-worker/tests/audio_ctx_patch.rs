//! Bản vá `set_audio_ctx` ở `third_party/` (spec §6.4, "Việc cho MVP"): hàm C trả −1 và bản Rust trả `Err` khi giá trị
//! ngoài `[0, n_audio_ctx]` của model, thay vì lặng lẽ đặt giá trị sai.
//!
//! Cần model thật nên bị bỏ qua mặc định. Chạy:
//! `WHISPER_TEST_MODEL=<gguf/bin whisper> cargo test -p asr-worker --test audio_ctx_patch -- --include-ignored`

use whisper_rs::{WhisperContext, WhisperContextParameters};

#[test]
#[ignore = "cần WHISPER_TEST_MODEL"]
fn out_of_range_audio_ctx_is_rejected() {
    let model = std::env::var("WHISPER_TEST_MODEL").expect("đặt WHISPER_TEST_MODEL");
    let params = WhisperContextParameters {
        use_gpu: false,
        ..Default::default()
    };
    let ctx = WhisperContext::new_with_params(&model, params).expect("nạp được model");
    let mut state = ctx.create_state().expect("tạo được state");
    for ok in [0, 1, 512, 1500] {
        assert!(state.set_audio_ctx(ok).is_ok(), "{ok} phải hợp lệ");
    }
    for bad in [-1, 1501, i32::MAX] {
        assert!(state.set_audio_ctx(bad).is_err(), "{bad} phải bị từ chối");
    }
}
