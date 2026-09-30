//! Ca biên cho GapFiller, Mixer2, MonoResampler; chỉ dùng API công khai của crate.
//! Xem số liệu từng ca: cargo test -p audio-capture --test edge -- --nocapture --test-threads=1

use audio_capture::gapfill::{GapFiller, PacketAction};
use audio_capture::mix::Mixer2;
use audio_capture::resample::{MonoResampler, TARGET_RATE};

// ---------- GapFiller ----------

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

/// Im lặng, luồng thu gọi `on_idle` mỗi 10 ms. Âm thanh bắt đầu ở t = 1000 ms, nhưng gói đầu tiên tới
/// muộn (máy bận): lúc t = 1000 + `late_ms` luồng thu vẫn chưa thấy gói nào. Trả về số khung im lặng đã
/// chèn lúc rảnh và hành động của 10 gói đầu có âm thanh thật (QPC = 1000 ms, 1010 ms, ...).
fn onset_after_idle(late_ms: u64) -> (u64, Vec<PacketAction>) {
    let mut g = GapFiller::new(48_000);
    g.on_packet(0, 480); // next = 10 ms
    let mut idle_total = 0u64;
    let mut t = 20u64;
    while t <= 1000 + late_ms {
        idle_total += g.on_idle(t * 10_000) as u64;
        t += 10;
    }
    let actions = (0..10u64).map(|i| g.on_packet((1000 + 10 * i) * 10_000, 480)).collect();
    (idle_total, actions)
}

#[test]
fn g3_onset_50ms_late_is_not_dropped() {
    let (idle_total, actions) = onset_after_idle(50);
    let dropped: u64 = actions.iter().map(|a| a.skip as u64).sum();
    println!("G3 trễ 50 ms: im lặng đã chèn {idle_total} khung; khung âm thanh thật bị bỏ: {dropped}");
    assert_eq!(dropped, 0, "{actions:?}");
}

#[test]
fn g3b_onset_70ms_late_loses_only_the_first_packet() {
    let (idle_total, actions) = onset_after_idle(70);
    let dropped: u64 = actions.iter().map(|a| a.skip as u64).sum();
    println!(
        "G3b trễ 70 ms: im lặng đã chèn {idle_total} khung; khung âm thanh thật bị bỏ: {dropped} (= {} ms); ba gói đầu: {:?}",
        dropped / 48,
        &actions[..3]
    );
    // Mất tối đa gói đầu (480 khung = 10 ms). Các gói sau chỉ bị bỏ mỗi gói 1 khung để kéo dòng thời
    // gian về, nên tổng trên 10 gói là 480 + 9, không phải 480.
    assert!(actions[0].skip <= 480, "{actions:?}");
    assert!(
        actions[1..].iter().all(|a| a.skip <= 1),
        "chỉ được bỏ 1 khung mỗi gói sau gói đầu: {actions:?}"
    );
    assert!(actions.iter().all(|a| a.silence_before == 0), "{actions:?}");
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
fn m3_single_side_overshoot_is_clamped() {
    let mut m = Mixer2::new(1);
    m.push_a(&[1.2, 1.2, 1.2]);
    let mut out = Vec::new();
    m.drain_into(&mut out);
    println!("M3 phần dư một phía: {out:?}");
    assert_eq!(out, vec![1.0, 1.0]);
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
        let hz = crossings / (steady.len() as f32 / TARGET_RATE as f32);
        let level = rms(steady);
        println!(
            "R1 {rate:>6} Hz stereo, 2 s: ra {} mẫu (thiếu {} = {:.1} ms), rms {level:.4} (kỳ vọng 0.3536), {hz:.1} Hz",
            out.len(),
            32_000 - out.len() as i64,
            (32_000 - out.len() as i64) as f32 / 16.0,
        );
        assert!((level - 0.3536).abs() < 0.002, "{rate} Hz: rms {level:.4}");
        assert!((hz - 440.0).abs() < 1.0, "{rate} Hz: {hz:.1} Hz");
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
        let expected = at as f64 * TARGET_RATE as f64 / rate as f64;
        let delay = peak as f64 - expected;
        let delay_ms = delay * 1_000.0 / TARGET_RATE as f64;
        println!(
            "R3 {rate:>6} Hz: xung vào ở mẫu 16k {expected:.1}, đỉnh ra ở {peak} -> trễ {delay:.1} mẫu ({delay_ms:.2} ms)"
        );
        // Độ trễ của bộ lọc: dương và dưới 16 ms.
        assert!((0.0..=16.0).contains(&delay_ms), "{rate} Hz: trễ {delay_ms:.2} ms");
    }
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
    let (only_left, cancelled) = (rms(&o1[2_000..]), rms(&o2[2_000..]));
    println!("R5 chỉ kênh trái: rms {only_left:.4} (một kênh 0.3536); L = −R: rms {cancelled:.6}");
    assert!((only_left - 0.1768).abs() < 0.002, "chỉ kênh trái: rms {only_left:.4}");
    assert!(cancelled < 1e-4, "L = −R: rms {cancelled:.6}");
}

