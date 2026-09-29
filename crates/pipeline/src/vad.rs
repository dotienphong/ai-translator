//! Silero VAD chạy bằng candle-onnx trong tiến trình chính (spec §6.3).
//! Mỗi lần gọi nhận 512 mẫu 16 kHz, ghép thêm 64 mẫu cuối của khung trước làm ngữ cảnh.

use crate::segmenter::FRAME_SAMPLES;
use anyhow::{Context, Result, bail};
use candle_core::{DType, Device, Tensor};
use std::collections::HashMap;
use std::path::Path;

const CONTEXT_SAMPLES: usize = 64;
const SAMPLE_RATE: i64 = 16_000;

pub struct SileroVad {
    model: candle_onnx::onnx::ModelProto,
    input_name: String,
    state_name: String,
    sr_name: String,
    prob_output: String,
    state_output: String,
    state: Tensor,
    context: Vec<f32>,
    device: Device,
}

impl SileroVad {
    pub fn load(path: &Path) -> Result<Self> {
        let model = candle_onnx::read_file(path).with_context(|| format!("không đọc được {}", path.display()))?;
        let graph = model.graph.as_ref().context("model ONNX không có graph")?;
        let find_input = |key: &str| {
            graph
                .input
                .iter()
                .map(|i| i.name.clone())
                .find(|n| n == key || n.contains(key))
                .with_context(|| format!("không thấy input {key}"))
        };
        let input_name = find_input("input")?;
        let state_name = find_input("state")?;
        let sr_name = find_input("sr")?;
        if graph.output.len() < 2 {
            bail!("model Silero phải có 2 output (xác suất, state)");
        }
        let prob_output = graph.output[0].name.clone();
        let state_output = graph.output[1].name.clone();
        let device = Device::Cpu;
        let state = Tensor::zeros((2, 1, 128), DType::F32, &device)?;
        Ok(Self {
            model,
            input_name,
            state_name,
            sr_name,
            prob_output,
            state_output,
            state,
            context: vec![0.0; CONTEXT_SAMPLES],
            device,
        })
    }

    pub fn reset(&mut self) -> Result<()> {
        self.state = Tensor::zeros((2, 1, 128), DType::F32, &self.device)?;
        self.context = vec![0.0; CONTEXT_SAMPLES];
        Ok(())
    }

    /// Xác suất có tiếng nói của một khung 512 mẫu.
    pub fn prob(&mut self, frame: &[f32]) -> Result<f32> {
        if frame.len() != FRAME_SAMPLES {
            bail!("khung VAD phải có {FRAME_SAMPLES} mẫu, nhận {}", frame.len());
        }
        let mut input = Vec::with_capacity(CONTEXT_SAMPLES + FRAME_SAMPLES);
        input.extend_from_slice(&self.context);
        input.extend_from_slice(frame);
        let inputs = HashMap::from([
            (
                self.input_name.clone(),
                Tensor::from_vec(input, (1, CONTEXT_SAMPLES + FRAME_SAMPLES), &self.device)?,
            ),
            (self.state_name.clone(), self.state.clone()),
            (self.sr_name.clone(), Tensor::new(SAMPLE_RATE, &self.device)?),
        ]);
        let mut outputs = candle_onnx::simple_eval(&self.model, inputs)?;
        self.state = outputs.remove(&self.state_output).context("thiếu output state")?;
        self.context.copy_from_slice(&frame[FRAME_SAMPLES - CONTEXT_SAMPLES..]);
        let prob = outputs.remove(&self.prob_output).context("thiếu output xác suất")?;
        Ok(prob.flatten_all()?.to_vec1::<f32>()?[0])
    }
}
