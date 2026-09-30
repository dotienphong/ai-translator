//! Ca biên cho GapFiller, Mixer2, MonoResampler; chỉ dùng API công khai của crate.
//! Xem số liệu từng ca: cargo test -p audio-capture --test edge -- --nocapture --test-threads=1

use audio_capture::gapfill::{GapFiller, PacketAction};
use audio_capture::mix::Mixer2;
use audio_capture::resample::{MonoResampler, TARGET_RATE};

const HNS: f64 = 10_000_000.0;

// ---------- GapFiller ----------

/// Thiết bị chạy lệch `ppm` so với QPC, phát liên tục gói 480 khung trong `secs` giây.
fn drift_run(ppm: f64, secs: f64) -> (u64, u64, u64) {
    let mut g = GapFiller::new(48_000);
    let real_rate = 48_000.0 * (1.0 + ppm * 1e-6);
    let packets = (secs * real_rate / 480.0) as u64;
    let (mut ins, mut skip, mut events) = (0u64, 0u64, 0u64);
    for k in 0..packets {
        let qpc = 1_000_000_000 + (k as f64 * 480.0 / real_rate * HNS) as u64;
        let a = g.on_packet(qpc, 480);
        if a.silence_before > 0 || a.skip > 0 {
            events += 1;
        }
        ins += a.silence_before as u64;
        skip += a.skip as u64;
    }
    (ins, skip, events)
}

#[test]
fn g1_clock_drift_during_continuous_playback() {
    for ppm in [-500.0, -50.0, 50.0, 500.0] {
        let (ins, skip, events) = drift_run(ppm, 600.0);
        println!(
            "G1 lệch {ppm:>6} ppm, phát liên tục 600 s: chèn {ins} khung im lặng, bỏ {skip} khung thật, {events} lần"
        );
    }
}

#[test]
fn g2_jitter_does_not_accumulate() {
    let mut g = GapFiller::new(48_000);
    let mut seed = 12345u64;
    let (mut ins, mut skip) = (0u64, 0u64);
    for k in 0..60_000u64 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let jitter = ((seed >> 33) % 60_001) as i64 - 30_000; // ±3 ms
        let qpc = (1_000_000_000i64 + k as i64 * 100_000 + jitter) as u64;
        let a = g.on_packet(qpc, 480);
        ins += a.silence_before as u64;
        skip += a.skip as u64;
    }
    println!("G2 jitter ±3 ms, 600 s: chèn {ins}, bỏ {skip}");
    assert_eq!((ins, skip), (0, 0));
}

#[test]
fn g3_onset_after_idle_can_be_dropped() {
    // Im lặng, luồng thu gọi on_idle mỗi 10 ms. Âm thanh bắt đầu ở t = 1000 ms,
    // nhưng gói đầu tiên tới muộn (máy bận): lúc t = 1050 ms luồng thu vẫn chưa thấy gói nào.
    let mut g = GapFiller::new(48_000);
    g.on_packet(0, 480); // next = 10 ms
    let mut idle_total = 0u64;
    let mut t = 20u64;
    while t <= 1050 {
        idle_total += g.on_idle(t * 10_000) as u64;
        t += 10;
    }
    // Gói có âm thanh thật, QPC = 1000 ms, 1010 ms, ... tới hết lượt.
    let mut dropped = 0u64;
    for i in 0..10u64 {
        let a = g.on_packet((1000 + 10 * i) * 10_000, 480);
        dropped += a.skip as u64;
        println!("G3 gói ở {} ms: {a:?}", 1000 + 10 * i);
    }
    println!(
        "G3 im lặng đã chèn: {idle_total} khung; khung âm thanh thật bị bỏ: {dropped} (= {} ms)",
        dropped / 48
    );
}

#[test]
fn g4_long_gap_and_overflow() {
    let mut g = GapFiller::new(48_000);
    g.on_packet(0, 480);
    let hour = 3_600 * 10_000_000u64;
    let a = g.on_packet(hour, 480);
    println!(
        "G4 gói sau 1 giờ không có gói: silence_before = {} khung ({} MB f32 stereo)",
        a.silence_before,
        a.silence_before as u64 * 8 / 1_000_000
    );
    let mut g = GapFiller::new(48_000);
    g.on_packet(0, 480);
    let a = g.on_packet(25 * hour, 480);
    let exact = (25 * hour - 100_000) * 48_000 / 10_000_000;
    println!(
        "G4 gói sau 25 giờ: silence_before = {} (đúng ra {exact}) -> tràn u32",
        a.silence_before
    );
    let mut g = GapFiller::new(48_000);
    g.on_idle(0);
    let f = g.on_idle(25 * hour);
    println!(
        "G4 on_idle sau 25 giờ trả {f} khung (đúng ra {})",
        (25 * hour - 300_000) * 48_000 / 10_000_000
    );
    // to_frames(hns) = hns * rate tràn u64 khi hns > u64::MAX / rate
    println!(
        "G4 hns*rate tràn u64 sau {:.0} ngày ở 192 kHz",
        (u64::MAX / 192_000) as f64 / HNS / 86_400.0
    );
}

