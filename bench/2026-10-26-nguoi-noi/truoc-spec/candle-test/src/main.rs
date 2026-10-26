use candle_core::{Device, Tensor};
use std::collections::HashMap;
use std::time::Instant;

fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let model = candle_onnx::read_file(&args[1])?;
    let feats = Tensor::read_npy(&args[2])?; // [1, T, 80] f32
    let input_name = model.graph.as_ref().unwrap().input[0].name.clone();
    let mut times = vec![];
    let mut out = None;
    for _ in 0..5 {
        let mut inputs = HashMap::new();
        inputs.insert(input_name.clone(), feats.clone());
        let t0 = Instant::now();
        let mut res = candle_onnx::simple_eval(&model, inputs)?;
        times.push(t0.elapsed().as_secs_f64() * 1000.0);
        let name = model.graph.as_ref().unwrap().output[0].name.clone();
        out = Some(res.remove(&name).unwrap());
    }
    let out = out.unwrap();
    println!("shape {:?}, ms {:?}", out.shape(), times);
    out.to_device(&Device::Cpu)?.write_npy(&args[3])?;
    Ok(())
}
