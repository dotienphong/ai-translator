//! Đối chiếu với SDK `vieneu` (bản tham chiếu): phân phối ứng viên và cửa sổ phạt lặp.
//! Sinh lại bằng `python3 gen/golden.py` (cần `pip install vieneu`).

use serde::Deserialize;
use tts_worker::rep_history::ChannelWindow;
use tts_worker::sampling::{Params, candidates, sample};

#[derive(Deserialize)]
struct SampleCase {
    logits: Vec<f32>,
    temperature: f32,
    top_k: usize,
    top_p: f32,
    rep_pen: f32,
    prev: Vec<usize>,
    greedy: Option<usize>,
    ids: Option<Vec<usize>>,
    probs: Option<Vec<f32>>,
}

#[derive(Deserialize)]
struct HistCase {
    window: usize,
    seq: Vec<u32>,
    states: Vec<Vec<usize>>,
    lens: Vec<usize>,
}

#[derive(Deserialize)]
struct Golden {
    sample: Vec<SampleCase>,
    hist: Vec<HistCase>,
}

fn golden() -> Golden {
    serde_json::from_str(include_str!("golden.json")).expect("golden.json")
}

#[test]
fn candidate_distribution_matches_reference_sdk() {
    let g = golden();
    let (mut greedy_cases, mut dist_cases) = (0, 0);
    for (n, c) in g.sample.iter().enumerate() {
        let p = Params {
            temperature: c.temperature,
            top_k: c.top_k,
            top_p: c.top_p,
            rep_pen: c.rep_pen,
        };
        if let Some(want) = c.greedy {
            assert!(candidates(&c.logits, &p, &c.prev).is_none(), "ca {n}: phải greedy");
            assert_eq!(sample(&c.logits, &p, &c.prev, 0.5), want, "ca {n}: greedy");
            greedy_cases += 1;
            continue;
        }
        let got = candidates(&c.logits, &p, &c.prev).unwrap_or_else(|| panic!("ca {n}: không được greedy"));
        let (ids, probs) = (c.ids.as_ref().unwrap(), c.probs.as_ref().unwrap());
        assert_eq!(got.ids.len(), ids.len(), "ca {n}: số ứng viên");
        for (i, (a, b)) in got.probs.iter().zip(probs).enumerate() {
            assert!((a - b).abs() < 2e-5, "ca {n} ứng viên {i}: {a} != {b}");
        }
        // Thứ tự mã phải khớp, trừ các mã có xác suất bằng hệt nhau (logit hòa): numpy và Rust xếp chúng khác nhau, và
        // chọn mã nào trong nhóm hòa không đổi phân phối. So sánh theo từng nhóm xác suất bằng nhau.
        let mut start = 0;
        while start < probs.len() {
            let mut end = start + 1;
            while end < probs.len() && probs[end] == probs[start] {
                end += 1;
            }
            let (mut a, mut b) = (got.ids[start..end].to_vec(), ids[start..end].to_vec());
            a.sort_unstable();
            b.sort_unstable();
            assert!(a == b, "ca {n}: tập mã khác nhau ở nhóm [{start}, {end})");
            start = end;
        }
        dist_cases += 1;
    }
    assert!(
        greedy_cases >= 4 && dist_cases >= 20,
        "golden thiếu ca: {greedy_cases}/{dist_cases}"
    );
}

#[test]
fn sliding_window_matches_reference_sdk() {
    let g = golden();
    for (n, c) in g.hist.iter().enumerate() {
        let mut w = ChannelWindow::new(c.window);
        for (i, &code) in c.seq.iter().enumerate() {
            w.add(code);
            assert_eq!(w.codes(), c.states[i], "ca {n} (window {}), bước {i}", c.window);
            assert_eq!(w.len(), c.lens[i]);
        }
    }
}
