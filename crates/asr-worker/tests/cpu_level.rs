//! Mức CPU của whisper.cpp đúng mức đã khóa ở `.cargo/config.toml` (spec §6.12).
//!
//! whisper.cpp link tĩnh nên không chọn biến thể CPU lúc chạy: lệnh nào được biên dịch vào thì máy nào cũng phải có.
//! Khóa mức M1 trên arm64 (`armv8.4-a+fp16`, không i8mm, không SME) và AVX2 trên x64 (không AVX-512). Test đọc
//! `system_info` của chính bản build, nên bắt được cả trường hợp biến môi trường của shell hay của CI ghi đè cấu hình.

#[test]
fn whisper_cpu_level_is_the_pinned_baseline() {
    let info = whisper_rs::print_system_info().to_string();

    // Lệnh vượt mức đã khóa: máy cũ chạy vào là lỗi lệnh không hợp lệ (crash), không phải chậm đi.
    for banned in ["AVX512", "AVX_VNNI", "AVX512_VNNI", "MATMUL_INT8", "SME", "SVE"] {
        assert!(
            !info.contains(&format!("| {banned} = 1")) && !info.contains(&format!(": {banned} = 1")),
            "bản build dùng lệnh {banned}, vượt mức CPU đã khóa ở .cargo/config.toml: {info}"
        );
    }

    #[cfg(target_arch = "aarch64")]
    let needed = ["NEON = 1", "FP16_VA = 1", "DOTPROD = 1"];
    #[cfg(target_arch = "x86_64")]
    let needed = ["AVX = 1", "AVX2 = 1", "BMI2 = 1", "FMA = 1", "F16C = 1"];
    for flag in needed {
        assert!(
            info.contains(flag),
            "bản build thiếu {flag}, thấp hơn mức CPU đã khóa ở .cargo/config.toml: {info}"
        );
    }
}