// ---------- Bảo vệ các bản sửa (mỗi ca dưới đây fail nếu bản sửa tương ứng bị bỏ) ----------

/// Phát liên tục 600 s với thiết bị lệch đồng hồ: chỉ được sửa từng khung một, không có glitch cỡ gói.
#[test]
fn guard_gapfiller_clock_drift_is_corrected_one_frame_at_a_time() {
    for ppm in [-500.0f64, -50.0, 50.0, 500.0] {
        let mut g = GapFiller::new(48_000);
        let rate = 48_000.0 * (1.0 + ppm * 1e-6);
        for k in 0..(600.0 * rate / 480.0) as u64 {
            let a = g.on_packet(1_000_000_000 + (k as f64 * 480.0 / rate * 1e7) as u64, 480);
            assert!(a.silence_before <= 1 && a.skip <= 1, "lệch {ppm} ppm, gói {k}: {a:?}");
        }
    }
}

/// Vòng lặp của Task 7 (tick 10 ms, on_idle khi không có gói): 1000 chu kỳ 1 s có tiếng + 0,5 s im,
/// gói sẵn sàng muộn ngẫu nhiên. Dòng thời gian đã ghi không được trôi khỏi QPC.
#[test]
fn guard_gapfiller_transitions_keep_timeline() {
    const MS: u64 = 10_000;
    for (lat_min, lat_max) in [(0u64, 5u64), (5, 25), (10, 40)] {
        let mut seed = 42u64;
        let mut rnd = |lo: u64, hi: u64| {
            seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            lo + (seed >> 33) % (hi - lo + 1)
        };
        let t0 = 1_000 * MS;
        let (mut packets, mut t) = (Vec::new(), t0);
        for _ in 0..1_000 {
            let end = t + 1_000 * MS;
            let mut q = t;
            while q + 10 * MS <= end {
                packets.push((q, q + 10 * MS + rnd(lat_min, lat_max) * MS));
                q += 10 * MS;
            }
            t = end + 500 * MS + rnd(0, 9) * MS + rnd(0, 9) * 1_000;
        }
        for i in 1..packets.len() {
            packets[i].1 = packets[i].1.max(packets[i - 1].1);
        }
        let mut g = GapFiller::new(48_000);
        let (mut written, mut idx, mut now) = (0u64, 0usize, t0);
        while now <= t {
            let mut got = false;
            while idx < packets.len() && packets[idx].1 <= now {
                let a = g.on_packet(packets[idx].0, 480);
                written += a.silence_before as u64 + 480 - a.skip as u64;
                idx += 1;
                got = true;
            }
            if !got && idx > 0 {
                written += g.on_idle(now) as u64;
            }
            now += 10 * MS;
        }
        let covered_ms = ((now - 10 * MS - 300_000) - t0) as f64 / MS as f64;
        let err_ms = written as f64 / 48.0 - covered_ms;
        assert!(
            err_ms.abs() < 20.0,
            "trễ {lat_min}-{lat_max} ms: dòng thời gian lệch {err_ms:+.1} ms"
        );
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
