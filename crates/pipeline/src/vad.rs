//! Silero VAD chạy bằng candle-onnx trong tiến trình chính (spec §6.3).
//! Mỗi lần gọi nhận 512 mẫu 16 kHz, ghép thêm 64 mẫu cuối của khung trước làm ngữ cảnh.

use crate::segmenter::FRAME_SAMPLES;
use anyhow::{Context, Result, ensure};
use candle_core::{DType, Device, Tensor};
use std::collections::HashMap;
use std::path::Path;

const CONTEXT_SAMPLES: usize = 64;
const SAMPLE_RATE: i64 = 16_000;
// Tên input và output của silero_vad.onnx v6.2.3.
const INPUT: &str = "input";
const STATE: &str = "state";
const SR: &str = "sr";
const OUTPUT: &str = "output";
const STATE_OUT: &str = "stateN";

pub struct SileroVad {
    model: candle_onnx::onnx::ModelProto,
    state: Tensor,
    context: Vec<f32>,
    device: Device,
}

impl SileroVad {
    pub fn load(path: &Path) -> Result<Self> {
        let model = candle_onnx::read_file(path).with_context(|| format!("không đọc được {}", path.display()))?;
        let graph = model.graph.as_ref().context("model ONNX không có graph")?;
        for name in [INPUT, STATE, SR] {
            ensure!(
                graph.input.iter().any(|i| i.name == name),
                "model không có input `{name}`"
            );
        }
        for name in [OUTPUT, STATE_OUT] {
            ensure!(
                graph.output.iter().any(|o| o.name == name),
                "model không có output `{name}`"
            );
        }
        let device = Device::Cpu;
        let mut vad = Self {
            model,
            state: Tensor::zeros((2, 1, 128), DType::F32, &device)?,
            context: vec![0.0; CONTEXT_SAMPLES],
            device,
        };
        // Chạy thử một khung im lặng, để model sai định dạng hay op không được hỗ trợ lộ ra ngay lúc nạp.
        let p = vad.prob(&[0.0; FRAME_SAMPLES])?;
        ensure!((0.0..=1.0).contains(&p), "xác suất ngoài khoảng [0, 1]: {p}");
        ensure!(
            vad.state.dims() == [2, 1, 128],
            "state có kích thước lạ: {:?}",
            vad.state.dims()
        );
        vad.reset()?;
        Ok(vad)
    }

    /// Xóa state và ngữ cảnh. Gọi khi bắt đầu phiên, và khi luồng khung bị đứt (dừng rồi tiếp tục, đổi thiết bị),
    /// cùng lúc với việc tạo `Segmenter` mới. Không cần gọi sau khoảng im lặng dài: state tự hội tụ.
    pub fn reset(&mut self) -> Result<()> {
        self.state = Tensor::zeros((2, 1, 128), DType::F32, &self.device)?;
        self.context = vec![0.0; CONTEXT_SAMPLES];
        Ok(())
    }

    /// Xác suất có tiếng nói của một khung 512 mẫu. Khung cuối thiếu mẫu thì đệm 0 cho đủ rồi mới gọi.
    pub fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        ensure!(
            frame.len() == FRAME_SAMPLES,
            "khung VAD phải có {FRAME_SAMPLES} mẫu, nhận {}",
            frame.len()
        );
        let mut input = Vec::with_capacity(CONTEXT_SAMPLES + FRAME_SAMPLES);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(frame);
        let inputs = HashMap::from([
            (
                INPUT.to_string(),
                Tensor::from_vec(input, (1, CONTEXT_SAMPLES + FRAME_SAMPLES), &self.device)?,
            ),
            (STATE.to_string(), self.state.clone()),
            (SR.to_string(), Tensor::new(SAMPLE_RATE, &self.device)?),
        ]);
        let mut outputs = candle_onnx::simple_eval(&self.model, inputs)?;
        // candle-onnx dựng trọng số LSTM bằng `Var`, nên state trả về còn kéo theo đồ thị tính của mọi khung trước.
        // Không `detach` thì mỗi khung giữ thêm khoảng 0,5 MB, và việc hủy chuỗi đó làm tràn stack sau vài phút.
        self.state = outputs.remove(STATE_OUT).context("thiếu output state")?.detach();
        self.context.copy_from_slice(&frame[FRAME_SAMPLES - CONTEXT_SAMPLES..]);
        let prob = outputs.remove(OUTPUT).context("thiếu output xác suất")?;
        prob.flatten_all()?
            .to_vec1::<f32>()?
            .first()
            .copied()
            .context("output xác suất rỗng")
    }
}