#[test]
fn g5_early_packet_within_tolerance_and_overlap() {
    let mut g = GapFiller::new(48_000);
    g.on_packet(1_000_000, 480); // next = 110 ms
    // Gói sớm 15 ms (chồng lên gói trước): trong dung sai, coi là liền mạch.
    println!("G5 gói chồng 15 ms: {:?}", g.on_packet(1_100_000 - 150_000, 480));
    let mut g = GapFiller::new(48_000);
    g.on_packet(1_000_000, 480); // next = 110 ms
    let a = g.on_packet(1_100_000 - 250_000, 480); // sớm 25 ms
    println!("G5 gói sớm 25 ms: {a:?}");
    assert_eq!(
        a,
        PacketAction {
            silence_before: 0,
            skip: 480
        }
    );
}

// ---------- Mixer2 ----------

#[test]
fn m1_long_term_drift() {
    // A: 16000 mẫu/giây, B: chậm hơn 0,1 % (16 mẫu/giây). Đẩy từng khối 20 ms.
    let mut m = Mixer2::new(1_600);
    let (mut acc_a, mut acc_b) = (0.0f64, 0.0f64);
    let (mut pushed_a, mut pushed_b, mut out_len) = (0usize, 0usize, 0usize);
    let mut out = Vec::new();
    let mut max_offset = 0usize;
    for _ in 0..(600 * 50) {
        acc_a += 320.0;
        acc_b += 320.0 * 0.999;
        let na = acc_a as usize - pushed_a;
        let nb = acc_b as usize - pushed_b;
        m.push_a(&vec![0.1; na]);
        m.push_b(&vec![0.2; nb]);
        pushed_a += na;
        pushed_b += nb;
        out.clear();
        m.drain_into(&mut out);
        out_len += out.len();
        max_offset = max_offset.max(pushed_a - out_len);
    }
    println!(
        "M1 600 s: đẩy A {pushed_a}, B {pushed_b}, ra {out_len}; A giữ lại tối đa {max_offset} mẫu ({} ms)",
        max_offset / 16
    );
    assert!(max_offset <= 1_600 + 320);
}

#[test]
fn m2_one_side_silent() {
    let mut m = Mixer2::new(1_600);
    let mut out = Vec::new();
    for _ in 0..100 {
        m.push_a(&[0.3; 320]);
        m.drain_into(&mut out);
    }
    println!(
        "M2 B im hẳn 2 s: ra {} mẫu trên 32000 (A trễ cố định {} mẫu)",
        out.len(),
        32_000 - out.len()
    );
    assert_eq!(out.len(), 32_000 - 1_600);
    // B xuất hiện muộn: mẫu B đầu tiên được cộng với mẫu A cũ 100 ms.
    m.push_b(&[0.5; 320]);
    m.push_a(&[0.3; 320]);
    out.clear();
    m.drain_into(&mut out);
    println!("M2 sau khi B vào: ra {} mẫu, giá trị đầu {}", out.len(), out[0]);
}

#[test]
fn m3_single_side_overshoot_is_not_clamped() {
    let mut m = Mixer2::new(1);
    m.push_a(&[1.2, 1.2, 1.2]);
    let mut out = Vec::new();
    m.drain_into(&mut out);
    println!("M3 phần dư một phía không bị chặn: {out:?}");
}

// ---------- MonoResampler ----------

fn sine(rate: u32, channels: u16, freq: f32, seconds: f32) -> Vec<f32> {
    let n = (rate as f32 * seconds) as usize;
    (0..n)
        .flat_map(|i| {
            let v = 0.5 * (2.0 * std::f32::consts::PI * freq * i as f32 / rate as f32).sin();
            std::iter::repeat_n(v, channels as usize)
        })
        .collect()
}

