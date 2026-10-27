//! Nhúng giọng ERes2Net (3D-Speaker, Apache-2.0) bằng candle-onnx (spec 2026-10-26-phan-biet-nguoi-noi §5.1): fbank đã trừ
//! trung bình → model → vector 192 chiều. Model là bản ONNX của sherpa-onnx đã rút gọn bằng onnxsim (bench/…/prepare_model.py):
//! bản chưa rút gọn có op `ReduceProd`, candle-onnx không chạy được.
//!
//! Bộ nhớ: model chạy từng nút (`onnx_steps`, cách B'), mỗi tensor trung gian bỏ ngay sau lần dùng cuối, trọng số chuyển một lần
//! lúc nạp. Đo trên M4 Pro (results/ram.md): một lần nhúng 8 s ≈ 181–196 MB RSS cả tiến trình; chạy lâu một cuộc họp với A2 4 s
//! (worker chỉ nhúng 4 s đầu mỗi đoạn, spec §5.2) 198–208 MB. Nhúng giống hệt từng bit `simple_eval` cả đồ thị (test
//! `steps_match_simple_eval_on_the_real_model`). `MAX_SAMPLES` (8 s) là lưới an toàn của chính `embed`; giới hạn A2 nằm ở
//! worker và giao thức (`speaker_protocol::MAX_EMBED_SAMPLES`).
//!
//! Stack: nên tạo và dùng `Embedder` trên luồng có stack lớn (worker và test dùng 16 MiB) để phòng xa cho Windows, nơi luồng
//! chính chỉ có 1 MiB.

use std::fmt::Write as _;
use std::fs::File;
use std::io::Read as _;
use std::ops::Range;
use std::path::Path;

use anyhow::{Context, Result, ensure};
use candle_core::{Device, Tensor};
use candle_onnx::onnx::ModelProto;
use prost::Message;
use sha2::{Digest, Sha256};

use crate::fbank::{Fbank, NUM_BINS};
use crate::onnx_steps::StepGraph;

pub const DIM: usize = 192;
/// Ngắn hơn 0,5 s thì không nhúng (spec §5.2); một nguồn sự thật với `SpeakerConfig::validate` (`speaker_protocol::MIN_EMBED_MS`).
pub const MIN_SAMPLES: usize = speaker_protocol::MIN_EMBED_MS as usize * 16;
/// Đoạn dài hơn chỉ lấy 8 s đầu: lưới an toàn của chính `embed` (worker chỉ gửi tối đa 4 s, `speaker_protocol::MAX_EMBED_SAMPLES`).
pub const MAX_SAMPLES: usize = 16_000 * 8;
/// Cỡ tối đa của file model: model ERes2Net hiện là 26 496 496 byte (25,3 MiB). 64 MiB cho dư hơn hai lần, mà vẫn chặn việc
/// đọc nhầm cả một file nhiều GB của kho model (GGUF) vào RAM.
pub const MAX_MODEL_BYTES: u64 = 64 << 20;
/// Đỉnh |đặc trưng| (fbank đã trừ trung bình theo thời gian) dưới mức này thì đoạn không có đặc trưng giọng. Tín hiệu dừng (im
/// lặng, DC, âm tuần hoàn có chu kỳ chia hết bước khung) cho mọi khung giống nhau, nên đặc trưng chỉ còn sai số làm tròn, và mọi
/// đoạn như vậy cho cùng một vector "ma" (hữu hạn, khác 0) mở được một giọng không của ai. Đo ngày 2026-10-26 trên 4 983 đoạn
/// tiếng nói thật ≥ 0,5 s, lấy tối đa 4 s đầu như worker (đoạn VAD của 6 bản ghi AMI và 12 bản ghép Common Voice tiếng Việt, bản
/// thường và bản qua Opus; đoạn RTTM của AMI trên micro đeo đầu và mảng micro xa): đỉnh nhỏ nhất 3,92 (phân vị 1%: 5,49). Tín
/// hiệu dừng: tối đa 8,9e-5 (sóng vuông biên độ tối đa, 8 s). Ngưỡng cao hơn tín hiệu dừng 11 lần và thấp hơn tiếng nói thật gần
/// 4 000 lần; tiếng nói thật giảm 60 dB rồi lượng tử về i16 chỉ bị từ chối khi đã thành im lặng số (đỉnh < 1e-5).
const MIN_FEATURE_PEAK: f32 = 1e-3;
const INPUT: &str = "x";
const OUTPUT: &str = "embedding";

/// Bộ nhúng giọng: đồ thị ERes2Net đã tách từng nút cùng bộ tính fbank. Gọi `embed` lần lượt, không song song.
pub struct Embedder {
    steps: StepGraph,
    fbank: Fbank,
}