fn rms(x: &[f32]) -> f32 {
    (x.iter().map(|v| v * v).sum::<f32>() / x.len() as f32).sqrt()
}

#[test]
fn r1_rates_length_level_pitch() {
    for rate in [
        8_000u32, 22_050, 24_000, 32_000, 44_100, 48_000, 88_200, 96_000, 192_000,
    ] {
        let mut r = MonoResampler::new(rate, 2).unwrap();
        let mut out = Vec::new();
        r.process(&sine(rate, 2, 440.0, 2.0), &mut out).unwrap();
        let steady = &out[4_000..];
        let crossings = steady.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count() as f32;
        let hz = crossings / (steady.len() as f32 / 16_000.0);
        println!(
            "R1 {rate:>6} Hz stereo, 2 s: ra {} mẫu (thiếu {} = {:.1} ms), rms {:.4} (kỳ vọng 0.3536), {hz:.1} Hz",
            out.len(),
            32_000 - out.len() as i64,
            (32_000 - out.len() as i64) as f32 / 16.0,
            rms(steady)
        );
    }
}

#[test]
fn r2_frequency_response_near_8k() {
    for rate in [44_100u32, 48_000, 96_000] {
        let mut line = format!("R2 {rate:>6} Hz:");
        for f in [4_000.0f32, 6_000.0, 7_000.0, 7_500.0, 7_900.0] {
            let mut r = MonoResampler::new(rate, 1).unwrap();
            let mut out = Vec::new();
            r.process(&sine(rate, 1, f, 1.0), &mut out).unwrap();
            let g = rms(&out[2_000..14_000]) / (0.5 / 2f32.sqrt());
            line += &format!("  {f} Hz: {:+.1} dB", 20.0 * g.log10());
        }
        // Tần số trên Nyquist của 16 kHz phải bị chặn (alias).
        for f in [9_000.0f32, 12_000.0] {
            if f < rate as f32 / 2.0 {
                let mut r = MonoResampler::new(rate, 1).unwrap();
                let mut out = Vec::new();
                r.process(&sine(rate, 1, f, 1.0), &mut out).unwrap();
                let g = rms(&out[2_000..14_000]) / (0.5 / 2f32.sqrt());
                line += &format!("  alias {f} Hz: {:+.1} dB", 20.0 * g.log10());
            }
        }
        println!("{line}");
    }
}

#[test]
fn r3_group_delay() {
    for rate in [44_100u32, 48_000, 96_000] {
        let mut r = MonoResampler::new(rate, 1).unwrap();
        let n = rate as usize;
        let mut input = vec![0.0f32; n];
        let at = rate as usize / 4; // xung ở 250 ms
        input[at] = 1.0;
        let mut out = Vec::new();
        r.process(&input, &mut out).unwrap();
        let (peak, _) = out.iter().enumerate().fold(
            (0, 0.0f32),
            |(bi, bv), (i, &v)| if v.abs() > bv { (i, v.abs()) } else { (bi, bv) },
        );
        let expected = at as f64 * 16_000.0 / rate as f64;
        println!(
            "R3 {rate:>6} Hz: xung vào ở mẫu 16k {expected:.1}, đỉnh ra ở {peak} -> trễ {:.1} mẫu ({:.2} ms)",
            peak as f64 - expected,
            (peak as f64 - expected) / 16.0
        );
    }
}

#[test]
fn r4_partial_frames_lose_samples() {
    // Stereo 48 kHz đọc từ ring buffer theo khối lẻ (không chia hết cho 2 kênh).
    let input = sine(48_000, 2, 440.0, 2.0);
    let mut whole = Vec::new();
    MonoResampler::new(48_000, 2)
        .unwrap()
        .process(&input, &mut whole)
        .unwrap();
    let mut r = MonoResampler::new(48_000, 2).unwrap();
    let mut chunked = Vec::new();
    let mut fed = 0usize;
    for c in input.chunks(1_001) {
        r.process(c, &mut chunked).unwrap();
        fed += c.len();
    }
    println!(
        "R4 cùng 2 s stereo: một lần ra {} mẫu, theo khối 1001 mẫu ra {} mẫu (đã đưa {fed} mẫu)",
        whole.len(),
        chunked.len()
    );
    // So nội dung: lệch kênh sau mỗi khối lẻ làm gộp (L_n + R_n) thành (R_n + L_{n+1}).
    let n = whole.len().min(chunked.len());
    let max_diff = whole[..n]
        .iter()
        .zip(&chunked[..n])
        .map(|(a, b)| (a - b).abs())
        .fold(0.0f32, f32::max);
    println!("R4 sai khác lớn nhất giữa hai cách: {max_diff:.4}");
    // Với 6 kênh (Windows 5.1), khối 1001 mẫu: mỗi lần mất tới 5 mẫu và lệch khung.
    let input6 = sine(48_000, 6, 440.0, 2.0);
    let mut w6 = Vec::new();
    MonoResampler::new(48_000, 6)
        .unwrap()
        .process(&input6, &mut w6)
        .unwrap();
    let mut r6 = MonoResampler::new(48_000, 6).unwrap();
    let mut c6 = Vec::new();
    for c in input6.chunks(1_001) {
        r6.process(c, &mut c6).unwrap();
    }
    println!("R4 6 kênh: một lần ra {}, theo khối 1001 ra {}", w6.len(), c6.len());
}