impl Embedder {
    /// Đọc file, dựng và chạy thử 1 s, để model sai hay op không được hỗ trợ lộ ra ngay lúc nạp. Không kiểm SHA-256 (công cụ đo,
    /// model dev); worker dùng [`Embedder::load_checked`].
    pub fn load(path: &Path) -> Result<Self> {
        Self::load_checked(path, None)
    }

    /// Như [`Embedder::load`], nhưng khi có `sha256` thì băm đúng các byte vừa đọc và dựng đồ thị từ chính các byte đó: file bị
    /// thay sau lúc app kiểm (spec 2026-10-26-phan-biet-nguoi-noi §10) bị từ chối trước khi tới bộ đọc protobuf.
    pub fn load_checked(path: &Path, sha256: Option<&str>) -> Result<Self> {
        let bytes = read_model(path)?;
        if let Some(expected) = sha256 {
            ensure!(
                sha256_hex(&bytes).eq_ignore_ascii_case(expected),
                "SHA-256 của model khác bản app đã kiểm"
            );
        }
        let model = ModelProto::decode(bytes.as_slice()).context("model nhúng giọng không phải ONNX hợp lệ")?;
        drop(bytes);
        let embedder = Self::from_model(model)?;
        let probe: Vec<f32> = (0..16_000).map(|i| 0.1 * (i as f32 * 0.05).sin()).collect();
        let v = embedder
            .embed(&probe)
            .context("chạy thử model nhúng giọng lúc nạp thất bại")?;
        ensure!(
            v.iter().all(|x| x.is_finite()),
            "nhúng chạy thử có giá trị không hữu hạn"
        );
        Ok(embedder)
    }

    /// Dựng từ model đã đọc: tách đồ thị từng nút (kiểm đầu vào `x` f32 hạng 3 chiều cuối 80, thứ tự topo, tên trùng, graph
    /// lồng), chuyển trọng số thành tensor một lần. Không chạy thử.
    pub fn from_model(model: ModelProto) -> Result<Self> {
        Ok(Self {
            steps: StepGraph::from_model(model, INPUT, OUTPUT, NUM_BINS)?,
            fbank: Fbank::new(),
        })
    }

    /// Nhúng phần tiếng nói của một đoạn (16 kHz, [-1, 1]); từ `MIN_SAMPLES` mẫu, chỉ dùng `MAX_SAMPLES` mẫu đầu. Lỗi khi đoạn
    /// quá ngắn, khi đoạn không có đặc trưng (`MIN_FEATURE_PEAK`: im lặng, DC, âm tuần hoàn), khi đầu ra không đủ `DIM` chiều
    /// hay có giá trị không hữu hạn (NaN, vô cùng).
    pub fn embed(&self, samples: &[f32]) -> Result<Vec<f32>> {
        ensure!(
            samples.len() >= MIN_SAMPLES,
            "đoạn quá ngắn để nhúng: {} mẫu",
            samples.len()
        );
        let samples = &samples[..samples.len().min(MAX_SAMPLES)];
        let feats = self.fbank.compute(samples);
        let peak = feats.iter().fold(0.0f32, |m, x| m.max(x.abs()));
        ensure!(
            peak >= MIN_FEATURE_PEAK,
            "đoạn không có đặc trưng giọng (tín hiệu dừng: im lặng, DC hay âm tuần hoàn)"
        );
        let frames = feats.len() / NUM_BINS;
        let x = Tensor::from_vec(feats, (1, frames, NUM_BINS), &Device::Cpu)?;
        let v = self.steps.run(x)?.flatten_all()?.to_vec1::<f32>()?;
        ensure!(v.len() == DIM, "nhúng có {} chiều, cần {DIM}", v.len());
        ensure!(
            v.iter().all(|x| x.is_finite()),
            "nhúng có giá trị không hữu hạn (NaN hay vô cùng)"
        );
        Ok(v)
    }

    /// Nhúng theo cửa sổ (cách A của kế hoạch 01). **Chỉ để chạy lại số đo của `results/ram.md`** (`latency-bench embed-probe
    /// --window-s`, `speaker-eval --window-s`); worker không dùng. Chia `MAX_SAMPLES` mẫu đầu thành các cửa sổ `window_samples`
    /// mẫu (phần dư ngắn hơn `MIN_SAMPLES` gộp vào cửa sổ trước), nhúng từng cửa sổ, chuẩn hóa L2 rồi lấy trung bình. Đoạn
    /// không dài hơn một cửa sổ thì cho đúng kết quả của `embed`.
    pub fn embed_windowed(&self, samples: &[f32], window_samples: usize) -> Result<Vec<f32>> {
        ensure!(
            window_samples >= MIN_SAMPLES,
            "cửa sổ {window_samples} mẫu ngắn hơn MIN_SAMPLES ({MIN_SAMPLES})"
        );
        let samples = &samples[..samples.len().min(MAX_SAMPLES)];
        let bounds = window_bounds(samples.len(), window_samples);
        if bounds.len() <= 1 {
            return self.embed(samples);
        }
        let mut sum = vec![0.0f32; DIM];
        for r in &bounds {
            let v = self.embed(&samples[r.clone()])?;
            let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            ensure!(norm.is_finite() && norm > 0.0, "nhúng của cửa sổ {r:?} có chuẩn {norm}");
            for (s, x) in sum.iter_mut().zip(&v) {
                *s += x / norm;
            }
        }
        let n = bounds.len() as f32;
        Ok(sum.into_iter().map(|s| s / n).collect())
    }
}

/// Đọc file model một lần vào RAM: chỉ file thường, tối đa `MAX_MODEL_BYTES` byte. Kiểm loại file trước khi mở (mở một FIFO
/// thì chờ mãi), kiểm lại trên chính file đã mở, và đọc không quá `MAX_MODEL_BYTES + 1` byte phòng file lớn lên giữa chừng. Lỗi về
/// loại và cỡ không chứa đường dẫn.
fn read_model(path: &Path) -> Result<Vec<u8>> {
    const NOT_REGULAR: &str = "model nhúng giọng không phải file thường";
    let meta = std::fs::metadata(path).with_context(|| format!("không đọc được {}", path.display()))?;
    ensure!(meta.is_file(), NOT_REGULAR);
    let file = File::open(path).with_context(|| format!("không đọc được {}", path.display()))?;
    let meta = file.metadata().context("không đọc được thông tin file model")?;
    ensure!(meta.is_file(), NOT_REGULAR);
    ensure!(
        meta.len() <= MAX_MODEL_BYTES,
        "model nhúng giọng quá lớn: {} byte, tối đa {MAX_MODEL_BYTES}",
        meta.len()
    );
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    file.take(MAX_MODEL_BYTES + 1)
        .read_to_end(&mut bytes)
        .context("không đọc được file model")?;
    ensure!(
        bytes.len() as u64 <= MAX_MODEL_BYTES,
        "model nhúng giọng quá lớn: hơn {MAX_MODEL_BYTES} byte"
    );
    Ok(bytes)
}

/// SHA-256 dạng hex chữ thường (như `integrity::sha256_file` của app).
fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .fold(String::with_capacity(64), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        })
}

/// Các cửa sổ `window` mẫu liền nhau phủ đoạn dài `len` mẫu; phần dư ngắn hơn `MIN_SAMPLES` gộp vào cửa sổ trước (nên cửa
/// sổ cuối có thể dài tới `window + MIN_SAMPLES - 1`). Đoạn không dài hơn một cửa sổ cho một cửa sổ. `window` phải > 0.
fn window_bounds(len: usize, window: usize) -> Vec<Range<usize>> {
    let mut bounds: Vec<Range<usize>> = (0..len).step_by(window).map(|a| a..(a + window).min(len)).collect();
    if bounds.len() > 1
        && let Some(last) = bounds.pop_if(|r| r.len() < MIN_SAMPLES)
        && let Some(prev) = bounds.last_mut()
    {
        prev.end = last.end;
    }
    bounds
}