#[test]
fn r5_mono_downmix() {
    // L có tiếng, R im: mức giảm một nửa (−6 dB). L = −R: triệt tiêu.
    let l: Vec<f32> = sine(48_000, 1, 440.0, 1.0);
    let lr: Vec<f32> = l.iter().flat_map(|&v| [v, 0.0]).collect();
    let anti: Vec<f32> = l.iter().flat_map(|&v| [v, -v]).collect();
    let mut o1 = Vec::new();
    MonoResampler::new(48_000, 2).unwrap().process(&lr, &mut o1).unwrap();
    let mut o2 = Vec::new();
    MonoResampler::new(48_000, 2).unwrap().process(&anti, &mut o2).unwrap();
    println!(
        "R5 chỉ kênh trái: rms {:.4} (một kênh 0.3536); L = −R: rms {:.6}",
        rms(&o1[2_000..]),
        rms(&o2[2_000..])
    );
    let _ = TARGET_RATE;
}

// ---------- Bảo vệ các bản sửa (có assert; các ca ở trên chỉ in số liệu để đọc bằng --nocapture) ----------

/// GapFiller bám theo QPC: thiết bị lệch đồng hồ khi phát liên tục không được sinh chèn hay bỏ khung.
#[test]
fn guard_gapfiller_clock_drift_never_glitches() {
    for ppm in [-500.0, -50.0, 50.0, 500.0] {
        assert_eq!(drift_run(ppm, 600.0), (0, 0, 0), "lệch {ppm} ppm");
    }
}

/// MonoResampler giữ khung dở giữa các lần gọi: đưa theo khối lẻ cho kết quả y hệt đưa một lần.
#[test]
fn guard_resampler_keeps_partial_frames() {
    for channels in [2u16, 6] {
        let input = sine(48_000, channels, 440.0, 2.0);
        let mut whole = Vec::new();
        MonoResampler::new(48_000, channels)
            .unwrap()
            .process(&input, &mut whole)
            .unwrap();
        let mut r = MonoResampler::new(48_000, channels).unwrap();
        let mut chunked = Vec::new();
        for c in input.chunks(1_001) {
            r.process(c, &mut chunked).unwrap();
        }
        // Không dùng assert_eq! trên cả hai vector: khi lỗi nó in hàng chục nghìn mẫu.
        assert_eq!(chunked.len(), whole.len(), "{channels} kênh: số mẫu ra");
        assert!(chunked == whole, "{channels} kênh: nội dung khác khi đưa theo khối lẻ");
    }
}

/// Bộ lọc chống alias phải phẳng tới 7 kHz và chặn mạnh phần trên Nyquist của 16 kHz.
#[test]
fn guard_resampler_passband_and_alias() {
    let gain_db = |rate: u32, f: f32| {
        let mut r = MonoResampler::new(rate, 1).unwrap();
        let mut out = Vec::new();
        r.process(&sine(rate, 1, f, 1.0), &mut out).unwrap();
        20.0 * (rms(&out[2_000..14_000]) / (0.5 / 2f32.sqrt())).log10()
    };
    for rate in [44_100u32, 48_000, 96_000] {
        for f in [4_000.0f32, 6_000.0, 7_000.0] {
            let g = gain_db(rate, f);
            assert!(g.abs() < 1.0, "{rate} Hz, {f} Hz: {g:+.1} dB");
        }
        for f in [9_000.0f32, 12_000.0] {
            let g = gain_db(rate, f);
            assert!(g < -40.0, "{rate} Hz, alias {f} Hz: {g:+.1} dB");
        }
    }
}