/// Cosine của hai vector cùng số chiều; 0 khi một vector bằng 0.
pub fn cosine(a: &[f32], b: &[f32]) -> f32 {
    debug_assert_eq!(a.len(), b.len(), "nhúng khác số chiều");
    let dot: f32 = a.iter().zip(b).map(|(x, y)| x * y).sum();
    let na = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let nb = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if na == 0.0 || nb == 0.0 { 0.0 } else { dot / (na * nb) }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::*;
    use crate::fbank::tests::read_f32;
    use crate::onnx_steps::StepGraph;
    use candle_onnx::onnx::tensor_shape_proto::Dimension;
    use candle_onnx::onnx::tensor_shape_proto::dimension::Value as Dim;
    use candle_onnx::onnx::{
        AttributeProto, GraphProto, ModelProto, NodeProto, TensorProto, ValueInfoProto, attribute_proto::AttributeType,
        tensor_proto::DataType,
    };
    use candle_onnx::onnx::{TensorShapeProto, TypeProto, type_proto};

    /// Đầu vào `x` của model giả: f32, hình `[N, T, 80]` như ERes2Net.
    fn x_value_info() -> ValueInfoProto {
        let dim = |d: Dim| Dimension {
            value: Some(d),
            ..Default::default()
        };
        ValueInfoProto {
            name: INPUT.to_string(),
            r#type: Some(TypeProto {
                value: Some(type_proto::Value::TensorType(type_proto::Tensor {
                    elem_type: DataType::Float as i32,
                    shape: Some(TensorShapeProto {
                        dim: vec![
                            dim(Dim::DimParam("N".into())),
                            dim(Dim::DimParam("T".into())),
                            dim(Dim::DimValue(NUM_BINS as i64)),
                        ],
                    }),
                })),
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    /// Model giả không cần file: `x (1, T, 80)` nhân `w (80, DIM)`, rồi lấy `reduce_op` (ReduceMax hay ReduceMean) theo thời
    /// gian ra `embedding (1, DIM)`. Dựng qua `from_model` (không chạy thử), để test với trọng số NaN vẫn dựng được.
    fn synthetic_embedder(weights: Vec<f32>, reduce_op: &str) -> Embedder {
        assert_eq!(weights.len(), NUM_BINS * DIM);
        let int_attr = |name: &str, kind: AttributeType, i: i64, ints: Vec<i64>| AttributeProto {
            name: name.to_string(),
            r#type: kind as i32,
            i,
            ints,
            ..Default::default()
        };
        let graph = GraphProto {
            node: vec![
                NodeProto {
                    op_type: "MatMul".to_string(),
                    input: vec![INPUT.to_string(), "w".to_string()],
                    output: vec!["h".to_string()],
                    ..Default::default()
                },
                NodeProto {
                    op_type: reduce_op.to_string(),
                    input: vec!["h".to_string()],
                    output: vec![OUTPUT.to_string()],
                    attribute: vec![
                        int_attr("axes", AttributeType::Ints, 0, vec![1]),
                        int_attr("keepdims", AttributeType::Int, 0, Vec::new()),
                    ],
                    ..Default::default()
                },
            ],
            initializer: vec![TensorProto {
                name: "w".to_string(),
                dims: vec![NUM_BINS as i64, DIM as i64],
                data_type: DataType::Float as i32,
                float_data: weights,
                ..Default::default()
            }],
            input: vec![x_value_info()],
            output: vec![ValueInfoProto {
                name: OUTPUT.to_string(),
                ..Default::default()
            }],
            ..Default::default()
        };
        Embedder::from_model(ModelProto {
            graph: Some(graph),
            ..Default::default()
        })
        .unwrap()
    }

    fn finite_weights() -> Vec<f32> {
        (0..NUM_BINS * DIM).map(|i| ((i % 7) as f32 - 3.0) * 0.01).collect()
    }

    /// Tiếng nói giả có tần số trôi dần, dài `len` mẫu.
    fn chirp(len: usize) -> Vec<f32> {
        (0..len)
            .map(|i| 0.3 * (i as f32 * (0.02 + i as f32 * 1e-6)).sin())
            .collect()
    }

    #[test]
    fn cosine_of_parallel_orthogonal_and_opposite_vectors() {
        assert!((cosine(&[1.0, 2.0], &[2.0, 4.0]) - 1.0).abs() < 1e-6);
        assert!(cosine(&[1.0, 0.0], &[0.0, 3.0]).abs() < 1e-6);
        assert!((cosine(&[1.0, 0.0], &[-1.0, 0.0]) + 1.0).abs() < 1e-6);
        assert_eq!(cosine(&[0.0, 0.0], &[1.0, 0.0]), 0.0);
    }

    #[cfg(debug_assertions)]
    #[test]
    #[should_panic(expected = "nhúng khác số chiều")]
    fn cosine_of_vectors_with_different_lengths_panics_in_debug() {
        cosine(&[1.0, 0.0, 0.0], &[1.0, 0.0]);
    }

    #[test]
    fn loading_a_missing_file_fails_and_names_the_path() {
        let path = Path::new("/khong/co/thu/muc/nay/eres2net.onnx");
        let err = Embedder::load(path).err().expect("file không tồn tại phải báo lỗi");
        assert!(
            err.to_string().contains("/khong/co/thu/muc/nay/eres2net.onnx"),
            "{err:#}"
        );
    }

    #[test]
    fn embed_returns_an_embedding_of_dim_values_and_rejects_short_input() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let v = e.embed(&chirp(16_000)).unwrap();
        assert_eq!(v.len(), DIM);
        assert!(v.iter().all(|x| x.is_finite()));
        assert!(e.embed(&chirp(MIN_SAMPLES - 1)).is_err());
    }

    #[test]
    fn embed_rejects_a_non_finite_output() {
        let mut weights = finite_weights();
        weights[0] = f32::NAN;
        // Dùng ReduceMean vì nó lan NaN từ bất kỳ khung nào. ReduceMax của candle (CPU) so sánh bằng `<`, mà NaN không bao giờ
        // thắng phép so sánh, nên chỉ giữ NaN khi nó nằm ở khung đầu (giá trị khởi tạo), còn NaN ở khung khác bị bỏ qua: đã
        // thử `max_keepdim` trên [NaN, 1, 2] cho NaN nhưng trên [1, NaN, 2] và [1, 2, NaN] cho 2. Ở test này NaN nằm trong
        // trọng số nên mọi khung đều NaN và ReduceMax cũng cho NaN (đã thử); ReduceMean chỉ để test không phụ thuộc chuyện đó.
        let e = synthetic_embedder(weights, "ReduceMean");
        let err = e.embed(&chirp(16_000)).expect_err("đầu ra NaN phải bị từ chối");
        assert!(err.to_string().contains("không hữu hạn"), "{err:#}");
    }

    /// Tín hiệu dừng (im lặng, DC, âm tuần hoàn có chu kỳ chia hết bước khung) cho đặc trưng gần như toàn 0 sau khi trừ trung
    /// bình theo thời gian, nên mọi đoạn như vậy cho cùng một vector "ma": phải lỗi, để worker không mở giọng cho chúng.
    #[test]
    fn embed_rejects_a_segment_without_features() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let n = 32_000;
        let lsb = 1.0 / i16::MAX as f32;
        let square: Vec<f32> = (0..n).map(|i| if (i / 16) % 2 == 0 { 1.0 } else { -1.0 }).collect();
        let alternating: Vec<f32> = (0..n).map(|i| if i % 2 == 0 { lsb } else { -lsb }).collect();
        for (name, samples) in [
            ("im lặng", vec![0.0; n]),
            ("DC dương", vec![1.0; n]),
            ("DC âm", vec![-1.0; n]),
            ("sóng vuông chu kỳ 32 mẫu", square),
            ("xen kẽ ±1 LSB", alternating),
            // Dài hơn MAX_SAMPLES: sai số làm tròn của phép trừ trung bình lớn nhất ở độ dài này.
            ("im lặng 10 s", vec![0.0; MAX_SAMPLES + 32_000]),
        ] {
            let err = e.embed(&samples).expect_err(name);
            assert!(err.to_string().contains("không có đặc trưng"), "{name}: {err:#}");
        }
        // Tiếng nói giả (tần số trôi) vẫn nhúng được, kể cả khi rất nhỏ: biên độ 30 LSB sau khi lượng tử về i16.
        assert!(e.embed(&chirp(n)).is_ok());
        let pcm: Vec<i16> = chirp(n).iter().map(|x| (x / 0.3 * 30.0).round() as i16).collect();
        assert!(e.embed(&speaker_protocol::f32_from_pcm(&pcm)).is_ok());
    }

    #[test]
    fn embed_uses_only_the_first_max_samples() {
        // `MAX_SAMPLES` (8 s) là lưới an toàn của chính `embed`; giao thức chỉ mang tối đa 4 s
        // (`speaker_protocol::MAX_EMBED_SAMPLES`).
        assert_eq!(MAX_SAMPLES, 16_000 * 8);
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let long = chirp(MAX_SAMPLES + 32_000);
        let head = e.embed(&long[..MAX_SAMPLES]).unwrap();
        // Phần quá MAX_SAMPLES không ảnh hưởng...
        let mut changed_tail = long.clone();
        changed_tail[MAX_SAMPLES..].fill(0.0);
        assert_eq!(e.embed(&long).unwrap(), head);
        assert_eq!(e.embed(&changed_tail).unwrap(), head);
        // ...còn phần đầu thì có (để chắc rằng phép so sánh trên có nghĩa).
        let mut changed_head = long.clone();
        changed_head[..16_000].fill(0.0);
        assert_ne!(e.embed(&changed_head).unwrap(), head);
    }

    #[test]
    fn window_bounds_splits_and_merges_a_short_last_window() {
        // Không dài hơn một cửa sổ: một cửa sổ cả đoạn.
        assert_eq!(window_bounds(20_000, 32_000), vec![0..20_000]);
        assert_eq!(window_bounds(32_000, 32_000), vec![0..32_000]);
        // Chia đều.
        assert_eq!(window_bounds(64_000, 32_000), vec![0..32_000, 32_000..64_000]);
        // Phần dư đủ MIN_SAMPLES: thành cửa sổ riêng.
        assert_eq!(
            window_bounds(64_000 + MIN_SAMPLES, 32_000),
            vec![0..32_000, 32_000..64_000, 64_000..64_000 + MIN_SAMPLES]
        );
        // Phần dư thiếu một mẫu: gộp vào cửa sổ trước, cửa sổ đó dài hơn `window`.
        assert_eq!(
            window_bounds(64_000 + MIN_SAMPLES - 1, 32_000),
            vec![0..32_000, 32_000..64_000 + MIN_SAMPLES - 1]
        );
        // Đoạn chỉ hơn một cửa sổ chút ít: phần dư gộp vào cửa sổ đầu, còn một cửa sổ.
        assert_eq!(window_bounds(32_000 + 10, 32_000), vec![0..32_010]);
        // Một cửa sổ duy nhất ngắn hơn MIN_SAMPLES vẫn giữ nguyên (không có cửa sổ trước để gộp, không được mất).
        assert_eq!(window_bounds(5_000, 32_000), vec![0..5_000]);
    }

    /// Trung bình các vector đã chuẩn hóa L2, tính tay để so với `embed_windowed`.
    fn mean_of_normalized(vectors: &[Vec<f32>]) -> Vec<f32> {
        let mut sum = vec![0.0f32; DIM];
        for v in vectors {
            let norm = v.iter().map(|x| x * x).sum::<f32>().sqrt();
            for (s, x) in sum.iter_mut().zip(v) {
                *s += x / norm;
            }
        }
        sum.iter().map(|s| s / vectors.len() as f32).collect()
    }

    fn assert_close(a: &[f32], b: &[f32]) {
        assert_eq!(a.len(), b.len());
        for (i, (x, y)) in a.iter().zip(b).enumerate() {
            assert!((x - y).abs() <= 1e-6, "chiều {i}: {x} khác {y}");
        }
    }

    #[test]
    fn embed_windowed_averages_the_normalized_embeddings_of_each_window() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let window = 16_000;
        // Ba cửa sổ đầy đủ.
        let x = chirp(3 * window);
        let parts: Vec<Vec<f32>> = (0..3)
            .map(|i| e.embed(&x[i * window..(i + 1) * window]).unwrap())
            .collect();
        assert_close(&e.embed_windowed(&x, window).unwrap(), &mean_of_normalized(&parts));

        // Phần dư MIN_SAMPLES - 1 mẫu gộp vào cửa sổ thứ hai: hai cửa sổ, không phải ba.
        let x = chirp(2 * window + MIN_SAMPLES - 1);
        let merged = [e.embed(&x[..window]).unwrap(), e.embed(&x[window..]).unwrap()];
        let got = e.embed_windowed(&x, window).unwrap();
        assert_close(&got, &mean_of_normalized(&merged));
        // Để chắc phép so trên có nghĩa: hai cửa sổ đầy đủ (bỏ phần dư) cho kết quả khác.
        let unmerged = [e.embed(&x[..window]).unwrap(), e.embed(&x[window..2 * window]).unwrap()];
        assert_ne!(got, mean_of_normalized(&unmerged));
    }

    #[test]
    fn embed_windowed_equals_embed_when_the_segment_fits_in_one_window() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        for len in [MIN_SAMPLES, 20_000, 32_000] {
            let x = chirp(len);
            assert_eq!(e.embed_windowed(&x, 32_000).unwrap(), e.embed(&x).unwrap(), "len {len}");
        }
    }

    #[test]
    fn embed_windowed_rejects_short_input_and_a_window_shorter_than_min_samples() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        assert!(e.embed_windowed(&chirp(MIN_SAMPLES - 1), 32_000).is_err());
        let err = e.embed_windowed(&chirp(32_000), MIN_SAMPLES - 1).unwrap_err();
        assert!(err.to_string().contains("cửa sổ"), "{err:#}");
    }

    #[test]
    fn embed_windowed_accepts_a_window_of_exactly_min_samples() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let x = chirp(4 * MIN_SAMPLES);
        let parts: Vec<Vec<f32>> = (0..4)
            .map(|i| e.embed(&x[i * MIN_SAMPLES..(i + 1) * MIN_SAMPLES]).unwrap())
            .collect();
        assert_close(&e.embed_windowed(&x, MIN_SAMPLES).unwrap(), &mean_of_normalized(&parts));
    }

    #[test]
    fn embed_windowed_uses_only_the_first_max_samples() {
        let e = synthetic_embedder(finite_weights(), "ReduceMax");
        let long = chirp(MAX_SAMPLES + 32_000);
        assert_eq!(
            e.embed_windowed(&long, 32_000).unwrap(),
            e.embed_windowed(&long[..MAX_SAMPLES], 32_000).unwrap()
        );
    }

    /// Cần model thật: `SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx cargo test -p speaker-worker -- --ignored`.
    /// Chạy trên luồng stack 16 MiB để phòng xa cho Windows (xem đầu file): trên macOS đã đo, stack 1 MiB đủ cho đoạn 8 s ở
    /// bản debug; Windows chưa đo.
    #[test]
    #[ignore]
    fn embedding_matches_onnxruntime() {
        let path = std::env::var("SPEAKER_MODEL").expect("đặt SPEAKER_MODEL");
        std::thread::Builder::new()
            .stack_size(16 << 20)
            .spawn(move || {
                let e = Embedder::load(std::path::Path::new(&path)).unwrap();
                let signal = read_f32("signal.f32");
                let ours = e.embed(&signal).unwrap();
                let reference = read_f32("embed_ref.f32");
                assert_eq!(ours.len(), DIM);
                let c = cosine(&ours, &reference);
                assert!(c >= 0.999, "cosine {c}");
                assert!(e.embed(&[0.0; MIN_SAMPLES - 1]).is_err());
                // Im lặng và DC: model thật cũng cho một vector "ma" hữu hạn, nên `embed` phải từ chối trước khi tới model.
                for flat in [0.0f32, 1.0] {
                    let err = e.embed(&vec![flat; 16_000]).expect_err("tín hiệu dừng phải lỗi");
                    assert!(err.to_string().contains("không có đặc trưng"), "{err:#}");
                }

                // Tín hiệu dài hơn MAX_SAMPLES (lặp fixture cho đủ 10 s): chỉ phần đầu MAX_SAMPLES mẫu được dùng.
                let long: Vec<f32> = signal.iter().copied().cycle().take(16_000 * 10).collect();
                assert!(long.len() > MAX_SAMPLES);
                let head = e.embed(&long[..MAX_SAMPLES]).unwrap();
                let truncated = e.embed(&long).unwrap();
                let c = cosine(&truncated, &head);
                assert!(c >= 0.99999, "cosine giữa embed(10 s) và embed(MAX_SAMPLES đầu) {c}");
            })
            .unwrap()
            .join()
            .unwrap();
    }

    /// Cần model thật (như test trên). In cosine giữa nhúng theo cửa sổ 2 s và nhúng cả đoạn 6 s (fixture lặp lại); không đặt
    /// ngưỡng, vì fixture là tín hiệu tổng hợp. Số đo trên tiếng nói thật: `latency-bench embed-probe --window-s`.
    #[test]
    #[ignore]
    fn windowed_embedding_against_the_whole_segment() {
        let path = std::env::var("SPEAKER_MODEL").expect("đặt SPEAKER_MODEL");
        std::thread::Builder::new()
            .stack_size(16 << 20)
            .spawn(move || {
                let e = Embedder::load(std::path::Path::new(&path)).unwrap();
                let long: Vec<f32> = read_f32("signal.f32").into_iter().cycle().take(16_000 * 6).collect();
                let whole = e.embed(&long).unwrap();
                let windowed = e.embed_windowed(&long, 16_000 * 2).unwrap();
                assert_eq!(windowed.len(), DIM);
                println!("cosine(cửa sổ 2 s, cả đoạn 6 s) = {:.6}", cosine(&windowed, &whole));
            })
            .unwrap()
            .join()
            .unwrap();
    }

    /// Cần model thật: `SPEAKER_MODEL=$DATA/models/eres2net-sv-en-voxceleb-16k.onnx cargo test -p speaker-worker --release --
    /// --ignored steps_match`. Cách B' (từng nút) cho nhúng giống hệt từng bit `simple_eval` cả đồ thị ở 1, 2, 4, 8 s (spec §4.1).
    /// Chạy lại mỗi lần nâng candle-onnx (B' dựa vào hành vi chưa ghi thành tài liệu, xem `onnx_steps`).
    #[test]
    #[ignore]
    fn steps_match_simple_eval_on_the_real_model() {
        let path = std::env::var("SPEAKER_MODEL").expect("đặt SPEAKER_MODEL");
        std::thread::Builder::new()
            .stack_size(16 << 20)
            .spawn(move || {
                let model = candle_onnx::read_file(&path).unwrap();
                let steps = StepGraph::from_model(model.clone(), INPUT, OUTPUT, NUM_BINS).unwrap();
                let fbank = Fbank::new();
                let signal = read_f32("signal.f32");
                for seconds in [1usize, 2, 4, 8] {
                    let samples: Vec<f32> = signal.iter().copied().cycle().take(16_000 * seconds).collect();
                    let feats = fbank.compute(&samples);
                    let frames = feats.len() / NUM_BINS;
                    let x = Tensor::from_vec(feats, (1, frames, NUM_BINS), &Device::Cpu).unwrap();
                    let whole = candle_onnx::simple_eval(&model, HashMap::from([(INPUT.to_string(), x.clone())]))
                        .unwrap()
                        .remove(OUTPUT)
                        .unwrap();
                    let ours = steps.run(x).unwrap();
                    let bits = |t: &Tensor| -> Vec<u32> {
                        t.flatten_all()
                            .unwrap()
                            .to_vec1::<f32>()
                            .unwrap()
                            .iter()
                            .map(|v| v.to_bits())
                            .collect()
                    };
                    assert_eq!(bits(&ours), bits(&whole), "{seconds} s");
                }
            })
            .unwrap()
            .join()
            .unwrap();
    }

    /// Worker băm đúng các byte nó đọc rồi mới đưa chúng vào bộ đọc protobuf (spec 2026-10-26-phan-biet-nguoi-noi §10): file bị
    /// thay sau lúc app kiểm thì bị từ chối.
    #[test]
    fn a_model_that_does_not_match_the_checked_sha256_is_refused() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        let path = std::env::temp_dir().join(format!("speaker-worker-sha-{}.onnx", std::process::id()));
        std::fs::write(&path, b"khong phai onnx").unwrap();
        let wrong = "0".repeat(64);
        let err = Embedder::load_checked(&path, Some(&wrong))
            .err()
            .expect("SHA-256 khác phải lỗi");
        assert!(format!("{err:#}").contains("SHA-256"), "{err:#}");
        // Đúng SHA-256 thì qua bước băm, rồi lỗi ở bước đọc model (byte không phải ONNX có graph).
        let right = sha256_hex(b"khong phai onnx");
        let err = Embedder::load_checked(&path, Some(&right))
            .err()
            .expect("byte không phải ONNX phải lỗi");
        assert!(!format!("{err:#}").contains("SHA-256"), "{err:#}");
        let _ = std::fs::remove_file(&path);
    }

    /// Kho model có file GGUF nhiều GB: đường dẫn trỏ nhầm (hay vào thư mục, thiết bị) bị từ chối trước khi đọc vào RAM. Lỗi
    /// không chứa đường dẫn (có thể có tên thư mục người dùng).
    #[test]
    fn only_a_regular_file_of_at_most_max_model_bytes_is_read() {
        let dir = std::env::temp_dir().join(format!("speaker-worker-size-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let dir_text = dir.display().to_string();

        let err = Embedder::load(&dir).err().expect("thư mục phải lỗi");
        assert!(format!("{err:#}").contains("không phải file thường"), "{err:#}");
        assert!(!format!("{err:#}").contains(&dir_text), "{err:#}");
        #[cfg(unix)]
        {
            let err = Embedder::load(Path::new("/dev/null")).err().expect("thiết bị phải lỗi");
            assert!(format!("{err:#}").contains("không phải file thường"), "{err:#}");
        }

        // File thưa (không tốn đĩa) hơn MAX_MODEL_BYTES một byte: từ chối theo cỡ, trước khi băm.
        let big = dir.join("big.onnx");
        std::fs::File::create(&big)
            .unwrap()
            .set_len(MAX_MODEL_BYTES + 1)
            .unwrap();
        let err = Embedder::load_checked(&big, Some(&"0".repeat(64)))
            .err()
            .expect("file quá lớn phải lỗi");
        assert!(format!("{err:#}").contains("quá lớn"), "{err:#}");
        assert!(!format!("{err:#}").contains(&dir_text), "{err:#}");
        // Đúng MAX_MODEL_BYTES: được đọc và băm (SHA-256 sai thì lỗi ở bước băm, không phải ở giới hạn cỡ).
        std::fs::File::create(&big).unwrap().set_len(MAX_MODEL_BYTES).unwrap();
        let err = Embedder::load_checked(&big, Some(&"0".repeat(64)))
            .err()
            .expect("SHA-256 sai phải lỗi");
        assert!(format!("{err:#}").contains("SHA-256"), "{err:#}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn min_samples_follows_the_protocol() {
        assert_eq!(MIN_SAMPLES, speaker_protocol::MIN_EMBED_MS as usize * 16);
        assert_eq!(MIN_SAMPLES, 8_000);
    }
}
